import { ref, computed, onMounted, onBeforeUnmount, inject } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { CreateBrickRegistryUseCase } from '../../application/CreateBrickRegistryUseCase.js';
import { CreateWorldViewUseCase } from '../../application/CreateWorldViewUseCase.js';
import { CreateDiscoveryUseCase } from '../../application/CreateDiscoveryUseCase.js';
import { EditorActionRegistry, createStandardActions } from '../../application/EditorActionRegistry.js';
import { EditorActionContext } from '../../application/EditorActionContext.js';
import { InputRouter } from '../../application/InputRouter.js';
import { WorldSpatialContextService } from '../../application/WorldSpatialContextService.js';
import EditingSidebar from '../components/EditingSidebar.js';
import CommandPalette from '../components/CommandPalette.js';
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
import { CameraPerspective } from '../../core/CameraPerspective.js';
import { geographicPlaceLocationId } from '../../core/GeographicPlaceNavigation.js';
import { WorldViewNavigationState, WorldViewPrimaryMode } from '../../application/WorldViewNavigationState.js';

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

// 0.1.50: the World View joins the consolidated command surface.
// Editing shortcuts now come from the SAME EditorActionRegistry the
// Editor uses — parity by construction. Escape priority: text input >
// palette > gizmo gesture > placement mode > selection. The overlay
// gains the consolidated EditingSidebar; hover/inspection/placement
// panels are unchanged.
export default {
    name: 'WorldView',
    components: {
        EditingSidebar, CommandPalette, ActionFeedback,
        DocumentInfoPanel, MetadataEditorDialog,
        PlacementInfoPanel, PlacementEditorDialog,
        WorldSearchPanel, LocationDocumentsDialog, WorldLocationBrowser,
        AvatarInfoPanel, NearbyAvatarsPanel,
        CompassIndicator, LocationsPanel, LandmarkFormModal, RegionFormModal,
        WorldMembersPanel, WorldPresenceIndicator, WorldCollaboratorIndicator,
        WorldWelcomePanel, WorldMapPanel, PlaceNamingPanel,
        GeographicPlaceDirectoryPanel, GeographicPlacePanel, CollapsibleSection
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
        const spatialEditingContext = ref(null);
        const spatialPlacement = ref(null);
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
        const availableDefinitions = ref([]);
        const selectedDefinitionId = ref(null);
        const activeTool = ref('select');
        const paletteOpen = ref(false);
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
        const registry = new CreateBrickRegistryUseCase().execute();
        const worldViewFactory = new CreateWorldViewUseCase().execute(identityUseCase.provider, {
            peerMessageBus,
            connectedPeerRegistry: peerSessionManager ? peerSessionManager.registry : null,
            friendRelationshipUseCase,
            peerBlockUseCase,
            deviceAuthorizationPropagationUseCase: deviceAuthorizationUseCase
        });
        const session = worldViewFactory.createSession(registry);
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
        const { listPublicationsUseCase } = new CreateDiscoveryUseCase().execute();
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

        availableDefinitions.value = registry.getAll();
        if (availableDefinitions.value.length > 0) {
            selectedDefinitionId.value = availableDefinitions.value[0].id;
        }

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
        const actionUi = {
            togglePalette() {
                paletteOpen.value = !paletteOpen.value;
            },
            focusNumeric: null
        };
        const actionRegistry = new EditorActionRegistry(
            createStandardActions({ session, feedback, ui: actionUi })
        );
        const getActionContext = () => EditorActionContext.capture({
            session,
            selectionCount: spatialSelection.value ? spatialSelection.value.count : 0,
            paletteOpen: paletteOpen.value,
            activeTool: activeTool.value
        });
        function closePalette() {
            paletteOpen.value = false;
        }

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

        function alignSelection(mode) {
            guarded(() => session.alignSelection(mode));
            refreshSpatialUI();
        }

        function distributeSelection(axis) {
            guarded(() => session.distributeSelection(axis));
            refreshSpatialUI();
        }

        function applyNumericTransform(intent, options) {
            guarded(() => session.applyNumericTransform(intent, options));
            refreshSpatialUI();
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

        // -----------------------------------------------------------------
        // Tool switching
        // -----------------------------------------------------------------

        function setTool(tool) {
            activeTool.value = tool;
            if (tool === 'place') {
                if (selectedDefinitionId.value) {
                    session.setActiveDefinitionId(selectedDefinitionId.value);
                }
            } else {
                session.cancelPlacement();
            }
            refreshSpatialUI();
        }

        function onBrickSelectionChange() {
            if (activeTool.value === 'place' && selectedDefinitionId.value) {
                session.setActiveDefinitionId(selectedDefinitionId.value);
            }
        }

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

            const editingCtx = session.getSpatialEditingContext();
            if (editingCtx && !editingCtx.isEmpty) {
                spatialEditingContext.value = {
                    type: editingCtx.type,
                    capabilities: editingCtx.capabilities
                };
            } else {
                spatialEditingContext.value = null;
            }

            const placement = session.getSpatialPlacement();
            if (placement && placement.valid) {
                spatialPlacement.value = {
                    valid: placement.valid,
                    definitionId: placement.definitionId,
                    position: placement.position,
                    rotation: placement.rotation,
                    // 0.2.87 — "occupied" per PlacementValidator, distinct
                    // from `valid` (which just means a real target was
                    // found at all) — see SpatialPlacementState's own header.
                    blocked: placement.blocked
                };
            } else {
                spatialPlacement.value = null;
            }

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
            activePlacementInfo.value = (activeId && typeof session.getPlacementInfo === 'function')
                ? session.getPlacementInfo(activeId)
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
            unsubscribeWorldMembership = session.onWorldMembershipChanged(presentWorldDocumentId, () => {
                worldMembers.value = session.listWorldMembers(presentWorldDocumentId);
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
        // mutation in this file (alignSelection, onSaveMetadata, ...): a
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
            showNamingPanel.value = true;
        }

        function closeNamingPanel() {
            showNamingPanel.value = false;
            namingPanelRegionId.value = null;
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
        const nearbySectionsCollapsed = ref({
            places: worldViewNav.isSectionCollapsed(NEARBY_PLACES_SECTION, false),
            landmarks: worldViewNav.isSectionCollapsed(NEARBY_LANDMARKS_SECTION, true),
            people: worldViewNav.isSectionCollapsed(NEARBY_PEOPLE_SECTION, true)
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
        // World View performs itself. This is the ONE escape hatch out
        // of World View's otherwise strictly read-only instance
        // inspection (see docs/Principles.md, "Selection In World View
        // Does Not Imply Editing Authority") — editing a placed
        // structure's bricks always happens by opening its Document in
        // the Editor, exactly like application/EditorSession.js#
        // editStructurePlacementSource() already established for the
        // Editor's own StructureInstancePanel.
        function openStructureSource(documentId) {
            if (!documentId) {
                return;
            }
            router.push({ path: '/editor', query: { load: documentId } });
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
        // Pointer interaction (gizmo-first, unchanged since 0.1.46)
        // -----------------------------------------------------------------

        function onPointerDown(event) {
            isDragging = false;
            pointerStart = { x: event.clientX, y: event.clientY };
            if (guarded(() => session.gizmoPointerDown(event))) {
                return;
            }
        }

        function onPointerMove(event) {
            const gizmoResult = session.gizmoPointerMove(event);
            if (gizmoResult.consumed) {
                return;
            }
            if (pointerStart) {
                const dx = event.clientX - pointerStart.x;
                const dy = event.clientY - pointerStart.y;
                if (Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD_PX) {
                    isDragging = true;
                }
            }
            if (event.buttons === 0 && !gizmoResult.hovered) {
                session.hover(event.clientX, event.clientY);
                refreshHoverUI();
            }
            // Update compass heading during camera orbit (when dragging with no buttons pressed after initial drag)
            if (isDragging && event.buttons === 0) {
                compassHeading.value = session.getCompassHeading();
            }
        }

        function onPointerUp(event) {
            const gizmoResult = session.gizmoPointerUp(event);
            if (gizmoResult.consumed) {
                refreshSpatialUI();
                pointerStart = null;
                isDragging = false;
                return;
            }
            if (!isDragging && pointerStart) {
                if (activeTool.value === 'place') {
                    guarded(() => session.commitPlacement());
                    refreshSpatialUI();
                } else {
                    session.pick(event.clientX, event.clientY, { 
                        toggle: event.ctrlKey || event.metaKey, 
                        additive: event.shiftKey 
                    });
                    refreshSpatialUI();
                }
            }
            pointerStart = null;
            isDragging = false;
        }

        // -----------------------------------------------------------------
        // Keyboard interaction — registry-driven (0.1.50)
        // -----------------------------------------------------------------

        function onKeyDown(event) {
            // 1. Text inputs own their keys.
            if (InputRouter.isTextInputTarget(event.target)) {
                if (event.key === 'Escape') {
                    event.target.blur();
                }
                return;
            }
            // 2. An open palette owns the keyboard.
            if (paletteOpen.value) {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    paletteOpen.value = false;
                } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
                    event.preventDefault();
                    paletteOpen.value = false;
                }
                return;
            }
            // 3. An active gizmo gesture owns the keyboard.
            if (session.isGestureActive()) {
                if (session.gizmoKeyDown({ key: event.key })) {
                    refreshSpatialUI();
                }
                return;
            }
            // 3.5. Avatar Control Mode (0.2.36) — only ever consumes
            // W/A/S/D/Shift/Space, and only while explicitly on (see
            // onAvatarKeyDown above); anything else falls through to
            // the tiers below exactly as if control mode were off.
            if (onAvatarKeyDown(event)) {
                return;
            }
            // 4. Placement mode keeps its own Escape (exit placement).
            if (activeTool.value === 'place' && event.key === 'Escape') {
                setTool('select');
                return;
            }
            // 4.5. Placement mode keeps its own Rotate too (0.2.87) —
            // same reasoning as Escape just above: 'R'/'Shift+R' already
            // name Rotate Clockwise/Counter-Clockwise in the registry
            // (transform.rotateClockwise/CounterClockwise), but those
            // are disabled while placing (editingAllowed() checks
            // ctx.placementMode) — and matchShortcut() below resolves a
            // key to its bound action by KEY ALONE, oblivious to
            // enabled(), so falling through to step 5 unchanged would
            // silently swallow the keystroke on a disabled action rather
            // than ever reaching placement. Handled here instead, before
            // the registry ever sees it.
            if (activeTool.value === 'place' && event.key.toLowerCase() === 'r') {
                if (session.rotatePlacementPreview(event.shiftKey ? -90 : 90)) {
                    event.preventDefault();
                    refreshSpatialUI();
                }
                return;
            }
            // 5. Registry-driven editing shortcuts.
            const action = InputRouter.matchShortcut(event, actionRegistry);
            if (action) {
                if (actionRegistry.execute(action.id, getActionContext())) {
                    event.preventDefault();
                    refreshSpatialUI();
                }
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
        // Deliberately separate from onKeyDown's registry-driven
        // shortcut dispatch below: W/A/S/D/Shift/Space are never
        // EditorActionRegistry actions, they only ever mean anything
        // while Avatar Control Mode is explicitly on. Both handlers
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
        });

        onBeforeUnmount(() => {
            clearInterval(spatialInterval);
            clearInterval(spatialPresenceSyncInterval);
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
            showPlacementEditor,
            placementEditTarget,
            placementOverlapWarning,
            openPlacementEditor,
            closePlacementEditor,
            onMovePlacement,
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
            spatialEditingContext,
            spatialPlacement,
            cameraPosition,
            compassHeading,
            spatialContext,
            compassMarkers,
            showLocationsPanel,
            worldLocations,
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
            nearbyLandmarkRows,
            nearbyPeopleRows,
            goToNearbyCollaborator,
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
            availableDefinitions,
            selectedDefinitionId,
            activeTool,
            paletteOpen,
            feedbackMessage,
            feedbackVisible,
            actionRegistry,
            getActionContext,
            actionUi,
            closePalette,
            setTool,
            onBrickSelectionChange,
            focusWorld,
            focusSelection,
            openStructureSource,
            alignSelection,
            distributeSelection,
            applyNumericTransform,
            onSaveMetadata,
            saveActiveDocument,
            publishActiveDocument
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
                </div>
                <div v-if="activePlacementInfo" class="world-view-actions">
                    <button
                        class="action-btn"
                        :disabled="!activePlacementInfo.movable"
                        @click="openPlacementEditor(activePlacementInfo)"
                    >Move Placement</button>
                </div>
                <p v-if="author">by {{ author }}</p>
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
                            @click="goToNearbyCollaborator(person.deviceId)"
                        >Go</button>
                    </div>
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

                <div v-if="spatialHover && activeTool === 'select' && !spatialPlacement" class="spatial-panel spatial-panel--hover">
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

                <div
                    v-if="spatialPlacement"
                    :class="['spatial-panel', 'spatial-panel--placement', { 'spatial-panel--blocked': spatialPlacement.blocked }]"
                >
                    <h4>Placement Preview</h4>
                    <p class="spatial-type">{{ spatialPlacement.definitionId }}</p>
                    <p class="spatial-pos">
                        {{ spatialPlacement.position.x.toFixed(2) }},
                        {{ spatialPlacement.position.y.toFixed(2) }},
                        {{ spatialPlacement.position.z.toFixed(2) }}
                        · {{ spatialPlacement.rotation % 360 }}°
                    </p>
                    <p v-if="spatialPlacement.blocked" class="editing-hint editing-hint--blocked">
                        Occupied — can't place here
                    </p>
                    <p v-else class="editing-hint">Click to place • R to rotate • Escape to switch to Select</p>
                </div>

                <div class="world-view-section">
                    <h4>Tools</h4>
                    <div class="tool-switcher tool-switcher--spatial">
                        <button
                            :class="['tool-btn', { 'tool-btn--active': activeTool === 'select' }]"
                            @click="setTool('select')"
                        >
                            Select
                        </button>
                        <button
                            :class="['tool-btn', { 'tool-btn--active': activeTool === 'place' }]"
                            @click="setTool('place')"
                        >
                            Place
                        </button>
                    </div>
                    <div v-if="activeTool === 'place'" class="placement-controls">
                        <select
                            v-model="selectedDefinitionId"
                            class="placement-select"
                            @change="onBrickSelectionChange"
                        >
                            <option
                                v-for="def in availableDefinitions"
                                :key="def.id"
                                :value="def.id"
                            >
                                {{ def.name }}
                            </option>
                        </select>
                        <p class="placement-hint">
                            Hover over ground or a brick face, R to rotate, then click to place.
                        </p>
                    </div>
                </div>

                <div v-if="activeTool === 'select'" class="world-view-section">
                    <h4>Editing</h4>
                    <EditingSidebar
                        :registry="actionRegistry"
                        :get-context="getActionContext"
                        :ui="actionUi"
                        :selection-count="spatialSelection ? spatialSelection.count : 0"
                        :apply-numeric="applyNumericTransform"
                        :align="alignSelection"
                        :distribute="distributeSelection"
                    />
                </div>

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
            <CommandPalette
                v-if="paletteOpen"
                :registry="actionRegistry"
                :get-context="getActionContext"
                @close="closePalette"
            />
            <ActionFeedback :message="feedbackMessage" :visible="feedbackVisible" />
            <MetadataEditorDialog
                v-if="showMetadataEditor"
                :info="metadataEditTarget"
                @save="onSaveMetadata"
                @cancel="showMetadataEditor = false; metadataEditTarget = null"
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
                @publish-name="publishNamingClaim"
                @retract-name="retractNamingClaim"
                @set-preferred-name="setPreferredNamingName"
                @clear-preferred-name="clearPreferredNamingName"
                @export-claim="exportNamingClaim"
                @import-claim="importNamingClaim"
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
            <WorldMembersPanel
                v-if="showMembersPanel"
                :roster="worldCollaborationRoster"
                :is-owner="isActiveWorldOwner"
                :pending-identity-id="collaborationPendingIdentityId"
                @grant="grantWorldMember"
                @revoke="revokeWorldMember"
                @cancel="closeMembersPanel"
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
