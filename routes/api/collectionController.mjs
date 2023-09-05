import {mongo} from '../../libs/databases.mjs'
import {log} from '../../libs/log.mjs'
// import {convertToBulkWrite} from '../mongoUtils.mjs'
import {streamResults} from '../streaming.mjs'
import {matchFor} from '../admin/admin.mjs'
import {deepMap} from '../../libs/deepMap.mjs'

const methodNotAllowed = (req, res, next) => res.status(405)

export const headCollection = methodNotAllowed
export const createCollection = methodNotAllowed
export const deleteCollection = methodNotAllowed
export const getMeta = methodNotAllowed
export const getExtents = methodNotAllowed

// TODO MongoSafe

export const readCollection = async (req, res) => {
  const { db, collection } = req.params
  let query = req.body ?? {}
  const security = await matchFor(req.dbUser, db, collection, "read")
  console.log(JSON.stringify(security))
  if (security.match) {
    const optionalSecurity = [security.match].filter(x => Object.keys(x).length > 0).map(x => ({$match:x}))
    const optionalClearId = (!!req.header('_id'))?[]:[{$project: {_id: 0}}]
    const q = deepMap((query instanceof Array)?[...optionalSecurity,  ...query, ...optionalClearId]:[...optionalSecurity,  {$match:query}, ...optionalClearId])
    log(req.dbUser, {db, collection, requested:JSON.stringify(query), query:JSON.stringify(q), paths:security.paths, status:"will run"})
    const cursor = await mongo.db(db).collection(collection).aggregate(q).stream()
    streamResults(req,res,cursor)
  } else {
    log(req.dbUser, {query, db, collection, status:"deny, user has no access to collection"})
    res.status(403).send("you don't have access to that database")
  }
}

// TODO: we have to work out how to stream this, which means holding off the json parse until inside the methods.
// how do we hand over stuff like we want it to be out of order? etc.
// anyway, this handles both post and patch for bulk updates.

// this works, but, isn't for live yet.
// export const bulkWrite = (update=false) => async (req, res) => {
//   const { db, collection } = req.params;
//   const {upsert_fields, collation, arrayFilters}  = req.headers
//   const options = {upsert_fields, collation, arrayFilters}
//   let records = req.body
//   const bulk_records = (records instanceof Array)?records:[records]
//   const bulk_updates = bulk_records.map(convertToBulkWrite(options,update))
//   const results = await mongo.db(db).collection(collection).bulkWrite(bulk_updates)
//   streamResults(req,res,results)
// }

export const bulkWrite = () => methodNotAllowed

// yes, you CAN have a body in a del.
// export async function del(req, res) {
//   const { db, collection } = req.params
//   let q = req.body
//   const results = await mongo.db(db).collection(collection).deleteMany(q)
//   streamResults(req,res,results)
// }

export const del = methodNotAllowed
