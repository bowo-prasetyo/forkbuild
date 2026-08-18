# ForkBuild

**Build. Fork. Share. Evolve.**

An open-source, browser-based, decentralized building platform. Creations are stored using interchangeable publishing providers and can be explored in a shared spatial world.

## Current Status

**Version 0.2.45** — Ephemeral Avatar Interaction Synchronization

0.2.16 gave every immutable object an answer to "who authorized
this?" (Ed25519 signing identities, signed publications / placement
revisions / spatial-index roots). 0.2.17 through 0.2.19 build on that
foundation: delegated authorization without transferring ownership,
causal replication so independently authorized replicas converge
without destroying either side's history, and a trust/discovery layer
that reasons about authority, freshness, replay, and equivocation —
not just cryptographic validity — before anything is treated as
current state. 0.2.20 closed a gap that fell out of that same
boundary: the World View can now be fully edited in place while a
published snapshot itself remains absolutely immutable, because
editing one is semantically "fork, then edit the fork" — done lazily,
on the first mutation, subject to the same fork policy as an explicit
Fork. 0.2.21 put a face on that enforcement: a Document Properties
editor, a Document Info panel, lifecycle status, and plain-language
explanations for why an edit is or isn't possible. 0.2.22 closed the
remaining gap between the two: the moment a fork is created, the World
View's title, status line, and browser route now atomically switch to
it — the screen never keeps displaying the published source while
every subsequent edit is silently landing on the fork underneath it.
0.2.23 connects a mature but previously unreachable part of the
architecture: publishing now creates an explicit, ownable, revisioned
Placement — separate from the document's title/description/license —
and the World View can show and move it without ever forking or
editing the document it points to. 0.2.24 formalizes the coordinate
system that placement runs on: a document's own content and a
placement's position are two coordinate systems that compose by
addition, never one; positions the system stores are always absolute,
even when chosen or nudged relatively; and initial placement is now a
pure function of a publication's own id instead of how many other
publications the local node happened to already know about — the
difference between "the same publication lands at the same coordinate
on every replica" actually holding and merely looking like it did in
single-node testing. 0.2.25 answers the question 0.2.24 deliberately
left open: `position` was never made globally unique, so what happens
when two placements share one? Sharing a coordinate is now an explicit,
derived observation (an overlap), never an error by itself; deciding
what to do about it is a separate policy (ALLOW/WARN/REJECT), defaulting
to WARN for an explicit move — the requested position is still what
gets placed, only after the person sees what else is already there and
chooses to proceed — while automatic initial placement stays
frictionless, exactly as 0.2.23 established. 0.2.26 turns the last
three milestones' correctness into something a person can actually
use: a World Search over the same decentralized discovery catalog
every other surface reads from (never a second, UI-only index), a
"Documents Here" list that makes 0.2.25's overlap count something you
can act on instead of just see, and Focus formalized as pure
navigation — it moves the camera and switches the active document, and
never, under any circumstance, forks or edits anything.

0.2.26 also exposed a simplification 0.2.27 closes: "where the camera
is" and "which document an edit lands on" had always been the same
field, which was harmless right up until two publications could share
a coordinate and switching between them stopped requiring the camera
to move at all. WorldNavigationSession now tracks camera focus and the
active (editing) document independently — `focusDocument()` still
moves both together by default, but a document can now become active
without the camera moving, and the camera can move without changing
what an edit would target. Making the split explicit surfaced a real,
previously-latent bug: group operations could independently fork
whatever the camera happened to be pointed at, separately from the
document a selection actually belonged to, mixing one document's
`worldId` with another's `brickIds` whenever the two diverged — fixed
by having every mutation path resolve its target from the selection or
the active document, never from camera position. The World View header
now shows "Camera: X · Editing: Y" so this is visible, not just
correct.

0.2.28 gives World Search a spatial half: "find everything within
`radius` World Units of `(x, y, z)`," composable with the 0.2.26 text
search rather than a separate mechanism — one query, both criteria.
Results carry a derived `distance` (never persisted — computed fresh
against whatever center was actually asked about) and are sorted
nearest-first; a publication found only through 0.2.24's deterministic
fallback position still honestly reports `hasPlacement: false`, so a
radius search can never present a fallback as an authored location.
The query is written against a decentralized contract — everything
discoverable within the region, not just what one node's local cache
holds — even though the live implementation is still today's honest,
un-decentralized `LocalWorldLayoutProvider` scan; swapping in a real
spatial-index-backed provider later changes nothing about how any
caller uses it.

0.2.29 makes that spatial query reachable from where a person actually
is, rather than requiring they already know a document's name or type
coordinates by hand: "Explore Here" and "What's Here?" turn the
CAMERA's current world position into a query center — deliberately not
the active document's placement, since 0.2.27 already established that
the two can genuinely differ, and a person looking at empty space
between two documents should still be able to explore there. Both
reuse the exact same spatial query 0.2.28 built (`exploreLocation` is
a thin wrapper over `searchWorldByLocation`); "What's Here?" just asks
it with a small fixed tolerance instead of a chosen radius, since a
continuous camera coordinate essentially never lands exactly on a
recorded placement. Each result in the new World Location Browser
supports three read-only actions — Focus (moves the camera, and by
default makes the document active, exactly like Focus always has),
Select (makes it the active document without moving the camera, per
0.2.27's separation), and Inspect (an inline, read-only expansion of
Document Info and Placement Info that never loads or navigates) — and
never moves a placement, edits a document, forks anything, or
publishes; those remain separate, deliberate actions elsewhere. The
result count reads "Showing N of N discoverable documents," the same
decentralized honesty 0.2.26/0.2.28 already established: what the
configured discovery provider can currently find, not a claim of
omniscient knowledge.

0.2.30 answers the question those milestones left open: how does a
decentralized World View know that what it found is trustworthy,
current, and complete enough to present? `exploreLocation` now returns
`{ documents, diagnostics }` — the document list is completely
unaffected by trust (a stale, conflicting, or unverifiable document is
still shown, never hidden), while `diagnostics` reports, honestly and
separately, what an OPTIONAL trust-capable provider observed about
that same region: `available: false` when no such provider was even
consulted (today's live default — the app still resolves documents
through the plain `LocalWorldLayoutProvider`, unchanged); `fatal` when
a provider was consulted but its index root/authority couldn't be
trusted at all; `complete: true` when the trust layer ran and found
nothing to flag; or itemized `warnings` (a stale accelerator entry, an
unavailable manifest, a rejected record, an unresolved conflict) when
it found something real. The Location Browser shows this as a banner
above its results — "✓ Discovery complete," "⚠ 1 stale entry," or a
neutral "diagnostics unavailable" note — and Inspect can now show a
specific document's own discovery status alongside its Document/Placement
Info. Nothing here is invented by the UI: every field traces back to a
real `TrustObservation` the 0.2.19 verification pipeline actually
produced when a real `DecentralizedSpatialDiscoveryProvider` was
wired and run (see tests/DiscoveryDiagnosticsSummary.test.js).

