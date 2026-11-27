import * as THREE from '../../vendor/three.module.min.js';
import { BLOCK_IDS, BlockRegistry } from '../blocks/BlockRegistry.js';
import { AO_CURVE, CHUNK_SIZE, FACE_SHADE, WORLD_HEIGHT } from '../constants.js';
import { BiomeManager } from './BiomeManager.js';

// Each face defines:
// key, normal [nx, ny, nz], shade, hemisphere tint, and 4 CCW vertices [dx, dy, dz, ox, oy, oz, uIdx, vIdx]
const FACES = [
  {
    key: 'top',
    nx: 0, ny: 1, nz: 0,
    shade: FACE_SHADE.TOP,
    hemi: [1.02, 1.01, 0.97],
    corners: [
      [0, 1, 1, -1, 0,  1, 0, 0],
      [1, 1, 1,  1, 0,  1, 1, 0],
      [1, 1, 0,  1, 0, -1, 1, 1],
      [0, 1, 0, -1, 0, -1, 0, 1],
    ],
  },
  {
    key: 'bottom',
    nx: 0, ny: -1, nz: 0,
    shade: FACE_SHADE.BOTTOM,
    hemi: [0.94, 0.96, 1.04],
    corners: [
      [0, 0, 0, -1, 0, -1, 0, 0],
      [1, 0, 0,  1, 0, -1, 1, 0],
      [1, 0, 1,  1, 0,  1, 1, 1],
      [0, 0, 1, -1, 0,  1, 0, 1],
    ],
  },
  {
    key: 'south',
    nx: 0, ny: 0, nz: 1,
    shade: FACE_SHADE.SOUTH,
    hemi: [1.00, 1.00, 1.01],
    corners: [
      [0, 0, 1, -1, -1, 0, 0, 0],
      [1, 0, 1,  1, -1, 0, 1, 0],
      [1, 1, 1,  1,  1, 0, 1, 1],
      [0, 1, 1, -1,  1, 0, 0, 1],
    ],
  },
  {
    key: 'north',
    nx: 0, ny: 0, nz: -1,
    shade: FACE_SHADE.NORTH,
    hemi: [0.97, 0.99, 1.03],
    corners: [
      [1, 0, 0,  1, -1, 0, 0, 0],
      [0, 0, 0, -1, -1, 0, 1, 0],
      [0, 1, 0, -1,  1, 0, 1, 1],
      [1, 1, 0,  1,  1, 0, 0, 1],
    ],
  },
  {
    key: 'east',
    nx: 1, ny: 0, nz: 0,
    shade: FACE_SHADE.EAST,
    hemi: [0.99, 0.99, 1.02],
    corners: [
      [1, 0, 1, 0, -1,  1, 0, 0],
      [1, 0, 0, 0, -1, -1, 1, 0],
      [1, 1, 0, 0,  1, -1, 1, 1],
      [1, 1, 1, 0,  1,  1, 0, 1],
    ],
  },
  {
    key: 'west',
    nx: -1, ny: 0, nz: 0,
    shade: FACE_SHADE.WEST,
    hemi: [0.96, 0.98, 1.04],
    corners: [
      [0, 0, 0, 0, -1, -1, 0, 0],
      [0, 0, 1, 0, -1,  1, 1, 0],
      [0, 1, 1, 0,  1,  1, 1, 1],
      [0, 1, 0, 0,  1, -1, 0, 1],
    ],
  },
];

// Face indices mapped by horizontal direction (0:N, 1:E, 2:S, 3:W) for Jack o'Lantern rotation
const DIR_FACE_KEYS = ['north', 'east', 'south', 'west'];

const CROSS_PLANES = [
  {
    verts: [
      [0.14, 0, 0.14, 0, 0],
      [0.86, 0, 0.86, 1, 0],
      [0.86, 1, 0.86, 1, 1],
      [0.14, 1, 0.14, 0, 1],
    ],
    nx: 0.707, ny: 0.25, nz: -0.707,
    shade: 0.92,
  },
  {
    verts: [
      [0.14, 0, 0.86, 0, 0],
      [0.86, 0, 0.14, 1, 0],
      [0.86, 1, 0.14, 1, 1],
      [0.14, 1, 0.86, 0, 1],
    ],
    nx: 0.707, ny: 0.25, nz: 0.707,
    shade: 0.88,
  },
];

