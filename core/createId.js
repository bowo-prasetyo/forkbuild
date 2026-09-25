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
