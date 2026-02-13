/* =============================================
   PORTALS GAME — Task Shell
   Overlay open/close, Unity bridge, completion
   ============================================= */

const TaskShell = {
  overlay: null,
  frame: null,
  completion: null,
  continueBtn: null,
  isOpen: false,

  /**
   * Initialize the task shell
   */
  init() {
    this.overlay = document.querySelector('.task-overlay');
    this.frame = document.querySelector('.task-frame');
    this.completion = document.querySelector('.task-completion');
    this.continueBtn = document.querySelector('.task-completion__continue');

    // Close button
    const closeBtn = document.querySelector('.task-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }

    // Continue button (after task completion)
    if (this.continueBtn) {
      this.continueBtn.addEventListener('click', () => this.close());
    }

    // ESC key to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });

    this.isOpen = true;
  },

  /**
   * Close the task overlay
   */
  close() {
    if (!this.isOpen) return;
    this.isOpen = false;

    // Fade out
    if (this.overlay) {
      this.overlay.style.opacity = '0';
      this.overlay.style.transition = 'opacity 0.4s ease';
    }

    // Notify Unity
    this.bridge('onTaskClose');

    // Remove after animation
    setTimeout(() => {
      if (this.overlay) {
        this.overlay.style.display = 'none';
      }
    }, 400);
  },

  /**
   * Show task completion state
   * @param {string} taskId - The task identifier
   */
  showCompletion(taskId) {
    // Play completion audio
    if (window.AudioManager) {
      AudioManager.play('success');
    }

    // Activate completion overlay
    if (this.completion) {
      this.completion.classList.add('active');
    }

    // Show continue button after 2 seconds
    setTimeout(() => {
      if (this.continueBtn) {
        this.continueBtn.classList.add('visible');
      }
    }, 2000);

    // Notify Unity of task completion
    this.bridge('onTaskComplete', taskId);
  },

  /**
   * Unity WebView bridge
   * @param {string} method - Bridge method name
   * @param {*} data - Optional data to send
   */
  bridge(method, data) {
    // Unity WebView bridge
    if (window.TaskBridge && typeof window.TaskBridge[method] === 'function') {
      window.TaskBridge[method](data);
    }

    // Fallback: post message for other WebView implementations
    try {
      window.parent.postMessage({
        type: 'taskEvent',
        method: method,
        data: data
      }, '*');
    } catch (e) {
      // Silent fail for non-WebView environments
    }

    console.log(`[TaskShell] Bridge: ${method}`, data || '');
  },

  /**
   * Phase transition helper
   * @param {HTMLElement} currentPhase - Element to hide
   * @param {HTMLElement} nextPhase - Element to show
   * @param {Function} callback - Called after transition
   */
  transitionPhase(currentPhase, nextPhase, callback) {
    if (currentPhase) {
      currentPhase.classList.add('exiting');
      currentPhase.classList.remove('active');
    }

    setTimeout(() => {
      if (currentPhase) {
        currentPhase.classList.add('hidden');
        currentPhase.classList.remove('exiting');
      }

      if (nextPhase) {
        nextPhase.classList.remove('hidden');
        nextPhase.classList.add('entering');

        // Force reflow
        nextPhase.offsetHeight;

        nextPhase.classList.remove('entering');
        nextPhase.classList.add('active');
      }

      if (callback) {
        setTimeout(callback, 300);
      }
    }, 500);
  }
};

// Auto-init when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  TaskShell.init();
});
