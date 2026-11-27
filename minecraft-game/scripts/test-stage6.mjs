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

async function runStage6Tests() {
  const THREE = await import('../vendor/three.module.min.js');
  const { BLOCK_IDS, BlockRegistry } = await import('../src/blocks/BlockRegistry.js');
  const { ITEM_IDS } = await import('../src/items/ItemIds.js');
  const { ItemRegistry } = await import('../src/items/ItemRegistry.js');
  const { RecipeRegistry } = await import('../src/items/RecipeRegistry.js');
  const { Inventory } = await import('../src/items/Inventory.js');
  const { TextureAtlas } = await import('../src/textures/TextureAtlas.js');
  const { World } = await import('../src/world/World.js');
  const { ChunkMesher } = await import('../src/world/ChunkMesher.js');
  const { Chunk } = await import('../src/world/Chunk.js');
  const { WorldGen } = await import('../src/world/WorldGen.js');
  const { SkyRenderer } = await import('../src/world/SkyRenderer.js');
  const { PlayerModel, createSteveSkinTexture } = await import('../src/player/PlayerSkin.js');
  const { FirstPersonHand } = await import('../src/player/FirstPersonHand.js');
  const { PlayerController } = await import('../src/player/PlayerController.js');
  const { ItemEntityManager } = await import('../src/entities/ItemEntity.js');
  const { FallingBlockManager } = await import('../src/entities/FallingBlockEntity.js');
  const { InventoryUI } = await import('../src/ui/InventoryUI.js');
  const { VirtualMouse } = await import('../src/ui/VirtualMouse.js');
  const { SaveManager } = await import('../src/storage/SaveManager.js');
  const {
    MAX_HEALTH,
    MAX_FOOD,
    MAX_AIR_TICKS,
    ITEM_DROP_DEATH_LIFETIME,
  } = await import('../src/constants.js');

  // 1. Stage 6 Block & Item Registries + Textures + Farming Drops
  assert.ok(BLOCK_IDS.FARMLAND === 57 && BLOCK_IDS.WHEAT_7 === 65 && BLOCK_IDS.DEEPSLATE === 69 && BLOCK_IDS.COPPER_ORE === 67);
  assert.ok(BlockRegistry.isCrop(BLOCK_IDS.WHEAT_0) && BlockRegistry.isCrop(BLOCK_IDS.WHEAT_7));
  assert.ok(!BlockRegistry.isSolid(BLOCK_IDS.WHEAT_7));
  assert.ok(ItemRegistry.isFood(ITEM_IDS.BREAD) && ItemRegistry.isFood(ITEM_IDS.GOLDEN_APPLE));
  assert.ok(ItemRegistry.isFood(ITEM_IDS.ROTTEN_FLESH) && ItemRegistry.isFood(ITEM_IDS.MUSHROOM_STEW));
  assert.equal(ItemRegistry.get(ITEM_IDS.LEATHER_CHESTPLATE).armorPoints, 3);

  const invLeather = new Inventory();
  invLeather.armor.helmet = ItemRegistry.createStack(ITEM_IDS.LEATHER_HELMET, 1);
  invLeather.armor.chestplate = ItemRegistry.createStack(ITEM_IDS.LEATHER_CHESTPLATE, 1);
  invLeather.armor.leggings = ItemRegistry.createStack(ITEM_IDS.LEATHER_LEGGINGS, 1);
  invLeather.armor.boots = ItemRegistry.createStack(ITEM_IDS.LEATHER_BOOTS, 1);
  assert.equal(invLeather.getArmorDefense(), 7, 'Full leather armor must grant 7 defense');

  const invDiamond = new Inventory();
  invDiamond.armor.helmet = ItemRegistry.createStack(ITEM_IDS.DIAMOND_HELMET, 1);
  invDiamond.armor.chestplate = ItemRegistry.createStack(ITEM_IDS.DIAMOND_CHESTPLATE, 1);
  invDiamond.armor.leggings = ItemRegistry.createStack(ITEM_IDS.DIAMOND_LEGGINGS, 1);
  invDiamond.armor.boots = ItemRegistry.createStack(ITEM_IDS.DIAMOND_BOOTS, 1);
  assert.equal(invDiamond.getArmorDefense(), 20, 'Full diamond armor must grant 20 defense');

  const matureWheatDrops = BlockRegistry.getHarvestDrops(BLOCK_IDS.WHEAT_7, null);
  assert.ok(matureWheatDrops.some((d) => d.id === ITEM_IDS.WHEAT && d.count === 1), 'Mature wheat drops 1 wheat');
  assert.ok(matureWheatDrops.some((d) => d.id === ITEM_IDS.WHEAT_SEEDS && d.count >= 1), 'Mature wheat drops seeds');
  const youngWheatDrops = BlockRegistry.getHarvestDrops(BLOCK_IDS.WHEAT_3, null);
  assert.equal(youngWheatDrops.length, 1);
  assert.equal(youngWheatDrops[0].id, ITEM_IDS.WHEAT_SEEDS);

  const atlas = new TextureAtlas();
  for (const id of [
    ITEM_IDS.LEATHER, ITEM_IDS.LEATHER_CHESTPLATE, ITEM_IDS.APPLE, ITEM_IDS.GOLDEN_APPLE,
    ITEM_IDS.BREAD, ITEM_IDS.COOKED_BEEF, ITEM_IDS.MUSHROOM_STEW, ITEM_IDS.WHEAT_SEEDS,
    ITEM_IDS.WHEAT, ITEM_IDS.COPPER_INGOT, BLOCK_IDS.FARMLAND, BLOCK_IDS.WHEAT_7,
    BLOCK_IDS.COPPER_ORE, BLOCK_IDS.DEEPSLATE, BLOCK_IDS.BRICKS, BLOCK_IDS.BOOKSHELF,
  ]) {
    assert.ok(atlas.getItemIconDataURL(id).startsWith('data:image/png'), `Missing sprite for ID ${id}`);
  }
  console.log('✓ Stage 6 Block/Item registries, Leather armor (7 def), wheat drops & sprites passed');

  // 2. Stage 6 Recipes & Anti-Dupe Inventory Invariants
  const recipes = RecipeRegistry;
  const breadMatch = recipes.matchCraftingGrid([
    ItemRegistry.createStack(ITEM_IDS.WHEAT, 1),
    ItemRegistry.createStack(ITEM_IDS.WHEAT, 1),
    ItemRegistry.createStack(ITEM_IDS.WHEAT, 1),
    null, null, null, null, null, null,
  ], 3);
  assert.equal(breadMatch?.result?.id, ITEM_IDS.BREAD);

  const goldenAppleMatch = recipes.matchCraftingGrid([
    ItemRegistry.createStack(ITEM_IDS.GOLD_INGOT, 1),
    ItemRegistry.createStack(ITEM_IDS.GOLD_INGOT, 1),
    ItemRegistry.createStack(ITEM_IDS.GOLD_INGOT, 1),
    ItemRegistry.createStack(ITEM_IDS.GOLD_INGOT, 1),
    ItemRegistry.createStack(ITEM_IDS.APPLE, 1),
    ItemRegistry.createStack(ITEM_IDS.GOLD_INGOT, 1),
    ItemRegistry.createStack(ITEM_IDS.GOLD_INGOT, 1),
    ItemRegistry.createStack(ITEM_IDS.GOLD_INGOT, 1),
    ItemRegistry.createStack(ITEM_IDS.GOLD_INGOT, 1),
  ], 3);
  assert.equal(goldenAppleMatch?.result?.id, ITEM_IDS.GOLDEN_APPLE);

  assert.equal(recipes.getSmeltResult(BLOCK_IDS.COPPER_ORE)?.id, ITEM_IDS.COPPER_INGOT);
  assert.equal(recipes.getSmeltResult(ITEM_IDS.RAW_BEEF)?.id, ITEM_IDS.COOKED_BEEF);
  assert.equal(recipes.getSmeltResult(BLOCK_IDS.STONE)?.id, BLOCK_IDS.SMOOTH_STONE);

  // Inventory anti-dupe tests
  const invSafe = new Inventory();
  invSafe.setSlot(0, ItemRegistry.createStack(ITEM_IDS.DIAMOND, 60));
  assert.equal(invSafe.canAcceptExact(ItemRegistry.createStack(ITEM_IDS.DIAMOND, 4)), true);
  assert.equal(invSafe.canAcceptExact(ItemRegistry.createStack(ITEM_IDS.DIAMOND, 64)), true);
  // Fill every other slot with cobble so only 4 spaces remain for diamonds
  for (let i = 1; i < 36; i++) invSafe.setSlot(i, ItemRegistry.createStack(BLOCK_IDS.COBBLESTONE, 1));
  assert.equal(invSafe.canAcceptExact(ItemRegistry.createStack(ITEM_IDS.DIAMOND, 5)), false, 'Must reject overflowed exact stack');

  // Verify InventoryUI clone isolation & touch/mouse click anti-dupe guard
  const uiInv = new Inventory();
  uiInv.setSlot(0, ItemRegistry.createStack(ITEM_IDS.BREAD, 5));
  const ui = new InventoryUI(atlas, uiInv, null, {});
  ui._handleSlotMouseDown('inv', 0, { button: 0, shiftKey: false });
  assert.equal(ui.cursorStack?.id, ITEM_IDS.BREAD);
  assert.equal(ui.cursorStack?.count, 5);
  assert.equal(uiInv.getSlot(0), null, 'Source slot must be cleared when picked up');
  ui._handleSlotMouseDown('inv', 1, { button: 2, shiftKey: false });
  assert.equal(uiInv.getSlot(1)?.count, 1, 'Right-click places 1 from cursor');
  assert.equal(ui.cursorStack?.count, 4, 'Cursor reduced by 1 without duplication');
  // Test craft_out guarding when cursor holds an incompatible item
  ui.open('crafting');
  ui._setSlot('craft', 0, ItemRegistry.createStack(BLOCK_IDS.OAK_LOG, 1));
  assert.equal(ui.craftResult?.id, BLOCK_IDS.OAK_PLANKS);
  ui.cursorStack = ItemRegistry.createStack(ITEM_IDS.DIAMOND, 1);
  ui._handleSlotMouseDown('craft_out', 0, { button: 0, shiftKey: false });
  assert.equal(ui.craftGrid[0]?.count, 1, 'Craft grid must NOT consume ingredients when cursor cannot accept output');
  assert.equal(ui.cursorStack?.id, ITEM_IDS.DIAMOND);
  ui.close();
  console.log('✓ Stage 6 Recipes, Smelting & Inventory Anti-Dupe passed');

  // 3. VirtualMouse Pojav-style state, pointer clamping & callbacks
  let vmClicks = [];
  let vmDrops = 0;
  const mockSlotEl = makeElementShim('button');
  mockSlotEl.classList.add('inv-slot');
  mockSlotEl.dataset = { zone: 'inv', index: '3' };
  mockSlotEl.closest = () => mockSlotEl;
  document._setMockPointElement(mockSlotEl);

  const vm = new VirtualMouse({
    isTouchDevice: true,
    onSlotVirtualClick: (zone, index, btn, shift, x, y) => vmClicks.push({ zone, index, btn, shift, x, y }),
    onVirtualDrop: (zone, index) => { vmDrops++; },
  });
  vm.setGuiOpen(true);
  assert.equal(vm.enabled, true, 'VirtualMouse must auto-activate when GUI opens on touch device');
  vm.x = 200;
  vm.y = 150;
  vm.shiftHeld = true;
  vm.btnPri.dispatchEvent({ type: 'mousedown', preventDefault: () => {}, stopPropagation: () => {} });
  vm.btnSec.dispatchEvent({ type: 'mousedown', preventDefault: () => {}, stopPropagation: () => {} });
  vm.btnDrop.dispatchEvent({ type: 'mousedown', preventDefault: () => {}, stopPropagation: () => {} });
  assert.equal(vmClicks.length, 2);
  assert.deepEqual(vmClicks[0], { zone: 'inv', index: 3, btn: 0, shift: true, x: 200, y: 150 });
  assert.deepEqual(vmClicks[1], { zone: 'inv', index: 3, btn: 2, shift: true, x: 200, y: 150 });
  assert.equal(vmDrops, 1);
  vm.setGuiOpen(false);
  assert.equal(vm.enabled, false);
  document._setMockPointElement(null);
  console.log('✓ VirtualMouse Pojav-style cursor & action pad passed');

  // 4. World generation (Deepslate, Copper Ore, Rare Diamond), Random Ticks (Wheat & Farmland) & Fragile FallingBlock
  const wg = new WorldGen(4242);
  let deepslateCount = 0;
  let copperCount = 0;
  let diamondCount = 0;
  for (let cx = 0; cx < 3; cx++) {
    for (let cz = 0; cz < 3; cz++) {
      const ch = new Chunk(cx, cz);
      wg.generateChunk(ch);
      for (let i = 0; i < ch.blocks.length; i++) {
        if (ch.blocks[i] === BLOCK_IDS.DEEPSLATE) deepslateCount++;
        else if (ch.blocks[i] === BLOCK_IDS.COPPER_ORE) copperCount++;
        else if (ch.blocks[i] === BLOCK_IDS.DIAMOND_ORE) diamondCount++;
      }
    }
  }
  assert.ok(deepslateCount > 500, `Expected Deepslate at depth, got ${deepslateCount}`);
  assert.ok(copperCount > 20, `Expected Copper Ore, got ${copperCount}`);
  assert.ok(diamondCount < 60, `Diamond must be rare across 9 chunks, got ${diamondCount}`);

  // Setup lightweight scene + world for meshing, random ticks, survival & drops
  const scene = new THREE.Scene();
  const world = new World(scene, atlas, 101, 2);
  const chunk00 = new Chunk(0, 0);
  chunk00.blocks.fill(0);
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) {
      chunk00.setBlock(x, 60, z, BLOCK_IDS.STONE);
      chunk00.setBlock(x, 61, z, BLOCK_IDS.DIRT);
      chunk00.setBlock(x, 62, z, BLOCK_IDS.GRASS);
    }
  }
  world.chunks.set('0,0', chunk00);

  // Farmland hydration + Wheat growth + ChunkMesher crop/farmland geometry
  chunk00.isGenerated = true;
  world.setBlock(5, 62, 5, BLOCK_IDS.WATER, false, false);
  world.setBlock(6, 62, 5, BLOCK_IDS.FARMLAND, false, false, 0);
  world.setBlock(6, 63, 5, BLOCK_IDS.WHEAT_0, false, false, 0);
  world.lighting.initChunkLighting(world, chunk00);
  assert.ok(world.getLightAt(6, 63, 5).sky >= 8, 'Crop spot must have daylight');
  for (let i = 0; i < 25000; i++) {
    world.stepRandomTicks(6, 5);
  }
  assert.equal(world.getBlockMeta(6, 62, 5), 7, 'Farmland near water must become wet (meta=7)');
  assert.ok(world.getBlock(6, 63, 5) > BLOCK_IDS.WHEAT_0, 'Wheat must grow on random ticks');

  const mesher = new ChunkMesher(atlas);
  const nb = [null, null, null, null, chunk00, null, null, null, null];
  const meshRes = mesher.buildChunkGeometries(chunk00, nb);
  assert.ok(meshRes.opaqueGeometry.attributes.position.count > 0, 'Farmland geometry must build cleanly');
  assert.ok(meshRes.cutoutGeometry.attributes.position.count > 0, 'Wheat crop cutout geometry must build cleanly');

  // Warm torchTint check
  const sky = new SkyRenderer(scene, 18000, 1);
  assert.equal(sky.torchTint.getHexString(), 'fff3dc', 'Torch light tint must be warm bright #fff3dc');

  // FallingBlock landing onto fragile torch breaks falling sand into an item drop (authentic Minecraft)
  const itemMgr = new ItemEntityManager(scene, atlas);
  const fallMgr = new FallingBlockManager(scene, atlas);
  world.setBlock(3, 63, 3, BLOCK_IDS.TORCH, false, false, 0);
  world.setBlock(3, 66, 3, BLOCK_IDS.SAND, false, false, 0);
  fallMgr.scheduleStabilityCheck(3, 66, 3);
  for (let f = 0; f < 90; f++) {
    fallMgr.update(1 / 30, world, itemMgr, true);
  }
  assert.equal(world.getBlock(3, 63, 3), BLOCK_IDS.TORCH, 'Torch remains intact and breaks falling sand');
  assert.ok(itemMgr.entities.some((e) => e.id === BLOCK_IDS.SAND), 'Falling sand hitting torch must break into sand item drop');

  // Verify spawnPlayerDrop accepts BOTH 3-arg and 5-arg signatures without NaN
  const d3 = itemMgr.spawnPlayerDrop(ItemRegistry.createStack(ITEM_IDS.BREAD, 1), { x: 8, y: 63, z: 8 }, { x: 0, y: 0, z: -1 });
  const d5 = itemMgr.spawnPlayerDrop(ItemRegistry.createStack(ITEM_IDS.APPLE, 1), 8, 64, 8, { x: 1, y: 0, z: 0 });
  assert.ok(d3 && Number.isFinite(d3.x) && Number.isFinite(d3.y) && Number.isFinite(d3.z));
  assert.ok(d5 && Number.isFinite(d5.x) && Number.isFinite(d5.y) && Number.isFinite(d5.z));
  console.log('✓ Stage 6 WorldGen (Deepslate/Copper/Rare Diamond), Farming ticks, warm Torch light & FallingBlock passed');

  // 5. Survival Vitals, Armor Reduction, Hazards, Food, Death & Respawn
  const camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.08, 720);
  const skin = createSteveSkinTexture();
  const pModel = new PlayerModel(skin, atlas);
  const pHand = new FirstPersonHand(skin, atlas);

  let damageEvents = [];
  let deathEvent = null;
  let currentArmor = 0;

  const pSurv = new PlayerController(camera, world, pModel, pHand, {
    x: 10.5, y: 63, z: 10.5,
    creativeMode: false,
    flyMode: false,
    getArmorPoints: () => currentArmor,
    onDamage: (ev) => damageEvents.push(ev),
    onDeath: (ev) => { deathEvent = ev; },
  });

  // Survival mode must forbid flyMode toggle
  assert.equal(pSurv.toggleFlyMode(), false, 'Survival player must not enter fly mode');
  assert.equal(pSurv.flyMode, false);

  // Armor mitigation: physical hit 10 with 20 armor -> eff=15 -> 10 * (1 - 15/25) = 4.0 damage
  currentArmor = 20;
  assert.equal(pSurv.damage(10, 'cactus'), true);
  assert.ok(Math.abs(pSurv.health - 16.0) < 0.01, `Expected health 16.0 after armored hit, got ${pSurv.health}`);
  pSurv.health = 20;

  // Fall damage bypasses plain armor
  pSurv.hurtTimer = 0;
  assert.equal(pSurv.damage(2, 'fall'), true);
  assert.equal(pSurv.health, 18);

  // i-frames block immediate repeat minor hit, larger hit applies differential
  pSurv.hurtTimer = 0;
  currentArmor = 0;

  // Eating Bread & Golden Apple & Rotten Flesh
  pSurv.foodLevel = 10;
  pSurv.saturation = 0;
  pSurv.health = 16;
  pSurv.applyFoodEffects(ItemRegistry.getFoodStats(ITEM_IDS.BREAD));
  assert.equal(pSurv.foodLevel, 15);
  assert.equal(pSurv.saturation, 6);

  pSurv.applyFoodEffects(ItemRegistry.getFoodStats(ITEM_IDS.GOLDEN_APPLE));
  assert.equal(pSurv.foodLevel, 19);
  assert.equal(pSurv.absorption, 4, 'Golden apple must grant 4 absorption points (2 golden hearts)');

  for (let i = 0; i < 20 && pSurv.hungerDebuffTimer <= 0; i++) {
    pSurv.applyFoodEffects(ItemRegistry.getFoodStats(ITEM_IDS.ROTTEN_FLESH));
  }
  assert.ok(pSurv.hungerDebuffTimer > 0, 'Rotten flesh must apply hunger debuff');

  // Natural regeneration when food >= 18
  pSurv.health = 14;
  pSurv.foodLevel = 20;
  pSurv.saturation = 10;
  for (let i = 0; i < 6; i++) pSurv.update(0.5);
  assert.ok(pSurv.health > 14, 'Player must regenerate health when food >= 18');

  // Drowning: submerge head in water -> airTicks drops from 300 to 0 -> takes damage -> exit water restores 300
  world.setBlock(10, 63, 10, BLOCK_IDS.WATER, false, false);
  world.setBlock(10, 64, 10, BLOCK_IDS.WATER, false, false);
  world.setBlock(10, 65, 10, BLOCK_IDS.WATER, false, false);
  world.setBlock(10, 66, 10, BLOCK_IDS.STONE, false, false);
  pSurv.x = 10.5; pSurv.y = 63; pSurv.z = 10.5;
  pSurv.absorption = 0;
  pSurv.goldenRegenTimer = 0;
  pSurv.hurtTimer = 0;
  const hpBeforeDrown = pSurv.health;
  for (let t = 0; t < 380; t++) {
    pSurv.update(0.05);
  }
  assert.equal(pSurv.airTicks, 0);
  assert.ok(pSurv.health < hpBeforeDrown, 'Player must take drowning damage when air reaches 0');
  world.setBlock(10, 63, 10, 0, false, false);
  world.setBlock(10, 64, 10, 0, false, false);
  world.setBlock(10, 65, 10, 0, false, false);
  world.setBlock(10, 66, 10, 0, false, false);
  pSurv.update(0.05);
  assert.ok(pSurv.airTicks > 0, 'Exiting water begins regenerating oxygen');
  for (let t = 0; t < 65; t++) pSurv.update(0.05);
  assert.equal(pSurv.airTicks, MAX_AIR_TICKS, 'Exiting water restores full oxygen within ~3s');

  // Death, ItemEntity death-drop extraction & Respawn
  pSurv.hurtTimer = 0;
  pSurv.absorption = 0;
  pSurv.damage(50, 'cactus');
  assert.equal(pSurv.isDead, true);
  assert.equal(deathEvent, 'cactus');
  pSurv.update(0.05);
  assert.equal(pModel.isDead, true);

  const deathInv = new Inventory();
  deathInv.setSlot(0, ItemRegistry.createStack(ITEM_IDS.DIAMOND, 7));
  deathInv.armor.helmet = ItemRegistry.createStack(ITEM_IDS.IRON_HELMET, 1);
  const droppedList = deathInv.extractAllForDeath();
  assert.equal(droppedList.length, 2);
  assert.equal(deathInv.getSlot(0), null);
  assert.equal(deathInv.armor.helmet, null);

  for (const s of droppedList) {
    const de = itemMgr.spawnDeathDrop(s, pSurv.x, pSurv.y, pSurv.z);
    assert.ok(de && de.pickupDelay >= 0.7);
  }
  assert.equal(ITEM_DROP_DEATH_LIFETIME, 300.0);

  pSurv.respawnAt(8.5, 63, 8.5);
  assert.equal(pSurv.isDead, false);
  assert.equal(pSurv.health, MAX_HEALTH);
  assert.equal(pSurv.foodLevel, MAX_FOOD);
  assert.equal(pSurv.airTicks, MAX_AIR_TICKS);
  console.log('✓ Survival vitals, armor mitigation, drowning, food/regen, death drops & respawn passed');

  // 6. SaveManager v6 per-world gameMode, survival vitals & bedSpawnPoint
  const saveMgr = new SaveManager();
  await saveMgr.init();
  const survMeta = await saveMgr.createWorld({ name: 'SurvTest', seed: 99, gameMode: 'survival' });
  const creatMeta = await saveMgr.createWorld({ name: 'CreatTest', seed: 100, gameMode: 'creative' });
  assert.equal(survMeta.gameMode, 'survival');
  assert.equal(creatMeta.gameMode, 'creative');

  await saveMgr.saveWorld(survMeta.id, {
    worldSeed: 99,
    gameMode: 'survival',
    bedSpawnPoint: { x: 20.5, y: 65.6, z: -12.5 },
    player: { x: 10, y: 64, z: 10, yaw: 0, pitch: 0 },
    survival: { health: 12, absorption: 2, foodLevel: 14, saturation: 3.5, airTicks: 240 },
    inventory: invLeather.exportState(),
    modifiedBlocks: [],
  });
  const loadedSurv = await saveMgr.loadWorld(survMeta.id);
  assert.equal(loadedSurv.version, 6);
  assert.equal(loadedSurv.gameMode, 'survival');
  assert.equal(loadedSurv.survival.health, 12);
  assert.equal(loadedSurv.survival.foodLevel, 14);
  assert.equal(loadedSurv.bedSpawnPoint.x, 20.5);
  console.log('✓ SaveManager v6 per-world gameMode, survival vitals & bedSpawnPoint passed');

  // 7. DOM, Service Worker & Offline Bundle Invariants
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  for (const requiredId of [
    'survival-hud', 'hud-hearts-row', 'hud-armor-row', 'hud-hunger-row', 'hud-oxygen-row',
    'damage-vignette', 'suffocation-vignette', 'death-overlay', 'btn-respawn',
    'virtual-cursor', 'vm-action-bar', 'vm-btn-pri', 'vm-btn-sec', 'vm-btn-shift', 'vm-btn-drop',
    'btn-touch-mouse', 'btn-recipe-filter', 'btn-new-mode-survival', 'btn-new-mode-creative',
  ]) {
    assert.ok(html.includes(requiredId), `index.html missing Stage 6 element #${requiredId}`);
  }
  assert.ok(!html.includes('btn-game-mode'), 'Settings must NOT contain global game-mode toggle');
  assert.ok(!html.includes('btn-fly-mode'), 'Settings must NOT contain manual fly-mode toggle');

  const swSrc = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  assert.ok(swSrc.includes('VirtualMouse.js'), 'sw.js must precache VirtualMouse.js');

  const offlinePath = path.join(ROOT, 'minecraft-offline.html');
  assert.ok(fs.existsSync(offlinePath), 'minecraft-offline.html must exist');
  const offlineHtml = fs.readFileSync(offlinePath, 'utf8');
  assert.ok(!/https?:\/\/(cdn\.|unpkg\.com|jsdelivr)/i.test(offlineHtml), 'Offline bundle must have zero CDN URLs');
  assert.ok(offlineHtml.includes('virtual-cursor') && offlineHtml.includes('death-overlay'), 'Offline bundle must include Stage 6 DOM');
  assert.ok(offlineHtml.includes('renderCrosshair'), 'Offline bundle must include WebGL pure-white crosshair pass');

  // 8. Force-Dark-proof WebGL crosshair + full main.js boot/enterWorld/loop regression check
  assert.equal(pHand.crosshairMat.color.getHex(), 0xffffff, 'WebGL crosshair material must be pure white #ffffff');
  assert.equal(pHand.crosshairMat.toneMapped, false, 'WebGL crosshair must disable toneMapping so white stays #ffffff');
  assert.equal(pHand.crosshairScene.children.length, 2, 'WebGL crosshair must have vertical + horizontal bars');
  let clearedDepth = 0;
  let renderedCrosshair = 0;
  pHand.renderCrosshair({
    clearDepth: () => { clearedDepth += 1; },
    render: (sc) => { if (sc === pHand.crosshairScene) renderedCrosshair += 1; },
  }, 900, 500);
  assert.equal(clearedDepth, 1);
  assert.equal(renderedCrosshair, 1);
  assert.equal(pHand.crosshairV.position.x, 450);
  assert.equal(pHand.crosshairV.position.y, 250);

  assert.ok(html.includes('name="color-scheme" content="light only"'), 'index.html must opt out of browser Force Dark');
  const cssSrc = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
  assert.ok(cssSrc.includes('body.webgl-crosshair #crosshair::before'), 'styles.css must hide DOM crosshair when WebGL crosshair active');

  pSurv.dispose();
  pHand.dispose();
  pModel.dispose();
  world.dispose();
  itemMgr.dispose();
  fallMgr.dispose();

  // Boot full main.js entry point and exercise init -> enterWorld -> _loop -> inventory -> death -> respawn -> saveNow
  await import('../src/main.js');
  await new Promise((r) => setTimeout(r, 120));
  const bootStatus = globalThis.document.getElementById('loading-status').textContent;
  assert.ok(!String(bootStatus).startsWith('Ошибка запуска:'), `main.js threw startup error: ${bootStatus}`);
  const game = globalThis.window.__MC_GAME__;
  assert.ok(game && game.isRunning, 'MinecraftGame must finish init() cleanly');
  assert.equal(game.virtualMouse.touchDevice, game.settings.touchMode, 'VirtualMouse must receive settings.touchMode');
  assert.ok(globalThis.document.body.classList.contains('webgl-crosshair'), 'main.js must activate webgl-crosshair body class');

  const worlds = await game.saveManager.listWorlds();
  assert.ok(worlds.length >= 1, 'init() must ensure at least one world');
  await game.enterWorld(worlds[0].id);
  game._loop(performance.now() + 16);
  game.togglePlayerInventory();
  assert.equal(game.inventoryUI.isOpen, true);
  game._loop(performance.now() + 32);
  game.togglePlayerInventory();
  assert.equal(game.inventoryUI.isOpen, false);
  game.player.damage(100, 'fall');
  game._loop(performance.now() + 48);
  await game.respawnPlayer();
  game._loop(performance.now() + 64);
  await game.saveNow();

  clearInterval(game.autosaveTimer);
  clearTimeout(game.debouncedSaveTimer);
  game.isRunning = false;
  game._unloadWorldFromEngine();
  console.log('✓ Stage 6 HTML, ServiceWorker, WebGL Crosshair, main.js boot & Offline Bundle invariants verified');
  console.log('\nALL STAGE 6 TESTS PASSED!');
}

runStage6Tests();
