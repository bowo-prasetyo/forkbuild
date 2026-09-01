import {
    describeWorldEncounterSelectionCandidates,
    describeWorldEncounterSelectionCandidatesFromRegistry
} from './WorldEncounterSelectionResolution.js';

// 0.9.20 — World Encounter Selection Resolution.
//
// 0.9.19 answered "which source(s) currently offer a matching encounter?"
// and stopped there on purpose — its own header named the boundary
// explicitly: "EVERY MATCHING CANDIDATE, NEVER ONE PICKED FOR THE CALLER."
// A Wanderer who selected an unambiguous marker still had no way to learn
// that fact structurally, and a Wanderer who selected an ambiguous one had
// no way to learn THAT either — a caller received a candidate list and
// nothing telling it what that list actually means. This file is the
// missing classification step, and only that step: given the exact
// candidate list 0.9.19 already computes, is the selection resolved
// automatically, does it need an explicit choice, or is it simply gone?
//
//   ui/components/WorldEncounterCanvas.js's own
//        selectedEncounter = { kind, objectId }                    (0.9.4)
//                       │
//                       ▼
//   application/WorldEncounterSelectionResolution.js   (0.9.19, unmodified)
//        describeWorldEncounterSelectionCandidates()
//                       │
//                       ▼
//        [{ kind, objectId, origin }, ...]   — zero, one, or many
//                       │
//                       ▼
//   application/WorldEncounterSelectionOutcome.js   ★ (THIS)
//        describeWorldEncounterSelectionOutcome()
//                       │
//                       ▼
//        { status, candidates, resolvedSelection }
//                       │
//          ┌────────────┼─────────────────┐
//          ▼             ▼                 ▼
//     UNAVAILABLE     RESOLVED          AMBIGUOUS
//   (0 candidates)  (1 candidate,   (2+ candidates,
//                  resolvedSelection  resolvedSelection
//                   set automatically)   stays null)
//
// THREE STATUSES, DECIDED BY COUNT ALONE — NEVER BY CONTENT. `status` is
// `'UNAVAILABLE'` when `candidates.length === 0`, `'RESOLVED'` when it is
// exactly `1`, and `'AMBIGUOUS'` whenever it is `2` or more. Nothing about
// WHICH origins are present, their names, or their order changes which
// bucket a given candidate list falls into — this file reads a length,
// nothing else, off a list 0.9.19 already produced.
//
// `resolvedSelection` IS SET ONLY WHEN THE ANSWER IS ALREADY UNAMBIGUOUS —
// NEVER GUESSED. When `status` is `'RESOLVED'`, `resolvedSelection` is
// exactly `candidates[0]` — the one and only candidate, forwarded
// verbatim, never re-derived. When `status` is `'AMBIGUOUS'`,
// `resolvedSelection` is `null`, full stop. This file NEVER calls
// `.find()`, never returns `candidates[0]` as an implicit default among
// several, and never invents a rule ("prefer local," "prefer the first
// one seen") to collapse many candidates into one. See 0.9.19's own
// header for why: "the choice belongs at the presentation/application
// boundary" — a human decision, not a computed one. This file draws that
// boundary; it does not cross it. A caller wanting to let a Wanderer
// pick among an `'AMBIGUOUS'` outcome's own `candidates` array does so
// entirely on its own, outside this file, by recording that explicit
// choice as its own separate piece of state — see
// `ui/components/WorldEncounterCanvas.js`'s own `resolvedSelectionChoice`
// for exactly that, one layer up.
//
// `candidates` IS ALWAYS THE FULL LIST, IN EVERY STATUS — NEVER TRIMMED,
// NEVER HIDDEN. Even when `status` is `'RESOLVED'` (one entry) or
// `'UNAVAILABLE'` (zero entries), `candidates` still carries exactly what
// `describeWorldEncounterSelectionCandidates()` itself returned — a
// caller never has to call that function a second time to see the same
// list this file already classified.
//
// UNAVAILABLE MEANS THE SAME THING 0.9.16's AND 0.9.19's OWN "ZERO"
// ALREADY MEANT — A STALE SELECTION, NEVER AN ERROR. Exactly like
// `application/WorldEncounterInspection.js`'s own join and 0.9.19's own
// candidate list, zero matching sources is not a failure this file
// reports by throwing or by fabricating a placeholder outcome — it is
// itself the answer: nothing currently offers this selection.
//
// A JOIN OVER 0.9.19's OWN OUTPUT, NEVER A SECOND CANDIDATE ALGORITHM.
// This file imports nothing from `core/` and performs no source lookup,
// no encounter derivation, and no matching of its own — it calls 0.9.19's
// own `describeWorldEncounterSelectionCandidates()` /
// `describeWorldEncounterSelectionCandidatesFromRegistry()`, unmodified,
// and classifies whatever comes back. Every rule those two functions
// already hold (kind-scoped matching, per-source derivation, malformed
// input degrading to an empty array) applies here unchanged, because this
// file never recomputes any of it.
//
// `describeWorldEncounterSelectionOutcomeFromRegistry()` MIRRORS 0.9.19's
// OWN REGISTRY WRAPPER, EXACTLY. Read `registry.listSources()` (via
// 0.9.19's own wrapper), hand the result to the sources-taking function,
// return its result verbatim — the same "one seam, no second algorithm"
// shape `application/WorldEncounterSelectionResolution.js` already
// established one layer down.
//
// NO SCORE, RANK, TRUST, VERIFIED, "PREFERRED," OR COMPARISON VOCABULARY
// OF ANY KIND — inherited unchanged from every file in this chain. This
// file does not judge candidates against each other in any way; it only
// counts them.
//
// MALFORMED INPUT DEGRADES TO THE SAME `'UNAVAILABLE'` OUTCOME A GENUINE
// STALE SELECTION PRODUCES, NEVER THROWS. A missing/malformed
// `selectedEncounter`, `sources`, or `registry` reaches 0.9.19's own
// functions first, which already degrade to a frozen empty candidate
// array for any of those — this file classifies that empty array exactly
// like any other empty result, because there is no distinguishable
// "malformed" case once the candidate list itself is already empty.
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK, NO CLOCK. Every
// value this file returns is `Object.freeze()`'d, including the outcome
// object itself; nothing passed in is ever mutated. Calling either
// function twice with byte-identical arguments returns a byte-identical
// result, because 0.9.19's own functions already make that same promise.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Picking one candidate among several.** See "resolvedSelection is
//   set only when the answer is already unambiguous," above — an
//   `'AMBIGUOUS'` outcome's own `resolvedSelection` is `null`, always.
// - **Recording, remembering, or acting on a Wanderer's own explicit
//   choice among an `'AMBIGUOUS'` outcome's candidates.** This file
//   computes the outcome fresh, every call, from `selectedEncounter` and
//   `sources`/`registry` alone — it holds no state between calls of any
//   kind, and knows nothing about what a caller may have chosen the last
//   time it called this file. That is
//   `ui/components/WorldEncounterCanvas.js`'s own job, one layer up.
// - **Fetching, WebRTC requests, peer messaging, or `localStorage`
//   access of any kind.** Inherited unchanged from 0.9.19 — this file
//   never obtains a source itself beyond what it hands straight through
//   to 0.9.19's own functions.
// - **Loading, verifying, or interpreting the material any candidate
//   names.** A candidate is still just a name; this file classifies a
//   LIST of names, never resolves one further.
// - **Any UI, panel, template, or rendering technology choice.** This
//   file returns a plain, frozen, classification-shaped object; an actual
//   "Choose Source" surface is separate work, one layer up.
// - **Persistence or synchronization of any kind.**
// - **Automatic, periodic, or background computation of any kind.** Both
//   functions below run only when a caller explicitly calls them.

