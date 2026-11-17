const { promisify } = require('util');
const { randomBytes, randomUUID, scrypt: scryptCallback } = require('crypto');
const express = require('express');
const { createSession } = require('../db/neo4j');

const scrypt = promisify(scryptCallback);
const router = express.Router();

function isUsername(value) {
  return (
    typeof value === 'string' &&
    /^[a-zA-Z0-9_-]{3,32}$/.test(value.trim())
  );
}

function isPassword(value) {
  return (
    typeof value === 'string' &&
    value.length >= 3 &&
    value.length <= 20
  );
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${derivedKey.toString('hex')}`;
}

function isUsernameConflict(error) {
  return error.code === 'Neo.ClientError.Schema.ConstraintValidationFailed';
}

router.post('/register', async (req, res, next) => {
  const { username, password } = req.body || {};
  if (!isUsername(username)) {
    return res.status(400).render('register', {
      error: 'Username must be 3–32 characters using letters, numbers, underscores, or hyphens.',
      username: typeof username === 'string' ? username : '',
    });
  }
  if (!isPassword(password)) {
    return res.status(400).render('register', {
      error: 'Password must be between 12 and 128 characters.',
      username: username.trim(),
    });
  }

  const normalizedUsername = username.trim().toLowerCase();
  const passwordHash = await hashPassword(password);
  const session = createSession();

  try {
    await session.executeWrite((tx) =>
      tx.run(
        `CREATE (user:User {
          id: $id,
          username: $username,
          passwordHash: $passwordHash,
          createdAt: $createdAt
        })`,
        {
          id: randomUUID(),
          username: normalizedUsername,
          passwordHash,
          createdAt: new Date().toISOString(),
        }
      )
    );
  } catch (error) {
    if (isUsernameConflict(error)) {
      return res.status(409).render('register', {
        error: 'That username is already taken.',
        username: username.trim(),
      });
    }
    return next(error);
  } finally {
    await session.close();
  }

  res.redirect('/?registered=1');
});

module.exports = router;
