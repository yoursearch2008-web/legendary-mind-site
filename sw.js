const CACHE = 'soltools-v1';
const SHELL = [
  '/',
  '/solsweep/',
  '/solswap/',
  '/solmint/',
  '/solsend/',
  '/solburn/',
  '/js/ads.js',
  '/js/consent.js',
  '/icons/icon.svg',
  '/manifest.json',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Cache-first for shell assets, network-first for everything else
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // Never cache Solana RPC or Jupiter API calls
  if (url.hostname.includes('solana') || url.hostname.includes('jup.ag') ||
      url.hostname.includes('unpkg.com') || url.hostname.includes('a-ads.com')) return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      const network = fetch(e.request).then(res => {
        if (res.ok && url.origin === location.origin) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      });
      return cached || network;
    })
  );
});
