import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import BuildLibraryPreview from './BuildLibraryPreview.js';
import StructureLibraryCard from './StructureLibraryCard.js';
import { sortStructures, STRUCTURE_SORT_OPTIONS } from '../../core/sortStructures.js';

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

// 0.6.4 — Blueprint Discovery, Search & Library Organization. Pure,
// headlessly-testable helper (same convention as matches()/normalize()
// above) that builds the "All (27) / Architecture (8) / ..." category
// filter options from whatever category groups are CURRENTLY VISIBLE —
// i.e. after search and the Built-in/My Structures tab already
// narrowed things down, but before the category filter itself is
// applied — so the option list and every count describe what search
// actually turned up, never a stale, library-wide total. Accepts any
// number of [{ category, structures }] group arrays (built-in, then
// personal) and preserves first-seen order across all of them, the
// same "first category to appear wins its position" rule
// core/groupStructuresByCategory.js already established for a single
// source, extended here to a vocabulary spanning two.
export function buildCategoryOptions(...groupsLists) {
    const order = [];
    const counts = new Map();
    for (const groups of groupsLists) {
        for (const group of groups) {
            if (!counts.has(group.category)) {
                counts.set(group.category, 0);
                order.push(group.category);
            }
            counts.set(group.category, counts.get(group.category) + group.structures.length);
        }
    }
    const options = order.map((category) => ({ category, count: counts.get(category) }));
    const total = options.reduce((sum, option) => sum + option.count, 0);
    return { total, options };
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
// 0.4.5 — Unified Build Placement. Bricks and Structures are both
// buildable items; their difference is content size, not placement
// interaction — see docs/Principles.md, "Buildable Things Share One
// Placement Experience." Clicking a structure entry ANYWHERE on its
// card now does exactly what clicking a brick entry already did: it
// emits 'place-structure' and the Editor enters a Place lifecycle
// (preview, transform, validate, commit) — no separate "Copy Into
// Document" button to find first. Fork As New Document is a real,
// deliberately different operation (a content operation, not a
// placement one — see "Copying Composes A Blueprint; Forking Creates
// One (0.4.0)") and stays available, just moved into a small secondary
// "⋮" menu alongside Rename/Remove (personal structures only) so it
// never competes with Place for the primary click target. Nothing
// downstream of the click changes: 'place-structure' still reaches
// EditorSession.beginStructureComposition() → StructureCompositionTool
// → CopyStructureIntoDocumentUseCase, the exact path 0.4.0/0.4.1 already
// built — this milestone renames and rearranges the UI boundary only,
// per docs/Principles.md's own "healthy separation" between user intent
// and mutation semantics.
//
// 0.4.3 — Personal Blueprint Library. `personalStructureGroups` renders
// as its own "My Structures" section below the built-in groups above —
// same [{ category, structures }] shape, same
// filteredStructureGroups-style search, same BuildLibraryPreview, same
// Place/Fork actions (a personal Structure composes and forks through
// the exact same EditorSession methods a built-in one does — nothing
// about where a Structure is stored changes what can be done with it).
// The only NEW actions live here: Rename (emits
// 'rename-personal-structure') and Remove (emits
// 'remove-personal-structure'), since only the user's own library
// content can be renamed or deleted — Village stays read-only, exactly
// as it always has. Both live in the same secondary "⋮" menu as Fork.
//
// 0.4.6 — Blueprint Sharing & Exchange. "My Structures" is no longer
// device-bound: a personal Structure's "⋮" menu gains Export Blueprint
// (emits 'export-personal-structure', same one-Structure-in shape as
// Fork/Rename/Remove), and the section's own header gains an Import
// Blueprint button — a library-level action, not a per-card one, so it
// lives beside the "My Structures" title instead of inside any single
// card's menu. What crosses the emit boundary here is deliberately raw
// file TEXT, not a parsed/validated package or a Structure — this panel
// finds and asks for things, same as every other emit in this file; it
// is application/BlueprintImportValidator.js and
// application/ImportBlueprintUseCase.js (via
// application/EditorSession.js#importBlueprint(), called from
// ui/views/EditorView.js) that actually parse, validate, and construct.
//
// 0.6.3 — Blueprint Authoring & Versioning UX. Every card's "⋮" menu
// gains an "Info" entry (opens ui/components/StructureInfoPanel.js,
// read-only, both built-in and personal). A built-in card's menu also
// gains "Fork to My Structures" (application/ForkStructureToLibraryUseCase.js
// — a Structure fork, never a Document fork; see that class's own
// header on the distinction from Fork As New Document above) and
// "Export Blueprint" (application/ExportBlueprintUseCase.js is generic
// over any Structure, so a built-in one can leave the device as a
// portable file exactly like a personal one already could). Nothing
// about a personal Structure's own menu changes.
//
// 0.6.4 — Blueprint Discovery, Search & Library Organization. What was
// still missing wasn't another editing primitive — it was that a
// library of dozens of blueprints has no way to stay browsable by
// anything other than scrolling. This milestone makes the existing
// metadata (name, category, description) actually work for the user:
//
//   - Search (matches(), unchanged) now also checks `description`, not
//     only name/category/tags.
//   - A Built-in / My Structures / All source tab — three ordinary
//     local `ref`s, never a duplicated copy of either library's data
//     (see docs/Principles.md, "Sorting Is Presentation, Never
//     Identity (0.6.4)").
//   - A category filter dropdown, its options and counts DERIVED from
//     whatever search+source already narrowed down to
//     (buildCategoryOptions(), above) — `category` stays an ordinary
//     string on Structure itself; no hard-coded taxonomy is added
//     anywhere in core/.
//   - A sort dropdown (core/sortStructures.js) — presentation-only
//     ordering, applied within each rendered category group; a
//     Structure's id/serialized form never changes based on how the
//     library happens to be sorted right now.
//   - A "Recent" section, resolved by the caller (ui/views/EditorView.js)
//     from application/LibraryUsageHistoryStore.js's own local usage
//     history — never a field on Structure, never part of a blueprint
//     export.
//
// The three previously-triplicated card templates (built-in group,
// personal group, and now Recent) are one component,
// ui/components/StructureLibraryCard.js, parameterized by `source` —
// extracted here rather than a fourth copy-pasted block.
export default {
    name: 'BuildLibraryPanel',
    components: { BuildLibraryPreview, StructureLibraryCard },
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
        },
        // 0.6.4 — the brick registry, needed only for the 'footprint'/
        // 'height' sort keys (core/sortStructures.js delegates to
        // core/SpatialBounds.js#fromBricks(), same as
        // ui/components/StructureInfoPanel.js already does). Optional —
        // sorting degrades gracefully (a 1x1x1-per-brick estimate)
        // without one; see sortStructures()'s own header.
        registry: {
            type: Object,
            default: null
        },
        // 0.6.4 — { [structureId]: savedAt } for personal Structures
        // only (application/LocalStructureLibraryStore.js#getSavedAtById()),
        // consulted solely by the 'recent' sort key. A built-in
        // Structure never appears in this map — see
        // core/sortStructures.js's own header on why that's correct.
        personalSavedAtById: {
            type: Object,
            default: () => ({})
        },
        // 0.6.4 — [{ structure, source }], most-recently-used first,
        // already resolved against BOTH libraries by the caller (which
        // already knows how to tell a built-in Structure from a
        // personal one — see ui/views/EditorView.js#inspectStructure()).
        // This panel never reaches into
        // application/LibraryUsageHistoryStore.js itself, and never
        // decides what counts as "used" — see that store's own header.
        recentStructures: {
            type: Array,
            default: () => []
        }
    },
    emits: [
        'place', 'fork', 'place-structure', 'rename-personal-structure', 'remove-personal-structure',
        // 0.4.6 — Blueprint Sharing & Exchange. 'export-personal-structure'
        // mirrors 'fork'/'rename-personal-structure'/'remove-personal-structure'
        // exactly — one Structure in, no return value expected, the caller
        // (ui/views/EditorView.js) owns turning it into an actual download.
        // 'import-blueprint' is different in kind: it isn't per-item, so it
        // carries the raw file text read here rather than a Structure — the
        // caller owns parsing/validating/persisting it, same "this panel
        // finds and asks for things, it never decides what they mean" rule
        // this file's own header states.
        'export-personal-structure', 'import-blueprint',
        // 0.6.3 — Blueprint Authoring & Versioning UX. 'inspect-structure'
        // (any card's "⋮" menu, both built-in and personal — see
        // ui/components/StructureInfoPanel.js) and 'fork-to-library' (a
        // BUILT-IN card only — "Village Hall" -> a brand-new, independent
        // personal Structure, never a Document; see
        // application/ForkStructureToLibraryUseCase.js's own header on how
        // this differs from 'fork'/"Fork As New Document" above) both
        // carry exactly one Structure, same shape as every other per-item
        // emit in this file.
        'inspect-structure', 'fork-to-library'
    ],
    setup(props, { emit }) {
        const activeTab = ref('bricks');
        const query = ref('');
        // 0.4.5 — Unified Build Placement. Which structure's secondary
        // "⋮" menu (Fork, Rename, Remove) is currently open — at most
        // one at a time, closed by picking any action, switching tabs,
        // or clicking anywhere else in the panel.
        const openMenuId = ref(null);

        // 0.6.4 — Blueprint Discovery, Search & Library Organization.
        // Three ordinary local refs — never a duplicated copy of either
        // library's own data (see this file's own 0.6.4 header).
        const sourceFilter = ref('all'); // 'all' | 'built-in' | 'personal'
        const categoryFilter = ref('all');
        const sortKey = ref('name');
        const sortOptions = STRUCTURE_SORT_OPTIONS;

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

        // 0.6.4 — search-only pass (now also checking `description`),
        // independent of the source tab and category filter below. This
        // is exactly what buildCategoryOptions() counts, so picking one
        // category from the dropdown never changes any OTHER category's
        // own displayed count.
        const searchedStructureGroups = computed(() => {
            const normalized = normalize(query.value);
            return props.structureGroups
                .map((group) => ({
                    category: group.category,
                    structures: group.structures.filter((structure) =>
                        matches(normalized, structure.name, structure.category, structure.tags.join(' '), structure.description))
                }))
                .filter((group) => group.structures.length > 0);
        });

        // 0.4.3 — Personal Blueprint Library. Same filtering rule as
        // searchedStructureGroups above, applied to the caller's own
        // personalStructureGroups prop instead — one shared query box,
        // one shared matches() rule, for both the built-in and personal
        // halves of the Structures tab.
        const searchedPersonalStructureGroups = computed(() => {
            const normalized = normalize(query.value);
            return (props.personalStructureGroups || [])
                .map((group) => ({
                    category: group.category,
                    structures: group.structures.filter((structure) =>
                        matches(normalized, structure.name, structure.category, structure.tags.join(' '), structure.description))
                }))
                .filter((group) => group.structures.length > 0);
        });

        // 0.6.4 — the Built-in/My Structures/All tabs decide which of
        // the two searched lists above even reach the category filter
        // and card rendering below; picking 'personal' empties the
        // built-in contribution entirely (and vice versa) rather than
        // rendering an empty section.
        const sourceFilteredBuiltIn = computed(() =>
            sourceFilter.value === 'personal' ? [] : searchedStructureGroups.value);
        const sourceFilteredPersonal = computed(() =>
            sourceFilter.value === 'built-in' ? [] : searchedPersonalStructureGroups.value);

        const categoryOptions = computed(() =>
            buildCategoryOptions(sourceFilteredBuiltIn.value, sourceFilteredPersonal.value));

        // 0.6.4 — narrows to the selected category (if any), then sorts
        // WITHIN each remaining group — sorting never merges categories
        // into one flat list, it only reorders inside the grouping that
        // already existed.
        function applyCategoryAndSort(groups) {
            const narrowed = categoryFilter.value === 'all'
                ? groups
                : groups.filter((group) => group.category === categoryFilter.value);
            return narrowed.map((group) => ({
                category: group.category,
                structures: sortStructures(group.structures, sortKey.value, {
                    registry: props.registry,
                    savedAtById: props.personalSavedAtById
                })
            }));
        }

        const filteredStructureGroups = computed(() => applyCategoryAndSort(sourceFilteredBuiltIn.value));
        const filteredPersonalStructureGroups = computed(() => applyCategoryAndSort(sourceFilteredPersonal.value));

        // 0.6.4 — "Recent" is filtered by the same search query as
        // everything else on this tab, but deliberately NOT by the
        // source tab or category filter: it answers "what did I just
        // use," not "what does the current browse filter show" — an
        // already-short list flickering in and out as someone browses
        // categories would defeat its own purpose.
        const filteredRecentStructures = computed(() => {
            const normalized = normalize(query.value);
            return (props.recentStructures || []).filter(({ structure }) =>
                matches(normalized, structure.name, structure.category, structure.tags.join(' '), structure.description));
        });

        function setTab(tab) {
            activeTab.value = tab;
            query.value = '';
            openMenuId.value = null;
            sourceFilter.value = 'all';
            categoryFilter.value = 'all';
            sortKey.value = 'name';
        }

        function setSourceFilter(source) {
            sourceFilter.value = source;
            categoryFilter.value = 'all';
        }

        function selectBrick(definitionId) {
            props.paletteUseCase.selectDefinition(definitionId);
            emit('place', definitionId);
        }

        // 0.4.5 — Unified Build Placement. The structure card's PRIMARY
        // action — clicking anywhere on it, exactly like clicking a
        // brick — enters Place. Never called for a click that landed
        // inside the secondary menu (the menu's own wrapper stops that
        // click from bubbling here — see ui/components/StructureLibraryCard.js).
        function placeStructure(structure) {
            emit('place-structure', structure);
        }

        function toggleMenu(structureId) {
            openMenuId.value = openMenuId.value === structureId ? null : structureId;
        }

        function closeMenu() {
            openMenuId.value = null;
        }

        function forkStructure(structure) {
            emit('fork', structure);
            closeMenu();
        }

        // 0.4.3 — Personal Blueprint Library. Rename/Remove only ever
        // apply to a personal Structure — the built-in Village entries
        // never render these buttons at all (see
        // ui/components/StructureLibraryCard.js), so there's no separate
        // "is this one editable" check needed here.
        function renamePersonalStructure(structure) {
            emit('rename-personal-structure', structure);
            closeMenu();
        }

        function removePersonalStructure(structure) {
            emit('remove-personal-structure', structure);
            closeMenu();
        }

        // 0.4.6 — Blueprint Sharing & Exchange. Export only ever applies
        // to a personal Structure — same reasoning as Rename/Remove
        // above (a built-in Village entry never renders this button at
        // all — see ui/components/StructureLibraryCard.js), so there's
        // no separate "is this one exportable" check needed here either.
        function exportPersonalStructure(structure) {
            emit('export-personal-structure', structure);
            closeMenu();
        }

        // 0.6.3 — Blueprint Authoring & Versioning UX. Opens
        // ui/components/StructureInfoPanel.js for `structure` — a
        // built-in or a personal one, the panel itself is read-only
        // either way (see its own header). The caller decides which
        // library it came from; this panel doesn't need to know.
        function inspectStructure(structure) {
            emit('inspect-structure', structure);
            closeMenu();
        }

        // 0.6.3 — Blueprint Authoring & Versioning UX. Built-in cards
        // only (see ui/components/StructureLibraryCard.js) — "Village
        // Hall" becomes an independent entry in My Structures, with no
        // Document involved. See application/ForkStructureToLibraryUseCase.js's
        // own header on how this differs from Fork As New Document.
        function forkToLibrary(structure) {
            emit('fork-to-library', structure);
            closeMenu();
        }

        // Import is a library-level action, not a per-structure one, so
        // it lives beside "My Structures" own title rather than inside
        // any one card's menu — clicking it just opens the OS file
        // picker via the hidden input below, exactly the same
        // <input type="file"> + FileReader shape
        // ui/views/IdentityManagementView.js's own portable-identity
        // import already established one domain over.
        const importFileInput = ref(null);
        function triggerImportBlueprint() {
            if (importFileInput.value) {
                importFileInput.value.click();
            }
        }
        function onImportBlueprintFileChosen(event) {
            const file = event.target.files && event.target.files[0];
            event.target.value = ''; // allow re-choosing the same file later
            if (!file) {
                return;
            }
            const reader = new FileReader();
            reader.onload = () => {
                emit('import-blueprint', String(reader.result || ''));
            };
            reader.readAsText(file);
        }

        onMounted(() => {
            unsubscribe = props.paletteUseCase.onActiveBrickChanged((definitionId) => {
                selectedDefinitionId.value = definitionId;
            });
            // 0.4.5 — any click that reaches window (i.e. wasn't stopped
            // by the menu's own wrapper — see the template) closes an
            // open secondary menu, the same "click outside closes it"
            // convention CommandPalette's own dropdowns use.
            window.addEventListener('click', closeMenu);
        });

        onBeforeUnmount(() => {
            if (unsubscribe) {
                unsubscribe();
            }
            window.removeEventListener('click', closeMenu);
        });

        return {
            activeTab,
            query,
            selectedDefinitionId,
            openMenuId,
            sourceFilter,
            categoryFilter,
            sortKey,
            sortOptions,
            categoryOptions,
            filteredBrickGroups,
            filteredStructureGroups,
            filteredPersonalStructureGroups,
            filteredRecentStructures,
            setTab,
            setSourceFilter,
            selectBrick,
            placeStructure,
            toggleMenu,
            forkStructure,
            renamePersonalStructure,
            removePersonalStructure,
            exportPersonalStructure,
            inspectStructure,
            forkToLibrary,
            importFileInput,
            triggerImportBlueprint,
            onImportBlueprintFileChosen
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
                <div class="build-library-source-tabs" role="tablist">
                    <button
                        type="button"
                        role="tab"
                        :aria-selected="sourceFilter === 'all'"
                        :class="['build-library-source-tab', { 'build-library-source-tab--active': sourceFilter === 'all' }]"
                        @click="setSourceFilter('all')"
                    >All</button>
                    <button
                        type="button"
                        role="tab"
                        :aria-selected="sourceFilter === 'built-in'"
                        :class="['build-library-source-tab', { 'build-library-source-tab--active': sourceFilter === 'built-in' }]"
                        @click="setSourceFilter('built-in')"
                    >Built-in</button>
                    <button
                        type="button"
                        role="tab"
                        :aria-selected="sourceFilter === 'personal'"
                        :class="['build-library-source-tab', { 'build-library-source-tab--active': sourceFilter === 'personal' }]"
                        @click="setSourceFilter('personal')"
                    >My Structures</button>
                </div>
                <div class="build-library-filters">
                    <select v-model="categoryFilter" class="build-library-filter-select" aria-label="Filter by category">
                        <option value="all">All ({{ categoryOptions.total }})</option>
                        <option v-for="option in categoryOptions.options" :key="option.category" :value="option.category">
                            {{ option.category }} ({{ option.count }})
                        </option>
                    </select>
                    <select v-model="sortKey" class="build-library-filter-select" aria-label="Sort structures">
                        <option v-for="option in sortOptions" :key="option.key" :value="option.key">{{ option.label }}</option>
                    </select>
                </div>

                <p
                    v-if="filteredStructureGroups.length === 0 && filteredPersonalStructureGroups.length === 0 && filteredRecentStructures.length === 0"
                    class="build-library-empty"
                >
                    No matching structures.
                </p>

                <div v-if="filteredRecentStructures.length > 0" class="palette-group recent-structures-group">
                    <h4 class="palette-category">Recent</h4>
                    <ul class="structure-list">
                        <StructureLibraryCard
                            v-for="entry in filteredRecentStructures"
                            :key="'recent-' + entry.structure.id"
                            :structure="entry.structure"
                            :preview-service="previewService"
                            :source="entry.source"
                            :is-menu-open="openMenuId === entry.structure.id"
                            @place="placeStructure"
                            @toggle-menu="toggleMenu"
                            @info="inspectStructure"
                            @fork="forkStructure"
                            @fork-to-library="forkToLibrary"
                            @export="exportPersonalStructure"
                            @rename="renamePersonalStructure"
                            @remove="removePersonalStructure"
                        />
                    </ul>
                </div>

                <div v-for="group in filteredStructureGroups" :key="group.category" class="palette-group">
                    <h4 class="palette-category">{{ group.category }}</h4>
                    <ul class="structure-list">
                        <StructureLibraryCard
                            v-for="structure in group.structures"
                            :key="structure.id"
                            :structure="structure"
                            :preview-service="previewService"
                            source="built-in"
                            :is-menu-open="openMenuId === structure.id"
                            @place="placeStructure"
                            @toggle-menu="toggleMenu"
                            @info="inspectStructure"
                            @fork="forkStructure"
                            @fork-to-library="forkToLibrary"
                            @export="exportPersonalStructure"
                        />
                    </ul>
                </div>

                <div v-if="sourceFilter !== 'built-in'" class="personal-structure-library">
                    <div class="personal-structure-library-header">
                        <h4 class="palette-title personal-structure-library-title">My Structures</h4>
                        <button
                            type="button"
                            class="action-btn action-btn--secondary personal-structure-library-import"
                            @click="triggerImportBlueprint"
                        >Import Blueprint</button>
                        <input
                            ref="importFileInput"
                            type="file"
                            accept="application/json"
                            class="personal-structure-library-import-input"
                            aria-label="Import blueprint file"
                            @change="onImportBlueprintFileChosen"
                        />
                    </div>
                    <div v-for="group in filteredPersonalStructureGroups" :key="group.category" class="palette-group">
                        <h4 class="palette-category">{{ group.category }}</h4>
                        <ul class="structure-list">
                            <StructureLibraryCard
                                v-for="structure in group.structures"
                                :key="structure.id"
                                :structure="structure"
                                :preview-service="previewService"
                                source="personal"
                                :is-menu-open="openMenuId === structure.id"
                                @place="placeStructure"
                                @toggle-menu="toggleMenu"
                                @info="inspectStructure"
                                @fork="forkStructure"
                                @rename="renamePersonalStructure"
                                @export="exportPersonalStructure"
                                @remove="removePersonalStructure"
                            />
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    `
};
