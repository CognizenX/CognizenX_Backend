const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

let mongo;

jest.setTimeout(60000);

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  const uri = mongo.getUri();

  await mongoose.connect(uri);
});

afterEach(async () => {
  if (!mongoose.connection?.db) {
    return;
  }

  const collections = await mongoose.connection.db.collections();
  for (const collection of collections) {
    await collection.deleteMany();
  }
});

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }

  if (mongo) {
    await mongo.stop();
  }
});
