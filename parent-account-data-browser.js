// @ts-check
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

/** @param {string} selector @param {string} path @param {string} filename @param {typeof fetchParentAccountData | typeof fetchParentBillingData} fetchData @param {typeof COPY} translations */
function initializeExport(selector, path, filename, fetchData, translations) {
  const copy = translations[document.documentElement.lang] || translations.en;
  const button = /** @type {HTMLButtonElement | null} */ (document.querySelector(`[data-${selector}]`));
  const status = document.querySelector(`[data-${selector}-status]`);
  let parentId = '';
  /** @type {AbortController | null} */
  let request = null;

  function cancelRequest() {
    request?.abort();
    request = null;
    if (status) status.textContent = '';
  }

  document.addEventListener('mpr-ui:auth:authenticated', (event) => {
    cancelRequest();
    const id = /** @type {CustomEvent} */ (event).detail?.profile?.id;
    parentId = typeof id === 'string' ? id.trim() : '';
    if (button) { button.hidden = !parentId; button.disabled = !parentId; }
  });
  for (const name of ['mpr-ui:auth:unauthenticated', 'mpr-user:logout']) {
    document.addEventListener(name, () => {
      cancelRequest();
      parentId = '';
      if (button) { button.hidden = true; button.disabled = true; }
    });
  }
  window.addEventListener('pagehide', cancelRequest);

  button?.addEventListener('click', async () => {
    if (!parentId || request || button.closest('[data-parent-area]')?.hasAttribute('hidden')) return;
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
