import * as THREE from '../../vendor/three.module.min.js';
import { BlockRegistry } from '../blocks/BlockRegistry.js';
import { WORLD_HEIGHT } from '../constants.js';
import { buildBlockItemGeometry } from './ItemEntity.js';

const FALL_GRAVITY = 26.0;
const FALL_TERMINAL = 34.0;
const MAX_FALLING_ENTITIES = 96;

/**
 * Simulates Minecraft FallingBlockEntity physics for gravity-affected blocks (Sand & Gravel).
 * Triggered only by player edits / neighbor updates so natural overhanging sand stays intact until disturbed.
 */
export class FallingBlockManager {
  constructor(scene, atlas) {
    this.scene = scene;
    this.atlas = atlas;
    this.entities = [];
    this.geometryCache = new Map();
    this.material = new THREE.MeshBasicMaterial({
      map: atlas.texture,
      vertexColors: true,
      fog: true,
      side: THREE.FrontSide,
    });
    this.pendingColumns = [];
    this.columnTimer = 0;
  }

  _getGeometry(blockId) {
    let geom = this.geometryCache.get(blockId);
    if (!geom) {
      geom = buildBlockItemGeometry(this.atlas, blockId, 0.996);
      if (geom) this.geometryCache.set(blockId, geom);
    }
    return geom;
  }

  /**
   * Schedules a gravity stability check on block (wx, wy, wz) and the column above it.
   */
  scheduleStabilityCheck(wx, wy, wz) {
    const fx = Math.floor(wx);
    const fy = Math.floor(wy);
    const fz = Math.floor(wz);
    if (fy < 0 || fy >= WORLD_HEIGHT) return;
    this.pendingColumns.push({ x: fx, y: fy, z: fz });
  }

  _canFallInto(blockId) {
    if (blockId === 0) return true;
    const def = BlockRegistry.get(blockId);
    return def.isLiquid || def.isCross;
  }

  _spawnFallingBlock(world, bx, by, bz, blockId) {
    if (this.entities.length >= MAX_FALLING_ENTITIES) return false;
    const geom = this._getGeometry(blockId);
    if (!geom) return false;

    // Clear voxel block without triggering another cascade loop
    if (!world.setBlock(bx, by, bz, 0, true, false)) return false;

    const mesh = new THREE.Mesh(geom, this.material);
    mesh.position.set(bx + 0.5, by + 0.5, bz + 0.5);
    this.scene.add(mesh);

    this.entities.push({
      blockId,
      x: bx,
      y: by,
      z: bz,
      vy: 0,
      age: 0,
      mesh,
    });
    return true;
  }

  _processPendingColumns(world) {
    if (this.pendingColumns.length === 0) return;

    const seen = new Set();
    const batch = this.pendingColumns.splice(0, 64);

    for (let i = 0; i < batch.length; i++) {
      const col = batch[i];
      const colKey = `${col.x},${col.z}`;
      // Scan upward from col.y to find unsupported sand/gravel stacks
      for (let y = Math.max(1, col.y); y < WORLD_HEIGHT; y++) {
        const key = `${colKey},${y}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const id = world.getBlock(col.x, y, col.z);
        if (!BlockRegistry.fallsWithGravity(id)) {
          // Stop upward scan only if we've passed above the initial disturbed gap and hit non-gravity solid
          if (y > col.y + 1 && BlockRegistry.isSolid(id)) break;
          continue;
        }

        const belowId = world.getBlock(col.x, y - 1, col.z);
        if (this._canFallInto(belowId)) {
          this._spawnFallingBlock(world, col.x, y, col.z, id);
        } else if (y === col.y) {
          // Bottom block is supported, stop
        }
      }
    }
  }

  update(dt, world, itemManager = null, dropItemsOnPlant = false) {
    this._processPendingColumns(world);

    for (let i = this.entities.length - 1; i >= 0; i--) {
      const ent = this.entities[i];
      ent.age += dt;
      ent.vy = Math.max(-FALL_TERMINAL, ent.vy - FALL_GRAVITY * dt);
      const nextY = ent.y + ent.vy * dt;

      if (nextY < 0 || ent.age > 25) {
        this.scene.remove(ent.mesh);
        this.entities.splice(i, 1);
        continue;
      }

      const checkY = Math.floor(nextY);
      const targetId = world.getBlock(ent.x, checkY, ent.z);

      if (!this._canFallInto(targetId)) {
        // Land on the cell right above the solid obstacle
        const landY = checkY + 1;
        const occupyId = world.getBlock(ent.x, landY, ent.z);
        const occupyDef = BlockRegistry.get(occupyId);

        this.scene.remove(ent.mesh);
        this.entities.splice(i, 1);

        if (occupyDef.isCross || occupyDef.inset > 0) {
          // Minecraft rule: sand falling onto a plant/cactus breaks into an item drop
          if (dropItemsOnPlant && itemManager) {
            itemManager.spawnDrop(ent.blockId, ent.x + 0.5, landY + 0.25, ent.z + 0.5, 1);
          }
        } else if (landY >= 0 && landY < WORLD_HEIGHT) {
          world.setBlock(ent.x, landY, ent.z, ent.blockId, true, false);
        }
        continue;
      }

      ent.y = nextY;
      ent.mesh.position.set(ent.x + 0.5, ent.y + 0.5, ent.z + 0.5);
    }
  }

  clear() {
    for (const ent of this.entities) {
      this.scene.remove(ent.mesh);
    }
    this.entities.length = 0;
    this.pendingColumns.length = 0;
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
