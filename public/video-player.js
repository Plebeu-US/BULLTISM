const FORMAT_STORAGE_KEY = 'bulltism-video-format';
const FORMAT_PRIORITY = {
  'video/webm': 0,
  'video/mp4': 1,
};
const MIME_BY_FORMAT = {
  webm: 'video/webm',
  mp4: 'video/mp4',
};
const FORMAT_BY_MIME = {
  'video/webm': 'webm',
  'video/mp4': 'mp4',
};
const LOOP_EDGE_SECONDS = 0.28;
const LOOP_RESTART_COOLDOWN_MS = 450;
const LOOP_WATCHDOG_INTERVAL_MS = 900;
const PLAYBACK_PROGRESS_EPSILON_SECONDS = 0.08;
const STUCK_PLAYBACK_GRACE_MS = 6500;
const STUCK_RELOAD_GRACE_MS = 11000;

const playerStates = new Set();

function getSavedFormat() {
  try {
    const saved = window.localStorage.getItem(FORMAT_STORAGE_KEY);
    return saved === 'webm' || saved === 'mp4' ? saved : '';
  } catch {
    return '';
  }
}

function saveFormat(format) {
  try {
    window.localStorage.setItem(FORMAT_STORAGE_KEY, format);
  } catch {
    // localStorage can be blocked; the player still works without persistence.
  }
}

function normalizeSource(source) {
  if (!source?.url || !source?.type) return null;
  const type = source.type.toLowerCase();
  if (!FORMAT_PRIORITY.hasOwnProperty(type)) return null;

  return {
    type,
    format: FORMAT_BY_MIME[type],
    url: source.url,
  };
}

