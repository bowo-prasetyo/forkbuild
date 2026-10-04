// Uploads an image to a Steem image host (steemitimages.com by default), so a
// Steem post can show it: front ends don't show `data:` images, and the chain
// holds no files. The host accepts an upload signed with the account's posting
// key over "ImageSigningChallenge" followed by the image bytes, as Steemit's
// own editor does. Signing goes through Steem Keychain, which asks its user to
// approve it; ForkBuild never sees a key.
//
// Since its deployment of 2026-09-29, steemitimages.com sends no CORS headers,
// so browsers block uploads from any other site. The relay (the rendezvous
// worker's /steem-image route, server/rendezvous-worker/README.md) forwards
// the same signed upload from a server and answers with CORS headers. The
// host still checks the signature, so the relay can neither change the image
// nor upload as anyone.

export const DEFAULT_STEEM_IMAGE_HOST = 'https://steemitimages.com';
// The same worker as peer/RendezvousConfig.js's DEFAULT_RENDEZVOUS_URLS.
export const DEFAULT_STEEM_IMAGE_RELAY = 'https://forkbuild-rendezvous.prazjp.workers.dev/steem-image';
export const STEEM_IMAGE_SIGNING_PREFIX = 'ImageSigningChallenge';

const DEFAULT_SIGNING_TIMEOUT_MS = 120000;
const DEFAULT_UPLOAD_TIMEOUT_MS = 60000;

export class SteemImageUploadError extends Error {
    constructor(message, { stage, response = null } = {}) {
        super(message);
        this.name = 'SteemImageUploadError';
        // 'signing' or 'upload': which step failed.
        this.stage = stage;
        this.response = response;
    }
}

// What Keychain is asked to sign: the challenge prefix and the image bytes,
// as the JSON form of a Node Buffer, which Keychain turns back into bytes
// before signing their SHA-256.
export function steemImageSigningPayload(bytes) {
    const prefix = new TextEncoder().encode(STEEM_IMAGE_SIGNING_PREFIX);
    const data = new Array(prefix.length + bytes.length);
    for (let i = 0; i < prefix.length; i++) data[i] = prefix[i];
    for (let i = 0; i < bytes.length; i++) data[prefix.length + i] = bytes[i];
    return JSON.stringify({ type: 'Buffer', data });
}

// A signer over Steem Keychain's requestSignBuffer(), or undefined when no
// Keychain is injected. sign(account, payload) resolves to the signature, as
// hex.
export function createSteemKeychainImageSigner({ keychain = globalThis.steem_keychain, signingTimeoutMs = DEFAULT_SIGNING_TIMEOUT_MS, walletName = 'Steem Keychain' } = {}) {
    if (!keychain || typeof keychain.requestSignBuffer !== 'function') return undefined;
    function sign(account, payload) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new SteemImageUploadError(`${walletName} did not answer within ${signingTimeoutMs / 1000} s`, { stage: 'signing' }));
            }, signingTimeoutMs);
            keychain.requestSignBuffer(account, payload, 'Posting', (response) => {
                clearTimeout(timer);
                if (!response?.success || typeof response.result !== 'string') {
                    reject(new SteemImageUploadError(response?.message || response?.error || `${walletName} refused to sign the image`, { stage: 'signing', response }));
                    return;
                }
                resolve(response.result);
            });
        });
    }
    return Object.freeze({ sign });
}

// Signs and uploads `bytes` (a Uint8Array) as `account`; resolves to
// `{ url, signature, via }`, `via` being 'host' or 'relay'. Rejects with a
// SteemImageUploadError naming the step that failed. When the browser can't
// reach `host` (as when it blocks the request for want of CORS headers) and a
// `relay` is given, the same signed upload goes through the relay, which
// forwards it to its own image host (steemitimages.com for ForkBuild's).
export async function uploadSteemImage({
    account, bytes, mediaType = 'image/png', fileName = 'forkbuild.png',
    signer, host = DEFAULT_STEEM_IMAGE_HOST, relay = null, fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_UPLOAD_TIMEOUT_MS,
    walletName = 'Steem Keychain'
}) {
    if (!signer || typeof signer.sign !== 'function') throw new SteemImageUploadError(`${walletName} is needed to sign the image upload.`, { stage: 'signing' });
    if (!(bytes instanceof Uint8Array) || bytes.length === 0) throw new TypeError('uploadSteemImage: bytes must be a non-empty Uint8Array');
    const signature = await signer.sign(account, steemImageSigningPayload(bytes));
    // Hex, as it goes into the upload URL (130 characters for Steem's
    // 65-byte signatures).
    if (typeof signature !== 'string' || !/^[0-9a-f]+$/i.test(signature)) {
        throw new SteemImageUploadError(`${walletName} returned a signature ForkBuild doesn't recognize (${String(signature).slice(0, 20)}…)`, { stage: 'signing' });
    }
    const post = { account, signature, bytes, mediaType, fileName, fetchImpl, timeoutMs };
    let response;
    try {
        response = await postImage(host, post, 'the image host');
    } catch (error) {
        if (!relay || error.timedOut) throw error;
        try {
            return Object.freeze({ ...(await readUpload(await postImage(relay, post, 'the ForkBuild relay'))), signature, via: 'relay' });
        } catch (relayError) {
            throw new SteemImageUploadError(`${error.message} The ForkBuild relay failed too: ${relayError.message}`, { stage: 'upload', response: relayError.response ?? null });
        }
    }
    return Object.freeze({ ...(await readUpload(response)), signature, via: 'host' });
}

// POSTs the image to `<base>/<account>/<signature>`; resolves to the response,
// or rejects when there is none, naming `what` was asked.
async function postImage(base, { account, signature, bytes, mediaType, fileName, fetchImpl, timeoutMs }, what) {
    const form = new FormData();
    form.append('file', new Blob([bytes], { type: mediaType }), fileName);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetchImpl(`${base.replace(/\/+$/, '')}/${encodeURIComponent(account)}/${signature}`, { method: 'POST', body: form, signal: controller.signal });
    } catch (error) {
        const failure = new SteemImageUploadError(controller.signal.aborted
            ? `${capitalized(what)} did not answer within ${timeoutMs / 1000} s.`
            : `The browser could not reach ${what}, or it does not accept uploads from this site (${error.message}).`, { stage: 'upload' });
        failure.timedOut = controller.signal.aborted;
        throw failure;
    } finally {
        clearTimeout(timer);
    }
}

// The stored image's `{ url }` from the host's answer, or a rejection naming
// its reason.
async function readUpload(response) {
    let body = null;
    const text = await response.text().catch(() => '');
    try {
        body = JSON.parse(text);
    } catch {
        // Reported below with the text itself.
    }
    if (!response.ok || typeof body?.url !== 'string' || !/^https:\/\//.test(body.url)) {
        const reason = body?.error ?? (text.trim().slice(0, 200) || `HTTP ${response.status}`);
        throw new SteemImageUploadError(`The image host refused the upload: ${reason}`, { stage: 'upload', response: body ?? text });
    }
    return { url: body.url };
}

function capitalized(text) {
    return text.charAt(0).toUpperCase() + text.slice(1);
}
