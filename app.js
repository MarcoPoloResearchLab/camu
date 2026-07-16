const UI_COPY = Object.freeze({
  ru: {
    heroEyebrow: 'Тёплый каталог для чтения вслух',
    heroTitle: 'Сказки от Каму',
    heroLede: 'Здесь живут добрые, волшебные и мудрые сказки для семейного чтения — русские, индийские, американские, французские и любимые истории со всего света.',
    stats: {
      clean: 'чистых',
      audio: 'с аудио',
      visual: 'с иллюстрациями',
    },
    heroCard: 'Выбирайте сказку, устраивайтесь поудобнее, и начинайте читать.',
    footerManifest: 'Сказки для семейного чтения и уютного прослушивания.',
    kamuName: 'Каму',
    searchPlaceholder: 'Найти сказку',
    searchSubmit: 'Показать фильтры и сказки',
    ageAll: 'Любой возраст',
    aria: {
      stats: 'Сводка каталога',
      heroCard: 'Каму',
      search: 'Поиск сказок',
      searchInput: 'Найти сказку',
      ageFilters: 'Возраст сказок',
      toolbar: 'Библиотека сказок',
      catalog: 'Каталог сказок',
    },
    toolbarLabel: 'Библиотека',
    filters: {
      all: 'Все сказки',
    },
    openStory: (title) => `Открыть ${title}`,
    audioLabel: 'Аудио',
    videoLabel: 'Видео',
    ageLabel: 'Возраст',
    popularityLabel: 'Популярность',
    readTimeLabel: 'Чтение',
    charactersLabel: 'Персонажи',
    readTime: (minutes) => `${minutes} мин чтения`,
    loading: 'Загружаем сказки...',
    loadError: (message) => `Не удалось загрузить каталог: ${message}`,
    empty: 'В этом разделе пока нет сказок.',
    settings: {
      title: 'Настройки',
      open: 'Открыть настройки',
      close: 'Закрыть настройки',
      languageTitle: 'Язык',
      languageAria: 'Язык сказок',
      proTitle: 'Kamu Pro',
      proBody: 'Полный каталог сказок открывается по подписке Kamu Pro.',
      proActive: 'Подписка активна.',
      proInactive: 'Подписка не активна.',
      proLoading: 'Готовим оформление подписки...',
      proUnavailable: 'Оформление подписки временно недоступно.',
      subscribe: 'Подписаться',
    },
  },
  en: {
    heroEyebrow: 'A warm catalog for reading aloud',
    heroTitle: 'Fairy Tales by Kamu',
    heroLede: 'Discover gentle, magical, and wise tales for family reading, from Indian stories to beloved classics from around the world.',
    stats: {
      clean: 'ready',
      audio: 'audio',
      visual: 'illustrated',
    },
    heroCard: 'Choose a tale, settle in, and start reading.',
    footerManifest: 'Fairy tales for family reading and cozy listening.',
    kamuName: 'Kamu',
    searchPlaceholder: 'Find a tale',
    searchSubmit: 'Show filters and tales',
    ageAll: 'Any age',
    aria: {
      stats: 'Catalog summary',
      heroCard: 'Kamu',
      search: 'Search fairy tales',
      searchInput: 'Find a tale',
      ageFilters: 'Fairy tale age',
      toolbar: 'Fairy tale library',
      catalog: 'Fairy tale catalog',
    },
    toolbarLabel: 'Library',
    filters: {
      all: 'All tales',
    },
    openStory: (title) => `Open ${title}`,
    audioLabel: 'Audio',
    videoLabel: 'Video',
    ageLabel: 'Age',
    popularityLabel: 'Popularity',
    readTimeLabel: 'Read time',
    charactersLabel: 'Characters',
    readTime: (minutes) => `${minutes} min read`,
    loading: 'Loading fairy tales...',
    loadError: (message) => `The catalog could not be loaded: ${message}`,
    empty: 'No fairy tales in this section yet.',
    settings: {
      title: 'Settings',
      open: 'Open settings',
      close: 'Close settings',
      languageTitle: 'Language',
      languageAria: 'Story language',
      proTitle: 'Kamu Pro',
      proBody: 'The full story catalog unlocks with a Kamu Pro subscription.',
      proActive: 'Subscription active.',
      proInactive: 'Subscription inactive.',
      proLoading: 'Preparing subscription checkout...',
      proUnavailable: 'Subscription checkout is temporarily unavailable.',
      subscribe: 'Subscribe',
    },
  },
});

const DEFAULT_COLLECTION = Object.freeze({
  id: 'all',
  labels: { ru: 'Сказки', en: 'Fairy tales' },
  shortLabels: { ru: 'Сказки', en: 'Tales' },
  uiLanguage: 'ru',
  order: 999,
  accent: '#b85d2b',
});

const RUSSIAN_POPULARITY_LABELS = Object.freeze({
  'Very High': 'Очень высокая',
  High: 'Высокая',
  Medium: 'Средняя',
  Low: 'Низкая',
  'Very Low': 'Очень низкая',
});
const CATALOG_EAGER_IMAGE_COUNT = 12;
const SESSION_PATH = '/api/me';
const SUBSCRIBER_CATALOG_PATH = '/api/catalog/subscriber';
const SUBSCRIPTION_WEB_CHECKOUT_PATH = '/api/subscription/web-checkout';
const SETTINGS_MENU_ACTION = 'open-settings';
const ACCOUNT_SETTINGS_PATH = '/account';
const TAUTH_TENANT_ID = 'kamu';

