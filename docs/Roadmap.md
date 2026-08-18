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
0.2.42  Avatar-World Collision & Movement Constraints            ✓
0.2.43  Avatar-Avatar Proximity & Interaction Targets             ✓
0.2.44  Local Avatar Interaction & Social Presence                 ✓
0.2.45  Ephemeral Avatar Interaction Synchronization                 ✓
0.2.46  Local Identity & Authentication Session                       ✓
0.2.47  Identity Security & Key Protection                             ✓

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

0.2.42 closes the one conspicuous limitation the movement model
carried since 0.2.36: avatars could walk straight through published
geometry. The movement pipeline gains one new step —
`core/AvatarMovementSimulation.js`'s pure kinematics produce a
PROPOSED position, `application/AvatarMovementConstraint.js` (backed
by the pure geometry in `core/AvatarCollision.js`) resolves it against
whatever collision geometry this replica currently has streamed in,
and only THEN does the result reach `AvatarPresence` — see
docs/Principles.md, "Collision Is A Constraint Applied To Movement,
Never Part Of The Movement Simulation Itself." Deliberately scoped to
"start simple": an upright bounding-box approximation of the avatar,
axis-aligned per-brick bounds (ignoring `Brick.rotation`), static
brick/ground collision, and an axis-separated SWEPT slide that both
resolves diagonal approaches into a true slide (rather than a dead
stop) and never tunnels through a thin obstacle on a single large
step — see docs/Principles.md, "Start Simple: A Box Is A Good Enough
Capsule." Honestly scoped to what this replica actually knows, not
the whole decentralized world: collision geometry comes entirely from
`WorldNavigationSession`'s own `_loadedDocuments` — a wall outside the
streaming radius was never asked for and cannot suddenly become an
obstacle — see docs/Principles.md, "The Local Avatar Is Constrained By
Collision Geometry Currently Available To This Replica, Never By The
Entire World." Derived, never persisted: no collision record, no
`Avatar → Document` relationship, exactly `Document + WorldPlacement`
math computed fresh every tick (docs/Principles.md, "Collision Is
Derived From Document + Placement, Never A Third Relationship").
`AvatarAnimationState` gains nothing — a collided step is movement
information (`AvatarMovementController.isCollided()`, transient, never
part of `AvatarPresence`), never an animation vocabulary entry
(docs/Principles.md, "Collided Is Movement Information, Not An
Animation Vocabulary"). Deliberately deferred, matching the design
doc's own instruction: avatar-avatar collision (a genuinely harder,
multiplayer-authority-laden problem — should Alice collide with Bob's
DISPLAYED, interpolated position or his CLAIMED one? — left for a
dedicated later milestone), standing on top of raised geometry (the
avatar's vertical ground plane stays the fixed Y=0 plane 0.2.36
established), and any change to presence's own wire shape, trust, or
replay handling. `tests/AvatarCollision.test.js`'s flagship runs the
design doc's own scripted scenario end to end: publish a wall → place
it → load it into Alice's World View → stand next to it → hold W →
stop at the boundary → turn 90° → slide along it → jump against it →
never penetrate → Document/Publication/Placement remain byte-identical
→ a real remote replica (Bob) sees Alice's already-constrained
movement through completely ordinary presence sync, with zero
collision-aware special-casing anywhere in his own session — collision
is a local movement constraint, never a new network authority
mechanism.

0.2.43 keeps the movement-model stopping point 0.2.42 reached and
answers the one capability question still missing from the avatar
stack: "who is near me?" `core/AvatarProximity.js#computeNearbyAvatars()`
is a pure function computing that as a DERIVED, purely local fact —
nothing gets written to a Document, Publication, WorldPlacement, or
AvatarProfile, and nothing crosses the wire — over exactly the same
trusted remote-presence list that already drives rendering
(`application/RemoteAvatarRegistry.js`), never a second,
independently-verified copy of it. See docs/Principles.md, "Proximity
Is Derived, Never Announced": two replicas computing "who is near me"
independently are never required to agree, the same way `core/
SpatialQuery.js`'s own `distanceBetween()` (0.2.28) was already
understood as a purely local computation, never a claim one side
declares to the other. `WorldNavigationSession.getNearbyAvatars(radius)`
distinguishes PRESENT (a usable, fresh claim) from STALE (still
listed, visibly marked, per the design doc: "potentially unsuitable
for interaction") — and ABSENT avatars are simply never reachable at
all, not through any filtering this milestone added, but because
`application/LocalPresenceStore.js` already deletes an ABSENT record
the moment it's asked for; "removed, therefore not an interaction
target" was already true before 0.2.43 existed. A small, genuinely
useful catch-up rides along: `getAvatarDisplayName()` fixes a stale
0.2.39 comment that claimed a remote avatar's displayName "is never
distributed" — true when written, false since 0.2.41's profile sync
existed. `AvatarInteractionState` needed no changes at all — it was
already exactly `{ avatarId }` since 0.2.39, precisely the shape the
design doc asked for. The one new capability,
`WorldNavigationSession.targetAvatar(avatarId)`, lets the new "Nearby
Avatars" panel (`ui/components/NearbyAvatarsPanel.js`) reach an
avatarId without a screen-space pick, but reuses EVERY existing
mechanism once it does — the same `getAvatarInfo()`, the same
`followAvatarId()`, the same status-dot vocabulary — see
docs/Principles.md, "A New Way To Reach An Avatar Is Not A New Way To
Inspect One." Crucially, per the design doc's own explicit interaction
contract: nearness never authorizes mutation. `targetAvatar()`'s
entire effect is on the CALLER's own local UI-focus state; there is no
method anywhere, before or after 0.2.43, that lets one replica write
to another avatar's own presence or profile — see docs/Principles.md,
"Nearness Never Authorizes Mutation," proven directly in
`tests/AvatarProximity.test.js`'s flagship by asserting Alice's own
`AvatarProfile`/`AvatarPresence` stay byte-identical throughout an
entire scripted scenario of Bob querying, targeting, and following
her. Deliberately, explicitly NOT in 0.2.43, matching the design doc's
own instruction: avatar-avatar collision or pushing — a genuinely
harder, multiplayer-authority-laden problem (Alice's local state vs.
Bob's remote, interpolated, potentially-stale state — which one
decides?) — left for a dedicated later milestone, if one is ever taken
up at all.

0.2.44 answers the next question the design doc posed: "once I know
another avatar is nearby, what can I actually do with it?" —
deliberately with the smallest possible answer, and deliberately still
with no wire format change. A closed vocabulary of local gestures
(`core/AvatarInteractionKind.js` — GREET/WAVE/POINT), a shared cooldown
proven now while conditions are easy (`core/
AvatarInteractionCooldown.js`, one sender, one trusted local clock) so
0.2.45's eventual networked version inherits it rather than inventing
rate-limiting under harder conditions, and a purely local, purely
presentation gesture pose + facing override
(`renderer/AvatarVisual.js#setGesture()`/`setFacingOverride()`) that
never touches `AvatarPresence` and is never rendered on anyone but the
gesturing avatar's own replica. `AvatarInteractionState` — unchanged in
shape since 0.2.39, per 0.2.43's own note — finally grows the two
fields the design doc asked for, `interaction`/`interactionStartedAt`,
kept on the SAME state slice rather than a third one, because a
gesture is meaningless without the target it travels alongside. The
Avatar Info panel grows exactly three buttons (Greet/Wave/Point); three
of the design doc's other named intents — Invite to Follow, Stop
Following, Inspect — needed no new code at all, because they were
already Follow/Stop Following and "open the panel," established since
0.2.39/0.2.43. See docs/Principles.md, "Observation Does Not Imply
Authority, And Interaction Does Not Imply Control" and "A Gesture Is
Presentation, Never Presence" — the same nearness-never-authorizes-
mutation boundary 0.2.43 drew for OBSERVING another avatar now extends,
unbroken, to WANTING to interact with one.

0.2.45 answers the question 0.2.44 deliberately deferred: "how can
Alice see that Bob waved at her without turning a gesture into
persistent avatar state?" A third, independent
advertise/trust/pull pipeline — `core/AvatarInteractionAdvertisement.js`
→ `application/AvatarInteractionTrustBoundary.js` →
`application/AvatarInteractionSyncService.js` — mirrors the shape
0.2.37/0.2.38 and 0.2.41 already established for presence and profile,
deliberately without copying either blindly: `AvatarInteractionSyncService.pull()`
returns a transient batch of newly-accepted EVENTS, never a persisted
"current" record the way `PresenceSyncService`/`AvatarProfileSyncService`
do, because an interaction genuinely isn't state — see
docs/Principles.md, "State Synchronization And Event Synchronization
Are Different Protocols." `targetAvatarId` travels on the wire as a
CLAIM ("Bob claims he waved at Alice"), never as an instruction — a
bystander who isn't the named target can observe and render the same
event Alice does, and no replica gains any new reach into another
avatar's own state because of it, the identical boundary 0.2.44 already
drew for the purely local half of this feature. A bounded replay
window (`core/AvatarInteractionReplayWindow.js`) does double duty,
tracking both `interactionId` (duplicate suppression) and `sequence`
(staleness rejection) per avatarId — deliberately its own structure,
neither presence's nor profile's replay mechanism reused verbatim. One
real gap is named rather than hidden: no equivocation detection exists
for interactions (the same bound signing authority producing two
different events at one sequence number), left explicitly to 0.2.46
rather than solved here. The flagship test proves the shape end to
end over a real `BroadcastChannel`: Bob waves at Alice, Alice's replica
renders it on Bob's own avatar visual, an attacker's replay/staleness/
tamper/impersonation attempts all fail, the gesture expires on its own,
and neither avatar's `AvatarPresence`/`AvatarProfile` — nor any
`Document`/`WorldPlacement`/spatial index — is ever touched.

The avatar roadmap's own suggested next steps — interaction trust,
replay & abuse controls (the equivocation gap 0.2.45 named above, plus
spam/blocking), avatar privacy, blocking & interaction permissions, an
avatar emotes & animation library, and eventually text chat/voice/a
richer social model — remained exactly that: suggestions, not
commitments. As 0.2.45 itself said, nothing in this codebase assumed
the next milestone would resume the avatar arc rather than opening an
entirely different one — and 0.2.46 exercises exactly that: it pauses
the avatar arc at its 0.2.45 checkpoint and opens decentralized
identity/session architecture instead, on the reasoning that "who is
the user behind `ownerIdentity`, and how does a decentralized
application establish that identity without a central login server?"
is more foundational than any further avatar feature. The avatar
arc's own suggested next steps above remain unscheduled, available to
resume whenever a real need reopens them.

0.2.46 answers that question, deliberately scoped to its LOCAL half
only — no network, no server, no recovery mechanism yet. It separates
three concepts that 0.2.16 had silently conflated into one event
(typing a username): `identity/LocalIdentity.js` (new) is a durable
record of a keypair THIS device actually holds — `identityId` (a
did:key, the exact derivation `identity/SigningIdentity.js` already
uses), `publicKey`, `algorithm`, a local-only `label`, and `createdAt`
— constructed only when its `identityId` provably derives from its own
`publicKey`. `identity/AuthenticationSession.js` (new) answers a
question that never had a dedicated answer before: not "does this
device hold this key" (durable — `LocalIdentity`) and not "what name
is the app showing" (`identity/Identity.js`, 0.1.21, unchanged), but
"is one of them unlocked right now" — `ANONYMOUS` or `AUTHENTICATED`,
carrying an `identityId`/`authenticatedAt` pair only in the latter
state, invalid by construction otherwise. `identity/
LocalIdentityProvider.js` is rebuilt on both: `createLocalIdentity(label)`
generates a keypair immediately and stores it in a durable, listable
index, independent of any login flow — the design doc's own "Identity
= f(publicKey)" step — and `authenticate(identityId)`/`endSession()`
start and end a session by unlocking (or releasing) a key this device
already holds, never by deriving a fresh one from a typed string.
Every pre-existing method on the provider — `login(username)`,
`logout()`, `currentUser()`, `sign()`, `getSigningIdentity()`,
`signCanonical()` — keeps its EXACT 0.1.21/0.2.16 signature and
observable behavior, now implemented as a thin, backward-compatible
layer over the session model: `login(label)` finds-or-creates a
`LocalIdentity` carrying that label and authenticates it (so the same
typed username still resolves back to the same key on the same
device, exactly as 0.2.16 already guaranteed), and `currentUser()` is
a pure, derived VIEW of the current `AuthenticationSession` rather
than a second stored fact that could drift out of sync with it. Every
one of the roughly forty-five existing tests that call
`provider.login('alice')`, and every application/ use case that signs
a publication, placement, or avatar presence/profile/interaction
advertisement through `getSigningIdentity()`/`signCanonical()`, keeps
working completely unchanged — proven by running the full existing
suite unmodified. What DID change, and is now directly testable for
the first time: signing is genuinely gated by `AuthenticationSession`,
not merely by `currentUser()` happening to agree with it —
`tests/LocalIdentitySession.test.js` ends a session and watches
`getSigningIdentity()`/`signCanonical()` refuse with "no active
authentication session" while the identity and its key remain on disk,
completely untouched, ready to be re-authenticated later; and a single
device can now hold multiple independent identities (`listLocalIdentities()`),
switching between them by authenticating a different one without ever
deleting or overwriting another. See docs/Architecture.md, "Local
Identity & Authentication Session (0.2.46)," and docs/Principles.md,
"Login Unlocks An Identity; It Does Not Derive One From A Typed Name"
and "Identity Existence And Session Authentication Are Independent
Facts." The Login modal (`ui/components/LoginModal.js`) is rebuilt to
match: it lists every identity this device already holds so logging
back in means picking the identity you already have, and creating a
new one (`IdentityUseCase.createIdentity()` + `authenticate()`) is an
explicit, separate action, never a side effect of retyping a name.

Deliberately not in 0.2.46, matching the design doc's own staged
scope: a passphrase or any encryption protecting the stored private
key (today's key material is exactly as protected as 0.2.16's always
was — plain local storage, a real limitation named here rather than
hidden); portable identity export/import or a recovery phrase (moving
to a new device still means creating a brand-new identity — a
genuinely different, harder problem, explicitly proposed as its own
future milestone, "Portable Identity & Key Recovery," below); any peer
discovery mechanism or authenticated peer session (today's identities
still only ever prove something to the LOCAL device holding them —
nothing here lets Alice prove her identity to Bob over a network); and
any change whatsoever to the signed-object wire formats, `core/
Signature.js`, or `identity/LocalAuthorizationVerifier.js` — a
`SigningIdentity` still looks, verifies, and travels exactly as it did
in 0.2.16, because only WHERE it comes from on the signing side
changed, never what it IS once produced.

0.2.47 closes the specific gap 0.2.46 named rather than continuing
straight into portability or peer networking: a `LocalIdentity`'s
private key sat on disk exactly as plainly as 0.2.16's always did.
It introduces a FOURTH concept alongside 0.2.46's three —
`identity/VaultLock.js`, "is this identity's key decrypted in memory
right now?" — deliberately independent of both `LocalIdentity`
(durable) and `AuthenticationSession` (persisted, but transient): a
protected identity can be AUTHENTICATED while its vault is LOCKED, and
a page reload always finds a protected vault LOCKED regardless of
whether the session survived, because the decrypted seed is never
written anywhere durable at all (`identity/KeyEncryption.js`'s PBKDF2-
HMAC-SHA512 + SHA512-CTR + HMAC-SHA512 encrypt-then-MAC, built from the
same self-contained `sha512` primitive `identity/Ed25519.js` already
established, not a new dependency). Opting a new identity into
protection (`createLocalIdentity(label, passphrase)`) or migrating an
existing one in place (`protectIdentity(identityId, passphrase)`) is
always the owner's explicit choice — an identity created before 0.2.47
existed, or created since without a passphrase, keeps behaving exactly
as it always did. Failed-unlock attempts are rate-limited by a
time-based (not passphrase-based) cooldown
(`identity/FailedUnlockTracker.js`), and an unlocked vault auto-expires
after a fixed lifetime since last unlock
(`identity/VaultTimeoutPolicy.js`, honestly NOT true activity
detection — see docs/Principles.md) without ever ending the
`AuthenticationSession` itself. See docs/Architecture.md, "Identity
Security & Key Protection (0.2.47)," and docs/Principles.md, "Identity
Existence, Vault Unlock, And Session Authentication Are Three
Independent Facts, Not Two."

Deliberately not in 0.2.47: changing or removing a passphrase once set
(a real, named gap — today's protection, once chosen, isn't yet
editable); any PIN-strength/complexity policy (a passphrase is accepted
exactly as typed); true activity-based idle detection rather than a
fixed unlock lifetime; and — unchanged from 0.2.46's own list — portable
identity export/import/recovery and any peer discovery or authenticated
peer session. Protecting a key locally doesn't change that it is still
the only copy on the only device that has it; that is exactly what the
next proposed milestone below is for.

Proposed, unscheduled follow-on milestones this opens (suggestions,
not commitments, exactly like the avatar arc's own list above):
Passphrase Management (changing or removing a protected identity's
passphrase, and a real PIN/passphrase-strength policy — the two gaps
0.2.47 named above); Portable Identity & Key Recovery (encrypted
export/import so an identity survives moving to a new device, likely
building directly on 0.2.47's `KeyEncryption` record shape rather than
inventing a second encrypted-export format); Peer Discovery & Transport
Abstraction (separating "finding another peer" from "communicating
with one," with today's `presence/LocalAvatarPresenceBroadcastProvider.js`
becoming one local transport among several rather than the only one);
Authenticated Peer Sessions (mutual proof of identity-key possession
between two live peers, building on 0.2.46's `AuthenticationSession`
and 0.2.47's `VaultLock` the way `identity/LocalAuthorizationVerifier.js`
already builds on `identity/SigningIdentity.js`); and, once those
exist, reconnecting presence/profile/interaction sync to run over
genuinely authenticated peer connections instead of an open
same-origin `BroadcastChannel`.

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
