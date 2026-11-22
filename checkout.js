// @ts-check
import { observeAuthProfile, PARENT_AUTH_TARGET } from './mpr-auth-profile.js';
export const SUBSCRIPTION_VERIFIED_EVENT = 'kamu:subscription:verified';

/** @typedef {{transactionId:string,purchaseUrl:string,clientToken:string,environment:'production'|'sandbox',revenueCatAppUserId:string}} Checkout */
/** @typedef {{generation:number,userId:string,controller:AbortController}} RequestIdentity */
const CHECKOUTS_PATH = '/api/subscription/checkouts';
const CHECKOUT_RECOVERIES_PATH = '/api/subscription/checkout-recoveries';
const CHECKOUT_SCHEMA = 'kamu.subscription-checkout.v1';
const RECOVERY_SCHEMA = 'kamu.checkout-recovery.v1';
const SUBSCRIPTION_SCHEMA = 'kamu.subscription.v1';
const ENTITLEMENT = 'Kamu Tales Pro';
const PADDLE_SCRIPT_URL = 'https://cdn.paddle.com/paddle/v2/paddle.js';
const TRANSACTION_ID = /^txn_[a-z0-9]+$/;
const CHECKOUT_COPY = {
  en: {
    startAgain: 'Start a new checkout', verify: 'Verify payment',
    invalidLink: 'This checkout link is invalid.', signIn: 'Sign in to continue.',
    ready: 'Open checkout to continue.', preparing: 'Preparing checkout.',
    opened: 'Complete payment in checkout, then verify your payment.',
    createFailed: 'Checkout could not start. Try again.', unavailable: 'Web checkout is temporarily unavailable. Try again later.',
    sessionExpired: 'Your session expired. Sign in again to subscribe.',
    windowLoadFailed: 'The payment window could not load. Try again or use another browser.',
    windowOpenFailed: 'The payment window could not open. Try again.',
    creationPending: 'Checkout creation is pending. Select Start a new checkout to begin again.',
    preparingAgain: 'Preparing a new checkout.', recoveryFailed: 'A new checkout could not start. Please try again.',
    verifying: 'Verifying payment.', verified: 'Payment verified. Your subscription is active.',
    verificationPending: 'Payment is not verified yet. Select Verify payment to check again.',
  },
  ru: {
    startAgain: 'Начать оформление заново', verify: 'Проверить оплату',
    invalidLink: 'Ссылка на оплату недействительна.', signIn: 'Войдите, чтобы продолжить.',
    ready: 'Откройте окно оплаты, чтобы продолжить.', preparing: 'Готовим окно оплаты.',
    opened: 'Завершите оплату в открывшемся окне, затем проверьте её.',
    createFailed: 'Не удалось начать оформление. Попробуйте ещё раз.', unavailable: 'Оплата на сайте временно недоступна. Попробуйте позже.',
    sessionExpired: 'Срок действия сеанса истёк. Войдите снова, чтобы оформить подписку.',
    windowLoadFailed: 'Не удалось загрузить окно оплаты. Попробуйте ещё раз или откройте сайт в другом браузере.',
    windowOpenFailed: 'Не удалось открыть окно оплаты. Попробуйте ещё раз.',
    creationPending: 'Оформление ещё не завершено. Выберите «Начать оформление заново».',
    preparingAgain: 'Готовим новое окно оплаты.', recoveryFailed: 'Не удалось начать оформление заново. Попробуйте ещё раз.',
    verifying: 'Проверяем оплату.', verified: 'Оплата подтверждена. Подписка активна.',
    verificationPending: 'Оплата пока не подтверждена. Выберите «Проверить оплату».',
  },
  bg: {
    startAgain: 'Започване на ново плащане', verify: 'Проверка на плащането',
    invalidLink: 'Връзката за плащане е невалидна.', signIn: 'Влезте в профила си, за да продължите.',
    ready: 'Отворете прозореца за плащане, за да продължите.', preparing: 'Подготвяме плащането.',
    opened: 'Завършете плащането в прозореца, след което го проверете.',
    createFailed: 'Плащането не можа да започне. Опитайте отново.', unavailable: 'Плащането през сайта временно е недостъпно. Опитайте по-късно.',
    sessionExpired: 'Сесията ви изтече. Влезте отново, за да се абонирате.',
    windowLoadFailed: 'Прозорецът за плащане не се зареди. Опитайте отново или отворете сайта в друг браузър.',
    windowOpenFailed: 'Прозорецът за плащане не се отвори. Опитайте отново.',
    creationPending: 'Подготовката на плащането още не е завършила. Изберете „Започване на ново плащане“.',
    preparingAgain: 'Подготвяме ново плащане.', recoveryFailed: 'Новото плащане не можа да започне. Опитайте отново.',
    verifying: 'Проверяваме плащането.', verified: 'Плащането е потвърдено. Абонаментът ви е активен.',
    verificationPending: 'Плащането все още не е потвърдено. Изберете „Проверка на плащането“.',
  },
};
const copy = CHECKOUT_COPY[document.documentElement.lang] || CHECKOUT_COPY.en;
const root = /** @type {HTMLElement} */ (document.querySelector('[data-checkout-root]'));
const embedded = root.dataset.checkoutSurface === 'settings';
const start = /** @type {HTMLButtonElement} */ (root.querySelector('[data-checkout-start]'));
const recover = document.createElement('button');
recover.type = 'button'; recover.className = 'parent-open'; recover.dataset.checkoutRecover = '';
recover.textContent = copy.startAgain; recover.hidden = true;
const verify = /** @type {HTMLButtonElement} */ (root.querySelector('[data-checkout-confirm]'));
verify.textContent = copy.verify;
verify.before(recover);
const status = /** @type {HTMLElement} */ (root.querySelector('[data-checkout-status]'));
const account = /** @type {HTMLAnchorElement} */ (root.querySelector('[data-checkout-return]'));
const api = new URL(root.dataset.kamuApiOrigin);
const checkoutOrigin = new URL(root.dataset.checkoutOrigin).origin;
const tenant = root.dataset.tauthTenant;
if (!tenant || api.pathname !== '/' || api.search || api.hash
  || (api.protocol !== 'https:' && !(api.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(api.hostname)))) {
  throw new Error('Checkout API configuration is invalid.');
}
const resumeValues = new URL(window.location.href).searchParams.getAll('_ptxn');
const resumeTransaction = resumeValues[0] || '';
const invalidResume = resumeValues.length > 1 || (resumeValues.length === 1 && !TRANSACTION_ID.test(resumeTransaction));
let generation = 0;
let userId = '';
let active = true;
let busy = false;
let verified = false;
let overlayOpen = false;
let requestId = '';
let recoveryAvailable = false;
/** @type {Checkout|null} */ let checkout = null;
/** @type {RequestIdentity|null} */ let request = null;
/** @type {Promise<any>|null} */ let paddleLoading = null;
/** @type {{token:string,environment:string}|null} */ let initialized = null;

