# Project Architecture — 3D Minecraft Clone (Browser / Offline-First)

## Repository Layout Notice
Because the repository root contains existing user assets (`*.jar`, `Astrummc.zip`, `1.txt`–`12.txt`), **all game code lives inside `minecraft-game/`**. Existing root files are never modified or deleted.

**Working directory for Stages 1–12:** `minecraft-game/`

---

## Directory Structure (`minecraft-game/`)

```text
minecraft-game/
├── index.html                  # Web entry point (Main Menu, World Manager, Settings, Inventory/Crafting/Furnace/Chest UI, Recipe Book)
├── styles.css                  # Pixel Minecraft UI, 100vw x 100dvh, pure white crosshair, durability bars, responsive mobile dialogs
├── manifest.json               # PWA web manifest for offline web caching
├── sw.js                       # Service Worker for offline asset caching (minecraft-web-stage5-v1)
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
│   └── test-stage5.mjs         # Stage 5 test suite (items, tools, durability, 2x2/3x3 crafting, smelting, chests, fixes)
└── src/
    ├── main.js                 # Game loop (Survival/Creative toggle, mining cracks, BlockEntities, held light, paper-doll render)
    ├── constants.js            # Tick rate, 24k cycle, inventory/chest/furnace sizes, tool durabilities, swim/fly speeds
    ├── physics/
    │   └── AABBPhysics.js      # Axis-separated AABB collisions (0.6x1.8 / 0.6x1.5 crouch / 0.6x0.82 swim), Edge Guard
    ├── blocks/
    │   └── BlockRegistry.js    # 57 blocks (0..56): Crafting Table, Furnace (Lit), Chest, Glass, Ladder, Wool, minToolTier & harvest drops
    ├── items/
    │   ├── ItemIds.js          # Non-block item IDs (256..322): materials, 5x5 tools, 3x4 armor sets, bucket, flint & steel, shears
    │   ├── ItemRegistry.js     # Unified block + item lookup, stack sizes, tool speed/tier, armor points, held-light emission
    │   ├── RecipeRegistry.js   # 2x2 & 3x3 shaped/mirrored/shapeless crafting recipes, smelting recipes, fuel burn ticks, Recipe Book
    │   └── Inventory.js        # 36-slot + 4-armor-slot state, durability wear (`damageHeldTool`), slot drops & serialization
    ├── textures/
    │   ├── ItemSprites.js      # Procedural 16x16 pixel-art sprites for tools, swords, armor, ingots, coal, sticks, utility items
    │   ├── ExtrudedItemMesh.js # Cached 1-pixel voxel-extruded 3D BufferGeometry builder for held & dropped 2D item sprites
    │   └── TextureAtlas.js     # Procedural 16x16 padded atlas (512x512), borderless Ice tile, raw pixel buffer & 2D icons
    ├── world/
    │   ├── Noise.js            # Seeded PRNG + 2D/3D Simplex-style noise & FBM
    │   ├── ChunkGenKernel.js   # Zero-import multi-noise 8-biome 5x5 smoother, 4x4x4 caves, authentic-rarity ore clusters
    │   ├── BiomeManager.js     # Biome sampling, temperature/humidity/continentalness queries & foliage tints
    │   ├── WorldGen.js         # WorldGen wrapper + inline Blob Web Worker generator for offline mode
    │   ├── Chunk.js            # Blocks (Uint8Array), biomes, packed dual light, lazy metadata & `iceMesh`
    │   ├── LightingEngine.js   # Dual-channel Flood-Fill BFS (`Int32Array` ring buffer), cross-chunk sync, Redstone Ore glow
    │   ├── ChunkMesher.js      # `opaque` / `cutout` / `ice` (`renderOrder=1`) / `water` (`renderOrder=2`), `uHeldLightPos`/`uHeldLightLevel`
    │   ├── BlockEntityManager.js # Tick-driven Furnaces (`FURNACE` <-> `FURNACE_LIT` light=13), 27-slot Chests, break loot spill
    │   ├── Raycast.js          # 3D DDA targeting blocks, plants, ladders & tight sub-voxel torches + 10-stage BreakCrackOverlay
    │   ├── SkyRenderer.js      # 24,000-tick sky dome, stars, Sun, 8-phase Moon, clouds, brighter moonlight curve
    │   ├── SkyEnvironment.js   # Compatibility re-export of SkyRenderer
    │   ├── MenuPanorama.js     # Lightweight 6-face procedural skybox cube for smooth 60 FPS Main Menu backdrop
    │   └── World.js            # 4-in-flight worker cap, frame-budgeted `pendingLightChunks`, `iceMaterial`, held light forwarding
    ├── entities/
    │   ├── ItemEntity.js       # 3D blocks, 1-px voxel-extruded tools/items, durability metadata & 1.5s player-throw delay
    │   └── FallingBlockEntity.js # Gravity-driven 3D falling Sand & Gravel with cascade stability checks
    ├── player/
    │   ├── PlayerSkin.js       # Procedural 64x64 Steve skin, lazy 3D armor layers, held 3D tools, swim pose & `InventoryPlayerPreview`
    │   ├── FirstPersonHand.js  # Upright 1st-person arm holding 3D blocks/torches or 1-px voxel-extruded tools/items
    │   └── PlayerController.js # Verlet AABB physics, controlled water buoyancy & 1-block swim, ladder climbing & crouch-hold
    ├── ui/
    │   ├── Hotbar.js           # 9-slot hotbar synced to `Inventory`, item icons, colored durability bars & `[•••]` inventory trigger
    │   ├── InventoryUI.js      # Unified modal (Player 2x2 + Paper Doll, Crafting Table 3x3, Furnace, Chest, Recipe Book, Touch/PC UX)
    │   ├── MobileControls.js   # Left-half dynamic floating joystick, right-half look/tap/hold
    │   └── Hud.js              # Pure-white crosshair, F3 + swim status + time bar, World Manager, Game Mode switch, Sleep overlay
    └── storage/
        └── SaveManager.js      # IndexedDB v2 multi-world CRUD + v5 full Inventory, Armor & BlockEntity persistence
```

