import { animalPresenceInRegion } from '../core/AnimalPlacement.js';
import { AnimalPresence } from '../core/AnimalPresence.js';
import { withinRadiusXZ } from '../core/AvatarVehicleProximity.js';

// 0.9.701 — Released Animal Rendering. Deliberately the same value
// application/NearbyVehicleInstances.js#VEHICLE_RENDER_RADIUS already
// uses — see that file's own header for why a RENDER radius is
// meaningfully larger than an interaction radius (ANIMAL_INTERACTION_RADIUS,
// 1.5): an animal should be visible well before it's close enough to
// catch.
export const ANIMAL_RENDER_RADIUS = 50;

// 0.9.700 — Animal Runtime Instances.
//
// The animal counterpart of application/VehicleRuntimeInstances.js —
// this session's own authority on "which animals currently exist,
// discoverable for catching, right now." core/AnimalPlacement.js keeps
// answering a narrower, still-true question, exactly like
// core/VehiclePlacement.js does for vehicles: "which animals exist
// deterministically, and where do they start." This store is the ONE
// place two facts core/AnimalPlacement.js has no way to know about ever
// get layered on top of that deterministic answer:
//
//   CAUGHT — a deterministic animal that has been caught must never be
//   rediscovered at its own spawn slot again. Exactly the same bug
//   application/VehicleRuntimeInstances.js's own header names for a
//   stored-then-walked-away-from vehicle: core/AnimalPlacement.js's own
//   (seed, x, z) formula has no memory of a catch ever happening, so a
//   naive "just requery" approach would let the avatar walk back near a
//   caught rabbit's old spawn point and find a "new" one standing there.
//
//   RELEASED — an animal released from inventory has no deterministic
//   slot at all (it was minted with a fresh id — see
//   application/AvatarAnimalInteractionController.js's own header for
//   why, the identical reasoning application/VehicleRuntimeInstances.js's
//   own header already gives for a deployed vehicle); this store is the
//   only place such an animal exists for catch-target discovery to find
//   it again.
//
// SIMPLER THAN VehicleRuntimeInstances IN ONE REAL WAY: no `setPosition()`.
// A vehicle can be RIDDEN, so its own runtime position changes mid-session
// even for an animal that came from a deterministic slot. An animal here
// never moves on its own (core/WildlifeField.js's own header: "static
// decoration at a fixed point") and a caught/released animal has no
// vehicle-movement-shaped concept comparable to riding — so every
// AnimalPresence this store ever tracks keeps the exact position it was
// either placed at or released to, for its entire time in this store.
export class AnimalRuntimeInstances {
    constructor() {
        this._instances = new Map(); // animal id -> current runtime AnimalPresence
        this._excluded = new Set(); // caught animal ids, permanently excluded from rediscovery
        // 0.9.700 — a small queue of { id, position } pairs, one per
        // discard() call, drained once per render frame by
        // application/WorldNavigationSession.js's own
        // _setupWildlifeExclusionSync() — see drainRecentlyCaught()'s
        // own header for why a queue, not a single "last caught" value.
        this._recentlyCaught = [];
        // 0.9.701 — Released Animal Rendering. Ids added via add(), and
        // ONLY via add() — never populated by sync()'s own deterministic
        // discovery. See releasedNearby()'s own header for exactly why
        // this distinction has to exist at all.
        this._released = new Set();
    }

    // Reconciles this store against `animalPresenceInRegion(seed,
    // minX, minZ, maxX, maxZ)` around `centerPosition`'s own square
    // region of `radius`, and returns the resulting full set of
    // currently-visible AnimalPresence objects. Mirrors
    // application/VehicleRuntimeInstances.js#sync()'s own reconciliation
    // exactly, minus any position-override step (see this file's own
    // header, "Simpler than VehicleRuntimeInstances").
    sync(seed, centerPosition, radius) {
        const candidates = animalPresenceInRegion(
            seed,
            centerPosition.x - radius,
            centerPosition.z - radius,
            centerPosition.x + radius,
            centerPosition.z + radius
        );
        for (const candidate of candidates) {
            if (this._excluded.has(candidate.id)) {
                continue;
            }
            if (!this._instances.has(candidate.id)) {
                this._instances.set(candidate.id, candidate);
            }
        }
        for (const [id, instance] of this._instances) {
            if (!withinRadiusXZ(instance.position, centerPosition, radius)) {
                this._instances.delete(id);
            }
        }
        return Array.from(this._instances.values());
    }

