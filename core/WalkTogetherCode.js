// The code in a "Walk here with me" link (application/walkTogether/
// WalkTogether.js): one path segment of base64url over 33 bytes, a format
// byte and the 32-byte public key of the inviting device's one-off identity
// (identity/EphemeralIdentityProvider.js). The rendezvous servers find the
// inviter's standing offer by that key's did:key, and the guest's connection
// accepts only that key, so the link is the whole invitation: anyone who
// has it can walk in while it lasts, and nobody can stand in for the
// inviter.
//
// Nothing else rides in the link. The World and the inviter's name arrive
// over the connection, and the World is checked by its signature like any
// shared build. The code sits after `#`, so opening the link never sends it
// to the web server.

import { didKeyToPublicKey, publicKeyToDidKey } from '../identity/Ed25519.js';

export const WALK_TOGETHER_CODE_VERSION = 1;
const PUBLIC_KEY_LENGTH = 32;
const CODE_LENGTH = 1 + PUBLIC_KEY_LENGTH;
const CODE_PATTERN = /^[A-Za-z0-9_-]{44}$/;

// The app route a walk link opens (ui/views/WalkTogetherJoinView.js).
export function walkTogetherPath(code) {
    return `/walk/${code}`;
}

export function walkTogetherLink(code, appUrl) {
    return `${String(appUrl).split('#')[0]}#${walkTogetherPath(code)}`;
}

export function createWalkTogetherCode(identityId) {
    const publicKey = didKeyToPublicKey(identityId);
    if (!publicKey || publicKey.length !== PUBLIC_KEY_LENGTH) {
        throw new TypeError('createWalkTogetherCode: identityId must be an Ed25519 did:key');
    }
    const bytes = new Uint8Array(CODE_LENGTH);
    bytes[0] = WALK_TOGETHER_CODE_VERSION;
    bytes.set(publicKey, 1);
    return toBase64Url(bytes);
}

// { identityId } for a well-formed code, else null.
export function parseWalkTogetherCode(code) {
    if (typeof code !== 'string' || !CODE_PATTERN.test(code)) return null;
    const bytes = fromBase64Url(code);
    if (!bytes || bytes.length !== CODE_LENGTH || bytes[0] !== WALK_TOGETHER_CODE_VERSION) return null;
    return Object.freeze({ identityId: publicKeyToDidKey(bytes.slice(1)) });
}

function toBase64Url(bytes) {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text) {
    try {
        const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
        return Uint8Array.from(binary, (char) => char.charCodeAt(0));
    } catch {
        return null;
    }
}
