import { emptyAvatarInventory, isValidAvatarInventory } from '../../core/AvatarInventory.js';

// 0.9.700 — Shared Avatar Inventory Store.
//
// Through 0.9.671, `AvatarVehicleInteractionController` owned its own
// private `this._inventory` — the only consumer of core/AvatarInventory.js
// that existed. 0.9.700 — Animal Catching — adds a second, genuinely
// independent consumer: `AvatarAnimalInteractionController`. Both must
// read and write the SAME backpack (one avatar, one inventory, holding
// vehicles and animals together — see core/AvatarInventory.js's own
// header, "A shared inventory, not two parallel ones") — so the current
// `AvatarInventory` reference can no longer live privately inside
// either controller; it needs exactly one owner both can reach.
//
// THIS CLASS IS THAT ONE OWNER, AND NOTHING ELSE. It holds the current
// (immutable) `AvatarInventory` value and offers exactly two operations
// — `get()`/`set()` — the same "hold a value, swap the reference,
// never mutate the value itself" role `AvatarPresenceSession` already
// plays for an avatar's own position. It has no policy of its own: it
// never decides WHAT should be added or removed, WHEN, or WHY — every
// actual decision still comes from a pure transition
// (core/AvatarVehicleStoreTransition.js, core/AvatarAnimalCatchTransition.js,
// and their own mirror-image files), exactly as it always has. A
// controller calls `set(transition.inventory)` with whatever a pure
// transition already computed; this class never computes one itself.
//
// SESSION-LOCAL BY DEFAULT, LIKE EVERYTHING ELSE IN THIS LINE — not
// networked, and not persisted unless a caller opts in.
//
// 0.9.701 — World View Persistence. `persistenceStore` (optional,
// storage/AvatarInventoryPersistenceStore.js) is the one addition: the
// same "enforce/offer only when actually wired" posture
// application/world/WorldNavigationSession.js's own constructor already uses
// throughout. A caller that doesn't supply one (every pre-0.9.701 caller,
// and every existing test) gets exactly the behavior this class always
// had — an empty inventory at construction, never written anywhere.
// Wired, construction rehydrates from whatever was last saved, and every
// set() immediately persists the new value — inventory changes (store/
// deploy/catch/release) are discrete, infrequent user actions, so there
// is no debounce here, unlike the runtime-position writes
// application/world/WorldNavigationSession.js throttles for a ridden vehicle.
export class AvatarInventoryStore {
    constructor(persistenceStore = null) {
        this._persistenceStore = persistenceStore;
        this._inventory = persistenceStore ? persistenceStore.load() : emptyAvatarInventory();
    }

    get() {
        return this._inventory;
    }

    set(nextInventory) {
        if (!isValidAvatarInventory(nextInventory)) {
            throw new Error('AvatarInventoryStore#set requires an AvatarInventory instance');
        }
        this._inventory = nextInventory;
        if (this._persistenceStore) {
            this._persistenceStore.save(nextInventory);
        }
    }
}
