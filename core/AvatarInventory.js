import { VehicleType, isValidVehicleType } from './VehicleType.js';

// 0.9.670 — Avatar Inventory.
//
// core/AvatarVehicleMount.js answers "is the avatar currently on a
// vehicle." Nothing so far answers a related but different question: is
// the avatar currently CARRYING one, unmounted, to place down somewhere
// else later? This file is that small piece of state — a list of things
// an avatar is holding, independent of the world.
//
// NAMED `AvatarInventory`, NOT `AvatarVehicleInventory`, ON PURPOSE.
// Vehicles are the first, and for now the only, thing this inventory
// ever holds — but the shape below (`kind` + `type` + `id`) is generic
// rather than vehicle-specific, so a future entry for a caught animal
// (a sheep, a rabbit) needs no change to this file's own contract, only
// a new `InventoryEntryKind` value once an actual catch/store consumer
// exists for it — the same "don't invent a vocabulary before a real seam
// needs it" discipline core/VehicleType.js's own header already models:
// `InventoryEntryKind.ANIMAL` is deliberately NOT defined here yet,
// exactly like that file only ever adds one more vehicle type at a time,
// each time an actual placement/rendering/movement path is ready for it.
//
//   AvatarInventoryEntry { id, kind, type } — one carried thing.
//     id   — a stable identity string for the specific thing being
//            carried (for a stored vehicle, its 0.9.74 vehicle id).
//     kind — which closed InventoryEntryKind vocabulary `type` belongs
//            to. Only InventoryEntryKind.VEHICLE exists today.
//     type — the specific type within that kind (for VEHICLE, a
//            core/VehicleType.js value).
//
//   AvatarInventory — an ordered, immutable list of entries, unique by
//   id. Ordering matters only for `mostRecent()` (below) — a LIFO "what
//   would deploying right now bring back" read, never a display-ranking
//   concern.
//
// IMMUTABLE, NEVER MUTATED IN PLACE — the same discipline every other
// small state value in this codebase already follows
// (core/AvatarVehicleMount.js, core/VehicleInstance.js): `withEntryAdded()`
// and `withEntryRemoved()` each return a brand new AvatarInventory;
// nothing here ever pushes onto or splices an existing instance's own
// entries.
//
// NO CAPACITY LIMIT YET. Real worlds might eventually want to cap how
// much an avatar can carry — this file takes no position on that, the
// same restraint core/VehiclePresence.js's own header already models for
// fields nothing has asked for ("battery/fuel/health/inventory" was
// explicitly out of scope there). Capacity is a policy a future caller
// can add without this file's own shape changing.
//
// Deliberately excluded, matching this milestone's own brief: what
// triggers an entry being added or removed (a future store/deploy
// transition's job — see core/AvatarVehicleStoreTransition.js and
// core/AvatarVehicleDeployTransition.js); where a running avatar holds
// this value (an application-layer controller, mirroring
// core/AvatarVehicleMount.js's own "where does `mount` live" answer);
// vehicle/animal placement, rendering, or movement of any kind; keyboard
// or controller input; persistence; networking; randomness; the clock.

function isNonEmptyString(value) {
    return typeof value === 'string' && value.length > 0;
}

// The one closed vocabulary this file defines for `kind` — see this
// file's own header, "Named AvatarInventory, not AvatarVehicleInventory,
// on purpose," for why only VEHICLE exists today.
export const InventoryEntryKind = Object.freeze({
    VEHICLE: 'vehicle'
});

export function isValidInventoryEntryKind(value) {
    return Object.values(InventoryEntryKind).includes(value);
}

export class AvatarInventoryEntry {
    constructor({ id, kind, type } = {}) {
        if (!isNonEmptyString(id)) {
            throw new Error(`AvatarInventoryEntry requires a non-empty string id, got ${JSON.stringify(id)}`);
        }
        if (!isValidInventoryEntryKind(kind)) {
            throw new Error(`AvatarInventoryEntry requires a valid InventoryEntryKind, got ${JSON.stringify(kind)}`);
        }
        if (kind === InventoryEntryKind.VEHICLE) {
            if (!isValidVehicleType(type) || type === VehicleType.NONE) {
                throw new Error(`AvatarInventoryEntry of kind VEHICLE requires a real VehicleType, got ${JSON.stringify(type)}`);
            }
        }
        this._id = id;
        this._kind = kind;
        this._type = type;
        Object.freeze(this);
    }

    get id() { return this._id; }
    get kind() { return this._kind; }
    get type() { return this._type; }

    toJSON() {
        return { id: this._id, kind: this._kind, type: this._type };
    }

    static fromJSON(json) {
        return new AvatarInventoryEntry({ id: json.id, kind: json.kind, type: json.type });
    }
}

export function createAvatarInventoryEntry({ id, kind, type }) {
    return new AvatarInventoryEntry({ id, kind, type });
}

export function isValidAvatarInventoryEntry(value) {
    return value instanceof AvatarInventoryEntry;
}

