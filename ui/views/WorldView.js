import { ref, computed, onMounted, onBeforeUnmount, inject } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { CreateBrickRegistryUseCase } from '../../application/CreateBrickRegistryUseCase.js';
import { CreateWorldViewUseCase } from '../../application/CreateWorldViewUseCase.js';
import { CreateDiscoveryUseCase } from '../../application/CreateDiscoveryUseCase.js';
import { InputRouter } from '../../application/InputRouter.js';
import { WorldSpatialContextService } from '../../application/WorldSpatialContextService.js';
import { AutomaticSnapshotEncounterCascade } from '../../application/AutomaticSnapshotEncounterCascade.js';
import { AutomaticSnapshotEncounterRetentionReconciliation } from '../../application/AutomaticSnapshotEncounterRetentionReconciliation.js';
import { SnapshotWorldRegistrationOutcome } from '../../application/SnapshotWorldRegistrationOutcome.js';
import ActionFeedback from '../components/ActionFeedback.js';
import DocumentInfoPanel from '../components/DocumentInfoPanel.js';
import MetadataEditorDialog from '../components/MetadataEditorDialog.js';
import PlacementInfoPanel from '../components/PlacementInfoPanel.js';
import PlacementEditorDialog from '../components/PlacementEditorDialog.js';
import WorldSearchPanel from '../components/WorldSearchPanel.js';
import LocationDocumentsDialog from '../components/LocationDocumentsDialog.js';
import WorldLocationBrowser from '../components/WorldLocationBrowser.js';
import AvatarInfoPanel from '../components/AvatarInfoPanel.js';
import NearbyAvatarsPanel from '../components/NearbyAvatarsPanel.js';
import CompassIndicator from '../components/CompassIndicator.js';
import LocationsPanel from '../components/LocationsPanel.js';
import LandmarkFormModal from '../components/LandmarkFormModal.js';
import RegionFormModal from '../components/RegionFormModal.js';
import WorldMembersPanel from '../components/WorldMembersPanel.js';
import WorldPresenceIndicator from '../components/WorldPresenceIndicator.js';
import WorldCollaboratorIndicator, { buildSpatialCollaboratorRows } from '../components/WorldCollaboratorIndicator.js';
import { buildWorldCollaborationRoster } from '../components/WorldCollaborationRoster.js';
import WorldWelcomePanel from '../components/WorldWelcomePanel.js';
import WorldMapPanel from '../components/WorldMapPanel.js';
import PlaceNamingPanel from '../components/PlaceNamingPanel.js';
import GeographicPlaceDirectoryPanel from '../components/GeographicPlaceDirectoryPanel.js';
import GeographicPlacePanel from '../components/GeographicPlacePanel.js';
import CollapsibleSection from '../components/CollapsibleSection.js';
import WorldFocusPanel from '../components/WorldFocusPanel.js';
import WorldEncounterCanvas from '../components/WorldEncounterCanvas.js';
import OwnPublicationPanel from '../components/OwnPublicationPanel.js';
import VehicleInteractionPrompt from '../components/VehicleInteractionPrompt.js';
import HistoryTimelinePanel from '../components/HistoryTimelinePanel.js';
import NotificationHistoryPanel from '../components/NotificationHistoryPanel.js';
import { CameraPerspective } from '../../core/CameraPerspective.js';
import { geographicPlaceLocationId } from '../../core/GeographicPlaceNavigation.js';
import { WorldFocusKind } from '../../core/WorldFocusContext.js';
import { EditorEntryContext, EditorEntryReason, editorEntryContextToQuery, withReturnWorld } from '../../core/EditorEntryContext.js';
import { WorldViewNavigationState, WorldViewPrimaryMode } from '../../application/WorldViewNavigationState.js';
import { PlaceNamingDiscoveryMonitor } from '../../application/PlaceNamingDiscoveryMonitor.js';
import { executeDiscoverPlaceNamingClaimsCommand } from '../../application/DiscoverPlaceNamingClaimsCommand.js';
import { derivePlaceNamingDiscoveryTag } from '../../core/PlaceNamingDiscoveryEnvelope.js';
import { buildPlaceNamingClaimPublication } from '../../application/PlaceNamingClaimPublication.js';
import { PlaceNamingClaim } from '../../core/PlaceNamingClaim.js';

const DRAG_THRESHOLD_PX = 6;

// 0.2.29 — UI-only display defaults for the World Location Browser's
// initial radius, purely so "Explore Here"/"What's Here?" have a
// number to show before the user picks their own. These intentionally
// mirror application/WorldNavigationSession.js's own
// DEFAULT_EXPLORE_RADIUS/NEARBY_RADIUS constants, but the mirroring is
// cosmetic, not load-bearing: the actual radius used for every query
// is whatever session.exploreHere()/whatsHere() decide (or, after a
// re-query, whatever the browser dialog's own field holds) — this
// file never computes a distance or decides what counts as "nearby"
// itself.
const DEFAULT_EXPLORE_RADIUS = 25;
const NEARBY_RADIUS = 5;

