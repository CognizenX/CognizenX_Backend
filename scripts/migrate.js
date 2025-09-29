const mongoose = require("mongoose");

// Replace with your MongoDB Atlas connection string
const uri = "mongodb+srv://cognizennet:cognizennet@triviaquestions.gfew0.mongodb.net/?retryWrites=true&w=majority&appName=TriviaQuestions";
const sourceDB = "TriviaQuestions";
const targetDB = "dementia_database";
const collectionName = "triviacategories";

async function migrateData() {
  try {
    // Connect to MongoDB
    const connection = await mongoose.createConnection(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      dbName: sourceDB
    });

    const SourceModel = connection.model(collectionName, new mongoose.Schema({}, { strict: false }), collectionName);

    const docs = await SourceModel.find({});
    console.log(`Found ${docs.length} documents to migrate.`);
    console.log(docs)
    if (docs.length === 0) {
      console.log("No documents to migrate.");
      return;
    }

    // // Connect to target DB
    const targetConnection = await mongoose.createConnection(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      dbName: targetDB
    });

    const TargetModel = targetConnection.model(collectionName, new mongoose.Schema({}, { strict: false }), collectionName);

    await TargetModel.insertMany(docs);
    console.log("Migration completed successfully!");

    await connection.close();
    await targetConnection.close();
  } catch (err) {
    console.error("Migration failed:", err);
  }
}

migrateData();
