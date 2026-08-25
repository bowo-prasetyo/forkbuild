// 0.8.18 — Decentralized Snapshot Placement Foundation.
//
// Names every way application/CreateExternalSnapshotPlacementUseCase.js#
// execute() can end — the identical "name the difference structurally,
// not by convention" discipline application/
// ExternalAnchorCreationOutcome.js (0.8.10) already established, applied
// here to placing content instead of recording evidence.
//
//   CREATED               — the store accepted the bytes and application/
//                            CreatePublicationSnapshotPlacementUseCase.js
//                            (unchanged) signed and cataloged a real
//                            PublicationSnapshotPlacement from the
//                            resulting locator.
//   PLACEMENT_UNAVAILABLE — the store could not PRESENTLY place the
//                            bytes: no connectivity, a timeout, or the
//                            store simply threw. Retrying later may
//                            succeed.
//
// Unlike ExternalAnchorCreationOutcome, there is no PUBLISH_REJECTED
// counterpart here: a content-addressed store has no notion of
// definitively REFUSING well-formed bytes the way a Bitcoin broadcaster
// can definitively refuse a transaction (see anchoring/
// BitcoinAnchorPublisher.js's own header) — content/ContentStore.js#put()
// either succeeds or it does not reach the backend right now. Inventing
// a "rejected" outcome with no real adapter behavior to back it would be
// exactly the kind of speculative, unbacked branch this codebase's own
// outcome enums have always refused.
//
// On any outcome other than CREATED, no PublicationSnapshotPlacement
// exists — this codebase never catalogs a claim about a placement that
// did not actually happen.
export const SnapshotPlacementCreationOutcome = Object.freeze({
    CREATED: 'created',
    PLACEMENT_UNAVAILABLE: 'placement-unavailable'
});
