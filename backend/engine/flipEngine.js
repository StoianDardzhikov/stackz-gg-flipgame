const { hmacSha256Buffer } = require('../util/hmac');
const seedManager = require('./seeds');
const config = require('../config');

/**
 * Flip Game Engine
 *
 * Provably Fair Algorithm:
 * - Use HMAC-SHA256(serverSeed, clientSeed:nonce) to generate random value
 * - Take first byte and convert to percentage (0-100)
 * - Use configurable probabilities to determine result: HEADS, TAILS, or EDGE
 * - EDGE has lower probability but higher multiplier
 */

class FlipEngine {
  constructor() {
    this.currentRound = null;
    this.roundHistory = [];
    this.listeners = new Map();
  }

  /**
   * Initialize the engine
   */
  initialize() {
    seedManager.initialize();
    console.log('[FlipEngine] Initialized');
  }

  /**
   * Calculate flip result from seeds
   * Returns: 'HEADS', 'TAILS', or 'EDGE'
   */
  calculateFlipResult(serverSeed, clientSeed, nonce) {
    // Combine client seed and nonce
    const message = `${clientSeed}:${nonce}`;

    // Get HMAC-SHA256 hash
    const hash = hmacSha256Buffer(serverSeed, message);

    // Use first byte (0-255) to determine result
    const firstByte = hash[0];
    
    // Calculate probability ranges (0-100 scale)
    const probHeads = config.GAME.PROBABILITY_HEADS;
    const probTails = config.GAME.PROBABILITY_TAILS;
    const probEdge = config.GAME.PROBABILITY_EDGE;
    
    // Convert byte (0-255) to percentage (0-100)
    const percentage = (firstByte / 255) * 100;
    
    // Determine result based on probability ranges
    let result;
    if (percentage < probHeads) {
      result = 'HEADS';
    } else if (percentage < probHeads + probTails) {
      result = 'TAILS';
    } else {
      result = 'EDGE';
    }

    return result;
  }

  /**
   * Generate a new round
   */
  generateRound() {
    const serverSeed = seedManager.getCurrentServerSeed();
    const clientSeed = seedManager.getClientSeed();
    const nonce = seedManager.getNonce();

    const result = this.calculateFlipResult(serverSeed, clientSeed, nonce);

    const round = {
      id: `F-${Date.now()}-${nonce}`,
      serverSeed,
      serverSeedHash: require('../util/hmac').sha256(serverSeed),
      clientSeed,
      nonce,
      result, // HEADS, TAILS, or EDGE
      startTime: null,
      endTime: null,
      status: 'pending', // pending, betting, revealing, finished
      bets: new Map(), // playerId -> { choice, amount, sessionId }
      winners: new Map(), // playerId -> { winAmount }
      losers: new Map()  // playerId -> { betAmount }
    };

    this.currentRound = round;

    console.log(`[FlipEngine] Generated round ${round.id} with result ${result}`);

    return round;
  }

  /**
   * Start the betting phase
   */
  startBettingPhase() {
    if (!this.currentRound) {
      this.generateRound();
    }

    this.currentRound.status = 'betting';
    console.log(`[FlipEngine] Betting phase started for round ${this.currentRound.id}`);

    this.emit('betting_phase', {
      roundId: this.currentRound.id,
      serverSeedHash: this.currentRound.serverSeedHash,
      clientSeed: this.currentRound.clientSeed,
      nonce: this.currentRound.nonce,
      duration: config.GAME.BETTING_PHASE_MS
    });

    return this.currentRound;
  }

  /**
   * Start the reveal phase (show result)
   */
  startReveal() {
    if (!this.currentRound || this.currentRound.status !== 'betting') {
      throw new Error('No round in betting phase');
    }

    this.currentRound.status = 'revealing';
    this.currentRound.startTime = Date.now();

    console.log(`[FlipEngine] Round ${this.currentRound.id} revealing result: ${this.currentRound.result}`);

    // Calculate winners and losers
    this.calculateResults();

    this.emit('round_reveal', {
      roundId: this.currentRound.id,
      result: this.currentRound.result,
      serverSeedHash: this.currentRound.serverSeedHash,
      startTime: this.currentRound.startTime
    });

    return this.currentRound;
  }

  /**
   * Calculate winners and losers
   */
  calculateResults() {
    if (!this.currentRound) return;

    for (const [playerId, bet] of this.currentRound.bets) {
      if (bet.choice === this.currentRound.result) {
        // Winner - use different multiplier for EDGE
        const multiplier = this.currentRound.result === 'EDGE' 
          ? config.GAME.EDGE_MULTIPLIER 
          : config.GAME.PAYOUT_MULTIPLIER;
        const winAmount = Math.floor(bet.amount * multiplier * 100) / 100;
        this.currentRound.winners.set(playerId, {
          betAmount: bet.amount,
          winAmount,
          choice: bet.choice
        });
      } else {
        // Loser
        this.currentRound.losers.set(playerId, {
          betAmount: bet.amount,
          choice: bet.choice
        });
      }
    }
  }

