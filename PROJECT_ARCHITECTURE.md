# Project Architecture — 3D Minecraft Clone (Browser / Offline-First)

## Repository Layout Notice
Because the repository root contains existing user assets (`*.jar`, `Astrummc.zip`, `1.txt`–`12.txt`), **all game code lives inside `minecraft-game/`**. Existing root files are never modified or deleted.

**Working directory for Stages 1–12:** `minecraft-game/`

---

## Directory Structure (`minecraft-game/`)

```text
minecraft-game/
├── index.html                  # Web entry point (Main Menu + per-world mode picker, Survival Vitals HUD, Death Screen, Inventory + Virtual Mouse)
├── styles.css                  # Pixel Minecraft UI, 100vw x 100dvh, Survival Hearts/Armor/Food/Oxygen, Damage/Suffocation vignettes, responsive no-scroll Inventory, Virtual Mouse pad
├── manifest.json               # PWA web manifest for offline web caching
├── sw.js                       # Service Worker for offline asset caching (minecraft-web-stage6-v1)
├── minecraft-offline.html      # Single-file standalone offline build (committed to Git)
├── package.json                # Dev tooling (three, esbuild) and npm scripts
├── vendor/
│   └── three.module.min.js     # Local bundled/minified Three.js (r187) — NO CDN!
├── scripts/
│   ├── build-offline.mjs       # Bundles HTML + CSS + vendor Three.js + src/** into minecraft-offline.html
│   ├── check-syntax.mjs        # Syntax validation across all JS/MJS sources
│   ├── serve.mjs               # Local static HTTP server bound to 0.0.0.0:4173
│   ├── test-stage1.mjs         # Stage 1 test suite
│   ├── test-stage2.mjs         # Stage 2 test suite
│   ├── test-stage3.mjs         # Stage 3 test suite
│   ├── test-stage4.mjs         # Stage 4 test suite (day/night cycle, BFS lighting, torches, beds)
│   ├── test-stage5.mjs         # Stage 5 test suite (items, tools, durability, 2x2/3x3 crafting, smelting, chests)
│   └── test-stage6.mjs         # Stage 6 test suite (health/armor/hunger/drowning, farming, deepslate/copper, death/respawn, anti-dupe, VirtualMouse)
└── src/
    ├── main.js                 # Game loop (per-world Survival/Creative, eating hold, hoe/seeds, death/respawn, random ticks, VirtualMouse glue)
    ├── constants.js            # Tick rate, 24k cycle, survival vitals/food/death constants, chunk frame budget (1.8ms)
    ├── physics/
    │   └── AABBPhysics.js      # Axis-separated AABB collisions (0.6x1.8 / 0.6x1.5 crouch / 0.6x0.82 swim), Edge Guard
    ├── blocks/
    │   └── BlockRegistry.js    # 74 blocks (0..73): Farmland, Wheat 0..7, Hay Bale, Copper Ore/Block, Deepslate, Smooth Stone, Bricks, Bookshelf, Mossy Cobblestone
    ├── items/
    │   ├── ItemIds.js          # Non-block item IDs (256..339): Leather & Leather Armor, 14 foods/crops, Clay/Brick, Copper Ingot/Raw Copper
    │   ├── ItemRegistry.js     # Unified block + item lookup, foodStats, stack sizes, tool speed/tier, armor points, held-light emission
    │   ├── RecipeRegistry.js   # 2x2 & 3x3 crafting (Leather Armor, Bread, Golden Apple, Hay Bale, Bricks, Bookshelf), meat/copper/smooth stone smelting
    │   └── Inventory.js        # 36-slot + 4-armor-slot state, `canAcceptExact` anti-dupe, `damageArmor`, `consumeOneHeld`, `extractAllForDeath`
    ├── textures/
    │   ├── ItemSprites.js      # Procedural 16x16 pixel-art sprites for tools, swords, 4 armor tiers, foods, crops, materials
    │   ├── ExtrudedItemMesh.js # Cached 1-pixel voxel-extruded 3D BufferGeometry builder for held & dropped 2D item sprites
    │   └── TextureAtlas.js     # Procedural 16x16 padded atlas (512x512), Farmland, Wheat 0..7, Deepslate, Copper, Bricks, Bookshelf, Mossy Cobblestone
    ├── world/
    │   ├── Noise.js            # Seeded PRNG + 2D/3D Simplex-style noise & FBM
    │   ├── ChunkGenKernel.js   # Zero-import multi-noise 8-biome 5x5 smoother, 4x4x4 caves, Deepslate depth, Copper & authentic rare Diamond veins
    │   ├── BiomeManager.js     # Biome sampling, temperature/humidity/continentalness queries & foliage tints
    │   ├── WorldGen.js         # WorldGen wrapper + inline Blob Web Worker generator for offline mode
    │   ├── Chunk.js            # Blocks (Uint8Array), biomes, packed dual light, lazy metadata & `iceMesh`
    │   ├── LightingEngine.js   # Dual-channel Flood-Fill BFS (`Int32Array` ring buffer), cross-chunk sync, Redstone Ore glow
    │   ├── ChunkMesher.js      # `opaque` / `cutout` / `ice` / `water` meshes, Farmland inset & 4-plane Wheat crop meshing, warm torch curve
    │   ├── BlockEntityManager.js # Tick-driven Furnaces (`FURNACE` <-> `FURNACE_LIT` light=13), 27-slot Chests, break loot spill
    │   ├── Raycast.js          # 3D DDA targeting blocks, plants, crops, ladders & sub-voxel torches + 10-stage BreakCrackOverlay
    │   ├── SkyRenderer.js      # 24,000-tick sky dome, stars, Sun, 8-phase Moon, clouds, warm `#fff3dc` torchTint
    │   ├── SkyEnvironment.js   # Compatibility re-export of SkyRenderer
    │   ├── MenuPanorama.js     # Lightweight 6-face procedural skybox cube for smooth 60 FPS Main Menu backdrop
    │   └── World.js            # Frame-budgeted sync/async chunk gen & lighting, max 2 meshes/frame, random ticks for Farmland & Wheat growth
    ├── entities/
    │   ├── ItemEntity.js       # 3D blocks/crops, 1-px extruded tools/items, 3-arg & 5-arg `spawnPlayerDrop`, fan `spawnDeathDrop` (300s lifetime)
    │   └── FallingBlockEntity.js # Gravity-driven 3D falling Sand & Gravel breaking into drops when landing on Torches/Plants/Crops/Beds
    ├── player/
    │   ├── PlayerSkin.js       # Procedural 64x64 Steve skin, 4-tier 3D armor (incl. Leather), red hurt flash, 90-deg death tilt & `InventoryPlayerPreview`
    │   ├── FirstPersonHand.js  # Upright 1st-person arm, held blocks/tools, bobbing & 1.6s eating munch animation
    │   └── PlayerController.js # Survival vitals (Health/Armor/Hunger/Saturation/Exhaustion/Air), hazards (fall/drown/wall/cactus/starve/void), Survival fly gate
    ├── ui/
    │   ├── Hotbar.js           # 9-slot hotbar synced to `Inventory`, item icons, colored durability bars & `[•••]` inventory trigger
    │   ├── InventoryUI.js      # Cloned-stack anti-dupe slot logic, 450ms post-touch mouse suppression, Recipe Book filter, responsive no-scroll layout
    │   ├── VirtualMouse.js     # PojavLauncher-style virtual arrow cursor + touchpad drag + `PRI/SEC/Shift/Drop` action pad + manual toggle
    │   ├── MobileControls.js   # Left-half dynamic joystick, instant-tap HUD controls, Creative-only Fly button, Hold-to-Eat `🍖` button
    │   └── Hud.js              # Instant touch F3/F5 buttons, SVG Survival Vitals bar, Damage/Suffocation vignettes, Death Screen, per-world mode picker
    └── storage/
        └── SaveManager.js      # IndexedDB v2 multi-world CRUD + v6 per-world `gameMode`, `survival` vitals, `bedSpawnPoint` & full Inventory/BlockEntities
