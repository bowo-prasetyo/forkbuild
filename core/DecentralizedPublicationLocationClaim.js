import { WorldEncounterKind } from './WorldEncounter.js';

// 0.9.29 — Decentralized Association Evidence Ingress.
//
// 0.9.28's own header drew a hard line and then left it for later: "no
// producer of real association evidence exists yet... that requires
// either a signed publication envelope naming its own material's
// location... or some other real evidence source that has actually
// inspected a lead's own material." This file is the first half of
// answering that — not by inventing a new evidence format, but by
// reading the one that already exists. `publisher/Publication.js` has,
// since 0.2.14/0.2.16, been exactly "a signed publication envelope
// naming its own material's location": its own `id` is the very
// `objectId` `core/WorldEncounter.js`'s own `describeEncounterablePublication()`
// already uses for a `WorldEncounterKind.PUBLICATION`, and its own
// `contentReference.uri` is a location claim the publishing identity's
// `signature` already covers. Nobody had to build a new signed structure
// for this milestone — it was sitting in this codebase since 0.2.16,
// unconnected to the decentralized discovery family 0.9.24+ built five
// months of milestones later.
//
//   publisher/Publication.js   (0.2.14/0.2.16, unmodified — read
//        .id                    duck-typed here, never imported as a
//        .contentReference.uri  class; see "Duck-typed, never a class
//        .signature             import," below)
//                    │
//                    │   "this signed identity claims THIS object's
//                    │    content can be found at THIS uri"
//                    ▼
//   core/DecentralizedPublicationLocationClaim.js   ★ (THIS)
//        describeDecentralizedPublicationLocationClaim()
//                    │
//                    ▼
//   application/DecentralizedWorldEncounterLeadAssociationEvidenceIngress.js
//        (THIS milestone, other half — matches a claim's own `uri`
//         against currently-known decentralized discovery leads to
//         produce the `associations` array
//         application/DecentralizedWorldEncounterLeadResolution.js
//         (0.9.28, unmodified) already knows how to consume)
//
// A CLAIM, NEVER A VERIFICATION. This file reads `publication.signature`
// only to confirm ONE THING IS TRUE: SOME signature is attached, so this
// is a signed assertion rather than arbitrary unsigned data anyone could
// fabricate locally. It never calls anything in `identity/
// LocalAuthorizationVerifier.js`, never reconstructs a signing envelope,
// never checks a signature's bytes against a public key, and never asks
// whether `publisherIdentity` is who it claims to be. "This identity
// SAID this object lives at this uri" and "this object ACTUALLY lives at
// this uri, published by who it says" are two different questions — this
// file only ever answers the first, exactly the restraint the task that
// requested this milestone named explicitly: "I would not make 0.9.29
// verify the evidence." Verifying a claim's signature, if this codebase
// ever needs to gate resolution on it, is later, unscheduled work — see
// "Deliberately excluded," below.
//
// DUCK-TYPED, NEVER A CLASS IMPORT. This file never imports `Publication`
// from `publisher/Publication.js` — exactly the same restraint
// `core/WorldEncounter.js`'s own `describeEncounterablePublication()`
// already holds for the identical reason: `core/` never imports from
// `publisher/` anywhere in this codebase (only `application/` does), and
// this file continues that boundary rather than being the first to cross
// it. A caller hands this function anything shaped like a Publication —
// a hydrated `Publication` instance, a plain JSON record, a test double —
// and it reads exactly three fields: `id`, `contentReference.uri`, and
// `signature`.
//
// ONLY `WorldEncounterKind.PUBLICATION` — AVATAR STAYS UNPRODUCIBLE, ON
// PURPOSE. `core/AvatarProfile.js` carries no `contentReference` and
// never has; nothing in this codebase today lets an avatar's own material
// claim a decentralized location the way a `Publication` already can.
// This file does not invent one. Its result's own `kind` is always
// `WorldEncounterKind.PUBLICATION` — never a parameter, never guessed.
// Association evidence for an avatar's material remains exactly what
// 0.9.28 already left it: unproducible, until some future, unscheduled
// signed structure exists for avatars the same way `Publication` already
// does for publications.
//
// A CLAIM NAMES ONE URI, NEVER `storage`, NEVER A HASH. `contentReference`
// already carries `hash`, `algorithm`, `mediaType`, `size`, and `storage`
// alongside `uri` — this file reads only `uri`, because `uri` is the one
// field `core/DecentralizedWorldDiscoveryLead.js`'s own leads carry too,
// and matching against a lead is the only thing this claim will ever be
// used for (see the application-layer ingress file, above). Reading
// `hash` here would tempt a caller into using it as if it were a
// verification step; this file gives it no opportunity to.
//
// MALFORMED INPUT DEGRADES TO `null`, NEVER THROWS — the same contract
// every file in this whole decentralized-discovery family already holds.
// `describeDecentralizedPublicationLocationClaim()` returns `null` when
// `publication` is missing or not an object; when `publication.id` is
// missing, empty, or not a string; when `publication.signature` is
// missing or falsy; when `publication.contentReference` is missing or not
// an object; or when `publication.contentReference.uri` is missing,
// empty, or not a string.
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK, NO CLOCK. Every
// value this file returns is `Object.freeze()`'d; nothing passed in is
// ever mutated. Calling this function twice with byte-identical input
// returns a byte-identical result.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Cryptographic signature verification.** See "A claim, never a
//   verification," above — this file never imports `identity/
//   LocalAuthorizationVerifier.js` or anything that checks signature
//   bytes.
// - **Matching a claim against a decentralized discovery lead, or
//   producing anything `application/
//   DecentralizedWorldEncounterLeadResolution.js`'s own `associations`
//   parameter can consume.** That is `application/
//   DecentralizedWorldEncounterLeadAssociationEvidenceIngress.js`'s own
//   job, one layer up, in this same milestone.
// - **Reading `core/DecentralizedPublication.js`'s own envelope, or
//   treating it as a second producer alongside `publisher/
//   Publication.js`.** `DecentralizedPublication` wraps arbitrary signed
//   content by a free-form `contentKind` string — it carries no
//   `WorldEncounter`-shaped `objectId` the way `Publication.id` already
//   does, and inventing one is unscheduled, later work, only worth doing
//   if a real caller ever needs it.
// - **An avatar-side equivalent.** See "Only WorldEncounterKind.PUBLICATION,"
//   above.
// - **Retrieving anything from `contentReference.uri`, or constructing a
//   real, hash-verified `core/ContentReference.js` from a claim.**
//   Unscheduled, later work — this file never imports
//   `core/ContentReference.js` and never fetches anything.

function isNonEmptyString(value) {
    return typeof value === 'string' && value.length > 0;
}

// Pure. Describes ONE location claim a signed Publication-shaped object's
// own fields already make — "this signed identity claims object `id`'s
// content can be found at this `uri`" — never anything this file infers,
// verifies, or looks up elsewhere. Returns `null`, never throws, when
// `publication` is missing/not an object; when its `id` is missing, empty,
// or not a string; when it carries no `signature` at all; or when its
// `contentReference.uri` is missing, empty, or not a string.
export function describeDecentralizedPublicationLocationClaim({ publication } = {}) {
    if (!publication || typeof publication !== 'object') {
        return null;
    }
    if (!isNonEmptyString(publication.id)) {
        return null;
    }
    if (!publication.signature) {
        return null;
    }
    const contentReference = publication.contentReference;
    if (!contentReference || typeof contentReference !== 'object') {
        return null;
    }
    if (!isNonEmptyString(contentReference.uri)) {
        return null;
    }
    return Object.freeze({
        kind: WorldEncounterKind.PUBLICATION,
        objectId: publication.id,
        uri: contentReference.uri
    });
}
