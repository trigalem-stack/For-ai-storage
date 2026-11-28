import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

function createCanvasMock(width = 64, height = 64) {
  const noop = () => {};
  const gradMock = { addColorStop: noop };
  const canvas = {
    width,
    height,
    style: {},
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    getContext: () => ctx,
    toDataURL: () => 'data:image/png;base64,MOCK',
    addEventListener: noop,
    removeEventListener: noop,
  };
  const ctx = {
    imageSmoothingEnabled: false,
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    globalAlpha: 1,
    clearRect: noop,
    fillRect: noop,
    strokeRect: noop,
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    arc: noop,
    fill: noop,
    stroke: noop,
    drawImage: noop,
    save: noop,
    restore: noop,
    translate: noop,
    rotate: noop,
    scale: noop,
    transform: noop,
    createLinearGradient: () => gradMock,
    createRadialGradient: () => gradMock,
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: noop,
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray((w || canvas.width) * (h || canvas.height) * 4) }),
  };
  return canvas;
}

globalThis.document = {
  createElement: (tag) => {
    if (tag === 'canvas') return createCanvasMock();
    return {
      style: {},
      className: '',
      textContent: '',
      dataset: {},
      children: [],
      appendChild: () => {},
      addEventListener: () => {},
      classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
    };
  },
  getElementById: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {},
  pointerLockElement: null,
};

globalThis.window = {
  innerWidth: 1280,
  innerHeight: 720,
  devicePixelRatio: 1,
  addEventListener: () => {},
  removeEventListener: () => {},
};
Object.defineProperty(globalThis, 'navigator', {
  value: { maxTouchPoints: 0 },
  configurable: true,
});
globalThis.performance = globalThis.performance || { now: () => Date.now() };
globalThis.requestAnimationFrame = () => 0;

const THREE = await import('../vendor/three.module.min.js');
const { BLOCK_IDS, BlockRegistry } = await import('../src/blocks/BlockRegistry.js');
const {
  CHUNK_SIZE,
  DAY_LENGTH_TICKS,
  FLY_SPEED,
  PLAYER_HEIGHT,
  PLAYER_SWIM_HEIGHT,
  SLEEP_END_TICK,
  SLEEP_START_TICK,
  WORLD_HEIGHT,
} = await import('../src/constants.js');
const { buildBlockItemGeometry } = await import('../src/entities/ItemEntity.js');
const { FirstPersonHand } = await import('../src/player/FirstPersonHand.js');
const { PlayerController } = await import('../src/player/PlayerController.js');
const { PlayerModel, createSteveSkinTexture } = await import('../src/player/PlayerSkin.js');
const { SaveManager } = await import('../src/storage/SaveManager.js');
const { TextureAtlas } = await import('../src/textures/TextureAtlas.js');
const { Hotbar } = await import('../src/ui/Hotbar.js');
const { MobileControls } = await import('../src/ui/MobileControls.js');
const { Chunk } = await import('../src/world/Chunk.js');
const { ChunkMesher } = await import('../src/world/ChunkMesher.js');
const { LightingEngine } = await import('../src/world/LightingEngine.js');
const { MenuPanorama } = await import('../src/world/MenuPanorama.js');
const { raycastVoxel, SelectionBox } = await import('../src/world/Raycast.js');
const { SkyRenderer } = await import('../src/world/SkyRenderer.js');
const { World } = await import('../src/world/World.js');

// 1. BlockRegistry & TextureAtlas Stage 4 checks
{
  const torch = BlockRegistry.get(BLOCK_IDS.TORCH);
  const glow = BlockRegistry.get(BLOCK_IDS.GLOWSTONE);
  const jack = BlockRegistry.get(BLOCK_IDS.JACK_O_LANTERN);
  const bedFoot = BlockRegistry.get(BLOCK_IDS.BED_FOOT);
  const bedHead = BlockRegistry.get(BLOCK_IDS.BED_HEAD);
  const redOre = BlockRegistry.get(BLOCK_IDS.REDSTONE_ORE);

  assert.equal(torch.lightEmission, 14);
  assert.equal(glow.lightEmission, 15);
  assert.equal(jack.lightEmission, 15);
  assert.equal(redOre.touchLightEmission, 9);
  assert.equal(torch.isTorch, true);
  assert.equal(bedFoot.isBed, true);
  assert.equal(bedHead.isBed, true);
  assert.ok(BlockRegistry.getLightOpacity(BLOCK_IDS.WATER) >= 2);
  assert.equal(BlockRegistry.getLightOpacity(BLOCK_IDS.STONE), 15);

  const atlas = new TextureAtlas();
  assert.ok(atlas.tiles.has('torch'));
  assert.ok(atlas.tiles.has('glowstone'));
  assert.ok(atlas.tiles.has('jack_o_lantern_face'));
  assert.ok(atlas.tiles.has('bed_head_top'));
  assert.ok(atlas.getBlockIconDataURL(torch).startsWith('data:'));
  assert.ok(atlas.getBlockIconDataURL(bedFoot).startsWith('data:'));
  console.log('✓ Stage 4 BlockRegistry & TextureAtlas passed');
}

