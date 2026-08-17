0.1.1  Project Skeleton                     (done)
0.1.2  Rendering Infrastructure             (done)
0.1.3  Core Domain Model                    (done)
0.1.4  WorldRenderer                        (done)
0.1.5  Brick Registry & Definitions         (done)
0.1.6  Event System & Incremental Renderer  (done)
0.1.7  Camera Infrastructure                (done)
0.1.8  Picking System                       (done)
0.1.9  Editor Context                       (done)
0.1.10 Selection Tool                       (done)
0.1.11 Brick Palette                        (done)
0.1.12 Tool Framework                       (done)
0.1.13 Placement Preview                    (done)
0.1.14 PlaceBrickCommand + Placement Tool (click commits)  (done)
0.1.15 CommandHistory + DeleteBrickCommand  (done)
0.1.16 CompositeCommand + Undo/Redo         (done)
0.1.17 Document + DocumentManager (dirty/version/lastSaved)  (done)
0.1.18 Interaction System (InputDispatcher + undo/redo labels)  (done)
0.1.19 WorldSerializer + DocumentSerializer (with validation)  (done)
0.1.20A Local Storage — persistence API (StorageProvider, Save/LoadDocumentUseCase)  (done)
0.1.20B Local Storage — UI integration (Save button, dirty indicator, Recent Documents)  (done)
0.1.20C EditorSession (runtime World replacement — New/Load)  (done)
0.1.21A Identity Adapter — provider shape (IdentityProvider, LocalIdentityProvider, author wiring)  (done)
0.1.21B Identity Adapter — UI integration (login prompt, current-user display)  (done)
0.1.22 Publisher Adapter (stub) — depends on Identity, not the reverse  (done)
0.1.23 Discovery Adapter (stub) — depends on Publisher, not the reverse  (done)
0.1.24 Forking  (done)
0.1.25 Publication lifecycle  (done)
0.1.26 Discovery Views — Repository, Author, World  (done)
0.1.27 World Layout & Spatial Discovery  (done)
0.1.28 World Navigation / Spatial Streaming  (done)
0.1.29 Spatial Interaction & World-Aware Picking  (done)
0.1.30 Free Spatial Navigation & Interaction Refinement  (done)
0.1.31 World Inspection & Spatial Metadata  (done)
0.1.32 Spatial Editing Context & Domain Mutation  (done)
0.1.33 Spatial Brick Placement & Stacking  (done)
0.1.34 Selection/Transform Tool Refinement  (done)
0.1.35 Command History Serialization & Integrity  (done)
0.1.36 Multi-Selection & Atomic Group Operations  (done)
0.1.37 Persistent Command History  (done)
0.1.38 Transform Gizmo & Group Pivot  (done)
0.1.39 Command Replay / Operation Timeline  (done)
0.1.40 Advanced Selection & Grouping  (done)
0.1.41 Unified Transform Architecture  (done)
0.1.42 Clipboard & Editing Kernel Consolidation  (done)
0.1.43 Groups & Selection Separation  (done)
0.1.44 Transform Parity & Group Gizmo Architecture  (done)
0.1.45 Advanced Selection & Editor Group Surface  (done)
0.1.46 Interactive Transform Gizmo & Viewport Editing Parity  (done)
0.1.47 Transform Precision, Snapping & Editing Polish  (done)
0.1.48 Alignment & Distribution Tools  (done)
0.1.49 Numeric Transform Input  (done)
0.1.50 Editing UX Consolidation & Command Surface  (done)
0.1.51 Stability / Performance / Large-Document Hardening
0.1.52 Protocol & Persistence Hardening
0.2.0   Durable Documents & Publishing Boundary       ✓
0.2.1   Editor / World Editing Parity                 ✓
0.2.2   Schema Versioning & Real Migration Fixtures   ✓
0.2.3   Publish / Unpublish Lifecycle                 ✓
0.2.4   Read-only Published World                     ✓
0.2.5   World Placement & Spatial Discovery           ✓
0.2.6   Persistence, Recovery & Autosave              ✓
0.2.7   Collaboration Protocol Foundation             ✓
0.2.8   Fork / Edit Published World                   ✓
0.2.9   Multi-client Synchronization                  ✓
0.2.10  Decentralized Placement Registry              ✓
0.2.11  Spatial Discovery & Content Resolution      　✓
0.2.12  World View Streaming & Runtime Integration    ✓
0.2.13  Publication Licensing & Fork Policy           ✓
0.2.14  Decentralized Content Backend                 ✓
0.2.15  Decentralized Spatial Discovery               ✓
0.2.16  Decentralized Identity & Signatures           ✓
0.2.17  Delegated Ownership & Authorization           ✓
0.2.18  Decentralized Replication & Conflict Handling ✓
0.2.19  Trust / Discovery Hardening                   ✓
0.2.20  Fork-on-Edit & Immutable Snapshot Lineage      ✓
0.2.21  Document Lifecycle & Metadata UI               ✓
0.2.22  Fork Transition & World View Document Switching ✓
0.2.23  World Placement & Spatial Positioning           ✓
0.2.24  World Coordinate Semantics & Placement UX       ✓
0.2.25  Spatial Allocation & Placement Collision Policy ✓
0.2.26  World Navigation & Spatial Discovery UX         ✓
0.2.27  World View Context & Selection Model            ✓
0.2.28  Spatial Query & Location Discovery               ✓
0.2.29  World Location Browser & Spatial Exploration     ✓
0.2.30  Trust-Aware Spatial Discovery & Diagnostics       ✓
0.2.31  Publication Catalog & Repository UX               ✓
0.2.32  Client-Side Publication Preview & Lazy Rendering  ✓
0.2.33  Avatar Identity & Presence Model                  ✓
0.2.34  Avatar Templates & Customization                  ✓
0.2.35  Avatar Rendering & World Presence                  ✓
0.2.36  Local Avatar Movement & Animation                   ✓
0.2.37  Decentralized Avatar Presence Synchronization        ✓
0.2.38  Presence Trust, Replay & Conflict Handling            ✓
0.2.39  World Entity Interaction & Selection                  ✓
0.2.40  Avatar Presence Visibility & Privacy                   ✓
0.2.41  Remote Avatar Appearance Synchronization                ✓

