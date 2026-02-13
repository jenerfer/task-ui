/* =============================================
   PORTALS GAME — MRI Calibration Task
   Phase 1: Ring Alignment (4 rounds)
   Phase 2: Frequency Calibration (sliders)
   ============================================= */

const MRITask = {
  // Phase 1 config
  phase1: {
    canvas: null,
    ctx: null,
    rounds: [
      { zoneSize: 45, speed: 1.2 },   // tighter than before (was 60°)
      { zoneSize: 35, speed: 1.8 },   // tighter than before (was 45°)
      { zoneSize: 28, speed: 2.5 },
      { zoneSize: 20, speed: 3.0 },
      { zoneSize: 15, speed: 3.5 }    // new 5th ring — hardest
    ],
    currentRound: 0,
    angle: 0,
    zoneStart: 0,
    running: false,
    animFrame: null,
    ringsCompleted: [false, false, false, false, false],
    missFlashTimer: 0,
    hitFlashTimer: 0,
    lastTimestamp: 0,
    consecutiveMisses: 0,
    cooldownActive: false,
    cooldownTimer: 0
  },

  // Phase 2 config
  phase2: {
    canvas: null,
    ctx: null,
    targetFreq: 0,
    targetAmp: 0,
    targetPhase: 0,
    currentFreq: 50,
    currentAmp: 50,
    currentPhase: 50,
    matched: false,
    animFrame: null,
    tolerance: 7,       // tighter tolerance — need precision
    lastSliderSound: 0
  },

  // Colors (read from CSS vars at init)
  colors: {
    primary: '#50FFE8',
    secondary1: '#9E71F7',
    secondary2: '#C7C8D8',
    success: '#44FFA2',
    error: '#FF4444',
    ring: 'rgba(80, 255, 232, 0.15)',
    ringBorder: 'rgba(80, 255, 232, 0.3)',
    bg: '#0E1519'
  },

  /**
   * Initialize the task
   */
  init() {
    // Read theme colors from CSS
    const style = getComputedStyle(document.documentElement);
    this.colors.primary = style.getPropertyValue('--area-primary').trim() || this.colors.primary;
    this.colors.secondary1 = style.getPropertyValue('--area-secondary1').trim() || this.colors.secondary1;
    this.colors.secondary2 = style.getPropertyValue('--area-secondary2').trim() || this.colors.secondary2;

    this.initPhase1();
  },

  /* =========================================
     PHASE 1: Ring Alignment
     ========================================= */

  initPhase1() {
    this.phase1.canvas = document.getElementById('mri-rings-canvas');
    this.phase1.ctx = this.phase1.canvas.getContext('2d');

    // Set canvas size
    this.resizeCanvas(this.phase1.canvas);
    window.addEventListener('resize', () => this.resizeCanvas(this.phase1.canvas));

    // Randomize green zone position for round 1
    this.phase1.zoneStart = Math.random() * 360;
    this.phase1.angle = 0;
    this.phase1.currentRound = 0;
    this.phase1.running = true;
    this.phase1.lastTimestamp = performance.now();

    // Click/tap to stop
    this.phase1.canvas.addEventListener('click', () => this.handleRingClick());
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && this.phase1.running) {
        e.preventDefault();
        this.handleRingClick();
      }
    });

    // Update UI
    this.updateRoundUI();

    // Start animation
    this.animatePhase1();
  },

  resizeCanvas(canvas) {
    const container = canvas.parentElement;
    const size = Math.min(container.clientWidth, container.clientHeight, 560);
    canvas.width = size * 2; // 2x for retina
    canvas.height = size * 2;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
  },

  animatePhase1(timestamp) {
    if (!this.phase1.running && this.phase1.currentRound >= 5) return;

    const dt = timestamp ? (timestamp - (this.phase1.lastTimestamp || timestamp)) / 1000 : 0.016;
    this.phase1.lastTimestamp = timestamp;

    const round = this.phase1.rounds[this.phase1.currentRound];
    if (round && this.phase1.running && !this.phase1.cooldownActive) {
      this.phase1.angle = (this.phase1.angle + round.speed * dt * 180) % 360;
    }

    // Decrease flash timers
    if (this.phase1.missFlashTimer > 0) this.phase1.missFlashTimer -= dt;
    if (this.phase1.hitFlashTimer > 0) this.phase1.hitFlashTimer -= dt;

    // Tick cooldown timer
    if (this.phase1.cooldownActive) {
      this.phase1.cooldownTimer -= dt;
      if (this.phase1.cooldownTimer <= 0) {
        this.phase1.cooldownActive = false;
        this.phase1.cooldownTimer = 0;
        this.phase1.consecutiveMisses = 0;
      }
    }

    this.drawRings();
    this.phase1.animFrame = requestAnimationFrame((t) => this.animatePhase1(t));
  },

  drawRings() {
    const canvas = this.phase1.canvas;
    const ctx = this.phase1.ctx;
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;

    ctx.clearRect(0, 0, w, h);

    const ringRadii = [0.44, 0.37, 0.30, 0.23, 0.16]; // 5 rings, outer to inner
    const ringWidth = w * 0.0315; // 30% thinner than original

    // Draw concentric rings
    for (let i = 0; i < 5; i++) {
      const r = w * ringRadii[i];
      const completed = this.phase1.ringsCompleted[i];
      const isActive = i === this.phase1.currentRound;

      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.lineWidth = ringWidth;

      if (completed) {
        // Completed ring: glowing primary color
        ctx.strokeStyle = this.colors.primary;
        ctx.shadowColor = this.colors.primary;
        ctx.shadowBlur = 20;
        ctx.globalAlpha = 0.8;
      } else if (isActive) {
        // Active ring: brighter border
        ctx.strokeStyle = this.colors.ringBorder;
        ctx.shadowColor = this.colors.primary;
        ctx.shadowBlur = 8;
        ctx.globalAlpha = 0.5;
      } else {
        // Inactive ring: dim
        ctx.strokeStyle = 'rgba(37, 43, 44, 0.6)';
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 0.4;
      }

      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    // Draw green zone on active ring
    const currentRound = this.phase1.currentRound;
    if (currentRound < 5) {
      const round = this.phase1.rounds[currentRound];
      const r = w * ringRadii[currentRound];
      const zoneStartRad = (this.phase1.zoneStart - 90) * Math.PI / 180;
      const zoneSizeRad = round.zoneSize * Math.PI / 180;

      // Green target zone
      ctx.beginPath();
      ctx.arc(cx, cy, r, zoneStartRad, zoneStartRad + zoneSizeRad);
      ctx.lineWidth = ringWidth + 4;
      ctx.strokeStyle = this.colors.success;
      ctx.shadowColor = this.colors.success;
      ctx.shadowBlur = 12;
      ctx.globalAlpha = 0.6;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;

      // Rotating line marker (spans full radius for precision)
      const markerRad = (this.phase1.angle - 90) * Math.PI / 180;
      const lineInner = r - ringWidth * 0.9;
      const lineOuter = r + ringWidth * 0.9;
      const mx1 = cx + Math.cos(markerRad) * lineInner;
      const my1 = cy + Math.sin(markerRad) * lineInner;
      const mx2 = cx + Math.cos(markerRad) * lineOuter;
      const my2 = cy + Math.sin(markerRad) * lineOuter;

      // Flash color on hit/miss
      let markerColor = '#FFFFFF';
      let markerGlow = '#FFFFFF';
      if (this.phase1.hitFlashTimer > 0) {
        markerColor = this.colors.success;
        markerGlow = this.colors.success;
      } else if (this.phase1.missFlashTimer > 0) {
        markerColor = this.colors.error;
        markerGlow = this.colors.error;
      }

      // Line marker
      ctx.beginPath();
      ctx.moveTo(mx1, my1);
      ctx.lineTo(mx2, my2);
      ctx.lineWidth = 3;
      ctx.strokeStyle = markerColor;
      ctx.shadowColor = markerGlow;
      ctx.shadowBlur = 20;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Small tip dot at outer end for visibility
      ctx.beginPath();
      ctx.arc(mx2, my2, 4, 0, Math.PI * 2);
      ctx.fillStyle = markerColor;
      ctx.shadowColor = markerGlow;
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Subtle trail lines
      for (let t = 1; t <= 4; t++) {
        const trailAngle = markerRad - t * 0.04;
        const tx1 = cx + Math.cos(trailAngle) * lineInner;
        const ty1 = cy + Math.sin(trailAngle) * lineInner;
        const tx2 = cx + Math.cos(trailAngle) * lineOuter;
        const ty2 = cy + Math.sin(trailAngle) * lineOuter;
        ctx.beginPath();
        ctx.moveTo(tx1, ty1);
        ctx.lineTo(tx2, ty2);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.12 - t * 0.025})`;
        ctx.stroke();
      }
    }

    // Center circle (MRI bore)
    const innerR = w * 0.08;
    ctx.beginPath();
    ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(80, 255, 232, 0.05)';
    ctx.strokeStyle = this.colors.ringBorder;
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();

    // Center dot
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fillStyle = this.colors.primary;
    ctx.shadowColor = this.colors.primary;
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Cooldown overlay
    if (this.phase1.cooldownActive) {
      // Semi-transparent dark overlay
      ctx.fillStyle = 'rgba(14, 21, 25, 0.75)';
      ctx.fillRect(0, 0, w, h);

      // Countdown text
      const seconds = Math.ceil(this.phase1.cooldownTimer);
      ctx.font = `${w * 0.07}px Bungee, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // "COOLDOWN" label
      ctx.fillStyle = this.colors.error;
      ctx.shadowColor = this.colors.error;
      ctx.shadowBlur = 15;
      ctx.fillText('COOLDOWN', cx, cy - w * 0.04);

      // Countdown number
      ctx.font = `${w * 0.12}px Bungee, sans-serif`;
      ctx.fillStyle = '#FFFFFF';
      ctx.shadowColor = this.colors.error;
      ctx.shadowBlur = 20;
      ctx.fillText(seconds + 's', cx, cy + w * 0.06);
      ctx.shadowBlur = 0;

      // Progress arc showing time remaining
      const progress = this.phase1.cooldownTimer / 8;
      ctx.beginPath();
      ctx.arc(cx, cy, w * 0.25, -Math.PI / 2, -Math.PI / 2 + (1 - progress) * Math.PI * 2);
      ctx.lineWidth = 3;
      ctx.strokeStyle = `rgba(255, 68, 68, 0.4)`;
      ctx.stroke();
    }
  },

  handleRingClick() {
    if (!this.phase1.running || this.phase1.currentRound >= 5) return;
    if (this.phase1.cooldownActive) return; // blocked during cooldown

    AudioManager.init();

    const round = this.phase1.rounds[this.phase1.currentRound];
    const zoneStart = this.phase1.zoneStart;
    const zoneEnd = (zoneStart + round.zoneSize) % 360;
    const angle = this.phase1.angle;

    // Check if marker is in green zone
    let inZone = false;
    if (zoneEnd > zoneStart) {
      inZone = angle >= zoneStart && angle <= zoneEnd;
    } else {
      // Zone wraps around 360
      inZone = angle >= zoneStart || angle <= zoneEnd;
    }

    if (inZone) {
      // HIT!
      AudioManager.play('hit');
      this.phase1.hitFlashTimer = 0.3;
      this.phase1.ringsCompleted[this.phase1.currentRound] = true;
      this.phase1.consecutiveMisses = 0; // reset miss streak

      // Update progress dots
      this.updateProgressDots();

      this.phase1.currentRound++;

      if (this.phase1.currentRound >= 5) {
        // All rings complete — transition to Phase 2
        this.phase1.running = false;
        setTimeout(() => this.startPhase2Transition(), 800);
      } else {
        // Next round — new random zone position
        this.phase1.zoneStart = Math.random() * 360;
        this.updateRoundUI();
      }
    } else {
      // MISS
      AudioManager.play('miss');
      this.phase1.missFlashTimer = 0.3;
      this.phase1.consecutiveMisses++;

      // Shake the canvas slightly
      this.phase1.canvas.style.animation = 'none';
      this.phase1.canvas.offsetHeight; // force reflow
      this.phase1.canvas.style.animation = 'shake 0.3s ease';

      // Trigger cooldown after 3 consecutive misses
      if (this.phase1.consecutiveMisses >= 3) {
        this.phase1.cooldownActive = true;
        this.phase1.cooldownTimer = 8;
        AudioManager.play('miss'); // extra buzz for punishment
      }
    }
  },

  updateRoundUI() {
    // Progress dots handle visual feedback — no label badges needed
  },

  updateProgressDots() {
    const dots = document.querySelectorAll('.progress-dot');
    dots.forEach((dot, i) => {
      if (this.phase1.ringsCompleted[i]) {
        dot.classList.add('filled');
        dot.classList.remove('active');
      } else if (i === this.phase1.currentRound + 1) {
        dot.classList.add('active');
      }
    });
  },

  /* =========================================
     PHASE 2: Frequency Calibration
     ========================================= */

  startPhase2Transition() {
    AudioManager.play('phase');

    const phase1El = document.getElementById('phase1');
    const phase2El = document.getElementById('phase2');

    TaskShell.transitionPhase(phase1El, phase2El, () => {
      this.initPhase2();
    });
  },

  initPhase2() {
    this.phase2.canvas = document.getElementById('waveform-canvas');
    this.phase2.ctx = this.phase2.canvas.getContext('2d');

    // Set canvas size
    this.resizeWaveformCanvas();
    window.addEventListener('resize', () => this.resizeWaveformCanvas());

    // Random target values — spread across the full range
    // Ensure targets are far from center (50) so player MUST move all sliders
    this.phase2.targetFreq = this._randomFarFromCenter(15, 85, 50, 18);
    this.phase2.targetAmp = this._randomFarFromCenter(15, 85, 50, 18);
    this.phase2.targetPhase = this._randomFarFromCenter(15, 85, 50, 18);

    // Start player values far from ALL targets
    this.phase2.currentFreq = this._randomFarFrom(this.phase2.targetFreq, 0, 100, 25);
    this.phase2.currentAmp = this._randomFarFrom(this.phase2.targetAmp, 0, 100, 25);
    this.phase2.currentPhase = this._randomFarFrom(this.phase2.targetPhase, 0, 100, 25);

    // Bind sliders
    this.bindSlider('freq-slider', 'currentFreq', 'targetFreq');
    this.bindSlider('amp-slider', 'currentAmp', 'targetAmp');
    this.bindSlider('phase-slider', 'currentPhase', 'targetPhase');

    // Start waveform animation
    this.animatePhase2();
  },

  resizeWaveformCanvas() {
    const canvas = this.phase2.canvas;
    if (!canvas) return;
    const container = canvas.parentElement;
    canvas.width = container.clientWidth * 2;
    canvas.height = 300;
    canvas.style.width = '100%';
    canvas.style.height = '150px';
  },

  bindSlider(sliderId, currentProp, targetProp) {
    const slider = document.getElementById(sliderId);
    if (!slider) return;

    slider.value = this.phase2[currentProp];

    slider.addEventListener('input', (e) => {
      this.phase2[currentProp] = parseFloat(e.target.value);

      // Play slider tick (throttled)
      const now = Date.now();
      if (now - this.phase2.lastSliderSound > 50) {
        AudioManager.play('slider');
        this.phase2.lastSliderSound = now;
      }

      // Check alignment
      this.checkAlignment();
    });
  },

  checkAlignment() {
    const tolerance = this.phase2.tolerance;
    const freqDiff = Math.abs(this.phase2.currentFreq - this.phase2.targetFreq);
    const ampDiff = Math.abs(this.phase2.currentAmp - this.phase2.targetAmp);
    const phaseDiff = Math.abs(this.phase2.currentPhase - this.phase2.targetPhase);

    // Calculate overall proximity (0 = far, 1 = perfect)
    const maxDiff = 50; // max possible diff per slider
    const totalDiff = freqDiff + ampDiff + phaseDiff;
    const proximity = Math.max(0, 1 - totalDiff / (maxDiff * 3));

    // Update proximity indicator
    const indicator = document.getElementById('alignment-indicator');
    if (indicator) {
      indicator.style.width = (proximity * 100) + '%';
      indicator.style.background = proximity > 0.8
        ? this.colors.success
        : `linear-gradient(90deg, ${this.colors.secondary1}, ${this.colors.primary})`;
    }

    // Play alignment tone at high proximity
    if (proximity > 0.6) {
      const now = Date.now();
      if (now - this.phase2.lastSliderSound > 100) {
        AudioManager.playAlignTone(proximity);
      }
    }

    // Check if matched
    if (freqDiff < tolerance && ampDiff < tolerance && phaseDiff < tolerance) {
      if (!this.phase2.matched) {
        this.phase2.matched = true;
        this.onFrequencyMatched();
      }
    }
  },

  animatePhase2(timestamp) {
    if (this.phase2.matched && !this.phase2.canvas) return;

    this.drawWaveforms(timestamp);
    this.phase2.animFrame = requestAnimationFrame((t) => this.animatePhase2(t));
  },

  drawWaveforms(timestamp) {
    const canvas = this.phase2.canvas;
    const ctx = this.phase2.ctx;
    if (!canvas || !ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const t = (timestamp || 0) / 1000;

    ctx.clearRect(0, 0, w, h);

    // Draw target waveform
    this.drawWave(ctx, w, h,
      this.phase2.targetFreq, this.phase2.targetAmp, this.phase2.targetPhase,
      this.colors.primary, 0.6, t, 3
    );

    // Draw player waveform
    this.drawWave(ctx, w, h,
      this.phase2.currentFreq, this.phase2.currentAmp, this.phase2.currentPhase,
      this.colors.secondary1, 0.9, t, 2.5
    );
  },

  drawWave(ctx, w, h, freq, amp, phase, color, alpha, time, lineWidth) {
    const midY = h / 2;
    // Each param maps to a distinct waveform characteristic:
    // freq: controls number of cycles (1 to 5) — very visible change
    const freqVal = 1 + (freq / 100) * 4;
    // amp: controls wave height (20% to 80% of half-height) — very visible
    const ampVal = (0.2 + (amp / 100) * 0.6) * (h * 0.4);
    // phase: horizontal shift (0 to 2PI) — subtle but distinct
    const phaseVal = (phase / 100) * Math.PI * 2;

    ctx.beginPath();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;

    for (let x = 0; x < w; x++) {
      const xNorm = x / w;
      // Compound waveform: primary sine + subtle harmonic for complexity
      const primary = Math.sin(xNorm * freqVal * Math.PI * 2 + phaseVal + time * 0.8);
      const harmonic = Math.sin(xNorm * freqVal * 2 * Math.PI * 2 + phaseVal * 1.5 + time * 0.8) * 0.2;
      const y = midY + (primary + harmonic) * ampVal;
      if (x === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  },

  onFrequencyMatched() {
    AudioManager.play('hit');

    // Flash waveforms green
    const canvas = this.phase2.canvas;
    if (canvas) {
      canvas.style.transition = 'filter 0.5s ease';
      canvas.style.filter = 'brightness(1.5) hue-rotate(-20deg)';
    }

    // Disable sliders
    document.querySelectorAll('#phase2 .slider').forEach(s => {
      s.disabled = true;
      s.style.opacity = '0.5';
    });

    // Update alignment indicator to full
    const indicator = document.getElementById('alignment-indicator');
    if (indicator) {
      indicator.style.width = '100%';
      indicator.style.background = this.colors.success;
    }

    // Show matched text
    const matchText = document.getElementById('match-text');
    if (matchText) {
      matchText.classList.remove('hidden');
    }

    // Complete task after delay
    setTimeout(() => {
      if (this.phase2.animFrame) {
        cancelAnimationFrame(this.phase2.animFrame);
      }
      TaskShell.showCompletion('mri-calibration');
    }, 1500);
  },

  /**
   * Generate random value far from a center value
   */
  _randomFarFromCenter(min, max, center, minDist) {
    let val;
    do {
      val = min + Math.random() * (max - min);
    } while (Math.abs(val - center) < minDist);
    return val;
  },

  /**
   * Generate random value far from a target
   */
  _randomFarFrom(target, min, max, minDist) {
    let val;
    let attempts = 0;
    do {
      val = min + Math.random() * (max - min);
      attempts++;
    } while (Math.abs(val - target) < minDist && attempts < 50);
    return val;
  },

  /**
   * Cleanup
   */
  destroy() {
    if (this.phase1.animFrame) cancelAnimationFrame(this.phase1.animFrame);
    if (this.phase2.animFrame) cancelAnimationFrame(this.phase2.animFrame);
  }
};

// Add shake animation
const shakeStyle = document.createElement('style');
shakeStyle.textContent = `
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    20% { transform: translateX(-6px); }
    40% { transform: translateX(6px); }
    60% { transform: translateX(-4px); }
    80% { transform: translateX(4px); }
  }
`;
document.head.appendChild(shakeStyle);

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  MRITask.init();
});
