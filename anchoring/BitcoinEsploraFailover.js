import { ProofVerifier } from './ProofVerifier.js';
import { BitcoinOpReturnProofVerifier } from './BitcoinOpReturnProofVerifier.js';
import { BitcoinEsploraTransactionBroadcaster } from './BitcoinEsploraTransactionBroadcaster.js';
import { BitcoinEsploraTransactionConfirmationObserver } from './BitcoinEsploraTransactionConfirmationObserver.js';
import { BitcoinEsploraWalletFundingSource } from './BitcoinEsploraWalletFundingSource.js';

// Failover across several Esplora endpoints (core/BitcoinEsploraConfiguration.js's
// `apiUrls`), one wrapper per Esplora adapter. Each wrapper speaks exactly
// the protocol of the adapter it wraps, builds one of those adapters per
// endpoint, and asks them in order:
//
//   proof verifier      the first answer that isn't `unavailable` (valid, or
//                       a definite rejection) wins.
//   broadcaster         the first answer that isn't `unavailable` (accepted,
//                       or a definite rejection) wins. A 4xx rejection is the
//                       node's verdict on the transaction itself, which every
//                       node would give, so it is never retried elsewhere.
//   confirmation        the first `found: true` answer wins.
//   funding source      the first `found: true` answer wins.
//
// When no endpoint gives such an answer, the result is the adapter's own
// unavailable / not-found shape, with every endpoint's reason joined in
// order. Like the adapters, none of these ever throws for a network
// failure.

function combinedReason(results) {
    return results.map((result) => result.reason).filter(Boolean).join('; ');
}

function requireApiUrls(name, apiUrls) {
    if (!Array.isArray(apiUrls) || apiUrls.length === 0) {
        throw new Error(`${name}: a non-empty apiUrls array is required`);
    }
}

export class BitcoinOpReturnProofVerifierFailover extends ProofVerifier {
    constructor({ apiUrls, ...options } = {}) {
        super();
        requireApiUrls('BitcoinOpReturnProofVerifierFailover', apiUrls);
        this._verifiers = apiUrls.map((apiUrl) => new BitcoinOpReturnProofVerifier({ ...options, apiUrl }));
    }

    get anchorType() { return this._verifiers[0].anchorType; }
    get apiUrl() { return this._verifiers[0].apiUrl; }
    get apiUrls() { return this._verifiers.map((verifier) => verifier.apiUrl); }
    get network() { return this._verifiers[0].network; }

    async verify(proof, context) {
        const results = [];
        for (const verifier of this._verifiers) {
            const result = await verifier.verify(proof, context);
            if (!result.unavailable) return result;
            results.push(result);
        }
        return { valid: false, unavailable: true, reason: combinedReason(results) };
    }
}

export class BitcoinEsploraTransactionBroadcasterFailover {
    constructor({ apiUrls, ...options } = {}) {
        requireApiUrls('BitcoinEsploraTransactionBroadcasterFailover', apiUrls);
        this._broadcasters = apiUrls.map((apiUrl) => new BitcoinEsploraTransactionBroadcaster({ ...options, apiUrl }));
    }

    get apiUrl() { return this._broadcasters[0].apiUrl; }
    get apiUrls() { return this._broadcasters.map((broadcaster) => broadcaster.apiUrl); }

    async broadcast(rawTransactionHex) {
        const results = [];
        for (const broadcaster of this._broadcasters) {
            const result = await broadcaster.broadcast(rawTransactionHex);
            if (!result.unavailable) return result;
            results.push(result);
        }
        return { broadcast: false, unavailable: true, reason: combinedReason(results) };
    }
}

export class BitcoinEsploraTransactionConfirmationObserverFailover {
    constructor({ apiUrls, ...options } = {}) {
        requireApiUrls('BitcoinEsploraTransactionConfirmationObserverFailover', apiUrls);
        this._observers = apiUrls.map((apiUrl) => new BitcoinEsploraTransactionConfirmationObserver({ ...options, apiUrl }));
    }

    get apiUrl() { return this._observers[0].apiUrl; }
    get apiUrls() { return this._observers.map((observer) => observer.apiUrl); }

    async fetchConfirmation(txid) {
        const results = [];
        for (const observer of this._observers) {
            const result = await observer.fetchConfirmation(txid);
            if (result.found) return result;
            results.push(result);
        }
        return { found: false, reason: combinedReason(results) };
    }
}

export class BitcoinEsploraWalletFundingSourceFailover {
    constructor({ apiUrls, ...options } = {}) {
        requireApiUrls('BitcoinEsploraWalletFundingSourceFailover', apiUrls);
        this._sources = apiUrls.map((apiUrl) => new BitcoinEsploraWalletFundingSource({ ...options, apiUrl }));
    }

    get apiUrl() { return this._sources[0].apiUrl; }
    get apiUrls() { return this._sources.map((source) => source.apiUrl); }

    async fetchUtxos(account) {
        const results = [];
        for (const source of this._sources) {
            const result = await source.fetchUtxos(account);
            if (result.found) return result;
            results.push(result);
        }
        return { found: false, reason: combinedReason(results) };
    }
}
