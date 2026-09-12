import { ArweaveWorldEncounterMaterialResolver } from './ArweaveWorldEncounterMaterialResolver.js';

// 0.9.440 — Arweave Gateway Read Failover.
//
// The World Encounter material retrieval counterpart to content/
// ArweaveGatewayFailoverContentStore.js (this same milestone) — see that
// file's own header for the shared rationale (0.9.439's own
// MINIMAL_FAILOVER_SEAM finding). application/
// ArweaveWorldEncounterMaterialResolver.js's own header already named this
// exact seam and how a caller should use it: "NO CACHING, NO RETRY, NO
// FALLBACK BETWEEN GATEWAYS... A caller wanting a second gateway tried on
// failure constructs and calls a second instance of this class explicitly;
// this file never does that on a caller's behalf." This file is that
// caller — never a modification of ArweaveWorldEncounterMaterialResolver
// itself.
//
//   { gatewayUrls: [A, B, C], ... }
//        │
//        ▼
//   application/ArweaveGatewayFailoverWorldEncounterMaterialResolver.js   ★ (THIS)
//        one `new ArweaveWorldEncounterMaterialResolver({ gatewayUrl, ... })`
//        per configured gateway, constructed once, up front
//        │
//        ▼
//   retrieveByUri(uri) — try gateway A's resolver; a non-null material
//        wins immediately; `null` (missing/malformed/oversized/non-ar://)
//        tries the next gateway; a genuine network failure (rejection) is
//        caught and also tries the next gateway; once every gateway has
//        been tried, the LAST genuine failure propagates if there was one,
//        otherwise `null` — the same two outcomes a single resolver's own
//        contract already has, never a third
//
// `null` FROM ONE GATEWAY IS NOT "GIVE UP" — IT IS "TRY THE NEXT ONE."
// application/ArweaveWorldEncounterMaterialResolver.js's own contract
// resolves `null` for a non-`ar://` uri, a malformed transaction id, a
// non-2xx gateway response, an unparseable body, and an oversized
// response — all "missing/malformed content," never a distinguished
// status (that file's own header, "a non-2xx gateway response... all
// resolve to null"). For a genuinely non-`ar://` uri, EVERY configured
// gateway's own resolver returns `null` the identical way, before any
// network call at all — see that file's own `transactionIdFromUri()`,
// checked first, synchronously — so trying every configured resolver here
// still never contacts a single gateway over the network for a malformed
// uri. For a valid `ar://` uri that one particular gateway simply hasn't
// synced or doesn't have (a 404), trying the next configured gateway is
// exactly the intended failover behavior: Arweave content is immutable, so
// a second gateway serving the identical transaction id returns
// byte-identical material.
//
// A GENUINE NETWORK FAILURE IS CAUGHT HERE, ONE LAYER UP FROM WHERE IT
// USED TO PROPAGATE. A single ArweaveWorldEncounterMaterialResolver's own
// header states a rejection (DNS failure, its own timeout elapsing)
// "propagates... never swallowed into null" TO ITS OWN CALLER — this class
// IS that caller now, and it is a different obligation one layer up: it
// catches a rejection from gateway A specifically so it can try gateway B,
// exactly the resilience this milestone exists to add. Only once every
// configured gateway has rejected does the LAST rejection propagate to
// THIS class's own caller — the identical "genuine failure propagates,
// never silently swallowed" contract, restated one layer higher.
//
// NO HIDDEN FAN-OUT. The first gateway to resolve non-null material wins
// and short-circuits every remaining configured gateway — they are never
// queried once a real answer exists, never merely for redundancy.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE. See content/
// ArweaveGatewayFailoverContentStore.js's own header, "deliberately
// excluded" — held identically here: no fan-out, no modification of
// application/ArweaveWorldEncounterMaterialResolver.js itself, no
// retry/backoff beyond what each wrapped instance already enforces, and no
// persistent failure scoring across calls.
export class ArweaveGatewayFailoverWorldEncounterMaterialResolver {
    // gatewayUrls: a non-empty array of gateway URLs, in the order they
    //   should be tried — see core/ArweaveGatewayConfiguration.js's own
    //   `.gatewayUrls`, this same milestone.
    // fetchImpl / timeoutMs / maxResponseBytes: forwarded verbatim to
    //   every underlying `ArweaveWorldEncounterMaterialResolver` — see
    //   that file's own constructor for their meaning.
    constructor({ gatewayUrls, fetchImpl = null, timeoutMs, maxResponseBytes } = {}) {
        if (!Array.isArray(gatewayUrls) || gatewayUrls.length === 0) {
            throw new Error('ArweaveGatewayFailoverWorldEncounterMaterialResolver: a non-empty gatewayUrls array is required');
        }
        this._resolvers = gatewayUrls.map((gatewayUrl) => new ArweaveWorldEncounterMaterialResolver({
            gatewayUrl, fetchImpl, timeoutMs, maxResponseBytes
        }));

        // Bound so `resolver.retrieveByUri` survives being passed around
        // as a bare function reference — the identical reason application/
        // ArweaveWorldEncounterMaterialResolver.js's own constructor
        // already binds its own method this same way.
        this.retrieveByUri = this.retrieveByUri.bind(this);
    }

    // The full ordered list of gateway urls this instance was built from —
    // read-only, mirrors each wrapped resolver's own `gatewayUrl`.
    get gatewayUrls() { return this._resolvers.map((resolver) => resolver.gatewayUrl); }

    get storage() { return 'ar'; }

    // retrieveByUri(uri) -> Promise<material | null>. See this file's own
    // header for the full contract: the first gateway to resolve non-null
    // material wins and short-circuits the rest; `null` or a rejection
    // from one gateway tries the next; a rejection only ever propagates
    // once every configured gateway has failed, and only when at least one
    // genuinely rejected (as opposed to every gateway agreeing `null`).
    async retrieveByUri(uri) {
        let lastError = null;
        for (const resolver of this._resolvers) {
            try {
                const material = await resolver.retrieveByUri(uri);
                if (material !== null) return material;
            } catch (error) {
                lastError = error;
            }
        }
        if (lastError) throw lastError;
        return null;
    }
}
