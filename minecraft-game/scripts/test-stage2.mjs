import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import * as THREE from '../vendor/three.module.min.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function createCanvasMock(width = 64, height = 64) {
  let buf = new Uint8ClampedArray(width * height * 4);
  const ctx = {
    imageSmoothingEnabled: false,
    fillStyle: '#000000',
    save() {},
    restore() {},
    transform() {},
    fillRect(x, y, w, h) {
      const col = parseCssColor(this.fillStyle);
      const x0 = Math.max(0, Math.floor(x));
      const y0 = Math.max(0, Math.floor(y));
      const x1 = Math.min(canvas.width, Math.floor(x + w));
      const y1 = Math.min(canvas.height, Math.floor(y + h));
      for (let py = y0; py < y1; py++) {
        for (let px = x0; px < x1; px++) {
          const i = (py * canvas.width + px) * 4;
          buf[i] = col[0]; buf[i + 1] = col[1]; buf[i + 2] = col[2]; buf[i + 3] = col[3];
        }
      }
    },
    clearRect(x, y, w, h) {
      const x0 = Math.max(0, Math.floor(x));
      const y0 = Math.max(0, Math.floor(y));
      const x1 = Math.min(canvas.width, Math.floor(x + w));
      const y1 = Math.min(canvas.height, Math.floor(y + h));
      for (let py = y0; py < y1; py++) {
        for (let px = x0; px < x1; px++) {
          const i = (py * canvas.width + px) * 4;
          buf[i] = 0; buf[i + 1] = 0; buf[i + 2] = 0; buf[i + 3] = 0;
        }
      }
    },
    createImageData(w, h) {
      return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
    },
    putImageData(img, ox, oy) {
      for (let y = 0; y < img.height; y++) {
        const py = oy + y;
        if (py < 0 || py >= canvas.height) continue;
        for (let x = 0; x < img.width; x++) {
          const px = ox + x;
          if (px < 0 || px >= canvas.width) continue;
          const src = (y * img.width + x) * 4;
          const dst = (py * canvas.width + px) * 4;
          buf[dst] = img.data[src]; buf[dst + 1] = img.data[src + 1]; buf[dst + 2] = img.data[src + 2]; buf[dst + 3] = img.data[src + 3];
        }
      }
    },
    getImageData(x, y, w, h) {
      const out = new Uint8ClampedArray(w * h * 4);
      for (let py = 0; py < h; py++) {
        for (let px = 0; px < w; px++) {
          const src = ((y + py) * canvas.width + (x + px)) * 4;
          const dst = (py * w + px) * 4;
          out[dst] = buf[src]; out[dst + 1] = buf[src + 1]; out[dst + 2] = buf[src + 2]; out[dst + 3] = buf[src + 3];
        }
      }
      return { width: w, height: h, data: out };
    },
    drawImage() {},
  };

  const canvas = {
    _w: width,
    _h: height,
    get width() { return this._w; },
    set width(v) { this._w = v; buf = new Uint8ClampedArray(this._w * this._h * 4); },
    get height() { return this._h; },
    set height(v) { this._h = v; buf = new Uint8ClampedArray(this._w * this._h * 4); },
    getContext() { return ctx; },
    toDataURL() { return 'data:image/png;base64,'; },
  };
  return canvas;
}

