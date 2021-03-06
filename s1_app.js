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
// MongoDB URI hided for security reasons
let url = "";

// Handler for adding new record to service collection
app.post("/record", jsonParser, async (req, res) => {
  // Get all params from query
  const db = req.body.db;
  const collection = req.body.collection;
  const consentExp = req.body.consentExp;
  const username = req.body.username;
  const email = req.body.email;
  let recordObj = req.body.record;

  // Check if consent is included and valid
  if (!consentExp || new Date(consentExp) <= new Date(Date.now())) {
    return res.status(400).end("No/invalid consent expire date");
  }
  // Check if username is included
  if (!username) return res.status(400).end("No username");
  // Convert all json element starts with "date" to Date obj
  for (rec in recordObj) {
    if (rec.startsWith("date")) {
      recordObj[rec] = new Date(recordObj[rec]);
    }
  }
  // Use username as the unique identifier
  recordObj._id = username;

  // Connect to target DB
  const dbClient = await mongoClient
    .connect(url, { useUnifiedTopology: true })
    .catch((err) => {
      res.status(500).send(err);
    });
  if (!dbClient) return;

  const dbObj = dbClient.db(db);
  // Check if target collection exists
  let collectionList = await dbObj
    .listCollections()
    .toArray()
    .catch((err) => {
      res.status(500).send(err);
    });
  if (!collectionList) return;
  collectionList = collectionList.map((c) => {
    return c["name"];
  });
  if (!collectionList.includes(collection)) {
    return res.status(400).end("No/invalid collection");
  }

  // Try to insert the new record to the target collection
  const result = await dbObj
    .collection(collection)
    .insertOne(recordObj)
    .catch((err) => {
      res.status(500).send(err);
    });
  if (!result) return;

  // Try to insert a new record to central collection b/c new record added to target collection
  const recordCentralObj = {
    username: username,
    serviceCollection: collection,
    email: email,
    consentExp: new Date(consentExp),
  };
  const resultCentral = await dbObj
    .collection("central")
    .insertOne(recordCentralObj)
    .catch((error) => {
      res.status(500).send(err);
    });
  if (!resultCentral) return;

  dbClient.close();
  return res.end("1 record inserted");
});

// Handler for getting one user's record in a collection
app.get("/record", async (req, res) => {
  // Get all params from query
  let username = req.query.username;
  let db = req.query.db;
  let collection = req.query.collection;

  // Connect to target DB
  const dbClient = await mongoClient
    .connect(url, { useUnifiedTopology: true })
    .catch((err) => {
      res.status(500).send(err);
    });
  if (!dbClient) return;

  // Try to get the record correponding to the username in the target collection
  const dbObj = dbClient.db(db);
  const query =
    collection === "central" ? { username: username } : { _id: username };
  const result = await dbObj
    .collection(collection)
    .find(query)
    .toArray()
    .catch((err) => {
      res.status(500).send(err);
    });
  if (!result) return;
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
      res.status(500).send(err);
    });
  if (!dbClient) return;

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
      res.status(500).send(err);
    });
  if (!result) return;

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
        res.status(500).send(err);
      });
    if (!info) return;
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
  const db = req.query.db;
  let expireInDays = parseInt(req.query.expireInDays);
  let targetExpireDate = new Date(Date.now());
  targetExpireDate.setDate(targetExpireDate.getDate() + expireInDays);

  // Connect to target DB
  const dbClient = await mongoClient
    .connect(url, { useUnifiedTopology: true })
    .catch((err) => {
      res.status(500).send(err);
    });
  if (!dbClient) return;

  // Try to get the necessary expiration informing info correponding to the soon expired consents in the central collection
  const dbObj = dbClient.db(db);
  const collection = "central";
  const query = { consentExp: { $lt: targetExpireDate } };
  const options = { projection: { _id: 0, consentExp: 0 } };
  const result = await dbObj
    .collection(collection)
    .find(query, options)
    .toArray()
    .catch((err) => {
      res.status(500).send(err);
    });
  if (!result) return;

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
      res.status(500).send(err);
    });
  if (!dbClient) return;

  // Try to execute the passed-in query with the given options
  const dbObj = dbClient.db(db);
  const result = await dbObj
    .collection(collection)
    .find(query, options)
    .toArray()
    .catch((err) => {
      res.status(500).send(err);
    });
  if (!result) return;

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
      res.status(500).send(err);
    });
  if (!dbClient) return;

  const dbObj = dbClient.db(db);
  // Check if target field name exists
  if (collection !== "central") {
    let targetDocument = await dbObj
      .collection(collection)
      .findOne({ _id: username })
      .catch((err) => {
        res.status(500).send(err);
      });
    if (!targetDocument) return;
    const fieldList = Object.keys(targetDocument);
    if (!fieldList.includes(field)) {
      return res.status(400).end("No/invalid field");
    }
  }

  // Try to update the username's field with the new value in the given collection
  const query =
    collection === "central"
      ? { username: username, serviceCollection: serviceCollection }
      : { _id: username };
  const newValObj = { $set: { [field]: newVal } };
  const result = await dbObj
    .collection(collection)
    .updateOne(query, newValObj)
    .catch((err) => {
      res.status(500).send(err);
    });
  if (!result) return;
  if (result["modifiedCount"] === 0) return res.status(400).end("No update");

  dbClient.close();
  return res.send(
    `${username}'s ${field} record in ${collection} has been successfully updated to '${newVal}'!`
  );
});

