const ARWEAVE_URI_PREFIX = 'ar://';
const TRANSACTION_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const DEFAULT_GATEWAY_URL = 'https://arweave.net';
const DEFAULT_TIMEOUT_MS = 8000;

// Deliberately mirrors the MAGNITUDE of application/
// PeerWorldEncounterMaterialProtocol.js's own 0.9.23
// MAX_WORLD_ENCOUNTER_MATERIAL_BYTES (48 * 1024) — an explicit, named
// retrieval safety ceiling rather than an arbitrary ("no limit at all")
// gateway response entering the application. This is its own constant,
// never imported from that file: a peer wire envelope and a decentralized
// gateway response are different concerns at different layers, and this
// file has no reason to depend on peer transport code to get a sensible
// number.
const DEFAULT_MAX_RESPONSE_BYTES = 48 * 1024;

// 0.9.35 — Arweave World Encounter Material Resolver.
//
// 0.9.33 built `DecentralizedWorldEncounterMaterialSource`, constructed
// around one injected, substrate-agnostic `retrieveByUri(uri)` function,
// and shipped with no concrete implementation of its own — "probably
// Arweave first, since Nostr/Arweave discovery already exists." This file
// is that first concrete implementation: given an `ar://<transaction-id>`
// uri, retrieve the referenced JSON material from an Arweave gateway.
//
//   resolvedLead.uri = "ar://<transaction-id>"
//              │
//              ▼
//   application/ArweaveWorldEncounterMaterialResolver.js   ★ (THIS)
//        ArweaveWorldEncounterMaterialResolver#retrieveByUri(uri)
//              │
//              ▼
//   GET https://arweave.net/<transaction-id>
//              │
//              ▼
//   application/DecentralizedWorldEncounterMaterialSource.js   (0.9.33,
//        unmodified — the injected retrieveByUri contract this class
//        satisfies)
//              │
//              ▼
//   material, or null — not currently available
//
// A RETRIEVER, NEVER A SECOND RESOLVER. This file never imports
// `application/DecentralizedWorldEncounterLeadResolution.js`, `application/
// DecentralizedWorldDiscoveryLeadRegistry.js`, `core/
// DecentralizedWorldEncounterLeadAssociation.js`, or `application/
// DecentralizedWorldDiscoveryQuery.js`. It never even imports `application/
// DecentralizedWorldEncounterMaterialSource.js` itself — this class knows
// nothing about a `resolvedLead` or a `resolvedSelection`; its own
// `retrieveByUri(uri)` method takes exactly one plain string argument,
// exactly the shape 0.9.33's own constructor already requires, and a
// caller wires `resolver.retrieveByUri` (bound in this class's own
// constructor, so it survives being passed around as a bare function
// reference) directly into `new DecentralizedWorldEncounterMaterialSource(...)`.
// This file never reads a lead's own `origin`, `discoveryTag`, or `storage`
// — it never even sees a lead at all, only the one `uri` string a caller
// already extracted from one.
//
// `fetchImpl` IS AN INJECTION POINT, NOT A CONVENIENCE — the same
// `application/ArweaveGraphqlDiscoveryQueryService.js` / `content/
// IpfsGatewayContentStore.js` pattern this codebase already runs its other
// real-network adapters through: `tests/
// ArweaveWorldEncounterMaterialResolver.test.js` supplies a fake one, so
// this file's own wire behavior is fully covered without ever making a
// real network call, and without this codebase's own test suite ever
// depending on `arweave.net` being reachable.
//
// ONLY `ar://` URIS ARE ACCEPTED — ANYTHING ELSE RESOLVES TO `null`,
// NEVER THROWS. A missing/non-string `uri`, a uri with no `ar://` prefix
// (`ipfs://...`, `https://...`), and a uri whose transaction id contains
// anything outside `[A-Za-z0-9_-]` (an empty id, a path separator, a
// query string) are all "not something this resolver can retrieve" —
// exactly the same "not currently available" outcome 0.9.33's own
// `retrieveByUri` contract already expects for a miss.
//
// A NON-2xx GATEWAY RESPONSE, AN UNPARSEABLE BODY, AND AN OVERSIZED
// RESPONSE ALL RESOLVE TO `null` — "MISSING/MALFORMED CONTENT," NEVER A
// DISTINGUISHED STATUS. A transaction the gateway does not have (404), a
// body that is not valid JSON, and a response exceeding this resolver's
// own `maxResponseBytes` ceiling are indistinguishable from each other and
// from "nothing at this uri" — this file carries no `TOO_LARGE`/
// `MALFORMED` status of its own; see 0.9.33's own header, "two statuses,
// never a third," held here one layer earlier for retrieval itself. The
// size ceiling is enforced twice: first cheaply, against a `Content-Length`
// response header when the gateway sends one (never downloading a body
// already known to be oversized), and always, against the actual decoded
// byte length of whatever body was read — a missing or dishonest
// `Content-Length` never lets an oversized body through.
//
// A GENUINE NETWORK FAILURE PROPAGATES — NEVER SWALLOWED INTO `null`.
// `fetch` itself rejecting (no connectivity, DNS failure, this resolver's
// own `timeoutMs` elapsing and aborting the request) is not "missing
// content at this uri," it is "could not find out" — exactly 0.9.33's own
// header, "a rejection from `retrieveByUri()`... is never caught here; it
// propagates to this class's own caller unchanged." This resolver honors
// that same contract one layer earlier: it never wraps the `fetch` call
// itself in a `try`/`catch` that would turn a real failure into a
// misleading `null`.
//
// `material` IS RETURNED EXACTLY AS PARSED — NEVER INTERPRETED, NEVER
// VERIFIED, NEVER ASSIGNED A KIND. This class has no idea whether the
// JSON object it just parsed is a Publication, an AvatarProfile, or
// something else entirely, and it never guesses — that distinction lives
// on the resolved selection a caller already holds, one layer up, never
// here. No `Publication.fromJSON()`, no `AvatarProfile.fromJSON()`, no
// signature read, no hash check, no trust decision of any kind.
//
// NO CACHING, NO RETRY, NO FALLBACK BETWEEN GATEWAYS. Every call to
// `retrieveByUri()` issues exactly one GET request, fresh, to exactly this
// resolver's own configured gateway. A caller wanting a second gateway
// tried on failure constructs and calls a second instance of this class
// explicitly; this file never does that on a caller's behalf — the same
// "exactly one gateway... no automatic fallback" restraint `content/
// IpfsGatewayContentStore.js`'s own header already holds.
//
// NEVER QUERIES A DISCOVERY SERVICE. This file never imports `application/
// ArweaveGraphqlDiscoveryQueryService.js` or anything under `application/
// DecentralizedWorldDiscovery*` — discovery answers "where might material
// be"; this class answers "give me the bytes at this uri I already have."
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Signature verification, hash verification, content authentication,
//   or any trust/ranking decision.** A future "Retrieved Material
//   Integrity Boundary" / "Publication Signature Verification" milestone,
//   unscheduled.
// - **Deciding whether retrieved material is a Publication or an
//   AvatarProfile.** See "material is returned exactly as parsed," above
//   — that decision belongs to whatever already holds the resolved
//   selection, never to this file.
// - **Wiring this class into `application/
//   DecentralizedWorldEncounterLeadAwareMaterialLoading.js`'s own
//   `materialSources.decentralized` slot, or constructing a
//   `DecentralizedWorldEncounterMaterialSource` here.** 0.9.36, explicitly
//   unscheduled — this file ships a resolver, never runtime composition.
// - **Querying Arweave's own GraphQL discovery gateway, or any lead
//   registry/resolution boundary.** See "never queries a discovery
//   service," above.
// - **Multiple gateways, pagination, or streaming a response body.** See
//   "no caching, no retry, no fallback between gateways," above.
export class ArweaveWorldEncounterMaterialResolver {
    // gatewayUrl: which Arweave gateway serves raw transaction data at
    //   `<gatewayUrl>/<transaction-id>` — defaults to Arweave's own
    //   `arweave.net`, the same default host `application/
    //   ArweaveGraphqlDiscoveryQueryService.js` already targets for
    //   discovery.
    // fetchImpl: see this file's own header, "fetchImpl is an injection
    //   point."
    // timeoutMs: how long to wait before aborting the gateway request —
    //   the abort surfaces as a genuine rejection; see "a genuine network
    //   failure propagates," above.
    // maxResponseBytes: the retrieval safety ceiling; see this file's own
    //   header, "a non-2xx gateway response... all resolve to null."
    constructor({
        gatewayUrl = DEFAULT_GATEWAY_URL,
        fetchImpl = null,
        timeoutMs = DEFAULT_TIMEOUT_MS,
        maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES
    } = {}) {
        if (typeof gatewayUrl !== 'string' || gatewayUrl.trim().length === 0) {
            throw new Error('ArweaveWorldEncounterMaterialResolver: a non-empty gatewayUrl is required');
        }
        this._gatewayUrl = gatewayUrl.replace(/\/+$/, '');
        this._fetch = fetchImpl || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
        if (typeof this._fetch !== 'function') {
            throw new Error('ArweaveWorldEncounterMaterialResolver: no fetch implementation available — pass fetchImpl explicitly');
        }
        this._timeoutMs = timeoutMs;
        this._maxResponseBytes = Number.isInteger(maxResponseBytes) && maxResponseBytes > 0
            ? maxResponseBytes
            : DEFAULT_MAX_RESPONSE_BYTES;

        // Bound so `resolver.retrieveByUri` survives being passed around
        // as a bare function reference — exactly the shape `new
        // DecentralizedWorldEncounterMaterialSource(resolver.retrieveByUri)`
        // needs.
        this.retrieveByUri = this.retrieveByUri.bind(this);
    }

