import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from '../vendor/three.module.min.js';
import { SoundManager } from '../src/audio/SoundManager.js';
import { BLOCK_IDS } from '../src/blocks/BlockRegistry.js';
import {
  CREATIVE_VOID_Y,
  ENDERMAN_STARE_HOLD_SEC,
  MAX_RENDER_DISTANCE,
  MOB_FOLLOW_RANGE,
} from '../src/constants.js';
import { EntityManager } from '../src/entities/EntityManager.js';
import { Mob } from '../src/entities/Mob.js';
import { Inventory } from '../src/items/Inventory.js';
import { ITEM_IDS } from '../src/items/ItemIds.js';
import { FirstPersonHand } from '../src/player/FirstPersonHand.js';
import { PlayerController } from '../src/player/PlayerController.js';
import {
  InventoryPlayerPreview,
  PlayerModel,
  SKIN_PRESETS,
  createSkinTextureFromSpec,
} from '../src/player/PlayerSkin.js';
import { SaveManager } from '../src/storage/SaveManager.js';
import { TextureAtlas } from '../src/textures/TextureAtlas.js';
import { Hotbar } from '../src/ui/Hotbar.js';
import { InventoryUI } from '../src/ui/InventoryUI.js';
import { numChunkKey } from '../src/world/Chunk.js';
import { WorldGen } from '../src/world/WorldGen.js';
import { MenuPanorama } from '../src/world/MenuPanorama.js';
import { World } from '../src/world/World.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function makeDocumentStub() {
  const mkEl = (tag = 'div') => {
    const el = {
      tagName: tag.toUpperCase(),
      style: { setProperty() {} },
      className: '',
      textContent: '',
      innerHTML: '',
      value: '',
      dataset: {},
      children: [],
      classList: {
        _set: new Set(),
        add(c) { this._set.add(c); },
        remove(c) { this._set.delete(c); },
        toggle(c, force) {
          if (force === undefined) {
            if (this._set.has(c)) this._set.delete(c);
            else this._set.add(c);
          } else if (force) {
            this._set.add(c);
          } else {
            this._set.delete(c);
          }
        },
        contains(c) { return this._set.has(c); },
      },
      addEventListener() {},
      removeEventListener() {},
      setAttribute() {},
      getAttribute() { return null; },
      closest() { return null; },
      contains() { return false; },
      append(...nodes) { this.children.push(...nodes); },
      appendChild(node) { this.children.push(node); return node; },
      querySelectorAll() { return []; },
      querySelector() { return null; },
      getBoundingClientRect() { return { left: 100, top: 80, width: 120, height: 150, right: 220, bottom: 230 }; },
      focus() {},
      remove() {},
    };
    return el;
  };
  const canvasStub = () => ({
    width: 64,
    height: 64,
    style: {},
    getContext() {
      return {
        imageSmoothingEnabled: false,
        fillStyle: '#000',
        strokeStyle: '#000',
        lineWidth: 1,
        font: '10px sans-serif',
        textAlign: 'left',
        textBaseline: 'top',
        fillRect() {},
        strokeRect() {},
        clearRect() {},
        beginPath() {},
        moveTo() {},
        lineTo() {},
        stroke() {},
        fill() {},
        arc() {},
        fillText() {},
        drawImage() {},
        save() {},
        restore() {},
        translate() {},
        transform() {},
        setTransform() {},
        scale() {},
        rotate() {},
        clip() {},
        createLinearGradient() { return { addColorStop() {} }; },
        getImageData() { return { data: new Uint8ClampedArray(64 * 64 * 4) }; },
        putImageData() {},
        createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
      };
    },
    toDataURL() { return 'data:image/png;base64,iVBORw0KGgo='; },
  });

  const byId = new Map();
  globalThis.document = {
    body: mkEl('body'),
    documentElement: mkEl('html'),
    pointerLockElement: null,
    createElement(tag) {
      if (tag === 'canvas') return canvasStub();
      return mkEl(tag);
    },
    getElementById(id) {
      if (!byId.has(id)) byId.set(id, mkEl('div'));
      return byId.get(id);
    },
    querySelectorAll() { return []; },
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.window = {
    innerWidth: 1280,
    innerHeight: 720,
    devicePixelRatio: 1,
    addEventListener() {},
    removeEventListener() {},
    localStorage: {
      _map: new Map(),
      getItem(k) { return this._map.has(k) ? this._map.get(k) : null; },
      setItem(k, v) { this._map.set(k, String(v)); },
      removeItem(k) { this._map.delete(k); },
    },
  };
  globalThis.localStorage = globalThis.window.localStorage;
  if (!globalThis.navigator) {
    Object.defineProperty(globalThis, 'navigator', {
      value: { maxTouchPoints: 0, userAgent: 'NodeTest' },
      configurable: true,
    });
  }
}

