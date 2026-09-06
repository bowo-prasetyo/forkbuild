import { WorldEncounterMaterialLoadStatus } from './WorldEncounterMaterialLoading.js';

// 0.9.183 — World Snapshot Content View.
//
// 0.9.180's own boundary audit closed the decentralized Snapshot -> World
// participation lifecycle; 0.9.181/0.9.182 then answered a comparison
// question ("do these two Publications carry the same content?") entirely
// from already-known facts, deliberately never rendering either
// Publication's own material. This milestone closes the other half of that
// same gap — not "are these the same," but:
//
//   Given a selected Snapshot-sourced Publication whose material has
//   ALREADY been loaded through the existing World material pipeline, what
//   IS that Snapshot's content?
//
//   application/WorldSnapshotInspection.js's own descriptor (0.9.177)
//        │        { kind: 'PUBLICATION', objectId, publicationId,
//        │          contentHash, position }
//        │
//        │  application/WorldEncounterMaterialInspection.js's own
//        │  ALREADY-COMPUTED result (0.9.39, unmodified)
//        │        { selection, lead, loading, verification }
//        ▼
//   application/WorldSnapshotContentView.js   ★ (THIS milestone)
//        describeWorldSnapshotContentView({ inspection, materialInspection })
//                       │
//                       ▼
//   { publicationId, contentHash, material, position }
//   null   (not a Snapshot-sourced selection, or its material is not
//           currently AVAILABLE)
//
// A JOIN OVER TWO ALREADY-COMPUTED FACTS, NOTHING MORE — MIRRORING
// `describeWorldSnapshotInspection()`'S OWN SHAPE EXACTLY, ONE LAYER OVER.
// This file performs no lookup, no retrieval, and no I/O of its own. It
// never calls `inspectWorldEncounterMaterial()`,
// `loadWorldEncounterMaterial()`, or anything upstream of them — a caller
// already holds both arguments before this function is ever invoked.
//
// "AVAILABLE" IS THE ONLY GATE — THE SAME GATE `distributablePublication`
// (0.9.104) ALREADY USES FOR THE IDENTICAL MATERIAL. This file requires
// `materialInspection.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE`
// and a genuinely truthy `materialInspection.loading.material` — never a
// `verification.status` of `VERIFIED` (see `application/
// WorldEncounterMaterialInspection.js`'s own `distributablePublication`
// precedent, one component over: distributing and viewing already-loaded
// material both stop at "is it here," not "is it trusted." Verification
// stays its own, independent, already-rendered fact — see docs/Principles.md,
// "The UI Displays Observations; It Does Not Turn Them Into A Verdict."
//
// `inspection` AND `materialInspection` MUST NAME THE SAME ENCOUNTER, OR
// THIS RETURNS `null` — THE IDENTICAL "TWO ARGUMENTS CAPTURED AT DIFFERENT
// MOMENTS" GUARD `describeWorldSnapshotInspection()` ALREADY HOLDS.
// `materialInspection` is written asynchronously
// (`refreshMaterialInspection()`, 0.9.39) and can, for one microtask, still
// describe the PREVIOUS selection's own material while `inspection` already
// describes a freshly-selected one — collapsing that window down to `null`
// here means a Wanderer can never be shown Publication A's material
// labeled as Publication B's Content View, even for a single frame.
//
// `material` IS FORWARDED VERBATIM, NEVER PARSED, NEVER RE-SHAPED. Whatever
// `materialInspection.loading.material` already is (the same `Publication`
// domain object `application/LocalWorldEncounterMaterialSource.js` already
// hands out for a local-origin OR `snapshot:*`-origin selection alike — see
// that file's own header) is placed onto this descriptor's own `material`
// field unchanged. This file never reads inside it, never extracts a
// document body, and never decodes any bytes.
//
// `publicationId`/`contentHash`/`position` ARE `inspection`'s OWN FIELDS,
// FORWARDED VERBATIM — NEVER RE-DERIVED FROM `material`. Exactly like
// `application/WorldSnapshotComparison.js`'s own header insists
// `publicationId` never collapses into `contentHash`, this file never
// substitutes a value read off the loaded `material` (e.g. `material.id`,
// `material.contentHash`) for the ALREADY-VERIFIED-AGAINST-THE-REGISTERED-
// ORIGIN facts `describeWorldSnapshotInspection()` (0.9.177) already
// computed. Two Publications sharing an identical `contentHash` still each
// produce a Content View carrying their OWN, distinct `publicationId` — see
// "same content, different Publication," below.
//
// SAME CONTENT, DIFFERENT PUBLICATION — NO DEDUPLICATION, EVER. Viewing
// Publication A never shows Publication B's material, and vice versa, even
// when `compareSnapshotWorldPublications()` (0.9.181) would report
// `SAME_CONTENT` for the pair. This file has no knowledge of comparison at
// all — it is handed exactly one `inspection`/`materialInspection` pair and
// describes exactly the one Publication they name.
//
// PURE. NO I/O. NO REGISTRY ACCESS. NO NEW MATERIAL LOADER. This file never
// touches `WorldDiscoverySourceRegistry`, never calls
// `inspectWorldEncounterMaterial()`/`loadWorldEncounterMaterial()`, and
// never decides whether a Snapshot exists, is placed, or is verified —
// every one of those questions is already answered, upstream, by the
// existing pipeline. Every value this file returns is `Object.freeze()`'d;
// nothing passed in is ever mutated. Calling this function twice with
// byte-identical arguments returns a byte-identical result.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Discovery, resolution, materialization, or distribution of any
//   kind.** This file consumes an already-loaded material fact; it never
//   triggers loading a new one.
// - **A new World Encounter kind, a new registry identity, or a new
//   Snapshot lifecycle state.** `SNAPSHOT` remains exactly one
//   `WorldEncounterPresentationSourceFamily` value (0.9.176); this file
//   adds no new taxonomy of any kind.
// - **A side-by-side comparison viewer.** This file describes exactly one
//   Publication's own content, never a pair. Combining this with 0.9.181's
//   own comparison fact is explicitly later, unscheduled work.
// - **Rendering arbitrary HTML/media/application content, decoding
//   document bytes, or interpreting `material` in any way.** `material` is
//   forwarded as the same structured `Publication` domain object it always
//   was — never fetched bytes, never parsed markup.
// - **Editing, re-publishing, exporting, or downloading the viewed
//   content.** This is a read-only descriptor over already-in-memory data.
// - **Trust, verified, freshness, ranking, or any comparison vocabulary of
//   any kind.** Inherited unchanged from every file in this chain.
// - **Any UI, panel, template, or rendering technology choice.** This file
//   returns a plain, frozen, content-view-SHAPED object; wiring it into
//   `ui/components/WorldEncounterCanvas.js`'s own existing inspection panel
//   is this milestone's own separate, smaller UI change, not this file's
//   own concern.

