// 0.9.204 — Editor Autosave & Recovery UI Integration. Exactly
// ActionFeedback.js/DocumentInfoPanel.js's own posture: no use-case
// imports, no mutation, no storage access — it only renders whatever
// application/RecoveryObserver.js last offered (the shape
// application/CheckRecoveryUseCase.js's own execute() returns) and emits
// 'recover'/'discard' for the host view to run through the existing
// RecoverDocumentUseCase/DiscardRecoveryUseCase. See docs/Roadmap.md,
// 0.9.204: "The UI should not implement recovery itself."
export default {
    name: 'RecoveryBanner',
    props: {
        // { available, documentId, recovery: DocumentRevision, savedRevision, obsolete } | null
        status: {
            type: Object,
            default: null
        }
    },
    emits: ['recover', 'discard'],
    methods: {
        formatSavedAt(savedAt) {
            const date = new Date(savedAt);
            return Number.isNaN(date.getTime()) ? 'an earlier session' : date.toLocaleString();
        }
    },
    template: `
        <div v-if="status && status.available" class="recovery-banner" role="alert">
            <span class="recovery-banner-message">
                Unsaved changes from {{ formatSavedAt(status.recovery.savedAt) }} were found for this document.
            </span>
            <div class="recovery-banner-actions">
                <button class="action-btn action-btn--primary" @click="$emit('recover')">Recover</button>
                <button class="action-btn action-btn--secondary" @click="$emit('discard')">Discard</button>
            </div>
        </div>
    `
};
