import { LOCAL_WORLD_DISCOVERY_ORIGIN } from './WorldEncounterIntegration.js';

// 0.9.176 — World Snapshot Presentation.
//
// 0.9.161 through 0.9.175 proved the complete DISCOVER -> SELECT -> RESOLVE
// -> VERIFY -> MATERIALIZE -> CONSUME POSITION CLAIM -> PLACE -> REGISTER ->
// WORLD ENCOUNTER -> SELECT -> LOAD MATERIAL -> RENDER path structurally
// sound, one seam at a time, and 0.9.175's own audit closed the last
// selection-consistency gap in it. Nothing in that entire chain ever gave a
// Wanderer a way to tell that a particular World Encounter came from a
// materialized Snapshot rather than an ordinary local or peer-contributed
// Publication — every encounter has rendered, and inspected, identically
// regardless of which `WorldDiscoverySource` produced it. This file is the
// missing presentation fact, and only that fact.
//
//   ui/components/WorldEncounterCanvas.js's own
//        selectedEncounterInspection = { kind, objectId, title/displayName,
//                                         x, y, z, ... }      (0.9.16/0.9.18)
//        resolvedEncounterSelection  = { kind, objectId, origin }   (0.9.20)
//                       │                        │
//                       └───────────┬────────────┘
//                                   ▼
//        application/WorldEncounterPresentation.js   ★ (THIS milestone)
//              describeWorldEncounterPresentation()
//                       │
//                       ▼
//        { kind, objectId, title/displayName, x, y, z, sourceFamily }
//                       │
//                       ▼
//        ui/components/WorldEncounterCanvas.js's own inspection panel
//              (renders sourceFamily as a friendly "Source" row)
//
// A JOIN OVER TWO ALREADY-COMPUTED FACTS, NEVER A THIRD DATA SOURCE. This
// file reads nothing from a registry, a `Publication`, or a
// `WorldDiscoverySource` itself — it takes `application/
// WorldEncounterInspection.js`'s own already-joined inspection row (0.9.16,
// unmodified) and `WorldEncounterCanvas.js`'s own already-resolved
// `{ kind, objectId, origin }` selection (0.9.20, unmodified) and combines
// exactly what each already knows. No new lookup, no new join by
// `publicationId`/`objectId` beyond confirming the two arguments actually
// name the SAME encounter (see "sourceFamily is null whenever the two
// arguments disagree," below).
//
// `sourceFamily` IS THE ONE NEW FACT — DERIVED FROM `origin`'S EXISTING
// STRING SHAPE, NEVER A NEW TAXONOMY. `application/WorldEncounterMaterialLoading.js`'s
// own `materialSourceFor()` (0.9.21, updated 0.9.166) already classifies
// `origin` into exactly three families for routing purposes —
// `origin === LOCAL_WORLD_DISCOVERY_ORIGIN`, `origin.startsWith('peer:')`,
// `origin.startsWith('snapshot:')` — and this file names that SAME
// classification for presentation, reusing the identical string patterns
// rather than inventing a fourth. `WorldEncounterPresentationSourceFamily`
// holds exactly `LOCAL`, `PEER`, and `SNAPSHOT` — no `NOSTR`, no `ARWEAVE`,
// no per-service breakout (mirroring `application/PublicationMaterialProvenance.js`'s
// own "deliberately two values, never more" restraint one layer over, for a
// different pair of values). An origin matching none of the three patterns
// (a future family this file has never heard of) produces `sourceFamily:
// null` rather than guessing or throwing.
//
// `sourceFamily` IS NULL WHENEVER THE TWO ARGUMENTS DISAGREE, OR WHEN
// `resolvedSelection` IS ABSENT. `resolvedEncounterSelection` is `null`
// whenever a selection is `'AMBIGUOUS'` with no explicit Wanderer choice
// yet, or `'UNAVAILABLE'` — see `application/WorldEncounterSelectionOutcome.js`'s
// own header, "resolvedSelection is set only when the answer is already
// unambiguous." This file never guesses a source family from an ambiguous
// or absent resolution, and never attaches one `resolvedSelection`'s own
// `origin` to an `inspection` naming a DIFFERENT `kind`/`objectId` (a caller
// mixing up two different moments' own values) — both degrade to
// `sourceFamily: null`, the same "nothing to report yet" reading every
// other field in this chain already gives an unresolved selection.
//
// EVERY OTHER FIELD IS FORWARDED VERBATIM, UNDER ITS OWN EXISTING NAME.
// `title`/`x`/`y`/`z` on a publication row, and `displayName`/`x`/`y`/`z` on
// an avatar row, are each `inspection`'s own field, unchanged. Nothing is
// renamed, recomputed, or reformatted. `objectId` is deliberately not
// renamed to `publicationId` — the identical "objectId is deliberately not
// renamed" restraint `application/WorldEncounterReadModel.js`'s own header
// already holds, continued here for the same reason: this file is 0.9.0's
// own vocabulary, one layer further, never a Snapshot-specific rename.
//
// TWO KINDS, NEVER MERGED — inherited unchanged from every file in this
// chain. A publication presentation and an avatar presentation are two
// distinct shapes with two distinct field sets, exactly like `application/
// WorldEncounterInspection.js`'s own two branches. An avatar CAN carry a
// non-null `sourceFamily` of `LOCAL` or `PEER` (an avatar's own presence
// arrives through the same origin-routed World, never through a
// materialized Snapshot — `application/MaterializedSnapshotWorldDiscoveryBridge.js`'s
// own `registerMaterializedSnapshotWorldSource()` only ever registers
// publications/placements, never avatar profiles/presences) — this file
// does not special-case that; it simply never observes `SNAPSHOT` there in
// practice, because nothing ever registers one.
//
// NO SCORE, RANK, TRUST, VERIFIED, "BEST," FRESHNESS, OR COMPARISON
// VOCABULARY OF ANY KIND — inherited unchanged from every file in this
// chain. `sourceFamily` names WHERE an already-selected encounter's own
// material would be loaded from; it never judges that source against any
// other, never picks one Snapshot as "the" Snapshot for an `objectId`, and
// never decides that a `SNAPSHOT`-family encounter is more or less
// trustworthy than a `LOCAL` or `PEER` one.
//
// PURE. NO I/O. NO NEW WORLD IDENTITY. This file never touches a
// `WorldDiscoverySourceRegistry`, never calls `deriveWorldEncounters()`,
// `describeWorldEncounterSelectionOutcome()`, or `loadWorldEncounterMaterial()`
// itself, and never decides whether a Snapshot exists or where it is placed
// — those decisions already belong entirely to the existing pipeline (see
// this milestone's own brief). It only describes, for presentation, what an
// already-resolved selection already implies. Every value this file returns
// is `Object.freeze()`'d; nothing passed in is ever mutated. Calling either
// function twice with byte-identical arguments returns a byte-identical
// result.
//
// MALFORMED INPUT DEGRADES TO `null`, NEVER THROWS. A missing/malformed
// `inspection` (no genuine `objectId`) returns `null` from
// `describeWorldEncounterPresentation()` — the same "nothing to inspect,
// nothing to present" reading `application/WorldEncounterInspection.js`
// already holds one layer down. `describeWorldEncounterPresentationSourceFamily()`
// returns `null` for a missing/non-string/unrecognized `origin`.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Marking a marker's own glyph, color, or shape before it is ever
//   selected.** `ui/components/WorldEncounterMarker.js`'s own rendering
//   still depends only on `kind`/`x`/`y`/`label` (0.9.3/0.9.4, unmodified);
//   distinguishing a Snapshot-origin marker from an ordinary one BEFORE a
//   Wanderer selects it would require joining per-source origin into the
//   whole, still deliberately origin-blind `effectiveView` — a separate,
//   larger seam than "derive presentation information from an existing
//   resolved/selected encounter," and explicitly left for later, separate,
//   unscheduled work.
// - **Ranking, "best," or automatic Snapshot selection among several
//   candidates.** See "no score, rank, trust..." above — `application/
//   WorldEncounterSelectionOutcome.js`'s own `'AMBIGUOUS'`/explicit-choice
//   mechanism is untouched.
// - **A Snapshot-specific `WorldEncounter` kind, a new registry mechanism,
//   or a second rendering pipeline.** `sourceFamily` is presentation
//   metadata about an ordinary `PUBLICATION`/`AVATAR` encounter, never a
//   third `WorldEncounterKind`.
// - **Snapshot inspection/comparison detail — contentHash, locator,
//   discovery tag, or any Nostr/Arweave-specific field.** See this
//   milestone's own brief, "presentation... has access to... source/
//   presentation information," deliberately kept to the one coarse family
//   fact; a richer Snapshot inspection surface is explicitly named as
//   likely future, separate work.
// - **Persistence, synchronization, caching, or automatic recomputation of
//   any kind.** This file runs only when a caller explicitly calls it.