// Handler for deleting all info belongs to one user within a specific collection
app.delete("/record", jsonParser, async (req, res) => {
  // Get all params from query
  const db = req.body.db;
  const collection = req.body.collection;
  const username = req.body.username;
  if (collection === "central") {
    return res
      .status(400)
      .send("Cannot directly delete records from central collection.");
  }

  // Connect to target DB
  const dbClient = await mongoClient
    .connect(url, { useUnifiedTopology: true })
    .catch((err) => {
      res.status(500).send(err);
    });
  if (!dbClient) return;

  // Try to delete the username's whole document in the given collection
  const dbObj = dbClient.db(db);
  const query = { _id: username };
  const result = await dbObj
    .collection(collection)
    .deleteOne(query)
    .catch((err) => {
      res.status(500).send(err);
    });
  if (!result) return;
  if (result["deletedCount"] === 0) return res.status(400).end("No deletion");

  // Try to delete the username's corresponding record in the central collection
  const centralCollection = "central";
  const centralQuery = { username: username, serviceCollection: collection };
  const centralRes = await dbObj
    .collection(centralCollection)
    .deleteOne(centralQuery)
    .catch((err) => {
      res.status(500).send(err);
    });
  if (!centralRes) return;
  if (result["deletedCount"] === 0) return res.status(400).end("No deletion");

  dbClient.close();
  return res.send(
    `${username}'s document in ${collection} has been successfully deleted!`
  );
});

// Handler for deleting all info belongs to one user
app.delete("/record/all", jsonParser, async (req, res) => {
  // Get all params from query
  const db = req.body.db;
  const username = req.body.username;

  // Connect to target DB
  const dbClient = await mongoClient
    .connect(url, { useUnifiedTopology: true })
    .catch((err) => {
      res.status(500).send(err);
    });
  if (!dbClient) return;

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
      res.status(500).send(err);
    });
  if (!result) return;
  if (result.length === 0) return res.status(400).end("Wrong user");

  // Try to go through the result collection list and delete the user's documents one-by-one
  let deletedCollectionList = [];
  const idQuery = { _id: username };
  for (let index = 0; index < result.length; index++) {
    let collection = result[index]["serviceCollection"];
    let deleteRes = await dbObj
      .collection(collection)
      .deleteOne(idQuery)
      .catch((err) => {
        res.status(500).send(err);
      });
    if (!deleteRes) return;
    if (deleteRes["deletedCount"] !== 0) deletedCollectionList.push(collection);
  }

  // Try to delete the username's corresponding record in the central collection
  const centralCollection = "central";
  for (let index = 0; index < result.length; index++) {
    let collection = result[index]["serviceCollection"];
    let centralQuery = { username: username, serviceCollection: collection };
    let centralRes = await dbObj
      .collection(centralCollection)
      .deleteOne(centralQuery)
      .catch((err) => {
        res.status(500).send(err);
      });
    if (!centralRes) return;
  }

  dbClient.close();
  return res.send(
    `${username}'s document in [${deletedCollectionList.join()}] has been successfully deleted!`
  );
});

app.listen(port, () => {
  console.log(`Scenario One app listening on port ${port}!`);
});
