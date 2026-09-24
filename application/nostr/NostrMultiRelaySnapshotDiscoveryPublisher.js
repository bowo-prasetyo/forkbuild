import { NostrSnapshotDiscoveryPublisher } from './NostrSnapshotDiscoveryPublisher.js';

// Nostr Multi-Relay Snapshot Discovery Publisher.
//
// application/nostr/NostrSnapshotDiscoveryPublisher.js is deliberately scoped to
// "one relay, one discovery tag, per instance — no fan-out, no relay
// selection." This file is the fan-out counterpart, the direct structural
// mirror of application/nostr/NostrMultiRelayPublicationDiscoveryPublisher.js
// (Publication distribution's own relay fan-out), applied to a Snapshot's
// own `{ contentHash, locator, storage }` announcement instead of a signed
// Publication's discovery envelope:
//
//   { relayUrls: [A, B, C], tagName, kind, discoveryTag, publishImpl, timeoutMs }
//                    │
//                    ▼
//   application/nostr/NostrMultiRelaySnapshotDiscoveryPublisher.js   ★ (THIS)
//        new NostrMultiRelaySnapshotDiscoveryPublisher({ ... })
//        │
//        ├──► new NostrSnapshotDiscoveryPublisher({ relayUrl: A, ... })
//        ├──► new NostrSnapshotDiscoveryPublisher({ relayUrl: B, ... })
//        └──► new NostrSnapshotDiscoveryPublisher({ relayUrl: C, ... })
//                    │
//                    ▼   publish(candidate) — all three attempted
//                        concurrently, independently of one another's outcome
//                    ▼
//        { published: true, relayUrl, id } | null   (the first relay to
//        succeed, by configured order — see "a single representative
//        result," below) — every relay was still genuinely attempted.
//
// FAN-OUT, NEVER FAILOVER, ON THE WIRE — A SINGLE REPRESENTATIVE RESULT ON
// THE RETURNED PROMISE. Every configured relay is attempted, always, on
// every `publish()` call — never "try A, and only try B if A fails" — the
// identical invariant `NostrMultiRelayPublicationDiscoveryPublisher.js`'s
// own header already holds. But unlike that file (which returns one array
// entry per relay), this class's own `publish()` resolves a SINGLE
// `{ published: true, relayUrl, id } | null` value, byte-shaped exactly
// like the single-relay `NostrSnapshotDiscoveryPublisher#publish()` it
// wraps — a drop-in replacement at every existing call site
// (`application/snapshot/SnapshotDistributionCommand.js`, `ui/views/WorldView.js`'s
// own remote-pinning announcement path) that expects one announcement
// object back, never an array. Resilience and reach both still accrue on
// the wire — every relay independently receives the announcement — this
// file only chooses not to invent a second result shape those callers were
// never built to consume; see `get relayUrls()`, below, for a caller that
// wants to see every relay's own configured target.
//
// A single-element `relayUrls` is byte-identical, per-relay, to the
// wrapped `NostrSnapshotDiscoveryPublisher#publish()`'s own existing
// single-relay behavior.
//
// "AT LEAST ONE SUCCEEDS" IS THE WHOLE POLICY — NO PARTIAL-SUCCESS STATUS.
// `publish()` resolves with the first successful relay's own result, by
// `relayUrls`' own configured order (never a "fastest wins" race — every
// relay's own outcome is awaited before this method decides); resolves
// `null` only when every relay resolved `null` (every relay declined, or
// the candidate failed validation identically at every relay); and rejects
// only when every relay's own call rejected (a genuine transport/signing
// failure at every one of them) — the first relay's own rejection reason is
// what a caller sees, mirroring the single-relay contract's own "a genuine
// failure propagates" rule for the case where there is truly nothing left
// to report success from.
export class NostrMultiRelaySnapshotDiscoveryPublisher {
    // relayUrls: a non-empty array of relay URL strings. De-duplicated by
    //   trimmed string equality before any collaborator is constructed —
    //   the identical normalization
    //   `NostrMultiRelayPublicationDiscoveryPublisher.js`'s own constructor
    //   already performs.
    // tagName/kind/discoveryTag/publishImpl/timeoutMs: forwarded verbatim,
    //   unread, identically to every constructed
    //   `NostrSnapshotDiscoveryPublisher` — that class's own constructor
    //   performs all validation of these; this file duplicates none of it.
    constructor({ relayUrls, tagName, kind, discoveryTag, publishImpl, timeoutMs } = {}) {
        if (!Array.isArray(relayUrls) || relayUrls.length === 0) {
            throw new Error('NostrMultiRelaySnapshotDiscoveryPublisher: a non-empty relayUrls array is required');
        }

        const normalizedRelayUrls = normalizeRelayUrls(relayUrls);
        if (normalizedRelayUrls.length === 0) {
            throw new Error('NostrMultiRelaySnapshotDiscoveryPublisher: relayUrls must contain at least one non-empty relay URL');
        }

        this._publishers = normalizedRelayUrls.map((relayUrl) => new NostrSnapshotDiscoveryPublisher({
            relayUrl,
            tagName,
            kind,
            discoveryTag,
            publishImpl,
            timeoutMs
        }));

        // Bound so `publisher.publish` survives being passed around as a
        // bare function reference — the identical reason every sibling in
        // this family already binds its own equivalent method.
        this.publish = this.publish.bind(this);
    }

    get relayUrls() { return this._publishers.map((publisher) => publisher.relayUrl); }
    get discoveryTag() { return this._publishers[0].discoveryTag; }

    // publish({ contentHash, locator, storage, publicationId, claimedPosition }) ->
    //   Promise<{ published: true, relayUrl, id } | null>. See this file's
    //   own header for the full contract. Every configured relay is
    //   attempted concurrently and independently; this method never rejects
    //   on account of any INDIVIDUAL relay's own outcome — only when every
    //   relay's own call rejected.
    async publish(candidate) {
        const settled = await Promise.allSettled(this._publishers.map((publisher) => publisher.publish(candidate)));

        for (let index = 0; index < settled.length; index += 1) {
            const outcome = settled[index];
            if (outcome.status === 'fulfilled' && outcome.value !== null) {
                return outcome.value;
            }
        }

        // No relay produced a successful result. If at least one relay's
        // own call genuinely completed (resolved `null` — a decline or a
        // malformed candidate, identical at every relay), report that —
        // never a rejection for an outcome every relay already reported
        // honestly. Only reject when every relay's own call itself
        // rejected.
        const anyFulfilled = settled.some((outcome) => outcome.status === 'fulfilled');
        if (anyFulfilled) {
            return null;
        }

        throw settled[0].reason;
    }
}

// De-duplicates `relayUrls` by trimmed string equality, preserving the
// order each distinct value first appears in — the identical normalization
// `NostrMultiRelayPublicationDiscoveryPublisher.js`'s own
// `normalizeRelayUrls()` already performs.
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
