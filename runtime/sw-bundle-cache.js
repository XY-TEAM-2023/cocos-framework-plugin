const CACHE_NAME = 'framework-bundle-files-v1';
const PREFIX = '/__bundle_cache__/';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

function isBundleCacheRequest(request) {
  try {
    const url = new URL(request.url);
    return url.origin === self.location.origin && url.pathname.startsWith(PREFIX);
  } catch (e) {
    return false;
  }
}

async function handleBundleRequest(request) {
  const cache = await caches.open(CACHE_NAME);
  const hit = await cache.match(request, { ignoreSearch: true });
  if (hit) return hit;

  const net = await fetch(request);
  if (net && net.ok) {
    // cache-first 体系下，兜底将网络命中也写入缓存
    cache.put(request, net.clone()).catch(() => {});
  }
  return net;
}

self.addEventListener('fetch', (event) => {
  if (!isBundleCacheRequest(event.request)) {
    return;
  }

  event.respondWith(handleBundleRequest(event.request));
});
