const DEFAULT_API_URL = 'https://blockstream.info/api';
const DEFAULT_TIMEOUT_MS = 8000;

// 0.8.60 — Explicit Bitcoin Anchor Funding & Address Preparation.
//
// The concrete `fundingSource` anchoring/BitcoinWalletFundingObserver.js
// injects to actually reach the network — an adapter, not a widening of the
// domain class, the identical split anchoring/
// BitcoinEsploraTransactionConfirmationObserver.js (0.8.54) and anchoring/
// BitcoinEsploraTransactionBroadcaster.js (0.8.52) already established for
// their own domain classes. Talks to the SAME family of Esplora-compatible
// block explorer HTTP APIs this codebase already trusts for reading Bitcoin
// state — `GET /address/:address/utxo`, a real, publicly documented
// endpoint (Blockstream's own Esplora, mempool.space, or any self-hosted
// Esplora node) returning exactly the unspent outputs currently held at an
// address, each with its own `value` (satoshis) and confirmation `status` —
// this class shares no code with any other Esplora adapter in this
// codebase, exactly as each of those stays self-contained already, but
// answers a DIFFERENT question than either: not "was this transaction
// accepted" (BitcoinEsploraTransactionBroadcaster) and not "is this
// transaction confirmed" (BitcoinEsploraTransactionConfirmationObserver),
// but "what can this address currently spend."
//
// `fetchImpl` is the identical injection point every Esplora adapter in
// this codebase already established, for the identical reason: tests/
// BitcoinWalletFundingPreparation.test.js supplies a fake one, so this
// file's own wire behavior is fully covered without ever making a real
// network call.
//
// SPEAKS EXACTLY THE `fundingSource` PROTOCOL anchoring/
// BitcoinWalletFundingObserver.js's own header already documents —
// `fetchUtxos(account) -> { found: true, utxos: [{ txid, vout, valueSats,
// confirmed }, ...] } | { found: false [, reason] }`. This class never
// returns anything else, and NEVER THROWS — every failure it can
// distinguish (an unreachable host, a non-2xx response, an unparseable or
// malformed body) is translated into the `found: false` form, mirroring
// exactly how anchoring/BitcoinEsploraTransactionConfirmationObserver.js's
// own `fetchConfirmation()` never throws either.
//
// AN ADDRESS WITH NO SPENDABLE OUTPUT IS A REAL, EMPTY ANSWER, NEVER
// "NOT FOUND." Esplora's own `/address/:address/utxo` endpoint returns `[]`
// — HTTP 200 — for an address that simply holds nothing right now, never a
// 404 the way `GET /tx/:txid` does for a transaction that may not have
// propagated yet. This class reports that the honest way: `{ found: true,
// utxos: [] }`, which anchoring/BitcoinWalletFundingObserver.js's own
// header already names as a real OBSERVED outcome, never UNAVAILABLE.
export class BitcoinEsploraWalletFundingSource {
    // `fetchImpl` is an injection point, not a convenience — see this
    // file's own header.
    constructor({ apiUrl = DEFAULT_API_URL, fetchImpl = null, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
        this._apiUrl = apiUrl.replace(/\/+$/, '');
        this._fetch = fetchImpl || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
        if (typeof this._fetch !== 'function') {
            throw new Error('BitcoinEsploraWalletFundingSource: no fetch implementation available — pass fetchImpl explicitly');
        }
        this._timeoutMs = timeoutMs;
    }

    get apiUrl() { return this._apiUrl; }

    // Resolves to exactly the `fundingSource` shape anchoring/
    // BitcoinWalletFundingObserver.js's own header documents. Never throws
    // — see this file's own header.
    async fetchUtxos(account) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this._timeoutMs);
        let response;
        try {
            response = await this._fetch(`${this._apiUrl}/address/${encodeURIComponent(account)}/utxo`, { signal: controller.signal });
        } catch (error) {
            return { found: false, reason: `BitcoinEsploraWalletFundingSource: could not reach ${this._apiUrl} — ${error.message}` };
        } finally {
            clearTimeout(timer);
        }

        if (!response.ok) {
            return { found: false, reason: `BitcoinEsploraWalletFundingSource: ${this._apiUrl} returned ${response.status} for account ${account}` };
        }

        let body;
        try {
            body = await response.json();
        } catch (error) {
            return { found: false, reason: `BitcoinEsploraWalletFundingSource: could not parse ${this._apiUrl}'s UTXO response — ${error.message}` };
        }
        if (!Array.isArray(body)) {
            return { found: false, reason: `BitcoinEsploraWalletFundingSource: ${this._apiUrl} returned a non-array UTXO response` };
        }

        const utxos = [];
        for (const entry of body) {
            if (!entry || typeof entry.txid !== 'string' || !Number.isInteger(entry.vout) || !Number.isInteger(entry.value)) {
                return { found: false, reason: `BitcoinEsploraWalletFundingSource: ${this._apiUrl} reported a malformed UTXO entry for account ${account}` };
            }
            utxos.push({
                txid: entry.txid,
                vout: entry.vout,
                valueSats: entry.value,
                confirmed: !!(entry.status && entry.status.confirmed === true)
            });
        }

        return { found: true, utxos };
    }
}
