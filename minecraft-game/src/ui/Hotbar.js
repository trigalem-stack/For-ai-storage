import { BLOCK_IDS, BlockRegistry } from '../blocks/BlockRegistry.js';
import { HOTBAR_SIZE, MAX_STACK_SIZE } from '../constants.js';

export class Hotbar {
  constructor(atlas, options = {}) {
    this.atlas = atlas;
    this.onChange = options.onChange || null;
    this.slots = new Array(HOTBAR_SIZE).fill(null);
    this.selectedIndex = 0;

    this.container = document.getElementById('hotbar');
    this.itemLabelEl = document.getElementById('hotbar-item-name');
    this.slotEls = [];
    this.labelTimer = null;

    this._initStarterKit();
    this._buildDom();
    this._bindInput();
    this.render();
  }

  _initStarterKit() {
    this.slots = [
      { id: BLOCK_IDS.COBBLESTONE, count: 64 },
      { id: BLOCK_IDS.OAK_PLANKS, count: 64 },
      { id: BLOCK_IDS.DIRT, count: 64 },
      { id: BLOCK_IDS.OAK_LOG, count: 64 },
      { id: BLOCK_IDS.SAND, count: 64 },
      { id: BLOCK_IDS.OAK_LEAVES, count: 32 },
      null,
      null,
      null,
    ];
    this.selectedIndex = 0;
  }

  resetStarterKit() {
    this._initStarterKit();
    this.render();
    this.onChange?.(this.getSelectedSlot(), true);
  }

  loadState(savedHotbar) {
    if (!savedHotbar || !Array.isArray(savedHotbar.slots)) return;
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const s = savedHotbar.slots[i];
      if (s && s.id > 0 && s.count > 0) {
        this.slots[i] = { id: s.id, count: Math.min(MAX_STACK_SIZE, s.count) };
      } else {
        this.slots[i] = null;
      }
    }
    if (Number.isFinite(savedHotbar.selectedIndex)) {
      this.selectedIndex = Math.max(0, Math.min(HOTBAR_SIZE - 1, savedHotbar.selectedIndex | 0));
    }
    this.render();
    this.onChange?.(this.getSelectedSlot(), false);
  }

  exportState() {
    return {
      selectedIndex: this.selectedIndex,
      slots: this.slots.map((s) => (s ? { id: s.id, count: s.count } : null)),
    };
  }

  getSelectedSlot() {
    return this.slots[this.selectedIndex] || null;
  }

  selectSlot(index) {
    const next = ((index % HOTBAR_SIZE) + HOTBAR_SIZE) % HOTBAR_SIZE;
    this.selectedIndex = next;
    this.render();
    this._showSelectedName();
    this.onChange?.(this.getSelectedSlot(), true);
  }

  canAccept(blockId) {
    if (!blockId) return false;
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const s = this.slots[i];
      if (!s) return true;
      if (s.id === blockId && s.count < MAX_STACK_SIZE) return true;
    }
    return false;
  }

  /**
   * Adds picked-up block items into matching stacks first, then empty slots.
   * Returns leftover count that did not fit.
   */
  addItem(blockId, amount = 1) {
    if (!blockId || amount <= 0) return amount;
    let remaining = amount;

    for (let i = 0; i < HOTBAR_SIZE && remaining > 0; i++) {
      const s = this.slots[i];
      if (s && s.id === blockId && s.count < MAX_STACK_SIZE) {
        const add = Math.min(MAX_STACK_SIZE - s.count, remaining);
        s.count += add;
        remaining -= add;
      }
    }

    for (let i = 0; i < HOTBAR_SIZE && remaining > 0; i++) {
      if (!this.slots[i]) {
        const add = Math.min(MAX_STACK_SIZE, remaining);
        this.slots[i] = { id: blockId, count: add };
        remaining -= add;
      }
    }

    if (remaining !== amount) {
      this.render();
      this.onChange?.(this.getSelectedSlot(), true);
    }
    return remaining;
  }

  consumeSelected(amount = 1) {
    const slot = this.slots[this.selectedIndex];
    if (!slot || slot.count < amount) return false;
    slot.count -= amount;
    if (slot.count <= 0) {
      this.slots[this.selectedIndex] = null;
    }
    this.render();
    this.onChange?.(this.getSelectedSlot(), true);
    return true;
  }

  _showSelectedName() {
    if (!this.itemLabelEl) return;
    const slot = this.getSelectedSlot();
    if (!slot) {
      this.itemLabelEl.classList.add('hidden');
      return;
    }
    const def = BlockRegistry.get(slot.id);
    this.itemLabelEl.textContent = def.name;
    this.itemLabelEl.classList.remove('hidden');
    clearTimeout(this.labelTimer);
    this.labelTimer = setTimeout(() => {
      this.itemLabelEl?.classList.add('hidden');
    }, 1500);
  }

  _buildDom() {
    if (!this.container) return;
    this.container.innerHTML = '';
    this.slotEls = [];

    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'hotbar-slot';
      btn.dataset.slotIndex = String(i);
      btn.setAttribute('aria-label', `Слот ${i + 1}`);

      const icon = document.createElement('img');
      icon.className = 'hotbar-icon hidden';
      icon.alt = '';
      icon.draggable = false;

      const count = document.createElement('span');
      count.className = 'hotbar-count hidden';

      btn.append(icon, count);
      this.container.appendChild(btn);
      this.slotEls.push({ btn, icon, count });

      const pickSlot = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.selectSlot(i);
      };
      btn.addEventListener('touchstart', pickSlot, { passive: false });
      btn.addEventListener('mousedown', pickSlot);
    }
  }

  _bindInput() {
    this._onKeyDown = (e) => {
      if (e.code.startsWith('Digit')) {
        const n = parseInt(e.code.slice(5), 10);
        if (n >= 1 && n <= HOTBAR_SIZE) {
          this.selectSlot(n - 1);
        }
      }
    };

    this._onWheel = (e) => {
      if (document.pointerLockElement && Math.abs(e.deltaY) > 0) {
        const dir = e.deltaY > 0 ? 1 : -1;
        this.selectSlot(this.selectedIndex + dir);
      }
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('wheel', this._onWheel, { passive: true });
  }

  render() {
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const ui = this.slotEls[i];
      if (!ui) continue;
      ui.btn.classList.toggle('selected', i === this.selectedIndex);

      const slot = this.slots[i];
      if (slot && slot.id > 0 && slot.count > 0) {
        const def = BlockRegistry.get(slot.id);
        ui.icon.src = this.atlas.getBlockIconDataURL(def);
        ui.icon.classList.remove('hidden');
        ui.count.textContent = slot.count > 1 ? String(slot.count) : '';
        ui.count.classList.toggle('hidden', slot.count <= 1);
      } else {
        ui.icon.classList.add('hidden');
        ui.count.classList.add('hidden');
      }
    }
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('wheel', this._onWheel);
  }
}