class CheckoutError extends Error {
  constructor(message, status = 0, code = '') { super(message); this.status = status; this.code = code; }
}

function parentAreaOpen() { return !!root.querySelector('[data-parent-area]:not([hidden])')
  && (!embedded || root.getAttribute('aria-hidden') === 'false'); }
/** @param {RequestIdentity} identity */
function isCurrent(identity) {
  return active && request === identity && identity.generation === generation && identity.userId === userId;
}
function render() {
  start.disabled = !active || !userId || busy || verified || !!invalidResume || overlayOpen || recoveryAvailable;
  recover.hidden = !recoveryAvailable || !!checkout || verified;
  recover.disabled = !active || !userId || busy;
  verify.hidden = !checkout || verified || (embedded && overlayOpen && !['pending', 'verifying'].includes(status.dataset.state));
  verify.disabled = !active || !userId || busy;
  account.hidden = embedded || !verified;
}
function show(state, message) {
  status.dataset.state = state; status.textContent = message;
  status.hidden = embedded && ['signed-out', 'ready', 'open', 'verified'].includes(state);
}
function resetIdentity(nextUserId) {
  generation++;
  request?.controller.abort(); request = null;
  const closeOverlay = overlayOpen;
  userId = nextUserId; busy = false; verified = false; overlayOpen = false; checkout = null; requestId = ''; recoveryAvailable = false;
  if (closeOverlay) globalThis.Paddle?.Checkout.close();
  show(invalidResume ? 'error' : userId ? 'ready' : 'signed-out', invalidResume
    ? copy.invalidLink : userId ? copy.ready : copy.signIn);
  render();
}
observeAuthProfile(document.querySelector(PARENT_AUTH_TARGET), (profile) => {
  const nextUserId = profile?.user_id || '';
  if (nextUserId !== userId) resetIdentity(nextUserId);
});
if (embedded) new MutationObserver(() => {
  if (root.getAttribute('aria-hidden') !== 'true') return;
  generation++;
  request?.controller.abort(); request = null; busy = false;
  if (overlayOpen) globalThis.Paddle?.Checkout.close();
  overlayOpen = false; status.hidden = true; render();
}).observe(root, { attributes: true, attributeFilter: ['aria-hidden'] });
window.addEventListener('pagehide', () => { active = false; resetIdentity(''); });
window.addEventListener('pageshow', (event) => {
  if (event.persisted) { active = true; resetIdentity(''); }
});

