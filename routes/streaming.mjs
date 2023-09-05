import fastCsv from 'fast-csv'
import  { Transform, Readable } from 'stream'
import datefns from 'date-fns'
import BSON from 'bson';
const {EJSON} = BSON;

// TODO: base this off headers
const dvDateFormatter = (doc) => {
  if (doc) {
    for (let i of Object.keys(doc)) {
      if (doc[i] instanceof Date) {
        doc[i] = doc[i].toISOString()
      }
    }  
  }
  return doc
}

export const pipeMap = (fn, options = {}) => new Transform({
  objectMode: true,
  ...options,
  transform(chunk, encoding, callback) {
    let res;
    try {
      res = fn(chunk);
    } catch(e) {
      return callback(e);
    }
    callback(null, res);
  }
})

export const pipeFilter = (fn, options = {}) => new Transform({
  objectMode: true,
  ...options,
  transform(chunk, encoding, next) {
    if (fn(chunk)) return next(null,chunk)
    next()
  }
})

const createEJsonStream = (options = {}) => {
  return new Transform({
    objectMode: true,
    ...options,
    transform: function (chunk, encoding, callback) {
      if (!this.not_first) {
          this.not_first = true
          this.push('[' + EJSON.stringify(chunk))
      } else {
          this.push(',\n' + EJSON.stringify(chunk))
      }
      callback();
    },
    flush: function (callback) {
      if (!this.not_first) {
        this.push('[')
      }
      this.push(']'); callback() 
    }
  })
}

const createBsonStream = (options = {}) => {
  return new Transform({
    objectMode: true,
    ...options,
    transform: function (chunk, encoding, callback) {
      this.push(BSON.serialize(chunk))      
      callback();
    }
  })
}

const createJsonStream = (options = {}) => {
  return new Transform({
    objectMode: true,
    ...options,
    transform: function (chunk, encoding, callback) {
      if (!this.not_first) {
          this.not_first = true
          this.push('[' + JSON.stringify(chunk))
      } else {
          this.push(',\n' + JSON.stringify(chunk))
      }
      callback();
    },
    flush: function (callback) {
      if (!this.not_first) {
        this.push('[')
      }
      this.push(']'); callback() 
    }
  })
}

const createCsvBsonStream = (options = {}) => {
  return new Transform({
    objectMode: true,
    ...options,
    transform: function (chunk, encoding, callback) {
      if (!this.not_first) {
          this.keys = chunk.keys()
          this.push(BSON.serialize(this.keys))
          const values = this.keys.map(k => chunk[k])
          this.push(BSON.serialize(values))
          this.not_first = true
      } else {
          const values = this.keys.map(k => chunk[k])
          this.push(BSON.serialize(values))
      }
      callback();
    }
  })
}

const streamCSV = (res, cursor) => {
  res.setHeader('Content-Type', 'text/csv')
  const csvStream = fastCsv.format({ headers: true }).transform(dvDateFormatter)
  cursor.pipe(csvStream).pipe(res)
}

const streamCsvBSON = (res, cursor) => {
  res.setHeader('Content-Type', 'application/csv-bson')
  cursor.pipe(createCsvBsonStream()).pipe(res)
}

const streamTSV = (res, cursor) => {
  res.setHeader('Content-Type', 'text/tsv')
  const csvStream = fastCsv.format({ headers: true, delimiter:'\t' }).transform(dvDateFormatter)
  cursor.pipe(csvStream).pipe(res)
}

const streamBSON = (res, cursor) => {
  res.setHeader('Content-Type', 'application/bson')
  cursor.pipe(createBsonStream()).pipe(res)
}

const streamJSON = (res, cursor) => {
  res.setHeader('Content-Type', 'application/json')
  cursor.pipe(pipeMap(dvDateFormatter)).pipe(createJsonStream()).pipe(res)
}

const streamEJSON = (res, cursor) => {
  res.setHeader('Content-Type', 'application/json')
  cursor.pipe(createEJsonStream()).pipe(res)
}

export const streamResults = (req, res, cursor) => {
  const accept = req.accepts([
    "text/csv","application/csv",
    "text/json","application/json",
    "text/tsv","application/tsv",
    // "text/xml","application/xml", // not yet, hell TODO:protobuf will happen first.
    "application/bson",
    "text/ejson","application/ejson",
    "application/csv-bson"
  ])
  switch (accept) {
    case "text/json":
    case "application/json":
      streamJSON(res, cursor) ; break
    case "text/csv":
    case "application/csv":
      streamCSV(res, cursor) ; break
    case "text/tsv":
    case "application/tsv": 
      streamTSV(res, cursor) ; break
    case "application/bson": // no text version, since it is a binary protocol
      streamBSON(res, cursor) ; break
    case "application/csv-bson": // no text version, since it is a binary protocol
    streamCsvBSON(res, cursor) ; break
    case "text/ejson": 
    case "application/ejson": 
      streamEJSON(res, cursor) ; break
    default: res.status(405).send(req.get('Accept') + " not understood, saw " + accept)
  }
}

export const streamObject = (req, res, obj) => {
  const accept = req.accepts([
    "text/csv","application/csv",
    "text/json","application/json",
    "text/tsv","application/tsv",
    // "text/xml","application/xml", // not yet, hell TODO:protobuf will happen first.
    "application/bson",
    "text/ejson","application/ejson"
  ])

  switch (accept) {
    case "text/json":
    case "application/json":
      res.setHeader('Content-Type', 'application/json')
      Readable.from([obj]).pipe(pipeMap(dvDateFormatter)).pipe(pipeMap(JSON.stringify)).pipe(res); break
    case "text/csv":
    case "application/csv":
      streamCSV(res, Readable.from([obj])); break
    case "text/tsv":
    case "application/tsv": 
      streamTSV(res, Readable.from([obj])); break
    case "application/bson": // no text version, since it is a binary protocol
      streamBSON(res, Readable.from([obj])); break
    case "text/ejson": 
    case "application/ejson": 
    res.setHeader('Content-Type', 'application/json')
    Readable.from([obj]).pipe(pipeMap(EJSON.stringify)).pipe(res); break
    default: res.status(405).send(req.get('Accept') + " not understood, saw " + accept)
  }
}
