import * as THREE from '../../vendor/three.module.min.js';
import { BlockRegistry } from '../blocks/BlockRegistry.js';
import { ITEM_IDS } from '../items/ItemIds.js';

function createArrowMesh() {
  const group = new THREE.Group();
  const shaftMat = new THREE.MeshBasicMaterial({ color: 0x8f6b43, fog: true });
  const tipMat = new THREE.MeshBasicMaterial({ color: 0xb8c0c8, fog: true });
  const fletchMat = new THREE.MeshBasicMaterial({ color: 0xf4f4f0, fog: true });

  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.72), shaftMat);
  const tip = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.14), tipMat);
  tip.position.z = 0.38;
  const f1 = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.03, 0.18), fletchMat);
  f1.position.z = -0.32;
  const f2 = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.18, 0.18), fletchMat);
  f2.position.z = -0.32;

  group.add(shaft, tip, f1, f2);
  group._disposables = [shaft.geometry, tip.geometry, f1.geometry, f2.geometry, shaftMat, tipMat, fletchMat];
  return group;
}

function createOrbProjectileMesh(colorHex, size = 0.26) {
  const geom = new THREE.BoxGeometry(size, size, size);
  const mat = new THREE.MeshBasicMaterial({ color: colorHex, fog: true });
  const mesh = new THREE.Mesh(geom, mat);
  mesh._disposables = [geom, mat];
  return mesh;
}

export class ProjectileEntity {
  constructor(scene, {
    kind = 'arrow', // 'arrow' | 'ender_pearl' | 'egg'
    x, y, z,
    vx, vy, vz,
    damage = 6,
    crit = false,
    fromPlayer = true,
    pickupable = true,
  }) {
    this.kind = kind;
    this.x = x;
    this.y = y;
    this.z = z;
    this.vx = vx;
    this.vy = vy;
    this.vz = vz;
    this.damage = damage;
    this.crit = crit;
    this.fromPlayer = fromPlayer;
    this.pickupable = pickupable;
    this.stuck = false;
    this.age = 0;
    this.alive = true;

    if (kind === 'arrow') {
      this.mesh = createArrowMesh();
      this.gravity = 18.5;
    } else if (kind === 'ender_pearl') {
      this.mesh = createOrbProjectileMesh(0x1f7b6b, 0.26);
      this.gravity = 16.5;
    } else {
      this.mesh = createOrbProjectileMesh(0xe9dec2, 0.22);
      this.gravity = 16.5;
    }

    this.mesh.position.set(x, y, z);
    this._syncOrientation();
    scene.add(this.mesh);
  }

  _syncOrientation() {
    if (this.kind === 'arrow') {
      const horiz = Math.hypot(this.vx, this.vz);
      const yaw = Math.atan2(this.vx, this.vz);
      const pitch = -Math.atan2(this.vy, Math.max(0.001, horiz));
      this.mesh.rotation.set(pitch, yaw, 0, 'YXZ');
    } else {
      this.mesh.rotation.x += 0.14;
      this.mesh.rotation.y += 0.18;
    }
  }

  _pointHitsAABB(px, py, pz, cx, minY, cz, hw, h) {
    return (
      px >= cx - hw && px <= cx + hw &&
      py >= minY && py <= minY + h &&
      pz >= cz - hw && pz <= cz + hw
    );
  }

