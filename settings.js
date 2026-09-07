const SETTINGS_MENU_ACTION = 'open-settings';
const SETTINGS_OPEN_QUERY = 'settings';
const SETTINGS_OPEN_QUERY_VALUE = 'open';

const openCallbacks = new Set();
let initialized = false;

function initializeSettingsDialog(options = {}) {
  if (typeof options.onOpen === 'function') openCallbacks.add(options.onOpen);
  if (!initialized) {
    initialized = true;
    document.addEventListener('mpr-user:menu-item', handleSettingsMenuItem);
    document.addEventListener('click', handleSettingsClick);
    document.addEventListener('keydown', handleSettingsKeyDown);
  }
  openSettingsDialogFromNavigation();
}

function openSettingsDialog() {
  const modal = document.querySelector('[data-settings-modal]');
  if (!modal) return;
  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');
  for (const callback of openCallbacks) callback();
  const closeButton = modal.querySelector('[data-settings-close]');
  if (typeof closeButton?.focus === 'function') closeButton.focus();
}

function closeSettingsDialog() {
  const modal = document.querySelector('[data-settings-modal]');
  if (!modal) return;
  modal.hidden = true;
  modal.setAttribute('aria-hidden', 'true');
}

function handleSettingsMenuItem(event) {
  if (event?.detail?.action !== SETTINGS_MENU_ACTION) return;
  openSettingsDialog();
}

function handleSettingsClick(event) {
  const languageOption = event?.target?.closest?.('[data-settings-language-option]');
  if (languageOption) {
    handleSettingsLanguageNavigation(event, languageOption);
    return;
  }
  if (event?.target?.closest?.('[data-settings-open]')) {
    event.preventDefault?.();
    openSettingsDialog();
    return;
  }
  if (event?.target?.matches?.('[data-settings-close]')) {
    event.preventDefault?.();
    closeSettingsDialog();
  }
}

function handleSettingsLanguageNavigation(event, option) {
  if (option.matches('[aria-disabled="true"], .is-disabled')) {
    event.preventDefault?.();
    return;
  }
  if (option.getAttribute('aria-checked') === 'true') {
    event.preventDefault?.();
    return;
  }
  const href = option.getAttribute('href');
  if (!href) return;
  event.preventDefault?.();
  const targetUrl = new URL(href, window.location.href);
  targetUrl.searchParams.set(SETTINGS_OPEN_QUERY, SETTINGS_OPEN_QUERY_VALUE);
  window.location.assign(targetUrl.href);
}

function handleSettingsKeyDown(event) {
  if (handleSettingsLanguageKeyDown(event)) return;
  if (event?.key !== 'Escape') return;
  const modal = document.querySelector('[data-settings-modal]');
  if (!modal || modal.hidden) return;
  closeSettingsDialog();
}

function handleSettingsLanguageKeyDown(event) {
  const option = event?.target?.closest?.('[data-settings-language-option]');
  const group = option?.closest?.('[data-settings-language-options]');
  if (!group) return false;

  const options = Array.from(group.querySelectorAll('a[data-settings-language-option]:not(.is-disabled)'));
  const currentIndex = options.indexOf(option);
  if (currentIndex < 0 || options.length === 0) return false;

  let nextIndex;
  switch (event.key) {
    case 'ArrowLeft':
    case 'ArrowUp':
      nextIndex = (currentIndex - 1 + options.length) % options.length;
      break;
    case 'ArrowRight':
    case 'ArrowDown':
      nextIndex = (currentIndex + 1) % options.length;
      break;
    case 'Home':
      nextIndex = 0;
      break;
    case 'End':
      nextIndex = options.length - 1;
      break;
    default:
      return false;
  }

  event.preventDefault?.();
  const nextOption = options[nextIndex];
  nextOption.focus();
  if (nextOption !== option) nextOption.click();
  return true;
}

function openSettingsDialogFromNavigation() {
  const currentUrl = new URL(window.location.href);
  if (currentUrl.searchParams.get(SETTINGS_OPEN_QUERY) !== SETTINGS_OPEN_QUERY_VALUE) return;
  currentUrl.searchParams.delete(SETTINGS_OPEN_QUERY);
  window.history.replaceState(window.history.state, '', `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
  openSettingsDialog();
}

globalThis.KamuSettings = Object.freeze({
  closeSettingsDialog,
  initializeSettingsDialog,
  openSettingsDialog,
});
