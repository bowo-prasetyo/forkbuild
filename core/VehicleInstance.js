import { Position } from './Position.js';
import { VehicleType, isValidVehicleType } from './VehicleType.js';
import { VehiclePresence } from './VehiclePresence.js';

// 0.9.114 — Vehicle Runtime Instance State.
//
// core/VehiclePresence.js (0.9.71/0.9.74) answers "what vehicle is
// present, where, and by what name" — but its own header is explicit
// that its position is fixed for the object's entire lifetime: "a new
// position means constructing a new VehiclePresence, never mutating one
// a caller may already be holding." core/VehiclePlacement.js (0.9.72)
// then recomputes that position from nothing but (seed, x, z) on every
// single query — "recomputed, never stored." Both of those are exactly
// right for what they answer: a DETERMINISTIC FACT about where a vehicle
// was procedurally placed can never depend on anything that happened to
// it afterward. But neither of them, nor anything built on top of them
// through 0.9.113, has ever given a vehicle a position that can actually
// CHANGE while play continues — every consumer of a VehiclePresence
// today (proximity, mount targeting, dismount destination) reads its one
// fixed `position` and treats it as the vehicle's location, full stop.
// That is the exact gap this milestone closes: a vehicle needs a
// deterministic, unchanging FACT about where it started, and a separate,
// mutable-by-replacement fact about where it currently is — two
// different questions a single `VehiclePresence.position` field cannot
// honestly answer at once.
//
//   world seed ──▶ VehiclePlacement ──▶ VehiclePresence.position
//                                              │
//                                              │ vehicleInstanceFromPresence()
//                                              ▼
//                                     VehicleInstance
//                                       spawnPosition  (= the deterministic fact, frozen forever)
//                                       position       (= the current runtime fact, starts equal)
//
// VehicleInstance IS THE RUNTIME OBJECT; VehiclePresence STAYS THE
// DETERMINISTIC DESCRIPTOR. This milestone does not touch
// core/VehiclePresence.js or core/VehiclePlacement.js at all — not one
// line — because neither one is wrong. `vehiclePresenceInRegion()` still
// recomputes the exact same deterministic lattice it always has, and
// still owns the ONLY question of whether a bicycle exists at a given
// slot in the first place. VehicleInstance is a new, separate wrapper
// AROUND a VehiclePresence's own identity/type/position, adding exactly
// the one fact neither VehiclePresence nor VehiclePlacement was ever
// designed to hold: a position that is allowed to be different from the
// deterministic one.
//
//   spawnPosition = a deterministic fact — where VehiclePlacement.js put
//                    this vehicle's slot. Set once, at construction, from
//                    a real VehiclePresence, and never changes for the
//                    life of the VehicleInstance object.
//   position      = a current runtime fact — where this vehicle actually
//                    is right now. Starts equal to spawnPosition (a
//                    vehicle that has never moved IS at its spawn point),
//                    and changes only via withPosition(), which returns
//                    a genuinely new VehicleInstance rather than mutating
//                    the one a caller already holds.
//
// vehicleInstanceFromPresence(presence) IS THE ONE BRIDGE FROM
// DETERMINISTIC PLACEMENT INTO RUNTIME STATE. It takes a real
// VehiclePresence (ordinarily one `vehiclePresenceInRegion()` just
// produced) and returns a VehicleInstance whose id/type/spawnPosition
// are copied verbatim from it, with `position` initialized to that same
// spawnPosition. This is a PURE, one-way copy: a VehicleInstance never
// holds a reference back to the VehiclePresence it was built from, and
// this file never imports core/VehiclePlacement.js or
// core/VehicleIdentity.js — it has no opinion on how a VehiclePresence
// comes to exist, only on what a caller does with one once it has it.
//
// withPosition(nextPosition) IS THE ONLY WAY `position` EVER CHANGES,
// AND IT NEVER TOUCHES `spawnPosition`. Exactly the discipline
// core/VehiclePresence.js's own header already established for itself
// ("a new position means constructing a new VehiclePresence") and
// core/AvatarVehicleMount.js/core/AvatarVehicleDismountTransition.js
// already established for their own state ("a new relationship means
// constructing a new value, never mutating one a caller may already be
// holding"): withPosition() returns a BRAND NEW VehicleInstance carrying
// the exact same `id`, the exact same `type`, and — this is the whole
// point of this milestone — the exact same `spawnPosition` reference,
// with only `position` replaced. The deterministic spawn calculation
// core/VehiclePlacement.js performs is never re-run, never perturbed,
// and never even consulted by this method; it is simply carried forward
// untouched.
//
// IDENTITY NEVER CHANGES, EITHER — `id` HAS NO SETTER AND NO DERIVATION
// HERE. A VehicleInstance's `id` is copied verbatim from the
// VehiclePresence it was built from (ultimately
// core/VehicleIdentity.js's own `vehicleIdFor(seed, cellX, cellZ)`) and
// this file never recomputes, reformats, or validates its FORMAT — the
// identical posture core/VehiclePresence.js's own header already takes
// ("this file has no opinion on... its format"). Moving a vehicle can
// never change which vehicle it is.
//
// A VehicleInstance IS NOT A VehiclePresence, AND DOES NOT SUBCLASS OR
// WRAP ONE AS A FIELD. It intentionally duplicates VehiclePresence's own
// `id`/`type` validation rather than delegating to a shared base class,
// mirroring how core/AvatarVehicleMount.js and
// core/AvatarVehicleDismountTransition.js each already carry their own
// small, independent validation rather than reaching for a shared
// "vehicle-shaped thing" abstraction nothing has asked for. The two
// types answer genuinely different questions — VehiclePresence answers
// "does a vehicle exist at this deterministic slot, and what is it,"
// VehicleInstance answers "given that a vehicle exists, where is it
// RIGHT NOW" — and collapsing them would make the very distinction this
// milestone exists to draw disappear back into one overloaded object.
//
// VehicleType.NONE IS REJECTED HERE TOO, FOR THE SAME REASON
// core/VehiclePresence.js's OWN HEADER ALREADY GIVES. "No vehicle" is
// represented by there being no VehicleInstance at all, never a
// VehicleInstance of type NONE — a runtime instance is asserted only
// once a vehicle genuinely exists to have one.
//
// IMMUTABLE AND GETTER-ONLY, FROZEN — the same
// `Object.freeze(this)`-enforced discipline
// core/VehiclePresence.js/core/AvatarVehicleMount.js already apply to
// themselves, for the identical reason: this milestone is opening a new
// contract, not leaning on an established one, so it enforces the
// property it promises rather than merely suggesting it.
//
// THIS MILESTONE ESTABLISHES STATE, IT DOES NOT PRODUCE OR CONSUME IT
// ANYWHERE ELSE YET. Nothing in application/ or ui/ constructs a
// VehicleInstance, calls withPosition(), or reads spawnPosition/position
// as of this milestone — core/AvatarVehicleInteractionController.js
// still requeries raw VehiclePresence instances exactly as it did
// before, unchanged. That is deliberate, mirroring the exact restraint
// core/VehiclePresence.js's own 0.9.71 header already modeled ("id was
// deliberately absent... inventing one then would have meant guessing at
// a lifecycle... no seam had asked for yet") and core/AvatarVehicleMount.js's
// own 0.9.77 header restates for itself ("this milestone establishes
// state, it does not perform mounting"). A visible, moving vehicle needs
// this fact to exist FIRST — see this file's own "Deliberately not yet"
// list below for the ordered sequence this milestone opens the door to.
//
// Deliberately excluded, matching this milestone's own brief: any
// wiring into core/AvatarVehicleInteractionController.js,
// core/AvatarVehicleDismountPosition.js, or any other existing
// mount/dismount/proximity consumer (every one of them still reads a
// bare VehiclePresence, entirely unchanged by this milestone); vehicle
// rendering of any kind (a future 0.9.115's own job); vehicle movement,
// speed, heading, acceleration, or any physics that would actually
// CHANGE `position` over time (a future 0.9.116's own job — this
// milestone only gives `position` somewhere to live and a pure way to
// replace it, never a reason or a rule for WHEN it should); dismount
// (or any other transition) reading a VehicleInstance's current
// `position` instead of a VehiclePresence's fixed one (a future 0.9.117's
// own job); a "which VehicleInstance is this avatar mounted on" registry
// or session-held collection of any kind; persistence to a
// StorageProvider; networking or advertisement; collision or terrain
// interaction; keyboard/controller input; occupancy or capacity;
// battery/fuel/health/inventory; equality/comparison helpers beyond
// what `id` (a plain string) and `Position#equals()` already give a
// caller for free.
//
// 0.9.123 — Vehicle Orientation adds exactly ONE more runtime fact,
// alongside `position`, for the identical reason `position` itself was
// added here rather than to core/VehiclePresence.js: a moving vehicle's
// current FACING is a runtime fact that can change independently of
// anything core/VehiclePlacement.js ever computes.
//
//   heading = a current runtime fact, in DEGREES — the exact same
//             representation core/AvatarMovementSimulation.js's own
//             `rotationY` already uses (0 = facing +Z, 90 = facing +X,
//             per that file's own `dx = sin(radians)*stepDistance,
//             dz = cos(radians)*stepDistance` step formula). Defaults to
//             `0` when omitted — NEVER derived from `position` or
//             `spawnPosition` here, and never invented from nothing: a
//             vehicle that has never moved has no real fact about which
//             way it is "facing," so this file settles for the same
//             neutral default core/AvatarPresence.js's own
//             `rotation = {x:0, y:0, z:0}` already settles for, rather
//             than pretending a deterministic placement fact exists that
//             it does not.
//
// withHeading(nextHeading) IS THE ONLY WAY `heading` EVER CHANGES, AND
// IT NEVER TOUCHES `position`/`spawnPosition` — the identical
// "one fact, one explicit replacement method" discipline `withPosition()`
// already established for itself. A caller that wants to change BOTH
// facts on the same tick (ordinarily
// application/AvatarVehicleMovementController.js, once movement genuinely
// changes a vehicle's horizontal position) calls both methods explicitly
// — `withPosition()` deliberately does NOT recompute `heading` as a
// side effect, and `withHeading()` deliberately does NOT touch
// `position`. Two explicit operations, never one method silently doing
// the other's job — see docs/Roadmap.md, 0.9.123, "keeps the data model
// operations explicit."
//
// vehicleInstanceFromPresence() sets `heading` to the same neutral `0`
// default described above — core/VehiclePresence.js has no facing
// concept of its own to copy, and this file never invents one.

