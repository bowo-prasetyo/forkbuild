import { AvatarMovementState } from '../core/AvatarMovementState.js';
import { simulateAvatarMovement } from '../core/AvatarMovementSimulation.js';
import { deriveAvatarVerticalState } from '../core/AvatarVerticalState.js';
import { AvatarContinuousMovementIntent, isValidAvatarContinuousMovementIntent } from '../core/AvatarContinuousMovementIntent.js';
import { AvatarContinuousMovementMode, isValidAvatarContinuousMovementMode } from '../core/AvatarContinuousMovementMode.js';
import { AvatarMovementCapabilityKind, isValidAvatarVehicleMovementCapability } from '../core/AvatarVehicleMovementCapability.js';
import { AvatarVehicleBrakingIntent, isValidAvatarVehicleBrakingIntent } from '../core/AvatarVehicleBrakingIntent.js';

// 0.2.36 — the ONE place raw input becomes an AvatarPresence update.
// See docs/Principles.md, "Input Changes Presence; Presence Changes
// The Renderer": this class never touches a Three.js object, and
// renderer/AvatarVisual.js never reads a key state — the two only
// ever meet through AvatarPresenceSession, exactly the same
// separation 0.2.35 already drew between "what an avatar looks like"
// and "where it is."
//
//   keyDown/keyUp     — raw input, called by WorldNavigationSession's
//                        avatarKeyDown/avatarKeyUp (itself called by
//                        the UI only while Avatar Control Mode is on)
//   tick(deltaSeconds) — called once per render frame; runs the pure
//                        core/AvatarMovementSimulation.js step and,
//                        ONLY if something actually changed, publishes
//                        a new AvatarPresence
//
// `_verticalVelocity`/`_grounded` are this controller's own small bit
// of physics bookkeeping between ticks — deliberately NOT part of
// AvatarPresence (see core/AvatarMovementSimulation.js's own header:
// AvatarPresence is the RESULT of simulation, never the simulation
// itself; a future network peer receiving presence updates has no
// reason to know or care about the sender's mid-air vertical speed).
//
// 0.2.42 — `movementConstraint` (optional — see docs/Principles.md,
// the same "enforce/offer only when wired" posture every other
// optional collaborator in this codebase already follows) sits
// between the pure simulation step and the presence update: given
// where the avatar IS and where the simulation says it WOULD go, it
// returns where it's actually ALLOWED to go plus whether that was
// altered by collision — see application/AvatarMovementConstraint.js.
// This class still owns "when do we simulate a tick and publish
// presence"; it never touches a Brick, a Document, or a WorldPlacement
// itself.
//
// 0.2.77 — `terrainConstraint` (optional, same posture) sits right
// after `movementConstraint` in the same pipeline: given where the
// avatar IS and where it would go AFTER building collision already
// resolved, it returns whether that horizontal step is walkable —
// see application/AvatarTerrainConstraint.js. Applied second,
// deliberately: building collision decides what geometry blocks
// passage at all, terrain walkability decides whether the remaining
// candidate step is too steep to climb. Same reasoning that keeps
// `movementConstraint` optional applies here — a controller built
// without one behaves exactly as it did before this milestone.
//
// 0.3.2 — `stepConstraint` (optional, same posture again) sits LAST,
// after `terrainConstraint` — see application/AvatarStepConstraint.js's
// own header for the full pipeline reasoning. It also changes ONE
// thing earlier in this method: with a stepConstraint wired, this
// class reads the avatar's CURRENT support height (stepConstraint.
// supportHeightAt()) before simulating at all, and feeds it to both
// simulateAvatarMovement() (as `groundHeight`, so gravity/landing
// resolve against whatever surface the avatar already stands on, not
// an absolute Y=0 plane) and movementConstraint.apply() (as
// `supportHeight`, so a climbable low brick never blocks horizontal
// passage in the first place — see AvatarMovementConstraint's own
// 0.3.2 comment). A controller built without a stepConstraint computes
// none of this and behaves exactly as it did before this milestone.
//
// 0.3.4 — Vertical World Navigation. `stepConstraint.apply()` can now
// report `falling: true` — the resolved horizontal step walks the
// avatar off the edge of whatever it was standing on (see that class's
// own header). This is the ONE new thing `tick()` does: when that
// happens, `_grounded` is forced to `false` for the NEXT tick,
// regardless of what this tick's own `simulateAvatarMovement()` result
// said (it still said `grounded: true` — the avatar WAS standing on
// something when this tick began; it just walked past the edge of it
// during the tick). No other new bookkeeping — `_verticalVelocity` is
// already `0` at that moment (a grounded tick always zeroes it — see
// core/AvatarMovementSimulation.js), so the very next tick's gravity
// integration starts cleanly from rest, exactly like the top of any
// other fall.
//
// 0.9.63 — `treeConstraint` (optional, same "enforce/offer only when
// wired" posture as every other constraint here) is APPENDED last,
// both in this constructor's own parameter list and in tick()'s own
// pipeline below — the same append-only convention `stepConstraint`
// itself already followed relative to `terrainConstraint`, so no
// existing positional caller (test or otherwise) is disturbed by its
// addition. It runs on whatever position building collision, terrain
// slope, and step height have already produced, and only ever adjusts
// X/Z — see application/AvatarTreeConstraint.js's own header for why
// running it last is safe: tree collision never reads or writes Y, so
// it cannot undo any ground/brick snap `stepConstraint` already
// resolved. A controller built without a treeConstraint computes none
// of this and behaves exactly as it did before this milestone.
//
// 0.9.66 — Continuous Movement Controller Integration. This class now
// tracks ONE more piece of caller-owned state between ticks —
// `_continuousMovementIntent` (core/AvatarContinuousMovementIntent.js's
// own NONE/FORWARD/BACKWARD vocabulary) — and consults it in exactly
// ONE place, `_currentMovementState()`'s own forwardAxis: whenever
// neither W nor S is physically held, a persistent FORWARD/BACKWARD
// intent drives forwardAxis instead of leaving it at 0. That is the
// ENTIRE integration. No new pipeline stage was added to tick(): a
// continuously-moving avatar produces exactly the same
// AvatarMovementState shape an ordinarily-walking one already did, so
// it runs through simulateAvatarMovement() and every constraint below
// (building, terrain, step, tree) completely unmodified — "continuous
// movement is an additional SOURCE of movement intent, never a second
// movement system."
//
// The priority this milestone establishes, in `_currentMovementState()`:
// ordinary W/S input (when either is held) always wins outright — even
// when both cancel to a net zero axis, that is still "the player is
// actively working the ordinary keys" and continuous intent stays
// silent; only once NEITHER is held does continuous intent get a say;
// with neither held and no continuous intent, the result is plain
// idle. Exactly the three-line priority rule the design brief asked
// for, and no more.
//
// `setContinuousMovementIntent(intent)` is the ONLY way this value
// ever changes, and this class never asks where it came from —
// exactly like `_keys` never asks whether a `keyDown('w')` call came
// from a real keyboard, a UI button, a gamepad, or a test. Deliberately
// NOT wired here: no Alt detection, no
// core/AvatarContinuousMovementInputAdapter.js import, no raw-key
// translation of any kind — `if (alt && w)` conceptually never
// appears in this file, and it couldn't, because this file has no idea
// an "Alt" exists. That seam belongs one layer up, in
// `application/WorldNavigationSession.js#avatarKeyDown`/`avatarKeyUp`
// — the same place raw keys already reach this class through
// `keyDown()`/`keyUp()` — which owns the keyboard-specific translation
// (core/AvatarContinuousMovementInputAdapter.js +
// core/AvatarContinuousMovementIntent.js's own transition function) and
// calls `setContinuousMovementIntent()` with the result. This class
// merely CONSUMES the current intent value; the intent layer (0.9.64)
// and the input layer (0.9.65) together own its entire memory.
//
// `_continuousMovementIntent` is deliberately untouched by
// `releaseAll()` — releasing every physically-held key (a window blur,
// Avatar Control Mode turning off) is never a signal
// core/AvatarContinuousMovementIntent.js's own transition rule reads,
// and must not silently cancel a deliberately activated continuous
// walk any more than an ordinary keyup does. It is likewise untouched
// anywhere in tick() below: nothing after `_currentMovementState()` has
// already read it for this tick ever looks at it again — the
// constraints only ever see the resulting forwardAxis, exactly as they
// already do for ordinary W/S. "The world currently prevents further
// progress" and "the avatar still wants to keep going" are deliberately
// allowed to both be true at once — automatic obstacle avoidance/
// turning is explicitly out of scope for this milestone.
//
// 0.9.69 — Continuous Movement Direction + Mode Integration. This class
// now tracks a SECOND piece of caller-owned state between ticks,
// `_continuousMovementMode` (core/AvatarContinuousMovementMode.js's own
// NONE/WALK/RUN vocabulary), set only via `setContinuousMovementMode()`
// and read only by the new `_resolvedRunning()` — the direct structural
// twin of `_resolvedForwardAxis()` above, applying the identical
// priority rule to `AvatarMovementState.running` that 0.9.66 already
// applies to `forwardAxis`: ordinary W/S (when either is held) always
// drives `running` from the physically-held Shift key
// (`_keys.running`), exactly as it always has; only once neither is
// held does `_continuousMovementMode` get a say, resolving to `true`
// for RUN and `false` for WALK/NONE. `_currentMovementState()` calls
// `_resolvedRunning()` in place of the old direct `this._keys.running`
// read — the ONE line this milestone changes in that method, mirroring
// the ONE line 0.9.66 itself changed for forwardAxis.
//
// Deliberately NOT a new continuous-running speed, animation, or
// physics path: `_resolvedRunning()` still only ever feeds the existing
// `AvatarMovementState.running` boolean, which flows into the exact
// same `simulateAvatarMovement()` RUN_SPEED branch and
// `AvatarAnimationState.RUNNING` animation ordinary Shift+W already
// produces (see core/AvatarMovementSimulation.js). Continuous RUN and
// ordinary RUN converge to the identical AvatarMovementState shape
// BEFORE reaching simulation — there is no separate "continuous run"
// concept anywhere below this method.
//
// `_continuousMovementMode`, like `_continuousMovementIntent` before
// it, is deliberately untouched by `releaseAll()` and by every step of
// `tick()` after `_currentMovementState()` has already read it — the
// physical Shift/Alt keys releasing must never silently cancel a
// deliberately activated persistent RUN any more than releasing W/S
// cancels persistent FORWARD/BACKWARD. Cancellation remains governed
// entirely by `deriveAvatarContinuousMovementMode()`'s own ordinary-
// press rule (0.9.67), applied one layer up in
// `application/WorldNavigationSession.js`, exactly as direction
// cancellation already is.
//
// 0.9.85 — Vehicle Movement Capability Integration. 0.9.84
// (core/AvatarVehicleMovementCapability.js) answered "what movement
// capability kind does the avatar's current vehicle relationship
// imply," and deliberately stopped there — its own header is explicit
// that feeding a resolved capability into this class is "0.9.85's own
// job." This is that integration, and it adds exactly ONE new piece of
// caller-owned state, `_movementCapability`, plus ONE new guard clause
// in tick() below — no second movement pipeline, no per-vehicle
// controller, matching the exact discipline core/AvatarVehicleMovementCapability.js's
// own header already commits to.
//
// `setMovementCapability(capability)`/`movementCapability()` are the
// direct structural twins of `setContinuousMovementIntent()`/
// `continuousMovementIntent()` above: the ONLY way the value ever
// changes, a getter that degrades a never-set/invalid value to the
// documented default, and no other internal logic consults the setter
// input's own identity — only `_movementCapability.movementKind`/
// `.supported`, read in exactly two places (movementCapability() and
// tick()'s own new guard). `null` (never set, or set with anything that
// fails core/AvatarVehicleMovementCapability.js#isValidAvatarVehicleMovementCapability())
// means AvatarMovementCapabilityKind.WALK, fully supported — an avatar
// nobody has ever mounted on anything behaves EXACTLY as it did before
// this milestone existed, the default this milestone's own brief
// requires.
//
// THIS CLASS NEVER IMPORTS core/VehicleType.js, core/AvatarVehicleMount.js,
// OR core/VehiclePlacement.js/VehiclePresence.js — and never will, by
// design. It reads only `.movementKind`/`.supported` off whatever
// capability it is handed; it has no reason to know, and after this
// milestone still does not know, whether a GROUND_VEHICLE capability
// came from a bicycle, a motorcycle, a car, some future ground vehicle,
// or any other movement-affecting mechanism entirely. Resolving a
// vehicle relationship down to a capability, and deciding WHEN during a
// frame to hand it to this class, is entirely
// `application/WorldNavigationSession.js`'s own job (see that file's
// own 0.9.85 header) — this class only ever CONSUMES the result.
//
// UNSUPPORTED BLOCKS MOVEMENT; IT NEVER FALLS BACK TO WALK. Per
// core/AvatarVehicleMovementCapability.js's own header, `supported:
// false` currently means exactly one thing — AERIAL_VEHICLE/DRONE, "no
// flight/altitude system exists in this codebase yet to eventually
// drive." Silently running an unsupported capability through the
// existing on-foot pipeline would read as "a mounted drone walks,"
// destroying the exact semantic distinction 0.9.84 was written to make.
// tick() below instead returns `null` outright — no simulation, no
// constraint pipeline, no presence update — for as long as an
// unsupported capability is active, regardless of what keys are held.
// This also means `_verticalVelocity`/`_grounded` simply stop advancing
// for that same span, rather than letting gravity integrate against a
// vehicle relationship this codebase has no physics model for at all;
// once the capability changes back to something supported (a dismount,
// resolved one layer up), simulation resumes exactly where its own
// bookkeeping left off.
//
// NOT YET, AS OF 0.9.85: any numeric difference between WALK and
// GROUND_VEHICLE. 0.9.85 ran GROUND_VEHICLE through the IDENTICAL
// simulation/constraint pipeline WALK already used — same speed, same
// turning, same terrain/building/tree constraints — because that
// milestone answered only "can the existing movement system consume a
// vehicle-derived capability," never "what should a bicycle's own
// numbers be." See docs/Roadmap.md, 0.9.85, for that milestone's own
// scope boundary.
//
// 0.9.86 — Ground Vehicle Movement Speed Capability. The numeric
// difference 0.9.85 deliberately deferred now exists, and this class
// adds exactly ONE new thing to consume it: `_resolvedMovementSpeed()`
// below, the direct structural twin of `_resolvedRunning()` — read in
// exactly one place, tick()'s own call into
// `core/AvatarMovementSimulation.js#simulateAvatarMovement()`, as its
// new `movementSpeed` argument.
//
// THE SPEED-RESOLUTION SEAM STAYS OUTSIDE THE MOVEMENT CALCULATION
// ITSELF. This class still never brands a speed as "GROUND_VEHICLE" or
// multiplies anything by a vehicle-derived factor — it merely reads
// `this._movementCapability.movementSpeed` (a plain number,
// `core/AvatarVehicleMovementCapability.js`'s own job to have already
// decided) and hands it to the ONE existing simulation function, which
// decides how running interacts with it. `if (capability.movementKind
// === GROUND_VEHICLE) { speed *= 2; }` conceptually never appears in
// this file, and it couldn't — this class still has no `GROUND_VEHICLE`
// literal anywhere in its own code, exactly as before this milestone.
//
// RUNNING IS NOT REDEFINED; IT KEEPS DOING EXACTLY WHAT IT ALREADY DID.
// `_resolvedRunning()` (0.9.69) is completely untouched by this
// milestone — still the same ordinary-W/S-vs-continuous-mode priority
// rule, still feeding the same `AvatarMovementState.running` boolean.
// What changed is one layer down, inside `simulateAvatarMovement()`
// itself: running now doubles WHATEVER base speed is active (WALK's or
// a vehicle's), rather than jumping to a hardcoded RUN_SPEED constant
// — see that file's own 0.9.86 header. There is no second "vehicle
// running" concept anywhere in this codebase; a mounted, running ground
// vehicle is simply the existing running modifier applied to the
// existing capability-resolved base speed.
//
// DEFAULT (never set, or an invalid capability) STILL MEANS WALK, AT
// WALK'S OWN EXISTING SPEED. `_resolvedMovementSpeed()` returns
// `undefined` whenever `_movementCapability` is `null` — the documented
// "never set" state — and `simulateAvatarMovement()`'s own default
// (`undefined` degrades to its internal WALK_SPEED — see that file)
// takes over, exactly as it always has. This class still contains
// neither a `WALK_SPEED` nor a `RUN_SPEED` literal of its own; the only
// numbers it ever touches are whatever `movementSpeed` a resolved
// capability already carries.
//
// 0.9.88 — Ground Vehicle Collision Footprint Capability. A car moving
// at CAR_MOVEMENT_SPEED's own 12 units/second was, until this
// milestone, still being collision-tested against a tree as though it
// were the avatar's own 0.35-radius body — see
// core/AvatarVehicleMovementCapability.js's own 0.9.88 header for the
// full physical-inconsistency argument. This class adds exactly ONE new
// thing to close that gap: `_resolvedCollisionRadius()` below, the
// direct structural twin of `_resolvedMovementSpeed()` (0.9.86) —
// read in exactly one place, tick()'s own call into
// `this._treeConstraint.apply()`, as its new `avatarRadius` option.
//
// THE COLLISION-RADIUS SEAM STAYS OUTSIDE THE COLLISION MATHEMATICS
// ITSELF, EXACTLY LIKE THE SPEED SEAM ABOVE. This class still never
// brands a radius as "CAR" or computes any circle/AABB of its own — it
// merely reads `this._movementCapability.collisionRadius` (a plain
// number, core/AvatarVehicleMovementCapability.js's own job to have
// already decided) and hands it to the ONE existing tree constraint,
// which decides how it changes the candidate query and the resolved
// position (see application/AvatarTreeConstraint.js's own 0.9.88
// header). `if (capability.movementKind === GROUND_VEHICLE) { radius =
// CAR_RADIUS; }` conceptually never appears in this file, and it
// couldn't — this class still has no `GROUND_VEHICLE`, `BICYCLE`,
// `MOTORCYCLE`, or `CAR` literal anywhere in its own code.
//
// ONLY THE TREE CONSTRAINT CONSUMES THIS RADIUS. Building collision
// (`_movementConstraint`), terrain slope (`_terrainConstraint`), and
// step height (`_stepConstraint`) are all completely untouched by this
// milestone — their own `apply()` calls below are unmodified, exactly
// matching this milestone's own deliberately narrow scope (see
// core/AvatarVehicleMovementCapability.js's own 0.9.88 header): a
// vehicle's physical footprint changes how it collides with a TREE,
// nothing else, yet.
//
// DEFAULT (never set, or an invalid capability) STILL MEANS THE
// AVATAR'S OWN EXISTING RADIUS. `_resolvedCollisionRadius()` returns
// `undefined` whenever `_movementCapability` is `null` — the identical
// "never set" state `_resolvedMovementSpeed()` already handles — and
// both `core/AvatarTreeCollisionQuery.js#treeCollisionCandidatesForMovement()`'s
// and `core/AvatarTreeMovement.js#resolveAvatarTreeMovement()`'s own
// defaults (`undefined` degrades to their internal AVATAR_COLLISION_RADIUS
// — see those files) take over, exactly as they always have. An avatar
// nobody has ever mounted on anything is collision-tested at EXACTLY
// the radius it always was, byte for byte.
//
// 0.9.89 — Vehicle Movement Direction Semantics.
// core/AvatarVehicleMovementCapability.js now carries a fifth field,
// `movementDirections` (an AvatarMovementDirectionCapability —
// forward/backward booleans), and this class adds exactly ONE new
// consumer of it: `_resolvedMovementDirections()` below, the direct
// structural twin of `_resolvedMovementSpeed()` (0.9.86) and
// `_resolvedCollisionRadius()` (0.9.88) — except that this seam is
// consulted one layer INSIDE this class's own existing input
// resolution, not passed outward to a sibling constraint: it is read
// in exactly one place, `_resolvedForwardAxis()`'s own new guard, the
// SAME method 0.9.66 already built to combine ordinary W/S input with
// persistent continuous-movement intent into one `forwardAxis`.
//
// A DISALLOWED DIRECTION READS AS "THAT KEY WAS NEVER PRESSED," NEVER AS
// A COLLISION, A BLOCK FLAG, OR A SEPARATE MOVEMENT OUTCOME. Holding W
// while the active capability's own `movementDirections.forward` is
// `false` contributes exactly `0` to that source, the same as if the
// key were up — not `-1` (never a direction turns into its opposite),
// and not a stall requiring some other system to notice and clear.
// `isCollided()`/`isBlockedBySlope()`/`isBlockedByStepHeight()`/
// `isCollidedWithTree()` gain no sibling `isDirectionBlocked()`: unlike
// those four (each an outcome of comparing a DESIRED step against
// WORLD geometry the avatar didn't choose), a disallowed direction is
// resolved before `AvatarMovementState` is even built — from this
// class's own point of view, indistinguishable from the player simply
// not asking for that direction at all.
//
// BOTH ORDINARY INPUT AND CONTINUOUS INTENT ARE GATED, THE SAME WAY.
// `_resolvedForwardAxis()`'s own existing priority rule (0.9.66) is
// completely unchanged — ordinary W/S still wins outright whenever
// either is held, continuous intent only gets a say once neither is —
// this milestone only filters what each side is ALLOWED to contribute,
// never which side wins.
//
// EVERY EXISTING CALLER OF THIS CLASS SEES NO BEHAVIOR CHANGE, AS OF
// 0.9.89. `core/AvatarVehicleMovementCapability.js`'s own 0.9.89 header
// establishes that every currently-defined, supported capability (WALK,
// and GROUND_VEHICLE via BICYCLE/MOTORCYCLE/CAR) permits both
// directions — so `_resolvedMovementDirections()` below resolves to
// `{ forward: true, backward: true }` for all of them, and
// `_resolvedForwardAxis()` produces byte-identical output to before
// this milestone existed. AERIAL_VEHICLE/DRONE's own `forward: false,
// backward: false` is never actually reached: `tick()`'s own 0.9.85
// `supported: false` guard, above, already returns before
// `_currentMovementState()` — and therefore `_resolvedForwardAxis()` —
// is ever called for it.
//
// THIS CLASS STILL HAS NO IDEA A BICYCLE, A MOTORCYCLE, A CAR, OR A
// DRONE EXISTS. `_resolvedMovementDirections()` reads only
// `this._movementCapability.movementDirections`, a plain
// `{ forward, backward }` shape — exactly the same "read a generic
// capability field, never brand a decision by vehicle identity"
// discipline `_resolvedMovementSpeed()`/`_resolvedCollisionRadius()`
// already established.
//
// 0.9.91 — Vehicle Acceleration State Integration. 0.9.90
// (core/AvatarMovementAccelerationCapability.js +
// core/AvatarMovementAccelerationSimulation.js) built the acceleration
// vocabulary and its pure math half, and deliberately stopped there —
// its own header names wiring it into this class as explicit future
// scope. This is that wiring, and it adds exactly ONE new piece of
// caller-owned transient state, `_currentMovementSpeed` (the direct
// structural twin of `_verticalVelocity` — see this class's own
// constructor comment), plus ONE new resolution seam,
// `_resolvedAcceleration()` (the direct structural twin of
// `_resolvedMovementSpeed()`/`_resolvedCollisionRadius()`/
// `_resolvedMovementDirections()` above) — no second movement pipeline,
// no per-vehicle branching, matching the exact discipline every prior
// capability-field integration in this file already established.
//
// `_currentMovementSpeed` NEVER LIVES ANYWHERE BUT HERE. Exactly like
// `_verticalVelocity`/`_grounded` before it (see this class's own
// original header), it is never part of `AvatarPresence` — a future
// network peer receiving presence updates has no reason to know or care
// about the sender's mid-acceleration speed, only where it currently is.
//
// THE ACTUAL ACCELERATION MATH STAYS OUTSIDE THIS CLASS, EXACTLY LIKE
// EVERY SIBLING SEAM BEFORE IT. This class still never calls
// `core/AvatarMovementAccelerationSimulation.js#resolveMovementSpeed()`
// itself, and never imports that file — it merely reads
// `this._movementCapability.acceleration.acceleration` (a bare number)
// and hands it, alongside its own `_currentMovementSpeed` bookkeeping,
// to the ONE existing simulation function
// (core/AvatarMovementSimulation.js#simulateAvatarMovement()), which
// decides how they combine with the running-aware target speed it
// already computes — see that file's own 0.9.91 header for why the
// integration point lives there rather than here. `if (capability.
// acceleration.kind === INSTANT) { ... }` conceptually never appears in
// this file, and it doesn't need to: see `_resolvedAcceleration()`'s own
// comment for why the bare rate alone already carries that distinction.
//
// A CAPABILITY CHANGE RESETS `_currentMovementSpeed` TO `0`; AN
// UNCHANGED ONE NEVER DOES. See `setMovementCapability()`'s own 0.9.91
// comment for the identity-based change detection this relies on, and
// why re-applying the SAME resolved capability every animation frame
// (WorldNavigationSession's own existing 0.9.85 behavior) must never
// reset a vehicle's own build-up of speed mid-ride.
//
// WALK IS BYTE-FOR-BYTE UNCHANGED, AS OF 0.9.91. WALK's own resolved
// `acceleration.acceleration` is always exactly `0` (INSTANT — see
// core/AvatarMovementAccelerationCapability.js's own header), which
// degrades `simulateAvatarMovement()`'s own new rate-limiting branch to
// a no-op every single tick — the avatar's own existing on-foot movement
// reaches its target speed immediately, exactly as it always has. Every
// ground vehicle (BICYCLE/MOTORCYCLE/CAR), by contrast, now genuinely
// ramps toward its own `movementSpeed` at its own `acceleration` rate —
// see tests/AvatarVehicleAccelerationStateIntegration.test.js for the
// full scenario coverage, including the "motorcycle can briefly pull
// ahead of car despite a lower eventual top speed" relationship
// core/AvatarVehicleMovementCapability.js's own 0.9.90 header already
// named as the reason acceleration and movementSpeed are independent
// dimensions.
//
// Deliberately excluded, matching this milestone's own brief: braking as
// its own rate/behavior, coasting, friction, drag, momentum, turning
// radius, vehicle orientation, animation, camera behavior, terrain- or
// slope-dependent acceleration, vehicle-to-vehicle collision, drone
// flight, and a second `VehicleMovementController` — this class remains
// the one, single movement executor. See docs/Roadmap.md, 0.9.91.
//
// 0.9.92 — Vehicle Braking and Coasting Semantics. This class gains
// exactly one new resolution seam, `_resolvedBraking()` (the direct
// structural twin of `_resolvedAcceleration()`, immediately preceding
// it below) — read in the same one place, `tick()`'s own call into
// `simulateAvatarMovement()`, as a new `braking` argument. It gains NO
// new caller-owned state, and no new key binding: `_currentMovementState()`
// is completely untouched, so every `AvatarMovementState` this class
// builds still carries `brakingRequested: false` (its own documented
// default — core/AvatarMovementState.js's own 0.9.92 header), and real,
// key-driven movement is therefore byte-for-byte unchanged by this
// milestone, exactly as WALK's own instantaneous movement stayed
// unchanged when 0.9.90 built the acceleration vocabulary a full
// milestone before 0.9.91 ever consumed it. See this file's own
// `_resolvedBraking()` header, below, for why that gap is deliberate
// scope, not an oversight — see docs/Roadmap.md, 0.9.92.
//
// 0.9.94 — Vehicle Steering State Integration. This class gains exactly
// one new resolution seam, `_resolvedSteeringRate()` (the direct
// structural twin of `_resolvedAcceleration()`/`_resolvedBraking()`
// above) — read in the same one place, `tick()`'s own call into
// `simulateAvatarMovement()`, as a new `steeringRate` argument.
//
// NO NEW TRANSIENT STATE FIELD, UNLIKE `_currentMovementSpeed` (0.9.91).
// A held turn direction has no other home to come from —
// `_currentMovementState()` already builds `turnAxis` from the exact same
// A/D keys (and, since 0.9.66/0.9.69, the same continuous-movement
// machinery) it always has; this milestone reuses that EXISTING intent
// rather than inventing a second, steering-specific input vocabulary (see
// core/AvatarMovementSimulation.js's own 0.9.94 header for exactly how a
// held `turnAxis` becomes a "requested heading" `resolveMovementHeading()`
// closes the gap toward). And a "current heading" to converge FROM
// already exists too — `rotationY`, part of `AvatarPresence` since 0.2.36,
// already threaded into `simulateAvatarMovement()` every tick as
// `currentRotationY` (see `tick()` above). Unlike `_currentMovementSpeed`,
// which needed a new field because `AvatarPresence` never carried a
// signed current speed, heading needed nothing new: it was already real,
// stateful, and persisted.
//
// CAPABILITY SWITCHING PRESERVES THE AVATAR'S OWN PHYSICAL HEADING, NEVER
// RESETS IT — THE OPPOSITE OF `_currentMovementSpeed`'S OWN 0.9.91
// BEHAVIOR, DELIBERATELY. `setMovementCapability()` below resets
// `_currentMovementSpeed` to `0` on every genuine capability change,
// because a transient speed is CAPABILITY-RELATIVE state — a fresh ride
// starts from rest, whatever the previous one was doing. Heading is
// SPATIAL state — which way the avatar's own body is actually facing in
// the world — and mounting a vehicle must never spin the avatar to face
// some arbitrary default. `setMovementCapability()` gains no analogous
// reset for heading, and needs none: `rotationY` was never part of
// `_movementCapability` to begin with, so there is nothing to reset it
// against — an avatar facing east that mounts a car continues facing
// east, and simply steers (gradually, per CAR's own `steeringRate`) from
// there.
//
// STEERING IS INDEPENDENT OF `movementSpeed`/`acceleration`/`braking` —
// A FASTER OR QUICKER-ACCELERATING VEHICLE DOES NOT AUTOMATICALLY STEER
// FASTER OR SLOWER. This class still never branches on a vehicle's
// identity, or derives one resolved field from another — `_resolvedSteeringRate()`
// reads `steering.steeringRate` alone, exactly as `_resolvedAcceleration()`/
// `_resolvedBraking()`/`_resolvedMovementSpeed()` each read their own
// field alone (see core/AvatarVehicleMovementCapability.js's own 0.9.93
// header for why CAR's own `steeringRate` is deliberately the LOWEST of
// the three ground vehicles despite having the HIGHEST `movementSpeed`).
//
// WALK IS BYTE-FOR-BYTE UNCHANGED, AS OF 0.9.94. WALK's own resolved
// `steering.steeringRate` is always exactly `0` (INSTANT — see
// core/AvatarMovementSteeringCapability.js's own header), which degrades
// `simulateAvatarMovement()`'s own new heading branch to a no-op every
// single tick — the avatar's own existing on-foot turning
// (`TURN_RATE_DEGREES_PER_SECOND`) reaches its requested facing exactly
// as it always has. Every ground vehicle (BICYCLE/MOTORCYCLE/CAR), by
// contrast, now genuinely turns toward a held A/D direction at its own
// `steeringRate`, continuously for as long as the key is held, and stops
// changing heading the instant it is released — see
// tests/AvatarVehicleSteeringStateIntegration.test.js for the full
// scenario coverage.
//
// Deliberately excluded, matching this milestone's own brief: turning
// radius, Ackermann steering geometry, bicycle/motorcycle lean, tire
// friction, lateral acceleration, drift/skid behavior, speed-proportional
// steering, a second `VehicleOrientation`/steering-input vocabulary, and
// binding `brakingRequested` to any key — this class remains the one,
// single movement executor, and `_currentMovementState()` below is
// completely untouched by this milestone. See docs/Roadmap.md, 0.9.94.
//
// 0.9.95 — Vehicle Braking Intent. This class gains exactly one new
// piece of CALLER-OWNED state, `_vehicleBrakingIntent`
// (core/AvatarVehicleBrakingIntent.js's own NONE/BRAKE vocabulary), the
// direct structural twin of `_continuousMovementIntent` above: set only
// via a new `setVehicleBrakingIntent()` below, read only by a new
// `_resolvedBrakingRequested()`, which is in turn read in exactly one
// place — `_currentMovementState()`'s own new `brakingRequested` field.
// That is the ENTIRE milestone. `AvatarMovementState.brakingRequested`
// has been real, wired, and unreachable since 0.9.92 (see this file's
// own 0.9.92 header, and core/AvatarMovementState.js's own): this
// milestone closes the gap this class's own 0.9.92 header explicitly
// left open, by giving `_currentMovementState()` a genuine source for
// that field for the first time. `tick()`'s own call into
// `simulateAvatarMovement()` is completely UNCHANGED — `braking` was
// already resolved and threaded through since 0.9.92; only the fact
// that decides whether it is ever SELECTED was ever missing.
//
// STILL NO KEY BINDING, EXACTLY AS THE MILESTONE BRIEF INSISTS. Nothing
// in `keyDown()`/`keyUp()`/`_setKey()` changes, and `_keys` gains no new
// field: `setVehicleBrakingIntent()` is a public method a caller invokes
// directly with an already-resolved `AvatarVehicleBrakingIntent` value —
// the identical shape `setContinuousMovementIntent()`/
// `setContinuousMovementMode()` already established for their own
// vocabularies — never a raw key this class interprets itself. Deciding
// which physical control ultimately calls it (via
// core/AvatarVehicleBrakingInputAdapter.js) is explicitly deferred to a
// later milestone.
//
// THE CONTROLLER RESOLVES ONLY THE GENERIC FACT, EXACTLY AS EVERY OTHER
// RESOLUTION SEAM IN THIS FILE ALREADY DOES. `_resolvedBrakingRequested()`
// reads `_vehicleBrakingIntent` alone — never `movementCapability()`,
// never `isMounted`, never a vehicle type. Whether braking actually DOES
// anything this tick is entirely `core/AvatarMovementSimulation.js`'s
// own existing job (since 0.9.92): a BRAKE request while the active
// capability's own `braking.braking` is `0` (WALK, or DRONE were it ever
// unblocked) degrades to the identical INSTANT behavior that capability
// already had, never an error and never a special case here.
//
// BRAKING NEVER CHANGES THE TARGET, ONLY THE RATE — ALREADY TRUE, AND
// UNTOUCHED BY THIS MILESTONE. `resolveMovementSpeed()`'s own 0.9.92
// selection (`brakingRequested ? braking : acceleration`) governs ONLY
// which RATE closes the gap toward whatever target `_resolvedForwardAxis()`
// (via `movementState.forwardAxis` and `movementSpeed`) already asked
// for; it does not, and never did, redefine that target to `-movementSpeed`
// or to `0`. A held W with braking requested therefore still approaches
// forward `movementSpeed`, just at the braking rate rather than the
// acceleration rate — and a cruising vehicle with no movement key held
// and braking requested approaches the SAME `0` target coasting already
// used, only faster. See tests/AvatarVehicleBrakingIntentControllerIntegration.test.js's
// own Section E ("direction independence") and Section F ("reversal
// never jumps the sign") for the full scenario coverage.
//
// Deliberately excluded, matching this milestone's own brief: a specific
// brake key or physical control of any kind, throttle semantics,
// brake-overrides-throttle behavior, a handbrake, reverse gear, engine
// braking, friction, drag, ABS, traction, brake lights, vehicle
// animation, vehicle orientation changes, steering changes while
// braking, and a movement-state composition layer — this class remains
// the one, single movement executor, and `_setKey()` below is completely
// untouched by this milestone. See docs/Roadmap.md, 0.9.95.
const EPSILON = 1e-6;

