import { NostrSnapshotDiscoveryQueryService } from './NostrSnapshotDiscoveryQueryService.js';
import { SnapshotCandidateDiscoveryOutcome } from './SnapshotCandidateDiscoveryOutcome.js';

// Nostr Multi-Relay Snapshot Discovery Query Service.
//
// application/NostrSnapshotDiscoveryQueryService.js is deliberately scoped
// to "exactly one relay per instance — no fan-out, no race, no
// aggregation." This file is the fan-out counterpart, the direct
// structural mirror of application/NostrPublicationRelaySetDiscoveryQueryService.js
// (Publication discovery's own relay-set fan-out), applied to Snapshot's
// own `search(discoveryTag)`/`resolveLocator()`/`searchWithOutcome()`
// contract instead:
//
//   { relayUrls: [A, B, C], tagName, kinds, queryImpl, timeoutMs, maxResults }
//                    │
//                    ▼
//   application/NostrMultiRelaySnapshotDiscoveryQueryService.js   ★ (THIS)
//        new NostrMultiRelaySnapshotDiscoveryQueryService({ ... })
//        │
//        ├──► new NostrSnapshotDiscoveryQueryService({ relayUrl: A, ... })
//        ├──► new NostrSnapshotDiscoveryQueryService({ relayUrl: B, ... })
//        └──► new NostrSnapshotDiscoveryQueryService({ relayUrl: C, ... })
//                    │
//                    ▼   search(discoveryTag) — all three queried
//                        concurrently, independently
//                    ▼
//        [ ...A's own candidates, ...B's own candidates, ...C's own candidates ]
//
// A DROP-IN REPLACEMENT FOR THE SINGLE-RELAY CLASS, NEVER A NEW SHAPE A
// CALLER MUST SPECIAL-CASE. This class exposes the identical
// `{ search(discoveryTag), resolveLocator(discoveryTag, contentHash),
// searchWithOutcome(discoveryTag) }` surface `application/
// DecentralizedSnapshotResolver.js`, `application/
// SnapshotCandidateDiscoveryRuntimeComposition.js`, and `ui/main.js`'s own
// `searchWithOutcome()` call site already consume — swapping which class
// `application/DiscoverSnapshotRuntimeComposition.js` constructs needs no
// change anywhere downstream of it.
//
// EVERY RELAY IS QUERIED CONCURRENTLY, AND ONE RELAY'S OWN GENUINE FAILURE
// NEVER PREVENTS ANOTHER RELAY'S RESULT — the identical restraint
// `NostrPublicationRelaySetDiscoveryQueryService.js`'s own header already
// holds. `search()` uses `Promise.allSettled()`, never `Promise.all()`; a
// relay that rejects (never happens per the wrapped class's own "never
// throws" contract, but this class never relies on that) contributes
// nothing rather than failing the whole call.
//
// CANDIDATES ARE CONCATENATED, NEVER DEDUPLICATED, BY THIS FILE. Two relays
// reporting the identical `{ contentHash, locator, storage }` produce two
// entries in this class's own `search()` result — deduplication (by
// `storage`+`contentHash`+`locator`) is `application/
// SnapshotCandidateDiscoveryQueryService.js`'s own, already-established job
// one layer up, exactly like `NostrPublicationRelaySetDiscoveryQueryService.js`'s
// own header already holds for its own candidates. `resolveLocator()`
// remains a thin convenience over this file's own `search()`, unchanged
// from the single-relay class's own contract.
export class NostrMultiRelaySnapshotDiscoveryQueryService {
    // relayUrls: a non-empty array of relay URL strings. De-duplicated by
    //   trimmed string equality before any collaborator is constructed.
    // tagName/kinds/queryImpl/timeoutMs/maxResults: forwarded verbatim,
    //   unread, identically to every constructed
    //   `NostrSnapshotDiscoveryQueryService`.
    constructor({ relayUrls, tagName, kinds, queryImpl, timeoutMs, maxResults } = {}) {
        if (!Array.isArray(relayUrls) || relayUrls.length === 0) {
            throw new Error('NostrMultiRelaySnapshotDiscoveryQueryService: a non-empty relayUrls array is required');
        }

        const normalizedRelayUrls = normalizeRelayUrls(relayUrls);
        if (normalizedRelayUrls.length === 0) {
            throw new Error('NostrMultiRelaySnapshotDiscoveryQueryService: relayUrls must contain at least one non-empty relay URL');
        }

        this._services = normalizedRelayUrls.map((relayUrl) => new NostrSnapshotDiscoveryQueryService({
            relayUrl,
            tagName,
            kinds,
            queryImpl,
            timeoutMs,
            maxResults
        }));
    }

    get relayUrls() { return this._services.map((service) => service.relayUrl); }

    // Resolves to the concatenation of every configured relay's own
    // `search()` result — never throws. See this file's own header, "every
    // relay is queried concurrently."
    async search(discoveryTag) {
        const settled = await Promise.allSettled(this._services.map((service) => service.search(discoveryTag)));

        const candidates = [];
        for (const outcome of settled) {
            if (outcome.status === 'fulfilled' && Array.isArray(outcome.value)) {
                candidates.push(...outcome.value);
            }
        }
        return candidates;
    }

    // resolveLocator(discoveryTag, contentHash) -> Promise<string|null>. A
    // thin convenience over this file's own `search()`, identical in
    // meaning to the single-relay class's own method — the first candidate
    // across every configured relay whose `contentHash` matches exactly.
    async resolveLocator(discoveryTag, contentHash) {
        const candidates = await this.search(discoveryTag);
        const match = candidates.find((candidate) => candidate.contentHash === contentHash);
        return match ? match.locator : null;
    }

    // searchWithOutcome(discoveryTag) -> Promise<{ outcome, candidates }>.
    // Merges every configured relay's own classification: `FOUND` when at
    // least one well-formed candidate survives across every relay;
    // otherwise `EMPTY` when at least one relay was actually queried
    // successfully; otherwise `UNAVAILABLE` — every relay's own query
    // failed. The identical merge policy `application/
    // SnapshotCandidateDiscoveryQueryService.js`'s own `searchWithOutcome()`
    // already applies one layer up, across SOURCES rather than relays.
    async searchWithOutcome(discoveryTag) {
        const settled = await Promise.allSettled(this._services.map((service) => service.searchWithOutcome(discoveryTag)));

        const candidates = [];
        let anyRelaySucceeded = false;
        for (const outcome of settled) {
            if (outcome.status !== 'fulfilled') continue;
            if (outcome.value.outcome !== SnapshotCandidateDiscoveryOutcome.UNAVAILABLE) {
                anyRelaySucceeded = true;
            }
            if (Array.isArray(outcome.value.candidates)) {
                candidates.push(...outcome.value.candidates);
            }
        }

        const mergedOutcome = candidates.length > 0
            ? SnapshotCandidateDiscoveryOutcome.FOUND
            : (anyRelaySucceeded ? SnapshotCandidateDiscoveryOutcome.EMPTY : SnapshotCandidateDiscoveryOutcome.UNAVAILABLE);

        return { outcome: mergedOutcome, candidates };
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
