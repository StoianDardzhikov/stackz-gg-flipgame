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
    this.coinImageEl = document.getElementById('coinImage');
    this.resultTextEl = document.getElementById('resultText');
    this.statusTextEl = document.getElementById('statusText');
    this.roundNumberEl = document.getElementById('roundNumber');
    this.countdownEl = document.getElementById('countdown');
    this.roundIdEl = document.getElementById('roundId');
    this.seedHashEl = document.getElementById('seedHash');
    this.historyBarEl = document.getElementById('historyBar');
    this.connectionStatusEl = document.getElementById('connectionStatus');

    // Game state
    this.currentResult = null;
    this.roundStatus = 'waiting';
    this.history = [];
    this.countdownInterval = null;

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
    this.socket = io('/flip/ws/game', {
      path: "/flip/socket.io/",    
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
      this.roundNumberEl.textContent = '';
      this.coinEl.classList.remove('flipping', 'edge');
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
    this.statusTextEl.textContent = 'Choose HEADS, TAILS, or EDGE';
    this.roundNumberEl.textContent = '';
    this.coinEl.classList.remove('flipping', 'edge');
    
    // Reset coin to heads position
    this.coinImageEl.src = 'assets/coins/heads.png';

    // Start countdown (60 seconds)
    this.startCountdown(60);
  }

  handleReveal(data) {
    console.log('[Game] Round revealing:', data);

    this.roundStatus = 'revealing';
    this.currentResult = data.result;

    // Clear countdown
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
    this.countdownEl.textContent = '';

    // Change coin image based on result
    const imagePath = this.getCoinImagePath(data.result);
    
    // Flip animation
    if (data.result === 'EDGE') {
      this.coinEl.classList.add('flipping');
      setTimeout(() => {
        this.coinEl.classList.remove('flipping');
        this.coinImageEl.src = imagePath;
        this.coinEl.classList.add('edge');
      }, 2500);
    } else {
      this.coinEl.classList.add('flipping');
      setTimeout(() => {
        this.coinEl.classList.remove('flipping');
        this.coinImageEl.src = imagePath;
      }, 2500);
    }

    this.resultTextEl.textContent = data.result;
    this.statusTextEl.textContent = 'Revealing result...';
  }

  handleRevealing(data) {
    // Reconnected during reveal
    this.roundStatus = 'revealing';
    this.currentResult = data.result;
    this.roundIdEl.textContent = data.roundId;
    
    const imagePath = this.getCoinImagePath(data.result);
    this.coinImageEl.src = imagePath;
    
    if (data.result === 'EDGE') {
      this.coinEl.classList.add('edge');
    }
    
    this.resultTextEl.textContent = data.result;
    this.statusTextEl.textContent = 'Revealing result...';
  }

  handleFinished(data) {
    console.log('[Game] Round finished:', data);

    this.roundStatus = 'finished';
    this.currentResult = data.result;

    const imagePath = this.getCoinImagePath(data.result);
    this.coinImageEl.src = imagePath;
    
    if (data.result === 'EDGE') {
      this.coinEl.classList.add('edge');
    } else {
      this.coinEl.classList.remove('edge');
    }

    this.resultTextEl.textContent = data.result;
    this.statusTextEl.textContent = 'Round Finished!';
    this.roundNumberEl.textContent = this.extractRoundNumber(data.roundId);

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

  getCoinImagePath(result) {
    if (result === 'HEADS') {
      return 'assets/coins/heads.png';
    } else if (result === 'TAILS') {
      return 'assets/coins/tails.png';
    } else if (result === 'EDGE') {
      // Alternate between edge1 and edge2 for variety
      return Math.random() > 0.5 ? 'assets/coins/edge1.png' : 'assets/coins/edge2.png';
    }
    return 'assets/coins/heads.png';
  }

  extractRoundNumber(roundId) {
    // Extract number from round ID like "F-1234567890-42"
    const parts = roundId.split('-');
    return parts.length > 2 ? `#${parts[2]}` : '';
  }

  startCountdown(seconds) {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
    }

    let remaining = seconds;
    this.countdownEl.textContent = this.formatTime(remaining);

    this.countdownInterval = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        this.countdownEl.textContent = '';
        clearInterval(this.countdownInterval);
        this.countdownInterval = null;
      } else {
        this.countdownEl.textContent = this.formatTime(remaining);
      }
    }, 1000);
  }

  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  renderHistory() {
    this.historyBarEl.innerHTML = '';

    this.history.slice(0, 15).forEach(round => {
      const item = document.createElement('div');
      item.className = `history-item ${round.result.toLowerCase()}`;
      
      // Add small coin image
      const img = document.createElement('img');
      img.src = this.getCoinImagePath(round.result);
      img.alt = round.result;
      item.appendChild(img);
      
      item.title = `Round: ${round.id} - ${round.result}`;
      this.historyBarEl.appendChild(item);
    });
  }
}

// Initialize game when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.flipGame = new FlipGame();
});
