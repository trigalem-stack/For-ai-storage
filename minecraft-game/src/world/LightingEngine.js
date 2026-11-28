import { BlockRegistry } from '../blocks/BlockRegistry.js';
import { CHUNK_SIZE, MAX_LIGHT_LEVEL, REDSTONE_GLOW_LEVEL, WORLD_HEIGHT } from '../constants.js';

const QUEUE_CAP = 131072; // Power-of-2 ring buffer capacity (no shift/alloc overhead)
const QUEUE_MASK = QUEUE_CAP - 1;

const DIRS = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

class FastLightQueue {
  constructor(capacity = QUEUE_CAP) {
    this.xs = new Int32Array(capacity);
    this.ys = new Int32Array(capacity);
    this.zs = new Int32Array(capacity);
    this.vals = new Uint8Array(capacity);
    this.head = 0;
    this.tail = 0;
  }

  get isEmpty() {
    return this.head === this.tail;
  }

  clear() {
    this.head = 0;
    this.tail = 0;
  }

  push(x, y, z, val = 0) {
    const nextTail = (this.tail + 1) & QUEUE_MASK;
    if (nextTail === this.head) {
      // Advance head safely if saturated under extreme edits
      this.head = (this.head + 1) & QUEUE_MASK;
    }
    this.xs[this.tail] = x;
    this.ys[this.tail] = y;
    this.zs[this.tail] = z;
    this.vals[this.tail] = val;
    this.tail = nextTail;
  }

  popInto(out) {
    out.x = this.xs[this.head];
    out.y = this.ys[this.head];
    out.z = this.zs[this.head];
    out.val = this.vals[this.head];
    this.head = (this.head + 1) & QUEUE_MASK;
  }
}

export class LightingEngine {
  constructor() {
    this.skyAddQ = new FastLightQueue();
    this.skyRemQ = new FastLightQueue();
    this.blkAddQ = new FastLightQueue();
    this.blkRemQ = new FastLightQueue();
    this._node = { x: 0, y: 0, z: 0, val: 0 };

    // Temporary glowing Redstone Ore coordinates ("wx,wy,wz" -> { wx, wy, wz, ttl })
    this.activeRedstone = new Map();

    // 1-entry chunk cache + reusable lookup struct to avoid hot-loop GC allocations
    this._cacheWorld = null;
    this._cacheCx = 2147483647;
    this._cacheCz = 2147483647;
    this._cacheChunk = null;
    this._ref = { chunk: null, lx: 0, lz: 0, idx: 0 };
  }

  clear() {
    this.skyAddQ.clear();
    this.skyRemQ.clear();
    this.blkAddQ.clear();
    this.blkRemQ.clear();
    this.activeRedstone.clear();
    this._cacheWorld = null;
    this._cacheChunk = null;
  }

  _getBlockAndChunk(world, wx, wy, wz, alloc = false) {
    if (wy < 0 || wy >= WORLD_HEIGHT) return null;
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    let chunk;
    if (this._cacheWorld === world && this._cacheCx === cx && this._cacheCz === cz) {
      chunk = this._cacheChunk;
    } else {
      chunk = typeof world.getChunk === 'function' ? world.getChunk(cx, cz) : world.chunks.get(chunkKey(cx, cz));
      this._cacheWorld = world;
      this._cacheCx = cx;
      this._cacheCz = cz;
      this._cacheChunk = chunk || null;
    }
    if (!chunk || !chunk.isGenerated) return null;
    const lx = wx - cx * CHUNK_SIZE;
    const lz = wz - cz * CHUNK_SIZE;
    const idx = (wy * CHUNK_SIZE + lz) * CHUNK_SIZE + lx;
    if (alloc) {
      return { chunk, lx, lz, idx };
    }
    this._ref.chunk = chunk;
    this._ref.lx = lx;
    this._ref.lz = lz;
    this._ref.idx = idx;
    return this._ref;
  }

