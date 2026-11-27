import { BLOCK_IDS, BlockRegistry } from '../blocks/BlockRegistry.js';
import { HOTBAR_SIZE, MAX_STACK_SIZE } from '../constants.js';

export class Hotbar {
  constructor(atlas, options = {}) {
    this.atlas = atlas;
    this.onChange = options.onChange || null;
    this.creativeMode = options.creativeMode !== undefined ? Boolean(options.creativeMode) : true;
    this.slots = new Array(HOTBAR_SIZE).fill(null);
    this.selectedIndex = 0;

    this.container = document.getElementById('hotbar');
    this.itemLabelEl = document.getElementById('hotbar-item-name');
    this.paletteBtn = document.getElementById('btn-creative-palette');
    this.paletteOverlay = document.getElementById('creative-palette-overlay');
    this.paletteGrid = document.getElementById('creative-palette-grid');
    this.paletteCloseBtn = document.getElementById('btn-close-palette');

    this.slotEls = [];
    this.labelTimer = null;
    this.paletteOpen = false;
    this.onPaletteToggle = options.onPaletteToggle || null;

    this._initStarterKit();
    this._buildDom();
    this._buildCreativePalette();
    this._bindInput();
    this.render();
  }

  _initStarterKit() {
    this.slots = [
      { id: BLOCK_IDS.COBBLESTONE, count: 64 },
      { id: BLOCK_IDS.OAK_PLANKS, count: 64 },
      { id: BLOCK_IDS.TORCH, count: 64 },
      { id: BLOCK_IDS.GLOWSTONE, count: 64 },
      { id: BLOCK_IDS.JACK_O_LANTERN, count: 64 },
      { id: BLOCK_IDS.BED_FOOT, count: 64 },
      { id: BLOCK_IDS.SAND, count: 64 },
      { id: BLOCK_IDS.DANDELION, count: 64 },
      { id: BLOCK_IDS.REDSTONE_ORE, count: 64 },
    ];
    this.selectedIndex = 0;
  }

  resetStarterKit() {
    this._initStarterKit();
    this.render();
    this.onChange?.(this.getSelectedSlot(), true);
  }

  setCreativeMode(enabled) {
    this.creativeMode = Boolean(enabled);
    this.render();
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

  setSlotBlock(blockId, index = this.selectedIndex) {
    const slotIdx = Math.max(0, Math.min(HOTBAR_SIZE - 1, index));
    if (!blockId || blockId <= 0) {
      this.slots[slotIdx] = null;
    } else {
      this.slots[slotIdx] = { id: blockId, count: MAX_STACK_SIZE };
    }
    this.selectedIndex = slotIdx;
    this.render();
    this._showSelectedName();
    this.onChange?.(this.getSelectedSlot(), true);
  }

  pickBlock(blockId) {
    if (!blockId || blockId <= 0) return;
    const existingIdx = this.slots.findIndex((s) => s && s.id === blockId);
    if (existingIdx >= 0) {
      this.selectSlot(existingIdx);
      return;
    }
    this.setSlotBlock(blockId, this.selectedIndex);
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

  /**
   * Consumes item from selected slot. In Creative mode blocks are infinite unless force=true.
   */
  consumeSelected(amount = 1, force = false) {
    const slot = this.slots[this.selectedIndex];
    if (!slot || slot.count <= 0) return false;
    if (this.creativeMode && !force) return true;
    if (slot.count < amount) return false;
    slot.count -= amount;
    if (slot.count <= 0) {
      this.slots[this.selectedIndex] = null;
    }
    this.render();
    this.onChange?.(this.getSelectedSlot(), true);
    return true;
  }

  togglePalette(forceState) {
    if (!this.paletteOverlay) return false;
    const next = forceState !== undefined ? Boolean(forceState) : !this.paletteOpen;
    this.paletteOpen = next;
    this.paletteOverlay.classList.toggle('hidden', !next);
    this.onPaletteToggle?.(next);
    return next;
  }

  _buildCreativePalette() {
    if (!this.paletteGrid) return;
    this.paletteGrid.innerHTML = '';
    const blocks = BlockRegistry.getPlaceableBlocks();
    for (const def of blocks) {
      const itemBtn = document.createElement('button');
      itemBtn.type = 'button';
      itemBtn.className = 'palette-block-btn';
      itemBtn.title = def.name;

      const img = document.createElement('img');
      img.src = this.atlas.getBlockIconDataURL(def);
      img.alt = def.name;
      img.draggable = false;

      const label = document.createElement('span');
      label.textContent = def.name;

      itemBtn.append(img, label);
      itemBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setSlotBlock(def.id, this.selectedIndex);
        this.togglePalette(false);
      });
      this.paletteGrid.appendChild(itemBtn);
    }

    this.paletteCloseBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.togglePalette(false);
    });
    this.paletteBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.togglePalette();
    });
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
      } else if (e.code === 'KeyE' && !e.repeat) {
        this.togglePalette();
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
        const showCount = !this.creativeMode && slot.count > 1;
        ui.count.textContent = showCount ? String(slot.count) : '';
        ui.count.classList.toggle('hidden', !showCount);
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
