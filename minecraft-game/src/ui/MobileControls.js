// Multitouch mobile controls using explicit touch.identifier tracking
// so left-thumb joystick and right-thumb camera look work simultaneously without jitter.

export class MobileControls {
  constructor(playerController, callbacks = {}) {
    this.player = playerController;
    this.callbacks = callbacks;

    this.root = document.getElementById('mobile-controls');
    this.joystickBase = document.getElementById('touch-joystick-base');
    this.joystickKnob = document.getElementById('touch-joystick-knob');
    this.lookZone = document.getElementById('touch-look-zone');

    this.btnJump = document.getElementById('btn-touch-jump');
    this.btnCrouch = document.getElementById('btn-touch-crouch');
    this.btnAction = document.getElementById('btn-touch-action');
    this.btnFly = document.getElementById('btn-touch-fly');

    this.enabled = false;
    this.touchSensitivity = 0.0052;

    // Independent touch identifier state
    this.joystickTouchId = null;
    this.joystickCenter = { x: 0, y: 0 };
    this.maxRadius = 46;

    this.lookTouchId = null;
    this.lastLookPos = { x: 0, y: 0 };

    this._bindEvents();
  }

  static detectTouchDevice() {
    return (
      window.matchMedia?.('(pointer: coarse)').matches ||
      'ontouchstart' in window ||
      (navigator.maxTouchPoints ?? 0) > 0
    );
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (this.root) {
      this.root.classList.toggle('hidden', !this.enabled);
    }
    document.body.classList.toggle('touch-mode', this.enabled);
    if (!this.enabled) {
      this._resetAllInputs();
    }
  }

  setFlyActive(active) {
    if (this.btnFly) {
      this.btnFly.classList.toggle('active', Boolean(active));
    }
  }

  _resetAllInputs() {
    this.joystickTouchId = null;
    this.lookTouchId = null;
    this.player.touchInput.moveX = 0;
    this.player.touchInput.moveZ = 0;
    this.player.touchInput.jump = false;
    this.player.touchInput.crouch = false;
    this.player.touchInput.sprint = false;
    if (this.joystickKnob) {
      this.joystickKnob.style.transform = 'translate(-50%, -50%)';
    }
    this.joystickBase?.classList.remove('sprinting');
  }

  _bindEvents() {
    if (!this.root) return;

    // Virtual Joystick (left thumb)
    this.joystickBase?.addEventListener('touchstart', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      e.stopPropagation();
      if (this.joystickTouchId !== null) return;

      const touch = e.changedTouches[0];
      if (!touch) return;
      this.joystickTouchId = touch.identifier;
      const rect = this.joystickBase.getBoundingClientRect();
      this.joystickCenter.x = rect.left + rect.width * 0.5;
      this.joystickCenter.y = rect.top + rect.height * 0.5;
      this.maxRadius = Math.max(34, rect.width * 0.42);
      this._updateJoystick(touch.clientX, touch.clientY);
    }, { passive: false });