const state = {
  stories: [],
  filters: [{ id: 'all', labels: { ru: 'Все сказки', en: 'All tales' }, uiLanguage: 'ru' }],
  allFilters: [{ id: 'all', labels: { ru: 'Все сказки', en: 'All tales' }, uiLanguage: 'ru' }],
  collections: new Map(),
  activeFilter: 'all',
  activeAge: 'all',
  searchExpanded: false,
  searchQuery: '',
  uiLocale: 'ru',
  assetPrefix: '',
  catalogSource: 'public',
  publicCatalog: null,
  authProfile: null,
  backendSession: null,
  subscriptionState: 'signed-out',
  webCheckoutUrl: '',
  webCheckoutUnavailable: false,
  authCatalogRequestId: 0,
};

const catalogMain = document.querySelector('[data-catalog-main]');
const catalogRoot = document.querySelector('[data-catalog-grid]');
const emptyState = document.querySelector('[data-empty-state]');
const manifestContainer = document.querySelector('[data-manifest-url]');
const manifestUrl = manifestContainer?.dataset.manifestUrl || 'data/fairy-tales.manifest.json';
state.uiLocale = normalizeUiLocale(manifestContainer?.dataset.uiLocale || document.documentElement.lang);
state.assetPrefix = manifestContainer?.dataset.assetPrefix || assetPrefixFromManifestUrl(manifestUrl);

async function initializeCatalog() {
  bindSearch();
  bindAuthCatalog();
  updateSearchVisibility();
  openSettingsModalForAccountRoute();
  try {
    const manifest = await fetchManifest(manifestUrl);
    if (state.catalogSource === 'subscriber') {
      state.publicCatalog = manifest;
      return;
    }
    applyCatalogDocument(manifest, 'public');
  } catch (error) {
    if (state.catalogSource === 'subscriber') {
      console.warn('Public catalog unavailable after subscriber catalog loaded', error);
      return;
    }
    renderError(error);
  }
}

function applyCatalogDocument(manifest, source) {
  const nextSource = source === 'subscriber' ? 'subscriber' : 'public';
  if (nextSource === 'public') state.publicCatalog = manifest;
  state.catalogSource = nextSource;
  state.stories = Array.isArray(manifest?.stories) ? manifest.stories : [];
  updateCatalogRuntimeState();
  state.allFilters = Array.isArray(manifest?.filters) ? manifest.filters : state.allFilters;
  state.collections = new Map((manifest?.collections || []).map((collection) => [collection.id, collection]));
  state.filters = filtersForStories(state.allFilters, storiesForCurrentLanguage());
  hydrateFilters();
  hydrateAgeFilters();
  bindToolbar();
  updateStats(statsForStories(storiesForCurrentLanguage()));
  renderCatalog();
}

function bindAuthCatalog() {
  document.addEventListener('mpr-ui:auth:authenticated', handleSignedInCatalogEvent);
  document.addEventListener('mpr-ui:auth:unauthenticated', handleSignedOutCatalogEvent);
  document.addEventListener('mpr-user:menu-item', handleUserMenuItem);
  document.addEventListener('mpr-user:logout', handleUserLogoutEvent);
  document.addEventListener('click', handleSettingsOpenClick);
  document.addEventListener('click', handleSettingsModalClick);
  document.addEventListener('keydown', handleSettingsModalKeyDown);
}

function handleSignedInCatalogEvent(event) {
  const profile = event?.detail?.profile;
  if (!profile || typeof profile !== 'object') return;
  state.authProfile = profile;
  loadAuthenticatedCatalog();
}

function handleSignedOutCatalogEvent() {
  closeSettingsModal();
  restorePublicCatalog();
}

function handleUserMenuItem(event) {
  if (event?.detail?.action !== SETTINGS_MENU_ACTION) return;
  openSettingsModal();
}

function handleSettingsOpenClick(event) {
  const opener = event?.target?.closest?.('[data-settings-open]');
  if (!opener) return;
  event.preventDefault?.();
  openSettingsModal();
}

function openSettingsModalForAccountRoute() {
  if (isAccountSettingsRoute()) openSettingsModal();
}

function isAccountSettingsRoute() {
  const pathname = String(window.location?.pathname || '');
  const withoutIndex = pathname.replace(/\/index\.html$/i, '');
  const normalized = withoutIndex.replace(/\/+$/, '') || '/';
  return normalized === ACCOUNT_SETTINGS_PATH;
}

function handleUserLogoutEvent() {
  closeSettingsModal();
  syncStandaloneLoginButtonsSignedOut();
  restorePublicCatalog();
  window.setTimeout(clearSignedOutHash, 0);
}

function openSettingsModal() {
  const modal = document.querySelector('[data-settings-modal]');
  if (!modal) return;
  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');
  updateSettingsModal();
  const closeButton = document.querySelector('[data-settings-close]');
  if (typeof closeButton?.focus === 'function') closeButton.focus();
}

