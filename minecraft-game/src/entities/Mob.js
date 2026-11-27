import * as THREE from '../../vendor/three.module.min.js';
import { BLOCK_IDS, BlockRegistry } from '../blocks/BlockRegistry.js';
import { ITEM_IDS } from '../items/ItemIds.js';
import {
  CREEPER_EXPLOSION_POWER,
  CREEPER_CANCEL_RANGE,
  CREEPER_FUSE_SEC,
  CREEPER_IGNITE_RANGE,
  WORLD_HEIGHT,
} from '../constants.js';

export const MOB_SPECS = {
  pig: {
    id: 'pig', name: 'Pig', hostile: false, maxHp: 10, halfWidth: 0.42, height: 0.9,
    speed: 2.3, attackDamage: 0, burnInSunlight: false, xpMin: 1, xpMax: 3,
  },
  cow: {
    id: 'cow', name: 'Cow', hostile: false, maxHp: 10, halfWidth: 0.44, height: 1.38,
    speed: 2.2, attackDamage: 0, burnInSunlight: false, xpMin: 1, xpMax: 3,
  },
  sheep: {
    id: 'sheep', name: 'Sheep', hostile: false, maxHp: 8, halfWidth: 0.42, height: 1.28,
    speed: 2.3, attackDamage: 0, burnInSunlight: false, xpMin: 1, xpMax: 3,
  },
  chicken: {
    id: 'chicken', name: 'Chicken', hostile: false, maxHp: 4, halfWidth: 0.25, height: 0.72,
    speed: 2.6, attackDamage: 0, burnInSunlight: false, xpMin: 1, xpMax: 3,
  },
  zombie: {
    id: 'zombie', name: 'Zombie', hostile: true, maxHp: 20, halfWidth: 0.32, height: 1.92,
    speed: 2.6, attackDamage: 3, burnInSunlight: true, xpMin: 5, xpMax: 5,
  },
  skeleton: {
    id: 'skeleton', name: 'Skeleton', hostile: true, maxHp: 20, halfWidth: 0.32, height: 1.95,
    speed: 2.75, attackDamage: 3, burnInSunlight: true, xpMin: 5, xpMax: 5,
  },
  spider: {
    id: 'spider', name: 'Spider', hostile: true, maxHp: 16, halfWidth: 0.65, height: 0.9,
    speed: 3.7, attackDamage: 2, burnInSunlight: false, xpMin: 5, xpMax: 5,
  },
  creeper: {
    id: 'creeper', name: 'Creeper', hostile: true, maxHp: 20, halfWidth: 0.32, height: 1.7,
    speed: 2.65, attackDamage: 0, burnInSunlight: false, xpMin: 5, xpMax: 5,
  },
  enderman: {
    id: 'enderman', name: 'Enderman', hostile: true, maxHp: 40, halfWidth: 0.34, height: 2.85,
    speed: 4.5, attackDamage: 5, burnInSunlight: false, xpMin: 5, xpMax: 5,
  },
};

function _makeBoxPart(parts, disposables, w, h, d, color, x, y, z, emissive = false) {
  const geom = new THREE.BoxGeometry(w, h, d);
  const mat = new THREE.MeshBasicMaterial({ color, fog: true });
  const baseColor = new THREE.Color(color);
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set(x, y, z);
  disposables.push(geom, mat);
  parts.push({ mesh, mat, baseColor, emissive });
  return mesh;
}

