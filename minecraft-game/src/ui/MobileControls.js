// Dynamic Multitouch Mobile Controls:
// - Left half of screen = dynamic floating joystick appearing right under thumb touch!
// - Right half of screen = camera swipe look, short tap place, hold break
// - Double-push forward on joystick (hold on 2nd push) = Sprint!
// - Ergonomic, generously sized action buttons with zero accidental look-zone hijack

export class MobileControls {
  constructor(playerController, callbacks = {}) {
    this.player = playerController;
    this.callbacks = callbacks;

    this.root = document.getElementById('mobile-controls');
    this.moveZone = document.getElementById('touch-move-zone');
    this.lookZone = document.getElementById('touch-look-zone');
    this.joystickBase = document.getElementById('touch-joystick-base');
    this.joystickKnob = document.getElementById('touch-joystick-knob');

    this.btnJump = document.getElementById('btn-touch-jump');
    this.btnCrouch = document.getElementById('btn-touch-crouch');
    this.btnBreak = document.getElementById('btn-touch-break');
    this.btnPlace = document.getElementById('btn-touch-place');
    this.btnFly = document.getElementById('btn-touch-fly');
    this.btnDropOne = document.getElementById('btn-hud-drop-one');
    this.btnDropAll = document.getElementById('btn-hud-drop-all');

    this.enabled = false;
    this.touchSensitivity = 0.0052;
    this.crouchToggled = false;
    this.lastJumpTapTime = 0;

    // Floating joystick state
    this.joystickTouchId = null;
    this.joystickCenter = { x: 0, y: 0 };
    this.maxRadius = 48;
    this.lastForwardStartTime = 0;
    this.forwardTapReleased = false;
    this.inCenterSincePush = false;
    this.lastForwardPeakTime = 0;
    this.sprintLocked = false;

    // Camera look state
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
      if (this.player) this.player.touchInput.crouch = false;
      this.btnCrouch?.classList.remove('active');
    }
  }

  setCreativeMode(creative) {
    if (this.btnFly) {
      this.btnFly.classList.toggle('hidden', !creative);
    }
  }

  setHeldFoodIndicator(isFood, modeTag = '') {
    if (!this.btnPlace) return;
    if (modeTag === 'bow') {
      this.btnPlace.textContent = '🏹';
      this.btnPlace.title = 'Зажмите, чтобы натянуть лук и отпустите для выстрела';
    } else if (modeTag === 'throw') {
      this.btnPlace.textContent = '🎯';
      this.btnPlace.title = 'Бросить';
    } else if (isFood) {
      this.btnPlace.textContent = '🍖';
      this.btnPlace.title = 'Зажмите, чтобы съесть / выпить';
    } else {
      this.btnPlace.textContent = '🧱';
      this.btnPlace.title = 'Поставить / Использовать';
    }
  }

  _hideFloatingJoystick() {
    if (this.joystickBase) {
      this.joystickBase.classList.remove('active', 'sprinting');
      this.joystickBase.style.left = '';
      this.joystickBase.style.top = '';
    }
    if (this.joystickKnob) {
      this.joystickKnob.style.transform = 'translate(-50%, -50%)';
    }
  }

  _resetAllInputs() {
    clearTimeout(this.longPressTimer);
    this.joystickTouchId = null;
    this.lookTouchId = null;
    this.crouchToggled = false;
    this.longPressTriggered = false;
    this.sprintLocked = false;
    if (this.player) {
      this.player.touchInput.moveX = 0;
      this.player.touchInput.moveZ = 0;
      this.player.touchInput.jump = false;
      this.player.touchInput.crouch = false;
      this.player.touchInput.sprint = false;
      this.player.touchInput.breakHeld = false;
      this.player.touchInput.useHeld = false;
      this.player.stopEating?.();
    }
    this._hideFloatingJoystick();
    this.btnCrouch?.classList.remove('active');
    this.btnBreak?.classList.remove('pressed');
    this.btnJump?.classList.remove('pressed');
    this.btnPlace?.classList.remove('pressed');
  }

  _bindEvents() {
    if (!this.root) return;

    // Entire left half of screen spawns the joystick right where user's finger touches!
    this.moveZone?.addEventListener('touchstart', (e) => {
      if (!this.enabled || !this.player) return;
      e.preventDefault();
      e.stopPropagation();
      if (this.joystickTouchId !== null) return;

      const touch = e.changedTouches[0];
      if (!touch) return;
      this.joystickTouchId = touch.identifier;

      const r = this.maxRadius;
      const cx = Math.max(r + 8, Math.min(window.innerWidth * 0.48 - r, touch.clientX));
      const cy = Math.max(r + 56, Math.min(window.innerHeight - r - 8, touch.clientY));
      this.joystickCenter.x = cx;
      this.joystickCenter.y = cy;

      if (this.joystickBase) {
        this.joystickBase.style.left = `${cx}px`;
        this.joystickBase.style.top = `${cy}px`;
        this.joystickBase.classList.add('active');
      }

      // Quick double-tap + hold forward on left half engages sprint cleanly
      const now = performance.now();
      if (this.forwardTapReleased && now - this.lastForwardStartTime < 380) {
        this.sprintLocked = true;
        this.forwardTapReleased = false;
      }
      this.lastForwardStartTime = now;

      this._updateJoystick(touch.clientX, touch.clientY);
    }, { passive: false });

    // Right half of screen controls camera look (swipe = look, quick tap = place, long hold = break)
    this.lookZone?.addEventListener('touchstart', (e) => {
      if (!this.enabled || !this.player) return;
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
      }, 240);
    }, { passive: false });

    this._onTouchMove = (e) => {
      if (!this.enabled || !this.player) return;
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
      if (!this.player) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === this.joystickTouchId) {
          this.joystickTouchId = null;
          this.sprintLocked = false;
          if (performance.now() - this.lastForwardStartTime < 360) {
            this.forwardTapReleased = true;
          } else {
            this.forwardTapReleased = false;
          }
          this.player.touchInput.moveX = 0;
          this.player.touchInput.moveZ = 0;
          this.player.touchInput.sprint = false;
          this._hideFloatingJoystick();
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

    // Helper for reliable ergonomic action buttons
    const bindHoldBtn = (btn, onPress, onRelease) => {
      if (!btn) return;
      let activeId = null;
      btn.addEventListener('touchstart', (e) => {
        if (!this.enabled || !this.player) return;
        e.preventDefault();
        e.stopPropagation();
        const t = e.changedTouches[0];
        if (t) activeId = t.identifier;
        btn.classList.add('pressed');
        onPress(e);
      }, { passive: false });

      const finish = (e) => {
        if (!this.player) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === activeId) {
            activeId = null;
            btn.classList.remove('pressed');
            onRelease?.();
          }
        }
      };
      btn.addEventListener('touchend', finish, { passive: false });
      btn.addEventListener('touchcancel', finish, { passive: false });
    };

    // Jump button: hold to jump/ascend + quick double-tap (<300ms) toggles Fly Mode (Creative only)
    bindHoldBtn(
      this.btnJump,
      () => {
        const now = performance.now();
        if (this.player.creativeMode && now - this.lastJumpTapTime < 300) {
          const active = this.player.toggleFlyMode();
          this.setFlyActive(active);
          this.callbacks.onStatusToast?.(active ? 'Полёт: ВКЛ (2×Прыжок)' : 'Полёт: ВЫКЛ');
          this.lastJumpTapTime = 0;
        } else {
          this.lastJumpTapTime = now;
        }
        this.player.touchInput.jump = true;
      },
      () => {
        this.player.touchInput.jump = false;
      }
    );

    // Crouch / Descend button
    bindHoldBtn(
      this.btnCrouch,
      () => {
        if (this.player.flyMode) {
          this.player.touchInput.crouch = true;
        } else {
          this.crouchToggled = !this.crouchToggled;
          this.player.touchInput.crouch = this.crouchToggled;
          this.btnCrouch.classList.toggle('active', this.crouchToggled);
        }
      },
      () => {
        if (this.player.flyMode) {
          this.player.touchInput.crouch = false;
        }
      }
    );

    // Dedicated Break / Attack button (instant melee swing/attack + creative/survival break hold)
    bindHoldBtn(
      this.btnBreak,
      () => {
        this.player.touchInput.breakHeld = true;
        this.player.firstPersonHand?.triggerSwing?.();
        this.callbacks.onPrimaryAttack?.();
      },
      () => {
        this.player.touchInput.breakHeld = false;
      }
    );

    // HUD Drop 1 & Drop All quick touch buttons
    const bindSimpleTap = (btn, handler) => {
      if (!btn) return;
      let lastTouch = -99999;
      btn.addEventListener('touchstart', (e) => {
        if (!this.enabled) return;
        e.preventDefault();
        e.stopPropagation();
        lastTouch = performance.now();
        btn.classList.add('pressed');
        setTimeout(() => btn.classList.remove('pressed'), 120);
        handler();
      }, { passive: false });
      btn.addEventListener('mousedown', (e) => {
        if (!this.enabled) return;
        e.preventDefault();
        e.stopPropagation();
        if (performance.now() - lastTouch < 950) return;
        handler();
      });
    };
    bindSimpleTap(this.btnDropOne, () => this.callbacks.onDropOne?.());
    bindSimpleTap(this.btnDropAll, () => this.callbacks.onDropAll?.());

    // Dedicated Place / Eat-Hold button
    bindHoldBtn(
      this.btnPlace,
      () => {
        this.player.touchInput.useHeld = true;
        this.player.triggerPlaceAction();
      },
      () => {
        this.player.touchInput.useHeld = false;
        this.player.stopEating?.();
      }
    );

    // Fly quick toggle button
    if (this.btnFly) {
      this.btnFly.addEventListener('touchstart', (e) => {
        if (!this.enabled || !this.player) return;
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

    if (mag < 0.16) {
      this.player.touchInput.moveX = 0;
      this.player.touchInput.moveZ = 0;
      this.player.touchInput.sprint = false;
      this.inCenterSincePush = true;
      this.sprintLocked = false;
      this.joystickBase?.classList.remove('sprinting');
      return;
    }

    this.player.touchInput.moveX = normX;
    this.player.touchInput.moveZ = normZ;

    // Detect double-push forward without lifting finger (forward -> neutral -> forward within 380ms)
    const now = performance.now();
    if (normZ > 0.52) {
      if (this.inCenterSincePush && now - this.lastForwardPeakTime < 380) {
        this.sprintLocked = true;
      }
      this.inCenterSincePush = false;
      this.lastForwardPeakTime = now;
    } else if (normZ < 0.22) {
      this.inCenterSincePush = true;
      this.sprintLocked = false;
    }

    // Never auto-sprint on single push; require explicit double-tap/double-push forward!
    const isForwardPush = normZ > 0.42;
    const activeSprint = isForwardPush && this.sprintLocked;
    this.player.touchInput.sprint = activeSprint;
    this.joystickBase?.classList.toggle('sprinting', activeSprint);
  }

  dispose() {
    clearTimeout(this.longPressTimer);
    window.removeEventListener('touchmove', this._onTouchMove);
    window.removeEventListener('touchend', this._onTouchEnd);
    window.removeEventListener('touchcancel', this._onTouchEnd);
  }
}
