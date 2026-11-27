import { BLOCK_IDS } from '../blocks/BlockRegistry.js';
import { CHUNK_SIZE, SEA_LEVEL, WORLD_HEIGHT } from '../constants.js';
import { SeededNoise, hash2D, hash3D, normalizeSeed } from './Noise.js';

const TREE_CELL_SIZE = 6; // Macro grid cell size for uniform natural spacing without cross-chunk clipping

export class WorldGen {
  constructor(seed) {
    this.seed = normalizeSeed(seed);
    this.continentalNoise = new SeededNoise(this.seed ^ 0x1a2b3c4d);
    this.detailNoise = new SeededNoise(this.seed ^ 0x5f6e7d8c);
    this.mountainNoise = new SeededNoise(this.seed ^ 0x2468ace1);
    this.forestNoise = new SeededNoise(this.seed ^ 0x9e3779b9);
  }

  /**
   * Computes terrain surface Y at world coordinates (wx, wz).
   * Hook for Stage 3 biomes & caves.
   */
  getTerrainHeight(wx, wz) {
    const cont = this.continentalNoise.fbm2D(wx * 0.0045, wz * 0.0045, 4, 0.5, 2.0);
    const hills = this.detailNoise.fbm2D(wx * 0.015, wz * 0.015, 3, 0.48, 2.05);
    const ridgeMask = Math.max(0, this.mountainNoise.fbm2D(wx * 0.0032 + 17.3, wz * 0.0032 - 9.1, 2, 0.5, 2.0) + 0.12);
    const ridge = this.mountainNoise.ridged2D(wx * 0.009, wz * 0.009, 3, 0.5, 2.1);

    // Base sea/plains/hills + dramatic mountain peaks
    let height = 65.5 + cont * 17.5 + hills * 6.5;
    if (ridgeMask > 0.12) {
      const mFactor = Math.min(1, (ridgeMask - 0.12) * 2.2);
      height += ridge * 32.0 * mFactor * mFactor;
    }

    const clamped = Math.max(4, Math.min(WORLD_HEIGHT - 16, Math.round(height)));
    return clamped;
  }

  getForestDensity(wx, wz) {
    const d = this.forestNoise.fbm2D(wx * 0.008 - 41.2, wz * 0.008 + 23.7, 2, 0.5, 2.0);
    return Math.max(0, Math.min(1, (d + 0.55) * 0.85));
  }

  getSurfaceBlock(wx, wz, height) {
    if (height >= 94) return BLOCK_IDS.SNOW;
    if (height >= 85) return BLOCK_IDS.SNOW_GRASS;
    if (height <= SEA_LEVEL + 1) return BLOCK_IDS.SAND;
    if (height === SEA_LEVEL + 2 && hash2D(this.seed ^ 0x333, wx, wz) > 0.45) {
      return BLOCK_IDS.SAND;
    }
    return BLOCK_IDS.GRASS;
  }

  /**
   * Generates all terrain blocks and cross-chunk oak trees for a chunk.
   */
  generateChunk(chunk) {
    const baseX = chunk.cx * CHUNK_SIZE;
    const baseZ = chunk.cz * CHUNK_SIZE;
    const blocks = chunk.blocks;

    // 1. Base column terrain (bedrock, stone, dirt/sand, grass/snow, water)
    const heightMap = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);

