import { BlockRegistry } from '../blocks/BlockRegistry.js';
import { SNEAK_EDGE_DEPTH } from '../constants.js';

const EPS = 1e-4;

export function aabbIntersectsBlock(x, y, z, halfWidth, height, bx, by, bz) {
  return (
    x + halfWidth > bx + EPS &&
    x - halfWidth < bx + 1 - EPS &&
    y + height > by + EPS &&
    y < by + 1 - EPS &&
    z + halfWidth > bz + EPS &&
    z - halfWidth < bz + 1 - EPS
  );
}

export function collidesWithWorld(world, x, y, z, halfWidth, height) {
  const minX = Math.floor(x - halfWidth + EPS);
  const maxX = Math.floor(x + halfWidth - EPS);
  const minY = Math.floor(y + EPS);
  const maxY = Math.floor(y + height - EPS);
  const minZ = Math.floor(z - halfWidth + EPS);
  const maxZ = Math.floor(z + halfWidth - EPS);

  for (let by = minY; by <= maxY; by++) {
    for (let bz = minZ; bz <= maxZ; bz++) {
      for (let bx = minX; bx <= maxX; bx++) {
        if (BlockRegistry.isSolid(world.getBlock(bx, by, bz))) {
          return true;
        }
      }
    }
  }
  return false;
}

export function hasSupportBelow(world, x, y, z, halfWidth, depth = SNEAK_EDGE_DEPTH) {
  const minX = Math.floor(x - halfWidth + EPS);
  const maxX = Math.floor(x + halfWidth - EPS);
  const minY = Math.floor(y - depth);
  const maxY = Math.floor(y - 0.002);
  const minZ = Math.floor(z - halfWidth + EPS);
  const maxZ = Math.floor(z + halfWidth - EPS);

  for (let by = minY; by <= maxY; by++) {
    for (let bz = minZ; bz <= maxZ; bz++) {
      for (let bx = minX; bx <= maxX; bx++) {
        if (BlockRegistry.isSolid(world.getBlock(bx, by, bz))) {
          return true;
        }
      }
    }
  }
  return false;
}

