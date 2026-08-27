const DEFAULT_API_URL = 'https://blockstream.info/api';
const DEFAULT_TIMEOUT_MS = 8000;

// 0.8.54 — Bitcoin Anchor Confirmation Observation.
//
// The concrete `confirmationSource` anchoring/
// BitcoinAnchorConfirmationObserver.js injects to actually reach the
// network — an adapter, not a widening of the domain class, the identical
// split anchoring/BitcoinAnchorTransactionBroadcaster.js /
// BitcoinEsploraTransactionBroadcaster.js already established for
// broadcasting (0.8.52). Talks to the SAME Esplora-compatible block
// explorer HTTP API anchoring/BitcoinOpReturnProofVerifier.js already
// reads from — `GET /tx/:txid` for the transaction itself, `GET
// /blocks/tip/height` to derive `confirmationCount` — reusing that exact
// wire protocol rather than inventing a second one, because it is already
// the one this codebase trusts for reading Bitcoin transaction state. This
// class shares no code with BitcoinOpReturnProofVerifier — each concrete
// Esplora adapter in this codebase (this one, BitcoinOpReturnProofVerifier,
// BitcoinEsploraTransactionBroadcaster) stays self-contained, exactly as
// the two existing ones already do — but it deliberately answers a
// DIFFERENT question: BitcoinOpReturnProofVerifier asks "does this
// transaction's OP_RETURN carry a specific content hash;" this class asks
// only "what does the network currently report about this transaction's
// confirmation status," and never inspects a single output.
//
// `fetchImpl` is the identical injection point content/IpfsContentStore.js,
// anchoring/BitcoinOpReturnProofVerifier.js, and anchoring/
// BitcoinEsploraTransactionBroadcaster.js already established, for the
// identical reason: tests/BitcoinEsploraTransactionConfirmationObserver.
// test.js supplies a fake one, so this file's own wire behavior is fully
// covered without ever making a real network call.
//
// SPEAKS EXACTLY THE `confirmationSource` PROTOCOL anchoring/
// BitcoinAnchorConfirmationObserver.js's own header already documents —
// `fetchConfirmation(txid) -> { found: true, confirmed: true, blockHash,
// blockHeight, confirmationCount } | { found: true, confirmed: false } |
// { found: false [, reason] }`. This class never returns anything else,
// and NEVER THROWS — every failure it can distinguish (not found,
// unreachable, a non-2xx response, an unparseable body) is translated into
// the `found: false` form, mirroring exactly how anchoring/
// BitcoinEsploraTransactionBroadcaster.js's own `broadcast()` never throws
// either.
//
// A "NOT FOUND" (404) RESPONSE AND A NETWORK/SERVER FAILURE ARE BOTH
// REPORTED AS `found: false`, DELIBERATELY NOT DISTINGUISHED FURTHER HERE.
// Unlike anchoring/BitcoinEsploraTransactionBroadcaster.js's own
// rejected-vs-unavailable split (which matters because a 4xx there is a
// REAL, definite verdict on a submitted transaction), there is no
// equivalent definite "this will never confirm" answer a read of `GET
// /tx/:txid` can ever give — a 404 may simply mean the transaction has not
// yet propagated to the queried node. Both cases already collapse to the
// identical `UNAVAILABLE` outcome one layer up, in anchoring/
// BitcoinAnchorConfirmationObserver.js, so this class does the same
// simplification anchoring/BitcoinOpReturnProofVerifier.js's own 404
// handling already made in 0.8.1, rather than inventing a distinction
// nothing downstream would ever use.
export class BitcoinEsploraTransactionConfirmationObserver {
    // `fetchImpl` is an injection point, not a convenience — see this
    // file's own header.
    constructor({ apiUrl = DEFAULT_API_URL, fetchImpl = null, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
        this._apiUrl = apiUrl.replace(/\/+$/, '');
        this._fetch = fetchImpl || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
        if (typeof this._fetch !== 'function') {
            throw new Error('BitcoinEsploraTransactionConfirmationObserver: no fetch implementation available — pass fetchImpl explicitly');
        }
        this._timeoutMs = timeoutMs;
    }

    get apiUrl() { return this._apiUrl; }

    // Resolves to exactly the `confirmationSource` shape anchoring/
    // BitcoinAnchorConfirmationObserver.js's own header documents. Never
    // throws — see this file's own header.
    async fetchConfirmation(txid) {
        let tx;
        try {
            tx = await this._fetchTx(txid);
        } catch (error) {
            return { found: false, reason: error.message };
        }
        if (tx === null) {
            return {
                found: false,
                reason: `transaction ${txid} was not found by ${this._apiUrl} — it may not have been broadcast, or has not yet propagated to this node`
            };
        }
        if (!tx.status || tx.status.confirmed !== true) {
            return { found: true, confirmed: false };
        }

        let confirmationCount;
        try {
            confirmationCount = await this._confirmations(tx.status.block_height);
        } catch (error) {
            return { found: false, reason: error.message };
        }

        return {
            found: true,
            confirmed: true,
            blockHash: typeof tx.status.block_hash === 'string' ? tx.status.block_hash : null,
            blockHeight: tx.status.block_height,
            confirmationCount
        };
    }

    async _fetchTx(txid) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this._timeoutMs);
        let response;
        try {
            response = await this._fetch(`${this._apiUrl}/tx/${txid}`, { signal: controller.signal });
        } catch (error) {
            throw new Error(`BitcoinEsploraTransactionConfirmationObserver: could not reach ${this._apiUrl} — ${error.message}`);
        } finally {
            clearTimeout(timer);
        }
        if (response.status === 404) return null;
        if (!response.ok) {
            throw new Error(`BitcoinEsploraTransactionConfirmationObserver: ${this._apiUrl} returned ${response.status} for tx ${txid}`);
        }
        try {
            return await response.json();
        } catch (error) {
            throw new Error(`BitcoinEsploraTransactionConfirmationObserver: could not parse ${this._apiUrl}'s transaction response — ${error.message}`);
        }
    }

    async _confirmations(blockHeight) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this._timeoutMs);
        let response;
        try {
            response = await this._fetch(`${this._apiUrl}/blocks/tip/height`, { signal: controller.signal });
        } catch (error) {
            throw new Error(`BitcoinEsploraTransactionConfirmationObserver: could not reach ${this._apiUrl} for tip height — ${error.message}`);
        } finally {
            clearTimeout(timer);
        }
        if (!response.ok) {
            throw new Error(`BitcoinEsploraTransactionConfirmationObserver: ${this._apiUrl} returned ${response.status} for tip height`);
        }
        const text = (await response.text()).trim();
        const tipHeight = Number.parseInt(text, 10);
        if (!Number.isFinite(tipHeight)) {
            throw new Error(`BitcoinEsploraTransactionConfirmationObserver: ${this._apiUrl} returned a non-numeric tip height`);
        }
        return tipHeight - blockHeight + 1;
    }
}
