/*jshint esversion: 6 */
const express = require("express");
const bodyParser = require("body-parser");
const app = express();

// create application/json parser
const jsonParser = bodyParser.json();

// create application/x-www-form-urlencoded parser
const urlencodedParser = bodyParser.urlencoded({ extended: false });

const port = 9000;

// MongoDB instance
let mongo = require("mongodb");
let mongoClient = mongo.MongoClient;
let url =
    "mongodb+srv://yiwei:yiwei@cluster0.iwciw.mongodb.net/test?authSource=admin&replicaSet=atlas-m7bgyt-shard-0&readPreference=primary&appname=MongoDB%20Compass&ssl=true";

// Handler for adding new record to service collection
app.post("/record", jsonParser, async (req, res) => {
    // Check if consent is included and valid
    if (
        !req.body.consentExp ||
        new Date(req.body.consentExp) <= new Date(Date.now())
    ) {
        return res.status(400).end("No/invalid consent expire date");
    }
    // Check if userId is included
    if (!req.body.userId) return res.status(400).end("No userId");
    // Convert all json element starts with "date" to Date obj
    let recordObj = req.body.record;
    for (rec in recordObj) {
        if (rec.startsWith("date")) {
            recordObj[rec] = new Date(recordObj[rec]);
        }
    }
    // Use userId as the unique identifier
    recordObj._id = req.body.userId;

    // Connect to target DB
    const dbClient = await mongoClient
        .connect(url, { useUnifiedTopology: true })
        .catch((err) => {
            res.status(500).send(err);
        });
    if (!dbClient) return;

    // Try to insert the new record to the target collection
    const dbObj = dbClient.db(req.body.db);
    const result = await dbObj
        .collection(req.body.collection)
        .insertOne(recordObj)
        .catch((err) => {
            res.status(500).send(err);
        });
    if (!result) return;

    // Try to insert a new record to central collection b/c new record added to target collection
    const recordCentralObj = {
        userId: req.body.userId,
        serviceCollection: req.body.collection,
        consentExp: new Date(req.body.consentExp),
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

app.listen(port, () => {
    console.log(`Example app listening on port ${port}!`);
});
