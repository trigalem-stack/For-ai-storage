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
      return makeElementShim('div');
    },
    querySelectorAll: () => [],
    closest: () => null,
    contains: (node) => node === el || children.includes(node),
    getBoundingClientRect: () => ({ left: 100, top: 100, right: 300, bottom: 260, width: 200, height: 160 }),
    addEventListener: (ev, cb) => {
      if (!listeners.has(ev)) listeners.set(ev, []);
      listeners.get(ev).push(cb);
    },
    removeEventListener: () => {},
    dispatchEvent: (ev) => {
      for (const cb of listeners.get(ev.type) || []) cb(ev);
    },
    focus: () => {},
    blur: () => {},
  };

  if (tagName === 'canvas') {
    el.width = 256;
    el.height = 256;
    el.getContext = (type) => {
      if (type === 'webgl2' || type === 'webgl') return makeWebGLShim();
      const buf = new Uint8ClampedArray(el.width * el.height * 4);
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
          if (prop === 'putImageData') {
            return (img, dx = 0, dy = 0) => {
              const w = el.width;
              for (let y = 0; y < img.height; y++) {
                for (let x = 0; x < img.width; x++) {
                  const si = (y * img.width + x) * 4;
                  const di = ((y + dy) * w + (x + dx)) * 4;
                  if (di >= 0 && di + 3 < buf.length) {
                    buf[di] = img.data[si];
                    buf[di + 1] = img.data[si + 1];
                    buf[di + 2] = img.data[si + 2];
                    buf[di + 3] = img.data[si + 3];
                  }
                }
              }
            };
          }
          if (prop === 'getImageData') {
            return () => ({ width: el.width, height: el.height, data: buf });
          }
          if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
            return () => ({ addColorStop: () => {} });
          }
          return () => {};
        },
      });
    };
    el.toDataURL = () => 'data:image/png;base64,iVBORw0KGgo=';
  }
  return el;
}

function installEnvironmentShims() {
  const elementsById = new Map();
  let mockPointEl = null;
  globalThis.window = {
    innerWidth: 1280,
    innerHeight: 720,
    devicePixelRatio: 1,
    location: { protocol: 'http:' },
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  };
  globalThis.document = {
    body: makeElementShim('body'),
    pointerLockElement: null,
    visibilityState: 'visible',
    exitPointerLock: () => {},
    createElement: (tag) => makeElementShim(tag),
    getElementById: (id) => {
      if (!elementsById.has(id)) {
        const node = makeElementShim(id === 'game-canvas' ? 'canvas' : 'div');
        node.id = id;
        elementsById.set(id, node);
      }
      return elementsById.get(id);
    },
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {},
    elementFromPoint: () => mockPointEl,
    _setMockPointElement: (el) => { mockPointEl = el; },
  };
  Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent: 'node-stage8-test', maxTouchPoints: 0 },
    configurable: true,
  });
  const memStore = new Map();
  globalThis.localStorage = {
    getItem: (k) => (memStore.has(k) ? memStore.get(k) : null),
    setItem: (k, v) => { memStore.set(k, String(v)); },
    removeItem: (k) => { memStore.delete(k); },
  };
  globalThis.Image = class MockImage {
    set src(_v) { if (this.onload) this.onload(); }
  };
  globalThis.requestAnimationFrame = () => 1;
}

installEnvironmentShims();

