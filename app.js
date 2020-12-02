/*jshint esversion: 6 */
const express = require("express");
const bodyParser = require("body-parser");
const app = express();

// create application/json parser
const jsonParser = bodyParser.json();

// create application/x-www-form-urlencoded parser
const urlencodedParser = bodyParser.urlencoded({ extended: false });

const port = 8000;

// MongoDB instance
let mongo = require("mongodb");
let mongoClient = mongo.MongoClient;
let url =
  "mongodb+srv://pingfan:pingfan@cluster0.iwciw.mongodb.net/test?authSource=admin&replicaSet=atlas-m7bgyt-shard-0&readPreference=primary&appname=MongoDB%20Compass&ssl=true";

// Handler for adding new record to service collection
app.post("/record", jsonParser, async (req, res) => {
  // Check if consent is included and valid
  if (
    !req.body.consentExp ||
    new Date(req.body.consentExp) <= new Date(Date.now())
  ) {
    return res.status(400).end("No/invalid consent expire date");
  }
  // Check if username is included
  if (!req.body.username) return res.status(400).end("No username");
  // Convert all json element starts with "date" to Date obj
  let recordObj = req.body.record;
  for (rec in recordObj) {
    if (rec.startsWith("date")) {
      recordObj[rec] = new Date(recordObj[rec]);
    }
  }
  // Use username as the unique identifier
  recordObj._id = req.body.username;

  // Connect to target DB
  const dbClient = await mongoClient
    .connect(url, { useUnifiedTopology: true })
    .catch((err) => {
      res.status(400).send(err);
    });
  if (!dbClient) return res.status(500).end("Database cannot be connected");

  // Try to insert the new record to the target collection
  const dbObj = dbClient.db(req.body.db);
  const result = await dbObj
    .collection(req.body.collection)
    .insertOne(recordObj)
    .catch((err) => {
      res.status(400).send(err);
    });
  if (!result) return res.status(500).end("Errors in Database");

  // Try to insert a new record to central collection b/c new record added to target collection
  const recordCentralObj = {
    username: req.body.username,
    serviceCollection: req.body.collection,
    consentExp: new Date(req.body.consentExp),
  };
  const resultCentral = await dbObj
    .collection("central")
    .insertOne(recordCentralObj)
    .catch((error) => {
      res.status(400).send(err);
    });
  if (!resultCentral) return res.status(500).end("Errors in Database");
  dbClient.close();
  return res.end("1 record inserted");
});

// Handler for adding new record to service collection
app.get("/record", async (req, res) => {
  // Get all params from query
  let username = req.query.username;
  let db = req.query.db;
  let collection = req.query.collection;

  // Connect to target DB
  const dbClient = await mongoClient
    .connect(url, { useUnifiedTopology: true })
    .catch((err) => {
      res.status(400).send(err);
    });
  if (!dbClient) return res.status(500).end("Database cannot be connected");

  // Try to get the record correponing to the username in the target collection
  const dbObj = dbClient.db(db);
  const query =
    collection === "central" ? { username: username } : { _id: username };
  const result = await dbObj
    .collection(collection)
    .find(query)
    .toArray()
    .catch((err) => {
      res.status(400).send(err);
    });
  if (!result) return res.status(500).end("Errors in Database");
  dbClient.close();
  return res.send(result);
});

// Handler for getting all data of one user
app.get("/record/all", async (req, res) => {
  // Get all params from query
  let username = req.query.username;
  let db = req.query.db;

  // Connect to target DB
  const dbClient = await mongoClient
    .connect(url, { useUnifiedTopology: true })
    .catch((err) => {
      res.status(400).send(err);
    });
  if (!dbClient) return res.status(500).end("Database cannot be connected");

  // Try to get all collections that contains the username from central collection
  const dbObj = dbClient.db(db);
  const query = { username: username };
  const projection = {
    _id: 0,
    username: 0,
    serviceCollection: 1,
    consentExp: 0,
  };
  const result = await dbObj
    .collection("central")
    .find(query)
    .project(projection)
    .toArray()
    .catch((err) => {
      res.status(400).send(err);
    });
  if (!result) return res.status(500).end("Errors in Database");
  dbClient.close();
  return res.send(result);
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}!`);
});
