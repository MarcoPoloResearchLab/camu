// @ts-check

export const PARENT_PASSWORD_LINK_URI = 'kamu:///account/password-link';

/** @typedef {import('./parent-profile.js').ParentProfile} ParentProfile */
/** @typedef {{email: string, password: string}} PasswordInput */
/** @typedef {PasswordInput & {displayName: string}} SignupInput */
/** @typedef {{token: string}} ChallengeInput */
/** @typedef {{status: 'accepted', accountId: string, expiresUnix: number}} AcceptedChallenge */

const INPUT_INVALID = 'parent_credentials_input_invalid';
const RESPONSE_INVALID = 'parent_credentials_invalid';
const UNAVAILABLE = 'parent_credentials_unavailable';
const ABORTED = 'parent_credentials_aborted';
const MAX_TOKEN_LENGTH = 4096;
const MAX_RESPONSE_LENGTH = 65536;
const SESSION_PROFILE_FIELDS = Object.freeze(['user_id', 'user_email', 'display', 'avatar_url', 'roles']);
const ACCOUNT_PROFILE_FIELDS = Object.freeze([...SESSION_PROFILE_FIELDS, 'state']);
const CHALLENGE_FIELDS = Object.freeze(['status', 'account_id', 'expires_unix']);
const SAFE_PROVIDER_CODES = new Set([
  'invalid_json', 'invalid_email', 'missing_password', 'invalid_credentials', 'user_not_allowed',
  'account_disabled', 'account_not_active', 'invalid_challenge', 'account_exists', 'rate_limited',
  'email_challenge_delivery_failed', 'password_auth_not_configured', 'password_signup_not_configured',
  'account_management_not_configured', 'account_not_found', 'transient_capacity',
]);
const PATHS = Object.freeze({
  login: '/auth/password/login', signup: '/auth/password/signup', verifyEmail: '/auth/password/verify-email',
  startReset: '/auth/password/reset/start', completeReset: '/auth/password/reset/complete',
  startLink: '/auth/account/password/link/start', verifyLink: '/auth/account/password/link/verify',
  changePassword: '/auth/account/password/change',
});

class ParentCredentialsError extends Error {
  /** @param {string} code @param {number} status */
  constructor(code, status) {
    super(code);
    this.name = 'ParentCredentialsError';
    this.code = code;
    this.status = status;
  }
}

/**
 * @param {{baseUrl: string, tenantId: string, fetchImpl: typeof fetch}} configuration
 */