/** @param {string} path @param {'GET'|'POST'} method @param {RequestIdentity} identity @param {object|null} body */
async function apiRequest(path, method, identity, body = null) {
  const response = await fetch(new URL(path, api).href, {
    method, credentials: 'include', signal: identity.controller.signal,
    headers: { Accept: 'application/json', 'X-TAuth-Tenant': tenant,
      ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
    ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    const failure = await response.json().catch(() => null);
    throw new CheckoutError('Checkout could not be verified.', response.status, typeof failure?.error === 'string' ? failure.error : '');
  }
  if (response.status !== (method === 'POST' && [CHECKOUTS_PATH, CHECKOUT_RECOVERIES_PATH].includes(path) ? 201 : 200)) {
    throw new CheckoutError('Checkout returned an invalid response.');
  }
  return response.json();
}

/** @param {any} payload @param {string} expectedUserId @returns {Checkout} */
function parseCheckout(payload, expectedUserId) {
  if (!payload || payload.schema !== CHECKOUT_SCHEMA || !TRANSACTION_ID.test(payload.transactionId)
    || payload.revenueCatAppUserId !== `tauth:${expectedUserId}`
    || (payload.platform !== undefined && payload.platform !== 'web')
    || !['production', 'sandbox'].includes(payload.environment)
    || typeof payload.clientToken !== 'string'
    || !payload.clientToken.startsWith(payload.environment === 'sandbox' ? 'test_' : 'live_')) {
    throw new CheckoutError('Checkout details do not match this account.');
  }
  const url = new URL(payload.purchaseUrl);
  if (url.protocol !== 'https:' || url.origin !== checkoutOrigin || url.pathname !== '/checkout/'
    || url.username || url.password || url.hash || [...url.searchParams.keys()].length !== 1
    || url.searchParams.get('_ptxn') !== payload.transactionId
    || (resumeTransaction && payload.transactionId !== resumeTransaction)) {
    throw new CheckoutError('Checkout returned an invalid payment link.');
  }
  return Object.freeze({ transactionId: payload.transactionId, purchaseUrl: url.href,
    clientToken: payload.clientToken, environment: payload.environment, revenueCatAppUserId: payload.revenueCatAppUserId });
}

async function loadPaddle() {
  if (!paddleLoading) paddleLoading = new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = PADDLE_SCRIPT_URL;
    const failed = () => { paddleLoading = null; script.remove(); reject(new CheckoutError('Payment checkout could not load.')); };
    script.onload = () => globalThis.Paddle ? resolve(globalThis.Paddle) : failed();
    script.onerror = failed;
    document.head.append(script);
  });
  return paddleLoading;
}

/** @param {any} event */
function paddleEvent(event) {
  if (!active || !userId || !checkout || checkout.revenueCatAppUserId !== `tauth:${userId}`) return;
  const transactionId = event?.data?.transaction_id;
  // Paddle reports some window failures without transaction data.
  if (event?.name === 'checkout.error' && overlayOpen && (!transactionId || transactionId === checkout.transactionId)) {
    overlayOpen = false;
    show('error', copy.windowOpenFailed);
    render();
    return;
  }
  if (transactionId !== checkout.transactionId) return;
  if (event.name === 'checkout.completed') void confirmPayment();
  if (event.name === 'checkout.closed') { overlayOpen = false; render(); }
}

