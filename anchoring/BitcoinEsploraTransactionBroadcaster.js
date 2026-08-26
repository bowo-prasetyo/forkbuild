const DEFAULT_API_URL = 'https://blockstream.info/api';
const DEFAULT_TIMEOUT_MS = 8000;

// 0.8.52 — Bitcoin Anchor Transaction Broadcasting.
//
// The concrete `broadcaster` anchoring/BitcoinAnchorTransactionBroadcaster.js
// injects to actually reach the network — an adapter, not a widening of
// the domain class. anchoring/BitcoinOpReturnProofVerifier.js (0.8.1)
// already talks to an Esplora-compatible block explorer for READING; this
// class talks to the identical family of servers for the one write
// operation Esplora exposes: `POST /tx`, body the raw transaction as hex,
// response the accepted txid as plain text on success, or an error message
// on failure. Same public instance (Blockstream's own, mempool.space, or
// any self-hosted Esplora node), same `fetchImpl` injection point
// content/IpfsContentStore.js and anchoring/BitcoinOpReturnProofVerifier.js
// already established, for the identical reason: tests/
// BitcoinEsploraTransactionBroadcaster.test.js supplies a fake one, so this
// file's own wire behavior is fully covered without ever making a real
// network call, and without this codebase ever broadcasting a real
// transaction as a side effect of its own test suite.
//
// SPEAKS EXACTLY THE `broadcaster` PROTOCOL anchoring/
// BitcoinAnchorTransactionBroadcaster.js's own header already documents —
// `broadcast(rawTransactionHex) -> { broadcast: true, txid } |
// { broadcast: false, reason } | { broadcast: false, unavailable: true,
// reason }`. This class never returns anything else, and never throws for
// an HTTP-level failure — every such failure is translated into the
// `unavailable` form, exactly as anchoring/BitcoinOpReturnProofVerifier.js
// already translates its own network failures.
//
// HTTP STATUS DECIDES REJECTED VERSUS UNAVAILABLE, NEVER GUESSED AT. A
// 2xx response is acceptance. A 4xx response means Esplora's own
// `sendrawtransaction` parsed the request and gave a definite verdict on
// THIS transaction (non-standard, missing inputs, already spent, fee too
// low) — reported as a rejection, never "maybe try again." A 5xx response,
// a network failure, a timeout, or an unparseable response body all mean
// this class cannot presently tell what happened — reported as
// `unavailable`, never a rejection — the identical confirmed/unavailable/
// rejected split anchoring/BitcoinOpReturnProofVerifier.js already holds
// for reading.
export class BitcoinEsploraTransactionBroadcaster {
    // `fetchImpl` is an injection point, not a convenience — see this
    // file's own header.
    constructor({ apiUrl = DEFAULT_API_URL, fetchImpl = null, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
        this._apiUrl = apiUrl.replace(/\/+$/, '');
        this._fetch = fetchImpl || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
        if (typeof this._fetch !== 'function') {
            throw new Error('BitcoinEsploraTransactionBroadcaster: no fetch implementation available — pass fetchImpl explicitly');
        }
        this._timeoutMs = timeoutMs;
    }

    get apiUrl() { return this._apiUrl; }

    // Resolves to exactly the `broadcaster` shape anchoring/
    // BitcoinAnchorTransactionBroadcaster.js's own header documents. Never
    // throws — every failure this class can distinguish is translated into
    // that shape's own `unavailable`/rejection split.
    async broadcast(rawTransactionHex) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this._timeoutMs);
        let response;
        try {
            response = await this._fetch(`${this._apiUrl}/tx`, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: rawTransactionHex,
                signal: controller.signal
            });
        } catch (error) {
            return { broadcast: false, unavailable: true, reason: `BitcoinEsploraTransactionBroadcaster: could not reach ${this._apiUrl} — ${error.message}` };
        } finally {
            clearTimeout(timer);
        }

        let bodyText;
        try {
            bodyText = (await response.text()).trim();
        } catch (error) {
            return { broadcast: false, unavailable: true, reason: `BitcoinEsploraTransactionBroadcaster: could not read ${this._apiUrl}'s response — ${error.message}` };
        }

        if (response.ok) {
            return { broadcast: true, txid: bodyText };
        }
        if (response.status >= 500) {
            return { broadcast: false, unavailable: true, reason: `BitcoinEsploraTransactionBroadcaster: ${this._apiUrl} returned ${response.status} — ${bodyText || 'no further detail'}` };
        }
        // A 4xx: the endpoint parsed the request and gave a definite
        // verdict on this exact transaction — see this file's own header.
        return { broadcast: false, reason: `BitcoinEsploraTransactionBroadcaster: transaction rejected by ${this._apiUrl} — ${bodyText || `HTTP ${response.status}`}` };
    }
}
