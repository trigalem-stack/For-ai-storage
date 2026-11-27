// PojavLauncher-style Virtual Mouse Cursor for Mobile Devices:
// - Pixel-crisp arrow pointer (`ic_mouse_pointer` style)
// - Auto-activates inside Inventory/Crafting/Furnace/Chest GUIs on touch devices
// - Touchpad drag anywhere on the overlay moves the pointer across the screen (1.45x reach)
// - Dedicated PRI (LMB), SEC (RMB) with hold-drag support, Shift-modifier, and Drop (Q) buttons

export class VirtualMouse {
  constructor(callbacks = {}) {
    this.callbacks = callbacks;
    this.enabled = false;
    this.touchDevice = Boolean(callbacks.isTouchDevice || callbacks.touchMode || false);
    this.guiOpen = false;
    this.manualActive = false;

    this.x = Math.round(window.innerWidth * 0.5);
    this.y = Math.round(window.innerHeight * 0.5);
    this.shiftHeld = false;
    this.activeButton = -1; // -1 none, 0 PRI (LMB), 2 SEC (RMB)

    this.cursorEl = document.getElementById('virtual-cursor');
    this.barEl = document.getElementById('vm-action-bar');

    this.btnPri = document.getElementById('vm-btn-pri');
    this.btnSec = document.getElementById('vm-btn-sec');
    this.btnShift = document.getElementById('vm-btn-shift');
    this.btnDrop = document.getElementById('vm-btn-drop');

    this._dragTouchId = null;
    this._dragLastX = 0;
    this._dragLastY = 0;
    this._dragTotalDist = 0;
    this._hoveredEl = null;
    this._downTarget = null;
    this._downPos = { x: 0, y: 0 };

    this._bindEvents();
    this._syncState();
  }

  setTouchDevice(isTouch) {
    this.setTouchMode(isTouch);
  }

  setTouchMode(isTouch) {
    this.touchDevice = Boolean(isTouch);
    this._syncState();
  }

  setGuiOpen(isOpen) {
    this.guiOpen = Boolean(isOpen);
    if (this.guiOpen) {
      this.x = Math.round(window.innerWidth * 0.5);
      this.y = Math.round(window.innerHeight * 0.45);
    } else {
      this.manualActive = false;
    }
    this._syncState();
  }

  toggleManual() {
    this.manualActive = !this.manualActive;
    this._syncState();
    return this.enabled;
  }

  _syncState() {
    const shouldShow = this.touchDevice && (this.guiOpen || this.manualActive);
    this.enabled = shouldShow;
    this.cursorEl?.classList.toggle('hidden', !shouldShow);
    this.barEl?.classList.toggle('hidden', !shouldShow);
    if (shouldShow) {
      this._updatePosition(this.x, this.y);
    } else {
      this._releaseActiveButton();
      this._clearHover();
      this.shiftHeld = false;
      this.btnShift?.classList.remove('active');
    }
  }

  _releaseActiveButton() {
    if (this.activeButton === -1) return;
    const btn = this.activeButton;
    this.activeButton = -1;
    this.btnPri?.classList.remove('pressed');
    this.btnSec?.classList.remove('pressed');
    const curTarget = this._elementAtPointer();
    this.callbacks.onPointerUp?.(btn, this.x, this.y, this.shiftHeld, curTarget);
    this._downTarget = null;
  }

  _clearHover() {
    if (this._hoveredEl) {
      this._hoveredEl.classList.remove('vm-hover');
      this._hoveredEl = null;
    }
  }

