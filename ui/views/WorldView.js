import { ref, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { CreateBrickRegistryUseCase } from '../../application/CreateBrickRegistryUseCase.js';
import { CreateWorldViewUseCase } from '../../application/CreateWorldViewUseCase.js';
import { CreateDiscoveryUseCase } from '../../application/CreateDiscoveryUseCase.js';

const DRAG_THRESHOLD_PX = 6;
const NUDGE = 1;

export default {
    name: 'WorldView',
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

        const registry = new CreateBrickRegistryUseCase().execute();
        const worldViewFactory = new CreateWorldViewUseCase().execute();
        const session = worldViewFactory.createSession(registry);

        const { listPublicationsUseCase } = new CreateDiscoveryUseCase().execute();
        const allPublications = ref([]);

        let spatialInterval = null;
        let pointerStart = null;
        let isDragging = false;

        availableDefinitions.value = registry.getAll();
        if (availableDefinitions.value.length > 0) {
            selectedDefinitionId.value = availableDefinitions.value[0].id;
        }
        const isPlacementMode = ref(false);

        function onKeyDown(event) {
            if (event.key === 'Escape') {
                if (session.isPlacementMode()) {
                    cancelPlacement();
                } else {
                    session.clearSelection();
                    refreshSpatialUI();
                }
                return;
            }

            const modifierPressed = event.ctrlKey || event.metaKey;

            if (modifierPressed && event.key.toLowerCase() === 'z' && !event.shiftKey) {
                event.preventDefault();
                session.undo();
                refreshSpatialUI();
                return;
            }
            if (modifierPressed && (event.key.toLowerCase() === 'y' || (event.key.toLowerCase() === 'z' && event.shiftKey))) {
                event.preventDefault();
                session.redo();
                refreshSpatialUI();
                return;
            }

            if (!session.isPlacementMode() && spatialEditingContext.value) {
                const ctx = spatialEditingContext.value;

                if (ctx.type === 'brick' && ctx.capabilities.rotate) {
                    if (event.key.toLowerCase() === 'r') {
                        event.preventDefault();
                        const delta = event.shiftKey ? -90 : 90;
                        session.rotateSelection(delta);
                        refreshSpatialUI();
                        return;
                    }
                }

                if (ctx.type === 'brick' && ctx.capabilities.move) {
                    switch (event.key) {
                        case 'ArrowUp':
                            event.preventDefault();
                            moveSelectedBrick({ x: 0, y: 0, z: -NUDGE });
                            break;
                        case 'ArrowDown':
                            event.preventDefault();
                            moveSelectedBrick({ x: 0, y: 0, z: NUDGE });
                            break;
                        case 'ArrowLeft':
                            event.preventDefault();
                            moveSelectedBrick({ x: -NUDGE, y: 0, z: 0 });
                            break;
                        case 'ArrowRight':
                            event.preventDefault();
                            moveSelectedBrick({ x: NUDGE, y: 0, z: 0 });
                            break;
                        case 'PageUp':
                            event.preventDefault();
                            moveSelectedBrick({ x: 0, y: NUDGE, z: 0 });
                            break;
                        case 'PageDown':
                            event.preventDefault();
                            moveSelectedBrick({ x: 0, y: -NUDGE, z: 0 });
                            break;
                    }
                }

                if (ctx.type === 'brick' && ctx.capabilities.delete) {
                    if (event.key === 'Delete' || event.key === 'Backspace') {
                        event.preventDefault();
                        deleteSelectedBrick();
                    }
                }
            }
        }
        
        function startPlacement() {
            if (selectedDefinitionId.value) {
                session.setActiveDefinitionId(selectedDefinitionId.value);
                isPlacementMode.value = true;
                refreshSpatialUI();
            }
        }

        function cancelPlacement() {
            session.cancelPlacement();
            isPlacementMode.value = false;
            refreshSpatialUI();
        }
        
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

        function startPlacement() {
            if (selectedDefinitionId.value) {
                session.setActiveDefinitionId(selectedDefinitionId.value);
                refreshSpatialUI();
            }
        }

        function cancelPlacement() {
            session.cancelPlacement();
            refreshSpatialUI();
        }

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
        }

        function onPointerUp(event) {
            if (!isDragging && pointerStart) {
                if (session.isPlacementMode()) {
                    session.commitPlacement();
                    refreshSpatialUI();
                } else {
                    session.pick(event.clientX, event.clientY);
                    refreshSpatialUI();
                }
            }
            pointerStart = null;
            isDragging = false;
        }

        function moveSelectedBrick(delta) {
            session.moveSelection(delta);
            refreshSpatialUI();
        }

        function deleteSelectedBrick() {
            session.deleteSelection();
            refreshSpatialUI();
        }

        function onKeyDown(event) {
            if (event.key === 'Escape') {
                if (session.isPlacementMode()) {
                    cancelPlacement();
                } else {
                    session.clearSelection();
                    refreshSpatialUI();
                }
                return;
            }

            if (!session.isPlacementMode() && spatialEditingContext.value) {
                const ctx = spatialEditingContext.value;
                if (ctx.type === 'brick' && ctx.capabilities.move) {
                    switch (event.key) {
                        case 'ArrowUp':
                            event.preventDefault();
                            moveSelectedBrick({ x: 0, y: 0, z: -NUDGE });
                            break;
                        case 'ArrowDown':
                            event.preventDefault();
                            moveSelectedBrick({ x: 0, y: 0, z: NUDGE });
                            break;
                        case 'ArrowLeft':
                            event.preventDefault();
                            moveSelectedBrick({ x: -NUDGE, y: 0, z: 0 });
                            break;
                        case 'ArrowRight':
                            event.preventDefault();
                            moveSelectedBrick({ x: NUDGE, y: 0, z: 0 });
                            break;
                        case 'PageUp':
                            event.preventDefault();
                            moveSelectedBrick({ x: 0, y: NUDGE, z: 0 });
                            break;
                        case 'PageDown':
                            event.preventDefault();
                            moveSelectedBrick({ x: 0, y: -NUDGE, z: 0 });
                            break;
                    }
                }
                if (ctx.type === 'brick' && ctx.capabilities.delete) {
                    if (event.key === 'Delete' || event.key === 'Backspace') {
                        event.preventDefault();
                        deleteSelectedBrick();
                    }
                }
            }
        }

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
            window.removeEventListener('keydown', onKeyDown);
            viewport.value.removeEventListener('pointerdown', onPointerDown);
            viewport.value.removeEventListener('pointermove', onPointerMove);
            viewport.value.removeEventListener('pointerup', onPointerUp);
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
            isPlacementMode,          // ← added
            focusWorld,
            focusSelection,
            startPlacement,
            cancelPlacement,
            moveSelectedBrick,
            deleteSelectedBrick
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
                    Drag to orbit • Scroll to zoom • Home to reset • Click to inspect • Move to explore
                </p>

                <div v-if="spatialHover && !spatialPlacement" class="spatial-panel spatial-panel--hover">
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
                    <p class="editing-hint">Click to place • Escape to cancel</p>
                </div>

                <div v-if="spatialEditingContext && !spatialPlacement" class="spatial-panel spatial-panel--editing">
                    <h4>Editing</h4>
                    <p class="spatial-type">{{ spatialEditingContext.type }}</p>

                    <div v-if="spatialEditingContext.type === 'brick'" class="editing-actions">
                        <p v-if="spatialEditingContext.capabilities.move" class="editing-hint">
                            Arrow keys: move X/Z • Page Up/Down: move Y
                        </p>
                        <button
                            v-if="spatialEditingContext.capabilities.delete"
                            class="action-btn action-btn--danger"
                            @click="deleteSelectedBrick"
                        >
                            Delete Brick
                        </button>
                    </div>
                    
                    <div v-if="spatialEditingContext.type === 'brick'" class="editing-actions">
                        <p v-if="spatialEditingContext.capabilities.move" class="editing-hint">
                            Arrow keys: move X/Z • Page Up/Down: move Y
                        </p>
                        <p v-if="spatialEditingContext.capabilities.rotate" class="editing-hint">
                            R: rotate 90° • Shift+R: rotate –90°
                        </p>
                        <button
                            v-if="spatialEditingContext.capabilities.delete"
                            class="action-btn action-btn--danger"
                            @click="deleteSelectedBrick"
                        >
                            Delete Brick
                        </button>
                    </div>                    

                    <div v-if="spatialEditingContext.type === 'ground'" class="editing-actions">
                        <p class="editing-hint">
                            Ground selected. Choose a brick type to place.
                        </p>
                    </div>
                </div>
                
                <div class="world-view-section placement-section">
                    <h4>Place Brick</h4>
                    <div class="placement-controls">
                        <select
                            v-model="selectedDefinitionId"
                            class="placement-select"
                            :disabled="isPlacementMode"
                        >
                            <option
                                v-for="def in availableDefinitions"
                                :key="def.id"
                                :value="def.id"
                            >
                                {{ def.name }}
                            </option>
                        </select>
                        <button
                            v-if="!isPlacementMode"
                            class="action-btn action-btn--primary"
                            @click="startPlacement"
                            :disabled="!selectedDefinitionId"
                        >
                            Start Placement
                        </button>
                        <button
                            v-else
                            class="action-btn action-btn--secondary"
                            @click="cancelPlacement"
                        >
                            Cancel
                        </button>
                    </div>
                    <p v-if="isPlacementMode" class="placement-hint">
                        Hover over ground or a brick face, then click to place.
                    </p>
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
        </div>
    `
};                
