// 0.9.204 — Editor Autosave & Recovery UI Integration. Exactly
// ActionFeedback.js/DocumentInfoPanel.js's own posture: no use-case
// imports, no mutation, no storage access — it only renders whatever
// application/document/RecoveryObserver.js last offered (the shape
// application/document/CheckRecoveryUseCase.js's own execute() returns) and emits
// 'recover'/'discard' for the host view to run through the existing
// RecoverDocumentUseCase/DiscardRecoveryUseCase. See docs/Roadmap.md,
// 0.9.204: "The UI should not implement recovery itself."
import { displayText, formatDate, t } from '../i18n/i18n.js';
export default {
    name: 'RecoveryBanner',
    props: {
        // { available, documentId, recovery: DocumentRevision, savedRevision, obsolete } | null;
        // with `otherBuild` and `title` when the work is for a build that isn't open
        // (RecoveryObserver#offer()).
        status: {
            type: Object,
            default: null
        }
    },
    emits: ['recover', 'discard'],
    methods: {
        t,
        message() {
            const when = this.formatSavedAt(this.status.recovery.savedAt);
            return this.status.otherBuild && this.status.title
                ? t('recovery.foundOther', { title: displayText(this.status.title), when })
                : t('recovery.found', { when });
        },
        formatSavedAt(savedAt) {
            const date = new Date(savedAt);
            return Number.isNaN(date.getTime())
                ? t('recovery.earlierSession')
                : formatDate(date, { dateStyle: 'medium', timeStyle: 'short' });
        }
    },
    template: `
        <div v-if="status && status.available" class="recovery-banner" role="alert">
            <span class="recovery-banner-message">
                {{ message() }}
            </span>
            <div class="recovery-banner-actions">
                <button class="action-btn action-btn--primary" @click="$emit('recover')">{{ t('recovery.recover') }}</button>
                <button class="action-btn action-btn--secondary" @click="$emit('discard')">{{ t('recovery.discard') }}</button>
            </div>
        </div>
    `
};
