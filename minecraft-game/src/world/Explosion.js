import * as THREE from '../../vendor/three.module.min.js';
import { BLOCK_IDS, BlockRegistry } from '../blocks/BlockRegistry.js';
import { TNT_EXPLOSION_POWER, TNT_FUSE_TICKS, WORLD_HEIGHT } from '../constants.js';

/**
 * Triggers a Minecraft-style raycast explosion in the world.
 * Damages blocks according to blast resistance, spawns chain-reaction TNT,
 * drops a fraction of destroyed blocks, and applies ray-occluded damage + knockback.
 */
export function triggerExplosion({
  world,
  x,
  y,
  z,
  power = 4.0,
  itemManager = null,
  entityManager = null,
  player = null,
  particleManager = null,
  fallingManager = null,
  blockEntityManager = null,
  sourceMob = null,
}) {
  if (!world) return { destroyedCount: 0 };

  const destroyed = new Map(); // key "x,y,z" -> { bx, by, bz, id }
  const step = 0.32;
  const grid = 8; // 8x8x8 outer cube rays = 296 rays -> smooth sphere & <1ms on mobile

  for (let gx = 0; gx < grid; gx++) {
    for (let gy = 0; gy < grid; gy++) {
      for (let gz = 0; gz < grid; gz++) {
        if (gx !== 0 && gx !== grid - 1 && gy !== 0 && gy !== grid - 1 && gz !== 0 && gz !== grid - 1) {
          continue;
        }
        let rdx = (gx / (grid - 1)) * 2 - 1;
        let rdy = (gy / (grid - 1)) * 2 - 1;
        let rdz = (gz / (grid - 1)) * 2 - 1;
        const rLen = Math.hypot(rdx, rdy, rdz);
        if (rLen < 1e-5) continue;
        rdx /= rLen;
        rdy /= rLen;
        rdz /= rLen;

        let rayPower = power * (0.7 + Math.random() * 0.6);
        let cx = x;
        let cy = y;
        let cz = z;

        while (rayPower > 0) {
          const bx = Math.floor(cx);
          const by = Math.floor(cy);
          const bz = Math.floor(cz);
          if (by <= 0 || by >= WORLD_HEIGHT) break;

          const blockId = world.getBlock(bx, by, bz);
          if (blockId !== BLOCK_IDS.AIR) {
            const res = BlockRegistry.getBlastResistance(blockId);
            rayPower -= (res + 0.3) * 0.3;
            if (rayPower > 0 && blockId !== BLOCK_IDS.BEDROCK && blockId !== BLOCK_IDS.OBSIDIAN && !BlockRegistry.isLiquid(blockId)) {
              const key = `${bx},${by},${bz}`;
              if (!destroyed.has(key)) {
                destroyed.set(key, { bx, by, bz, id: blockId });
              }
            }
          }

          cx += rdx * step;
          cy += rdy * step;
          cz += rdz * step;
          rayPower -= step * 0.75;
        }
      }
    }
  }

  let destroyedCount = 0;
  for (const { bx, by, bz, id } of destroyed.values()) {
    if (blockEntityManager) {
      blockEntityManager.onBlockRemoved?.(bx, by, bz, itemManager);
    }

    world.setBlock(bx, by, bz, BLOCK_IDS.AIR, false, true);
    destroyedCount++;

    if (id === BLOCK_IDS.TNT && entityManager) {
      entityManager.spawnPrimedTnt(bx + 0.5, by, bz + 0.5, 10 + Math.floor(Math.random() * 20));
    } else if (itemManager && Math.random() < (1 / Math.max(1, power * 0.8))) {
      const drops = BlockRegistry.getHarvestDrops(id, null);
      for (const drop of drops) {
        if (drop && drop.id > 0 && drop.count > 0) {
          itemManager.spawnDrop(drop.id, bx + 0.5, by + 0.4, bz + 0.5, drop.count);
        }
      }
    }
  }

  if (destroyedCount > 0) {
    for (const { bx, by, bz } of destroyed.values()) {
      world.lighting.onBlockChanged(world, bx, by, bz);
      if (fallingManager) {
        fallingManager.scheduleAround(bx, by, bz);
      }
      if (world.fluids) {
        world.fluids.scheduleAround(bx, by, bz, world);
      }
    }
  }

  const damageRadius = power * 2.0;
  const _exposure = (ex, ey, ez) => {
    const dx = ex - x;
    const dy = ey - y;
    const dz = ez - z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist < 0.05) return 1.0;
    const steps = Math.min(18, Math.ceil(dist / 0.45));
    let clear = 0;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const sx = x + dx * t;
      const sy = y + dy * t;
      const sz = z + dz * t;
      const bid = world.getBlock(Math.floor(sx), Math.floor(sy), Math.floor(sz));
      if (!BlockRegistry.isSolid(bid)) clear++;
    }
    return clear / steps;
  };

  // Hurt & knockback player
  if (player && player.gameMode !== 'creative') {
    const px = player.position.x;
    const py = player.position.y + player.height * 0.5;
    const pz = player.position.z;
    const dist = Math.hypot(px - x, py - y, pz - z);
    if (dist <= damageRadius) {
      const normDist = dist / damageRadius;
      const exp = _exposure(px, py, pz);
      const impact = (1.0 - normDist) * exp;
      const dmg = Math.floor((impact * impact + impact) * 7.0 * power + 1.0);
      if (dmg > 0) {
        player.applyDamage(dmg, 'explosion');
      }
      if (dist > 0.01) {
        const push = Math.max(0.25, impact) * 14.0;
        player.velocity.x += ((px - x) / dist) * push;
        player.velocity.y = Math.max(player.velocity.y, 4.5 + impact * 6.5);
        player.velocity.z += ((pz - z) / dist) * push;
      }
    }
  }

  // Hurt & knockback nearby mobs
  if (entityManager) {
    for (const mob of entityManager.mobs) {
      if (!mob || !mob.alive || mob.dying || mob === sourceMob) continue;
      const mx = mob.x;
      const my = mob.y + mob.height * 0.5;
      const mz = mob.z;
      const dist = Math.hypot(mx - x, my - y, mz - z);
      if (dist <= damageRadius) {
        const normDist = dist / damageRadius;
        const exp = _exposure(mx, my, mz);
        const impact = (1.0 - normDist) * exp;
        const dmg = Math.floor((impact * impact + impact) * 7.0 * power + 1.0);
        if (dmg > 0) {
          mob.hurt(dmg, mx - x, mz - z, Math.max(0.4, impact * 2.2), false);
        }
      }
    }
  }

  // Destroy nearby item drops inside inner blast sphere (authentic Creeper/TNT behavior!)
  if (itemManager && Array.isArray(itemManager.entities)) {
    const itemDestroySq = (power * 1.15) * (power * 1.15);
    for (let i = itemManager.entities.length - 1; i >= 0; i--) {
      const it = itemManager.entities[i];
      const dx = it.x - x;
      const dy = it.y - y;
      const dz = it.z - z;
      if (dx * dx + dy * dy + dz * dz < itemDestroySq) {
        itemManager.scene.remove(it.mesh);
        itemManager.entities.splice(i, 1);
      }
    }
  }

  particleManager?.spawnExplosion(x, y, z, power);
  return { destroyedCount };
}

