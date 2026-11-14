const express = require('express');
const neo4j = require('neo4j-driver');
const { randomUUID } = require('crypto');
const { createSession } = require('../db/neo4j');

const router = express.Router();

async function runWithSession(work) {
  const session = createSession();
  try {
    return await work(session);
  } finally {
    await session.close();
  }
}

function toJson(value) {
  if (neo4j.isInt(value)) {
    return value.toNumber();
  }
  if (Array.isArray(value)) {
    return value.map(toJson);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, toJson(item)])
    );
  }
  return value;
}

function isNonEmptyString(value, maxLength) {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.trim().length <= maxLength
  );
}

router.get('/', async (req, res) => {
  const result = await runWithSession((session) =>
    session.executeRead((tx) =>
      tx.run(
        'MATCH (game:Game) RETURN properties(game) AS game ORDER BY game.createdAt DESC'
      )
    )
  );
  res.json(result.records.map((record) => toJson(record.get('game'))));
});

router.post('/', async (req, res) => {
  const { name } = req.body || {};
  if (name !== undefined && !isNonEmptyString(name, 120)) {
    return res.status(400).json({
      error: 'Name must be a non-empty string of at most 120 characters.',
    });
  }

  const game = {
    id: randomUUID(),
    name: name ? name.trim() : 'New game',
    status: 'waiting',
    createdAt: new Date().toISOString(),
  };

  await runWithSession((session) =>
    session.executeWrite((tx) =>
      tx.run(
        'CREATE (game:Game $properties) RETURN properties(game) AS game',
        { properties: game }
      )
    )
  );
  res.status(201).json(game);
});

router.get('/:gameId', async (req, res) => {
  const result = await runWithSession((session) =>
    session.executeRead((tx) =>
      tx.run(
        `MATCH (game:Game {id: $gameId})
         OPTIONAL MATCH (game)-[:HAS_PLAYER]->(player:Player)
         OPTIONAL MATCH (player)-[played:PLAYED]->(card:Card)
         WITH game, player,
              collect(CASE WHEN card IS NULL THEN null ELSE {
                id: card.id,
                name: card.name,
                type: card.type,
                round: played.round,
                playedAt: played.playedAt
              } END) AS choices
         RETURN properties(game) AS game,
                collect(CASE WHEN player IS NULL THEN null
                  ELSE properties(player) + {choices: choices}
                END) AS players`,
        { gameId: req.params.gameId }
      )
    )
  );

  if (result.records.length === 0) {
    return res.status(404).json({ error: 'Game not found' });
  }
  res.json(toJson(result.records[0].toObject()));
});

router.post('/:gameId/players', async (req, res) => {
  const { name } = req.body || {};
  if (!isNonEmptyString(name, 80)) {
    return res.status(400).json({
      error: 'Name must be a non-empty string of at most 80 characters.',
    });
  }

  const player = { id: randomUUID(), name: name.trim() };
  const result = await runWithSession((session) =>
    session.executeWrite((tx) =>
      tx.run(
        `MATCH (game:Game {id: $gameId})
         CREATE (player:Player $properties)
         CREATE (game)-[:HAS_PLAYER]->(player)
         RETURN properties(player) AS player`,
        { gameId: req.params.gameId, properties: player }
      )
    )
  );

  if (result.records.length === 0) {
    return res.status(404).json({ error: 'Game not found' });
  }
  res.status(201).json(toJson(result.records[0].get('player')));
});

router.post('/:gameId/players/:playerId/choices', async (req, res) => {
  const { name, type, round } = req.body || {};
  if (!isNonEmptyString(name, 160)) {
    return res.status(400).json({
      error: 'Card name must be a non-empty string of at most 160 characters.',
    });
  }
  if (type !== 'red' && type !== 'green') {
    return res.status(400).json({
      error: 'Card type must be "red" or "green".',
    });
  }
  if (!Number.isSafeInteger(round) || round < 1) {
    return res.status(400).json({
      error: 'Round must be a positive integer.',
    });
  }

  const card = {
    id: randomUUID(),
    name: name.trim(),
    type,
    round,
    playedAt: new Date().toISOString(),
  };
  const result = await runWithSession((session) =>
    session.executeWrite((tx) =>
      tx.run(
        `MATCH (game:Game {id: $gameId})-[:HAS_PLAYER]->(player:Player {id: $playerId})
         CREATE (card:Card {id: $id, name: $name, type: $type})
         CREATE (player)-[:PLAYED {round: $round, playedAt: $playedAt}]->(card)
         RETURN properties(card) + {
           round: $round,
           playedAt: $playedAt
         } AS choice`,
        {
          gameId: req.params.gameId,
          playerId: req.params.playerId,
          ...card,
        }
      )
    )
  );

  if (result.records.length === 0) {
    return res.status(404).json({ error: 'Game or player not found' });
  }
  res.status(201).json(toJson(result.records[0].get('choice')));
});

module.exports = router;
