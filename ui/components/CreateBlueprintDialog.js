import BuildLibraryPreview from './BuildLibraryPreview.js';

// 0.6.3 — Blueprint Authoring & Versioning UX. Replaces the 0.4.2
// window.prompt() chain (Name, then Category, then Description, three
// separate native dialogs) with one small modal — the exact same
// overlay/panel/`modal-actions` shell
// ui/components/MetadataEditorDialog.js (0.2.21) already established,
// reused rather than inventing a second dialog pattern.
//
// `preview` is a throwaway core/Structure.js instance — the CURRENT
// selection already run through CreateStructureFromSelectionUseCase
// with placeholder metadata (see ui/views/EditorView.js#actionUi
// .openCreateBlueprintDialog()), purely so this dialog can show what
// is about to be extracted before any name is typed. It is never
// itself saved — Create re-runs extraction with the REAL metadata this
// form collects, the same two-step "extract, then persist" shape
// application/EditorSession.js#createStructureFromSelection()/
// saveStructureToPersonalLibrary() has always had; this dialog is a
// third, earlier look at the first step's output, not a shortcut past
// either.
//
// The preview reuses ui/components/BuildLibraryPreview.js unchanged —
// a Structure is a Structure, whether it is about to be saved or
// already was; there is no second, hand-drawn rendering path for "not
// yet real" content, per docs/Principles.md's own running "no second,
// poorer surface" posture.
export default {
    name: 'CreateBlueprintDialog',
    components: { BuildLibraryPreview },
    props: {
        preview: { type: Object, default: null },
        previewService: { type: Object, default: null }
    },
    emits: ['create', 'cancel'],
    data() {
        return {
            name: '',
            category: 'uncategorized',
            description: ''
        };
    },
    computed: {
        brickCount() {
            return this.preview ? this.preview.bricks.length : 0;
        }
    },
    methods: {
        onCreate() {
            const trimmedName = this.name.trim();
            if (!trimmedName) {
                return;
            }
            this.$emit('create', {
                name: trimmedName,
                category: this.category.trim() || 'uncategorized',
                description: this.description
            });
        },
        onKeydown(event) {
            if (event.key === 'Escape') {
                event.stopPropagation();
                this.$emit('cancel');
            }
        }
    },
    template: `
        <div
            role="dialog"
            aria-label="Create Blueprint"
            class="modal-overlay"
            @click.self="$emit('cancel')"
            @keydown="onKeydown"
        >
            <div class="modal-panel create-blueprint-dialog">
                <h3>Create Blueprint</h3>

                <label class="form-field">
                    <span class="form-label">Name</span>
                    <input
                        v-model="name"
                        type="text"
                        class="form-input"
                        placeholder="e.g. Farmstead"
                        maxlength="200"
                        autofocus
                    />
                </label>

                <label class="form-field">
                    <span class="form-label">Category</span>
                    <input
                        v-model="category"
                        type="text"
                        class="form-input"
                        placeholder="uncategorized"
                    />
                </label>

                <label class="form-field">
                    <span class="form-label">Description</span>
                    <textarea
                        v-model="description"
                        class="form-textarea"
                        rows="3"
                        placeholder="What is this? (optional)"
                    ></textarea>
                </label>

                <div v-if="preview" class="form-field create-blueprint-preview">
                    <span class="form-label">Preview</span>
                    <div class="create-blueprint-preview-body">
                        <BuildLibraryPreview kind="structure" :item="preview" :preview-service="previewService" />
                        <span class="create-blueprint-preview-count">
                            {{ brickCount }} {{ brickCount === 1 ? 'brick' : 'bricks' }} selected
                        </span>
                    </div>
                </div>

                <div class="modal-actions">
                    <button class="action-btn" @click="$emit('cancel')">Cancel</button>
                    <button class="action-btn action-btn--primary" :disabled="!name.trim()" @click="onCreate">Create Blueprint</button>
                </div>
            </div>
        </div>
    `
};
