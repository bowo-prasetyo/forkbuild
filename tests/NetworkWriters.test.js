import { NETWORK_WRITERS, NetworkWriter, isNetworkWriter, isWritable, normalizeNetworkWriterSettings, writableKeys } from '../core/NetworkWriters.js';
import { NetworkWriterSettingsStore } from '../application/settings/NetworkWriterSettingsStore.js';
import { backupEntryGroupOf, BackupEntryGroup } from '../application/backup/BackupEntryGroups.js';
import { NetworkWriterLoader } from '../ui/main/NetworkWriterLoader.js';
import { followNetworkWriterSwitches } from '../ui/main/followNetworkWriterSwitches.js';
import { composeSteemRuntime } from '../application/steem/SteemRuntimeComposition.js';
import { composeBlurtRuntime } from '../application/blurt/BlurtRuntimeComposition.js';
import { composeAnchoring } from '../ui/main/composeAnchoring.js';
import { composeBitcoinWallet } from '../ui/main/plugins/composeBitcoinWallet.js';
import { composeBaseWallet } from '../ui/main/plugins/composeBaseWallet.js';
import { LocalPublicationAnchorCatalog } from '../application/anchoring/LocalPublicationAnchorCatalog.js';
import { LocalPublicationCatalog } from '../application/publication/LocalPublicationCatalog.js';
import { LocalAnchorKnowledgeStore } from '../application/anchoring/LocalAnchorKnowledgeStore.js';
import { RoleProviderPreferenceStore } from '../storage/RoleProviderPreferenceStore.js';
import { staticGraph } from '../scripts/moduleGraph.mjs';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { makeIdentity } from './support/TestIdentity.js';
import { assert } from './support/Assert.js';

// Network writers (core/NetworkWriters.js, docs/Pillars.md "Networks: readers
// and writers"): Bitcoin's and Base's wallets are plugins built only when this
// device switches them on, on top of the anchoring readers every copy builds.

const noWallet = { sign: async () => { throw new Error('no wallet in this test'); } };
const ESPLORA = ['https://esplora.invalid/api'];

function anchoring() {
    return composeAnchoring({
        identityProvider: makeIdentity('Alice'),
        resolvedBitcoinEsploraApiUrls: ESPLORA,
        publicationCatalog: new LocalPublicationCatalog(new InMemoryStorageProvider()),
        publicationAnchorCatalog: new LocalPublicationAnchorCatalog(new InMemoryStorageProvider()),
        anchorKnowledgeStore: new LocalAnchorKnowledgeStore(new InMemoryStorageProvider()),
        roleProviderPreferenceStore: new RoleProviderPreferenceStore(new InMemoryStorageProvider()),
        arweaveHostSigner: noWallet,
        resolvedArweaveGatewayUrl: 'https://arweave.invalid'
    });
}

// The writers, and how a saved choice is read.
{
    assert(NETWORK_WRITERS.join() === 'bitcoin,base,steem,blurt' && isNetworkWriter(NetworkWriter.STEEM) && !isNetworkWriter('nostr'),
        'Bitcoin, Base, Steem and Blurt have writers; Nostr is built in');
    assert(JSON.stringify(normalizeNetworkWriterSettings(null)) === '{"bitcoin":false,"base":false,"steem":false,"blurt":false}', 'every writer is off until switched on');
    assert(JSON.stringify(normalizeNetworkWriterSettings({ bitcoin: true, base: 'yes', nostr: true })) === '{"bitcoin":true,"base":false,"steem":false,"blurt":false}',
        'only true switches one on, and nothing else is kept');
    assert(normalizeNetworkWriterSettings([true]).bitcoin === false, 'a damaged value switches nothing on');
    const defaults = { steem: true };
    assert(normalizeNetworkWriterSettings(null, defaults).steem === true, 'a writer never switched follows its default');
    assert(normalizeNetworkWriterSettings({ steem: false }, defaults).steem === false, 'a saved choice beats the default');
    console.log('✓ writers are off until switched on, or follow their default until switched');
}