function buildMobVisual(type, sheared = false) {
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const parts = [];
  const disposables = [];
  const legs = [];
  let headPivot = null;
  let leftArm = null;
  let rightArm = null;
  let woolMesh = null;

  const box = (parent, w, h, d, color, x, y, z, emissive = false) => {
    const m = _makeBoxPart(parts, disposables, w, h, d, color, x, y, z, emissive);
    parent.add(m);
    return m;
  };

  if (type === 'pig') {
    box(bodyGroup, 0.56, 0.44, 0.86, 0xf0a3a8, 0, 0.54, 0);
    headPivot = new THREE.Group();
    headPivot.position.set(0, 0.64, 0.42);
    bodyGroup.add(headPivot);
    box(headPivot, 0.44, 0.42, 0.44, 0xf3afb4, 0, 0, 0.18);
    box(headPivot, 0.22, 0.14, 0.08, 0xf98c96, 0, -0.06, 0.42); // snout
    box(headPivot, 0.07, 0.07, 0.03, 0x1a1a1a, -0.13, 0.06, 0.41);
    box(headPivot, 0.07, 0.07, 0.03, 0x1a1a1a, 0.13, 0.06, 0.41);
    for (const [lx, lz] of [[-0.17, 0.28], [0.17, 0.28], [-0.17, -0.28], [0.17, -0.28]]) {
      const lp = new THREE.Group();
      lp.position.set(lx, 0.34, lz);
      bodyGroup.add(lp);
      box(lp, 0.18, 0.34, 0.18, 0xe8969c, 0, -0.17, 0);
      legs.push(lp);
    }
  } else if (type === 'cow') {
    box(bodyGroup, 0.68, 0.58, 1.02, 0x5c402c, 0, 0.86, 0);
    box(bodyGroup, 0.70, 0.28, 0.42, 0xe8e4dc, 0, 0.90, -0.12); // cow patch
    headPivot = new THREE.Group();
    headPivot.position.set(0, 1.02, 0.52);
    bodyGroup.add(headPivot);
    box(headPivot, 0.46, 0.46, 0.42, 0x5a3d2a, 0, 0, 0.20);
    box(headPivot, 0.38, 0.18, 0.10, 0xcab9ab, 0, -0.12, 0.42); // muzzle
    box(headPivot, 0.07, 0.14, 0.07, 0xc8c0b4, -0.24, 0.22, 0.14); // horn L
    box(headPivot, 0.07, 0.14, 0.07, 0xc8c0b4, 0.24, 0.22, 0.14); // horn R
    box(headPivot, 0.07, 0.07, 0.03, 0x111111, -0.14, 0.06, 0.42);
    box(headPivot, 0.07, 0.07, 0.03, 0x111111, 0.14, 0.06, 0.42);
    for (const [lx, lz] of [[-0.21, 0.35], [0.21, 0.35], [-0.21, -0.35], [0.21, -0.35]]) {
      const lp = new THREE.Group();
      lp.position.set(lx, 0.58, lz);
      bodyGroup.add(lp);
      box(lp, 0.20, 0.58, 0.20, 0x4d3423, 0, -0.29, 0);
      legs.push(lp);
    }
  } else if (type === 'sheep') {
    box(bodyGroup, 0.54, 0.48, 0.88, 0xd8c3a8, 0, 0.78, 0); // sheared body
    woolMesh = box(bodyGroup, 0.68, 0.62, 0.98, 0xf2f0ec, 0, 0.80, 0);
    woolMesh.visible = !sheared;
    headPivot = new THREE.Group();
    headPivot.position.set(0, 0.92, 0.48);
    bodyGroup.add(headPivot);
    box(headPivot, 0.38, 0.38, 0.42, 0xe8cfb4, 0, 0, 0.18);
    box(headPivot, 0.42, 0.14, 0.26, 0xf2f0ec, 0, 0.16, 0.12);
    box(headPivot, 0.07, 0.07, 0.03, 0x1a1a1a, -0.12, 0.04, 0.40);
    box(headPivot, 0.07, 0.07, 0.03, 0x1a1a1a, 0.12, 0.04, 0.40);
    for (const [lx, lz] of [[-0.17, 0.29], [0.17, 0.29], [-0.17, -0.29], [0.17, -0.29]]) {
      const lp = new THREE.Group();
      lp.position.set(lx, 0.52, lz);
      bodyGroup.add(lp);
      box(lp, 0.18, 0.52, 0.18, 0xdcc0a1, 0, -0.26, 0);
      legs.push(lp);
    }
  } else if (type === 'chicken') {
    box(bodyGroup, 0.36, 0.32, 0.46, 0xf8f8f6, 0, 0.40, 0);
    // Wings (used as arms for flap animation)
    leftArm = new THREE.Group();
    leftArm.position.set(-0.20, 0.48, 0);
    bodyGroup.add(leftArm);
    box(leftArm, 0.06, 0.22, 0.34, 0xecece8, 0, -0.08, 0);
    rightArm = new THREE.Group();
    rightArm.position.set(0.20, 0.48, 0);
    bodyGroup.add(rightArm);
    box(rightArm, 0.06, 0.22, 0.34, 0xecece8, 0, -0.08, 0);

    headPivot = new THREE.Group();
    headPivot.position.set(0, 0.54, 0.22);
    bodyGroup.add(headPivot);
    box(headPivot, 0.24, 0.30, 0.22, 0xfafaf8, 0, 0.08, 0.08);
    box(headPivot, 0.18, 0.10, 0.16, 0xe69f28, 0, 0.04, 0.25); // beak
    box(headPivot, 0.10, 0.10, 0.08, 0xd62828, 0, -0.05, 0.20); // wattle
    box(headPivot, 0.05, 0.05, 0.02, 0x111111, -0.08, 0.12, 0.19);
    box(headPivot, 0.05, 0.05, 0.02, 0x111111, 0.08, 0.12, 0.19);

    for (const lx of [-0.09, 0.09]) {
      const lp = new THREE.Group();
      lp.position.set(lx, 0.24, 0.02);
      bodyGroup.add(lp);
      box(lp, 0.06, 0.24, 0.06, 0xd9a134, 0, -0.12, 0);
      box(lp, 0.12, 0.03, 0.14, 0xd9a134, 0, -0.22, 0.04);
      legs.push(lp);
    }
  } else if (type === 'zombie') {
    box(bodyGroup, 0.48, 0.72, 0.26, 0x3b8ea5, 0, 1.08, 0); // cyan shirt
    headPivot = new THREE.Group();
    headPivot.position.set(0, 1.44, 0);
    bodyGroup.add(headPivot);
    box(headPivot, 0.48, 0.48, 0.48, 0x5c8c46, 0, 0.24, 0);
    box(headPivot, 0.08, 0.06, 0.03, 0x1b2b15, -0.11, 0.24, 0.245);
    box(headPivot, 0.08, 0.06, 0.03, 0x1b2b15, 0.11, 0.24, 0.245);

    leftArm = new THREE.Group();
    leftArm.position.set(-0.35, 1.36, 0);
    leftArm.rotation.x = -Math.PI * 0.46;
    bodyGroup.add(leftArm);
    box(leftArm, 0.22, 0.70, 0.22, 0x5c8c46, 0, -0.32, 0);

    rightArm = new THREE.Group();
    rightArm.position.set(0.35, 1.36, 0);
    rightArm.rotation.x = -Math.PI * 0.46;
    bodyGroup.add(rightArm);
    box(rightArm, 0.22, 0.70, 0.22, 0x5c8c46, 0, -0.32, 0);

    for (const lx of [-0.13, 0.13]) {
      const lp = new THREE.Group();
      lp.position.set(lx, 0.72, 0);
      bodyGroup.add(lp);
      box(lp, 0.22, 0.72, 0.22, 0x3b3d8c, 0, -0.36, 0);
      legs.push(lp);
    }
  } else if (type === 'skeleton') {
    box(bodyGroup, 0.44, 0.72, 0.22, 0xd8d8d4, 0, 1.08, 0);
    box(bodyGroup, 0.14, 0.70, 0.24, 0x8e8e8a, 0, 1.08, 0.01); // spine contrast
    headPivot = new THREE.Group();
    headPivot.position.set(0, 1.44, 0);
    bodyGroup.add(headPivot);
    box(headPivot, 0.46, 0.46, 0.46, 0xe0e0dc, 0, 0.23, 0);
    box(headPivot, 0.10, 0.08, 0.03, 0x1a1a1a, -0.11, 0.23, 0.235);
    box(headPivot, 0.10, 0.08, 0.03, 0x1a1a1a, 0.11, 0.23, 0.235);
    box(headPivot, 0.16, 0.06, 0.03, 0x333333, 0, 0.11, 0.235);

    leftArm = new THREE.Group();
    leftArm.position.set(-0.30, 1.38, 0);
    leftArm.rotation.x = -Math.PI * 0.42;
    bodyGroup.add(leftArm);
    box(leftArm, 0.12, 0.68, 0.12, 0xd4d4d0, 0, -0.32, 0);

    rightArm = new THREE.Group();
    rightArm.position.set(0.30, 1.38, 0);
    rightArm.rotation.x = -Math.PI * 0.45;
    bodyGroup.add(rightArm);
    box(rightArm, 0.12, 0.68, 0.12, 0xd4d4d0, 0, -0.32, 0);
    // Held wooden bow
    box(rightArm, 0.06, 0.06, 0.56, 0x7b5632, 0, -0.62, 0.12);

    for (const lx of [-0.13, 0.13]) {
      const lp = new THREE.Group();
      lp.position.set(lx, 0.72, 0);
      bodyGroup.add(lp);
      box(lp, 0.12, 0.72, 0.12, 0xd4d4d0, 0, -0.36, 0);
      legs.push(lp);
    }
  } else if (type === 'spider') {
    box(bodyGroup, 0.62, 0.44, 0.72, 0x262426, 0, 0.48, -0.36); // abdomen
    box(bodyGroup, 0.42, 0.34, 0.34, 0x323034, 0, 0.44, 0.12); // thorax
    headPivot = new THREE.Group();
    headPivot.position.set(0, 0.44, 0.32);
    bodyGroup.add(headPivot);
    box(headPivot, 0.44, 0.38, 0.38, 0x2a282c, 0, 0, 0.16);
    // Glowing red spider eyes
    box(headPivot, 0.08, 0.06, 0.03, 0xe82424, -0.11, 0.05, 0.36, true);
    box(headPivot, 0.08, 0.06, 0.03, 0xe82424, 0.11, 0.05, 0.36, true);
    box(headPivot, 0.05, 0.05, 0.03, 0xb81a1a, -0.16, -0.03, 0.35, true);
    box(headPivot, 0.05, 0.05, 0.03, 0xb81a1a, 0.16, -0.03, 0.35, true);

    // 8 legs (4 per side)
    for (let i = 0; i < 4; i++) {
      const zOff = 0.22 - i * 0.16;
      for (const side of [-1, 1]) {
        const lp = new THREE.Group();
        lp.position.set(side * 0.22, 0.40, zOff);
        bodyGroup.add(lp);
        const legMesh = box(lp, 0.68, 0.09, 0.09, 0x232125, side * 0.30, -0.10, 0);
        legMesh.rotation.z = side * -0.45;
        lp.rotation.y = side * (0.35 - i * 0.25);
        legs.push(lp);
      }
    }
  } else if (type === 'creeper') {
    box(bodyGroup, 0.46, 0.74, 0.26, 0x4ca642, 0, 0.78, 0);
    box(bodyGroup, 0.32, 0.48, 0.28, 0x3b8933, 0, 0.76, 0.01);
    headPivot = new THREE.Group();
    headPivot.position.set(0, 1.15, 0);
    bodyGroup.add(headPivot);
    box(headPivot, 0.48, 0.48, 0.48, 0x52b648, 0, 0.24, 0);
    // Iconic Creeper face
    box(headPivot, 0.10, 0.10, 0.03, 0x111111, -0.11, 0.30, 0.245);
    box(headPivot, 0.10, 0.10, 0.03, 0x111111, 0.11, 0.30, 0.245);
    box(headPivot, 0.12, 0.12, 0.03, 0x111111, 0, 0.18, 0.245);
    box(headPivot, 0.06, 0.12, 0.03, 0x111111, -0.09, 0.12, 0.245);
    box(headPivot, 0.06, 0.12, 0.03, 0x111111, 0.09, 0.12, 0.245);

    for (const [lx, lz] of [[-0.14, 0.14], [0.14, 0.14], [-0.14, -0.14], [0.14, -0.14]]) {
      const lp = new THREE.Group();
      lp.position.set(lx, 0.40, lz);
      bodyGroup.add(lp);
      box(lp, 0.20, 0.40, 0.20, 0x419438, 0, -0.20, 0);
      legs.push(lp);
    }
  } else if (type === 'enderman') {
    box(bodyGroup, 0.44, 0.88, 0.24, 0x151518, 0, 1.88, 0);
    headPivot = new THREE.Group();
    headPivot.position.set(0, 2.32, 0);
    bodyGroup.add(headPivot);
    box(headPivot, 0.46, 0.48, 0.46, 0x18181c, 0, 0.24, 0);
    // Glowing purple/magenta Enderman eyes
    box(headPivot, 0.11, 0.05, 0.03, 0xe070ff, -0.12, 0.22, 0.235, true);
    box(headPivot, 0.11, 0.05, 0.03, 0xe070ff, 0.12, 0.22, 0.235, true);

    leftArm = new THREE.Group();
    leftArm.position.set(-0.30, 2.26, 0);
    bodyGroup.add(leftArm);
    box(leftArm, 0.12, 1.48, 0.12, 0x141417, 0, -0.72, 0);

    rightArm = new THREE.Group();
    rightArm.position.set(0.30, 2.26, 0);
    bodyGroup.add(rightArm);
    box(rightArm, 0.12, 1.48, 0.12, 0x141417, 0, -0.72, 0);

    for (const lx of [-0.12, 0.12]) {
      const lp = new THREE.Group();
      lp.position.set(lx, 1.44, 0);
      bodyGroup.add(lp);
      box(lp, 0.12, 1.44, 0.12, 0x141417, 0, -0.72, 0);
      legs.push(lp);
    }
  }

  return { root, bodyGroup, parts, disposables, legs, headPivot, leftArm, rightArm, woolMesh };
}

