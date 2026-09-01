import { describeDecentralizedPublicationLocationClaim } from '../core/DecentralizedPublicationLocationClaim.js';
import { describeDecentralizedWorldEncounterLeadAssociation } from '../core/DecentralizedWorldEncounterLeadAssociation.js';

// 0.9.29 — Decentralized Association Evidence Ingress.
//
// `core/DecentralizedPublicationLocationClaim.js` (this same milestone)
// reads what a signed Publication's own fields already claim about where
// its content lives. `application/DecentralizedWorldEncounterLeadResolution.js`
// (0.9.28, unmodified) already knows how to resolve a requested material
// against currently-known leads, GIVEN an `associations` array — but has
// never had a real producer of one. Neither file can close that gap alone:
// a claim knows nothing about which decentralized discovery leads are
// currently known, and a lead knows nothing about which Publication, if
// any, claims its `uri`. This file is the join between them — the "ingress"
// the milestone's own name promises: real evidence flowing in, for the
// first time, from an already-signed source this codebase has carried
// since 0.2.16.
//
//   publisher/Publication[]              DecentralizedWorldDiscoveryLeadRegistry
//     (already-signed, already                (0.9.26) / already-described
//      fetched — this file never                        `leads` array
//      retrieves one itself)                                    │
//              │                                                 │
//              ▼                                                 │
//   core/DecentralizedPublicationLocationClaim.js  (THIS milestone,
//        describeDecentralizedPublicationLocationClaim()   other half)
//              │                                                 │
//              └───────────────────────┬─────────────────────────┘
//                                       ▼
//   application/DecentralizedWorldEncounterLeadAssociationEvidenceIngress.js  ★ (THIS)
//        deriveDecentralizedWorldEncounterLeadAssociationEvidence()
//        deriveDecentralizedWorldEncounterLeadAssociationEvidenceFromRegistry()
//                                       │
//                                       ▼
//                              associations[]
//                                       │
//                                       ▼
//   application/DecentralizedWorldEncounterLeadResolution.js   (0.9.28,
//        resolveDecentralizedWorldEncounterLead()                unmodified)
//        resolveDecentralizedWorldEncounterLeadFromRegistry()
//
// A CLAIM BECOMES AN ASSOCIATION ONLY BY MATCHING A CURRENTLY-KNOWN
// LEAD'S OWN `uri` — EXACT STRING EQUALITY, NOTHING ELSE. A claim on its
// own names an `objectId` and a `uri`, but says nothing about `origin` or
// `discoveryTag` — a lead's own identity triple 0.9.28's own association
// shape requires. This file supplies those two fields FROM THE MATCHING
// LEAD, never invents them, and never matches on anything but an exact
// `claim.uri === lead.uri` comparison — no substring match, no scheme
// normalization, no trailing-slash tolerance. A claim whose `uri` matches
// no currently-known lead contributes no association at all; it is not an
// error, and it is not held onto for a later lead that might report the
// same `uri` — a fresh call is required once one does.
//
// EVERY MATCHING LEAD, NOT JUST ONE — INDEPENDENT LEADS SHARING A `uri`
// STAY INDEPENDENT, EXACTLY AS 0.9.24's OWN HEADER ALREADY REFUSED TO
// TREAT A SHARED `uri` AS CORROBORATION. If two different discovery
// services independently reported leads for the very same `uri` a claim
// names, this file produces one association per matching lead — both
// real, neither preferred. Whether that later resolves `RESOLVED` (one
// currently-known lead) or `AMBIGUOUS` (more than one) is entirely
// `application/DecentralizedWorldEncounterLeadResolution.js`'s own job;
// this file makes no such judgment and holds no such vocabulary.
//
// EVERY CANDIDATE ASSOCIATION IS RE-VALIDATED THROUGH 0.9.28's OWN
// `describeDecentralizedWorldEncounterLeadAssociation()` — NO SECOND
// VALIDATION ALGORITHM. This file constructs a candidate association from
// a matched (claim, lead) pair and hands it, unconditionally, to the
// exact function `application/DecentralizedWorldEncounterLeadResolution.js`
// already trusts to decide whether an association is well-formed — the
// same "makes no decision either file doesn't already make on its own"
// discipline `application/DecentralizedWorldDiscoveryQueryRegistryBridge.js`
// (0.9.27) already held one layer over, continued here.
//
// NO DEDUPLICATION OF ITS OWN — 0.9.28's OWN RESOLUTION ALREADY COLLAPSES
// DUPLICATE EVIDENCE FOR ONE LEAD. Two Publications that happen to claim
// the identical `uri` (an unusual but possible data-quality situation,
// never treated here as an error) each produce their own association
// against a matching lead, carrying their own distinct `objectId`;
// `resolveDecentralizedWorldEncounterLead()`'s own "duplicate evidence for
// the same lead counts once" rule already handles the case where two
// evidence entries end up identical. This file performs no de-duplication
// pass of its own — see "No second validation algorithm," above, held
// here for de-duplication too.
//
// `associations` IS ORDERED BY `publications` FIRST, THEN BY MATCHING
// `leads` WITHIN EACH PUBLICATION, IN THE ORDER SUPPLIED. Deterministic,
// so calling this function twice with byte-identical arguments returns a
// byte-identical result — the same guarantee every file in this chain
// already holds.
//
// `...FromRegistry()` MIRRORS 0.9.28's OWN REGISTRY WRAPPER, EXACTLY.
// `resolveDecentralizedWorldEncounterLeadFromRegistry()` already
// established the shape for "read `registry.listLeads()`, hand the
// result to the plain-array-taking function, return its result verbatim."
// This file's own registry wrapper does nothing else and holds no second
// algorithm of its own.
//
// MALFORMED INPUT DEGRADES TO AN EMPTY RESULT, NEVER THROWS. A missing or
// non-array `publications`, and a missing or non-array `leads`, are both
// treated as contributing nothing. A malformed entry within `publications`
// (one `describeDecentralizedPublicationLocationClaim()` itself rejects)
// or within `leads` (missing/not-an-object, or missing its own `uri`) is
// silently skipped, never allowed to block the well-formed evidence
// around it.
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK, NO CLOCK. This
// file performs no I/O of its own — it is handed already-fetched
// Publications and already-known leads, exactly as `application/
// DecentralizedWorldEncounterLeadResolution.js`'s own header already
// holds for the exact same reason one layer up. Every value this file
// returns is `Object.freeze()`'d; nothing passed in is ever mutated.
//
// NO SCORE, RANK, TRUST, VERIFIED, "PREFERRED," OR COMPARISON VOCABULARY
// OF ANY KIND — inherited unchanged from every file in this chain. This
// file produces candidate evidence; it never judges how credible that
// evidence is.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Verifying a claim's signature.** See `core/
//   DecentralizedPublicationLocationClaim.js`'s own header, "A claim,
//   never a verification." This file inherits that restraint unchanged —
//   it never imports `identity/LocalAuthorizationVerifier.js`.
// - **Fetching Publications from anywhere, or deciding which Publications
//   a caller should even supply.** A caller already has its own
//   Publications in hand — from a `PublisherProvider`, a local store, a
//   peer sync — exactly the same "handed already-fetched records" posture
//   `core/WorldEncounter.js`'s own `deriveWorldEncounters()` already holds
//   for Publications generally.
// - **Producing association evidence for `WorldEncounterKind.AVATAR`.**
//   See `core/DecentralizedPublicationLocationClaim.js`'s own header,
//   "Only WorldEncounterKind.PUBLICATION" — unchanged here, since this
//   file's only claim producer is that one.
// - **A second evidence producer — reading `core/
//   DecentralizedPublication.js`'s own envelope, or any other future
//   signed structure.** This milestone builds exactly one producer, from
//   exactly one already-existing signed structure; a second producer,
//   if one is ever needed, is unscheduled, later work with its own
//   milestone.
// - **Wiring the produced `associations` automatically into
//   `application/DecentralizedWorldEncounterLeadResolution.js`, or into
//   any UI.** A caller reads this file's own result and decides what,
//   if anything, to resolve next — this file's own job stops at
//   `associations[]`.
// - **Persisting, caching, or subscribing to evidence across calls.** Every
//   call is handed a fresh `publications` and `leads` snapshot by its
//   caller; nothing here accumulates between calls.

