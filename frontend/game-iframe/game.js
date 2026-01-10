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
    this.bettingTimerInterval = null;

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

    // Start countdown (30 seconds)
    this.startCountdown(30);
    // Start betting timer (30 seconds)
    this.startBettingTimer(30);
  }

  handleReveal(data) {
    console.log('[Game] Round revealing:', data);

    this.roundStatus = 'revealing';
    this.currentResult = data.result;

    // Clear countdown and hide it
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
    this.countdownEl.textContent = '';
    this.countdownEl.style.display = 'none';
    
    // Hide betting timer
    this.hideBettingTimer();

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

    // Reset countdown display
    this.countdownEl.classList.remove('fade-out');
    this.countdownEl.style.opacity = '1';
    this.countdownEl.style.display = 'block';

    let remaining = seconds;
    this.countdownEl.textContent = this.formatTime(remaining);

    this.countdownInterval = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        // Fade out animation
        this.countdownEl.classList.add('fade-out');
        setTimeout(() => {
          this.countdownEl.textContent = '';
          this.countdownEl.style.display = 'none';
          this.countdownEl.classList.remove('fade-out');
        }, 500); // Wait for fade-out animation to complete
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

  startBettingTimer(seconds) {
    this.hideBettingTimer();
    let remaining = Math.ceil(seconds);
    const timerEl = document.getElementById('betting-timer');
    const valueEl = document.getElementById('timer-value');

    if (!timerEl || !valueEl) return;

    timerEl.classList.add('active');
    timerEl.classList.remove('closing');
    valueEl.textContent = remaining;

    this.bettingTimerInterval = setInterval(() => {
      remaining--;
      valueEl.textContent = remaining;

      // Add urgency when 5 seconds or less
      if (remaining <= 5) {
        timerEl.classList.add('closing');
      }

      if (remaining <= 0) {
        this.hideBettingTimer();
      }
    }, 1000);
  }

  hideBettingTimer() {
    if (this.bettingTimerInterval) {
      clearInterval(this.bettingTimerInterval);
      this.bettingTimerInterval = null;
    }
    const timerEl = document.getElementById('betting-timer');
    if (timerEl) {
      timerEl.classList.remove('active', 'closing');
    }
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
