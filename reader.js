// @ts-check
import { parseReaderSynchronization } from './reader-synchronization.js';
const { initializeSettingsDialog } = globalThis.KamuSettings;

const BOOK_MODE = 'book';
const SCROLL_MODE = 'scroll';
const READ_SURFACE = 'read';
const WATCH_SURFACE = 'watch';
const PAGE_TURN_CLASS = 'book-page-turn';
const PAGE_TURN_SHEET_CLASS = 'book-page-flip-sheet';
const PAGE_TURN_FORWARD_CLASS = 'book-page-turn-forward';
const PAGE_TURN_BACKWARD_CLASS = 'book-page-turn-backward';
const PAGE_TURN_CORNER_CLASS_PREFIX = 'book-page-turn-from-';
const PAGE_TURN_CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
const PAGE_TURN_MS = 640;

const roots = [...document.querySelectorAll('[data-reader-root]')];
initializeSettingsDialog();
for (const root of roots) {
  initializeReader(root);
}

for (const link of document.querySelectorAll('[data-reader-share-url]')) {
  initializeReaderShareLink(link);
}

function initializeReaderShareLink(link) {
  const shareUrl = link.dataset.readerShareUrl || link.href;
  if (!shareUrl) return;
  const label = link.querySelector('span');
  const defaultLabel = label?.textContent || '';
  const copiedLabel = link.dataset.readerShareCopiedLabel || defaultLabel;

  link.addEventListener('click', async (event) => {
    const sharePayload = {
      title: link.dataset.readerShareTitle || document.title,
      text: link.dataset.readerShareText || document.title,
      url: shareUrl,
    };

    if (navigator.share) {
      event.preventDefault();
      try {
        await navigator.share(sharePayload);
      } catch {
        // User cancellation leaves the reader state unchanged.
      }
      return;
    }

    if (navigator.clipboard?.writeText) {
      event.preventDefault();
      try {
        await navigator.clipboard.writeText(shareUrl);
        if (label && copiedLabel) {
          label.textContent = copiedLabel;
          window.setTimeout(() => {
            label.textContent = defaultLabel;
          }, 1800);
        }
      } catch {
        window.location.href = shareUrl;
      }
    }
  });
}

