const flipEngine = require('../engine/flipEngine');
const sessionService = require('./sessionService');
const callbackService = require('./callbackService');
const config = require('../config');

/**
 * Bet Service
 * Handles bet placement and win processing with platform callbacks
 */

class BetService {
  constructor() {
    // Track active bets with their transaction IDs
    this.activeBets = new Map(); // playerId -> { bet, transactionId }
  }

  /**
   * Place a bet
   * choice: 'HEADS', 'TAILS', or 'EDGE'
   */
  async placeBet(sessionId, amount, choice) {
    // Validate session
    const session = sessionService.validateSession(sessionId);
    const { playerId, currency, callbackBaseUrl } = session;

    // Validate bet amount
    if (typeof amount !== 'number' || isNaN(amount)) {
      throw new Error('Invalid bet amount');
    }

    if (amount < config.GAME.MIN_BET) {
      throw new Error(`Minimum bet is ${config.GAME.MIN_BET}`);
    }

    if (amount > config.GAME.MAX_BET) {
      throw new Error(`Maximum bet is ${config.GAME.MAX_BET}`);
    }

    // Validate choice
    if (choice !== 'HEADS' && choice !== 'TAILS' && choice !== 'EDGE') {
      throw new Error('Invalid choice. Must be HEADS, TAILS, or EDGE');
    }

    // Check if player already has a bet this round
    const existingBet = flipEngine.getPlayerBet(playerId);
    if (existingBet) {
      throw new Error('Already placed a bet this round');
    }

    // Get current round
    const round = flipEngine.getCurrentRound();
    if (!round) {
      throw new Error('No active round');
    }

    if (round.status !== 'betting') {
      throw new Error('Betting phase has ended');
    }

    // Round the amount to 2 decimal places
    const roundedAmount = Math.round(amount * 100) / 100;

    // Call platform to deduct balance
    const callbackResult = await callbackService.placeBet({
      callbackBaseUrl,
      roundId: round.id,
      playerId,
      sessionId,
      amount: roundedAmount,
      currency
    });

    if (!callbackResult.success) {
      // Platform rejected the bet
      throw new Error(callbackResult.message || callbackResult.code || 'Bet rejected by platform');
    }

    // Register bet with flip engine
    try {
      const bet = flipEngine.addBet(playerId, roundedAmount, choice, sessionId);

      // Track the bet with transaction ID
      this.activeBets.set(playerId, {
        bet,
        transactionId: callbackResult.transactionId,
        roundId: round.id,
        callbackBaseUrl,
        currency
      });

      // Update cached balance
      sessionService.updateBalance(sessionId, callbackResult.newBalance);

      console.log(`[BetService] Bet placed: player=${playerId}, amount=${roundedAmount}, choice=${choice}, txId=${callbackResult.transactionId}`);

      return {
        success: true,
        bet: {
          amount: roundedAmount,
          choice,
          roundId: round.id,
          transactionId: callbackResult.transactionId
        },
        newBalance: callbackResult.newBalance
      };
    } catch (error) {
      // If we failed to register the bet after platform deducted balance, rollback
      console.error(`[BetService] Failed to register bet, initiating rollback:`, error.message);

      await callbackService.rollback({
        callbackBaseUrl,
        roundId: round.id,
        playerId,
        sessionId,
        amount: roundedAmount,
        currency,
        originalTransactionId: callbackResult.transactionId,
        reason: 'REGISTRATION_FAILED'
      });

      throw error;
    }
  }

  /**
   * Process round results - handle winners and losers
   * Called by round service when round finishes
   */
  async processRoundResults(roundId, winners, losers) {
    const results = [];

    // Process winners
    for (const winner of winners) {
      const activeBet = this.activeBets.get(winner.playerId);
      if (activeBet) {
        try {
          // Call platform to credit winnings
          const callbackResult = await callbackService.creditWin({
            callbackBaseUrl: activeBet.callbackBaseUrl,
            roundId,
            playerId: winner.playerId,
            sessionId: activeBet.bet.sessionId,
            betAmount: winner.betAmount,
            winAmount: winner.winAmount,
            currency: activeBet.currency,
            betTransactionId: activeBet.transactionId
          });

          if (callbackResult.success) {
            // Update cached balance
            const session = sessionService.getSessionByPlayerId(winner.playerId);
            if (session) {
              sessionService.updateBalance(session.sessionId, callbackResult.newBalance);
            }

            results.push({
              playerId: winner.playerId,
              success: true,
              winAmount: winner.winAmount,
              newBalance: callbackResult.newBalance
            });
          } else {
            console.error(`[BetService] CRITICAL: Win callback failed for player ${winner.playerId}:`, callbackResult);
            results.push({
              playerId: winner.playerId,
              success: false,
              error: callbackResult.message || callbackResult.code
            });
          }

          // Clear active bet
          this.activeBets.delete(winner.playerId);
        } catch (error) {
          console.error(`[BetService] Error processing win for ${winner.playerId}:`, error.message);
          results.push({
            playerId: winner.playerId,
            success: false,
            error: error.message
          });
        }
      }
    }

    // Process losers (just clean up, balance already deducted)
    for (const loser of losers) {
      const activeBet = this.activeBets.get(loser.playerId);
      if (activeBet) {
        console.log(`[BetService] Player ${loser.playerId} lost ${loser.betAmount} (chose ${loser.choice})`);
        this.activeBets.delete(loser.playerId);
      }
    }

    console.log(`[BetService] Round ${roundId} results processed: ${winners.length} winners, ${losers.length} losers`);

    return results;
  }

  /**
   * Get player's active bet
   */
  getActiveBet(playerId) {
    return this.activeBets.get(playerId);
  }

  /**
   * Check if player has active bet
   */
  hasActiveBet(playerId) {
    return this.activeBets.has(playerId);
  }

  /**
   * Clear all active bets (for emergency reset)
   */
  clearAllBets() {
    this.activeBets.clear();
  }
}

// Singleton
const betService = new BetService();

module.exports = betService;

