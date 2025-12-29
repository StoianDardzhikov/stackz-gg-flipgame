/**
 * Flip Game - Controls Iframe JavaScript
 * Handles player interactions: betting, balance updates
 */

class FlipControls {
  constructor() {
    // Get session ID from URL
    this.sessionId = new URLSearchParams(window.location.search).get('sessionId');

    // DOM elements
    this.balanceEl = document.getElementById('balance');
    this.betAmountEl = document.getElementById('betAmount');
    this.betBtn = document.getElementById('betBtn');
    this.headsBtn = document.getElementById('headsBtn');
    this.tailsBtn = document.getElementById('tailsBtn');
    this.edgeBtn = document.getElementById('edgeBtn');
    this.roundStatusEl = document.getElementById('roundStatus');
    this.currentBetInfoEl = document.getElementById('currentBetInfo');
    this.currentBetAmountEl = document.getElementById('currentBetAmount');
    this.currentBetChoiceEl = document.getElementById('currentBetChoice');
    this.statusMessageEl = document.getElementById('statusMessage');
    this.connectionIndicatorEl = document.getElementById('connectionIndicator');
    this.quickBetBtns = document.querySelectorAll('.quick-bet-btn');

    // State
    this.balance = 0;
    this.currency = 'EUR';
    this.currentBet = null;
    this.selectedChoice = null;
    this.roundStatus = 'waiting';

    // Initialize
    this.init();
  }

  init() {
    // Setup event listeners
    this.setupEventListeners();

    // Connect to WebSocket
    this.connect();
  }

