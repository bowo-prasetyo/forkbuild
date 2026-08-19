# ForkBuild

**Build. Fork. Share. Evolve.**

An open-source, browser-based, decentralized building platform. Creations are stored using interchangeable publishing providers and can be explored in a shared spatial world.

## Current Status

**Version 0.2.70** — Presence & Conversation Lifecycle

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
hidden: no equivocation detection exists for interactions yet, left to
a future, still-unscheduled milestone. The flagship test proves the shape end to end
over a real `BroadcastChannel`: Bob waves at Alice, Alice's replica
renders it on Bob's own avatar visual, an attacker's replay/staleness/
tamper/impersonation attempts all fail, the gesture expires on its
own, and neither avatar's `AvatarPresence`/`AvatarProfile` — nor any
`Document`/`WorldPlacement`/spatial index — is ever touched.

The avatar roadmap's own suggested next steps — interaction trust,
replay & abuse controls (the equivocation gap named above, plus spam/
blocking), avatar privacy & blocking, an emotes/animation library,
eventually text chat/voice — remain suggestions, not commitments.

0.2.46 exercises that non-commitment: rather than continuing the avatar
arc, it pauses it at exactly the checkpoint 0.2.45 left it and opens a
different, more foundational one — decentralized identity itself.
0.2.16 gave every signed object a `did:key` signer, but the KEY behind
that signer was always a side effect of typing a username: `login('alice')`
lazily derived a keypair from whatever string was typed, so "which
account is the app showing?" and "which cryptographic key does this
device hold?" were silently the same event. 0.2.46 separates them for
real. `identity/LocalIdentity.js` (new) is a durable, validated record
of a key this device actually possesses — `identityId`/`publicKey`/
`algorithm`/`label`/`createdAt`, constructed only when its `identityId`
provably derives from its own `publicKey`. `identity/
AuthenticationSession.js` (new) is the missing third concept: not "does
this device hold this key" (durable, `LocalIdentity`) and not "what
name is shown" (`identity/Identity.js`, 0.1.21, unchanged), but "is one
of this device's identities unlocked right now" — `ANONYMOUS` or
`AUTHENTICATED`, with an `identityId` and `authenticatedAt` only in the
latter state, invalid by construction otherwise. `identity/
LocalIdentityProvider.js` is rebuilt on top of both: `createLocalIdentity(label)`
generates a keypair immediately and stores it in a durable, listable
index — independent of any login flow — and `authenticate(identityId)`/
`endSession()` start and end the session by unlocking a key this device
already holds, never by deriving a fresh one from a typed string. Every
pre-existing method — `login(username)`, `logout()`, `currentUser()`,
`sign()`, `getSigningIdentity()`, `signCanonical()` — keeps its exact
0.1.21/0.2.16 signature and behavior, now implemented AS a thin,
backward-compatible layer over the session model (`login(label)` finds-
or-creates a `LocalIdentity` for that label and authenticates it;
`currentUser()` is a pure, derived view of the current session, never a
second stored fact that could drift out of sync with it) — every one of
the ~45 existing tests, and every existing use case that signs
publications, placements, or avatar presence/profile/interaction
advertisements, keeps working completely unchanged.
`getSigningIdentity()`/`signCanonical()` are now genuinely gated by
`AuthenticationSession`, not merely by `currentUser()` happening to
agree with it — proven directly in `tests/LocalIdentitySession.test.js`
by ending a session and watching signing fail with "no active
authentication session" while the identity's key remains on disk,
untouched, ready to be re-authenticated later. The Login modal
(`ui/components/LoginModal.js`) is rebuilt to match: it lists every
identity this device already holds (`IdentityUseCase.listIdentities()`)
so logging back in means picking the identity you already have, and
"Create New Identity" is an explicit, separate action
(`createIdentity()` + `authenticate()`) rather than a side effect of
retyping a name. See docs/Architecture.md, "Local Identity &
Authentication Session (0.2.46)," and docs/Principles.md, "Login
Unlocks An Identity; It Does Not Derive One From A Typed Name" and
"Identity Existence And Session Authentication Are Independent Facts."
Deliberately not in 0.2.46, matching the scope a decentralized identity
system needs to earn in stages: no passphrase/encryption protecting the
stored private key (today's key material is exactly as protected as
0.2.16's always was — plain local storage — a real gap named here, not
hidden), no portable identity export/import or recovery phrase (moving
to a new device still means creating a new identity — a genuinely
different, harder problem left for its own milestone), no peer
discovery or authenticated peer sessions, and no change at all to the
signed-object wire formats, `core/Signature.js`, or
`identity/LocalAuthorizationVerifier.js` — a `SigningIdentity` still
looks, verifies, and travels exactly as it did in 0.2.16; only WHERE it
comes from on the signing side changed.

0.2.47 closes exactly the gap 0.2.46 named instead of moving straight
on to portability or peer networking: a `LocalIdentity`'s private key
sat in storage exactly as plainly as 0.2.16's always did. It adds a
FOURTH concept alongside 0.2.46's three — `identity/VaultLock.js`,
"is this identity's private key decrypted in memory right now?" —
independent of both `LocalIdentity` (durable) and
`AuthenticationSession` (persisted, but transient): a protected
identity can be logged in (`AUTHENTICATED`) while its vault is
`LOCKED`, and a page reload always finds a protected vault `LOCKED`
regardless of whether the session survived, because the decrypted seed
is never written anywhere durable — not by omission, but structurally:
`identity/KeyEncryption.js`'s PBKDF2-HMAC-SHA512 + SHA512-CTR +
HMAC-SHA512 encrypt-then-MAC (built from the same self-contained
`sha512` primitive `identity/Ed25519.js` already established, no new
dependency) decrypts a seed only into a plain, in-memory
`LocalIdentityProvider._vaultCache` Map that nothing ever persists.
Opting in is always explicit and non-destructive: `createLocalIdentity(
label, passphrase)` protects a key from birth; `protectIdentity(
identityId, passphrase)` migrates an existing unprotected identity in
place, preserving its exact `identityId`, and starts it `LOCKED`
immediately afterward. Wrong passphrases and tampered records fail
identically (`IncorrectPassphraseError`, the MAC checked before
decryption is ever trusted), repeated failures trip a time-based
cooldown that even the correct passphrase can't bypass early
(`identity/FailedUnlockTracker.js`), and an unlocked vault auto-expires
after a fixed lifetime since last unlock
(`identity/VaultTimeoutPolicy.js` — honestly a bounded lifetime, not
true activity tracking) without ever ending the `AuthenticationSession`
itself — `_requireAuthenticatedIdentity()` now tells "not logged in"
and "locked" apart as two different refusal reasons.
`ui/components/LoginModal.js`'s identity list marks protected
identities and prompts for a passphrase inline before authenticating;
`ui/components/UserWidget.js` shows a third, honest state — 🔒 name +
Unlock — when the session is authenticated but the vault has
idle-locked, rather than pretending signing still works. See
docs/Architecture.md, "Identity Security & Key Protection (0.2.47),"
and docs/Principles.md, "Identity Existence, Vault Unlock, And Session
Authentication Are Three Independent Facts, Not Two." Deliberately not
in 0.2.47: changing or removing a passphrase once set, any PIN-strength
policy, true activity-based idle detection, and — unchanged from
0.2.46 — portable identity export/import/recovery and peer discovery/
authenticated peer sessions.

0.2.48 closes exactly the gap 0.2.46 and 0.2.47 both named and left
open: a `LocalIdentity`'s private key has only ever existed on the one
device that generated it. The central invariant: exporting and
importing an identity preserves the identity itself, not merely its
display name — a signature produced on a second, completely independent
device after import must verify with the identity's ORIGINAL public
key, through the entirely unmodified `LocalAuthorizationVerifier`.
`identity/IdentityExport.js` (new) builds a portable package —
`formatVersion`, `identityId`, `publicKey`, `algorithm`, an untrusted
`label` hint, and `encryptedPrivateKey` — the SAME `identity/
KeyEncryption.js` record 0.2.47 already uses at rest, never a second
invented "portable secret" format. `identity/IdentityImport.js` (new)
strictly validates a package — format version, every field's shape, and
that `identityId` is the exact did:key derivation of `publicKey` —
BEFORE anything is decrypted, so a corrupted or tampered package is
rejected without needing a passphrase and without ever leaving a
partial identity behind. `identity/IdentityRecovery.js` (new)
orchestrates validate → duplicate-check → decrypt → verify: an
identityId already present with matching key material short-circuits to
`ALREADY_EXISTS` (never a second copy, doesn't even require the correct
passphrase); mismatched key material under the same identityId is
rejected as a conflict, never silently resolved either way. `identity/
LocalIdentityProvider.js` gains `exportLocalIdentity(identityId,
passphrase)` — which, for a protected identity, always re-decrypts from
storage rather than the in-memory vault cache, so exporting demands the
passphrase again as its own security boundary even while unlocked — and
`importLocalIdentity(package, passphrase, { label })`, which persists
an imported identity as protected and LOCKED, unconditionally: import
proves this device now holds a key, never that it has been
authenticated with it. `ui/views/IdentityManagementView.js` (new,
routed at `/identity`, "My Identities" in the nav) is a dedicated view
— not an extension of `LoginModal` — for lock/unlock, export, and
import across every identity a device holds. See docs/Architecture.md,
"Portable Identity, Export, Import & Recovery (0.2.48)," and
docs/Principles.md, "Exporting And Importing An Identity Preserves The
Identity, Not Merely Its Name," "Recovery Is Not Password Recovery," and
"Duplicate Identity Import Is A No-Op, Never A Silent Overwrite."
Deliberately not in 0.2.48: changing or removing a protected identity's
passphrase (unchanged gap from 0.2.47); any recovery path that works
with only the passphrase or only the exported file — there is no
central authority capable of resetting either; any transport for the
package besides a plain JSON file/textarea; and — unchanged from
0.2.46/0.2.47 — any peer discovery mechanism or authenticated peer
session.

