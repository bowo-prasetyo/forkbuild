// 0.9.253 — Place Naming Discovery Boundary.
//
// 0.5.2 built the naming MODEL (core/PlaceNamingClaim.js) and 0.5.3 built
// its first TRANSPORT (application/PlaceNamingClaimExchange.js — manual
// file export/import, deliberately protocol-independent so "every future
// transport... plugs into THIS class's importClaim()/exportClaim(),
// never into core/PlaceNamingView.js or
// application/LocalPlaceNamingClaimStore.js directly"). Neither file
// answers a question a peer-to-peer or decentralized transport actually
// needs answered first: given nothing but a `worldId`/`regionId` a
// Wanderer currently cares about, WHAT WIRE SHAPE does a source hand back
// so that shape can become a `PlaceNamingClaim` candidate at all? This
// file names that shape — the exact seam `core/SnapshotDiscoveryEnvelope.js`
// (0.9.133) already named for Snapshot discovery, drawn here for Place
// Naming discovery instead.
//
//   PlaceNamingClaim (core/PlaceNamingClaim.js, 0.5.2, signed, unmodified)
//                    │
//                    │   { worldId, regionId, claim: claim.toJSON() }
//                    ▼
//   core/PlaceNamingDiscoveryEnvelope.js   ★ (THIS)
//        buildPlaceNamingDiscoveryEnvelope()
//        describePlaceNamingDiscoveryEnvelope()
//        parsePlaceNamingDiscoveryEnvelope()
//        derivePlaceNamingDiscoveryTag()
//                    │
//                    ▼
//   application/PlaceNamingDiscoveryQueryService.js   (0.9.253, sibling —
//        aggregates whatever a source's own search() hands back, parsing
//        each raw payload through THIS file)
//
// A DELIBERATELY DIFFERENT SHAPE FROM `core/SnapshotDiscoveryEnvelope.js`,
// NOT A REUSE, NOT AN EXTENSION — the exact restraint that file's own
// header already held for `core/DecentralizedDiscoveryEnvelope.js`, one
// domain further over. A Snapshot's discoverable fact is "where can BYTES
// matching this hash be retrieved from" — `contentHash`/`locator`/
// `storage`, with the bytes themselves always fetched separately, later,
// from whatever `storage` names. A `PlaceNamingClaim` has no bytes to
// fetch separately at all: it is already a small, complete, SIGNED JSON
// record the instant it exists (see core/PlaceNamingClaim.js#toJSON()).
// So this envelope carries the claim ITSELF, inline, in full — there is
// no `locator`/`storage` split to make, because there is nothing left
// over to retrieve once the envelope has arrived. Inventing one anyway
// (e.g. a `claimHash` + a separate "fetch the claim" step) would be
// exactly the "SnapshotDiscoveryEnvelope + place-name special case"
// shortcut this milestone's own brief named and rejected by name.
//
// `worldId`/`regionId` ARE CARRIED AT THE ENVELOPE'S OWN TOP LEVEL, EVEN
// THOUGH THEY ALSO APPEAR INSIDE `claim` — DELIBERATELY REDUNDANT, NEVER
// AN OVERSIGHT. A discovery source (a Nostr relay filtered by tag, a peer
// answering "what do you have for this region," a future DHT keyed by
// region) needs a stable, source-agnostic ROUTING key — see
// `derivePlaceNamingDiscoveryTag()`, below — that exists independently of
// whether the embedded claim itself turns out to be well-formed. Carrying
// `worldId`/`regionId` only inside `claim` would force every source to
// already trust an unparsed, unverified claim body just to decide which
// region it was even about. `describePlaceNamingDiscoveryEnvelope()`
// therefore CROSS-VALIDATES that the envelope's own `worldId`/`regionId`
// agree with the embedded claim's own copies — an envelope claiming to be
// about one region while embedding a claim about another degrades to
// `null`, exactly the mismatch `core/SnapshotDiscoveryEnvelope.js`'s own
// 0.9.171 header already refused for a bare `claimedPosition` with no
// `publicationId` to bind it to ("travel together, or not at all").
//
// A SELF-DECLARED CLAIM, NEVER EVIDENCE, NEVER VERIFICATION — the
// identical posture every envelope in this family already holds. This
// file validates SHAPE only: that `claim` carries the non-empty string
// fields `core/PlaceNamingClaim.js`'s own constructor already requires
// (`id`, `worldId`, `regionId`, `name`, `authorIdentityId`, `createdAt`)
// and a `signature` object carrying the same five fields
// `application/PlaceNamingClaimPublicationValidator.js` already checks
// (`algorithm`, `signer`, `signature`, `signedHash`, `domain`). Whether
// that signature actually verifies, and whether its signer actually
// equals `claim.authorIdentityId`, is deliberately NOT this file's
// question — `identity/LocalAuthorizationVerifier.js#verifyPlaceNamingClaim()`
// answers that, on the CONSUMING side, exactly the "well-formed is a
// weaker claim than authentic" boundary
// `application/PlaceNamingClaimPublicationValidator.js`'s own header
// already draws for the file-exchange transport. A discovery source
// handing back a well-formed-but-forged envelope is expected, ordinary,
// and this file's problem to describe, never this file's problem to
// catch — the same restraint held for a Snapshot's own `contentHash`.
//
// TWO ENTRY POINTS, ONE VALIDATION ALGORITHM, PLUS ONE BUILDER — mirrors
// `core/SnapshotDiscoveryEnvelope.js`'s own split exactly.
// `describePlaceNamingDiscoveryEnvelope()` validates an already-parsed,
// plain-object candidate. `parsePlaceNamingDiscoveryEnvelope()` accepts a
// RAW payload — a JSON string (a relay event's own `content`, a peer
// message body) or an already-parsed plain object — and describes
// whichever it ends up with. `buildPlaceNamingDiscoveryEnvelope()` is the
// inverse: given an already-SIGNED `PlaceNamingClaim` instance, produces
// the plain-object shape a future publishing source hands to a transport
// — the identical role `application/PlaceNamingClaimPublication.js#
// buildPlaceNamingClaimPublication()` already plays for the file-exchange
// transport, one wire shape over.
//
// MALFORMED INPUT DEGRADES TO `null`, NEVER THROWS — for the two
// describe/parse entry points, inherited unchanged from every file in
// this family. `buildPlaceNamingDiscoveryEnvelope()` is the one
// exception, exactly as `buildPlaceNamingClaimPublication()` already is:
// a caller handing it an unsigned or non-`PlaceNamingClaim` value gets a
// synchronous throw, never a silently-unpublishable envelope.
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK, NO SIGNATURE
// VERIFICATION. Every value this file returns is `Object.freeze()`'d
// (including the nested `claim` and `claim.signature`); nothing passed in
// is ever mutated. This file never imports `identity/
// LocalAuthorizationVerifier.js`, `application/LocalPlaceNamingClaimStore.js`,
// or anything transport-shaped (Nostr, WebRTC, a relay client) — it only
// names a JSON contract.
//
// `derivePlaceNamingDiscoveryTag()` IS A PURE STRING FUNCTION, NEVER A
// NETWORK CONCERN. It exists so every future source — a Nostr publisher
// choosing a tag, a Nostr query service filtering by one, a peer exchange
// deciding what to ask a peer for — derives the IDENTICAL tag from the
// same `worldId`/`regionId` pair, without needing to agree on the rule by
// convention alone. It performs no I/O and knows nothing about Nostr,
// WebRTC, or any specific transport's own tag/topic vocabulary; a
// transport is free to wrap or hash this string further for its own
// wire format, but never to invent a second, competing derivation.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE. See docs/Roadmap.md,
// "0.9.253 — Place Naming Discovery Boundary," for the full list: any
// concrete transport (Nostr publish/query, Arweave, WebRTC peer
// exchange); ranking, deduplication, or trust scoring across more than
// one envelope; automatic proximity/radius filtering of any kind; wiring
// a discovered envelope into World presentation, `WorldRegion`, or
// `WorldNavigationSession`; and any signature verification — this file
// validates shape only, exactly as its own header states above.

