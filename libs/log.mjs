import {mongo_log} from './databases.mjs'

export function log(dbUser, log) {
  // console.log({...log, user_id:dbUser._id})
  mongo_log.db("log").collection("query_log").insertOne({...log, user_id:dbUser._id, "time": new Date()})
}
