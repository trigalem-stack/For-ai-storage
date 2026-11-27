// Offline IndexedDB v2 save manager:
// - Global user settings (graphics, fog, render distance, memory mode, sensitivity, touch mode)
// - Multi-world manager (list, create, load, save, delete worlds with modifiedBlocks & hotbar)
// - Seamless migration from Stage 1-2 'active_world' & in-memory fallback when IndexedDB is unavailable

const DB_NAME = 'minecraft_browser_clone_db';
const DB_VERSION = 2;
const STORE_NAME = 'world_saves';
const LEGACY_SAVE_KEY = 'active_world';
const SETTINGS_KEY = 'global_settings';
const WORLDS_INDEX_KEY = 'worlds_index';
const WORLD_PREFIX = 'world_data:';

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
    if (Array.isArray(existingIndex)) return;

    const legacy = await this._getRaw(LEGACY_SAVE_KEY);
    if (legacy && Number.isFinite(legacy.worldSeed)) {
      const id = 'world_1';
      const now = legacy.updatedAt || Date.now();
      const worldPayload = {
        version: 3,
        id,
        name: 'Мой мир',
        worldSeed: legacy.worldSeed,
        player: legacy.player || null,
        hotbar: legacy.hotbar || null,
        modifiedBlocks: Array.isArray(legacy.modifiedBlocks) ? legacy.modifiedBlocks : [],
        createdAt: now,
        updatedAt: now,
      };
      const meta = {
        id,
        name: 'Мой мир',
        seed: legacy.worldSeed,
        createdAt: now,
        updatedAt: now,
        biomeName: '',
        modifiedCount: worldPayload.modifiedBlocks.length,
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

  async createWorld({ name, seed, gameMode = 'survival' }) {
    const list = await this.listWorlds();
    const id = `world_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`;
    const now = Date.now();
    const cleanName = (name || '').trim() || `Мир ${list.length + 1}`;
    const cleanSeed = Number.isFinite(seed) && seed !== 0
      ? (seed | 0)
      : ((Math.floor(Math.random() * 0x7fffffff) + 1) | 0);
    const cleanMode = gameMode === 'creative' ? 'creative' : 'survival';

    const worldData = {
      version: 6,
      id,
      name: cleanName,
      worldSeed: cleanSeed,
      gameMode: cleanMode,
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
        hungerDebuffTimer: 0,
      },
      player: null,
      hotbar: null,
      inventory: null,
      blockEntities: null,
      modifiedBlocks: [],
      createdAt: now,
      updatedAt: now,
    };
    const meta = {
      id,
      name: cleanName,
      seed: cleanSeed,
      gameMode: cleanMode,
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
    return data ? { ...data } : null;
  }

  async saveWorld(worldId, state) {
    if (!worldId) return false;
    this.activeWorldId = worldId;
    const now = Date.now();
    const existing = await this._getRaw(WORLD_PREFIX + worldId);
    const name = state.worldName || existing?.name || 'Мой мир';
    const createdAt = existing?.createdAt || now;
    const mods = Array.isArray(state.modifiedBlocks) ? state.modifiedBlocks : [];
    const gameMode = state.gameMode === 'creative' || state.gameMode === 'survival'
      ? state.gameMode
      : (existing?.gameMode || 'survival');

    const payload = {
      version: 6,
      id: worldId,
      name,
      worldSeed: state.worldSeed,
      gameMode,
      worldTime: Number.isFinite(state.worldTime) ? state.worldTime : (existing?.worldTime ?? 1000),
      dayCount: Number.isFinite(state.dayCount) ? state.dayCount : (existing?.dayCount ?? 1),
      spawnPoint: state.spawnPoint ?? existing?.spawnPoint ?? null,
      bedSpawnPoint: state.bedSpawnPoint !== undefined ? state.bedSpawnPoint : (existing?.bedSpawnPoint ?? null),
      survival: state.survival ?? existing?.survival ?? null,
      player: state.player,
      hotbar: state.hotbar || null,
      inventory: state.inventory ?? existing?.inventory ?? null,
      blockEntities: state.blockEntities ?? existing?.blockEntities ?? null,
      modifiedBlocks: mods,
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