import { PlaceNamingClaim } from './PlaceNamingClaim.js';

const SUPPORTED_ENVELOPE_PROTOCOL = 'forkbuild-place-naming-discovery';
const SUPPORTED_ENVELOPE_VERSION = 1;

const REQUIRED_CLAIM_STRING_FIELDS = ['id', 'worldId', 'regionId', 'name', 'authorIdentityId', 'createdAt'];
const REQUIRED_SIGNATURE_STRING_FIELDS = ['algorithm', 'signer', 'signature', 'signedHash', 'domain'];

function isNonEmptyString(value) {
    return typeof value === 'string' && value.length > 0;
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function describeSignature(signature) {
    if (!isPlainObject(signature)) {
        return null;
    }
    const described = {};
    for (const field of REQUIRED_SIGNATURE_STRING_FIELDS) {
        if (!isNonEmptyString(signature[field])) {
            return null;
        }
        described[field] = signature[field];
    }
    return Object.freeze(described);
}

function describeClaim(claim, worldId, regionId) {
    if (!isPlainObject(claim)) {
        return null;
    }
    for (const field of REQUIRED_CLAIM_STRING_FIELDS) {
        if (!isNonEmptyString(claim[field])) {
            return null;
        }
    }
    // Cross-validate: the envelope's own worldId/regionId must agree with
    // the embedded claim's own copies — see this file's own header,
    // "carried at the envelope's own top level... deliberately redundant."
    if (claim.worldId !== worldId || claim.regionId !== regionId) {
        return null;
    }
    const signature = describeSignature(claim.signature);
    if (!signature) {
        return null;
    }
    return Object.freeze({
        id: claim.id,
        worldId: claim.worldId,
        regionId: claim.regionId,
        name: claim.name,
        authorIdentityId: claim.authorIdentityId,
        createdAt: claim.createdAt,
        signature
    });
}

// Pure. Describes ONE Place Naming Discovery Envelope out of an
// already-parsed, plain-object `candidate` — see this file's own header
// for the full shape and why it is a self-declared claim, never evidence.
// Returns `null`, never throws, when `candidate` is missing/not a plain
// object; when `candidate.protocol`/`candidate.version` do not exactly
// match the supported protocol/version; when `candidate.worldId`/
// `candidate.regionId` are missing, empty, or not strings; when
// `candidate.claim` is missing, not a plain object, missing any required
// string field, carries a malformed `signature`, or disagrees with the
// envelope's own `worldId`/`regionId`.
export function describePlaceNamingDiscoveryEnvelope(candidate) {
    if (!isPlainObject(candidate)) {
        return null;
    }
    if (candidate.protocol !== SUPPORTED_ENVELOPE_PROTOCOL) {
        return null;
    }
    if (candidate.version !== SUPPORTED_ENVELOPE_VERSION) {
        return null;
    }
    if (!isNonEmptyString(candidate.worldId)) {
        return null;
    }
    if (!isNonEmptyString(candidate.regionId)) {
        return null;
    }

    const claim = describeClaim(candidate.claim, candidate.worldId, candidate.regionId);
    if (!claim) {
        return null;
    }

    return Object.freeze({
        protocol: candidate.protocol,
        version: candidate.version,
        worldId: candidate.worldId,
        regionId: candidate.regionId,
        claim
    });
}

// Pure. Parses `rawPayload` — a JSON string, or an already-parsed plain
// object — and describes it via `describePlaceNamingDiscoveryEnvelope()`.
// Returns `null`, never throws, when `rawPayload` is neither a string nor
// a plain object, when a string `rawPayload` fails to parse as JSON, or
// when the resulting object fails validation.
export function parsePlaceNamingDiscoveryEnvelope(rawPayload) {
    let candidate;
    if (typeof rawPayload === 'string') {
        if (rawPayload.length === 0) {
            return null;
        }
        try {
            candidate = JSON.parse(rawPayload);
        } catch {
            return null;
        }
    } else if (isPlainObject(rawPayload)) {
        candidate = rawPayload;
    } else {
        return null;
    }
    return describePlaceNamingDiscoveryEnvelope(candidate);
}

// Builds a Place Naming Discovery Envelope for an already-SIGNED
// `PlaceNamingClaim` instance — the inverse of describe/parse, and the
// shape a future publishing source hands to a transport. Throws
// synchronously (never returns `null`) for a missing/non-instance
// `claim`, or an unsigned one — the identical discipline
// `application/PlaceNamingClaimPublication.js#buildPlaceNamingClaimPublication()`
// already holds: publishing a claim no receiver's own validator could
// ever accept back is a caller-side mistake to fail loudly on, not to
// silently produce dead-on-arrival data for.
export function buildPlaceNamingDiscoveryEnvelope(claim) {
    if (!claim || !(claim instanceof PlaceNamingClaim)) {
        throw new Error('PlaceNamingDiscoveryEnvelope: a PlaceNamingClaim instance is required');
    }
    if (!claim.signature) {
        throw new Error('PlaceNamingDiscoveryEnvelope: refusing to announce an unsigned claim');
    }
    return {
        protocol: SUPPORTED_ENVELOPE_PROTOCOL,
        version: SUPPORTED_ENVELOPE_VERSION,
        worldId: claim.worldId,
        regionId: claim.regionId,
        claim: claim.toJSON()
    };
}

// Pure string function — see this file's own header, "a pure string
// function, never a network concern." Throws synchronously for a
// missing/empty `worldId` or `regionId`, the same "fail loudly on a
// caller-side mistake" discipline `buildPlaceNamingDiscoveryEnvelope()`
// already holds, since a discovery tag with a silently-blank half is
// worse than no tag at all.
export function derivePlaceNamingDiscoveryTag(worldId, regionId) {
    if (!isNonEmptyString(worldId)) {
        throw new Error('derivePlaceNamingDiscoveryTag: a non-empty worldId is required');
    }
    if (!isNonEmptyString(regionId)) {
        throw new Error('derivePlaceNamingDiscoveryTag: a non-empty regionId is required');
    }
    return `forkbuild-place-naming:${worldId}:${regionId}`;
}

export const PLACE_NAMING_DISCOVERY_ENVELOPE_PROTOCOL = SUPPORTED_ENVELOPE_PROTOCOL;
export const PLACE_NAMING_DISCOVERY_ENVELOPE_VERSION = SUPPORTED_ENVELOPE_VERSION;
