# Project Architecture — 3D Minecraft Clone (Browser / Offline-First)

## Repository Layout Notice
Because the repository root contains existing user assets (`*.jar`, `Astrummc.zip`, `1.txt`–`12.txt`), **all game code lives inside `minecraft-game/`**. Existing root files are never modified or deleted.

**Working directory for Stages 1–12:** `minecraft-game/`

---

## Directory Structure (`minecraft-game/`)

```text
minecraft-game/
├── index.html                  # Web entry point (Main Menu, World Manager, Tabbed Settings, Sleep Fade, F3 + Time Bar)
├── styles.css                  # Pixel Minecraft UI, 100vw x 100dvh, pure white crosshair, left-half dynamic joystick
├── manifest.json               # PWA web manifest for offline web caching
├── sw.js                       # Service Worker for offline asset caching (minecraft-web-stage4-v1)
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
│   └── test-stage4.mjs         # Stage 4 test suite (day/night cycle, BFS lighting, torches, beds, item-4 fixes)
└── src/
    ├── main.js                 # Game loop (MenuPanorama vs World), 20 TPS clock, torch/bed mechanics, dynamic entity lighting
    ├── constants.js            # 24k tick day/night constants, light levels, swim/fly speeds, world dims (16x128x16)
    ├── physics/
    │   └── AABBPhysics.js      # Axis-separated AABB collisions (0.6x1.8 / 0.6x1.5 crouch / 0.6x0.9 swim), Edge Guard
    ├── blocks/
    │   └── BlockRegistry.js    # 45 blocks (0..44): Torch, Glowstone, Jack o'Lantern, Bed Foot/Head, Redstone Ore glow, opacity LUTs
    ├── textures/
    │   └── TextureAtlas.js     # Procedural 16x16 padded atlas (512x512) + 2D torch/bed/plant icons
    ├── world/
    │   ├── Noise.js            # Seeded PRNG + 2D/3D Simplex-style noise & FBM
    │   ├── ChunkGenKernel.js   # Zero-import multi-noise 8-biome 5x5 smoother, 4x4x4 caves, authentic-rarity ore clusters
    │   ├── BiomeManager.js     # Biome sampling, temperature/humidity/continentalness queries & foliage tints
    │   ├── WorldGen.js         # WorldGen wrapper + inline Blob Web Worker generator for offline mode
    │   ├── Chunk.js            # Blocks (Uint8Array), biomes, packed dual light `(sky<<4)|block`, lazy metadata (Uint8Array)
    │   ├── LightingEngine.js   # Dual-channel Flood-Fill BFS (`Int32Array` ring buffer), cross-chunk sync, Redstone Ore glow
    │   ├── ChunkMesher.js      # Per-vertex `aLight`, uniform-driven dual-light shader, 3x3 neighbor meshing, 3D Torch & Bed meshes
    │   ├── Raycast.js          # 3D DDA targeting blocks, plants, torches & beds with adaptive SelectionBox
    │   ├── SkyRenderer.js      # 24,000-tick sky dome, 420 stars, 3D Sun, 8-phase Moon, Y=108..112 volumetric clouds (toggleable)
    │   ├── SkyEnvironment.js   # Compatibility re-export of SkyRenderer
    │   ├── MenuPanorama.js     # Lightweight 6-face procedural skybox cube for smooth 60 FPS Main Menu backdrop
    │   └── World.js            # Blob Web Worker pool, LightingEngine wiring, 3x3 meshing, meta deltas & chunkDataCache light cache
    ├── entities/
    │   ├── ItemEntity.js       # 3D dropped & held geometries: flat cross-plant sprites, 3D torches, mini beds, cubes
    │   └── FallingBlockEntity.js # Gravity-driven 3D falling Sand & Gravel with cascade stability checks
    ├── player/
    │   ├── PlayerSkin.js       # Procedural 64x64 Steve skin canvas + articulated PlayerModel with dynamic voxel lighting
    │   ├── FirstPersonHand.js  # Upright depth-cleared 1st-person arm & held item/plant/torch with dynamic voxel lighting
    │   └── PlayerController.js # Verlet AABB physics, water surface/ascend fixes, reliable 1-block swim exit, fly speed tuning
    ├── ui/
    │   ├── Hotbar.js           # Creative 9-slot Hotbar (with Torch/Glowstone/Bed/Dandelion/Redstone) + full Block Catalog (`E`)
    │   ├── MobileControls.js   # Left-half dynamic floating joystick (double-push-only sprint), right-half look/tap/hold
    │   └── Hud.js              # Pure-white crosshair (no dark outline), F3 + time preset switcher, World Manager, Sleep overlay
    └── storage/
        └── SaveManager.js      # IndexedDB v2 multi-world CRUD + v4 worldTime/dayCount/spawnPoint/settings persistence
```

