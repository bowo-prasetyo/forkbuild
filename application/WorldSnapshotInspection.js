import { WorldEncounterPresentationSourceFamily } from './WorldEncounterPresentation.js';
import { materializedSnapshotWorldOrigin } from './MaterializedSnapshotWorldDiscoveryBridge.js';

// 0.9.177 — World Snapshot Inspection Detail.
//
// 0.9.176 made a materialized Snapshot's `sourceFamily` visible — a
// Wanderer can now tell, once selected, that a particular encounter came
// from a Snapshot rather than an ordinary local or peer-contributed
// Publication. It deliberately stopped there (see its own header,
// "Snapshot inspection/comparison detail... a richer Snapshot inspection
// surface is explicitly named as likely future, separate work"). This
// file is that next, narrower step: once an encounter is already known to
// be `SNAPSHOT`-sourced, what MORE can honestly be shown about it?
//
//   selectedEncounterPresentation   (application/WorldEncounterPresentation.js,
//        │                           0.9.176 — { kind, objectId, title/
//        │                           displayName, x, y, z, sourceFamily })
//        │
//        │           resolvedEncounterSelection   (WorldEncounterCanvas's
//        │                │                        own { kind, objectId,
//        │                │                        origin }, 0.9.20)
//        ▼                ▼
//   application/WorldSnapshotInspection.js   ★ (THIS milestone)
//        describeWorldSnapshotInspection()
//                       │
//                       ▼
//   { kind, objectId, publicationId, contentHash, position }   (SNAPSHOT)
//   null                                        (anything else)
//
// AN AUDIT FIRST, A DESCRIPTOR SECOND. Before writing this file, the
// question was not "what fields would look good on a Snapshot inspection
// panel" but "which Snapshot-specific facts are ALREADY, SAFELY reachable
// at the exact boundary `WorldEncounterCanvas` already inspects from" —
// without adding a new lookup, a new registry, or a new field carried
// through the existing DISCOVER -> ... -> REGISTER pipeline. The answer
// is narrower than a Snapshot's own full fact set:
//
//   REACHABLE HERE, WITHOUT ANY NEW PLUMBING:
//     - contentHash    — encoded directly in the resolved selection's own
//                         `origin` string, "snapshot:<contentHash>:<publicationId>"
//                         (application/MaterializedSnapshotWorldDiscoveryBridge.js,
//                         0.9.160/0.9.163) — the SAME string
//                         `application/WorldEncounterPresentation.js`'s own
//                         `describeWorldEncounterPresentationSourceFamily()`
//                         already pattern-matches for `sourceFamily`, one
//                         layer further.
//     - publicationId  — `presentation.objectId` IS the Publication's own
//                         `id` (core/WorldEncounter.js#describeEncounterablePublication()'s
//                         own `objectId: publication.id`, and
//                         `MaterializedSnapshotWorldDiscoveryBridge.js`'s own
//                         "the Publication object... its own `id` MUST
//                         MATCH THE PLACEMENT RESULT'S" invariant) —
//                         forwarded under its own Snapshot-vocabulary name
//                         alongside `objectId`, never computed anew.
//     - position       — `presentation.x`/`y`/`z`, 0.9.176's own forwarded
//                         copy of the World's own current placement — the
//                         SAME position `resolveSnapshotWorldPlacement()`
//                         (0.9.159) borrowed, unchanged, from
//                         `WorldNavigationSession#getPlacementInfo()`.
//
//   NOT REACHABLE HERE, YET, HONESTLY — DELIBERATELY EXCLUDED THIS
//   MILESTONE, NOT MERELY DEFERRED FOR TASTE:
//     - `claimedPosition` — `application/SnapshotWorldPositionClaim.js`'s
//       own (0.9.172) publisher claim lives ONLY inside
//       `ui/components/OwnPublicationPanel.js`'s own ephemeral
//       `selectedSnapshotWorldPositionClaimResult`, consumed once, at
//       placement time, into a SYNTHETIC `placementInfo` handed to
//       `resolveSnapshotWorldPlacement()`. Neither that placement result
//       nor `registerMaterializedSnapshotWorldSource()`'s own registered
//       source (`{ publicationId, position }` — no `placementId`, no claim
//       provenance) preserves whether the World's own current position
//       came from a consumed claim or from this replica's own pre-existing
//       local placement. By the time an encounter is selectable and
//       inspectable here, that distinction has already been erased
//       upstream — reconstructing it would mean piping a brand-new field
//       through registration (a new operational mechanism this milestone's
//       own brief explicitly excludes), not joining facts that already
//       exist at this boundary.
//     - `locator`/`storage` — core/PublicationSnapshotPlacement.js's own
//       retrieval identity is never included in
//       `registerMaterializedSnapshotWorldSource()`'s registered
//       `WorldDiscoverySource` at all (only `publication` and one
//       `{ publicationId, position }` placement entry are). Reaching it
//       from here would require either a NEW lookup this file would have
//       to perform itself (violating "pure... no registry access" below)
//       or plumbing it through registration for the first time — again, a
//       new mechanism, not an existing fact.
//   A future milestone that wants either fact inspectable would need to
//   carry it further UP the pipeline first (through registration, or
//   through placement) — a separate, larger, and NOT YET NEEDED seam. This
//   file reports exactly what is already true today, and nothing it would
//   have to guess, synthesize, or newly wire to make true.
//
// A JOIN OVER TWO ALREADY-COMPUTED FACTS, MIRRORING
// `describeWorldEncounterPresentation()`'S OWN SHAPE ONE LAYER UP. Exactly
// like that function takes `inspection` (the previous layer's own output)
// and `resolvedSelection` (a fact shared across layers) and combines
// exactly what each already knows, this file takes `presentation`
// (`describeWorldEncounterPresentation()`'s own 0.9.176 output — the
// previous layer) and the SAME `resolvedSelection` (needed here only to
// read `origin`, which presentation itself deliberately never forwards —
// see that file's own header, "every other field is forwarded verbatim,"
// which never named `origin` because inspection's own vocabulary never
// carried it). No new lookup, no new join by `publicationId`/`objectId`
// beyond confirming the two arguments actually name the SAME encounter —
// the identical `sameEncounter()` agreement check
// `WorldEncounterPresentation.js` already performs, held here for the
// identical reason: a caller may hand this function a `presentation` and
// a `resolvedSelection` captured at two different moments.
//
// NON-SNAPSHOT, OR UNRESOLVED, PRODUCES NOTHING TO INSPECT — NEVER A
// PARTIAL OR GUESSED DESCRIPTOR. `describeWorldSnapshotInspection()`
// returns `null` whenever `presentation` is missing/malformed, whenever
// `presentation.kind` is not `'PUBLICATION'` (0.9.176's own header: an
// avatar's own presence never arrives through a materialized Snapshot),
// whenever `presentation.sourceFamily` is not exactly
// `WorldEncounterPresentationSourceFamily.SNAPSHOT` (`LOCAL`, `PEER`, and
// `null` — the AMBIGUOUS/unresolved case — all report nothing to inspect
// here, the identical "nothing to report yet" reading `sourceFamily: null`
// already holds one layer up), or whenever `presentation` and
// `resolvedSelection` disagree about which encounter they each describe.
//
// `contentHash` DEGRADES TO `null` FOR A MALFORMED ORIGIN, NEVER GUESSED.
// Reuses `application/MaterializedSnapshotWorldDiscoveryBridge.js`'s own
// `materializedSnapshotWorldOrigin(contentHash, publicationId)` to
// re-derive the EXACT origin string a well-formed Snapshot registration
// would have produced for `presentation`'s own `objectId`/publicationId,
// then extracts `contentHash` only when `resolvedSelection.origin` matches
// that derivation exactly — never a bare string split (a `contentHash`
// value could, in principle, itself contain a colon; requiring the whole
// origin to match `snapshot:<contentHash>:<publicationId>` for the KNOWN
// `publicationId` sidesteps that ambiguity entirely, rather than guessing
// which colon-delimited segment is which). An origin that does not fit —
// malformed, or a caller error mismatching `presentation`/`resolvedSelection`
// — never throws; `contentHash` is `null`.
//
// PURE. NO I/O. NO NEW WORLD IDENTITY. NO REGISTRY ACCESS. This file never
// touches a `WorldDiscoverySourceRegistry`, never calls
// `registerMaterializedSnapshotWorldSource()`,
// `resolveSnapshotWorldPlacement()`, or `resolveSnapshotWorldPositionClaim()`
// themselves, and never decides whether a Snapshot exists, where it is
// placed, or whether any claim was ever consumed — those decisions already
// belong entirely to the existing pipeline. Every value this file returns
// is `Object.freeze()`'d; nothing passed in is ever mutated. Calling this
// function twice with byte-identical arguments returns a byte-identical
// result.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **`claimedPosition`, `positionRelation`, or any comparison between a
//   publisher's claim and the World's own current position.** See "not
//   reachable here, yet, honestly," above — the fact does not survive to
//   this boundary today. A future milestone that wants it must first carry
//   it through registration/placement; this file does not invent that
//   plumbing to fill in a field its own brief merely suggested.
// - **`locator`/`storage`, or any other Snapshot retrieval-identity
//   field.** See "not reachable here, yet, honestly," above.
// - **Trust, verified, freshness, ranking, "best," or any comparison
//   vocabulary of any kind.** Inherited unchanged from every file in this
//   chain — this file names WHAT is already true about a selected
//   Snapshot; it never judges it.
// - **Snapshot comparison, replacement, refresh, automatic discovery, or
//   automatic materialization.** This is a read-only inspection descriptor
//   over already-established World facts, never an action layer.
// - **A new World Encounter kind, a new registry identity, or a new
//   Snapshot lifecycle state.** `SNAPSHOT` remains exactly one
//   `WorldEncounterPresentationSourceFamily` value (0.9.176); this file
//   adds no new taxonomy of any kind.
// - **Any UI, panel, template, or rendering technology choice.** This file
//   returns a plain, frozen, inspection-SHAPED object; wiring it into
//   `ui/components/WorldEncounterCanvas.js`'s own existing inspection
//   panel is this milestone's own separate, smaller UI change, not this
//   file's own concern.

