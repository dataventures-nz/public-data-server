import {mongo} from './databases.mjs'
import fetch from 'node-fetch'

export const generateId = (_id, _ids) => {
  if (_ids.length == 0) {
    return _id
  } else {
    let x = 1
    console.log("creating", _id, "but there is already ", _ids, "so we need to look for non collisions.")
    while (_ids.includes(_id + '_' + x)) {
      x++
    }
    return _id+ '_' + x
  }
}

// TODO: can give dupes under obsure conditions - fixed.
export const resolveTag = async (nickname) => {
  let _id = '@' + nickname.replace(/\s+/g,"_")
  let _ids = await mongo.db("control").collection("security").find({_id:{$regex: '^' + _id }}).toArray()
  return generateId(_id, _ids)
}

export const checkLongActingToken = async (req, res, next) => {
  const lToken = req.header('ltoken')
  const token_record = await mongo.db("control").collection("tokens").findOne({_id:lToken})
  // console.log({token_record})
  let user = await mongo.db("control").collection("security").findOne({_id:token_record.user})
  // console.log({user})
  if (!user) {
    next(Error("bad long acting token"))
  } else {
    req.dbUser = user
    next()  
  }
}

export const addUser = async (req,res,next) => {
  console.log("add user called, version 1.05", req.user)
  if (req.dbUser) {
    next()
  }
  if (req?.user?.sub) {
    const sub = req.user.sub
    let user = await mongo.db("control").collection("security").findOne({sub})    
    if (!user) {
      const auth0Request = await fetch(req.user.aud[1], {headers:{"Authorization":req.header('Authorization'), "Content-Type": "application/json"}})
      const auth0User = await auth0Request.json()
      const _id = await resolveTag(auth0User.nickname)
      user = {
        _id,
        sub,
        type:'user',
        collectionCreator:false,
        name:auth0User.name,
        email:auth0User.email,
        nickname:auth0User.nickname,
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
    req.dbUser = user
  }
  next()
}
