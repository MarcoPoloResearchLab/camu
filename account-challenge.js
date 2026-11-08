// @ts-check
import { createParentCredentialsClient, PARENT_PASSWORD_LINK_URI } from './parent-credentials.js';
import { parentCredentialsCopy } from './parent-credentials-copy.js';

/** @param {string} fragment */
function challengeToken(fragment) {
  const params = new URLSearchParams(fragment.slice(1));
  const entries = [...params];
  if (entries.length !== 1 || entries[0][0] !== 'token') return '';
  const token = entries[0][1];
  return token && token.length <= 4096 && !/[\u0000-\u0020\u007f]/.test(token) ? token : '';
}

/** Mount only owned local code after the critical inline history cleanup.
 * @param {{fragment:string,query:string,purpose:string,baseUrl:string,tenantId:string}} options */
export function mountAccountChallenge({ fragment, query, purpose, baseUrl, tenantId }) {
  let token = query ? '' : challengeToken(fragment);
  const client = createParentCredentialsClient({ baseUrl, tenantId, fetchImpl: fetch });
  const form = /** @type {HTMLFormElement} */ (document.querySelector('[data-challenge-form]'));
  const confirm = /** @type {HTMLButtonElement|null} */ (document.querySelector('[data-challenge-confirm]'));
  const password = /** @type {HTMLInputElement|null} */ (document.querySelector('[data-challenge-password]'));
  const openApp = /** @type {HTMLAnchorElement|null} */ (document.querySelector('[data-challenge-open-app]'));
  const locale = /** @type {HTMLSelectElement} */ (document.querySelector('[data-challenge-locale]'));
  const status = /** @type {HTMLElement} */ (document.querySelector('[data-challenge-status]'));
  let copy = parentCredentialsCopy(document.documentElement.lang);
  let active = true;
  let complete = false;
  /** @type {AbortController|null} */ let request = null;
  /** @type {string} */ let state = token ? '' : 'error';
  /** @type {string} */ let messageKey = token ? '' : 'invalidChallenge';
  function render() {
    document.querySelector('[data-challenge-title]').textContent = copy[purpose];
    document.title = `${copy[purpose]} · Kamu`;
    locale.setAttribute('aria-label', copy.language);
    document.querySelector('[data-challenge-return]').textContent = copy.returnToStories;
    document.querySelector('[data-challenge-cancel]').textContent = copy.cancel;
    if (password) document.querySelector('[data-challenge-password-label]').textContent = copy.newPassword;
    if (confirm) { confirm.textContent = request ? copy.busy : copy.confirm; confirm.disabled = !active || !token || !!request || complete; }
    if (openApp) {
      openApp.textContent = copy.openApp;
      document.querySelector('[data-challenge-link-hint]').textContent = copy.linkSignIn;
      openApp.hidden = !active || !token;
      if (active && token) openApp.href = `${PARENT_PASSWORD_LINK_URI}#token=${encodeURIComponent(token)}`;
      else openApp.removeAttribute('href');
    }
    status.dataset.state = state;
    status.textContent = messageKey ? copy[messageKey] : '';
  }
  function clear() {
    token = ''; request?.abort(); request = null;
    if (password) password.value = '';
    render();
  }
  function suspend() { active = false; clear(); }
  window.addEventListener('pagehide', suspend, { once: true });
  locale.addEventListener('change', () => {
    copy = parentCredentialsCopy(locale.value);
    document.documentElement.lang = locale.value;
    render();
  });
  document.querySelector('[data-challenge-cancel]').addEventListener('click', () => {
    state = ''; messageKey = ''; clear();
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!active || !token || request || complete || purpose === 'linkPassword') return;
    const controller = new AbortController(); request = controller; state = ''; messageKey = ''; render();
    try {
      if (purpose === 'verifyEmail') await client.verifyEmail({ token }, controller.signal);
      else if (purpose === 'resetPassword') await client.completeReset({ token, password: password.value }, controller.signal);
      else throw new Error('parent_credentials_challenge_purpose_invalid');
      if (!active || controller.signal.aborted) return;
      complete = true; token = ''; state = 'success';
      messageKey = purpose === 'verifyEmail' ? 'verifySuccess' : 'resetSuccess';
    } catch (error) {
      if (!active || controller.signal.aborted) return;
      state = 'error'; messageKey = error.code === 'invalid_challenge' ? 'invalidChallenge' : 'error';
      if (error.code === 'invalid_challenge') token = '';
    } finally {
      if (request === controller) {
        if (password) password.value = '';
        request = null;
        render();
      }
    }
  });
  render();
  return {
    /** A second email opened in this document replaces the prior challenge.
     * @param {{fragment:string,query:string}} incoming */
    receive(incoming) {
      if (!active) return;
      clear();
      token = incoming.query ? '' : challengeToken(incoming.fragment);
      complete = false;
      state = token ? '' : 'error';
      messageKey = token ? '' : 'invalidChallenge';
      render();
    },
  };
}
