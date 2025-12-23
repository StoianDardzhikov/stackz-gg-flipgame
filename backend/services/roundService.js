const flipEngine = require('../engine/flipEngine');
const betService = require('./betService');
const config = require('../config');

/**
 * Round Service
 * Manages round lifecycle: betting -> revealing -> finished -> next round
 */

class RoundService {
  constructor() {
    this.isRunning = false;
    this.gameNamespace = null;
    this.controlsNamespace = null;
  }

  /**
   * Set WebSocket namespaces for broadcasting
   */
  setNamespaces(gameNamespace, controlsNamespace) {
    this.gameNamespace = gameNamespace;
    this.controlsNamespace = controlsNamespace;
  }

  /**
   * Initialize and start the game loop
   */
  start() {
    if (this.isRunning) {
      console.log('[RoundService] Already running');
      return;
    }

    flipEngine.initialize();
    this.isRunning = true;

    // Set up flip engine event listeners
    this.setupEngineListeners();

    // Start first round
    this.startNewRound();

    console.log('[RoundService] Started');
  }

  /**
   * Stop the game loop
   */
  stop() {
    this.isRunning = false;
    console.log('[RoundService] Stopped');
  }

  /**
   * Setup flip engine event listeners
   */
  setupEngineListeners() {
    flipEngine.on('betting_phase', (data) => {
      this.broadcast('betting_phase', data);
    });

    flipEngine.on('round_reveal', (data) => {
      this.broadcast('round_reveal', data);
    });

    flipEngine.on('round_finished', (data) => {
      // Broadcast round finished event
      this.broadcast('round_finished', data);
    });
  }

  /**
   * Broadcast to both namespaces
   */
  broadcast(event, data) {
    if (this.gameNamespace) {
      this.gameNamespace.emit(event, data);
    }
    if (this.controlsNamespace) {
      this.controlsNamespace.emit(event, data);
    }
  }

  /**
   * Start a new round
   */
  async startNewRound() {
    if (!this.isRunning) return;

    // Generate new round
    flipEngine.generateRound();

    // Start betting phase
    flipEngine.startBettingPhase();

    // Wait for betting phase to complete
    setTimeout(() => {
      this.revealRound();
    }, config.GAME.BETTING_PHASE_MS);
  }

  /**
   * Reveal round result
   */
  revealRound() {
    if (!this.isRunning) return;

    const round = flipEngine.getCurrentRound();
    if (!round || round.status !== 'betting') {
      console.error('[RoundService] Cannot reveal round - invalid state');
      return;
    }

    // Start the reveal
    flipEngine.startReveal();

    // Wait for reveal phase, then finish
    setTimeout(() => {
      this.finishRound();
    }, config.GAME.RESULT_REVEAL_MS);
  }

  /**
   * Finish round and process results
   */
  async finishRound() {
    if (!this.isRunning) return;

    const result = flipEngine.finishRound();
    if (!result) return;

    const { round, winners, losers, verification } = result;

    console.log(`[RoundService] Round ${round.id} finished. Result: ${round.result}`);

    // Process winners and losers
    const processResults = await betService.processRoundResults(round.id, winners, losers);

    // Send results to controls namespace
    if (this.controlsNamespace) {
      // Notify each player individually
      for (const winner of winners) {
        const session = require('./sessionService').getSessionByPlayerId(winner.playerId);
        if (session && session.controlsSocketId) {
          // Find the processed result to get the new balance
          const processedResult = processResults.find(r => r.playerId === winner.playerId);
          
          this.controlsNamespace.to(session.controlsSocketId).emit('bet_won', {
            roundId: round.id,
            result: round.result,
            betAmount: winner.betAmount,
            winAmount: winner.winAmount,
            choice: winner.choice,
            newBalance: processedResult && processedResult.success ? processedResult.newBalance : null
          });

          // Send balance update if we have the new balance
          if (processedResult && processedResult.success && processedResult.newBalance !== undefined) {
            this.controlsNamespace.to(session.controlsSocketId).emit('balance_update', {
              balance: processedResult.newBalance,
              currency: session.currency
            });
          }
        }
      }

      for (const loser of losers) {
        const session = require('./sessionService').getSessionByPlayerId(loser.playerId);
        if (session && session.controlsSocketId) {
          this.controlsNamespace.to(session.controlsSocketId).emit('bet_lost', {
            roundId: round.id,
            result: round.result,
            betAmount: loser.betAmount,
            choice: loser.choice
          });
        }
      }
    }

    // Wait before starting next round
    setTimeout(() => {
      this.startNewRound();
    }, config.GAME.ROUND_DELAY_MS);
  }

  /**
   * Get current round state
   */
  getCurrentRoundState() {
    return flipEngine.getCurrentRound();
  }

  /**
   * Get round history
   */
  getHistory(limit = 20) {
    return flipEngine.getHistory(limit);
  }

  /**
   * Check if in betting phase
   */
  isInBettingPhase() {
    const round = flipEngine.getCurrentRound();
    return round && round.status === 'betting';
  }
}

// Singleton
const roundService = new RoundService();

module.exports = roundService;