// Reusable typed-array scratch buffer including per-vertex dual-channel voxel light (aLight: sky, block)
class ScratchMeshBuffer {
  constructor(initialQuads = 2048) {
    this.capacityQuads = initialQuads;
    this.positions = new Float32Array(initialQuads * 12);
    this.normals = new Float32Array(initialQuads * 12);
    this.uvs = new Float32Array(initialQuads * 8);
    this.colors = new Float32Array(initialQuads * 12);
    this.lights = new Float32Array(initialQuads * 8);
    this.indices = new Uint32Array(initialQuads * 6);
    this.vertexCount = 0;
    this.indexCount = 0;
  }

  reset() {
    this.vertexCount = 0;
    this.indexCount = 0;
  }

  ensureQuadCapacity() {
    const neededQuads = (this.vertexCount >> 2) + 1;
    if (neededQuads <= this.capacityQuads) return;
    this.capacityQuads *= 2;

    const growFloat = (arr, stride) => {
      const next = new Float32Array(this.capacityQuads * stride);
      next.set(arr);
      return next;
    };
    this.positions = growFloat(this.positions, 12);
    this.normals = growFloat(this.normals, 12);
    this.uvs = growFloat(this.uvs, 8);
    this.colors = growFloat(this.colors, 12);
    this.lights = growFloat(this.lights, 8);

    const nextIdx = new Uint32Array(this.capacityQuads * 6);
    nextIdx.set(this.indices);
    this.indices = nextIdx;
  }

  pushQuad(verts, norm, uvs, colorRgb, skyL, blkL) {
    this.ensureQuadCapacity();
    const baseVert = this.vertexCount;
    let pOff = baseVert * 3;
    let uOff = baseVert * 2;
    for (let i = 0; i < 4; i++) {
      this.positions[pOff] = verts[i][0];
      this.positions[pOff + 1] = verts[i][1];
      this.positions[pOff + 2] = verts[i][2];
      this.normals[pOff] = norm[0];
      this.normals[pOff + 1] = norm[1];
      this.normals[pOff + 2] = norm[2];
      this.uvs[uOff] = uvs[i][0];
      this.uvs[uOff + 1] = uvs[i][1];
      this.colors[pOff] = colorRgb[0];
      this.colors[pOff + 1] = colorRgb[1];
      this.colors[pOff + 2] = colorRgb[2];
      this.lights[uOff] = skyL;
      this.lights[uOff + 1] = blkL;
      pOff += 3;
      uOff += 2;
    }
    const idxOff = this.indexCount;
    this.indices[idxOff] = baseVert;
    this.indices[idxOff + 1] = baseVert + 1;
    this.indices[idxOff + 2] = baseVert + 2;
    this.indices[idxOff + 3] = baseVert;
    this.indices[idxOff + 4] = baseVert + 2;
    this.indices[idxOff + 5] = baseVert + 3;
    this.vertexCount += 4;
    this.indexCount += 6;
  }

  toGeometry() {
    if (this.vertexCount === 0) return null;
    const vCount = this.vertexCount;
    const iCount = this.indexCount;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions.slice(0, vCount * 3), 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(this.normals.slice(0, vCount * 3), 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(this.uvs.slice(0, vCount * 2), 2));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.colors.slice(0, vCount * 3), 3));
    geometry.setAttribute('aLight', new THREE.BufferAttribute(this.lights.slice(0, vCount * 2), 2));

    if (vCount <= 65535) {
      const idx16 = new Uint16Array(iCount);
      for (let i = 0; i < iCount; i++) idx16[i] = this.indices[i];
      geometry.setIndex(new THREE.BufferAttribute(idx16, 1));
    } else {
      geometry.setIndex(new THREE.BufferAttribute(this.indices.slice(0, iCount), 1));
    }
    geometry.computeBoundingSphere();
    return geometry;
  }
}

