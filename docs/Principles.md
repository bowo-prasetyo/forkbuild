Core modules must not depend on infrastructure.

Everything is replaceable through interfaces.

The browser is a client, not the owner of the game state.

The ForkBuild Protocol is platform-independent.

Build small, refactor often, keep every milestone runnable.

Prefer composition over inheritance.

Version the protocol independently from the application.

Application orchestrates; Core provides capabilities. Use cases, wiring,
and editor workflows live in application/. Domain data, rules, and the
event machinery that lets Core announce what happened live in core/ —
even when application/ is what constructs and wires that machinery
together (see docs/Architecture.md on why EventBus lives in core/events/
rather than application/events/).

Event vocabulary lives at the lowest layer both the publisher and every
subscriber can reach, without either depending on the other. Not "events
always belong in core/" — that would be a rule about a folder, not about
the actual dependency graph. Ask instead: who needs to understand this
vocabulary? DomainEvent lives in core/ because World (core/) publishes
it and renderer/ subscribes to it — core/ is the only layer both can
reach. EditorEvent lives in core/ for the identical reason, one
milestone later. But CommandHistoryEvent lives in application/, not
core/ — both its publisher and its only subscriber are already in
application/. Same rule, different answer, because the question is
always about who's actually listening, not a hardcoded default.

A behavior with two surfaces needs one math source (0.1.47). When the
keyboard and the pointer must produce identical results, they share one
module — TransformMath — rather than each carrying its own copy. Parity
should be a property of construction, not a bug class discovered later:
if two code paths compute the same concept twice, they will eventually
disagree. This generalizes: one gesture transaction, one bounds
calculation, one pivot rule — every "where could this diverge?" gets
answered by deleting the second copy, not by testing both harder.

When a lower layer needs logic owned by a higher layer, inject it across
the boundary — never import upward (0.1.47). renderer/ needed
TransformMath, which lives in application/; the use case that constructs
the gizmo controller simply hands the module down as a collaborator. The
renderer keeps its renderer -> core dependency direction, the math exists
exactly once, and no file had to move. Injection is the pressure valve
that keeps "never import upward" livable — and if a second lower-layer
consumer ever appears, the correct response is to lower the shared file
into core/, still never to copy it.

Actions are not commands (0.1.50). An Editor Action describes an
available user operation and may invoke session state changes, existing
commands, or transient UI behavior. CommandHistory records only
document/world mutations. The action layer must never become a second
history or mutation system — some actions produce commands, most don't,
and the registry itself touches neither CommandHistory nor the World.

One operation, one definition, every surface (0.1.50). If an operation
exists in one editing surface, its definition — id, label, shortcut,
availability rules — is shared by all of them through the
EditorActionRegistry. Keyboard dispatch, the command palette, the
sidebar, and the controls documentation all read the same metadata. A
second shortcut table is a bug waiting to drift.

A document snapshot is the authoritative portable representation of a
world (0.2.0). Not Vue state, not Three.js objects, not command history,
not editor session, not renderer state — the serialized document envelope
is the single artifact that crosses every boundary: file, publish,
network. Everything else is a consumer or mechanism around it.

Migration happens before domain entry (0.2.0). Old-format compatibility
code lives in the schema migrator, never in Brick, Group, World, or any
editing service. Domain classes only ever see current-schema JSON.

Save is not Publish (0.2.0). Saving persists the editable document
(mutable, overwriteable). Publishing creates an immutable, validated,
versioned snapshot. These are different operations with different storage
paths, different semantics, and different lifetimes. Conflating them
makes mutation isolation impossible.

Publishing validates before storing (0.2.0). A corrupt document must not
enter the published corpus. The DocumentValidator runs as part of the
publish pipeline, and refusal is a hard error, not a warning.

Migration happens before domain entry (0.2.2). Old-format compatibility
code lives in the schema migrator, never in Brick, Group, World, or any
editing service. Domain classes only ever see current-schema JSON. This
is the cardinal rule that keeps the domain clean as the protocol evolves.

Validation is independent of the UI (0.2.2). DocumentValidator is pure:
no Vue, no Three.js, no session, no browser APIs. Given only a plain
object, it answers "is this structurally a valid ForkBuild document?"
The same validator runs from file import, server receipt, published-world
loading, and test suites. The validation result is the same regardless
of context.

Publishing creates an immutable snapshot, not a boolean flag (0.2.3).
A Publication represents a specific point-in-time capture of a Document,
stored immutably and independently. Editing the source document after
publishing never modifies the publication. Unpublishing removes the
publication without touching the source. This separation is what makes
read-only published worlds, spatial placement, and collaboration
possible without conflating "what is being edited" with "what has been
released."

Spatial location is a property of placement, not publication (0.2.5).
A published world does not intrinsically exist at a global coordinate.
Instead, a WorldPlacement references a Publication and assigns it a
position in shared space. Moving a world never mutates the Publication
or Document, never changes the content hash, and never requires
republishing. Multiple placements can reference the same publication.
This separation is what lets the same published world exist in multiple
locations and be discovered by other clients without contaminating the
document model with global coordinates.

Recovery protects work without redefining domain truth (0.2.6). Autosave
checkpoints exist to protect unsaved work from application failure. They
are not publications, do not alter publication state, and do not replace
the user's explicitly saved document automatically. Recovery data enters
the domain through the same migration and validation pipeline as every
other persisted document.

Save, autosave, and publish have different semantics (0.2.6). Save
persists the user's deliberate editable state; autosave protects recent
unsaved work; publish creates an immutable released snapshot. None of
these operations is a substitute for another.

Collaboration transmits commands, not documents (0.2.7). The unit of
exchange between collaboration participants is the serialized command,
wrapped in a protocol envelope. Entire document snapshots are for
loading and publishing, not for real-time synchronization. This keeps
the collaboration layer aligned with the command architecture: every
mutation is already a serializable, replayable, undoable command.
Adding collaboration means adding a transport for those commands, not
inventing a second mutation system.

A Publication is never edited (0.2.8). Editing a published world is an
explicit fork operation that produces a new, independent, editable
Document. The original Publication, its snapshot, and its WorldPlacement
remain completely untouched. This separation is what makes the content
lifecycle safe: nobody can accidentally overwrite someone else's
published work by editing in the World View.

Concurrent edits are resolved by authoritative ordering, not by
transforming commands (0.2.9). A DocumentAuthority receives all
operations, checks them against the current authoritative state, and
either applies or rejects them. Non-conflicting operations (different
bricks, different positions) are applied regardless of baseRevision.
Conflicting operations (missing bricks, occupied positions) are rejected
with a structured reason. This keeps the collaboration layer simple and
correct without requiring full Operational Transform or CRDT — the
common cases are handled by conflict detection, and the rare conflicting
case is surfaced to the user rather than silently transformed.

Placement is a separate, publishable spatial record (0.2.10). A
PlacementRecord wraps a WorldPlacement with identity, ownership,
revision, and integrity metadata. It can be stored in IPFS, Arweave,
a blockchain, or any content-addressed store. The PlacementRegistry
adapter handles storage and discovery; the SpatialIndexProvider handles
spatial queries. These are separate concerns. Moving a placement changes
the PlacementRecord, not the Publication, not the Document. The three
ownership layers (Document author, Publication author, Placement owner)
are distinct and can be different people.

