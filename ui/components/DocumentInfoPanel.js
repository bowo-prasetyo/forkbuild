import { describeLicense } from '../../application/document/LicenseLabels.js';
import { describePlacementPolicy } from '../../application/document/PlacementPolicyLabels.js';
import { LifecycleStatus } from '../../application/document/DocumentLifecycleStatus.js';
import { displayText, t } from '../i18n/i18n.js';
import { descriptionPlainText, previewDescription } from '../../core/DescriptionMarkup.js';
import FormattedDescription from './FormattedDescription.js';
import { builtWithNames } from './remix/builtWithText.js';
import BuiltWithNames from './remix/BuiltWithNames.js';
import I18nText from '../i18n/I18nText.js';

// 0.2.21: the "Document Information" panel from the milestone design
// — one component, shared by the Editor sidebar and World View's
// inspection column, reading whatever shape each surface's
// getDocumentInfo()-equivalent produces:
//
//   { title, description, author, builtWith, license, parentDocumentId,
//     parentStructureId, parentStructureName, statusLabel, dirty,
//     editable, editabilityNotice }
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
//
// The full form leads with the title and the start of the description, the
// width of the panel, before the details. A description longer than that
// start ends in "Read more", which emits 'read-description' for the caller
// to show all of it somewhere wider (DescriptionReaderSheet in World View).
// Given a `commentCount` (World View, for a build with a Publication), a
// line under it says how many comments there are and emits 'read-comments'
// to show them in that same sheet.
export default {
    name: 'DocumentInfoPanel',
    components: { FormattedDescription, BuiltWithNames, I18nText },
    props: {
        info: {
            type: Object,
            default: null
        },
        compact: {
            type: Boolean,
            default: false
        },
        // How many comments the build's Publication has, or null when it
        // has none to comment on (no Publication, or a surface without
        // comments): then no comments line shows.
        commentCount: {
            type: Number,
            default: null
        }
    },
    emits: ['edit-metadata', 'read-description', 'read-comments'],
    computed: {
        // Whether the panel's start of the description leaves anything out.
        descriptionTruncated() {
            return Boolean(this.info && previewDescription(this.info.description).truncated);
        }
    },
    methods: {
        descriptionPlainText,
        t,
        displayText,
        placementPolicyLabel(policy) {
            return t(describePlacementPolicy(policy || 'anyone'));
        },
        licenseLabel(license) {
            return t(describeLicense(license ? license.id : null));
        },
        // Who built it with its author (core/BuiltWith.js), as a phrase.
        builtWith(info) {
            return builtWithNames(info.builtWith);
        },
        isDraft(info) {
            return info.status === LifecycleStatus.DRAFT;
        },
        shortId(id) {
            return id ? `${id.slice(0, 8)}…` : '—';
        },
        // What a copy was made from: a built-in structure by its name, never
        // its id ("village:house"), and anything else by a short id.
        originLabel(info) {
            return info.parentStructureName || this.shortId(info.parentStructureId || info.parentDocumentId);
        }
    },
    template: `
        <div v-if="info && compact" class="document-info-panel document-info-panel--compact">
            <div class="document-info-compact-row">
                <span class="document-info-compact-title" :title="descriptionPlainText(info.description) || info.title">{{ info.title }}</span>
                <span v-if="isDraft(info)" class="document-info-compact-draft" :title="displayText(info.statusLabel)">{{ t('documentInfo.draft') }}</span>
                <button
                    v-if="info.editable !== false"
                    type="button"
                    class="document-info-compact-edit"
                    :title="t('documentInfo.editHint')"
                    :aria-label="t('documentInfo.editLabel')"
                    @click="$emit('edit-metadata')"
                >✎</button>
            </div>
            <p v-if="info.parentDocumentId || info.parentStructureId" class="document-info-compact-origin">
                {{ t('documentInfo.forkedFromCompact', { origin: originLabel(info) }) }}
            </p>
            <p v-if="builtWith(info)" class="document-info-compact-built-with">
                <I18nText keypath="builtWith.line"><template #names><BuiltWithNames :list="info.builtWith" /></template></I18nText>
            </p>
            <p
                v-if="info.editabilityNotice"
                :class="['editability-notice', { 'editability-notice--blocked': info.editabilityNotice.blocked }]"
            >
                {{ info.editabilityNotice.blocked ? '🔒' : 'ℹ️' }} {{ displayText(info.editabilityNotice.message) }}
            </p>
        </div>
        <div v-else-if="info" class="document-info-panel">
            <h4>{{ t('documentInfo.title') }}</h4>

            <p class="document-info-name">{{ info.title }}</p>
            <div v-if="info.description" class="document-info-description">
                <formatted-description :text="info.description" preview />
                <button
                    v-if="descriptionTruncated"
                    type="button"
                    class="document-info-read-more"
                    aria-haspopup="dialog"
                    :aria-label="t('documentInfo.readMoreLabel', { title: info.title })"
                    @click="$emit('read-description')"
                >{{ t('documentInfo.readMore') }}</button>
            </div>
            <button
                v-if="commentCount !== null"
                type="button"
                class="document-info-comments"
                aria-haspopup="dialog"
                @click="$emit('read-comments')"
            >💬 {{ commentCount > 0 ? t('documentInfo.comments', { count: commentCount }) : t('documentInfo.commentFirst') }}</button>
            <div class="info-row" v-if="info.tags && info.tags.length > 0">
                <span class="info-label">{{ t('documentInfo.tags') }}</span>
                <span class="info-value">{{ info.tags.map((tag) => '#' + tag).join(' ') }}</span>
            </div>
            <div class="info-row">
                <span class="info-label">{{ t('documentInfo.license') }}</span>
                <span class="info-value">{{ licenseLabel(info.license) }}</span>
            </div>
            <div class="info-row">
                <span class="info-label">{{ t('documentInfo.placement') }}</span>
                <span class="info-value">{{ placementPolicyLabel(info.placementPolicy) }}</span>
            </div>
            <div class="info-row">
                <span class="info-label">{{ t('documentInfo.status') }}</span>
                <span class="info-value">{{ displayText(info.statusLabel) }}</span>
            </div>
            <div class="info-row" v-if="info.author">
                <span class="info-label">{{ t('documentInfo.author') }}</span>
                <span class="info-value">{{ info.author }}</span>
            </div>
            <div class="info-row" v-if="builtWith(info)">
                <span class="info-label">{{ t('documentInfo.builtWith') }}</span>
                <span class="info-value"><BuiltWithNames :list="info.builtWith" /></span>
            </div>
            <div class="info-row" v-if="info.parentDocumentId">
                <span class="info-label">{{ t('documentInfo.forkedFrom') }}</span>
                <span class="info-value">{{ shortId(info.parentDocumentId) }}</span>
            </div>
            <div class="info-row" v-if="info.parentStructureId">
                <span class="info-label">{{ t('documentInfo.forkedFromStructure') }}</span>
                <span class="info-value">{{ info.parentStructureName || shortId(info.parentStructureId) }}</span>
            </div>

            <p
                v-if="info.editabilityNotice"
                :class="['editability-notice', { 'editability-notice--blocked': info.editabilityNotice.blocked }]"
            >
                {{ info.editabilityNotice.blocked ? '🔒' : 'ℹ️' }} {{ displayText(info.editabilityNotice.message) }}
            </p>

            <div class="info-actions" v-if="info.editable !== false">
                <button class="action-btn" @click="$emit('edit-metadata')">{{ t('documentInfo.editMetadata') }}</button>
            </div>
        </div>
    `
};
