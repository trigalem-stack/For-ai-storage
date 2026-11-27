import { BLOCK_IDS, BlockRegistry } from '../blocks/BlockRegistry.js';
import { ITEM_IDS } from '../items/ItemIds.js';
import { ItemRegistry } from '../items/ItemRegistry.js';
import {
  ARROW_BASE_DAMAGE,
  HOSTILE_MOB_CAP,
  MOB_DESPAWN_DIST,
  MOB_SPAWN_MAX_DIST,
  MOB_SPAWN_MIN_DIST,
  PASSIVE_MOB_CAP,
  TNT_FUSE_TICKS,
  WORLD_HEIGHT,
} from '../constants.js';
import { triggerExplosion, PrimedTNTEntity } from '../world/Explosion.js';
import { Mob } from './Mob.js';
import { ProjectileEntity } from './ProjectileEntity.js';
import { XPOrbEntity } from './XPOrbEntity.js';

const PASSIVE_POOL = ['pig', 'cow', 'sheep', 'chicken'];
const HOSTILE_WEIGHTS = [
  { type: 'zombie', w: 30 },
  { type: 'skeleton', w: 26 },
  { type: 'spider', w: 20 },
  { type: 'creeper', w: 18 },
  { type: 'enderman', w: 6 },
];

function pickHostileType() {
  let total = 0;
  for (const h of HOSTILE_WEIGHTS) total += h.w;
  let r = Math.random() * total;
  for (const h of HOSTILE_WEIGHTS) {
    r -= h.w;
    if (r <= 0) return h.type;
  }
  return 'zombie';
}

export class EntityManager {
  constructor(scene, atlas) {
    this.scene = scene;
    this.atlas = atlas;
    this.mobs = [];
    this.projectiles = [];
    this.xpOrbs = [];
    this.primedTnts = [];
    this.spawnTimer = 1.2;
    this._initialPassiveDone = false;
  }

  spawnMob(type, x, y, z, extras = {}) {
    const mob = new Mob(this.scene, type, x, y, z, extras);
    this.mobs.push(mob);
    return mob;
  }

  spawnXpOrbs(x, y, z, totalXp) {
    let rem = Math.max(0, totalXp | 0);
    while (rem > 0) {
      const val = rem >= 11 ? 7 : rem >= 5 ? 3 : 1;
      rem -= val;
      const orb = new XPOrbEntity(
        this.scene,
        x + (Math.random() - 0.5) * 0.4,
        y + 0.3,
        z + (Math.random() - 0.5) * 0.4,
        val
      );
      this.xpOrbs.push(orb);
    }
  }

  spawnPrimedTnt(x, y, z, fuseTicks = TNT_FUSE_TICKS) {
    const tnt = new PrimedTNTEntity(this.scene, this.atlas, x, y, z, fuseTicks);
    this.primedTnts.push(tnt);
    return tnt;
  }

  shootPlayerArrow(player, charge01) {
    if (!player) return null;
    const ch = Math.max(0.1, Math.min(1.0, charge01));
    const eye = player.getEyeOrigin();
    const look = player.getLookDirection();
    const speed = 12 + ch * 36;
    const isCrit = ch >= 0.96;
    const dmg = Math.round(ARROW_BASE_DAMAGE * ch + (isCrit ? 3 : 1));
    const proj = new ProjectileEntity(this.scene, {
      kind: 'arrow',
      x: eye.x + look.x * 0.45,
      y: eye.y - 0.08 + look.y * 0.45,
      z: eye.z + look.z * 0.45,
      vx: look.x * speed,
      vy: look.y * speed + 1.1,
      vz: look.z * speed,
      damage: dmg,
      crit: isCrit,
      fromPlayer: true,
      pickupable: player.gameMode !== 'creative',
    });
    this.projectiles.push(proj);
    return proj;
  }

  throwPlayerProjectile(player, kind) {
    if (!player) return null;
    const eye = player.getEyeOrigin();
    const look = player.getLookDirection();
    const speed = kind === 'ender_pearl' ? 24 : 21;
    const proj = new ProjectileEntity(this.scene, {
      kind,
      x: eye.x + look.x * 0.45,
      y: eye.y - 0.08 + look.y * 0.45,
      z: eye.z + look.z * 0.45,
      vx: look.x * speed,
      vy: look.y * speed + 1.8,
      vz: look.z * speed,
      damage: 0,
      crit: false,
      fromPlayer: true,
      pickupable: false,
    });
    this.projectiles.push(proj);
    return proj;
  }

