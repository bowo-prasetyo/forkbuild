import { LICENSE_OPTIONS } from '../../application/document/LicenseLabels.js';
import { t } from '../i18n/i18n.js';
import { License, LicenseId } from '../../core/document/License.js';
import { PLACEMENT_POLICY_OPTIONS } from '../../application/document/PlacementPolicyLabels.js';
import { PlacementPolicy } from '../../core/publication/PlacementPolicy.js';
import { BUILD_TAG_MAX_COUNT, normalizeBuildTags, suggestBuildTags } from '../../core/document/BuildTags.js';

// 0.2.21: the Document Properties editor — title/description/license,
// the "New Document dialog" and "Document Properties" surfaces from
// the milestone design collapsed into one reusable form, since editing
// a brand-new document's metadata and editing an existing one's are
// the same operation (set fields, Save). Modal overlay follows
// CommandPalette's existing convention (fixed inset, click-outside/
// Escape to cancel) rather than inventing a second dialog pattern.
//
// A build's tags start as suggestions from its title and description when it
// has none, shown in the field so they are seen, and changed or cleared
// like any other field; nothing becomes a tag without passing through it.
//
// Emits save({ title, description, tags, license: License, placementPolicy }) — a License
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
            tagsText: initialTags(this.info).join(' '),
            tagsSuggested: !(this.info && this.info.tags && this.info.tags.length > 0),
            licenseId: this.info && this.info.license ? this.info.license.id : LicenseId.UNSPECIFIED,
            licenseOptions: remixLicenseOptions(this.info),
            placementPolicy: this.info && this.info.placementPolicy ? this.info.placementPolicy : PlacementPolicy.ANYONE,
            placementPolicyOptions: PLACEMENT_POLICY_OPTIONS
        };
    },
    computed: {
        // "A remix of … by …: its license allows only these", when the
        // choice is narrowed to what the original's license allows.
        remixHint() {
            const attribution = this.info && this.info.license ? this.info.license.attribution : null;
            if (!attribution || this.licenseOptions.length === LICENSE_OPTIONS.length) return '';
            return attribution.author
                ? t('metadataEditor.remixLicenseHintBy', { title: attribution.title || t('share.untitled'), author: attribution.author })
                : t('metadataEditor.remixLicenseHint', { title: attribution.title || t('share.untitled') });
        },
        // What Save will keep, so the field shows it as it is typed.
        tagsPreview() {
            return normalizeBuildTags(this.tagsText);
        },
        suggestions() {
            return suggestBuildTags({ title: this.title, description: this.description })
                .filter((tag) => !this.tagsPreview.includes(tag));
        },
        maxTags() {
            return BUILD_TAG_MAX_COUNT;
        }
    },
    methods: {
        t,
        addTag(tag) {
            this.tagsText = [...this.tagsPreview, tag].join(' ');
            this.tagsSuggested = false;
        },
        onSave() {
            const trimmedTitle = this.title.trim();
            if (!trimmedTitle) {
                return;
            }
            // A remix keeps crediting its original and keeps its terms
            // (core/document/License.js, relicense()), here and again where the
            // edit is applied (UpdateDocumentMetadataUseCase,
            // WorldNavigationSession.updateDocumentMetadata).
            const priorLicense = this.info ? this.info.license : null;
            const license = License.relicense(priorLicense, new License({ id: this.licenseId }), {
                authorIdentityId: this.info ? this.info.authorIdentityId : null
            });
            this.$emit('save', {
                title: trimmedTitle,
                description: this.description,
                tags: this.tagsPreview,
                license,
                placementPolicy: this.placementPolicy
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
            :aria-label="t('metadataEditor.label')"
            class="modal-overlay"
            @click.self="$emit('cancel')"
            @keydown="onKeydown"
        >
            <div class="modal-panel metadata-editor">
                <h3>{{ t('metadataEditor.title') }}</h3>

                <label class="form-field">
                    <span class="form-label">{{ t('metadataEditor.fieldTitle') }}</span>
                    <input
                        v-model="title"
                        type="text"
                        class="form-input"
                        :placeholder="t('metadataEditor.untitled')"
                        maxlength="200"
                    />
                </label>

                <label class="form-field">
                    <span class="form-label">{{ t('metadataEditor.description') }}</span>
                    <textarea
                        v-model="description"
                        class="form-textarea metadata-editor-description"
                        rows="12"
                        :placeholder="t('metadataEditor.descriptionPlaceholder')"
                    ></textarea>
                    <span class="form-hint form-hint--neutral">{{ t('metadataEditor.descriptionFormattingHint') }}</span>
                </label>

                <label class="form-field">
                    <span class="form-label">{{ t('metadataEditor.tags') }}</span>
                    <input
                        v-model="tagsText"
                        type="text"
                        class="form-input metadata-editor-tags"
                        :placeholder="t('metadataEditor.tagsPlaceholder')"
                        autocomplete="off"
                        spellcheck="false"
                        @input="tagsSuggested = false"
                    />
                    <span class="form-hint form-hint--neutral">
                        {{ tagsSuggested && tagsPreview.length > 0 ? t('metadataEditor.tagsSuggestedHint', { count: maxTags }) : t('metadataEditor.tagsHint', { count: maxTags }) }}
                    </span>
                </label>
                <div v-if="suggestions.length > 0 && tagsPreview.length < maxTags" class="metadata-editor-tag-suggestions">
                    <span class="form-hint form-hint--neutral">{{ t('metadataEditor.tagSuggestions') }}</span>
                    <button
                        v-for="tag in suggestions"
                        :key="tag"
                        type="button"
                        class="action-btn metadata-editor-tag-suggestion"
                        @click="addTag(tag)"
                    >#{{ tag }}</button>
                </div>

                <label class="form-field">
                    <span class="form-label">{{ t('metadataEditor.license') }}</span>
                    <select v-model="licenseId" class="form-select">
                        <option v-for="opt in licenseOptions" :key="opt.id" :value="opt.id">
                            {{ t(opt.label) }}
                        </option>
                    </select>
                </label>
                <p class="form-hint form-hint--neutral metadata-editor-remix-license" v-if="remixHint">
                    {{ remixHint }}
                </p>
                <p class="form-hint" v-if="licenseId === 'UNSPECIFIED'">
                    {{ t('metadataEditor.noLicenseHint') }}
                </p>

                <label class="form-field">
                    <span class="form-label">{{ t('metadataEditor.placement') }}</span>
                    <select v-model="placementPolicy" class="form-select">
                        <option v-for="opt in placementPolicyOptions" :key="opt.id" :value="opt.id">
                            {{ t(opt.label) }}
                        </option>
                    </select>
                </label>
                <p class="form-hint" v-if="placementPolicy !== 'anyone'">
                    {{ t('metadataEditor.placementHint') }}
                </p>

                <div class="modal-actions">
                    <button class="action-btn" @click="$emit('cancel')">{{ t('metadataEditor.cancel') }}</button>
                    <button class="action-btn action-btn--primary" :disabled="!title.trim()" @click="onSave">{{ t('metadataEditor.save') }}</button>
                </div>
            </div>
        </div>
    `
};

// The tags a build has, or, when it has none, suggestions from its title
// and description.
function initialTags(info) {
    if (!info) return [];
    if (Array.isArray(info.tags) && info.tags.length > 0) return [...info.tags];
    return suggestBuildTags({ title: info.title, description: info.description });
}

// The licenses `info`'s build may move to: for a remix, those its original's
// license allows (core/document/License.js, remixLicenseIds()), unless its builder
// built the original too; otherwise every one.
function remixLicenseOptions(info) {
    const license = info && info.license;
    const attribution = license && license.attribution;
    if (!attribution) return LICENSE_OPTIONS;
    if (info.authorIdentityId && info.authorIdentityId === attribution.sourceAuthorIdentityId) return LICENSE_OPTIONS;
    const allowed = License.remixLicenseIds(attribution.sourceLicenseId || license.id);
    return LICENSE_OPTIONS.filter((option) => allowed.includes(option.id) || option.id === license.id);
}
