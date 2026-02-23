/* =============================================
   PORTALS GAME — Weapons Lockbox Task
   4-digit passcode crack (Mastermind/Wordle style)
   ============================================= */

const LockboxTask = {
  // --- State ---
  secretCode: [],
  currentInput: [],
  guessHistory: [],
  maxGuesses: 8,
  guessesUsed: 0,
  lockoutActive: false,
  lockoutTimer: 0,
  lockoutInterval: null,
  solved: false,
  revealing: false,    // true during staggered reveal animation
  inputLocked: false,  // true during reveal + solved + lockout
  portalsTaskName: null, // e.g. 'lockbox1' from ?lockbox1 query string

  // --- DOM refs ---
  codeDigits: null,
  historyEl: null,
  pips: null,
  remainingText: null,
  lockoutOverlay: null,
  lockoutTimerEl: null,
  keypadBtns: null,

  // =========================================
  // Initialization
  // =========================================
  init() {
    // Cache DOM refs
    this.codeDigits = document.querySelectorAll('#lockbox-code .lockbox-digit');
    this.historyEl = document.getElementById('guess-history');
    this.pips = document.querySelectorAll('#guess-pips .guess-pip');
    this.remainingText = document.getElementById('guesses-remaining');
    this.lockoutOverlay = document.getElementById('lockout-overlay');
    this.lockoutTimerEl = document.getElementById('lockout-timer');
    this.keypadBtns = document.querySelectorAll('#keypad .keypad-btn');

    // Parse query string for Portals task name (e.g. ?lockbox1&maximized=true&...)
    // The task name is a bare key (no value) matching the pattern "lockbox" + number
    const params = new URLSearchParams(window.location.search);
    for (const [key] of params) {
      if (/^lockbox\d+$/.test(key)) {
        this.portalsTaskName = key;
        console.log('[LockboxTask] Portals task name:', this.portalsTaskName);
        break;
      }
    }

    // Generate secret code
    this._generateCode();

    // Bind keypad click handlers
    this.keypadBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const key = btn.dataset.key;
        if (key === 'spacer') return;
        this._handleKeypadPress(btn, key);
      });

      // Touch support — prevent double-fire
      btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const key = btn.dataset.key;
        if (key === 'spacer') return;
        this._handleKeypadPress(btn, key);
      }, { passive: false });
    });

    // Keyboard support
    this._boundKeydown = (e) => this._onKeydown(e);
    document.addEventListener('keydown', this._boundKeydown);

    // Initial display
    this._updateDisplay();
    this._updatePips();

    // Debug: log code for testing (remove in production)
    console.log('[LockboxTask] Secret code:', this.secretCode.join(''));
  },

  // =========================================
  // Code Generation
  // =========================================
  _generateCode() {
    this.secretCode = [];
    for (let i = 0; i < 4; i++) {
      this.secretCode.push(Math.floor(Math.random() * 10));
    }
  },

  // =========================================
  // Input Handling
  // =========================================
  _handleKeypadPress(btn, key) {
    if (this.inputLocked || this.solved || this.lockoutActive) return;

    // Visual press feedback
    btn.classList.add('pressed');
    setTimeout(() => btn.classList.remove('pressed'), 100);

    if (key === 'del') {
      this._onDelete();
    } else {
      const digit = parseInt(key, 10);
      if (!isNaN(digit)) {
        this._onDigitPress(digit);
      }
    }
  },

  _onKeydown(e) {
    if (this.inputLocked || this.solved || this.lockoutActive) return;

    // Number keys 0-9
    if (e.key >= '0' && e.key <= '9') {
      e.preventDefault();
      this._onDigitPress(parseInt(e.key, 10));

      // Highlight corresponding keypad button
      const btn = document.querySelector(`[data-key="${e.key}"]`);
      if (btn) {
        btn.classList.add('pressed');
        setTimeout(() => btn.classList.remove('pressed'), 100);
      }
    }

    // Backspace = delete
    if (e.key === 'Backspace') {
      e.preventDefault();
      this._onDelete();

      const delBtn = document.querySelector('[data-key="del"]');
      if (delBtn) {
        delBtn.classList.add('pressed');
        setTimeout(() => delBtn.classList.remove('pressed'), 100);
      }
    }
  },

  _onDigitPress(digit) {
    if (this.currentInput.length >= 4) return;

    this.currentInput.push(digit);
    this._playKeyClick();
    this._updateDisplay();

    // Pop animation on the digit that was just entered
    const idx = this.currentInput.length - 1;
    if (this.codeDigits[idx]) {
      this.codeDigits[idx].classList.remove('pop');
      void this.codeDigits[idx].offsetWidth; // force reflow
      this.codeDigits[idx].classList.add('pop');
    }

    // Auto-submit on 4th digit
    if (this.currentInput.length === 4) {
      this.inputLocked = true;
      setTimeout(() => this._onSubmit(), 350);
    }
  },

  _onDelete() {
    if (this.currentInput.length === 0) return;
    this.currentInput.pop();
    this._playDeleteClick();
    this._updateDisplay();
  },

  // =========================================
  // Guess Evaluation
  // =========================================
  _onSubmit() {
    if (this.currentInput.length !== 4) {
      this.inputLocked = false;
      return;
    }

    this.revealing = true;
    const guess = [...this.currentInput];
    const results = this._evaluate(guess);

    // Staggered reveal
    this._animateReveal(guess, results, () => {
      // After reveal complete
      const allCorrect = results.every(r => r.state === 'correct');

      if (allCorrect) {
        this._onSolved();
        return;
      }

      this.guessesUsed++;
      this.guessHistory.push({ guess, results });
      this._updatePips();
      this._addHistoryRow(guess, results);

      if (this.guessesUsed >= this.maxGuesses) {
        this._onLockout();
        return;
      }

      // Reset for next guess
      this.currentInput = [];
      this._updateDisplay();
      this.revealing = false;
      this.inputLocked = false;
    });
  },

  _evaluate(guess) {
    const results = [];
    const secretUsed = [false, false, false, false];
    const guessUsed = [false, false, false, false];

    // Pass 1: Exact matches (correct)
    for (let i = 0; i < 4; i++) {
      if (guess[i] === this.secretCode[i]) {
        results[i] = { digit: guess[i], state: 'correct' };
        secretUsed[i] = true;
        guessUsed[i] = true;
      }
    }

    // Pass 2: Wrong position (present) and absent
    for (let i = 0; i < 4; i++) {
      if (guessUsed[i]) continue;

      let found = false;
      for (let j = 0; j < 4; j++) {
        if (!secretUsed[j] && guess[i] === this.secretCode[j]) {
          results[i] = { digit: guess[i], state: 'present' };
          secretUsed[j] = true;
          found = true;
          break;
        }
      }
      if (!found) {
        results[i] = { digit: guess[i], state: 'absent' };
      }
    }

    return results;
  },

  // =========================================
  // Reveal Animation
  // =========================================
  _animateReveal(guess, results, callback) {
    let revealed = 0;

    const revealNext = () => {
      if (revealed >= 4) {
        setTimeout(callback, 200);
        return;
      }

      const idx = revealed;
      const digitEl = this.codeDigits[idx];
      const result = results[idx];

      // Apply state class
      digitEl.classList.remove('empty', 'pop');
      digitEl.classList.add(result.state, 'reveal');

      // Play per-digit sound
      switch (result.state) {
        case 'correct': this._playCorrectReveal(); break;
        case 'present': this._playPresentReveal(); break;
        case 'absent':  this._playAbsentReveal(); break;
      }

      // Remove reveal anim class after it plays
      setTimeout(() => digitEl.classList.remove('reveal'), 300);

      revealed++;
      setTimeout(revealNext, 160);
    };

    // Start after a brief pause for anticipation
    setTimeout(revealNext, 300);
  },

  // =========================================
  // Success / Lockout
  // =========================================
  _onSolved() {
    this.solved = true;
    this.inputLocked = true;

    // Pulse all digits green
    this.codeDigits.forEach(d => {
      d.classList.add('correct', 'solved');
    });

    // Complete task in Portals if a task name was provided via query string
    if (this.portalsTaskName) {
      this._completePortalsTask(this.portalsTaskName);
    }

    // Show completion after celebration
    setTimeout(() => {
      TaskShell.showCompletion('weapons-lockbox');
    }, 1200);
  },

  /**
   * Send task completion to Portals via SDK
   * @param {string} taskName - The Portals task name (e.g. 'lockbox1')
   */
  _completePortalsTask(taskName) {
    const message = JSON.stringify({
      TaskName: taskName,
      TaskTargetState: 'SetAnyToCompleted'
    });

    if (typeof PortalsSdk !== 'undefined') {
      PortalsSdk.sendMessageToUnity(message);
      console.log('[LockboxTask] Portals task completed:', taskName);
    } else {
      console.info('[LockboxTask] PortalsSdk not available - running outside Portals');
    }
  },

  _onLockout() {
    this.lockoutActive = true;
    this.inputLocked = true;
    this.lockoutTimer = 180; // 3 minutes

    // Play error sound
    this._playLockoutSound();

    // Show overlay
    this.lockoutOverlay.classList.add('active');
    this._updateLockoutTimer();

    // Countdown
    this.lockoutInterval = setInterval(() => {
      this.lockoutTimer--;
      this._updateLockoutTimer();

      if (this.lockoutTimer <= 0) {
        clearInterval(this.lockoutInterval);
        this._resetAfterLockout();
      }
    }, 1000);
  },

  _updateLockoutTimer() {
    const mins = Math.floor(this.lockoutTimer / 60);
    const secs = this.lockoutTimer % 60;
    this.lockoutTimerEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
  },

  _resetAfterLockout() {
    // Hide overlay
    this.lockoutOverlay.classList.remove('active');

    // Full reset
    this.lockoutActive = false;
    this.inputLocked = false;
    this.revealing = false;
    this.guessesUsed = 0;
    this.guessHistory = [];
    this.currentInput = [];

    // Generate new code
    this._generateCode();
    console.log('[LockboxTask] New secret code:', this.secretCode.join(''));

    // Clear history display
    this.historyEl.innerHTML = '';

    // Reset digit display
    this._updateDisplay();
    this._updatePips();
  },

  // =========================================
  // Display Updates
  // =========================================
  _updateDisplay() {
    this.codeDigits.forEach((el, i) => {
      // Clear state classes
      el.classList.remove('correct', 'present', 'absent', 'solved', 'reveal');

      if (i < this.currentInput.length) {
        el.textContent = this.currentInput[i];
        el.classList.remove('empty');
      } else {
        el.textContent = '';
        el.classList.add('empty');
      }
    });
  },

  _updatePips() {
    this.pips.forEach((pip, i) => {
      if (i < this.guessesUsed) {
        pip.classList.add('used');
      } else {
        pip.classList.remove('used');
      }
    });

    const remaining = this.maxGuesses - this.guessesUsed;
    this.remainingText.textContent = `${remaining} guess${remaining !== 1 ? 'es' : ''} remaining`;
  },

  _addHistoryRow(guess, results) {
    // Clear previous — only show most recent guess
    this.historyEl.innerHTML = '';

    const row = document.createElement('div');
    row.className = 'guess-row';

    results.forEach(r => {
      const d = document.createElement('div');
      d.className = `lockbox-digit ${r.state}`;
      d.textContent = r.digit;
      row.appendChild(d);
    });

    this.historyEl.appendChild(row);
  },

  // =========================================
  // Audio — Procedural Web Audio API sounds
  // =========================================
  _ensureAudio() {
    if (!AudioManager.ctx) AudioManager.init();
    AudioManager.resume();
  },

  _playKeyClick() {
    this._ensureAudio();
    const ctx = AudioManager.ctx;
    const t = ctx.currentTime;

    // Tactile click: short sine burst + noise
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 750 + Math.random() * 150; // slight variation
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
    osc.connect(gain).connect(AudioManager.masterGain);
    osc.start(t);
    osc.stop(t + 0.04);

    // Noise burst for tactile feel
    const bufferSize = ctx.sampleRate * 0.02;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.3;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.04, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.025);
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 2000;
    noise.connect(filter).connect(noiseGain).connect(AudioManager.masterGain);
    noise.start(t);
    noise.stop(t + 0.03);
  },

  _playDeleteClick() {
    this._ensureAudio();
    const ctx = AudioManager.ctx;
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 500;
    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    osc.connect(gain).connect(AudioManager.masterGain);
    osc.start(t);
    osc.stop(t + 0.04);
  },

  _playCorrectReveal() {
    this._ensureAudio();
    const ctx = AudioManager.ctx;
    const t = ctx.currentTime;

    // Bright ascending chime
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 1047; // C6
    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.connect(gain).connect(AudioManager.masterGain);
    osc.start(t);
    osc.stop(t + 0.22);

    // Harmonic
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.value = 1568; // G6
    gain2.gain.setValueAtTime(0.08, t + 0.02);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc2.connect(gain2).connect(AudioManager.masterGain);
    osc2.start(t + 0.02);
    osc2.stop(t + 0.17);
  },

  _playPresentReveal() {
    this._ensureAudio();
    const ctx = AudioManager.ctx;
    const t = ctx.currentTime;

    // Neutral mid tone
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 659; // E5
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(gain).connect(AudioManager.masterGain);
    osc.start(t);
    osc.stop(t + 0.14);
  },

  _playAbsentReveal() {
    this._ensureAudio();
    const ctx = AudioManager.ctx;
    const t = ctx.currentTime;

    // Muted low thud
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 200;
    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    osc.connect(gain).connect(AudioManager.masterGain);
    osc.start(t);
    osc.stop(t + 0.08);
  },

  _playLockoutSound() {
    this._ensureAudio();
    const ctx = AudioManager.ctx;
    const t = ctx.currentTime;

    // Descending buzz
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.linearRampToValueAtTime(100, t + 0.4);

    filter.type = 'lowpass';
    filter.frequency.value = 800;

    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);

    osc.connect(filter).connect(gain).connect(AudioManager.masterGain);
    osc.start(t);
    osc.stop(t + 0.5);
  },

  // =========================================
  // Cleanup
  // =========================================
  destroy() {
    if (this._boundKeydown) {
      document.removeEventListener('keydown', this._boundKeydown);
    }
    if (this.lockoutInterval) {
      clearInterval(this.lockoutInterval);
    }
  }
};

// Auto-init when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  LockboxTask.init();
});
