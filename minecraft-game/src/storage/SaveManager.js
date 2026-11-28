// Offline IndexedDB v2 -> Stage 9 save manager:
// - Global user settings (graphics, fog, render distance, audio mixer, skin, resolutionScale)
// - Multi-world manager (list, create, rename, load, save, delete, .mcworld.json export/import)
// - Compact RLE delta encoding + legacy v1..v8 automatic migration without data loss

const DB_NAME = 'minecraft_browser_clone_db';
const DB_VERSION = 2;
const STORE_NAME = 'world_saves';
const LEGACY_SAVE_KEY = 'active_world';
const SETTINGS_KEY = 'global_settings';
const WORLDS_INDEX_KEY = 'worlds_index';
const WORLD_PREFIX = 'world_data:';

/**
 * Compact Run-Length Encoding for modified block deltas sorted spatially.
 * Reduces repetitive excavated caves/trenches by 3x-12x while keeping O(n) exact round-trip.
 * Format: flat array of tuples [wx, wy, wz, id, meta, runLenX]
 */
export function encodeModifiedRle(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return [];
  const sorted = entries
    .filter((e) => Array.isArray(e) && e.length >= 4)
    .map((e) => [e[0] | 0, e[1] | 0, e[2] | 0, e[3] | 0, e.length >= 5 ? (e[4] | 0) : 0]);
  sorted.sort((a, b) => (a[1] - b[1]) || (a[2] - b[2]) || (a[0] - b[0]));

  const runs = [];
  let cur = null;
  for (let i = 0; i < sorted.length; i++) {
    const [x, y, z, id, meta] = sorted[i];
    if (
      cur &&
      cur[1] === y &&
      cur[2] === z &&
      cur[3] === id &&
      cur[4] === meta &&
      cur[0] + cur[5] === x
    ) {
      cur[5]++;
    } else {
      cur = [x, y, z, id, meta, 1];
      runs.push(cur);
    }
  }
  return runs;
}

export function decodeModifiedRle(runs) {
  if (!Array.isArray(runs) || runs.length === 0) return [];
  const out = [];
  for (let i = 0; i < runs.length; i++) {
    const r = runs[i];
    if (!Array.isArray(r) || r.length < 4) continue;
    const x0 = r[0] | 0;
    const y = r[1] | 0;
    const z = r[2] | 0;
    const id = r[3] | 0;
    const meta = r.length >= 5 ? (r[4] | 0) : 0;
    const len = r.length >= 6 ? Math.max(1, r[5] | 0) : 1;
    for (let dx = 0; dx < len; dx++) {
      if (meta !== 0) out.push([x0 + dx, y, z, id, meta]);
      else out.push([x0 + dx, y, z, id]);
    }
  }
  return out;
}

async function gzipCompressJson(obj) {
  if (typeof CompressionStream === 'undefined' || typeof TextEncoder === 'undefined') return null;
  try {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    const cs = new CompressionStream('gzip');
    const writer = cs.writable.getWriter();
    writer.write(bytes);
    writer.close();
    const buf = await new Response(cs.readable).arrayBuffer();
    const u8 = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
    return btoa(bin);
  } catch {
    return null;
  }
}

async function gzipDecompressJson(b64) {
  if (!b64 || typeof DecompressionStream === 'undefined' || typeof TextDecoder === 'undefined') return null;
  try {
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const ds = new DecompressionStream('gzip');
    const writer = ds.writable.getWriter();
    writer.write(u8);
    writer.close();
    const buf = await new Response(ds.readable).arrayBuffer();
    return JSON.parse(new TextDecoder().decode(buf));
  } catch {
    return null;
  }
}

export class SaveManager {
  constructor() {
    this.db = null;
    this.memoryStore = new Map();
    this.available = typeof indexedDB !== 'undefined';
    this.activeWorldId = 'world_default';
  }

  async init() {
    if (!this.available) return false;
    try {
      this.db = await new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      await this._migrateLegacyIfNeeded();
      return true;
    } catch {
      this.available = false;
      this.db = null;
      return false;
    }
  }

  async _getRaw(key) {
    if (!this.db) {
      return this.memoryStore.has(key) ? this.memoryStore.get(key) : null;
    }
    try {
      return await new Promise((resolve, reject) => {
        const tx = this.db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => reject(req.error);
      });
    } catch {
      return this.memoryStore.has(key) ? this.memoryStore.get(key) : null;
    }
  }