  _updatePosition(nx, ny) {
    this.x = Math.max(2, Math.min(window.innerWidth - 4, nx));
    this.y = Math.max(2, Math.min(window.innerHeight - 4, ny));

    if (this.cursorEl) {
      this.cursorEl.style.left = `${this.x}px`;
      this.cursorEl.style.top = `${this.y}px`;
    }

    const under = this._elementAtPointer();
    const hoverTarget = under?.closest?.(
      '.inv-slot, .recipe-book-item, .inv-creative-item, .inv-cat-btn, .inv-creative-scrollbar, .mc-menu-btn, .mc-hud-btn'
    ) || null;
    if (hoverTarget !== this._hoveredEl) {
      this._clearHover();
      if (hoverTarget) {
        this._hoveredEl = hoverTarget;
        hoverTarget.classList.add('vm-hover');
      }
    }
    this.callbacks.onPointerMove?.(this.x, this.y, this._hoveredEl || under, this.activeButton);
  }

  _elementAtPointer() {
    const direct = document.elementFromPoint(this.x, this.y);
    const interactiveSel = '.inv-slot, .recipe-book-item, .inv-creative-item, .inv-cat-btn, .inv-creative-scrollbar, .inv-creative-thumb, button';
    if (direct?.closest?.(interactiveSel)) return direct;
    // Probe +-3px offsets so 2px grid gaps between slots never drop clicks/drags
    const offsets = [[3, 0], [-3, 0], [0, 3], [0, -3]];
    for (const [ox, oy] of offsets) {
      const probe = document.elementFromPoint(this.x + ox, this.y + oy);
      if (probe?.closest?.('.inv-slot, .inv-creative-item, .recipe-book-item')) {
        return probe;
      }
    }
    return direct || null;
  }

  _dispatchPointerDown(button = 0) {
    const rawTarget = this._elementAtPointer();
    const target = rawTarget?.closest?.(
      '.inv-slot, .recipe-book-item, .inv-creative-item, .inv-cat-btn, .inv-creative-scrollbar, .inv-creative-thumb, button'
    ) || rawTarget;
    this._downTarget = target;
    this._downPos = { x: this.x, y: this.y };
    this.activeButton = button;

    if (!target) return;

    if (this.callbacks.onPointerDown) {
      const handled = this.callbacks.onPointerDown(button, this.x, this.y, this.shiftHeld, target);
      if (handled) return;
    }

    if (target.classList?.contains('inv-slot')) {
      this.callbacks.onSlotVirtualClick?.(
        target.dataset.zone,
        Number(target.dataset.index),
        button,
        this.shiftHeld,
        this.x,
        this.y
      );
      return;
    }

    if (!target.closest?.('.inv-creative-scrollbar')) {
      target.click?.();
    }
  }

  _dispatchPointerUp(button = 0) {
    const downTarget = this._downTarget;
    const moved = Math.hypot(this.x - this._downPos.x, this.y - this._downPos.y);
    const curTarget = this._elementAtPointer();
    if (this.activeButton === button) {
      this.activeButton = -1;
    }
    this._downTarget = null;

    if (this.callbacks.onPointerUp) {
      this.callbacks.onPointerUp(button, this.x, this.y, this.shiftHeld, curTarget);
    }

    if (
      button === 0 &&
      moved < 10 &&
      downTarget &&
      !downTarget.classList?.contains('inv-slot') &&
      !downTarget.closest?.('.inv-creative-scrollbar') &&
      this.callbacks.onPointerDown
    ) {
      const btnEl = downTarget.closest?.('.recipe-book-item, .inv-creative-item, .inv-cat-btn, button');
      btnEl?.click?.();
    }
  }

