import {mongo} from '../../libs/databases.mjs'
import {deepMap} from '../../libs/deepMap.mjs'
import {sendApprovalRequest} from '../../libs/email.mjs'
import {pushUsersToAuth0} from './auth0.mjs'
// TODO: tags, databases, collection CAN'T HAVE DOTS IN their names.

const all_parents_query = (node_ids) => ([
  {$match: {_id: {$in:node_ids}}},
  {$graphLookup: {
      from: "security",
      startWith: "$parents",
      connectFromField: "parents",
      connectToField: "_id",
      as: "path",
      maxDepth: 20
  }},
  {$unwind: "$path"},
  {$replaceRoot: {newRoot: "$path"}},
  {$group:{
    _id:"$_id",
    record:{$first:"$$ROOT"}
  }},
  {$unwind: "$record"},
  {$replaceRoot: {newRoot: "$record"}},
])

const all_children_query = (node_ids) => ([
  {$match: {_id: {$in:node_ids}}},
  {$graphLookup: {
      from: "security",
      startWith: "$_id",
      connectFromField: "children",
      connectToField: "_id",
      as: "path",
      maxDepth: 20
  }},
  {$unwind: "$path"},
  {$replaceRoot: {newRoot: "$path"}},
  {$group:{
    _id:"$_id",
    record:{$first:"$$ROOT"}
  }},
  {$unwind: "$record"},
  {$replaceRoot: {newRoot: "$record"}},
])

const toArray = (x) => (x instanceof Array)?x:[x]

export const getAllParents = node_ids => mongo.db('control').collection("security").aggregate(all_parents_query(toArray(node_ids)))
export const getAllChildren = node_ids => mongo.db('control').collection("security").aggregate(all_children_query(toArray(node_ids)))
export const getNode = _id => mongo.db('control').collection("security").findOne({_id})

export const canAdmin = async(user, node_id, parents_only = false) => {
  if (!parents_only && user.admins.includes(node_id)) {
    return true
  }
  const parents = await getAllParents([node_id]).toArray()
  const can = parents.some(parent => user.admins.includes(parent._id))
  return can
}

export const allKnownChildren = async (user) => await getAllChildren(user.admins)

export const addTagToNode = async (user, tag, node_id, org=false) => {
  const security = mongo.db('control').collection("security")
  if (!await canAdmin(user, node_id)) {
    throw 'ಠ_ಠ, you do not have admin rights to the node you are trying to add this to'
  }
  
  const _id = tag.startsWith('#')?tag:'#'+tag
  // if we add a collection which already exists, then just return it.... we are already done.
  const dupe_check = await security.findOne({_id})
  if (dupe_check) {
    throw "this tag already exists, so you can't create it"
  }

  const new_tag = {
    _id,
    type:'tag',
    parents:[node_id],
    adminedBy:[user._id],
    children:[],
    sub:_id,
    org,
    restrictions:{}
  }
  await security.insertOne(new_tag)
  await security.updateOne({_id:node_id}, {$addToSet:{children:_id}})
  // await security.updateOne({_id:user._id}, {$addToSet:{admins:_id}}) // do we need to do this now?
  return new_tag
}

export const deleteNode = async (user, node_id) => {
  if (!await canAdmin(user, node_id)) {
    throw 'ಠ_ಠ, you do not have admin rights to the node you are trying to remove'
  }
  const security = mongo.db('control').collection("security")
  const node = await security.findOne({_id:node_id})

  const children = node.children ?? []
  const parents = node.parents ?? []
  await Promise.all(children.map(_id => security.findOne({_id}).then(child => {
    if (child.type!='user' && child.parents.length < 2) {
      throw `ಠ_ಠ, you can't orphan a child (you monster), ${child._id} has no parents other than this one`
    }
  })))

  await Promise.all(parents.map(parent => canAdmin(user, parent).then(admin => {
    if (!admin) {
      throw `ಠ_ಠ, you do not have admin rights to the parent of the node you are trying to remove`
    }
  })))

  parents.forEach(parent_id => {
    removeParent(user,node_id,parent_id)
  })

  children.forEach(child_id => {
    removeParent(user,child_id,node_id)
  })
  
  return await security.deleteOne({_id:node_id})
}

