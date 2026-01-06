module.exports = {
  // Server configuration
  PORT: process.env.PORT || 3001,

  // Provider secret for HMAC signature validation
  PROVIDER_SECRET: process.env.PROVIDER_SECRET || 'your-provider-secret-key-change-in-production',

  // Game configuration
  GAME: {
    ROUND_DELAY_MS: 2000,           // Delay between rounds
    BETTING_PHASE_MS: 60000,        // Time for players to place bets (60 seconds / 1 minute)
    RESULT_REVEAL_MS: 5000,         // Time to show result before next round
    MIN_BET: 1,
    MAX_BET: 100000000000,
    PAYOUT_MULTIPLIER: 1.95,        // Payout multiplier for HEADS/TAILS (1.95x = 2.5% house edge)
    EDGE_MULTIPLIER: 10.0,          // Payout multiplier for EDGE (higher reward)
    // Probabilities (must add up to 100)
    PROBABILITY_HEADS: 48.65,          // 45% chance
    PROBABILITY_TAILS: 48.65,          // 45% chance
    PROBABILITY_EDGE: 2.7,           // 10% chance (rare)
  },

  // Callback configuration
  CALLBACK: {
    TIMEOUT_MS: 10000,              // Platform callback timeout
    RETRY_ATTEMPTS: 3,
    RETRY_DELAY_MS: 1000,
  },

  // Session configuration
  SESSION: {
    EXPIRY_MS: 24 * 60 * 60 * 1000, // 24 hours
  }
};

