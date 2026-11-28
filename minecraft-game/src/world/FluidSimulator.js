import { BLOCK_IDS, BlockRegistry } from '../blocks/BlockRegistry.js';
import {
  FLUID_FALLING_BIT,
  LAVA_TICK_DELAY,
  MAX_FLUID_UPDATES_PER_TICK,
  WATER_TICK_DELAY,
  WORLD_HEIGHT,
} from '../constants.js';

const PACK_BIAS = 524288;
const PACK_Z_STRIDE = 1048576;
const HORIZ_DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export function packFluidKey(wx, wy, wz) {
  return ((wx + PACK_BIAS) * PACK_Z_STRIDE + (wz + PACK_BIAS)) * 128 + (wy & 0x7f);
}

export class FluidSimulator {
  constructor(options = {}) {
    this.currentTick = 0;
    this.scheduledTickByKey = new Map();
    this.buckets = new Map();
    this.onWashBlock = options.onWashBlock || null;
  }

  clear() {
    this.currentTick = 0;
    this.scheduledTickByKey.clear();
    this.buckets.clear();
  }

  getDelayForFluid(fluidId) {
    return fluidId === BLOCK_IDS.LAVA ? LAVA_TICK_DELAY : WATER_TICK_DELAY;
  }

  getDropOffForFluid(fluidId) {
    return fluidId === BLOCK_IDS.LAVA ? 2 : 1;
  }

  schedule(wx, wy, wz, delayTicks = 1) {
    const x = Math.floor(wx);
    const y = Math.floor(wy);
    const z = Math.floor(wz);
    if (y < 0 || y >= WORLD_HEIGHT) return;
    if (x < -PACK_BIAS || x >= PACK_BIAS || z < -PACK_BIAS || z >= PACK_BIAS) return;

    const dueTick = this.currentTick + Math.max(1, delayTicks | 0);
    const key = packFluidKey(x, y, z);
    const prev = this.scheduledTickByKey.get(key);
    if (prev !== undefined && prev <= dueTick) return;

    this.scheduledTickByKey.set(key, dueTick);
    let bucket = this.buckets.get(dueTick);
    if (!bucket) {
      bucket = [];
      this.buckets.set(dueTick, bucket);
    }
    bucket.push(key);
  }

  scheduleAround(wx, wy, wz, world) {
    if (!world) return;
    const x = Math.floor(wx);
    const y = Math.floor(wy);
    const z = Math.floor(wz);

    this._scheduleIfFluid(world, x, y, z);
    this._scheduleIfFluid(world, x + 1, y, z);
    this._scheduleIfFluid(world, x - 1, y, z);
    this._scheduleIfFluid(world, x, y + 1, z);
    this._scheduleIfFluid(world, x, y - 1, z);
    this._scheduleIfFluid(world, x, y, z + 1);
    this._scheduleIfFluid(world, x, y, z - 1);
  }

  _scheduleIfFluid(world, wx, wy, wz) {
    if (wy < 0 || wy >= WORLD_HEIGHT) return;
    const id = world.getBlock(wx, wy, wz);
    if (id === BLOCK_IDS.WATER) {
      this.schedule(wx, wy, wz, WATER_TICK_DELAY);
    } else if (id === BLOCK_IDS.LAVA) {
      this.schedule(wx, wy, wz, LAVA_TICK_DELAY);
    }
  }

  _canFluidEnter(id) {
    return id === BLOCK_IDS.AIR || BlockRegistry.isWashable(id);
  }

  _canFlowDownInto(id, sameFluidId) {
    return id === BLOCK_IDS.AIR || id === sameFluidId || BlockRegistry.isWashable(id);
  }

