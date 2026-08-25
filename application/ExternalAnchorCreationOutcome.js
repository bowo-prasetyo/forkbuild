// 0.8.10 — External Anchor Creation Orchestration & Publisher Registry.
//
// Names every way application/CreateExternalPublicationAnchorUseCase.js#
// execute() can end, in the same order its own pipeline checks them —
// the identical "name the difference structurally, not by convention"
// discipline application/PublicationResolutionOutcome.js (0.7.1) and
// application/AnchorVerificationOutcome.js (0.8.1) already established,
// applied here to a THIRD axis: whether an external recording operation
// this codebase itself just requested actually succeeded.
//
//   CREATED             — the publisher's broadcast was accepted and
//                          application/CreatePublicationAnchorUseCase.js
//                          (0.8.8, unchanged) signed and cataloged a real
//                          PublicationAnchor from the resulting evidence
//   PUBLISH_REJECTED    — the publisher reached a DEFINITE no: the
//                          external system was reached and it refused
//                          this recording (e.g. rejected as
//                          non-standard, double-spend). Retrying with the
//                          identical input is unlikely to help.
//   PUBLISH_UNAVAILABLE — the publisher could not PRESENTLY tell: no
//                          connectivity, no funds currently available,
//                          a timeout, or the publisher simply threw.
//                          NEVER treated the same as PUBLISH_REJECTED —
//                          retrying later may succeed, exactly the
//                          distinction anchoring/BitcoinAnchorPublisher.js
//                          (0.8.9) already draws in its own `publish()`
//                          result.
//
// On any outcome other than CREATED, no PublicationAnchor exists — this
// codebase never catalogs a claim about an external recording that did
// not actually happen. See docs/Principles.md, "A Publisher's Failure Is
// Not the Orchestration's Failure — But It Is Still No Anchor (0.8.10)."
export const ExternalAnchorCreationOutcome = Object.freeze({
    CREATED: 'created',
    PUBLISH_REJECTED: 'publish-rejected',
    PUBLISH_UNAVAILABLE: 'publish-unavailable'
});