function initializeReader(root) {
  const scrollArticle = root.querySelector('[data-reader-scroll]');
  const bookRegion = root.querySelector('[data-reader-book]');
  const pages = root.querySelector('[data-reader-pages]');
  const status = root.querySelector('[data-reader-book-status]');
  const pageDisplay = root.querySelector('[data-reader-page-display]');
  const progress = root.querySelector('[data-reader-progress]');
  const previousButton = root.querySelector('[data-reader-page-prev]');
  const nextButton = root.querySelector('[data-reader-page-next]');
  const previousEdgeButton = root.querySelector('[data-reader-edge-prev]');
  const nextEdgeButton = root.querySelector('[data-reader-edge-next]');
  const modeBar = root.querySelector('.reader-mode-bar');
  const media = readReaderMedia(root);
  const surfaceButtons = [...root.querySelectorAll('[data-reader-surface-button]')];
  const watchPanel = root.querySelector('[data-reader-watch-panel]');
  const watchTranscript = root.querySelector('[data-reader-watch-transcript]');
  const audioControls = root.querySelector('[data-reader-audio-controls]');
  const audio = root.querySelector('[data-reader-audio]');
  const audioToggle = root.querySelector('[data-reader-audio-toggle]');
  const audioPlayIcon = root.querySelector('[data-reader-audio-icon-play]');
  const audioPauseIcon = root.querySelector('[data-reader-audio-icon-pause]');
  const audioSeek = root.querySelector('[data-reader-audio-seek]');
  const audioCurrent = root.querySelector('[data-reader-audio-current]');
  const audioDuration = root.querySelector('[data-reader-audio-duration]');
  const followText = root.querySelector('[data-reader-follow-text]');
  const infoToggle = root.querySelector('[data-reader-info-toggle]');
  const infoPanel = root.querySelector('[data-reader-info-panel]');
  const infoClose = root.querySelector('[data-reader-info-close]');
  const modeButtons = [...root.querySelectorAll('[data-reader-mode-button]')];

  if (!scrollArticle || !bookRegion || !pages || modeButtons.length === 0) {
    return;
  }

  const sourceHtml = scrollArticle.innerHTML;
  let mode = SCROLL_MODE;
  let surface = READ_SURFACE;
  let pageWidth = 1;
  let currentPageIndex = 0;
  let totalPageCount = 1;
  let paginationReady = false;
  let synchronization = null;
  let syncReady = false;
  let syncLoading = null;
  let activeTokenIndex = -1;
  let scrollTimer = 0;
  let resizeTimer = 0;
  let turnTimer = 0;
  let pagePointerStart = null;

  const refreshVisibleSurfaces = () => {
    const isWatching = surface === WATCH_SURFACE && Boolean(watchPanel);
    root.classList.toggle('is-watch-mode', isWatching);
    root.classList.toggle('is-read-mode', !isWatching);
    if (watchPanel) watchPanel.hidden = !isWatching;
    if (audioControls) audioControls.hidden = isWatching;
    scrollArticle.hidden = isWatching || mode === BOOK_MODE;
    bookRegion.hidden = isWatching || mode !== BOOK_MODE;
    if (status) status.hidden = isWatching || mode !== BOOK_MODE;
    if (isWatching) setInfoPanel(false);
    syncStickyMetrics();
  };

  const setSurface = (nextSurface) => {
    if (nextSurface === WATCH_SURFACE && watchPanel) {
      surface = WATCH_SURFACE;
    } else {
      surface = READ_SURFACE;
    }
    if (surface === WATCH_SURFACE) {
      pauseAudio();
    }
    for (const button of surfaceButtons) {
      const isActive = button.dataset.readerSurfaceButton === surface;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    }
    if (surface === WATCH_SURFACE) {
      prepareWatchTranscript();
    }
    refreshVisibleSurfaces();
    if (surface === READ_SURFACE && mode === BOOK_MODE) {
      ensurePagination();
    }
  };

  const setMode = (nextMode) => {
    mode = nextMode === BOOK_MODE ? BOOK_MODE : SCROLL_MODE;
    root.classList.toggle('is-book-mode', mode === BOOK_MODE);
    root.classList.toggle('is-scroll-mode', mode !== BOOK_MODE);

    for (const button of modeButtons) {
      const isActive = button.dataset.readerModeButton === mode;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    }

    refreshVisibleSurfaces();
    if (mode === BOOK_MODE) {
      ensurePagination();
      pages.focus({ preventScroll: true });
    } else {
      setInfoPanel(false);
    }
  };

  const setInfoPanel = (isOpen) => {
    if (!infoPanel || !infoToggle) return;
    const shouldOpen = Boolean(isOpen) && mode === BOOK_MODE;
    infoPanel.hidden = !shouldOpen;
    infoToggle.classList.toggle('is-active', shouldOpen);
    infoToggle.setAttribute('aria-expanded', String(shouldOpen));
    root.classList.toggle('is-info-open', shouldOpen);
  };

  const syncStickyMetrics = () => {
    if (!modeBar) return;
    root.style.setProperty('--reader-mode-bar-height', `${Math.ceil(modeBar.getBoundingClientRect().height)}px`);
  };

  const ensurePagination = () => {
    if (paginationReady) {
      updateControls();
      return;
    }
    paginate();
  };

  const paginate = () => {
    const previousRatio = totalPageCount > 1 ? currentPageIndex / (totalPageCount - 1) : 0;
    const metrics = measurePages(pages);
    pageWidth = metrics.width;
    pages.replaceChildren();
    paginateHtml(scrollArticle.innerHTML, {
      container: pages,
      pageWidth,
      pageHeight: metrics.height,
    });
    totalPageCount = Math.max(1, pages.children.length);
    currentPageIndex = Math.min(totalPageCount - 1, Math.round(previousRatio * Math.max(0, totalPageCount - 1)));
    pages.scrollLeft = 0;
    paginationReady = true;
    updateControls();
    updateActiveTranscriptToken(audio?.currentTime || 0, { force: true });
  };

  const syncVisibleBookPage = () => {
    for (const [index, page] of [...pages.children].entries()) {
      const isVisible = index === currentPageIndex;
      page.hidden = !isVisible;
      page.setAttribute('aria-hidden', String(!isVisible));
    }
  };

  const renderControls = () => {
    syncVisibleBookPage();
    if (pageDisplay) pageDisplay.textContent = `${currentPageIndex + 1}/${totalPageCount}`;
    if (progress) {
      const percent = totalPageCount > 1 ? (currentPageIndex / (totalPageCount - 1)) * 100 : 0;
      progress.style.width = `${Math.max(0, Math.min(100, percent))}%`;
    }
    if (previousButton) previousButton.disabled = currentPageIndex <= 0;
    if (nextButton) nextButton.disabled = currentPageIndex >= totalPageCount - 1;
    if (previousEdgeButton) previousEdgeButton.disabled = currentPageIndex <= 0;
    if (nextEdgeButton) nextEdgeButton.disabled = currentPageIndex >= totalPageCount - 1;
  };

  const updateControls = () => {
    if (!hasDiscreteVisibleBookPage(pages) && pages.scrollLeft > 2) {
      currentPageIndex = Math.max(0, Math.min(totalPageCount - 1, Math.round(pages.scrollLeft / pageWidth)));
    }
    renderControls();
  };

  const scrollToPage = (index, options = {}) => {
    const duration = typeof options === 'number' ? options : options.duration ?? PAGE_TURN_MS;
    const targetIndex = Math.max(0, Math.min(totalPageCount - 1, index));
    const previousPageIndex = currentPageIndex;
    const direction = targetIndex > previousPageIndex ? 'forward' : 'backward';
    const outgoingPage = pages.children[previousPageIndex];
    const outgoingPageClone = duration > 0 && targetIndex !== previousPageIndex && outgoingPage
      ? outgoingPage.cloneNode(true)
      : null;
    const turnCorner = resolvePageTurnCorner(direction, typeof options === 'number' ? null : options.touchPoint);
    currentPageIndex = targetIndex;
    renderControls();
    if (outgoingPageClone) {
      triggerPageTurn(outgoingPageClone, direction, turnCorner);
    }
    window.setTimeout(() => {
      updateControls();
    }, duration + 40);
  };

  const resolvePageTurnCorner = (direction, touchPoint) => {
    const fallback = direction === 'backward' ? 'bottom-left' : 'bottom-right';
    if (!touchPoint) return fallback;
    const rect = pages.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return fallback;
    const cornerPoints = [
      { corner: 'top-left', x: rect.left, y: rect.top },
      { corner: 'top-right', x: rect.right, y: rect.top },
      { corner: 'bottom-left', x: rect.left, y: rect.bottom },
      { corner: 'bottom-right', x: rect.right, y: rect.bottom },
    ];
    const fallbackPoint = cornerPoints.find((point) => point.corner === fallback);
    const fallbackDistance = fallbackPoint
      ? ((fallbackPoint.x - touchPoint.x) ** 2) + ((fallbackPoint.y - touchPoint.y) ** 2)
      : Number.POSITIVE_INFINITY;
    return cornerPoints.reduce((closest, candidate) => {
      const distance = ((candidate.x - touchPoint.x) ** 2) + ((candidate.y - touchPoint.y) ** 2);
      return distance < closest.distance ? { corner: candidate.corner, distance } : closest;
    }, { corner: fallback, distance: fallbackDistance }).corner;
  };

  const triggerPageTurn = (pageClone, direction, corner) => {
    if (!pageClone) return;
    if (turnTimer) window.clearTimeout(turnTimer);
    for (const sheet of pages.querySelectorAll(`.${PAGE_TURN_SHEET_CLASS}`)) {
      sheet.remove();
    }
    pageClone.hidden = false;
    pageClone.removeAttribute('aria-hidden');
    pageClone.setAttribute('aria-hidden', 'true');
    if ('inert' in pageClone) pageClone.inert = true;
    pageClone.classList.remove(
      PAGE_TURN_CLASS,
      PAGE_TURN_FORWARD_CLASS,
      PAGE_TURN_BACKWARD_CLASS,
      ...PAGE_TURN_CORNERS.map((turnCorner) => `${PAGE_TURN_CORNER_CLASS_PREFIX}${turnCorner}`)
    );
    const safeCorner = PAGE_TURN_CORNERS.includes(corner)
      ? corner
      : direction === 'backward' ? 'bottom-left' : 'bottom-right';
    pageClone.classList.add(
      PAGE_TURN_SHEET_CLASS,
      PAGE_TURN_CLASS,
      direction === 'backward' ? PAGE_TURN_BACKWARD_CLASS : PAGE_TURN_FORWARD_CLASS,
      `${PAGE_TURN_CORNER_CLASS_PREFIX}${safeCorner}`
    );
    pages.append(pageClone);
    void pageClone.offsetWidth;
    turnTimer = window.setTimeout(() => {
      pageClone.remove();
      turnTimer = 0;
    }, PAGE_TURN_MS);
  };

  const prepareReadingSync = async () => {
    if (!audio || syncReady) return;
    if (syncLoading) return syncLoading;
    const syncPath = media?.audio?.syncPath || '';
    if (!syncPath) {
      syncReady = true;
      return;
    }

    syncLoading = (async () => {
      try {
        const response = await fetch(`${root.dataset.readerAssetPrefix || ''}${syncPath}`);
        if (!response.ok) throw new Error(`sync ${response.status}`);
        const bytes=new Uint8Array(await response.arrayBuffer());
        const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),(byte)=>byte.toString(16).padStart(2,'0')).join('');
        if (digest!==media.audio.syncSha256) throw new Error('synchronization bytes differ from the catalog binding');
        const text=scrollArticle.querySelector('[data-reader-delivery-text]');
        if (!text) throw new Error('supplied reader text authority is absent');
        synchronization=parseReaderSynchronization(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),{
          identity:{story_id:text.dataset.readerStoryId,package_id:text.dataset.readerPackageId,
            version_id:text.dataset.readerVersionId,language:text.dataset.readerLanguage,text_id:text.dataset.readerTextId},
          displayText:{path:scrollArticle.dataset.displayTextPath,sha256:scrollArticle.dataset.displayTextSha256,
            sourceSha256:scrollArticle.dataset.displayTextSourceSha256},
          audioId:media.audio.audioId,durationSeconds:media.audio.durationSeconds,
          wordIds:[...text.querySelectorAll('[data-reader-token-kind="word"]')].map((word)=>word.dataset.readerTokenId),
        });
      } catch(error) {
        syncLoading=null;
        throw new Error('Prepare public reader synchronization.',{cause:error});
      }

      renderSyncedTranscript(scrollArticle, sourceHtml, synchronization);
      root.classList.toggle('has-reader-sync', synchronization.cueCount > 0);
      root.dataset.readerSyncStatus='ready';
      syncReady = true;
      syncLoading = null;
      paginationReady = false;
      if (mode === BOOK_MODE) ensurePagination();
      updateActiveTranscriptToken(audio.currentTime, { force: true });
    })();

    return syncLoading;
  };

  const prepareWatchTranscript = async () => {
    if (!watchTranscript || watchTranscript.dataset.readerTranscriptReady === 'true') return;
    const syncPath = media?.video?.syncPath || media?.audio?.syncPath || '';
    if (!syncPath) {
      renderSyncedTranscript(watchTranscript, sourceHtml, null);
      watchTranscript.dataset.readerTranscriptReady = 'true';
      return;
    }

    try {
      if (syncPath === media?.audio?.syncPath) {
        await prepareReadingSync();
      } else throw new Error('Watch synchronization differs from the admitted narration reference.');
      renderSyncedTranscript(watchTranscript, sourceHtml, synchronization);
      watchTranscript.dataset.readerTranscriptReady = 'true';
    } catch(error) {
      reportSynchronizationError(error);
    }
  };

  const updateAudioControls = () => {
    if (!audio) return;
    const duration = Number.isFinite(audio.duration) ? audio.duration : Number(media?.audio?.durationSeconds || 0);
    const current = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    if (audioSeek) {
      audioSeek.max = String(duration || 0);
      if (document.activeElement !== audioSeek) audioSeek.value = String(current);
    }
    if (audioCurrent) audioCurrent.textContent = formatClock(current);
    if (audioDuration) audioDuration.textContent = formatClock(duration);
    updateActiveTranscriptToken(current);
  };

  const updatePlayState = () => {
    if (!audio) return;
    const isPlaying = !audio.paused && !audio.ended;
    if (audioPlayIcon) audioPlayIcon.hidden = isPlaying;
    if (audioPauseIcon) audioPauseIcon.hidden = !isPlaying;
    if (audioToggle) {
      const label = isPlaying ? audioToggle.dataset.pauseLabel : audioToggle.dataset.playLabel;
      if (label) {
        audioToggle.setAttribute('aria-label', label);
        audioToggle.setAttribute('title', label);
      }
    }
  };

  const pauseAudio = () => {
    if (!audio || audio.paused) return;
    audio.pause();
    updatePlayState();
    updateAudioControls();
  };

  const updateActiveTranscriptToken = (time, options = {}) => {
    if (!synchronization || !syncReady) return;
    const nextIndex = synchronization.activeIndex(time);
    if (nextIndex === activeTokenIndex && !options.force) return;

    for (const previous of root.querySelectorAll('.sync-token.is-active')) {
      previous.classList.remove('is-active');
    }
    activeTokenIndex = nextIndex;
    if (nextIndex === -1) return;

    const activeTokens = [...root.querySelectorAll(`[data-sync-token-index="${nextIndex}"]`)];
    for (const token of activeTokens) token.classList.add('is-active');
    if (followText?.checked) {
      followActiveToken(nextIndex, activeTokens);
    }
  };

  const followActiveToken = (tokenIndex, activeTokens) => {
    if (mode === BOOK_MODE) {
      ensurePagination();
      const bookToken = activeTokens.find((token) => pages.contains(token))
        || pages.querySelector(`[data-sync-token-index="${tokenIndex}"]`);
      const page = bookToken?.closest('.book-page');
      if (page) {
        const pageIndex = [...pages.children].indexOf(page);
        if (pageIndex !== -1 && pageIndex !== currentPageIndex) scrollToPage(pageIndex);
        return;
      }
    }

    const scrollToken = activeTokens.find((token) => scrollArticle.contains(token))
      || scrollArticle.querySelector(`[data-sync-token-index="${tokenIndex}"]`);
    if (scrollToken && !scrollArticle.hidden) {
      scrollToken.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  };

  const disableFollowForManualPaging = () => {
    if (!followText || !audio || audio.paused || audio.ended) return;
    followText.checked = false;
  };

  const reportSynchronizationError = (error) => {
    root.dataset.readerSyncStatus='error';
    root.classList.remove('has-reader-sync');
    if (audio) audio.pause();
    if (audioToggle) audioToggle.disabled=true;
    if (followText) followText.disabled=true;
    console.error(error);
  };

  const turnPageManually = (index, options = {}) => {
    disableFollowForManualPaging();
    scrollToPage(index, options);
  };

  for (const button of modeButtons) {
    button.addEventListener('click', () => setMode(button.dataset.readerModeButton || SCROLL_MODE));
  }
  for (const button of surfaceButtons) {
    button.addEventListener('click', () => {
      setSurface(button.dataset.readerSurfaceButton || READ_SURFACE);
    });
  }

  if (previousButton) {
    previousButton.addEventListener('click', () => turnPageManually(currentPageIndex - 1));
  }
  if (nextButton) {
    nextButton.addEventListener('click', () => turnPageManually(currentPageIndex + 1));
  }
  if (previousEdgeButton) {
    previousEdgeButton.addEventListener('click', (event) => {
      turnPageManually(currentPageIndex - 1, { touchPoint: eventPoint(event) });
    });
  }
  if (nextEdgeButton) {
    nextEdgeButton.addEventListener('click', (event) => {
      turnPageManually(currentPageIndex + 1, { touchPoint: eventPoint(event) });
    });
  }
  if (infoToggle) {
    infoToggle.addEventListener('click', () => setInfoPanel(!infoPanel || infoPanel.hidden));
  }
  if (infoClose) {
    infoClose.addEventListener('click', () => setInfoPanel(false));
  }
  if (audioToggle && audio) {
    audioToggle.addEventListener('click', async () => {
      setSurface(READ_SURFACE);
      try {
        await prepareReadingSync();
      } catch(error) {
        reportSynchronizationError(error);
        updatePlayState();
        updateAudioControls();
        return;
      }
      if (audio.paused || audio.ended) {
        try { await audio.play(); }
        catch(error) {
          audio.pause();
          console.error(new Error('Play admitted reader audio.',{cause:error}));
          updatePlayState();
          updateAudioControls();
        }
      } else audio.pause();
    });
  }
  if (audioSeek && audio) {
    audioSeek.addEventListener('input', async () => {
      try {
        await prepareReadingSync();
        audio.currentTime = Number(audioSeek.value) || 0;
        updateAudioControls();
      } catch(error) {reportSynchronizationError(error);}
    });
  }
  if (audio) {
    audio.addEventListener('loadedmetadata', updateAudioControls);
    audio.addEventListener('timeupdate', updateAudioControls);
    audio.addEventListener('play', updatePlayState);
    audio.addEventListener('pause', updatePlayState);
    audio.addEventListener('ended', () => {
      updatePlayState();
      updateAudioControls();
    });
  }

  if (modeBar && 'ResizeObserver' in window) {
    new ResizeObserver(syncStickyMetrics).observe(modeBar);
  }

  pages.addEventListener('scroll', () => {
    if (scrollTimer) window.clearTimeout(scrollTimer);
    scrollTimer = window.setTimeout(updateControls, 80);
  }, { passive: true });

  pages.addEventListener('pointerdown', (event) => {
    pagePointerStart = { x: event.clientX, y: event.clientY };
  }, { passive: true });

  pages.addEventListener('pointerup', (event) => {
    if (!pagePointerStart) return;
    const deltaX = event.clientX - pagePointerStart.x;
    const deltaY = event.clientY - pagePointerStart.y;
    const touchPoint = pagePointerStart;
    pagePointerStart = null;
    if (Math.abs(deltaX) < 48 || Math.abs(deltaX) < Math.abs(deltaY) * 1.35) return;
    turnPageManually(currentPageIndex + (deltaX < 0 ? 1 : -1), { touchPoint });
  }, { passive: true });

  pages.addEventListener('pointercancel', () => {
    pagePointerStart = null;
  }, { passive: true });

  window.addEventListener('resize', () => {
    syncStickyMetrics();
    if (mode !== BOOK_MODE) return;
    if (resizeTimer) window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      paginationReady = false;
      ensurePagination();
    }, 140);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && infoPanel && !infoPanel.hidden) {
      setInfoPanel(false);
      infoToggle?.focus({ preventScroll: true });
      return;
    }
    if (
      mode !== BOOK_MODE ||
      event.defaultPrevented ||
      shouldIgnoreReaderShortcut(event.target, infoPanel)
    ) {
      return;
    }
    if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
      event.preventDefault();
      turnPageManually(currentPageIndex + 1);
    }
    if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
      event.preventDefault();
      turnPageManually(currentPageIndex - 1);
    }
  });

  setMode(mode);
  setSurface(surface);
  updateAudioControls();
  updatePlayState();
}

