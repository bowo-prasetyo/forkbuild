import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { LocalWorldLayoutProvider } from '../world-layout/LocalWorldLayoutProvider.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { LoadPublicationDocumentUseCase } from './LoadPublicationDocumentUseCase.js';
import { SaveDocumentUseCase } from './SaveDocumentUseCase.js';
import { LoadDocumentUseCase } from './LoadDocumentUseCase.js';
import { StructureDocumentResolver } from './StructureDocumentResolver.js';
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
import { WorldCommandPropagationUseCase } from './WorldCommandPropagationUseCase.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
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
    // 0.2.59 — Peer-Based Avatar Social Transport. `peerMessageBus` /
    // `connectedPeerRegistry` are the SAME app-wide peer/PeerMessageBus.js
    // and application/ConnectedPeerRegistry.js (via PeerSessionManager)
    // ui/main.js already builds for the friendship protocol (0.2.57) —
    // shared, injected collaborators this use case never owns or
    // disposes, exactly the convention presence/
    // PeerAvatarPresenceBroadcastProvider.js's own header already
    // documents. `friendRelationshipUseCase` supplies the `isFriend`/
    // `hasFriend` predicates every visibility policy already knows how
    // to consult (0.2.58) — this use case never reads a
    // FriendshipRecord itself, only the predicate.
    //
    // Whether World View's avatar social layer (presence/profile/
    // interaction) actually rides authenticated peer connections, or
    // falls back to the same-origin BroadcastChannel transport 0.2.37
    // introduced, is decided ONCE, right here, by whether a real peer
    // transport was actually supplied — never by whether any peer is
    // CURRENTLY connected. A caller with no authenticated peers right
    // now still gets the peer transport; it just has nobody to fan out
    // to yet (see presence/PeerAvatarPresenceBroadcastProvider.js#advertise()
    // — an empty connectedPeerRegistry.list() is simply a no-op send).
    // "Nobody sees me right now" and "I have no transport at all" are
    // different facts — see docs/Principles.md, "No Authenticated
    // Peers Is A Population Of Zero, Never An Absent Transport"
    // (0.2.59).
    //
    // 0.2.60 — `peerBlockUseCase` supplies the SAME kind of `isBlocked`
    // predicate every visibility policy/trust boundary already knows
    // how to consult, mirroring `friendRelationshipUseCase`'s own
    // wiring exactly: this use case never reads a PeerBlockRecord
    // itself, only the predicate, passed to BOTH the outbound transport
    // (each PeerAvatarPresenceBroadcastProvider's own `isBlocked`) and
    // the inbound one (WorldNavigationSession's own `isBlocked`, which
    // builds each protocol's trust boundary with it) — see docs/
    // Principles.md, "Blocking Is Wired Twice, Once Per Direction,
    // Because Neither Side May Trust The Other To Enforce It" (0.2.60).
    // 0.2.95 — `deviceAuthorizationPropagationUseCase` is the SAME
    // app-wide DeviceAuthorizationPropagationUseCase ui/main.js already
    // builds for friendship/chat/voice (0.2.78/0.2.79/0.2.83) —
    // threaded through only so worldAuthorizationService below can
    // resolve `resolveOwnSocialIdentity()`, the reflexive query that
    // makes EDIT authority follow the CURRENTLY-AUTHENTICATED device's
    // own resolved parent identity rather than its bare, per-device
    // signing key. Optional: a caller that doesn't wire one (any
    // pre-0.2.95 test) gets ownership resolved from identityProvider's
    // own signing identity directly — correct for the common single-
    // device case, just unaware that a second device could ever speak
    // for the same identity. See application/WorldAuthorizationService.js's
    // own header.
    execute(identityProvider = null, { peerMessageBus = null, connectedPeerRegistry = null, friendRelationshipUseCase = null, peerBlockUseCase = null, deviceAuthorizationPropagationUseCase = null } = {}) {
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
        // 0.2.93 — World View Instance Inspection. Both read from the
        // SAME local storageProvider ui/views/EditorView.js's own
        // CreatePersistenceUseCase already builds its equivalents from
        // (application/CreatePersistenceUseCase.js) — the local-editing,
        // same-replica scenario the milestone's flagship exercises.
        // structureDocumentResolver is what makes World View actually
        // RENDER (and therefore pick/inspect) a StructurePlacement at
        // all — see renderer/WorldRenderer.js's own 0.2.90 header;
        // before this it was always null here. loadDocumentUseCase
        // resolves a placement's referenced document to a human title
        // for the inspection panel (WorldNavigationSession#
        // getSavedDocumentTitle()) — never used to LOAD a document into
        // this session itself, only to look up its saved title.
        const structureDocumentResolver = new StructureDocumentResolver(storageProvider);
        const loadDocumentUseCase = new LoadDocumentUseCase(storageProvider);
        const publishDocumentUseCase = new PublishDocumentUseCase(
            publisherProvider,
            identityProvider,
            placePublicationUseCase,
            initialPlacementStrategy
        );

        // 0.2.97 — shared with the new worldCommandPropagation wiring
        // below (createSession()): the SAME registry both reconstructs
        // a replayed command AND reconstructs one received over the
        // network — one vocabulary, never two independently-maintained
        // ones.
        const commandRegistry = new CreateCommandRegistryUseCase().execute();
        const replayDocumentUseCase = new ReplayDocumentUseCase(commandRegistry);
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
        // 0.2.59 — a real peer transport is preferred whenever the
        // caller actually wired one; a caller that doesn't (most
        // existing tests, and any future headless/embedded use of this
        // use case) gets the exact same LOCAL DEVELOPMENT TRANSPORT
        // (BroadcastChannel) 0.2.37/0.2.41/0.2.45 always built — see
        // presence/LocalAvatarPresenceBroadcastProvider.js's own header:
        // it simulates decentralized presence across same-origin tabs,
        // useful for local development and testing, but it is not a
        // real Internet peer network and is no longer the PRIMARY
        // transport once a real one is available. See
        // docs/Principles.md, "BroadcastChannel Is A Development
        // Transport, Never A Production One" (0.2.59).
        const usePeerTransport = Boolean(peerMessageBus && connectedPeerRegistry);

        // `isFriend`/`hasFriend`: 0.2.58 already taught every
        // visibility policy AND WorldNavigationSession how to consult
        // these predicates — this is simply the first caller to
        // actually supply them from a real, live FriendRelationshipUseCase
        // rather than a test-only closure. Absent (undefined/null) when
        // no friendRelationshipUseCase is wired, which is the exact
        // pre-0.2.59 "FRIENDS means only the manual allow-list" fallback
        // every policy already implements on its own.
        const isFriend = friendRelationshipUseCase
            ? (peerIdentityId) => friendRelationshipUseCase.getState(peerIdentityId) === FriendshipState.FRIEND
            : undefined;
        const hasFriend = friendRelationshipUseCase
            ? () => friendRelationshipUseCase.getRelationships().some((relationship) => relationship.isFriend)
            : null;

        // 0.2.60 — see this method's own header above. Absent
        // (undefined) when no peerBlockUseCase is wired, which is the
        // exact pre-0.2.60 "nothing is ever blocked" fallback every
        // transport/trust-boundary already implements on its own.
        const isBlocked = peerBlockUseCase
            ? (peerIdentityId) => peerBlockUseCase.isBlocked(peerIdentityId)
            : undefined;

        // 0.2.95 — World Editing Authorization Foundation. One
        // app-scoped WorldAuthorizationService, built here (never
        // per-document, never per-selection) so its decision is
        // consulted fresh on every mutation attempt rather than
        // snapshotted at session-construction time — see that class's
        // own header. `resolveSocialIdentity` reuses the SAME
        // resolveOwnSocialIdentity() 0.2.83 already built for "who am I,
        // socially" (never a new device-resolution mechanism);
        // `isBlocked` reuses the SAME predicate this method already
        // derives for the avatar trust boundaries above.
        // 0.2.98 — Shared World Membership & Collaborative Presence.
        // `worldMembershipUseCaseRef` is a MUTABLE box, assigned once
        // `createSession()` below actually constructs a real
        // WorldMembershipUseCase — the identical "assigned after
        // construction, read later by a closure at call time" pattern
        // this method's own `sessionRef` (see createSession() below)
        // already establishes for `resolveWorldDocument`. Needed
        // because worldMembershipUseCase's OWN `resolveWorldDocument`
        // needs a session to already exist, while worldAuthorizationService
        // is built here, once, BEFORE any session does.
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

        // Presence's own transport. getVisibilityPolicy reads
        // presenceVisibilityUseCase FRESH on every advertise() (never
        // cached) once one is wired (logged in); absent (logged out),
        // PeerAvatarPresenceBroadcastProvider's own default already
        // matches LocalAvatarPresenceBroadcastProvider's unconditional
        // "advertise to everyone" behavior, so nothing extra is passed.
        const presenceBroadcastProvider = usePeerTransport
            ? new PeerAvatarPresenceBroadcastProvider({
                peerMessageBus,
                connectedPeerRegistry,
                ...(presenceVisibilityUseCase ? { getVisibilityPolicy: () => presenceVisibilityUseCase.getPolicy() } : {}),
                ...(isFriend ? { isFriend } : {}),
                ...(isBlocked ? { isBlocked } : {})
            })
            : new LocalAvatarPresenceBroadcastProvider();
        // 0.2.41 — a SEPARATE channel/protocol from presence's own, so a
        // torrent of movement updates never competes with (or gets
        // confused for) the rare profile updates on this one — see
        // application/AvatarProfileSyncService.js's own header. Its own
        // AvatarProfileVisibilityPolicy is consulted here too — see
        // core/AvatarProfileVisibilityPolicy.js's own header: "who may
        // see my presence" and "who may see my appearance" are
        // different questions, never the same policy instance.
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
        // 0.2.45 — Ephemeral Avatar Interaction Synchronization: a
        // THIRD, separate channel/protocol from presence's and
        // profile's own — see application/AvatarInteractionSyncService.js's
        // own header for why interaction traffic is never folded into
        // either. 0.2.59: reuses presence's OWN visibility policy for
        // its per-peer gate (never profile's), mirroring
        // WorldNavigationSession._publishAvatarInteraction()'s own
        // coarse gate, which has always reused presenceVisibilityUseCase
        // rather than gaining a fourth, interaction-specific policy.
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
                // 0.2.97 — Shared World Ordering & Conflict Resolution.
                // Closes the composition gap 0.2.96 explicitly left
                // open (see application/WorldCommandPropagationUseCase.js's
                // own header): every OTHER collaborator this method
                // builds is created here, before the session exists;
                // `resolveWorldDocument` cannot be — it needs to ask
                // the session ITSELF "what do you currently have loaded
                // for this id," the same live, mutable answer
                // WorldNavigationSession#getDocument() already gives
                // every other caller. `sessionRef` is assigned exactly
                // once, right after construction, below — the resolver
                // closure is only ever CALLED later, at runtime, by
                // which point it is already set, the identical
                // construction-order pattern this file's own
                // `resolveSocialIdentity` (see this method's own header)
                // already uses for deviceAuthorizationPropagationUseCase.
                //
                // Gated on the SAME `usePeerTransport`-shaped condition
                // as every other real-peer-transport collaborator above
                // — a caller that doesn't wire a full peer stack (most
                // existing tests, and any headless use) gets `null`,
                // the exact pre-0.2.97 "purely local editing, nothing
                // ever broadcast" behavior WorldNavigationSession's own
                // constructor comment documents.
                let sessionRef = null;
                // 0.2.98 — same peer-stack gate as worldCommandPropagation
                // below, and the SAME `resolveWorldDocument` closure
                // shape (calling back into `sessionRef` at runtime, not
                // at construction time — see this method's own comment
                // on worldCommandPropagation).
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
                        // 0.2.60 — the SAME predicate every other trust
                        // boundary this method builds already consults.
                        isBlocked: isBlocked || null,
                        // 0.2.98 — see worldAuthorizationService's own
                        // wiring above: the SAME predicate, so a
                        // non-owner holding a signed World edit grant
                        // can propagate operations over the network too.
                        resolveWorldEditGrant: worldMembershipUseCase
                            ? (worldDocumentId, viewerIdentityId) => worldMembershipUseCase.hasActiveGrant(worldDocumentId, viewerIdentityId)
                            : null
                    })
                    : null;
                // 0.2.98 — same peer-stack gate, and the SAME
                // deviceAuthorizationPropagationUseCase every other
                // device-aware collaborator here already shares.
                // `resolveCanEdit(worldDocumentId, identityId)` asks a
                // DIFFERENT question than worldAuthorizationService's own
                // canEdit() — "can THIS OTHER participant edit," never
                // "can the CURRENT viewer edit" — so it re-derives
                // ownership/grant status directly rather than
                // misapplying the viewer-centric service: owner by raw
                // `authorIdentityId` (the same comparison
                // application/WorldMembershipUseCase.js#_requireOwnerIdentity()
                // itself makes), OR an active membership grant.
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
                // 0.3.0 — Collaborative Spatial Presence. Same peer-stack
                // gate as worldPresenceUseCase above, and the SAME
                // deviceAuthorizationPropagationUseCase — see
                // application/WorldSpatialPresenceUseCase.js's own
                // header for why identity is resolved exactly the same
                // device-aware way its coarser 0.2.98 sibling already
                // does. Deliberately does NOT reuse worldPresenceUseCase
                // itself — a separate protocol, a separate use case, a
                // separate optional collaborator, so a caller can wire
                // one without the other with no coupling either way.
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
                    avatarInteractionBroadcastProvider,
                    // 0.2.59: the coarse "do I currently have at least
                    // one real, mutual friend" predicate 0.2.58 already
                    // taught WorldNavigationSession to consult — see
                    // above for why this is the first caller to
                    // actually supply it.
                    hasFriend,
                    // 0.2.60: the RECEIVER-side isBlocked predicate —
                    // see this method's own header above. undefined
                    // here (when no peerBlockUseCase was wired) falls
                    // through to WorldNavigationSession's own `null`
                    // default, exactly like `hasFriend` above.
                    isBlocked,
                    // 0.2.93: World View Instance Inspection — see above.
                    structureResolver: structureDocumentResolver,
                    loadDocumentUseCase,
                    // 0.2.95: World Editing Authorization Foundation —
                    // see above.
                    worldAuthorizationService,
                    // 0.2.97: Shared World Ordering & Conflict
                    // Resolution — see above.
                    worldCommandPropagation,
                    // 0.2.98: Shared World Membership & Collaborative
                    // Presence — see above.
                    worldMembershipUseCase,
                    worldPresenceUseCase,
                    // 0.3.0: Collaborative Spatial Presence — see above.
                    worldSpatialPresenceUseCase
                });
                sessionRef = session;
                return session;
            },
            // Expose the spatial index and content store so the application
            // layer can construct spatial use cases for the UI to consume.
            spatialIndexProvider,
            placementRegistry,
            contentStore
        };
    }
}