Nested Groups / Hierarchical Editing — remains OPTIONAL, and is not put
back on the roadmap yet. 0.1.43–0.1.50 repeatedly demonstrated that the
flat-group model is sufficient for the current editing architecture. If
a real use case eventually demands nesting, it becomes its own
architectural milestone — not an implicit next step.

Automatic collision resolution (SpatialAllocationPolicy.AUTO_OFFSET) —
silently choosing a different position than requested when the
deterministic slot GridPlacementStrategy computes is already occupied
— remains OPTIONAL and is not put back on the roadmap yet. 0.2.25
established that overlap is a policy decision, not an error, and gave
explicit, interactive placement a WARN default; it deliberately did
NOT attempt automatic resolution, because "is this cell occupied?" can
only be answered from local knowledge, and any resolution built on
that answer would reintroduce the exact non-determinism 0.2.24 spent a
full milestone eliminating. If a real requirement for this emerges, it
needs its own globally-reproducible allocation design, not an
incremental patch onto GridPlacementStrategy.

Geometric (bounds-based) collision detection — whether two
publications' spatial extents intersect despite sitting at different
origins, rather than only whether their origins coincide — similarly
remains OPTIONAL. 0.2.25 deliberately scoped overlap detection to
origin equality only; see docs/Principles.md, "Geometric Collision Is
A Later Question."

Deterministic Spatial Allocation — resolving GridPlacementStrategy hash
collisions (AUTO_OFFSET) with a genuinely reproducible-across-replicas
algorithm, rather than the "no automatic resolution at all" 0.2.25/
0.2.26 ship with — remains OPTIONAL and unscheduled. It is a real
decentralized-systems problem (independently and concurrently chosen
positions converging identically on every replica without silently
moving anything already published), not a UI feature, and deserves its
own dedicated design when a real requirement demands it rather than
being folded into whichever navigation/placement milestone happens to
be in flight when someone thinks of it.

Wiring `DecentralizedSpatialDiscoveryProvider`'s richer diagnostics
(manifest/equivocation/staleness) into the live World View remains
OPTIONAL and unscheduled — see docs/Architecture.md, 0.2.26,
"Deliberately not in 0.2.26," for what it would actually require.
Camera-focus / active-document / selection separation, previously
listed here as deferred, shipped in 0.2.27 — see docs/Architecture.md,
0.2.27.

A UI affordance for setting the active document WITHOUT moving the
camera, previously listed here as deferred, shipped in 0.2.29: the
World Location Browser's "Select" action calls `setActiveDocument`
directly. Search results, Nearby Worlds, and Documents Here still only
offer "Focus" (moves both) — extending Select to those surfaces too
remains OPTIONAL and unscheduled, worth doing once it's a demonstrated
rather than theoretical need.

