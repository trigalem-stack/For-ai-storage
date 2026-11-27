import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const GL_MOCK_CONSTS = {
  VERSION: 0x1F02, VENDOR: 0x1F00, RENDERER: 0x1F01, SHADING_LANGUAGE_VERSION: 0x8B8C,
  MAX_COMBINED_TEXTURE_IMAGE_UNITS: 0x8B4D, MAX_TEXTURE_SIZE: 0x0D33, MAX_CUBE_MAP_TEXTURE_SIZE: 0x851C,
  MAX_TEXTURE_IMAGE_UNITS: 0x8872, MAX_VERTEX_TEXTURE_IMAGE_UNITS: 0x8B4C, MAX_VERTEX_ATTRIBS: 0x8869,
  MAX_VERTEX_UNIFORM_VECTORS: 0x8DFB, MAX_FRAGMENT_UNIFORM_VECTORS: 0x8DFD, MAX_VARYING_VECTORS: 0x8DFC,
  MAX_SAMPLES: 0x8D57, SCISSOR_BOX: 0x0C10, VIEWPORT: 0x0BA2, MAX_COLOR_ATTACHMENTS: 0x8CDF, MAX_DRAW_BUFFERS: 0x8824,
  ACTIVE_TEXTURE: 0x84E0, FRAMEBUFFER_COMPLETE: 0x8CD5, COMPILE_STATUS: 0x8B81, LINK_STATUS: 0x8B82,
  ACTIVE_UNIFORMS: 0x8B86, ACTIVE_ATTRIBUTES: 0x8B89, DELETE_STATUS: 0x8B80, VALIDATE_STATUS: 0x8B83,
  TRIANGLES: 0x0004, UNSIGNED_SHORT: 0x1403, UNSIGNED_INT: 0x1405,
};

function makeWebGLShim() {
  return new Proxy({ ...GL_MOCK_CONSTS }, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === 'getExtension') return () => ({});
      if (prop === 'getParameter') {
        return (p) => {
          if (p === 0x1F02) return 'WebGL 2.0 (OpenGL ES 3.0)';
          if (p === 0x8B8C) return 'WebGL GLSL ES 3.00';
          if (p === 0x1F00 || p === 0x1F01) return 'MockGL';
          if (p === 0x0C10 || p === 0x0BA2) return [0, 0, 1280, 720];
          if (p === 0x0D33 || p === 0x851C) return 4096;
          return 16;
        };
      }
      if (prop === 'getShaderPrecisionFormat') return () => ({ rangeMin: 127, rangeMax: 127, precision: 23 });
      if (prop === 'getContextAttributes') return () => ({ alpha: true, antialias: false, depth: true, stencil: true });
      if (prop === 'checkFramebufferStatus') return () => 0x8CD5;
      if (prop === 'getProgramParameter') return (_p, k) => (k === 0x8B86 || k === 0x8B89 ? 0 : true);
      if (prop === 'getShaderParameter') return () => true;
      if (prop === 'getSupportedExtensions') return () => [];
      if (prop === 'getShaderInfoLog' || prop === 'getProgramInfoLog') return () => '';
      if (
        prop === 'createBuffer' || prop === 'createTexture' || prop === 'createFramebuffer' ||
        prop === 'createProgram' || prop === 'createShader' || prop === 'createVertexArray' ||
        prop === 'createRenderbuffer' || prop === 'getUniformLocation'
      ) return () => ({});
      if (prop === 'getAttribLocation') return () => 0;
      return () => 0;
    },
  });
}

