// Offline IndexedDB save manager for world seed, player pose, and settings.
// Gracefully falls back to in-memory storage if IndexedDB is restricted.

const DB_NAME = 'minecraft_browser_clone_db';
const DB_VERSION = 1;
const STORE_NAME = 'world_saves';
const ACTIVE_SAVE_KEY = 'active_world';

export class SaveManager {
  constructor() {
    this.db = null;
    this.memoryFallback = null;
    this.available = typeof indexedDB !== 'undefined';
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
      return true;
    } catch {
      this.available = false;
      this.db = null;
      return false;
    }
  }

  async loadState() {
    if (!this.db) {
      return this.memoryFallback ? { ...this.memoryFallback } : null;
    }
    try {
      return await new Promise((resolve, reject) => {
        const tx = this.db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(ACTIVE_SAVE_KEY);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    } catch {
      return this.memoryFallback ? { ...this.memoryFallback } : null;
    }
  }

  async saveState(state) {
    const payload = {
      version: 1,
      worldSeed: state.worldSeed,
      player: state.player,
      settings: state.settings,
      updatedAt: Date.now(),
    };
    this.memoryFallback = payload;

    if (!this.db) return false;
    try {
      await new Promise((resolve, reject) => {
        const tx = this.db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(payload, ACTIVE_SAVE_KEY);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
      return true;
    } catch {
      return false;
    }
  }

  async clearState() {
    this.memoryFallback = null;
    if (!this.db) return;
    try {
      await new Promise((resolve, reject) => {
        const tx = this.db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(ACTIVE_SAVE_KEY);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch {
      // Ignore storage errors
    }
  }
}
