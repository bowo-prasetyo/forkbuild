import { deriveWorldEncounterSelectionIdentities } from '../core/WorldEncounterSelectionIdentity.js';

// 0.9.19 — World Encounter Selection Candidate Resolution.
//
// `core/WorldEncounterSelectionIdentity.js` (this same milestone) named
// every currently-derivable `{ kind, objectId, origin }` identity across a
// set of sources — but a Wanderer never selects an origin. Selecting a
// marker has meant exactly `{ kind, objectId }` since 0.9.4, and stays
// that way: `ui/components/WorldEncounterCanvas.js` is unmodified by this
// milestone, and nothing about how a click becomes `selectedEncounter`
// changes. What was missing is the step in between — given a selection
// the existing UI already produced, which source(s) currently offer a
// matching encounter? This file answers exactly that question.
//
//   ui/components/WorldEncounterCanvas.js  (0.9.4, unmodified)
//        selectedEncounter = { kind, objectId }
//                       │
//                       │      WorldDiscoverySourceRegistry (0.9.9,
//                       │           unmodified) / already-described
//                       │           `sources` array
//                       ▼                │
//   application/WorldEncounterSelectionResolution.js   ★ (THIS)
//        describeWorldEncounterSelectionCandidates()
//                       │
//                       ▼
//   core/WorldEncounterSelectionIdentity.js   (THIS milestone)
//        deriveWorldEncounterSelectionIdentities()
//                       │
//                       ▼
//   [{ kind, objectId, origin }, ...]   — zero, one, or many candidates
//                       │
//                       ▼
//   future, unscheduled: Encounter Material Loading Boundary (0.9.20+),
//   which needs exactly this list to know it must not guess a source when
//   more than one candidate exists.
//
// EVERY MATCHING CANDIDATE, NEVER ONE PICKED FOR THE CALLER. This is the
// one rule this file exists to hold. Given a `{ kind, objectId }`
// selection that currently matches encounters from two different origins,
// `describeWorldEncounterSelectionCandidates()` returns BOTH — it never
// calls `.find()`, never returns "the first one," never prefers
// `'local'`, and never returns array position `[0]` as an implicit
// default. A caller receiving more than one candidate is being told,
// structurally, that the selection is genuinely ambiguous — deciding what
// to do about that (ask the Wanderer, load every candidate, refuse to
// load) is explicitly not this file's own job; see "Deliberately
// excluded," below.
//
// ZERO CANDIDATES MEANS THE SELECTION IS STALE, EXACTLY AS 0.9.16 ALREADY
// ESTABLISHED ONE LAYER OVER. `application/WorldEncounterInspection.js`'s
// own `describeWorldEncounterInspection()` already returns `null` when a
// selected object has left the World between selection and lookup. This
// file holds the same posture for the same reason, in its own shape: an
// empty result, never a thrown error and never a fabricated candidate.
//
// THIS FILE NEVER TOUCHES `ui/components/WorldEncounterCanvas.js`, AND
// `selectedEncounter` STAYS EXACTLY `{ kind, objectId }`. 0.9.13's own
// architectural boundary already forbids that component from reading a
// source's own `origin` field at all (it "never inspects peer identity").
// This milestone does not lift that boundary — it answers the provenance
// question entirely below the UI, as a fact a future, separate caller can
// ask for once it actually needs to act on it (loading a specific
// source's own material). Nothing here requires, or performs, any change
// to how a marker is drawn, keyed, or clicked.
//
// `selectedEncounter` IS READ, NEVER RESHAPED. This file accepts 0.9.4's
// own `{ kind, objectId }` shape verbatim — it does not require an
// `origin` field on the input (a selection never carries one; see above),
// and it never adds one to `selectedEncounter` itself. Only the RETURNED
// candidates carry `origin` — each one a `WorldEncounterSelectionIdentity`
// 0.9.19's own core file already named.
//
// `describeWorldEncounterSelectionCandidatesFromRegistry()` MIRRORS
// 0.9.10's OWN REGISTRY WRAPPER, EXACTLY. `application/
// WorldDiscoveryRegistryProjection.js#describeWorldFromDiscoveryRegistry()`
// already established the shape for "read `registry.listSources()`, hand
// the result to the sources-taking function, return its result verbatim."
// This file's own registry wrapper does nothing else and holds no second
// algorithm of its own.
//
// NO SCORE, RANK, TRUST, VERIFIED, "PREFERRED," OR COMPARISON VOCABULARY
// OF ANY KIND — inherited unchanged from every file in this chain.
//
// MALFORMED INPUT DEGRADES TO AN EMPTY RESULT, NEVER THROWS. A missing or
// malformed `selectedEncounter` (no `kind`, no `objectId`), or a missing
// or malformed `sources`/`registry`, returns a frozen empty array — the
// same defensive posture every application-layer file in this chain
// already holds at its own boundary.
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK, NO CLOCK. This
// file reads no clock and touches no archive. Calling either function
// twice with byte-identical arguments returns a byte-identical result,
// because `deriveWorldEncounterSelectionIdentities()` and
// `registry.listSources()` already each make that same promise on their
// own.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Picking one candidate among several** (by order, by origin name, by
//   "local first," or any other rule). See "Every matching candidate,
//   never one picked for the caller," above — separate, later, unscheduled
//   work, if this codebase ever decides a Wanderer-facing choice belongs
//   here at all.
// - **Fetching, WebRTC requests, peer messaging, or `localStorage`
//   access of any kind.** This file never obtains a source itself beyond
//   reading an already-supplied `registry`'s current `listSources()`
//   snapshot.
// - **Loading, verifying, or interpreting the material any candidate
//   names.** A candidate is a name; this file never resolves it further.
// - **Any change to `ui/components/WorldEncounterCanvas.js`, or to the
//   shape of `selectedEncounter` itself.** See "This file never touches
//   WorldEncounterCanvas.js," above.
// - **Persistence or synchronization of any kind.**
// - **Automatic, periodic, or background computation of any kind.** Both
//   functions below run only when a caller explicitly calls them.

