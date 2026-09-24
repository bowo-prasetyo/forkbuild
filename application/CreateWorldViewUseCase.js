import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { CompositeDiscoveryProvider } from '../discovery/CompositeDiscoveryProvider.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { LocalWorldLayoutProvider } from '../world-layout/LocalWorldLayoutProvider.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { LoadPublicationDocumentUseCase } from './LoadPublicationDocumentUseCase.js';
import { SaveDocumentUseCase } from './SaveDocumentUseCase.js';
import { LoadDocumentUseCase } from './LoadDocumentUseCase.js';
import { StructureDocumentResolver } from './StructureDocumentResolver.js';
import { PublishDocumentUseCase } from './PublishDocumentUseCase.js';
import { UnpublishDocumentUseCase } from './UnpublishDocumentUseCase.js';
import { PlacePublicationUseCase } from './PlacePublicationUseCase.js';
import { MoveWorldPlacementUseCase } from './MoveWorldPlacementUseCase.js';
import { RemoveWorldPlacementUseCase } from './RemoveWorldPlacementUseCase.js';
import { GridPlacementStrategy } from './InitialPlacementStrategy.js';
import { CreateCommandRegistryUseCase } from './CreateCommandRegistryUseCase.js';
import { CreateBrickRegistryUseCase } from './CreateBrickRegistryUseCase.js';
import { ReplayDocumentUseCase } from './ReplayDocumentUseCase.js';
import { RestoreHistoryStateUseCase } from './RestoreHistoryStateUseCase.js';
import { DocumentCloneService } from './DocumentCloneService.js';
import { WorldNavigationSession } from './WorldNavigationSession.js';
import { WorldCommandPropagationUseCase } from './WorldCommandPropagationUseCase.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LoadPublishedWorldSessionUseCase } from './LoadPublishedWorldSessionUseCase.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { SearchWorldUseCase } from './SearchWorldUseCase.js';
import { CreateAvatarPresenceSessionUseCase } from './CreateAvatarPresenceSessionUseCase.js';
import { CreateAvatarTemplateRegistryUseCase } from './CreateAvatarTemplateRegistryUseCase.js';
import { LocalAvatarPresenceBroadcastProvider } from '../presence/LocalAvatarPresenceBroadcastProvider.js';
import { PeerAvatarPresenceBroadcastProvider } from '../presence/PeerAvatarPresenceBroadcastProvider.js';
import { AvatarProfileVisibilityPolicy } from '../core/AvatarProfileVisibilityPolicy.js';
import { FriendshipState } from '../core/FriendshipState.js';
import { WorldAuthorizationService } from './WorldAuthorizationService.js';
import { WorldMembershipUseCase } from './WorldMembershipUseCase.js';
import { WorldPresenceUseCase } from './WorldPresenceUseCase.js';
import { WorldSpatialPresenceUseCase } from './WorldSpatialPresenceUseCase.js';
import { LocalWorldExperienceStore } from './LocalWorldExperienceStore.js';
import { CreateWorldPlaceNamingUseCase } from './CreateWorldPlaceNamingUseCase.js';
import { PublicationCommentaryStore } from '../storage/PublicationCommentaryStore.js';
import { CanCommentOnPublicationUseCase } from './CanCommentOnPublicationUseCase.js';
import { GetPublicationCommentariesUseCase } from './GetPublicationCommentariesUseCase.js';
import { AddPublicationCommentaryUseCase } from './AddPublicationCommentaryUseCase.js';
import { NotificationEventStore } from '../storage/NotificationEventStore.js';
import { GetRecipientNotificationEventsUseCase } from './GetRecipientNotificationEventsUseCase.js';
import { PublicationCommentaryNotificationProducer } from './PublicationCommentaryNotificationProducer.js';
import { AvatarInventoryPersistenceStore } from '../storage/AvatarInventoryPersistenceStore.js';
import { VehicleRuntimeInstancePersistenceStore } from '../storage/VehicleRuntimeInstancePersistenceStore.js';
import { AnimalRuntimeInstancePersistenceStore } from '../storage/AnimalRuntimeInstancePersistenceStore.js';

// Builds the world exploration backend and returns a session factory, so ui/
// never imports storage/, publisher/ or discovery/ directly. The placement
// registry writes through to the same spatial index the layout provider reads,
// so placement changes are visible to streaming immediately.