    get gatewayUrl() { return this._gatewayUrl; }

    // Matches the `storage: 'ar'` `application/
    // ArweaveGraphqlDiscoveryQueryService.js`'s own discovered leads
    // already carry — never read by this file itself; see this file's own
    // header, "never even sees a lead at all."
    get storage() { return 'ar'; }

    // retrieveByUri(uri) -> Promise<material | null>. See this file's own
    // header for the full contract: `null` for a non-`ar://` uri, a
    // malformed transaction id, a non-2xx gateway response, an
    // unparseable body, or an oversized response; a genuine `fetch`
    // failure (including this resolver's own timeout) propagates as a
    // rejection rather than being swallowed.
    async retrieveByUri(uri) {
        const transactionId = transactionIdFromUri(uri);
        if (transactionId === null) {
            return null;
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this._timeoutMs);
        let response;
        try {
            response = await this._fetch(`${this._gatewayUrl}/${transactionId}`, {
                method: 'GET',
                signal: controller.signal
            });
        } finally {
            clearTimeout(timer);
        }

        if (!response.ok) {
            return null;
        }

        const declaredLength = responseContentLength(response);
        if (declaredLength !== null && declaredLength > this._maxResponseBytes) {
            return null;
        }

        let text;
        try {
            text = await response.text();
        } catch {
            return null;
        }

        if (byteLength(text) > this._maxResponseBytes) {
            return null;
        }

        let material;
        try {
            material = JSON.parse(text);
        } catch {
            return null;
        }

        if (material === null || typeof material !== 'object') {
            return null;
        }

        return material;
    }
}