  /**
   * Finish the round
   */
  finishRound() {
    if (!this.currentRound) return null;

    this.currentRound.status = 'finished';
    this.currentRound.endTime = Date.now();

    console.log(`[FlipEngine] Round ${this.currentRound.id} finished. Result: ${this.currentRound.result}`);

    // Prepare verification data
    const verificationData = {
      roundId: this.currentRound.id,
      result: this.currentRound.result,
      serverSeed: this.currentRound.serverSeed,
      serverSeedHash: this.currentRound.serverSeedHash,
      clientSeed: this.currentRound.clientSeed,
      nonce: this.currentRound.nonce
    };

    this.emit('round_finished', verificationData);

    // Store in history
    this.roundHistory.unshift({
      id: this.currentRound.id,
      result: this.currentRound.result,
      serverSeed: this.currentRound.serverSeed,
      serverSeedHash: this.currentRound.serverSeedHash,
      clientSeed: this.currentRound.clientSeed,
      nonce: this.currentRound.nonce,
      startTime: this.currentRound.startTime,
      endTime: this.currentRound.endTime,
      winnersCount: this.currentRound.winners.size,
      losersCount: this.currentRound.losers.size
    });

    // Keep only last 50 rounds in memory
    if (this.roundHistory.length > 50) {
      this.roundHistory.pop();
    }

    // Advance to next seed
    seedManager.advanceToNextSeed();

    const finishedRound = this.currentRound;
    this.currentRound = null;

    return {
      round: finishedRound,
      winners: Array.from(finishedRound.winners.entries()).map(([playerId, data]) => ({
        playerId,
        ...data
      })),
      losers: Array.from(finishedRound.losers.entries()).map(([playerId, data]) => ({
        playerId,
        ...data
      })),
      verification: verificationData
    };
  }

  /**
   * Add a bet to current round
   * choice: 'HEADS', 'TAILS', or 'EDGE'
   */
  addBet(playerId, amount, choice, sessionId) {
    if (!this.currentRound) {
      throw new Error('No active round');
    }

    if (this.currentRound.status !== 'betting') {
      throw new Error('Betting phase has ended');
    }

    if (choice !== 'HEADS' && choice !== 'TAILS' && choice !== 'EDGE') {
      throw new Error('Invalid choice. Must be HEADS, TAILS, or EDGE');
    }

    if (this.currentRound.bets.has(playerId)) {
      throw new Error('Already placed a bet this round');
    }

    const bet = {
      playerId,
      sessionId,
      amount,
      choice,
      placedAt: Date.now()
    };

    this.currentRound.bets.set(playerId, bet);

    console.log(`[FlipEngine] Player ${playerId} bet ${amount} on ${choice}`);

    return bet;
  }

  /**
   * Get current round state
   */
  getCurrentRound() {
    if (!this.currentRound) return null;

    return {
      id: this.currentRound.id,
      status: this.currentRound.status,
      result: this.currentRound.status === 'revealing' || this.currentRound.status === 'finished' 
        ? this.currentRound.result 
        : null,
      serverSeedHash: this.currentRound.serverSeedHash,
      clientSeed: this.currentRound.clientSeed,
      nonce: this.currentRound.nonce,
      betsCount: this.currentRound.bets.size,
      startTime: this.currentRound.startTime
    };
  }

  /**
   * Get round history
   */
  getHistory(limit = 20) {
    return this.roundHistory.slice(0, limit);
  }

  /**
   * Get player's bet in current round
   */
  getPlayerBet(playerId) {
    if (!this.currentRound) return null;
    return this.currentRound.bets.get(playerId) || null;
  }

  /**
   * Check if player won
   */
  didPlayerWin(playerId) {
    if (!this.currentRound || this.currentRound.status === 'betting') return null;
    return this.currentRound.winners.has(playerId);
  }

  /**
   * Get player win amount
   */
  getPlayerWinAmount(playerId) {
    if (!this.currentRound) return null;
    const winner = this.currentRound.winners.get(playerId);
    return winner ? winner.winAmount : null;
  }

  /**
   * Event handling
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  emit(event, data) {
    const callbacks = this.listeners.get(event) || [];
    callbacks.forEach(cb => cb(data));
  }
}

// Singleton
const flipEngine = new FlipEngine();

module.exports = flipEngine;