function makeElementShim(tagName = 'div') {
  const classes = new Set();
  const attrs = new Map();
  const children = [];
  const listeners = new Map();
  const el = {
    tagName: tagName.toUpperCase(),
    className: '',
    textContent: '',
    innerHTML: '',
    value: '',
    src: '',
    alt: '',
    title: '',
    draggable: false,
    dataset: {},
    style: {},
    children,
    scrollTop: 0,
    scrollHeight: 600,
    clientHeight: 200,
    classList: {
      add: (...list) => list.forEach((c) => classes.add(c)),
      remove: (...list) => list.forEach((c) => classes.delete(c)),
      toggle: (c, force) => {
        const next = force !== undefined ? Boolean(force) : !classes.has(c);
        if (next) classes.add(c);
        else classes.delete(c);
        return next;
      },
      contains: (c) => classes.has(c),
    },
    setAttribute: (k, v) => attrs.set(k, String(v)),
    getAttribute: (k) => attrs.get(k) || null,
    appendChild: (c) => { children.push(c); return c; },
    append: (...list) => list.forEach((c) => children.push(c)),
    querySelector: (sel) => {
      if (sel === 'img') return children.find((c) => c.tagName === 'IMG') || makeElementShim('img');
      if (sel === 'span') return children.find((c) => c.tagName === 'SPAN') || makeElementShim('span');
      return makeElementShim();
    },
    querySelectorAll: () => [],
    closest: () => null,
    addEventListener: (ev, fn) => {
      if (!listeners.has(ev)) listeners.set(ev, []);
      listeners.get(ev).push(fn);
    },
    removeEventListener: () => {},
    dispatchEvent: (ev) => {
      const fns = listeners.get(ev.type) || [];
      for (const fn of fns) fn(ev);
    },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 132, height: 176 }),
  };
  return el;
}