export class ChunkMesher {
  constructor(atlas) {
    this.atlas = atlas;

    // Shared lighting uniforms across ALL terrain materials -> 0 ms CPU for full Day/Night cycle!
    this.lightUniforms = {
      uSunIntensity: { value: 1.0 },
      uSkyTint: { value: new THREE.Color('#ffffff') },
      uTorchTint: { value: new THREE.Color('#ffc478') },
      uMinLight: { value: 0.006 },
    };

    // Precompute linear-space shade * AO table (6 faces * 4 AO levels = 24 floats)
    this.shadeAoLUT = new Float32Array(6 * 4);
    for (let f = 0; f < 6; f++) {
      for (let ao = 0; ao < 4; ao++) {
        this.shadeAoLUT[f * 4 + ao] = Math.pow(FACES[f].shade * AO_CURVE[ao], 2.2);
      }
    }

    this.opaqueMaterial = this._createLitMaterial({
      map: atlas.texture,
      vertexColors: true,
      fog: true,
      side: THREE.FrontSide,
    });

    this.cutoutMaterial = this._createLitMaterial({
      map: atlas.texture,
      vertexColors: true,
      fog: true,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
    });

    this.waterMaterial = this._createLitMaterial({
      map: atlas.texture,
      vertexColors: true,
      fog: true,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this._opaqueBuf = new ScratchMeshBuffer(4096);
    this._cutoutBuf = new ScratchMeshBuffer(1024);
    this._waterBuf = new ScratchMeshBuffer(1024);
  }

  _createLitMaterial(params) {
    const mat = new THREE.MeshBasicMaterial(params);
    const uniforms = this.lightUniforms;

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uSunIntensity = uniforms.uSunIntensity;
      shader.uniforms.uSkyTint = uniforms.uSkyTint;
      shader.uniforms.uTorchTint = uniforms.uTorchTint;
      shader.uniforms.uMinLight = uniforms.uMinLight;

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
attribute vec2 aLight;
varying vec2 vVoxelLight;`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
vVoxelLight = aLight;`
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
uniform float uSunIntensity;
uniform vec3 uSkyTint;
uniform vec3 uTorchTint;
uniform float uMinLight;
varying vec2 vVoxelLight;`
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
float skyEff = clamp(vVoxelLight.x * uSunIntensity, 0.0, 1.0);
float blkEff = clamp(vVoxelLight.y, 0.0, 1.0);
float skyCurve = pow(0.8, (1.0 - skyEff) * 15.0);
float blkCurve = pow(0.8, (1.0 - blkEff) * 15.0);
vec3 skyTerm = pow(max(skyCurve, 0.001), 2.2) * uSkyTint;
vec3 blkTerm = pow(max(blkCurve, 0.001), 2.2) * uTorchTint;
diffuseColor.rgb *= max(max(skyTerm, blkTerm), vec3(uMinLight));`
        );
    };
    mat.customProgramCacheKey = () => 'mc-dual-light-v1';
    return mat;
  }

  setLightingUniforms(sunIntensity, skyTintColor, torchTintColor) {
    this.lightUniforms.uSunIntensity.value = sunIntensity;
    if (skyTintColor) this.lightUniforms.uSkyTint.value.copy(skyTintColor);
    if (torchTintColor) this.lightUniforms.uTorchTint.value.copy(torchTintColor);
  }

