import { Translator } from '../ui/i18n/Translator.js';
import { pseudoLocalize, pseudoLocalizeMessages } from '../ui/i18n/pseudoLocalize.js';
import { LOCALES, PSEUDO_LOCALE, SOURCE_LOCALE, SOURCE_MESSAGES, findLocale, negotiateLocale } from '../ui/i18n/locales.js';
import { applyDocumentLanguage, currentLocale, formatDate, formatNumber, setAppLocale, t } from '../ui/i18n/i18n.js';
import { DEFAULT_LANGUAGE_SETTINGS, normalizeLanguageSettings } from '../core/LanguageSettings.js';
import { LanguageSettingsStore } from '../application/settings/LanguageSettingsStore.js';
import LanguageSettingsView from '../ui/views/LanguageSettingsView.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { mountComponent } from './support/MinimalVueCompositionApiShim.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

const PLACEHOLDER = /\{([A-Za-z0-9_]+)\}/g;

function placeholders(text) {
    return [...text.matchAll(PLACEHOLDER)].map((match) => match[1]).sort();
}

// Messages: plain text, parameters, and numbers formatted for the locale.
{
    const translator = new Translator({
        locale: 'en',
        messages: { greeting: 'Hello, {name}', total: 'Total: {amount}', partial: '{a} and {b}' }
    });
    assert(translator.translate('greeting', { name: 'Ada' }) === 'Hello, Ada', 'a parameter is filled in');
    assert(translator.translate('total', { amount: 12345.5 }) === 'Total: 12,345.5', 'a number is formatted for the locale');
    assert(translator.translate('partial', { a: 'x' }) === 'x and {b}', 'a missing parameter stays visible');
    assert(translator.translate('greeting') === 'Hello, {name}', 'no parameters leaves every placeholder');

    const german = new Translator({ locale: 'de', messages: { total: 'Summe: {amount}' } });
    assert(german.translate('total', { amount: 12345.5 }) === 'Summe: 12.345,5', 'German groups and separates decimals its own way');
    console.log('✓ messages fill in parameters and format numbers for the locale');
}

// Plurals follow Intl.PluralRules for the locale, with exact matches first.
{
    const bricks = { '=0': 'No bricks', one: '{count} brick', other: '{count} bricks' };
    const english = new Translator({ locale: 'en', messages: { bricks } });
    assert(english.translate('bricks', { count: 0 }) === 'No bricks', 'an exact match wins');
    assert(english.translate('bricks', { count: 1 }) === '1 brick', 'one');
    assert(english.translate('bricks', { count: 2000 }) === '2,000 bricks', 'other, with the count formatted');
    assert(english.translate('bricks') === '{count} bricks', 'no count falls back to other');

    // Polish has distinct few and many forms; Indonesian has only other.
    const polish = new Translator({
        locale: 'pl',
        messages: { bricks: { one: '{count} klocek', few: '{count} klocki', many: '{count} klocków', other: '{count} klocka' } }
    });
    assert(polish.translate('bricks', { count: 1 }) === '1 klocek', 'Polish one');
    assert(polish.translate('bricks', { count: 3 }) === '3 klocki', 'Polish few');
    assert(polish.translate('bricks', { count: 5 }) === '5 klocków', 'Polish many');
    const indonesian = new Translator({ locale: 'id', messages: { bricks: { other: '{count} balok' } } });
    assert(indonesian.translate('bricks', { count: 1 }) === '1 balok', 'a locale with one form uses other');
    console.log('✓ plurals use the locale\'s own categories');
}

// A missing message falls back to English, then to the key, and is reported once.
{
    const missing = [];
    const translator = new Translator({
        locale: 'id',
        messages: { save: 'Simpan' },
        fallbackMessages: { save: 'Save', cancel: 'Cancel' },
        onMissing: (key, locale) => missing.push(`${locale}:${key}`)
    });
    assert(translator.translate('save') === 'Simpan', 'a translated message is used');
    assert(translator.translate('cancel') === 'Cancel', 'an untranslated message shows in English');
    assert(translator.translate('nowhere') === 'nowhere', 'an unknown key shows as itself');
    translator.translate('cancel');
    assert(JSON.stringify(missing) === JSON.stringify(['id:cancel', 'id:nowhere']), `each gap is reported once (got ${JSON.stringify(missing)})`);
    console.log('✓ missing messages fall back to English and are reported once');
}

