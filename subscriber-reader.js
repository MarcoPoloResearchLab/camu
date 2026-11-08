// @ts-check
import { observeAuthProfile, PARENT_AUTH_TARGET } from './mpr-auth-profile.js';
import { initializeReader } from './reader.js';

const ENTITLEMENT = 'Kamu Tales Pro';
const IDENTITY_KEYS = ['story_id', 'package_id', 'version_id', 'language', 'text_id'];
const root = /** @type {HTMLElement} */ (document.querySelector('[data-subscriber-reader]'));
const content = /** @type {HTMLElement} */ (root.querySelector('[data-subscriber-content]'));
const article = /** @type {HTMLElement} */ (root.querySelector('[data-reader-scroll]'));
const heading = /** @type {HTMLElement} */ (document.querySelector('[data-subscriber-title]'));
const status = /** @type {HTMLElement} */ (document.querySelector('[data-subscriber-status]'));
const load = /** @type {HTMLButtonElement} */ (document.querySelector('[data-subscriber-load]'));
const audio = /** @type {HTMLAudioElement} */ (root.querySelector('[data-reader-audio]'));
const media = /** @type {HTMLScriptElement} */ (root.querySelector('[data-reader-media-json]'));
const origin = new URL(root.dataset.kamuApiOrigin);
const tenant = root.dataset.tauthTenant;
const storyId = root.dataset.storyId;
if (!tenant || !storyId || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(storyId)
  || origin.pathname !== '/' || origin.search || origin.hash
  || (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(origin.hostname)))) {
  throw new Error('Subscriber reader configuration is invalid.');
}
const storyPath = `/api/stories/${encodeURIComponent(storyId)}`;
let active = true;
let generation = 0;
let userId = '';
let request = null;
let disposeReader = null;
let audioUrl = '';
let loaded = false;

function parentOpen() { return !!document.querySelector('[data-parent-area]:not([hidden])'); }
function current(ticket) { return active && request === ticket && ticket.generation === generation && ticket.userId === userId && !ticket.controller.signal.aborted; }
function show(state, message) { root.dataset.subscriberState = state; status.textContent = message; load.disabled = !active || !userId || state === 'loading' || loaded; }
function clearPrivateContent() {
  disposeReader?.(); disposeReader = null;
  audio.pause(); audio.removeAttribute('src'); audio.load();
  if (audioUrl) URL.revokeObjectURL(audioUrl); audioUrl = '';
  article.replaceChildren(); root.querySelector('[data-reader-pages]').replaceChildren();
  for (const key of Object.keys(article.dataset)) delete article.dataset[key];
  article.setAttribute('data-reader-scroll', '');
  media.textContent = '{}'; heading.textContent = 'Subscriber story';
  for (const selector of ['[data-reader-audio-current]', '[data-reader-audio-duration]']) root.querySelector(selector).textContent = '0:00';
  const seek = root.querySelector('[data-reader-audio-seek]'); seek.value = '0'; seek.max = '0';
  root.classList.remove('has-reader-sync'); delete root.dataset.readerSyncStatus;
  content.hidden = true; loaded = false;
}
function changeIdentity(nextUserId) {
  generation++; request?.controller.abort(); request = null;
  userId = nextUserId; clearPrivateContent();
  show(userId ? 'ready' : 'signed-out', userId ? 'Load the subscriber story to continue.' : 'Open the parent controls and sign in to read this story.');
  if (userId && parentOpen()) void hydrate();
}

