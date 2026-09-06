// 0.9.187 — Automatic Snapshot Encounter Cascade.
// 0.9.193 — Automatic Snapshot Session-Lifetime Guard added SUPPRESSED,
// below.
//
// Names the ONLY values `application/AutomaticSnapshotEncounterCascade.js`
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
// two values, for the two questions none of those existing vocabularies can
// already answer: "was there even a processing subject here at all?" and
// (0.9.193) "did the session that started this cascade still exist by the
// time it reached World registration?"
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
    INELIGIBLE: 'ineligible',
    // 0.9.193 — the candidate resolved, materialized, and reached an
    // authoritative `SnapshotWorldPlacementOutcome.PLACED` placement — every
    // stage up to and including PLACE succeeded — but the injected
    // `isSessionActive()` predicate reported `false` at the exact,
    // synchronous instant this cascade was about to call
    // `registerMaterializedSnapshotWorldSource()`. See application/
    // AutomaticSnapshotEncounterCascade.js's own header, "0.9.193 —
    // Automatic Snapshot Session-Lifetime Guard": acquisition (resolve,
    // materialize, place) is NEVER rolled back or retried once SUPPRESSED —
    // only the one World-side side effect, registration, is withheld.
    // Reachable ONLY when a caller actually supplied `isSessionActive`; a
    // caller that never supplies one never sees this outcome, exactly as
    // before 0.9.193.
    SUPPRESSED: 'suppressed'
});
