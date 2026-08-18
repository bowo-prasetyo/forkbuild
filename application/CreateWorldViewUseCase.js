import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { LocalWorldLayoutProvider } from '../world-layout/LocalWorldLayoutProvider.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { LoadPublicationDocumentUseCase } from './LoadPublicationDocumentUseCase.js';
import { SaveDocumentUseCase } from './SaveDocumentUseCase.js';
import { PublishDocumentUseCase } from './PublishDocumentUseCase.js';
import { PlacePublicationUseCase } from './PlacePublicationUseCase.js';
import { MoveWorldPlacementUseCase } from './MoveWorldPlacementUseCase.js';
import { GridPlacementStrategy } from './InitialPlacementStrategy.js';
import { CreateCommandRegistryUseCase } from './CreateCommandRegistryUseCase.js';
import { CreateBrickRegistryUseCase } from './CreateBrickRegistryUseCase.js';
import { ReplayDocumentUseCase } from './ReplayDocumentUseCase.js';
import { RestoreHistoryStateUseCase } from './RestoreHistoryStateUseCase.js';
import { DocumentCloneService } from './DocumentCloneService.js';
import { CopySelectionUseCase } from './CopySelectionUseCase.js';
import { PasteClipboardUseCase } from './PasteClipboardUseCase.js';
import { WorldNavigationSession } from './WorldNavigationSession.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { SearchWorldUseCase } from './SearchWorldUseCase.js';
import { CreateAvatarPresenceSessionUseCase } from './CreateAvatarPresenceSessionUseCase.js';
import { CreateAvatarTemplateRegistryUseCase } from './CreateAvatarTemplateRegistryUseCase.js';
import { LocalAvatarPresenceBroadcastProvider } from '../presence/LocalAvatarPresenceBroadcastProvider.js';

