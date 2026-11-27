import { BLOCK_IDS } from '../blocks/BlockRegistry.js';
import {
  BIOME_IDS,
  BIOME_NAMES,
  CHUNK_SIZE,
  CHUNK_VOLUME,
  SEA_LEVEL,
  WORLD_HEIGHT,
} from '../constants.js';
import { createChunkGeneratorKernel } from './ChunkGenKernel.js';

export const KERNEL_CONFIG = Object.freeze({
  CHUNK_SIZE,
  WORLD_HEIGHT,
  CHUNK_VOLUME,
  SEA_LEVEL,
  BLOCK_IDS,
  BIOME_IDS,
});

// Biome tint RGB colors applied softly onto Grass, Leaves, and Tall Grass in ChunkMesher
export const BIOME_TINTS = Object.freeze({
  [BIOME_IDS.PLAINS]:       { grass: [1.02, 1.05, 0.94], foliage: [1.00, 1.04, 0.92] },
  [BIOME_IDS.FOREST]:       { grass: [0.94, 1.04, 0.90], foliage: [0.92, 1.02, 0.88] },
  [BIOME_IDS.BIRCH_FOREST]: { grass: [1.00, 1.05, 0.94], foliage: [1.04, 1.08, 0.92] },
  [BIOME_IDS.DESERT]:       { grass: [1.14, 1.00, 0.72], foliage: [1.12, 0.98, 0.70] },
  [BIOME_IDS.SNOWY_TAIGA]:  { grass: [0.82, 0.96, 0.88], foliage: [0.80, 0.94, 0.86] },
  [BIOME_IDS.MOUNTAINS]:    { grass: [0.88, 0.98, 0.88], foliage: [0.84, 0.96, 0.86] },
  [BIOME_IDS.SWAMP]:        { grass: [0.74, 0.82, 0.66], foliage: [0.70, 0.78, 0.62] },
  [BIOME_IDS.BEACH]:        { grass: [1.00, 1.03, 0.90], foliage: [1.00, 1.02, 0.88] },
});

export class BiomeManager {
  constructor(seed) {
    this.seed = seed;
    this.kernel = createChunkGeneratorKernel(KERNEL_CONFIG);
  }

  getBiomeAt(wx, wz) {
    return this.kernel.getBiomeAt(this.seed, Math.floor(wx), Math.floor(wz));
  }

  getBiomeName(biomeId) {
    return BIOME_NAMES[biomeId] || BIOME_NAMES[BIOME_IDS.PLAINS];
  }

  getBiomeNameAt(wx, wz) {
    return this.getBiomeName(this.getBiomeAt(wx, wz));
  }

  static getTintForBlock(biomeId, tintType) {
    if (!tintType) return null;
    if (tintType === 'spruce') return [0.88, 0.96, 0.90];
    if (tintType === 'birch') return [1.02, 1.06, 0.92];
    if (tintType === 'swamp') return [0.74, 0.84, 0.66];
    const entry = BIOME_TINTS[biomeId] || BIOME_TINTS[BIOME_IDS.PLAINS];
    return tintType === 'grass' ? entry.grass : entry.foliage;
  }
}