    // The current runtime AnimalPresence for `id`, or `null` when this
    // store has never discovered (via sync()/add()) or has since dropped
    // (walked out of range, or discarded) an animal with that id.
    get(id) {
        return this._instances.get(id) || null;
    }

    // Whether `id` has been discard()'d (caught) — see that method's own
    // header. Exists specifically for a candidate-building call site
    // (application/AvatarAnimalInteractionController.js's own
    // `_nearbyAnimals()`) that merges tracked reads with a RAW,
    // memoryless `animalPresenceInRegion()` query outside of sync(): a
    // discarded id must never resurface as a "fresh" candidate there
    // either, or catching, then re-approaching, then trying to catch
    // "again" would re-add the same id to inventory and crash
    // `withEntryAdded()`'s own duplicate-id guard.
    isExcluded(id) {
        return this._excluded.has(id);
    }

    // 0.9.701 — World View Persistence. The direct structural twin of
    // application/VehicleRuntimeInstances.js#instances/#excludedIds — see
    // that file's own 0.9.701 header. Read-only, for
    // storage/AnimalRuntimeInstancePersistenceStore.js alone.
    get instances() {
        return Array.from(this._instances.values());
    }

    get excludedIds() {
        return Array.from(this._excluded);
    }

    // Every ALREADY-TRACKED AnimalPresence within `radius` of
    // `centerPosition` — a READ, never a sync(): no discovery, no
    // eviction, no mutation of any kind. Mirrors
    // application/VehicleRuntimeInstances.js#nearby()'s own header for
    // exactly why that distinction matters — a second call site with a
    // smaller interaction radius must never evict an animal a wider
    // render/streaming radius still wants tracked.
    nearby(centerPosition, radius) {
        return Array.from(this._instances.values())
            .filter((instance) => withinRadiusXZ(instance.position, centerPosition, radius));
    }

    // 0.9.701 — Released Animal Rendering. The RENDER-facing counterpart
    // of nearby() above, scoped to RELEASED animals only — see this
    // file's own header, "Released," and renderer/AnimalFieldRenderer.js's
    // own header for why that scoping is load-bearing, not cosmetic.
    // core/WildlifeField.js's own decorative animals already render
    // through their own tile system (renderer/WildlifeTileMesh.js),
    // completely independently of this store; a caller
    // (application/WorldNavigationSession.js's own
    // _setupAnimalRendering()) that instead passed nearby()'s own full
    // result — including animals this store merely DISCOVERED via
    // sync(), never released — to a per-frame renderer would draw those
    // same animals TWICE: once from their tile, once individually here.
    // A READ, never a sync() — the identical "no discovery, no
    // eviction, no mutation" restraint nearby() itself already keeps.
    releasedNearby(centerPosition, radius) {
        return this.nearby(centerPosition, radius).filter((instance) => this._released.has(instance.id));
    }

    // 0.9.702 — World Animal Decorations. The single nearest RELEASED
    // animal within `radius` of `centerPosition`, or `null` when none
    // qualifies — the "which one am I standing closest to" read
    // application/WorldNavigationSession.js#decorateNearestReleasedAnimalHere()
    // needs to resolve a single decoration target, the identical
    // nearest-by-squared-XZ-distance-then-ascending-id policy
    // core/AvatarAnimalCatchTarget.js#resolveAvatarAnimalCatchTarget()
    // already establishes for catching (Y ignored for the same reason:
    // an animal's Y is a terrain/perch sample, not a meaningful
    // interaction boundary). Scoped to releasedNearby() above, never
    // nearby()'s own full result — a deterministic, tile-baked animal
    // is never a decoration candidate; it already has its own
    // permanent, deterministic home. A READ, never a sync() — the
    // identical restraint every other query in this file already keeps.
    nearestReleased(centerPosition, radius) {
        let best = null;
        let bestDistance = Infinity;
        for (const instance of this.releasedNearby(centerPosition, radius)) {
            const dx = instance.position.x - centerPosition.x;
            const dz = instance.position.z - centerPosition.z;
            const distance = dx * dx + dz * dz;
            if (best === null || distance < bestDistance || (distance === bestDistance && instance.id < best.id)) {
                best = instance;
                bestDistance = distance;
            }
        }
        return best;
    }

