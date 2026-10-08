// @environment browser
import { createApp, nextTick } from 'vue';
import DecentralizedPublicationsView from '../ui/views/DecentralizedPublicationsView.js';
import ContentProviderSettingsView from '../ui/views/ContentProviderSettingsView.js';
import { PublicationResolutionOutcome } from '../application/publication/PublicationResolutionOutcome.js';
import { PublicationObservationArchive } from '../application/publication/observationArchive/PublicationObservationArchive.js';
import { IpfsPublicationRecord, IpfsPublicationMethod } from '../application/ipfs/IpfsPublicationRecord.js';
import { IpfsRemotePinningSettingsStore } from '../storage/IpfsRemotePinningSettingsStore.js';
import { IpfsRemotePinningSettings } from '../core/IpfsRemotePinningSettings.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// A card's History tab shows what earlier visits recorded, read from the
// saved Observation Archive, and says so when nothing is recorded. The
// Content Provider page saves a remote pinning service's endpoint and field
// names, keeps its token for this visit only, and can forget the service;
// the Publications card then starts configured with it.

async function settle() {
    for (let i = 0; i < 20; i += 1) {
        await nextTick();
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
}
const buttonNamed = (root, label) => [...root.querySelectorAll('button')].find((button) => button.textContent.trim() === label);
const RouterLinkStub = { props: ['to'], template: '<a><slot /></a>' };

function publication(id, hash) {
    const json = { id, contentKind: 'forkbuild.structure', publisherIdentity: { id: `did:key:z${id}` }, contentReference: { hash } };
    return { ...json, title: id, toJSON: () => json };
}
const RECORDED = 'a'.repeat(64);
const publications = [publication('recorded', RECORDED), publication('quiet', 'b'.repeat(64))];

// What an earlier visit left in the archive.
const archive = PublicationObservationArchive.empty().appendIpfsPublicationRecord(new IpfsPublicationRecord({
    contentHash: RECORDED, locator: 'ipfs://bafy-earlier-visit', publishedAt: new Date('2026-10-07T12:00:00Z'),
    publicationMethod: IpfsPublicationMethod.REMOTE_PINNING
}));

// A saved remote pinning service.
const settingsBacking = new InMemoryStorageProvider();
const settingsStore = new IpfsRemotePinningSettingsStore(settingsBacking);

{
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp(ContentProviderSettingsView);
    app.config.warnHandler = () => {};
    app.provide('ipfsRemotePinningSettingsStore', settingsStore);
    app.mount(host);
    await settle();

    const heading = [...host.querySelectorAll('h2')].find((h2) => h2.textContent.includes('Remote Pinning Service'));
    assert(heading && heading.querySelector('.experimental-badge'), 'Content Provider has a Remote Pinning Service section, marked Experimental');
    assert(host.textContent.includes('No service is set up'), 'which says when none is set up');
    const form = host.querySelector('.remote-pinning-settings-form');
    const set = async (input, value) => { input.value = value; input.dispatchEvent(new Event('input')); await settle(); };
    await set(form.querySelector('.remote-pinning-endpoint-input'), 'not a url');
    buttonNamed(form, 'Save').click();
    await settle();
    assert(settingsStore.get() === null && form.textContent.includes("Enter the service's upload address"), 'a bad endpoint is refused');
    await set(form.querySelector('.remote-pinning-endpoint-input'), 'https://api.example/pin');
    await set(form.querySelector('.remote-pinning-token-input'), 'secret-token');
    const [, , requestField, responseField] = form.querySelectorAll('input');
    await set(responseField, 'IpfsHash');
    assert(requestField.placeholder === 'file', 'field names are optional');
    buttonNamed(form, 'Save').click();
    await settle();
    assert(settingsStore.get().endpoint === 'https://api.example/pin' && settingsStore.get().responseField === 'IpfsHash', 'Save keeps the service');
    assert(!JSON.stringify(settingsBacking.load('ipfs-remote-pinning-settings')).includes('secret-token'), 'but never its token');
    assert(form.textContent.includes('A token is entered for this visit.') && form.querySelector('.remote-pinning-token-input').value === '',
        'the token is kept for this visit, and the field cleared');
    console.log('✓ Content Provider saves the remote pinning service, and keeps its token for this visit only');

    buttonNamed(form, 'Forget Service').click();
    await settle();
    assert(settingsStore.get() === null && form.textContent.includes('Forgotten.'), 'Forget Service removes it');
    app.unmount();
    host.remove();
}

settingsStore.save(new IpfsRemotePinningSettings({ endpoint: 'https://api.example/pin' }));

{
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp(DecentralizedPublicationsView);
    app.config.warnHandler = () => {};
    app.component('router-link', RouterLinkStub);
    app.provide('publicationCatalog', { list: () => [...publications], has: () => true, getReceivedAt: () => null, remove: () => false });
    app.provide('publicationResolutionCoordinator', {
        resolve: async () => ({ outcome: PublicationResolutionOutcome.RESOLVED, content: {}, reason: null })
    });
    app.provide('publicationDisplayKindPlugins', { 'forkbuild.structure': { describe: () => 'a structure' } });
    app.provide('peerSessionManager', { listPeers: () => [] });
    app.provide('publicationAnchorCreationCoordinator', null);
    app.provide('publicationEvidenceCoordinator', null);
    app.provide('publicationPeerExchange', null);
    app.provide('publicationPeerContentExchange', null);
    app.provide('publicationObservationArchiveStorage', { load: () => archive, save: () => {} });
    app.provide('ipfsRemotePinningSettingsStore', settingsStore);
    app.provide('ipfsRemotePublicationCoordinator', { publish: async () => null });
    app.provide('publicationContentStore', { get: async () => null });
    app.provide('publicationSnapshotPlacementResolutionCoordinator', { discover: () => [] });
    app.mount(host);
    await settle();

    const cards = [...host.querySelectorAll('.publications-view > .identity-mgmt-list > .identity-mgmt-card')];
    assert(cards.length === 2, 'both publications are listed');
    const historyOf = async (card) => {
        const tab = [...card.querySelectorAll('[role="tab"]')].find((candidate) => candidate.firstChild.textContent.trim() === 'History');
        tab.click();
        await settle();
        return [...tab.closest('details').querySelectorAll(':scope > div')].find((panel) => panel.style.display !== 'none' && panel !== tab.closest('.publications-tools-tabs'));
    };
    const recorded = await historyOf(cards[0]);
    buttonNamed(recorded, 'Show Cross-Domain Timeline').click();
    await settle();
    assert(recorded.textContent.includes('ipfs://bafy-earlier-visit'), "History shows what an earlier visit recorded");
    const quiet = await historyOf(cards[1]);
    assert(quiet.textContent.includes('Nothing recorded for this publication yet.'), 'and says so when nothing is recorded');
    assert(quiet.querySelector('.experimental-badge') && quiet.textContent.includes('Remote IPFS pinning and Bitcoin and Base anchoring, which add to this list, are Experimental.'),
        'History is a regular tab that says which of its sources are Experimental');
    console.log('✓ History reads the saved archive, with an empty state');

    const placementsTab = [...cards[0].querySelectorAll('[role="tab"]')].find((candidate) => candidate.firstChild.textContent.trim() === 'Placements & IPFS');
    placementsTab.click();
    await settle();
    const ipfsPublishingTitle = [...cards[0].querySelectorAll('.evidence-summary-title')].find((title) => title.textContent.includes('IPFS Publishing'));
    assert(ipfsPublishingTitle && ipfsPublishingTitle.querySelector('.experimental-badge'), 'on Placements & IPFS, only IPFS Publishing is marked Experimental');
    const placementsTitle = [...cards[0].querySelectorAll('.evidence-summary-title')].find((title) => title.textContent.includes('Snapshot Placements'));
    assert(placementsTitle && !placementsTitle.querySelector('.experimental-badge'), 'and the placements list is not');
    const endpointField = [...cards[0].querySelectorAll('.evidence-field')].find((field) => field.querySelector('dt')?.textContent.trim() === 'Endpoint');
    assert(endpointField && endpointField.querySelector('dd').textContent.trim() === 'https://api.example/pin', 'the card starts configured with the saved service');
    console.log('✓ the Publications card starts on the saved service');
    app.unmount();
    host.remove();
}
