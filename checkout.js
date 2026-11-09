// @ts-check
import { observeAuthProfile, PARENT_AUTH_TARGET } from './mpr-auth-profile.js';

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
const root = /** @type {HTMLElement} */ (document.querySelector('[data-checkout-root]'));
const start = /** @type {HTMLButtonElement} */ (root.querySelector('[data-checkout-start]'));
const recover = document.createElement('button');
recover.type = 'button'; recover.className = 'parent-open'; recover.dataset.checkoutRecover = '';
recover.textContent = 'Start a new checkout'; recover.hidden = true; start.after(recover);
const verify = /** @type {HTMLButtonElement} */ (root.querySelector('[data-checkout-confirm]'));
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

function parentAreaOpen() { return !!root.querySelector('[data-parent-area]:not([hidden])'); }
/** @param {RequestIdentity} identity */
function isCurrent(identity) {
  return active && request === identity && identity.generation === generation && identity.userId === userId;
}
function render() {
  start.disabled = !active || !userId || busy || verified || !!invalidResume || overlayOpen || recoveryAvailable;
  recover.hidden = !recoveryAvailable || !!checkout || verified;
  recover.disabled = !active || !userId || busy;
  verify.hidden = !checkout || verified;
  verify.disabled = !active || !userId || busy;
  account.hidden = !verified;
}
function show(state, message) { status.dataset.state = state; status.textContent = message; }
function resetIdentity(nextUserId) {
  generation++;
  request?.controller.abort(); request = null;
  const closeOverlay = overlayOpen;
  userId = nextUserId; busy = false; verified = false; overlayOpen = false; checkout = null; requestId = ''; recoveryAvailable = false;
  if (closeOverlay) globalThis.Paddle?.Checkout.close();
  show(invalidResume ? 'error' : userId ? 'ready' : 'signed-out', invalidResume
    ? 'This checkout link is invalid.' : userId ? 'Open checkout to continue.' : 'Sign in to continue.');
  render();
}
observeAuthProfile(document.querySelector(PARENT_AUTH_TARGET), (profile) => {
  const nextUserId = profile?.user_id || '';
  if (nextUserId !== userId) resetIdentity(nextUserId);
});
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
    const failure = await response.json();
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
  if (!active || !userId || !checkout || checkout.revenueCatAppUserId !== `tauth:${userId}`
    || event?.data?.transaction_id !== checkout.transactionId) return;
  if (event.name === 'checkout.completed') void confirmPayment();
  if (event.name === 'checkout.closed') { overlayOpen = false; render(); }
}

async function openCheckout() {
  if (!active || !userId || busy || verified || overlayOpen || invalidResume || recoveryAvailable || !parentAreaOpen()) return;
  const identity = { generation, userId, controller: new AbortController() }; request = identity;
  busy = true; show('loading', 'Preparing checkout.'); render();
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
    const paddle = await loadPaddle();
    if (!isCurrent(identity)) return;
    if (initialized && (initialized.token !== currentCheckout.clientToken || initialized.environment !== currentCheckout.environment)) {
      throw new CheckoutError('Payment checkout configuration changed. Reload this page.');
    }
    if (!initialized) {
      if (currentCheckout.environment === 'sandbox') paddle.Environment.set('sandbox');
      paddle.Initialize({ token: currentCheckout.clientToken, eventCallback: paddleEvent });
      initialized = { token: currentCheckout.clientToken, environment: currentCheckout.environment };
    }
    overlayOpen = true;
    paddle.Checkout.open({ transactionId: currentCheckout.transactionId });
    pageUrl.searchParams.set('_ptxn', currentCheckout.transactionId); window.history.replaceState(null, '', pageUrl.href);
    show('open', 'Complete payment in checkout, then verify your payment.');
  } catch (cause) {
    if (isCurrent(identity)) {
      overlayOpen = false;
      if (checkout) {
        const resumeUrl = new URL(window.location.href); resumeUrl.searchParams.set('_ptxn', checkout.transactionId);
        window.history.replaceState(null, '', resumeUrl.href);
      }
      recoveryAvailable = !checkout && !!requestId && !resumeTransaction
        && cause instanceof CheckoutError && cause.status === 409 && cause.code === 'checkout_creation_pending';
      show(recoveryAvailable ? 'pending' : 'error',
        recoveryAvailable
          ? 'Checkout creation is pending. Select Start a new checkout to begin again.'
          : 'Checkout could not open. Please try again.');
    }
  } finally { if (isCurrent(identity)) { busy = false; request = null; render(); } }
}

async function recoverCheckout() {
  if (!active || !userId || busy || !recoveryAvailable || checkout || !requestId || !parentAreaOpen()) return;
  const identity = { generation, userId, controller: new AbortController() }; request = identity;
  busy = true; show('recovering', 'Preparing a new checkout.'); render();
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
    if (isCurrent(identity)) show('error', 'A new checkout could not start. Please try again.');
  } finally { if (isCurrent(identity)) { busy = false; request = null; render(); } }
}

async function confirmPayment() {
  if (!active || !userId || !checkout || busy || verified || !parentAreaOpen()) return;
  const identity = { generation, userId, controller: new AbortController() }; request = identity;
  busy = true; show('verifying', 'Verifying payment.'); render();
  try {
    const payload = await apiRequest(`${CHECKOUTS_PATH}/${checkout.transactionId}/confirmations`, 'POST', identity, {});
    if (!isCurrent(identity)) return;
    if (payload?.schema !== SUBSCRIPTION_SCHEMA || payload.revenueCatAppUserId !== `tauth:${identity.userId}`
      || payload.subscription?.active !== true || payload.subscription?.entitlementId !== ENTITLEMENT) {
      throw new CheckoutError('Payment verification is pending.');
    }
    verified = true; show('verified', 'Payment verified. Your subscription is active.');
  } catch (cause) {
    if (isCurrent(identity)) show('pending', 'Payment is not verified yet. Select Verify payment to check again.');
  } finally { if (isCurrent(identity)) { busy = false; request = null; render(); } }
}

start.addEventListener('click', () => { void openCheckout(); });
recover.addEventListener('click', () => { void recoverCheckout(); });
verify.addEventListener('click', () => { void confirmPayment(); });
if (invalidResume) show('error', 'This checkout link is invalid.');
render();