  _shootSkeletonArrow(mob, player) {
    const sx = mob.x;
    const sy = mob.y + mob.height * 0.8;
    const sz = mob.z;
    const tx = player.position.x;
    const ty = player.position.y + 1.0;
    const tz = player.position.z;
    const dx = tx - sx;
    const dy = ty - sy;
    const dz = tz - sz;
    const horiz = Math.hypot(dx, dz);
    const speed = 26;
    const flightTime = horiz / speed;
    const aimVy = (dy / Math.max(0.2, flightTime)) + 0.5 * 18.5 * flightTime;
    const vx = (dx / Math.max(0.1, horiz)) * speed + (Math.random() - 0.5) * 1.6;
    const vz = (dz / Math.max(0.1, horiz)) * speed + (Math.random() - 0.5) * 1.6;
    const vy = Math.min(18, Math.max(-12, aimVy));

    const proj = new ProjectileEntity(this.scene, {
      kind: 'arrow',
      x: sx,
      y: sy,
      z: sz,
      vx,
      vy,
      vz,
      damage: 3,
      crit: false,
      fromPlayer: false,
      pickupable: false,
    });
    this.projectiles.push(proj);
  }

  tryMeleeAttack(player, mob, particleManager = null) {
    if (!player || !mob || !mob.alive || mob.dying) return false;
    if (mob.hurtCooldown > 0) return false;

    const held = player.getHeldStack();
    const baseDmg = ItemRegistry.getMeleeDamage(held ? held.id : 0);
    const isCrit = !player.onGround && !player.inWater && player.velocity.y < -0.6;
    const finalDmg = isCrit ? Math.round(baseDmg * 1.5) : baseDmg;

    const dx = mob.x - player.position.x;
    const dz = mob.z - player.position.z;
    const knock = player.isSprinting ? 1.45 : 1.0;

    // Enderman sometimes teleports away right on sword swing or accepts hit
    const hit = mob.hurt(finalDmg, dx, dz, knock, isCrit, true);
    if (!hit) return false;

    if (isCrit) {
      particleManager?.spawnCrit(mob.x, mob.y + mob.height * 0.7, mob.z, 12);
    } else {
      particleManager?.spawnHit(mob.x, mob.y + mob.height * 0.7, mob.z, 7);
    }

    if (player.gameMode !== 'creative' && held && held.id > 0 && ItemRegistry.isTool(held.id) && player.inventory) {
      player.inventory.damageHeldTool(ItemRegistry.isWeapon(held.id) ? 1 : 2);
    }
    return true;
  }

  tryInteractMob(player, mob, particleManager = null, itemManager = null) {
    if (!player || !mob || !mob.alive || mob.dying) return false;
    const held = player.getHeldStack();
    if (!held || held.id <= 0) return false;

    // Milk cow with empty bucket
    if (mob.type === 'cow' && held.id === ITEM_IDS.BUCKET && mob.milkCooldown <= 0) {
      mob.milkCooldown = 2.5;
      if (player.gameMode !== 'creative' && player.inventory) {
        if (held.count <= 1) {
          player.inventory.setSlot(player.inventory.selectedSlot, ItemRegistry.createStack(ITEM_IDS.MILK_BUCKET, 1));
        } else {
          player.inventory.consumeHeld(1);
          const rem = player.inventory.addItem(ITEM_IDS.MILK_BUCKET, 1);
          if (rem > 0 && itemManager) {
            itemManager.spawnDrop(ITEM_IDS.MILK_BUCKET, player.position.x, player.position.y + 1.1, player.position.z, rem);
          }
        }
      } else if (player.inventory) {
        player.inventory.addItem(ITEM_IDS.MILK_BUCKET, 1);
      }
      particleManager?.spawnHeart(mob.x, mob.y + mob.height * 0.85, mob.z, 4);
      return true;
    }

    // Shear sheep with Shears
    if (mob.type === 'sheep' && !mob.sheared && held.id === ITEM_IDS.SHEARS) {
      mob.setSheared(true);
      const count = 1 + Math.floor(Math.random() * 3);
      if (itemManager) {
        itemManager.spawnDrop(BLOCK_IDS.WOOL_WHITE, mob.x, mob.y + 0.8, mob.z, count);
      }
      if (player.gameMode !== 'creative' && player.inventory) {
        player.inventory.damageHeldTool(1);
      }
      particleManager?.spawnHappy(mob.x, mob.y + 0.7, mob.z, 6);
      return true;
    }

    return false;
  }

