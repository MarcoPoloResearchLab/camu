// @ts-check
import { createParentCredentialsClient } from './parent-credentials.js';
import { parentCredentialsCopy } from './parent-credentials-copy.js';

const AUTHENTICATED = 'mpr-ui:auth:authenticated';
const SIGNED_OUT = Object.freeze(['mpr-ui:auth:unauthenticated', 'mpr-user:logout']);
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
  /** @type {null|{id:string,name:string,email:string}} */ let profile = null;
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
  /** @param {Event} event */
  function authenticated(event) {
    const candidate = /** @type {CustomEvent} */ (event).detail?.profile;
    cancel();
    // The identity adapter supplies this public event; only a nonempty stable
    // account identifier authorizes authenticated management controls.
    profile = candidate && typeof candidate.id === 'string' && candidate.id.trim()
      ? { id: candidate.id.trim(), name: typeof candidate.name === 'string' ? candidate.name : '', email: typeof candidate.email === 'string' ? candidate.email : '' } : null;
    email.field.value = profile?.email || ''; name.field.value = profile?.name || ''; render();
  }
  function signedOut() { cancel(); profile = null; email.field.value = ''; name.field.value = ''; render(); }
  document.addEventListener(AUTHENTICATED, authenticated);
  for (const event of SIGNED_OUT) document.addEventListener(event, signedOut);
  window.addEventListener('pagehide', () => {
    active = false; cancel(); profile = null;
    document.removeEventListener(AUTHENTICATED, authenticated);
    for (const event of SIGNED_OUT) document.removeEventListener(event, signedOut);
  }, { once: true });
  form.addEventListener('submit', (event) => { event.preventDefault(); void run(profile ? 'link' : 'login'); });
  /** @param {string} action */
  async function run(action) {
    if (!active || request || root.closest('[data-parent-area]')?.hasAttribute('hidden')) return;
    if (['link', 'change'].includes(action) && !profile) return;
    if (['login', 'signup', 'reset'].includes(action) && profile) return;
    const controller = new AbortController(); request = controller;
    const identity = profile?.id;
    status.textContent = copy.busy; status.dataset.state = 'busy'; render();
    try {
      const credentials = { email: email.field.value, password: password.field.value, displayName: name.field.value };
      if (action === 'login') await client.login(credentials, controller.signal);
      else if (action === 'signup') await client.signup(credentials, controller.signal);
      else if (action === 'reset') await client.startReset({ email: credentials.email }, controller.signal);
      else if (action === 'link') await client.startLink({ ...credentials, userId: identity }, controller.signal);
      else if (action === 'change') await client.changePassword({ currentPassword: currentPassword.field.value, newPassword: newPassword.field.value, userId: identity }, controller.signal);
      else throw new Error('parent_credentials_action_invalid');
      if (!active || controller.signal.aborted || request !== controller || profile?.id !== identity) return;
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
