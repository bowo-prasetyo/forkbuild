import { openBrowserStorage } from '../storage/openBrowserStorage.js';
import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { LanguageSettingsStore } from '../application/settings/LanguageSettingsStore.js';
import { applyDocumentLanguage, setAppLocale } from './i18n/i18n.js';
import { negotiateLocale } from './i18n/locales.js';
import { importWithRetry } from './importWithRetry.js';

// The page's entry point. Storage is opened first because every store
// reads it synchronously (see storage/IndexedDbStorageBackend.js); the
// app is imported only after that, so none of its modules can read
// storage before it is ready.
await openBrowserStorage();
await chooseLanguage();
// The app's shell; each page's modules load when it is first opened
// (ui/router/index.js).
await importWithRetry(() => import('./main.js'));

// Also before the app's modules are imported, so text any of them builds
// while loading is already in the chosen language.
async function chooseLanguage() {
    const { locale } = new LanguageSettingsStore({ storageProvider: new LocalStorageProvider() }).get();
    await setAppLocale(negotiateLocale(locale, navigator.languages));
    applyDocumentLanguage(document);
}
