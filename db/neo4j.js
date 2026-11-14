const neo4j = require('neo4j-driver');

let driver;

function getDriver() {
  if (driver) {
    return driver;
  }

  const { NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD } = process.env;
  if (!NEO4J_URI || !NEO4J_USERNAME || !NEO4J_PASSWORD) {
    throw new Error(
      'Set NEO4J_URI, NEO4J_USERNAME, and NEO4J_PASSWORD in your .env file.'
    );
  }

  driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USERNAME, NEO4J_PASSWORD)
  );
  return driver;
}

function createSession() {
  return getDriver().session({
    database: process.env.NEO4J_DATABASE || 'neo4j',
  });
}

function verifyConnectivity() {
  return getDriver().verifyConnectivity();
}

function closeDriver() {
  return driver ? driver.close() : Promise.resolve();
}

module.exports = { closeDriver, createSession, verifyConnectivity };
