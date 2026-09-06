// 0.9.187 — Automatic Snapshot Encounter Cascade.
//
// Names the ONLY value `application/AutomaticSnapshotEncounterCascade.js`
// invents on its own — the same "as small as possible" restraint every
// outcome enum in this family already holds (see application/
// SnapshotWorldPlacementOutcome.js's own header). Every OTHER outcome the
// cascade can produce is one of the existing, already-tested downstream
// vocabularies it composes, forwarded verbatim:
// `DecentralizedSnapshotResolutionOutcome` (resolution/verification),
// `SnapshotCandidateMaterializationOutcome`/`StoreSnapshotContentOutcome`
// (materialization), `SnapshotWorldPlacementOutcome` (UNPLACED — PLACED is
// never itself a terminal cascade result, see that file's own header), and
// `SnapshotWorldRegistrationOutcome` (REGISTERED). This file adds exactly
// one value for the ONE question none of those existing vocabularies can
// already answer: "was there even a processing subject here at all?"
export const AutomaticSnapshotEncounterCascadeOutcome = Object.freeze({
    // The candidate itself never became a processing subject — no
    // `contentHash`, no `publicationId` (candidates predating 0.9.171's
    // own optional publisher-claim fields carry no `publicationId` at
    // all, and this cascade has no OTHER way to name which Publication a
    // materialized Snapshot would belong to — see application/
    // AutomaticSnapshotEncounterCascade.js's own header, "a publicationId
    // is the processing subject, not just a placement optimization"), a
    // caller that never supplied `resolveSelectedSnapshotCommand`/
    // `materializeSelectedSnapshotCommand` at all, or a collaborator that
    // threw rather than resolving to its own documented outcome shape.
    // NEVER reachable once resolution was actually attempted — from that
    // point on, every stop is one of the outcomes named above, never this
    // one.
    INELIGIBLE: 'ineligible'
});
