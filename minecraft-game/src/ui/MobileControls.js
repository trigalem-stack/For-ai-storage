// Multitouch mobile controls using explicit touch.identifier tracking
// so left-thumb joystick, right-thumb look/tap/hold-break, and action buttons work simultaneously.

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
    this.btnBreak = document.getElementById('btn-touch-break');
    this.btnPlace = document.getElementById('btn-touch-place');
    this.btnFly = document.getElementById('btn-touch-fly');

    this.enabled = false;
    this.touchSensitivity = 0.0052;
    this.crouchToggled = false;
    this.lastJumpTapTime = 0;

    // Independent touch identifier state
    this.joystickTouchId = null;
    this.joystickCenter = { x: 0, y: 0 };
    this.maxRadius = 46;

    this.lookTouchId = null;
    this.lookStartPos = { x: 0, y: 0 };
    this.lastLookPos = { x: 0, y: 0 };
    this.lookStartTime = 0;
    this.lookMoved = false;
    this.longPressTimer = null;
    this.longPressTriggered = false;

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
    if (active && this.crouchToggled) {
      this.crouchToggled = false;
      this.player.touchInput.crouch = false;
      this.btnCrouch?.classList.remove('active');
    }
  }

  _resetAllInputs() {
    clearTimeout(this.longPressTimer);
    this.joystickTouchId = null;
    this.lookTouchId = null;
    this.crouchToggled = false;
    this.longPressTriggered = false;
    this.player.touchInput.moveX = 0;
    this.player.touchInput.moveZ = 0;
    this.player.touchInput.jump = false;
    this.player.touchInput.crouch = false;
    this.player.touchInput.sprint = false;
    this.player.touchInput.breakHeld = false;
    if (this.joystickKnob) {
      this.joystickKnob.style.transform = 'translate(-50%, -50%)';
    }
    this.joystickBase?.classList.remove('sprinting');
    this.btnCrouch?.classList.remove('active');
    this.btnBreak?.classList.remove('pressed');
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

    // Camera look zone: swipe to look, short tap to place, hold stationary (>260ms) to break
    this.lookZone?.addEventListener('touchstart', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      if (this.lookTouchId !== null) return;
      const touch = e.changedTouches[0];
      if (!touch) return;

      this.lookTouchId = touch.identifier;
      this.lookStartPos.x = touch.clientX;
      this.lookStartPos.y = touch.clientY;
      this.lastLookPos.x = touch.clientX;
      this.lastLookPos.y = touch.clientY;
      this.lookStartTime = performance.now();
      this.lookMoved = false;
      this.longPressTriggered = false;

      clearTimeout(this.longPressTimer);
      this.longPressTimer = setTimeout(() => {
        if (this.lookTouchId !== null && !this.lookMoved && this.enabled) {
          this.longPressTriggered = true;
          this.player.touchInput.breakHeld = true;
        }
      }, 260);
    }, { passive: false });

    this._onTouchMove = (e) => {
      if (!this.enabled) return;
      let handled = false;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === this.joystickTouchId) {
          this._updateJoystick(t.clientX, t.clientY);
          handled = true;
        } else if (t.identifier === this.lookTouchId) {
          const totalDist = Math.hypot(t.clientX - this.lookStartPos.x, t.clientY - this.lookStartPos.y);
          if (totalDist > 12) {
            this.lookMoved = true;
            clearTimeout(this.longPressTimer);
          }
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
          clearTimeout(this.longPressTimer);
          if (this.longPressTriggered) {
            this.player.touchInput.breakHeld = false;
            this.longPressTriggered = false;
          } else if (!this.lookMoved && performance.now() - this.lookStartTime < 250) {
            this.player.triggerPlaceAction();
          }
          this.lookTouchId = null;
        }
      }
    };

    window.addEventListener('touchmove', this._onTouchMove, { passive: false });
    window.addEventListener('touchend', this._onTouchEnd, { passive: false });
    window.addEventListener('touchcancel', this._onTouchEnd, { passive: false });

    // Jump button: hold to jump/ascend + quick double-tap (<300ms) toggles Fly Mode
    if (this.btnJump) {
      let jumpTouchId = null;
      this.btnJump.addEventListener('touchstart', (e) => {
        if (!this.enabled) return;
        e.preventDefault();
        e.stopPropagation();
        const t = e.changedTouches[0];
        if (t) jumpTouchId = t.identifier;

        const now = performance.now();
        if (now - this.lastJumpTapTime < 300) {
          const active = this.player.toggleFlyMode();
          this.setFlyActive(active);
          this.callbacks.onStatusToast?.(active ? 'Полёт: ВКЛ (2×Прыжок)' : 'Полёт: ВЫКЛ');
          this.lastJumpTapTime = 0;
        } else {
          this.lastJumpTapTime = now;
        }

        this.player.touchInput.jump = true;
        this.btnJump.classList.add('pressed');
      }, { passive: false });

      const endJump = (e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === jumpTouchId) {
            jumpTouchId = null;
            this.player.touchInput.jump = false;
            this.btnJump.classList.remove('pressed');
          }
        }
      };
      this.btnJump.addEventListener('touchend', endJump, { passive: false });
      this.btnJump.addEventListener('touchcancel', endJump, { passive: false });
    }

    // Crouch / Descend button: Bedrock-style toggle on ground (safe edge guard), hold-to-descend in fly mode
    if (this.btnCrouch) {
      let crouchTouchId = null;
      this.btnCrouch.addEventListener('touchstart', (e) => {
        if (!this.enabled) return;
        e.preventDefault();
        e.stopPropagation();
        const t = e.changedTouches[0];
        if (t) crouchTouchId = t.identifier;

        if (this.player.flyMode) {
          this.player.touchInput.crouch = true;
          this.btnCrouch.classList.add('pressed');
        } else {
          this.crouchToggled = !this.crouchToggled;
          this.player.touchInput.crouch = this.crouchToggled;
          this.btnCrouch.classList.toggle('active', this.crouchToggled);
        }
      }, { passive: false });

      const endCrouch = (e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === crouchTouchId) {
            crouchTouchId = null;
            this.btnCrouch.classList.remove('pressed');
            if (this.player.flyMode) {
              this.player.touchInput.crouch = false;
            }
          }
        }
      };
      this.btnCrouch.addEventListener('touchend', endCrouch, { passive: false });
      this.btnCrouch.addEventListener('touchcancel', endCrouch, { passive: false });
    }

    // Dedicated Break button (hold to mine)
    if (this.btnBreak) {
      let breakTouchId = null;
      this.btnBreak.addEventListener('touchstart', (e) => {
        if (!this.enabled) return;
        e.preventDefault();
        e.stopPropagation();
        const t = e.changedTouches[0];
        if (t) breakTouchId = t.identifier;
        this.player.touchInput.breakHeld = true;
        this.btnBreak.classList.add('pressed');
      }, { passive: false });

      const endBreak = (e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === breakTouchId) {
            breakTouchId = null;
            this.player.touchInput.breakHeld = false;
            this.btnBreak.classList.remove('pressed');
          }
        }
      };
      this.btnBreak.addEventListener('touchend', endBreak, { passive: false });
      this.btnBreak.addEventListener('touchcancel', endBreak, { passive: false });
    }

    // Dedicated Place button (tap to place)
    if (this.btnPlace) {
      this.btnPlace.addEventListener('touchstart', (e) => {
        if (!this.enabled) return;
        e.preventDefault();
        e.stopPropagation();
        this.btnPlace.classList.add('pressed');
        this.player.triggerPlaceAction();
      }, { passive: false });
      const endPlace = () => this.btnPlace.classList.remove('pressed');
      this.btnPlace.addEventListener('touchend', endPlace, { passive: false });
      this.btnPlace.addEventListener('touchcancel', endPlace, { passive: false });
    }

    // Fly quick toggle button
    if (this.btnFly) {
      this.btnFly.addEventListener('touchstart', (e) => {
        if (!this.enabled) return;
        e.preventDefault();
        e.stopPropagation();
        const active = this.player.toggleFlyMode();
        this.setFlyActive(active);
        this.callbacks.onStatusToast?.(active ? 'Полёт: ВКЛ' : 'Полёт: ВЫКЛ');
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
    const normZ = -dy / this.maxRadius;
    const mag = Math.min(1, dist / this.maxRadius);

    if (mag < 0.14) {
      this.player.touchInput.moveX = 0;
      this.player.touchInput.moveZ = 0;
      this.player.touchInput.sprint = false;
      this.joystickBase?.classList.remove('sprinting');
      return;
    }

    this.player.touchInput.moveX = normX;
    this.player.touchInput.moveZ = normZ;
    const autoSprint = mag > 0.88 && normZ > 0.55;
    this.player.touchInput.sprint = autoSprint;
    this.joystickBase?.classList.toggle('sprinting', autoSprint);
  }

  dispose() {
    clearTimeout(this.longPressTimer);
    window.removeEventListener('touchmove', this._onTouchMove);
    window.removeEventListener('touchend', this._onTouchEnd);
    window.removeEventListener('touchcancel', this._onTouchEnd);
  }
}
