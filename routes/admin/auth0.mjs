import dotenv from 'dotenv'
import {resolveTag} from '../../libs/addUser.mjs'
import crypto from 'crypto'
import fetch from 'node-fetch'
import {addParent} from './admin.mjs'
dotenv.config()
import {mongo} from '../../libs/databases.mjs'
import {welcomeToHavingAnAccount} from '../../libs/email.mjs'
const {AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET} = process.env

// const emailUser = (user) => {
// }

// const assignUserToTags = (access_token, user, tags) => {
//   // we still don't know which sub the user is, so.....
//   const options = {
//     method: 'GET',
//     url: `https://${AUTH0_DOMAIN}/api/v2/users?q=email:"${user.email}"`,
//     headers: { 
//       'content-type': 'application/json',
//       'Authorization': `Bearer ${access_token}`
//     }
//   }
//   request(options, (error, response, body) => {
//     const auth0User = body[0]
//     const sub = body?.user_id
//     // this is where I am up to.
//   })
// }

const generatePassword = () => {
  return crypto.randomBytes(10).toString('hex') +"X!";
}

const createAuth0User = async (admin, access_token, user) => {
  // adds user to auth0
  user.password = generatePassword()
  // console.log("password", user.password)
  const response = await fetch(`https://${AUTH0_DOMAIN}/api/v2/users`, {
    method: 'POST',
    body: JSON.stringify({
      password:user.password,
      name:user.name,
      email:user.email,
      nickname: user.nickname,
      connection:"Username-Password-Authentication"
    }),
    headers: {
      'content-type': 'application/json',
      'Authorization': `Bearer ${access_token}`
    }
  })
  const result = await response.json()
  console.log(result)
  welcomeToHavingAnAccount(user.email, user.password, user.nickname)
  // error handling?
}

const getUserFromEmail = async (access_token, email) => {
  const encodedEmail = encodeURIComponent(email)
  const response = await fetch(`https://${AUTH0_DOMAIN}/api/v2/users-by-email?email=${encodedEmail}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${access_token}`
    }
  })
  const data = await response.json()
  console.log("WOT?", data)
  return data?.filter(d => d.email == email)?.[0]
}

//  const processUser = (admin, access_token, user) => {
//   const options = {
//     method: 'GET',
//     url: `https://${AUTH0_DOMAIN}/api/v2/users?q=email:"${user.email}"`,
//     headers: { 
//       'content-type': 'application/json',
//       'Authorization': `Bearer ${access_token}`
//     }
//   }
//   request(options, (error, response, body) => {
//     if (body?.[0]?.user_id) {
//       assignUserToTags(admin, user, tags)
//     } else {
//       addUser(admin, access_token, user)
//     }
//   })
// }

const getAccessToken = async () => {
  const response = await fetch(`https://${AUTH0_DOMAIN}/oauth/token`, {
    method: 'POST',
    body: `{
      "client_id":"${AUTH0_CLIENT_ID}",
      "client_secret":"${AUTH0_CLIENT_SECRET}",
      "audience":"https://${AUTH0_DOMAIN}/api/v2/",
      "grant_type":"client_credentials"
    }`,
    headers: {'Content-Type': 'application/json'}
  });
  const data = await response.json();
  return data.access_token
}

export const pushUsersToAuth0 = async (admin, users, tags) => {
  const access_token = await getAccessToken()
  
  const results = {
    added_users:[],
    grouped_users:[],
    failures:[]
  };

  for (let user of users) {
    console.log("add a user, yes.... ", JSON.stringify(user))
    // screw yoda programming, at this point there is a try, because batching.
    try {
      var auth0_user = await getUserFromEmail(access_token, user.email)
      console.log("auth0_user?", JSON.stringify(auth0_user??{}))
      if (!auth0_user) {
        await createAuth0User(admin,access_token,user)
        auth0_user = await getUserFromEmail(access_token, user.email)
        results.added_users.push({name: user.name, nickname: user.nickname, email: user.email})
      }
      console.log("auth0_user!", JSON.stringify(auth0_user??{}))
      
      // at this point we have an auth0 user, either found or created and then found.
      // now we need a localDB user.
      const dbUser = await findOrAddUserToDV(auth0_user.user_id, user.name, user.email, user.nickname)
      await Promise.all(tags.map(async (tag) => {
        try {
          await addParent(admin, dbUser._id, tag)
          results.grouped_users.push({
            user:{name: user.name, nickname: user.nickname, email: user.email},
            tag
          })
        } catch (ex) {
          console.log("Failure! with tag", ex, tag)
          results.failures.push({user, tag, reason:ex})
        }
      })
    )
    } catch (ex) {
      console.log("Failure!", ex)
      results.failures.push({user, reason:ex})
    }
  }
  return results
}

const findOrAddUserToDV = async (sub, name, email, nickname) => {
  let user = await mongo.db("control").collection("security").findOne({sub})    
  if (!user) {
    const _id = await resolveTag(nickname)
    user = {
      _id,
      sub,
      type:'user',
      collectionCreator:false,
      name,
      email,
      nickname,
      admins:[],
      parents:["#EVERYONE"], // this is so we don't have to handle orphans.
      restrictions:{}
    }
    try {
      await mongo.db("control").collection("security").insertOne(user, {writeConcern: {w:"majority", wtimeout : 1000}}) // this is because more than one thread can be here at once.
    } catch (error) {
      console.log("expected fault, likely race condition because more than one record was added, we should use the one the other thread added")
      user = await mongo.db("control").collection("security").findOne({sub}, {writeConcern: {w:"majority", wtimeout : 1000}})
      if (!user) {
        console.error("ok, shit actually went wrong", error, user)
        throw error
      }
    }
    // await mongo.db("control").collection("security").insertOne(user)
    await mongo.db("control").collection("security").updateOne({_id:"#EVERYONE"},{$addToSet:{children:_id}}) // this is so we don't have to handle orphans.
  }
  return user
}
