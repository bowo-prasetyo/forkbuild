import { inject } from 'vue';
import { sortOptionsByLabel } from '../../../utils/sortOptionsByLabel.js';
import { humanizeStorageType, discoveryProviderConfigurationRoute } from './presentation.js';
import { Publication } from '../../../publisher/Publication.js';
import { describeSteemContentUploadProgress } from '../../../application/steem/SteemContentUploadProgressText.js';
import { displayText, t } from '../../i18n/i18n.js';

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
    // Steem storage reports each post while it stores a Snapshot.
    const steemContentUploadProgress = inject('steemContentUploadProgress', null);
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
    // The publisher's signed placement of a World, announced beside its
    // Snapshot. Without it a World's Snapshot is announced with no position.
    const publisherPlacementClaimLookup = inject('publisherPlacementClaimLookup', null);

    // Same as WorldView's distribution actions. Arweave uses the
    // single-target publicationDistributionCommand; Nostr uses the
    // multi-relay command, which resolves to one result per relay (the
    // result isn't rendered here).
    function distributeEntryPublication(entry, discoveryProviderChoice) {
        // Nostr fans out to every relay; Arweave and Steem each have one publisher.
        if (discoveryProviderChoice === 'arweave' || discoveryProviderChoice === 'steem') {
            if (!publicationDistributionCommand) {
                return Promise.reject(new Error(t('publications.publicationDistributionUnavailable')));
            }
            return publicationDistributionCommand({
                publication: entry.publication,
                serializedMaterial: JSON.stringify(entry.publication.toJSON()),
                discoveryProvider: discoveryProviderChoice
            });
        }
        if (!multiRelayNostrPublicationDistributionCommand) {
            return Promise.reject(new Error(t('publications.publicationDistributionUnavailable')));
        }
        return multiRelayNostrPublicationDistributionCommand({
            publication: entry.publication,
            serializedMaterial: JSON.stringify(entry.publication.toJSON())
        });
    }

    // The checked World a card wraps, or null. A World's Snapshot is the
    // World's own bytes (the wrapped Publication's contentReference), not the
    // card's envelope content, which is the Publication record itself.
    function entryWorld(entry) {
        const content = entry.view && entry.view.resolved ? entry.view.content : null;
        return content instanceof Publication ? content : null;
    }

    // As World View distributes a World: its Snapshot, announced on the
    // chosen substrate with the publisher's signed placement when this device
    // holds one. Any other kind has no World, so its own content is stored and
    // announced by hash alone.
    async function distributeEntrySnapshot(entry) {
        const world = entryWorld(entry);
        const contentReference = world ? world.contentReference : entry.publication.contentReference;
        if (!snapshotDistributionCommand || !publicationContentStore || !contentReference) {
            return Promise.reject(new Error(t('publications.snapshotDistributionIsNotAvailable')));
        }
        const snapshotBytes = await publicationContentStore.get(contentReference);
        if (snapshotBytes === null || snapshotBytes === undefined) {
            return Promise.reject(new Error(world
                ? t('publications.thisWorldSSnapshotIsn')
                : t('publications.snapshotDistributionIsNotAvailable')));
        }
        const claim = world && publisherPlacementClaimLookup ? publisherPlacementClaimLookup.claimFor(world) : {};
        const result = await snapshotDistributionCommand(
            snapshotBytes,
            entry.snapshotDistributionStorage,
            claim.publicationId,
            claim.claimedPosition,
            entry.snapshotDiscoveryProvider,
            claim.placementRecord
        );
        // Which substrate it went to, and whether a position went with it, as
        // chosen for this attempt: the pickers may change afterwards.
        return { ...result, discoveryProvider: entry.snapshotDiscoveryProvider, positioned: Boolean(claim.claimedPosition) };
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
            ? t('publications.distributing')
            : t('publications.distributePublication');
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
            ? t('publications.distributing')
            : t('publications.distributeSnapshot');
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
        return discoveryProviderConfigurationRoute(entry.discoveryDistributionProvider);
    }

    function snapshotDiscoveryConfigurationRoute(entry) {
        return discoveryProviderConfigurationRoute(entry.snapshotDiscoveryProvider);
    }

    // The Steem upload line for an entry whose Snapshot is being stored on
    // Steem right now, or null.
    function steemUploadProgressText(entry) {
        const attempt = entry.snapshotDistributionAttempt;
        if (!attempt || !attempt.distributing || entry.snapshotDistributionStorage !== 'steem' || !steemContentUploadProgress) return null;
        return displayText(describeSteemContentUploadProgress(steemContentUploadProgress.value));
    }

    // The Settings route for the entry's chosen Content backend; IPFS uses
    // /settings/content-provider (there is no IPFS-only settings view).
    function snapshotDistributionConfigurationRoute(entry) {
        if (entry.snapshotDistributionStorage === 'ar') return '/settings/arweave-gateway';
        if (entry.snapshotDistributionStorage === 'steem') return '/settings/steem';
        return '/settings/content-provider';
    }

    return {
        publicationDistributionCommand, multiRelayNostrPublicationDistributionCommand,
        snapshotDistributionCommand, snapshotDistributionAvailableStorageTypesCommand,
        defaultAnnouncementDiscoveryProvider, defaultContentDistributionProvider,
        snapshotDistributionStorageTypes, snapshotDistributionStorageOptions,
        publicationDistributionLifecycleStore, distributeEntryPublication, distributeEntrySnapshot,
        distributePublicationForEntry, discoveryDistributionButtonLabel, distributeSnapshot,
        snapshotDistributionButtonLabel, discoveryObservationsView, discoveryDistributionConfigurationRoute,
        snapshotDistributionConfigurationRoute, snapshotDiscoveryConfigurationRoute, steemUploadProgressText,
        entryWorld
    };
}