    // Right-hand camera look zone
    this.lookZone?.addEventListener('touchstart', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      if (this.lookTouchId !== null) return;
      const touch = e.changedTouches[0];
      if (!touch) return;
      this.lookTouchId = touch.identifier;
      this.lastLookPos.x = touch.clientX;
      this.lastLookPos.y = touch.clientY;
    }, { passive: false });

    // Global touchmove/touchend/touchcancel filtered strictly by touch.identifier
    this._onTouchMove = (e) => {
      if (!this.enabled) return;
      let handled = false;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === this.joystickTouchId) {
          this._updateJoystick(t.clientX, t.clientY);
          handled = true;
        } else if (t.identifier === this.lookTouchId) {
          const dx = t.clientX - this.lastLookPos.x;
          const dy = t.clientY - this.lastLookPos.y;
          this.lastLookPos.x = t.clientX;
          this.lastLookPos.y = t.clientY;
          this.player.applyLookDelta(dx, dy, this.touchSensitivity);
          handled = true;
        }
      }
      if (handled) e.preventDefault();
    };

    this._onTouchEnd = (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === this.joystickTouchId) {
          this.joystickTouchId = null;
          this.player.touchInput.moveX = 0;
          this.player.touchInput.moveZ = 0;
          this.player.touchInput.sprint = false;
          if (this.joystickKnob) {
            this.joystickKnob.style.transform = 'translate(-50%, -50%)';
          }
          this.joystickBase?.classList.remove('sprinting');
        }
        if (t.identifier === this.lookTouchId) {
          this.lookTouchId = null;
        }
      }
    };

    window.addEventListener('touchmove', this._onTouchMove, { passive: false });
    window.addEventListener('touchend', this._onTouchEnd, { passive: false });
    window.addEventListener('touchcancel', this._onTouchEnd, { passive: false });

    // Holdable Bedrock-style buttons
    const bindHoldButton = (btn, field) => {
      if (!btn) return;
      let activeTouchId = null;
      btn.addEventListener('touchstart', (e) => {
        if (!this.enabled) return;
        e.preventDefault();
        e.stopPropagation();
        const t = e.changedTouches[0];
        if (t) activeTouchId = t.identifier;
        this.player.touchInput[field] = true;
        btn.classList.add('pressed');
      }, { passive: false });

      const release = (e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === activeTouchId) {
            activeTouchId = null;
            this.player.touchInput[field] = false;
            btn.classList.remove('pressed');
          }
        }
      };
      btn.addEventListener('touchend', release, { passive: false });
      btn.addEventListener('touchcancel', release, { passive: false });
    };

    bindHoldButton(this.btnJump, 'jump');
    bindHoldButton(this.btnCrouch, 'crouch');

    // Action / Swing button (touch & click fallback)
    if (this.btnAction) {
      this.btnAction.addEventListener('touchstart', (e) => {
        if (!this.enabled) return;
        e.preventDefault();
        e.stopPropagation();
        this.btnAction.classList.add('pressed');
        this.player.triggerPrimaryAction();
      }, { passive: false });
      const endAction = () => this.btnAction.classList.remove('pressed');
      this.btnAction.addEventListener('touchend', endAction, { passive: false });
      this.btnAction.addEventListener('touchcancel', endAction, { passive: false });
    }

    // Fly toggle button on touch HUD
    if (this.btnFly) {
      this.btnFly.addEventListener('touchstart', (e) => {
        if (!this.enabled) return;
        e.preventDefault();
        e.stopPropagation();
        const active = this.player.toggleFlyMode();
        this.setFlyActive(active);
        this.callbacks.onStatusToast?.(active ? 'Режим полёта: ВКЛ' : 'Режим полёта: ВЫКЛ');
      }, { passive: false });
    }
  }

  _updateJoystick(clientX, clientY) {
    let dx = clientX - this.joystickCenter.x;
    let dy = clientY - this.joystickCenter.y;
    const dist = Math.hypot(dx, dy);
    if (dist > this.maxRadius) {
      dx = (dx / dist) * this.maxRadius;
      dy = (dy / dist) * this.maxRadius;
    }

    if (this.joystickKnob) {
      this.joystickKnob.style.transform = `translate(calc(-50% + ${dx.toFixed(1)}px), calc(-50% + ${dy.toFixed(1)}px))`;
    }

    const normX = dx / this.maxRadius;
    const normZ = -dy / this.maxRadius; // up on screen = forward (+1)
    const mag = Math.min(1, dist / this.maxRadius);

    // Deadzone for steady standing
    if (mag < 0.14) {
      this.player.touchInput.moveX = 0;
      this.player.touchInput.moveZ = 0;
      this.player.touchInput.sprint = false;
      this.joystickBase?.classList.remove('sprinting');
      return;
    }

    this.player.touchInput.moveX = normX;
    this.player.touchInput.moveZ = normZ;
    // Auto-sprint when pushing stick near full forward deflection
    const autoSprint = mag > 0.88 && normZ > 0.55;
    this.player.touchInput.sprint = autoSprint;
    this.joystickBase?.classList.toggle('sprinting', autoSprint);
  }

  dispose() {
    window.removeEventListener('touchmove', this._onTouchMove);
    window.removeEventListener('touchend', this._onTouchEnd);
    window.removeEventListener('touchcancel', this._onTouchEnd);
  }
}
