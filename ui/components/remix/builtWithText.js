import { normalizeBuiltWith } from '../../../core/BuiltWith.js';
import { intlLocale, t } from '../../i18n/i18n.js';

// The friends who built a build with its author (core/BuiltWith.js), as one
// phrase in the app's language: "Kim, Sam and Lee". Empty for none.
export function builtWithNames(list) {
    const names = normalizeBuiltWith(list).map((entry) => entry.name || t('builtWith.someone'));
    if (names.length === 0) return '';
    try {
        return new Intl.ListFormat(intlLocale(), { type: 'conjunction' }).format(names);
    } catch {
        return names.join(', ');
    }
}
