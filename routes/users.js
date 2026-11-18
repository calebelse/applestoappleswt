const { promisify } = require('util');
const {
  randomBytes,
  randomUUID,
  scrypt: scryptCallback,
  timingSafeEqual,
} = require('crypto');
const express = require('express');
const { createSession } = require('../db/neo4j');

const scrypt = promisify(scryptCallback);
const router = express.Router();
const dummySalt = randomBytes(16).toString('hex');
const dummyHash = Buffer.alloc(64);

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
      error: 'Password must be between 3 and 20 characters.',
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

router.post('/login', async (req, res, next) => {
  const { username, password } = req.body || {};
  if (
    typeof username !== 'string' ||
    typeof password !== 'string' ||
    username.trim().length === 0 ||
    password.length === 0
  ) {
    return res.status(400).render('index', {
      error: 'Enter your username and password.',
    });
  }

  const normalizedUsername = username.trim().toLowerCase();
  const session = createSession();
  let user;

  try {
    const result = await session.executeRead((tx) =>
      tx.run(
        `MATCH (user:User {username: $username})
         RETURN user.id AS id,
                user.username AS username,
                user.passwordHash AS passwordHash`,
        { username: normalizedUsername }
      )
    );
    user = result.records[0]?.toObject();
  } catch (error) {
    return next(error);
  } finally {
    await session.close();
  }

  const storedHash = user?.passwordHash;
  const hashParts =
    typeof storedHash === 'string' &&
    storedHash.match(/^scrypt\$([a-f0-9]{32})\$([a-f0-9]{128})$/);
  const salt = hashParts ? hashParts[1] : dummySalt;
  const expectedHash = hashParts ? Buffer.from(hashParts[2], 'hex') : dummyHash;
  const actualHash = await scrypt(password, salt, 64);
  const passwordMatches = timingSafeEqual(actualHash, expectedHash);

  if (!user || !hashParts || !passwordMatches) {
    return res.status(401).render('index', {
      error: 'Invalid username or password.',
    });
  }

  try {
    await new Promise((resolve, reject) => {
      req.session.regenerate((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    req.session.user = { id: user.id, username: user.username };
    await new Promise((resolve, reject) => {
      req.session.save((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  } catch (error) {
    return next(error);
  }

  res.redirect('/setup');
});

router.post('/logout', (req, res, next) => {
  req.session.destroy((error) => {
    if (error) {
      return next(error);
    }
    res.clearCookie('apples.sid');
    res.redirect('/');
  });
});

module.exports = router;
