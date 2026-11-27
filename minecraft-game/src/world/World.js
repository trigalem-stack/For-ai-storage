import * as THREE from '../../vendor/three.module.min.js';
import { BlockRegistry } from '../blocks/BlockRegistry.js';
import { CHUNK_FRAME_BUDGET_MS, CHUNK_SIZE, WORLD_HEIGHT } from '../constants.js';
import { Chunk, chunkKey } from './Chunk.js';
import { ChunkMesher } from './ChunkMesher.js';
import { WorldGen } from './WorldGen.js';

export class World {
  constructor(scene, atlas, seed, renderDistance = 6, options = {}) {
    this.scene = scene;
    this.atlas = atlas;
    this.seed = seed;
    this.renderDistance = renderDistance;
    this.unlimitedMemory = options.unlimitedMemory !== undefined ? Boolean(options.unlimitedMemory) : true;

    this.worldGen = new WorldGen(seed);
    this.mesher = new ChunkMesher(atlas);

    // Active chunks (within render distance + hysteresis)
    this.chunks = new Map(); // key -> Chunk
    // Unlimited RAM cache of visited/modified chunk voxel arrays (keeps VRAM low when unloaded from GPU)
    this.chunkDataCache = new Map(); // key -> { blocks: Uint8Array, minY, maxY }
    // Delta map of player-modified blocks + per-chunk O(1) lookup index
    this.modifiedBlocks = new Map(); // "wx,wy,wz" -> blockId
    this.modifiedByChunk = new Map(); // "cx,cz" -> Array<[lx, wy, lz, id]>

    this.lastPlayerChunkX = null;
    this.lastPlayerChunkZ = null;
    this.pendingCoords = [];

    // Sky & atmospheric fog synced to render distance
    this.skyColor = new THREE.Color('#87bdff');
    this.scene.background = this.skyColor;
    this._updateFog();
  }

  setRenderDistance(distance) {
    this.renderDistance = distance;
    this.lastPlayerChunkX = null;
    this.lastPlayerChunkZ = null;
    this._updateFog();
  }