  async _putRaw(key, value) {
    this.memoryStore.set(key, value);
    if (!this.db) return false;
    try {
      await new Promise((resolve, reject) => {
        const tx = this.db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(value, key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
      return true;
    } catch {
      return false;
    }
  }

  async _deleteRaw(key) {
    this.memoryStore.delete(key);
    if (!this.db) return;
    try {
      await new Promise((resolve, reject) => {
        const tx = this.db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch {
      // Ignore storage delete errors
    }
  }

  async _migrateLegacyIfNeeded() {
    const existingIndex = await this._getRaw(WORLDS_INDEX_KEY);
    if (Array.isArray(existingIndex)) {
      // Auto-upgrade legacy default 'Мой мир' title to Stage 9 'Мой Мир #1' if only legacy default exists
      let changed = false;
      for (const meta of existingIndex) {
        if (meta && !meta.migratedV9) {
          meta.migratedV9 = true;
          if (!meta.worldType) meta.worldType = 'default';
          if (meta.hardcore === undefined) meta.hardcore = false;
          if (meta.id === 'world_1' && meta.name === 'Мой мир') {
            meta.name = 'Мой Мир #1';
            const data = await this._getRaw(WORLD_PREFIX + meta.id);
            if (data) {
              data.name = 'Мой Мир #1';
              await this._putRaw(WORLD_PREFIX + meta.id, data);
            }
          }
          changed = true;
        }
      }
      if (changed) {
        await this._putRaw(WORLDS_INDEX_KEY, existingIndex);
      }
      return;
    }

    const legacy = await this._getRaw(LEGACY_SAVE_KEY);
    if (legacy && Number.isFinite(legacy.worldSeed)) {
      const id = 'world_1';
      const now = legacy.updatedAt || Date.now();
      const mods = Array.isArray(legacy.modifiedBlocks) ? legacy.modifiedBlocks : [];
      const worldPayload = {
        version: 8,
        schemaVersion: 9,
        id,
        name: 'Мой Мир #1',
        worldSeed: legacy.worldSeed,
        worldType: 'default',
        hardcore: false,
        bonusChest: false,
        bonusChestPlaced: false,
        dead: false,
        player: legacy.player || null,
        hotbar: legacy.hotbar || null,
        modifiedBlocks: mods,
        createdAt: now,
        updatedAt: now,
      };
      const meta = {
        id,
        name: 'Мой Мир #1',
        seed: legacy.worldSeed,
        worldType: 'default',
        hardcore: false,
        dead: false,
        migratedV9: true,
        createdAt: now,
        updatedAt: now,
        biomeName: '',
        modifiedCount: mods.length,
      };
      await this._putRaw(WORLD_PREFIX + id, worldPayload);
      await this._putRaw(WORLDS_INDEX_KEY, [meta]);
      if (legacy.settings) {
        await this._putRaw(SETTINGS_KEY, legacy.settings);
      }
      this.activeWorldId = id;
    } else {
      await this._putRaw(WORLDS_INDEX_KEY, []);
    }
  }

  async loadSettings() {
    return (await this._getRaw(SETTINGS_KEY)) || null;
  }

  async saveSettings(settings) {
    if (!settings) return false;
    return this._putRaw(SETTINGS_KEY, {
      ...settings,
      updatedAt: Date.now(),
    });
  }

  async listWorlds() {
    const list = await this._getRaw(WORLDS_INDEX_KEY);
    if (!Array.isArray(list)) return [];
    return [...list].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }

  async createWorld({
    name,
    seed,
    gameMode = 'survival',
    worldType = 'default',
    hardcore = false,
    bonusChest = false,
  }) {
    const list = await this.listWorlds();
    const id = `world_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`;
    const now = Date.now();
    const cleanName = (name || '').trim() || `Мой Мир #${list.length + 1}`;
    const cleanSeed = Number.isFinite(seed) && seed !== 0
      ? (seed | 0)
      : ((Math.floor(Math.random() * 0x7fffffff) + 1) | 0);
    const isHardcore = Boolean(hardcore);
    const cleanMode = isHardcore ? 'survival' : (gameMode === 'creative' ? 'creative' : 'survival');
    const cleanType = worldType === 'superflat' ? 'superflat' : 'default';

    const worldData = {
      version: 8,
      schemaVersion: 9,
      id,
      name: cleanName,
      worldSeed: cleanSeed,
      gameMode: cleanMode,
      worldType: cleanType,
      hardcore: isHardcore,
      bonusChest: Boolean(bonusChest),
      bonusChestPlaced: false,
      dead: false,
      worldTime: 1000,
      dayCount: 1,
      spawnPoint: null,
      bedSpawnPoint: null,
      survival: {
        health: 20,
        absorption: 0,
        foodLevel: 20,
        saturation: 5.0,
        exhaustion: 0,
        airTicks: 300,
        score: 0,
        xpLevel: 0,
        xpProgress: 0,
        xpTotal: 0,
        hungerDebuffTimer: 0,
      },
      player: null,
      hotbar: null,
      inventory: null,
      blockEntities: null,
      entities: null,
      modifiedBlocks: [],
      createdAt: now,
      updatedAt: now,
    };
    const meta = {
      id,
      name: cleanName,
      seed: cleanSeed,
      gameMode: cleanMode,
      worldType: cleanType,
      hardcore: isHardcore,
      bonusChest: Boolean(bonusChest),
      dead: false,
      migratedV9: true,
      createdAt: now,
      updatedAt: now,
      biomeName: '',
      modifiedCount: 0,
    };
    list.unshift(meta);
    await this._putRaw(WORLD_PREFIX + id, worldData);
    await this._putRaw(WORLDS_INDEX_KEY, list);
    this.activeWorldId = id;
    return meta;
  }

  async loadWorld(worldId) {
    this.activeWorldId = worldId;
    const data = await this._getRaw(WORLD_PREFIX + worldId);
    if (!data) return null;
    const out = { ...data };
    if (!Array.isArray(out.modifiedBlocks) || out.modifiedBlocks.length === 0) {
      if (out.modifiedGzip) {
        const dec = await gzipDecompressJson(out.modifiedGzip);
        if (Array.isArray(dec)) out.modifiedBlocks = decodeModifiedRle(dec);
      } else if (Array.isArray(out.modifiedBlocksRle)) {
        out.modifiedBlocks = decodeModifiedRle(out.modifiedBlocksRle);
      } else {
        out.modifiedBlocks = [];
      }
    }
    if (!out.worldType) out.worldType = 'default';
    if (out.hardcore === undefined) out.hardcore = false;
    if (out.bonusChest === undefined) out.bonusChest = false;
    if (out.dead === undefined) out.dead = false;
    return out;
  }

  async saveWorld(worldId, state) {
    if (!worldId) return false;
    this.activeWorldId = worldId;
    const now = Date.now();
    const existing = await this._getRaw(WORLD_PREFIX + worldId);
    const name = state.worldName || existing?.name || 'Мой Мир #1';
    const createdAt = existing?.createdAt || now;
    const mods = Array.isArray(state.modifiedBlocks) ? state.modifiedBlocks : [];
    const worldType = state.worldType === 'superflat' || existing?.worldType === 'superflat' ? 'superflat' : 'default';
    const hardcore = state.hardcore !== undefined ? Boolean(state.hardcore) : Boolean(existing?.hardcore);
    const bonusChest = state.bonusChest !== undefined ? Boolean(state.bonusChest) : Boolean(existing?.bonusChest);
    const bonusChestPlaced = state.bonusChestPlaced !== undefined ? Boolean(state.bonusChestPlaced) : Boolean(existing?.bonusChestPlaced);
    const dead = state.dead !== undefined ? Boolean(state.dead) : Boolean(existing?.dead);
    const gameMode = hardcore
      ? 'survival'
      : (state.gameMode === 'creative' || state.gameMode === 'survival'
          ? state.gameMode
          : (existing?.gameMode || 'survival'));

    // Store RLE + gzip when large so IndexedDB footprint stays compact, while keeping inline array for small deltas
    const useCompressed = mods.length >= 256;
    const rle = useCompressed ? encodeModifiedRle(mods) : null;
    const gz = useCompressed ? await gzipCompressJson(rle) : null;

    const payload = {
      version: 8,
      schemaVersion: 9,
      id: worldId,
      name,
      worldSeed: state.worldSeed,
      gameMode,
      worldType,
      hardcore,
      bonusChest,
      bonusChestPlaced,
      dead,
      worldTime: Number.isFinite(state.worldTime) ? state.worldTime : (existing?.worldTime ?? 1000),
      dayCount: Number.isFinite(state.dayCount) ? state.dayCount : (existing?.dayCount ?? 1),
      spawnPoint: state.spawnPoint ?? existing?.spawnPoint ?? null,
      bedSpawnPoint: state.bedSpawnPoint !== undefined ? state.bedSpawnPoint : (existing?.bedSpawnPoint ?? null),
      survival: state.survival ?? existing?.survival ?? null,
      player: state.player,
      hotbar: state.hotbar || null,
      inventory: state.inventory ?? existing?.inventory ?? null,
      blockEntities: state.blockEntities ?? existing?.blockEntities ?? null,
      entities: state.entities !== undefined ? state.entities : (existing?.entities ?? null),
      modifiedBlocks: useCompressed ? [] : mods,
      modifiedBlocksRle: useCompressed && !gz ? rle : undefined,
      modifiedGzip: gz || undefined,
      modifiedCount: mods.length,
      createdAt,
      updatedAt: now,
    };

    const ok = await this._putRaw(WORLD_PREFIX + worldId, payload);

    const list = (await this._getRaw(WORLDS_INDEX_KEY)) || [];
    const meta = {
      id: worldId,
      name,
      seed: state.worldSeed,
      gameMode,
      worldType,
      hardcore,
      bonusChest,
      dead,
      migratedV9: true,
      createdAt,
      updatedAt: now,
      biomeName: state.biomeName || existing?.biomeName || '',
      modifiedCount: mods.length,
    };
    const idx = list.findIndex((w) => w.id === worldId);
    if (idx >= 0) list[idx] = meta;
    else list.unshift(meta);
    await this._putRaw(WORLDS_INDEX_KEY, list);

    if (state.settings) {
      await this.saveSettings(state.settings);
    }
    return ok;
  }

  async renameWorld(worldId, newName) {
    const clean = (newName || '').trim();
    if (!worldId || !clean) return false;
    const data = await this._getRaw(WORLD_PREFIX + worldId);
    if (data) {
      data.name = clean;
      data.updatedAt = Date.now();
      await this._putRaw(WORLD_PREFIX + worldId, data);
    }
    const list = (await this._getRaw(WORLDS_INDEX_KEY)) || [];
    const item = list.find((w) => w.id === worldId);
    if (item) {
      item.name = clean;
      item.updatedAt = Date.now();
      await this._putRaw(WORLDS_INDEX_KEY, list);
    }
    return true;
  }

  async exportWorldJson(worldId) {
    const data = await this.loadWorld(worldId);
    if (!data) return null;
    const clean = {
      ...data,
      modifiedBlocksRle: encodeModifiedRle(data.modifiedBlocks || []),
      modifiedBlocks: undefined,
      modifiedGzip: undefined,
    };
    return JSON.stringify(
      {
        format: 'mcworld-classic-v9',
        exportedAt: Date.now(),
        world: clean,
      },
      null,
      2
    );
  }

  async importWorldJson(rawTextOrObj) {
    const parsed = typeof rawTextOrObj === 'string' ? JSON.parse(rawTextOrObj) : rawTextOrObj;
    const src = parsed?.world || parsed;
    if (!src || !Number.isFinite(src.worldSeed)) {
      throw new Error('Неверный формат файла мира .mcworld.json');
    }
    const list = await this.listWorlds();
    const id = `world_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`;
    const now = Date.now();
    const mods = Array.isArray(src.modifiedBlocks) && src.modifiedBlocks.length > 0
      ? src.modifiedBlocks
      : decodeModifiedRle(src.modifiedBlocksRle || []);
    const cleanName = ((src.name || '').trim() || `Импорт #${list.length + 1}`);
    const payload = {
      ...src,
      version: 8,
      schemaVersion: 9,
      id,
      name: cleanName,
      worldType: src.worldType === 'superflat' ? 'superflat' : 'default',
      hardcore: Boolean(src.hardcore),
      bonusChest: Boolean(src.bonusChest),
      dead: Boolean(src.dead),
      modifiedBlocks: mods,
      modifiedBlocksRle: undefined,
      modifiedGzip: undefined,
      createdAt: now,
      updatedAt: now,
    };
    const meta = {
      id,
      name: cleanName,
      seed: payload.worldSeed,
      gameMode: payload.hardcore ? 'survival' : (payload.gameMode === 'creative' ? 'creative' : 'survival'),
      worldType: payload.worldType,
      hardcore: payload.hardcore,
      bonusChest: payload.bonusChest,
      dead: payload.dead,
      migratedV9: true,
      createdAt: now,
      updatedAt: now,
      biomeName: '',
      modifiedCount: mods.length,
    };
    list.unshift(meta);
    await this._putRaw(WORLD_PREFIX + id, payload);
    await this._putRaw(WORLDS_INDEX_KEY, list);
    return meta;
  }

  async deleteWorld(worldId) {
    await this._deleteRaw(WORLD_PREFIX + worldId);
    const list = (await this._getRaw(WORLDS_INDEX_KEY)) || [];
    const next = list.filter((w) => w.id !== worldId);
    await this._putRaw(WORLDS_INDEX_KEY, next);
    if (this.activeWorldId === worldId) {
      this.activeWorldId = next[0]?.id || 'world_default';
    }
    return next;
  }

  // Backward-compatible single-state API used by Stage 1-2 unit tests
  async loadState() {
    const data = await this._getRaw(WORLD_PREFIX + this.activeWorldId);
    if (data) {
      const settings = await this.loadSettings();
      return { ...data, settings: settings || data.settings || null };
    }
    return this._getRaw(LEGACY_SAVE_KEY);
  }

  async saveState(state) {
    if (state.settings) {
      await this.saveSettings(state.settings);
    }
    return this.saveWorld(this.activeWorldId, state);
  }

  async clearState() {
    await this.deleteWorld(this.activeWorldId);
    await this._deleteRaw(LEGACY_SAVE_KEY);
  }
}
