// 0.9.353 — Fork Failure Reason Presentation.
//
// application/ForkDocumentUseCase.js has always had exactly two distinct
// failure causes (see tests/RemotePublicationForkJourneyProductGapAudit.test.js
// Section E, "6. exactly 2 distinct failure causes") — a license that
// denies forking, and source material that could not be loaded — but
// both were raised as the same undifferentiated `Error`, forcing any
// caller who wanted to tell them apart into string-matching a message.
// This is the smallest possible seam that fixes that: a plain, frozen
// enum of the two reason CODES, mirroring the naming shape
// application/PublicationResolutionOutcome.js's own resolution layer
// already established for the identical class of question ("why didn't
// this work") — never a new error-class hierarchy, never a UI framework.
//
// ForkDocumentUseCase attaches one of these as `.reason` on the Error it
// throws; ui/views/EditorView.js's own fork-failure handler reads
// `err.reason` — a real, structural signal, never a string-matched
// guess at the message text (see this milestone's own docs/Roadmap.md
// entry for why that distinction mattered).
export const ForkFailureReason = Object.freeze({
    LICENSE_DENIED: 'license-denied',
    MATERIAL_UNAVAILABLE: 'material-unavailable'
});
