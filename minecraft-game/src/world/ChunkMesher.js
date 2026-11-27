import * as THREE from '../../vendor/three.module.min.js';
import { BLOCK_IDS, BlockRegistry } from '../blocks/BlockRegistry.js';
import { AO_CURVE, CHUNK_SIZE, FACE_SHADE, WORLD_HEIGHT } from '../constants.js';

// Each face defines:
// key, normal [nx, ny, nz], shade, and 4 CCW vertices [dx, dy, dz, ox, oy, oz, uIdx, vIdx]
const FACES = [
  {
    key: 'top',
    nx: 0, ny: 1, nz: 0,
    shade: FACE_SHADE.TOP,
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
    corners: [
      [0, 0, 0, 0, -1, -1, 0, 0],
      [0, 0, 1, 0, -1,  1, 1, 0],
      [0, 1, 1, 0,  1,  1, 1, 1],
      [0, 1, 0, 0,  1, -1, 0, 1],
    ],
  },
];

// Reusable typed-array scratch buffer to eliminate dynamic JS array growth & GC pressure
class ScratchMeshBuffer {
  constructor(initialQuads = 2048) {
    this.capacityQuads = initialQuads;
    this.positions = new Float32Array(initialQuads * 12);
    this.normals = new Float32Array(initialQuads * 12);
    this.uvs = new Float32Array(initialQuads * 8);
    this.colors = new Float32Array(initialQuads * 12);
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

    const nextIdx = new Uint32Array(this.capacityQuads * 6);
    nextIdx.set(this.indices);
    this.indices = nextIdx;
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

    // Pre-cache linear brightness lookup table for all (faceShade * AO_CURVE) combinations
    this.aoLinearLUT = AO_CURVE.map((v) => v);

    this.opaqueMaterial = new THREE.MeshBasicMaterial({
      map: atlas.texture,
      vertexColors: true,
      fog: true,
      side: THREE.FrontSide,
    });

    this.cutoutMaterial = new THREE.MeshBasicMaterial({
      map: atlas.texture,
      vertexColors: true,
      fog: true,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
    });

    this.waterMaterial = new THREE.MeshBasicMaterial({
      map: atlas.texture,
      vertexColors: true,
      fog: true,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    // Reusable scratch buffers shared across builds (single-threaded main-thread safe)
    this._opaqueBuf = new ScratchMeshBuffer(4096);
    this._cutoutBuf = new ScratchMeshBuffer(1024);
    this._waterBuf = new ScratchMeshBuffer(1024);
  }

  /**
   * Builds opaque, cutout (leaves), and water BufferGeometries for a single chunk.
   * Skips empty sky layers via chunk.minY..chunk.maxY and reuses preallocated TypedArrays.
   */
  buildChunkGeometries(chunk, getWorldBlock) {
    const opaqueBuf = this._opaqueBuf;
    const cutoutBuf = this._cutoutBuf;
    const waterBuf = this._waterBuf;
    opaqueBuf.reset();
    cutoutBuf.reset();
    waterBuf.reset();

    const baseX = chunk.cx * CHUNK_SIZE;
    const baseZ = chunk.cz * CHUNK_SIZE;
    const blocks = chunk.blocks;

    const getBlockAtWorld = (wx, wy, wz) => {
      if (wy < 0 || wy >= WORLD_HEIGHT) return 0;
      const lx = wx - baseX;
      const lz = wz - baseZ;
      if (lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE) {
        return blocks[(wy * CHUNK_SIZE + lz) * CHUNK_SIZE + lx];
      }
      return getWorldBlock(wx, wy, wz);
    };

    const isOccludingAO = (wx, wy, wz) => (BlockRegistry.occludesAO(getBlockAtWorld(wx, wy, wz)) ? 1 : 0);

    const computeVertexAO = (bx, by, bz, nx, ny, nz, ox, oy, oz) => {
      let s1 = 0;
      let s2 = 0;
      let c = 0;
      if (nx !== 0) {
        s1 = isOccludingAO(bx, by + oy, bz);
        s2 = isOccludingAO(bx, by, bz + oz);
        c = isOccludingAO(bx, by + oy, bz + oz);
      } else if (ny !== 0) {
        s1 = isOccludingAO(bx + ox, by, bz);
        s2 = isOccludingAO(bx, by, bz + oz);
        c = isOccludingAO(bx + ox, by, bz + oz);
      } else {
        s1 = isOccludingAO(bx + ox, by, bz);
        s2 = isOccludingAO(bx, by + oy, bz);
        c = isOccludingAO(bx + ox, by + oy, bz);
      }
      if (s1 && s2) return 0;
      return 3 - (s1 + s2 + c);
    };

    const aoValues = [3, 3, 3, 3];
    const startY = Math.max(0, chunk.minY);
    const endY = Math.min(WORLD_HEIGHT - 1, chunk.maxY);

    for (let y = startY; y <= endY; y++) {
      const yBase = y * CHUNK_SIZE * CHUNK_SIZE;
      for (let z = 0; z < CHUNK_SIZE; z++) {
        const zBase = yBase + z * CHUNK_SIZE;
        const wz = baseZ + z;
        for (let x = 0; x < CHUNK_SIZE; x++) {
          const id = blocks[zBase + x];
          if (id === BLOCK_IDS.AIR) continue;

          const def = BlockRegistry.get(id);
          const wx = baseX + x;
          const isWater = def.isLiquid;
          const buf = isWater ? waterBuf : (def.isCutout ? cutoutBuf : opaqueBuf);

          const waterTopDrop = isWater && getBlockAtWorld(wx, y + 1, wz) !== BLOCK_IDS.WATER ? 0.12 : 0;

          for (let f = 0; f < 6; f++) {
            const face = FACES[f];
            if (y === 0 && face.ny === -1) continue;

            const nbx = wx + face.nx;
            const nby = y + face.ny;
            const nbz = wz + face.nz;
            const neighborId = getBlockAtWorld(nbx, nby, nbz);

            if (def.isOpaque) {
              if (BlockRegistry.isOpaque(neighborId)) continue;
            } else {
              if (neighborId === id || BlockRegistry.isOpaque(neighborId)) continue;
            }

            buf.ensureQuadCapacity();

            const uv = this.atlas.getUV(def.faces[face.key]);
            const u0 = uv.u0;
            const u1 = uv.u1;
            const v0 = uv.vBottom;
            const v1 = uv.vTop;

            const baseVert = buf.vertexCount;
            let pOff = baseVert * 3;
            let uOff = baseVert * 2;
            const shade = face.shade;

            for (let i = 0; i < 4; i++) {
              const corner = face.corners[i];
              let dy = corner[1];
              if (waterTopDrop > 0 && dy === 1) {
                dy -= waterTopDrop;
              }

              buf.positions[pOff] = x + corner[0];
              buf.positions[pOff + 1] = y + dy;
              buf.positions[pOff + 2] = z + corner[2];

              buf.normals[pOff] = face.nx;
              buf.normals[pOff + 1] = face.ny;
              buf.normals[pOff + 2] = face.nz;

              buf.uvs[uOff] = corner[6] === 0 ? u0 : u1;
              buf.uvs[uOff + 1] = corner[7] === 0 ? v0 : v1;

              const ao = isWater
                ? 3
                : computeVertexAO(nbx, nby, nbz, face.nx, face.ny, face.nz, corner[3], corner[4], corner[5]);
              aoValues[i] = ao;

              const brightness = shade * AO_CURVE[ao];
              const linearBrightness = Math.pow(brightness, 2.2);
              buf.colors[pOff] = linearBrightness;
              buf.colors[pOff + 1] = linearBrightness;
              buf.colors[pOff + 2] = linearBrightness;

              pOff += 3;
              uOff += 2;
            }

            let idxOff = buf.indexCount;
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
}