  setUnlimitedMemory(enabled) {
    this.unlimitedMemory = Boolean(enabled);
    if (!this.unlimitedMemory) {
      // Evict unmodified out-of-range cached chunks in economy mode
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
    if (!Array.isArray(entries)) return;
    for (const item of entries) {
      if (!Array.isArray(item) || item.length < 4) continue;
      const [wx, wy, wz, id] = item;
      this.modifiedBlocks.set(`${wx},${wy},${wz}`, id);
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
      list.push([lx, wy, lz, id]);
      const chunk = this.chunks.get(cKey);
      if (chunk && chunk.isGenerated) {
        chunk.setBlock(lx, wy, lz, id);
      }
    }
  }

  exportModifiedBlocks() {
    const out = [];
    for (const [coordKey, id] of this.modifiedBlocks) {
      const parts = coordKey.split(',');
      out.push([Number(parts[0]), Number(parts[1]), Number(parts[2]), id]);
    }
    return out;
  }

  _updateFog() {
    const farDist = Math.max(24, this.renderDistance * CHUNK_SIZE - 4);
    const nearDist = Math.max(12, farDist * 0.48);
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

  /**
   * Sets a block at world coordinates, records offline delta, and optionally rebuilds
   * the current + bordering neighbor chunks immediately in the same frame (zero hole artifacts).
   */
  setBlock(wx, wy, wz, id, rebuildImmediate = true) {
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
    if (!chunk.setBlock(lx, fy, lz, id)) return false;

    this.modifiedBlocks.set(`${fx},${fy},${fz}`, id);
    let cMods = this.modifiedByChunk.get(chunk.key);
    if (!cMods) {
      cMods = [];
      this.modifiedByChunk.set(chunk.key, cMods);
    }
    const existingMod = cMods.find((m) => m[0] === lx && m[1] === fy && m[2] === lz);
    if (existingMod) existingMod[3] = id;
    else cMods.push([lx, fy, lz, id]);
    if (this.unlimitedMemory) {
      this.chunkDataCache.set(chunk.key, {
        blocks: chunk.blocks,
        minY: chunk.minY,
        maxY: chunk.maxY,
      });
    }

    const rebuildTargets = [chunk];
    const pushNeighborIfPresent = (ncx, ncz) => {
      const n = this.chunks.get(chunkKey(ncx, ncz));
      if (n && n.isGenerated) {
        n.dirty = true;
        rebuildTargets.push(n);
      }
    };

    if (lx === 0) pushNeighborIfPresent(cx - 1, cz);
    if (lx === CHUNK_SIZE - 1) pushNeighborIfPresent(cx + 1, cz);
    if (lz === 0) pushNeighborIfPresent(cx, cz - 1);
    if (lz === CHUNK_SIZE - 1) pushNeighborIfPresent(cx, cz + 1);

    // Diagonal neighbors matter for corner AO when breaking/placing right on chunk corners
    if (lx === 0 && lz === 0) pushNeighborIfPresent(cx - 1, cz - 1);
    if (lx === CHUNK_SIZE - 1 && lz === 0) pushNeighborIfPresent(cx + 1, cz - 1);
    if (lx === 0 && lz === CHUNK_SIZE - 1) pushNeighborIfPresent(cx - 1, cz + 1);
    if (lx === CHUNK_SIZE - 1 && lz === CHUNK_SIZE - 1) pushNeighborIfPresent(cx + 1, cz + 1);

    if (rebuildImmediate) {
      for (const target of rebuildTargets) {
        this._rebuildChunkMesh(target);
      }
    }
    return true;
  }

  /**
   * Finds the highest solid block top Y at (wx, wz) for safe initial spawning.
   */
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

  _markNeighborsDirty(cx, cz) {
    this._markDirty(cx - 1, cz);
    this._markDirty(cx + 1, cz);
    this._markDirty(cx, cz - 1);
    this._markDirty(cx, cz + 1);
    this._markDirty(cx - 1, cz - 1);
    this._markDirty(cx + 1, cz - 1);
    this._markDirty(cx - 1, cz + 1);
    this._markDirty(cx + 1, cz + 1);
  }

  preloadSpawnArea(playerX, playerZ, radius = 2) {
    const pcx = Math.floor(playerX / CHUNK_SIZE);
    const pcz = Math.floor(playerZ / CHUNK_SIZE);
    const coords = this._collectSpiralCoords(pcx, pcz, radius);

    for (const [cx, cz] of coords) {
      this._ensureChunkGenerated(cx, cz);
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
      const [lx, wy, lz, id] = mods[i];
      if (wy >= 0 && wy < WORLD_HEIGHT) {
        chunk.setBlock(lx, wy, lz, id);
      }
    }
  }

  _ensureChunkGenerated(cx, cz) {
    const key = chunkKey(cx, cz);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = new Chunk(cx, cz);
      const cached = this.chunkDataCache.get(key);
      if (cached) {
        chunk.blocks = cached.blocks;
        chunk.minY = cached.minY;
        chunk.maxY = cached.maxY;
        chunk.isGenerated = true;
        chunk.dirty = true;
        this._applyModifiedBlocksToChunk(chunk);
      } else {
        this.worldGen.generateChunk(chunk);
        this._applyModifiedBlocksToChunk(chunk);
        if (this.unlimitedMemory) {
          this.chunkDataCache.set(key, {
            blocks: chunk.blocks,
            minY: chunk.minY,
            maxY: chunk.maxY,
          });
        }
      }
      this.chunks.set(key, chunk);
      this._markNeighborsDirty(cx, cz);
    }
    return chunk;
  }

  _rebuildChunkMesh(chunk) {
    const oldOpaque = chunk.opaqueMesh;
    const oldCutout = chunk.cutoutMesh;
    const oldWater = chunk.waterMesh;

    const { opaqueGeometry, cutoutGeometry, waterGeometry } = this.mesher.buildChunkGeometries(
      chunk,
      (wx, wy, wz) => this.getBlock(wx, wy, wz)
    );

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

  /**
   * Streams chunks around the player within <= 3.5 ms per frame,
   * disposing GPU meshes on distant chunks while keeping unlimited RAM cache when enabled.
   */
  update(playerX, playerZ) {
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
            this.chunkDataCache.set(key, {
              blocks: chunk.blocks,
              minY: chunk.minY,
              maxY: chunk.maxY,
            });
          } else {
            this.chunkDataCache.delete(key);
          }
          chunk.disposeMeshes(this.scene);
          this.chunks.delete(key);
        }
      }

      this.pendingCoords = this._collectSpiralCoords(pcx, pcz, this.renderDistance);
    }

    const startTime = performance.now();

    while (this.pendingCoords.length > 0) {
      if (performance.now() - startTime >= CHUNK_FRAME_BUDGET_MS) return;
      const [cx, cz] = this.pendingCoords.shift();
      if (!this.chunks.has(chunkKey(cx, cz))) {
        this._ensureChunkGenerated(cx, cz);
      }
    }

    const dirtyChunks = [];
    for (const chunk of this.chunks.values()) {
      if (chunk.dirty && chunk.isGenerated) {
        const dx = chunk.cx - pcx;
        const dz = chunk.cz - pcz;
        dirtyChunks.push([chunk, dx * dx + dz * dz]);
      }
    }
    if (dirtyChunks.length === 0) return;

    dirtyChunks.sort((a, b) => a[1] - b[1]);
    for (let i = 0; i < dirtyChunks.length; i++) {
      if (i > 0 && performance.now() - startTime >= CHUNK_FRAME_BUDGET_MS) break;
      this._rebuildChunkMesh(dirtyChunks[i][0]);
    }
  }

  dispose() {
    for (const chunk of this.chunks.values()) {
      chunk.disposeMeshes(this.scene);
    }
    this.chunks.clear();
    this.chunkDataCache.clear();
    this.mesher.opaqueMaterial.dispose();
    this.mesher.cutoutMaterial.dispose();
    this.mesher.waterMaterial.dispose();
  }
}
