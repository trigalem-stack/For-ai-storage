import { INVENTORY_SIZE, HOTBAR_SIZE } from '../constants.js';
import { ItemRegistry } from './ItemRegistry.js';

export class Inventory {
  constructor(options = {}) {
    this.slots = new Array(INVENTORY_SIZE).fill(null);
    this.armor = {
      helmet: null,
      chestplate: null,
      leggings: null,
      boots: null,
    };
    this.selectedSlot = 0;
    this.creativeMode = options.creativeMode !== undefined ? Boolean(options.creativeMode) : false;
    this.onChange = null;
    this.onToolBreak = null;
  }

  _emitChange() {
    this.onChange?.();
  }

  getSlot(idx) {
    if (idx < 0 || idx >= INVENTORY_SIZE) return null;
    return this.slots[idx];
  }

  setSlot(idx, stack) {
    if (idx < 0 || idx >= INVENTORY_SIZE) return;
    this.slots[idx] = stack && stack.id && stack.count > 0 ? ItemRegistry.cloneStack(stack) : null;
    this._emitChange();
  }

  getSelectedSlot() {
    return this.selectedSlot;
  }

  selectSlot(idx) {
    const next = ((idx % HOTBAR_SIZE) + HOTBAR_SIZE) % HOTBAR_SIZE;
    if (next === this.selectedSlot) return;
    this.selectedSlot = next;
    this._emitChange();
  }

  getHeldStack() {
    return this.slots[this.selectedSlot] || null;
  }

  getHeldId() {
    return this.slots[this.selectedSlot]?.id || 0;
  }

  getHeldDef() {
    const id = this.getHeldId();
    return id > 0 ? ItemRegistry.get(id) : null;
  }

  getTotalArmorPoints() {
    let pts = 0;
    for (const slot of ['helmet', 'chestplate', 'leggings', 'boots']) {
      const s = this.armor[slot];
      if (s && s.id) pts += ItemRegistry.get(s.id)?.armorPoints || 0;
    }
    return pts;
  }

  canAccept(id, count = 1, durability = 0) {
    const def = ItemRegistry.get(id);
    if (!def || count <= 0) return false;
    const maxStack = def.maxStack;

    if (maxStack > 1 && !def.maxDurability) {
      for (let i = 0; i < INVENTORY_SIZE; i++) {
        const s = this.slots[i];
        if (s && s.id === id && s.count < maxStack) return true;
      }
    }
    for (let i = 0; i < INVENTORY_SIZE; i++) {
      if (!this.slots[i]) return true;
    }
    return false;
  }

  addItem(id, count = 1, durability = null, meta = 0) {
    const def = ItemRegistry.get(id);
    if (!def || count <= 0) return count;

    let remaining = Math.floor(count);
    const maxStack = def.maxStack;

    // 1. Merge into existing stacks (hotbar first, then main inventory)
    if (maxStack > 1 && !def.maxDurability) {
      for (let i = 0; i < INVENTORY_SIZE && remaining > 0; i++) {
        const s = this.slots[i];
        if (s && s.id === id && (s.meta || 0) === meta && s.count < maxStack) {
          const add = Math.min(maxStack - s.count, remaining);
          s.count += add;
          remaining -= add;
        }
      }
    }

    // 2. Fill empty slots (hotbar 0..8 first, then main 9..35)
    for (let i = 0; i < INVENTORY_SIZE && remaining > 0; i++) {
      if (!this.slots[i]) {
        const put = Math.min(maxStack, remaining);
        this.slots[i] = ItemRegistry.createStack(id, put, durability, meta);
        remaining -= put;
      }
    }

    if (remaining !== count) this._emitChange();
    return remaining;
  }

  consumeFromSlot(idx, count = 1) {
    if (this.creativeMode) return true;
    const s = this.slots[idx];
    if (!s || s.count < count) return false;
    s.count -= count;
    if (s.count <= 0) this.slots[idx] = null;
    this._emitChange();
    return true;
  }

  consumeHeld(count = 1) {
    return this.consumeFromSlot(this.selectedSlot, count);
  }

  damageHeldTool(amount = 1) {
    if (this.creativeMode) return false;
    const s = this.slots[this.selectedSlot];
    if (!s || !s.maxDurability || s.maxDurability <= 0) return false;
    s.durability = Math.max(0, (s.durability || s.maxDurability) - amount);
    if (s.durability <= 0) {
      const brokenId = s.id;
      this.slots[this.selectedSlot] = null;
      this.onToolBreak?.(brokenId);
    }
    this._emitChange();
    return true;
  }

  dropFromSlot(idx, countOrWhole = false) {
    const s = this.slots[idx];
    if (!s || s.count <= 0) return null;
    const takeCount = countOrWhole === true
      ? s.count
      : (typeof countOrWhole === 'number' && countOrWhole > 0 ? Math.min(s.count, countOrWhole) : 1);
    let dropped;
    if (takeCount >= s.count || s.maxDurability > 0) {
      dropped = ItemRegistry.cloneStack(s);
      this.slots[idx] = null;
    } else {
      dropped = ItemRegistry.createStack(s.id, takeCount, s.durability, s.meta);
      s.count -= takeCount;
      if (s.count <= 0) this.slots[idx] = null;
    }
    this._emitChange();
    return dropped;
  }

  clear() {
    this.slots.fill(null);
    this.armor = { helmet: null, chestplate: null, leggings: null, boots: null };
    this._emitChange();
  }

  clearAll() {
    this.clear();
  }

  exportState() {
    return this.serialize();
  }

  loadState(data) {
    return this.deserialize(data);
  }

  serialize() {
    const pack = (s) => (s && s.id && s.count > 0
      ? { id: s.id, count: s.count, durability: s.durability || 0, maxDurability: s.maxDurability || 0, meta: s.meta || 0 }
      : null);

    return {
      slots: this.slots.map(pack),
      armor: {
        helmet: pack(this.armor.helmet),
        chestplate: pack(this.armor.chestplate),
        leggings: pack(this.armor.leggings),
        boots: pack(this.armor.boots),
      },
      selectedSlot: this.selectedSlot,
      creativeMode: this.creativeMode,
    };
  }

  deserialize(data) {
    if (!data) return false;
    const unpack = (raw) => {
      if (!raw || !raw.id || raw.count <= 0) return null;
      return ItemRegistry.createStack(raw.id, raw.count, raw.maxDurability > 0 ? raw.durability : null, raw.meta || 0);
    };
    if (Array.isArray(data.slots)) {
      for (let i = 0; i < INVENTORY_SIZE; i++) {
        this.slots[i] = unpack(data.slots[i]);
      }
    }
    if (data.armor) {
      this.armor = {
        helmet: unpack(data.armor.helmet),
        chestplate: unpack(data.armor.chestplate),
        leggings: unpack(data.armor.leggings),
        boots: unpack(data.armor.boots),
      };
    }
    if (Number.isFinite(data.selectedSlot)) {
      this.selectedSlot = ((data.selectedSlot % HOTBAR_SIZE) + HOTBAR_SIZE) % HOTBAR_SIZE;
    }
    if (typeof data.creativeMode === 'boolean') {
      this.creativeMode = data.creativeMode;
    }
    this._emitChange();
    return true;
  }
}