function sameEncounter(inspection, materialInspection) {
    return Boolean(materialInspection)
        && Boolean(materialInspection.selection)
        && materialInspection.selection.kind === inspection.kind
        && materialInspection.selection.objectId === inspection.objectId;
}

// describeWorldSnapshotContentView({ inspection, materialInspection }) ->
//   { publicationId, contentHash, material, position }
//   null   (not a resolved, Snapshot-sourced PUBLICATION inspection, or its
//           material is not currently AVAILABLE)
//
// `inspection`         — `application/WorldSnapshotInspection.js`'s own
//                          already-computed `describeWorldSnapshotInspection()`
//                          result (0.9.177) — `{ kind: 'PUBLICATION',
//                          objectId, publicationId, contentHash, position }`.
//                          Required; `null`/malformed, or any `kind` other
//                          than `'PUBLICATION'`, returns `null`.
// `materialInspection`  — `application/WorldEncounterMaterialInspection.js`'s
//                          own already-computed `inspectWorldEncounterMaterial()`
//                          result (0.9.39) — `{ selection, lead, loading,
//                          verification }` — or `null`. Required to read
//                          `loading`; absent, naming a different
//                          `kind`/`objectId` than `inspection` (see "must
//                          name the same encounter," above), or whose
//                          `loading.status` is not `AVAILABLE`, all return
//                          `null`.
export function describeWorldSnapshotContentView({ inspection, materialInspection } = {}) {
    if (!inspection || inspection.kind !== 'PUBLICATION') {
        return null;
    }
    if (typeof inspection.publicationId !== 'string' || inspection.publicationId.length === 0) {
        return null;
    }
    if (!sameEncounter(inspection, materialInspection)) {
        return null;
    }
    if (!materialInspection.loading || materialInspection.loading.status !== WorldEncounterMaterialLoadStatus.AVAILABLE) {
        return null;
    }
    const material = materialInspection.loading.material;
    if (!material) {
        return null;
    }

    return Object.freeze({
        publicationId: inspection.publicationId,
        contentHash: inspection.contentHash,
        material,
        position: inspection.position
    });
}
