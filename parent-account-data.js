// @ts-check
export const PARENT_ACCOUNT_DATA_PATH = '/api/account-data';
export const PARENT_ACCOUNT_DATA_FILENAME = 'kamu-account-data.json';
export const PARENT_ACCOUNT_DATA_SCOPE = 'current-parent-profile-and-entitlement';
const SCHEMA = 'kamu.parent-account-data.v1';
const INVALID = 'account_data_invalid';
const UNAVAILABLE = 'account_data_unavailable';
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

/** @typedef {{id: string, email: string, name: string, picture: string, provider: string}} ParentProfile */
/** @typedef {{appUserId: string, entitlementId: string, active: boolean, checkedAt: string, source: string, productIdentifier?: string, store?: string, managementUrl?: string, expiresAt?: string}} ParentEntitlement */
/** @typedef {{schema: string, scope: string, generatedAt: string, tenantId: string, parentAccount: ParentProfile, subscription: ParentEntitlement}} ParentAccountData */
/** @typedef {{ok: boolean, text: () => Promise<string>}} DataResponse */
/** @typedef {(url: string, options: RequestInit) => Promise<DataResponse>} DataFetch */

/** @param {unknown} value @param {string[]} required @param {string[]} [optional] @returns {Record<string, unknown>} */
function record(value, required, optional = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(INVALID);
  const result = /** @type {Record<string, unknown>} */ (value);
  const allowed = new Set([...required, ...optional]);
  if (required.some((key) => !Object.hasOwn(result, key)) || Object.keys(result).some((key) => !allowed.has(key))) throw new Error(INVALID);
  return result;
}

/** @param {unknown} value */
function timestamp(value) {
  return typeof value === 'string' && UTC_TIMESTAMP.test(value) && Number.isFinite(Date.parse(value));
}

/** @param {unknown} value @param {string} userId @param {string} tenantId @returns {ParentAccountData} */
function accountData(value, userId, tenantId) {
  const data = record(value, ['schema', 'scope', 'generatedAt', 'tenantId', 'parentAccount', 'subscription']);
  if (data.schema !== SCHEMA || data.scope !== PARENT_ACCOUNT_DATA_SCOPE || data.tenantId !== tenantId || !timestamp(data.generatedAt)) throw new Error(INVALID);
  const profile = record(data.parentAccount, ['id', 'email', 'name', 'picture', 'provider']);
  if (Object.values(profile).some((item) => typeof item !== 'string') || profile.id !== userId || !userId || profile.provider !== 'tauth') throw new Error(INVALID);
  const entitlement = record(data.subscription, ['appUserId', 'entitlementId', 'active', 'checkedAt', 'source'], ['productIdentifier', 'store', 'managementUrl', 'expiresAt']);
  if (entitlement.appUserId !== `tauth:${userId}` || typeof entitlement.active !== 'boolean' || !timestamp(entitlement.checkedAt)) throw new Error(INVALID);
  if (Object.entries(entitlement).some(([key, item]) => key !== 'active' && typeof item !== 'string')) throw new Error(INVALID);
  if (!entitlement.entitlementId || !entitlement.source || (entitlement.expiresAt !== undefined && !timestamp(entitlement.expiresAt))) throw new Error(INVALID);
  return /** @type {ParentAccountData} */ (/** @type {unknown} */ (data));
}

/** @param {string} url @param {{fetchImpl: DataFetch, tenantId: string, userId: string, signal: AbortSignal}} options @returns {Promise<ParentAccountData>} */
export async function fetchParentAccountData(url, { fetchImpl, tenantId, userId, signal }) {
  const response = await fetchImpl(url, {
    method: 'GET', credentials: 'include', signal,
    headers: { Accept: 'application/json', 'X-TAuth-Tenant': tenantId },
  });
  if (!response.ok) throw new Error(UNAVAILABLE);
  let payload;
  try { payload = JSON.parse(await response.text()); } catch { throw new Error(INVALID); }
  return accountData(payload, userId, tenantId);
}
