const CACHE_NAME = 'minecraft-web-stage8-v1';
const CORE_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './vendor/three.module.min.js',
  './src/main.js',
  './src/constants.js',
  './src/blocks/BlockRegistry.js',
  './src/items/ItemIds.js',
  './src/items/ItemRegistry.js',
  './src/items/RecipeRegistry.js',
  './src/items/Inventory.js',
  './src/textures/ItemSprites.js',
  './src/textures/ExtrudedItemMesh.js',
  './src/textures/TextureAtlas.js',
  './src/physics/AABBPhysics.js',
  './src/effects/ParticleManager.js',
  './src/world/Noise.js',
  './src/world/ChunkGenKernel.js',
  './src/world/BiomeManager.js',
  './src/world/WorldGen.js',
  './src/world/Chunk.js',
  './src/world/FluidSimulator.js',
  './src/world/LightingEngine.js',
  './src/world/ChunkMesher.js',
  './src/world/Raycast.js',
  './src/world/BlockEntityManager.js',
  './src/world/Explosion.js',
  './src/world/SkyRenderer.js',
  './src/world/MenuPanorama.js',
  './src/world/SkyEnvironment.js',
  './src/world/World.js',
  './src/entities/ItemEntity.js',
  './src/entities/FallingBlockEntity.js',
  './src/entities/XPOrbEntity.js',
  './src/entities/ProjectileEntity.js',
  './src/entities/Mob.js',
  './src/entities/EntityManager.js',
  './src/player/PlayerSkin.js',
  './src/player/FirstPersonHand.js',
  './src/player/PlayerController.js',
  './src/ui/Hotbar.js',
  './src/ui/InventoryUI.js',
  './src/ui/MobileControls.js',
  './src/ui/VirtualMouse.js',
  './src/ui/Hud.js',
  './src/storage/SaveManager.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