function readReaderMedia(root) {
  const script = root.querySelector('[data-reader-media-json]');
  if (!script) return null;
  try {
    return JSON.parse(script.textContent || '{}');
  } catch {
    return null;
  }
}

function renderSyncedTranscript(container, sourceHtml, synchronization) {
  const template = document.createElement('template');
  template.innerHTML = sourceHtml;
  container.replaceChildren(template.content.cloneNode(true));
  if (!synchronization) return;
  for (const word of container.querySelectorAll('[data-reader-token-kind="word"]')) {
    word.classList.add('sync-token');
    word.dataset.syncTokenIndex=String(synchronization.indexForToken(word.dataset.readerTokenId));
  }
}

function formatClock(seconds) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safeSeconds / 60);
  const wholeSeconds = Math.floor(safeSeconds % 60);
  return `${minutes}:${String(wholeSeconds).padStart(2, '0')}`;
}

function measurePages(pages) {
  const rect = pages.getBoundingClientRect();
  return {
    width: Math.max(280, Math.floor(rect.width)),
    height: Math.max(360, Math.floor(rect.height)),
  };
}

function eventPoint(event) {
  return { x: event.clientX, y: event.clientY };
}

function paginateHtml(html, options) {
  const { container, pageWidth, pageHeight } = options;
  const stage = document.createElement('div');
  stage.className = 'reader-pagination-stage';
  stage.style.width = `${pageWidth}px`;
  stage.innerHTML = html;
  const delivery = stage.querySelector('[data-reader-delivery-text]');
  if (delivery) stage.replaceChildren(...delivery.childNodes);
  document.body.append(stage);

  const appendPage = (className = '') => {
    const nextPage = createPage(pageWidth, pageHeight);
    if (className) nextPage.classList.add(className);
    container.append(nextPage);
    return nextPage;
  };

  let page = appendPage();

  while (stage.firstChild) {
    let node = stage.firstChild;
    stage.removeChild(node);

    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || '';
      if (!text.trim()) continue;
      const wrapper = document.createElement('p');
      wrapper.textContent = text;
      node = wrapper;
    }

    if (!page) page = appendPage();

    if (isStandaloneBookPageNode(node)) {
      if (pageHasContent(page)) {
        page = appendPage('book-page-illustration');
      } else {
        page.classList.add('book-page-illustration');
      }
      page.append(node);
      page = null;
      continue;
    }

    page.append(node);
    if (fits(page)) continue;
    page.removeChild(node);

    if (!pageHasContent(page)) {
      const split = splitForPage(node, page);
      if (split.remainder) stage.insertBefore(split.remainder, stage.firstChild);
      continue;
    }

    page = appendPage();
    const carry = extractTrailingHeading(page.previousElementSibling);
    if (carry) page.prepend(carry);

    const split = splitForPage(node, page);
    if (split.remainder) stage.insertBefore(split.remainder, stage.firstChild);
  }

  stage.remove();
}

