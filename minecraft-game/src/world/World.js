import * as THREE from '../../vendor/three.module.min.js';
import { BlockRegistry } from '../blocks/BlockRegistry.js';
import { BIOME_NAMES, CHUNK_FRAME_BUDGET_MS, CHUNK_SIZE, WORLD_HEIGHT } from '../constants.js';
import { Chunk, chunkKey } from './Chunk.js';
import { ChunkMesher } from './ChunkMesher.js';
import { LightingEngine } from './LightingEngine.js';
import { WorldGen } from './WorldGen.js';

export class World {
  constructor(scene, atlas, seed, renderDistance = 6, options = {}) {
    this.scene = scene;
    this.atlas = atlas;
    this.seed = seed;
    this.renderDistance = renderDistance;
    this.unlimitedMemory = options.unlimitedMemory !== undefined ? Boolean(options.unlimitedMemory) : true;
    this.fogEnabled = options.fogEnabled !== undefined ? Boolean(options.fogEnabled) : false;
    this.onBlockChanged = options.onBlockChanged || null;

    this.worldGen = new WorldGen(seed);
    this.mesher = new ChunkMesher(atlas);
    this.lighting = new LightingEngine();

    // Active chunks (within render distance + hysteresis)
    this.chunks = new Map(); // key -> Chunk
    // Unlimited RAM cache of visited/modified chunk voxel + biome + light + meta arrays
    this.chunkDataCache = new Map(); // key -> { blocks, biomes, light, meta, minY, maxY, lightCalculated }
    // Delta map of player-modified blocks + per-chunk O(1) lookup index
    this.modifiedBlocks = new Map(); // "wx,wy,wz" -> { id, meta }
    this.modifiedByChunk = new Map(); // "cx,cz" -> Array<[lx, wy, lz, id, meta]>

    this.lastPlayerChunkX = null;
    this.lastPlayerChunkZ = null;
    this.pendingCoords = [];
    this.pendingLightChunks = [];
    this._neighborScratch = new Array(9);
    this._dirtyScratch = [];
    this._randomTickAccum = 0;

    // Offline Blob Web Worker pool for smooth zero-copy chunk generation
    this.workers = [];
    this.workerUrl = null;
    this.inFlightKeys = new Set();
    this.nextWorkerIdx = 0;
    this.disposed = false;
    if (options.useWorkers !== false && typeof Worker !== 'undefined') {
      this._initWorkers();
    }

    // Sky & optional atmospheric fog
    this.skyColor = new THREE.Color('#a4d4ff');
    this.scene.background = this.skyColor;
    this._updateFog();
  }

  _initWorkers() {
    try {
      const url = WorldGen.createWorkerBlobUrl();
      if (!url) return;
      this.workerUrl = url;
      const count = typeof navigator !== 'undefined'
        ? Math.min(2, Math.max(1, (navigator.hardwareConcurrency || 2) - 1))
        : 1;

      for (let i = 0; i < count; i++) {
        const w = new Worker(url);
        w.onmessage = (e) => this._handleWorkerMessage(e.data);
        w.onerror = () => {
          this._terminateWorkers();
        };
        this.workers.push(w);
      }
    } catch {
      this._terminateWorkers();
    }
  }

  _terminateWorkers() {
    for (const w of this.workers) {
      try {
        w.terminate();
      } catch {
        // Ignore terminate error
      }
    }
    this.workers = [];
    this.inFlightKeys.clear();
    if (this.workerUrl) {
      try {
        URL.revokeObjectURL(this.workerUrl);
      } catch {
        // Ignore revoke error
      }
      this.workerUrl = null;
    }
  }

  _handleWorkerMessage(data) {
    if (this.disposed || !data) return;
    const { cx, cz, blocks, biomes, minY, maxY } = data;
    const key = chunkKey(cx, cz);
    this.inFlightKeys.delete(key);

    if (this.chunks.has(key)) return;

    // Discard if chunk wandered past unload radius while generating in background
    if (this.lastPlayerChunkX !== null && this.lastPlayerChunkZ !== null) {
      const dx = cx - this.lastPlayerChunkX;
      const dz = cz - this.lastPlayerChunkZ;
      const maxRadiusSq = (this.renderDistance + 3) * (this.renderDistance + 3);
      if (dx * dx + dz * dz > maxRadiusSq) {
        if (this.unlimitedMemory) {
          this.chunkDataCache.set(key, {
            blocks: new Uint8Array(blocks),
            biomes: new Uint8Array(biomes),
            light: null,
            meta: null,
            minY,
            maxY,
            lightCalculated: false,
          });
        }
        return;
      }
    }

    const chunk = new Chunk(cx, cz);
    chunk.blocks = new Uint8Array(blocks);
    chunk.biomes = new Uint8Array(biomes);
    chunk.minY = minY;
    chunk.maxY = maxY;
    chunk.isGenerated = true;
    chunk.lightCalculated = false;
    chunk.dirty = false;

    this._applyModifiedBlocksToChunk(chunk);
    this.chunks.set(key, chunk);
    this.pendingLightChunks.push(chunk);
  }

