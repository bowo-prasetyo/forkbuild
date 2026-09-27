import { LocalStorageProvider } from '../../storage/LocalStorageProvider.js';
import { SNAPSHOT_CELL_TAG_PREFIX } from '../../core/NarrowDiscoveryTags.js';
import { AnnouncementKind } from '../../application/announcementIndex/AnnouncementKinds.js';
import { AnnouncementSync } from '../../application/announcementIndex/AnnouncementSync.js';
import { AnnouncementSyncCursorStore } from '../../application/announcementIndex/AnnouncementSyncCursorStore.js';
import { BackgroundAnnouncementSync } from '../../application/announcementIndex/BackgroundAnnouncementSync.js';
import { snapshotSyncTarget, placeNamingSyncTarget, commentarySyncTarget } from '../../application/announcementIndex/AnnouncementSyncTargets.js';
import { AnnouncementIndexPeerExchange } from '../../application/announcementIndex/AnnouncementIndexPeerExchange.js';

// Records from peers arrive in bursts, one RESPONSE at a time.
const PEER_CHANGE_DEBOUNCE_MS = 1000;

// Composition root: the background sync and the peer exchange that keep the
// Announcement Index complete (docs/AnnouncementIndex.md, "Phase 4" and
// "Phase 5"). The sync reads the same relays and Arweave gateway discovery
// already uses, and runs only while the tab is visible. Imported Commentary
// goes through the same notification bridge as every other remote Commentary,
// so a new comment on one of this identity's own Publications is announced
// whichever way it arrived.
export function composeAnnouncementSync({
    announcementIndex, nostrRelayQueryClient, resolvedNostrRelayUrls, resolvedArweaveGatewayUrl,
    steemRuntime = null, publicationCommentaryDistributionExchange, publicationCommentaryRemoteNotificationBridge,
    peerMessageBus, connectedPeerRegistry
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

    const backgroundAnnouncementSync = new BackgroundAnnouncementSync({
        sync,
        targets: () => ({
            core: coreTargets,
            rotating: [
                // Map cells World View has searched; Steem has no cell tags.
                ...announcementIndex.watchedTags(AnnouncementKind.SNAPSHOT)
                    .filter((tag) => tag.startsWith(SNAPSHOT_CELL_TAG_PREFIX))
                    .map((tag) => snapshotSyncTarget({ index: announcementIndex, tag })),
                ...announcementIndex.watchedTags(AnnouncementKind.PLACE_NAMING).map((tag) => placeNamingSyncTarget({
                    index: announcementIndex, tag, steemSource: steemRuntime ? steemRuntime.placeNamingDiscoverySource : null
                }))
            ]
        }),
        isActive: () => typeof document === 'undefined' || document.visibilityState !== 'hidden'
    });

    // One signal for "the index holds more than before", whether from a sync
    // run or from a peer, so World View can show it without searching again.
    const changeListeners = new Set();
    const notifyChanged = () => {
        for (const listener of changeListeners) {
            try {
                listener();
            } catch {
                // One listener failing never stops the others.
            }
        }
    };
    backgroundAnnouncementSync.onSynced(notifyChanged);
    let peerChangeTimer = null;
    const announcementIndexPeerExchange = new AnnouncementIndexPeerExchange({
        index: announcementIndex,
        peerMessageBus,
        connectedPeerRegistry,
        onRecordsReceived: () => {
            if (peerChangeTimer !== null) return;
            peerChangeTimer = setTimeout(() => {
                peerChangeTimer = null;
                notifyChanged();
            }, PEER_CHANGE_DEBOUNCE_MS);
        }
    });
    const announcementIndexChanges = Object.freeze({
        onChanged(listener) {
            changeListeners.add(listener);
            return () => changeListeners.delete(listener);
        }
    });

    return { backgroundAnnouncementSync, announcementIndexPeerExchange, announcementIndexChanges };
}
