import { describeLicense } from '../../application/document/LicenseLabels.js';
import { describePlacementPolicy } from '../../application/document/PlacementPolicyLabels.js';
import { LifecycleStatus } from '../../application/document/DocumentLifecycleStatus.js';

// 0.2.21: the "Document Information" panel from the milestone design
// — one component, shared by the Editor sidebar and World View's
// inspection column, reading whatever shape each surface's
// getDocumentInfo()-equivalent produces:
//
//   { title, description, author, license, parentDocumentId,
//     parentStructureId, statusLabel, dirty, editable,
//     editabilityNotice }
//
// Deliberately dumb: no session/use-case imports, no mutation. It
// renders `info` and emits 'edit-metadata' when the caller should open
// MetadataEditorDialog — same "actions are not commands, this is not
// even an action" split EditorActionRegistry draws, one level further:
// this component isn't even in that registry, it's pure presentation.
//
// `compact` is the Editor's one-line form: title and an edit button, plus
// fork origin and the editability notice only when they apply. Only a
// Draft is marked: the toolbar's Saved / Unsaved indicator covers the rest,
// but it also says "Saved" for a document that was never saved.
export default {
    name: 'DocumentInfoPanel',
    props: {
        info: {
            type: Object,
            default: null
        },
        compact: {
            type: Boolean,
            default: false
        }
    },
    emits: ['edit-metadata'],
    methods: {
        placementPolicyLabel(policy) {
            return describePlacementPolicy(policy || 'anyone');
        },
        licenseLabel(license) {
            return describeLicense(license ? license.id : null);
        },
        isDraft(info) {
            return info.status === LifecycleStatus.DRAFT;
        },
        shortId(id) {
            return id ? `${id.slice(0, 8)}…` : '—';
        }
    },
    template: `
        <div v-if="info && compact" class="document-info-panel document-info-panel--compact">
            <div class="document-info-compact-row">
                <span class="document-info-compact-title" :title="info.description || info.title">{{ info.title }}</span>
                <span v-if="isDraft(info)" class="document-info-compact-draft" :title="info.statusLabel">Draft</span>
                <button
                    v-if="info.editable !== false"
                    type="button"
                    class="document-info-compact-edit"
                    title="Edit title, description, license and author"
                    aria-label="Edit document details"
                    @click="$emit('edit-metadata')"
                >✎</button>
            </div>
            <p v-if="info.parentDocumentId || info.parentStructureId" class="document-info-compact-origin">
                Forked from {{ info.parentStructureId || shortId(info.parentDocumentId) }}
            </p>
            <p
                v-if="info.editabilityNotice"
                :class="['editability-notice', { 'editability-notice--blocked': info.editabilityNotice.blocked }]"
            >
                {{ info.editabilityNotice.blocked ? '🔒' : 'ℹ️' }} {{ info.editabilityNotice.message }}
            </p>
        </div>
        <div v-else-if="info" class="document-info-panel">
            <h4>Document Information</h4>

            <div class="info-row">
                <span class="info-label">Title</span>
                <span class="info-value">{{ info.title }}</span>
            </div>
            <div class="info-row" v-if="info.description">
                <span class="info-label">Description</span>
                <span class="info-value info-value--wrap">{{ info.description }}</span>
            </div>
            <div class="info-row">
                <span class="info-label">License</span>
                <span class="info-value">{{ licenseLabel(info.license) }}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Placement</span>
                <span class="info-value">{{ placementPolicyLabel(info.placementPolicy) }}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Status</span>
                <span class="info-value">{{ info.statusLabel }}</span>
            </div>
            <div class="info-row" v-if="info.author">
                <span class="info-label">Author</span>
                <span class="info-value">{{ info.author }}</span>
            </div>
            <div class="info-row" v-if="info.parentDocumentId">
                <span class="info-label">Forked from</span>
                <span class="info-value">{{ shortId(info.parentDocumentId) }}</span>
            </div>
            <div class="info-row" v-if="info.parentStructureId">
                <span class="info-label">Forked from Structure</span>
                <span class="info-value">{{ info.parentStructureId }}</span>
            </div>

            <p
                v-if="info.editabilityNotice"
                :class="['editability-notice', { 'editability-notice--blocked': info.editabilityNotice.blocked }]"
            >
                {{ info.editabilityNotice.blocked ? '🔒' : 'ℹ️' }} {{ info.editabilityNotice.message }}
            </p>

            <div class="info-actions" v-if="info.editable !== false">
                <button class="action-btn" @click="$emit('edit-metadata')">Edit Metadata</button>
            </div>
        </div>
    `
};
