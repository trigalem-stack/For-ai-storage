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
    return temp.toDataURL();
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

    // 14. Water (translucent blue pixel ripples)
    const waterBase = hexToRgb('#356ae0');
    this.addTile('water', (x, y) => {
      const wave = Math.sin((x * 0.8 + y * 0.45)) * 0.5 + 0.5;
      const n = pxHash(1301, x, y);
      const delta = wave * 18 + (n - 0.5) * 14 - 4;
      const rgb = shadeRgb(waterBase, delta);
      return [rgb[0], rgb[1], rgb[2], 195];
    });
  }
}
