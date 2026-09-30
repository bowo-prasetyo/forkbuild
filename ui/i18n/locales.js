// The languages the app ships, and how one is chosen.
//
// Each entry names a locale by its BCP 47 code, its name in its own language
// (so people can find theirs whatever is showing now), its text direction,
// and how to load its messages. English is loaded with the app because every
// other locale falls back to it; a translation is loaded only when chosen.
//
// To add a language, add ui/i18n/messages/<code>.js and an entry here; see
// docs/Translating.md.
import en from './messages/en.js';
import { pseudoLocalizeMessages } from './pseudoLocalize.js';

export const SOURCE_LOCALE = 'en';
export const PSEUDO_LOCALE = 'en-XA';

export const LOCALES = Object.freeze([
    Object.freeze({ code: 'en', name: 'English', dir: 'ltr', loadMessages: async () => en }),
    Object.freeze({ code: 'id', name: 'Bahasa Indonesia', dir: 'ltr', loadMessages: async () => (await import('./messages/id.js')).default }),
    Object.freeze({ code: 'ja', name: '日本語', dir: 'ltr', loadMessages: async () => (await import('./messages/ja.js')).default }),
    // Never chosen automatically: only for checking the app is ready for
    // translation (see pseudoLocalize.js). Intl formats it as English.
    Object.freeze({
        code: PSEUDO_LOCALE, name: 'Pseudo-locale (⟦Ƥšéüðö⟧)', dir: 'ltr', intlLocale: 'en', pseudo: true,
        loadMessages: async () => pseudoLocalizeMessages(en)
    })
]);

export const SOURCE_MESSAGES = en;

export function findLocale(code) {
    if (typeof code !== 'string') {
        return null;
    }
    const lower = code.toLowerCase();
    return LOCALES.find((locale) => locale.code.toLowerCase() === lower) || null;
}

// The locale to show: the saved choice when the app ships it, otherwise the
// first of the browser's languages it ships (exactly, e.g. "pt-BR", or by
// language, e.g. "en-GB" → "en"), otherwise English.
export function negotiateLocale(preference, browserLanguages = []) {
    const chosen = findLocale(preference);
    if (chosen) {
        return chosen.code;
    }
    const candidates = LOCALES.filter((locale) => !locale.pseudo);
    for (const language of browserLanguages || []) {
        if (typeof language !== 'string' || language === '') {
            continue;
        }
        const lower = language.toLowerCase();
        const exact = candidates.find((locale) => locale.code.toLowerCase() === lower);
        if (exact) {
            return exact.code;
        }
        const base = lower.split('-')[0];
        const sameLanguage = candidates.find((locale) => locale.code.toLowerCase().split('-')[0] === base);
        if (sameLanguage) {
            return sameLanguage.code;
        }
    }
    return SOURCE_LOCALE;
}