export class AvatarMovementController {
    constructor(avatarPresenceSession, movementConstraint = null, terrainConstraint = null, stepConstraint = null, treeConstraint = null) {
        this._avatarPresenceSession = avatarPresenceSession;
        this._movementConstraint = movementConstraint;
        this._terrainConstraint = terrainConstraint;
        this._stepConstraint = stepConstraint;
        this._treeConstraint = treeConstraint;
        this._keys = { forward: false, backward: false, left: false, right: false, running: false, jumpHeld: false };
        this._verticalVelocity = 0;
        this._grounded = true;
        // 0.9.91 — this controller's own transient, signed "current
        // movement speed" (world units/second — negative while moving
        // backward), the direct structural twin of `_verticalVelocity`
        // above: fed into core/AvatarMovementSimulation.js#simulateAvatarMovement()
        // as `currentMovementSpeed` every tick, and overwritten with
        // whatever that same call returns, tick to tick. Reset to `0`
        // only by setMovementCapability() below, on an actual capability
        // change — see that method's own 0.9.91 comment.
        this._currentMovementSpeed = 0;
        // 0.9.66 — the CURRENT persistent continuous-movement intent
        // (core/AvatarContinuousMovementIntent.js's own NONE/FORWARD/
        // BACKWARD vocabulary), set only via setContinuousMovementIntent()
        // below and read only by `_currentMovementState()`'s own
        // forwardAxis. See this file's own 0.9.66 header for why this
        // class never derives it itself.
        this._continuousMovementIntent = AvatarContinuousMovementIntent.NONE;
        // 0.9.69 — the CURRENT persistent continuous-movement mode
        // (core/AvatarContinuousMovementMode.js's own NONE/WALK/RUN
        // vocabulary), set only via setContinuousMovementMode() below
        // and read only by `_resolvedRunning()`. See this file's own
        // 0.9.69 header for why this class never derives it itself.
        this._continuousMovementMode = AvatarContinuousMovementMode.NONE;
        // 0.9.95 — the CURRENT vehicle braking intent
        // (core/AvatarVehicleBrakingIntent.js's own NONE/BRAKE
        // vocabulary), set only via setVehicleBrakingIntent() below and
        // read only by `_resolvedBrakingRequested()`. The direct
        // structural twin of `_continuousMovementIntent`/
        // `_continuousMovementMode` above — see this file's own 0.9.95
        // header for why this class still never derives it itself.
        this._vehicleBrakingIntent = AvatarVehicleBrakingIntent.NONE;
        // 0.9.85 — the CURRENT movement capability (an
        // AvatarVehicleMovementCapability instance, or `null` for
        // "never set" — see this file's own 0.9.85 header above), set
        // only via setMovementCapability() below and read only by
        // movementCapability() and tick()'s own new guard clause.
        this._movementCapability = null;
        // Transient, per-tick bookkeeping only — exactly like
        // _verticalVelocity/_grounded above, never part of
        // AvatarPresence itself (see docs/Principles.md, "Collided Is
        // Movement Information, Not An Animation Vocabulary").
        this._collided = false;
        // 0.2.77 — same transient, never-part-of-AvatarPresence
        // posture as `_collided` above, for the terrain-slope
        // equivalent.
        this._blockedBySlope = false;
        // 0.3.2 — same posture again, for the step-height equivalent.
        this._blockedByStepHeight = false;
        // 0.9.63 — same posture again, for the tree-collision
        // equivalent.
        this._collidedWithTree = false;
    }

