// @environment browser
import { createApp, nextTick } from 'vue';
import NetworkSettingsView from '../ui/views/NetworkSettingsView.js';
import DecentralizedPublicationsView from '../ui/views/DecentralizedPublicationsView.js';
import { PublicationResolutionOutcome } from '../application/publication/PublicationResolutionOutcome.js';
import { ExperimentalToolsSettingsStore } from '../application/settings/ExperimentalToolsSettingsStore.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// Show experimental tools (docs/Pillars.md, "Infrastructure, kept out of
// sight"), rendered by real Vue: off until turned on, saved the moment it
// changes on Network Settings, and while off, Network Settings leaves out the
// Experimental pages and the Publications page leaves out its Wallet, Archive
// & Publisher Tools, pointing to Network Settings instead. A card's step that
// needs the tools still opens them for that visit.

const RouterLinkStub = { props: ['to'], template: '<a :href="to"><slot /></a>' };

async function settle() {
    for (let i = 0; i < 20; i += 1) {
        await nextTick();
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
}

function mount(component, provide) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp(component);
    app.config.warnHandler = () => {};
    app.component('router-link', RouterLinkStub);
    provide(app);
    app.mount(host);
    return { host, unmount: () => { app.unmount(); host.remove(); } };
}

// The store: off by default, and a saved choice is read back.
{
    const storage = new InMemoryStorageProvider();
    assert(new ExperimentalToolsSettingsStore({ storageProvider: storage }).get().shown === false, 'off by default');
    new ExperimentalToolsSettingsStore({ storageProvider: storage }).setShown(true);
    assert(new ExperimentalToolsSettingsStore({ storageProvider: storage }).get().shown === true, 'turning it on is saved');
    storage.save('experimental-tools-settings', { shown: 'yes' });
    assert(new ExperimentalToolsSettingsStore({ storageProvider: storage }).get().shown === false, 'anything but true reads as off');
    console.log('✓ the setting is off until turned on, and saved');
}

// Network Settings: the switch lists the Experimental pages and saves at once.
{
    const store = new ExperimentalToolsSettingsStore({ storageProvider: new InMemoryStorageProvider() });
    const { host, unmount } = mount(NetworkSettingsView, (app) => app.provide('experimentalToolsSettingsStore', store));
    const bitcoinRow = () => host.querySelector('a[href="/settings/bitcoin-esplora"]');
    const toggle = host.querySelector('.experimental-tools-toggle');
    assert(toggle && !toggle.checked, 'the switch starts off');
    assert(!bitcoinRow(), 'the Experimental Bitcoin Endpoint page is not listed');
    assert(host.querySelector('a[href="/settings/nostr-relay"]'), 'regular pages are listed');

    toggle.click();
    await nextTick();
    assert(store.get().shown === true, 'turning it on is saved');
    assert(bitcoinRow(), 'and lists the Bitcoin Endpoint page');
    toggle.click();
    await nextTick();
    assert(store.get().shown === false && !bitcoinRow(), 'turning it off hides it again');
    unmount();
    console.log('✓ Network Settings lists Experimental pages only while the switch is on');
}

function providePublications(app, store) {
    const json = { id: 'good', contentKind: 'forkbuild.structure', publisherIdentity: { id: 'did:key:zgood' }, contentReference: { hash: 'a'.repeat(64) } };
    const publication = { ...json, title: 'good', toJSON: () => json };
    if (store) app.provide('experimentalToolsSettingsStore', store);
    app.provide('publicationCatalog', { list: () => [publication], has: () => true, getReceivedAt: () => null, remove: () => false });
    app.provide('publicationResolutionCoordinator', {
        resolve: async () => ({ outcome: PublicationResolutionOutcome.RESOLVED, content: { title: 'Harbour Lighthouse' }, reason: null })
    });
    app.provide('publicationDisplayKindPlugins', { 'forkbuild.structure': { describe: () => 'a structure' } });
    app.provide('peerSessionManager', { listPeers: () => [] });
    app.provide('publicationAnchorCreationCoordinator', null);
    app.provide('publicationEvidenceCoordinator', null);
    app.provide('publicationPeerExchange', null);
    app.provide('publicationPeerContentExchange', null);
}

// Publications, switch off: no tools panel, and the intro points to Network Settings.
{
    const store = new ExperimentalToolsSettingsStore({ storageProvider: new InMemoryStorageProvider() });
    const { host, unmount } = mount(DecentralizedPublicationsView, (app) => providePublications(app, store));
    await settle();
    assert(host.querySelector('.identity-mgmt-card'), 'publications are still listed');
    assert(!host.querySelector('#publications-tools'), 'the Wallet, Archive & Publisher Tools panel is hidden');
    const intro = host.querySelector('.publications-view > p');
    assert(intro.querySelector('a.publications-tools-hidden-link[href="/settings"]'), 'the intro links to Network Settings');
    assert(intro.textContent.includes('Show experimental tools'), 'and names the switch');
    unmount();
    console.log('✓ Publications hides its Experimental tools while the switch is off');
}

// Publications, switch on (or no store, a page mounted on its own): the panel is there.
for (const shown of [true, null]) {
    let store = null;
    if (shown) {
        store = new ExperimentalToolsSettingsStore({ storageProvider: new InMemoryStorageProvider() });
        store.setShown(true);
    }
    const { host, unmount } = mount(DecentralizedPublicationsView, (app) => providePublications(app, store));
    await settle();
    assert(host.querySelector('#publications-tools'), `${shown ? 'switch on' : 'no store'}: the tools panel is listed`);
    assert(!host.querySelector('.publications-tools-hidden-link'), 'and the intro offers it, not Network Settings');
    unmount();
}
console.log('✓ Publications lists its Experimental tools while the switch is on');
