import { normalizeBuiltWith } from '../../../core/catalog/BuiltWith.js';
import { intlLocale, t } from '../../i18n/i18n.js';

// The friends who built a build with its author (core/catalog/BuiltWith.js), as one
// phrase in the app's language: "Kim, Sam and Lee". Empty for none.
export function builtWithNames(list) {
    return builtWithParts(list).map((part) => part.text).join('');
}

// The same phrase in pieces, so each name can be a link: `{ text, entry }`
// for a name (entry: its credit), `{ text }` for the words between.
export function builtWithParts(list) {
    const entries = normalizeBuiltWith(list);
    const names = entries.map((entry) => entry.name || t('builtWith.someone'));
    if (names.length === 0) return [];
    let pieces;
    try {
        pieces = new Intl.ListFormat(intlLocale(), { type: 'conjunction' }).formatToParts(names);
    } catch {
        pieces = names.flatMap((name, index) => (index ? [{ type: 'literal', value: ', ' }, { type: 'element', value: name }] : [{ type: 'element', value: name }]));
    }
    let next = 0;
    return pieces.map((piece) => (piece.type === 'element' ? { text: piece.value, entry: entries[next++] } : { text: piece.value }));
}

// The page of the person behind a credit or a signature (ui/views/
// BuilderView.js), or null when there is no identity to go by.
export function builderRoute(identityId, name = null) {
    if (typeof identityId !== 'string' || !identityId) return null;
    return { path: `/builder/${encodeURIComponent(identityId)}`, ...(name ? { query: { name } } : {}) };
}