// 2. SkyRenderer 24,000-tick cycle, Sun/Moon 8 phases, Stars, Clouds toggle & sleepToMorning
{
  const scene = new THREE.Scene();
  const sky = new SkyRenderer(scene, 6000, 1);
  assert.equal(DAY_LENGTH_TICKS, 24000);
  sky.update(0.016, 0, 70, 0, null);
  assert.ok(sky.sunIntensity > 0.95, `Noon sunIntensity should be ~1.0, got ${sky.sunIntensity}`);
  assert.equal(sky.starMat.opacity, 0);

  sky.setTime(18000, 3);
  sky.update(0.016, 0, 70, 0, null);
  assert.ok(sky.sunIntensity < 0.25, `Midnight sunIntensity should be low, got ${sky.sunIntensity}`);
  assert.ok(sky.starMat.opacity > 0.6, `Midnight stars must shine, got ${sky.starMat.opacity}`);
  assert.equal(sky.moonPhaseDrawn, (3 - 1) % 8);
  assert.ok(SLEEP_START_TICK === 12541 && SLEEP_END_TICK === 23458);

  sky.setCloudsEnabled(false);
  assert.equal(sky.cloudMesh.visible, false);
  sky.setCloudsEnabled(true);
  assert.equal(sky.cloudMesh.visible, true);

  sky.sleepToMorning();
  assert.equal(sky.worldTime, 0);
  assert.equal(sky.dayCount, 4);
  console.log('✓ SkyRenderer 24k ticks, 8-phase moon, stars & clouds toggle passed');
}