function closeSettingsModal() {
  const modal = document.querySelector('[data-settings-modal]');
  if (!modal) return;
  modal.hidden = true;
  modal.setAttribute('aria-hidden', 'true');
}

function handleSettingsModalClick(event) {
  const target = event?.target;
  if (typeof target?.matches !== 'function' || !target.matches('[data-settings-close]')) return;
  event.preventDefault?.();
  closeSettingsModal();
}

function handleSettingsModalKeyDown(event) {
  if (event?.key !== 'Escape') return;
  const modal = document.querySelector('[data-settings-modal]');
  if (!modal || modal.hidden) return;
  closeSettingsModal();
}

function syncStandaloneLoginButtonsSignedOut() {
  for (const button of document.querySelectorAll('mpr-login-button')) {
    button.setAttribute('data-mpr-auth-status', 'unauthenticated');
  }
}

function clearSignedOutHash() {
  if (window.location.hash !== '#signed-out') return;
  try {
    window.history.replaceState(null, document.title, `${window.location.pathname}${window.location.search}`);
  } catch {
    // If history is unavailable, the harmless hash can remain in the URL.
  }
}

function restorePublicCatalog() {
  state.authProfile = null;
  state.backendSession = null;
  state.webCheckoutUrl = '';
  state.webCheckoutUnavailable = false;
  state.authCatalogRequestId += 1;
  setSubscriptionState('signed-out');
  restorePublicCatalogDocument();
}

function restorePublicCatalogDocument() {
  if (state.publicCatalog) applyCatalogDocument(state.publicCatalog, 'public');
}

async function loadAuthenticatedCatalog() {
  const requestId = state.authCatalogRequestId + 1;
  state.authCatalogRequestId = requestId;
  state.backendSession = null;
  state.webCheckoutUrl = '';
  state.webCheckoutUnavailable = false;
  setSubscriptionState('signed-in-checking-subscription');
  try {
    const session = await fetchKamuSession();
    if (requestId !== state.authCatalogRequestId || !state.authProfile) return;
    state.backendSession = session;
    if (!sessionHasActiveSubscription(session)) {
      setSubscriptionState('signed-in-inactive');
      restorePublicCatalogDocument();
      loadSubscriptionWebCheckout(requestId);
      return;
    }

    state.webCheckoutUrl = '';
    setSubscriptionState('subscriber-catalog-loading');
    const manifest = await fetchSubscriberCatalog();
    if (requestId !== state.authCatalogRequestId || !state.authProfile) return;
    setSubscriptionState('subscriber-catalog-ready');
    applySubscriberCatalogDocument(manifest);
  } catch (error) {
    if (requestId === state.authCatalogRequestId) {
      setSubscriptionState(state.backendSession?.subscription?.active ? 'subscriber-catalog-failed' : 'subscription-check-failed');
      restorePublicCatalogDocument();
      console.warn('Authenticated catalog unavailable', error);
    }
  }
}

function applySubscriberCatalogDocument(manifest) {
  const merged = mergePublicAndSubscriberCatalog(state.publicCatalog, manifest);
  applyCatalogDocument(merged, 'subscriber');
}

function mergePublicAndSubscriberCatalog(publicCatalog, subscriberCatalog) {
  if (!publicCatalog || !Array.isArray(publicCatalog.stories)) {
    throw new Error('Public catalog must be loaded before subscriber catalog.');
  }
  const publicStories = publicCatalog.stories;
  const publicStoryIds = new Set(publicStories.map((story) => story?.storyId).filter(Boolean));
  const subscriberStories = [];
  for (const story of subscriberCatalog?.stories || []) {
    const storyId = story?.storyId;
    if (!storyId) continue;
    if (publicStoryIds.has(storyId)) continue;
    if (story?.access?.tier !== 'subscriber') continue;
    if (subscriberStories.some((candidate) => candidate.storyId === storyId)) {
      throw new Error(`Subscriber catalog duplicates story ${storyId}.`);
    }
    subscriberStories.push(story);
  }
  const collections = mergeCatalogRecords(publicCatalog.collections, subscriberCatalog?.collections);
  const filters = mergeCatalogRecords(publicCatalog.filters, subscriberCatalog?.filters);
  return {
    ...subscriberCatalog,
    stories: [...publicStories, ...subscriberStories],
    collections,
    filters,
  };
}

function mergeCatalogRecords(publicRecords = [], subscriberRecords = []) {
  const byId = new Map();
  for (const record of [...publicRecords, ...subscriberRecords]) {
    if (!record?.id || byId.has(record.id)) continue;
    byId.set(record.id, record);
  }
  return [...byId.values()];
}

function bindToolbar() {
  for (const button of filterButtons()) {
    button.addEventListener('click', () => {
      state.activeFilter = button.dataset.filter || 'all';
      for (const candidate of filterButtons()) {
        const isActive = candidate === button;
        candidate.classList.toggle('is-active', isActive);
        candidate.setAttribute('aria-pressed', String(isActive));
      }
      updateUiLanguage();
      renderCatalog();
    });
  }
  for (const button of ageFilterButtons()) {
    button.addEventListener('click', () => {
      state.activeAge = button.dataset.ageFilter || 'all';
      for (const candidate of ageFilterButtons()) {
        const isActive = candidate === button;
        candidate.classList.toggle('is-active', isActive);
        candidate.setAttribute('aria-pressed', String(isActive));
      }
      renderCatalog();
    });
  }
}

