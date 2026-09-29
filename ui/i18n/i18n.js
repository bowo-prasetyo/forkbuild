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
import { LOCALES, SOURCE_LOCALE, SOURCE_MESSAGES, findLocale } from './locales.js';

function reportMissing(key, locale) {
    console.warn(`[i18n] "${key}" has no ${locale} message.`);
}

let translator = new Translator({ locale: SOURCE_LOCALE, messages: SOURCE_MESSAGES, onMissing: reportMissing });

export function t(key, params) {
    return translator.translate(key, params);
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
