import { ref, computed, onMounted, onBeforeUnmount } from 'vue';

// Save/New/dirty indicator/Recent Documents — all driven by
// DocumentManager, LoadDocumentUseCase, and (as of 0.1.20C) EditorSession
// for New/Load, which the toolbar calls without knowing that either
// operation tears down and rebuilds the entire runtime graph underneath.
//
// Reactivity: DocumentManager isn't a Vue reactive object, so this
// component keeps its own refs and refreshes them by subscribing to
// documentManager.onStateChanged() — the same imperative-subscription
// pattern BrickPalette uses for the active brick. Both New and Load go
// through DocumentManager's own state-changing methods internally
// (attachWorld -> newDocument, or LoadDocumentUseCase -> load), so the
// SAME subscription that updates the dirty indicator after a save also
// picks up New/Load automatically — no separate wiring needed for either.
//
// Hardening: Recent Documents used to render one inline button per
// saved document directly in the toolbar row, with `overflow: hidden`
// as the only answer to what happens once there are more of them than
// fit — they just got clipped, with no way to reach the rest. It's now
// a single "Recent" toggle opening a scrollable dropdown (sorted
// newest-first; DocumentManifest.list() carries no ordering guarantee
// of its own), with a search box once there are enough documents that
// scrolling alone stops being the fastest way to find one.
const SEARCH_THRESHOLD = 8;

export default {
    name: 'Toolbar',
    props: {
        documentManager: {
            type: Object,
            required: true
        },
        saveDocumentUseCase: {
            type: Object,
            required: true
        },
        loadDocumentUseCase: {
            type: Object,
            required: true
        },
        editorSession: {
            type: Object,
            required: true
        },
        publishDocumentUseCase: {
            type: Object,
            required: true
        },
        // 0.2.21: optional so existing/ad-hoc usages of Toolbar
        // without a feedback channel keep working (falls back to
        // alert() below) — but EditorView always provides one now, so
        // Save/Publish report through the same transient-toast
        // mechanism every other action already uses instead of a
        // blocking browser dialog.
        feedback: {
            type: Object,
            default: null
        }
    },
    setup(props) {
        const dirty = ref(props.documentManager.state.dirty);
        const recentDocuments = ref(props.loadDocumentUseCase.listSavedDocuments());
        const recentOpen = ref(false);
        const recentQuery = ref('');
        let unsubscribe = null;

        function report(message) {
            if (props.feedback) {
                props.feedback.show(message);
            } else {
                alert(message);
            }
        }

        function save() {
            props.saveDocumentUseCase.execute(props.documentManager);
            report('Saved');
        }

        function createNew() {
            props.editorSession.newDocument();
        }

        function load(id) {
            props.editorSession.loadDocument(id);
            recentOpen.value = false;
            recentQuery.value = '';
        }

        // 0.2.90 — Structure Placement & World Instances. "Place" is the
        // sibling action to "Load" on the exact same Recent Documents
        // entry: Load REPLACES the current document with this one; Place
        // adds a StructurePlacement REFERENCING it to the document
        // that's already open, without leaving it. See
        // application/EditorSession.js#placeDocument()'s own header for
        // why this deliberately doesn't open `doc.id`.
        function place(doc) {
            const placed = props.editorSession.placeDocument(doc.id, doc.title);
            recentOpen.value = false;
            recentQuery.value = '';
            if (placed) {
                report(`Placing "${doc.title}" — click the ground to place, R to rotate`);
            }
        }

        function refresh() {
            dirty.value = props.documentManager.state.dirty;
            recentDocuments.value = props.loadDocumentUseCase.listSavedDocuments();
        }

        function publish() {
            try {
                const publication = props.publishDocumentUseCase.execute(props.documentManager);
                report(`Published "${publication.title}"`);
            } catch (err) {
                report(`Publish failed: ${err.message}`);
            }
        }

        function toggleRecent() {
            recentOpen.value = !recentOpen.value;
            if (!recentOpen.value) {
                recentQuery.value = '';
            }
        }

        function formatModified(modified) {
            const date = new Date(modified);
            return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString();
        }

        const sortedRecentDocuments = computed(() => {
            return [...recentDocuments.value].sort((a, b) => new Date(b.modified) - new Date(a.modified));
        });

        const filteredRecentDocuments = computed(() => {
            const query = recentQuery.value.trim().toLowerCase();
            if (!query) return sortedRecentDocuments.value;
            return sortedRecentDocuments.value.filter((doc) =>
                (doc.title || '').toLowerCase().includes(query));
        });

        onMounted(() => {
            unsubscribe = props.documentManager.onStateChanged(refresh);
        });

        onBeforeUnmount(() => {
            if (unsubscribe) {
                unsubscribe();
            }
        });

        return {
            dirty, recentDocuments, sortedRecentDocuments, filteredRecentDocuments,
            recentOpen, recentQuery, toggleRecent, formatModified,
            searchThreshold: SEARCH_THRESHOLD,
            save, createNew, load, place, publish
        };
    },
    template: `
        <div class="toolbar">
            <span class="toolbar-title">ForkBuild</span>

            <button class="toolbar-save" @click="save">Save</button>
            <button class="toolbar-publish" @click="publish">Publish</button>
            <button class="toolbar-new" @click="createNew">New</button>

            <span class="toolbar-dirty" :class="{ 'toolbar-dirty--clean': !dirty }">
                {{ dirty ? '● Unsaved changes' : 'Saved' }}
            </span>

            <div class="toolbar-recent" v-if="recentDocuments.length">
                <button
                    class="toolbar-recent-toggle"
                    :class="{ 'toolbar-recent-toggle--open': recentOpen }"
                    @click="toggleRecent"
                >
                    Recent <span class="toolbar-recent-count">{{ recentDocuments.length }}</span>
                    <span class="toolbar-recent-caret">▾</span>
                </button>
                <template v-if="recentOpen">
                    <div class="dropdown-backdrop" @click="recentOpen = false"></div>
                    <div class="toolbar-recent-dropdown">
                        <input
                            v-if="recentDocuments.length > searchThreshold"
                            v-model="recentQuery"
                            type="text"
                            class="toolbar-recent-search"
                            placeholder="Filter documents…"
                            autofocus
                        />
                        <div class="toolbar-recent-dropdown-list">
                            <div
                                v-for="doc in filteredRecentDocuments"
                                :key="doc.id"
                                class="toolbar-recent-dropdown-row"
                            >
                                <button
                                    class="toolbar-recent-dropdown-item"
                                    @click="load(doc.id)"
                                >
                                    <span class="toolbar-recent-dropdown-title">{{ doc.title }}</span>
                                    <span class="toolbar-recent-dropdown-date">{{ formatModified(doc.modified) }}</span>
                                </button>
                                <button
                                    class="toolbar-recent-dropdown-place"
                                    title="Place this document as a structure in the current World"
                                    @click="place(doc)"
                                >
                                    Place
                                </button>
                            </div>
                            <p v-if="filteredRecentDocuments.length === 0" class="toolbar-recent-dropdown-empty">
                                No documents match "{{ recentQuery }}"
                            </p>
                        </div>
                    </div>
                </template>
            </div>
        </div>
    `
};
