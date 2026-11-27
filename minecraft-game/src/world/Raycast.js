import * as THREE from '../../vendor/three.module.min.js';
import { BlockRegistry } from '../blocks/BlockRegistry.js';
import { REACH_DISTANCE, WORLD_HEIGHT } from '../constants.js';

function intersectRayAABB(ox, oy, oz, dx, dy, dz, minX, minY, minZ, maxX, maxY, maxZ) {
  let tmin = -Infinity;
  let tmax = Infinity;
  let hnx = 0, hny = 0, hnz = 0;

  if (Math.abs(dx) < 1e-8) {
    if (ox < minX || ox > maxX) return null;
  } else {
    const inv = 1 / dx;
    let t1 = (minX - ox) * inv;
    let t2 = (maxX - ox) * inv;
    let nSign = -Math.sign(dx);
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    if (t1 > tmin) { tmin = t1; hnx = nSign; hny = 0; hnz = 0; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }

  if (Math.abs(dy) < 1e-8) {
    if (oy < minY || oy > maxY) return null;
  } else {
    const inv = 1 / dy;
    let t1 = (minY - oy) * inv;
    let t2 = (maxY - oy) * inv;
    let nSign = -Math.sign(dy);
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    if (t1 > tmin) { tmin = t1; hnx = 0; hny = nSign; hnz = 0; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }

  if (Math.abs(dz) < 1e-8) {
    if (oz < minZ || oz > maxZ) return null;
  } else {
    const inv = 1 / dz;
    let t1 = (minZ - oz) * inv;
    let t2 = (maxZ - oz) * inv;
    let nSign = -Math.sign(dz);
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    if (t1 > tmin) { tmin = t1; hnx = 0; hny = 0; hnz = nSign; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }

  if (tmax < 0) return null;
  const hitT = tmin >= 0 ? tmin : 0;
  return { t: hitT, normal: { x: hnx, y: hny, z: hnz } };
}

function getBlockHitBox(def, meta) {
  if (def.isTorch) {
    if (meta === 1) return [0.0, 0.16, 0.34, 0.38, 0.84, 0.66];
    if (meta === 2) return [0.62, 0.16, 0.34, 1.0, 0.84, 0.66];
    if (meta === 3) return [0.34, 0.16, 0.0, 0.66, 0.84, 0.38];
    if (meta === 4) return [0.34, 0.16, 0.62, 0.66, 0.84, 1.0];
    return [0.34, 0.0, 0.34, 0.66, 0.66, 0.66];
  }
  if (def.isLadder) {
    if (meta === 1) return [0.0, 0.0, 0.0, 0.16, 1.0, 1.0];
    if (meta === 2) return [0.84, 0.0, 0.0, 1.0, 1.0, 1.0];
    if (meta === 4) return [0.0, 0.0, 0.84, 1.0, 1.0, 1.0];
    return [0.0, 0.0, 0.0, 1.0, 1.0, 0.16];
  }
  if (def.isBed) {
    return [0.0, 0.0, 0.0, 1.0, 0.5625, 1.0];
  }
  return null;
}

/**
 * Fast Amanatides & Woo 3D DDA Voxel Traversal Algorithm.
 * Skips Air and Water, and tests tight sub-voxel bounds for Torches/Ladders/Beds
 * so aiming past a torch hits the block behind it naturally.
 */
export function raycastVoxel(world, origin, direction, maxDistance = REACH_DISTANCE) {
  const dx = direction.x;
  const dy = direction.y;
  const dz = direction.z;

  const dirLen = Math.hypot(dx, dy, dz);
  if (dirLen < 1e-8) return null;
  const ndx = dx / dirLen;
  const ndy = dy / dirLen;
  const ndz = dz / dirLen;

  let vx = Math.floor(origin.x);
  let vy = Math.floor(origin.y);
  let vz = Math.floor(origin.z);

  const stepX = ndx > 0 ? 1 : ndx < 0 ? -1 : 0;
  const stepY = ndy > 0 ? 1 : ndy < 0 ? -1 : 0;
  const stepZ = ndz > 0 ? 1 : ndz < 0 ? -1 : 0;

  const tDeltaX = stepX !== 0 ? Math.abs(1 / ndx) : Infinity;
  const tDeltaY = stepY !== 0 ? Math.abs(1 / ndy) : Infinity;
  const tDeltaZ = stepZ !== 0 ? Math.abs(1 / ndz) : Infinity;

  let tMaxX = stepX > 0 ? (vx + 1 - origin.x) * tDeltaX : stepX < 0 ? (origin.x - vx) * tDeltaX : Infinity;
  let tMaxY = stepY > 0 ? (vy + 1 - origin.y) * tDeltaY : stepY < 0 ? (origin.y - vy) * tDeltaY : Infinity;
  let tMaxZ = stepZ > 0 ? (vz + 1 - origin.z) * tDeltaZ : stepZ < 0 ? (origin.z - vz) * tDeltaZ : Infinity;

  let t = 0;
  let nx = 0;
  let ny = 0;
  let nz = 0;

  // Guard against infinite loop
  for (let iter = 0; iter < 128 && t <= maxDistance; iter++) {
    if (vy >= 0 && vy < WORLD_HEIGHT) {
      const id = world.getBlock(vx, vy, vz);
      if (BlockRegistry.isTargetable(id)) {
        const def = BlockRegistry.get(id);
        const meta = world?.getBlockMeta ? world.getBlockMeta(vx, vy, vz) : 0;
        const box = getBlockHitBox(def, meta);
        if (box) {
          const subHit = intersectRayAABB(
            origin.x, origin.y, origin.z,
            ndx, ndy, ndz,
            vx + box[0], vy + box[1], vz + box[2],
            vx + box[3], vy + box[4], vz + box[5]
          );
          if (subHit && subHit.t <= maxDistance) {
            const hitNormal = (subHit.normal.x || subHit.normal.y || subHit.normal.z)
              ? subHit.normal
              : { x: nx, y: ny, z: nz };
            return {
              x: vx,
              y: vy,
              z: vz,
              blockId: id,
              normal: hitNormal,
              distance: subHit.t,
            };
          }
        } else {
          return {
            x: vx,
            y: vy,
            z: vz,
            blockId: id,
            normal: { x: nx, y: ny, z: nz },
            distance: t,
          };
        }
      }
    }

    if (tMaxX < tMaxY) {
      if (tMaxX < tMaxZ) {
        vx += stepX;
        t = tMaxX;
        tMaxX += tDeltaX;
        nx = -stepX;
        ny = 0;
        nz = 0;
      } else {
        vz += stepZ;
        t = tMaxZ;
        tMaxZ += tDeltaZ;
        nx = 0;
        ny = 0;
        nz = -stepZ;
      }
    } else {
      if (tMaxY < tMaxZ) {
        vy += stepY;
        t = tMaxY;
        tMaxY += tDeltaY;
        nx = 0;
        ny = -stepY;
        nz = 0;
      } else {
        vz += stepZ;
        t = tMaxZ;
        tMaxZ += tDeltaZ;
        nx = 0;
        ny = 0;
        nz = -stepZ;
      }
    }
  }

  return null;
}

/**
 * Reusable thin wireframe highlight box around the currently targeted block.
 */
export class SelectionBox {
  constructor(scene) {
    const box = new THREE.BoxGeometry(1.004, 1.004, 1.004);
    const edges = new THREE.EdgesGeometry(box);
    box.dispose();

    const material = new THREE.LineBasicMaterial({
      color: 0x111111,
      transparent: true,
      opacity: 0.78,
    });

    this.mesh = new THREE.LineSegments(edges, material);
    this.mesh.visible = false;
    this.mesh.renderOrder = 3;
    scene.add(this.mesh);
  }

  update(hit, world = null) {
    if (!hit) {
      this.mesh.visible = false;
      return;
    }
    const def = BlockRegistry.get(hit.blockId);
    if (def.isTorch) {
      const meta = world?.getBlockMeta ? world.getBlockMeta(hit.x, hit.y, hit.z) : 0;
      let ox = 0.5;
      let oy = 0.34;
      let oz = 0.5;
      if (meta === 1) { ox = 0.20; oy = 0.48; }
      else if (meta === 2) { ox = 0.80; oy = 0.48; }
      else if (meta === 3) { oz = 0.20; oy = 0.48; }
      else if (meta === 4) { oz = 0.80; oy = 0.48; }
      this.mesh.scale.set(0.32, 0.66, 0.32);
      this.mesh.position.set(hit.x + ox, hit.y + oy, hit.z + oz);
      this.mesh.visible = true;
      return;
    }
    if (def.isBed) {
      this.mesh.scale.set(1.004, 0.57, 1.004);
      this.mesh.position.set(hit.x + 0.5, hit.y + 0.285, hit.z + 0.5);
      this.mesh.visible = true;
      return;
    }
    if (def.isLadder) {
      const meta = world?.getBlockMeta ? world.getBlockMeta(hit.x, hit.y, hit.z) : 0;
      if (meta === 1) {
        this.mesh.scale.set(0.14, 1.0, 1.0);
        this.mesh.position.set(hit.x + 0.07, hit.y + 0.5, hit.z + 0.5);
      } else if (meta === 2) {
        this.mesh.scale.set(0.14, 1.0, 1.0);
        this.mesh.position.set(hit.x + 0.93, hit.y + 0.5, hit.z + 0.5);
      } else if (meta === 4) {
        this.mesh.scale.set(1.0, 1.0, 0.14);
        this.mesh.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.93);
      } else {
        this.mesh.scale.set(1.0, 1.0, 0.14);
        this.mesh.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.07);
      }
      this.mesh.visible = true;
      return;
    }
    const sx = def.inset > 0 ? 1 - def.inset * 2 + 0.005 : def.isCross ? 0.78 : 1.004;
    const sy = def.isCross ? 0.85 : 1.004;
    this.mesh.scale.set(sx, sy, sx);
    this.mesh.visible = true;
    this.mesh.position.set(hit.x + 0.5, hit.y + (def.isCross ? 0.43 : 0.5), hit.z + 0.5);
  }

  dispose(scene) {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

/**
 * Reusable overlay cube displaying Minecraft destroy_stage_0..9 cracks on the block being broken.
 */
export class BreakCrackOverlay {
  constructor(scene, atlas) {
    const geom = new THREE.BoxGeometry(1.003, 1.003, 1.003);
    const textures = atlas.getCrackTextures();
    this.materials = textures.map((tex) => new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }));

    this.mesh = new THREE.Mesh(geom, this.materials[0]);
    this.mesh.visible = false;
    this.mesh.renderOrder = 4;
    scene.add(this.mesh);
  }

  update(hit, progress) {
    if (!hit || progress <= 0) {
      this.mesh.visible = false;
      return;
    }
    const def = BlockRegistry.get(hit.blockId);
    const stage = Math.max(0, Math.min(9, Math.floor(progress * 10)));
    this.mesh.material = this.materials[stage];
    if (def.isBed) {
      this.mesh.scale.set(1.0, 0.564, 1.0);
      this.mesh.position.set(hit.x + 0.5, hit.y + 0.283, hit.z + 0.5);
    } else {
      this.mesh.scale.set(1.0, 1.0, 1.0);
      this.mesh.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    }
    this.mesh.visible = true;
  }

  dispose(scene) {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    for (const mat of this.materials) {
      mat.dispose();
    }
  }
}
