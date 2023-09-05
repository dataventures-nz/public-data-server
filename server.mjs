import express from 'express'
import cors from 'cors'
import bodyParser from 'body-parser'
import {ejsonBodyParser} from './libs/ejsonBodyParser.mjs'
// import { EJSON, serialize, deserialize } from 'bson'
// import compression from 'compression'
import {apiRouter} from './routes/api/apiRouter.mjs'
import {adminRouter} from './routes/admin/adminRouter.mjs'
import {checkJwt} from './libs/checkJWT.mjs'
import {addUser, checkLongActingToken} from './libs/addUser.mjs'
const app = express()

// compression
// JWT -> check token, record user
// look up user in mongo.
// log
// conversion bson, json, ymal -> ejson.
app.use(cors({})) // we do accept it all.

// health check first, you don't need a token for it.
app.get('/health', function (req, res, next) {
  res.send("ok")
})

// version check.
app.get('/version', function (req, res, next) {
  res.send(`${process.env.npm_package_version}`)
})

app.use(function(req, res, next){
  const lToken = req.header('ltoken')
  if (lToken) {
    checkLongActingToken(req, res, next)
  } else {
    checkJwt(req, res, () => {req.user = req.auth; addUser(req,res,next)})
  }
})

// app.use(addUser)
// turn body into a stream of ejson, if a post or put or whatever.
app.use(express.json())
app.use(ejsonBodyParser)
app.use(bodyParser.urlencoded({ extended: true }))

app.use("/api/", apiRouter)
app.use("/admin/", adminRouter)
console.log(`${process.env.npm_package_version}`)
app.listen(2800)
