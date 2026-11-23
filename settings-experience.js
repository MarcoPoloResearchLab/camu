// @ts-check

export const LOCAL_PREFERENCES_RESET_EVENT = 'kamu:preferences-reset';

export const EXPERIENCE_COPY = Object.freeze({
  en: {
    signInWith: 'Sign in with',
    proBody: 'Kamu Tales Pro unlocks the full story catalog.',
    proSignedOut: 'Sign in to subscribe.',
    proChecking: 'Checking your subscription…',
    proActive: 'Subscription active.',
    proInactive: 'Subscription inactive.',
    proUnavailable: 'New subscriptions are currently unavailable.',
    proCheckFailed: 'We could not check your subscription.',
    preferences: 'Preferences',
    mobilePreferenceScope: 'Resets the language, text size, and search preferences on this device. Your account and subscription are kept.',
    resetPreferences: 'Reset local preferences',
    resetSuccess: 'Preferences reset.',
    storyInformation: 'Story information',
    englishPage: 'in English',
  },
  ru: {
    signInWith: 'Войти через',
    proBody: 'Подписка Kamu Tales Pro открывает доступ ко всему каталогу сказок.',
    proSignedOut: 'Войдите, чтобы оформить подписку.',
    proChecking: 'Проверяем подписку…',
    proActive: 'Подписка активна.',
    proInactive: 'Подписка не активна.',
    proUnavailable: 'Оформление новых подписок пока недоступно.',
    proCheckFailed: 'Не удалось проверить подписку.',
    preferences: 'Настройки приложения',
    mobilePreferenceScope: 'Сбрасывает язык, размер текста и параметры поиска на этом устройстве. Аккаунт и подписка сохраняются.',
    resetPreferences: 'Сбросить локальные настройки',
    resetSuccess: 'Настройки сброшены.',
    storyInformation: 'О сказке',
    englishPage: 'на английском',
  },
  bg: {
    signInWith: 'Вход с',
    proBody: 'Kamu Tales Pro отключва пълния каталог с приказки.',
    proSignedOut: 'Влезте в профила си, за да се абонирате.',
    proChecking: 'Проверяваме абонамента ви…',
    proActive: 'Абонаментът е активен.',
    proInactive: 'Абонаментът не е активен.',
    proUnavailable: 'В момента не могат да се създават нови абонаменти.',
    proCheckFailed: 'Не успяхме да проверим абонамента ви.',
    preferences: 'Предпочитания',
    mobilePreferenceScope: 'Възстановява началния език, размер на текста и настройки за търсене на това устройство. Профилът и абонаментът се запазват.',
    resetPreferences: 'Нулиране на местните настройки',
    resetSuccess: 'Настройките са нулирани.',
    storyInformation: 'За приказката',
    englishPage: 'на английски',
  },
});

export const POLICY_LINKS = Object.freeze([
  { id: 'privacy', path: 'privacy.html', labels: { ru: 'Конфиденциальность', en: 'Privacy', bg: 'Поверителност' } },
  { id: 'account-deletion', path: 'account-deletion.html', labels: { ru: 'Удаление аккаунта', en: 'Account deletion', bg: 'Изтриване на акаунт' } },
  { id: 'terms', path: 'terms.html', labels: { ru: 'Условия', en: 'Terms', bg: 'Условия' } },
  { id: 'subscription', path: 'subscription.html', labels: { ru: 'Подписка Kamu Tales Pro', en: 'Kamu Tales Pro', bg: 'Абонамент за Kamu Tales Pro' } },
  { id: 'refunds', path: 'refunds.html', labels: { ru: 'Возврат средств', en: 'Refunds', bg: 'Възстановяване на суми' } },
]);

/** @param {string | null | undefined} display @param {string | null | undefined} address */
export function accountIdentity(display, address) {
  const name = display?.trim() || '';
  const email = address?.trim() || '';
  return { name: name.toLowerCase() === email.toLowerCase() ? '' : name, email };
}

/** @typedef {'unknown' | 'active' | 'inactive'} EntitlementState */
/** @typedef {'signed-out' | 'checking' | 'unconfirmed' | 'active' | 'inactive' | 'unavailable'} SubscriptionPresentationStatus */
/**
 * @param {{signedIn: boolean, checking: boolean, entitlement: EntitlementState, purchaseReady?: boolean, restoreReady?: boolean, manageReady?: boolean}} state
 */
export function subscriptionPresentation({ signedIn, checking, entitlement, purchaseReady, restoreReady, manageReady }) {
  const status = subscriptionStatus(signedIn, checking, entitlement, purchaseReady);
  return {
    status,
    showSubscribe: status === 'inactive',
    showRestore: signedIn && Boolean(restoreReady),
    showManage: status === 'active' && Boolean(manageReady),
  };
}

/**
 * @param {boolean} signedIn @param {boolean} checking @param {EntitlementState} entitlement @param {boolean | undefined} purchaseReady
 * @returns {SubscriptionPresentationStatus}
 */
function subscriptionStatus(signedIn, checking, entitlement, purchaseReady) {
  if (!signedIn) return checking ? 'checking' : 'signed-out';
  if (entitlement === 'active') return 'active';
  if (checking) return 'checking';
  if (entitlement === 'unknown') return 'unconfirmed';
  return purchaseReady ? 'inactive' : 'unavailable';
}
