import BuildLibraryPreview from './BuildLibraryPreview.js';
import { libraryItemDescription, libraryItemName } from '../i18n/libraryText.js';
import { displayText, t } from '../i18n/i18n.js';

// The Editor's New: this week's build challenge while one runs (its
// starting build, tagged for the week), an empty plot, or one of the
// ready-made builds (application/home/FeaturedBuilds.js) opened as a new
// document of the person's own. When the open document has unsaved changes it says so,
// since either choice closes it. The host (ui/views/EditorView.js) does
// the opening; this only reports the choice.
export default {
    name: 'NewDocumentDialog',
    components: { BuildLibraryPreview },
    props: {
        structures: { type: Array, required: true },
        previewService: { type: Object, default: null },
        // The open document's title when it has unsaved changes, else null.
        unsavedTitle: { type: [String, Object], default: null },
        // This week's challenge, `{ id, title, brief, time }`, or null.
        challenge: { type: Object, default: null }
    },
    emits: ['choose-challenge', 'choose-empty', 'choose-structure', 'cancel'],
    setup(props) {
        const builds = props.structures.map((structure) => ({
            structure,
            name: libraryItemName(structure),
            description: libraryItemDescription(structure)
        }));
        return { t, displayText, builds };
    },
    mounted() {
        this.$el.querySelector('.new-document-option')?.focus();
    },
    methods: {
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
            aria-modal="true"
            :aria-label="t('newDocumentDialog.title')"
            class="modal-overlay"
            @click.self="$emit('cancel')"
            @keydown="onKeydown"
        >
            <div class="modal-panel new-document-dialog">
                <h3>{{ t('newDocumentDialog.title') }}</h3>
                <p v-if="unsavedTitle" class="new-document-unsaved" role="alert">
                    {{ t('newDocumentDialog.unsaved', { title: displayText(unsavedTitle) }) }}
                </p>
                <button
                    v-if="challenge"
                    type="button"
                    class="new-document-option new-document-challenge"
                    @click="$emit('choose-challenge', challenge.id)"
                >
                    <span class="new-document-empty-mark" aria-hidden="true">🏆</span>
                    <span class="new-document-option-text">
                        <span class="new-document-option-name">{{ t('newDocumentDialog.challenge', { theme: challenge.title }) }}</span>
                        <span class="new-document-option-description">{{ challenge.brief }} {{ challenge.time }}</span>
                    </span>
                </button>
                <button type="button" class="new-document-option new-document-empty" @click="$emit('choose-empty')">
                    <span class="new-document-empty-mark" aria-hidden="true">＋</span>
                    <span class="new-document-option-text">
                        <span class="new-document-option-name">{{ t('newDocumentDialog.empty') }}</span>
                        <span class="new-document-option-description">{{ t('newDocumentDialog.emptyDescription') }}</span>
                    </span>
                </button>
                <p class="new-document-ready-made">{{ t('newDocumentDialog.readyMade') }}</p>
                <ul class="new-document-builds">
                    <li v-for="build in builds" :key="build.structure.id">
                        <button
                            type="button"
                            class="new-document-option new-document-build"
                            :data-structure-id="build.structure.id"
                            @click="$emit('choose-structure', build.structure)"
                        >
                            <BuildLibraryPreview kind="structure" :item="build.structure" :preview-service="previewService" />
                            <span class="new-document-option-text">
                                <span class="new-document-option-name">{{ build.name }}</span>
                                <span class="new-document-option-description">{{ build.description }}</span>
                            </span>
                        </button>
                    </li>
                </ul>
                <div class="modal-actions">
                    <button type="button" class="action-btn action-btn--secondary" @click="$emit('cancel')">{{ t('newDocumentDialog.cancel') }}</button>
                </div>
            </div>
        </div>
    `
};
