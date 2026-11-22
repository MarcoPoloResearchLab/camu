// @ts-check
const COPY = Object.freeze({
  en: { failure: 'Account controls could not load. Please try again.' },
  ru: { failure: 'Не удалось открыть настройки. Попробуйте снова.' },
  bg: { failure: 'Настройките не се заредиха. Опитайте отново.' },
});
const copy = COPY[document.documentElement.lang] || COPY.en;
const status = document.createElement('p');
status.dataset.parentControlsStatus = '';
status.setAttribute('role', 'status');
document.body.append(status);
/** @type {null | {generation: number}} */
let pendingAction = null;
let replayTarget = null;
let parentUnlocked = false;
/** @type {Promise<void> | null} */
let identityLoad = null;
const DOCUMENT_STATUS = Object.freeze({ active: 'active', suspended: 'suspended', replacing: 'replacing' });
/** @type {{generation: number, status: 'active' | 'suspended' | 'replacing'}} */
let documentState = { generation: 0, status: DOCUMENT_STATUS.active };
let privilegedRuntimeStarted = false;
function isCurrentGeneration(generation) {
  return documentState.status === DOCUMENT_STATUS.active && generation === documentState.generation;
}
function lockParentArea() {
  parentUnlocked = false;
  for (const area of document.querySelectorAll('[data-parent-area]')) { area.setAttribute('hidden', ''); area.setAttribute('inert', ''); }
}
window.addEventListener('pagehide', () => {
  documentState = { generation: documentState.generation + 1, status: documentState.status === DOCUMENT_STATUS.replacing ? DOCUMENT_STATUS.replacing : DOCUMENT_STATUS.suspended };
  pendingAction = null; replayTarget = null; status.textContent = '';
  globalThis.KamuSettings?.closeSettingsDialog();
  lockParentArea();
  for (const frame of document.querySelectorAll('iframe[data-parent-src][src]')) { frame.parentElement.querySelector('[data-parent-media]').removeAttribute('hidden'); frame.remove(); }
});
window.addEventListener('pageshow', (event) => {
  if (!event.persisted || documentState.status === DOCUMENT_STATUS.replacing) return;
  if (privilegedRuntimeStarted) { documentState = { ...documentState, status: DOCUMENT_STATUS.replacing }; window.location.reload(); return; }
  documentState = { ...documentState, status: DOCUMENT_STATUS.active };
});
/** An explicit click/keyboard activation initiates one action in the current document generation. */
function requestParent(action) {
  if (documentState.status !== DOCUMENT_STATUS.active || pendingAction) return;
  const current = { generation: documentState.generation }; pendingAction = current; status.textContent = '';
  try {
    // Invoke synchronously to preserve browser user activation for external windows and media.
    Promise.resolve(action(current.generation)).catch(() => {
      if (isCurrentGeneration(current.generation)) status.textContent = copy.failure;
    }).finally(() => { if (pendingAction === current) pendingAction = null; });
  } catch { if (isCurrentGeneration(current.generation)) status.textContent = copy.failure; if (pendingAction === current) pendingAction = null; }
}