export const addCollection = async (user, db, collection) => {
  const security = mongo.db('control').collection("security")
  
  if (!user.canAddCollectionTo?.includes(db)) {
    throw "ಠ_ಠ, you do not have collection creator access, so you can't create collections"
  }
  const _id = `&${db}/${collection}`

  // if we add a collection which already exists, then just return it.... we are already done.
  const dupe_check = await security.findOne({_id})
  if (dupe_check) {
    throw "this collection already exists, so you can't create it"
  }

  const new_collection = {
    _id,
    db,
    collection,
    sub:_id,
    type:'collection',
    parents:[],
    children:[],
    createdBy: user._id,
    schema:{},
    restrictions:{}
  }

  const collection_result = await security.insertOne(new_collection)
  const admin_update_result = await security.updateOne({_id:user._id}, {$addToSet:{admins:_id}})
  return new_collection
}

export const addParent = async (user, node_id, parent_id) => {
  const security = mongo.db('control').collection('security')
  if (!await canAdmin(user,parent_id)) { throw "ಠ_ಠ, you can't add children to a node you don't admin" }
  await security.updateOne({_id:parent_id}, {$addToSet:{children:node_id}})
  await security.updateOne({_id:node_id}, {$addToSet:{parents:parent_id}})
  return {result:"ok"}
}

export const removeParent = async (user, node_id, parent_id) => {
  const security = mongo.db('control').collection("security")
  if (!await canAdmin(user,parent_id)) {
    throw "ಠ_ಠ, you can't remove children from node you don't admin"
  }
  await security.updateOne({_id:parent_id}, {$pull:{children:node_id}})
  await security.updateOne({_id:node_id}, {$pull:{parents:parent_id}})
  return {result:"ok"}
}

export const addAdmin = async (user, node, admin) => {
  const security = mongo.db('control').collection("security")
  // TODO can't remove last assigner - must make find all assignees.
  if (!await canAdmin(user, node)) {
    throw "ಠ_ಠ, you can't add admins to a place you don't admin"
  }
  await security.updateOne({_id:admin}, {$addToSet:{admins:node}})
  return {result:"ok"}
}

export const removeAdmin = async (user, node, admin) => {
  const security = mongo.db('control').collection("security")
  // TODO can't remove last assigner - must make find all assignees.
  if (!await canAdmin(user,node)) {
    throw "ಠ_ಠ, you can't boot admins from a place you don't admin"
  }
  await security.updateOne({_id:admin}, {$pull:{admins:node}})
  return {result:"ok"}
}

const handleKeyCollision = (o1,o2) => {
  const collision = Object.keys(o1).some(k=> Object.keys(o2).includes(k)) // is any key in both objects
  if (collision) {
    return {$and:[o1,o2]} // can't merge
  } else {
    return {...o1, ...o2} // merged
  }
}

const _matchFor = async (node, db, collection, permission, all_parents, all_paths=new Set([])) => {
  let _permission = node?.restrictions?.[db]?.[collection]?.[permission]
  if (_permission) {
    _permission = JSON.parse(_permission)
  }
  // lets deal with the case where this is the wrong collection.
  if (node.type=='collection'){
    if (node.db != db || node.collection != collection) {
      all_paths.delete(node._id)
      return undefined // no path to collection, no data from this path.
    }
    return _permission || {} // get the permission (everything if not defined) TODO: check that.
  }
  // so, now we are not a collection, and therefore expected to have parents....

  const node_parents = all_parents.filter(x=>x.children.includes(node._id))

  const unfiltered_matches = await Promise.all(node_parents.map(parent => _matchFor(parent,db,collection,permission,all_parents,all_paths)))
  let matches = unfiltered_matches.filter(x => !!x)
  if (matches.length == 0) {
    all_paths.delete(node._id)
    return undefined // there is no path to collection, bail out now
  }

  // simplification stage.
  if (matches.some(x => Object.keys(x).length == 0)) {
    matches = [{}] // if there is a path which gives you everything, then, you get everything.
  }

  const parentMatches = matches.length == 1?matches[0]:{ $or:matches }
  if (_permission == undefined) {
    return parentMatches // passthough.
  }
  return handleKeyCollision(parentMatches, _permission??{}) // merge if we can
}

