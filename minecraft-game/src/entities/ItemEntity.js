import * as THREE from '../../vendor/three.module.min.js';
import { BlockRegistry } from '../blocks/BlockRegistry.js';
import { FACE_SHADE, MAX_STACK_SIZE } from '../constants.js';
import { moveAABB } from '../physics/AABBPhysics.js';

const ITEM_SIZE = 0.26;
const ITEM_HALF = ITEM_SIZE * 0.5;
const ITEM_GRAVITY = 24.0;
const PICKUP_DELAY = 0.22;
const MAGNET_RADIUS = 1.8;
const PICKUP_RADIUS = 0.52;
const MERGE_RADIUS = 1.1;
const MAX_DROPPED_ITEMS = 120;

const CUBE_FACES = [
  { key: 'top', nx: 0, ny: 1, nz: 0, shade: FACE_SHADE.TOP, verts: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]] },
  { key: 'bottom', nx: 0, ny: -1, nz: 0, shade: FACE_SHADE.BOTTOM, verts: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]] },
  { key: 'south', nx: 0, ny: 0, nz: 1, shade: FACE_SHADE.SOUTH, verts: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
  { key: 'north', nx: 0, ny: 0, nz: -1, shade: FACE_SHADE.NORTH, verts: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] },
  { key: 'east', nx: 1, ny: 0, nz: 0, shade: FACE_SHADE.EAST, verts: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]] },
  { key: 'west', nx: -1, ny: 0, nz: 0, shade: FACE_SHADE.WEST, verts: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]] },
];

/**
 * Builds and caches a crisp 3D textured BufferGeometry for dropped ItemEntities
 * and the 1st-person held item:
 * - Cross plants (dandelion, poppy, tall grass, etc.) render as flat upright sprites (NOT cubes!)
 * - Torches render as 2x10x2 3D voxel torches
 * - Beds render as miniature 3D beds with pillow, blanket & legs
 * - Standard blocks render as cubes (respecting inset for Cactus)
 */