  _saveToCache(chunk) {
    this.chunkDataCache.set(chunk.key, {
      blocks: chunk.blocks,
      biomes: chunk.biomes,
      light: chunk.light,
      meta: chunk.meta,
      minY: chunk.minY,
      maxY: chunk.maxY,
      lightCalculated: chunk.lightCalculated,
    });
  }

  setRenderDistance(distance) {
    this.renderDistance = distance;
    this.lastPlayerChunkX = null;
    this.lastPlayerChunkZ = null;
    this._updateFog();
  }

  setFogEnabled(enabled) {
    this.fogEnabled = Boolean(enabled);
    this._updateFog();
  }

  setSkyColor(color) {
    this.skyColor.copy(color);
    if (this.scene.fog) {
      this.scene.fog.color.copy(this.skyColor);
    }
  }

  setUnlimitedMemory(enabled) {
    this.unlimitedMemory = Boolean(enabled);
    if (!this.unlimitedMemory) {
      for (const key of this.chunkDataCache.keys()) {
        if (!this.chunks.has(key)) {
          this.chunkDataCache.delete(key);
        }
      }
    }
  }

  loadModifiedBlocks(entries) {
    this.modifiedBlocks.clear();
    this.modifiedByChunk.clear();
    this.pendingLightChunks.length = 0;
    if (!Array.isArray(entries)) return;
    for (const item of entries) {
      if (!Array.isArray(item) || item.length < 4) continue;
      const wx = item[0];
      const wy = item[1];
      const wz = item[2];
      const id = item[3];
      const meta = item.length >= 5 ? (item[4] | 0) : 0;
      this.modifiedBlocks.set(`${wx},${wy},${wz}`, { id, meta });

      const cx = Math.floor(wx / CHUNK_SIZE);
      const cz = Math.floor(wz / CHUNK_SIZE);
      const lx = wx - cx * CHUNK_SIZE;
      const lz = wz - cz * CHUNK_SIZE;
      const cKey = chunkKey(cx, cz);
      let list = this.modifiedByChunk.get(cKey);
      if (!list) {
        list = [];
        this.modifiedByChunk.set(cKey, list);
      }
      list.push([lx, wy, lz, id, meta]);

      const chunk = this.chunks.get(cKey);
      if (chunk && chunk.isGenerated) {
        chunk.setBlock(lx, wy, lz, id, meta);
        chunk.lightCalculated = false;
        chunk.dirty = true;
        this.pendingLightChunks.push(chunk);
      }
    }
  }

  setHeldLight(x, y, z, level) {
    this.mesher.setHeldLight(x, y, z, level);
  }

  exportModifiedBlocks() {
    const out = [];
    for (const [coordKey, entry] of this.modifiedBlocks) {
      const parts = coordKey.split(',');
      if (entry.meta) {
        out.push([Number(parts[0]), Number(parts[1]), Number(parts[2]), entry.id, entry.meta]);
      } else {
        out.push([Number(parts[0]), Number(parts[1]), Number(parts[2]), entry.id]);
      }
    }
    return out;
  }

  _updateFog() {
    if (!this.fogEnabled) {
      this.scene.fog = null;
      return;
    }
    const farDist = Math.max(28, this.renderDistance * CHUNK_SIZE - 4);
    const nearDist = Math.max(14, farDist * 0.55);
    if (!this.scene.fog) {
      this.scene.fog = new THREE.Fog(this.skyColor, nearDist, farDist);
    } else {
      this.scene.fog.color.copy(this.skyColor);
      this.scene.fog.near = nearDist;
      this.scene.fog.far = farDist;
    }
  }

  getChunk(cx, cz) {
    return this.chunks.get(chunkKey(cx, cz)) || null;
  }

