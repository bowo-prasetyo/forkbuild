// @environment browser
import { createApp, nextTick } from 'vue';
import VisitorCountSetting from '../ui/components/VisitorCountSetting.js';
import { VisitorCountSettingsStore } from '../application/settings/VisitorCountSettingsStore.js';
import { VISITOR_COUNT_DASHBOARD_URL } from '../core/VisitorCount.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// The daily visitor count's switch on the Your Data page, rendered by real
// Vue: on by default, saved the moment it changes, and locked off for a
// browser that asks sites not to track it.

function mount(store, privacySignalSource = {}) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp(VisitorCountSetting);
    if (store) app.provide('visitorCountSettingsStore', store);
    app.provide('privacySignalSource', privacySignalSource);
    app.mount(host);
    return { host, unmount: () => { app.unmount(); host.remove(); } };
}

// On by default; turning it off is saved at once, and so is turning it back on.
{
    const storage = new InMemoryStorageProvider();
    const store = new VisitorCountSettingsStore({ storageProvider: storage });
    const { host, unmount } = mount(store);
    const toggle = host.querySelector('.visitor-count-toggle');
    assert(toggle && toggle.checked && !toggle.disabled, 'the switch starts on and can be changed');
    assert(!host.querySelector('.visitor-count-blocked'), 'no privacy-signal note');
    const dashboard = [...host.querySelectorAll('a')].find((link) => link.href === VISITOR_COUNT_DASHBOARD_URL);
    assert(dashboard, 'the page links to the public dashboard');
    assert(/Privacy\.md$/.test([...host.querySelectorAll('a')].map((link) => link.href).join(' ')), 'and to the privacy page');

    toggle.click();
    await nextTick();
    assert(new VisitorCountSettingsStore({ storageProvider: storage }).get().enabled === false, 'turning it off is saved');
    toggle.click();
    await nextTick();
    assert(store.get().enabled === true, 'turning it back on is saved');
    unmount();
    console.log('✓ the switch saves as it changes');
}

// A saved "off" shows as off.
{
    const store = new VisitorCountSettingsStore({ storageProvider: new InMemoryStorageProvider() });
    store.setEnabled(false);
    const { host, unmount } = mount(store);
    assert(!host.querySelector('.visitor-count-toggle').checked, 'a saved choice is shown');
    unmount();
    console.log('✓ the saved choice is shown');
}

// Global Privacy Control or Do Not Track: shown off, locked, and why.
for (const signals of [{ globalPrivacyControl: true }, { doNotTrack: '1' }]) {
    const store = new VisitorCountSettingsStore({ storageProvider: new InMemoryStorageProvider() });
    const { host, unmount } = mount(store, signals);
    const toggle = host.querySelector('.visitor-count-toggle');
    assert(!toggle.checked && toggle.disabled, `${JSON.stringify(signals)}: the switch is off and locked`);
    assert(host.querySelector('.visitor-count-blocked'), `${JSON.stringify(signals)}: the page says why`);
    unmount();
}
console.log('✓ privacy signals lock the switch off');

// Without a store (as in a test harness), the section is not shown.
{
    const { host, unmount } = mount(null);
    assert(!host.querySelector('.visitor-count-setting'), 'nothing to show without a store');
    unmount();
}

console.log('\n✅ All VisitorCountSetting browser tests passed.');
