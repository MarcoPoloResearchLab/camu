// @ts-check

/** @typedef {{language: 'en'|'ru'|'bg', displayTextSha256: string, scope: 'selected-text-observations', notes: string[]}} ParentContentNotes */
const NOTE_FIELDS = ['language', 'displayTextSha256', 'scope', 'notes'];
export const PARENT_NOTES_SCOPE = 'selected-text-observations';
const DIGEST = /^[a-f0-9]{64}$/;
const LANGUAGES = ['en', 'ru', 'bg'];

/** Parse optional notes at a catalog import boundary.
 * @param {unknown} value @param {string} subject @returns {ParentContentNotes|undefined} */
export function parseStoryParentContentNotes(value, subject) {
  /** @param {string} reason @returns {never} */
  function invalid(reason) { throw new Error(`${subject}: invalid parent content notes (${reason}).`); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('story object required');
  const story = /** @type {Record<string, unknown>} */ (value);
  if (!Object.hasOwn(story, 'parentContentNotes')) return undefined;
  const candidate = story.parentContentNotes;
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) invalid('object required');
  const row = /** @type {Record<string, unknown>} */ (candidate);
  if (Object.keys(row).length !== NOTE_FIELDS.length || NOTE_FIELDS.some((key) => !Object.hasOwn(row, key))) invalid('fields');
  if (typeof row.language !== 'string' || !LANGUAGES.includes(row.language) || row.language !== story.language) invalid('story language');
  if (typeof row.displayTextSha256 !== 'string' || !DIGEST.test(row.displayTextSha256)
    || row.displayTextSha256 !== story.displayTextSha256) invalid('text identity');
  if (row.scope !== PARENT_NOTES_SCOPE) invalid('scope');
  if (!Array.isArray(row.notes) || row.notes.some((note) => typeof note !== 'string' || !note.trim())) invalid('notes');
  return { language: /** @type {ParentContentNotes['language']} */ (row.language), displayTextSha256: row.displayTextSha256,
    scope: PARENT_NOTES_SCOPE, notes: [...row.notes] };
}

const COPY = {
  en: { title: 'Content notes', scope: 'Selected observations from the text. These notes do not supply an age assessment or assess the audio.', show: 'Show content notes', hide: 'Hide content notes' },
  ru: { title: 'О содержании', scope: 'Отдельные наблюдения по тексту. Эти заметки не дают возрастной оценки и не оценивают аудиозапись.', show: 'Показать заметки о содержании', hide: 'Скрыть заметки о содержании' },
  bg: { title: 'Бележки за съдържанието', scope: 'Отделни наблюдения върху текста. Тези бележки не дават възрастова оценка и не оценяват аудиозаписа.', show: 'Показване на бележките за съдържанието', hide: 'Скриване на бележките за съдържанието' },
};

/** @param {'en'|'ru'|'bg'} locale */
export function parentContentNotesCopy(locale) { return COPY[locale]; }