  /**
   * Computes vertical sunlight columns + interior BFS for a freshly loaded/generated chunk,
   * and seamlessly blends light borders with any already-loaded orthogonal neighbor chunks.
   */
  initChunkLighting(world, chunk) {
    const blocks = chunk.blocks;
    const light = chunk.light;
    const opacityTable = BlockRegistry.opacityTable;
    const emissionTable = BlockRegistry.emissionTable;

    const baseX = chunk.cx * CHUNK_SIZE;
    const baseZ = chunk.cz * CHUNK_SIZE;
    const slice = CHUNK_SIZE * CHUNK_SIZE;

    const skyAddQ = this.skyAddQ;
    const blkAddQ = this.blkAddQ;
    skyAddQ.clear();
    blkAddQ.clear();

    // 1a. Fast vertical sunlight pass top-down + emitter scan across all 256 columns
    const startScanY = Math.min(WORLD_HEIGHT - 1, Math.max(chunk.maxY + 1, 64));
    for (let z = 0; z < CHUNK_SIZE; z++) {
      const wz = baseZ + z;
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const wx = baseX + x;
        let sun = MAX_LIGHT_LEVEL;

        for (let y = WORLD_HEIGHT - 1; y > startScanY; y--) {
          light[y * slice + z * CHUNK_SIZE + x] = 0xf0;
        }

        for (let y = startScanY; y >= 0; y--) {
          const idx = y * slice + z * CHUNK_SIZE + x;
          const id = blocks[idx];
          const op = opacityTable[id];
          const emit = emissionTable[id];

          if (sun > 0) {
            if (op >= 15) {
              sun = 0;
            } else if (op > 0) {
              sun = Math.max(0, sun - op);
            }
          }

          light[idx] = ((sun & 0x0f) << 4) | (emit & 0x0f);

          if (emit > 0) {
            blkAddQ.push(wx, y, wz, emit);
          }
        }
      }
    }

