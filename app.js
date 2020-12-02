/*jshint esversion: 6 */
const express = require('express')
const bodyParser = require('body-parser')
const app = express();

// create application/json parser
const jsonParser = bodyParser.json()
 
// create application/x-www-form-urlencoded parser
const urlencodedParser = bodyParser.urlencoded({ extended: false })

const port = 8000;

// MongoDB instance
let mongo = require('mongodb');
let mongoClient = mongo.MongoClient;
let url = "mongodb+srv://pingfan:pingfan@cluster0.iwciw.mongodb.net/test?authSource=admin&replicaSet=atlas-m7bgyt-shard-0&readPreference=primary&appname=MongoDB%20Compass&ssl=true"


app.get('/', (req, res) => {
  res.send('Hello World!')
});

app.post('/record', jsonParser, (req, res) => {
  console.log("req.body:", req.body);
  // Check if consent is included and valid
  console.log("new Date(req.body.consentExp):", new Date(req.body.consentExp));
  console.log("new Date(Date.now()):", new Date(Date.now()));
  console.log("new Date(req.body.consentExp) > new Date(Date.now()):", new Date(req.body.consentExp) > new Date(Date.now()));
  if (!req.body.consentExp || new Date(req.body.consentExp) <= new Date(Date.now())) {
    res.send('No/invalid consent expire date')
  } else {
    // Convert date of birth to Date obj
    let recordObj = req.body.record;
    recordObj.dateOfBirth = new Date(recordObj.dateOfBirth);
    mongoClient.connect(url, (err, db) => {
      if (err) throw err;
      let dbObj = db.db(req.body.db);
      dbObj.collection(req.body.collection).insertOne(recordObj, (err, res)=>{
        if (err) throw err;
        console.log("1 record inserted");
        db.close();
      })
    })
    res.send('1 record inserted')
  }
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}!`)
});