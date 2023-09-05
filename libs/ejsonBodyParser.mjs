import {mongo} from './databases.mjs'
import fetch from 'node-fetch'
import pkg from 'bson';
const {EJSON} = pkg;

export const ejsonBodyParser = async (req,res,next) => {
  let json = req.body
  if (json) {
    req.body = EJSON.parse(JSON.stringify(json))
  }
  next()
}