  _bindEvents() {
    const bindFastTap = (el, handler) => {
      if (!el) return;
      let lastTouchAt = -99999;
      el.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        lastTouchAt = performance.now();
        handler(e);
      }, { passive: false });
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (performance.now() - lastTouchAt < 950) return;
        handler(e);
      });
    };

    const bindHoldButton = (el, button) => {
      if (!el) return;
      let lastTouchAt = -99999;
      let holding = false;
      let activeTouchId = null;

      const onDown = (e, fromTouch) => {
        e.preventDefault();
        e.stopPropagation();
        const now = performance.now();
        if (fromTouch) {
          lastTouchAt = now;
          const t = e.changedTouches?.[0];
          activeTouchId = t ? t.identifier : null;
        } else if (now - lastTouchAt < 950) {
          return;
        }
        if (holding) return;
        holding = true;
        el.classList.add('pressed');
        this._dispatchPointerDown(button);
      };

      const onUp = (e, fromTouch) => {
        if (fromTouch) {
          lastTouchAt = performance.now();
          if (activeTouchId !== null && e?.changedTouches) {
            let found = false;
            for (let i = 0; i < e.changedTouches.length; i++) {
              if (e.changedTouches[i].identifier === activeTouchId) {
                found = true;
                break;
              }
            }
            if (!found) return;
          }
          activeTouchId = null;
        } else if (performance.now() - lastTouchAt < 950) {
          return;
        }
        if (!holding) return;
        e?.preventDefault?.();
        e?.stopPropagation?.();
        holding = false;
        el.classList.remove('pressed');
        this._dispatchPointerUp(button);
      };

      el.addEventListener('touchstart', (e) => onDown(e, true), { passive: false });
      el.addEventListener('touchend', (e) => onUp(e, true), { passive: false });
      el.addEventListener('touchcancel', (e) => onUp(e, true), { passive: false });
      el.addEventListener('mousedown', (e) => onDown(e, false));
      el.addEventListener('mouseup', (e) => onUp(e, false));
      window.addEventListener('mouseup', (e) => onUp(e, false));
      window.addEventListener('blur', () => {
        if (!holding) return;
        holding = false;
        activeTouchId = null;
        el.classList.remove('pressed');
        this._dispatchPointerUp(button);
      });
    };

    bindHoldButton(this.btnPri, 0);
    bindHoldButton(this.btnSec, 2);

    bindFastTap(this.btnShift, () => {
      this.shiftHeld = !this.shiftHeld;
      this.btnShift?.classList.toggle('active', this.shiftHeld);
    });

    bindFastTap(this.btnDrop, () => {
      this.btnDrop?.classList.add('pressed');
      setTimeout(() => this.btnDrop?.classList.remove('pressed'), 110);
      const rawTarget = this._elementAtPointer();
      const slot = rawTarget?.closest?.('.inv-slot');
      this.callbacks.onVirtualDrop?.(slot ? slot.dataset.zone : null, slot ? Number(slot.dataset.index) : -1);
    });

    // Touchpad pointer movement inside GUI or whenever Virtual Mouse is active
    window.addEventListener('touchstart', (e) => {
      if (!this.enabled) return;
      if (e.target.closest?.('#vm-action-bar, #hud-top-right')) return;
      if (!this.guiOpen && !this.manualActive) return;
      if (this._dragTouchId !== null) return;
      const t = e.changedTouches[0];
      if (!t) return;
      this._dragTouchId = t.identifier;
      this._dragLastX = t.clientX;
      this._dragLastY = t.clientY;
      this._dragTotalDist = 0;
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (!this.enabled || this._dragTouchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === this._dragTouchId) {
          const dx = t.clientX - this._dragLastX;
          const dy = t.clientY - this._dragLastY;
          this._dragLastX = t.clientX;
          this._dragLastY = t.clientY;
          this._dragTotalDist += Math.hypot(dx, dy);
          if (this._dragTotalDist > 4) {
            this._updatePosition(this.x + dx * 1.45, this.y + dy * 1.45);
            if (this.guiOpen) e.preventDefault();
          }
        }
      }
    }, { passive: false });

    const endDrag = (e) => {
      if (this._dragTouchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === this._dragTouchId) {
          const moved = this._dragTotalDist;
          this._dragTouchId = null;
          if (this.enabled && !this.guiOpen && moved < 8 && !e.target.closest?.('#vm-action-bar')) {
            this._dispatchPointerDown(0);
            this._dispatchPointerUp(0);
          }
        }
      }
    };
    window.addEventListener('touchend', endDrag, { passive: true });
    window.addEventListener('touchcancel', endDrag, { passive: true });
  }
}
