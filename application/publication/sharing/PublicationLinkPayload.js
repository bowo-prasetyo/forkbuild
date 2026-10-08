// A Publication carried inside a link (`#/s/<payload>`, core/ForkBuildAppLinks.js):
// its Signed Claim and its build's exact bytes, as JSON, compressed with
// deflate-raw and written as base64url behind a one-character format version.
// The payload is not trusted: whoever opens it checks the signature and the
// content hash as for a claim read from any network
// (application/publication/OpenPublicationLink.js).

const FORMAT_VERSION = '1';

// The longest payload a share link offers: about 500 bricks (the showcase
// castle's 127 take about 3,700 characters, the claim included). Email, most
// chat apps and social sites keep a link this long whole; a bigger build is
// shared through the networks instead. Discord (2,000 characters a message)
// and Telegram (4,096) refuse long messages sooner, so there a distributed
// build's network link is the one to paste.
export const MAX_LINK_PAYLOAD_LENGTH = 12000;

// What a payload may unpack to, so a hostile link can't make the page
// inflate gigabytes from a few kilobytes.
const MAX_UNPACKED_BYTES = 4 * 1024 * 1024;

// `claim` is the Publication's JSON (Publication#toJSON()); `snapshotText` the
// build exactly as its content hash covers it.
export async function encodePublicationLinkPayload({ claim, snapshotText }) {
    if (!claim || typeof claim !== 'object') throw new TypeError('a claim is required');
    if (typeof snapshotText !== 'string' || !snapshotText) throw new TypeError('the build is required');
    const json = JSON.stringify({ claim, build: snapshotText });
    const packed = await pipeThrough(new TextEncoder().encode(json), new CompressionStream('deflate-raw'));
    return FORMAT_VERSION + toBase64Url(packed);
}

// `{ claim, snapshotText }`, or null for anything that isn't a payload this
// version wrote (damaged, cut short, or too large once unpacked).
export async function decodePublicationLinkPayload(payload) {
    if (typeof payload !== 'string' || payload[0] !== FORMAT_VERSION) return null;
    const packed = fromBase64Url(payload.slice(1));
    if (!packed || packed.length === 0) return null;
    let parsed;
    try {
        const bytes = await pipeThrough(packed, new DecompressionStream('deflate-raw'), MAX_UNPACKED_BYTES);
        parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch {
        return null;
    }
    if (!parsed || typeof parsed !== 'object' || !parsed.claim || typeof parsed.claim !== 'object' || Array.isArray(parsed.claim)) return null;
    if (typeof parsed.build !== 'string' || !parsed.build) return null;
    return Object.freeze({ claim: parsed.claim, snapshotText: parsed.build });
}

async function pipeThrough(bytes, transform, limit = Infinity) {
    const reader = new Blob([bytes]).stream().pipeThrough(transform).getReader();
    const chunks = [];
    let length = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > limit) {
            await reader.cancel().catch(() => {});
            throw new RangeError('unpacked payload too large');
        }
        chunks.push(value);
    }
    const out = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.length;
    }
    return out;
}

function toBase64Url(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text) {
    if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return null;
    const base64 = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
    let binary;
    try {
        binary = atob(base64);
    } catch {
        return null;
    }
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}