The World View discovers placements first; publications and snapshots
are resolved only for spatially relevant placements (0.2.11). Content
is never scanned wholesale. The spatial discovery pipeline returns
lightweight PlacementRecords; the caller decides which publications to
actually load. This separation is what makes the architecture scalable:
with 10 million publications and 500,000 placements near the user, the
client queries 500,000 spatial records, not 10 million snapshots.

Runtime state is distinct from decentralized truth (0.2.12).
PlacementRecord is the durable, discoverable truth of where a publication
exists. LoadedWorld is the ephemeral runtime state of that placement in
a specific client's memory. The fact that a client currently has a
castle loaded in memory must never become part of the protocol or
travel over the network.

Published content is identified by its content hash, not its storage location (0.2.14).
A Publication references immutable content through a cryptographic ContentReference.
IPFS, Arweave, HTTP gateways, local storage, and future backends are retrieval
mechanisms rather than content identities. Retrieved bytes must always be verified
against the publication's expected content hash before deserialization.

The spatial index is a discoverability accelerator, not truth (0.2.15).
The PlacementRecord is the authoritative spatial record; a spatial
index — local, IPFS, Arweave, or otherwise — exists so placements can
be FOUND without scanning the entire world. An index entry pointing
at an old revision is not an error: resolve the referenced record,
compare revisions, and let the newer revision win. Treat a stale or
disagreeing index the way you would treat a stale database index —
never as the row itself.

Decentralized records are immutable; pointers move (0.2.15). A new
placement revision is a new immutable object with a new content
identity — never a rewrite of the previous revision. What moves is a
mutable pointer (the registry's latest record, the index root
reference), never the content. This is what makes history, caching,
replication, and eventual consistency tractable once storage is
genuinely decentralized.

Hashes establish what an object is; signatures establish who
authorized it (0.2.16). A content hash can prove a PlacementRecord has
not changed — it cannot prove Alice created it. An immutable object is
authoritative only when its content hash AND its authorization
signature are both valid AND the signer was authorized for that
operation. Each condition is checked independently, and each failure
has a named reason.

Newer VALID revision wins — never merely "newer revision wins"
(0.2.16). A revision may only displace another after passing integrity
and signature authorization. This single rule is what keeps forged
revisions from hijacking placements once more than one node can
publish index entries.

Sign canonical data, with domain separation (0.2.16). ForkBuild never
signs arbitrary serialized JSON. Every signature covers the canonical
envelope { domain, type, id, revision, payload } constructed in fixed
property order — so the same semantic object can never produce two
different signatures, and a signature for one object type can never be
replayed as another. The signature itself carries no unsigned claims.

Cryptographic semantics precede infrastructure (0.2.16). Establish WHO
SIGNED with a local, vector-verified primitive first; wallets, DID
networks, key rotation, and revocation are later adapters around the
same IdentityProvider/AuthorizationVerifier seam — not a prerequisite
for the trust model.

### Signatures vs. Authorization (0.2.17)
Signatures establish *who acted*; authorization establishes *whether they were allowed to act*. 
A valid signature alone is insufficient for delegated operations. When an actor is not the resource 
owner, the actor must present a valid delegation signed by the authority that owns the resource.

Direct ownership remains the simplest authorization path. Delegation adds narrowly scoped authority 
without transferring ownership. `PLACE` and `MOVE` are separate capabilities. Possessing permission 
to place a publication does not automatically grant permission to move an existing placement.

Delegations are immutable and independently verifiable. Revocation, delegation chaining, and 
distributed policy consensus are deliberately outside 0.2.17.

### Replication and Conflict Handling (0.2.18)

Decentralized replication never overwrites immutable history.
Replicas exchange immutable revisions and reconcile them using causal
ordering.

A causally newer valid revision supersedes the revision it follows.
Concurrent valid revisions are not corruption: they represent
independently authorized histories created without knowledge of one
another.

Concurrent revisions are retained in a ConflictSet and a deterministic
conflict policy selects a presentation winner. The losing revision is
never deleted and remains independently verifiable.

Replica convergence must depend only on the set of valid immutable
objects, never on arrival order, wall-clock time, network topology, or
which replica happened to process an object first.

Integrity, signature, and authorization are evaluated before a revision
participates in conflict resolution.

Equal causal position with different content is still a conflict
(0.2.18). Two revisions can carry identical causal stamps — most
commonly two edits from the same signer's two disconnected devices,
each simply advancing that signer's own vector-clock component from
the same parent — and still disagree on content. That carries exactly
as little ordering information as a genuine concurrent edit, so it is
resolved identically: a ConflictSet, never a silent drop. The same
rule is what keeps two legacy (pre-0.2.18, uncausaled) revisions with
different content safe rather than one silently vanishing.

A conflict set only ever grows (0.2.18). When a third revision arrives
concurrent with an already-recorded conflict, its members are widened
— read back from the registry and unioned with the new arrival — never
replaced by a fresh two-member set. No competing valid history is ever
dropped from a placement's conflict set merely because another
revision showed up later.

### Trust Is Separate From Cryptographic Validity (0.2.19)

A valid signature proves that a private key authorized an object. It
does not prove that the key is trusted, that the object is current, or
that the object was the only object signed at that causal position.

Trust policy therefore remains separate from cryptographic verification.

No untrusted observation may mutate authoritative replicated state.
Untrusted objects may be retained for diagnostics, but they cannot
become current state merely because they are correctly signed.

Historical validity and current eligibility are separate properties.
An old immutable revision remains verifiable forever without becoming
the current revision when replayed.

### Arrival Order Is Never Trust (0.2.19)

Network arrival order is an observation of transport, not evidence of
authority, freshness, or causality.

Two replicas receiving the same authenticated objects in different
orders must produce the same authoritative state and the same trust
observations.

### Identity Is Not Trust (0.2.19)

did:key identifies a public key. Trust policy decides whether that key
is trusted. A perfectly valid Ed25519 key can belong to an attacker —
verifying WHO signed something is a prerequisite for trust, never a
substitute for deciding whether that signer is trusted at all
(identity/TrustPolicy.js).

### A Discovery Provider Must Never Say Only "Not Found" (0.2.19)

NOT_FOUND, index-stale, unavailable, invalid, unauthorized, and
conflicted are different situations with different remedies. Collapsing
them into a single failure mode — or a scattered set of ad hoc strings
— makes a decentralized environment's failures illegible. Every check
in the trust pipeline produces a core/TrustObservation.js with a named
TrustStatus; discover()'s return type never changes, but
getLastDiagnostics() always has a structured account of what was
checked and what happened.

### A Valid Signature Proves Authorship, Not Exclusivity (0.2.19)

An authority can sign two different objects at the same causal
position and both signatures verify — that is equivocation
(core/IndexEquivocation.js), not a forgery. Equivocation is detected
and reported, never silently resolved by picking one side and
discarding the evidence; whether a detected equivocation is tolerated
or rejected is a TrustPolicy decision, made explicitly, not a side
effect of whichever root a replica happened to load first.

### A Published Snapshot Is Never Mutated In Place (0.2.20)