  _writeFluidBlock(world, wx, wy, wz, newId, newMeta, lightQueue, dirtyChunks) {
    if (world.isBlockLoaded && !world.isBlockLoaded(wx, wy, wz)) return false;
    const oldId = world.getBlock(wx, wy, wz);
    const oldMeta = world.getBlockMeta(wx, wy, wz);
    if (oldId === newId && oldMeta === newMeta) return false;

    const oldOp = BlockRegistry.opacityTable[oldId];
    const newOp = BlockRegistry.opacityTable[newId];
    const oldEmit = BlockRegistry.emissionTable[oldId];
    const newEmit = BlockRegistry.emissionTable[newId];

    const wrote = world._setBlockFast(wx, wy, wz, newId, newMeta, dirtyChunks);
    if (!wrote) return false;

    if (oldId !== 0 && oldId !== BLOCK_IDS.WATER && oldId !== BLOCK_IDS.LAVA && BlockRegistry.isWashable(oldId)) {
      this.onWashBlock?.(wx, wy, wz, oldId, oldMeta);
    }

    if (oldOp !== newOp || oldEmit !== newEmit) {
      lightQueue.push([wx, wy, wz, oldId, newId]);
    }
    return true;
  }

  _mixWaterAndLava(world, lx, ly, lz, newBlockId, lightQueue, dirtyChunks) {
    this._writeFluidBlock(world, lx, ly, lz, newBlockId, 0, lightQueue, dirtyChunks);
    this.scheduleAround(lx, ly, lz, world);
  }

  /**
   * Shortest-path drop-off search (up to 4 blocks) matching Minecraft flow slope preference.
   */
  _findBestSlopeMask(world, wx, wy, wz, fluidId) {
    let bestDist = 5;
    let bestMask = 0;

    for (let d = 0; d < 4; d++) {
      const nx = wx + HORIZ_DIRS[d][0];
      const nz = wz + HORIZ_DIRS[d][1];
      if (world.isBlockLoaded && !world.isBlockLoaded(nx, wy, nz)) continue;
      const nid = world.getBlock(nx, wy, nz);
      if (nid === fluidId && (world.getBlockMeta(nx, wy, nz) & 0x07) === 0 && (world.getBlockMeta(nx, wy, nz) & FLUID_FALLING_BIT) === 0) {
        continue;
      }
      if (!this._canFluidEnter(nid) && nid !== fluidId) continue;

      const belowId = wy > 0 ? world.getBlock(nx, wy - 1, nz) : BLOCK_IDS.BEDROCK;
      if (this._canFlowDownInto(belowId, fluidId)) {
        const dist = 1;
        if (dist < bestDist) {
          bestDist = dist;
          bestMask = 1 << d;
        } else if (dist === bestDist) {
          bestMask |= (1 << d);
        }
        continue;
      }

      if (bestDist > 1) {
        const dist = this._bfsDropDistance(world, nx, wy, nz, d, fluidId, 2, bestDist - 1);
        if (dist < bestDist) {
          bestDist = dist;
          bestMask = 1 << d;
        } else if (dist === bestDist) {
          bestMask |= (1 << d);
        }
      }
    }

    return bestMask !== 0 ? bestMask : 0b1111;
  }

  _bfsDropDistance(world, wx, wy, wz, cameFromDir, fluidId, depth, maxDepth) {
    if (depth > maxDepth) return 99;
    let best = 99;
    const opp = cameFromDir ^ 1; // 0<->1, 2<->3

    for (let d = 0; d < 4; d++) {
      if (d === opp) continue;
      const nx = wx + HORIZ_DIRS[d][0];
      const nz = wz + HORIZ_DIRS[d][1];
      if (world.isBlockLoaded && !world.isBlockLoaded(nx, wy, nz)) continue;
      const nid = world.getBlock(nx, wy, nz);
      if (!this._canFluidEnter(nid) && nid !== fluidId) continue;
      const belowId = wy > 0 ? world.getBlock(nx, wy - 1, nz) : BLOCK_IDS.BEDROCK;
      if (this._canFlowDownInto(belowId, fluidId)) {
        return depth;
      }
      if (depth < maxDepth) {
        const sub = this._bfsDropDistance(world, nx, wy, nz, d, fluidId, depth + 1, maxDepth);
        if (sub < best) best = sub;
      }
    }
    return best;
  }

