import * as THREE from '../../vendor/three.module.min.js';
import { BLOCK_IDS, BlockRegistry } from '../blocks/BlockRegistry.js';
import { ITEM_DROP_PLAYER_DELAY, ITEM_DROP_DEATH_LIFETIME, FACE_SHADE, MAX_STACK_DEFAULT } from '../constants.js';
import { moveAABB } from '../physics/AABBPhysics.js';
import { ItemRegistry } from '../items/ItemRegistry.js';
import { getExtrudedTileGeometry } from '../textures/ExtrudedItemMesh.js';
import { FluidSimulator } from '../world/FluidSimulator.js';

const ITEM_SIZE = 0.26;
const ITEM_HALF = ITEM_SIZE * 0.5;
const ITEM_GRAVITY = 24.0;
const PICKUP_DELAY_DEFAULT = 0.22;
const MAGNET_RADIUS = 1.85;
const PICKUP_RADIUS = 0.54;
const MERGE_RADIUS = 1.1;
const MAX_DROPPED_ITEMS = 160;

const CUBE_FACES = [
  { key: 'top', nx: 0, ny: 1, nz: 0, shade: FACE_SHADE.TOP, verts: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]] },
  { key: 'bottom', nx: 0, ny: -1, nz: 0, shade: FACE_SHADE.BOTTOM, verts: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]] },
  { key: 'south', nx: 0, ny: 0, nz: 1, shade: FACE_SHADE.SOUTH, verts: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
  { key: 'north', nx: 0, ny: 0, nz: -1, shade: FACE_SHADE.NORTH, verts: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] },
  { key: 'east', nx: 1, ny: 0, nz: 0, shade: FACE_SHADE.EAST, verts: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]] },
  { key: 'west', nx: -1, ny: 0, nz: 0, shade: FACE_SHADE.WEST, verts: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]] },
];

/**
 * Builds crisp 3D BufferGeometry for blocks (with cross-plant flats, 3D torches,
 * 3D beds, and 3D ladders) OR delegates non-block items (>=256) to 1-px extruded 3D geometry.
 */