function isSelectableEncounter(selectedEncounter) {
    return Boolean(selectedEncounter)
        && typeof selectedEncounter === 'object'
        && typeof selectedEncounter.objectId === 'string'
        && selectedEncounter.objectId.length > 0
        && (selectedEncounter.kind === 'PUBLICATION' || selectedEncounter.kind === 'AVATAR');
}

// Pure. Every `WorldEncounterSelectionIdentity` among `sources` whose
// `kind`/`objectId` matches `selectedEncounter` — see this file's own
// header, "Every matching candidate, never one picked for the caller."
// Zero, one, or many results; a frozen empty array, never `null` and
// never a thrown error, when nothing currently matches.
export function describeWorldEncounterSelectionCandidates({ selectedEncounter, sources } = {}) {
    if (!isSelectableEncounter(selectedEncounter)) {
        return Object.freeze([]);
    }
    const identities = deriveWorldEncounterSelectionIdentities(sources);
    return Object.freeze(identities.filter((identity) => identity.kind === selectedEncounter.kind && identity.objectId === selectedEncounter.objectId));
}

// Pure. Reads `registry.listSources()` and returns exactly what
// `describeWorldEncounterSelectionCandidates()` returns for that
// snapshot — see this file's own header, "mirrors 0.9.10's own registry
// wrapper, exactly." A `registry` missing a `listSources` method is
// treated as contributing no sources at all.
export function describeWorldEncounterSelectionCandidatesFromRegistry({ selectedEncounter, registry } = {}) {
    const sources = registry && typeof registry.listSources === 'function' ? registry.listSources() : undefined;
    return describeWorldEncounterSelectionCandidates({ selectedEncounter, sources });
}
