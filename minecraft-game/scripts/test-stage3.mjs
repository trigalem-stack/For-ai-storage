import assert from 'node:assert/strict';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import * as THREE from '../vendor/three.module.min.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
    clearRect() {},
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
const { BIOME_IDS, PLAYER_HALF_WIDTH, PLAYER_HEIGHT, PLAYER_SWIM_HEIGHT } = await import('../src/constants.js');
const { TextureAtlas } = await import('../src/textures/TextureAtlas.js');
const { createChunkGeneratorKernel } = await import('../src/world/ChunkGenKernel.js');
const { KERNEL_CONFIG } = await import('../src/world/BiomeManager.js');
const { WorldGen } = await import('../src/world/WorldGen.js');
const { Chunk } = await import('../src/world/Chunk.js');
const { ChunkMesher } = await import('../src/world/ChunkMesher.js');
const { World } = await import('../src/world/World.js');
const { raycastVoxel } = await import('../src/world/Raycast.js');
const { FallingBlockManager } = await import('../src/entities/FallingBlockEntity.js');
const { ItemEntityManager } = await import('../src/entities/ItemEntity.js');
const { FirstPersonHand } = await import('../src/player/FirstPersonHand.js');
const { createSteveSkinTexture, PlayerModel } = await import('../src/player/PlayerSkin.js');
const { PlayerController } = await import('../src/player/PlayerController.js');
const { Hotbar } = await import('../src/ui/Hotbar.js');
const { SaveManager } = await import('../src/storage/SaveManager.js');