function dedupeSources(sources) {
  const seen = new Set();

  return sources.filter((source) => {
    const key = `${source.type}:${source.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sortSources(sources) {
  return [...sources].sort((a, b) => FORMAT_PRIORITY[a.type] - FORMAT_PRIORITY[b.type]);
}

function collectHtmlSources(video) {
  return Array.from(video.querySelectorAll('source'))
    .map((source) =>
      normalizeSource({
        type: source.type,
        url: source.dataset.src || source.src || source.getAttribute('src'),
      }),
    )
    .filter(Boolean);
}

async function fetchManifestSources(manifestUrl) {
  if (!manifestUrl) return [];

  try {
    const response = await fetch(manifestUrl, { cache: 'no-store' });
    if (!response.ok) return [];

    const manifest = await response.json();
    const sources = [
      normalizeSource({ type: MIME_BY_FORMAT.webm, url: manifest.webmUrl }),
      normalizeSource({ type: MIME_BY_FORMAT.mp4, url: manifest.mp4Url }),
    ];

    return sources.filter(Boolean);
  } catch {
    return [];
  }
}

function hasFiniteDuration(video) {
  return Number.isFinite(video.duration) && video.duration > 0;
}

function setStatus(state, text) {
  if (!state.status) return;
  state.status.textContent = text || '';
  state.status.hidden = !text;
}

function updateIndicator(state, source) {
  if (!state.indicator) return;
  state.indicator.textContent = source?.format ? source.format.toUpperCase() : '';
  state.indicator.hidden = !source?.format;
}

function updateFormatButtons(state) {
  state.buttons.forEach((button) => {
    const format = button.dataset.videoFormatChoiceButton;
    const isAvailable = state.sources.some((source) => source.format === format);
    const isActive = state.currentSource?.format === format;
    button.disabled = !isAvailable;
    button.classList.toggle('is-active', isActive);
  });
}

function configureAutoplay(video) {
  video.muted = true;
  video.defaultMuted = true;
  video.autoplay = true;
  video.loop = true;
  video.playsInline = true;

  video.setAttribute('muted', '');
  video.setAttribute('loop', '');
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  video.setAttribute('autoplay', '');
}

function attemptPlayback(state) {
  if (!state.autoplay || !state.currentSource) return;

  configureAutoplay(state.video);
  const playAttempt = state.video.play();

  if (playAttempt?.catch) {
    playAttempt.catch(() => {
      setStatus(state, 'TAP TO START');
    });
  }
}

function chooseSource(state, requestedFormat = '') {
  const preferredFormat = requestedFormat || getSavedFormat();
  const available = state.sources.filter((source) => !state.failedTypes.has(source.type));

  if (preferredFormat) {
    const preferred = available.find((source) => source.format === preferredFormat);
    if (preferred) return preferred;
  }

  return sortSources(available)[0] || null;
}

function loadSource(state, source) {
  if (!source) {
    state.currentSource = null;
    state.video.removeAttribute('src');
    state.video.load();
    updateIndicator(state, null);
    updateFormatButtons(state);
    setStatus(state, 'NO SIGNAL YET');
    return;
  }

  state.currentSource = source;
  state.playbackStuckSince = 0;
  state.lastWatchdogCurrentTime = 0;
  state.video.src = source.url;
  state.video.preload = state.preload;
  state.video.load();
  updateIndicator(state, source);
  updateFormatButtons(state);
  setStatus(state, '');
  attemptPlayback(state);
}

function fallbackSource(state) {
  if (state.currentSource) {
    state.failedTypes.add(state.currentSource.type);
  }

  const nextSource = chooseSource(state);
  if (nextSource) {
    loadSource(state, nextSource);
    return;
  }

  setStatus(state, 'VIDEO UNAVAILABLE');
  updateIndicator(state, null);
  updateFormatButtons(state);
}

function shouldLoopNow(state) {
  if (!state.currentSource || state.video.seeking || !hasFiniteDuration(state.video)) {
    return false;
  }

  if (state.video.ended) {
    return true;
  }

  return state.video.duration - state.video.currentTime <= LOOP_EDGE_SECONDS;
}

function restartLoop(state) {
  if (!shouldLoopNow(state)) return;

  const now = Date.now();
  if (now - state.lastLoopRestartAt < LOOP_RESTART_COOLDOWN_MS) return;

  state.lastLoopRestartAt = now;
  state.playbackStuckSince = 0;

  try {
    state.video.currentTime = 0;
  } catch {
    loadSource(state, state.currentSource);
    return;
  }

  attemptPlayback(state);
}

function watchPlaybackHealth(state) {
  if (document.hidden || !state.autoplay || !state.currentSource) return;

  restartLoop(state);

  if (state.video.ended || state.video.seeking) return;

  if (state.video.paused || state.video.readyState < 2) {
    attemptPlayback(state);
    return;
  }

  const now = Date.now();
  const currentTime = state.video.currentTime || 0;
  const movedForward = currentTime - state.lastWatchdogCurrentTime > PLAYBACK_PROGRESS_EPSILON_SECONDS;
  const loopedBack = currentTime + PLAYBACK_PROGRESS_EPSILON_SECONDS < state.lastWatchdogCurrentTime;

  if (movedForward || loopedBack) {
    state.lastWatchdogCurrentTime = currentTime;
    state.playbackStuckSince = 0;
    return;
  }

  if (!state.playbackStuckSince) {
    state.playbackStuckSince = now;
    return;
  }

  const stuckFor = now - state.playbackStuckSince;

  if (stuckFor >= STUCK_PLAYBACK_GRACE_MS) {
    attemptPlayback(state);
  }

  if (stuckFor >= STUCK_RELOAD_GRACE_MS && now - state.lastStuckReloadAt >= STUCK_RELOAD_GRACE_MS) {
    state.lastStuckReloadAt = now;
    loadSource(state, state.currentSource);
  }
}

function recoverAllPlayers() {
  playerStates.forEach((state) => {
    if (!state.currentSource) return;
    attemptPlayback(state);
    watchPlaybackHealth(state);
  });
}

async function loadVideo(state, requestedFormat = '') {
  if (state.loading) return;
  state.loading = true;
  setStatus(state, 'LOADING');

  const htmlSources = collectHtmlSources(state.video);
  const manifestSources = await fetchManifestSources(state.manifestUrl);
  state.sources = sortSources(dedupeSources([...manifestSources, ...htmlSources]));
  state.failedTypes.clear();
  state.loading = false;

  const source = chooseSource(state, requestedFormat);
  loadSource(state, source);
}

function initFormatButtons(state) {
  state.buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const format = button.dataset.videoFormatChoiceButton;
      if (format !== 'webm' && format !== 'mp4') return;
      saveFormat(format);
      state.failedTypes.clear();

      const source = chooseSource(state, format);
      loadSource(state, source);
    });
  });
}

function initPlayer(unit) {
  const video = unit.querySelector('[data-video-player]');
  if (!video) return;

  const state = {
    unit,
    video,
    status: unit.querySelector('[data-video-status]'),
    indicator: unit.querySelector('.video-format-indicator'),
    buttons: Array.from(unit.querySelectorAll('[data-video-format-choice-button]')),
    manifestUrl: video.dataset.videoManifest || '',
    preload: video.dataset.videoPreload || video.preload || 'metadata',
    autoplay: video.dataset.videoAutoplay !== 'false',
    lazy: video.dataset.videoLazy === 'true',
    sources: [],
    failedTypes: new Set(),
    currentSource: null,
    loading: false,
    lastLoopRestartAt: 0,
    lastWatchdogCurrentTime: 0,
    playbackStuckSince: 0,
    lastStuckReloadAt: 0,
  };

  playerStates.add(state);
  configureAutoplay(video);
  initFormatButtons(state);
  updateFormatButtons(state);

  video.addEventListener('error', () => fallbackSource(state));
  video.addEventListener('ended', () => restartLoop(state));
  video.addEventListener('timeupdate', () => restartLoop(state));
  video.addEventListener('playing', () => setStatus(state, ''));
  unit.addEventListener('pointerdown', () => attemptPlayback(state));
  unit.addEventListener('touchstart', () => attemptPlayback(state), { passive: true });

  if (state.lazy && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          loadVideo(state);
        }
      },
      {
        rootMargin: '320px 0px',
        threshold: 0.01,
      },
    );
    observer.observe(unit);
  } else {
    loadVideo(state);
  }
}

document.querySelectorAll('[data-video-player-unit]').forEach(initPlayer);

setInterval(() => {
  playerStates.forEach(watchPlaybackHealth);
}, LOOP_WATCHDOG_INTERVAL_MS);

document.addEventListener('visibilitychange', recoverAllPlayers);
window.addEventListener('focus', recoverAllPlayers);
window.addEventListener('pageshow', recoverAllPlayers);
window.addEventListener('online', recoverAllPlayers);
window.addEventListener('resume', recoverAllPlayers);
window.addEventListener('freeze', recoverAllPlayers);
window.addEventListener('pointerdown', recoverAllPlayers);
window.addEventListener('touchstart', recoverAllPlayers, { passive: true });
window.addEventListener('keydown', recoverAllPlayers);
