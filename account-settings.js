// @ts-check
export const ACCOUNT_SETTINGS_PATH = '/api/account-settings';
export const ACCOUNT_SETTINGS_SCHEMA = 'kamu.account-settings.v1';
export const ACCOUNT_CHALLENGE_EVENT = 'mpr-ui:account:challenge-issued';
export const ACCOUNT_UPDATED_EVENT = 'mpr-ui:account:updated';
const CREDENTIAL_STATES = ['external', 'password', 'disabled', 'unavailable'];
const BILLING_STATES = ['none', 'records', 'unavailable'];
/** @typedef {{schema:string,userId:string,credentials:'external'|'password'|'disabled'|'unavailable',billing:'none'|'records'|'unavailable'}} AccountSettings */

/** Read presentation metadata only after the shared authentication owner supplies an identity.
 * @param {string} url
 * @param {{fetchImpl:typeof fetch,userId:string,tenantId:string,signal:AbortSignal}} options
 * @returns {Promise<AccountSettings>}
 */
export async function fetchAccountSettings(url, {fetchImpl, userId, tenantId, signal}) {
  const response = await fetchImpl(url, { method: 'GET', credentials: 'include', signal,
    headers: { Accept: 'application/json', 'X-TAuth-Tenant': tenantId } });
  if (!response.ok) throw new Error('account_settings_unavailable');
  let data;
  try { data = JSON.parse(await response.text()); } catch { throw new Error('account_settings_invalid'); }
  if (!data || typeof data !== 'object' || Array.isArray(data) || data.schema !== ACCOUNT_SETTINGS_SCHEMA
    || !userId || data.userId !== userId || Object.keys(data).sort().join(',') !== 'billing,credentials,schema,userId'
    || !CREDENTIAL_STATES.includes(data.credentials) || !BILLING_STATES.includes(data.billing)) throw new Error('account_settings_invalid');
  return Object.freeze(data);
}

/** @param {AccountSettings|null} settings @param {boolean} pending @returns {'link'|'change'|null} */
export function credentialAction(settings, pending) {
  if (pending || !settings) return null;
  return settings.credentials === 'external' ? 'link' : settings.credentials === 'password' ? 'change' : null;
}

export const SETTINGS_COPY = Object.freeze({
  en: { privacy: 'Privacy', loading: 'Checking account options…',
    accountScope: 'Your account ID, name, email, profile picture, and current subscription status in a JSON file.',
    billingScope: 'Your purchase and subscription records in a JSON file. This file is not an invoice.' },
  ru: { privacy: 'Конфиденциальность', loading: 'Проверяем доступные действия…',
    accountScope: 'Идентификатор аккаунта, имя, электронная почта, фотография профиля и текущий статус подписки в файле JSON.',
    billingScope: 'Данные о покупках и подписках в файле JSON. Этот файл не является квитанцией.' },
  bg: { privacy: 'Поверителност', loading: 'Проверка на достъпните действия…',
    accountScope: 'Идентификатор на акаунта, име, имейл, профилна снимка и текущо състояние на абонамента във файл JSON.',
    billingScope: 'Данни за покупките и абонаментите във файл JSON. Този файл не е фактура.' },
});