export function createParentCredentialsClient({ baseUrl, tenantId, fetchImpl }) {
  let base;
  try { base = new URL(baseUrl); } catch { throw new ParentCredentialsError(INPUT_INVALID, 0); }
  const localHTTP = base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  if ((!localHTTP && base.protocol !== 'https:') || base.username || base.password || base.search || base.hash
    || base.pathname !== '/' || typeof tenantId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(tenantId)
    || typeof fetchImpl !== 'function') throw new ParentCredentialsError(INPUT_INVALID, 0);
  const origin = base.origin;

  /** @param {string} path @param {Record<string, string>} body @param {number} status
   * @param {AbortSignal|undefined} signal @returns {Promise<Record<string, unknown>>} */
  async function post(path, body, status, signal) {
    let response;
    try {
      response = await fetchImpl(`${origin}${path}`, {
        method: 'POST', credentials: 'include', signal,
        headers: { Accept: 'application/json', 'Content-Type': 'application/json',
          'X-TAuth-Tenant': tenantId, 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify(body),
      });
    } catch {
      throw new ParentCredentialsError(signal?.aborted ? ABORTED : UNAVAILABLE, 0);
    }
    /** @type {unknown} */
    let payload;
    try {
      const text = await response.text();
      if (text.length > MAX_RESPONSE_LENGTH) throw new Error(RESPONSE_INVALID);
      if (response.ok && response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
        throw new Error(RESPONSE_INVALID);
      }
      payload = JSON.parse(text);
    } catch {
      if (signal?.aborted) throw new ParentCredentialsError(ABORTED, 0);
      throw new ParentCredentialsError(response.ok ? RESPONSE_INVALID : UNAVAILABLE, response.status);
    }
    if (!response.ok) {
      const code = isRecord(payload) && typeof payload.error === 'string' && SAFE_PROVIDER_CODES.has(payload.error)
        ? payload.error : UNAVAILABLE;
      throw new ParentCredentialsError(code, response.status);
    }
    if (response.status !== status || !isRecord(payload)) throw new ParentCredentialsError(RESPONSE_INVALID, response.status);
    return payload;
  }

  return Object.freeze({
    /** @param {PasswordInput} input @param {AbortSignal} [signal] @returns {Promise<ParentProfile>} */
    async login(input, signal) {
      return profile(await post(PATHS.login, passwordInput(inputRecord(input)), 200, signal));
    },
    /** @param {SignupInput} input @param {AbortSignal} [signal] @returns {Promise<AcceptedChallenge>} */
    async signup(input, signal) {
      return challenge(await post(PATHS.signup, signupInput(inputRecord(input)), 202, signal));
    },
    /** @param {ChallengeInput} input @param {AbortSignal} [signal] @returns {Promise<ParentProfile>} */
    async verifyEmail(input, signal) {
      const fields = inputRecord(input);
      return profile(await post(PATHS.verifyEmail, { token: tokenInput(fields.token) }, 200, signal));
    },
    /** @param {{email: string}} input @param {AbortSignal} [signal] @returns {Promise<{status: 'accepted'}>} */
    async startReset(input, signal) {
      const fields = inputRecord(input);
      const payload = await post(PATHS.startReset, { email: requiredText(fields.email) }, 202, signal);
      if (!exactFields(payload, ['status']) || payload.status !== 'accepted') throw new ParentCredentialsError(RESPONSE_INVALID, 202);
      return { status: 'accepted' };
    },
    /** @param {ChallengeInput & {password: string}} input @param {AbortSignal} [signal] @returns {Promise<ParentProfile>} */
    async completeReset(input, signal) {
      const fields = inputRecord(input);
      return profile(await post(PATHS.completeReset, { token: tokenInput(fields.token), password: password(fields.password) }, 200, signal));
    },
    /** @param {SignupInput & {userId: string}} input @param {AbortSignal} [signal] @returns {Promise<AcceptedChallenge>} */
    async startLink(input, signal) {
      const fields = inputRecord(input);
      requiredText(fields.userId);
      return challenge(await post(PATHS.startLink, signupInput(fields), 202, signal));
    },
    /** @param {ChallengeInput & {userId: string}} input @param {AbortSignal} [signal] @returns {Promise<ParentProfile>} */
    async verifyLink(input, signal) {
      const fields = inputRecord(input);
      const userId = requiredText(fields.userId);
      return accountProfile(await post(PATHS.verifyLink, { token: tokenInput(fields.token) }, 200, signal), userId);
    },
    /** @param {{currentPassword: string, newPassword: string, userId: string}} input
     * @param {AbortSignal} [signal] @returns {Promise<ParentProfile>} */
    async changePassword(input, signal) {
      const fields = inputRecord(input);
      const userId = requiredText(fields.userId);
      return profile(await post(PATHS.changePassword, {
        current_password: password(fields.currentPassword), new_password: password(fields.newPassword),
      }, 200, signal), userId);
    },
  });
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }

/** @param {unknown} input @returns {Record<string, unknown>} */
function inputRecord(input) {
  if (!isRecord(input)) throw new ParentCredentialsError(INPUT_INVALID, 0);
  return input;
}

/** @param {Record<string, unknown>} value @param {readonly string[]} fields */
function exactFields(value, fields) {
  return Object.keys(value).length === fields.length && fields.every((field) => Object.hasOwn(value, field));
}

/** @param {unknown} value @returns {string} */
function requiredText(value) {
  if (typeof value !== 'string' || !value.trim() || /[\u0000-\u001f\u007f-\u009f]/.test(value)) {
    throw new ParentCredentialsError(INPUT_INVALID, 0);
  }
  return value.trim();
}

/** @param {unknown} value @returns {string} */
function password(value) {
  if (typeof value !== 'string' || value === '') throw new ParentCredentialsError(INPUT_INVALID, 0);
  return value;
}

/** @param {unknown} value @returns {string} */
function tokenInput(value) {
  const token = requiredText(value);
  if (token.length > MAX_TOKEN_LENGTH || token !== value) throw new ParentCredentialsError(INPUT_INVALID, 0);
  return token;
}

/** @param {Record<string, unknown>} input @returns {{email: string, password: string}} */
function passwordInput(input) { return { email: requiredText(input.email), password: password(input.password) }; }

/** @param {Record<string, unknown>} input @returns {Record<string, string>} */
function signupInput(input) {
  if (typeof input.displayName !== 'string') throw new ParentCredentialsError(INPUT_INVALID, 0);
  return { ...passwordInput(input), display_name: input.displayName.trim(), avatar_url: '' };
}

/** @param {Record<string, unknown>} payload @param {string} [userId] @returns {ParentProfile} */
function profile(payload, userId) {
  if (!exactFields(payload, SESSION_PROFILE_FIELDS)) throw new ParentCredentialsError(RESPONSE_INVALID, 200);
  return normalizedProfile(payload, userId);
}

/** @param {Record<string, unknown>} payload @param {string} userId @returns {ParentProfile} */
function accountProfile(payload, userId) {
  if (!exactFields(payload, ACCOUNT_PROFILE_FIELDS) || payload.state !== 'active') throw new ParentCredentialsError(RESPONSE_INVALID, 200);
  return normalizedProfile(payload, userId);
}

/** @param {Record<string, unknown>} payload @param {string} [userId] @returns {ParentProfile} */
function normalizedProfile(payload, userId) {
  if (['user_id', 'user_email', 'display', 'avatar_url'].some((key) => typeof payload[key] !== 'string')
    || !payload.user_id || (userId !== undefined && payload.user_id !== userId)
    || (payload.roles !== null && (!Array.isArray(payload.roles) || payload.roles.some((role) => typeof role !== 'string')))) {
    throw new ParentCredentialsError(RESPONSE_INVALID, 200);
  }
  return { id: /** @type {string} */ (payload.user_id), email: /** @type {string} */ (payload.user_email),
    name: /** @type {string} */ (payload.display), picture: /** @type {string} */ (payload.avatar_url), provider: 'tauth' };
}

/** @param {Record<string, unknown>} payload @returns {AcceptedChallenge} */
function challenge(payload) {
  if (!exactFields(payload, CHALLENGE_FIELDS) || payload.status !== 'accepted'
    || typeof payload.account_id !== 'string' || !payload.account_id
    || !Number.isSafeInteger(payload.expires_unix) || /** @type {number} */ (payload.expires_unix) <= 0) throw new ParentCredentialsError(RESPONSE_INVALID, 202);
  return { status: 'accepted', accountId: payload.account_id, expiresUnix: /** @type {number} */ (payload.expires_unix) };
}
