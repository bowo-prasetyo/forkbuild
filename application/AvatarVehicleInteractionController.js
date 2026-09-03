import { DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import { VehicleType } from '../core/VehicleType.js';
import {
    AvatarVehicleInteractionIntent,
    deriveAvatarVehicleInteractionIntent
} from '../core/AvatarVehicleInteractionIntent.js';
import {
    resolveAvatarVehicleInteractionTarget
} from '../core/AvatarVehicleInteractionTarget.js';
import { deriveAvatarVehicleMount } from '../core/AvatarVehicleMountTransition.js';
import {
    deriveAvatarVehicleDismountIntent
} from '../core/AvatarVehicleDismountIntent.js';
import {
    resolveAvatarVehicleDismountPosition
} from '../core/AvatarVehicleDismountPosition.js';
import {
    isAvatarVehicleDismountPositionClear
} from '../core/AvatarVehicleDismountClearance.js';
import {
    deriveAvatarVehicleDismountTransition
} from '../core/AvatarVehicleDismountTransition.js';
import { VEHICLE_INTERACTION_RADIUS } from '../core/AvatarVehicleProximity.js';
import { vehiclePresenceInRegion } from '../core/VehiclePlacement.js';
import { treeCollisionCandidatesForMovement } from '../core/AvatarTreeCollisionQuery.js';

// 0.9.83 — Avatar-Vehicle Mount/Dismount Runtime Integration.
//
// 0.9.73 through 0.9.82 built a complete mount/dismount semantic chain —
// proximity, identity, intent, target resolution, a mount descriptor, a
// mount transition, dismount intent, dismount destination resolution,
// destination clearance, and a dismount transition — entirely inside
// core/, entirely uncalled by anything else in this codebase (see
// docs/Roadmap.md, 0.9.82's own closing paragraph: "the next step is
// deliberately NOT another small core abstraction — it is integrating
// this now-complete chain into the actual World View/navigation
// runtime"). This file is that integration, and ONLY that integration:
//
//   raw "is the interaction key held" fact
//           |
//           v
//   AvatarVehicleInteractionIntent / AvatarVehicleDismountIntent
//           |
//           v
//   AvatarVehicleInteractionTarget  (mount path only)
//           |
//           v
//   AvatarVehicleMountTransition  /  AvatarVehicleDismountPosition
//                                    -> AvatarVehicleDismountClearance
//                                    -> AvatarVehicleDismountTransition
//           |
//           v
//   this controller's own `mount` state, and (dismount only) a new
//   AvatarPresence position
//
// THIS FILE CONTAINS NO MOUNT/DISMOUNT POLICY OF ITS OWN. Every actual
// decision — is a target in range, is a destination clear, does an
// intent + current state actually transition — is made entirely inside
// the nine already-complete, already-independently-tested pure
// functions this class calls. This class supplies exactly the three
// things none of those functions is allowed to supply for itself: WHERE
// the avatar currently is (AvatarPresenceSession), WHICH vehicles
// currently exist nearby (a seed-driven query — see "Vehicle lookup"
// below), and WHEN to ask (once per animation frame, from whatever raw
// key state it was told about).
//
// A ONE-SHOT ACTION, DERIVED FROM A HELD-KEY POLL — THE SAME SHAPE
// application/AvatarMovementController.js ALREADY USES FOR W/A/S/D/
// SHIFT/SPACE. `keyDown('e')`/`keyUp('e')` only ever record "is the
// interaction key CURRENTLY held," mirroring that class's own `_keys`
// object; `tick()` re-evaluates the mount/dismount rule fresh every
// frame from whatever is currently held, mirroring that class's own
// `_currentMovementState()`. This is deliberately NOT "call an
// `interact()` method once on a keydown edge": a real browser fires
// repeated keydown events for one held key (auto-repeat), and this
// controller must never treat each of those as a fresh discrete
// request.
//
// WHY HELD STATE ALONE IS NOT ENOUGH, AND WHAT `_interactKeyConsumed`
// FIXES. core/AvatarVehicleInteractionIntent.js's and
// core/AvatarVehicleDismountIntent.js's own headers are each correct in
// isolation — asserting MOUNT every tick while already mounted is a
// no-op (0.9.78's own idempotence), and the identical argument holds
// for DISMOUNT once unmounted. But this controller routes ONE shared
// key to TWO different intents depending on current `mount` state
// (below), and `mount` can change to `null` in the MIDDLE of a single
// held press — the exact tick a dismount succeeds. Held-state-only
// polling would then route the VERY NEXT tick, key still physically
// down, into `_tickMount()` instead — and since a just-dismounted
// avatar stands well within the same vehicle's own interaction radius
// (`BICYCLE_DISMOUNT_OFFSET_X` is 1, `VEHICLE_INTERACTION_RADIUS` is
// 1.5), it would immediately remount the vehicle it just dismounted, a
// real mount<->dismount ping-pong within one continuous key press.
// `_interactKeyConsumed` closes exactly that gap: once a press has
// caused ONE transition (either direction), `requested` is held false
// for the REST of that same press, regardless of how many further
// ticks the key stays down — releasing the key is what re-arms it. A
// player must genuinely release and re-press the key to toggle a
// second time, and within one physical press, at most one transition
// ever fires.
//
// MOUNT AND DISMOUNT SHARE ONE KEY, NEVER BOTH LIVE AT ONCE. Which
// intent is even asked for is decided by this controller's own current
// `mount` state — not mounted asks MOUNT, mounted asks DISMOUNT. This
// is a runtime input-routing decision, not a new core vocabulary: it
// never merges core/AvatarVehicleInteractionIntent.js and
// core/AvatarVehicleDismountIntent.js into one enum, and neither core
// function ever learns the other exists.
//
// WHERE DOES `mount` LIVE? This is the one open architectural question
// the milestone brief asked this integration to answer, and the answer
// this milestone gives is: RIGHT HERE, on this controller, not folded
// into AvatarPresenceSession (which owns WHERE the avatar is, signed
// and broadcast — see core/AvatarVehicleMount.js's own header for why
// growing AvatarPresence with a `mountedVehicleId` was explicitly
// rejected) and not folded into AvatarMovementController (which owns
// raw movement key state and the kinematics tick, and this milestone
// deliberately never touches — see "No movement coupling" below). A
// mount relationship is neither of those; it is its own small piece of
// session-local runtime state, exactly as small as
// core/AvatarVehicleMount.js's own descriptor already is. `mount()`
// exists so a caller (a future UI indicator, a future movement-
// capability seam) can read it without this controller growing a
// second, differently-shaped way to ask "is the avatar mounted."
//
// VEHICLE LOOKUP: A REQUERY, NEVER A REGISTRY. Both the mount path
// (0.9.76's own `vehicles` argument) and the dismount path (0.9.80's
// own "takes the actual VehiclePresence, never a vehicle id") need real
// VehiclePresence instances, and nothing in this codebase yet holds a
// "currently known vehicles" collection for a session to read (unlike
// buildings/placements, which DO stream through a document-backed
// registry — see application/AvatarMovementConstraint.js's own
// "currently loaded" concern). Rather than inventing one, `_nearbyVehicles()`
// below extends the exact pattern application/AvatarTreeConstraint.js
// already established for trees: vehicles, like trees, are a PURE
// function of (seed, x, z) — core/VehiclePlacement.js's own header,
// "recomputed, never stored" — so a small, seed-scoped, stateless
// region requery around the avatar's own current position is already
// the correct "currently available" answer, with no registry, no
// caching, and no synchronization concern of any kind. The SAME requery
// serves both jobs: for mounting, its result becomes 0.9.76's own
// `vehicles` candidate list; for dismounting, this controller searches
// that identical result for the one whose id matches `mount.vehicleId`
// (see "A known boundary," below, for the one case this can miss).
//
// A KNOWN BOUNDARY, DELIBERATELY LEFT OPEN — NO MOVEMENT COUPLING.
// core/AvatarVehicleMountTransition.js's own header is explicit that
// mounting causes "no movement changes," and this milestone's own brief
// is equally explicit that vehicle movement, and any coupling between
// mount state and AvatarMovementController, is OUT OF SCOPE. That
// means this controller never disables, slows, or otherwise touches
// ordinary W/A/S/D movement while mounted — an avatar can still walk
// away from a vehicle it is nominally "mounted" on. If it walks far
// enough that the vehicle no longer falls inside `_nearbyVehicles()`'s
// own query rectangle, `_findMountedVehicle()` returns nothing,
// `resolveAvatarVehicleDismountPosition()` is never even called, and
// the dismount transition's own honest `dismountPosition: null` case
// (0.9.80's own "no destination known") leaves the avatar mounted with
// its position unchanged — never a crash, never a silently wrong
// teleport, just "no destination is known from here." Deciding what a
// mounted avatar's movement should even mean is exactly the seam
// docs/Roadmap.md's own 0.9.82 closing paragraph deferred to whatever
// comes after this milestone; this controller does not guess at it.
export class AvatarVehicleInteractionController {
    constructor(avatarPresenceSession, { seed = DEFAULT_WORLD_SEED } = {}) {
        this._avatarPresenceSession = avatarPresenceSession;
        this._seed = seed;
        this._interactKeyHeld = false;
        // 0.9.83 — set the moment a held press causes ONE mount/dismount
        // transition, cleared only on keyUp. See this file's own header,
        // "Why held state alone is not enough."
        this._interactKeyConsumed = false;
        this._mount = null;
    }

    // The avatar's current AvatarVehicleMount, or `null` when not
    // mounted — a read-only debug/UI surface, the same posture
    // application/AvatarMovementController.js's own isCollided()/
    // verticalState() already establish for their own transient state.
    mount() {
        return this._mount;
    }

    // 0.9.85 — the VehicleType of the vehicle this controller is
    // currently mounted on, or VehicleType.NONE when not mounted —
    // never `null`, mirroring core/AvatarVehicleMovementCapability.js's
    // own header: "VehicleType.NONE is passed for 'not currently
    // mounted,' reusing the exact value core/VehicleType.js's own
    // header already reserved for this," never a second not-mounted
    // spelling alongside `mount`'s own `null`. Reuses the exact
    // `_findMountedVehicle()` lookup `_tickDismount()` already performs
    // below — see this file's own header, "Vehicle lookup: a requery,
    // never a registry" — rather than a second copy of the same
    // seed-scoped query. Read by application/WorldNavigationSession.js,
    // once per animation frame, to resolve the local avatar's current
    // movement capability (core/AvatarVehicleMovementCapability.js) —
    // the one new consumer 0.9.85 adds for this controller's own
    // `mount` state, and still not application/AvatarMovementController.js
    // itself, which never learns a VehicleType exists at all (see that
    // file's own 0.9.85 header).
    //
    // Subject to the exact same known boundary `_findMountedVehicle()`
    // itself already documents below ("A known boundary"): if the
    // avatar has walked far enough that the mounted vehicle no longer
    // falls inside `_nearbyVehicles()`'s own query rectangle, this
    // reports VehicleType.NONE even though `mount()` itself is still
    // non-null — the same honest "no destination is known from here"
    // this controller already settles for on the dismount path, never
    // a crash or a guessed type.
    mountedVehicleType() {
        if (!this._avatarPresenceSession || this._mount === null) {
            return VehicleType.NONE;
        }
        const avatarPosition = this._avatarPresenceSession.current.position;
        const vehicle = this._findMountedVehicle(avatarPosition);
        return vehicle ? vehicle.type : VehicleType.NONE;
    }

    // 0.9.98 — Vehicle Mount/Dismount World View Integration. The one new
    // read-only observation seam this milestone adds — the controller-
    // level counterpart to application/AvatarMovementController.js's own
    // `movementState()` (0.9.97). A caller (ordinarily
    // application/WorldNavigationSession.js, ordinarily World View
    // itself, on its own independent poll cadence) needs to know, at any
    // moment, whether to present a "[E] Mount" or "[E] Dismount"
    // affordance and which vehicle type it refers to — WITHOUT
    // recomputing proximity or target resolution itself:
    //
    //   mounted
    //       -> { mounted: true, vehicleType: <mounted vehicle's type>,
    //            targetVehicleId: null }
    //   not mounted, a vehicle is in interaction range
    //       -> { mounted: false, vehicleType: <that vehicle's type>,
    //            targetVehicleId: <its id> }
    //   not mounted, nothing in range
    //       -> { mounted: false, vehicleType: VehicleType.NONE,
    //            targetVehicleId: null }
    //
    // REUSES resolveAvatarVehicleInteractionTarget() — never a second
    // nearest-candidate search. `_tickMount()` only ever calls that
    // function with a REAL, key-driven `interactionIntent` (NONE most
    // ticks, MOUNT only the instant the key is actually held), because
    // ITS job is deciding whether to actually mount. This method's job is
    // different — "what WOULD be targeted right now" — so it always asks
    // with `interactionIntent` forced to MOUNT, purely to read 0.9.76's
    // own ranked-candidate answer as a PREVIEW. This is not a second
    // target-resolution policy: it is the exact same pure function,
    // called for observation rather than for a decision — the same
    // posture `mountedVehicleType()` above already takes, reusing
    // `_findMountedVehicle()`'s own query for a read rather than a
    // transition.
    //
    // NEVER CALLED FROM tick(). A UI observation seam must never itself
    // influence the actual mount/dismount decision, and never does here —
    // this method is called only from OUTSIDE the tick loop, exactly like
    // `mount()`/`mountedVehicleType()` above already are.
    //
    // A plain, frozen object — not a new class — the identical posture
    // `AvatarMovementController#movementState()` already established for
    // the same reason: every field is already a primitive or a plain
    // string, so `Object.freeze()` alone keeps a caller from ever
    // mutating this controller's own bookkeeping through the returned
    // value.
    vehicleInteractionState() {
        if (!this._avatarPresenceSession) {
            return Object.freeze({ mounted: false, vehicleType: VehicleType.NONE, targetVehicleId: null });
        }
        if (this._mount !== null) {
            return Object.freeze({
                mounted: true,
                vehicleType: this.mountedVehicleType(),
                targetVehicleId: null
            });
        }
        const avatarPosition = this._avatarPresenceSession.current.position;
        const vehicles = this._nearbyVehicles(avatarPosition);
        const { targetVehicleId } = resolveAvatarVehicleInteractionTarget({
            avatarPosition,
            vehicles,
            interactionIntent: AvatarVehicleInteractionIntent.MOUNT
        });
        const targetVehicle = targetVehicleId
            ? vehicles.find((vehicle) => vehicle.id === targetVehicleId)
            : null;
        return Object.freeze({
            mounted: false,
            vehicleType: targetVehicle ? targetVehicle.type : VehicleType.NONE,
            targetVehicleId
        });
    }

    // Returns true when `key` is the one this controller understands,
    // so a caller knows whether to preventDefault/swallow the event —
    // the same contract application/AvatarMovementController.js#keyDown/
    // keyUp already establish for W/A/S/D/Shift/Space.
    keyDown(key) {
        return this._setKey(key, true);
    }

    keyUp(key) {
        return this._setKey(key, false);
    }

    // Releases the held interaction key without changing `mount` —
    // called wherever application/AvatarMovementController.js#releaseAll()
    // already is (Avatar Control Mode turning off, a window blur), for
    // the identical reason: a key event the browser never delivered
    // must never leave this controller reading a permanently-held key.
    // `mount` itself survives, exactly like AvatarMovementController's
    // own `_continuousMovementIntent` survives releaseAll() — losing
    // keyboard focus must never silently dismount the avatar.
    releaseAll() {
        this._interactKeyHeld = false;
        this._interactKeyConsumed = false;
    }

    // Re-evaluates the mount/dismount rule from whatever is currently
    // held. Called once per animation frame, alongside
    // AvatarMovementController#tick() — see this file's own header for
    // why polling held state here, rather than reacting to a single
    // keydown edge, is what makes holding the key harmless, and why
    // `_interactKeyConsumed` — not `_interactKeyHeld` alone — is what
    // is actually passed down as this tick's request.
    tick() {
        if (!this._avatarPresenceSession) {
            return;
        }
        const requested = this._interactKeyHeld && !this._interactKeyConsumed;
        if (this._mount === null) {
            this._tickMount(requested);
        } else {
            this._tickDismount(requested);
        }
    }

    // Composes exactly the three 0.9.75/0.9.76/0.9.78 primitives the
    // milestone brief's own "Mount" diagram names, in that order — no
    // rule of its own beyond "which vehicles are currently nearby."
    _tickMount(requested) {
        const avatarPosition = this._avatarPresenceSession.current.position;
        const interactionIntent = deriveAvatarVehicleInteractionIntent({
            mountRequested: requested
        });
        const vehicles = this._nearbyVehicles(avatarPosition);
        const { targetVehicleId } = resolveAvatarVehicleInteractionTarget({
            avatarPosition,
            vehicles,
            interactionIntent
        });
        const nextMount = deriveAvatarVehicleMount({
            currentMount: this._mount,
            interactionIntent,
            targetVehicleId
        });
        if (nextMount !== this._mount) {
            this._interactKeyConsumed = true;
        }
        this._mount = nextMount;
    }

    // Composes exactly the four 0.9.79/0.9.80/0.9.81/0.9.82 primitives
    // the milestone brief's own "Dismount" diagram names, in that
    // order. The one piece none of those four files is allowed to
    // supply for itself — an actual VehiclePresence for the mounted
    // vehicle — comes from `_findMountedVehicle()` below.
    _tickDismount(requested) {
        const currentPosition = this._avatarPresenceSession.current.position;
        const dismountIntent = deriveAvatarVehicleDismountIntent({
            dismountRequested: requested
        });
        const vehicle = this._findMountedVehicle(currentPosition);
        const dismountPosition = vehicle
            ? resolveAvatarVehicleDismountPosition(vehicle)
            : null;
        const destinationClearance = dismountPosition
            ? isAvatarVehicleDismountPositionClear({
                position: dismountPosition,
                treeCollisions: treeCollisionCandidatesForMovement({
                    seed: this._seed,
                    currentPosition: dismountPosition,
                    requestedPosition: dismountPosition
                })
            })
            : null;

        const transition = deriveAvatarVehicleDismountTransition({
            currentMount: this._mount,
            currentPosition,
            dismountIntent,
            dismountPosition,
            destinationClearance
        });
        if (transition.mount !== this._mount) {
            this._interactKeyConsumed = true;
        }
        this._mount = transition.mount;
        if (transition.position !== currentPosition) {
            const current = this._avatarPresenceSession.current;
            this._avatarPresenceSession.update({
                position: transition.position,
                rotation: current.rotation,
                animation: current.animation
            });
        }
    }

    // The one vehicle this controller is currently mounted on, re-found
    // fresh from `_nearbyVehicles()` — never cached, since a fresh
    // VehiclePresence for the SAME conceptual vehicle is reconstructed
    // as a new object on every query (core/VehicleIdentity.js's own
    // header). Returns `null` when the mounted vehicle no longer falls
    // inside the query — see this file's own header, "A known
    // boundary."
    _findMountedVehicle(avatarPosition) {
        const vehicles = this._nearbyVehicles(avatarPosition);
        return vehicles.find((vehicle) => vehicle.id === this._mount.vehicleId) || null;
    }

    // A half-open square of side `2 * VEHICLE_INTERACTION_RADIUS`
    // centered on the avatar, handed straight to
    // core/VehiclePlacement.js#vehiclePresenceInRegion() — a strict
    // superset of the circle core/AvatarVehicleProximity.js#withinRadiusXZ()
    // itself tests against, so this query never excludes a vehicle
    // either 0.9.76's target resolution or this controller's own
    // dismount lookup could otherwise consider in range. See this
    // file's own header, "Vehicle lookup: a requery, never a registry."
    _nearbyVehicles(avatarPosition) {
        return vehiclePresenceInRegion(
            this._seed,
            avatarPosition.x - VEHICLE_INTERACTION_RADIUS,
            avatarPosition.z - VEHICLE_INTERACTION_RADIUS,
            avatarPosition.x + VEHICLE_INTERACTION_RADIUS,
            avatarPosition.z + VEHICLE_INTERACTION_RADIUS
        );
    }

    // On release, also re-arms `_interactKeyConsumed` — a fresh press
    // must always be able to act, exactly once, even after a press
    // that already caused a transition. See this file's own header,
    // "Why held state alone is not enough."
    _setKey(key, isDown) {
        switch (String(key || '').toLowerCase()) {
            case 'e':
                this._interactKeyHeld = isDown;
                if (!isDown) {
                    this._interactKeyConsumed = false;
                }
                return true;
            default: return false;
        }
    }
}

// Deliberately not yet: vehicle movement, speed, or any DIRECT coupling
// with application/AvatarMovementController.js (see this file's own
// header, "A known boundary — no movement coupling") — this file still
// never imports or references that class; 0.9.85's own `mountedVehicleType()`
// above is a pure read of this controller's already-existing vehicle
// lookup, and application/WorldNavigationSession.js is the one place
// that composes it into an actual movement-capability change, never
// this file. 0.9.98's own `vehicleInteractionState()` above is likewise
// a pure read — no vehicle-type label, no keyboard-hint string, no
// rendering of any kind lives here; that formatting is
// ui/components/VehicleInteractionPrompt.js's job, never this
// controller's. Also not yet: vehicle switching while
// already mounted (0.9.78's own no-op rule already prevents it, and
// this controller invents no override); a persistent vehicle registry
// of any kind (see "Vehicle lookup: a requery, never a registry");
// animation, camera changes, or rendering of any kind; a second
// interaction key for a future non-bicycle vehicle type; remounting
// policy beyond what 0.9.78's own idempotence already gives for free;
// networking or persistence of `mount` (it is exactly as ephemeral,
// local, and unsigned as AvatarPresence's own position — see
// core/AvatarPresence.js's own header); collision or physics beyond
// the existing tree-clearance check 0.9.81 already supplies. See
// docs/Roadmap.md, 0.9.83, for the full pre-0.9.85 list, and 0.9.85 for
// `mountedVehicleType()` itself.