function isNonEmptyString(value) {
    return typeof value === 'string' && value.length > 0;
}

function isFiniteCoordinate(value) {
    return typeof value === 'number' && Number.isFinite(value);
}

function toHeading(value) {
    if (value === undefined) {
        return 0;
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`VehicleInstance requires heading to be a finite number when provided, got ${JSON.stringify(value)}`);
    }
    return value;
}

function toPosition(value, fieldName) {
    if (value instanceof Position) {
        return value;
    }
    if (
        value !== null
        && typeof value === 'object'
        && !Array.isArray(value)
        && isFiniteCoordinate(value.x)
        && isFiniteCoordinate(value.y)
        && isFiniteCoordinate(value.z)
    ) {
        return new Position(value.x, value.y, value.z);
    }
    throw new Error(`VehicleInstance requires ${fieldName} to be a Position (or {x, y, z}) with finite numeric x, y, and z, got ${JSON.stringify(value)}`);
}

export class VehicleInstance {
    constructor({ id, type, spawnPosition, position, heading } = {}) {
        if (!isNonEmptyString(id)) {
            throw new Error(`VehicleInstance requires a non-empty string id, got ${JSON.stringify(id)}`);
        }
        if (!isValidVehicleType(type)) {
            throw new Error(`VehicleInstance requires a valid VehicleType, got ${JSON.stringify(type)}`);
        }
        if (type === VehicleType.NONE) {
            throw new Error('VehicleInstance cannot represent VehicleType.NONE — "no vehicle" is the absence of a VehicleInstance, not an instance of type NONE');
        }

        this._id = id;
        this._type = type;
        this._spawnPosition = toPosition(spawnPosition, 'spawnPosition');
        // `position` defaults to `spawnPosition` — a vehicle that has
        // never been given a runtime position of its own IS, by
        // definition, still at its deterministic spawn point. See this
        // file's own header, "position = a current runtime fact...
        // starts equal to spawnPosition."
        this._position = position === undefined ? this._spawnPosition : toPosition(position, 'position');
        this._heading = toHeading(heading);
        Object.freeze(this);
    }

