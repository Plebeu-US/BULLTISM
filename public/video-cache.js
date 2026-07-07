const CACHE_REGISTRATION_URL = '/video-cache-sw.js';

function canRegisterVideoCache() {
  return (
    'serviceWorker' in navigator &&
    (window.location.protocol === 'https:' ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1')
  );
}

async function registerVideoCache() {
  if (!canRegisterVideoCache()) return;

  try {
    await navigator.serviceWorker.register(CACHE_REGISTRATION_URL, {
      scope: '/',
    });
  } catch {
    // The video player still works if service workers are unavailable.
  }
}

registerVideoCache();