async function runStage3Tests() {
  const atlas = new TextureAtlas();

  // 1. Multi-noise Biomes & Smooth 5x5 Transitions
  const gen = new WorldGen(314159);
  const seenBiomes = new Set();
  for (let z = -2200; z <= 2200; z += 110) {
    for (let x = -2200; x <= 2200; x += 110) {
      seenBiomes.add(gen.getBiomeAt(x, z));
    }
  }
  for (const reqBiome of [
    BIOME_IDS.PLAINS,
    BIOME_IDS.FOREST,
    BIOME_IDS.BIRCH_FOREST,
    BIOME_IDS.DESERT,
    BIOME_IDS.SNOWY_TAIGA,
    BIOME_IDS.MOUNTAINS,
    BIOME_IDS.SWAMP,
  ]) {
    assert.ok(seenBiomes.has(reqBiome), `Biome ${reqBiome} must appear naturally in the world`);
  }

  // Verify 5x5 heightmap smoothing prevents huge sheer cliff steps between neighboring columns
  let maxStep = 0;
  for (let x = -300; x < 300; x += 4) {
    const h1 = gen.getTerrainHeight(x, 0);
    const h2 = gen.getTerrainHeight(x + 1, 0);
    const step = Math.abs(h2 - h1);
    if (step > maxStep) maxStep = step;
  }
  assert.ok(maxStep <= 6, `5x5 smoothed biome boundaries should avoid vertical cliff jumps, maxStep=${maxStep}`);
  console.log(`✓ Multi-noise biomes (${seenBiomes.size} distinct biomes) & 5x5 smoothing (max step ${maxStep}) passed`);

  // 2. Desert, Snowy Taiga (Ice), Mountains (Snow + Emerald), Caves & Depth-Based Ores
  const oreCounts = {
    coal: 0, iron: 0, lapis: 0, gold: 0, redstone: 0, diamond: 0, emerald: 0,
    sandstone: 0, granite: 0, diorite: 0, andesite: 0, clay: 0, gravel: 0,
    ice: 0, cactus: 0, plants: 0, undergroundAir: 0,
  };
  const plantIds = new Set([
    BLOCK_IDS.TALL_GRASS, BLOCK_IDS.POPPY, BLOCK_IDS.DANDELION,
    BLOCK_IDS.DEAD_BUSH, BLOCK_IDS.RED_MUSHROOM, BLOCK_IDS.BROWN_MUSHROOM, BLOCK_IDS.BLUE_ORCHID,
  ]);
  const scannedCoords = [];
  // Find chunks containing desert, snowy taiga, mountains, swamp, forest
  const targetBiomes = new Map();
  for (let z = -2500; z <= 2500 && targetBiomes.size < 6; z += 96) {
    for (let x = -2500; x <= 2500 && targetBiomes.size < 6; x += 96) {
      const b = gen.getBiomeAt(x, z);
      if (!targetBiomes.has(b)) {
        targetBiomes.set(b, [Math.floor(x / 16), Math.floor(z / 16)]);
      }
    }
  }
  for (const [cx, cz] of targetBiomes.values()) {
    for (let dz = 0; dz <= 1; dz++) {
      for (let dx = 0; dx <= 1; dx++) {
        scannedCoords.push([cx + dx, cz + dz]);
      }
    }
  }

  for (const [cx, cz] of scannedCoords) {
    const ch = new Chunk(cx, cz);
    gen.generateChunk(ch);
    for (let z = 0; z < 16; z++) {
      for (let x = 0; x < 16; x++) {
        const biome = ch.getBiome(x, z);
        const surfH = gen.getTerrainHeight(cx * 16 + x, cz * 16 + z);
        for (let y = 0; y < 128; y++) {
          const id = ch.getBlock(x, y, z);
          if (id === BLOCK_IDS.COAL_ORE) {
            assert.ok(y >= 5 && y <= 115, `Coal ore at Y=${y}`);
            oreCounts.coal++;
          } else if (id === BLOCK_IDS.IRON_ORE) {
            assert.ok(y >= 5 && y <= 105, `Iron ore at Y=${y}`);
            oreCounts.iron++;
          } else if (id === BLOCK_IDS.LAPIS_ORE) {
            assert.ok(y >= 5 && y <= 32, `Lapis ore at Y=${y}`);
            oreCounts.lapis++;
          } else if (id === BLOCK_IDS.GOLD_ORE) {
            assert.ok(y >= 5 && y <= 32, `Gold ore at Y=${y}`);
            oreCounts.gold++;
          } else if (id === BLOCK_IDS.REDSTONE_ORE) {
            assert.ok(y >= 5 && y <= 16, `Redstone ore at Y=${y}`);
            oreCounts.redstone++;
          } else if (id === BLOCK_IDS.DIAMOND_ORE) {
            assert.ok(y >= 5 && y <= 16, `Diamond ore at Y=${y}`);
            oreCounts.diamond++;
          } else if (id === BLOCK_IDS.EMERALD_ORE) {
            assert.equal(biome, BIOME_IDS.MOUNTAINS, 'Emerald must spawn only in Mountains');
            oreCounts.emerald++;
          } else if (id === BLOCK_IDS.SANDSTONE) oreCounts.sandstone++;
          else if (id === BLOCK_IDS.GRANITE) oreCounts.granite++;
          else if (id === BLOCK_IDS.DIORITE) oreCounts.diorite++;
          else if (id === BLOCK_IDS.ANDESITE) oreCounts.andesite++;
          else if (id === BLOCK_IDS.CLAY) oreCounts.clay++;
          else if (id === BLOCK_IDS.GRAVEL) oreCounts.gravel++;
          else if (id === BLOCK_IDS.ICE) oreCounts.ice++;
          else if (id === BLOCK_IDS.CACTUS) oreCounts.cactus++;
          else if (plantIds.has(id)) oreCounts.plants++;
          else if (id === BLOCK_IDS.AIR && y >= 5 && y < surfH - 3) oreCounts.undergroundAir++;
        }
      }
    }
  }

  assert.ok(oreCounts.undergroundAir > 50, '3D caves & ravines must carve underground air spaces');
  assert.ok(oreCounts.coal > 20 && oreCounts.iron > 10 && oreCounts.diamond > 0, `Ores must generate: ${JSON.stringify(oreCounts)}`);
  assert.ok(oreCounts.lapis > 0 && oreCounts.gold > 0 && oreCounts.redstone > 0, `Deep ores must generate: ${JSON.stringify(oreCounts)}`);
  assert.ok(oreCounts.sandstone > 50 && oreCounts.granite > 0 && oreCounts.diorite > 0 && oreCounts.andesite > 0, 'Sandstone & stone variants must generate');
  assert.ok(oreCounts.plants > 0, 'Cross-mesh plants must generate on terrain');
  console.log(`✓ Caves (${oreCounts.undergroundAir} air), ores (coal=${oreCounts.coal}, iron=${oreCounts.iron}, diamond=${oreCounts.diamond}, redstone=${oreCounts.redstone}, lapis=${oreCounts.lapis}, gold=${oreCounts.gold}, emerald=${oreCounts.emerald}) & biome features passed`);

  // 3. Cross-mesh, Inset Cactus, & DDA targeting plants
  const mesher = new ChunkMesher(atlas);
  const testCh = new Chunk(0, 0);
  testCh.setBlock(3, 65, 3, BLOCK_IDS.POPPY);
  testCh.setBlock(4, 65, 3, BLOCK_IDS.CACTUS);
  testCh.setBlock(5, 65, 3, BLOCK_IDS.ICE);
  const geomRes = mesher.buildChunkGeometries(testCh, () => 0);
  assert.ok(geomRes.cutoutGeometry && geomRes.iceGeometry, 'Poppy/Cactus must emit cutoutGeometry and Ice iceGeometry');
  geomRes.cutoutGeometry.dispose();
  geomRes.iceGeometry.dispose();
  geomRes.waterGeometry?.dispose();

  const scene = new THREE.Scene();
  const world = new World(scene, atlas, 42, 2, { useWorkers: false, fogEnabled: false });
  world.preloadSpawnArea(0, 0, 1);
  assert.equal(scene.fog, null, 'fogEnabled: false must completely disable scene.fog');

  // Clear flat arena at Y=65
  for (let z = 0; z < 16; z++) {
    for (let x = 0; x < 16; x++) {
      world.setBlock(x, 64, z, BLOCK_IDS.STONE, false, false);
      for (let y = 65; y < 80; y++) world.setBlock(x, y, z, BLOCK_IDS.AIR, false, false);
    }
  }
  world.setBlock(8, 65, 8, BLOCK_IDS.DANDELION, false, false);
  const plantHit = raycastVoxel(world, { x: 6.5, y: 65.5, z: 8.5 }, { x: 1, y: 0, z: 0 });
  assert.ok(plantHit && plantHit.blockId === BLOCK_IDS.DANDELION, 'DDA raycast must target non-solid X-plants');
  console.log('✓ Cross-mesh plants, Cactus inset, Ice rendering, fog=null & plant raycast passed');

  // 4. FallingBlockEntity (Sand & Gravel gravity + drop onto flower)
  const itemMgr = new ItemEntityManager(scene, atlas);
  const fallingMgr = new FallingBlockManager(scene, atlas);
  world.onBlockChanged = (wx, wy, wz, id) => {
    if (BlockRegistry.fallsWithGravity(id)) fallingMgr.scheduleStabilityCheck(wx, wy, wz);
    else fallingMgr.scheduleStabilityCheck(wx, wy + 1, wz);
  };
  // Stack sand above stone support, then break the support block
  world.setBlock(4, 67, 4, BLOCK_IDS.STONE, false, false);
  world.setBlock(4, 68, 4, BLOCK_IDS.SAND, false, false);
  world.setBlock(4, 69, 4, BLOCK_IDS.GRAVEL, false, false);
  world.setBlock(4, 67, 4, BLOCK_IDS.AIR, false, true); // triggers gravity on column above!
  for (let i = 0; i < 60; i++) {
    fallingMgr.update(0.025, world, itemMgr, true);
  }
  assert.equal(world.getBlock(4, 65, 4), BLOCK_IDS.SAND, 'Unsupported Sand must fall onto Y=64 stone and settle at Y=65');
  assert.equal(world.getBlock(4, 66, 4), BLOCK_IDS.GRAVEL, 'Gravel stacked above Sand must cascade and settle at Y=66');

  // Falling sand onto flower produces ItemEntity drop
  world.setBlock(6, 65, 6, BLOCK_IDS.POPPY, false, false);
  world.setBlock(6, 68, 6, BLOCK_IDS.SAND, false, true); // triggers immediately
  for (let i = 0; i < 60; i++) {
    fallingMgr.update(0.025, world, itemMgr, true);
  }
  assert.ok(itemMgr.entities.some((e) => e.blockId === BLOCK_IDS.SAND), 'Sand landing on a flower must break into ItemEntity');
  fallingMgr.dispose();
  itemMgr.dispose();
  console.log('✓ FallingBlockEntity Sand & Gravel cascade + plant-break drop passed');

  // 5. Water 1-block swimming & shore hop + Dry land 1-block guard + Creative Hotbar
  const skinTex = createSteveSkinTexture();
  const model = new PlayerModel(skinTex);
  const hand = new FirstPersonHand(skinTex, atlas);
  const cam = new THREE.PerspectiveCamera(72, 16 / 9, 0.1, 500);

  // Build water pool at z=2..10, y=64..66 (2 blocks deep) with dry shore block at (5, 66, 2)
  for (let z = 3; z <= 8; z++) {
    world.setBlock(5, 65, z, BLOCK_IDS.WATER, false, false);
    world.setBlock(5, 66, z, BLOCK_IDS.WATER, false, false);
  }
  world.setBlock(5, 65, 2, BLOCK_IDS.GRASS, false, false);
  world.setBlock(5, 66, 2, BLOCK_IDS.GRASS, false, false);

  const ctrl = new PlayerController(cam, world, model, hand, { x: 5.5, y: 65.1, z: 5.5 });
  // Dry land sprint must NOT shrink hitbox to 1 block
  ctrl.y = 65;
  ctrl.x = 12.5;
  ctrl.z = 12.5;
  ctrl.touchInput.moveZ = 1;
  ctrl.touchInput.sprint = true;
  ctrl.update(0.1);
  assert.equal(ctrl.getCurrentHitboxHeight(), PLAYER_HEIGHT, 'Dry land sprint must keep 1.8m hitbox');

  // Submerged sprint MUST activate 1-block swim hitbox
  ctrl.x = 5.5;
  ctrl.y = 65.05;
  ctrl.z = 5.5;
  ctrl.update(0.1);
  assert.equal(ctrl.getCurrentHitboxHeight(), PLAYER_SWIM_HEIGHT, 'Submerged sprint must enter 1-block swim posture');

  // At surface edge of water pressing jump must give strong boost onto shore
  ctrl.x = 5.5;
  ctrl.y = 66.0;
  ctrl.z = 3.2;
  ctrl.isSwimming = false;
  ctrl.touchInput.sprint = false;
  ctrl.touchInput.moveZ = 1; // forward (-Z toward shore at z=2)
  ctrl.touchInput.jump = true;
  ctrl.update(0.05);
  assert.ok(ctrl.vy >= 6.5, `Water surface jump near shore must boost >= 6.5 m/s to climb shore block, got ${ctrl.vy}`);

  ctrl.dispose();
  hand.dispose();
  model.dispose();
  world.dispose();
  console.log('✓ Water 1-block submerged swim, dry-land guard & shore-hop physics passed');

  // 6. Creative Hotbar & Multi-World SaveManager
  const hotbar = new Hotbar(atlas, { creativeMode: true });
  const initialCount = hotbar.getSelectedSlot().count;
  assert.equal(hotbar.consumeSelected(1), true);
  assert.equal(hotbar.getSelectedSlot().count, initialCount, 'Creative mode must not consume hotbar blocks');
  hotbar.pickBlock(BLOCK_IDS.EMERALD_ORE);
  assert.equal(hotbar.getSelectedSlot().id, BLOCK_IDS.EMERALD_ORE, 'Pick-block must select Emerald Ore');
  hotbar.dispose();

  const saveMgr = new SaveManager();
  await saveMgr.init();
  const w1 = await saveMgr.createWorld({ name: 'Горы и Пещеры', seed: 101 });
  const w2 = await saveMgr.createWorld({ name: 'Пустыня', seed: 202 });
  await saveMgr.saveWorld(w1.id, {
    worldName: w1.name,
    worldSeed: 101,
    player: { x: 10, y: 80, z: -5, yaw: 0.5, pitch: 0 },
    modifiedBlocks: [[1, 65, 1, BLOCK_IDS.DIAMOND_ORE]],
  });
  await saveMgr.saveSettings({ fogEnabled: false, renderDistance: 8, unlimitedMemory: true });
  const list = await saveMgr.listWorlds();
  assert.equal(list.length, 2);
  const loadedW1 = await saveMgr.loadWorld(w1.id);
  assert.equal(loadedW1.modifiedBlocks.length, 1);
  const loadedSettings = await saveMgr.loadSettings();
  assert.equal(loadedSettings.fogEnabled, false);
  await saveMgr.deleteWorld(w2.id);
  assert.equal((await saveMgr.listWorlds()).length, 1);
  console.log('✓ Creative Hotbar & Multi-World + Settings SaveManager passed');

  // 7. Self-contained Blob Web Worker Kernel syntax & execution verification
  const workerWrapperCode = `
    const KERNEL = (${createChunkGeneratorKernel.toString()})(${JSON.stringify(KERNEL_CONFIG)});
    const out = KERNEL.generateChunkData(12345, 0, 0);
    if (!out || out.blocks.length !== 32768 || out.biomes.length !== 256) {
      throw new Error('Worker kernel invalid output');
    }
  `;
  new vm.Script(workerWrapperCode).runInNewContext({
    Uint8Array, Float32Array, Map, Math, String, Number, Object, Error,
  });
  console.log('✓ Offline Blob Web Worker ChunkGenKernel isolated compilation & execution passed');

  console.log('\nALL STAGE 3 TESTS PASSED!');
}

runStage3Tests().catch((err) => {
  console.error(err);
  process.exit(1);
});
