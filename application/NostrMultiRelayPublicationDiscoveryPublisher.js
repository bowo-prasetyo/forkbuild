import { NostrPublicationDiscoveryPublisher } from './NostrPublicationDiscoveryPublisher.js';

// 0.9.444 — Nostr Multi-Relay Announcement Fan-Out.
//
// `NostrPublicationDiscoveryPublisher.js` (0.9.46) is deliberately scoped to
// "one relay, one discovery tag, per instance — no fan-out, no relay
// selection," and every layer built on top of it since (0.9.47's runtime
// composition, 0.9.49's executor, 0.9.58's orchestrator) inherited that same
// restraint unchanged. 0.9.442's own product reassessment named the real gap
// that leaves: a caller wanting the identical announcement to reach more than
// one relay has no seam except calling the whole distribution chain again,
// per relay, by hand. 0.9.443 then closed the one PREREQUISITE a fan-out
// milestone needed — `PublicationDistributionLifecycleStore.js`'s own
// `recordDiscoveryObservation()` can now key a Nostr observation by its real
// relay origin, so two relays' own facts for the same publication coexist
// rather than colliding. This file is the fan-out itself:
//
//   { relayUrls: [A, B, C], tagName, kind, discoveryTag, publishImpl, timeoutMs }
//                    │
//                    ▼
//   application/NostrMultiRelayPublicationDiscoveryPublisher.js   ★ (THIS)
//        new NostrMultiRelayPublicationDiscoveryPublisher({ ... })
//        │
//        ├──► new NostrPublicationDiscoveryPublisher({ relayUrl: A, ... })   (0.9.46, unmodified)
//        ├──► new NostrPublicationDiscoveryPublisher({ relayUrl: B, ... })   (0.9.46, unmodified)
//        └──► new NostrPublicationDiscoveryPublisher({ relayUrl: C, ... })   (0.9.46, unmodified)
//                    │
//                    ▼   publish(envelope) — all three attempted concurrently,
//                        independently, regardless of one another's outcome
//                    ▼
//        [ { relayUrl: A, published: true, id }
//        , { relayUrl: B, published: false }
//        , { relayUrl: C, published: true, id } ]
//
// A COMPOSITION LAYER AROUND 0.9.46, NEVER A REIMPLEMENTATION OF IT. This
// file contains no Nostr event construction, no envelope validation, no
// signing, and no relay transport of any kind — every one of those stays
// entirely `NostrPublicationDiscoveryPublisher`'s own job, called through its
// existing, unmodified `publish(envelope)` contract. This file's only job is
// building one such instance per configured relay and calling every one of
// them, independently, when `publish()` is called once.
//
// FAN-OUT, NEVER FAILOVER — THE ONE INVARIANT THIS WHOLE MILESTONE EXISTS TO
// PROTECT. Every configured relay is attempted, always, on every `publish()`
// call — never "try A, and only try B if A fails." A relay's own decline or
// genuine failure never causes another relay to be skipped, retried in its
// place, or treated as that relay's replacement; see 0.9.442's own diagram,
// reproduced in this milestone's own request, distinguishing "B is still
// independently attempted" (fan-out, this file) from "B becomes replacement"
// (failover, deliberately not this file). Relay order is configuration data
// only — this file forms no opinion that an earlier relay is preferred or a
// later one a fallback; every relay in `relayUrls` is treated identically.
//
// EVERY RELAY IS ATTEMPTED CONCURRENTLY, AND ONE RELAY'S OWN GENUINE FAILURE
// NEVER PREVENTS ANOTHER RELAY'S RESULT FROM BEING REPORTED. `publish()`
// starts every underlying `NostrPublicationDiscoveryPublisher#publish()` call
// at once and waits for all of them to settle — a relay that resolves
// `null` (0.9.46's own "the relay declined") and a relay whose own call
// REJECTS (0.9.46's own "a genuine transport/signing failure propagates" —
// no connectivity, a timeout, a malformed `publishImpl` contract violation)
// are both reported, for that ONE relay, as `{ relayUrl, published: false }`
// — the rejection's own reason is preserved under `error`, never thrown out
// of this file's own `publish()`, and never allowed to prevent any OTHER
// relay's own outcome from being reported. This is the one place this file's
// own behavior diverges from 0.9.46's own "a genuine failure propagates,
// never swallowed" rule — necessarily so: a `Promise.all()`-shaped fan-out
// where any one rejection discarded every other relay's own real, independently-
// obtained result would silently defeat this entire milestone's own central
// invariant, named in its own request: "the system must preserve the two
// successful distribution facts rather than collapsing the operation into a
// single failure."
//
// NO NEWLY INVENTED AGGREGATE STATUS — THE OTHER INVARIANT THIS WHOLE
// MILESTONE EXISTS TO PROTECT. `publish()` resolves to a plain array, one
// entry per configured (post-normalization — see below) relay, each entry
// naming only what THAT relay itself reported. There is no `PARTIAL_SUCCESS`,
// no `overallStatus`, no count of how many relays succeeded, and no field
// summarizing the array as a whole anywhere in this file. A caller wanting to
// know "did every relay succeed" or "did any relay succeed" computes that
// itself, from the array this file already hands back — this file computes
// no such policy on its own behalf.
//
// DUPLICATE RELAY URLS ARE NORMALIZED BEFORE EXECUTION, NEVER PUBLISHED TO
// TWICE. `relayUrls` is de-duplicated by trimmed string equality before any
// `NostrPublicationDiscoveryPublisher` is constructed — `[A, A, B]` behaves
// identically to `[A, B]`: one publisher for A, one for B, one entry each in
// `publish()`'s own result array. The FIRST occurrence's own position is what
// survives ordering-wise; this is a normalization of configuration data, not
// a policy about which duplicate "wins" — the same relay URL construates the
// same `NostrPublicationDiscoveryPublisher` either way, so there is no
// meaningful difference between occurrences to prefer.
//
// A SINGLE-ELEMENT `relayUrls` IS BYTE-IDENTICAL, PER-RELAY, TO 0.9.46's OWN
// EXISTING SINGLE-RELAY BEHAVIOR — THE BACKWARD-COMPATIBILITY LINE THIS
// MILESTONE'S OWN REQUEST NAMED EXPLICITLY. `new
// NostrMultiRelayPublicationDiscoveryPublisher({ relayUrls: ['wss://one.example'],
// ... })` constructs exactly one internal `NostrPublicationDiscoveryPublisher`,
// with exactly the options a caller supplied, and `publish()` resolves an
// array holding exactly that one relay's own real, unmodified outcome. This
// file changes nothing about what a single relay experiences; it only adds
// the capability to configure more than one.
//
// ORDERING OF `relayUrls` NEVER CHANGES THE RESULTING SET OF FACTS. Because
// every relay is attempted concurrently and independently, permuting
// `relayUrls` (`[A, B, C]` vs `[C, A, B]`) changes only the ARRAY POSITION
// each relay's own outcome appears at in `publish()`'s own result (which
// mirrors `relayUrls`' own configured order, for a caller's own convenience)
// — never which relays were attempted, never any relay's own individual
// outcome. Two callers who configure the same relay set in a different order
// end up with the identical SET of `{ relayUrl, published, id? }` facts.
//
// `discoveryTag`, `tagName`, `kind`, `publishImpl`, AND `timeoutMs` ARE
// SHARED ACROSS EVERY CONSTRUCTED RELAY PUBLISHER — THE SAME "ONE DISCOVERY
// TAG PER INSTANCE" RESTRAINT 0.9.46's OWN HEADER ALREADY HOLDS, HELD HERE
// FOR AN INSTANCE THAT NOW SPANS MULTIPLE RELAYS. This file never invents a
// per-relay `discoveryTag`, `tagName`, or `kind` — a caller announcing the
// same envelope under a different discovery tag on a different relay set
// constructs a second `NostrMultiRelayPublicationDiscoveryPublisher`, exactly
// as a caller wanting a second discovery tag on ONE relay already constructs
// a second `NostrPublicationDiscoveryPublisher` today.
//
// `discoveryProvider` REMAINS `'nostr'`; A RELAY URL NEVER BECOMES ONE — THE
// IDENTITY RULE THIS MILESTONE'S OWN REQUEST NAMED EXPLICITLY, AND 0.9.443's
// OWN. This file exposes no `discoveryProvider` field of any kind and forms
// no opinion about it; a caller (this milestone's own new command-level
// entry point, see `application/PublicationDistributionCommand.js`'s own
// 0.9.444 amendment) is the one that continues to record every relay's own
// observation under the unchanged `discoveryProvider: 'nostr'`, with the
// relay URL carried only as `discoveryOrigin` — exactly the separation 0.9.443
// already established, never widened or narrowed by this file.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Relay health checking, relay ranking, preferred/fallback relay
//   semantics, retry policy, or automatic relay discovery.** See "Fan-out,
//   never failover," above — every relay is attempted exactly once per
//   `publish()` call, with no policy of any kind distinguishing one
//   configured relay from another.
// - **A relay Settings UI, or any relay list configuration surface.** This
//   file accepts `relayUrls` as a plain constructor argument; where that
//   array itself comes from (a hardcoded caller, a future settings surface)
//   is entirely outside this file's own concern.
// - **A generic multi-endpoint or multi-provider fan-out framework.** This
//   file is Nostr announcement-publication fan-out, specifically — it
//   imports nothing Arweave-related, nothing Bitcoin-related, and shares no
//   base class or generic "fan-out executor" with any other substrate.
// - **Any aggregate `PARTIAL_SUCCESS`/`SUCCESS`/`FAILED` status.** See "No
//   newly invented aggregate status," above.
// - **Read-side (discovery-query) relay multiplicity.** This file only
//   fans out ANNOUNCEMENT PUBLICATION; querying multiple relays for
//   discovery leads is a genuinely separate read-side concern this milestone
//   does not touch — see `application/NostrDiscoveryQueryService.js`,
//   untouched, unimported here.
// - **Notification, verification, or synchronization of any kind across
//   relays.** A successful entry in `publish()`'s own result array means only
//   "this relay accepted the event for broadcast" — 0.9.46's own "broadcast
//   acceptance is not confirmation" line, unmodified, held here per relay.
export class NostrMultiRelayPublicationDiscoveryPublisher {
    // relayUrls: a non-empty array of relay URL strings. De-duplicated by
    //   trimmed string equality before any collaborator is constructed — see
    //   this file's own header, "duplicate relay URLs are normalized."
    // tagName/kind/discoveryTag/publishImpl/timeoutMs: forwarded verbatim,
    //   unread, identically to every constructed `NostrPublicationDiscoveryPublisher`
    //   — see this file's own header, "shared across every constructed relay
    //   publisher." `NostrPublicationDiscoveryPublisher`'s own constructor
    //   performs all validation of these; this file duplicates none of it.
    constructor({ relayUrls, tagName, kind, discoveryTag, publishImpl, timeoutMs } = {}) {
        if (!Array.isArray(relayUrls) || relayUrls.length === 0) {
            throw new Error('NostrMultiRelayPublicationDiscoveryPublisher: a non-empty relayUrls array is required');
        }

        const normalizedRelayUrls = normalizeRelayUrls(relayUrls);
        if (normalizedRelayUrls.length === 0) {
            throw new Error('NostrMultiRelayPublicationDiscoveryPublisher: relayUrls must contain at least one non-empty relay URL');
        }

        this._discoveryTag = discoveryTag;
        this._publishers = normalizedRelayUrls.map((relayUrl) => new NostrPublicationDiscoveryPublisher({
            relayUrl,
            tagName,
            kind,
            discoveryTag,
            publishImpl,
            timeoutMs
        }));

        // Bound so `publisher.publish` survives being passed around as a
        // bare function reference — the identical reason 0.9.46's own
        // `publish` is bound in its own constructor.
        this.publish = this.publish.bind(this);
    }

