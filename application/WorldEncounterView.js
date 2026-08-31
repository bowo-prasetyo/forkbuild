// 0.9.2 — World View Presentation Projection.
//
// 0.9.1's own `application/WorldEncounterReadModel.js#describeWorldEncounterReadModel()`
// turned 0.9.0's own discovery result into a small, flat, count-bearing
// structure — but it deliberately stopped short of `isEmpty` and any other
// presentation-specific convenience, naming that gap explicitly as "the
// next, separate, unscheduled milestone." This file is that hand-off, and
// nothing more:
//
//   describeWorldEncounterView(readModel)
//     -> { isEmpty, publicationCount, avatarCount, totalCount,
//          publications: [...], avatars: [...] }
//
//   Publication + WorldPlacement          AvatarProfile + AvatarPresence
//            │                                       │
//            └───────────────────┬───────────────────┘
//                                 ▼
//                    core/WorldEncounter.js   (0.9.0)
//                       deriveWorldEncounters()
//                                 ▼
//          application/WorldEncounterReadModel.js   (0.9.1)
//              describeWorldEncounterReadModel()
//                                 ▼
//            application/WorldEncounterView.js   (THIS milestone) ★
//                  describeWorldEncounterView()
//                                 ▼
//                       future, unscheduled: World UI
//
// NAMED `WorldEncounterView.js`, NOT `WorldView.js`. `ui/views/WorldView.js`
// already exists — the large, existing Vue component for the entire World
// screen (camera, input routing, panels, dialogs, presence indicators). This
// file is nothing like that: a small, pure, presentation-SHAPING function
// with no rendering technology of its own. Naming it `WorldView.js` would
// invite exactly the confusion this codebase's own naming has otherwise
// avoided; `WorldEncounterView.js` keeps this file in its own chain — the
// same `WorldEncounter` → `WorldEncounterReadModel` → `WorldEncounterView`
// progression 0.8.176 → 0.8.177 → 0.8.178 already established for the
// evidence-comparison chain (`...ReadModel.js` → `...View.js`).
//
// THIS FILE IS DELIBERATELY DUMB — PRESENTABLE, NEVER INTELLIGENT. Every
// fact this file reports is 0.9.1's own fact, read verbatim off its own
// already-computed `publications`/`avatars` arrays. No encounter is added,
// dropped, combined, or recomputed. No row is reinterpreted, relabeled, or
// reordered — a publication row and an avatar row keep every field 0.9.1
// already gave them, under 0.9.1's own names. The only new fact this
// milestone introduces is `isEmpty`, a plain structural flag.
//
// `isEmpty = totalCount === 0` — NOTHING ELSE. Not "no signed publications,"
// not "no avatars nearby," not "nothing worth showing." An empty World is
// based on encounter presence alone: zero publications and zero avatars.
// One publication and zero avatars is NOT empty. Zero publications and one
// avatar is NOT empty. `isEmpty` never depends on anything besides
// `totalCount`.
//
// `publicationCount`/`avatarCount`/`totalCount` ARE RECOMPUTED FROM THE
// ARRAYS THEMSELVES, NEVER TRUSTED BLINDLY OFF A SUPPLIED COUNT FIELD — the
// same defensive posture `PublisherLeaderboardClaimSnapshotReconciliation-
// CandidateLeaderboardView.js`'s own `rowCount = rows.length` already holds
// at the equivalent seam one chain over. When `readModel` is a genuine 0.9.1
// result these numbers agree with 0.9.1's own count fields exactly, because
// 0.9.1 already guarantees `publicationCount === publications.length`; when
// it is not, this file still returns a coherent, internally-consistent
// result rather than trusting a count that disagrees with the arrays behind
// it.
//
// PUBLICATIONS AND AVATARS STAY SEPARATE ARRAYS, NEVER FLATTENED INTO ONE
// GENERIC `objects` LIST. 0.9.0 named two encounter kinds; 0.9.1 preserved
// that distinction through `publications`/`avatars`; this file holds the
// same line one layer up. A UI reading this result can render "Publications"
// and "Avatars" as their own sections without rediscovering type semantics
// from a merged collection, and this file never invents a generic "World
// Object" abstraction to do it.
//
// ROWS ARE FORWARDED BY REFERENCE, NEVER REBUILT. A publication or avatar
// row surviving into this file's own result is the SAME object 0.9.1 already
// froze — not a copy, not a re-mapped object with the same-looking fields.
// Only the two containing arrays are newly wrapped (so this file never
// freezes an array it did not itself create — see "No mutation," below);
// every row inside keeps its own identity.
//
// ROW ORDER PRESERVES 0.9.1'S OWN ORDER, UNCHANGED. `publications` and
// `avatars` below are 0.9.1's own arrays, in 0.9.1's own order — never
// re-sorted by title, count, position, or any other key. There is no
// `sort()` anywhere in this file.
//
// NO SCORE, RANK, TRUST, VERIFIED, DISTANCE, NEAREST, VISIBILITY, VIEWPORT,
// CAMERA, INTERACTION RADIUS, MOVEMENT, CLUSTERING, "NEARBY," RELEVANCE, OR
// PRIORITIZATION VOCABULARY OF ANY KIND — inherited unchanged from 0.9.0's
// and 0.9.1's own boundary, held here again one layer up. This file does not
// know the Wanderer's own position, does not compute a distance, does not
// decide which encounter to show first, and does not filter by viewport or
// visibility. "Presentable," not "intelligent" — this milestone makes the
// World data safe for a template to render, never makes it aware of who is
// looking or from where.
//
// MALFORMED INPUT DEGRADES TO AN EMPTY RESULT — NEVER THROWS. A `readModel`
// that is `null`, `undefined`, or missing a genuine `publications`/`avatars`
// array degrades to `{ isEmpty: true, publicationCount: 0, avatarCount: 0,
// totalCount: 0, publications: [], avatars: [] }` — the same defensive
// posture 0.9.1's own read model already holds at its own boundary, for the
// same reason: this function's one argument is not itself produced by a
// seam that already guarantees a well-formed shape.
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK, NO DOM. Reads no
// clock, touches no archive, renders no markup. The supplied `readModel`
// (and every array or row it holds) is never mutated — this file only ever
// freezes arrays it newly created itself. Returns a frozen result throughout.
// Calling `describeWorldEncounterView()` twice with a byte-identical
// argument returns a byte-identical result.
//
// ARCHITECTURAL BOUNDARY — THIS FILE IMPORTS NOTHING. Exactly like 0.9.1's
// own module, it performs no join and no reconstruction, so it never needs
// `core/WorldEncounter.js` or `application/WorldEncounterReadModel.js`
// themselves — a caller already holding 0.9.1's own result hands it here
// directly. Definitely no dependency on `Publication`, `WorldPlacement`,
// `AvatarProfile`, `AvatarPresence`, archive/storage, or network — this
// file's one argument is 0.9.1's own already-computed result, nothing else.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Distance, nearest-object calculation, camera positioning, sorting,
//   viewport filtering, visibility, interaction radius, movement,
//   clustering, "nearby," relevance, ranking, or prioritization.** See "No
//   score, rank, trust..." above. Those require relating the World to a
//   Wanderer's own position — a different, later, unscheduled milestone.
// - **Flattening `publications`/`avatars` into one generic `objects`
//   array.** See "Publications and avatars stay separate," above.
// - **Display labels, shortened identifiers, icons, or any other row-level
//   presentational transform beyond forwarding 0.9.1's own fields.** 0.9.1's
//   own rows are already the shape a renderer needs; reinterpreting them
//   further is not this milestone's job.
// - **Calling `describeWorldEncounterReadModel()` or `deriveWorldEncounters()`
//   itself, or accepting raw publication/placement/avatar records.** See
//   "This file imports nothing," above.
// - **Actual markup, DOM nodes, styling, or any rendering technology
//   choice, and the Wanderer itself.** This file returns plain, frozen,
//   view-SHAPED data; an actual World UI — and the Wanderer's own position
//   within it — is separate, later, unscheduled work.
// - **Persistence or synchronization of any kind.**
// - **Automatic, periodic, or background computation of any kind.** This
//   function runs only when a caller explicitly calls it.
export function describeWorldEncounterView(readModel) {
    const publications = readModel && Array.isArray(readModel.publications)
        ? readModel.publications.slice()
        : [];
    const avatars = readModel && Array.isArray(readModel.avatars)
        ? readModel.avatars.slice()
        : [];

    const publicationCount = publications.length;
    const avatarCount = avatars.length;
    const totalCount = publicationCount + avatarCount;

    return Object.freeze({
        isEmpty: totalCount === 0,
        publicationCount,
        avatarCount,
        totalCount,
        publications: Object.freeze(publications),
        avatars: Object.freeze(avatars)
    });
}
