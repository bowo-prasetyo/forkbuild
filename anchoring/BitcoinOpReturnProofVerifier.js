import { ProofVerifier } from './ProofVerifier.js';

const DEFAULT_API_URL = 'https://blockstream.info/api';
const DEFAULT_TIMEOUT_MS = 8000;
const TXID_PATTERN = /^[0-9a-f]{64}$/i;

// 0.8.1 — External Anchor Proof Adapters & Verification Registry.
//
// The one real anchorType this milestone ships: `bitcoin-op-return`. Not
// "blockchain integration" as a monolithic feature — one anchorType-
// specific proofVerifier, plugged into the exact seam application/
// ExternalAnchorVerifier.js's own `proofVerifier` option has held open
// since 0.8.0, and nothing else changes about what a PublicationAnchor,
// or ExternalAnchorVerifier's own pipeline, means. See docs/
// Principles.md, "External Evidence Adapters Never Change What
// PublicationAnchor Means (0.8.1)."
//
// A `PublicationAnchor`'s own `proof` for this anchorType is exactly:
//
//   { txid, network = 'mainnet', vout = null }
//
// nothing else — this class never invents a second, redundant
// "commitment" field a forger could set independently of the anchor's
// own signed `contentHash`. The ONE thing checked is that some OP_RETURN
// output of the named transaction carries the anchor's OWN contentHash,
// as raw hex — never a hash of a hash, never an application-chosen
// encoding this class would have to document and version separately.
// `vout`, if supplied, only narrows which output to check; omitting it
// scans every output of the (typically small) transaction.
//
// Talks to a public Esplora-compatible block explorer HTTP API — the
// same one Blockstream's own public instance, mempool.space, and most
// self-hosted Esplora nodes expose: `GET /tx/:txid` for the transaction
// itself, `GET /blocks/tip/height` only when `minConfirmations` > 1
// requires knowing the current chain tip. `fetchImpl` is the identical
// injection point content/IpfsContentStore.js already established, for
// the identical reason: every deterministic test in this codebase
// supplies a fake one (tests/BitcoinOpReturnProofVerifier.test.js,
// tests/ExternalAnchorProofAdapters.test.js), so this file's own wire
// behavior is fully covered without ever making a real network call on
// an ordinary `node tests/*.test.js` sweep. Unlike content/
// IpfsContentStore.js's own tests/IpfsLiveIntegration.test.js, this
// codebase ships no live-network test for this class — a local Kubo
// daemon is free, self-hosted, and under a developer's own control; a
// real Bitcoin mainnet transaction carrying a real OP_RETURN this test
// suite could point at is neither. See docs/Roadmap.md's own
// "Deliberately excluded" list for 0.8.1.
//
// Every failure this class can itself distinguish reports the
// `unavailable` form anchoring/ProofVerifier.js's own header documents,
// NEVER a bare rejection — a transaction not (yet) found, or not yet
// confirmed, is never distinguishable from "will never exist," and this
// class does not pretend otherwise. Only a transaction that IS reachable
// and confirmed, but genuinely does not carry the claimed contentHash in
// any OP_RETURN output, is ever reported as a definite rejection.
export class BitcoinOpReturnProofVerifier extends ProofVerifier {
    // `fetchImpl` is an injection point, not a convenience — see this
    // file's own header.
    constructor({
        apiUrl = DEFAULT_API_URL, network = 'mainnet', fetchImpl = null,
        timeoutMs = DEFAULT_TIMEOUT_MS, minConfirmations = 1
    } = {}) {
        super();
        this._apiUrl = apiUrl.replace(/\/+$/, '');
        this._network = network;
        this._fetch = fetchImpl || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
        if (typeof this._fetch !== 'function') {
            throw new Error('BitcoinOpReturnProofVerifier: no fetch implementation available — pass fetchImpl explicitly');
        }
        this._timeoutMs = timeoutMs;
        this._minConfirmations = Math.max(1, minConfirmations);
    }

    get anchorType() { return 'bitcoin-op-return'; }
    get apiUrl() { return this._apiUrl; }
    get network() { return this._network; }