    // Returns true when `key` is one this controller understands (so
    // a caller knows whether to preventDefault/swallow the event),
    // false for anything else — letting every other shortcut in the
    // app keep working normally even while Avatar Control Mode is on.
    // Deliberately just W/A/S/D/Shift/Space — no arrow-key aliases,
    // because the arrow keys already mean "nudge the selection" (see
    // application/EditorActionRegistry.js) and Avatar Control Mode
    // must never silently steal that binding.
    keyDown(key) {
        return this._setKey(key, true);
    }

    keyUp(key) {
        return this._setKey(key, false);
    }

    // Releases every held key without changing anything else. Called
    // whenever Avatar Control Mode is turned off, and on window blur
    // — so a key event the browser never delivered (alt-tab away
    // mid-stride, a DevTools breakpoint) can never leave the avatar
    // "stuck" walking forever. See the design doc's own concern:
    // typing/searching must never accidentally make the avatar walk
    // away.
    //
    // 0.9.66 — deliberately leaves `_continuousMovementIntent`
    // untouched — see this file's own 0.9.66 header for why releasing
    // keys must never cancel it.
    releaseAll() {
        this._keys = { forward: false, backward: false, left: false, right: false, running: false, jumpHeld: false };
    }

    // 0.9.66 — the ONLY way `_continuousMovementIntent` ever changes.
    // Callers are expected to have already resolved a raw signal (a
    // keyboard chord, a UI button, a gamepad) down to one of
    // core/AvatarContinuousMovementIntent.js's own NONE/FORWARD/
    // BACKWARD values — see application/WorldNavigationSession.js's
    // own avatarKeyDown/avatarKeyUp for the keyboard case. Invalid
    // input degrades to NONE, matching every other pure vocabulary
    // setter in this codebase's own "degrade gracefully" posture —
    // never throws, never leaves a malformed value sitting in
    // `_continuousMovementIntent`.
    setContinuousMovementIntent(intent) {
        this._continuousMovementIntent = isValidAvatarContinuousMovementIntent(intent)
            ? intent
            : AvatarContinuousMovementIntent.NONE;
    }

