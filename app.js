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
  let toDownload = req.query.toDownload === "true" || false;

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
  const options = {
    projection: { _id: 0, serviceCollection: 1 },
  };
  const result = await dbObj
    .collection("central")
    .find(query, options)
    .toArray()
    .catch((err) => {
      res.status(400).send(err);
    });
  if (!result) return res.status(500).end("Errors in Database");

  // Try to get all info of the user from the collection name list
  let allInfo = {};
  const idQuery = { _id: username };
  const idOptions = { projection: { _id: 0 } };
  for (let index = 0; index < result.length; index++) {
    let collection = result[index]["serviceCollection"];
    let info = await dbObj
      .collection(collection)
      .find(idQuery, idOptions)
      .toArray()
      .catch((err) => {
        res.status(400).send(err);
      });
    if (!info) return res.status(500).end("Errors in Database");
    console.log("info:", info);
    info.forEach((i) => {
      for (key in i) {
        allInfo[key] = i[key];
      }
    });
  }

  dbClient.close();
  // Determine whether the gathered info needs to be downloaded
  if (!toDownload) {
    return res.send(allInfo);
  } else {
    let json = JSON.stringify(allInfo);
    let filename = "userInfo.json";
    let mimetype = "application/json";
    res.setHeader("Content-Type", mimetype);
    res.setHeader("Content-disposition", "attachment; filename=" + filename);
    return res.send(json);
  }
});

// Hanlder for getting contact info whose data retention or consent will expire soon
app.get("/contact/expire", async (req, res) => {
  // Get all params from query and calculate the target expiring date based on the param
  let expireInDays = parseInt(req.query.expireInDays);
  let targetExpireDate = new Date(Date.now());
  targetExpireDate.setDate(targetExpireDate.getDate() + expireInDays);
  console.log("expireInDays:", expireInDays, typeof expireInDays);
  console.log("targetExpireDate:", targetExpireDate);

  // Connect to target DB
  const dbClient = await mongoClient
    .connect(url, { useUnifiedTopology: true })
    .catch((err) => {
      res.status(400).send(err);
    });
  if (!dbClient) return res.status(500).end("Database cannot be connected");

  // Try to get the record correponing to the username in the target collection
  const dbObj = dbClient.db("gdpr-s1");
  const collection = "central";
  const query = { consentExp: { $lt: targetExpireDate } };
  const options = { projection: { _id: 0, consentExp: 0 } };
  const result = await dbObj
    .collection(collection)
    .find(query, options)
    .toArray()
    .catch((err) => {
      res.status(400).send(err);
    });
  if (!result) return res.status(500).end("Errors in Database");

  // Loop through the result list and get contact info of each user from profile collection
  let contactInfo = {};
  const idOptions = { projection: { _id: 0, email: 1 } };
  for (let index = 0; index < result.length; index++) {
    let collection = result[index]["serviceCollection"];
    let idQuery = { _id: result[index]["username"] };
    let info = await dbObj
      .collection(collection)
      .find(idQuery, idOptions)
      .toArray()
      .catch((err) => {
        res.status(400).send(err);
      });
    if (!info) return res.status(500).end("Errors in Database");
    console.log("info:", info);
    result[index]["email"] = info[0]["email"];
  }

  dbClient.close();
  return res.send(result);
});

// Hanlder for executing DB queries for internal usage
app.get("/record/query", async (req, res) => {
  // Get all params from query
  const db = req.query.db;
  const collection = req.query.collection;
  let query;
  let options;
  try {
    query = JSON.parse(req.query.query);
    options = req.query.options ? JSON.parse(req.query.options) : {};
  } catch (error) {
    return res.status(400).end("Errors in query/options value");
  }

  // Connect to target DB
  const dbClient = await mongoClient
    .connect(url, { useUnifiedTopology: true })
    .catch((err) => {
      res.status(400).send(err);
    });
  if (!dbClient) return res.status(500).end("Database cannot be connected");

  // Try to get all collections that contains the username from central collection
  const dbObj = dbClient.db(db);
  const result = await dbObj
    .collection(collection)
    .find(query, options)
    .toArray()
    .catch((err) => {
      res.status(400).send(err);
    });
  if (!result) return res.status(500).end("Errors in Database");

  dbClient.close();
  return res.send(result);
});

// Handler for updating data stored in a collection
app.patch("/record", jsonParser, async (req, res) => {
  // Get all params from query
  const db = req.body.db;
  const collection = req.body.collection;
  const username = req.body.username;
  const serviceCollection = req.body.serviceCollection;
  const field = req.body.field;
  let newVal = req.body.newVal;
  // Validate the query params values
  if (collection === "central") {
    if (!serviceCollection || field !== "consentExp") {
      return res
        .status(400)
        .send(
          "serviceCollection cannot be empty and only consentExp can be udpated if modifying data in central collection"
        );
    }
    newVal = new Date(newVal);
    if (
      !(newVal instanceof Date && !isNaN(newVal)) ||
      newVal <= new Date(Date.now())
    ) {
      return res.status(400).send("Invalid date value");
    }
  }

  // Connect to target DB
  const dbClient = await mongoClient
    .connect(url, { useUnifiedTopology: true })
    .catch((err) => {
      res.status(400).send(err);
    });
  if (!dbClient) return res.status(500).end("Database cannot be connected");

  // Try to update the username's field with the new value in the given collection
  const dbObj = dbClient.db(db);
  const query =
    collection === "central"
      ? { username: username, serviceCollection: serviceCollection }
      : { _id: username };
  const newValObj = { $set: { field: newVal } };
  const result = await dbObj
    .collection(collection)
    .updateOne(query, newValObj)
    .catch((err) => {
      res.status(400).send(err);
    });
  if (!result) return res.status(500).end("Errors in Database");

  dbClient.close();
  return res.send(
    `${username}'s ${field} record in ${collection} has been successfully updated to '${newVal}'!`
  );
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}!`);
});
