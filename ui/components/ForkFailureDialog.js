import { ForkFailureReason } from '../../application/ForkFailureReason.js';

// 0.9.353 — Fork Failure Reason Presentation.
//
// tests/RemotePublicationForkJourneyProductGapAudit.test.js Section F
// (0.9.352) traced the exact experience a fork failure gave a user: one
// transient toast reading a raw, class-name-prefixed Error string
// ("Fork failed: ForkDocumentUseCase: ..."), followed by an
// unconditional trip to a blank, un-contextualized new Editor document
// with no link back to the Publication or World they came from — and
// that was true whether the cause was a license denial or a retrieval
// failure, because both shared one undifferentiated Error type.
//
// This dialog is the presentation half of that fix (the other half,
// application/ForkFailureReason.js, is the signal it reads). It is
// deliberately the SAME small `.modal-overlay`/`.modal-panel`/
// `.modal-actions` shell ui/components/CreateBlueprintDialog.js and
// ui/components/MetadataEditorDialog.js already established — no
// second dialog pattern invented for this one case.
//
// Deliberately ONE action, not a Cancel/Confirm pair: there is nothing
// useful left to do in a blank Editor document a fork never actually
// produced, so Escape/backdrop-click and the button all resolve to the
// same `back` emission — see this file's own template, and
// ui/views/EditorView.js's own onForkFailureBack() for where that leads
// (the Publication's/World's own `/world/<id>` route, the SAME target
// ui/components/PublicationCatalog.js's own Explore action and
// ui/components/Toolbar.js's own "← Back to World" already navigate to
// — never a new, dialog-specific navigation concept).
//
// Reads ONLY `reason` — a ForkFailureReason value, or null for a cause
// this milestone did not name (an unexpected error some other layer
// threw). It never inspects an Error's own `.message`: inferring
// "license" or "unavailable" by pattern-matching text is exactly what
// 0.9.352's own brief warned against, and what application/
// ForkFailureReason.js exists to make unnecessary.
const FORK_FAILURE_MESSAGES = Object.freeze({
    [ForkFailureReason.LICENSE_DENIED]: 'This Publication cannot be forked under its license.',
    [ForkFailureReason.MATERIAL_UNAVAILABLE]: "This Publication's material is currently unavailable."
});

const FALLBACK_MESSAGE = 'This Publication could not be forked right now.';

export default {
    name: 'ForkFailureDialog',
    props: {
        reason: { type: String, default: null }
    },
    emits: ['back'],
    computed: {
        message() {
            return FORK_FAILURE_MESSAGES[this.reason] || FALLBACK_MESSAGE;
        }
    },
    methods: {
        onKeydown(event) {
            if (event.key === 'Escape') {
                event.stopPropagation();
                this.$emit('back');
            }
        }
    },
    template: `
        <div
            role="dialog"
            aria-label="Fork Unavailable"
            class="modal-overlay"
            @click.self="$emit('back')"
            @keydown="onKeydown"
        >
            <div class="modal-panel fork-failure-dialog">
                <h3>Fork Unavailable</h3>
                <p class="fork-failure-dialog-message">{{ message }}</p>
                <div class="modal-actions">
                    <button class="action-btn action-btn--primary" autofocus @click="$emit('back')">Back to Publication</button>
                </div>
            </div>
        </div>
    `
};