ArweaveWorldEncounterMaterialResolver.DEFAULT_GATEWAY_URL = DEFAULT_GATEWAY_URL;
ArweaveWorldEncounterMaterialResolver.DEFAULT_MAX_RESPONSE_BYTES = DEFAULT_MAX_RESPONSE_BYTES;

// Pure. Extracts a transaction id out of an `ar://<transaction-id>` uri,
// or `null` for anything else — a missing/non-string uri, a uri with no
// `ar://` prefix, or a transaction id containing anything outside
// `[A-Za-z0-9_-]` (empty, a path separator, whitespace, a query string).
// The charset restriction doubles as injection safety: whatever passes
// this check is concatenated directly into the gateway request URL.
function transactionIdFromUri(uri) {
    if (typeof uri !== 'string' || !uri.startsWith(ARWEAVE_URI_PREFIX)) {
        return null;
    }
    const id = uri.slice(ARWEAVE_URI_PREFIX.length);
    if (!TRANSACTION_ID_PATTERN.test(id)) {
        return null;
    }
    return id;
}

// Pure. Reads a `Content-Length` header off a fetch Response, or `null`
// when the response carries no headers object, no such header, or a
// non-numeric value — the cheap first line of defense against an
// oversized body; see this file's own header.
function responseContentLength(response) {
    const headers = response && response.headers;
    if (!headers || typeof headers.get !== 'function') {
        return null;
    }
    const raw = headers.get('content-length');
    const parsed = raw === null ? NaN : Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
}

// Pure. The actual decoded byte length of a string — the always-enforced
// second line of defense against an oversized body, independent of
// whatever (or whether) a `Content-Length` header claimed; see this
// file's own header.
function byteLength(text) {
    return new TextEncoder().encode(text).byteLength;
}
