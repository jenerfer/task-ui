/* =============================================
   PORTALS GAME — Generator Power Load Task
   Storage Bay — Balance 3 power nodes
   ============================================= */

const GeneratorTask = {
  // --- Config ---
  canvas: null,
  ctx: null,
  running: false,
  animFrame: null,
  lastTimestamp: 0,
  elapsed: 0,

  // Colors (read from CSS vars)
  colors: {
    primary: '#FECE54',
    secondary1: '#B1AEA4',
    secondary2: '#528F83',
    success: '#44FFA2',
    error: '#FF4444',
    bg: '#0E1519'
  },

  // --- Node State ---
  nodes: [
    { angle: 0.5, output: 0.5, driftPhase: 0, active: true,  surging: false, surgeTimer: 0, surgeReady: true },
    { angle: 0.5, output: 0.5, driftPhase: 2.1, active: false, surging: false, surgeTimer: 0, surgeReady: true },
    { angle: 0.5, output: 0.5, driftPhase: 4.2, active: false, surging: false, surgeTimer: 0, surgeReady: true }
  ],

  // --- Difficulty ---
  difficulty: {
    driftSpeed: 0.06,        // base drift speed (slow & forgiving)
    driftSpeedMax: 0.25,     // max drift speed after ramp (halved)
    rampTime: 40,            // slower ramp — takes longer to get hard
    node2ActivateAt: 6,
    node3ActivateAt: 14,
    gracePeriod: 4
  },

  // --- Power Zones ---
  totalOutput: 0.5,
  zones: {
    underpower:  { max: 0.25 },
    lowWarn:     { min: 0.25, max: 0.35 },
    safe:        { min: 0.35, max: 0.65 },
    highWarn:    { min: 0.65, max: 0.75 },
    overload:    { min: 0.75 }
  },

  // --- Stability (progress) ---
  stabilityTime: 0,
  stabilityGoal: 20,
  completed: false,

  // --- Cooldown ---
  cooldownActive: false,
  cooldownTimer: 0,
  cooldownDuration: 3,
  recoveryUntil: 0,      // timestamp — no overloads/surges until elapsed passes this

  // --- Power Surges (position-triggered) ---
  // Surges fire when a node drifts below the low-warning threshold (0.35)
  // Pushes the node clockwise toward overload — predictable cause & effect
  surgeDuration: 1.5,
  surgeThreshold: 0.35,  // triggers at left yellow marker on dial

  // --- Sparks ---
  sparks: [],

  // --- Hum audio ---
  humOsc: null,
  humGain: null,
  humFilter: null,

  // --- Mouse/touch ---
  draggingNode: -1,
  dragStartAngle: 0,
  dragStartNodeAngle: 0,
  _lastDragSound: 0,

  // --- Layout cache ---
  layout: {
    dialCenters: [],
    dialRadius: 0,
    gaugeRect: null
  },

  /**
   * Initialize the task
   */
  init() {
    const style = getComputedStyle(document.documentElement);
    this.colors.primary = style.getPropertyValue('--area-primary').trim() || this.colors.primary;
    this.colors.secondary1 = style.getPropertyValue('--area-secondary1').trim() || this.colors.secondary1;
    this.colors.secondary2 = style.getPropertyValue('--area-secondary2').trim() || this.colors.secondary2;

    this.canvas = document.getElementById('generator-canvas');
    this.ctx = this.canvas.getContext('2d');

    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());

    // Reset state
    this.elapsed = 0;
    this.stabilityTime = 0;
    this.completed = false;
    this.cooldownActive = false;
    this.cooldownTimer = 0;
    this.recoveryUntil = 0;
    this.sparks = [];
    this.draggingNode = -1;

    // Reset nodes — all start centered in safe zone, drift pulls them out
    this.nodes[0] = { angle: 0.5, output: 0.5, driftPhase: 0, active: true, surging: false, surgeTimer: 0, surgeReady: true };
    this.nodes[1] = { angle: 0.5, output: 0.5, driftPhase: 2.1, active: false, surging: false, surgeTimer: 0, surgeReady: true };
    this.nodes[2] = { angle: 0.5, output: 0.5, driftPhase: 4.2, active: false, surging: false, surgeTimer: 0, surgeReady: true };

    this._computeTotalOutput();

    this._bindInput();
    this._startHum();

    this.running = true;
    this.lastTimestamp = performance.now();
    this.animate(this.lastTimestamp);
  },

  resizeCanvas() {
    const container = this.canvas.parentElement;
    const containerW = container.clientWidth || 860;
    const maxW = Math.min(containerW, 860);
    const w = maxW;
    const h = Math.round(w * 0.62);

    this.canvas.width = w * 2;
    this.canvas.height = h * 2;
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
  },

  /* =========================================
     MAIN LOOP
     ========================================= */

  animate(timestamp) {
    if (!this.running) return;

    const dt = Math.min((timestamp - this.lastTimestamp) / 1000, 0.05);
    this.lastTimestamp = timestamp;

    this.update(dt);
    this.draw();

    this.animFrame = requestAnimationFrame((t) => this.animate(t));
  },

  update(dt) {
    if (this.completed) return;

    this.elapsed += dt;

    // --- Cooldown tick ---
    if (this.cooldownActive) {
      this.cooldownTimer -= dt;
      if (this.cooldownTimer <= 0) {
        this.cooldownActive = false;
        this.cooldownTimer = 0;
        this.recoveryUntil = this.elapsed + 3; // 3s grace to recover
        this.nodes.forEach(n => { if (n.active) { n.angle = 0.5; n.output = 0.5; n.surging = false; n.surgeReady = true; } });
      }
      this._updateSparks(dt);
      this._updateHum();
      return;
    }

    this._updateDifficulty();
    this._updateDrift(dt);
    this._updateSurges(dt);
    this._computeTotalOutput();
    this._checkZones(dt);
    this._updateSparks(dt);
    this._updateHum();
    this._updateStabilityBar();
  },

  /* =========================================
     UPDATE HELPERS
     ========================================= */

  _updateDifficulty() {
    if (!this.nodes[1].active && this.elapsed >= this.difficulty.node2ActivateAt) {
      this.nodes[1].active = true;
      this.nodes[1].angle = 0.5;  // starts dead centre — gives player time to react
      this.nodes[1].output = 0.5;
      AudioManager.play('phase');
    }

    if (!this.nodes[2].active && this.elapsed >= this.difficulty.node3ActivateAt) {
      this.nodes[2].active = true;
      this.nodes[2].angle = 0.5;  // starts dead centre — gives player time to react
      this.nodes[2].output = 0.5;
      AudioManager.play('phase');
    }
  },

  _updateDrift(dt) {
    const progress = Math.min(this.elapsed / this.difficulty.rampTime, 1);
    const baseSpeed = this.difficulty.driftSpeed + (this.difficulty.driftSpeedMax - this.difficulty.driftSpeed) * progress;

    this.nodes.forEach((node, i) => {
      if (!node.active) return;

      // Each node drifts at different speeds — later nodes slightly faster
      const nodeSpeedMult = 1 + i * 0.25; // N1: 1x, N2: 1.25x, N3: 1.5x
      const speed = baseSpeed * nodeSpeedMult;

      node.driftPhase += dt * (0.5 + i * 0.15);

      // Each node has a distinct drift "personality"
      let drift;
      if (i === 0) {
        // Node 1: smooth, slow sine wave — very readable
        drift = Math.sin(node.driftPhase * 0.8) * 0.6
               + (Math.random() - 0.5) * 0.05;
      } else if (i === 1) {
        // Node 2: two waves — moderate
        drift = Math.sin(node.driftPhase * 1.0) * 0.5
               + Math.sin(node.driftPhase * 2.0 + 1.5) * 0.3
               + (Math.random() - 0.5) * 0.08;
      } else {
        // Node 3: two waves + some noise — trickiest but manageable
        drift = Math.sin(node.driftPhase * 1.2) * 0.45
               + Math.sin(node.driftPhase * 2.5 + 3.0) * 0.3
               + (Math.random() - 0.5) * 0.12;
      }

      const driftAmount = speed * dt * drift;

      // Surge push — gentle nudge, noticeable but not violent
      let surgePush = 0;
      if (node.surging) {
        surgePush = dt * 0.3;
      }

      node.angle = Math.max(0.02, Math.min(0.98, node.angle + driftAmount + surgePush));
      node.output = node.angle;
    });
  },

  _updateSurges(dt) {
    // Tick down active surges
    this.nodes.forEach(node => {
      if (node.surging) {
        node.surgeTimer -= dt;
        if (node.surgeTimer <= 0) {
          node.surging = false;
          node.surgeTimer = 0;
        }
      }
    });

    // Position-triggered surges: when a node drifts below the low-warning
    // threshold (first yellow marker left of centre), it fires a surge that
    // pushes it clockwise toward overload. Predictable cause & effect.
    // Disabled during recovery window so player can stabilise after overload.
    const inRecovery = this.elapsed < this.recoveryUntil;
    this.nodes.forEach(node => {
      if (!node.active || node.surging) return;

      if (!inRecovery && node.output <= this.surgeThreshold && node.surgeReady) {
        // Crossed below threshold — fire surge + penalise progress
        node.surging = true;
        node.surgeTimer = this.surgeDuration;
        node.surgeReady = false; // won't re-trigger until back above threshold
        this.stabilityTime = Math.max(0, this.stabilityTime * 0.9); // lose 10% progress
        this._updateStabilityBar();
        AudioManager.play('miss');
      } else if (node.output > this.surgeThreshold + 0.05) {
        // Re-arm once safely above threshold (small hysteresis band)
        node.surgeReady = true;
      }
    });
  },

  _computeTotalOutput() {
    const activeNodes = this.nodes.filter(n => n.active);
    if (activeNodes.length === 0) {
      this.totalOutput = 0.5;
      return;
    }

    // Simple average of all active nodes — predictable, matches what players see
    let sum = 0;
    activeNodes.forEach(n => { sum += n.output; });
    this.totalOutput = sum / activeNodes.length;
    this.totalOutput = Math.max(0, Math.min(1, this.totalOutput));
  },

  _checkZones(dt) {
    const out = this.totalOutput;
    const inGrace = this.elapsed < this.difficulty.gracePeriod;
    const inRecovery = this.elapsed < this.recoveryUntil;

    // Check if ALL active nodes are individually in a reasonable range (0.25 - 0.75)
    // Tighter range ensures player must actively manage EVERY dial, not just 1-2
    const allNodesBalanced = this.nodes
      .filter(n => n.active)
      .every(n => n.output >= 0.25 && n.output <= 0.75);

    if (out >= this.zones.safe.min && out <= this.zones.safe.max && allNodesBalanced) {
      // Only accumulate stability after grace period
      if (!inGrace) {
        this.stabilityTime += dt;

        const pct = this.stabilityTime / this.stabilityGoal;
        if (pct >= 0.25 && pct - dt / this.stabilityGoal < 0.25) AudioManager.play('hit');
        if (pct >= 0.50 && pct - dt / this.stabilityGoal < 0.50) AudioManager.play('hit');
        if (pct >= 0.75 && pct - dt / this.stabilityGoal < 0.75) AudioManager.play('hit');

        if (this.stabilityTime >= this.stabilityGoal) {
          this._onTaskComplete();
          return;
        }
      }
    }

    // Overload — only after grace period AND recovery window
    // Triggers if TOTAL output is in overload OR ANY single node hits the red zone
    if (!inGrace && !inRecovery) {
      const anyNodeInRed = this.nodes
        .filter(n => n.active)
        .some(n => n.output >= this.zones.overload.min);

      if (out > this.zones.overload.min || anyNodeInRed) {
        this._triggerCooldown();
      }
    }
  },

  _triggerCooldown() {
    this.cooldownActive = true;
    this.cooldownTimer = this.cooldownDuration;
    // Knock 10% off current progress
    this.stabilityTime = Math.max(0, this.stabilityTime * 0.9);
    AudioManager.play('miss');

    for (let i = 0; i < 25; i++) {
      this._spawnSpark(this.canvas.width / 2, this.canvas.height * 0.72);
    }
  },

  _updateSparks(dt) {
    if (this.cooldownActive && Math.random() < 0.3) {
      this._spawnSpark(
        this.canvas.width * (0.2 + Math.random() * 0.6),
        this.canvas.height * (0.5 + Math.random() * 0.3)
      );
    }

    if (!this.cooldownActive && this.totalOutput > this.zones.overload.min && Math.random() < 0.15) {
      this._spawnSpark(this.canvas.width / 2, this.canvas.height * 0.72);
    }

    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 400 * dt;
      s.life -= dt;
      if (s.life <= 0) {
        this.sparks.splice(i, 1);
      }
    }
  },

  _spawnSpark(x, y) {
    this.sparks.push({
      x, y,
      vx: (Math.random() - 0.5) * 300,
      vy: -100 - Math.random() * 250,
      life: 0.5 + Math.random() * 0.8,
      maxLife: 0.5 + Math.random() * 0.8,
      size: 2 + Math.random() * 3
    });
  },

  _updateHum() {
    if (!this.humOsc || !this.humGain) return;
    const out = this.totalOutput;
    const freq = 55 + out * 45;
    const vol = 0.02 + out * 0.04;
    try {
      this.humOsc.frequency.setTargetAtTime(freq, AudioManager.ctx.currentTime, 0.1);
      this.humGain.gain.setTargetAtTime(this.cooldownActive ? 0.08 : vol, AudioManager.ctx.currentTime, 0.1);
      this.humFilter.frequency.setTargetAtTime(120 + out * 200, AudioManager.ctx.currentTime, 0.1);
    } catch(e) { /* ignore */ }
  },

  _updateStabilityBar() {
    const pct = Math.min(this.stabilityTime / this.stabilityGoal, 1) * 100;
    const bar = document.getElementById('stability-indicator');
    if (bar) {
      bar.style.width = pct + '%';
      if (pct >= 100) {
        bar.style.background = this.colors.success;
      }
    }
  },

  _startHum() {
    AudioManager.init();
    AudioManager.resume();

    if (!AudioManager.ctx) return;

    try {
      this.humOsc = AudioManager.ctx.createOscillator();
      this.humGain = AudioManager.ctx.createGain();
      this.humFilter = AudioManager.ctx.createBiquadFilter();

      this.humOsc.type = 'sawtooth';
      this.humOsc.frequency.value = 60;

      this.humFilter.type = 'lowpass';
      this.humFilter.frequency.value = 150;
      this.humFilter.Q.value = 2;

      this.humGain.gain.value = 0.02;

      this.humOsc.connect(this.humFilter);
      this.humFilter.connect(this.humGain);
      this.humGain.connect(AudioManager.masterGain);

      this.humOsc.start();
    } catch(e) {
      this.humOsc = null;
      this.humGain = null;
      this.humFilter = null;
    }
  },

  _stopHum() {
    try {
      if (this.humOsc) { this.humOsc.stop(); this.humOsc.disconnect(); }
      if (this.humGain) this.humGain.disconnect();
      if (this.humFilter) this.humFilter.disconnect();
    } catch(e) { /* ignore */ }
    this.humOsc = null;
    this.humGain = null;
    this.humFilter = null;
  },

  /* =========================================
     DRAWING
     ========================================= */

  draw() {
    const canvas = this.canvas;
    const ctx = this.ctx;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    this._computeLayout(w, h);

    // Draw dials
    for (let i = 0; i < 3; i++) {
      this._drawDial(i);
    }

    // Draw total power gauge (uses clip instead of destination-in to avoid erasing dials)
    this._drawTotalGauge();

    // Draw sparks
    this._drawSparks();

    // Cooldown overlay
    if (this.cooldownActive) {
      this._drawCooldownOverlay();
    }
  },

  _computeLayout(w, h) {
    const spacing = w * 0.3;
    const centerX = w / 2;
    const dialY = h * 0.35;

    // Panel sizing: panels span the spacing minus a gap
    const panelGap = 40;  // 20px at 2x
    const panelInset = 60; // 30px padding at 2x, each side
    const panelW = spacing - panelGap;

    // Dial radius constrained so it fits inside the panel with 30px padding each side
    const maxDialR = (panelW - panelInset * 2) / 2;
    const dialR = Math.min(maxDialR, h * 0.28);

    this.layout.dialRadius = dialR;
    this.layout.dialCenters = [
      { x: centerX - spacing, y: dialY },
      { x: centerX,           y: dialY },
      { x: centerX + spacing, y: dialY }
    ];

    const gaugeW = w * 0.7;
    const gaugeH = h * 0.03;  // slim gauge bar
    const gaugeX = (w - gaugeW) / 2;
    const gaugeY = h * 0.75;
    this.layout.gaugeRect = { x: gaugeX, y: gaugeY, w: gaugeW, h: gaugeH };
  },

  _drawDial(index) {
    const ctx = this.ctx;
    const node = this.nodes[index];
    const center = this.layout.dialCenters[index];
    const r = this.layout.dialRadius;

    if (!center) return;

    const isActive = node.active;
    const alpha = isActive ? 1 : 0.25;

    ctx.save();
    ctx.globalAlpha = alpha;

    // --- Diegetic background panel behind dial ---
    // Panel width derived from dial spacing so panels never overlap (20px gap = 40 at 2x)
    const dialSpacing = this.canvas.width * 0.3;
    const panelGap = 40; // 20px at 2x scale
    const panelW = dialSpacing - panelGap;
    const panelPadV = r * 0.28;
    const panelLeft = center.x - panelW / 2;
    const panelTop = center.y - r - panelPadV;
    const panelBottom = center.y + r + panelPadV;
    const panelH = panelBottom - panelTop;
    const panelR = 50; // 25px at 2x scale

    ctx.fillStyle = '#11181D';
    this._roundRect(ctx, panelLeft, panelTop, panelW, panelH, panelR);
    ctx.fill();

    // --- Outer ring (gauge body) — flat dark fill, no inner glow ---
    ctx.beginPath();
    ctx.arc(center.x, center.y, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(20, 28, 32, 0.92)';
    ctx.fill();

    // Border — 3px yellow stroke with prominent glow
    ctx.beginPath();
    ctx.arc(center.x, center.y, r, 0, Math.PI * 2);
    ctx.lineWidth = 3;
    if (node.surging) {
      ctx.strokeStyle = this.colors.error;
      ctx.shadowColor = this.colors.error;
      ctx.shadowBlur = 20;
    } else {
      ctx.strokeStyle = 'rgba(254, 206, 84, 0.45)';
      ctx.shadowColor = 'rgba(254, 206, 84, 0.35)';
      ctx.shadowBlur = 14;
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Surging flash ring
    if (node.surging) {
      const flashAlpha = 0.3 + Math.sin(this.elapsed * 12) * 0.3;
      ctx.beginPath();
      ctx.arc(center.x, center.y, r + 6, 0, Math.PI * 2);
      ctx.lineWidth = 3;
      ctx.strokeStyle = `rgba(255, 68, 68, ${flashAlpha})`;
      ctx.stroke();
    }

    // --- Tick marks ---
    const numTicks = 20;
    const arcStart = Math.PI * 0.75;
    const arcEnd = Math.PI * 2.25;
    const arcSpan = arcEnd - arcStart;

    for (let t = 0; t <= numTicks; t++) {
      const tickAngle = arcStart + (t / numTicks) * arcSpan;
      const isMajor = t % 5 === 0;
      const tickInner = r * (isMajor ? 0.72 : 0.78);
      const tickOuter = r * 0.88;

      ctx.beginPath();
      ctx.moveTo(
        center.x + Math.cos(tickAngle) * tickInner,
        center.y + Math.sin(tickAngle) * tickInner
      );
      ctx.lineTo(
        center.x + Math.cos(tickAngle) * tickOuter,
        center.y + Math.sin(tickAngle) * tickOuter
      );
      ctx.lineWidth = isMajor ? 2.5 : 1;
      ctx.strokeStyle = isMajor ? 'rgba(254, 206, 84, 0.6)' : 'rgba(132, 147, 153, 0.3)';
      ctx.stroke();
    }

    // --- Zone arcs on the dial ---
    const safeStart = arcStart + (this.zones.safe.min * arcSpan);
    const safeEnd = arcStart + (this.zones.safe.max * arcSpan);
    ctx.beginPath();
    ctx.arc(center.x, center.y, r * 0.85, safeStart, safeEnd);
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(68, 255, 162, 0.3)';
    ctx.stroke();

    const overloadStart = arcStart + (this.zones.overload.min * arcSpan);
    ctx.beginPath();
    ctx.arc(center.x, center.y, r * 0.85, overloadStart, arcEnd);
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(255, 68, 68, 0.3)';
    ctx.stroke();

    // --- Needle ---
    const needleAngle = arcStart + (node.angle * arcSpan);
    const needleLen = r * 0.68;
    const nx = center.x + Math.cos(needleAngle) * needleLen;
    const ny = center.y + Math.sin(needleAngle) * needleLen;

    // Needle line
    ctx.beginPath();
    ctx.moveTo(center.x, center.y);
    ctx.lineTo(nx, ny);
    ctx.lineWidth = 4;
    ctx.strokeStyle = this.colors.primary;
    ctx.shadowColor = this.colors.primary;
    ctx.shadowBlur = 14;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Needle tip dot
    ctx.beginPath();
    ctx.arc(nx, ny, 5, 0, Math.PI * 2);
    ctx.fillStyle = this.colors.primary;
    ctx.shadowColor = this.colors.primary;
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Center pivot
    ctx.beginPath();
    ctx.arc(center.x, center.y, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#2A3338';
    ctx.strokeStyle = this.colors.primary;
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();

    // --- Power bar (vertical, to the right of dial) ---
    const barX = center.x + r + 16;
    const barW = 12;
    const barH = r * 1.6;
    const barY = center.y - barH / 2;

    // Background — subtle yellow tint
    ctx.fillStyle = 'rgba(254, 206, 84, 0.08)';
    this._roundRect(ctx, barX, barY, barW, barH, 5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(254, 206, 84, 0.15)';
    ctx.lineWidth = 1;
    this._roundRect(ctx, barX, barY, barW, barH, 5);
    ctx.stroke();

    // Fill
    const fillH = Math.max(2, barH * node.output);
    const fillY = barY + barH - fillH;

    let fillColor;
    if (node.output > 0.75) fillColor = this.colors.error;
    else if (node.output > 0.65) fillColor = this.colors.primary;
    else if (node.output >= 0.35) fillColor = this.colors.success;
    else fillColor = this.colors.secondary2;

    ctx.fillStyle = fillColor;
    ctx.shadowColor = fillColor;
    ctx.shadowBlur = 8;
    this._roundRect(ctx, barX, fillY, barW, fillH, 5);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Active indicator dot — top-left corner of panel
    const dotRadius = 6;
    const dotX = panelLeft + panelR * 0.6 + dotRadius;
    const dotY = panelTop + panelR * 0.6 + dotRadius;

    ctx.beginPath();
    ctx.arc(dotX, dotY, dotRadius, 0, Math.PI * 2);
    if (isActive) {
      ctx.fillStyle = this.colors.primary;
      ctx.shadowColor = this.colors.primary;
      ctx.shadowBlur = 12;
    } else {
      ctx.fillStyle = 'rgba(132, 147, 153, 0.3)';
      ctx.shadowBlur = 0;
    }
    ctx.fill();
    ctx.shadowBlur = 0;

    // Node label below panel — Bungee h2 proportional size with yellow accent
    ctx.font = `${Math.max(r * 0.35, 20)}px 'Bungee', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = isActive ? 'rgba(254, 206, 84, 0.85)' : 'rgba(132, 147, 153, 0.3)';
    if (isActive) {
      ctx.shadowColor = 'rgba(254, 206, 84, 0.3)';
      ctx.shadowBlur = 8;
    }
    ctx.fillText(`N${index + 1}`, center.x, panelBottom + 10);
    ctx.shadowBlur = 0;

    ctx.restore();
  },

  _drawTotalGauge() {
    const ctx = this.ctx;
    const g = this.layout.gaugeRect;
    if (!g) return;

    const { x, y, w, h } = g;
    const inSafe = this.totalOutput >= this.zones.safe.min && this.totalOutput <= this.zones.safe.max;
    const inOverload = this.totalOutput > this.zones.overload.min;

    // --- Yellow outer glow / emission around the gauge ---
    ctx.save();
    if (inOverload && !this.cooldownActive) {
      // Pulsing red warning glow when in overload
      const pulseAlpha = 0.15 + Math.sin(this.elapsed * 8) * 0.1;
      ctx.shadowColor = this.colors.error;
      ctx.shadowBlur = 25;
      this._roundRect(ctx, x - 2, y - 2, w + 4, h + 4, h / 2 + 2);
      ctx.strokeStyle = `rgba(255, 68, 68, ${pulseAlpha})`;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.shadowBlur = 0;
    } else if (!inSafe && !this.cooldownActive) {
      // Pulsing yellow glow when NOT in safe zone (warning state)
      const pulseAlpha = 0.1 + Math.sin(this.elapsed * 5) * 0.08;
      ctx.shadowColor = this.colors.primary;
      ctx.shadowBlur = 20;
      this._roundRect(ctx, x - 2, y - 2, w + 4, h + 4, h / 2 + 2);
      ctx.strokeStyle = `rgba(254, 206, 84, ${pulseAlpha})`;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.shadowBlur = 0;
    } else if (inSafe && !this.cooldownActive) {
      // Steady green glow when safe
      const pulseAlpha = 0.12 + Math.sin(this.elapsed * 3) * 0.06;
      ctx.shadowColor = this.colors.success;
      ctx.shadowBlur = 18;
      this._roundRect(ctx, x - 2, y - 2, w + 4, h + 4, h / 2 + 2);
      ctx.strokeStyle = `rgba(68, 255, 162, ${pulseAlpha})`;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    ctx.restore();

    // --- Gauge bar with clipped rounded corners ---
    ctx.save();
    this._roundRect(ctx, x, y, w, h, h / 2);
    ctx.clip();

    // Background
    ctx.fillStyle = 'rgba(37, 43, 44, 0.4)';
    ctx.fillRect(x, y, w, h);

    // Zone gradient — smooth blended transitions between zones, brighter colors
    const grad = ctx.createLinearGradient(x, 0, x + w, 0);
    grad.addColorStop(0,    'rgba(82, 143, 131, 0.55)');   // low — teal
    grad.addColorStop(0.22, 'rgba(82, 143, 131, 0.5)');    // low end
    grad.addColorStop(0.28, 'rgba(254, 206, 84, 0.45)');   // blend into yellow warning
    grad.addColorStop(0.33, 'rgba(254, 206, 84, 0.4)');    // yellow warning
    grad.addColorStop(0.37, 'rgba(68, 255, 162, 0.55)');   // blend into green safe
    grad.addColorStop(0.50, 'rgba(68, 255, 162, 0.6)');    // green safe center — brightest
    grad.addColorStop(0.63, 'rgba(68, 255, 162, 0.55)');   // green safe end
    grad.addColorStop(0.67, 'rgba(254, 206, 84, 0.4)');    // blend into yellow warning
    grad.addColorStop(0.72, 'rgba(254, 206, 84, 0.45)');   // yellow warning
    grad.addColorStop(0.78, 'rgba(255, 68, 68, 0.45)');    // blend into red overload
    grad.addColorStop(1.0,  'rgba(255, 68, 68, 0.6)');     // red overload — bright
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);

    ctx.restore(); // ends clip

    // Border — yellow tint
    ctx.strokeStyle = 'rgba(254, 206, 84, 0.25)';
    ctx.lineWidth = 1.5;
    this._roundRect(ctx, x, y, w, h, h / 2);
    ctx.stroke();

    // --- Pulsing safe zone glow overlay ---
    if (inSafe && !this.cooldownActive) {
      const pulseAlpha = 0.06 + Math.sin(this.elapsed * 3) * 0.04;
      const safeX = x + this.zones.safe.min * w;
      const safeW = (this.zones.safe.max - this.zones.safe.min) * w;
      ctx.fillStyle = `rgba(68, 255, 162, ${pulseAlpha})`;
      ctx.fillRect(safeX, y - 8, safeW, h + 16);
    }

    // --- Marker triangle — 50% smaller, 4px (8 at 2x) gap above bar ---
    const markerX = x + this.totalOutput * w;
    const markerSize = h * 0.8;
    const markerGap = 8; // 4px at 2x scale

    ctx.beginPath();
    ctx.moveTo(markerX, y - markerGap);
    ctx.lineTo(markerX - markerSize * 0.4, y - markerGap - markerSize * 0.8);
    ctx.lineTo(markerX + markerSize * 0.4, y - markerGap - markerSize * 0.8);
    ctx.closePath();

    ctx.fillStyle = inSafe ? this.colors.success : (inOverload ? this.colors.error : this.colors.primary);
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = inSafe ? 16 : 8;
    ctx.fill();
    ctx.shadowBlur = 0;

    // --- Labels — much larger, using Bungee ---
    const labelY = y + h + 22;
    const cw = this.canvas.width;

    // "TOTAL OUTPUT" label — larger, yellow tinted
    ctx.font = `${Math.max(cw * 0.02, 20)}px 'Bungee', sans-serif`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(254, 206, 84, 0.7)';
    ctx.shadowColor = 'rgba(254, 206, 84, 0.2)';
    ctx.shadowBlur = 6;
    ctx.fillText('TOTAL OUTPUT', x + w / 2, labelY);
    ctx.shadowBlur = 0;

    // Zone labels — h3-proportional size in Bungee
    const zoneLabelSize = Math.max(cw * 0.022, 22);
    ctx.font = `${zoneLabelSize}px 'Bungee', sans-serif`;

    ctx.fillStyle = 'rgba(82, 143, 131, 0.6)';
    ctx.textAlign = 'left';
    ctx.fillText('LOW', x + 8, labelY + 30);

    ctx.fillStyle = 'rgba(68, 255, 162, 0.6)';
    ctx.textAlign = 'center';
    ctx.fillText('SAFE', x + w * 0.5, labelY + 30);

    ctx.fillStyle = 'rgba(255, 68, 68, 0.6)';
    ctx.textAlign = 'right';
    ctx.fillText('OVERLOAD', x + w - 8, labelY + 30);
  },

  _drawSparks() {
    const ctx = this.ctx;
    this.sparks.forEach(s => {
      const lifeRatio = s.life / s.maxLife;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size * lifeRatio, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(254, 206, 84, ${lifeRatio * 0.9})`;
      ctx.shadowColor = this.colors.primary;
      ctx.shadowBlur = 6;
      ctx.fill();
      ctx.shadowBlur = 0;
    });
  },

  _drawCooldownOverlay() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const cx = w / 2;
    const cy = h / 2;

    ctx.fillStyle = 'rgba(14, 21, 25, 0.75)';
    ctx.fillRect(0, 0, w, h);

    ctx.font = `${w * 0.05}px Bungee, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = this.colors.error;
    ctx.shadowColor = this.colors.error;
    ctx.shadowBlur = 20;
    ctx.fillText('OVERLOAD', cx, cy - w * 0.035);

    const seconds = Math.ceil(this.cooldownTimer);
    ctx.font = `${w * 0.09}px Bungee, sans-serif`;
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = this.colors.error;
    ctx.shadowBlur = 25;
    ctx.fillText(seconds + 's', cx, cy + w * 0.04);
    ctx.shadowBlur = 0;

    const progress = this.cooldownTimer / this.cooldownDuration;
    ctx.beginPath();
    ctx.arc(cx, cy, w * 0.15, -Math.PI / 2, -Math.PI / 2 + (1 - progress) * Math.PI * 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255, 68, 68, 0.4)';
    ctx.stroke();
  },

  /* =========================================
     INPUT HANDLING
     ========================================= */

  _bindInput() {
    this.canvas.addEventListener('mousedown', (e) => this._onPointerDown(e));
    window.addEventListener('mousemove', (e) => this._onPointerMove(e));
    window.addEventListener('mouseup', () => this._onPointerUp());

    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this._onPointerDown(e.touches[0]);
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
      if (this.draggingNode >= 0) {
        e.preventDefault();
        this._onPointerMove(e.touches[0]);
      }
    }, { passive: false });

    window.addEventListener('touchend', () => this._onPointerUp());
  },

  _onPointerDown(e) {
    if (this.cooldownActive || this.completed) return;

    AudioManager.init();

    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const px = (e.clientX - rect.left) * scaleX;
    const py = (e.clientY - rect.top) * scaleY;

    for (let i = 0; i < 3; i++) {
      if (!this.nodes[i].active) continue;
      const center = this.layout.dialCenters[i];
      const r = this.layout.dialRadius;
      const dx = px - center.x;
      const dy = py - center.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < r * 1.3) {
        this.draggingNode = i;
        this.dragStartAngle = Math.atan2(dy, dx);
        this.dragStartNodeAngle = this.nodes[i].angle;
        AudioManager.play('tick');
        return;
      }
    }
  },

  _onPointerMove(e) {
    if (this.draggingNode < 0) return;

    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const px = (e.clientX - rect.left) * scaleX;
    const py = (e.clientY - rect.top) * scaleY;

    const center = this.layout.dialCenters[this.draggingNode];
    const dx = px - center.x;
    const dy = py - center.y;
    const angle = Math.atan2(dy, dx);

    let delta = angle - this.dragStartAngle;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;

    const sensitivity = 1 / (Math.PI * 1.5);
    const newAngle = this.dragStartNodeAngle + delta * sensitivity;

    this.nodes[this.draggingNode].angle = Math.max(0, Math.min(1, newAngle));

    const now = Date.now();
    if (now - this._lastDragSound > 60) {
      AudioManager.play('slider');
      this._lastDragSound = now;
    }
  },

  _onPointerUp() {
    this.draggingNode = -1;
  },

  /* =========================================
     COMPLETION
     ========================================= */

  _onTaskComplete() {
    this.completed = true;
    this.running = false;
    this._stopHum();

    if (this.animFrame) cancelAnimationFrame(this.animFrame);

    TaskShell.showCompletion('generator-power');
  },

  /* =========================================
     UTILITIES
     ========================================= */

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  },

  _randomRange(min, max) {
    return min + Math.random() * (max - min);
  },

  destroy() {
    this.running = false;
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    this._stopHum();
  }
};

document.addEventListener('DOMContentLoaded', () => {
  GeneratorTask.init();
});
