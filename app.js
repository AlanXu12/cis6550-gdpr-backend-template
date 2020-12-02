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

app.post('/record', jsonParser, async (req, res) => {
  // Check if consent is included and valid
  if (!req.body.consentExp || new Date(req.body.consentExp) <= new Date(Date.now())) {
    res.send('No/invalid consent expire date');
    return;
  }
  // Check if username is included
  if (!req.body.username) {
    res.send('No username');
    return;
  }
  // Convert date of birth to Date obj
  let recordObj = req.body.record;
  recordObj.dateOfBirth = new Date(recordObj.dateOfBirth);
  // Use username as the unique identifier
  recordObj._id = req.body.username;
  const dbClient = await mongoClient.connect(url, { useUnifiedTopology: true }).catch((err) => {console.log("1st err");});
  if (!dbClient) return;
  const dbObj = dbClient.db(req.body.db);
  await dbObj.collection(req.body.collection).insertOne(recordObj).catch((err) => {console.log("last err"); return;});
  // try {
  //   let result = await dbObj.collection(req.body.collection).insertOne(recordObj);
  // } catch (error) {
  //   return res.status(402).end("err");
  // }
  const recordCentralObj = {
    "username": req.body.username,
    "serviceCollection": req.body.collection,
    "consentExp": req.body.consentExp
  };
  await dbObj.collection("central").insertOne(recordCentralObj).catch((error) => {console.log("last err"); return;});
  console.log("passed the last await");
  dbClient.close();
  return res.end('1 record inserted');

});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}!`)
});