const THREE = await import('../vendor/three.module.min.js');
const { BLOCK_IDS, BlockRegistry } = await import('../src/blocks/BlockRegistry.js');
const { ITEM_IDS } = await import('../src/items/ItemIds.js');
const { ItemRegistry } = await import('../src/items/ItemRegistry.js');
const { RecipeRegistry } = await import('../src/items/RecipeRegistry.js');
const { Inventory } = await import('../src/items/Inventory.js');
const { TextureAtlas } = await import('../src/textures/TextureAtlas.js');
const { getExtrudedTileGeometry } = await import('../src/textures/ExtrudedItemMesh.js');
const { World } = await import('../src/world/World.js');
const { SkyRenderer } = await import('../src/world/SkyRenderer.js');
const { BlockEntityManager } = await import('../src/world/BlockEntityManager.js');
const { raycastEntities } = await import('../src/world/Raycast.js');
const { triggerExplosion } = await import('../src/world/Explosion.js');
const { ParticleManager } = await import('../src/effects/ParticleManager.js');
const { ItemEntityManager } = await import('../src/entities/ItemEntity.js');
const { FallingBlockManager } = await import('../src/entities/FallingBlockEntity.js');
const { Mob } = await import('../src/entities/Mob.js');
const { EntityManager } = await import('../src/entities/EntityManager.js');
const { PlayerModel, createSteveSkinTexture } = await import('../src/player/PlayerSkin.js');
const { FirstPersonHand } = await import('../src/player/FirstPersonHand.js');
const { PlayerController } = await import('../src/player/PlayerController.js');
const { InventoryUI } = await import('../src/ui/InventoryUI.js');
const { MobileControls } = await import('../src/ui/MobileControls.js');
const { VirtualMouse } = await import('../src/ui/VirtualMouse.js');
const { Hud } = await import('../src/ui/Hud.js');
const { SaveManager } = await import('../src/storage/SaveManager.js');
const { CREEPER_EXPLOSION_POWER, TNT_EXPLOSION_POWER } = await import('../src/constants.js');

