import { describeDecentralizedDiscoveryEnvelope } from '../core/DecentralizedDiscoveryEnvelope.js';

const DEFAULT_RELAY_URL = 'wss://relay.damus.io';
const DEFAULT_TAG_NAME = 't';
const DEFAULT_KIND = 1;
const DEFAULT_TIMEOUT_MS = 8000;
const EVENT_ID_PATTERN = /^[0-9a-f]{64}$/i;

// 0.9.46 — Nostr Publication Discovery Publisher.
//
// 0.9.44's own `PublicationDistributionDescriptor.js` already produces a
// `discoveryEnvelope` — a real `core/DecentralizedDiscoveryEnvelope.js`
// value naming where a Publication's material claims to live. 0.9.45 gave
// that envelope's own `uri` a real Arweave transaction behind it. Neither
// file announces the envelope anywhere. This is the publishing counterpart
// of `application/NostrDiscoveryQueryService.js` (0.9.31): that file reads
// a Nostr event's own `content` and, if it parses as a well-formed
// envelope, reports a candidate; this file takes an already-described
// envelope and puts that exact same JSON into a Nostr event's own
// `content`, so the two sides speak one protocol, not two.
//
//   Discovery Envelope   (application/PublicationDistributionDescriptor.js,
//        { protocol, version, kind, objectId, uri }   0.9.44, unmodified)
//              │
//              ▼
//   application/NostrPublicationDiscoveryPublisher.js   ★ (THIS)
//        NostrPublicationDiscoveryPublisher#publish(envelope)
//              │
//              │   { kind, tags: [[tagName, discoveryTag]],
//              │     content: JSON.stringify(envelope) }
//              │
//              ▼
//   injected publishImpl(relayUrl, eventTemplate)   (signing + broadcast —
//        never performed by this file itself; see "No wallet management,"
//        below)
//              │
//              ▼
//   { published: true, relayUrl, id } | null
//
// ONE PROTOCOL ENVELOPE, NEVER TWO. This file never builds its own
// "publication announcement" shape. `publish()` re-validates its own
// `envelope` argument through `core/DecentralizedDiscoveryEnvelope.js`'s own
// `describeDecentralizedDiscoveryEnvelope()`, unmodified, and serializes
// exactly THAT canonical, already-frozen result via `JSON.stringify()` —
// never the caller's raw argument, never a hand-picked subset of its
// fields, never an extra field bolted on. The bytes that land in a Nostr
// event's own `content` are therefore byte-identical, field for field, to
// what `application/NostrDiscoveryQueryService.js`'s own
// `parseDecentralizedDiscoveryEnvelope(event.content)` (0.9.31, unmodified)
// already knows how to read back out on the consuming side. One shape,
// defined once by 0.9.30, ridden unmodified by a publisher and a consumer
// alike — never a publication-side dialect and a consumption-side dialect
// that happen to agree today.
//
// A DISCOVERY TAG, NEVER AN ENVELOPE FIELD, IS WHAT RIDES IN A NOSTR TAG —
// THE SAME LINE `application/NostrDiscoveryQueryService.js`'s OWN HEADER
// ALREADY DREW FOR READING, HELD HERE FOR WRITING. This file never folds
// `envelope.kind`, `envelope.objectId`, or `envelope.uri` into individual
// Nostr tags merely because Nostr tags exist. Exactly one tag is ever
// attached to the event template this file builds — `[tagName,
// discoveryTag]`, `tagName` defaulting to `t`, Nostr's own conventional
// topic tag — and it carries only the free-form discovery tag a caller
// supplies, the identical, unrelated-to-Nostr `discoveryTag` string 0.9.24
// through 0.9.43 already thread through this whole family. That tag
// answers "can a query find this event at all" — a search accelerator,
// nothing more. `content`, once fetched, is the only place this file ever
// writes what the event actually claims. `discoveryTag` is supplied at
// construction, once per instance, rather than per `publish()` call — a
// publisher announcing many envelopes under one running discovery
// campaign names that campaign's own tag once, the same "one relay per
// instance" restraint 0.9.31's own header already holds for `relayUrl`,
// held here for `discoveryTag` too, so `publish(envelope)` stays exactly
// the one-argument shape this milestone's own request named.
//
// `publishImpl` IS ONE INJECTION POINT, NOT TWO — SIGNING AND BROADCAST ARE
// A SINGLE OPAQUE STEP HERE, UNLIKE `application/
// ArweavePublicationMaterialUploader.js`'s OWN `signer`/`fetchImpl` SPLIT.
// Arweave's uploader splits "sign a transaction" from "POST it to a
// gateway" because those are two genuinely separate wire operations against
// two different services. Publishing a Nostr event is, from this file's own
// vantage point, one indivisible exchange: sign the event with a key this
// file never sees, open whatever transport reaches the relay, send it, and
// learn whether the relay accepted it — exactly the single collaborator
// `application/NostrDiscoveryQueryService.js`'s own `queryImpl` already
// models for the read side, held here for the write side. A `publishImpl`
// has exactly this shape:
//
//   (relayUrl, eventTemplate) -> Promise<
//       { published: true, id }
//     | { published: false, reason }
//   >
//
// where `eventTemplate` is the plain `{ kind, tags, content }` object this
// file builds — never an `id`, `pubkey`, `sig`, or `created_at`, all of
// which belong to whatever signs the event, never to this file — and `id`
// is the NIP-01 event id the signing step already deterministically
// computed (a Nostr event's own id is a hash of its signed fields, so it is
// known before, and independent of, whatever a relay does with it —
// exactly the same "id is a property of the signed artifact, not something
// the destination assigns" fact `ArweavePublicationMaterialUploader`'s own
// header already states for a transaction id, held here for an event id).
//
// NO WALLET MANAGEMENT, NO KEY MANAGEMENT, NO NIP-01 SERIALIZATION OR
// SIGNING OF ANY KIND — THE SAME RESTRAINT `anchoring/
// BitcoinAnchorPublisher.js` AND `application/
// ArweavePublicationMaterialUploader.js` ALREADY HOLD FOR THEIR OWN
// SUBSTRATES, HELD HERE FOR NOSTR. This class never generates a keypair,
// never computes an event id, never signs anything, and never opens a
// WebSocket — it treats `publishImpl` as the sole authority for all of
// that, exactly as it treats the `eventTemplate` it hands to `publishImpl`
// as the entire extent of its own opinion about what a Nostr event should
// contain.
//
// ONE RELAY, ONE DISCOVERY TAG, PER INSTANCE — NO FAN-OUT, NO RELAY
// SELECTION. `relayUrl` is supplied at construction, exactly as
// `application/NostrDiscoveryQueryService.js`'s own header already frames
// it for reading; a caller wanting to announce the same envelope on a
// second relay constructs a second instance and calls `publish()` again.
// This class never ranks, prefers, or automatically retries a different
// relay — "let the caller decide which relay is being targeted" is the
// entire extent of this file's own relay policy.
//
// MALFORMED INPUT DEGRADES TO `null` BEFORE `publishImpl` IS EVER
// CONSULTED — THE SAME BOUNDARY `ArweavePublicationMaterialUploader`
// ALREADY DRAWS FOR MALFORMED MATERIAL. An `envelope` that fails
// `describeDecentralizedDiscoveryEnvelope()`'s own validation is resolved
// to `null` immediately; `publishImpl` is never called, and no network
// activity of any kind occurs. This file performs no verification of the
// envelope's TRUTH — only of its SHAPE, via the exact same validator the
// consuming side already runs the identical envelope through; see `core/
// DecentralizedDiscoveryEnvelope.js`'s own header, "a self-declared claim,
// never evidence," which holds here, on the publishing side, precisely
// because this file authenticates nothing about it either.
//
// A RELAY'S OWN DEFINITE DECLINE ALSO DEGRADES TO `null` — COLLAPSED
// TOGETHER WITH MALFORMED INPUT, THE SAME "TWO CAUSES, ONE OUTCOME"
// RESTRAINT `ArweavePublicationMaterialUploader`'S OWN HEADER ALREADY HOLDS
// FOR "A NON-2xx GATEWAY RESPONSE AND AN OVERSIZED RESPONSE BOTH RESOLVE TO
// `null`." A `publishImpl` that resolves with `published: false` (the relay
// was reached and declined the event) is exactly as unpublished, from this
// file's own caller's perspective, as an envelope that never made it to
// `publishImpl` at all — `publish()` returns a simple `success | null`
// result, never a third "declined" status a caller must handle specially.
//
// A GENUINE TRANSPORT/SIGNING FAILURE PROPAGATES, NEVER SWALLOWED INTO
// `null` — THE ONE CASE THIS FILE DOES KEEP DISTINGUISHABLE FROM ORDINARY
// DECLINE, THE IDENTICAL LINE `ArweavePublicationMaterialUploader`'S OWN
// HEADER ALREADY DRAWS FOR ITS OWN `signer`/`fetch`. `publishImpl` itself
// rejecting (no signing key available, no connectivity, a relay that never
// answers before this class's own `timeoutMs` elapses) is not "this
// publish did not succeed," it is "could not find out" — it propagates to
// this class's own caller unchanged, exactly as `ArweavePublicationMaterialUploader`'s
// own header already states for a rejecting `signer` or `fetch`. This is
// where malformed input and a relay/network failure stay distinguishable,
// the one place this file's own architecture — inherited unmodified from
// its two nearest siblings — actually allows it: malformed input and a
// definite decline are both an ordinary, resolved `null`; a genuine failure
// is a rejection a caller must actually catch.
//
// A `publishImpl` THAT RESOLVES BUT VIOLATES ITS OWN CONTRACT THROWS —
// NEVER DEGRADES TO `null`. If `publishImpl` resolves with `published:
// true` but a missing or malformed `id` (failing the NIP-01 64-character
// hex event-id shape), this file throws rather than returning `null` — the
// same "resolved with success but broke its own contract" distinction
// `ArweavePublicationMaterialUploader`'s own header already draws for a
// signer's own `{ id, transaction }` contract, held here for `publishImpl`'s
// own `{ published, id }` contract. `null` is reserved for the RELAY's own
// ordinary, expected failure modes — a malformed `publishImpl` is a bug in
// how this class was wired, not a fact about Nostr.
//
// A SIMPLE PUBLICATION RESULT, NEVER TRUST OR STATUS SEMANTICS. A
// successful `publish()` resolves to exactly `{ published: true, relayUrl,
// id }` — the relay this instance targeted and the event id `publishImpl`
// reported, nothing else. It never carries a `verified`, `trusted`,
// `confidence`, or `status` field of any kind; whether an announced
// envelope's own CLAIM is ever believed remains entirely the consuming
// side's own concern, exactly as `core/DecentralizedDiscoveryEnvelope.js`'s
// own header already draws that line one layer over.
//
// NEVER DISCOVERY, NEVER VERIFICATION, NEVER MATERIAL UPLOAD, NEVER
// SIGNING A PUBLICATION. This file never imports `application/
// NostrDiscoveryQueryService.js`, `application/DecentralizedWorldDiscoveryQuery.js`,
// or any verification file in this family — it only ever writes, never
// reads, a Nostr relay. It never imports `application/
// ArweavePublicationMaterialUploader.js` or performs any upload of its
// own — `materialUri` is 0.9.45's own finished output, arriving here only
// as a field already folded into the `envelope` this file is handed. It
// never imports `publisher/Publication.js`, signs anything belonging to a
// Publication, or reads a Publication's own `signature` field — that
// remains entirely `application/PublicationDistributionDescriptor.js`'s own
// concern (0.9.44), finished before this file is ever called.
//
// SYNCHRONOUS CONSTRUCTION, ASYNCHRONOUS PUBLISH, NO CACHING, NO RETRY, NO
// DEDUPLICATION. Every call to `publish()` builds a fresh event template
// and calls `publishImpl` fresh — a caller publishing the same envelope
// twice gets two independent relay exchanges, potentially two different
// event ids, exactly the "no caching... no fallback" restraint
// `ArweavePublicationMaterialUploader`'s own header already holds for the
// write side of a different substrate.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **A concrete `publishImpl` implementation — real NIP-01 event
//   serialization/id computation, Schnorr signing, key management, or an
//   actual WebSocket connection to a relay.** This file depends only on
//   the `publishImpl(relayUrl, eventTemplate) -> Promise<{ published, id? }
//   >` contract documented above; a concrete implementation is later,
//   unscheduled work, the identical line `application/
//   NostrDiscoveryQueryService.js`'s own header already draws one layer
//   over for its own `queryImpl`.
// - **Publishing to more than one relay, or any relay-selection,
//   preference, or fallback policy.** See "One relay, one discovery tag,
//   per instance," above.
// - **A runtime composition wiring this class together with `application/
//   ArweavePublicationMaterialUploader.js` and `application/
//   PublicationDistributionDescriptor.js` into one usable pipeline.**
//   0.9.47, unscheduled.
// - **Verifying that a published event later confirms on a relay, appears
//   in a relay's own query results, or is ever actually retained.** A
//   successful `publish()` means only "the relay accepted this event" — the
//   identical "broadcast acceptance is not anchor validity" distinction
//   `anchoring/BitcoinAnchorPublisher.js` and `application/
//   ArweavePublicationMaterialUploader.js` already draw for their own
//   substrates.
// - **Any signature, trust, or reputation semantics for an envelope, an
//   event, or a relay.** See "A simple publication result," above.
export class NostrPublicationDiscoveryPublisher {
    // relayUrl: which Nostr relay a published event is sent to — defaults
    //   to a well-known public relay, matching `application/
    //   NostrDiscoveryQueryService.js`'s own default, but any relay
    //   speaking NIP-01 works; see this file's own header, "let the caller
    //   decide which relay is being targeted."
    // tagName: which Nostr tag NAME the discovery tag is attached under —
    //   defaults to `t`, matching `application/NostrDiscoveryQueryService.js`'s
    //   own default filter tag.
    // kind: which Nostr event kind a published event declares — defaults to
    //   `1` (a short text note), matching `application/
    //   NostrDiscoveryQueryService.js`'s own default searched kind.
    // discoveryTag: the free-form tag value attached to every event this
    //   instance publishes — required; see this file's own header, "a
    //   discovery tag, never an envelope field."
    // publishImpl: see this file's own header, "publishImpl is one
    //   injection point." Required — there is no ambient default.
    // timeoutMs: how long to wait for `publishImpl` to settle before
    //   treating it as a genuine failure; see this file's own header, "a
    //   genuine transport/signing failure propagates."
    constructor({
        relayUrl = DEFAULT_RELAY_URL,
        tagName = DEFAULT_TAG_NAME,
        kind = DEFAULT_KIND,
        discoveryTag,
        publishImpl = null,
        timeoutMs = DEFAULT_TIMEOUT_MS
    } = {}) {
        if (typeof relayUrl !== 'string' || relayUrl.trim().length === 0) {
            throw new Error('NostrPublicationDiscoveryPublisher: a non-empty relayUrl is required');
        }
        if (typeof discoveryTag !== 'string' || discoveryTag.length === 0) {
            throw new Error('NostrPublicationDiscoveryPublisher: a non-empty discoveryTag is required');
        }
        if (typeof publishImpl !== 'function') {
            throw new Error('NostrPublicationDiscoveryPublisher: no relay publish implementation available — pass publishImpl explicitly');
        }
        this._relayUrl = relayUrl;
        this._tagName = tagName;
        this._kind = Number.isInteger(kind) ? kind : DEFAULT_KIND;
        this._discoveryTag = discoveryTag;
        this._publishImpl = publishImpl;
        this._timeoutMs = timeoutMs;

        // Bound so `publisher.publish` survives being passed around as a
        // bare function reference — the identical reason `application/
        // ArweavePublicationMaterialUploader.js`'s own `upload` is bound in
        // its own constructor.
        this.publish = this.publish.bind(this);
    }

