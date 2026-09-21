import { ContentStore } from './ContentStore.js';
import { IpfsGatewayContentStore } from './IpfsGatewayContentStore.js';
import { ContentUnavailableError } from './IpfsContentStore.js';

// 0.9.666 — IPFS Gateway Read Failover.
//
// content/IpfsGatewayContentStore.js's own header names this codebase's
// same MINIMAL_FAILOVER_SEAM content/ArweaveContentStore.js's header named
// for Arweave: content-addressed, byte-identical regardless of which
// gateway answers, so ordered failover captures all of the resilience
// benefit with none of fan-out's complexity — "a caller that wants
// multiple gateways runs multiple instances explicitly." This file is
// that caller — a thin ContentStore that wraps one IpfsGatewayContentStore
// PER configured gateway and tries them in order, never modifying
// IpfsGatewayContentStore itself. It is the direct structural mirror of
// content/ArweaveGatewayFailoverContentStore.js, one axis over.
//
//   { gatewayUrls: [A, B, C] }
//        │
//        ▼
//   content/IpfsGatewayFailoverContentStore.js   ★ (THIS)
//        one `new IpfsGatewayContentStore({ gatewayUrl })` per configured
//        gateway, constructed once, up front
//        │
//        ├─ get(reference) / has(reference) — try gateway A's store; a
//        │    ContentUnavailableError tries gateway B next, then C; the
//        │    first SUCCESS returns immediately, the rest are never
//        │    contacted; every gateway failing throws the LAST gateway's
//        │    own ContentUnavailableError, unchanged
//        │
//        └─ put(bytes) — delegates to the first configured gateway's own
//             store, which is content/IpfsGatewayContentStore.js's own
//             unimplemented throw (a read-only HTTPS gateway cannot accept
//             content) — this class adds no write capability of any kind
//
// EACH UNDERLYING GATEWAY IS A REAL, UNMODIFIED IpfsGatewayContentStore —
// NEVER A REIMPLEMENTATION OF ITS WIRE BEHAVIOR. This class contains no
// fetch() call and no CID parsing of its own; every one of those stays
// exactly where content/IpfsGatewayContentStore.js already owns it.
//
// A NON-ipfs:// REFERENCE NEVER CONTACTS ANY GATEWAY. `_cidFromReference()`
// on every underlying store returns `null` before any network call for a
// reference that doesn't even carry an `ipfs://` uri — so `get()` returns
// `null` off the FIRST store without ever trying a second or third.
//
// AN UNEXPECTED ERROR SHAPE NEVER GETS SWALLOWED INTO "TRY THE NEXT
// GATEWAY." Only a `ContentUnavailableError` — content/
// IpfsGatewayContentStore.js's own network-shaped-failure contract —
// advances to the next configured gateway. Anything else propagates
// immediately, exactly as it would from a single IpfsGatewayContentStore.
//
// NO CACHING, NO HEALTH CHECK, NO REORDERING. Gateways are always tried in
// the exact order they were configured, every call, fresh — the
// configured order IS the entire policy; see core/
// IpfsGatewayConfiguration.js's own header, "ordering IS the priority."
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Fan-out.** A successful read from one gateway terminates the
//   operation; the remaining configured gateways are never queried merely
//   for redundancy.
// - **Any change to content/IpfsGatewayContentStore.js itself.** This
//   class only ever constructs and calls it, exactly as any other caller
//   would.
// - **Retry/backoff, timeouts beyond what each wrapped instance already
//   enforces, or persistent failure scoring across calls.**
export class IpfsGatewayFailoverContentStore extends ContentStore {
    // gatewayUrls: a non-empty array of gateway URLs, in the order they
    //   should be tried — see core/IpfsGatewayConfiguration.js's own
    //   `.gatewayUrls` for where a caller usually gets this from.
    // fetchImpl / timeoutMs: forwarded verbatim to every underlying
    //   IpfsGatewayContentStore — see that file's own constructor for
    //   their meaning.
    constructor({ gatewayUrls, fetchImpl = null, timeoutMs } = {}) {
        super();
        if (!Array.isArray(gatewayUrls) || gatewayUrls.length === 0) {
            throw new Error('IpfsGatewayFailoverContentStore: a non-empty gatewayUrls array is required');
        }
        this._stores = gatewayUrls.map((gatewayUrl) => new IpfsGatewayContentStore({
            gatewayUrl, fetchImpl, timeoutMs
        }));
    }

    // The full ordered list of gateway urls this instance was built from —
    // read-only, mirrors each wrapped store's own `gatewayUrl`.
    get gatewayUrls() { return this._stores.map((store) => store.gatewayUrl); }

    get storage() { return 'ipfs'; }

    // put(bytes) -> Promise<ContentReference>. Delegates to the first
    // configured gateway's own store — content/IpfsGatewayContentStore.js's
    // own unimplemented throw, unchanged. See this file's own header.
    async put(bytes) {
        return this._stores[0].put(bytes);
    }

    // get(reference) -> Promise<string|null>. Tries each configured
    // gateway's own store in order; the first to resolve (including with
    // `null`, for a non-ipfs:// reference) returns immediately. A
    // `ContentUnavailableError` tries the next gateway; once every gateway
    // has failed, the LAST one's own ContentUnavailableError propagates,
    // unchanged.
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
    // IpfsGatewayContentStore.js's own has() exactly — never throws,
    // degrading to `false` only once every configured gateway has failed.
    async has(reference) {
        try {
            const bytes = await this.get(reference);
            return bytes !== null;
        } catch {
            return false;
        }
    }
}