  getBlock(wx, wy, wz) {
    if (wy < 0 || wy >= WORLD_HEIGHT) return 0;
    const fx = Math.floor(wx);
    const fy = Math.floor(wy);
    const fz = Math.floor(wz);
    const cx = Math.floor(fx / CHUNK_SIZE);
    const cz = Math.floor(fz / CHUNK_SIZE);
    const chunk = this.chunks.get(chunkKey(cx, cz));
    if (!chunk || !chunk.isGenerated) return 0;
    const lx = fx - cx * CHUNK_SIZE;
    const lz = fz - cz * CHUNK_SIZE;
    return chunk.getBlock(lx, fy, lz);
  }

  getBlockMeta(wx, wy, wz) {
    if (wy < 0 || wy >= WORLD_HEIGHT) return 0;
    const fx = Math.floor(wx);
    const fy = Math.floor(wy);
    const fz = Math.floor(wz);
    const cx = Math.floor(fx / CHUNK_SIZE);
    const cz = Math.floor(fz / CHUNK_SIZE);
    const chunk = this.chunks.get(chunkKey(cx, cz));
    if (!chunk || !chunk.isGenerated) return 0;
    return chunk.getMeta(fx - cx * CHUNK_SIZE, fy, fz - cz * CHUNK_SIZE);
  }

  getLightAt(wx, wy, wz) {
    if (wy >= WORLD_HEIGHT) return { sky: 15, block: 0 };
    if (wy < 0) return { sky: 0, block: 0 };
    const fx = Math.floor(wx);
    const fy = Math.floor(wy);
    const fz = Math.floor(wz);
    const cx = Math.floor(fx / CHUNK_SIZE);
    const cz = Math.floor(fz / CHUNK_SIZE);
    const chunk = this.chunks.get(chunkKey(cx, cz));
    if (!chunk || !chunk.isGenerated) return { sky: 15, block: 0 };
    const lx = fx - cx * CHUNK_SIZE;
    const lz = fz - cz * CHUNK_SIZE;
    return {
      sky: chunk.getSkyLight(lx, fy, lz),
      block: chunk.getBlockLight(lx, fy, lz),
    };
  }

  getBiomeAt(wx, wz) {
    const fx = Math.floor(wx);
    const fz = Math.floor(wz);
    const cx = Math.floor(fx / CHUNK_SIZE);
    const cz = Math.floor(fz / CHUNK_SIZE);
    const chunk = this.chunks.get(chunkKey(cx, cz));
    if (chunk && chunk.isGenerated) {
      return chunk.getBiome(fx - cx * CHUNK_SIZE, fz - cz * CHUNK_SIZE);
    }
    return this.worldGen.getBiomeAt(fx, fz);
  }

  getBiomeNameAt(wx, wz) {
    const id = this.getBiomeAt(wx, wz);
    return BIOME_NAMES[id] || BIOME_NAMES[0];
  }