export class Mob {
  constructor(scene, type, x, y, z, extras = {}) {
    const spec = MOB_SPECS[type] || MOB_SPECS.pig;
    this.type = spec.id;
    this.name = spec.name;
    this.hostile = spec.hostile;
    this.maxHp = spec.maxHp;
    this.hp = extras.hp !== undefined ? Math.max(1, Math.min(spec.maxHp, extras.hp)) : spec.maxHp;
    this.halfWidth = spec.halfWidth;
    this.height = spec.height;
    this.speed = spec.speed;
    this.attackDamage = spec.attackDamage;
    this.burnInSunlight = spec.burnInSunlight;

    this.x = x;
    this.y = y;
    this.z = z;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.yaw = extras.yaw !== undefined ? extras.yaw : Math.random() * Math.PI * 2;
    this.onGround = false;
    this.inWater = false;
    this.fallStartY = y;

    this.alive = true;
    this.dying = false;
    this.deathTimer = 0;
    this.hitFlashTimer = 0;
    this.hurtCooldown = 0;
    this.attackCooldown = 0;
    this.fireTimer = 0;
    this.waterHurtTimer = 0;
    this.walkPhase = Math.random() * 10;

    // AI state
    this.wanderYaw = this.yaw;
    this.wanderTimer = 1 + Math.random() * 3;
    this.idlePauseTimer = 0;
    this.panicTimer = 0;
    this.aggro = Boolean(extras.aggro);

    // Mob-specific states
    this.sheared = Boolean(extras.sheared);
    this.woolRegrowTimer = 0;
    this.milkCooldown = 0;
    this.eggTimer = 50 + Math.random() * 50;
    this.fuseTimer = 0;
    this.isIgnited = false;
    this.arrowCooldown = 1.1 + Math.random() * 0.9;
    this.strafeDir = Math.random() < 0.5 ? -1 : 1;
    this.teleportCooldown = 0;
    this.portalParticleTimer = 0;
    this.wasKilledByPlayer = false;

    this.visual = buildMobVisual(this.type, this.sheared);
    this.visual.root.position.set(x, y, z);
    this.visual.root.rotation.y = this.yaw;
    scene.add(this.visual.root);
  }

