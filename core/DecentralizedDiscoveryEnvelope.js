import { WorldEncounterKind } from './WorldEncounter.js';

// 0.9.30 — Decentralized Discovery Envelope.
//
// 0.9.24 through 0.9.29 built one full, working chain — query a service,
// describe a lead, register it, and, for exactly one already-signed local
// source (`publisher/Publication.js`), produce real association evidence
// that resolves a lead to a requested material. But every adapter this
// chain can talk to today is Arweave, and Arweave's own tags carry no
// `kind`/`objectId` of their own — `application/
// ArweaveGraphqlDiscoveryQueryService.js`'s own `search()` reports bare
// `{ uri, storage }`, and a lead built from that stays exactly what 0.9.24
// named it: a rumor about a LOCATION, never about WHAT lives there. The
// only way this codebase has ever turned a location into association
// evidence is 0.9.29's own path — an ALREADY-SIGNED, ALREADY-LOCAL
// `Publication` whose own `contentReference.uri` a caller happens to
// already hold. A publisher who wants to be found by a search or index
// service they do not control, on a substrate this codebase has never
// heard of, has had no way to say "the thing at this uri is publication
// P123" — until a caller already has that publication in hand to ask.
// This file names the format that closes that gap: a small, JSON,
// substrate-neutral envelope a publisher can attach to whatever payload
// field THEIR substrate already offers (an Arweave transaction's own
// data, a Nostr event's own `content`, an AT Protocol record's own
// fields, a Hive `custom_json`'s own body) so that a caller who only has
// a discovery tag and a URI can still learn what the URI claims to be.
//
//   Publisher, at publish time, on ANY substrate:
//   attaches this envelope's own JSON shape to whatever
//   payload field that substrate already offers
//                    │
//                    │   { protocol: "forkbuild", version: 1,
//                    │     kind: "PUBLICATION", objectId: "...",
//                    │     uri: "..." }
//                    ▼
//   (future, unscheduled — a substrate-specific adapter's own
//    `search()` reporting that raw payload alongside the
//    `{ uri, storage }` candidate it already reports today)
//                    │
//                    ▼
//   core/DecentralizedDiscoveryEnvelope.js   ★ (THIS milestone)
//        describeDecentralizedDiscoveryEnvelope()
//        parseDecentralizedDiscoveryEnvelope()
//                    │
//                    ▼
//   (future, unscheduled — feeding a described envelope into
//    something `application/
//    DecentralizedWorldEncounterLeadAssociationEvidenceIngress.js`
//    (0.9.29) or a sibling of it can turn into association
//    evidence; see "Deliberately excluded," below)
//
// THE DISCOVERY TAG AND THE ENVELOPE ANSWER TWO DIFFERENT QUESTIONS, AND
// THIS FILE ONLY EVER ANSWERS THE SECOND ONE. `discoveryTag` — 0.9.24's
// own field, unmodified, untouched by this file — answers "can I find
// ForkBuild-related material on this substrate at all." It is a search
// accelerator: a free-form marker a query is matched against, exactly as
// open and exactly as unproven as 0.9.24's own header already insists.
// Finding something tagged with it means only "this is worth asking
// whether it carries a ForkBuild discovery envelope" — never "this IS a
// ForkBuild publication." The envelope this file describes is the answer
// to THAT second question, once asked: a self-declared claim about WHICH
// object a tagged item's own uri is for. Neither question's answer proves
// the other. This file never reads, validates, or even imports anything
// named `discoveryTag` — that stays exactly where 0.9.24 through 0.9.27
// left it, one layer below this one.
//
// A SELF-DECLARED CLAIM, NEVER EVIDENCE, NEVER A LEAD, NEVER A
// `DecentralizedPublicationLocationClaim`. `core/
// DecentralizedPublicationLocationClaim.js` (0.9.29) reads a claim off an
// ALREADY-SIGNED `Publication` a caller already holds locally — its own
// header names exactly what makes that claim worth calling evidence at
// all: "SOME signature is attached." An envelope this file describes
// carries no such thing. It is JSON some search or index service handed
// back, exactly as unauthenticated as the `uri`/`storage` candidates
// `application/ArweaveGraphqlDiscoveryQueryService.js` already reports
// today — anyone able to publish anything discoverable on a given
// substrate can attach any envelope they like, naming any `objectId` they
// like, truthfully or not. This file validates an envelope's own SHAPE —
// that it is well-formed JSON claiming a recognized protocol, version,
// kind, object, and location — and nothing about whether that claim is
// true. It is deliberately NOT wired into `core/
// DecentralizedWorldEncounterLeadAssociation.js` or `application/
// DecentralizedWorldEncounterLeadAssociationEvidenceIngress.js` by this
// milestone; see "Deliberately excluded," below, for exactly why that
// restraint matters here even more than it did for a signed Publication.
//
// `protocol` AND `version` ARE A NAMESPACE GATE, NEVER A VERIFICATION.
// `DECENTRALIZED_DISCOVERY_ENVELOPE_PROTOCOL` (`"forkbuild"`) and
// `DECENTRALIZED_DISCOVERY_ENVELOPE_VERSION` (`1`) are exported constants
// this file's own describe function checks a candidate envelope against
// exactly — any other `protocol` string, and any `version` other than the
// one currently understood, describe to `null`. This is the same
// discipline `core/DecentralizedWorldEncounterLeadAssociation.js`'s own
// "two kinds, never a third" already holds for `kind`: a closed check
// against exactly what this codebase currently knows how to read, not an
// attempt to guess at, migrate, or partially understand a shape it
// doesn't recognize. A future protocol version, if this codebase ever
// needs one, is unscheduled, later work — seeing `version: 2` today
// means "not describable," never "describable, but ignore the parts I
// don't understand."
//
// `kind`/`objectId`/`uri` REUSE ALREADY-ESTABLISHED VOCABULARY, INVENT
// NOTHING NEW. `kind` is validated against the exact same
// `WorldEncounterKind` enum `core/DecentralizedPublicationLocationClaim.js`
// and `core/DecentralizedWorldEncounterLeadAssociation.js` already import
// and validate against — both `PUBLICATION` and `AVATAR` are accepted
// here, unlike 0.9.29's own claim reader, which can only ever produce
// `PUBLICATION` because `publisher/Publication.js` is the only signed
// structure that exists today. An envelope is self-declared, not derived
// from an existing class's own shape, so it carries no such restriction —
// see "Deliberately excluded," below, for why accepting `AVATAR` here
// still produces nothing usable yet. `objectId` and `uri` are the same
// two field names `core/DecentralizedPublicationLocationClaim.js` and
// `core/DecentralizedWorldDiscoveryLead.js` already use for the identical
// purpose, reused rather than renamed, for the same reason 0.9.24's own
// header already gave for reusing `uri`/`storage`: so a future milestone
// that DOES wire an envelope into evidence never needs a field-renaming
// step first.
//
// TWO ENTRY POINTS, ONE VALIDATION ALGORITHM.
// `describeDecentralizedDiscoveryEnvelope()` validates an already-parsed,
// plain-object candidate — the same shape every other `describe*()`
// function in this whole family accepts. `parseDecentralizedDiscoveryEnvelope()`
// is the one addition this milestone makes beyond that familiar shape: it
// accepts a RAW payload — a JSON string (what a Nostr event's own
// `content`, or a Hive `custom_json`'s own body, typically hands back) OR
// an already-parsed plain object (what an AT Protocol record's own
// fields, already deserialized by whatever fetched them, typically hands
// back) — parses the string case, and then calls
// `describeDecentralizedDiscoveryEnvelope()` on whichever object it ends
// up with. There is no second, independent validation algorithm; a
// substrate-specific adapter, whenever one is built, is free to call
// either entry point depending on whether its own substrate already
// handed it parsed JSON or a raw string.
//
// MALFORMED INPUT DEGRADES TO `null`, NEVER THROWS — inherited from every
// file in this family unchanged. `describeDecentralizedDiscoveryEnvelope()`
// returns `null` for a missing/non-object candidate; a `protocol` other
// than the one exact supported constant; a `version` other than the one
// exact supported constant; a `kind` outside `WorldEncounterKind`; or a
// missing, empty, non-string `objectId` or `uri`.
// `parseDecentralizedDiscoveryEnvelope()` additionally returns `null` for
// a raw payload that is not a string and not a plain object (an array,
// `null`, a number, `undefined`), and for a string that fails to parse as
// JSON at all — a substrate returning garbage, truncated, or
// non-JSON payload data is exactly as undescribable as one returning
// nothing.
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK, NO CLOCK, NO
// SIGNATURE. This file performs no I/O of its own — it is handed a
// candidate or a raw payload some other layer already retrieved, exactly
// as `core/DecentralizedPublicationLocationClaim.js`'s own header already
// holds for the identical reason one producer over. It never imports
// `identity/LocalAuthorizationVerifier.js`, checks a signature of any
// kind, or asks whether whoever attached an envelope is who they claim to
// be — an envelope carries no signature field for this file to even look
// for. Every value this file returns is `Object.freeze()`'d; nothing
// passed in is ever mutated.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Wiring a described envelope into `core/
//   DecentralizedWorldEncounterLeadAssociation.js` or `application/
//   DecentralizedWorldEncounterLeadAssociationEvidenceIngress.js` as a
//   second evidence producer.** An unsigned, self-declared envelope is
//   meaningfully weaker evidence than 0.9.29's own signed-Publication
//   claim — treating the two identically, in the same milestone that
//   first defines the unsigned shape, would blur a distinction this whole
//   family has drawn carefully at every layer so far. Whether, and how,
//   an unsigned envelope should ever be allowed to resolve a lead
//   (perhaps only alongside some future signature scheme of its own) is
//   unscheduled, later work — a deliberate, explicit decision this
//   milestone declines to make by default.
// - **Any substrate-specific adapter that actually extracts a raw payload
//   from an Arweave transaction, a Nostr event, an AT Protocol record, or
//   a Hive `custom_json` and hands it to `parseDecentralizedDiscoveryEnvelope()`.**
//   This file defines the envelope's own shape only; teaching
//   `application/ArweaveGraphqlDiscoveryQueryService.js` to read its own
//   transaction data field, or building a Nostr/AT-Protocol/Hive adapter
//   of `application/DecentralizedWorldDiscoveryQuery.js`'s own
//   `DecentralizedDiscoveryQueryService` shape, is unscheduled, later
//   work, one adapter at a time.
// - **Producing usable output for `WorldEncounterKind.AVATAR`.** `kind` is
//   validated against the full enum because an envelope is self-declared
//   rather than derived from an existing class's own limitation — but
//   nothing downstream in this codebase can yet consume `AVATAR`
//   association evidence at all; see `core/
//   DecentralizedPublicationLocationClaim.js`'s own header, "Only
//   WorldEncounterKind.PUBLICATION," which remains true one layer over.
// - **A registry, cache, or deduplication pass over more than one
//   envelope.** This file describes and parses exactly one envelope per
//   call — the same "one lead per call... no plural counterpart"
//   restraint 0.9.24's own header already held, at this layer.
// - **Any signature, checksum, or authenticity mechanism for an envelope
//   itself.** See "Synchronous, pure... no signature," above — if this
//   codebase ever needs a signed envelope format, that is a different,
//   unscheduled shape, not an extension bolted onto this one.
// - **A second, currently-unsupported protocol version.** See "protocol
//   and version are a namespace gate," above.

