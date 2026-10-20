// This device's language choice: a locale code the user picked, or null to
// follow the browser's languages. Read leniently, so a damaged value means
// "follow the browser" rather than breaking startup. Whether the code names a
// language the app actually ships is decided when it is resolved (ui/i18n/),
// so a choice whose translation is later removed also falls back.
const LOCALE_CODE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

export function isLocaleCode(value) {
    return typeof value === 'string' && LOCALE_CODE.test(value);
}

export function normalizeLanguageSettings(value) {
    const source = value && typeof value === 'object' ? value : {};
    return Object.freeze({ locale: isLocaleCode(source.locale) ? source.locale : null });
}

export const DEFAULT_LANGUAGE_SETTINGS = normalizeLanguageSettings({});