  setSheared(sheared) {
    this.sheared = Boolean(sheared);
    if (this.visual.woolMesh) {
      this.visual.woolMesh.visible = !this.sheared;
    }
    if (this.sheared) {
      this.woolRegrowTimer = 25 + Math.random() * 20;
    }
  }

  hurt(damage, dirX = 0, dirZ = 0, knockback = 1.0, isCrit = false, byPlayer = true) {
    if (!this.alive || this.dying) return false;
    if (this.hurtCooldown > 0 && damage > 0) return false;

    this.hurtCooldown = 0.25;
    this.hitFlashTimer = 0.28;
    if (damage > 0) {
      this.hp -= damage;
    }
    if (!this.hostile) {
      this.panicTimer = 4.2;
    } else if (byPlayer) {
      this.aggro = true;
    }

    const dLen = Math.hypot(dirX, dirZ);
    if (dLen > 1e-4 && knockback > 0) {
      const kbSpeed = (isCrit ? 8.2 : 6.4) * knockback;
      this.vx += (dirX / dLen) * kbSpeed;
      this.vz += (dirZ / dLen) * kbSpeed;
      if (this.onGround) {
        this.vy = Math.max(this.vy, 4.6 * Math.min(1.3, knockback));
      }
    }

    if (this.hp <= 0) {
      this.hp = 0;
      this.dying = true;
      this.deathTimer = 0.55;
      this.wasKilledByPlayer = byPlayer;
      return true;
    }
    return true;
  }

