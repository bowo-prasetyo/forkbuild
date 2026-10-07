import { register } from 'node:module';
import {
    LOCAL_AND_PEERS_ONLY, COMMENTARY_DISTRIBUTION_PROVIDER_KEYS,
    isValidCommentaryDistributionProvider, resolveCommentaryDistributionProvider
} from '../core/CommentaryDistributionProvider.js';
import { CommentaryDistributionPreferenceStore } from '../storage/CommentaryDistributionPreferenceStore.js';
import { createPublicationCommentaryDistributor } from '../application/publication/commentary/PublicationCommentaryDistributor.js';
import { backupEntryGroupOf, BackupEntryGroup } from '../application/backup/BackupEntryGroups.js';
import { assert } from './support/Assert.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';

// The comment default: a network (or Local & peers only) saved for comments
// alone, which comment forms start on. With none saved, comments follow the
// Announcement / Discovery provider, as before.

async function run() {
    // The vocabulary and the fallback.
    {
        assert(COMMENTARY_DISTRIBUTION_PROVIDER_KEYS.join() === 'nostr,arweave,steem,blurt,peers', 'the four networks, plus Local & peers only');
        assert(isValidCommentaryDistributionProvider(LOCAL_AND_PEERS_ONLY) && !isValidCommentaryDistributionProvider('ipfs')
            && !isValidCommentaryDistributionProvider(null), 'only known providers are valid');
        assert(resolveCommentaryDistributionProvider({ commentaryPreference: null, announcementDiscoveryProvider: 'arweave' }) === 'arweave',
            'with no comment default, comments follow Announcement / Discovery');
        assert(resolveCommentaryDistributionProvider({ commentaryPreference: 'peers', announcementDiscoveryProvider: 'arweave' }) === 'peers',
            'a saved comment default wins');
        assert(resolveCommentaryDistributionProvider({ commentaryPreference: 'bogus', announcementDiscoveryProvider: 'steem' }) === 'steem',
            'an unknown comment default is ignored');
        console.log('✓ the comment default wins when set, else Announcement / Discovery');
    }

    // The store.
    {
        const storage = new InMemoryStorageProvider();
        const store = new CommentaryDistributionPreferenceStore(storage);
        assert(store.get() === null, 'nothing saved reads as null');
        for (const key of COMMENTARY_DISTRIBUTION_PROVIDER_KEYS) {
            store.save(key);
            assert(new CommentaryDistributionPreferenceStore(storage).get() === key, `${key} survives a reload`);
        }
        store.save(null);
        assert(store.get() === null && storage.load('commentary-distribution-preference') === null, 'saving null removes the default');

        let threw = false;
        try {
            store.save('ipfs');
        } catch {
            threw = true;
        }
        assert(threw && store.get() === null, 'an unknown provider is refused and nothing is saved');

        storage.save('commentary-distribution-preference', ['not', 'an', 'object']);
        assert(store.get() === null, 'a malformed entry reads as nothing saved');
        storage.save('commentary-distribution-preference', { providerKey: 'ipfs' });
        assert(store.get() === null, 'an unknown stored provider reads as nothing saved');

        let rejected = false;
        try {
            new CommentaryDistributionPreferenceStore({});
        } catch {
            rejected = true;
        }
        assert(rejected, 'the store needs a StorageProvider');
        assert(backupEntryGroupOf('commentary-distribution-preference') === BackupEntryGroup.SETTINGS,
            'device backups restore it with the network settings');
        console.log('✓ the store saves, clears and degrades a bad entry to nothing saved');
    }

    // A saved Local & peers only default keeps a comment with no explicit choice off every network.
    {
        const calls = [];
        const distribute = createPublicationCommentaryDistributor({
            peerExchange: { announce: (commentary) => calls.push(`announce:${commentary.commentaryId}`) },
            distributionExchange: { exportCommentary: (commentary) => commentary.commentaryId },
            substrateFor: (provider) => ({ publish: (json) => { calls.push(`${provider}:${json}`); return Promise.resolve(); } }),
            defaultProvider: () => resolveCommentaryDistributionProvider({ commentaryPreference: 'peers', announcementDiscoveryProvider: 'nostr' })
        });
        distribute({ commentaryId: 'c1' });
        distribute({ commentaryId: 'c2' }, 'arweave');
        assert(calls.join('|') === 'announce:c1|announce:c2|arweave:c2',
            `the peers-only default publishes nowhere; a per-comment choice still wins (got ${calls.join('|')})`);
        console.log('✓ the distributor falls back to the comment default');
    }

    register(new URL('./support/VueShimLoader.mjs', import.meta.url));
    const { mountComponent } = await import('./support/MinimalVueCompositionApiShim.js');
    const { default: SettingsView } = await import('../ui/views/AnnouncementDiscoveryProviderSettingsView.js');
    const { default: PublicationCommentarySection } = await import('../ui/components/PublicationCommentarySection.js');
    const { default: OwnPublicationPanel } = await import('../ui/components/OwnPublicationPanel.js');
    const { default: WorldEncounterCanvas } = await import('../ui/components/WorldEncounterCanvas.js');

    // The Comments section of the Announcement / Discovery settings page.
    {
        const store = new CommentaryDistributionPreferenceStore(new InMemoryStorageProvider());
        const mount = () => mountComponent(SettingsView, { commentaryDistributionPreferenceStore: store });

        let view = mount();
        assert(view.hasCommentaryPreferenceStore === true, 'the section shows when the store is provided');
        const labels = view.commentaryOptions.map((option) => option.label).join('|');
        assert(labels === 'Same as the Announcement / Discovery provider above|Arweave|Blurt|Nostr|Steem|Local & peers only',
            `"same as above" first, the networks sorted, Local & peers only last (got ${labels})`);
        assert(view.selectedCommentaryProviderKey.value === '', 'nothing saved preselects "same as above"');

        view.selectedCommentaryProviderKey.value = LOCAL_AND_PEERS_ONLY;
        view.saveCommentary();
        assert(store.get() === LOCAL_AND_PEERS_ONLY && view.commentarySaveStatus.value === 'saved', 'Save stores the choice and says so');

        view = mount();
        assert(view.selectedCommentaryProviderKey.value === LOCAL_AND_PEERS_ONLY, 'the saved choice is preselected next time');
        view.selectedCommentaryProviderKey.value = '';
        view.saveCommentary();
        assert(store.get() === null, 'saving "same as above" removes the comment default');

        const failing = mountComponent(SettingsView, { commentaryDistributionPreferenceStore: { get: () => null, save: () => { throw new Error('storage full'); } } });
        failing.saveCommentary();
        assert(failing.commentarySaveError.value === 'storage full' && failing.commentarySaveStatus.value === 'idle', 'a failed save is reported, not claimed');

        assert(mountComponent(SettingsView, {}).hasCommentaryPreferenceStore === false, 'without the store the section is hidden');
        console.log('✓ the settings page saves, preselects and clears the comment default');
    }

    // Every comment form starts on the comment default.
    {
        assert(PublicationCommentarySection.data.call({ defaultCommentaryDistributionProvider: 'peers' }).selectedDiscoveryProvider === 'peers',
            'the Repository form starts on the comment default');
        assert(PublicationCommentarySection.data.call({ defaultCommentaryDistributionProvider: null }).selectedDiscoveryProvider === 'nostr',
            'with no default injected it starts on Nostr, as before');

        // Each panel's own field for the publication distribution choice.
        for (const [name, component, distributionField] of [
            ['My Shared World', OwnPublicationPanel, 'distributionDiscoveryProvider'],
            ['World Encounters', WorldEncounterCanvas, 'selectedDiscoveryProvider']
        ]) {
            const withDefault = component.data.call({ defaultCommentaryDistributionProvider: 'peers', defaultDiscoveryDistributionProvider: 'arweave' });
            assert(withDefault.commentaryDiscoveryProvider === 'peers', `${name}: comments start on the comment default`);
            assert(withDefault[distributionField] === 'arweave',
                `${name}: the publication distribution choice still starts on Announcement / Discovery`);
            const without = component.data.call({ defaultCommentaryDistributionProvider: null, defaultDiscoveryDistributionProvider: 'arweave' });
            assert(without.commentaryDiscoveryProvider === 'arweave', `${name}: with no comment default, comments follow Announcement / Discovery`);
        }
        console.log('✓ the Repository and World View comment forms start on the comment default');
    }

    console.log('\n✅ All comment default tests passed.');
}

await run();
