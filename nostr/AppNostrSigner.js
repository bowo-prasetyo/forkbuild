import { schnorr } from '../vendor/noble-curves/secp256k1.js';
import { sha256 } from '../vendor/noble-hashes/sha2.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '../vendor/noble-hashes/utils.js';

// A Nostr signer this device holds itself (docs/Pillars.md, "Every build has
// a family tree": anyone can find a build to remix, with no wallet or browser
// extension). It has the shape of NIP-07's `window.nostr` (`getPublicKey()`
// and `signEvent()`), so nostr/NostrInjectedProviderPublisher.js signs and
// sends with it exactly as it does with an extension.
//
// It is a carrier key, never an identity: what it signs is a Nostr event
// that carries a build, and the build inside is signed by the builder's own
// identity (publisher/Publication.js), which is what everyone who reads it
// checks. Losing it loses nothing but the events it signed; anyone who has
// it can only post notes that readers check like any other.

const HEX_64 = /^[0-9a-f]{64}$/;

// A new secret key, as 64 lowercase hex characters.
export function generateNostrSecretKey() {
    return bytesToHex(schnorr.utils.randomSecretKey());
}

export function isNostrSecretKey(value) {
    if (typeof value !== 'string' || !HEX_64.test(value)) return false;
    try {
        schnorr.getPublicKey(hexToBytes(value));
        return true;
    } catch {
        return false;
    }
}

// NIP-01: an event's id is the SHA-256 of
// [0, pubkey, created_at, kind, tags, content], serialized as JSON.
export function nostrEventId({ pubkey, created_at: createdAt, kind, tags, content }) {
    const serialized = JSON.stringify([0, pubkey, createdAt, kind, tags, content]);
    return bytesToHex(sha256(utf8ToBytes(serialized)));
}

// Whether `event` is signed by its own `pubkey` and its id matches it.
export function verifyNostrEvent(event) {
    try {
        if (!event || typeof event.pubkey !== 'string' || typeof event.sig !== 'string' || typeof event.id !== 'string') return false;
        if (nostrEventId(event) !== event.id) return false;
        return schnorr.verify(hexToBytes(event.sig), hexToBytes(event.id), hexToBytes(event.pubkey));
    } catch {
        return false;
    }
}

// `{ getPublicKey(), signEvent(unsigned) }` for `secretKey` (hex). Throws
// for a key that isn't one.
export function createAppNostrSigner({ secretKey }) {
    if (!isNostrSecretKey(secretKey)) throw new TypeError('createAppNostrSigner: a 64-character hex secret key is required');
    const secretBytes = hexToBytes(secretKey);
    const pubkey = bytesToHex(schnorr.getPublicKey(secretBytes));
    return Object.freeze({
        async getPublicKey() {
            return pubkey;
        },
        async signEvent(unsigned) {
            const event = {
                pubkey,
                created_at: Number.isInteger(unsigned?.created_at) ? unsigned.created_at : Math.floor(Date.now() / 1000),
                kind: unsigned.kind,
                tags: Array.isArray(unsigned.tags) ? unsigned.tags : [],
                content: typeof unsigned.content === 'string' ? unsigned.content : ''
            };
            const id = nostrEventId(event);
            const sig = bytesToHex(schnorr.sign(hexToBytes(id), secretBytes));
            return Object.freeze({ ...event, id, sig });
        }
    });
}
