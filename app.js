/*jshint esversion: 6 */
const express = require('express')
const app = express();
const port = 8000;

// MongoDB instance
let mongo = require('mongodb');
let mongoClient = mongo.MongoClient;
let url = "mongodb+srv://pingfan:pingfan@cluster0.iwciw.mongodb.net/test?authSource=admin&replicaSet=atlas-m7bgyt-shard-0&readPreference=primary&appname=MongoDB%20Compass&ssl=true"


app.get('/', (req, res) => {
  res.send('Hello World!')
});

app.post('/record', (req, res) => {
  console.log("req.body:", req.body);
  res.send('Hello World!')
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}!`)
});