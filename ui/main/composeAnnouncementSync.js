import { LocalStorageProvider } from '../../storage/LocalStorageProvider.js';
import { AnnouncementKind } from '../../application/announcementIndex/AnnouncementKinds.js';
import { AnnouncementSync } from '../../application/announcementIndex/AnnouncementSync.js';
import { AnnouncementSyncCursorStore } from '../../application/announcementIndex/AnnouncementSyncCursorStore.js';
import { AnnouncementSyncScheduler } from '../../application/announcementIndex/AnnouncementSyncScheduler.js';
import { snapshotSyncTarget, placeNamingSyncTarget, commentarySyncTarget } from '../../application/announcementIndex/AnnouncementSyncTargets.js';

// Composition root: the background sync that keeps the Announcement Index
// complete (docs/AnnouncementIndex.md, "Phase 4"). It reads the same relays
// and Arweave gateway discovery already uses, and runs only while the tab is
// visible. Imported Commentary goes through the same notification bridge as
// every other remote Commentary, so a new comment on one of this identity's
// own Publications is announced whichever way it arrived.
export function composeAnnouncementSync({
    announcementIndex, nostrRelayQueryClient, resolvedNostrRelayUrls, resolvedArweaveGatewayUrl,
    steemRuntime = null, publicationCommentaryDistributionExchange, publicationCommentaryRemoteNotificationBridge
}) {
    const sync = new AnnouncementSync({
        cursorStore: new AnnouncementSyncCursorStore({ storage: new LocalStorageProvider() }),
        nostr: nostrRelayQueryClient ? { queryImpl: nostrRelayQueryClient, relayUrls: resolvedNostrRelayUrls } : null,
        arweave: { gatewayUrl: resolvedArweaveGatewayUrl }
    });

    const importCommentaryEnvelope = (envelope) => {
        const result = publicationCommentaryDistributionExchange.importCommentaryEnvelope(envelope);
        try {
            publicationCommentaryRemoteNotificationBridge.handleCommentaryReceived(result);
        } catch {
            // A failed notification never undoes the import.
        }
        return result;
    };
    const coreTargets = [
        snapshotSyncTarget({ index: announcementIndex, steemSource: steemRuntime ? steemRuntime.snapshotDiscoveryQueryService : null }),
        commentarySyncTarget({ importCommentaryEnvelope, steemDistribution: steemRuntime ? steemRuntime.commentaryDistribution : null })
    ];

    const announcementSyncScheduler = new AnnouncementSyncScheduler({
        sync,
        targets: () => ({
            core: coreTargets,
            rotating: announcementIndex.watchedTags(AnnouncementKind.PLACE_NAMING).map((tag) => placeNamingSyncTarget({
                index: announcementIndex, tag, steemSource: steemRuntime ? steemRuntime.placeNamingDiscoverySource : null
            }))
        }),
        isActive: () => typeof document === 'undefined' || document.visibilityState !== 'hidden'
    });

    return { announcementSyncScheduler };
}
