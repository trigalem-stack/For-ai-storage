import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function makeCanvasShim() {
  return {
    width: 16,
    height: 16,
    getContext() {
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
  };
}

function makeElementShim(tagName = 'div') {
  const classes = new Set();
  const attrs = new Map();
  const children = [];
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
    querySelector: () => makeElementShim(),
    addEventListener: () => {},
    removeEventListener: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 132, height: 176 }),
  };
  return el;
}

if (typeof globalThis.document === 'undefined') {
  const elementsById = new Map();
  globalThis.document = {
    createElement: (tag) => (tag === 'canvas' ? makeCanvasShim() : makeElementShim(tag)),
    getElementById: (id) => {
      if (!elementsById.has(id)) elementsById.set(id, makeElementShim(id.includes('canvas') ? 'canvas' : 'div'));
      return elementsById.get(id);
    },
    querySelectorAll: () => [],
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
  };
}

const THREE = await import('../vendor/three.module.min.js');
const { BLOCK_IDS, BlockRegistry } = await import('../src/blocks/BlockRegistry.js');
const { ITEM_IDS, ItemRegistry } = await import('../src/items/ItemRegistry.js');
const { RecipeRegistry } = await import('../src/items/RecipeRegistry.js');
const { Inventory } = await import('../src/items/Inventory.js');
const { TextureAtlas } = await import('../src/textures/TextureAtlas.js');
const { getExtrudedTileGeometry } = await import('../src/textures/ExtrudedItemMesh.js');
const { ItemEntityManager } = await import('../src/entities/ItemEntity.js');
const { BlockEntityManager } = await import('../src/world/BlockEntityManager.js');
const { Chunk } = await import('../src/world/Chunk.js');
const { ChunkMesher } = await import('../src/world/ChunkMesher.js');
const { World } = await import('../src/world/World.js');
const { raycastVoxel } = await import('../src/world/Raycast.js');
const { FirstPersonHand } = await import('../src/player/FirstPersonHand.js');
const { PlayerModel, createSteveSkinTexture } = await import('../src/player/PlayerSkin.js');
const { PlayerController } = await import('../src/player/PlayerController.js');
const { Hotbar } = await import('../src/ui/Hotbar.js');
const { SaveManager } = await import('../src/storage/SaveManager.js');
const { FURNACE_COOK_TICKS, ITEM_DROP_PLAYER_DELAY } = await import('../src/constants.js');

