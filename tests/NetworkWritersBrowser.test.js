// @environment browser
import { createApp, nextTick } from 'vue';
import NetworkSettingsView from '../ui/views/NetworkSettingsView.js';
import DecentralizedPublicationsView from '../ui/views/DecentralizedPublicationsView.js';
import { PublicationResolutionOutcome } from '../application/publication/PublicationResolutionOutcome.js';
import { ExperimentalToolsSettingsStore } from '../application/settings/ExperimentalToolsSettingsStore.js';
import { NetworkWriterSettingsStore } from '../application/settings/NetworkWriterSettingsStore.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// Bitcoin's and Base's wallets are network writers (core/NetworkWriters.js,
// docs/Pillars.md "Networks: readers and writers"), rendered by real Vue: their
// switches are on Network Settings under Show experimental tools, and the
// Publications page offers a wallet only while its switch is on, pointing to
// Network Settings otherwise.

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

function experimentalOn() {
    const store = new ExperimentalToolsSettingsStore({ storageProvider: new InMemoryStorageProvider() });
    store.setShown(true);
    return store;
}

// Network Settings: the switches appear with the Experimental tools, start off,
// and save at once.
{
    const experimental = new ExperimentalToolsSettingsStore({ storageProvider: new InMemoryStorageProvider() });
    const writers = new NetworkWriterSettingsStore({ storageProvider: new InMemoryStorageProvider() });
    const { host, unmount } = mount(NetworkSettingsView, (app) => {
        app.provide('experimentalToolsSettingsStore', experimental);
        app.provide('networkWriterSettingsStore', writers);
    });
    const bitcoin = () => host.querySelector('.network-writer-toggle--bitcoin');
    const base = () => host.querySelector('.network-writer-toggle--base');
    assert(!bitcoin() && !base(), 'the wallet switches are hidden with the Experimental tools');
    host.querySelector('.experimental-tools-toggle').click();
    await nextTick();
    assert(bitcoin() && base() && !bitcoin().checked && !base().checked, 'and listed, off, once those are shown');
    assert(host.querySelector('.network-writers-setting').textContent.includes('Bitcoin wallet'), 'each named');
    bitcoin().click();
    await nextTick();
    assert(writers.isEnabled('bitcoin') === true && writers.isEnabled('base') === false, 'switching Bitcoin on is saved, and Base stays off');
    bitcoin().click();
    await nextTick();
    assert(writers.isEnabled('bitcoin') === false, 'and switching it off again');
    unmount();
    console.log('✓ Network Settings lists the wallet switches under the Experimental tools, off until switched on');
}

function providePublications(app, { writers, bitcoinConnection, baseConnection }) {
    const json = { id: 'good', contentKind: 'forkbuild.structure', publisherIdentity: { id: 'did:key:zgood' }, contentReference: { hash: 'a'.repeat(64) } };
    const publication = { ...json, title: 'good', toJSON: () => json };
    app.provide('experimentalToolsSettingsStore', experimentalOn());
    if (writers) app.provide('networkWriterSettingsStore', writers);
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
    // What the wallet plugins provide once built (ui/main/plugins/).
    app.provide('bitcoinWalletConnection', bitcoinConnection);
    app.provide('baseWalletConnection', baseConnection);
}

function wallet() {
    return { status: 'disconnected', account: null, network: null, connect: async () => ({ connected: false }), disconnect() {} };
}

function cardNamed(host, name) {
    return [...host.querySelectorAll('#publications-tools .identity-mgmt-name')].some((el) => el.textContent.trim() === name);
}

// Publications: each wallet's card only while its switch is on, even when its
// plugin was built earlier in the session; otherwise a pointer to Network Settings.
for (const [bitcoinOn, baseOn] of [[false, false], [true, false], [true, true]]) {
    const writers = new NetworkWriterSettingsStore({ storageProvider: new InMemoryStorageProvider() });
    writers.setEnabled('bitcoin', bitcoinOn);
    writers.setEnabled('base', baseOn);
    const { host, unmount } = mount(DecentralizedPublicationsView, (app) => providePublications(app, { writers, bitcoinConnection: wallet(), baseConnection: wallet() }));
    await settle();
    const label = `Bitcoin ${bitcoinOn ? 'on' : 'off'}, Base ${baseOn ? 'on' : 'off'}`;
    assert(cardNamed(host, 'Bitcoin Wallet') === bitcoinOn, `${label}: the Bitcoin wallet card ${bitcoinOn ? 'is' : 'is not'} offered`);
    assert(cardNamed(host, 'Base Network') === baseOn, `${label}: the Base wallet card ${baseOn ? 'is' : 'is not'} offered`);
    const hint = host.querySelector('.network-writers-hint');
    assert(Boolean(hint) === !(bitcoinOn && baseOn), `${label}: the pointer to the switches shows while one is off`);
    if (hint) assert(hint.querySelector('a[href="/settings"]'), 'and links to Network Settings');
    unmount();
}
console.log('✓ the Publications page offers each wallet only while its switch is on');

// No switch store (the page mounted on its own): no wallet is offered.
{
    const { host, unmount } = mount(DecentralizedPublicationsView, (app) => providePublications(app, { writers: null, bitcoinConnection: wallet(), baseConnection: wallet() }));
    await settle();
    assert(!cardNamed(host, 'Bitcoin Wallet') && !cardNamed(host, 'Base Network'), 'without the switches, no wallet is offered');
    unmount();
    console.log('✓ without the switches, no wallet is offered');
}

console.log('\n✅ All NetworkWritersBrowser tests passed.');
