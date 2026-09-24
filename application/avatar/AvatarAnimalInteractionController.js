import { DEFAULT_WORLD_SEED } from '../../core/TerrainHeightField.js';
import { InventoryEntryKind } from '../../core/AvatarInventory.js';
import { AvatarInventoryStore } from './AvatarInventoryStore.js';
import { AvatarAnimalCatchIntent, deriveAvatarAnimalCatchIntent } from '../../core/AvatarAnimalCatchIntent.js';
import { ANIMAL_INTERACTION_RADIUS, resolveAvatarAnimalCatchTarget } from '../../core/AvatarAnimalCatchTarget.js';
import { deriveAvatarAnimalCatchTransition } from '../../core/AvatarAnimalCatchTransition.js';
import { AvatarAnimalReleaseIntent, deriveAvatarAnimalReleaseIntent } from '../../core/AvatarAnimalReleaseIntent.js';
import { deriveAvatarAnimalReleaseTransition } from '../../core/AvatarAnimalReleaseTransition.js';
import { AnimalPresence } from '../../core/AnimalPresence.js';
import { animalPresenceInRegion } from '../../core/AnimalPlacement.js';
import { createId } from '../../core/createId.js';

// 0.9.700 — Avatar-Animal Catch/Release Runtime Integration.
//
// The animal counterpart of application/avatar/AvatarVehicleInteractionController.js
// — but structurally SIMPLER, for a reason named throughout
// core/AvatarAnimalCatchTransition.js and core/AvatarAnimalReleaseTransition.js's
// own headers: catching has no mount-then-store two-step, and releasing
// has no mount-state gate. This controller therefore has no `_mount`
// field at all, and its ONE key ('F') is not "mount vs. dismount" but
// "catch vs. release," disambiguated the same way — by which action is
// actually possible right now:
//
//   a catchable animal is in range  -> F catches it
//   otherwise, something is carried -> F releases the selected one
//   otherwise                       -> F does nothing
//
// Catching wins the tie when BOTH are simultaneously true (an animal in
// range AND something already carried) — "there's something right here"
// takes priority over "let go of what I'm holding," the same intuition
// a real hand would follow.
//
// ITS OWN KEY, DELIBERATELY NEVER 'Q'. Vehicles' own store/deploy
// already uses 'Q'; sharing it here would mean one press sometimes
// storing a vehicle, sometimes catching an animal, decided by
// proximity — genuinely ambiguous the moment both a vehicle and an
// animal are in range at once. 'F' is unused by every other controller
// in this codebase (see docs/user/ControlsReference.md).
//
// NO CYCLE-SELECTION KEYS YET. Vehicles got '['/']' only once
// cycle-through-what's-carried was an actual, separately reported need
// (see core/AvatarVehicleStoreTransition.js's own commit history) — this
// controller ships with the identical "most recent by default" release
// behavior 0.9.670 first shipped for vehicles, ready for the same
// follow-on later without a signature change (see
// core/AvatarAnimalReleaseTransition.js's own header).
//
// SHARES THE SAME AvatarInventoryStore AvatarVehicleInteractionController
// USES — one avatar, one backpack. See core/AvatarInventory.js's own
// header, "A shared inventory, not two parallel ones," and
// application/avatar/AvatarInventoryStore.js's own header for why ownership of
// the current AvatarInventory value moved out of either controller and
// into this small shared holder.
export class AvatarAnimalInteractionController {
    constructor(avatarPresenceSession, { seed = DEFAULT_WORLD_SEED, animalRuntimeInstances = null, avatarInventoryStore = null } = {}) {
        this._avatarPresenceSession = avatarPresenceSession;
        this._seed = seed;
        // `null` by default: a caller that builds this controller alone
        // (an older test, a minimal setup) gets a harmless no-op catch
        // path — see _tickCatch()'s own header for why catching, unlike
        // mounting a vehicle, has no graceful deterministic fallback.
        this._animalRuntimeInstances = animalRuntimeInstances;
        this._inventoryStore = avatarInventoryStore || new AvatarInventoryStore();
        this._interactKeyHeld = false;
        this._interactKeyConsumed = false;
    }

    // The avatar's current, SHARED AvatarInventory — a read-only
    // debug/UI surface, the identical posture
    // AvatarVehicleInteractionController#inventory() already
    // establishes.
    inventory() {
        return this._inventoryStore.get();
    }