function clampSneakAxis(world, x, y, z, halfWidth, delta, axis) {
  if (delta === 0) return 0;
  const testX = axis === 'x' ? x + delta : x;
  const testZ = axis === 'z' ? z + delta : z;
  if (hasSupportBelow(world, testX, y, testZ, halfWidth)) {
    return delta;
  }
  // If already unsupported, don't block movement
  if (!hasSupportBelow(world, x, y, z, halfWidth)) {
    return delta;
  }

  // Binary search safe distance up to the exact block edge
  let low = 0;
  let high = 1;
  for (let i = 0; i < 6; i++) {
    const mid = (low + high) * 0.5;
    const mx = axis === 'x' ? x + delta * mid : x;
    const mz = axis === 'z' ? z + delta * mid : z;
    if (hasSupportBelow(world, mx, y, mz, halfWidth)) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return delta * low * 0.98;
}

/**
 * Resolves axis-separated AABB collisions (Y -> X -> Z) against world voxel blocks,
 * with optional Sneak Edge Guard and wall/ceiling hit reporting.
 */
export function moveAABB(world, pos, dx, dy, dz, halfWidth, height, sneakGuard = false) {
  let x = pos.x;
  let y = pos.y;
  let z = pos.z;

  let onGround = false;
  let hitCeiling = false;
  let hitWall = false;

  // Apply Sneak Edge Guard per horizontal axis while grounded
  if (sneakGuard && pos.onGround) {
    dx = clampSneakAxis(world, x, y, z, halfWidth, dx, 'x');
    dz = clampSneakAxis(world, x + dx, y, z, halfWidth, dz, 'z');
  }

  // 1. Resolve Y axis
  if (dy !== 0) {
    const nextY = y + dy;
    const minX = Math.floor(x - halfWidth + EPS);
    const maxX = Math.floor(x + halfWidth - EPS);
    const minZ = Math.floor(z - halfWidth + EPS);
    const maxZ = Math.floor(z + halfWidth - EPS);

    if (dy < 0) {
      const minY = Math.floor(nextY + EPS);
      const maxY = Math.floor(y + EPS);
      let floorY = -Infinity;
      for (let by = maxY; by >= minY; by--) {
        for (let bz = minZ; bz <= maxZ; bz++) {
          for (let bx = minX; bx <= maxX; bx++) {
            if (BlockRegistry.isSolid(world.getBlock(bx, by, bz))) {
              if (by + 1 > floorY) floorY = by + 1;
            }
          }
        }
      }
      if (floorY > -Infinity) {
        y = floorY;
        onGround = true;
      } else {
        y = nextY;
      }
    } else {
      const minY = Math.floor(y + height - EPS);
      const maxY = Math.floor(nextY + height - EPS);
      let ceilY = Infinity;
      for (let by = minY; by <= maxY; by++) {
        for (let bz = minZ; bz <= maxZ; bz++) {
          for (let bx = minX; bx <= maxX; bx++) {
            if (BlockRegistry.isSolid(world.getBlock(bx, by, bz))) {
              if (by < ceilY) ceilY = by;
            }
          }
        }
      }
      if (ceilY < Infinity) {
        y = ceilY - height - EPS;
        hitCeiling = true;
      } else {
        y = nextY;
      }
    }
  }

  // Ground probe if dy == 0
  if (dy <= 0 && !onGround) {
    onGround = collidesWithWorld(world, x, y - 0.004, z, halfWidth, 0.02);
  }

  // 2. Resolve X axis
  if (dx !== 0) {
    const nextX = x + dx;
    const minY = Math.floor(y + EPS);
    const maxY = Math.floor(y + height - EPS);
    const minZ = Math.floor(z - halfWidth + EPS);
    const maxZ = Math.floor(z + halfWidth - EPS);

    if (dx > 0) {
      const minX = Math.floor(x + halfWidth - EPS);
      const maxX = Math.floor(nextX + halfWidth - EPS);
      let wallX = Infinity;
      for (let bx = minX; bx <= maxX; bx++) {
        for (let by = minY; by <= maxY; by++) {
          for (let bz = minZ; bz <= maxZ; bz++) {
            if (BlockRegistry.isSolid(world.getBlock(bx, by, bz))) {
              if (bx < wallX) wallX = bx;
            }
          }
        }
      }
      if (wallX < Infinity) {
        x = wallX - halfWidth - EPS;
        hitWall = true;
      } else {
        x = nextX;
      }
    } else {
      const minX = Math.floor(nextX - halfWidth + EPS);
      const maxX = Math.floor(x - halfWidth + EPS);
      let wallX = -Infinity;
      for (let bx = maxX; bx >= minX; bx--) {
        for (let by = minY; by <= maxY; by++) {
          for (let bz = minZ; bz <= maxZ; bz++) {
            if (BlockRegistry.isSolid(world.getBlock(bx, by, bz))) {
              if (bx + 1 > wallX) wallX = bx + 1;
            }
          }
        }
      }
      if (wallX > -Infinity) {
        x = wallX + halfWidth + EPS;
        hitWall = true;
      } else {
        x = nextX;
      }
    }
  }

  // 3. Resolve Z axis
  if (dz !== 0) {
    const nextZ = z + dz;
    const minY = Math.floor(y + EPS);
    const maxY = Math.floor(y + height - EPS);
    const minX = Math.floor(x - halfWidth + EPS);
    const maxX = Math.floor(x + halfWidth - EPS);

    if (dz > 0) {
      const minZ = Math.floor(z + halfWidth - EPS);
      const maxZ = Math.floor(nextZ + halfWidth - EPS);
      let wallZ = Infinity;
      for (let bz = minZ; bz <= maxZ; bz++) {
        for (let by = minY; by <= maxY; by++) {
          for (let bx = minX; bx <= maxX; bx++) {
            if (BlockRegistry.isSolid(world.getBlock(bx, by, bz))) {
              if (bz < wallZ) wallZ = bz;
            }
          }
        }
      }
      if (wallZ < Infinity) {
        z = wallZ - halfWidth - EPS;
        hitWall = true;
      } else {
        z = nextZ;
      }
    } else {
      const minZ = Math.floor(nextZ - halfWidth + EPS);
      const maxZ = Math.floor(z - halfWidth + EPS);
      let wallZ = -Infinity;
      for (let bz = maxZ; bz >= minZ; bz--) {
        for (let by = minY; by <= maxY; by++) {
          for (let bx = minX; bx <= maxX; bx++) {
            if (BlockRegistry.isSolid(world.getBlock(bx, by, bz))) {
              if (bz + 1 > wallZ) wallZ = bz + 1;
            }
          }
        }
      }
      if (wallZ > -Infinity) {
        z = wallZ + halfWidth + EPS;
        hitWall = true;
      } else {
        z = nextZ;
      }
    }
  }

  return { x, y, z, onGround, hitCeiling, hitWall };
}
