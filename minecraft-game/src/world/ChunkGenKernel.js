// Self-contained, import-free world generation kernel.
// Runs identically on the main thread (WorldGen.js / Node tests) and inside offline Blob Web Workers.

export function createChunkGeneratorKernel(cfg) {
  const CHUNK_SIZE = cfg.CHUNK_SIZE;
  const WORLD_HEIGHT = cfg.WORLD_HEIGHT;
  const CHUNK_VOLUME = cfg.CHUNK_VOLUME;
  const SEA_LEVEL = cfg.SEA_LEVEL;
  const B = cfg.BLOCK_IDS;
  const BI = cfg.BIOME_IDS;
  const TREE_CELL_SIZE = 6;

  function normalizeSeed(seed) {
    if (typeof seed === 'number' && Number.isFinite(seed)) {
      return (seed | 0) || 133742;
    }
    const str = String(seed ?? 'minecraft');
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h | 0) || 133742;
  }

  function hash2D(seed, x, z) {
    let h = (seed ^ Math.imul(x, 374761393) ^ Math.imul(z, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function hash3D(seed, x, y, z) {
    let h = (seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function createRng(seed) {
    let s = seed >>> 0;
    return function nextRand() {
      s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function fade(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  function lerp(a, b, t) {
    return a + t * (b - a);
  }

  function grad2(hash, x, y) {
    switch (hash & 7) {
      case 0: return x + y;
      case 1: return -x + y;
      case 2: return x - y;
      case 3: return -x - y;
      case 4: return x;
      case 5: return -x;
      case 6: return y;
      default: return -y;
    }
  }

  function grad3(hash, x, y, z) {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  class FastNoise {
    constructor(seed) {
      this.perm = new Uint8Array(512);
      const p = new Uint8Array(256);
      for (let i = 0; i < 256; i++) p[i] = i;
      const rnd = createRng(normalizeSeed(seed));
      for (let i = 255; i > 0; i--) {
        const j = (rnd() * (i + 1)) | 0;
        const tmp = p[i];
        p[i] = p[j];
        p[j] = tmp;
      }
      for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
    }

    noise2D(x, y) {
      const fx = Math.floor(x);
      const fy = Math.floor(y);
      const X = fx & 255;
      const Y = fy & 255;
      const xf = x - fx;
      const yf = y - fy;
      const u = fade(xf);
      const v = fade(yf);
      const p = this.perm;
      const aa = p[p[X] + Y];
      const ab = p[p[X] + Y + 1];
      const ba = p[p[X + 1] + Y];
      const bb = p[p[X + 1] + Y + 1];
      const x1 = lerp(grad2(aa, xf, yf), grad2(ba, xf - 1, yf), u);
      const x2 = lerp(grad2(ab, xf, yf - 1), grad2(bb, xf - 1, yf - 1), u);
      return lerp(x1, x2, v);
    }

    noise3D(x, y, z) {
      const fx = Math.floor(x);
      const fy = Math.floor(y);
      const fz = Math.floor(z);
      const X = fx & 255;
      const Y = fy & 255;
      const Z = fz & 255;
      const xf = x - fx;
      const yf = y - fy;
      const zf = z - fz;
      const u = fade(xf);
      const v = fade(yf);
      const w = fade(zf);
      const p = this.perm;
      const A = p[X] + Y;
      const AA = p[A] + Z;
      const AB = p[A + 1] + Z;
      const B = p[X + 1] + Y;
      const BA = p[B] + Z;
      const BB = p[B + 1] + Z;
      const x1 = lerp(grad3(p[AA], xf, yf, zf), grad3(p[BA], xf - 1, yf, zf), u);
      const x2 = lerp(grad3(p[AB], xf, yf - 1, zf), grad3(p[BB], xf - 1, yf - 1, zf), u);
      const y1 = lerp(x1, x2, v);
      const x3 = lerp(grad3(p[AA + 1], xf, yf, zf - 1), grad3(p[BA + 1], xf - 1, yf, zf - 1), u);
      const x4 = lerp(grad3(p[AB + 1], xf, yf - 1, zf - 1), grad3(p[BB + 1], xf - 1, yf - 1, zf - 1), u);
      const y2 = lerp(x3, x4, v);
      return lerp(y1, y2, w);
    }

    fbm2D(x, y, octaves, persistence, lacunarity) {
      let total = 0;
      let amp = 1;
      let freq = 1;
      let maxVal = 0;
      for (let i = 0; i < octaves; i++) {
        total += this.noise2D(x * freq, y * freq) * amp;
        maxVal += amp;
        amp *= persistence;
        freq *= lacunarity;
      }
      return total / maxVal;
    }

    ridged2D(x, y, octaves, persistence, lacunarity) {
      let total = 0;
      let amp = 1;
      let freq = 1;
      let maxVal = 0;
      for (let i = 0; i < octaves; i++) {
        const n = 1 - Math.abs(this.noise2D(x * freq, y * freq));
        total += n * n * amp;
        maxVal += amp;
        amp *= persistence;
        freq *= lacunarity;
      }
      return total / maxVal;
    }
  }

  // Biome base elevation & amplitude lookup
  const BIOME_PROFILE = {
    [BI.PLAINS]:       { base: 66.2, amp: 5.5, ridgeWeight: 0.05 },
    [BI.FOREST]:       { base: 68.5, amp: 10.5, ridgeWeight: 0.14 },
    [BI.BIRCH_FOREST]: { base: 68.0, amp: 9.0, ridgeWeight: 0.10 },
    [BI.DESERT]:       { base: 66.4, amp: 7.0, ridgeWeight: 0.06 },
    [BI.SNOWY_TAIGA]:  { base: 67.6, amp: 10.0, ridgeWeight: 0.14 },
    [BI.MOUNTAINS]:    { base: 78.0, amp: 24.0, ridgeWeight: 1.00 },
    [BI.SWAMP]:        { base: 61.6, amp: 3.4, ridgeWeight: 0.0 },
    [BI.BEACH]:        { base: 63.0, amp: 2.0, ridgeWeight: 0.0 },
  };

  class SeedContext {
    constructor(seed) {
      this.seed = normalizeSeed(seed);
      this.tempNoise = new FastNoise(this.seed ^ 0x11223344);
      this.humidNoise = new FastNoise(this.seed ^ 0x55667788);
      this.contNoise = new FastNoise(this.seed ^ 0x1a2b3c4d);
      this.erosionNoise = new FastNoise(this.seed ^ 0x2468ace1);
      this.weirdNoise = new FastNoise(this.seed ^ 0x9e3779b9);
      this.detailNoise = new FastNoise(this.seed ^ 0x5f6e7d8c);
      this.riverNoise = new FastNoise(this.seed ^ 0x7a3b5c1d);
      this.caveNoiseA = new FastNoise(this.seed ^ 0x31415926);
      this.caveNoiseB = new FastNoise(this.seed ^ 0x27182818);
      this.cheeseNoise = new FastNoise(this.seed ^ 0xdeadbeef);
      this.ravineNoise = new FastNoise(this.seed ^ 0xfeedface);
    }

    sampleClimate(wx, wz) {
      const temp = this.tempNoise.fbm2D(wx * 0.0021, wz * 0.0021, 3, 0.5, 2.0);
      const humid = this.humidNoise.fbm2D(wx * 0.0023 + 51.7, wz * 0.0023 - 37.2, 3, 0.5, 2.0);
      const cont = this.contNoise.fbm2D(wx * 0.0031 - 19.4, wz * 0.0031 + 83.1, 4, 0.5, 2.0);
      const erosion = this.erosionNoise.fbm2D(wx * 0.0036 + 11.2, wz * 0.0036 + 44.5, 3, 0.5, 2.0);
      const weird = this.weirdNoise.fbm2D(wx * 0.0052, wz * 0.0052, 2, 0.5, 2.0);

      let biome = BI.PLAINS;
      if (erosion < -0.21 || (cont > 0.24 && weird > 0.22)) {
        biome = BI.MOUNTAINS;
      } else if (temp > 0.19 && humid < 0.06) {
        biome = BI.DESERT;
      } else if (temp < -0.19) {
        biome = BI.SNOWY_TAIGA;
      } else if (cont < -0.04 && humid > 0.10) {
        biome = BI.SWAMP;
      } else if (humid > 0.17) {
        biome = BI.BIRCH_FOREST;
      } else if (humid > -0.04) {
        biome = BI.FOREST;
      }

      return { biome, temp, humid, cont, erosion, weird };
    }

    getColumnData(wx, wz) {
      // 5x5 distance-weighted smoothing around (wx, wz) for seamless biome borders
      let sumBase = 0;
      let sumAmp = 0;
      let sumRidgeW = 0;
      let sumW = 0;
      let centerBiome = BI.PLAINS;

      for (let dz = -2; dz <= 2; dz++) {
        for (let dx = -2; dx <= 2; dx++) {
          const sx = wx + dx * 2;
          const sz = wz + dz * 2;
          const cl = this.sampleClimate(sx, sz);
          if (dx === 0 && dz === 0) centerBiome = cl.biome;
          const p = BIOME_PROFILE[cl.biome];
          const w = 1 / (1 + dx * dx + dz * dz);
          sumBase += p.base * w;
          sumAmp += p.amp * w;
          sumRidgeW += p.ridgeWeight * w;
          sumW += w;
        }
      }

      const avgBase = sumBase / sumW;
      const avgAmp = sumAmp / sumW;
      const avgRidgeW = sumRidgeW / sumW;

      const hills = this.detailNoise.fbm2D(wx * 0.014, wz * 0.014, 3, 0.5, 2.05);
      const ridge = this.erosionNoise.ridged2D(wx * 0.0095, wz * 0.0095, 3, 0.5, 2.1);

      let h = avgBase + hills * avgAmp + ridge * 24.0 * avgRidgeW;

      // Meandering river carving at SEA_LEVEL
      const riverDist = Math.abs(this.riverNoise.fbm2D(wx * 0.0026 + 9.3, wz * 0.0026 - 14.8, 3, 0.5, 2.0));
      let isRiver = false;
      if (riverDist < 0.052) {
        const t = 1 - riverDist / 0.052; // 0 at bank, 1 at center
        const smooth = t * t * (3 - 2 * t);
        const riverBed = 57.5 + this.detailNoise.noise2D(wx * 0.05, wz * 0.05) * 1.4;
        h = lerp(h, riverBed, smooth * 0.92);
        if (riverDist < 0.036) isRiver = true;
      }

      const height = Math.max(8, Math.min(WORLD_HEIGHT - 12, Math.round(h)));

      // Shorelines become Beach unless snowy, desert, swamp, or steep rock mountain
      let finalBiome = centerBiome;
      if (
        !isRiver &&
        height >= SEA_LEVEL - 1 &&
        height <= SEA_LEVEL + 2 &&
        centerBiome !== BI.SNOWY_TAIGA &&
        centerBiome !== BI.DESERT &&
        centerBiome !== BI.SWAMP &&
        centerBiome !== BI.MOUNTAINS
      ) {
        finalBiome = BI.BEACH;
      } else if (isRiver && centerBiome !== BI.SNOWY_TAIGA && centerBiome !== BI.DESERT) {
        finalBiome = centerBiome === BI.SWAMP ? BI.SWAMP : BI.BEACH;
      }

      return { height, biome: finalBiome, isRiver, riverDist };
    }
  }

  const contextCache = new Map();
  function getCtx(seed) {
    const s = normalizeSeed(seed);
    let ctx = contextCache.get(s);
    if (!ctx) {
      ctx = new SeedContext(s);
      if (contextCache.size > 4) contextCache.clear();
      contextCache.set(s, ctx);
    }
    return ctx;
  }

  function getTerrainHeight(seed, wx, wz) {
    return getCtx(seed).getColumnData(wx, wz).height;
  }

  function getBiomeAt(seed, wx, wz) {
    return getCtx(seed).getColumnData(wx, wz).biome;
  }

  function setBlockSafe(blocks, lx, y, lz, id) {
    if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT) return;
    blocks[(y * CHUNK_SIZE + lz) * CHUNK_SIZE + lx] = id;
  }

  function getBlockSafe(blocks, lx, y, lz) {
    if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT) return 0;
    return blocks[(y * CHUNK_SIZE + lz) * CHUNK_SIZE + lx];
  }

  function placeOakTree(seed, blocks, baseX, baseZ, tx, groundY, tz, isSwamp) {
    const trunkHeight = (isSwamp ? 5 : 4) + Math.floor(hash2D(seed ^ 0xf12, tx, tz) * 3);
    const topY = groundY + trunkHeight;
    if (topY + 2 >= WORLD_HEIGHT) return;

    const canopyMin = topY - 2;
    const canopyMax = topY + 1;
    const maxR = isSwamp ? 3 : 2;

    for (let ly = canopyMin; ly <= canopyMax; ly++) {
      const distFromTop = canopyMax - ly;
      const radius = isSwamp ? (distFromTop === 0 ? 2 : 3) : (distFromTop <= 1 ? 1 : 2);
      for (let dz = -radius; dz <= radius; dz++) {
        const lz = tz + dz - baseZ;
        if (lz < 0 || lz >= CHUNK_SIZE) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const lx = tx + dx - baseX;
          if (lx < 0 || lx >= CHUNK_SIZE) continue;

          if (Math.abs(dx) === radius && Math.abs(dz) === radius) {
            if (distFromTop === 0) continue;
            if (hash3D(seed ^ 0x60d, tx + dx, ly, tz + dz) < 0.45) continue;
          }

          if (getBlockSafe(blocks, lx, ly, lz) === B.AIR) {
            setBlockSafe(blocks, lx, ly, lz, B.OAK_LEAVES);
          }

          // Hanging swamp vines along outer rim
          if (
            isSwamp &&
            ly === canopyMin &&
            (Math.abs(dx) === radius || Math.abs(dz) === radius) &&
            hash2D(seed ^ 0x4512, tx + dx, tz + dz) < 0.35
          ) {
            const vLen = 1 + Math.floor(hash2D(seed ^ 0x4513, tx + dx, tz + dz) * 3);
            for (let vy = 1; vy <= vLen; vy++) {
              const y = ly - vy;
              if (y > SEA_LEVEL && getBlockSafe(blocks, lx, y, lz) === B.AIR) {
                setBlockSafe(blocks, lx, y, lz, B.VINE);
              }
            }
          }
        }
      }
    }

    const tlx = tx - baseX;
    const tlz = tz - baseZ;
    if (tlx >= 0 && tlx < CHUNK_SIZE && tlz >= 0 && tlz < CHUNK_SIZE) {
      setBlockSafe(blocks, tlx, groundY, tlz, B.DIRT);
      for (let y = groundY + 1; y <= topY; y++) {
        setBlockSafe(blocks, tlx, y, tlz, B.OAK_LOG);
      }
    }
  }

  function placeBirchTree(seed, blocks, baseX, baseZ, tx, groundY, tz) {
    const trunkHeight = 5 + Math.floor(hash2D(seed ^ 0xb14c, tx, tz) * 2); // 5..6
    const topY = groundY + trunkHeight;
    if (topY + 2 >= WORLD_HEIGHT) return;

    for (let ly = topY - 2; ly <= topY + 1; ly++) {
      const distFromTop = topY + 1 - ly;
      const radius = distFromTop <= 1 ? 1 : 2;
      for (let dz = -radius; dz <= radius; dz++) {
        const lz = tz + dz - baseZ;
        if (lz < 0 || lz >= CHUNK_SIZE) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const lx = tx + dx - baseX;
          if (lx < 0 || lx >= CHUNK_SIZE) continue;
          if (Math.abs(dx) === radius && Math.abs(dz) === radius) {
            if (distFromTop === 0) continue;
            if (hash3D(seed ^ 0xb15, tx + dx, ly, tz + dz) < 0.5) continue;
          }
          if (getBlockSafe(blocks, lx, ly, lz) === B.AIR) {
            setBlockSafe(blocks, lx, ly, lz, B.BIRCH_LEAVES);
          }
        }
      }
    }

    const tlx = tx - baseX;
    const tlz = tz - baseZ;
    if (tlx >= 0 && tlx < CHUNK_SIZE && tlz >= 0 && tlz < CHUNK_SIZE) {
      setBlockSafe(blocks, tlx, groundY, tlz, B.DIRT);
      for (let y = groundY + 1; y <= topY; y++) {
        setBlockSafe(blocks, tlx, y, tlz, B.BIRCH_LOG);
      }
    }
  }

  function placeSpruceTree(seed, blocks, baseX, baseZ, tx, groundY, tz) {
    const trunkHeight = 6 + Math.floor(hash2D(seed ^ 0x594c, tx, tz) * 3); // 6..8
    const topY = groundY + trunkHeight;
    if (topY + 2 >= WORLD_HEIGHT) return;

    // Conical layered spruce crown
    for (let ly = groundY + 2; ly <= topY + 1; ly++) {
      const distTop = topY + 1 - ly;
      let radius = 0;
      if (distTop === 0) radius = 0;
      else if (distTop === 1) radius = 1;
      else if (distTop % 2 === 0) radius = Math.min(3, 1 + (distTop >> 1));
      else radius = Math.min(2, distTop >> 1);

      for (let dz = -radius; dz <= radius; dz++) {
        const lz = tz + dz - baseZ;
        if (lz < 0 || lz >= CHUNK_SIZE) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const lx = tx + dx - baseX;
          if (lx < 0 || lx >= CHUNK_SIZE) continue;
          if (radius >= 2 && Math.abs(dx) === radius && Math.abs(dz) === radius) continue;
          if (getBlockSafe(blocks, lx, ly, lz) === B.AIR) {
            setBlockSafe(blocks, lx, ly, lz, B.SPRUCE_LEAVES);
          }
        }
      }
    }

    const tlx = tx - baseX;
    const tlz = tz - baseZ;
    if (tlx >= 0 && tlx < CHUNK_SIZE && tlz >= 0 && tlz < CHUNK_SIZE) {
      setBlockSafe(blocks, tlx, groundY, tlz, B.DIRT);
      for (let y = groundY + 1; y <= topY; y++) {
        setBlockSafe(blocks, tlx, y, tlz, B.SPRUCE_LOG);
      }
    }
  }

  function placeOreCluster(
    blocks,
    rand,
    blockId,
    startX,
    startY,
    startZ,
    maxCount,
    clampMinY = 5,
    clampMaxY = WORLD_HEIGHT - 2
  ) {
    let bx = Math.max(0, Math.min(CHUNK_SIZE - 1, Math.floor(startX)));
    let by = Math.max(clampMinY, Math.min(clampMaxY, Math.floor(startY)));
    let bz = Math.max(0, Math.min(CHUNK_SIZE - 1, Math.floor(startZ)));
    let placed = 0;

    for (let step = 0; step < maxCount * 2 && placed < maxCount; step++) {
      const idx = (by * CHUNK_SIZE + bz) * CHUNK_SIZE + bx;
      if (blocks[idx] === B.STONE || (B.DEEPSLATE && blocks[idx] === B.DEEPSLATE)) {
        blocks[idx] = blockId;
        placed++;
      }
      const dir = Math.floor(rand() * 6);
      if (dir === 0 && bx < CHUNK_SIZE - 1) bx++;
      else if (dir === 1 && bx > 0) bx--;
      else if (dir === 2 && bz < CHUNK_SIZE - 1) bz++;
      else if (dir === 3 && bz > 0) bz--;
      else if (dir === 4 && by < clampMaxY) by++;
      else if (dir === 5 && by > clampMinY) by--;
    }
  }

  function placeOreVein(
    blocks,
    rand,
    blockId,
    centerX,
    centerY,
    centerZ,
    size,
    clampMinY = 5,
    clampMaxY = WORLD_HEIGHT - 2
  ) {
    const angle = rand() * Math.PI * 2;
    const x1 = centerX + Math.sin(angle) * size * 0.125;
    const x2 = centerX - Math.sin(angle) * size * 0.125;
    const z1 = centerZ + Math.cos(angle) * size * 0.125;
    const z2 = centerZ - Math.cos(angle) * size * 0.125;
    const y1 = centerY + rand() * 3 - 2;
    const y2 = centerY + rand() * 3 - 2;

    for (let step = 0; step < size; step++) {
      const t = size <= 1 ? 0.5 : step / (size - 1);
      const sx = x1 + (x2 - x1) * t;
      const sy = y1 + (y2 - y1) * t;
      const sz = z1 + (z2 - z1) * t;
      const radiusScale = (Math.sin(t * Math.PI) + 1.0) * (rand() * size / 16.0) + 0.65;
      const r = Math.min(2.6, radiusScale);

      const minX = Math.max(0, Math.floor(sx - r));
      const maxX = Math.min(CHUNK_SIZE - 1, Math.floor(sx + r));
      const minY = Math.max(clampMinY, Math.floor(sy - r));
      const maxY = Math.min(clampMaxY, Math.floor(sy + r));
      const minZ = Math.max(0, Math.floor(sz - r));
      const maxZ = Math.min(CHUNK_SIZE - 1, Math.floor(sz + r));

      for (let bx = minX; bx <= maxX; bx++) {
        const dx = (bx + 0.5 - sx) / r;
        if (dx * dx >= 1) continue;
        for (let by = minY; by <= maxY; by++) {
          const dy = (by + 0.5 - sy) / r;
          if (dx * dx + dy * dy >= 1) continue;
            for (let bz = minZ; bz <= maxZ; bz++) {
            const dz = (bz + 0.5 - sz) / r;
            if (dx * dx + dy * dy + dz * dz < 1) {
              const idx = (by * CHUNK_SIZE + bz) * CHUNK_SIZE + bx;
              if (blocks[idx] === B.STONE || (B.DEEPSLATE && blocks[idx] === B.DEEPSLATE)) {
                blocks[idx] = blockId;
              }
            }
          }
        }
      }
    }
  }

  function generateChunkData(seed, cx, cz) {
    const ctx = getCtx(seed);
    const blocks = new Uint8Array(CHUNK_VOLUME);
    const biomes = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
    const heightMap = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
    const baseX = cx * CHUNK_SIZE;
    const baseZ = cz * CHUNK_SIZE;

    // 1. Precompute column heights & biomes with 5x5 smoothing
    // Also pad height/biome lookup for slope detection & cacti checks
    let maxColHeight = 64;
    for (let z = 0; z < CHUNK_SIZE; z++) {
      const wz = baseZ + z;
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const wx = baseX + x;
        const col = ctx.getColumnData(wx, wz);
        heightMap[z * CHUNK_SIZE + x] = col.height;
        biomes[z * CHUNK_SIZE + x] = col.biome;
        if (col.height > maxColHeight) maxColHeight = col.height;
      }
    }

    // 2. Conservative 4x4x4 Bounding Lattice for fast empty-rock skipping + domain-warped column coordinates
    const maxCaveY = Math.min(WORLD_HEIGHT - 4, maxColHeight + 2);
    const gridYCount = Math.ceil((maxCaveY + 1) / 4) + 1;
    const gridStrideY = gridYCount;
    const gridStrideX = gridStrideY * 5;
    const caveALat = new Float32Array(5 * gridStrideX);
    const caveBLat = new Float32Array(5 * gridStrideX);
    const cheeseLat = new Float32Array(5 * gridStrideX);

    // Precompute smooth 2D domain warp per column to eliminate straight ~100-block noise stripes
    const warpXArr = new Float32Array(CHUNK_SIZE * CHUNK_SIZE);
    const warpZArr = new Float32Array(CHUNK_SIZE * CHUNK_SIZE);
    for (let z = 0; z < CHUNK_SIZE; z++) {
      const wz = baseZ + z;
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const wx = baseX + x;
        const idx = z * CHUNK_SIZE + x;
        warpXArr[idx] = ctx.weirdNoise.noise2D(wx * 0.015 + 17.3, wz * 0.015 - 23.1) * 14.0;
        warpZArr[idx] = ctx.detailNoise.noise2D(wx * 0.015 - 41.7, wz * 0.015 + 11.9) * 14.0;
      }
    }

    for (let gx = 0; gx < 5; gx++) {
      const wx = baseX + gx * 4;
      const wOffX = ctx.weirdNoise.noise2D(wx * 0.015 + 17.3, (baseZ + 8) * 0.015 - 23.1) * 14.0;
      for (let gz = 0; gz < 5; gz++) {
        const wz = baseZ + gz * 4;
        const wOffZ = ctx.detailNoise.noise2D((baseX + 8) * 0.015 - 41.7, wz * 0.015 + 11.9) * 14.0;
        const sx = (wx + wOffX) * 0.036;
        const sz = (wz + wOffZ) * 0.036;
        const cxC = wx * 0.022;
        const czC = wz * 0.022;
        const offBase = gx * gridStrideX + gz * gridStrideY;
        for (let gy = 0; gy < gridYCount; gy++) {
          const wy = gy * 4;
          const idx = offBase + gy;
          caveALat[idx] = ctx.caveNoiseA.noise3D(sx, wy * 0.048, sz);
          caveBLat[idx] = ctx.caveNoiseB.noise3D(sx + 73.1, wy * 0.048 - 19.7, sz + 31.4);
          cheeseLat[idx] = wy <= 50
            ? ctx.cheeseNoise.noise3D(cxC, wy * 0.034, czC)
            : -1;
        }
      }
    }

    // 3. Populate solid layers, water/ice, and carve 1x1x1 smooth caves & winding ravines
    const slice = CHUNK_SIZE * CHUNK_SIZE;
    let mountainCols = 0;

    for (let z = 0; z < CHUNK_SIZE; z++) {
      const wz = baseZ + z;
      const gz = z >> 2;

      for (let x = 0; x < CHUNK_SIZE; x++) {
        const wx = baseX + x;
        const gx = x >> 2;

        const colIdx = z * CHUNK_SIZE + x;
        const h = heightMap[colIdx];
        const biome = biomes[colIdx];
        if (biome === BI.MOUNTAINS) mountainCols++;

        const wxWarped = wx + warpXArr[colIdx];
        const wzWarped = wz + warpZArr[colIdx];

        // Slope approximation within chunk for rocky cliffs in mountains
        const hL = x > 0 ? heightMap[colIdx - 1] : h;
        const hR = x < 15 ? heightMap[colIdx + 1] : h;
        const hU = z > 0 ? heightMap[colIdx - CHUNK_SIZE] : h;
        const hD = z < 15 ? heightMap[colIdx + CHUNK_SIZE] : h;
        const maxSlope = Math.max(Math.abs(h - hL), Math.abs(h - hR), Math.abs(h - hU), Math.abs(h - hD));

        // Regional, strongly warped winding ravines (eliminates ~100-block straight grid fissures!)
        const ravRegion = ctx.contNoise.noise2D(wx * 0.0019 + 41.3, wz * 0.0019 - 17.9);
        let inRavine = false;
        let ravNoise = 1.0;
        let ravineBottom = 999;
        if (ravRegion > 0.20) {
          const rwX = wx + ctx.detailNoise.noise2D(wx * 0.011 + 5.1, wz * 0.011 - 9.2) * 34.0;
          const rwZ = wz + ctx.weirdNoise.noise2D(wx * 0.011 - 14.3, wz * 0.011 + 22.8) * 34.0;
          ravNoise = Math.abs(ctx.ravineNoise.fbm2D(rwX * 0.0082 - 31.1, rwZ * 0.0082 + 17.6, 2, 0.5, 2.0));
          const ravTh = Math.min(0.025, (ravRegion - 0.20) * 0.14);
          if (ravNoise < ravTh) {
            inRavine = true;
            ravineBottom = 14 + Math.floor(hash2D(ctx.seed ^ 0x88, wx >> 1, wz >> 1) * 10);
          }
        }

        // Safe cave roof under lakes/oceans/rivers so water never drains endlessly
        const caveTopLimit = h <= SEA_LEVEL ? Math.max(5, h - 3) : h + 1;

        // Determine surface & subsurface blocks by biome
        let topBlock = B.GRASS;
        let subBlock = B.DIRT;
        let subDepth = 3 + (hash2D(ctx.seed ^ 0x77, wx, wz) > 0.5 ? 1 : 0);
        let stoneDepth = 0;

        if (biome === BI.DESERT) {
          topBlock = B.SAND;
          subBlock = B.SAND;
          subDepth = 3 + (hash2D(ctx.seed ^ 0x78, wx, wz) > 0.5 ? 1 : 0);
          stoneDepth = 4; // Sandstone layer beneath sand
        } else if (biome === BI.BEACH) {
          const isGravelPatch = ctx.detailNoise.noise2D(wx * 0.08, wz * 0.08) > 0.38;
          topBlock = isGravelPatch ? B.GRAVEL : B.SAND;
          subBlock = topBlock;
          subDepth = 3;
          stoneDepth = 2;
        } else if (biome === BI.SNOWY_TAIGA) {
          topBlock = h >= SEA_LEVEL + 1 ? B.SNOW_GRASS : B.DIRT;
          subBlock = B.DIRT;
        } else if (biome === BI.MOUNTAINS) {
          if (h >= 92) {
            topBlock = B.SNOW;
            subBlock = B.SNOW;
            subDepth = 2;
          } else if (h >= 85 && maxSlope < 3) {
            topBlock = B.SNOW_GRASS;
            subBlock = B.DIRT;
            subDepth = 2;
          } else if (maxSlope >= 3 || (h >= 78 && hash2D(ctx.seed ^ 0x55a, wx, wz) > 0.35)) {
            topBlock = hash2D(ctx.seed ^ 0x55b, wx, wz) > 0.88 ? B.GRAVEL : B.STONE;
            subBlock = B.STONE;
            subDepth = 0;
          } else {
            topBlock = B.GRASS;
            subBlock = B.DIRT;
            subDepth = 2;
          }
        } else if (biome === BI.SWAMP && h < SEA_LEVEL) {
          const clayPatch = ctx.detailNoise.noise2D(wx * 0.11 + 4, wz * 0.11 - 7) > 0.25;
          topBlock = clayPatch ? B.CLAY : B.DIRT;
          subBlock = B.DIRT;
          subDepth = 3;
        } else if (h < SEA_LEVEL - 1) {
          topBlock = hash2D(ctx.seed ^ 0x199, wx, wz) > 0.45 ? B.SAND : B.GRAVEL;
          subBlock = B.DIRT;
          subDepth = 2;
        }

        const c00 = gx * gridStrideX + gz * gridStrideY;
        const c10 = (gx + 1) * gridStrideX + gz * gridStrideY;
        const c01 = gx * gridStrideX + (gz + 1) * gridStrideY;
        const c11 = (gx + 1) * gridStrideX + (gz + 1) * gridStrideY;

        for (let y = 0; y <= h; y++) {
          let blockId = (B.DEEPSLATE && (y <= 12 || (y <= 16 && hash3D(ctx.seed ^ 0x222, wx, y, wz) < (17 - y) * 0.25)))
            ? B.DEEPSLATE
            : B.STONE;
          if (y === 0) {
            blockId = B.BEDROCK;
          } else if (y <= 4 && hash3D(ctx.seed ^ 0x111, wx, y, wz) < (5 - y) * 0.22) {
            blockId = B.BEDROCK;
          } else if (y === h) {
            blockId = topBlock;
          } else if (y >= h - subDepth) {
            blockId = subBlock;
          } else if (stoneDepth > 0 && y >= h - subDepth - stoneDepth) {
            blockId = B.SANDSTONE;
          }

          // Carve organic 1x1x1 caves & ravines above bedrock floor (y >= 5), using 4x4x4 cell as conservative solid-skip
          if (y >= 5 && y <= caveTopLimit && blockId !== B.BEDROCK) {
            const gy = y >> 2;
            const a0 = caveALat[c00 + gy];
            const a1 = caveALat[c10 + gy];
            const a2 = caveALat[c01 + gy];
            const a3 = caveALat[c11 + gy];
            const a4 = caveALat[c00 + gy + 1];
            const a5 = caveALat[c10 + gy + 1];
            const a6 = caveALat[c01 + gy + 1];
            const a7 = caveALat[c11 + gy + 1];

            const b0 = caveBLat[c00 + gy];
            const b1 = caveBLat[c10 + gy];
            const b2 = caveBLat[c01 + gy];
            const b3 = caveBLat[c11 + gy];
            const b4 = caveBLat[c00 + gy + 1];
            const b5 = caveBLat[c10 + gy + 1];
            const b6 = caveBLat[c01 + gy + 1];
            const b7 = caveBLat[c11 + gy + 1];

            // Bounding check: can spaghetti OR cheese OR ravine enter this 4x4x4 cell?
            const minAbsA = Math.min(Math.abs(a0), Math.abs(a1), Math.abs(a2), Math.abs(a3), Math.abs(a4), Math.abs(a5), Math.abs(a6), Math.abs(a7));
            const minAbsB = Math.min(Math.abs(b0), Math.abs(b1), Math.abs(b2), Math.abs(b3), Math.abs(b4), Math.abs(b5), Math.abs(b6), Math.abs(b7));
            const crossesA = (Math.min(a0, a1, a2, a3, a4, a5, a6, a7) <= 0 && Math.max(a0, a1, a2, a3, a4, a5, a6, a7) >= 0);
            const crossesB = (Math.min(b0, b1, b2, b3, b4, b5, b6, b7) <= 0 && Math.max(b0, b1, b2, b3, b4, b5, b6, b7) >= 0);
            const maySpaghetti = (crossesA || minAbsA < 0.36) && (crossesB || minAbsB < 0.36);

            let mayCheese = false;
            if (y <= 48) {
              const maxCh = Math.max(
                cheeseLat[c00 + gy], cheeseLat[c10 + gy], cheeseLat[c01 + gy], cheeseLat[c11 + gy],
                cheeseLat[c00 + gy + 1], cheeseLat[c10 + gy + 1], cheeseLat[c01 + gy + 1], cheeseLat[c11 + gy + 1]
              );
              mayCheese = maxCh > 0.08;
            }

            let carved = false;
            if (maySpaghetti) {
              const yWarp = y + Math.sin(wx * 0.09 + wz * 0.07) * 1.4;
              const nA = ctx.caveNoiseA.noise3D(wxWarped * 0.036, yWarp * 0.048, wzWarped * 0.036);
              const nB = ctx.caveNoiseB.noise3D(wxWarped * 0.036 + 73.1, yWarp * 0.048 - 19.7, wzWarped * 0.036 + 31.4);
              const spagTh = y > 52 ? 0.088 : 0.105;
              carved = Math.abs(nA) < spagTh && Math.abs(nB) < spagTh;
            }

            if (!carved && mayCheese && y >= 8 && y <= 46) {
              const cheese = ctx.cheeseNoise.noise3D(wx * 0.022, y * 0.034, wz * 0.022);
              if (cheese > 0.37) carved = true;
            }

            if (!carved && inRavine && y >= ravineBottom) {
              const widthFactor = 0.017 + 0.009 * Math.sin(y * 0.14);
              if (ravNoise < widthFactor) carved = true;
            }

            if (carved) blockId = B.AIR;
          }

          blocks[y * slice + colIdx] = blockId;
        }

        // Deep underground lava lakes at Y=5..10 inside carved caverns
        if (B.LAVA && h >= 22) {
          for (let y = 5; y <= 10; y++) {
            const idx = y * slice + colIdx;
            if (blocks[idx] === B.AIR && blocks[(y - 1) * slice + colIdx] !== B.AIR) {
              blocks[idx] = B.LAVA;
            }
          }
          // Fill continuous vertical air up to Y=10 if floor already got lava
          for (let y = 6; y <= 10; y++) {
            const idx = y * slice + colIdx;
            if (blocks[idx] === B.AIR && blocks[(y - 1) * slice + colIdx] === B.LAVA) {
              blocks[idx] = B.LAVA;
            }
          }
        }

        // Water basins up to SEA_LEVEL (+ Ice surface in Snowy Taiga)
        if (h < SEA_LEVEL) {
          for (let y = h + 1; y <= SEA_LEVEL; y++) {
            const isTopIce = biome === BI.SNOWY_TAIGA && y === SEA_LEVEL;
            blocks[y * slice + colIdx] = isTopIce ? B.ICE : B.WATER;
          }
        }
      }
    }

    // 4. Underground rock pockets & Authentic Depth-Based Ore Veins
    const chunkRand = createRng((ctx.seed ^ Math.imul(cx, 3418731287) ^ Math.imul(cz, 1328979875)) | 0);

    // Rock variants & dirt/gravel pockets
    for (let i = 0; i < 4; i++) {
      placeOreVein(blocks, chunkRand, B.DIRT, chunkRand() * 16, 8 + chunkRand() * 56, chunkRand() * 16, 14);
      placeOreVein(blocks, chunkRand, B.GRAVEL, chunkRand() * 16, 6 + chunkRand() * 52, chunkRand() * 16, 12);
    }
    for (let i = 0; i < 3; i++) {
      placeOreVein(blocks, chunkRand, B.GRANITE, chunkRand() * 16, 6 + chunkRand() * 68, chunkRand() * 16, 16);
      placeOreVein(blocks, chunkRand, B.DIORITE, chunkRand() * 16, 6 + chunkRand() * 68, chunkRand() * 16, 16);
      placeOreVein(blocks, chunkRand, B.ANDESITE, chunkRand() * 16, 6 + chunkRand() * 68, chunkRand() * 16, 16);
    }

    // Coal Ore: Y=12..115, common veins (5..10 blocks)
    for (let i = 0; i < 10; i++) {
      const y = 12 + Math.floor(chunkRand() * 103);
      const count = 5 + Math.floor(chunkRand() * 6);
      placeOreCluster(blocks, chunkRand, B.COAL_ORE, chunkRand() * 16, y, chunkRand() * 16, count, 10, 115);
    }

    // Copper Ore: Y=16..78, medium veins (4..8 blocks)
    if (B.COPPER_ORE) {
      for (let i = 0; i < 5; i++) {
        const y = 16 + Math.floor(chunkRand() * 62);
        const count = 4 + Math.floor(chunkRand() * 5);
        placeOreCluster(blocks, chunkRand, B.COPPER_ORE, chunkRand() * 16, y, chunkRand() * 16, count, 14, 78);
      }
    }

    // Iron Ore: Y=8..63 (+ higher mountain iron up to Y=88), veins (3..7 blocks)
    const ironMaxY = mountainCols > 60 ? 88 : 63;
    const ironTries = mountainCols > 60 ? 9 : 7;
    for (let i = 0; i < ironTries; i++) {
      const y = 8 + Math.floor(chunkRand() * (ironMaxY - 8));
      const count = 3 + Math.floor(chunkRand() * 5);
      placeOreCluster(blocks, chunkRand, B.IRON_ORE, chunkRand() * 16, y, chunkRand() * 16, count, 6, ironMaxY);
    }

    // Lapis Lazuli Ore: Y=5..28 (triangular distribution peaking ~Y=14), rare veins (2..5 blocks)
    if (chunkRand() < 0.6) {
      const y = Math.floor(5 + (chunkRand() + chunkRand()) * 0.5 * 23);
      const count = 2 + Math.floor(chunkRand() * 4);
      placeOreCluster(blocks, chunkRand, B.LAPIS_ORE, chunkRand() * 16, y, chunkRand() * 16, count, 5, 28);
    }

    // Gold Ore: Y=5..29, rare veins (3..6 blocks, ~72% of chunks)
    if (chunkRand() < 0.72) {
      const y = 5 + Math.floor(chunkRand() * 24);
      const count = 3 + Math.floor(chunkRand() * 4);
      placeOreCluster(blocks, chunkRand, B.GOLD_ORE, chunkRand() * 16, y, chunkRand() * 16, count, 5, 29);
    }

    // Redstone Ore: Y=5..15, deep veins (3..6 blocks)
    for (let i = 0; i < 2; i++) {
      const y = 5 + Math.floor(chunkRand() * 10);
      const count = 3 + Math.floor(chunkRand() * 4);
      placeOreCluster(blocks, chunkRand, B.REDSTONE_ORE, chunkRand() * 16, y, chunkRand() * 16, count, 5, 15);
    }

    // Diamond Ore: truly rare! Deep Y=5..15, 1 small vein of 1..4 blocks (~32% of chunks)
    if (chunkRand() < 0.32) {
      const y = 5 + Math.floor(chunkRand() * 10);
      const count = 1 + Math.floor(chunkRand() * 4);
      placeOreCluster(blocks, chunkRand, B.DIAMOND_ORE, chunkRand() * 16, y, chunkRand() * 16, count, 5, 15);
    }

    // Emerald Ore: Mountain biomes only, Y=5..75, rare 1-block gems
    if (mountainCols > 16) {
      const tries = 1 + Math.floor((mountainCols / 256) * 3);
      for (let i = 0; i < tries; i++) {
        const lx = Math.floor(chunkRand() * 16);
        const lz = Math.floor(chunkRand() * 16);
        if (biomes[lz * CHUNK_SIZE + lx] !== BI.MOUNTAINS) continue;
        const maxH = heightMap[lz * CHUNK_SIZE + lx] - 2;
        if (maxH <= 6) continue;
        const y = 5 + Math.floor(chunkRand() * Math.min(70, maxH - 5));
        const idx = y * slice + lz * CHUNK_SIZE + lx;
        if (blocks[idx] === B.STONE || (B.DEEPSLATE && blocks[idx] === B.DEEPSLATE)) {
          blocks[idx] = B.EMERALD_ORE;
        }
      }
    }

    // 5. Cross-chunk Trees & Desert Cacti (macro grid guarantees clean canopies across chunk borders)
    const minCellX = Math.floor((baseX - 3) / TREE_CELL_SIZE);
    const maxCellX = Math.floor((baseX + CHUNK_SIZE + 2) / TREE_CELL_SIZE);
    const minCellZ = Math.floor((baseZ - 3) / TREE_CELL_SIZE);
    const maxCellZ = Math.floor((baseZ + CHUNK_SIZE + 2) / TREE_CELL_SIZE);

    for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ++) {
      for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
        const anchorX = cellX * TREE_CELL_SIZE + Math.floor(hash2D(ctx.seed ^ 0x41a, cellX, cellZ) * TREE_CELL_SIZE);
        const anchorZ = cellZ * TREE_CELL_SIZE + Math.floor(hash2D(ctx.seed ^ 0x82b, cellX, cellZ) * TREE_CELL_SIZE);

        if (
          anchorX + 3 < baseX ||
          anchorX - 3 >= baseX + CHUNK_SIZE ||
          anchorZ + 3 < baseZ ||
          anchorZ - 3 >= baseZ + CHUNK_SIZE
        ) {
          continue;
        }

        const col = ctx.getColumnData(anchorX, anchorZ);
        const groundY = col.height;
        const anchorBiome = col.biome;
        const roll = hash2D(ctx.seed ^ 0x9c3, anchorX, anchorZ);

        // Make sure tree anchor isn't carved out by a surface cave!
        const alx = anchorX - baseX;
        const alz = anchorZ - baseZ;
        if (alx >= 0 && alx < CHUNK_SIZE && alz >= 0 && alz < CHUNK_SIZE) {
          if (getBlockSafe(blocks, alx, groundY, alz) === B.AIR) continue;
        }

        if (anchorBiome === BI.DESERT) {
          // Cacti: 1..3 tall only on sand, with empty 4-neighbors
          if (
            roll < 0.14 &&
            groundY >= SEA_LEVEL + 1 &&
            alx >= 1 && alx < CHUNK_SIZE - 1 &&
            alz >= 1 && alz < CHUNK_SIZE - 1
          ) {
            const gBlock = getBlockSafe(blocks, alx, groundY, alz);
            if (
              gBlock === B.SAND &&
              getBlockSafe(blocks, alx - 1, groundY + 1, alz) === B.AIR &&
              getBlockSafe(blocks, alx + 1, groundY + 1, alz) === B.AIR &&
              getBlockSafe(blocks, alx, groundY + 1, alz - 1) === B.AIR &&
              getBlockSafe(blocks, alx, groundY + 1, alz + 1) === B.AIR
            ) {
              const cH = 1 + Math.floor(hash2D(ctx.seed ^ 0xcac1, anchorX, anchorZ) * 3);
              for (let cy = 1; cy <= cH; cy++) {
                setBlockSafe(blocks, alx, groundY + cy, alz, B.CACTUS);
              }
            }
          }
          continue;
        }

        if (groundY < SEA_LEVEL + 1) continue;

        if (anchorBiome === BI.FOREST && roll < 0.72) {
          if (hash2D(ctx.seed ^ 0x4b1, anchorX, anchorZ) < 0.28) {
            placeBirchTree(ctx.seed, blocks, baseX, baseZ, anchorX, groundY, anchorZ);
          } else {
            placeOakTree(ctx.seed, blocks, baseX, baseZ, anchorX, groundY, anchorZ, false);
          }
        } else if (anchorBiome === BI.BIRCH_FOREST && roll < 0.68) {
          placeBirchTree(ctx.seed, blocks, baseX, baseZ, anchorX, groundY, anchorZ);
        } else if (anchorBiome === BI.SNOWY_TAIGA && groundY <= 88 && roll < 0.54) {
          placeSpruceTree(ctx.seed, blocks, baseX, baseZ, anchorX, groundY, anchorZ);
        } else if (anchorBiome === BI.PLAINS && roll < 0.08) {
          placeOakTree(ctx.seed, blocks, baseX, baseZ, anchorX, groundY, anchorZ, false);
        } else if (anchorBiome === BI.MOUNTAINS && groundY <= 80 && roll < 0.16) {
          placeSpruceTree(ctx.seed, blocks, baseX, baseZ, anchorX, groundY, anchorZ);
        } else if (anchorBiome === BI.SWAMP && roll < 0.36) {
          placeOakTree(ctx.seed, blocks, baseX, baseZ, anchorX, groundY, anchorZ, true);
        }
      }
    }

    // 6. Surface Flora (Tall Grass, Poppy, Dandelion, Dead Bush, Mushrooms, Blue Orchid)
    for (let z = 0; z < CHUNK_SIZE; z++) {
      const wz = baseZ + z;
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const wx = baseX + x;
        const colIdx = z * CHUNK_SIZE + x;
        const h = heightMap[colIdx];
        const biome = biomes[colIdx];
        if (h < SEA_LEVEL || h + 1 >= WORLD_HEIGHT) continue;

        const groundId = blocks[h * slice + colIdx];
        const aboveIdx = (h + 1) * slice + colIdx;
        if (blocks[aboveIdx] !== B.AIR) continue;

        const r = hash2D(ctx.seed ^ 0x710a, wx, wz);
        const r2 = hash2D(ctx.seed ^ 0x710b, wx, wz);

        if (biome === BI.DESERT && groundId === B.SAND) {
          if (r < 0.018) blocks[aboveIdx] = B.DEAD_BUSH;
        } else if (biome === BI.PLAINS && groundId === B.GRASS) {
          if (r < 0.18) blocks[aboveIdx] = B.TALL_GRASS;
          else if (r < 0.21) blocks[aboveIdx] = r2 < 0.5 ? B.POPPY : B.DANDELION;
        } else if ((biome === BI.FOREST || biome === BI.BIRCH_FOREST) && groundId === B.GRASS) {
          if (r < 0.12) blocks[aboveIdx] = B.TALL_GRASS;
          else if (r < 0.155) blocks[aboveIdx] = r2 < 0.55 ? B.DANDELION : B.POPPY;
          else if (r < 0.168) blocks[aboveIdx] = r2 < 0.5 ? B.RED_MUSHROOM : B.BROWN_MUSHROOM;
        } else if (biome === BI.SWAMP && groundId === B.GRASS) {
          if (r < 0.08) blocks[aboveIdx] = B.TALL_GRASS;
          else if (r < 0.115) blocks[aboveIdx] = B.BLUE_ORCHID;
          else if (r < 0.128) blocks[aboveIdx] = B.BROWN_MUSHROOM;
        } else if (biome === BI.MOUNTAINS && groundId === B.GRASS && r < 0.07) {
          blocks[aboveIdx] = B.TALL_GRASS;
        }
      }
    }

    // 6.5. Stage 7 Fluid Features: Surface Lava Pools, Underground Water Basins, and Embedded Rock Springs
    const springIndices = [];
    const isWallRock = (id) =>
      id === B.STONE || id === B.DEEPSLATE || id === B.GRANITE || id === B.DIORITE ||
      id === B.ANDESITE || id === B.DIRT || id === B.SANDSTONE || id === B.COBBLESTONE;

    // 6.5a Surface Lava Pools (rare ~4% of dry chunks outside spawn area, enclosed by stone rim)
    if (B.LAVA && (Math.abs(cx) > 1 || Math.abs(cz) > 1) && chunkRand() < 0.045) {
      const px = 4 + Math.floor(chunkRand() * 8);
      const pz = 4 + Math.floor(chunkRand() * 8);
      const colIdx = pz * CHUNK_SIZE + px;
      const py = heightMap[colIdx];
      const pBiome = biomes[colIdx];
      if (
        py >= SEA_LEVEL + 2 &&
        py < 88 &&
        pBiome !== BI.SNOWY_TAIGA &&
        pBiome !== BI.SWAMP
      ) {
        // Ensure no tree logs directly over pool site
        let hasTree = false;
        for (let dz = -3; dz <= 3 && !hasTree; dz++) {
          for (let dx = -3; dx <= 3; dx++) {
            const up = getBlockSafe(blocks, px + dx, py + 2, pz + dz);
            if (up === B.OAK_LOG || up === B.BIRCH_LOG || up === B.SPRUCE_LOG || up === B.WATER) {
              hasTree = true;
              break;
            }
          }
        }
        if (!hasTree) {
          const rx = 1.6 + chunkRand() * 1.4;
          const rz = 1.6 + chunkRand() * 1.4;
          for (let dz = -3; dz <= 3; dz++) {
            for (let dx = -3; dx <= 3; dx++) {
              const lx = px + dx;
              const lz = pz + dz;
              if (lx <= 0 || lx >= 15 || lz <= 0 || lz >= 15) continue;
              const d = Math.hypot(dx / rx, dz / rz);
              if (d <= 1.0) {
                setBlockSafe(blocks, lx, py - 1, lz, B.STONE);
                setBlockSafe(blocks, lx, py, lz, B.LAVA);
                for (let ay = 1; ay <= 3; ay++) {
                  setBlockSafe(blocks, lx, py + ay, lz, B.AIR);
                }
              } else if (d <= 1.45) {
                const cur = getBlockSafe(blocks, lx, py, lz);
                if (cur === B.AIR || cur === B.GRASS || cur === B.SAND || cur === B.DIRT) {
                  setBlockSafe(blocks, lx, py, lz, chunkRand() < 0.35 ? B.COBBLESTONE : B.STONE);
                }
                setBlockSafe(blocks, lx, py - 1, lz, B.STONE);
              }
            }
          }
        }
      }
    }

    // 6.5b Underground Water Pools in calm caverns (Y=18..36)
    if (chunkRand() < 0.22) {
      const wx0 = 3 + Math.floor(chunkRand() * 10);
      const wz0 = 3 + Math.floor(chunkRand() * 10);
      const baseWy = 18 + Math.floor(chunkRand() * 18);
      if (baseWy + 4 < heightMap[wz0 * CHUNK_SIZE + wx0]) {
        const centerId = getBlockSafe(blocks, wx0, baseWy, wz0);
        const floorId = getBlockSafe(blocks, wx0, baseWy - 1, wz0);
        if (centerId === B.AIR && isWallRock(floorId)) {
          for (let dz = -2; dz <= 2; dz++) {
            for (let dx = -2; dx <= 2; dx++) {
              const lx = wx0 + dx;
              const lz = wz0 + dz;
              if (lx <= 0 || lx >= 15 || lz <= 0 || lz >= 15) continue;
              if (dx * dx + dz * dz <= 4 && getBlockSafe(blocks, lx, baseWy, lz) === B.AIR && isWallRock(getBlockSafe(blocks, lx, baseWy - 1, lz))) {
                setBlockSafe(blocks, lx, baseWy, lz, B.WATER);
              }
            }
          }
        }
      }
    }

    // 6.5c Embedded Mountain Water Springs & Deep Cave Lava Springs (never floating in open sky!)
    for (let attempt = 0; attempt < 18 && springIndices.length < 2; attempt++) {
      const lx = 1 + Math.floor(chunkRand() * 14);
      const lz = 1 + Math.floor(chunkRand() * 14);
      const colH = heightMap[lz * CHUNK_SIZE + lx];
      const useLava = B.LAVA && attempt >= 10;
      const minSy = useLava ? 12 : (biomes[lz * CHUNK_SIZE + lx] === BI.MOUNTAINS ? SEA_LEVEL + 6 : 16);
      const maxSy = useLava ? Math.min(34, colH - 6) : Math.min(WORLD_HEIGHT - 8, colH - 2);
      if (maxSy <= minSy) continue;

      const sy = minSy + Math.floor(chunkRand() * (maxSy - minSy));
      const curId = getBlockSafe(blocks, lx, sy, lz);
      if (!isWallRock(curId)) continue;
      if (!isWallRock(getBlockSafe(blocks, lx, sy + 1, lz))) continue;
      if (!isWallRock(getBlockSafe(blocks, lx, sy - 1, lz))) continue;

      let airCount = 0;
      let rockCount = 0;
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (let d = 0; d < 4; d++) {
        const nid = getBlockSafe(blocks, lx + dirs[d][0], sy, lz + dirs[d][1]);
        if (nid === B.AIR) airCount++;
        else if (isWallRock(nid)) rockCount++;
      }

      if (airCount === 1 && rockCount === 3) {
        const fluidId = useLava ? B.LAVA : B.WATER;
        setBlockSafe(blocks, lx, sy, lz, fluidId);
        springIndices.push((sy * CHUNK_SIZE + lz) * CHUNK_SIZE + lx);
      }
    }

    // 7. Compute tight non-air vertical bounds
    let minY = WORLD_HEIGHT - 1;
    let maxY = 0;
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

    return {
      blocks,
      biomes,
      fluidSprings: new Uint16Array(springIndices),
      minY: minY <= maxY ? minY : 0,
      maxY: minY <= maxY ? maxY : 0,
    };
  }

  return {
    generateChunkData,
    getTerrainHeight,
    getBiomeAt,
  };
}
