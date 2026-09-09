import { buildPlaceNamingDiscoveryEnvelope, derivePlaceNamingDiscoveryTag } from '../core/PlaceNamingDiscoveryEnvelope.js';

const DEFAULT_RELAY_URL = 'wss://relay.damus.io';
const DEFAULT_TAG_NAME = 't';
const DEFAULT_KIND = 1;
const DEFAULT_TIMEOUT_MS = 8000;
const EVENT_ID_PATTERN = /^[0-9a-f]{64}$/i;

// 0.9.316 — Place Naming Claim Publication Boundary.
//
// 0.9.315 (Place Naming Distribution Gap Audit) demonstrated, live, a
// concrete two-device workflow this product could not complete: a
// PlaceNamingClaim published locally on one device never becomes
// discoverable to a second device through this codebase's own existing
// decentralized discovery path (`application/NostrPlaceNamingDiscoverySource.js`,
// 0.9.254), because nothing in this domain has ever written to a relay.
// That same audit's Section H already named the exact shape a write-side
// counterpart would take — mirror `application/
// NostrSnapshotDiscoveryPublisher.js` (0.9.133), the sibling domain's own
// already-proven publisher — and its Sections D/I confirmed the wire
// format and acknowledgement semantics both already exist, needing no
// invention. This file is that mirrored counterpart, built for Place
// Naming's own claim/envelope vocabulary instead of Snapshot's
// contentHash/locator/storage vocabulary.
//
//   PlaceNamingClaim (core/PlaceNamingClaim.js, 0.5.2, already signed,
//   already locally saved by application/PlaceNamingClaimUseCase.js#publish() —
//   UNMODIFIED by this milestone; see "never a second producer," below)
//                    │
//                    │   claim (an existing, already-signed instance)
//                    ▼
//   application/NostrPlaceNamingDiscoveryPublisher.js   ★ (THIS)
//        NostrPlaceNamingDiscoveryPublisher#publish(claim)
//        │
//        │   buildPlaceNamingDiscoveryEnvelope(claim)   (core/
//        │   PlaceNamingDiscoveryEnvelope.js, 0.9.253, unmodified)
//        │   derivePlaceNamingDiscoveryTag(claim.worldId, claim.regionId)
//        │   { kind, tags: [[tagName, discoveryTag]],
//        │     content: JSON.stringify(envelope) }
//        ▼
//   injected publishImpl(relayUrl, eventTemplate)   (signing + broadcast —
//        never performed by this file itself; see "no wallet management,"
//        below)
//        │
//        ▼
//   { published: true, relayUrl, id, discoveryTag } | null
//
// DISTRIBUTES AN EXISTING CLAIM; NEVER A SECOND KIND OF NAMING CLAIM. This
// class takes an already-created, already-signed `PlaceNamingClaim` — the
// exact same instance `PlaceNamingClaimUseCase#publish()` already
// produced and already saved to local storage — and does nothing to it
// beyond describing it onto the wire. It never constructs a
// `PlaceNamingClaim`, never signs one, never mutates one, and never saves
// one to `application/LocalPlaceNamingClaimStore.js`. Grep confirms: the
// only production site anywhere in this codebase that ever calls `new
// PlaceNamingClaim(` remains `application/PlaceNamingClaimUseCase.js`
// (0.9.315 Section B3, unchanged) — this file is not a second one.
//
// THE DISCOVERY TAG IS DERIVED FROM THE CLAIM ITSELF, NEVER SUPPLIED BY A
// CALLER — THE ONE DELIBERATE DEPARTURE FROM `NostrSnapshotDiscoveryPublisher`'S
// OWN CONSTRUCTOR SHAPE, AND WHY. That file takes `discoveryTag` as a
// constructor option because a `ContentReference`'s own `contentHash` has
// no codebase-wide, canonical function deriving a routing tag from it
// (each Snapshot Placement caller is free to choose its own tagging
// scheme). A `PlaceNamingClaim` is different: `core/
// PlaceNamingDiscoveryEnvelope.js#derivePlaceNamingDiscoveryTag()` (0.9.253)
// already exists as the ONE canonical function every source and a future
// publisher must both agree on, taking exactly `worldId`/`regionId` — both
// of which a claim always already carries. Accepting a separately-supplied
// `discoveryTag` from a caller here would only invite the exact mismatch
// `core/PlaceNamingDiscoveryEnvelope.js`'s own header already refuses at
// the envelope level ("an envelope claiming to be about one region while
// embedding a claim about another") one layer earlier, for no benefit —
// there is never a legitimate reason for a claim to publish under any tag
// other than the one its own `worldId`/`regionId` already determines. So
// `publish(claim)` derives the tag itself, every time, from the claim it
// was actually handed; a caller supplies no tag at all.
//
// REUSES THE EXISTING INJECTED-PUBLISHER CONTRACT, NEVER A SECOND NIP-07
// ADAPTER. `publishImpl` here is the identical
// `(relayUrl, eventTemplate) -> Promise<{ published, id? }>` shape
// `application/NostrSnapshotDiscoveryPublisher.js`'s own `publishImpl`
// already requires, and `nostr/NostrInjectedProviderPublisher.js`'s own
// `createNostrInjectedProviderPublisher()` already produces exactly that
// shape from a real, browser-injected NIP-07 extension. This file never
// imports that adapter, never opens a WebSocket, and never signs anything
// — a caller wires a concrete `publishImpl` in from outside, the
// identical restraint every writer in this whole Nostr-facing family
// already holds.
//
// `buildPlaceNamingDiscoveryEnvelope(claim)` THROWS FOR A MALFORMED
// CANDIDATE, IT NEVER DEGRADES TO `null` — A DELIBERATE DEPARTURE FROM
// `NostrSnapshotDiscoveryPublisher#publish()`'S OWN "MALFORMED INPUT
// DEGRADES TO NULL" CONTRACT, AND WHY. That file validates three raw,
// untrusted fields (`contentHash`/`locator`/`storage`) that a caller could
// plausibly assemble incorrectly from external data — a real, expected
// runtime outcome worth reporting as "nothing was published," not an
// exception. This file's own `claim` argument is never raw external data:
// it is always an already-signed `PlaceNamingClaim` instance, produced
// exclusively by `PlaceNamingClaimUseCase#publish()` (see "never a second
// producer," above), and `buildPlaceNamingDiscoveryEnvelope()` (0.9.253)
// already established the "a caller handing this an unsigned or
// non-instance value gets a synchronous throw, never a silently
// unpublishable envelope" discipline for exactly this reason — publishing
// a claim no receiver's own parser could ever accept back is a
// caller-side programming mistake to fail loudly on, the identical
// posture `application/PlaceNamingClaimPublication.js#buildPlaceNamingClaimPublication()`
// already holds for the file-exchange transport, one wire shape over.
// This file adds no validation of its own beyond delegating to that
// existing, already-proven function.
//
// A RELAY'S OWN DEFINITE DECLINE DEGRADES TO `null`; A GENUINE
// TRANSPORT/SIGNING FAILURE PROPAGATES; A `publishImpl` THAT RESOLVES
// `published: true` BUT WITH NO VALID EVENT ID THROWS — the identical
// three-way contract `application/NostrSnapshotDiscoveryPublisher.js`'s
// own header already documents in full for the transport-level outcomes,
// held here unchanged. See `tests/PlaceNamingClaimPublication.test.js`
// Section G — a relay failure is surfaced (a rejection, or a `null`
// distinct from a successful result), never silently reported back as a
// successful publication.
//
// A SIMPLE PUBLICATION RESULT, NEVER TRUST, VERIFICATION, OR DELIVERY
// SEMANTICS. A successful `publish()` means only "the relay accepted this
// event" — never that any other device has actually discovered the
// claim, never that the claim's signature has been checked by anyone,
// and never that the claim is now somehow more authoritative than it was
// before. See `core/PlaceNamingDiscoveryEnvelope.js`'s own header, "a
// self-declared claim, never evidence, never verification." There is no
// PENDING/RETRYING/PUBLISHED/CONFIRMED/DISTRIBUTED lifecycle anywhere in
// this file, and none is introduced by it — a claim is either handed to
// `publishImpl` and acknowledged (or not), full stop; whether it is later
// actually discovered is `application/PlaceNamingDiscoveryQueryService.js`'s
// own, entirely separate, already-existing question.
//
// LOCAL PERSISTENCE INDEPENDENCE. This file never imports `application/
// LocalPlaceNamingClaimStore.js` and never saves, re-saves, or reads
// anything from it. `PlaceNamingClaimUseCase#publish()` remains the sole
// owner of local persistence, entirely unchanged and entirely unaware
// this file exists; publishing to Nostr through this class requires no
// change to, and has no dependency on, how or whether a claim was ever
// stored locally.
//
// NO DISCOVERY-SIDE COUPLING. This file never imports `application/
// NostrPlaceNamingDiscoverySource.js`, `application/
// PlaceNamingDiscoveryQueryService.js`, or `application/
// DiscoverPlaceNamingClaimsCommand.js` — publishing and discovering share
// only the passive wire contract `core/PlaceNamingDiscoveryEnvelope.js`
// already named, never a code dependency in either direction. See
// `tests/PlaceNamingClaimPublication.test.js` Section H for the live
// structural proof.
//
// NO OTHER SUBSTRATE. This file knows nothing about Arweave, IPFS,
// Bitcoin, or Base, and introduces no relay-selection, relay-ranking, or
// provider-preference concept of any kind — exactly one relay, one
// discovery tag (derived, never chosen), per `publish()` call.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **A concrete `publishImpl` implementation.** See "reuses the existing
//   injected-publisher contract," above.
// - **Publishing to more than one relay, or any relay-selection,
//   preference, or fallback policy.**
// - **Automatic publication of every locally-created claim.** A caller —
//   unbuilt this milestone — decides WHEN a claim is intentionally
//   published to the network; this class never decides that on its own,
//   and is never called by `PlaceNamingClaimUseCase#publish()` itself.
// - **Retry queues, publication lifecycle states, or relay
//   health/ranking of any kind.** See "a simple publication result,"
//   above.
// - **Verifying that a published event later confirms on a relay, that it
//   was actually discovered by anyone, or unpublish/retraction of an
//   already-published event.** A successful `publish()` means only "the
//   relay accepted this event."
// - **Wiring this class into `ui/main.js`,
//   `application/PlaceNamingDiscoveryRuntimeComposition.js`'s `sources`
//   roster (a read-side roster this is not a member of), or any UI
//   surface.** A caller composes this class with a real `publishImpl`
//   entirely on its own, later, terms — this file does not import any of
//   those, and never constructs itself.
export class NostrPlaceNamingDiscoveryPublisher {
    // relayUrl: which Nostr relay a published event is sent to.
    // tagName: which Nostr tag NAME the discovery tag is attached under —
    //   defaults to `t`, matching every sibling in this family.
    // kind: which Nostr event kind a published event declares — defaults
    //   to `1` (a short text note).
    // publishImpl: see this file's own header, "reuses the existing
    //   injected-publisher contract." Required — there is no ambient
    //   default.
    // timeoutMs: how long to wait for `publishImpl` to settle before
    //   treating it as a genuine failure.
    constructor({
        relayUrl = DEFAULT_RELAY_URL,
        tagName = DEFAULT_TAG_NAME,
        kind = DEFAULT_KIND,
        publishImpl = null,
        timeoutMs = DEFAULT_TIMEOUT_MS
    } = {}) {
        if (typeof relayUrl !== 'string' || relayUrl.trim().length === 0) {
            throw new Error('NostrPlaceNamingDiscoveryPublisher: a non-empty relayUrl is required');
        }
        if (typeof publishImpl !== 'function') {
            throw new Error('NostrPlaceNamingDiscoveryPublisher: no relay publish implementation available — pass publishImpl explicitly');
        }
        this._relayUrl = relayUrl;
        this._tagName = tagName;
        this._kind = Number.isInteger(kind) ? kind : DEFAULT_KIND;
        this._publishImpl = publishImpl;
        this._timeoutMs = timeoutMs;

        // Bound so `publisher.publish` survives being passed around as a
        // bare function reference — the identical reason every sibling in
        // this family already binds its own equivalent method.
        this.publish = this.publish.bind(this);
    }

