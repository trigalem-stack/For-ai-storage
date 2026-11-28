import * as THREE from '../../vendor/three.module.min.js';
import { BlockRegistry } from '../blocks/BlockRegistry.js';

const MAX_PARTICLES = 220;

export class ParticleManager {
  constructor(scene, atlas = null) {
    this.scene = scene;
    this.atlas = atlas;
    this.mode = 'all'; // 'all' | 'minimal' | 'off'

    this.sharedGeom = new THREE.BoxGeometry(1, 1, 1);
    this.materialPool = new Map();
    this.particles = [];
    this.pool = [];
  }

  setMode(mode) {
    this.mode = (mode === 'off' || mode === 'minimal') ? mode : 'all';
    if (this.mode === 'off') this.clear();
  }

  _getMaterial(hexColor) {
    const key = (hexColor >>> 0) & 0xffffff;
    let mat = this.materialPool.get(key);
    if (!mat) {
      if (this.materialPool.size > 140) {
        // Keep material cache bounded
        const firstKey = this.materialPool.keys().next().value;
        const old = this.materialPool.get(firstKey);
        old?.dispose();
        this.materialPool.delete(firstKey);
      }
      mat = new THREE.MeshBasicMaterial({ color: key, fog: true });
      this.materialPool.set(key, mat);
    }
    return mat;
  }

  _scaleCount(count) {
    if (this.mode === 'off') return 0;
    if (this.mode === 'minimal') return Math.max(1, Math.floor(count * 0.4));
    return count;
  }

  _spawnOne({
    x, y, z,
    vx = 0, vy = 0, vz = 0,
    size = 0.08,
    life = 0.55,
    gravity = 16.0,
    drag = 2.0,
    color = 0xffffff,
    collide = true,
  }) {
    if (this.mode === 'off') return;
    if (this.particles.length >= MAX_PARTICLES) {
      const oldest = this.particles.shift();
      oldest.mesh.visible = false;
      this.pool.push(oldest);
    }

    const mat = this._getMaterial(color);
    let p = this.pool.pop();
    if (!p) {
      const mesh = new THREE.Mesh(this.sharedGeom, mat);
      this.scene.add(mesh);
      p = { mesh, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 0.08, life: 0.5, maxLife: 0.5, gravity: 16, drag: 2, collide: true };
    } else {
      p.mesh.material = mat;
    }

    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.size = size;
    p.life = life;
    p.maxLife = life;
    p.gravity = gravity;
    p.drag = drag;
    p.collide = collide;

    p.mesh.visible = true;
    p.mesh.position.set(x, y, z);
    p.mesh.scale.set(size, size, size);
    this.particles.push(p);
  }

  spawnBlockBreak(wx, wy, wz, blockId, count = 14) {
    const n = this._scaleCount(count);
    if (n <= 0) return;
    const palette = this.atlas?.getItemSamplePalette?.(blockId) || [0x888888];
    for (let i = 0; i < n; i++) {
      const col = palette[(Math.random() * palette.length) | 0];
      const ox = (Math.random() - 0.5) * 0.72;
      const oy = (Math.random() - 0.5) * 0.72;
      const oz = (Math.random() - 0.5) * 0.72;
      this._spawnOne({
        x: wx + 0.5 + ox,
        y: wy + 0.5 + oy,
        z: wz + 0.5 + oz,
        vx: ox * 4.5 + (Math.random() - 0.5) * 2.2,
        vy: 1.8 + Math.random() * 2.8,
        vz: oz * 4.5 + (Math.random() - 0.5) * 2.2,
        size: 0.065 + Math.random() * 0.055,
        life: 0.42 + Math.random() * 0.35,
        gravity: 18.0,
        color: col,
      });
    }
  }

  spawnBlockHit(wx, wy, wz, blockId, normal = null, count = 3) {
    const n = this._scaleCount(count);
    if (n <= 0) return;
    const palette = this.atlas?.getItemSamplePalette?.(blockId) || [0x888888];
    const nx = normal ? normal.x : 0;
    const ny = normal ? normal.y : 1;
    const nz = normal ? normal.z : 0;
    for (let i = 0; i < n; i++) {
      const col = palette[(Math.random() * palette.length) | 0];
      this._spawnOne({
        x: wx + 0.5 + nx * 0.54 + (Math.random() - 0.5) * 0.55,
        y: wy + 0.5 + ny * 0.54 + (Math.random() - 0.5) * 0.55,
        z: wz + 0.5 + nz * 0.54 + (Math.random() - 0.5) * 0.55,
        vx: nx * 1.8 + (Math.random() - 0.5) * 2.1,
        vy: ny * 1.8 + 1.2 + Math.random() * 1.4,
        vz: nz * 1.8 + (Math.random() - 0.5) * 2.1,
        size: 0.05 + Math.random() * 0.035,
        life: 0.25 + Math.random() * 0.2,
        gravity: 16.0,
        color: col,
      });
    }
  }