---

## Stage Roadmap & Extension Hooks (Stages 1–12)

- **Stage 1 (Completed):** Offline Three.js setup, single-file `minecraft-offline.html` builder, procedural 16×16 padded texture atlas, seeded terrain + oak trees + water, chunked face-culled `BufferGeometry` with Smooth Voxel AO and directional face shading, Steve 64×64 skin & articulated model, depth-cleared 1st-person hand, PC + multitouch controls, Fullscreen button, IndexedDB save foundation.
- **Stage 2 (Completed):** Axis-separated AABB physics (`0.6×1.8` / `0.6×1.5` sneak, `~1.252` jump, sprint FOV `+10°`, Sneak Edge Guard, double-tap Jump fly on PC & phone), 3D DDA raycast & wireframe `SelectionBox`, progressive crack & break overlays, `ItemEntity` 3D drops with stack merging & magnetic pickup, 9-slot `Hotbar` with 3D held block in hand, instant bordering chunk remeshing, unlimited world RAM cache setting, and full `IndexedDB` persistence of modified blocks + hotbar.
- **Stage 3 (Completed):** Multi-noise 8-biome world generation (`Plains`, `Forest`, `Birch Forest`, `Desert`, `Snowy Taiga`, `Mountains`, `Swamp`, `Beach`) with `5×5` smoothing & meandering rivers; 3D `4×4×4` trilinear spaghetti/cheese caves & ravines; jagged `Bedrock` `Y=0..4`; underground `Granite/Diorite/Andesite/Dirt/Gravel` pockets; depth-based ores; X-shaped cross-mesh plants & inset `Cactus`; translucent `Ice`; cascading `FallingBlockEntity`; inline `Blob` Web Worker terrain generation; Main Menu + Multi-World Manager + Tabbed scrollable Settings; left-half dynamic floating mobile joystick.
- **Stage 4 (Completed — Lighting & Day/Night Cycle):**
  - **24,000-Tick Cycle & Sky (`SkyRenderer`):** 20 TPS progression (`0` dawn, `6000` noon, `12000` sunset, `12541..23458` night, `18000` midnight) + F3 quick time switcher; smooth sky dome & fog transitions; 420 night stars; opposite 3D Sun & 8-phase Moon (`dayCount % 8`); `Y=108..112` volumetric voxel clouds with Settings toggle.
  - **Dual-Channel Voxel BFS Lighting (`LightingEngine`, `Chunk`, `ChunkMesher`):** Packed `(skyLight << 4) | blockLight` `Uint8Array(32768)` computed via `Int32Array` ring-buffer BFS with cross-chunk border sync, water/leaf light attenuation, true dark deep caves, and `aLight` + shader uniforms (`uSunIntensity`, `uSkyTint`, `uTorchTint`) for 0 ms CPU day/night transitions; dynamic `setEnvironmentLight` on 1st-person hand & 3rd-person `PlayerModel`.
  - **Light Sources & Functional Bed:** Floor/wall `2×10×2` 3D `Torch` (`14`, support-break drop, ceiling-blocked), `Glowstone` (`15`), directional `Jack o'Lantern` (`15`), temporary `Redstone Ore` glow (`9` for 4.5 s), and 2-block `Bed` (`BED_FOOT` + `BED_HEAD`, linked breaking, night sleep transition advancing to dawn `worldTime = 0`, `spawnPoint` persistence).
  - **Optimizations & Fixes:** Lightweight `MenuPanorama` skybox in Main Menu (zero world lag), reduced fly speed (`9.5` / `15.0`), authentic ore rarity tuning, flat 2-sided sprite rendering for cross plants (`Dandelion`) in hand/drops, fixed mobile joystick single-push sprint bug, water surfacing & reliable 1-block swim posture exit, and outline-free pure white `#crosshair`.
- **Stages 5–12 (Crafting, Survival, Fluids, Mobs, Menus, Redstone, Dimensions, Audio/Particles):** `Game` (`src/main.js`) maintains a clean fixed `20 TPS` simulation tick (`fixedTick()`) separate from variable-timestep rendering (`_loop()`), and `SaveManager` v4 manages multi-world IndexedDB schemas cleanly.