export const matchFor = async (node,db,collection,permission) => {
  const parents = await getAllParents(node._id).toArray()
  const paths = new Set(parents.map(x=>x._id))
  const match = await _matchFor(node,db,collection,permission, parents, paths)
  return {match, paths:[...paths]}
}

const couldEdit = async (user, node_id, db, collection, permission, parents) => {
  const node = getNode(node_id)
  const err_no_path = !_matchFor(node,db,collection,permission, parents)
  if (err_no_path) {
    throw "there is no path to collection from here, so, you can't edit rights for that path"
  }
  if (node.org) {
    throw "you can't edit restrictions on an org node. If an org node HAS restrictions, something has gone VERY wrong"
  }
  return await Promise.all(parents.map(parent => canAdmin(user, parent._id).then(x => x && _matchFor(parent,db,collection,permission, parents))))  
}

export const couldEditPermissionsFor = async (user, node_id, permission) => {
  const node = getNode(node_id)
  const parents = await getAllParents(node_id).toArray()
  return await Promise.all(
    parents
      .filter(parent => parent.type == 'collection')
      .map(async collection_node => ({
        db:collection_node.db,
        collection:collection_node.collection,
        can_edit: (await couldEdit(user, node_id, collection_node.db, collection_node.collection, permission, parents)).some(x=>x)
      }))
  )
}

export const setRestriction = async (user, node_id, db, collection, permission, restriction) => {
  const node = getNode(node_id)
  const security = mongo.db('control').collection("security")
  const parents = await getAllParents(node_id).toArray()
  console.log(`parents of ${node_id}`, parents)
  const err_no_path = !_matchFor(node,db,collection, permission, parents)

  if (err_no_path) { throw "there is no path to collection from here, so, you can't edit rights for that path" }
  if (node.org) { throw "you can't edit restrictions on an org node. If an org node HAS restrictions, something has gone VERY wrong" }
  
  const can = await Promise.all(parents.map(parent => canAdmin(user, parent._id).then(x => x && _matchFor(parent,db,collection,permission, parents))))  
  console.log("can?", can)
  const err_no_perm = !can.some(x=>x)

  // const err_no_perm = parents.some(parent => await canAdmin(user, parent._id) && _matchFor(parent,db,collection,permission, parents))
  if (err_no_perm) {
    throw 'you do not have sufficiant permissions to change this, you must have assigner rights to all parents, go make a child from here'
  } // weirdly enough, it is ok for you not to have admin rights to THIS node.

  const path = `restrictions.${db}.${collection}`

  const update = { $set:{
    [path]:{
      [permission]:JSON.stringify(restriction)
    }
  }}
  console.log("applying", update, "to", node_id)

  return await security.updateOne({"_id":node_id}, update)
}

const createUser = async (_id) => {
  const user = {
    _id:'@'+_id,
    type:'user',
    collectionCreator:true,
    name:_id,
    email:_id,
    nickname:_id,
    admins:[],
    parents:[],
    restrictions:{}
  }
  await mongo.db("control").collection("security").insert(user)
  return user
}

export const updateSchema = async (user, node_id, schema) => {
  const security = mongo.db('control').collection("security")
  // TODO can't remove last assigner - must make find all assignees.
  if (!await canAdmin(user,node_id)) {
    throw "ಠ_ಠ, you must be an admin to alter a schema on a node"
  }
  const update = { $set:{ schema } }
  return security.update({"_id":node_id},update)
}

export const getSchema = async (user, node_id) => {
  const nodes = await getAllParents(user._id).toArray()
  const node = nodes.filter(node => node._id == node_id)
  if (node.length == 0) {
    throw "ಠ_ಠ, you can't see the schema of any node that you can't query"
  }
  return node[0].schema
}

const fragment = () => Math.random().toString(36).slice(2)
const generateToken = () => fragment() + fragment() + fragment() + fragment() + fragment() + fragment()

