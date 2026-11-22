// @ts-check
import { ACCOUNT_SETTINGS_PATH, ACCOUNT_UPDATED_EVENT, ACCOUNT_CHALLENGE_EVENT, SETTINGS_COPY, fetchAccountSettings, credentialAction } from './account-settings.js';
import { observeAuthProfile, PARENT_AUTH_TARGET } from './mpr-auth-profile.js';
import { fetchParentAccountData, PARENT_ACCOUNT_DATA_FILENAME, PARENT_ACCOUNT_DATA_PATH } from './parent-account-data.js';
import { fetchParentBillingData, PARENT_BILLING_DATA_FILENAME, PARENT_BILLING_DATA_PATH } from './parent-billing-data.js';

const COPY = Object.freeze({
  en: { busy: 'Loading account information…', error: 'Account information could not be loaded. Try again.', done: 'Account information download started.' },
  ru: { busy: 'Загружаем сведения об аккаунте…', error: 'Не удалось загрузить сведения об аккаунте. Попробуйте снова.', done: 'Загрузка файла со сведениями об аккаунте началась.' },
  bg: { busy: 'Зареждане на сведенията за акаунта…', error: 'Сведенията за акаунта не се заредиха. Опитайте отново.', done: 'Изтеглянето на сведенията за акаунта започна.' },
});
const BILLING_COPY = Object.freeze({
  en: { busy: 'Loading billing records…', error: 'Billing records could not be loaded. Try again or contact support.', done: 'Billing records download started.' },
  ru: { busy: 'Загружаем платёжные данные…', error: 'Не удалось загрузить платёжные данные. Попробуйте снова или обратитесь в поддержку.', done: 'Загрузка файла с платёжными данными началась.' },
  bg: { busy: 'Зареждане на платежните данни…', error: 'Платежните данни не се заредиха. Опитайте отново или се свържете с поддръжката.', done: 'Изтеглянето на платежните данни започна.' },
});

initializeExport('parent-account-data', PARENT_ACCOUNT_DATA_PATH, PARENT_ACCOUNT_DATA_FILENAME, fetchParentAccountData, COPY);
initializeExport('parent-billing-data', PARENT_BILLING_DATA_PATH, PARENT_BILLING_DATA_FILENAME, fetchParentBillingData, BILLING_COPY);

initializeAccountSettings();

