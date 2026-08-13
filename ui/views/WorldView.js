import { ref, onMounted, onBeforeUnmount } from 'vue';
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

const DRAG_THRESHOLD_PX = 6;

// 0.1.50: the World View joins the consolidated command surface.
// Editing shortcuts now come from the SAME EditorActionRegistry the
// Editor uses — parity by construction. Escape priority: text input >
// palette > gizmo gesture > placement mode > selection. The overlay
// gains the consolidated EditingSidebar; hover/inspection/placement
// panels are unchanged.
export default {
    name: 'WorldView',
    components: { EditingSidebar, CommandPalette, ActionFeedback },
    setup() {
        const route = useRoute();
        const router = useRouter();
        const viewport = ref(null);
        const initialDocumentId = route.params.documentId;

        const title = ref('Loading...');
        const author = ref(null);
        const loadedWorlds = ref([]);
        const nearbyWorlds = ref([]);
        const failedWorlds = ref([]);
        const spatialSelection = ref(null);
        const spatialHover = ref(null);
        const spatialInspection = ref(null);
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

        function alignSelection(mode) {
            session.alignSelection(mode);
            refreshSpatialUI();
        }

        function distributeSelection(axis) {
            session.distributeSelection(axis);
            refreshSpatialUI();
        }

        function applyNumericTransform(intent, options) {
            session.applyNumericTransform(intent, options);
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

            const initialDoc = docs.find((d) => d.world.id === initialDocumentId);
            if (initialDoc) {
                title.value = initialDoc.metadata.title || 'Untitled';
                author.value = initialDoc.metadata.author;
            }
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
        // Pointer interaction (gizmo-first, unchanged since 0.1.46)
        // -----------------------------------------------------------------

        function onPointerDown(event) {
            isDragging = false;
            pointerStart = { x: event.clientX, y: event.clientY };
            if (session.gizmoPointerDown(event)) {
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
                    session.commitPlacement();
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
            applyNumericTransform
        };
    },
    template: `
        <div class="world-view">
            <div class="world-view-overlay">
                <h2>{{ title }}</h2>
                <p v-if="author">by {{ author }}</p>
                <p v-if="cameraPosition" class="world-view-coords">
                    Cam: {{ cameraPosition.x.toFixed(1) }}, {{ cameraPosition.y.toFixed(1) }}, {{ cameraPosition.z.toFixed(1) }}
                </p>
                <p class="world-view-hint">
                    Drag to orbit • Scroll to zoom • Home to reset • Ctrl/Cmd+K command palette • Click to inspect / place
                </p>

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
        </div>
    `
};
