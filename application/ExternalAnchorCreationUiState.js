// 0.8.11 — Explicit External Anchoring UX.
//
// Names every state a person can see while ui/views/
// DecentralizedPublicationsView.js drives ONE explicit "Create <anchor
// type> Anchor" click through to a result — the identical "name the
// difference structurally, not by convention" discipline application/
// PublicationResolutionOutcome.js, application/AnchorVerificationOutcome
// .js, and application/ExternalAnchorCreationOutcome.js already
// established, applied here to a FOURTH axis: not "what happened
// externally" (that's still ExternalAnchorCreationOutcome's own job —
// CREATED/PUBLISH_REJECTED/PUBLISH_UNAVAILABLE), but "what should this
// one button/panel show right now."
//
//   IDLE        — no attempt has ever been made for this publication +
//                  anchorType, in this browsing session.
//   CREATING    — a create() call is currently in flight. UI-only; never
//                  an ExternalAnchorCreationOutcome value, because
//                  nothing external has answered yet.
//   CREATED     — the most recent attempt resolved to
//                  ExternalAnchorCreationOutcome.CREATED.
//   REJECTED    — the most recent attempt resolved to
//                  ExternalAnchorCreationOutcome.PUBLISH_REJECTED.
//   UNAVAILABLE — the most recent attempt resolved to
//                  ExternalAnchorCreationOutcome.PUBLISH_UNAVAILABLE, OR
//                  application/PublicationAnchorCreationCoordinator.js#
//                  create() itself threw (e.g. nobody is signed in) —
//                  see application/PublicationAnchorCreationView.js's own
//                  header on why a local precondition failure and an
//                  external "couldn't reach it" both read, to a person,
//                  as "no anchor was created; nothing external
//                  happened" — never confused with REJECTED, which means
//                  the external system was reached and said no.
//
// THIS IS UI STATE, NEVER DOMAIN STATE. No value here is ever written
// onto a core/PublicationAnchor.js, stored in application/
// LocalPublicationAnchorCatalog.js, or persisted anywhere at all — it
// lives only in whatever ephemeral object a caller (ui/views/
// DecentralizedPublicationsView.js) keeps in its own component state for
// the lifetime of the page, exactly as application/
// PublicationEvidenceView.js's own `verification` shape already does for
// verification results (0.8.3). Reopening the Publication Center always
// starts every button back at IDLE — this file's own values are never
// re-derived from anything durable, because there is nothing durable to
// re-derive them from. See docs/Principles.md, "External Anchoring Is An
// Explicit User Action (0.8.11)."
export const ExternalAnchorCreationUiState = Object.freeze({
    IDLE: 'idle',
    CREATING: 'creating',
    CREATED: 'created',
    REJECTED: 'rejected',
    UNAVAILABLE: 'unavailable'
});