function initializeAccountSettings() {
  const host = document.querySelector(PARENT_AUTH_TARGET);
  const tools = /** @type {HTMLElement} */ (document.querySelector('[data-account-tools]'));
  if (!tools) return;
  const area = tools.closest('[data-parent-area]');
  const modal = tools.closest('[data-settings-modal]');
  const status = tools.querySelector('[data-settings-capabilities-status]');
  const profileText = host.querySelector('[data-settings-profile]');
  const linkPending = tools.querySelector('[data-settings-link-pending]');
  const copy = SETTINGS_COPY[document.documentElement.lang] || SETTINGS_COPY.en;
  let profile = null;
  let currentSettings = null;
  let request = null;
  let generation = 0;
  let active = true;
  let wasOpen = isOpen();
  function isOpen() { return active && !area.hasAttribute('hidden') && (!modal || modal.getAttribute('aria-hidden') === 'false'); }
  function render(settings, loading = false) {
    currentSettings = settings;
    const action = credentialAction(settings, false);
    if (action !== 'link') linkPending.hidden = true;
    for (const panel of tools.querySelectorAll('[data-settings-credential]')) {
      panel.hidden = panel.dataset.settingsCredential !== action;
      if (panel.hidden) panel.removeAttribute('open');
    }
    tools.querySelector('[data-settings-billing]').hidden = settings?.billing !== 'records';
    tools.dataset.settingsState = loading ? 'loading' : 'ready';
    status.textContent = profile && loading ? copy.loading : '';
  }
  function cancel() { generation++; request?.abort(); request = null; }
  async function load() {
    cancel();
    if (!profile || !isOpen()) return;
    const ticket = generation;
    const controller = new AbortController(); request = controller;
    render(currentSettings, true);
    try {
      const settings = await fetchAccountSettings(new URL(ACCOUNT_SETTINGS_PATH, tools.dataset.kamuApiOrigin || window.location.origin).href, {
        fetchImpl: fetch, tenantId: tools.dataset.tauthTenant, userId: profile.user_id, signal: controller.signal,
      });
      if (ticket === generation && isOpen()) render(settings);
    } catch {
      if (ticket === generation && isOpen()) render(null);
    } finally { if (request === controller) request = null; }
  }
  observeAuthProfile(host, next => {
    const changed = profile?.user_id !== next?.user_id;
    profile = next;
    tools.hidden = !profile;
    profileText.hidden = !profile;
    const email = profile?.user_email.trim() || '';
    const display = profile?.display.trim() || '';
    const name = display.toLowerCase() === email.toLowerCase() ? '' : display;
    for (const [selector, value] of [['[data-settings-profile-name]', name], ['[data-settings-profile-email]', email]]) {
      const field = profileText.querySelector(selector);
      field.textContent = value;
      field.title = value;
      field.hidden = !value;
    }
    for (const button of document.querySelectorAll('[data-parent-open]')) button.hidden = !!profile;
    for (const button of document.querySelectorAll('[data-account-connect]')) button.hidden = !!profile || !area.hasAttribute('hidden');
    if (changed || !profile) { cancel(); render(null); tools.querySelector('[data-settings-privacy]').removeAttribute('open'); void load(); }
  });
  const observer = new MutationObserver(() => {
    const open = isOpen();
    if (open === wasOpen) return;
    wasOpen = open;
    if (open) void load(); else { cancel(); render(null); }
  });
  observer.observe(area, { attributes: true, attributeFilter: ['hidden'] });
  if (modal) observer.observe(modal, { attributes: true, attributeFilter: ['aria-hidden'] });
  document.addEventListener(ACCOUNT_UPDATED_EVENT, () => { void load(); });
  document.addEventListener(ACCOUNT_CHALLENGE_EVENT, event => {
    if (event.composedPath().includes(host) && event.detail?.action === 'password-link-start' && profile) linkPending.hidden = false;
  });
  window.addEventListener('focus', () => { void load(); });
  window.addEventListener('online', () => { void load(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void load(); });
  window.addEventListener('pagehide', () => { active = false; cancel(); render(null); });
}

/** @param {string} selector @param {string} path @param {string} filename @param {typeof fetchParentAccountData | typeof fetchParentBillingData} fetchData @param {typeof COPY} translations */
function initializeExport(selector, path, filename, fetchData, translations) {
  const copy = translations[document.documentElement.lang] || translations.en;
  const button = /** @type {HTMLButtonElement | null} */ (document.querySelector(`[data-${selector}]`));
  const status = document.querySelector(`[data-${selector}-status]`);
  if (!button) return;
  let parentId = '';
  /** @type {AbortController | null} */
  let request = null;

  function cancelRequest() {
    request?.abort();
    request = null;
    if (status) status.textContent = '';
    button.disabled = !parentId;
  }

  observeAuthProfile(document.querySelector(PARENT_AUTH_TARGET), (profile) => {
    const nextParentId = profile?.user_id || '';
    if (nextParentId === parentId) return;
    cancelRequest();
    parentId = nextParentId;
    button.hidden = !parentId; button.disabled = !parentId;
  });
  window.addEventListener('pagehide', cancelRequest);
  const area = button.closest('[data-parent-area]');
  const modal = button.closest('[data-settings-modal]');
  const privacy = button.closest('[data-settings-privacy]');
  function accessible() { return !!parentId && !area?.hasAttribute('hidden')
    && (!modal || modal.getAttribute('aria-hidden') === 'false') && (!privacy || privacy.hasAttribute('open')); }
  const observer = new MutationObserver(() => { if (!accessible()) cancelRequest(); });
  if (area) observer.observe(area, { attributes: true, attributeFilter: ['hidden'] });
  if (modal) observer.observe(modal, { attributes: true, attributeFilter: ['aria-hidden'] });
  if (privacy) observer.observe(privacy, { attributes: true, attributeFilter: ['open'] });

  button?.addEventListener('click', async () => {
    if (!accessible() || request) return;
    const controller = new AbortController();
    request = controller;
    button.disabled = true;
    status.textContent = copy.busy;
    try {
      const data = await fetchData(new URL(path, button.dataset.kamuApiOrigin || window.location.origin).href, {
        fetchImpl: fetch, tenantId: button.dataset.tauthTenant, userId: parentId, signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.append(link);
      try { link.click(); } finally { link.remove(); URL.revokeObjectURL(url); }
      status.textContent = copy.done;
    } catch (cause) {
      if (!controller.signal.aborted) status.textContent = copy.error;
    } finally {
      if (request === controller) { request = null; button.disabled = !parentId; }
    }
  });

}
