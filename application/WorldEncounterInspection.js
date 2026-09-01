// 0.9.16 — World Encounter Inspection Read Model.
//
// 0.9.4's own `ui/components/WorldEncounterCanvas.js#selectEncounter()`
// gave the Wanderer a way to pick an encounter, but its own header was
// explicit about where that stopped: "selecting never inspects... turning
// a selection into an inspection request is separate, later, unscheduled
// work." `selectedEncounter` has stayed exactly `{ kind, objectId }` ever
// since — an identity, never a description. This file is that next step,
// and only that step:
//
//   describeWorldEncounterInspection({ selectedEncounter, view })
//     -> { kind, objectId, title, publisherIdentity, isSigned,
//          x, y, z, anchorCount, placementCount }              (publication)
//     -> { kind, objectId, ownerIdentity, displayName, x, y, z } (avatar)
//     -> null                                    (nothing found to inspect)
//
//   ui/components/WorldEncounterCanvas.js's own
//        selectedEncounter = { kind, objectId }         (0.9.4)
//        effectiveView = { publications: [...], avatars: [...] }  (0.9.2/0.9.13)
//                             │
//                             ▼
//        application/WorldEncounterInspection.js   (THIS milestone) ★
//              describeWorldEncounterInspection()
//                             │
//                             ▼
//        future, unscheduled: Encounter Inspection UI (0.9.17),
//        Encounter Material Resolution, Cryptographic Verification Boundary
//
// A JOIN BY IDENTITY, NEVER A NEW ALGORITHM. `selectedEncounter` names
// which row to describe (`kind` + `objectId`); `view` is exactly 0.9.2's
// own `describeWorldEncounterView()` result — the same already-computed
// `publications`/`avatars` arrays `WorldEncounterCanvas` already holds as
// `effectiveView`. This file performs exactly one lookup — find the row
// in the array `selectedEncounter.kind` names whose `objectId` matches —
// and returns that row's own fields, unchanged, under a `kind` tag. It
// never fetches a `Publication`, `AvatarProfile`, `WorldPlacement`, or
// `AvatarPresence` record itself, never calls `deriveWorldEncounters()`,
// `describeWorldEncounterReadModel()`, or `describeWorldEncounterView()`
// itself, and never recomputes anything those three already decided.
//
// EVERY FIELD IS FORWARDED VERBATIM, UNDER ITS OWN 0.9.1/0.9.2 NAME.
// `title`, `publisherIdentity`, `isSigned`, `x`, `y`, `z`, `anchorCount`,
// `placementCount` on a publication row, and `ownerIdentity`,
// `displayName`, `x`, `y`, `z` on an avatar row, are each forwarded
// unchanged from the matched row. Nothing is renamed, recomputed, summed,
// or reformatted — the one new fact this file adds is the `kind` tag
// itself (0.9.2's own rows never carry one — see its own header, "`kind`
// IS DROPPED").
//
// `isSigned` STAYS EXACTLY WHAT IT ALREADY WAS — NEVER `isVerified`,
// NEVER `isTrusted`, NEVER `isAuthentic`. `isSigned === true` reports only
// that the underlying publication carries signature material — the same
// fact `core/WorldEncounter.js`'s own header already drew this line
// around: "never whether that signature verifies... and never anything
// about trust." This milestone inspects a selection; it does not load the
// signed material behind it and does not verify anything. Introducing
// `isVerified`/`isTrusted`/`isAuthentic` here — even spelled correctly,
// even set to a safe default — would collapse the explicit progression
// this milestone exists to hold open:
//
//   select { kind, objectId } → inspect → load material → verify → interpret
//
// each step staying its own, later, separately-earned milestone.
//
// THE AVATAR BRANCH STAYS SEPARATE, NEVER MERGED WITH THE PUBLICATION
// BRANCH. Exactly like every file in this chain before it (0.9.0 through
// 0.9.4), a publication inspection and an avatar inspection are two
// distinct shapes with two distinct field sets — there is no generic
// "inspection" shape that carries every possible field with some left
// `null`/`undefined` depending on kind. `kind` decides which shape a
// caller receives; there is no third kind.
//
// TWO KINDS, NEVER A THIRD — INHERITED FROM 0.9.0. `selectedEncounter.kind`
// that is not `'PUBLICATION'` or `'AVATAR'` (a typo, a future kind this
// file has never heard of, `null`, anything else) matches nothing and
// this function returns `null` — it never guesses which array to search.
//
// NOT FOUND DEGRADES TO `null`, NEVER THROWS, NEVER A STALE ROW. A
// `selectedEncounter` naming an `objectId` no longer present in `view` —
// the encounter left the World between selection and this call, exactly
// the live-registry churn 0.9.13 already made possible — returns `null`.
// This file never returns a previous inspection, never fabricates a
// placeholder row, and never throws for a selection that has simply
// stopped existing.
//
// MALFORMED INPUT OF ANY KIND DEGRADES TO `null` — NEVER THROWS.
// `selectedEncounter` that is `null`/`undefined`/missing a genuine
// `objectId`, or `view` that is `null`/`undefined`/missing a genuine
// `publications`/`avatars` array, returns `null` — the same defensive
// posture 0.9.1's and 0.9.2's own read models already hold at their own
// boundaries, for the same reason: this function's arguments are not
// themselves produced by a seam that already guarantees a well-formed
// shape (a caller may hand this function a selection and a view captured
// at two different moments).
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK, NO CLOCK.
// Neither `selectedEncounter` nor `view` (nor any row inside it) is ever
// mutated. The returned row, when one is found, is newly frozen — never
// the same object reference `view` already holds, so a caller may freely
// hand this file a frozen `view` without this file ever needing to freeze
// (or fail to freeze) anything already frozen. Calling this function twice
// with byte-identical arguments returns a byte-identical result.
//
// ARCHITECTURAL BOUNDARY — THIS FILE IMPORTS NOTHING. Exactly like 0.9.1's
// and 0.9.2's own modules, it performs no join back into `core/`, so it
// never needs `core/WorldEncounter.js`'s own `deriveWorldEncounters()`,
// `application/WorldEncounterReadModel.js`, or
// `application/WorldEncounterView.js` themselves — a caller already
// holding 0.9.2's own `view` result (or `WorldEncounterCanvas`'s own
// registry-derived `effectiveView`) hands both arguments here directly.
//
// NO SCORE, RANK, TRUST, VERIFIED, NEAREST, DISTANCE, OR COMPARISON
// VOCABULARY OF ANY KIND — inherited unchanged from every file in this
// chain before it. This file does not know the Wanderer's own position,
// does not decide whether the selected encounter is "interesting," and
// does not compare it to anything else in the World.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Loading the selected publication's or avatar's own underlying
//   signed material** (the full `Publication`/`AvatarProfile` record,
//   its content, its anchors/snapshot placements themselves). Separate,
//   later, unscheduled work (Encounter Material Resolution).
// - **Verifying a signature, or introducing `isVerified`/`isTrusted`/
//   `isAuthentic` vocabulary of any kind.** See "`isSigned` stays exactly
//   what it already was," above. Separate, later, unscheduled work
//   (a Cryptographic Verification Boundary).
// - **Any UI, panel, template, or rendering technology choice.** This
//   file returns a plain, frozen, inspection-SHAPED object; an actual
//   inspection surface is separate, later, unscheduled work (Encounter
//   Inspection UI).
// - **Distance, nearest-object calculation, proximity, or any spatial
//   relationship between the Wanderer and the selected encounter.**
// - **Persistence or synchronization of any kind.** `selectedEncounter`
//   and `view` are handed in and read; nothing here is ever passed to a
//   `StorageProvider`.
// - **Automatic, periodic, or background computation of any kind.** This
//   function runs only when a caller explicitly calls it.
export function describeWorldEncounterInspection({ selectedEncounter, view } = {}) {
    if (!selectedEncounter || typeof selectedEncounter.objectId === 'undefined' || selectedEncounter.objectId === null) {
        return null;
    }

    if (selectedEncounter.kind === 'PUBLICATION') {
        const publications = view && Array.isArray(view.publications) ? view.publications : [];
        const row = publications.find((candidate) => candidate && candidate.objectId === selectedEncounter.objectId);
        if (!row) {
            return null;
        }
        return Object.freeze({
            kind: 'PUBLICATION',
            objectId: row.objectId,
            title: row.title,
            publisherIdentity: row.publisherIdentity,
            isSigned: row.isSigned,
            x: row.x,
            y: row.y,
            z: row.z,
            anchorCount: row.anchorCount,
            placementCount: row.placementCount
        });
    }

    if (selectedEncounter.kind === 'AVATAR') {
        const avatars = view && Array.isArray(view.avatars) ? view.avatars : [];
        const row = avatars.find((candidate) => candidate && candidate.objectId === selectedEncounter.objectId);
        if (!row) {
            return null;
        }
        return Object.freeze({
            kind: 'AVATAR',
            objectId: row.objectId,
            ownerIdentity: row.ownerIdentity,
            displayName: row.displayName,
            x: row.x,
            y: row.y,
            z: row.z
        });
    }

    return null;
}
