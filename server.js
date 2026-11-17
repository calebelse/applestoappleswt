require('dotenv').config();

const express = require('express');
const path = require('path');
const gamesRouter = require('./routes/games');
const usersRouter = require('./routes/users');
const {
  closeDriver,
  ensureSchema,
  verifyConnectivity,
} = require('./db/neo4j');

const app = express();
const port = Number(process.env.PORT || 3000);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'pages'));

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false }));
app.use('/api/games', gamesRouter);
app.use('/api', usersRouter);

app.get('/', (req, res) => {
  res.render('index', {
    registered: req.query.registered === '1',
  });
});

app.get('/register', (req, res) => {
  res.render('register');
});

app.get('/forgot-password', (req, res) => {
  res.render('forgot-password');
});

app.get('/game', (req, res) => {
  res.render('game');
});

app.get('/master', (req, res) => {
  res.render('master');
});

app.post('/api/login', (req, res) => {
  res.status(501).render('index', {
    error: 'Login is not implemented yet.',
  });
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API route not found' });
});

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
  await ensureSchema();
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
  console.error(
    'Unable to start the server. Check your Neo4j settings and connection:',
    error
  );
  try {
    await closeDriver();
  } catch (closeError) {
    console.error('Error closing the Neo4j driver:', closeError);
  }
  process.exitCode = 1;
});
