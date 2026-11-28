import * as THREE from '../../vendor/three.module.min.js';

const cachedGeometries = new Map();

function srgbToLinear(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/**
 * Builds and caches a crisp 1-pixel-thick 3D voxel-extruded BufferGeometry
 * from a 16x16 TextureAtlas tile (with face culling between adjacent opaque pixels).
 */
export function getExtrudedTileGeometry(atlas, tileName, options = {}) {
  const minRow = options.minRow ?? 0;
  const maxRow = options.maxRow ?? 15;
  const scale = options.scale ?? 1.0;
  const cacheKey = `${tileName}:${minRow}:${maxRow}:${scale}`;

  if (cachedGeometries.has(cacheKey)) {
    return cachedGeometries.get(cacheKey);
  }

  const pixels = atlas?.getTilePixels16?.(tileName);
  const geo = new THREE.BufferGeometry();
  if (!pixels) {
    geo.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute([], 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute([], 3));
    return geo;
  }

  const isOpaque = (x, y) => {
    if (x < 0 || x >= 16 || y < minRow || y > maxRow) return false;
    return pixels[(y * 16 + x) * 4 + 3] >= 128;
  };

  const positions = [];
  const normals = [];
  const colors = [];

  const pxSize = scale / 16;
  const halfZ = pxSize * 0.52;
  const yCenter = (minRow + maxRow + 1) * 0.5;

  const pushQuad = (p0, p1, p2, p3, nx, ny, nz, r, g, b, shade) => {
    const cr = r * shade;
    const cg = g * shade;
    const cb = b * shade;
    // Triangle 1: p0, p1, p2
    positions.push(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]);
    // Triangle 2: p0, p2, p3
    positions.push(p0[0], p0[1], p0[2], p2[0], p2[1], p2[2], p3[0], p3[1], p3[2]);
    for (let i = 0; i < 6; i++) {
      normals.push(nx, ny, nz);
      colors.push(cr, cg, cb);
    }
  };

  for (let y = minRow; y <= maxRow; y++) {
    for (let x = 0; x < 16; x++) {
      if (!isOpaque(x, y)) continue;
      const off = (y * 16 + x) * 4;
      const r = srgbToLinear(pixels[off]);
      const g = srgbToLinear(pixels[off + 1]);
      const b = srgbToLinear(pixels[off + 2]);

      const x0 = (x - 8) * pxSize;
      const x1 = x0 + pxSize;
      // Flip Y so row 0 is at the top (+Y)
      const y1 = (yCenter - y) * pxSize;
      const y0 = y1 - pxSize;

      // Front (+Z)
      pushQuad([x0, y0, halfZ], [x1, y0, halfZ], [x1, y1, halfZ], [x0, y1, halfZ], 0, 0, 1, r, g, b, 1.0);
      // Back (-Z)
      pushQuad([x1, y0, -halfZ], [x0, y0, -halfZ], [x0, y1, -halfZ], [x1, y1, -halfZ], 0, 0, -1, r, g, b, 0.96);

      // Left (-X)
      if (!isOpaque(x - 1, y)) {
        pushQuad([x0, y0, -halfZ], [x0, y0, halfZ], [x0, y1, halfZ], [x0, y1, -halfZ], -1, 0, 0, r, g, b, 0.86);
      }
      // Right (+X)
      if (!isOpaque(x + 1, y)) {
        pushQuad([x1, y0, halfZ], [x1, y0, -halfZ], [x1, y1, -halfZ], [x1, y1, halfZ], 1, 0, 0, r, g, b, 0.86);
      }
      // Top (+Y -> smaller y index)
      if (!isOpaque(x, y - 1)) {
        pushQuad([x0, y1, halfZ], [x1, y1, halfZ], [x1, y1, -halfZ], [x0, y1, -halfZ], 0, 1, 0, r, g, b, 0.95);
      }
      // Bottom (-Y -> larger y index)
      if (!isOpaque(x, y + 1)) {
        pushQuad([x0, y0, -halfZ], [x1, y0, -halfZ], [x1, y0, halfZ], [x0, y0, halfZ], 0, -1, 0, r, g, b, 0.78);
      }
    }
  }

  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeBoundingSphere();

  cachedGeometries.set(cacheKey, geo);
  return geo;
}

export function clearExtrudedGeometryCache() {
  for (const geo of cachedGeometries.values()) {
    geo.dispose();
  }
  cachedGeometries.clear();
}