async function openCheckout() {
  if (!active || !userId || busy || verified || overlayOpen || invalidResume || recoveryAvailable || !parentAreaOpen()) return;
  const identity = { generation, userId, controller: new AbortController() }; request = identity;
  busy = true; show('loading', copy.preparing); render();
  let failureMessage = copy.createFailed;
  try {
    if (!checkout) {
      if (!resumeTransaction && !requestId) requestId = crypto.randomUUID();
      const payload = await apiRequest(resumeTransaction ? `${CHECKOUTS_PATH}/${resumeTransaction}` : CHECKOUTS_PATH,
        resumeTransaction ? 'GET' : 'POST', identity, resumeTransaction ? null : { requestId });
      if (!isCurrent(identity)) return;
      checkout = parseCheckout(payload, identity.userId);
    }
    const currentCheckout = checkout;
    // Paddle automatically opens _ptxn URLs. Remove it while loading and
    // initializing the SDK, then keep the verified resume URL after explicit open.
    const pageUrl = new URL(window.location.href); pageUrl.searchParams.delete('_ptxn');
    window.history.replaceState(null, '', pageUrl.href);
    failureMessage = copy.windowLoadFailed;
    const paddle = await loadPaddle();
    if (!isCurrent(identity)) return;
    failureMessage = copy.windowOpenFailed;
    if (initialized && (initialized.token !== currentCheckout.clientToken || initialized.environment !== currentCheckout.environment)) {
      throw new CheckoutError('Payment checkout configuration changed. Reload this page.');
    }
    if (!initialized) {
      if (currentCheckout.environment === 'sandbox') paddle.Environment.set('sandbox');
      paddle.Initialize({ token: currentCheckout.clientToken, eventCallback: paddleEvent });
      initialized = { token: currentCheckout.clientToken, environment: currentCheckout.environment };
    }
    overlayOpen = true;
    show('open', copy.opened);
    paddle.Checkout.open({ transactionId: currentCheckout.transactionId });
    pageUrl.searchParams.set('_ptxn', currentCheckout.transactionId); window.history.replaceState(null, '', pageUrl.href);
  } catch (cause) {
    if (isCurrent(identity)) {
      overlayOpen = false;
      if (checkout) {
        const resumeUrl = new URL(window.location.href); resumeUrl.searchParams.set('_ptxn', checkout.transactionId);
        window.history.replaceState(null, '', resumeUrl.href);
      }
      recoveryAvailable = !checkout && !!requestId && !resumeTransaction
        && cause instanceof CheckoutError && cause.status === 409 && cause.code === 'checkout_creation_pending';
      const httpStatus = cause instanceof CheckoutError ? cause.status : 0;
      if (recoveryAvailable) failureMessage = copy.creationPending;
      else if (httpStatus === 401) failureMessage = copy.sessionExpired;
      else if (httpStatus >= 500) failureMessage = copy.unavailable;
      show(recoveryAvailable ? 'pending' : 'error', failureMessage);
    }
  } finally { if (isCurrent(identity)) { busy = false; request = null; render(); } }
}

async function recoverCheckout() {
  if (!active || !userId || busy || !recoveryAvailable || checkout || !requestId || !parentAreaOpen()) return;
  const identity = { generation, userId, controller: new AbortController() }; request = identity;
  busy = true; show('recovering', copy.preparingAgain); render();
  try {
    const payload = await apiRequest(CHECKOUT_RECOVERIES_PATH, 'POST', identity, { requestId });
    if (!isCurrent(identity)) return;
    if (payload?.schema !== RECOVERY_SCHEMA || payload.recovered !== true) {
      throw new CheckoutError('Checkout recovery returned an invalid response.');
    }
    requestId = ''; recoveryAvailable = false;
    busy = false; request = null; render();
    await openCheckout();
  } catch (cause) {
    if (isCurrent(identity)) show('error', copy.recoveryFailed);
  } finally { if (isCurrent(identity)) { busy = false; request = null; render(); } }
}

async function confirmPayment() {
  if (!active || !userId || !checkout || busy || verified || !parentAreaOpen()) return;
  const identity = { generation, userId, controller: new AbortController() }; request = identity;
  busy = true; show('verifying', copy.verifying); render();
  try {
    const payload = await apiRequest(`${CHECKOUTS_PATH}/${checkout.transactionId}/confirmations`, 'POST', identity, {});
    if (!isCurrent(identity)) return;
    if (payload?.schema !== SUBSCRIPTION_SCHEMA || payload.revenueCatAppUserId !== `tauth:${identity.userId}`
      || payload.subscription?.active !== true || payload.subscription?.entitlementId !== ENTITLEMENT) {
      throw new CheckoutError('Payment verification is pending.');
    }
    verified = true; show('verified', copy.verified);
    document.dispatchEvent(new CustomEvent(SUBSCRIPTION_VERIFIED_EVENT, { detail: { userId: identity.userId } }));
  } catch (cause) {
    if (isCurrent(identity)) show('pending', copy.verificationPending);
  } finally { if (isCurrent(identity)) { busy = false; request = null; render(); } }
}

start.addEventListener('click', () => { void openCheckout(); });
recover.addEventListener('click', () => { void recoverCheckout(); });
verify.addEventListener('click', () => { void confirmPayment(); });
if (invalidResume) show('error', copy.invalidLink);
render();
