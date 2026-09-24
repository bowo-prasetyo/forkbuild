# Principles: Avatars, presence, movement and interaction

Each rule links to its full text in [the history](../Principles.md#history).

### Identity, Avatar Profile, and Presence Are Three Different Questions (0.2.33)

Identity (who someone is), avatar profile (what their avatar looks like)
and presence (where it is right now) are separate models. None of them
is forced into an existing Document, Publication or WorldPlacement.

[Full text](history/0.1-0.2.md#identity-avatar-profile-and-presence-are-three-different-questions-0233)

### Presence Is Never Signed, Never Persisted, Never Placed (0.2.33)

`AvatarPresence` has no signing descriptor, `AvatarPresenceSession`
cannot be given a `StorageProvider`, and presence is never a
WorldPlacement.

*Changed by 0.2.38:* presence advertisements are now signed whenever the
local identity provider can sign (`PresenceSigning`). Presence itself is
still never persisted or placed.

[Full text](history/0.1-0.2.md#presence-is-never-signed-never-persisted-never-placed-0233)

### An Avatar Profile Can Gain A Signature Layer Later Without A Rewrite (0.2.33)

`AvatarProfile.ownerIdentity` started as a plain string, as
`Publication.author` and `PlacementRecord.owner` did. A trust layer,
when needed, is added the way theirs was: new optional fields, never a
migration or rewrite.

[Full text](history/0.1-0.2.md#an-avatar-profile-can-gain-a-signature-layer-later-without-a-rewrite-0233)

### A Template Is A Closed Vocabulary, Not An Asset Loader (0.2.34)

An avatar template and its appearance are declarative data: fixed
component names, fixed option ids and a few `#rrggbb` colors. No field
can hold a URL, file or mesh reference, so an appearance can only choose
among known things, never fetch something.

[Full text](history/0.1-0.2.md#a-template-is-a-closed-vocabulary-not-an-asset-loader-0234)

### Validate Strictly On Write; Degrade Gracefully On Read (0.2.34)

`updateProfile()` is the write boundary: strict, and it rejects invalid
input. `getEffectiveAvatar()` is the read boundary: lenient, and it
never throws. An invalid avatar profile must never stop someone from
using World View.

[Full text](history/0.1-0.2.md#validate-strictly-on-write-degrade-gracefully-on-read-0234)

### Switching An Avatar's Template Resets Its Appearance (0.2.34)

Changing template without supplying an appearance resets appearance to
the new template's defaults. Option ids mean something only within the
template that declared them, so carrying them over would produce an
invalid profile.

[Full text](history/0.1-0.2.md#switching-an-avatars-template-resets-its-appearance-0234)

### An Avatar's Location Comes From Presence, Never From The Avatar Itself (0.2.35)

`AvatarVisual` has two independent write paths: `setAppearance()` never
touches position and `setPose()` never touches meshes or materials. What
an avatar looks like (profile) and where it is (presence) come from
different sources, so editing one can never change the other.

[Full text](history/0.1-0.2.md#an-avatars-location-comes-from-presence-never-from-the-avatar-itself-0235)

### A Fresh Avatar Spawns Near What You're Looking At, Not At A Fixed Point (0.2.35 follow-up)

A new avatar spawns near what the camera is looking at, not at world
origin. Published documents are almost never near the origin, so an
avatar spawned there was correct but invisible.

[Full text](history/0.1-0.2.md#a-fresh-avatar-spawns-near-what-youre-looking-at-not-at-a-fixed-point-0235-follow-up)

### An Accessory Option Id Is Still Just An Id — Its Shape Is A Renderer Decision (0.2.35 follow-up)

Appearance data only names option ids. How `scarf-01` or `hat-01`
actually looks is decided by the renderer, which must give each
accessory its own shape rather than treating the ids as interchangeable.

[Full text](history/0.1-0.2.md#an-accessory-option-id-is-still-just-an-id--its-shape-is-a-renderer-decision-0235-follow-up)

### A Preview And An Avatar Solve The Same Shape Of Problem Differently (0.2.35)

Previews and avatars both turn authoritative data into unsigned,
unreplicated Three.js objects, but differently. A preview is a snapshot,
rendered once and cached because its content is immutable. An avatar is
a standing process: cheap to update every frame (`setPose()` and
`setAnimation()` never rebuild geometry) and cheap to leave alone when
nothing changed.

[Full text](history/0.1-0.2.md#a-preview-and-an-avatar-solve-the-same-shape-of-problem-differently-0235)

### Avatar Visibility Is A Client Rendering Preference, Not Avatar State (0.2.35)

"Show My Avatar" is local UI state only. It is never written to the
profile or presence, never persisted, and only adds or removes an
already-built object from the scene. Other observers cannot see or be
affected by it.

[Full text](history/0.1-0.2.md#avatar-visibility-is-a-client-rendering-preference-not-avatar-state-0235)

### Input Changes Presence; Presence Changes The Renderer (0.2.36)

A keystroke never reaches a Three.js object directly. Keys become an
`AvatarMovementState` in `AvatarMovementController`, the simulation
turns that into a new pose, and `AvatarPresenceSession.update()`
publishes it. The renderer only reads presence.

[Full text](history/0.1-0.2.md#input-changes-presence-presence-changes-the-renderer-0236)

### AvatarPresence Is The Result Of Simulation, Not The Simulation Itself (0.2.36)

Input snapshots and physics bookkeeping (vertical velocity, grounded)
are working state for the simulation and are never part of
`AvatarPresence`. Presence carries only position, rotation and
animation.

[Full text](history/0.1-0.2.md#avatarpresence-is-the-result-of-simulation-not-the-simulation-itself-0236)

### Movement Is Kinematic, Not Physically Simulated (0.2.36)

`AvatarMovementSimulation` knows nothing about bricks or documents, and
movement is kinematic, not physics. It guarantees movement never
produces an invalid state: it sanitizes NaN and Infinity and clamps
`deltaSeconds` so a resumed background tab cannot teleport the avatar.
(Collision and walkable surfaces were later added as separate
constraints; see below.)

[Full text](history/0.1-0.2.md#movement-is-kinematic-not-physically-simulated-0236)

### Animation Is Driven By Elapsed Time, Never By Frame Count (0.2.36)

Movement speed and animation phase are functions of elapsed seconds
(`deltaSeconds` from the animation loop), never of frame count. A 30 fps
machine and a 144 fps machine cover the same ground and gait per second.

[Full text](history/0.1-0.2.md#animation-is-driven-by-elapsed-time-never-by-frame-count-0236)

### Following The Avatar Never Redefines What The Camera Is Looking At (0.2.36)

"Follow Avatar" shifts the camera by the avatar's own movement delta
(`moveCamera(delta)`) and does nothing else: it never changes camera
focus, the active document or selection. Following is a camera behavior,
not a change of editing target.

[Full text](history/0.1-0.2.md#following-the-avatar-never-redefines-what-the-camera-is-looking-at-0236)

### 0.2.37 Establishes Transport Semantics; 0.2.38 Establishes Trust Semantics

Presence transport and presence trust are separate layers. Ingestion's
own rule is only that a higher sequence number wins. Whether a replica
may claim an avatar id, and whether a claim is replayed or equivocating,
belong to the trust boundary layered on top.

[Full text](history/0.1-0.2.md#0237-establishes-transport-semantics-0238-establishes-trust-semantics)

### Watching Presence Never Requires Having One (0.2.37)

Receiving and rendering other replicas' avatars is wired independently
of having a local avatar. A logged-out visitor sees the same moving
avatars as a logged-in one; only publishing your own presence requires
logging in.

[Full text](history/0.1-0.2.md#watching-presence-never-requires-having-one-0237)

### A Presence Advertisement Is A Transport Shape, Not A Second Presence Model (0.2.37)

`toAvatarPresenceAdvertisement()` produces a subset of `AvatarPresence`
without `timestamp`, because a sender's clock is nothing a receiver
should rely on. There is one presence model; the advertisement is
produced fresh from it and never stored or reasoned about on its own.

[Full text](history/0.1-0.2.md#a-presence-advertisement-is-a-transport-shape-not-a-second-presence-model-0237)

### Presence Lifecycle State Is A Derived Observation, Not A Stored Fact (0.2.37)

PRESENT, STALE and ABSENT are never sent, stored or claimed by a sender.
The receiver derives them from how long it has been, on its own clock,
since it last heard from an avatar; `derivePresenceLifecycleState()`
takes `now` as a parameter.

[Full text](history/0.1-0.2.md#presence-lifecycle-state-is-a-derived-observation-not-a-stored-fact-0237)

### Never Let A Transport Callback Write Directly Into Session State (0.2.37)

A transport's `onmessage` handler only appends to an inbox. Untrusted
messages become accepted state only inside `PresenceSyncService.pull()`,
on the replica's own schedule. That single boundary is where trust
checks, rate limits and replay defenses belong.

[Full text](history/0.1-0.2.md#never-let-a-transport-callback-write-directly-into-session-state-0237)

### An Avatar ID Identifies An Avatar; It Does Not Prove Who Currently Controls It (0.2.38)

Holding an `avatarId` proves nothing. The first claim a replica accepts
binds the avatar to its authority: the signing `did:key` if signed,
otherwise the weaker `ownerIdentity` string. This is trust on first use,
not a lookup in a profile directory.

[Full text](history/0.1-0.2.md#an-avatar-id-identifies-an-avatar-it-does-not-prove-who-currently-controls-it-0238)

### Presence Trust Has One Real Policy Axis (0.2.38)

`PresenceTrustPolicy` has one setting, `requireSignedPresence`.
Rejecting a wrong authority, a replay or an equivocation is never
negotiable by policy; only whether an unsigned claim is acceptable is an
operator choice.

[Full text](history/0.1-0.2.md#presence-trust-has-one-real-policy-axis-0238)

### Replay Detection And Freshness Are Different Questions, Answered By Different Code (0.2.38)

"Have I already accepted this exact claim?" (`PresenceReplayWindow`) and
"is this newer than what I hold?" (`PresenceIngestion`) are different.
An old sequence number the replica already accepted is a replay, not
merely stale, and only separate checks can tell the two apart.

[Full text](history/0.1-0.2.md#replay-detection-and-freshness-are-different-questions-answered-by-different-code-0238)

### Equal-But-Different Is Still A Conflict, Even At 60Hz (0.2.38)

The same avatar at the same sequence with different content is
equivocation, reported with the existing `EQUIVOCATING` status and never
resolved by arrival. It is checked only after the claim is confirmed to
come from the same bound authority.

[Full text](history/0.1-0.2.md#equal-but-different-is-still-a-conflict-even-at-60hz-0238)

### Do Not Let Arrival Order Choose A Winner (0.2.38)

In a genuine equivocation, the claim accepted first for a sequence stays
displayed. Later claims at that sequence are rejected and recorded as
trust observations, shown as "conflicting", never silently swapped in.

[Full text](history/0.1-0.2.md#do-not-let-arrival-order-choose-a-winner-0238)

### Rendering Presence And Trusting Presence Remain Separate (0.2.38)

The avatar registry and renderer only draw what `pull()` accepted. Trust
observations are diagnostics for the World View summary line and never
reach the renderer. The worst a questionable claim can do is stop an
avatar's position from updating.

[Full text](history/0.1-0.2.md#rendering-presence-and-trusting-presence-remain-separate-0238)

### Selection Identifies What The User Is Interacting With; It Does Not Imply Ownership, Editability, Or Authority (0.2.39)

`pick()` is the one place a click becomes a target, and it only sets
state. No editability, ownership or authority check happens at pick
time; those are asked later by whatever acts on the target.

[Full text](history/0.1-0.2.md#selection-identifies-what-the-user-is-interacting-with-it-does-not-imply-ownership-editability-or-authority-0239)

### Avatars Are Never Document Selection (0.2.39)

Avatar interaction state and document selection are independent. An
avatar id can never appear in `SpatialSelectionState`'s items, and a
click that hits one category clears the other.

[Full text](history/0.1-0.2.md#avatars-are-never-document-selection-0239)

### Whichever Is Nearer Wins, Never Category (0.2.39)

When a brick and an avatar are on the same click ray, `pick()` chooses
whichever is closer to the camera. It never hardcodes "bricks win" or
"avatars win".

[Full text](history/0.1-0.2.md#whichever-is-nearer-wins-never-category-0239)

### Looking At Something Is Never The Same As Acting On It (0.2.39)

`getAvatarInfo()`, like `inspectDocument()`, is read-only. The Avatar
Info panel offers no Edit, Move, Delete or Save; its one action, Follow,
is a camera relationship.

[Full text](history/0.1-0.2.md#looking-at-something-is-never-the-same-as-acting-on-it-0239)

### Visibility Happens Before Broadcasting, Never After (0.2.40)

The publish path asks `PresenceVisibilityPolicy.shouldAdvertise()`
before publishing. HIDDEN means nothing is published at all, never
"published but obscured". FRIENDS is honest that it does not yet give
per-recipient confidentiality on a broadcast transport.

[Full text](history/0.1-0.2.md#visibility-happens-before-broadcasting-never-after-0240)

### AvatarProfile, AvatarPresence, and PresenceVisibilityPolicy Are Three Independent Concerns (0.2.40)

Profile, presence and visibility policy are separate models with
separate storage (presence is never stored) and separate forms and Save
actions. Changing who can see you never changes how you look, and the
reverse. Visibility is not a field on presence or on a placement.

[Full text](history/0.1-0.2.md#avatarprofile-avatarpresence-and-presencevisibilitypolicy-are-three-independent-concerns-0240)

### A Policy Abstraction Can Exist Before The Mechanism It Fully Assumes (0.2.40)

LOCAL and PUBLIC visibility behave the same while only one transport
scope exists. Modeling the difference now means a wider transport later
only changes transport routing, never the policy or its readers.

[Full text](history/0.1-0.2.md#a-policy-abstraction-can-exist-before-the-mechanism-it-fully-assumes-0240)

### The Authoritative Position Is Always The Latest Presence; Interpolation Is Only Ever A Presentation Detail (0.2.37)

`RemoteAvatarInterpolator` blends toward the latest accepted
advertisement for display only. The blended position is never treated as
truth, stored, forwarded or used to accept later updates, so smoothing
can change freely without affecting correctness.

[Full text](history/0.1-0.2.md#the-authoritative-position-is-always-the-latest-presence-interpolation-is-only-ever-a-presentation-detail-0237)

### Appearance And Position Are Different Lifecycles, Never One Message (0.2.41)

Presence (where) and the avatar profile (what it looks like) travel as
separate messages on the wire, keeping the local model split all the way
to the transport.

[Full text](history/0.1-0.2.md#appearance-and-position-are-different-lifecycles-never-one-message-0241)

### Appearance Is Durable; Presence Is Ephemeral — Neither Store Prunes Like The Other (0.2.41)

The presence store prunes absent avatars on a timer. The profile store
has no timer: an avatar's look does not expire because its owner stopped
moving. Profiles are removed only when presence decides the avatar is
gone for good.

[Full text](history/0.1-0.2.md#appearance-is-durable-presence-is-ephemeral--neither-store-prunes-like-the-other-0241)

### A Fire-And-Forget Transport Needs Its Own "Catch Me Up," Deliberately Rare (0.2.41)

With no request/response on the transport, a replica joining later would
never see a profile that was edited once. The profile is republished
immediately once a local avatar exists and then every 15 seconds
(`PROFILE_REPUBLISH_INTERVAL_MS`), deliberately far less often than
movement.

[Full text](history/0.1-0.2.md#a-fire-and-forget-transport-needs-its-own-catch-me-up-deliberately-rare-0241)

### Collision Is A Constraint Applied To Movement, Never Part Of The Movement Simulation Itself (0.2.42)

The movement simulation stays pure and geometry-free, proposing a
position from intent. Collision is a separate step applied after it and
before presence: simulate, constrain, publish.

[Full text](history/0.1-0.2.md#collision-is-a-constraint-applied-to-movement-never-part-of-the-movement-simulation-itself-0242)

### The Local Avatar Is Constrained By Collision Geometry Currently Available To This Replica, Never By The Entire World (0.2.42)

Collision reads the documents this replica has streamed in, by
reference. A building outside the streaming radius is not an obstacle,
and one that streams out stops blocking on the next tick. The claim is
never "the avatar cannot pass through anything in the world".

[Full text](history/0.1-0.2.md#the-local-avatar-is-constrained-by-collision-geometry-currently-available-to-this-replica-never-by-the-entire-world-0242)

### Collision Is Derived From Document + Placement, Never A Third Relationship (0.2.42)

Obstacle boxes are computed each tick from brick positions, brick
dimensions and the document's placement offset, and nothing is stored.
Touching a wall creates no relationship between an avatar and a
document.

[Full text](history/0.1-0.2.md#collision-is-derived-from-document--placement-never-a-third-relationship-0242)

### Collided Is Movement Information, Not An Animation Vocabulary (0.2.42)

Whether a tick's movement was altered by collision is transient
bookkeeping. It is never part of presence and never an animation state;
animation stays IDLE, WALKING, RUNNING and JUMPING.

[Full text](history/0.1-0.2.md#collided-is-movement-information-not-an-animation-vocabulary-0242)

### Start Simple: A Box Is A Good Enough Capsule (0.2.42)

The avatar is an upright axis-aligned box, and each brick's collision
box ignores rotation. Full mesh collision was deliberately out of scope,
and rendered meshes are never the authoritative collision model.

[Full text](history/0.1-0.2.md#start-simple-a-box-is-a-good-enough-capsule-0242)

### Proximity Is Derived, Never Announced (0.2.43)

`computeNearbyAvatars()` is a pure function of data the replica already
holds. There is no "I am near you" message, and there never will be: two
replicas computing proximity independently is correct, not a conflict to
reconcile.

[Full text](history/0.1-0.2.md#proximity-is-derived-never-announced-0243)

### Nearness Never Authorizes Mutation (0.2.43)

Nothing in World View can write to a remote avatar's presence or
profile. `targetAvatar()` only changes the caller's own interaction
state, and being nearby makes no new operation reachable.

[Full text](history/0.1-0.2.md#nearness-never-authorizes-mutation-0243)

### A New Way To Reach An Avatar Is Not A New Way To Inspect One (0.2.43)

The Nearby Avatars list is a second way to target an avatar, not a
second inspection surface. A row calls `targetAvatar()`, and the same
`getAvatarInfo()`, Follow button and status vocabulary apply.

[Full text](history/0.1-0.2.md#a-new-way-to-reach-an-avatar-is-not-a-new-way-to-inspect-one-0243)

### Observation Does Not Imply Authority, And Interaction Does Not Imply Control (0.2.44)

`performAvatarInteraction()` touches only the caller's own interaction
state. A greet, wave or point is rendered on the actor's own avatar and
never becomes a presence update or a change to someone else's state.

[Full text](history/0.1-0.2.md#observation-does-not-imply-authority-and-interaction-does-not-imply-control-0244)

### A Gesture Is Presentation, Never Presence (0.2.44)

Gestures have their own vocabulary (`AvatarInteractionKind`), never a
value of `AvatarAnimationState`, which travels with presence. That keeps
gestures off the presence wire by construction; networking them is a
separate protocol.

[Full text](history/0.1-0.2.md#a-gesture-is-presentation-never-presence-0244)

### Interaction Cooldowns Exist Before Interactions Are Networked (0.2.44)

One shared local cooldown rate-limits greet, wave and point. It was
built and tested before interactions were networked, so the networked
version inherits a proven building block.

[Full text](history/0.1-0.2.md#interaction-cooldowns-exist-before-interactions-are-networked-0244)

### State Synchronization And Event Synchronization Are Different Protocols (0.2.45)

Presence and profile sync keep one latest record per avatar. Interaction
sync keeps none: `pull()` returns a fresh batch of newly accepted
events, because an interaction is an event, not state.

[Full text](history/0.1-0.2.md#state-synchronization-and-event-synchronization-are-different-protocols-0245)

### Presence Describes An Avatar's Current State; Interaction Describes An Event That Happened (0.2.45)

`AvatarInteractionAdvertisement` is its own wire shape, never a field on
the presence advertisement. Presence has one current answer that each
update replaces; interactions keep happening and never replace each
other.

[Full text](history/0.1-0.2.md#presence-describes-an-avatars-current-state-interaction-describes-an-event-that-happened-0245)

### A Claimed Target Is Never An Instruction (0.2.45)

`targetAvatarId` is only the sender's claim. No replica, including the
named target's, changes anything because of it: no forced camera turn,
no opened panel. The gesture is rendered on the sender's avatar.

[Full text](history/0.1-0.2.md#a-claimed-target-is-never-an-instruction-0245)

### A Bounded Replay Window Can Do Double Duty For An Identity And An Ordering Question At Once (0.2.45)

`AvatarInteractionReplayWindow` answers both "have I seen this
`interactionId`?" and "is this at least as new as the newest accepted
sequence?" in one bounded structure per avatar, so the trust boundary
rejects both replays and old events.

[Full text](history/0.1-0.2.md#a-bounded-replay-window-can-do-double-duty-for-an-identity-and-an-ordering-question-at-once-0245)

### An Event Stream Has No Room For Equivocation Detection, And That Gap Is Named, Not Hidden (0.2.45)

The interaction trust boundary has no equivocation check, because no
current claim is retained to compare against. The same authority sending
two different interactions at the same sequence remains an open,
unscheduled question.

[Full text](history/0.1-0.2.md#an-event-stream-has-no-room-for-equivocation-detection-and-that-gap-is-named-not-hidden-0245)

### User-Controlled Avatar Mode Is Persistent Local Interaction State, Not A Transient Gesture (0.3.2)

Avatar control mode changes only when the user explicitly sets it.
Losing window focus releases held keys, so the avatar does not keep
walking, but it never turns the mode off.

[Full text](history/0.3-0.7.md#user-controlled-avatar-mode-is-persistent-local-interaction-state-not-a-transient-gesture-032)

### Camera Perspective Determines An Offset; It Never Replaces The Camera Machinery (0.3.2)

`CameraPerspective` is a pure function from avatar position and facing
to a `{ position, target }` framing for first-person, third-person or
bird's-eye view. It feeds the existing camera machinery rather than
replacing it.

[Full text](history/0.3-0.7.md#camera-perspective-determines-an-offset-it-never-replaces-the-camera-machinery-032)

### Camera Perspective Is Local Perception, Never Shared Reality (0.3.2)

The chosen perspective is local UI state: never persisted, signed or
broadcast, and never part of presence or profile. How you look at the
world tells other people nothing.

[Full text](history/0.3-0.7.md#camera-perspective-is-local-perception-never-shared-reality-032)

### Step-Up Movement Is A Deterministic Height Constraint, Never A Physics Climb (0.3.2)

`isStepClimbable()` is one comparison against `MAX_STEP_HEIGHT`. A step
in range is taken in full in one tick, and one out of range is not taken
at all. There is no momentum, climbing curve or physics engine.

[Full text](history/0.3-0.7.md#step-up-movement-is-a-deterministic-height-constraint-never-a-physics-climb-032)

### Step-Up Movement Builds On The Flat Walking Plane; It Does Not Replace It (0.3.2)

The simulation's fixed ground height became an injectable `groundHeight`
number that defaults to `0`. Callers that do not pass it get the same
flat plane as before.

[Full text](history/0.3-0.7.md#step-up-movement-builds-on-the-flat-walking-plane-it-does-not-replace-it-032)

### Walkability Is Not Collision (0.3.3)

Collision asks whether geometry overlaps; `WalkableSurface` asks where
an avatar may stand. They may share brick geometry but never share code.
A slope's box cannot say what the support height is at a given point.

[Full text](history/0.3-0.7.md#walkability-is-not-collision-033)

### A Directional Walkable Shape Generalizes Its Own Seam, Never Reuses A Flat One (0.3.3)

Flat bricks still resolve through `walkableTopAt()`, unchanged. Stairs
and slopes get their own profiles, evaluated in the brick's local space
and honoring its rotation, because direction is what makes them stairs
or slopes.

[Full text](history/0.3-0.7.md#a-directional-walkable-shape-generalizes-its-own-seam-never-reuses-a-flat-one-033)

### A Per-Tick Height Delta Can Replace A Brick-Wide Wall Check, Once Something Downstream Is Equipped To Police It (0.3.3)

Stairs and slopes are left out of the horizontal wall check once
stepping is enabled. The per-tick step constraint downstream decides
whether each movement is climbable.

[Full text](history/0.3-0.7.md#a-per-tick-height-delta-can-replace-a-brick-wide-wall-check-once-something-downstream-is-equipped-to-police-it-033)

### Falling Still Asks WalkableSurface The Same Question Walking Always Has (0.3.4)

Landing reuses the same support-height lookup as walking and stepping
(`AvatarStepConstraint.supportHeightAt()`), recomputed every tick. There
is no second surface concept for falling.

[Full text](history/0.3-0.7.md#falling-still-asks-walkablesurface-the-same-question-walking-always-has-034)

### A Ledge Is An Absence Of Support; A Wall Is Occupied Geometry — They Stop Being The Same Kind Of Blocked (0.3.4)

Stepping up beyond the step height is still blocked, like a wall.
Stepping down beyond it is no longer blocked: the avatar walks off the
ledge and gravity takes over.

[Full text](history/0.3-0.7.md#a-ledge-is-an-absence-of-support-a-wall-is-occupied-geometry--they-stop-being-the-same-kind-of-blocked-034)

### Avatar Vertical State Is Derived, Never A Second Physics Bookkeeping (0.3.4)

SUPPORTED, RISING and FALLING are derived purely from the existing
`grounded` and `verticalVelocity` values. Naming them adds no new state
that could disagree with the simulation.

[Full text](history/0.3-0.7.md#avatar-vertical-state-is-derived-never-a-second-physics-bookkeeping-034)

### Local Physics Is Local; Spatial Presence Is Observation (0.3.4)

Vertical velocity and vertical state never join spatial presence. Other
participants see only position updates; spatial presence is never a
physics synchronization channel.

[Full text](history/0.3-0.7.md#local-physics-is-local-spatial-presence-is-observation-034)

## Changed or superseded

These rules described the code at the time and no longer apply as written.

### Avatar Presence Has No Privacy Guarantee Beyond Transport Scope (0.2.39)

Presence was visible to everyone on the same broadcast transport.
Changed by 0.2.40: presence now passes a visibility policy before it is
broadcast. See "Visibility Happens Before Broadcasting, Never After
(0.2.40)".

[Full text](history/0.1-0.2.md#avatar-presence-has-no-privacy-guarantee-beyond-transport-scope-0239)

### Presence And Profile Share One Publication Gate (0.2.41)

Profile advertisements used to pass the same visibility check as
presence. Changed by 0.2.58: profiles have their own visibility policy.
See "Profile Gets Its Own Publication Gate, Superseding The Shared One
(0.2.58)" in Peers, friends, chat and voice.

[Full text](history/0.1-0.2.md#presence-and-profile-share-one-publication-gate-0241)