export function buildBlockItemGeometry(atlas, itemId, scale = 1.0) {
  if (!itemId || itemId <= 0) return null;

  if (itemId >= 256) {
    const itemDef = ItemRegistry.get(itemId);
    if (!itemDef || !itemDef.sprite) return null;
    return getExtrudedTileGeometry(atlas, itemDef.sprite, { scale: scale * 1.35 });
  }

  const def = BlockRegistry.get(itemId);
  if (!def || !def.faces) return null;

  const positions = [];
  const normals = [];
  const uvs = [];
  const colors = [];
  const indices = [];

  const addQuad = (p0, p1, p2, p3, nx, ny, nz, u0, u1, vBot, vTop, shade) => {
    const base = positions.length / 3;
    const b = Math.pow(shade, 1.38);
    positions.push(...p0, ...p1, ...p2, ...p3);
    for (let i = 0; i < 4; i++) {
      normals.push(nx, ny, nz);
      colors.push(b, b, b);
    }
    uvs.push(u0, vBot, u1, vBot, u1, vTop, u0, vTop);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  // 1. Flat sprite item for Cross Plants, Crops & Ladders
  if (def.isCross || def.isLadder || def.isCrop) {
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

  // 2. 3D Torch model (2x10x2 pixels = 5 faces = 20 verts)
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

    addQuad([-hw, yTop, 0], [hw, yTop, 0], [hw, yTop, -hl], [-hw, yTop, -hl], 0, 1, 0, headUv.u0, headUv.u1, headUv.vBottom, headUv.vTop, 1.0);
    addQuad([-hw, yTop, hl], [hw, yTop, hl], [hw, yTop, 0], [-hw, yTop, 0], 0, 1, 0, footUv.u0, footUv.u1, footUv.vBottom, footUv.vTop, 1.0);
    addQuad([-hw, yBot, -hl], [hw, yBot, -hl], [hw, yBot, hl], [-hw, yBot, hl], 0, -1, 0, woodUv.u0, woodUv.u1, woodUv.vBottom, woodUv.vTop, 0.6);
    addQuad([-hw, yBot, hl], [hw, yBot, hl], [hw, yTop, hl], [-hw, yTop, hl], 0, 0, 1, sideUv.u0, sideUv.u1, sideUv.vBottom + (sideUv.vTop - sideUv.vBottom) * 0.4, sideUv.vTop, 0.85);
    addQuad([hw, yBot, -hl], [-hw, yBot, -hl], [-hw, yTop, -hl], [hw, yTop, -hl], 0, 0, -1, woodUv.u0, woodUv.u1, woodUv.vBottom, woodUv.vTop, 0.8);
    addQuad([hw, yBot, hl], [hw, yBot, -hl], [hw, yTop, -hl], [hw, yTop, hl], 1, 0, 0, sideUv.u0, sideUv.u1, sideUv.vBottom + (sideUv.vTop - sideUv.vBottom) * 0.4, sideUv.vTop, 0.72);
    addQuad([-hw, yBot, -hl], [-hw, yBot, hl], [-hw, yTop, hl], [-hw, yTop, -hl], -1, 0, 0, sideUv.u0, sideUv.u1, sideUv.vBottom + (sideUv.vTop - sideUv.vBottom) * 0.4, sideUv.vTop, 0.70);

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
    const b = Math.pow(face.shade, 1.38);

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
  constructor(id, count, x, y, z, geometry, material, options = {}) {
    this.id = id;
    this.blockId = id; // Backwards-compatibility alias
    this.count = count;
    this.durability = options.durability ?? 0;
    this.maxDurability = options.maxDurability ?? ItemRegistry.getMaxDurability(id);
    this.meta = options.meta ?? 0;
    this.pickupDelay = options.pickupDelay ?? PICKUP_DELAY_DEFAULT;

    this.x = x;
    this.y = y;
    this.z = z;
    if (options.velocity) {
      this.vx = options.velocity.x;
      this.vy = options.velocity.y;
      this.vz = options.velocity.z;
    } else if (options.throwDir) {
      this.vx = options.throwDir.x * 4.4 + (Math.random() - 0.5) * 0.4;
      this.vy = options.throwDir.y * 2.5 + 2.2;
      this.vz = options.throwDir.z * 4.4 + (Math.random() - 0.5) * 0.4;
    } else {
      this.vx = (Math.random() - 0.5) * 1.8;
      this.vy = 2.6 + Math.random() * 1.2;
      this.vz = (Math.random() - 0.5) * 1.8;
    }
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
    this.extrudedMaterial = new THREE.MeshBasicMaterial({
      vertexColors: true,
      fog: true,
      side: THREE.FrontSide,
    });
    this._litMaterialPool = new Map();
  }

  _getLitMaterial(isExtruded, r, g, b) {
    const qr = Math.max(1, Math.min(15, Math.round(r * 15)));
    const qg = Math.max(1, Math.min(15, Math.round(g * 15)));
    const qb = Math.max(1, Math.min(15, Math.round(b * 15)));
    const key = (isExtruded ? 4096 : 0) | (qr << 8) | (qg << 4) | qb;
    let mat = this._litMaterialPool.get(key);
    if (!mat) {
      mat = new THREE.MeshBasicMaterial({
        map: isExtruded ? null : this.atlas.texture,
        vertexColors: true,
        fog: true,
        alphaTest: isExtruded ? 0 : 0.5,
        side: isExtruded ? THREE.FrontSide : THREE.DoubleSide,
      });
      mat.color.setRGB(qr / 15, qg / 15, qb / 15);
      this._litMaterialPool.set(key, mat);
    }
    return mat;
  }

  _computeLightRGB(world, x, y, z, skyInfo, heldEmit = 0) {
    const l = world.getLightAt ? world.getLightAt(x, y, z) : { sky: 15, block: 0 };
    const skyLevel = l.sky ?? 15;
    const blockLevel = Math.max(l.block ?? 0, heldEmit);
    const sunIntensity = skyInfo?.sunIntensity ?? 1.0;
    const skyTint = skyInfo?.skyTint;
    const torchTint = skyInfo?.torchTint;

    const skyCurve = Math.pow(0.82, (1 - Math.min(1, Math.max(0, skyLevel / 15))) * 15);
    const sunCurve = Math.pow(Math.max(0.001, sunIntensity), 0.92);
    const blkCurve = Math.pow(0.87, (1 - Math.min(1, Math.max(0, blockLevel / 15))) * 15);

    const sr = Math.pow(Math.max(0.001, skyCurve), 1.8) * sunCurve * (skyTint ? skyTint.r : 1);
    const sg = Math.pow(Math.max(0.001, skyCurve), 1.8) * sunCurve * (skyTint ? skyTint.g : 1);
    const sb = Math.pow(Math.max(0.001, skyCurve), 1.8) * sunCurve * (skyTint ? skyTint.b : 1);

    const br = Math.pow(Math.max(0.001, blkCurve), 1.32) * (torchTint ? torchTint.r : 1);
    const bg = Math.pow(Math.max(0.001, blkCurve), 1.32) * (torchTint ? torchTint.g : 0.90);
    const bb = Math.pow(Math.max(0.001, blkCurve), 1.32) * (torchTint ? torchTint.b : 0.72);

    const minL = 0.08;
    return [
      Math.min(1, Math.max(minL, sr, br)),
      Math.min(1, Math.max(minL, sg, bg)),
      Math.min(1, Math.max(minL, sb, bb)),
    ];
  }

  _getGeometry(itemId) {
    let geom = this.geometryCache.get(itemId);
    if (!geom) {
      geom = buildBlockItemGeometry(this.atlas, itemId, ITEM_SIZE);
      if (geom && itemId < 256) {
        this.geometryCache.set(itemId, geom);
      }
    }
    return geom;
  }

  spawnDrop(itemOrId, x, y, z, count = 1, options = {}) {
    const isObj = typeof itemOrId === 'object' && itemOrId !== null;
    const id = isObj ? itemOrId.id : itemOrId;
    let qty = isObj ? (itemOrId.count ?? count) : count;
    const durability = isObj ? (itemOrId.durability ?? 0) : (options.durability ?? 0);
    const maxDurability = isObj ? (itemOrId.maxDurability ?? ItemRegistry.getMaxDurability(id)) : ItemRegistry.getMaxDurability(id);
    const meta = isObj ? (itemOrId.meta ?? 0) : (options.meta ?? 0);

    if (!id || qty <= 0) return null;
    const maxStack = ItemRegistry.getMaxStack(id);

    // Merge identical stackable drops nearby
    if (maxStack > 1 && maxDurability === 0) {
      for (const other of this.entities) {
        if (!other.alive || other.id !== id || other.meta !== meta || other.count >= maxStack) continue;
        const d = Math.hypot(other.x - x, other.y - y, other.z - z);
        if (d < MERGE_RADIUS) {
          const space = maxStack - other.count;
          const add = Math.min(space, qty);
          other.count += add;
          qty -= add;
          if (qty <= 0) return other;
        }
      }
    }

    if (this.entities.length >= MAX_DROPPED_ITEMS) {
      const oldest = this.entities.shift();
      this.scene.remove(oldest.mesh);
    }

    const geom = this._getGeometry(id);
    if (!geom) return null;
    const mat = id >= 256 ? this.extrudedMaterial : this.material;
    const entity = new ItemEntity(id, qty, x, y, z, geom, mat, {
      durability,
      maxDurability,
      meta,
      pickupDelay: options.pickupDelay ?? PICKUP_DELAY_DEFAULT,
      throwDir: options.throwDir || null,
      velocity: options.velocity || null,
    });
    this.entities.push(entity);
    this.scene.add(entity.mesh);
    return entity;
  }

  spawnPlayerDrop(stack, arg2, arg3, arg4, arg5) {
    if (!stack || !stack.id || stack.count <= 0) return null;
    let sx;
    let sy;
    let sz;
    let dir;
    if (typeof arg2 === 'number') {
      sx = arg2;
      sy = arg3;
      sz = arg4;
      dir = arg5 || { x: 0, y: 0, z: -1 };
    } else {
      const player = arg2;
      dir = arg3 || { x: 0, y: 0, z: -1 };
      sx = player.x + dir.x * 0.6;
      sy = player.y + 1.25;
      sz = player.z + dir.z * 0.6;
    }
    return this.spawnDrop(stack, sx, sy, sz, stack.count, {
      pickupDelay: ITEM_DROP_PLAYER_DELAY,
      throwDir: dir,
    });
  }

  spawnDeathDrop(stack, x, y, z) {
    if (!stack || !stack.id || stack.count <= 0) return null;
    const angle = Math.random() * Math.PI * 2;
    const speed = 1.6 + Math.random() * 2.4;
    return this.spawnDrop(stack, x, y + 0.9, z, stack.count, {
      pickupDelay: 0.75,
      velocity: {
        x: Math.cos(angle) * speed,
        y: 3.1 + Math.random() * 2.0,
        z: Math.sin(angle) * speed,
      },
    });
  }

  update(dt, world, player, receiver, skyInfo = null) {
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
      if (item.age > ITEM_DROP_DEATH_LIFETIME) {
        item.alive = false;
        continue;
      }

      const dxp = targetX - item.x;
      const dyp = targetY - item.y;
      const dzp = targetZ - item.z;
      const dist = Math.hypot(dxp, dyp, dzp);

      const canPick = !player.isDead && receiver && (typeof receiver.canAccept === 'function' ? receiver.canAccept(item.id, item.count, item.durability) : true);
      if (item.age >= item.pickupDelay && dist < MAGNET_RADIUS && canPick) {
        if (dist < PICKUP_RADIUS) {
          const leftover = receiver.addItem(item.id, item.count, item.durability, item.meta);
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

      const fluidHere = world.getBlock(item.x, item.y + 0.1, item.z);
      if (fluidHere === BLOCK_IDS.LAVA) {
        // Items tossed into lava burn away quickly
        item.alive = false;
        this.scene.remove(item.mesh);
        this.entities.splice(i, 1);
        continue;
      }

      if (fluidHere === BLOCK_IDS.WATER) {
        const flow = FluidSimulator.getFlowVector(world, item.x, item.y + 0.1, item.z, BLOCK_IDS.WATER);
        item.vx += (flow.x * 2.2 - item.vx) * Math.min(1, dt * 6);
        item.vz += (flow.z * 2.2 - item.vz) * Math.min(1, dt * 6);
        const waterAbove = world.getBlock(item.x, item.y + 0.45, item.z) === BLOCK_IDS.WATER;
        item.vy = waterAbove ? Math.min(2.6, item.vy + 14 * dt) : Math.max(-1.2, item.vy - 3 * dt);
      } else {
        item.vy = Math.max(-24, item.vy - ITEM_GRAVITY * dt);
      }

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

      const maxStack = ItemRegistry.getMaxStack(item.id) || MAX_STACK_DEFAULT;
      if (maxStack > 1 && item.maxDurability === 0 && item.onGround && Math.floor(item.age * 4) !== Math.floor((item.age - dt) * 4)) {
        for (let j = i - 1; j >= 0; j--) {
          const other = this.entities[j];
          if (!other.alive || other.id !== item.id || other.meta !== item.meta || other.count >= maxStack) continue;
          const d = Math.hypot(other.x - item.x, other.y - item.y, other.z - item.z);
          if (d < MERGE_RADIUS) {
            const add = Math.min(maxStack - other.count, item.count);
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

      const itemDef = ItemRegistry.get(item.id);
      const emit = itemDef?.lightEmission || 0;
      const [lr, lg, lb] = this._computeLightRGB(world, item.x, item.y + 0.35, item.z, skyInfo, emit);
      const targetMat = this._getLitMaterial(item.id >= 256, lr, lg, lb);
      if (item.mesh.material !== targetMat) {
        item.mesh.material = targetMat;
      }
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
    this.extrudedMaterial.dispose();
    for (const mat of this._litMaterialPool.values()) {
      mat.dispose();
    }
    this._litMaterialPool.clear();
  }
}