async function response(path, ticket) {
  const result = await fetch(new URL(path, origin), { method: 'GET', credentials: 'include', signal: ticket.controller.signal,
    headers: { Accept: 'application/json', 'X-TAuth-Tenant': tenant } });
  if (!result.ok) throw new Error(`Load protected subscriber resource ${path}: HTTP ${result.status}`);
  return result;
}
function stableJSON(value) {
  if (Array.isArray(value)) return `[${value.map(stableJSON).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJSON(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
async function digest(value) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
async function parseDisplay(story, display) {
  if (story?.storyId !== storyId || !['ru', 'en', 'bg'].includes(story.language) || typeof story.title !== 'string'
    || story.access?.tier !== 'subscriber' || display?.schema !== 'kamu.display-text.v1'
    || display.storyId !== storyId || display.language !== story.language || typeof display.plainText !== 'string'
    || !Array.isArray(display.tokens) || !display.tokens.length || !Array.isArray(display.paragraphs) || !display.paragraphs.length
    || !story.readerAuthority || !display.readerAuthority
    || Object.keys(display.readerAuthority).length !== IDENTITY_KEYS.length
    || IDENTITY_KEYS.some((key) => !story.readerAuthority[key] || display.readerAuthority[key] !== story.readerAuthority[key])) {
    throw new Error('Protected reader identity differs from the selected story.');
  }
  const unhashed = { ...display }; delete unhashed.sha256;
  if (display.sha256 !== story.displayTextSha256 || await digest(stableJSON(unhashed)) !== story.displayTextSha256
    || display.source?.kind !== 'public-reader-delivery' || display.source.path !== story.displayTextSourcePath
    || display.source.sha256 !== story.displayTextSourceSha256 || await digest(display.plainText) !== story.displayTextSourceSha256) {
    throw new Error('Protected reader text differs from its admitted binding.');
  }
  const scalars = Array.from(display.plainText); let cursor = 0; const ids = new Set();
  for (const [index, token] of display.tokens.entries()) {
    if (typeof token.token_id !== 'string' || !token.token_id || ids.has(token.token_id) || token.order !== index + 1
      || !['word', 'space', 'punctuation'].includes(token.kind) || token.start !== cursor
      || !Number.isInteger(token.end) || token.end <= cursor || token.end > scalars.length
      || scalars.slice(token.start, token.end).join('') !== token.value) throw new Error('Protected reader token authority differs.');
    cursor = token.end; ids.add(token.token_id);
  }
  if (cursor !== scalars.length) throw new Error('Protected reader tokens omit text.');
  cursor = 0; ids.clear();
  for (const [index, paragraph] of display.paragraphs.entries()) {
    if (!paragraph.paragraph_id || ids.has(paragraph.paragraph_id) || paragraph.start !== cursor
      || !Number.isInteger(paragraph.end) || paragraph.end <= cursor || paragraph.end > scalars.length
      || (index < display.paragraphs.length - 1 && scalars.slice(paragraph.end, paragraph.end + 2).join('') !== '\n\n')
      || (index === display.paragraphs.length - 1 && paragraph.end !== scalars.length)) throw new Error('Protected reader paragraph authority differs.');
    cursor = paragraph.end + 2; ids.add(paragraph.paragraph_id);
  }
  return { story, display, scalars };
}
function renderText({ story, display, scalars }) {
  const delivery = document.createElement('div'); delivery.dataset.readerDeliveryText = '';
  for (const [key, value] of Object.entries({ readerStoryId: story.readerAuthority.story_id, readerPackageId: story.readerAuthority.package_id,
    readerVersionId: story.readerAuthority.version_id, readerLanguage: story.readerAuthority.language, readerTextId: story.readerAuthority.text_id })) delivery.dataset[key] = value;
  let previous = 0;
  for (const paragraph of display.paragraphs) {
    delivery.append(document.createTextNode(scalars.slice(previous, paragraph.start).join('')));
    const node = document.createElement('p'); node.dataset.readerParagraphId = paragraph.paragraph_id;
    for (const token of display.tokens.filter((item) => item.start < paragraph.end && item.end > paragraph.start)) {
      const span = document.createElement('span'); span.dataset.readerTokenId = token.token_id; span.dataset.readerTokenKind = token.kind;
      span.textContent = scalars.slice(Math.max(token.start, paragraph.start), Math.min(token.end, paragraph.end)).join(''); node.append(span);
    }
    delivery.append(node); previous = paragraph.end;
  }
  article.append(delivery); article.dataset.displayTextPath = story.displayTextPath;
  article.dataset.displayTextSha256 = story.displayTextSha256; article.dataset.displayTextSourceSha256 = story.displayTextSourceSha256;
  heading.textContent = story.title;
}
async function hydrate() {
  if (!active || !userId || !parentOpen() || request || loaded) return;
  const ticket = { generation, userId, controller: new AbortController() }; request = ticket; show('loading', 'Loading subscriber story.');
  try {
    const session = await (await response('/api/me', ticket)).json();
    if (!current(ticket)) return;
    if (session.subscription?.appUserId !== `tauth:${ticket.userId}` || session.subscription.active !== true
      || session.subscription.entitlementId !== ENTITLEMENT) throw new Error('The active subscriber session does not match this parent.');
    const [story, display] = await Promise.all([response(storyPath, ticket).then((value) => value.json()), response(`${storyPath}/display-text`, ticket).then((value) => value.json())]);
    const validated = await parseDisplay(story, display);
    if (!current(ticket)) return;
    let bytes = null;
    if (story.media?.audio?.status === 'available') {
      if (!/^[0-9a-f]{64}$/.test(story.media.audio.sha256) || !/^[0-9a-f]{64}$/.test(story.media.audio.syncSha256)
        || typeof story.media.audio.audioId !== 'string' || !story.media.audio.audioId
        || !Number.isFinite(story.media.audio.durationSeconds) || story.media.audio.durationSeconds <= 0) throw new Error('Protected audio binding is invalid.');
      bytes = await (await response(`${storyPath}/audio`, ticket)).arrayBuffer();
      if (await digest(bytes) !== story.media.audio.sha256) throw new Error('Protected audio differs from its admitted binding.');
    }
    if (!current(ticket)) return;
    renderText(validated); media.textContent = JSON.stringify(bytes ? { audio: story.media.audio } : {});
    if (bytes) { audioUrl = URL.createObjectURL(new Blob([bytes], { type: story.media.audio.mimeType })); audio.src = audioUrl; }
    root.querySelector('[data-reader-audio-controls]').hidden = !bytes;
    content.hidden = false;
    disposeReader = initializeReader(root, { loadSynchronization: () => response(`${storyPath}/sync`, ticket) });
    loaded = true; show('ready', 'Subscriber story ready.');
  } catch (cause) {
    if (current(ticket)) { clearPrivateContent(); show('denied', 'This story requires an active subscription for the signed-in parent.'); }
  } finally { if (current(ticket) && !loaded) request = null; }
}

observeAuthProfile(document.querySelector(PARENT_AUTH_TARGET), (profile) => {
  const nextUserId = profile?.user_id || '';
  if (nextUserId !== userId) changeIdentity(nextUserId);
});
load.addEventListener('click', () => { void hydrate(); });
const observer = new MutationObserver(() => { if (userId && parentOpen() && !request && !loaded) void hydrate(); });
function observeParentArea() {
  for (const area of document.querySelectorAll('[data-parent-area]')) observer.observe(area, { attributes: true, attributeFilter: ['hidden'] });
}
observeParentArea();
window.addEventListener('pagehide', () => { active = false; observer.disconnect(); changeIdentity(''); });
window.addEventListener('pageshow', (event) => { if (event.persisted) { active = true; changeIdentity(''); observeParentArea(); } });
clearPrivateContent(); show('signed-out', 'Open the parent controls and sign in to read this story.');