  /**
   * Builds chunk geometries using direct local+neighbor chunk references (no per-voxel Map lookups).
   * `neighbors` can be either an array of 8 chunk refs [W, E, N, S, NW, NE, SW, SE]
   * or a fallback getWorldBlock(wx, wy, wz) function for unit tests.
   */
  buildChunkGeometries(chunk, neighborsOrFn) {
    const opaqueBuf = this._opaqueBuf;
    const cutoutBuf = this._cutoutBuf;
    const waterBuf = this._waterBuf;
    opaqueBuf.reset();
    cutoutBuf.reset();
    waterBuf.reset();

    const baseX = chunk.cx * CHUNK_SIZE;
    const baseZ = chunk.cz * CHUNK_SIZE;
    const blocks = chunk.blocks;
    const light = chunk.light;
    const biomes = chunk.biomes;
    const lut = this.shadeAoLUT;
    const aoTable = BlockRegistry.aoTable;
    const opaqueTable = BlockRegistry.opaqueTable;
    const slice = CHUNK_SIZE * CHUNK_SIZE;

    const isFnFallback = typeof neighborsOrFn === 'function';
    const nbChunks = isFnFallback ? null : neighborsOrFn; // 3x3 flattened: index (dz+1)*3 + (dx+1)

    const sampleBlock = (lx, y, lz) => {
      if (y < 0 || y >= WORLD_HEIGHT) return 0;
      if (lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE) {
        return blocks[y * slice + lz * CHUNK_SIZE + lx];
      }
      if (isFnFallback) {
        return neighborsOrFn(baseX + lx, y, baseZ + lz);
      }
      const dcx = lx < 0 ? -1 : lx >= CHUNK_SIZE ? 1 : 0;
      const dcz = lz < 0 ? -1 : lz >= CHUNK_SIZE ? 1 : 0;
      const nc = nbChunks ? nbChunks[(dcz + 1) * 3 + (dcx + 1)] : null;
      if (!nc || !nc.isGenerated) return 0;
      const nlx = lx - dcx * CHUNK_SIZE;
      const nlz = lz - dcz * CHUNK_SIZE;
      return nc.blocks[y * slice + nlz * CHUNK_SIZE + nlx];
    };

    const sampleLightByte = (lx, y, lz) => {
      if (y >= WORLD_HEIGHT) return 0xf0;
      if (y < 0) return 0;
      if (lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE) {
        return light[y * slice + lz * CHUNK_SIZE + lx];
      }
      if (isFnFallback) return 0xf0;
      const dcx = lx < 0 ? -1 : lx >= CHUNK_SIZE ? 1 : 0;
      const dcz = lz < 0 ? -1 : lz >= CHUNK_SIZE ? 1 : 0;
      const nc = nbChunks ? nbChunks[(dcz + 1) * 3 + (dcx + 1)] : null;
      if (!nc || !nc.isGenerated) return 0xf0;
      const nlx = lx - dcx * CHUNK_SIZE;
      const nlz = lz - dcz * CHUNK_SIZE;
      return nc.light[y * slice + nlz * CHUNK_SIZE + nlx];
    };

    const aoValues = [3, 3, 3, 3];
    const startY = Math.max(0, chunk.minY);
    const endY = Math.min(WORLD_HEIGHT - 1, chunk.maxY);

    for (let y = startY; y <= endY; y++) {
      const yBase = y * slice;
      for (let z = 0; z < CHUNK_SIZE; z++) {
        const zBase = yBase + z * CHUNK_SIZE;
        for (let x = 0; x < CHUNK_SIZE; x++) {
          const id = blocks[zBase + x];
          if (id === BLOCK_IDS.AIR) continue;

          const def = BlockRegistry.get(id);
          const biomeId = biomes[z * CHUNK_SIZE + x];

          // 1. 3D Floor or Wall Torch (2x10x2 pixels)
          if (def.isTorch) {
            const meta = chunk.getMeta(x, y, z);
            this._emitTorchGeometry(cutoutBuf, x, y, z, meta);
            continue;
          }

          // 2. 3D Bed (BED_FOOT / BED_HEAD)
          if (def.isBed) {
            const meta = chunk.getMeta(x, y, z);
            const lb = sampleLightByte(x, y, z);
            this._emitBedGeometry(cutoutBuf, x, y, z, id === BLOCK_IDS.BED_HEAD, meta & 3, (lb >> 4) / 15, (lb & 15) / 15);
            continue;
          }

          // 3. Cross-mesh plants (2 diagonal planes in cutoutBuf)
          if (def.isCross) {
            const uv = this.atlas.getUV(def.faces.top);
            const tint = BiomeManager.getTintForBlock(biomeId, def.tintType);
            const tr = tint ? tint[0] : 1;
            const tg = tint ? tint[1] : 1;
            const tb = tint ? tint[2] : 1;
            const lb = sampleLightByte(x, y, z);
            const skyNorm = ((lb >> 4) & 0x0f) / 15;
            const blkNorm = (lb & 0x0f) / 15;

            for (let p = 0; p < 2; p++) {
              cutoutBuf.ensureQuadCapacity();
              const plane = CROSS_PLANES[p];
              const baseVert = cutoutBuf.vertexCount;
              let pOff = baseVert * 3;
              let uOff = baseVert * 2;
              const baseLum = Math.pow(plane.shade, 2.2);

              for (let i = 0; i < 4; i++) {
                const v = plane.verts[i];
                const vertLum = v[1] === 0 ? baseLum * 0.86 : baseLum;
                cutoutBuf.positions[pOff] = x + v[0];
                cutoutBuf.positions[pOff + 1] = y + v[1];
                cutoutBuf.positions[pOff + 2] = z + v[2];

                cutoutBuf.normals[pOff] = plane.nx;
                cutoutBuf.normals[pOff + 1] = plane.ny;
                cutoutBuf.normals[pOff + 2] = plane.nz;

                cutoutBuf.uvs[uOff] = v[3] === 0 ? uv.u0 : uv.u1;
                cutoutBuf.uvs[uOff + 1] = v[4] === 0 ? uv.vBottom : uv.vTop;

                cutoutBuf.colors[pOff] = vertLum * tr;
                cutoutBuf.colors[pOff + 1] = vertLum * tg;
                cutoutBuf.colors[pOff + 2] = vertLum * tb;

                cutoutBuf.lights[uOff] = skyNorm;
                cutoutBuf.lights[uOff + 1] = blkNorm;

                pOff += 3;
                uOff += 2;
              }

              const idxOff = cutoutBuf.indexCount;
              cutoutBuf.indices[idxOff] = baseVert;
              cutoutBuf.indices[idxOff + 1] = baseVert + 1;
              cutoutBuf.indices[idxOff + 2] = baseVert + 2;
              cutoutBuf.indices[idxOff + 3] = baseVert;
              cutoutBuf.indices[idxOff + 4] = baseVert + 2;
              cutoutBuf.indices[idxOff + 5] = baseVert + 3;
              cutoutBuf.vertexCount += 4;
              cutoutBuf.indexCount += 6;
            }
            continue;
          }

          // 4. Standard cubic blocks (and slightly inset Cactus)
          const isTranslucent = def.isLiquid || def.isTransparent;
          const buf = isTranslucent ? waterBuf : (def.isCutout ? cutoutBuf : opaqueBuf);
          const waterTopDrop = def.isLiquid && sampleBlock(x, y + 1, z) !== BLOCK_IDS.WATER ? 0.12 : 0;
          const inset = def.inset || 0;
          const selfEmitNorm = def.lightEmission > 0 ? def.lightEmission / 15 : 0;
          const facingDir = def.directional ? (chunk.getMeta(x, y, z) & 3) : 2; // default south

          for (let f = 0; f < 6; f++) {
            const face = FACES[f];
            if (y === 0 && face.ny === -1) continue;

            const nbx = x + face.nx;
            const nby = y + face.ny;
            const nbz = z + face.nz;
            const neighborId = sampleBlock(nbx, nby, nbz);

            if (def.isOpaque) {
              if (opaqueTable[neighborId] === 1) continue;
            } else if (inset > 0) {
              if (face.ny !== 0 && (neighborId === id || opaqueTable[neighborId] === 1)) continue;
            } else if (def.isLiquid) {
              if (neighborId === id || neighborId === BLOCK_IDS.ICE || opaqueTable[neighborId] === 1) continue;
            } else {
              if (neighborId === id || opaqueTable[neighborId] === 1) continue;
            }

            buf.ensureQuadCapacity();

            // Support directional blocks (e.g. Jack o'Lantern front face)
            let faceKey = face.key;
            if (def.directional && face.ny === 0) {
              faceKey = DIR_FACE_KEYS[facingDir] === face.key ? 'south' : 'north';
            }
            const uv = this.atlas.getUV(def.faces[faceKey]);
            const u0 = uv.u0;
            const u1 = uv.u1;
            const v0 = uv.vBottom;
            const v1 = uv.vTop;

            const applyTint = def.tintType && (def.id !== BLOCK_IDS.GRASS || face.key === 'top');
            const tint = applyTint ? BiomeManager.getTintForBlock(biomeId, def.tintType) : null;
            const tr = (tint ? tint[0] : 1) * face.hemi[0];
            const tg = (tint ? tint[1] : 1) * face.hemi[1];
            const tb = (tint ? tint[2] : 1) * face.hemi[2];

            const centerLightByte = sampleLightByte(nbx, nby, nbz);
            const centerSky = (centerLightByte >> 4) & 0x0f;
            const centerBlk = centerLightByte & 0x0f;

            const baseVert = buf.vertexCount;
            let pOff = baseVert * 3;
            let uOff = baseVert * 2;

            for (let i = 0; i < 4; i++) {
              const corner = face.corners[i];
              let dx = corner[0];
              let dy = corner[1];
              let dz = corner[2];

              if (waterTopDrop > 0 && dy === 1) dy -= waterTopDrop;
              if (inset > 0) {
                dx = face.nx === 0 ? (dx === 0 ? inset : 1 - inset) : (face.nx > 0 ? 1 - inset : inset);
                dz = face.nz === 0 ? (dz === 0 ? inset : 1 - inset) : (face.nz > 0 ? 1 - inset : inset);
              }

              buf.positions[pOff] = x + dx;
              buf.positions[pOff + 1] = y + dy;
              buf.positions[pOff + 2] = z + dz;
              buf.normals[pOff] = face.nx;
              buf.normals[pOff + 1] = face.ny;
              buf.normals[pOff + 2] = face.nz;
              buf.uvs[uOff] = corner[6] === 0 ? u0 : u1;
              buf.uvs[uOff + 1] = corner[7] === 0 ? v0 : v1;

              // Smooth AO & Smooth Dual-Channel Light sampling around corner
              let ao = 3;
              let skySum = centerSky;
              let blkSum = centerBlk;
              let lightCount = 1;

              if (!isTranslucent && inset === 0) {
                const ox = corner[3];
                const oy = corner[4];
                const oz = corner[5];
                let b1x, b1y, b1z, b2x, b2y, b2z, cxp, cyp, czp;

                if (face.nx !== 0) {
                  b1x = nbx; b1y = nby + oy; b1z = nbz;
                  b2x = nbx; b2y = nby; b2z = nbz + oz;
                  cxp = nbx; cyp = nby + oy; czp = nbz + oz;
                } else if (face.ny !== 0) {
                  b1x = nbx + ox; b1y = nby; b1z = nbz;
                  b2x = nbx; b2y = nby; b2z = nbz + oz;
                  cxp = nbx + ox; cyp = nby; czp = nbz + oz;
                } else {
                  b1x = nbx + ox; b1y = nby; b1z = nbz;
                  b2x = nbx; b2y = nby + oy; b2z = nbz;
                  cxp = nbx + ox; cyp = nby + oy; czp = nbz + oz;
                }

                const id1 = sampleBlock(b1x, b1y, b1z);
                const id2 = sampleBlock(b2x, b2y, b2z);
                const idc = sampleBlock(cxp, cyp, czp);

                const s1 = aoTable[id1];
                const s2 = aoTable[id2];
                const sc = aoTable[idc];
                ao = (s1 && s2) ? 0 : (3 - (s1 + s2 + sc));

                if (!opaqueTable[id1]) {
                  const lb1 = sampleLightByte(b1x, b1y, b1z);
                  skySum += (lb1 >> 4) & 0x0f;
                  blkSum += lb1 & 0x0f;
                  lightCount++;
                }
                if (!opaqueTable[id2]) {
                  const lb2 = sampleLightByte(b2x, b2y, b2z);
                  skySum += (lb2 >> 4) & 0x0f;
                  blkSum += lb2 & 0x0f;
                  lightCount++;
                }
                if ((!opaqueTable[id1] || !opaqueTable[id2]) && !opaqueTable[idc]) {
                  const lbc = sampleLightByte(cxp, cyp, czp);
                  skySum += (lbc >> 4) & 0x0f;
                  blkSum += lbc & 0x0f;
                  lightCount++;
                }
              }

              aoValues[i] = ao;
              const lum = lut[f * 4 + ao];
              buf.colors[pOff] = lum * tr;
              buf.colors[pOff + 1] = lum * tg;
              buf.colors[pOff + 2] = lum * tb;

              const avgSky = skySum / (15 * lightCount);
              const avgBlk = Math.max(selfEmitNorm, blkSum / (15 * lightCount));
              buf.lights[uOff] = avgSky;
              buf.lights[uOff + 1] = avgBlk;

              pOff += 3;
              uOff += 2;
            }

            const idxOff = buf.indexCount;
            if (aoValues[0] + aoValues[2] > aoValues[1] + aoValues[3]) {
              buf.indices[idxOff] = baseVert;
              buf.indices[idxOff + 1] = baseVert + 1;
              buf.indices[idxOff + 2] = baseVert + 2;
              buf.indices[idxOff + 3] = baseVert;
              buf.indices[idxOff + 4] = baseVert + 2;
              buf.indices[idxOff + 5] = baseVert + 3;
            } else {
              buf.indices[idxOff] = baseVert + 1;
              buf.indices[idxOff + 1] = baseVert + 2;
              buf.indices[idxOff + 2] = baseVert + 3;
              buf.indices[idxOff + 3] = baseVert + 1;
              buf.indices[idxOff + 4] = baseVert + 3;
              buf.indices[idxOff + 5] = baseVert;
            }

            buf.vertexCount += 4;
            buf.indexCount += 6;
          }
        }
      }
    }

    return {
      opaqueGeometry: opaqueBuf.toGeometry(),
      cutoutGeometry: cutoutBuf.toGeometry(),
      waterGeometry: waterBuf.toGeometry(),
    };
  }

