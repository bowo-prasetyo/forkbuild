// Broadcasts Steem operations through the Steem Keychain browser extension,
// which holds the key and asks its user to approve each transaction.
// ForkBuild never sees a Steem key.

// Long enough for a person to read and approve Keychain's popup.
const DEFAULT_SIGNING_TIMEOUT_MS = 120000;

export class SteemBroadcastError extends Error {
    constructor(message, response) {
        super(message);
        this.name = 'SteemBroadcastError';
        this.response = response;
    }
}

// Returns undefined when no Keychain is injected, so a caller can say
// "install Steem Keychain" rather than fail later. Blurt Keychain offers the
// same interface (blurt/BlurtKeychain.js), named by `walletName`.
export function createSteemKeychainBroadcaster({ keychain = globalThis.steem_keychain, signingTimeoutMs = DEFAULT_SIGNING_TIMEOUT_MS, walletName = 'Steem Keychain' } = {}) {
    if (!keychain || typeof keychain.requestBroadcast !== 'function') return undefined;

    function broadcast(account, operations, keyType = 'Posting') {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new SteemBroadcastError(`${walletName} did not answer within ${signingTimeoutMs / 1000} s`));
            }, signingTimeoutMs);
            keychain.requestBroadcast(account, operations, keyType, (response) => {
                clearTimeout(timer);
                if (!response?.success) {
                    reject(new SteemBroadcastError(response?.message || response?.error || `${walletName} refused the broadcast`, response));
                    return;
                }
                resolve(Object.freeze({
                    transactionId: response.result?.id ?? null,
                    blockNum: response.result?.block_num ?? null
                }));
            });
        });
    }

    return Object.freeze({ broadcast });
}