    get relayUrl() { return this._relayUrl; }

    // publish(claim) -> Promise<{ published: true, relayUrl, id,
    //   discoveryTag } | null>. See this file's own header for the full
    //   contract. Throws synchronously — via `buildPlaceNamingDiscoveryEnvelope()`
    //   — for a missing/non-`PlaceNamingClaim` or unsigned `claim`; a
    //   `publishImpl` reporting a definite decline (`published: false`, or
    //   a falsy result) resolves to `null`; a genuine `publishImpl`
    //   failure (including this class's own timeout) propagates as a
    //   rejection; a `publishImpl` that resolves `published: true` but
    //   with a missing/malformed event id throws rather than degrading to
    //   `null`.
    async publish(claim) {
        const envelope = buildPlaceNamingDiscoveryEnvelope(claim);
        const discoveryTag = derivePlaceNamingDiscoveryTag(claim.worldId, claim.regionId);

        const eventTemplate = Object.freeze({
            kind: this._kind,
            tags: [[this._tagName, discoveryTag]],
            content: JSON.stringify(envelope)
        });

        const result = await withTimeout(this._publishImpl(this._relayUrl, eventTemplate), this._timeoutMs);

        if (!result || result.published !== true) {
            return null;
        }
        if (typeof result.id !== 'string' || !EVENT_ID_PATTERN.test(result.id)) {
            throw new Error('NostrPlaceNamingDiscoveryPublisher: publishImpl resolved with no valid event id');
        }

        return Object.freeze({ published: true, relayUrl: this._relayUrl, id: result.id, discoveryTag });
    }
}

NostrPlaceNamingDiscoveryPublisher.DEFAULT_RELAY_URL = DEFAULT_RELAY_URL;
NostrPlaceNamingDiscoveryPublisher.DEFAULT_TAG_NAME = DEFAULT_TAG_NAME;
NostrPlaceNamingDiscoveryPublisher.DEFAULT_KIND = DEFAULT_KIND;

// Races `promise` against `timeoutMs`; rejects if the timer fires first —
// a timeout is a genuine failure here, never collapsed to `null`. The
// timer is always cleared, whichever settles first. Mirrors application/
// NostrSnapshotDiscoveryPublisher.js's own identically-named helper,
// deliberately not imported from it — the same "kept deliberately
// separate rather than cross-imported" restraint every small private
// helper in this family already holds for itself.
function withTimeout(promise, timeoutMs) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('NostrPlaceNamingDiscoveryPublisher: publishImpl timed out')), timeoutMs);
        Promise.resolve(promise).then(
            (value) => { clearTimeout(timer); resolve(value); },
            (error) => { clearTimeout(timer); reject(error); }
        );
    });
}
