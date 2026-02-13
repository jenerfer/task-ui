/* =============================================
   PORTALS GAME — Audio Manager
   Web Audio API — procedural sound effects
   ============================================= */

const AudioManager = {
  ctx: null,
  masterGain: null,
  enabled: true,

  /**
   * Initialize Web Audio context (call on first user interaction)
   */
  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.3;
    this.masterGain.connect(this.ctx.destination);
  },

  /**
   * Ensure context is running (browsers require user gesture)
   */
  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  },

  /**
   * Play a named sound effect
   * @param {string} name - Sound name
   */
  play(name) {
    if (!this.enabled) return;
    if (!this.ctx) this.init();
    this.resume();

    switch (name) {
      case 'tick':       this._tick(); break;
      case 'whoosh':     this._whoosh(); break;
      case 'hit':        this._hit(); break;
      case 'miss':       this._miss(); break;
      case 'success':    this._success(); break;
      case 'slider':     this._sliderTick(); break;
      case 'phase':      this._phaseTransition(); break;
      case 'align':      this._alignTone(); break;
      default: break;
    }
  },

  /**
   * Soft click/tick (for UI interactions)
   */
  _tick() {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 1200;
    gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.05);
    osc.connect(gain).connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.05);
  },

  /**
   * Slider drag tick
   */
  _sliderTick() {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 800 + Math.random() * 200;
    gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.03);
    osc.connect(gain).connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.04);
  },

  /**
   * Whoosh/sweep (ring rotation ambient)
   */
  _whoosh() {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(100, this.ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(300, this.ctx.currentTime + 0.15);
    osc.frequency.linearRampToValueAtTime(80, this.ctx.currentTime + 0.3);

    filter.type = 'lowpass';
    filter.frequency.value = 600;

    gain.gain.setValueAtTime(0.06, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);

    osc.connect(filter).connect(gain).connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.35);
  },

  /**
   * Hit green zone (satisfying snap/chime)
   */
  _hit() {
    const t = this.ctx.currentTime;

    // Primary chime
    const osc1 = this.ctx.createOscillator();
    const gain1 = this.ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.value = 880;
    gain1.gain.setValueAtTime(0.2, t);
    gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc1.connect(gain1).connect(this.masterGain);
    osc1.start(t);
    osc1.stop(t + 0.3);

    // Harmonic
    const osc2 = this.ctx.createOscillator();
    const gain2 = this.ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.value = 1320;
    gain2.gain.setValueAtTime(0.1, t + 0.02);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    osc2.connect(gain2).connect(this.masterGain);
    osc2.start(t + 0.02);
    osc2.stop(t + 0.25);
  },

  /**
   * Miss (subtle error buzz)
   */
  _miss() {
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 150;
    gain.gain.setValueAtTime(0.1, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(gain).connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.2);
  },

  /**
   * Success fanfare (task complete)
   */
  _success() {
    const t = this.ctx.currentTime;
    const notes = [523, 659, 784, 1047]; // C5, E5, G5, C6

    notes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;

      const start = t + i * 0.12;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.18, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.5);

      osc.connect(gain).connect(this.masterGain);
      osc.start(start);
      osc.stop(start + 0.55);
    });
  },

  /**
   * Phase transition sweep
   */
  _phaseTransition() {
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(800, t + 0.4);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, t);
    filter.frequency.exponentialRampToValueAtTime(2000, t + 0.4);

    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);

    osc.connect(filter).connect(gain).connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.55);
  },

  /**
   * Rising tone (waveforms approaching alignment)
   * @param {number} proximity - 0 to 1 (1 = perfect match)
   */
  _alignTone(proximity = 0.5) {
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 400 + proximity * 600;
    gain.gain.setValueAtTime(0.05 + proximity * 0.1, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.connect(gain).connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.12);
  },

  /**
   * Play alignment tone with proximity value
   * @param {number} proximity - 0 to 1
   */
  playAlignTone(proximity) {
    if (!this.enabled) return;
    if (!this.ctx) this.init();
    this.resume();
    this._alignTone(proximity);
  },

  /**
   * Toggle audio on/off
   */
  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  },

  /**
   * Set master volume
   * @param {number} vol - 0 to 1
   */
  setVolume(vol) {
    if (this.masterGain) {
      this.masterGain.gain.value = Math.max(0, Math.min(1, vol));
    }
  }
};

// Initialize on first click/touch
document.addEventListener('click', () => AudioManager.init(), { once: true });
document.addEventListener('touchstart', () => AudioManager.init(), { once: true });
