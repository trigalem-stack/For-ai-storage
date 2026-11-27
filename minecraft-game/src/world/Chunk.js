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
    this.dirty = true;
    return true;
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
