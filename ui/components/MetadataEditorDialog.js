import { LICENSE_OPTIONS } from '../../application/LicenseLabels.js';
import { License, LicenseId } from '../../core/License.js';

// 0.2.21: the Document Properties editor — title/description/license,
// the "New Document dialog" and "Document Properties" surfaces from
// the milestone design collapsed into one reusable form, since editing
// a brand-new document's metadata and editing an existing one's are
// the same operation (set fields, Save). Modal overlay follows
// CommandPalette's existing convention (fixed inset, click-outside/
// Escape to cancel) rather than inventing a second dialog pattern.
//
// Emits save({ title, description, license: License }) — a License
// instance, not a bare id, so callers (UpdateDocumentMetadataUseCase /
// WorldNavigationSession.updateDocumentMetadata) can pass it straight
// through to DocumentMetadata's license setter unchanged. Emits cancel
// with no changes applied.
export default {
    name: 'MetadataEditorDialog',
    props: {
        info: {
            type: Object,
            default: null
        }
    },
    emits: ['save', 'cancel'],
    data() {
        return {
            title: this.info ? this.info.title : '',
            description: this.info ? this.info.description : '',
            licenseId: this.info && this.info.license ? this.info.license.id : LicenseId.UNSPECIFIED,
            licenseOptions: LICENSE_OPTIONS
        };
    },
    methods: {
        onSave() {
            const trimmedTitle = this.title.trim();
            if (!trimmedTitle) {
                return;
            }
            const priorLicense = this.info ? this.info.license : null;
            // Attribution (sourcePublicationId etc. — see
            // ForkDocumentUseCase) only makes sense for the license it
            // was stamped under. Preserve it if the user left the
            // license id untouched; a genuinely new choice starts
            // clean rather than carrying stale provenance data.
            const attribution = (priorLicense && priorLicense.id === this.licenseId)
                ? priorLicense.attribution
                : null;
            this.$emit('save', {
                title: trimmedTitle,
                description: this.description,
                license: new License({ id: this.licenseId, attribution })
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
            aria-label="Document properties"
            class="modal-overlay"
            @click.self="$emit('cancel')"
            @keydown="onKeydown"
        >
            <div class="modal-panel metadata-editor">
                <h3>Document Properties</h3>

                <label class="form-field">
                    <span class="form-label">Title</span>
                    <input
                        v-model="title"
                        type="text"
                        class="form-input"
                        placeholder="Untitled"
                        maxlength="200"
                    />
                </label>

                <label class="form-field">
                    <span class="form-label">Description</span>
                    <textarea
                        v-model="description"
                        class="form-textarea"
                        rows="3"
                        placeholder="What is this world?"
                    ></textarea>
                </label>

                <label class="form-field">
                    <span class="form-label">License</span>
                    <select v-model="licenseId" class="form-select">
                        <option v-for="opt in licenseOptions" :key="opt.id" :value="opt.id">
                            {{ opt.label }}
                        </option>
                    </select>
                </label>
                <p class="form-hint" v-if="licenseId === 'UNSPECIFIED'">
                    No license means forking is not permitted until one is set.
                </p>

                <div class="modal-actions">
                    <button class="action-btn" @click="$emit('cancel')">Cancel</button>
                    <button class="action-btn action-btn--primary" :disabled="!title.trim()" @click="onSave">Save</button>
                </div>
            </div>
        </div>
    `
};