// Which networks can be written to: Nostr, Arweave and every storage or
// anchor type always; Steem and Blurt only with their writer on.
{
    const off = normalizeNetworkWriterSettings(null);
    const steemOn = normalizeNetworkWriterSettings({ steem: true });
    assert(writableKeys(['nostr', 'arweave', 'steem', 'blurt'], off).join() === 'nostr,arweave', 'with both off, Nostr and Arweave');
    assert(writableKeys(['nostr', 'arweave', 'steem', 'blurt'], steemOn).join() === 'nostr,arweave,steem', 'Steem once switched on');
    assert(isWritable('ipfs', off) && isWritable('ar', off) && isWritable('peers', off), 'other storage and the peers-only choice need no writer');
    assert(!isWritable('blurt', steemOn) && !isWritable('steem', null), 'Blurt still off, and no settings means off');
    assert(writableKeys('junk', steemOn).length === 0, 'junk lists nothing');
    console.log('✓ Steem and Blurt can be written to only with their writer on');
}

// The store: saved per device, in the backup's settings, with change listeners.
{
    const storage = new InMemoryStorageProvider();
    const store = new NetworkWriterSettingsStore({ storageProvider: storage });
    const heard = [];
    store.onChange((id, enabled) => heard.push(`${id}:${enabled}`));
    store.setEnabled('base', true);
    assert(new NetworkWriterSettingsStore({ storageProvider: storage }).isEnabled('base') === true, 'switching one on is saved');
    assert(store.isEnabled('bitcoin') === false, 'the other stays off');
    store.setEnabled('base', false);
    assert(heard.join() === 'base:true,base:false', 'each change is heard');
    let refused = false;
    try { store.setEnabled('nostr', true); } catch { refused = true; }
    assert(refused, 'a network without a writer cannot be switched');
    assert(backupEntryGroupOf('network-writer-settings') === BackupEntryGroup.SETTINGS, 'a backup carries the switches with the other Network settings');
    console.log('✓ the switches are saved, heard and backed up');
}

// Steem and Blurt start on for a device that already has an account to post
// as, and off for one that doesn't; switching another writer doesn't freeze
// them, and a saved choice wins.
{
    const storage = new InMemoryStorageProvider();
    let steemAccount = 'alice';
    const store = new NetworkWriterSettingsStore({
        storageProvider: storage,
        defaults: { steem: () => Boolean(steemAccount), blurt: () => { throw new Error('unreadable'); } }
    });
    assert(store.isEnabled('steem') === true && store.isEnabled('blurt') === false, 'on with an account saved; a failing default is off');
    store.setEnabled('bitcoin', true);
    steemAccount = null;
    assert(store.isEnabled('steem') === false, 'switching Bitcoin saved nothing for Steem: it still follows its default');
    steemAccount = 'alice';
    store.setEnabled('steem', false);
    assert(store.isEnabled('steem') === false, 'switched off, it stays off whatever the account');
    assert(JSON.stringify(storage.load('network-writer-settings')) === '{"bitcoin":true,"steem":false}', 'only the switches touched are saved');
    console.log('✓ Steem and Blurt start on where an account is saved, until switched');
}

// Adopted once as the app starts, the default stays even after the account is
// cleared; a writer whose default is off, or already switched, isn't touched.
{
    const storage = new InMemoryStorageProvider();
    let account = 'alice';
    const store = new NetworkWriterSettingsStore({ storageProvider: storage, defaults: { steem: () => Boolean(account), blurt: () => false } });
    storage.save('network-writer-settings', { base: true });
    assert(store.adoptDefaults().join() === 'steem', 'only Steem, on by its default, is adopted');
    account = null;
    assert(store.isEnabled('steem') === true, 'clearing the account later leaves posting on');
    assert(JSON.stringify(storage.load('network-writer-settings')) === '{"base":true,"steem":true}', 'saved beside what was already switched');
    assert(store.adoptDefaults().length === 0, 'a second start adopts nothing');
    console.log('✓ the default is adopted once, as the app starts');
}