async function loadIdentity(generation) {
  if (!isCurrentGeneration(generation)) return;
  const config = /** @type {HTMLScriptElement} */ (document.querySelector('[data-parent-identity]'));
  const assets = JSON.parse(config.textContent);
  privilegedRuntimeStarted = true;
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = assets.stylesheet;
  document.head.append(stylesheet);
  for (const src of assets.scripts) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Load account identity asset ${src}`));
      document.head.append(script);
    });
    if (!isCurrentGeneration(generation)) return;
  }
}

async function openParentArea(generation) {
  if (!isCurrentGeneration(generation)) return;
  // Settings owns the account surface. The shared controller owns session restoration.
  for (const button of document.querySelectorAll('[data-account-connect]')) button.hidden = true;
  if (!identityLoad) identityLoad = loadIdentity(generation);
  for (const button of document.querySelectorAll('[data-parent-open]')) button.setAttribute('disabled', '');
  try {
    await identityLoad;
    if (!isCurrentGeneration(generation)) return;
    parentUnlocked = true;
    for (const area of document.querySelectorAll('[data-parent-area]')) {
      area.removeAttribute('hidden');
      area.removeAttribute('inert');
    }
  } catch (cause) {
    if (!isCurrentGeneration(generation)) return;
    identityLoad = null;
    lockParentArea();
    for (const button of document.querySelectorAll('[data-account-connect]')) button.hidden = false;
    throw cause;
  } finally {
    if (isCurrentGeneration(generation)) {
      for (const button of document.querySelectorAll('[data-parent-open]')) button.removeAttribute('disabled');
    }
  }
}

globalThis.KamuSettings?.initializeSettingsDialog({ onOpen: () => requestParent(openParentArea) });
if (document.querySelector('[data-settings-modal]')?.getAttribute('aria-hidden') === 'false') requestParent(openParentArea);

document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  const parentOpen = target.closest('[data-parent-open], [data-account-connect]');
  if (parentOpen) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (parentUnlocked) { globalThis.KamuSettings?.openSettingsDialog(); return; }
    requestParent(openParentArea);
    return;
  }
  if (target.closest('[data-parent-close]')) {
    event.preventDefault();
    // A new document removes provider code and always starts with account controls closed.
    window.location.reload();
    return;
  }
  const action = target.closest('a, [data-reader-share-url], [data-parent-media]');
  if (!action || replayTarget === action) return;
  const href = action.getAttribute('data-parent-url') || action.getAttribute('href');
  const external = href && new URL(href, window.location.href).origin !== window.location.origin;
  if (!external && !action.hasAttribute('data-reader-share-url') && !action.hasAttribute('data-parent-media')) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  requestParent(() => {
    if (action.hasAttribute('data-parent-media')) {
      const template = /** @type {HTMLTemplateElement} */ (action.parentElement.querySelector('[data-parent-media-frame]'));
      const frame = /** @type {HTMLIFrameElement} */ (template.content.querySelector('iframe').cloneNode(true));
      privilegedRuntimeStarted = true;
      frame.name = `kamu-video-${crypto.randomUUID()}`;
      frame.src = frame.dataset.parentSrc;
      action.parentElement.append(frame);
      action.setAttribute('hidden', '');
      return;
    }
    if (action.hasAttribute('data-parent-url') && !action.hasAttribute('data-reader-share-url')) {
      if (action.getAttribute('target') === '_blank') {
        window.open(href, '_blank', 'noopener,noreferrer');
      } else {
        window.location.assign(href);
      }
      return;
    }
    replayTarget = action;
    try { /** @type {HTMLElement} */ (action).click(); } finally { replayTarget = null; }
  });
}, true);

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const target = event.target instanceof Element ? event.target.closest('a[data-parent-url]') : null;
  if (!target) return;
  event.preventDefault();
  /** @type {HTMLElement} */ (target).click();
});

const LOCAL_PREFERENCE_KEYS = Object.freeze(['kamu:ui-locale']);
const LOCAL_READER_PREFIX = 'kamu:reader:surface:';
document.addEventListener('click', (event) => {
  if (!(event.target instanceof Element) || !event.target.closest('[data-local-data-reset]')) return;
  try {
    const keys = Object.keys(window.localStorage);
    for (const key of keys) {
      if (LOCAL_PREFERENCE_KEYS.includes(key) || key.startsWith(LOCAL_READER_PREFIX)) window.localStorage.removeItem(key);
    }
    window.location.reload();
  } catch (cause) {
    document.querySelector('[data-local-data-reset-status]').textContent = 'Local preferences could not be cleared. Check browser storage settings.';
    console.error('Clear Kamu local preferences', cause);
  }
});
