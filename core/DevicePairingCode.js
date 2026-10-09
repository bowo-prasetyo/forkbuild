// The code a device shows (as a QR code and a link) so another device can
// copy its builds: application/devicePairing/DevicePairingSession.js.
//
// One path segment of base64url over 65 bytes: a format byte, the 32-byte
// public key of the showing device's one-off pairing identity (identity/
// EphemeralIdentityProvider.js; the rendezvous servers find its offer by
// that key's did:key), and a 32-byte secret. The secret never leaves the
// two devices: what the showing device sends is encrypted with it, so the
// rendezvous servers, and anyone between the devices, see only ciphertext.
//
// The link carries the code after `#`, so opening it never sends the code
// to the web server either.

import { didKeyToPublicKey, publicKeyToDidKey } from '../identity/Ed25519.js';

export const DEVICE_PAIRING_CODE_VERSION = 1;
export const DEVICE_PAIRING_SECRET_LENGTH = 32;
const PUBLIC_KEY_LENGTH = 32;
const CODE_LENGTH = 1 + PUBLIC_KEY_LENGTH + DEVICE_PAIRING_SECRET_LENGTH;
const CODE_PATTERN = /^[A-Za-z0-9_-]{87}$/;

// The app route a pairing link opens (ui/views/DevicePairingReceiveView.js).
export function devicePairingPath(code) {
    return `/pair/${code}`;
}

export function devicePairingLink(code, appUrl) {
    return `${String(appUrl).split('#')[0]}#${devicePairingPath(code)}`;
}

export function createDevicePairingCode({ identityId, secret }) {
    const publicKey = didKeyToPublicKey(identityId);
    if (!publicKey || publicKey.length !== PUBLIC_KEY_LENGTH) {
        throw new TypeError('createDevicePairingCode: identityId must be an Ed25519 did:key');
    }
    if (!(secret instanceof Uint8Array) || secret.length !== DEVICE_PAIRING_SECRET_LENGTH) {
        throw new TypeError(`createDevicePairingCode: secret must be ${DEVICE_PAIRING_SECRET_LENGTH} bytes`);
    }
    const bytes = new Uint8Array(CODE_LENGTH);
    bytes[0] = DEVICE_PAIRING_CODE_VERSION;
    bytes.set(publicKey, 1);
    bytes.set(secret, 1 + PUBLIC_KEY_LENGTH);
    return toBase64Url(bytes);
}

// { identityId, secret, passphrase } for a well-formed code, else null.
// `passphrase` is the secret as text, the form the backup file's
// encryption takes (application/backup/DeviceBackupFile.js).
export function parseDevicePairingCode(code) {
    if (typeof code !== 'string' || !CODE_PATTERN.test(code)) return null;
    const bytes = fromBase64Url(code);
    if (!bytes || bytes.length !== CODE_LENGTH || bytes[0] !== DEVICE_PAIRING_CODE_VERSION) return null;
    const secret = bytes.slice(1 + PUBLIC_KEY_LENGTH);
    return Object.freeze({
        identityId: publicKeyToDidKey(bytes.slice(1, 1 + PUBLIC_KEY_LENGTH)),
        secret,
        passphrase: devicePairingPassphrase(secret)
    });
}

export function devicePairingPassphrase(secret) {
    return toBase64Url(secret);
}

export function randomDevicePairingSecret() {
    return globalThis.crypto.getRandomValues(new Uint8Array(DEVICE_PAIRING_SECRET_LENGTH));
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
