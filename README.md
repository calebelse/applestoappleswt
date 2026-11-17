# applestoappleswt

This is a basic Apples to Apples game where you can spend green cards to get
power-ups such as Double or Nothing.

## Getting started

1. Install [Node.js](https://nodejs.org/) and start a Neo4j database, either locally or through Neo4j Aura.
2. In a terminal, go to the project folder and install dependencies:

   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env` and set the connection URI, username, and password for your Neo4j database. In PowerShell:

   ```powershell
   Copy-Item .env.example .env
   ```

4. Start the server:

   ```bash
   npm start
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser. The server checks its Neo4j connection before starting.

To stop the server, press `Ctrl+C` in the terminal.

The EJS page templates are in `pages/`. Account registration creates a `User`
node with a scrypt password hash. The server creates a uniqueness constraint
for usernames at startup. Login and password recovery still need to be
implemented.

## Game API

The API uses JSON request and response bodies:

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/games` | List games |
| `POST` | `/api/games` | Create a game with an optional `name` |
| `GET` | `/api/games/:gameId` | Get a game, its players, and their recorded choices |
| `POST` | `/api/games/:gameId/players` | Add a player with a `name` |
| `POST` | `/api/games/:gameId/players/:playerId/choices` | Record a card choice with `name`, `type` (`red` or `green`), and positive integer `round` |

For example, create a game by sending `POST /api/games` with:

```json
{
  "name": "Friday game"
}
```

The response contains the new game's ID. Use it in the player and choice routes. Game, player, and card data are stored as Neo4j nodes; relationships connect games to players and players to played cards.