// 3. Dual-channel BFS LightingEngine (skyLight + blockLight + cross-chunk border propagation + cleanup + Redstone glow)
{
  const scene = new THREE.Scene();
  const atlas = new TextureAtlas();
  const world = new World(scene, atlas, 4242, 2);

  // Create flat test terrain across chunks (0,0) and (1,0):
  // Y=0..30 solid stone, Y=31..60 hollow sealed cave, Y=61..64 solid stone roof
  for (let cx = 0; cx <= 1; cx++) {
    const ch = new Chunk(cx, 0);
    for (let x = 0; x < 16; x++) {
      for (let z = 0; z < 16; z++) {
        for (let y = 0; y <= 30; y++) ch.setBlock(x, y, z, BLOCK_IDS.STONE);
        for (let y = 61; y <= 64; y++) ch.setBlock(x, y, z, BLOCK_IDS.STONE);
      }
    }
    ch.dirty = true;
    world.chunks.set(`${cx},0`, ch);
  }

  // Seal outer cave sides so no sky light enters
  const c0 = world.chunks.get('0,0');
  const c1 = world.chunks.get('1,0');
  for (let y = 31; y <= 60; y++) {
    for (let z = 0; z < 16; z++) {
      c0.setBlock(0, y, z, BLOCK_IDS.STONE);
      c1.setBlock(15, y, z, BLOCK_IDS.STONE);
    }
    for (let x = 0; x < 16; x++) {
      c0.setBlock(x, y, 0, BLOCK_IDS.STONE);
      c0.setBlock(x, y, 15, BLOCK_IDS.STONE);
      c1.setBlock(x, y, 0, BLOCK_IDS.STONE);
      c1.setBlock(x, y, 15, BLOCK_IDS.STONE);
    }
  }
  c0.isGenerated = true;
  c1.isGenerated = true;
  c0.maxY = 64;
  c1.maxY = 64;

  world.lighting.initChunkLighting(world, c0);
  world.lighting.initChunkLighting(world, c1);

  // Above stone roof: full skyLight = 15, blockLight = 0
  const above = world.getLightAt(8, 66, 8);
  assert.equal(above.sky, 15);
  assert.equal(above.block, 0);

  // Deep inside sealed cave: pitch dark 0 / 0!
  const deepCave = world.getLightAt(15, 40, 8);
  assert.equal(deepCave.sky, 0, 'Sealed cave must have 0 skyLight');
  assert.equal(deepCave.block, 0, 'Unlit cave must have 0 blockLight');

  // Place Torch (14) on chunk border x=15 in chunk (0,0) -> must propagate across x=16 into chunk (1,0)!
  world.setBlock(15, 40, 8, BLOCK_IDS.TORCH, true, true, 0);
  const atTorch = world.getLightAt(15, 40, 8);
  const neighborCrossChunk = world.getLightAt(16, 40, 8);
  const twoAwayCrossChunk = world.getLightAt(17, 40, 8);
  assert.equal(atTorch.block, 14);
  assert.equal(neighborCrossChunk.block, 13, 'Torch light must cross chunk border smoothly (14 -> 13)');
  assert.equal(twoAwayCrossChunk.block, 12);

  // Break Torch -> blockLight must return cleanly to 0 with zero artifacts
  world.setBlock(15, 40, 8, 0, true, true);
  assert.equal(world.getLightAt(15, 40, 8).block, 0);
  assert.equal(world.getLightAt(16, 40, 8).block, 0);

  // Sunlight overhang shadow check: open sky column at (12, 65, 12) is 15 -> place roof at y=68 -> sky drops below 15!
  assert.equal(world.getLightAt(12, 65, 12).sky, 15);
  world.setBlock(12, 68, 12, BLOCK_IDS.STONE, true, true);
  assert.ok(world.getLightAt(12, 65, 12).sky < 15, 'Roof block must cast shadow below');

  // Redstone Ore temporary glow (9) and automatic fade after 4.5s
  world.setBlock(8, 35, 8, BLOCK_IDS.REDSTONE_ORE, true, true);
  assert.equal(world.getLightAt(8, 36, 8).block, 0);
  world.triggerRedstoneGlow(8, 35, 8);
  assert.equal(world.getLightAt(8, 36, 8).block, 8, 'Glowing Redstone Ore (9) must illuminate air above to 8');
  world.update(8, 8, 5.0);
  assert.equal(world.getLightAt(8, 36, 8).block, 0, 'Redstone Ore glow must expire after 4.5s');

  world.dispose();
  console.log('✓ Dual-channel BFS LightingEngine, cross-chunk light & Redstone glow passed');
}

// 4. ChunkMesher 3D Torch/Bed meshes, aLight BufferAttribute & Dual-Light Shader Uniforms
{
  const atlas = new TextureAtlas();
  const mesher = new ChunkMesher(atlas);
  const c = new Chunk(0, 0);
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) {
      c.setBlock(x, 10, z, BLOCK_IDS.STONE);
    }
  }
  c.setBlock(4, 11, 4, BLOCK_IDS.TORCH);
  c.setMeta(4, 11, 4, 0);
  c.setBlock(6, 11, 4, BLOCK_IDS.TORCH);
  c.setMeta(6, 11, 4, 1); // Wall-tilted torch
  c.setBlock(8, 11, 4, BLOCK_IDS.BED_FOOT);
  c.setMeta(8, 11, 4, 0);
  c.setBlock(8, 11, 3, BLOCK_IDS.BED_HEAD);
  c.setMeta(8, 11, 3, 0);

  const built = mesher.buildChunkGeometries(c, new Array(9).fill(null));
  assert.ok(built.opaqueGeometry.getAttribute('aLight'), 'opaqueGeometry must have vec2 aLight attribute');
  assert.ok(built.cutoutGeometry.getAttribute('aLight'), 'cutoutGeometry must have vec2 aLight attribute');
  assert.ok(built.opaqueGeometry.getAttribute('position').count > 24, 'Bed halves must emit 3D vertices');
  assert.ok(built.cutoutGeometry.getAttribute('position').count >= 40, 'Floor + wall torches must emit 3D stick/flame vertices');

  assert.ok(mesher.lightUniforms?.uSunIntensity);
  assert.ok(mesher.lightUniforms?.uSkyTint);
  console.log('✓ ChunkMesher 3D Torch/Bed geometries & dual-light shader uniforms passed');
}

