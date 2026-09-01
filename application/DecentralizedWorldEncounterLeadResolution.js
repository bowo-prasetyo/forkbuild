import { WorldEncounterKind } from '../core/WorldEncounter.js';
import {
    describeDecentralizedWorldEncounterLeadAssociation,
    decentralizedWorldEncounterLeadAssociationMatchesLead
} from '../core/DecentralizedWorldEncounterLeadAssociation.js';

// 0.9.28 — Decentralized Lead → Encounter Resolution Boundary.
//
// The decentralized discovery pipeline 0.9.24 through 0.9.27 built runs
// query → lead → registry, and stops there. Nothing yet answers the
// question a selected World encounter makes askable for the first time:
// "given this encounter, which decentralized discovery lead, if any, can
// provide its material?" This file is that question's own boundary — the
// same role `application/WorldEncounterSelectionResolution.js` (0.9.19)
// already plays for World-encounter selection, held here one layer over,
// for decentralized leads instead of `WorldDiscoverySource`s.
//
//   selected World encounter
//        requestedMaterial = { kind, objectId }
//                       │
//                       │           DecentralizedWorldDiscoveryLeadRegistry
//                       │                (0.9.26) / already-described
//                       │                `leads` array
//                       │                          │
//                       │           caller-supplied `associations` array —
//                       │                explicit evidence; see
//                       │                core/DecentralizedWorldEncounterLeadAssociation.js
//                       │                (THIS milestone)       │
//                       ▼                          ▼            │
//   application/DecentralizedWorldEncounterLeadResolution.js   ★ (THIS)
//        resolveDecentralizedWorldEncounterLead()
//                       │
//                       ▼
//        { status, candidates, resolvedLead }
//                       │
//              ┌────────┼────────┐
//              ▼        ▼        ▼
//        UNAVAILABLE  RESOLVED  AMBIGUOUS
//     (no currently-  (exactly  (more than
//      known lead has  one)      one)
//      sufficient
//      evidence)
//                       │
//                       ▼
//   future, unscheduled: a `materialSources.decentralized` slot for
//   `application/WorldEncounterMaterialLoading.js` (0.9.21) that actually
//   retrieves a resolved lead's own `uri` — see "Deliberately excluded,"
//   below.
//
// A PURE RESOLUTION BOUNDARY, NEVER A LOADER — SAME RESTRAINT 0.9.19 ALREADY
// HELD FOR SELECTION, HELD HERE FOR LEADS. This file never fetches a
// lead's own `uri`, never imports `core/ContentReference.js` or
// `core/DecentralizedPublication.js`, and never decides whether resolved
// material is trustworthy. It answers exactly one question — "which
// currently-known lead(s), if any, does the available evidence connect to
// this requested material?" — and stops there.
//
// THREE STATUSES, NEVER A RANKING BETWEEN THEM. `UNAVAILABLE` means no
// currently-known lead has sufficient evidence connecting it to
// `requestedMaterial` — whether because no evidence was ever supplied, or
// because the evidence that WAS supplied names a lead the registry does
// not currently hold. `RESOLVED` means evidence connects EXACTLY ONE
// currently-known lead. `AMBIGUOUS` means evidence connects MORE THAN
// ONE. This file never picks a "best" lead among an `AMBIGUOUS` result's
// own `candidates` — no preference for one `storage` backend over
// another, no "first one," no array-position default — the exact
// restraint `application/WorldEncounterSelectionResolution.js`'s own
// header already named for selection candidates, held here for leads:
// "Deciding what to do about that... is explicitly not this file's own
// job."
//
// EVIDENCE IS SUPPLIED, NEVER INFERRED. This file never reads a lead's
// own `discoveryTag` or `uri` to guess whether it matches
// `requestedMaterial` — see `core/DecentralizedWorldEncounterLeadAssociation.js`'s
// own header, "The one rule this file exists to hold." A candidate
// association is checked against `requestedMaterial`'s own `kind`/
// `objectId`, and a matching association is checked against `leads` via
// `decentralizedWorldEncounterLeadAssociationMatchesLead()` — comparing
// the association's own `origin`/`discoveryTag`/`uri` structurally
// against each lead's same-named fields, never any other field on either
// side.
//
// AN ASSOCIATION NAMING A LEAD THE REGISTRY DOES NOT CURRENTLY HOLD
// RESOLVES NOTHING. Evidence can outlive the lead it describes — a lead
// can be removed from `DecentralizedWorldDiscoveryLeadRegistry` (0.9.26)
// after evidence about it was already supplied. This file only ever
// resolves to a lead present in the `leads` argument it was actually
// given; an association whose own triple matches nothing in `leads`
// contributes no candidate, exactly as 0.9.19's own "zero candidates
// means the selection is stale" already treats absence as absence, never
// as a special error case.
//
// EACH DISTINCT LEAD APPEARS AT MOST ONCE IN `candidates`, EVEN IF MORE
// THAN ONE SUPPLIED ASSOCIATION NAMES IT. Two associations that both
// happen to name the very same `(origin, discoveryTag, uri)` triple —
// duplicate evidence for the same lead — resolve to that one lead once,
// never twice; this file counts DISTINCT LEADS toward `RESOLVED`/
// `AMBIGUOUS`, never distinct associations. `candidates` is ordered by
// each matching lead's own first appearance among `associations`, in the
// order supplied.
//
// `requestedMaterial` IS `{ kind, objectId }` — DELIBERATELY NOT A FULL
// `{ kind, objectId, origin }` SELECTION IDENTITY. 0.9.19's own
// `origin` names which `WorldDiscoverySource` (local, or a specific peer)
// already contributed an encounter — a fact about a pathway decentralized
// leads have never been part of; see 0.9.21's own `materialSourceFor()`,
// which still recognizes only `local` and `peer:` origins today. Carrying
// a `WorldDiscoverySource` origin into a lead-resolution question would
// imply a relationship between two entirely different origin
// vocabularies (a discovery-service identity vs. a World-encounter
// provenance identity) that this codebase has never established and this
// milestone does not invent. A caller resolving a decentralized lead for
// an already-selected encounter supplies that encounter's own
// `{ kind, objectId }` — exactly `ui/components/WorldEncounterCanvas.js`'s
// own `selectedEncounter` shape (0.9.4, unmodified), the same shape
// `application/WorldEncounterSelectionResolution.js`'s own
// `describeWorldEncounterSelectionCandidates()` already accepts.
//
// `resolveDecentralizedWorldEncounterLeadFromRegistry()` MIRRORS 0.9.19'S
// OWN REGISTRY WRAPPER, EXACTLY. `describeWorldEncounterSelectionCandidatesFromRegistry()`
// already established the shape for "read `registry.listSources()`, hand
// the result to the plain-array-taking function, return its result
// verbatim." This file's own registry wrapper does nothing else and holds
// no second algorithm of its own — it reads `registry.listLeads()`
// (0.9.26, unmodified) rather than `listSources()`, and forwards
// `associations` through unchanged.
//
// NO SCORE, RANK, TRUST, VERIFIED, "PREFERRED," OR COMPARISON VOCABULARY
// OF ANY KIND — inherited unchanged from every file in this chain.
//
// MALFORMED INPUT DEGRADES TO `UNAVAILABLE`, NEVER THROWS. A missing or
// malformed `requestedMaterial` (no valid `kind`, no non-empty
// `objectId`), a missing or non-array `leads`, and a missing or non-array
// `associations` are all treated as contributing nothing — the same
// "zero/nothing means unavailable" posture `application/
// WorldEncounterMaterialLoading.js`'s own header already holds one layer
// over, continued here rather than reinvented. A malformed entry within
// `associations` (one `describeDecentralizedWorldEncounterLeadAssociation()`
// itself rejects) is silently dropped, never allowed to block the
// well-formed evidence around it.
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK, NO CLOCK. This
// file performs no I/O of its own — unlike `application/
// WorldEncounterMaterialLoading.js`'s own deliberately asynchronous
// contract (loading material is inherently I/O-bound), RESOLVING which
// lead corresponds to a requested material is exactly the kind of
// already-in-hand-data computation 0.9.19's own selection resolution
// already is. Every value this file returns is `Object.freeze()`'d;
// nothing passed in is ever mutated. Calling either function twice with
// byte-identical arguments returns a byte-identical result.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Producing real association evidence.** See
//   `core/DecentralizedWorldEncounterLeadAssociation.js`'s own header,
//   "No producer of real association evidence exists yet." Until one
//   does, every real-world call to this file's own functions, over a
//   real, currently-known lead set and an empty `associations` array,
//   honestly resolves to `UNAVAILABLE` — that is this milestone's own
//   deliberately conservative starting point, not a gap it silently
//   papers over.
// - **Choosing one lead among an `AMBIGUOUS` result's own `candidates`.**
//   See "Three statuses, never a ranking between them," above.
// - **Retrieving a resolved lead's own `uri`, hash-verifying anything, or
//   constructing a real `core/ContentReference.js`/
//   `core/DecentralizedPublication.js`.** Unscheduled, later work — this
//   file never imports either one.
// - **Wiring a `RESOLVED` result into
//   `application/WorldEncounterMaterialLoading.js`'s own
//   `materialSources.decentralized` slot.** Unscheduled, later work; that
//   file's own `materialSources` object gains no third slot in this
//   milestone, and this file never imports it.
// - **A stateful registry for `associations` — subscribing, persisting,
//   or accumulating evidence across calls.** See
//   `core/DecentralizedWorldEncounterLeadAssociation.js`'s own
//   "Deliberately excluded," above. Every call to this file's own
//   functions is handed a fresh `associations` array by its caller.
// - **Any trust, priority, ranking, or confidence judgment about a lead,
//   an association, or a discovery service.** No such vocabulary exists
//   here or ever will at this layer.