0.2.31 turns Repository/Author View from a small demo catalog into a
real, repository-scale browsing surface — a proper catalog model
first, then the UI on top of it. `SearchPublicationsUseCase` answers a
genuinely different question than World Search does ("which
publications match this description?" vs. "where is this in the
world?"), returning a `PublicationPage` — items plus enough metadata
to render explicit pagination (deliberately not infinite scroll — see
docs/Architecture.md). Ordering is one of a small set of meaningful
sorts (Recently/Oldest Published, Title A–Z/Z–A, Author A–Z) and is
provably deterministic across replicas: identical timestamps always
break their tie the same way, via an ordinal (not locale-dependent)
comparison. Every card/row now shows a truncated description and a
deterministic placeholder preview (a color + initial derived from the
publication itself — a real, signed, content-addressed preview is
deliberately deferred, since adding one to `Publication`'s already-signed
schema would retroactively break every existing publication's
signature; see docs/Principles.md). Description SEARCH is opt-in via
an explicit checkbox, since matching it means loading full documents —
a real cost this milestone is honest about rather than hiding.
Repository and Author View now share ONE `PublicationCatalog`
component rather than two slowly-diverging implementations, differing
only by an author scope. Tested against a 10,000-publication synthetic
catalog, not a handful of fixtures — pagination walks every page with
zero gaps or duplicates, in exact sorted order. See
[docs/Architecture.md](docs/Architecture.md) for the full write-up of
each milestone.

0.2.32 answers the preview question 0.2.31 deliberately left open —
and reverses its own earlier lean toward a signed, content-addressed
preview. A THUMBNAIL is rendered client-side, on demand, from a
publication's actual immutable document content (never from
user-supplied metadata, so a beautiful thumbnail can never advertise a
trivial document), using a deterministic camera framing (fixed
isometric angle, bounding-sphere distance so the whole object always
fits) computed as pure geometry in `core/PreviewCameraFraming.js` —
the same content always gets the same intended shot, though not
byte-identical pixels across GPUs, since a preview is a derived
visualization, not a cryptographic artifact. Generation is lazy
(`IntersectionObserver`-gated — a card off-screen never renders),
queued off the main thread (`requestIdleCallback`), cancellable (an
old page's or an old search's in-flight previews simply stop when
their cards unmount), and cached in memory only, keyed by content
identity, with LRU eviction. A preview failure never hides the
publication it belongs to — it just falls back to 0.2.31's existing
placeholder. Nothing about a preview is signed, persisted, or
replicated: see docs/Principles.md, "Previews Are Derived Client
State."

0.2.33 opens a new arc — humans as participants inside the world, not
just consumers of persistent content — and starts by drawing a line
before writing any rendering or movement code: `core/AvatarProfile.js`
(persistent — what does this user look like?) and
`core/AvatarPresence.js` (ephemeral — where is the user right now?)
are neither a Document, a Publication, nor a WorldPlacement. A
Profile persists per identity, one per user, immutable and
update-by-replacement like Publication/PlacementRecord already are.
A Presence lives only in `application/AvatarPresenceSession.js`'s
memory — that class has no `StorageProvider` dependency at all, a
structural guarantee rather than a convention — and is never signed:
signing answers "did an authority authorize this DURABLE fact," the
wrong question for something that changes many times a second. See
docs/Principles.md, "Identity, Avatar Profile, and Presence Are Three
Different Questions" and "Presence Is Never Signed, Never Persisted,
Never Placed." This milestone ships no rendering, movement, or
networking — those are 0.2.34 through 0.2.38, tracked in
docs/Roadmap.md.

0.2.34 gives `AvatarProfile.appearance` a real schema instead of an
unrestricted object: a small built-in template registry
(`core/library/CoreAvatarTemplateLibrary.js`) declares, per template,
exactly which components exist (skin/hair/shirt/pants/accessories)
and exactly which option ids and colors each one accepts — appearance
is declarative data, never executable code or a pointer to a remote
asset. Two boundaries apply opposite postures to that same data:
`updateProfile()` validates strictly and REJECTS anything outside a
template's declared bounds (unknown template, unsupported option,
malformed color, oversized payload — nothing invalid is ever
persisted), while `getEffectiveAvatar()` never throws, resolving a
complete appearance field-by-field with graceful fallback to the
template's defaults even for a profile whose template is unrecognized
— so a broken or stale avatar profile can never block access to the
World View. Ships the first visible avatar feature, the Avatar Creator
(`/avatar`, "My Avatar" in the nav) — every control is generated from
the selected template's own data, with a lightweight deterministic SVG
preview (no Three.js needed yet). See docs/Principles.md, "A Template
Is A Closed Vocabulary, Not An Asset Loader" and "Validate Strictly On
Write; Degrade Gracefully On Read."

0.2.35 puts the avatar physically into the World View's Three.js
scene — the local user's own avatar, rendering only, no movement input
or multiplayer yet. The renderer combines two independent inputs it
never modifies: 0.2.34's resolved appearance and 0.2.33's
`AvatarPresence` (position/rotation/animation) — `renderer/
AvatarRenderer.js` converts template+appearance into a real
`THREE.Group` (head/hair/torso/legs, plus one distinctly-shaped,
distinctly-placed mesh per selected accessory — glasses on the face, a
hat on the head, a scarf at the neck, a backpack on the back), and
`renderer/AvatarVisual.js` keeps that
object graph alive across updates: appearance changes rebuild only
when content actually changed, while position/rotation/animation
changes are cheap transform writes that never touch geometry. A "Show
My Avatar" checkbox in World View is a pure client rendering
preference — never persisted, never a new field on `AvatarProfile` or
`AvatarPresence`. Moving the avatar (or changing its appearance) never
touches a document's `WorldPlacement`, verified directly (byte-identical
placement JSON before/after) in the flagship test. A follow-up fix
makes a brand-new avatar spawn a short offset from whichever document
World View first opens on, rather than always at literal world origin
— a real document's own placement (0.2.24's deterministic grid
strategy) is essentially never near the origin, so the avatar was
rendering correctly but effectively always out of frame until this
shipped; only an avatar that has never moved is ever repositioned this
way. A second follow-up fix gives each accessory option its own shape
and position instead of the generic marker every accessory originally
shared. See docs/Principles.md, "An Avatar's Location Comes From
Presence, Never From The Avatar Itself," "A Fresh Avatar Spawns
Near What You're Looking At, Not At A Fixed Point," and "An Accessory
Option Id Is Still Just An Id."

0.2.36 makes the avatar an embodied local participant: W/S move it
along its own facing, A/D turn that facing, Shift runs, Space jumps —
entirely local, no network, no collision against world geometry (an
avatar can walk through a published building; that's an accepted,
explicit limitation, not an oversight). The pipeline stays one-way,
exactly as the design doc asked: keyboard input →
`AvatarMovementController` → `core/AvatarMovementSimulation.js` (pure
kinematics, sanitized against NaN/Infinity and clamped against extreme
deltas) → `AvatarPresence` (`sequence` advances by exactly one per
accepted update, never once per render frame regardless of motion) →
the renderer — a keystroke never touches a Three.js object directly.
WALKING/RUNNING now play a real, continuous gait cycle driven by
elapsed time (never a frame count — a 30fps machine and a 144fps
machine walk at the same speed). An explicit "Control My Avatar"
toggle captures WASD only while it's on, so typing or searching can
never accidentally walk the avatar away; a "Follow Avatar" toggle
shifts the camera by exactly the avatar's own movement delta without
ever redefining what document is focused or active. See
docs/Principles.md, "Input Changes Presence; Presence Changes The
Renderer," "Movement Is Kinematic, Not Physically Simulated," and
"Following The Avatar Never Redefines What The Camera Is Looking At."

0.2.37 makes the local avatar's presence observable by OTHER
replicas, while keeping it exactly as ephemeral and non-authoritative
as 0.2.33 established — no signatures, no persistence, still no
CausalStamp. The transport is a real, working simulation of
decentralization: `presence/LocalAvatarPresenceBroadcastProvider.js`
wraps the browser's own `BroadcastChannel` API, so two same-origin
tabs genuinely see each other's avatars move — no server, no mocking.
An advertise/pull round trip (`application/PresenceSyncService.js`)
keeps "a message arrived" and "this replica believes it" as two
separate steps: a broadcast handler only ever queues what came in, and
`pull()` — called once per render frame, this replica's own schedule —
is the one place a raw message becomes accepted state, via
`core/PresenceIngestion.js`'s monotonic-sequence rule (reordered,
duplicate, and gapped delivery are all tolerated by one "does this
sequence exceed what I have" check, no special-casing needed).
Presence lifecycle — PRESENT/STALE/ABSENT — is derived purely from
elapsed time on the RECEIVER's own clock, never a stored fact or a
sender's claim, so an avatar can go stale and eventually disappear
with zero new messages ever arriving. A remote avatar's position is
visually interpolated so bursty updates read as continuous movement,
while the latest received advertisement stays the sole authoritative
value throughout. "Show Other Avatars" (shipped disabled since 0.2.35)
is now real, and deliberately works even for a logged-out viewer — see
docs/Principles.md, "Watching Presence Never Requires Having One."
Appearance is NOT synchronized in this milestone: every remote avatar
renders with a fixed placeholder look, never the sender's actual
customized outfit. See docs/Principles.md, "0.2.37 Establishes
Transport Semantics; 0.2.38 Establishes Trust Semantics," and "The
Authoritative Position Is Always The Latest Presence; Interpolation Is
Only Ever A Presentation Detail."

