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
