const config = require('../config');
const { generateCallbackSignature } = require('../util/hmac');

/**
 * Callback Service
 * Handles all outgoing HTTP callbacks to the platform
 */

class CallbackService {
  constructor() {
    // Track pending callbacks for potential rollback
    this.pendingTransactions = new Map();
  }

  /**
   * Make HTTP request to platform
   */
  async makeRequest(url, payload, attempt = 1) {
    const signature = generateCallbackSignature(config.PROVIDER_SECRET, payload);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Provider-Signature': signature,
          'X-Request-ID': payload.requestId || `REQ-${Date.now()}`
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(config.CALLBACK.TIMEOUT_MS)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${data.message || 'Unknown error'}`);
      }

      return data;
    } catch (error) {
      console.error(`[CallbackService] Request failed (attempt ${attempt}):`, error.message);

      // Retry logic
      if (attempt < config.CALLBACK.RETRY_ATTEMPTS) {
        await this.delay(config.CALLBACK.RETRY_DELAY_MS * attempt);
        return this.makeRequest(url, payload, attempt + 1);
      }

      throw error;
    }
  }

  /**
   * Helper delay function
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Bet callback - deduct player balance
   */
  async placeBet({ callbackBaseUrl, roundId, playerId, sessionId, amount, currency }) {
    const url = `${callbackBaseUrl}/bet`;
    const requestId = `BET-${roundId}-${playerId}-${Date.now()}`;

    const payload = {
      requestId,
      roundId,
      playerId,
      sessionId,
      amount,
      currency,
      timestamp: Date.now()
    };

    console.log(`[CallbackService] Sending bet callback:`, { url, payload });

    try {
      const response = await this.makeRequest(url, payload);

      if (response.transactionId !== undefined) {
        // Track transaction for potential rollback
        this.pendingTransactions.set(requestId, {
          type: 'bet',
          ...payload,
          transactionId: response.transactionId
        });

        return {
          success: true,
          transactionId: response.transactionId,
          newBalance: response.newBalance,
          requestId
        };
      } else {
        return {
          success: false,
          code: response.code,
          message: response.message,
          requestId
        };
      }
    } catch (error) {
      console.error(`[CallbackService] Bet callback failed:`, error.message);
      return {
        success: false,
        code: 'CALLBACK_FAILED',
        message: error.message,
        requestId
      };
    }
  }

  /**
   * Win callback - credit player winnings
   */
  async creditWin({ callbackBaseUrl, roundId, playerId, sessionId, betAmount, winAmount, currency, betTransactionId }) {
    const url = `${callbackBaseUrl}/win`;
    const requestId = `WIN-${roundId}-${playerId}-${Date.now()}`;

    const payload = {
      requestId,
      roundId,
      playerId,
      sessionId,
      betAmount,
      winAmount,
      currency,
      betTransactionId,
      timestamp: Date.now()
    };

    console.log(`[CallbackService] Sending win callback:`, { url, payload });

    try {
      const response = await this.makeRequest(url, payload);

      if (response.transactionId !== undefined) {
        // Remove bet from pending since it's now settled
        this.clearPendingTransaction(betTransactionId);

        return {
          success: true,
          transactionId: response.transactionId,
          newBalance: response.newBalance,
          requestId
        };
      } else {
        return {
          success: false,
          code: response.code,
          message: response.message,
          requestId
        };
      }
    } catch (error) {
      console.error(`[CallbackService] Win callback failed:`, error.message);
      return {
        success: false,
        code: 'CALLBACK_FAILED',
        message: error.message,
        requestId
      };
    }
  }

  /**
   * Rollback callback - refund a bet
   */
  async rollback({ callbackBaseUrl, roundId, playerId, sessionId, amount, currency, originalTransactionId, reason }) {
    const url = `${callbackBaseUrl}/rollback`;
    const requestId = `ROLLBACK-${roundId}-${playerId}-${Date.now()}`;

    const payload = {
      requestId,
      roundId,
      playerId,
      sessionId,
      amount,
      currency,
      originalTransactionId,
      reason,
      timestamp: Date.now()
    };

    console.log(`[CallbackService] Sending rollback callback:`, { url, payload });

    try {
      const response = await this.makeRequest(url, payload);

      if (response.status === 'OK') {
        this.clearPendingTransaction(originalTransactionId);

        return {
          success: true,
          transactionId: response.transactionId,
          newBalance: response.newBalance,
          requestId
        };
      } else {
        return {
          success: false,
          code: response.code,
          message: response.message,
          requestId
        };
      }
    } catch (error) {
      console.error(`[CallbackService] Rollback callback failed:`, error.message);
      return {
        success: false,
        code: 'CALLBACK_FAILED',
        message: error.message,
        requestId
      };
    }
  }

  /**
   * Balance callback - get current player balance
   */
  async getBalance({ callbackBaseUrl, playerId, sessionId }) {
    const url = `${callbackBaseUrl}/balance`;

    const payload = {
      playerId,
      sessionId,
      timestamp: Date.now()
    };

    console.log(`[CallbackService] Getting balance:`, { url, playerId });

    try {
      const response = await this.makeRequest(url, payload);
      response.success = true;
      return response;
    } catch (error) {
      console.error(`[CallbackService] Balance callback failed:`, error.message);
      return {
        success: false,
        code: 'CALLBACK_FAILED',
        message: error.message
      };
    }
  }

  /**
   * Clear pending transaction
   */
  clearPendingTransaction(transactionId) {
    for (const [requestId, tx] of this.pendingTransactions) {
      if (tx.transactionId === transactionId) {
        this.pendingTransactions.delete(requestId);
        break;
      }
    }
  }

  /**
   * Get all pending transactions (for cleanup/recovery)
   */
  getPendingTransactions() {
    return Array.from(this.pendingTransactions.values());
  }
}

// Singleton
const callbackService = new CallbackService();

module.exports = callbackService;

