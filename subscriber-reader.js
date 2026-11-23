// @ts-check
import { observeSettingsSubscription } from './settings-subscription.js';
import { initializeReader } from './reader.js';
import { parseStoryParentContentNotes, parentContentNotesCopy } from './parent-content-notes.js';

const ENTITLEMENT = 'Kamu Tales Pro';
const IDENTITY_KEYS = ['story_id', 'package_id', 'version_id', 'language', 'text_id'];
const root = /** @type {HTMLElement} */ (document.querySelector('[data-subscriber-reader]'));
const content = /** @type {HTMLElement} */ (root.querySelector('[data-subscriber-content]'));
const article = /** @type {HTMLElement} */ (root.querySelector('[data-reader-scroll]'));
const heading = /** @type {HTMLElement} */ (document.querySelector('[data-subscriber-title]'));
const status = /** @type {HTMLElement} */ (document.querySelector('[data-subscriber-status]'));
const audio = /** @type {HTMLAudioElement} */ (root.querySelector('[data-reader-audio]'));
const media = /** @type {HTMLScriptElement} */ (root.querySelector('[data-reader-media-json]'));
const origin = new URL(root.dataset.kamuApiOrigin);
const tenant = root.dataset.tauthTenant;
const storyId = root.dataset.storyId;
const COPY = {
  en: { title: 'Kamu Tales Pro', signedOut: 'Sign in to read this story.', loading: 'Loading story…',
    denied: 'This story requires an active Kamu Tales Pro subscription.', unavailable: 'The story could not load. We will check again when you return.', ready: 'Story ready.' },
  ru: { title: 'Kamu Tales Pro', signedOut: 'Войдите, чтобы прочитать сказку.', loading: 'Загружаем сказку…',
    denied: 'Для этой сказки нужна активная подписка Kamu Tales Pro.', unavailable: 'Не удалось загрузить сказку. Проверим ещё раз, когда вы вернётесь.', ready: 'Сказка загружена.' },
  bg: { title: 'Kamu Tales Pro', signedOut: 'Влезте в профила си, за да прочетете приказката.', loading: 'Зареждаме приказката…',
    denied: 'Тази приказка изисква активен абонамент за Kamu Tales Pro.', unavailable: 'Приказката не се зареди. Ще проверим отново, когато се върнете.', ready: 'Приказката е заредена.' },
};
const locale = root.dataset.uiLocale;
const copy = COPY[locale] || COPY.en;
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
let subscriptionActive = false;

function current(ticket) { return active && request === ticket && ticket.generation === generation && ticket.userId === userId && !ticket.controller.signal.aborted; }
function show(state, message) { root.dataset.subscriberState = state; status.textContent = message; }
function clearPrivateContent() {
  disposeReader?.(); disposeReader = null;
  audio.pause(); audio.removeAttribute('src'); audio.load();
  if (audioUrl) URL.revokeObjectURL(audioUrl); audioUrl = '';
  article.replaceChildren(); root.querySelector('[data-reader-pages]').replaceChildren();
  for (const key of Object.keys(article.dataset)) delete article.dataset[key];
  article.setAttribute('data-reader-scroll', '');
  media.textContent = '{}'; heading.textContent = copy.title;
  for (const information of root.querySelectorAll('[data-subscriber-information]')) information.replaceChildren();
  root.querySelector('[data-reader-info-panel]').hidden = true;
  for (const selector of ['[data-reader-audio-current]', '[data-reader-audio-duration]']) root.querySelector(selector).textContent = '0:00';
  const seek = root.querySelector('[data-reader-audio-seek]'); seek.value = '0'; seek.max = '0';
  root.classList.remove('has-reader-sync'); delete root.dataset.readerSyncStatus;
  content.hidden = true; loaded = false;
}
function changeIdentity(nextUserId) {
  generation++; request?.controller.abort(); request = null;
  userId = nextUserId; clearPrivateContent();
  show(userId ? 'loading' : 'signed-out', userId ? copy.loading : copy.signedOut);
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

function renderInformation(story) {
  const notes = parseStoryParentContentNotes(story, storyId);
  const noteCopy = parentContentNotesCopy(locale);
  for (const information of root.querySelectorAll('[data-subscriber-information]')) {
    const summaryText = story.aboutText || story.excerpt;
    if (typeof summaryText === 'string' && summaryText.trim()) {
      const summary = document.createElement('p'); summary.textContent = summaryText; information.append(summary);
    }
    if (!notes?.notes.length) continue;
    const details = document.createElement('details'); details.className = 'parent-content-notes'; details.dataset.parentContentNotes = '';
    const title = document.createElement('summary'); title.textContent = noteCopy.title;
    const scope = document.createElement('p'); scope.textContent = noteCopy.scope;
    const list = document.createElement('ul'); list.lang = notes.language;
    for (const text of notes.notes) { const item = document.createElement('li'); item.textContent = text; list.append(item); }
    details.append(title, scope, list); information.append(details);
  }
}
async function hydrate() {
  if (!active || !userId || !subscriptionActive || request || loaded) return;
  const ticket = { generation, userId, controller: new AbortController() }; request = ticket; show('loading', copy.loading);
  try {
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
    renderText(validated); renderInformation(story); media.textContent = JSON.stringify(bytes ? { audio: story.media.audio } : {});
    if (bytes) { audioUrl = URL.createObjectURL(new Blob([bytes], { type: story.media.audio.mimeType })); audio.src = audioUrl; }
    root.querySelector('[data-reader-audio-controls]').hidden = !bytes;
    content.hidden = false;
    disposeReader = initializeReader(root, { loadSynchronization: () => response(`${storyPath}/sync`, ticket) });
    loaded = true; show('ready', copy.ready);
  } catch (cause) {
    if (current(ticket)) { clearPrivateContent(); show('unavailable', copy.unavailable); }
  } finally { if (current(ticket) && !loaded) request = null; }
}

clearPrivateContent(); show('signed-out', copy.signedOut);
observeSettingsSubscription((snapshot) => {
  const nextUserId = snapshot.profile?.user_id || '';
  if (nextUserId !== userId) changeIdentity(nextUserId);
  subscriptionActive = snapshot.phase === 'active'
    && snapshot.session?.revenueCatAppUserId === `tauth:${userId}`
    && snapshot.session.subscription.entitlementId === ENTITLEMENT;
  if (subscriptionActive) { void hydrate(); return; }
  generation++; request?.controller.abort(); request = null; clearPrivateContent();
  show(!userId ? 'signed-out' : snapshot.phase === 'loading' ? 'loading' : snapshot.session ? 'denied' : 'unavailable',
    !userId ? copy.signedOut : snapshot.phase === 'loading' ? copy.loading : snapshot.session ? copy.denied : copy.unavailable);
});
window.addEventListener('pagehide', () => { active = false; subscriptionActive = false; changeIdentity(''); });
window.addEventListener('pageshow', event => { if (event.persisted) active = true; });