function isDescribedLead(value) {
    return Boolean(value) && typeof value === 'object' && typeof value.uri === 'string' && value.uri.length > 0;
}

// Pure. Derives the `associations` evidence array `application/
// DecentralizedWorldEncounterLeadResolution.js`'s own `resolveDecentralizedWorldEncounterLead()`
// already knows how to consume, by matching each already-signed
// `publications` entry's own location claim against every currently-known
// `leads` entry sharing its exact `uri` — see this file's own header for
// the full matching rule. Never throws; a missing/non-array `publications`
// or `leads` contributes nothing, and a malformed entry within either is
// silently skipped.
export function deriveDecentralizedWorldEncounterLeadAssociationEvidence({ publications, leads } = {}) {
    const knownPublications = Array.isArray(publications) ? publications : [];
    const knownLeads = Array.isArray(leads) ? leads : [];

    const associations = [];
    for (const publication of knownPublications) {
        const claim = describeDecentralizedPublicationLocationClaim({ publication });
        if (!claim) {
            continue;
        }
        for (const lead of knownLeads) {
            if (!isDescribedLead(lead) || lead.uri !== claim.uri) {
                continue;
            }
            const association = describeDecentralizedWorldEncounterLeadAssociation({
                origin: lead.origin,
                discoveryTag: lead.discoveryTag,
                uri: lead.uri,
                kind: claim.kind,
                objectId: claim.objectId
            });
            if (association) {
                associations.push(association);
            }
        }
    }
    return Object.freeze(associations);
}

// Pure. Reads `registry.listLeads()` and returns exactly what
// `deriveDecentralizedWorldEncounterLeadAssociationEvidence()` returns for
// that snapshot — see this file's own header, "mirrors 0.9.28's own
// registry wrapper, exactly." A `registry` missing a `listLeads` method is
// treated as contributing no leads at all.
export function deriveDecentralizedWorldEncounterLeadAssociationEvidenceFromRegistry({ publications, registry } = {}) {
    const leads = registry && typeof registry.listLeads === 'function' ? registry.listLeads() : undefined;
    return deriveDecentralizedWorldEncounterLeadAssociationEvidence({ publications, leads });
}