    get relayUrl() { return this._relayUrl; }
    get discoveryTag() { return this._discoveryTag; }

    // publish(envelope) -> Promise<{ published: true, relayUrl, id } |
    //   null>. See this file's own header for the full contract: `null`
    //   for an `envelope` that fails `describeDecentralizedDiscoveryEnvelope()`'s
    //   own validation, and `null` for a `publishImpl` that resolves with
    //   `published: false` (the relay declined); a genuine `publishImpl`
    //   failure (including this class's own timeout) propagates as a
    //   rejection; a `publishImpl` that resolves with `published: true` but
    //   a missing/malformed `id` throws rather than degrading to `null`.
    async publish(envelope) {
        const described = describeDecentralizedDiscoveryEnvelope(envelope);
        if (described === null) {
            return null;
        }

        const eventTemplate = Object.freeze({
            kind: this._kind,
            tags: [[this._tagName, this._discoveryTag]],
            content: JSON.stringify(described)
        });

        const result = await withTimeout(this._publishImpl(this._relayUrl, eventTemplate), this._timeoutMs);

        if (!result || result.published !== true) {
            return null;
        }
        if (typeof result.id !== 'string' || !EVENT_ID_PATTERN.test(result.id)) {
            throw new Error('NostrPublicationDiscoveryPublisher: publishImpl resolved with no valid event id');
        }

        return Object.freeze({ published: true, relayUrl: this._relayUrl, id: result.id });
    }
}

NostrPublicationDiscoveryPublisher.DEFAULT_RELAY_URL = DEFAULT_RELAY_URL;
NostrPublicationDiscoveryPublisher.DEFAULT_TAG_NAME = DEFAULT_TAG_NAME;
NostrPublicationDiscoveryPublisher.DEFAULT_KIND = DEFAULT_KIND;

// Races `promise` against `timeoutMs`; rejects if the timer fires first —
// a timeout is a genuine failure here, never collapsed to `null`, unlike
// `application/NostrDiscoveryQueryService.js`'s own identically-named
// helper, which collapses every `queryImpl` failure (a timeout included)
// to `[]` because that file's own contract never propagates a rejection at
// all. The timer is always cleared, whichever settles first.
function withTimeout(promise, timeoutMs) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('NostrPublicationDiscoveryPublisher: publishImpl timed out')), timeoutMs);
        Promise.resolve(promise).then(
            (value) => { clearTimeout(timer); resolve(value); },
            (error) => { clearTimeout(timer); reject(error); }
        );
    });
}
