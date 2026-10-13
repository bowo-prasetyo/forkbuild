// @environment browser
import { createApp, nextTick } from 'vue';
import LookChoice from '../ui/components/LookChoice.js';
import { applyLook } from '../ui/look.js';
import { LookSettingsStore } from '../application/settings/LookSettingsStore.js';
import { LOOK } from '../core/LookSettings.js';
import { assert } from './support/Assert.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';

// The village after dark (css/main/theme.css), with the shipped CSS in a real
// browser: choosing Dark turns the page, its panels and its words dark and
// light, choosing Light keeps them light whatever the device is set to, and
// the look picker under More → App does it at once and remembers it.

await new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/css/main.css';
    link.onload = resolve;
    link.onerror = () => reject(new Error('css/main.css failed to load'));
    document.head.appendChild(link);
});

const meta = document.createElement('meta');
meta.name = 'theme-color';
meta.setAttribute('media', '(prefers-color-scheme: light)');
document.head.appendChild(meta);

const luminance = (rgb) => {
    const [r, g, b] = rgb.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number)
        .map((c) => c / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
    const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (high + 0.05) / (low + 0.05);
};

const card = document.createElement('div');
card.className = 'world-view-sound';
card.innerHTML = '<button class="action-btn world-view-sound-toggle">Sound</button>';
document.body.appendChild(card);

function looks() {
    const body = getComputedStyle(document.body);
    return {
        page: body.backgroundColor,
        words: body.color,
        scheme: getComputedStyle(document.documentElement).colorScheme,
        panel: getComputedStyle(card).backgroundColor
    };
}

// Chosen dark, chosen light.
{
    applyLook(document, LOOK.DARK);
    const dark = looks();
    assert(document.documentElement.dataset.look === 'dark', 'Dark is put on the page');
    assert(luminance(dark.page) < 0.03 && luminance(dark.words) > 0.7, `a dark page with light words (${dark.page}, ${dark.words})`);
    assert(ratio(dark.page, dark.words) > 12, 'and they read well');
    assert(dark.scheme === 'dark', 'the browser\'s own controls go dark too');
    assert(luminance(dark.panel) < 0.05, `a panel over the 3D view is dark too (${dark.panel})`);
    assert(meta.getAttribute('content') === '#1c1712', 'the browser bar takes the dark paper');

    applyLook(document, LOOK.LIGHT);
    const light = looks();
    assert(luminance(light.page) > 0.8 && luminance(light.words) < 0.03, `Light is the village by day (${light.page})`);
    assert(light.scheme === 'light' && meta.getAttribute('content') === '#f6efe2', 'with light controls and bar');

    applyLook(document, LOOK.AUTO);
    assert(!('look' in document.documentElement.dataset), 'Auto leaves it to the device');
    const auto = looks();
    const deviceDark = matchMedia('(prefers-color-scheme: dark)').matches;
    assert((luminance(auto.page) < 0.1) === deviceDark, `Auto follows the device (dark: ${deviceDark}, ${auto.page})`);
    console.log('✓ Dark turns the page, panels, controls and bar dark; Light keeps them light; Auto follows the device');
}

// The picker.
{
    const storage = new InMemoryStorageProvider();
    const store = new LookSettingsStore({ storageProvider: storage });
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp({ components: { LookChoice }, template: '<LookChoice />' });
    app.provide('lookSettingsStore', store);
    app.provide('documentRef', document);
    app.mount(host);
    await nextTick();
    const buttons = [...host.querySelectorAll('.look-choice-option')];
    assert(buttons.length === 3 && buttons[0].getAttribute('aria-pressed') === 'true', 'three choices, Auto first and chosen');
    buttons[2].click();
    await nextTick();
    assert(document.documentElement.dataset.look === 'dark' && buttons[2].getAttribute('aria-pressed') === 'true', 'Dark applies at once');
    assert(store.get().look === LOOK.DARK, 'and is kept on this device');
    buttons[0].click();
    await nextTick();
    assert(!('look' in document.documentElement.dataset) && store.get().look === LOOK.AUTO, 'Auto goes back to the device');
    app.unmount();
    host.remove();
    console.log('✓ the look picker applies a choice at once and keeps it');
}