// Dates are formatted for the locale.
{
    const moment = Date.UTC(2026, 8, 29, 12, 0, 0);
    const options = { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' };
    assert(new Translator({ locale: 'en', messages: {} }).formatDate(moment, options) === 'September 29, 2026', 'English date');
    assert(new Translator({ locale: 'id', messages: {} }).formatDate(new Date(moment), options) === '29 September 2026', 'Indonesian date');
    console.log('✓ dates are formatted for the locale');
}

// The pseudo-locale changes every letter, keeps placeholders, and is longer.
{
    const text = pseudoLocalize('Sound on for {name}');
    assert(text.startsWith('⟦') && text.endsWith('⟧'), 'bracketed');
    assert(!/[A-Za-z]/.test(text.replace('{name}', '')), `no plain letter remains outside placeholders (got ${text})`);
    assert(text.includes('{name}'), 'the placeholder is kept');
    assert(text.length > 'Sound on for {name}'.length * 1.2, 'about 30% longer');
    assert(pseudoLocalize('🔔') === '⟦🔔⟧', 'nothing to pad without letters');

    const messages = pseudoLocalizeMessages({ a: 'Save', b: { one: '{count} brick', other: '{count} bricks' } });
    assert(messages.b.one.includes('{count}') && messages.b.other.startsWith('⟦'), 'plural forms are pseudo-localized too');
    console.log('✓ the pseudo-locale accents, pads and brackets text, keeping placeholders');
}

// A key written twice in a messages file keeps only its last value, silently,
// so the file's text is checked rather than the object it builds.
{
    const { readFile } = await import('node:fs/promises');
    const source = await readFile(new URL('../ui/i18n/messages/en.js', import.meta.url), 'utf8');
    const seen = new Set();
    const repeated = [];
    for (const [, key] of source.matchAll(/^ {4}'([^']+)':/gm)) {
        if (seen.has(key)) repeated.push(key);
        seen.add(key);
    }
    assert(repeated.length === 0, `no English key is defined twice (repeated: ${repeated.join(', ')})`);
    console.log('✓ no English key is defined twice');
}

// Every shipped locale has exactly English's keys, placeholders and plural
// shapes, so no translation can drop or rename a parameter.
{
    for (const [key, message] of Object.entries(SOURCE_MESSAGES)) {
        assert(/^[a-z][A-Za-z0-9]*(\.[a-z][A-Za-z0-9]*)+$/.test(key), `"${key}" is a dotted camelCase key`);
        if (typeof message !== 'string') {
            assert(typeof message.other === 'string', `"${key}" has an other form`);
        }
    }
    const englishKeys = Object.keys(SOURCE_MESSAGES).sort();
    for (const locale of LOCALES) {
        const messages = await locale.loadMessages();
        const keys = Object.keys(messages).sort();
        const extra = keys.filter((key) => !(key in SOURCE_MESSAGES));
        assert(extra.length === 0, `${locale.code} has no keys English lacks (extra: ${extra.join(', ')})`);
        if (locale.pseudo) {
            assert(keys.length === englishKeys.length, 'the pseudo-locale covers every key');
        }
        for (const key of keys) {
            const source = SOURCE_MESSAGES[key];
            const translated = messages[key];
            assert(typeof translated === typeof source, `${locale.code} "${key}" has English's shape`);
            const sourceTexts = typeof source === 'string' ? [source] : Object.values(source);
            const translatedTexts = typeof translated === 'string' ? [translated] : Object.values(translated);
            // A plural form may leave the count out ("No bricks"), so each
            // form may use fewer of English's placeholders, never others.
            const allowed = new Set(sourceTexts.flatMap(placeholders));
            for (const text of translatedTexts) {
                const used = placeholders(text);
                assert(used.every((name) => allowed.has(name)), `${locale.code} "${key}" uses only English's placeholders`);
                if (typeof translated === 'string') {
                    assert(new Set(used).size === allowed.size, `${locale.code} "${key}" keeps every placeholder`);
                }
            }
            if (typeof translated !== 'string') {
                assert(typeof translated.other === 'string', `${locale.code} "${key}" has an other form`);
            }
        }
        assert(locale.dir === 'ltr' || locale.dir === 'rtl', `${locale.code} names its direction`);
    }
    console.log(`✓ every locale (${LOCALES.map((locale) => locale.code).join(', ')}) matches English's keys and placeholders`);
}

// Choosing the locale: the saved choice, else the browser's languages, else English.
{
    assert(negotiateLocale('en', ['fr']) === 'en', 'a shipped saved choice wins');
    assert(negotiateLocale(PSEUDO_LOCALE, ['en']) === PSEUDO_LOCALE, 'the pseudo-locale can be chosen');
    assert(negotiateLocale('xx', ['en-GB']) === 'en', 'an unshipped saved choice falls back to the browser');
    assert(negotiateLocale(null, ['en-GB', 'fr']) === 'en', 'a regional variant matches its language');
    assert(negotiateLocale(null, ['fr', 'sv']) === SOURCE_LOCALE, 'no shipped match shows English');
    assert(negotiateLocale(null, ['fr', 'de-CH']) === 'de', 'the first shipped language in the list wins');
    assert(negotiateLocale(null, undefined) === SOURCE_LOCALE, 'no browser languages shows English');
    assert(negotiateLocale(null, ['EN-xa']) === 'en', 'the pseudo-locale is never chosen from the browser');
    assert(findLocale('EN').code === 'en' && findLocale('zz') === null && findLocale(7) === null, 'codes match case-insensitively');
    console.log('✓ the locale is chosen from the saved setting, then the browser, then English');
}