function filterButtons() {
  return [...document.querySelectorAll('[data-filter]')];
}

function ageFilterButtons() {
  return [...document.querySelectorAll('[data-age-filter]')];
}

function bindSearch() {
  const form = document.querySelector('[data-search-form]');
  const input = document.querySelector('[data-search-input]');
  const button = document.querySelector('[data-search-submit]');
  if (!form || !input) return;

  input.addEventListener('input', () => {
    state.searchQuery = input.value;
    renderCatalog();
  });

  input.addEventListener('search', () => {
    state.searchQuery = input.value;
    renderCatalog();
  });

  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    state.searchQuery = input.value;
    completeSearch();
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    state.searchQuery = input.value;
    completeSearch();
  });

  button?.addEventListener('click', () => {
    state.searchQuery = input.value;
    if (state.searchQuery.trim()) {
      completeSearch();
      return;
    }
    toggleSearchRows();
  });
}

function completeSearch() {
  state.searchExpanded = false;
  updateSearchVisibility();
  renderCatalog();
}

function toggleSearchRows() {
  state.searchExpanded = !state.searchExpanded;
  updateSearchVisibility();
  renderCatalog();
}

function updateSearchVisibility() {
  if (catalogMain) catalogMain.dataset.searchExpanded = String(state.searchExpanded);
  const filterPanel = document.querySelector('[data-filter-panel]');
  if (filterPanel) filterPanel.hidden = !state.searchExpanded;
  if (catalogRoot) catalogRoot.hidden = false;
}

function hydrateFilters() {
  const toolbar = document.querySelector('.catalog-toolbar');
  if (!toolbar) return;
  for (const button of filterButtons()) {
    button.remove();
  }
  state.filters = filtersForStories(state.allFilters || state.filters, storiesForCurrentLanguage());
  if (state.activeFilter !== 'all' && !state.filters.some((filter) => filter.id === state.activeFilter)) {
    state.activeFilter = 'all';
  }
  const buttons = (state.filters || []).map((filter) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `filter-button${filter.id === state.activeFilter ? ' is-active' : ''}`;
    button.dataset.filter = filter.id;
    button.setAttribute('aria-pressed', String(filter.id === state.activeFilter));
    button.textContent = filterLabel(filter.id);
    return button;
  });
  const label = toolbar.querySelector('[data-toolbar-label]');
  if (label) {
    label.after(...buttons);
  } else {
    toolbar.prepend(...buttons);
  }
}

function hydrateAgeFilters() {
  const ageRoot = document.querySelector('[data-age-filters]');
  if (!ageRoot) return;
  ageRoot.replaceChildren(...ageButtonsForStories(storiesForCurrentLanguage()));
}

function ageButtonsForStories(stories) {
  const options = ['all', ...ageOptionsForStories(stories)];
  if (state.activeAge !== 'all' && !options.includes(state.activeAge)) {
    state.activeAge = 'all';
  }
  return options.map((age) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `filter-button age-filter-button${age === state.activeAge ? ' is-active' : ''}`;
    button.dataset.ageFilter = age;
    button.setAttribute('aria-pressed', String(age === state.activeAge));
    button.textContent = ageLabel(age);
    return button;
  });
}

function ageOptionsForStories(stories) {
  return [...new Set((stories || []).map((story) => story.audienceAge).filter(Boolean))]
    .sort(compareAudienceAges);
}

function compareAudienceAges(leftAge, rightAge) {
  const leftNumber = audienceAgeNumber(leftAge);
  const rightNumber = audienceAgeNumber(rightAge);
  if (leftNumber !== rightNumber) return leftNumber - rightNumber;
  return String(leftAge).localeCompare(String(rightAge), currentLanguage());
}

function audienceAgeNumber(age) {
  const match = String(age || '').match(/\d+/);
  return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
}

function ageLabel(age) {
  return age === 'all' ? currentCopy().ageAll : age;
}

