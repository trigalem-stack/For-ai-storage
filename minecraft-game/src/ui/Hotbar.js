import { BLOCK_IDS, BlockRegistry } from '../blocks/BlockRegistry.js';
import { HOTBAR_SIZE, MAX_STACK_DEFAULT } from '../constants.js';
import { Inventory } from '../items/Inventory.js';
import { ItemRegistry } from '../items/ItemRegistry.js';

export function getDurabilityColor(ratio) {
  if (ratio > 0.6) return '#42e042';
  if (ratio > 0.25) return '#f2d438';
  return '#e83838';
}

export class Hotbar {
  constructor(atlas, options = {}) {
    this.atlas = atlas;
    this.onChange = options.onChange || null;
    this.onInventoryToggle = options.onInventoryToggle || null;
    this.onPaletteToggle = options.onPaletteToggle || null;
    this.disableHotbarKeyE = Boolean(options.disableHotbarKeyE);

    const defaultCreative = options.creativeMode !== undefined ? Boolean(options.creativeMode) : true;
    this.inventory = options.inventory || new Inventory({ creativeMode: defaultCreative });
    this.inventory.onChange = () => {
      this.render();
      this.onChange?.(this.getSelectedSlot(), true);
    };
    this._slotsProxy = new Proxy(this.inventory.slots, {
      get: (target, prop) => {
        if (prop === 'length') return HOTBAR_SIZE;
        if (typeof prop === 'string' && /^\d+$/.test(prop)) {
          const i = Number(prop);
          return i < HOTBAR_SIZE ? target[i] : undefined;
        }
        if (
          prop === 'slice' || prop === 'map' || prop === 'findIndex' || prop === 'find' ||
          prop === 'forEach' || prop === 'some' || prop === 'every' || prop === 'filter' ||
          prop === Symbol.iterator
        ) {
          const sub = target.slice(0, HOTBAR_SIZE);
          const val = sub[prop];
          return typeof val === 'function' ? val.bind(sub) : val;
        }
        const val = target[prop];
        return typeof val === 'function' ? val.bind(target) : val;
      },
      set: (target, prop, value) => {
        if (typeof prop === 'string' && /^\d+$/.test(prop)) {
          const i = Number(prop);
          if (i < HOTBAR_SIZE) {
            target[i] = value;
          }
          return true;
        }
        target[prop] = value;
        return true;
      },
    });

    this.container = document.getElementById('hotbar');
    this.itemLabelEl = document.getElementById('hotbar-item-name');
    this.paletteBtn = document.getElementById('btn-creative-palette');
    this.paletteOverlay = document.getElementById('creative-palette-overlay');
    this.paletteGrid = document.getElementById('creative-palette-grid');
    this.paletteCloseBtn = document.getElementById('btn-close-palette');

    this.slotEls = [];
    this.labelTimer = null;
    this.paletteOpen = false;

    if (options.initStarter !== false && !options.inventory) {
      this._initStarterKit();
    }
    this._buildDom();
    this._buildCreativePalette();
    this._bindInput();
    this.render();
  }

  get slots() {
    return this._slotsProxy;
  }

  get selectedIndex() {
    return this.inventory.selectedSlot;
  }

  set selectedIndex(val) {
    this.inventory.selectedSlot = ((val % HOTBAR_SIZE) + HOTBAR_SIZE) % HOTBAR_SIZE;
  }

  get creativeMode() {
    return this.inventory.creativeMode;
  }

  set creativeMode(val) {
    this.inventory.creativeMode = Boolean(val);
  }