  setupEventListeners() {
    // Choice buttons
    this.headsBtn.addEventListener('click', () => this.selectChoice('HEADS'));
    this.tailsBtn.addEventListener('click', () => this.selectChoice('TAILS'));
    this.edgeBtn.addEventListener('click', () => this.selectChoice('EDGE'));

    // Bet button
    this.betBtn.addEventListener('click', () => this.placeBet());

    // Quick bet buttons
    this.quickBetBtns.forEach(btn => {
      btn.addEventListener('click', () => this.handleQuickBet(btn));
    });

    // Enter key on bet input
    this.betAmountEl.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.placeBet();
      }
    });
  }

  connect() {
    if (!this.sessionId) {
      this.showStatus('No session ID provided', 'error');
      return;
    }

    // Connect to controls namespace
    this.socket = io('/flip/ws/controls', {
      query: { sessionId: this.sessionId },
      transports: ['websocket', 'polling']
    });

    // Connection events
    this.socket.on('connect', () => {
      console.log('[Controls] Connected');
      this.connectionIndicatorEl.textContent = 'CONNECTED';
      this.connectionIndicatorEl.className = 'connection-indicator connected';
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[Controls] Disconnected:', reason);
      this.connectionIndicatorEl.textContent = 'DISCONNECTED';
      this.connectionIndicatorEl.className = 'connection-indicator disconnected';
      this.showStatus('Connection lost', 'error');
    });

    this.socket.on('connect_error', (error) => {
      console.error('[Controls] Connection error:', error);
      this.showStatus('Connection error', 'error');
    });

    // Balance updates
    this.socket.on('balance_update', (data) => {
      this.handleBalanceUpdate(data);
    });

    // Bet result
    this.socket.on('bet_result', (data) => {
      this.handleBetResult(data);
    });

    // Bet won
    this.socket.on('bet_won', (data) => {
      this.handleBetWon(data);
    });

    // Bet lost
    this.socket.on('bet_lost', (data) => {
      this.handleBetLost(data);
    });

    // Bet status (on reconnect)
    this.socket.on('bet_status', (data) => {
      this.handleBetStatus(data);
    });

    // Round state
    this.socket.on('round_state', (data) => {
      this.handleRoundState(data);
    });

    // Round events
    this.socket.on('betting_phase', (data) => {
      this.handleBettingPhase(data);
    });

    this.socket.on('round_reveal', (data) => {
      this.handleRoundReveal(data);
    });

    this.socket.on('round_finished', (data) => {
      this.handleRoundFinished(data);
    });

    // Errors
    this.socket.on('error', (data) => {
      console.error('[Controls] Error:', data);
      this.showStatus(data.message || 'Error', 'error');
    });

    this.socket.on('waiting', (data) => {
      this.roundStatusEl.textContent = data.message;
      this.roundStatusEl.className = 'round-status';
    });
  }

  selectChoice(choice) {
    if (this.roundStatus !== 'betting') return;
    if (this.currentBet) return;

    this.selectedChoice = choice;

    // Update button states
    this.headsBtn.classList.toggle('selected', choice === 'HEADS');
    this.tailsBtn.classList.toggle('selected', choice === 'TAILS');
    this.edgeBtn.classList.toggle('selected', choice === 'EDGE');
  }

  handleBalanceUpdate(data) {
    console.log('[Controls] Balance update:', data);
    this.balance = data.balance;
    this.currency = data.currency || this.currency;
    this.balanceEl.textContent = `${this.balance.toFixed(2)} ${this.currency}`;
  }

  handleBetResult(data) {
    console.log('[Controls] Bet result:', data);

    if (data.success) {
      this.currentBet = data.bet;
      this.balance = data.newBalance;
      this.balanceEl.textContent = `${this.balance.toFixed(2)} ${this.currency}`;

      this.showStatus(`Bet placed: ${data.bet.amount} ${this.currency} on ${data.bet.choice}`, 'success');
      this.updateUIForActiveBet();
    } else {
      this.showStatus(data.error || 'Bet failed', 'error');
      this.enableBetting();
    }
  }

  handleBetWon(data) {
    console.log('[Controls] Bet won:', data);

    // Update balance if provided
    if (data.newBalance !== null && data.newBalance !== undefined) {
      this.balance = data.newBalance;
      this.balanceEl.textContent = `${this.balance.toFixed(2)} ${this.currency}`;
    }

    this.showStatus(
      `You won! ${data.winAmount.toFixed(2)} ${this.currency} (${data.betAmount.toFixed(2)} @ ${data.result})`,
      'success'
    );

    this.currentBet = null;
    this.selectedChoice = null;
  }

  handleBetLost(data) {
    console.log('[Controls] Bet lost:', data);

    this.showStatus(
      `You lost: ${data.betAmount.toFixed(2)} ${this.currency} (Result: ${data.result})`,
      'error'
    );

    this.currentBet = null;
    this.selectedChoice = null;
  }

  handleBetStatus(data) {
    console.log('[Controls] Bet status:', data);

    if (data.hasBet) {
      this.currentBet = { amount: data.bet.amount, choice: data.bet.choice };
      this.selectedChoice = data.bet.choice;
      this.updateUIForActiveBet();
    }
  }

  handleRoundState(data) {
    console.log('[Controls] Round state:', data);
    this.roundStatus = data.status;
    this.updateRoundStatusUI();
  }

  handleBettingPhase(data) {
    console.log('[Controls] Betting phase:', data);

    this.roundStatus = 'betting';
    this.currentBet = null;
    this.selectedChoice = null;

    this.updateRoundStatusUI();
    this.enableBetting();
    this.hideCurrentBetInfo();

    this.showStatus('Place your bets!', 'info');
  }

  handleRoundReveal(data) {
    console.log('[Controls] Round revealing:', data);

    this.roundStatus = 'revealing';
    this.updateRoundStatusUI();
    this.disableBetting();
  }

  handleRoundFinished(data) {
    console.log('[Controls] Round finished:', data);

    this.roundStatus = 'finished';
    this.updateRoundStatusUI();
    this.disableBetting();
  }

  placeBet() {
    if (!this.selectedChoice) {
      this.showStatus('Please select HEADS, TAILS, or EDGE', 'error');
      return;
    }

    const amount = parseFloat(this.betAmountEl.value);

    if (isNaN(amount) || amount <= 0) {
      this.showStatus('Enter a valid bet amount', 'error');
      return;
    }

    if (amount > this.balance) {
      this.showStatus('Insufficient balance', 'error');
      return;
    }

    if (this.roundStatus !== 'betting') {
      this.showStatus('Betting phase has ended', 'error');
      return;
    }

    // Disable bet button while processing
    this.betBtn.disabled = true;
    this.betBtn.textContent = 'Placing...';

    // Send bet to server
    this.socket.emit('bet', { amount, choice: this.selectedChoice });
  }

  handleQuickBet(btn) {
    const action = btn.dataset.action;
    const amount = btn.dataset.amount;

    let newAmount;

    if (action === 'half') {
      newAmount = parseFloat(this.betAmountEl.value) / 2;
    } else if (action === 'double') {
      newAmount = parseFloat(this.betAmountEl.value) * 2;
    } else if (amount === 'max') {
      newAmount = this.balance;
    } else {
      newAmount = parseFloat(amount);
    }

    // Clamp to balance
    newAmount = Math.min(newAmount, this.balance);
    newAmount = Math.max(newAmount, 1);

    this.betAmountEl.value = newAmount.toFixed(2);
  }

  updateRoundStatusUI() {
    this.roundStatusEl.className = 'round-status';

    switch (this.roundStatus) {
      case 'betting':
        this.roundStatusEl.textContent = 'BETTING PHASE';
        this.roundStatusEl.classList.add('betting');
        break;
      case 'revealing':
        this.roundStatusEl.textContent = 'REVEALING RESULT';
        this.roundStatusEl.classList.add('revealing');
        break;
      case 'finished':
        this.roundStatusEl.textContent = 'ROUND FINISHED';
        this.roundStatusEl.classList.add('finished');
        break;
      default:
        this.roundStatusEl.textContent = 'Waiting...';
    }
  }

  updateUIForActiveBet() {
    if (this.currentBet) {
      this.currentBetInfoEl.classList.add('visible');
      this.currentBetAmountEl.textContent = `${this.currentBet.amount.toFixed(2)} ${this.currency}`;
      this.currentBetChoiceEl.textContent = this.currentBet.choice;

      this.betBtn.disabled = true;
      this.betAmountEl.disabled = true;
      this.headsBtn.disabled = true;
      this.tailsBtn.disabled = true;
      this.edgeBtn.disabled = true;
      this.quickBetBtns.forEach(btn => btn.disabled = true);
    }
  }

  enableBetting() {
    this.betBtn.disabled = false;
    this.betBtn.textContent = 'Place Bet';
    this.betAmountEl.disabled = false;
    this.headsBtn.disabled = false;
    this.tailsBtn.disabled = false;
    this.edgeBtn.disabled = false;
    this.quickBetBtns.forEach(btn => btn.disabled = false);
    this.hideCurrentBetInfo();
  }

  disableBetting() {
    this.betBtn.disabled = true;
    this.betAmountEl.disabled = true;
    this.headsBtn.disabled = true;
    this.tailsBtn.disabled = true;
    this.edgeBtn.disabled = true;
    this.quickBetBtns.forEach(btn => btn.disabled = true);
  }

  hideCurrentBetInfo() {
    this.currentBetInfoEl.classList.remove('visible');
  }

  showStatus(message, type) {
    this.statusMessageEl.textContent = message;
    this.statusMessageEl.className = `status-message ${type}`;
    this.statusMessageEl.style.display = 'block';

    // Auto-hide after 5 seconds
    setTimeout(() => {
      if (this.statusMessageEl.textContent === message) {
        this.hideStatus();
      }
    }, 5000);
  }

  hideStatus() {
    this.statusMessageEl.style.display = 'none';
  }
}

// Initialize controls when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.flipControls = new FlipControls();
});

