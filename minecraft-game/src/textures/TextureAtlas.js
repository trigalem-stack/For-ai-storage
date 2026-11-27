import * as THREE from '../../vendor/three.module.min.js';
import {
  ATLAS_CELL_SIZE,
  ATLAS_GRID_SIZE,
  ATLAS_PIXELS,
  ATLAS_TILE_INNER,
  ATLAS_TILE_PAD,
} from '../constants.js';

// Deterministic integer hash for crisp procedural 16x16 pixel art
function pxHash(seed, x, y) {
  let h = (seed ^ (x * 374761393) ^ (y * 668265263)) >>> 0;
  h = ((h ^ (h >>> 13)) * 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function clampByte(n) {
  return n < 0 ? 0 : n > 255 ? 255 : n | 0;
}

function hexToRgb(hex) {
  const v = typeof hex === 'string' ? parseInt(hex.replace('#', ''), 16) : hex;
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function shadeRgb(rgb, delta) {
  return [
    clampByte(rgb[0] + delta),
    clampByte(rgb[1] + delta),
    clampByte(rgb[2] + delta),
  ];
}

export class TextureAtlas {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = ATLAS_PIXELS;
    this.canvas.height = ATLAS_PIXELS;
    this.ctx = this.canvas.getContext('2d', { alpha: true });
    this.ctx.imageSmoothingEnabled = false;

    this.tiles = new Map(); // tileName -> { cx, cy, uv: { u0, u1, vBottom, vTop } }
    this.nextIndex = 0;
    this.previewCache = new Map();
    this.crackTextures = null;

    this._generateAllStage1Tiles();

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.needsUpdate = true;
  }

  /**
   * Registers a 16x16 RGBA pixel generator and extrudes its border by 8px on all sides
   * inside a 32x32 atlas cell to eliminate texture bleeding at any angle/distance.
   */
  addTile(name, pixelPainter) {
    const idx = this.nextIndex++;
    if (idx >= ATLAS_GRID_SIZE * ATLAS_GRID_SIZE) {
      throw new Error('TextureAtlas capacity exceeded');
    }

    const cx = idx % ATLAS_GRID_SIZE;
    const cy = Math.floor(idx / ATLAS_GRID_SIZE);

    const tilePixels = new Uint8ClampedArray(ATLAS_TILE_INNER * ATLAS_TILE_INNER * 4);
    for (let y = 0; y < ATLAS_TILE_INNER; y++) {
      for (let x = 0; x < ATLAS_TILE_INNER; x++) {
        const [r, g, b, a = 255] = pixelPainter(x, y);
        const offset = (y * ATLAS_TILE_INNER + x) * 4;
        tilePixels[offset] = clampByte(r);
        tilePixels[offset + 1] = clampByte(g);
        tilePixels[offset + 2] = clampByte(b);
        tilePixels[offset + 3] = clampByte(a);
      }
    }

    const cellImage = this.ctx.createImageData(ATLAS_CELL_SIZE, ATLAS_CELL_SIZE);
    const data = cellImage.data;

    for (let cyPx = 0; cyPx < ATLAS_CELL_SIZE; cyPx++) {
      const sy = Math.max(0, Math.min(ATLAS_TILE_INNER - 1, cyPx - ATLAS_TILE_PAD));
      for (let cxPx = 0; cxPx < ATLAS_CELL_SIZE; cxPx++) {
        const sx = Math.max(0, Math.min(ATLAS_TILE_INNER - 1, cxPx - ATLAS_TILE_PAD));
        const srcOff = (sy * ATLAS_TILE_INNER + sx) * 4;
        const dstOff = (cyPx * ATLAS_CELL_SIZE + cxPx) * 4;
        data[dstOff] = tilePixels[srcOff];
        data[dstOff + 1] = tilePixels[srcOff + 1];
        data[dstOff + 2] = tilePixels[srcOff + 2];
        data[dstOff + 3] = tilePixels[srcOff + 3];
      }
    }

    const ox = cx * ATLAS_CELL_SIZE;
    const oy = cy * ATLAS_CELL_SIZE;
    this.ctx.putImageData(cellImage, ox, oy);

    // Small sub-texel inset within the padded region prevents floating-point edge snapping.
    const eps = 0.02;
    const u0 = (ox + ATLAS_TILE_PAD + eps) / ATLAS_PIXELS;
    const u1 = (ox + ATLAS_TILE_PAD + ATLAS_TILE_INNER - eps) / ATLAS_PIXELS;
    // CanvasTexture default flipY = true -> top of canvas (smaller y) maps to higher V.
    const vTop = 1 - (oy + ATLAS_TILE_PAD + eps) / ATLAS_PIXELS;
    const vBottom = 1 - (oy + ATLAS_TILE_PAD + ATLAS_TILE_INNER - eps) / ATLAS_PIXELS;

    const record = { cx, cy, u0, u1, vBottom, vTop };
    this.tiles.set(name, record);
    return record;
  }

  getUV(name) {
    return this.tiles.get(name) || this.tiles.get('stone');
  }

  /**
   * Extracts a standalone 16x16 DataURL preview for hotbar/inventory icons (Stage 2+).
   */
  getTilePreviewDataURL(name) {
    if (this.previewCache.has(name)) {
      return this.previewCache.get(name);
    }
    const rec = this.getUV(name);
    const temp = document.createElement('canvas');
    temp.width = ATLAS_TILE_INNER;
    temp.height = ATLAS_TILE_INNER;
    const tctx = temp.getContext('2d');
    tctx.imageSmoothingEnabled = false;
    tctx.drawImage(
      this.canvas,
      rec.cx * ATLAS_CELL_SIZE + ATLAS_TILE_PAD,
      rec.cy * ATLAS_CELL_SIZE + ATLAS_TILE_PAD,
      ATLAS_TILE_INNER,
      ATLAS_TILE_INNER,
      0,
      0,
      ATLAS_TILE_INNER,
      ATLAS_TILE_INNER
    );
    const url = temp.toDataURL();
    this.previewCache.set(name, url);
    return url;
  }

  /**
   * Generates isometric-style 2D block icon DataURL for Hotbar slots.
   */
  getBlockIconDataURL(blockDef) {
    if (!blockDef || !blockDef.faces) return '';
    const cacheKey = `block:${blockDef.id}`;
    if (this.previewCache.has(cacheKey)) {
      return this.previewCache.get(cacheKey);
    }

    const size = 32;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;

    const topRec = this.getUV(blockDef.faces.top);
    const sideLeftRec = this.getUV(blockDef.faces.west);
    const sideRightRec = this.getUV(blockDef.faces.south);

    if (blockDef.isCross) {
      g.drawImage(
        this.canvas,
        topRec.cx * ATLAS_CELL_SIZE + ATLAS_TILE_PAD,
        topRec.cy * ATLAS_CELL_SIZE + ATLAS_TILE_PAD,
        ATLAS_TILE_INNER,
        ATLAS_TILE_INNER,
        2,
        2,
        28,
        28
      );
      const url = c.toDataURL();
      this.previewCache.set(cacheKey, url);
      return url;
    }

    const drawIsoFace = (rec, a, b, cc, d, e, f, brightness) => {
      g.save();
      g.transform(a, b, cc, d, e, f);
      g.drawImage(
        this.canvas,
        rec.cx * ATLAS_CELL_SIZE + ATLAS_TILE_PAD,
        rec.cy * ATLAS_CELL_SIZE + ATLAS_TILE_PAD,
        ATLAS_TILE_INNER,
        ATLAS_TILE_INNER,
        0,
        0,
        16,
        16
      );
      if (brightness < 1) {
        g.fillStyle = `rgba(0,0,0,${(1 - brightness).toFixed(2)})`;
        g.fillRect(0, 0, 16, 16);
      }
      g.restore();
    };

    // Isometric cube projection centered in 32x32 icon
    drawIsoFace(topRec, 0.85, 0.42, -0.85, 0.42, 16, 2, 1.0);
    drawIsoFace(sideLeftRec, 0.85, 0.42, 0, 0.92, 2.4, 8.7, 0.82);
    drawIsoFace(sideRightRec, 0.85, -0.42, 0, 0.92, 16, 15.4, 0.64);

    const url = c.toDataURL();
    this.previewCache.set(cacheKey, url);
    return url;
  }

  /**
   * Procedurally generates 10 Minecraft destroy_stage_0..9 crack textures (16x16).
   */
  getCrackTextures() {
    if (this.crackTextures) return this.crackTextures;
    this.crackTextures = [];

    // Deterministic branching fracture paths radiating from tile center
    const crackPaths = [
      [[8, 8], [7, 7], [6, 6], [5, 4], [4, 2], [3, 1]],
      [[8, 8], [9, 7], [11, 6], [13, 5], [14, 3], [15, 2]],
      [[8, 8], [7, 9], [6, 11], [4, 12], [2, 14], [1, 15]],
      [[8, 8], [9, 9], [10, 11], [12, 12], [13, 14], [14, 15]],
      [[8, 8], [8, 6], [7, 4], [8, 2], [7, 0]],
      [[8, 8], [10, 8], [12, 9], [14, 8], [15, 9]],
      [[8, 8], [6, 8], [4, 7], [2, 8], [0, 7]],
      [[8, 8], [8, 10], [9, 12], [8, 14], [9, 15]],
      [[6, 6], [4, 7], [3, 9], [2, 11]],
      [[11, 6], [12, 8], [13, 10], [14, 12]],
      [[6, 11], [8, 12], [10, 12], [11, 13]],
      [[5, 4], [7, 3], [9, 3], [11, 2]],
    ];

    for (let stage = 0; stage < 10; stage++) {
      const c = document.createElement('canvas');
      c.width = ATLAS_TILE_INNER;
      c.height = ATLAS_TILE_INNER;
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.clearRect(0, 0, 16, 16);

      const activeBranches = Math.min(crackPaths.length, 2 + Math.floor(stage * 1.15));
      const depthSteps = 1 + Math.floor((stage + 1) * 0.6);

      for (let b = 0; b < activeBranches; b++) {
        const pts = crackPaths[b];
        const limit = Math.min(pts.length, depthSteps);
        for (let i = 0; i < limit; i++) {
          const [px, py] = pts[i];
          const alpha = Math.min(0.86, 0.35 + stage * 0.055);
          g.fillStyle = `rgba(12, 12, 12, ${alpha.toFixed(2)})`;
          g.fillRect(px, py, 1, 1);

          if (stage >= 5 && i > 0) {
            g.fillStyle = `rgba(28, 28, 28, ${(alpha * 0.55).toFixed(2)})`;
            g.fillRect(Math.min(15, px + 1), py, 1, 1);
          }
        }
      }

      if (stage >= 7) {
        g.fillStyle = `rgba(0, 0, 0, ${((stage - 6) * 0.09).toFixed(2)})`;
        g.fillRect(6, 6, 4, 4);
      }

      const tex = new THREE.CanvasTexture(c);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
      this.crackTextures.push(tex);
    }

    return this.crackTextures;
  }

  _generateAllStage1Tiles() {
    // 1. Dirt
    const dirtPalette = [
      hexToRgb('#866043'),
      hexToRgb('#7a5539'),
      hexToRgb('#946b4b'),
      hexToRgb('#6a4830'),
      hexToRgb('#593b27'),
    ];
    const dirtPixel = (x, y, seedOffset = 0) => {
      const n = pxHash(101 + seedOffset, x, y);
      if (n < 0.08) return dirtPalette[4];
      if (n < 0.25) return dirtPalette[3];
      if (n < 0.55) return dirtPalette[1];
      if (n < 0.82) return dirtPalette[0];
      return dirtPalette[2];
    };
    this.addTile('dirt', (x, y) => dirtPixel(x, y));

    // 2. Grass Top
    const grassColors = [
      hexToRgb('#5ca430'),
      hexToRgb('#6bb63a'),
      hexToRgb('#4f8f27'),
      hexToRgb('#7ac445'),
      hexToRgb('#447e21'),
    ];
    this.addTile('grass_top', (x, y) => {
      const n = pxHash(202, x, y);
      const blade = pxHash(209, x >> 1, y);
      if (blade > 0.78 && n > 0.5) return grassColors[3];
      if (n < 0.14) return grassColors[4];
      if (n < 0.36) return grassColors[2];
      if (n < 0.72) return grassColors[0];
      return grassColors[1];
    });

    // 3. Grass Side (overhanging green blades + shadow edge + dirt below)
    const grassOverhang = [3, 4, 3, 2, 3, 4, 5, 3, 2, 3, 4, 3, 2, 4, 3, 2];
    this.addTile('grass_side', (x, y) => {
      const cap = grassOverhang[x] + (pxHash(303, x, 0) > 0.65 ? 1 : 0);
      if (y < cap) {
        const n = pxHash(304, x, y);
        if (n < 0.25) return grassColors[2];
        if (n < 0.65) return grassColors[0];
        return n > 0.86 ? grassColors[3] : grassColors[1];
      }
      if (y === cap) {
        return shadeRgb(dirtPixel(x, y), -20);
      }
      return dirtPixel(x, y, 7);
    });

    // 4. Stone (mineral grain + subtle horizontal cracks)
    const stoneBase = hexToRgb('#7e7e7e');
    this.addTile('stone', (x, y) => {
      const n = pxHash(404, x, y);
      const streak = pxHash(405, Math.floor(x / 3), y);
      if (streak < 0.16 && n < 0.65) return shadeRgb(stoneBase, -22);
      if (streak > 0.86 && n > 0.4) return shadeRgb(stoneBase, 18);
      if (n < 0.18) return shadeRgb(stoneBase, -15);
      if (n < 0.45) return shadeRgb(stoneBase, -6);
      if (n > 0.85) return shadeRgb(stoneBase, 14);
      if (n > 0.68) return shadeRgb(stoneBase, 6);
      return stoneBase;
    });

    // 5. Cobblestone (chunky block stones with mortar cracks)
    const mortar = hexToRgb('#4f4f4f');
    const cobblePattern = [
      '1111022222033330',
      '1111022222033330',
      '1110002220033300',
      '0004440005550066',
      '4444440555555066',
      '4444400555550066',
      '0044077700550888',
      '9900777770008888',
      '9990777770aa0888',
      '999007770aaa0000',
      '000bbb000aaa0ccc',
      'dd0bbbb00000cccc',
      'ddd0bbb0eeee0ccc',
      'ddd0000eeeeee000',
      'dd0fff0eeeeee011',
      '00ffff000ee00111',
    ];
    this.addTile('cobblestone', (x, y) => {
      const ch = cobblePattern[y][x];
      if (ch === '0') return mortar;
      const cellId = ch.charCodeAt(0);
      const cellShade = ((cellId * 19) % 28) - 12;
      const speck = (pxHash(505, x, y) - 0.5) * 18;
      const edgeHighlight = (y > 0 && cobblePattern[y - 1][x] === '0') ? 14 : 0;
      return shadeRgb(hexToRgb('#7b7b7b'), cellShade + speck + edgeHighlight);
    });

    // 6. Bedrock (high-contrast chaotic dark stone)
    this.addTile('bedrock', (x, y) => {
      const n = pxHash(606, x, y);
      const cluster = pxHash(607, x >> 1, y >> 1);
      const v = n * 0.65 + cluster * 0.35;
      if (v < 0.22) return [18, 18, 18];
      if (v < 0.45) return [42, 42, 42];
      if (v < 0.72) return [68, 68, 68];
      if (v < 0.88) return [96, 96, 96];
      return [122, 122, 122];
    });

    // 7. Sand (soft warm speckled grains)
    const sandBase = hexToRgb('#dbd39f');
    this.addTile('sand', (x, y) => {
      const n = pxHash(707, x, y);
      const ripple = Math.sin((x + y * 0.7) * 0.75) * 4;
      if (n < 0.14) return shadeRgb(sandBase, -16 + ripple);
      if (n < 0.38) return shadeRgb(sandBase, -7 + ripple);
      if (n > 0.86) return shadeRgb(sandBase, 14 + ripple);
      if (n > 0.68) return shadeRgb(sandBase, 7 + ripple);
      return shadeRgb(sandBase, ripple);
    });

    // 8. Oak Log Side (vertical textured bark)
    const barkMid = hexToRgb('#675134');
    this.addTile('oak_log_side', (x, y) => {
      const col = pxHash(801, x, 0);
      const grain = pxHash(802, x, y >> 1);
      const fine = pxHash(803, x, y);
      if (col < 0.22 || (x % 4 === 1 && grain < 0.55)) {
        return shadeRgb(barkMid, -22 + (fine - 0.5) * 12);
      }
      if (col > 0.78 || (x % 4 === 2 && grain > 0.5)) {
        return shadeRgb(barkMid, 16 + (fine - 0.5) * 10);
      }
      return shadeRgb(barkMid, (fine - 0.5) * 16);
    });

    // 9. Oak Log Top (concentric growth rings + bark rim)
    const heartwood = hexToRgb('#b69362');
    this.addTile('oak_log_top', (x, y) => {
      if (x === 0 || x === 15 || y === 0 || y === 15) {
        return shadeRgb(barkMid, (pxHash(810, x, y) - 0.5) * 20);
      }
      if (x === 1 || x === 14 || y === 1 || y === 14) {
        return shadeRgb(heartwood, -28 + (pxHash(811, x, y) - 0.5) * 12);
      }
      const dx = Math.abs(x - 7.5);
      const dy = Math.abs(y - 7.5);
      const ring = Math.max(dx, dy);
      const isRing = Math.floor(ring) % 2 === 1;
      const noise = (pxHash(812, x, y) - 0.5) * 14;
      return shadeRgb(heartwood, (isRing ? -18 : 8) + noise);
    });

    // 10. Oak Leaves (cutout alpha holes + layered leaf clusters)
    const leafBase = hexToRgb('#4a8d28');
    this.addTile('oak_leaves', (x, y) => {
      const hole = pxHash(901, x, y);
      const cluster = pxHash(902, x >> 1, y >> 1);
      // Keep borders fairly connected while creating crisp alpha cutouts inside
      if (hole < 0.24 && cluster < 0.72) {
        return [0, 0, 0, 0];
      }
      const shade = pxHash(903, x, y);
      if (shade < 0.25) return [...shadeRgb(leafBase, -26), 255];
      if (shade < 0.58) return [...shadeRgb(leafBase, -8), 255];
      if (shade > 0.85) return [...shadeRgb(leafBase, 24), 255];
      return [...shadeRgb(leafBase, 8), 255];
    });

    // 11. Oak Planks (4 horizontal wooden boards with dark grooves)
    const plankBase = hexToRgb('#a4834f');
    this.addTile('oak_planks', (x, y) => {
      const plankRow = y >> 2; // 4 planks of 4px each
      const rowY = y & 3;
      const seamX = (plankRow * 7 + 4) & 15;
      if (rowY === 0 || x === seamX) {
        return shadeRgb(plankBase, -34);
      }
      const grain = (pxHash(1001, x >> 1, y) - 0.5) * 16;
      const boardTone = ((plankRow % 2) === 0 ? 6 : -6);
      const highlight = rowY === 1 ? 10 : rowY === 3 ? -8 : 0;
      return shadeRgb(plankBase, grain + boardTone + highlight);
    });

    // 12. Snow Block (crisp white with subtle cool shadows)
    const snowBase = hexToRgb('#f0f7fb');
    this.addTile('snow', (x, y) => {
      const n = pxHash(1101, x, y);
      if (n < 0.16) return [214, 230, 242];
      if (n < 0.36) return [228, 240, 248];
      if (n > 0.82) return [252, 254, 255];
      return snowBase;
    });

    // 13. Snow Grass Side
    this.addTile('snow_grass_side', (x, y) => {
      const cap = grassOverhang[x] + (pxHash(1201, x, 0) > 0.6 ? 1 : 0);
      if (y < cap) {
        const n = pxHash(1202, x, y);
        return n < 0.25 ? [216, 231, 242] : [245, 251, 255];
      }
      if (y === cap) {
        return shadeRgb(dirtPixel(x, y), -18);
      }
      return dirtPixel(x, y, 13);
    });

    // 14. Water (translucent crisp turquoise-blue ripples)
    const waterBase = hexToRgb('#2d74e2');
    this.addTile('water', (x, y) => {
      const wave = Math.sin((x * 0.8 + y * 0.45)) * 0.5 + 0.5;
      const n = pxHash(1301, x, y);
      const delta = wave * 20 + (n - 0.5) * 14 - 4;
      const rgb = shadeRgb(waterBase, delta);
      return [rgb[0], rgb[1], rgb[2], 192];
    });

    this._generateStage3Tiles(stoneBase, dirtPixel);
  }

  _generateStage3Tiles(stoneBase, dirtPixel) {
    // Helper for stone-embedded mineral ores
    const stonePixel = (x, y, seedShift = 0) => {
      const n = pxHash(404 + seedShift, x, y);
      const streak = pxHash(405 + seedShift, Math.floor(x / 3), y);
      if (streak < 0.16 && n < 0.65) return shadeRgb(stoneBase, -22);
      if (streak > 0.86 && n > 0.4) return shadeRgb(stoneBase, 18);
      if (n < 0.18) return shadeRgb(stoneBase, -15);
      if (n < 0.45) return shadeRgb(stoneBase, -6);
      if (n > 0.85) return shadeRgb(stoneBase, 14);
      if (n > 0.68) return shadeRgb(stoneBase, 6);
      return stoneBase;
    };

    const drawOreTile = (name, maskRows, brightRgb, darkRgb, highlightRgb, seed) => {
      this.addTile(name, (x, y) => {
        const ch = maskRows[y][x];
        if (ch === '2') return highlightRgb;
        if (ch === '1') return pxHash(seed, x, y) > 0.45 ? brightRgb : darkRgb;
        if (ch === 's') return shadeRgb(stonePixel(x, y, seed), -18);
        return stonePixel(x, y, seed);
      });
    };

    const drawSpriteTile = (name, rows, palette) => {
      this.addTile(name, (x, y) => {
        const ch = rows[y][x];
        if (ch === '.' || !palette[ch]) return [0, 0, 0, 0];
        return [...palette[ch], 255];
      });
    };

    // 15-17. Sandstone (top, bottom, side)
    const sandstoneBase = hexToRgb('#dfd5a8');
    this.addTile('sandstone_top', (x, y) => {
      const n = pxHash(1401, x, y);
      if (x === 0 || y === 0 || x === 15 || y === 15) return shadeRgb(sandstoneBase, -14 + n * 8);
      return shadeRgb(sandstoneBase, (n - 0.5) * 18 + 6);
    });
    this.addTile('sandstone_bottom', (x, y) => {
      const n = pxHash(1402, x, y);
      return shadeRgb(sandstoneBase, (n - 0.5) * 26 - 10);
    });
    this.addTile('sandstone_side', (x, y) => {
      const n = pxHash(1403, x, y);
      if (y <= 2) return shadeRgb(sandstoneBase, (n - 0.5) * 14 + 8);
      if (y === 3 || y === 7 || y === 11) return shadeRgb(sandstoneBase, -22 + n * 10);
      if (y === 5 && x % 4 === 2) return shadeRgb(sandstoneBase, -18);
      if (y === 6 && x % 4 === 0) return shadeRgb(sandstoneBase, 14);
      return shadeRgb(sandstoneBase, (n - 0.5) * 20 - (y > 11 ? 6 : 0));
    });

    // 18. Gravel (mixed multi-tone pebbles)
    const gravelBase = hexToRgb('#847f7c');
    this.addTile('gravel', (x, y) => {
      const pebble = pxHash(1501, Math.floor(x / 2), Math.floor(y / 2));
      const grain = pxHash(1502, x, y);
      if (pebble < 0.22) return shadeRgb(gravelBase, -26 + grain * 10);
      if (pebble < 0.45) return shadeRgb([152, 138, 128], (grain - 0.5) * 14);
      if (pebble > 0.80) return shadeRgb([168, 166, 162], (grain - 0.5) * 12);
      return shadeRgb(gravelBase, (grain - 0.5) * 28);
    });

    // 19. Clay (smooth cool grey-blue clay)
    const clayBase = hexToRgb('#9fa7b3');
    this.addTile('clay', (x, y) => {
      const clump = pxHash(1601, x >> 1, y >> 1);
      const n = pxHash(1602, x, y);
      return shadeRgb(clayBase, (clump - 0.5) * 18 + (n - 0.5) * 10);
    });

    // 20. Ice (semi-transparent pale blue with diagonal shine streaks)
    const iceBase = hexToRgb('#8cb8ff');
    this.addTile('ice', (x, y) => {
      const diag = (x + y) % 16;
      const border = x === 0 || x === 15 || y === 0 || y === 15;
      if (diag === 4 || diag === 5 || (diag === 11 && x > 4 && x < 12)) {
        return [228, 245, 255, 205];
      }
      if (border) return [185, 222, 255, 200];
      const n = pxHash(1701, x, y);
      const rgb = shadeRgb(iceBase, (n - 0.5) * 18);
      return [rgb[0], rgb[1], rgb[2], 180];
    });

    // 21-23. Birch Log & Leaves
    const birchBark = hexToRgb('#e5e3dc');
    this.addTile('birch_log_side', (x, y) => {
      const darkPatch =
        (y === 2 && x >= 3 && x <= 7) ||
        (y === 5 && x >= 10 && x <= 14) ||
        (y === 8 && x >= 1 && x <= 4) ||
        (y === 11 && x >= 6 && x <= 11) ||
        (y === 14 && x >= 11 && x <= 14) ||
        (y === 13 && x >= 2 && x <= 4);
      if (darkPatch) {
        return shadeRgb([46, 44, 42], pxHash(1801, x, y) * 18);
      }
      const n = pxHash(1802, x, y);
      if (y % 4 === 0 && n < 0.35) return shadeRgb(birchBark, -22);
      return shadeRgb(birchBark, (n - 0.5) * 14);
    });
    this.addTile('birch_log_top', (x, y) => {
      if (x === 0 || x === 15 || y === 0 || y === 15) return shadeRgb(birchBark, -20);
      const dx = Math.abs(x - 7.5);
      const dy = Math.abs(y - 7.5);
      const ring = Math.floor(Math.max(dx, dy)) % 2 === 1;
      return shadeRgb(hexToRgb('#c8af80'), (ring ? -18 : 8) + (pxHash(1805, x, y) - 0.5) * 12);
    });
    const birchLeaf = hexToRgb('#74a846');
    this.addTile('birch_leaves', (x, y) => {
      const hole = pxHash(1810, x, y);
      if (hole < 0.22 && pxHash(1811, x >> 1, y >> 1) < 0.72) return [0, 0, 0, 0];
      const shade = pxHash(1812, x, y);
      return [...shadeRgb(birchLeaf, (shade - 0.5) * 42), 255];
    });

    // 24-26. Spruce Log & Leaves
    const spruceBark = hexToRgb('#412c1a');
    this.addTile('spruce_log_side', (x, y) => {
      const stripe = (x % 3 === 1) ? -14 : 6;
      const n = pxHash(1901, x, y);
      return shadeRgb(spruceBark, stripe + (n - 0.5) * 16);
    });
    this.addTile('spruce_log_top', (x, y) => {
      if (x === 0 || x === 15 || y === 0 || y === 15) return spruceBark;
      const dx = Math.abs(x - 7.5);
      const dy = Math.abs(y - 7.5);
      const ring = Math.floor(Math.max(dx, dy)) % 2 === 1;
      return shadeRgb(hexToRgb('#8a6642'), (ring ? -16 : 6) + (pxHash(1905, x, y) - 0.5) * 12);
    });
    const spruceLeaf = hexToRgb('#315d34');
    this.addTile('spruce_leaves', (x, y) => {
      const hole = pxHash(1910, x, y);
      if (hole < 0.18 && pxHash(1911, x >> 1, y >> 1) < 0.65) return [0, 0, 0, 0];
      const shade = pxHash(1912, x, y);
      return [...shadeRgb(spruceLeaf, (shade - 0.5) * 34), 255];
    });

    // 27-29. Cactus (top, bottom, side with vertical ribs & pale spines)
    const cactusGreen = hexToRgb('#4f8f34');
    this.addTile('cactus_side', (x, y) => {
      if ((x === 1 || x === 5 || x === 10 || x === 14) && (y % 4 === 1 || y % 4 === 3)) {
        return [225, 224, 186]; // spines
      }
      if (x % 4 === 0) return shadeRgb(cactusGreen, -24);
      if (x % 4 === 2) return shadeRgb(cactusGreen, 14);
      return shadeRgb(cactusGreen, (pxHash(2001, x, y) - 0.5) * 16);
    });
    this.addTile('cactus_top', (x, y) => {
      if (x <= 1 || x >= 14 || y <= 1 || y >= 14) return shadeRgb(cactusGreen, -16);
      if (x >= 5 && x <= 10 && y >= 5 && y <= 10) return shadeRgb(cactusGreen, 18);
      return shadeRgb(cactusGreen, (pxHash(2002, x, y) - 0.5) * 14);
    });
    this.addTile('cactus_bottom', (x, y) => shadeRgb(cactusGreen, -28 + (pxHash(2003, x, y) - 0.5) * 16));

    // 30-32. Granite, Diorite, Andesite
    const graniteBase = hexToRgb('#9d6f5c');
    this.addTile('granite', (x, y) => {
      const n = pxHash(2101, x, y);
      if (n < 0.16) return [196, 154, 138];
      if (n > 0.84) return [114, 77, 65];
      return shadeRgb(graniteBase, (n - 0.5) * 24);
    });
    const dioriteBase = hexToRgb('#c8c8cc');
    this.addTile('diorite', (x, y) => {
      const n = pxHash(2102, x, y);
      if (n < 0.18) return [92, 92, 98];
      if (n > 0.82) return [236, 236, 240];
      return shadeRgb(dioriteBase, (n - 0.5) * 26);
    });
    const andesiteBase = hexToRgb('#8b8d8e');
    this.addTile('andesite', (x, y) => {
      const n = pxHash(2103, x, y);
      const cl = pxHash(2104, x >> 1, y >> 1);
      return shadeRgb(andesiteBase, (n - 0.5) * 22 + (cl - 0.5) * 18);
    });

    // 33-39. Classical Ores
    const orePatternA = [
      '................',
      '..11s...........',
      '.1211s....11s...',
      '..111.....121...',
      '......s....1....',
      '...s111.........',
      '..s1211s...11...',
      '...s11....1211s.',
      '..........111s..',
      '.11s............',
      '1211s....11s....',
      '.111....1211....',
      '.........11s....',
      '...11s..........',
      '..1211......11s.',
      '...11.......121.',
    ];
    const orePatternB = [
      '................',
      '....11s.........',
      '...1211s...11s..',
      '....11....121...',
      '...........1....',
      '.11s............',
      '1211.....s111...',
      '.11s....s1211s..',
      '.........111s...',
      '....11s.........',
      '...1211...11s...',
      '....11...1211...',
      '..........11....',
      '.11s............',
      '1211.....11s....',
      '.11.....1211....',
    ];
    drawOreTile('coal_ore', orePatternA, [30, 30, 32], [18, 18, 20], [52, 52, 56], 2201);
    drawOreTile('iron_ore', orePatternB, [216, 175, 146], [176, 134, 108], [242, 212, 188], 2202);
    drawOreTile('gold_ore', orePatternA, [252, 224, 72], [212, 168, 36], [255, 248, 152], 2203);
    drawOreTile('lapis_ore', orePatternB, [46, 94, 214], [24, 56, 158], [96, 146, 250], 2204);
    drawOreTile('redstone_ore', orePatternA, [232, 34, 26], [164, 18, 14], [255, 104, 86], 2205);
    drawOreTile('diamond_ore', orePatternB, [74, 232, 226], [36, 178, 178], [176, 255, 252], 2206);
    drawOreTile('emerald_ore', [
      '................',
      '........21......',
      '...21...11s.....',
      '...11s..........',
      '......211.......',
      '......111s......',
      '..........21....',
      '..21......11s...',
      '..11s...........',
      '......21........',
      '......11s..21...',
      '...........11s..',
      '...21...........',
      '...11s....21....',
      '..........11s...',
      '................',
    ], [26, 212, 92], [18, 156, 62], [136, 255, 166], 2207);

    // 40-47. Cross-mesh Plants (16x16 pixel art sprites)
    drawSpriteTile('tall_grass', [
      '................',
      '.......g........',
      '..g....g....l...',
      '..g...lg...lg...',
      '..lg..lg...l....',
      '..lg..dg..lg..g.',
      '.l.g..dg..lg..g.',
      '.lgd..dg.dlg.lg.',
      '..dg.ldg.dlg.dg.',
      '..dg.ldg..dg.dg.',
      '.ldg.ddg..dgldg.',
      '.ddg.ddg..dgddg.',
      '.ddg.ddg.lddddg.',
      '..dd.ddd.dddddd.',
      '..dd.ddd.dddddd.',
      '..dd.ddd.dddddd.',
    ], {
      g: [104, 174, 58],
      l: [132, 202, 74],
      d: [74, 134, 38],
    });

    drawSpriteTile('poppy', [
      '................',
      '................',
      '......rrr.......',
      '....rrRRRrr.....',
      '....rRkkkRr.....',
      '....rrRrrRr.....',
      '.....rrrrr......',
      '......ggg.......',
      '.......g........',
      '......lg........',
      '.......g........',
      '.......g.g......',
      '.....g.gg.......',
      '......gg........',
      '.......g........',
      '.......g........',
    ], {
      r: [212, 26, 28],
      R: [248, 58, 52],
      k: [34, 18, 18],
      g: [68, 138, 42],
      l: [96, 172, 60],
    });

    drawSpriteTile('dandelion', [
      '................',
      '................',
      '.....yyyy.......',
      '....yYYYYy......',
      '....yYooYy......',
      '....yyyyyy......',
      '......gg........',
      '.......g........',
      '......lg........',
      '.......g........',
      '.....g.g........',
      '......gg........',
      '.......g.g......',
      '.......gg.......',
      '.......g........',
      '.......g........',
    ], {
      y: [244, 212, 32],
      Y: [255, 244, 88],
      o: [204, 148, 18],
      g: [68, 138, 42],
      l: [96, 172, 60],
    });

    drawSpriteTile('dead_bush', [
      '................',
      '..b..........b..',
      '...b...b....b...',
      '...b..b....b....',
      '....b.b...b..b..',
      '.b...bb..b..b...',
      '..b..bb.bb.b....',
      '...b..bbb.b.....',
      '....b.bbb.......',
      '.....bbbb.b.....',
      '......bb.b......',
      '......bbb.......',
      '......bb........',
      '......bb........',
      '......bb........',
      '......bb........',
    ], {
      b: [132, 92, 52],
    });

    drawSpriteTile('red_mushroom', [
      '................',
      '................',
      '................',
      '................',
      '.....rrrrr......',
      '....rWrrrWr.....',
      '...rrWrrrWrr....',
      '...rrrrWrrrr....',
      '...rWrrrrrWr....',
      '....sssssss.....',
      '......sss.......',
      '......sss.......',
      '......sss.......',
      '......sss.......',
      '......sss.......',
      '......sss.......',
    ], {
      r: [212, 36, 32],
      W: [246, 240, 232],
      s: [216, 200, 178],
    });

    drawSpriteTile('brown_mushroom', [
      '................',
      '................',
      '................',
      '................',
      '.....bbbbb......',
      '....bBbbbBb.....',
      '...bbbbBbbbb....',
      '...bBbbbbbbB....',
      '....sssssss.....',
      '......sss.......',
      '......sss.......',
      '......sss.......',
      '......sss.......',
      '......sss.......',
      '......sss.......',
      '......sss.......',
    ], {
      b: [150, 108, 72],
      B: [184, 140, 98],
      s: [216, 200, 178],
    });

    drawSpriteTile('blue_orchid', [
      '................',
      '.....bb.bb......',
      '....bBbbbBb.....',
      '.....bBWBb......',
      '....bbbbb.......',
      '......g..bb.....',
      '......g.bBBb....',
      '.....lg..bb.....',
      '......g.g.......',
      '.......gg.......',
      '.......g........',
      '......lg........',
      '.......g........',
      '.......g........',
      '.......g........',
      '.......g........',
    ], {
      b: [42, 168, 224],
      B: [98, 214, 250],
      W: [242, 250, 255],
      g: [56, 126, 46],
      l: [84, 162, 68],
    });

    drawSpriteTile('vine', [
      '.g..gg...g..g...',
      '.g..g....g..lg..',
      '.lg.g...lg...g..',
      '..g.lg..g....g..',
      '..g..g..g...lg..',
      '.lg..g..lg..g...',
      '.g..lg...g..g...',
      '.g..g....g..lg..',
      '.g..g...lg...g..',
      '.lg.lg..g....g..',
      '..g..g..g...lg..',
      '..g..g..lg..g...',
      '....lg...g..g...',
      '....g....g......',
      '.........g......',
      '................',
    ], {
      g: [66, 132, 46],
      l: [94, 164, 64],
    });
  }
}
