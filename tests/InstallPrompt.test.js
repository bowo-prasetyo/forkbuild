// Installing ForkBuild as an app (ui/pwa/installPrompt.js): the browser's own
// offer, kept from when it comes, shown once; how Safari on an iPhone or iPad
// does it instead; and nothing once ForkBuild runs installed.
import {
    InstallMethod, addsToHomeScreen, installState, onInstallStateChange, promptInstall, resetInstallPromptForTests, watchInstallPrompt
} from '../ui/pwa/installPrompt.js';
import { assert } from './support/Assert.js';

function fakeWindow({ standalone = false, userAgent = 'Mozilla/5.0 (X11; Linux x86_64) Chrome/130 Safari/537.36', maxTouchPoints = 0 } = {}) {
    const handlers = {};
    return {
        navigator: { userAgent, maxTouchPoints },
        matchMedia: (query) => ({ matches: standalone && query === '(display-mode: standalone)' }),
        addEventListener: (type, handler) => { handlers[type] = handler; },
        fire: (type, event = {}) => handlers[type](event)
    };
}

// The browser's offer is kept, offered once, and gone once installed.
{
    resetInstallPromptForTests();
    const win = fakeWindow();
    watchInstallPrompt(win);
    assert(installState(win).method === InstallMethod.NONE && !installState(win).installed, 'no offer yet, nothing to show');
    let changes = 0;
    onInstallStateChange(() => { changes++; });
    let prevented = false;
    let prompted = 0;
    win.fire('beforeinstallprompt', {
        preventDefault: () => { prevented = true; },
        prompt: async () => { prompted++; },
        userChoice: Promise.resolve({ outcome: 'accepted' })
    });
    assert(prevented, 'the browser\'s own mini-bar is held back, so ForkBuild offers it where it fits');
    assert(installState(win).method === InstallMethod.PROMPT && changes === 1, 'the offer is kept, and listeners hear of it');
    assert(await promptInstall() === 'accepted' && prompted === 1, 'Install shows the browser\'s prompt');
    assert(installState(win).method === InstallMethod.NONE, 'a prompt is shown once');
    assert(await promptInstall() === 'unavailable', 'and can\'t be shown again');
    win.fire('appinstalled');
    assert(installState(win).installed === true, 'once installed, there is nothing to offer');
    console.log('✓ the browser\'s offer is kept, shown once, and gone once installed');
}

// Already running installed: nothing to offer.
{
    resetInstallPromptForTests();
    const win = fakeWindow({ standalone: true });
    watchInstallPrompt(win);
    assert(installState(win).installed === true && installState(win).method === InstallMethod.NONE, 'running as an app offers nothing');
    console.log('✓ running as an installed app offers nothing');
}

// Safari on an iPhone or iPad says how; other iOS browsers and desktops don't.
{
    const iphoneSafari = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
    const iphoneChrome = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1';
    const ipadDesktopMode = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
    assert(addsToHomeScreen({ userAgent: iphoneSafari }), 'Safari on an iPhone');
    assert(addsToHomeScreen({ userAgent: ipadDesktopMode, maxTouchPoints: 5 }), 'Safari on an iPad, which says it is a Mac');
    assert(!addsToHomeScreen({ userAgent: ipadDesktopMode, maxTouchPoints: 0 }), 'not Safari on a Mac');
    assert(!addsToHomeScreen({ userAgent: iphoneChrome }), 'not Chrome on an iPhone, which words it differently');
    resetInstallPromptForTests();
    const win = fakeWindow({ userAgent: iphoneSafari });
    watchInstallPrompt(win);
    assert(installState(win).method === InstallMethod.HOME_SCREEN, 'Safari on an iPhone gets the Add to Home Screen hint');
    console.log('✓ Safari on an iPhone or iPad is told how to add it to the home screen');
}