    // 0.9.66 — the CURRENT persistent continuous-movement intent, same
    // "debug/UI surface, not something any other internal logic reads"
    // posture as isCollided()/verticalState() above. Also read by
    // application/WorldNavigationSession.js as the `currentIntent` it
    // feeds back into core/AvatarContinuousMovementIntent.js's own
    // transition function on the next relevant key event — this class
    // is the one place that value lives, so nothing else needs a
    // second copy of it.
    continuousMovementIntent() {
        return this._continuousMovementIntent;
    }

    // 0.9.69 — the ONLY way `_continuousMovementMode` ever changes, the
    // direct structural twin of setContinuousMovementIntent() above.
    // Callers are expected to have already resolved a raw signal down
    // to one of core/AvatarContinuousMovementMode.js's own NONE/WALK/RUN
    // values — see application/WorldNavigationSession.js's own
    // _processContinuousMovementInput. Invalid input degrades to NONE,
    // same "degrade gracefully" posture as every other pure vocabulary
    // setter in this codebase.
    setContinuousMovementMode(mode) {
        this._continuousMovementMode = isValidAvatarContinuousMovementMode(mode)
            ? mode
            : AvatarContinuousMovementMode.NONE;
    }

    // 0.9.69 — the CURRENT persistent continuous-movement mode, same
    // "debug/UI surface, not something any other internal logic reads"
    // posture as continuousMovementIntent() above. Unlike direction,
    // deriveAvatarContinuousMovementMode() needs no `currentMode` input
    // of its own (see core/AvatarContinuousMovementMode.js's own
    // header: its outcome is fully determined by `activationRequested`/
    // `runRequested` alone) — this getter exists purely so this class
    // stays the one place the value lives, for any reader (tests, a
    // future UI indicator) that wants to observe it.
    continuousMovementMode() {
        return this._continuousMovementMode;
    }