// 0.1.50 gave World View the same consolidated EditorActionRegistry/
// EditingSidebar/CommandPalette the Editor uses, for editing parity by
// construction. 0.5.9 retires all of it: World View no longer edits
// Document content at all (see docs/Principles.md, "World View
// Observes and Navigates; Editor Mutates and Builds") — hover/
// inspection/focus panels are unchanged, everything mutation-shaped is
// gone.
export default {
    name: 'WorldView',
    components: {
        ActionFeedback,
        DocumentInfoPanel, MetadataEditorDialog,
        PlacementInfoPanel, PlacementEditorDialog,
        WorldSearchPanel, LocationDocumentsDialog, WorldLocationBrowser,
        AvatarInfoPanel, NearbyAvatarsPanel,
        CompassIndicator, LocationsPanel, LandmarkFormModal, RegionFormModal,
        WorldMembersPanel, WorldPresenceIndicator, WorldCollaboratorIndicator,
        WorldWelcomePanel, WorldMapPanel, PlaceNamingPanel,
        GeographicPlaceDirectoryPanel, GeographicPlacePanel, CollapsibleSection,
        WorldFocusPanel, WorldEncounterCanvas, OwnPublicationPanel, VehicleInteractionPrompt,
        HistoryTimelinePanel, NotificationHistoryPanel
    },
    setup() {
        const route = useRoute();
        const router = useRouter();
        const viewport = ref(null);
        const initialDocumentId = route.params.documentId;

        const title = ref('Loading...');
        const author = ref(null);
        // 0.2.22: the Document Info shape (see WorldNavigationSession.
        // getDocumentInfo) for whichever document is CURRENTLY ACTIVE
        // (session.getActiveDocumentId()), not the selected brick's
        // document — distinct from `documentInfo` below, which tracks
        // the inspection panel's selection and can be a different
        // world entirely. Drives the header's Published/Editing-fork
        // badge.
        const activeDocumentInfo = ref(null);
        // 0.2.27: the CAMERA's target — session.getFocusedDocumentId()
        // — kept as its own field precisely so it can differ from
        // `title`/`activeDocumentInfo` (the active/editing document).
        // See docs/Principles.md, "Camera Focus, Active Document, and
        // Selection Are Three Different Things." Only a title is
        // needed here (the header context line), not a full
        // DocumentInfo shape.
        const focusedDocumentTitle = ref(null);
        const loadedWorlds = ref([]);
        const nearbyWorlds = ref([]);
        const failedWorlds = ref([]);
        const spatialSelection = ref(null);
        const spatialHover = ref(null);
        const spatialInspection = ref(null);
        // 0.2.21: superseded by documentInfo (getDocumentInfo already
        // includes editabilityNotice — see below) — the Document Info
        // panel now carries what this used to render standalone.
        const documentInfo = ref(null);
        const showMetadataEditor = ref(false);
        // Which info object (activeDocumentInfo or documentInfo) the
        // open MetadataEditorDialog is actually editing — see
        // openMetadataEditor().
        const metadataEditTarget = ref(null);
        // 0.2.23: WHERE the active/inspected world sits in shared
        // space — see WorldNavigationSession.getPlacementInfo. Named
        // "placementInfo"/"activePlacementInfo" to mirror documentInfo/
        // activeDocumentInfo exactly; unrelated to `spatialPlacement`
        // below, which is BRICK placement-preview state (0.1.33) — an
        // unfortunate but pre-existing name collision in the domain
        // ("placement" means two different things at two different
        // layers), not a naming choice made for this milestone.
        const placementInfo = ref(null);
        const activePlacementInfo = ref(null);
        // 0.9.140 — Own Publication Distribution Entry Point. The actual
        // Publication (`publisher/Publication.js`) governing the ACTIVE
        // document — session.getPublicationForDocument(activeId) — when
        // (and only when) that document is itself a known, published
        // snapshot. Mirrors activeDocumentInfo/activePlacementInfo's own
        // "re-read fresh every refreshSpatialUI() tick, never cached"
        // pattern exactly, one field over. `null` for an unpublished
        // fork or a document that was never published — OwnPublicationPanel
        // (below) renders that as "nothing to distribute yet," never a
        // guess. Deliberately NEVER derived from spatialSelection,
        // worldDiscoverySourceRegistry, or anything World Encounters
        // itself produces — see that component's own header for why.
        const ownPublication = ref(null);
        // 0.2.39 — the Avatar Info panel's data, mirroring documentInfo/
        // placementInfo's own shape: read fresh from session.getAvatarInfo()
        // every refreshSpatialUI(), null whenever there is no current
        // avatar interaction target (see application/spatial-state/
        // AvatarInteractionState.js). followedRemoteAvatarId mirrors
        // session.getFollowedRemoteAvatarId() purely so the panel knows
        // whether to show "Follow" or "Stop Following".
        const avatarInfo = ref(null);
        const followedRemoteAvatarId = ref(null);
        // 0.2.43 — "who is near me," read fresh from
        // session.getNearbyAvatars() every refreshSpatialUI(), each
        // entry enriched with a resolved displayName (session.
        // getAvatarDisplayName()) the way loadedWorlds below already
        // enriches a bare documentId with its own publication's
        // title/author — a UI-layer presentation concern, not
        // something the session's own minimal, spec-shaped return
        // value carries itself.
        const nearbyAvatars = ref([]);
        const showPlacementEditor = ref(false);
        const placementEditTarget = ref(null);
        // 0.2.25: set only after checkPlacementOverlap() has found an
        // occupied destination under a policy that requires
        // confirmation (WARN) — see onMovePlacement(). null the rest of
        // the time, including while the dialog is open but the user
        // hasn't attempted a move yet.
        const placementOverlapWarning = ref(null);
        // 0.2.26: World Navigation & Spatial Discovery UX — search
        // results (populated on submit, not live-as-you-type; see
        // WorldSearchPanel), and the "Documents Here" dialog opened
        // from PlacementInfoPanel's overlap notice.
        const searchResults = ref([]);
        const showLocationDocuments = ref(false);
        const locationDocumentsPosition = ref(null);
        const locationDocumentsOccupants = ref([]);
        // 0.2.29: World Location Browser — camera-driven exploration,
        // built on top of the SAME searchWorld/exploreLocation results
        // as the Search panel (see WorldNavigationSession's "World
        // Location Browser" section). `locationBrowserInspected` mirrors
        // the shape session.inspectDocument() returns and is cleared on
        // every open/re-query, since an expansion from a previous query
        // has nothing guaranteed to still correspond to a row in a new
        // result set.
        const showLocationBrowser = ref(false);
        const locationBrowserCenter = ref(null);
        const locationBrowserRadius = ref(DEFAULT_EXPLORE_RADIUS);
        const locationBrowserDocuments = ref([]);
        // 0.2.30: the diagnostics half of WorldNavigationSession.
        // exploreLocation's { documents, diagnostics } envelope — see
        // core/DiscoveryDiagnosticsSummary.js. Defaults to the
        // "unavailable" shape (no trust-capable provider consulted)
        // rather than null, so WorldLocationBrowser's banner always has
        // something well-formed to render.
        const locationBrowserDiagnostics = ref({ available: false, fatal: null, complete: false, warnings: [] });
        const locationBrowserInspected = ref(null);
        const cameraPosition = ref(null);
        // 0.2.94 — World View Location & Navigation. `compassHeading`
        // mirrors `cameraPosition`'s own refresh cadence exactly (both
        // set inside refreshSpatialUI() below) — a pure, derived
        // orientation readout for CompassIndicator, never polled or
        // computed independently. `showLocationsPanel`/`worldLocations`
        // back the Locations dialog: the location LIST is re-read fresh
        // every time the panel opens (session.getWorldLocations() is a
        // cheap, always-current query — see WorldLocationDirectory's
        // own header), never cached across opens.
        const compassHeading = ref(null);
        // 0.3.6 — World Discovery & Exploration. Spatial context for
        // current location (terrain zone, hydrology feature, nearby structures,
        // nearby collaborators) derived deterministically from position + world.
        const spatialContext = ref(null);
        // 0.3.6 — the compass's own contextual markers (design conversation:
        // "extending the compass from merely N/E/S/W to contextual
        // markers... but only for nearby meaningful locations"). A pure
        // read/reshape of spatialContext.value — never a second query —
        // capped at 5 total so the tiny dial never turns into a minimap
        // (explicitly out of scope for 0.3.6). CompassIndicator only
        // needs an id/direction/kind/label per marker; it never sees
        // core/WorldSpatialContext.js's richer shape directly, keeping
        // the component's own presentation-only contract unchanged.
        const compassMarkers = computed(() => {
            if (!spatialContext.value) return [];
            const structures = (spatialContext.value.nearbyStructures || []).map((s) => (
                { id: `structure:${s.id}`, direction: s.direction, kind: 'structure', label: s.title }
            ));
            const collaborators = (spatialContext.value.nearbyCollaborators || []).map((c) => (
                { id: `collaborator:${c.identityId}`, direction: c.direction, kind: 'collaborator', label: c.displayName }
            ));
            // 0.3.7 — landmarks join the same contextual-marker mix,
            // reusing every bit of 0.3.6's compass work (CompassIndicator
            // already renders any `kind` generically via a CSS class —
            // see that component's own header).
            const landmarks = (spatialContext.value.nearbyLandmarks || []).map((l) => (
                { id: `landmark:${l.id}`, direction: l.direction, kind: 'landmark', label: l.title }
            ));
            // 0.5.6 — Geographic Place Navigation & Arrival. A derived
            // marker per nearby geographic place candidate, read off
            // `nearbyGeographicPlaces` (its OWN much-larger radius —
            // see core/GeographicPlaceNavigation.js#
            // DEFAULT_NEARBY_GEOGRAPHIC_PLACE_RADIUS — not
            // spatialContext's own ~100m proximity window), appended
            // last so existing structure/collaborator/landmark markers
            // keep priority under the same 5-marker cap below.
            const places = (nearbyGeographicPlaces.value || []).map((p) => (
                { id: `place:${p.fingerprintKey}`, direction: p.direction, kind: 'place', label: p.displayName }
            ));
            return structures.concat(collaborators, landmarks, places).filter((m) => m.direction).slice(0, 5);
        });
        const showLocationsPanel = ref(false);
        const worldLocations = ref([]);
        // 0.3.9 — World Welcome & Guided Exploration. `welcomeContext`
        // is session.getWelcomeContext(...)'s own toJSON() — re-read
        // fresh on open and again on every live spatial-presence update
        // (see _syncWorldSpatialPresence() below), never cached beyond
        // that. `showWelcomePanel` opens automatically the first time
        // this session enters a World's spatial presence (one showing
        // per World per session — see `_welcomeShownForDocumentId`
        // below, a plain non-reactive Set since it's bookkeeping, not
        // something the template ever reads) and can be reopened any
        // time through the "Explore" toolbar button —
        // `welcomeIsArrival` only changes which framing/dismiss label
        // WorldWelcomePanel shows, never the content.
        const showWelcomePanel = ref(false);
        const welcomeContext = ref(null);
        const welcomeIsArrival = ref(true);
        // 0.3.10 — World Persistence & Return Experience. `worldReturnInfo`
        // is null for a World this replica has never visited before (a
        // first-timer, per session.hasVisitedWorld()), or
        // `{ lastVisitedAt }` when it has — read fresh in
        // _syncWorldExperience() below, BEFORE that same tick's
        // restoreWorldExperience() call, so it always reflects the PRIOR
        // visit, never the one currently in progress. Purely
        // presentational — WorldWelcomePanel uses it only to swap
        // "Welcome to X" for "Welcome back to X" / "Continue Exploring",
        // never to decide anything this view or the session doesn't
        // already independently decide.
        const worldReturnInfo = ref(null);
        // 0.3.7 — World Landmarks & Personal Waypoints. `canEditActiveWorld`
        // mirrors isActiveWorldOwner's own refresh cadence exactly (both
        // set inside refreshSpatialUI() below) — a pure reflect of
        // session.canEditDocument(activeDocumentId), gating the Add/Edit/
        // Remove landmark affordances the same "reflect, never decide"
        // way isActiveWorldOwner already gates the Members panel's
        // owner-only actions. `showLandmarkForm`/`landmarkFormTarget`
        // back the Add/Edit Landmark dialog: `landmarkFormTarget` is
        // null for Add, or { id, title, description } for Edit — see
        // LandmarkFormModal's own header.
        const canEditActiveWorld = ref(false);
        const showLandmarkForm = ref(false);
        const landmarkFormTarget = ref(null);
        // 0.5.0 — World Regions & Decentralized Place Naming. Same
        // shape/gating as showLandmarkForm/landmarkFormTarget above —
        // `regionFormTarget` is null for Add, or
        // { id, name, description, kind, radius } for Edit — see
        // RegionFormModal's own header.
        const showRegionForm = ref(false);
        const regionFormTarget = ref(null);
        // 0.5.2 — Place Naming & Naming Claims. `namingPanelRegionId` is
        // the region this panel currently reads/writes claims for; the
        // panel's actual props (claims/namingView/preferredName) are
        // re-derived fresh from the session on open AND after every
        // publish/retract/set-preferred action below, never cached
        // independently — see openNamingPanel()/refreshNamingPanel().
        const showNamingPanel = ref(false);
        const namingPanelRegionId = ref(null);
        const namingPanelClaims = ref([]);
        const namingPanelView = ref([]);
        const namingPanelPreferredName = ref(null);
        // 0.5.4 — Place Identity & Geographic Claim Resolution.
        // `namingPanelGeographicRegions`/`namingPanelGeographicView` are
        // session.getGeographicNamingView()'s own output — every region
        // this replica currently knows about that CANDIDATE-matches
        // namingPanelRegionId's own geometry (core/PlaceIdentity.js),
        // and the combined naming view across every one of them. Purely
        // additive alongside namingPanelClaims/namingPanelView above,
        // which stay scoped to exactly this one region, unchanged.
        const namingPanelGeographicRegions = ref([]);
        const namingPanelGeographicView = ref([]);
        // 0.9.320 — Explicit Place Naming Publication Action. Ephemeral,
        // per-open-panel UI state for "announce this already-signed claim
        // to Nostr" — mirroring `ui/components/OwnPublicationPanel.js`'s own
        // executing/error/result/requestId shape for its "Distribute
        // Snapshot" action, one domain over. `namingPanelPublishToNostrClaimId`
        // is the claim the LAST click targeted — since "All Claims" can list
        // several claims, this is what lets the panel show a result/error
        // beside the specific row it describes, rather than ambiguously
        // beside every row. Reset (and any in-flight call invalidated via
        // the requestId guard) in openNamingPanel()/closeNamingPanel() below
        // — the identical "a changed target invalidates whatever the prior
        // target's own state described" restraint that family already
        // holds, applied here to "which region's panel is open" instead of
        // "which Publication is active."
        const namingPanelPublishToNostrClaimId = ref(null);
        const namingPanelPublishToNostrExecuting = ref(false);
        const namingPanelPublishToNostrError = ref(null);
        const namingPanelPublishToNostrResult = ref(null);
        const namingPanelPublishToNostrRequestId = ref(0);
        const myIdentityId = computed(() => session.getMyIdentityId());
        // 0.5.1 — World Maps & Geographic Navigation. `mapContent` is
        // session.getMapContent()'s own shape — refreshed on the SAME
        // cadence as spatialContext/cameraPosition below (every
        // refreshSpatialUI() tick, not just on open) so a collaborator's
        // dot keeps moving while the map stays open, the same "always
        // current, never a second source of truth" posture spatialContext
        // itself already has. See ui/components/WorldMapPanel.js's own
        // header for why panning/zooming that view is deliberately NOT
        // reset by this refresh.
        const showMapPanel = ref(false);
        const mapContent = ref({ regions: [], landmarks: [], structures: [], collaborators: [], viewerPosition: null });
        // 0.5.5 — Geographic Place Directory & Identity UX.
        // `geographicPlaces` is session.getGeographicPlaceDirectory()'s
        // own array of GeographicPlaceView#toJSON() rows — re-read fresh
        // every time the directory opens, the same "cheap, never cached"
        // posture worldLocations already keeps. `geographicPlace` is
        // whichever ONE row is currently open in GeographicPlacePanel,
        // or null; `mapHighlightRegionKeys` is purely additive state for
        // WorldMapPanel — a "Show on Map" click never changes what the
        // map itself contains, only which of its ALREADY-drawn regions
        // get an extra highlight (see WorldMapPanel's own header).
        const showGeographicPlaceDirectory = ref(false);
        const geographicPlaces = ref([]);
        const showGeographicPlacePanel = ref(false);
        const geographicPlace = ref(null);
        const mapHighlightRegionKeys = ref([]);
        // 0.5.6 — Geographic Place Navigation & Arrival.
        // `nearbyGeographicPlaces` is session.getNearbyGeographicPlaces()'s
        // own already-sorted/distance/direction-labeled rows, refreshed
        // on the SAME cadence as spatialContext/mapContent above (every
        // refreshSpatialUI() tick) — the compass and the nav HUD legend
        // both read this ref directly; the directory panel's own
        // "Nearby Places" section is populated from it too when the
        // panel opens (see openGeographicPlaceDirectory() below).
        const nearbyGeographicPlaces = ref([]);
        // 0.9.257 — World View Place Naming Presentation. The two state
        // atoms this milestone's own brief names by name: `nearbyPlaceNamingClaims`
        // is exactly `placeNamingDiscoveryMonitor.lastResult` (see
        // `refreshSpatialUI()`, below) — one discovery envelope with its own
        // resolved `.position` attached per entry, UNTOUCHED, never re-ranked,
        // deduplicated, or reduced to "the" name for a place; two claims
        // naming the same ground both appear, exactly as `application/
        // PlaceNamingDiscoveryMonitor.js`'s own `lastResult` already holds
        // them. `placeNamingDiscoveryError` mirrors the monitor's own
        // `lastError` — a small, optional, non-authoritative indicator, never
        // a reason to clear `nearbyPlaceNamingClaims`. Neither ref is ever
        // written from anywhere but that one `.then()` callback — this view
        // performs no discovery, position resolution, or proximity filtering
        // of its own; see `placeNamingDiscoveryMonitor`'s own construction
        // comment, below, for where those responsibilities actually live.
        const nearbyPlaceNamingClaims = ref([]);
        const placeNamingDiscoveryError = ref(null);
        // 0.5.8 — World View Contextual Focus & Information Hierarchy.
        // `focusContext` is a core/WorldFocusContext.js#WorldFocusContext.toJSON()
        // shape (or null), rebuilt fresh every time something is
        // inspected — never cached, mirroring every other "cheap,
        // rebuilt on demand" derived read in this file. WorldFocusPanel
        // is its own overlay, independent of primaryMode, so it can be
        // opened from Explore's own nearby rows OR the Locations panel
        // without either of them having to leave the surface they were
        // already on — see openFocusForLocation()/
        // openFocusForCollaborator() below.
        const showFocusPanel = ref(false);
        const focusContext = ref(null);
        // 0.5.7 — World View UX & Progressive Exploration.
        // `worldViewNav` is a plain, non-reactive
        // WorldViewNavigationState instance — treated exactly like
        // `session` itself elsewhere in this file: this view calls its
        // methods, then mirrors whatever changed into these refs so
        // the template can react to it. See that class's own header,
        // and setPrimaryMode()/goBackInPlaces() below for the mirroring.
        const worldViewNav = new WorldViewNavigationState();
        const primaryMode = ref(worldViewNav.primaryMode);
        const placesView = ref(worldViewNav.currentPlacesView);
        // 0.2.99 — World Collaboration UX. `worldMembers`/
        // `worldPresenceRoster` are the RAW facts session.
        // listWorldMembers()/getWorldPresenceRoster() already return for
        // whichever document is currently ACTIVE (session.
        // getActiveDocumentId()) — re-read on every refreshSpatialUI()
        // tick AND on every live onWorldMembershipChanged/
        // onWorldPresenceChanged notification (see _syncWorldPresence()
        // below), never cached across a document switch.
        // `worldCollaborationRoster` (below, computed) is the ONE place
        // they're joined into rows a panel can render — see
        // ui/components/WorldCollaborationRoster.js's own header.
        const showMembersPanel = ref(false);
        const worldMembers = ref([]);
        const worldPresenceRoster = ref([]);
        const isActiveWorldOwner = ref(false);
        // identityId currently mid-grant/mid-revoke, or null — see
        // grantWorldMember()/revokeWorldMember() below.
        const collaborationPendingIdentityId = ref(null);
        // 0.3.0 — Collaborative Spatial Presence. `spatialCollaboratorRows`
        // is buildSpatialCollaboratorRows()'s own output — ONE row per
        // identity, resolved through the SAME resolveIdentityDisplayName()
        // this view already uses for worldCollaborationRoster below.
        // Refreshed on every live onWorldSpatialPresenceChanged
        // notification (see _syncWorldSpatialPresence() below), never
        // polled — spatial presence already updates far more often than
        // refreshSpatialUI()'s own 3-second cadence would be worth
        // reading on a timer.
        const spatialCollaboratorRows = ref([]);
        const feedbackMessage = ref('');
        const feedbackVisible = ref(false);

        // 0.2.35: World View needs to know who's logged in to render
        // that user's own avatar (see WorldNavigationSession's
        // "Local Avatar" section) — the same identityUseCase.provider
        // every other publish-capable surface (EditorView) already
        // reads, just not previously threaded through here since
        // nothing in World View needed identity before now.
        const identityUseCase = inject('identityUseCase');
        // 0.2.59 — Peer-Based Avatar Social Transport: the SAME
        // app-wide PeerSessionManager/PeerMessageBus/FriendRelationshipUseCase
        // ui/main.js already provides for /peers and the friendship
        // protocol (0.2.55/0.2.57), handed to CreateWorldViewUseCase so
        // presence/profile/interaction ride the real authenticated peer
        // network instead of the local development BroadcastChannel
        // transport — see application/CreateWorldViewUseCase.js's own
        // comment.
        const peerSessionManager = inject('peerSessionManager');
        const peerMessageBus = inject('peerMessageBus');
        const friendRelationshipUseCase = inject('friendRelationshipUseCase');
        // 0.2.60 — the SAME app-wide PeerBlockUseCase ui/main.js already
        // provides for /peers, handed to CreateWorldViewUseCase so it
        // can derive the isBlocked predicate both the outbound transport
        // and the inbound trust boundaries consult — see that use
        // case's own comment.
        const peerBlockUseCase = inject('peerBlockUseCase');
        // 0.2.95 — the SAME app-wide DeviceAuthorizationPropagationUseCase
        // ui/main.js already provides for /peers, handed to
        // CreateWorldViewUseCase so World View's own editing-authority
        // check can recognize an authorized device as speaking for its
        // parent identity — see that use case's own comment.
        const deviceAuthorizationUseCase = inject('deviceAuthorizationUseCase');
        // 0.2.99 — the SAME app-wide PeerRelationshipUseCase ui/main.js
        // already provides for /peers and ConversationsView's own alias
        // resolution, injected here ONLY for display purposes — a known
        // alias for a World Member's raw identityId, exactly the same
        // `alias || shortId(identityId)` degradation ConversationsView
        // already uses. Never consulted for authorization; see
        // resolveIdentityDisplayName() below.
        const peerRelationshipUseCase = inject('peerRelationshipUseCase');
        // 0.9.17 — Integrate World Encounters into the Existing World
        // View. The SAME app-wide `worldDiscoverySourceRegistry`
        // `ui/main.js` already provides (0.9.14) and
        // `ui/views/LiveWorldView.js` (0.9.15) already injects, handed
        // straight through as `WorldEncounterCanvas`'s own `registry`
        // prop below — never a second registry, never anything this
        // view derives from it itself. See the "World Encounters"
        // CollapsibleSection in this file's own template, and its own
        // header comment there, for why this view still owns no
        // discovery logic of any kind. Named `worldDiscoverySourceRegistry`
        // to avoid colliding with the `registry` (BrickRegistry) constant
        // immediately below — two entirely unrelated concepts that would
        // otherwise share a name only because of where in this file they
        // happen to appear.
        const worldDiscoverySourceRegistry = inject('worldDiscoverySourceRegistry', null);
        // 0.9.99 — Decentralized Material Verification World View
        // Integration. The SAME app-wide `worldEncounterMaterialSources`/
        // `worldEncounterMaterialVerifier` `ui/main.js` now provides,
        // handed straight through as `WorldEncounterCanvas`'s own already-
        // existing `materialSources`/`materialVerifier` props below —
        // never reconstructed, never a second verifier, never a fact this
        // view derives or judges itself. `WorldEncounterCanvas` already
        // owns the entire request/response inspection lifecycle
        // (0.9.39/0.9.40) and already renders its own Material/
        // Verification panel (`loading.status`/`verification.status`,
        // unchanged); this view's only job is to stop leaving both props
        // at their own default of `null`.
        const worldEncounterMaterialSources = inject('worldEncounterMaterialSources', null);
        const worldEncounterMaterialVerifier = inject('worldEncounterMaterialVerifier', null);
        // 0.9.100 — Publication Distribution World View Integration. The
        // SAME app-wide `publicationDistributionLifecycleStore` `ui/main.js`
        // now composes (restored + persistence-bridged from the existing
        // 0.9.50-through-0.9.57 lifecycle chain), handed straight through as
        // `WorldEncounterCanvas`'s own new `distributionLifecycleStore`
        // prop below — never a second store, never a lifecycle this view
        // derives, transitions, or persists itself. This view's only job is
        // to stop leaving that prop at its own default of `null`, mirroring
        // 0.9.99's own restraint immediately above exactly, one collaborator
        // over.
        const publicationDistributionLifecycleStore = inject('publicationDistributionLifecycleStore', null);
        // 0.9.104 — World View Publication Distribution Action. The SAME
        // app-wide `publicationDistributionCommand` `ui/main.js` has
        // provided since 0.9.103 (a thin closure already bound to the
        // SAME `publicationDistributionLifecycleStore` injected
        // immediately above), injected here so `distributeWorldEncounterPublication()`
        // below can call it — never a second command, never anything this
        // view constructs, orchestrates, or writes into the lifecycle
        // store itself.
        const publicationDistributionCommand = inject('publicationDistributionCommand', null);
        // 0.9.138 — World View Snapshot Distribution Action. The SAME
        // app-wide `snapshotDistributionCommand` `ui/main.js` now composes
        // (0.9.137's own `composeSnapshotDistributionRuntime()`, sequenced
        // by 0.9.136's own unmodified `executeSnapshotDistributionCommand()`)
        // — a thin `(bytes) -> Promise<{ contentReference, announcement }>`
        // function, injected here so `distributeWorldEncounterSnapshot()`
        // below can call it. `publicationCatalogContentResolver` is the
        // SAME already-provided resolver `application/
        // CreateExternalSnapshotPlacementUseCase.js` (0.8.18) already reads
        // a published Snapshot's own local bytes back through — injected
        // here for the identical reason, never a second serialization
        // mechanism of this view's own. See `distributeWorldEncounterSnapshot()`,
        // below, for how the two are used together.
        const snapshotDistributionCommand = inject('snapshotDistributionCommand', null);
        const publicationCatalogContentResolver = inject('publicationCatalogContentResolver', null);
        // 0.9.142 — World View Snapshot Discovery Command. The SAME
        // app-wide `discoverSnapshotCommand` `ui/main.js` now composes
        // (0.9.142's own `composeDiscoverSnapshotRuntime()`, sequenced by
        // `executeDiscoverSnapshotCommand()`) — a thin `(discoveryTag,
        // contentHash, ...) -> Promise<{ outcome, bytes, candidates,
        // locator, storage, reason }>` capability, injected here so
        // `discoverOwnSnapshot()` below can call it. See that function's
        // own header for how "which publication" becomes "which
        // contentHash."
        const discoverSnapshotCommand = inject('discoverSnapshotCommand', null);
        // 0.9.151 — World View Snapshot Candidate Browser. The SAME
        // app-wide `discoverSnapshotCandidatesCommand` `ui/main.js` now
        // composes (reusing the SAME `NostrSnapshotDiscoveryQueryService`
        // instance `discoverSnapshotCommand`'s own resolver already
        // wraps) — a thin `() -> Promise<[{ contentHash, locator,
        // storage }, ...]>` capability. Unlike `discoverSnapshotCommand`,
        // this capability needs no `publication`-derived argument at all
        // — browsing what has been announced under the campaign
        // discoveryTag is not "which Publication," so this is handed
        // straight through to `OwnPublicationPanel`, with no wrapper
        // function of this view's own.
        const discoverSnapshotCandidatesCommand = inject('discoverSnapshotCandidatesCommand', null);
        // 0.9.186 — World Snapshot Background Discovery. The SAME app-wide
        // `WorldSnapshotDiscoveryMonitor` instance `ui/main.js` composes
        // around the exact `discoverSnapshotCandidatesCommand` above —
        // never a second campaign, never a second query service. See
        // `refreshSpatialUI()`, below, for the one call site that feeds it
        // this view's own already-computed `spatialContext`.
        const worldSnapshotDiscoveryMonitor = inject('worldSnapshotDiscoveryMonitor', null);
        // 0.9.257 — World View Place Naming Presentation. The SAME
        // app-wide `PlaceNamingDiscoveryQueryService` `ui/main.js` composes
        // around whatever Nostr transport is available — never a second
        // relay client, never a second query service. Only the
        // TRANSPORT-level half; see `placeNamingDiscoveryMonitor`'s own
        // construction comment, below, for why the command and position
        // resolver built around it are this view's own to compose, not
        // `ui/main.js`'s: only this session actually holds the current
        // World layout `resolveClaimPosition` needs.
        const placeNamingDiscoveryQueryService = inject('placeNamingDiscoveryQueryService', null);
        // 0.9.320 — Explicit Place Naming Publication Action. The SAME
        // app-wide `publishPlaceNamingClaimToNostrCommand` `ui/main.js` now
        // composes (`application/PlaceNamingPublicationRuntimeComposition.js`'s
        // own `composePlaceNamingPublicationRuntime()`, wrapping the
        // already-existing `NostrPlaceNamingDiscoveryPublisher`, 0.9.316) —
        // a thin `(claim) -> Promise<{ published, relayUrl, id,
        // discoveryTag }>` capability, injected here so
        // `publishNamingClaimToNostr()` below can call it. `null` when
        // `ui/main.js` provides nothing (e.g. in a test harness that never
        // calls `app.provide` for it) — gated the identical way every other
        // injected command in this file already is.
        const publishPlaceNamingClaimToNostrCommand = inject('publishPlaceNamingClaimToNostrCommand', null);
        // 0.9.152 — Selected Snapshot Candidate Resolution. The SAME
        // app-wide `resolveSelectedSnapshotCommand` `ui/main.js` now
        // composes (reusing the SAME resolver/content store
        // `discoverSnapshotCommand` already wraps) — a thin `(candidate)
        // -> Promise<{ outcome, bytes, candidates, locator, storage,
        // reason }>` capability. Like `discoverSnapshotCandidatesCommand`,
        // it is handed straight through to `OwnPublicationPanel`, with no
        // wrapper function of this view's own — its own `(candidate) ->
        // Promise<...>` shape already matches that prop exactly.
        const resolveSelectedSnapshotCommand = inject('resolveSelectedSnapshotCommand', null);
        // 0.9.158 — Selected Snapshot Materialization. The SAME app-wide
        // `materializeSelectedSnapshotCommand` `ui/main.js` now composes
        // (reusing the SAME `storeSnapshotContentUseCase` every other
        // explicit materialization action already shares) — a thin
        // `(resolution) -> Promise<{ outcome, contentHash, contentReference,
        // reason, source }>` capability. Like `resolveSelectedSnapshotCommand`,
        // it is handed straight through to `OwnPublicationPanel`, with no
        // wrapper function of this view's own — its own `(resolution) ->
        // Promise<...>` shape already matches that prop exactly.
        const materializeSelectedSnapshotCommand = inject('materializeSelectedSnapshotCommand', null);
        // 0.9.215 — Snapshot Export Capability Integration. The SAME
        // app-wide `exportSnapshotCommand` `ui/main.js` now composes
        // (wrapping `snapshotContentMaterializationCoordinator`'s own new
        // `export()` method around the SAME `publicationCatalog`/
        // `publicationContentStore` every other local Snapshot action
        // already shares) — a thin `(publicationId) -> Promise<Publication
        // SnapshotTransferPackage>` capability, injected here so
        // `exportOwnSnapshot()` below can call it. See that function's own
        // header for how "which publication" becomes "which publicationId."
        const exportSnapshotCommand = inject('exportSnapshotCommand', null);
        // 0.9.110 — Decentralized Material Retrieval Runtime Composition.
        // The SAME app-wide `DecentralizedWorldDiscoveryLeadRegistry`
        // `ui/main.js` now composes, handed straight through as
        // `WorldEncounterCanvas`'s own already-existing (0.9.40)
        // `worldDiscoveryLeadRegistry` prop below — that prop, and every
        // reactive behavior behind it (subscribing, resolving a lead for
        // the current selection, the Wanderer's own ambiguity choice),
        // has been real and tested since 0.9.40; only the registry handed
        // to it was ever missing. `discoverWorldEncounterPublicationCommand`
        // is the capability that gap left unreachable — a thin, pre-bound
        // closure (`{ objectId, discoveryTag } -> Promise<{ discovery,
        // resolution, inspection }>`). 0.9.111 (below) forwards it straight
        // to `WorldEncounterCanvas`'s own new `discoveryCommand` prop —
        // never reconstructed and never a second discovery/resolution/
        // verification algorithm of its own.
        const worldDiscoveryLeadRegistry = inject('worldDiscoveryLeadRegistry', null);
        const discoverWorldEncounterPublicationCommand = inject('discoverWorldEncounterPublicationCommand', null);
        // 0.9.357 — the SAME canonical campaign tag ui/main.js already
        // supplies to Publication distribution's own Nostr publisher,
        // forwarded verbatim to WorldEncounterCanvas's own new
        // defaultDiscoveryTag prop below — never re-declared here, never a
        // second literal. See tests/PublicationDiscoveryTagUXConsistencyAudit.test.js
        // (0.9.356) for why this is safe: the value only seeds the
        // Discovery-tag input's own starting value and never touches how
        // discoverWorldEncounterPublicationCommand itself is called.
        const publicationDiscoveryTag = inject('publicationDiscoveryTag', '');
        const registry = new CreateBrickRegistryUseCase().execute();
        const worldViewFactory = new CreateWorldViewUseCase().execute(identityUseCase.provider, {
            peerMessageBus,
            connectedPeerRegistry: peerSessionManager ? peerSessionManager.registry : null,
            friendRelationshipUseCase,
            peerBlockUseCase,
            deviceAuthorizationPropagationUseCase: deviceAuthorizationUseCase
        });
        const session = worldViewFactory.createSession(registry);
        // 0.9.187 — Automatic Snapshot Encounter Cascade. Composes the SAME
        // `resolveSelectedSnapshotCommand`/`materializeSelectedSnapshotCommand`/
        // `worldDiscoverySourceRegistry` already injected above (and already
        // handed to `OwnPublicationPanel`'s own explicit
        // Resolve/Materialize/Register buttons, untouched by this
        // milestone) with two small new lookups this SAME `session` now
        // exposes (`getPlacementInfoForPublication`/`findPublicationById`,
        // 0.9.187) — never a second resolver, materializer, or registry.
        // Scoped to this WorldView's own mount, exactly like `session`
        // itself: a fresh cascade (and therefore a fresh idempotency map,
        // see that file's own header) accompanies each fresh session,
        // rather than persisting across an unrelated later visit to a
        // World route. See `refreshSpatialUI()`, below, for the one call
        // site that feeds it `worldSnapshotDiscoveryMonitor`'s own
        // just-produced `lastResult`.
        //
        // 0.9.193 — Automatic Snapshot Session-Lifetime Guard.
        // `automaticCascadeSessionActive` is the ONE piece of new state this
        // milestone adds: a plain (non-reactive) flag, exactly like
        // `spatialInterval` above, true for as long as this WorldView mount
        // is live and flipped to `false` as the very first statement in
        // `onBeforeUnmount()`, below — BEFORE `session.dispose()` and before
        // anything else tears down. `isSessionActive` hands the cascade a
        // closure reading this flag rather than the flag itself, so the
        // cascade always observes its CURRENT value, synchronously, no
        // matter how long its own resolve/materialize/place chain has been
        // running — see application/AutomaticSnapshotEncounterCascade.js's
        // own "0.9.193" header section for why this is the ONLY new seam
        // needed: the cascade never learns WHY the flag changed, only THAT
        // it did.
        let automaticCascadeSessionActive = true;
        const automaticSnapshotEncounterCascade = new AutomaticSnapshotEncounterCascade({
            resolveSelectedSnapshotCommand,
            materializeSelectedSnapshotCommand,
            worldDiscoverySourceRegistry,
            resolvePlacementInfo: (publicationId) => (typeof session.getPlacementInfoForPublication === 'function'
                ? session.getPlacementInfoForPublication(publicationId)
                : null),
            findPublicationById: (publicationId) => (typeof session.findPublicationById === 'function'
                ? session.findPublicationById(publicationId)
                : null),
            isSessionActive: () => automaticCascadeSessionActive
        });
        // 0.9.190 — Automatic Snapshot Encounter Retention Integration.
        // Scoped to this WorldView's own mount, exactly like `session` and
        // `automaticSnapshotEncounterCascade` immediately above — a fresh
        // reconciliation instance (and therefore a fresh, empty watch list,
        // see that file's own header) accompanies each fresh session. Never
        // imports or modifies the cascade itself; the two are wired
        // together only through `refreshSpatialUI()`, below — the cascade's
        // own `SnapshotWorldRegistrationOutcome.REGISTERED` outcomes feed
        // `noteAutomaticRegistration()`, and this view's own already-
        // recomputed `spatialContext.value.position` feeds `reconcile()`,
        // on the SAME observation tick that already drives both
        // `worldSnapshotDiscoveryMonitor` and the cascade.
        const automaticSnapshotEncounterRetentionReconciliation = new AutomaticSnapshotEncounterRetentionReconciliation({
            worldDiscoverySourceRegistry
        });
        // 0.9.257 — World View Place Naming Presentation.
        //
        // `application/PlaceNamingDiscoveryMonitor.js` (0.9.256) is the
        // authority for "which claims are currently nearby" — this view's
        // whole job is to observe/present its result, never to reproduce
        // discovery, position resolution, or proximity filtering itself.
        // Scoped to this WorldView's own mount, the same "fresh instance
        // accompanies each fresh session" posture `automaticSnapshotEncounterCascade`
        // above already holds — two mounted WorldViews (or a document
        // switch mid-session) never share a monitor's own request id or
        // last-observed position.
        //
        // Both closures below exist ONLY because `application/
        // WorldNavigationSession.js` — the one collaborator that actually
        // holds the current World layout — lives here, in this view, never
        // in `ui/main.js`. Neither closure ranks, verifies, or adopts
        // anything; they answer exactly the two questions the monitor's own
        // header says only a session can answer ("which regions does this
        // replica currently know about, so their own discovery tags can be
        // queried" and "where, in THIS Wanderer's current layout, does a
        // discovered claim's own regionId sit"), then hand the real answer
        // straight to the monitor, which does everything else itself.
        //
        // `resolveClaimPosition` reads `session.getRegions()` — the SAME
        // shared-layout-space read `nearbyGeographicPlaces`/`mapContent`
        // already use every tick — matching a discovered envelope's own
        // `worldId`/`regionId` against a currently-known region's own
        // `position`. A region this replica does not (or no longer) know
        // about resolves to `null`, the monitor's own documented
        // fail-closed default: an unresolvable claim is excluded by
        // proximity selection, never guessed at.
        const placeNamingDiscoveryMonitor = placeNamingDiscoveryQueryService
            ? new PlaceNamingDiscoveryMonitor({
                discoverPlaceNamingClaimsCommand: () => {
                    const regions = session.getRegions();
                    return Promise.all(regions.map((region) => executeDiscoverPlaceNamingClaimsCommand({
                        discoveryTag: derivePlaceNamingDiscoveryTag(region.worldId, region.id),
                        discoveryQueryService: placeNamingDiscoveryQueryService
                    }))).then((perRegionResults) => perRegionResults.flat());
                },
                resolveClaimPosition: (envelope) => {
                    const region = session.getRegions().find((r) => r.worldId === envelope.worldId && r.id === envelope.regionId);
                    return region ? region.position : null;
                }
            })
            : null;
        // 0.9.257 — the identical `automaticCascadeSessionActive` guard
        // pattern immediately above, its own separate flag: flipped to
        // `false` as the very first statement in `onBeforeUnmount()`, below,
        // so a `placeNamingDiscoveryMonitor.observe()` promise still
        // settling after this view has already torn down never writes to
        // `nearbyPlaceNamingClaims`/`placeNamingDiscoveryError` — disposing
        // the monitor itself already stops IT from applying a late result to
        // its own `lastResult`/`lastError`, but says nothing about whether
        // this view's own `.then()` callback still runs; this flag is what
        // stops that callback from touching a torn-down view's own refs.
        let placeNamingDiscoveryPresentationActive = true;
        // 0.3.6 — World Discovery & Exploration. Spatial context service
        // derives location descriptions, nearby structures, and collaborator
        // positions from the viewer's current position and deterministic
        // world environment (terrain ecology, hydrology, structures).
        const spatialContextService = new WorldSpatialContextService(session);
        // Purely a client rendering preference (see docs/Principles.md,
        // "Avatar Visibility Is A Client Rendering Preference, Not
        // Avatar State") — never persisted, never affects
        // AvatarProfile/AvatarPresence. Reflects session.isLocalAvatarVisible()
        // once the session actually starts (a local avatar may not
        // exist at all if nobody is logged in — see hasLocalAvatar).
        const showMyAvatar = ref(true);
        const hasLocalAvatar = ref(false);
        // 0.2.36 — Local Avatar Movement & Animation. Both are pure
        // client controls, mirrored from session.isAvatarControlModeActive()/
        // isFollowingAvatar() the same way showMyAvatar mirrors
        // isLocalAvatarVisible() above: this view never decides
        // movement/camera-follow behavior itself, it only reflects and
        // toggles what the session already owns.
        //
        // 0.3.1 — default ON (both used to default off): entering
        // World View with a local avatar overwhelmingly means "I want
        // to walk around," so the common case now needs zero clicks.
        // Still just an explicit client preference, not a hidden
        // behavior change — both checkboxes remain visible, unchecking
        // either still works exactly as before, and WorldNavigationSession
        // itself still constructs with both off (see
        // _avatarControlModeActive/_followAvatarEnabled) until this
        // view's onMounted actually applies these defaults to the
        // session below.
        const avatarControlMode = ref(true);
        const followAvatar = ref(true);
        // 0.9.98 — Vehicle Mount/Dismount World View Integration. Mirrors
        // session.avatarVehicleInteractionState() the same way
        // avatarControlMode/followAvatar above mirror their own session
        // getters: this view never decides mount/dismount eligibility
        // itself, only reflects the already-authoritative
        // { mounted, vehicleType, targetVehicleId } snapshot
        // application/AvatarVehicleInteractionController.js#vehicleInteractionState()
        // resolves. Refreshed on its own short interval, alongside
        // spatialPresenceSyncInterval below — see that interval's own
        // "why the two cadences must stay independent" precedent; a
        // mount/dismount affordance needs to track proximity closely
        // enough to feel responsive, far tighter than refreshSpatialUI's
        // own 3-second cadence.
        const vehicleInteractionState = ref(null);
        // 0.3.2 — Camera Perspective. Mirrors session.getCameraPerspective()
        // exactly the same way avatarControlMode/followAvatar mirror
        // their own session getters above: this view never decides the
        // camera's framing itself, only reflects and toggles what the
        // session already owns. `null` is "Free" — the ordinary orbit
        // camera every World View has always had.
        const cameraPerspective = ref(null);
        // 0.2.37 — a pure client rendering preference, exactly like
        // showMyAvatar, but deliberately NOT gated on hasLocalAvatar:
        // a logged-out viewer can still see other participants' avatars
        // even though they have none of their own — see
        // docs/Principles.md, "Watching Presence Never Requires Having
        // One."
        const showOtherAvatars = ref(true);
        // 0.2.38 — the unobtrusive presence diagnostic surface (see
        // docs/Principles.md, "Rendering Presence And Trusting
        // Presence Remain Separate"): trusted/stale/conflicting/
        // unavailable counts over the SAME known-remote-avatars this
        // view already renders, refreshed on the same cadence as
        // everything else in refreshSpatialUI() — never per-frame,
        // trust diagnostics don't need to be that fresh.
        const remoteAvatarDiagnostics = ref({ total: 0, trusted: 0, stale: 0, conflicting: 0, unavailable: 0 });
        // 0.9.339 — merges in the shared decentralized provider (see
        // application/CreateDiscoveryUseCase.js's own 0.9.339 comment)
        // purely for this view's own title/author ENRICHMENT of loaded/
        // nearby world markers (refreshSpatialUI/parentTitle/
        // refreshHoverUI below) and catalogEmpty. World Search itself —
        // session.searchWorld(), built entirely separately inside
        // application/CreateWorldViewUseCase.js — is untouched by this
        // milestone and stays local-only, exactly as
        // tests/FederatedRepositoryProductGapAudit.test.js already
        // established; see docs/Principles.md, "Discovery Is One Path,
        // Not Two."
        const decentralizedDiscoveryProviderForEnrichment = inject('decentralizedPublicationDiscoveryProvider', null);
        const { listPublicationsUseCase } = new CreateDiscoveryUseCase().execute({
            decentralizedDiscoveryProvider: decentralizedDiscoveryProviderForEnrichment
        });
        const allPublications = ref([]);

        let spatialInterval = null;
        let pointerStart = null;
        let isDragging = false;
        let feedbackTimer = null;
        // 0.2.99 — which documentId, if any, this replica currently
        // holds World Presence for, and the live subscriptions attached
        // to it — see _syncWorldPresence() below. Plain (non-reactive)
        // bookkeeping, mirroring spatialInterval's own pattern above;
        // nothing in the template ever reads these directly.
        let presentWorldDocumentId = null;
        let unsubscribeWorldPresence = null;
        let unsubscribeWorldMembership = null;
        // 0.3.0 — the SAME bookkeeping shape, one rung further, for
        // SPATIAL presence — see _syncWorldSpatialPresence() below.
        // `spatialPresenceSyncInterval` is a SEPARATE, much faster timer
        // than `spatialInterval` above: coarse presence/membership only
        // need to be re-read every few seconds, but a moving camera
        // needs to be pushed at up to "10-15 updates/second" (see
        // application/WorldSpatialPresenceUseCase.js's own header) — a
        // single shared interval would force one cadence on both.
        let presentSpatialWorldDocumentId = null;
        let unsubscribeWorldSpatialPresence = null;
        // 0.3.10 — which documentId, if any, this replica currently has
        // an active LOCAL World Experience for — see
        // _syncWorldExperience() below. Its own bookkeeping variable,
        // deliberately separate from presentWorldDocumentId/
        // presentSpatialWorldDocumentId above: a session with no
        // localWorldExperienceStore wired still tracks this (session.
        // saveWorldExperience()/restoreWorldExperience() are graceful
        // no-ops either way), so it can't simply reuse either presence
        // variable's lifecycle.
        let presentExperienceWorldDocumentId = null;
        // 0.3.9 — which documentIds have already had their automatic
        // arrival Welcome shown this session, so re-entering the same
        // World later (or a spatial-presence refresh that doesn't
        // actually change the active document) never re-shows it
        // uninvited — only the toolbar's "Explore" button reopens it
        // after the first showing.
        const welcomeShownForDocumentId = new Set();
        let spatialPresenceSyncInterval = null;
        // 0.9.98 — its own independent interval; see
        // vehicleInteractionState's own ref comment above.
        let vehicleInteractionInterval = null;

        // ----------------------------- 0.1.50 action surface -------------

        const feedback = {
            show(message) {
                feedbackMessage.value = message;
                feedbackVisible.value = true;
                if (feedbackTimer) {
                    clearTimeout(feedbackTimer);
                }
                feedbackTimer = setTimeout(() => {
                    feedbackVisible.value = false;
                }, 2500);
            }
        };
        // 0.5.9 — actionRegistry/EditorActionContext/CommandPalette/
        // EditingSidebar are gone from World View entirely: every action
        // createStandardActions() ever offered (selection mutation,
        // transform, clipboard, groups, undo/redo) is now Editor-only —
        // see docs/Principles.md, "World View Observes and Navigates;
        // Editor Mutates and Builds (0.5.9)".

        // Guards every direct session call this view makes outside the
        // EditorActionRegistry (which already catches and surfaces
        // errors itself in surfaceCall — see EditorActionRegistry.js).
        // A rejected mutation (e.g. 0.2.20 fork-on-edit refusing to
        // fork a fork-forbidden published snapshot) becomes a message,
        // not an uncaught exception breaking the pointer/keyboard
        // handler it came from.
        //
        // 0.2.21: also drains session.consumeForkNotice() after a
        // successful call — so the moment a mutation crosses the
        // publication boundary and creates a fork, the user is told
        // what just happened instead of the document id silently
        // changing underneath them (the milestone's "avoid silently
        // making the user wonder why the document ID changed").
        function guarded(fn) {
            try {
                const result = fn();
                if (typeof session.consumeForkNotice === 'function') {
                    const notice = session.consumeForkNotice();
                    if (notice) {
                        feedback.show(`Created your own editable copy — "${notice.sourceTitle}" is unchanged`);
                    }
                }
                return result;
            } catch (err) {
                feedback.show(err.message);
                return undefined;
            }
        }

        // 0.2.21: Document Properties editor. Editing metadata on a
        // published snapshot forks it first — updateDocumentMetadata
        // routes through the same guard every other mutation does — so
        // this goes through guarded() exactly like alignSelection etc.,
        // and a fork-policy denial surfaces the same way.
        //
        // Hardening: openable from two places — the selection-scoped
        // DocumentInfoPanel in the inspection column (whatever brick's
        // world you're currently looking at) and, so editing the
        // document you're ACTUALLY working on never requires selecting
        // a specific brick first, a header button next to Save/Publish
        // bound to activeDocumentInfo. Both funnel through the same
        // dialog; metadataEditTarget records which info object opened
        // it so onSaveMetadata edits the right one.
        function openMetadataEditor(info) {
            if (!info) return;
            metadataEditTarget.value = info;
            showMetadataEditor.value = true;
        }

        function onSaveMetadata({ title, description, license }) {
            const info = metadataEditTarget.value;
            if (!info) return;
            guarded(() => session.updateDocumentMetadata(info.documentId, { title, description, license }));
            showMetadataEditor.value = false;
            metadataEditTarget.value = null;
            refreshSpatialUI();
        }

        // Save/Publish for the World View: there was no equivalent of
        // the Editor's Toolbar until now, even though 0.2.20/0.2.21
        // gave World View the same edit + fork-on-write + metadata
        // capability the Editor has always had — WorldNavigationSession.
        // saveDocument/publishDocument already existed and already
        // refuse a still-published id, this just gives the UI a way to
        // call them. Bound to activeDocumentInfo (not the
        // selection-scoped documentInfo the inspection panel uses),
        // because "save/publish the document I'm editing" means the
        // ACTIVE document specifically — the two usually agree, but
        // aren't the same field, and this is the one that should never
        // be ambiguous about which document it acts on.
        function saveActiveDocument() {
            const info = activeDocumentInfo.value;
            if (!info) return;
            guarded(() => {
                session.saveDocument(info.documentId);
                feedback.show('Saved');
            });
            refreshSpatialUI();
        }

        function publishActiveDocument() {
            const info = activeDocumentInfo.value;
            if (!info) return;
            guarded(() => {
                const publication = session.publishDocument(info.documentId);
                feedback.show(`Published "${publication.title}"`);
            });
            refreshSpatialUI();
        }

        // 0.9.207 — World View History Timeline UI Integration. Connects
        // CommandHistory's own timeline/replay/restore machinery — correct,
        // composed, and unreached since 0.1.40/0.1.41 (see 0.9.206's own
        // finding) — to an actual caller for the first time, exactly the
        // way saveActiveDocument()/publishActiveDocument() immediately
        // above already connect saveDocument()/publishDocument(). Nothing
        // about CommandHistory/ReplayDocumentUseCase/RestoreHistoryStateUseCase
        // changes: this is only session.getTimeline()/beginHistoryPreview()/
        // previewHistoryAt()/cancelHistoryPreview()/restoreHistoryAt(),
        // called in the sequence docs/Principles.md's own 0.5.9 design
        // record anticipated ("a viewer's landmark edit needs to be
        // undoable too") — see docs/Roadmap.md's 0.9.207 entry for the
        // full record.
        // 0.9.284 — Notification History UI Boundary. Purely local UI
        // state — which/whether the panel is open. Recipient-scoped, not
        // document-scoped: unlike showHistoryPanel below, opening this
        // never depends on an activeDocumentInfo/activePlacementInfo.
        const showNotificationHistoryPanel = ref(false);
        const showHistoryPanel = ref(false);
        const historyPanelDocumentId = ref(null);
        const historyTimeline = ref([]);
        const selectedHistoryEntryId = ref(null);
        // The cursor WorldNavigationSession#getHistoryPreview() reports
        // while a preview is active, or null — mirrored locally only so
        // the panel can highlight the previewed row and show/hide "Cancel
        // Preview"; the session's own _historyPreview stays the single
        // source of truth for whether a preview is actually active.
        const historyPreviewCursor = ref(null);

        // 0.9.210 — see undoAction()/redoAction() below. Re-read every
        // refreshSpatialUI() tick from session.canUndo()/canRedo()/
        // getUndoLabel()/getRedoLabel() — never computed locally.
        const canUndo = ref(false);
        const canRedo = ref(false);
        const undoLabel = ref(null);
        const redoLabel = ref(null);

        function openHistoryPanel() {
            const info = activeDocumentInfo.value;
            if (!info) return;
            historyPanelDocumentId.value = info.documentId;
            selectedHistoryEntryId.value = null;
            historyPreviewCursor.value = null;
            historyTimeline.value = session.getTimeline(info.documentId);
            showHistoryPanel.value = true;
        }

        function closeHistoryPanel() {
            // A preview left running behind a closed panel would keep the
            // replay world rendered alongside (or instead of) the live one
            // with no visible way left to end it — always cancel before
            // the panel itself disappears.
            if (historyPreviewCursor.value !== null) {
                guarded(() => session.cancelHistoryPreview());
            }
            showHistoryPanel.value = false;
            historyPanelDocumentId.value = null;
            historyTimeline.value = [];
            selectedHistoryEntryId.value = null;
            historyPreviewCursor.value = null;
        }

        function selectHistoryEntry(entryId) {
            // Selection alone is local UI state — no session call, no
            // mutation, nothing previewed or restored yet.
            selectedHistoryEntryId.value = entryId;
        }

        // Re-reads the timeline fresh and resolves the selected entry's
        // OWN id back to a cursor — never a remembered index. A landmark
        // edit, an undo, or another restore made while this panel sat open
        // can move or remove entirely what used to sit at that index; if
        // the selected id is no longer present, the stale selection is
        // cleared and reported instead of silently acting on whatever now
        // occupies that slot (see ui/components/HistoryTimelinePanel.js's
        // own header).
        //
        // CommandHistory's own cursor means "this many commands applied"
        // (see application/CommandHistory.js#getCursor()/replay()'s own
        // endCursor) — entry.index is 0-based, so "restore/preview to the
        // state with THIS entry's own effect included" is entry.index + 1,
        // never entry.index itself (that would land one command short —
        // the state immediately BEFORE this entry ran). Reusing the exact
        // cursor tests/HistoryRestore.test.js's own flagship already
        // exercises, not a new convention invented here.
        function _resolveSelectedHistoryCursor() {
            const docId = historyPanelDocumentId.value;
            if (!docId || !selectedHistoryEntryId.value) return null;
            const fresh = session.getTimeline(docId);
            historyTimeline.value = fresh;
            const entry = fresh.find((candidate) => candidate.id === selectedHistoryEntryId.value);
            if (!entry) {
                selectedHistoryEntryId.value = null;
                feedback.show('That history entry no longer exists — the timeline has changed');
                return null;
            }
            return entry.index + 1;
        }

        function previewSelectedHistoryEntry() {
            const docId = historyPanelDocumentId.value;
            if (!docId || docId !== session.getActiveDocumentId()) {
                feedback.show('The active document changed — reopen History to preview it');
                return;
            }
            const cursor = _resolveSelectedHistoryCursor();
            if (cursor === null) return;
            guarded(() => {
                if (historyPreviewCursor.value === null) {
                    session.beginHistoryPreview();
                }
                session.previewHistoryAt(cursor);
                historyPreviewCursor.value = cursor;
            });
        }

        function cancelHistoryPreviewAction() {
            guarded(() => session.cancelHistoryPreview());
            historyPreviewCursor.value = null;
        }

        function restoreSelectedHistoryEntry() {
            const docId = historyPanelDocumentId.value;
            const cursor = _resolveSelectedHistoryCursor();
            if (cursor === null) return;
            // restoreHistoryAt() ends any active preview itself (see its
            // own header) — this just stops mirroring a cursor the
            // session no longer has active.
            const restored = guarded(() => {
                session.restoreHistoryAt(cursor, docId);
                return true;
            });
            if (!restored) return;
            feedback.show('Restored to an earlier point in history');
            closeHistoryPanel();
            refreshSpatialUI();
        }

        // 0.9.210 — World View Undo/Redo UI Integration. Thin wrappers
        // over the SAME WorldNavigationSession.undo()/redo() the History
        // panel immediately above already shares one CommandHistory with
        // (both resolve through _getActiveCommandHistory() — see that
        // method's own header) — no second undo/redo engine, no
        // duplicated undoStack/redoStack, no new lifecycle vocabulary.
        // canUndo/canRedo are refreshed on the same refreshSpatialUI()
        // cadence every other action-bar affordance already uses, and
        // already read false while a history preview is active (session.
        // canUndo()/canRedo() mirror undo()/redo()'s own
        // _historyPreview.active gate) — Preview and Undo/Redo stay two
        // separate authorities without this view inventing a rule of its
        // own for the interaction.
        function undoAction() {
            const performed = guarded(() => session.undo());
            if (performed) {
                feedback.show('Undone');
            }
            refreshSpatialUI();
        }

        function redoAction() {
            const performed = guarded(() => session.redo());
            if (performed) {
                feedback.show('Redone');
            }
            refreshSpatialUI();
        }

        // 0.9.104 — World View Publication Distribution Action. The one
        // thing standing between `WorldEncounterCanvas`'s own new
        // `distributionCommand` prop (a plain `(publication) -> Promise`
        // function, see that file's own header) and the app-wide
        // `publicationDistributionCommand` injected above: that command's
        // own full request shape (`{ publication, serializedMaterial,
        // materialStorage, arweaveUploaderOptions, nostrPublisherOptions }`)
        // is more than a bare `Publication`. This function supplies exactly
        // one more field — `serializedMaterial`, this replica's own signed
        // JSON record of the Publication itself — and forwards everything
        // else unchanged.
        //
        // `arweaveUploaderOptions`/`nostrPublisherOptions` ARE DELIBERATELY
        // NOT SUPPLIED HERE. Composing either means either genuine wallet/
        // key management or a live relay choice — both explicitly out of
        // scope for this milestone (see docs/Roadmap.md's own 0.9.104
        // entry, "wallet/signer UI... relay selection UI," both excluded).
        // Calling this function today therefore reaches the REAL command
        // boundary, the REAL orchestrator, and the REAL lifecycle store —
        // 0.9.103's own construction validation still throws synchronously
        // for the still-missing signer/relay configuration, exactly as it
        // already would calling `publicationDistributionCommand()` directly
        // with the same incomplete request. `WorldEncounterCanvas`'s own
        // `distributeSelectedPublication()` catches that throw (and any
        // other genuine rejection) and surfaces one plain notice — see that
        // file's own header. Wiring real signer/relay configuration in
        // remains a separate, later milestone's own decision to make.
        //
        // NEVER CONSTRUCTS AN ARWEAVE CLIENT, A NOSTR CLIENT, OR CALLS THE
        // ORCHESTRATOR DIRECTLY. This function calls exactly one thing:
        // the already-composed `publicationDistributionCommand` injected
        // above — the same restraint `WorldEncounterCanvas` itself holds
        // one layer down.
        function distributeWorldEncounterPublication(publication) {
            if (!publicationDistributionCommand) {
                return Promise.reject(new Error('Publication distribution is not available.'));
            }
            return publicationDistributionCommand({
                publication,
                serializedMaterial: JSON.stringify(publication.toJSON())
            });
        }

        // 0.9.138 — World View Snapshot Distribution Action. The one thing
        // standing between `WorldEncounterCanvas`'s own new
        // `snapshotDistributionCommand` prop (a plain `(publication) ->
        // Promise<{ contentReference, announcement }>` function) and the
        // app-wide `snapshotDistributionCommand` injected above: that
        // command's own full shape (`executeSnapshotDistributionCommand({
        // bytes, contentStore, discoveryPublisher })`) takes raw `bytes`,
        // never a `Publication` domain object — `contentStore`/
        // `discoveryPublisher` are already bound in by `ui/main.js`'s own
        // composition, so this function's only job is turning "which
        // publication" into "which bytes."
        //
        // `bytes` COME FROM THE EXISTING SNAPSHOT/MATERIAL BOUNDARY, NEVER
        // A NEW SERIALIZATION MECHANISM OF THIS VIEW'S OWN. This function
        // never calls `publication.toJSON()`, never computes a content
        // hash, and never constructs an Arweave transaction or a Nostr
        // event — it reads this replica's own already-stored Snapshot bytes
        // back through `publicationCatalogContentResolver.resolve()`, the
        // SAME collaborator `application/CreateExternalSnapshotPlacementUseCase.js`
        // (0.8.18) already reads a Snapshot's own bytes through for the
        // OLDER, peer-based placement family, and stringifies them the
        // identical way that file's own `bytes = JSON.stringify(snapshotJson)`
        // line already does. `SnapshotDistributionCommand.js`'s own header
        // is explicit that `contentStore` is the one and only place a
        // content hash is ever computed — this function computes none.
        //
        // NEVER CONSTRUCTS `ArweaveContentStore`/`NostrSnapshotDiscoveryPublisher`,
        // AND NEVER CALLS `executeSnapshotDistributionCommand()`/
        // `composeSnapshotDistributionRuntime()` DIRECTLY. This function
        // calls exactly one thing: the already-composed
        // `snapshotDistributionCommand` injected above — the same restraint
        // `distributeWorldEncounterPublication()` already holds, one family
        // over.
        function distributeWorldEncounterSnapshot(publication) {
            if (!snapshotDistributionCommand || !publicationCatalogContentResolver) {
                return Promise.reject(new Error('Snapshot distribution is not available.'));
            }
            const snapshotJson = publicationCatalogContentResolver.resolve(publication.id);
            if (snapshotJson === null) {
                return Promise.reject(new Error('Snapshot distribution is not available.'));
            }
            return snapshotDistributionCommand(JSON.stringify(snapshotJson));
        }

        // 0.9.142 — World View Snapshot Discovery Command. The one thing
        // standing between `OwnPublicationPanel`'s own new
        // `discoverSnapshotCommand` prop (a plain `(publication) ->
        // Promise<{ outcome, bytes, candidates, locator, storage,
        // reason }>` function) and the app-wide `discoverSnapshotCommand`
        // injected above: that command's own full shape
        // (`executeDiscoverSnapshotCommand({ discoveryTag, contentHash,
        // resolver, contentStore })`) takes an explicit `contentHash`,
        // never a `Publication` domain object — `discoveryTag`/`resolver`/
        // `contentStore` are already bound in by `ui/main.js`'s own
        // composition, so this function's only job is turning "which
        // publication" into "which contentHash."
        //
        // `contentHash` COMES FROM THE PUBLICATION'S OWN, ALREADY-COMPUTED
        // `contentReference.hash` — NEVER RE-DERIVED, NEVER GUESSED, AND
        // NEVER AN OPEN-ENDED SEARCH. This function never calls
        // `publicationCatalogContentResolver.resolve()`, never computes a
        // content hash of its own, and never asks the injected command to
        // search Nostr for "whatever looks relevant" — see `application/
        // DiscoverSnapshotCommand.js`'s own header, "contentHash is always
        // an explicit, caller-supplied input." A Publication that has
        // never been placed (no `contentReference` yet) has nothing to
        // discover, so this function rejects rather than guessing.
        //
        // NEVER CONSTRUCTS `DecentralizedSnapshotResolver`/
        // `NostrSnapshotDiscoveryQueryService`/`ArweaveContentStore`, AND
        // NEVER CALLS `executeDiscoverSnapshotCommand()`/
        // `composeDiscoverSnapshotRuntime()` DIRECTLY. This function calls
        // exactly one thing: the already-composed `discoverSnapshotCommand`
        // injected above — the same restraint `distributeWorldEncounterSnapshot()`
        // already holds, one action over.
        //
        // 0.9.144 — REUSED VERBATIM FOR WorldEncounterCanvas'S OWN NEW
        // `discoverSnapshotCommand` PROP, NEVER FORKED INTO A SECOND
        // FUNCTION. This function already takes any `Publication` — never
        // reading `ownPublication` or anything else scoped to "own" — so it
        // is bound below to BOTH `OwnPublicationPanel`'s own
        // `discoverSnapshotCommand` prop AND `WorldEncounterCanvas`'s, the
        // same "same seam, only the source of the Publication object
        // differs" restraint `distributeWorldEncounterSnapshot()` already
        // holds for Snapshot distribution's own two entry points. Its name
        // stays `discoverOwnSnapshot` — unchanged, to avoid disturbing
        // 0.9.142's own already-passing test suite — despite now serving a
        // second, non-"own" caller too.
        function discoverOwnSnapshot(publication) {
            if (!discoverSnapshotCommand || !publication || !publication.contentReference) {
                return Promise.reject(new Error('Snapshot discovery is not available.'));
            }
            return discoverSnapshotCommand(publication.contentReference.hash);
        }

        // 0.9.215 — Snapshot Export Capability Integration. Reachable with
        // zero connected peers and an empty World Encounters panel, the
        // identical "your own material never depends on World Encounters"
        // restraint every other action on this SAME `OwnPublicationPanel`
        // surface already holds (see that component's own 0.9.140 header).
        // This function turns "which publication" into "which
        // publicationId" — `publication.id`, the SAME field
        // `unpublishOwnPublication()` above already reads off the
        // identical prop — and calls exactly one thing: the already-
        // composed `exportSnapshotCommand` injected above. It never
        // constructs a BuildPublicationSnapshotTransferPackageUseCase or a
        // SnapshotContentMaterializationCoordinator itself, and never
        // reads `publication.contentReference` — unlike discovery/
        // distribution, export names WHICH PUBLICATION, never which bytes;
        // application/BuildPublicationSnapshotTransferPackageUseCase.js
        // itself resolves the contentReference to export from its own
        // publicationCatalog lookup.
        //
        // Resolves to a Publication Snapshot Transfer Package (application/
        // PublicationSnapshotTransferPackage.js's own `{ kind,
        // schemaVersion, publicationId, contentHash, content }` shape) or
        // rejects — this function never reinterprets either outcome; it is
        // `OwnPublicationPanel.js`'s own job, as the UI layer, to turn a
        // rejection into its own display state, exactly as it already does
        // for `distributeOwnSnapshot()`/`discoverOwnSnapshot()`.
        function exportOwnSnapshot(publication) {
            if (!exportSnapshotCommand || !publication) {
                return Promise.reject(new Error('Snapshot export is not available.'));
            }
            return exportSnapshotCommand(publication.id);
        }

        // 0.9.111 — World View Decentralized Publication Retrieval.
        // `discoverWorldEncounterPublicationCommand` (injected above) is
        // forwarded straight to `WorldEncounterCanvas`'s own new
        // `discoveryCommand` prop below, verbatim — its `{ objectId,
        // discoveryTag } -> Promise<{ discovery, resolution, inspection }>`
        // shape is already exactly what that prop expects, so this view
        // needs no wrapper function of its own (unlike
        // `distributeWorldEncounterPublication()` above, which adds
        // `serializedMaterial`). `WorldEncounterCanvas` now owns the entire
        // discover/render lifecycle — the input fields, the action, and the
        // result panel (rendered through the SAME existing Material/
        // Verification markup 0.9.39's own selection-driven panel already
        // uses) — this view constructs, calls, and interprets none of it
        // itself. See that file's own header, "0.9.111 — World View
        // Decentralized Publication Retrieval."

        // 0.2.23: Move Placement — deliberately NOT routed through
        // updateDocumentMetadata/saveDocument/publishDocument's
        // fork-on-write guard: moving a placement is not a document
        // mutation (see docs/Principles.md, "Moving A Placement Is
        // Not Editing A Document") and must work on a still-published,
        // un-forked world exactly as well as on a fork. guarded() is
        // still used for its own sake — a denied/failed move (no
        // placement known, no ownership) becomes a toast, not an
        // uncaught exception.
        function openPlacementEditor(info) {
            if (!info) return;
            placementEditTarget.value = info;
            placementOverlapWarning.value = null;
            showPlacementEditor.value = true;
        }

        function closePlacementEditor() {
            showPlacementEditor.value = false;
            placementEditTarget.value = null;
            placementOverlapWarning.value = null;
        }

        // 0.2.25: two-step for an occupied destination — check first,
        // only actually move once either the position is clear or the
        // warning already shown has been acknowledged by a second
        // click (see PlacementEditorDialog's `warningIsCurrent`, which
        // is what makes that second click mean "confirm" rather than
        // "check again"). checkPlacementOverlap never mutates anything
        // — see docs/Principles.md, "Overlap Is A Fact; Collision Is A
        // Policy Decision" — so a REJECT-policy decision surfaces here
        // as a plain guarded() error, the same as any other refused
        // mutation.
        function onMovePlacement(position) {
            const info = placementEditTarget.value;
            if (!info) return;

            // The pending warning only counts as "already confirmed" for
            // the EXACT position it was computed for — if the user
            // edited/nudged the fields since seeing it (dialog's own
            // `warningIsCurrent` would already be false in that case,
            // reverting its button to plain "Move"), this click means
            // "check this new position," not "proceed anyway."
            const pending = placementOverlapWarning.value;
            const pendingPosition = pending && pending.overlap ? pending.overlap.position : null;
            const warningMatchesRequest = !!pendingPosition
                && pendingPosition.x === position.x && pendingPosition.y === position.y && pendingPosition.z === position.z;

            if (!warningMatchesRequest) {
                const check = guarded(() => session.checkPlacementOverlap(info.documentId, position));
                if (check && check.requiresConfirmation) {
                    placementOverlapWarning.value = check;
                    return;
                }
                placementOverlapWarning.value = null;
                if (check && !check.allowed) {
                    feedback.show('This position is not available.');
                    return;
                }
            }

            guarded(() => {
                session.movePlacement(info.documentId, position);
                feedback.show('Placement moved');
            });
            closePlacementEditor();
            refreshSpatialUI();
        }

        // 0.9.197 — World Placement Removal UI Action. The mirror of
        // onMovePlacement above, and just as thin: this view only
        // resolves WHICH placement the panel was showing (via the
        // `info` PlacementInfoPanel already emitted 'remove' for) and
        // hands it to WorldNavigationSession.removePlacement() —
        // RemoveWorldPlacementUseCase remains the sole authority for
        // actually removing it. `info.placementId` is passed through as
        // the compare-and-swap guard (see removePlacement()'s own
        // header) rather than just `info.documentId`, so a placement
        // that changed underneath this stale panel since it was
        // rendered is never silently removed in place of whatever
        // replaced it.
        //
        // No local "it's gone" state to set here: placementInfo is
        // ENTIRELY derived from session.getPlacementInfo() inside
        // refreshSpatialUI() (see its own comment there), so once the
        // placement registry no longer has a record for this document,
        // the next refresh already makes placementInfo null and the
        // panel disappears on its own — the same collapse a document
        // that was never placed at all already produces.
        function removePlacementFromPanel(info) {
            if (!info) return;
            guarded(() => {
                session.removePlacement(info.documentId, info.placementId);
                feedback.show('Placement removed from World');
            });
            refreshSpatialUI();
        }

        // 0.9.198 — Publication Unpublish/Retract UI Action. The mirror
        // of removePlacementFromPanel above, one authority up: this view
        // only resolves WHICH document/publication OwnPublicationPanel
        // was showing (via the `publication` object it already received
        // as a prop) and hands it to
        // WorldNavigationSession.unpublishDocument() —
        // UnpublishDocumentUseCase remains the sole authority for
        // actually retracting it. `publication.id` is passed through as
        // the SAME compare-and-swap guard `info.placementId` already is
        // above, so a Publication that changed underneath this stale
        // panel since it was rendered is never silently unpublished in
        // place of whatever replaced it.
        //
        // No local "it's unpublished" state to set here: ownPublication,
        // like activePlacementInfo, is ENTIRELY derived from
        // session.getPublicationForDocument() inside refreshSpatialUI()
        // (see its own comment there), so once the catalog no longer
        // has a record for this document, the next refresh already
        // makes ownPublication null and OwnPublicationPanel's own
        // publication detail collapses on its own — the same "null when
        // the question doesn't apply" rule activePlacementInfo already
        // follows. This deliberately never touches activePlacementInfo
        // or the placement registry itself — see
        // WorldNavigationSession.unpublishDocument()'s own header for
        // the documented (not invented) consequence of a placement
        // becoming unresolvable through the document-keyed path once
        // its governing Publication is gone.
        function unpublishOwnPublication(publication) {
            if (!publication) return;
            guarded(() => {
                const removed = session.unpublishDocument(publication.documentId, publication.id);
                if (removed) {
                    feedback.show('Publication unpublished');
                }
            });
            refreshSpatialUI();
        }

        // 0.9.248 — Publication Commentary UI Integration. Thin wrappers
        // around session.getPublicationCommentaries()/
        // addPublicationCommentary(), mirroring distributeWorldEncounterSnapshot()'s
        // own restraint above: this view resolves nothing and decides
        // nothing itself, it only forwards to the session. A thrown
        // error from addPublicationCommentaryCommand (missing identity,
        // authorization denial, a storage conflict) is deliberately NOT
        // caught here or routed through guarded() — OwnPublicationPanel
        // catches it itself and renders it as its own commentary error
        // state, never a transient global feedback toast.
        //
        // 0.9.291 — these SAME two functions are now ALSO bound to
        // WorldEncounterCanvas's own identically-named props, below (see
        // that file's own "0.9.291" header for why reusing this
        // already-in-scope composition, rather than the app-wide one
        // ui/main.js composes, was preferred). WorldEncounterCanvas
        // catches its own thrown errors exactly the same restraint
        // OwnPublicationPanel already holds — this function still resolves
        // and decides nothing.
        function getPublicationCommentariesCommand(publicationId) {
            return session.getPublicationCommentaries(publicationId);
        }

        function addPublicationCommentaryCommand({ publicationId, content }) {
            return session.addPublicationCommentary({ publicationId, content });
        }

        // 0.9.308 — Publication Multi-Placement Visibility. A thin
        // wrapper around session.getPlacementsForPublication(), mirroring
        // getPublicationCommentariesCommand()'s own restraint immediately
        // above: this view resolves nothing and decides nothing itself,
        // it only forwards to the session. An exception thrown by the
        // session (a genuine discovery failure) is deliberately NOT
        // caught here — OwnPublicationPanel catches it itself and renders
        // it as its own placement-discovery error state, distinct from a
        // real, empty `[]` result, never a transient global feedback
        // toast.
        function getPublicationPlacementsCommand(publicationId) {
            return session.getPlacementsForPublication(publicationId);
        }

        // 0.9.284 — Notification History UI Boundary. A thin wrapper
        // around session.getRecipientNotificationEvents(), mirroring
        // getPublicationCommentariesCommand()'s own restraint immediately
        // above: this view resolves nothing and decides nothing itself,
        // it only forwards to the session. A thrown error (no
        // authenticated identity, or a genuine storage failure) is
        // deliberately NOT caught here or routed through guarded() —
        // NotificationHistoryPanel catches it itself and renders it as
        // its own notification-history error state, never a transient
        // global feedback toast.
        function getRecipientNotificationEventsCommand() {
            return session.getRecipientNotificationEvents();
        }

        function openNotificationHistoryPanel() {
            showNotificationHistoryPanel.value = true;
        }

        function closeNotificationHistoryPanel() {
            showNotificationHistoryPanel.value = false;
        }

        // Tool switching (Select/Place) — REMOVED (0.5.9). World View
        // only ever has one "mode" left: look around and pick/hover for
        // focus and inspection. See docs/Principles.md, "World View
        // Observes and Navigates; Editor Mutates and Builds".

        // -----------------------------------------------------------------
        // Spatial UI refresh
        // -----------------------------------------------------------------

        function refreshSpatialUI() {
            const state = session.getSpatialState();
            const docs = session.getLoadedDocuments();
            const pubMap = new Map(allPublications.value.map((p) => [p.documentId, p]));

            loadedWorlds.value = state.loaded.map((id) => {
                const doc = docs.find((d) => d.world.id === id);
                const pub = pubMap.get(id);
                return {
                    documentId: id,
                    title: doc?.metadata?.title || pub?.title || 'Untitled',
                    author: doc?.metadata?.author || pub?.author || 'anonymous'
                };
            });

            const loadedSet = new Set(state.loaded);
            nearbyWorlds.value = state.nearby
                .filter((id) => !loadedSet.has(id))
                .map((id) => {
                    const pub = pubMap.get(id);
                    return {
                        documentId: id,
                        title: pub?.title || 'Untitled',
                        author: pub?.author || 'anonymous'
                    };
                });

            failedWorlds.value = state.failed.map((id) => {
                const pub = pubMap.get(id);
                return {
                    documentId: id,
                    title: pub?.title || 'Untitled',
                    author: pub?.author || 'anonymous'
                };
            });

            cameraPosition.value = state.cameraPosition;
            // 0.2.94 — re-read alongside cameraPosition on the exact
            // same cadence; see compassHeading's own ref comment.
            compassHeading.value = session.getCompassHeading();
            
            // 0.3.6 — World Discovery & Exploration. Derive spatial context
            // (terrain zone, hydrology feature, nearby structures, collaborators)
            // from current camera position for contextual location descriptions.
            spatialContext.value = spatialContextService.getCurrentContext();

            // 0.9.186 — World Snapshot Background Discovery. Feeds this
            // view's own just-recomputed spatialContext to the app-wide
            // WorldSnapshotDiscoveryMonitor on every refreshSpatialUI()
            // tick — the SAME cadence (a 3-second interval, plus assorted
            // movement/session events) every other field on this line
            // already refreshes on; this milestone adds no polling loop of
            // its own. The monitor's own shouldRefreshSnapshotDiscovery()
            // decision boundary silently no-ops most of these calls — only
            // a meaningful World-area change ever results in an actual
            // discovery call.
            //
            // 0.9.187 — Automatic Snapshot Encounter Cascade. Once that
            // observation has settled, whatever the monitor's own
            // `lastResult` now holds (unchanged, `[]`, or a freshly
            // discovered candidate array — this view never distinguishes
            // which) is handed, one candidate at a time, IN THE SAME ORDER,
            // to `automaticSnapshotEncounterCascade.processCandidate()`.
            // Re-feeding an UNCHANGED `lastResult` on a tick that triggered
            // no fresh discovery call is harmless and deliberate — the
            // cascade's own idempotency (keyed on
            // `publicationId:contentHash`, never on this call site) is what
            // makes every one of these repeats a no-op past the first, not
            // any dedup this view performs. This promise, too, is
            // intentionally never awaited: driving a discovered candidate
            // to resolution/materialization/placement/registration is a
            // background concern this tick never blocks on or renders
            // directly — a successful registration becomes visible only
            // through the ordinary, unmodified WorldEncounterCanvas
            // rendering pipeline once it re-reads worldDiscoverySourceRegistry.
            if (worldSnapshotDiscoveryMonitor && spatialContext.value) {
                worldSnapshotDiscoveryMonitor.observe(spatialContext.value).then(() => {
                    const candidates = worldSnapshotDiscoveryMonitor.lastResult;
                    if (automaticSnapshotEncounterCascade && Array.isArray(candidates)) {
                        candidates.forEach((candidate) => automaticSnapshotEncounterCascade.processCandidate(candidate).then((result) => {
                            // 0.9.190 — Automatic Snapshot Encounter Retention
                            // Integration. The ONLY place a subject ever becomes
                            // watched for retention — see
                            // AutomaticSnapshotEncounterRetentionReconciliation.js's
                            // own header, "Provenance, without a new persistent
                            // flag." A manually-registered Snapshot never passes
                            // through this callback at all.
                            if (result && result.outcome === SnapshotWorldRegistrationOutcome.REGISTERED) {
                                automaticSnapshotEncounterRetentionReconciliation.noteAutomaticRegistration({
                                    publicationId: result.publicationId,
                                    contentHash: result.contentHash
                                });
                            }
                        }));
                    }
                });
            }

            // 0.9.257 — World View Place Naming Presentation. The SAME
            // cadence every other field on this tick already refreshes on —
            // this milestone adds no polling loop, timer, or subscription of
            // its own; see `placeNamingDiscoveryMonitor`'s own construction
            // comment, above. Unlike `worldSnapshotDiscoveryMonitor` above,
            // `observe()` is handed `spatialContext.value.position` —a raw
            // `{x,z}` — never the whole spatialContext object:
            // `application/ShouldRefreshPlaceNamingDiscovery.js` compares
            // raw positions directly, unlike Snapshot discovery's own
            // context-shaped threshold.
            //
            // Once the observation settles, this view reads EXACTLY
            // `placeNamingDiscoveryMonitor.lastResult`/`.lastError` into its
            // own `nearbyPlaceNamingClaims`/`placeNamingDiscoveryError` refs
            // — no filtering, reordering, deduplication, or "primary name"
            // selection of any kind happens here. A discovery cycle that
            // fails leaves `lastResult` (and therefore this view's own
            // `nearbyPlaceNamingClaims`) exactly as it was — see
            // `PlaceNamingDiscoveryMonitor`'s own header, "a discovery
            // failure never mutates lastResult" — so the previously
            // displayed claims simply remain on screen, with
            // `placeNamingDiscoveryError` the only thing that changes.
            //
            // `placeNamingDiscoveryPresentationActive` (flipped `false` as
            // the very first statement in `onBeforeUnmount()`, below) guards
            // against this callback still running after this view has torn
            // down — a real possibility since `observe()`'s own returned
            // promise is intentionally never awaited by this tick, the same
            // "background concern this tick never blocks on" restraint
            // `worldSnapshotDiscoveryMonitor`'s own call above already
            // holds.
            if (placeNamingDiscoveryMonitor && spatialContext.value) {
                placeNamingDiscoveryMonitor.observe(spatialContext.value.position).then(() => {
                    if (!placeNamingDiscoveryPresentationActive) {
                        return;
                    }
                    nearbyPlaceNamingClaims.value = placeNamingDiscoveryMonitor.lastResult || [];
                    placeNamingDiscoveryError.value = placeNamingDiscoveryMonitor.lastError;
                });
            }

            // 0.9.190 — Automatic Snapshot Encounter Retention Integration.
            // Reconciled on the SAME cadence as spatialContext itself, above
            // — every refreshSpatialUI() tick, not gated behind the
            // discovery monitor's own refresh threshold, so an already-
            // watched Snapshot is evaluated against the Wanderer's own
            // CURRENT position every tick, exactly as
            // application/AutomaticSnapshotEncounterRetentionPolicy.js's own
            // header specifies. A no-op when nothing is currently watched.
            automaticSnapshotEncounterRetentionReconciliation.reconcile(
                spatialContext.value ? spatialContext.value.position : null
            );

            // 0.5.1 — World Maps & Geographic Navigation. Re-read on the
            // exact same cadence as spatialContext above — see
            // `mapContent`'s own ref comment.
            mapContent.value = session.getMapContent((identityId) => resolveIdentityDisplayName(identityId));

            // 0.5.6 — Geographic Place Navigation & Arrival. Re-read on
            // the exact same cadence — see `nearbyGeographicPlaces`'s
            // own ref comment.
            nearbyGeographicPlaces.value = session.getNearbyGeographicPlaces();

            // 0.2.38 — see the ref's own comment above.
            if (typeof session.getRemoteAvatarDiagnostics === 'function') {
                remoteAvatarDiagnostics.value = session.getRemoteAvatarDiagnostics();
            }

            const sel = session.getSpatialSelection();
            if (sel && !sel.isEmpty) {
                const pub = pubMap.get(sel.documentId);
                spatialSelection.value = {
                    type: sel.type,
                    documentId: sel.documentId,
                    buildingId: sel.buildingId,
                    brickId: sel.brickId,
                    position: sel.position,
                    count: sel.items.length,
                    worldTitle: pub?.title || 'Untitled',
                    worldAuthor: pub?.author || 'anonymous'
                };
            } else {
                spatialSelection.value = null;
            }

            const inspection = session.getSpatialInspection();
            if (inspection && !inspection.isEmpty) {
                spatialInspection.value = {
                    type: inspection.type,
                    // Pre-existing bug, found while chasing a missing
                    // "Edit a Copy" button (0.5.9): SpatialInspectionState
                    // keeps documentId/buildingId/brickId/placementId as
                    // its OWN top-level fields, siblings of `data`, not
                    // inside it (see application/spatial-state/
                    // SpatialInspectionState.js). Spreading only
                    // `inspection.data` silently dropped `documentId`
                    // from this object entirely — every button gated on
                    // `spatialInspection.documentId` (Focus World, since
                    // 0.2.93, and now Edit a Copy) has never actually
                    // been able to render for a brick/ground/placement
                    // inspection. `data` already carries the identical
                    // value under `worldId` for every inspection type,
                    // which is why the surrounding fields (Type, World,
                    // Author, ...) always rendered fine.
                    documentId: inspection.documentId,
                    ...inspection.data
                };
            } else {
                spatialInspection.value = null;
            }

            // 0.2.21: the Document Info panel for whatever the
            // inspection panel is currently showing — same documentId
            // 0.2.20's editability notice used, now folded into the
            // richer shape (title/description/license/status/
            // editabilityNotice together) getDocumentInfo returns.
            documentInfo.value = (spatialInspection.value && spatialInspection.value.documentId
                && typeof session.getDocumentInfo === 'function')
                ? session.getDocumentInfo(spatialInspection.value.documentId)
                : null;

            // 0.2.23: the placement (WHERE) for the same world
            // documentInfo (WHAT) just described — kept as a sibling
            // lookup, not folded into getDocumentInfo's shape, exactly
            // the "don't blur the concepts" separation the milestone
            // design asked for. null (not a placement-shaped object
            // full of nulls) when the world has no known placement yet.
            placementInfo.value = (spatialInspection.value && spatialInspection.value.documentId
                && typeof session.getPlacementInfo === 'function')
                ? session.getPlacementInfo(spatialInspection.value.documentId)
                : null;

            // 0.2.39 — independent of spatialInspection above: an
            // avatar interaction target and a brick/ground selection
            // are mutually exclusive (see WorldNavigationSession.pick()),
            // so at most one of {documentInfo/placementInfo, avatarInfo}
            // is ever non-null at a time, but they're read from
            // completely separate session state, never derived from
            // each other.
            avatarInfo.value = typeof session.getAvatarInfo === 'function'
                ? session.getAvatarInfo()
                : null;
            followedRemoteAvatarId.value = typeof session.getFollowedRemoteAvatarId === 'function'
                ? session.getFollowedRemoteAvatarId()
                : null;

            // 0.2.43 — independent of avatarInfo/spatialSelection above:
            // "who is near me" is a standing fact about the local
            // avatar's own position, not tied to whatever is currently
            // selected or targeted.
            nearbyAvatars.value = typeof session.getNearbyAvatars === 'function'
                ? session.getNearbyAvatars().map((entry) => ({
                    ...entry,
                    displayName: session.getAvatarDisplayName(entry.avatarId)
                }))
                : [];

            // 0.2.22: the header (title/author/status) and the route
            // always track the ACTIVE document — session.
            // getActiveDocumentId() — never a route param frozen at
            // mount time. Before this, forking (0.2.20) changed which
            // document mutations landed on without the visible title,
            // URL, or "current world" highlight ever following: the
            // screen kept saying "Alice's World" while every
            // subsequent edit was silently going to Bob's fork. This
            // runs on every refresh — every pointer/keyboard
            // interaction and the periodic streaming poll both call
            // refreshSpatialUI() already — so the transition is never
            // more than one interaction late, and is the SAME
            // documentId->route mechanism focusWorld() already used
            // for an explicit "Focus World" click, just applied
            // automatically instead of only on request.
            const activeId = typeof session.getActiveDocumentId === 'function'
                ? session.getActiveDocumentId()
                : initialDocumentId;
            const activeDoc = docs.find((d) => d.world.id === activeId);
            if (activeDoc) {
                title.value = activeDoc.metadata.title || 'Untitled';
                author.value = activeDoc.metadata.author;
            }
            activeDocumentInfo.value = (activeId && typeof session.getDocumentInfo === 'function')
                ? session.getDocumentInfo(activeId)
                : null;
            // 0.9.210 — World View Undo/Redo UI Integration. Same cadence
            // as activeDocumentInfo immediately above, since both track
            // "what can be done to the currently active document."
            canUndo.value = typeof session.canUndo === 'function' && session.canUndo();
            canRedo.value = typeof session.canRedo === 'function' && session.canRedo();
            undoLabel.value = typeof session.getUndoLabel === 'function' ? session.getUndoLabel() : null;
            redoLabel.value = typeof session.getRedoLabel === 'function' ? session.getRedoLabel() : null;
            activePlacementInfo.value = (activeId && typeof session.getPlacementInfo === 'function')
                ? session.getPlacementInfo(activeId)
                : null;
            // 0.9.140 — see ownPublication's own ref comment above.
            ownPublication.value = (activeId && typeof session.getPublicationForDocument === 'function')
                ? session.getPublicationForDocument(activeId)
                : null;
            if (activeId && activeId !== route.params.documentId) {
                router.replace({ path: `/world/${activeId}` });
            }

            // 0.2.99 — World Collaboration UX. Presence/membership track
            // the SAME active document Save/Publish/Edit Metadata above
            // already operate on — see _syncWorldPresence()'s own
            // header. A no-op when activeId hasn't actually changed
            // since the last tick, so this never re-enters presence (or
            // re-subscribes) on every 3-second poll.
            _syncWorldPresence(activeId);
            // 0.3.10 — runs BEFORE _syncWorldSpatialPresence() below on
            // purpose: it populates worldReturnInfo (and restores this
            // replica's own last camera framing) for `activeId` before
            // spatial presence's own arrival check can open the Welcome
            // panel — see _syncWorldExperience()'s own header.
            _syncWorldExperience(activeId);
            // 0.3.0 — the SAME active-document tracking, one protocol
            // further — see _syncWorldSpatialPresence()'s own header.
            _syncWorldSpatialPresence(activeId);
            isActiveWorldOwner.value = activeId ? session.isWorldOwner(activeId) : false;
            // 0.3.7 — see canEditActiveWorld's own ref comment above.
            canEditActiveWorld.value = activeId ? session.canEditDocument(activeId) : false;

            // 0.2.27: the camera's own target, kept and shown
            // separately from the active document above — see
            // docs/Principles.md, "Camera Focus, Active Document, and
            // Selection Are Three Different Things." Two publications
            // can share a coordinate; focusing one, then the other,
            // moves the camera nowhere the second time, but Editing
            // still needs to say which one is now the mutation target.
            const focusedId = typeof session.getFocusedDocumentId === 'function'
                ? session.getFocusedDocumentId()
                : activeId;
            if (!focusedId) {
                focusedDocumentTitle.value = null;
            } else {
                const focusedDoc = docs.find((d) => d.world.id === focusedId);
                const focusedPub = pubMap.get(focusedId);
                focusedDocumentTitle.value = focusedDoc?.metadata?.title || focusedPub?.title || 'Untitled';
            }
        }

        // -----------------------------------------------------------------
        // 0.2.99 — World Collaboration UX
        // -----------------------------------------------------------------
        //
        // Presence is scoped to the ACTIVE document — the same one
        // Save/Publish/Edit Metadata already act on — never the merely
        // FOCUSED (camera) document; see docs/Principles.md, "Camera
        // Focus, Active Document, and Selection Are Three Different
        // Things." Entering presence for a World you're only looking at,
        // without ever making it the active document, would announce
        // "here" for a document nobody upstream considers current.
        //
        // A no-op unless the active document actually changed since the
        // last call — session.enterWorldPresence()/onWorldPresenceChanged()
        // etc. are all graceful no-ops with no worldPresenceUseCase
        // wired anyway, but re-subscribing every 3-second poll tick
        // would still be wasteful churn even then.
        function _syncWorldPresence(activeId) {
            if (activeId === presentWorldDocumentId) {
                return;
            }
            if (presentWorldDocumentId) {
                session.leaveWorldPresence(presentWorldDocumentId);
            }
            if (unsubscribeWorldPresence) {
                unsubscribeWorldPresence();
                unsubscribeWorldPresence = null;
            }
            if (unsubscribeWorldMembership) {
                unsubscribeWorldMembership();
                unsubscribeWorldMembership = null;
            }
            presentWorldDocumentId = activeId || null;
            refreshCollaborationRoster(presentWorldDocumentId);
            if (!presentWorldDocumentId) {
                return;
            }
            session.enterWorldPresence(presentWorldDocumentId);
            // Live updates: a GOSSIPED grant/revocation, or another
            // participant's presence changing, refreshes the roster the
            // moment it arrives — never only on the next 3-second poll.
            // See WorldNavigationSession#onWorldMembershipChanged()/
            // onWorldPresenceChanged()'s own headers.
            //
            // 0.9.217 — this is also the exact moment
            // refreshWorldPresenceActivity()'s own header names as its
            // trigger: "the call a session makes after a World edit
            // grant it holds changes (granted or revoked)." A grant or
            // revocation touching THIS document — self-issued via
            // grantWorldEdit()/revokeWorldEdit() above, or gossiped in
            // from the owner — is exactly that event, so this replica's
            // OWN advertised activity is re-derived and re-broadcast
            // right here, never waiting on the unrelated 3-second
            // spatial poll (session.canEditDocument() is already
            // re-read there for the LOCAL "can I edit" label, but
            // nothing on that cadence ever told OTHER peers this
            // replica's activity changed).
            //
            // 0.9.218 — refreshWorldPresenceActivity() is wrapped in its
            // own try/catch, isolated from the pre-existing roster
            // refresh beside it. onWorldMembershipChanged() is a SHARED
            // callback invoked SYNCHRONOUSLY from inside
            // application/WorldMembershipUseCase.js's own
            // grantEdit()/_applyGrant() — an uncaught throw here does not
            // merely fail silently in this view, it unwinds back through
            // that use case's own event publish and skips its OWN
            // subsequent network broadcast, breaking a grant/revocation
            // for every peer, not just this replica's presence. See
            // tests/WorldPresenceMembershipRefreshLifecycleAudit.test.js's
            // own Section H for the failing case this closes.
            unsubscribeWorldMembership = session.onWorldMembershipChanged(presentWorldDocumentId, () => {
                worldMembers.value = session.listWorldMembers(presentWorldDocumentId);
                try {
                    session.refreshWorldPresenceActivity(presentWorldDocumentId);
                } catch {
                    // Best-effort, exactly like WorldPresenceUseCase's own
                    // _broadcast() catch — a failure re-deriving this
                    // replica's OWN advertised activity is never allowed
                    // to break the membership event that triggered it.
                }
            });
            unsubscribeWorldPresence = session.onWorldPresenceChanged(presentWorldDocumentId, (roster) => {
                worldPresenceRoster.value = roster;
            });
        }

        // 0.3.10 — World Persistence & Return Experience. Mirrors
        // _syncWorldPresence() above in SHAPE only (a no-op unless the
        // active document actually changed, save-then-restore across the
        // transition) — deliberately NOT the same protocol: this reads
        // and writes nothing but this replica's OWN local storage (see
        // session.saveWorldExperience()/restoreWorldExperience()'s own
        // header), never anything broadcast to a peer. `worldReturnInfo`
        // is captured from the OUTGOING (prior) experience record before
        // this tick's own restore/save ever touches it, so it always
        // describes "how I last left this World," never the visit
        // currently starting.
        function _syncWorldExperience(activeId) {
            if (activeId === presentExperienceWorldDocumentId) {
                return;
            }
            if (presentExperienceWorldDocumentId) {
                session.saveWorldExperience(presentExperienceWorldDocumentId);
            }
            presentExperienceWorldDocumentId = activeId || null;
            if (!presentExperienceWorldDocumentId) {
                worldReturnInfo.value = null;
                return;
            }
            const hasVisitedBefore = typeof session.hasVisitedWorld === 'function'
                && session.hasVisitedWorld(presentExperienceWorldDocumentId);
            const priorExperience = hasVisitedBefore && typeof session.getWorldExperience === 'function'
                ? session.getWorldExperience(presentExperienceWorldDocumentId)
                : null;
            worldReturnInfo.value = priorExperience ? { lastVisitedAt: priorExperience.lastVisitedAt } : null;
            if (typeof session.restoreWorldExperience === 'function') {
                session.restoreWorldExperience(presentExperienceWorldDocumentId);
            }
        }

        function refreshCollaborationRoster(documentId) {
            if (!documentId) {
                worldMembers.value = [];
                worldPresenceRoster.value = [];
                return;
            }
            worldMembers.value = session.listWorldMembers(documentId);
            worldPresenceRoster.value = session.getWorldPresenceRoster(documentId);
        }

        // 0.3.0 — Collaborative Spatial Presence. Mirrors
        // _syncWorldPresence() above exactly, one protocol further: a
        // no-op unless the active document actually changed, tears down
        // the previous World's spatial presence and subscription before
        // entering the new one. session.enterWorldSpatialPresence()/
        // leaveWorldSpatialPresence()/onWorldSpatialPresenceChanged()
        // are all graceful no-ops with no worldSpatialPresenceUseCase
        // wired — see application/WorldNavigationSession.js's own header.
        function _syncWorldSpatialPresence(activeId) {
            if (activeId === presentSpatialWorldDocumentId) {
                return;
            }
            if (presentSpatialWorldDocumentId) {
                session.leaveWorldSpatialPresence(presentSpatialWorldDocumentId);
            }
            if (unsubscribeWorldSpatialPresence) {
                unsubscribeWorldSpatialPresence();
                unsubscribeWorldSpatialPresence = null;
            }
            presentSpatialWorldDocumentId = activeId || null;
            spatialCollaboratorRows.value = [];
            if (!presentSpatialWorldDocumentId) {
                return;
            }
            session.enterWorldSpatialPresence(presentSpatialWorldDocumentId, {
                resolveDisplayName: (identityId) => resolveIdentityDisplayName(identityId)
            });
            spatialCollaboratorRows.value = buildSpatialCollaboratorRows(
                session.getWorldSpatialPresenceRoster(presentSpatialWorldDocumentId),
                { resolveDisplayName: resolveIdentityDisplayName, resolveSelectionLabel: (selection) => session.resolveSpatialSelectionLabel(selection) }
            );
            unsubscribeWorldSpatialPresence = session.onWorldSpatialPresenceChanged(presentSpatialWorldDocumentId, (roster) => {
                spatialCollaboratorRows.value = buildSpatialCollaboratorRows(roster, {
                    resolveDisplayName: resolveIdentityDisplayName,
                    resolveSelectionLabel: (selection) => session.resolveSpatialSelectionLabel(selection)
                });
                // 0.3.9 — a live presence change (someone joins, starts
                // building, leaves) refreshes an ALREADY-OPEN welcome/
                // exploration panel's "What's happening nearby?" and
                // suggestions in place — see docs/Principles.md,
                // "Exploration Guides Attention, Never Ownership or
                // Mutation (0.3.9)": this never reopens a panel the
                // viewer already dismissed.
                if (showWelcomePanel.value) {
                    refreshWelcomeContext();
                }
            });
            // 0.3.9 — the automatic arrival showing: once per World per
            // session, the moment this session actually enters that
            // World's spatial presence. See `welcomeShownForDocumentId`'s
            // own comment above for why a later re-entry (or an
            // unrelated refreshSpatialUI() tick) never repeats it.
            if (!welcomeShownForDocumentId.has(presentSpatialWorldDocumentId)) {
                welcomeShownForDocumentId.add(presentSpatialWorldDocumentId);
                openWelcomePanel(true);
            }
        }

        // 0.3.9 — World Welcome & Guided Exploration. Re-reads
        // session.getWelcomeContext() fresh (never cached beyond this
        // call) and stores its plain toJSON() shape — the same "map to
        // toJSON() before storing in a ref" convention
        // refreshLocationsPanel() above already uses for
        // getWorldLocations(). `resolveIdentityDisplayName` is the same
        // presentation-only resolver every other spatial-presence path
        // in this file already threads through.
        function refreshWelcomeContext() {
            const context = typeof session.getWelcomeContext === 'function'
                ? session.getWelcomeContext((identityId) => resolveIdentityDisplayName(identityId))
                : null;
            welcomeContext.value = context ? context.toJSON() : null;
        }

        // 0.3.10 — true only for the automatic ARRIVAL showing of a World
        // this replica has a prior local experience record for — "Welcome
        // back," never "Welcome," and "Continue Exploring" over "Explore
        // Freely." Reopening later via the toolbar's "Explore" button
        // (isArrival: false) always shows the plain, non-returning framing
        // — returning is specifically about how you ARRIVED, not a
        // permanent mode for the rest of the visit.
        const welcomeIsReturning = computed(() => welcomeIsArrival.value && Boolean(worldReturnInfo.value));

        function openWelcomePanel(isArrival) {
            refreshWelcomeContext();
            welcomeIsArrival.value = Boolean(isArrival);
            showWelcomePanel.value = true;
            // 0.5.7 — the Welcome panel IS Explore mode's content
            // (see setPrimaryMode() below), including on the automatic
            // arrival showing — so primaryMode always agrees with what's
            // actually on screen, never left pointing at whatever mode
            // the viewer was in during a PREVIOUS World.
            worldViewNav.setPrimaryMode(WorldViewPrimaryMode.EXPLORE);
            primaryMode.value = worldViewNav.primaryMode;
        }

        // The Explore primary-mode entry point (section 7 of the
        // original 0.3.9 design: "a small exploration control... selects
        // a destination from existing derived information") — same
        // content and component as the automatic arrival showing, just
        // reopened on request rather than once automatically.
        //
        // 0.5.7 — routed through setPrimaryMode() so re-entering Explore
        // also closes whatever other primary surface (Map, Places) was
        // open, the same one-panel-at-a-time guarantee every other mode
        // switch gets.
        function openExplorePanel() {
            setPrimaryMode(WorldViewPrimaryMode.EXPLORE);
        }

        // 0.5.7 — dismissing Explore's own content returns primaryMode
        // to its resting default rather than leaving the Explore tab
        // shown "active" with nothing underneath it — Explore already
        // IS that default (see WorldViewNavigationState's own
        // constructor), so this is a no-op on primaryMode itself, only
        // on the panel's visibility.
        function closeWelcomePanel() {
            showWelcomePanel.value = false;
        }

        // WorldWelcomePanel's own `explore` emit carries the raw
        // WorldExplorationSuggestion#toJSON() shape — this is the ONE
        // place that decides which existing navigation primitive a
        // suggestion's `kind` maps to, exactly the mapping the design
        // calls for: landmark/structure/place all go through
        // focusLocation()/focusPlace() (camera-only — see 0.3.2's own
        // "Camera Navigation Is Never Avatar Movement"), a collaborator
        // suggestion goes through focusCollaborator(), the SAME call
        // followCollaborator() above already makes. Never teleports the
        // avatar, never mutates the World.
        function exploreWelcomeSuggestion(suggestion) {
            const location = suggestion && suggestion.location;
            if (!location) {
                return;
            }
            if (suggestion.kind === 'collaborator' && location.collaborator && location.collaborator.deviceId) {
                session.focusCollaborator(location.collaborator.deviceId);
            } else if (suggestion.kind === 'landmark' && location.landmark) {
                session.focusLocation(location.landmark.id);
            } else if (suggestion.kind === 'structure' && location.structure) {
                session.focusLocation(location.structure.id);
            } else if (suggestion.kind === 'place' && location.place && location.place.landmark) {
                session.focusPlace(location.place.landmark.id);
            }
            refreshSpatialUI();
        }

        // 0.3.1 — Collaborative Spatial Awareness. The host view's own
        // handler for WorldCollaboratorIndicator's `follow` emit — see
        // that component's own header, "this component only ever emits
        // which primaryDeviceId was clicked." session.focusCollaborator()
        // is the ONE call that actually moves the camera; nothing here
        // sends anything to anyone.
        function followCollaborator(deviceId) {
            session.focusCollaborator(deviceId);
        }

        // Resolves a friendly label for a raw identityId — PRESENTATION
        // ONLY, exactly ui/views/ConversationsView.js's own
        // `alias || shortId(identityId)` degradation, reused rather than
        // reinvented: a known PeerRelationship's alias first, then the
        // fallback label the caller already has on hand (the World's own
        // `author` username for the owner row), then a short identityId,
        // never a thrown error or an empty string.
        function resolveIdentityDisplayName(identityId, fallbackLabel = null) {
            if (!identityId) {
                return fallbackLabel || 'Unknown';
            }
            const relationship = peerRelationshipUseCase && typeof peerRelationshipUseCase.getRelationship === 'function'
                ? peerRelationshipUseCase.getRelationship(identityId)
                : null;
            if (relationship && relationship.alias) {
                return relationship.alias;
            }
            if (fallbackLabel) {
                return fallbackLabel;
            }
            return identityId.length > 14 ? '…' + identityId.slice(-12) : identityId;
        }

        function openMembersPanel() {
            if (activeDocumentInfo.value) {
                refreshCollaborationRoster(activeDocumentInfo.value.documentId);
            }
            showMembersPanel.value = true;
        }

        function closeMembersPanel() {
            showMembersPanel.value = false;
        }

        // Grant/Revoke — see ui/components/WorldMembersPanel.js's own
        // header: this is the "UI affordance -> application
        // authorization -> signed membership operation -> gossip" chain
        // the design conversation asked to remain untouched. Feedback is
        // phased exactly as the design conversation specified: an
        // immediate "Granting…"/"Revoking…" (collaborationPendingIdentityId,
        // rendered inline by WorldMembersPanel), then either a success
        // message or the SAME error a denied mutation anywhere else in
        // this view already surfaces via feedback.show().
        function grantWorldMember(identityId) {
            const documentId = activeDocumentInfo.value ? activeDocumentInfo.value.documentId : null;
            if (!documentId || !identityId) {
                return;
            }
            collaborationPendingIdentityId.value = identityId;
            try {
                session.grantWorldEdit(documentId, identityId);
                feedback.show('Grant propagated — now an Editor');
            } catch (err) {
                feedback.show(err.message);
            } finally {
                collaborationPendingIdentityId.value = null;
                refreshCollaborationRoster(documentId);
            }
        }

        function revokeWorldMember(identityId) {
            const documentId = activeDocumentInfo.value ? activeDocumentInfo.value.documentId : null;
            if (!documentId || !identityId) {
                return;
            }
            collaborationPendingIdentityId.value = identityId;
            try {
                session.revokeWorldEdit(documentId, identityId);
                feedback.show('Revocation propagated — now Read only');
            } catch (err) {
                feedback.show(err.message);
            } finally {
                collaborationPendingIdentityId.value = null;
                refreshCollaborationRoster(documentId);
            }
        }

        // Best-effort title for a parentDocumentId shown in the
        // header's "Forked from" line — the parent is a real
        // Publication (fork provenance always points at one), so its
        // title is available from the same publications list the
        // hover/inspection panels already resolve titles from, even
        // though the parent itself is no longer loaded in this session.
        function parentTitle(parentDocumentId) {
            const pub = allPublications.value.find((p) => p.documentId === parentDocumentId);
            return pub ? (pub.title || 'Untitled') : null;
        }

        function refreshHoverUI() {
            const pubMap = new Map(allPublications.value.map((p) => [p.documentId, p]));
            const hover = session.getSpatialHover();
            if (hover && !hover.isEmpty) {
                const pub = pubMap.get(hover.documentId);
                spatialHover.value = {
                    type: hover.type,
                    documentId: hover.documentId,
                    buildingId: hover.buildingId,
                    brickId: hover.brickId,
                    position: hover.position,
                    worldTitle: pub?.title || 'Untitled',
                    worldAuthor: pub?.author || 'anonymous'
                };
            } else {
                spatialHover.value = null;
            }
        }

        function focusWorld(documentId) {
            session.focusDocument(documentId);
            router.replace({ path: `/world/${documentId}` });
            refreshSpatialUI();
        }

        function focusSelection() {
            session.focusSelection();
            refreshSpatialUI();
        }

        // -----------------------------------------------------------------
        // 0.2.94 — World View Location & Navigation
        // -----------------------------------------------------------------
        //
        // Deliberately separate from focusWorld() above: Home and
        // Locations never load a document, never touch the route, and
        // never change the active/editing document — see
        // WorldNavigationSession#focusLocation/goHome's own comments.
        // refreshSpatialUI() still runs after each so the coordinate
        // readout and compass reflect the destination immediately,
        // matching every other navigation action in this file, even
        // though the camera itself keeps gliding for a few more frames.
        function goHome() {
            session.goHome();
            refreshSpatialUI();
        }

        // 0.5.7 — Locations (World/Structures/Landmarks/Regions) lives
        // under Explore mode rather than its own always-visible
        // toolbar button — see setPrimaryMode()'s own header. Opening
        // it still goes through the same mutual-exclusion helper every
        // other primary surface uses, so it's never stacked on top of
        // the Map or Places directory.
        function openLocationsPanel() {
            worldViewNav.setPrimaryMode(WorldViewPrimaryMode.EXPLORE);
            primaryMode.value = worldViewNav.primaryMode;
            closePrimaryNavigationPanels();
            refreshLocationsPanel();
            showLocationsPanel.value = true;
        }

        // Locations lives under Explore (see openLocationsPanel()'s own
        // header) — since Explore is already worldViewNav's resting
        // default, closing it needs no mode reset of its own.
        function closeLocationsPanel() {
            showLocationsPanel.value = false;
        }

        function focusLocationFromPanel(locationId) {
            session.focusLocation(locationId);
            refreshSpatialUI();
        }

        // -----------------------------------------------------------------
        // 0.3.7 — World Landmarks & Personal Waypoints
        // -----------------------------------------------------------------
        //
        // All three funnel through guarded() exactly like every other
        // mutation in this file (movePlacement, onSaveMetadata, ...): a
        // denial (not authorized, no live avatar, fork-policy refusal)
        // becomes a feedback toast, never an uncaught exception. The
        // Locations panel's own list is re-read after each so a create/
        // edit/remove is reflected immediately without waiting for the
        // panel to be reopened — the same "list() is cheap, never cached"
        // posture WorldLocationDirectory already documents.
        function refreshLocationsPanel() {
            worldLocations.value = session.getWorldLocations().map((loc) => loc.toJSON());
        }

        function openAddLandmarkForm() {
            landmarkFormTarget.value = null;
            showLandmarkForm.value = true;
        }

        function openEditLandmarkForm(landmarkId) {
            const landmark = session.getLandmark(landmarkId);
            if (!landmark) {
                feedback.show('That landmark is no longer available');
                return;
            }
            landmarkFormTarget.value = landmark;
            showLandmarkForm.value = true;
        }

        function closeLandmarkForm() {
            showLandmarkForm.value = false;
            landmarkFormTarget.value = null;
        }

        function onSaveLandmarkForm({ title, description }) {
            const target = landmarkFormTarget.value;
            guarded(() => {
                if (target) {
                    session.updateLandmark(target.id, { title, description });
                    feedback.show(`Updated "${title}"`);
                } else {
                    session.createLandmarkHere(title, description);
                    feedback.show(`Added landmark "${title}"`);
                }
            });
            closeLandmarkForm();
            refreshLocationsPanel();
            refreshSpatialUI();
        }

        function removeLandmarkFromPanel(landmarkId) {
            guarded(() => {
                session.removeLandmark(landmarkId);
                feedback.show('Landmark removed');
            });
            refreshLocationsPanel();
            refreshSpatialUI();
        }

        // -----------------------------------------------------------------
        // 0.5.0 — World Regions & Decentralized Place Naming
        // -----------------------------------------------------------------
        //
        // Same guarded()/refresh shape as the landmark handlers above —
        // see that section's own header.
        function openAddRegionForm() {
            regionFormTarget.value = null;
            showRegionForm.value = true;
        }

        function openEditRegionForm(regionId) {
            const region = session.getRegion(regionId);
            if (!region) {
                feedback.show('That region is no longer available');
                return;
            }
            regionFormTarget.value = region;
            showRegionForm.value = true;
        }

        function closeRegionForm() {
            showRegionForm.value = false;
            regionFormTarget.value = null;
        }

        function onSaveRegionForm({ name, description, kind, radius }) {
            const target = regionFormTarget.value;
            guarded(() => {
                if (target) {
                    session.updateRegion(target.id, { name, description, kind, radius });
                    feedback.show(`Updated "${name}"`);
                } else {
                    session.createRegionHere(name, { description, kind, radius });
                    feedback.show(`Named "${name}"`);
                }
            });
            closeRegionForm();
            refreshLocationsPanel();
            refreshSpatialUI();
        }

        function removeRegionFromPanel(regionId) {
            guarded(() => {
                session.removeRegion(regionId);
                feedback.show('Region removed');
            });
            refreshLocationsPanel();
            refreshSpatialUI();
        }

        // -----------------------------------------------------------------
        // 0.5.2 — Place Naming & Naming Claims
        // -----------------------------------------------------------------
        //
        // Deliberately NOT gated by canEditActiveWorld anywhere below —
        // see core/PlaceNamingClaim.js's own header on why publishing or
        // retracting a naming claim needs no World edit authority at
        // all, unlike every landmark/region handler above.
        function refreshNamingPanel() {
            const regionId = namingPanelRegionId.value;
            if (!regionId) return;
            namingPanelClaims.value = session.getPlaceNamingClaims(regionId);
            namingPanelView.value = session.getPlaceNamingView(regionId);
            namingPanelPreferredName.value = session.getPreferredPlaceName(regionId);
            // 0.5.4 — see this function's own header on why this stays
            // a separate, additive read: it never changes what
            // namingPanelClaims/namingPanelView above already show for
            // THIS region alone.
            const geographic = session.getGeographicNamingView(regionId);
            namingPanelGeographicRegions.value = geographic.regions;
            namingPanelGeographicView.value = geographic.namingView;
        }

        function openNamingPanel(regionId) {
            namingPanelRegionId.value = regionId;
            refreshNamingPanel();
            resetNamingPanelPublishToNostr();
            showNamingPanel.value = true;
        }

        function closeNamingPanel() {
            showNamingPanel.value = false;
            namingPanelRegionId.value = null;
            resetNamingPanelPublishToNostr();
        }

        // 0.9.320 — Explicit Place Naming Publication Action. Clears
        // whatever the LAST "Publish to Nostr" click described and bumps
        // the request id so an already-in-flight call (from the panel that
        // was just closed, or the region that was just left) can never
        // write a stale result/error into the panel now open — the
        // identical staleness guard `distributeWorldEncounterSnapshot()`'s
        // own caller (`OwnPublicationPanel.js`) already holds for its
        // `publication`-change watcher, applied here at the two sites a
        // naming panel's own target region can change.
        function resetNamingPanelPublishToNostr() {
            namingPanelPublishToNostrRequestId.value += 1;
            namingPanelPublishToNostrClaimId.value = null;
            namingPanelPublishToNostrExecuting.value = false;
            namingPanelPublishToNostrError.value = null;
            namingPanelPublishToNostrResult.value = null;
        }

        function publishNamingClaim(name) {
            guarded(() => {
                session.publishPlaceNamingClaim(namingPanelRegionId.value, name);
                feedback.show(`Published "${name}"`);
            });
            refreshNamingPanel();
        }

        function retractNamingClaim(claimId) {
            guarded(() => {
                session.retractPlaceNamingClaim(namingPanelRegionId.value, claimId);
                feedback.show('Claim retracted');
            });
            refreshNamingPanel();
        }

        function setPreferredNamingName(name) {
            guarded(() => {
                session.setPreferredPlaceName(namingPanelRegionId.value, name);
            });
            refreshNamingPanel();
        }

        function clearPreferredNamingName() {
            guarded(() => {
                session.clearPreferredPlaceName(namingPanelRegionId.value);
            });
            refreshNamingPanel();
        }

        // 0.5.3 — Decentralized Place Name Exchange. Builds the portable
        // package via session.exportPlaceNamingClaim() (pure — see that
        // method's own header) and triggers an immediate browser
        // download, the exact same `data:application/json` + <a
        // download> shape exportPersonalStructure() (ui/views/
        // EditorView.js) already established for a Blueprint one domain
        // over — deliberately no intermediate modal here either.
        function exportNamingClaim(claimId) {
            const pkg = guarded(() => session.exportPlaceNamingClaim(namingPanelRegionId.value, claimId));
            if (!pkg) return;
            const json = JSON.stringify(pkg, null, 2);
            const slug = pkg.claim.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'place-name';
            const link = document.createElement('a');
            link.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(json);
            link.download = `forkbuild-place-naming-claim-${slug}.json`;
            link.click();
            feedback.show(`Exported "${pkg.claim.name}"`);
        }

        // `rawText` is whatever PlaceNamingPanel's own hidden file input
        // read off disk — untrusted input, so JSON.parse and
        // session.importPlaceNamingClaim() (which runs application/
        // PlaceNamingClaimPublicationValidator.js and signature
        // verification before anything is stored — see
        // application/PlaceNamingClaimExchange.js#importClaim()'s own
        // header) are each handled separately, mirroring
        // importBlueprint()'s own two-stage "is this even JSON" / "is
        // this a valid, verifiable package" error handling.
        //
        // A duplicate (a claim this replica already knew about) is NOT
        // an error — see importClaim()'s own header on why re-receiving
        // the same signed claim is an entirely ordinary outcome of
        // exchange — so it gets its own, non-alarming feedback message
        // rather than looking like a failure.
        function importNamingClaim(rawText) {
            let parsed;
            try {
                parsed = JSON.parse(rawText);
            } catch (e) {
                feedback.show('That is not valid JSON — choose a file exported with "Export Claim."');
                return;
            }
            const result = guarded(() => session.importPlaceNamingClaim(parsed));
            if (!result) return;
            const { claim, isNew } = result;
            if (!isNew) {
                feedback.show(`"${claim.name}" was already known — nothing changed`);
                return;
            }
            if (claim.regionId === namingPanelRegionId.value) {
                refreshNamingPanel();
                feedback.show(`Imported "${claim.name}"`);
            } else {
                feedback.show(`Imported "${claim.name}" for a different place — open its Names panel to see it`);
            }
        }

        // 0.9.320 — Explicit Place Naming Publication Action.
        //
        // "Create claim" (publishNamingClaim(), above — session.publishPlaceNamingClaim(),
        // local and synchronous) and "announce claim" (THIS function) stay
        // two separate, explicit steps — see docs/Roadmap.md's own 0.9.320
        // entry. This function does neither: it identifies an EXISTING,
        // already-signed claim already on file for the open panel's own
        // region, and hands it to the injected
        // publishPlaceNamingClaimToNostrCommand — never a second claim
        // construction, never a mutation of the one handed over.
        //
        // READS THE CLAIM BACK THROUGH session.getPlaceNamingClaims() —
        // NEVER `namingPanelClaims.value` DIRECTLY. Both are the same
        // underlying data, but `namingPanelClaims` is this view's own
        // cached copy, refreshed only by refreshNamingPanel(); reading
        // through the session instead is the identical restraint
        // `exportNamingClaim()`/`retractNamingClaim()`, immediately above,
        // already hold for their own claimId-addressed actions — a fresh
        // read, never a possibly-stale one.
        //
        // A DECLINED/FAILED PUBLICATION NEVER RETRACTS, RE-SAVES, OR
        // OTHERWISE MUTATES THE LOCAL CLAIM. Only `namingPanelPublishToNostrError`/
        // `namingPanelPublishToNostrResult` change — refreshNamingPanel() is
        // never called here, because nothing this function does ever
        // changes what session.getPlaceNamingClaims()/getPlaceNamingView()
        // would return.
        function publishNamingClaimToNostr(claimId) {
            if (!publishPlaceNamingClaimToNostrCommand) return;
            const regionId = namingPanelRegionId.value;
            if (!regionId) return;
            const claim = session.getPlaceNamingClaims(regionId).find((c) => c.id === claimId);
            if (!claim) return;

            namingPanelPublishToNostrRequestId.value += 1;
            const requestId = namingPanelPublishToNostrRequestId.value;
            namingPanelPublishToNostrClaimId.value = claimId;
            namingPanelPublishToNostrExecuting.value = true;
            namingPanelPublishToNostrError.value = null;
            namingPanelPublishToNostrResult.value = null;

            Promise.resolve()
                .then(() => publishPlaceNamingClaimToNostrCommand(claim))
                .then((result) => {
                    if (namingPanelPublishToNostrRequestId.value !== requestId) return;
                    namingPanelPublishToNostrExecuting.value = false;
                    namingPanelPublishToNostrResult.value = result;
                })
                .catch((error) => {
                    if (namingPanelPublishToNostrRequestId.value !== requestId) return;
                    namingPanelPublishToNostrExecuting.value = false;
                    namingPanelPublishToNostrError.value = (error && error.message) ? error.message : 'Publish to Nostr failed.';
                });
        }

        // -----------------------------------------------------------------
        // 0.5.1 — World Maps & Geographic Navigation
        // -----------------------------------------------------------------
        //
        // openMapPanel() re-reads mapContent immediately (never waits for
        // the next 3-second refreshSpatialUI() tick) so the map's first
        // paint is never stale. Once open, refreshSpatialUI() itself keeps
        // mapContent current — see that ref's own comment. Clicking a
        // marker on the map routes through the exact SAME
        // focusLocation()/focusCollaborator() every other navigation
        // entry point in this file already uses (goHome,
        // focusLocationFromPanel, the Explore panel's suggestions) —
        // WorldMapPanel itself never touches the camera or the session
        // directly.
        function openMapPanel() {
            mapContent.value = session.getMapContent((identityId) => resolveIdentityDisplayName(identityId));
            showMapPanel.value = true;
        }

        function closeMapPanel() {
            showMapPanel.value = false;
            // 0.5.5 — a highlight set by showGeographicPlaceOnMap() above
            // is a one-shot "look here" for that one visit; closing the
            // map clears it so the NEXT open (from the plain "Map"
            // toolbar button, or a different place) never shows a stale
            // highlight left over from an unrelated place.
            mapHighlightRegionKeys.value = [];
            // 0.5.7 — dismissing Map with nothing to replace it returns
            // primaryMode to Explore, its resting default, rather than
            // leaving the Map tab shown "active" over an empty panel.
            worldViewNav.setPrimaryMode(WorldViewPrimaryMode.EXPLORE);
            primaryMode.value = worldViewNav.primaryMode;
        }

        // -----------------------------------------------------------------
        // 0.5.7 — World View UX & Progressive Exploration
        // -----------------------------------------------------------------
        //
        // Explore / Map / Places are now the three PRIMARY navigation
        // surfaces (see application/WorldViewNavigationState.js's own
        // header) — mutually exclusive, replacing the four separate
        // always-visible buttons (Locations, Map, Geographic Places,
        // Explore) 0.2.94-0.5.6 accumulated. "Locations" (World/
        // Structures/Landmarks/Regions) stays reachable from Explore
        // mode rather than disappearing — see openLocationsPanel()
        // below, now routed through the same mutual-exclusion helper.
        //
        // closePrimaryNavigationPanels() deliberately never touches the
        // landmark/region CREATE forms, Save/Publish/Edit Metadata, or
        // Members — those are editing/collaboration surfaces, a
        // genuinely different concern from BROWSING the World (see
        // docs/Principles.md's own recurring "Navigate ≠ Modify"), and
        // the design conversation's own point 4: exploration and
        // editing should never compete for the same UI space.
        function closePrimaryNavigationPanels() {
            showWelcomePanel.value = false;
            showLocationsPanel.value = false;
            showMapPanel.value = false;
            showGeographicPlaceDirectory.value = false;
            showGeographicPlacePanel.value = false;
            // 0.5.8 — WorldFocusPanel is its own overlay, but a primary-
            // mode switch is still "leaving whatever you were looking
            // at" — the same reasoning that already closes every other
            // panel in this list.
            showFocusPanel.value = false;
            focusContext.value = null;
        }

        function setPrimaryMode(mode) {
            if (!worldViewNav.setPrimaryMode(mode)) {
                return;
            }
            primaryMode.value = worldViewNav.primaryMode;
            closePrimaryNavigationPanels();
            if (mode === WorldViewPrimaryMode.EXPLORE) {
                openWelcomePanel(false);
            } else if (mode === WorldViewPrimaryMode.MAP) {
                mapContent.value = session.getMapContent((identityId) => resolveIdentityDisplayName(identityId));
                showMapPanel.value = true;
            } else if (mode === WorldViewPrimaryMode.PLACES) {
                // Restores whichever screen (directory or one place's
                // detail) the viewer left Places on — see
                // application/WorldViewNavigationState.js's own
                // "mode switching preserves appropriate state."
                const view = worldViewNav.currentPlacesView;
                if (view.screen === 'detail' && view.fingerprintKey) {
                    restoreGeographicPlaceDetail(view.fingerprintKey);
                    placesView.value = worldViewNav.currentPlacesView;
                } else {
                    openGeographicPlaceDirectory();
                }
            }
        }

        // -----------------------------------------------------------------
        // 0.5.7 — Explore mode: collapsible "Nearby ___" groups
        // -----------------------------------------------------------------
        //
        // Point 3 of the design conversation: "the user sees the
        // CATEGORY, not 20 controls." Each group reuses data this view
        // already computes on every refreshSpatialUI() tick
        // (nearbyGeographicPlaces / spatialContext.nearbyLandmarks /
        // spatialCollaboratorRows) — nothing here queries the session a
        // second time. Collapsed state is mirrored from worldViewNav
        // into this one plain ref, the same "pure module, mirrored into
        // a ref" pattern primaryMode/placesView above already use.
        const NEARBY_PLACES_SECTION = 'explore:nearby-places';
        const NEARBY_LANDMARKS_SECTION = 'explore:nearby-landmarks';
        const NEARBY_PEOPLE_SECTION = 'explore:nearby-people';
        // 0.9.17 — a fourth Explore-mode CollapsibleSection, the SAME
        // "pure module, mirrored into a ref" pattern the three Nearby
        // sections above already use. Defaults expanded (false), the
        // same default "Nearby Places" already gets, since surfacing
        // World Encounters inside `/world` — rather than requiring a
        // separate `/live-world` destination — is this milestone's own
        // point.
        const WORLD_ENCOUNTERS_SECTION = 'explore:world-encounters';
        // 0.9.257 — a fifth Explore-mode CollapsibleSection, the SAME
        // "pure module, mirrored into a ref" pattern every Nearby section
        // above already uses. Defaults collapsed (true), the same default
        // "Nearby Landmarks"/"Nearby People" already get: a discovered,
        // unverified claim is exactly the kind of new, unfamiliar surface
        // that shouldn't demand attention by default.
        const NEARBY_PLACE_NAMING_SECTION = 'explore:nearby-place-naming';
        const nearbySectionsCollapsed = ref({
            places: worldViewNav.isSectionCollapsed(NEARBY_PLACES_SECTION, false),
            landmarks: worldViewNav.isSectionCollapsed(NEARBY_LANDMARKS_SECTION, true),
            people: worldViewNav.isSectionCollapsed(NEARBY_PEOPLE_SECTION, true),
            worldEncounters: worldViewNav.isSectionCollapsed(WORLD_ENCOUNTERS_SECTION, false),
            placeNaming: worldViewNav.isSectionCollapsed(NEARBY_PLACE_NAMING_SECTION, true)
        });

        // CollapsibleSection already computes the intended NEXT
        // collapsed value and emits it (see that component's own
        // onToggleClick) — this just records it, both in the pure
        // module (so it survives a primary-mode switch) and in the ref
        // the template actually reads.
        function setNearbySectionCollapsed(key, sectionId, collapsed) {
            worldViewNav.setSectionCollapsed(sectionId, collapsed);
            nearbySectionsCollapsed.value = { ...nearbySectionsCollapsed.value, [key]: collapsed };
        }

        const nearbyLandmarkRows = computed(() => (
            (spatialContext.value && spatialContext.value.nearbyLandmarks) || []
        ));

        // Joins spatialContext's own nearbyCollaborators (distance/
        // direction, but only identityId) against
        // spatialCollaboratorRows' own primaryDeviceId — the same
        // deviceId WorldCollaboratorIndicator's "Follow" button already
        // uses — so a "Go" action here can call the EXACT SAME
        // followCollaborator() every other collaborator-focus entry
        // point in this file already uses, without a new session query.
        const nearbyPeopleRows = computed(() => {
            const contextCollaborators = (spatialContext.value && spatialContext.value.nearbyCollaborators) || [];
            const deviceByIdentity = new Map(spatialCollaboratorRows.value.map((row) => [row.identityId, row.primaryDeviceId]));
            return contextCollaborators.map((c) => ({
                identityId: c.identityId,
                displayName: c.displayName,
                distance: c.distance,
                direction: c.direction,
                deviceId: deviceByIdentity.get(c.identityId) || null
            }));
        });

        // 0.9.257 — World View Place Naming Presentation. A pure
        // presentation mapping over `nearbyPlaceNamingClaims` — NOT a second
        // selection/ranking pass: every entry `placeNamingDiscoveryMonitor.lastResult`
        // holds is represented here exactly once, in the SAME order, whether
        // or not two entries happen to name the same place (see this
        // milestone's own brief, "if two different claims name essentially
        // the same location, both remain visible"). `authorDisplayName`
        // reuses the SAME `resolveIdentityDisplayName()` every other
        // identity-bearing row in this file already calls — never a second,
        // bespoke truncation. `position` is read straight off the entry the
        // monitor itself already attached (see that file's own
        // `_attachPositions()`) — no distance/direction is computed here,
        // deliberately: this view has no established authority for "how far
        // is a Place Naming claim," unlike `nearbyGeographicPlaces`'s own
        // already-established `session.getNearbyGeographicPlaces()` read.
        // 0.9.260 — Nearby Place Naming Claim Interaction. `regionId`/
        // `worldId` are added here — both already carried on
        // `entry.claim` (core/PlaceNamingDiscoveryEnvelope.js's own
        // required claim fields) but previously dropped by this mapping
        // — so navigateToNearbyPlaceNamingClaim() below can target the
        // claim's own region without reconstructing it from `position`.
        //
        // 0.9.263 — Nearby Place Naming Claim Adoption UI. The post-
        // navigation reassessment (0.9.262, Section D4) found this exact
        // row shape already dropped `authorIdentityId`/`createdAt`/
        // `signature` — the three fields application/
        // PlaceNamingClaimPublicationValidator.js requires alongside
        // `id`/`worldId`/`regionId`/`name` before a publication package
        // can even be well-formed. All three already exist, untouched,
        // on `entry.claim` (the discovered envelope's own claim — see
        // core/PlaceNamingDiscoveryEnvelope.js#describeClaim()); restoring
        // them here is the ONLY change this mapping needed for
        // adoptNearbyPlaceNamingClaim() below to build a complete,
        // valid package straight from a row, exactly as 0.9.260 already
        // did for regionId/worldId. Still never a second, adoption-shaped
        // representation of a claim — the row simply stops discarding
        // fields the claim already carries.
        // 0.9.266 — Nearby Place Naming Claim Metadata Presentation. Pure
        // display formatting only, mirroring ui/components/PlaceNamingPanel.js's
        // own formatWhen() exactly: an unparseable/missing `createdAt`
        // degrades to '' rather than throwing or rendering "Invalid Date" —
        // the same graceful-degradation discipline this file already holds
        // everywhere else a discovered, self-declared value reaches the
        // UI (see e.g. core/PlaceNamingDiscoveryEnvelope.js's own "degrades
        // to null, never throws"). Never touches `createdAt` itself, which
        // the row below still carries raw and unmodified — the exact value
        // adoptNearbyPlaceNamingClaim() rehydrates into a PlaceNamingClaim.
        function formatNearbyPlaceNamingCreatedAt(createdAt) {
            const date = createdAt instanceof Date ? createdAt : new Date(createdAt);
            return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString();
        }

        // 0.9.263 — Nearby Place Naming Claim Adoption UI restored
        // authorIdentityId/createdAt/signature onto this row so adoption
        // could build a complete package (see this block's own 0.9.263
        // comment above). The 0.9.265 reassessment (Section D) found the
        // one remaining gap in this same row: createdAt and signature
        // both reach it but neither is ever RENDERED.
        //
        // 0.9.266 — Nearby Place Naming Claim Metadata Presentation closes
        // half of that gap: `createdAtLabel` is a pure presentation field,
        // added alongside — never in place of — the raw `createdAt` the
        // row already carried, so adoption keeps reading the exact same
        // unformatted value it always has. `signature` deliberately gets
        // NO display counterpart here. The 0.9.265 reassessment (Section
        // C5) was explicit that a signature reaching a row is not, by
        // itself, a reason to invent a new "Verified"/"Unverified" UI
        // state: this codebase's only real verification — identity/
        // LocalAuthorizationVerifier.js's own place-naming-claim verifier
        // — runs strictly inside a MUTATING boundary
        // (PlaceNamingClaimExchange#importClaim(), PlaceNamingClaimUseCase#
        // publish(), PlaceNamingClaimPublicationKind's own verify) and
        // exposes no semantic, non-mutating result a NOT-YET-adopted
        // Nearby row could read and display truthfully. Rendering the raw
        // signature bytes would only manufacture a false sense of
        // cryptographic assurance no existing machinery actually backs at
        // this boundary — so this milestone renders createdAt and leaves
        // signature/verification exactly as unrendered as 0.9.265 found it.
        // 0.9.269 — Nearby Place Naming Claim Adoption Status Indicator.
        // `alreadySaved` is read straight off the existing
        // session.hasPlaceNamingClaim(worldId, claimId) — see that
        // method's own header — never a second, UI-maintained
        // "adoptedClaimIds" list. Deliberately keyed by the claim's own
        // id alone, exactly like LocalPlaceNamingClaimStore#has()
        // itself: two claims naming the same place ("Riverside" by
        // Alice, "Riverside" by Bob) carry distinct ids and are
        // therefore classified completely independently, and the same
        // id under two different worldIds (a stale claim from a World
        // that reused another World's regionId) is likewise never
        // conflated — has()'s own storage key is already scoped per
        // worldId. Recomputed as one atomic pass over the whole list
        // every time this computed re-runs — never an incremental patch
        // of one row's own flag — see adoptNearbyPlaceNamingClaim()'s own
        // comment below on what actually triggers that re-run after a
        // successful adoption.
        const nearbyPlaceNamingClaimRows = computed(() => (
            nearbyPlaceNamingClaims.value.map((entry) => ({
                claimId: entry.claim.id,
                name: entry.claim.name,
                authorDisplayName: resolveIdentityDisplayName(entry.claim.authorIdentityId),
                createdAtLabel: formatNearbyPlaceNamingCreatedAt(entry.claim.createdAt),
                position: entry.position,
                regionId: entry.claim.regionId,
                worldId: entry.claim.worldId,
                authorIdentityId: entry.claim.authorIdentityId,
                createdAt: entry.claim.createdAt,
                signature: entry.claim.signature,
                alreadySaved: session.hasPlaceNamingClaim(entry.claim.worldId, entry.claim.id)
            }))
        ));

        function goToNearbyCollaborator(deviceId) {
            if (deviceId) {
                followCollaborator(deviceId);
            }
        }

        function focusLocationFromMap(locationId) {
            session.focusLocation(locationId);
            refreshSpatialUI();
        }

        function focusCollaboratorFromMap(deviceId) {
            session.focusCollaborator(deviceId);
            refreshSpatialUI();
        }

        // 0.9.260 — Nearby Place Naming Claim Interaction. Navigates the
        // camera to the EXACT region a nearby claim names, reusing
        // focusLocation() — the SAME navigation machinery
        // focusLocationFromMap()/focusCollaboratorFromMap() above already
        // call — rather than inventing a Place Naming-specific navigation
        // system. Navigate is deliberately NOT adopt, verify, trust, or a
        // preference: this function never touches WorldRegion naming,
        // LocalPlaceNamingClaimStore, LocalNamePreferenceStore, or
        // PlaceNamingClaimExchange — see this milestone's own
        // docs/Roadmap.md entry.
        //
        // Cross-checks the claim's own worldId against session.getRegions()
        // (each entry already carries both `id` and `worldId`) before
        // navigating, so a stale claim can never be misdirected onto a
        // different World's region that happens to reuse the same
        // regionId. Fails gracefully with a feedback message — never a
        // fallback to another region — when the claimed region no longer
        // exists in a currently loaded World.
        function navigateToNearbyPlaceNamingClaim(row) {
            const regionStillExists = session.getRegions()
                .some((region) => region.id === row.regionId && region.worldId === row.worldId);
            if (!regionStillExists) {
                feedback.show('That place no longer exists in this World');
                return false;
            }
            session.focusLocation(row.regionId);
            refreshSpatialUI();
            return true;
        }

        // 0.9.263 — Nearby Place Naming Claim Adoption UI. Adopt is the
        // explicit action the 0.9.262 reassessment recommended going
        // straight to: not a new adoption use case, just the missing
        // seam between a nearby, DISCOVERED claim and the existing,
        // unmodified session.importPlaceNamingClaim() — the exact same
        // validate/construct/verify/persist boundary
        // application/PlaceNamingClaimExchange.js#importClaim() already
        // runs for the manual PlaceNamingPanel import path (see
        // importNamingClaim() above). The row already carries every
        // field application/PlaceNamingClaimPublicationValidator.js
        // requires (see nearbyPlaceNamingClaimRows's own comment) — this
        // function's only job is to rehydrate those fields into a
        // PlaceNamingClaim and hand it to the SAME
        // buildPlaceNamingClaimPublication() session.exportPlaceNamingClaim()
        // already calls for the manual export path, so importClaim() sees
        // a package indistinguishable from one that actually crossed a
        // file boundary.
        //
        // Deliberately builds `claim` from the row's OWN fields, never
        // from a freshly-resolved "current identity" — the claim's own
        // authorIdentityId/createdAt/signature travel unchanged, exactly
        // like this file already refuses to manufacture authorship
        // anywhere else (see e.g. publishNamingClaim() below, which
        // never accepts an authorIdentityId argument either). Adoption
        // performs no verification of its own here — that stays
        // entirely inside the existing importClaim() boundary this
        // function calls into, unmodified.
        //
        // Never invoked by discovery, proximity selection, navigation, or
        // rendering — only ever by this exact user click, mirroring
        // navigateToNearbyPlaceNamingClaim()'s own "Navigate is
        // deliberately NOT adopt" restraint in the other direction: this
        // is adopt, and it is deliberately NOT automatic. A duplicate
        // (a claim this replica already has) is not an error — see
        // importNamingClaim()'s own comment on why re-adopting the same
        // signed claim is an entirely ordinary, non-alarming outcome.
        function adoptNearbyPlaceNamingClaim(row) {
            const rowClaim = PlaceNamingClaim.fromJSON({
                id: row.claimId,
                worldId: row.worldId,
                regionId: row.regionId,
                name: row.name,
                authorIdentityId: row.authorIdentityId,
                createdAt: row.createdAt,
                signature: row.signature
            });
            const pkg = buildPlaceNamingClaimPublication(rowClaim);
            const result = guarded(() => session.importPlaceNamingClaim(pkg));
            if (!result) return;
            const { claim, isNew } = result;
            // 0.9.269 — Nearby Place Naming Claim Adoption Status
            // Indicator. Only ever reached once session.importPlaceNamingClaim()
            // has actually returned — a thrown/refused import (a tampered
            // or unverifiable package) already short-circuited above via
            // `if (!result) return;`, so a failed attempt reaches neither
            // this line nor "Already saved," exactly per this milestone's
            // own brief ("persistence fails -> still [Adopt]"). Reassigning
            // `nearbyPlaceNamingClaims.value` to a NEW array (never mutating
            // the existing one in place) is what actually makes
            // nearbyPlaceNamingClaimRows above recompute `alreadySaved` for
            // every row — the same atomic-refresh discipline a genuine
            // discovery tick already applies, deliberately never an
            // incremental flip of this one row's own flag. Reached on
            // BOTH branches below (a brand new adoption and a re-adoption
            // of something already known) since either way the store now
            // genuinely holds the claim.
            nearbyPlaceNamingClaims.value = [...nearbyPlaceNamingClaims.value];
            if (!isNew) {
                feedback.show(`"${claim.name}" was already known — nothing changed`);
                return;
            }
            feedback.show(`Adopted "${claim.name}"`);
        }

        // -----------------------------------------------------------------
        // 0.5.8 — World View Contextual Focus & Information Hierarchy
        // -----------------------------------------------------------------
        //
        // openFocusForLocation()/openFocusForCollaborator() are the two
        // entry points every "Info" button in this file (Explore's own
        // nearby rows, LocationsPanel's own rows) calls — both simply
        // read session.getFocusContext*()  and show WorldFocusPanel;
        // neither ever moves the camera or the map. goFromFocusPanel()/
        // showFocusOnMap()/openNamesFromFocusPanel() are the panel's own
        // three possible actions, each reusing the EXACT SAME session
        // call every other navigation entry point in this file already
        // uses for that verb — see core/WorldFocusContext.js's own
        // header on why none of them is a new navigation mechanism.
        function openFocusForLocation(locationId) {
            const context = session.getFocusContextForLocation(locationId);
            if (!context) {
                feedback.show('That is no longer available');
                return;
            }
            focusContext.value = context.toJSON();
            showFocusPanel.value = true;
        }

        // Explore's own "Nearby Places" row only has a fingerprintKey on
        // hand, not the full `place:<fingerprintKey>` locationId
        // openFocusForLocation() expects — this thin wrapper is purely
        // so the template doesn't need geographicPlaceLocationId()
        // exposed as its own top-level binding.
        function openFocusForGeographicPlace(fingerprintKey) {
            openFocusForLocation(geographicPlaceLocationId(fingerprintKey));
        }

        function openFocusForCollaborator(deviceId) {
            const context = session.getFocusContextForCollaborator(deviceId, (identityId) => resolveIdentityDisplayName(identityId));
            if (!context) {
                feedback.show('That person is no longer nearby');
                return;
            }
            focusContext.value = context.toJSON();
            showFocusPanel.value = true;
        }

        function closeFocusPanel() {
            showFocusPanel.value = false;
            focusContext.value = null;
        }

        // "Go" — moves the camera to whatever is currently focused,
        // addressed through the exact same session call every other
        // destination kind in this file already uses: focusLocation()
        // for a region/landmark/structure/geographic place (by its own
        // derived `place:<fingerprintKey>` id), focusCollaborator() for
        // a person. See core/WorldFocusContext.js#WorldFocusContext's
        // own `source` field, the only place this reads the underlying
        // id from.
        function goFromFocusPanel() {
            const context = focusContext.value;
            if (!context || !context.source) {
                return;
            }
            const { kind, id } = context.source;
            const moved = kind === WorldFocusKind.COLLABORATOR
                ? session.focusCollaborator(id)
                : session.focusLocation(kind === WorldFocusKind.GEOGRAPHIC_PLACE ? geographicPlaceLocationId(id) : id);
            if (!moved) {
                feedback.show('That is no longer available');
                closeFocusPanel();
                return;
            }
            refreshSpatialUI();
            closeFocusPanel();
        }

        // "Show on Map" — switches World View to its Map primary mode,
        // after first moving the camera the exact same way "Go" above
        // does, so the map's own initial viewport (which centers on
        // wherever the viewer currently is — see WorldMapPanel's own
        // header) opens already looking at what was focused. Only
        // offered for kinds whose context.availableActions includes
        // 'map' (region/geographic place — see
        // core/WorldFocusContext.js#deriveWorldFocusContext()'s own
        // per-kind action table); WorldFocusPanel itself hides the
        // button otherwise.
        function showFocusOnMap() {
            const context = focusContext.value;
            if (!context || !context.source) {
                return;
            }
            const { kind, id } = context.source;
            session.focusLocation(kind === WorldFocusKind.GEOGRAPHIC_PLACE ? geographicPlaceLocationId(id) : id);
            refreshSpatialUI();
            closeFocusPanel();
            setPrimaryMode(WorldViewPrimaryMode.MAP);
        }

        // "Names" — only ever offered for a REGION (see
        // core/WorldFocusContext.js's own per-kind action table; a
        // GEOGRAPHIC_PLACE's own community names live one level up, in
        // ui/components/GeographicPlacePanel.js instead — this button is
        // never shown there). Opens the EXACT SAME PlaceNamingPanel every
        // other "Names" entry point in this file already opens, never a
        // second naming surface.
        function openNamesFromFocusPanel() {
            const context = focusContext.value;
            if (!context || !context.source || context.source.kind !== WorldFocusKind.REGION) {
                return;
            }
            const regionId = context.source.id;
            closeFocusPanel();
            refreshLocationsPanel();
            openNamingPanel(regionId);
        }

        // 0.6.1 — World ↔ Editor Continuity & Return Navigation. Which
        // World the Editor's own "← Back to World" button should
        // return to, and what to label it — the FOCUSED (camera)
        // document, exactly the value `focusedDocumentTitle` below
        // already tracks (session.getFocusedDocumentId(), per
        // docs/Principles.md "Camera Focus, Active Document, and
        // Selection Are Three Different Things"), falling back to
        // whatever World route this WorldView instance is currently on.
        // Deliberately NOT `context.source.documentId`: for a STRUCTURE
        // that's the placed structure's own content document (the fork
        // TARGET), never the World the viewer was standing in — see
        // core/EditorEntryContext.js's own constructor header on why
        // `returnWorldId` is its own field. For REGION/LANDMARK the two
        // already coincide, so reading it here uniformly, regardless of
        // kind, is always correct, never merely "correct for two out of
        // three kinds."
        function currentReturnWorld() {
            const id = (typeof session.getFocusedDocumentId === 'function' && session.getFocusedDocumentId())
                || route.params.documentId
                || null;
            return { id, title: (id && focusedDocumentTitle.value) || title.value || '' };
        }

        // "Edit a Copy" (0.5.9) — World View never edits Document
        // content itself (see docs/Principles.md, "World View Observes
        // and Navigates; Editor Mutates and Builds"); this is the one
        // deliberate door out of that boundary. Only ever offered for a
        // REGION/LANDMARK/STRUCTURE (see core/WorldFocusContext.js's own
        // per-kind action table) — each already carries the id of the
        // Document that actually CONTAINS it (`source.documentId`; for a
        // STRUCTURE that's the placed structure's own content document,
        // never the World merely positioning it). Reuses the EXACT SAME
        // `/editor?fork=` navigation ui/components/PublicationCatalog.js#
        // forkPublication() already uses — never a second fork mechanism,
        // never a fork performed here in World View itself.
        //
        // 0.6.0 — Context-Preserving Fork-to-Edit. `context.editCopyContext`
        // (core/WorldFocusContext.js's own derived getter) rides along
        // as extra query params — never a second navigation mechanism,
        // just more of the SAME `/editor?fork=` hop already carrying
        // `publication`. EditorView's fork handler decodes it back via
        // core/EditorEntryContext.js#editorEntryContextFromQuery() and
        // hands it to EditorSession#openDocument(), the one place it's
        // ever consumed.
        //
        // 0.6.1 — `withReturnWorld()` attaches the return address
        // `editCopyContext` itself has no way to know (see
        // currentReturnWorld()'s own header just above) before the
        // SAME encode step 0.6.0 already established.
        function editFocusedCopyFromFocusPanel() {
            const context = focusContext.value;
            if (!context || !context.source || !context.source.documentId) {
                return;
            }
            const documentId = context.source.documentId;
            const publication = session.getPublicationIdForDocument(documentId);
            const returnWorld = currentReturnWorld();
            const entryContext = withReturnWorld(context.editCopyContext, { returnWorldId: returnWorld.id, returnWorldTitle: returnWorld.title });
            const entryQuery = editorEntryContextToQuery(entryContext);
            closeFocusPanel();
            router.push({
                path: '/editor',
                query: { fork: documentId, ...(publication ? { publication } : {}), ...entryQuery }
            });
        }

        // -----------------------------------------------------------------
        // 0.5.5 — Geographic Place Directory & Identity UX
        // -----------------------------------------------------------------
        //
        // Read-only, exactly like the Locations panel's own Focus button:
        // nothing below ever calls a mutating session method, publishes
        // or retracts a claim, or touches a WorldRegion. openNamesFromPlace()
        // is the one bridge back into EXISTING 0.5.2 machinery — it opens
        // ui/components/PlaceNamingPanel.js for one region rather than
        // rebuilding publish/retract here a second time.
        // 0.5.7 — a fresh directory open always resets Places back to
        // its list screen (see WorldViewNavigationState#
        // openPlacesDirectory's own header on the distinction from
        // merely switching primary mode BACK to Places, which
        // preserves whatever detail screen was open).
        function openGeographicPlaceDirectory() {
            worldViewNav.openPlacesDirectory();
            placesView.value = worldViewNav.currentPlacesView;
            geographicPlaces.value = session.getGeographicPlaceDirectory().map((place) => place.toJSON());
            showGeographicPlaceDirectory.value = true;
        }

        // -----------------------------------------------------------------
        // 0.5.6 — Geographic Place Navigation & Arrival
        // -----------------------------------------------------------------
        //
        // The ONE new navigation entry point this milestone adds, reused
        // from every surface a geographic place can be reached from
        // (the directory's own "Nearby Places" section, a place panel's
        // "Go to Place" button, the compass's contextual markers via the
        // Places directory, and WorldWelcomePanel's own "Nearby Places"
        // section) — never a `focusGeographicPlace()`, just
        // session.focusLocation() addressed by this place's own derived
        // `place:<fingerprintKey>` id (core/GeographicPlaceNavigation.js),
        // the exact same call/return-value contract every other
        // destination in this file already uses. `false` (an unknown or
        // no-longer-resolvable place) surfaces the same feedback message
        // openGeographicPlace() already shows for a stale directory row.
        function goToGeographicPlace(fingerprintKey) {
            const moved = session.focusLocation(geographicPlaceLocationId(fingerprintKey));
            if (!moved) {
                feedback.show('That geographic place is no longer available');
                return;
            }
            refreshSpatialUI();
            showGeographicPlaceDirectory.value = false;
            showGeographicPlacePanel.value = false;
            geographicPlace.value = null;
            if (showWelcomePanel.value) {
                closeWelcomePanel();
            }
            // 0.5.7 — arriving somewhere is naturally followed by
            // looking around, not by leaving Places on whatever detail
            // screen sent you there — reset back to Explore, the same
            // destination every other "you have arrived" path in this
            // file already lands on.
            worldViewNav.openPlacesDirectory();
            placesView.value = worldViewNav.currentPlacesView;
            worldViewNav.setPrimaryMode(WorldViewPrimaryMode.EXPLORE);
            primaryMode.value = worldViewNav.primaryMode;
        }

        // 0.5.7 — mirrors closeMapPanel()'s own header: dismissing the
        // directory with nothing to replace it returns primaryMode to
        // Explore rather than leaving the Places tab "active" over an
        // empty panel. Deliberately does NOT reset the Places back-
        // stack (openGeographicPlaceDirectory()/openPlacesDirectory()
        // own job) — closing here is not the same as asking for a
        // fresh list.
        function closeGeographicPlaceDirectory() {
            showGeographicPlaceDirectory.value = false;
            worldViewNav.setPrimaryMode(WorldViewPrimaryMode.EXPLORE);
            primaryMode.value = worldViewNav.primaryMode;
        }

        // 0.5.7 — reached only from the directory's own row click (see
        // GeographicPlacePanel.js's own header), so entering detail
        // always pushes onto the SAME back-stack goBackInPlaces() below
        // unwinds.
        function openGeographicPlace(fingerprintKey) {
            const place = session.getGeographicPlace(fingerprintKey);
            if (!place) {
                feedback.show('That geographic place is no longer available');
                return;
            }
            geographicPlace.value = place.toJSON();
            worldViewNav.openPlaceDetail(fingerprintKey);
            placesView.value = worldViewNav.currentPlacesView;
            showGeographicPlaceDirectory.value = false;
            showGeographicPlacePanel.value = true;
        }

        // Re-enters an already-open detail screen — used ONLY to
        // restore Places to where the viewer left it after switching
        // primary mode away and back (see setPrimaryMode() above), never
        // to navigate to a NEW place (that's openGeographicPlace()'s
        // job, which also records the back-stack entry). A place that's
        // become unresolvable since (the World it lived in unloaded)
        // falls back to the directory rather than showing a broken
        // panel.
        function restoreGeographicPlaceDetail(fingerprintKey) {
            const place = session.getGeographicPlace(fingerprintKey);
            if (!place) {
                worldViewNav.openPlacesDirectory();
                geographicPlaces.value = session.getGeographicPlaceDirectory().map((p) => p.toJSON());
                showGeographicPlaceDirectory.value = true;
                return;
            }
            geographicPlace.value = place.toJSON();
            showGeographicPlacePanel.value = true;
        }

        function closeGeographicPlacePanel() {
            showGeographicPlacePanel.value = false;
            geographicPlace.value = null;
        }

        // GeographicPlacePanel's own "← Back" / Escape / backdrop-click
        // — always returns to the directory it was opened from, never
        // closes Places entirely (there is nowhere else for it to go —
        // see this class's own header on why the back-stack is exactly
        // two screens deep).
        function goBackInPlaces() {
            worldViewNav.goBackInPlaces();
            placesView.value = worldViewNav.currentPlacesView;
            showGeographicPlacePanel.value = false;
            geographicPlace.value = null;
            geographicPlaces.value = session.getGeographicPlaceDirectory().map((place) => place.toJSON());
            showGeographicPlaceDirectory.value = true;
        }

        function focusRegionFromPlace(regionId) {
            session.focusLocation(regionId);
            refreshSpatialUI();
        }

        function openNamesFromPlace(regionId) {
            closeGeographicPlacePanel();
            // PlaceNamingPanel's own `region-name` prop is read off
            // `worldLocations` (see the template below) — refreshed here
            // in case this replica reached the Names panel without ever
            // opening the Locations panel first, the only other entry
            // point that already keeps `worldLocations` current.
            refreshLocationsPanel();
            openNamingPanel(regionId);
        }

        // Highlights every region already IN this place's own group —
        // never invents new geometry (see WorldMapPanel's own header) —
        // and centers the camera on the place's representative region
        // first, the same deterministic pick core/GeographicPlaceView.js
        // already makes, purely so the map opens looking at ground that
        // actually matters rather than wherever the camera happened to
        // already be.
        function showGeographicPlaceOnMap() {
            const place = geographicPlace.value;
            if (!place) return;
            mapHighlightRegionKeys.value = place.regions.map((region) => `${region.worldId}:${region.id}`);
            if (place.representativeRegion) {
                session.focusLocation(place.representativeRegion.id);
                refreshSpatialUI();
            }
            showGeographicPlacePanel.value = false;
            openMapPanel();
            // 0.5.7 — "Show on Map" genuinely switches which primary
            // surface is showing (Places' own detail screen -> Map),
            // so primaryMode follows it — otherwise the Map tab would
            // render the map without ever looking "active." Places'
            // OWN back-stack is deliberately left untouched (still
            // pointing at this same place's detail) — see
            // setPrimaryMode()'s own PLACES branch, which is exactly
            // what lets switching back to the Places tab return here.
            worldViewNav.setPrimaryMode(WorldViewPrimaryMode.MAP);
            primaryMode.value = worldViewNav.primaryMode;
        }

        // 0.2.93 — "Open Source": reuses the EXISTING /editor?load=<id>
        // route ui/components/PublicationCatalog.js and every forked-
        // document link already use to open a document in the Editor —
        // never a second navigation mechanism, and never a mutation
        // World View performs itself. Editing a placed structure's
        // bricks always happens by opening its Document in the Editor,
        // exactly like application/EditorSession.js#
        // editStructurePlacementSource() already established for the
        // Editor's own StructureInstancePanel. Unlike "Edit a Copy"
        // below, this loads the document DIRECTLY — no fork, no
        // independent copy; every other instance of it, wherever
        // placed, reflects whatever gets edited there.
        function openStructureSource(documentId) {
            if (!documentId) {
                return;
            }
            router.push({ path: '/editor', query: { load: documentId } });
        }

        // 0.5.9 — the direct-click Inspection panel's own "Edit a Copy."
        // Available for every inspection type (brick, ground, placement):
        // resolves whichever documentId actually identifies what's
        // being looked at — `inspection.documentId` (the CONTAINING
        // World) for brick/ground, `inspection.sourceDocumentId` (the
        // placed structure's own content, never the World merely
        // positioning it — same distinction Open Source above already
        // draws) for a placement. Forks that document instead of
        // loading it directly (see openStructureSource() above) —
        // leaving every other instance, and the original, untouched.
        // Identical logic to editFocusedCopyFromFocusPanel() above
        // (resolve a publication id if one exists, then the same
        // `/editor?fork=` navigation ui/components/PublicationCatalog.js#
        // forkPublication() already uses) — kept as its own function
        // because it starts from `spatialInspection`, not a
        // WorldFocusContext.
        //
        // 0.6.0 — builds its own EditorEntryContext by hand (there is no
        // WorldFocusContext here to read `.editCopyContext` off of) —
        // camera framing off `worldPosition`/`position`, and
        // `selectAllBricks` ONLY for a 'placement' inspection, the exact
        // same "only STRUCTURE, because only its document is exclusively
        // its own content" rule core/WorldFocusContext.js#editCopyContext
        // applies. A brick/ground inspection's own `documentId` is the
        // shared containing World, never brick-owned content — camera
        // framing only, same as a REGION/LANDMARK "Edit a Copy."
        //
        // 0.6.1 — `returnWorldId`/`returnWorldTitle` are set directly in
        // the constructor call here (unlike editFocusedCopyFromFocusPanel()
        // above, there's no already-built EditorEntryContext to attach
        // them to after the fact) — see currentReturnWorld()'s own
        // header for why this is always the FOCUSED document, never
        // `documentId` above (which, for a placement inspection, is the
        // placed structure's own content, exactly the fork target, not
        // a place to return to). `focusLocationId` is deliberately left
        // unset here, same as before this milestone: a brick/ground
        // inspection has no WorldFocusPanel-shaped location id to
        // reopen on return, and a placement inspection's own
        // `placementId` isn't surfaced onto `spatialInspection` today —
        // see docs/Roadmap.md, 0.6.1's own "Deliberately excluded" list.
        // Camera framing on return still works regardless (0.3.10's own
        // per-World experience store already restores it — see
        // WorldNavigationSession#restoreWorldExperience()).
        function editInspectedCopy(inspection) {
            if (!inspection) {
                return;
            }
            const isPlacement = inspection.type === 'placement';
            const documentId = isPlacement ? inspection.sourceDocumentId : inspection.documentId;
            if (!documentId) {
                return;
            }
            const publication = session.getPublicationIdForDocument(documentId);
            // brick/placement carry `worldPosition`; ground carries
            // `position` — see the inspection-fields template above for
            // the per-type shape this mirrors.
            const position = inspection.type === 'ground' ? inspection.position : inspection.worldPosition;
            const title = isPlacement ? inspection.sourceTitle : inspection.worldTitle;
            const returnWorld = currentReturnWorld();
            const entryContext = new EditorEntryContext({
                sourceDocumentId: documentId,
                focusPosition: position || null,
                selectAllBricks: isPlacement,
                title: title || '',
                kind: isPlacement ? WorldFocusKind.STRUCTURE : null,
                reason: EditorEntryReason.WORLD_VIEW_EDIT_COPY,
                returnWorldId: returnWorld.id,
                returnWorldTitle: returnWorld.title
            });
            router.push({
                path: '/editor',
                query: {
                    fork: documentId,
                    ...(publication ? { publication } : {}),
                    ...editorEntryContextToQuery(entryContext)
                }
            });
        }

        // -----------------------------------------------------------------
        // 0.2.26: World Navigation & Spatial Discovery UX
        // -----------------------------------------------------------------

        // Search never mutates or loads anything by itself — only
        // resolves results for the panel to show. Whether the catalog
        // is empty at all (vs. just this query matching nothing) comes
        // from allPublications, already loaded for the Nearby/Loaded
        // Worlds lists — no separate diagnostic call needed for that
        // distinction.
        const catalogEmpty = computed(() => allPublications.value.length === 0);

        // 0.2.99 — World Collaboration UX. The ONE join point — see
        // ui/components/WorldCollaborationRoster.js's own header — kept
        // as a computed() so it's always derived fresh from
        // worldMembers/worldPresenceRoster/isActiveWorldOwner/
        // activeDocumentInfo, never a copy that could drift from them.
        // `displayName` is resolved here, at the VIEW layer, exactly the
        // same "presentation concern, not the session's own minimal
        // shape" precedent nearbyAvatars already established (0.2.43).
        const worldCollaborationRoster = computed(() => {
            const ownerIdentityId = activeDocumentInfo.value ? activeDocumentInfo.value.authorIdentityId : null;
            const ownerLabel = activeDocumentInfo.value ? activeDocumentInfo.value.author : null;
            return buildWorldCollaborationRoster({
                ownerIdentityId,
                isViewerOwner: isActiveWorldOwner.value,
                members: worldMembers.value,
                presence: worldPresenceRoster.value
            }).map((row) => ({
                ...row,
                displayName: resolveIdentityDisplayName(row.identityId, row.identityId === ownerIdentityId ? ownerLabel : null)
            }));
        });

        // "👥 N online" — every OTHER participant currently present
        // (worldPresenceRoster, one entry per distinct identity — see
        // application/WorldPresenceUseCase.js#getRoster()'s own device
        // aggregation) plus the current viewer themself, whenever a
        // World is actually active — see WorldPresenceIndicator's own
        // header on why this view computes the count rather than the
        // indicator counting anything itself.
        const worldOnlineCount = computed(() => worldPresenceRoster.value.length + (activeDocumentInfo.value ? 1 : 0));

        // 0.2.28: `options` is WorldSearchPanel's emitted
        // { text, center?, radius? } — passed straight through, since
        // session.searchWorld already accepts that shape (and the
        // plain string every pre-0.2.28 caller used).
        function performSearch(options) {
            searchResults.value = guarded(() => session.searchWorld(options)) || [];
        }

        // Search's own Focus action is exactly focusWorld — searching
        // for a document and finding it in "Nearby Worlds" both end at
        // the same operation, by design (see docs/Principles.md,
        // "Focus Is Navigation, Not Discovery").
        function focusSearchResult(documentId) {
            focusWorld(documentId);
        }

        // Opened from PlacementInfoPanel's overlap "View" link — turns
        // 0.2.25's passive "N other documents share this location"
        // count into an actual, choosable list (docs/Principles.md,
        // "Overlap Is A Fact; Collision Is A Policy Decision" — this is
        // the navigation half of making that fact useful, not a new
        // policy decision).
        function openLocationDocuments(position) {
            if (!position) return;
            locationDocumentsPosition.value = position;
            locationDocumentsOccupants.value = guarded(() => session.getDocumentsAtPosition(position)) || [];
            showLocationDocuments.value = true;
        }

        function closeLocationDocuments() {
            showLocationDocuments.value = false;
            locationDocumentsPosition.value = null;
            locationDocumentsOccupants.value = [];
        }

        function focusLocationDocument(documentId) {
            focusWorld(documentId);
            closeLocationDocuments();
        }

        // -----------------------------------------------------------------
        // 0.2.29: World Location Browser — "Explore Here" / "What's Here?"
        // -----------------------------------------------------------------

        // Fallback envelope for a failed/guarded call — same shape
        // exploreLocation always returns, so callers never have to
        // special-case "the call didn't happen" from "it happened and
        // found nothing with no diagnostics available."
        const EMPTY_DISCOVERY_ENVELOPE = { documents: [], diagnostics: { available: false, fatal: null, complete: false, warnings: [] } };

        // Shared open logic: both entry points differ only in which
        // session method resolves the initial envelope (and thus the
        // radius they imply) — everything else about opening the
        // dialog is identical.
        function openLocationBrowser(radius, envelope) {
            locationBrowserCenter.value = cameraPosition.value;
            locationBrowserRadius.value = radius;
            locationBrowserDocuments.value = envelope.documents || [];
            locationBrowserDiagnostics.value = envelope.diagnostics || EMPTY_DISCOVERY_ENVELOPE.diagnostics;
            locationBrowserInspected.value = null;
            showLocationBrowser.value = true;
        }

        // "Explore Here" — center is the CAMERA's current world
        // position, deliberately NOT the active document's placement
        // (see docs/Principles.md, "Camera Focus, Active Document, and
        // Selection Are Three Different Things," 0.2.27): the camera
        // can be looking at empty space between two documents, with no
        // active document at all, and exploring there should still
        // work. session.exploreHere() reads the camera position itself
        // — cameraPosition.value here is only for the dialog's own
        // display, already kept in sync by refreshSpatialUI.
        function exploreHere() {
            if (!cameraPosition.value) return;
            const envelope = guarded(() => session.exploreHere(DEFAULT_EXPLORE_RADIUS)) || EMPTY_DISCOVERY_ENVELOPE;
            openLocationBrowser(DEFAULT_EXPLORE_RADIUS, envelope);
        }

        // "What's Here?" — same camera-position center, a small
        // tolerance radius instead of a chosen one. See
        // WorldNavigationSession.whatsHere's own comment for why this
        // is a small-radius query rather than getDocumentsAtPosition's
        // exact-match test: camera coordinates are continuous and
        // essentially never land exactly on a recorded placement.
        function whatsHere() {
            if (!cameraPosition.value) return;
            const envelope = guarded(() => session.whatsHere()) || EMPTY_DISCOVERY_ENVELOPE;
            openLocationBrowser(NEARBY_RADIUS, envelope);
        }

        // The dialog's own "Explore" button — re-query the SAME center
        // at a newly chosen radius. Any previously expanded Inspect
        // panel is cleared (openLocationBrowser already does this) —
        // it belonged to the old result set, not necessarily the new
        // one.
        function reExploreLocationBrowser(radius) {
            if (!locationBrowserCenter.value) return;
            const envelope = guarded(() => session.exploreLocation({
                center: locationBrowserCenter.value,
                radius
            })) || EMPTY_DISCOVERY_ENVELOPE;
            openLocationBrowser(radius, envelope);
        }

        function closeLocationBrowser() {
            showLocationBrowser.value = false;
            locationBrowserCenter.value = null;
            locationBrowserDocuments.value = [];
            locationBrowserDiagnostics.value = EMPTY_DISCOVERY_ENVELOPE.diagnostics;
            locationBrowserInspected.value = null;
        }

        // Focus — existing focusDocument default behavior (moves the
        // camera, and by default makes the document active too). Closes
        // the browser: the camera is about to move away from the
        // location it was showing, same as LocationDocumentsDialog's
        // own focus-then-close.
        function focusLocationBrowserResult(documentId) {
            focusWorld(documentId);
            closeLocationBrowser();
        }

        // Select — WorldNavigationSession.setActiveDocument: makes the
        // result the active/editing-target document per 0.2.27's rules,
        // WITHOUT moving the camera. The dialog stays open — unlike
        // Focus, nothing about the current view changes, so there's no
        // reason to stop browsing the same location.
        function selectLocationBrowserResult(documentId) {
            guarded(() => session.setActiveDocument(documentId));
            refreshSpatialUI();
        }

        // Inspect — toggle: clicking the currently-expanded result's
        // Inspect/Hide button again collapses it instead of re-fetching.
        // Never navigates, never loads the document — see
        // WorldNavigationSession.inspectDocument's own comment for why
        // documentInfo may come back null here.
        function inspectLocationBrowserResult(documentId) {
            if (locationBrowserInspected.value && locationBrowserInspected.value.documentId === documentId) {
                locationBrowserInspected.value = null;
                return;
            }
            locationBrowserInspected.value = guarded(() => session.inspectDocument(documentId))
                || { documentId, documentInfo: null, placementInfo: null, trust: null };
        }

        // -----------------------------------------------------------------
        // Pointer interaction (0.5.9 — no gizmo, no placement: pick/hover
        // only, driving focus and inspection, never mutation)
        // -----------------------------------------------------------------

        function onPointerDown(event) {
            isDragging = false;
            pointerStart = { x: event.clientX, y: event.clientY };
        }

        function onPointerMove(event) {
            if (pointerStart) {
                const dx = event.clientX - pointerStart.x;
                const dy = event.clientY - pointerStart.y;
                if (Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD_PX) {
                    isDragging = true;
                }
            }
            if (event.buttons === 0) {
                session.hover(event.clientX, event.clientY);
                refreshHoverUI();
            }
            // Update compass heading during camera orbit (when dragging with no buttons pressed after initial drag)
            if (isDragging && event.buttons === 0) {
                compassHeading.value = session.getCompassHeading();
            }
        }

        function onPointerUp(event) {
            if (!isDragging && pointerStart) {
                session.pick(event.clientX, event.clientY, {
                    toggle: event.ctrlKey || event.metaKey,
                    additive: event.shiftKey
                });
                refreshSpatialUI();
            }
            pointerStart = null;
            isDragging = false;
        }

        // -----------------------------------------------------------------
        // Keyboard interaction (0.5.9 — no registry-driven editing
        // shortcuts left; only text-input/avatar-control-mode handling
        // remains)
        // -----------------------------------------------------------------

        function onKeyDown(event) {
            // 1. Text inputs own their keys.
            if (InputRouter.isTextInputTarget(event.target)) {
                if (event.key === 'Escape') {
                    event.target.blur();
                }
                return;
            }
            // 2. Undo/Redo (0.9.210) — Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z,
            // the same convention application/EditorActionRegistry.js's
            // history.undo/history.redo actions already use for the
            // Editor. This is the one shortcut this handler owns
            // directly (undoAction()/redoAction() call session.undo()/
            // redo() — no registry, no second keyboard listener).
            if ((event.ctrlKey || event.metaKey) && !event.altKey) {
                const key = event.key.toLowerCase();
                if (key === 'z' && !event.shiftKey) {
                    event.preventDefault();
                    undoAction();
                    return;
                }
                if ((key === 'z' && event.shiftKey) || key === 'y') {
                    event.preventDefault();
                    redoAction();
                    return;
                }
            }
            // 3. Avatar Control Mode (0.2.36) — only ever consumes
            // W/A/S/D/Shift/Space, and only while explicitly on (see
            // onAvatarKeyDown above).
            if (onAvatarKeyDown(event)) {
                return;
            }
        }

        // -----------------------------------------------------------------
        // Lifecycle
        // -----------------------------------------------------------------

        // The checkbox itself is an <input> — InputRouter.
        // isTextInputTarget() (correctly) treats every <input> as
        // "owns its own keys," so a focused text FIELD can never lose
        // a keystroke to a shortcut. A checkbox has no text to type,
        // so it has nothing to lose by giving focus back immediately —
        // shared by every checkbox in the Avatar panel so checking ANY
        // of them (in any order) never leaves stray focus that would
        // silently swallow the very next WASD press.
        function blurCheckbox(event) {
            if (event && event.target && typeof event.target.blur === 'function') {
                event.target.blur();
            }
        }

        function toggleShowMyAvatar(event) {
            showMyAvatar.value = !showMyAvatar.value;
            session.setLocalAvatarVisible(showMyAvatar.value);
            blurCheckbox(event);
        }

        // 0.2.36 — an explicit toggle, never implied by clicking into
        // the viewport or by focus: see the design doc's own concern
        // ("typing/searching accidentally makes the avatar walk
        // away") and docs/Principles.md. Turning it off releases any
        // held movement keys immediately (session.setAvatarControlMode
        // does this) — exiting always returns keyboard control to the
        // rest of World View at once.
        function toggleAvatarControlMode(event) {
            avatarControlMode.value = !avatarControlMode.value;
            session.setAvatarControlMode(avatarControlMode.value);
            blurCheckbox(event);
        }

        function toggleFollowAvatar(event) {
            followAvatar.value = !followAvatar.value;
            session.setFollowAvatar(followAvatar.value);
            // 0.2.39 — following your OWN avatar and a REMOTE one are
            // mutually exclusive (see WorldNavigationSession.setFollowAvatar's
            // own comment); reflect that immediately rather than
            // waiting for the next periodic refreshSpatialUI().
            if (followAvatar.value) {
                followedRemoteAvatarId.value = null;
            }
            blurCheckbox(event);
        }

        // 0.3.2 — the Camera Perspective selector. `perspective` is
        // either one of core/CameraPerspective.js's CameraPerspective
        // values or `null` ("Free" — clicking the already-active
        // choice again clears it back to the ordinary orbit camera).
        // session.setCameraPerspective() is the one place that decides
        // what actually happens; this handler just reflects whatever
        // it accepted (it can reject an invalid value, though the
        // fixed set of buttons below never offers one).
        function setCameraPerspective(perspective) {
            const next = cameraPerspective.value === perspective ? null : perspective;
            if (session.setCameraPerspective(next)) {
                cameraPerspective.value = next;
            }
        }

        // 0.2.39 — "Follow" on the Avatar Info panel. Deliberately
        // separate from toggleFollowAvatar above: this follows
        // whichever REMOTE avatar is currently the interaction target,
        // never the local avatar — see
        // WorldNavigationSession.followAvatarId's own comment for why
        // that stays a genuinely different capability rather than a
        // generalized "follow any avatarId" replacement for the
        // existing boolean API.
        function followAvatarFromPanel(avatarId) {
            if (session.followAvatarId(avatarId)) {
                followedRemoteAvatarId.value = avatarId;
                followAvatar.value = false;
            }
        }

        function stopFollowingAvatarFromPanel() {
            session.stopFollowingRemoteAvatar();
            followedRemoteAvatarId.value = null;
        }

        // 0.2.44 — Greet/Wave/Point from the Avatar Info panel.
        // Deliberately thin: WorldNavigationSession.performAvatarInteraction()
        // owns every real decision (is there a target, is it a cooldown,
        // is the kind valid) — this handler doesn't second-guess a
        // false return, it just doesn't refresh anything extra. See
        // docs/Principles.md, "An Interaction Request Is Not Authority
        // Over Another Avatar."
        function performAvatarInteraction(kind) {
            if (typeof session.performAvatarInteraction === 'function') {
                session.performAvatarInteraction(kind);
            }
        }

        // 0.2.43 — clicking a "Nearby Avatars" row reaches the SAME
        // avatarId a 3D-viewport click would, through
        // WorldNavigationSession.targetAvatar() — opens the identical
        // Avatar Info panel (already wired to followAvatarFromPanel
        // above), never a second inspection surface.
        function selectNearbyAvatar(avatarId) {
            session.targetAvatar(avatarId);
            refreshSpatialUI();
        }

        function toggleShowOtherAvatars(event) {
            showOtherAvatars.value = !showOtherAvatars.value;
            session.setRemoteAvatarsVisible(showOtherAvatars.value);
            blurCheckbox(event);
        }

        // -----------------------------------------------------------------
        // Avatar movement keyboard interaction (0.2.36)
        // -----------------------------------------------------------------
        //
        // Deliberately separate from onKeyDown below: W/A/S/D/Shift/Space
        // only ever mean anything while Avatar Control Mode is
        // explicitly on. Both handlers
        // still respect the same "text inputs own their keys" rule
        // onKeyDown already follows, so search/metadata fields never
        // fight the avatar for keystrokes.
        function onAvatarKeyDown(event) {
            if (!avatarControlMode.value || InputRouter.isTextInputTarget(event.target)) {
                return false;
            }
            if (session.avatarKeyDown(event.key)) {
                event.preventDefault();
                return true;
            }
            return false;
        }

        function onAvatarKeyUp(event) {
            // Always forwarded (not gated on avatarControlMode/text-input)
            // so a key that WAS captured while control mode was on
            // still cleanly releases even if the mode was toggled off,
            // or focus moved to a text input, before the keyup arrived
            // — see WorldNavigationSession.avatarKeyUp's own comment.
            if (session.avatarKeyUp(event.key)) {
                event.preventDefault();
            }
        }

        // A window-blur (alt-tab, DevTools breakpoint, another app
        // stealing focus) can swallow a keyup entirely — releasing
        // every held key here is what stops that from leaving the
        // avatar "stuck" walking forever, exactly the scenario the
        // design doc calls out.
        //
        // 0.3.2 — deliberately releases keys ONLY, never the mode
        // itself. This used to also call session.setAvatarControlMode(false)
        // (silently unchecking "Control My Avatar"), which was exactly
        // the kind of hidden state transition docs/Principles.md now
        // names and forbids: the user explicitly turned control mode
        // on, and a window losing focus is not the user explicitly
        // turning it back off. See WorldNavigationSession.releaseAvatarMovementKeys —
        // the checkbox stays checked, WASD simply resumes working the
        // instant the window regains focus, with no held-over stuck
        // key from before the blur.
        function onWindowBlur() {
            session.releaseAvatarMovementKeys();
        }

        onMounted(() => {
            allPublications.value = listPublicationsUseCase.execute();
            session.start(viewport.value);
            session.navigateToDocument(initialDocumentId);
            refreshSpatialUI();

            // 0.6.1 — World ↔ Editor Continuity & Return Navigation.
            // The Editor's own "← Back to World" button (ui/components/
            // Toolbar.js) navigates to `/world/<returnWorldId>?returnLocation=<id>`
            // — `returnLocation` is exactly the same
            // WorldRegion/WorldLandmark/StructurePlacement id
            // core/EditorEntryContext.js#focusLocationId already carried
            // FOR the Editor's own camera framing on the way in, reused
            // here for the trip back out. Reopening the SAME WorldFocusPanel
            // is all this does — the camera itself is already handled,
            // for free, by 0.3.10's own per-World experience store
            // (session.navigateToDocument() above already triggered
            // restoreWorldExperience() via refreshSpatialUI()'s
            // _syncWorldExperience(), restoring exactly the framing this
            // replica had when it left for the Editor). A location that
            // no longer resolves (deleted while the viewer was away)
            // degrades silently — arriving back in World View is not an
            // error, even when the one thing being returned to is gone.
            if (route.query.returnLocation) {
                const context = session.getFocusContextForLocation(route.query.returnLocation);
                if (context) {
                    focusContext.value = context.toJSON();
                    showFocusPanel.value = true;
                }
                router.replace({ path: `/world/${initialDocumentId}` });
            }

            hasLocalAvatar.value = session.hasLocalAvatar();
            // 0.3.1 — apply the two now-default-on avatar toggles to
            // the session itself once a local avatar actually exists
            // (matching the checkboxes' own :disabled="!hasLocalAvatar"
            // gate — nothing to control/follow without one).
            // session.start() above is what makes hasLocalAvatar true,
            // so this is the earliest point the session can honor
            // either preference.
            if (hasLocalAvatar.value) {
                session.setAvatarControlMode(avatarControlMode.value);
                session.setFollowAvatar(followAvatar.value);
            }

            viewport.value.addEventListener('pointerdown', onPointerDown);
            viewport.value.addEventListener('pointermove', onPointerMove);
            viewport.value.addEventListener('pointerup', onPointerUp);
            window.addEventListener('keydown', onKeyDown);
            window.addEventListener('keyup', onAvatarKeyUp);
            window.addEventListener('blur', onWindowBlur);

            spatialInterval = setInterval(() => {
                session.updateSpatialView();
                refreshSpatialUI();
            }, 3000);

            // 0.3.0 — Collaborative Spatial Presence. A SEPARATE, much
            // faster interval than spatialInterval above — see
            // _syncWorldSpatialPresence()'s own header on why the two
            // cadences must stay independent. session.syncWorldSpatialPresence()
            // itself does the actual throttling decision (immediate for
            // selection/activity, at most once per ~90ms for position/
            // heading — see application/WorldSpatialPresenceUseCase.js's
            // own header); calling it every 100ms here just guarantees a
            // fresh read of the camera/selection/gizmo state is always
            // available to throttle FROM. A no-op whenever no World is
            // currently spatially present.
            spatialPresenceSyncInterval = setInterval(() => {
                if (presentSpatialWorldDocumentId) {
                    session.syncWorldSpatialPresence(presentSpatialWorldDocumentId);
                }
            }, 100);

            // 0.9.98 — Vehicle Mount/Dismount World View Integration. Its
            // own short interval, deliberately separate from both
            // spatialInterval (3000ms — far too slow for an affordance
            // that must appear/disappear as the avatar walks up to or
            // away from a vehicle) and spatialPresenceSyncInterval above
            // (a different concern — publishing THIS avatar's own
            // presence to others, not reading local mount/dismount
            // state). Only ever reads
            // session.avatarVehicleInteractionState() — see that
            // method's own header; this view computes nothing about
            // proximity or targeting itself. Gated on avatarControlMode:
            // showing "[E] Mount/Dismount" while the key that would
            // actually do something is off would be misleading.
            vehicleInteractionInterval = setInterval(() => {
                vehicleInteractionState.value = (hasLocalAvatar.value && avatarControlMode.value
                    && typeof session.avatarVehicleInteractionState === 'function')
                    ? session.avatarVehicleInteractionState()
                    : null;
            }, 150);
        });

        onBeforeUnmount(() => {
            // 0.9.193 — Automatic Snapshot Session-Lifetime Guard. Flipped
            // FIRST, before anything else tears down: any
            // automaticSnapshotEncounterCascade run still in flight (its own
            // resolve/materialize/place chain is never cancelled — see that
            // file's own header) now sees a dead session the instant it
            // reaches its own registration checkpoint, however much later
            // that turns out to be.
            automaticCascadeSessionActive = false;
            // 0.9.257 — World View Place Naming Presentation. Flipped
            // immediately after the identical Snapshot-cascade guard above,
            // before `placeNamingDiscoveryMonitor.dispose()` even runs — see
            // that flag's own declaration comment for why both are needed.
            placeNamingDiscoveryPresentationActive = false;
            if (placeNamingDiscoveryMonitor) {
                placeNamingDiscoveryMonitor.dispose();
            }
            clearInterval(spatialInterval);
            clearInterval(spatialPresenceSyncInterval);
            clearInterval(vehicleInteractionInterval);
            if (feedbackTimer) {
                clearTimeout(feedbackTimer);
            }
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onAvatarKeyUp);
            window.removeEventListener('blur', onWindowBlur);
            viewport.value.removeEventListener('pointerup', onPointerUp);
            viewport.value.removeEventListener('pointermove', onPointerMove);
            viewport.value.removeEventListener('pointerdown', onPointerDown);
            // 0.2.99/0.3.0 — session.dispose() below already leaves
            // EVERY World this session holds coarse OR spatial presence
            // for (it iterates its own _presentWorldDocumentIds AND
            // _presentSpatialWorldDocumentIds — see
            // WorldNavigationSession's own dispose()), so only the
            // view's own live subscriptions need tearing down here.
            if (unsubscribeWorldPresence) {
                unsubscribeWorldPresence();
            }
            if (unsubscribeWorldMembership) {
                unsubscribeWorldMembership();
            }
            if (unsubscribeWorldSpatialPresence) {
                unsubscribeWorldSpatialPresence();
            }
            // 0.3.10 — the FINAL save for whichever World this replica's
            // local experience is currently tracking, so closing the tab
            // (or navigating elsewhere) still remembers this camera
            // framing — _syncWorldExperience() above only ever saves on
            // the NEXT active-document change, which never comes once
            // this view is torn down.
            if (presentExperienceWorldDocumentId) {
                session.saveWorldExperience(presentExperienceWorldDocumentId);
            }
            // 0.9.207 — defensive only: session.dispose() immediately below
            // already tears down the whole render session (and, with it,
            // any lingering preview world), but ending an active history
            // preview explicitly first keeps _historyPreview from outliving
            // the view that opened it even for one tick.
            if (historyPreviewCursor.value !== null) {
                guarded(() => session.cancelHistoryPreview());
            }
            session.dispose();
        });

        return {
            viewport,
            title,
            author,
            showMyAvatar,
            hasLocalAvatar,
            toggleShowMyAvatar,
            avatarControlMode,
            followAvatar,
            vehicleInteractionState,
            cameraPerspective,
            CameraPerspective,
            setCameraPerspective,
            showOtherAvatars,
            remoteAvatarDiagnostics,
            toggleAvatarControlMode,
            toggleFollowAvatar,
            toggleShowOtherAvatars,
            avatarInfo,
            followedRemoteAvatarId,
            followAvatarFromPanel,
            stopFollowingAvatarFromPanel,
            performAvatarInteraction,
            nearbyAvatars,
            selectNearbyAvatar,
            loadedWorlds,
            nearbyWorlds,
            failedWorlds,
            spatialSelection,
            spatialHover,
            spatialInspection,
            documentInfo,
            activeDocumentInfo,
            focusedDocumentTitle,
            parentTitle,
            showMetadataEditor,
            metadataEditTarget,
            openMetadataEditor,
            placementInfo,
            activePlacementInfo,
            ownPublication,
            showPlacementEditor,
            placementEditTarget,
            placementOverlapWarning,
            openPlacementEditor,
            closePlacementEditor,
            onMovePlacement,
            removePlacementFromPanel,
            unpublishOwnPublication,
            getPublicationCommentariesCommand,
            getPublicationPlacementsCommand,
            addPublicationCommentaryCommand,
            getRecipientNotificationEventsCommand,
            showNotificationHistoryPanel,
            openNotificationHistoryPanel,
            closeNotificationHistoryPanel,
            searchResults,
            catalogEmpty,
            performSearch,
            focusSearchResult,
            showLocationDocuments,
            locationDocumentsPosition,
            locationDocumentsOccupants,
            openLocationDocuments,
            closeLocationDocuments,
            focusLocationDocument,
            showLocationBrowser,
            locationBrowserCenter,
            locationBrowserRadius,
            locationBrowserDocuments,
            locationBrowserDiagnostics,
            locationBrowserInspected,
            exploreHere,
            whatsHere,
            reExploreLocationBrowser,
            closeLocationBrowser,
            focusLocationBrowserResult,
            selectLocationBrowserResult,
            inspectLocationBrowserResult,
            cameraPosition,
            compassHeading,
            spatialContext,
            compassMarkers,
            showLocationsPanel,
            worldLocations,
            showHistoryPanel,
            historyTimeline,
            selectedHistoryEntryId,
            historyPreviewCursor,
            openHistoryPanel,
            closeHistoryPanel,
            selectHistoryEntry,
            previewSelectedHistoryEntry,
            cancelHistoryPreviewAction,
            restoreSelectedHistoryEntry,
            canUndo,
            canRedo,
            undoLabel,
            redoLabel,
            undoAction,
            redoAction,
            showWelcomePanel,
            welcomeContext,
            welcomeIsArrival,
            worldReturnInfo,
            welcomeIsReturning,
            openExplorePanel,
            closeWelcomePanel,
            exploreWelcomeSuggestion,
            canEditActiveWorld,
            showLandmarkForm,
            landmarkFormTarget,
            showRegionForm,
            regionFormTarget,
            showMapPanel,
            mapContent,
            openMapPanel,
            closeMapPanel,
            focusLocationFromMap,
            focusCollaboratorFromMap,
            mapHighlightRegionKeys,
            showFocusPanel,
            focusContext,
            openFocusForLocation,
            openFocusForGeographicPlace,
            openFocusForCollaborator,
            closeFocusPanel,
            goFromFocusPanel,
            showFocusOnMap,
            openNamesFromFocusPanel,
            editFocusedCopyFromFocusPanel,
            showGeographicPlaceDirectory,
            geographicPlaces,
            showGeographicPlacePanel,
            geographicPlace,
            openGeographicPlaceDirectory,
            closeGeographicPlaceDirectory,
            openGeographicPlace,
            closeGeographicPlacePanel,
            focusRegionFromPlace,
            openNamesFromPlace,
            showGeographicPlaceOnMap,
            nearbyGeographicPlaces,
            goToGeographicPlace,
            // 0.5.7 — World View UX & Progressive Exploration.
            WorldViewPrimaryMode,
            primaryMode,
            placesView,
            setPrimaryMode,
            goBackInPlaces,
            nearbySectionsCollapsed,
            setNearbySectionCollapsed,
            NEARBY_PLACES_SECTION,
            NEARBY_LANDMARKS_SECTION,
            NEARBY_PEOPLE_SECTION,
            WORLD_ENCOUNTERS_SECTION,
            // 0.9.257 — World View Place Naming Presentation.
            NEARBY_PLACE_NAMING_SECTION,
            nearbyPlaceNamingClaims,
            nearbyPlaceNamingClaimRows,
            placeNamingDiscoveryError,
            worldDiscoverySourceRegistry,
            worldEncounterMaterialSources,
            worldEncounterMaterialVerifier,
            publicationDistributionLifecycleStore,
            worldDiscoveryLeadRegistry,
            discoverWorldEncounterPublicationCommand,
            publicationDiscoveryTag,
            nearbyLandmarkRows,
            nearbyPeopleRows,
            goToNearbyCollaborator,
            navigateToNearbyPlaceNamingClaim,
            adoptNearbyPlaceNamingClaim,
            goHome,
            openLocationsPanel,
            closeLocationsPanel,
            focusLocationFromPanel,
            openAddLandmarkForm,
            openEditLandmarkForm,
            closeLandmarkForm,
            onSaveLandmarkForm,
            removeLandmarkFromPanel,
            openAddRegionForm,
            openEditRegionForm,
            closeRegionForm,
            onSaveRegionForm,
            removeRegionFromPanel,
            showNamingPanel,
            namingPanelRegionId,
            namingPanelClaims,
            namingPanelView,
            namingPanelPreferredName,
            namingPanelGeographicRegions,
            namingPanelGeographicView,
            openNamingPanel,
            closeNamingPanel,
            publishNamingClaim,
            retractNamingClaim,
            setPreferredNamingName,
            clearPreferredNamingName,
            exportNamingClaim,
            importNamingClaim,
            publishNamingClaimToNostr,
            canPublishPlaceNamingClaimToNostr: Boolean(publishPlaceNamingClaimToNostrCommand),
            namingPanelPublishToNostrClaimId,
            namingPanelPublishToNostrExecuting,
            namingPanelPublishToNostrError,
            namingPanelPublishToNostrResult,
            myIdentityId,
            showMembersPanel,
            worldCollaborationRoster,
            worldOnlineCount,
            spatialCollaboratorRows,
            followCollaborator,
            isActiveWorldOwner,
            collaborationPendingIdentityId,
            openMembersPanel,
            closeMembersPanel,
            grantWorldMember,
            revokeWorldMember,
            feedbackMessage,
            feedbackVisible,
            focusWorld,
            focusSelection,
            openStructureSource,
            editInspectedCopy,
            onSaveMetadata,
            saveActiveDocument,
            publishActiveDocument,
            distributeWorldEncounterPublication,
            distributeWorldEncounterSnapshot,
            discoverOwnSnapshot,
            exportOwnSnapshot,
            discoverSnapshotCandidatesCommand,
            resolveSelectedSnapshotCommand,
            materializeSelectedSnapshotCommand
        };
    },
    template: `
        <div class="world-view">
            <div class="world-view-overlay">
              <div class="world-view-overlay-scroll">
                <h2>{{ title }}</h2>
                <p
                    v-if="activeDocumentInfo"
                    :class="['world-view-status', { 'world-view-status--published': activeDocumentInfo.status === 'published' }]"
                >
                    <span v-if="activeDocumentInfo.status === 'published'">🔒 Published</span>
                    <span v-else-if="activeDocumentInfo.parentDocumentId">
                        ✎ Editing fork<template v-if="parentTitle(activeDocumentInfo.parentDocumentId)"> — forked from {{ parentTitle(activeDocumentInfo.parentDocumentId) }}</template>
                    </span>
                    <span v-else>✎ {{ activeDocumentInfo.statusLabel }}</span>
                </p>
                <!-- 0.2.27: camera focus and the active (editing) document
                     are independently tracked — two publications can share
                     a coordinate, so focusing one after the other never
                     moves the camera, but Editing still needs to say which
                     one is now the mutation target. See
                     docs/Principles.md, "Camera Focus, Active Document,
                     and Selection Are Three Different Things." -->
                <p class="world-view-context">
                    Camera: {{ focusedDocumentTitle || 'World' }} · Editing: {{ activeDocumentInfo ? title : 'None' }}
                </p>
                <div v-if="activeDocumentInfo && activeDocumentInfo.editable" class="world-view-actions">
                    <button
                        class="action-btn"
                        :disabled="!activeDocumentInfo.dirty"
                        @click="saveActiveDocument"
                    >Save</button>
                    <button class="action-btn action-btn--primary" @click="publishActiveDocument">Publish</button>
                    <button class="action-btn" @click="openMetadataEditor(activeDocumentInfo)">Edit Metadata</button>
                    <button
                        class="action-btn"
                        :disabled="!canUndo"
                        :title="undoLabel || 'Nothing to undo'"
                        @click="undoAction"
                    >Undo</button>
                    <button
                        class="action-btn"
                        :disabled="!canRedo"
                        :title="redoLabel || 'Nothing to redo'"
                        @click="redoAction"
                    >Redo</button>
                    <button
                        class="action-btn"
                        title="Inspect, preview, and restore this document's command history"
                        @click="openHistoryPanel"
                    >History</button>
                </div>
                <div v-if="activePlacementInfo" class="world-view-actions">
                    <button
                        class="action-btn"
                        :disabled="!activePlacementInfo.movable"
                        @click="openPlacementEditor(activePlacementInfo)"
                    >Move Placement</button>
                </div>
                <p v-if="author">by {{ author }}</p>
                <!-- 0.9.140 — Own Publication Distribution Entry Point.
                     Deliberately mounted here, beside Save/Publish/Move
                     Placement — never inside the Explore-mode "World
                     Encounters" section below — so distributing the
                     local user's own current Snapshot never depends on
                     primaryMode, on a connected peer, or on World
                     Encounters having anything to show. Visible whenever
                     a World is loaded (cameraPosition exists), exactly
                     like the Home/Locations toolbar immediately below;
                     ownPublication/distributeWorldEncounterSnapshot are
                     both described in this file's own setup()-level
                     comments above. See ui/components/OwnPublicationPanel.js's
                     own header for why this stays a completely separate
                     surface from WorldEncounterCanvas's own "Distribute
                     Snapshot" action.

                     0.9.159 — placementInfo is the SAME activePlacementInfo
                     (session.getPlacementInfo(activeId), computed in
                     refreshSpatialUI() above) the Placement Info panel
                     immediately below already renders — handed straight
                     through, unchanged, so "Place Materialized Snapshot"
                     reuses this replica's EXISTING spatial authority for
                     the active Publication rather than looking one up a
                     second time.

                     0.9.160 — worldDiscoverySourceRegistry is the SAME
                     app-wide registry instance injected below and handed
                     to WorldEncounterCanvas as its own registry prop —
                     handed to OwnPublicationPanel too, unchanged, so
                     "Register Placed Snapshot" mutates the EXACT registry
                     WorldEncounterCanvas is already subscribed to,
                     never a second, disconnected one.

                     0.9.198 — unpublishCommand is unpublishOwnPublication,
                     below: a thin wrapper around
                     session.unpublishDocument(), mirroring
                     removePlacementFromPanel's own wrap of
                     session.removePlacement() one authority up.

                     0.9.215 — exportSnapshotCommand is exportOwnSnapshot,
                     above: a thin wrapper around the app-wide
                     exportSnapshotCommand injected above, mirroring
                     distributeWorldEncounterSnapshot's own wrap one
                     action over.

                     0.9.308 — getPublicationPlacementsCommand is a thin
                     wrapper around session.getPlacementsForPublication(),
                     above — the FULL, unreduced placement list for this
                     Publication, never just the singular
                     activePlacementInfo already handed to this same
                     panel above. See ui/components/OwnPublicationPanel.js's
                     own header, "0.9.308."

                     0.9.347 — publicationDistributionCommand is
                     distributeWorldEncounterPublication, above: the SAME
                     thin wrapper WorldEncounterCanvas's own
                     "Distribute Publication" action (reachable only
                     through a selected marker) already calls, handed here
                     unchanged so this panel's own "Distribute Publication"
                     button — reachable with zero connected peers and no
                     selection of any kind — reaches the EXACT SAME command
                     boundary, never a second implementation. See
                     ui/components/OwnPublicationPanel.js's own header,
                     "0.9.347 — Post-Publish Distribution Entry Point." -->
                <OwnPublicationPanel
                    v-if="cameraPosition"
                    :publication="ownPublication"
                    :unpublishCommand="unpublishOwnPublication"
                    :snapshotDistributionCommand="distributeWorldEncounterSnapshot"
                    :publicationDistributionCommand="distributeWorldEncounterPublication"
                    :discoverSnapshotCommand="discoverOwnSnapshot"
                    :exportSnapshotCommand="exportOwnSnapshot"
                    :discoverSnapshotCandidatesCommand="discoverSnapshotCandidatesCommand"
                    :worldDiscoverySourceRegistry="worldDiscoverySourceRegistry"
                    :resolveSelectedSnapshotCommand="resolveSelectedSnapshotCommand"
                    :materializeSelectedSnapshotCommand="materializeSelectedSnapshotCommand"
                    :placementInfo="activePlacementInfo"
                    :getPublicationCommentariesCommand="getPublicationCommentariesCommand"
                    :addPublicationCommentaryCommand="addPublicationCommentaryCommand"
                    :viewerIdentityId="myIdentityId"
                    :getPublicationPlacementsCommand="getPublicationPlacementsCommand"
                />
            <!-- 0.5.7 — World View UX & Progressive Exploration. Home
                 and Locations stay plain navigation utilities; Explore /
                 Map / Places below are the three PRIMARY, mutually
                 exclusive modes that replace the separate always-open
                 Map/"Geographic Places"/"Explore" buttons this toolbar
                 used to carry — see application/
                 WorldViewNavigationState.js's own header. -->
            <div v-if="cameraPosition" class="world-view-actions world-view-actions--navigation">
                <button class="action-btn" @click="goHome">Home</button>
                <button
                    v-if="activeDocumentInfo"
                    class="action-btn"
                    title="Landmarks, regions, and every structure this session knows about"
                    @click="openLocationsPanel"
                >Locations</button>
                <!-- 0.9.284 — Notification History UI Boundary. Gated on
                     cameraPosition alone, same as Home immediately above
                     — never on activeDocumentInfo, since notification
                     history is scoped to the signed-in identity, not to
                     whichever document happens to be open for editing. -->
                <button
                    class="action-btn"
                    title="A durable record of notification facts addressed to you"
                    @click="openNotificationHistoryPanel"
                >Notifications</button>
            </div>
            <div v-if="cameraPosition" class="world-view-primary-nav">
                <button
                    :class="['action-btn', { 'action-btn--active': primaryMode === WorldViewPrimaryMode.EXPLORE }]"
                    title="What's around me, and where can I go?"
                    @click="setPrimaryMode(WorldViewPrimaryMode.EXPLORE)"
                >Explore</button>
                <button
                    :class="['action-btn', { 'action-btn--active': primaryMode === WorldViewPrimaryMode.MAP }]"
                    title="Where is everything?"
                    @click="setPrimaryMode(WorldViewPrimaryMode.MAP)"
                >Map</button>
                <button
                    :class="['action-btn', { 'action-btn--active': primaryMode === WorldViewPrimaryMode.PLACES }]"
                    title="What places exist?"
                    @click="setPrimaryMode(WorldViewPrimaryMode.PLACES)"
                >Places</button>
            </div>
            <!-- Point 3 of the design conversation: "the user sees the
                 CATEGORY, not 20 controls." Reuses data this view
                 already computes every refreshSpatialUI() tick — no new
                 session query. -->
            <div v-if="cameraPosition && primaryMode === WorldViewPrimaryMode.EXPLORE" class="world-view-section world-view-section--nearby">
                <h4>Nearby</h4>
                <CollapsibleSection
                    title="Nearby Places"
                    :count="nearbyGeographicPlaces.length"
                    :collapsed="nearbySectionsCollapsed.places"
                    @toggle="setNearbySectionCollapsed('places', NEARBY_PLACES_SECTION, $event)"
                >
                    <p v-if="nearbyGeographicPlaces.length === 0" class="world-view-nearby-empty">Nothing nearby yet.</p>
                    <div v-for="place in nearbyGeographicPlaces" :key="place.fingerprintKey" class="world-view-nearby-row">
                        <span class="world-view-nearby-row-label">⬢ {{ place.displayName }}</span>
                        <span class="world-view-nearby-row-distance">{{ place.distance }}m {{ place.direction }}</span>
                        <button class="action-btn world-view-nearby-row-go" @click="openFocusForGeographicPlace(place.fingerprintKey)">Info</button>
                        <button class="action-btn world-view-nearby-row-go" @click="goToGeographicPlace(place.fingerprintKey)">Go</button>
                    </div>
                </CollapsibleSection>
                <CollapsibleSection
                    title="Nearby Landmarks"
                    :count="nearbyLandmarkRows.length"
                    :collapsed="nearbySectionsCollapsed.landmarks"
                    @toggle="setNearbySectionCollapsed('landmarks', NEARBY_LANDMARKS_SECTION, $event)"
                >
                    <p v-if="nearbyLandmarkRows.length === 0" class="world-view-nearby-empty">Nothing nearby yet.</p>
                    <div v-for="landmark in nearbyLandmarkRows" :key="landmark.id" class="world-view-nearby-row">
                        <span class="world-view-nearby-row-label">★ {{ landmark.title }}</span>
                        <span class="world-view-nearby-row-distance">{{ landmark.distance }}m {{ landmark.direction }}</span>
                        <button class="action-btn world-view-nearby-row-go" @click="openFocusForLocation(landmark.id)">Info</button>
                        <button class="action-btn world-view-nearby-row-go" @click="focusLocationFromPanel(landmark.id)">Go</button>
                    </div>
                </CollapsibleSection>
                <CollapsibleSection
                    title="Nearby People"
                    :count="nearbyPeopleRows.length"
                    :collapsed="nearbySectionsCollapsed.people"
                    @toggle="setNearbySectionCollapsed('people', NEARBY_PEOPLE_SECTION, $event)"
                >
                    <p v-if="nearbyPeopleRows.length === 0" class="world-view-nearby-empty">Nobody nearby yet.</p>
                    <div v-for="person in nearbyPeopleRows" :key="person.identityId" class="world-view-nearby-row">
                        <span class="world-view-nearby-row-label">{{ person.displayName }}</span>
                        <span class="world-view-nearby-row-distance">{{ person.distance }}m {{ person.direction }}</span>
                        <button
                            v-if="person.deviceId"
                            class="action-btn world-view-nearby-row-go"
                            @click="openFocusForCollaborator(person.deviceId)"
                        >Info</button>
                        <button
                            v-if="person.deviceId"
                            class="action-btn world-view-nearby-row-go"
                            @click="goToNearbyCollaborator(person.deviceId)"
                        >Go</button>
                    </div>
                </CollapsibleSection>
                <!-- 0.9.257 — World View Place Naming Presentation. Presents
                     nearbyPlaceNamingClaimRows — a pure mapping over
                     placeNamingDiscoveryMonitor.lastResult, see that
                     computed's own comment — never a "primary"/"official"
                     name for a place, and never a reason to rename anything
                     this view actually navigates by. An empty list here
                     means "no nearby claims were DISCOVERED," never "this
                     place has no name" — the wording below is deliberate.
                     placeNamingDiscoveryError is a small, optional,
                     non-authoritative indicator; it is never a reason to
                     hide whatever nearbyPlaceNamingClaimRows still holds
                     from the last successful discovery. -->
                <CollapsibleSection
                    title="Nearby Place Names"
                    :count="nearbyPlaceNamingClaimRows.length"
                    :collapsed="nearbySectionsCollapsed.placeNaming"
                    @toggle="setNearbySectionCollapsed('placeNaming', NEARBY_PLACE_NAMING_SECTION, $event)"
                >
                    <p v-if="placeNamingDiscoveryError" class="world-view-nearby-empty world-view-place-naming-error">
                        Place naming discovery is temporarily unavailable — showing the last known claims, if any.
                    </p>
                    <p v-if="nearbyPlaceNamingClaimRows.length === 0" class="world-view-nearby-empty">No nearby place naming claims were discovered.</p>
                    <div
                        v-for="claim in nearbyPlaceNamingClaimRows"
                        :key="claim.claimId"
                        class="world-view-nearby-row world-view-place-naming-row"
                        :title="claim.claimId"
                    >
                        <span class="world-view-nearby-row-label">✎ {{ claim.name }}</span>
                        <span class="world-view-nearby-row-distance" v-if="claim.position">at ({{ Math.round(claim.position.x) }}, {{ Math.round(claim.position.z) }})</span>
                        <span class="world-view-place-naming-author">claimed by {{ claim.authorDisplayName }}</span>
                        <!-- 0.9.266 — Nearby Place Naming Claim Metadata
                             Presentation. createdAtLabel is a pure display
                             string (see nearbyPlaceNamingClaimRows's own
                             0.9.266 comment) — empty for a malformed/missing
                             createdAt, in which case this line simply does
                             not render, exactly like claim.position above.
                             Deliberately no signature/verification
                             indicator sits beside it — see that same
                             comment for why this milestone draws that
                             boundary here. -->
                        <span v-if="claim.createdAtLabel" class="world-view-place-naming-created">Created: {{ claim.createdAtLabel }}</span>
                        <!-- 0.9.260 — Nearby Place Naming Claim Interaction.
                             Navigate only ever moves the camera to the
                             claim's own region via the existing World
                             navigation machinery — it never adopts,
                             verifies, or ranks this claim, and never
                             renames the WorldRegion it points at. -->
                        <button
                            class="action-btn world-view-nearby-row-go"
                            @click="navigateToNearbyPlaceNamingClaim(claim)"
                        >Navigate</button>
                        <!-- 0.9.263 — Nearby Place Naming Claim Adoption UI.
                             Adopt is the one explicit action that reaches
                             the existing, unmodified
                             session.importPlaceNamingClaim() boundary —
                             see adoptNearbyPlaceNamingClaim()'s own
                             comment. Discovery, proximity, presentation,
                             and Navigate above never trigger this
                             themselves; it only ever runs from this
                             click.

                             0.9.269 — Nearby Place Naming Claim Adoption
                             Status Indicator. Adopt only renders while
                             claim.alreadySaved is false; once
                             session.hasPlaceNamingClaim() reports this
                             claim is already on file, the button is
                             replaced by a passive status line rather than
                             a disabled button — a Wanderer never needs to
                             click something to learn it would do nothing.
                             Deliberately worded "Already saved," never
                             "Already adopted": the underlying store also
                             holds this identity's OWN published claims,
                             not only ones reached via Adopt, so "saved"
                             is the term that matches what has() actually
                             establishes without overstating it — see this
                             milestone's own docs/Roadmap.md entry. -->
                        <button
                            v-if="!claim.alreadySaved"
                            class="action-btn world-view-nearby-row-adopt"
                            @click="adoptNearbyPlaceNamingClaim(claim)"
                        >Adopt</button>
                        <span v-else class="world-view-nearby-row-status">✓ Already saved</span>
                    </div>
                </CollapsibleSection>
                <!-- 0.9.17 — Integrate World Encounters into the Existing
                     World View. WorldEncounterCanvas (0.9.3 through
                     0.9.13, unmodified) mounted here exactly the way
                     ui/views/LiveWorldView.js (0.9.15) already mounts
                     it — handed worldDiscoverySourceRegistry straight
                     through as its own registry prop, no view prop,
                     no count computed by THIS file (the count prop is
                     left at its own default of null on purpose — see
                     CollapsibleSection.js's own header for why null
                     means "no natural count"). Every behavior behind
                     registry — subscribing, re-projecting, rendering
                     markers, owning selectedEncounter — stays entirely
                     WorldEncounterCanvas's own job, exactly as it always
                     has been; this section changes WHERE it is mounted,
                     never what it does.

                     0.9.99 — materialSources/materialVerifier, both
                     already-existing WorldEncounterCanvas props
                     (0.9.39/0.9.42) that stayed at their own default of
                     null everywhere in this running app until now, are
                     handed through the same way: unmodified collaborators,
                     never anything this file constructs or judges itself.
                     See this file's own setup()-level comment on
                     worldEncounterMaterialSources, above.

                     0.9.100 — distributionLifecycleStore, a new
                     WorldEncounterCanvas prop, handed through the same
                     way: an already-composed, already-restored
                     observation store, never anything this file
                     constructs, persists, or transitions itself. See
                     this file's own setup()-level comment on
                     publicationDistributionLifecycleStore, above.

                     0.9.104 — distributionCommand, a new WorldEncounterCanvas
                     prop, bound to this file's own distributeWorldEncounterPublication()
                     — a thin wrapper around the injected
                     publicationDistributionCommand, never a second
                     command and never anything this file orchestrates or
                     writes into the lifecycle store itself. See that
                     function's own comment, above.

                     0.9.110 — worldDiscoveryLeadRegistry, WorldEncounterCanvas's
                     own already-existing (0.9.40) prop, handed through the
                     same way: an already-composed registry, never anything
                     this file constructs, queries, or resolves itself.
                     Every reactive behavior behind it — subscribing,
                     resolving a lead for the current selection, the
                     Wanderer's own ambiguity choice — stays entirely
                     WorldEncounterCanvas's own job, unmodified; this
                     section changes only that the registry it was already
                     built to observe is real.

                     0.9.111 — discoveryCommand, WorldEncounterCanvas's own
                     new prop, forwarded the app-wide
                     discoverWorldEncounterPublicationCommand verbatim — no
                     wrapper, no added field. WorldEncounterCanvas now owns
                     the entire Discover Publication trigger AND result
                     panel (rendered through the SAME existing Material/
                     Verification markup 0.9.39's own selection-driven
                     panel already uses) — see that file's own header,
                     "0.9.111 — World View Decentralized Publication
                     Retrieval."

                     0.9.357 — defaultDiscoveryTag, WorldEncounterCanvas's
                     own new prop, forwarded the app-wide
                     publicationDiscoveryTag verbatim (this file's own
                     ui/main.js-injected copy of the SAME canonical campaign
                     tag distribution already uses) — seeds ONLY the
                     Discovery-tag input's own initial value; the field
                     stays exactly as freely editable as before, and
                     discoverPublication() itself is entirely unchanged. See
                     tests/PublicationDiscoveryTagUXConsistencyAudit.test.js
                     (0.9.356) for why this is safe.

                     0.9.138 — snapshotDistributionCommand, WorldEncounterCanvas's
                     own new prop, bound to this file's own
                     distributeWorldEncounterSnapshot() — a thin wrapper
                     around the injected snapshotDistributionCommand, never
                     a second command and never anything this file
                     orchestrates itself. See that function's own comment,
                     above.

                     0.9.144 — discoverSnapshotCommand, WorldEncounterCanvas's
                     own new prop, bound to this file's own
                     discoverOwnSnapshot() — the SAME function already bound
                     to OwnPublicationPanel's own discoverSnapshotCommand
                     prop above, reused verbatim rather than forked; see
                     that function's own comment for why. WorldEncounterCanvas
                     now owns the entire Snapshot Discovery/Attribution
                     trigger and result panel for a selected World Encounter,
                     exactly the way it already owns Snapshot Distribution's
                     own.

                     0.9.291 — getPublicationCommentariesCommand/
                     addPublicationCommentaryCommand, two new
                     WorldEncounterCanvas props, bound to the EXACT SAME
                     function instances already bound to OwnPublicationPanel's
                     own identically-named props, immediately below (0.9.248)
                     — no wrapper, no second composition. See this file's
                     own setup()-level getPublicationCommentariesCommand()/
                     addPublicationCommentaryCommand() comment, above, and
                     WorldEncounterCanvas.js's own "0.9.291" header for why
                     reusing THESE, rather than the app-wide ones
                     application/CreatePublicationCommentaryUseCase.js
                     (0.9.289) composes, was preferred. viewerIdentityId is
                     the SAME myIdentityId already bound to OwnPublicationPanel's
                     own identical prop, one section below. -->
                <CollapsibleSection
                    title="World Encounters"
                    :collapsed="nearbySectionsCollapsed.worldEncounters"
                    @toggle="setNearbySectionCollapsed('worldEncounters', WORLD_ENCOUNTERS_SECTION, $event)"
                >
                    <WorldEncounterCanvas
                        :discoveryCommand="discoverWorldEncounterPublicationCommand"
                        :registry="worldDiscoverySourceRegistry"
                        :materialSources="worldEncounterMaterialSources"
                        :materialVerifier="worldEncounterMaterialVerifier"
                        :distributionLifecycleStore="publicationDistributionLifecycleStore"
                        :distributionCommand="distributeWorldEncounterPublication"
                        :snapshotDistributionCommand="distributeWorldEncounterSnapshot"
                        :discoverSnapshotCommand="discoverOwnSnapshot"
                        :worldDiscoveryLeadRegistry="worldDiscoveryLeadRegistry"
                        :getPublicationCommentariesCommand="getPublicationCommentariesCommand"
                        :addPublicationCommentaryCommand="addPublicationCommentaryCommand"
                        :viewerIdentityId="myIdentityId"
                        :defaultDiscoveryTag="publicationDiscoveryTag"
                    />
                </CollapsibleSection>
            </div>
                <!-- 0.2.99 — World Collaboration UX. Deliberately
                     subtle, exactly like the compass above: the World
                     itself stays visually dominant. Both the indicator
                     and the explicit "Members" button open the SAME
                     panel — see docs/Principles.md, "The UI Displays
                     Authorization; It Never Decides It (0.2.99)." -->
                <div v-if="activeDocumentInfo" class="world-view-actions world-view-actions--collaboration">
                    <WorldPresenceIndicator :online-count="worldOnlineCount" @open="openMembersPanel" />
                    <button class="action-btn" @click="openMembersPanel">Members</button>
                </div>

                <!-- 0.3.0 — Collaborative Spatial Presence. The 2D
                     counterpart to renderer/RemoteSpatialPresenceRenderer.js's
                     own in-scene markers — see
                     ui/components/WorldCollaboratorIndicator.js's own
                     header. -->
                <WorldCollaboratorIndicator v-if="activeDocumentInfo" :rows="spatialCollaboratorRows" @follow="followCollaborator" />
                <!-- 0.2.29: browse the world by camera position, without
                     already knowing a document's name or typing raw
                     coordinates — see docs/Principles.md, "Exploring A
                     Location Is Not A Second Search." Explore Here uses
                     a configurable neighborhood; What's Here? uses a
                     small fixed tolerance for "essentially right here." -->
                <div v-if="cameraPosition" class="world-view-actions world-view-actions--explore">
                    <button class="action-btn" @click="exploreHere">Explore Here</button>
                    <button class="action-btn" @click="whatsHere">What's Here?</button>
                </div>
                <p class="world-view-hint">
                    Drag to orbit • Scroll to zoom • Home to reset • Ctrl/Cmd+K command palette • Click to inspect / place<template v-if="avatarControlMode"> • WASD to walk • Shift to run • Space to jump</template>
                </p>

                <!-- 0.2.35: a pure client rendering preference — see
                     docs/Principles.md.

                     0.2.36 adds Control My Avatar / Follow Avatar —
                     both explicit, off-by-default toggles (never
                     implied by focus or hovering the viewport), so
                     nothing here can accidentally hijack keyboard
                     input the rest of World View still needs.

                     0.2.37 makes "Show Other Avatars" real — a pure
                     rendering preference exactly like "Show My
                     Avatar," deliberately NOT disabled by
                     hasLocalAvatar: seeing other replicas' avatars
                     never requires having your own. -->
                <div class="world-view-section world-view-section--avatar">
                    <h4>Avatar</h4>
                    <label class="world-view-avatar-toggle">
                        <input
                            type="checkbox"
                            :checked="showMyAvatar"
                            :disabled="!hasLocalAvatar"
                            @change="toggleShowMyAvatar($event)"
                        />
                        Show My Avatar
                    </label>
                    <label class="world-view-avatar-toggle">
                        <input
                            type="checkbox"
                            :checked="showOtherAvatars"
                            @change="toggleShowOtherAvatars($event)"
                        />
                        Show Other Avatars
                    </label>
                    <!-- 0.2.38: unobtrusive presence diagnostics —
                         never rendered ON an avatar itself, only here,
                         as a summary. Rendering presence and trusting
                         presence stay visibly separate surfaces. -->
                    <p v-if="showOtherAvatars && remoteAvatarDiagnostics.total > 0" class="world-view-avatar-diagnostics">
                        Other Avatars: {{ remoteAvatarDiagnostics.total }}
                        <span class="world-view-avatar-diagnostics-detail">
                            (<template v-if="remoteAvatarDiagnostics.trusted">{{ remoteAvatarDiagnostics.trusted }} trusted</template><template v-if="remoteAvatarDiagnostics.stale">{{ remoteAvatarDiagnostics.trusted ? ', ' : '' }}{{ remoteAvatarDiagnostics.stale }} stale</template><template v-if="remoteAvatarDiagnostics.conflicting">{{ (remoteAvatarDiagnostics.trusted || remoteAvatarDiagnostics.stale) ? ', ' : '' }}{{ remoteAvatarDiagnostics.conflicting }} conflicting</template><template v-if="remoteAvatarDiagnostics.unavailable">{{ (remoteAvatarDiagnostics.trusted || remoteAvatarDiagnostics.stale || remoteAvatarDiagnostics.conflicting) ? ', ' : '' }}{{ remoteAvatarDiagnostics.unavailable }} unavailable</template>)
                        </span>
                    </p>
                    <!-- 0.2.43: "who is near me" — a derived, local,
                         geometric fact, never announced. Shown only
                         alongside Show Other Avatars, the same gate
                         the diagnostics summary above already uses —
                         proximity is a view over the same trusted
                         remote-presence state, not a separate feed. -->
                    <NearbyAvatarsPanel
                        v-if="showOtherAvatars"
                        :entries="nearbyAvatars"
                        @select="selectNearbyAvatar"
                    />
                    <label class="world-view-avatar-toggle">
                        <input
                            type="checkbox"
                            :checked="avatarControlMode"
                            :disabled="!hasLocalAvatar"
                            @change="toggleAvatarControlMode($event)"
                        />
                        Control My Avatar (WASD, Shift, Space)
                    </label>
                    <label class="world-view-avatar-toggle">
                        <input
                            type="checkbox"
                            :checked="followAvatar"
                            :disabled="!hasLocalAvatar"
                            @change="toggleFollowAvatar($event)"
                        />
                        Follow Avatar
                    </label>
                    <p v-if="!hasLocalAvatar" class="form-hint form-hint--neutral">
                        Log in and create an avatar (My Avatar) to appear here.
                    </p>
                    <!-- 0.3.2 — Camera Perspective: a fixed offset
                         around the local avatar (eye height, behind-
                         and-above, straight overhead), never a second
                         camera-movement mechanism — see
                         core/CameraPerspective.js. Clicking the
                         already-active button clears back to "Free,"
                         the ordinary orbit camera. Purely local; never
                         shared with a collaborator. -->
                    <div class="world-view-camera-perspective">
                        <span class="world-view-camera-perspective-label">Camera</span>
                        <div class="world-view-camera-perspective-buttons">
                            <button
                                type="button"
                                class="action-btn"
                                :class="{ 'action-btn--active': !cameraPerspective }"
                                :disabled="!hasLocalAvatar"
                                @click="setCameraPerspective(null)"
                            >Free</button>
                            <button
                                type="button"
                                class="action-btn"
                                :class="{ 'action-btn--active': cameraPerspective === CameraPerspective.FIRST_PERSON }"
                                :disabled="!hasLocalAvatar"
                                @click="setCameraPerspective(CameraPerspective.FIRST_PERSON)"
                            >First Person</button>
                            <button
                                type="button"
                                class="action-btn"
                                :class="{ 'action-btn--active': cameraPerspective === CameraPerspective.THIRD_PERSON }"
                                :disabled="!hasLocalAvatar"
                                @click="setCameraPerspective(CameraPerspective.THIRD_PERSON)"
                            >Third Person</button>
                            <button
                                type="button"
                                class="action-btn"
                                :class="{ 'action-btn--active': cameraPerspective === CameraPerspective.BIRD_EYE }"
                                :disabled="!hasLocalAvatar"
                                @click="setCameraPerspective(CameraPerspective.BIRD_EYE)"
                            >Bird's-Eye</button>
                        </div>
                    </div>
                </div>

                <div class="world-view-section world-view-section--search">
                    <h4>Search</h4>
                    <WorldSearchPanel
                        :results="searchResults"
                        :catalog-empty="catalogEmpty"
                        @search="performSearch"
                        @focus="focusSearchResult"
                    />
                </div>

                <div v-if="spatialHover" class="spatial-panel spatial-panel--hover">
                    <h4>Hover</h4>
                    <p class="spatial-type">{{ spatialHover.type }}</p>
                    <p v-if="spatialHover.worldTitle" class="spatial-world">
                        World: {{ spatialHover.worldTitle }}
                        <span class="spatial-author">by {{ spatialHover.worldAuthor }}</span>
                    </p>
                    <p v-if="spatialHover.brickId" class="spatial-id">
                        Brick: {{ spatialHover.brickId.slice(0, 8) }}…
                    </p>
                    <p v-if="spatialHover.position" class="spatial-pos">
                        {{ spatialHover.position.x.toFixed(2) }},
                        {{ spatialHover.position.y.toFixed(2) }},
                        {{ spatialHover.position.z.toFixed(2) }}
                    </p>
                </div>

                <div v-if="spatialInspection" class="spatial-panel spatial-panel--inspection">
                    <h4>Inspection</h4>
                    <p class="spatial-type">{{ spatialInspection.type }}</p>
                    <div v-if="spatialInspection.type === 'brick'" class="inspection-fields">
                        <div class="inspection-row">
                            <span class="inspection-label">Type</span>
                            <span class="inspection-value">{{ spatialInspection.brickType }}</span>
                        </div>
                        <div class="inspection-row">
                            <span class="inspection-label">ID</span>
                            <span class="inspection-value">{{ spatialInspection.brickId.slice(0, 8) }}…</span>
                        </div>
                        <div class="inspection-row">
                            <span class="inspection-label">Local Pos</span>
                            <span class="inspection-value">
                                {{ spatialInspection.localPosition.x.toFixed(2) }},
                                {{ spatialInspection.localPosition.y.toFixed(2) }},
                                {{ spatialInspection.localPosition.z.toFixed(2) }}
                            </span>
                        </div>
                        <div class="inspection-row">
                            <span class="inspection-label">World Pos</span>
                            <span class="inspection-value">
                                {{ spatialInspection.worldPosition.x.toFixed(2) }},
                                {{ spatialInspection.worldPosition.y.toFixed(2) }},
                                {{ spatialInspection.worldPosition.z.toFixed(2) }}
                            </span>
                        </div>
                        <div class="inspection-row">
                            <span class="inspection-label">Rotation</span>
                            <span class="inspection-value">{{ spatialInspection.rotation }}°</span>
                        </div>
                        <div class="inspection-row">
                            <span class="inspection-label">Building</span>
                            <span class="inspection-value">{{ spatialInspection.buildingId.slice(0, 8) }}… ({{ spatialInspection.buildingBrickCount }} bricks)</span>
                        </div>
                        <div class="inspection-row">
                            <span class="inspection-label">World</span>
                            <span class="inspection-value">{{ spatialInspection.worldTitle }}</span>
                        </div>
                        <div class="inspection-row">
                            <span class="inspection-label">Author</span>
                            <span class="inspection-value">{{ spatialInspection.worldAuthor }}</span>
                        </div>
                    </div>
                    <div v-if="spatialInspection.type === 'ground'" class="inspection-fields">
                        <div class="inspection-row">
                            <span class="inspection-label">Position</span>
                            <span class="inspection-value">
                                {{ spatialInspection.position.x.toFixed(2) }},
                                {{ spatialInspection.position.y.toFixed(2) }},
                                {{ spatialInspection.position.z.toFixed(2) }}
                            </span>
                        </div>
                        <div class="inspection-row">
                            <span class="inspection-label">World</span>
                            <span class="inspection-value">{{ spatialInspection.worldTitle }}</span>
                        </div>
                        <div class="inspection-row">
                            <span class="inspection-label">Author</span>
                            <span class="inspection-value">{{ spatialInspection.worldAuthor }}</span>
                        </div>
                    </div>
                    <!-- 0.2.93 — World View Instance Inspection. Every
                         field here is read-only display: no input, no
                         gizmo, no numeric target. The one action is
                         "Open Source" below, which leaves World View
                         entirely and opens the Editor's own,
                         already-established Load path — see
                         application/SpatialInspectionService.js's own
                         comment on why this is the ENTIRE World View
                         surface for a placed instance. -->
                    <div v-if="spatialInspection.type === 'placement'" class="inspection-fields">
                        <div class="inspection-row">
                            <span class="inspection-label">Source</span>
                            <span class="inspection-value">{{ spatialInspection.sourceTitle }}</span>
                        </div>
                        <div class="inspection-row">
                            <span class="inspection-label">Local Pos</span>
                            <span class="inspection-value">
                                {{ spatialInspection.localPosition.x.toFixed(2) }},
                                {{ spatialInspection.localPosition.y.toFixed(2) }},
                                {{ spatialInspection.localPosition.z.toFixed(2) }}
                            </span>
                        </div>
                        <div class="inspection-row">
                            <span class="inspection-label">World Pos</span>
                            <span class="inspection-value">
                                {{ spatialInspection.worldPosition.x.toFixed(2) }},
                                {{ spatialInspection.worldPosition.y.toFixed(2) }},
                                {{ spatialInspection.worldPosition.z.toFixed(2) }}
                            </span>
                        </div>
                        <div class="inspection-row">
                            <span class="inspection-label">Rotation</span>
                            <span class="inspection-value">{{ spatialInspection.rotation }}°</span>
                        </div>
                        <div class="inspection-row">
                            <span class="inspection-label">Ground Y</span>
                            <span class="inspection-value">{{ spatialInspection.groundY.toFixed(2) }}</span>
                        </div>
                        <div class="inspection-row">
                            <span class="inspection-label">World</span>
                            <span class="inspection-value">{{ spatialInspection.worldTitle }}</span>
                        </div>
                        <div class="inspection-row">
                            <span class="inspection-label">Author</span>
                            <span class="inspection-value">{{ spatialInspection.worldAuthor }}</span>
                        </div>
                    </div>
                    <div class="inspection-actions">
                        <button
                            v-if="spatialInspection.documentId"
                            class="action-btn action-btn--explore"
                            @click="focusWorld(spatialInspection.documentId)"
                        >
                            Focus World
                        </button>
                        <button
                            v-if="spatialInspection.type === 'brick'"
                            class="action-btn action-btn--primary"
                            @click="focusSelection"
                        >
                            Focus Brick
                        </button>
                        <button
                            v-if="spatialInspection.type === 'placement'"
                            class="action-btn action-btn--primary"
                            title="Open the referenced Document in the Editor"
                            @click="openStructureSource(spatialInspection.sourceDocumentId)"
                        >
                            Open Source
                        </button>
                        <button
                            v-if="spatialInspection.documentId"
                            class="action-btn"
                            title="Fork this Document and open the copy in the Editor"
                            @click="editInspectedCopy(spatialInspection)"
                        >
                            Edit a Copy
                        </button>
                    </div>
                </div>

                <DocumentInfoPanel
                    v-if="documentInfo"
                    :info="documentInfo"
                    @edit-metadata="openMetadataEditor(documentInfo)"
                />
                <PlacementInfoPanel
                    v-if="placementInfo"
                    :info="placementInfo"
                    @focus="focusWorld(placementInfo.documentId)"
                    @move="openPlacementEditor(placementInfo)"
                    @remove="removePlacementFromPanel(placementInfo)"
                    @view-here="openLocationDocuments(placementInfo.position)"
                />
                <AvatarInfoPanel
                    v-if="avatarInfo"
                    :info="avatarInfo"
                    :following="followedRemoteAvatarId === avatarInfo.avatarId"
                    @follow="followAvatarFromPanel(avatarInfo.avatarId)"
                    @stop-follow="stopFollowingAvatarFromPanel"
                    @interact="performAvatarInteraction"
                />

                <div v-if="failedWorlds.length > 0" class="world-view-section world-view-section--error">
                    <h4>Unavailable ({{ failedWorlds.length }})</h4>
                    <ul class="world-list world-list--failed">
                        <li v-for="w in failedWorlds" :key="w.documentId" class="world-item world-item--failed">
                            <span class="world-item-title">{{ w.title }}</span>
                            <span class="world-item-author">{{ w.author }}</span>
                        </li>
                    </ul>
                </div>

                <div v-if="loadedWorlds.length > 0" class="world-view-section">
                    <h4>Worlds in View ({{ loadedWorlds.length }})</h4>
                    <ul class="world-list world-list--loaded">
                        <li
                            v-for="w in loadedWorlds"
                            :key="w.documentId"
                            :class="['world-item', { 'world-item--current': w.documentId === $route.params.documentId }]"
                        >
                            <span class="world-item-title">{{ w.title }}</span>
                            <span class="world-item-author">{{ w.author }}</span>
                        </li>
                    </ul>
                </div>

                <div v-if="nearbyWorlds.length > 0" class="world-view-section">
                    <h4>Nearby Worlds</h4>
                    <ul class="world-list world-list--nearby">
                        <li
                            v-for="w in nearbyWorlds"
                            :key="w.documentId"
                            class="world-item world-item--clickable"
                            @click="focusWorld(w.documentId)"
                        >
                            <span class="world-item-title">{{ w.title }}</span>
                            <span class="world-item-author">{{ w.author }}</span>
                        </li>
                    </ul>
                </div>
              </div>
            </div>
            <div ref="viewport" class="world-viewport"></div>
            <ActionFeedback :message="feedbackMessage" :visible="feedbackVisible" />
            <!-- 0.9.98 — Vehicle Mount/Dismount World View Integration.
                 Purely presentational — see VehicleInteractionPrompt.js's
                 own header for why it never decides mount/dismount
                 eligibility itself. -->
            <VehicleInteractionPrompt :state="vehicleInteractionState" />
            <MetadataEditorDialog
                v-if="showMetadataEditor"
                :info="metadataEditTarget"
                @save="onSaveMetadata"
                @cancel="showMetadataEditor = false; metadataEditTarget = null"
            />
            <HistoryTimelinePanel
                v-if="showHistoryPanel"
                :timeline="historyTimeline"
                :selected-entry-id="selectedHistoryEntryId"
                :preview-cursor="historyPreviewCursor"
                @select="selectHistoryEntry"
                @preview="previewSelectedHistoryEntry"
                @cancel-preview="cancelHistoryPreviewAction"
                @restore="restoreSelectedHistoryEntry"
                @cancel="closeHistoryPanel"
            />
            <PlacementEditorDialog
                v-if="showPlacementEditor"
                :info="placementEditTarget"
                :overlap-warning="placementOverlapWarning"
                @move="onMovePlacement"
                @cancel="closePlacementEditor"
            />
            <LocationDocumentsDialog
                v-if="showLocationDocuments"
                :position="locationDocumentsPosition"
                :occupants="locationDocumentsOccupants"
                @focus="focusLocationDocument"
                @cancel="closeLocationDocuments"
            />
            <WorldLocationBrowser
                v-if="showLocationBrowser"
                :center="locationBrowserCenter"
                :radius="locationBrowserRadius"
                :documents="locationBrowserDocuments"
                :diagnostics="locationBrowserDiagnostics"
                :inspected="locationBrowserInspected"
                :catalog-empty="catalogEmpty"
                @explore="reExploreLocationBrowser"
                @focus="focusLocationBrowserResult"
                @select="selectLocationBrowserResult"
                @inspect="inspectLocationBrowserResult"
                @cancel="closeLocationBrowser"
            />
            <LocationsPanel
                v-if="showLocationsPanel"
                :locations="worldLocations"
                :can-edit="canEditActiveWorld"
                @focus="focusLocationFromPanel"
                @inspect="openFocusForLocation"
                @cancel="closeLocationsPanel"
                @add-landmark="openAddLandmarkForm"
                @edit-landmark="openEditLandmarkForm"
                @remove-landmark="removeLandmarkFromPanel"
                @add-region="openAddRegionForm"
                @edit-region="openEditRegionForm"
                @remove-region="removeRegionFromPanel"
                @manage-names="openNamingPanel"
            />
            <LandmarkFormModal
                v-if="showLandmarkForm"
                :landmark="landmarkFormTarget"
                @save="onSaveLandmarkForm"
                @cancel="closeLandmarkForm"
            />
            <RegionFormModal
                v-if="showRegionForm"
                :region="regionFormTarget"
                @save="onSaveRegionForm"
                @cancel="closeRegionForm"
            />
            <PlaceNamingPanel
                v-if="showNamingPanel"
                :region-id="namingPanelRegionId"
                :region-name="(worldLocations.find(l => l.id === namingPanelRegionId) || {}).title || ''"
                :naming-view="namingPanelView"
                :claims="namingPanelClaims"
                :preferred-name="namingPanelPreferredName"
                :geographic-regions="namingPanelGeographicRegions"
                :geographic-naming-view="namingPanelGeographicView"
                :my-identity-id="myIdentityId"
                :can-publish-to-nostr="canPublishPlaceNamingClaimToNostr"
                :publish-to-nostr-claim-id="namingPanelPublishToNostrClaimId"
                :publish-to-nostr-executing="namingPanelPublishToNostrExecuting"
                :publish-to-nostr-error="namingPanelPublishToNostrError"
                :publish-to-nostr-result="namingPanelPublishToNostrResult"
                @publish-name="publishNamingClaim"
                @retract-name="retractNamingClaim"
                @set-preferred-name="setPreferredNamingName"
                @clear-preferred-name="clearPreferredNamingName"
                @export-claim="exportNamingClaim"
                @import-claim="importNamingClaim"
                @publish-to-nostr="publishNamingClaimToNostr"
                @cancel="closeNamingPanel"
            />
            <WorldMapPanel
                v-if="showMapPanel"
                :content="mapContent"
                :highlight-region-keys="mapHighlightRegionKeys"
                @focus-location="focusLocationFromMap"
                @focus-collaborator="focusCollaboratorFromMap"
                @cancel="closeMapPanel"
            />
            <GeographicPlaceDirectoryPanel
                v-if="showGeographicPlaceDirectory"
                :places="geographicPlaces"
                :nearby="nearbyGeographicPlaces"
                @open-place="openGeographicPlace"
                @go-to-place="goToGeographicPlace"
                @cancel="closeGeographicPlaceDirectory"
            />
            <GeographicPlacePanel
                v-if="showGeographicPlacePanel"
                :place="geographicPlace"
                @focus-region="focusRegionFromPlace"
                @open-names="openNamesFromPlace"
                @show-on-map="showGeographicPlaceOnMap"
                @go-to-place="goToGeographicPlace(geographicPlace.fingerprintKey)"
                @cancel="goBackInPlaces"
            />
            <WorldWelcomePanel
                v-if="showWelcomePanel"
                :context="welcomeContext"
                :is-arrival="welcomeIsArrival"
                :returning="welcomeIsReturning"
                :last-visited-at="worldReturnInfo && worldReturnInfo.lastVisitedAt"
                @explore="exploreWelcomeSuggestion"
                @go-to-place="goToGeographicPlace"
                @dismiss="closeWelcomePanel"
            />
            <WorldFocusPanel
                v-if="showFocusPanel"
                :context="focusContext"
                @go="goFromFocusPanel"
                @show-on-map="showFocusOnMap"
                @open-names="openNamesFromFocusPanel"
                @edit-copy="editFocusedCopyFromFocusPanel"
                @cancel="closeFocusPanel"
            />
            <WorldMembersPanel
                v-if="showMembersPanel"
                :roster="worldCollaborationRoster"
                :is-owner="isActiveWorldOwner"
                :pending-identity-id="collaborationPendingIdentityId"
                @grant="grantWorldMember"
                @revoke="revokeWorldMember"
                @cancel="closeMembersPanel"
            />
            <NotificationHistoryPanel
                v-if="showNotificationHistoryPanel"
                :getRecipientNotificationEventsCommand="getRecipientNotificationEventsCommand"
                @cancel="closeNotificationHistoryPanel"
            />
            <!-- 0.2.94/0.3.6 — Navigation HUD: camera coordinates
                 and compass as a floating overlay on the main
                 viewport, positioned at top-right below Logout button.
                 Transparent background ensures the World scenery
                 remains dominant. Now includes contextual location
                 description, nearby structures, and collaborator markers. -->
            <div v-if="cameraPosition" class="world-view-nav-hud">
                <p class="world-view-nav-hud-coords">
                    {{ cameraPosition.x.toFixed(1) }}, {{ cameraPosition.y.toFixed(1) }}, {{ cameraPosition.z.toFixed(1) }}
                </p>
                <div class="world-view-nav-hud-compass">
                    <!-- 0.3.6 — contextual markers rendered ON the dial
                         itself, at each nearby structure's/collaborator's
                         own compass direction. -->
                    <CompassIndicator :heading="compassHeading" :markers="compassMarkers" />
                </div>
                <!-- 0.5.0 — the human-named place breadcrumb, e.g.
                     "Willow Village · Green Valley", shown ABOVE the
                     derived terrain description below (never merged
                     with it — see docs/Principles.md, "Users Name
                     Places; The World Derives Geography From Names
                     (0.5.0)"). -->
                <div v-if="spatialContext && spatialContext.placeName" class="world-view-nav-context world-view-nav-context--place">
                    {{ spatialContext.placeName }}
                </div>
                <!-- 0.3.6 — Contextual location description -->
                <div v-if="spatialContext && spatialContext.description" class="world-view-nav-context">
                    {{ spatialContext.description }}
                </div>
                <!-- 0.3.6 — readable legend for the same markers shown on
                     the compass above (a 36px dial has no room for
                     labels) -->
                <div v-if="spatialContext && spatialContext.nearbyStructures && spatialContext.nearbyStructures.length > 0" class="world-view-nav-markers">
                    <div v-for="structure in spatialContext.nearbyStructures.slice(0, 3)" :key="structure.id" class="world-view-nav-marker">
                        <span class="marker-direction">{{ structure.direction }}</span>
                        <span class="marker-label">{{ structure.title }} ({{ structure.distance }}m)</span>
                    </div>
                </div>
                <div v-if="spatialContext && spatialContext.nearbyCollaborators && spatialContext.nearbyCollaborators.length > 0" class="world-view-nav-markers">
                    <div v-for="collab in spatialContext.nearbyCollaborators.slice(0, 3)" :key="collab.identityId" class="world-view-nav-marker collaborator">
                        <span class="marker-direction">{{ collab.direction }}</span>
                        <span class="marker-label">{{ collab.displayName }} ({{ collab.distance }}m)</span>
                    </div>
                </div>
                <!-- 0.3.7 — same legend treatment for nearby landmarks. -->
                <div v-if="spatialContext && spatialContext.nearbyLandmarks && spatialContext.nearbyLandmarks.length > 0" class="world-view-nav-markers">
                    <div v-for="landmark in spatialContext.nearbyLandmarks.slice(0, 3)" :key="landmark.id" class="world-view-nav-marker landmark">
                        <span class="marker-direction">{{ landmark.direction }}</span>
                        <span class="marker-label">★ {{ landmark.title }} ({{ landmark.distance }}m)</span>
                    </div>
                </div>
                <!-- 0.5.6 — same legend treatment for nearby geographic
                     place candidates, its own much larger radius (see
                     core/GeographicPlaceNavigation.js#
                     DEFAULT_NEARBY_GEOGRAPHIC_PLACE_RADIUS). -->
                <div v-if="nearbyGeographicPlaces && nearbyGeographicPlaces.length > 0" class="world-view-nav-markers">
                    <div v-for="place in nearbyGeographicPlaces.slice(0, 3)" :key="place.fingerprintKey" class="world-view-nav-marker place">
                        <span class="marker-direction">{{ place.direction }}</span>
                        <span class="marker-label">⬢ {{ place.displayName }} ({{ place.distance }}m)</span>
                    </div>
                </div>
            </div>
        </div>
    `
};

// 0.3.6 — World Discovery & Exploration. Styles for contextual location descriptions and markers.
const style = document.createElement('style');
style.textContent = `
    .world-view-nav-context {
        font-size: 0.75rem;
        color: #a0aec0;
        margin-top: 0.25rem;
        padding-top: 0.25rem;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
    }
    
    .world-view-nav-markers {
        margin-top: 0.5rem;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }
    
    .world-view-nav-marker {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.7rem;
        color: #f6e05e;
    }
    
    .world-view-nav-marker.collaborator {
        color: #81e6d9;
    }

    .world-view-nav-marker.landmark {
        color: #f687b3;
    }

    .marker-direction {
        font-weight: bold;
        min-width: 1.5rem;
        text-align: center;
    }
    
    .marker-label {
        opacity: 0.9;
    }
`;
document.head.appendChild(style);