// 5. User Item-4 Fixes Verification
{
  // 5a. Reduced fly speed & starter hotbar Stage 4 items
  assert.ok(FLY_SPEED <= 10.5, `Expected reduced FLY_SPEED, got ${FLY_SPEED}`);
  const atlas = new TextureAtlas();
  const hotbar = new Hotbar(atlas, { creativeMode: true });
  hotbar.resetStarterKit();
  const ids = hotbar.slots.map((s) => s?.id);
  assert.ok(ids.includes(BLOCK_IDS.TORCH), 'Starter hotbar must include TORCH');
  assert.ok(ids.includes(BLOCK_IDS.BED_FOOT), 'Starter hotbar must include BED_FOOT');
  assert.ok(ids.includes(BLOCK_IDS.DANDELION), 'Starter hotbar must include DANDELION');

  // 5b. Cross-mesh plant (Dandelion) in 1st-person hand / ItemEntity is a flat sprite, NOT a 24-vertex cube!
  const dandelionGeo = buildBlockItemGeometry(atlas, BLOCK_IDS.DANDELION);
  assert.equal(dandelionGeo.getAttribute('position').count, 8, 'Dandelion held/dropped item must be a 2-sided flat sprite (8 verts), not a cube!');
  const torchGeo = buildBlockItemGeometry(atlas, BLOCK_IDS.TORCH);
  assert.equal(torchGeo.getAttribute('position').count, 20, 'Torch held item must be 3D stick+flame (5 faces = 20 verts)');
  const bedGeo = buildBlockItemGeometry(atlas, BLOCK_IDS.BED_FOOT);
  assert.ok(bedGeo.getAttribute('position').count > 24, 'Bed held item must be a 3D mini-bed');

  // Dynamic environment lighting on FirstPersonHand & PlayerModel
  const skinTex = createSteveSkinTexture();
  const hand = new FirstPersonHand(skinTex, atlas);
  const nightSkyTint = new THREE.Color(0.2, 0.3, 0.6);
  const warmTorchTint = new THREE.Color(1.0, 0.85, 0.65);
  hand.setHeldBlock(BLOCK_IDS.DANDELION);
  hand.setEnvironmentLight(0, 14, 0.2, nightSkyTint, warmTorchTint);
  assert.ok(hand.armMaterial.color.r > 0.5, 'Torchlit hand must brighten dynamically');
  const pModel = new PlayerModel(skinTex);
  pModel.setEnvironmentLight(0, 0, 0.2, nightSkyTint, warmTorchTint);
  assert.ok(pModel.material.color.r < 0.2, 'Unlit cave must darken Steve model');

  // 5c. Mobile joystick single push forward MUST NOT auto-sprint; double-push DOES sprint
  const fakePlayer = { touchInput: { moveX: 0, moveZ: 0, jump: false, crouch: false, sprint: false } };
  const mc = new MobileControls(fakePlayer);
  mc.joystickCenter = { x: 100, y: 100 };
  mc._updateJoystick(100, 100 - 70); // First full push forward
  assert.equal(fakePlayer.touchInput.sprint, false, 'Single forward push must NOT trigger sprint!');
  mc._updateJoystick(100, 100); // Release to neutral without lifting finger
  mc._updateJoystick(100, 100 - 70); // Second push forward within window
  assert.equal(fakePlayer.touchInput.sprint, true, 'Double forward push MUST trigger sprint!');

  // 5d. Water surfacing & reliable exit from 1-block swimming posture back to 1.8m standing
  const scene = new THREE.Scene();
  const world = new World(scene, atlas, 555, 1);
  const c = new Chunk(0, 0);
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) {
      c.setBlock(x, 10, z, BLOCK_IDS.STONE);
      for (let y = 11; y <= 14; y++) c.setBlock(x, y, z, BLOCK_IDS.WATER);
    }
  }
  c.isGenerated = true;
  c.maxY = 14;
  c.dirty = true;
  world.chunks.set('0,0', c);

  const cam = new THREE.PerspectiveCamera(72, 1, 0.1, 100);
  const ctrl = new PlayerController(cam, world, pModel, hand, { x: 8.5, y: 12.2, z: 8.5, flyMode: false });
  ctrl.touchInput.moveZ = 1;
  ctrl.touchInput.sprint = true;
  ctrl.update(0.05);
  assert.equal(ctrl.isSwimming, true, 'Sprinting underwater must enter 1-block swim posture');
  assert.equal(ctrl.getCurrentHitboxHeight(), PLAYER_SWIM_HEIGHT);

  // Stop sprinting and press jump to surface out of water -> should smoothly rise & restore 1.8m height!
  ctrl.touchInput.sprint = false;
  ctrl.touchInput.jump = true;
  for (let i = 0; i < 40; i++) ctrl.update(0.05);
  assert.equal(ctrl.isSwimming, false, 'Surfacing from water without ceiling must exit swim posture!');
  assert.equal(ctrl.getCurrentHitboxHeight(), PLAYER_HEIGHT, 'Player hitbox height must restore to 1.8m!');

  // 5e. Lightweight MenuPanorama (skybox cube, zero chunks)
  const pano = new MenuPanorama();
  assert.ok(pano.boxMesh && pano.boxMesh.geometry.attributes.position.count === 24);

  // 5f. Pure white crosshair in styles.css (no dark outline) & Raycast bounds for Torch/Bed
  const css = fs.readFileSync(path.join(rootDir, 'styles.css'), 'utf8');
  const idxCross = css.indexOf('#crosshair::before');
  const crosshairBlock = css.slice(idxCross, idxCross + 260);
  assert.ok(!crosshairBlock.includes('rgba(0, 0, 0'), '#crosshair must NOT have dark outline/shadow');
  assert.ok(crosshairBlock.includes('outline: none'), '#crosshair outline must be none');
  assert.ok(crosshairBlock.includes('#ffffff'), '#crosshair must be pure white #ffffff');

  const selBox = new SelectionBox(scene);
  const torchHit = raycastVoxel(world, { x: 4.5, y: 12.0, z: 4.5 }, { x: 0, y: -1, z: 0 });
  world.setBlock(4, 15, 4, BLOCK_IDS.TORCH, false, false, 0);
  const tHit = raycastVoxel(world, { x: 4.5, y: 16.5, z: 4.5 }, { x: 0, y: -1, z: 0 });
  assert.ok(tHit && tHit.blockId === BLOCK_IDS.TORCH);
  selBox.update(tHit, world);
  assert.ok(selBox.mesh.scale.y < 0.75, 'SelectionBox must tightly wrap Torch');
  if (torchHit) void torchHit;

  // 5g. SaveManager v4 persistence of worldTime, dayCount, spawnPoint & block meta
  const sm = new SaveManager();
  await sm.init();
  const created = await sm.createWorld({ name: 'Тест Света', seed: 9988 });
  await sm.saveWorld(created.id, {
    worldName: 'Тест Света',
    worldSeed: 9988,
    worldTime: 18500,
    dayCount: 4,
    spawnPoint: { x: 10.5, y: 65, z: 12.5 },
    player: { x: 10.5, y: 65, z: 12.5, yaw: 0, pitch: 0, flyMode: false, cameraMode: 0 },
    hotbar: hotbar.exportState(),
    modifiedBlocks: [[4, 15, 4, BLOCK_IDS.TORCH, 2]],
  });
  const loaded = await sm.loadWorld(created.id);
  assert.equal(loaded.worldTime, 18500);
  assert.equal(loaded.dayCount, 4);
  assert.equal(loaded.spawnPoint.x, 10.5);
  assert.equal(loaded.modifiedBlocks[0][4], 2, 'Block meta must survive save/load');

  world.dispose();
  console.log('✓ All User Item-4 fixes (dandelion sprite, joystick sprint, water/1.8m pose, MenuPanorama, white crosshair, SaveManager v4) passed');
}

// 6. Verify Stage 4 index.html DOM IDs & sw.js cache list
{
  const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(rootDir, 'sw.js'), 'utf8');
  for (const id of ['debug-container', 'time-test-bar', 'sleep-overlay', 'btn-clouds-mode']) {
    assert.ok(html.includes(`id="${id}"`), `index.html missing Stage 4 #${id}`);
  }
  for (const file of ['LightingEngine.js', 'SkyRenderer.js', 'MenuPanorama.js']) {
    assert.ok(sw.includes(file), `sw.js missing ${file}`);
  }
  console.log('✓ index.html Stage 4 IDs & sw.js asset cache verified');
}

console.log('\nALL STAGE 4 TESTS PASSED!');
