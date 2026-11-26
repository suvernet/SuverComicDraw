// SuverComicDraw Service Worker for offline PWA support
const CACHE_NAME = 'suvercomicdraw-v1';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './js/config.js',
  './js/events.js',
  './js/files.js',
  './js/footer.js',
  './js/history.js',
  './js/hotkeys.js',
  './js/layers.js',
  './js/main.js',
  './js/palette.js',
  './js/render.js',
  './js/save.js',
  './js/selection.js',
  './js/tools.js',
  './js/utils.js',
  './fonts/RobotoCondensed-VariableFont_wght.ttf',
  './fonts/BadScript-Regular.ttf',
  './fonts/ComicRelief-Bold.ttf',
  './fonts/ComicRelief-Regular.ttf',
  './fonts/RobotoCondensed-Italic-VariableFont_wght.ttf',
  './fonts/suplexmentary-comic-nc.ttf',
  './fonts/manga-speak-bold.ttf',
  './fonts/v_AnimeAce2_v1.0.ttf'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((cached) => {
      return cached || fetch(e.request).catch(() => cached);
    })
  );
});
