import { ref, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { CreateBrickRegistryUseCase } from '../../application/CreateBrickRegistryUseCase.js';
import { CreateEditorContextUseCase } from '../../application/CreateEditorContextUseCase.js';
import { CreateToolRegistryUseCase } from '../../application/CreateToolRegistryUseCase.js';
import { CreateDocumentManagerUseCase } from '../../application/CreateDocumentManagerUseCase.js';
import { CreatePersistenceUseCase } from '../../application/CreatePersistenceUseCase.js';
import { CreateIdentityProviderUseCase } from '../../application/CreateIdentityProviderUseCase.js';
import { SelectionUseCase } from '../../application/SelectionUseCase.js';
import { PaletteUseCase } from '../../application/PaletteUseCase.js';
import { PreviewUseCase } from '../../application/PreviewUseCase.js';
import { EditorSession } from '../../application/EditorSession.js';
import { ToolId } from '../../application/editor-state/ToolId.js';
import Toolbar from '../components/Toolbar.js';
import Sidebar from '../components/Sidebar.js';
import { CreatePublisherUseCase } from '../../application/CreatePublisherUseCase.js';


// TEMPORARY: '1'/'2' switch tools directly via EditorContext.setActiveTool.
// No tool-switching UI exists yet — same lightweight, honest verification
// mechanism used throughout this build. Ctrl/Cmd+S/Z/Y are different:
// each is a companion to a real Toolbar action (Save, and — as of
// 0.1.20C — Undo/Redo live entirely inside EditorSession.commandHistory),
// standard expected shortcuts, not scaffolding. All of these stay here
// rather than moving into EditorSession/InputDispatcher: they're global,
// tool-independent decisions that don't go to a tool at all.
const TOOL_SHORTCUTS = { 1: ToolId.SELECT, 2: ToolId.PLACE };

// EditorView is intentionally dumb: it never imports core/, renderer/, or
// storage/ directly, and — as of 0.1.20C — it doesn't even know a World,
// Renderer, or ToolManager exists. It builds the collaborators
// EditorSession needs once, then only ever calls start()/dispose() and
// forwards raw DOM events. Loading a different document or starting a
// new one both go through EditorSession too — EditorView has no idea
// those operations tear down and rebuild an entire runtime graph
// underneath it.
export default {
    name: 'EditorView',
    components: { Toolbar, Sidebar },
    template: `
        <div class="editor-view">
            <Toolbar
                :document-manager="documentManager"
                :save-document-use-case="saveDocumentUseCase"
                :load-document-use-case="loadDocumentUseCase"
                :editor-session="editorSession"
                :publish-document-use-case="publishDocumentUseCase"
            />
            <div class="editor-body">
                <Sidebar :palette-use-case="paletteUseCase" />
                <div ref="viewport" class="viewport"></div>
            </div>
        </div>
    `,
    setup() {
        const route = useRoute();
        const router = useRouter();
        const viewport = ref(null);

        // Constructed here (before mount) rather than in onMounted(),
        // since Sidebar/BrickPalette/Toolbar need these as required props
        // for their very first render.
        const registry = new CreateBrickRegistryUseCase().execute();
        const editorContext = new CreateEditorContextUseCase().execute();
        const selectionUseCase = new SelectionUseCase(editorContext);
        const paletteUseCase = new PaletteUseCase(registry, editorContext);
        const previewUseCase = new PreviewUseCase(editorContext);
        const toolRegistry = new CreateToolRegistryUseCase().execute();
        const documentManager = new CreateDocumentManagerUseCase().execute();
        const { saveDocumentUseCase, loadDocumentUseCase, forkDocumentUseCase } = new CreatePersistenceUseCase().execute();
        const identityProvider = new CreateIdentityProviderUseCase().execute();
        const { publishDocumentUseCase } = new CreatePublisherUseCase().execute(identityProvider);

        const editorSession = new EditorSession({
            registry,
            editorContext,
            toolRegistry,
            documentManager,
            selectionUseCase,
            previewUseCase,
            loadDocumentUseCase,
            identityProvider
        });

        let onPointerDown = null;
        let onPointerMove = null;
        let onKeyDown = null;

        onMounted(() => {
            // ALWAYS initialize the renderer first so _container is set.
            editorSession.start(viewport.value);
            // Handle deep-linking from Repository View: fork or load
            if (route.query.fork) {
                try {
                    const forkedDocument = forkDocumentUseCase.execute(route.query.fork, identityProvider);
                    editorSession.openDocument(forkedDocument);
                } catch (err) {
                    alert(`Fork failed: ${err.message}`);
                }
                router.replace({ path: '/editor' });
            } else if (route.query.load) {
                try {
                    editorSession.loadDocument(route.query.load);
                } catch (err) {
                    alert(`Load failed: ${err.message}`);
                }
                router.replace({ path: '/editor' });
            }

            onPointerDown = (event) => editorSession.onPointerDown(event);
            viewport.value.addEventListener('pointerdown', onPointerDown);

            onPointerMove = (event) => editorSession.onPointerMove(event);
            viewport.value.addEventListener('pointermove', onPointerMove);

            onKeyDown = (event) => {
                const shortcutTool = TOOL_SHORTCUTS[event.key];
                if (shortcutTool) {
                    editorContext.setActiveTool(shortcutTool);
                    return;
                }

                const modifierPressed = event.ctrlKey || event.metaKey;

                if (modifierPressed && event.key.toLowerCase() === 's') {
                    event.preventDefault();
                    saveDocumentUseCase.execute(documentManager);
                    return;
                }
                if (modifierPressed && event.key.toLowerCase() === 'z' && !event.shiftKey) {
                    if (editorSession.commandHistory.canUndo()) {
                        editorSession.commandHistory.undo();
                    }
                    return;
                }
                if (modifierPressed && (event.key.toLowerCase() === 'y' || (event.key.toLowerCase() === 'z' && event.shiftKey))) {
                    if (editorSession.commandHistory.canRedo()) {
                        editorSession.commandHistory.redo();
                    }
                    return;
                }

                editorSession.onKeyDown(event);
            };
            window.addEventListener('keydown', onKeyDown);
        });

        onBeforeUnmount(() => {
            window.removeEventListener('keydown', onKeyDown);
            viewport.value.removeEventListener('pointermove', onPointerMove);
            viewport.value.removeEventListener('pointerdown', onPointerDown);
            editorSession.dispose();
        });

        return {
            viewport,
            paletteUseCase,
            documentManager,
            saveDocumentUseCase,
            loadDocumentUseCase,
            editorSession,
            publishDocumentUseCase
        };
    }
};