export const WorldEncounterPresentationSourceFamily = Object.freeze({
    LOCAL: 'LOCAL',
    PEER: 'PEER',
    SNAPSHOT: 'SNAPSHOT'
});

// Pure. Classifies an `origin` string into one of the three families this
// codebase's own origin-routed loading boundary already recognizes (see
// `application/WorldEncounterMaterialLoading.js#materialSourceFor()`,
// unmodified, for the identical patterns). Returns `null`, never throws,
// for a missing/non-string/unrecognized `origin`.
export function describeWorldEncounterPresentationSourceFamily(origin) {
    if (origin === LOCAL_WORLD_DISCOVERY_ORIGIN) {
        return WorldEncounterPresentationSourceFamily.LOCAL;
    }
    if (typeof origin === 'string' && origin.startsWith('peer:')) {
        return WorldEncounterPresentationSourceFamily.PEER;
    }
    if (typeof origin === 'string' && origin.startsWith('snapshot:')) {
        return WorldEncounterPresentationSourceFamily.SNAPSHOT;
    }
    return null;
}

function sameEncounter(inspection, resolvedSelection) {
    return Boolean(resolvedSelection)
        && resolvedSelection.kind === inspection.kind
        && resolvedSelection.objectId === inspection.objectId;
}

// describeWorldEncounterPresentation({ inspection, resolvedSelection }) ->
//   { kind, objectId, title, x, y, z, sourceFamily }              (publication)
//   { kind, objectId, displayName, x, y, z, sourceFamily }        (avatar)
//   null                                        (nothing to present)
//
// `inspection`         — `application/WorldEncounterInspection.js`'s own
//                          already-computed `describeWorldEncounterInspection()`
//                          result (0.9.16/0.9.18). Required; `null`/malformed
//                          (no genuine `objectId`) returns `null`.
// `resolvedSelection`  — `ui/components/WorldEncounterCanvas.js`'s own
//                          already-computed `resolvedEncounterSelection`
//                          (0.9.20) — `{ kind, objectId, origin }` or `null`.
//                          Optional; when absent, or when it names a
//                          different `kind`/`objectId` than `inspection`,
//                          `sourceFamily` is `null` — see this file's own
//                          header, "sourceFamily is null whenever the two
//                          arguments disagree."
export function describeWorldEncounterPresentation({ inspection, resolvedSelection } = {}) {
    if (!inspection || typeof inspection.objectId === 'undefined' || inspection.objectId === null) {
        return null;
    }

    const sourceFamily = sameEncounter(inspection, resolvedSelection)
        ? describeWorldEncounterPresentationSourceFamily(resolvedSelection.origin)
        : null;

    if (inspection.kind === 'PUBLICATION') {
        return Object.freeze({
            kind: 'PUBLICATION',
            objectId: inspection.objectId,
            title: inspection.title,
            x: inspection.x,
            y: inspection.y,
            z: inspection.z,
            sourceFamily
        });
    }

    if (inspection.kind === 'AVATAR') {
        return Object.freeze({
            kind: 'AVATAR',
            objectId: inspection.objectId,
            displayName: inspection.displayName,
            x: inspection.x,
            y: inspection.y,
            z: inspection.z,
            sourceFamily
        });
    }

    return null;
}