  /**
   * Emits a 2x10x2 pixel 3D torch standing upright (meta=0) or tilted 22.5 deg on a wall (meta=1..4).
   */
  _emitTorchGeometry(buf, x, y, z, meta) {
    const uv = this.atlas.getUV('torch');
    const du = uv.u1 - uv.u0;
    const dv = uv.vTop - uv.vBottom;

    // Map center 2px shaft (px 7..8, py 6..15 in 16px tile) & top ember (px 7..8, py 6..7)
    const uS0 = uv.u0 + du * (7 / 16);
    const uS1 = uv.u0 + du * (9 / 16);
    const vSideBot = uv.vBottom;
    const vSideTop = uv.vBottom + dv * (10 / 16);
    const vTop0 = uv.vBottom + dv * (8 / 16);
    const vTop1 = uv.vBottom + dv * (10 / 16);

    const hw = 1 / 16; // half width = 1 pixel
    const h = 10 / 16; // 10 pixels tall

    // Wall offsets & tilt (~22.5 deg = sin 0.3827, cos 0.9239)
    let cx = x + 0.5;
    let cy = y;
    let cz = z + 0.5;
    let tiltX = 0;
    let tiltZ = 0;

    if (meta === 1) { // attached to -X wall, leans +X
      cx = x + 0.08; cy = y + 0.19; tiltX = 0.25;
    } else if (meta === 2) { // attached to +X wall, leans -X
      cx = x + 0.92; cy = y + 0.19; tiltX = -0.25;
    } else if (meta === 3) { // attached to -Z wall, leans +Z
      cz = z + 0.08; cy = y + 0.19; tiltZ = 0.25;
    } else if (meta === 4) { // attached to +Z wall, leans -Z
      cz = z + 0.92; cy = y + 0.19; tiltZ = -0.25;
    }

    const p = (lx, ly, lz) => {
      const f = ly / h;
      return [cx + lx + tiltX * f, cy + ly, cz + lz + tiltZ * f];
    };

    const sideUvs = [[uS0, vSideBot], [uS1, vSideBot], [uS1, vSideTop], [uS0, vSideTop]];
    const topUvs = [[uS0, vTop0], [uS1, vTop0], [uS1, vTop1], [uS0, vTop1]];
    const fullCol = [1.0, 0.98, 0.92];

    // South (+Z)
    buf.pushQuad([p(-hw, 0, hw), p(hw, 0, hw), p(hw, h, hw), p(-hw, h, hw)], [0, 0, 1], sideUvs, fullCol, 1, 1);
    // North (-Z)
    buf.pushQuad([p(hw, 0, -hw), p(-hw, 0, -hw), p(-hw, h, -hw), p(hw, h, -hw)], [0, 0, -1], sideUvs, fullCol, 1, 1);
    // East (+X)
    buf.pushQuad([p(hw, 0, hw), p(hw, 0, -hw), p(hw, h, -hw), p(hw, h, hw)], [1, 0, 0], sideUvs, fullCol, 1, 1);
    // West (-X)
    buf.pushQuad([p(-hw, 0, -hw), p(-hw, 0, hw), p(-hw, h, hw), p(-hw, h, -hw)], [-1, 0, 0], sideUvs, fullCol, 1, 1);
    // Top flame tip
    buf.pushQuad([p(-hw, h, hw), p(hw, h, hw), p(hw, h, -hw), p(-hw, h, -hw)], [0, 1, 0], topUvs, fullCol, 1, 1);
  }