  _processCell(world, wx, wy, wz, lightQueue, dirtyChunks) {
    const id = world.getBlock(wx, wy, wz);
    if (id !== BLOCK_IDS.WATER && id !== BLOCK_IDS.LAVA) return;

    const isWater = id === BLOCK_IDS.WATER;
    const otherFluidId = isWater ? BLOCK_IDS.LAVA : BLOCK_IDS.WATER;
    const delay = this.getDelayForFluid(id);
    const dropOff = this.getDropOffForFluid(id);

    let meta = world.getBlockMeta(wx, wy, wz);
    let level = meta & 0x07;
    let isFalling = (meta & FLUID_FALLING_BIT) !== 0;

    // 1. Check inflow / decay for non-source blocks (level !== 0 || isFalling)
    if (level !== 0 || isFalling) {
      const aboveId = wy + 1 < WORLD_HEIGHT ? world.getBlock(wx, wy + 1, wz) : 0;
      if (aboveId === id) {
        const aboveLevel = world.getBlockMeta(wx, wy + 1, wz) & 0x07;
        const targetMeta = (aboveLevel & 0x07) | FLUID_FALLING_BIT;
        if (meta !== targetMeta) {
          this._writeFluidBlock(world, wx, wy, wz, id, targetMeta, lightQueue, dirtyChunks);
          meta = targetMeta;
          level = aboveLevel;
          isFalling = true;
        }
      } else {
        let minNeighborLevel = 99;
        let adjacentSources = 0;

        for (let d = 0; d < 4; d++) {
          const nx = wx + HORIZ_DIRS[d][0];
          const nz = wz + HORIZ_DIRS[d][1];
          const nid = world.getBlock(nx, wy, nz);
          if (nid === id) {
            const nMeta = world.getBlockMeta(nx, wy, nz);
            const nLevel = nMeta & 0x07;
            const nFalling = (nMeta & FLUID_FALLING_BIT) !== 0;
            if (nLevel === 0 && !nFalling) {
              adjacentSources++;
            }
            const effLevel = nFalling ? 0 : nLevel;
            if (effLevel < minNeighborLevel) {
              minNeighborLevel = effLevel;
            }
          }
        }

        // Infinite water source creation: 2+ adjacent water sources + solid/water-source floor below
        if (isWater && adjacentSources >= 2) {
          const belowId = wy > 0 ? world.getBlock(wx, wy - 1, wz) : BLOCK_IDS.BEDROCK;
          const belowMeta = wy > 0 ? world.getBlockMeta(wx, wy - 1, wz) : 0;
          const solidFloor = BlockRegistry.isSolid(belowId) ||
            (belowId === BLOCK_IDS.WATER && (belowMeta & 0x07) === 0 && (belowMeta & FLUID_FALLING_BIT) === 0);
          if (solidFloor) {
            this._writeFluidBlock(world, wx, wy, wz, BLOCK_IDS.WATER, 0, lightQueue, dirtyChunks);
            this.scheduleAround(wx, wy, wz, world);
            return;
          }
        }

        const expectedLevel = minNeighborLevel < 99 ? minNeighborLevel + dropOff : 99;
        if (expectedLevel > 7) {
          // Decay fluid cell cleanly
          this._writeFluidBlock(world, wx, wy, wz, BLOCK_IDS.AIR, 0, lightQueue, dirtyChunks);
          this.scheduleAround(wx, wy, wz, world);
          return;
        }
        if (expectedLevel !== level || isFalling) {
          this._writeFluidBlock(world, wx, wy, wz, id, expectedLevel, lightQueue, dirtyChunks);
          meta = expectedLevel;
          level = expectedLevel;
          isFalling = false;
          this.scheduleAround(wx, wy, wz, world);
        }
      }
    }

    // Check immediate horizontal mixing when touching opposite fluid
    for (let d = 0; d < 4; d++) {
      const nx = wx + HORIZ_DIRS[d][0];
      const nz = wz + HORIZ_DIRS[d][1];
      const nid = world.getBlock(nx, wy, nz);
      if (nid === otherFluidId) {
        if (isWater) {
          const lavaMeta = world.getBlockMeta(nx, wy, nz);
          const resultId = (lavaMeta & 0x07) === 0 && (lavaMeta & FLUID_FALLING_BIT) === 0
            ? BLOCK_IDS.OBSIDIAN
            : BLOCK_IDS.COBBLESTONE;
          this._mixWaterAndLava(world, nx, wy, nz, resultId, lightQueue, dirtyChunks);
        } else {
          // Lava flowing sideways into water creates cobblestone on the water side (or obsidian if lava itself is source? Wait: MC makes cobblestone when lava touches water sideways, obsidian when water hits lava source)
          this._mixWaterAndLava(world, nx, wy, nz, BLOCK_IDS.COBBLESTONE, lightQueue, dirtyChunks);
        }
      }
    }

    // 2. Flow vertically downward if possible
    let spreadSideways = level === 0 && !isFalling;
    if (wy > 1) {
      const belowId = world.getBlock(wx, wy - 1, wz);
      if (belowId === otherFluidId) {
        if (isWater) {
          const lavaMeta = world.getBlockMeta(wx, wy - 1, wz);
          const resultId = (lavaMeta & 0x07) === 0 && (lavaMeta & FLUID_FALLING_BIT) === 0
            ? BLOCK_IDS.OBSIDIAN
            : BLOCK_IDS.COBBLESTONE;
          this._mixWaterAndLava(world, wx, wy - 1, wz, resultId, lightQueue, dirtyChunks);
        } else {
          // Falling lava onto water converts the water below into smooth Stone
          this._mixWaterAndLava(world, wx, wy - 1, wz, BLOCK_IDS.STONE, lightQueue, dirtyChunks);
        }
        return;
      }

      if (this._canFluidEnter(belowId)) {
        const downMeta = (level & 0x07) | FLUID_FALLING_BIT;
        if (this._writeFluidBlock(world, wx, wy - 1, wz, id, downMeta, lightQueue, dirtyChunks)) {
          this.schedule(wx, wy - 1, wz, delay);
          this.scheduleAround(wx, wy - 1, wz, world);
        }
        if (!spreadSideways) return;
      } else if (belowId === id) {
        const belowMeta = world.getBlockMeta(wx, wy - 1, wz);
        if ((belowMeta & 0x07) !== 0 && !spreadSideways) {
          // Flowing straight through existing downward fluid stream
          return;
        }
        spreadSideways = true;
      } else {
        // Blocked below by solid block -> spread horizontally
        spreadSideways = true;
      }
    }

    if (!spreadSideways) return;

    // 3. Flow horizontally to lower level neighbors
    const nextLevel = (isFalling ? 0 : level) + dropOff;
    if (nextLevel > 7) return;

    const dirMask = this._findBestSlopeMask(world, wx, wy, wz, id);
    for (let d = 0; d < 4; d++) {
      if ((dirMask & (1 << d)) === 0) continue;
      const nx = wx + HORIZ_DIRS[d][0];
      const nz = wz + HORIZ_DIRS[d][1];
      if (world.isBlockLoaded && !world.isBlockLoaded(nx, wy, nz)) {
        // Defer edge cell until neighboring chunk loads so flow never freezes at chunk borders
        this.schedule(wx, wy, wz, delay);
        continue;
      }
      const nid = world.getBlock(nx, wy, nz);

      if (nid === otherFluidId) {
        if (isWater) {
          const lavaMeta = world.getBlockMeta(nx, wy, nz);
          const resultId = (lavaMeta & 0x07) === 0 && (lavaMeta & FLUID_FALLING_BIT) === 0
            ? BLOCK_IDS.OBSIDIAN
            : BLOCK_IDS.COBBLESTONE;
          this._mixWaterAndLava(world, nx, wy, nz, resultId, lightQueue, dirtyChunks);
        } else {
          this._mixWaterAndLava(world, nx, wy, nz, BLOCK_IDS.COBBLESTONE, lightQueue, dirtyChunks);
        }
        continue;
      }

      if (this._canFluidEnter(nid)) {
        if (this._writeFluidBlock(world, nx, wy, nz, id, nextLevel, lightQueue, dirtyChunks)) {
          this.schedule(nx, wy, nz, delay);
          this.scheduleAround(nx, wy, nz, world);
        }
      } else if (nid === id) {
        const nMeta = world.getBlockMeta(nx, wy, nz);
        const nLevel = nMeta & 0x07;
        const nFalling = (nMeta & FLUID_FALLING_BIT) !== 0;
        if (!nFalling && nLevel > nextLevel) {
          if (this._writeFluidBlock(world, nx, wy, nz, id, nextLevel, lightQueue, dirtyChunks)) {
            this.schedule(nx, wy, nz, delay);
          }
        }
      }
    }
  }

