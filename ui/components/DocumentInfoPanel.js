import { describeLicense } from '../../application/LicenseLabels.js';

// 0.2.21: the "Document Information" panel from the milestone design
// — one component, shared by the Editor sidebar and World View's
// inspection column, reading whatever shape each surface's
// getDocumentInfo()-equivalent produces:
//
//   { title, description, author, license, parentDocumentId,
//     statusLabel, dirty, editable, editabilityNotice }
//
// Deliberately dumb: no session/use-case imports, no mutation. It
// renders `info` and emits 'edit-metadata' when the caller should open
// MetadataEditorDialog — same "actions are not commands, this is not
// even an action" split EditorActionRegistry draws, one level further:
// this component isn't even in that registry, it's pure presentation.
export default {
    name: 'DocumentInfoPanel',
    props: {
        info: {
            type: Object,
            default: null
        }
    },
    emits: ['edit-metadata'],
    methods: {
        licenseLabel(license) {
            return describeLicense(license ? license.id : null);
        },
        shortId(id) {
            return id ? `${id.slice(0, 8)}…` : '—';
        }
    },
    template: `
        <div v-if="info" class="document-info-panel">
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