async function fetchManifest(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Catalog manifest failed to load: ${response.status}`);
  }
  return response.json();
}

async function fetchSubscriberCatalog() {
  return fetchKamuApiJson(SUBSCRIBER_CATALOG_PATH, 'Subscriber catalog');
}

async function fetchKamuSession() {
  return fetchKamuApiJson(SESSION_PATH, 'Session');
}

async function fetchSubscriptionWebCheckout() {
  return fetchKamuApiJson(SUBSCRIPTION_WEB_CHECKOUT_PATH, 'Subscription checkout');
}

async function loadSubscriptionWebCheckout(requestId) {
  state.webCheckoutUrl = '';
  state.webCheckoutUnavailable = false;
  updateCatalogRuntimeState();
  try {
    const checkout = await fetchSubscriptionWebCheckout();
    if (requestId !== state.authCatalogRequestId || !state.authProfile) return;
    const purchaseUrl = String(checkout?.purchaseUrl || '').trim();
    if (checkout?.billingEngine === 'paddle' && purchaseUrl) {
      state.webCheckoutUrl = purchaseUrl;
      state.webCheckoutUnavailable = false;
      updateCatalogRuntimeState();
      return;
    }
    state.webCheckoutUnavailable = true;
    updateCatalogRuntimeState();
  } catch (error) {
    if (requestId === state.authCatalogRequestId) {
      state.webCheckoutUrl = '';
      state.webCheckoutUnavailable = true;
      updateCatalogRuntimeState();
      console.warn('Subscription checkout unavailable', error);
    }
  }
}

async function fetchKamuApiJson(path, label) {
  const response = await fetch(kamuApiUrl(path), {
    method: 'GET',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'X-TAuth-Tenant': TAUTH_TENANT_ID,
    },
  });
  if (!response.ok) {
    throw new Error(`${label} failed to load: ${response.status}`);
  }
  return response.json();
}

function kamuApiUrl(path) {
  const loginButton = document.querySelector('mpr-login-button[data-config-url]');
  const apiOrigin = loginButton?.getAttribute('data-kamu-api-origin') || '';
  const configUrl = loginButton?.getAttribute('data-config-url') || '';
  try {
    const url = new URL(apiOrigin || configUrl || path, window.location.href);
    url.pathname = path;
    url.search = '';
    url.hash = '';
    return url.href;
  } catch {
    return path;
  }
}

function sessionHasActiveSubscription(session) {
  const subscription = session?.subscription || {};
  const sessionUserId = String(session?.profile?.id || '').trim();
  const expectedAppUserId = sessionUserId ? `tauth:${sessionUserId}` : '';
  return Boolean(subscription.active && expectedAppUserId && session?.revenueCatAppUserId === expectedAppUserId);
}

function setSubscriptionState(nextState) {
  state.subscriptionState = nextState;
  updateCatalogRuntimeState();
}

function updateCatalogRuntimeState() {
  if (!catalogMain) return;
  catalogMain.dataset.catalogSource = state.catalogSource;
  catalogMain.dataset.subscriptionState = state.subscriptionState;
  catalogMain.dataset.catalogStoryCount = String(state.stories.length);
  catalogMain.dataset.webCheckoutReady = state.webCheckoutUrl ? 'true' : 'false';
  catalogMain.dataset.webCheckoutUnavailable = state.webCheckoutUnavailable ? 'true' : 'false';
  updateSubscriptionCheckoutLink();
  updateSettingsModal();
}

function updateSubscriptionCheckoutLink() {
  const link = document.querySelector('[data-subscription-web-checkout]');
  if (!link) return;
  const visible = state.subscriptionState === 'signed-in-inactive' && Boolean(state.webCheckoutUrl);
  link.hidden = !visible;
  link.setAttribute('aria-hidden', String(!visible));
  link.setAttribute('tabindex', visible ? '0' : '-1');
  link.setAttribute('href', visible ? state.webCheckoutUrl : '#');
}

function updateSettingsModal() {
  const copy = currentCopy().settings;
  const languageCode = currentLanguage().toUpperCase();
  setText('[data-settings-title]', copy.title);
  setText('[data-settings-language-indicator]', languageCode);
  setText('[data-settings-language-title]', copy.languageTitle);
  setText('[data-settings-pro-title]', copy.proTitle);
  setText('[data-settings-pro-body]', copy.proBody);
  setText('[data-subscription-web-checkout]', copy.subscribe);
  setAttribute('[data-settings-open]', 'aria-label', copy.open);
  setAttribute('[data-settings-open]', 'title', copy.open);
  setAttribute('[data-settings-close]', 'aria-label', copy.close);
  setAttribute('[data-settings-language-options]', 'aria-label', copy.languageAria);
  for (const option of document.querySelectorAll('[data-settings-language-option]')) {
    const active = option.dataset.settingsLocale === currentLanguage();
    option.classList.toggle('is-active', active);
    if (active) {
      option.setAttribute('aria-current', 'true');
    } else {
      option.removeAttribute('aria-current');
    }
  }

  const status = document.querySelector('[data-settings-subscription-status]');
  if (!status) return;
  if (state.backendSession?.subscription?.active || state.subscriptionState === 'subscriber-catalog-ready') {
    status.textContent = copy.proActive;
    status.dataset.subscriptionStatus = 'active';
    return;
  }
  if (state.subscriptionState === 'signed-in-inactive' && state.webCheckoutUrl) {
    status.textContent = copy.proInactive;
    status.dataset.subscriptionStatus = 'inactive';
    return;
  }
  if (state.subscriptionState === 'signed-in-inactive' && state.webCheckoutUnavailable) {
    status.textContent = copy.proUnavailable;
    status.dataset.subscriptionStatus = 'unavailable';
    return;
  }
  if (state.subscriptionState === 'subscription-check-failed') {
    status.textContent = copy.proUnavailable;
    status.dataset.subscriptionStatus = 'unavailable';
    return;
  }
  status.textContent = copy.proLoading;
  status.dataset.subscriptionStatus = 'loading';
}

function updateStats(stats) {
  setStat('total', stats.total);
  setStat('clean', stats.ready ?? stats.clean ?? stats.total);
  setStat('audio', stats.audio);
  setStat('visual', stats.visual);
}

function setStat(name, value) {
  for (const element of document.querySelectorAll(`[data-stat="${name}"]`)) {
    element.textContent = String(value ?? 0);
  }
}

function renderCatalog() {
  if (!catalogRoot) return;
  updateUiLanguage();
  updateSearchVisibility();
  const visibleStories = storiesForCurrentLanguage();
  const stories = visibleStories.filter(matchesActiveFilter).filter(matchesActiveAge).filter(matchesSearchQuery);
  catalogRoot.replaceChildren(...catalogNodesForStories(stories));
  if (emptyState) emptyState.hidden = stories.length > 0;
}

function matchesActiveFilter(story) {
  if (state.activeFilter === 'all') return true;
  return story.collection === state.activeFilter;
}

function matchesActiveAge(story) {
  if (state.activeAge === 'all') return true;
  return story.audienceAge === state.activeAge;
}

function matchesSearchQuery(story) {
  const query = state.searchQuery.trim();
  if (!query) return true;
  const locale = currentLanguage() === 'en' ? 'en-US' : 'ru-RU';
  const haystack = [
    story.title,
    collectionLabel(story.collection),
    story.excerpt,
    story.aboutText,
    story.audienceAge,
    ...(story.characters || []),
  ].join(' ');
  return haystack.toLocaleLowerCase(locale).includes(query.toLocaleLowerCase(locale));
}

function storiesForCurrentLanguage() {
  return state.stories.filter((story) => normalizeUiLocale(story.language) === currentLanguage());
}

function filtersForStories(filters, stories) {
  const collectionIds = new Set((stories || []).map((story) => story.collection).filter(Boolean));
  const baseFilters = Array.isArray(filters) ? filters : [];
  const visibleFilters = baseFilters.filter((filter) => filter.id === 'all' || collectionIds.has(filter.id));
  if (visibleFilters.some((filter) => filter.id === 'all')) return visibleFilters;
  return [{ id: 'all', labels: { ru: 'Все сказки', en: 'All tales' }, uiLanguage: 'ru' }, ...visibleFilters];
}

function statsForStories(stories) {
  const visibleStories = stories || [];
  return {
    total: visibleStories.length,
    ready: visibleStories.length,
    audio: visibleStories.filter((story) => story.media?.audio?.status === 'available').length,
    visual: visibleStories.filter((story) => story.hasStoryboardArt).length,
  };
}

function catalogNodesForStories(stories) {
  if (state.activeFilter !== 'all') {
    return sortedCatalogStories(stories).map((story, index) => createStoryCard(story, index, 2));
  }

  const nodes = [];
  let storyIndex = 0;
  for (const group of collectionGroupsForStories(stories)) {
    nodes.push(createCollectionHeading(group.collection));
    nodes.push(...group.stories.map((story) => createStoryCard(story, storyIndex++)));
  }
  return nodes;
}

function collectionGroupsForStories(stories) {
  const groups = new Map();
  for (const story of stories) {
    const collection = story.collection || 'source_needed';
    if (!groups.has(collection)) groups.set(collection, []);
    groups.get(collection).push(story);
  }

  return [...groups.entries()]
    .sort(([leftCollection], [rightCollection]) => compareCollections(leftCollection, rightCollection))
    .map(([collection, groupStories]) => ({
      collection,
      stories: sortedCatalogStories(groupStories),
    }));
}

function sortedCatalogStories(stories) {
  return stories.slice().sort((left, right) => {
    const mediaDelta = mediaTier(left) - mediaTier(right);
    if (mediaDelta !== 0) return mediaDelta;
    return state.stories.indexOf(left) - state.stories.indexOf(right);
  });
}

function mediaTier(story) {
  if (story.media?.video?.status === 'available') return 0;
  if (story.media?.audio?.status === 'available') return 1;
  return 2;
}

function compareCollections(leftCollection, rightCollection) {
  const leftOrder = collectionRecord(leftCollection).order ?? 999;
  const rightOrder = collectionRecord(rightCollection).order ?? 999;
  if (leftOrder !== rightOrder) return leftOrder - rightOrder;
  return collectionLabel(leftCollection).localeCompare(collectionLabel(rightCollection), currentLanguage());
}

function createCollectionHeading(collection) {
  const heading = document.createElement('section');
  heading.className = 'catalog-culture-heading';
  heading.style.setProperty('--accent', collectionAccent(collection));
  heading.setAttribute('aria-label', collectionLabel(collection));

  const title = document.createElement('h2');
  const link = document.createElement('a');
  link.href = collectionHref(collectionRecord(collection));
  link.textContent = collectionLabel(collection);
  title.append(link);

  heading.append(title);
  return heading;
}

function createStoryCard(story, storyIndex = CATALOG_EAGER_IMAGE_COUNT, headingLevel = 3) {
  const article = document.createElement('article');
  article.className = 'story-card';
  article.style.setProperty('--accent', collectionAccent(story.collection));

  const coverLink = document.createElement('a');
  coverLink.className = 'cover-link';
  coverLink.href = storyHref(story);
  coverLink.setAttribute('aria-label', currentCopy().openStory(story.title));

  const coverImage = createResponsiveImage(story.coverImage || { src: story.coverPath }, story.title, 'story-cover', {
    loading: storyIndex < CATALOG_EAGER_IMAGE_COUNT ? 'eager' : 'lazy',
    fetchpriority: storyIndex < 4 ? 'high' : undefined,
    coverSource: story.coverSource || story.coverImage?.coverSource,
  });

  coverLink.append(coverImage);

  const body = document.createElement('div');
  body.className = 'story-card-body';

  const kicker = document.createElement('div');
  kicker.className = 'story-kicker';
  kicker.append(createPill(collectionLabel(story.collection)));

  for (const pill of mediaPills(story)) {
    kicker.append(createMediaPill(pill));
  }

  const title = document.createElement(headingLevel === 2 ? 'h2' : 'h3');
  const titleLink = document.createElement('a');
  titleLink.href = storyHref(story);
  titleLink.textContent = story.title;
  title.append(titleLink);

  body.append(kicker, title);

  const storyFacts = [
    formatFact(currentCopy().ageLabel, story.audienceAge),
    formatFact(currentCopy().popularityLabel, displayPopularity(story)),
    formatFact(currentCopy().readTimeLabel, estimatedReadTime(story.wordCount)),
  ].filter(Boolean);

  if (storyFacts.length > 0) {
    const facts = document.createElement('p');
    facts.className = 'story-card-facts';
    facts.textContent = storyFacts.join(' · ');
    body.append(facts);
  }

  const characters = compactCharacterList(story.characters);
  if (characters) {
    const heroes = document.createElement('p');
    heroes.className = 'story-card-heroes';
    heroes.textContent = formatFact(currentCopy().charactersLabel, characters);
    body.append(heroes);
  }

  article.append(coverLink, body);
  return article;
}

function createResponsiveImage(image, alt, className, options = {}) {
  const picture = document.createElement('picture');
  for (const sourceData of responsiveSources(image)) {
    const source = document.createElement('source');
    source.type = sourceData.type;
    source.srcset = sourceData.variants
      .slice()
      .sort((a, b) => a.width - b.width)
      .map((variant) => `${assetHref(variant.src)} ${variant.width}w`)
      .join(', ');
    if (sourceData.sizes) source.sizes = sourceData.sizes;
    picture.append(source);
  }

  const img = document.createElement('img');
  img.className = className;
  img.src = assetHref(image.src);
  img.alt = alt;
  img.decoding = 'async';
  if (image.width) img.width = image.width;
  if (image.height) img.height = image.height;
  if (options.loading) img.loading = options.loading;
  if (options.fetchpriority) img.setAttribute('fetchpriority', options.fetchpriority);
  const coverSource = options.coverSource || image.coverSource;
  if (coverSource) img.dataset.coverSource = coverSource;
  picture.append(img);
  return picture;
}

function responsiveSources(image) {
  if (!Array.isArray(image?.variants) || image.variants.length === 0) return [];
  const variantsByType = new Map();
  for (const variant of image.variants) {
    if (!variant.type || !variant.src || !variant.width) continue;
    const variants = variantsByType.get(variant.type) || [];
    variants.push(variant);
    variantsByType.set(variant.type, variants);
  }
  return [...variantsByType.entries()].map(([type, variants]) => ({
    type,
    variants,
    sizes: image.sizes,
  }));
}

function createPill(label) {
  const pill = document.createElement('span');
  pill.textContent = label;
  return pill;
}

function createMediaPill(pill) {
  if (pill.type !== 'audio') return createPill(pill.label);
  const mediaPill = document.createElement('span');
  mediaPill.className = 'media-pill media-pill-audio';
  mediaPill.setAttribute('role', 'img');
  mediaPill.setAttribute('aria-label', pill.label);
  mediaPill.title = pill.label;
  mediaPill.append(createSpeakerIcon());
  return mediaPill;
}

function createSpeakerIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'speaker-icon');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  const body = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  body.setAttribute('d', 'M4 9v6h4l5 4V5L8 9H4Z');

  const waveInner = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  waveInner.setAttribute('d', 'M16 9.2a4.2 4.2 0 0 1 0 5.6');

  const waveOuter = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  waveOuter.setAttribute('d', 'M18.4 6.8a7.6 7.6 0 0 1 0 10.4');

  svg.append(body, waveInner, waveOuter);
  return svg;
}

function collectionRecord(collectionId) {
  return state.collections.get(collectionId) || { ...DEFAULT_COLLECTION, id: collectionId || DEFAULT_COLLECTION.id };
}

function collectionLabel(collectionId, language = currentLanguage(), short = false) {
  if (collectionId === 'all') return currentCopy().filters.all;
  const collection = collectionRecord(collectionId);
  const labels = short ? collection.shortLabels : collection.labels;
  return labels?.[language] || labels?.ru || labels?.en || collection.id || currentCopy().filters.all;
}

function filterLabel(filterId) {
  if (filterId === 'all') return currentCopy().filters.all;
  const filter = (state.filters || []).find((candidate) => candidate.id === filterId);
  return filter?.labels?.[currentLanguage()] || filter?.labels?.ru || collectionLabel(filterId, currentLanguage(), true);
}

function collectionAccent(collectionId) {
  return collectionRecord(collectionId).accent || DEFAULT_COLLECTION.accent;
}

function mediaPills(story) {
  const pills = [];
  if (story.media?.audio?.status === 'available') pills.push({ type: 'audio', label: currentCopy().audioLabel });
  if (story.media?.video?.status === 'available') pills.push({ type: 'video', label: currentCopy().videoLabel });
  return pills;
}

function displayPopularity(story) {
  if (!story.popularity) return '';
  if (currentLanguage() !== 'ru') return story.popularity;
  return RUSSIAN_POPULARITY_LABELS[story.popularity] || story.popularity;
}

function formatFact(label, value) {
  return value ? `${label}: ${value}` : '';
}

function estimatedReadTime(wordCount) {
  const minutes = Math.max(1, Math.ceil((wordCount || 0) / 150));
  return currentCopy().readTime(minutes);
}

function compactCharacterList(characters = []) {
  const visibleCharacters = characters.slice(0, 2);
  if (visibleCharacters.length === 0) return '';
  const remaining = characters.length - visibleCharacters.length;
  return `${visibleCharacters.join(', ')}${remaining > 0 ? ` +${remaining}` : ''}`;
}

function currentLanguage() {
  return state.uiLocale;
}

function currentCopy() {
  return UI_COPY[currentLanguage()];
}

function updateUiLanguage() {
  const copy = currentCopy();
  document.documentElement.lang = currentLanguage();
  document.body.classList.toggle('catalog-english', currentLanguage() === 'en');
  try {
    window.localStorage?.setItem('kamu:ui-locale', currentLanguage());
  } catch {
    // Storage can be unavailable in private or embedded contexts.
  }

  setText('[data-i18n="hero-eyebrow"]', copy.heroEyebrow);
  setText('[data-i18n="hero-title"]', copy.heroTitle);
  setText('[data-i18n="hero-lede"]', copy.heroLede);
  setText('[data-i18n="stat-clean"]', copy.stats.clean);
  setText('[data-i18n="stat-audio"]', copy.stats.audio);
  setText('[data-i18n="stat-visual"]', copy.stats.visual);
  setText('[data-i18n="hero-card"]', copy.heroCard);
  setText('[data-i18n="footer-manifest"]', copy.footerManifest);
  updateFilterLabels();
  updateAgeFilterLabels();
  setText('[data-empty-state]', copy.empty);
  setAttribute('.hero-stats', 'aria-label', copy.aria.stats);
  setAttribute('.hero-card', 'aria-label', copy.aria.heroCard);
  setAttribute('.hero-mascot', 'alt', copy.kamuName);
  setAttribute('[data-search-form]', 'aria-label', copy.aria.search);
  setAttribute('[data-search-input]', 'aria-label', copy.aria.searchInput);
  setAttribute('[data-search-input]', 'placeholder', copy.searchPlaceholder);
  setAttribute('[data-search-submit]', 'aria-label', copy.searchSubmit);
  setAttribute('[data-search-submit]', 'title', copy.searchSubmit);
  setAttribute('.catalog-toolbar', 'aria-label', copy.aria.toolbar);
  setAttribute('[data-age-toolbar]', 'aria-label', copy.aria.ageFilters);
  setAttribute('[data-toolbar-label]', 'aria-label', copy.toolbarLabel);
  setAttribute('[data-catalog-grid]', 'aria-label', copy.aria.catalog);
  updateSettingsModal();
}

function normalizeUiLocale(value) {
  return value === 'en' ? 'en' : 'ru';
}

function storyHref(story) {
  return localizedRuntimeHref(story.localizedPagePaths?.[currentLanguage()] || story.canonicalPagePath || story.pagePath || '');
}

function collectionHref(collection) {
  return localizedRuntimeHref(collection.localizedPagePaths?.[currentLanguage()] || collection.pagePath || `stories/${String(collection.id || '').replace(/_/g, '-')}/index.html`);
}

function localizedRuntimeHref(webPath) {
  const path = String(webPath || '');
  if (currentLanguage() === 'en' && path.startsWith('en/')) return path.slice(3);
  return path;
}

function assetHref(webPath) {
  const path = String(webPath || '');
  if (!path || /^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(path)) return path;
  return `${state.assetPrefix}${path}`;
}

function assetPrefixFromManifestUrl(url) {
  const path = String(url || '');
  const marker = 'data/fairy-tales.manifest.json';
  if (path.endsWith(marker)) return path.slice(0, -marker.length);
  return '';
}

function updateFilterLabels() {
  for (const button of filterButtons()) {
    button.textContent = filterLabel(button.dataset.filter || 'all');
  }
}

function updateAgeFilterLabels() {
  for (const button of ageFilterButtons()) {
    button.textContent = ageLabel(button.dataset.ageFilter || 'all');
  }
}

function setText(selector, text) {
  const element = document.querySelector(selector);
  if (element) element.textContent = text;
}

function setAttribute(selector, name, value) {
  const element = document.querySelector(selector);
  if (element) element.setAttribute(name, value);
}

function renderError(error) {
  if (!catalogRoot) return;
  state.searchExpanded = false;
  updateSearchVisibility();
  const message = document.createElement('p');
  message.className = 'catalog-loading';
  message.textContent = currentCopy().loadError(error.message);
  catalogRoot.replaceChildren(message);
}

initializeCatalog();
