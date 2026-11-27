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
 * Builds and caches a crisp 3D unit-centered textured block BufferGeometry (half-size = 0.5)
 * usable both for dropped ItemEntities and the 1st-person held block.
 */
export function buildBlockItemGeometry(atlas, blockId, scale = 1.0) {
  const def = BlockRegistry.get(blockId);
  if (!def || !def.faces) return null;

  const h = 0.5 * scale;
  const positions = [];
  const normals = [];
  const uvs = [];
  const colors = [];
  const indices = [];

  for (let f = 0; f < 6; f++) {
    const face = CUBE_FACES[f];
    const uv = atlas.getUV(def.faces[face.key]);
    const base = positions.length / 3;
    const b = Math.pow(face.shade, 2.2);

    for (let i = 0; i < 4; i++) {
      const v = face.verts[i];
      positions.push(v[0] * h, v[1] * h, v[2] * h);
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
      side: THREE.FrontSide,
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