  getDrops() {
    const cooked = this.fireTimer > 0;
    const randInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
    const drops = [];
    if (this.type === 'pig') {
      drops.push({ id: cooked ? ITEM_IDS.COOKED_PORKCHOP : ITEM_IDS.RAW_PORKCHOP, count: randInt(1, 3) });
    } else if (this.type === 'cow') {
      drops.push({ id: cooked ? ITEM_IDS.COOKED_BEEF : ITEM_IDS.RAW_BEEF, count: randInt(1, 3) });
      const leather = randInt(0, 2);
      if (leather > 0) drops.push({ id: ITEM_IDS.LEATHER, count: leather });
    } else if (this.type === 'sheep') {
      drops.push({ id: cooked ? ITEM_IDS.COOKED_MUTTON : ITEM_IDS.RAW_MUTTON, count: randInt(1, 2) });
      if (!this.sheared) drops.push({ id: BLOCK_IDS.WOOL_WHITE, count: 1 });
    } else if (this.type === 'chicken') {
      drops.push({ id: cooked ? ITEM_IDS.COOKED_CHICKEN : ITEM_IDS.RAW_CHICKEN, count: 1 });
      const feather = randInt(0, 2);
      if (feather > 0) drops.push({ id: ITEM_IDS.FEATHER, count: feather });
    } else if (this.type === 'zombie') {
      const flesh = randInt(0, 2);
      if (flesh > 0) drops.push({ id: ITEM_IDS.ROTTEN_FLESH, count: flesh });
      if (Math.random() < 0.025) drops.push({ id: ITEM_IDS.IRON_INGOT, count: 1 });
    } else if (this.type === 'skeleton') {
      const bones = randInt(0, 2);
      const arrows = randInt(0, 2);
      if (bones > 0) drops.push({ id: ITEM_IDS.BONE, count: bones });
      if (arrows > 0) drops.push({ id: ITEM_IDS.ARROW, count: arrows });
      if (Math.random() < 0.08) drops.push({ id: ITEM_IDS.BOW, count: 1 });
    } else if (this.type === 'spider') {
      const str = randInt(0, 2);
      if (str > 0) drops.push({ id: ITEM_IDS.STRING, count: str });
      if (Math.random() < 0.33) drops.push({ id: ITEM_IDS.SPIDER_EYE, count: 1 });
    } else if (this.type === 'creeper') {
      const gp = randInt(0, 2);
      if (gp > 0) drops.push({ id: ITEM_IDS.GUNPOWDER, count: gp });
    } else if (this.type === 'enderman') {
      if (Math.random() < 0.65) drops.push({ id: ITEM_IDS.ENDER_PEARL, count: 1 });
    }

    const spec = MOB_SPECS[this.type];
    const xp = this.wasKilledByPlayer ? randInt(spec.xpMin, spec.xpMax) : 0;
    return { drops, xp };
  }

  _tryTeleport(world, centerX, centerZ, minR = 5, maxR = 14) {
    if (!world || this.teleportCooldown > 0) return false;
    for (let attempt = 0; attempt < 10; attempt++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = minR + Math.random() * (maxR - minR);
      const tx = Math.floor(centerX + Math.cos(ang) * dist) + 0.5;
      const tz = Math.floor(centerZ + Math.sin(ang) * dist) + 0.5;
      const startY = Math.min(WORLD_HEIGHT - 4, Math.max(4, Math.floor(this.y) + 6));
      for (let ty = startY; ty >= 2; ty--) {
        const floorId = world.getBlock(Math.floor(tx), ty - 1, Math.floor(tz));
        const b1 = world.getBlock(Math.floor(tx), ty, Math.floor(tz));
        const b2 = world.getBlock(Math.floor(tx), ty + 1, Math.floor(tz));
        const b3 = world.getBlock(Math.floor(tx), ty + 2, Math.floor(tz));
        if (BlockRegistry.isSolid(floorId) && !BlockRegistry.isSolid(b1) && !BlockRegistry.isLiquid(b1) &&
            !BlockRegistry.isSolid(b2) && !BlockRegistry.isSolid(b3)) {
          this.x = tx;
          this.y = ty;
          this.z = tz;
          this.vx = 0;
          this.vy = 0;
          this.vz = 0;
          this.fallStartY = ty;
          this.teleportCooldown = 1.6;
          return true;
        }
      }
    }
    return false;
  }

