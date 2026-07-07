const CACHE_NAME = 'bulltism-video-cache-v1';
const VIDEO_PATHS = new Set([
  '/videos/bulltism-video.webm',
  '/videos/bulltism-video.mp4',
  '/assets/lol.mp4',
]);

function isCacheableVideoRequest(request) {
  if (request.method !== 'GET') return false;

  const url = new URL(request.url);
  return url.origin === self.location.origin && VIDEO_PATHS.has(url.pathname);
}

function parseRange(rangeHeader, size) {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader || '');
  if (!match) return null;

  let start = match[1] === '' ? 0 : Number(match[1]);
  let end = match[2] === '' ? size - 1 : Number(match[2]);

  if (match[1] === '' && match[2] !== '') {
    const suffixLength = Number(match[2]);
    start = Math.max(size - suffixLength, 0);
    end = size - 1;
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= size) {
    return null;
  }

  return {
    start,
    end: Math.min(end, size - 1),
  };
}

async function cacheFullVideo(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request.url, { ignoreVary: true });
  if (cached) return cached;

  const fullRequest = new Request(request.url, {
    cache: 'reload',
    credentials: 'same-origin',
    mode: 'same-origin',
  });
  const response = await fetch(fullRequest);

  if (response.ok && response.status === 200) {
    await cache.put(request.url, response.clone());
  }

  return response;
}

async function respondWithRange(request, cachedResponse) {
  const range = parseRange(request.headers.get('range'), Number(cachedResponse.headers.get('content-length')));
  if (!range) return cachedResponse;

  const buffer = await cachedResponse.arrayBuffer();
  const chunk = buffer.slice(range.start, range.end + 1);
  const headers = new Headers(cachedResponse.headers);

  headers.set('accept-ranges', 'bytes');
  headers.set('content-length', String(chunk.byteLength));
  headers.set('content-range', `bytes ${range.start}-${range.end}/${buffer.byteLength}`);
  headers.set('cache-control', 'public, max-age=31536000, immutable');

  return new Response(chunk, {
    status: 206,
    statusText: 'Partial Content',
    headers,
  });
}

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (!isCacheableVideoRequest(request)) return;

  const rangeHeader = request.headers.get('range');
  if (rangeHeader) {
    event.waitUntil(cacheFullVideo(request).catch(() => {}));
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request.url, { ignoreVary: true });

      if (cached) {
        return rangeHeader ? respondWithRange(request, cached) : cached;
      }

      if (rangeHeader) {
        return fetch(request);
      }

      return cacheFullVideo(request);
    }),
  );
});
