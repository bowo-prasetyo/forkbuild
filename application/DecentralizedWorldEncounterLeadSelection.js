import {
    resolveDecentralizedWorldEncounterLead,
    resolveDecentralizedWorldEncounterLeadFromRegistry,
    DecentralizedWorldEncounterLeadResolutionStatus
} from './DecentralizedWorldEncounterLeadResolution.js';

// 0.9.40 — Decentralized Lead Resolution Integration.
//
// 0.9.28 already answers "given a requested material, which currently-known
// decentralized lead(s), if any, does the available evidence connect to
// it?" — and stops there on purpose, entirely below the UI: its own
// `requestedMaterial` argument is a plain `{ kind, objectId }` pair, not
// `ui/components/WorldEncounterCanvas.js`'s own `selectedEncounter`
// vocabulary. Nothing until now has exposed that already-finished machinery
// in the shape a caller sitting at the UI boundary actually wants — the
// exact "one seam, no second algorithm" gap
// `application/WorldEncounterSelectionOutcome.js` (0.9.20) already filled
// for `WorldDiscoverySource`s, never filled for leads. This file is that
// seam, and only that seam.
//
//   ui/components/WorldEncounterCanvas.js's own
//        selectedEncounter = { kind, objectId }                (0.9.4, unchanged)
//                       │
//                       │      DecentralizedWorldDiscoveryLeadRegistry (0.9.26)
//                       │           / already-described `leads` array
//                       │                          │
//                       │      caller-supplied `associations` array — explicit
//                       │           evidence; see core/
//                       │           DecentralizedWorldEncounterLeadAssociation.js
//                       ▼                          ▼
//   application/DecentralizedWorldEncounterLeadSelection.js   ★ (THIS)
//        describeDecentralizedWorldEncounterLeadSelectionOutcome()
//        describeDecentralizedWorldEncounterLeadSelectionOutcomeFromRegistry()
//                       │
//                       ▼
//   application/DecentralizedWorldEncounterLeadResolution.js   (0.9.28,
//        resolveDecentralizedWorldEncounterLead()                unmodified)
//        resolveDecentralizedWorldEncounterLeadFromRegistry()
//                       │
//                       ▼
//        { status, candidates, resolvedLead }
//                       │
//                       ▼
//   ui/components/WorldEncounterCanvas.js   (THIS same milestone, separately)
//        decentralizedLeadOutcome — see that file's own "0.9.40" header
//
// A RENAMING SEAM, NEVER A SECOND RESOLUTION ALGORITHM. This file performs
// no matching of its own — it never reads a lead's own `discoveryTag`/`uri`,
// never imports `core/DecentralizedWorldEncounterLeadAssociation.js`, and
// never touches `application/DecentralizedWorldDiscoveryLeadRegistry.js`
// directly. Both functions below do exactly one thing: adapt
// `selectedEncounter` into 0.9.28's own `requestedMaterial` argument name,
// call 0.9.28's own already-authoritative function unchanged, and return
// its result byte-for-byte. `DecentralizedWorldEncounterLeadSelectionOutcomeStatus`
// is not a new enum — it is the exact same frozen object
// `DecentralizedWorldEncounterLeadResolutionStatus` already is, exported
// under this file's own name purely so a caller of this seam never has to
// reach one layer down to read a status constant.
//
// `selectedEncounter` NEEDS NO `origin` FIELD, AND NONE IS EVER READ. Per
// 0.9.28's own header, "`requestedMaterial` is `{ kind, objectId }` —
// deliberately not a full `{ kind, objectId, origin }` selection identity"
// — a decentralized lead's own provenance has never been part of the
// local/peer `origin` vocabulary `core/WorldEncounterSelectionIdentity.js`
// names. This file accepts exactly 0.9.4's own `selectedEncounter` shape,
// unmodified, and forwards only its `kind`/`objectId` fields onward (via
// 0.9.28's own already-established validation, never re-validated here).
//
// EVIDENCE IS SUPPLIED, NEVER INFERRED — INHERITED UNCHANGED FROM 0.9.28
// AND 0.9.29. This file introduces no evidence producer of its own; a
// caller already holding real association evidence (today, in practice,
// typically an empty array — see 0.9.28's own "no producer of real
// association evidence exists yet") supplies it as `associations`,
// forwarded verbatim.
//
// THREE STATUSES, NEVER A RANKING BETWEEN THEM — INHERITED UNCHANGED FROM
// 0.9.28. This file never picks one candidate among an `AMBIGUOUS` result's
// own `candidates`; deciding what to do about that remains
// `ui/components/WorldEncounterCanvas.js`'s own job, exactly the same
// restraint 0.9.20 already holds for selection-origin ambiguity.
//
// `...FromRegistry()` MIRRORS 0.9.28's OWN REGISTRY WRAPPER, EXACTLY, ONE
// LAYER OVER — the same "read `registry.listLeads()`, hand the result to
// the plain-array-taking function, return its result verbatim" shape
// `resolveDecentralizedWorldEncounterLeadFromRegistry()` itself already
// holds one layer down. This file's own registry wrapper does nothing else.
//
// NO SCORE, RANK, TRUST, VERIFIED, "PREFERRED," OR COMPARISON VOCABULARY OF
// ANY KIND — inherited unchanged from every file in this chain.
//
// MALFORMED INPUT DEGRADES EXACTLY AS 0.9.28 ALREADY DEGRADES IT, NEVER
// THROWS. A missing/malformed `selectedEncounter`, `leads`, `registry`, or
// `associations` reaches 0.9.28's own functions first, which already
// degrade to `UNAVAILABLE` for every one of those cases — this file adds no
// second validation pass and no second degrade path.
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK, NO CLOCK —
// inherited unchanged from 0.9.28. Calling either function twice with
// byte-identical arguments returns a byte-identical result, because 0.9.28's
// own functions already make that same promise.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Producing, deriving, or validating association evidence of any
//   kind.** See "evidence is supplied, never inferred," above — that
//   remains `core/DecentralizedWorldEncounterLeadAssociation.js`'s (0.9.28)
//   and `application/DecentralizedWorldEncounterLeadAssociationEvidenceIngress.js`'s
//   (0.9.29) own job, unchanged.
// - **Choosing one lead among an `AMBIGUOUS` result's own `candidates`.**
//   See "three statuses, never a ranking," above — that remains
//   `ui/components/WorldEncounterCanvas.js`'s own job, one layer up.
// - **Retrieving a resolved lead's own `uri`, loading material, or any
//   verification of any kind.** This file names a lead; it never acts on
//   one.
// - **Any UI, panel, or rendering technology choice.** This file returns a
//   plain, frozen, renamed result; rendering it is
//   `ui/components/WorldEncounterCanvas.js`'s own separate job, this same
//   milestone.
// - **Querying a discovery service, or feeding a query's own result into a
//   registry.** This file only ever reads an already-populated registry's
//   current snapshot (via its own `...FromRegistry()` wrapper) or an
//   already-supplied `leads` array — never `application/
//   DecentralizedWorldDiscoveryQuery.js` or `application/
//   DecentralizedWorldDiscoveryQueryRegistryBridge.js`.