A published World View is immutable; a World View SESSION is editable.
Opening a published snapshot never makes the snapshot itself editable
— the first mutation crosses the publication boundary and creates a
new Document derived from that snapshot (Copy-on-Write / Fork-on-Edit).
The mutation is applied only to the derived fork, lazily, on the first
command that actually changes state — never on navigation, camera
movement, selection, hover, or inspection, and never eagerly the
moment a published world is opened.

This is the same rule 0.2.8 already established for the Editor
("A Publication is never edited") — extended to hold structurally, not
merely by convention, inside the shared spatial World View, where a
single session streams many worlds in and out and previously had no
mechanism distinguishing "a world I may edit in place" from "a world I
am only viewing."

### Forking Creates Provenance, Not Publication (0.2.20)

Forking a published world produces a new, independently-owned,
editable Document — never a new Publication. A Publication is only
created when that fork is explicitly published, exactly like every
other editable Document in ForkBuild. Fork provenance (which document
this one was derived from) and publication lineage (which publication
that document's own later publish created) are recorded the same way
0.1.24/0.2.8 already record them — parentDocumentId — not a second,
parallel mechanism invented for this milestone.

Ownership never bypasses this boundary: the original author editing
their own already-published world is not a special case. A Publication
represents a specific point in time; even its own author must fork to
move past it, exactly as forking a Git commit does not rewrite it.

Fork policy still governs whether the fork may happen at all (0.2.13):
a license that forbids forking rejects the mutation outright, the same
way the explicit "Fork" action already does — lazy fork-on-edit is not
a second, laxer path around that policy.

### A Default Value Is Not An Absent One (0.2.21)

A new document's title reading "Untitled" is a choice the system made
on the user's behalf, not evidence the user hasn't set one — those are
different facts, and only one of them has authorization consequences.
License already drew this line the same way: UNSPECIFIED is a real,
explicit value distinguishable from "no license object at all," never
`null`. 0.2.21 extends it to the rest of a document's metadata —
description defaults to `''`, never `null`, and every field a user can
edit has a real value from the moment a Document exists, so "what did
the user actually set" is never answered by string-matching a
placeholder.

### Status Is Computed, Not Stored (0.2.21)

A document's lifecycle status — Draft, Saved, or Published — is never
its own field, checkbox, or enum written to storage. It is computed
fresh, every time, from facts that are already tracked for other
reasons: whether a save has happened (DocumentState/CommandHistory),
and whether a Publication exists for this document (the same
discovery lookup 0.2.20's fork-on-edit guard already performs). Two
sources of truth for the same fact is how they drift; one function
(application/DocumentLifecycleStatus.js) computing status from state
that would already have to exist anyway is how they can't.

### Explaining A Decision Is Not Optional Once The System Can Make One (0.2.21)

0.2.13 gave the system the ability to refuse an edit (fork policy);
0.2.20 made that refusal load-bearing (fork-on-edit actually enforces
it). Once a system can say no, telling the user why is not a UI nicety
layered on afterward — it is the other half of the same feature. Every
surface that can reject a mutation exposes a structured reason
(WorldNavigationSession.getEditabilityNotice /
getDocumentInfo().editabilityNotice) the UI renders in plain language,
proactively, before the user hits the rejection — not only reactively,
after an uncaught error already broke whatever they were doing.

### The Displayed Document Is The Active Document (0.2.22)

There is exactly one active document for a World View session at any
moment, and every observable thing — the title shown, the browser
route, which document the inspection panel describes, which document
the NEXT mutation lands on — reads from that single fact
(`getActiveDocumentId()`), never a value captured once and left to go
stale. 0.2.20 made fork-on-edit switch the session's INTERNAL notion
of which document is being edited; it did not follow that a UI bound
to something captured at mount time (a route param, an initial title
lookup) would keep displaying the document that was just superseded
— correct enforcement with a visibly wrong screen is not a solved
problem, it's a hidden one. Whatever a session considers "active" must
be re-derived on every observation, not cached at the moment a session
began, or the two will disagree the first time the active document
changes without the component remounting.

### A Fork Is Not A Modal Interruption (0.2.22)

Lazy fork-on-first-mutation (0.2.20) exists specifically so that
editing a published world feels like editing, not like requesting
permission first. A confirmation dialog on the first drag would defeat
that. The system still tells the user what happened — a transient
notice after the fact ("Created your own editable copy"), a persistent
status line for as long as they're looking at the fork ("Editing
fork — forked from …") — but never a blocking prompt in the middle of
a gesture already in motion. Denial is the one case that DOES interrupt
outright, because there the alternative isn't "explain after the
fact," it's "let the user think something happened that didn't."

### A Publication Is What; A Placement Is Where (0.2.23)

Title, description, license, and content answer "what is this world" —
they live on the Document/Publication and change only by editing and
republishing it. Position answers "where does this world sit in
shared space right now" — it lives on a PlacementRecord, entirely
separate from the Publication it points to (core/WorldPlacement.js:
"a WorldPlacement does NOT own a world. It points to one via
publicationId"). Neither the World View UI nor the domain model may
blur that line: coordinates never become a document metadata field,
and a Document Properties edit never touches where anything is
standing. The distinction is what makes a single published work
placeable in more than one location — an exhibition copy here, a
personal copy of the same publication there — without meaning two
different documents, or one document pretending it has two locations
at once.

### Moving A Placement Is Not Editing A Document (0.2.23)

Repositioning a published world in shared space is not a document
mutation: it never forks the Publication, never requires the fork
policy (0.2.13) that governs actually editing one, and works
identically whether the underlying document has ever been forked or
not. This is a deliberate consequence of keeping placement and
publication separate (see above) — a mutation that only ever touches
a PlacementRecord has nothing to fork, because a PlacementRecord was
never immutable-until-forked to begin with; it is versioned by
revision (0.2.10), signed per revision (0.2.16), and causally stamped
per revision (0.2.18) — its own, independent lifecycle, unrelated to
the World View's fork-on-edit boundary (0.2.20) a document goes
through. The two mechanisms happening to be exercised by adjacent
buttons in the same header does not make them the same operation.

### A Position, Once Assigned, Is A Fact — Not A Projection (0.2.23)

Before 0.2.23, "where is this world" was answered by recomputing a
deterministic grid slot from an unplaced publication's position in a
list, every single time the question was asked — a real position no
document ever actually held, reconstructed fresh on demand. Publishing
now assigns a REAL initial placement (InitialPlacementStrategy,
recorded as a PlacementRecord) the moment a Publication is created,
and every later placement query reads that recorded fact rather than
re-deriving one. The deterministic-grid computation still exists, but
now strictly as a fallback for content that predates this milestone
and therefore has no recorded placement at all — not as the
system's normal, ongoing answer to where a world is.

### World Coordinates Are Absolute; Documents Are Local (0.2.24)

A brick's own position is meaningful only inside its own document — it
is chosen, stored, and edited with no awareness that the document
might ever be published, let alone where a placement might put it. A
WorldPlacement's position is meaningful only in shared world space —
it is chosen, stored, and moved with no awareness of what the
publication it points to actually contains. Neither ever needs to know
about the other to be valid on its own; they compose, by simple
addition, only at the moment something actually needs an effective
world position (rendering, spatial queries) — see
core/WorldPlacement.js `effectiveWorldPosition()`. This is what lets
the SAME document appear, unmodified, at more than one place in the
world at once, and what lets a placement move without the document
ever being touched (see "Moving A Placement Is Not Editing A Document"
above).

Positions the system STORES — a placement's position, whether chosen
automatically or by a person — are always absolute world coordinates.
A relative instruction ("50 units north of Alice's Castle", a nudge
button, "move by ΔX") is a convenience for CALCULATING the next
absolute position, never a thing that gets persisted as a relationship
between two placements. This is a deliberate, current-milestone
boundary, not an oversight: a `relativeTo`/`offset` primitive would
mean a placement's actual position depends on resolving another
placement's position first, transitively, on every read, on every
replica — real complexity (chains, cycles, a moved or deleted
reference) that nothing today actually needs solved. If relational
placement ever becomes a real requirement, it is additive on top of
the existing absolute position field, not a replacement for it.

### Deterministic Placement Is Not Optional (0.2.24)

An algorithm that assigns a publication's initial position must be a
pure function of the publication's own identity — nothing else. Before
this milestone, GridPlacementStrategy computed a position from how
many publications the LOCAL node happened to already know about
(`discoveryProvider.list().length`) — locally-observed state that two
not-yet-converged replicas (the normal, ongoing condition in a
decentralized system, not a rare edge case) can each see differently.
The required property —

    same publication -> same placement algorithm -> same absolute coordinate

on every replica — did not hold: two nodes could independently place
different publications at the identical grid slot, or the same
publication at two different ones, purely as an artifact of what each
node happened to have discovered first. `computePosition` now depends
on nothing but `publicationId` (core/DeterministicGridPlacement.js), a
pure hash-based mapping with no collaborator to observe local state
through even by accident. `LocalWorldLayoutProvider`'s legacy fallback
— for publications that predate 0.2.23 and so carry no PlacementRecord
at all — goes through the identical function, for the identical
reason: a fallback with the same non-determinism bug as the thing it
falls back from is not actually a fix.

This does not mean placements never collide — a bounded, hash-based
grid can and will map two different ids to the same cell. Resolving
that is explicitly out of scope here (see docs/Roadmap.md, "spatial
allocation / collision policy"); determinism, not collision avoidance,
is the property this milestone establishes.

### A World Unit Is Not (Yet) A Meter

The World View's coordinate system has a canonical origin `(0, 0, 0)`
— every replica's `(0, 0, 0)` is the same point in shared space by
definition — and a fixed, right-handed axis convention (`+X` right,
`+Y` up, `+Z` toward the viewer, ground plane at `Y = 0`), matching the
renderer's underlying Three.js default, now stated as protocol rather
than left implicit in a rendering library's convention that happens to
currently be Three.js. One coordinate unit is one **World Unit** — a
name, not a physical quantity. This milestone deliberately does NOT
claim a World Unit equals one real-world meter, or any other physical
unit: nothing in the existing brick/document geometry was built
against that assumption, and asserting it now would be a claim the
system cannot back up. A later milestone can layer a physical-unit
interpretation (meters, or something else entirely) on top of World
Units without changing a single stored coordinate — the position data
itself never encodes a unit, only a number.

### Overlap Is A Fact; Collision Is A Policy Decision (0.2.25)

Two placements sharing the exact same world position is not, by
itself, invalid. A shared world can legitimately hold more than one
publication at one coordinate — an interior view, a historical
version, deliberately layered exhibits — so `position` is deliberately
NOT globally unique, and detecting that two placements occupy the same
coordinate (`core/SpatialOverlap.js`) is kept strictly separate from
deciding whether that's acceptable (`core/SpatialAllocationPolicy.js`).
An overlap is a derived OBSERVATION — computed on demand from whatever
placements are locally known, never stored as its own entity — exactly
the same "computed, not stored" posture status/lifecycle already
follows elsewhere in this codebase. Two independently authorized,
validly signed PlacementRecords that happen to share a position are
both still valid: overlap is a spatial policy/UX question, never a
cryptographic trust question, and must never cause either record to
fail verification or be treated as conflicting the way 0.2.18's causal
conflict machinery treats two DIFFERENT revisions of the SAME
placement. Sharing a coordinate is not the same claim as disputing one.

### The Default Policy Is WARN, Not Silent Correction (0.2.25)

When a person explicitly requests a world position that turns out to
be occupied, the system asks before it acts — it never silently
substitutes a different coordinate than the one requested. Someone who
typed `(500, 0, 300)` and reasonably expects their world to end up at
`(500, 0, 300)`, not some nearby cell chosen on their behalf, would be
right to ask "why didn't you put it where I told you?" if it moved
without warning. WARN keeps that promise: the requested position is
still what gets placed, exactly as entered, only after the person
sees what else is there and chooses to proceed anyway. This is
deliberately different from automatic initial placement
(GridPlacementStrategy via PlacePublicationUseCase), which stays ALLOW
— there is no person present at publish time to ask, and 0.2.23
already established that placement must never block a publish that
otherwise succeeded. The same overlap fact gets a different policy
depending on who — or what — is making the request, not a different
detection mechanism.

### Automatic Collision Resolution Is Deferred, Not Solved (0.2.25)

It would be convenient for automatic placement to probe nearby cells
and silently choose an empty one when its first choice is occupied.
This is deliberately NOT built. "Is this cell occupied?" can only be
answered from whatever a replica has locally discovered so far — and
two replicas that haven't converged (the normal, ongoing condition in
a decentralized system, not a rare edge case) can see different
answers to that question, at different times, for the same cell. An
algorithm that resolves collisions by consulting local occupancy would
reintroduce exactly the bug 0.2.24 spent an entire milestone
eliminating from GridPlacementStrategy: two replicas independently
"resolving" the same collision to two different final positions.
Recomputing a stable global ordering (e.g. sorting known publication
ids and assigning neighboring slots) doesn't avoid this either — a
later-arriving publication that sorts before an earlier one would
shift where already-published, already-signed placements are
"supposed" to sit, contradicting "a position, once assigned, is a
fact, not a projection" (0.2.23). `SpatialAllocationPolicy.AUTO_OFFSET`
is named, in the enum, for exactly this idea — and deliberately throws
rather than pretending to implement it. If a real requirement for
automatic collision avoidance ever emerges, it needs a genuinely
reproducible global allocation algorithm as its own milestone, not an
incremental patch that only looks deterministic in single-node
testing.

### Geometric Collision Is A Later Question (0.2.25)

0.2.25 only detects ORIGIN collision — two placements at the exact
same coordinate. It does not detect GEOMETRIC collision — two
publications whose spatial bounds (`core/SpatialBounds.js`) intersect
despite sitting at different origins (e.g. one placed at `(0,0,0)`
spanning `X 0..100`, another at `(50,0,0)` spanning `X 50..150`).
Bounds-aware intersection is a strictly harder problem — it needs
rotation and scale accounted for (SpatialBounds' AABB is translation-
only through V1, see its own comment), and a meaningful answer to "how
much overlap counts" that origin equality doesn't need to answer at
all. Establishing origin-collision semantics first, and only later
deciding whether/how geometric collision needs its own detection, is
the same incremental discipline 0.2.23 applied to placement itself
before this milestone extended it to overlap.

### Discovery Is One Path, Not Two (0.2.26)

Search does not introduce a second, UI-maintained catalog of what
exists in the world. `SearchWorldUseCase` filters exactly what
`discoveryProvider.list()` already returns — the same source every
other discovery-driven surface (Repository View, Author View, fork-
policy checks) already reads. This keeps

    Discovery -> Publication -> Placement -> World View

as one coherent path. A UI-only search index would need its own
consistency story — when does it refresh, what happens when it drifts
from what discovery actually knows — that a filter over the live
discovery result never needs, because it has nothing of its own to go
stale. The same reasoning that kept `SpatialOverlap` a derived
observation instead of a stored entity (0.2.25) applies here: a
"World Directory" is a VIEW over decentralized state, computed on
demand, not a second mutable database that must be kept in sync with
the first.

### Publication Found Is Not The Same As Placement Found (0.2.26)

A search result can be in exactly one of two meaningfully different
states, and the UI says which: a publication with an explicit,
recorded `PlacementRecord` (`hasPlacement: true`, a position someone —
or `GridPlacementStrategy` — actually chose), or a publication known to
discovery that has never been placed (`hasPlacement: false`, resolved
only through 0.2.24's deterministic fallback grid so Focus still has
somewhere to send the camera). Neither is an error. Collapsing them
into one undifferentiated "found it" would hide a real fact — that the
position about to be focused might be a placeholder, not a chosen
location — behind a search result that looks identical either way.

0.2.28 extends this rather than introducing a competing rule: a
publication found by a SPATIAL query (coordinate + radius) still
carries `hasPlacement: false` when the position that put it inside the
radius was only ever the deterministic fallback, never an authored
placement. A radius search that quietly treated a fallback position as
equally authoritative as a recorded one would let a person read
"found within 25 units of (100, 50, 250)" as a claim about where the
publication was actually placed, when the honest claim is narrower:
this is merely where it resolves to today, absent any real placement
decision.

### Focus Is Navigation, Not Discovery — And Never Editing (0.2.26)

Focusing a document — from search results, from "Documents Here," from
the pre-existing Nearby Worlds list, all three now converge on the
exact same `WorldNavigationSession.focusDocument` — moves the camera
and changes which document is active. It does not load a NEW kind of
state, does not create anything, and above all does not mutate the
document it points to. A focused, published document remains exactly
`🔒 Published`; only an actual content mutation (moving a brick,
editing metadata) crosses into fork-on-edit (0.2.20) territory. This
is what makes Focus safe to offer everywhere a document can be named —
a search result, an overlap list, a nearby-worlds entry — without ever
having to ask "but will this fork it?" The answer is always no, by
construction: `focusDocument` never touches
`_ensureEditableDocumentId`/`_forkForEdit` at all.

### Diagnostics Should Say What Is Actually True, Not What Would Be Convenient (0.2.26)

0.2.19's `DiscoveryDiagnostics` (manifest-load failures, equivocation,
staleness) is real, tested infrastructure — but it belongs to
`DecentralizedSpatialDiscoveryProvider`, which is not the discovery
backend `CreateWorldViewUseCase` actually wires into the live World
View today (`LocalWorldLayoutProvider`/`LocalSpatialIndexProvider`
are — see docs/Architecture.md, 0.2.26). A synchronous, fully-local
`localStorage` read cannot genuinely be "temporarily unavailable" the
way a fetched index manifest can; presenting a manifest-unavailable
message the live stack could never actually produce would be
inventing a state, not reporting one. So 0.2.26 distinguishes only
the categories that are REAL in the currently-wired stack today: no
publications exist at all, a search matched nothing, a publication
exists but has no recorded placement (see above), and a known,
positioned publication simply isn't within streaming range yet
(actionable — Focus). Wiring the richer decentralized diagnostics
into the live UI is real future work, tracked, not done here — see
docs/Roadmap.md — and when it happens it should replace this
messaging with the genuine thing, not sit alongside a parallel set of
messages that were never backed by what's actually running.

### Camera Focus, Active Document, and Selection Are Three Different Things (0.2.27)

`_focusedDocumentId` used to answer two genuinely different questions
at once: "where is the camera looking?" and "which document does a
mutation land on?" That worked while the two always changed together
— every pre-0.2.27 way of moving around the World View also happened
to be the only way to change what you were editing. 0.2.26 broke that
coincidence: two publications can share an exact world coordinate, so
switching which one you mean to work with no longer has to move the
camera at all. WorldNavigationSession now tracks camera focus
(`_focusedDocumentId`, read via `getFocusedDocumentId()`) and the
active document (`_activeDocumentId`, read via `getActiveDocumentId()`)
independently. `focusDocument()` still moves both together by
default — the common case (search/Nearby Worlds/Documents-Here
"Focus") really does mean both at once, and every caller written
before this milestone already expected that combined behavior — but
`focusDocument(id, { setActive: false })` moves the camera alone, and
the new `setActiveDocument(id)` changes the editing target alone,
touching nothing about where the camera is pointed.

Selection is a third, still-separate concept, and it is kept
consistent with the active document by construction, not by
convention: `_setSpatialSelection` — the one place every selection
change in this file actually flows through (picking, marquee-select,
select-all, selecting a group, a paste's auto-selected bricks) —
makes the selection's own document the active document the moment a
real (non-ground) selection is set. `setActiveDocument` closes the
loop the other way: switching the active document clears a selection
that belongs to a DIFFERENT document, so a document explicitly made
active is never left carrying a stale selection pointing somewhere
else. The result is an invariant, not a hope: **whenever a non-empty
brick selection exists, it and the active document always agree on
which document that is.** Camera focus is the only one of the three
that can legitimately point somewhere else entirely.

### Only The Active Document Is An Editing Target (0.2.27)

Every mutation entry point in `WorldNavigationSession` — brick
placement, move/rotate/delete/align/distribute/numeric-transform,
groups, clipboard, save/publish, metadata edits, undo/redo, history
replay — resolves its target from the active document (or, when one
exists, the current selection's document — see above), and NONE of
them read `_focusedDocumentId` any more. This closes a real,
previously-latent bug class, not just a hypothetical one: group
operations (`createGroupFromSelection` and friends) used to fork the
selection's document to make it editable, and THEN independently fork
whatever `_focusedDocumentId` happened to be and build the group
command from ITS worldId — using Document A's `worldId` with Document
B's `brickIds` whenever the camera and the selection pointed at two
different documents. Before 0.2.26 gave the World View a reason to
have two documents loaded and interactively selectable at once, this
could not actually be reached; it is exactly the kind of bug that a
milestone adding real multi-document interaction is obligated to go
looking for, not just avoid introducing fresh copies of. The fix is
structural, not a patched condition: every group/clipboard method
either resolves from the selection's (already correctly forked)
document directly, or — when there is no selection to resolve from —
from `_activeDocumentId`, and camera position is never consulted by
any of them, anywhere.

### Navigation Never Implies Editing (0.2.27)

Moving the camera — `focusDocument`, `moveCamera`, streaming a
document into view — never mutates anything and never forks a
published snapshot, regardless of which document ends up focused.
This was already true before 0.2.27 (0.2.20's fork-on-write guards
only ever ran from an actual mutation call), but it is now a checked
architectural boundary rather than an incidental consequence of
`_focusedDocumentId` and `_activeDocumentId` being the same field: the
camera-only field is never read by `_ensureEditableSelection`,
`_ensureEditableDocumentId`, or any command construction anywhere in
this file. Focusing a published document — from search results, from
"Documents Here," from Nearby Worlds — leaves it exactly as published
as it was before, every time, by construction.

### The World View Header Shows What It's Actually Doing (0.2.27)

"Camera: Alice's Castle · Editing: Bob's Castle" is not a debugging
aid bolted on for this milestone — it is the direct, user-facing
consequence of camera focus and the active document being real,
independently-inspectable state rather than one field wearing two
hats. Showing it plainly, always, rather than only when the two
happen to differ, is a deliberate choice: a UI that only speaks up
when something is unusual trains a person to stop checking, right up
until the one time it matters (this is the same reasoning that made
0.2.22 bind the header to the active document unconditionally, not
just after a fork). The header's Published/Editing-fork status badge
and Save/Publish/Edit Metadata actions all read the ACTIVE document
(unchanged in spirit from 0.2.22, correctly scoped now that active and
focused can genuinely differ) — camera position has never determined,
and still does not determine, what those controls act on.

### A Spatial Query Is Authoritative Over Placement, Not A Local-Cache Scan (0.2.28)

"Find everything within 25 World Units of (100, 50, 250)" has to mean
the same thing regardless of which replica answers it — everything
discoverable within that region, not merely whatever this particular
browser's local cache happens to already know about. This is the same
requirement 0.2.24 established for a single coordinate (the same
publication resolves to the same position everywhere) extended to a
region: the CONTRACT a spatial query promises does not shrink just
because the concrete implementation answering it today is
`LocalWorldLayoutProvider` scanning a local list. `WorldNavigationSession.
searchWorldByLocation` is written against that contract, not against
today's implementation — a future decentralized backend (spatial
cells → `SpatialIndexRoot` → `SpatialIndexManifest` →
`PlacementRecord`s, exact distance test) answers the exact same
question, with the spatial index as an accelerator and the placement
records themselves remaining the authoritative source, never the
reverse. See docs/Architecture.md, 0.2.28, for why that swap is
future work and not attempted here — the promise the API makes is
what has to be right immediately; which concrete provider fulfills it
can improve later without changing a single caller.

### Distance Is Derived, Never Persisted (0.2.28)

A spatial query result's `distance` field is computed once, at query
time, from the requested center and the result's resolved position —
it is never stored on a `PlacementRecord`, never replicated, and never
treated as a fact about the publication itself. This is the same
"computed, not stored" posture `SpatialOverlap` (0.2.25) and lifecycle
`status` (0.2.6) already established for every other derived fact in
this codebase: `distance` describes the relationship between a
publication's position and a QUESTION someone just asked, not a
property the publication has on its own. A result found through a
plain text search therefore carries `distance: null` rather than a
number left over from some other query — there is no meaningful
distance without a center to measure from, and a stale or invented one
would be worse than none.

### Exploring A Location Is Not A Second Search (0.2.29)

The World Location Browser lets a person browse the world by CAMERA
POSITION instead of by already knowing a document's name or typing raw
coordinates — but "exploring" a location and "searching" for one are
the same underlying question asked from a different starting point,
not two mechanisms that happen to look similar. `exploreLocation`,
`exploreHere`, and `whatsHere` are thin wrappers over
`searchWorldByLocation` (0.2.28); none of them re-implement position
resolution, the distance test, or the nearest-first sort. This matters
for the same reason 0.2.26 insisted discovery stay one path rather
than a UI-maintained catalog that could drift from what discovery
actually knows (see "Discovery Is One Path, Not Two," above): a second
implementation of "what's near this point" would eventually answer a
slightly different question than the first one, and nobody would
notice until the two disagreed. There is exactly one spatial query in
this codebase. Exploration is a camera-driven front end for it.

### "Explore Here" Queries The Camera, Never The Active Document (0.2.29)

`exploreHere`'s query center is the CAMERA's current world position —
`getSpatialState().cameraPosition` — never the active document's
placement. This is 0.2.27's camera/active separation applied to a new
operation rather than relaxed for one: a person can be looking at
empty space between two documents, with no active document at all (or
an active document that has nothing to do with where the camera
happens to be pointed), and still reasonably want to explore right
there. Reaching for "the active document's position" as a shortcut
would silently break exactly that case — the most natural one for
"explore here" to begin with — so the query center comes from the
camera, unconditionally, the same way focus and active-document
changes have been independently tracked since 0.2.27.

### A Tolerance Radius Is What Makes "What's Here?" Answerable From A Camera (0.2.29)

`getDocumentsAtPosition` (0.2.26) answers "what's recorded at this
EXACT position" via literal coordinate equality, which is the right
question when the position in hand is itself exact — a placement's own
recorded position, for instance. A camera's world position is not that
kind of number: it is continuous, it changes on every orbit/pan/zoom,
and it essentially never lands exactly on a recorded `PlacementRecord`
— not even immediately after focusing one, since
`SpatialCameraController.focusDocument`'s orbit-style framing parks
the camera a fixed offset away from its target, never on top of it.
"What's Here?" (`whatsHere` = `exploreHere(NEARBY_RADIUS)`) answers the
same intent — "what's essentially right here" — with a small-radius
spatial query instead of an exact-match one, because an exact-match
query against a continuous coordinate would almost always report
nothing, correctly but uselessly. The tolerance is deliberately much
smaller than "Explore Here"'s own configurable radius: "What's Here?"
should read as "basically at this spot," not "in this neighborhood."

### The Location Browser's Three Actions Are Existing Operations, Not New Ones (0.2.29)

Focus, Select, and Inspect on a location-browser result are not new
capabilities invented for this milestone — they are the same
operations 0.2.27 already established, reached from a new entry point.
Focus is `focusDocument`'s existing default behavior (moves the
camera, and by default makes the document active too). Select is
`setActiveDocument` (makes the result the active/editing-target
document WITHOUT moving the camera). Neither forks, edits, or
publishes anything — see "Navigation Never Implies Editing" (0.2.27),
which this milestone extends to exploration rather than carving out an
exception for it. Inspect goes one step further than either: it never
navigates and never loads the document into the session at all.
`inspectDocument` bundles `getDocumentInfo` and `getPlacementInfo`
exactly as they already behave — and `getDocumentInfo` only has an
answer for a document actually loaded in the session. A location- or
search-result document is, by definition, usually one this session
hasn't loaded (that is the point of finding it by exploring rather
than already having it open), so `documentInfo` may legitimately come
back `null`. Forcing a load just to inspect a result would be a real
side effect — renderer work, storage/network reads — that a strictly
read-only action must not trigger on its own; the UI falls back to
what the search/explore result already knows (title, author, position,
`hasPlacement`) when that happens.

### Discovery And Trust Are Related, But They Are Not The Same Operation (0.2.30)

"Did I find it?" and "should I trust what I found?" are two different
questions, answered by two different layers, and 0.2.30 keeps them
that way rather than collapsing one into the other. `exploreLocation`'s
`documents` still come entirely from the ordinary local resolution path
(`searchWorldByLocation`, unchanged since 0.2.28) — a document a
session can find is never hidden, filtered, or reordered because of
what a trust layer says about it. `diagnostics` is a strictly
ADDITIONAL, parallel observation, computed by consulting an OPTIONAL
trust-capable provider over the very same region — see
`WorldNavigationSession`'s "World Location Browser" section for why
the two are deliberately decoupled rather than merged into one
resolution path. A stale, conflicting, or even entirely unverifiable
region still shows its documents; the UI's job is to say what it knows
about their trustworthiness alongside them, not to make that decision
for the person looking. This is the same posture 0.2.25 established
for overlap ("Overlap Is A Fact; Collision Is A Policy Decision") and
0.2.19 established for trust generally (a `TrustObservation` is purely
descriptive; deciding what to DO about a status is a separate policy
question) — 0.2.30 is that same posture, applied to what a spatial
exploration surface shows a person.

### Diagnostics Are Received From The Discovery Layer, Never Invented By The UI (0.2.30)

`core/DiscoveryDiagnosticsSummary.js` is a pure function over real
counters — `spatial/DiscoveryDiagnostics.js`'s accumulated
`manifestsMissing`/`manifestsInvalid`/`recordsRejected`/`staleEntries`/
`conflicts`/`equivocations`, themselves built from real
`TrustObservation`s recorded while `DecentralizedSpatialDiscoveryProvider`
actually ran. There is no branch anywhere in this pipeline that
assumes, defaults to, or fabricates a "valid" or "complete" claim the
underlying query didn't actually establish. This produces a specific,
deliberate four-way state a UI can render honestly instead of
collapsing into a single true/false "is this trustworthy":
  - `available: false` — no trust-capable provider was even
    consulted. This is NOT "everything found is untrustworthy" and
    NOT "the world is empty" — it is the honest absence of an
    opinion, and it is TODAY'S DEFAULT: the live World View still
    wires the plain `LocalWorldLayoutProvider`/`LocalDiscoveryProvider`
    scan established in 0.2.26/0.2.28/0.2.29, which has no manifest,
    root, or signature concept to report on at all (see
    docs/Architecture.md, 0.2.30, for why this milestone does not
    change that wiring).
  - `available: true, fatal: <reason>` — a provider WAS consulted, but
    the index root/authority itself could not be trusted this pass
    (`DecentralizedSpatialDiscoveryProvider.discover()` throws for
    exactly this case). Nothing about this region's index could be
    verified — a strictly worse epistemic state than "some entries
    have issues," and shown as such.
  - `available: true, complete: true` — the trust layer ran and found
    nothing to flag.
  - `available: true, complete: false, warnings: [...]` — the trust
    layer ran and found real, itemized issues, each carrying its own
    real count.
This is the direct answer to the distinction the milestone set out to
make possible: "There are no documents here" (an empty `documents`
array with `diagnostics.complete: true`) is a different statement from
"I currently know of no documents here" (an empty `documents` array
with `diagnostics.available: false`), which is different again from
"there are documents here, but some could not be trusted"
(a non-empty `documents` array with `diagnostics.warnings` naming
specifically what could not be verified).

### Repository Search Is Not World Search (0.2.31)

`application/SearchWorldUseCase.js` answers "where is this publication
in the world?" — text plus an optional spatial radius, enriched with a
resolved position, because that is what navigating a 3D scene needs.
`application/SearchPublicationsUseCase.js` answers a different
question — "which publications match this description?" — with no
position, no camera, no placement concept anywhere in it, but with
pagination, deterministic ordering, and (opt-in) a publication's full
description as a match target, none of which World Search needs. These
stay two separate use cases rather than one bent to answer both
questions, the same reasoning 0.2.28 used to give spatial discovery
its own query instead of overloading text search with coordinates:
when two callers want genuinely different things from "search," giving
them one shared implementation doesn't reduce complexity, it just
hides two different sets of assumptions inside one function that has
to keep satisfying both.

### A Catalog Query Is Answered By The Application Layer, Not Assumed Efficient By The UI (0.2.31)

`SearchPublicationsUseCase.execute(query)` receives a `PublicationQuery`
and returns a `PublicationPage` — the UI never computes an offset,
never assumes `discoveryProvider.list()` can be asked for "rows 5000
to 5020" efficiently, and never touches pagination math itself. This
is the same "contract vs. implementation" honesty 0.2.28 established
for `searchWorldByLocation`: today's concrete answer is a full local
scan, sort, and slice (`LocalDiscoveryProvider` has nothing better to
offer), but the CONTRACT — page-number in, a page of results plus
enough metadata to render pagination controls out — has room for a
future decentralized provider to answer the exact same call shape via
cursor-based continuation without a single caller changing. Whether
that swap ever needs to happen is a separate, later decision (see
docs/Roadmap.md); what has to be right immediately is that no caller
today baked in an assumption that would make the swap harder later.

### Ordering Must Be Deterministic Across Replicas (0.2.31)

If two replicas hold the same set of publications, sorting them must
produce the exact same sequence on both — otherwise "page 5" doesn't
name a stable thing two people could even discuss, which defeats the
entire point of paginating explicitly rather than scrolling infinitely
(see below). Two disciplines make this actually true, not just
plausible, in `core/PublicationSort.js`:
  1. Every sort order falls back to a deterministic SECONDARY key
     (`publicationId`, itself globally unique) whenever the primary
     key ties — `publishedAt` alone is not unique, and two publications
     sharing a timestamp is not a hypothetical (0.2.31's own 10,000-item
     test fixture deliberately produces many).
  2. Every string comparison is ORDINAL (`<`/`>` on raw code points),
     never `String.prototype.localeCompare`. Locale-aware collation
     reads more "correct" for a human sorting titles, but its result
     depends on the calling browser/OS's configured locale — meaning
     the SAME two titles could sort differently on two replicas simply
     because their users have different language settings. Ordinal
     comparison is less pretty and exactly as correct everywhere,
     which is the property that actually matters here.

### Grouping Is Presentation, Never A Storage Concept (0.2.31)

`core/PublicationGrouping.js`'s `groupPublications` takes whatever page
of already-sorted, already-paginated items the catalog is showing and
buckets them for display (by author, by date, by license) — nothing it
produces is persisted, replicated, or expected to agree across two
people looking at the same catalog with different grouping modes
selected. This is the same distinction 0.2.19 drew between a
`TrustObservation` (a fact) and a `TrustPolicy` decision (what to do
about it), and the same one 0.2.25 drew between overlap (a fact) and
collision policy (a decision) — applied here to a purely visual
concern: which bucket a card renders under carries no meaning outside
this one person's current view of this one page.

### A Preview Is Either Signed Or It Isn't (0.2.31, resolved 0.2.32)

A publication's preview COULD be immutable, content-addressed, and
part of the signed publication — exactly like its content and
placement history already are. But `Publication.getSigningDescriptor()`
already covers every field the class has, and verification works by
recomputing that descriptor from an object's CURRENT shape and
comparing it against what was actually signed at publish time. Adding
a `preview` field to that payload would mean every ALREADY-published,
already-signed Publication recomputes a descriptor that no longer
matches its original signature the moment this shipped — silently
breaking verification for the entire existing corpus. 0.2.31 left this
as an open schema-evolution question and shipped only a computed
PLACEHOLDER while it stayed unanswered.
0.2.32 answers it — not with a migration, but by deciding a signed
preview was never the right design in the first place: see "Previews
Are Derived Client State," below, for why a LOCAL render is not merely
the schema-safe choice but the more honest one. `reference` stays
reserved and unused; nothing in this codebase produces one.

### Description Search Is Opt-In, Not Silent, Because It Has A Real Cost (0.2.31)

A publication's description lives on `DocumentMetadata`, not on the
lightweight `Publication` record `discoveryProvider.list()` returns —
matching a search term against it means loading that publication's
full Document. For the small handful of items on the CURRENT page,
that cost is trivial and paid unconditionally so every card/row can
show a description snippet (see the Repository UI). For a SEARCH that
might need to check every publication in the whole catalog, that same
cost is not trivial — at real catalog scale it means loading
potentially thousands of documents just to answer one query. Rather
than pay that cost unconditionally and silently slow every search
down, or skip description search entirely, `SearchPublicationsUseCase`
makes it an explicit, visible choice: the "Include descriptions"
checkbox in the catalog toolbar. Checking it is the user saying "I
know this may take longer, and I want it anyway" — the same honesty
this codebase has applied to every other real cost/limitation rather
than hiding it behind a control that looks unconditional (see
docs/Principles.md, "A Discovery Provider Must Never Say Only 'Not
Found,'" 0.2.19, for the same instinct applied to a different kind of
honesty). A resolved description is memoized for the life of the
`SearchPublicationsUseCase` instance, so this cost is paid at most
once per publication per session, never once per keystroke or once
per repeated search.

### Explicit Pagination Is A Decentralized Honesty Feature, Not Just A Layout Choice (0.2.31)

Infinite scroll was deliberately NOT implemented. A decentralized
catalog eventually has to answer questions like "am I looking at page
5 of the complete repository, or page 5 of what THIS replica currently
knows about?" — a question that is much easier to ask and answer with
explicit page numbers (see `PublicationPage.totalPages`/`page`) than
with a list that just keeps loading more as you scroll, which has no
natural place to expose that distinction at all. This is the exact
same posture 0.2.26/0.2.28/0.2.30 already took toward search/discovery
completeness, applied to the repository catalog: once the discovery
protocol can provide stronger completeness semantics, revisiting
infinite scroll or virtualized lists is a reasonable future
conversation — but it should be a deliberate choice made with that
semantic question already answered, not a default reached for because
it "looks modern."

### Previews Are Derived Client State (0.2.32)

A preview is not authoritative publication data. It is a locally
generated visualization of immutable content — computed from the
actual, real Document a publication points to, never from anything a
publisher merely claims about it. It may be cached, discarded,
regenerated, or simply unavailable, without affecting a publication's
validity, identity, authorization, replication, or discoverability in
any way. This is the organizing principle behind every other decision
in this section, so it's worth stating as its own rule rather than
leaving it implicit across `application/PreviewService.js`'s and
`renderer/DocumentThumbnailRenderer.js`'s individual comments.

Two consequences follow directly. First, the trust story a preview
offers is real, not decorative: because the image comes from actually
loading and rendering the document — never from a title, a
description, or an author-supplied field — a publisher cannot make a
one-brick document look like an elaborate castle by simply attaching a
prettier picture. The preview shows what you would actually see if you
opened the thing. It does not promise the content is any good, only
that it's honest — the same distinction 0.2.19's trust layer draws
between cryptographic validity and any claim about the CONTENT being
correct or worthwhile. Second, since nothing here is authoritative,
nothing here needs the ceremony authoritative data requires: no
signing, no replication, no schema version, no migration path. A
`PreviewService` cache can be dropped entirely — a page refresh, a
`maxCacheEntries` eviction, a browser tab closing — and the only
consequence is that the next visit regenerates whatever it needs, from
the same real document, arriving at the same picture.

### A Preview's Camera Framing Is Deterministic; Its Pixels Are Not (0.2.32)

`core/PreviewCameraFraming.js` guarantees exactly one thing: the SAME
document bounds always produce the SAME intended camera position,
target, and field of view — pure geometry, no Three.js, no randomness,
no wall-clock time, testable exactly like `core/SpatialQuery.js`'s
distance math. That is a real, useful, and honest guarantee: two
people opening the same publication on two different machines will see
the SAME SHOT of the SAME CONTENT, not an arbitrary angle each time.

What it deliberately does NOT guarantee is byte-identical output. GPU,
driver, antialiasing implementation, device pixel ratio, and even the
installed Three.js version can all still make the actual rendered
pixels differ between two renders of the exact same framing. This is
the correct amount of determinism for what a preview actually is (see
"Previews Are Derived Client State," above) — it was never signed, and
nothing anywhere depends on two renders matching byte-for-byte, only
on them showing the same thing from the same angle. Reaching for
cryptographic, byte-exact determinism here would be solving a problem
this system doesn't have, at a cost (locking the rendering pipeline to
a specific GPU/driver/library version forever) this system shouldn't
pay.

