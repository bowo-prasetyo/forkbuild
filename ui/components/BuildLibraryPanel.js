import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import BuildLibraryPreview from './BuildLibraryPreview.js';

// Exported (not just module-local) so tests/BuildLibraryUX.test.js can
// exercise the actual matching rule directly — the same "logic lives
// in something headlessly testable, the component is a thin visual
// layer over it" convention ui/components/CommandPalette.js's own
// EditorActionRegistry.findMatching() already established, applied
// here as two plain functions rather than a whole extra class, since
// that is genuinely all the rule is.
export function normalize(query) {
    return (query || '').trim().toLowerCase();
}

export function matches(query, ...fields) {
    if (!query) {
        return true;
    }
    const haystack = fields.join(' ').toLowerCase();
    return haystack.includes(query);
}

// 0.2.84 — Building Library & Palette UX. Replaces the Editor sidebar's
// two previously-unrelated panels (ui/components/Sidebar.js wrapping
// BrickPalette, and ui/components/StructureLibraryPanel.js) with one
// "Build Library": a Bricks/Structures tab switcher over the exact same
// underlying data those two panels already rendered, plus what a
// vocabulary of 15 bricks across 12 categories and 6 structures across
// 4 categories newly needs to stay browsable — category grouping for
// BOTH (StructureRegistry#groupByCategory() is new in 0.2.84 for
// exactly this; BrickRegistry's own has existed since 0.2.80), a
// same-tab text search, and a small rendered preview per entry (via
// application/LibraryPreviewService.js, reusing the exact mesh
// pipeline every brick/structure already renders with — never a
// second, hand-drawn icon set).
//
// Deliberately preserves the exact separation the underlying use cases
// already draw, and makes it visible rather than papering over it:
// clicking a brick calls paletteUseCase.selectDefinition() (unchanged
// since 0.1.9) AND emits 'place' — this panel's one new behavior — so
// the Editor can switch to the Place tool in the same click, because
// selecting a brick and never being able to place it with one action
// was never the point. A structure entry offers TWO actions as of
// 0.4.0 (Structure Composition & Blueprint Library) — Copy Into
// Document (emits 'copy') and Fork As New Document (emits 'fork') —
// deliberately distinct verbs for a deliberately distinct architectural
// operation, see docs/Principles.md, "Copying Composes A Blueprint;
// Forking Creates One (0.4.0)": Fork still only ever opens a brand new
// Document (EditorSession.forkStructure()), exactly as
// StructureLibraryPanel originally did; Copy instead inserts the
// structure's bricks into the CURRENTLY OPEN document
// (EditorSession.copyStructureIntoDocument()) and never opens or
// creates anything. Nothing here changes PaletteUseCase, EditorContext,
// ForkStructureUseCase, CopyStructureIntoDocumentUseCase, or what any
// action actually does — only how they're found and asked for.
//
// 0.4.3 — Personal Blueprint Library. `personalStructureGroups` renders
// as its own "My Structures" section below the built-in groups above —
// same [{ category, structures }] shape, same
// filteredStructureGroups-style search, same BuildLibraryPreview, same
// Copy/Fork buttons (a personal Structure composes and forks through the
// exact same EditorSession methods a built-in one does — nothing about
// where a Structure is stored changes what can be done with it). The
// only NEW actions live here: Rename (emits 'rename-personal-structure')
// and Remove (emits 'remove-personal-structure'), since only the user's
// own library content can be renamed or deleted — Village stays
// read-only, exactly as it always has.
export default {
    name: 'BuildLibraryPanel',
    components: { BuildLibraryPreview },
    props: {
        paletteUseCase: {
            type: Object,
            required: true
        },
        // Ordered [{ category, structures }] — see
        // core/StructureRegistry.js#groupByCategory(). Read once by the
        // caller (a registry's contents never change at runtime, the
        // same reasoning BrickPalette's own `groups` already applied),
        // so this panel takes the already-grouped result rather than a
        // registry it would have to import core/ to group itself.
        structureGroups: {
            type: Array,
            required: true
        },
        // Same shape as structureGroups, sourced from
        // application/LocalStructureLibraryStore.js#groupByCategory()
        // instead of the built-in StructureRegistry — unlike
        // structureGroups, this DOES change at runtime (saving, renaming,
        // or removing a personal Structure), so the caller re-supplies a
        // fresh array after every such change rather than this panel
        // ever mutating or caching it.
        personalStructureGroups: {
            type: Array,
            default: () => []
        },
        previewService: {
            type: Object,
            default: null
        }
    },
    emits: ['place', 'fork', 'copy', 'rename-personal-structure', 'remove-personal-structure'],
    setup(props, { emit }) {
        const activeTab = ref('bricks');
        const query = ref('');

        const brickGroups = ref(props.paletteUseCase.getGroupedDefinitions());
        const selectedDefinitionId = ref(props.paletteUseCase.getSelectedDefinitionId());
        let unsubscribe = null;

        const filteredBrickGroups = computed(() => {
            const normalized = normalize(query.value);
            return brickGroups.value
                .map((group) => ({
                    category: group.category,
                    definitions: group.definitions.filter((definition) =>
                        matches(normalized, definition.name, definition.category, definition.tags.join(' '))
                    )
                }))
                .filter((group) => group.definitions.length > 0);
        });

        const filteredStructureGroups = computed(() => {
            const normalized = normalize(query.value);
            return props.structureGroups
                .map((group) => ({
                    category: group.category,
                    structures: group.structures.filter((structure) =>
                        matches(normalized, structure.name, structure.category, structure.tags.join(' '))
                    )
                }))
                .filter((group) => group.structures.length > 0);
        });

        // 0.4.3 — Personal Blueprint Library. Same filtering rule as
        // filteredStructureGroups above, applied to the caller's own
        // personalStructureGroups prop instead — one shared query box,
        // one shared matches() rule, for both the built-in and personal
        // halves of the Structures tab.
        const filteredPersonalStructureGroups = computed(() => {
            const normalized = normalize(query.value);
            return (props.personalStructureGroups || [])
                .map((group) => ({
                    category: group.category,
                    structures: group.structures.filter((structure) =>
                        matches(normalized, structure.name, structure.category, structure.tags.join(' '))
                    )
                }))
                .filter((group) => group.structures.length > 0);
        });

        function setTab(tab) {
            activeTab.value = tab;
            query.value = '';
        }

        function selectBrick(definitionId) {
            props.paletteUseCase.selectDefinition(definitionId);
            emit('place', definitionId);
        }

        function forkStructure(structure) {
            emit('fork', structure);
        }

        function copyStructure(structure) {
            emit('copy', structure);
        }

        // 0.4.3 — Personal Blueprint Library. Rename/Remove only ever
        // apply to a personal Structure — the built-in Village entries
        // never render these buttons at all (see the template below), so
        // there's no separate "is this one editable" check needed here.
        function renamePersonalStructure(structure) {
            emit('rename-personal-structure', structure);
        }

        function removePersonalStructure(structure) {
            emit('remove-personal-structure', structure);
        }

        onMounted(() => {
            unsubscribe = props.paletteUseCase.onActiveBrickChanged((definitionId) => {
                selectedDefinitionId.value = definitionId;
            });
        });

        onBeforeUnmount(() => {
            if (unsubscribe) {
                unsubscribe();
            }
        });

        return {
            activeTab,
            query,
            selectedDefinitionId,
            filteredBrickGroups,
            filteredStructureGroups,
            filteredPersonalStructureGroups,
            setTab,
            selectBrick,
            forkStructure,
            copyStructure,
            renamePersonalStructure,
            removePersonalStructure
        };
    },
    template: `
        <div class="build-library">
            <h3 class="palette-title">Build Library</h3>
            <div class="build-library-tabs" role="tablist">
                <button
                    type="button"
                    role="tab"
                    :aria-selected="activeTab === 'bricks'"
                    :class="['build-library-tab', { 'build-library-tab--active': activeTab === 'bricks' }]"
                    @click="setTab('bricks')"
                >
                    Bricks
                </button>
                <button
                    type="button"
                    role="tab"
                    :aria-selected="activeTab === 'structures'"
                    :class="['build-library-tab', { 'build-library-tab--active': activeTab === 'structures' }]"
                    @click="setTab('structures')"
                >
                    Structures
                </button>
            </div>
            <input
                v-model="query"
                type="text"
                class="build-library-search"
                :placeholder="'Search ' + activeTab + '...'"
                :aria-label="'Search ' + activeTab"
            />

            <div v-if="activeTab === 'bricks'" class="brick-palette">
                <p v-if="filteredBrickGroups.length === 0" class="build-library-empty">No matching bricks.</p>
                <div v-for="group in filteredBrickGroups" :key="group.category" class="palette-group">
                    <h4 class="palette-category">{{ group.category }}</h4>
                    <ul class="palette-list">
                        <li
                            v-for="definition in group.definitions"
                            :key="definition.id"
                            :class="['palette-item', 'build-library-item', { 'palette-item--active': definition.id === selectedDefinitionId }]"
                            :title="definition.description"
                            @click="selectBrick(definition.id)"
                        >
                            <BuildLibraryPreview kind="brick" :item="definition" :preview-service="previewService" />
                            <span class="palette-item-name">{{ definition.name }}</span>
                        </li>
                    </ul>
                </div>
            </div>

            <div v-else class="structure-library-panel">
                <p
                    v-if="filteredStructureGroups.length === 0 && filteredPersonalStructureGroups.length === 0"
                    class="build-library-empty"
                >
                    No matching structures.
                </p>
                <div v-for="group in filteredStructureGroups" :key="group.category" class="palette-group">
                    <h4 class="palette-category">{{ group.category }}</h4>
                    <ul class="structure-list">
                        <li
                            v-for="structure in group.structures"
                            :key="structure.id"
                            class="structure-item build-library-item"
                            :title="structure.description"
                        >
                            <BuildLibraryPreview kind="structure" :item="structure" :preview-service="previewService" />
                            <span class="structure-item-name">{{ structure.name }}</span>
                            <div class="structure-item-actions">
                                <button class="action-btn action-btn--copy structure-item-copy" @click="copyStructure(structure)">
                                    Copy Into Document
                                </button>
                                <button class="action-btn action-btn--fork structure-item-fork" @click="forkStructure(structure)">
                                    Fork As New Document
                                </button>
                            </div>
                        </li>
                    </ul>
                </div>

                <div v-if="filteredPersonalStructureGroups.length > 0" class="personal-structure-library">
                    <h4 class="palette-title personal-structure-library-title">My Structures</h4>
                    <div v-for="group in filteredPersonalStructureGroups" :key="group.category" class="palette-group">
                        <h4 class="palette-category">{{ group.category }}</h4>
                        <ul class="structure-list">
                            <li
                                v-for="structure in group.structures"
                                :key="structure.id"
                                class="structure-item build-library-item"
                                :title="structure.description"
                            >
                                <BuildLibraryPreview kind="structure" :item="structure" :preview-service="previewService" />
                                <span class="structure-item-name">{{ structure.name }}</span>
                                <div class="structure-item-actions">
                                    <button class="action-btn action-btn--copy structure-item-copy" @click="copyStructure(structure)">
                                        Copy Into Document
                                    </button>
                                    <button class="action-btn action-btn--fork structure-item-fork" @click="forkStructure(structure)">
                                        Fork As New Document
                                    </button>
                                    <button class="action-btn action-btn--secondary structure-item-rename" @click="renamePersonalStructure(structure)">
                                        Rename
                                    </button>
                                    <button class="action-btn action-btn--danger structure-item-remove" @click="removePersonalStructure(structure)">
                                        Remove
                                    </button>
                                </div>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    `
};
