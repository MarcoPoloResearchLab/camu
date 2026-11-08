// @ts-check

/** @typedef {{user_id:string,display:string,user_email:string}} AuthProfile */
export const PARENT_AUTH_TARGET = 'mpr-login-button[data-config-url]';
const AUTHENTICATED = 'mpr-ui:auth:authenticated';
const SIGNED_OUT = 'mpr-ui:auth:unauthenticated';
const USER_LOGOUT = 'mpr-user:logout';
const ORCHESTRATION_READY = 'mpr-ui:orchestration:ready';

/** Mirror only the public profile of the explicitly selected shared auth host.
 * @param {Element} target
 * @param {(profile:AuthProfile|null)=>void} receive
 */
export function observeAuthProfile(target, receive) {
  if (!(target instanceof Element)) throw new Error('Parent auth target is missing.');
  const controls = target.closest('[data-auth-controls]');
  const userMenu = Array.from(controls?.querySelectorAll('mpr-user[data-config-url]') || [])
    .find((menu) => menu.getAttribute('data-config-url') === target.getAttribute('data-config-url'));
  let generation = 0;
  let active = true;
  let previous = '';
  /** @param {any} candidate */
  function publish(candidate) {
    const profile = typeof candidate?.user_id === 'string' && candidate.user_id.trim()
      ? { user_id: candidate.user_id.trim(), display: typeof candidate.display === 'string' ? candidate.display : '',
        user_email: typeof candidate.user_email === 'string' ? candidate.user_email : '' } : null;
    const key = JSON.stringify(profile);
    if (key === previous) return;
    previous = key; receive(profile);
  }
  /** @param {Event} event */
  function authenticated(event) {
    if (!active || !event.composedPath().includes(target)) return;
    generation++; publish(/** @type {CustomEvent} */ (event).detail?.profile);
  }
  /** @param {Event} event */
  function signedOut(event) {
    if (!active || !(event.composedPath().includes(target) || (userMenu && event.composedPath().includes(userMenu)))) return;
    generation++; publish(null);
  }
  async function mirror() {
    const sdk = globalThis.MPRUI;
    if (!active || typeof sdk?.whenAutoOrchestrationReady !== 'function'
      || typeof sdk?.resolveAuthProfileSnapshot !== 'function') return;
    const ticket = ++generation;
    try {
      await sdk.whenAutoOrchestrationReady();
      if (!active || ticket !== generation) return;
      const snapshot = await sdk.resolveAuthProfileSnapshot(target);
      if (!active || ticket !== generation) return;
      publish(snapshot.status === 'authenticated' ? snapshot.profile : null);
    } catch {
      if (!active || ticket !== generation) return;
      publish(null);
      target.dispatchEvent(new CustomEvent('kamu:auth-profile:error', {
        bubbles: true, detail: { code: 'shared_profile_unavailable' },
      }));
    }
  }
  target.addEventListener(AUTHENTICATED, authenticated);
  target.addEventListener(SIGNED_OUT, signedOut);
  userMenu?.addEventListener(USER_LOGOUT, signedOut);
  document.addEventListener(ORCHESTRATION_READY, () => { void mirror(); });
  window.addEventListener('pagehide', () => { active = false; generation++; publish(null); });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) { active = true; void mirror(); }
  });
  void mirror();
}