// The saved setting is read leniently and kept on this device.
{
    assert(DEFAULT_LANGUAGE_SETTINGS.locale === null, 'by default the browser decides');
    for (const bad of [null, 'en', 42, [], { locale: 7 }, { locale: '<script>' }, { locale: 'english' }]) {
        assert(normalizeLanguageSettings(bad).locale === null, `${JSON.stringify(bad)} reads as the default`);
    }
    assert(normalizeLanguageSettings({ locale: 'pt-BR' }).locale === 'pt-BR', 'a locale code is kept');
    assert(Object.isFrozen(normalizeLanguageSettings({})), 'settings are immutable');

    const storage = new InMemoryStorageProvider();
    const store = new LanguageSettingsStore({ storageProvider: storage });
    assert(store.get().locale === null, 'nothing stored follows the browser');
    store.save({ locale: 'en-XA' });
    assert(new LanguageSettingsStore({ storageProvider: storage }).get().locale === 'en-XA', 'a new store reads the saved choice');
    store.save({ locale: null });
    assert(store.get().locale === null, 'following the browser again is saved');
    storage.save('language-settings', 'garbage');
    assert(store.get().locale === null, 'a damaged entry follows the browser');

    class ThrowingStorage extends StorageProvider {
        load() { throw new Error('unreadable'); }
    }
    assert(new LanguageSettingsStore({ storageProvider: new ThrowingStorage() }).get().locale === null, 'unreadable storage follows the browser');
    let refused = false;
    try {
        new LanguageSettingsStore({ storageProvider: {} });
    } catch {
        refused = true;
    }
    assert(refused, 'a StorageProvider is required');
    console.log('✓ the language setting is read leniently and kept on this device');
}

// The Language page saves the choice and reloads, and only then.
{
    const storage = new InMemoryStorageProvider();
    const languageSettingsStore = new LanguageSettingsStore({ storageProvider: storage });
    let reloads = 0;
    const view = mountComponent(LanguageSettingsView, { languageSettingsStore, reloadPage: () => { reloads += 1; } });
    assert(view.available, 'the page works with a store');
    assert(view.selected.value === view.AUTOMATIC, 'with nothing saved, the browser decides');
    assert(!view.changed.value, 'nothing to save yet');
    assert(view.languages.value.some((option) => option.value === 'en' && option.label === 'English'), 'English is listed by its own name');
    assert(!view.languages.value.some((option) => option.value === PSEUDO_LOCALE), 'the pseudo-locale is listed apart');
    assert(view.translatorLocales.value.some((option) => option.value === PSEUDO_LOCALE), '…under For translators');

    view.selected.value = PSEUDO_LOCALE;
    assert(view.changed.value, 'a different choice can be saved');
    view.save();
    assert(languageSettingsStore.get().locale === PSEUDO_LOCALE && reloads === 1, 'saving stores the choice and reloads');

    const reopened = mountComponent(LanguageSettingsView, { languageSettingsStore, reloadPage: () => { reloads += 1; } });
    assert(reopened.selected.value === PSEUDO_LOCALE, 'the page shows the saved choice');
    reopened.selected.value = reopened.AUTOMATIC;
    reopened.save();
    assert(languageSettingsStore.get().locale === null && reloads === 2, 'choosing the browser again clears the saved choice');

    const withoutStore = mountComponent(LanguageSettingsView, { reloadPage: () => { reloads += 1; } });
    withoutStore.save();
    assert(!withoutStore.available && reloads === 2, 'without a store the page saves nothing and never reloads');
    console.log('✓ the Language page saves the choice, then reloads');
}

// The app-wide translator: English until a locale is set, and the page is told.
{
    assert(currentLocale().code === SOURCE_LOCALE, 'English before any locale is set');
    assert(t('app.nav.home') === 'Home', 'English text');

    const unknown = await setAppLocale('xx');
    assert(unknown.code === SOURCE_LOCALE, 'an unknown locale leaves English in place');

    await setAppLocale(PSEUDO_LOCALE);
    assert(currentLocale().code === PSEUDO_LOCALE, 'the pseudo-locale is set');
    assert(t('app.nav.home') === pseudoLocalize('Home'), 'text comes from the pseudo-locale');
    assert(t('language.current', { language: 'English' }).includes('English'), 'parameters still fill in');
    assert(formatNumber(1234.5) === '1,234.5', 'numbers are formatted as English for the pseudo-locale');
    assert(formatDate(Date.UTC(2026, 0, 2), { month: 'short', timeZone: 'UTC' }) === 'Jan', 'dates too');

    const doc = { documentElement: { lang: '', dir: '' } };
    applyDocumentLanguage(doc);
    assert(doc.documentElement.lang === 'en' && doc.documentElement.dir === 'ltr', 'the page is marked as English, left to right');

    await setAppLocale(SOURCE_LOCALE);
    assert(t('app.nav.home') === 'Home', 'back to English');
    console.log('✓ the app-wide translator switches locale and marks the page');
}
