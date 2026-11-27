import * as THREE from '../../vendor/three.module.min.js';
import { CHUNK_FRAME_BUDGET_MS, CHUNK_SIZE, WORLD_HEIGHT } from '../constants.js';
import { Chunk, chunkKey } from './Chunk.js';
import { ChunkMesher } from './ChunkMesher.js';
import { WorldGen } from './WorldGen.js';

export class World {
  constructor(scene, atlas, seed, renderDistance = 6) {
    this.scene = scene;
    this.atlas = atlas;
    this.seed = seed;
    this.renderDistance = renderDistance;

    this.worldGen = new WorldGen(seed);
    this.mesher = new ChunkMesher(atlas);
    this.chunks = new Map(); // key -> Chunk

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
   * Sets a block in world coordinates and marks affected chunk + neighboring edge chunks dirty.
   * Direct hook for Stage 2 mining/placing and Stage 7 fluid flow.
   */
  setBlock(wx, wy, wz, id) {
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

    if (lx === 0) this._markDirty(cx - 1, cz);
    if (lx === CHUNK_SIZE - 1) this._markDirty(cx + 1, cz);
    if (lz === 0) this._markDirty(cx, cz - 1);
    if (lz === CHUNK_SIZE - 1) this._markDirty(cx, cz + 1);
    return true;
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
      for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
        const id = chunk.getBlock(lx, y, lz);
        if (id !== 0 && id !== 12 && id !== 8) { // solid ground (not air, water, leaves)
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
    // Diagonal neighbors matter for seamless corner Ambient Occlusion on chunk corners
    this._markDirty(cx - 1, cz - 1);
    this._markDirty(cx + 1, cz - 1);
    this._markDirty(cx - 1, cz + 1);
    this._markDirty(cx + 1, cz + 1);
  }

  /**
   * Synchronously generates & meshes the immediate spawn radius so the first frame is populated.
   */
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

  _ensureChunkGenerated(cx, cz) {
    const key = chunkKey(cx, cz);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = new Chunk(cx, cz);
      this.chunks.set(key, chunk);
      this.worldGen.generateChunk(chunk);
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
   * Streams chunks around the player within a strict per-frame time budget (<= 4ms),
   * unloading out-of-range chunks and calling geometry.dispose() to prevent GPU leaks.
   */
  update(playerX, playerZ) {
    const pcx = Math.floor(playerX / CHUNK_SIZE);
    const pcz = Math.floor(playerZ / CHUNK_SIZE);

    if (pcx !== this.lastPlayerChunkX || pcz !== this.lastPlayerChunkZ) {
      this.lastPlayerChunkX = pcx;
      this.lastPlayerChunkZ = pcz;

      // Unload distant chunks (radius + 2 hysteresis avoids thrashing on chunk borders)
      const unloadDistSq = (this.renderDistance + 2) * (this.renderDistance + 2);
      for (const [key, chunk] of this.chunks) {
        const dx = chunk.cx - pcx;
        const dz = chunk.cz - pcz;
        if (dx * dx + dz * dz > unloadDistSq) {
          chunk.disposeMeshes(this.scene);
          this.chunks.delete(key);
        }
      }

      this.pendingCoords = this._collectSpiralCoords(pcx, pcz, this.renderDistance);
    }

    const startTime = performance.now();

    // 1. Generate missing chunks inside render distance
    while (this.pendingCoords.length > 0) {
      if (performance.now() - startTime >= CHUNK_FRAME_BUDGET_MS) return;
      const [cx, cz] = this.pendingCoords.shift();
      if (!this.chunks.has(chunkKey(cx, cz))) {
        this._ensureChunkGenerated(cx, cz);
      }
    }

    // 2. Rebuild dirty chunk meshes nearest-first within remaining frame budget
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
    this.mesher.opaqueMaterial.dispose();
    this.mesher.cutoutMaterial.dispose();
    this.mesher.waterMaterial.dispose();
  }
}
