import { VehicleType, isValidVehicleType } from './VehicleType.js';
import { ANIMAL_SPECIES } from './WildlifeField.js';
import { isNonEmptyString } from '../utils/typeGuards.js';

// 0.9.670 — Avatar Inventory.
//
// core/AvatarVehicleMount.js answers "is the avatar currently on a
// vehicle." Nothing so far answers a related but different question: is
// the avatar currently CARRYING one, unmounted, to place down somewhere
// else later? This file is that small piece of state — a list of things
// an avatar is holding, independent of the world.
//
// NAMED `AvatarInventory`, NOT `AvatarVehicleInventory`, ON PURPOSE.
// Vehicles were the first thing this inventory ever held — the shape
// below (`kind` + `type` + `id`) was deliberately generic rather than
// vehicle-specific so a caught animal could slot in later with no
// change to this file's own contract, only a new `InventoryEntryKind`
// value once an actual catch consumer existed for it. 0.9.700 — Animal
// Catching — is that consumer: `InventoryEntryKind.ANIMAL` now exists
// alongside VEHICLE, its `type` drawn from
// core/WildlifeField.js#ANIMAL_SPECIES (DEER/RABBIT) rather than a new,
// duplicate species vocabulary — the same "reuse the vocabulary that
// already exists" discipline this codebase applies everywhere else.
//
//   AvatarInventoryEntry { id, kind, type } — one carried thing.
//     id   — a stable identity string for the specific thing being
//            carried (a vehicle's 0.9.74 id, or an animal's
//            core/AnimalIdentity.js id).
//     kind — which closed InventoryEntryKind vocabulary `type` belongs
//            to: VEHICLE or ANIMAL.
//     type — the specific type within that kind (a core/VehicleType.js
//            value for VEHICLE, an ANIMAL_SPECIES value for ANIMAL).
//
// A SHARED INVENTORY, NOT TWO PARALLEL ONES — AND WHY THAT MEANS EVERY
// SELECTION QUERY BELOW TAKES AN OPTIONAL `kind` FILTER. One avatar
// carries one backpack, vehicles and animals together — never a second
// `AvatarInventory` instance per kind, which would just be this same
// problem with extra steps. But `mostRecent()`/`resolve()`/`next()`/
// `previous()` (below) all exist to answer "what would deploy/release
// right now" for ONE PARTICULAR consumer (0.9.670's own vehicle
// deploy, this milestone's own animal release) — and once a SECOND kind
// can be added to the SAME list, an unscoped "most recent" would
// silently point at whichever kind was stored last, regardless of which
// one the caller actually meant. So every read that answers "what's
// selected" (never the whole-inventory reads — `entries`/`size`/`has`/
// `get`, which stay kind-agnostic on purpose, for a future "show
// everything I'm carrying" screen) takes an optional `kind`: omitted
// (`null`), it behaves exactly as 0.9.670 always did, scoped over every
// entry; passed, it is scoped to that one kind only, so
// core/AvatarVehicleDeployTransition.js and its own cycle-selection keys
// can never resolve, cycle to, or accidentally deploy an ANIMAL entry,
// and the mirror-image core/AvatarAnimalReleaseTransition.js can never
// touch a VEHICLE one.
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

// The closed vocabulary this file defines for `kind` — see this file's
// own header, "Named AvatarInventory, not AvatarVehicleInventory, on
// purpose."
export const InventoryEntryKind = Object.freeze({
    VEHICLE: 'vehicle',
    ANIMAL: 'animal'
});

export function isValidInventoryEntryKind(value) {
    return Object.values(InventoryEntryKind).includes(value);
}

