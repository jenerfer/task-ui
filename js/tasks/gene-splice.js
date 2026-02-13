/* =============================================
   PORTALS GAME — Gene Splice Relay Task
   3-phase memory mini-game (Botanics)
   ============================================= */

const GeneSpliceTask = {
  // --- Configuration ---
  SEGMENT_COUNT: 4,
  MAX_ATTEMPTS: 3,
  COOLDOWN_DURATION: 10,
  REVEAL_DURATIONS: [3000, 2500, 2000],

  GENE_NAMES: ['adenine', 'thymine', 'guanine', 'cytosine'],
  STRAND_LABELS: ['Chloroplast Strand', 'Root System Strand', 'Pollen Core Strand'],

  // SVG path data for the strand icon (double helix)
  STRAND_SVG_PATH: 'M11.3209 9.11542C10.147 8.68178 8.89856 8.41107 7.58653 8.33647L7.58652 29.66C8.89577 29.5882 10.1443 29.3175 11.3209 28.881L11.3209 9.11542ZM25.6119 10.2365C24.2143 12.3026 23.0431 14.5345 22.1205 16.8601C18.969 11.1508 13.6301 6.52451 6.86782 6.52402L2.75783 6.52402C1.97615 6.3942 1.29946 5.99372 0.807795 5.43024C-0.266661 4.19006 -0.269411 2.34217 0.807795 1.09922C1.29669 0.532981 1.97893 0.132479 2.75783 0.0054404L6.86782 0.00543741C14.6184 0.00543741 21.1396 4.16789 25.6086 10.2334L25.6119 10.2365ZM70.9601 21.1359C70.0402 23.4589 68.8664 25.6934 67.4687 27.7594C71.9378 33.8251 78.4621 37.9905 86.2095 37.9874L90.3195 37.9874C91.1012 37.8575 91.7779 37.4571 92.2695 36.8936C93.344 35.6534 93.3468 33.8055 92.2695 32.5626C91.7806 31.9963 91.0984 31.5958 90.3195 31.4688L86.2095 31.4688C79.4479 31.4688 74.1115 26.8395 70.9568 21.1327L70.9601 21.1359ZM85.4944 8.33626L85.4943 29.6598C84.1851 29.588 82.9366 29.3173 81.76 28.8808L81.76 9.11436C82.9339 8.68072 84.1823 8.41086 85.4944 8.33626ZM50.3179 29.1047C51.652 28.6931 52.8978 28.0717 54.0496 27.29L54.0496 10.7055C52.8978 9.9238 51.6521 9.30232 50.3151 8.88801L50.3152 29.107L50.3179 29.1047ZM39.0236 27.29L39.0236 10.7055C40.1754 9.9238 41.4211 9.30233 42.7553 8.89077V29.1098C41.4211 28.6982 40.1754 28.0768 39.0208 27.2923L39.0236 27.29ZM27.7955 27.7567C29.1931 25.6907 30.3643 23.4588 31.2868 21.1332C32.8005 23.8732 34.8251 26.384 37.2834 28.2402C39.1727 29.6655 41.0951 30.5935 43.4374 31.1348C43.4512 31.1376 43.4651 31.1404 43.4789 31.1431C48.2243 32.1099 52.6298 30.842 56.3612 27.7846C59.5018 25.2131 61.8827 21.5671 63.3247 17.8214C65.2665 12.775 68.4979 8.05206 72.7792 4.73198C76.5496 1.80686 81.0989 0.0032038 86.2061 0.0003046L90.3161 0.000302662C91.0977 0.13012 91.7744 0.530599 92.2661 1.09408C93.3406 2.33427 93.3433 4.18215 92.2661 5.42511C91.7772 5.99134 91.095 6.39184 90.3161 6.51888L86.2061 6.51888C82.5048 6.51888 79.1847 7.89993 76.3756 10.2008C73.235 12.7724 70.8541 16.4184 69.4121 20.164C67.4703 25.2104 64.2389 29.9334 59.9576 33.2535C56.1872 36.1786 51.638 37.9822 46.5307 37.9851C38.7801 37.9851 32.2589 33.8227 27.7899 27.7572L27.7955 27.7567ZM25.9366 27.3065C21.5034 33.5573 14.8686 37.9878 6.86691 37.9848L2.75692 37.9848C1.97524 37.855 1.29855 37.4545 0.806884 36.891C-0.267572 35.6509 -0.270322 33.803 0.806884 32.56C1.29578 31.9938 1.97801 31.5933 2.75692 31.4662L6.86691 31.4662C10.5682 31.4662 13.8855 30.0879 16.6974 27.7843C19.838 25.2128 22.2189 21.5667 23.6609 17.8211C25.6027 12.7747 28.8341 8.05174 33.1154 4.73166C36.8858 1.80655 41.435 0.00288786 46.5422 -1.13325e-05C54.2928 -1.13325e-05 60.8141 4.16244 65.2831 10.2279C63.8854 12.294 62.7143 14.5259 61.7917 16.8515C60.2781 14.1114 58.2534 11.6007 55.7951 9.74451C53.9058 8.31922 51.9834 7.39112 49.6411 6.84983C49.6273 6.84707 49.6135 6.84431 49.5997 6.84154C44.8543 5.87479 40.4487 7.14263 36.7173 10.2C33.5768 12.7716 31.1958 16.4176 29.7538 20.1632C28.7981 22.6491 27.5441 25.0301 26.0194 27.1956C25.9917 27.2288 25.9669 27.2647 25.9448 27.3033L25.9366 27.3065Z',

  // --- State ---
  currentPhase: 0,
  patterns: [[], [], []],
  playerInput: [[], [], []],
  attempts: [0, 0, 0],
  selectedSlot: null,
  inputLocked: false,
  isRevealing: false,
  cooldownActive: false,
  cooldownTimer: 0,
  cooldownInterval: null,

  // --- DOM Refs ---
  phaseEls: [],
  overlayEl: null,
  timerEl: null,

  // =========================================
  // Initialization
  // =========================================
  init() {
    this.phaseEls = [
      document.getElementById('phase-1'),
      document.getElementById('phase-2'),
      document.getElementById('phase-3')
    ];
    this.overlayEl = document.getElementById('contamination-overlay');
    this.timerEl = document.getElementById('contamination-timer');

    // Bind palette buttons for all 3 phases
    for (let p = 0; p < 3; p++) {
      const palette = document.getElementById(`palette-${p + 1}`);
      if (palette) {
        palette.querySelectorAll('.palette-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            this._onPaletteClick(p, btn.dataset.colour);
          });
          btn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this._onPaletteClick(p, btn.dataset.colour);
          }, { passive: false });
        });
      }
    }

    // Generate all 3 patterns upfront
    this._generateAllPatterns();

    // Start Phase 1
    this._startPhase(0);

    console.log('[GeneSpliceTask] Patterns:', this.patterns);
  },

  // =========================================
  // Pattern Generation
  // =========================================
  _generateAllPatterns() {
    for (let p = 0; p < 3; p++) {
      this.patterns[p] = [];
      for (let i = 0; i < this.SEGMENT_COUNT; i++) {
        const idx = Math.floor(Math.random() * this.GENE_NAMES.length);
        this.patterns[p].push(this.GENE_NAMES[idx]);
      }
    }
  },

  // =========================================
  // Phase Lifecycle
  // =========================================
  _startPhase(phaseIdx) {
    this.currentPhase = phaseIdx;
    this.attempts[phaseIdx] = 0;
    this.inputLocked = true;
    this.isRevealing = true;
    this.selectedSlot = null;

    // Reset player input for all strands visible in this phase
    for (let i = 0; i <= phaseIdx; i++) {
      this.playerInput[i] = new Array(this.SEGMENT_COUNT).fill(null);
    }

    // Build strand rows
    this._buildStrandRows(phaseIdx);

    // Update attempt pips
    this._updateAttemptPips(phaseIdx);

    // Hide palette
    const palette = document.getElementById(`palette-${phaseIdx + 1}`);
    if (palette) palette.classList.add('hidden');

    // Update instruction
    const instrEl = document.getElementById(`instruction-${phaseIdx + 1}`);
    if (instrEl) instrEl.textContent = 'Memorise the sequence...';

    // Reveal pattern
    this._revealPattern(phaseIdx);
  },

  _buildStrandRows(phaseIdx) {
    const strandArea = document.getElementById(`strand-area-${phaseIdx + 1}`);
    strandArea.innerHTML = '';

    for (let strandIdx = 0; strandIdx <= phaseIdx; strandIdx++) {
      const row = document.createElement('div');
      row.className = 'strand-row';
      row.dataset.strand = strandIdx;

      // Label
      const label = document.createElement('span');
      label.className = 'strand-row__label';
      label.textContent = this.STRAND_LABELS[strandIdx];
      row.appendChild(label);

      // Segments container (horizontal chain of strand SVGs)
      const segContainer = document.createElement('div');
      segContainer.className = 'strand-row__segments';

      for (let segIdx = 0; segIdx < this.SEGMENT_COUNT; segIdx++) {
        const seg = document.createElement('div');
        seg.className = 'segment empty';
        seg.dataset.strand = strandIdx;
        seg.dataset.segment = segIdx;

        // Inline strand SVG
        seg.innerHTML = `<svg viewBox="0 0 94 38" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="${this.STRAND_SVG_PATH}"/></svg>`;

        seg.addEventListener('click', () => {
          this._onSegmentClick(strandIdx, segIdx);
        });

        segContainer.appendChild(seg);
      }

      row.appendChild(segContainer);
      strandArea.appendChild(row);
    }
  },

  // =========================================
  // Reveal / Hide Pattern
  // =========================================
  _revealPattern(phaseIdx) {
    const duration = this.REVEAL_DURATIONS[phaseIdx];
    const strandArea = document.getElementById(`strand-area-${phaseIdx + 1}`);
    const segments = strandArea.querySelectorAll('.segment');

    // Show all patterns with colours
    segments.forEach(seg => {
      const sIdx = parseInt(seg.dataset.strand);
      const gIdx = parseInt(seg.dataset.segment);
      const colour = this.patterns[sIdx][gIdx];

      seg.classList.remove('empty');
      seg.classList.add(`colour-${colour}`, 'revealing');

      // Previous strands show as locked/dimmed
      if (sIdx < phaseIdx) {
        seg.classList.add('locked');
      }
    });

    // After reveal duration, hide and enable input
    setTimeout(() => this._hidePattern(phaseIdx), duration);
  },

  _hidePattern(phaseIdx) {
    const strandArea = document.getElementById(`strand-area-${phaseIdx + 1}`);
    const segments = strandArea.querySelectorAll('.segment');

    segments.forEach(seg => {
      // Remove all colour classes
      this.GENE_NAMES.forEach(name => seg.classList.remove(`colour-${name}`));
      seg.classList.remove('revealing', 'locked');
      seg.classList.add('empty');
    });

    // Show palette
    const palette = document.getElementById(`palette-${phaseIdx + 1}`);
    if (palette) palette.classList.remove('hidden');

    // Unlock input
    this.inputLocked = false;
    this.isRevealing = false;

    // Update instruction
    const instrEl = document.getElementById(`instruction-${phaseIdx + 1}`);
    if (instrEl) instrEl.textContent = 'Reconstruct the sequence from memory.';

    // Auto-select first empty slot
    this._autoSelectNextEmpty(phaseIdx);
  },

  // =========================================
  // Input Handling
  // =========================================
  _onSegmentClick(strandIdx, segIdx) {
    if (this.inputLocked || this.isRevealing || this.cooldownActive) return;

    // Clear previous selection
    this._clearSelection();

    // Select this slot
    this.selectedSlot = { strandIdx, segIdx };
    const seg = this._getSegmentEl(this.currentPhase, strandIdx, segIdx);
    if (seg) {
      seg.classList.add('selected');
    }

    AudioManager.play('tick');
  },

  _onPaletteClick(phaseIdx, colourName) {
    if (this.inputLocked || this.cooldownActive) return;

    // If no slot selected, auto-select first empty
    if (!this.selectedSlot) {
      this._autoSelectNextEmpty(phaseIdx);
      if (!this.selectedSlot) return; // no empty slots
    }

    const { strandIdx, segIdx } = this.selectedSlot;

    // Store input
    this.playerInput[strandIdx][segIdx] = colourName;

    // Update segment visual
    const seg = this._getSegmentEl(phaseIdx, strandIdx, segIdx);
    if (seg) {
      this.GENE_NAMES.forEach(name => seg.classList.remove(`colour-${name}`));
      seg.classList.remove('empty', 'selected');
      seg.classList.add(`colour-${colourName}`, 'pop');
      setTimeout(() => seg.classList.remove('pop'), 150);
    }

    // Play colour-specific blip
    this._playSegmentBlip(colourName);

    // Clear selection, auto-advance
    this.selectedSlot = null;
    this._autoSelectNextEmpty(phaseIdx);

    // Check if all slots filled
    if (this._allSlotsFilled(phaseIdx)) {
      this.inputLocked = true;
      setTimeout(() => this._checkAnswer(phaseIdx), 400);
    }
  },

  _clearSelection() {
    if (!this.selectedSlot) return;
    const { strandIdx, segIdx } = this.selectedSlot;
    const seg = this._getSegmentEl(this.currentPhase, strandIdx, segIdx);
    if (seg) {
      seg.classList.remove('selected');
    }
    this.selectedSlot = null;
  },

  _autoSelectNextEmpty(phaseIdx) {
    this._clearSelection();

    // Scan all strands top-to-bottom, left-to-right
    for (let sIdx = 0; sIdx <= phaseIdx; sIdx++) {
      for (let gIdx = 0; gIdx < this.SEGMENT_COUNT; gIdx++) {
        if (this.playerInput[sIdx][gIdx] === null) {
          this.selectedSlot = { strandIdx: sIdx, segIdx: gIdx };
          const seg = this._getSegmentEl(phaseIdx, sIdx, gIdx);
          if (seg) seg.classList.add('selected');
          return;
        }
      }
    }
    // All filled — no selection
    this.selectedSlot = null;
  },

  _allSlotsFilled(phaseIdx) {
    for (let sIdx = 0; sIdx <= phaseIdx; sIdx++) {
      for (let gIdx = 0; gIdx < this.SEGMENT_COUNT; gIdx++) {
        if (this.playerInput[sIdx][gIdx] === null) return false;
      }
    }
    return true;
  },

  _getSegmentEl(phaseIdx, strandIdx, segIdx) {
    const strandArea = document.getElementById(`strand-area-${phaseIdx + 1}`);
    if (!strandArea) return null;
    return strandArea.querySelector(
      `.segment[data-strand="${strandIdx}"][data-segment="${segIdx}"]`
    );
  },

  // =========================================
  // Answer Checking
  // =========================================
  _checkAnswer(phaseIdx) {
    let allCorrect = true;
    const wrongSegments = [];

    for (let sIdx = 0; sIdx <= phaseIdx; sIdx++) {
      for (let gIdx = 0; gIdx < this.SEGMENT_COUNT; gIdx++) {
        if (this.playerInput[sIdx][gIdx] !== this.patterns[sIdx][gIdx]) {
          allCorrect = false;
          wrongSegments.push({ strandIdx: sIdx, segmentIdx: gIdx });
        }
      }
    }

    if (allCorrect) {
      this._onStrandCorrect(phaseIdx);
    } else {
      this._onStrandWrong(phaseIdx, wrongSegments);
    }
  },

  _onStrandCorrect(phaseIdx) {
    // Green glow on all segments
    const strandArea = document.getElementById(`strand-area-${phaseIdx + 1}`);
    strandArea.querySelectorAll('.segment').forEach(seg => {
      seg.classList.add('correct');
    });

    // Play growth chime
    this._playGrowthChime();
    AudioManager.play('hit');

    if (phaseIdx < 2) {
      // Advance to next phase
      setTimeout(() => {
        AudioManager.play('phase');
        const currentEl = this.phaseEls[phaseIdx];
        const nextEl = this.phaseEls[phaseIdx + 1];
        TaskShell.transitionPhase(currentEl, nextEl, () => {
          this._startPhase(phaseIdx + 1);
        });
      }, 1000);
    } else {
      // Phase 3 complete — helix merge then completion
      this._playHelixMerge(strandArea, () => {
        TaskShell.showCompletion('gene-splice');
      });
    }
  },

  _onStrandWrong(phaseIdx, wrongSegments) {
    AudioManager.play('miss');
    this.attempts[phaseIdx]++;
    this._updateAttemptPips(phaseIdx);

    // Shake wrong segments
    const strandArea = document.getElementById(`strand-area-${phaseIdx + 1}`);
    wrongSegments.forEach(({ strandIdx, segmentIdx }) => {
      const seg = strandArea.querySelector(
        `.segment[data-strand="${strandIdx}"][data-segment="${segmentIdx}"]`
      );
      if (seg) {
        seg.classList.add('error');
        setTimeout(() => seg.classList.remove('error'), 500);
      }
    });

    if (this.attempts[phaseIdx] >= this.MAX_ATTEMPTS) {
      setTimeout(() => this._triggerCooldown(phaseIdx), 600);
    } else {
      setTimeout(() => {
        this._clearAllInputs(phaseIdx);
        this.inputLocked = false;
        this._autoSelectNextEmpty(phaseIdx);
      }, 600);
    }
  },

  _clearAllInputs(phaseIdx) {
    const strandArea = document.getElementById(`strand-area-${phaseIdx + 1}`);

    for (let sIdx = 0; sIdx <= phaseIdx; sIdx++) {
      this.playerInput[sIdx] = new Array(this.SEGMENT_COUNT).fill(null);
    }

    strandArea.querySelectorAll('.segment').forEach(seg => {
      this.GENE_NAMES.forEach(name => seg.classList.remove(`colour-${name}`));
      seg.classList.remove('correct', 'error', 'selected', 'pop');
      seg.classList.add('empty');
    });
  },

  // =========================================
  // Cooldown
  // =========================================
  _triggerCooldown(phaseIdx) {
    this.cooldownActive = true;
    this.inputLocked = true;
    this.cooldownTimer = this.COOLDOWN_DURATION;

    this._playContaminationSound();

    this.overlayEl.classList.add('active');
    this._updateCooldownDisplay();

    this.cooldownInterval = setInterval(() => {
      this.cooldownTimer--;
      this._updateCooldownDisplay();

      if (this.cooldownTimer <= 0) {
        clearInterval(this.cooldownInterval);
        this._endCooldown(phaseIdx);
      }
    }, 1000);
  },

  _updateCooldownDisplay() {
    this.timerEl.textContent = this.cooldownTimer;
  },

  _endCooldown(phaseIdx) {
    this.overlayEl.classList.remove('active');
    this.cooldownActive = false;

    // Retry same phase (attempts reset inside _startPhase)
    this._startPhase(phaseIdx);
  },

  // =========================================
  // Attempt Pips
  // =========================================
  _updateAttemptPips(phaseIdx) {
    const pipsContainer = document.getElementById(`attempts-${phaseIdx + 1}`);
    if (!pipsContainer) return;
    const pips = pipsContainer.querySelectorAll('.attempt-pip');
    pips.forEach((pip, i) => {
      if (i < this.attempts[phaseIdx]) {
        pip.classList.add('used');
      } else {
        pip.classList.remove('used');
      }
    });
  },

  // =========================================
  // Helix Merge Animation (Phase 3 completion)
  // =========================================
  _playHelixMerge(strandArea, callback) {
    const rows = strandArea.querySelectorAll('.strand-row');
    rows.forEach((row, i) => {
      row.style.animationDelay = `${i * 0.15}s`;
      row.classList.add('merging');
    });

    setTimeout(callback, 800 + rows.length * 150);
  },

  // =========================================
  // Audio — Procedural Web Audio API sounds
  // =========================================
  _ensureAudio() {
    if (!AudioManager.ctx) AudioManager.init();
    AudioManager.resume();
  },

  _playSegmentBlip(colourName) {
    this._ensureAudio();
    const ctx = AudioManager.ctx;
    const t = ctx.currentTime;

    const pitchMap = {
      adenine: 523,
      thymine: 587,
      guanine: 659,
      cytosine: 698
    };

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = pitchMap[colourName] || 523;
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(gain).connect(AudioManager.masterGain);
    osc.start(t);
    osc.stop(t + 0.15);
  },

  _playGrowthChime() {
    this._ensureAudio();
    const ctx = AudioManager.ctx;
    const t = ctx.currentTime;
    const notes = [523, 659, 784, 880]; // C5, E5, G5, A5

    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = t + i * 0.1;
      gain.gain.setValueAtTime(0.15, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);
      osc.connect(gain).connect(AudioManager.masterGain);
      osc.start(start);
      osc.stop(start + 0.4);
    });
  },

  _playContaminationSound() {
    this._ensureAudio();
    const ctx = AudioManager.ctx;
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(80, t);
    osc.frequency.linearRampToValueAtTime(40, t + 0.6);

    filter.type = 'lowpass';
    filter.frequency.value = 300;

    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.7);

    osc.connect(filter).connect(gain).connect(AudioManager.masterGain);
    osc.start(t);
    osc.stop(t + 0.75);
  },

  // =========================================
  // Cleanup
  // =========================================
  destroy() {
    if (this.cooldownInterval) {
      clearInterval(this.cooldownInterval);
    }
  }
};

// Auto-init when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  GeneSpliceTask.init();
});
