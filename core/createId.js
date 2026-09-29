// Generates a UUID for entities that need a first-class identity (World,
// Building, Brick, ...). Prefers the platform's crypto.randomUUID() where
// available; falls back to an RFC4122-ish v4 generator so this still works
// in older browsers or test runners without it.
//
// Not to be confused with a BrickDefinition id like "core:cube" — that's a
// stable, namespaced *type* identifier (see docs/BrickIDs.md), not a
// per-instance UUID. createId() is for individual World/Building/Brick
// instances, which need to stay distinguishable across forks, merges, and
// multiplayer sessions.
// A brick id: 12 random characters from [0-9A-Za-z] (71 bits), a third
// of a UUID's length. Bricks are by far the most numerous identities in a
// document, so their ids dominate its size; a UUID's 122 bits are more
// than one document's bricks need to stay distinct (a two-million-brick
// document has about a one-in-a-billion chance of any collision).
const BRICK_ID_LENGTH = 12;
const BRICK_ID_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export function createBrickId() {
    const bytes = new Uint8Array(BRICK_ID_LENGTH * 2);
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        crypto.getRandomValues(bytes);
    } else {
        for (let i = 0; i < bytes.length; i++) bytes[i] = (Math.random() * 256) | 0;
    }
    let id = '';
    // Rejection sampling keeps every character equally likely: bytes of
    // 248 and above (248 = 4 × 62) are skipped.
    for (let i = 0; i < bytes.length && id.length < BRICK_ID_LENGTH; i++) {
        if (bytes[i] < 248) id += BRICK_ID_ALPHABET[bytes[i] % 62];
    }
    return id.length === BRICK_ID_LENGTH ? id : id + createBrickId().slice(id.length);
}

export function createId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }

    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
        const random = (Math.random() * 16) | 0;
        const value = char === 'x' ? random : (random & 0x3) | 0x8;
        return value.toString(16);
    });
}

// A UUID v4 from the platform's cryptographic random source only: never
// Math.random(). For identities that other replicas trust to be unguessable
// and unique — a World Resident's id also decides where it walks
// (core/ResidentMotion.js). Throws where no secure source exists, rather
// than quietly minting a predictable id.
export function createSecureId() {
    const cryptoApi = typeof crypto !== 'undefined' ? crypto : null;
    if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
        return cryptoApi.randomUUID();
    }
    if (!cryptoApi || typeof cryptoApi.getRandomValues !== 'function') {
        throw new Error('createSecureId: no secure random number generator (crypto.getRandomValues) is available');
    }
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
