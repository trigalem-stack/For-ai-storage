import * as THREE from '../../vendor/three.module.min.js';
import { BlockRegistry } from '../blocks/BlockRegistry.js';
import { XP_MAGNET_RANGE, XP_PICKUP_RANGE } from '../constants.js';

const SHARED_XP_GEOM = new THREE.BoxGeometry(0.24, 0.24, 0.24);

export class XPOrbEntity {
  constructor(scene, x, y, z, value = 1) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.vx = (Math.random() - 0.5) * 2.6;
    this.vy = 2.6 + Math.random() * 1.4;
    this.vz = (Math.random() - 0.5) * 2.6;
    this.value = Math.max(1, value | 0);
    this.age = 0;
    this.alive = true;

    const scale = this.value >= 10 ? 1.35 : this.value >= 5 ? 1.15 : 0.9;
    this.baseScale = scale;

    this.mat = new THREE.MeshBasicMaterial({
      color: 0x8dff42,
      transparent: true,
      opacity: 0.92,
      fog: true,
    });
    this.mesh = new THREE.Mesh(SHARED_XP_GEOM, this.mat);
    this.mesh.position.set(x, y + 0.16, z);
    this.mesh.scale.setScalar(scale);
    scene.add(this.mesh);
  }

  update(dt, world, player, onCollect) {
    if (!this.alive) return false;
    this.age += dt;
    if (this.age > 180) {
      this.alive = false;
      return false;
    }

    // Magnet pull toward player
    let pulled = false;
    if (player && !player.isDead) {
      const px = player.position.x;
      const py = player.position.y + 0.9;
      const pz = player.position.z;
      const dx = px - this.x;
      const dy = py - this.y;
      const dz = pz - this.z;
      const dist = Math.hypot(dx, dy, dz);

      if (dist <= XP_PICKUP_RANGE && this.age >= 0.22) {
        onCollect?.(this.value);
        this.alive = false;
        return false;
      }

      if (dist <= XP_MAGNET_RANGE && dist > 1e-4) {
        pulled = true;
        const speed = 7.5 + (XP_MAGNET_RANGE - dist) * 2.2;
        this.vx += ((dx / dist) * speed - this.vx) * Math.min(1, dt * 8);
        this.vy += ((dy / dist) * speed - this.vy) * Math.min(1, dt * 8);
        this.vz += ((dz / dist) * speed - this.vz) * Math.min(1, dt * 8);
      }
    }

    if (!pulled) {
      this.vy -= 14.0 * dt;
      const damp = Math.exp(-3.0 * dt);
      this.vx *= damp;
      this.vz *= damp;
    }

    const nx = this.x + this.vx * dt;
    const ny = this.y + this.vy * dt;
    const nz = this.z + this.vz * dt;

    if (!pulled && world) {
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
      if (this.vy < 0 && BlockRegistry.isSolid(world.getBlock(Math.floor(this.x), Math.floor(ny), Math.floor(this.z)))) {
        this.y = Math.floor(ny) + 1.02;
        this.vy = 0;
      } else {
        this.y = ny;
      }
    } else {
      this.x = nx;
      this.y = ny;
      this.z = nz;
    }

    // Pulsing yellow-green color and spin
    const pulse = 0.5 + 0.5 * Math.sin(this.age * 9.0);
    this.mat.color.setRGB(0.45 + pulse * 0.45, 1.0, 0.2 + (1 - pulse) * 0.25);
    this.mesh.position.set(this.x, this.y + 0.15 + Math.sin(this.age * 4) * 0.04, this.z);
    this.mesh.rotation.y += dt * 3.5;
    this.mesh.rotation.x += dt * 1.8;
    return true;
  }

  dispose(scene) {
    scene.remove(this.mesh);
    this.mat.dispose();
  }
}
