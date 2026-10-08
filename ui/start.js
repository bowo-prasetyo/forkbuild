import { openBrowserStorage } from '../storage/openBrowserStorage.js';
import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { LanguageSettingsStore } from '../application/settings/LanguageSettingsStore.js';
import { VisitorCountSettingsStore } from '../application/settings/VisitorCountSettingsStore.js';
import { countDailyVisit } from '../application/settings/CountDailyVisit.js';
import { countLaunchChannel } from '../application/settings/CountLaunchChannel.js';
import { addressWithoutLaunchChannel } from '../core/LaunchChannel.js';
import { applyDocumentLanguage, setAppLocale } from './i18n/i18n.js';
import { negotiateLocale } from './i18n/locales.js';
import { importWithRetry } from './importWithRetry.js';
import { browserPrivacySignals, sendCounterHit } from './counterHit.js';
import { watchInstallPrompt } from './pwa/installPrompt.js';

// Starts the app; ui/boot.js imports it. Storage is opened first because
// every store reads it synchronously (see storage/IndexedDbStorageBackend.js);
// the app is imported only after that, so none of its modules can read
// storage before it is ready. The browser's offer to install ForkBuild is
// listened for first, since it can come before the app has loaded.
watchInstallPrompt();
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
// request a day, with no referrer, from the official site only; and, for a
// visit through a launch post's link (`?ref=<channel>`), which channel it
// was. The parameter is then taken out of the address, so a reload or a
// copied address doesn't count it again. Not waited for.
function countVisit() {
    const settingsStore = new VisitorCountSettingsStore({ storageProvider: new LocalStorageProvider() });
    const counting = { settingsStore, origin: window.location.origin, privacySignals: browserPrivacySignals(), sendHit: sendCounterHit };
    countDailyVisit(counting);
    countLaunchChannel({ ...counting, search: window.location.search });
    const address = addressWithoutLaunchChannel(window.location.href);
    if (address) {
        try {
            history.replaceState(history.state, '', address);
        } catch {
            // The address keeps the parameter; nothing else depends on it.
        }
    }
}