export const WorldEncounterSelectionOutcomeStatus = Object.freeze({
    UNAVAILABLE: 'UNAVAILABLE',
    RESOLVED: 'RESOLVED',
    AMBIGUOUS: 'AMBIGUOUS'
});

function describeOutcomeFromCandidates(candidates) {
    if (candidates.length === 0) {
        return Object.freeze({
            status: WorldEncounterSelectionOutcomeStatus.UNAVAILABLE,
            candidates,
            resolvedSelection: null
        });
    }
    if (candidates.length === 1) {
        return Object.freeze({
            status: WorldEncounterSelectionOutcomeStatus.RESOLVED,
            candidates,
            resolvedSelection: candidates[0]
        });
    }
    return Object.freeze({
        status: WorldEncounterSelectionOutcomeStatus.AMBIGUOUS,
        candidates,
        resolvedSelection: null
    });
}

// Pure. Classifies `selectedEncounter`'s own candidate list (0.9.19's own
// `describeWorldEncounterSelectionCandidates()`, called here unmodified)
// into `{ status, candidates, resolvedSelection }` — see this file's own
// header for exactly what each status/field means. Never throws; a
// malformed `selectedEncounter` or `sources` degrades, via 0.9.19's own
// boundary, to an empty candidate list, which this function classifies as
// `'UNAVAILABLE'` exactly like a genuine stale selection.
export function describeWorldEncounterSelectionOutcome({ selectedEncounter, sources } = {}) {
    const candidates = describeWorldEncounterSelectionCandidates({ selectedEncounter, sources });
    return describeOutcomeFromCandidates(candidates);
}

// Pure. Reads `registry.listSources()` (via 0.9.19's own
// `describeWorldEncounterSelectionCandidatesFromRegistry()`) and returns
// exactly what `describeWorldEncounterSelectionOutcome()` returns for that
// snapshot — see this file's own header, "mirrors 0.9.19's own registry
// wrapper, exactly." A `registry` missing a `listSources` method is
// treated as contributing no sources at all, classified as `'UNAVAILABLE'`.
export function describeWorldEncounterSelectionOutcomeFromRegistry({ selectedEncounter, registry } = {}) {
    const candidates = describeWorldEncounterSelectionCandidatesFromRegistry({ selectedEncounter, registry });
    return describeOutcomeFromCandidates(candidates);
}
