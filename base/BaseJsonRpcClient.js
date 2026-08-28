const DEFAULT_RPC_URL = 'https://mainnet.base.org';
const DEFAULT_TIMEOUT_MS = 8000;
const HEX_QUANTITY_PATTERN = /^0x[0-9a-fA-F]+$/;

// 0.8.90 — Explicit Base Network & Account Observation.
//
// The concrete, read-only `rpcSource` base/BaseNetworkObserver.js injects
// to actually reach the network — an adapter, not a widening of the
// domain class, the identical split anchoring/
// BitcoinEsploraWalletFundingSource.js (0.8.60) already established for
// its own domain observer, one chain over. Talks to Base's own public
// JSON-RPC endpoint (`https://mainnet.base.org`, documented at
// https://docs.base.org/base-chain/quickstart/connecting-to-base) using
// the standard Ethereum JSON-RPC methods Base itself documents supporting.
//
// EXACTLY TWO METHODS ARE WRAPPED, AND NO OTHERS. `eth_chainId` and
// `eth_getBalance` are the only RPC calls this class makes — never
// `eth_sendRawTransaction`, `eth_estimateGas`, `eth_getBlockByNumber`, or
// any other method Base's JSON-RPC surface exposes. This milestone is
// read-only observation; see this file's own constructor for why nothing
// resembling a write path exists here to even accidentally call. Wrapping
// a further method is real, separately sized future work for whichever
// milestone actually needs it.
//
// `fetchImpl` is the identical injection point every HTTP-speaking adapter
// in this codebase already establishes (anchoring/
// BitcoinEsploraWalletFundingSource.js, anchoring/
// BitcoinEsploraTransactionBroadcaster.js, anchoring/
// BitcoinEsploraTransactionConfirmationObserver.js) — tests/
// BaseNetworkObservation.test.js supplies a fake one, so this file's own
// wire behavior is fully covered without ever making a real network call.
//
// SPEAKS EXACTLY THE `rpcSource` PROTOCOL base/BaseNetworkObserver.js's own
// header documents:
//
//   fetchChainId() -> { available: true, chainId }
//                    | { available: false, reason }
//   fetchBalance(address) -> { available: true, balanceWei }
//                    | { available: false, reason }
//
// NEVER THROWS. Every failure this class can distinguish — an unreachable
// host, a timeout, a non-2xx response, a JSON-RPC error object, or an
// unparseable/malformed quantity — is translated into the `available:
// false` form, mirroring exactly how every Esplora adapter in this
// codebase's anchoring/ layer already never throws for an operational
// failure.
//
// `balanceWei` IS ALWAYS A DECIMAL-DIGIT STRING, NEVER A NUMBER. See
// application/BaseAccountObservation.js's own header, "WHY A STRING,
// NEVER A NUMBER" — the RPC's own `0x...` hex quantity is decoded through
// `BigInt`, then rendered back out as base-10 digits, never passed through
// a floating-point `Number` at any point in this file.
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
