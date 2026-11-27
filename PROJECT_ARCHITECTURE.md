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
    ├── physics/
    │   └── AABBPhysics.js      # Axis-separated AABB collisions (0.6x1.8 / 0.6x1.5 crouch), Sneak Edge Guard
    ├── blocks/
    │   └── BlockRegistry.js    # Block IDs, hardness, tool hooks, break times, drop mappings, face tiles
    ├── textures/
    │   └── TextureAtlas.js     # Procedural 16x16 padded atlas (512x512) + destroy_stage_0..9 + 2D icons
    ├── world/
    │   ├── Noise.js            # Seeded PRNG + 2D/3D Simplex-style noise & FBM
    │   ├── WorldGen.js         # Seeded heightmap, biomes/mountains/beaches, bedrock, water, cross-chunk trees
    │   ├── Chunk.js            # Flat Uint8Array(16*128*16), minY/maxY air-skip bounds, dirty flag
    │   ├── ChunkMesher.js      # Reusable TypedArray scratch buffers, culling, AO (0..3), linear gamma shade
    │   ├── Raycast.js          # Amanatides & Woo 3D DDA traversal, SelectionBox, BreakCrackOverlay
    │   └── World.js            # Unlimited chunk RAM cache option, instant border remesh, modifiedBlocks delta
    ├── entities/
    │   └── ItemEntity.js       # Dropped 3D mini-blocks with gravity, stack merging & magnetic pickup
    ├── player/
    │   ├── PlayerSkin.js       # Procedural 64x64 Steve skin canvas + articulated PlayerModel (Minecraft UVs)
    │   ├── FirstPersonHand.js  # Upright depth-cleared 1st-person right arm & 3D held block mount
    │   └── PlayerController.js # AABB physics, sprint FOV, sneak edge-guard, 2x Jump fly, PC + Touch controls
    ├── ui/
    │   ├── Hotbar.js           # 9-slot pixel Hotbar (1-9, wheel, touch tap, stacks up to 64)
    │   ├── MobileControls.js   # Multitouch joystick, look/tap/long-press, 2x Jump fly, Break/Place/Sneak
    │   └── Hud.js              # Crosshair + break ring, F3 debug, Fullscreen API + iOS fallback, Settings
    └── storage/
        └── SaveManager.js      # IndexedDB offline persistence (seed, modifiedBlocks, hotbar, pose, settings)
```

---

## Stage Roadmap & Extension Hooks (Stages 1–12)

- **Stage 1 (Completed):** Offline Three.js setup, single-file `minecraft-offline.html` builder, procedural 16×16 padded texture atlas, seeded terrain + oak trees + water, chunked face-culled `BufferGeometry` with Smooth Voxel AO and directional face shading, Steve 64×64 skin & articulated model, depth-cleared 1st-person hand, PC + multitouch controls, Fullscreen button, IndexedDB save foundation.
- **Stage 2 (Completed):** Axis-separated AABB physics (`0.6×1.8` / `0.6×1.5` sneak, `~1.252` jump, sprint FOV `+10°`, Sneak Edge Guard, double-tap Jump fly on PC & phone), 3D DDA raycast & wireframe `SelectionBox`, progressive `destroy_stage_0..9` crack overlays & crosshair ring, `ItemEntity` 3D drops with stack merging & magnetic pickup, 9-slot `Hotbar` with 3D held block in hand, instant bordering chunk remeshing, unlimited world RAM cache setting, and full `IndexedDB` persistence of modified blocks + hotbar.
- **Stage 3 (Biomes & Caves):** `WorldGen` exposes biome sampling and 3D cave carving hooks; `TextureAtlas` has 256 tile slots (`16×16` grid of `32×32` padded tiles) ready for ores, sand variants, spruce/birch, etc.
- **Stage 4 (Lighting & Day/Night):** `Chunk` reserves optional sky/block light arrays (`skyLight`, `blockLight`) and `ChunkMesher` multiplies vertex colors cleanly so skylight + torchlight integrate directly.
- **Stages 5–12 (Crafting, Survival, Fluids, Mobs, Menus, Redstone, Dimensions, Audio/Particles):** `Game` (`src/main.js`) maintains a clean fixed `20 TPS` simulation tick (`fixedTick(dt)`) separate from variable-timestep rendering (`render(alpha)`), and `SaveManager` uses extensible JSON schema versioning in `IndexedDB`.