/**
 * Ignited TNT block entity: pops upward, ticks 4.0s (80 ticks), flashes white, and detonates.
 */
export class PrimedTNTEntity {
  constructor(scene, atlas, x, y, z, fuseTicks = TNT_FUSE_TICKS) {
    this.x = x;
    this.y = y;
    this.z = z;
    const angle = Math.random() * Math.PI * 2;
    this.vx = Math.sin(angle) * 1.1;
    this.vy = 3.2;
    this.vz = Math.cos(angle) * 1.1;
    this.fuseSec = (Math.max(1, fuseTicks) / 20);
    this.alive = true;
    this.smokeTimer = 0;

    const geom = new THREE.BoxGeometry(0.98, 0.98, 0.98);
    const sideUv = atlas.getUV('tnt_side');
    const topUv = atlas.getUV('tnt_top');
    const bottomUv = atlas.getUV('tnt_bottom');

    const pos = geom.attributes.position;
    const norm = geom.attributes.normal;
    const uv = geom.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const ny = norm.getY(i);
      const u = uv.getX(i);
      const v = uv.getY(i);
      const rect = ny > 0.5 ? topUv : (ny < -0.5 ? bottomUv : sideUv);
      uv.setXY(i, rect.u0 + u * (rect.u1 - rect.u0), rect.vBottom + v * (rect.vTop - rect.vBottom));
    }

    this.texturedMat = new THREE.MeshBasicMaterial({ map: atlas.texture, fog: true });
    this.flashMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true });
    this.mesh = new THREE.Mesh(geom, this.texturedMat);
    this.mesh.position.set(x, y + 0.49, z);
    scene.add(this.mesh);
  }

  update(dt, world, particleManager = null) {
    if (!this.alive) return false;
    this.fuseSec -= dt;
    this.smokeTimer += dt;
    if (this.smokeTimer >= 0.12) {
      this.smokeTimer = 0;
      particleManager?.spawnSmoke(this.x, this.y + 1.02, this.z, 2);
    }

    this.vy -= 22.0 * dt;
    const nx = this.x + this.vx * dt;
    const nz = this.z + this.vz * dt;
    if (!BlockRegistry.isSolid(world.getBlock(Math.floor(nx), Math.floor(this.y + 0.1), Math.floor(this.z)))) {
      this.x = nx;
    } else {
      this.vx = 0;
    }
    if (!BlockRegistry.isSolid(world.getBlock(Math.floor(this.x), Math.floor(this.y + 0.1), Math.floor(nz)))) {
      this.z = nz;
    } else {
      this.vz = 0;
    }

    const ny = this.y + this.vy * dt;
    if (this.vy < 0 && BlockRegistry.isSolid(world.getBlock(Math.floor(this.x), Math.floor(ny), Math.floor(this.z)))) {
      this.y = Math.floor(ny) + 1;
      this.vy = 0;
      this.vx *= 0.7;
      this.vz *= 0.7;
    } else {
      this.y = ny;
    }

    this.mesh.position.set(this.x, this.y + 0.49, this.z);

    // Classic TNT white blink in final 4s & rapid swell just before detonation
    const ticksLeft = this.fuseSec * 20;
    const flash = (Math.floor(ticksLeft / 4) % 2) === 0;
    this.mesh.material = flash ? this.flashMat : this.texturedMat;
    if (this.fuseSec < 0.25) {
      const s = 1 + (0.25 - this.fuseSec) * 1.4;
      this.mesh.scale.set(s, s, s);
    } else {
      this.mesh.scale.set(1, 1, 1);
    }

    if (this.fuseSec <= 0) {
      this.alive = false;
      return true; // Explode!
    }
    return false;
  }

  getPower() {
    return TNT_EXPLOSION_POWER;
  }

  dispose(scene) {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.texturedMat.dispose();
    this.flashMat.dispose();
  }
}