    // Directly registers an AnimalPresence this store did not discover
    // via sync() — the one seam a RELEASED animal needs (see this file's
    // own header, "Released"). Mirrors
    // application/VehicleRuntimeInstances.js#add() exactly.
    add(instance) {
        if (!(instance instanceof AnimalPresence)) {
            throw new Error('AnimalRuntimeInstances#add requires an AnimalPresence instance');
        }
        this._instances.set(instance.id, instance);
        // 0.9.701 — marks this id as a RELEASED animal, for
        // releasedNearby()'s own sake — see that method's own header.
        this._released.add(instance.id);
    }

    // The catch half of catch/release: removes a tracked animal (if any)
    // and marks its id permanently excluded from future sync()
    // rediscovery, for the life of this store — see this file's own
    // header, "Caught." Safe to call for an id this store never tracked.
    //
    // `position` (required — application/AvatarAnimalInteractionController.js
    // always has it, from whatever candidate it just resolved a catch
    // target from) records WHERE this animal stood, for the render sync
    // below — never read from `this._instances`, because the animal
    // being caught might never have been sync()'d/tracked here at all
    // (a freshly-discovered deterministic candidate the avatar catches
    // on the very first tick it comes into range never went through
    // sync()) — this file has no other way to know where it was.
    discard(id, position) {
        this._instances.delete(id);
        this._excluded.add(id);
        // 0.9.701 — a caught animal is no longer "released" either
        // (whether it WAS released and is now being re-caught, or was
        // never released at all) — see releasedNearby()'s own header.
        this._released.delete(id);
        this._recentlyCaught.push({ id, position });
    }

    // 0.9.701 — World View Persistence. The exclusion half of discard()
    // ALONE, with no drainRecentlyCaught() notification queued — see
    // that method's own header for what the queue is actually for
    // (telling the renderer to stop drawing an animal it just showed).
    // The one caller: application/WorldNavigationSession.js seeding a
    // freshly-constructed store from a previous session's own persisted
    // excludedIds (storage/AnimalRuntimeInstancePersistenceStore.js) —
    // there is no animal to un-render, because nothing with this id was
    // ever discovered or drawn THIS session in the first place.
    excludeId(id) {
        this._instances.delete(id);
        this._excluded.add(id);
    }

    // 0.9.700 — returns every { id, position } pair queued by discard()
    // since the last drain, and empties the queue. A QUEUE, not a
    // single "last caught" value, because more than one animal can be
    // caught within the same render frame's own bookkeeping window
    // (unlikely in practice — one key press catches at most one animal
    // per tick — but this store makes no assumption about its own
    // caller's cadence). The render sync this exists for
    // (application/WorldNavigationSession.js's own
    // _setupWildlifeExclusionSync()) is the only real consumer; a caller
    // with no rendering at all (a minimal test setup) simply never
    // calls this, and the queue grows unread — harmless, since nothing
    // else in this store ever reads it.
    drainRecentlyCaught() {
        const drained = this._recentlyCaught;
        this._recentlyCaught = [];
        return drained;
    }

    clear() {
        this._instances.clear();
        this._excluded.clear();
        this._recentlyCaught = [];
        this._released.clear();
    }
}

// Deliberately not yet: persistence, networking, or cross-replica
// reconciliation of any kind (session-local, exactly like
// application/VehicleRuntimeInstances.js's own identical posture);
// movement of any kind (see this file's own header, "Simpler than
// VehicleRuntimeInstances"); a capacity or eviction policy beyond plain
// distance-from-center; resolving WHICH animal an avatar is carrying
// (that stays core/AvatarInventory.js's own job, entirely untouched by
// this file).