function makeCanvasShim() {
  const base = makeElementShim('canvas');
  return Object.assign(base, {
    width: 1280,
    height: 720,
    getContext(kind) {
      if (kind === 'webgl' || kind === 'webgl2') {
        return makeWebGLShim();
      }
      const state = {
        fillStyle: '#000',
        strokeStyle: '#000',
        globalAlpha: 1,
        font: '12px sans-serif',
        textAlign: 'left',
        lineWidth: 1,
        imageSmoothingEnabled: false,
      };
      return new Proxy(state, {
        get(target, prop) {
          if (prop in target) return target[prop];
          if (prop === 'createImageData') {
            return (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
          }
          if (prop === 'getImageData') {
            return (_x, _y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
          }
          if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
            return () => ({ addColorStop: () => {} });
          }
          if (prop === 'measureText') {
            return (str) => ({ width: String(str).length * 7 });
          }
          return () => {};
        },
        set(target, prop, value) {
          target[prop] = value;
          return true;
        },
      });
    },
    toDataURL() {
      return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    },
  });
}

if (typeof globalThis.document === 'undefined') {
  const elementsById = new Map();
  let mockPointElement = null;
  globalThis.document = {
    createElement: (tag) => (tag === 'canvas' ? makeCanvasShim() : makeElementShim(tag)),
    createElementNS: (_ns, tag) => (tag === 'canvas' ? makeCanvasShim() : makeElementShim(tag)),
    getElementById: (id) => {
      if (!elementsById.has(id)) {
        elementsById.set(id, id.includes('canvas') ? makeCanvasShim() : makeElementShim('div'));
      }
      return elementsById.get(id);
    },
    querySelectorAll: () => [],
    elementFromPoint: () => mockPointElement,
    _setMockPointElement: (el) => { mockPointElement = el; },
    addEventListener: () => {},
    removeEventListener: () => {},
    pointerLockElement: null,
    body: makeElementShim('body'),
  };
  globalThis.window = {
    addEventListener: () => {},
    removeEventListener: () => {},
    innerWidth: 1280,
    innerHeight: 720,
    devicePixelRatio: 1,
    matchMedia: () => ({ matches: true }),
    location: { protocol: 'file:' },
  };
  globalThis.location = { protocol: 'file:' };
  globalThis.requestAnimationFrame = () => 1;
}

async function runStage7Tests() {
  const THREE = await import('../vendor/three.module.min.js');
  const { BLOCK_IDS, BlockRegistry } = await import('../src/blocks/BlockRegistry.js');
  const { ITEM_IDS } = await import('../src/items/ItemIds.js');
  const { ItemRegistry } = await import('../src/items/ItemRegistry.js');
  const { RecipeRegistry } = await import('../src/items/RecipeRegistry.js');
  const { Inventory } = await import('../src/items/Inventory.js');
  const { TextureAtlas } = await import('../src/textures/TextureAtlas.js');
  const { BlockEntityManager } = await import('../src/world/BlockEntityManager.js');
  const { FluidSimulator } = await import('../src/world/FluidSimulator.js');
  const { World } = await import('../src/world/World.js');
  const { Chunk } = await import('../src/world/Chunk.js');
  const { WorldGen } = await import('../src/world/WorldGen.js');
  const { ChunkMesher } = await import('../src/world/ChunkMesher.js');
  const { raycastVoxel } = await import('../src/world/Raycast.js');
  const { SkyRenderer } = await import('../src/world/SkyRenderer.js');
  const { PlayerModel, createSteveSkinTexture } = await import('../src/player/PlayerSkin.js');
  const { FirstPersonHand } = await import('../src/player/FirstPersonHand.js');
  const { PlayerController } = await import('../src/player/PlayerController.js');
  const { ItemEntityManager } = await import('../src/entities/ItemEntity.js');
  const { FallingBlockManager } = await import('../src/entities/FallingBlockEntity.js');
  const { InventoryUI } = await import('../src/ui/InventoryUI.js');
  const { VirtualMouse } = await import('../src/ui/VirtualMouse.js');
  const { SaveManager } = await import('../src/storage/SaveManager.js');

  // 1. Stage 7 Registries, Buckets, Fuel, Seamless Fluid Tiles & Survival Info
  assert.equal(BLOCK_IDS.LAVA, 74);
  assert.equal(BLOCK_IDS.OBSIDIAN, 75);
  assert.equal(BlockRegistry.getLightEmission(BLOCK_IDS.LAVA), 15);
  assert.equal(BlockRegistry.isFluid(BLOCK_IDS.WATER), true);
  assert.equal(BlockRegistry.isFluid(BLOCK_IDS.LAVA), true);
  assert.equal(BlockRegistry.isWashable(BLOCK_IDS.TORCH), true);

  const stoneInfo = BlockRegistry.getSurvivalInfo(BLOCK_IDS.STONE);
  assert.ok(stoneInfo.hardnessLabel.includes('1.5'));
  assert.ok(stoneInfo.toolLabel.includes('Кирка'));
  assert.ok(stoneInfo.dropLabel.includes('Булыжник'));

  assert.equal(ITEM_IDS.WATER_BUCKET, 340);
  assert.equal(ITEM_IDS.LAVA_BUCKET, 341);
  assert.equal(ItemRegistry.getMaxStack(ITEM_IDS.WATER_BUCKET), 1);
  assert.equal(ItemRegistry.getMaxStack(ITEM_IDS.LAVA_BUCKET), 1);
  assert.equal(ItemRegistry.get(ITEM_IDS.WATER_BUCKET).fluidId, BLOCK_IDS.WATER);
  assert.equal(ItemRegistry.get(ITEM_IDS.LAVA_BUCKET).fluidId, BLOCK_IDS.LAVA);
  assert.equal(RecipeRegistry.getFuelBurnTicks(ITEM_IDS.LAVA_BUCKET), 20000);

  const atlas = new TextureAtlas();
  assert.ok(atlas.tiles.has('lava'));
  assert.ok(atlas.tiles.has('obsidian'));
  assert.ok(atlas.waterTileTexture);
  assert.ok(atlas.lavaTileTexture);
  assert.ok(atlas.getItemIconDataURL(ITEM_IDS.WATER_BUCKET).startsWith('data:image/png'));
  assert.ok(atlas.getItemIconDataURL(ITEM_IDS.LAVA_BUCKET).startsWith('data:image/png'));

  // Lava Bucket furnace fuel returns Empty Bucket
  const bem = new BlockEntityManager();
  const f = bem.getOrCreateFurnace(4, 65, 4);
  f.input = ItemRegistry.createStack(BLOCK_IDS.IRON_ORE, 1);
  f.fuel = ItemRegistry.createStack(ITEM_IDS.LAVA_BUCKET, 1);
  bem.tick(1, null);
  assert.equal(f.fuel?.id, ITEM_IDS.BUCKET, 'Lava bucket fuel must leave an empty Bucket behind');
  assert.ok(f.burnTime > 19000);
  console.log('✓ Stage 7 Registries, Buckets, Lava Fuel, Textures & Survival Info passed');

  // 2. WorldGen 1x1x1 Caves, Deep Lava Lakes & Embedded Wall Springs
  const wg = new WorldGen(7771);
  let deepLavaFound = 0;
  let totalSprings = 0;
  for (let cx = 0; cx < 4; cx++) {
    for (let cz = 0; cz < 4; cz++) {
      const ch = new Chunk(cx, cz);
      wg.generateChunk(ch);
      for (let x = 0; x < 16; x++) {
        for (let z = 0; z < 16; z++) {
          for (let y = 5; y <= 10; y++) {
            if (ch.getBlock(x, y, z) === BLOCK_IDS.LAVA) deepLavaFound++;
          }
        }
      }
      if (ch.fluidSprings && ch.fluidSprings.length > 0) {
        totalSprings += ch.fluidSprings.length;
        for (const idx of ch.fluidSprings) {
          const sy = (idx / 256) | 0;
          const rem = idx % 256;
          const sz = (rem / 16) | 0;
          const sx = rem % 16;
          const id = ch.getBlock(sx, sy, sz);
          assert.ok(id === BLOCK_IDS.WATER || id === BLOCK_IDS.LAVA, 'Spring block must be water or lava');
          // Verify embedded in rock (3 rock walls + 1 air opening + floor + ceiling)
          let solidNeighbors = 0;
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            if (BlockRegistry.isSolid(ch.getBlock(sx + dx, sy, sz + dz))) solidNeighbors++;
          }
          assert.equal(solidNeighbors, 3, 'Embedded spring must have 3 solid rock sides and 1 open outlet');
          assert.ok(BlockRegistry.isSolid(ch.getBlock(sx, sy - 1, sz)));
          assert.ok(BlockRegistry.isSolid(ch.getBlock(sx, sy + 1, sz)));
        }
      }
    }
  }
  assert.ok(deepLavaFound > 0, 'Deep caves (Y=5..10) must generate lava lakes');
  assert.ok(totalSprings > 0, 'Chunks must generate embedded fluid springs');
  console.log(`✓ Stage 7 WorldGen caves, lava lakes (${deepLavaFound} blocks) & embedded springs (${totalSprings}) passed`);

  // 3. FluidSimulator: Flow, Drop-Off Reset, Infinite Water, Drying, Lava Viscosity, Mixing & Washing
  const scene = new THREE.Scene();
  const washedEvents = [];
  const world = new World(scene, atlas, 2026, 2, {
    useWorkers: false,
    onWashBlock: (wx, wy, wz, oldId) => washedEvents.push({ wx, wy, wz, oldId }),
  });

  const flatChunk = new Chunk(0, 0);
  flatChunk.blocks.fill(0);
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) {
      flatChunk.setBlock(x, 60, z, BLOCK_IDS.STONE);
    }
  }
  flatChunk.isGenerated = true;
  flatChunk.lightCalculated = true;
  world.chunks.set('0,0', flatChunk);

  // 3a. Horizontal water spread & torch washing
  world.setBlock(2, 61, 4, BLOCK_IDS.TORCH, false, true, 0);
  world.setBlock(4, 61, 4, BLOCK_IDS.WATER, false, true, 0);
  for (let t = 0; t < 45; t++) world.stepFluids();

  assert.equal(world.getBlock(11, 61, 4), BLOCK_IDS.WATER, 'Water should spread 7 blocks to x=11');
  assert.equal(world.getBlockMeta(11, 61, 4), 7);
  assert.equal(world.getBlock(12, 61, 4), 0, 'Water must stop at 8th horizontal block');
  assert.equal(washedEvents.some((w) => w.wx === 2 && w.oldId === BLOCK_IDS.TORCH), true, 'Flowing water must wash torches');

  // 3b. Removing water source dries downstream flow completely
  world.setBlock(4, 61, 4, 0, false, true, 0);
  for (let t = 0; t < 60; t++) world.stepFluids();
  for (let x = 0; x < 16; x++) {
    assert.equal(world.getBlock(x, 61, 4), 0, `Water at x=${x} must dry out after source removal`);
  }

  // 3c. Infinite water formation (2 orthogonal water sources over solid floor)
  world.setBlock(5, 61, 8, BLOCK_IDS.WATER, false, true, 0);
  world.setBlock(7, 61, 8, BLOCK_IDS.WATER, false, true, 0);
  for (let t = 0; t < 20; t++) world.stepFluids();
  assert.equal(world.getBlock(6, 61, 8), BLOCK_IDS.WATER);
  assert.equal(world.getBlockMeta(6, 61, 8), 0, 'Middle cell between 2 orthogonal water sources must become meta=0 source');

  // Clear test water
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) flatChunk.setBlock(x, 61, z, 0, 0);
  }
  world.fluids.clear();

  // 3d. Lava flow distance (3 steps: meta 2, 4, 6) + Fluid Mixing (Obsidian / Cobblestone / Stone)
  world.setBlock(4, 61, 4, BLOCK_IDS.LAVA, false, true, 0);
  for (let t = 0; t < 130; t++) world.stepFluids();
  assert.equal(world.getBlock(7, 61, 4), BLOCK_IDS.LAVA);
  assert.equal(world.getBlockMeta(7, 61, 4), 6);
  assert.equal(world.getBlock(8, 61, 4), 0, 'Overworld lava stops at 3 horizontal blocks');

  // Water hitting flowing lava -> Cobblestone; water hitting lava source -> Obsidian
  world.setBlock(10, 61, 4, BLOCK_IDS.WATER, false, true, 0);
  for (let t = 0; t < 40; t++) world.stepFluids();
  assert.equal(world.getBlock(7, 61, 4), BLOCK_IDS.COBBLESTONE, 'Water touching flowing lava must form Cobblestone');

  world.setBlock(3, 61, 4, BLOCK_IDS.WATER, false, true, 0);
  for (let t = 0; t < 15; t++) world.stepFluids();
  assert.equal(world.getBlock(4, 61, 4), BLOCK_IDS.OBSIDIAN, 'Water reaching lava source must form Obsidian');

  // Falling lava onto water from above -> Stone
  world.setBlock(12, 61, 12, BLOCK_IDS.WATER, false, true, 0);
  world.setBlock(12, 63, 12, BLOCK_IDS.LAVA, false, true, 0);
  for (let t = 0; t < 80; t++) world.stepFluids();
  assert.equal(world.getBlock(12, 61, 12), BLOCK_IDS.STONE, 'Lava falling vertically onto water must form Stone');
  console.log('✓ FluidSimulator flow, infinite water, drying, lava spread, mixing & washing passed');

  // 4. ChunkMesher lavaGeometry & LightingEngine emission
  const mesher = new ChunkMesher(atlas);
  const meshChunk = new Chunk(0, 0);
  meshChunk.blocks.fill(0);
  meshChunk.setBlock(5, 60, 5, BLOCK_IDS.STONE);
  meshChunk.setBlock(5, 61, 5, BLOCK_IDS.LAVA, 0);
  meshChunk.setBlock(6, 61, 5, BLOCK_IDS.LAVA, 2);
  meshChunk.isGenerated = true;
  world.chunks.set('0,0', meshChunk);
  world.lighting.initChunkLighting(world, meshChunk);
  assert.equal(world.getLightAt(5, 61, 5).block, 15, 'Lava must emit block light level 15');
  assert.ok(world.getLightAt(7, 61, 5).block >= 12, 'Lava light must propagate outward');
  const geoms = mesher.buildChunkGeometries(meshChunk, [null, null, null, null, meshChunk, null, null, null, null]);
  assert.ok(geoms.lavaGeometry && geoms.lavaGeometry.getAttribute('position').count >= 4);
  console.log('✓ ChunkMesher lavaGeometry & Lava light propagation passed');

  // 5. Raycast includeFluids, Fall Damage Formula, Lava/Fire/Water Physics & Entities
  const origin = new THREE.Vector3(5.5, 63.2, 5.5);
  const downDir = new THREE.Vector3(0, -1, 0);
  assert.equal(raycastVoxel(world, origin, downDir, 5, { includeFluids: false })?.blockId, BLOCK_IDS.STONE);
  assert.equal(raycastVoxel(world, origin, downDir, 5, { includeFluids: true })?.blockId, BLOCK_IDS.LAVA);

  // Build test floor & fluid pools for player & entities
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) {
      meshChunk.setBlock(x, 60, z, BLOCK_IDS.STONE);
      meshChunk.setBlock(x, 61, z, 0, 0);
    }
  }
  meshChunk.setBlock(2, 61, 2, BLOCK_IDS.LAVA, 0);
  meshChunk.setBlock(10, 61, 2, BLOCK_IDS.WATER, 0);

  const cam = new THREE.PerspectiveCamera(70, 1, 0.1, 100);
  const skin = createSteveSkinTexture();
  const pm = new PlayerModel(skin, atlas);
  const hand = new FirstPersonHand(skin, atlas);
  const player = new PlayerController(cam, world, pm, hand, { x: 6.5, y: 61, z: 2.5, creativeMode: false });

  // Fall damage check: 3.0 blocks = 0 damage; 4.0 blocks = 1 damage
  player.onGround = false;
  player.fallDistance = 3.0;
  player.y = 61.0;
  player.onGround = true;
  // Simulate landing transition by stepping when fallDistance=3.0
  const hpBefore = player.health;
  player.onGround = false;
  player.fallDistance = 3.0;
  player.vy = -1;
  player.update(0.05);
  assert.equal(player.health, hpBefore, '3.0 block drop must deal 0 fall damage');

  // 4.0 block drop -> 1 HP damage
  player.x = 6.5;
  player.z = 6.5;
  player.y = 61.05;
  player.onGround = false;
  player.fallDistance = 4.05;
  player.vy = -8;
  player.update(0.05);
  assert.equal(player.health, hpBefore - 1, '4.0 block drop must deal 1 HP fall damage');
  player.hurtTimer = 0;

  // Lava damage + ignite -> exit to air keeps fire -> enter water extinguishes fire
  player.x = 2.5;
  player.y = 61.0;
  player.z = 2.5;
  const preLavaHp = player.health;
  player.update(0.05);
  assert.ok(player.inLava, 'Player standing in lava must set inLava=true');
  assert.ok(player.fireTicks > 0, 'Lava must set fireTicks > 0');
  assert.ok(player.health < preLavaHp, 'Lava must inflict damage');

  // Move into water -> fire immediately extinguished
  player.x = 10.5;
  player.y = 61.0;
  player.z = 2.5;
  player.update(0.05);
  assert.ok(player.inWater, 'Player standing in water must set inWater=true');
  assert.equal(player.fireTicks, 0, 'Water must immediately extinguish fireTicks');

  // ItemEntity: burns in lava, pushed by water flow
  const itemMgr = new ItemEntityManager(scene, atlas);
  itemMgr.spawnDrop(BLOCK_IDS.COBBLESTONE, 2.5, 61.1, 2.5, 1);
  assert.equal(itemMgr.entities.length, 1);
  itemMgr.update(0.1, world, player, new Inventory());
  assert.equal(itemMgr.entities.length, 0, 'Dropped item in lava must burn away');

  // FallingBlockManager 6-neighbor cascade
  const fallMgr = new FallingBlockManager(scene, atlas);
  meshChunk.setBlock(8, 63, 8, BLOCK_IDS.SAND);
  meshChunk.setBlock(9, 63, 8, BLOCK_IDS.SAND);
  fallMgr.scheduleAround(8, 63, 8);
  fallMgr.update(0.05, world, itemMgr, true);
  assert.equal(fallMgr.entities.length, 2, '6-neighbor stability check must cascade unsupported adjacent sand');

  // SkyRenderer fluid fog state
  const sky = new SkyRenderer(scene);
  sky.updateFluidCameraEffect(true, false, world);
  assert.ok(scene.fog instanceof THREE.FogExp2, 'Underwater must apply FogExp2');
  sky.updateFluidCameraEffect(false, true, world);
  assert.ok(scene.fog instanceof THREE.FogExp2, 'Under-lava must apply FogExp2');
  sky.updateFluidCameraEffect(false, false, world);
  assert.equal(scene.fog, null, 'Exiting fluid must restore world fog setting');
  console.log('✓ Fall damage, Lava/Fire/Water physics, Item burning, Sand 6-cascade & Fluid fog passed');

  // 6. InventoryUI Java 1.21 Drag Distribution, Double-Click Collect, Shift Craft & VirtualMouse Drag
  const uiInv = new Inventory({ creativeMode: true });
  const ui = new InventoryUI(atlas, uiInv, bem, {});
  ui.open('inventory');

  // 6a. Java Left-Drag even split (9 items across 3 slots = 3 each)
  ui.cursorStack = ItemRegistry.createStack(BLOCK_IDS.STONE, 9);
  ui._handleSlotMouseDown('inv', 10, { button: 0, shiftKey: false });
  ui._handleDragOverSlot('inv', 11);
  ui._handleDragOverSlot('inv', 12);
  ui._finishDrag();
  assert.equal(uiInv.getSlot(10)?.count, 3);
  assert.equal(uiInv.getSlot(11)?.count, 3);
  assert.equal(uiInv.getSlot(12)?.count, 3);
  assert.equal(ui.cursorStack, null);

  // 6b. Java Right-Drag (places 1 item per slot)
  ui.cursorStack = ItemRegistry.createStack(BLOCK_IDS.DIRT, 5);
  ui._handleSlotMouseDown('inv', 13, { button: 2, shiftKey: false });
  ui._handleDragOverSlot('inv', 14);
  ui._handleDragOverSlot('inv', 15);
  ui._finishDrag();
  assert.equal(uiInv.getSlot(13)?.count, 1);
  assert.equal(uiInv.getSlot(14)?.count, 1);
  assert.equal(uiInv.getSlot(15)?.count, 1);
  assert.equal(ui.cursorStack?.count, 2);
  ui.cursorStack = null;

  // 6c. Double-click collect gathers matching items across inventory onto cursor
  ui._handleSlotMouseDown('inv', 10, { button: 0, shiftKey: false });
  assert.equal(ui.cursorStack?.count, 3);
  ui._handleSlotMouseDown('inv', 10, { button: 0, shiftKey: false });
  assert.equal(ui.cursorStack?.count, 9, 'Double-click must collect all matching Stone stacks');
  ui.cursorStack = null;

  // 6d. Shift+LMB bulk craft
  ui._setSlot('craft', 0, ItemRegistry.createStack(BLOCK_IDS.OAK_LOG, 4));
  ui._handleSlotMouseDown('craft_out', 0, { button: 0, shiftKey: true });
  assert.equal(ui.craftGrid[0], null);
  let totalPlanks = 0;
  for (let i = 0; i < 36; i++) {
    if (uiInv.slots[i]?.id === BLOCK_IDS.OAK_PLANKS) totalPlanks += uiInv.slots[i].count;
  }
  assert.equal(totalPlanks, 16, 'Shift+click craft output must craft all 4 logs -> 16 planks');
  ui.close();

  // 6e. VirtualMouse pointerDown/Move/Up lifecycle
  let vmEvents = [];
  const mockSlot = makeElementShim('button');
  mockSlot.classList.add('inv-slot');
  mockSlot.dataset = { zone: 'inv', index: '2' };
  mockSlot.closest = () => mockSlot;
  document._setMockPointElement(mockSlot);
  const vm = new VirtualMouse({
    isTouchDevice: true,
    onPointerDown: (btn) => vmEvents.push(`down:${btn}`),
    onPointerMove: (_x, _y, _h, activeBtn) => vmEvents.push(`move:${activeBtn}`),
    onPointerUp: (btn) => vmEvents.push(`up:${btn}`),
  });
  vm.setGuiOpen(true);
  vm.btnPri.dispatchEvent({ type: 'mousedown', preventDefault: () => {}, stopPropagation: () => {} });
  vm._updatePosition(220, 180);
  vm.btnPri.dispatchEvent({ type: 'mouseup', preventDefault: () => {}, stopPropagation: () => {} });
  assert.ok(vmEvents.includes('down:0') && vmEvents.includes('move:0') && vmEvents.includes('up:0'));
  vm.setGuiOpen(false);
  document._setMockPointElement(null);

  // 6f. SaveManager v7 metadata roundtrip & HTML/CSS checks
  const sm = new SaveManager();
  await sm.init();
  await sm.saveWorld('stage7_test', {
    worldSeed: 123,
    player: { x: 0, y: 70, z: 0, yaw: 0, pitch: 0 },
    modifiedBlocks: [[3, 61, 3, BLOCK_IDS.WATER, 4], [4, 61, 3, BLOCK_IDS.STONE]],
  });
  const loadedV7 = await sm.loadWorld('stage7_test');
  assert.equal(loadedV7.version, 7);
  assert.deepEqual(loadedV7.modifiedBlocks, [[3, 61, 3, BLOCK_IDS.WATER, 4], [4, 61, 3, BLOCK_IDS.STONE]]);

  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
  assert.equal(html.includes('btn-inv-split'), false, '#btn-inv-split must be removed from index.html');
  assert.ok(html.includes('id="fluid-overlay"'), '#fluid-overlay must exist in index.html');
  assert.equal(css.includes('#inventory-overlay') && css.slice(css.indexOf('#inventory-overlay'), css.indexOf('#inventory-overlay') + 260).includes('backdrop-filter'), false, '#inventory-overlay must NOT use expensive backdrop-filter');
  console.log('✓ InventoryUI Java Drag/DoubleClick/ShiftCraft, VirtualMouse drag, SaveManager v7 & UI cleanup passed');

  // Cleanup
  hand.dispose();
  pm.dispose();
  sky.dispose();
  itemMgr.dispose();
  fallMgr.dispose();
  world.dispose();

  console.log('\n🎉 ALL STAGE 7 TESTS PASSED!');
}

runStage7Tests().catch((err) => {
  console.error('Stage 7 test failed:', err);
  process.exit(1);
});