  spawnFoodCrumbs(player, itemId, count = 3) {
    const n = this._scaleCount(count);
    if (n <= 0 || !player) return;
    const eye = player.getEyeOrigin();
    const dir = player.getLookDirection();
    const palette = this.atlas?.getItemSamplePalette?.(itemId) || [0xd49a5c];
    for (let i = 0; i < n; i++) {
      const col = palette[(Math.random() * palette.length) | 0];
      this._spawnOne({
        x: eye.x + dir.x * 0.42 + (Math.random() - 0.5) * 0.14,
        y: eye.y - 0.16 + dir.y * 0.25 + (Math.random() - 0.5) * 0.08,
        z: eye.z + dir.z * 0.42 + (Math.random() - 0.5) * 0.14,
        vx: dir.x * 1.4 + (Math.random() - 0.5) * 1.4,
        vy: 0.6 + Math.random() * 1.1,
        vz: dir.z * 1.4 + (Math.random() - 0.5) * 1.4,
        size: 0.042 + Math.random() * 0.025,
        life: 0.26 + Math.random() * 0.14,
        gravity: 12.0,
        color: col,
        collide: false,
      });
    }
  }

  spawnCrit(x, y, z, count = 12) {
    const n = this._scaleCount(count);
    const colors = [0xffdc52, 0xfff5a8, 0x6ef4ff];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 1.6 + Math.random() * 2.6;
      this._spawnOne({
        x: x + (Math.random() - 0.5) * 0.5,
        y: y + Math.random() * 0.8,
        z: z + (Math.random() - 0.5) * 0.5,
        vx: Math.cos(a) * spd,
        vy: 1.5 + Math.random() * 2.5,
        vz: Math.sin(a) * spd,
        size: 0.085,
        life: 0.42 + Math.random() * 0.22,
        gravity: 7.0,
        color: colors[i % colors.length],
        collide: false,
      });
    }
  }

  spawnHit(x, y, z, count = 7) {
    const n = this._scaleCount(count);
    const colors = [0xe84848, 0xffffff, 0xff9292];
    for (let i = 0; i < n; i++) {
      this._spawnOne({
        x: x + (Math.random() - 0.5) * 0.4,
        y: y + Math.random() * 0.8,
        z: z + (Math.random() - 0.5) * 0.4,
        vx: (Math.random() - 0.5) * 3.0,
        vy: 1.2 + Math.random() * 1.8,
        vz: (Math.random() - 0.5) * 3.0,
        size: 0.065,
        life: 0.30 + Math.random() * 0.16,
        gravity: 10.0,
        color: colors[i % colors.length],
        collide: false,
      });
    }
  }

  spawnExplosion(x, y, z, power = 3.0) {
    const n = this._scaleCount(Math.round(18 + power * 5));
    const smokeCols = [0xf2f2f2, 0xc8c8c8, 0x848484, 0xffa638, 0xff5a1f];
    for (let i = 0; i < n; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = (Math.random() - 0.35) * Math.PI;
      const spd = 2.5 + Math.random() * (power * 2.6);
      const isFire = i % 3 === 0;
      this._spawnOne({
        x: x + (Math.random() - 0.5) * 0.6,
        y: y + (Math.random() - 0.5) * 0.6,
        z: z + (Math.random() - 0.5) * 0.6,
        vx: Math.cos(theta) * Math.cos(phi) * spd,
        vy: Math.sin(phi) * spd + 1.5,
        vz: Math.sin(theta) * Math.cos(phi) * spd,
        size: isFire ? 0.16 : 0.24 + Math.random() * 0.18,
        life: isFire ? 0.35 : 0.55 + Math.random() * 0.45,
        gravity: isFire ? -1.5 : -2.2,
        drag: 3.4,
        color: smokeCols[(Math.random() * smokeCols.length) | 0],
        collide: false,
      });
    }
  }

  spawnSplash(x, y, z, count = 10) {
    const n = this._scaleCount(count);
    const cols = [0x4ea6ff, 0x86c8ff, 0xe8f6ff];
    for (let i = 0; i < n; i++) {
      this._spawnOne({
        x: x + (Math.random() - 0.5) * 0.5,
        y: y + Math.random() * 0.3,
        z: z + (Math.random() - 0.5) * 0.5,
        vx: (Math.random() - 0.5) * 3.2,
        vy: 1.8 + Math.random() * 2.4,
        vz: (Math.random() - 0.5) * 3.2,
        size: 0.065,
        life: 0.35 + Math.random() * 0.2,
        gravity: 16.0,
        color: cols[i % cols.length],
      });
    }
  }

  spawnFlame(x, y, z, count = 3) {
    const n = this._scaleCount(count);
    const cols = [0xff6a00, 0xffb824, 0xffe46b];
    for (let i = 0; i < n; i++) {
      this._spawnOne({
        x: x + (Math.random() - 0.5) * 0.5,
        y: y + Math.random() * 0.7,
        z: z + (Math.random() - 0.5) * 0.5,
        vx: (Math.random() - 0.5) * 0.6,
        vy: 1.1 + Math.random() * 1.2,
        vz: (Math.random() - 0.5) * 0.6,
        size: 0.08,
        life: 0.28 + Math.random() * 0.22,
        gravity: -2.0,
        color: cols[i % cols.length],
        collide: false,
      });
    }
  }

  spawnSmoke(x, y, z, count = 5) {
    const n = this._scaleCount(count);
    const cols = [0x585858, 0x8a8a8a, 0xbcbcbc];
    for (let i = 0; i < n; i++) {
      this._spawnOne({
        x: x + (Math.random() - 0.5) * 0.45,
        y: y + Math.random() * 0.35,
        z: z + (Math.random() - 0.5) * 0.45,
        vx: (Math.random() - 0.5) * 0.8,
        vy: 1.2 + Math.random() * 1.1,
        vz: (Math.random() - 0.5) * 0.8,
        size: 0.11 + Math.random() * 0.06,
        life: 0.45 + Math.random() * 0.3,
        gravity: -1.6,
        color: cols[i % cols.length],
        collide: false,
      });
    }
  }

  spawnPortal(x, y, z, count = 8) {
    const n = this._scaleCount(count);
    const cols = [0xa838ff, 0xde82ff, 0x6e18b8];
    for (let i = 0; i < n; i++) {
      this._spawnOne({
        x: x + (Math.random() - 0.5) * 0.8,
        y: y + Math.random() * 2.4,
        z: z + (Math.random() - 0.5) * 0.8,
        vx: (Math.random() - 0.5) * 1.8,
        vy: (Math.random() - 0.2) * 1.5,
        vz: (Math.random() - 0.5) * 1.8,
        size: 0.075,
        life: 0.45 + Math.random() * 0.35,
        gravity: 0.5,
        color: cols[i % cols.length],
        collide: false,
      });
    }
  }

  spawnHappy(x, y, z, count = 10) {
    const n = this._scaleCount(count);
    const cols = [0x58ea3e, 0xa2ff68, 0x36b828];
    for (let i = 0; i < n; i++) {
      this._spawnOne({
        x: x + (Math.random() - 0.5) * 0.75,
        y: y + Math.random() * 0.85,
        z: z + (Math.random() - 0.5) * 0.75,
        vx: (Math.random() - 0.5) * 0.8,
        vy: 0.8 + Math.random() * 1.0,
        vz: (Math.random() - 0.5) * 0.8,
        size: 0.075,
        life: 0.5 + Math.random() * 0.3,
        gravity: -0.6,
        color: cols[i % cols.length],
        collide: false,
      });
    }
  }

  spawnHeart(x, y, z, count = 4) {
    const n = this._scaleCount(count);
    for (let i = 0; i < n; i++) {
      this._spawnOne({
        x: x + (Math.random() - 0.5) * 0.65,
        y: y + 0.4 + Math.random() * 0.5,
        z: z + (Math.random() - 0.5) * 0.65,
        vx: (Math.random() - 0.5) * 0.4,
        vy: 1.0 + Math.random() * 0.7,
        vz: (Math.random() - 0.5) * 0.4,
        size: 0.11,
        life: 0.65 + Math.random() * 0.2,
        gravity: -0.5,
        color: 0xff3b52,
        collide: false,
      });
    }
  }

  update(dt, world = null) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.visible = false;
        this.particles.splice(i, 1);
        this.pool.push(p);
        continue;
      }

      p.vy -= p.gravity * dt;
      const damp = Math.exp(-p.drag * dt);
      p.vx *= damp;
      p.vz *= damp;

      const nx = p.x + p.vx * dt;
      const ny = p.y + p.vy * dt;
      const nz = p.z + p.vz * dt;

      if (p.collide && world) {
        if (BlockRegistry.isSolid(world.getBlock(nx, ny, nz))) {
          if (BlockRegistry.isSolid(world.getBlock(p.x, ny, p.z))) {
            p.vy = Math.abs(p.vy) * 0.25;
            p.vx *= 0.6;
            p.vz *= 0.6;
          } else {
            p.x = nx;
            p.y = ny;
            p.z = nz;
          }
        } else {
          p.x = nx;
          p.y = ny;
          p.z = nz;
        }
      } else {
        p.x = nx;
        p.y = ny;
        p.z = nz;
      }

      const scaleRatio = Math.max(0.15, Math.min(1.0, p.life / Math.max(0.01, p.maxLife)));
      const s = p.size * scaleRatio;
      p.mesh.position.set(p.x, p.y, p.z);
      p.mesh.scale.set(s, s, s);
    }
  }

  clear() {
    for (const p of this.particles) {
      p.mesh.visible = false;
      this.pool.push(p);
    }
    this.particles.length = 0;
  }

  dispose() {
    this.clear();
    for (const p of this.pool) {
      this.scene.remove(p.mesh);
    }
    this.pool.length = 0;
    this.sharedGeom.dispose();
    for (const m of this.materialPool.values()) {
      m.dispose();
    }
    this.materialPool.clear();
  }
}