  update(dt, {
    world,
    player,
    skyInfo = null,
    isDaylight = true,
    particleManager = null,
    itemManager = null,
    onShootArrow = null,
    onExplode = null,
    onDie = null,
  }) {
    if (!this.alive) return;

    if (this.dying) {
      this.deathTimer -= dt;
      const prog = Math.min(1, 1 - this.deathTimer / 0.55);
      this.visual.bodyGroup.rotation.z = prog * (Math.PI * 0.5);
      this.visual.root.position.set(this.x, this.y, this.z);
      this._updateLightingAndFlash(world, skyInfo, true);
      if (this.deathTimer <= 0) {
        this.alive = false;
        particleManager?.spawnSmoke(this.x, this.y + this.height * 0.4, this.z, 7);
        onDie?.(this);
      }
      return;
    }

    this.hurtCooldown = Math.max(0, this.hurtCooldown - dt);
    this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.teleportCooldown = Math.max(0, this.teleportCooldown - dt);
    this.milkCooldown = Math.max(0, this.milkCooldown - dt);

    const bx = Math.floor(this.x);
    const by = Math.floor(this.y);
    const bz = Math.floor(this.z);
    const feetId = world.getBlock(bx, by, bz);
    const headId = world.getBlock(bx, Math.floor(this.y + this.height * 0.75), bz);
    this.inWater = BlockRegistry.isWater(feetId) || BlockRegistry.isWater(headId);
    const inLava = BlockRegistry.isLava(feetId) || BlockRegistry.isLava(headId);

    if (inLava) {
      this.fireTimer = Math.max(this.fireTimer, 4.0);
      if (this.hurtCooldown <= 0) {
        this.hurt(4, 0, 0, 0, false, false);
        if (this.dying) return;
      }
    }

    // Endermen hate water & teleport away
    if (this.type === 'enderman' && this.inWater) {
      this.waterHurtTimer -= dt;
      if (this.waterHurtTimer <= 0) {
        this.waterHurtTimer = 0.5;
        this.hurt(1, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 0.3, false, false);
        particleManager?.spawnSplash(this.x, this.y + 0.6, this.z, 5);
        this._tryTeleport(world, this.x, this.z, 6, 16);
      }
    }

    // Sunlight burn for Zombies & Skeletons
    if (this.burnInSunlight && isDaylight && !this.inWater) {
      const skyLvl = world.getSkyLight(bx, Math.min(WORLD_HEIGHT - 1, Math.floor(this.y + this.height)), bz);
      if (skyLvl >= 14) {
        this.fireTimer = Math.max(this.fireTimer, 2.5);
      }
    }

    if (this.fireTimer > 0) {
      if (this.inWater) {
        this.fireTimer = 0;
      } else {
        this.fireTimer -= dt;
        if (Math.random() < 0.25) {
          particleManager?.spawnFlame(this.x, this.y + this.height * 0.5, this.z, 1);
        }
        if (this.hurtCooldown <= 0) {
          this.hurt(1, 0, 0, 0, false, false);
          this.hurtCooldown = 0.9;
          if (this.dying) return;
        }
      }
    }

    // Sheep wool regrow & Chicken egg laying
    if (this.type === 'sheep' && this.sheared) {
      this.woolRegrowTimer -= dt;
      if (this.woolRegrowTimer <= 0) {
        const below = world.getBlock(bx, by - 1, bz);
        if (below === BLOCK_IDS.GRASS) {
          world.setBlock(bx, by - 1, bz, BLOCK_IDS.DIRT);
          this.setSheared(false);
          particleManager?.spawnHappy(this.x, this.y + 0.6, this.z, 6);
        } else {
          this.woolRegrowTimer = 8;
        }
      }
    } else if (this.type === 'chicken') {
      this.eggTimer -= dt;
      if (this.eggTimer <= 0 && itemManager) {
        this.eggTimer = 60 + Math.random() * 55;
        itemManager.spawnDrop(ITEM_IDS.EGG, this.x, this.y + 0.3, this.z, 1);
      }
    } else if (this.type === 'enderman') {
      this.portalParticleTimer -= dt;
      if (this.portalParticleTimer <= 0) {
        this.portalParticleTimer = 0.22;
        particleManager?.spawnPortal(this.x, this.y, this.z, 2);
      }
    }

    // AI target & desired horizontal movement
    let moveDirX = 0;
    let moveDirZ = 0;
    let moveSpeed = this.speed;

    const playerAlive = player && !player.isDead && player.gameMode !== 'creative';
    const px = player ? player.position.x : 0;
    const py = player ? player.position.y : 0;
    const pz = player ? player.position.z : 0;
    const dxToPlayer = px - this.x;
    const dyToPlayer = (py + 0.9) - (this.y + this.height * 0.6);
    const dzToPlayer = pz - this.z;
    const distToPlayer = Math.hypot(dxToPlayer, dzToPlayer);
    const dist3D = Math.hypot(dxToPlayer, dyToPlayer, dzToPlayer);

    // Enderman stare aggro check
    if (this.type === 'enderman' && playerAlive && !this.aggro && dist3D < 28) {
      const look = player.getLookDirection();
      const eye = player.getEyeOrigin();
      const ex = this.x - eye.x;
      const ey = (this.y + this.height - 0.35) - eye.y;
      const ez = this.z - eye.z;
      const eLen = Math.hypot(ex, ey, ez);
      if (eLen > 1.2) {
        const dot = (look.x * ex + look.y * ey + look.z * ez) / eLen;
        if (dot > 0.975) {
          this.aggro = true;
        }
      }
    }

    // Spider daytime neutrality
    const spiderHostileNow = this.type === 'spider' ? (!isDaylight || this.aggro) : true;
    const isAggro = playerAlive && this.hostile && spiderHostileNow && (
      (this.type === 'enderman' ? (this.aggro && dist3D < 32) : dist3D < 20)
    );

    if (isAggro && distToPlayer > 0.05) {
      const nx = dxToPlayer / distToPlayer;
      const nz = dzToPlayer / distToPlayer;
      this.yaw = Math.atan2(nx, nz);

      if (this.type === 'creeper') {
        if (dist3D <= CREEPER_IGNITE_RANGE) {
          this.isIgnited = true;
        } else if (dist3D > CREEPER_CANCEL_RANGE) {
          this.isIgnited = false;
          this.fuseTimer = Math.max(0, this.fuseTimer - dt * 2);
        }

        if (this.isIgnited) {
          this.fuseTimer += dt;
          moveDirX = 0;
          moveDirZ = 0;
          if (this.fuseTimer >= CREEPER_FUSE_SEC) {
            this.alive = false;
            onExplode?.(this, CREEPER_EXPLOSION_POWER);
            return;
          }
        } else {
          moveDirX = nx;
          moveDirZ = nz;
        }
      } else if (this.type === 'skeleton') {
        this.arrowCooldown -= dt;
        if (dist3D > 11.5) {
          moveDirX = nx;
          moveDirZ = nz;
        } else if (dist3D < 5.5) {
          moveDirX = -nx * 0.7;
          moveDirZ = -nz * 0.7;
        } else {
          // Strafe
          moveDirX = -nz * this.strafeDir * 0.55;
          moveDirZ = nx * this.strafeDir * 0.55;
        }
        if (this.arrowCooldown <= 0 && dist3D < 18) {
          this.arrowCooldown = 1.9 + Math.random() * 0.8;
          this.strafeDir *= -1;
          onShootArrow?.(this, player);
        }
      } else {
        moveDirX = nx;
        moveDirZ = nz;

        // Enderman occasional flanking teleport if stuck/distant
        if (this.type === 'enderman' && dist3D > 10 && Math.random() < dt * 0.35) {
          if (this._tryTeleport(world, px, pz, 2.2, 5.0)) {
            particleManager?.spawnPortal(this.x, this.y, this.z, 8);
          }
        }

        // Melee attack
        const reach = this.type === 'spider' ? 1.85 : 1.75;
        if (dist3D <= reach && this.attackCooldown <= 0 && this.attackDamage > 0) {
          this.attackCooldown = 1.0;
          player.applyDamage(this.attackDamage, this.type);
          particleManager?.spawnHit(px, py + 0.9, pz, 5);
        }
      }
    } else {
      // Passive wander or panic sprint
      this.isIgnited = false;
      this.fuseTimer = Math.max(0, this.fuseTimer - dt * 2);

      if (this.panicTimer > 0) {
        this.panicTimer -= dt;
        moveSpeed *= 1.55;
        moveDirX = Math.sin(this.wanderYaw);
        moveDirZ = Math.cos(this.wanderYaw);
        if (Math.random() < dt * 1.4) {
          this.wanderYaw += (Math.random() - 0.5) * 2.4;
        }
      } else {
        this.wanderTimer -= dt;
        if (this.wanderTimer <= 0) {
          if (this.idlePauseTimer <= 0 && Math.random() < 0.45) {
            this.idlePauseTimer = 1.5 + Math.random() * 2.5;
            this.wanderTimer = this.idlePauseTimer;
          } else {
            this.idlePauseTimer = 0;
            this.wanderYaw += (Math.random() - 0.5) * Math.PI * 1.4;
            this.wanderTimer = 2.0 + Math.random() * 3.0;
          }
        }
        if (this.idlePauseTimer <= 0) {
          moveDirX = Math.sin(this.wanderYaw);
          moveDirZ = Math.cos(this.wanderYaw);
          this.yaw = this.wanderYaw;
        } else {
          this.idlePauseTimer -= dt;
        }
      }
    }

    // Apply steering blend into horizontal velocity (preserves knockback)
    const targetVx = moveDirX * moveSpeed;
    const targetVz = moveDirZ * moveSpeed;
    const steerRate = this.onGround ? Math.min(1, dt * 8) : Math.min(1, dt * 3);
    this.vx += (targetVx - this.vx) * steerRate;
    this.vz += (targetVz - this.vz) * steerRate;

    // Gravity / Chicken slow-fall / Swimming
    if (this.inWater) {
      this.vy -= 5.0 * dt;
      this.vy = Math.max(-2.2, Math.min(3.5, this.vy + 14.0 * dt));
    } else if (this.type === 'chicken' && this.vy < -1.8) {
      this.vy = -1.8; // Chicken flaps gently down
    } else {
      this.vy -= 26.0 * dt;
    }

    // Axis-separated AABB terrain movement + auto-jump over 1-block steps
    this._moveAndCollide(dt, world, moveDirX, moveDirZ);

    // Sync visual transform, animations, Creeper swell, and voxel lighting
    this._syncVisual(dt);
    this._updateLightingAndFlash(world, skyInfo, false);
  }

