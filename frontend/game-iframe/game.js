/**
 * Flip Game - Game Iframe JavaScript
 * Handles game visualization and coin flip display
 */

class FlipGame {
  constructor() {
    // Get session ID from URL
    this.sessionId = new URLSearchParams(window.location.search).get('sessionId');

    // DOM elements
    this.coinEl = document.getElementById('coin');
    this.resultTextEl = document.getElementById('resultText');
    this.statusTextEl = document.getElementById('statusText');
    this.countdownEl = document.getElementById('countdown');
    this.roundIdEl = document.getElementById('roundId');
    this.seedHashEl = document.getElementById('seedHash');
    this.historyBarEl = document.getElementById('historyBar');
    this.connectionStatusEl = document.getElementById('connectionStatus');

    // Game state
    this.currentResult = null;
    this.roundStatus = 'waiting';
    this.history = [];

    // Initialize
    this.init();
  }

  init() {
    // Connect to WebSocket
    this.connect();
  }

  connect() {
    if (!this.sessionId) {
      this.statusTextEl.textContent = 'No session ID provided';
      return;
    }

    // Connect to game namespace
    this.socket = io('/ws/game', {
      query: { sessionId: this.sessionId },
      transports: ['websocket', 'polling']
    });

    // Connection events
    this.socket.on('connect', () => {
      console.log('[Game] Connected');
      this.connectionStatusEl.textContent = 'CONNECTED';
      this.connectionStatusEl.className = 'connection-status connected';
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[Game] Disconnected:', reason);
      this.connectionStatusEl.textContent = 'DISCONNECTED';
      this.connectionStatusEl.className = 'connection-status disconnected';
      this.statusTextEl.textContent = 'Connection lost...';
    });

    this.socket.on('connect_error', (error) => {
      console.error('[Game] Connection error:', error);
      this.statusTextEl.textContent = 'Connection error';
    });

    // Game events
    this.socket.on('error', (data) => {
      console.error('[Game] Error:', data);
      this.statusTextEl.textContent = data.message || 'Error';
    });

    this.socket.on('waiting', (data) => {
      this.roundStatus = 'waiting';
      this.statusTextEl.textContent = data.message;
      this.resultTextEl.textContent = '-';
      this.coinEl.classList.remove('flipping');
    });

    this.socket.on('betting_phase', (data) => {
      this.handleBettingPhase(data);
    });

    this.socket.on('round_reveal', (data) => {
      this.handleReveal(data);
    });

    this.socket.on('round_revealing', (data) => {
      // Reconnected during reveal
      this.handleRevealing(data);
    });

    this.socket.on('round_finished', (data) => {
      this.handleFinished(data);
    });

    this.socket.on('history', (data) => {
      this.history = data;
      this.renderHistory();
    });
  }

  handleBettingPhase(data) {
    console.log('[Game] Betting phase:', data);

    this.roundStatus = 'betting';
    this.roundIdEl.textContent = data.roundId;
    this.seedHashEl.textContent = `Hash: ${data.serverSeedHash.substring(0, 16)}...`;

    this.resultTextEl.textContent = 'PLACE YOUR BETS';
    this.resultTextEl.className = 'result-text';
    this.statusTextEl.textContent = 'Choose HEADS, TAILS, or EDGE';
    this.coinEl.classList.remove('flipping');

    // Start countdown (10 seconds)
    this.startCountdown(10);
  }

  handleReveal(data) {
    console.log('[Game] Round revealing:', data);

    this.roundStatus = 'revealing';
    this.currentResult = data.result;

    // Flip animation - special animation for EDGE
    if (data.result === 'EDGE') {
      this.coinEl.classList.add('flipping-to-edge');
      setTimeout(() => {
        this.coinEl.classList.remove('flipping-to-edge');
        this.updateCoinDisplay(data.result);
      }, 2500);
    } else {
      this.coinEl.classList.add('flipping');
      setTimeout(() => {
        this.coinEl.classList.remove('flipping');
        this.updateCoinDisplay(data.result);
      }, 2500);
    }

    this.resultTextEl.textContent = data.result;
    this.resultTextEl.className = `result-text ${data.result.toLowerCase()}`;
    this.statusTextEl.textContent = 'Revealing result...';
    this.countdownEl.textContent = '';
  }

  handleRevealing(data) {
    // Reconnected during reveal
    this.roundStatus = 'revealing';
    this.currentResult = data.result;
    this.roundIdEl.textContent = data.roundId;
    this.updateCoinDisplay(data.result);
    this.resultTextEl.textContent = data.result;
    this.resultTextEl.className = `result-text ${data.result.toLowerCase()}`;
    this.statusTextEl.textContent = 'Revealing result...';
  }

  handleFinished(data) {
    console.log('[Game] Round finished:', data);

    this.roundStatus = 'finished';
    this.currentResult = data.result;

    this.updateCoinDisplay(data.result);
    this.resultTextEl.textContent = data.result;
    this.resultTextEl.className = `result-text ${data.result.toLowerCase()}`;
    this.statusTextEl.textContent = 'Round finished!';

    // Add to history
    this.history.unshift({
      id: data.roundId,
      result: data.result
    });

    // Keep only last 20 in memory
    if (this.history.length > 20) {
      this.history.pop();
    }

    this.renderHistory();
  }

  updateCoinDisplay(result) {
    // Remove all classes
    this.coinEl.className = 'coin';

    // Add result class to show correct face
    if (result === 'HEADS') {
      this.coinEl.style.transform = 'rotateY(0deg)';
      this.coinEl.style.filter = '';
    } else if (result === 'TAILS') {
      this.coinEl.style.transform = 'rotateY(180deg)';
      this.coinEl.style.filter = '';
    } else if (result === 'EDGE') {
      this.coinEl.classList.add('edge');
      // L'animation edgeRoll sera appliquée via CSS
    }
  }

  startCountdown(seconds) {
    let remaining = seconds;
    this.countdownEl.textContent = remaining;

    const interval = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        this.countdownEl.textContent = '';
        clearInterval(interval);
      } else {
        this.countdownEl.textContent = remaining;
      }
    }, 1000);
  }

  renderHistory() {
    this.historyBarEl.innerHTML = '';

    this.history.slice(0, 15).forEach(round => {
      const item = document.createElement('div');
      item.className = `history-item ${round.result.toLowerCase()}`;
      if (round.result === 'HEADS') {
        item.textContent = 'H';
      } else if (round.result === 'TAILS') {
        item.textContent = 'T';
      } else {
        item.textContent = 'E';
      }
      item.title = `Round: ${round.id}`;
      this.historyBarEl.appendChild(item);
    });
  }
}

// Initialize game when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.flipGame = new FlipGame();
});