  update(dt, {
    world,
    player = null,
    mobs = [],
    particleManager = null,
    itemManager = null,
    onSpawnChicken = null,
  }) {
    if (!this.alive) return false;
    this.age += dt;

    if (this.stuck) {
      if (this.age > 45) {
        this.alive = false;
        return false;
      }
      // If block under arrow was broken, resume falling
      const aheadX = this.x + Math.sin(this.mesh.rotation.y) * 0.25;
      const aheadY = this.y - Math.sin(this.mesh.rotation.x) * 0.25;
      const aheadZ = this.z + Math.cos(this.mesh.rotation.y) * 0.25;
      if (!BlockRegistry.isSolid(world.getBlock(Math.floor(aheadX), Math.floor(aheadY), Math.floor(aheadZ)))) {
        this.stuck = false;
        this.vx = 0;
        this.vy = -0.5;
        this.vz = 0;
      } else if (this.pickupable && this.kind === 'arrow' && player && !player.isDead && player.inventory) {
        const dist = Math.hypot(player.position.x - this.x, (player.position.y + 0.9) - this.y, player.position.z - this.z);
        if (dist < 1.35 && this.age > 0.35) {
          const rem = player.inventory.addItem(ITEM_IDS.ARROW, 1);
          if (rem === 0) {
            this.alive = false;
            return false;
          }
        }
      }
      return true;
    }

    if (this.age > 25) {
      this.alive = false;
      return false;
    }

    const prevX = this.x;
    const prevY = this.y;
    const prevZ = this.z;

    this.vy -= this.gravity * dt;
    const drag = Math.exp(-0.22 * dt);
    this.vx *= drag;
    this.vz *= drag;

    const nextX = this.x + this.vx * dt;
    const nextY = this.y + this.vy * dt;
    const nextZ = this.z + this.vz * dt;

    if (this.kind === 'arrow' && this.crit && Math.random() < 0.65) {
      particleManager?.spawnCrit(this.x, this.y, this.z, 1);
    }

    // Sub-step collision along flight segment so fast arrows never tunnel through mobs or 1-block walls
    const subSteps = 4;
    for (let s = 1; s <= subSteps; s++) {
      const t = s / subSteps;
      const sx = prevX + (nextX - prevX) * t;
      const sy = prevY + (nextY - prevY) * t;
      const sz = prevZ + (nextZ - prevZ) * t;

      // 1. Mob hit check
      if (this.age > 0.06 || !this.fromPlayer) {
        for (const mob of mobs) {
          if (!mob || !mob.alive || mob.dying) continue;
          if (!this.fromPlayer && mob.type === 'skeleton' && this.age < 0.25) continue;
          if (this._pointHitsAABB(sx, sy, sz, mob.x, mob.y, mob.z, mob.halfWidth + 0.1, mob.height + 0.08)) {
            if (this.kind === 'arrow') {
              const finalDmg = Math.max(1, Math.round(this.damage));
              mob.hurt(finalDmg, this.vx, this.vz, 0.9, this.crit, this.fromPlayer);
              if (this.crit) {
                particleManager?.spawnCrit(sx, sy, sz, 10);
              } else {
                particleManager?.spawnHit(sx, sy, sz, 6);
              }
            } else if (this.kind === 'egg') {
              mob.hurt(0, this.vx, this.vz, 0.45, false, this.fromPlayer);
              this._breakEgg(sx, sy, sz, particleManager, onSpawnChicken);
            } else if (this.kind === 'ender_pearl') {
              mob.hurt(0, this.vx, this.vz, 0.35, false, this.fromPlayer);
              this._teleportPlayer(sx, sy, sz, world, player, particleManager);
            }
            this.alive = false;
            return false;
          }
        }
      }

      // 2. Player hit check (enemy arrows)
      if (!this.fromPlayer && player && !player.isDead && player.gameMode !== 'creative') {
        if (this._pointHitsAABB(sx, sy, sz, player.position.x, player.position.y, player.position.z, player.halfWidth + 0.08, player.height)) {
          const finalDmg = Math.max(1, Math.round(this.damage));
          player.applyDamage(finalDmg, 'arrow');
          particleManager?.spawnHit(sx, sy, sz, 6);
          this.alive = false;
          return false;
        }
      }

      // 3. Solid block collision
      const bx = Math.floor(sx);
      const by = Math.floor(sy);
      const bz = Math.floor(sz);
      const bid = world.getBlock(bx, by, bz);
      if (BlockRegistry.isSolid(bid)) {
        if (this.kind === 'arrow') {
          this.x = prevX + (nextX - prevX) * ((s - 0.6) / subSteps);
          this.y = prevY + (nextY - prevY) * ((s - 0.6) / subSteps);
          this.z = prevZ + (nextZ - prevZ) * ((s - 0.6) / subSteps);
          this.stuck = true;
          this.age = 0;
          this.mesh.position.set(this.x, this.y, this.z);
          return true;
        } else if (this.kind === 'egg') {
          this._breakEgg(prevX, prevY, prevZ, particleManager, onSpawnChicken);
          this.alive = false;
          return false;
        } else if (this.kind === 'ender_pearl') {
          const safeX = prevX + (nextX - prevX) * ((s - 1) / subSteps);
          const safeY = prevY + (nextY - prevY) * ((s - 1) / subSteps);
          const safeZ = prevZ + (nextZ - prevZ) * ((s - 1) / subSteps);
          this._teleportPlayer(safeX, safeY, safeZ, world, player, particleManager);
          this.alive = false;
          return false;
        }
      }
    }

    this.x = nextX;
    this.y = nextY;
    this.z = nextZ;
    this.mesh.position.set(this.x, this.y, this.z);
    this._syncOrientation();
    return true;
  }

  _breakEgg(x, y, z, particleManager, onSpawnChicken) {
    particleManager?.spawnSplash(x, y, z, 6);
    if (Math.random() < 0.125) {
      onSpawnChicken?.(x, y, z);
    }
  }

  _teleportPlayer(x, y, z, world, player, particleManager) {
    if (!player || player.isDead) return;
    // Find safe non-solid spot near impact
    let tx = x;
    let ty = Math.max(1, y);
    let tz = z;
    for (let dy = 0; dy <= 2; dy++) {
      if (!BlockRegistry.isSolid(world.getBlock(Math.floor(tx), Math.floor(ty + dy), Math.floor(tz))) &&
          !BlockRegistry.isSolid(world.getBlock(Math.floor(tx), Math.floor(ty + dy + 1), Math.floor(tz)))) {
        ty += dy;
        break;
      }
    }
    particleManager?.spawnPortal(player.position.x, player.position.y + 0.9, player.position.z, 12);
    player.position.set(tx, ty, tz);
    player.velocity.set(0, 0, 0);
    player.fallStartY = ty;
    particleManager?.spawnPortal(tx, ty + 0.9, tz, 14);
    if (player.gameMode !== 'creative') {
      player.applyDamage(5, 'ender_pearl');
    }
  }

  dispose(scene) {
    scene.remove(this.mesh);
    if (this.mesh._disposables) {
      for (const d of this.mesh._disposables) d.dispose?.();
    }
  }
}
