import { ContentStore } from './ContentStore.js';
import { ArweaveContentStore } from './ArweaveContentStore.js';
import { ContentUnavailableError } from './IpfsContentStore.js';

// 0.9.440 — Arweave Gateway Read Failover.
//
// 0.9.439's own audit classified Arweave gateway read/retrieval as this
// codebase's one MINIMAL_FAILOVER_SEAM: content-addressed, byte-identical
// from any gateway that serves it, so trying a second configured gateway
// after the first is unreachable has zero fan-out downside. content/
// ArweaveContentStore.js's own header already named exactly this seam and
// exactly how a caller should use it: "NO CACHING, NO RETRY, NO FALLBACK
// BETWEEN GATEWAYS... A caller wanting a second gateway tried on failure
// constructs and calls a second instance of this class explicitly; this
// file never does that on a caller's behalf." This file is that caller —
// a thin ContentStore that wraps one ArweaveContentStore PER configured
// gateway and tries them in order, never modifying ArweaveContentStore
// itself.
//
//   { signer, gatewayUrls: [A, B, C], ... }
//        │
//        ▼
//   content/ArweaveGatewayFailoverContentStore.js   ★ (THIS)
//        one `new ArweaveContentStore({ signer, gatewayUrl, ... })` per
//        configured gateway, constructed once, up front
//        │
//        ├─ get(reference) / has(reference) — try gateway A's store; a
//        │    ContentUnavailableError tries gateway B next, then C; the
//        │    first SUCCESS returns immediately, the rest are never
//        │    contacted; every gateway failing throws the LAST gateway's
//        │    own ContentUnavailableError, unchanged
//        │
//        └─ put(bytes) — targets ONLY the first configured gateway, never
//             fails over and never fans out; see this file's own header,
//             "write stays single-gateway," below
//
// READ FAILOVER ONLY — WRITE STAYS SINGLE-GATEWAY, UNCHANGED. `put()`
// delegates to exactly one underlying ArweaveContentStore, the one built
// from `gatewayUrls[0]` — the identical single-gateway write behavior this
// codebase already has today. This class adds no upload resilience, no
// multi-gateway POST, and no change to what a Snapshot's own placement
// means; see docs/Roadmap.md's own 0.9.440 header, "read failover only."
//
// EACH UNDERLYING GATEWAY IS A REAL, UNMODIFIED ArweaveContentStore —
// NEVER A REIMPLEMENTATION OF ITS WIRE BEHAVIOR. This class contains no
// `fetch()` call, no transaction-id parsing, and no response-size
// enforcement of its own; every one of those stays exactly where content/
// ArweaveContentStore.js already owns it, called through unmodified.
//
// A NON-ar:// REFERENCE NEVER CONTACTS ANY GATEWAY. `_transactionIdFromReference()`
// on every underlying store returns `null` before any network call for a
// reference that doesn't even carry an `ar://` uri — so `get()` returns
// `null` off the FIRST store without ever trying a second or third; every
// gateway would agree identically, and this class never wastes a network
// request confirming that.
//
// AN UNEXPECTED ERROR SHAPE NEVER GETS SWALLOWED INTO "TRY THE NEXT
// GATEWAY." Only a `ContentUnavailableError` — content/ArweaveContentStore.js's
// own network-shaped-failure contract — advances to the next configured
// gateway. Anything else (a bug in how this class or an underlying store
// was constructed) propagates immediately, exactly as it would from a
// single ArweaveContentStore.
//
// NO CACHING, NO HEALTH CHECK, NO REORDERING. Gateways are always tried in
// the exact order they were configured, every call, fresh — the
// configured order IS the entire policy; see core/
// ArweaveGatewayConfiguration.js's own header, "ordering IS the priority."
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Fan-out.** A successful read from one gateway terminates the
//   operation; the remaining configured gateways are never queried merely
//   for redundancy — the opposite of application/
//   NostrPublicationDiscoveryPublisher.js's own natural multi-relay shape.
// - **Any change to `content/ArweaveContentStore.js` itself.** This class
//   only ever constructs and calls it, exactly as any other caller would.
// - **Retry/backoff, timeouts beyond what each wrapped instance already
//   enforces, or persistent failure scoring across calls.**
export class ArweaveGatewayFailoverContentStore extends ContentStore {
    // gatewayUrls: a non-empty array of gateway URLs, in the order they
    //   should be tried — see core/ArweaveGatewayConfiguration.js's own
    //   `.gatewayUrls`, this same milestone, for where a caller usually
    //   gets this from.
    // signer / fetchImpl / timeoutMs / maxResponseBytes: forwarded
    //   verbatim to every underlying `ArweaveContentStore` — see that
    //   file's own constructor for their meaning.
    constructor({ gatewayUrls, signer, fetchImpl = null, timeoutMs, maxResponseBytes } = {}) {
        super();
        if (!Array.isArray(gatewayUrls) || gatewayUrls.length === 0) {
            throw new Error('ArweaveGatewayFailoverContentStore: a non-empty gatewayUrls array is required');
        }
        this._stores = gatewayUrls.map((gatewayUrl) => new ArweaveContentStore({
            signer, gatewayUrl, fetchImpl, timeoutMs, maxResponseBytes
        }));
    }

    // The full ordered list of gateway urls this instance was built from —
    // read-only, mirrors each wrapped store's own `gatewayUrl`.
    get gatewayUrls() { return this._stores.map((store) => store.gatewayUrl); }

    get storage() { return 'ar'; }

    // put(bytes) -> Promise<ContentReference>. Targets ONLY the first
    // configured gateway — see this file's own header, "write stays
    // single-gateway."
    async put(bytes) {
        return this._stores[0].put(bytes);
    }

    // get(reference) -> Promise<string|null>. Tries each configured
    // gateway's own store in order; the first to resolve (including with
    // `null`, for a non-ar:// reference — see this file's own header)
    // returns immediately. A `ContentUnavailableError` tries the next
    // gateway; once every gateway has failed, the LAST one's own
    // ContentUnavailableError propagates, unchanged.
    async get(reference) {
        let lastError = null;
        for (const store of this._stores) {
            try {
                return await store.get(reference);
            } catch (error) {
                if (!(error instanceof ContentUnavailableError)) throw error;
                lastError = error;
            }
        }
        throw lastError;
    }

    // has(reference) -> Promise<boolean>. Best-effort, mirrors content/
    // ArweaveContentStore.js's own has() exactly — never throws, degrading
    // to `false` only once every configured gateway has failed.
    async has(reference) {
        try {
            const bytes = await this.get(reference);
            return bytes !== null;
        } catch {
            return false;
        }
    }
}
