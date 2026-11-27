import * as THREE from '../../vendor/three.module.min.js';
import { BLOCK_IDS, BlockRegistry } from '../blocks/BlockRegistry.js';
import { AO_CURVE, CHUNK_SIZE, FACE_SHADE, WORLD_HEIGHT } from '../constants.js';

// Each face defines:
// key, normal [nx, ny, nz], shade, and 4 CCW vertices [dx, dy, dz, ox, oy, oz, uIdx, vIdx]
// uIdx: 0->u0, 1->u1; vIdx: 0->vBottom, 1->vTop
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

function createBufferAccumulator() {
  return {
    positions: [],
    normals: [],
    uvs: [],
    colors: [],
    indices: [],
    vertexCount: 0,
  };
}

function finalizeGeometry(acc) {
  if (acc.vertexCount === 0) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(acc.positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(acc.normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(acc.uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(acc.colors, 3));

  const IndexArray = acc.vertexCount > 65535 ? Uint32Array : Uint16Array;
  geometry.setIndex(new THREE.BufferAttribute(new IndexArray(acc.indices), 1));
  geometry.computeBoundingSphere();
  return geometry;
}

export class ChunkMesher {
  constructor(atlas) {
    this.atlas = atlas;

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
  }

  /**
   * Builds opaque, cutout (leaves), and water BufferGeometries for a single chunk.
   * Queries neighbor blocks across chunk boundaries seamlessly via worldSampler.
   */
  buildChunkGeometries(chunk, getWorldBlock) {
    const opaqueAcc = createBufferAccumulator();
    const cutoutAcc = createBufferAccumulator();
    const waterAcc = createBufferAccumulator();

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

    const isOccludingAO = (wx, wy, wz) => {
      const id = getBlockAtWorld(wx, wy, wz);
      return BlockRegistry.occludesAO(id) ? 1 : 0;
    };

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

    for (let y = 0; y < WORLD_HEIGHT; y++) {
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
          const isCutout = def.isCutout;
          const acc = isWater ? waterAcc : (isCutout ? cutoutAcc : opaqueAcc);

          // Lower water top surface slightly when air/non-water is above it
          const waterTopDrop = isWater && getBlockAtWorld(wx, y + 1, wz) !== BLOCK_IDS.WATER ? 0.12 : 0;

          for (let f = 0; f < 6; f++) {
            const face = FACES[f];
            // Skip bottom of bedrock at y = 0 looking into void
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

            const tileName = def.faces[face.key];
            const uv = this.atlas.getUV(tileName);
            const uArr = [uv.u0, uv.u1];
            const vArr = [uv.vBottom, uv.vTop];

            const baseVert = acc.vertexCount;
            const shade = face.shade;

            for (let i = 0; i < 4; i++) {
              const corner = face.corners[i];
              let dy = corner[1];
              if (waterTopDrop > 0 && dy === 1) {
                dy -= waterTopDrop;
              }

              acc.positions.push(x + corner[0], y + dy, z + corner[2]);
              acc.normals.push(face.nx, face.ny, face.nz);
              acc.uvs.push(uArr[corner[6]], vArr[corner[7]]);

              const ao = isWater
                ? 3
                : computeVertexAO(nbx, nby, nbz, face.nx, face.ny, face.nz, corner[3], corner[4], corner[5]);
              aoValues[i] = ao;

              const brightness = shade * AO_CURVE[ao];
              // Convert perceptual sRGB brightness to linear space so MeshBasicMaterial
              // outputs authentic Minecraft directional contrast & smooth AO after gamma encoding.
              const linearBrightness = Math.pow(brightness, 2.2);
              acc.colors.push(linearBrightness, linearBrightness, linearBrightness);
            }

            // Flip quad diagonal to eliminate Smooth AO anisotropy artifacts
            if (aoValues[0] + aoValues[2] > aoValues[1] + aoValues[3]) {
              acc.indices.push(
                baseVert, baseVert + 1, baseVert + 2,
                baseVert, baseVert + 2, baseVert + 3
              );
            } else {
              acc.indices.push(
                baseVert + 1, baseVert + 2, baseVert + 3,
                baseVert + 1, baseVert + 3, baseVert
              );
            }
            acc.vertexCount += 4;
          }
        }
      }
    }

    return {
      opaqueGeometry: finalizeGeometry(opaqueAcc),
      cutoutGeometry: finalizeGeometry(cutoutAcc),
      waterGeometry: finalizeGeometry(waterAcc),
    };
  }
}
