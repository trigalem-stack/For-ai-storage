import { SEA_LEVEL, WORLD_HEIGHT } from '../constants.js';
import { BiomeManager, KERNEL_CONFIG } from './BiomeManager.js';
import { createChunkGeneratorKernel } from './ChunkGenKernel.js';
import { normalizeSeed } from './Noise.js';

export class WorldGen {
  constructor(seed, worldType = 'default') {
    this.seed = normalizeSeed(seed);
    this.worldType = worldType === 'superflat' ? 'superflat' : 'default';
    this.kernel = createChunkGeneratorKernel(KERNEL_CONFIG);
    this.biomeManager = new BiomeManager(this.seed);
  }

  getTerrainHeight(wx, wz) {
    return this.kernel.getTerrainHeight(this.seed, Math.floor(wx), Math.floor(wz), this.worldType);
  }

  getBiomeAt(wx, wz) {
    return this.kernel.getBiomeAt(this.seed, Math.floor(wx), Math.floor(wz), this.worldType);
  }

  generateChunk(chunk) {
    const result = this.kernel.generateChunkData(this.seed, chunk.cx, chunk.cz, this.worldType);
    chunk.blocks.set(result.blocks);
    chunk.biomes.set(result.biomes);
    chunk.fluidSprings = result.fluidSprings && result.fluidSprings.length > 0 ? result.fluidSprings : null;
    chunk.fluidWakes = result.fluidWakes && result.fluidWakes.length > 0 ? result.fluidWakes : null;
    chunk.minY = result.minY;
    chunk.maxY = result.maxY;
    chunk.isGenerated = true;
    chunk.dirty = true;
  }

  /**
   * Builds a 100% offline Blob Web Worker URL sharing the exact same ChunkGenKernel.
   */
  static createWorkerBlobUrl() {
    if (typeof Blob === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) {
      return null;
    }
    const workerCode = `
      const KERNEL = (${createChunkGeneratorKernel.toString()})(${JSON.stringify(KERNEL_CONFIG)});
      self.onmessage = function(e) {
        const msg = e.data;
        const res = KERNEL.generateChunkData(msg.seed, msg.cx, msg.cz, msg.worldType || 'default');
        self.postMessage(
          {
            cx: msg.cx,
            cz: msg.cz,
            blocks: res.blocks.buffer,
            biomes: res.biomes.buffer,
            fluidSprings: res.fluidSprings.buffer,
            fluidWakes: res.fluidWakes.buffer,
            minY: res.minY,
            maxY: res.maxY,
          },
          [res.blocks.buffer, res.biomes.buffer, res.fluidSprings.buffer, res.fluidWakes.buffer]
        );
      };
    `;
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    return URL.createObjectURL(blob);
  }

  /**
   * Finds a scenic dry-land spawn coordinate near (0, 0), preferring Plains/Forest/Beach.
   */
  findSafeSpawn() {
    if (this.worldType === 'superflat') {
      return { x: 0.5, y: 4.0, z: 0.5 };
    }
    for (let radius = 0; radius <= 160; radius += 4) {
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
        const wx = Math.round(Math.cos(angle) * radius);
        const wz = Math.round(Math.sin(angle) * radius);
        const h = this.getTerrainHeight(wx, wz);
        if (h >= SEA_LEVEL + 1 && h <= 84 && h + 2 < WORLD_HEIGHT) {
          return { x: wx + 0.5, y: h + 1.0, z: wz + 0.5 };
        }
      }
    }
    const fallbackH = Math.max(SEA_LEVEL + 2, this.getTerrainHeight(0, 0));
    return { x: 0.5, y: fallbackH + 1.0, z: 0.5 };
  }
}
