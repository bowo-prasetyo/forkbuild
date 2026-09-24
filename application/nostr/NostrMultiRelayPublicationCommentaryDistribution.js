import { PublicationCommentaryNostrDistribution } from '../publication/commentary/PublicationCommentaryNostrDistribution.js';
import { normalizeRelayUrls } from './NostrRelayUrls.js';

// Nostr Multi-Relay Publication Commentary Distribution.
//
// application/publication/commentary/PublicationCommentaryNostrDistribution.js is deliberately
// scoped to "one relay, one discovery tag, per instance — no fan-out, no
// relay selection," naming multi-relay resilience for Commentary a
// NEW_SUBSTRATE_BOUNDARY, deliberately unbuilt at the time. Following the
// decision recorded in core/NostrRelayConfiguration.js's own header (this
// codebase now has exactly ONE Nostr relay set, used for fan-out
// everywhere Nostr is used), this file is that boundary closed: the direct
// structural mirror of application/nostr/NostrMultiRelaySnapshotDiscoveryPublisher.js
// and application/placeNaming/NostrMultiRelayPlaceNamingDiscoverySource.js, applied to
// Commentary's own combined publish/retrieve/discover contract instead:
//
//   { relayUrls: [A, B, C], tagName, kind, discoveryTag, publishImpl, queryImpl, timeoutMs }
//                    │
//                    ▼
//   application/nostr/NostrMultiRelayPublicationCommentaryDistribution.js   ★ (THIS)
//        NostrMultiRelayPublicationCommentaryDistribution's own constructor
//        │
//        ├──► new PublicationCommentaryNostrDistribution({ relayUrl: A, ... })
//        ├──► new PublicationCommentaryNostrDistribution({ relayUrl: B, ... })
//        └──► new PublicationCommentaryNostrDistribution({ relayUrl: C, ... })
//
// A COMPOSITION LAYER AROUND THE SINGLE-RELAY CLASS, NEVER A
// REIMPLEMENTATION OF IT. This file contains no Nostr event construction,
// no envelope parsing, and no relay transport of any kind — every one of
// those stays entirely `PublicationCommentaryNostrDistribution`'s own job,
// called through its existing, unmodified `publish()`/`retrieve()`/
// `discover()` contracts.
//
// publish(envelopeJson) — FAN-OUT ON THE WIRE, "AT LEAST ONE SUCCEEDS" ON
// THE RETURNED PROMISE. Every configured relay is attempted, always,
// concurrently — exactly the invariant every sibling multi-relay class in
// this codebase already holds. Resolves with the first successful relay's
// own result, by `relayUrls`' own configured order; resolves `null` only
// when every relay resolved `null` (every relay declined); rejects only
// when every relay's own call rejected.
//
// discover() — FAN-OUT AND CONCATENATE, NEVER DEDUPLICATED HERE. Every
// configured relay is queried concurrently; every relay's own successfully
// returned envelopes are concatenated, in `relayUrls`' own configured
// order. One relay's own genuine failure never discards another relay's
// own real, independently-obtained envelopes — this method rejects only
// when every configured relay's own `discover()` call rejected.
// Deduplication (by `commentaryId`) remains entirely `application/
// DiscoverPublicationCommentaryFromNostrUseCase.js`'s own job, one layer up
// — the identical restraint `application/
// NostrMultiRelaySnapshotDiscoveryQueryService.js`'s own header already
// holds for candidates one vocabulary over.
//
// retrieve(locator) — "AT LEAST ONE RELAY HOLDS IT" IS THE WHOLE POLICY. A
// locator (a Nostr event id) was originally accepted by SOME subset of the
// configured relays (see publish()'s own "at least one succeeds," above) —
// never necessarily all of them — so retrieve() queries every configured
// relay and resolves the first non-null match, by `relayUrls`' own
// configured order; resolves `null` only when every relay reports no
// matching event; rejects only when every relay's own call rejected.
//
// DELIBERATELY EXCLUDED — NOT THIS FILE'S JOB.
// - **Relay health checking, relay ranking, or any per-relay preference.**
//   Every configured relay is treated identically, on every call.
// - **A new aggregate result shape.** Every method here resolves the
//   IDENTICAL shape its own single-relay counterpart already does —
//   `{ published, locator } | null`, `envelopeJson | null`,
//   `envelopeJson[]` — never an array of per-relay outcomes, since none of
//   this file's own callers (ui/main.js's own `addPublicationCommentaryCommand`/
//   `discoverPublicationCommentaryFromNostrUseCase`) were ever built to
//   consume one.
export class NostrMultiRelayPublicationCommentaryDistribution {
    // relayUrls: a non-empty array of relay URL strings. De-duplicated by
    //   trimmed string equality before any collaborator is constructed —
    //   the identical normalization every sibling multi-relay class in this
    //   codebase already performs.
    // tagName/kind/discoveryTag/publishImpl/queryImpl/timeoutMs: forwarded
    //   verbatim, unread, identically to every constructed
    //   `PublicationCommentaryNostrDistribution` — that class's own
    //   constructor performs all validation of these.
    constructor({ relayUrls, tagName, kind, discoveryTag, publishImpl, queryImpl, timeoutMs } = {}) {
        if (!Array.isArray(relayUrls) || relayUrls.length === 0) {
            throw new Error('NostrMultiRelayPublicationCommentaryDistribution: a non-empty relayUrls array is required');
        }

        const normalizedRelayUrls = normalizeRelayUrls(relayUrls);
        if (normalizedRelayUrls.length === 0) {
            throw new Error('NostrMultiRelayPublicationCommentaryDistribution: relayUrls must contain at least one non-empty relay URL');
        }

        this._distributions = normalizedRelayUrls.map((relayUrl) => new PublicationCommentaryNostrDistribution({
            relayUrl,
            tagName,
            kind,
            discoveryTag,
            publishImpl,
            queryImpl,
            timeoutMs
        }));

        this.publish = this.publish.bind(this);
        this.retrieve = this.retrieve.bind(this);
        this.discover = this.discover.bind(this);
    }

