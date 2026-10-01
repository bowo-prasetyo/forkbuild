// Where the user guide for a locale lives. Each shipped translation has its
// own copy under docs/user/<code>/ (see docs/Translating.md); English, and
// the pseudo-locale (which reads as English), use docs/user/ itself.
import { SOURCE_LOCALE, findLocale } from './locales.js';

export const REPOSITORY_URL = 'https://github.com/bowo-prasetyo/forkbuild/blob/main';

export function userGuidePath(code) {
    const locale = findLocale(code);
    if (!locale || locale.pseudo || locale.code === SOURCE_LOCALE) {
        return 'docs/user/README.md';
    }
    return `docs/user/${locale.code}/README.md`;
}

export function userGuideUrl(code) {
    return `${REPOSITORY_URL}/${userGuidePath(code)}`;
}