```

---

## Stage Roadmap & Extension Hooks (Stages 1–12)

- **Stage 1–5 (Completed):** Offline Three.js setup, single-file builder, procedural atlas, AABB & DDA physics, 8-biome + caves + ores generation, 24,000-tick Sky & Stars/Sun/Moon/Clouds, dual-channel BFS voxel lighting, Torch/Glowstone/Bed/Redstone, Survival inventory/tools/3D armor/crafting/furnaces/chests.
- **Stage 6 (Completed — Health, Armor, Hunger, Food/Farming, Environmental Damage, Death/Respawn & Pojav UX):**
  - **Survival Vitals & Hazards (`PlayerController`, `Hud`, `PlayerSkin`):** Full 20-HP health, armor mitigation (`eff = max(armor/5, armor - dmg/2)`), absorption gold hearts, hunger/saturation/exhaustion loop (natural regeneration >= 18 food, fast sat regen at 20, starvation at 0), oxygen/drowning bubbles (300 ticks), fall damage, cactus contact, sand/wall suffocation with vignette, void damage, 0.5s i-frames, red hurt flash & camera tilt, 90° death tilt, item fan-drop with 300s lifetime, Death Screen, and Bed/World respawn.
  - **Food, Farming & Stage 6 World Content (`BlockRegistry`, `ItemRegistry`, `RecipeRegistry`, `World`, `ChunkGenKernel`):** Hoe tilling (`FARMLAND`), nearby-water hydration (`meta = 7`), light- & moisture-dependent random-tick Wheat growth (`WHEAT_0..7`), leaf apple drops, 14 foods with 1.6s hold-to-eat animation (`FirstPersonHand`), Leather Armor, Copper Ore/Ingot/Block, Deepslate at depth, rare Diamond generation, Smooth Stone, Bricks, Bookshelf, and Mossy Cobblestone.
  - **User Polish & Item-5 Fixes:** Per-world `gameMode` (`Survival` default / `Creative` with Fly gated strictly to Creative), responsive single-screen no-scroll mobile inventory, anti-dupe touch/mouse synchronization & `canAcceptExact`, PojavLauncher-style `VirtualMouse`, instant `touchstart`/`pointerdown` F3/F5 HUD taps, warm bright Torch light (`#fff3dc`), falling sand breaking on torches/crops, and 1.8ms frame-budgeted chunk lighting/generation/meshing.
- **Stages 7–12 (Mobs/Combat, Water/Lava Flow, Redstone Logic, Nether/End, Sound & Particles):** Built cleanly atop `PlayerController.damage()`, `Inventory`, `ItemRegistry`, `BlockEntityManager`, `LightingEngine`, and `SaveManager` v6.