Wiring a decentralized backend (spatial cells → `SpatialIndexRoot` →
`SpatialIndexManifest` → `PlacementRecord`s) underneath
`searchWorldByLocation` remains OPTIONAL and unscheduled. 0.2.28
deliberately wrote the spatial-query CONTRACT to support that swap
later without changing any caller (see docs/Principles.md, "A Spatial
Query Is Authoritative Over Placement, Not A Local-Cache Scan") while
the live implementation stays the plain, honest
`LocalWorldLayoutProvider` scan it already was for text search.
Geometric (bounding-box/polygon) spatial queries and nearest-neighbor
indexing similarly remain OPTIONAL — 0.2.28 is a plain Euclidean
sphere, exactly what was asked for, on purpose.

Box selection in world space, sphere visualization with collision
geometry, polygon regions, "all documents intersecting this building,"
and spatial clustering — all considered and explicitly deferred during
0.2.29's design — remain OPTIONAL and unscheduled. The World Location
Browser (0.2.29) is a distance-ordered list of discoverable documents,
nothing more; any of these would be a real, separate geometry feature
built on top of it, not an extension of the list itself.

0.2.30 connected 0.2.19's trust/diagnostics VOCABULARY to the World
View (`core/DiscoveryDiagnosticsSummary.js`, `WorldNavigationSession`'s
optional `spatialDiscoveryProvider`, the Location Browser's diagnostics
banner) WITHOUT changing which provider actually resolves documents —
see docs/Architecture.md, 0.2.30, "What stays unchanged," for why
flipping the live wiring now would trade an honest "unavailable" for a
dishonest "nothing here" (the live app has never built a populated
`SpatialIndexRoot`; `CreateWorldViewUseCase`'s placement flow bypasses
`SpatialIndexBuilder` entirely). That remaining gap is now narrower and
more precisely scoped than before:

**Spatial streaming/index integration** (proposed, not started): (1)
wire `SpatialIndexBuilder` into the live publish/place/move flow so a
real, signed `SpatialIndexRoot`/`SpatialIndexManifest` chain actually
exists for the local node's own published content; (2) pass a real
`DecentralizedSpatialDiscoveryProvider` as `WorldNavigationSession`'s
`spatialDiscoveryProvider` (the plumbing 0.2.30 already built and
tested against real trust code — see
tests/DiscoveryDiagnosticsSummary.test.js — needs only a populated
index to become live-meaningful); (3) decide whether `searchWorldByLocation`
itself should eventually resolve documents THROUGH the decentralized
provider rather than `LocalWorldLayoutProvider`, which is the larger,
still-undecided architectural question — replacing the resolution path
every World View surface reads from (text search 0.2.26, spatial query
0.2.28, the location browser 0.2.29) is a materially bigger step than
adding an optional diagnostics source alongside it, and finishes the
job of connecting the trust/replication/index architecture built in
0.2.15–0.2.19 to the everyday World View experience rather than that
architecture existing mostly in the backend and test suite. Not
committed to the roadmap as a numbered milestone until its own design
pass happens.

Repository/Author View established a real catalog model
(`PublicationQuery`/`PublicationPage`/deterministic
`PublicationSort`/`SearchPublicationsUseCase`) and unified both views
onto one shared `PublicationCatalog` component, tested against a
10,000-publication synthetic catalog rather than a handful of fixtures
— see docs/Architecture.md, 0.2.31.

Deliberately deferred from 0.2.31, remaining OPTIONAL and unscheduled:

- ~~A real, immutable, content-addressed preview.~~ **RETIRED, not
  merely postponed again — see 0.2.32, below.** 0.2.31 framed this as
  a schema-evolution question to answer eventually; 0.2.32 answers it
  by concluding a signed, replicated preview was never the right
  design, and ships a client-local, derived-and-cached THUMBNAIL
  instead. `core/DocumentPreview.js`'s `reference` field stays
  reserved and unused, but no future milestone is expected to fill it.
- **An indexed metadata representation for description search at
  scale.** 0.2.31's description search is a real, working, opt-in
  feature — but it is a per-query cost against however many
  publications match title/author-independent criteria, acceptable for
  "local pagination over the currently discoverable collection" (the
  design doc's own explicit first-implementation scope), not for an
  unbounded decentralized catalog.
- **License/tag/status filters** beyond the search box, and
  **cross-page grouping** (today's `groupPublications` is deliberately
  scoped to one page at a time — see docs/Principles.md).
- **Infinite scroll / virtualized lists** — deliberately not
  implemented; see docs/Principles.md, "Explicit Pagination Is A
  Decentralized Honesty Feature, Not Just A Layout Choice." Worth
  revisiting once the discovery protocol can provide stronger
  completeness semantics (the same open question "spatial streaming/
  index integration," above, would also need to answer for spatial
  discovery).

0.2.32 gives Repository/Author View real thumbnails: a
`PreviewService` lazily renders each visible publication's actual
document content (never its metadata) into a deterministically-framed
image, cached in memory and never persisted, signed, or replicated —
see docs/Architecture.md, 0.2.32. Deliberately not in 0.2.32: a
persistent/disk preview cache, and generating previews for publications
that haven't scrolled into view — see docs/Principles.md, "Preview
Generation Is Bounded By What's Actually Visible."

0.2.33 opens a new arc: humans as participants inside the world, not
just consumers of persistent content. It establishes the model
boundary only — `core/AvatarProfile.js` (persistent, one per identity)
and `core/AvatarPresence.js` (ephemeral, never signed, never
persisted, never a WorldPlacement) — with no rendering, no movement,
and no networking yet. See docs/Architecture.md, 0.2.33, and
docs/Principles.md, "Identity, Avatar Profile, and Presence Are Three
Different Questions." The rest of the avatar arc is tracked below,
each remaining milestone scoped narrowly on purpose:

0.2.34 gives `AvatarProfile.appearance` a real, validated, declarative
schema — a small built-in template registry
(`core/library/CoreAvatarTemplateLibrary.js`, two templates today),
strict rejection of anything outside a template's declared
components/options at write time, and lenient field-by-field fallback
to the resolved template's defaults at read time, so a stale or
unrecognized profile can never block World View access. Ships the
first user-visible avatar surface, the Avatar Creator
(`/avatar` — "My Avatar" in the nav). See docs/Architecture.md, 0.2.34,
and docs/Principles.md, "A Template Is A Closed Vocabulary, Not An
Asset Loader" and "Validate Strictly On Write; Degrade Gracefully On
Read." Deliberately deferred from 0.2.34, remaining OPTIONAL and
unscheduled until a real need justifies the added complexity: custom
3D mesh uploads, arbitrary GLTF/GLB files, user-supplied textures, a
marketplace of assets, and decentralized avatar-asset distribution —
every one of these was ruled out specifically because appearance stays
a closed, built-in vocabulary, not because of scheduling.

0.2.35 puts the avatar physically into the Three.js scene — the local
user's own avatar only, rendering only, no movement input yet. The
renderer combines two independent inputs it never modifies: 0.2.34's
resolved appearance (`AvatarProfileUseCase.getEffectiveAvatar()`) and
0.2.33's `AvatarPresence`; a "Show My Avatar" checkbox is a pure
client rendering preference, never a new piece of avatar state; and a
document's `WorldPlacement` is completely untouched by any avatar
activity — verified directly (byte-identical placement JSON
before/after) in the flagship test. See docs/Architecture.md, 0.2.35,
and docs/Principles.md, "An Avatar's Location Comes From Presence,
Never From The Avatar Itself." Deliberately deferred, matching the
design doc's own list: WASD/controller movement, collision detection,
inverse kinematics/skeletal animation, multiplayer, remote avatars,
presence broadcasting, signed movement, replay protection, avatar
asset downloading, and user-uploaded 3D models — plus avatar
selection/inspection (a distinct presence-selection concept, not
document selection, deliberately not built alongside rendering).

0.2.36 makes the avatar an embodied local participant: W/S move it
along its own facing, A/D turn that facing, Shift runs, Space jumps —
entirely local, no network, no collision against world geometry (an
avatar can walk through a published building; that's an accepted,
explicit limitation, not an oversight). The pipeline stays exactly the
one the design doc asked for — `keyboard -> AvatarMovementController ->
core/AvatarMovementSimulation.js (pure kinematics) -> AvatarPresence
(sequence advances by exactly one per accepted update) ->
AvatarVisual/renderer` — never the reverse: no code path anywhere lets
a keystroke or a Three.js object touch position directly. WALKING/
RUNNING gained a real, continuous gait cycle driven by elapsed time
(never a frame count), and a "Follow Avatar" camera mode shifts the
camera by exactly the avatar's own movement delta without ever
redefining what document is focused or active. See
docs/Architecture.md, 0.2.36, and docs/Principles.md, "Input Changes
Presence; Presence Changes The Renderer" and "Movement Is Kinematic,
Not Physically Simulated." Deliberately deferred, matching the design
doc's own list: collision/navigation constraints against world
geometry, inverse kinematics/skeletal animation, multiplayer, remote
avatars, presence broadcasting, signed movement, and replay protection.

0.2.37 makes the local avatar's presence observable by other
replicas, while keeping it exactly as ephemeral and non-authoritative
as 0.2.33 already established — no signatures, no persistence, no
CausalStamp. The transport is a real, working `BroadcastChannel`-based
simulation of decentralization (`presence/LocalAvatarPresenceBroadcastProvider.js`,
same shape as `LocalDiscoveryProvider`/`LocalSpatialIndexProvider`):
two same-origin browser tabs genuinely see each other's avatars move.
An advertise/pull round trip (`application/PresenceSyncService.js`)
keeps the two concerns separate: a broadcast handler only ever queues
what arrived, and a receiver's own "pull" step is the one and only
place incoming data gets ingested into that replica's OWN state
(`application/LocalPresenceStore.js`), sequence-tolerant of exactly
the disorder a real network produces (out-of-order, duplicate, and
gapped sequence numbers are all handled by one monotonic-acceptance
rule — see `core/PresenceIngestion.js`). Presence lifecycle
(PRESENT/STALE/ABSENT) is a derived observation on the RECEIVER's own
clock, never a stored fact or a sender's claim
(`core/PresenceFreshness.js`). A remote avatar's position is visually
interpolated (`core/PresenceInterpolation.js`,
`application/RemoteAvatarInterpolator.js`) so bursty network updates
read as continuous movement, while the latest received advertisement
remains the sole authoritative value throughout. Appearance is
deliberately NOT synchronized — every remote avatar renders with a
fixed placeholder appearance; that's real appearance sync (and any
`AvatarProfile` signature layer) is left for later. See
docs/Architecture.md, 0.2.37, and docs/Principles.md, "0.2.37
Establishes Transport Semantics; 0.2.38 Establishes Trust Semantics."
Deliberately deferred, matching the design doc's own list: signatures
on presence, CausalStamp, conflict resolution, equivocation
detection, replay protection, persistent presence, avatar collision,
avatar-to-avatar interaction, voice/chat, remote avatar editing,
avatar ownership transfer, and decentralized avatar-template
distribution.

0.2.38 hardens the ingestion boundary 0.2.37 built, without redesigning
presence synchronization itself — every 0.2.37 file
(`PresenceSyncService`, `RemoteAvatarInterpolator`, `RemoteAvatarRegistry`,
the `presence/` transport, `core/PresenceIngestion.js` itself) stays
completely unchanged. One new gate,
`application/PresenceTrustBoundary.js`, sits between "an advertisement
arrived" and "this replica's state changed," answering five questions
in order: does the signature verify (or does policy tolerate it being
unsigned — `core/PresenceTrustPolicy.js`, the one real policy axis);
is the claimant authorized to speak for this avatarId at all
(`core/PresenceAuthority.js`, a trust-on-first-use binding — "an
avatarId identifies an avatar, it does not prove who currently
controls it"); has this exact claim already been accepted before
(`core/PresenceReplayWindow.js`, deliberately BOUNDED rather than
reusing `replication/ReplayGuard.js`'s unbounded memory — a live
presence stream is nothing like the rare durable events that class was
built for); does it conflict with what's currently held at the same
sequence (`core/PresenceEquivocation.js`, reusing 0.2.19's own
`EQUIVOCATING` vocabulary and 0.2.18's "equal-but-different is still a
conflict" principle, applied to `sequence` the way `CausalStamp`
applies to index roots); and only then, is it actually newer
(0.2.37's own `core/PresenceIngestion.js`, untouched). Signing is real
Ed25519 (`application/PresenceSigning.js`,
`identity/LocalAuthorizationVerifier.verifyPresenceAdvertisement()`)
over a canonical envelope covering EVERY field, never just
avatarId+sequence — but stays OPTIONAL at the wire level by design; a
receiver's policy, not the sender, decides whether an unsigned claim
is tolerated. A rejected claim never overwrites what a replica
currently displays — arrival order never picks a winner — but IS
remembered as a `TrustObservation`, surfaced through
`core/PresenceDiagnosticsSummary.js` as an unobtrusive World View line
("Other Avatars: 7 — 3 trusted, 2 stale, 1 conflicting, 1
unavailable") that never touches the avatar's own rendering. The
flagship test scripts a genuinely hostile scenario end-to-end over a
real `BroadcastChannel`: a captured genuine packet replayed verbatim,
a tampered position with a now-invalid signature, Alice's own real key
producing a conflicting claim at her current sequence (true
equivocation), and a different real signing identity impersonating her
avatarId at a new sequence — every one rejected, Alice's own further
movement unaffected throughout, and Document/Publication/
WorldPlacement/SpatialIndex/AvatarProfile byte-identical from start to
finish. See docs/Architecture.md and docs/Principles.md, "An Avatar ID
Identifies An Avatar; It Does Not Prove Who Currently Controls It" and
its neighboring 0.2.38 principles. Deliberately deferred, matching the
design doc's own list: physical-plausibility checks on a claimed
position, rate limiting, mandatory signing, `CausalStamp`, persistent
presence, an `AvatarProfile` signature/distribution layer, avatar
collision, avatar-to-avatar interaction, and voice/chat.

**0.2.33 through 0.2.38 complete a full vertical slice of the avatar
arc**: create an avatar, customize it, see it, move it, see others move,
and handle hostile/stale/conflicting presence. The avatar roadmap was
deliberately PAUSED at that checkpoint rather than immediately
continuing into chat, collision, emotes, voice, or avatar trading.

0.2.39 is the architecture-checkpoint milestone that pause was FOR:
not a new avatar feature, but the gap 0.2.26–0.2.38 left visible —
World View's click/selection model was designed almost entirely around
document bricks, and avatars (0.2.35 onward) deliberately did nothing
when clicked because no interaction model existed yet for them. Makes
avatars first-class interactive World View entities — clickable,
inspectable, followable — WITHOUT ever making them documents,
placements, or editable world content. `WorldNavigationSession.pick()`
now checks a brick raycast and an avatar raycast TOGETHER
(`renderer/PickingService.js`/`renderer/AvatarPickingService.js`,
completely separate object sets) and lets whichever is actually nearer
the camera win — an avatar standing in front of a wall is selectable
as itself, never as the wall behind it. A NEW, independent state slice
(`application/spatial-state/AvatarInteractionState.js`) tracks the
avatar target, structurally unable to enter `SpatialSelectionState` —
see docs/Principles.md, "Avatars Are Never Document Selection": an
avatarId can never reach the clipboard, groups, the transform gizmo,
or undo/redo, not because those systems reject it but because they
never see it at all. Clicking an avatar shows a read-only Avatar Info
panel (`ui/components/AvatarInfoPanel.js`) — display name, template,
lifecycle/trust status, position, distance, animation — with
deliberately NO Edit/Move/Delete/Save; the one available action,
"Follow" (`WorldNavigationSession.followAvatarId()`), is a pure camera
relationship, mutually exclusive with 0.2.36's own local-avatar-follow
since there is only one camera. A targeted or followed avatar whose
presence expires (0.2.38's ABSENT-pruning) clears gracefully rather
than pointing at nothing. See docs/Architecture.md and
docs/Principles.md, "Selection Identifies What The User Is Interacting
With; It Does Not Imply Ownership, Editability, Or Authority,"
"Whichever Is Nearer Wins, Never Category," and "Looking At Something
Is Never The Same As Acting On It." Also documents, without
implementing, an explicit boundary the design doc asked to name now
rather than later: presence has no privacy guarantee beyond transport
scope — see docs/Protocol.md and docs/Principles.md, "Avatar Presence
Has No Privacy Guarantee Beyond Transport Scope." Deliberately deferred,
matching the design doc's own list: avatar collision, pushing other
avatars, gestures/emotes, chat, voice, trading, avatar ownership
transfer, a friends/social graph, private/scoped presence, and
decentralized avatar-template distribution — collision in particular,
since it raises real cross-replica authority questions ("who decides
Alice collided with Bob?") that deserve their own carefully designed
milestone, not a corner of this one.

0.2.40 closes the boundary 0.2.39 explicitly left open (see
docs/Principles.md, "Avatar Presence Has No Privacy Guarantee Beyond
Transport Scope") without touching how avatars move, render, trust, or
interact. `core/PresenceVisibilityPolicy.js` gives a sender explicit,
persistent control over whether their presence is even eligible to be
published at all — `PUBLIC`/`FRIENDS`/`LOCAL`/`HIDDEN`
(`core/PresenceVisibility.js`) — consulted in
`WorldNavigationSession._setupLocalAvatar()`'s publish path BEFORE
`PresenceSyncService.publish()` is ever called, never as a
receiver-side filter and never by sending an obscured/encrypted
advertisement anyway (`HIDDEN` means `publish()` is simply never
invoked). Deliberately kept small and honest about what it does and
doesn't provide: `FRIENDS` requires an explicit, manually-entered
`authorizedPeerIdentities` allow-list — not a friend-request system,
not mutual, not discovered — and is upfront that today's only
transport (`presence/LocalAvatarPresenceBroadcastProvider.js`, a
same-origin `BroadcastChannel`) has no per-recipient addressing, so
FRIENDS currently controls WHETHER a replica advertises (empty list
behaves like HIDDEN) rather than WHO among the transport's listeners
can decode what does get sent; `LOCAL` and `PUBLIC` are honestly
documented as observationally identical today, for the same
single-transport-scope reason. `AvatarProfile`/`AvatarPresence`/
`PresenceVisibilityPolicy` stay three genuinely independent concerns —
three storage keys, and in `ui/views/AvatarSettingsView.js`'s new
"Presence Visibility" section, two independent forms with two
independent Save actions, so editing one can never accidentally alter
the other. The flagship test proves the sender/receiver symmetry with
0.2.38's trust boundary end to end: Alice, HIDDEN, moves twice — Bob
receives nothing, doesn't even know her avatar exists — then Alice
switches to PUBLIC and her very next movement reaches Bob normally,
with zero special-casing anywhere in Bob's own session. See
docs/Architecture.md and docs/Principles.md, "Visibility Happens
Before Broadcasting, Never After," "AvatarProfile, AvatarPresence, and
PresenceVisibilityPolicy Are Three Independent Concerns," and "A
Policy Abstraction Can Exist Before The Mechanism It Fully Assumes."
Deliberately deferred, matching the design doc's own list: a
friends/social graph, blocking, avatar collision, physical pushing,
voice/chat, emotes, avatar trading, persistent remote-avatar storage,
decentralized avatar-template distribution, encrypted/private
presence, precise location privacy, and cryptographic anonymity.

0.2.41 resumes the avatar arc for exactly one narrowly-scoped gap
0.2.37 explicitly deferred: appearance itself. Every remote avatar
had, until now, rendered with the same fixed placeholder forever —
presence (0.2.37/0.2.38/0.2.40) makes an avatar move correctly and
trustworthily, but says nothing about what it looks like. 0.2.41 gives
Bob Alice's REAL customized appearance, reusing the trust vocabulary
0.2.38 established without duplicating the entire presence protocol —
`core/AvatarProfileAdvertisement.js`'s new wire shape
(`avatarId`, `ownerIdentity`, `profileRevision`, `templateId`,
`appearance`, `displayName`, optional signature) travels on its own
`BroadcastChannel` (`'forkbuild:avatar-profile'`), through its own
sync service, trust boundary, and store
(`application/AvatarProfileSyncService.js`/`AvatarProfileTrustBoundary.js`/
`LocalAvatarProfileStore.js`), ordered by a `profileRevision` — never
a timestamp, exactly presence's own "arrival order does not determine
state" discipline. Two deliberate reuse decisions: `core/
PresenceAuthority.js`'s TOFU authority registry is reused for the
identical underlying question ("who may speak for this avatarId"), but
with its OWN separate instance, so winning the race to claim an
avatarId's presence never also hijacks its profile authority; and
`replication/ReplayGuard.js` (the UNBOUNDED guard) is reused as-is,
because profile updates are genuinely the rare, low-frequency workload
that class was built for, unlike presence's own bounded
`core/PresenceReplayWindow.js`. An unrecognized `templateId` — the
realistic case of a peer whose customization uses a template this
replica's registry doesn't carry — degrades gracefully to the same
fixed placeholder rather than crashing or guessing, per
docs/Principles.md, "Validate Strictly On Write; Degrade Gracefully On
Read." `application/LocalAvatarProfileStore.js` deliberately never
time-prunes (unlike presence's own store): appearance is a durable
fact, not a live one, and outlives a peer's presence going STALE or
even ABSENT. Profile publishing reuses `PresenceVisibilityPolicy`'s
`shouldAdvertise()` gate verbatim — no second, independently-
configured privacy system — and a 15-second periodic republish
(`PROFILE_REPUBLISH_INTERVAL_MS`) is the one new piece of "eventual"
in this eventually-consistent presentation state, letting a replica
that joins mid-session, or missed the one edit, eventually catch up on
a fire-and-forget transport with no request/response mechanism. See
docs/Architecture.md and docs/Principles.md, "Appearance And Position
Are Different Lifecycles, Never One Message," "Appearance Is Durable;
Presence Is Ephemeral," "Presence And Profile Share One Publication
Gate," and "A Fire-And-Forget Transport Needs Its Own 'Catch Me Up.'"
Deliberately scoped narrow, matching the design doc's own instruction:
no touch to movement, collision, chat, or the world-document model —
`tests/AvatarAppearanceSync.test.js`'s flagship proves Bob renders
Alice's actual customized avatar, with proper revision ordering,
template fallback, and the same trust/visibility boundaries 0.2.38/
0.2.40 already established, over two real `WorldNavigationSession`s
and two real `BroadcastChannel`s.

The avatar roadmap's own suggested next steps — 0.2.42 (avatar/world
collision & movement constraints), 0.2.43 (emotes), 0.2.44 (chat), and
eventually voice — remain exactly that: suggestions, not commitments.
Nothing in this codebase assumes the next milestone resumes the avatar
arc rather than opening an entirely different one.

## 0.1.50 — What shipped

Discoverability and consistency for the accumulated 0.1.42–0.1.49
feature set. No new domain entities, no new transform model, no new
commands, no persistent editor modes — the milestone sits entirely
above the kernel and invokes the existing sessions.

- application/EditorActionRegistry.js — one registry of user-facing
  operations: id, label, category, shortcut (display + machine keys),
  description, enabled(context), disabledReason(context),
  execute(invocation). createStandardActions() binds each surface's
  session into shared definitions, so Editor and World View expose
  identical action sets by construction. Actions that produce history
  do so through existing commands; most don't — the registry never
  touches CommandHistory or World.
- application/EditorActionContext.js — pure snapshot of availability
  state (selection count, clipboard, groups, undo/redo labels, gesture
  activity, palette state, active tool), captured fresh on every
  consumption, with defensive duck-typed fallbacks so no surface can
  make the palette throw.
- application/InputRouter.js — minimal input routing: the explicit
  Escape priority chain (input > palette > gesture > marquee >
  selection), text-input detection, and registry-driven shortcut
  matching with Ctrl/Cmd parity and key-repeat suppression.
- ui/components/CommandPalette.js — Ctrl/Cmd+K palette over the
  registry: substring search across label/category/id, category
  sections, arrow-key navigation, Enter executes only enabled actions,
  Escape closes, disabled actions stay visible with their reasons.
- ui/components/ActionFeedback.js — one-line transient messaging
  ("Aligned Left", "Rotated +90°", "Copied selection"), aria-live, no
  toast framework.
- ui/components/EditingSidebar.js — consolidated Selection / Transform
  / Groups / Clipboard sections composing the existing AlignmentPanel
  and NumericTransformPanel unchanged, with empty states and disabled
  reasons instead of dead buttons.
- EditorSession / WorldNavigationSession — selectAll() and
  getSelectionCount() join the session API (Editor additionally gets
  clearSelection()/deleteSelection()); everything else is invoked, not
  modified.
- EditorView / WorldView — keyboard surfaces consolidated onto the
  registry; Escape follows the priority chain; tool switching and
  Ctrl+S remain view-local (they are not editing actions).
- tests/EditorActions.test.js + tests/CommandPalette.test.js —
  architectural tests: unique ids, unique shortcuts, shared
  definitions across surfaces, disabled actions never executing,
  correct session API invocation, selection-only actions leaving
  mutation APIs untouched, graceful degradation on partial surfaces,
  the Escape priority table, search/grouping/gating.
- docs/user/ControlsReference.md — regenerated from the same action
  metadata, eliminating documentation drift.
- docs/Principles.md — "Actions are not commands" and "One operation,
  one definition, every surface".

Deliberately rejected in 0.1.50: CommandPaletteCommand or any mixing of
UI actions with CommandHistory, a sophisticated fuzzy-search engine, a
generalized toast/notification framework, a full accessibility
framework, a UI redesign, nested groups, and any kernel-layer change —
TransformSelectionCommand, CommandHistory, TransformMath/Snap/
Alignment/Input, selection state, group commands, replay, restore, and
the protocol are all untouched.

## The progression this completes

0.1.42 Clipboard → 0.1.43 Selection + Groups → 0.1.44 Unified Transform
Kernel → 0.1.45 Selection/Group Surface → 0.1.46 Pointer Gizmo →
0.1.47 Precision + Snapping → 0.1.48 Alignment + Distribution →
0.1.49 Numeric Intent → 0.1.50 Discoverability + UX.

0.1.49 ended feature construction; 0.1.50 makes the accumulated feature
set feel like one product. 0.1.51 (Stability / Performance /
Large-Document Hardening) and 0.1.52 (Protocol & Persistence
Hardening) follow before 0.2 Publishing & Multiplayer.