0.2.49 begins the decentralized peer arc those four milestones kept
naming and deferring, with one deliberately narrow question: not "how
does Alice find Bob," but "once Alice has a connection to something
claiming to be Bob, how does she cryptographically establish who Bob
is?" `peer/PeerConnectionProvider.js`/`peer/PeerConnection.js` (new,
abstract) carry ONLY transport state
(`peer/PeerConnectionState.js`); `peer/LocalPeerConnectionProvider.js`
(new) is a real in-process transport, two endpoints sharing one
connectionId, standing in for a future WebRTC/relay implementation.
`peer/PeerAuthenticationSession.js` (new) layers a completely
independent state machine (`peer/PeerAuthenticationState.js`) on top: a
symmetric mutual challenge-response handshake where each side signs the
other's challenge via `identity/LocalIdentityProvider.js`'s own
unmodified `signCanonical()`, over a new canonical descriptor
(`core/PeerAuthenticationEnvelope.js`, a new
`SignatureType.PEER_AUTHENTICATION`) binding `protocol`/`purpose`/
`sessionNonce`/`challenge`/`identityId`/`publicKey` together — the
connection's own `sessionNonce` is what makes a captured, genuine
handshake fail when replayed into a different connection, since the
signature itself no longer verifies. A verified PROOF yields a
`peer/PeerIdentity.js` — proof of key possession only, discarded the
instant the connection closes, never persisted anywhere: a peer
connection authenticates a key, not an account, and there is no
"friends" list or trusted-peer database in this milestone at all. See
docs/Architecture.md, "Authenticated Peer Connection Model (0.2.49),"
and docs/Principles.md, "A Peer Connection Authenticates A Key, Not An
Account," "A Peer Authentication Signature Is Scoped To One Connection,
Never To One Identity," and "Transport State And Authentication State
Are Two Different Questions." Deliberately not in 0.2.49: any peer
discovery or rendezvous mechanism (finding an address to `connect()` to
at all remains its own still-unscheduled milestone); any persistent
trusted-peer concept; a real WebRTC or other network transport; and
reconnecting presence/profile/interaction sync to run over an
authenticated peer connection instead of today's open
`BroadcastChannel`.

0.2.50 answers the other half 0.2.49 deliberately deferred — how does
Alice find Bob's address at all — with a portable, deliberately UNSIGNED
`peer/PeerInvitation.js` (endpoint, expiry, an optional untrusted
identityHint) that a `peer/PeerDiscoveryProvider.js` turns into a
`peer/PeerDiscoveryRecord.js`: a mere candidate, never a proof — only
0.2.49's own unmodified handshake may ever say "this is Bob."
`application/ConnectToPeerUseCase.js`/`application/ConnectedPeer.js`/
`application/ConnectedPeerRegistry.js` wire discovery through
authentication into one derived `peer/PeerLifecycleState.js`
(DISCOVERED → CONNECTING → CONNECTED → AUTHENTICATING → AUTHENTICATED),
auto-removing a peer the instant its connection closes or fails — no
persisted "connected peers" list, no automatic friend relationship. See
docs/Architecture.md, "Peer Discovery & Rendezvous (0.2.50)."

0.2.51 closes the transport gap both prior milestones named:
`peer/WebRtcPeerConnection.js`/`peer/WebRtcPeerConnectionProvider.js`
are a real `RTCPeerConnection`/`RTCDataChannel` pair satisfying the
exact same `PeerConnection`/`PeerConnectionProvider` contract
`LocalPeerConnectionProvider` already did, so nothing above that
interface needed to change. Signaling (`peer/PeerConnectionOffer.js`/
`peer/PeerConnectionAnswer.js`) is handed off exactly as manually and
deliberately as a `PeerInvitation` already is — no signaling server, no
STUN/TURN configured by default. A serialized offer is usable verbatim
as a `PeerInvitation#endpoint`, so 0.2.50's discovery flow plugs into a
real transport with zero code changes; the flagship test proves two
genuinely separate `RTCPeerConnection`s reaching mutual 0.2.49
authentication over a real DataChannel. See docs/Architecture.md, "Real
WebRTC Peer Transport & Signaling Handoff (0.2.51)."

0.2.52 answers the question those milestones' own proposed follow-ons
opened first: once Alice and Bob have a real, authenticated peer
connection, how do different decentralized application protocols
safely share it? `peer/PeerMessage.js` (new) is the deliberately boring
wire envelope every application message now travels in —
`messageId`/`protocol`/`version`/`payload`, structurally validated but
never interpreted. `peer/PeerMessageBus.js` (new) is the
application-facing multiplexer sitting directly on
`application/ConnectedPeer.js`: `subscribe(protocol, handler)`
registers once, independent of which peer eventually sends;
`send(connectedPeer, protocol, payload)` delivers to exactly one peer.
The central rule is structural, not just documented: a peer whose
`getLifecycleState()` is not, right now, AUTHENTICATED gets no message
channel at all — every incoming message is re-checked against the
peer's CURRENT lifecycle at delivery time, not merely at the moment a
protocol attached, so a connection that is CONNECTED but still
AUTHENTICATING (or one whose authentication later FAILED) cannot inject
anything through the bus. Deliberately, no second generic message
signature was added — the connection is already authenticated, and a
protocol that needs cryptographic proof over its own payload signs at
its own layer, exactly like `core/AvatarPresenceAdvertisement.js`
already does. The flagship test (`tests/PeerMessaging.test.js`) runs
the identical application-level scenario — mutual authentication, then
Alice sends `test.alpha`/`test.beta`/`test.unknown` and Bob (subscribed
only to the first two) receives exactly those two — over BOTH
`LocalPeerConnectionProvider` and `WebRtcPeerConnectionProvider`,
unmodified, proving the abstraction is real rather than an interface
with one implementation underneath. See docs/Architecture.md,
"Authenticated Peer Messaging & Protocol Multiplexing (0.2.52)," and
docs/Principles.md, "A Peer Connection Transports Messages; It Does Not
Interpret Them," "A Peer Message Envelope Carries Routing Information,
Never Meaning," and "Replay Semantics Belong To The Protocol, Never The
Bus." Deliberately not in 0.2.52: any real protocol actually using this
bus yet — Presence/Profile/Interaction remain on their own separate
`BroadcastChannel`s until a future milestone moves them over one at a
time; any change to `PresenceVisibilityPolicy`'s FRIENDS tier; and any
new UI — this milestone is substrate only.

