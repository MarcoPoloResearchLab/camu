// @ts-check
export const PARENT_BILLING_DATA_PATH = '/api/account-billing-data';
export const PARENT_BILLING_DATA_FILENAME = 'kamu-billing-data.json';
export const PARENT_BILLING_DATA_SCOPE = 'revenuecat-v2-customer-records';
const SCHEMA = 'kamu.parent-billing-data.v1';
const INVALID = 'billing_data_invalid';
const RESOURCES = Object.freeze({ aliases: 'customer.alias', attributes: 'customer.attribute', activeEntitlements: 'customer.active_entitlement', events: 'customer.event', purchases: 'purchase', subscriptions: 'subscription' });
/** @typedef {Record<string, unknown>} ProviderRecord */
/** @typedef {{schema: string, scope: string, generatedAt: string, tenantId: string, parentId: string, appUserId: string, revenueCat: {customer: ProviderRecord|null, aliases: ProviderRecord[], attributes: ProviderRecord[], activeEntitlements: ProviderRecord[], events: ProviderRecord[], purchases: ProviderRecord[], subscriptions: ProviderRecord[]}}} ParentBillingData */

/** @param {unknown} value @param {string[]} [keys] @returns {ProviderRecord} */
function record(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(INVALID);
  const result = /** @type {ProviderRecord} */ (value);
  if (keys && (keys.some((key) => !Object.hasOwn(result, key)) || Object.keys(result).some((key) => !keys.includes(key)))) throw new Error(INVALID);
  return result;
}

/** @param {unknown} value @param {string} userId @param {string} tenantId @returns {ParentBillingData} */
function billingData(value, userId, tenantId) {
  const data = record(value, ['schema', 'scope', 'generatedAt', 'tenantId', 'parentId', 'appUserId', 'revenueCat']);
  if (!userId || data.parentId !== userId || data.appUserId !== `tauth:${userId}` || data.tenantId !== tenantId || data.schema !== SCHEMA || data.scope !== PARENT_BILLING_DATA_SCOPE) throw new Error(INVALID);
  if (typeof data.generatedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(data.generatedAt) || !Number.isFinite(Date.parse(data.generatedAt))) throw new Error(INVALID);
  const provider = record(data.revenueCat, ['customer', ...Object.keys(RESOURCES)]);
  const identities = new Set([data.appUserId]);
  let projectId;
  if (provider.customer !== null) {
    const customer = record(provider.customer);
    if (customer.object !== 'customer' || typeof customer.id !== 'string' || !customer.id || typeof customer.project_id !== 'string' || !customer.project_id) throw new Error(INVALID);
    identities.add(customer.id);
    projectId = customer.project_id;
  }
  for (const [name, object] of Object.entries(RESOURCES)) {
    const items = provider[name];
    if (!Array.isArray(items) || items.some((item) => record(item).object !== object)) throw new Error(INVALID);
    if (provider.customer === null && items.length) throw new Error(INVALID);
  }
  const aliases = /** @type {ProviderRecord[]} */ (provider.aliases);
  for (const alias of aliases) {
    if (typeof alias.id !== 'string' || !alias.id) throw new Error(INVALID);
    identities.add(alias.id);
  }
  for (const id of identities) {
    if (id !== data.appUserId && (typeof id !== 'string' || !id.startsWith('$RCAnonymousID:') || id === '$RCAnonymousID:')) throw new Error(INVALID);
  }
  if (provider.customer !== null && record(provider.customer).id !== data.appUserId && !aliases.some((alias) => alias.id === data.appUserId)) throw new Error(INVALID);
  for (const name of Object.keys(RESOURCES)) {
    for (const item of /** @type {ProviderRecord[]} */ (provider[name])) {
      if (item.project_id != null && item.project_id !== projectId) throw new Error(INVALID);
      for (const key of ['customer_id', 'original_customer_id']) {
        if (item[key] != null && !identities.has(item[key])) throw new Error(INVALID);
      }
      if ((name === 'purchases' || name === 'subscriptions') && !identities.has(item.customer_id)) throw new Error(INVALID);
      if (item.body != null) {
        const body = record(item.body);
        if (body.app_user_id != null && !identities.has(body.app_user_id)) throw new Error(INVALID);
      }
    }
  }
  return /** @type {ParentBillingData} */ (/** @type {unknown} */ (data));
}

/** @param {string} url @param {{fetchImpl: import('./parent-account-data.js').DataFetch, tenantId: string, userId: string, signal: AbortSignal}} options @returns {Promise<ParentBillingData>} */
export async function fetchParentBillingData(url, { fetchImpl, tenantId, userId, signal }) {
  const response = await fetchImpl(url, { method: 'GET', credentials: 'include', signal, headers: { Accept: 'application/json', 'X-TAuth-Tenant': tenantId } });
  if (!response.ok) throw new Error('billing_data_unavailable');
  let payload;
  try { payload = JSON.parse(await response.text()); } catch { throw new Error(INVALID); }
  return billingData(payload, userId, tenantId);
}
