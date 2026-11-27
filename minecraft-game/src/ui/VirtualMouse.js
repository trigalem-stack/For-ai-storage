// PojavLauncher-style Virtual Mouse Cursor for Mobile Devices:
// - Pixel-crisp arrow pointer (`ic_mouse_pointer` style)
// - Auto-activates inside Inventory/Crafting/Furnace/Chest GUIs on touch devices, plus manual toggle button
// - Touchpad drag anywhere on the overlay moves the pointer across the screen (1.45x reach)
// - Dedicated PRI (LMB), SEC (RMB), Shift-modifier, and Drop (Q) buttons matching PojavLauncher ergonomics

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

    this.cursorEl = document.getElementById('virtual-cursor');
    this.barEl = document.getElementById('vm-action-bar');
    this.toggleBtn = document.getElementById('btn-touch-mouse');

    this.btnPri = document.getElementById('vm-btn-pri');
    this.btnSec = document.getElementById('vm-btn-sec');
    this.btnShift = document.getElementById('vm-btn-shift');
    this.btnDrop = document.getElementById('vm-btn-drop');

    this._dragTouchId = null;
    this._dragLastX = 0;
    this._dragLastY = 0;
    this._dragTotalDist = 0;
    this._hoveredEl = null;

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
    this.toggleBtn?.classList.toggle('hidden', !this.touchDevice);
    this.toggleBtn?.classList.toggle('active', this.manualActive || this.guiOpen);
    if (shouldShow) {
      this._updatePosition(this.x, this.y);
    } else {
      this._clearHover();
      this.shiftHeld = false;
      this.btnShift?.classList.remove('active');
    }
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
    if (under !== this._hoveredEl) {
      this._clearHover();
      const slotBtn = under?.closest?.('.inv-slot, .recipe-book-item, .inv-creative-item, .mc-menu-btn, .mc-hud-btn');
      if (slotBtn) {
        this._hoveredEl = slotBtn;
        slotBtn.classList.add('vm-hover');
      }
    }
    this.callbacks.onPointerMove?.(this.x, this.y, this._hoveredEl);
  }

  _elementAtPointer() {
    const el = document.elementFromPoint(this.x, this.y);
    return el || null;
  }

  _dispatchClick(button = 0) {
    const rawTarget = this._elementAtPointer();
    const target = rawTarget?.closest?.('.inv-slot, .recipe-book-item, .inv-creative-item, button') || rawTarget;
    if (!target) return;

    if (target.classList?.contains('inv-slot')) {
      this.callbacks.onSlotVirtualClick?.(target.dataset.zone, Number(target.dataset.index), button, this.shiftHeld, this.x, this.y);
      return;
    }

    // Regular UI button (Close, Recipe item, Creative item, Tabs)
    target.click?.();
  }

  _bindEvents() {
    const bindFastTap = (el, handler) => {
      if (!el) return;
      let lastFire = 0;
      const run = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const now = performance.now();
        if (now - lastFire < 45) return;
        lastFire = now;
        handler(e);
      };
      el.addEventListener('touchstart', run, { passive: false });
      el.addEventListener('mousedown', run);
    };

    bindFastTap(this.toggleBtn, () => {
      const on = this.toggleManual();
      this.callbacks.onStatusToast?.(on ? 'Виртуальная мышь: ВКЛ' : 'Виртуальная мышь: ВЫКЛ');
    });

    bindFastTap(this.btnPri, () => {
      this.btnPri?.classList.add('pressed');
      setTimeout(() => this.btnPri?.classList.remove('pressed'), 110);
      this._dispatchClick(0);
    });

    bindFastTap(this.btnSec, () => {
      this.btnSec?.classList.add('pressed');
      setTimeout(() => this.btnSec?.classList.remove('pressed'), 110);
      this._dispatchClick(2);
    });

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
      if (e.target.closest?.('#vm-action-bar, #btn-touch-mouse, #hud-top-right')) return;
      // Only handle drag on inventory/menus or manual mouse mode (never steal game joystick/look when not enabled)
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
          // If manual mouse outside GUI & tapped lightly without dragging, click at cursor
          if (this.enabled && !this.guiOpen && moved < 8 && !e.target.closest?.('#vm-action-bar, #btn-touch-mouse')) {
            this._dispatchClick(0);
          }
        }
      }
    };
    window.addEventListener('touchend', endDrag, { passive: true });
    window.addEventListener('touchcancel', endDrag, { passive: true });
  }
}
