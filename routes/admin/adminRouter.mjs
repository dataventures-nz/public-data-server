import express from 'express'
import {streamResults,streamObject} from '../streaming.mjs'
import {getAllParents,deleteNode,getAllChildren,canAdmin,updateSchema,getSchema,allKnownChildren,addTagToNode,addCollection,addParent,removeParent,addAdmin,removeAdmin,matchFor,setRestriction,getNode,couldEditPermissionsFor} from './admin.mjs'
import {updateToken, addToken, delToken, getTokens, invited, listInvitesFor, acceptOrRejectInvite, logs, events, loggedIn} from './admin.mjs'
import {pushUsersToAuth0} from './auth0.mjs'
export const adminRouter = express.Router()

adminRouter.get("/whoAmI", async (req, res, next) => {
    streamObject(req, res, req.dbUser)
})

adminRouter.get("/whoAmIToken", async (req, res, next) => {
    streamObject(req, res, req.user)
})

adminRouter.put("/loggedIn", async (req, res, next) => {
    const {app} = req.body
    streamObject(req, res, await loggedIn(req.dbUser, app))
})

adminRouter.get("/", async (req, res, next) => {
    streamResults(req, res, await allKnownChildren(req.dbUser))
})

adminRouter.post("/canEditPermissions", async (req, res, next) => {
    const {node, permission} = req.body
    streamObject(req, res, await couldEditPermissionsFor(req.dbUser, node, permission))
})

adminRouter.put("/createLink", async (req, res, next) => {
    const {parent,child} = req.body
    streamObject(req, res, await addParent(req.dbUser, child, parent))
})

adminRouter.delete("/createLink", async (req, res, next) => {
    const {parent,child} = req.body
    streamObject(req, res, await removeParent(req.dbUser, child, parent))
})

adminRouter.put("/db", async (req, res, next) => {
    const {db,collection} = req.body
    streamObject(req, res, await addCollection(req.dbUser, db, collection))
})

adminRouter.post("/logs", async (req, res, next) => { // lets you query the logs, filters out anything you shouldn't see
    streamResults(req, res, await logs(req.dbUser, req.body))
})

adminRouter.post("/events", async (req, res, next) => { // lets you query the events, filters out anything you shouldn't see
    streamResults(req, res, await events(req.dbUser, req.body))
})

adminRouter.put("/addNode", async (req, res, next) => {
    const {parent,child,org} = req.body
    streamObject(req, res, await addTagToNode(req.dbUser, child, parent, org))
})

adminRouter.put("/admin", async (req, res, next) => {
    const {node, admin} = req.body
    streamObject(req, res, await addAdmin(req.dbUser, node, admin))
})

adminRouter.put("/schema", async (req, res, next) => {
    const {node,schema} = req.body
    streamObject(req, res, await updateSchema(req.dbUser, node, schema))
})

adminRouter.post("/schema", async (req, res, next) => {
    const {node} = req.body
    streamObject(req, res, await getSchema(req.dbUser, node))
})

adminRouter.delete("/admin", async (req, res, next) => {
    const {node,admin} = req.body
    streamObject(req, res, await removeAdmin(req.dbUser, node,admin))
})

adminRouter.delete("/node", async (req, res, next) => {
    const {node} = req.body
    streamObject(req, res, await deleteNode(req.dbUser, node))
})

adminRouter.put("/restriction", async (req, res, next) => {
    const {db, collection, node, permission, restriction} = req.body
    streamObject(req, res, await setRestriction(req.dbUser, node, db, collection, permission, restriction))
})

adminRouter.post("/matchFor", async (req, res, next) => {
    const {db, collection, node, permission} = req.body
    streamObject(req, res, await matchFor(node, db, collection, node, permission))
})

adminRouter.post("/parents", async (req, res, next) => {
    const {node} = req.body
    streamResults(req, res, await getAllParents(req.dbUser, node))
})

adminRouter.post("/children", async (req, res, next) => {
    const {node} = req.body
    streamObject(req, res, await getAllChildren(req.dbUser, node))
})

adminRouter.post("/canAdmin", async (req, res, next) => {
    const {node} = req.body
    streamObject(req, res, {result: await canAdmin(req.dbUser, node)})
})

adminRouter.post("/", async (req, res, next) => {
    const {node} = req.body
    streamObject(req, res, {result: await getNode(req.dbUser, node)})
})

// updates long active token for user
adminRouter.get("/token", async (req, res, next) => {
    streamObject(req, res, {result: await getTokens(req.dbUser)})
})

// updates long active token for user
adminRouter.post("/token", async (req, res, next) => {
    const {token, description, expiry_date} = req.body
    streamObject(req, res, {result: await updateToken(req.dbUser, token, description, expiry_date)})
})

// adds long active token for user
adminRouter.put("/token", async (req, res, next) => {
    const {description, expiry_date} = req.body
    streamObject(req, res, {result: await addToken(req.dbUser, description, expiry_date)})
})

// delete long active token for user
adminRouter.delete("/token", async (req, res, next) => {
    const {token} = req.body
    streamObject(req, res, {result: await delToken(req.dbUser, token)})
})

// invites a user
adminRouter.put("/invite", async (req, res, next) => {
    const {node} = req.body
    streamObject(req, res, {result: await invited(req.dbUser, node)})
})

// sees which users are invited to a node
adminRouter.post("/listInvites", async (req, res, next) => {
    const {node} = req.body
    streamObject(req, res, {result: await listInvitesFor(req.dbUser, node)})
})

// adds a user to the node, OR removes the user from the invited list.
adminRouter.post("/invite", async (req, res, next) => {
    const {node, user, accept} = req.body
    streamObject(req, res, {result: await acceptOrRejectInvite(req.dbUser, node, user, accept)})
})

adminRouter.put("/bulk_add_users", async (req, res, next) => {
    const {users, tags} = req.body
    streamObject(req, res, {result: await pushUsersToAuth0(req.dbUser, users, tags)})
})


//   export const _setUp = async (req, res, next) => {
//     const {node} = req.params
//     streamObject(req, res, await setUp(req.dbUser, node))
//   }
  

// adminRouter.get("/allKnownChildren", _allKnownChildren) // adds a tag, returns the new tag
// adminRouter.put("/nodes/:node/:tag", addTag) // adds a tag, returns the new tag
// adminRouter.get("/nodes/:node", getNode) // gets the node, if you are an admin for it.
// apiRouter.get("/:node", node) // gets the node, if you are an admin for it.
// apiRouter.get("/:node/admins", admins) // gets all of the admins for a node
// apiRouter.get("/search/:string", search) // searchs the nodes
