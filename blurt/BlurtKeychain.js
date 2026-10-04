import { createSteemKeychainBroadcaster } from '../steem/SteemKeychainBroadcaster.js';
import { createSteemKeychainImageSigner, uploadSteemImage } from '../steem/SteemImageUpload.js';

// Blurt Keychain (and WhaleVault, which stands in for it) injects
// `blurt_keychain` with the same requestBroadcast and requestSignBuffer as
// Steem Keychain, so Blurt signs through the same code, with Blurt's names.
// ForkBuild never sees a Blurt key.

export const BLURT_WALLET_NAME = 'Blurt Keychain';
// The image host Blurt's own front end uploads to, with Steem's signed
// upload. There is no ForkBuild relay for it.
export const DEFAULT_BLURT_IMAGE_HOST = 'https://images.blurt.blog';

export function currentBlurtKeychain() {
    return globalThis.blurt_keychain;
}

// undefined when no Blurt Keychain is injected.
export function createBlurtKeychainBroadcaster({ keychain = currentBlurtKeychain(), signingTimeoutMs } = {}) {
    return createSteemKeychainBroadcaster({ keychain, signingTimeoutMs, walletName: BLURT_WALLET_NAME });
}

// Signs `bytes` through Blurt Keychain as `account` and uploads them to
// the Blurt image host; resolves to `{ url, signature, via }`.
export async function uploadBlurtImage({ account, bytes, keychain = currentBlurtKeychain(), host = DEFAULT_BLURT_IMAGE_HOST, fetchImpl, fileName }) {
    const signer = createSteemKeychainImageSigner({ keychain, walletName: BLURT_WALLET_NAME });
    return uploadSteemImage({ account, bytes, signer, host, relay: null, fetchImpl, fileName, walletName: BLURT_WALLET_NAME });
}