    // The catch/release AFFORDANCE — a caller (ordinarily World View's
    // own second prompt line) needs to know whether to show "[F] Catch
    // <Species>" or "[F] Release <Species>," WITHOUT recomputing
    // proximity or resolving a target itself:
    //
    //   an animal is in range
    //       -> { canCatch: true, canRelease: false, species: <its species>,
    //            targetAnimalId: <its id>, carriedCount: <how many carried> }
    //   nothing in range, carrying at least one
    //       -> { canCatch: false, canRelease: true,
    //            species: <the entry that would release next>,
    //            targetAnimalId: null, carriedCount: <how many carried> }
    //   neither
    //       -> { canCatch: false, canRelease: false, species: null,
    //            targetAnimalId: null, carriedCount: <how many carried> }
    //
    // REUSES resolveAvatarAnimalCatchTarget() — never a second
    // nearest-candidate search, the identical posture
    // AvatarVehicleInteractionController#vehicleInteractionState()
    // already takes for its own preview read. NEVER CALLED FROM tick().
    catchInteractionState() {
        if (!this._avatarPresenceSession) {
            return Object.freeze({ canCatch: false, canRelease: false, species: null, targetAnimalId: null, carriedCount: 0 });
        }
        const inventory = this._inventoryStore.get();
        const carriedCount = inventory.entriesOf(InventoryEntryKind.ANIMAL).length;
        const avatarPosition = this._avatarPresenceSession.current.position;
        const animals = this._nearbyAnimals(avatarPosition);
        const { targetAnimalId } = resolveAvatarAnimalCatchTarget({
            avatarPosition,
            animals,
            catchIntent: AvatarAnimalCatchIntent.CATCH
        });
        if (targetAnimalId !== null) {
            const target = animals.find((animal) => animal.id === targetAnimalId);
            return Object.freeze({
                canCatch: true,
                canRelease: false,
                species: target.species,
                targetAnimalId,
                carriedCount
            });
        }
        const entry = inventory.resolve(null, InventoryEntryKind.ANIMAL);
        return Object.freeze({
            canCatch: false,
            canRelease: entry !== null,
            species: entry ? entry.type : null,
            targetAnimalId: null,
            carriedCount
        });
    }

    keyDown(key) {
        return this._setKey(key, true);
    }

    keyUp(key) {
        return this._setKey(key, false);
    }

    releaseAll() {
        this._interactKeyHeld = false;
        this._interactKeyConsumed = false;
    }

    // Re-evaluates catch/release from whatever is currently held — the
    // identical "poll a held key, consume it once per press" discipline
    // application/avatar/AvatarVehicleInteractionController.js#tick() already
    // establishes; see this file's own header for why priority goes to
    // catching when both are simultaneously possible.
    tick() {
        if (!this._avatarPresenceSession) {
            return;
        }
        const requested = this._interactKeyHeld && !this._interactKeyConsumed;
        const avatarPosition = this._avatarPresenceSession.current.position;
        const caught = this._tickCatch(requested, avatarPosition);
        if (!caught && requested) {
            this._tickRelease(avatarPosition);
        }
    }

    // Composes core/AvatarAnimalCatchIntent.js + core/AvatarAnimalCatchTarget.js
    // + core/AvatarAnimalCatchTransition.js, then performs the one
    // EFFECT that pure transition deliberately leaves to its caller:
    // removing the caught animal from the world via
    // application/world/AnimalRuntimeInstances.js#discard(). Returns whether a
    // catch actually happened, so tick() knows not to also attempt a
    // release this same press.
    //
    // GUARDED ON `_animalRuntimeInstances` BEING WIRED FOR THE ACTUAL
    // REMOVAL, BUT STILL EVALUATES THE DETERMINISTIC QUERY WITHOUT ONE —
    // unlike vehicle deploy (which has literally nowhere for a new
    // vehicle to exist without a runtime store), catching a
    // deterministically-placed animal can still be evaluated from
    // core/AnimalPlacement.js alone; only the "never rediscover this one
    // again" exclusion needs the store. A caller with no store wired (an
    // older test) can still catch once, but the same animal could be
    // "caught" again on a later, fresh region query — an accepted,
    // narrow gap for a minimal setup, never true for a real World View
    // session (which always wires one).
    _tickCatch(requested, avatarPosition) {
        const animals = this._nearbyAnimals(avatarPosition);
        const catchIntent = deriveAvatarAnimalCatchIntent({ catchRequested: requested });
        const { targetAnimalId } = resolveAvatarAnimalCatchTarget({ avatarPosition, animals, catchIntent });
        const target = targetAnimalId ? animals.find((animal) => animal.id === targetAnimalId) : null;

        const transition = deriveAvatarAnimalCatchTransition({
            currentInventory: this._inventoryStore.get(),
            catchIntent,
            animalId: target ? target.id : null,
            animalSpecies: target ? target.species : null
        });
        if (!transition.caught) {
            return false;
        }
        this._interactKeyConsumed = true;
        this._inventoryStore.set(transition.inventory);
        if (this._animalRuntimeInstances) {
            this._animalRuntimeInstances.discard(target.id, target.position);
        }
        return true;
    }

