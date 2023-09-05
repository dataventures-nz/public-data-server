import {streamResults,pipeFilter,pipeMap} from '../streaming.mjs'
import {getAllParents} from '../admin/admin.mjs'

const pipeProject = pipeMap(x=>({db:x.db, collection:x.collection, _id:x._id}))

export const listDatabases = async (req, res, next) => {
  streamResults(req, res, await getAllParents(req.dbUser._id).stream().pipe(pipeFilter(x=> x.type=='collection')).pipe(pipeMap(x=>({db:x.db, collection:x.collection, _id:x._id, schema:x.schema}))))
}

export const listCollections = async (req, res, next) => {
  const { db } = req.params;
  streamResults(req, res, await getAllParents(req.dbUser._id).stream().pipe(pipeFilter(x=> x.type=='collection' && x.db == db)).pipe(pipeMap(x=>({db:x.db, collection:x.collection, _id:x._id, schema:x.schema}))))
}

