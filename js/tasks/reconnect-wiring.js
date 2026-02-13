/* =============================================
   PORTALS GAME — Reconnect Faulty Wiring Task
   Storage Bay — Junction Box Puzzle
   5 cables, orthogonal routing, live wire, 30s timer
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

  // Wire style
  wireColor: '#222E34',
  wireStroke: '#0F171C',
  wireWidth: 10,
  cornerRadius: 24,

  // State
  cables: [],
  selectedCable: -1,
  connectedCount: 0,

  // Target mapping: cable i connects to socket targetSlots[i]
  targetSlots: [],

  // Live wire
  liveWireIdx: -1,
  liveWireTimer: 0,
  liveWireInterval: 4,

  // Stun
  stunTimer: 0,
  stunDuration: 1.5,
  stunFlash: 0,

  // Cooldown
  cooldownActive: false,
  cooldownTimer: 0,
  cooldownDuration: 10,

  // Animation
  swayTime: 0,

  // Completion delay — lets final wire animate before showing overlay
  completionPending: false,
  completionDelay: 0,

  // Spark particles
  sparks: [],

  // Colors (from CSS vars)
  colors: {
    primary: '#FECE54',
    secondary1: '#B1AEA4',
    secondary2: '#528F83',
    bg: '#0E1519',
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
    wireZone: { left: 0, right: 0, top: 0, bottom: 0 }
  },

  /**
   * Initialize the task
   */
  init() {
    const style = getComputedStyle(document.documentElement);
    this.colors.primary = style.getPropertyValue('--area-primary').trim() || this.colors.primary;
    this.colors.secondary1 = style.getPropertyValue('--area-secondary1').trim() || this.colors.secondary1;

    this.canvas = document.getElementById('wiring-canvas');
    this.ctx = this.canvas.getContext('2d');
    this._resizeCanvas();

    this._generatePuzzle();

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

    this.running = true;
    this.lastTimestamp = 0;
    this._animate(0);
  },

  /**
   * Generate the puzzle
   */
  _generatePuzzle() {
    this.connectedCount = 0;
    this.selectedCable = -1;
    this.timeRemaining = 30;
    this.timerWarning = false;
    this.timerCritical = false;
    this.stunTimer = 0;
    this.sparks = [];
    this.swayTime = 0;
    this.completionPending = false;
    this.completionDelay = 0;

    // Random target mapping: cable i connects to socket slot targetSlots[i]
    this.targetSlots = this._shuffle([0, 1, 2, 3, 4]);

    this._computeLayout();
    this._generateRoutes();

    this._pickLiveWire();
    this.liveWireTimer = this.liveWireInterval;

    this._updateProgressDisplay();
    this._updateTimerDisplay();
  },

  /**
   * Compute pixel layout
   */
  _computeLayout() {
    const w = this.canvas.width / this.dpr;
    const h = this.canvas.height / this.dpr;

    const padding = w * 0.06;
    const endpointZoneW = w * 0.10;

    this.layout.leftX = padding + endpointZoneW * 0.5;
    this.layout.rightX = w - padding - endpointZoneW * 0.5;
    this.layout.wireZone = {
      left: padding + endpointZoneW + 5,
      right: w - padding - endpointZoneW - 5,
      top: h * 0.10,
      bottom: h * 0.92
    };

    const topMargin = h * 0.12 + 35;
    const bottomMargin = h * 0.10 + 35;
    const usableH = h - topMargin - bottomMargin;
    const spacing = usableH / (this.CABLE_COUNT - 1);

    this.layout.cableRadius = Math.min(w * 0.025, 16);
    this.layout.socketRadius = Math.min(w * 0.028, 18);

    this.layout.cableStartYs = [];
    this.layout.socketYs = [];
    for (let i = 0; i < this.CABLE_COUNT; i++) {
      this.layout.cableStartYs.push(topMargin + i * spacing);
      this.layout.socketYs.push(topMargin + i * spacing);
    }
  },

  /**
   * Generate orthogonal (right-angle) routes for each cable.
   * Every horizontal and vertical segment uses a UNIQUE coordinate so
   * no two wires ever share any part of a path — horizontally or vertically.
   *
   * Strategy: allocate a grid of exclusive X-columns and Y-rows.
   * Each cable owns 3 exclusive X-columns (for its 3 vertical runs)
   * and 2 exclusive Y-rows (for its 2 internal horizontal runs).
   * The entry/exit horizontal segments use the cable's own leftY/rightY,
   * but we route them through the first vertical column immediately,
   * so shared-Y runs are kept as short as possible (just endpoint → first turn).
   */
  _generateRoutes() {
    this.cables = [];
    const wz = this.layout.wireZone;
    const wzWidth = wz.right - wz.left;
    const wzHeight = wz.bottom - wz.top;

    // We need 3 X-columns per cable (15 total) and 2 Y-rows per cable (10 total)
    const numX = this.CABLE_COUNT * 3;
    const numY = this.CABLE_COUNT * 2;

    // Generate unique vertical X-columns (evenly spaced across wire zone)
    const xPad = wzWidth * 0.03;
    const xUsable = wzWidth - xPad * 2;
    const allX = [];
    for (let i = 0; i < numX; i++) {
      allX.push(wz.left + xPad + (i + 0.5) * (xUsable / numX));
    }
    const shuffledX = this._shuffle(allX);

    // Generate unique horizontal Y-rows (evenly spaced across wire zone)
    const yPad = wzHeight * 0.03;
    const yUsable = wzHeight - yPad * 2;
    const allY = [];
    for (let i = 0; i < numY; i++) {
      allY.push(wz.top + yPad + (i + 0.5) * (yUsable / numY));
    }
    const shuffledY = this._shuffle(allY);

    for (let i = 0; i < this.CABLE_COUNT; i++) {
      const leftY = this.layout.cableStartYs[i];
      const socketSlot = this.targetSlots[i];
      const rightY = this.layout.socketYs[socketSlot];

      // 3 exclusive X-columns and 2 exclusive Y-rows for this cable
      const xs = [shuffledX[i * 3], shuffledX[i * 3 + 1], shuffledX[i * 3 + 2]].sort((a, b) => a - b);
      const y1 = shuffledY[i * 2];
      const y2 = shuffledY[i * 2 + 1];

      // Route: 10 waypoints
      // start → xs[0],leftY → xs[0],y1 → xs[1],y1 → xs[1],y2 → xs[2],y2 → xs[2],rightY → end
      const route = [
        { x: this.layout.leftX, y: leftY },
        { x: xs[0], y: leftY },
        { x: xs[0], y: y1 },
        { x: xs[1], y: y1 },
        { x: xs[1], y: y2 },
        { x: xs[2], y: y2 },
        { x: xs[2], y: rightY },
        { x: this.layout.rightX, y: rightY }
      ];

      this.cables.push({
        leftY,
        rightY,
        targetSocket: socketSlot,
        route,
        connected: false,
        locked: false,
        errorCount: 0,
        lockProgress: 0
      });
    }
  },

  /**
   * Sample a point along a cable's route at parameter t (0-1)
   */
  _sampleRoute(cableIdx, t) {
    const route = this.cables[cableIdx].route;
    // Compute total route length
    let totalLen = 0;
    const segLengths = [];
    for (let i = 0; i < route.length - 1; i++) {
      const dx = route[i + 1].x - route[i].x;
      const dy = route[i + 1].y - route[i].y;
      const len = Math.sqrt(dx * dx + dy * dy);
      segLengths.push(len);
      totalLen += len;
    }

    let target = t * totalLen;
    for (let i = 0; i < segLengths.length; i++) {
      if (target <= segLengths[i]) {
        const segT = segLengths[i] > 0 ? target / segLengths[i] : 0;
        return {
          x: route[i].x + (route[i + 1].x - route[i].x) * segT,
          y: route[i].y + (route[i + 1].y - route[i].y) * segT
        };
      }
      target -= segLengths[i];
    }
    return { x: route[route.length - 1].x, y: route[route.length - 1].y };
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
      this.liveWireIdx = -1;
      return;
    }
    let newIdx;
    do {
      newIdx = available[Math.floor(Math.random() * available.length)];
    } while (newIdx === this.liveWireIdx && available.length > 1);
    this.liveWireIdx = newIdx;
  },

  /* =========================================
     ANIMATION LOOP
     ========================================= */

  _animate(timestamp) {
    if (!this.running) return;

    const dt = this.lastTimestamp ? (timestamp - this.lastTimestamp) / 1000 : 0.016;
    this.lastTimestamp = timestamp;
    const cdt = Math.min(dt, 0.1);

    this._update(cdt);
    this._draw();

    this.animFrame = requestAnimationFrame((t) => this._animate(t));
  },

  /* =========================================
     UPDATE
     ========================================= */

  _update(dt) {
    this.swayTime += dt;

    // Completion pending — keep animating so final wire colour reveals, then show overlay
    if (this.completionPending) {
      this.completionDelay -= dt;
      // Still animate lock progress on all cables
      for (let i = 0; i < this.CABLE_COUNT; i++) {
        if (this.cables[i].locked && this.cables[i].lockProgress < 1) {
          this.cables[i].lockProgress = Math.min(1, this.cables[i].lockProgress + dt * 2.5);
        }
      }
      this._updateSparks(dt);
      if (this.completionDelay <= 0) {
        this.completionPending = false;
        this.running = false;
        if (this.animFrame) cancelAnimationFrame(this.animFrame);
        TaskShell.showCompletion('reconnect-wiring');
      }
      return;
    }

    if (this.stunTimer > 0) {
      this.stunTimer -= dt;
      this.stunFlash -= dt;
    }

    if (this.cooldownActive) {
      this.cooldownTimer -= dt;
      if (this.cooldownTimer <= 0) {
        this._endCooldown();
      }
      document.getElementById('cooldown-timer').textContent = Math.ceil(this.cooldownTimer);
      this._updateSparks(dt);
      return;
    }

    if (this.timeRemaining > 0 && this.connectedCount < this.CABLE_COUNT) {
      this.timeRemaining -= dt;
      if (this.timeRemaining <= 0) {
        this.timeRemaining = 0;
        this._triggerTimeout();
      }
    }

    this.timerWarning = this.timeRemaining <= 10 && this.timeRemaining > 4;
    this.timerCritical = this.timeRemaining <= 4;
    this._updateTimerDisplay();

    if (this.liveWireIdx >= 0) {
      this.liveWireTimer -= dt;
      if (this.liveWireTimer <= 0) {
        this._pickLiveWire();
        this.liveWireTimer = this.liveWireInterval;
      }
    }

    for (let i = 0; i < this.CABLE_COUNT; i++) {
      if (this.cables[i].locked && this.cables[i].lockProgress < 1) {
        this.cables[i].lockProgress = Math.min(1, this.cables[i].lockProgress + dt * 2.5);
      }
    }

    this._updateSparks(dt);

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

    this._drawBackground(w, h);
    this._drawWires(w, h);
    this._drawCableEndpoints(w, h);
    this._drawSocketTerminals(w, h);
    this._drawSparks();

    // Stun flash
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

    ctx.fillStyle = this.colors.steel;
    ctx.fillRect(0, 0, w, h);

    const grad = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, w * 0.6);
    grad.addColorStop(0, 'rgba(254, 206, 84, 0.03)');
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    this._drawHazardStripes(ctx, 0, 0, w, h * 0.035);
    this._drawHazardStripes(ctx, 0, h - h * 0.035, w, h * 0.035);

    ctx.font = `${Math.max(20, w * 0.028)}px 'Bungee', sans-serif`;
    ctx.fillStyle = 'rgba(254, 206, 84, 0.25)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('JUNCTION BOX J-7', w * 0.5, h * 0.055);

    // Rivets
    const rivetR = Math.max(3, w * 0.006);
    const rp = w * 0.03;
    [[rp, h * 0.05], [w - rp, h * 0.05], [rp, h - h * 0.05], [w - rp, h - h * 0.05]].forEach(([rx, ry]) => {
      ctx.beginPath();
      ctx.arc(rx, ry, rivetR, 0, Math.PI * 2);
      ctx.fillStyle = this.colors.rivet;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(rx - rivetR * 0.2, ry - rivetR * 0.3, rivetR * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fill();
    });

    ctx.font = `15px 'Bungee', sans-serif`;
    ctx.fillStyle = 'rgba(199, 224, 234, 0.4)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('CABLES', this.layout.leftX, h * 0.055);
    ctx.fillText('TERMINALS', this.layout.rightX, h * 0.055);
  },

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
   * Draw a rounded orthogonal path for a route
   */
  _traceRoundedRoute(ctx, route, r) {
    if (route.length < 2) return;

    ctx.beginPath();
    ctx.moveTo(route[0].x, route[0].y);

    for (let i = 1; i < route.length - 1; i++) {
      const prev = route[i - 1];
      const curr = route[i];
      const next = route[i + 1];

      // Direction vectors
      const dx1 = curr.x - prev.x;
      const dy1 = curr.y - prev.y;
      const dx2 = next.x - curr.x;
      const dy2 = next.y - curr.y;

      const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
      const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

      // Clamp radius to half the shorter segment
      const maxR = Math.min(len1, len2) * 0.5;
      const cr = Math.min(r, maxR);

      if (cr > 0 && len1 > 0 && len2 > 0) {
        // Point where we start curving (before corner)
        const startX = curr.x - (dx1 / len1) * cr;
        const startY = curr.y - (dy1 / len1) * cr;
        // Point where we end curving (after corner)
        const endX = curr.x + (dx2 / len2) * cr;
        const endY = curr.y + (dy2 / len2) * cr;

        ctx.lineTo(startX, startY);
        ctx.quadraticCurveTo(curr.x, curr.y, endX, endY);
      } else {
        ctx.lineTo(curr.x, curr.y);
      }
    }

    ctx.lineTo(route[route.length - 1].x, route[route.length - 1].y);
  },

  /**
   * Draw all wires — no highlight on selected wire, only glow on live wire
   */
  _drawWires(w, h) {
    const ctx = this.ctx;
    const r = this.cornerRadius;

    // Draw order: locked first, then normal, live on top
    const order = [];
    for (let i = 0; i < this.CABLE_COUNT; i++) order.push(i);

    for (const i of order) {
      const cable = this.cables[i];
      const color = this.cableColors[i];
      const isLive = i === this.liveWireIdx && !cable.locked;

      const route = cable.route;

      // Wire stroke (outer dark border — 5px border each side)
      this._traceRoundedRoute(ctx, route, r);
      ctx.strokeStyle = this.wireStroke;
      ctx.lineWidth = this.wireWidth + 5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();

      // Wire fill (inner colour)
      this._traceRoundedRoute(ctx, route, r);
      if (cable.locked) {
        // Locked: show real colour
        ctx.strokeStyle = color.hex;
        ctx.lineWidth = this.wireWidth;
      } else {
        // Unlocked: grey
        ctx.strokeStyle = this.wireColor;
        ctx.lineWidth = this.wireWidth;
      }
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();

      // Locked cable — travelling light pulse
      if (cable.locked && cable.lockProgress >= 1) {
        const pulseT = (this.swayTime * 0.6 + i * 0.25) % 1;
        const pt = this._sampleRoute(i, pulseT);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = color.hex;
        ctx.shadowColor = color.hex;
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
  },

  /**
   * Draw cable endpoints (left) — grey by default, colour when selected or locked
   */
  _drawCableEndpoints(w, h) {
    const ctx = this.ctx;
    const r = this.layout.cableRadius;
    const greyLight = '#5A6068';
    const greyDark = '#3A4048';

    for (let i = 0; i < this.CABLE_COUNT; i++) {
      const cable = this.cables[i];
      const color = this.cableColors[i];
      const x = this.layout.leftX;
      const y = this.layout.cableStartYs[i];
      const isSelected = i === this.selectedCable;
      const isLive = i === this.liveWireIdx && !cable.locked;

      const showColor = cable.locked || isSelected;
      const dispHex = showColor ? color.hex : greyLight;
      const dispDark = showColor ? color.dark : greyDark;

      // Bezel
      ctx.beginPath();
      ctx.arc(x, y, r + 3, 0, Math.PI * 2);
      ctx.fillStyle = isLive ? `rgba(255, 68, 68, ${0.3 + Math.sin(this.swayTime * 6) * 0.2})` :
        (isSelected ? `rgba(${this._hexToRgb(this.colors.primary)}, 0.4)` : this.colors.steelLight);
      ctx.fill();
      ctx.strokeStyle = isLive ? '#FF4444' : (isSelected ? this.colors.primary : this.colors.steelBorder);
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Inner
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      const grad = ctx.createRadialGradient(x - r * 0.2, y - r * 0.3, 0, x, y, r);
      grad.addColorStop(0, dispHex);
      grad.addColorStop(1, dispDark);
      ctx.fillStyle = grad;
      ctx.fill();

      // Specular highlight
      ctx.beginPath();
      ctx.arc(x - r * 0.2, y - r * 0.3, r * 0.35, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.fill();

      // Locked checkmark
      if (cable.locked) {
        ctx.font = `bold ${r}px sans-serif`;
        ctx.fillStyle = '#0E1519';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('\u2713', x, y + 1);
      }
    }
  },

  /**
   * Draw socket terminals (right) — all show bolt icon
   */
  _drawSocketTerminals(w, h) {
    const ctx = this.ctx;
    const r = this.layout.socketRadius;

    for (let i = 0; i < this.CABLE_COUNT; i++) {
      const x = this.layout.rightX;
      const y = this.layout.socketYs[i];

      // Check if connected
      const connectedCable = this.cables.find(c => c.locked && c.targetSocket === i);
      const isConnected = !!connectedCable;
      const connectedColor = isConnected ? this.cableColors[this.cables.indexOf(connectedCable)].hex : null;

      // Outer bezel
      ctx.beginPath();
      ctx.arc(x, y, r + 3, 0, Math.PI * 2);
      ctx.fillStyle = isConnected ? `rgba(${this._hexToRgb(connectedColor)}, 0.2)` : this.colors.steelLight;
      ctx.fill();
      ctx.strokeStyle = isConnected ? connectedColor : this.colors.steelBorder;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Inner socket
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = isConnected ? `rgba(${this._hexToRgb(connectedColor)}, 0.15)` : 'rgba(20, 30, 35, 0.9)';
      ctx.fill();

      // Bolt icon on every socket
      const symbolColor = isConnected ? connectedColor : 'rgba(199, 224, 234, 0.5)';
      this._drawBolt(ctx, x, y, r * 0.5, symbolColor);
    }
  },

  /**
   * Draw bolt/lightning symbol
   */
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

  /* =========================================
     SPARKS
     ========================================= */

  _spawnLiveWireSpark() {
    if (this.liveWireIdx < 0) return;
    const t = Math.random();
    const pt = this._sampleRoute(this.liveWireIdx, t);

    for (let j = 0; j < 2; j++) {
      this.sparks.push({
        x: pt.x, y: pt.y,
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
      s.vy += 120 * dt;
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

    const hitCable = this._hitTestCables(mx, my);
    const hitSocket = this._hitTestSockets(mx, my);

    if (hitCable >= 0) {
      if (this.cables[hitCable].locked) return;

      if (hitCable === this.liveWireIdx) {
        this._triggerShock();
        return;
      }

      if (this.selectedCable === hitCable) {
        this.selectedCable = -1;
      } else {
        this.selectedCable = hitCable;
        AudioManager.play('tick');
      }
    } else if (hitSocket >= 0 && this.selectedCable >= 0) {
      this._checkConnection(this.selectedCable, hitSocket);
    } else {
      this.selectedCable = -1;
    }
  },

  _hitTestCables(mx, my) {
    const r = this.layout.cableRadius + 8;
    for (let i = 0; i < this.CABLE_COUNT; i++) {
      const dx = mx - this.layout.leftX;
      const dy = my - this.layout.cableStartYs[i];
      if (dx * dx + dy * dy <= r * r) return i;
    }
    return -1;
  },

  _hitTestSockets(mx, my) {
    const r = this.layout.socketRadius + 8;
    for (let i = 0; i < this.CABLE_COUNT; i++) {
      const dx = mx - this.layout.rightX;
      const dy = my - this.layout.socketYs[i];
      if (dx * dx + dy * dy <= r * r) return i;
    }
    return -1;
  },

  _checkConnection(cableIdx, socketSlot) {
    const cable = this.cables[cableIdx];
    if (socketSlot === cable.targetSocket) {
      this._lockInCable(cableIdx);
    } else {
      cable.errorCount++;
      const penalty = cable.errorCount === 1 ? 2 : (cable.errorCount === 2 ? 3 : 5);
      this.timeRemaining = Math.max(0, this.timeRemaining - penalty);
      AudioManager.play('miss');
      this.selectedCable = -1;
      if (this.timeRemaining <= 0) this._triggerTimeout();
    }
  },

  _lockInCable(cableIdx) {
    const cable = this.cables[cableIdx];
    cable.connected = true;
    cable.locked = true;
    cable.lockProgress = 0;
    this.connectedCount++;
    this.selectedCable = -1;

    if (this.liveWireIdx === cableIdx) {
      this._pickLiveWire();
      this.liveWireTimer = this.liveWireInterval;
    }

    this._playLockSound();
    this._updateProgressDisplay();

    if (this.connectedCount >= this.CABLE_COUNT) {
      this._onComplete();
    }
  },

  _triggerShock() {
    this.stunTimer = this.stunDuration;
    this.stunFlash = 0.3;
    this.timeRemaining = Math.max(0, this.timeRemaining - 3);
    this.selectedCable = -1;
    AudioManager.play('miss');
    this._playArcSound();

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
    if (this.timeRemaining <= 0) this._triggerTimeout();
  },

  _triggerTimeout() {
    this.cooldownActive = true;
    this.cooldownTimer = this.cooldownDuration;
    this.selectedCable = -1;
    AudioManager.play('miss');
    document.getElementById('cooldown-overlay').classList.add('active');
    document.getElementById('cooldown-timer').textContent = Math.ceil(this.cooldownDuration);
  },

  _endCooldown() {
    this.cooldownActive = false;
    document.getElementById('cooldown-overlay').classList.remove('active');
    this._generatePuzzle();
  },

  _onComplete() {
    // Don't stop immediately — let the final wire's colour animation play out
    // lockProgress takes ~0.4s (dt*2.5), plus a small beat for the player to see it
    this.completionPending = true;
    this.completionDelay = 1.2; // seconds: 0.4s animation + 0.8s visible beat
  },

  /* =========================================
     AUDIO
     ========================================= */

  _playLockSound() {
    if (!AudioManager.ctx) return;
    const t = AudioManager.ctx.currentTime;

    const osc1 = AudioManager.ctx.createOscillator();
    const gain1 = AudioManager.ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.value = 1100 + this.connectedCount * 100;
    gain1.gain.setValueAtTime(0.2, t);
    gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc1.connect(gain1).connect(AudioManager.masterGain);
    osc1.start(t);
    osc1.stop(t + 0.2);

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

  destroy() {
    this.running = false;
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
  }
};

// Auto-init when DOM ready
document.addEventListener('DOMContentLoaded', () => {
  WiringTask.init();
});
