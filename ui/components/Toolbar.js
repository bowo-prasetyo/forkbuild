import { ref, onMounted, onBeforeUnmount } from 'vue';

// The toolbar's first real content: a Save button and a live dirty
// indicator, both driven by DocumentManager, plus a read-only Recent
// Documents list driven by LoadDocumentUseCase.listSavedDocuments().
//
// Click-to-load and New are deliberately not here yet — both need a way
// to replace the currently-rendered World at runtime, which EditorView
// doesn't support (it constructs its render session once, at mount).
// That's real, separate work, not squeezed into "add some buttons."
//
// Reactivity: DocumentManager isn't a Vue reactive object, so this
// component keeps its own refs and refreshes them by subscribing to
// documentManager.onStateChanged() — the same imperative-subscription
// pattern BrickPalette uses for the active brick. The recent-documents
// list is also refreshed on every state change rather than having its
// own separate event: any state change (dirty, saved, loaded) is a
// reasonable moment to re-check what's on disk, and a localStorage read
// of a handful of entries is cheap enough that this doesn't need finer
// granularity yet.
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
        }
    },
    setup(props) {
        const dirty = ref(props.documentManager.state.dirty);
        const recentDocuments = ref(props.loadDocumentUseCase.listSavedDocuments());
        let unsubscribe = null;

        function save() {
            props.saveDocumentUseCase.execute(props.documentManager);
        }

        function refresh() {
            dirty.value = props.documentManager.state.dirty;
            recentDocuments.value = props.loadDocumentUseCase.listSavedDocuments();
        }

        onMounted(() => {
            unsubscribe = props.documentManager.onStateChanged(refresh);
        });

        onBeforeUnmount(() => {
            if (unsubscribe) {
                unsubscribe();
            }
        });

        return { dirty, recentDocuments, save };
    },
    template: `
        <div class="toolbar">
            <span class="toolbar-title">ForkBuild</span>

            <button class="toolbar-save" @click="save">Save</button>

            <span class="toolbar-dirty" :class="{ 'toolbar-dirty--clean': !dirty }">
                {{ dirty ? '\u25CF Unsaved changes' : 'Saved' }}
            </span>

            <div class="toolbar-recent" v-if="recentDocuments.length">
                <span class="toolbar-recent-label">Recent:</span>
                <span
                    v-for="doc in recentDocuments"
                    :key="doc.id"
                    class="toolbar-recent-item"
                    :title="doc.modified"
                >{{ doc.title }}</span>
            </div>
        </div>
    `
};