    // Composes core/AvatarAnimalReleaseIntent.js + core/AvatarAnimalReleaseTransition.js,
    // then performs the one EFFECT that pure transition deliberately
    // leaves to its caller: minting a fresh id via core/createId.js —
    // the identical choice
    // application/avatar/AvatarVehicleInteractionController.js#_tickDeploy()
    // already makes for a deployed vehicle, and for the same reason
    // (see that method's own header): core/AnimalIdentity.js's own
    // `animalIdFor()` names a DETERMINISTIC lattice slot, and a released
    // animal was never placed by the deterministic field — reusing that
    // formula here would risk colliding with a real future animal at the
    // same cell — constructing a real AnimalPresence at the avatar's own
    // current position, and registering it into the runtime store.
    //
    // GUARDED ENTIRELY ON `_animalRuntimeInstances` BEING WIRED — the
    // identical restraint
    // application/avatar/AvatarVehicleInteractionController.js#_tickDeploy()'s
    // own header already explains: a released animal has nowhere else
    // to exist without a runtime store, so a caller with none gets a
    // harmless no-op rather than a silently lost inventory entry.
    _tickRelease(avatarPosition) {
        if (!this._animalRuntimeInstances) {
            return;
        }
        const releaseIntent = deriveAvatarAnimalReleaseIntent({ releaseRequested: true });
        const transition = deriveAvatarAnimalReleaseTransition({
            currentInventory: this._inventoryStore.get(),
            releaseIntent
        });
        this._inventoryStore.set(transition.inventory);
        if (transition.entry === null) {
            return;
        }
        this._interactKeyConsumed = true;
        const instance = new AnimalPresence({
            id: createId(),
            species: transition.entry.type,
            position: avatarPosition
        });
        this._animalRuntimeInstances.add(instance);
    }

    // A half-open square of side `2 * ANIMAL_INTERACTION_RADIUS` centered
    // on the avatar, merged with this session's own tracked (caught-
    // exclusion applied, released-instance-including) animals — the
    // identical "deterministic query merged with tracked, current-state
    // candidates, deduplicated by id" pattern
    // application/avatar/AvatarVehicleInteractionController.js#_nearbyVehicles()
    // already establishes. Absent the runtime store entirely when none
    // is wired, the same graceful-degradation posture that method
    // already takes.
    _nearbyAnimals(avatarPosition) {
        const rawDeterministic = animalPresenceInRegion(
            this._seed,
            avatarPosition.x - ANIMAL_INTERACTION_RADIUS,
            avatarPosition.z - ANIMAL_INTERACTION_RADIUS,
            avatarPosition.x + ANIMAL_INTERACTION_RADIUS,
            avatarPosition.z + ANIMAL_INTERACTION_RADIUS
        );
        if (!this._animalRuntimeInstances) {
            return rawDeterministic;
        }
        // A caught id must never resurface here as a "fresh" candidate
        // — see application/world/AnimalRuntimeInstances.js#isExcluded()'s own
        // header for the exact bug this filter exists to prevent
        // (re-catching an id still sitting in inventory).
        const deterministic = rawDeterministic.filter((animal) => !this._animalRuntimeInstances.isExcluded(animal.id));
        const tracked = this._animalRuntimeInstances.nearby(avatarPosition, ANIMAL_INTERACTION_RADIUS);
        const trackedIds = new Set(tracked.map((animal) => animal.id));
        return [...tracked, ...deterministic.filter((animal) => !trackedIds.has(animal.id))];
    }

    _setKey(key, isDown) {
        switch (String(key || '').toLowerCase()) {
            case 'f':
                this._interactKeyHeld = isDown;
                if (!isDown) {
                    this._interactKeyConsumed = false;
                }
                return true;
            default: return false;
        }
    }
}

// Deliberately not yet: cycle-selection keys for release (see this
// file's own header); a taming difficulty, escape chance, or cooldown of
// any kind; capacity limits; avatar movement or collision changes of any
// kind (this controller never touches
// application/avatar/AvatarMovementController.js, the identical "no movement
// coupling" restraint AvatarVehicleInteractionController.js's own header
// documents for itself); rendering (ui/components/AnimalInteractionPrompt.js's
// own job); persistence or networking of `_inventoryStore`'s own state
// (exactly as ephemeral as AvatarVehicleInteractionController.js's own
// mount/inventory state already is).