  /**
   * Emits a 3D bed half (mattress from Y=3/16..9/16 + wooden legs at outer corners),
   * rotated cleanly according to `facing` (0:N, 1:E, 2:S, 3:W).
   */
  _emitBedGeometry(buf, x, y, z, isHead, facing, skyL, blkL) {
    const topUv = this.atlas.getUV(isHead ? 'bed_head_top' : 'bed_foot_top');
    const woodUv = this.atlas.getUV('oak_planks');

    const yBot = y + 3 / 16;
    const yTop = y + 9 / 16;

    // Rotate local (lx, lz) in [0..1] around block center by facing * 90 deg clockwise
    const rot = (lx, lz) => {
      if (facing === 0) return [x + lx, z + lz];           // head toward -Z
      if (facing === 1) return [x + (1 - lz), z + lx];     // head toward +X
      if (facing === 2) return [x + (1 - lx), z + (1 - lz)]; // head toward +Z
      return [x + lz, z + (1 - lx)];                       // head toward -X
    };

    const p = (lx, py, lz) => {
      const [wx, wz] = rot(lx, lz);
      return [wx, py, wz];
    };

    // Mattress top face (white pillow on head half, red blanket on foot half)
    const topCol = [1.0, 1.0, 1.0];
    const sideCol = [0.68, 0.68, 0.68];
    const darkCol = [0.42, 0.42, 0.42];

    buf.pushQuad(
      [p(0, yTop, 1), p(1, yTop, 1), p(1, yTop, 0), p(0, yTop, 0)],
      [0, 1, 0],
      [[topUv.u0, topUv.vBottom], [topUv.u1, topUv.vBottom], [topUv.u1, topUv.vTop], [topUv.u0, topUv.vTop]],
      topCol,
      skyL,
      blkL
    );

    // Underside wood plank
    buf.pushQuad(
      [p(0, yBot, 0), p(1, yBot, 0), p(1, yBot, 1), p(0, yBot, 1)],
      [0, -1, 0],
      [[woodUv.u0, woodUv.vBottom], [woodUv.u1, woodUv.vBottom], [woodUv.u1, woodUv.vTop], [woodUv.u0, woodUv.vTop]],
      darkCol,
      skyL,
      blkL
    );

    // Side & End mattress bands mapped cleanly
    const sideUv = this.atlas.getUV(isHead ? 'bed_side_head' : 'bed_side_foot');
    const sDv = sideUv.vTop - sideUv.vBottom;
    const sV0 = sideUv.vBottom + sDv * (5 / 16);
    const sV1 = sideUv.vBottom + sDv * (10 / 16);
    const sideBandUvs = [[sideUv.u0, sV0], [sideUv.u1, sV0], [sideUv.u1, sV1], [sideUv.u0, sV1]];

    // Right & Left sides
    buf.pushQuad([p(1, yBot, 1), p(1, yBot, 0), p(1, yTop, 0), p(1, yTop, 1)], [1, 0, 0], sideBandUvs, sideCol, skyL, blkL);
    buf.pushQuad([p(0, yBot, 0), p(0, yBot, 1), p(0, yTop, 1), p(0, yTop, 0)], [-1, 0, 0], sideBandUvs, sideCol, skyL, blkL);

    // Outer end (headboard on head half at lz=0, footboard on foot half at lz=1)
    const endUv = this.atlas.getUV(isHead ? 'bed_end_head' : 'bed_end_foot');
    const eDv = endUv.vTop - endUv.vBottom;
    const eV0 = endUv.vBottom + eDv * (5 / 16);
    const eV1 = endUv.vBottom + eDv * (10 / 16);
    const endBandUvs = [[endUv.u0, eV0], [endUv.u1, eV0], [endUv.u1, eV1], [endUv.u0, eV1]];

    if (isHead) {
      buf.pushQuad([p(1, yBot, 0), p(0, yBot, 0), p(0, yTop, 0), p(1, yTop, 0)], [0, 0, -1], endBandUvs, sideCol, skyL, blkL);
    } else {
      buf.pushQuad([p(0, yBot, 1), p(1, yBot, 1), p(1, yTop, 1), p(0, yTop, 1)], [0, 0, 1], endBandUvs, sideCol, skyL, blkL);
    }

    // Two outer wooden legs (3/16 x 3/16 x 3/16) at outer corners of this half
    const legMinZ = isHead ? 0 : 13 / 16;
    const legMaxZ = isHead ? 3 / 16 : 1;
    const wUvs = [[woodUv.u0, woodUv.vBottom], [woodUv.u1, woodUv.vBottom], [woodUv.u1, woodUv.vTop], [woodUv.u0, woodUv.vTop]];
    const emitLeg = (x0, x1) => {
      buf.pushQuad([p(x0, y, legMaxZ), p(x1, y, legMaxZ), p(x1, yBot, legMaxZ), p(x0, yBot, legMaxZ)], [0, 0, 1], wUvs, darkCol, skyL, blkL);
      buf.pushQuad([p(x1, y, legMinZ), p(x0, y, legMinZ), p(x0, yBot, legMinZ), p(x1, yBot, legMinZ)], [0, 0, -1], wUvs, darkCol, skyL, blkL);
      buf.pushQuad([p(x1, y, legMaxZ), p(x1, y, legMinZ), p(x1, yBot, legMinZ), p(x1, yBot, legMaxZ)], [1, 0, 0], wUvs, darkCol, skyL, blkL);
      buf.pushQuad([p(x0, y, legMinZ), p(x0, y, legMaxZ), p(x0, yBot, legMaxZ), p(x0, yBot, legMinZ)], [-1, 0, 0], wUvs, darkCol, skyL, blkL);
    };
    emitLeg(0, 3 / 16);
    emitLeg(13 / 16, 1);
  }
}
