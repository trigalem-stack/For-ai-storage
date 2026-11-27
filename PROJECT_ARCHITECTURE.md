# Project Architecture — 3D Minecraft Clone (Browser / Offline-First)

## Repository Layout Notice
Because the repository root contains existing user assets (`*.jar`, `Astrummc.zip`, `1.txt`–`12.txt`), **all game code lives inside `minecraft-game/`**. Existing root files are never modified or deleted.

**Working directory for Stages 1–12:** `minecraft-game/`

---

## Directory Structure (`minecraft-game/`)

```text
minecraft-game/
├── index.html                  # Web entry point (mobile viewport-fit=cover, HUD, touch UI)
├── styles.css                  # Pixel Minecraft UI, 100vw x 100dvh, safe-area-inset support
├── manifest.json               # PWA web manifest for offline web caching
├── sw.js                       # Service Worker for offline asset caching
├── minecraft-offline.html      # Single-file standalone offline build (committed to Git)
├── package.json                # Dev tooling (three, esbuild) and npm scripts
├── vendor/
│   └── three.module.min.js     # Local bundled/minified Three.js (r187) — NO CDN!
├── scripts/
│   └── build-offline.mjs       # Bundles HTML + CSS + vendor Three.js + src/** into minecraft-offline.html
└── src/
    ├── main.js                 # Game bootstrap, RAF render loop + 20 TPS fixed tick, subsystem registry
    ├── constants.js            # World/chunk dimensions (16x128x16), sea level (62), player dims, TPS
    ├── blocks/
    │   └── BlockRegistry.js    # Block IDs, properties (opaque, solid, liquid, transparent), face tile names
    ├── textures/
    │   └── TextureAtlas.js     # Procedural 16x16 pixel-art generator padded into 32x32 atlas cells (512x512)
    ├── world/
    │   ├── Noise.js            # Seeded PRNG + 2D/3D Simplex-style noise & FBM
    │   ├── WorldGen.js         # Seeded heightmap, biomes/mountains/beaches, bedrock, water, cross-chunk trees
    │   ├── Chunk.js            # Flat Uint8Array(16*128*16) storage, dirty meshing flag, light buffers ready
    │   ├── ChunkMesher.js      # Separate opaque/cutout & water BufferGeometry, culling, AO (0..3), face shading
    │   └── World.js            # Budgeted chunk streaming (<=4ms/frame), dispose() unloading, fog, block API
    ├── player/
    │   ├── PlayerSkin.js       # Procedural 64x64 Steve skin canvas + articulated PlayerModel (Minecraft UVs)
    │   ├── FirstPersonHand.js  # Dedicated depth-cleared 1st-person arm pass, bobbing, sway, swing, item mount
    │   └── PlayerController.js # PC PointerLock + WASD/Space/Shift/Ctrl + F3/F5 + Touch integration + cameras
    ├── ui/
    │   ├── MobileControls.js   # Multitouch touch.identifier joystick + look pad + Bedrock action buttons
    │   └── Hud.js              # Crosshair, F3 debug panel, Fullscreen API + iOS fallback, Pause/Settings menu
    └── storage/
        └── SaveManager.js      # IndexedDB offline persistence (worldSeed, player pose, settings, autosave)
```

---

## Stage Roadmap & Extension Hooks (Stages 1–12)

- **Stage 1 (Completed):** Offline Three.js setup, single-file `minecraft-offline.html` builder, procedural 16×16 padded texture atlas, seeded terrain + oak trees + water, chunked face-culled `BufferGeometry` with Smooth Voxel AO and directional face shading, Steve 64×64 skin & articulated model, depth-cleared 1st-person hand, PC + multitouch controls, Fullscreen button, IndexedDB save foundation.
- **Stage 2 (Physics, Raycasting, Block Break/Place):** `World.getBlock/setBlock` automatically marks chunk + edge neighbors dirty; `PlayerController` exposes movement/physics mode hook (`ground`/`fly`/`aabb`); `FirstPersonHand.heldItemMount` accepts held block/tool meshes; `MobileControls` action button fires `onPrimaryAction`/`onSecondaryAction`.
- **Stage 3 (Biomes & Caves):** `WorldGen` exposes biome sampling and 3D cave carving hooks; `TextureAtlas` has 256 tile slots (`16×16` grid of `32×32` padded tiles) ready for ores, sand variants, spruce/birch, etc.
- **Stage 4 (Lighting & Day/Night):** `Chunk` reserves optional sky/block light arrays (`skyLight`, `blockLight`) and `ChunkMesher` multiplies vertex colors cleanly so skylight + torchlight integrate directly.
- **Stages 5–12 (Crafting, Survival, Fluids, Mobs, Menus, Redstone, Dimensions, Audio/Particles):** `Game` (`src/main.js`) maintains a clean fixed `20 TPS` simulation tick (`fixedTick(dt)`) separate from variable-timestep rendering (`render(alpha)`), and `SaveManager` uses extensible JSON schema versioning in `IndexedDB`.