export const DecentralizedWorldEncounterLeadResolutionStatus = Object.freeze({
    UNAVAILABLE: 'UNAVAILABLE',
    RESOLVED: 'RESOLVED',
    AMBIGUOUS: 'AMBIGUOUS'
});

function isRequestableMaterial(requestedMaterial) {
    return Boolean(requestedMaterial)
        && typeof requestedMaterial === 'object'
        && (requestedMaterial.kind === WorldEncounterKind.PUBLICATION || requestedMaterial.kind === WorldEncounterKind.AVATAR)
        && typeof requestedMaterial.objectId === 'string'
        && requestedMaterial.objectId.length > 0;
}

function leadIdentityKey(lead) {
    return JSON.stringify([lead.origin, lead.discoveryTag, lead.uri]);
}

function resolution(status, candidates, resolvedLead) {
    return Object.freeze({
        status,
        candidates: Object.freeze(candidates),
        resolvedLead: resolvedLead || null
    });
}

function unavailable() {
    return resolution(DecentralizedWorldEncounterLeadResolutionStatus.UNAVAILABLE, [], null);
}

// Pure. Resolves which currently-known lead(s) among `leads` the supplied
// `associations` evidence connects to `requestedMaterial` — see this
// file's own header for exactly what `UNAVAILABLE`/`RESOLVED`/`AMBIGUOUS`
// each mean. Never picks one candidate among several; never infers a
// connection a caller did not explicitly supply as an association. Never
// throws for malformed input; see "Malformed input degrades to
// UNAVAILABLE," above.
export function resolveDecentralizedWorldEncounterLead({ requestedMaterial, leads, associations } = {}) {
    if (!isRequestableMaterial(requestedMaterial)) {
        return unavailable();
    }

    const knownLeads = Array.isArray(leads) ? leads : [];
    const suppliedAssociations = Array.isArray(associations) ? associations : [];

    const matchedLeads = [];
    const seenLeadKeys = new Set();

    for (const candidate of suppliedAssociations) {
        const association = describeDecentralizedWorldEncounterLeadAssociation(candidate);
        if (!association) {
            continue;
        }
        if (association.kind !== requestedMaterial.kind || association.objectId !== requestedMaterial.objectId) {
            continue;
        }

        // An association's own (origin, discoveryTag, uri) triple names a
        // lead's own identity slot uniquely — see
        // `application/DecentralizedWorldDiscoveryLeadRegistry.js`'s own
        // "Identity is the triple" — so at most one currently-known lead
        // can ever match a single association.
        const matchingLead = knownLeads.find((lead) => decentralizedWorldEncounterLeadAssociationMatchesLead(association, lead));
        if (!matchingLead) {
            continue;
        }

        const key = leadIdentityKey(matchingLead);
        if (seenLeadKeys.has(key)) {
            continue;
        }
        seenLeadKeys.add(key);
        matchedLeads.push(matchingLead);
    }

    if (matchedLeads.length === 0) {
        return unavailable();
    }
    if (matchedLeads.length === 1) {
        return resolution(DecentralizedWorldEncounterLeadResolutionStatus.RESOLVED, matchedLeads, matchedLeads[0]);
    }
    return resolution(DecentralizedWorldEncounterLeadResolutionStatus.AMBIGUOUS, matchedLeads, null);
}

// Pure. Reads `registry.listLeads()` and returns exactly what
// `resolveDecentralizedWorldEncounterLead()` returns for that snapshot —
// see this file's own header, "mirrors 0.9.19's own registry wrapper,
// exactly." A `registry` missing a `listLeads` method is treated as
// contributing no leads at all.
export function resolveDecentralizedWorldEncounterLeadFromRegistry({ requestedMaterial, registry, associations } = {}) {
    const leads = registry && typeof registry.listLeads === 'function' ? registry.listLeads() : undefined;
    return resolveDecentralizedWorldEncounterLead({ requestedMaterial, leads, associations });
}