  /**
   * Sets a block at world coordinates with optional metadata, updates BFS dual lighting,
   * rebuilds bordering & light-touched chunks immediately, and triggers neighbor/gravity hooks.
   */
  setBlock(wx, wy, wz, id, rebuildImmediate = true, triggerGravity = true, meta = 0) {
    if (wy < 0 || wy >= WORLD_HEIGHT) return false;
    const fx = Math.floor(wx);
    const fy = Math.floor(wy);
    const fz = Math.floor(wz);
    const cx = Math.floor(fx / CHUNK_SIZE);
    const cz = Math.floor(fz / CHUNK_SIZE);
    const chunk = this.chunks.get(chunkKey(cx, cz));
    if (!chunk || !chunk.isGenerated) return false;

    const lx = fx - cx * CHUNK_SIZE;
    const lz = fz - cz * CHUNK_SIZE;
    const oldId = chunk.getBlock(lx, fy, lz);
    const oldMeta = chunk.getMeta(lx, fy, lz);
    if (oldId === id && oldMeta === meta) return false;

    if (!chunk.setBlock(lx, fy, lz, id, meta)) return false;

    this.modifiedBlocks.set(`${fx},${fy},${fz}`, { id, meta });
    let cMods = this.modifiedByChunk.get(chunk.key);
    if (!cMods) {
      cMods = [];
      this.modifiedByChunk.set(chunk.key, cMods);
    }
    const existingMod = cMods.find((m) => m[0] === lx && m[1] === fy && m[2] === lz);
    if (existingMod) {
      existingMod[3] = id;
      existingMod[4] = meta;
    } else {
      cMods.push([lx, fy, lz, id, meta]);
    }

    // Update dual-channel BFS sky & block lighting across chunks
    const touchedChunks = this.lighting.onBlockChanged(this, fx, fy, fz, oldId, id);

    if (this.unlimitedMemory) {
      this._saveToCache(chunk);
    }

    const rebuildTargets = new Set(touchedChunks);
    rebuildTargets.add(chunk);

    const pushNeighborIfPresent = (ncx, ncz) => {
      const n = this.chunks.get(chunkKey(ncx, ncz));
      if (n && n.isGenerated) {
        n.dirty = true;
        rebuildTargets.add(n);
      }
    };

    if (lx === 0) pushNeighborIfPresent(cx - 1, cz);
    if (lx === CHUNK_SIZE - 1) pushNeighborIfPresent(cx + 1, cz);
    if (lz === 0) pushNeighborIfPresent(cx, cz - 1);
    if (lz === CHUNK_SIZE - 1) pushNeighborIfPresent(cx, cz + 1);
    if (lx === 0 && lz === 0) pushNeighborIfPresent(cx - 1, cz - 1);
    if (lx === CHUNK_SIZE - 1 && lz === 0) pushNeighborIfPresent(cx + 1, cz - 1);
    if (lx === 0 && lz === CHUNK_SIZE - 1) pushNeighborIfPresent(cx - 1, cz + 1);
    if (lx === CHUNK_SIZE - 1 && lz === CHUNK_SIZE - 1) pushNeighborIfPresent(cx + 1, cz + 1);

    for (const target of rebuildTargets) {
      target.dirty = true;
    }

    if (rebuildImmediate) {
      for (const target of rebuildTargets) {
        this._rebuildChunkMesh(target);
      }
    }

    if (triggerGravity && this.onBlockChanged) {
      this.onBlockChanged(fx, fy, fz, id, oldId, oldMeta);
    }
    return true;
  }

  triggerRedstoneGlow(wx, wy, wz) {
    this.lighting.triggerRedstoneGlow(this, wx, wy, wz);
  }

  getSurfaceHeightAt(wx, wz) {
    const fx = Math.floor(wx);
    const fz = Math.floor(wz);
    const cx = Math.floor(fx / CHUNK_SIZE);
    const cz = Math.floor(fz / CHUNK_SIZE);
    const chunk = this.chunks.get(chunkKey(cx, cz));
    if (chunk && chunk.isGenerated) {
      const lx = fx - cx * CHUNK_SIZE;
      const lz = fz - cz * CHUNK_SIZE;
      for (let y = Math.min(WORLD_HEIGHT - 1, chunk.maxY); y >= 0; y--) {
        const id = chunk.getBlock(lx, y, lz);
        if (BlockRegistry.isSolid(id)) {
          return y + 1;
        }
      }
    }
    return this.worldGen.getTerrainHeight(fx, fz) + 1;
  }

  _markDirty(cx, cz) {
    const chunk = this.chunks.get(chunkKey(cx, cz));
    if (chunk && chunk.isGenerated) {
      chunk.dirty = true;
    }
  }

  _markOrthogonalNeighborsDirty(cx, cz) {
    this._markDirty(cx - 1, cz);
    this._markDirty(cx + 1, cz);
    this._markDirty(cx, cz - 1);
    this._markDirty(cx, cz + 1);
  }

  preloadSpawnArea(playerX, playerZ, radius = 2) {
    const pcx = Math.floor(playerX / CHUNK_SIZE);
    const pcz = Math.floor(playerZ / CHUNK_SIZE);
    const coords = this._collectSpiralCoords(pcx, pcz, radius);

    for (const [cx, cz] of coords) {
      this._ensureChunkGeneratedSync(cx, cz);
    }
    for (const [cx, cz] of coords) {
      const chunk = this.getChunk(cx, cz);
      if (chunk && chunk.dirty) {
        this._rebuildChunkMesh(chunk);
      }
    }
  }