async function runStage5Tests() {
  // 1. ItemIds & ItemRegistry completeness (Blocks 0..56 + Items 256..322)
  assert.equal(BLOCK_IDS.CRAFTING_TABLE, 45);
  assert.equal(BLOCK_IDS.FURNACE, 46);
  assert.equal(BLOCK_IDS.FURNACE_LIT, 47);
  assert.equal(BLOCK_IDS.CHEST, 48);
  assert.equal(BLOCK_IDS.GLASS, 49);
  assert.equal(BLOCK_IDS.LADDER, 51);
  assert.equal(BLOCK_IDS.WOOL_WHITE, 56);
  assert.equal(BlockRegistry.getLightEmission(BLOCK_IDS.FURNACE_LIT), 13);
  assert.equal(BlockRegistry.isClimbable(BLOCK_IDS.LADDER), true);

  assert.equal(ITEM_IDS.STICK, 256);
  assert.equal(ITEM_IDS.COAL, 257);
  assert.equal(ITEM_IDS.CHARCOAL, 258);
  assert.equal(ITEM_IDS.WOODEN_PICKAXE, 270);
  assert.equal(ITEM_IDS.DIAMOND_PICKAXE, 290);
  assert.equal(ITEM_IDS.DIAMOND_SWORD, 293);
  assert.equal(ITEM_IDS.IRON_CHESTPLATE, 301);
  assert.equal(ITEM_IDS.DIAMOND_BOOTS, 311);
  assert.equal(ITEM_IDS.FLINT_AND_STEEL, 321);
  assert.equal(ITEM_IDS.SHEARS, 322);

  assert.equal(ItemRegistry.getMaxStack(BLOCK_IDS.COBBLESTONE), 64);
  assert.equal(ItemRegistry.getMaxStack(BLOCK_IDS.BED_FOOT), 1);
  assert.equal(ItemRegistry.getMaxStack(ITEM_IDS.IRON_PICKAXE), 1);
  assert.equal(ItemRegistry.getMaxStack(ITEM_IDS.IRON_HELMET), 1);
  assert.equal(ItemRegistry.getMaxStack(ITEM_IDS.COAL), 64);
  assert.equal(ItemRegistry.getHeldLightEmission({ id: BLOCK_IDS.TORCH }), 14);
  assert.equal(ItemRegistry.getHeldLightEmission({ id: BLOCK_IDS.GLOWSTONE }), 15);
  assert.equal(ItemRegistry.getHeldLightEmission({ id: ITEM_IDS.IRON_PICKAXE }), 0);
  console.log('✓ Stage 5 BlockIds, ItemIds & ItemRegistry passed');

  // 2. TextureAtlas, ItemSprites, 3D Extruded Mesh, Armor/Tools on Steve & FirstPersonHand
  const atlas = new TextureAtlas();
  assert.ok(atlas.tiles.has('crafting_table_top'));
  assert.ok(atlas.tiles.has('furnace_front_on'));
  assert.ok(atlas.tiles.has('chest_front'));
  assert.ok(atlas.tiles.has('ladder'));
  assert.ok(atlas.tiles.has('item_diamond_pickaxe'));
  assert.ok(atlas.tiles.has('item_iron_chestplate'));
  assert.ok(atlas.getItemIconDataURL(ITEM_IDS.DIAMOND_PICKAXE).startsWith('data:'));

  const pickGeom = getExtrudedTileGeometry(atlas, 'item_diamond_pickaxe');
  assert.ok(pickGeom && pickGeom.getAttribute('position').count > 24, 'Extruded 3D pickaxe mesh must have solid voxel vertices');

  const skinTex = createSteveSkinTexture();
  const hand = new FirstPersonHand(skinTex, atlas);
  hand.setHeldItem({ id: ITEM_IDS.IRON_PICKAXE, count: 1, durability: 250, maxDurability: 250 });
  assert.equal(hand.currentHeldBlockId, ITEM_IDS.IRON_PICKAXE);
  hand.setHeldItem(null);
  assert.equal(hand.currentHeldBlockId, 0);

  const playerModel = new PlayerModel(skinTex, atlas);
  let baseMeshes = 0;
  playerModel.root.traverse((o) => { if (o.isMesh) baseMeshes++; });
  assert.equal(baseMeshes, 6, 'Unarmored Steve must preserve 6 meshes');

  playerModel.setArmor({
    helmet: { id: ITEM_IDS.DIAMOND_HELMET, count: 1 },
    chestplate: { id: ITEM_IDS.DIAMOND_CHESTPLATE, count: 1 },
    leggings: { id: ITEM_IDS.DIAMOND_LEGGINGS, count: 1 },
    boots: { id: ITEM_IDS.DIAMOND_BOOTS, count: 1 },
  });
  playerModel.setHeldItem({ id: ITEM_IDS.DIAMOND_SWORD, count: 1 });
  let armoredMeshes = 0;
  playerModel.root.traverse((o) => { if (o.isMesh) armoredMeshes++; });
  assert.ok(armoredMeshes > 6, 'Equipped 3D armor + sword must attach meshes to Steve');
  playerModel.setArmor({});
  playerModel.setHeldItem(0);
  let strippedMeshes = 0;
  playerModel.root.traverse((o) => { if (o.isMesh) strippedMeshes++; });
  assert.equal(strippedMeshes, 6, 'Removing armor + item must cleanly detach overlays');
  hand.dispose();
  playerModel.dispose();
  console.log('✓ ItemSprites, 3D ExtrudedItemMesh, FirstPersonHand & Steve 3D Armor passed');

  // 3. Tool-tier harvesting, mining times & tool durability wear
  const woodPick = ItemRegistry.get(ITEM_IDS.WOODEN_PICKAXE);
  const stonePick = ItemRegistry.get(ITEM_IDS.STONE_PICKAXE);
  const ironPick = ItemRegistry.get(ITEM_IDS.IRON_PICKAXE);
  const diamondPick = ItemRegistry.get(ITEM_IDS.DIAMOND_PICKAXE);

  assert.equal(BlockRegistry.canHarvest(BLOCK_IDS.STONE, null), false, 'Bare hand cannot harvest Stone');
  assert.deepEqual(BlockRegistry.getHarvestDrops(BLOCK_IDS.STONE, null), []);
  assert.equal(BlockRegistry.canHarvest(BLOCK_IDS.STONE, woodPick), true, 'Wood pick harvests Stone -> Cobblestone');
  assert.deepEqual(BlockRegistry.getHarvestDrops(BLOCK_IDS.STONE, woodPick), [{ id: BLOCK_IDS.COBBLESTONE, count: 1 }]);

  assert.equal(BlockRegistry.canHarvest(BLOCK_IDS.IRON_ORE, woodPick), false);
  assert.equal(BlockRegistry.canHarvest(BLOCK_IDS.IRON_ORE, stonePick), true);
  assert.equal(BlockRegistry.canHarvest(BLOCK_IDS.DIAMOND_ORE, stonePick), false);
  assert.equal(BlockRegistry.canHarvest(BLOCK_IDS.DIAMOND_ORE, ironPick), true);
  assert.deepEqual(BlockRegistry.getHarvestDrops(BLOCK_IDS.COAL_ORE, woodPick), [{ id: ITEM_IDS.COAL, count: 1 }]);
  assert.deepEqual(BlockRegistry.getHarvestDrops(BLOCK_IDS.DIAMOND_ORE, diamondPick), [{ id: ITEM_IDS.DIAMOND, count: 1 }]);

  const stoneHandTime = BlockRegistry.getBreakTime(BLOCK_IDS.STONE, null);
  const stoneIronTime = BlockRegistry.getBreakTime(BLOCK_IDS.STONE, ironPick);
  assert.ok(stoneHandTime === 7.5 && stoneIronTime < 0.5, `Iron pick should mine stone fast (${stoneIronTime}s vs ${stoneHandTime}s)`);

  const inv = new Inventory({ creativeMode: false });
  inv.setSlot(0, ItemRegistry.createStack(ITEM_IDS.WOODEN_PICKAXE, 1, 2));
  assert.equal(inv.damageHeldTool(1), true);
  assert.equal(inv.getSlot(0).durability, 1);
  assert.equal(inv.damageHeldTool(1), true, 'Tool should break when durability hits 0');
  assert.equal(inv.getSlot(0), null);
  console.log('✓ Survival tool tiers, harvest drops, break speeds & durability wear passed');

  // 4. Crafting Recipes (2x2, 3x3, mirrored, shapeless & Recipe Book)
  const plankMatch = RecipeRegistry.matchCraftingGrid([null, { id: BLOCK_IDS.OAK_LOG, count: 1 }, null, null], 2);
  assert.ok(plankMatch && plankMatch.result.id === BLOCK_IDS.OAK_PLANKS && plankMatch.result.count === 4);

  const stickMatch = RecipeRegistry.matchCraftingGrid([
    { id: BLOCK_IDS.OAK_PLANKS, count: 1 }, null,
    { id: BLOCK_IDS.OAK_PLANKS, count: 1 }, null,
  ], 2);
  assert.ok(stickMatch && stickMatch.result.id === ITEM_IDS.STICK && stickMatch.result.count === 4);

  const tableMatch = RecipeRegistry.matchCraftingGrid([
    { id: BLOCK_IDS.OAK_PLANKS, count: 1 }, { id: BLOCK_IDS.OAK_PLANKS, count: 1 },
    { id: BLOCK_IDS.OAK_PLANKS, count: 1 }, { id: BLOCK_IDS.OAK_PLANKS, count: 1 },
  ], 2);
  assert.ok(tableMatch && tableMatch.result.id === BLOCK_IDS.CRAFTING_TABLE);

  // Mirrored axe (both left-facing and right-facing)
  const axeLeft = RecipeRegistry.matchCraftingGrid([
    { id: ITEM_IDS.IRON_INGOT, count: 1 }, { id: ITEM_IDS.IRON_INGOT, count: 1 }, null,
    { id: ITEM_IDS.IRON_INGOT, count: 1 }, { id: ITEM_IDS.STICK, count: 1 }, null,
    null, { id: ITEM_IDS.STICK, count: 1 }, null,
  ], 3);
  const axeRight = RecipeRegistry.matchCraftingGrid([
    null, { id: ITEM_IDS.IRON_INGOT, count: 1 }, { id: ITEM_IDS.IRON_INGOT, count: 1 },
    null, { id: ITEM_IDS.STICK, count: 1 }, { id: ITEM_IDS.IRON_INGOT, count: 1 },
    null, { id: ITEM_IDS.STICK, count: 1 }, null,
  ], 3);
  assert.ok(axeLeft && axeLeft.result.id === ITEM_IDS.IRON_AXE);
  assert.ok(axeRight && axeRight.result.id === ITEM_IDS.IRON_AXE);

  // 3x3 only recipe rejected in 2x2
  assert.equal(RecipeRegistry.fitsInGrid(axeLeft.recipe, 2), false);

  // Recipe Book highlighting
  inv.clearAll();
  inv.addItem(BLOCK_IDS.OAK_LOG, 2);
  const book = RecipeRegistry.getRecipeBookList(inv.slots, 2);
  const plankEntry = book.find((b) => b.recipe.result.id === BLOCK_IDS.OAK_PLANKS);
  const furnaceEntry = book.find((b) => b.recipe.result.id === BLOCK_IDS.FURNACE);
  assert.equal(plankEntry.craftable, true);
  assert.equal(furnaceEntry, undefined, '3x3 Furnace recipe should not show in 2x2 inventory book');
  console.log('✓ 2x2, 3x3, mirrored, shapeless crafting & Recipe Book passed');

  // 5. Furnace Smelting & Chest Persistence + Break Spill
  const scene = new THREE.Scene();
  const world = new World(scene, atlas, 999, 2, { useWorkers: false });
  world.preloadSpawnArea(0, 0, 1);
  world.setBlock(8, 65, 8, BLOCK_IDS.FURNACE, true, false, 2);
  world.setBlock(10, 65, 8, BLOCK_IDS.CHEST, true, false, 2);

  const bem = new BlockEntityManager();
  const f = bem.getOrCreateFurnace(8, 65, 8);
  f.input = ItemRegistry.createStack(BLOCK_IDS.IRON_ORE, 2);
  f.fuel = ItemRegistry.createStack(ITEM_IDS.COAL, 1);

  for (let t = 0; t < FURNACE_COOK_TICKS; t++) {
    bem.tick(1, world);
  }
  assert.equal(world.getBlock(8, 65, 8), BLOCK_IDS.FURNACE_LIT, 'Active furnace must swap to FURNACE_LIT');
  assert.equal(world.getLightAt(8, 65, 8).block, 13, 'Active furnace must emit block light 13');
  assert.equal(f.output?.id, ITEM_IDS.IRON_INGOT);
  assert.equal(f.output?.count, 1);

  // Finish smelting second iron ore & wait for fuel to expire
  for (let t = 0; t < 1700; t++) {
    bem.tick(1, world);
  }
  assert.equal(f.output?.count, 2);
  assert.equal(world.getBlock(8, 65, 8), BLOCK_IDS.FURNACE, 'Exhausted furnace must revert to unlit FURNACE');

  const chest = bem.getOrCreateChest(10, 65, 8);
  chest.slots[0] = ItemRegistry.createStack(ITEM_IDS.DIAMOND, 3);
  chest.slots[5] = ItemRegistry.createStack(BLOCK_IDS.TORCH, 12);

  // Save & Restore round-trip (SaveManager v5)
  const saveMgr = new SaveManager();
  await saveMgr.init();
  const wMeta = await saveMgr.createWorld({ name: 'Stage5', seed: 555 });
  inv.clearAll();
  inv.addItem(ITEM_IDS.DIAMOND_PICKAXE, 1, 1200);
  inv.armor.chestplate = ItemRegistry.createStack(ITEM_IDS.IRON_CHESTPLATE, 1, 200);
  await saveMgr.saveWorld(wMeta.id, {
    worldSeed: 555,
    player: { x: 8, y: 66, z: 8, yaw: 0, pitch: 0 },
    inventory: inv.exportState(),
    blockEntities: bem.exportState(),
    modifiedBlocks: world.exportModifiedBlocks(),
  });
  const loaded = await saveMgr.loadWorld(wMeta.id);
  assert.equal(loaded.version, 5);

  const inv2 = new Inventory();
  inv2.loadState(loaded.inventory);
  assert.equal(inv2.getSlot(0).id, ITEM_IDS.DIAMOND_PICKAXE);
  assert.equal(inv2.getSlot(0).durability, 1200);
  assert.equal(inv2.armor.chestplate.id, ITEM_IDS.IRON_CHESTPLATE);

  const bem2 = new BlockEntityManager();
  bem2.loadState(loaded.blockEntities);
  assert.equal(bem2.getOrCreateChest(10, 65, 8).slots[0].count, 3);

  // Break chest & verify item drops spill with ItemEntityManager
  const itemMgr = new ItemEntityManager(scene, atlas);
  bem2.onBlockRemoved(10, 65, 8, itemMgr);
  assert.equal(itemMgr.entities.length, 2, 'Breaking chest with 2 stacks must spawn 2 item drops');
  assert.equal(bem2.chests.size, 0);

  // Player throw drop delay check (1.5s)
  const dropEnt = itemMgr.spawnPlayerDrop(
    ItemRegistry.createStack(ITEM_IDS.DIAMOND, 1),
    8, 66, 8,
    { x: 0, y: 0, z: -1 }
  );
  assert.ok(dropEnt && dropEnt.pickupDelay >= ITEM_DROP_PLAYER_DELAY);
  itemMgr.dispose();
  console.log('✓ Furnace 200t smelting, FURNACE_LIT light=13, Chest spill & SaveManager v5 passed');

  // 6. Regressions fixed in Stage 5 (Ice borderless mesh, Sub-voxel Torch raycast, Ladder climb, Water buoyancy, Hotbar<->Inventory sync)
  const mesher = new ChunkMesher(atlas);
  const iceCh = new Chunk(0, 0);
  iceCh.setBlock(4, 65, 4, BLOCK_IDS.ICE);
  iceCh.setBlock(5, 65, 4, BLOCK_IDS.ICE);
  const iceRes = mesher.buildChunkGeometries(iceCh, () => 0);
  assert.ok(iceRes.iceGeometry && !iceRes.waterGeometry);
  // 2 adjacent cubes share 2 faces -> 10 faces * 4 verts = 40 verts (borderless!)
  assert.equal(iceRes.iceGeometry.getAttribute('position').count, 40, 'Adjacent Ice blocks must cull inner face');
  iceRes.iceGeometry.dispose();

  // Thin torch raycast misses edge and hits stone wall behind it
  world.setBlock(3, 66, 5, BLOCK_IDS.STONE, true, false);
  world.setBlock(3, 66, 6, BLOCK_IDS.TORCH, true, false, 0); // floor torch at (3,66,6)
  const missEdgeHit = raycastVoxel(world, { x: 3.10, y: 66.5, z: 7.5 }, { x: 0, y: 0, z: -1 });
  assert.ok(missEdgeHit && missEdgeHit.blockId === BLOCK_IDS.STONE && missEdgeHit.z === 5,
    'Ray past torch shaft edge must pass through to Stone behind it');
  const centerTorchHit = raycastVoxel(world, { x: 3.50, y: 66.3, z: 7.5 }, { x: 0, y: 0, z: -1 });
  assert.ok(centerTorchHit && centerTorchHit.blockId === BLOCK_IDS.TORCH,
    'Ray into torch center must select the Torch');

  // Water buoyancy limit & Ladder climb
  const cam = new THREE.PerspectiveCamera(72, 16 / 9, 0.1, 500);
  const pHand = new FirstPersonHand(skinTex, atlas);
  const pModel = new PlayerModel(skinTex, atlas);
  for (let x = 1; x <= 4; x++) {
    for (let z = 1; z <= 4; z++) {
      world.setBlock(x, 63, z, BLOCK_IDS.STONE, false, false);
      world.setBlock(x, 64, z, BLOCK_IDS.WATER, false, false);
      world.setBlock(x, 65, z, BLOCK_IDS.WATER, false, false);
    }
  }
  const pCtrl = new PlayerController(cam, world, pModel, pHand, { x: 2.5, y: 65.0, z: 2.5 });
  pCtrl.touchInput.jump = true;
  pCtrl.update(0.1);
  assert.ok(pCtrl.vy <= 1.5, `Open-water float jump must not skyrocket (vy=${pCtrl.vy})`);

  // Ladder climbing test (clear vertical shaft first)
  for (let yy = 64; yy <= 72; yy++) {
    world.setBlock(12, yy, 13, BLOCK_IDS.AIR, false, false);
  }
  world.setBlock(12, 63, 13, BLOCK_IDS.STONE, false, false);
  world.setBlock(12, 65, 12, BLOCK_IDS.STONE, false, false);
  world.setBlock(12, 66, 12, BLOCK_IDS.STONE, false, false);
  world.setBlock(12, 65, 13, BLOCK_IDS.LADDER, false, false, 3);
  world.setBlock(12, 66, 13, BLOCK_IDS.LADDER, false, false, 3);
  pCtrl.x = 12.5;
  pCtrl.y = 65.1;
  pCtrl.z = 13.5;
  pCtrl.touchInput.jump = true;
  const startClimbY = pCtrl.y;
  pCtrl.update(0.15);
  assert.ok(pCtrl.y > startClimbY + 0.1, `Ladder must climb upward when holding Jump (y=${pCtrl.y})`);
  pCtrl.touchInput.jump = false;
  pCtrl.touchInput.crouch = true;
  const holdY = pCtrl.y;
  pCtrl.update(0.1);
  assert.ok(Math.abs(pCtrl.y - holdY) < 0.01, 'Sneaking on ladder must hold position');

  // Hotbar <-> Inventory sync
  const hotbar = new Hotbar(atlas, { inventory: inv2, creativeMode: false });
  inv2.clearAll();
  hotbar.addItem(BLOCK_IDS.TORCH, 5);
  assert.equal(inv2.getSlot(0).count, 5);
  assert.equal(hotbar.slots[0].count, 5);

  hotbar.dispose();
  pCtrl.dispose();
  pHand.dispose();
  pModel.dispose();
  world.dispose();
  console.log('✓ Stage 5 regression fixes (Ice borderless, Torch sub-voxel, Ladder, Water float, Hotbar sync) passed');

  // 7. Service Worker cache manifest & offline bundle sanity
  const swSrc = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  for (const mod of ['ItemIds.js', 'ItemRegistry.js', 'RecipeRegistry.js', 'Inventory.js', 'ItemSprites.js', 'ExtrudedItemMesh.js', 'BlockEntityManager.js', 'InventoryUI.js']) {
    assert.ok(swSrc.includes(mod), `sw.js must cache ${mod}`);
  }
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(html.includes('inventory-overlay') && html.includes('btn-game-mode') && html.includes('inv-recipe-drawer'));
  console.log('✓ Stage 5 sw.js & index.html DOM invariants verified');
  console.log('\nALL STAGE 5 TESTS PASSED!');
}

runStage5Tests();
