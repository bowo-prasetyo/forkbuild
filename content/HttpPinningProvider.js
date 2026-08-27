import { PinningProvider } from './PinningProvider.js';
import { ContentUnavailableError } from './IpfsContentStore.js';

const DEFAULT_TIMEOUT_MS = 15000; // an upload is expected to take longer than a gateway GET
const DEFAULT_CID_FIELD = 'cid';
const DEFAULT_FILE_FIELD = 'file';

// 0.8.67 — Explicit Remote IPFS Publishing via a Pinning Provider.
//
// The one concrete content/PinningProvider.js this codebase ships: a
// generic HTTP JSON pinning client, configured entirely by its
// constructor arguments rather than by knowledge of any particular
// commercial service's own API. `endpoint`/`headers`/`fileFieldName`/
// `cidField` are all caller-supplied — this class hard-codes none of
// them, which is what lets it sit in front of Pinata's, Filebase's,
// web3.storage's, or a self-hosted Kubo-with-remote-pinning-API's own
// upload endpoint without ForkBuild importing or naming any of them.
// Multipart file upload, one POST, one JSON response — the smallest
// wire shape a genuinely diverse set of real pinning services already
// share.
//
// CREDENTIALS ARE INJECTED, NEVER OWNED. `headers` (arbitrary,
// caller-built) and the `credential` convenience (added as a bearer
// `Authorization` header when present) are supplied at construction by
// whatever collected them — a person's own input, a browser extension,
// a wallet-style connector — never a value this class or content/
// IpfsRemotePinningContentStore.js reads from a shared secret, an
// embedded constant, or persisted storage. Nothing in this file writes
// a credential anywhere. See docs/Principles.md, "A Capability Is
// Exposed Only Where It Exists; A Credential Is Never Owned (0.8.67)."
//
// TWO FAILURE MODES, NEVER CONFLATED — the identical "unavailable is not
// the same fact as wrong" discipline content/IpfsContentStore.js's own
// 0.7.1 header already established, extended here with the one new fact
// a remote pinning SERVICE can report that a Kubo node or a read-only
// gateway never could: a DEFINITIVE refusal.
//
//   ContentUnavailableError — the SAME class content/IpfsContentStore.js
//     and content/IpfsGatewayContentStore.js already throw, imported
//     rather than reinvented: unreachable host, timeout, a 5xx, or a
//     response this class cannot make sense of. Retrying later may
//     succeed; nothing about these bytes was rejected.
//   PinningRejectedError — new, and specific to a provider that can
//     genuinely refuse: an invalid or expired credential (401/403), a
//     malformed request (400/422), a quota or payload-size limit
//     (413/429). Retrying the identical request is not expected to
//     succeed; whatever produced the refusal has to change first.
//
// A 4xx response is classified as REJECTED and a 5xx (or a request that
// never reached the service at all) as UNAVAILABLE — an ordinary,
// well-established split for HTTP APIs, not a provider-specific
// guess. A concrete deployment that needs a different split constructs
// its own content/PinningProvider.js subclass rather than asking this
// generic one to special-case a status code.
export class PinningRejectedError extends Error {
    constructor(message) {
        super(message);
        this.name = 'PinningRejectedError';
    }
}

export class HttpPinningProvider extends PinningProvider {
    // `fetchImpl` is an injection point, not a convenience — every
    // deterministic test for this class (tests/HttpPinningProvider
    // .test.js) supplies a fake one, so wire behavior is fully covered
    // without a live pinning service.
    constructor({
        endpoint,
        credential = null,
        headers = {},
        fetchImpl = null,
        timeoutMs = DEFAULT_TIMEOUT_MS,
        cidField = DEFAULT_CID_FIELD,
        fileFieldName = DEFAULT_FILE_FIELD,
        name = 'remote pinning provider'
    } = {}) {
        super();
        if (typeof endpoint !== 'string' || !endpoint.trim()) {
            throw new Error('HttpPinningProvider: a non-empty endpoint is required');
        }
        this._endpoint = endpoint;
        this._credential = credential;
        this._headers = headers || {};
        this._fetch = fetchImpl || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
        if (typeof this._fetch !== 'function') {
            throw new Error('HttpPinningProvider: no fetch implementation available — pass fetchImpl explicitly');
        }
        this._timeoutMs = timeoutMs;
        this._cidField = cidField;
        this._fileFieldName = fileFieldName;
        this._name = name;
    }

    get name() { return this._name; }
    get endpoint() { return this._endpoint; }

    // put(bytes) -> Promise<{ cid }>. See this class's own header for the
    // full failure-classification contract.
    async put(bytes) {
        const text = typeof bytes === 'string' ? bytes : new TextDecoder().decode(bytes);
        const form = new FormData();
        form.append(this._fileFieldName, new Blob([text], { type: 'application/json' }));

        const headers = { ...this._headers };
        if (this._credential) {
            headers['Authorization'] = `Bearer ${this._credential}`;
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this._timeoutMs);
        let response;
        try {
            response = await this._fetch(this._endpoint, { method: 'POST', headers, body: form, signal: controller.signal });
        } catch (error) {
            throw new ContentUnavailableError(`HttpPinningProvider: could not reach ${this._name} at ${this._endpoint} — ${error.message}`);
        } finally {
            clearTimeout(timer);
        }

        if (!response.ok) {
            const bodyText = await this._safeReadText(response);
            if (response.status >= 400 && response.status < 500) {
                throw new PinningRejectedError(
                    `HttpPinningProvider: ${this._name} rejected the pin request (${response.status})`
                    + (bodyText ? ` — ${bodyText}` : '')
                );
            }
            throw new ContentUnavailableError(`HttpPinningProvider: ${this._name} at ${this._endpoint} returned ${response.status} for a pin request`);
        }

        const parsed = await this._readJson(response);
        const cid = parsed && parsed[this._cidField];
        if (!cid || typeof cid !== 'string') {
            throw new ContentUnavailableError(`HttpPinningProvider: ${this._name} did not return a CID in response field '${this._cidField}'`);
        }
        return { cid };
    }

    async _readJson(response) {
        try {
            return await response.json();
        } catch (error) {
            throw new ContentUnavailableError(`HttpPinningProvider: could not parse ${this._name}'s response — ${error.message}`);
        }
    }

    async _safeReadText(response) {
        try {
            return await response.text();
        } catch {
            return '';
        }
    }
}