// TODO: admins have no control over user tokens
// adds a new token
export const addToken = async (user, description, expiry_date) => {
  const token = generateToken()
  const ins_token = {_id:token, description, expiry_date, user:user._id}
  await mongo.db("control").collection("tokens").insertOne(ins_token)
  return await mongo.db("control").collection("tokens").findOne({_id:token})
}

// TODO: admins have no control over user tokens
// updates a token
export const updateToken = async (user, token, description, expiry_date) => {
  const ins_token = {_id:token, expiry_date, description, user:user._id}
  await mongo.db("control").collection("tokens").updateOne({_id:token, user:user._id}, {$set:ins_token})
  return ins_token
}

// TODO: admins have no control over user tokens
// deletes a token
export const delToken = async (user, token) => {
  await mongo.db("control").collection("tokens").deleteOne({_id:token, user:user._id})
  return {
    _id:token, user:user._id, deleted:true
  }
}

// TODO: admins have no control over user tokens
// lists all of the users token
export const getTokens = async (user) => {
  return await mongo.db("control").collection("tokens").find({user:user._id}).toArray()
}

// user has used the invite link
export const invited = async (user, node) => {
  const record = {_id:{user:user._id,node}, user:user._id, node, date:new Date()}
  await mongo.db("control").collection("invited").replaceOne({_id:record._id}, record, {upsert:true})
  console.log(node)
  const admins = await mongo.db("control").collection("security").find({admins:{$in:[node]}}).toArray()
  for (let admin of admins) {
    console.log("sending for ", admin)
    sendApprovalRequest(admin.email, node, user.nickname, user.email)
  }
  return record
}

// who has used the invite link for this node
export const listInvitesFor = async (user, node) => {
  if (!await canAdmin(user, node)) {
    throw "ಠ_ಠ, you can't add get the inviteList from a place you don't admin"
  }
  return await mongo.db("control").collection("invited").find({node}).toArray()
}

// remove user from invite list, and maybe add it to the node.
export const acceptOrRejectInvite = async (dbUser, node, user, accept) => {

  if (!await canAdmin(dbUser, node)) {
    throw "ಠ_ಠ, you can't change the invite status of a user for a node you don't admin."
  }
  const record = await mongo.db("control").collection("invited").findOne({_id:{user,node}})
  if (!record) {
    throw "ಠ_ಠ, user was never invited"
  }
  await mongo.db("control").collection("invited").deleteOne({_id:{user,node}})
  if (accept) {
    const result = await addParent(dbUser, user, node)
    return {user, node, status:"user added to node", result}
  } 
  return {user, node, status:"user removed from nodes invite list"}
}

// this queries the logs the admin can see.
// to be able to see a log, the query has to use a node the admin adminstrates
// if your node was not involved in the query, you can't see it.
// this will be even more useful when users get to define their own paths as part of the query.
export const logs = async (dbUser, query) => {
  let security = [{
    $match:{paths:{$elemMatch:{$in:dbUser.admins}}} // in the path, is at least one node the user admins
  }]
  const q = deepMap((query instanceof Array)?[...security, ...query]:[...security, {$match:query}])
  return mongo.db("log").collection("query_log").aggregate(q).stream()
}

// this queries the logs the admin can see.
// to be able to see a log, the query has to use a node the admin adminstrates
// if your node was not involved in the query, you can't see it.
// this will be even more useful when users get to define their own paths as part of the query.
export const events = async (dbUser, query) => {
  const ids = await (await allKnownChildren(dbUser)).toArray()
  let security = [{
    $match:{user:{$in:ids.filter(x=> x.type=='user').map(x=>x._id)}} // can only see logins of users you have admin rights over.
  }]
  const q = deepMap((query instanceof Array)?[...security, ...query]:[...security, {$match:query}])
  return mongo.db("control").collection("events").aggregate(q).stream()
}

export const loggedIn = async (user, app) => {
  const record = {user:user._id, app, type:"logged in", date:new Date()}
  await mongo.db("control").collection("events").insertOne(record)
  return record
}