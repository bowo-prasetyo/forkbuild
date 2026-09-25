import { inject } from 'vue';
import { sortOptionsByLabel } from '../../../utils/sortOptionsByLabel.js';
import { humanizeStorageType } from './presentation.js';

// Distributing an entry's publication and snapshot with the same app-wide
// commands WorldView uses, plus the storage and announcement choices they read.
export function usePublicationDistribution({
    publicationContentStore
}) {
    // The same app-wide distribution commands WorldView injects for its
    // panels; this page builds no orchestrator, uploader or publisher of
    // its own. publicationDistributionLifecycleStore is read-only here and
    // is only written through those commands.
    const publicationDistributionCommand = inject('publicationDistributionCommand', null);
    const multiRelayNostrPublicationDistributionCommand = inject('multiRelayNostrPublicationDistributionCommand', null);
    const snapshotDistributionCommand = inject('snapshotDistributionCommand', null);
    // Eligible, registered Content backends for snapshot distribution
    // ('ipfs'/'ar'; 'local' is never eligible, see
    // application/snapshot/SnapshotDistributionContentBackendSelection.js). Read
    // once: the registry is filled at startup.
    const snapshotDistributionAvailableStorageTypesCommand = inject('snapshotDistributionAvailableStorageTypes', null);
    // Saved provider preferences, used only to seed each entry's picker
    // when the entry is created; never re-read, and never override a choice
    // already made on this page.
    const defaultAnnouncementDiscoveryProvider = inject('defaultAnnouncementDiscoveryProvider', 'nostr');
    const defaultContentDistributionProvider = inject('defaultContentDistributionProvider', null);
    const snapshotDistributionStorageTypes = snapshotDistributionAvailableStorageTypesCommand
        ? snapshotDistributionAvailableStorageTypesCommand()
        : [];
    // Display order only — the list above keeps registry order, since
    // its first entry is the fallback default below.
    const snapshotDistributionStorageOptions = sortOptionsByLabel(snapshotDistributionStorageTypes, humanizeStorageType);
    const publicationDistributionLifecycleStore = inject('publicationDistributionLifecycleStore', null);

    // Same as WorldView's distribution actions. Arweave uses the
    // single-target publicationDistributionCommand; Nostr uses the
    // multi-relay command, which resolves to one result per relay (the
    // result isn't rendered here).
    function distributeEntryPublication(entry, discoveryProviderChoice) {
        if (discoveryProviderChoice === 'arweave') {
            if (!publicationDistributionCommand) {
                return Promise.reject(new Error('Publication distribution is not available.'));
            }
            return publicationDistributionCommand({
                publication: entry.publication,
                serializedMaterial: JSON.stringify(entry.publication.toJSON()),
                discoveryProvider: discoveryProviderChoice
            });
        }
        if (!multiRelayNostrPublicationDistributionCommand) {
            return Promise.reject(new Error('Publication distribution is not available.'));
        }
        return multiRelayNostrPublicationDistributionCommand({
            publication: entry.publication,
            serializedMaterial: JSON.stringify(entry.publication.toJSON())
        });
    }

    async function distributeEntrySnapshot(entry) {
        if (!snapshotDistributionCommand || !publicationContentStore || !entry.publication.contentReference) {
            return Promise.reject(new Error('Snapshot distribution is not available.'));
        }
        const snapshotBytes = await publicationContentStore.get(entry.publication.contentReference);
        if (snapshotBytes === null || snapshotBytes === undefined) {
            return Promise.reject(new Error('Snapshot distribution is not available.'));
        }
        return snapshotDistributionCommand(snapshotBytes, entry.snapshotDistributionStorage);
    }

    // The only writer of entry.discoveryDistributionAttempt. One entry and
    // its own chosen substrate, never a target list.
    async function distributePublicationForEntry(entry) {
        if (entry.discoveryDistributionAttempt && entry.discoveryDistributionAttempt.distributing) {
            return;
        }
        entry.discoveryDistributionAttempt = { distributing: true, error: null, result: null };
        try {
            const result = await distributeEntryPublication(entry, entry.discoveryDistributionProvider);
            entry.discoveryDistributionAttempt = { distributing: false, error: null, result };
        } catch (error) {
            entry.discoveryDistributionAttempt = { distributing: false, error: error.message, result: null };
        }
    }

    function discoveryDistributionButtonLabel(entry) {
        return (entry.discoveryDistributionAttempt && entry.discoveryDistributionAttempt.distributing)
            ? 'Distributing…'
            : 'Distribute Publication';
    }

    async function distributeSnapshot(entry) {
        if (entry.snapshotDistributionAttempt && entry.snapshotDistributionAttempt.distributing) {
            return;
        }
        entry.snapshotDistributionAttempt = { distributing: true, error: null, result: null };
        try {
            const result = await distributeEntrySnapshot(entry);
            entry.snapshotDistributionAttempt = { distributing: false, error: null, result };
        } catch (error) {
            entry.snapshotDistributionAttempt = { distributing: false, error: error.message, result: null };
        }
    }

    function snapshotDistributionButtonLabel(entry) {
        return (entry.snapshotDistributionAttempt && entry.snapshotDistributionAttempt.distributing)
            ? 'Distributing…'
            : 'Distribute Snapshot';
    }

    // A plain read of the lifecycle store, keyed by this entry's
    // publication id.
    function discoveryObservationsView(entry) {
        if (!publicationDistributionLifecycleStore || typeof publicationDistributionLifecycleStore.getDiscoveryObservations !== 'function') {
            return [];
        }
        return publicationDistributionLifecycleStore.getDiscoveryObservations(entry.publication.id);
    }

    // The Settings route for the entry's chosen Announcement/Discovery
    // substrate.
    function discoveryDistributionConfigurationRoute(entry) {
        return entry.discoveryDistributionProvider === 'arweave'
            ? '/settings/arweave-gateway'
            : '/settings/nostr-relay';
    }

    // The Settings route for the entry's chosen Content backend; IPFS uses
    // /settings/content-provider (there is no IPFS-only settings view).
    function snapshotDistributionConfigurationRoute(entry) {
        return entry.snapshotDistributionStorage === 'ar'
            ? '/settings/arweave-gateway'
            : '/settings/content-provider';
    }

    return {
        publicationDistributionCommand, multiRelayNostrPublicationDistributionCommand,
        snapshotDistributionCommand, snapshotDistributionAvailableStorageTypesCommand,
        defaultAnnouncementDiscoveryProvider, defaultContentDistributionProvider,
        snapshotDistributionStorageTypes, snapshotDistributionStorageOptions,
        publicationDistributionLifecycleStore, distributeEntryPublication, distributeEntrySnapshot,
        distributePublicationForEntry, discoveryDistributionButtonLabel, distributeSnapshot,
        snapshotDistributionButtonLabel, discoveryObservationsView, discoveryDistributionConfigurationRoute,
        snapshotDistributionConfigurationRoute
    };
}
