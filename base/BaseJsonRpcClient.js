const DEFAULT_RPC_URL = 'https://mainnet.base.org';
const DEFAULT_TIMEOUT_MS = 8000;
const HEX_QUANTITY_PATTERN = /^0x[0-9a-fA-F]+$/;

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
// SIX METHODS ARE WRAPPED, AND NO OTHERS. 0.8.90 shipped exactly
// `eth_chainId`/`eth_getBalance`, read-only observation of a chain and an
// account. 0.8.91 adds exactly the four further reads a transaction PLAN
// needs to construct itself — `eth_getTransactionCount`, `eth_estimateGas`,
// `eth_gasPrice`, `eth_maxPriorityFeePerGas` — and stops there. Still
// never `eth_sendRawTransaction`, still never `eth_getBlockByNumber`, and
// still no other method Base's JSON-RPC surface exposes: every method
// this class wraps reads a fact, and not one of them submits, signs, or
// commits anything. See this file's own constructor for why nothing
// resembling a write path exists here to even accidentally call. Wrapping
// `eth_sendRawTransaction` remains real, separately sized future work for
// whichever later milestone actually broadcasts (see docs/Roadmap.md,
// 0.8.91, "What I would explicitly exclude").
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
//
// NEVER THROWS. Every failure this class can distinguish — an unreachable
// host, a timeout, a non-2xx response, a JSON-RPC error object, or an
// unparseable/malformed quantity — is translated into the `available:
// false` form, mirroring exactly how every Esplora adapter in this
// codebase's anchoring/ layer already never throws for an operational
// failure.
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
            return { ok: false, reason: `BaseJsonRpcClient: could not reach ${this._rpcUrl} — ${error.message}` };
        } finally {
            clearTimeout(timer);
        }

        if (!response.ok) {
            return { ok: false, reason: `BaseJsonRpcClient: ${this._rpcUrl} returned ${response.status} for ${method}` };
        }

        let body;
        try {
            body = await response.json();
        } catch (error) {
            return { ok: false, reason: `BaseJsonRpcClient: could not parse ${this._rpcUrl}'s ${method} response — ${error.message}` };
        }
        if (!body || typeof body !== 'object') {
            return { ok: false, reason: `BaseJsonRpcClient: ${this._rpcUrl} returned a non-object ${method} response` };
        }
        if (body.error) {
            const message = (body.error && typeof body.error.message === 'string' && body.error.message) || 'unknown RPC error';
            return { ok: false, reason: `BaseJsonRpcClient: ${this._rpcUrl} reported an error for ${method} — ${message}` };
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
