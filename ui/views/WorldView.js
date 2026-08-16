import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
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

const DRAG_THRESHOLD_PX = 6;

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
        WorldSearchPanel, LocationDocumentsDialog
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
        const spatialEditingContext = ref(null);
        const spatialPlacement = ref(null);
        const cameraPosition = ref(null);
        const availableDefinitions = ref([]);
        const selectedDefinitionId = ref(null);
        const activeTool = ref('select');
        const paletteOpen = ref(false);
        const feedbackMessage = ref('');
        const feedbackVisible = ref(false);

        const registry = new CreateBrickRegistryUseCase().execute();
        const worldViewFactory = new CreateWorldViewUseCase().execute();
        const session = worldViewFactory.createSession(registry);
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
                    rotation: placement.rotation
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

        function performSearch(query) {
            searchResults.value = guarded(() => session.searchWorld(query)) || [];
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
            // 4. Placement mode keeps its own Escape (exit placement).
            if (activeTool.value === 'place' && event.key === 'Escape') {
                setTool('select');
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

        onMounted(() => {
            allPublications.value = listPublicationsUseCase.execute();
            session.start(viewport.value);
            session.navigateToDocument(initialDocumentId);
            refreshSpatialUI();

            viewport.value.addEventListener('pointerdown', onPointerDown);
            viewport.value.addEventListener('pointermove', onPointerMove);
            viewport.value.addEventListener('pointerup', onPointerUp);
            window.addEventListener('keydown', onKeyDown);

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
            viewport.value.removeEventListener('pointerup', onPointerUp);
            viewport.value.removeEventListener('pointermove', onPointerMove);
            viewport.value.removeEventListener('pointerdown', onPointerDown);
            session.dispose();
        });

        return {
            viewport,
            title,
            author,
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
                <p class="world-view-hint">
                    Drag to orbit • Scroll to zoom • Home to reset • Ctrl/Cmd+K command palette • Click to inspect / place
                </p>

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

                <div v-if="spatialPlacement" class="spatial-panel spatial-panel--placement">
                    <h4>Placement Preview</h4>
                    <p class="spatial-type">{{ spatialPlacement.definitionId }}</p>
                    <p class="spatial-pos">
                        {{ spatialPlacement.position.x.toFixed(2) }},
                        {{ spatialPlacement.position.y.toFixed(2) }},
                        {{ spatialPlacement.position.z.toFixed(2) }}
                    </p>
                    <p class="editing-hint">Click to place • Escape to switch to Select</p>
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
                            Hover over ground or a brick face, then click to place.
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
        </div>
    `
};
