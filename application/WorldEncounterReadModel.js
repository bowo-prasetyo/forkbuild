// 0.9.1 — World Encounter Read Model.
//
// 0.9.0's `core/WorldEncounter.js#deriveWorldEncounters()` answered "what,
// in the World, is even findable in the first place?" with two arrays of
// per-object encounter records — a `position` object on every entry, a
// `kind` tag repeated on every entry even though it is already implied by
// which array the entry lives in, and no counts a list-rendering caller
// would otherwise have to compute itself. Nothing yet turns that into the
// small, flat shape an actual World View list/UI would read from. This
// file is that hand-off, and nothing more:
//
//   describeWorldEncounterReadModel(encounters)
//     -> { publicationCount, avatarCount, totalCount,
//          publications: [{ objectId, title, publisherIdentity, isSigned,
//                            x, y, z, anchorCount, placementCount }],
//          avatars: [{ objectId, ownerIdentity, displayName, x, y, z }] }
//
//   Publication  +  WorldPlacement        AvatarProfile  +  AvatarPresence
//        │                                        │
//        └───────────────────┬────────────────────┘
//                             ▼
//                core/WorldEncounter.js  (0.9.0)
//                   deriveWorldEncounters()
//                             │
//                             ▼
//        application/WorldEncounterReadModel.js  (THIS milestone)
//           describeWorldEncounterReadModel()
//                             │
//                             ▼
//              future, unscheduled: World View Presentation Projection
//
// THIS IS A READ MODEL, NOT A NEW DOMAIN ALGORITHM. Every fact this file
// reports is 0.9.0's own fact, read verbatim off its own already-computed
// `publications`/`avatars` arrays. No encounter is added, dropped, or
// recomputed; no join this file performs itself — 0.9.0's own
// `deriveWorldEncounters()` already did every join by `publicationId`/
// `avatarId`, and this file never touches a `Publication`, `WorldPlacement`,
// `AvatarProfile`, or `AvatarPresence` record directly.
//
// THIS FILE ACCEPTS 0.9.0'S OWN RESULT DIRECTLY — NEVER RAW WORLD RECORDS.
// `describeWorldEncounterReadModel()` takes 0.9.0's own already-computed
// `{ publications, avatars }` result as its one argument and performs a
// pure, structural transform of it — exactly the shape 0.8.176's own
// evidence agreement result already hands to 0.8.177's own
// `describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardReadModel()`.
// It never calls `deriveWorldEncounters()` itself, and never accepts a
// `publications`/`placements`/`anchors`/`avatarProfiles`/`avatarPresences`
// argument of its own — that stays entirely 0.9.0's own seam.
//
// `position` IS FLATTENED TO `x`/`y`/`z`; `kind` IS DROPPED — BOTH ARE
// STRUCTURAL COMPACTIONS, NEITHER LOSES INFORMATION. Every 0.9.0 encounter
// already carries a `kind` of `'PUBLICATION'` or `'AVATAR'`; a row's own
// membership in this read model's `publications` array or its `avatars`
// array already says exactly that, so repeating the tag on every row would
// be redundant, not informative. `position.x`/`position.y`/`position.z`
// become top-level `x`/`y`/`z` on the same row — the same flat, renderable
// shape a marker-drawing caller already wants, and nothing about the
// values themselves changes.
//
// EVERY OTHER FIELD 0.9.0 ALREADY PRODUCES IS CARRIED FORWARD VERBATIM.
// `title`, `publisherIdentity`, `isSigned`, `anchorCount`, `placementCount`
// on a publication row, and `ownerIdentity`, `displayName` on an avatar
// row, are each 0.9.0's own field, unchanged, under its own name. This
// file does not collapse `publisherIdentity` (an object) into a single
// scalar "publisherId" — 0.9.0 never named one, and picking a single
// property of that object to stand in for the whole thing would be an
// interpretive step, not a structural compaction.
//
// `objectId` IS DELIBERATELY NOT RENAMED TO `id`. It is 0.9.0's own name
// for the same fact on both a publication row and an avatar row; renaming
// it here for no structural reason would only invite the two names to
// drift apart from 0.9.0's own vocabulary for the identical value.
//
// `totalCount` IS A PLAIN STRUCTURAL SUM, NEVER A MEASURE OF WORLD
// ACTIVITY. `totalCount = publicationCount + avatarCount` — how many
// encounterable objects there are of either kind, nothing more. It is not
// importance, reputation, engagement, or anything else a reader might be
// tempted to read into a growing number.
//
// NO SCORE, RANK, TRUST, VERIFIED, NEAREST, DISTANCE, OR COMPARISON
// VOCABULARY OF ANY KIND — inherited unchanged from 0.9.0's own boundary,
// held here again one layer up. This file does not know the Wanderer's own
// position, does not sort by distance, does not decide which encounter is
// "interesting," and does not compare one encounter to another. See
// `docs/Principles.md` and 0.9.0's own header for the same restraint one
// layer down. "These are the objects that exist as encounterable objects"
// is the entire question this milestone answers — never "which of them
// matters," "which is nearest," or "which should be shown first."
//
// ROW ORDER PRESERVES 0.9.0'S OWN ORDER, UNCHANGED. `publications` and
// `avatars` below are 0.9.0's own arrays, mapped one entry to one row, IN
// 0.9.0'S OWN ORDER — never re-sorted by title, evidence count, position,
// or any other key.
//
// NO MUTATION OF THE SUPPLIED `encounters`, AND NO MUTATION OF ANY VALUE
// IT HOLDS. Every object and array this file returns is newly frozen.
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK. Reads no clock.
// Returns frozen objects and frozen arrays throughout. Calling this
// function twice with a byte-identical argument returns a byte-identical
// result.
//
// MALFORMED INPUT DEGRADES TO AN EMPTY RESULT — NEVER THROWS. `encounters`
// that is `null`, `undefined`, or missing a genuine `publications`/
// `avatars` array degrades to a result with every count at `0` and both
// arrays empty and frozen — the same defensive posture 0.8.177's own read
// model already holds at this exact seam, because, unlike 0.9.0's own
// `deriveWorldEncounters()`, this function's one argument is not itself
// produced by a seam that already guarantees a well-formed shape.
//
// ARCHITECTURAL BOUNDARY — THIS FILE IMPORTS NOTHING. It performs no join,
// so it never needs `core/WorldEncounter.js`'s own `deriveWorldEncounters()`,
// `describeEncounterablePublication()`, or `describeEncounterableAvatar()` —
// a caller already holding 0.9.0's own result hands it here directly.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Camera position, distance, nearest object, visibility, sorting by
//   distance, interaction radius, avatar movement, "interesting" objects,
//   ranking, relevance, trust, or verification.** See "No score, rank,
//   trust..." above. Those require relating the World to a Wanderer's own
//   position — a different projection than "what is encounterable."
// - **`isEmpty`, display labels, shortened identifiers, or any other
//   UI-specific presentation concern.** That is the next, separate,
//   unscheduled milestone (a World View Presentation Projection) — this
//   file stops at the structural boundary, one step before the UI itself.
// - **Calling `deriveWorldEncounters()` itself, or accepting raw
//   publication/placement/avatar records.** See "This file accepts 0.9.0's
//   own result directly," above.
// - **Persistence or synchronization of any kind.** `encounters` is handed
//   in and read; nothing here is ever passed to a `StorageProvider`.
// - **Automatic, periodic, or background computation of any kind.** This
//   function runs only when a caller explicitly calls it.
export function describeWorldEncounterReadModel(encounters) {
    const publicationEncounters = encounters && Array.isArray(encounters.publications)
        ? encounters.publications
        : [];
    const avatarEncounters = encounters && Array.isArray(encounters.avatars)
        ? encounters.avatars
        : [];

    const publications = publicationEncounters.map((encounter) => Object.freeze({
        objectId: encounter.objectId,
        title: encounter.title,
        publisherIdentity: encounter.publisherIdentity,
        isSigned: encounter.isSigned,
        x: encounter.position.x,
        y: encounter.position.y,
        z: encounter.position.z,
        anchorCount: encounter.anchorCount,
        placementCount: encounter.placementCount
    }));

    const avatars = avatarEncounters.map((encounter) => Object.freeze({
        objectId: encounter.objectId,
        ownerIdentity: encounter.ownerIdentity,
        displayName: encounter.displayName,
        x: encounter.position.x,
        y: encounter.position.y,
        z: encounter.position.z
    }));

    return Object.freeze({
        publicationCount: publications.length,
        avatarCount: avatars.length,
        totalCount: publications.length + avatars.length,
        publications: Object.freeze(publications),
        avatars: Object.freeze(avatars)
    });
}
