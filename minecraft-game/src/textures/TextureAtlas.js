import * as THREE from '../../vendor/three.module.min.js';
import {
  ATLAS_CELL_SIZE,
  ATLAS_GRID_SIZE,
  ATLAS_PIXELS,
  ATLAS_TILE_INNER,
  ATLAS_TILE_PAD,
} from '../constants.js';
import { registerAllItemSprites } from './ItemSprites.js';
import { ItemRegistry } from '../items/ItemRegistry.js';
import { BlockRegistry } from '../blocks/BlockRegistry.js';

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
    this.tilePixels = new Map(); // tileName -> Uint8ClampedArray(16*16*4)
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

    this.waterTileTexture = this._createRepeatTileTexture('water');
    this.lavaTileTexture = this._createRepeatTileTexture('lava');
  }

  _createRepeatTileTexture(tileName) {
    const px = this.getTilePixels16(tileName);
    const c = document.createElement('canvas');
    c.width = ATLAS_TILE_INNER;
    c.height = ATLAS_TILE_INNER;
    const g = c.getContext('2d', { alpha: true });
    g.imageSmoothingEnabled = false;
    if (px) {
      const img = g.createImageData(ATLAS_TILE_INNER, ATLAS_TILE_INNER);
      img.data.set(px);
      g.putImageData(img, 0, 0);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
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
    this.tilePixels.set(name, tilePixels);
    return record;
  }

  getTilePixels16(name) {
    return this.tilePixels.get(name) || null;
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

    if (blockDef.isCross || blockDef.isTorch || blockDef.isLadder || blockDef.isCrop) {
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

    if (blockDef.isBed) {
      // Crisp 2D side-angled bed preview icon
      g.fillStyle = '#7b532f';
      g.fillRect(3, 21, 3, 6);
      g.fillRect(26, 21, 3, 6);
      g.fillStyle = '#9c6e44';
      g.fillRect(3, 18, 26, 4);
      g.fillStyle = '#f2f2f2';
      g.fillRect(4, 12, 9, 6);
      g.fillStyle = '#c82424';
      g.fillRect(13, 12, 16, 6);
      g.fillStyle = '#9e1919';
      g.fillRect(13, 16, 16, 2);
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

    // Isometric cube projection matching 3D world & held-block orientation (Top=1.0, West-left=0.74, South-front=0.90)
    drawIsoFace(topRec, 0.85, 0.42, -0.85, 0.42, 16, 2, 1.0);
    drawIsoFace(sideLeftRec, 0.85, 0.42, 0, 0.92, 2.4, 8.7, 0.74);
    drawIsoFace(sideRightRec, 0.85, -0.42, 0, 0.92, 16, 15.4, 0.90);

    const url = c.toDataURL();
    this.previewCache.set(cacheKey, url);
    return url;
  }

  getItemSamplePalette(id) {
    if (!this._samplePaletteCache) this._samplePaletteCache = new Map();
    if (this._samplePaletteCache.has(id)) return this._samplePaletteCache.get(id);

    let tileName = null;
    if (id > 0 && id < 256) {
      const b = BlockRegistry.get(id);
      tileName = b?.faces?.south || b?.faces?.top || null;
    } else if (id >= 256) {
      const it = ItemRegistry.get(id);
      tileName = it?.sprite || null;
    }

    const cols = [];
    const px = tileName ? this.getTilePixels16(tileName) : null;
    if (px) {
      for (let i = 0; i < 256; i += 3) {
        const off = i * 4;
        if (px[off + 3] >= 128) {
          cols.push(((px[off] << 16) | (px[off + 1] << 8) | px[off + 2]) >>> 0);
        }
      }
    }
    if (cols.length === 0) cols.push(0x9e9e9e);
    this._samplePaletteCache.set(id, cols);
    return cols;
  }

  getItemIconDataURL(itemOrId) {
    if (!itemOrId) return '';
    const id = typeof itemOrId === 'number' ? itemOrId : itemOrId.id;
    if (!id || id <= 0) return '';
    if (id < 256) {
      const bDef = BlockRegistry.get(id);
      return bDef && !bDef.isAir ? this.getBlockIconDataURL(bDef) : '';
    }
    const cacheKey = `item:${id}`;
    if (this.previewCache.has(cacheKey)) {
      return this.previewCache.get(cacheKey);
    }
    const itemDef = ItemRegistry.get(id);
    if (!itemDef || !itemDef.sprite) return '';
    const rec = this.getUV(itemDef.sprite);
    if (!rec) return '';
    const size = 32;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(
      this.canvas,
      rec.cx * ATLAS_CELL_SIZE + ATLAS_TILE_PAD,
      rec.cy * ATLAS_CELL_SIZE + ATLAS_TILE_PAD,
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
        return [32, 62, 18, 0];
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

    // 14. Water (seamless 16x16 turquoise-blue ripples)
    const waterBase = hexToRgb('#2d74e2');
    this.addTile('water', (x, y) => {
      const u = (x / 16) * Math.PI * 2;
      const v = (y / 16) * Math.PI * 2;
      const wave = Math.sin(u * 2 + Math.cos(v)) * 0.5 + 0.5;
      const n = pxHash(1301, x, y);
      const delta = wave * 24 + (n - 0.5) * 14 - 4;
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

    // 20. Ice (reworked crystalline glacier ice — smooth blue-cyan gradients & crisp frost veins, NO glass border)
    const iceBase = [124, 174, 246];
    this.addTile('ice', (x, y) => {
      const n = pxHash(1701, x, y);
      const streakA = (x + y === 6 || x + y === 17) && x >= 2 && x <= 13;
      const streakB = (x * 2 + y === 13 || x + y * 2 === 22) && y >= 3 && y <= 12;
      const wave = Math.sin((x * 0.45) + (y * 0.3)) * 10;
      if (streakA) return [214, 238, 255, 235];
      if (streakB) return [188, 224, 255, 228];
      const cell = pxHash(1703, x >> 2, y >> 2);
      const rgb = shadeRgb(iceBase, wave + (cell - 0.5) * 24 + (n - 0.5) * 14);
      return [rgb[0], rgb[1], rgb[2], 222];
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
      if (hole < 0.22 && pxHash(1811, x >> 1, y >> 1) < 0.72) return [42, 74, 24, 0];
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
      if (hole < 0.18 && pxHash(1911, x >> 1, y >> 1) < 0.65) return [22, 46, 24, 0];
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

    // 48. Torch (16x16 sprite: y=6..15 is the authentic 10px 3D shaft+ember tip, y=2..5 adds 2D hotbar flame aura)
    drawSpriteTile('torch', [
      '................',
      '................',
      '.......yy.......',
      '......yYYy......',
      '......oYYo......',
      '.......oo.......',
      '.......WW.......',
      '......oYYo......',
      '......oYYo......',
      '.......cc.......',
      '.......ww.......',
      '.......dd.......',
      '.......ww.......',
      '.......dd.......',
      '.......ww.......',
      '.......dd.......',
    ], {
      y: [255, 198, 42],
      Y: [255, 242, 108],
      W: [255, 252, 224],
      o: [248, 128, 28],
      c: [76, 52, 30],
      w: [154, 114, 64],
      d: [112, 78, 40],
    });

    // 49. Glowstone (crystalline amber/gold luminous lattice)
    const glowBright = [255, 238, 162];
    const glowMid = [228, 174, 72];
    const glowDark = [128, 84, 34];
    this.addTile('glowstone', (x, y) => {
      const cell = pxHash(2301, x >> 1, y >> 1);
      const px = pxHash(2302, x, y);
      if (x === 0 || x === 15 || y === 0 || y === 15) return shadeRgb(glowDark, (px - 0.5) * 18);
      if (cell > 0.65) return shadeRgb(glowBright, (px - 0.5) * 20);
      if (cell < 0.25) return shadeRgb(glowDark, (px - 0.5) * 20);
      return shadeRgb(glowMid, (px - 0.5) * 24);
    });

    // 50-52. Pumpkin & Jack o'Lantern
    const pumpOrange = [214, 122, 24];
    const pumpDark = [166, 84, 12];
    this.addTile('pumpkin_side', (x, y) => {
      const rib = x % 4 === 0 ? -24 : (x % 4 === 2 ? 12 : 0);
      const border = y === 0 || y === 15 ? -20 : 0;
      return shadeRgb(pumpOrange, rib + border + (pxHash(2401, x, y) - 0.5) * 14);
    });
    this.addTile('pumpkin_top', (x, y) => {
      if (x >= 7 && x <= 8 && y >= 7 && y <= 8) return [124, 106, 56];
      const dx = Math.abs(x - 7.5);
      const dy = Math.abs(y - 7.5);
      const ring = Math.floor(Math.max(dx, dy)) % 2 === 0 ? 8 : -12;
      return shadeRgb(pumpOrange, ring + (pxHash(2402, x, y) - 0.5) * 14);
    });
    const carvedFace = [
      '................',
      '................',
      '................',
      '................',
      '...LL......LL...',
      '..LLLL....LLLL..',
      '..LLLL....LLLL..',
      '................',
      '.......LL.......',
      '.......LL.......',
      '................',
      '..L..........L..',
      '..LL..LLLL..LL..',
      '...LLLLLLLLLL...',
      '................',
      '................',
    ];
    this.addTile('jack_o_lantern_face', (x, y) => {
      if (carvedFace[y][x] === 'L') {
        return y % 2 === 0 ? [255, 232, 96] : [255, 198, 42];
      }
      const rib = x % 4 === 0 ? -22 : (x % 4 === 2 ? 10 : 0);
      return shadeRgb(pumpDark, rib + (pxHash(2403, x, y) - 0.5) * 14);
    });

    // 53-58. Red Bed textures (solid full-coverage mattress/frame strips so 3D geometry never shows gaps)
    const bedRed = [188, 34, 34];
    const bedRedDark = [148, 22, 22];
    const bedWhite = [238, 240, 244];
    const bedWood = [146, 104, 62];
    this.addTile('bed_foot_top', (x, y) => {
      if (x === 0 || x === 15 || y === 15) return bedRedDark;
      return shadeRgb(bedRed, (pxHash(2501, x, y) - 0.5) * 14);
    });
    this.addTile('bed_head_top', (x, y) => {
      if (y <= 7) {
        if (x === 0 || x === 15 || y === 0) return [198, 200, 208];
        return shadeRgb(bedWhite, (pxHash(2502, x, y) - 0.5) * 10);
      }
      if (y === 8) return [218, 218, 222];
      if (x === 0 || x === 15) return bedRedDark;
      return shadeRgb(bedRed, (pxHash(2503, x, y) - 0.5) * 14);
    });
    this.addTile('bed_side_foot', (x, y) => {
      if (y <= 10) return shadeRgb(bedRed, (pxHash(2504, x, y) - 0.5) * 14);
      if (y <= 13) return shadeRgb(bedWood, (pxHash(2505, x, y) - 0.5) * 14);
      return shadeRgb(bedWood, -22);
    });
    this.addTile('bed_side_head', (x, y) => {
      if (y <= 10) return x <= 7 ? shadeRgb(bedWhite, -8) : shadeRgb(bedRed, (pxHash(2506, x, y) - 0.5) * 14);
      if (y <= 13) return shadeRgb(bedWood, (pxHash(2507, x, y) - 0.5) * 14);
      return shadeRgb(bedWood, -22);
    });
    this.addTile('bed_end_foot', (x, y) => {
      if (y <= 10) return shadeRgb(bedRedDark, (pxHash(2508, x, y) - 0.5) * 12);
      if (y <= 13) return shadeRgb(bedWood, (pxHash(2509, x, y) - 0.5) * 14);
      return shadeRgb(bedWood, -22);
    });
    this.addTile('bed_end_head', (x, y) => {
      if (y <= 10) return shadeRgb(bedWhite, -12);
      if (y <= 13) return shadeRgb(bedWood, (pxHash(2510, x, y) - 0.5) * 14);
      return shadeRgb(bedWood, -22);
    });

    // 59-77. Stage 5 Crafted & Functional Block Tiles
    const craftTopDark = [118, 76, 38];
    const craftTopPlank = [174, 134, 80];
    this.addTile('crafting_table_top', (x, y) => {
      if (x === 0 || x === 15 || y === 0 || y === 15) return shadeRgb(craftTopDark, -14);
      if (x === 5 || x === 10 || y === 5 || y === 10) return craftTopDark;
      return shadeRgb(craftTopPlank, (pxHash(2601, x, y) - 0.5) * 18);
    });
    const craftWood = [156, 114, 62];
    this.addTile('crafting_table_front', (x, y) => {
      if (y <= 2) return shadeRgb(craftTopDark, (pxHash(2602, x, y) - 0.5) * 12);
      // Saw + Hammer tools hanging on front
      if ((x >= 3 && x <= 5 && y >= 5 && y <= 11) || (x === 4 && y === 4)) {
        return y <= 6 ? [188, 194, 204] : [108, 74, 38];
      }
      if ((x >= 10 && x <= 12 && y >= 6 && y <= 12)) {
        return (y === 6 || y === 7) ? [178, 184, 194] : (x === 11 ? [108, 74, 38] : shadeRgb(craftWood, (pxHash(2603, x, y) - 0.5) * 14));
      }
      if (y === 3 || y === 15 || x === 0 || x === 15) return shadeRgb(craftTopDark, -8);
      return shadeRgb(craftWood, (pxHash(2604, x, y) - 0.5) * 16);
    });
    this.addTile('crafting_table_side', (x, y) => {
      if (y <= 2) return shadeRgb(craftTopDark, (pxHash(2605, x, y) - 0.5) * 12);
      if (x >= 3 && x <= 12 && y >= 5 && y <= 11 && (x === 7 || x === 8 || y === 5 || y === 11)) {
        return [96, 66, 36];
      }
      if (y === 3 || y === 15 || x === 0 || x === 15) return shadeRgb(craftTopDark, -8);
      return shadeRgb(craftWood, (pxHash(2606, x, y) - 0.5) * 16);
    });

    // Furnace
    const furnStone = [126, 126, 130];
    this.addTile('furnace_top', (x, y) => {
      const border = x === 0 || x === 15 || y === 0 || y === 15;
      const n = pxHash(2701, x, y);
      if (border) return shadeRgb(furnStone, -28 + n * 10);
      return shadeRgb(furnStone, (n - 0.5) * 28);
    });
    this.addTile('furnace_side', (x, y) => {
      const n = pxHash(2702, x, y);
      if (y === 0 || y === 15 || y === 7 || (y < 7 && x % 8 === 0) || (y > 7 && (x + 4) % 8 === 0)) {
        return shadeRgb(furnStone, -32 + n * 8);
      }
      return shadeRgb(furnStone, (n - 0.5) * 26);
    });
    const renderFurnaceFront = (lit) => (x, y) => {
      const n = pxHash(2703, x, y);
      // Top smelter mouth
      if (x >= 3 && x <= 12 && y >= 2 && y <= 6) {
        if (y === 2 || y === 6 || x === 3 || x === 12) return [64, 64, 68];
        return [28, 28, 32];
      }
      // Bottom firebox
      if (x >= 4 && x <= 11 && y >= 10 && y <= 14) {
        if (y === 10 || x === 4 || x === 11) return [58, 58, 62];
        if (!lit) return [24, 24, 28];
        const flicker = pxHash(2709, x, y);
        if (y >= 13) return flicker > 0.45 ? [255, 224, 72] : [248, 128, 24];
        return flicker > 0.35 ? [255, 168, 36] : [214, 74, 18];
      }
      if (x === 0 || x === 15 || y === 0 || y === 15) return shadeRgb(furnStone, -30);
      return shadeRgb(furnStone, (n - 0.5) * 26);
    };
    this.addTile('furnace_front', renderFurnaceFront(false));
    this.addTile('furnace_front_on', renderFurnaceFront(true));

    // Chest
    const chestWood = [166, 114, 48];
    const chestRim = [78, 52, 22];
    this.addTile('chest_top', (x, y) => {
      if (x <= 1 || x >= 14 || y <= 1 || y >= 14) return shadeRgb(chestRim, (pxHash(2801, x, y) - 0.5) * 12);
      return shadeRgb(chestWood, (pxHash(2802, x, y) - 0.5) * 20);
    });
    this.addTile('chest_side', (x, y) => {
      if (x === 0 || x === 15 || y === 0 || y === 15 || y === 5) return shadeRgb(chestRim, (pxHash(2803, x, y) - 0.5) * 12);
      return shadeRgb(chestWood, (pxHash(2804, x, y) - 0.5) * 22);
    });
    this.addTile('chest_front', (x, y) => {
      if (x >= 6 && x <= 9 && y >= 4 && y <= 7) {
        return (x === 7 || x === 8) && y >= 5 && y <= 6 ? [216, 220, 228] : [132, 136, 146];
      }
      if (x === 0 || x === 15 || y === 0 || y === 15 || y === 5) return shadeRgb(chestRim, (pxHash(2805, x, y) - 0.5) * 12);
      return shadeRgb(chestWood, (pxHash(2806, x, y) - 0.5) * 22);
    });

    // Glass (cutout frame + clean diagonal glint streaks)
    this.addTile('glass', (x, y) => {
      if (x === 0 || x === 15 || y === 0 || y === 15) return [188, 226, 238, 255];
      if ((x === 3 && y === 2) || (x === 2 && y === 3) || (x === 4 && y === 2) || (x === 3 && y === 3)) {
        return [232, 248, 255, 255];
      }
      if ((x === 12 && y === 11) || (x === 11 && y === 12)) {
        return [216, 240, 250, 255];
      }
      return [0, 0, 0, 0];
    });

    // Stone Bricks
    const sbBase = [122, 124, 128];
    this.addTile('stone_bricks', (x, y) => {
      const n = pxHash(2901, x, y);
      const mortar = y === 0 || y === 8 || (y < 8 && x === 7) || (y >= 8 && x === 15);
      if (mortar) return shadeRgb(sbBase, -36 + n * 8);
      if (y === 1 || y === 9) return shadeRgb(sbBase, 14 + n * 8);
      if (y === 7 || y === 15) return shadeRgb(sbBase, -18 + n * 8);
      return shadeRgb(sbBase, (n - 0.5) * 22);
    });

    // Ladder
    this.addTile('ladder', (x, y) => {
      const rail = x === 2 || x === 3 || x === 12 || x === 13;
      const rung = y === 1 || y === 2 || y === 5 || y === 6 || y === 9 || y === 10 || y === 13 || y === 14;
      if (!rail && !rung) return [0, 0, 0, 0];
      const n = pxHash(2950, x, y);
      if (rail && !rung) return [...shadeRgb([144, 102, 54], (n - 0.5) * 18), 255];
      return [...shadeRgb([166, 122, 68], (n - 0.5) * 18), 255];
    });

    // Resource Blocks (Coal, Iron, Gold, Diamond, Wool)
    this.addTile('coal_block', (x, y) => {
      const n = pxHash(3001, x, y);
      const border = x === 0 || x === 15 || y === 0 || y === 15;
      return shadeRgb([34, 34, 38], (border ? -12 : 0) + (n - 0.5) * 22);
    });
    this.addTile('iron_block', (x, y) => {
      if (x === 0 || y === 0) return [242, 246, 250];
      if (x === 15 || y === 15) return [142, 148, 158];
      if (x === 1 || y === 1 || x === 14 || y === 14) return [218, 224, 232];
      return shadeRgb([204, 210, 220], (pxHash(3002, x, y) - 0.5) * 14);
    });
    this.addTile('gold_block', (x, y) => {
      if (x === 0 || y === 0) return [255, 246, 142];
      if (x === 15 || y === 15) return [184, 124, 18];
      if (x === 1 || y === 1 || x === 14 || y === 14) return [252, 222, 68];
      return shadeRgb([244, 198, 42], (pxHash(3003, x, y) - 0.5) * 18);
    });
    this.addTile('diamond_block', (x, y) => {
      if (x === 0 || y === 0) return [168, 254, 248];
      if (x === 15 || y === 15) return [26, 142, 140];
      if (x === 1 || y === 1 || x === 14 || y === 14) return [110, 240, 232];
      return shadeRgb([68, 218, 208], (pxHash(3004, x, y) - 0.5) * 20);
    });
    this.addTile('wool_white', (x, y) => {
      const n = pxHash(3005, x, y);
      const weave = ((x + y) % 2 === 0 ? 6 : -6);
      return shadeRgb([238, 238, 240], weave + (n - 0.5) * 14);
    });

    // Stage 6 Farming, Ores & Building Block Tiles
    const renderFarmland = (wet) => (x, y) => {
      const n = pxHash(wet ? 3101 : 3102, x, y);
      const furrow = (y % 4 === 1 || y % 4 === 2);
      const base = wet ? [76, 48, 28] : [132, 92, 58];
      return shadeRgb(base, (furrow ? -16 : 8) + (n - 0.5) * 18);
    };
    this.addTile('farmland_dry', renderFarmland(false));
    this.addTile('farmland_wet', renderFarmland(true));

    // Wheat stages 0..7 (from bright green sprouts to tall golden wheat ears)
    for (let st = 0; st <= 7; st++) {
      this.addTile(`wheat_stage_${st}`, (x, y) => {
        const height = 2 + Math.floor((st / 7) * 13);
        const topRow = 15 - height;
        if (y < topRow) return [0, 0, 0, 0];
        const stalk = x === 2 || x === 5 || x === 8 || x === 11 || x === 14;
        const leaf = (st >= 2 && (x === 3 || x === 7 || x === 12) && y > topRow + 1);
        if (!stalk && !leaf) return [0, 0, 0, 0];
        const n = pxHash(3120 + st, x, y);
        const goldenMix = Math.max(0, (st - 4) / 3);
        const green = [88, 174, 48];
        const gold = [218, 186, 62];
        const r = green[0] + (gold[0] - green[0]) * goldenMix;
        const g = green[1] + (gold[1] - green[1]) * goldenMix;
        const b = green[2] + (gold[2] - green[2]) * goldenMix;
        const headGlow = (st >= 5 && y <= topRow + 3) ? 20 : 0;
        return [...shadeRgb([r, g, b], headGlow + (n - 0.5) * 22), 255];
      });
    }

    // Hay Bale
    this.addTile('hay_bale_top', (x, y) => {
      const n = pxHash(3140, x, y);
      const bundle = ((x >> 1) + (y >> 1)) % 2 === 0 ? 10 : -8;
      return shadeRgb([214, 184, 58], bundle + (n - 0.5) * 24);
    });
    this.addTile('hay_bale_side', (x, y) => {
      if (y === 4 || y === 5 || y === 11 || y === 12) {
        return shadeRgb([178, 52, 42], (pxHash(3141, x, y) - 0.5) * 16);
      }
      const strand = pxHash(3142, x, y >> 2);
      return shadeRgb([216, 184, 56], (strand - 0.5) * 32);
    });

    // Deepslate (dark textured horizontal slate layers)
    this.addTile('deepslate', (x, y) => {
      const n = pxHash(3150, x, y);
      const band = (y % 3 === 0 ? -12 : y % 3 === 1 ? 8 : 0);
      return shadeRgb([78, 80, 88], band + (n - 0.5) * 22);
    });

    // Copper Ore & Copper Block
    const stoneRgb = hexToRgb('#7d7d7d');
    this.addTile('copper_ore', (x, y) => {
      const n = pxHash(3155, x, y);
      const vein = (
        ((x >= 3 && x <= 6 && y >= 3 && y <= 5) ||
         (x >= 9 && x <= 12 && y >= 6 && y <= 9) ||
         (x >= 4 && x <= 7 && y >= 10 && y <= 13))
        && pxHash(3156, x, y) > 0.25
      );
      if (vein) {
        return pxHash(3157, x, y) > 0.45 ? [224, 126, 78] : [78, 164, 134];
      }
      return shadeRgb(stoneRgb, (n - 0.5) * 24);
    });
    this.addTile('copper_block', (x, y) => {
      if (x === 0 || y === 0) return [242, 168, 124];
      if (x === 15 || y === 15) return [134, 72, 44];
      const plate = x === 7 || y === 7 || x === 8 || y === 8;
      return shadeRgb([196, 112, 72], (plate ? -18 : 0) + (pxHash(3158, x, y) - 0.5) * 16);
    });

    // Smooth Stone, Bricks, Bookshelf, Mossy Cobblestone
    this.addTile('smooth_stone', (x, y) => {
      if (x === 0 || y === 0) return [184, 186, 190];
      if (x === 15 || y === 15) return [124, 126, 130];
      return shadeRgb([158, 160, 164], (pxHash(3160, x, y) - 0.5) * 12);
    });
    this.addTile('bricks', (x, y) => {
      const row = Math.floor(y / 4);
      const mortarY = y % 4 === 0;
      const offsetX = (row % 2) * 4;
      const mortarX = (x + offsetX) % 8 === 0;
      if (mortarY || mortarX) return shadeRgb([204, 198, 188], (pxHash(3161, x, y) - 0.5) * 12);
      const brickTint = ((row * 5 + Math.floor((x + offsetX) / 8)) % 3 - 1) * 12;
      return shadeRgb([156, 78, 60], brickTint + (pxHash(3162, x, y) - 0.5) * 18);
    });
    this.addTile('bookshelf', (x, y) => {
      if (y <= 1 || y >= 14 || x === 0 || x === 15 || y === 7 || y === 8) {
        return shadeRgb([164, 130, 80], (pxHash(3163, x, y) - 0.5) * 18);
      }
      const bookCols = [[166, 46, 46], [52, 124, 174], [64, 146, 72], [204, 166, 62], [134, 72, 146]];
      const c = bookCols[(x * 3 + (y > 8 ? 2 : 0)) % bookCols.length];
      if (y === 2 || y === 9) return shadeRgb(c, -26);
      return shadeRgb(c, (pxHash(3164, x, y) - 0.5) * 14);
    });
    this.addTile('mossy_cobblestone', (x, y) => {
      const n = pxHash(3165, x, y);
      const cell = ((Math.floor(x / 4) * 7 + Math.floor(y / 3) * 13) % 5);
      const seam = (x % 4 === 0 && (y + cell) % 3 === 0) || (y % 4 === 0 && (x + cell) % 5 === 0);
      if (seam || n > 0.66) {
        return shadeRgb([78, 124, 58], (n - 0.5) * 28);
      }
      const cellShade = (cell - 2) * 11;
      return shadeRgb([120, 122, 120], cellShade + (n - 0.5) * 18);
    });

    // Stage 7: Lava (seamless fiery orange-yellow magma veins) & Obsidian (deep purple-black crystal)
    this.addTile('lava', (x, y) => {
      const u = (x / 16) * Math.PI * 2;
      const v = (y / 16) * Math.PI * 2;
      const cell = Math.sin(u * 2 + Math.cos(v * 2)) * Math.cos(v * 2 - Math.sin(u));
      const n = pxHash(3201, x, y);
      const hot = cell * 0.5 + 0.5 + (n - 0.5) * 0.28;
      if (hot > 0.78) return [255, 232, 118, 255];
      if (hot > 0.54) return [248, 128, 24, 255];
      if (hot > 0.28) return [214, 62, 12, 255];
      return [142, 28, 8, 255];
    });

    this.addTile('obsidian', (x, y) => {
      const n = pxHash(3205, x, y);
      const vein = pxHash(3206, Math.floor(x / 2), Math.floor(y / 2));
      if (vein > 0.76 && n > 0.48) return shadeRgb([58, 34, 92], (n - 0.5) * 24);
      if (n > 0.85) return shadeRgb([42, 28, 66], 10);
      if (n < 0.22) return [12, 10, 18];
      return shadeRgb([22, 18, 34], (n - 0.5) * 18);
    });

    // Stage 8: TNT Top, Bottom & Side (classic red wraps + white band + TNT lettering)
    this.addTile('tnt_top', (x, y) => {
      const stickX = x % 4;
      const stickY = y % 4;
      if (stickX === 0 || stickY === 0) return [116, 26, 20];
      if (x >= 6 && x <= 9 && y >= 6 && y <= 9) {
        return (x === 7 || x === 8) && (y === 7 || y === 8) ? [48, 48, 54] : [206, 206, 206];
      }
      return shadeRgb([188, 52, 40], (pxHash(3301, x, y) - 0.5) * 22);
    });
    this.addTile('tnt_bottom', (x, y) => {
      const stickX = x % 4;
      const stickY = y % 4;
      if (stickX === 0 || stickY === 0) return [104, 22, 16];
      return shadeRgb([172, 46, 36], (pxHash(3302, x, y) - 0.5) * 20);
    });
    const tntBand = [
      '................',
      '.TTT..N..N..TTT.',
      '..T...NN.N...T..',
      '..T...N.NN...T..',
      '..T...N..N...T..',
      '................',
    ];
    this.addTile('tnt_side', (x, y) => {
      if (y >= 5 && y <= 10) {
        const ch = tntBand[y - 5][x];
        if (ch === 'T' || ch === 'N') return [22, 22, 26];
        return shadeRgb([238, 236, 230], (pxHash(3303, x, y) - 0.5) * 10);
      }
      const seam = x % 4 === 0 ? -18 : 0;
      const rim = (y === 4 || y === 11) ? -22 : 0;
      return shadeRgb([196, 46, 34], seam + rim + (pxHash(3304, x, y) - 0.5) * 20);
    });

    // Stage 5, 6 & 8 All 16x16 Item Pixel Sprites
    registerAllItemSprites(this);
  }
}