function parseCssColor(str) {
  if (typeof str !== 'string') return [0, 0, 0, 255];
  if (str.startsWith('#')) {
    const n = parseInt(str.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
  }
  return [0, 0, 0, 255];
}

globalThis.window = {
  innerWidth: 1280,
  innerHeight: 720,
  devicePixelRatio: 1,
  addEventListener() {},
  removeEventListener() {},
};
globalThis.document = {
  createElement(tag) {
    if (tag === 'canvas') return createCanvasMock();
    return {
      classList: { add() {}, remove() {}, toggle() {} },
      dataset: {},
      style: {},
      setAttribute() {},
      append() {},
      addEventListener() {},
    };
  },
  getElementById() { return null; },
  addEventListener() {},
  removeEventListener() {},
};

const { BLOCK_IDS, BlockRegistry } = await import('../src/blocks/BlockRegistry.js');
const { GRAVITY, JUMP_VELOCITY, PLAYER_HALF_WIDTH, PLAYER_HEIGHT } = await import('../src/constants.js');
const { TextureAtlas } = await import('../src/textures/TextureAtlas.js');
const { aabbIntersectsBlock, moveAABB } = await import('../src/physics/AABBPhysics.js');
const { BreakCrackOverlay, SelectionBox, raycastVoxel } = await import('../src/world/Raycast.js');
const { World } = await import('../src/world/World.js');
const { ItemEntityManager } = await import('../src/entities/ItemEntity.js');
const { FirstPersonHand } = await import('../src/player/FirstPersonHand.js');
const { createSteveSkinTexture, PlayerModel } = await import('../src/player/PlayerSkin.js');
const { PlayerController } = await import('../src/player/PlayerController.js');
const { Hotbar } = await import('../src/ui/Hotbar.js');

function makeFlatWorld(atlas) {
  const scene = new THREE.Scene();
  const world = new World(scene, atlas, 42, 2, { unlimitedMemory: true });
  world.preloadSpawnArea(0, 0, 1);
  // Clear a clean test arena at Y=65..80 around (0..20, 0..20)
  for (let z = -2; z <= 22; z++) {
    for (let x = -2; x <= 22; x++) {
      world.setBlock(x, 64, z, BLOCK_IDS.STONE, false);
      for (let y = 65; y <= 82; y++) {
        world.setBlock(x, y, z, BLOCK_IDS.AIR, false);
      }
    }
  }
  return { scene, world };
}

async function runStage2Tests() {
  const atlas = new TextureAtlas();
  const { scene, world } = makeFlatWorld(atlas);

  // 1. AABB Physics: exact jump apex (~1.252 blocks, frame-rate independent Velocity-Verlet)
  let state = { x: 5.5, y: 65, z: 5.5, onGround: true };
  let vy = JUMP_VELOCITY;
  let maxPeak = state.y;
  for (let i = 0; i < 60; i++) {
    const dt = 0.012;
    const prevVy = vy;
    vy -= GRAVITY * dt;
    const dy = 0.5 * (prevVy + vy) * dt;
    const res = moveAABB(world, state, 0, dy, 0, PLAYER_HALF_WIDTH, PLAYER_HEIGHT, false);
    state.y = res.y;
    state.onGround = res.onGround;
    if (state.y > maxPeak) maxPeak = state.y;
    if (res.onGround && vy < 0) break;
  }
  const jumpGain = maxPeak - 65;
  assert.ok(jumpGain > 1.22 && jumpGain < 1.29, `Jump apex should be ~1.252 blocks, got ${jumpGain.toFixed(4)}`);
  console.log(`✓ AABB jump apex verified (${jumpGain.toFixed(3)} blocks)`);

  // 2. AABB Wall collision & Ceiling hit
  world.setBlock(7, 65, 5, BLOCK_IDS.COBBLESTONE, false);
  world.setBlock(7, 66, 5, BLOCK_IDS.COBBLESTONE, false);
  const wallRes = moveAABB(world, { x: 6.5, y: 65, z: 5.5, onGround: true }, 1.5, 0, 0, PLAYER_HALF_WIDTH, PLAYER_HEIGHT, false);
  assert.equal(wallRes.hitWall, true);
  assert.ok(wallRes.x <= 7.0 - PLAYER_HALF_WIDTH, `Player must stop outside wall at x<=6.7, got ${wallRes.x}`);

  world.setBlock(5, 67, 5, BLOCK_IDS.STONE, false); // ceiling at y=67 (height 2.0 above y=65)
  const ceilRes = moveAABB(world, { x: 5.5, y: 65, z: 5.5, onGround: false }, 0, 1.0, 0, PLAYER_HALF_WIDTH, PLAYER_HEIGHT, false);
  assert.equal(ceilRes.hitCeiling, true);
  assert.ok(ceilRes.y + PLAYER_HEIGHT <= 67.0, 'Head must clamp below ceiling');
  console.log('✓ AABB wall & ceiling collisions passed');

  // 3. Sneak Edge Guard (pillar bridge safety)
  // Build elevated 1x1 platform at (12, 70, 12) surrounded by air
  world.setBlock(12, 70, 12, BLOCK_IDS.OAK_PLANKS, false);
  let bridgeState = { x: 12.5, y: 71, z: 12.5, onGround: true };
  for (let i = 0; i < 30; i++) {
    const res = moveAABB(world, bridgeState, 0.08, 0, 0, PLAYER_HALF_WIDTH, 1.5, true);
    bridgeState.x = res.x;
    bridgeState.y = res.y;
    bridgeState.onGround = res.onGround;
  }
  assert.ok(bridgeState.x < 13.31 && bridgeState.x > 12.9, `Sneak Edge Guard must stop player on edge (12.9..13.3), got ${bridgeState.x}`);
  const sneakClampedX = bridgeState.x;
  // Without sneak guard, player steps off edge and begins falling
  let fallRes = moveAABB(world, bridgeState, 0.25, -0.05, 0, PLAYER_HALF_WIDTH, PLAYER_HEIGHT, false);
  bridgeState.x = fallRes.x;
  bridgeState.y = fallRes.y;
  fallRes = moveAABB(world, bridgeState, 0.05, -0.1, 0, PLAYER_HALF_WIDTH, PLAYER_HEIGHT, false);
  assert.equal(fallRes.onGround, false, 'Without sneak guard player must step off into air');
  assert.ok(fallRes.y < 71, 'Player must fall below y=71 after stepping off');
  console.log(`✓ Sneak Edge Guard passed (clamped safely at x=${sneakClampedX.toFixed(3)})`);

  // 4. Pillar Jump placement guard (cannot place inside self, can place beneath feet after jumping)
  assert.equal(aabbIntersectsBlock(5.5, 65, 5.5, PLAYER_HALF_WIDTH, PLAYER_HEIGHT, 5, 65, 5), true);
  assert.equal(aabbIntersectsBlock(5.5, 66.02, 5.5, PLAYER_HALF_WIDTH, PLAYER_HEIGHT, 5, 65, 5), false);
  console.log('✓ Block placement AABB overlap & pillar-jump check passed');

  // 5. DDA Raycast (skips Water, hits Solid with exact normal, enforces reach limit 5.0)
  world.setBlock(2, 66, 2, BLOCK_IDS.WATER, false);
  world.setBlock(4, 66, 2, BLOCK_IDS.STONE, false);
  const hit = raycastVoxel(world, { x: 0.5, y: 66.5, z: 2.5 }, { x: 1, y: 0, z: 0 }, 5.0);
  assert.ok(hit, 'DDA raycast must hit stone through water');
  assert.equal(hit.x, 4);
  assert.equal(hit.y, 66);
  assert.equal(hit.z, 2);
  assert.deepEqual(hit.normal, { x: -1, y: 0, z: 0 });
  const miss = raycastVoxel(world, { x: 0.5, y: 66.5, z: 2.5 }, { x: 1, y: 0, z: 0 }, 2.5);
  assert.equal(miss, null, 'DDA raycast must respect maxDistance');
  console.log('✓ 3D DDA Raycast (Water skip + exact face normal + reach) passed');

  // 6. Break Times, Drops, 10 Crack Stages, SelectionBox
  assert.equal(BlockRegistry.getBreakTime(BLOCK_IDS.DIRT), 0.75);
  assert.equal(BlockRegistry.getBreakTime(BLOCK_IDS.STONE), 7.5);
  assert.equal(BlockRegistry.getBreakTime(BLOCK_IDS.BEDROCK), Infinity);
  assert.equal(BlockRegistry.getDrop(BLOCK_IDS.GRASS), BLOCK_IDS.DIRT);
  assert.equal(BlockRegistry.getDrop(BLOCK_IDS.STONE), BLOCK_IDS.COBBLESTONE);
  const crackTextures = atlas.getCrackTextures();
  assert.equal(crackTextures.length, 10, 'Atlas must generate 10 crack textures destroy_stage_0..9');
  const selBox = new SelectionBox(scene);
  selBox.update(hit);
  assert.equal(selBox.mesh.visible, true);
  const breakOverlay = new BreakCrackOverlay(scene, atlas);
  breakOverlay.update(hit, 0.55);
  assert.equal(breakOverlay.mesh.visible, true);
  assert.equal(breakOverlay.mesh.material, breakOverlay.materials[5]);
  selBox.dispose(scene);
  breakOverlay.dispose(scene);
  console.log('✓ Hardness formulas, drop mapping, SelectionBox & 10-stage crack overlay passed');

  // 7. First-person upright hand orientation + 3D held block switching
  const skinTex = createSteveSkinTexture();
  const hand = new FirstPersonHand(skinTex, atlas);
  assert.ok(hand.armMesh.rotation.x > 1.5, 'First-person arm must point fist forward (-Z), not inverted');
  hand.update(0.05, 0, 0, false);
  assert.ok(hand.pivot.rotation.x > 0, 'First-person arm pitch must tilt fist slightly upward');
  assert.equal(hand.armHolder.visible, true);
  assert.equal(hand.heldItemMount.visible, false);
  hand.setHeldBlock(BLOCK_IDS.COBBLESTONE);
  assert.equal(hand.armHolder.visible, false);
  assert.equal(hand.heldItemMount.visible, true);
  hand.setHeldBlock(0);
  assert.equal(hand.armHolder.visible, true);
  hand.dispose();
  console.log('✓ First-person right arm upright orientation & held 3D block toggle passed');

  // 8. ItemEntity physics, stack merging, magnetic pickup into Hotbar
  const hotbar = new Hotbar(atlas);
  // Clear slot 6..8, ensure Cobblestone has space or check Sand pickup
  const itemMgr = new ItemEntityManager(scene, atlas);
  const d1 = itemMgr.spawnDrop(BLOCK_IDS.OAK_PLANKS, 16.5, 66.0, 16.5, 1);
  const d2 = itemMgr.spawnDrop(BLOCK_IDS.OAK_PLANKS, 16.6, 66.0, 16.6, 1);
  assert.equal(itemMgr.entities.length, 1, 'Close identical drops must auto-merge');
  assert.equal(d1.count, 2);

  // Move player far first so item lands on floor
  const playerDummy = { x: 2.5, y: 65, z: 2.5 };
  for (let i = 0; i < 40; i++) {
    itemMgr.update(0.02, world, playerDummy, hotbar);
  }
  assert.ok(d1.onGround && Math.abs(d1.y - 65) < 0.05, `Dropped item must land on floor y=65, got ${d1.y}`);

  // Pick up new block type into empty slot 6
  const startPlanks = hotbar.slots[1].count;
  hotbar.slots[1] = { id: BLOCK_IDS.OAK_PLANKS, count: 10 };
  playerDummy.x = d1.x + 0.8;
  playerDummy.y = d1.y;
  playerDummy.z = d1.z;
  for (let i = 0; i < 40; i++) {
    itemMgr.update(0.02, world, playerDummy, hotbar);
  }
  assert.equal(itemMgr.entities.length, 0, 'Item entity must be picked up magnetically');
  assert.equal(hotbar.slots[1].count, 12, 'Hotbar stack must receive merged count (+2)');
  void startPlanks;
  void d2;
  itemMgr.dispose();
  hotbar.dispose();
  console.log('✓ ItemEntity gravity, stack merge & magnetic hotbar pickup passed');

  // 9. Immediate boundary chunk remesh & Unlimited Memory Cache persistence
  world.setBlock(15, 65, 15, BLOCK_IDS.COBBLESTONE, true); // corner of chunk (0,0) touching (1,0), (0,1), (1,1)
  assert.equal(world.getChunk(0, 0).dirty, false);
  assert.equal(world.getChunk(1, 0).dirty, false);
  assert.equal(world.getChunk(0, 1).dirty, false);
  const exportedMods = world.exportModifiedBlocks();
  assert.ok(exportedMods.some(([wx, wy, wz, id]) => wx === 15 && wy === 65 && wz === 15 && id === BLOCK_IDS.COBBLESTONE));

  const worldRestored = new World(new THREE.Scene(), atlas, 42, 2, { unlimitedMemory: true });
  worldRestored.loadModifiedBlocks(exportedMods);
  worldRestored.preloadSpawnArea(0, 0, 1);
  assert.equal(worldRestored.getBlock(15, 65, 15), BLOCK_IDS.COBBLESTONE, 'Modified blocks must restore on reload');
  worldRestored.dispose();
  world.dispose();
  console.log('✓ Immediate border remeshing, unlimited chunk cache & block delta persistence passed');

  // 10. Double-check minecraft-offline.html & PlayerController sprint FOV
  const model = new PlayerModel(skinTex);
  const cam = new THREE.PerspectiveCamera(72, 16 / 9, 0.1, 500);
  const { world: world3 } = makeFlatWorld(atlas);
  const hand3 = new FirstPersonHand(skinTex, atlas);
  const ctrl = new PlayerController(cam, world3, model, hand3, { x: 10.5, y: 65, z: 10.5 });
  ctrl.touchInput.moveZ = 1;
  ctrl.touchInput.sprint = true;
  ctrl.update(0.2);
  assert.ok(ctrl.currentFov > 72, `Sprinting must smoothly boost camera FOV, got ${ctrl.currentFov}`);
  ctrl.dispose();
  hand3.dispose();
  model.dispose();
  world3.dispose();

  const offlineHtml = fs.readFileSync(path.join(ROOT, 'minecraft-offline.html'), 'utf8');
  const scriptMatch = offlineHtml.match(/<script>([\s\S]*)<\/script>/i);
  assert.ok(scriptMatch && scriptMatch[1].length > 500000);
  new vm.Script(scriptMatch[1]);
  console.log('✓ Sprint FOV boost & offline single-file bundle validated');

  console.log('\nALL STAGE 2 TESTS PASSED!');
}

runStage2Tests().catch((err) => {
  console.error(err);
  process.exit(1);
});
