require('dotenv').config();

const express = require('express');
const path = require('path');
const gamesRouter = require('./routes/games');
const { closeDriver, verifyConnectivity } = require('./db/neo4j');

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(express.json({ limit: '100kb' }));
app.use('/api/games', gamesRouter);
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API route not found' });
});
// Serve static files from the "pages" directory takes to index.html
app.use(express.static(path.join(__dirname, 'pages')));
app.use((req, res) => {
  res.status(404).send('Page not found');
});


app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  console.error(error);
  const status = error.status || error.statusCode || 500;
  res.status(status).json({
    error: status < 500 ? error.message : 'Internal server error',
  });
});

async function startServer() {
  await verifyConnectivity();
  const server = app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });

  const shutdown = () => {
    server.close(async (error) => {
      if (error) {
        console.error('Error closing the HTTP server:', error);
        process.exitCode = 1;
      }

      try {
        await closeDriver();
      } catch (closeError) {
        console.error('Error closing the Neo4j driver:', closeError);
        process.exitCode = 1;
      }
    });
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

startServer().catch(async (error) => {
  console.error('Unable to start the server. Check your Neo4j settings and connection:', error);
  try {
    await closeDriver();
  } catch (closeError) {
    console.error('Error closing the Neo4j driver:', closeError);
  }
  process.exitCode = 1;
});