---

## Stage Roadmap & Extension Hooks (Stages 1–12)

- **Stage 1–4 (Completed):** Offline Three.js setup, single-file builder, procedural atlas, AABB & DDA physics, 8-biome + caves + ores generation, 24,000-tick Sky & Stars/Sun/Moon/Clouds, dual-channel BFS voxel lighting, Torch/Glowstone/Bed/Redstone, MenuPanorama, mobile touch UX.
- **Stage 5 (Completed — Survival, Inventory, Tools, Crafting & Block Entities):**
  - **Unified Items & Sprites (`ItemIds`, `ItemRegistry`, `ItemSprites`, `ExtrudedItemMesh`):** Block IDs `0..56` + Item IDs `256..322` (5 tiers of tools/swords/hoes, 3 tiers of 4-piece armor, materials, bucket, flint & steel, shears), 16×16 procedural pixel art, and cached 1-pixel voxel-extruded 3D meshes in 1st/3rd person and drops.
  - **Survival Mining & Durability (`BlockRegistry`, `Inventory`, `BreakCrackOverlay`):** Tool-tier harvest rules (`Wood` -> Stone/Coal, `Stone` -> Iron, `Iron` -> Diamond/Gold/Redstone/Emerald), tier speed multipliers, underwater/airborne slowdowns, 10-stage break crack overlay, and tool durability depletion + break.
  - **Crafting, Smelting & Storage (`RecipeRegistry`, `BlockEntityManager`, `InventoryUI`):** Full 2×2 & 3×3 shaped/mirrored/shapeless crafting with interactive green-highlighted Recipe Book auto-fill; 20-TPS Furnace burning/smelting (`FURNACE` <-> `FURNACE_LIT` light=13); 27-slot Chests; loot spill on break; live cursor-tracking 3D Steve Paper Doll with 3D armor; full PC (LMB/RMB/Shift/Q/E) & Mobile (tap-transfer, `½ Разделить`, long-press split, `•••`) controls; SaveManager v5 persistence.
  - **Refinements & Fixes:** Borderless translucent Ice (`renderOrder=1` before Water), ladder climbing/sneak-hold, sub-voxel Torch raycast passthrough, controlled water buoyancy + 1-block swim, dynamic held-item lighting, frame-budgeted async chunk lighting, and support-break drops in both modes.
- **Stages 6–12 (Mobs/Combat, Health/Hunger, Water/Lava Flow, Redstone Logic, Nether/End, Sound & Particles):** `Inventory`, `BlockEntityManager`, `ItemRegistry`, `PlayerModel` armor/held hooks, and `SaveManager` v5 provide drop-in extension points for health/armor reduction, mob AI, fluid propagation, and audio/particle systems.
