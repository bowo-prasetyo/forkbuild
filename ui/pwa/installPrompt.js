// Installing ForkBuild as an app: the browser's own install prompt, kept from
// the moment the browser offers it (ui/start.js calls watchInstallPrompt()
// first thing, since the offer can come before the app has loaded), and
// whether ForkBuild already runs installed. Where a browser makes no offer
// but can still add the site to the home screen (Safari on iPhone and
// iPad), the button says how instead. No Vue here, so start.js can import it
// before the app.

const listeners = new Set();
let deferred = null;
let installedNow = false;
let watching = false;

export const InstallMethod = Object.freeze({
    PROMPT: 'prompt',
    HOME_SCREEN: 'home-screen',
    NONE: 'none'
});

export function watchInstallPrompt(win = window) {
    if (watching) return;
    watching = true;
    win.addEventListener('beforeinstallprompt', (event) => {
        event.preventDefault();
        deferred = event;
        notify();
    });
    win.addEventListener('appinstalled', () => {
        deferred = null;
        installedNow = true;
        notify();
    });
}

// `{ installed, method }`: whether ForkBuild runs as an installed app (or was
// just installed), and how this browser can install it.
export function installState(win = window) {
    const installed = installedNow || runsInstalled(win);
    if (installed) return Object.freeze({ installed: true, method: InstallMethod.NONE });
    if (deferred) return Object.freeze({ installed: false, method: InstallMethod.PROMPT });
    return Object.freeze({ installed: false, method: addsToHomeScreen(win.navigator) ? InstallMethod.HOME_SCREEN : InstallMethod.NONE });
}

// Shows the browser's prompt. Resolves to 'accepted', 'dismissed' or
// 'unavailable'. A prompt can be shown once, so it is forgotten either way.
export async function promptInstall() {
    const event = deferred;
    if (!event) return 'unavailable';
    deferred = null;
    notify();
    try {
        await event.prompt();
        const choice = await event.userChoice;
        return choice?.outcome === 'accepted' ? 'accepted' : 'dismissed';
    } catch {
        return 'unavailable';
    }
}

export function onInstallStateChange(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function notify() {
    for (const listener of listeners) {
        try {
            listener();
        } catch {
            // One listener failing never stops another.
        }
    }
}

function runsInstalled(win) {
    try {
        return win.matchMedia?.('(display-mode: standalone)').matches === true || win.navigator?.standalone === true;
    } catch {
        return false;
    }
}

// Safari on iPhone and iPad: Share, then Add to Home Screen. (Other iOS
// browsers can do it too, but say so differently; Safari is named.)
export function addsToHomeScreen(nav) {
    const agent = typeof nav?.userAgent === 'string' ? nav.userAgent : '';
    const appleMobile = /iPhone|iPad|iPod/.test(agent) || (/Macintosh/.test(agent) && Number(nav?.maxTouchPoints) > 1);
    return appleMobile && /Safari\//.test(agent) && !/CriOS|FxiOS|EdgiOS/.test(agent);
}

// For tests: forget everything.
export function resetInstallPromptForTests() {
    deferred = null;
    installedNow = false;
    listeners.clear();
    watching = false;
}