makeDocumentStub();

async function runTests() {
  console.log('1. Testing Stage 9 constants & superflat/climate kernel...');
  assert.equal(MAX_RENDER_DISTANCE, 12);
  assert.equal(MOB_FOLLOW_RANGE, 16.0);
  assert.ok(ENDERMAN_STARE_HOLD_SEC >= 0.2);
  assert.equal(CREATIVE_VOID_Y, -64);

  const flatGen = new WorldGen(12345, 'superflat');
  const flatData = flatGen.kernel.generateChunkData(flatGen.seed, 0, 0, 'superflat');
  assert.equal(flatData.blocks[(0 * 16 + 0) * 16 + 0], BLOCK_IDS.BEDROCK);
  assert.equal(flatData.blocks[(1 * 16 + 0) * 16 + 0], BLOCK_IDS.DIRT);
  assert.equal(flatData.blocks[(2 * 16 + 0) * 16 + 0], BLOCK_IDS.DIRT);
  assert.equal(flatData.blocks[(3 * 16 + 0) * 16 + 0], BLOCK_IDS.GRASS);
  assert.equal(flatData.blocks[(4 * 16 + 0) * 16 + 0], BLOCK_IDS.AIR);

  // Sample 9 chunks around spawn to ensure surface is mostly land & surface lava is rare
  const defaultGen = new WorldGen(987654, 'default');
  let totalCols = 0;
  let lavaSurfaceCols = 0;
  for (let cx = -1; cx <= 1; cx++) {
    for (let cz = -1; cz <= 1; cz++) {
      const c = defaultGen.kernel.generateChunkData(defaultGen.seed, cx, cz, 'default');
      for (let lx = 0; lx < 16; lx++) {
        for (let lz = 0; lz < 16; lz++) {
          totalCols++;
          for (let y = 127; y >= 50; y--) {
            const b = c.blocks[(y * 16 + lz) * 16 + lx];
            if (b !== 0) {
              if (b === BLOCK_IDS.LAVA) lavaSurfaceCols++;
              break;
            }
          }
        }
      }
    }
  }
  assert.ok(lavaSurfaceCols / totalCols < 0.03, `Surface lava should be rare (<3%), got ${lavaSurfaceCols}/${totalCols}`);
  console.log('   OK.');

  console.log('2. Testing World SyncedChunkMap, numChunkKey, dirtyChunks, & clean disposal...');
  const scene = new THREE.Scene();
  const atlas = new TextureAtlas();
  const world = new World(scene, atlas, 424242, 2, { worldType: 'superflat' });
  world.preloadSpawnArea(0, 0, 2);
  assert.ok(world.chunks.size >= 21);
  assert.ok(world.chunkGrid.has(numChunkKey(0, 0)));
  assert.equal(world.getBlock(8, 3, 8), BLOCK_IDS.GRASS);
  assert.equal(world.getBlock(8, 4, 8), BLOCK_IDS.AIR);
  world.setBlock(8, 4, 8, BLOCK_IDS.STONE, true, true, 0);
  assert.equal(world.getBlock(8, 4, 8), BLOCK_IDS.STONE);
  world.dispose();
  assert.equal(world.chunks.size, 0);
  assert.equal(world.chunkGrid.size, 0);
  assert.equal(world.dirtyChunks.size, 0);
  console.log('   OK.');

  console.log('3. Testing Creative flight floor -58 & void damage below -64...');
  const flyWorld = new World(scene, atlas, 55555, 1, { worldType: 'superflat' });
  flyWorld.preloadSpawnArea(0, 0, 1);
  const cam = new THREE.PerspectiveCamera(70, 1, 0.1, 200);
  const skinTex = createSkinTextureFromSpec({ preset: 'steve' });
  const pModel = new PlayerModel(skinTex, atlas);
  const fpHand = new FirstPersonHand(skinTex, atlas);
  let damageTaken = 0;
  const player = new PlayerController(cam, flyWorld, pModel, fpHand, {
    x: 4,
    y: -50,
    z: 4,
    creativeMode: true,
    flyMode: true,
    onDamage: (info) => { damageTaken += (info?.finalDmg || info?.amount || 0); },
  });
  // Descend in flyMode below y=0 -> clamped cleanly at -58 without freezing at y=1
  player.keys.ShiftLeft = true;
  for (let i = 0; i < 60; i++) {
    player.update(0.05);
  }
  assert.ok(player.y < -40 && player.y >= -58.01, `Creative fly should descend to -58, got y=${player.y}`);

  // Fall below CREATIVE_VOID_Y (-64) -> even Creative receives void damage
  player.flyMode = false;
  player.y = CREATIVE_VOID_Y - 3;
  for (let i = 0; i < 15; i++) {
    player.update(0.05);
  }
  assert.ok(damageTaken > 0, `Void below -64 must damage even in Creative, got ${damageTaken}`);
  player.dispose();
  fpHand.dispose();
  pModel.dispose();
  flyWorld.dispose();
  console.log('   OK.');

  console.log('4. Testing Java 1.21 Mob AI (LOS, followRange 16, Enderman stare hold + pumpkin, shared geometries)...');
  const aiWorld = new World(scene, atlas, 77777, 1, { worldType: 'superflat' });
  aiWorld.preloadSpawnArea(0, 0, 1);
  // Build a solid stone wall between player (4, 4, 4) and zombie (4, 4, 12)
  for (let wx = 2; wx <= 6; wx++) {
    for (let wy = 4; wy <= 7; wy++) {
      aiWorld.setBlock(wx, wy, 8, BLOCK_IDS.STONE, true, false, 0);
    }
  }
  const zombie = new Mob(scene, 'zombie', 4.5, 4, 12.5);
  const zombie2 = new Mob(scene, 'zombie', 6.5, 4, 12.5);
  // Verify geometry sharing between identical mob instances
  let geom1 = null;
  let geom2 = null;
  zombie.visual.root.traverse((obj) => { if (!geom1 && obj.isMesh) geom1 = obj.geometry; });
  zombie2.visual.root.traverse((obj) => { if (!geom2 && obj.isMesh) geom2 = obj.geometry; });
  assert.ok(geom1 && geom1 === geom2, 'Mobs must share box geometries');
  assert.equal(zombie.hasLineOfSight(aiWorld, 4.5, 5.6, 4.5), false, 'Stone wall should block zombie LOS');
  aiWorld.setBlock(4, 5, 8, 0, true, false, 0);
  aiWorld.setBlock(4, 6, 8, 0, true, false, 0);
  assert.equal(zombie.hasLineOfSight(aiWorld, 4.5, 5.6, 4.5), true, 'Opening wall restores LOS');

  // Clear stone wall before Enderman stare cone + pumpkin immunity + 0.22s hold test
  for (let wx = 2; wx <= 6; wx++) {
    for (let wy = 4; wy <= 7; wy++) {
      aiWorld.setBlock(wx, wy, 8, 0, true, false, 0);
    }
  }
  const em = new EntityManager(scene, atlas);
  const enderman = new Mob(scene, 'enderman', 4.5, 4, 10.5);
  em.mobs.push(enderman);
  const fakePlayer = {
    x: 4.5,
    y: 4,
    z: 4.5,
    position: { x: 4.5, y: 4, z: 4.5 },
    isDead: false,
    creativeMode: false,
    armor: [null, null, null, null],
    getEyeOrigin() { return { x: this.x, y: this.y + 1.62, z: this.z }; },
    getLookDirection() {
      const dx = enderman.x - this.x;
      const dy = (enderman.y + enderman.eyeHeight) - (this.y + 1.62);
      const dz = enderman.z - this.z;
      const len = Math.hypot(dx, dy, dz);
      return { x: dx / len, y: dy / len, z: dz / len };
    },
    inventory: new Inventory({ creativeMode: false }),
    applyDamage() { return false; },
  };
  // Brief glance (< 0.22s) should NOT immediately aggro
  em.update(0.05, { world: aiWorld, player: fakePlayer });
  assert.equal(enderman.aggro, false, 'Enderman must require >= 0.22s sustained stare');
  // Wearing Pumpkin on head blocks aggro completely even on long stare
  fakePlayer.inventory.armor.helmet = { id: BLOCK_IDS.PUMPKIN, count: 1 };
  for (let i = 0; i < 10; i++) em.update(0.05, { world: aiWorld, player: fakePlayer });
  assert.equal(enderman.aggro, false, 'Pumpkin helmet must prevent Enderman aggro');
  // Remove pumpkin and stare >= 0.25s -> Enderman aggros!
  fakePlayer.inventory.armor.helmet = null;
  for (let i = 0; i < 6; i++) em.update(0.06, { world: aiWorld, player: fakePlayer });
  assert.equal(enderman.aggro, true, 'Sustained stare without pumpkin must aggro Enderman');
  em.clear();
  zombie.dispose(scene);
  zombie2.dispose(scene);
  aiWorld.dispose();
  console.log('   OK.');

  console.log('5. Testing SoundManager offline synthesis & volume channels...');
  const snd = new SoundManager();
  snd.setVolumes({ master: 75, music: 40, blocks: 90, hostile: 55, ui: 100 });
  assert.equal(snd.volumes.master, 75);
  assert.equal(snd.volumes.music, 40);
  snd.setChannelVolume('music', 50);
  assert.equal(snd.volumes.music, 50);
  // Methods must run cleanly in headless environments without AudioContext
  snd.playBlockBreak(BLOCK_IDS.STONE);
  snd.playBlockPlace(BLOCK_IDS.OAK_PLANKS);
  snd.playStep(BLOCK_IDS.GRASS);
  snd.playHit();
  snd.playHurt(true);
  snd.playEat();
  snd.playBurp();
  snd.playBowShoot();
  snd.playSplash();
  snd.playXpOrb();
  snd.playUiClick();
  snd.updateMusic(0.5, true);
  console.log('   OK.');

  console.log('6. Testing SaveManager v9: migration, RLE+gzip compression, rename, export/import, worldType/hardcore...');
  const sm = new SaveManager();
  await sm.init();
  // Default unnamed world should be named "Мой Мир #1"
  const unnamedWorld = await sm.createWorld({ name: '', seed: 101 });
  assert.equal(unnamedWorld.name, 'Мой Мир #1', 'Default unnamed first world should be "Мой Мир #1"');

  // Legacy world_1 named "Мой мир" should migrate to "Мой Мир #1"
  const smMig = new SaveManager();
  await smMig._putRaw('worlds_index', [{ id: 'world_1', name: 'Мой мир', seed: 99 }]);
  await smMig._putRaw('world_data:world_1', { id: 'world_1', name: 'Мой мир', worldSeed: 99 });
  await smMig._migrateLegacyIfNeeded();
  const migList = await smMig.listWorlds();
  assert.equal(migList[0].name, 'Мой Мир #1');

  const hcWorld = await sm.createWorld({
    name: 'Хардкор Плоский',
    seed: 2026,
    gameMode: 'creative', // hardcore must override to survival
    worldType: 'superflat',
    hardcore: true,
    bonusChest: true,
  });
  assert.equal(hcWorld.gameMode, 'survival');
  assert.equal(hcWorld.worldType, 'superflat');
  assert.equal(hcWorld.hardcore, true);
  assert.equal(hcWorld.bonusChest, true);

  // Large modifiedBlocks list (>= 256) should compress cleanly & round-trip identically
  const manyMods = [];
  for (let i = 0; i < 420; i++) {
    manyMods.push([i % 32, 10 + (i % 5), Math.floor(i / 32), BLOCK_IDS.STONE, (i % 3) + 1]);
  }
  await sm.saveWorld(hcWorld.id, {
    worldName: hcWorld.name,
    gameMode: 'survival',
    worldType: 'superflat',
    hardcore: true,
    bonusChest: true,
    bonusChestPlaced: true,
    dead: false,
    worldSeed: 2026,
    worldTime: 1200,
    dayCount: 2,
    player: { x: 2, y: 4, z: 2, yaw: 0, pitch: 0 },
    modifiedBlocks: manyMods,
  });

  const loadedHc = await sm.loadWorld(hcWorld.id);
  assert.equal(loadedHc.version, 8);
  assert.equal(loadedHc.schemaVersion, 9);
  assert.equal(loadedHc.worldType, 'superflat');
  assert.equal(loadedHc.hardcore, true);
  assert.equal(loadedHc.bonusChestPlaced, true);
  assert.equal(loadedHc.modifiedBlocks.length, 420);
  // Check exact tuple match by coordinate key (RLE sorts spatially by y, z, x)
  const expectedSet = new Set(manyMods.map((m) => m.join(',')));
  for (const m of loadedHc.modifiedBlocks) {
    assert.ok(expectedSet.has(m.join(',')), `Unexpected modified block ${m.join(',')}`);
  }

  await sm.renameWorld(hcWorld.id, 'Супер Хардкор');
  const exportedJson = await sm.exportWorldJson(hcWorld.id);
  assert.ok(exportedJson && exportedJson.includes('Супер Хардкор'));
  const importedMeta = await sm.importWorldJson(exportedJson);
  assert.equal(importedMeta.name, 'Супер Хардкор');
  assert.equal(importedMeta.worldType, 'superflat');
  assert.equal(importedMeta.hardcore, true);
  const importedData = await sm.loadWorld(importedMeta.id);
  assert.equal(importedData.modifiedBlocks.length, 420);
  console.log('   OK.');

  console.log('7. Testing PlayerSkin presets, MenuPanorama 3D + 24-vert boxMesh, & UI caches...');
  assert.ok(
    Array.isArray(SKIN_PRESETS) &&
    SKIN_PRESETS.some((p) => p.id === 'steve') &&
    SKIN_PRESETS.some((p) => p.id === 'alex') &&
    SKIN_PRESETS.some((p) => p.id === 'knight')
  );
  const knightTex = createSkinTextureFromSpec({ preset: 'knight' });
  const preview = new InventoryPlayerPreview(knightTex, atlas);
  preview.setSkinTexture(knightTex);
  preview.dispose();

  const pano = new MenuPanorama();
  assert.ok(pano.boxMesh && pano.boxMesh.geometry.attributes.position.count === 24);
  assert.ok(pano.scene && pano.scene.children.length > 1 && pano.disposables.length > 0);
  pano.dispose();

  const inv = new Inventory({ creativeMode: true });
  inv.setSlot(0, { id: ITEM_IDS.STONE_PICKAXE, count: 1, durability: 100 });
  const hotbar = new Hotbar(atlas, { inventory: inv, creativeMode: true, initStarter: false });
  hotbar.render();
  assert.ok(hotbar.slotEls[0].lastSig && hotbar.slotEls[0].lastSig.startsWith(`${ITEM_IDS.STONE_PICKAXE}:1:100:`));

  const invUi = new InventoryUI(atlas, inv, null, {});
  invUi.creativeSearch = 'алмаз';
  const filtered = invUi._getCreativeCatalogEntries(invUi.creativeCategory, invUi.creativeSearch);
  assert.ok(filtered.length > 0 && filtered.every((entry) => entry.id > 0));
  console.log('   OK.');

  console.log('8. Verifying sw.js CORE_ASSETS completeness & existence on disk...');
  const swText = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  assert.ok(swText.includes('./src/audio/SoundManager.js'), 'sw.js must cache SoundManager.js');
  const assetMatches = [...swText.matchAll(/'(\.\/[^']*)'/g)].map((m) => m[1]);
  assert.ok(assetMatches.length >= 48);
  for (const rel of assetMatches) {
    if (rel === './') continue;
    const diskPath = path.join(ROOT, rel.slice(2));
    assert.ok(fs.existsSync(diskPath), `Missing sw.js asset on disk: ${rel}`);
  }
  console.log(`   OK (${assetMatches.length} assets verified).`);

  console.log('ALL STAGE 9 TESTS PASSED.');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
