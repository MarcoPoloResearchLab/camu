// @ts-check
import { observeAuthProfile, PARENT_AUTH_TARGET } from './mpr-auth-profile.js';
import { createParentCredentialsClient } from './parent-credentials.js';
import { parentCredentialsCopy } from './parent-credentials-copy.js';

const mountedRoots = new WeakSet();

/** This module is imported only by the explicit parent-area action, before
 * identity assets start, so it receives the existing public session events. */
export function initializeParentCredentials() {
  for (const root of document.querySelectorAll('[data-parent-credentials]')) {
    if (mountedRoots.has(root)) continue;
    mount(/** @type {HTMLElement} */ (root));
    mountedRoots.add(root);
  }
}

/** @param {HTMLElement} root */
function mount(root) {
  const copy = parentCredentialsCopy(document.documentElement.lang);
  const client = createParentCredentialsClient({ baseUrl: root.dataset.tauthUrl, tenantId: root.dataset.tauthTenant, fetchImpl: fetch });
  /** @type {null|import('./mpr-auth-profile.js').AuthProfile} */ let profile = null;
  /** @type {AbortController|null} */ let request = null;
  let active = true;
  const title = document.createElement('h2'); title.textContent = copy.title; root.append(title);
  const form = document.createElement('form'); root.append(form);
  const fields = document.createElement('fieldset'); form.append(fields);
  /** @param {string} key @param {string} label @param {string} type @param {string} autocomplete */
  function input(key, label, type, autocomplete) {
    const wrapper = document.createElement('label'); wrapper.textContent = label;
    const field = document.createElement('input');
    field.type = type; field.setAttribute('autocomplete', autocomplete); field.setAttribute(`data-credential-${key}`, '');
    wrapper.append(field); fields.append(wrapper);
    return { field, wrapper };
  }
  const email = input('email', copy.email, 'email', 'email');
  const password = input('password', copy.password, 'password', 'current-password');
  const name = input('name', copy.displayName, 'text', 'name');
  const currentPassword = input('current-password', copy.currentPassword, 'password', 'current-password');
  const newPassword = input('new-password', copy.newPassword, 'password', 'new-password');
  /** @type {Map<string,HTMLButtonElement>} */ const buttons = new Map();
  for (const action of ['login', 'signup', 'reset', 'link', 'change', 'cancel']) {
    const button = document.createElement('button'); button.type = 'button';
    button.className = 'parent-open';
    button.textContent = copy[action]; button.dataset.credentialAction = action;
    button.addEventListener('click', () => { if (action === 'cancel') cancel(); else void run(action); });
    (action === 'cancel' ? form : fields).append(button); buttons.set(action, button);
  }
  const status = document.createElement('p'); status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite'); status.dataset.credentialStatus = ''; root.append(status);
  function clearSecrets() {
    password.field.value = ''; currentPassword.field.value = ''; newPassword.field.value = '';
  }
  function render() {
    fields.disabled = !!request || !active;
    buttons.get('cancel').disabled = !active;
    for (const action of ['login', 'signup', 'reset']) buttons.get(action).hidden = !!profile;
    for (const action of ['link', 'change']) buttons.get(action).hidden = !profile;
    currentPassword.wrapper.hidden = !profile; newPassword.wrapper.hidden = !profile;
  }
  function cancel() {
    request?.abort(); request = null; clearSecrets(); status.textContent = ''; status.dataset.state = ''; render();
  }
  observeAuthProfile(document.querySelector(PARENT_AUTH_TARGET), (candidate) => {
    cancel(); profile = candidate;
    email.field.value = profile?.user_email || ''; name.field.value = profile?.display || ''; render();
  });
  window.addEventListener('pagehide', () => { active = false; cancel(); profile = null; });
  window.addEventListener('pageshow', (event) => { if (event.persisted) { active = true; render(); } });
  form.addEventListener('submit', (event) => { event.preventDefault(); void run(profile ? 'link' : 'login'); });
  /** @param {string} action */
  async function run(action) {
    if (!active || request || root.closest('[data-parent-area]')?.hasAttribute('hidden')) return;
    if (['link', 'change'].includes(action) && !profile) return;
    if (['login', 'signup', 'reset'].includes(action) && profile) return;
    const controller = new AbortController(); request = controller;
    const identity = profile?.user_id;
    status.textContent = copy.busy; status.dataset.state = 'busy'; render();
    try {
      const credentials = { email: email.field.value, password: password.field.value, displayName: name.field.value };
      if (action === 'login') await client.login(credentials, controller.signal);
      else if (action === 'signup') await client.signup(credentials, controller.signal);
      else if (action === 'reset') await client.startReset({ email: credentials.email }, controller.signal);
      else if (action === 'link') await client.startLink({ ...credentials, userId: identity }, controller.signal);
      else if (action === 'change') await client.changePassword({ currentPassword: currentPassword.field.value, newPassword: newPassword.field.value, userId: identity }, controller.signal);
      else throw new Error('parent_credentials_action_invalid');
      if (!active || controller.signal.aborted || request !== controller || profile?.user_id !== identity) return;
      if (action === 'login') {
        // The provider has installed its HttpOnly session cookies. A fresh
        // document lets the existing identity component read that session;
        // opening its controls still requires the explicit parent action.
        window.location.reload();
        return;
      }
      status.dataset.state = action === 'change' ? 'success' : action === 'reset' ? 'reset-accepted' : 'accepted';
      status.textContent = action === 'change' ? copy.changeSuccess : action === 'reset' ? copy.pendingEmail : action === 'signup' ? copy.signupAccepted : copy.linkAccepted;
    } catch {
      if (active && request === controller && !controller.signal.aborted) { status.dataset.state = 'error'; status.textContent = copy.error; }
    } finally {
      if (request === controller) { clearSecrets(); request = null; render(); }
    }
  }
  render();
}