    // 0.9.95 — the ONLY way `_vehicleBrakingIntent` ever changes, the
    // direct structural twin of setContinuousMovementIntent()/
    // setContinuousMovementMode() above. Callers are expected to have
    // already resolved a raw signal down to one of
    // core/AvatarVehicleBrakingIntent.js's own NONE/BRAKE values —
    // typically via that milestone's own sibling file,
    // core/AvatarVehicleBrakingInputAdapter.js, once a future milestone
    // decides which physical control feeds it. Invalid input degrades to
    // NONE, the same "degrade gracefully" posture every other pure
    // vocabulary setter in this codebase already follows.
    setVehicleBrakingIntent(intent) {
        this._vehicleBrakingIntent = isValidAvatarVehicleBrakingIntent(intent)
            ? intent
            : AvatarVehicleBrakingIntent.NONE;
    }

    // 0.9.95 — the CURRENT vehicle braking intent, same "debug/UI
    // surface, not something any other internal logic reads" posture as
    // continuousMovementIntent()/continuousMovementMode() above.
    vehicleBrakingIntent() {
        return this._vehicleBrakingIntent;
    }

    // 0.9.85 — the ONLY way `_movementCapability` ever changes. Callers
    // are expected to hand in a resolved
    // core/AvatarVehicleMovementCapability.js#AvatarVehicleMovementCapability
    // instance — see application/WorldNavigationSession.js for the one
    // real caller. Invalid input (anything failing
    // isValidAvatarVehicleMovementCapability(), `null` included)
    // degrades to `null`, the same "degrade gracefully, never throw"
    // posture setContinuousMovementIntent()/setContinuousMovementMode()
    // already establish above — never a malformed value sitting in
    // `_movementCapability`.
    // 0.9.91 — a genuinely CHANGED capability (mounting, dismounting, or
    // — per this milestone's own brief — a future vehicle-to-vehicle
    // switch) resets `_currentMovementSpeed` to `0`: a newly mounted
    // vehicle starts from rest, and a dismounted avatar returns to
    // ordinary walking from rest, rather than inheriting whatever
    // transient speed the PREVIOUS capability had reached. Compared by
    // identity, never by field-by-field equality:
    // resolveAvatarVehicleMovementCapability() (core/AvatarVehicleMovementCapability.js)
    // already returns the literal same frozen instance for the same
    // VehicleType, so `WorldNavigationSession`'s own every-frame
    // re-application of an UNCHANGED capability (see this class's own
    // 0.9.85 header) is a no-op here too — `_currentMovementSpeed` only
    // ever resets on a REAL transition, never merely because this setter
    // was called again with the same value.
    setMovementCapability(capability) {
        const resolved = isValidAvatarVehicleMovementCapability(capability)
            ? capability
            : null;
        if (resolved !== this._movementCapability) {
            this._currentMovementSpeed = 0;
        }
        this._movementCapability = resolved;
    }

