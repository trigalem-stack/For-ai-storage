import { CHUNK_SIZE, CHUNK_VOLUME, WORLD_HEIGHT } from '../constants.js';

export function chunkKey(cx, cz) {
  return `${cx},${cz}`;
}

export class Chunk {
  constructor(cx, cz) {
    this.cx = cx;
    this.cz = cz;
    this.key = chunkKey(cx, cz);

    // Compact flat typed array (32 KB per chunk)
    this.blocks = new Uint8Array(CHUNK_VOLUME);

    // Non-air vertical bounds to skip empty sky layers during meshing
    this.minY = 0;
    this.maxY = WORLD_HEIGHT - 1;

    // Stage 4 lighting buffers (lazy-allocated when lighting is enabled)
    this.skyLight = null;
    this.blockLight = null;

    this.isGenerated = false;
    this.dirty = true;
    this.hasMeshed = false;

    // Three.js mesh references managed by World
    this.opaqueMesh = null;
    this.cutoutMesh = null;
    this.waterMesh = null;
  }

  getBlock(x, y, z) {
    if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT) {
      return 0;
    }
    return this.blocks[(y * CHUNK_SIZE + z) * CHUNK_SIZE + x];
  }

  setBlock(x, y, z, id) {
    if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT) {
      return false;
    }
    this.blocks[(y * CHUNK_SIZE + z) * CHUNK_SIZE + x] = id;
    if (id !== 0) {
      if (y < this.minY) this.minY = y;
      if (y > this.maxY) this.maxY = y;
    }
    this.dirty = true;
    return true;
  }

  recomputeVerticalBounds() {
    let minY = WORLD_HEIGHT - 1;
    let maxY = 0;
    const blocks = this.blocks;
    const slice = CHUNK_SIZE * CHUNK_SIZE;
    for (let y = 0; y < WORLD_HEIGHT; y++) {
      const start = y * slice;
      const end = start + slice;
      for (let i = start; i < end; i++) {
        if (blocks[i] !== 0) {
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          break;
        }
      }
    }
    this.minY = minY <= maxY ? minY : 0;
    this.maxY = minY <= maxY ? maxY : 0;
  }

  disposeMeshes(scene) {
    const meshes = [this.opaqueMesh, this.cutoutMesh, this.waterMesh];
    for (const mesh of meshes) {
      if (mesh) {
        scene.remove(mesh);
        if (mesh.geometry) mesh.geometry.dispose();
      }
    }
    this.opaqueMesh = null;
    this.cutoutMesh = null;
    this.waterMesh = null;
  }
}
