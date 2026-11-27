import { BLOCK_IDS } from '../blocks/BlockRegistry.js';
import { CHEST_SIZE, FURNACE_COOK_TICKS } from '../constants.js';
import { ItemRegistry } from '../items/ItemRegistry.js';
import { RecipeRegistry } from '../items/RecipeRegistry.js';

export function blockCoordKey(wx, wy, wz) {
  return `${Math.floor(wx)},${Math.floor(wy)},${Math.floor(wz)}`;
}

export class BlockEntityManager {
  constructor() {
    this.furnaces = new Map(); // key -> { x, y, z, input, fuel, output, burnTime, burnMax, cookTime, cookMax }
    this.chests = new Map();   // key -> { x, y, z, slots: Array(27) }
    this.onChange = null;
  }

  clear() {
    this.furnaces.clear();
    this.chests.clear();
  }

  getOrCreateFurnace(wx, wy, wz) {
    const x = Math.floor(wx);
    const y = Math.floor(wy);
    const z = Math.floor(wz);
    const key = `${x},${y},${z}`;
    let f = this.furnaces.get(key);
    if (!f) {
      f = {
        key,
        x,
        y,
        z,
        input: null,
        fuel: null,
        output: null,
        burnTime: 0,
        burnMax: 0,
        cookTime: 0,
        cookMax: FURNACE_COOK_TICKS,
      };
      this.furnaces.set(key, f);
    }
    return f;
  }

  getOrCreateChest(wx, wy, wz) {
    const x = Math.floor(wx);
    const y = Math.floor(wy);
    const z = Math.floor(wz);
    const key = `${x},${y},${z}`;
    let c = this.chests.get(key);
    if (!c) {
      c = {
        key,
        x,
        y,
        z,
        slots: new Array(CHEST_SIZE).fill(null),
      };
      this.chests.set(key, c);
    }
    return c;
  }

  _canOutputAccept(outputStack, resultDef) {
    if (!resultDef) return false;
    if (!outputStack || outputStack.count <= 0) return true;
    if (outputStack.id !== resultDef.id) return false;
    const maxStack = ItemRegistry.getMaxStack(resultDef.id);
    return outputStack.count + resultDef.count <= maxStack;
  }

  tick(dtTicks, world) {
    if (dtTicks <= 0 || this.furnaces.size === 0) return;
    let changed = false;

    for (const f of this.furnaces.values()) {
      const wasLit = f.burnTime > 0;
      const smelt = f.input ? RecipeRegistry.getSmeltResult(f.input.id) : null;
      const canSmelt = Boolean(smelt && this._canOutputAccept(f.output, smelt));

      if (f.burnTime > 0) {
        f.burnTime = Math.max(0, f.burnTime - dtTicks);
        changed = true;
      }

      if (f.burnTime <= 0 && canSmelt && f.fuel && f.fuel.count > 0) {
        const fuelTicks = RecipeRegistry.getFuelBurnTicks(f.fuel.id);
        if (fuelTicks > 0) {
          f.burnTime = fuelTicks;
          f.burnMax = fuelTicks;
          f.fuel.count -= 1;
          if (f.fuel.count <= 0) f.fuel = null;
          changed = true;
        }
      }

      if (f.burnTime > 0 && canSmelt) {
        f.cookTime += dtTicks;
        while (f.cookTime >= f.cookMax && f.input && f.input.count > 0 && this._canOutputAccept(f.output, smelt)) {
          f.cookTime -= f.cookMax;
          f.input.count -= 1;
          if (f.input.count <= 0) f.input = null;

          if (!f.output) {
            f.output = ItemRegistry.createStack(smelt.id, smelt.count);
          } else {
            f.output.count += smelt.count;
          }
        }
        changed = true;
      } else {
        if (f.cookTime !== 0) {
          f.cookTime = 0;
          changed = true;
        }
      }

      const isLit = f.burnTime > 0;
      if (world && wasLit !== isLit) {
        const curBlock = world.getBlock(f.x, f.y, f.z);
        if (isLit && curBlock === BLOCK_IDS.FURNACE) {
          const meta = world.getBlockMeta(f.x, f.y, f.z);
          world.setBlock(f.x, f.y, f.z, BLOCK_IDS.FURNACE_LIT, true, false, meta);
        } else if (!isLit && curBlock === BLOCK_IDS.FURNACE_LIT) {
          const meta = world.getBlockMeta(f.x, f.y, f.z);
          world.setBlock(f.x, f.y, f.z, BLOCK_IDS.FURNACE, true, false, meta);
        }
      }
    }

    if (changed) {
      this.onChange?.();
    }
  }

  onBlockRemoved(wx, wy, wz, itemMgr) {
    const key = blockCoordKey(wx, wy, wz);
    const f = this.furnaces.get(key);
    if (f) {
      if (itemMgr) {
        for (const s of [f.input, f.fuel, f.output]) {
          if (s && s.id && s.count > 0) {
            itemMgr.spawnDrop(s, f.x + 0.5, f.y + 0.4, f.z + 0.5);
          }
        }
      }
      this.furnaces.delete(key);
    }

    const c = this.chests.get(key);
    if (c) {
      if (itemMgr) {
        for (const s of c.slots) {
          if (s && s.id && s.count > 0) {
            itemMgr.spawnDrop(s, c.x + 0.5, c.y + 0.4, c.z + 0.5);
          }
        }
      }
      this.chests.delete(key);
    }
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
      furnaces: Array.from(this.furnaces.values()).map((f) => ({
        x: f.x,
        y: f.y,
        z: f.z,
        input: pack(f.input),
        fuel: pack(f.fuel),
        output: pack(f.output),
        burnTime: f.burnTime,
        burnMax: f.burnMax,
        cookTime: f.cookTime,
      })),
      chests: Array.from(this.chests.values()).map((c) => ({
        x: c.x,
        y: c.y,
        z: c.z,
        slots: c.slots.map(pack),
      })),
    };
  }

  deserialize(data) {
    this.clear();
    if (!data) return;
    const unpack = (raw) => {
      if (!raw || !raw.id || raw.count <= 0) return null;
      return ItemRegistry.createStack(raw.id, raw.count, raw.maxDurability > 0 ? raw.durability : null, raw.meta || 0);
    };

    if (Array.isArray(data.furnaces)) {
      for (const raw of data.furnaces) {
        const f = this.getOrCreateFurnace(raw.x, raw.y, raw.z);
        f.input = unpack(raw.input);
        f.fuel = unpack(raw.fuel);
        f.output = unpack(raw.output);
        f.burnTime = raw.burnTime || 0;
        f.burnMax = raw.burnMax || 0;
        f.cookTime = raw.cookTime || 0;
      }
    }

    if (Array.isArray(data.chests)) {
      for (const raw of data.chests) {
        const c = this.getOrCreateChest(raw.x, raw.y, raw.z);
        if (Array.isArray(raw.slots)) {
          for (let i = 0; i < CHEST_SIZE; i++) {
            c.slots[i] = unpack(raw.slots[i]);
          }
        }
      }
    }
  }
}
