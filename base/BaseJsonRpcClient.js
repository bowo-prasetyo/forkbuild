const DEFAULT_RPC_URL = 'https://mainnet.base.org';
const DEFAULT_TIMEOUT_MS = 8000;
const HEX_QUANTITY_PATTERN = /^0x[0-9a-fA-F]+$/;
const TX_HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;

// 0.8.90 — Explicit Base Network & Account Observation.
// 0.8.91 — Explicit Base Publication Transaction Construction.
//
// The concrete, read-only `rpcSource` base/BaseNetworkObserver.js and
// base/BasePublicationTransactionPlanner.js each inject to actually reach
// the network — an adapter, not a widening of either domain class, the
// identical split anchoring/BitcoinEsploraWalletFundingSource.js (0.8.60)
// already established for its own domain observer, one chain over. Talks
// to Base's own public JSON-RPC endpoint (`https://mainnet.base.org`,
// documented at https://docs.base.org/base-chain/quickstart/connecting-to-base)
// using the standard Ethereum JSON-RPC methods Base itself documents
// supporting.
//
// SEVEN METHODS ARE WRAPPED, AND NO OTHERS. 0.8.90 shipped exactly
// `eth_chainId`/`eth_getBalance`, read-only observation of a chain and an
// account. 0.8.91 added exactly the four further reads a transaction PLAN
// needs to construct itself — `eth_getTransactionCount`, `eth_estimateGas`,
// `eth_gasPrice`, `eth_maxPriorityFeePerGas`. 0.8.95 adds exactly ONE write
// — `eth_sendRawTransaction` — and stops there. Still never
// `eth_getTransactionReceipt`, still never `eth_getBlockByNumber`, and
// still no other method Base's JSON-RPC surface exposes: the six read
// methods still read a fact, and `broadcastRawTransaction()` still does
// nothing but submit the exact bytes it is handed — no receipt retrieval,
// no polling, no confirmation logic of any kind (see docs/Roadmap.md,
// 0.8.95, "What I would deliberately exclude"). See this file's own
// constructor for why nothing resembling a fee-bump or replacement path
// exists here to even accidentally call.
//
// `fetchImpl` is the identical injection point every HTTP-speaking adapter
// in this codebase already establishes (anchoring/
// BitcoinEsploraWalletFundingSource.js, anchoring/
// BitcoinEsploraTransactionBroadcaster.js, anchoring/
// BitcoinEsploraTransactionConfirmationObserver.js) — tests/
// BaseNetworkObservation.test.js and tests/
// BasePublicationTransactionConstruction.test.js each supply a fake one,
// so this file's own wire behavior is fully covered without ever making a
// real network call.
//
// SPEAKS EXACTLY THE `rpcSource` PROTOCOLS base/BaseNetworkObserver.js's
// own header and base/BasePublicationTransactionPlanner.js's own header
// each document:
//
//   fetchChainId() -> { available: true, chainId }
//                    | { available: false, reason }
//   fetchBalance(address) -> { available: true, balanceWei }
//                    | { available: false, reason }
//   fetchTransactionCount(address) -> { available: true, nonce }
//                    | { available: false, reason }
//   fetchGasEstimate({ from, to, value, data }) -> { available: true, gasLimit }
//                    | { available: false, reason }
//   fetchGasPrice() -> { available: true, gasPriceWei }
//                    | { available: false, reason }
//   fetchMaxPriorityFeePerGas() -> { available: true, maxPriorityFeePerGasWei }
//                    | { available: false, reason }
//   broadcastRawTransaction(rawTransaction) -> { broadcasted: true, txid }
//                    | { broadcasted: false, reason }
//                        — the endpoint was reached and returned a definite
//                          JSON-RPC error object: a DEFINITE no.
//                    | { broadcasted: false, unavailable: true, reason }
//                        — cannot PRESENTLY tell: unreachable, a timeout, a
//                          non-2xx response, or a malformed result.
//
// NEVER THROWS. Every failure this class can distinguish — an unreachable
// host, a timeout, a non-2xx response, a JSON-RPC error object, or an
// unparseable/malformed quantity — is translated into the `available:
// false` (or, for `broadcastRawTransaction()`, `broadcasted: false`) form,
// mirroring exactly how every Esplora adapter in this codebase's
// anchoring/ layer already never throws for an operational failure.
//
// `broadcastRawTransaction()` DISTINGUISHES A DEFINITE RPC REJECTION FROM
// MERE UNAVAILABILITY — THE SIX READ METHODS NEVER NEEDED TO. Every read
// method above collapses ANY failure into one `available: false` shape,
// because no caller of a read has ever needed to tell "the endpoint said
// no" apart from "the endpoint couldn't be reached" — a failed read is
// simply retried. A broadcast is different: `base/
// BaseTransactionBroadcaster.js` (0.8.95) must tell a DEFINITE rejection
// (never safe to silently resubmit without a person's own explicit
// decision) apart from not presently being able to tell (safe to retry).
// So, and only for this one method, `_call()`'s own `rpcError` flag —
// set only when the endpoint was actually reached and returned a real
// JSON-RPC `error` object — is read and surfaced as the `unavailable`
// distinction below. Every other failure this class can observe for a
// broadcast — unreachable, timeout, non-2xx, or a malformed/missing
// result even on an `ok` response — is `unavailable: true`, never a
// rejection.
//
// EVERY WEI-DENOMINATED QUANTITY IS ALWAYS A DECIMAL-DIGIT STRING, NEVER
// A NUMBER. See application/BaseAccountObservation.js's own header, "WHY
// A STRING, NEVER A NUMBER" — `balanceWei`, `gasPriceWei`, and
// `maxPriorityFeePerGasWei` are each decoded from the RPC's own `0x...`
// hex quantity through `BigInt`, then rendered back out as base-10
// digits, never passed through a floating-point `Number` at any point in
// this file. `nonce` and `gasLimit` are the two exceptions, decoded as
// plain integers exactly like `chainId` already is — a transaction count
// and a gas limit are both bounded values (a real nonce never approaches
// `Number.MAX_SAFE_INTEGER`; Base's own block gas limit is a small
// fraction of it), so `decodeHexQuantityToInt`'s own overflow check below
// is a genuine safety net here, never a silent precision loss.
export class BaseJsonRpcClient {
    // `fetchImpl` is an injection point, not a convenience — see this
    // file's own header.
    constructor({ rpcUrl = DEFAULT_RPC_URL, fetchImpl = null, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
        if (typeof rpcUrl !== 'string' || !rpcUrl.trim()) {
            throw new Error('BaseJsonRpcClient: rpcUrl must be a non-empty string');
        }
        this._rpcUrl = rpcUrl;
        this._fetch = fetchImpl || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
        if (typeof this._fetch !== 'function') {
            throw new Error('BaseJsonRpcClient: no fetch implementation available — pass fetchImpl explicitly');
        }
        this._timeoutMs = timeoutMs;
    }

    get rpcUrl() { return this._rpcUrl; }

    // Resolves to { available: true, chainId } | { available: false, reason }.
    // Never throws — see this file's own header.
    async fetchChainId() {
        const result = await this._call('eth_chainId', []);
        if (!result.ok) return { available: false, reason: result.reason };

        const chainId = decodeHexQuantityToInt(result.value);
        if (chainId === null) {
            return { available: false, reason: `${this._rpcUrl} returned a malformed eth_chainId result` };
        }
        return { available: true, chainId };
    }

    // Resolves to { available: true, balanceWei } | { available: false, reason }.
    // Never throws — see this file's own header.
    async fetchBalance(address) {
        const result = await this._call('eth_getBalance', [address, 'latest']);
        if (!result.ok) return { available: false, reason: result.reason };

        const balanceWei = decodeHexQuantityToDecimalString(result.value);
        if (balanceWei === null) {
            return { available: false, reason: `${this._rpcUrl} returned a malformed eth_getBalance result for ${address}` };
        }
        return { available: true, balanceWei };
    }

    // 0.8.91 — Explicit Base Publication Transaction Construction.
    //
    // Resolves to { available: true, nonce } | { available: false, reason }.
    // `nonce` is the account's next transaction count — a plain integer,
    // exactly like `chainId` above. Never throws — see this file's own
    // header.
    async fetchTransactionCount(address) {
        const result = await this._call('eth_getTransactionCount', [address, 'latest']);
        if (!result.ok) return { available: false, reason: result.reason };

        const nonce = decodeHexQuantityToInt(result.value);
        if (nonce === null) {
            return { available: false, reason: `${this._rpcUrl} returned a malformed eth_getTransactionCount result for ${address}` };
        }
        return { available: true, nonce };
    }

    // 0.8.91 — Explicit Base Publication Transaction Construction.
    //
    // Resolves to { available: true, gasLimit } | { available: false, reason }.
    // `from`/`to` are addresses; `value`/`data` are already 0x-prefixed hex
    // strings — this class performs no encoding of its own, mirroring
    // exactly how `fetchBalance()` above passes `address` straight
    // through. Never throws — see this file's own header.
    async fetchGasEstimate({ from, to, value, data }) {
        const result = await this._call('eth_estimateGas', [{ from, to, value, data }]);
        if (!result.ok) return { available: false, reason: result.reason };

        const gasLimit = decodeHexQuantityToInt(result.value);
        if (gasLimit === null) {
            return { available: false, reason: `${this._rpcUrl} returned a malformed eth_estimateGas result` };
        }
        return { available: true, gasLimit };
    }

    // 0.8.91 — Explicit Base Publication Transaction Construction.
    //
    // Resolves to { available: true, gasPriceWei } | { available: false, reason }.
    // `gasPriceWei` is a decimal-digit STRING — see this file's own header,
    // "EVERY WEI-DENOMINATED QUANTITY." Never throws — see this file's own
    // header.
    async fetchGasPrice() {
        const result = await this._call('eth_gasPrice', []);
        if (!result.ok) return { available: false, reason: result.reason };

        const gasPriceWei = decodeHexQuantityToDecimalString(result.value);
        if (gasPriceWei === null) {
            return { available: false, reason: `${this._rpcUrl} returned a malformed eth_gasPrice result` };
        }
        return { available: true, gasPriceWei };
    }

    // 0.8.91 — Explicit Base Publication Transaction Construction.
    //
    // Resolves to { available: true, maxPriorityFeePerGasWei } | { available: false, reason }.
    // `maxPriorityFeePerGasWei` is a decimal-digit STRING — see this
    // file's own header, "EVERY WEI-DENOMINATED QUANTITY." Never throws —
    // see this file's own header.
    async fetchMaxPriorityFeePerGas() {
        const result = await this._call('eth_maxPriorityFeePerGas', []);
        if (!result.ok) return { available: false, reason: result.reason };

        const maxPriorityFeePerGasWei = decodeHexQuantityToDecimalString(result.value);
        if (maxPriorityFeePerGasWei === null) {
            return { available: false, reason: `${this._rpcUrl} returned a malformed eth_maxPriorityFeePerGas result` };
        }
        return { available: true, maxPriorityFeePerGasWei };
    }

    // 0.8.95 — Explicit Base Transaction Broadcast.
    //
    // Resolves to exactly one of:
    //
    //   { broadcasted: true, txid }
    //       — `txid` is exactly Base's own `eth_sendRawTransaction` result,
    //         unchanged — see this file's own header.
    //   { broadcasted: false, reason }
    //       — the endpoint was reached and returned a definite JSON-RPC
    //         error object (e.g. a rejected nonce, insufficient funds,
    //         "already known").
    //   { broadcasted: false, unavailable: true, reason }
    //       — cannot presently tell: unreachable, a timeout, a non-2xx
    //         response, or a response this class cannot make sense of.
    //
    // `rawTransaction` is submitted exactly as given — this method encodes
    // nothing, re-signs nothing, and never reads a nonce or a fee of its
    // own. Never throws — see this file's own header.
    async broadcastRawTransaction(rawTransaction) {
        const result = await this._call('eth_sendRawTransaction', [rawTransaction]);
        if (!result.ok) {
            return result.rpcError
                ? { broadcasted: false, reason: result.reason }
                : { broadcasted: false, unavailable: true, reason: result.reason };
        }

        if (typeof result.value !== 'string' || !TX_HASH_PATTERN.test(result.value)) {
            return { broadcasted: false, unavailable: true, reason: `${this._rpcUrl} returned a malformed eth_sendRawTransaction result` };
        }
        return { broadcasted: true, txid: result.value };
    }

    async _call(method, params) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this._timeoutMs);
        let response;
        try {
            response = await this._fetch(this._rpcUrl, {
                method: 'POST',
                signal: controller.signal,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
            });
        } catch (error) {
            return { ok: false, rpcError: false, reason: `BaseJsonRpcClient: could not reach ${this._rpcUrl} — ${error.message}` };
        } finally {
            clearTimeout(timer);
        }