export class AvatarInventory {
    constructor(entries = []) {
        if (!Array.isArray(entries) || !entries.every(isValidAvatarInventoryEntry)) {
            throw new Error('AvatarInventory requires an array of AvatarInventoryEntry instances');
        }
        const ids = entries.map((entry) => entry.id);
        if (new Set(ids).size !== ids.length) {
            throw new Error('AvatarInventory requires every entry to have a distinct id');
        }
        this._entries = Object.freeze([...entries]);
        Object.freeze(this);
    }

    get entries() { return this._entries; }
    get size() { return this._entries.length; }

    has(id) {
        return this._entries.some((entry) => entry.id === id);
    }

    // The entry that would be deployed right now — the most recently
    // added one still present, or `null` when nothing is carried. See
    // this file's own header, "Ordering matters only for mostRecent()."
    mostRecent() {
        return this._entries.length > 0 ? this._entries[this._entries.length - 1] : null;
    }

    // 0.9.671 — Avatar Inventory Cycle Selection. The specific entry
    // matching `id`, or `null` when nothing carried has that id.
    get(id) {
        return this._entries.find((entry) => entry.id === id) || null;
    }

    // 0.9.671 — the entry a deploy acts on RIGHT NOW given a selection:
    // the entry matching `id` if it is still carried, or mostRecent() as
    // the default whenever `id` is `null` OR no longer present (e.g. a
    // stale selection left over from an entry that has since been
    // deployed by other means). core/AvatarVehicleDeployTransition.js's
    // own deploy resolution and
    // application/AvatarVehicleInteractionController.js's own
    // storeInteractionState() both read this SAME method — never two
    // separately-written copies of the same fallback rule.
    resolve(id) {
        if (id !== null) {
            const found = this.get(id);
            if (found) {
                return found;
            }
        }
        return this.mostRecent();
    }

    // The zero-based array position `resolve(id)` would answer to, used
    // internally by next()/previous() as the shared starting point for
    // "one step from wherever the current (possibly absent/default)
    // selection is." Private to this file — a caller never needs a raw
    // index, only the entry next()/previous() return.
    _selectionIndex(id) {
        if (id !== null) {
            const index = this._entries.findIndex((entry) => entry.id === id);
            if (index !== -1) {
                return index;
            }
        }
        return this._entries.length - 1;
    }

    // 0.9.671 — Avatar Inventory Cycle Selection. The entry one step
    // NEWER than `id` in carried order, wrapping from the most recent
    // back around to the oldest — or `null` when nothing is carried.
    // `id: null` (no explicit selection) starts from the same implicit
    // "most recent" position resolve(null) already treats as default.
    next(id) {
        if (this._entries.length === 0) {
            return null;
        }
        return this._entries[(this._selectionIndex(id) + 1) % this._entries.length];
    }

    // The mirror image of next(): one step OLDER, wrapping from the
    // oldest back around to the most recent.
    previous(id) {
        if (this._entries.length === 0) {
            return null;
        }
        const index = this._selectionIndex(id);
        return this._entries[(index - 1 + this._entries.length) % this._entries.length];
    }

    toJSON() {
        return { entries: this._entries.map((entry) => entry.toJSON()) };
    }

    static fromJSON(json) {
        return new AvatarInventory((json.entries || []).map((entry) => AvatarInventoryEntry.fromJSON(entry)));
    }
}

export function emptyAvatarInventory() {
    return new AvatarInventory([]);
}

export function isValidAvatarInventory(value) {
    return value instanceof AvatarInventory;
}

// Returns a brand new AvatarInventory with `entry` appended. Throws if an
// entry with the same id is already present — two entries sharing one id
// would mean the same specific vehicle/animal is somehow carried twice,
// a caller bug this file refuses to silently accept rather than picking
// an arbitrary "which one wins" answer.
export function withEntryAdded(inventory, entry) {
    if (!(inventory instanceof AvatarInventory)) {
        throw new Error('withEntryAdded requires an AvatarInventory instance');
    }
    if (!isValidAvatarInventoryEntry(entry)) {
        throw new Error('withEntryAdded requires an AvatarInventoryEntry instance');
    }
    if (inventory.has(entry.id)) {
        throw new Error(`withEntryAdded: an entry with id ${JSON.stringify(entry.id)} is already carried`);
    }
    return new AvatarInventory([...inventory.entries, entry]);
}

// Returns a brand new AvatarInventory with the entry matching `id`
// removed, or the exact same reference when no such entry exists — the
// same "unchanged means the same object back" discipline
// core/AvatarVehicleMountTransition.js's own header already establishes.
export function withEntryRemoved(inventory, id) {
    if (!(inventory instanceof AvatarInventory)) {
        throw new Error('withEntryRemoved requires an AvatarInventory instance');
    }
    if (!inventory.has(id)) {
        return inventory;
    }
    return new AvatarInventory(inventory.entries.filter((entry) => entry.id !== id));
}

// Deliberately not yet: InventoryEntryKind.ANIMAL or any animal-specific
// validation (see this file's own header); a capacity limit; entry
// reordering beyond append-only + remove-by-id; persistence; networking;
// UI formatting of any kind (a future inventory panel's own job, reading
// `entries`/`mostRecent()` exactly like ui/components/VehicleInteractionPrompt.js
// already reads AvatarVehicleInteractionController#vehicleInteractionState()).
