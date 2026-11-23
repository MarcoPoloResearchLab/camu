// @ts-check
import { AUTHENTICATED, observeAuthProfile, PARENT_AUTH_TARGET } from './mpr-auth-profile.js';
import { SUBSCRIPTION_VERIFIED_EVENT } from './checkout.js';
import { EXPERIENCE_COPY, subscriptionPresentation } from './settings-experience.js';

const SESSION_PATH = '/api/me';
const WEB_CHECKOUT_PATH = '/api/subscription/web-checkout';
/** @typedef {{profile:import('./mpr-auth-profile.js').AuthProfile|null,phase:'signed-out'|'loading'|'inactive'|'active'|'unconfirmed'|'unavailable',session:object|null,checkoutUrl:string}} SubscriptionSnapshot */
const listeners = new Set();
/** @type {SubscriptionSnapshot} */
let state = { profile: null, phase: 'signed-out', session: null, checkoutUrl: '' };
const root = document.querySelector('[data-settings-modal]');
let request = null;
let generation = 0;
let active = true;
const copy = EXPERIENCE_COPY[document.documentElement.lang] || EXPERIENCE_COPY.en;

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
  if (state.phase !== 'active') publish({ profile, phase: 'loading', session: null, checkoutUrl: '' });
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
    publish({ profile, phase: 'loading', session, checkoutUrl: '' });
    const checkout = await readResource(WEB_CHECKOUT_PATH, controller.signal);
    if (!current()) return;
    if (checkout?.billingEngine !== 'paddle' || typeof checkout.purchaseUrl !== 'string' || !checkout.purchaseUrl.trim()) {
      throw new Error('Subscription checkout metadata is invalid.');
    }
    publish({ profile, phase: 'inactive', session, checkoutUrl: checkout.purchaseUrl });
  } catch (error) {
    if (current()) publish({ profile, phase: session ? 'unavailable' : 'unconfirmed', session, checkoutUrl: '' });
  } finally {
    if (request === controller) request = null;
  }
}

function render() {
  if (!root) return;
  const subscribe = root.querySelector('[data-subscription-web-checkout]');
  const manage = root.querySelector('[data-subscription-management]');
  const status = root.querySelector('[data-settings-subscription-status]');
  const offer = root.querySelector('[data-settings-subscription-offer]');
  const presentation = subscriptionPresentation({ signedIn: Boolean(state.profile), checking: state.phase === 'loading',
    entitlement: state.session ? state.session.subscription.active ? 'active' : 'inactive' : 'unknown',
    purchaseReady: state.phase === 'inactive', manageReady: Boolean(state.session?.subscription?.managementUrl) });
  subscribe.hidden = !presentation.showSubscribe;
  offer.hidden = !presentation.showSubscribe;
  subscribe.setAttribute('aria-hidden', String(subscribe.hidden));
  subscribe.tabIndex = subscribe.hidden ? -1 : 0;
  let managementUrl = '';
  if (state.phase === 'active' && state.session.subscription.managementUrl) {
    try {
      const url = new URL(state.session.subscription.managementUrl);
      if (url.protocol === 'https:') managementUrl = url.href;
    } catch { managementUrl = ''; }
  }
  manage.hidden = !presentation.showManage || !managementUrl;
  manage.setAttribute('aria-hidden', String(manage.hidden));
  manage.tabIndex = manage.hidden ? -1 : 0;
  manage.dataset.parentUrl = managementUrl;
  manage.removeAttribute('href');
  status.dataset.subscriptionStatus = state.phase;
  status.textContent = { 'signed-out': copy.proSignedOut, loading: copy.proChecking,
    active: copy.proActive, inactive: copy.proInactive, unavailable: copy.proUnavailable, unconfirmed: copy.proCheckFailed }[state.phase];
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
  // Reopening Settings checks access even when the authentication owner keeps
  // the same settled profile and therefore emits no new authentication event.
  let wasOpen = root.getAttribute('aria-hidden') === 'false';
  const settingsObserver = new MutationObserver(() => {
    const open = root.getAttribute('aria-hidden') === 'false';
    if (open && !wasOpen && state.profile) void refresh();
    wasOpen = open;
  });
  const observeSettings = () => settingsObserver.observe(root, { attributes: true, attributeFilter: ['aria-hidden'] });
  observeSettings();
  const refreshOnReturn = () => { if (active && state.profile && document.visibilityState === 'visible') void refresh(); };
  window.addEventListener('online', refreshOnReturn);
  window.addEventListener('focus', refreshOnReturn);
  document.addEventListener('visibilitychange', refreshOnReturn);
  window.addEventListener('pagehide', () => { active = false; generation++; request?.abort(); settingsObserver.disconnect(); });
  window.addEventListener('pageshow', event => { if (event.persisted) { active = true; observeSettings(); } });
}