    // 0.9.85 — the CURRENT movement capability KIND, same "debug/UI
    // surface, not something any other internal logic reads" posture
    // as continuousMovementIntent()/continuousMovementMode() above.
    // AvatarMovementCapabilityKind.WALK both before setMovementCapability()
    // is ever called and whenever it was last given `null` or an
    // invalid value — the documented default this milestone's own
    // brief requires, so an avatar nobody has ever mounted on anything
    // reports exactly what it always has.
    movementCapability() {
        return this._movementCapability
            ? this._movementCapability.movementKind
            : AvatarMovementCapabilityKind.WALK;
    }

    // Runs one simulation step and, if the result is actually
    // different from the current presence, publishes it. Returns the
    // new AvatarPresence when it published one, or null when nothing
    // changed — an avatar standing still, already grounded, with no
    // keys held produces an EXACT no-op (see
    // core/AvatarMovementSimulation.js: zero input, zero drift), so
    // `sequence` only ever advances on an update a viewer would
    // actually notice, never once per render frame regardless of
    // motion.
    tick(deltaSeconds) {
        if (!this._avatarPresenceSession) {
            return null;
        }
        // 0.9.85 — an unsupported movement capability (currently only
        // ever AERIAL_VEHICLE/DRONE — see
        // core/AvatarVehicleMovementCapability.js) blocks this tick's
        // movement entirely: no simulation, no constraint pipeline, no
        // presence update, regardless of which keys are held. See this
        // file's own 0.9.85 header for why silently falling through to
        // the on-foot pipeline below ("unsupported means WALK") would
        // destroy the exact semantic distinction 0.9.84 exists to make.
        if (this._movementCapability && this._movementCapability.supported === false) {
            return null;
        }
        const movementState = this._currentMovementState();
        const current = this._avatarPresenceSession.current;
        const currentRotationY = current.rotation.y || 0;
        const currentPosition = { x: current.position.x, y: current.position.y, z: current.position.z };

        // 0.3.2 — read BEFORE simulating: "what surface is the avatar
        // CURRENTLY standing on," so simulateAvatarMovement()'s own
        // gravity/landing resolve against it rather than an absolute
        // Y=0 plane. `undefined` when no stepConstraint is wired —
        // simulateAvatarMovement() defaults `groundHeight` to its own
        // original flat-plane constant in that case, so behavior is
        // unchanged from before this milestone.
        const currentSupportHeight = this._stepConstraint
            ? this._stepConstraint.supportHeightAt(currentPosition.x, currentPosition.z)
            : undefined;

        const result = simulateAvatarMovement({
            position: currentPosition,
            rotationY: currentRotationY,
            verticalVelocity: this._verticalVelocity,
            grounded: this._grounded,
            movementState,
            deltaSeconds,
            groundHeight: currentSupportHeight,
            movementSpeed: this._resolvedMovementSpeed(),
            acceleration: this._resolvedAcceleration(),
            braking: this._resolvedBraking(),
            currentMovementSpeed: this._currentMovementSpeed,
            steeringRate: this._resolvedSteeringRate()
        });
        this._verticalVelocity = result.verticalVelocity;
        this._grounded = result.grounded;
        this._currentMovementSpeed = result.currentMovementSpeed;

        // 0.2.42 — the pure simulation result is only ever a PROPOSED
        // position; the movement constraint (when wired) is the one
        // place that can still adjust X/Z before anything reaches
        // AvatarPresence. See application/AvatarMovementConstraint.js.
        let finalPosition = result.position;
        this._collided = false;
        if (this._movementConstraint) {
            const constrained = this._movementConstraint.apply(currentPosition, result.position, {
                supportHeight: currentSupportHeight
            });
            finalPosition = constrained.position;
            this._collided = constrained.collided;
        }

        // 0.2.77 — applied AFTER building collision, on whatever
        // position collision already resolved to: building geometry
        // decides what blocks passage at all, terrain slope decides
        // whether the remaining candidate step is too steep to climb.
        this._blockedBySlope = false;
        if (this._terrainConstraint) {
            const terrainResult = this._terrainConstraint.apply(currentPosition, finalPosition);
            finalPosition = terrainResult.position;
            this._blockedBySlope = terrainResult.blocked;
        }

        // 0.3.2 — applied LAST: decides the avatar's final Y (snapped
        // onto whatever surface — terrain or a brick's own top — the
        // resolved X/Z actually landed on) and whether stepping onto/
        // off that surface is within reach at all. See
        // application/AvatarStepConstraint.js's own header for why
        // this runs after both collision and slope.
        this._blockedByStepHeight = false;
        if (this._stepConstraint) {
            const stepResult = this._stepConstraint.apply(currentPosition, finalPosition, {
                grounded: result.grounded
            });
            finalPosition = stepResult.position;
            this._blockedByStepHeight = stepResult.blocked;
            // 0.3.4 — the avatar just walked off the edge of whatever
            // it was standing on; the NEXT tick starts genuinely
            // airborne, whatever this tick's own simulation result
            // said about `grounded`.
            if (stepResult.falling) {
                this._grounded = false;
            }
        }

        // 0.9.63 — applied LAST, after building collision, terrain
        // slope, and step height have all already resolved `finalPosition`
        // (Y included): tree occupancy is a purely horizontal (X/Z)
        // constraint, orthogonal to every one of those, and never reads
        // or rewrites the Y they already settled — see
        // application/AvatarTreeConstraint.js's own header.
        this._collidedWithTree = false;
        if (this._treeConstraint) {
            const treeResult = this._treeConstraint.apply(currentPosition, finalPosition, {
                avatarRadius: this._resolvedCollisionRadius()
            });
            finalPosition = treeResult.position;
            this._collidedWithTree = treeResult.collided;
        }

        const positionChanged = !samePosition(finalPosition, current.position);
        const rotationChanged = Math.abs(result.rotationY - currentRotationY) > EPSILON;
        const animationChanged = result.animation !== current.animation;
        if (!positionChanged && !rotationChanged && !animationChanged) {
            return null;
        }

        return this._avatarPresenceSession.update({
            position: finalPosition,
            rotation: { y: result.rotationY },
            animation: result.animation
        });
    }