0.2.38 hardens that ingestion boundary without redesigning it — every
0.2.37 file stays unchanged; one new gate,
`application/PresenceTrustBoundary.js`, sits between "an advertisement
arrived" and "this replica's state changed." It answers, in order:
does the signature verify, or does policy tolerate it being unsigned
(`core/PresenceTrustPolicy.js` — permissive by default, exactly 0.2.37's
own behavior; hardened requires every claim signed); is the claimant
even authorized to speak for this avatarId at all
(`core/PresenceAuthority.js`, a trust-on-first-use binding — "an
avatarId identifies an avatar, it does not prove who currently
controls it"); has this exact claim already been accepted before
(`core/PresenceReplayWindow.js`, a bounded recency window, not an
unbounded remember-forever set — a live presence stream is nothing
like the rare durable events `replication/ReplayGuard.js` was built
for); does it conflict with what's currently held at the same sequence
(`core/PresenceEquivocation.js`, reusing 0.2.19's own `EQUIVOCATING`
vocabulary and 0.2.18's "equal-but-different is still a conflict"
principle); and only then, is it actually newer (0.2.37's own
`core/PresenceIngestion.js`, untouched). Signing is real Ed25519
(`application/PresenceSigning.js`) over a canonical envelope covering
EVERY field — never just avatarId+sequence, which would let an
attacker keep a valid signature while swapping in a different
position. A rejected claim never overwrites what's currently
displayed — arrival order never picks a winner — but is remembered and
surfaced through an unobtrusive World View line ("Other Avatars: 7 — 3
trusted, 2 stale, 1 conflicting, 1 unavailable",
`core/PresenceDiagnosticsSummary.js`) that never touches the avatar's
own rendering. The flagship test scripts a genuinely hostile scenario
over a real `BroadcastChannel`: a captured packet replayed verbatim, a
tampered position with an invalidated signature, Alice's own real key
producing a conflicting claim at her current sequence, and a different
real signing identity impersonating her avatarId — every one rejected,
Alice's own further movement unaffected throughout, and
Document/Publication/WorldPlacement/SpatialIndex/AvatarProfile
byte-identical from start to finish. **0.2.33 through 0.2.38 complete
a full vertical slice of the avatar arc** — create, customize, see,
move, see others move, handle hostile presence — and the avatar
roadmap was deliberately PAUSED there as a stability checkpoint.

0.2.39 is the milestone that checkpoint was FOR: not a new avatar
feature, but closing a gap 0.2.26–0.2.38 left visible — World View's
click/selection model was built almost entirely around document
bricks, and avatars deliberately did nothing when clicked since 0.2.35
because no interaction model existed for them yet. `WorldNavigationSession.pick()`
now runs a brick raycast and a completely separate avatar raycast
(`renderer/PickingService.js`/`renderer/AvatarPickingService.js`)
together and lets whichever is actually NEARER the camera win — an
avatar standing in front of a wall is selectable as itself, never as
the wall behind it. A brand-new state slice
(`application/spatial-state/AvatarInteractionState.js`) tracks the
avatar target, structurally unable to ever enter `SpatialSelectionState` —
see docs/Principles.md, "Avatars Are Never Document Selection": an
avatarId can never reach the clipboard, groups, the transform gizmo,
or undo/redo, not because those systems reject it but because they
never see it at all. Clicking an avatar opens a read-only Avatar Info
panel (`ui/components/AvatarInfoPanel.js`) — display name, template,
lifecycle/trust status, position, distance, animation — with
deliberately no Edit/Move/Delete/Save; the one action, "Follow"
(`WorldNavigationSession.followAvatarId()`), is a pure camera
relationship, mutually exclusive with 0.2.36's own local-avatar-follow
since there is only one camera. A targeted or followed avatar whose
presence expires clears gracefully rather than pointing at nothing.
Also documents, without implementing, a boundary worth naming now:
presence has no privacy guarantee beyond transport scope — see
docs/Protocol.md. The flagship test proves the whole thing end to end
over a real `BroadcastChannel`: Bob clicks Alice (avatar target,
Avatar Info), clicks her building (brick selection), edits it
(document forks) — Alice's AvatarPresence/AvatarProfile/Publication and
the original Placement stay byte-identical throughout.

0.2.40 closes the boundary 0.2.39 left open, without touching how
avatars move, render, trust, or interact. A sender-side
`PresenceVisibilityPolicy` (`core/PresenceVisibilityPolicy.js`) —
`PUBLIC`/`FRIENDS`/`LOCAL`/`HIDDEN` — is consulted BEFORE
`PresenceSyncService.publish()` is ever called, never as a
receiver-side filter and never by sending an obscured/encrypted
advertisement anyway: `HIDDEN` means `publish()` is simply never
invoked. Deliberately honest about its limits — today's only transport
(a same-origin `BroadcastChannel`) has no per-recipient addressing, so
`FRIENDS` (a plain, manually-entered allow-list, never a
friend-request system) currently controls WHETHER a replica advertises
at all — an empty list behaves like `HIDDEN` — not WHO among the
transport's listeners can decode what does get sent; `LOCAL` and
`PUBLIC` stay honestly documented as observationally identical today,
for the same single-transport-scope reason. `AvatarProfile`/
`AvatarPresence`/`PresenceVisibilityPolicy` remain three genuinely
independent, separately-persisted concerns, reflected in
`ui/views/AvatarSettingsView.js`'s new "Presence Visibility" section
as two fully independent forms with two independent Save actions. The
flagship test proves the sender/receiver symmetry with 0.2.38's trust
boundary end to end: Alice, `HIDDEN`, moves twice — Bob receives
nothing and doesn't even know her avatar exists — then Alice switches
to `PUBLIC` and her very next movement reaches Bob normally, with zero
special-casing anywhere in Bob's own session.

0.2.41 resumes the avatar arc for one narrowly-scoped gap 0.2.37
explicitly deferred: every remote avatar had, until now, rendered with
the same fixed placeholder forever — presence makes an avatar move
correctly and trustworthily, but says nothing about what it looks
like. A brand-new wire shape, `core/AvatarProfileAdvertisement.js`'s
`AvatarProfileAdvertisement` (`avatarId`, `ownerIdentity`,
`profileRevision`, `templateId`, `appearance`, `displayName`, optional
signature), travels on its own `BroadcastChannel`
(`'forkbuild:avatar-profile'`, separate from presence's own), through
its own sync service, trust boundary, and store — ordered by a
`profileRevision`, never a timestamp, exactly presence's own "arrival
order does not determine state" discipline. Reuses the trust
vocabulary 0.2.38 established without duplicating the entire presence
protocol: `core/PresenceAuthority.js`'s TOFU registry is reused for
"who may speak for this avatarId," but with its OWN separate instance,
so winning the race to claim an avatarId's presence never also hijacks
its profile authority; `replication/ReplayGuard.js` (the unbounded
guard) is reused as-is, because profile edits are genuinely the rare,
low-frequency workload it was built for. An unrecognized `templateId`
— a peer whose customization uses a template this replica doesn't
carry — degrades gracefully to the same fixed placeholder rather than
crashing or guessing. Appearance is deliberately durable where presence
is ephemeral: `application/LocalAvatarProfileStore.js` never
time-prunes, so a peer's last-known outfit survives their presence
going stale or even absent. Profile publishing reuses
`PresenceVisibilityPolicy`'s `shouldAdvertise()` gate verbatim — no
second, independently-configured privacy system — and a 15-second
periodic republish is the one new "eventual" in this
eventually-consistent presentation state, letting a replica that joins
mid-session eventually catch up on a fire-and-forget transport with no
request/response mechanism. The flagship test proves the whole round
trip over two real `WorldNavigationSession`s and two real
`BroadcastChannel`s: Bob renders Alice's actual customized appearance
from her visual's very first frame, a stranger advertising an
unrecognized template degrades to the placeholder without ever
crashing, and Alice's appearance survives a presence
absent-prune-and-reappear cycle untouched. No touch to movement,
collision, chat, or the world-document model.

0.2.42 closes the one conspicuous limitation the movement model
carried since 0.2.36: avatars could walk straight through published
geometry. The pipeline gains one new step between simulation and
presence — `core/AvatarMovementSimulation.js`'s pure kinematics
(completely untouched this milestone) produce a PROPOSED position,
`application/AvatarMovementConstraint.js` (backed by pure geometry in
`core/AvatarCollision.js`) resolves it against whatever collision
geometry this replica currently has streamed in, and only then does
the result reach `AvatarPresence`. Deliberately "start simple": an
upright bounding-box avatar, axis-aligned per-brick bounds (ignoring
rotation — the same simplification `application/SelectionBoundsService.js`
already makes), and an axis-separated SWEPT slide that resolves a
diagonal approach into a true slide rather than a dead stop, and never
tunnels through a thin obstacle on a single large step. Honestly
scoped to what this replica actually knows: collision geometry comes
entirely from `WorldNavigationSession`'s own currently-loaded document
set — a wall outside the streaming radius was never asked for and
cannot suddenly become an obstacle; the exact same wall, loaded vs.
not, blocks movement in one case and not the other. Derived, never
persisted — no collision record, no `Avatar → Document` relationship,
just `Document + WorldPlacement` math computed fresh every tick.
`AvatarAnimationState` gains nothing — a collided step is movement
information (`isCollided()`, transient), never a `BLOCKED` animation
state. Deliberately deferred: avatar-avatar collision (a genuinely
harder, multiplayer-authority-laden problem — Bob's displayed vs.
claimed position — left for a dedicated later milestone), standing on
raised geometry, and any change to presence's own wire shape or trust
handling. The flagship test runs the design doc's own scripted
scenario end to end: publish a wall, load it, walk into it and stop at
the boundary, turn and slide along it, jump against it without
penetrating, Document/Publication/Placement remain byte-identical
throughout, and a real remote replica sees Alice's already-constrained
movement through completely ordinary presence sync — collision is a
local movement constraint, never a new network authority mechanism.

0.2.43 answers the one capability question still missing from the
avatar stack: "who is near me?" `core/AvatarProximity.js`'s
`computeNearbyAvatars()` computes that as a DERIVED, purely local fact
— nothing written to a Document, Publication, WorldPlacement, or
AvatarProfile, nothing sent over the wire — over the exact same
trusted remote-presence list that already drives rendering. Two
replicas computing "who is near me" independently are never required
to agree, the same way `core/SpatialQuery.js`'s own `distanceBetween()`
was already understood as purely local math, never a claim one side
declares to the other. `getNearbyAvatars(radius)` distinguishes
PRESENT (usable) from STALE (still listed, visibly marked) — and an
ABSENT avatar is simply never reachable at all, not through new
filtering, but because `LocalPresenceStore` already deletes an ABSENT
record the moment it's asked for. A small, genuinely useful catch-up
rides along: `getAvatarDisplayName()` fixes a stale 0.2.39 comment
claiming a remote avatar's name "is never distributed" — true when
written, false since 0.2.41. The new "Nearby Avatars" panel reaches an
avatarId without a screen-space pick, but reuses every existing
mechanism once it does — the same `getAvatarInfo()`, the same
`followAvatarId()`, the same status-dot vocabulary; no new camera
mechanism, no new inspection surface. Per the design doc's own
explicit contract: nearness never authorizes mutation.
`targetAvatar()`'s entire effect is on the CALLER's own local UI-focus
state — there is no method, before or after 0.2.43, that lets one
replica write to another avatar's own presence or profile. The
flagship test proves this directly: after an entire scripted scenario
of querying, targeting, and following, Alice's own AvatarProfile and
AvatarPresence — read from her own session — stay byte-identical
throughout. Deliberately not in 0.2.43: avatar-avatar collision or
pushing, a genuinely harder, multiplayer-authority-laden problem left
for a dedicated later milestone.

0.2.44 answers the next question the design doc posed: "once I know
another avatar is nearby, what can I actually do with it?" — with
deliberately the smallest possible answer, and still no wire format
change. A closed local gesture vocabulary (GREET/WAVE/POINT, `core/
AvatarInteractionKind.js`), a shared cooldown proven now under easy
conditions so a future networked version inherits it rather than
inventing rate-limiting later, and a purely local, presentation-only
gesture pose + facing override that never touches `AvatarPresence` and
is rendered only on the gesturing avatar's own replica — never on
anyone else's. The Avatar Info panel grows three buttons; three of the
design doc's other named intents (Invite to Follow, Stop Following,
Inspect) needed no new code at all, because they already existed. The
same nearness-never-authorizes-mutation boundary 0.2.43 drew for
OBSERVING another avatar now extends, unbroken, to WANTING to interact
with one — see docs/Principles.md, "Observation Does Not Imply
Authority, And Interaction Does Not Imply Control."

0.2.45 answers the question 0.2.44 deliberately deferred: "how can
Alice see that Bob waved at her without turning a gesture into
persistent avatar state?" A third, independent advertise/trust/pull
pipeline (`core/AvatarInteractionAdvertisement.js` →
`application/AvatarInteractionTrustBoundary.js` →
`application/AvatarInteractionSyncService.js`) mirrors the shape
presence/profile already established without copying either blindly:
`pull()` returns a transient batch of newly-accepted EVENTS, never a
persisted "current" record — an interaction genuinely isn't state, see
docs/Principles.md, "State Synchronization And Event Synchronization
Are Different Protocols." `targetAvatarId` travels as a CLAIM, never
an instruction — a bystander can observe the same event the named
target does, and no replica gains any new reach into another avatar's
state because of it. A bounded replay window does double duty,
tracking both `interactionId` (duplicate suppression) and `sequence`
(staleness rejection) per avatarId. One real gap is named rather than
hidden: no equivocation detection exists for interactions yet, left
explicitly to 0.2.46. The flagship test proves the shape end to end
over a real `BroadcastChannel`: Bob waves at Alice, Alice's replica
renders it on Bob's own avatar visual, an attacker's replay/staleness/
tamper/impersonation attempts all fail, the gesture expires on its
own, and neither avatar's `AvatarPresence`/`AvatarProfile` — nor any
`Document`/`WorldPlacement`/spatial index — is ever touched.

The avatar roadmap's own suggested next steps — interaction trust,
replay & abuse controls (the equivocation gap named above, plus spam/
blocking), avatar privacy & blocking, an emotes/animation library,
eventually text chat/voice — remain suggestions, not commitments.

## Features

- **Command Surface (0.1.50)** — One action registry driving shortcuts, the command palette (Ctrl/Cmd+K), and the sidebar; consistent feedback; disabled states with reasons; empty-state guidance.
- **Numeric Transform Input (0.1.49)** — Exact translation and rotation values with absolute/relative modes, bypassing gesture snapping.
- **Alignment & Distribution (0.1.48)** — Nine world-axis alignment operations and even center distribution along X/Y/Z, through the unified transform command path.
- **Transform Precision (0.1.47)** — Grid/increment snapping with Shift precision mode, identical for keyboard and pointer.
- **Interactive Transform Gizmo (0.1.46)** — Axis handles, free-move pad, rotation ring; one undo step per drag; identical in both views.
- **Groups (0.1.43)** — Create, rename, duplicate, delete; selections resolve to member bricks and transforms never touch membership.
- **Clipboard (0.1.42)** — Copy/paste selections through the command path.
- **Editor** — Place, select (single/multi/marquee), move, rotate, delete, undo/redo, grid snapping, placement preview.
- **Command Replay / Operation Timeline (0.1.39)** — Serialized command histories that replay exactly.
- **Brick Palette** — Core library with dimension-aware definitions (cube, slope, plate, window).
- **Persistence** — Save and load documents via localStorage with a document manifest.
- **Identity** — Local username-based identity provider; author attribution on documents and publications.
- **Publishing & Discovery** — Publish documents to a local discovery catalog; browse Repository View and Author View.
- **Forking** — Derive new documents from existing ones with fresh instance IDs and preserved lineage.
- **Spatial World View** — Free camera navigation through a shared coordinate system where multiple worlds stream in and out based on camera position.
- **Decentralized Spatial Discovery (0.2.15)** — cell-based immutable spatial index manifests; viewport queries fetch only intersecting cells; stale-index-tolerant resolution.
- **Decentralized Identity & Signatures (0.2.16)** — Ed25519 signing identities, canonical signing envelopes with domain separation, signed publications/placements/index roots, and authorization verification in decentralized discovery.
- **Delegated Ownership & Authorization (0.2.17)** — signed, narrowly-scoped delegations (e.g. "place this publication," optionally region-constrained) that let someone other than the resource owner act with explicit, verifiable authority, without transferring ownership.
- **Decentralized Replication & Conflict Handling (0.2.18)** — causal (vector-clock) history on every placement revision; independently authorized replicas that edit the same placement while disconnected converge deterministically on reconciliation, with every competing revision retained and verifiable rather than one silently overwriting the other.
- **Trust & Discovery Hardening (0.2.19)** — a trust-policy layer (pinned/discovered/untrusted authorities, legacy-content tolerance) and equivocation detection (an authority signing two different index roots at the same causal position) sit around the discovery pipeline, plus a structured diagnostics surface explaining exactly why a query returned what it did.
- **Fork-on-Edit & Immutable Snapshot Lineage (0.2.20)** — the World View lazily forks a published snapshot on its first mutation instead of ever mutating it in place; viewing never forks, exactly one fork is created per editing session, the fork carries `parentDocumentId` provenance through the existing forking mechanism, and fork policy (0.2.13 licensing) still governs whether the fork may happen at all.
- **Document Lifecycle & Metadata UI (0.2.21)** — a Document Properties editor (title/description/license) and a shared Document Info panel across the Editor and World View, showing computed lifecycle status (Draft/Saved/Published) and fork lineage; publishing now validates a title and non-empty content before creating anything immutable; a blocked or about-to-fork edit is explained in plain language, proactively and reactively, instead of failing silently.
- **Fork Transition & World View Document Switching (0.2.22)** — the moment fork-on-edit creates a fork, the World View's title, status badge ("🔒 Published" / "✎ Editing fork — forked from …"), and browser route atomically switch to it, re-derived from the session's active document on every interaction rather than a value frozen at page load; camera and scene position are untouched, only document identity changes; a denied fork leaves everything pointed at the source.
- **World Placement & Spatial Positioning (0.2.23)** — publishing now creates an explicit, signed, revisioned Placement (position/rotation/scale) kept entirely separate from the document's title/description/license; a Placement panel shows position/revision/owner with Focus/Move controls, and moving a placement never edits or forks the document it points to — a still-published, un-forked world can be repositioned exactly as freely as a fork can.
- **World Coordinate Semantics & Placement UX (0.2.24)** — a document's own content and a placement's position are now an explicit, documented contract (canonical origin, right-handed axes, a named "World Unit" that deliberately does not claim to be a meter); initial placement is a pure, deterministic function of a publication's own id instead of a locally-observed publication count, so the same publication lands at the same coordinate on every replica; the Move Placement dialog gains relative nudge buttons as a convenience over the same absolute, persisted position.
- **Spatial Allocation & Placement Collision Policy (0.2.25)** — two placements sharing a world position is now an explicit, derived observation (an overlap), never an error by itself and never persisted as its own entity; a configurable policy (ALLOW/WARN/REJECT) decides what happens next, defaulting to WARN for an explicit Move Placement request — the requested position is still what gets placed, only after the person sees who else is already there and confirms — while automatic initial placement stays frictionless; the Placement panel passively shows "N other documents share this location" regardless of how a placement got there.
- **World Navigation & Spatial Discovery UX (0.2.26)** — a World Search panel finds any published document by title or author over the same decentralized discovery catalog every other surface reads from, regardless of camera position, and reports whether it resolved a real recorded placement or a deterministic fallback position; a "Documents Here" dialog turns 0.2.25's passive overlap count into an actual, choosable list; Focus is formalized as pure navigation — camera + active document only, never a mutation, never a fork.
- **World View Context & Selection Model (0.2.27)** — camera focus and the active (editing) document are now tracked independently rather than as one field: focusing a document still moves both by default, but the active document can now change (e.g. by selecting a brick) without moving the camera, and the camera can move without changing what an edit targets; every mutation path resolves its target from the selection or the active document, never from camera position, closing a real latent bug where group operations could mix one document's `worldId` with another's `brickIds` whenever the two had diverged; the header now shows "Camera: X · Editing: Y" whenever they might differ.
- **Spatial Query & Location Discovery (0.2.28)** — World Search gains a spatial half, composable with the existing text search: "find everything within a radius (in World Units) of a coordinate," backed by the same decentralized discovery contract as text search rather than a local-cache-only scan; results carry a derived `distance` (never persisted) and sort nearest-first, and a publication resolved only through 0.2.24's deterministic fallback position still honestly reports no explicit placement rather than presenting a fallback as an authored location.
- **World Location Browser & Spatial Exploration (0.2.29)** — "Explore Here" and "What's Here?" turn the camera's own world position into a spatial-query center, reusing 0.2.28's query rather than building a second one; each result supports strictly read-only Focus / Select / Inspect actions (moving the camera, changing the active document without moving the camera, and an inline Document/Placement Info expansion that never loads or navigates, respectively); the result count reads "Showing N of N discoverable documents" to keep the same decentralized honesty text/spatial search already established.
- **Trust-Aware Spatial Discovery & Diagnostics (0.2.30)** — `exploreLocation` returns `{ documents, diagnostics }`: the document list is never filtered or reordered by trust, while `diagnostics` (available/fatal/complete/warnings, derived from real 0.2.19 `TrustObservation`s via an optional `spatialDiscoveryProvider`) honestly reports what a trust-capable provider could verify about that region — shown as a banner in the Location Browser and a per-document "Discovery status" in Inspect; the live app's own document resolution is completely unchanged.
- **Publication Catalog & Repository UX (0.2.31)** — Repository/Author View share one `PublicationCatalog` component with real pagination, deterministic sort (5 orders, ordinal comparison, guaranteed-consistent tiebreaks), Cards/List views, presentation-only grouping (author/date/license), a deterministic placeholder preview per publication, and search that opt-in extends to full document descriptions; `SearchPublicationsUseCase` is a deliberately separate query from World Search, answering "which publications match this?" rather than "where is this in the world?"; tested against a 10,000-publication synthetic catalog.
- **Client-Side Publication Preview & Lazy Rendering (0.2.32)** — Repository/Author View cards render a real thumbnail generated locally from a publication's actual document content, never from user-supplied metadata; a deterministic camera framing (fixed isometric angle, bounding-sphere distance) means the same content always gets the same intended shot; generation is lazy (only for cards actually scrolled into view), off the main thread, cancellable when a page or search changes, and cached in memory only, keyed by content identity — nothing about a preview is signed, persisted, or replicated, and a preview failure never hides the publication it belongs to.
- **Avatar Identity & Presence Model (0.2.33)** — the first milestone of a multi-part avatar arc, establishing the model boundary before any rendering or movement code: a persistent `AvatarProfile` (avatarId/ownerIdentity/templateId/appearance/displayName), immutable and one per identity, is neither a Document, a Publication, nor a WorldPlacement; an ephemeral `AvatarPresence` (position/rotation/animation/sequence) lives only in an in-memory session with no storage dependency at all, and is deliberately never signed — a movement update is the wrong kind of fact for the durable-and-authorized trust model Publications and Placements use. No rendering, movement, or networking ships yet; see docs/Roadmap.md for 0.2.34 through 0.2.38.
- **Avatar Templates & Customization (0.2.34)** — a small built-in template registry gives `AvatarProfile.appearance` a real, validated, declarative schema (skin/hair/shirt/pants/accessories, each with a closed set of options and optional colors) — never executable code or a pointer to a remote asset; `updateProfile()` strictly rejects anything outside a template's bounds, while `getEffectiveAvatar()` never throws, always resolving a complete appearance with graceful per-field fallback so a broken or unrecognized profile can never block World View access. Ships the first visible avatar feature, the Avatar Creator (`/avatar`), with every control driven by the selected template's own data and a lightweight SVG preview.
- **Avatar Rendering & World Presence (0.2.35)** — the local user's own avatar now physically renders in the World View's Three.js scene, combining 0.2.34's resolved appearance and 0.2.33's `AvatarPresence` — two independent inputs the renderer only ever combines, never modifies; appearance changes rebuild the mesh graph only when content actually changed, while position/rotation/animation updates are cheap transform writes; a "Show My Avatar" checkbox is a pure client rendering preference, never persisted avatar state; moving or restyling an avatar never touches a document's `WorldPlacement`. No movement input or multiplayer yet.
- **Local Avatar Movement & Animation (0.2.36)** — W/S move the avatar along its own facing, A/D turn it, Shift runs, Space jumps; a pure `core/AvatarMovementSimulation.js` turns held keys into a new position/rotation/animation with no Three.js dependency, sanitized against NaN/Infinity and clamped against extreme per-tick deltas; `AvatarPresence.sequence` advances by exactly one per accepted update, never once per render frame regardless of motion; WALKING/RUNNING play a real elapsed-time gait cycle (never frame-count-based); an explicit "Control My Avatar" toggle captures WASD only while on, and "Follow Avatar" shifts the camera by the avatar's own movement delta without ever redefining the focused/active document. Entirely local — no network, no collision against world geometry, no multiplayer yet.
- **Decentralized Avatar Presence Synchronization (0.2.37)** — the local avatar's presence becomes observable by other replicas via a real, working `BroadcastChannel`-based transport (two same-origin tabs genuinely see each other's avatars move) — still never signed, never persisted; an advertise/pull round trip keeps message receipt and state acceptance as two separate steps, with `core/PresenceIngestion.js`'s monotonic-sequence rule tolerating reordered, duplicate, and gapped delivery with one simple check; presence lifecycle (PRESENT/STALE/ABSENT) is derived purely from elapsed time on the receiver's own clock, never a stored fact; remote avatar positions are visually interpolated for smoothness while the latest received presence stays sole authoritative state; "Show Other Avatars" works even for a logged-out viewer. Appearance is not synchronized yet — every remote avatar renders with a fixed placeholder look. No signatures, replay protection, or conflict resolution yet.
- **Presence Trust, Replay & Conflict Handling (0.2.38)** — hardens the 0.2.37 ingestion boundary without redesigning it: an optional, real Ed25519 signature over every field of an advertisement (`application/PresenceSigning.js`); a trust-on-first-use identity binding so an avatarId can't simply be claimed by whoever speaks loudest (`core/PresenceAuthority.js`); bounded replay detection distinct from freshness (`core/PresenceReplayWindow.js`); equivocation detection reusing 0.2.19's own vocabulary for "same authority, same sequence, different content" (`core/PresenceEquivocation.js`); and a single policy axis — permissive (default, unsigned tolerated) vs. hardened (signature required) — via `core/PresenceTrustPolicy.js`. A rejected claim never overwrites what's currently displayed and arrival order never picks a winner, but is surfaced as an unobtrusive World View diagnostic line. `core/PresenceIngestion.js` itself, and every other 0.2.37 file, is untouched. Completes a full vertical slice of the avatar arc (0.2.33–0.2.38); the avatar roadmap deliberately pauses here.
- **World Entity Interaction & Selection (0.2.39)** — the architecture-checkpoint milestone the pause was for: avatars become clickable, inspectable, and followable World View entities without ever becoming documents, placements, or editable world content. `WorldNavigationSession.pick()` runs a brick raycast and a completely separate avatar raycast (`renderer/PickingService.js`/`renderer/AvatarPickingService.js`) together and lets whichever is actually NEARER the camera win, never "bricks always win" regardless of depth. A brand-new, independent state slice (`application/spatial-state/AvatarInteractionState.js`) tracks the avatar target — structurally unable to ever enter `SpatialSelectionState`, so an avatarId can never reach the clipboard, groups, the transform gizmo, or undo/redo. Clicking an avatar opens a read-only Avatar Info panel (name, template, lifecycle/trust status, position, distance, animation) with deliberately no Edit/Move/Delete/Save — the one action, "Follow", is a pure camera relationship, mutually exclusive with 0.2.36's local-avatar-follow. Also documents (without implementing) an explicit boundary: presence has no privacy guarantee beyond transport scope. The flagship test proves it end to end: Bob clicks Alice (avatar target), clicks her building (brick selection), edits it (document forks) — Alice's AvatarPresence/AvatarProfile/Publication and the original Placement stay byte-identical throughout.
- **Avatar Presence Visibility & Privacy (0.2.40)** — closes the boundary 0.2.39 left open, without touching how avatars move, render, trust, or interact. A sender-side `PresenceVisibilityPolicy` (`core/PresenceVisibilityPolicy.js`) — `PUBLIC`/`FRIENDS`/`LOCAL`/`HIDDEN` — is consulted BEFORE `PresenceSyncService.publish()` is ever called, never as a receiver-side filter and never by sending an obscured/encrypted advertisement anyway: `HIDDEN` means `publish()` is simply never invoked. Deliberately honest about its limits — today's only transport (a same-origin `BroadcastChannel`) has no per-recipient addressing, so `FRIENDS` (a plain, manually-entered allow-list, never a friend-request system) currently controls WHETHER a replica advertises at all (an empty list behaves like `HIDDEN`), not WHO among the transport's listeners can decode what does get sent; `LOCAL` and `PUBLIC` are honestly documented as observationally identical today, for the same single-transport-scope reason. `AvatarProfile`/`AvatarPresence`/`PresenceVisibilityPolicy` stay three genuinely independent, separately-persisted concerns, reflected in `ui/views/AvatarSettingsView.js`'s new "Presence Visibility" section as two fully independent forms. The flagship test proves the sender/receiver symmetry with 0.2.38's trust boundary end to end: Alice, `HIDDEN`, moves twice — Bob receives nothing, doesn't even know her avatar exists — then Alice switches to `PUBLIC` and her very next movement reaches Bob normally, with zero special-casing anywhere in Bob's own session.
- **Remote Avatar Appearance Synchronization (0.2.41)** — resumes the avatar arc for one narrowly-scoped gap 0.2.37 explicitly deferred: every remote avatar rendered with the same fixed placeholder until now. `core/AvatarProfileAdvertisement.js`'s new wire shape (`avatarId`, `ownerIdentity`, `profileRevision`, `templateId`, `appearance`, `displayName`, optional signature) travels on its own `BroadcastChannel` (`'forkbuild:avatar-profile'`, separate from presence's own), through its own sync service, trust boundary, and store, ordered by a `profileRevision` — never a timestamp. Reuses 0.2.38's trust vocabulary without duplicating the entire presence protocol: `core/PresenceAuthority.js`'s TOFU registry is reused for identity binding but with its OWN separate instance (winning the race for an avatarId's presence never hijacks its profile authority), and `replication/ReplayGuard.js` (the unbounded guard) is reused as-is since profile edits are genuinely rare. An unrecognized `templateId` degrades gracefully to the fixed placeholder rather than crashing. `application/LocalAvatarProfileStore.js` deliberately never time-prunes — appearance is durable, presence is ephemeral, and a peer's last-known outfit survives their presence going stale or absent. Profile publishing reuses `PresenceVisibilityPolicy`'s `shouldAdvertise()` gate verbatim, and a 15-second periodic republish lets a replica that joins mid-session eventually catch up on a fire-and-forget transport. The flagship test proves the whole round trip over two real `WorldNavigationSession`s and two real `BroadcastChannel`s: Bob renders Alice's actual customized appearance from her visual's very first frame, a stranger advertising an unrecognized template degrades to placeholder without crashing, and Alice's appearance survives a presence absent-prune-and-reappear cycle untouched.
- **Avatar-World Collision & Movement Constraints (0.2.42)** — closes the one conspicuous limitation the movement model carried since 0.2.36: avatars could walk straight through published geometry. `core/AvatarMovementSimulation.js`'s pure kinematics (completely untouched) produce a PROPOSED position; `application/AvatarMovementConstraint.js`, backed by pure geometry in `core/AvatarCollision.js`, resolves it against whatever collision geometry this replica currently has streamed in, before the result ever reaches `AvatarPresence`. Deliberately "start simple" — an upright bounding-box avatar, axis-aligned per-brick bounds (ignoring rotation, the same simplification `application/SelectionBoundsService.js` already makes), and an axis-separated SWEPT slide: a diagonal approach into a corner blocks the axis that actually hits something while the other keeps moving (a true slide, not a dead stop), and every axis is tested against its full step range so a single large tick can never tunnel through a thin obstacle. Honestly scoped to what this replica actually knows: collision geometry comes entirely from `WorldNavigationSession`'s own currently-loaded documents — the exact same wall blocks movement when streamed in and never obstructs anything when it isn't. Derived, never persisted: no collision record, no `Avatar → Document` relationship, just `Document + WorldPlacement` math recomputed fresh every tick. `AvatarAnimationState` gains nothing — a collided step is movement information (`isCollided()`, transient, never part of `AvatarPresence`), never a `BLOCKED` animation state. Deliberately deferred: avatar-avatar collision (Bob's displayed vs. claimed position is a real multiplayer-authority question left for later), standing on raised geometry, and any change to presence's own wire shape or trust handling. The flagship test runs the design doc's own scripted scenario end to end — publish a wall, load it, walk into it and stop at the boundary, turn and slide along it, jump against it without penetrating, Document/Publication/Placement remain byte-identical throughout, and a real remote replica sees Alice's already-constrained movement through completely ordinary presence sync, with zero collision-aware special-casing on his side.
- **Avatar-Avatar Proximity & Interaction Targets (0.2.43)** — answers "who is near me?" as a DERIVED, purely local fact — nothing written to a Document, Publication, WorldPlacement, or AvatarProfile, nothing sent over the wire. `core/AvatarProximity.js`'s `computeNearbyAvatars()` computes it over the exact same trusted remote-presence list that already drives rendering, reusing `core/SpatialQuery.js`'s `distanceBetween()` verbatim. Two replicas computing "who is near me" independently are never required to agree — the same tolerance already extended to remote avatar rendering itself. `getNearbyAvatars(radius)` distinguishes PRESENT from STALE; an ABSENT avatar is simply never reachable, because `LocalPresenceStore` already deletes an ABSENT record the moment it's asked for — no new filtering needed. A small catch-up rides along: `getAvatarDisplayName()` fixes a stale 0.2.39 comment claiming a remote avatar's name "is never distributed" — true when written, false since 0.2.41. The new "Nearby Avatars" panel reaches an avatarId without a screen-space pick, but reuses every existing mechanism once it does — the same `getAvatarInfo()`, the same `followAvatarId()`, the same status-dot vocabulary; no new camera mechanism. Per the design doc's own explicit contract, nearness never authorizes mutation: `targetAvatar()`'s entire effect is on the caller's own local UI-focus state, and there is no method anywhere that lets one replica write to another avatar's own presence or profile. The flagship test proves it directly: after an entire scripted scenario of querying, targeting, and following, Alice's own AvatarProfile and AvatarPresence stay byte-identical throughout. Avatar-avatar collision remains deliberately deferred — a genuinely harder, multiplayer-authority-laden problem.
- **Local Avatar Interaction & Social Presence (0.2.44)** — answers "once I know another avatar is nearby, what can I actually do with it?" with a deliberately small, still wire-format-free answer. A closed local gesture vocabulary — GREET/WAVE/POINT (`core/AvatarInteractionKind.js`) — is its OWN vocabulary, never folded into `core/AvatarAnimationState.js` (the one that DOES ride `AvatarPresence.animation` onto the wire), so a gesture is structurally incapable of being networked by accident. A shared cooldown (`core/AvatarInteractionCooldown.js`) rate-limits every gesture now, under easy local conditions, so a future networked version inherits an already-proven invariant instead of inventing rate-limiting later. Performing a gesture (`WorldNavigationSession.performAvatarInteraction()`) only ever writes to the caller's OWN local `AvatarInteractionState` — extended with `interaction`/`interactionStartedAt` — and is rendered ONLY on the gesturing avatar's own replica (`renderer/AvatarVisual.js#setGesture()`, an upper-body pose overlay reusing `core/AvatarPoseOffsets.js`'s own vocabulary) with no remote-avatar counterpart anywhere in the codebase. A temporary facing override (`core/AvatarFacing.js`) makes an avatar visually face its current target while stationary, applied directly to the Three.js root — never to `AvatarPresence.rotation` — and an actively-moving player's own input always wins over it. The Avatar Info panel grows exactly three buttons; three of the design doc's other named intents (Invite to Follow, Stop Following, Inspect) needed no new code at all, because they already existed since 0.2.39/0.2.43. Nothing here reaches a Document, a Publication, a WorldPlacement, or the wire — see docs/Principles.md, "Observation Does Not Imply Authority, And Interaction Does Not Imply Control."
- **Ephemeral Avatar Interaction Synchronization (0.2.45)** — the networked half of 0.2.44's gestures, deliberately narrow: a GREET/WAVE/POINT is an EVENT, never STATE, so it is never retained once rendered. A third, independent wire shape (`core/AvatarInteractionAdvertisement.js` — `avatarId`/`interactionId`/`kind`/`targetAvatarId`/`sequence`/`timestamp`/optional `signature`) travels on its own `BroadcastChannel` (`'forkbuild:avatar-interaction'`), through its own trust boundary (`application/AvatarInteractionTrustBoundary.js` — structural validity → signature/policy → authority → replay/staleness, deliberately with NO equivocation check, a named gap left to 0.2.46) and its own bounded replay window that tracks both `interactionId` (duplicate suppression) and `sequence` (staleness rejection) per avatarId. `AvatarInteractionSyncService.pull()` returns only the newly-accepted events since the last call — never a persisted "current" record the way presence/profile sync services keep one. `targetAvatarId` is a CLAIM ("Bob claims he waved at Alice"), never an instruction — a bystander can observe and render the same event the named target does, and no replica gains any reach into another avatar's own state. A trusted event renders on the SENDER's own remote avatar visual (`RenderWorldViewUseCase#setRemoteAvatarGesture()`, reusing `AvatarVisual.setGesture()` byte-for-byte) and auto-expires after ~1.8s with no "stop" message ever required. `AvatarPresence`/`AvatarProfile` gain zero new fields; the flagship test proves a full replay/tamper/impersonation attack scenario over a real `BroadcastChannel` never renders a forged gesture, and never touches a Document, Publication, WorldPlacement, or the spatial index.
  
## Architecture

ForkBuild is layered as **core / application / renderer / ui**, with infrastructure adapters (storage, publisher, discovery, serializer, world-layout) surrounding them.

- **core/** — Pure domain model: World, Building, Brick, events. No Three.js, no Vue.
- **application/** — Use cases, editor state, commands, the transform gesture transaction, shared transform math, and the command subsystem (CommandHistory, CommandRegistry). As of 0.1.50 also the EditorActionRegistry / EditorActionContext / InputRouter action layer — above the kernel, never inside it.
- **renderer/** — Three.js incremental renderer, picking, camera, overlay layers, and the interactive transform gizmo.
- **ui/** — Vue 3 Composition API views and components.

The editing stack, end to end:

```
Command Palette / Sidebar / Shortcuts
│
▼
EditorActionRegistry (actions — not commands)
│
▼
Existing Sessions
│
┌─────────────┼─────────────┐
▼ ▼ ▼
Selection Transform Groups/Clipboard
│ │ │
└─────────────┼─────────────┘
▼
Existing Commands
│
▼
CommandHistory
```

See [docs/Architecture.md](docs/Architecture.md) for the full architectural overview and [docs/user/](docs/user/README.md) for how-to guides.

## Documentation

- [docs/Architecture.md](docs/Architecture.md) — engine architecture, layer rules, milestone notes.
- [docs/Roadmap.md](docs/Roadmap.md) — milestone roadmap.
- [docs/Protocol.md](docs/Protocol.md) — the ForkBuild Protocol.
- [docs/Principles.md](docs/Principles.md) — engineering principles, including "Actions are not commands".
- [docs/user/README.md](docs/user/README.md) — user guides, including the [Controls Reference](docs/user/ControlsReference.md) (generated from the action registry) and the [Interactive Transform Gizmo guide](docs/user/InteractiveTransformGizmo.md).

## Quick Start

Open `index.html` in a modern browser. No build step is required. Press **Ctrl/Cmd+K** in the Editor or World View to open the command palette.

## Roadmap

- [x] 0.1.1 – 0.1.38 — engine foundations through Transform Gizmo & Group Pivot (see docs/Roadmap.md)
- [x] 0.1.39 Command Replay / Operation Timeline
- [x] 0.1.40 Advanced Selection & Grouping
- [x] 0.1.41 Unified Transform Architecture
- [x] 0.1.42 Clipboard & Editing Kernel Consolidation
- [x] 0.1.43 Groups & Selection Separation
- [x] 0.1.44 Transform Parity & Group Gizmo Architecture
- [x] 0.1.45 Advanced Selection & Editor Group Surface
- [x] 0.1.46 Interactive Transform Gizmo & Viewport Editing Parity
- [x] 0.1.47 Transform Precision, Snapping & Editing Polish
- [x] 0.1.48 Alignment & Distribution Tools
- [x] 0.1.49 Numeric Transform Input
- [x] 0.1.50 Editing UX Consolidation & Command Surface
- [x] 0.1.51 Stability / Performance / Large-Document Hardening
- [x] 0.1.52 Protocol & Persistence Hardening
- [x] 0.2.0   Durable Documents & Publishing Boundary       
- [x] 0.2.1   Editor / World Editing Parity                 
- [x] 0.2.2   Schema Versioning & Real Migration Fixtures   
- [x] 0.2.3   Publish / Unpublish Lifecycle                 
- [x] 0.2.4   Read-only Published World                     
- [x] 0.2.5   World Placement & Spatial Discovery
- [x] 0.2.6   Persistence, Recovery & Autosave
- [x] 0.2.7   Collaboration Protocol Foundation           
- [x] 0.2.8   Fork / Edit Published World                 
- [x] 0.2.9   Multi-client Synchronization                
- [x] 0.2.10  Decentralized Placement Registry
- [x] 0.2.11  Spatial Discovery & Content Resolution
- [x] 0.2.12  World View Streaming & Runtime Integration  ✓
- [x] 0.2.13  Publication Licensing & Fork Policy
- [x] 0.2.14  Decentralized Content Backend
- [x] 0.2.15  Decentralized Spatial Discovery
- [x] 0.2.16  Decentralized Identity & Signatures
- [x] 0.2.17  Delegated Ownership & Authorization
- [x] 0.2.18  Decentralized Replication & Conflict Handling
- [x] 0.2.19  Trust / Discovery Hardening
- [x] 0.2.20  Fork-on-Edit & Immutable Snapshot Lineage
- [x] 0.2.21  Document Lifecycle & Metadata UI
- [x] 0.2.22  Fork Transition & World View Document Switching
- [x] 0.2.23  World Placement & Spatial Positioning
- [x] 0.2.24  World Coordinate Semantics & Placement UX
- [x] 0.2.25  Spatial Allocation & Placement Collision Policy
- [x] 0.2.26  World Navigation & Spatial Discovery UX
- [x] 0.2.27  World View Context & Selection Model
- [x] 0.2.28  Spatial Query & Location Discovery
- [x] 0.2.29  World Location Browser & Spatial Exploration
- [x] 0.2.30  Trust-Aware Spatial Discovery & Diagnostics
- [x] 0.2.31  Publication Catalog & Repository UX
- [x] 0.2.32  Client-Side Publication Preview & Lazy Rendering
- [x] 0.2.33  Avatar Identity & Presence Model
- [x] 0.2.34  Avatar Templates & Customization
- [x] 0.2.35  Avatar Rendering & World Presence
- [x] 0.2.36  Local Avatar Movement & Animation
- [x] 0.2.37  Decentralized Avatar Presence Synchronization
- [x] 0.2.38  Presence Trust, Replay & Conflict Handling
- [x] 0.2.39  World Entity Interaction & Selection
- [x] 0.2.40  Avatar Presence Visibility & Privacy
- [x] 0.2.41  Remote Avatar Appearance Synchronization
- [x] 0.2.42  Avatar-World Collision & Movement Constraints
- [x] 0.2.43  Avatar-Avatar Proximity & Interaction Targets
- [x] 0.2.44  Local Avatar Interaction & Social Presence
- [x] 0.2.45  Ephemeral Avatar Interaction Synchronization

Nested Groups remains optional and is not on the roadmap yet — the flat-group model has proven sufficient through 0.1.50. Automatic collision resolution (silently relocating onto a free cell), geometric/bounds-based collision detection, box selection/collision geometry/polygon regions/spatial clustering in the location browser, fully wiring the decentralized spatial index as the World View's actual document-resolution backend ("spatial streaming/index integration," proposed, not started — 0.2.30 already connects its trust/diagnostics vocabulary as an optional, additive source), an indexed metadata representation for description search at real decentralized scale, license/tag filters, cross-page grouping, and infinite scroll (deliberately not implemented — see docs/Principles.md) are similarly deferred until real usage shows each is actually needed — see docs/Roadmap.md. (A real, immutable, content-addressed publication preview is no longer on this list — 0.2.32 concluded a signed preview was never the right design; see docs/Principles.md, "Previews Are Derived Client State.")

## License

Mozilla Public License Version 2.0
