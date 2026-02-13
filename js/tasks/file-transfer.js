/* =============================================
   PORTALS GAME — File Transfer Task
   Phase 1: Send Medical Files (Offices theme)
   Phase 2: Receive Medical Files (Medbay theme)
   ============================================= */

const FileTransferTask = {
  // Config
  sendDuration: 15,     // seconds to send
  receiveDuration: 15,  // seconds to receive
  failureRate: 0.20,    // 20% chance of failure

  // State
  phase: 'idle',        // idle | sending | sent | receiving | complete
  progress: 0,          // 0-1
  elapsed: 0,
  failed: false,
  animFrame: null,
  lastTimestamp: 0,

  // File animation
  fileAnim: {
    canvas: null,
    ctx: null,
    time: 0,
    // Retro data stream particles
    particles: [],
    // Scanline offset
    scanY: 0
  },

  // Colors
  colors: {
    offices: {
      primary: '#EF7B54',
      secondary1: '#6F959B',
      secondary2: '#A69893',
      folder: '#EF7B54',
      folderDark: '#C4603F',
      folderTab: '#D96A48'
    },
    medbay: {
      primary: '#50FFE8',
      secondary1: '#9E71F7',
      secondary2: '#C7C8D8',
      folder: '#50FFE8',
      folderDark: '#2FBDA8',
      folderTab: '#3DD4BF'
    }
  },

  /**
   * Initialize the task
   */
  init() {
    this.setupSendPhase();
  },

  /* =========================================
     PHASE 1: SEND
     ========================================= */

  setupSendPhase() {
    // Canvas
    this.fileAnim.canvas = document.getElementById('file-canvas');
    this.fileAnim.ctx = this.fileAnim.canvas.getContext('2d');
    this._resizeCanvas(this.fileAnim.canvas);

    // Send button
    const sendBtn = document.getElementById('send-btn');
    sendBtn.addEventListener('click', () => {
      AudioManager.init();
      this.startSending();
    });

    // Start idle animation
    this.phase = 'idle';
    this._animate();
  },

  startSending() {
    if (this.phase === 'sending') return;

    this.phase = 'sending';
    this.progress = 0;
    this.elapsed = 0;
    this.failed = false;
    this.fileAnim.particles = [];

    // Decide failure point (if this attempt will fail)
    const willFail = Math.random() < this.failureRate;
    this._failAt = willFail ? 0.4 + Math.random() * 0.4 : null; // fail between 40-80%

    // Show progress, hide button & hint
    document.getElementById('send-action').classList.add('hidden');
    document.getElementById('send-progress').classList.remove('hidden');
    document.getElementById('send-error').classList.add('hidden');

    AudioManager.play('tick');
  },

  _updateSending(dt) {
    this.elapsed += dt;
    this.progress = Math.min(1, this.elapsed / this.sendDuration);

    // Check failure
    if (this._failAt && this.progress >= this._failAt) {
      this._triggerSendError();
      return;
    }

    // Update UI
    document.getElementById('send-fill').style.width = (this.progress * 100) + '%';
    document.getElementById('send-percent').textContent = Math.floor(this.progress * 100) + '%';

    // Generate data particles during send
    if (Math.random() < 0.3) {
      this._spawnParticle('up');
    }

    // Success
    if (this.progress >= 1) {
      this._onSendComplete();
    }
  },

  _triggerSendError() {
    this.phase = 'idle';
    this.failed = true;
    this.fileAnim.particles = [];

    AudioManager.play('miss');

    // Show error, hide progress
    document.getElementById('send-progress').classList.add('hidden');
    document.getElementById('send-error').classList.remove('hidden');

    // After 2 seconds, show button again
    setTimeout(() => {
      document.getElementById('send-error').classList.add('hidden');
      document.getElementById('send-action').classList.remove('hidden');
      this.failed = false;
    }, 2000);
  },

  _onSendComplete() {
    this.phase = 'sent';
    this.fileAnim.particles = [];

    AudioManager.play('hit');

    // Update step dots in send phase
    const dot1 = document.getElementById('step-dot-1');
    const line = document.getElementById('step-line');
    if (dot1) { dot1.classList.add('filled'); dot1.classList.remove('active'); }
    if (line) line.classList.add('filled');

    // Brief pause then transition to receive
    setTimeout(() => {
      this._transitionToReceive();
    }, 1000);
  },

  /* =========================================
     PHASE 2: RECEIVE
     ========================================= */

  _transitionToReceive() {
    AudioManager.play('phase');

    // Switch theme from Offices to Medbay
    const overlay = document.querySelector('.task-overlay');
    overlay.classList.remove('theme-offices');
    overlay.classList.add('theme-medbay');

    // Update header
    const areaLabel = document.querySelector('.task-header__area-label');
    const title = document.querySelector('.task-header__title');
    if (areaLabel) areaLabel.textContent = 'Medbay';
    if (title) title.textContent = 'Receive Medical Files';

    // Phase transition
    const sendPhase = document.getElementById('phase-send');
    const receivePhase = document.getElementById('phase-receive');

    TaskShell.transitionPhase(sendPhase, receivePhase, () => {
      this._setupReceivePhase();
    });
  },

  _setupReceivePhase() {
    // New canvas for receive
    this.fileAnim.canvas = document.getElementById('file-canvas-receive');
    this.fileAnim.ctx = this.fileAnim.canvas.getContext('2d');
    this._resizeCanvas(this.fileAnim.canvas);

    this.phase = 'idle-receive';

    // Receive button
    const receiveBtn = document.getElementById('receive-btn');
    receiveBtn.addEventListener('click', () => {
      AudioManager.init();
      this.startReceiving();
    });
  },

  startReceiving() {
    if (this.phase === 'receiving') return;

    this.phase = 'receiving';
    this.progress = 0;
    this.elapsed = 0;
    this.failed = false;
    this.fileAnim.particles = [];

    // Decide failure
    const willFail = Math.random() < this.failureRate;
    this._failAt = willFail ? 0.4 + Math.random() * 0.4 : null;

    // Show progress, hide button
    document.getElementById('receive-action').classList.add('hidden');
    document.getElementById('receive-progress').classList.remove('hidden');
    document.getElementById('receive-error').classList.add('hidden');

    AudioManager.play('tick');
  },

  _updateReceiving(dt) {
    this.elapsed += dt;
    this.progress = Math.min(1, this.elapsed / this.receiveDuration);

    // Check failure
    if (this._failAt && this.progress >= this._failAt) {
      this._triggerReceiveError();
      return;
    }

    // Update UI
    document.getElementById('receive-fill').style.width = (this.progress * 100) + '%';
    document.getElementById('receive-percent').textContent = Math.floor(this.progress * 100) + '%';

    // Particles flowing down
    if (Math.random() < 0.3) {
      this._spawnParticle('down');
    }

    // Success
    if (this.progress >= 1) {
      this._onReceiveComplete();
    }
  },

  _triggerReceiveError() {
    this.phase = 'idle-receive';
    this.failed = true;
    this.fileAnim.particles = [];

    AudioManager.play('miss');

    document.getElementById('receive-progress').classList.add('hidden');
    document.getElementById('receive-error').classList.remove('hidden');

    setTimeout(() => {
      document.getElementById('receive-error').classList.add('hidden');
      document.getElementById('receive-action').classList.remove('hidden');
      this.failed = false;
    }, 2000);
  },

  _onReceiveComplete() {
    this.phase = 'complete';
    this.fileAnim.particles = [];

    AudioManager.play('hit');

    // Update step dots
    const dot2 = document.getElementById('step-dot-2b');
    if (dot2) { dot2.classList.add('filled'); dot2.classList.remove('active'); }

    // Complete task
    setTimeout(() => {
      if (this.animFrame) cancelAnimationFrame(this.animFrame);
      TaskShell.showCompletion('file-transfer');
    }, 1200);
  },

  /* =========================================
     ANIMATION LOOP
     ========================================= */

  _animate(timestamp) {
    const dt = timestamp ? (timestamp - (this.lastTimestamp || timestamp)) / 1000 : 0.016;
    this.lastTimestamp = timestamp || 0;
    this.fileAnim.time += dt;

    // Clamp dt
    const safeDt = Math.min(dt, 0.1);

    // Update phase logic
    if (this.phase === 'sending') {
      this._updateSending(safeDt);
    } else if (this.phase === 'receiving') {
      this._updateReceiving(safeDt);
    }

    // Update particles
    this._updateParticles(safeDt);

    // Draw
    this._draw();

    this.animFrame = requestAnimationFrame((t) => this._animate(t));
  },

  /* =========================================
     PARTICLE SYSTEM
     ========================================= */

  _spawnParticle(direction) {
    const canvas = this.fileAnim.canvas;
    if (!canvas) return;
    const w = canvas.width;
    const h = canvas.height;

    this.fileAnim.particles.push({
      x: w * 0.25 + Math.random() * w * 0.5,
      y: direction === 'up' ? h * 0.55 : h * 0.1,
      vx: (Math.random() - 0.5) * 30,
      vy: direction === 'up' ? -(80 + Math.random() * 60) : (80 + Math.random() * 60),
      life: 1,
      size: 2 + Math.random() * 4,
      char: this._randomDataChar()
    });
  },

  _randomDataChar() {
    const chars = '01001101010011100001110100110010';
    return chars[Math.floor(Math.random() * chars.length)];
  },

  _updateParticles(dt) {
    const particles = this.fileAnim.particles;
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt * 0.8;
      if (p.life <= 0) {
        particles.splice(i, 1);
      }
    }
  },

  /* =========================================
     DRAWING
     ========================================= */

  _draw() {
    const canvas = this.fileAnim.canvas;
    const ctx = this.fileAnim.ctx;
    if (!canvas || !ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const t = this.fileAnim.time;

    ctx.clearRect(0, 0, w, h);

    // Determine color set
    const isMedbay = (this.phase === 'idle-receive' || this.phase === 'receiving' || this.phase === 'complete');
    const colors = isMedbay ? this.colors.medbay : this.colors.offices;

    // Draw retro folder
    this._drawFolder(ctx, w, h, colors, t);

    // Draw data particles
    this._drawParticles(ctx, colors);

    // Draw scanlines for retro effect
    this._drawScanlines(ctx, w, h, t);

    // Error flash
    if (this.failed) {
      ctx.fillStyle = 'rgba(255, 68, 68, 0.08)';
      ctx.fillRect(0, 0, w, h);
    }
  },

  _drawFolder(ctx, w, h, colors, t) {
    const cx = w / 2;
    const cy = h / 2;

    // Folder dimensions
    const fw = w * 0.55;
    const fh = h * 0.42;
    const fx = cx - fw / 2;
    const fy = cy - fh / 2 + h * 0.04;
    const tabW = fw * 0.35;
    const tabH = fh * 0.15;
    const r = 8;

    // Breathing scale for idle states
    const isTransferring = (this.phase === 'sending' || this.phase === 'receiving');
    const breathe = isTransferring ? 1 + Math.sin(t * 4) * 0.015 : 1 + Math.sin(t * 1.5) * 0.01;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(breathe, breathe);
    ctx.translate(-cx, -cy);

    // Glow behind folder
    ctx.shadowColor = colors.primary;
    ctx.shadowBlur = isTransferring ? 30 + Math.sin(t * 3) * 10 : 15;

    // Folder tab (top-left)
    ctx.beginPath();
    ctx.moveTo(fx + r, fy - tabH);
    ctx.lineTo(fx + tabW - r, fy - tabH);
    ctx.quadraticCurveTo(fx + tabW, fy - tabH, fx + tabW, fy - tabH + r);
    ctx.lineTo(fx + tabW, fy);
    ctx.lineTo(fx, fy);
    ctx.lineTo(fx, fy - tabH + r);
    ctx.quadraticCurveTo(fx, fy - tabH, fx + r, fy - tabH);
    ctx.closePath();
    ctx.fillStyle = colors.folderTab;
    ctx.fill();

    // Folder body
    ctx.beginPath();
    ctx.moveTo(fx + r, fy);
    ctx.lineTo(fx + fw - r, fy);
    ctx.quadraticCurveTo(fx + fw, fy, fx + fw, fy + r);
    ctx.lineTo(fx + fw, fy + fh - r);
    ctx.quadraticCurveTo(fx + fw, fy + fh, fx + fw - r, fy + fh);
    ctx.lineTo(fx + r, fy + fh);
    ctx.quadraticCurveTo(fx, fy + fh, fx, fy + fh - r);
    ctx.lineTo(fx, fy + r);
    ctx.quadraticCurveTo(fx, fy, fx + r, fy);
    ctx.closePath();
    ctx.fillStyle = colors.folder;
    ctx.fill();

    ctx.shadowBlur = 0;

    // Folder front face (slightly darker, offset down)
    const frontY = fy + fh * 0.12;
    ctx.beginPath();
    ctx.moveTo(fx + r, frontY);
    ctx.lineTo(fx + fw - r, frontY);
    ctx.quadraticCurveTo(fx + fw, frontY, fx + fw, frontY + r);
    ctx.lineTo(fx + fw, fy + fh - r);
    ctx.quadraticCurveTo(fx + fw, fy + fh, fx + fw - r, fy + fh);
    ctx.lineTo(fx + r, fy + fh);
    ctx.quadraticCurveTo(fx, fy + fh, fx, fy + fh - r);
    ctx.lineTo(fx, frontY + r);
    ctx.quadraticCurveTo(fx, frontY, fx + r, frontY);
    ctx.closePath();
    ctx.fillStyle = colors.folderDark;
    ctx.fill();

    // Retro document lines peeking out of folder
    const docTop = fy + fh * 0.02;
    const docLeft = fx + fw * 0.15;
    const docRight = fx + fw * 0.85;
    ctx.strokeStyle = 'rgba(14, 21, 25, 0.3)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const ly = docTop + i * 8;
      const lw = (docRight - docLeft) * (1 - i * 0.15);
      ctx.beginPath();
      ctx.moveTo(docLeft, ly);
      ctx.lineTo(docLeft + lw, ly);
      ctx.stroke();
    }

    // Cross/Medical cross symbol on front face
    const crossCx = cx;
    const crossCy = frontY + (fy + fh - frontY) / 2;
    const crossSize = fh * 0.15;
    const crossThick = crossSize * 0.35;

    ctx.fillStyle = 'rgba(14, 21, 25, 0.25)';
    // Horizontal bar
    ctx.fillRect(crossCx - crossSize, crossCy - crossThick / 2, crossSize * 2, crossThick);
    // Vertical bar
    ctx.fillRect(crossCx - crossThick / 2, crossCy - crossSize, crossThick, crossSize * 2);

    // Data stream effect when transferring
    if (isTransferring) {
      const dir = this.phase === 'sending' ? -1 : 1;
      // Animated dashes streaming from folder
      for (let i = 0; i < 5; i++) {
        const dashY = cy + dir * (20 + ((t * 80 + i * 25) % 80));
        const dashX = cx + Math.sin(t * 2 + i) * 15;
        const alpha = 1 - (((t * 80 + i * 25) % 80) / 80);
        ctx.fillStyle = colors.primary;
        ctx.globalAlpha = alpha * 0.6;
        ctx.fillRect(dashX - 6, dashY, 12, 3);
        ctx.globalAlpha = 1;
      }
    }

    ctx.restore();
  },

  _drawParticles(ctx, colors) {
    const particles = this.fileAnim.particles;
    ctx.font = '16px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life) * 0.7;
      ctx.fillStyle = colors.primary;
      ctx.shadowColor = colors.primary;
      ctx.shadowBlur = 6;
      ctx.fillText(p.char, p.x, p.y);
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  },

  _drawScanlines(ctx, w, h, t) {
    // Subtle CRT scanlines
    ctx.fillStyle = 'rgba(0, 0, 0, 0.03)';
    for (let y = 0; y < h; y += 4) {
      ctx.fillRect(0, y, w, 1);
    }

    // Moving scanline
    const scanY = ((t * 40) % h);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
    ctx.fillRect(0, scanY, w, 2);
  },

  /* =========================================
     UTILS
     ========================================= */

  _resizeCanvas(canvas) {
    if (!canvas) return;
    const container = canvas.parentElement;
    const size = Math.min(container.clientWidth, container.clientHeight, 200);
    canvas.width = size * 2;
    canvas.height = size * 2;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
  },

  destroy() {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
  }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  FileTransferTask.init();
});
