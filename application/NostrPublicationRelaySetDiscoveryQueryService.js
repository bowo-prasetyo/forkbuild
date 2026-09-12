import { DecentralizedDiscoveryQueryService } from './DecentralizedWorldDiscoveryQuery.js';
import { NostrDiscoveryQueryService } from './NostrDiscoveryQueryService.js';

// 0.9.451 — Nostr Publication Relay Set Discovery Alignment.
//
// 0.9.449's own product reassessment found the write-side half of this gap
// (a configured publication relay set that publishing never reached);
// 0.9.450 closed that half. This file closes the other half its own
// Section (read-side discovery) named: `application/NostrDiscoveryQueryService.js`
// (0.9.31) is hard-scoped to "exactly one relay per instance — no fan-out,
// no aggregation" (see that file's own header), so the real Publication
// discovery composition (`application/
// DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js`) has
// only ever queried ONE Nostr relay — the general discovery-relay
// preference (`core/NostrRelayConfiguration.js`) — never the relay SET a
// Wanderer configures for publication distribution
// (`core/NostrPublicationRelaySetConfiguration.js`, 0.9.447). This class is
// the read-side counterpart to `application/
// NostrMultiRelayPublicationDiscoveryPublisher.js` (0.9.444) — the identical
// "one relay, N times, wrapped" composition, one layer over, for discovery
// instead of distribution:
//
//   { relayUrls: [A, B, C], tagName, kinds, queryImpl, timeoutMs, maxResults }
//                    │
//                    ▼
//   application/NostrPublicationRelaySetDiscoveryQueryService.js   ★ (THIS)
//        new NostrPublicationRelaySetDiscoveryQueryService({ ... })
//        │
//        ├──► new NostrDiscoveryQueryService({ relayUrl: A, ... })   (0.9.31, unmodified)
//        ├──► new NostrDiscoveryQueryService({ relayUrl: B, ... })   (0.9.31, unmodified)
//        └──► new NostrDiscoveryQueryService({ relayUrl: C, ... })   (0.9.31, unmodified)
//                    │
//                    ▼   search(discoveryTag) — all three queried concurrently,
//                        independently, regardless of one another's outcome
//                    ▼
//        [ ...A's own candidates, ...B's own candidates, ...C's own candidates ]
//
// A COMPOSITION LAYER AROUND 0.9.31, NEVER A REIMPLEMENTATION OF IT. This
// file contains no NIP-01 filter construction, no envelope parsing, and no
// relay transport of any kind — every one of those stays entirely
// `NostrDiscoveryQueryService`'s own job, called through its existing,
// unmodified `search(discoveryTag)` contract. This file's only job is
// building one such instance per configured relay and calling every one of
// them, exactly the restraint `NostrMultiRelayPublicationDiscoveryPublisher.js`'s
// own header already holds for the write side.
//
// A DROP-IN `DecentralizedDiscoveryQueryService`, NEVER A NEW SHAPE THE
// COMPOSITION ROOT MUST SPECIAL-CASE. This class extends the same base
// class `NostrDiscoveryQueryService` does and exposes the identical
// `{ origin, search(discoveryTag) }` contract — so `application/
// DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js`'s own
// `discoverWorldEncounterPublication()` loop (which iterates
// `Object.keys(services)` and calls `queryDecentralizedWorldDiscoveryIntoRegistry(registry,
// service, discoveryTag)` once per named entry) needs no change at all to
// query a whole relay SET wherever it previously queried one relay. See
// that file's own 0.9.451 amendment for the one call site that constructs
// this class instead of a bare `NostrDiscoveryQueryService`.
//
// ONE COMPOSITE `origin`, NEVER ONE PER UNDERLYING RELAY — DELIBERATE, NOT
// AN OVERSIGHT. `application/DecentralizedWorldDiscoveryQuery.js`'s own
// `queryDecentralizedWorldDiscovery()` stamps every lead a `search()` call
// produces with this service's own single `.origin`, and `application/
// DecentralizedWorldDiscoveryLeadRegistry.js` keys a lead's slot by the
// triple `(origin, discoveryTag, uri)`. Reporting one origin per underlying
// relay would mean the SAME configured publication relay set announcing
// the SAME publication through two of its own relays lands as two
// independent, competing leads — resolving AMBIGUOUS
// (`DecentralizedWorldEncounterLeadResolutionStatus.AMBIGUOUS`) purely
// because a Wanderer configured redundant relays for the identical
// distribution target, never because two genuinely independent discovery
// sources corroborated anything. A Wanderer's configured publication relay
// set is one logical discovery source that happens to be backed by several
// relays — exactly the same "equal, independent fan-out targets, not
// separately-owned sources" framing `core/
// NostrPublicationRelaySetConfiguration.js`'s own header already holds for
// the write side — so this class reports exactly one `origin`, deterministic
// over its own configured relay set, and a publication reachable through
// any subset of that set resolves RESOLVED exactly as it would through a
// single relay. See this file's own header, "identity preservation," for
// why this is a correctness requirement here, never an optimization.
//
// EVERY RELAY IS QUERIED CONCURRENTLY, AND ONE RELAY'S OWN GENUINE FAILURE
// NEVER PREVENTS ANOTHER RELAY'S RESULT — THE IDENTICAL RESTRAINT
// `NostrMultiRelayPublicationDiscoveryPublisher.js`'s OWN HEADER ALREADY
// HOLDS FOR PUBLISH. `search()` uses `Promise.allSettled()`, never
// `Promise.all()`; an underlying `NostrDiscoveryQueryService.search()` call
// that rejects (it never does, per that file's own "never throws" contract,
// but this class never relies on a collaborator's own promise) is treated
// identically to one that resolves `[]` — this class's own `search()` never
// rejects on account of any individual relay.
//
// CANDIDATES ARE CONCATENATED, NEVER DEDUPLICATED, RANKED, OR MERGED BY
// THIS FILE. Two relays reporting the identical `{ uri, storage }` produce
// two entries in this class's own returned array — deliberately left for
// `DecentralizedWorldDiscoveryLeadRegistry`'s own `setLead()` to collapse
// naturally (same `origin`, same `discoveryTag`, same `uri` -> the same
// registry slot, replaced rather than accumulated), exactly the "no
// deduplication... this layer never" restraint every file in this chain
// already holds one layer down. This class adds no `Set`, no dedup key, and
// no ordering guarantee across relays beyond `Promise.allSettled()`'s own
// input order.
//
// `relayUrls` IS VALIDATED AND NORMALIZED HERE, NEVER LEFT TO A CALLER —
// THE IDENTICAL SHAPE `NostrMultiRelayPublicationDiscoveryPublisher.js`'s
// OWN CONSTRUCTOR ALREADY HOLDS. A non-array, empty, or entirely-malformed
// `relayUrls` throws synchronously at construction, before any
// `NostrDiscoveryQueryService` is built; duplicate entries (by trimmed
// string equality) are collapsed to their first occurrence, preserving
// configured order. Per-entry URL SHAPE validation (ws:/wss:) is
// deliberately NOT this file's job — every entry already reaching this
// class was validated once already, at `core/
// NostrPublicationRelaySetConfiguration.js`'s own construction time (or by
// `NostrPublicationRelaySetConfigurationProvider`'s own one-element
// default); a malformed string here is simply handed, unmodified, to
// `NostrDiscoveryQueryService`'s own constructor, which performs no URL
// validation of its own either (see that file's own header — it never
// validates `relayUrl`'s shape).
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Relay health, priority, retry, or per-publication relay selection.**
//   0.9.449's own reassessment explicitly named all four as premature; this
//   class inherits that restraint unchanged. Every configured relay is
//   queried, every time, with no preference given to any one of them.
// - **Reading `core/NostrPublicationRelaySetConfiguration.js`,
//   `storage/NostrPublicationRelaySetConfigurationStore.js`, or
//   `application/NostrPublicationRelaySetConfigurationProvider.js` itself.**
//   This class only ever accepts an already-resolved `relayUrls` array —
//   resolving it from persisted configuration is entirely its caller's own
//   job (`application/DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js`,
//   which itself accepts it as a plain option, and `ui/main.js`, which
//   resolves it once via the existing provider). See that provider's own
//   header, "a plain, synchronous, side-effect-free function of its own
//   argument" — this class never imports it.
// - **Publishing, tagging, or signing anything.** This class only ever
//   reads, exactly like the single-relay `NostrDiscoveryQueryService` it
//   wraps.
// - **A UI of any kind, or any relationship to Snapshot discovery
//   (`application/NostrSnapshotDiscoveryQueryService.js`) or place-naming
//   discovery (`application/NostrPlaceNamingDiscoverySource.js`).** Both
//   remain wired to the general single discovery-relay preference
//   (`core/NostrRelayConfiguration.js`), untouched — this milestone's own
//   scope is Publication discovery only.
export class NostrPublicationRelaySetDiscoveryQueryService extends DecentralizedDiscoveryQueryService {
    // relayUrls: a non-empty array of relay URL strings — see this file's
    //   own header, "relayUrls is validated and normalized here."
    // tagName/kinds/queryImpl/timeoutMs/maxResults: forwarded verbatim,
    //   unread, identically to every constructed `NostrDiscoveryQueryService`
    //   — see that file's own constructor for what each one means and
    //   defaults to.
    constructor({ relayUrls, tagName, kinds, queryImpl, timeoutMs, maxResults } = {}) {
        super();
        if (!Array.isArray(relayUrls) || relayUrls.length === 0) {
            throw new Error('NostrPublicationRelaySetDiscoveryQueryService: a non-empty relayUrls array is required');
        }

        const normalizedRelayUrls = normalizeRelayUrls(relayUrls);
        if (normalizedRelayUrls.length === 0) {
            throw new Error('NostrPublicationRelaySetDiscoveryQueryService: relayUrls must contain at least one non-empty relay URL');
        }

        this._relayUrls = normalizedRelayUrls;
        this._services = normalizedRelayUrls.map((relayUrl) => new NostrDiscoveryQueryService({
            relayUrl,
            tagName,
            kinds,
            queryImpl,
            timeoutMs,
            maxResults
        }));
    }

    get relayUrls() { return [...this._relayUrls]; }

    // See this file's own header, "one composite origin, never one per
    // underlying relay."
    get origin() {
        return `dweb:nostr-publication-relay-set:${this._relayUrls.join(',')}`;
    }

    // Resolves to the concatenation of every configured relay's own
    // `search()` result — see this file's own header, "every relay is
    // queried concurrently" and "candidates are concatenated, never
    // deduplicated." Never throws.
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
}

// De-duplicates `relayUrls` by trimmed string equality, preserving the
// order each distinct value first appears in — the identical normalization
// `NostrMultiRelayPublicationDiscoveryPublisher.js`'s own `normalizeRelayUrls()`
// already performs for the write side. Non-string or empty-after-trim
// entries are dropped silently; a genuinely empty result (every entry
// malformed) is reported by this file's own constructor, above, as "no
// usable relay URL supplied," never here.
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
