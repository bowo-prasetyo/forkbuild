import { NostrPlaceNamingDiscoverySource } from './NostrPlaceNamingDiscoverySource.js';

// Nostr Multi-Relay Place Naming Discovery Source.
//
// application/NostrPlaceNamingDiscoverySource.js is deliberately scoped to
// "exactly one relay per instance — no fan-out, no race, no aggregation
// across relays," naming exactly this composition — "several instances of
// this same class" — as the future, unscheduled layer that would query more
// than one. This file is that layer: the direct structural mirror of
// application/NostrMultiRelaySnapshotDiscoveryQueryService.js, applied to
// Place Naming's own raw-payload `search(discoveryTag)` contract instead:
//
//   { relayUrls: [A, B, C], tagName, kinds, queryImpl, timeoutMs, maxResults }
//                    │
//                    ▼
//   application/NostrMultiRelayPlaceNamingDiscoverySource.js   ★ (THIS)
//        new NostrMultiRelayPlaceNamingDiscoverySource({ ... })
//        │
//        ├──► new NostrPlaceNamingDiscoverySource({ relayUrl: A, ... })
//        ├──► new NostrPlaceNamingDiscoverySource({ relayUrl: B, ... })
//        └──► new NostrPlaceNamingDiscoverySource({ relayUrl: C, ... })
//                    │
//                    ▼   search(discoveryTag) — all three queried
//                        concurrently, independently
//                    ▼
//        [ ...A's own raw payloads, ...B's own raw payloads, ...C's own raw payloads ]
//
// A DROP-IN `{ search(discoveryTag) }` SOURCE, NEVER A NEW SHAPE A CALLER
// MUST SPECIAL-CASE. `application/PlaceNamingDiscoveryQueryService.js`'s
// own `sources` roster accepts any collaborator exposing `search()` —
// exactly what this class exposes — so a caller (`ui/main.js`) wires this
// class into that roster exactly where it previously wired a single
// `NostrPlaceNamingDiscoverySource` instance, no change required to
// `application/PlaceNamingDiscoveryRuntimeComposition.js` or `application/
// PlaceNamingDiscoveryQueryService.js` itself.
//
// "AT LEAST ONE RELAY SUCCEEDS" IS THE WHOLE POLICY — NEVER A REJECTION
// UNLESS EVERY RELAY REJECTED. The wrapped class's own `search()` rejects
// on any transport/timeout/malformed-result failure (see that file's own
// header, "a relay/transport failure rejects search()") — the honest
// behavior for a single relay with nothing else to fall back on. This
// class instead resolves with the CONCATENATION of every relay that
// genuinely succeeded, in the order `relayUrls` was configured, and rejects
// only when every configured relay's own `search()` call rejected — one
// relay being unreachable never discards another relay's own real,
// independently-obtained payloads.
//
// PAYLOADS ARE CONCATENATED, NEVER DEDUPLICATED, BY THIS FILE. Two relays
// reporting the identical raw payload produce two entries in this class's
// own `search()` result — deduplication (by `claim.id`) is `application/
// PlaceNamingDiscoveryQueryService.js`'s own, already-established job one
// layer up, exactly as it already is for two independent SOURCES.
export class NostrMultiRelayPlaceNamingDiscoverySource {
    // relayUrls: a non-empty array of relay URL strings. De-duplicated by
    //   trimmed string equality before any collaborator is constructed.
    // tagName/kinds/queryImpl/timeoutMs/maxResults: forwarded verbatim,
    //   unread, identically to every constructed
    //   `NostrPlaceNamingDiscoverySource`.
    constructor({ relayUrls, tagName, kinds, queryImpl, timeoutMs, maxResults } = {}) {
        if (!Array.isArray(relayUrls) || relayUrls.length === 0) {
            throw new Error('NostrMultiRelayPlaceNamingDiscoverySource: a non-empty relayUrls array is required');
        }

        const normalizedRelayUrls = normalizeRelayUrls(relayUrls);
        if (normalizedRelayUrls.length === 0) {
            throw new Error('NostrMultiRelayPlaceNamingDiscoverySource: relayUrls must contain at least one non-empty relay URL');
        }

        this._sources = normalizedRelayUrls.map((relayUrl) => new NostrPlaceNamingDiscoverySource({
            relayUrl,
            tagName,
            kinds,
            queryImpl,
            timeoutMs,
            maxResults
        }));
    }

    get relayUrls() { return this._sources.map((source) => source.relayUrl); }

    // search(discoveryTag) -> Promise<Array<rawPayload>>. See this file's
    // own header for the full contract: the concatenation of every
    // configured relay's own successful `search()` result, in configured
    // order; rejects only when EVERY configured relay's own call rejected.
    async search(discoveryTag) {
        const settled = await Promise.allSettled(this._sources.map((source) => source.search(discoveryTag)));

        const payloads = [];
        let anySourceSucceeded = false;
        for (const outcome of settled) {
            if (outcome.status === 'fulfilled' && Array.isArray(outcome.value)) {
                anySourceSucceeded = true;
                payloads.push(...outcome.value);
            }
        }

        if (!anySourceSucceeded) {
            throw settled[0].reason;
        }
        return payloads;
    }
}

// De-duplicates `relayUrls` by trimmed string equality, preserving the
// order each distinct value first appears in.
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