    // 1b. Seed horizontal skyLight BFS ONLY where light borders darker air/water/cave entrances
    for (let z = 0; z < CHUNK_SIZE; z++) {
      const wz = baseZ + z;
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const wx = baseX + x;
        const isEdge = x === 0 || x === CHUNK_SIZE - 1 || z === 0 || z === CHUNK_SIZE - 1;
        for (let y = startScanY; y >= 1; y--) {
          const idx = y * slice + z * CHUNK_SIZE + x;
          const sun = (light[idx] >> 4) & 0x0f;
          if (sun <= 1) {
            if (isEdge) continue;
            break;
          }
          const op = opacityTable[blocks[idx]];
          const belowOp = opacityTable[blocks[idx - slice]];
          if (op > 0 || belowOp > 0) {
            skyAddQ.push(wx, y, wz, sun);
            continue;
          }
          if (
            (z > 0 && opacityTable[blocks[idx - CHUNK_SIZE]] < 15 && ((light[idx - CHUNK_SIZE] >> 4) & 0x0f) < sun - 1) ||
            (z < 15 && opacityTable[blocks[idx + CHUNK_SIZE]] < 15 && ((light[idx + CHUNK_SIZE] >> 4) & 0x0f) < sun - 1) ||
            (x > 0 && opacityTable[blocks[idx - 1]] < 15 && ((light[idx - 1] >> 4) & 0x0f) < sun - 1) ||
            (x < 15 && opacityTable[blocks[idx + 1]] < 15 && ((light[idx + 1] >> 4) & 0x0f) < sun - 1)
          ) {
            skyAddQ.push(wx, y, wz, sun);
          }
        }
      }
    }

    // 2. Pull border skyLight & blockLight from already-loaded orthogonal neighbor chunks
    const borderPairs = [
      { ncx: chunk.cx - 1, ncz: chunk.cz, myX: 0, nbX: 15, fixedZ: false },
      { ncx: chunk.cx + 1, ncz: chunk.cz, myX: 15, nbX: 0, fixedZ: false },
      { ncx: chunk.cx, ncz: chunk.cz - 1, myZ: 0, nbZ: 15, fixedZ: true },
      { ncx: chunk.cx, ncz: chunk.cz + 1, myZ: 15, nbZ: 0, fixedZ: true },
    ];

    const topBorderY = Math.min(WORLD_HEIGHT - 1, startScanY + 2);
    for (let p = 0; p < 4; p++) {
      const bp = borderPairs[p];
      const neighbor = world.getChunk ? world.getChunk(bp.ncx, bp.ncz) : world.chunks.get(`${bp.ncx},${bp.ncz}`);
      if (!neighbor || !neighbor.isGenerated) continue;

      const nbBaseX = bp.ncx * CHUNK_SIZE;
      const nbBaseZ = bp.ncz * CHUNK_SIZE;
      const nLight = neighbor.light;
      const nBlocks = neighbor.blocks;

      for (let i = 0; i < CHUNK_SIZE; i++) {
        const lx = bp.fixedZ ? i : bp.myX;
        const lz = bp.fixedZ ? bp.myZ : i;
        const nx = bp.fixedZ ? i : bp.nbX;
        const nz = bp.fixedZ ? bp.nbZ : i;

        for (let y = 0; y <= topBorderY; y++) {
          const myIdx = y * slice + lz * CHUNK_SIZE + lx;
          const nbIdx = y * slice + nz * CHUNK_SIZE + nx;
          const mySky = (light[myIdx] >> 4) & 0x0f;
          const nbSky = (nLight[nbIdx] >> 4) & 0x0f;
          const myBlk = light[myIdx] & 0x0f;
          const nbBlk = nLight[nbIdx] & 0x0f;

          if (nbSky > mySky + 1 && opacityTable[blocks[myIdx]] < 15) {
            skyAddQ.push(nbBaseX + nx, y, nbBaseZ + nz, nbSky);
          } else if (mySky > nbSky + 1 && opacityTable[nBlocks[nbIdx]] < 15) {
            skyAddQ.push(baseX + lx, y, baseZ + lz, mySky);
          }

          if (nbBlk > myBlk + 1 && opacityTable[blocks[myIdx]] < 15) {
            blkAddQ.push(nbBaseX + nx, y, nbBaseZ + nz, nbBlk);
          } else if (myBlk > nbBlk + 1 && opacityTable[nBlocks[nbIdx]] < 15) {
            blkAddQ.push(baseX + lx, y, baseZ + lz, myBlk);
          }
        }
      }
    }

    const touchedChunks = new Set();
    this._runSkyPropagate(world, touchedChunks);
    this._runBlockPropagate(world, touchedChunks);
    chunk.lightCalculated = true;

    for (const tc of touchedChunks) {
      if (tc !== chunk) tc.dirty = true;
    }
  }

  /**
   * Incremental dual-channel BFS update when a block at (wx, wy, wz) changes from oldId -> newId.
   * Returns a Set of affected Chunks (excluding none) that need remeshing.
   */
  onBlockChanged(world, wx, wy, wz, oldId, newId) {
    const touched = new Set();
    const ref = this._getBlockAndChunk(world, wx, wy, wz, true);
    if (!ref) return touched;
    touched.add(ref.chunk);

    const oldOp = BlockRegistry.getLightOpacity(oldId);
    const newOp = BlockRegistry.getLightOpacity(newId);
    const oldEmit = BlockRegistry.getLightEmission(oldId);
    const newEmit = BlockRegistry.getLightEmission(newId);

    // Clear any lingering temporary redstone glow at this coordinate
    this.activeRedstone.delete(`${wx},${wy},${wz}`);

    // --- 1. SkyLight update ---
    if (newOp !== oldOp) {
      const skyRemQ = this.skyRemQ;
      const skyAddQ = this.skyAddQ;
      skyRemQ.clear();
      skyAddQ.clear();

      if (newOp > oldOp) {
        // Placed more opaque block -> remove existing skyLight here & propagate darkness down/sideways
        const oldSky = (ref.chunk.light[ref.idx] >> 4) & 0x0f;
        if (oldSky > 0) {
          ref.chunk.setSkyLight(ref.lx, wy, ref.lz, 0);
          skyRemQ.push(wx, wy, wz, oldSky);

          // If this column had direct skyLight=15 above, clear column straight down too
          const aboveRef = this._getBlockAndChunk(world, wx, wy + 1, wz);
          const aboveSky = wy + 1 >= WORLD_HEIGHT
            ? MAX_LIGHT_LEVEL
            : (aboveRef ? ((aboveRef.chunk.light[aboveRef.idx] >> 4) & 0x0f) : 0);

          if (aboveSky === MAX_LIGHT_LEVEL && newOp >= 15) {
            for (let dy = wy - 1; dy >= 0; dy--) {
              const dRef = this._getBlockAndChunk(world, wx, dy, wz);
              if (!dRef) break;
              const dOp = BlockRegistry.getLightOpacity(dRef.chunk.blocks[dRef.idx]);
              if (dOp >= 15) break;
              const dSky = (dRef.chunk.light[dRef.idx] >> 4) & 0x0f;
              if (dSky === 0) break;
              dRef.chunk.setSkyLight(dRef.lx, dy, dRef.lz, 0);
              skyRemQ.push(wx, dy, wz, dSky);
              touched.add(dRef.chunk);
            }
          }
          this._runSkyRemove(world, touched);
          this._runSkyPropagate(world, touched);
        }
      } else {
        // Removed / replaced with transparent block -> pull sunlight from above & neighbors
        const aboveRef = this._getBlockAndChunk(world, wx, wy + 1, wz);
        let topSky = wy + 1 >= WORLD_HEIGHT
          ? MAX_LIGHT_LEVEL
          : (aboveRef ? ((aboveRef.chunk.light[aboveRef.idx] >> 4) & 0x0f) : MAX_LIGHT_LEVEL);

        // If above was direct sunlight (15) or semi-transparent skylight, propagate straight down
        if (topSky > 0) {
          let curSun = newOp === 0 ? topSky : Math.max(0, topSky - newOp);
          if (topSky < MAX_LIGHT_LEVEL && newOp === 0) {
            curSun = Math.max(0, topSky - 1);
          }
          if (curSun > 0) {
            ref.chunk.setSkyLight(ref.lx, wy, ref.lz, curSun);
            skyAddQ.push(wx, wy, wz, curSun);

            if (curSun === MAX_LIGHT_LEVEL) {
              for (let dy = wy - 1; dy >= 0; dy--) {
                const dRef = this._getBlockAndChunk(world, wx, dy, wz);
                if (!dRef) break;
                const dOp = BlockRegistry.getLightOpacity(dRef.chunk.blocks[dRef.idx]);
                if (dOp >= 15) break;
                const nextVal = dOp > 0 ? Math.max(0, MAX_LIGHT_LEVEL - dOp) : MAX_LIGHT_LEVEL;
                const prevVal = (dRef.chunk.light[dRef.idx] >> 4) & 0x0f;
                if (nextVal > prevVal) {
                  dRef.chunk.setSkyLight(dRef.lx, dy, dRef.lz, nextVal);
                  skyAddQ.push(wx, dy, wz, nextVal);
                  touched.add(dRef.chunk);
                }
                if (nextVal < MAX_LIGHT_LEVEL) break;
              }
            }
          }
        }

        // Also seed from 6 neighbors in case sunlight comes sideways (e.g. digging a horizontal tunnel exit)
        for (let d = 0; d < 6; d++) {
          const dir = DIRS[d];
          const nRef = this._getBlockAndChunk(world, wx + dir[0], wy + dir[1], wz + dir[2]);
          if (!nRef) continue;
          const nSky = (nRef.chunk.light[nRef.idx] >> 4) & 0x0f;
          if (nSky > 1) {
            skyAddQ.push(wx + dir[0], wy + dir[1], wz + dir[2], nSky);
          }
        }
        this._runSkyPropagate(world, touched);
      }
    }

    // --- 2. BlockLight update ---
    const blkRemQ = this.blkRemQ;
    const blkAddQ = this.blkAddQ;
    blkRemQ.clear();
    blkAddQ.clear();

    const curBlk = ref.chunk.light[ref.idx] & 0x0f;
    if (oldEmit > 0 || (newOp >= 15 && curBlk > 0) || (curBlk > newEmit && newOp > oldOp)) {
      if (curBlk > 0) {
        ref.chunk.setBlockLight(ref.lx, wy, ref.lz, 0);
        blkRemQ.push(wx, wy, wz, curBlk);
        this._runBlockRemove(world, touched);
      }
    }

    if (newEmit > 0) {
      const existing = ref.chunk.light[ref.idx] & 0x0f;
      if (newEmit > existing) {
        ref.chunk.setBlockLight(ref.lx, wy, ref.lz, newEmit);
        blkAddQ.push(wx, wy, wz, newEmit);
      }
    } else if (newOp < 15) {
      // If block opened up, nearby torchlight may enter this cell
      for (let d = 0; d < 6; d++) {
        const dir = DIRS[d];
        const nRef = this._getBlockAndChunk(world, wx + dir[0], wy + dir[1], wz + dir[2]);
        if (!nRef) continue;
        const nBlk = nRef.chunk.light[nRef.idx] & 0x0f;
        if (nBlk > 1) {
          blkAddQ.push(wx + dir[0], wy + dir[1], wz + dir[2], nBlk);
        }
      }
    }

    if (!blkAddQ.isEmpty) {
      this._runBlockPropagate(world, touched);
    }

    for (const c of touched) {
      c.dirty = true;
    }
    return touched;
  }

  /**
   * Temporarily illuminates Redstone Ore at (wx, wy, wz) at blockLight = 9 for ~4.5 seconds.
   */
  triggerRedstoneGlow(world, wx, wy, wz) {
    const fx = Math.floor(wx);
    const fy = Math.floor(wy);
    const fz = Math.floor(wz);
    const ref = this._getBlockAndChunk(world, fx, fy, fz, true);
    if (!ref) return;

    const key = `${fx},${fy},${fz}`;
    this.activeRedstone.set(key, { wx: fx, wy: fy, wz: fz, ttl: 4.5 });

    const cur = ref.chunk.light[ref.idx] & 0x0f;
    if (cur < REDSTONE_GLOW_LEVEL) {
      ref.chunk.setBlockLight(ref.lx, fy, ref.lz, REDSTONE_GLOW_LEVEL);
      this.blkAddQ.clear();
      this.blkAddQ.push(fx, fy, fz, REDSTONE_GLOW_LEVEL);
      const touched = new Set([ref.chunk]);
      this._runBlockPropagate(world, touched);
      for (const c of touched) c.dirty = true;
    }
  }

  update(dt, world) {
    if (this.activeRedstone.size === 0 || !world) return;
    for (const [key, entry] of this.activeRedstone) {
      entry.ttl -= dt;
      if (entry.ttl <= 0) {
        this.activeRedstone.delete(key);
        const ref = this._getBlockAndChunk(world, entry.wx, entry.wy, entry.wz);
        if (!ref) continue;
        const cur = ref.chunk.light[ref.idx] & 0x0f;
        if (cur > 0) {
          ref.chunk.setBlockLight(ref.lx, entry.wy, ref.lz, 0);
          this.blkRemQ.clear();
          this.blkAddQ.clear();
          this.blkRemQ.push(entry.wx, entry.wy, entry.wz, cur);
          const touched = new Set([ref.chunk]);
          this._runBlockRemove(world, touched);
          this._runBlockPropagate(world, touched);
          for (const c of touched) c.dirty = true;
        }
      }
    }
  }

  _runSkyPropagate(world, touched) {
    const q = this.skyAddQ;
    const node = this._node;
    const opacityTable = BlockRegistry.opacityTable;

    while (!q.isEmpty) {
      q.popInto(node);
      const val = node.val;
      if (val <= 1) continue;

      for (let d = 0; d < 6; d++) {
        const dir = DIRS[d];
        const nx = node.x + dir[0];
        const ny = node.y + dir[1];
        const nz = node.z + dir[2];
        const ref = this._getBlockAndChunk(world, nx, ny, nz);
        if (!ref) continue;

        const op = opacityTable[ref.chunk.blocks[ref.idx]];
        if (op >= 15) continue;

        // Direct vertical sunlight (15) travels straight down with 0 attenuation in air!
        let nextLight;
        if (dir[1] === -1 && val === MAX_LIGHT_LEVEL) {
          nextLight = op > 0 ? Math.max(0, MAX_LIGHT_LEVEL - op) : MAX_LIGHT_LEVEL;
        } else {
          const step = op > 0 ? op : 1;
          nextLight = val - step;
        }

        if (nextLight <= 0) continue;
        const curSky = (ref.chunk.light[ref.idx] >> 4) & 0x0f;
        if (curSky < nextLight) {
          ref.chunk.setSkyLight(ref.lx, ny, ref.lz, nextLight);
          touched.add(ref.chunk);
          if (nextLight > 1 || (dir[1] === -1 && nextLight === MAX_LIGHT_LEVEL)) {
            q.push(nx, ny, nz, nextLight);
          }
        }
      }
    }
  }

  _runSkyRemove(world, touched) {
    const remQ = this.skyRemQ;
    const addQ = this.skyAddQ;
    const node = this._node;

    while (!remQ.isEmpty) {
      remQ.popInto(node);
      const oldVal = node.val;

      for (let d = 0; d < 6; d++) {
        const dir = DIRS[d];
        const nx = node.x + dir[0];
        const ny = node.y + dir[1];
        const nz = node.z + dir[2];
        const ref = this._getBlockAndChunk(world, nx, ny, nz);
        if (!ref) continue;

        const nSky = (ref.chunk.light[ref.idx] >> 4) & 0x0f;
        if (nSky === 0) continue;

        // Clear cells strictly fed by this removed cell (or downward column below 15)
        if (nSky < oldVal || (dir[1] === -1 && oldVal === MAX_LIGHT_LEVEL && nSky === MAX_LIGHT_LEVEL)) {
          ref.chunk.setSkyLight(ref.lx, ny, ref.lz, 0);
          touched.add(ref.chunk);
          remQ.push(nx, ny, nz, nSky);
        } else if (nSky >= oldVal) {
          // Adjacent stronger light source will re-fill dark gap after removal finishes
          addQ.push(nx, ny, nz, nSky);
        }
      }
    }
  }

  _runBlockPropagate(world, touched) {
    const q = this.blkAddQ;
    const node = this._node;
    const opacityTable = BlockRegistry.opacityTable;

    while (!q.isEmpty) {
      q.popInto(node);
      const val = node.val;
      if (val <= 1) continue;

      for (let d = 0; d < 6; d++) {
        const dir = DIRS[d];
        const nx = node.x + dir[0];
        const ny = node.y + dir[1];
        const nz = node.z + dir[2];
        const ref = this._getBlockAndChunk(world, nx, ny, nz);
        if (!ref) continue;

        const op = opacityTable[ref.chunk.blocks[ref.idx]];
        if (op >= 15) continue;

        const step = op > 0 ? op : 1;
        const nextLight = val - step;
        if (nextLight <= 0) continue;

        const curBlk = ref.chunk.light[ref.idx] & 0x0f;
        if (curBlk < nextLight) {
          ref.chunk.setBlockLight(ref.lx, ny, ref.lz, nextLight);
          touched.add(ref.chunk);
          if (nextLight > 1) {
            q.push(nx, ny, nz, nextLight);
          }
        }
      }
    }
  }

  _runBlockRemove(world, touched) {
    const remQ = this.blkRemQ;
    const addQ = this.blkAddQ;
    const node = this._node;
    const emissionTable = BlockRegistry.emissionTable;

    while (!remQ.isEmpty) {
      remQ.popInto(node);
      const oldVal = node.val;

      for (let d = 0; d < 6; d++) {
        const dir = DIRS[d];
        const nx = node.x + dir[0];
        const ny = node.y + dir[1];
        const nz = node.z + dir[2];
        const ref = this._getBlockAndChunk(world, nx, ny, nz);
        if (!ref) continue;

        const nBlk = ref.chunk.light[ref.idx] & 0x0f;
        if (nBlk === 0) continue;

        const emit = emissionTable[ref.chunk.blocks[ref.idx]];
        if (nBlk < oldVal && emit === 0) {
          ref.chunk.setBlockLight(ref.lx, ny, ref.lz, 0);
          touched.add(ref.chunk);
          remQ.push(nx, ny, nz, nBlk);
        } else if (nBlk >= oldVal || emit > 0) {
          addQ.push(nx, ny, nz, Math.max(nBlk, emit));
        }
      }
    }
  }
}
