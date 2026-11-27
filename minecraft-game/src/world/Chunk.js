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
    // Biome ID per (x, z) column (256 bytes per chunk)
    this.biomes = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
    // Packed dual-channel lighting: high nibble = skyLight (0..15), low nibble = blockLight (0..15)
    this.light = new Uint8Array(CHUNK_VOLUME);
    // Lazy-allocated per-block metadata (wall/floor torch orientation, bed/pumpkin facing)
    this.meta = null;

    // Non-air vertical bounds to skip empty sky layers during meshing
    this.minY = 0;
    this.maxY = WORLD_HEIGHT - 1;

    this.isGenerated = false;
    this.lightCalculated = false;
    this.dirty = true;
    this.hasMeshed = false;

    // Three.js mesh references managed by World
    this.opaqueMesh = null;
    this.cutoutMesh = null;
    this.waterMesh = null;
    this.iceMesh = null;
  }

  getBlock(x, y, z) {
    if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT) {
      return 0;
    }
    return this.blocks[(y * CHUNK_SIZE + z) * CHUNK_SIZE + x];
  }

  setBlock(x, y, z, id, meta = 0) {
    if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT) {
      return false;
    }
    const idx = (y * CHUNK_SIZE + z) * CHUNK_SIZE + x;
    this.blocks[idx] = id;
    if (meta !== 0) {
      if (!this.meta) this.meta = new Uint8Array(CHUNK_VOLUME);
      this.meta[idx] = meta;
    } else if (this.meta) {
      this.meta[idx] = 0;
    }
    if (id !== 0) {
      if (y < this.minY) this.minY = y;
      if (y > this.maxY) this.maxY = y;
    }
    this.dirty = true;
    return true;
  }

  getMeta(x, y, z) {
    if (!this.meta || x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT) {
      return 0;
    }
    return this.meta[(y * CHUNK_SIZE + z) * CHUNK_SIZE + x];
  }

  setMeta(x, y, z, meta) {
    if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT) {
      return;
    }
    const idx = (y * CHUNK_SIZE + z) * CHUNK_SIZE + x;
    if (meta !== 0) {
      if (!this.meta) this.meta = new Uint8Array(CHUNK_VOLUME);
      this.meta[idx] = meta;
    } else if (this.meta) {
      this.meta[idx] = 0;
    }
    this.dirty = true;
  }

  getSkyLight(x, y, z) {
    if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE) return 15;
    if (y >= WORLD_HEIGHT) return 15;
    if (y < 0) return 0;
    return (this.light[(y * CHUNK_SIZE + z) * CHUNK_SIZE + x] >> 4) & 0x0f;
  }

  setSkyLight(x, y, z, val) {
    if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT) return;
    const idx = (y * CHUNK_SIZE + z) * CHUNK_SIZE + x;
    this.light[idx] = ((val & 0x0f) << 4) | (this.light[idx] & 0x0f);
  }

  getBlockLight(x, y, z) {
    if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT) return 0;
    return this.light[(y * CHUNK_SIZE + z) * CHUNK_SIZE + x] & 0x0f;
  }

  setBlockLight(x, y, z, val) {
    if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT) return;
    const idx = (y * CHUNK_SIZE + z) * CHUNK_SIZE + x;
    this.light[idx] = (this.light[idx] & 0xf0) | (val & 0x0f);
  }

  getBiome(x, z) {
    if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE) return 0;
    return this.biomes[z * CHUNK_SIZE + x];
  }

  setBiome(x, z, biomeId) {
    if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE) return;
    this.biomes[z * CHUNK_SIZE + x] = biomeId;
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
    const meshes = [this.opaqueMesh, this.cutoutMesh, this.waterMesh, this.iceMesh];
    for (const mesh of meshes) {
      if (mesh) {
        scene.remove(mesh);
        if (mesh.geometry) mesh.geometry.dispose();
      }
    }
    this.opaqueMesh = null;
    this.cutoutMesh = null;
    this.waterMesh = null;
    this.iceMesh = null;
  }
}