const SUPPORTED_ENVELOPE_PROTOCOL = 'forkbuild';
const SUPPORTED_ENVELOPE_VERSION = 1;

function isNonEmptyString(value) {
    return typeof value === 'string' && value.length > 0;
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

// Pure. Describes ONE substrate-neutral ForkBuild discovery envelope out
// of an already-parsed, plain-object `candidate` — see this file's own
// header for the full shape and why it is a self-declared claim, never
// evidence. Returns `null`, never throws, when `candidate` is
// missing/not a plain object; when `candidate.protocol` is not exactly
// `DECENTRALIZED_DISCOVERY_ENVELOPE_PROTOCOL`; when `candidate.version` is
// not exactly `DECENTRALIZED_DISCOVERY_ENVELOPE_VERSION`; when
// `candidate.kind` is outside `WorldEncounterKind`; or when
// `candidate.objectId` or `candidate.uri` is missing, empty, or not a
// string.
export function describeDecentralizedDiscoveryEnvelope(candidate) {
    if (!isPlainObject(candidate)) {
        return null;
    }
    if (candidate.protocol !== SUPPORTED_ENVELOPE_PROTOCOL) {
        return null;
    }
    if (candidate.version !== SUPPORTED_ENVELOPE_VERSION) {
        return null;
    }
    if (candidate.kind !== WorldEncounterKind.PUBLICATION && candidate.kind !== WorldEncounterKind.AVATAR) {
        return null;
    }
    if (!isNonEmptyString(candidate.objectId)) {
        return null;
    }
    if (!isNonEmptyString(candidate.uri)) {
        return null;
    }
    return Object.freeze({
        protocol: candidate.protocol,
        version: candidate.version,
        kind: candidate.kind,
        objectId: candidate.objectId,
        uri: candidate.uri
    });
}

// Pure. Parses `rawPayload` — a JSON string, or an already-parsed plain
// object, exactly as either might arrive from a substrate-specific
// adapter's own payload field — and describes it via
// `describeDecentralizedDiscoveryEnvelope()`. Returns `null`, never
// throws, when `rawPayload` is neither a string nor a plain object, when
// a string `rawPayload` fails to parse as JSON, or when the resulting
// object fails `describeDecentralizedDiscoveryEnvelope()`'s own
// validation.
export function parseDecentralizedDiscoveryEnvelope(rawPayload) {
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
    return describeDecentralizedDiscoveryEnvelope(candidate);
}

export const DECENTRALIZED_DISCOVERY_ENVELOPE_PROTOCOL = SUPPORTED_ENVELOPE_PROTOCOL;
export const DECENTRALIZED_DISCOVERY_ENVELOPE_VERSION = SUPPORTED_ENVELOPE_VERSION;