  /**
   * Advances fluid simulation by one simulation tick (20 TPS), capped at 256 updates/tick.
   */
  tick(world) {
    if (!world) return 0;
    this.currentTick++;

    const bucket = this.buckets.get(this.currentTick);
    if (!bucket || bucket.length === 0) {
      if (bucket) this.buckets.delete(this.currentTick);
      return 0;
    }

    this.buckets.delete(this.currentTick);
    const lightQueue = [];
    const dirtyChunks = new Set();
    let processed = 0;

    for (let i = 0; i < bucket.length; i++) {
      const key = bucket[i];
      const scheduledDue = this.scheduledTickByKey.get(key);
      if (scheduledDue !== this.currentTick) continue;

      if (processed >= MAX_FLUID_UPDATES_PER_TICK) {
        // Defer remaining fluid updates to the next tick so FPS never stalls
        const nextTick = this.currentTick + 1;
        this.scheduledTickByKey.set(key, nextTick);
        let nextBucket = this.buckets.get(nextTick);
        if (!nextBucket) {
          nextBucket = [];
          this.buckets.set(nextTick, nextBucket);
        }
        nextBucket.push(key);
        continue;
      }

      this.scheduledTickByKey.delete(key);
      const wy = key % 128;
      const rem = (key - wy) / 128;
      const rz = rem % PACK_Z_STRIDE;
      const rx = (rem - rz) / PACK_Z_STRIDE;
      const wx = rx - PACK_BIAS;
      const wz = rz - PACK_BIAS;

      this._processCell(world, wx, wy, wz, lightQueue, dirtyChunks);
      processed++;
    }

    if (lightQueue.length > 0 && world.lighting) {
      for (let i = 0; i < lightQueue.length; i++) {
        const [lx, ly, lz, oldId, newId] = lightQueue[i];
        const touched = world.lighting.onBlockChanged(world, lx, ly, lz, oldId, newId);
        if (touched) {
          for (const c of touched) dirtyChunks.add(c);
        }
      }
    }

    for (const chunk of dirtyChunks) {
      chunk.dirty = true;
      if (world.dirtyChunks) {
        world.dirtyChunks.add(chunk);
      }
    }

    return processed;
  }

