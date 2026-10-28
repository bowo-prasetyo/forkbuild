// Number keys for recent bricks (docs/reviews/EditorPlacementUX-2026-10-27.md,
// "Beyond the fixes"): the keys 3 to 9 each hold a brick type, like a game's
// hotbar. A brick keeps its key while it is in use, so a builder's fingers
// learn where it is; a brick not yet held takes the next free key, and once
// all seven are held it takes the key of the one used longest ago.
//
// `slots` is { keys: [definitionId] (key 3 first), recent: [definitionId]
// (most recently used first) }; useBrick() returns a new one and leaves the
// one it was given as it was.
export const FIRST_BRICK_KEY = 3;
export const BRICK_KEY_COUNT = 7;

export function emptyBrickSlots() {
    return { keys: [], recent: [] };
}

export function useBrick(slots, definitionId, count = BRICK_KEY_COUNT) {
    const current = normalizeBrickSlots(slots, count);
    if (!definitionId) return current;
    const recent = [definitionId, ...current.recent.filter((id) => id !== definitionId)];
    const keys = [...current.keys];
    if (!keys.includes(definitionId)) {
        if (keys.length < count) {
            keys.push(definitionId);
        } else {
            // The key of the brick used longest ago.
            const oldest = [...current.recent].reverse().find((id) => keys.includes(id)) ?? keys[0];
            keys[keys.indexOf(oldest)] = definitionId;
        }
    }
    return { keys, recent: recent.filter((id) => keys.includes(id)) };
}

// The brick a key holds ('3' to '9'), or null.
export function brickForKey(slots, key) {
    const index = Number(key) - FIRST_BRICK_KEY;
    if (!Number.isInteger(index) || index < 0) return null;
    return normalizeBrickSlots(slots).keys[index] ?? null;
}

// { definitionId: '3' } for every brick a key holds.
export function keysByBrick(slots) {
    const byBrick = {};
    normalizeBrickSlots(slots).keys.forEach((id, index) => { byBrick[id] = String(FIRST_BRICK_KEY + index); });
    return byBrick;
}

// Anything read back from storage, made safe to use.
export function normalizeBrickSlots(slots, count = BRICK_KEY_COUNT) {
    const strings = (list) => (Array.isArray(list) ? list.filter((id) => typeof id === 'string' && id) : []);
    const keys = [...new Set(strings(slots?.keys))].slice(0, count);
    const recent = [...new Set(strings(slots?.recent))].filter((id) => keys.includes(id));
    for (const id of keys) if (!recent.includes(id)) recent.push(id);
    return { keys, recent };
}