    get id() { return this._id; }
    get type() { return this._type; }
    get spawnPosition() { return this._spawnPosition; }
    get position() { return this._position; }
    get heading() { return this._heading; }

    // The ONE way `position` ever changes — see this file's own header,
    // "withPosition() is the only way position ever changes." Returns a
    // brand new VehicleInstance; `this` is never mutated, and
    // `spawnPosition` is carried forward by reference, untouched.
    // `heading` is likewise carried forward unchanged — see this file's
    // own 0.9.123 header, "withPosition() deliberately does NOT
    // recompute heading as a side effect."
    withPosition(nextPosition) {
        return new VehicleInstance({
            id: this._id,
            type: this._type,
            spawnPosition: this._spawnPosition,
            position: nextPosition,
            heading: this._heading
        });
    }

    // 0.9.123 — the ONE way `heading` ever changes, the direct
    // structural twin of withPosition() above. `position`/`spawnPosition`
    // are carried forward untouched.
    withHeading(nextHeading) {
        return new VehicleInstance({
            id: this._id,
            type: this._type,
            spawnPosition: this._spawnPosition,
            position: this._position,
            heading: nextHeading
        });
    }

    toJSON() {
        return {
            id: this._id,
            type: this._type,
            spawnPosition: this._spawnPosition.toJSON(),
            position: this._position.toJSON(),
            heading: this._heading
        };
    }

