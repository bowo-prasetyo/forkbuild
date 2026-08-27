import { ContentStore } from './ContentStore.js';
import { ContentUnavailableError } from './IpfsContentStore.js';

const IPFS_URI_PREFIX = 'ipfs://';
const DEFAULT_GATEWAY_URL = 'https://ipfs.io';
const DEFAULT_TIMEOUT_MS = 5000;

// 0.8.66 — IPFS Remote Gateway Resolution.
//
// content/IpfsContentStore.js (0.7.1) talks to a local Kubo node's own
// RPC API — almost certainly unreachable for an ordinary person who has
// never installed or run an IPFS daemon (see that class's own comment
// where ui/main.js wires it in anyway, "the more honest choice"). This
// class is the other half docs/Roadmap.md named as deliberately left
// unaddressed at 0.8.65's own close: "a real, remote-gateway-backed IPFS
// content store — so an ordinary person can consume IPFS-addressed
// content without installing and operating Kubo."
//
// It is a SECOND, independent content/ContentStore.js implementation,
// never a replacement for content/IpfsContentStore.js and never
// consulted by it — the same "two adapters, one boundary, neither aware
// of the other" discipline content/IpfsSnapshotPlacementView.js's own
// header already holds one axis over (presentation vs. resolution).
// Kubo keeps BOTH capabilities a real node has (put AND get); this class
// has only ONE of them:
//
//   Local Kubo (content/IpfsContentStore.js)   — resolve, publish
//   Remote Gateway (this class)                — resolve only
//
// put() is therefore NOT overridden — it inherits content/ContentStore
// .js's own unimplemented throw, the exact same signal a caller already
// gets from the abstract base class, never a second, competing "not
// supported" concept. A public HTTPS gateway accepts nothing; it only
// ever serves what has already been published somewhere else. See
// docs/Principles.md, "A Locator Is Not The Content; A Gateway Is Not A
// Verdict (0.8.66)."
//
// get()/has() hold the EXACT same contract content/IpfsContentStore.js's
// own get()/has() already do — this class's whole point is to be
// indistinguishable from that one at the content/ContentStore.js
// boundary:
//
//   - a reference with no `ipfs://` uri is simply not this store's
//     content: get() resolves to `null`, never throws
//   - every network-shaped failure (timeout, connection failure, a
//     non-2xx response, a response body that cannot be read) THROWS
//     ContentUnavailableError — imported from content/IpfsContentStore.js
//     itself, never a second, gateway-specific error type. A gateway
//     failing to serve this CID right now is exactly the same fact as a
//     Kubo node failing to reach it: an unavailable acquisition attempt,
//     nothing more. See that class's own header on why availability and
//     validity are never conflated.
//   - has() is best-effort and never throws, degrading to `false`
//
// This class never validates the retrieved bytes against any expected
// hash — that discipline belongs, unchanged, to core/ContentReference.js
// #verify() and to the callers that already invoke it (application/
// PublicationResolver.js, application/SnapshotPlacementResolver.js). A
// gateway is one more untrusted source of bytes, structurally no
// different from a Kubo node: this class hands back exactly what the
// gateway returned, and if those bytes do not hash to what was signed,
// the EXISTING content-hash-mismatch outcome catches it — the CID a
// gateway resolved is still only ever a locator, never accepted in place
// of ForkBuild's own content hash.
//
// Exactly ONE gateway, configured explicitly at construction — no list,
// no automatic fallback from one gateway to another, no "try the next
// one" of any kind. A caller that wants multiple gateways runs multiple
// instances of this class explicitly and decides for itself how to
// combine their outcomes; this class makes that decision for nobody.
export class IpfsGatewayContentStore extends ContentStore {
    // `fetchImpl` is an injection point, not a convenience — every
    // deterministic test for this class (tests/IpfsGatewayContentStore
    // .test.js) supplies a fake one, so gateway wire behavior is fully
    // covered without a live gateway.
    constructor({ gatewayUrl = DEFAULT_GATEWAY_URL, fetchImpl = null, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
        super();
        if (typeof gatewayUrl !== 'string' || !gatewayUrl.trim()) {
            throw new Error('IpfsGatewayContentStore: a non-empty gatewayUrl is required');
        }
        this._gatewayUrl = gatewayUrl.replace(/\/+$/, '');
        this._fetch = fetchImpl || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
        if (typeof this._fetch !== 'function') {
            throw new Error('IpfsGatewayContentStore: no fetch implementation available — pass fetchImpl explicitly');
        }
        this._timeoutMs = timeoutMs;
    }

    get gatewayUrl() { return this._gatewayUrl; }

    // Matches the `storage: 'ipfs'` content/IpfsContentStore.js's own
    // put() already stamps onto every ContentReference it returns — an
    // `ipfs://` locator names a SCHEME, not which particular backend
    // resolves it. A caller (application/SnapshotPlacementStoreRegistry
    // .js) registers exactly one store per storage name; wiring this
    // class in place of content/IpfsContentStore.js for a resolve-only
    // purpose, never alongside it in the same registry, is how a caller
    // keeps that choice explicit rather than letting one silently
    // overwrite the other. See ui/main.js's own 0.8.66 wiring comment.
    get storage() { return 'ipfs'; }

    // get(reference) -> Promise<string|null>. See this class's own
    // header for the full contract.
    async get(reference) {
        const cid = this._cidFromReference(reference);
        if (!cid) return null;
        const response = await this._request(`/ipfs/${encodeURIComponent(cid)}`);
        return await this._readText(response);
    }

    // has(reference) -> Promise<boolean>. Best-effort only, exactly like
    // content/IpfsContentStore.js#has() — NEVER throws.
    async has(reference) {
        try {
            const bytes = await this.get(reference);
            return bytes !== null;
        } catch {
            return false;
        }
    }

    async _request(path) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this._timeoutMs);
        let response;
        try {
            response = await this._fetch(`${this._gatewayUrl}${path}`, { method: 'GET', signal: controller.signal });
        } catch (error) {
            throw new ContentUnavailableError(`IpfsGatewayContentStore: could not reach gateway at ${this._gatewayUrl} — ${error.message}`);
        } finally {
            clearTimeout(timer);
        }
        if (!response.ok) {
            throw new ContentUnavailableError(`IpfsGatewayContentStore: gateway at ${this._gatewayUrl} returned ${response.status} for ${path}`);
        }
        return response;
    }

    async _readText(response) {
        try {
            return await response.text();
        } catch (error) {
            throw new ContentUnavailableError(`IpfsGatewayContentStore: could not read gateway's response body — ${error.message}`);
        }
    }

    _cidFromReference(reference) {
        const uri = reference && reference.uri;
        if (!uri || !uri.startsWith(IPFS_URI_PREFIX)) return null;
        return uri.slice(IPFS_URI_PREFIX.length);
    }
}