function sameEncounter(presentation, resolvedSelection) {
    return Boolean(resolvedSelection)
        && resolvedSelection.kind === presentation.kind
        && resolvedSelection.objectId === presentation.objectId;
}

function extractSnapshotContentHash(origin, publicationId) {
    if (typeof origin !== 'string' || typeof publicationId !== 'string' || publicationId.length === 0) {
        return null;
    }
    const prefix = 'snapshot:';
    const suffix = `:${publicationId}`;
    if (!origin.startsWith(prefix) || !origin.endsWith(suffix) || origin.length <= prefix.length + suffix.length) {
        return null;
    }
    const contentHash = origin.slice(prefix.length, origin.length - suffix.length);
    return materializedSnapshotWorldOrigin(contentHash, publicationId) === origin ? contentHash : null;
}

// describeWorldSnapshotInspection({ presentation, resolvedSelection }) ->
//   { kind: 'PUBLICATION', objectId, publicationId, contentHash, position }
//   null   (not a Snapshot-sourced, resolved PUBLICATION encounter)
//
// `presentation`       — `application/WorldEncounterPresentation.js`'s own
//                          already-computed `describeWorldEncounterPresentation()`
//                          result (0.9.176). Required; `null`/malformed, a
//                          non-`'PUBLICATION'` `kind`, or a `sourceFamily`
//                          other than `SNAPSHOT` all return `null`.
// `resolvedSelection`  — `ui/components/WorldEncounterCanvas.js`'s own
//                          already-computed `resolvedEncounterSelection`
//                          (0.9.20) — `{ kind, objectId, origin }` or
//                          `null`. Required to read `origin`; absent, or
//                          naming a different `kind`/`objectId` than
//                          `presentation`, returns `null` — see this file's
//                          own header, "non-Snapshot, or unresolved,
//                          produces nothing to inspect."
export function describeWorldSnapshotInspection({ presentation, resolvedSelection } = {}) {
    if (!presentation || typeof presentation.objectId === 'undefined' || presentation.objectId === null) {
        return null;
    }
    if (presentation.kind !== 'PUBLICATION') {
        return null;
    }
    if (presentation.sourceFamily !== WorldEncounterPresentationSourceFamily.SNAPSHOT) {
        return null;
    }
    if (!sameEncounter(presentation, resolvedSelection)) {
        return null;
    }

    const publicationId = presentation.objectId;
    const contentHash = extractSnapshotContentHash(resolvedSelection.origin, publicationId);

    return Object.freeze({
        kind: 'PUBLICATION',
        objectId: presentation.objectId,
        publicationId,
        contentHash,
        position: Object.freeze({ x: presentation.x, y: presentation.y, z: presentation.z })
    });
}