### A Preview Failure Is Not A Publication Failure (0.2.32)

Generating a preview means loading and rendering a document — a real
operation that can fail for reasons that have nothing to do with
whether the publication itself is valid: a corrupted local snapshot, a
renderer that couldn't construct (no WebGL available), a document too
unusual for the current mesh factory to handle. None of these are
reasons to hide the publication, disable its actions, or otherwise
treat it as broken — the same failure-isolation posture 0.2.15/0.2.16/
0.2.19's discovery/verification pipelines already apply to a single
bad manifest or record. `PreviewService.request()` therefore never
throws and never rejects; a failure resolves exactly like "not
generated yet" (`null`), and the UI's response to both is identical —
keep showing the deterministic placeholder (see 0.2.31's
`derivePlaceholderPreview`), which is a complete, legible card on its
own, not an error state bolted onto one.

### Preview Generation Is Bounded By What's Actually Visible (0.2.32)

Opening the Repository must never mean "download and render every
publication in it" — that would turn browsing a catalog of thousands
into loading thousands of documents whether or not anyone ever looks
at them, exactly the scaling trap 0.2.31's opt-in description search
was already careful to avoid for a narrower case. `PublicationPreview.js`
requests a render only once its own card is actually visible or about
to be (via `IntersectionObserver`, one standard browser mechanism doing
the work of "visible cards first, near-viewport next, off-screen don't
generate at all" in one line, rather than a bespoke priority-tier
system) — a card that's never scrolled into view never costs anything.
The same discipline applies going the other direction: a page or
search-query change that removes a card from view cancels its
in-flight or queued generation outright (see
`application/PreviewService.js`'s cancellation, which removes an
abandoned job from the queue entirely, not merely its promise) — work
already in flight for a page nobody is looking at anymore is waste,
not progress.
