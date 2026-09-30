// What happens when the app's modules fail to download. The app is hundreds
// of unbundled modules; when the host drops or refuses even one request
// (GitHub Pages does this under a burst), the import that needed it fails.
// Chromium keeps that failure for the life of the page: importing again
// hands back the same error without asking the server, so retrying in the
// same page cannot help there. A new page can: it fetches the missing
// module again, and every module that did arrive comes back from the HTTP
// cache.
//
// So loadApp() reloads the page once when loading fails to download. The
// reload's time is kept in sessionStorage, and a second failure within a
// minute of it shows a message with a Reload button instead of reloading
// again, so a host that keeps failing never makes the page reload over and
// over; so does a failure when sessionStorage cannot be used. An error that
// is not a failed download (a bug in a module, storage that will not open)
// is not something a reload fixes, and is thrown as before.
//
// This file imports nothing, so it is there even when every other module
// failed: ui/boot.js imports it and nothing else.

const RELOADED_AT_KEY = 'forkbuild.reloadedAfterFailedLoadAt';
const RELOAD_WINDOW_MS = 60_000;

// What each browser rejects import() with when a module did not download:
// Chromium "Failed to fetch dynamically imported module: …", Firefox
// "error loading dynamically imported module: …", Safari "Importing a module
// script failed.".
export function isModuleLoadFailure(error) {
    return error instanceof TypeError
        && /dynamically imported module|importing a module script failed/i.test(String(error.message));
}

// Runs `load` (the app's own import). Resolves once it has loaded, or once
// a reload is under way, or once the failure message is showing.
export async function loadApp(load, {
    storage = sessionStorageOrNull(),
    now = Date.now,
    reload = () => window.location.reload(),
    showFailure = showLoadFailure
} = {}) {
    try {
        await load();
    } catch (error) {
        if (!isModuleLoadFailure(error)) throw error;
        if (claimReload(storage, now())) {
            console.warn('Loading the app failed; reloading the page to fetch what is missing.', error);
            reload();
            return;
        }
        console.error('Loading the app failed.', error);
        await showFailure();
        return;
    }
    forgetReload(storage);
}

// True, after recording the reload, when no reload for a failed load was
// made within the last minute. False when one was, or nothing can record it.
function claimReload(storage, time) {
    if (!storage) return false;
    try {
        const last = Number(storage.getItem(RELOADED_AT_KEY));
        if (last && time - last >= 0 && time - last < RELOAD_WINDOW_MS) return false;
        storage.setItem(RELOADED_AT_KEY, String(time));
        return true;
    } catch {
        return false;
    }
}

function forgetReload(storage) {
    try {
        storage?.removeItem(RELOADED_AT_KEY);
    } catch {
        // Nothing to forget where storage cannot be used.
    }
}

function sessionStorageOrNull() {
    try {
        return globalThis.sessionStorage ?? null;
    } catch {
        return null;
    }
}

// Replaces the blank page with a message and a Reload button, in the
// chosen language when the translations loaded, else in English: this runs
// when modules failed to download, and those may include the translations.
export async function showLoadFailure({ container = document.getElementById('app'), reload = () => window.location.reload() } = {}) {
    let message = 'ForkBuild couldn\'t finish loading. Check your connection, then reload the page.';
    let button = 'Reload';
    try {
        const { t } = await import('./i18n/i18n.js');
        message = t('app.loadFailed');
        button = t('app.loadFailedReload');
    } catch {
        // The translations are among what did not download; English it is.
    }
    const notice = document.createElement('div');
    notice.className = 'load-failure';
    notice.setAttribute('role', 'alert');
    const text = document.createElement('p');
    text.textContent = message;
    const action = document.createElement('button');
    action.type = 'button';
    action.textContent = button;
    action.addEventListener('click', () => reload());
    notice.append(text, action);
    container.replaceChildren(notice);
}