    // 0.2.42 — whether the MOST RECENT tick's desired movement was
    // altered by world collision geometry. Transient — recomputed
    // fresh every tick, never persisted, never part of AvatarPresence
    // (see docs/Principles.md). A debug/UI surface, not something any
    // other internal logic reads.
    isCollided() {
        return this._collided;
    }

    // 0.2.77 — whether the MOST RECENT tick's desired movement was
    // altered because the candidate step's slope exceeded what's
    // walkable. Same posture as isCollided() above: transient,
    // recomputed fresh every tick, never persisted, never part of
    // AvatarPresence. A debug/UI surface, not something any other
    // internal logic reads.
    isBlockedBySlope() {
        return this._blockedBySlope;
    }

    // 0.3.2 — whether the MOST RECENT tick's desired movement was
    // altered because the candidate step's height change exceeded what
    // Step-Up Movement allows. Same posture as isCollided()/
    // isBlockedBySlope() above: transient, recomputed fresh every
    // tick, never persisted, never part of AvatarPresence. A debug/UI
    // surface, not something any other internal logic reads.
    isBlockedByStepHeight() {
        return this._blockedByStepHeight;
    }

    // 0.9.63 — whether the MOST RECENT tick's desired movement was
    // altered because it would have carried the avatar into a tree's
    // own collision circle. Same posture as isCollided()/
    // isBlockedBySlope()/isBlockedByStepHeight() above: transient,
    // recomputed fresh every tick, never persisted, never part of
    // AvatarPresence. A debug/UI surface, not something any other
    // internal logic reads.
    isCollidedWithTree() {
        return this._collidedWithTree;
    }

    // 0.3.4 — the avatar's CURRENT vertical motion state (SUPPORTED /
    // RISING / FALLING — core/AvatarVerticalState.js), derived fresh
    // from exactly the same `_grounded`/`_verticalVelocity` bookkeeping
    // this controller already carries between ticks. Same "debug/UI
    // surface, not something any other internal logic reads" posture
    // as isCollided()/isBlockedBySlope()/isBlockedByStepHeight() above
    // — application/WorldNavigationSession.js reads it to feed
    // core/WorldSpatialActivity.js#deriveWorldSpatialActivity()'s own
    // new JUMPING/FALLING cases, never anything that changes movement
    // itself.
    verticalState() {
        return deriveAvatarVerticalState({ grounded: this._grounded, verticalVelocity: this._verticalVelocity });
    }

    // 0.2.44 — whether the player is CURRENTLY holding any directional
    // key (forward/backward/left/right — turning included, since
    // turning is also an explicit facing choice the user is making,
    // never something a facing override should fight). Read by
    // WorldNavigationSession's avatar-facing behavior (see
    // core/AvatarFacing.js) to decide whether a temporary "look at
    // target" override is allowed to apply at all this frame — an
    // actively-moving player's own input always wins. Deliberately
    // ignores Shift/Space: running or jumping alone implies nothing
    // about facing.
    hasMovementInput() {
        return this._keys.forward || this._keys.backward || this._keys.left || this._keys.right;
    }

    _currentMovementState() {
        return new AvatarMovementState({
            forwardAxis: this._resolvedForwardAxis(),
            turnAxis: (this._keys.right ? 1 : 0) - (this._keys.left ? 1 : 0),
            running: this._resolvedRunning(),
            jumpRequested: this._keys.jumpHeld,
            brakingRequested: this._resolvedBrakingRequested()
        });
    }

    // 0.9.66 — the ONE place ordinary W/S input and persistent
    // continuous-movement intent are combined into a single
    // forwardAxis, per the priority this file's own header establishes:
    // ordinary input (either key physically held, even if they cancel
    // to a net zero axis) always wins; only once NEITHER is held does
    // `_continuousMovementIntent` get a say; with neither, the result
    // is plain 0 — idle, exactly as before this milestone existed.
    //
    // 0.9.89 — the priority rule itself is completely unchanged; what
    // changed is that each raw source (a held key, a continuous intent)
    // is now filtered through `_resolvedMovementDirections()` BEFORE it
    // is allowed to contribute to the axis, exactly like a physically
    // disconnected key: holding W while the active capability's own
    // `movementDirections.forward` is `false` produces the same `0` it
    // would if W were never pressed at all — never an error, never a
    // stall, never the OTHER direction. See
    // core/AvatarVehicleMovementCapability.js's own 0.9.89 header — as
    // of this milestone every defined capability still permits both
    // directions, so this filter is currently always a no-op; it exists
    // so a future capability CAN say no, without this method changing
    // again.
    _resolvedForwardAxis() {
        const directions = this._resolvedMovementDirections();
        const forwardAllowed = directions.forward;
        const backwardAllowed = directions.backward;

        if (this._keys.forward || this._keys.backward) {
            const forward = this._keys.forward && forwardAllowed;
            const backward = this._keys.backward && backwardAllowed;
            return (forward ? 1 : 0) - (backward ? 1 : 0);
        }
        if (this._continuousMovementIntent === AvatarContinuousMovementIntent.FORWARD) return forwardAllowed ? 1 : 0;
        if (this._continuousMovementIntent === AvatarContinuousMovementIntent.BACKWARD) return backwardAllowed ? -1 : 0;
        return 0;
    }

    // 0.9.69 — the direct structural twin of `_resolvedForwardAxis()`
    // above, applying the IDENTICAL priority rule to `running`: ordinary
    // W/S (either physically held) always wins, driving `running` from
    // the physically-held Shift key exactly as it always has; only once
    // NEITHER W nor S is held does `_continuousMovementMode` get a say,
    // resolving to `true` for RUN and `false` for WALK/NONE. Gated on
    // the identical `_keys.forward || _keys.backward` condition
    // `_resolvedForwardAxis()` already uses — direction and mode
    // resolve from the same "which source is currently driving
    // movement" decision, never two independently-timed ones — so
    // ordinary Shift+W and continuous Alt+Shift+W converge to the
    // exact same AvatarMovementState shape before simulation ever runs.
    _resolvedRunning() {
        if (this._keys.forward || this._keys.backward) {
            return this._keys.running;
        }
        if (this._continuousMovementIntent !== AvatarContinuousMovementIntent.NONE) {
            return this._continuousMovementMode === AvatarContinuousMovementMode.RUN;
        }
        return this._keys.running;
    }

