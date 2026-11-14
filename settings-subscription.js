// @ts-check
import { AUTHENTICATED, observeAuthProfile, PARENT_AUTH_TARGET } from './mpr-auth-profile.js';
import { SUBSCRIPTION_VERIFIED_EVENT } from './checkout.js';

const SESSION_PATH = '/api/me';
const WEB_CHECKOUT_PATH = '/api/subscription/web-checkout';
/** @typedef {{profile:import('./mpr-auth-profile.js').AuthProfile|null,phase:'signed-out'|'loading'|'inactive'|'active'|'unavailable',session:object|null,checkoutUrl:string}} SubscriptionSnapshot */
const listeners = new Set();
/** @type {SubscriptionSnapshot} */
let state = { profile: null, phase: 'signed-out', session: null, checkoutUrl: '' };
const root = document.querySelector('[data-settings-modal]');
let request = null;
let generation = 0;
let active = true;

/** @param {(snapshot:typeof state)=>void} receive */
export function observeSettingsSubscription(receive) {
  listeners.add(receive);
  receive(state);
  return () => listeners.delete(receive);
}

function publish(next) {
  state = Object.freeze(next);
  render();
  for (const receive of listeners) receive(state);
}

async function readResource(path, signal) {
  const response = await fetch(new URL(path, root.dataset.kamuApiOrigin), {
    credentials: 'include', signal,
    headers: { Accept: 'application/json', 'X-TAuth-Tenant': root.dataset.tauthTenant },
  });
  if (!response.ok) throw new Error(`Read subscription metadata ${path}: HTTP ${response.status}`);
  return response.json();
}

async function refresh() {
  const ticket = ++generation;
  request?.abort();
  request = null;
  if (!active || !state.profile) return;
  const profile = state.profile;
  const controller = new AbortController();
  request = controller;
  const current = () => active && ticket === generation;
  publish({ profile, phase: 'loading', session: null, checkoutUrl: '' });
  let session = null;
  try {
    const response = await readResource(SESSION_PATH, controller.signal);
    if (!current()) return;
    if (response?.profile?.id !== profile.user_id || typeof response?.subscription?.active !== 'boolean'
      || (response.subscription.active && response.revenueCatAppUserId !== `tauth:${profile.user_id}`)) {
      throw new Error('Subscription metadata does not match the authenticated account.');
    }
    session = response;
    if (session.subscription.active) {
      publish({ profile, phase: 'active', session, checkoutUrl: '' });
      return;
    }
    const checkout = await readResource(WEB_CHECKOUT_PATH, controller.signal);
    if (!current()) return;
    if (checkout?.billingEngine !== 'paddle' || typeof checkout.purchaseUrl !== 'string' || !checkout.purchaseUrl.trim()) {
      throw new Error('Subscription checkout metadata is invalid.');
    }
    publish({ profile, phase: 'inactive', session, checkoutUrl: checkout.purchaseUrl });
  } catch (error) {
    if (current()) publish({ profile, phase: 'unavailable', session, checkoutUrl: '' });
  } finally {
    if (request === controller) request = null;
  }
}

function render() {
  if (!root) return;
  const subscribe = root.querySelector('[data-subscription-web-checkout]');
  const manage = root.querySelector('[data-subscription-management]');
  const status = root.querySelector('[data-settings-subscription-status]');
  subscribe.hidden = !['signed-out', 'inactive'].includes(state.phase);
  subscribe.setAttribute('aria-hidden', String(subscribe.hidden));
  subscribe.tabIndex = subscribe.hidden ? -1 : 0;
  let managementUrl = '';
  if (state.phase === 'active' && state.session.subscription.managementUrl) {
    try {
      const url = new URL(state.session.subscription.managementUrl);
      if (url.protocol === 'https:') managementUrl = url.href;
    } catch { managementUrl = ''; }
  }
  manage.hidden = !managementUrl;
  manage.setAttribute('aria-hidden', String(manage.hidden));
  manage.tabIndex = manage.hidden ? -1 : 0;
  manage.dataset.parentUrl = managementUrl;
  manage.removeAttribute('href');
  status.hidden = state.phase === 'signed-out';
  status.dataset.subscriptionStatus = state.phase;
  status.textContent = status.hidden ? '' : status.dataset[`status${state.phase[0].toUpperCase()}${state.phase.slice(1)}`];
}

if (root) {
  render();
  const authHost = document.querySelector(PARENT_AUTH_TARGET);
  // Refresh an unchanged account before the profile observer deduplicates it.
  // New identities are handled by the observer below.
  authHost.addEventListener(AUTHENTICATED, event => {
    if (state.profile && event.detail?.profile?.user_id === state.profile.user_id) void refresh();
  });
  observeAuthProfile(authHost, profile => {
    if (profile?.user_id === state.profile?.user_id) return;
    generation++;
    request?.abort(); request = null;
    publish({ profile, phase: profile ? 'loading' : 'signed-out', session: null, checkoutUrl: '' });
    if (profile) void refresh();
  });
  document.addEventListener(SUBSCRIPTION_VERIFIED_EVENT, event => {
    if (event.detail.userId === state.profile?.user_id) void refresh();
  });
  window.addEventListener('pagehide', () => { active = false; generation++; request?.abort(); });
  window.addEventListener('pageshow', event => { if (event.persisted) active = true; });
}
