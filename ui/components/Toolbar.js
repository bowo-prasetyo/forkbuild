import { ref, onMounted, onBeforeUnmount } from 'vue';

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
        }
    },
    setup(props) {
        const dirty = ref(props.documentManager.state.dirty);
        const recentDocuments = ref(props.loadDocumentUseCase.listSavedDocuments());
        let unsubscribe = null;

        function save() {
            props.saveDocumentUseCase.execute(props.documentManager);
        }

        function createNew() {
            props.editorSession.newDocument();
        }

        function load(id) {
            props.editorSession.loadDocument(id);
        }

        function refresh() {
            dirty.value = props.documentManager.state.dirty;
            recentDocuments.value = props.loadDocumentUseCase.listSavedDocuments();
        }

        function publish() {
            try {
                const publication = props.publishDocumentUseCase.execute(props.documentManager);
                alert(`Published "${publication.title}"\nID: ${publication.id}\nProvider: ${publication.providerId}`);
            } catch (err) {
                alert(`Publish failed: ${err.message}`);
            }
        }
                
        onMounted(() => {
            unsubscribe = props.documentManager.onStateChanged(refresh);
        });

        onBeforeUnmount(() => {
            if (unsubscribe) {
                unsubscribe();
            }
        });

        return { dirty, recentDocuments, save, createNew, load, publish };
    },
    template: `
        <div class="toolbar">
            <span class="toolbar-title">ForkBuild</span>

            <button class="toolbar-save" @click="save">Save</button>
            <button class="toolbar-publish" @click="publish">Publish</button>
            <button class="toolbar-new" @click="createNew">New</button>

            <span class="toolbar-dirty" :class="{ 'toolbar-dirty--clean': !dirty }">
                {{ dirty ? '\u25CF Unsaved changes' : 'Saved' }}
            </span>

            <div class="toolbar-recent" v-if="recentDocuments.length">
                <span class="toolbar-recent-label">Recent:</span>
                <button
                    v-for="doc in recentDocuments"
                    :key="doc.id"
                    class="toolbar-recent-item"
                    :title="doc.modified"
                    @click="load(doc.id)"
                >{{ doc.title }}</button>
            </div>
        </div>
    `
};
