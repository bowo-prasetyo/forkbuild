// The app's one translator. Components import t() (and the formatters) from
// here and expose it to their template. It has no messages until
// setAppLocale() loads a locale's, so every entry point sets one first:
// ui/start.js and ui/embed/embedBoot.js before anything is drawn, and the
// tests (tests/support/NodePreload.mjs, tests/run-browser.mjs) English before
// each test file, which is what component tests that mount a component on
// their own see.
//
// ui/start.js sets the locale before the app's modules are imported, so text
// is in the chosen language from the first render. The locale is not
// switched while the app runs: changing it saves the choice and reloads the
// page (see ui/views/LanguageSettingsView.js), so no text computed earlier is
// left in the old language.
import { Translator } from './Translator.js';
import { isMessage } from '../../core/app/Message.js';
import { isUserFacingError } from '../../core/app/UserFacingError.js';
import { LOCALES, SOURCE_LOCALE, findLocale } from './locales.js';

function reportMissing(key, locale) {
    console.warn(`[i18n] "${key}" has no ${locale} message.`);
}

let translator = new Translator({ locale: SOURCE_LOCALE, messages: {}, onMissing: reportMissing });

// `t('app.nav.home')`, `t('language.current', { language })`, or a message
// descriptor from core/ or application/ (core/app/Message.js): `t(message)`.
export function t(keyOrMessage, params) {
    if (isMessage(keyOrMessage)) {
        return translator.translate(keyOrMessage.key, keyOrMessage.params);
    }
    return translator.translate(keyOrMessage, params);
}

// For a value that may be a descriptor or text that is already final (a
// title someone wrote, or text not yet moved to messages): descriptors are
// translated, strings shown as they are, and nothing stays nothing.
export function displayText(value) {
    if (isMessage(value)) {
        return t(value);
    }
    return value === null || value === undefined ? value : String(value);
}

// What to tell a person about `error`: its message in their language when it
// is a UserFacingError, otherwise its own text, or `fallback` when it has none.
export function errorText(error, fallback = '') {
    if (isUserFacingError(error)) {
        return t(error.userMessage);
    }
    return (error && error.message) || (typeof error === 'string' ? error : fallback);
}

// Whether a message exists, for text looked up by an id that only some items
// have messages for (see ui/i18n/libraryText.js).
export function hasMessage(key) {
    return translator.has(key);
}

export function formatNumber(value, options) {
    return translator.formatNumber(value, options);
}

export function formatDate(value, options) {
    return translator.formatDate(value, options);
}

// The Intl locale the app formats with (a pseudo-locale formats as English).
export function intlLocale() {
    return translator.intlLocale;
}

export function currentLocale() {
    return findLocale(translator.locale);
}

export function availableLocales() {
    return LOCALES;
}

// Loads `code`'s messages and makes it the app's locale. An unknown code
// changes nothing; a translation whose messages fail to load is replaced by
// English, and when English fails to load too, so does this (the app's
// modules did not download: ui/loadRecovery.js takes it from there).
export async function setAppLocale(code) {
    const locale = findLocale(code);
    if (!locale) {
        return currentLocale();
    }
    try {
        await useLocale(locale);
    } catch (error) {
        if (locale.code === SOURCE_LOCALE) throw error;
        console.warn(`[i18n] Could not load ${locale.code}; showing English.`, error);
        await useLocale(findLocale(SOURCE_LOCALE));
    }
    return currentLocale();
}

// Starts downloading `code`'s messages without waiting for them, for a
// locale setAppLocale() is likely to be asked for soon: it then reuses this
// download. A failure here is left for setAppLocale() to meet.
export function preloadLocale(code) {
    const locale = findLocale(code);
    if (locale) locale.loadMessages().catch(() => {});
}

async function useLocale(locale) {
    const messages = await locale.loadMessages();
    translator = new Translator({ locale: locale.code, intlLocale: locale.intlLocale || locale.code, messages, onMissing: reportMissing });
}

// Tells the browser (and screen readers, spell checkers and CSS) which
// language and direction the page is in.
export function applyDocumentLanguage(doc) {
    const locale = currentLocale();
    doc.documentElement.lang = locale.intlLocale || locale.code;
    doc.documentElement.dir = locale.dir;
}