0.2.53 answers the question that deferral opened first: "replace
`BroadcastChannel` as the primary remote-presence transport with
authenticated peer messaging, while preserving the entire 0.2.38
presence trust model." `presence/PeerAvatarPresenceBroadcastProvider.js`
(new) is a second, real implementation of the same `presence/
AvatarPresenceBroadcastProvider.js` interface
`LocalAvatarPresenceBroadcastProvider` has satisfied since 0.2.37,
built on `PeerMessageBus`/`ConnectedPeerRegistry` (both completely
unmodified) instead of `BroadcastChannel` — because every file
downstream of that interface (`PresenceSyncService` through
`PresenceFreshness`) only ever depended on it, not on which provider
implemented it, the entire 0.2.37/0.2.38 ingestion and trust pipeline
needed zero changes. The one genuinely new question a point-to-point
transport raises — presence is now N independent one-to-one sends, one
per AUTHENTICATED peer, not one broadcast — is answered by a new
per-peer method, `PresenceVisibilityPolicy#shouldAdvertiseToPeer(peerIdentityId)`,
consulted once per peer inside the new transport's own `advertise()`,
never inside presence's core classes and never by putting a
recipient/visibility field on the wire. This finally gives PUBLIC
("every eligible AUTHENTICATED peer"), FRIENDS ("only a peer whose
PROVEN peer identityId — a did:key from a real 0.2.49 handshake, never
a display name — is authorized"), and LOCAL ("never reaches a peer
connection at all, even a same-machine one") the genuinely distinct
meanings 0.2.40 could only call "observationally identical today."
`LocalAvatarPresenceBroadcastProvider` is not removed — it stays the
app's only DEFAULT-wired transport, since there is still no live
"Connected Peers" UI for a real session to ever have an authenticated
peer to send to. Presence still never establishes a connection: the new
transport only ever iterates peers `ConnectedPeerRegistry` already
knows about, never calls `connect()`. The flagship test
(`tests/PeerAvatarPresence.test.js`) runs a real three-node scenario —
Alice connects to both Bob and Charlie, who never connect to each
other — through PUBLIC (both receive her movement), FRIENDS-authorizing-
Bob-only (Charlie's view freezes exactly where it was), HIDDEN (neither
receives anything, though Alice's own presence keeps genuinely
advancing), and PUBLIC again (both catch up together), then proves a
tampered advertisement carrying a stolen-but-genuine signature is still
rejected by the completely unmodified 0.2.38 trust boundary, sent over
the very peer connection that just delivered legitimate presence.
Deliberately not in 0.2.53: peer discovery/friend requests (unchanged
from 0.2.50), presence forwarding or mesh routing (Bob never relays
Alice's presence to Charlie on her behalf), a NAT relay service, chat,
voice, persistent peer trust, any new UI, and moving Avatar Profile or
Avatar Interaction onto `PeerMessageBus` — both remain on their own
`BroadcastChannel`s, exactly as Presence itself did before this
milestone.

0.2.54 moves the second of those two: "the identical transport swap
applied to 0.2.41's own `BroadcastChannel`-based profile protocol,
keeping its existing signature/trust/replay machinery untouched."
Unlike 0.2.53, no second transport class was needed —
`presence/PeerAvatarPresenceBroadcastProvider.js` is reused
byte-for-byte unmodified, constructed a second time with
`protocol: 'forkbuild:avatar-profile'`, the same reuse
`CreateWorldViewUseCase.js` already applied to
`LocalAvatarPresenceBroadcastProvider` for profile back in 0.2.41.
Because `AvatarProfileSyncService` through `RemoteAvatarAppearanceRegistry`
only ever depended on the transport INTERFACE, the entire 0.2.41
profile pipeline needed zero changes. The one new file, `core/
AvatarProfileVisibilityPolicy.js`, deliberately answers "which peers
receive my profile" WITHOUT reusing `PresenceVisibilityPolicy` —
`Presence: PUBLIC, Profile: FRIENDS` and the reverse are both real,
independently representable configurations, never one policy silently
wearing two hats; 0.2.54's own default is the simplest honest rule
("every AUTHENTICATED peer is eligible," no FRIENDS/LOCAL/HIDDEN tier
yet), matching the same permissive, explicitly temporary posture
`AvatarProfileTrustBoundary` already took on the trust side in 0.2.41.
The flagship test (`tests/PeerAvatarProfile.test.js`) runs the same
three-node scenario: Alice's customized profile reaches Bob and
Charlie over `PeerMessageBus`, a later edit strictly increments the
revision and both catch up, a stale revision/equivocating claim/
stolen-signature tamper are each rejected by the unmodified 0.2.41
trust boundary, an unrecognized template degrades to the placeholder,
a connection drop-and-reconnect leaves the profile byte-identical
throughout, and Alice's PRESENCE independently going stale on Bob's
side never touches her PROFILE. Charlie never has a presence transport
wired at all, and still resolves Alice's real appearance through
profile alone — proving profile synchronization never depends on
presence, structurally, not merely by assertion.

0.2.55 finally answers the question 0.2.53 and 0.2.54 both left
sitting: "there is still no live 'Connected Peers' UI." Everything
needed to answer "how do I actually connect to another person?" had
already been built — 0.2.49 through 0.2.52's authentication, discovery,
real WebRTC transport, and message multiplexing — but none of it was
reachable from the running app. `application/PeerSessionManager.js` is
the one new application class, and it owns nothing but the shape the
design doc asked for: invitations → connections → authenticated peers
→ `ConnectedPeerRegistry`. It invents no cryptography and no new
lifecycle state, only hiding WebRTC's two-step, no-server offer/answer
handoff behind three verbs (`createInvitation`/`acceptInvitation`/
`completeConnection`) a UI can call without knowing WebRTC exists
underneath. The new `/peers` view renders exactly what was already
true — `PeerLifecycleState`, `remoteIdentity`, a per-connection local
alias — and adds no new trust concept: a peer still disappears the
moment its connection closes, there is still no "friends" list, and
presence/profile stay wired to their own local `BroadcastChannel`
transports, completely untouched. The flagship test proves the whole
loop over a real WebRTC connection: an invitation Alice creates, Bob
accepts, and Alice completes reaches mutual AUTHENTICATED peers, each
visible in the other's own My Peers, before a disconnect removes both.

0.2.67 answers a question 0.2.46 through 0.2.48 all named but never
closed: "what happens when the owner wants to change, rotate, revoke,
or recover an identity?" Three new operations join identity/
LocalIdentityProvider.js's existing lifecycle surface. `changePassphrase`
re-protects an already-protected identity's key under a new passphrase
in place — same identityId, same public key, every existing signature
and peer relationship stays valid, because a passphrase protects the
KEY, never the identity itself. `declareSuccessor` produces a signed,
cryptographically verifiable statement that one identity names another
as its successor — deliberately NOT a mutation of the original: identityId
stays immutable for the lifetime of the cryptographic identity it names,
so a rotation is always two identities plus a signed, directional link
between them, never one identity whose key quietly changed underneath
the same id. `revokeIdentity` produces a signed, PERMANENT self-revocation
(only the identity's own key can ever produce one — there is no central
authority anywhere in this architecture that could revoke a key it
doesn't control) and durably flips its lifecycle state to REVOKED.

The one enforcement point is deliberately narrow: `_requireAuthenticatedIdentity()`
— the single gate every signing call in this codebase already passes
through — now also refuses a revoked identity, alongside its existing
"no active session" and "vault locked" checks. Because peer/
PeerAuthenticationSession.js's PROOF step has no path to a signature
that doesn't run through that same gate, a revoked identity loses the
ability to complete any NEW peer-authentication handshake with zero
lines changed under peer/ — proven directly in the flagship test, which
authenticates Alice to Bob, changes her passphrase (Bob notices
nothing), rotates her to a successor and revokes her original identity
in one signed act, then watches a fresh connection attempt using the
revoked identity fail cleanly rather than crash the transport.
Revocation is deliberately narrow in another way too: it never
retroacts onto anything already established (peer connections have
been fully ephemeral since 0.2.49, re-proved from nothing on every
reconnect) and it never ends the AuthenticationSession or forbids
re-authenticating — VAULT LOCKED, AUTHENTICATION INACTIVE, and IDENTITY
REVOKED stay three genuinely independent facts, the same discipline
0.2.46/0.2.47 already established for the first two.

Recovery itself gained no new mechanism, on purpose: 0.2.48's
export/import already IS recovery ("regain control of an identity you
still have the exported package and passphrase for"). What 0.2.67 adds
is the ability, once recovered, to also revoke a compromised original
and point everyone who still has it at a named successor — and it is
explicit about the one gap this leaves rather than pretending to solve
it: lifecycle state is a durable fact on the revoking device only, and
does not travel inside an export package. Propagating "identity A is
revoked, trust B instead" to every device or peer that still knows A is
left to a future milestone, over the same decentralized infrastructure
this codebase already has — never a central revocation server.

0.2.68 closes exactly that gap, deliberately without turning revocation
or succession into a centralized mechanism. A new, namespaced
`peer/PeerMessageBus.js` protocol, `forkbuild:identity-lifecycle`,
relays the EXACT SAME signed records 0.2.67 already produces —
`core/IdentityRevocationEnvelope.js`/`core/IdentitySuccessionEnvelope.js`
— to every currently-authenticated connected peer, verified by the
EXACT SAME `identity/LocalAuthorizationVerifier.js` methods 0.2.67
already wrote. The one property worth naming plainly: what makes a
gossiped record trustworthy is never who relayed it — it is the
record's own signature. Charlie, connected to Bob, can legitimately
hand Bob a revocation Alice signed, without Charlie being Alice or ever
having talked to her directly; the deliberate, documented opposite of
`application/FriendRelationshipUseCase.js`'s own actor-must-match-
connection rule. A new relevance gate keeps this from becoming an open
revocation directory: a record about an identity this device has never
remembered as a Known Peer or a Friend is dropped regardless of how
cryptographically valid it is. And — the property the flagship test
goes out of its way to prove — propagation never becomes authority
over anything else this device already has on record: after Alice
rotates identity A to identity B, `PeerRelationship(A)` and
`PeerRelationship(B)` remain two genuinely distinct records on Bob's
device, never silently merged just because a verified succession link
exists between them. Deliberately deferred: durable, retried delivery
to a peer who is offline right now (unlike `application/ChatOutbox.js`'s
own reliable-delivery model), and multi-hop relay beyond a device's own
directly-connected peers.

0.2.69 closes a gap 0.2.61 named on purpose and 0.2.63 explicitly
declined to reopen: "what persistent message history should even mean
in a decentralized system." The answer is scoped to the narrowest,
most defensible case — a PURELY LOCAL, client-side conversation history,
never a server, relay, or new wire protocol. `core/ConversationEntry.js`
is the durable half of a live `core/ChatMessage.js` (message,
peerIdentityId, direction, delivery state — immutable, like `core/
ChatOutboxEntry.js`), and `application/ConversationStore.js` is a new,
genuinely SEPARATE durable store from `application/ChatOutbox.js` — same
per-owner, identity-addressed shape, opposite retention posture (the
outbox prunes itself the instant a message is acknowledged; this store
keeps every message, delivered or not, up to a per-peer cap). `ChatUseCase`
writes through to it on every append and every delivery-state
transition, and — the load-bearing new piece — rehydrates every
`LiveConversation` from it on construction, re-seeding each peer's
outgoing sequence counter from its own stored history so a reload never
restarts sequence numbering at 1 (which would otherwise make the
recipient's own unmodified replay window silently reject the next
message as stale). The security property `application/ChatOutbox.js`
proved in 0.2.63 — mail queued for Bob is never sent to, or lost via, an
identity that merely "reconnects" and turns out to be Charlie — extends
to durable conversation history for free, because both stores are
addressed to a `peerIdentityId`, never a connection. The flagship test
(`tests/ReliableOfflineConversations.test.js`) proves a full conversation
— delivered, then queued-while-offline — survives a simulated reload (a
brand-new `ChatUseCase` over the same durable storage) with its content,
delivery state, and outgoing sequence numbering all intact, then re-runs
the 0.2.62 honest-mismatch attack against the new store specifically.
Deliberately not in 0.2.69: any server-side mailbox or chat relay
(offline delivery stays a device's own local outbox waiting for a fresh
authenticated connection, never a third party holding mail in between),
an aggregate conversation-list/inbox UI, read receipts, message editing/
deletion, attachments, group chat, and multi-device identity semantics.

0.2.70 closes the gap 0.2.69's own durability opened: once a conversation
and a queued message both survive a reload, the app needed one place
that reconciles what it actually knows about another participant when
there's no active connection — identity, a remembered relationship
(0.2.56), a friendship (0.2.57), whether they're connected right now
(0.2.50), and the conversation itself (0.2.69) — rather than a UI asking
five different collaborators separately. `application/
PeerPresenceUseCase.js` is that reconciliation, and it is deliberately
NOT a new store: `getSummary()`/`list()` read `ConnectedPeerRegistry`,
`PeerRelationshipUseCase`, `FriendRelationshipUseCase`,
`ConversationStore`, and `ChatOutbox` fresh on every call and persist
nothing, the same "computed, never stored" discipline
`peer/PeerLifecycleState.js#derivePeerLifecycleState()` already
established one layer down. The one genuinely new durable piece is
`application/ConversationReadTracker.js` — a THIRD independent store
alongside the outbox and the history store, answering "what has this
device's owner actually seen," backed by `core/ConversationReadMarker.js`'s
monotonic high-water mark and never signed, transmitted, or read by
`application/ChatUseCase.js`'s own ingestion boundary — a purely local
note, deliberately never a read receipt (see docs/Principles.md). A new
`ui/views/ConversationsView.js` is the aggregate conversation-list UI
0.2.69 named and declined to build, and `ui/views/ChatView.js` gained a
"Show details" panel surfacing the same five reconciled facts for the
conversation currently open. The flagship test
(`tests/PeerPresenceConversationLifecycle.test.js`) proves presence
reconciles correctly across a real disconnect/reconnect cycle — offline
never hides a relationship, friendship, or conversation history, only
whether the connection itself is live — and a SECURITY FLAGSHIP extends
0.2.62's own stale-incarnation defense into this new layer: a rejected
reconnect that genuinely authenticates as the wrong identity, and a
late, stale event from that already-dead connection, can never corrupt
the reconciled presence view for the identity actually expected.
Deliberately not in 0.2.70: read receipts (a signed, transmitted
acknowledgment is a different protocol from this milestone's purely
local read marker), a second connection-lifecycle vocabulary alongside
`peer/PeerLifecycleState.js`, multi-device presence, and typing
indicators.

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
- **Ephemeral Avatar Interaction Synchronization (0.2.45)** — the networked half of 0.2.44's gestures, deliberately narrow: a GREET/WAVE/POINT is an EVENT, never STATE, so it is never retained once rendered. A third, independent wire shape (`core/AvatarInteractionAdvertisement.js` — `avatarId`/`interactionId`/`kind`/`targetAvatarId`/`sequence`/`timestamp`/optional `signature`) travels on its own `BroadcastChannel` (`'forkbuild:avatar-interaction'`), through its own trust boundary (`application/AvatarInteractionTrustBoundary.js` — structural validity → signature/policy → authority → replay/staleness, deliberately with NO equivocation check, a named gap left to a future, still-unscheduled milestone) and its own bounded replay window that tracks both `interactionId` (duplicate suppression) and `sequence` (staleness rejection) per avatarId. `AvatarInteractionSyncService.pull()` returns only the newly-accepted events since the last call — never a persisted "current" record the way presence/profile sync services keep one. `targetAvatarId` is a CLAIM ("Bob claims he waved at Alice"), never an instruction — a bystander can observe and render the same event the named target does, and no replica gains any reach into another avatar's own state. A trusted event renders on the SENDER's own remote avatar visual (`RenderWorldViewUseCase#setRemoteAvatarGesture()`, reusing `AvatarVisual.setGesture()` byte-for-byte) and auto-expires after ~1.8s with no "stop" message ever required. `AvatarPresence`/`AvatarProfile` gain zero new fields; the flagship test proves a full replay/tamper/impersonation attack scenario over a real `BroadcastChannel` never renders a forged gesture, and never touches a Document, Publication, WorldPlacement, or the spatial index.
- **Local Identity & Authentication Session (0.2.46)** — pauses the avatar arc to fix a conflation that dates back to 0.2.16: `login(username)` used to lazily derive a signing key from whatever string was typed, so "which account is shown" and "which key this device holds" were the same event by construction. `identity/LocalIdentity.js` (new) is a durable, validated record of a key this device actually possesses (`identityId`/`publicKey`/`algorithm`/`label`/`createdAt`, its `identityId` provably derived from its own `publicKey`), created up front via `createLocalIdentity(label)` — independent of any login flow. `identity/AuthenticationSession.js` (new) answers the genuinely missing question, "is one of them unlocked right now" (`ANONYMOUS`/`AUTHENTICATED`), separate from both `LocalIdentity` (durable) and `identity/Identity.js` (a display label, unchanged since 0.1.21). `identity/LocalIdentityProvider.js` is rebuilt on top of both, with `authenticate(identityId)`/`endSession()` unlocking or releasing a key this device already holds — but every pre-existing method (`login`/`logout`/`currentUser`/`sign`/`getSigningIdentity`/`signCanonical`) keeps its exact 0.1.21/0.2.16 signature and behavior as a thin compatibility layer over the new model, so every existing use case and test that signs a publication, placement, or avatar advertisement keeps working unchanged. Signing is now genuinely gated by the session, not merely by `currentUser()` happening to agree with it, proven in `tests/LocalIdentitySession.test.js` by ending a session and watching signing fail while the key stays on disk untouched. The Login modal now lists every identity this device holds and makes "Create New Identity" an explicit action, never a side effect of retyping a name. Deliberately not in 0.2.46: passphrase/encryption on the stored key, portable identity export/import or recovery, and peer discovery/authenticated peer sessions — the wire formats and `identity/LocalAuthorizationVerifier.js` are completely unchanged; only where a signing key comes from changed.
- **Identity Security & Key Protection (0.2.47)** — closes the gap 0.2.46 named instead of moving on to portability or peer networking: a `LocalIdentity`'s private key can now be protected by a user-chosen passphrase, either from creation (`createLocalIdentity(label, passphrase)`) or migrated in place later (`protectIdentity(identityId, passphrase)`), always opt-in and never forced. `identity/KeyEncryption.js` (new) is a self-contained PBKDF2-HMAC-SHA512 + SHA512-CTR + HMAC-SHA512 encrypt-then-MAC scheme, built from the same `sha512` primitive `identity/Ed25519.js` already established rather than a new dependency; a wrong passphrase and a tampered record fail identically, rejected by the MAC before decryption is ever trusted. `identity/VaultLock.js` (new) is a FOURTH identity concept — "is this identity's key decrypted in memory right now?" — genuinely independent of `LocalIdentity` (durable) and `AuthenticationSession` (persisted): a protected identity can be logged in while its vault is `LOCKED`, and a page reload always finds a protected vault `LOCKED` regardless of session state, because the decrypted seed lives only in a volatile in-memory cache nothing ever persists. `identity/FailedUnlockTracker.js` enforces a time-based cooldown after repeated wrong passphrases (the correct one is refused too, mid-cooldown); `identity/VaultTimeoutPolicy.js` auto-locks an unlocked vault after a fixed lifetime, honestly not true activity tracking, without ending the session itself. `LoginModal`/`UserWidget` gain inline passphrase prompts and a distinct "🔒 locked, still logged in" state. Deliberately not in 0.2.47: changing/removing a passphrase once set, PIN-strength policy, true idle-activity detection, portable export/import, and peer discovery/authenticated sessions.
- **Portable Identity, Export, Import & Recovery (0.2.48)** — closes the gap 0.2.46 and 0.2.47 both named: a `LocalIdentity`'s private key can now move to a second device as a protected, versioned package, never a plaintext seed. `identity/IdentityExport.js`/`IdentityImport.js`/`IdentityRecovery.js` (new) build, strictly validate, and decrypt/verify a portable package built from 0.2.47's own `KeyEncryption` record shape — no second invented format. The central invariant, proven end to end in `tests/PortableIdentity.test.js`'s flagship test: a signature produced on a second, completely independent device after import verifies with the identity's ORIGINAL public key through the unmodified `LocalAuthorizationVerifier`. Importing a duplicate identity is a pure no-op (`ALREADY_EXISTS`, doesn't even require the correct passphrase); an imported identity always lands protected and `LOCKED`, regardless of whether it was protected at rest on its origin device — import proves possession, never authentication. `ui/views/IdentityManagementView.js` (new, "My Identities") is a dedicated view for lock/unlock/export/import across every identity a device holds. Deliberately not in 0.2.48: changing/removing a passphrase, any recovery path that doesn't require both the exported file and its passphrase (there is no password reset), non-file package transport, and peer discovery/authenticated sessions.
- **Authenticated Peer Connection Model (0.2.49)** — begins the decentralized peer arc with one deliberately narrow question: not yet "how does Alice find Bob," but "once Alice has a connection to something claiming to be Bob, how does she cryptographically establish who Bob is?" A new, transport-agnostic vocabulary independent of avatars/presence/profiles/documents: `peer/PeerConnectionProvider.js`/`peer/PeerConnection.js` (new, abstract — the same throwing-stubs boundary `discovery/DiscoveryProvider.js` already establishes) carry ONLY transport state (`peer/PeerConnectionState.js`); `peer/LocalPeerConnectionProvider.js` (new) is a real in-process implementation, standing in for a future WebRTC/relay transport. `peer/PeerAuthenticationSession.js` (new) layers a completely independent state machine (`peer/PeerAuthenticationState.js`) on top: a symmetric mutual challenge-response handshake where each side signs the other's challenge via `identity/LocalIdentityProvider.js`'s own unmodified `signCanonical()`, over a new canonical descriptor (`core/PeerAuthenticationEnvelope.js`, `SignatureType.PEER_AUTHENTICATION`) that signs `protocol`/`purpose`/`sessionNonce`/`challenge`/`identityId`/`publicKey` together — the `sessionNonce` (the connection's own id) is what makes a captured, entirely genuine handshake fail when replayed into a different connection, since the signature itself no longer verifies. A verified PROOF yields a `peer/PeerIdentity.js` — proof of key possession only, never persisted, discarded the instant the connection closes; there is no "friends" list or trusted-peer database anywhere in this milestone, on purpose — a peer connection authenticates a key, not an account. `tests/PeerAuthentication.test.js`'s flagship test mutually authenticates two independent `LocalIdentityProvider` instances over a real connection, then proves close/reconnect requires a fresh handshake, and separately proves a replayed handshake, a modified challenge, a substituted public key (both as a mismatch and as a full impersonation attempt), and a genuinely valid signature reused against a different challenge are all rejected — several purely because the underlying signature's own cryptographic binding fails, not a shallow field check — while `core/AvatarPresenceAdvertisement.js` signing stays completely unaffected. Deliberately not in 0.2.49: any peer discovery/rendezvous mechanism, any persistent trusted-peer concept, a real network transport, and reconnecting presence/profile/interaction sync to run over an authenticated connection instead of today's open `BroadcastChannel`.
- **Peer Discovery & Rendezvous (0.2.50)** — answers the half of 0.2.49's own deferral about finding Bob's address at all: `peer/PeerInvitation.js` (new) is a portable, deliberately UNSIGNED rendezvous hint (endpoint, expiry, an optional untrusted `identityHint`); `peer/PeerDiscoveryProvider.js`/`peer/LocalPeerDiscoveryProvider.js` (new) turn one into a `peer/PeerDiscoveryRecord.js` — a candidate, never a proof, per docs/Principles.md, "Discovery Finds A Candidate; It Never Authenticates One." `application/DiscoverPeersUseCase.js`/`application/ConnectToPeerUseCase.js` (new) wire discovery through completely unmodified 0.2.49 authentication; `application/ConnectedPeer.js`/`application/ConnectedPeerRegistry.js` (new) track the live result as one PURE, derived `peer/PeerLifecycleState.js` (DISCOVERED → CONNECTING → CONNECTED → AUTHENTICATING → AUTHENTICATED → FAILED/CLOSED), auto-removing a peer the moment its connection disappears — no persisted "connected peers" list, no automatic friend relationship. The flagship test (`tests/PeerDiscovery.test.js`) runs invitation → discovery → connection → mutual authentication end to end, then proves a tampered endpoint fails the connection outright and a tampered identityHint never affects the real, proven `remoteIdentity`. Deliberately not in 0.2.50: any real network transport, signing a `PeerInvitation`, any persistent contacts/aliases system, or new UI.
- **Real WebRTC Peer Transport & Signaling Handoff (0.2.51)** — closes the transport gap 0.2.49 and 0.2.50 both named: `peer/WebRtcPeerConnection.js`/`peer/WebRtcPeerConnectionProvider.js` (new) are a real `RTCPeerConnection`/`RTCDataChannel` pair satisfying the exact same `peer/PeerConnection.js`/`peer/PeerConnectionProvider.js` contract `LocalPeerConnectionProvider` already did, so `ConnectToPeerUseCase`/`DiscoverPeersUseCase` needed no changes to drive it. Signaling (`peer/PeerConnectionOffer.js`/`peer/PeerConnectionAnswer.js`, new — deliberately UNSIGNED and short-lived, like a `PeerInvitation`) is handed off exactly as manually as 0.2.50's own invitation handoff — no signaling server, no STUN/TURN configured by default (an `iceServers` option exists but ships empty). A serialized offer is usable verbatim as a `PeerInvitation#endpoint`, so 0.2.50's discovery flow plugs into a real transport with zero changes. The flagship test (`tests/WebRtcPeerTransport.test.js`) proves two genuinely separate `RTCPeerConnection`s — signaling relayed only as JSON, simulating an actual copy/paste — reach mutual 0.2.49 authentication over a real DataChannel, and that closing/reconnecting behave correctly under real network timing. Also fixed, surfaced by real timing: a `ConnectedPeer#dispose()` listener-iteration bug 0.2.50 shipped. Deliberately not in 0.2.51: any signaling server, real NAT-traversal hardening, any application message protocol beyond 0.2.49's own HELLO/PROOF, or new UI.
- **Authenticated Peer Messaging & Protocol Multiplexing (0.2.52)** — "once Alice and Bob have an authenticated peer connection, how do different decentralized application protocols safely share it?" `peer/PeerMessage.js` (new) is the deliberately boring wire envelope every application message now travels in — `messageId`/`protocol`/`version`/`payload`, structurally validated but never interpreted, carrying no avatar state, username, trust state, or signature. `peer/PeerMessageBus.js` (new) is the application-facing multiplexer sitting directly on `application/ConnectedPeer.js`: `subscribe(protocol, handler)` registers once, independent of which peer sends; `send(connectedPeer, protocol, payload)` delivers to exactly one peer; structurally, it never contains `if (protocol === '...')` anywhere, only a `Map` from protocol name to whatever subscribed. The central security property is structural: a peer whose `getLifecycleState()` is not, right now, AUTHENTICATED gets no message channel — every incoming message is re-checked against the peer's CURRENT lifecycle at delivery time, never merely at `attach()` time, so a connection that is CONNECTED but still AUTHENTICATING (or one whose authentication later FAILED) cannot inject anything. Generic transport hygiene only — a malformed envelope, an oversized one (`MAX_PEER_MESSAGE_BYTES`), or a duplicate `messageId` (suppressed in a small BOUNDED window, deliberately not `replication/ReplayGuard.js`'s unbounded ledger) are rejected before reaching a handler; an unknown protocol is simply ignored. Deliberately, per the design doc's own reasoning, no second generic message signature was added — the connection is already authenticated, and a protocol needing its own cryptographic proof signs at its own layer, exactly like `core/AvatarPresenceAdvertisement.js` already does. The flagship test (`tests/PeerMessaging.test.js`) runs the identical application-level scenario — mutual authentication, then Alice sends `test.alpha`/`test.beta`/`test.unknown` and Bob (subscribed only to the first two) receives exactly those two, each once, with the real proven sender identity attached — over BOTH `LocalPeerConnectionProvider` and `WebRtcPeerConnectionProvider`, unmodified, proving the abstraction is real rather than an interface with one implementation underneath; separate tests prove the AUTHENTICATED-gating property deterministically and that a HELLO/PROOF handshake message sharing the same `onMessage()` stream can never be mistaken for a `PeerMessage` envelope. Deliberately not in 0.2.52: any real protocol actually using this bus yet (Presence/Profile/Interaction remain on their own `BroadcastChannel`s), any change to `PresenceVisibilityPolicy`'s FRIENDS tier, message ordering/retry/acknowledgment guarantees beyond the underlying `PeerConnection`, or new UI.
- **Peer-Based Avatar Presence (0.2.53)** — replaces `BroadcastChannel` as the primary remote-presence transport with authenticated peer messaging, while preserving the entire 0.2.38 presence trust model untouched. `presence/PeerAvatarPresenceBroadcastProvider.js` (new) is a second real implementation of the same `AvatarPresenceBroadcastProvider` interface `LocalAvatarPresenceBroadcastProvider` has satisfied since 0.2.37, built on `PeerMessageBus`/`ConnectedPeerRegistry` instead of `BroadcastChannel` — every downstream file (`PresenceSyncService` through `PresenceFreshness`) needed zero changes. A new per-peer method, `PresenceVisibilityPolicy#shouldAdvertiseToPeer(peerIdentityId)`, decides which of a replica's currently-AUTHENTICATED peers actually receive a given advertisement — never inside presence's core classes, never on the wire — finally giving PUBLIC (every eligible authenticated peer), FRIENDS (only a peer whose PROVEN did:key identityId is authorized), and LOCAL (never reaches a peer connection at all) the genuinely distinct meanings 0.2.40 could only call "observationally identical." `LocalAvatarPresenceBroadcastProvider` stays the app's only default-wired transport — there is still no live "Connected Peers" UI. Presence still never establishes a connection. The flagship test proves a real three-node scenario (Alice, Bob, Charlie — Bob and Charlie never connect to each other) through PUBLIC/FRIENDS/HIDDEN/PUBLIC transitions and a tamper attempt rejected by the unmodified 0.2.38 trust boundary.
- **Peer Connections & Rendezvous UI (0.2.55)** — the first LIVE "Connected Peers" surface 0.2.53 and 0.2.54 both named as still missing: a new `/peers` route (`ui/views/PeerConnectionsView.js`) over one small, new application class, `application/PeerSessionManager.js` — a thin composition of the already-shipped `application/DiscoverPeersUseCase.js`/`application/ConnectToPeerUseCase.js`/`peer/WebRtcPeerConnectionProvider.js`, adding no new state machine and no new trust decision of its own. "Invite Someone" walks a real `peer/WebRtcPeerConnectionProvider.js` offer through `createInvitation()`, showing the resulting `PeerInvitation` as copyable JSON; "Connect to Peer" imports it through `acceptInvitation()` and produces the WebRTC answer the inviter must paste back through `completeConnection()` — the same manual, no-signaling-server handoff 0.2.51 already established, now with a UI walking a person through it instead of a test file. "My Peers" reads `application/ConnectedPeerRegistry.js` directly, rendering each peer's already-existing `peer/PeerLifecycleState.js` as a badge and a step-by-step progression (Rendezvous discovered → WebRTC connecting → Peer connected → Authenticating → Authenticated) — never a UI-invented status. A Peer Identity panel shows the real `remoteIdentity` (did:key, public key, algorithm) only once `getLifecycleState()` genuinely reports AUTHENTICATED, and calls the connection "Ephemeral" rather than "Friend," on purpose. A per-peer local alias (`ConnectedPeer#setAlias`, unmodified since 0.2.50) is editable in the card and never sent anywhere. Deliberately not in 0.2.55, matching the design doc's own scope: chat (`peer/PeerMessageBus.js` untouched), a persistent friends/contacts list (a closed peer still simply disappears), automatic discovery beyond invitation-based rendezvous, and any change to presence/profile wiring — `CreateWorldViewUseCase.js` still wires only the local `BroadcastChannel` transports by default, exactly as 0.2.53/0.2.54 left it. The flagship test (`tests/PeerConnectionsUI.test.js`) drives `PeerSessionManager` end to end over a real WebRTC connection — invitation → accept → complete → mutual AUTHENTICATED peers, each visible in the other's own My Peers, alias set and confirmed local-only, then disconnect removing the peer from both sides — plus friendly-error coverage for garbage input, an unknown connection id, and a captured invitation replayed after its own expiry.
- **Decentralized Friend Relationships & Mutual Consent (0.2.57)** — answers 0.2.56's own open question: how can Alice and Bob become friends without a central server deciding that they are? A small, closed REQUEST/ACCEPT vocabulary (`core/FriendshipAction.js`) travels as signed events (`core/FriendshipAdvertisement.js`, `SignatureType.FRIENDSHIP`) directly between two already-authenticated peers over `peer/PeerMessageBus.js`. Each device keeps its own durable `core/FriendshipRecord.js` — the action it sent and the action it received and independently verified — and derives NONE/REQUESTED/FRIEND (`core/FriendshipState.js`) fresh from the two: FRIEND requires one side's signed REQUEST answered by the OTHER side's signed ACCEPT, never merely both sides asking at once. `identity/LocalAuthorizationVerifier.js#verifyFriendshipAdvertisement()` is the first verify* method that refuses an unsigned claim outright and binds the signer to the specific already-authenticated connection it arrived on. `ui/views/PeerConnectionsView.js` gains a third, independent "Friends" list and Send/Accept actions. Deliberately not in 0.2.57: REJECT/CANCEL/BLOCK/UNFRIEND, friend-based presence/profile privacy, and any chat or store-and-forward delivery. `tests/FriendRelationships.test.js` proves request, accept, mutual FRIEND on both devices, survival across disconnect/reconnect, and a third identity unable to manufacture or replay either half.
- **Friend-Aware Privacy & Social Visibility (0.2.58)** — makes 0.2.57's friendship architecture actually useful: "now that Alice and Bob are friends, what does that allow them to see?" Nothing automatically. `core/PresenceVisibilityPolicy.js#shouldAdvertiseToPeer()`/`shouldAdvertise()` and `core/AvatarProfileVisibilityPolicy.js` (the latter gaining the full PUBLIC/FRIENDS/LOCAL/HIDDEN vocabulary this milestone, replacing 0.2.54's always-PUBLIC placeholder) both accept a plain `{ isFriend }`/`{ hasFriend }` context the CALLER computes and hands in — neither class ever imports `core/FriendshipRecord.js` itself, preserving "Peer Selection Is A Transport Concern, Never A Presence-Core Concern" one layer further. FRIENDS now means real mutual `FriendshipState.FRIEND`, ADDITIVE alongside (never replacing) 0.2.40's original manually-typed `authorizedPeerIdentities` allow-list. `application/AvatarProfileVisibilityUseCase.js` (new) gives profile visibility its own persisted storage, and `WorldNavigationSession._publishLocalAvatarProfile()` now gates on it independently, superseding 0.2.41's "Presence And Profile Share One Publication Gate" — `Presence: HIDDEN, Profile: PUBLIC` and its reverse are both real, representable configurations now, while a session that never wires the new collaborator keeps the exact pre-0.2.58 shared-gate behavior. `presence/PeerAvatarPresenceBroadcastProvider.js` gains an injected `isFriend` predicate, re-consulted fresh on every `advertise()`, never cached. `ui/views/AvatarSettingsView.js` gains an independent "Profile Visibility" section and explanatory copy: friendship and visibility are separate, and withholding a future advertisement is not remote deletion. The flagship test (`tests/FriendAwareVisibility.test.js`) runs Alice/Bob/Charlie over a real peer network with real mutual friendship driving FRIENDS for both presence and profile, nothing manually authorized at all — proving Bob receives what Charlie doesn't, PUBLIC/HIDDEN transitions behave correctly, friendship state stays untouched by visibility changes, Bob cannot alter Alice's policy, and Bob's eligibility survives a full disconnect/reconnect from his proven identity alone. Deliberately not in 0.2.58: unfriending/blocking, private messaging, and switching World View's own live transport from `BroadcastChannel` to peer messaging (still 0.2.53/0.2.54's own unwired capability).

- **Peer-Based Avatar Social Transport (0.2.59)** — completes the migration 0.2.53/0.2.54 prepared but never wired live: "once a peer is authenticated, avatar state and events travel through that authenticated peer — not through an unrelated ambient broadcast channel." `application/CreateWorldViewUseCase.js` now accepts an optional `{ peerMessageBus, connectedPeerRegistry, friendRelationshipUseCase }` and, whenever a real peer transport is actually supplied, builds ALL THREE avatar-social protocols — presence, profile, and (newly migrated here) ephemeral interaction — as `presence/PeerAvatarPresenceBroadcastProvider.js` instances sharing that one bus, each under its own protocol string (`forkbuild:avatar-presence`/`-profile`/`-interaction`), each wired to its own visibility policy (interaction reuses presence's own, mirroring `WorldNavigationSession._publishAvatarInteraction()`'s existing coarse gate) and to real `isFriend`/`hasFriend` predicates built from the supplied `FriendRelationshipUseCase` for the first time outside a test. A caller that doesn't supply a peer transport (every existing test, and any future headless use) gets EXACTLY the same `presence/LocalAvatarPresenceBroadcastProvider.js` (`BroadcastChannel`) transport 0.2.37/0.2.41/0.2.45 always built — now understood as the LOCAL DEVELOPMENT transport, not World View's primary one. `ui/main.js` provides its existing app-wide `peerMessageBus` directly (previously only reachable through the friendship protocol); `ui/views/WorldView.js` injects it alongside `peerSessionManager`/`friendRelationshipUseCase` and hands all three straight through — no change to `application/WorldNavigationSession.js`, `PresenceSyncService`, `LocalPresenceStore`, `PresenceTrustBoundary`, `PresenceIngestion`, `PresenceEquivocation`, `PresenceReplayWindow`, `AvatarProfileSyncService`, `AvatarInteractionSyncService`, or `AvatarInteractionTrustBoundary` at all — the transport changes, the trust model doesn't. The flagship test (`tests/PeerAvatarSocialTransport.test.js`) runs Alice (Presence: FRIENDS, Profile: PUBLIC, real mutual friendship with Bob), Bob, and Charlie (never a friend) over a real peer network, all three protocols riding the same authenticated connections: Bob receives Alice's presence and her wave, Charlie receives neither; both Bob and Charlie receive Alice's PUBLIC profile regardless; Alice's profile survives a full disconnect/reconnect cycle while her presence correctly goes stale and is later restored; every transport instance is asserted to be the peer-based class, never the `BroadcastChannel` one; and Documents/Publications/Placements stay byte-identical throughout. Deliberately not in 0.2.59: unfriending/blocking (0.2.60, proposed), private messaging, and removing `LocalAvatarPresenceBroadcastProvider` itself — it remains a legitimate, explicitly-named local development/test transport, just no longer the one a real deployment reaches for.

- **Friendship Revocation, Blocking & Privacy Withdrawal (0.2.60)** — closes 0.2.57's own named gap: "friendship can be created, but it cannot yet end." `core/FriendshipAction.js` grows a closed vocabulary of three TERMINAL actions — REJECT (decline a pending incoming request), CANCEL (withdraw your own pending outgoing request), UNFRIEND (end a currently-FRIEND relationship, from either side) — each one, once recorded by `core/FriendshipRecord.js#withOutgoingAction`/`withIncomingAction`, collapsing BOTH directions of the record straight back to a clean NONE rather than leaving a stale REQUEST/ACCEPT beside it. Because the vocabulary is now cyclic (unfriend, then request again), `core/FriendshipAdvertisement.js` gains a REQUIRED `inResponseTo` field on every non-REQUEST action — the exact `signature.signature` of the specific REQUEST instance being answered/ended, covered by the signature itself — closing a real replay gap a cyclic REQUEST/ACCEPT vocabulary would otherwise reopen: without it, a captured, genuinely-valid ACCEPT from an ENDED cycle could be replayed to silently manufacture consent for a brand-new one. `application/FriendRelationshipUseCase.js` gains `rejectFriendRequest()`/`cancelFriendRequest()`/`unfriend()`, and its ingestion boundary (`_isLegitimateTransition()`) validates `inResponseTo` against the specific advertisement this replica actually holds before applying any of the three. Blocking is deliberately NOT a fourth friendship action: `core/PeerBlockRecord.js`/`application/PeerBlockUseCase.js` (new, mirroring `core/PeerRelationship.js`/`application/PeerRelationshipUseCase.js`'s own local-only shape) is a completely separate, unilateral, LOCAL store that never sends anything over the network at all — see docs/Principles.md, "Friendship Is Mutual Relationship State; Blocking Is A Unilateral Local Decision." `FRIEND` and `BLOCKED` are independent, simultaneously-true facts (never one enum), and unblocking restores nothing but the ability to be heard again — it never recreates a friendship on its own. Blocking is enforced as an ADDITIONAL gate on both sides of every avatar-social channel, never a replacement for cryptographic verification: `presence/PeerAvatarPresenceBroadcastProvider.js` gains an injected `isBlocked` predicate checked FIRST in `advertise()`, before the visibility policy, so a blocked peer receives nothing further even if FRIENDS/PUBLIC would otherwise allow it; `application/PresenceTrustBoundary.js`/`AvatarProfileTrustBoundary.js`/`AvatarInteractionTrustBoundary.js` each gain the identical `isBlocked` predicate, checked immediately after signature verification (a new `TrustStatus.BLOCKED`, distinct from `UNAUTHORIZED`), so a blocked signer's cryptographically valid claim is still rejected regardless of how it arrives; `FriendRelationshipUseCase` itself refuses to send a request to, or accept one from, a blocked identity, and silently drops any friendship-protocol message a blocked identity sends. `application/WorldNavigationSession.js` and `application/CreateWorldViewUseCase.js` thread a real `PeerBlockUseCase`-backed `isBlocked` predicate through exactly the way 0.2.58/0.2.59 already thread `isFriend`/`hasFriend` — a caller that never wires blocking keeps the exact pre-0.2.60 behavior. `ui/views/PeerConnectionsView.js` gains Reject/Cancel buttons alongside Send/Accept, an Unfriend button (on "My Peers" when authenticated, and on the "Friends" list itself when that friend happens to be connected right now), a Block/Unblock button available from any card this device already holds an identity for (My Peers, Known Peers, or Friends — blocking never requires a live connection), and a fourth, independent "Blocked" list. The flagship tests (`tests/FriendshipRevocationAndBlocking.test.js`) run real, signed protocol exchanges over authenticated peer connections proving: CANCEL/REJECT/UNFRIEND all independently collapse both devices' records to NONE; a relationship cycles cleanly (NONE → REQUESTED → FRIEND → NONE → REQUESTED again); a captured, genuinely-valid ACCEPT from an ended cycle is rejected against a fresh cycle's REQUEST (the `inResponseTo` replay proof); a blocked peer's own outbound sender gate stops delivering presence even under an otherwise-permissive PUBLIC policy; the presence/profile/interaction trust boundaries all independently reject a blocked signer's genuinely-valid, correctly-signed claim as `BLOCKED`, strictly after (never instead of) signature verification; and FRIEND survives blocking untouched, while unblocking a never-friended stranger never manufactures a friendship that never existed. Deliberately not in 0.2.60: chat (0.2.61, proposed), retroactive deletion of already-received presence/profile data (withholding a future advertisement is still never remote deletion — unchanged since 0.2.58), and notifying a blocked identity that it has been blocked (blocking is silent, on purpose).
- **Direct Peer Messaging & Live Chat (0.2.61)** — the first genuine human-to-human communication feature, built as exactly ONE new protocol (`forkbuild:chat`) riding the same `peer/PeerMessageBus.js` every avatar-social channel and the friendship protocol already share — never a feature folded into the peer transport itself. `core/ChatMessage.js` defines a deliberately small wire envelope (`messageId`, `conversationId`, `senderIdentity`, `sequence`, `timestamp`, `kind`, `body`), structurally validated and bounded, with `kind` a closed one-value vocabulary (`TEXT` only — no attachments, edits, reactions, or typing indicators yet) and `conversationId` derived identically and independently by both participants (`deriveConversationId()`, order-independent, never trusted from the wire without being re-derived and compared). `application/ChatUseCase.js` is the protocol: friendship is an AUTHORIZATION INPUT, never the protocol itself — it never sends, mutates, or imports a `core/FriendshipAdvertisement.js`, only ever asks `friendRelationshipUseCase.getState(identityId) === FriendshipState.FRIEND`, fresh, on every send and every incoming message, alongside the same `isBlocked` predicate 0.2.60 already established. The ingestion boundary (`_handleIncoming()`) checks, in order: well-formed shape, the claimed `senderIdentity` actually matches the sending connection's own already-proven `remoteIdentity` (defeating a forged-sender attack), not locally blocked, currently FRIEND, the `conversationId` is the one this device itself derives for (me, sender) — never whatever the payload claims — and finally a replay/sequence check (`core/ChatReplayWindow.js` + `core/ChatMessageIngestion.js`, mirroring `core/AvatarInteractionReplayWindow.js`/`AvatarInteractionIngestion.js`'s own bounded, per-key duplicate-suppression-plus-monotonic-sequence shape, deliberately keyed to tolerate GAPS rather than assuming one contiguous stream — message identity, sequence ordering, and delivery ordering are kept three genuinely separate facts). An authenticated connection surviving an UNFRIEND or a BLOCK does not mean chat survives it: both `sendMessage()` and `_handleIncoming()` re-check freshly on every message, so chat stops the instant friendship ends or a block is recorded, with no separate "close the connection" step anywhere — the same independent-axes precedent 0.2.60 already established for presence/profile/interaction. 0.2.61 is deliberately LIVE ONLY: `application/LiveConversation.js` — named that, not `ChatHistory`, on purpose — holds a conversation's transcript purely in memory, with no `toJSON`/`fromJSON` at all; there is no store-and-forward, no relay, no server, and no offline delivery — `peer/PeerMessageBus.js#send()` already throws for a peer that isn't AUTHENTICATED right now, and nothing here queues around that throw. `ui/views/ChatView.js`, routed at `/chat/:identityId` and reached via a new "Chat" button on the Friends list in `ui/views/PeerConnectionsView.js`, is deliberately modest — one peer, one live transcript, a compose box, a Send button, no typing indicators/read receipts/reactions/editing/attachments/notifications. The flagship test (`tests/PeerChat.test.js`) runs Alice, Bob, and Charlie over a real, authenticated peer network and proves: Alice and Bob (FRIEND) exchange live chat in both directions; a captured, genuinely-valid message replayed twice is accepted once and ignored the second time; Charlie's authenticated connection cannot forge Alice as sender; Charlie (authenticated, never a friend) cannot establish chat merely by being connected, from either his own client or a raw honestly-attributed message; unfriending stops chat immediately even though the underlying connection stays AUTHENTICATED; blocking stops chat immediately even though FRIEND is still true underneath, and unblocking never disturbs the friendship it left untouched; reconnected/unblocked friends chat again with no new friendship ceremony; and disconnecting a peer makes sending fail immediately rather than queuing — proving 0.2.61 genuinely has no store-and-forward. Deliberately not in 0.2.61: message ordering/reliability guarantees beyond "reject stale, tolerate gaps" (still proposed, unscheduled), persistent local chat history (still proposed, unscheduled), and offline/store-and-forward messaging (0.2.63, proposed) — see docs/Principles.md, "0.2.61 Ships Live Chat, Not A Message Database."
- **Peer Connection Resilience & Reconnection (0.2.62)** — "a persistent peer relationship should survive a transient connection failure, while the connection itself remains ephemeral." Every milestone since 0.2.49 has already kept those two facts genuinely separate — `core/PeerRelationship.js` (0.2.56) remembers an identity, never an endpoint, and `application/ConnectedPeerRegistry.js` (0.2.50) is exactly as durable as the live connection it tracks. 0.2.62 doesn't touch either: it closes the one gap between them — "Known Peers" had no way to *reconnect* to a remembered identity at all beyond blindly repeating the anonymous "Invite Someone"/"Connect to Peer" flow, with no verification that whoever answered was actually them. `application/ConnectToPeerUseCase.js#connect()`/`#attach()` gain an optional `expectedIdentityId`, checked ONLY once a connection genuinely reaches `PeerLifecycleState.AUTHENTICATED` — never weakening 0.2.49's handshake itself, only adding one more gate after it, the same "additional gate, never a substitute for cryptographic verification" shape 0.2.60's blocking already established. A mismatch (a real, honestly-authenticating identity that simply isn't the one this device expected) closes the connection immediately and is reported through a new `onIdentityMismatch()` event — distinct from an ordinary handshake FAILURE, since the peer on the other end proved something completely real, just not what this attempt was for. `application/PeerReconnectionUseCase.js` (new) is the UI-facing "Reconnect" gesture built on top: it requires an existing `core/PeerRelationship.js`, walks the exact same invitation dance a first connection already does (`application/PeerSessionManager.js`, unmodified beyond threading `expectedIdentityId` through), and reacts to the result — never performing the identity check itself. A matched reconnect finally wires 0.2.56's own long-dormant `PeerRelationshipUseCase#noteAuthenticated()` to the moment it was built for, bumping `lastAuthenticatedAt`; a rejected one leaves the remembered relationship completely untouched. `application/ConnectedPeerRegistry.js`'s existing `connectionId`-keyed map, and `peer/PeerAuthenticationSession.js`'s own `sessionNonce` (already the connection's own id, unmodified since 0.2.49), already give every connection a distinct incarnation — 0.2.62 adds no second identifier for this; a stale event from an old, already-closed connection is structurally incapable of touching a new one's registry entry, and `tests/PeerConnectionResilience.test.js`'s own flagship proves it directly rather than merely assuming it. `ui/views/PeerConnectionsView.js` gains a "Reconnect" action on a Known Peer card that isn't connected right now, reusing the existing "My Peers" paste-reply completion step unmodified, plus an explicit, explained error when a reconnect is rejected — never a silently-vanishing card. The flagship test (`tests/PeerConnectionResilience.test.js`) proves: a closed connection disappears from the live registry while the remembered relationship survives untouched; Reconnect re-authenticates over a brand-new connectionId and is immune to a stale, belated event from the old one; a genuinely matching reconnect bumps `lastAuthenticatedAt` and labels the pending connection with the relationship's own alias; and the security flagship — a valid invitation belonging to Charlie authenticates completely honestly as Charlie, and is still rejected as a reconnect to the identity (Bob) this device actually remembers, with the rejection correctly attributed and the remembered relationship left completely untouched. Deliberately not in 0.2.62: message ordering/reliability guarantees, persistent local chat history, offline/store-and-forward messaging (all still proposed, unscheduled or 0.2.63 as noted above), and any automatic or background reconnection — Reconnect stays a deliberate, explicit gesture, exactly as manual as a first connection, on purpose.
- **Reliable Offline Messaging & Delivery State (0.2.63)** — answers the question 0.2.61 deliberately left open: "what happens to a message when the recipient isn't connected?" `application/ChatUseCase.js#sendMessage()` is completely unmodified — it still requires a live, `AUTHENTICATED` `ConnectedPeer` and still throws immediately if reachability fails, exactly as 0.2.61 left it. `#sendOrQueue()` (new) is a deliberately SEPARATE operation, addressed to a `peerIdentityId` rather than a connection: eligible (friend, not blocked) but unreachable right now, it writes a durable `core/ChatOutboxEntry.js` to the new `application/ChatOutbox.js` instead of throwing, then attempts an immediate flush in the same call so an already-online peer is sent to exactly as promptly as `sendMessage()` always was. Every outbox entry is addressed to the recipient's PROVEN IDENTITY, never a connectionId or endpoint — see `core/PeerRelationship.js`'s own 0.2.56 precedent, extended here — which is what makes reconnection the delivery trigger for free: `application/ChatUseCase.js#_attemptFlush()` rides the exact same `connectedPeerRegistry.onChange()` subscription 0.2.61 already used to `attach()` every peer to the bus, and asks only "is this identity `AUTHENTICATED` right now" — never "is this the connection I queued against." Combined with 0.2.62's `expectedIdentityId` guard, this produces a security property with no new enforcement code: if a "Reconnect" attempt authenticates as the wrong identity, the flush is invoked with THAT identity's own proven id, which matches no outbox entry addressed to the one actually expected — mail is neither misdelivered nor lost. Delivery is tracked as three genuinely different facts (`core/ChatDeliveryState.js`: QUEUED, SENT, DELIVERED, EXPIRED) — SENT means "handed to `peer/PeerMessageBus.js#send()`," never "the recipient has it"; a brand-new, separate wire protocol and vocabulary, `core/ChatDeliveryAck.js` (`ChatUseCase.ACK_PROTOCOL`, never folded into `core/ChatMessage.js` or `forkbuild:chat` itself), is what actually confirms DELIVERED. The receiving side acknowledges every chat message it accepts, fresh or an exact already-seen duplicate alike, which is what makes a retransmit after a dropped connection harmless without any sender-side retry/timeout system: `core/ChatReplayWindow.js` (0.2.61, untouched) already rejects the duplicate content; the ack simply still goes back. An entry whose TTL elapses before either happens (`core/ChatOutboxEntry.js#isExpired()`, checked lazily on read, never on a timer) is dropped as EXPIRED; a DELIVERED entry is removed from storage the instant it's acknowledged — the outbox tracks only mail still in flight, never becoming a message database, and `application/LiveConversation.js` itself stays exactly as non-durable as 0.2.61 left it. `ui/views/ChatView.js`'s compose box now calls `sendOrQueue()` unconditionally (no more "not connected" block on the input) and shows each outgoing bubble's own Queued/Sent/Delivered/Undelivered label. The flagship test (`tests/OfflineMessagingDeliveryState.test.js`) runs Alice and Bob as real, authenticated friends and proves: `sendMessage()` still fails outright against an offline peer, byte for byte matching 0.2.61's own Scenario G; `sendOrQueue()` against an offline friend queues durably instead of throwing; reconnection automatically flushes the outbox and the sender learns DELIVERED via a genuine ack round-trip; retransmitting an already-delivered message stays harmless; multiple queued messages flush in the sender's own sequence order; and the security flagship — a "Reconnect" that genuinely authenticates as Charlie instead of the expected Bob never triggers delivery to Charlie and never loses Bob's still-QUEUED mail, which the real Bob receives intact once he actually reconnects. Deliberately not in 0.2.63: read receipts, typing indicators, unread counters, message editing/deletion, attachments, and any cross-device/multi-recipient delivery — the outbox is a single-owner, single-recipient, best-effort store, never a message database or a relay.
- **Decentralized Peer Discovery (0.2.64)** — answers the question 0.2.50 deliberately left open under a misleadingly-complete name: "Peer Discovery & Rendezvous" actually only ever shipped rendezvous — an out-of-band invitation, copy-pasted through a channel this app never touches. 0.2.64 is genuine discovery: finding a candidate for an identity ALREADY known, without ever letting that finding become trusted. The vocabulary stays exactly the one docs/Principles.md already drew for invitations, extended rather than replaced: Discovery ("something claiming to be Bob may be reachable here") → Rendezvous ("here is an endpoint worth attempting") → Authentication ("this connection actually belongs to Bob") — only the third is ever authoritative. `peer/PeerDiscoveryRecord.js` gains its own explicit freshness, `expiresAt`/`isExpired()`, checked lazily on read exactly like `core/ChatOutboxEntry.js`'s own TTL (0.2.63) — a SEPARATE clock from a `peer/PeerInvitation.js`'s own expiry, which still only gates whether a record is created at all; a record's own expiry answers whether it is STILL worth attempting, defaulting to the invitation's own `expiresAt` when one produced it. `peer/LocalPeerDiscoveryProvider.js` prunes expired records lazily (never on a timer) and deduplicates: re-importing the identical candidate (same endpoint + identityHint) refreshes the existing record rather than accumulating a second one, while a genuinely different endpoint claiming the same identity is kept as a separate, independently-evaluated candidate. `peer/PeerDiscoveryProvider.js#discover(identityId)` (new) is a search over exactly what this device has already imported — never a live network lookup; `peer/PeerDiscoverySource.js` grows LAN/RENDEZVOUS_SERVICE/DISTRIBUTED as named-but-unimplemented sources, on purpose (see this milestone's own scope note below). `application/FindPeerUseCase.js` (new) is the "Alice searches for Bob" pipeline: `search(identityId)` delegates straight to discovery, returning candidates Alice has already imported; `connect(record, identityId)` always threads the identity Alice SEARCHED FOR as `expectedIdentityId` into `application/ConnectToPeerUseCase.js`'s existing 0.2.62 gate — regardless of what the candidate's own (untrusted) `identityHint` claims — so a discovery record that says "Bob" but whose endpoint actually answers as Charlie is closed the instant that becomes provable, exactly as honestly as Charlie authenticated, and reported through a new `onCandidateRejected()` event mirroring `application/PeerReconnectionUseCase.js`'s own `onReconnectRejected()`. Nothing about a rejected or even a successful discovery-led connection ever auto-creates a `core/PeerRelationship.js` — see `application/PeerRelationshipUseCase.js`'s own unmodified 0.2.56 doctrine, "Remembering A Peer Is A Deliberate Act, Never A Side Effect Of Authentication": discovery, connection, and remembering stay three genuinely separate acts. `application/PeerSessionManager.js` gains `importCandidate()` (add a candidate to the pool without connecting), `discoverCandidates()`/`listCandidates()`/`forgetCandidate()`, and `connectToDiscovered()` (the same WebRTC offer/answer handoff `acceptInvitation()` already walks, now starting from an already-discovered record instead of a freshly-pasted invitation). `ui/views/PeerConnectionsView.js` gains a "Find a Peer" section — Add a Candidate (import without connecting), Find Someone (search by identity, never displaying a name before authentication — every result is labeled "Discovered," not a name), and Connect, which runs the real handshake and surfaces a rejection exactly like a rejected Reconnect does. The flagship test (`tests/PeerIdentityDiscovery.test.js`) proves: an expired candidate is pruned lazily and never returned as usable; rediscovering the same candidate refreshes rather than duplicates it; a genuine candidate for Bob connects and authenticates as Bob while still requiring an explicit Remember to become a relationship; and the security flagship — a discovery record claiming to be Bob, whose endpoint actually belongs to Charlie, has Charlie authenticate completely honestly, gets rejected and closed on both ends, and leaves Bob's own already-remembered relationship (identity, public key, `lastAuthenticatedAt`) completely untouched, with Charlie never mistakenly remembered as anyone either. Deliberately not in 0.2.64: any real distributed lookup — LAN broadcast, a rendezvous service, or a DHT/gossip network (`PeerDiscoverySource` names LAN/RENDEZVOUS_SERVICE/DISTRIBUTED precisely so none of those require a vocabulary change later, exactly like `PeerDiscoverySource.INVITATION` already worked before this milestone); discovery ever conjuring a candidate this device didn't already import; and any change to 0.2.63's offline-queued delivery — a `QUEUED` message stays `QUEUED` until a fresh, authenticated, expected-identity connection actually delivers it, discovery or not.
- **Distributed Peer Rendezvous (0.2.65)** — makes discovery genuinely networked while keeping it exactly as untrusted as 0.2.64 left it: RENDEZVOUS DISTRIBUTES CANDIDATES; AUTHENTICATION ESTABLISHES IDENTITY. `peer/RendezvousTransport.js` (new base class, mirroring `peer/PeerConnectionProvider.js`'s own throwing-stub shape) names a deliberately tiny protocol — PUBLISH, LOOKUP, REMOVE — with one concrete implementation, `peer/LocalRendezvousNetwork.js`, an in-memory node any number of `peer/RendezvousDiscoveryProvider.js` instances can share, standing in for a future real rendezvous server exactly the way `peer/LocalPeerConnectionProvider.js` already stands in for real WebRTC. `peer/RendezvousPublication.js` is the one message the protocol ever sends: nothing but an ordinary `peer/PeerInvitation.js` (still never a credential) plus publish bookkeeping, whose own `expiresAt` can never outlive the invitation it wraps regardless of what ttl is requested — publications stay deliberately short-lived, so the network can never become a permanent directory of "Bob currently lives here." `LocalRendezvousNetwork` holds AT MOST ONE live publication per identity, keyed by `identityHint`: a fresh PUBLISH for the same identity simply replaces whatever was there, which is what makes "newer publication replaces older candidate" fall out of the storage model itself rather than needing separate enforcement code — while `RendezvousDiscoveryProvider`'s own LOCAL cache still keeps a genuinely different endpoint for the same identity as a separate, independently-evaluated candidate, unchanged from 0.2.64's own dedup discipline. `RendezvousDiscoveryProvider#discover(identityId)` is the first PeerDiscoveryProvider that issues a REAL network LOOKUP rather than a search over what was already imported — and does so safely against a hostile or merely flaky network: a transport failure degrades to whatever this device already cached rather than throwing (`discover()` never fails loud), and a single malformed or malicious publication (missing fields, garbage JSON — exactly what a broken or hostile rendezvous node could hand back) is skipped per-entry, never allowed to crash the whole lookup, the same failure-isolation discipline `spatial/DecentralizedSpatialDiscoveryProvider.js` already established for a much larger trust pipeline. `publish()`/`unpublish()` are the new PUBLISH/REMOVE verbs — "make me findable" and "stop being findable," genuinely new acts 0.2.50 through 0.2.64 never needed because out-of-band relay never required announcing yourself to anything. `peer/DiscoveryBootstrap.js` (new) answers the bootstrap problem explicitly rather than hard-coding one permanent discovery authority: itself just another `PeerDiscoveryProvider`, it fans `importInvitation()` to a local provider (an imported bootstrap invitation is simply a peer, nothing new needed) and `discover()`/`list()` to that same local provider PLUS every configured bootstrap provider (today: one or more `RendezvousDiscoveryProvider` instances; tomorrow: LAN, a DHT, anything satisfying the same contract) — tolerating any one of them throwing without losing the others' results, and never collapsing two different providers' genuinely different candidates for the same identity into one. `application/FindPeerUseCase.js` and `application/PeerSessionManager.js` needed ZERO changes: both already depended only on the `PeerDiscoveryProvider` interface, so a `RendezvousDiscoveryProvider` or a `DiscoveryBootstrap` slots in as a drop-in replacement for `LocalPeerDiscoveryProvider` — proof the 0.2.50 seam was already exactly where it needed to be. `peer/PeerDiscoverySource.js`'s `RENDEZVOUS_SERVICE` value is implemented for the first time here; `DISTRIBUTED` stays deliberately reserved for an actual DHT/gossip milestone. The flagship test (`tests/DistributedPeerRendezvous.test.js`) has Alice search for Bob across a `DiscoveryBootstrap` of two real rendezvous nodes plus her own local pool: a stale local candidate is pruned silently, a malformed candidate from a broken third node is skipped silently, a malicious candidate (Charlie, published under Bob's own identity on node A) authenticates completely honestly as Charlie and is rejected by 0.2.62's `expectedIdentityId` gate exactly like 0.2.64's own flagship, and Bob's genuine candidate (published independently on node B) authenticates as Bob and only THEN, by an explicit Remember, becomes a relationship. Deliberately not in 0.2.65: Kademlia/DHT, cryptographically signed distributed records, Sybil resistance, or proof-of-work — those are architecture-level choices for a real `DISTRIBUTED` implementation to make later, deliberately deferred until the untrusted-discovery/authoritative-authentication split proves itself at network scale first.
- **Real Network Rendezvous & NAT Traversal (0.2.66)** — turns 0.2.65's distributed rendezvous abstraction into something an actual deployment can run over the open Internet, without the rendezvous service ever becoming an authority. `peer/WebSocketRendezvousTransport.js` is the first REAL (not in-memory) `peer/RendezvousTransport.js`: a small, fully-documented client-side wire protocol (PUBLISH/LOOKUP/REMOVE JSON frames over one WebSocket, correlated by `requestId`) against a server this codebase deliberately ships no implementation of — the same "as stupid as `LocalRendezvousNetwork`'s own in-memory Map" restraint 0.2.65 already established, now actually reachable over a real socket. Because a genuine network round trip cannot be synchronous, `peer/RendezvousTransport.js`'s own contract (and everything layered directly on it — `RendezvousDiscoveryProvider#discover/publish/unpublish`, `DiscoveryBootstrap#discover/publishToAll`, `DiscoverPeersUseCase#discover/publish/unpublish`, `PeerSessionManager#discoverCandidates`, `FindPeerUseCase#search`) became `async`, one layer at a time, exactly the same propagation discipline 0.2.51's own WebRTC signaling already established elsewhere in this codebase; `DiscoveryBootstrap#discover()` now fans every configured bootstrap node out CONCURRENTLY (`Promise.allSettled`) rather than serially, so querying N rendezvous nodes costs roughly the slowest ONE of them. `peer/RendezvousPublication.js` gains one OPTIONAL field, `signature` (`core/RendezvousPublicationEnvelope.js`, `peer/RendezvousPublicationSigning.js`, `identity/LocalAuthorizationVerifier.js#verifyRendezvousPublication`, new `SignatureType.RENDEZVOUS_PUBLICATION`): a device can sign its own outgoing publication, and a receiver discards one that claims a signature but doesn't actually verify, or whose signer doesn't match its own `identityHint` — tamper-evidence one layer before `PeerAuthenticationSession` would ever run, never a replacement for it, and never mandatory (an unsigned publication is exactly as valid as 0.2.65 ever made it). `peer/IceServerConfig.js` and `peer/RendezvousConfig.js` are the configuration seams this milestone's design explicitly asked for: STUN defaults to two public Google servers (free, public NAT-discovery infrastructure, wired straight into `peer/WebRtcPeerConnectionProvider.js`'s own pre-existing `iceServers` constructor option — unused until now), TURN ships with no default at all, and the rendezvous bootstrap list (`DEFAULT_RENDEZVOUS_URLS`) is EMPTY by default — a fresh checkout behaves exactly as every prior milestone already did until an operator deliberately configures a real URL, never one hard-coded authority every deployment would otherwise depend on. `application/PeerSessionManager.js#publishSelf()`/`stopPublishing()` and `application/FindPeerUseCase.js`'s own passthroughs are the first LIVE wiring of any of this into the running app (`ui/main.js`, a new "Be Discoverable" section on `/peers`) — `publishSelf()` documents its own real limitation plainly rather than hiding it: one publication answers AT MOST ONE inbound connection attempt, inherent to `WebRtcPeerConnectionProvider`'s one-offer/one-answer design and its complete lack of an ambient "listen for anyone" channel; solving many-peers-per-publication is explicitly left to a future signaling relay. The flagship test (`tests/RealNetworkRendezvous.test.js`) runs two independent `PeerSessionManager` instances, each with its own REAL `RTCPeerConnection` pair, discovering each other ONLY through a simulated real-network rendezvous round trip (a `FakeWebSocket`/`FakeRendezvousServer` pair exercising the actual client wire-protocol code, never a shortcut around it) — a malicious publication points Bob's identityId at Charlie's own, completely genuine endpoint, Charlie authenticates completely honestly as himself and is rejected, and Bob's independently-published genuine candidate authenticates as Bob: RENDEZVOUS DISTRIBUTES CANDIDATES; AUTHENTICATION ESTABLISHES IDENTITY, unchanged, now proven over a genuinely networked transport rather than an in-memory one. Deliberately not in 0.2.66: automatic friendship or peer-remembering from discovery, chat/message relay or store-and-forward through the rendezvous network, a global/permanent identity directory, a reference rendezvous SERVER implementation (this codebase ships the client protocol only — see `peer/WebSocketRendezvousTransport.js`'s own header), and voice/video (a natural later application of an authenticated WebRTC channel, not this milestone's).

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
- [x] 0.2.46  Local Identity & Authentication Session
- [x] 0.2.47  Identity Security & Key Protection
- [x] 0.2.48  Portable Identity, Export, Import & Recovery
- [x] 0.2.49  Authenticated Peer Connection Model
- [x] 0.2.50  Peer Discovery & Rendezvous
- [x] 0.2.51  Real WebRTC Peer Transport & Signaling Handoff
- [x] 0.2.52  Authenticated Peer Messaging & Protocol Multiplexing
- [x] 0.2.53  Peer-Based Avatar Presence
- [x] 0.2.54  Peer-Based Avatar Profile Synchronization
- [x] 0.2.55  Peer Connections & Rendezvous UI
- [x] 0.2.56  Persistent Peer Relationships
- [x] 0.2.57  Decentralized Friend Relationships & Mutual Consent
- [x] 0.2.58  Friend-Aware Privacy & Social Visibility
- [x] 0.2.59  Peer-Based Avatar Social Transport
- [x] 0.2.60  Friendship Revocation, Blocking & Privacy Withdrawal
- [x] 0.2.61  Direct Peer Messaging & Live Chat
- [x] 0.2.62  Peer Connection Resilience & Reconnection
- [x] 0.2.63  Reliable Offline Messaging & Delivery State
- [x] 0.2.64  Decentralized Peer Discovery
- [x] 0.2.65  Distributed Peer Rendezvous
- [x] 0.2.66  Real Network Rendezvous & NAT Traversal
- [x] 0.2.67  Identity Lifecycle Hardening
- [x] 0.2.68  Identity Lifecycle Propagation
- [x] 0.2.69  Reliable Offline Conversations
- [x] 0.2.70  Presence & Conversation Lifecycle

Nested Groups remains optional and is not on the roadmap yet — the flat-group model has proven sufficient through 0.1.50. Automatic collision resolution (silently relocating onto a free cell), geometric/bounds-based collision detection, box selection/collision geometry/polygon regions/spatial clustering in the location browser, fully wiring the decentralized spatial index as the World View's actual document-resolution backend ("spatial streaming/index integration," proposed, not started — 0.2.30 already connects its trust/diagnostics vocabulary as an optional, additive source), an indexed metadata representation for description search at real decentralized scale, license/tag filters, cross-page grouping, and infinite scroll (deliberately not implemented — see docs/Principles.md) are similarly deferred until real usage shows each is actually needed — see docs/Roadmap.md. (A real, immutable, content-addressed publication preview is no longer on this list — 0.2.32 concluded a signed preview was never the right design; see docs/Principles.md, "Previews Are Derived Client State.")

## License

Mozilla Public License Version 2.0