// Builds the world exploration backend and returns a session factory, so
// ui/ never imports storage/, publisher/, or discovery/ directly.
//
// 0.2.14 Update: Wires the LocalContentStore into the LocalPublisherProvider
// so that published snapshots are stored and retrieved via content-addressed
// storage rather than simple local storage keys.
//
// 0.2.23: wires the placement stack (LocalPlacementRegistry +
// PlacePublicationUseCase + MoveWorldPlacementUseCase) that had
// existed since 0.2.10/0.2.15/0.2.16/0.2.18 but was never actually
// connected to World View — CreatePlacementRegistryUseCase already
// builds this exact set of collaborators for other surfaces; this
// wires the same shape directly so WorldNavigationSession can resolve
// and move a document's placement. LocalPlacementRegistry writes
// through to the SAME LocalSpatialIndexProvider WorldLayoutProvider
// already reads, so a placement created/moved here is immediately
// visible to spatial streaming with no separate sync step.
export class CreateWorldViewUseCase {
    execute(identityProvider = null) {
        const storageProvider = new LocalStorageProvider();
        const contentStore = new LocalContentStore(storageProvider);
        const discoveryProvider = new LocalDiscoveryProvider(storageProvider);

        // 0.2.5: Wire the spatial index
        const spatialIndexProvider = new LocalSpatialIndexProvider(storageProvider);
        const worldLayoutProvider = new LocalWorldLayoutProvider(
            spatialIndexProvider,
            discoveryProvider
        );

        // 0.2.23: the placement registry (revisioned, signed
        // PlacementRecords — see core/PlacementRecord.js) — a richer
        // sibling of the plain WorldPlacement the spatial index stores.
        const placementRegistry = new LocalPlacementRegistry(storageProvider, spatialIndexProvider);
        const placePublicationUseCase = new PlacePublicationUseCase(
            spatialIndexProvider,
            discoveryProvider,
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
        const initialPlacementStrategy = new GridPlacementStrategy();

        // 0.2.14: Inject the contentStore into the publisher
        const publisherProvider = new LocalPublisherProvider(storageProvider, contentStore);

        const loadPublicationDocumentUseCase = new LoadPublicationDocumentUseCase(
            storageProvider
        );
        const saveDocumentUseCase = new SaveDocumentUseCase(storageProvider);
        const publishDocumentUseCase = new PublishDocumentUseCase(
            publisherProvider,
            identityProvider,
            placePublicationUseCase,
            initialPlacementStrategy
        );

        const replayDocumentUseCase = new ReplayDocumentUseCase(
            new CreateCommandRegistryUseCase().execute()
        );
        const restoreHistoryStateUseCase = new RestoreHistoryStateUseCase(
            replayDocumentUseCase
        );
        const documentCloneService = new DocumentCloneService();
        // 0.2.26: search runs over the SAME discoveryProvider every
        // other discovery-driven surface (Repository/Author views,
        // fork-policy checks) already reads — see
        // docs/Principles.md, "Discovery Is One Path, Not Two."
        const searchWorldUseCase = new SearchWorldUseCase(discoveryProvider);

        // 0.2.35 — the local user's own AvatarProfile/AvatarPresence
        // stack, built ONLY when someone is actually logged in.
        // CreateAvatarPresenceSessionUseCase already wires BOTH
        // avatarProfileUseCase and presenceSession from the SAME
        // AvatarProfileUseCase instance (see its own comment) — using
        // it here, rather than wiring AvatarProfileUseCase separately,
        // means WorldNavigationSession's onProfileChanged subscription
        // and the presence session's initial avatarId/ownerIdentity
        // are guaranteed to agree, not two independently-constructed
        // views of the same identity's storage.
        //
        // Absent (both null) when nobody is logged in — the exact same
        // "an optional collaborator that simply isn't wired" shape
        // spatialDiscoveryProvider (0.2.30) already established. World
        // View works completely normally with no local avatar; see
        // docs/Principles.md.
        // 0.2.40: presenceVisibilityUseCase travels alongside the same
        // avatarWiring — see CreateAvatarPresenceSessionUseCase's own
        // comment. Absent (null) under the exact same "nobody logged
        // in" condition as avatarProfileUseCase/avatarPresenceSession
        // — with no local avatar to publish, there is nothing for a
        // visibility policy to gate.
        // 0.2.58: avatarProfileVisibilityUseCase travels alongside the
        // same avatarWiring, absent under the identical "nobody logged
        // in" condition — see CreateAvatarPresenceSessionUseCase's own
        // comment. Profile publishing now gates on ITS OWN policy
        // rather than borrowing presence's — see docs/Principles.md,
        // "Profile Gets Its Own Publication Gate, Superseding The
        // Shared One."
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

        // 0.2.37 — Decentralized Avatar Presence Synchronization.
        // Both built UNCONDITIONALLY, regardless of login state — see
        // docs/Principles.md, "Watching Presence Never Requires Having
        // One": a logged-out viewer can still see other replicas'
        // avatars move even though they have none of their own to
        // publish. `avatarTemplateRegistry` is the SAME shape
        // CreateAvatarTemplateRegistryUseCase already builds for the
        // Avatar Creator (0.2.34) — reused here only to resolve a
        // fixed placeholder appearance for an unknown remote avatar,
        // never to render the local avatar (that stays
        // avatarProfileUseCase's job).
        const presenceBroadcastProvider = new LocalAvatarPresenceBroadcastProvider();
        // 0.2.41 — a SEPARATE channel from presence's own, so a
        // torrent of movement updates never competes with (or gets
        // confused for) the rare profile updates on this one — see
        // application/AvatarProfileSyncService.js's own header.
        // LocalAvatarPresenceBroadcastProvider is reused directly
        // (it's already a generic named-BroadcastChannel wrapper with
        // nothing presence-specific baked into its actual logic — see
        // its own header) rather than duplicated into a
        // presence-flavored-in-name-only sibling class.
        const avatarProfileBroadcastProvider = new LocalAvatarPresenceBroadcastProvider('forkbuild:avatar-profile');
        // 0.2.45 — Ephemeral Avatar Interaction Synchronization: a
        // THIRD, separate channel from presence's and profile's own —
        // see application/AvatarInteractionSyncService.js's own header
        // for why interaction traffic is never folded into either.
        // Reuses LocalAvatarPresenceBroadcastProvider directly, the
        // same generic named-BroadcastChannel wrapper 0.2.41 already
        // reused for profile's channel instead of building a
        // presence-flavored-in-name-only sibling class.
        const avatarInteractionBroadcastProvider = new LocalAvatarPresenceBroadcastProvider('forkbuild:avatar-interaction');
        const avatarTemplateRegistry = new CreateAvatarTemplateRegistryUseCase().execute();

        return {
            createSession(registry) {
                return new WorldNavigationSession({
                    registry,
                    loadPublicationDocumentUseCase,
                    worldLayoutProvider,
                    saveDocumentUseCase,
                    publishDocumentUseCase,
                    replayDocumentUseCase,
                    restoreHistoryStateUseCase,
                    identityProvider,
                    documentCloneService,
                    copySelectionUseCase: new CopySelectionUseCase(registry),
                    pasteClipboardUseCase: new PasteClipboardUseCase(),
                    // 0.2.20: fork-on-write needs to resolve a loaded
                    // world's Publication to check its fork policy
                    // before lazily forking it.
                    discoveryProvider,
                    // 0.2.23: placement is where a published world
                    // sits in shared space — a separate concern from
                    // the document itself; see getPlacementInfo/
                    // movePlacement.
                    placementRegistry,
                    moveWorldPlacementUseCase,
                    // 0.2.26: search/navigation — see searchWorld/
                    // getDocumentsAtPosition.
                    searchWorldUseCase,
                    // 0.2.35: the local avatar — see above.
                    avatarProfileUseCase,
                    avatarPresenceSession,
                    // 0.2.40: gates whether the local avatar's
                    // presence is even eligible to publish — see
                    // WorldNavigationSession's own comment.
                    presenceVisibilityUseCase,
                    // 0.2.58: gates whether the local avatar's
                    // PROFILE is even eligible to publish — its own,
                    // independent policy, no longer borrowing
                    // presenceVisibilityUseCase's.
                    avatarProfileVisibilityUseCase,
                    // 0.2.37: remote avatar presence — see above.
                    presenceBroadcastProvider,
                    avatarTemplateRegistry,
                    // 0.2.41: remote avatar appearance — see above.
                    avatarProfileBroadcastProvider,
                    // 0.2.45: ephemeral avatar interaction sync — see above.
                    avatarInteractionBroadcastProvider
                });
            },
            // Expose the spatial index and content store so the application
            // layer can construct spatial use cases for the UI to consume.
            spatialIndexProvider,
            placementRegistry,
            contentStore
        };
    }
}
