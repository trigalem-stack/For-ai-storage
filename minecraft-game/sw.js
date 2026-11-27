const CACHE_NAME = 'minecraft-web-stage1-v1';
const CORE_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './vendor/three.module.min.js',
  './src/main.js',
  './src/constants.js',
  './src/blocks/BlockRegistry.js',
  './src/textures/TextureAtlas.js',
  './src/world/Noise.js',
  './src/world/WorldGen.js',
  './src/world/Chunk.js',
  './src/world/ChunkMesher.js',
  './src/world/World.js',
  './src/player/PlayerSkin.js',
  './src/player/FirstPersonHand.js',
  './src/player/PlayerController.js',
  './src/ui/MobileControls.js',
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
