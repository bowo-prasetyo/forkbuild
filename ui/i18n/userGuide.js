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

// The folder of a locale's guide, as this site serves it (Help reads it).
export function userGuideDirectory(code) {
    return userGuidePath(code).replace(/\/README\.md$/, '');
}

// A section of a locale's guide on GitHub, by its chapter file and anchor.
export function userGuideSectionUrl(code, file, anchor) {
    return `${REPOSITORY_URL}/${userGuideDirectory(code)}/${file}${anchor ? `#${anchor}` : ''}`;
}

export function userGuideUrl(code) {
    return `${REPOSITORY_URL}/${userGuidePath(code)}`;
}

// docs/Privacy.md, or its translation for a locale that has one.
export function privacyPageUrl(code) {
    const locale = findLocale(code);
    if (!locale || locale.pseudo || locale.code === SOURCE_LOCALE) {
        return `${REPOSITORY_URL}/docs/Privacy.md`;
    }
    return `${REPOSITORY_URL}/docs/user/${locale.code}/Privacy.md`;
}