function createPage(width, height) {
  const page = document.createElement('div');
  page.className = 'book-page';
  page.style.width = `${width}px`;
  page.style.height = `${height}px`;
  return page;
}

function isStandaloneBookPageNode(node) {
  return node instanceof HTMLElement && node.classList.contains('reader-illustration');
}

function hasDiscreteVisibleBookPage(container) {
  return [...container.children].some((page) => page.hidden);
}

function pageHasContent(page) {
  return Boolean((page.textContent || '').trim()) || page.children.length > 0;
}

function fits(page) {
  return page.scrollHeight <= page.clientHeight + 1;
}

function extractTrailingHeading(page) {
  if (!page) return null;
  const last = page.lastElementChild;
  if (!last || !/^H[1-3]$/.test(last.tagName)) return null;
  page.removeChild(last);
  return last;
}

function splitForPage(node, page) {
  if (!isSplittable(node)) {
    page.append(node);
    return { remainder: null };
  }

  const textLength = Array.from(node.textContent || '').length;
  let low = 1;
  let high = textLength;
  let best = 0;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const candidate = splitNodeAtOffset(node, middle).head;
    if (!candidate) {
      high = middle - 1;
      continue;
    }
    page.append(candidate);
    const ok = fits(page);
    page.removeChild(candidate);
    if (ok) {
      best = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  if (best <= 0) {
    page.append(node);
    return { remainder: null };
  }

  if (best >= textLength) {
    page.append(node);
    return { remainder: null };
  }

  const boundary = findPreviousSuppliedWordBoundary(node, best);
  const offset = boundary > Math.floor(best * 0.62) ? boundary : best;
  const split = splitNodeAtOffset(node, offset);
  if (split.head) page.append(split.head);
  return { remainder: split.tail };
}

function isSplittable(node) {
  if (!(node instanceof HTMLElement)) return false;
  return ['P', 'BLOCKQUOTE', 'LI'].includes(node.tagName) && Boolean((node.textContent || '').trim());
}

function splitNodeAtOffset(node, offset) {
  const textLength = Array.from(node.textContent || '').length;
  if (offset <= 0) return { head: null, tail: node.cloneNode(true) };
  if (offset >= textLength) return { head: node.cloneNode(true), tail: null };

  if (node.nodeType === Node.TEXT_NODE) {
    const text = Array.from(node.textContent || '');
    return {
      head: document.createTextNode(text.slice(0, offset).join('')),
      tail: document.createTextNode(text.slice(offset).join('')),
    };
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return { head: null, tail: null };
  }

  const head = node.cloneNode(false);
  const tail = node.cloneNode(false);
  let consumed = 0;

  for (const child of [...node.childNodes]) {
    const length = Array.from(child.textContent || '').length;
    if (consumed + length <= offset) {
      head.append(child.cloneNode(true));
      consumed += length;
      continue;
    }
    if (consumed >= offset) {
      tail.append(child.cloneNode(true));
      consumed += length;
      continue;
    }
    const split = splitNodeAtOffset(child, offset - consumed);
    if (split.head) head.append(split.head);
    if (split.tail) tail.append(split.tail);
    consumed += length;
  }

  return {
    head: head.childNodes.length ? head : null,
    tail: tail.childNodes.length ? tail : null,
  };
}

function findPreviousSuppliedWordBoundary(node, offset) {
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  let position = 0;
  let boundary = 0;
  while (walker.nextNode()) {
    const text = walker.currentNode;
    const end = position + Array.from(text.textContent || '').length;
    if (text.parentElement?.closest('[data-reader-token-kind="word"]')) {
      if (position <= offset) boundary = Math.max(boundary, position);
      if (end <= offset) boundary = Math.max(boundary, end);
    }
    position = end;
    if (position > offset) break;
  }
  return boundary;
}

function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  return ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName) || target.isContentEditable;
}

function shouldIgnoreReaderShortcut(target, infoPanel) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    isTypingTarget(target) ||
    Boolean(target.closest('a[href], summary, [role="button"], [role="link"]')) ||
    Boolean(infoPanel && infoPanel.contains(target))
  );
}
