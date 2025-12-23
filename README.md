# Flip Game Provider

A complete flip (coin flip) gambling game provider system with provably fair algorithm, WebSocket communication, and platform callback integration.

## Architecture Overview

This is a **game provider**, not a casino platform. The provider:
- Serves the game via two iframes (game visualization + player controls)
- Manages game rounds and provably fair flip results (HEADS/TAILS)
- Communicates with the platform backend via HTTP callbacks for balance operations
- Does NOT store player balances (managed by platform)

## Quick Start

```bash
# Install dependencies
npm install

# Start the server
npm start

# Development mode (auto-restart on changes)
npm run dev

# Start mock platform for testing
npm run platform

# Start both server and platform
npm run demo
```

Server runs on port 3001 by default (configurable via PORT env variable).

## Platform Integration

### 1. Initialize Session

Platform calls this when a player wants to play:

```http
POST /session/init
Content-Type: application/json

{
  "playerId": "player123",
  "currency": "EUR",
  "token": "random-token-from-platform",
  "timestamp": 1699999999999,
  "signature": "hmac-sha256-signature",
  "callbackBaseUrl": "https://platform.com/game-callbacks"
}
```

Response:
```json
{
  "success": true,
  "sessionId": "SESSION-uuid",
  "gameUrl": "/game-iframe?sessionId=SESSION-uuid",
  "controlsUrl": "/controls-iframe?sessionId=SESSION-uuid"
}
```

### 2. Embed Iframes

Platform embeds two iframes using the returned URLs:

```html
<!-- Game visualization (read-only) -->
<iframe src="https://provider.com/game-iframe?sessionId=SESSION-uuid"></iframe>

<!-- Player controls (bet) -->
<iframe src="https://provider.com/controls-iframe?sessionId=SESSION-uuid"></iframe>
```

### 3. Implement Callback Endpoints

The platform must implement these HTTP endpoints (same as crash game):

- `POST /game-callbacks/bet` - Deduct player balance
- `POST /game-callbacks/win` - Credit player winnings
- `POST /game-callbacks/rollback` - Refund failed transactions
- `POST /game-callbacks/balance` - Fetch current balance

## WebSocket Communication

### Game Namespace (/ws/game)

Read-only namespace for game visualization.

**Server → Client Events:**
- `betting_phase` - Betting phase started
- `round_reveal` - Result being revealed
- `round_finished` - Round finished
- `history` - Round history

### Controls Namespace (/ws/controls)

Interactive namespace for player controls.

**Client → Server Events:**
- `bet` - Place a bet: `{ amount: 10.00, choice: "HEADS" | "TAILS" | "EDGE" }`
- `get_balance` - Request balance refresh

**Server → Client Events:**
- `balance_update` - Balance changed
- `bet_result` - Bet placement result
- `bet_won` - Bet won
- `bet_lost` - Bet lost
- `betting_phase` - New betting phase
- `round_reveal` - Result revealing
- `round_finished` - Round finished
- `error` - Error message

## Provably Fair System

### Algorithm

The flip result is calculated using:

```javascript
hash = HMAC_SHA256(serverSeed, clientSeed:nonce)
percentage = (hash[0] / 255) * 100
if (percentage < PROBABILITY_HEADS) result = 'HEADS'
else if (percentage < PROBABILITY_HEADS + PROBABILITY_TAILS) result = 'TAILS'
else result = 'EDGE'
```

This creates a configurable probability distribution (default: 45% HEADS, 45% TAILS, 10% EDGE).
EDGE has a lower probability but a higher payout multiplier.

### Seed Chain

Same as crash game - uses pre-generated hash chain with seeds revealed after each round for verification.

### Verification Endpoint

```http
GET /provably-fair
```

Returns current verification data and recent round seeds.

```http
POST /provably-fair/verify
Content-Type: application/json

{
  "serverSeed": "abc123...",
  "clientSeed": "xyz789...",
  "nonce": 42
}
```

Returns calculated flip result for verification.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/session/init` | POST | Initialize player session |
| `/session/:sessionId` | GET | Get session info |
| `/game-iframe` | GET | Game visualization iframe |
| `/controls-iframe` | GET | Player controls iframe |
| `/provably-fair` | GET | Verification data |
| `/provably-fair/verify` | POST | Verify a round |
| `/game/state` | GET | Current game state |
| `/game/history` | GET | Round history |
| `/health` | GET | Health check |

## Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3001 | Server port |
| `PROVIDER_SECRET` | (set in config) | HMAC secret for signatures |

Game settings in `backend/config.js`:

```javascript
GAME: {
  ROUND_DELAY_MS: 2000,      // Delay between rounds
  BETTING_PHASE_MS: 10000,   // Betting phase duration (10 seconds)
  RESULT_REVEAL_MS: 3000,    // Time to show result
  MIN_BET: 1,
  MAX_BET: 100000000000,
    PAYOUT_MULTIPLIER: 1.95,   // Payout for HEADS/TAILS (1.95x = 2.5% house edge)
    EDGE_MULTIPLIER: 10.0,     // Payout for EDGE (higher reward for rare outcome)
    PROBABILITY_HEADS: 45,     // 45% chance
    PROBABILITY_TAILS: 45,     // 45% chance
    PROBABILITY_EDGE: 10,      // 10% chance (rare)
}
```

## Round Lifecycle

```
WAITING → BETTING (10s) → REVEALING (3s) → FINISHED (2s delay) → WAITING
```

1. **BETTING**: Players can place bets on HEADS, TAILS, or EDGE (10 seconds)
2. **REVEALING**: Result is revealed with coin flip animation (3 seconds)
3. **FINISHED**: Winners are credited, losers lose their bets
4. **WAITING**: 2 second delay before next round

## File Structure

```
├── backend/
│   ├── server.js              # Main server entry point
│   ├── config.js              # Configuration
│   ├── engine/
│   │   ├── flipEngine.js      # Flip game engine
│   │   └── seeds.js           # Seed management
│   ├── services/
│   │   ├── sessionService.js  # Session management
│   │   ├── callbackService.js # Platform HTTP callbacks
│   │   ├── betService.js      # Bet handling
│   │   └── roundService.js    # Round lifecycle
│   ├── ws/
│   │   ├── gameNamespace.js   # Game WebSocket handler
│   │   └── controlsNamespace.js # Controls WebSocket handler
│   └── util/
│       └── hmac.js            # Crypto utilities
├── frontend/
│   ├── game-iframe/
│   │   ├── index.html         # Game visualization
│   │   └── game.js
│   └── controls-iframe/
│       ├── index.html         # Player controls
│       └── controls.js
├── mock-platform/
│   ├── index.html             # Demo page
│   └── server.js              # Mock platform server
├── package.json
└── README.md
```

## Security Considerations

1. **Signature Validation**: All session init requests should be signed by the platform
2. **Callback Authentication**: Provider signs all callbacks with `X-Provider-Signature` header
3. **Session Expiry**: Sessions expire after 24 hours
4. **Rate Limiting**: Implement rate limiting in production
5. **HTTPS**: Always use HTTPS in production
6. **CORS**: Configure proper CORS origins in production

