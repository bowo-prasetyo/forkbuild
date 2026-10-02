import { openBrowserStorage } from '../storage/openBrowserStorage.js';
import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { LanguageSettingsStore } from '../application/settings/LanguageSettingsStore.js';
import { VisitorCountSettingsStore } from '../application/settings/VisitorCountSettingsStore.js';
import { countDailyVisit } from '../application/settings/CountDailyVisit.js';
import { applyDocumentLanguage, setAppLocale } from './i18n/i18n.js';
import { negotiateLocale } from './i18n/locales.js';
import { importWithRetry } from './importWithRetry.js';

// Starts the app; ui/boot.js imports it. Storage is opened first because
// every store reads it synchronously (see storage/IndexedDbStorageBackend.js);
// the app is imported only after that, so none of its modules can read
// storage before it is ready.
await openBrowserStorage();
await chooseLanguage();
countVisit();
// The app's shell; each page's modules load when it is first opened
// (ui/router/index.js). Tried again briefly, for browsers that fetch a
// failed module again; if it still fails, ui/boot.js reloads the page
// (ui/loadRecovery.js).
await importWithRetry(() => import('./main.js'), [500, 1500]);

// Also before the app's modules are imported, so text any of them builds
// while loading is already in the chosen language.
async function chooseLanguage() {
    const { locale } = new LanguageSettingsStore({ storageProvider: new LocalStorageProvider() }).get();
    await setAppLocale(negotiateLocale(locale, navigator.languages));
    applyDocumentLanguage(document);
}

// The daily visitor count (docs/Privacy.md, "Visitor count"): one image
// request a day, with no referrer, from the official site only. Not waited
// for.
function countVisit() {
    countDailyVisit({
        settingsStore: new VisitorCountSettingsStore({ storageProvider: new LocalStorageProvider() }),
        origin: window.location.origin,
        privacySignals: { globalPrivacyControl: navigator.globalPrivacyControl, doNotTrack: navigator.doNotTrack || window.doNotTrack },
        sendHit(url) {
            const image = new Image();
            image.referrerPolicy = 'no-referrer';
            image.src = url;
        }
    });
}