export const DecentralizedWorldEncounterLeadSelectionOutcomeStatus = DecentralizedWorldEncounterLeadResolutionStatus;

// Pure. Adapts `selectedEncounter` — 0.9.4's own `{ kind, objectId }`
// shape — into 0.9.28's own `requestedMaterial` argument and returns
// `resolveDecentralizedWorldEncounterLead()`'s own result verbatim. See
// this file's own header, "a renaming seam, never a second resolution
// algorithm." Never throws; degrades exactly as 0.9.28 already degrades.
export function describeDecentralizedWorldEncounterLeadSelectionOutcome({ selectedEncounter, leads, associations } = {}) {
    return resolveDecentralizedWorldEncounterLead({ requestedMaterial: selectedEncounter, leads, associations });
}

// Pure. Reads `registry.listLeads()` (via 0.9.28's own
// `resolveDecentralizedWorldEncounterLeadFromRegistry()`) and returns
// exactly what that function returns for `selectedEncounter`'s own adapted
// `requestedMaterial` — see this file's own header, "mirrors 0.9.28's own
// registry wrapper, exactly." A `registry` missing a `listLeads` method is
// treated as contributing no leads at all.
export function describeDecentralizedWorldEncounterLeadSelectionOutcomeFromRegistry({ selectedEncounter, registry, associations } = {}) {
    return resolveDecentralizedWorldEncounterLeadFromRegistry({ requestedMaterial: selectedEncounter, registry, associations });
}