export class CreateWorldViewUseCase {
    // The peer collaborators (message bus, registry, friendship, blocking, device
    // authorization) are the app-wide instances from ui/main.js, never owned here.
    //
    // Whether the avatar social layer rides peer connections or falls back to the
    // same-origin BroadcastChannel is decided once, by whether a peer transport was
    // supplied, never by whether anyone is connected (see docs/Principles.md, "No
    // Authenticated Peers Is A Population Of Zero, Never An Absent Transport").
    //
    // isBlocked is wired to both the outbound transports and the inbound trust
    // boundaries (docs/Principles.md, "Blocking Is Wired Twice, Once Per
    // Direction, Because Neither Side May Trust The Other To Enforce It").
    // deviceAuthorizationPropagationUseCase lets edit authority follow the device's
    // parent identity; without it ownership uses the signing identity directly.
    execute(identityProvider = null, { peerMessageBus = null, connectedPeerRegistry = null, friendRelationshipUseCase = null, peerBlockUseCase = null, deviceAuthorizationPropagationUseCase = null, decentralizedPublicationDiscoveryProvider = null } = {}) {
        const storageProvider = new LocalStorageProvider();
        const contentStore = new LocalContentStore(storageProvider);
        const discoveryProvider = new LocalDiscoveryProvider(storageProvider);
        // A separate discovery capability that also includes Repository-admitted
        // publications, used for publication actions and world layout. The plain
        // discoveryProvider stays narrower on purpose: it backs fork-policy checks, and
        // widening it would extend license enforcement to unrelated local documents.
        // Equals discoveryProvider when there is nothing to merge.
        const publicationActionDiscoveryProvider = decentralizedPublicationDiscoveryProvider
            ? new CompositeDiscoveryProvider([discoveryProvider, decentralizedPublicationDiscoveryProvider])
            : discoveryProvider;

        const spatialIndexProvider = new LocalSpatialIndexProvider(storageProvider);
        const worldLayoutProvider = new LocalWorldLayoutProvider(
            spatialIndexProvider,
            publicationActionDiscoveryProvider
        );

        const placementRegistry = new LocalPlacementRegistry(storageProvider, spatialIndexProvider);
        // Uses the wider provider so a Repository-admitted publication can be placed;
        // publishing's automatic initial placement still resolves as before.
        const placePublicationUseCase = new PlacePublicationUseCase(
            spatialIndexProvider,
            publicationActionDiscoveryProvider,
            new LoadPublicationDocumentUseCase(storageProvider),
            new CreateBrickRegistryUseCase().execute(),
            placementRegistry,
            identityProvider
        );
        const moveWorldPlacementUseCase = new MoveWorldPlacementUseCase(
            spatialIndexProvider,
            placementRegistry,
            null,
            identityProvider
        );
        const removeWorldPlacementUseCase = new RemoveWorldPlacementUseCase(
            spatialIndexProvider,
            placementRegistry
        );
        const initialPlacementStrategy = new GridPlacementStrategy();

        const publisherProvider = new LocalPublisherProvider(storageProvider, contentStore);
        // Only a fallback for when this replica has no local copy of the document: it
        // reads a publication's verified snapshot without copying bytes into
        // storage[documentId].
        const loadPublishedWorldSessionUseCase = new LoadPublishedWorldSessionUseCase(
            publisherProvider,
            new DocumentSerializer(),
            contentStore
        );
        const unpublishDocumentUseCase = new UnpublishDocumentUseCase(publisherProvider);

        const publicationCommentaryStore = new PublicationCommentaryStore(storageProvider);
        const canCommentOnPublicationUseCase = new CanCommentOnPublicationUseCase(discoveryProvider);
        const getPublicationCommentariesUseCase = new GetPublicationCommentariesUseCase(publicationCommentaryStore);
        const addPublicationCommentaryUseCase = new AddPublicationCommentaryUseCase(
            publicationCommentaryStore,
            identityProvider,
            canCommentOnPublicationUseCase
        );

        // Needs a real identity (there is no anonymous recipient), so it is null
        // without one; the session then reports no notification history.
        const notificationEventStore = new NotificationEventStore(storageProvider);
        const getRecipientNotificationEventsUseCase = identityProvider
            ? new GetRecipientNotificationEventsUseCase(notificationEventStore, identityProvider)
            : null;

        const avatarInventoryPersistenceStore = new AvatarInventoryPersistenceStore(storageProvider);
        const vehicleRuntimeInstancePersistenceStore = new VehicleRuntimeInstancePersistenceStore(storageProvider);
        const animalRuntimeInstancePersistenceStore = new AnimalRuntimeInstancePersistenceStore(storageProvider);

        // Wraps comment creation with a notification producer, so a new comment also
        // stores a notification event. The session only calls execute() and is
        // unaware of the decoration. A sink failure propagates after the comment is
        // already saved (no rollback); the store deduplicates retries.
        const publicationCommentaryCapability = new PublicationCommentaryNotificationProducer(
            addPublicationCommentaryUseCase,
            discoveryProvider,
            (notificationEvent) => notificationEventStore.save(notificationEvent)
        );

        const loadPublicationDocumentUseCase = new LoadPublicationDocumentUseCase(
            storageProvider
        );
        const saveDocumentUseCase = new SaveDocumentUseCase(storageProvider);
        const localWorldExperienceStore = new LocalWorldExperienceStore({ storageProvider });
        const { placeNamingClaimUseCase, localNamePreferenceStore, placeNamingClaimExchange } = identityProvider
            ? new CreateWorldPlaceNamingUseCase().execute(identityProvider)
            : { placeNamingClaimUseCase: null, localNamePreferenceStore: null, placeNamingClaimExchange: null };
        // structureDocumentResolver lets World View render (and so pick and inspect)
        // StructurePlacements; loadDocumentUseCase only looks up saved titles.
        const structureDocumentResolver = new StructureDocumentResolver(storageProvider);
        const loadDocumentUseCase = new LoadDocumentUseCase(storageProvider);
        const publishDocumentUseCase = new PublishDocumentUseCase(
            publisherProvider,
            identityProvider,
            placePublicationUseCase,
            initialPlacementStrategy
        );

        // One registry reconstructs both replayed and network-received commands.
        const commandRegistry = new CreateCommandRegistryUseCase().execute();
        const replayDocumentUseCase = new ReplayDocumentUseCase(commandRegistry);
        const restoreHistoryStateUseCase = new RestoreHistoryStateUseCase(
            replayDocumentUseCase
        );
        const documentCloneService = new DocumentCloneService();
        // See docs/Principles.md, "Discovery Is One Path, Not Two."
        const searchWorldUseCase = new SearchWorldUseCase(discoveryProvider);

        // The local avatar stack, built only when someone is logged in; World View
        // works normally without one. CreateAvatarPresenceSessionUseCase builds the
        // profile and presence session from one AvatarProfileUseCase so they agree on
        // identity. Presence and profile each have their own visibility policy.
        let avatarProfileUseCase = null;
        let avatarPresenceSession = null;
        let presenceVisibilityUseCase = null;
        let avatarProfileVisibilityUseCase = null;
        if (identityProvider && typeof identityProvider.currentUser === 'function' && identityProvider.currentUser()) {
            const avatarWiring = new CreateAvatarPresenceSessionUseCase().execute(identityProvider);
            avatarProfileUseCase = avatarWiring.avatarProfileUseCase;
            avatarPresenceSession = avatarWiring.presenceSession;
            presenceVisibilityUseCase = avatarWiring.presenceVisibilityUseCase;
            avatarProfileVisibilityUseCase = avatarWiring.avatarProfileVisibilityUseCase;
        }

        // Remote presence is built regardless of login (docs/Principles.md, "Watching
        // Presence Never Requires Having One"). The real peer transport is preferred
        // when wired; otherwise the BroadcastChannel development transport is used
        // (docs/Principles.md, "BroadcastChannel Is A Development Transport, Never A
        // Production One").
        const usePeerTransport = Boolean(peerMessageBus && connectedPeerRegistry);

        // Undefined without friendship wiring, where policies fall back to the manual
        // allow-list.
        const isFriend = friendRelationshipUseCase
            ? (peerIdentityId) => friendRelationshipUseCase.getState(peerIdentityId) === FriendshipState.FRIEND
            : undefined;
        const hasFriend = friendRelationshipUseCase
            ? () => friendRelationshipUseCase.getRelationships().some((relationship) => relationship.isFriend)
            : null;

        // Undefined without blocking wiring: nothing is blocked.
        const isBlocked = peerBlockUseCase
            ? (peerIdentityId) => peerBlockUseCase.isBlocked(peerIdentityId)
            : undefined;

        // One app-scoped authorization service, consulted fresh on every mutation.
        // worldMembershipUseCaseRef is filled in by createSession(): the membership use
        // case needs a session, and this service is built before any session exists.
        const worldMembershipUseCaseRef = { current: null };
        const worldAuthorizationService = new WorldAuthorizationService({
            identityProvider,
            resolveSocialIdentity: deviceAuthorizationPropagationUseCase
                ? () => deviceAuthorizationPropagationUseCase.resolveOwnSocialIdentity()
                : null,
            isBlocked: isBlocked || null,
            resolveWorldEditGrant: (worldDocumentId, viewerIdentityId) => worldMembershipUseCaseRef.current
                ? worldMembershipUseCaseRef.current.hasActiveGrant(worldDocumentId, viewerIdentityId)
                : false
        });

        // Reads the presence visibility policy fresh on every advertise().
        const presenceBroadcastProvider = usePeerTransport
            ? new PeerAvatarPresenceBroadcastProvider({
                peerMessageBus,
                connectedPeerRegistry,
                ...(presenceVisibilityUseCase ? { getVisibilityPolicy: () => presenceVisibilityUseCase.getPolicy() } : {}),
                ...(isFriend ? { isFriend } : {}),
                ...(isBlocked ? { isBlocked } : {})
            })
            : new LocalAvatarPresenceBroadcastProvider();
        // A separate channel from presence, so frequent movement updates never compete
        // with rare profile updates, and gated by the profile's own visibility policy.
        const avatarProfileBroadcastProvider = usePeerTransport
            ? new PeerAvatarPresenceBroadcastProvider({
                peerMessageBus,
                connectedPeerRegistry,
                protocol: 'forkbuild:avatar-profile',
                getVisibilityPolicy: avatarProfileVisibilityUseCase
                    ? () => avatarProfileVisibilityUseCase.getPolicy()
                    : () => AvatarProfileVisibilityPolicy.default(),
                ...(isFriend ? { isFriend } : {}),
                ...(isBlocked ? { isBlocked } : {})
            })
            : new LocalAvatarPresenceBroadcastProvider('forkbuild:avatar-profile');
        // A third channel for ephemeral interactions, gated by the presence policy.
        const avatarInteractionBroadcastProvider = usePeerTransport
            ? new PeerAvatarPresenceBroadcastProvider({
                peerMessageBus,
                connectedPeerRegistry,
                protocol: 'forkbuild:avatar-interaction',
                ...(presenceVisibilityUseCase ? { getVisibilityPolicy: () => presenceVisibilityUseCase.getPolicy() } : {}),
                ...(isFriend ? { isFriend } : {}),
                ...(isBlocked ? { isBlocked } : {})
            })
            : new LocalAvatarPresenceBroadcastProvider('forkbuild:avatar-interaction');
        const avatarTemplateRegistry = new CreateAvatarTemplateRegistryUseCase().execute();

        return {
            createSession(registry) {
                // resolveWorldDocument needs the session itself, which does not exist yet:
                // sessionRef is set right after construction, and the closure only runs later.
                // Without a full peer stack this is null (purely local editing).
                let sessionRef = null;
                const worldMembershipUseCase = (identityProvider && peerMessageBus && connectedPeerRegistry)
                    ? new WorldMembershipUseCase(new LocalStorageProvider(), identityProvider, {
                        peerMessageBus,
                        connectedPeerRegistry,
                        resolveWorldDocument: (worldDocumentId) => (sessionRef ? sessionRef.getDocument(worldDocumentId) : null)
                    })
                    : null;
                worldMembershipUseCaseRef.current = worldMembershipUseCase;
                const worldCommandPropagation = (identityProvider && peerMessageBus && connectedPeerRegistry && deviceAuthorizationPropagationUseCase)
                    ? new WorldCommandPropagationUseCase({
                        peerMessageBus,
                        connectedPeerRegistry,
                        deviceAuthorization: deviceAuthorizationPropagationUseCase,
                        identityProvider,
                        commandRegistry,
                        resolveWorldDocument: (worldDocumentId) => (sessionRef ? sessionRef.getDocument(worldDocumentId) : null),
                        isBlocked: isBlocked || null,
                        // Lets a non-owner with a signed edit grant propagate operations too.
                        resolveWorldEditGrant: worldMembershipUseCase
                            ? (worldDocumentId, viewerIdentityId) => worldMembershipUseCase.hasActiveGrant(worldDocumentId, viewerIdentityId)
                            : null
                    })
                    : null;
                // resolveCanEdit asks whether another participant can edit, so it re-derives
                // ownership (raw authorIdentityId) or an active grant directly rather than
                // using the viewer-centric authorization service.
                const worldPresenceUseCase = (peerMessageBus && connectedPeerRegistry && deviceAuthorizationPropagationUseCase)
                    ? new WorldPresenceUseCase({
                        peerMessageBus,
                        connectedPeerRegistry,
                        deviceAuthorization: deviceAuthorizationPropagationUseCase,
                        resolveCanEdit: (worldDocumentId, identityId) => {
                            const document = sessionRef ? sessionRef.getDocument(worldDocumentId) : null;
                            if (!document || !document.metadata || !identityId) {
                                return false;
                            }
                            if (document.metadata.authorIdentityId && document.metadata.authorIdentityId === identityId) {
                                return true;
                            }
                            return Boolean(worldMembershipUseCase && worldMembershipUseCase.hasActiveGrant(worldDocumentId, identityId));
                        }
                    })
                    : null;
                // A separate protocol from worldPresenceUseCase; either can be wired alone.
                const worldSpatialPresenceUseCase = (peerMessageBus && connectedPeerRegistry && deviceAuthorizationPropagationUseCase)
                    ? new WorldSpatialPresenceUseCase({
                        peerMessageBus,
                        connectedPeerRegistry,
                        deviceAuthorization: deviceAuthorizationPropagationUseCase
                    })
                    : null;
                const session = new WorldNavigationSession({
                    registry,
                    loadPublicationDocumentUseCase,
                    loadPublishedWorldSessionUseCase,
                    worldLayoutProvider,
                    saveDocumentUseCase,
                    publishDocumentUseCase,
                    replayDocumentUseCase,
                    restoreHistoryStateUseCase,
                    identityProvider,
                    documentCloneService,
                    // World View has no brick copy/paste/repeat (docs/Principles.md, "World View
                    // Observes and Navigates; Editor Mutates and Builds"). Fork-on-write needs the
                    // publication to check its fork policy.
                    discoveryProvider,
                    publicationActionDiscoveryProvider,
                    placementRegistry,
                    moveWorldPlacementUseCase,
                    placePublicationUseCase,
                    removeWorldPlacementUseCase,
                    unpublishDocumentUseCase,
                    getPublicationCommentariesUseCase,
                    addPublicationCommentaryUseCase: publicationCommentaryCapability,
                    getRecipientNotificationEventsUseCase,
                    searchWorldUseCase,
                    avatarProfileUseCase,
                    avatarPresenceSession,
                    presenceVisibilityUseCase,
                    avatarProfileVisibilityUseCase,
                    presenceBroadcastProvider,
                    avatarTemplateRegistry,
                    avatarProfileBroadcastProvider,
                    avatarInteractionBroadcastProvider,
                    hasFriend,
                    isBlocked,
                    structureResolver: structureDocumentResolver,
                    loadDocumentUseCase,
                    worldAuthorizationService,
                    worldCommandPropagation,
                    worldMembershipUseCase,
                    worldPresenceUseCase,
                    worldSpatialPresenceUseCase,
                    localWorldExperienceStore,
                    placeNamingClaimUseCase,
                    localNamePreferenceStore,
                    placeNamingClaimExchange,
                    avatarInventoryPersistenceStore,
                    vehicleRuntimeInstancePersistenceStore,
                    animalRuntimeInstancePersistenceStore,
                    peerMessageBus,
                    connectedPeerRegistry
                });
                sessionRef = session;
                return session;
            },
            // Exposed so the application layer can build spatial use cases for the UI.
            spatialIndexProvider,
            placementRegistry,
            contentStore
        };
    }
}