  /**
   * Computes normalized fluid flow push vector at block coordinate (wx, wy, wz).
   */
  static getFlowVector(world, wx, wy, wz, fluidId) {
    if (!world) return { x: 0, y: 0, z: 0 };
    const x = Math.floor(wx);
    const y = Math.floor(wy);
    const z = Math.floor(wz);
    const centerId = world.getBlock(x, y, z);
    if (centerId !== fluidId) return { x: 0, y: 0, z: 0 };

    const cMeta = world.getBlockMeta(x, y, z);
    const cLevel = (cMeta & FLUID_FALLING_BIT) !== 0 ? 0 : (cMeta & 0x07);
    let fx = 0;
    let fy = (cMeta & FLUID_FALLING_BIT) !== 0 ? -0.45 : 0;
    let fz = 0;

    for (let d = 0; d < 4; d++) {
      const dx = HORIZ_DIRS[d][0];
      const dz = HORIZ_DIRS[d][1];
      const nid = world.getBlock(x + dx, y, z + dz);
      if (nid === fluidId) {
        const nMeta = world.getBlockMeta(x + dx, y, z + dz);
        const nLevel = (nMeta & FLUID_FALLING_BIT) !== 0 ? 0 : (nMeta & 0x07);
        const diff = nLevel - cLevel;
        if (diff !== 0) {
          fx += dx * diff;
          fz += dz * diff;
        }
      } else if (!BlockRegistry.isSolid(nid) && nid === 0) {
        // Flowing off a ledge gives slight push outward
        const dropBelow = y > 0 ? world.getBlock(x + dx, y - 1, z + dz) : 1;
        if (dropBelow === fluidId) {
          fx += dx * 2;
          fz += dz * 2;
        }
      }
    }

    const len = Math.hypot(fx, fy, fz);
    if (len > 1e-4) {
      fx /= len;
      fy /= len;
      fz /= len;
    }
    return { x: fx, y: fy, z: fz };
  }
}
