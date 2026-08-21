import { ref, computed, onMounted, onBeforeUnmount, inject } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { CreateBrickRegistryUseCase } from '../../application/CreateBrickRegistryUseCase.js';
import { CreateWorldViewUseCase } from '../../application/CreateWorldViewUseCase.js';
import { CreateDiscoveryUseCase } from '../../application/CreateDiscoveryUseCase.js';
import { EditorActionRegistry, createStandardActions } from '../../application/EditorActionRegistry.js';
import { EditorActionContext } from '../../application/EditorActionContext.js';
import { InputRouter } from '../../application/InputRouter.js';
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
        AvatarInfoPanel, NearbyAvatarsPanel
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
        const registry = new CreateBrickRegistryUseCase().execute();
        const worldViewFactory = new CreateWorldViewUseCase().execute(identityUseCase.provider, {
            peerMessageBus,
            connectedPeerRegistry: peerSessionManager ? peerSessionManager.registry : null,
            friendRelationshipUseCase,
            peerBlockUseCase
        });
        const session = worldViewFactory.createSession(registry);
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
        const avatarControlMode = ref(false);
        const followAvatar = ref(false);
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
        function onWindowBlur() {
            if (avatarControlMode.value) {
                session.setAvatarControlMode(false);
                avatarControlMode.value = false;
            }
        }

        onMounted(() => {
            allPublications.value = listPublicationsUseCase.execute();
            session.start(viewport.value);
            session.navigateToDocument(initialDocumentId);
            refreshSpatialUI();
            hasLocalAvatar.value = session.hasLocalAvatar();

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
        });

        onBeforeUnmount(() => {
            clearInterval(spatialInterval);
            if (feedbackTimer) {
                clearTimeout(feedbackTimer);
            }
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onAvatarKeyUp);
            window.removeEventListener('blur', onWindowBlur);
            viewport.value.removeEventListener('pointerup', onPointerUp);
            viewport.value.removeEventListener('pointermove', onPointerMove);
            viewport.value.removeEventListener('pointerdown', onPointerDown);
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
                <p v-if="cameraPosition" class="world-view-coords">
                    Cam: {{ cameraPosition.x.toFixed(1) }}, {{ cameraPosition.y.toFixed(1) }}, {{ cameraPosition.z.toFixed(1) }}
                </p>
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
        </div>
    `
};
