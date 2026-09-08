// 0.8.25 — Explicit Snapshot Placement Creation UX.
//
// The placement-side counterpart of application/
// ExternalAnchorCreationUiState.js (0.8.11), mirrored deliberately —
// names every state a person can see while ui/views/
// DecentralizedPublicationsView.js drives ONE explicit "Create <storage>
// Placement" click through to a result, one axis over from "what should
// this one button/panel show right now" for anchoring.
//
//   IDLE        — no attempt has ever been made for this publication +
//                  storage type, in this browsing session.
//   CREATING    — a create() call is currently in flight. UI-only; never
//                  an application/SnapshotPlacementCreationOutcome.js
//                  value, because nothing external has answered yet.
//   CREATED     — the most recent attempt resolved to
//                  SnapshotPlacementCreationOutcome.CREATED.
//   UNAVAILABLE — the most recent attempt resolved to
//                  SnapshotPlacementCreationOutcome.PLACEMENT_UNAVAILABLE,
//                  OR application/SnapshotPlacementCreationCoordinator.js#
//                  create() itself threw (e.g. nobody is signed in) — the
//                  identical "a local precondition failure and an
//                  external 'couldn't reach it' both read, to a person,
//                  as 'nothing was placed'" restraint application/
//                  ExternalAnchorCreationUiState.js's own header already
//                  states, applied here one axis over.
//
// 0.9.301 — Preferred Content Provider Placement Trigger. A fifth value,
// PROVIDER_NOT_FOUND, was added for exactly one real domain outcome that
// did not exist when this file was first written: application/
// PreferredSnapshotPlacementCreationCoordinator.js (0.9.299) can resolve a
// stored CONTENT preference to `RoleProviderResolutionStatus.
// PROVIDER_NOT_FOUND` — a preference IS configured, but names a storage
// nothing on this replica is registered under. That is a genuinely
// different fact from UNAVAILABLE ("a real, resolved store could not
// presently be reached") — here no store was ever even resolved, let
// alone reached — and application/ContentProviderPreferenceReachabilityAudit
// .test.js (0.9.300, Section F) already named collapsing it into IDLE as
// a real display gap, not an acceptable simplification. See application/
// SnapshotPlacementCreationView.js's own header for how this value is
// produced, and this file's own "Deliberately no REJECTED state" note
// below for why THIS addition is not the same kind of move: PROVIDER_NOT_
// FOUND already has a real, shipped outcome behind it
// (RoleAwareProviderResolver.js, 0.9.295) — it is not a speculative,
// unbacked branch.
//
// DELIBERATELY NO REJECTED STATE. application/
// ExternalAnchorCreationUiState.js has a fourth value, REJECTED, because
// application/ExternalAnchorCreationOutcome.js has a real
// PUBLISH_REJECTED outcome behind it — a Bitcoin broadcaster really can
// reach the network and receive a definite no. application/
// SnapshotPlacementCreationOutcome.js's own header explains, in detail,
// why placing content-addressed bytes has no equivalent "definite no" —
// a content/ContentStore.js#put() either succeeds or the store could not
// presently be reached; there is no third, REJECTED-shaped answer a real
// content/IpfsContentStore.js (or any store this codebase has ever
// shipped) can give. Inventing a REJECTED UI state with no outcome ever
// capable of producing it would be exactly the kind of speculative,
// unbacked branch application/SnapshotPlacementCreationOutcome.js's own
// header has already refused, and this file refuses it too — for the
// identical reason, one layer up.
//
// THIS IS UI STATE, NEVER DOMAIN STATE — the identical restraint
// application/ExternalAnchorCreationUiState.js's own header already
// states, unchanged here: no value here is ever written onto a core/
// PublicationSnapshotPlacement.js, stored in application/
// LocalPublicationSnapshotPlacementCatalog.js, or persisted anywhere at
// all. Reopening the Publication Center always starts every button back
// at IDLE.
export const SnapshotPlacementCreationUiState = Object.freeze({
    IDLE: 'idle',
    CREATING: 'creating',
    CREATED: 'created',
    UNAVAILABLE: 'unavailable',
    PROVIDER_NOT_FOUND: 'provider-not-found'
});