        if (!response.ok) {
            return { ok: false, rpcError: false, reason: `BaseJsonRpcClient: ${this._rpcUrl} returned ${response.status} for ${method}` };
        }

        let body;
        try {
            body = await response.json();
        } catch (error) {
            return { ok: false, rpcError: false, reason: `BaseJsonRpcClient: could not parse ${this._rpcUrl}'s ${method} response — ${error.message}` };
        }
        if (!body || typeof body !== 'object') {
            return { ok: false, rpcError: false, reason: `BaseJsonRpcClient: ${this._rpcUrl} returned a non-object ${method} response` };
        }
        if (body.error) {
            // Reached, and DEFINITELY refused this call — see this file's
            // own header, "`broadcastRawTransaction()` DISTINGUISHES A
            // DEFINITE RPC REJECTION FROM MERE UNAVAILABILITY." The six
            // read methods above never read this flag; only
            // `broadcastRawTransaction()` does.
            const message = (body.error && typeof body.error.message === 'string' && body.error.message) || 'unknown RPC error';
            return { ok: false, rpcError: true, reason: `BaseJsonRpcClient: ${this._rpcUrl} reported an error for ${method} — ${message}` };
        }

        return { ok: true, value: body.result };
    }
}

function decodeHexQuantityToInt(value) {
    if (typeof value !== 'string' || !HEX_QUANTITY_PATTERN.test(value)) return null;
    try {
        const big = BigInt(value);
        if (big < 0n || big > BigInt(Number.MAX_SAFE_INTEGER)) return null;
        return Number(big);
    } catch (_error) {
        return null;
    }
}

function decodeHexQuantityToDecimalString(value) {
    if (typeof value !== 'string' || !HEX_QUANTITY_PATTERN.test(value)) return null;
    try {
        return BigInt(value).toString(10);
    } catch (_error) {
        return null;
    }
}