  _tryNaturalSpawning(world, player, skyInfo) {
    if (!world || !player) return;
    const px = player.position.x;
    const pz = player.position.z;

    let passiveCount = 0;
    let hostileCount = 0;
    for (const m of this.mobs) {
      if (!m.alive) continue;
      if (m.hostile) hostileCount++;
      else passiveCount++;
    }

    const isDaylight = skyInfo ? skyInfo.sunIntensity > 0.36 : true;

    // Initial passive wildlife burst so fresh worlds quickly feel alive
    const minDist = (!this._initialPassiveDone && passiveCount === 0) ? 16 : MOB_SPAWN_MIN_DIST;
    const maxDist = (!this._initialPassiveDone && passiveCount === 0) ? 38 : MOB_SPAWN_MAX_DIST;
    this._initialPassiveDone = true;

    const findSurfaceSpot = (ang, dist, preferUnderground = false) => {
      const sx = Math.floor(px + Math.cos(ang) * dist);
      const sz = Math.floor(pz + Math.sin(ang) * dist);
      const cx = Math.floor(sx / 16);
      const cz = Math.floor(sz / 16);
      const chunk = world.getChunk(cx, cz);
      if (!chunk || !chunk.isGenerated) return null;

      if (!preferUnderground) {
        for (let y = WORLD_HEIGHT - 4; y >= 48; y--) {
          const floor = world.getBlock(sx, y - 1, sz);
          const b1 = world.getBlock(sx, y, sz);
          const b2 = world.getBlock(sx, y + 1, sz);
          if (BlockRegistry.isSolid(floor) && !BlockRegistry.isSolid(b1) && !BlockRegistry.isLiquid(b1) &&
              !BlockRegistry.isSolid(b2) && !BlockRegistry.isLiquid(b2)) {
            return { x: sx + 0.5, y, z: sz + 0.5, floor };
          }
        }
      } else {
        // Cave scan or surface scan
        const startY = Math.max(8, Math.min(WORLD_HEIGHT - 6, Math.floor(player.position.y + 18)));
        for (let y = startY; y >= 6; y--) {
          const floor = world.getBlock(sx, y - 1, sz);
          const b1 = world.getBlock(sx, y, sz);
          const b2 = world.getBlock(sx, y + 1, sz);
          if (BlockRegistry.isSolid(floor) && !BlockRegistry.isSolid(b1) && !BlockRegistry.isLiquid(b1) &&
              !BlockRegistry.isSolid(b2) && !BlockRegistry.isLiquid(b2)) {
            return { x: sx + 0.5, y, z: sz + 0.5, floor };
          }
        }
      }
      return null;
    };

    // Spawn passive pack on grass
    if (passiveCount < PASSIVE_MOB_CAP && Math.random() < 0.55) {
      const ang = Math.random() * Math.PI * 2;
      const dist = minDist + Math.random() * (maxDist - minDist);
      const spot = findSurfaceSpot(ang, dist, false);
      if (spot && spot.floor === BLOCK_IDS.GRASS) {
        const sky = world.getSkyLight(Math.floor(spot.x), spot.y, Math.floor(spot.z));
        if (sky >= 9) {
          const packType = PASSIVE_POOL[(Math.random() * PASSIVE_POOL.length) | 0];
          const packSize = 1 + Math.floor(Math.random() * 2);
          for (let i = 0; i < packSize; i++) {
            const ox = (Math.random() - 0.5) * 3.0;
            const oz = (Math.random() - 0.5) * 3.0;
            const bAt = world.getBlock(Math.floor(spot.x + ox), spot.y, Math.floor(spot.z + oz));
            const bFl = world.getBlock(Math.floor(spot.x + ox), spot.y - 1, Math.floor(spot.z + oz));
            if (!BlockRegistry.isSolid(bAt) && BlockRegistry.isSolid(bFl)) {
              this.spawnMob(packType, spot.x + ox, spot.y, spot.z + oz);
            }
          }
        }
      }
    }

    // Spawn hostile mobs in darkness (night surface or dark caves)
    if (hostileCount < HOSTILE_MOB_CAP) {
      const ang = Math.random() * Math.PI * 2;
      const dist = MOB_SPAWN_MIN_DIST + Math.random() * (MOB_SPAWN_MAX_DIST - MOB_SPAWN_MIN_DIST);
      const spot = findSurfaceSpot(ang, dist, isDaylight);
      if (spot) {
        const bx = Math.floor(spot.x);
        const bz = Math.floor(spot.z);
        const sky = world.getSkyLight(bx, spot.y, bz);
        const blk = world.getBlockLight(bx, spot.y, bz);
        const effectiveSky = isDaylight ? sky : Math.floor(sky * 0.2);
        if (Math.max(effectiveSky, blk) <= 7) {
          const hType = pickHostileType();
          // Endermen need 3 blocks headroom
          if (hType === 'enderman' && BlockRegistry.isSolid(world.getBlock(bx, spot.y + 2, bz))) {
            return;
          }
          this.spawnMob(hType, spot.x, spot.y, spot.z);
        }
      }
    }
  }