  _collectSpiralCoords(centerX, centerZ, radius) {
    const list = [];
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dz * dz <= radius * radius + 1) {
          list.push([centerX + dx, centerZ + dz, dx * dx + dz * dz]);
        }
      }
    }
    list.sort((a, b) => a[2] - b[2]);
    return list;
  }

  _applyModifiedBlocksToChunk(chunk) {
    const mods = this.modifiedByChunk.get(chunk.key);
    if (!mods || mods.length === 0) return;
    for (let i = 0; i < mods.length; i++) {
      const [lx, wy, lz, id, meta] = mods[i];
      if (wy >= 0 && wy < WORLD_HEIGHT) {
        chunk.setBlock(lx, wy, lz, id, meta || 0);
      }
    }
  }

  _ensureChunkGeneratedSync(cx, cz) {
    const key = chunkKey(cx, cz);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = new Chunk(cx, cz);
      const cached = this.chunkDataCache.get(key);
      if (cached) {
        chunk.blocks = cached.blocks;
        chunk.biomes = cached.biomes;
        if (cached.light) chunk.light = cached.light;
        if (cached.meta) chunk.meta = cached.meta;
        chunk.minY = cached.minY;
        chunk.maxY = cached.maxY;
        chunk.isGenerated = true;
        chunk.lightCalculated = Boolean(cached.lightCalculated);
        chunk.dirty = true;
        this._applyModifiedBlocksToChunk(chunk);
      } else {
        this.worldGen.generateChunk(chunk);
        this._applyModifiedBlocksToChunk(chunk);
      }
      this.chunks.set(key, chunk);
      if (!chunk.lightCalculated) {
        this.lighting.initChunkLighting(this, chunk);
      }
      if (this.unlimitedMemory) {
        this._saveToCache(chunk);
      }
      this._markOrthogonalNeighborsDirty(cx, cz);
    }
    return chunk;
  }

  _requestChunkAsyncOrSync(cx, cz) {
    const key = chunkKey(cx, cz);
    if (this.chunks.has(key)) return true;

    if (this.chunkDataCache.has(key)) {
      this._ensureChunkGeneratedSync(cx, cz);
      return true;
    }

    if (this.workers.length > 0) {
      if (this.inFlightKeys.has(key)) return true;
      if (this.inFlightKeys.size >= 4) return false;
      this.inFlightKeys.add(key);
      const worker = this.workers[this.nextWorkerIdx % this.workers.length];
      this.nextWorkerIdx++;
      worker.postMessage({ seed: this.seed, cx, cz });
      return true;
    }

    this._ensureChunkGeneratedSync(cx, cz);
    return true;
  }

  _rebuildChunkMesh(chunk) {
    const oldOpaque = chunk.opaqueMesh;
    const oldCutout = chunk.cutoutMesh;
    const oldWater = chunk.waterMesh;
    const oldIce = chunk.iceMesh;

    // Collect 3x3 neighbor chunk references once per chunk build (zero Map lookups in inner loop!)
    const nb = this._neighborScratch;
    let ni = 0;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        nb[ni++] = (dx === 0 && dz === 0)
          ? chunk
          : (this.chunks.get(chunkKey(chunk.cx + dx, chunk.cz + dz)) || null);
      }
    }

    const { opaqueGeometry, cutoutGeometry, waterGeometry, iceGeometry } = this.mesher.buildChunkGeometries(chunk, nb);

    const worldX = chunk.cx * CHUNK_SIZE;
    const worldZ = chunk.cz * CHUNK_SIZE;

    if (oldOpaque) {
      this.scene.remove(oldOpaque);
      oldOpaque.geometry.dispose();
      chunk.opaqueMesh = null;
    }
    if (oldCutout) {
      this.scene.remove(oldCutout);
      oldCutout.geometry.dispose();
      chunk.cutoutMesh = null;
    }
    if (oldWater) {
      this.scene.remove(oldWater);
      oldWater.geometry.dispose();
      chunk.waterMesh = null;
    }
    if (oldIce) {
      this.scene.remove(oldIce);
      oldIce.geometry.dispose();
      chunk.iceMesh = null;
    }

    if (opaqueGeometry) {
      const mesh = new THREE.Mesh(opaqueGeometry, this.mesher.opaqueMaterial);
      mesh.position.set(worldX, 0, worldZ);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      mesh.frustumCulled = true;
      this.scene.add(mesh);
      chunk.opaqueMesh = mesh;
    }

    if (cutoutGeometry) {
      const mesh = new THREE.Mesh(cutoutGeometry, this.mesher.cutoutMaterial);
      mesh.position.set(worldX, 0, worldZ);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      mesh.frustumCulled = true;
      this.scene.add(mesh);
      chunk.cutoutMesh = mesh;
    }

    if (iceGeometry) {
      const mesh = new THREE.Mesh(iceGeometry, this.mesher.iceMaterial);
      mesh.position.set(worldX, 0, worldZ);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      mesh.renderOrder = 1;
      mesh.frustumCulled = true;
      this.scene.add(mesh);
      chunk.iceMesh = mesh;
    }

    if (waterGeometry) {
      const mesh = new THREE.Mesh(waterGeometry, this.mesher.waterMaterial);
      mesh.position.set(worldX, 0, worldZ);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      mesh.renderOrder = 2;
      mesh.frustumCulled = true;
      this.scene.add(mesh);
      chunk.waterMesh = mesh;
    }

    chunk.dirty = false;
    chunk.hasMeshed = true;
  }

  update(playerX, playerZ, dt = 0.016) {
    this.lighting.update(dt, this);

    const pcx = Math.floor(playerX / CHUNK_SIZE);
    const pcz = Math.floor(playerZ / CHUNK_SIZE);

    if (pcx !== this.lastPlayerChunkX || pcz !== this.lastPlayerChunkZ) {
      this.lastPlayerChunkX = pcx;
      this.lastPlayerChunkZ = pcz;

      const unloadDistSq = (this.renderDistance + 2) * (this.renderDistance + 2);
      for (const [key, chunk] of this.chunks) {
        const dx = chunk.cx - pcx;
        const dz = chunk.cz - pcz;
        if (dx * dx + dz * dz > unloadDistSq) {
          if (this.unlimitedMemory) {
            this._saveToCache(chunk);
          } else {
            this.chunkDataCache.delete(key);
          }
          chunk.disposeMeshes(this.scene);
          this.chunks.delete(key);
        }
      }
      if (this.pendingLightChunks.length > 0) {
        this.pendingLightChunks = this.pendingLightChunks.filter((c) => this.chunks.has(c.key));
      }

      this.pendingCoords = this._collectSpiralCoords(pcx, pcz, this.renderDistance);
    }

    const startTime = performance.now();

    // 1. Spread initial voxel lighting across frames under CHUNK_FRAME_BUDGET_MS (prevents mobile spikes!)
    if (this.pendingLightChunks.length > 0) {
      this.pendingLightChunks.sort((a, b) => {
        const da = (a.cx - pcx) * (a.cx - pcx) + (a.cz - pcz) * (a.cz - pcz);
        const db = (b.cx - pcx) * (b.cx - pcx) + (b.cz - pcz) * (b.cz - pcz);
        return da - db;
      });
      const chunk = this.pendingLightChunks.shift();
      if (chunk && this.chunks.has(chunk.key) && !chunk.lightCalculated) {
        this.lighting.initChunkLighting(this, chunk);
        chunk.dirty = true;
        if (this.unlimitedMemory) this._saveToCache(chunk);
        this._markOrthogonalNeighborsDirty(chunk.cx, chunk.cz);
      }
    }

    let syncDispatched = 0;
    while (this.pendingCoords.length > 0) {
      if (performance.now() - startTime >= CHUNK_FRAME_BUDGET_MS) break;
      const [cx, cz] = this.pendingCoords[0];
      const key = chunkKey(cx, cz);
      if (this.chunks.has(key)) {
        this.pendingCoords.shift();
        continue;
      }
      const isCached = this.chunkDataCache.has(key);
      if (!isCached && this.workers.length === 0 && syncDispatched >= 1) break;
      const dispatched = this._requestChunkAsyncOrSync(cx, cz);
      if (!dispatched) break;
      if (!isCached && this.workers.length === 0) syncDispatched++;
      this.pendingCoords.shift();
    }

    const dirtyChunks = this._dirtyScratch;
    dirtyChunks.length = 0;
    for (const chunk of this.chunks.values()) {
      if (chunk.dirty && chunk.isGenerated && chunk.lightCalculated) {
        const dx = chunk.cx - pcx;
        const dz = chunk.cz - pcz;
        dirtyChunks.push({ chunk, distSq: dx * dx + dz * dz });
      }
    }
    if (dirtyChunks.length > 0) {
      dirtyChunks.sort((a, b) => a.distSq - b.distSq);
      // Smooth mobile chunk streaming: max 2 meshes/frame when under budget, and skip distant chunks if frame budget already spent
      const maxMeshes = 2;
      for (let i = 0; i < dirtyChunks.length && i < maxMeshes; i++) {
        const entry = dirtyChunks[i];
        const elapsed = performance.now() - startTime;
        if (i > 0 && elapsed >= CHUNK_FRAME_BUDGET_MS) break;
        if (i === 0 && entry.distSq > 2 && elapsed >= CHUNK_FRAME_BUDGET_MS * 1.15) break;
        this._rebuildChunkMesh(entry.chunk);
      }
    }

    // Stage 6 random ticks: farmland hydration & wheat growth
    this._randomTickAccum += dt;
    if (this._randomTickAccum >= 0.25) {
      this._randomTickAccum -= 0.25;
      this._stepRandomTicks(pcx, pcz);
    }
  }

  stepRandomTicks(playerX, playerZ) {
    const pcx = Math.floor(playerX / CHUNK_SIZE);
    const pcz = Math.floor(playerZ / CHUNK_SIZE);
    this._stepRandomTicks(pcx, pcz);
  }

  _stepRandomTicks(pcx, pcz) {
    // Authentic Minecraft randomTickSpeed = 3 per active 16x16x16 sub-chunk within radius <= 3
    for (let dz = -3; dz <= 3; dz++) {
      for (let dx = -3; dx <= 3; dx++) {
        if (dx * dx + dz * dz > 10) continue;
        const chunk = this.chunks.get(chunkKey(pcx + dx, pcz + dz));
        if (!chunk || !chunk.isGenerated || chunk.maxY <= 1) continue;

        const minSec = Math.max(0, chunk.minY >> 4);
        const maxSec = Math.min((WORLD_HEIGHT - 1) >> 4, chunk.maxY >> 4);
        for (let sec = minSec; sec <= maxSec; sec++) {
          const baseY = sec << 4;
          for (let t = 0; t < 3; t++) {
            const lx = (Math.random() * CHUNK_SIZE) | 0;
            const lz = (Math.random() * CHUNK_SIZE) | 0;
            const wy = baseY + ((Math.random() * 16) | 0);
            if (wy <= 0 || wy >= WORLD_HEIGHT - 1) continue;

            const id = chunk.getBlock(lx, wy, lz);
            if (id === 0) continue;

            const wx = chunk.cx * CHUNK_SIZE + lx;
            const wz = chunk.cz * CHUNK_SIZE + lz;
            const def = BlockRegistry.get(id);

            if (def.isFarmland) {
              const nearWater = this._hasWaterNear(wx, wy, wz);
              const curMeta = chunk.getMeta(lx, wy, lz);
              if (nearWater && curMeta === 0) {
                this.setBlock(wx, wy, wz, id, true, false, 7);
              } else if (!nearWater && curMeta > 0) {
                const above = this.getBlock(wx, wy + 1, wz);
                if (!BlockRegistry.isCrop(above) && Math.random() < 0.35) {
                  this.setBlock(wx, wy, wz, id, true, false, 0);
                }
              }
            } else if (def.isCrop && def.cropStage < 7) {
              const belowId = this.getBlock(wx, wy - 1, wz);
              if (!BlockRegistry.get(belowId).isFarmland) {
                continue;
              }
              const light = this.getLightAt(wx, wy, wz);
              if (Math.max(light.sky, light.block) < 8) continue;
              const wet = this.getBlockMeta(wx, wy - 1, wz) > 0;
              const growChance = wet ? 0.42 : 0.2;
              if (Math.random() < growChance) {
                this.setBlock(wx, wy, wz, id + 1, true, false, 0);
              }
            }
          }
        }
      }
    }
  }

  _hasWaterNear(wx, wy, wz) {
    for (let dy = 0; dy <= 1; dy++) {
      for (let dz = -4; dz <= 4; dz++) {
        for (let dx = -4; dx <= 4; dx++) {
          if (BlockRegistry.isLiquid(this.getBlock(wx + dx, wy + dy, wz + dz))) {
            return true;
          }
        }
      }
    }
    return false;
  }

  dispose() {
    this.disposed = true;
    this._terminateWorkers();
    this.lighting.clear();
    this.pendingLightChunks.length = 0;
    for (const chunk of this.chunks.values()) {
      chunk.disposeMeshes(this.scene);
    }
    this.chunks.clear();
    this.chunkDataCache.clear();
    this.mesher.opaqueMaterial.dispose();
    this.mesher.cutoutMaterial.dispose();
    this.mesher.waterMaterial.dispose();
    this.mesher.iceMaterial.dispose();
  }
}