export function buildBlockItemGeometry(atlas, blockId, scale = 1.0) {
  const def = BlockRegistry.get(blockId);
  if (!def || !def.faces) return null;

  const positions = [];
  const normals = [];
  const uvs = [];
  const colors = [];
  const indices = [];

  const addQuad = (p0, p1, p2, p3, nx, ny, nz, u0, u1, vBot, vTop, shade) => {
    const base = positions.length / 3;
    const b = Math.pow(shade, 2.2);
    positions.push(...p0, ...p1, ...p2, ...p3);
    for (let i = 0; i < 4; i++) {
      normals.push(nx, ny, nz);
      colors.push(b, b, b);
    }
    uvs.push(u0, vBot, u1, vBot, u1, vTop, u0, vTop);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  // 1. Flat sprite item for Cross Plants (flowers, tall grass, mushrooms, dead bush, vines)
  if (def.isCross) {
    const uv = atlas.getUV(def.faces.top);
    const h = 0.54 * scale;
    const zOff = 0.015 * scale;
    addQuad([-h, -h, zOff], [h, -h, zOff], [h, h, zOff], [-h, h, zOff], 0, 0, 1, uv.u0, uv.u1, uv.vBottom, uv.vTop, 1.0);
    addQuad([h, -h, -zOff], [-h, -h, -zOff], [-h, h, -zOff], [h, h, -zOff], 0, 0, -1, uv.u0, uv.u1, uv.vBottom, uv.vTop, 0.94);

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geom.setIndex(indices);
    return geom;
  }

  // 2. 3D Torch model (2x10x2 pixels)
  if (def.isTorch) {
    const uv = atlas.getUV('torch');
    const du = uv.u1 - uv.u0;
    const dv = uv.vTop - uv.vBottom;
    const u0 = uv.u0 + du * (7 / 16);
    const u1 = uv.u0 + du * (9 / 16);
    const vBot = uv.vBottom;
    const vTop = uv.vBottom + dv * (10 / 16);
    const vTip0 = uv.vBottom + dv * (8 / 16);

    const hw = (1 / 16) * scale * 1.65;
    const hh = (5 / 16) * scale * 1.65;

    addQuad([-hw, -hh, hw], [hw, -hh, hw], [hw, hh, hw], [-hw, hh, hw], 0, 0, 1, u0, u1, vBot, vTop, 1.0);
    addQuad([hw, -hh, -hw], [-hw, -hh, -hw], [-hw, hh, -hw], [hw, hh, -hw], 0, 0, -1, u0, u1, vBot, vTop, 0.95);
    addQuad([hw, -hh, hw], [hw, -hh, -hw], [hw, hh, -hw], [hw, hh, hw], 1, 0, 0, u0, u1, vBot, vTop, 0.92);
    addQuad([-hw, -hh, -hw], [-hw, -hh, hw], [-hw, hh, hw], [-hw, hh, -hw], -1, 0, 0, u0, u1, vBot, vTop, 0.92);
    addQuad([-hw, hh, hw], [hw, hh, hw], [hw, hh, -hw], [-hw, hh, -hw], 0, 1, 0, u0, u1, vTip0, vTop, 1.0);

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geom.setIndex(indices);
    return geom;
  }

  // 3. Miniature 3D Bed model
  if (def.isBed) {
    const headUv = atlas.getUV('bed_head_top');
    const footUv = atlas.getUV('bed_foot_top');
    const woodUv = atlas.getUV('oak_planks');
    const sideUv = atlas.getUV('bed_side_foot');
    const hw = 0.36 * scale;
    const hl = 0.68 * scale;
    const yBot = -0.14 * scale;
    const yTop = 0.16 * scale;

    // Top pillow + blanket halves
    addQuad([-hw, yTop, 0], [hw, yTop, 0], [hw, yTop, -hl], [-hw, yTop, -hl], 0, 1, 0, headUv.u0, headUv.u1, headUv.vBottom, headUv.vTop, 1.0);
    addQuad([-hw, yTop, hl], [hw, yTop, hl], [hw, yTop, 0], [-hw, yTop, 0], 0, 1, 0, footUv.u0, footUv.u1, footUv.vBottom, footUv.vTop, 1.0);
    // Underside & sides
    addQuad([-hw, yBot, -hl], [hw, yBot, -hl], [hw, yBot, hl], [-hw, yBot, hl], 0, -1, 0, woodUv.u0, woodUv.u1, woodUv.vBottom, woodUv.vTop, 0.6);
    addQuad([-hw, yBot, hl], [hw, yBot, hl], [hw, yTop, hl], [-hw, yTop, hl], 0, 0, 1, sideUv.u0, sideUv.u1, sideUv.vBottom + (sideUv.vTop - sideUv.vBottom) * 0.35, sideUv.vTop, 0.85);
    addQuad([hw, yBot, -hl], [-hw, yBot, -hl], [-hw, yTop, -hl], [hw, yTop, -hl], 0, 0, -1, woodUv.u0, woodUv.u1, woodUv.vBottom, woodUv.vTop, 0.8);
    addQuad([hw, yBot, hl], [hw, yBot, -hl], [hw, yTop, -hl], [hw, yTop, hl], 1, 0, 0, sideUv.u0, sideUv.u1, sideUv.vBottom + (sideUv.vTop - sideUv.vBottom) * 0.35, sideUv.vTop, 0.72);
    addQuad([-hw, yBot, -hl], [-hw, yBot, hl], [-hw, yTop, hl], [-hw, yTop, -hl], -1, 0, 0, sideUv.u0, sideUv.u1, sideUv.vBottom + (sideUv.vTop - sideUv.vBottom) * 0.35, sideUv.vTop, 0.70);

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geom.setIndex(indices);
    return geom;
  }

  // 4. Standard cubic block (respecting Cactus inset)
  const hY = 0.5 * scale;
  const hXZ = (0.5 - (def.inset || 0)) * scale;

  for (let f = 0; f < 6; f++) {
    const face = CUBE_FACES[f];
    const uv = atlas.getUV(def.faces[face.key]);
    const base = positions.length / 3;
    const b = Math.pow(face.shade, 2.2);

    for (let i = 0; i < 4; i++) {
      const v = face.verts[i];
      positions.push(v[0] * hXZ, v[1] * hY, v[2] * hXZ);
      normals.push(face.nx, face.ny, face.nz);
      colors.push(b, b, b);
    }

    uvs.push(uv.u0, uv.vBottom, uv.u1, uv.vBottom, uv.u1, uv.vTop, uv.u0, uv.vTop);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geom.setIndex(indices);
  return geom;
}

export class ItemEntity {
  constructor(blockId, count, x, y, z, geometry, material) {
    this.blockId = blockId;
    this.count = count;
    this.x = x;
    this.y = y;
    this.z = z;
    this.vx = (Math.random() - 0.5) * 3.0;
    this.vy = 2.6 + Math.random() * 1.4;
    this.vz = (Math.random() - 0.5) * 3.0;
    this.onGround = false;
    this.age = 0;
    this.phase = Math.random() * Math.PI * 2;
    this.alive = true;

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.set(x, y + ITEM_HALF, z);
  }
}

export class ItemEntityManager {
  constructor(scene, atlas) {
    this.scene = scene;
    this.atlas = atlas;
    this.entities = [];
    this.geometryCache = new Map();
    this.material = new THREE.MeshBasicMaterial({
      map: atlas.texture,
      vertexColors: true,
      fog: true,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
    });
  }

  _getGeometry(blockId) {
    let geom = this.geometryCache.get(blockId);
    if (!geom) {
      geom = buildBlockItemGeometry(this.atlas, blockId, ITEM_SIZE);
      if (geom) this.geometryCache.set(blockId, geom);
    }
    return geom;
  }

  spawnDrop(blockId, x, y, z, count = 1) {
    if (!blockId || count <= 0) return null;

    // Try merging immediately into a close identical entity
    for (const other of this.entities) {
      if (!other.alive || other.blockId !== blockId || other.count >= MAX_STACK_SIZE) continue;
      const d = Math.hypot(other.x - x, other.y - y, other.z - z);
      if (d < MERGE_RADIUS) {
        const space = MAX_STACK_SIZE - other.count;
        const add = Math.min(space, count);
        other.count += add;
        count -= add;
        if (count <= 0) return other;
      }
    }

    // Cap maximum dropped entities cleanly by removing oldest
    if (this.entities.length >= MAX_DROPPED_ITEMS) {
      const oldest = this.entities.shift();
      this.scene.remove(oldest.mesh);
    }

    const geom = this._getGeometry(blockId);
    if (!geom) return null;
    const entity = new ItemEntity(blockId, count, x, y, z, geom, this.material);
    this.entities.push(entity);
    this.scene.add(entity.mesh);
    return entity;
  }

  update(dt, world, player, hotbar) {
    const targetX = player.x;
    const targetY = player.y + 0.85;
    const targetZ = player.z;

    for (let i = this.entities.length - 1; i >= 0; i--) {
      const item = this.entities[i];
      if (!item.alive) {
        this.scene.remove(item.mesh);
        this.entities.splice(i, 1);
        continue;
      }

      item.age += dt;

      // Despawn after 5 minutes
      if (item.age > 300) {
        item.alive = false;
        continue;
      }

      // Magnetic pickup toward player
      const dxp = targetX - item.x;
      const dyp = targetY - item.y;
      const dzp = targetZ - item.z;
      const dist = Math.hypot(dxp, dyp, dzp);

      if (item.age >= PICKUP_DELAY && dist < MAGNET_RADIUS && hotbar.canAccept(item.blockId)) {
        if (dist < PICKUP_RADIUS) {
          const leftover = hotbar.addItem(item.blockId, item.count);
          if (leftover <= 0) {
            item.alive = false;
            this.scene.remove(item.mesh);
            this.entities.splice(i, 1);
            continue;
          }
          item.count = leftover;
        } else {
          const pull = Math.min(14.0, 6.5 + (MAGNET_RADIUS - dist) * 5.0);
          item.x += (dxp / dist) * pull * dt;
          item.y += (dyp / dist) * pull * dt;
          item.z += (dzp / dist) * pull * dt;
          item.mesh.position.set(item.x, item.y + ITEM_HALF, item.z);
          item.mesh.rotation.y += dt * 4.5;
          continue;
        }
      }

      // Standard physics with block collisions & friction
      item.vy = Math.max(-24, item.vy - ITEM_GRAVITY * dt);
      const res = moveAABB(
        world,
        item,
        item.vx * dt,
        item.vy * dt,
        item.vz * dt,
        ITEM_HALF,
        ITEM_SIZE,
        false
      );
      item.x = res.x;
      item.y = res.y;
      item.z = res.z;
      item.onGround = res.onGround;

      if (res.onGround) {
        item.vy = 0;
        const drag = Math.exp(-10 * dt);
        item.vx *= drag;
        item.vz *= drag;
      } else {
        item.vx *= Math.exp(-1.5 * dt);
        item.vz *= Math.exp(-1.5 * dt);
      }
      if (res.hitCeiling) item.vy = 0;

      // Periodically merge resting nearby stacks
      if (item.onGround && Math.floor(item.age * 4) !== Math.floor((item.age - dt) * 4)) {
        for (let j = i - 1; j >= 0; j--) {
          const other = this.entities[j];
          if (!other.alive || other.blockId !== item.blockId || other.count >= MAX_STACK_SIZE) continue;
          const d = Math.hypot(other.x - item.x, other.y - item.y, other.z - item.z);
          if (d < MERGE_RADIUS) {
            const add = Math.min(MAX_STACK_SIZE - other.count, item.count);
            other.count += add;
            item.count -= add;
            if (item.count <= 0) {
              item.alive = false;
              break;
            }
          }
        }
      }

      const hover = Math.sin(item.age * 3.2 + item.phase) * 0.06 + 0.08;
      item.mesh.position.set(item.x, item.y + ITEM_HALF + hover, item.z);
      item.mesh.rotation.y += dt * 1.9;
    }
  }

  clear() {
    for (const item of this.entities) {
      this.scene.remove(item.mesh);
    }
    this.entities.length = 0;
  }

  dispose() {
    this.clear();
    for (const geom of this.geometryCache.values()) {
      geom.dispose();
    }
    this.geometryCache.clear();
    this.material.dispose();
  }
}
