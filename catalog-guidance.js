// @ts-check

/** @typedef {'assessed'|'pending'|'unassessed'|'recorded-rejection'|'stale'|'incomplete'} GuidanceStatus */
/** @typedef {'approved'|'pending'|'rejected'} RecordedDecision */
/** @typedef {{status: GuidanceStatus, minimumAge: number|null, recordedDecision: RecordedDecision|null, assessmentAudience: {minimumAge: number, maximumAge: number}, contentSha256: string, reviewContentSha256: string|null, reviewedMedia: string[], requiredMedia: string[], issues: string[]}} ContentGuidance */

const STATUSES = new Set(['assessed', 'pending', 'unassessed', 'recorded-rejection', 'stale', 'incomplete']);
const DECISIONS = new Set(['approved', 'pending', 'rejected']);
const MEDIA = new Set(['text', 'cover', 'illustrations', 'audio', 'video', 'text-passages']);
const DIGEST = /^[a-f0-9]{64}$/;
const FIELDS = ['status', 'minimumAge', 'recordedDecision', 'assessmentAudience', 'contentSha256', 'reviewContentSha256', 'reviewedMedia', 'requiredMedia', 'issues'];

/** @param {unknown} value @param {string} subject @returns {ContentGuidance} */
export function parseContentGuidance(value, subject) {
  /** @param {string} reason @returns {never} */
  function invalid(reason) { throw new Error(`${subject}: invalid content guidance (${reason}).`); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('object required');
  const row = /** @type {Record<string, unknown>} */ (value);
  if (Object.keys(row).length !== FIELDS.length || FIELDS.some((key) => !Object.hasOwn(row, key))) invalid('fields');
  if (typeof row.status !== 'string' || !STATUSES.has(row.status)) invalid('status');
  const status = /** @type {GuidanceStatus} */ (row.status);
  if (!row.assessmentAudience || typeof row.assessmentAudience !== 'object' || Array.isArray(row.assessmentAudience)
    || Object.keys(row.assessmentAudience).length !== 2) invalid('assessment audience');
  const audience = /** @type {Record<string, unknown>} */ (row.assessmentAudience);
  if (audience.minimumAge !== 3 || audience.maximumAge !== 11) invalid('assessment audience');
  if (typeof row.contentSha256 !== 'string' || !DIGEST.test(row.contentSha256)) invalid('current identity');
  if (row.reviewContentSha256 !== null && (typeof row.reviewContentSha256 !== 'string' || !DIGEST.test(row.reviewContentSha256))) invalid('review identity');
  if (row.recordedDecision !== null && (typeof row.recordedDecision !== 'string' || !DECISIONS.has(row.recordedDecision))) invalid('decision');
  /** @param {string} key @returns {string[]} */
  function strings(key) {
    const items = row[key];
    if (!Array.isArray(items) || items.some((item) => typeof item !== 'string' || !item.trim()) || new Set(items).size !== items.length) invalid(key);
    if (key !== 'issues' && items.some((item) => !MEDIA.has(item))) invalid(key);
    return items;
  }
  const requiredMedia = strings('requiredMedia');
  const reviewedMedia = strings('reviewedMedia');
  const issues = strings('issues');
  if (!requiredMedia.includes('text') || !requiredMedia.includes('cover')) invalid('required media');
  if (status === 'assessed') {
    if (typeof row.minimumAge !== 'number' || !Number.isInteger(row.minimumAge) || row.minimumAge < 3 || row.minimumAge > 11
      || row.recordedDecision !== 'approved' || row.reviewContentSha256 !== row.contentSha256
      || issues.length || requiredMedia.some((item) => !reviewedMedia.includes(item))) invalid('assessed evidence');
  } else if (row.minimumAge !== null) invalid('unqualified age');
  if (status !== 'unassessed' && issues.includes('review_missing')) invalid('recorded review');
  if (row.recordedDecision === 'approved' && issues.includes('review_not_approved')) invalid('approved decision');
  if (status === 'unassessed') {
    if (row.recordedDecision !== null || row.reviewContentSha256 !== null || reviewedMedia.length
      || !issues.includes('review_missing') || issues.includes('review_stale') || issues.includes('review_not_approved')) invalid('missing review');
  } else if (status === 'stale') {
    if (row.recordedDecision === null || row.reviewContentSha256 === null || row.reviewContentSha256 === row.contentSha256
      || !issues.includes('review_stale')) invalid('stale review');
  } else {
    if (row.reviewContentSha256 !== row.contentSha256 || issues.includes('review_stale')) invalid('current binding');
    const decision = { assessed: 'approved', pending: 'pending', 'recorded-rejection': 'rejected', incomplete: 'approved' }[status];
    if (row.recordedDecision !== decision) invalid('status decision');
    if (['pending', 'recorded-rejection'].includes(status) && !issues.includes('review_not_approved')) invalid('unapproved decision');
    if (status === 'incomplete' && !issues.length) invalid('incomplete evidence');
  }
  return { status, minimumAge: /** @type {number|null} */ (row.minimumAge),
    recordedDecision: /** @type {RecordedDecision|null} */ (row.recordedDecision),
    assessmentAudience: { minimumAge: 3, maximumAge: 11 }, contentSha256: row.contentSha256,
    reviewContentSha256: /** @type {string|null} */ (row.reviewContentSha256),
    reviewedMedia: [...reviewedMedia], requiredMedia: [...requiredMedia], issues: [...issues] };
}

/** Validate guidance against media at a story import boundary.
 * @param {unknown} value @param {string} subject @returns {ContentGuidance} */
export function parseStoryContentGuidance(value, subject) {
  /** @param {string} reason @returns {never} */
  function invalid(reason) { throw new Error(`${subject}: invalid content guidance (${reason}).`); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('story object required');
  const story = /** @type {Record<string, unknown>} */ (value);
  const guidance = parseContentGuidance(story.contentGuidance, subject);
  if (story.readerIllustrations !== undefined && !Array.isArray(story.readerIllustrations)) invalid('reader illustrations');
  if (Array.isArray(story.readerIllustrations) && story.readerIllustrations.length && !guidance.requiredMedia.includes('illustrations')) {
    invalid('required illustrations omitted');
  }
  if (story.media !== undefined && story.media !== null
    && (typeof story.media !== 'object' || Array.isArray(story.media))) invalid('media object required');
  const media = /** @type {Record<string, unknown>} */ (story.media || {});
  for (const kind of ['audio', 'video']) {
    const value = media[kind];
    if (value === undefined || value === null) continue;
    if (typeof value !== 'object' || Array.isArray(value)) invalid(`${kind} object required`);
    const asset = /** @type {Record<string, unknown>} */ (value);
    if (asset.status !== undefined && typeof asset.status !== 'string') invalid(`${kind} status`);
    if (asset.status !== 'available') continue;
    if (!guidance.requiredMedia.includes(kind)) invalid(`required ${kind} omitted`);
    if (kind === 'video' && (asset.provider === 'youtube' || asset.youtubeVideoId || !asset.src)
      && !guidance.issues.includes('external_media_unverified')) invalid('external media is unverified');
  }
  return guidance;
}

/** @param {ContentGuidance} guidance @returns {string} */
export function assessedAgeLabel(guidance) {
  return guidance.status === 'assessed' ? `${guidance.minimumAge}+` : '';
}

const LABELS = {
  en: { assessed: 'Assessed age', pending: 'Assessment pending', unassessed: 'Not assessed', 'recorded-rejection': 'Recorded concern (ages 3–11)', stale: 'Assessment needs update', incomplete: 'Assessment incomplete' },
  ru: { assessed: 'Оценённый возраст', pending: 'Оценка не завершена', unassessed: 'Оценка отсутствует', 'recorded-rejection': 'Отмечена проблема для возраста 3–11 лет', stale: 'Оценку нужно обновить', incomplete: 'Оценка неполная' },
  bg: { assessed: 'Оценена възраст', pending: 'Оценката не е завършена', unassessed: 'Няма оценка', 'recorded-rejection': 'Отбелязан проблем за възраст 3–11 години', stale: 'Оценката трябва да се обнови', incomplete: 'Непълна оценка' },
};

/** @param {ContentGuidance} guidance @param {'en'|'ru'|'bg'} locale @returns {string} */
export function contentGuidanceLabel(guidance, locale) {
  const label = LABELS[locale][guidance.status];
  return guidance.status === 'assessed' ? `${label}: ${assessedAgeLabel(guidance)}` : label;
}
