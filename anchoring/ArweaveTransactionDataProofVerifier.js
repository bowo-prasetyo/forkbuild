import { ProofVerifier } from './ProofVerifier.js';

const TRANSACTION_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const DEFAULT_GATEWAY_URL = 'https://arweave.net';
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_RESPONSE_BYTES = 4096;

// 0.9.425 — Arweave Proof/Anchoring Provider Implementation.
//
// The verification-side counterpart of anchoring/ArweaveAnchorPublisher.js
// — exactly the split anchoring/BitcoinOpReturnProofVerifier.js already
// holds opposite anchoring/BitcoinAnchorPublisher.js. A `PublicationAnchor`'s
// own `proof` for the `arweave` anchorType is exactly:
//
//   { txid }
//
// nothing else — this class never invents a second, redundant
// "commitment" field a forger could set independently of the anchor's
// own signed `contentHash`. The ONE thing checked is that the named
// Arweave transaction's own raw data is byte-identical to the anchor's
// own contentHash — never a hash of a hash, never an application-chosen
// encoding this class would have to document and version separately.
//
// REUSES THE SAME RETRIEVAL WIRE PROTOCOL application/
// ArweaveWorldEncounterMaterialResolver.js ALREADY RUNS LIVE — `GET
// <gatewayUrl>/<transaction-id>` — 0.9.424's own audit (Section D2) named
// this exact reuse as the proven architectural fit for a hypothetical
// Arweave proof verifier. This class is a separate, independent
// implementation of that same GET, never an import of that resolver: that
// file's own `retrieveByUri()` JSON-parses its response and takes a whole
// `ar://` uri; this class compares raw text against a plain contentHash
// and takes a bare transaction id, two genuinely different contracts that
// merely happen to hit the same gateway path.
//
// `fetchImpl` IS AN INJECTION POINT, NOT A CONVENIENCE — the same pattern
// every real-network adapter in this codebase already runs through, so
// every deterministic test in this codebase supplies a fake one and this
// file's own wire behavior is fully covered without ever making a real
// network call on an ordinary `node tests/*.test.js` sweep.
//
// A TRANSACTION NOT (YET) FOUND, NOT YET RETRIEVABLE FROM THIS GATEWAY, OR
// UNREACHABLE FOR ANY TRANSPORT REASON IS NEVER DISTINGUISHABLE FROM
// "WILL NEVER EXIST," AND THIS CLASS DOES NOT PRETEND OTHERWISE — reported
// as the `unavailable` form anchoring/ProofVerifier.js's own header
// documents, exactly as anchoring/BitcoinOpReturnProofVerifier.js already
// treats a 404 or an unconfirmed transaction. Only a transaction that IS
// reachable, but genuinely does not carry the claimed contentHash as its
// own data, is ever reported as a definite rejection.
export class ArweaveTransactionDataProofVerifier extends ProofVerifier {
    // gatewayUrl: which Arweave gateway serves raw transaction data at
    //   `<gatewayUrl>/<transaction-id>` — defaults to `arweave.net`, the
    //   same default host every other Arweave-facing class in this
    //   codebase already targets.
    // fetchImpl: see this file's own header, "fetchImpl is an injection
    //   point."
    // maxResponseBytes: a content hash is always a short string — this
    //   ceiling exists only to bound an unexpectedly large or hanging
    //   gateway response, the same two-layer discipline (a cheap
    //   Content-Length check, then the actual decoded byte length) every
    //   other Arweave-facing retrieval class in this codebase already
    //   enforces.
    constructor({
        gatewayUrl = DEFAULT_GATEWAY_URL, fetchImpl = null,
        timeoutMs = DEFAULT_TIMEOUT_MS, maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES
    } = {}) {
        super();
        if (typeof gatewayUrl !== 'string' || gatewayUrl.trim().length === 0) {
            throw new Error('ArweaveTransactionDataProofVerifier: a non-empty gatewayUrl is required');
        }
        this._gatewayUrl = gatewayUrl.replace(/\/+$/, '');
        this._fetch = fetchImpl || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
        if (typeof this._fetch !== 'function') {
            throw new Error('ArweaveTransactionDataProofVerifier: no fetch implementation available — pass fetchImpl explicitly');
        }
        this._timeoutMs = timeoutMs;
        this._maxResponseBytes = Number.isInteger(maxResponseBytes) && maxResponseBytes > 0
            ? maxResponseBytes
            : DEFAULT_MAX_RESPONSE_BYTES;
    }

    get anchorType() { return 'arweave'; }
    get gatewayUrl() { return this._gatewayUrl; }

    async verify(proof, { contentHash } = {}) {
        if (!proof || typeof proof !== 'object') {
            return { valid: false, reason: 'proof is missing or not an object' };
        }
        const { txid } = proof;
        if (typeof txid !== 'string' || !TRANSACTION_ID_PATTERN.test(txid)) {
            return { valid: false, reason: 'proof.txid is missing or not a valid Arweave transaction id' };
        }
        if (typeof contentHash !== 'string' || contentHash.length === 0) {
            return { valid: false, reason: 'no contentHash was supplied to verify the proof against' };
        }

        let text;
        try {
            text = await this._fetchTransactionData(txid);
        } catch (error) {
            return { valid: false, unavailable: true, reason: error.message };
        }
        if (text === null) {
            return {
                valid: false,
                unavailable: true,
                reason: `transaction ${txid} was not found by ${this._gatewayUrl} — it may not yet be mined, or has not yet propagated to this gateway`
            };
        }

        if (text !== contentHash) {
            return { valid: false, reason: `transaction ${txid}'s own data does not match the anchor's contentHash` };
        }
        return { valid: true };
    }

    async _fetchTransactionData(txid) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this._timeoutMs);
        let response;
        try {
            response = await this._fetch(`${this._gatewayUrl}/${txid}`, { signal: controller.signal });
        } catch (error) {
            throw new Error(`ArweaveTransactionDataProofVerifier: could not reach ${this._gatewayUrl} — ${error.message}`);
        } finally {
            clearTimeout(timer);
        }

        if (response.status === 404) return null;
        if (!response.ok) {
            throw new Error(`ArweaveTransactionDataProofVerifier: ${this._gatewayUrl} returned ${response.status} for transaction ${txid}`);
        }

        const declaredLength = responseContentLength(response);
        if (declaredLength !== null && declaredLength > this._maxResponseBytes) {
            throw new Error(`ArweaveTransactionDataProofVerifier: ${this._gatewayUrl}'s response for ${txid} exceeds this verifier's own size ceiling`);
        }

        let text;
        try {
            text = await response.text();
        } catch (error) {
            throw new Error(`ArweaveTransactionDataProofVerifier: could not read ${this._gatewayUrl}'s response for ${txid} — ${error.message}`);
        }

        if (byteLength(text) > this._maxResponseBytes) {
            throw new Error(`ArweaveTransactionDataProofVerifier: ${this._gatewayUrl}'s response for ${txid} exceeds this verifier's own size ceiling`);
        }

        return text;
    }
}

ArweaveTransactionDataProofVerifier.DEFAULT_GATEWAY_URL = DEFAULT_GATEWAY_URL;
ArweaveTransactionDataProofVerifier.DEFAULT_MAX_RESPONSE_BYTES = DEFAULT_MAX_RESPONSE_BYTES;

function responseContentLength(response) {
    const headers = response && response.headers;
    if (!headers || typeof headers.get !== 'function') {
        return null;
    }
    const raw = headers.get('content-length');
    const parsed = raw === null ? NaN : Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
}

function byteLength(text) {
    return new TextEncoder().encode(text).byteLength;
}
