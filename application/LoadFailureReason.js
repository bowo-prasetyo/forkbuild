// 0.9.574 — Repository Publication Lifecycle & Currency Product
// Reassessment, Section G.
//
// Mirrors application/ForkFailureReason.js's own shape for the identical
// class of question ("why didn't this work") applied to Open rather than
// Fork. LoadDocumentUseCase has exactly one failure cause today — the
// requested document id has no material in local storage — the same
// underlying condition ForkFailureReason.MATERIAL_UNAVAILABLE already
// names for Fork.
//
// A separate enum, not a shared import of ForkFailureReason, on purpose:
// Open and Fork are deliberately distinct actions (Open loads an existing
// document, Fork explicitly creates a new one), and LoadDocumentUseCase has no
// equivalent of Fork's license-check vocabulary — ForkFailureReason.
// LICENSE_DENIED simply does not apply to Open, so importing that enum
// here would offer a value Open could never legitimately throw.
//
// LoadDocumentUseCase attaches one of these as `.reason` on the Error it
// throws; a caller (ui/views/EditorView.js's own route.query.load
// handler) reads `err.reason` — a real, structural signal, never a
// string matched out of the message text — the same restraint
// application/ForkFailureReason.js already established.
export const LoadFailureReason = Object.freeze({
    MATERIAL_UNAVAILABLE: 'material-unavailable'
});
