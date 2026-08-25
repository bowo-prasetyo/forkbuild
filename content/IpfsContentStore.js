import { ContentStore } from './ContentStore.js';
import { ContentReference } from '../core/ContentReference.js';
import { computeContentHash } from '../serializer/contentHash.js';

const IPFS_URI_PREFIX = 'ipfs://';
const DEFAULT_API_URL = 'http://127.0.0.1:5001';
const DEFAULT_TIMEOUT_MS = 5000;

// 0.7.1 — IPFS Content Publication & Resolution.
//
// content/ContentStore.js's own 0.2.14 header named this class directly
// as future work: "Future implementations: IPFSContentStore,
// ArweaveContentStore, HttpContentStore." This is the first of the
// three, talking to a real Kubo (go-ipfs) node over its HTTP RPC API
// (`/api/v0/add`, `/api/v0/cat`) — zero new dependencies, using nothing
// but the `fetch`/`FormData`/`Blob` globals this codebase already runs
// on in both the browser and Node.
//
// The one rule this class exists to enforce structurally, not just by
// convention, exactly the same restraint core/ContentReference.js's own
// header already states:
//
//   The CID IPFS hands back is a LOCATOR. It is never this content's
//   IDENTITY.
//
// `put()` computes its returned ContentReference's `hash` the same way
// content/LocalContentStore.js already does — a local, deterministic
// hash of the bytes THIS REPLICA is looking at — and only ever puts the
// CID into `uri`, one retrieval mechanism among however many others a
// ContentReference may eventually carry (`ar://`, `https://`, ...),
// never a second, competing notion of what the content IS. A caller who
// only ever reads `contentReference.hash` cannot tell whether the bytes
// came from content/LocalContentStore.js or from here — that
// indistinguishability is the entire point of application/
// PublicationResolver.js never importing this file.
//
// `get()`/`has()` never conflate "could not reach it" with "it doesn't
// exist" — see application/PublicationResolutionOutcome.js's own
// CONTENT_UNAVAILABLE for why that distinction matters the moment a
// ContentStore is backed by a real network instead of a local disk.
// `get()` THROWS a ContentUnavailableError for every kind of failure
// (timeout, connection refused, non-2xx, the node genuinely not having
// this content pinned or replicated yet) — application/
// PublicationResolver.js#resolve() catches exactly that and reports
// CONTENT_UNAVAILABLE, never INVALID anything. `has()` never throws —
// the same best-effort, degrade-to-false posture content/
// LocalContentStore.js#has() already keeps, for a caller that only wants
// a boolean and has nowhere to route a network error anyway.
export class ContentUnavailableError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ContentUnavailableError';
    }
}

export class IpfsContentStore extends ContentStore {
    // `fetchImpl` is an injection point, not a convenience — every
    // deterministic test in this codebase for this class supplies a fake
    // one (see tests/IpfsContentStore.test.js and tests/
    // IpfsPublicationResolution.test.js) so IPFS wire behavior is fully
    // covered WITHOUT a live daemon; only tests/IpfsLiveIntegration.test.js
    // ever exercises the real global `fetch` against an actual node, and
    // that file skips itself entirely when none is reachable.
    constructor({ apiUrl = DEFAULT_API_URL, fetchImpl = null, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
        super();
        this._apiUrl = apiUrl.replace(/\/+$/, '');
        this._fetch = fetchImpl || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
        if (typeof this._fetch !== 'function') {
            throw new Error('IpfsContentStore: no fetch implementation available — pass fetchImpl explicitly');
        }
        this._timeoutMs = timeoutMs;
    }

    get apiUrl() { return this._apiUrl; }

    // 0.8.18 — matches the `storage: 'ipfs'` this class's own put()
    // already stamps onto every ContentReference it returns.
    get storage() { return 'ipfs'; }

    // put(bytes) -> Promise<ContentReference>. Pins by default
    // (`pin=true`) — an unpinned add is one garbage-collection pass away
    // from silently vanishing, which would make application/
    // PublicationResolver.js's own CONTENT_UNAVAILABLE indistinguishable
    // from "was never really published," exactly the ambiguity this
    // milestone's own design conversation wanted a real backend to avoid
    // wherever it reasonably can.
    async put(bytes) {
        const text = typeof bytes === 'string' ? bytes : new TextDecoder().decode(bytes);
        const hash = computeContentHash(text);

        const form = new FormData();
        form.append('file', new Blob([text], { type: 'application/json' }));
        const response = await this._request('/api/v0/add?cid-version=1&pin=true', { body: form });
        const parsed = await this._readJson(response, 'add');
        const cid = parsed && parsed.Hash;
        if (!cid) {
            throw new ContentUnavailableError('IpfsContentStore: IPFS API did not return a CID from add');
        }

        return new ContentReference({
            hash,
            algorithm: 'fnv1a-32',
            mediaType: 'application/json',
            size: text.length,
            uri: IPFS_URI_PREFIX + cid,
            storage: 'ipfs'
        });
    }

    // get(reference) -> Promise<string|null>. `null` only ever means
    // "this reference does not even point at IPFS" (no `ipfs://` uri) —
    // a caller asked the wrong store. Every network-shaped failure THROWS
    // ContentUnavailableError instead, so it is never silently
    // indistinguishable from "nothing here."
    async get(reference) {
        const cid = this._cidFromReference(reference);
        if (!cid) return null;
        const response = await this._request(`/api/v0/cat?arg=${encodeURIComponent(cid)}`);
        return await this._readText(response);
    }

    // has(reference) -> Promise<boolean>. Best-effort only, exactly like
    // content/LocalContentStore.js#has() — NEVER throws, degrading to
    // `false` for anything unreachable rather than distinguishing "not
    // here" from "couldn't check right now." A caller that needs that
    // distinction calls get() directly and reads the thrown error.
    async has(reference) {
        try {
            const bytes = await this.get(reference);
            return bytes !== null;
        } catch {
            return false;
        }
    }

    async _request(path, { body = null } = {}) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this._timeoutMs);
        let response;
        try {
            response = await this._fetch(`${this._apiUrl}${path}`, { method: 'POST', body, signal: controller.signal });
        } catch (error) {
            throw new ContentUnavailableError(`IpfsContentStore: could not reach IPFS API at ${this._apiUrl} — ${error.message}`);
        } finally {
            clearTimeout(timer);
        }
        if (!response.ok) {
            throw new ContentUnavailableError(`IpfsContentStore: IPFS API at ${this._apiUrl} returned ${response.status} for ${path}`);
        }
        return response;
    }

    async _readJson(response, label) {
        try {
            return await response.json();
        } catch (error) {
            throw new ContentUnavailableError(`IpfsContentStore: could not parse IPFS API's ${label} response — ${error.message}`);
        }
    }

    async _readText(response) {
        try {
            return await response.text();
        } catch (error) {
            throw new ContentUnavailableError(`IpfsContentStore: could not read IPFS API's response body — ${error.message}`);
        }
    }

    _cidFromReference(reference) {
        const uri = reference && reference.uri;
        if (!uri || !uri.startsWith(IPFS_URI_PREFIX)) return null;
        return uri.slice(IPFS_URI_PREFIX.length);
    }
}
