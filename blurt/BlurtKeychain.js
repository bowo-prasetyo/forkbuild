import { createSteemKeychainBroadcaster } from '../steem/SteemKeychainBroadcaster.js';
import { createSteemKeychainImageSigner, uploadSteemImage } from '../steem/SteemImageUpload.js';

// Blurt Keychain (and WhaleVault, which stands in for it) injects
// `blurt_keychain` with the same requestBroadcast and requestSignBuffer as
// Steem Keychain, so Blurt signs through the same code, with Blurt's names.
// ForkBuild never sees a Blurt key.

export const BLURT_WALLET_NAME = 'Blurt Keychain';
// Where blurt.blog's own front end uploads images (its $STM_Config.upload_image,
// 2026-10-05), with Steem's signed upload. When the browser can't reach it, as
// when it accepts uploads only from blurt.blog, the same signed upload goes
// through the relay (the rendezvous worker's /blurt-image route,
// server/rendezvous-worker/README.md), which can neither change the image nor
// upload as anyone.
export const DEFAULT_BLURT_IMAGE_HOST = 'https://img-upload.blurt.blog';
// The same worker as peer/RendezvousConfig.js's DEFAULT_RENDEZVOUS_URLS.
export const DEFAULT_BLURT_IMAGE_RELAY = 'https://forkbuild-rendezvous.prazjp.workers.dev/blurt-image';

export function currentBlurtKeychain() {
    return globalThis.blurt_keychain;
}

// undefined when no Blurt Keychain is injected.
export function createBlurtKeychainBroadcaster({ keychain = currentBlurtKeychain(), signingTimeoutMs } = {}) {
    return createSteemKeychainBroadcaster({ keychain, signingTimeoutMs, walletName: BLURT_WALLET_NAME });
}

// Signs `bytes` through Blurt Keychain as `account` and uploads them to
// the Blurt image host, or through the relay when the browser can't reach
// it; resolves to `{ url, signature, via }`.
export async function uploadBlurtImage({ account, bytes, keychain = currentBlurtKeychain(), host = DEFAULT_BLURT_IMAGE_HOST, relay = DEFAULT_BLURT_IMAGE_RELAY, fetchImpl, fileName }) {
    const signer = createSteemKeychainImageSigner({ keychain, walletName: BLURT_WALLET_NAME });
    return uploadSteemImage({ account, bytes, signer, host, relay, fetchImpl, fileName, walletName: BLURT_WALLET_NAME });
}