    get relayUrls() { return this._publishers.map((publisher) => publisher.relayUrl); }
    get discoveryTag() { return this._discoveryTag; }

    // publish(envelope) -> Promise<Array<{ relayUrl, published: true, id } |
    //   { relayUrl, published: false, error? }>>. One entry per normalized
    //   relay, in `relayUrls`' own order — see this file's own header, "every
    //   relay is attempted concurrently." Never rejects on account of any
    //   individual relay's own outcome — including a rejecting `publishImpl`
    //   — because doing so would discard every OTHER relay's own real result;
    //   see "every relay is attempted concurrently, and one relay's own
    //   genuine failure never prevents another relay's result," above. This
    //   method itself never resolves `null` and never throws for a
    //   structurally valid `envelope` — a malformed envelope is instead
    //   reported per relay, exactly as 0.9.46's own `publish()` already
    //   reports it for one relay, since every underlying publisher receives
    //   the identical `envelope` and validates it identically, independently.
    async publish(envelope) {
        const settled = await Promise.allSettled(this._publishers.map((publisher) => publisher.publish(envelope)));

        return settled.map((outcome, index) => {
            const relayUrl = this._publishers[index].relayUrl;
            if (outcome.status === 'fulfilled' && outcome.value !== null) {
                return Object.freeze({ relayUrl, published: true, id: outcome.value.id });
            }
            if (outcome.status === 'fulfilled') {
                return Object.freeze({ relayUrl, published: false });
            }
            return Object.freeze({ relayUrl, published: false, error: outcome.reason });
        });
    }
}

// De-duplicates `relayUrls` by trimmed string equality, preserving the order
// each distinct value first appears in — see this file's own header,
// "duplicate relay URLs are normalized before execution." Non-string or
// empty-after-trim entries are dropped silently, the same "malformed input
// degrades silently" discipline `NostrPublicationDiscoveryPublisher`'s own
// constructor holds for a single `relayUrl` — a genuinely empty result (every
// entry malformed) is reported by this file's own caller, the constructor
// above, as "no usable relay URL supplied," never here.
function normalizeRelayUrls(relayUrls) {
    const seen = new Set();
    const normalized = [];
    for (const relayUrl of relayUrls) {
        if (typeof relayUrl !== 'string') continue;
        const trimmed = relayUrl.trim();
        if (trimmed.length === 0 || seen.has(trimmed)) continue;
        seen.add(trimmed);
        normalized.push(trimmed);
    }
    return normalized;
}