    // 0.9.86 — the ONE speed-resolution seam this milestone adds: the
    // CURRENT movement capability's own base `movementSpeed` (a plain
    // number — core/AvatarVehicleMovementCapability.js's own job to have
    // already decided what it is), or `undefined` when
    // `_movementCapability` is `null` (never set, or degraded there by
    // setMovementCapability() — see that method above). `undefined` lets
    // `simulateAvatarMovement()`'s own default take over, exactly as
    // every call site did before this milestone existed — this method
    // never substitutes a literal number of its own. Read in exactly one
    // place, tick()'s own call into simulateAvatarMovement() above.
    _resolvedMovementSpeed() {
        return this._movementCapability ? this._movementCapability.movementSpeed : undefined;
    }

    // 0.9.91 — the acceleration-resolution seam this milestone adds: the
    // CURRENT movement capability's own resolved `acceleration.acceleration`
    // rate (a plain number — core/AvatarMovementAccelerationCapability.js's
    // own job to have already decided what it is), or `undefined` when
    // `_movementCapability` is `null` — the identical "never set" state
    // `_resolvedMovementSpeed()` already handles. `undefined` lets
    // core/AvatarMovementSimulation.js#simulateAvatarMovement()'s own
    // default take over — reach the target speed this very tick, exactly
    // the INSTANT behavior every caller got before this milestone existed
    // — the direct structural twin of `_resolvedMovementSpeed()` above.
    // This method never reads `.kind`: `AvatarMovementAccelerationCapability`'s
    // own constructor already guarantees INSTANT's rate is always exactly
    // `0` and RATE_LIMITED's is always strictly positive (see that file's
    // own header), so the bare rate alone already carries the distinction
    // simulateAvatarMovement() needs — this class still has no
    // `AvatarMovementAccelerationKind` literal anywhere in its own code.
    _resolvedAcceleration() {
        return this._movementCapability ? this._movementCapability.acceleration.acceleration : undefined;
    }

    // 0.9.92 — the braking-resolution seam this milestone adds: the
    // CURRENT movement capability's own resolved `braking.braking` rate
    // (a plain number — core/AvatarMovementBrakingCapability.js's own
    // job to have already decided what it is), or `undefined` when
    // `_movementCapability` is `null` — the identical "never set" state
    // `_resolvedAcceleration()` already handles. The direct structural
    // twin of `_resolvedAcceleration()` immediately above, down to never
    // reading `.kind` for the identical reason.
    //
    // AS OF 0.9.92, DELIBERATELY NOT PAIRED WITH ANY WAY TO SET
    // `movementState.brakingRequested` true — this class still
    // constructed every `AvatarMovementState` itself, in
    // `_currentMovementState()` below, and that method passed no
    // `brakingRequested` at all (defaulting to `false` — see
    // core/AvatarMovementState.js's own 0.9.92 header), so this seam
    // reached core/AvatarMovementSimulation.js#simulateAvatarMovement()
    // every tick, but real, key-driven controller behavior stayed
    // completely UNCHANGED: braking never actually engaged.
    //
    // 0.9.95 CLOSES THAT GAP — see this file's own 0.9.95 header, above
    // `EPSILON`. `_currentMovementState()` now passes a genuine
    // `brakingRequested` (`_resolvedBrakingRequested()`, immediately
    // below), so this seam is no longer merely reachable in principle —
    // an actual `AvatarVehicleBrakingIntent.BRAKE`, set via
    // `setVehicleBrakingIntent()`, makes braking real. Still no key
    // binding: only the SOURCE of the request changed, not this method
    // itself, which is untouched by 0.9.95.
    _resolvedBraking() {
        return this._movementCapability ? this._movementCapability.braking.braking : undefined;
    }

    // 0.9.95 — the braking-REQUEST resolution seam this milestone adds:
    // whether the CURRENT vehicle braking intent
    // (core/AvatarVehicleBrakingIntent.js's own NONE/BRAKE vocabulary,
    // set only via setVehicleBrakingIntent() above) is BRAKE, as a bare
    // boolean — the fact `_currentMovementState()` feeds straight into
    // `AvatarMovementState.brakingRequested`. Read in exactly one place,
    // `_currentMovementState()` itself, mirroring how `_resolvedBraking()`
    // immediately above is read in exactly one place, `tick()`'s own call
    // into `simulateAvatarMovement()`. This method never reads
    // `_movementCapability`: WHETHER braking is being requested is
    // entirely independent of WHAT vehicle (if any) is being ridden — see
    // this file's own 0.9.95 header, "THE CONTROLLER RESOLVES ONLY THE
    // GENERIC FACT."
    _resolvedBrakingRequested() {
        return this._vehicleBrakingIntent === AvatarVehicleBrakingIntent.BRAKE;
    }

    // 0.9.94 — the steering-resolution seam this milestone adds: the
    // CURRENT movement capability's own resolved `steering.steeringRate`
    // (a plain number, radians/second — core/AvatarMovementSteeringCapability.js's
    // own job to have already decided what it is), or `undefined` when
    // `_movementCapability` is `null` — the identical "never set" state
    // `_resolvedAcceleration()`/`_resolvedBraking()` already handle. The
    // direct structural twin of both, down to never reading `.kind` for
    // the identical reason: `AvatarMovementSteeringCapability`'s own
    // constructor already guarantees INSTANT's rate is always exactly `0`
    // and RATE_LIMITED's is always strictly positive, so the bare rate
    // alone already carries the distinction
    // core/AvatarMovementSimulation.js#simulateAvatarMovement() needs —
    // this class still has no `AvatarMovementSteeringKind` literal
    // anywhere in its own code. Read in exactly one place, tick()'s own
    // call into simulateAvatarMovement() above.
    _resolvedSteeringRate() {
        return this._movementCapability ? this._movementCapability.steering.steeringRate : undefined;
    }

    // 0.9.88 — the ONE collision-radius-resolution seam this milestone
    // adds: the CURRENT movement capability's own `collisionRadius` (a
    // plain number — core/AvatarVehicleMovementCapability.js's own job
    // to have already decided what it is), or `undefined` when
    // `_movementCapability` is `null` (never set, or degraded there by
    // setMovementCapability() — see that method above). `undefined` lets
    // application/AvatarTreeConstraint.js#apply()'s own downstream
    // defaults take over, exactly as every call site did before this
    // milestone existed — this method never substitutes a literal
    // number of its own. Read in exactly one place, tick()'s own call
    // into `this._treeConstraint.apply()` above. The direct structural
    // twin of `_resolvedMovementSpeed()` above.
    _resolvedCollisionRadius() {
        return this._movementCapability ? this._movementCapability.collisionRadius : undefined;
    }

    // 0.9.89 — the direction-resolution seam this milestone adds: the
    // CURRENT movement capability's own `movementDirections` (an
    // AvatarMovementDirectionCapability —
    // core/AvatarVehicleMovementCapability.js's own job to have already
    // decided what it is), or a permissive `{ forward: true, backward:
    // true }` default when `_movementCapability` is `null` (never set,
    // or degraded there by setMovementCapability() — see that method
    // above). Unlike `_resolvedMovementSpeed()`/`_resolvedCollisionRadius()`
    // above, this method never returns `undefined` — `_resolvedForwardAxis()`
    // needs real booleans to gate on, not a value for some downstream
    // default to interpret — but the RESULT is the same "default means
    // exactly what every caller already got before this milestone
    // existed" guarantee: both directions permitted. Read in exactly
    // one place, `_resolvedForwardAxis()` above.
    _resolvedMovementDirections() {
        return this._movementCapability
            ? this._movementCapability.movementDirections
            : { forward: true, backward: true };
    }

    _setKey(key, isDown) {
        switch (String(key || '').toLowerCase()) {
            case 'w': this._keys.forward = isDown; return true;
            case 's': this._keys.backward = isDown; return true;
            case 'a': this._keys.left = isDown; return true;
            case 'd': this._keys.right = isDown; return true;
            case 'shift': this._keys.running = isDown; return true;
            case ' ': case 'space': case 'spacebar': this._keys.jumpHeld = isDown; return true;
            default: return false;
        }
    }
}

function samePosition(a, b) {
    return Math.abs(a.x - b.x) <= EPSILON
        && Math.abs(a.y - b.y) <= EPSILON
        && Math.abs(a.z - b.z) <= EPSILON;
}