    get relayUrls() { return this._distributions.map((distribution) => distribution.relayUrl); }
    get discoveryTag() { return this._distributions[0].discoveryTag; }

    // publish(envelopeJson) -> Promise<{ published: true, locator } | null>.
    // See this file's own header for the full contract.
    async publish(envelopeJson) {
        const settled = await Promise.allSettled(this._distributions.map((distribution) => distribution.publish(envelopeJson)));

        for (const outcome of settled) {
            if (outcome.status === 'fulfilled' && outcome.value !== null) {
                return outcome.value;
            }
        }

        const anyFulfilled = settled.some((outcome) => outcome.status === 'fulfilled');
        if (anyFulfilled) {
            return null;
        }
        throw settled[0].reason;
    }

    // retrieve(locator) -> Promise<envelopeJson | null>. See this file's
    // own header for the full contract.
    async retrieve(locator) {
        const settled = await Promise.allSettled(this._distributions.map((distribution) => distribution.retrieve(locator)));

        for (const outcome of settled) {
            if (outcome.status === 'fulfilled' && outcome.value !== null) {
                return outcome.value;
            }
        }

        const anyFulfilled = settled.some((outcome) => outcome.status === 'fulfilled');
        if (anyFulfilled) {
            return null;
        }
        throw settled[0].reason;
    }

    // discover() -> Promise<envelopeJson[]>. See this file's own header for
    // the full contract.
    async discover() {
        const settled = await Promise.allSettled(this._distributions.map((distribution) => distribution.discover()));

        const envelopes = [];
        let anyFulfilled = false;
        for (const outcome of settled) {
            if (outcome.status === 'fulfilled') {
                anyFulfilled = true;
                if (Array.isArray(outcome.value)) {
                    envelopes.push(...outcome.value);
                }
            }
        }

        if (!anyFulfilled) {
            throw settled[0].reason;
        }
        return envelopes;
    }
}
