// Uploads an image to a Steem image host (steemitimages.com by default), so a
// Steem post can show it: front ends don't show `data:` images, and the chain
// holds no files. The host accepts an upload signed with the account's posting
// key over "ImageSigningChallenge" followed by the image bytes, as Steemit's
// own editor does. Signing goes through Steem Keychain, which asks its user to
// approve it; ForkBuild never sees a key.

export const DEFAULT_STEEM_IMAGE_HOST = 'https://steemitimages.com';
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
export function createSteemKeychainImageSigner({ keychain = globalThis.steem_keychain, signingTimeoutMs = DEFAULT_SIGNING_TIMEOUT_MS } = {}) {
    if (!keychain || typeof keychain.requestSignBuffer !== 'function') return undefined;
    function sign(account, payload) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new SteemImageUploadError(`Steem Keychain did not answer within ${signingTimeoutMs / 1000} s`, { stage: 'signing' }));
            }, signingTimeoutMs);
            keychain.requestSignBuffer(account, payload, 'Posting', (response) => {
                clearTimeout(timer);
                if (!response?.success || typeof response.result !== 'string') {
                    reject(new SteemImageUploadError(response?.message || response?.error || 'Steem Keychain refused to sign the image', { stage: 'signing', response }));
                    return;
                }
                resolve(response.result);
            });
        });
    }
    return Object.freeze({ sign });
}

// Signs and uploads `bytes` (a Uint8Array) as `account`; resolves to
// `{ url, signature }`. Rejects with a SteemImageUploadError naming the step
// that failed.
export async function uploadSteemImage({
    account, bytes, mediaType = 'image/png', fileName = 'forkbuild.png',
    signer, host = DEFAULT_STEEM_IMAGE_HOST, fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_UPLOAD_TIMEOUT_MS
}) {
    if (!signer || typeof signer.sign !== 'function') throw new SteemImageUploadError('Steem Keychain is needed to sign the image upload.', { stage: 'signing' });
    if (!(bytes instanceof Uint8Array) || bytes.length === 0) throw new TypeError('uploadSteemImage: bytes must be a non-empty Uint8Array');
    const signature = await signer.sign(account, steemImageSigningPayload(bytes));
    // Hex, as it goes into the upload URL (130 characters for Steem's
    // 65-byte signatures).
    if (typeof signature !== 'string' || !/^[0-9a-f]+$/i.test(signature)) {
        throw new SteemImageUploadError(`Steem Keychain returned a signature ForkBuild doesn't recognize (${String(signature).slice(0, 20)}…)`, { stage: 'signing' });
    }

    const form = new FormData();
    form.append('file', new Blob([bytes], { type: mediaType }), fileName);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
        response = await fetchImpl(`${host.replace(/\/+$/, '')}/${encodeURIComponent(account)}/${signature}`, { method: 'POST', body: form, signal: controller.signal });
    } catch (error) {
        throw new SteemImageUploadError(controller.signal.aborted
            ? `The image host did not answer within ${timeoutMs / 1000} s.`
            : `The browser could not reach the image host, or it does not accept uploads from this site (${error.message}).`, { stage: 'upload' });
    } finally {
        clearTimeout(timer);
    }
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
    return Object.freeze({ url: body.url, signature });
}
