// The app's one translator. Components import t() (and the formatters) from
// here and expose it to their template; it answers in English until
// setAppLocale() runs, which is what component tests that mount a component
// on its own see.
//
// ui/boot.js sets the locale before the app's modules are imported, so text
// is in the chosen language from the first render. The locale is not
// switched while the app runs: changing it saves the choice and reloads the
// page (see ui/views/LanguageSettingsView.js), so no text computed earlier is
// left in the old language.
import { Translator } from './Translator.js';
import { isMessage } from '../../core/Message.js';
import { isUserFacingError } from '../../core/UserFacingError.js';
import { LOCALES, SOURCE_LOCALE, SOURCE_MESSAGES, findLocale } from './locales.js';

function reportMissing(key, locale) {
    console.warn(`[i18n] "${key}" has no ${locale} message.`);
}

let translator = new Translator({ locale: SOURCE_LOCALE, messages: SOURCE_MESSAGES, onMissing: reportMissing });

// `t('app.nav.home')`, `t('language.current', { language })`, or a message
// descriptor from core/ or application/ (core/Message.js): `t(message)`.
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

export function currentLocale() {
    return findLocale(translator.locale);
}

export function availableLocales() {
    return LOCALES;
}

// Loads `code`'s messages and makes it the app's locale. An unknown code, or
// one whose messages fail to load, leaves English in place.
export async function setAppLocale(code) {
    const locale = findLocale(code);
    if (!locale) {
        return currentLocale();
    }
    try {
        const messages = await locale.loadMessages();
        translator = new Translator({
            locale: locale.code,
            intlLocale: locale.intlLocale || locale.code,
            messages,
            fallbackMessages: SOURCE_MESSAGES,
            onMissing: reportMissing
        });
    } catch (error) {
        console.warn(`[i18n] Could not load ${locale.code}; showing English.`, error);
    }
    return currentLocale();
}

// Tells the browser (and screen readers, spell checkers and CSS) which
// language and direction the page is in.
export function applyDocumentLanguage(doc) {
    const locale = currentLocale();
    doc.documentElement.lang = locale.intlLocale || locale.code;
    doc.documentElement.dir = locale.dir;
}