async function runStage8Tests() {
  console.log('=== Stage 8 Verification Suite (Mobs, Combat, Explosions, XP, Particles & UX Polish) ===');

  // 1. Stage 8 Blocks, Items, Blast Resistance & Recipes
  assert.equal(BLOCK_IDS.TNT, 76);
  assert.equal(BlockRegistry.getBlastResistance(BLOCK_IDS.TNT), 0);
  assert.equal(BlockRegistry.getBlastResistance(BLOCK_IDS.OBSIDIAN), 1200);
  assert.equal(BlockRegistry.getBlastResistance(BLOCK_IDS.BEDROCK), 3600000);
  assert.equal(BlockRegistry.getBlastResistance(BLOCK_IDS.STONE), 6);

  assert.equal(ItemRegistry.getMeleeDamage(ITEM_IDS.IRON_SWORD), 6);
  assert.equal(ItemRegistry.getMeleeDamage(ITEM_IDS.DIAMOND_SWORD), 7);
  assert.equal(ItemRegistry.getMeleeDamage(ITEM_IDS.WOODEN_AXE), 7);
  assert.equal(ItemRegistry.get(ITEM_IDS.BOW).isBow, true);
  assert.equal(ItemRegistry.get(ITEM_IDS.MILK_BUCKET).isMilk, true);
  assert.equal(ItemRegistry.get(ITEM_IDS.ENDER_PEARL).isPearl, true);
  assert.equal(ItemRegistry.get(ITEM_IDS.EGG).isEgg, true);
  assert.equal(ItemRegistry.get(ITEM_IDS.BONE_MEAL).isBoneMeal, true);

  const matchGrid = (size, ids) => RecipeRegistry.matchCraftingGrid(
    ids.map((id) => (id ? { id, count: 1 } : null)),
    size
  );

  // Check Stage 8 Recipes (Bow, Arrows x4, Flint&Steel, TNT, Bone Meal x3, Wool from 4x String)
  const bowMatch = matchGrid(3, [
    0, ITEM_IDS.STICK, ITEM_IDS.STRING,
    ITEM_IDS.STICK, 0, ITEM_IDS.STRING,
    0, ITEM_IDS.STICK, ITEM_IDS.STRING,
  ]);
  assert.equal(bowMatch?.result.id, ITEM_IDS.BOW);

  const arrowMatch = matchGrid(3, [
    ITEM_IDS.FLINT, 0, 0,
    ITEM_IDS.STICK, 0, 0,
    ITEM_IDS.FEATHER, 0, 0,
  ]);
  assert.equal(arrowMatch?.result.id, ITEM_IDS.ARROW);
  assert.equal(arrowMatch?.result.count, 4);

  const flintSteelMatch = matchGrid(2, [
    ITEM_IDS.IRON_INGOT, 0,
    0, ITEM_IDS.FLINT,
  ]);
  assert.equal(flintSteelMatch?.result.id, ITEM_IDS.FLINT_AND_STEEL);

  const tntMatch = matchGrid(3, [
    ITEM_IDS.GUNPOWDER, BLOCK_IDS.SAND, ITEM_IDS.GUNPOWDER,
    BLOCK_IDS.SAND, ITEM_IDS.GUNPOWDER, BLOCK_IDS.SAND,
    ITEM_IDS.GUNPOWDER, BLOCK_IDS.SAND, ITEM_IDS.GUNPOWDER,
  ]);
  assert.equal(tntMatch?.result.id, BLOCK_IDS.TNT);

  const boneMealMatch = matchGrid(2, [ITEM_IDS.BONE, 0, 0, 0]);
  assert.equal(boneMealMatch?.result.id, ITEM_IDS.BONE_MEAL);
  assert.equal(boneMealMatch?.result.count, 3);

  const woolMatch = matchGrid(2, [
    ITEM_IDS.STRING, ITEM_IDS.STRING,
    ITEM_IDS.STRING, ITEM_IDS.STRING,
  ]);
  assert.equal(woolMatch?.result.id, BLOCK_IDS.WOOL_WHITE);
  console.log('✓ Stage 8 blocks, items, blast resistances & crafting recipes passed');

  // 2. TextureAtlas, ExtrudedItemMesh & Graphics Settings
  const atlas = new TextureAtlas();
  const skinTex = createSteveSkinTexture();
  assert.ok(atlas.getItemSamplePalette(ITEM_IDS.BOW).length > 0);
  assert.ok(atlas.getItemSamplePalette(BLOCK_IDS.TNT).length > 0);

  const bowGeom = getExtrudedTileGeometry(atlas, 'item_bow');
  assert.ok(bowGeom.attributes.position.count > 0);
  assert.ok(bowGeom.attributes.color.count > 0);

  const scene = new THREE.Scene();
  const hand = new FirstPersonHand(skinTex, atlas);
  assert.equal(hand.extrudedMaterial.type, 'MeshBasicMaterial', '1st-person item must use unlit MeshBasicMaterial + vertexColors');
  assert.equal(hand.blockMaterial.type, 'MeshBasicMaterial', '1st-person block must use unlit MeshBasicMaterial + vertexColors');
  hand.setBowCharge(0.75);
  assert.equal(hand.bowCharge, 0.75);

  const sky = new SkyRenderer(scene);
  sky.setStarsEnabled(false);
  assert.equal(sky.starsEnabled, false);
  sky.setCloudsEnabled(false);
  assert.equal(sky.cloudsEnabled, false);

  const world = new World(scene, atlas, 2026, 2, {
    unlimitedMemory: true,
    fancyLeaves: true,
    smoothLighting: true,
    animatedFluids: true,
  });
  world.applyGraphicsSettings({ fancyLeaves: false, smoothLighting: false, animatedFluids: false });
  assert.equal(world.mesher.fancyLeaves, false);
  assert.equal(world.mesher.smoothLighting, false);
  assert.equal(world.animatedFluids, false);
  console.log('✓ TextureAtlas, MeshBasicMaterial 3D items & graphics toggles passed');

  // 3. Player XP formulas, clearEffects & guiOpen non-pause
  const cam = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 500);
  const pModel = new PlayerModel(skinTex, atlas);
  const player = new PlayerController(cam, world, pModel, hand, {
    x: 0.5, y: 72, z: 0.5, creativeMode: false,
  });
  assert.equal(player.getXpToNextLevel(0), 7);
  assert.equal(player.getXpToNextLevel(15), 37);
  assert.equal(player.getXpToNextLevel(16), 42);
  assert.equal(player.getXpToNextLevel(30), 112);
  assert.equal(player.getXpToNextLevel(31), 121);

  player.addXp(7);
  assert.equal(player.xpLevel, 1);
  assert.equal(player.xpTotal, 7);
  player.addXp(9);
  assert.equal(player.xpLevel, 2);
  assert.ok(Math.abs(player.xpProgress) < 1e-6);

  player.hungerDebuffTimer = 15;
  player.goldenRegenTimer = 10;
  player.clearEffects();
  assert.equal(player.hungerDebuffTimer, 0);
  assert.equal(player.goldenRegenTimer, 0);

  // guiOpen keeps world/physics running while blocking input
  player.setGuiOpen(true);
  player.keys.add('KeyW');
  const prevZ = player.z;
  player.update(0.05);
  assert.equal(player.z, prevZ, 'guiOpen must suppress player movement keys without pausing world');
  player.keys.clear();
  player.setGuiOpen(false);
  console.log('✓ Player XP leveling, Milk clearEffects & guiOpen separation passed');

  // 4. Pooled ParticleManager
  const particles = new ParticleManager(scene, atlas);
  particles.spawnBlockBreak(0, 64, 0, BLOCK_IDS.STONE, 10);
  particles.spawnCrit(0, 65, 0, 5);
  particles.spawnExplosion(0, 65, 0, 3);
  assert.ok(particles.particles.length > 0);
  particles.update(0.1, world);
  particles.setMode('off');
  assert.equal(particles.particles.length, 0);
  particles.setMode('all');
  console.log('✓ ParticleManager pooled spawning & modes passed');

  // 5. All 9 Mobs, Raycasting, Melee Combat, Interaction, Projectiles, XP Orbs & Explosions
  const itemMgr = new ItemEntityManager(scene, atlas);
  const fallMgr = new FallingBlockManager(scene, atlas);
  const bem = new BlockEntityManager();
  const em = new EntityManager(scene, atlas);

  const mobTypes = ['pig', 'cow', 'sheep', 'chicken', 'zombie', 'skeleton', 'spider', 'creeper', 'enderman'];
  for (const type of mobTypes) {
    const mob = new Mob(scene, type, 5, 70, 5);
    assert.ok(mob.hp > 0, `Mob ${type} must have positive health`);
    assert.ok(mob.visual.root.children.length >= 1, `Mob ${type} must build articulated limbs`);
    mob.dispose(scene);
  }

  // Build solid flat test floor at y = 63 around (0..12, 63, 0..12)
  world.preloadSpawnArea(0, 0, 1);
  for (let x = -4; x <= 14; x++) {
    for (let z = -4; z <= 14; z++) {
      world.setBlock(x, 63, z, BLOCK_IDS.STONE, false, false);
      for (let y = 64; y <= 76; y++) {
        world.setBlock(x, y, z, BLOCK_IDS.AIR, false, false);
      }
    }
  }

  // Place cow & sheep for milking/shearing + pig for melee combat + XP
  const cow = em.spawnMob('cow', 2.5, 64, 2.5);
  const sheep = em.spawnMob('sheep', 4.5, 64, 2.5);
  const zombie = em.spawnMob('zombie', 0.5, 64, -2.5);

  const inv = new Inventory({ creativeMode: false });
  player.inventory = inv;
  player.getHeldStack = () => inv.getHeldStack();
  player.consumeHeldItem = (n = 1) => inv.consumeHeld(n);

  // Milk cow with empty Bucket
  inv.setSlot(0, ItemRegistry.createStack(ITEM_IDS.BUCKET, 1));
  inv.selectedSlot = 0;
  const milked = em.tryInteractMob(player, cow, particles, itemMgr);
  assert.equal(milked, true);
  assert.equal(inv.getHeldStack()?.id, ITEM_IDS.MILK_BUCKET);

  // Shear sheep with Shears
  inv.setSlot(0, ItemRegistry.createStack(ITEM_IDS.SHEARS, 1));
  const sheared = em.tryInteractMob(player, sheep, particles, itemMgr);
  assert.equal(sheared, true);
  assert.equal(sheep.sheared, true);
  assert.ok(itemMgr.entities.some((e) => e.id === BLOCK_IDS.WOOL_WHITE));

  // RaycastEntities + Melee combat kill + XP drop & magnet
  const rayHit = raycastEntities({ x: 0.5, y: 65.2, z: 0.5 }, { x: 0, y: 0, z: -1 }, 4.5, em.mobs);
  assert.equal(rayHit?.entity, zombie);

  inv.setSlot(0, ItemRegistry.createStack(ITEM_IDS.DIAMOND_SWORD, 1));
  const startXp = player.xpTotal;
  for (let k = 0; k < 5 && !zombie.dying && zombie.alive; k++) {
    zombie.hurtCooldown = 0;
    em.tryMeleeAttack(player, zombie, particles);
  }
  assert.equal(zombie.dying || !zombie.alive, true, 'Diamond sword hits must kill Zombie');
  for (let s = 0; s < 8 && zombie.alive; s++) {
    em.update(0.1, { world, player, itemManager: itemMgr, particleManager: particles, fallingManager: fallMgr, blockEntityManager: bem });
  }
  assert.ok(em.xpOrbs.length > 0, 'Killing zombie must drop XP orbs');

  // Move player next to XP orb and step until collected
  const orb = em.xpOrbs[0];
  player.x = orb.x;
  player.y = orb.y;
  player.z = orb.z;
  for (let s = 0; s < 10; s++) {
    em.update(0.05, { world, player, itemManager: itemMgr, particleManager: particles, fallingManager: fallMgr, blockEntityManager: bem });
  }
  assert.ok(player.xpTotal > startXp, 'Collected XP orb must increase player.xpTotal');

  // Bow arrow projectile & Ender Pearl teleportation
  player.x = 0.5;
  player.y = 64;
  player.z = 0.5;
  player.yaw = 0;
  player.pitch = -0.34;
  const targetPig = em.spawnMob('pig', 0.5, 64, -2.5);
  targetPig.idlePauseTimer = 5.0;
  const arrow = em.shootPlayerArrow(player, 1.0);
  assert.equal(arrow.kind, 'arrow');
  for (let s = 0; s < 20 && arrow.alive; s++) {
    em.update(0.02, { world, player, itemManager: itemMgr, particleManager: particles, fallingManager: fallMgr, blockEntityManager: bem });
  }
  assert.ok(targetPig.hp < targetPig.maxHp || targetPig.dying || !targetPig.alive, 'Charged arrow must damage pig in flight path');

  player.hurtTimer = 0;
  const pearl = em.throwPlayerProjectile(player, 'ender_pearl');
  pearl.x = 8.5;
  pearl.y = 64.1;
  pearl.z = 8.5;
  pearl.vx = 0;
  pearl.vy = -5;
  pearl.vz = 0;
  const hpBeforePearl = player.health;
  em.update(0.05, { world, player, itemManager: itemMgr, particleManager: particles, fallingManager: fallMgr, blockEntityManager: bem });
  assert.ok(Math.hypot(player.x - 8.5, player.z - 8.5) < 1.5, 'Ender pearl impact must teleport player');
  assert.ok(player.health < hpBeforePearl, 'Ender pearl teleport must apply pearl damage');

  // Explosions: TNT destroys stone, protects obsidian, chains adjacent TNT
  world.setBlock(10, 64, 10, BLOCK_IDS.STONE, false, false);
  world.setBlock(11, 64, 10, BLOCK_IDS.OBSIDIAN, false, false);
  world.setBlock(10, 64, 11, BLOCK_IDS.TNT, false, false);
  triggerExplosion({
    world,
    x: 10.5,
    y: 64.5,
    z: 10.5,
    power: TNT_EXPLOSION_POWER,
    itemManager: itemMgr,
    entityManager: em,
    particleManager: particles,
    fallingManager: fallMgr,
    blockEntityManager: bem,
    player,
  });
  assert.equal(world.getBlock(10, 64, 10), BLOCK_IDS.AIR, 'TNT explosion must break stone');
  assert.equal(world.getBlock(11, 64, 10), BLOCK_IDS.OBSIDIAN, 'Obsidian blast resistance 1200 must survive TNT');
  assert.ok(em.primedTnts.length >= 1, 'Exploding next to TNT block must prime chain TNT');
  assert.equal(CREEPER_EXPLOSION_POWER, 3.0);

  // Entity serialization roundtrip
  const serializedEnts = em.serialize();
  assert.ok(Array.isArray(serializedEnts.mobs));
  em.clear();
  em.restore(serializedEnts);
  assert.equal(em.mobs.length, serializedEnts.mobs.length);
  console.log('✓ Mobs, combat, milking/shearing, arrows, ender pearls, XP orbs & explosions passed');

  // 6. Furnace XP, InventoryUI book pagination & preview, Point #4 Controls, SaveManager v8 & Assets
  const furn = bem.getOrCreateFurnace(2, 64, 2);
  furn.input = ItemRegistry.createStack(BLOCK_IDS.IRON_ORE, 2);
  furn.fuel = ItemRegistry.createStack(ITEM_IDS.COAL, 1);
  furn.output = ItemRegistry.createStack(ITEM_IDS.IRON_INGOT, 1);
  furn.storedXp = 3;

  let collectedXp = 0;
  const ui = new InventoryUI(atlas, inv, bem, {
    onCollectFurnaceXp: (xp) => { collectedXp += xp; },
  });
  ui.open('furnace', { x: 2, y: 64, z: 2 });
  ui._handleSlotMouseDown('furnace', 2, { button: 0, shiftKey: false });
  assert.equal(collectedXp, 3, 'Collecting smelted item from furnace output must award storedXp');

  ui.mode = 'crafting';
  ui.recipeBookOpen = true;
  ui.renderRecipeBook();
  const fullRecipes = RecipeRegistry.getRecipeBookList(inv.slots, 3, true);
  assert.ok(fullRecipes.length > ui.recipesPerPage, 'Recipe book must span multiple pages for pagination');
  ui.recipePage = 1;
  ui.renderRecipeBook();
  assert.equal(ui.recipePage, 1);
  ui.close();

  // VirtualMouse + MobileControls drop buttons + Hud 5 toggles + SaveManager v8
  const vm = new VirtualMouse({ isTouchDevice: true });
  vm.setGuiOpen(true);
  assert.equal(vm.enabled, true, 'Touch VirtualMouse must activate on GUI open without toggle button');
  vm.setGuiOpen(false);

  let drop1 = 0;
  let drop64 = 0;
  const mc = new MobileControls(null, {
    onDropOne: () => { drop1++; },
    onDropAll: () => { drop64++; },
  });
  mc.setHeldFoodIndicator(false, 'bow');
  assert.equal(mc.btnPlace.textContent, '🏹');
  mc.setHeldFoodIndicator(false, 'throw');
  assert.equal(mc.btnPlace.textContent, '🎯');

  const hud = new Hud({});
  hud.setStarsEnabledLabel(false);
  hud.setFancyLeavesLabel(false);
  hud.setSmoothLightingLabel(false);
  hud.setAnimatedFluidsLabel(false);
  hud.setParticlesModeLabel('minimal');

  const sm = new SaveManager();
  await sm.init();
  await sm.saveWorld('stage8_test', {
    worldSeed: 888,
    player: { x: 1, y: 70, z: 1, yaw: 0, pitch: 0 },
    survival: { xpLevel: 4, xpProgress: 0.5, xpTotal: 42 },
    entities: serializedEnts,
  });
  const loadedV8 = await sm.loadWorld('stage8_test');
  assert.equal(loadedV8.version, 8);
  assert.equal(loadedV8.survival.xpLevel, 4);
  assert.equal(loadedV8.survival.xpTotal, 42);
  assert.equal(loadedV8.entities.mobs.length, serializedEnts.mobs.length);

  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(!html.includes('btn-touch-mouse'), '#btn-touch-mouse must remain removed per UX cleanup');
  for (const id of [
    'hud-xp-fill', 'hud-xp-level', 'btn-hud-drop-one', 'btn-hud-drop-all',
    'btn-recipe-prev', 'btn-recipe-next', 'inv-recipe-preview',
    'btn-stars-mode', 'btn-leaves-mode', 'btn-smooth-light-mode', 'btn-anim-fluid-mode', 'btn-particles-mode',
  ]) {
    assert.ok(html.includes(id), `index.html missing Stage 8 element #${id}`);
  }

  const swSrc = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  for (const asset of [
    'ParticleManager.js', 'Explosion.js', 'XPOrbEntity.js',
    'ProjectileEntity.js', 'Mob.js', 'EntityManager.js',
  ]) {
    assert.ok(swSrc.includes(asset), `sw.js must precache ${asset}`);
  }

  const offlinePath = path.join(ROOT, 'minecraft-offline.html');
  assert.ok(fs.existsSync(offlinePath), 'minecraft-offline.html must exist');
  const offlineHtml = fs.readFileSync(offlinePath, 'utf8');
  assert.ok(!/https?:\/\/(cdn\.|unpkg\.com|jsdelivr)/i.test(offlineHtml), 'Offline bundle must have zero CDN URLs');
  assert.ok(offlineHtml.includes('hud-xp-fill') && offlineHtml.includes('triggerExplosion') && offlineHtml.includes('ParticleManager'), 'Offline bundle must contain Stage 8 engine');
  console.log('✓ Furnace XP, recipe pagination/preview, MobileControls drop/mode, SaveManager v8 & sw.js checks passed');

  // Cleanup standalone test fixtures
  em.clear();
  particles.dispose();
  hand.dispose();
  pModel.dispose();
  sky.dispose();
  itemMgr.dispose();
  fallMgr.dispose();
  world.dispose();

  // 7. Boot full main.js and verify Stage 8 runtime loop, guiOpen non-pause, melee attack & save v8
  await import('../src/main.js');
  await new Promise((r) => setTimeout(r, 120));
  const game = globalThis.window.__MC_GAME__;
  assert.ok(game && game.isRunning, 'main.js must boot cleanly');
  const worlds = await game.saveManager.listWorlds();
  await game.enterWorld(worlds[0].id);
  const spawnedMob = game.entityManager.spawnMob(
    'cow',
    game.player.x,
    game.player.y,
    game.player.z - 2.0
  );
  game.player.yaw = 0;
  game.player.pitch = 0;
  game._loop(performance.now() + 16);

  // Opening inventory sets guiOpen=true without pausing world ticks / entities
  game.togglePlayerInventory();
  assert.equal(game.inventoryUI.isOpen, true);
  assert.equal(game.player.guiOpen, true);
  assert.equal(game.player.isPaused, false);
  const tickBefore = game.tickCount;
  game._loop(performance.now() + 70);
  assert.ok(game.tickCount > tickBefore, 'World simulation must continue running while GUI is open');
  game.togglePlayerInventory();
  assert.equal(game.inventoryUI.isOpen, false);

  // Clear space in front of player and hit cow via _handlePrimaryAttack
  const px0 = Math.floor(game.player.x);
  const py0 = Math.floor(game.player.y);
  const pz0 = Math.floor(game.player.z);
  for (let ox = -1; ox <= 1; ox++) {
    for (let oz = -3; oz <= 1; oz++) {
      game.world.setBlock(px0 + ox, py0 - 1, pz0 + oz, BLOCK_IDS.STONE, false, false);
      for (let oy = 0; oy <= 2; oy++) {
        game.world.setBlock(px0 + ox, py0 + oy, pz0 + oz, BLOCK_IDS.AIR, false, false);
      }
    }
  }
  spawnedMob.x = game.player.x;
  spawnedMob.y = game.player.y;
  spawnedMob.z = game.player.z - 1.5;
  spawnedMob.vx = 0;
  spawnedMob.vz = 0;
  spawnedMob.idlePauseTimer = 5.0;
  game.player.yaw = 0;
  game.player.pitch = -0.35;
  game._loop(performance.now() + 90);
  const hpBeforeHit = spawnedMob.hp;
  const attacked = game._handlePrimaryAttack();
  assert.equal(attacked, true);
  assert.ok(spawnedMob.hp < hpBeforeHit);

  // Graphics toggle persistence & SaveManager v8 export
  game.hud.callbacks.onToggleStarsMode();
  assert.equal(game.settings.starsEnabled, false);
  game.hud.callbacks.onCycleParticlesMode();
  assert.ok(['all', 'minimal', 'off'].includes(game.settings.particlesMode));
  await game.saveNow();

  clearInterval(game.autosaveTimer);
  clearTimeout(game.debouncedSaveTimer);
  game.isRunning = false;
  game._unloadWorldFromEngine();
  console.log('✓ main.js Stage 8 integration (guiOpen simulation, mob combat, graphics toggles & v8 save) passed');

  console.log('\n🎉 ALL STAGE 8 TESTS PASSED!');
}

runStage8Tests().catch((err) => {
  console.error('Stage 8 test failed:', err);
  process.exit(1);
});