// Steem's and Blurt's writers share their readers' runtime, so there is
// nothing to load: what they offer follows the switch, live. Anchors made on
// them are checked and described for everyone; making one is offered only
// while switched on.
{
    const noNetwork = async () => { throw new Error('no network in this test'); };
    const steemRuntime = composeSteemRuntime({ fetchImpl: noNetwork });
    const blurtRuntime = composeBlurtRuntime({ fetchImpl: noNetwork });
    const store = new NetworkWriterSettingsStore({ storageProvider: new InMemoryStorageProvider() });
    store.setEnabled('blurt', true);
    const core = composeAnchoring({
        identityProvider: makeIdentity('Alice'),
        resolvedBitcoinEsploraApiUrls: ESPLORA,
        publicationCatalog: new LocalPublicationCatalog(new InMemoryStorageProvider()),
        publicationAnchorCatalog: new LocalPublicationAnchorCatalog(new InMemoryStorageProvider()),
        anchorKnowledgeStore: new LocalAnchorKnowledgeStore(new InMemoryStorageProvider()),
        roleProviderPreferenceStore: new RoleProviderPreferenceStore(new InMemoryStorageProvider()),
        arweaveHostSigner: noWallet,
        resolvedArweaveGatewayUrl: 'https://arweave.invalid',
        steemRuntime, blurtRuntime, networkWriterSettingsStore: store
    });
    for (const anchorType of ['steem', 'blurt']) {
        assert(core.externalAnchorProofVerifierRegistry.has(anchorType) && core.externalAnchorEvidenceViewRegistry.has(anchorType),
            `${anchorType} anchors are checked and described whatever the switch`);
    }
    assert(!core.externalAnchorPublisherRegistry.has('steem') && core.externalAnchorPublisherRegistry.has('blurt'), 'only a switched-on network makes anchors');
    store.setEnabled('steem', true);
    store.setEnabled('blurt', false);
    assert(core.externalAnchorPublisherRegistry.has('steem') && !core.externalAnchorPublisherRegistry.has('blurt'), 'switching follows at once');

    const seen = [];
    const stop = followNetworkWriterSwitches(store, { steem: steemRuntime, blurt: null }, {
        on: (runtime, id) => seen.push(`on:${id}`),
        off: (runtime, id) => seen.push(`off:${id}`)
    });
    store.setEnabled('steem', true);
    store.setEnabled('steem', false);
    store.setEnabled('blurt', true);
    stop();
    store.setEnabled('steem', true);
    assert(seen.join() === 'on:steem,off:steem', `applied now, then each real change, never for a network not built, never after stopping (${seen})`);
    console.log("✓ Steem's and Blurt's anchors are offered while switched on, and checked always");
}

// The anchoring readers alone: every network's anchors can be checked and
// described, and no wallet is built.
{
    const core = anchoring();
    for (const anchorType of ['bitcoin-op-return', 'base', 'arweave']) {
        assert(core.externalAnchorProofVerifierRegistry.has(anchorType) && core.externalAnchorEvidenceViewRegistry.has(anchorType),
            `${anchorType} anchors are checked and described without its wallet`);
    }
    assert(core.bitcoinAnchorProofReconciliationView, "Bitcoin's confirmation and reconcile are readers too");
    assert(!core.externalAnchorPublisherRegistry.has('bitcoin-op-return'), "Bitcoin's one-shot publisher waits for its writer");
    assert(!('bitcoinWalletConnection' in core) && !('baseWalletConnection' in core), 'no wallet is built with the readers');
    console.log('✓ the readers check every network\'s anchors with no wallet built');
}

// The plugins build what the Publications page injects, on the readers' services.
{
    const core = anchoring();
    const bitcoin = composeBitcoinWallet({ anchoring: core, resolvedBitcoinEsploraApiUrls: ESPLORA });
    assert(Object.keys(bitcoin).sort().join() === [
        'bitcoinAnchorBroadcastCoordinator', 'bitcoinAnchorConfirmationCoordinator', 'bitcoinAnchorPublicationCoordinator',
        'bitcoinAnchorReviewedSigningCoordinator', 'bitcoinAnchorSignedPsbtFinalizationCoordinator',
        'bitcoinAnchorTransactionConstructionCoordinator', 'bitcoinAnchorTransactionReviewCoordinator',
        'bitcoinWalletConnection', 'bitcoinWalletFundingObserver'
    ].join(), "Bitcoin's plugin builds its wallet steps");
    assert(Object.values(bitcoin).every(Boolean), 'each of them');
    assert(core.externalAnchorPublisherRegistry.has('bitcoin-op-return'), 'and adds its one-shot publisher to the shared registry');
    const base = composeBaseWallet({ anchoring: core });
    assert(Object.keys(base).sort().join() === [
        'baseAnchorPublisher', 'baseInjectedProviderWalletTransactionSigner', 'baseNetworkObserver',
        'basePublicationTransactionPlanCoordinator', 'baseReviewedSigningCoordinator',
        'baseSignedTransactionFinalizationCoordinator', 'baseTransactionBroadcastCoordinator',
        'baseTransactionInclusionObservationCoordinator', 'baseWalletConnection'
    ].join() && Object.values(base).every(Boolean), "Base's plugin builds its wallet steps");
    assert(!core.externalAnchorPublisherRegistry.has('base'), 'and keeps Base out of the shared registry, as before');
    console.log('✓ each plugin builds its wallet steps on the readers\' services');
}

