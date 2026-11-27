# Project Architecture — 3D Minecraft Clone (Browser / Offline-First)

## Repository Layout Notice
Because the repository root contains existing user assets (`*.jar`, `Astrummc.zip`, `1.txt`–`12.txt`), **all game code lives inside `minecraft-game/`**. Existing root files are never modified or deleted.

**Working directory for Stages 1–12:** `minecraft-game/`

---

## Directory Structure (`minecraft-game/`)

```text
minecraft-game/
├── index.html                  # Web entry point (Main Menu, World Manager, Tabbed Settings, Creative Catalog, HUD)
├── styles.css                  # Pixel Minecraft UI, 100vw x 100dvh, safe-area-inset, left-half dynamic joystick
├── manifest.json               # PWA web manifest for offline web caching
├── sw.js                       # Service Worker for offline asset caching
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
│   └── test-stage3.mjs         # Stage 3 test suite (biomes, caves, ores, gravity, swim, multi-world, worker)
└── src/
    ├── main.js                 # Game bootstrap, Main Menu / World loop, Creative instant break, Sky & Gravity wiring
    ├── constants.js            # World dims (16x128x16), sea level (62), swim hitbox (0.9), biome IDs/names
    ├── physics/
    │   └── AABBPhysics.js      # Axis-separated AABB collisions (0.6x1.8 / 0.6x1.5 crouch / 0.6x0.9 swim), Edge Guard
    ├── blocks/
    │   └── BlockRegistry.js    # 41 blocks (0..40): ores, stone variants, sand/gravel gravity, ice slipperiness, cross plants, inset cactus
    ├── textures/
    │   └── TextureAtlas.js     # Procedural 16x16 padded atlas (512x512) + 2D item previews for cubes & cross plants
    ├── world/
    │   ├── Noise.js            # Seeded PRNG + 2D/3D Simplex-style noise & FBM
    │   ├── ChunkGenKernel.js   # Zero-import multi-noise 8-biome 5x5 smoother, 4x4x4 trilinear caves/ravines, depth ores
    │   ├── BiomeManager.js     # Biome sampling, temperature/humidity/continentalness queries & foliage tints
    │   ├── WorldGen.js         # WorldGen wrapper + inline Blob Web Worker generator for offline mode
    │   ├── Chunk.js            # Flat Uint8Array(16*128*16) + 16x16 biome Uint8Array, minY/maxY air-skip bounds
    │   ├── ChunkMesher.js      # Cross-mesh plants, inset cactus, biome vertex tinting, ice translucency, hemisphere shade + AO
    │   ├── Raycast.js          # 3D DDA targeting solid + cross plants, adaptive SelectionBox
    │   ├── SkyEnvironment.js   # Atmospheric sky gradient dome, square pixel sun & drifting cloud layer
    │   └── World.js            # Blob Web Worker pool (Transferable buffers), unlimited chunk/biome cache, fog toggle
    ├── entities/
    │   ├── ItemEntity.js       # Dropped 3D mini-blocks with gravity, stack merging & magnetic pickup
    │   └── FallingBlockEntity.js # Gravity-driven 3D falling Sand & Gravel with cascade stability checks
    ├── player/
    │   ├── PlayerSkin.js       # Procedural 64x64 Steve skin canvas + articulated PlayerModel (Minecraft UVs)
    │   ├── FirstPersonHand.js  # Upright depth-cleared 1st-person right arm & 3D held block mount
    │   └── PlayerController.js # Verlet AABB physics, double-tap W sprint, 1-block submerged swim, shore hop, ice slide, pick-block
    ├── ui/
    │   ├── Hotbar.js           # Creative 9-slot Hotbar (no consumption) + full Block Catalog modal (`E` / touch button)
    │   ├── MobileControls.js   # Left-half dynamic floating joystick, right-half camera look/tap/hold, enlarged action buttons
    │   └── Hud.js              # Pure-white crosshair (hidden in F5), Main Menu, Multi-World Manager, Tabbed Settings, compact F3
    └── storage/
        └── SaveManager.js      # IndexedDB v2 multi-world CRUD + global settings persistence + Stage 1-2 migration
```

---

## Stage Roadmap & Extension Hooks (Stages 1–12)

- **Stage 1 (Completed):** Offline Three.js setup, single-file `minecraft-offline.html` builder, procedural 16×16 padded texture atlas, seeded terrain + oak trees + water, chunked face-culled `BufferGeometry` with Smooth Voxel AO and directional face shading, Steve 64×64 skin & articulated model, depth-cleared 1st-person hand, PC + multitouch controls, Fullscreen button, IndexedDB save foundation.
- **Stage 2 (Completed):** Axis-separated AABB physics (`0.6×1.8` / `0.6×1.5` sneak, `~1.252` jump, sprint FOV `+10°`, Sneak Edge Guard, double-tap Jump fly on PC & phone), 3D DDA raycast & wireframe `SelectionBox`, progressive crack & break overlays, `ItemEntity` 3D drops with stack merging & magnetic pickup, 9-slot `Hotbar` with 3D held block in hand, instant bordering chunk remeshing, unlimited world RAM cache setting, and full `IndexedDB` persistence of modified blocks + hotbar.
- **Stage 3 (Completed):** Multi-noise 8-biome world generation (`Plains`, `Forest`, `Birch Forest`, `Desert`, `Snowy Taiga`, `Mountains`, `Swamp`, `Beach`) with `5×5` smoothing & meandering rivers; 3D `4×4×4` trilinear spaghetti/cheese caves & ravines; jagged `Bedrock` `Y=0..4`; underground `Granite/Diorite/Andesite/Dirt/Gravel` pockets; depth-based ores (`Coal`, `Iron`, `Lapis`, `Gold`, `Redstone`, `Diamond`, Mountain `Emerald`); X-shaped cross-mesh plants & inset `Cactus`; translucent `Ice`; cascading `FallingBlockEntity` for `Sand` & `Gravel`; inline `Blob` Web Worker terrain generation (`Transferable` buffers); atmospheric sky dome + drifting pixel clouds + Settings Fog/Clouds toggles; Main Menu + Multi-World Manager + Tabbed scrollable Settings persisted in IndexedDB v2; Creative instant breaking without drops or stack consumption; pure-white `F5`-hidden crosshair; left-half dynamic floating mobile joystick & enlarged touch buttons; 1-block submerged-only swim hitbox, water shore-hop boost, ice friction & compact Biome F3.
- **Stage 4 (Lighting & Day/Night):** `Chunk` reserves optional sky/block light arrays (`skyLight`, `blockLight`), `SkyEnvironment` provides day/sun hooks, and `Redstone Ore` exposes `redstoneGlow` for interactive lighting.
- **Stages 5–12 (Crafting, Survival, Fluids, Mobs, Menus, Redstone, Dimensions, Audio/Particles):** `Game` (`src/main.js`) maintains a clean fixed `20 TPS` simulation tick (`fixedTick(dt)`) separate from variable-timestep rendering (`render(alpha)`), and `SaveManager` v2 manages multi-world IndexedDB schemas cleanly.