  update(dt, {
    world,
    player,
    skyInfo = null,
    itemManager = null,
    particleManager = null,
    fallingManager = null,
    blockEntityManager = null,
  }) {
    if (!world || !player) return;
    const isDaylight = skyInfo ? skyInfo.sunIntensity > 0.36 : true;

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 2.2;
      this._tryNaturalSpawning(world, player, skyInfo);
    }

    const despawnSq = MOB_DESPAWN_DIST * MOB_DESPAWN_DIST;
    const px = player.position.x;
    const pz = player.position.z;

    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const mob = this.mobs[i];
      const dx = mob.x - px;
      const dz = mob.z - pz;
      const distSq = dx * dx + dz * dz;

      if (mob.hostile && distSq > despawnSq) {
        mob.dispose(this.scene);
        this.mobs.splice(i, 1);
        continue;
      }

      if (mob.y < -12) {
        mob.dispose(this.scene);
        this.mobs.splice(i, 1);
        continue;
      }

      mob.update(dt, {
        world,
        player,
        skyInfo,
        isDaylight,
        particleManager,
        itemManager,
        onShootArrow: (shooter, target) => this._shootSkeletonArrow(shooter, target),
        onExplode: (creeper, power) => {
          triggerExplosion({
            world,
            x: creeper.x,
            y: creeper.y + 0.85,
            z: creeper.z,
            power,
            itemManager,
            entityManager: this,
            player,
            particleManager,
            fallingManager,
            blockEntityManager,
            sourceMob: creeper,
          });
        },
        onDie: (deadMob) => {
          const { drops, xp } = deadMob.getDrops();
          if (itemManager) {
            for (const d of drops) {
              itemManager.spawnDrop(d.id, deadMob.x, deadMob.y + 0.45, deadMob.z, d.count);
            }
          }
          if (xp > 0) {
            this.spawnXpOrbs(deadMob.x, deadMob.y + 0.35, deadMob.z, xp);
          }
        },
      });

      if (!mob.alive) {
        mob.dispose(this.scene);
        this.mobs.splice(i, 1);
      }
    }

    // Update projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      const keep = p.update(dt, {
        world,
        player,
        mobs: this.mobs,
        particleManager,
        itemManager,
        onSpawnChicken: (cx, cy, cz) => this.spawnMob('chicken', cx, cy, cz),
      });
      if (!keep || !p.alive) {
        p.dispose(this.scene);
        this.projectiles.splice(i, 1);
      }
    }

    // Update Primed TNT entities
    for (let i = this.primedTnts.length - 1; i >= 0; i--) {
      const tnt = this.primedTnts[i];
      const explode = tnt.update(dt, world, particleManager);
      if (explode) {
        const tx = tnt.x;
        const ty = tnt.y + 0.5;
        const tz = tnt.z;
        const pow = tnt.getPower();
        tnt.dispose(this.scene);
        this.primedTnts.splice(i, 1);
        triggerExplosion({
          world,
          x: tx,
          y: ty,
          z: tz,
          power: pow,
          itemManager,
          entityManager: this,
          player,
          particleManager,
          fallingManager,
          blockEntityManager,
        });
      }
    }

    // Update XP orbs
    for (let i = this.xpOrbs.length - 1; i >= 0; i--) {
      const orb = this.xpOrbs[i];
      const keep = orb.update(dt, world, player, (val) => {
        player.addXp?.(val);
      });
      if (!keep || !orb.alive) {
        orb.dispose(this.scene);
        this.xpOrbs.splice(i, 1);
      }
    }
  }

  serialize() {
    return {
      mobs: this.mobs.filter((m) => m.alive && !m.dying).slice(0, 48).map((m) => m.serialize()),
    };
  }

  restore(data) {
    this.clear();
    if (!data || !Array.isArray(data.mobs)) return;
    for (const m of data.mobs) {
      if (m && m.type && Number.isFinite(m.x) && Number.isFinite(m.y) && Number.isFinite(m.z)) {
        this.spawnMob(m.type, m.x, m.y, m.z, m);
      }
    }
  }

  clear() {
    for (const m of this.mobs) m.dispose(this.scene);
    this.mobs.length = 0;
    for (const p of this.projectiles) p.dispose(this.scene);
    this.projectiles.length = 0;
    for (const o of this.xpOrbs) o.dispose(this.scene);
    this.xpOrbs.length = 0;
    for (const t of this.primedTnts) t.dispose(this.scene);
    this.primedTnts.length = 0;
  }
}