    for (let z = 0; z < CHUNK_SIZE; z++) {
      const wz = baseZ + z;
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const wx = baseX + x;
        const h = this.getTerrainHeight(wx, wz);
        heightMap[z * CHUNK_SIZE + x] = h;

        const topBlock = this.getSurfaceBlock(wx, wz, h);
        const subBlock = topBlock === BLOCK_IDS.SAND ? BLOCK_IDS.SAND : BLOCK_IDS.DIRT;
        const dirtDepth = topBlock === BLOCK_IDS.SNOW ? 2 : 3 + (hash2D(this.seed ^ 0x77, wx, wz) > 0.5 ? 1 : 0);

        for (let y = 0; y <= h; y++) {
          let blockId = BLOCK_IDS.STONE;
          if (y === 0) {
            blockId = BLOCK_IDS.BEDROCK;
          } else if (y <= 2 && hash3D(this.seed ^ 0x111, wx, y, wz) < (3 - y) * 0.38) {
            blockId = BLOCK_IDS.BEDROCK;
          } else if (y === h) {
            blockId = topBlock;
          } else if (y >= h - dirtDepth) {
            blockId = subBlock;
          }
          blocks[(y * CHUNK_SIZE + z) * CHUNK_SIZE + x] = blockId;
        }

        // Fill water basins up to SEA_LEVEL
        if (h < SEA_LEVEL) {
          for (let y = h + 1; y <= SEA_LEVEL; y++) {
            blocks[(y * CHUNK_SIZE + z) * CHUNK_SIZE + x] = BLOCK_IDS.WATER;
          }
        }
      }
    }

    // 2. Deterministic cross-chunk oak trees (evaluate macro cells overlapping [baseX-3..baseX+18])
    const minCellX = Math.floor((baseX - 3) / TREE_CELL_SIZE);
    const maxCellX = Math.floor((baseX + CHUNK_SIZE + 2) / TREE_CELL_SIZE);
    const minCellZ = Math.floor((baseZ - 3) / TREE_CELL_SIZE);
    const maxCellZ = Math.floor((baseZ + CHUNK_SIZE + 2) / TREE_CELL_SIZE);

    for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ++) {
      for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
        const anchorX = cellX * TREE_CELL_SIZE + Math.floor(hash2D(this.seed ^ 0x41a, cellX, cellZ) * TREE_CELL_SIZE);
        const anchorZ = cellZ * TREE_CELL_SIZE + Math.floor(hash2D(this.seed ^ 0x82b, cellX, cellZ) * TREE_CELL_SIZE);

        // Quick bounding test against chunk [baseX..baseX+15] with canopy radius 2
        if (
          anchorX + 2 < baseX ||
          anchorX - 2 >= baseX + CHUNK_SIZE ||
          anchorZ + 2 < baseZ ||
          anchorZ - 2 >= baseZ + CHUNK_SIZE
        ) {
          continue;
        }

        const density = this.getForestDensity(anchorX, anchorZ);
        const spawnRoll = hash2D(this.seed ^ 0x9c3, anchorX, anchorZ);
        if (spawnRoll > 0.14 + density * 0.56) continue;

        const groundY = this.getTerrainHeight(anchorX, anchorZ);
        if (groundY < SEA_LEVEL + 2 || groundY > 83) continue;
        if (this.getSurfaceBlock(anchorX, anchorZ, groundY) !== BLOCK_IDS.GRASS) continue;

        this._placeOakTreeIntoChunk(chunk, baseX, baseZ, anchorX, groundY, anchorZ);
      }
    }

    chunk.isGenerated = true;
    chunk.dirty = true;
  }

  _placeOakTreeIntoChunk(chunk, baseX, baseZ, tx, groundY, tz) {
    const trunkHeight = 4 + Math.floor(hash2D(this.seed ^ 0xf12, tx, tz) * 3); // 4..6
    const topY = groundY + trunkHeight;
    if (topY + 2 >= WORLD_HEIGHT) return;

    // Place leaves first (so trunk overwrites center column cleanly)
    for (let ly = topY - 2; ly <= topY + 1; ly++) {
      const distFromTop = topY + 1 - ly;
      const radius = distFromTop <= 1 ? 1 : 2;
      for (let dz = -radius; dz <= radius; dz++) {
        const wz = tz + dz;
        const lz = wz - baseZ;
        if (lz < 0 || lz >= CHUNK_SIZE) continue;

        for (let dx = -radius; dx <= radius; dx++) {
          const wx = tx + dx;
          const lx = wx - baseX;
          if (lx < 0 || lx >= CHUNK_SIZE) continue;

          // Classic rounded Minecraft oak crown corners
          if (Math.abs(dx) === radius && Math.abs(dz) === radius) {
            if (distFromTop === 0) continue; // Top layer is a cross (+)
            if (hash3D(this.seed ^ 0x60d, wx, ly, wz) < 0.45) continue;
          }

          if (chunk.getBlock(lx, ly, lz) === BLOCK_IDS.AIR) {
            chunk.setBlock(lx, ly, lz, BLOCK_IDS.OAK_LEAVES);
          }
        }
      }
    }

    // Place trunk & dirt base under trunk
    const tlx = tx - baseX;
    const tlz = tz - baseZ;
    if (tlx >= 0 && tlx < CHUNK_SIZE && tlz >= 0 && tlz < CHUNK_SIZE) {
      chunk.setBlock(tlx, groundY, tlz, BLOCK_IDS.DIRT);
      for (let y = groundY + 1; y <= topY; y++) {
        chunk.setBlock(tlx, y, tlz, BLOCK_IDS.OAK_LOG);
      }
    }
  }

  /**
   * Finds a scenic dry-land spawn coordinate near (0, 0).
   */
  findSafeSpawn() {
    for (let radius = 0; radius <= 128; radius += 4) {
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
        const wx = Math.round(Math.cos(angle) * radius);
        const wz = Math.round(Math.sin(angle) * radius);
        const h = this.getTerrainHeight(wx, wz);
        if (h >= SEA_LEVEL + 2 && h <= 82) {
          return { x: wx + 0.5, y: h + 1.0, z: wz + 0.5 };
        }
      }
    }
    const fallbackH = Math.max(SEA_LEVEL + 2, this.getTerrainHeight(0, 0));
    return { x: 0.5, y: fallbackH + 1.0, z: 0.5 };
  }
}
