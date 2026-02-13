/* =============================================
   PORTALS GAME — Reconnect Faulty Wiring Task
   Storage Bay — Junction Box Puzzle
   5 cables, colour-to-symbol matching, live wire,
   tangled bezier wires, 60s timer
   ============================================= */

const WiringTask = {
  // --- Config ---
  canvas: null,
  ctx: null,
  running: false,
  animFrame: null,
  lastTimestamp: 0,
  dpr: 1,

  // Timer
  timeRemaining: 30,
  timerWarning: false,
  timerCritical: false,

  // Cables
  CABLE_COUNT: 5,
  cableColors: [
    { name: 'Red',    hex: '#FF4455', dark: '#AA2233' },
    { name: 'Blue',   hex: '#4488FF', dark: '#2255AA' },
    { name: 'Green',  hex: '#44DD77', dark: '#228844' },
    { name: 'Orange', hex: '#FF9944', dark: '#BB6622' },
    { name: 'Purple', hex: '#BB66FF', dark: '#7733AA' }
  ],

  // Symbols (drawn on canvas — no emoji)
  symbols: [
    { name: 'Bolt',  draw: '_drawBolt' },
    { name: 'Gear',  draw: '_drawGear' },
    { name: 'Drop',  draw: '_drawDrop' },
    { name: 'Flame', draw: '_drawFlame' },
    { name: 'Wave',  draw: '_drawWave' }
  ],

  // State
  legendMapping: [],     // cableIdx → symbolIdx
  socketMapping: [],     // socketIdx → which symbolIdx is at that socket position
  cables: [],            // cable objects { leftY, rightY, cp1, cp2, connected, locked, errorCount }
  sockets: [],           // socket positions
  selectedCable: -1,     // currently selected cable index
  connectedCount: 0,

  // Live wire
  liveWireIdx: -1,
  liveWireTimer: 0,
  liveWireInterval: 4,   // seconds between rotations
  liveWireTransition: 0, // 0-0.5s transition period

  // Stun
  stunTimer: 0,
  stunDuration: 1.5,
  stunFlash: 0,

  // Cooldown
  cooldownActive: false,
  cooldownTimer: 0,
  cooldownDuration: 10,

  // Wire sway animation
  swayTime: 0,

  // Spark particles
  sparks: [],

  // Colors (from CSS vars)
  colors: {
    primary: '#FECE54',
    secondary1: '#B1AEA4',
    secondary2: '#528F83',
    bg: '#0E1519',
    frameBg: '#111820',
    steel: '#1A2228',
    steelLight: '#253035',
    steelBorder: '#2E3A40',
    rivet: '#3A4850'
  },

  // Layout cache
  layout: {
    leftX: 0,
    rightX: 0,
    cableStartYs: [],
    socketYs: [],
    cableRadius: 0,
    socketRadius: 0,
    wireZone: { left: 0, right: 0 }
  },

  /**
   * Initialize the task
   */
  init() {
    // Read CSS vars
    const style = getComputedStyle(document.documentElement);
    this.colors.primary = style.getPropertyValue('--area-primary').trim() || this.colors.primary;
    this.colors.secondary1 = style.getPropertyValue('--area-secondary1').trim() || this.colors.secondary1;

    // Canvas
    this.canvas = document.getElementById('wiring-canvas');
    this.ctx = this.canvas.getContext('2d');
    this._resizeCanvas();

    // Generate puzzle
    this._generatePuzzle();

    // Legend toggle
    const legendBtn = document.getElementById('legend-btn');
    legendBtn.addEventListener('click', () => {
      AudioManager.init();
      AudioManager.play('tick');
      const panel = document.getElementById('legend-panel');
      panel.classList.toggle('visible');
      legendBtn.classList.toggle('active');
    });

    // Canvas click
    this.canvas.addEventListener('click', (e) => {
      AudioManager.init();
      this._handleClick(e);
    });

    // Touch support
    this.canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      AudioManager.init();
      const touch = e.changedTouches[0];
      this._handleClick(touch);
    });

    // Start
    this.running = true;
    this.lastTimestamp = 0;
    this._animate(0);
  },

  /**
   * Generate the puzzle — randomise legend mapping, wire tangle, socket layout
   */
  _generatePuzzle() {
    // Reset state
    this.connectedCount = 0;
    this.selectedCable = -1;
    this.timeRemaining = 30;
    this.timerWarning = false;
    this.timerCritical = false;
    this.stunTimer = 0;
    this.sparks = [];
    this.swayTime = 0;

    // Randomise legend: cable colour i → symbol legendMapping[i]
    this.legendMapping = this._shuffle([0, 1, 2, 3, 4]);

    // Randomise socket positions (which symbol appears at which Y slot)
    this.socketMapping = this._shuffle([0, 1, 2, 3, 4]);

    // Compute layout
    this._computeLayout();

    // Generate cables with tangled bezier curves
    this._generateTangle();

    // Assign first live wire
    this._pickLiveWire();
    this.liveWireTimer = this.liveWireInterval;

    // Build legend HTML
    this._buildLegendHTML();

    // Update progress display
    this._updateProgressDisplay();
    this._updateTimerDisplay();
  },

  /**
   * Compute pixel layout based on canvas size
   */
  _computeLayout() {
    const w = this.canvas.width / this.dpr;
    const h = this.canvas.height / this.dpr;

    const padding = w * 0.06;
    const endpointZoneW = w * 0.10;

    this.layout.leftX = padding + endpointZoneW * 0.5;
    this.layout.rightX = w - padding - endpointZoneW * 0.5;
    this.layout.wireZone = {
      left: padding + endpointZoneW,
      right: w - padding - endpointZoneW
    };

    const topMargin = h * 0.12;
    const bottomMargin = h * 0.10;
    const usableH = h - topMargin - bottomMargin;
    const spacing = usableH / (this.CABLE_COUNT - 1);

    this.layout.cableRadius = Math.min(w * 0.025, 16);
    this.layout.socketRadius = Math.min(w * 0.028, 18);

    // Cable Y positions (left side) — evenly spaced
    this.layout.cableStartYs = [];
    for (let i = 0; i < this.CABLE_COUNT; i++) {
      this.layout.cableStartYs.push(topMargin + i * spacing);
    }

    // Socket Y positions (right side) — evenly spaced but can be shuffled
    this.layout.socketYs = [];
    for (let i = 0; i < this.CABLE_COUNT; i++) {
      this.layout.socketYs.push(topMargin + i * spacing);
    }
  },

  /**
   * Generate tangled bezier curves for each cable
   * Uses 3 control points per cable for extra twistiness
   */
  _generateTangle() {
    this.cables = [];
    const wz = this.layout.wireZone;
    const wzWidth = wz.right - wz.left;
    const h = this.canvas.height / this.dpr;

    // Each cable goes from its left Y to the socket that has its target symbol
    for (let i = 0; i < this.CABLE_COUNT; i++) {
      const targetSymbol = this.legendMapping[i];
      const socketSlot = this.socketMapping.indexOf(targetSymbol);

      const leftY = this.layout.cableStartYs[i];
      const rightY = this.layout.socketYs[socketSlot];

      // 3 control points for much more tangling
      const cp1x = wz.left + wzWidth * (0.15 + Math.random() * 0.12);
      const cp2x = wz.left + wzWidth * (0.42 + Math.random() * 0.16);
      const cp3x = wz.left + wzWidth * (0.70 + Math.random() * 0.15);

      // Aggressive Y randomisation — wires zig-zag across the full height
      const yRange = h * 0.85;
      const midY = h * 0.5;
      const cp1y = midY + (Math.random() - 0.5) * yRange;
      let cp2y = midY + (Math.random() - 0.5) * yRange;
      const cp3y = midY + (Math.random() - 0.5) * yRange;

      // Force cp2 to the opposite side of midY from cp1 to create S-curves
      if ((cp1y - midY) * (cp2y - midY) > 0) {
        cp2y = midY - (cp2y - midY);
      }

      this.cables.push({
        leftY,
        rightY,
        targetSocket: socketSlot,
        cp1: { x: cp1x, y: cp1y },
        cp2: { x: cp2x, y: cp2y },
        cp3: { x: cp3x, y: cp3y },
        connected: false,
        locked: false,
        errorCount: 0,
        lockProgress: 0
      });
    }

    // Enforce minimum crossings
    this._enforceCrossings();
  },

  /**
   * Make sure wires are visually tangled — at least 10 crossings
   */
  _enforceCrossings() {
    let attempts = 0;
    while (attempts < 40) {
      const crossings = this._countCrossings();
      if (crossings >= 10) break;

      // Swap control points between random cables to increase tangling
      const a = Math.floor(Math.random() * this.CABLE_COUNT);
      const b = Math.floor(Math.random() * this.CABLE_COUNT);
      if (a !== b) {
        // Alternate between swapping cp1, cp2, cp3
        const cpKey = ['cp1', 'cp2', 'cp3'][attempts % 3];
        const tmpY = this.cables[a][cpKey].y;
        this.cables[a][cpKey].y = this.cables[b][cpKey].y;
        this.cables[b][cpKey].y = tmpY;
      }
      attempts++;
    }
  },

  /**
   * Count approximate wire crossings by sampling bezier paths
   */
  _countCrossings() {
    const samples = 20;
    const paths = [];

    for (let c = 0; c < this.CABLE_COUNT; c++) {
      const cable = this.cables[c];
      const points = [];
      for (let s = 0; s <= samples; s++) {
        const t = s / samples;
        points.push(this._sampleBezier(c, t));
      }
      paths.push(points);
    }

    let crossings = 0;
    for (let i = 0; i < paths.length; i++) {
      for (let j = i + 1; j < paths.length; j++) {
        for (let s = 0; s < samples; s++) {
          const a1 = paths[i][s], a2 = paths[i][s + 1];
          const b1 = paths[j][s], b2 = paths[j][s + 1];
          if (this._segmentsIntersect(a1, a2, b1, b2)) {
            crossings++;
          }
        }
      }
    }
    return crossings;
  },

  /**
   * Test if two line segments intersect
   */
  _segmentsIntersect(a1, a2, b1, b2) {
    const d1 = (b2.x - b1.x) * (a1.y - b1.y) - (b2.y - b1.y) * (a1.x - b1.x);
    const d2 = (b2.x - b1.x) * (a2.y - b1.y) - (b2.y - b1.y) * (a2.x - b1.x);
    const d3 = (a2.x - a1.x) * (b1.y - a1.y) - (a2.y - a1.y) * (b1.x - a1.x);
    const d4 = (a2.x - a1.x) * (b2.y - a1.y) - (a2.y - a1.y) * (b2.x - a1.x);
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
        ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
      return true;
    }
    return false;
  },

  /**
   * Sample a point on cable's path at parameter t (0-1)
   * Path is two cubic beziers joined at cp2 (midpoint)
   */
  _sampleBezier(cableIdx, t) {
    const cable = this.cables[cableIdx];
    const lx = this.layout.leftX;
    const rx = this.layout.rightX;

    // Split into two halves at cp2 as the join point
    if (t <= 0.5) {
      // First half: start → cp1 → cp2(as cp) → midpoint(cp2)
      const lt = t * 2; // remap 0-0.5 → 0-1
      const mt = 1 - lt;
      return {
        x: mt*mt*mt * lx + 3*mt*mt*lt * cable.cp1.x + 3*mt*lt*lt * cable.cp2.x + lt*lt*lt * cable.cp2.x,
        y: mt*mt*mt * cable.leftY + 3*mt*mt*lt * cable.cp1.y + 3*mt*lt*lt * ((cable.cp1.y + cable.cp2.y) * 0.5) + lt*lt*lt * cable.cp2.y
      };
    } else {
      // Second half: midpoint(cp2) → cp3(as cp) → end
      const lt = (t - 0.5) * 2; // remap 0.5-1 → 0-1
      const mt = 1 - lt;
      return {
        x: mt*mt*mt * cable.cp2.x + 3*mt*mt*lt * cable.cp3.x + 3*mt*lt*lt * cable.cp3.x + lt*lt*lt * rx,
        y: mt*mt*mt * cable.cp2.y + 3*mt*mt*lt * ((cable.cp2.y + cable.cp3.y) * 0.5) + 3*mt*lt*lt * cable.cp3.y + lt*lt*lt * cable.rightY
      };
    }
  },

  /**
   * Pick a random non-locked cable as the live wire
   */
  _pickLiveWire() {
    const available = [];
    for (let i = 0; i < this.CABLE_COUNT; i++) {
      if (!this.cables[i].locked) available.push(i);
    }
    if (available.length <= 1) {
      this.liveWireIdx = -1; // No live wire if only 1 or 0 left
      return;
    }
    // Pick one that's different from current
    let newIdx;
    do {
      newIdx = available[Math.floor(Math.random() * available.length)];
    } while (newIdx === this.liveWireIdx && available.length > 1);
    this.liveWireIdx = newIdx;
  },

  /**
   * Build the legend HTML panel
   */
  _buildLegendHTML() {
    const container = document.getElementById('legend-rows');
    container.innerHTML = '';

    for (let i = 0; i < this.CABLE_COUNT; i++) {
      const symbolIdx = this.legendMapping[i];
      const color = this.cableColors[i];
      const symbol = this.symbols[symbolIdx];

      const row = document.createElement('div');
      row.className = 'legend-row';
      row.innerHTML = `
        <div class="legend-row__color" style="background: ${color.hex};"></div>
        <span class="legend-row__arrow">→</span>
        <canvas class="legend-row__symbol-canvas" width="28" height="28"></canvas>
        <span class="legend-row__name">${symbol.name}</span>
      `;
      container.appendChild(row);

      // Draw symbol on small canvas
      const smallCanvas = row.querySelector('.legend-row__symbol-canvas');
      const sctx = smallCanvas.getContext('2d');
      this._drawSymbol(sctx, symbolIdx, 14, 14, 10, '#FECE54');
    }
  },

  /* =========================================
     ANIMATION LOOP
     ========================================= */

  _animate(timestamp) {
    if (!this.running) return;

    const dt = this.lastTimestamp ? (timestamp - this.lastTimestamp) / 1000 : 0.016;
    this.lastTimestamp = timestamp;

    // Cap dt to avoid jumps
    const cdt = Math.min(dt, 0.1);

    this._update(cdt);
    this._draw();

    this.animFrame = requestAnimationFrame((t) => this._animate(t));
  },

  /* =========================================
     UPDATE
     ========================================= */

  _update(dt) {
    // Sway
    this.swayTime += dt;

    // Stun countdown
    if (this.stunTimer > 0) {
      this.stunTimer -= dt;
      this.stunFlash -= dt;
    }

    // Cooldown
    if (this.cooldownActive) {
      this.cooldownTimer -= dt;
      if (this.cooldownTimer <= 0) {
        this._endCooldown();
      }
      document.getElementById('cooldown-timer').textContent = Math.ceil(this.cooldownTimer);
      this._updateSparks(dt);
      return; // Don't update timer or live wire during cooldown
    }

    // Timer countdown
    if (this.timeRemaining > 0 && this.connectedCount < this.CABLE_COUNT) {
      this.timeRemaining -= dt;
      if (this.timeRemaining <= 0) {
        this.timeRemaining = 0;
        this._triggerTimeout();
      }
    }

    // Timer state
    this.timerWarning = this.timeRemaining <= 10 && this.timeRemaining > 4;
    this.timerCritical = this.timeRemaining <= 4;
    this._updateTimerDisplay();

    // Live wire rotation
    if (this.liveWireIdx >= 0) {
      this.liveWireTimer -= dt;
      if (this.liveWireTimer <= 0) {
        this._pickLiveWire();
        this.liveWireTimer = this.liveWireInterval;
      }
    }

    // Lock-in animation progress
    for (let i = 0; i < this.CABLE_COUNT; i++) {
      if (this.cables[i].locked && this.cables[i].lockProgress < 1) {
        this.cables[i].lockProgress = Math.min(1, this.cables[i].lockProgress + dt * 2);
      }
    }

    // Update sparks
    this._updateSparks(dt);

    // Spawn sparks on live wire
    if (this.liveWireIdx >= 0 && Math.random() < 0.3) {
      this._spawnLiveWireSpark();
    }
  },

  /* =========================================
     DRAW
     ========================================= */

  _draw() {
    const ctx = this.ctx;
    const w = this.canvas.width / this.dpr;
    const h = this.canvas.height / this.dpr;

    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    // Background — junction box panel
    this._drawBackground(w, h);

    // Draw wires (behind endpoints)
    this._drawWires(w, h);

    // Draw cable endpoints (left)
    this._drawCableEndpoints(w, h);

    // Draw socket terminals (right)
    this._drawSocketTerminals(w, h);

    // Draw sparks
    this._drawSparks();

    // Draw stun flash
    if (this.stunTimer > 0 && this.stunFlash > 0) {
      ctx.fillStyle = `rgba(255, 255, 255, ${this.stunFlash * 0.6})`;
      ctx.fillRect(0, 0, w, h);
    }

    ctx.restore();
  },

  /**
   * Draw industrial junction box background
   */
  _drawBackground(w, h) {
    const ctx = this.ctx;

    // Dark steel panel
    ctx.fillStyle = this.colors.steel;
    ctx.fillRect(0, 0, w, h);

    // Subtle inner gradient
    const grad = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, w * 0.6);
    grad.addColorStop(0, 'rgba(254, 206, 84, 0.03)');
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Hazard stripes at top and bottom
    this._drawHazardStripes(ctx, 0, 0, w, h * 0.035);
    this._drawHazardStripes(ctx, 0, h - h * 0.035, w, h * 0.035);

    // Junction box label
    ctx.font = `${Math.max(10, w * 0.014)}px 'Bungee', sans-serif`;
    ctx.fillStyle = 'rgba(254, 206, 84, 0.25)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('⚡ JUNCTION BOX J-7', w * 0.06, h * 0.055);

    // Rivets in corners
    const rivetR = Math.max(3, w * 0.006);
    const rp = w * 0.03;
    const positions = [[rp, h * 0.05], [w - rp, h * 0.05], [rp, h - h * 0.05], [w - rp, h - h * 0.05]];
    positions.forEach(([rx, ry]) => {
      ctx.beginPath();
      ctx.arc(rx, ry, rivetR, 0, Math.PI * 2);
      ctx.fillStyle = this.colors.rivet;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(rx - rivetR * 0.2, ry - rivetR * 0.3, rivetR * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fill();
    });

    // Column labels
    ctx.font = `${Math.max(9, w * 0.012)}px 'PP Supply Mono', sans-serif`;
    ctx.fillStyle = 'rgba(199, 224, 234, 0.3)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('CABLES', this.layout.leftX, h * 0.055);
    ctx.fillText('TERMINALS', this.layout.rightX, h * 0.055);
  },

  /**
   * Draw yellow/black hazard stripes
   */
  _drawHazardStripes(ctx, x, y, w, h) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();

    const stripeW = h * 2;
    ctx.fillStyle = '#FECE54';
    ctx.globalAlpha = 0.15;
    ctx.fillRect(x, y, w, h);

    ctx.fillStyle = this.colors.steel;
    ctx.globalAlpha = 0.6;
    for (let sx = -stripeW; sx < w + stripeW; sx += stripeW) {
      ctx.beginPath();
      ctx.moveTo(x + sx, y);
      ctx.lineTo(x + sx + stripeW * 0.5, y);
      ctx.lineTo(x + sx + stripeW * 0.5 - h, y + h);
      ctx.lineTo(x + sx - h, y + h);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  },

  /**
   * Helper: build the canvas path for a cable using its 3 control points
   * Two joined cubic beziers through cp1 → cp2 → cp3
   */
  _traceCablePath(ctx, lx, ly, cp1x, cp1y, cp2x, cp2y, cp3x, cp3y, rx, ry) {
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    // First half: start → cp1 → midpoint(cp1↔cp2) → cp2
    const mid1x = (cp1x + cp2x) * 0.5;
    const mid1y = (cp1y + cp2y) * 0.5;
    ctx.bezierCurveTo(cp1x, cp1y, mid1x, mid1y, cp2x, cp2y);
    // Second half: cp2 → midpoint(cp2↔cp3) → cp3 → end
    const mid2x = (cp2x + cp3x) * 0.5;
    const mid2y = (cp2y + cp3y) * 0.5;
    ctx.bezierCurveTo(mid2x, mid2y, cp3x, cp3y, rx, ry);
  },

  /**
   * Draw all wires
   * Unlocked wires are grey; locked wires reveal their colour
   */
  _drawWires(w, h) {
    const ctx = this.ctx;
    const lx = this.layout.leftX;
    const rx = this.layout.rightX;

    // Grey colour for unlocked wires
    const greyHex = '#5A6068';
    const greyRgb = '90, 96, 104';

    // Determine draw order — selected wire on top, live wire second
    const order = [];
    for (let i = 0; i < this.CABLE_COUNT; i++) order.push(i);

    // Move selected to end (drawn last = on top)
    if (this.selectedCable >= 0) {
      const idx = order.indexOf(this.selectedCable);
      if (idx >= 0) { order.splice(idx, 1); order.push(this.selectedCable); }
    }

    for (const i of order) {
      const cable = this.cables[i];
      const color = this.cableColors[i];
      const isSelected = i === this.selectedCable;
      const isLive = i === this.liveWireIdx && !cable.locked;
      const isDimmed = this.selectedCable >= 0 && !isSelected && !cable.locked;

      // Decide wire colour — grey unless locked (then real colour)
      const wireColor = cable.locked ? color.hex : greyHex;
      const wireRgb = cable.locked ? this._hexToRgb(color.hex) : greyRgb;

      // Sway offset
      const swayAmp = cable.locked ? 0 : 2;
      const swayOffset = Math.sin(this.swayTime * 1.2 + i * 1.7) * swayAmp;
      const swayOffset2 = Math.sin(this.swayTime * 0.9 + i * 2.3) * swayAmp * 0.6;

      // Interpolate control points for lock-in animation (straighten)
      let cp1x, cp1y, cp2x, cp2y, cp3x, cp3y;
      if (cable.locked && cable.lockProgress > 0) {
        const p = cable.lockProgress;
        const easeP = 1 - Math.pow(1 - p, 3); // ease-out cubic
        const s1x = lx + (rx - lx) * 0.25;
        const s1y = cable.leftY + (cable.rightY - cable.leftY) * 0.25;
        const s2x = lx + (rx - lx) * 0.50;
        const s2y = cable.leftY + (cable.rightY - cable.leftY) * 0.50;
        const s3x = lx + (rx - lx) * 0.75;
        const s3y = cable.leftY + (cable.rightY - cable.leftY) * 0.75;
        cp1x = cable.cp1.x + (s1x - cable.cp1.x) * easeP;
        cp1y = cable.cp1.y + (s1y - cable.cp1.y) * easeP;
        cp2x = cable.cp2.x + (s2x - cable.cp2.x) * easeP;
        cp2y = cable.cp2.y + (s2y - cable.cp2.y) * easeP;
        cp3x = cable.cp3.x + (s3x - cable.cp3.x) * easeP;
        cp3y = cable.cp3.y + (s3y - cable.cp3.y) * easeP;
      } else {
        cp1x = cable.cp1.x;
        cp1y = cable.cp1.y + swayOffset;
        cp2x = cable.cp2.x;
        cp2y = cable.cp2.y - swayOffset * 0.7;
        cp3x = cable.cp3.x;
        cp3y = cable.cp3.y + swayOffset2;
      }

      // Wire glow (for selected or live)
      if (isSelected || isLive) {
        this._traceCablePath(ctx, lx, cable.leftY, cp1x, cp1y, cp2x, cp2y, cp3x, cp3y, rx, cable.rightY);
        ctx.strokeStyle = isLive ?
          `rgba(255, 68, 68, ${0.15 + Math.sin(this.swayTime * 8) * 0.1})` :
          `rgba(${wireRgb}, 0.35)`;
        ctx.lineWidth = 12;
        ctx.lineCap = 'round';
        ctx.stroke();
      }

      // Wire body
      this._traceCablePath(ctx, lx, cable.leftY, cp1x, cp1y, cp2x, cp2y, cp3x, cp3y, rx, cable.rightY);

      let alpha = isDimmed ? 0.15 : (cable.locked ? 0.9 : 0.55);
      ctx.strokeStyle = `rgba(${wireRgb}, ${alpha})`;
      ctx.lineWidth = cable.locked ? 5 : 3.5;
      ctx.lineCap = 'round';
      ctx.stroke();

      // Wire highlight (subtle lighter stripe)
      if (!isDimmed) {
        this._traceCablePath(ctx, lx, cable.leftY - 1, cp1x, cp1y - 1, cp2x, cp2y - 1, cp3x, cp3y - 1, rx, cable.rightY - 1);
        ctx.strokeStyle = `rgba(255, 255, 255, ${cable.locked ? 0.12 : 0.04})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Locked cable — travelling light pulse
      if (cable.locked) {
        const pulseT = (this.swayTime * 0.8 + i * 0.3) % 1;
        const pt = this._sampleBezier(i, pulseT);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${this._hexToRgb(color.hex)}, 0.9)`;
        ctx.shadowColor = color.hex;
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
  },

  /**
   * Draw cable endpoints on the left
   * Grey by default — colour shows only when selected or locked
   */
  _drawCableEndpoints(w, h) {
    const ctx = this.ctx;
    const r = this.layout.cableRadius;

    // Grey defaults for unlocked/unselected
    const greyLight = '#5A6068';
    const greyDark = '#3A4048';

    for (let i = 0; i < this.CABLE_COUNT; i++) {
      const cable = this.cables[i];
      const color = this.cableColors[i];
      const x = this.layout.leftX;
      const y = this.layout.cableStartYs[i];
      const isSelected = i === this.selectedCable;
      const isLive = i === this.liveWireIdx && !cable.locked;

      // Determine displayed colour: real colour if selected or locked, grey otherwise
      const showColor = cable.locked || isSelected;
      const dispHex = showColor ? color.hex : greyLight;
      const dispDark = showColor ? color.dark : greyDark;

      // Metallic bezel
      ctx.beginPath();
      ctx.arc(x, y, r + 3, 0, Math.PI * 2);
      ctx.fillStyle = isLive ? `rgba(255, 68, 68, ${0.3 + Math.sin(this.swayTime * 6) * 0.2})` :
        (isSelected ? `rgba(${this._hexToRgb(this.colors.primary)}, 0.4)` : this.colors.steelLight);
      ctx.fill();
      ctx.strokeStyle = isLive ? '#FF4444' : (isSelected ? this.colors.primary : this.colors.steelBorder);
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Inner connector
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      const grad = ctx.createRadialGradient(x - r * 0.2, y - r * 0.3, 0, x, y, r);
      grad.addColorStop(0, dispHex);
      grad.addColorStop(1, dispDark);
      ctx.fillStyle = grad;
      ctx.fill();

      // Highlight
      ctx.beginPath();
      ctx.arc(x - r * 0.2, y - r * 0.3, r * 0.35, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.fill();

      // Locked check
      if (cable.locked) {
        ctx.font = `bold ${r}px sans-serif`;
        ctx.fillStyle = '#0E1519';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('✓', x, y + 1);
      }
    }
  },

  /**
   * Draw socket terminals on the right
   */
  _drawSocketTerminals(w, h) {
    const ctx = this.ctx;
    const r = this.layout.socketRadius;

    for (let i = 0; i < this.CABLE_COUNT; i++) {
      const symbolIdx = this.socketMapping[i];
      const x = this.layout.rightX;
      const y = this.layout.socketYs[i];

      // Find if this socket is connected (locked)
      const connectedCable = this.cables.find(c => c.locked && c.targetSocket === i);
      const isConnected = !!connectedCable;
      const connectedColor = isConnected ? this.cableColors[this.cables.indexOf(connectedCable)].hex : null;

      // Socket frame — hexagonal-ish
      ctx.beginPath();
      ctx.arc(x, y, r + 3, 0, Math.PI * 2);
      ctx.fillStyle = isConnected ? `rgba(${this._hexToRgb(connectedColor)}, 0.2)` : this.colors.steelLight;
      ctx.fill();
      ctx.strokeStyle = isConnected ? connectedColor : this.colors.steelBorder;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Socket inner
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = isConnected ? `rgba(${this._hexToRgb(connectedColor)}, 0.15)` : 'rgba(20, 30, 35, 0.9)';
      ctx.fill();

      // Draw symbol
      const symbolColor = isConnected ? connectedColor : 'rgba(199, 224, 234, 0.6)';
      this._drawSymbol(ctx, symbolIdx, x, y, r * 0.6, symbolColor);
    }
  },

  /* =========================================
     SYMBOL DRAWING
     ========================================= */

  _drawSymbol(ctx, idx, cx, cy, size, color) {
    switch (idx) {
      case 0: this._drawBolt(ctx, cx, cy, size, color); break;
      case 1: this._drawGear(ctx, cx, cy, size, color); break;
      case 2: this._drawDrop(ctx, cx, cy, size, color); break;
      case 3: this._drawFlame(ctx, cx, cy, size, color); break;
      case 4: this._drawWaveSymbol(ctx, cx, cy, size, color); break;
    }
  },

  _drawBolt(ctx, cx, cy, s, color) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath();
    ctx.moveTo(-s * 0.15, -s);
    ctx.lineTo(-s * 0.6, s * 0.1);
    ctx.lineTo(-s * 0.05, s * 0.1);
    ctx.lineTo(s * 0.15, s);
    ctx.lineTo(s * 0.6, -s * 0.1);
    ctx.lineTo(s * 0.05, -s * 0.1);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  },

  _drawGear(ctx, cx, cy, s, color) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = color;
    ctx.lineWidth = s * 0.2;
    ctx.lineCap = 'round';

    // Outer teeth
    const teeth = 6;
    for (let i = 0; i < teeth; i++) {
      const angle = (i / teeth) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * s * 0.45, Math.sin(angle) * s * 0.45);
      ctx.lineTo(Math.cos(angle) * s * 0.85, Math.sin(angle) * s * 0.85);
      ctx.stroke();
    }

    // Center circle
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.35, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = s * 0.15;
    ctx.stroke();

    // Inner dot
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.1, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  },

  _drawDrop(ctx, cx, cy, s, color) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.bezierCurveTo(-s * 0.8, s * 0.2, -s * 0.5, s * 1, 0, s);
    ctx.bezierCurveTo(s * 0.5, s * 1, s * 0.8, s * 0.2, 0, -s);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  },

  _drawFlame(ctx, cx, cy, s, color) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath();
    ctx.moveTo(0, -s * 1.1);
    ctx.bezierCurveTo(-s * 0.4, -s * 0.5, -s * 0.7, s * 0.3, -s * 0.3, s);
    ctx.bezierCurveTo(-s * 0.1, s * 0.6, 0, s * 0.8, 0, s * 0.5);
    ctx.bezierCurveTo(0, s * 0.8, s * 0.1, s * 0.6, s * 0.3, s);
    ctx.bezierCurveTo(s * 0.7, s * 0.3, s * 0.4, -s * 0.5, 0, -s * 1.1);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  },

  _drawWaveSymbol(ctx, cx, cy, s, color) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = color;
    ctx.lineWidth = s * 0.2;
    ctx.lineCap = 'round';

    for (let row = -1; row <= 1; row++) {
      ctx.beginPath();
      const y = row * s * 0.55;
      ctx.moveTo(-s, y);
      ctx.bezierCurveTo(-s * 0.5, y - s * 0.4, s * 0.5, y + s * 0.4, s, y);
      ctx.stroke();
    }
    ctx.restore();
  },

  /* =========================================
     SPARKS
     ========================================= */

  _spawnLiveWireSpark() {
    if (this.liveWireIdx < 0) return;
    const t = Math.random();
    const pt = this._sampleBezier(this.liveWireIdx, t);

    for (let i = 0; i < 2; i++) {
      this.sparks.push({
        x: pt.x,
        y: pt.y,
        vx: (Math.random() - 0.5) * 80,
        vy: (Math.random() - 0.5) * 80,
        life: 0.3 + Math.random() * 0.3,
        maxLife: 0.3 + Math.random() * 0.3,
        size: 1 + Math.random() * 2,
        color: Math.random() > 0.5 ? '#FF4444' : '#FF8866'
      });
    }
  },

  _updateSparks(dt) {
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 120 * dt; // gravity
      s.life -= dt;
      if (s.life <= 0) this.sparks.splice(i, 1);
    }
  },

  _drawSparks() {
    const ctx = this.ctx;
    for (const s of this.sparks) {
      const alpha = Math.max(0, s.life / s.maxLife);
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size * alpha, 0, Math.PI * 2);
      ctx.fillStyle = s.color;
      ctx.globalAlpha = alpha;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  },

  /* =========================================
     CLICK HANDLING
     ========================================= */

  _handleClick(e) {
    if (this.cooldownActive) return;
    if (this.stunTimer > 0) return;
    if (this.connectedCount >= this.CABLE_COUNT) return;

    const rect = this.canvas.getBoundingClientRect();
    const scaleX = (this.canvas.width / this.dpr) / rect.width;
    const scaleY = (this.canvas.height / this.dpr) / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;

    // Hit test cable endpoints (left side)
    const hitCable = this._hitTestCables(mx, my);

    // Hit test socket terminals (right side)
    const hitSocket = this._hitTestSockets(mx, my);

    if (hitCable >= 0) {
      // Clicked a cable
      if (this.cables[hitCable].locked) return; // Already connected

      // Check if live wire
      if (hitCable === this.liveWireIdx) {
        this._triggerShock();
        return;
      }

      if (this.selectedCable === hitCable) {
        // Deselect
        this.selectedCable = -1;
      } else {
        // Select (or switch)
        this.selectedCable = hitCable;
        AudioManager.play('tick');
      }
    } else if (hitSocket >= 0 && this.selectedCable >= 0) {
      // Clicked a socket with a cable selected
      this._checkConnection(this.selectedCable, hitSocket);
    } else {
      // Clicked empty space — deselect
      this.selectedCable = -1;
    }
  },

  _hitTestCables(mx, my) {
    const r = this.layout.cableRadius + 8; // generous hit area
    for (let i = 0; i < this.CABLE_COUNT; i++) {
      const cx = this.layout.leftX;
      const cy = this.layout.cableStartYs[i];
      const dx = mx - cx;
      const dy = my - cy;
      if (dx * dx + dy * dy <= r * r) return i;
    }
    return -1;
  },

  _hitTestSockets(mx, my) {
    const r = this.layout.socketRadius + 8;
    for (let i = 0; i < this.CABLE_COUNT; i++) {
      const cx = this.layout.rightX;
      const cy = this.layout.socketYs[i];
      const dx = mx - cx;
      const dy = my - cy;
      if (dx * dx + dy * dy <= r * r) return i;
    }
    return -1;
  },

  /**
   * Check if the selected cable connects to the right socket
   */
  _checkConnection(cableIdx, socketSlot) {
    const cable = this.cables[cableIdx];
    const targetSocket = cable.targetSocket;

    if (socketSlot === targetSocket) {
      // Correct!
      this._lockInCable(cableIdx);
    } else {
      // Wrong — error + time penalty
      cable.errorCount++;
      const penalty = cable.errorCount === 1 ? 2 : (cable.errorCount === 2 ? 3 : 5);
      this.timeRemaining = Math.max(0, this.timeRemaining - penalty);
      AudioManager.play('miss');
      this.selectedCable = -1;

      // Check if time ran out from penalty
      if (this.timeRemaining <= 0) {
        this._triggerTimeout();
      }
    }
  },

  /**
   * Lock in a correctly connected cable
   */
  _lockInCable(cableIdx) {
    const cable = this.cables[cableIdx];
    cable.connected = true;
    cable.locked = true;
    cable.lockProgress = 0;
    this.connectedCount++;
    this.selectedCable = -1;

    // Remove from live wire rotation if it was live
    if (this.liveWireIdx === cableIdx) {
      this._pickLiveWire();
      this.liveWireTimer = this.liveWireInterval;
    }

    // Audio
    this._playLockSound();

    // Update progress
    this._updateProgressDisplay();

    // Check completion
    if (this.connectedCount >= this.CABLE_COUNT) {
      this._onComplete();
    }
  },

  /**
   * Trigger electric shock
   */
  _triggerShock() {
    this.stunTimer = this.stunDuration;
    this.stunFlash = 0.3;
    this.timeRemaining = Math.max(0, this.timeRemaining - 3);
    this.selectedCable = -1;
    AudioManager.play('miss');
    this._playArcSound();

    // Spawn shock sparks
    const cx = this.layout.leftX;
    const cy = this.layout.cableStartYs[this.liveWireIdx];
    for (let i = 0; i < 15; i++) {
      this.sparks.push({
        x: cx, y: cy,
        vx: (Math.random() - 0.5) * 200,
        vy: (Math.random() - 0.5) * 200,
        life: 0.3 + Math.random() * 0.4,
        maxLife: 0.5,
        size: 1.5 + Math.random() * 2,
        color: Math.random() > 0.3 ? '#FFDD44' : '#FFFFFF'
      });
    }

    if (this.timeRemaining <= 0) {
      this._triggerTimeout();
    }
  },

  /**
   * Timer ran out — cooldown and re-randomise
   */
  _triggerTimeout() {
    this.cooldownActive = true;
    this.cooldownTimer = this.cooldownDuration;
    this.selectedCable = -1;
    AudioManager.play('miss');

    document.getElementById('cooldown-overlay').classList.add('active');
    document.getElementById('cooldown-timer').textContent = Math.ceil(this.cooldownDuration);
  },

  /**
   * End cooldown and re-randomise
   */
  _endCooldown() {
    this.cooldownActive = false;
    document.getElementById('cooldown-overlay').classList.remove('active');
    // Full re-randomise
    this._generatePuzzle();
  },

  /**
   * All cables connected!
   */
  _onComplete() {
    this.running = false;
    if (this.animFrame) cancelAnimationFrame(this.animFrame);

    // Play completion after brief delay for final lock animation
    setTimeout(() => {
      TaskShell.showCompletion('reconnect-wiring');
    }, 800);
  },

  /* =========================================
     AUDIO
     ========================================= */

  _playLockSound() {
    if (!AudioManager.ctx) return;
    const t = AudioManager.ctx.currentTime;

    // Satisfying metallic lock click
    const osc1 = AudioManager.ctx.createOscillator();
    const gain1 = AudioManager.ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.value = 1100 + this.connectedCount * 100;
    gain1.gain.setValueAtTime(0.2, t);
    gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc1.connect(gain1).connect(AudioManager.masterGain);
    osc1.start(t);
    osc1.stop(t + 0.2);

    // Harmonic click
    const osc2 = AudioManager.ctx.createOscillator();
    const gain2 = AudioManager.ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.value = 2200 + this.connectedCount * 150;
    gain2.gain.setValueAtTime(0.1, t + 0.02);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc2.connect(gain2).connect(AudioManager.masterGain);
    osc2.start(t + 0.02);
    osc2.stop(t + 0.12);
  },

  _playArcSound() {
    if (!AudioManager.ctx) return;
    const t = AudioManager.ctx.currentTime;

    // Electric arc — white noise burst through bandpass
    const bufferSize = AudioManager.ctx.sampleRate * 0.15;
    const buffer = AudioManager.ctx.createBuffer(1, bufferSize, AudioManager.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.5;
    }

    const noise = AudioManager.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = AudioManager.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 3000;
    filter.Q.value = 2;

    const gain = AudioManager.ctx.createGain();
    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

    noise.connect(filter).connect(gain).connect(AudioManager.masterGain);
    noise.start(t);
    noise.stop(t + 0.2);
  },

  /* =========================================
     UI UPDATES
     ========================================= */

  _updateTimerDisplay() {
    const el = document.getElementById('timer-display');
    const secs = Math.ceil(this.timeRemaining);
    const min = Math.floor(secs / 60);
    const sec = secs % 60;
    el.textContent = `${min}:${String(sec).padStart(2, '0')}`;

    el.classList.toggle('warning', this.timerWarning);
    el.classList.toggle('critical', this.timerCritical);
  },

  _updateProgressDisplay() {
    document.getElementById('progress-count').textContent = this.connectedCount;
  },

  /* =========================================
     UTILITIES
     ========================================= */

  _resizeCanvas() {
    this.dpr = window.devicePixelRatio || 1;
    const container = this.canvas.parentElement;
    const rect = container.getBoundingClientRect();
    this.canvas.width = rect.width * this.dpr;
    this.canvas.height = rect.height * this.dpr;
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
  },

  _shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  },

  _hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `${r}, ${g}, ${b}`;
  },

  _sampleBezierFromCPs(x0, y0, cp1x, cp1y, cp2x, cp2y, x3, y3, t) {
    const mt = 1 - t;
    return {
      x: mt*mt*mt * x0 + 3*mt*mt*t * cp1x + 3*mt*t*t * cp2x + t*t*t * x3,
      y: mt*mt*mt * y0 + 3*mt*mt*t * cp1y + 3*mt*t*t * cp2y + t*t*t * y3
    };
  },

  /**
   * Cleanup
   */
  destroy() {
    this.running = false;
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
  }
};

// Auto-init when DOM ready
document.addEventListener('DOMContentLoaded', () => {
  WiringTask.init();
});