  _collides(world, cx, minY, cz) {
    const hw = this.halfWidth;
    const minX = Math.floor(cx - hw);
    const maxX = Math.floor(cx + hw);
    const minBy = Math.floor(minY + 0.01);
    const maxBy = Math.floor(minY + this.height - 0.01);
    const minZ = Math.floor(cz - hw);
    const maxZ = Math.floor(cz + hw);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minBy; y <= maxBy; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          if (BlockRegistry.isSolid(world.getBlock(x, y, z))) return true;
        }
      }
    }
    return false;
  }

  _moveAndCollide(dt, world, wishX, wishZ) {
    let hitWall = false;
    const nextX = this.x + this.vx * dt;
    if (!this._collides(world, nextX, this.y, this.z)) {
      this.x = nextX;
    } else {
      hitWall = true;
      this.vx = 0;
    }

    const nextZ = this.z + this.vz * dt;
    if (!this._collides(world, this.x, this.y, nextZ)) {
      this.z = nextZ;
    } else {
      hitWall = true;
      this.vz = 0;
    }

    // Jump when walking into a 1-block obstacle, or Spider wall-climbing
    if (hitWall && (Math.abs(wishX) > 0.05 || Math.abs(wishZ) > 0.05)) {
      if (this.type === 'spider') {
        this.vy = Math.max(this.vy, 4.4);
      } else if (this.onGround || this.inWater) {
        this.vy = 7.6;
        this.onGround = false;
      } else {
        this.wanderYaw += Math.PI * 0.7;
      }
    }

    const nextY = this.y + this.vy * dt;
    if (!this._collides(world, this.x, nextY, this.z)) {
      this.y = nextY;
      this.onGround = false;
    } else {
      if (this.vy < 0) {
        this.y = Math.floor(nextY) + 1;
        if (this.y < 1 && !this._collides(world, this.x, this.y, this.z)) {
          // fine
        }
        // Check fall damage
        const fallen = this.fallStartY - this.y;
        if (fallen > 3.5 && !this.inWater && this.type !== 'chicken') {
          const dmg = Math.floor(fallen - 3);
          if (dmg > 0) this.hurt(dmg, 0, 0, 0, false, false);
        }
        this.onGround = true;
        this.fallStartY = this.y;
      }
      this.vy = 0;
    }
    if (this.y > this.fallStartY) {
      this.fallStartY = this.y;
    }
  }

  _syncVisual(dt) {
    this.visual.root.position.set(this.x, this.y, this.z);
    this.visual.root.rotation.y = this.yaw;

    const hSpeed = Math.hypot(this.vx, this.vz);
    if (hSpeed > 0.2) {
      this.walkPhase += dt * hSpeed * 3.1;
    } else {
      this.walkPhase *= 0.85;
    }

    const swing = Math.sin(this.walkPhase) * Math.min(0.85, hSpeed * 0.25);
    const legs = this.visual.legs;
    for (let i = 0; i < legs.length; i++) {
      legs[i].rotation.x = (i % 2 === 0 ? 1 : -1) * swing;
    }

    // Chicken flaps wings when falling
    if (this.type === 'chicken' && this.visual.leftArm && this.visual.rightArm) {
      const flap = !this.onGround ? Math.sin(performance.now() * 0.025) * 0.9 + 0.5 : 0;
      this.visual.leftArm.rotation.z = flap;
      this.visual.rightArm.rotation.z = -flap;
    } else if (this.type === 'enderman' && this.visual.leftArm && this.visual.rightArm) {
      this.visual.leftArm.rotation.x = this.aggro ? -Math.PI * 0.45 : swing * 0.35;
      this.visual.rightArm.rotation.x = this.aggro ? -Math.PI * 0.45 : -swing * 0.35;
    }

    // Creeper fuse swell
    if (this.type === 'creeper') {
      const f = this.isIgnited ? (this.fuseTimer / CREEPER_FUSE_SEC) : 0;
      const sxz = 1 + f * 0.38;
      const sy = 1 - f * 0.12;
      this.visual.bodyGroup.scale.set(sxz, sy, sxz);
    }
  }

  _updateLightingAndFlash(world, skyInfo, isDying) {
    const bx = Math.floor(this.x);
    const by = Math.max(0, Math.min(WORLD_HEIGHT - 1, Math.floor(this.y + this.height * 0.5)));
    const bz = Math.floor(this.z);
    const skyLvl = world ? world.getSkyLight(bx, by, bz) : 15;
    const blkLvl = world ? world.getBlockLight(bx, by, bz) : 0;

    const sunInt = skyInfo ? skyInfo.sunIntensity : 1.0;
    const skyL = Math.pow(0.82, 15 - skyLvl) * sunInt;
    const blkL = Math.pow(0.87, 15 - blkLvl);
    const lum = Math.max(0.11, Math.min(1.0, Math.max(skyL, blkL)));

    const creeperBlink = this.type === 'creeper' && this.isIgnited && (Math.floor((this.fuseTimer * 16) % 2) === 0);
    const redFlash = this.hitFlashTimer > 0 || isDying;

    for (const part of this.visual.parts) {
      if (part.emissive) {
        part.mat.color.copy(part.baseColor);
        continue;
      }
      if (creeperBlink) {
        part.mat.color.setRGB(1, 1, 1);
      } else if (redFlash) {
        part.mat.color.setRGB(
          Math.min(1, part.baseColor.r * lum * 1.45 + 0.42),
          part.baseColor.g * lum * 0.38,
          part.baseColor.b * lum * 0.38
        );
      } else {
        part.mat.color.copy(part.baseColor).multiplyScalar(lum);
      }
    }
  }

  serialize() {
    return {
      type: this.type,
      x: Number(this.x.toFixed(2)),
      y: Number(this.y.toFixed(2)),
      z: Number(this.z.toFixed(2)),
      hp: this.hp,
      yaw: Number(this.yaw.toFixed(2)),
      sheared: this.sheared,
    };
  }

  dispose(scene) {
    scene.remove(this.visual.root);
    for (const d of this.visual.disposables) {
      d.dispose?.();
    }
  }
}