    async verify(proof, { contentHash } = {}) {
        if (!proof || typeof proof !== 'object') {
            return { valid: false, reason: 'proof is missing or not an object' };
        }
        const { txid, network = 'mainnet', vout = null } = proof;
        if (typeof txid !== 'string' || !TXID_PATTERN.test(txid)) {
            return { valid: false, reason: 'proof.txid is missing or not a valid 32-byte hex transaction id' };
        }
        if (network !== this._network) {
            return { valid: false, reason: `proof declares network "${network}", this verifier only checks "${this._network}"` };
        }
        if (!contentHash || typeof contentHash !== 'string') {
            return { valid: false, reason: 'no contentHash was supplied to verify the proof against' };
        }

        let tx;
        try {
            tx = await this._fetchTx(txid);
        } catch (error) {
            return { valid: false, unavailable: true, reason: error.message };
        }
        if (tx === null) {
            return {
                valid: false,
                unavailable: true,
                reason: `transaction ${txid} was not found by ${this._apiUrl} — it may not have been broadcast, or has not yet propagated to this node`
            };
        }
        if (!tx.status || !tx.status.confirmed) {
            return { valid: false, unavailable: true, reason: `transaction ${txid} is not yet confirmed` };
        }

        if (this._minConfirmations > 1) {
            let confirmations;
            try {
                confirmations = await this._confirmations(tx.status.block_height);
            } catch (error) {
                return { valid: false, unavailable: true, reason: error.message };
            }
            if (confirmations < this._minConfirmations) {
                return {
                    valid: false,
                    unavailable: true,
                    reason: `transaction ${txid} has ${confirmations} confirmation(s), fewer than the required ${this._minConfirmations}`
                };
            }
        }

        const outputs = Array.isArray(tx.vout) ? tx.vout : [];
        const candidates = vout !== null ? [outputs[vout]].filter(Boolean) : outputs;
        const normalizedHash = contentHash.trim().toLowerCase();
        const found = candidates.some((output) => {
            const data = extractOpReturnData(output);
            return data !== null && data.toLowerCase() === normalizedHash;
        });

        if (!found) {
            return { valid: false, reason: `no OP_RETURN output of transaction ${txid} carries the contentHash ${contentHash}` };
        }
        return { valid: true };
    }

    async _fetchTx(txid) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this._timeoutMs);
        let response;
        try {
            response = await this._fetch(`${this._apiUrl}/tx/${txid}`, { signal: controller.signal });
        } catch (error) {
            throw new Error(`BitcoinOpReturnProofVerifier: could not reach ${this._apiUrl} — ${error.message}`);
        } finally {
            clearTimeout(timer);
        }
        if (response.status === 404) return null;
        if (!response.ok) {
            throw new Error(`BitcoinOpReturnProofVerifier: ${this._apiUrl} returned ${response.status} for tx ${txid}`);
        }
        try {
            return await response.json();
        } catch (error) {
            throw new Error(`BitcoinOpReturnProofVerifier: could not parse ${this._apiUrl}'s transaction response — ${error.message}`);
        }
    }

    async _confirmations(blockHeight) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this._timeoutMs);
        let response;
        try {
            response = await this._fetch(`${this._apiUrl}/blocks/tip/height`, { signal: controller.signal });
        } catch (error) {
            throw new Error(`BitcoinOpReturnProofVerifier: could not reach ${this._apiUrl} for tip height — ${error.message}`);
        } finally {
            clearTimeout(timer);
        }
        if (!response.ok) {
            throw new Error(`BitcoinOpReturnProofVerifier: ${this._apiUrl} returned ${response.status} for tip height`);
        }
        const text = (await response.text()).trim();
        const tipHeight = Number.parseInt(text, 10);
        if (!Number.isFinite(tipHeight)) {
            throw new Error(`BitcoinOpReturnProofVerifier: ${this._apiUrl} returned a non-numeric tip height`);
        }
        return tipHeight - blockHeight + 1;
    }
}

// Esplora's own `vout[].scriptpubkey_asm` shape for an OP_RETURN output:
// "OP_RETURN OP_PUSHBYTES_<n> <hexdata>" (or, rarely, just "OP_RETURN"
// for a data-less one, which this function correctly reports as
// carrying no data). Returns the pushed hex data, or null for any output
// that is not an OP_RETURN at all.
function extractOpReturnData(output) {
    if (!output || output.scriptpubkey_type !== 'op_return' || typeof output.scriptpubkey_asm !== 'string') {
        return null;
    }
    const parts = output.scriptpubkey_asm.trim().split(/\s+/);
    if (parts[0] !== 'OP_RETURN' || parts.length < 2) return null;
    return parts[parts.length - 1];
}