  _initStarterKit() {
    const starterIds = [
      BLOCK_IDS.COBBLESTONE,
      BLOCK_IDS.OAK_PLANKS,
      BLOCK_IDS.TORCH,
      BLOCK_IDS.GLOWSTONE,
      BLOCK_IDS.JACK_O_LANTERN,
      BLOCK_IDS.BED_FOOT,
      BLOCK_IDS.SAND,
      BLOCK_IDS.DANDELION,
      BLOCK_IDS.REDSTONE_ORE,
    ];
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      this.inventory.slots[i] = ItemRegistry.createStack(starterIds[i], MAX_STACK_DEFAULT);
    }
    this.inventory.selectedSlot = 0;
  }

  resetStarterKit() {
    this._initStarterKit();
    this.render();
    this.onChange?.(this.getSelectedSlot(), true);
  }

  setCreativeMode(enabled) {
    this.inventory.creativeMode = Boolean(enabled);
    this.render();
  }

  loadState(savedHotbar) {
    if (!savedHotbar || !Array.isArray(savedHotbar.slots)) return;
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const s = savedHotbar.slots[i];
      if (s && s.id > 0 && s.count > 0) {
        this.inventory.slots[i] = ItemRegistry.createStack(
          s.id,
          s.count,
          s.maxDurability > 0 ? s.durability : null,
          s.meta || 0
        );
      } else {
        this.inventory.slots[i] = null;
      }
    }
    if (Number.isFinite(savedHotbar.selectedIndex)) {
      this.inventory.selectedSlot = Math.max(0, Math.min(HOTBAR_SIZE - 1, savedHotbar.selectedIndex | 0));
    }
    this.render();
    this.onChange?.(this.getSelectedSlot(), false);
  }

  exportState() {
    return {
      selectedIndex: this.inventory.selectedSlot,
      slots: this.slots.map((s) => (s ? { id: s.id, count: s.count, durability: s.durability || 0, maxDurability: s.maxDurability || 0 } : null)),
    };
  }

  getSelectedSlot() {
    return this.inventory.getHeldStack();
  }

  selectSlot(index) {
    const next = ((index % HOTBAR_SIZE) + HOTBAR_SIZE) % HOTBAR_SIZE;
    this.inventory.selectedSlot = next;
    this.render();
    this._showSelectedName();
    this.onChange?.(this.getSelectedSlot(), true);
  }

  setSlotBlock(itemId, index = this.inventory.selectedSlot) {
    const slotIdx = Math.max(0, Math.min(HOTBAR_SIZE - 1, index));
    if (!itemId || itemId <= 0) {
      this.inventory.slots[slotIdx] = null;
    } else {
      const maxS = ItemRegistry.getMaxStack(itemId);
      this.inventory.slots[slotIdx] = ItemRegistry.createStack(itemId, maxS);
    }
    this.inventory.selectedSlot = slotIdx;
    this.render();
    this._showSelectedName();
    this.onChange?.(this.getSelectedSlot(), true);
  }

  pickBlock(blockId) {
    if (!blockId || blockId <= 0) return;
    const existingIdx = this.inventory.slots.slice(0, HOTBAR_SIZE).findIndex((s) => s && s.id === blockId);
    if (existingIdx >= 0) {
      this.selectSlot(existingIdx);
      return;
    }
    // In Survival, look inside full inventory and swap into active slot
    if (!this.inventory.creativeMode) {
      const invIdx = this.inventory.slots.findIndex((s) => s && s.id === blockId);
      if (invIdx >= HOTBAR_SIZE) {
        const tmp = this.inventory.slots[this.inventory.selectedSlot];
        this.inventory.slots[this.inventory.selectedSlot] = this.inventory.slots[invIdx];
        this.inventory.slots[invIdx] = tmp;
        this.render();
        this._showSelectedName();
        this.onChange?.(this.getSelectedSlot(), true);
      }
      return;
    }
    this.setSlotBlock(blockId, this.inventory.selectedSlot);
  }

  canAccept(itemId, count = 1, durability = 0) {
    return this.inventory.canAccept(itemId, count, durability);
  }

  addItem(itemId, amount = 1, durability = null, meta = 0) {
    const rem = this.inventory.addItem(itemId, amount, durability, meta);
    if (rem !== amount) {
      this.render();
      this.onChange?.(this.getSelectedSlot(), true);
    }
    return rem;
  }

  consumeSelected(amount = 1, force = false) {
    const slot = this.inventory.slots[this.inventory.selectedSlot];
    if (!slot || slot.count <= 0) return false;
    if (this.inventory.creativeMode && !force) return true;
    if (slot.count < amount) return false;
    slot.count -= amount;
    if (slot.count <= 0) {
      this.inventory.slots[this.inventory.selectedSlot] = null;
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
    const allItems = ItemRegistry.getAllItems();
    const combined = [
      ...blocks.map((b) => ({ id: b.id, name: b.name })),
      ...allItems.map((it) => ({ id: it.id, name: it.name })),
    ];
    for (const entry of combined) {
      const itemBtn = document.createElement('button');
      itemBtn.type = 'button';
      itemBtn.className = 'palette-block-btn';
      itemBtn.title = entry.name;

      const img = document.createElement('img');
      img.src = this.atlas.getItemIconDataURL(entry.id);
      img.alt = entry.name;
      img.draggable = false;

      const label = document.createElement('span');
      label.textContent = entry.name;

      itemBtn.append(img, label);
      itemBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setSlotBlock(entry.id, this.inventory.selectedSlot);
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
      if (this.onInventoryToggle) {
        this.onInventoryToggle();
      } else {
        this.togglePalette();
      }
    });
  }

  _showSelectedName() {
    if (!this.itemLabelEl) return;
    const slot = this.getSelectedSlot();
    if (!slot) {
      this.itemLabelEl.classList.add('hidden');
      return;
    }
    this.itemLabelEl.textContent = ItemRegistry.getName(slot.id);
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

      const durBar = document.createElement('div');
      durBar.className = 'slot-durability hidden';
      const durFill = document.createElement('div');
      durFill.className = 'slot-durability-fill';
      durBar.appendChild(durFill);

      btn.append(icon, count, durBar);
      this.container.appendChild(btn);
      this.slotEls.push({ btn, icon, count, durBar, durFill });

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
      } else if (e.code === 'KeyE' && !e.repeat && !this.disableHotbarKeyE) {
        if (this.onInventoryToggle) {
          this.onInventoryToggle();
        } else {
          this.togglePalette();
        }
      }
    };

    this._onWheel = (e) => {
      if (document.pointerLockElement && Math.abs(e.deltaY) > 0) {
        const dir = e.deltaY > 0 ? 1 : -1;
        this.selectSlot(this.inventory.selectedSlot + dir);
      }
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('wheel', this._onWheel, { passive: true });
  }

  render() {
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const ui = this.slotEls[i];
      if (!ui) continue;
      ui.btn.classList.toggle('selected', i === this.inventory.selectedSlot);

      const slot = this.inventory.slots[i];
      const sig = slot && slot.id > 0 && slot.count > 0
        ? `${slot.id}:${slot.count}:${slot.durability || 0}:${slot.maxDurability || 0}`
        : 'empty';
      if (ui.lastSig === sig) continue;
      ui.lastSig = sig;

      if (slot && slot.id > 0 && slot.count > 0) {
        ui.icon.src = this.atlas.getItemIconDataURL(slot.id);
        ui.icon.classList.remove('hidden');
        const showCount = slot.count > 1;
        ui.count.textContent = showCount ? String(slot.count) : '';
        ui.count.classList.toggle('hidden', !showCount);

        const maxDur = slot.maxDurability || 0;
        const showDur = maxDur > 0 && slot.durability < maxDur;
        ui.durBar.classList.toggle('hidden', !showDur);
        if (showDur) {
          const ratio = Math.max(0, Math.min(1, slot.durability / maxDur));
          ui.durFill.style.width = `${Math.round(ratio * 100)}%`;
          ui.durFill.style.background = getDurabilityColor(ratio);
        }
      } else {
        ui.icon.classList.add('hidden');
        ui.count.classList.add('hidden');
        ui.durBar.classList.add('hidden');
      }
    }
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('wheel', this._onWheel);
  }
}