    static fromJSON(json) {
        return new VehicleInstance({
            id: json.id,
            type: json.type,
            spawnPosition: Position.fromJSON(json.spawnPosition),
            position: Position.fromJSON(json.position),
            heading: json.heading
        });
    }
}

// The one entry point that bridges deterministic placement into runtime
// state. See this file's own header, "vehicleInstanceFromPresence() is
// the one bridge." Takes the actual VehiclePresence a caller already
// has (ordinarily one element of a `vehiclePresenceInRegion()` result),
// never a bare vehicle id — the same "takes the actual VehiclePresence"
// discipline core/AvatarVehicleDismountPosition.js's own header already
// established, for the identical reason: this file has no vehicle
// lookup/registry of its own, and invents none.
export function vehicleInstanceFromPresence(presence) {
    if (!(presence instanceof VehiclePresence)) {
        throw new Error('vehicleInstanceFromPresence requires a VehiclePresence instance');
    }
    return new VehicleInstance({
        id: presence.id,
        type: presence.type,
        spawnPosition: presence.position,
        position: presence.position,
        // No deterministic facing fact exists — see this file's own
        // 0.9.123 header, "vehicleInstanceFromPresence() sets heading to
        // the same neutral 0 default."
        heading: 0
    });
}

// `value` must be a real VehicleInstance instance — unlike
// core/AvatarVehicleMount.js's own `isValidAvatarVehicleMount()`, `null`
// is NOT a valid VehicleInstance: "no vehicle" is the absence of an
// instance (a missing entry, an empty collection), never a value this
// function is asked to validate as an acceptable in-band `null`. A
// caller checking "is there a vehicle here" tests presence/absence of
// the VehicleInstance itself, not the shape of one.
export function isValidVehicleInstance(value) {
    return value instanceof VehicleInstance;
}

// Deliberately not yet: see this file's own header, "Deliberately
// excluded," for the full list — in short, everything about WHEN or WHY
// `position` should change, and every existing mount/dismount/rendering
// consumer reading a VehicleInstance instead of a bare VehiclePresence,
// stays out of scope for this milestone. See docs/Roadmap.md, 0.9.114,
// for the ordered sequence (0.9.115 rendering, 0.9.116 movement, 0.9.117
// vehicle-aware dismount) this milestone opens the door to without
// building any of it itself.