// The loader: builds the writers switched on once anchoring is built, and one
// switched on later at once; each once; a failure is tried again.
{
    const store = new NetworkWriterSettingsStore({ storageProvider: new InMemoryStorageProvider() });
    const built = [];
    const provided = new Map();
    let failBase = true;
    const loader = new NetworkWriterLoader({
        settingsStore: store,
        plugins: {
            bitcoin: async (anchoringServices) => { built.push(`bitcoin:${anchoringServices.name}`); return { bitcoinWalletConnection: 'btc' }; },
            base: async () => {
                built.push('base');
                if (failBase) throw new Error('module failed to load');
                return { baseWalletConnection: 'base' };
            }
        },
        provide: (key, value) => provided.set(key, value)
    });
    store.setEnabled('bitcoin', true);
    assert(built.length === 0, 'nothing is built before the anchoring services are');
    let rejected = false;
    await loader.load('bitcoin').catch(() => { rejected = true; });
    assert(rejected, 'and asking for one then is refused');

    await loader.attach({ name: 'anchoring' });
    assert(built.join() === 'bitcoin:anchoring' && provided.get('bitcoinWalletConnection') === 'btc' && loader.isLoaded('bitcoin'),
        'attaching builds the writer switched on, on the anchoring services, and provides what it returns');
    assert(!loader.isLoaded('base') && !provided.has('baseWalletConnection'), 'a writer switched off is not built');

    store.setEnabled('bitcoin', false);
    store.setEnabled('bitcoin', true);
    await loader.load('bitcoin');
    assert(built.filter((b) => b.startsWith('bitcoin')).length === 1, 'a writer is built once');

    store.setEnabled('base', true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert(built.includes('base') && !loader.isLoaded('base') && !provided.has('baseWalletConnection'), 'switching one on builds it at once; a failure provides nothing');
    failBase = false;
    await loader.load('base');
    assert(loader.isLoaded('base') && provided.get('baseWalletConnection') === 'base', 'and is tried again');
    console.log('✓ the loader builds each writer switched on, once, after the anchoring services');
}

// Only the plugins reach the wallet modules: the anchoring readers don't, and
// the app reaches the plugins by import() alone.
{
    const readers = staticGraph('ui/main/composeAnchoring.js');
    const walletModules = [
        'application/anchoring/bitcoin/CreateBitcoinAnchorPsbtBuilderUseCase.js',
        'application/anchoring/bitcoin/CreateBitcoinWalletConnectionUseCase.js',
        'application/anchoring/bitcoin/CreateBitcoinAnchorPublisherUseCase.js',
        'application/anchoring/base/CreateBaseWalletConnectionUseCase.js',
        'application/anchoring/base/CreateBaseTransactionBroadcasterUseCase.js'
    ];
    const leaked = walletModules.filter((file) => readers.has(file));
    assert(leaked.length === 0, `the anchoring readers reach no wallet module:\n  ${leaked.join('\n  ')}`);
    const bitcoin = staticGraph('ui/main/plugins/composeBitcoinWallet.js');
    const base = staticGraph('ui/main/plugins/composeBaseWallet.js');
    assert(walletModules.slice(0, 3).every((file) => bitcoin.has(file)) && walletModules.slice(3).every((file) => base.has(file)), 'each plugin reaches its own');
    const onlyPlugins = new Set([...bitcoin, ...base].filter((file) => !readers.has(file)));
    assert(onlyPlugins.size > 100, `the plugins hold the wallet steps' own modules (${onlyPlugins.size})`);
    const app = staticGraph('ui/main.js');
    assert(!app.has('ui/main/plugins/composeBitcoinWallet.js') && !app.has('ui/main/plugins/composeBaseWallet.js'), 'the app imports the plugins only when one is switched on');
    console.log(`✓ only the plugins reach the wallet steps' ${onlyPlugins.size} modules`);
}

console.log('\n✅ All NetworkWriters tests passed.');
