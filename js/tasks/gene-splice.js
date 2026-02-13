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

      // Helix wrapper: backbone-left + segments + backbone-right
      const helixWrap = document.createElement('div');
      helixWrap.className = 'strand-row__helix';

      // Left backbone (double helix rail)
      helixWrap.appendChild(this._createBackboneSVG('left'));

      // Segments container
      const segContainer = document.createElement('div');
      segContainer.className = 'strand-row__segments';

      for (let segIdx = 0; segIdx < this.SEGMENT_COUNT; segIdx++) {
        const seg = document.createElement('div');
        seg.className = 'segment empty';
        seg.dataset.strand = strandIdx;
        seg.dataset.segment = segIdx;

        seg.addEventListener('click', () => {
          this._onSegmentClick(strandIdx, segIdx);
        });

        segContainer.appendChild(seg);
      }

      helixWrap.appendChild(segContainer);

      // Right backbone
      helixWrap.appendChild(this._createBackboneSVG('right'));

      row.appendChild(helixWrap);
      strandArea.appendChild(row);
    }
  },

  _createBackboneSVG(side) {
    const wrapper = document.createElement('div');
    wrapper.className = 'helix-backbone';

    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 28 40');
    svg.setAttribute('preserveAspectRatio', 'none');

    // Two intertwining strands of the double helix
    const path1 = document.createElementNS(ns, 'path');
    const path2 = document.createElementNS(ns, 'path');

    if (side === 'left') {
      // Strand 1 curves right-to-left approaching the rungs
      path1.setAttribute('d', 'M2,4 C14,10 14,14 6,20 C-2,26 -2,30 10,36');
      // Strand 2 mirrors — crossing over strand 1
      path2.setAttribute('d', 'M10,4 C-2,10 -2,14 6,20 C14,26 14,30 2,36');
    } else {
      // Mirror for right side
      path1.setAttribute('d', 'M26,4 C14,10 14,14 22,20 C30,26 30,30 18,36');
      path2.setAttribute('d', 'M18,4 C30,10 30,14 22,20 C14,26 14,30 26,36');
    }

    path2.style.opacity = '0.6';

    svg.appendChild(path1);
    svg.appendChild(path2);
    wrapper.appendChild(svg);

    return wrapper;
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