function isValidAnimalSpecies(value) {
    return Object.values(ANIMAL_SPECIES).includes(value);
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
        if (kind === InventoryEntryKind.ANIMAL) {
            if (!isValidAnimalSpecies(type)) {
                throw new Error(`AvatarInventoryEntry of kind ANIMAL requires a real ANIMAL_SPECIES, got ${JSON.stringify(type)}`);
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

    // 0.9.671 — Avatar Inventory Cycle Selection. The specific entry
    // matching `id`, or `null` when nothing carried has that id.
    // Deliberately kind-agnostic, like `entries`/`size`/`has` — `id`
    // alone already uniquely names an entry, so there is nothing for a
    // `kind` filter to narrow here.
    get(id) {
        return this._entries.find((entry) => entry.id === id) || null;
    }

    // 0.9.700 — Animal Catching. The entries of one kind only, in
    // carried order — the pool every selection method below scopes
    // itself to when a caller passes a `kind`. Exposed directly too, for
    // a caller (ordinarily a future "what am I carrying" UI, or a
    // carried-count readout) that wants the filtered list itself rather
    // than a single selected entry.
    entriesOf(kind) {
        return this._entries.filter((entry) => entry.kind === kind);
    }

    // See this file's own header, "A shared inventory, not two parallel
    // ones," for why every method below takes an optional `kind`.
    _pool(kind) {
        return kind === null ? this._entries : this.entriesOf(kind);
    }

    // The entry that would be deployed/released right now — the most
    // recently added one still present WITHIN `kind` (or across every
    // kind when `kind` is omitted), or `null` when nothing qualifying is
    // carried.
    mostRecent(kind = null) {
        const pool = this._pool(kind);
        return pool.length > 0 ? pool[pool.length - 1] : null;
    }

    // 0.9.671 — the entry a deploy/release acts on RIGHT NOW given a
    // selection: the entry matching `id` if it is still carried AND
    // (when `kind` is given) actually of that kind, or mostRecent(kind)
    // as the default whenever `id` is `null`, no longer present, or
    // belongs to the WRONG kind (e.g. a vehicle's own stale selection id
    // handed in while resolving for ANIMAL). core/AvatarVehicleDeployTransition.js
    // and core/AvatarAnimalReleaseTransition.js each read this SAME
    // method, scoped to their own kind — never two separately-written
    // copies of the same fallback rule.
    resolve(id, kind = null) {
        if (id !== null) {
            const found = this.get(id);
            if (found && (kind === null || found.kind === kind)) {
                return found;
            }
        }
        return this.mostRecent(kind);
    }

    // The zero-based position within `pool` that resolve()'s own
    // fallback rule would answer to, used internally by next()/
    // previous() as the shared starting point for "one step from
    // wherever the current (possibly absent/default) selection is."
    // Private to this file — a caller never needs a raw index, only the
    // entry next()/previous() return.
    _selectionIndex(pool, id) {
        if (id !== null) {
            const index = pool.findIndex((entry) => entry.id === id);
            if (index !== -1) {
                return index;
            }
        }
        return pool.length - 1;
    }

    // 0.9.671 — Avatar Inventory Cycle Selection. The entry one step
    // NEWER than `id` within `kind`'s own carried order, wrapping from
    // the most recent back around to the oldest — or `null` when
    // nothing qualifying is carried. `id: null` (no explicit selection)
    // starts from the same implicit "most recent" position resolve()
    // already treats as default; an `id` belonging to a DIFFERENT kind
    // than requested is treated exactly like a stale/absent one.
    next(id, kind = null) {
        const pool = this._pool(kind);
        if (pool.length === 0) {
            return null;
        }
        return pool[(this._selectionIndex(pool, id) + 1) % pool.length];
    }

    // The mirror image of next(): one step OLDER, wrapping from the
    // oldest back around to the most recent, within the same `kind`.
    previous(id, kind = null) {
        const pool = this._pool(kind);
        if (pool.length === 0) {
            return null;
        }
        const index = this._selectionIndex(pool, id);
        return pool[(index - 1 + pool.length) % pool.length];
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

// Deliberately not yet: a THIRD InventoryEntryKind (no consumer has
// asked for one); a capacity limit; entry reordering beyond
// append-only + remove-by-id; persistence; networking; UI formatting of
// any kind (a future inventory panel's own job, reading
// `entries`/`entriesOf()`/`mostRecent()` exactly like
// ui/components/VehicleInteractionPrompt.js already reads
// AvatarVehicleInteractionController#vehicleInteractionState()).
