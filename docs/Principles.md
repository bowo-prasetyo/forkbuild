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

### Identity, Avatar Profile, and Presence Are Three Different Questions (0.2.33)

Avatars introduce a new kind of state, and it would have been easy to
reach for the nearest existing box — Document, Publication, or
WorldPlacement — and force it in. 0.2.33 instead starts by drawing the
distinction explicitly, before writing a single line of rendering or
movement code:

    Identity        -> Who is this?
    Avatar Profile   -> What does this user look like?    (persistent)
    Presence         -> Where is the user right now?      (ephemeral)
    Document         -> What world content exists?
    World Placement  -> Where is that document located?

An `AvatarProfile` (`core/AvatarProfile.js`) is not a Document — it
never enters the World/Building/Brick model, has no schema migration
story, and is never rendered as world content itself. It is not a
Publication — it never goes through `PublishDocumentUseCase`, is never
content-addressed, and carries no license. And it is not a
WorldPlacement — nothing about "where does Alice's AVATAR look like it
should be" is a persistent, revisioned, spatially-indexed fact the way
"where does Alice's PUBLISHED CASTLE sit in shared space" is.

An `AvatarPresence` (`core/AvatarPresence.js`) is not a WorldPlacement
either, despite both superficially being "a position." A WorldPlacement
answers a question with exactly one durable answer until someone
deliberately moves it, is signed, is spatially indexed, and is
discoverable by every replica. A Presence answers a question with a
new answer many times a second, is never signed (see the next
principle), is never spatially indexed, and is meaningful only to
whoever is currently looking at it. Collapsing the two — say, by
recording every avatar step as a WorldPlacement revision — would not
just be wasteful, it would be a category error: it would make a
transient fact about a PARTICIPANT masquerade as a durable fact about
a PUBLICATION's location, corrupting exactly the "what is signed and
durable vs. what is derived and disposable" distinction 0.2.16 through
0.2.32 spent this project's entire second arc establishing.

Concretely: if Alice walks across a published castle, the castle's
immutable snapshot and its WorldPlacement are untouched by her
presence — see "Presence Is Never Signed, Never Persisted, Never
Placed," below, for the mechanism that makes that guarantee real
rather than aspirational.

### Presence Is Never Signed, Never Persisted, Never Placed (0.2.33)

`core/AvatarPresence.js` deliberately has no `getSigningDescriptor()`,
and `application/AvatarPresenceSession.js` deliberately has no
`StorageProvider` dependency at all — not a dependency that happens to
go unused, but one that structurally cannot exist because the
constructor never accepts one (see `tests/AvatarPresence.test.js`,
assertion 22, which checks this directly against the constructor's
own arity rather than trusting a comment).

Both omissions are load-bearing, not oversights:

- **Never signed.** Signing exists in this codebase to let a replica
  answer "did an authority really authorize this DURABLE fact?" —
  meaningful for a Publication (0.2.16) or a PlacementRecord (0.2.16)
  because both are meant to be relied on indefinitely. A presence
  update is stale before a signature over it would even finish being
  verified; treating it as an authorized, durable fact would be
  answering the wrong question. The right question — "is this
  movement claim even plausible, and is it being replayed or
  spoofed?" — is 0.2.38's "Presence Trust, Replay & Conflict
  Handling," to be answered with `AvatarPresence.sequence` and
  per-session channel trust, not with an Ed25519 signature over a
  canonical envelope.
- **Never persisted.** Writing a presence update to durable storage
  every time an avatar moves would turn an ephemeral, real-time
  problem into a permanent-data problem — the exact mistake 0.2.32
  ruled out for a preview image is ruled out here for something that
  changes orders of magnitude more often. `AvatarPresenceSession`
  holds exactly one current `AvatarPresence` in memory and replaces it
  wholesale on every `update()` call; nothing about it survives a page
  reload, and nothing needs to.
- **Never a WorldPlacement.** See the previous principle. Presence
  updates never touch `LocalPlacementRegistry`, never advance a
  `PlacementRecord` revision, and never appear in spatial-index
  results — a hundred avatars walking through a world leave zero
  marks on it.

`AvatarPresence.sequence` is a plain, per-avatar-session monotonic
integer — deliberately NOT a `CausalStamp` (0.2.18). A `CausalStamp`
exists to let independently-authorized REPLICAS of a durable,
multi-writer record converge after being offline; a presence stream
has exactly one writer (the avatar's own client) and no offline-merge
story, so the simplest thing that lets a future receiver detect a
stale or replayed update — a flat, always-increasing counter — is the
right amount of machinery, not the vector-clock machinery a durable
record needs.

### An Avatar Profile Can Gain A Signature Layer Later Without A Rewrite (0.2.33)

`AvatarProfile.ownerIdentity` is a plain string today — deliberately,
the same choice `Publication.author` made through 0.2.15 and
`PlacementRecord.owner` made alongside it. Both later gained a real
cryptographic trust layer (`publisherIdentity`/`signature` on
Publication, `ownerIdentity`/`signature` on PlacementRecord, both
0.2.16) as new, additive, optional fields — not as a rewrite of what
already existed. `AvatarProfile` has no cross-replica distribution yet
to make signing meaningful (that arrives with 0.2.37's "Decentralized
Presence Synchronization," when another replica first needs to ask
"is this really what Alice's avatar looks like?"), so 0.2.33
deliberately doesn't build a signing envelope it can't yet justify.
When that need arrives, it can be answered exactly the way Publication
and PlacementRecord answered it: a new field, not a migration.

### A Template Is A Closed Vocabulary, Not An Asset Loader (0.2.34)

`core/AvatarTemplate.js` and the appearance it governs are declarative
DATA — a fixed, enumerable set of component names, each with a fixed,
enumerable set of option ids, plus a small set of "#rrggbb" color
fields. There is no field anywhere in this shape that holds a URL, a
file, a mesh reference, or anything else that could point at
executable code or a remotely-loaded asset. An `appearance` object can
only ever say "one of these already-known things," never "go fetch
this."

This is deliberate, not incidental, and it's what makes 0.2.34 safe to
ship without any of the problems a general asset pipeline would
introduce — security (no arbitrary file gets parsed or executed),
bandwidth (nothing is downloaded merely to render a customization
screen), provenance (every possible appearance was already shipped
with the client, so "where did this come from" always has the same
answer), compatibility (a template's own declared options are the only
things a client is ever asked to render), and moderation (there is no
user-supplied content to moderate). `core/AvatarAppearanceValidator.js`
existing at all is the enforcement mechanism for this principle: an
`appearance` that references anything outside its template's declared
components/options is REJECTED at the write boundary
(`AvatarProfileUseCase.updateProfile`), not sanitized, not partially
accepted — see the next principle for why reads get the opposite
treatment. Custom mesh uploads, arbitrary GLTF/GLB files, user-supplied
textures, and a marketplace of assets are explicitly out of scope for
this milestone, and for good reason — see docs/Roadmap.md.

### Validate Strictly On Write; Degrade Gracefully On Read (0.2.34)

`AvatarProfileUseCase` deliberately applies two different postures to
the same data, at two different boundaries:

- **`updateProfile()` is the WRITE boundary — strict, and it REJECTS.**
  An unknown `templateId`, an appearance value outside its component's
  declared options, a malformed color, an unknown accessory id, an
  oversized appearance object — every one of these throws, and nothing
  about the attempted update is persisted, not even the otherwise-valid
  fields in the same call. Garbage never enters storage in the first
  place; there is no janitor process anywhere in this codebase whose
  job is to clean up a bad write after the fact.
- **`getEffectiveAvatar()` is the READ boundary — lenient, and it NEVER
  THROWS.** A profile that predates a template rename, a template a
  future decentralized replica doesn't recognize, or (defensively) a
  record that was somehow corrupted still resolves to a COMPLETE, safe
  appearance — every individually-valid field is kept, every invalid
  or unrecognized one falls back to the resolved template's own
  default, field by field (`AvatarTemplate.resolveEffectiveAppearance`).
  If the stored `templateId` itself isn't recognized at all, the whole
  profile falls back to the default template. This is what makes the
  design doc's own requirement literally true: **an invalid avatar
  profile must never prevent the user from accessing the World View.**

The same asymmetry already runs through this codebase — 0.2.0/0.2.2's
`DocumentValidator` rejects a structurally malformed document outright
but the migration pipeline built alongside it tolerates old,
pre-versioned data leniently; 0.2.15/0.2.16/0.2.19's discovery pipeline
treats a single corrupt record as isolated, not fatal, to everything
else being read. Boundaries that CREATE data get to be strict, because
strictness there is what keeps the store clean. Boundaries that
CONSUME already-stored data have to be lenient, because by the time
you're reading, refusing to render is a worse failure mode than
rendering something slightly wrong.

0.2.41 update: `application/RemoteAvatarAppearanceRegistry.js`'s own
`resolve()` applies the exact same READ posture to a REMOTE peer's
`templateId` — a stranger's advertisement can honestly claim any
`templateId` string at all (structural validity only requires it be a
non-empty string; see `core/AvatarProfileAdvertisement.js`), and one
this replica's own `AvatarTemplateRegistry` has never heard of is not
an error, just an unresolvable lookup. It degrades to the same fixed
placeholder appearance an unwired appearance resolver already used
before 0.2.41 existed — never a thrown error, never a blank/invisible
avatar, never a guess at what the unknown template might look like.
The WRITE side stays exactly as strict as ever: `AvatarProfileUseCase.
updateProfile()` still rejects an unknown `templateId` outright for
the LOCAL profile it's asked to persist — this principle's asymmetry
was always about which BOUNDARY you're standing at, not about who
authored the data.

### Switching An Avatar's Template Resets Its Appearance (0.2.34)

`AvatarProfileUseCase.updateProfile({ templateId })`, when called
without an accompanying `appearance`, resets appearance to the NEW
template's own defaults rather than carrying the old template's
selections forward. This isn't just convenient — it's the only
coherent behavior available: appearance option ids are meaningful only
relative to the template that declared them (`hair-07` might exist on
Humanoid-01 and not on Humanoid-02, or exist on both but mean a
completely different hairstyle), so silently keeping them would
produce an appearance that fails validation against the template it's
now nominally attached to the very next time anything tried to save
it. Resetting to the new template's defaults keeps the profile valid
at every intermediate step, not just at the end of an edit.

### An Avatar's Location Comes From Presence, Never From The Avatar Itself (0.2.35)

`renderer/AvatarVisual.js` exposes exactly two independent write paths
— `setAppearance(template, appearance)` and `setPose(position,
rotation)` — and neither one is allowed to influence the other.
`setAppearance` never touches `root.position`; `setPose` never
touches a single mesh, material, or the pose group's children. This
mirrors the model split 0.2.33 established (`AvatarProfile` answers
"what does this look like," `AvatarPresence` answers "where is it")
all the way down into the renderer: the WHAT and the WHERE are
computed by different collaborators (`AvatarProfileUseCase.
getEffectiveAvatar()` vs. `AvatarPresenceSession.current`) and applied
through different methods, so there is no code path by which editing
a profile could nudge a position, or moving a presence could alter an
appearance.

`WorldNavigationSession._setupLocalAvatar()` is the one place these
two inputs are actually combined, and it only ever COMBINES them — it
resolves an effective appearance and reads a current presence, then
hands both, unmodified, to the render facade. It never invents an
appearance, and never writes back to `AvatarProfileUseCase`. This is
what makes the milestone's own architectural test concrete rather than
aspirational: an avatar standing on a published castle and a castle's
`WorldPlacement` are updated by entirely different code paths that
happen to share a scene — moving one can never move the other, not
because a check forbids it, but because no line of code exists that
could. (See the next principle for the one deliberate, narrowly-scoped
exception to "never writes back to `AvatarPresenceSession`" — choosing
where a brand-new avatar spawns.)

### A Fresh Avatar Spawns Near What You're Looking At, Not At A Fixed Point (0.2.35 follow-up)

A real gap surfaced immediately after shipping the first version of
this milestone: a brand-new `AvatarPresence` always starts at literal
world origin `(0, 0, 0)`, but a published document's own position
(0.2.24's deterministic grid strategy) is essentially never near the
origin — so the avatar was rendering correctly, exactly where
`AvatarPresence.position` said, and was invisible in practice on every
single World View session, because the camera was always looking at
the document you actually opened, not at the origin.

`WorldNavigationSession._spawnAvatarNear(position)` fixes this with
one narrow, explicit exception to "never writes back to
`AvatarPresenceSession`": the FIRST time `focusDocument()` runs in a
session (in practice, the initial `navigateToDocument()` call on World
View mount) and the avatar is still at its untouched default
(`AvatarPresence.sequence === 0`), it repositions the avatar a small
fixed offset from the document being focused — close enough to be in
frame, offset enough not to spawn inside the document's own geometry.
Every subsequent `focusDocument()` call in that same session — a
search result, Explore Here, Nearby Worlds — leaves the avatar exactly
where it is; only the untouched, "nobody has looked at this avatar's
position yet" state is eligible to be repositioned at all. Once real
movement exists (0.2.36), a moved avatar is `sequence > 0` and this
exception can never re-fire for it, by the same guard.

This is a UX default, not a location authority: it decides "where does
an avatar reasonably start," never "where is Alice's avatar right
now" — that answer is still, and will only ever be, whatever
`AvatarPresenceSession.current` says. A future decentralized presence
peer (0.2.37) has no reason to know or care that this client happened
to seed its own local avatar's spawn point this way.

### An Accessory Option Id Is Still Just An Id — Its Shape Is A Renderer Decision (0.2.35 follow-up)

A second gap surfaced right after the spawn-location fix: every
accessory a player selected — glasses, a hat, a backpack, a scarf —
rendered as the exact same small yellow box, just stacked at a
different height. The appearance data was correct end to end
(`AvatarProfile.appearance.accessories` held the right option ids,
`AvatarTemplate` validated them against the right closed vocabulary),
but nothing downstream of that data ever asked "and what does
`'scarf-01'` actually look like" — the renderer treated all four ids
as interchangeable.

This is the same lesson "A Template Is A Closed Vocabulary, Not An
Asset Loader" already states for skin/hair/shirt/pants — component
id → geometry is deliberately a renderer decision, never template
data — just applied one level deeper than the first pass at
`renderer/AvatarRenderer.js` actually applied it: having a component
called "accessories" was treated as enough, without giving each
accessory OPTION its own mapping the way skin tones and hair colors
already got one. `AvatarRenderer` now keeps one small builder function
per known accessory id (`glasses-01` sits at the face, `hat-01` sits
atop the head, `scarf-01` wraps the neck, `backpack-01` sits against
the back) plus a single explicit fallback — the original generic
marker — for any accessory id a template might declare that this
renderer doesn't have a bespoke shape for yet. Nothing about
`AvatarTemplate` or `AvatarProfile` changed; this was purely a
"the dumb executor wasn't dumb-executing every id, just the component
name" bug in the one file whose whole job is turning ids into meshes.

### A Preview And An Avatar Solve The Same Shape Of Problem Differently (0.2.35)

0.2.32's `PreviewService` and 0.2.35's avatar renderer both convert
already-authoritative data into Three.js objects nobody signs,
persists, or replicates — but they earn that similarity from opposite
directions, worth being explicit about so the parallel doesn't get
overstated. A preview is a snapshot: rendered once (lazily, on
visibility), cached, and only rebuilt if the underlying content
actually changes — appropriate because a Publication's content is
itself immutable. An avatar is a standing process: its presence is
expected to change continuously (0.2.36 adds real movement), so
`AvatarVisual` is deliberately built to be CHEAP to update on the
hot path (`setPose`/`setAnimation` never touch geometry) while still
being cheap to leave ALONE when nothing relevant changed
(`setAppearance`'s content-equality check, mirroring `PreviewService`'s
own cache-key discipline, just applied to a live object instead of a
cache entry). Both conclusions follow from the same principle applied
to different data: never do more rendering work than the actual rate
of change justifies.

### Avatar Visibility Is A Client Rendering Preference, Not Avatar State (0.2.35)

"Show My Avatar" in World View is a `ref` local to
`ui/views/WorldView.js` and a matching `_localAvatarVisible` flag on
`WorldNavigationSession` — nowhere else. It is never written to
`AvatarProfile`, never touches `AvatarPresence`, and is not persisted
across a reload. Toggling it calls exactly one method on the render
facade (`setLocalAvatarVisible`), which adds or removes an
already-built `Object3D` from the scene — it never disposes the
avatar, never re-fetches the profile, and never affects what
`AvatarProfileUseCase.getEffectiveAvatar()` or `AvatarPresenceSession.
current` would return to a DIFFERENT observer (a future remote peer,
once 0.2.37 exists, would have no way to know or care whether Alice's
own client happens to be hiding her avatar from herself). "Show Other
Avatars" is deliberately shipped disabled rather than omitted — its
control exists in the UI now precisely because it's the kind of
preference this principle already covers, but it has nothing to
connect to until a multi-avatar registry exists.

### Input Changes Presence; Presence Changes The Renderer (0.2.36)

The central rule of Local Avatar Movement, stated as literally as
possible: a keystroke is never allowed to reach a Three.js object
directly. The only path from "W is held" to "the avatar visibly moved"
runs through exactly one narrow waist —
`application/AvatarMovementController.js` turns held keys into an
`AvatarMovementState`, `core/AvatarMovementSimulation.js` turns that
into a new position/rotation/animation, and
`AvatarPresenceSession.update()` is the ONLY thing that ever actually
publishes it. `renderer/AvatarVisual.js` reads presence; it has no
method that accepts a key, an axis, or an intent, and no code path in
this codebase lets one reach it. This is the same shape 0.2.35 already
enforced for appearance vs. position (see "An Avatar's Location Comes
From Presence, Never From The Avatar Itself") — 0.2.36 just adds a
second producer of presence updates (movement, alongside 0.2.33's
initial spawn) without ever creating a second way to reach the
renderer. The payoff arrives in 0.2.37: `AvatarPresence` is ALREADY the
exact stream a network layer needs to broadcast — nothing about
movement had to be re-modeled to make that true, because presence was
never treated as a rendering detail to begin with.

### AvatarPresence Is The Result Of Simulation, Not The Simulation Itself (0.2.36)

`core/AvatarMovementState.js` (an input snapshot: which axes are held,
is Shift down, is Space down) and the small physics bookkeeping
`AvatarMovementController` keeps between ticks (`_verticalVelocity`,
`_grounded`) are both deliberately absent from `AvatarPresence`.
Neither is a fact about where the avatar IS — they are working state
the SIMULATION needs to compute where the avatar is next, and once
that computation is done, they're worthless to anyone else. A future
network peer (0.2.37) receiving a presence update needs to know
Alice's position, rotation, and animation; it has no use for, and
should never have to reason about, whether her mid-air vertical speed
happened to be 3.2 or 4.1 units/second when the packet was sent. This
mirrors `core/AvatarPresence.js`'s own header ("Keyboard -> Movement
simulation -> new Position + Rotation + Animation -> AvatarPresence,"
per the design doc): the arrow only ever points one way, and nothing
upstream of that final arrow is ever preserved past the tick that
produced it.

### Movement Is Kinematic, Not Physically Simulated (0.2.36)

`core/AvatarMovementSimulation.js` knows nothing about bricks,
buildings, or documents — the World View's entire published content is
invisible to it. An avatar can walk straight through a castle wall in
0.2.36, and that is a stated, accepted limitation, not an oversight:
deciding whether a humanoid can walk through a particular brick
structure is a substantially larger problem (is walkability derived
from bricks directly? simplified spatial bounds? streamed locally like
0.2.29's discovery radius?) with its own architectural questions this
milestone does not attempt to answer. What 0.2.36 DOES guarantee,
deliberately, is that movement can never produce an INVALID state
regardless of what's simulated against: `simulateAvatarMovement()`
sanitizes NaN/Infinity on every numeric input, clamps `deltaSeconds`
(so a backgrounded tab resuming can't produce a teleport-sized single
tick), clamps the distance a single tick can cover, and clamps Y to a
reasonable range. "Kinematic, not physical" is a scope boundary on
WHAT the avatar reacts to, never an excuse to skip validating the
numbers that come out the other side.

### Animation Is Driven By Elapsed Time, Never By Frame Count (0.2.36)

`renderer/AnimationLoop.js` now hands every consumer real
`deltaSeconds` (computed from the `requestAnimationFrame` timestamp),
and everything downstream — `AvatarMovementController.tick()`,
`AvatarVisual.tick()`'s gait clock, `core/AvatarPoseOffsets.js`'s
`animationTimeSeconds` parameter — is written in terms of elapsed
seconds, never "one unit per frame." This is not a style preference:
0.2.32 already established that visual state should not accidentally
become platform-dependent (see its own preview-rendering principles),
and a walk cycle is exactly the kind of state where frame-counting
would make it: a 30fps machine and a 144fps machine must cover the
same ground per second and swing through the same gait cycle per
second, which is only possible if speed and animation phase are both
functions of TIME, never of how many frames happened to render. The
test suite checks this directly — ten small ticks and one big tick
covering the same total elapsed time produce identical movement,
regardless of how many ticks it took to get there.

### Following The Avatar Never Redefines What The Camera Is Looking At (0.2.36)

"Follow Avatar" shifts the camera by exactly the avatar's own movement
delta (`SpatialCameraController.moveCamera(delta)` — the same method
that already moves position and target together) and calls NOTHING
else. It never calls `focusDocument()`, never calls
`setActiveDocument()`, and never touches `_focusedDocumentId` or
`_activeDocumentId`. This deliberately keeps 0.2.27's "Camera Focus,
Active Document, and Selection Are Three Different Things" intact by
adding a FOURTH independent concept rather than overloading one of the
first three: the camera can now be anchored to "wherever World View
last focused" (0.2.27's model, unchanged) OR to "the local avatar's own
movement" (0.2.36's addition), and switching between them is a pure
camera-behavior toggle that never touches what document an edit would
land on. A user walking their avatar around while a completely
different document stays the active editing target — the design doc's
own example — is not a special case this needs to guard against; it's
just what happens automatically when two independent things are
actually independent.

### 0.2.37 Establishes Transport Semantics; 0.2.38 Establishes Trust Semantics

`core/PresenceIngestion.js`'s entire rule is "a higher sequence number
wins" — full stop. It does not ask, and 0.2.37 does not attempt to
answer, "is this replica ALLOWED to claim this avatarId," "is this
movement even physically plausible," or "has this avatar been seen
equivocating." Those are exactly 0.2.38's job ("Presence Trust, Replay
& Conflict Handling"), and keeping them out of 0.2.37 on purpose is
what makes 0.2.37 tractable as a first networking milestone: transport
and lifecycle (how does a presence update get from one replica to
another, and how does a replica know when to stop believing one) are
solvable with nothing more than a monotonic counter and a clock. Trust
(should a replica believe what it received) is a genuinely harder,
separable question — the same split 0.2.16's signing layer drew from
0.2.17-0.2.19's delegation/replication/hardening work, applied here to
a live stream instead of a durable record. `core/PresenceIngestion.js`
is deliberately written to tolerate exactly the disorder a real,
UNTRUSTED network produces (reordering, duplicates, gaps) without yet
asking whether the network is being honest about it.

0.2.38 update: it answered all three. "Is this replica ALLOWED to
claim this avatarId" is `core/PresenceAuthority.js`; "has this avatar
been seen equivocating" is `core/PresenceEquivocation.js`. "Is this
movement even physically plausible" is the one question 0.2.38
deliberately still leaves open — see docs/Roadmap.md; nothing in this
milestone inspects a claimed position against the previous one for
plausibility, only for authorization and internal consistency.
Notably, `core/PresenceIngestion.js` ITSELF is unchanged, byte-for-byte,
by 0.2.38 — its one rule remains exactly "a higher sequence number
wins," now reached only AFTER `application/PresenceTrustBoundary.js`
has already confirmed the claim is authorized, non-replayed, and
non-conflicting. Hardening the ingestion boundary meant building
NEW layers around this rule, never rewriting it — see the four
principles immediately below.

### Watching Presence Never Requires Having One (0.2.37)

`WorldNavigationSession._setupRemoteAvatars()` is wired independently
of `hasLocalAvatar()` — a session with no `avatarProfileUseCase`/
`avatarPresenceSession` at all (nobody logged in) still fully
participates in receiving and rendering OTHER replicas' avatars, as
long as a `presenceBroadcastProvider` exists. `CreateWorldViewUseCase`
reflects this by constructing the broadcast provider and avatar
template registry unconditionally, never gated on
`identityProvider.currentUser()` the way the LOCAL avatar stack is.
Seeing who's around is not a privilege of having your own avatar — a
logged-out visitor to World View sees exactly the same moving avatars
a logged-in one does; only PUBLISHING a presence of your own requires
being logged in, which is a completely separate question this
principle deliberately does not conflate with watching.

### A Presence Advertisement Is A Transport Shape, Not A Second Presence Model (0.2.37)

`core/AvatarPresenceAdvertisement.js`'s `toAvatarPresenceAdvertisement()`
produces a plain object with `avatarId`/`ownerIdentity`/`position`/
`rotation`/`animation`/`sequence` — a strict SUBSET of
`AvatarPresence.toJSON()`, missing exactly `timestamp`. That omission
is deliberate, not an oversight: a sender's claimed clock is
information a receiver in a decentralized, no-trust environment has
no business leaning on for anything, least of all deciding how fresh
a claim is (see the next principle). There is exactly ONE presence
model in this codebase — `core/AvatarPresence.js` — and an
advertisement is never a second one; it's the subset of that model
that's actually meaningful to hand to a transport, produced fresh from
the real presence every time, never stored or reasoned about on its
own terms.

### Presence Lifecycle State Is A Derived Observation, Not A Stored Fact (0.2.37)

PRESENT/STALE/ABSENT (`core/PresenceLifecycleState.js`) is never a
field written onto an `AvatarPresenceAdvertisement`, never persisted,
and never claimed by a sender about itself. It is computed fresh, on
demand, from exactly one thing: how long it's been, ON THE RECEIVER'S
OWN CLOCK, since that receiver last actually heard from a given
avatarId (`core/PresenceFreshness.js`). This is why an avatar can
transition from PRESENT to STALE to ABSENT with zero new messages ever
arriving — "is Alice still around" is a judgment Bob makes about his
own observations, not a fact Alice broadcasts. The distinction matters
architecturally: a STORED liveness flag would need to be told to
update; a DERIVED one is automatically correct for every possible
elapsed time, forever, the moment `now` is supplied — precisely why
`derivePresenceLifecycleState()` takes `now` as a parameter rather
than reading a clock itself, keeping it exactly as pure and
independently testable as every other derivation in `core/`.

### Never Let A Transport Callback Write Directly Into Session State (0.2.37)

`presence/LocalAvatarPresenceBroadcastProvider.js`'s `onmessage`
handler does exactly one thing: append to a listener's inbox
(`application/PresenceSyncService.js`'s `_inbox`). It never touches a
`LocalPresenceStore`, never touches `RemoteAvatarRegistry`, and never
reaches the render facade. Ingestion — the moment a raw, untrusted
network message becomes this replica's own accepted state — happens
ONLY inside `PresenceSyncService.pull()`, called on this replica's own
schedule (once per render frame), never synchronously from the
transport event itself. This is the "advertise/pull" round trip the
0.2.37 design doc called for, and it exists for a reason beyond
tidiness: 0.2.38 will need to insert trust checks, rate limits, and
replay defenses at EXACTLY this boundary, and it can only do that
cleanly because 0.2.37 already drew the boundary in one place rather
than letting "a message arrived" and "this replica believes it" be the
same event.

### An Avatar ID Identifies An Avatar; It Does Not Prove Who Currently Controls It (0.2.38)

`core/PresenceAuthority.js`'s `PresenceAuthorityRegistry` is the direct
answer to 0.2.37's own header: "a higher sequence number from ANYONE
currently wins." An `avatarId` is just a string — nothing about
possessing it proves who is allowed to move it. The FIRST claim a
replica accepts for a given `avatarId` establishes who may speak for
it from then on: if that claim was signed, the did:key that produced
it becomes the permanent bound authority; if not, the plain
`ownerIdentity` string is the best available (weaker, spoofable)
check. This is trust-on-first-use, the same property SSH host keys
and every other TOFU scheme accept — deliberately NOT a lookup against
a distributed `AvatarProfile` directory, because building that
directory was never this milestone's job (see "0.2.37 Establishes
Transport Semantics; 0.2.38 Establishes Trust Semantics" above — the
brief was to harden the ingestion boundary already built, not to
invent AvatarProfile distribution as a side effect). The binding is
never cleared when an avatar goes ABSENT and gets pruned from
`application/LocalPresenceStore.js` — a returning participant must
still only be believed as the SAME authority that left.

### Presence Trust Has One Real Policy Axis (0.2.38)

`core/PresenceTrustPolicy.js` has exactly one knob:
`requireSignedPresence`. Every other rejection
`application/PresenceTrustBoundary.js` can produce — a wrong-authority
claim, a replayed claim, an equal-sequence-but-different-content
claim — is never negotiable by policy; only whether the ABSENCE of a
signature is disqualifying is a matter of operator choice. This is
deliberately narrower than `identity/TrustPolicy.js` (0.2.19), which
has several independent knobs (`requireSignedRoot`,
`requireAuthorizedPlacements`, `pinnedAuthorityIdentity`,
`rejectEquivocatingAuthority`...) because a spatial index authority is
a genuinely richer trust relationship than a live avatar's own
presence stream. Reusing that class's SHAPE for
`PresenceTrustPolicy.permissive()`/`.hardened()` was right; reusing
the class ITSELF would have dragged five irrelevant options into a
domain that only ever needed one.

### Replay Detection And Freshness Are Different Questions, Answered By Different Code (0.2.38)

"Have I already accepted this exact claim?" (`core/PresenceReplayWindow.js`)
and "is this claim newer than what I currently hold?"
(`core/PresenceIngestion.js`, unchanged since 0.2.37) sound similar but
diverge exactly at the case that matters: the design doc's own
example, sequence 100 accepted, then 101 accepted, then 100 arrives
again. It is **older** than what's currently held (so "is it newer?"
says no) but it is **also** something this replica already
legitimately accepted once (so "have I seen this exact claim before?"
also says yes) — and the correct classification is REPLAY, not STALE,
specifically because the replica has independent, positive memory of
already having processed it. Conflating the two questions into one
"reject if not newer" rule (0.2.37's original scope, by design) cannot
distinguish "this is old and I've never seen it" from "this is old
because I've ALREADY seen it" — and that distinction is exactly what
tells a diagnostic surface (`core/PresenceDiagnosticsSummary.js`)
whether it's looking at ordinary network disorder or a genuine replay
attempt.

`core/PresenceReplayWindow.js` deliberately does NOT reuse
`replication/ReplayGuard.js` even though both answer the same
question, for a bounded-memory reason specific to presence: ReplayGuard
remembers every hash it has ever seen, forever — correct for the rare,
deliberate events (a `PlacementRecord` revision, a `Delegation`) it was
built for, and a genuine leak for a stream where every accepted WASD
step adds one more permanent entry for as long as a tab stays open.
Real replay detection at this update rate only ever needs to catch
RECENT redelivery, so the replay window remembers a bounded number of
the most recent accepted hashes per avatarId and evicts the oldest —
the same bounded-recency posture a TLS/TCP anti-replay window uses,
never an unbounded "remember forever" set.

### Equal-But-Different Is Still A Conflict, Even At 60Hz (0.2.38)

0.2.18 established this for revision history: two objects that both
claim the same causal position but disagree on content are never
resolved by picking whichever arrived last. `core/PresenceEquivocation.js`'s
`detectPresenceEquivocation()` applies the identical rule to live
avatar presence — the SAME avatarId, at the SAME `sequence`, carrying
DIFFERENT position/rotation/animation — reusing `core/TrustObservation.js`'s
pre-existing `EQUIVOCATING` status verbatim rather than inventing a
parallel vocabulary, because "same authority, same causal position,
different content" was already exactly the right words for this. The
one place this milestone deliberately diverges from a literal reading
of the design doc's own illustrative script: equivocation is only ever
checked AFTER `core/PresenceAuthority.js` has confirmed the incoming
claim shares the SAME bound authority as what's currently held. A
forged claim from an outsider without the real signing key is caught
earlier, as UNAUTHORIZED or INVALID_SIGNATURE — a STRONGER rejection
than "conflict," not a weaker one. Equivocation specifically models
the bound authority ITSELF producing two different claims — a buggy or
compromised client, or two devices racing on one account — never an
attacker who was never authorized to begin with. And exactly like
0.2.18: the currently-held state is never silently replaced by a
losing/competing claim just because it arrived later — see the next
principle.

### Do Not Let Arrival Order Choose A Winner (0.2.38)

For a genuine equivocation (`sequence 42 -> position A` then
`sequence 42 -> position B`), `application/PresenceTrustBoundary.js`
does NOT keep whichever one arrived last — that would make "network
arrival order = reality," exactly the posture 0.2.18-0.2.30 spent this
codebase's whole decentralization arc rejecting. Instead, whichever
claim was accepted FIRST for a given sequence stays the displayed,
authoritative state; every later claim at that same sequence is
rejected and recorded as a `TrustObservation`
(`core/PresenceDiagnosticsSummary.js` surfaces it as "conflicting" in
World View), never silently swapped in. The renderer keeps showing the
last legitimately accepted position throughout — see the next
principle for why the renderer never even has to know a conflict
happened at all.

### Rendering Presence And Trusting Presence Remain Separate (0.2.38)

`application/RemoteAvatarRegistry.js` and `renderer/AvatarRenderer.js`
are UNCHANGED by this milestone — they still only ever read
`{ advertisement, lifecycleState }` off whatever
`PresenceSyncService.pull()` returns and draw exactly that. The new
`trustObservation` field `application/LocalPresenceStore.js` now
attaches to every entry is diagnostics-only: it flows to World View's
unobtrusive summary line (`core/PresenceDiagnosticsSummary.js`,
"Other Avatars: 7 — 3 trusted, 2 stale, 1 conflicting, 1 unavailable"),
never onto the avatar itself, and never into anything the renderer
touches. A questionable presence — unauthorized, replayed, conflicting —
never crashes or even visibly alters the render facade; the WORST case
is that an avatar's position simply stops updating (because the
rejecting claim never reached `LocalPresenceStore.ingest()`'s accepted
path) while its last legitimate pose keeps being displayed exactly as
before. This is the same "presentation state never leaks into
authoritative state, and authoritative state never leaks a raw trust
verdict into presentation" split 0.2.37's interpolation principle
already drew one layer down.

### Selection Identifies What The User Is Interacting With; It Does Not Imply Ownership, Editability, Or Authority (0.2.39)

`application/spatial-state/SpatialSelectionState.js` and the new
`application/spatial-state/AvatarInteractionState.js` both answer the
exact same shape of question — "what is the user currently pointed
at?" — and neither one, by itself, ever grants a capability. Clicking
a brick doesn't mean it's editable (see `getEditabilityNotice`,
0.2.20/0.2.21); clicking an avatar doesn't mean it's yours, movable,
deletable, or even real-time-accurate. `WorldNavigationSession.pick()`
is deliberately the ONLY place a click resolves into a target, and
every one of its branches — brick, avatar, ground, empty — sets state
and nothing more: no editability check, no ownership check, no
authority check happens at pick time. Those questions get asked
LATER, by whatever acts on the target (`getEditabilityNotice` for a
document, `moveSelection` triggering fork-on-write, nothing at all for
an avatar — see the next principle). Keeping "what did I click"
completely separate from "what am I allowed to do to it" is what lets
`getAvatarInfo()` exist at all: an avatar can be a fully legitimate
interaction target that supports being LOOKED AT while supporting zero
of the operations a brick target supports.

### Avatars Are Never Document Selection (0.2.39)

`AvatarInteractionState` and `SpatialSelectionState` are two
INDEPENDENT state slices, not two views onto one shared selection
concept — an avatarId is structurally incapable of ever appearing
inside `SpatialSelectionState`'s `items` array, because nothing in
this codebase ever constructs one that way. This is enforced at three
layers, not just one, so no future change to any single layer can
accidentally blur the line:

  - **Renderer**: `renderer/AvatarPickingService.js` raycasts against
    avatar `AvatarVisual.root` groups; `renderer/PickingService.js`
    raycasts against `MeshRegistry`'s brick meshes. Two disjoint
    object sets, two separate raycasters — an avatar mesh is not even
    a candidate when picking a brick, and vice versa.
  - **Session**: `WorldNavigationSession.pick()` treats an avatar hit
    and a brick/ground hit as mutually exclusive outcomes of the SAME
    click — whichever is nearer the camera wins (see the next
    principle), and the LOSING category is explicitly cleared, never
    left stale.
  - **Everything downstream of selection** — `application/
    SpatialEditingService.js`, `TransformGizmoUseCase`, clipboard,
    groups, undo/redo — reads `SpatialSelectionState` exclusively and
    has no code path that could accept an avatarId even if one were
    somehow constructed. An avatar being "selected" (targeted) can
    never make it into a copied building group, a transform gizmo
    gesture, or a CommandHistory entry — not because those systems
    check and reject it, but because they never see it in the first
    place.

### Whichever Is Nearer Wins, Never Category (0.2.39)

When a brick and an avatar are both along the SAME click ray (an
avatar standing in front of a wall, say), `WorldNavigationSession.pick()`
compares `renderer/PickingService.js`'s and `renderer/
AvatarPickingService.js`'s own raycast `distance` fields and picks
whichever is actually closer to the camera. It deliberately never
hardcodes "bricks always win" or "avatars always win" — either rule
would make the wrong thing selectable exactly when depth actually
matters, which is precisely when a person standing in front of
something is trying to click the PERSON.

### Looking At Something Is Never The Same As Acting On It (0.2.39)

`WorldNavigationSession.getAvatarInfo()` generalizes 0.2.29's
`inspectDocument()` — both are strictly READ paths: they resolve an
identifier into presentation data and touch nothing else. Nothing
`getAvatarInfo()` does can fork a document, move a placement, alter
AvatarPresence, or affect the trust/replay/equivocation state
0.2.38 built. `ui/components/AvatarInfoPanel.js` makes this visible in
the UI too: it renders exactly what the design doc's own mockup shows
and nothing more — no Edit, no Move, no Delete, no Save. The ONE
action available, "Follow", is a pure camera relationship (see
`WorldNavigationSession.followAvatarId()` and 0.2.36's "Following The
Avatar Never Redefines What The Camera Is Looking At") — even the
single interactive affordance this panel offers never touches the
avatar, the document, or anything persisted.

### Avatar Presence Has No Privacy Guarantee Beyond Transport Scope (0.2.39)

Made inspectable for the first time this milestone — `getAvatarInfo()`
exposes a remote avatar's exact position, animation, and trust state
to any replica that receives its presence — this is a good moment to
say plainly what was always implicitly true since 0.2.37: an
`AvatarPresenceAdvertisement` is observable by every peer connected to
the same broadcast transport, with no access control, no audience
scoping, and no notion of "who is allowed to see this" beyond "who is
listening." This is a deliberate, DOCUMENTED boundary, not an
oversight — see docs/Protocol.md. A future `PUBLIC`/`FRIENDS`/`LOCAL`/
`HIDDEN` presence-visibility model is explicitly left for a later,
deliberate milestone (see docs/Roadmap.md); 0.2.39 makes presence data
easier to LOOK AT, but changes nothing about who it's already visible
to.

0.2.40 update: that later milestone. `core/PresenceVisibility.js`/
`core/PresenceVisibilityPolicy.js` give a sender explicit, persistent
control over whether their presence is even eligible to be advertised
at all — see the principles immediately below. Read this paragraph's
own claim carefully, though: it is STILL true, even now. Nothing about
0.2.40 adds access control, encryption, or audience scoping to the
WIRE — an advertisement that IS sent remains exactly as visible to
every peer on the transport as it always was. What changed is entirely
upstream of the wire: a sender can now choose not to send at all.

### Visibility Happens Before Broadcasting, Never After (0.2.40)

`WorldNavigationSession._setupLocalAvatar()`'s publish path now
consults `PresenceVisibilityPolicy.shouldAdvertise()` BEFORE calling
`PresenceSyncService.publish()` — never as a filter a receiver applies
after the fact, and never by publishing an advertisement that has been
obscured or encrypted so only some recipients can read it. This is a
narrower, more honest promise than it might sound: HIDDEN means
`publish()` is simply never called, full stop — not "publish something
nobody can decode." A design that instead broadcast-then-hid, or
broadcast-then-encrypted, would have LOOKED equivalent from the UI but
would have been lying about what it actually guarantees — see
`core/PresenceVisibilityPolicy.js`'s own header for exactly why FRIENDS
mode is honest about NOT yet providing real per-recipient
confidentiality, given the only transport that exists today
(`presence/LocalAvatarPresenceBroadcastProvider.js`) has no
per-recipient addressing at all. Trust (`application/
PresenceTrustBoundary.js`, 0.2.38) and visibility are deliberately
opposite sides of the same boundary: visibility is the SENDER asking
"should I even send this," trust is the RECEIVER asking "should I
believe what arrived" — see docs/Architecture.md's own diagram.

### AvatarProfile, AvatarPresence, and PresenceVisibilityPolicy Are Three Independent Concerns (0.2.40)

```text
AvatarProfile             = what I look like        (persistent)
AvatarPresence             = where I am               (ephemeral)
PresenceVisibilityPolicy  = who may receive my presence (persistent)
```

Three separate persisted-or-ephemeral models, three separate storage
keys (`avatar-profile:<username>`, none for AvatarPresence — it is
never persisted at all — and `presence-visibility:<username>`), and in
`ui/views/AvatarSettingsView.js`, two genuinely independent forms with
two independent Save actions. Changing your visibility policy can
never accidentally alter your appearance; changing your appearance can
never accidentally alter who can see you. `PresenceVisibilityPolicy`
is deliberately NOT a field on `AvatarPresence` (which would tie a
rarely-changed preference to a stream published many times a second)
and NOT a field on `WorldPlacement` (avatars and documents remain
fundamentally different entities — see "Avatars Are Never Document
Selection," 0.2.39). The one thing all three DO share is the same
"stable per-owner configuration, created once with a safe default,
persisted through an injected StorageProvider" shape — see
`application/PresenceVisibilityUseCase.js`, deliberately mirroring
`application/AvatarProfileUseCase.js` structurally without merging
the two.

### A Policy Abstraction Can Exist Before The Mechanism It Fully Assumes (0.2.40)

`PresenceVisibility.LOCAL` and `PresenceVisibility.PUBLIC` are
OBSERVATIONALLY IDENTICAL today — `PresenceVisibilityPolicy.shouldAdvertise()`
returns `true` for both, honestly, because only one transport scope
exists (`presence/LocalAvatarPresenceBroadcastProvider.js`'s same-origin
`BroadcastChannel`) for LOCAL to meaningfully confine itself to versus
PUBLIC. Modeling the distinction NOW, even though it currently changes
nothing observable, is deliberate: the day a wider-reach transport
(WebRTC, a relay) is added, LOCAL's meaning is already fully specified
— "never use that transport, even though it's available" — and
implementing it needs to change only the publish-routing code that
picks a transport, never `PresenceVisibilityPolicy` itself or anything
that already reads a `visibility` value. The same reasoning applies to
FRIENDS: `authorizedPeerIdentities` is a real, persisted, honestly-
described allow-list today (see the previous principle for what it
does and does not yet guarantee), ready for a future point-to-point
transport to actually address without this class changing shape at
all.

### The Authoritative Position Is Always The Latest Presence; Interpolation Is Only Ever A Presentation Detail (0.2.37)

`application/RemoteAvatarInterpolator.js` tracks two things: `_to`
(the latest AvatarPresenceAdvertisement this replica has actually
accepted — the authoritative value) and a smoothed, time-based blend
toward it that only ever feeds the renderer. `sequence` getter reads
`_to.sequence`, never anything interpolation-derived — nothing about
"where does this avatar look like it currently is, mid-blend" is ever
treated as ground truth, persisted, forwarded to another replica, or
used to decide whether a FUTURE update should be accepted
(`core/PresenceIngestion.js` always compares against the real stored
advertisement). This separation is what makes visual smoothing free to
change (durations, easing, a future physically-based blend) without
touching correctness at all — exactly the same "presentation state
never leaks into authoritative state" boundary
`renderer/AvatarVisual.js`'s own gait clock (0.2.36) already draws for
local animation, applied here to remote position instead of local
pose.

### Appearance And Position Are Different Lifecycles, Never One Message (0.2.41)

Presence says WHERE an avatar is; the avatar profile says WHAT it
looks like — and 0.2.41 keeps that split all the way down to the
wire, not just in the local `AvatarProfileUseCase`/`AvatarPresenceSession`
data model 0.2.35 already established:

```text
AvatarPresenceAdvertisement  — WHERE  — high-frequency  — bounded replay window   — presence/LocalAvatarPresenceBroadcastProvider('forkbuild:avatar-presence')
AvatarProfileAdvertisement   — WHAT   — low-frequency   — unbounded replay guard  — presence/LocalAvatarPresenceBroadcastProvider('forkbuild:avatar-profile')
```

Two separate wire shapes, two separate `BroadcastChannel` names, two
separate sync services (`application/PresenceSyncService.js` and
`application/AvatarProfileSyncService.js`), two separate trust
boundaries (`application/PresenceTrustBoundary.js` and `application/
AvatarProfileTrustBoundary.js`), and two separate stores (`application/
LocalPresenceStore.js`, which prunes on a wall-clock timer, and
`application/LocalAvatarProfileStore.js`, which never does — see the
next principle for why that difference is not an oversight). A single
combined "here's everything about avatar X" message was explicitly
rejected: it would force every WASD step to re-transmit an appearance
that changes maybe once a session, and it would force a mid-session
customization to wait for the next movement tick to have anywhere to
ride. `application/RemoteAvatarRegistry.js` and `application/
RemoteAvatarAppearanceRegistry.js` mirror the split exactly one layer
up — the render facade only ever sees the two combined, at the very
last step, in `application/RenderWorldViewUseCase.js`'s
`setRemoteAvatar`/`updateRemoteAvatarAppearance` calls.

Because the two transports are genuinely independent, they race:
either advertisement can arrive first for a brand-new remote avatarId.
`RemoteAvatarRegistry.sync()`'s new-avatar branch always asks its
injected `appearanceResolver` for the CURRENT best-known appearance
before creating a visual, and `WorldNavigationSession`'s own per-frame
callback deliberately drains the PROFILE inbox before the PRESENCE
one — so a profile that already arrived is on hand the moment a
brand-new visual is first created, rather than being wasted on a
placeholder that then never gets corrected until the profile's own
revision changes again. See `tests/AvatarAppearanceSync.test.js`'s
flagship for this race exercised for real, over real
`BroadcastChannel`s, with the profile message sent (and delivered)
before the presence message that first makes the avatar visible.

### Appearance Is Durable; Presence Is Ephemeral — Neither Store Prunes Like The Other (0.2.41)

`application/LocalPresenceStore.js` prunes ABSENT avatars on a
wall-clock timer (`staleAfterMs`/`absentAfterMs`) because a stopped
movement stream really does mean "I no longer know where this replica
currently is." `application/LocalAvatarProfileStore.js` has no such
timer at all, and that is deliberate, not an oversight: Alice's last
known outfit remains the right thing for Bob to keep rendering even
while she is temporarily STALE or fully ABSENT in presence terms — an
avatar's LOOK does not expire just because its owner stopped moving
for a while. A profile record is only ever removed explicitly, driven
by `WorldNavigationSession` calling `RemoteAvatarAppearanceRegistry.
forget()` the moment `RemoteAvatarRegistry.sync()` decides a remote
avatar's PRESENCE has disappeared for good — appearance bookkeeping
follows presence lifecycle's lead, never the other way around, and
never on its own clock. `tests/AvatarAppearanceSync.test.js`'s
flagship proves this directly: it fast-forwards a replica's clock far
enough to prune a peer's presence to ABSENT, confirms the profile
store still answers with her real appearance, and confirms that
appearance is reapplied immediately — not rebuilt from a placeholder —
the moment her presence reappears.

### Presence And Profile Share One Publication Gate (0.2.41)

`PresenceVisibilityPolicy` (0.2.40) was built as "who may receive my
PRESENCE," but `WorldNavigationSession._publishLocalAvatarProfile()`
reuses the exact same `shouldAdvertise()` check before a profile
advertisement is ever handed to its own transport. This is a
deliberate reuse, not a naming coincidence: HIDDEN (or FRIENDS with an
empty allow-list) meaning "nobody sees me move" but "everybody still
sees what I look like" would be a genuinely confusing, half-kept
privacy promise — a viewer who can't see you at all has no business
learning your customized appearance either. There is still no second,
independently-configured privacy system for profiles, exactly as
`core/AvatarProfileAdvertisement.js`'s own header states — one policy,
consulted at two publish call sites (an explicit profile edit, and the
periodic republish tick below), both gated the same way presence
publishing already was in 0.2.40.

### A Fire-And-Forget Transport Needs Its Own "Catch Me Up," Deliberately Rare (0.2.41)

Movement republishes presence on every accepted update, so a replica
that joins mid-session naturally sees a peer's position within one
WASD step of them existing at all. A profile has no equivalent natural
trigger — someone who customized their avatar and then never touches
Avatar Creator again would otherwise be invisible-in-appearance to any
replica that joined after their one-and-only edit, forever, on a
transport (`BroadcastChannel`) with no request/response "send me your
current state" primitive. `PROFILE_REPUBLISH_INTERVAL_MS` (15 seconds,
`application/WorldNavigationSession.js`) exists ONLY to close that gap
— `_lastProfilePublishAt` starts at `0`, which reads as "never yet
published," so the very first real animation frame after a local
avatar exists publishes immediately, and every 15 seconds after that
whether or not anything actually changed. This is deliberately much
less frequent than presence (published on every accepted movement, not
on a timer at all) — see `core/AvatarProfileAdvertisement.js`'s own
header: appearance is low-frequency, persistent state, and re-sending
it every frame the way presence does would be pure waste for data that
essentially never changes.

### Collision Is A Constraint Applied To Movement, Never Part Of The Movement Simulation Itself (0.2.42)

`core/AvatarMovementSimulation.js` (0.2.36) is UNTOUCHED by this
milestone — still the same pure, Three.js-free, world-geometry-free
kinematics it always was, still producing a PROPOSED position from
input intent alone. Collision (`core/AvatarCollision.js`,
`application/AvatarMovementConstraint.js`) is a completely separate
step, applied AFTER simulation, BEFORE the result reaches
`AvatarPresence` — see `application/AvatarMovementController.js`'s own
`tick()`: simulate first, constrain second, publish third. This is a
deliberate design choice, not a convenient accident: mixing "what does
the player want to do" with "what does the world's geometry allow"
into one function would make BOTH harder to reason about and test
independently, and would tie a pure, trivially-unit-testable kernel to
whatever collision geometry happens to exist. The same "one pure
kernel, one separate constraint step applied to its output" shape
`core/PresenceIngestion.js` and `application/PresenceTrustBoundary.js`
already draw between "is this claim newer" and "should I trust it at
all" — applied here to movement instead of network trust.

### The Local Avatar Is Constrained By Collision Geometry Currently Available To This Replica, Never By The Entire World (0.2.42)

This project has spent every avatar milestone since 0.2.37 being
honest about what a decentralized replica actually knows — presence
visibility is transport-scoped (0.2.39), profile appearance is only
what has actually been received (0.2.41), and the World View itself
only ever renders what `updateSpatialView()` has streamed in within
`STREAMING_RADIUS`. Collision extends that same honesty to movement:
`application/AvatarMovementConstraint.js` reads WorldNavigationSession's
own `_loadedDocuments` Map — BY REFERENCE, never a snapshot — so a
building outside the streaming radius was never asked for and cannot
suddenly become a collision obstacle, and a building that streams OUT
(the camera moves away) stops obstructing on the very next tick, with
no separate unload step of its own. The correct claim this milestone
makes is never "the avatar cannot walk through anything that exists in
the world" — it is "the local avatar is constrained by collision
geometry currently available to this replica." `tests/AvatarCollision.test.js`
tests this directly and explicitly: the exact same wall, published and
placed identically, blocks movement when loaded and does NOT when it
isn't — proving the boundary is real, not incidental.

### Collision Is Derived From Document + Placement, Never A Third Relationship (0.2.42)

```text
Document           = WHAT exists
WorldPlacement      = WHERE the document exists
AvatarPresence      = WHERE the person is
                      ↓
              collision geometry — DERIVED, not stored
```

`application/AvatarMovementConstraint.js` computes every obstacle AABB
fresh, on demand, every tick, from a brick's own position plus its
`BrickRegistry` dimensions plus the document's own world-layout offset
(`WorldNavigationSession._getWorldPosition`, the same source of truth
spawning/focusing/forking already use). Nothing here is ever
persisted: no collision record, no cache surviving a tick, no new
storage key. And critically, no `Avatar → Document` relationship is
ever created just because an avatar's movement happened to be
constrained by that document's geometry — touching a wall does not
make Alice an editor of it, a collaborator on it, or anything else
that would need to be recorded. Collision is read-only geometry
math applied to two already-existing facts, exactly as ephemeral as
the movement tick that consulted it.

### Collided Is Movement Information, Not An Animation Vocabulary (0.2.42)

`core/AvatarAnimationState.js` gains nothing this milestone — still
exactly `IDLE`/`WALKING`/`RUNNING`/`JUMPING`, the same four values
0.2.35 established. Whether the most recent tick's movement was
altered by collision (`AvatarMovementController.isCollided()`) is
transient, per-tick bookkeeping — exactly like `_verticalVelocity`/
`_grounded` before it — never persisted, never part of
`AvatarPresence`'s own wire shape (`tests/AvatarCollision.test.js`
checks this directly: `'collided' in presence.toJSON()` is always
false), and never a `BLOCKED` animation state standing alongside
`IDLE`/`WALKING`/`RUNNING`/`JUMPING`. The distinction matters: an
animation state describes what the avatar's BODY is currently doing
(a walk cycle, a jump arc) — a discrete, closed vocabulary every
`AvatarTemplate` declares support for. "Collided" describes something
that happened to the REQUESTED movement, a fact about input vs.
outcome, not a pose. Conflating the two would mean every future
consumer of animation state (the renderer, a future network peer) has
to understand collision to render an avatar walking in place against
a wall, when in truth nothing about that avatar's ANIMATION changed at
all — it's still walking, it's simply not going anywhere.

### Start Simple: A Box Is A Good Enough Capsule (0.2.42)

`core/AvatarCollision.js` approximates the avatar as a single upright
axis-aligned bounding box (`AVATAR_COLLISION_RADIUS`/
`AVATAR_COLLISION_HEIGHT`), not a true capsule, and every brick's
collision bounds as an axis-aligned box built from its
`BrickDefinition` dimensions, deliberately ignoring `Brick.rotation` —
the same simplification `application/SelectionBoundsService.js`
already makes for gizmo bounds (0.1.38 onward), applied here to a new
purpose. Full arbitrary mesh collision — thousands of objects,
arbitrary rotations, groups — was explicitly out of scope for this
first collision milestone (see docs/Roadmap.md): the client does not
necessarily have every object loaded (see the streaming-honesty
principle above), and treating rendered Three.js meshes as the
authoritative collision model would tie movement correctness to
render state in a way this codebase has consistently avoided
elsewhere (`core/` stays engine-agnostic throughout). A rotated brick
colliding as if it weren't, or a corner brick's diagonal edge being
slightly more permissive than its true silhouette, are honestly
accepted simplifications, not oversights — exactly the same posture
`application/SelectionBoundsService.js`'s own header already takes.

### Proximity Is Derived, Never Announced (0.2.43)

```text
Alice's position   ─┐
                     ├──►  local geometric calculation  ──►  "Bob is 4.7 World Units away"
Bob's known presence ┘
```

`core/AvatarProximity.js#computeNearbyAvatars()` is a pure function
over data Alice's own replica ALREADY holds — her own current
position, and the SAME trusted remote-presence list
`application/RemoteAvatarRegistry.js` already renders from. There is
no message anywhere in this protocol that means "I am near you," and
there never will be one — see docs/Protocol.md. This isn't a missing
feature; it's the correct design. A proximity CLAIM sent over the wire
would be exactly the kind of fact 0.2.18's replication work already
taught this codebase to be suspicious of: it could be stale, it could
be wrong, and worse, it could disagree — Alice announcing "Bob is 2
units away" while Bob's own replica computes "Alice is 5 units away"
from his own position is not a bug to reconcile, it's two independent,
equally valid local computations that were NEVER supposed to have to
agree with each other, because neither one is a claim about the
other's world state. Compare `core/SpatialQuery.js`'s own
`distanceBetween()` (0.2.28), reused here verbatim: "how far away is
that document" was already understood to be a purely local
computation over already-known coordinates, never something a
publication itself needed to declare about its own position relative
to a viewer. Proximity between two avatars is the identical shape of
fact, one layer up.

### Nearness Never Authorizes Mutation (0.2.43)

```text
Near Alice
   │
   ├── Can inspect Alice        (getAvatarInfo(), reused unmodified)
   ├── Can follow Alice          (followAvatarId(), reused unmodified)
   ├── Can target Alice          (targetAvatar(), new — but writes ONLY
   │                              the caller's own _avatarInteraction)
   │
   ╳ Cannot modify Alice
   ╳ Cannot move Alice
   ╳ Cannot modify Alice's profile
```

This is true by construction, not by a permission check anywhere:
`application/WorldNavigationSession.js` has never had, and 0.2.43 adds
no method that would give it, any way to write to a REMOTE avatar's
own `AvatarPresence` or `AvatarProfile`. `targetAvatar(avatarId)`
mutates exactly one thing — `this._avatarInteraction`, the CALLER's
own local UI-focus state — the identical scope `pick()`'s avatar
branch already had since 0.2.39; being close enough to appear in
`getNearbyAvatars()` changes nothing about what operations are even
reachable. `tests/AvatarProximity.test.js`'s flagship proves this
directly rather than just by absence: after an entire scripted
scenario of proximity queries, display-name resolution, targeting, and
following, Alice's own `AvatarProfile`/`AvatarPresence` — read from
HER OWN session, never Bob's — are asserted byte-for-byte identical to
their values before Bob ever looked at her. This is the explicit
boundary the design doc asked for, and it's also exactly why
avatar-avatar COLLISION (a later milestone, if ever taken up) is a
genuinely different and harder problem than proximity: collision would
require one replica's movement decision to depend on another
replica's remote, interpolated, potentially-stale position — a real
multiplayer-authority question proximity, by design, never raises,
because proximity never decides anything about what happens next, it
only reports a distance.

### A New Way To Reach An Avatar Is Not A New Way To Inspect One (0.2.43)

`ui/components/NearbyAvatarsPanel.js` and
`WorldNavigationSession.targetAvatar()` add a SECOND path to an
avatarId — a "Nearby Avatars" list row instead of a 3D-viewport
raycast — but deliberately not a second inspection surface, a second
follow mechanism, or a second status vocabulary. Clicking a row calls
`targetAvatar()`, which sets `_avatarInteraction` exactly the way
`pick()`'s avatar branch already does; the SAME `getAvatarInfo()` the
Avatar Info panel already reads answers immediately, and the SAME
"Follow" button, wired to the SAME `followAvatarId()`, already works —
see the design doc's own instruction, "no new camera mechanism is
necessary." `ui/components/NearbyAvatarsPanel.js` even reuses
`application/AvatarPresenceLabels.js` and `.avatar-info-status-dot`'s
own CSS verbatim, the identical lifecycle/trust vocabulary
`AvatarInfoPanel` already established — one status dot means one thing
everywhere in this UI. The only genuinely new code is the ONE thing
that's actually new: knowing an avatarId is worth reaching at all
because it's nearby.

### Observation Does Not Imply Authority, And Interaction Does Not Imply Control (0.2.44)

```text
Bob targets Alice
       │
Bob chooses "Wave"
       │
Bob's own local AvatarInteractionState
       │
Bob's OWN avatar performs a WAVE pose
       │
Alice's replica never hears about any of this.
```

0.2.43 already established that nearness never authorizes mutation;
0.2.44 extends the identical boundary to the next question a design
doc could easily get wrong: does WANTING to interact with Alice give
Bob any reach into Alice's own state? No. `WorldNavigationSession.
performAvatarInteraction(kind)` is, by construction, incapable of
touching anything belonging to a remote avatar — it reads and writes
exactly one thing, `this._avatarInteraction`, the SAME caller-local
slice `targetAvatar()` already owned since 0.2.39. A GREET/WAVE/POINT
gesture never becomes a message, a presence update, or a profile edit;
it is rendered, locally, on the ACTOR's own avatar only —
`renderer/AvatarVisual.js#setGesture()` is called exclusively through
`RenderWorldViewUseCase`'s `setLocalAvatarGesture`, which has no
remote-avatar counterpart at all. There is no
`setRemoteAvatarGesture()` in this codebase, on purpose: building one
would be building the exact thing this milestone's design doc asked to
defer to 0.2.45, and building it "by accident" as a side effect of a
UI button is precisely the failure mode this principle exists to name
and refuse.

### A Gesture Is Presentation, Never Presence (0.2.44)

`core/AvatarInteractionKind.js`'s NONE/GREET/WAVE/POINT vocabulary is
deliberately its OWN closed vocabulary, never a new value added to
`core/AvatarAnimationState.js`. That distinction is not stylistic:
`AvatarAnimationState` values live on `AvatarPresence.animation`,
which `core/AvatarPresenceAdvertisement.js` broadcasts to every
replica on every accepted movement. Had GREET/WAVE/POINT been added
there instead, performing a gesture would have silently started
NETWORKING it — the exact scope the 0.2.44 design doc explicitly
deferred to a later, deliberately-designed protocol milestone. Keeping
the two vocabularies separate makes "a local gesture cannot reach the
wire" true by construction: there is no code path that reads an
`AvatarInteractionKind` value and writes it into an `AvatarPresence`
or an advertisement. The same split applies to FACING: when Bob
targets Alice, `WorldNavigationSession` may compute a temporary yaw
that makes Bob's avatar visually face her
(`core/AvatarFacing.js#computeFacingYawDegrees()`), but that yaw is
applied only as `renderer/AvatarVisual.js`'s `setFacingOverride()` — a
transform written directly onto the Three.js root, never onto
`AvatarPresence.rotation`. An actively-moving player's own input
always wins (`AvatarMovementController#hasMovementInput()` gates the
override off entirely), and the override never survives a real
presence-driven `setPose()` call once movement resumes. Both gesture
and facing, in other words, are exactly the kind of fact 0.2.36's own
gait clock already established a precedent for: something the renderer
tracks ON TOP OF presence, that presence itself never needs to know
about.

### Interaction Cooldowns Exist Before Interactions Are Networked (0.2.44)

`core/AvatarInteractionCooldown.js`'s `canPerformInteraction()` gates
every GREET/WAVE/POINT through one shared rate limit, entirely locally
— there is no attacker to defend against yet, since nothing here
reaches another replica. That is deliberate, not premature: the
invariant "a user cannot flood the system by holding a button" is
established and tested NOW, under the easy conditions (one process,
one sender, a trusted local clock), specifically so that 0.2.45's
networked version of interactions inherits an already-proven building
block instead of inventing rate-limiting for the first time under the
much harder conditions of a shared, adversarial transport. Compare
0.2.42's collision geometry existing a full milestone before it was
ever asked to resolve a NETWORKED avatar-avatar conflict — building
the locally-scoped version of a hard problem first, and getting its
edge cases right while the stakes are low, is the established pattern
this milestone continues rather than a new one it invents.

### State Synchronization And Event Synchronization Are Different Protocols (0.2.45)

`application/PresenceSyncService.js` and `application/AvatarProfileSyncService.js`
both answer the same underlying question — "what is the LATEST thing
this avatarId has told me?" — and both keep exactly one record per
avatarId to answer it. `application/AvatarInteractionSyncService.js`
answers a genuinely different question — "did anything NEW just
happen?" — and keeps no record at all: `pull()` returns a fresh,
transient batch of newly-accepted events every call, never a
`list()`/`get()` a caller can ask for again later. This is not a
missing feature; it is the correct shape for what an interaction IS.

The test is simple and durable: if Alice disappears for ten minutes
and reconnects, a returning replica wants her LATEST profile and
LATEST presence — never her presence from nine minutes ago, and
certainly never ten minutes of queued-up waves replayed on arrival.

    Profile     -> retain latest   (durable identity, rarely changes)
    Presence    -> retain latest while fresh (ephemeral, continuously updated)
    Interaction -> don't retain at all (an event, not a value)

A future milestone tempted to add "interaction history" or "replay a
missed gesture on reconnect" is not extending this protocol — it is
choosing to build a DIFFERENT one, deliberately, with its own
persistence and trust story. That is a legitimate future milestone
(chat/notifications-adjacent), not a bug fix to this one.

### Presence Describes An Avatar's Current State; Interaction Describes An Event That Happened (0.2.45)

`core/AvatarInteractionAdvertisement.js` is deliberately its own wire
shape, never a field bolted onto `AvatarPresenceAdvertisement` — see
0.2.44's own "A Gesture Is Presentation, Never Presence," now extended
across the wire instead of just within one replica. Presence answers
"where/how is Bob RIGHT NOW" — a question with exactly one current
answer, replaced wholesale by whatever arrives next.  Interaction
answers "what did Bob just DO" — a question with a NEW answer every
time, none of which ever supersede or replace a previous one; they
simply keep happening.

Folding `kind`/`targetAvatarId` onto `AvatarPresenceAdvertisement`
would have been the cheaper implementation in the short term (one
fewer channel, one fewer trust boundary) and the wrong one: every
single movement update would then need to carry gesture fields most of
the time set to nothing, multiplying presence traffic for no reason,
and — far more importantly — it would make "gestures accidentally
becoming part of presence" a permanent structural risk instead of
something that plainly cannot happen, exactly the trap 0.2.44's own
local-only vocabulary was built to avoid one layer down.

### A Claimed Target Is Never An Instruction (0.2.45)

`AvatarInteractionAdvertisement.targetAvatarId` says "the sender claims
to have performed this gesture directed at this avatarId." A receiving
replica — whether it's the named target, or merely a bystander who
happens to also know both avatars — reads this as exactly that claim,
and nothing more. There is no code path anywhere in this milestone
that reads an incoming `targetAvatarId`, matches it against the local
avatar's own id, and does anything DIFFERENT as a result — no forced
camera turn, no auto-opened panel, no state change on the named
target's own replica. `application/WorldNavigationSession.js`'s
`_applyRemoteAvatarInteraction()` renders the gesture on the SENDER's
own avatar visual (`event.avatarId`), never touches anything keyed by
`event.targetAvatarId` at all.

This is 0.2.44's "wanting to interact with another avatar gives zero
reach into that avatar's own state" carried across the wire intact —
the network does not get to reintroduce an authority relationship a
single replica was never allowed to have. It is also what makes
Charlie's case (a bystander, neither sender nor target) unremarkable
rather than a special case requiring its own rule: Charlie's replica
receives the identical advertisement Alice's does, and both apply the
identical, target-blind rendering rule. Whether Charlie's client
chooses to actually SHOW it is a local presentation decision no
protocol field controls.

### A Bounded Replay Window Can Do Double Duty For An Identity And An Ordering Question At Once (0.2.45)

`core/AvatarInteractionReplayWindow.js` answers two related but
distinct questions from one bounded structure per avatarId: "have I
seen this exact `interactionId` before?" (duplicate suppression,
identity-based, order-independent) and "is this at least as new as the
newest thing I've accepted from this avatarId?" (staleness rejection,
sequence-based, order-DEPENDENT). `core/PresenceReplayWindow.js` only
ever answers the first question for presence, because
`core/PresenceIngestion.js`'s monotonic-sequence rule is checked
against a full retained "current advertisement" instead — a structure
interaction deliberately doesn't keep (see this milestone's first
principle above). Combining both concerns into ONE bounded window,
rather than reusing PresenceReplayWindow's shape by itself, is what
lets `application/AvatarInteractionTrustBoundary.js` reject a replayed
OR a genuinely-old-but-never-before-seen event without retaining
anything beyond a handful of recent ids and one integer per avatarId.

### An Event Stream Has No Room For Equivocation Detection, And That Gap Is Named, Not Hidden (0.2.45)

`application/AvatarInteractionTrustBoundary.js` has no equivocation
check, unlike `application/PresenceTrustBoundary.js`/
`AvatarProfileTrustBoundary.js`. Equivocation detection needs a
retained "current claim at this causal position" to compare a
competing one against; 0.2.45 deliberately keeps no such thing for
interactions (see this milestone's first principle above) — there is
nothing to equivocate WITH. The narrower, genuinely adversarial
question this leaves open — the SAME bound signing authority producing
two DIFFERENT `interactionId`s at the identical `sequence`, racing to
see which one a given replica happens to process first — is real, and
is left to a future milestone rather than solved here; it remains
unscheduled, since 0.2.46 opened an entirely different arc (Local
Identity & Authentication Session — see docs/Roadmap.md) instead of
continuing the avatar interaction trust work. What 0.2.45 DOES
still guarantee even without it: `sequence` must strictly increase to
be accepted at all, so a second claim reusing an already-used sequence
is at minimum rejected as STALE, never silently rendered as if it were
new. A gap that is named in the code and the docs, with a monotonic
fallback already in place, is a deliberate scope boundary; a gap that
is simply never mentioned is a bug waiting to be discovered later.

### Login Unlocks An Identity; It Does Not Derive One From A Typed Name (0.2.46)

Before 0.2.46, `login(username)` lazily generated a keypair FROM the
typed string the first time it was needed — so "logging back in" meant
retyping the same string and trusting it would happen to resolve to
the same key, and there was no way for a user to see, choose among, or
knowingly return to a specific identity; the string itself was the
only handle on it. 0.2.46 makes identity creation and identity
selection two different, explicit verbs:
`identity/LocalIdentityProvider.js#createLocalIdentity(label)` mints a
keypair and stores it in a durable, listable index, independent of any
login flow; `authenticate(identityId)` unlocks one specific identity
this device already holds, addressed by its own `identityId`, never
re-derived from a label. `ui/components/LoginModal.js` reflects this
directly: it lists every identity the device holds
(`IdentityUseCase.listIdentities()`) so logging back in is picking
from that list, and "Create New Identity" is its own explicit button,
never a side effect of typing a name that happens to be new. The
legacy `login(username)` call is kept, unchanged, as a genuine
convenience on top of this — find-or-create by label, then authenticate
— not because label-based lookup is the right long-term model, but
because every existing caller depends on its exact behavior and losing
nothing by keeping it. What changed is that it is no longer the ONLY
way to reach an identity.

### Identity Existence And Session Authentication Are Independent Facts (0.2.46)

A `LocalIdentity` existing on a device (`listLocalIdentities()`
includes it) and that identity currently being authenticated
(`currentSession().identityId === it`) are two different, independently
true-or-false facts, deliberately never collapsed into one. Creating an
identity (`createLocalIdentity()`) does not authenticate a session;
ending a session (`endSession()`/`logout()`) does not delete or forget
the identity or its key; switching which identity is authenticated
(`authenticate()`) never touches any OTHER identity this device holds.
`tests/LocalIdentitySession.test.js` proves each direction directly:
signing is refused immediately after creating an identity (session
still `ANONYMOUS`), and signing is refused immediately after logging
out even though `listLocalIdentities()` still lists the identity and
re-authenticating recovers the exact same `identityId`. This is what
makes multi-identity devices possible without special-casing: a "Work
Account" and a "Personal Account" are just two `LocalIdentity` entries,
and switching between them is nothing more than which one the single
`AuthenticationSession` currently names — never a delete-and-recreate,
never a per-identity storage wipe. `currentUser()` and
`getSigningIdentity()` are both, deliberately, PURE FUNCTIONS of
`currentSession()` — derived views, never a second place either fact
could be separately, and wrongly, recorded.

### Identity Existence, Vault Unlock, And Session Authentication Are Three Independent Facts, Not Two (0.2.47)

0.2.46 established that a `LocalIdentity` existing and its
`AuthenticationSession` being authenticated are independent facts.
0.2.47 adds a THIRD: whether that identity's private key is currently
DECRYPTED (`identity/VaultLock.js`). All three can disagree with each
other at once, and the codebase never collapses any two of them into
one: a protected identity can exist on a device that has never
authenticated it (created, never logged into); it can be AUTHENTICATED
— the app shows it as the active user — while its vault is LOCKED, if
an idle timeout or an explicit `lock()` call evicted the decrypted seed
since the last unlock; and ending a session (`endSession()`) evicts the
vault too, so a fresh `authenticate()` afterward always asks for the
passphrase again rather than silently reusing a stale unlock. The
clearest proof this is a real, load-bearing distinction rather than
accounting trivia: a simulated page reload (a fresh
`LocalIdentityProvider` instance reading the SAME storage) keeps the
identity (durable) and the session (persisted), but NOT the vault
(deliberately never persisted at all) — see
`tests/IdentityKeyProtection.test.js`, "identity/session/vault: three
independent facts, only the vault resets on reload." Reusing the
1-of-2 mental model from 0.2.46 — "not authenticated" is the only
reason signing could fail — would have made "identity is locked" an
impossible-to-express error; `_requireAuthenticatedIdentity()` checks
the session first and the vault second, deliberately, because they are
answering genuinely different questions.

### An Unlocked Vault Must Never Touch Storage (0.2.47)

The entire security property `identity/KeyEncryption.js` provides
collapses to nothing the moment a decrypted seed, or any fact that
trivially reconstructs one, is written to `StorageProvider`. So it
never is: `LocalIdentityProvider._vaultCache` is a plain in-memory
`Map`, constructed fresh by every `new LocalIdentityProvider(...)`
call, with no `save()`/`load()` call anywhere near it. This is a
structural guarantee, not a convention that has to be remembered per
call site — there is exactly one place in the entire file that ever
writes to `_vaultCache` (`unlock()`) and exactly two that ever clear an
entry (`lock()`, and the lazy expiry check inside `vaultLock()`), and
none of the three touch `_storageProvider`. The direct, useful
consequence: a protected identity's vault is ALWAYS locked on a fresh
page load, with no special-case code needed to enforce it — there is
simply nothing durable an unlock could have left behind to check
against.

### A Wrong Passphrase And A Tampered Record Must Fail Identically (0.2.47)

`KeyEncryption.decrypt()` never distinguishes "the passphrase was
wrong" from "the stored record was corrupted or tampered with" — both
produce the exact same `IncorrectPassphraseError`, because the
mechanism that catches each is the same: an HMAC-SHA512 tag, computed
under a key derived from the ATTEMPTED passphrase, checked in constant
time against the tag stored alongside the ciphertext, BEFORE the
ciphertext is decrypted at all. This is encrypt-then-MAC specifically
because the alternative — decrypt first, see if the result looks like
a plausible 32-byte seed — has no reliable failure signal: a wrong
passphrase run through SHA512-CTR produces 32 bytes that are
statistically indistinguishable from a valid seed, so "did decryption
succeed?" is not a question that construction could ever honestly
answer. Checking the tag first means a wrong guess is rejected
outright, loudly, every time — never silently accepted as an
Ed25519 key that happens to produce nonsense signatures nobody
notices are invalid until they fail verification somewhere downstream.

### Failed-Unlock Lockout Is Time-Based, Not Passphrase-Based (0.2.47)

Once `FailedUnlockTracker` records `maxAttempts` consecutive failures
for an identity, it refuses EVERY unlock attempt — including one with
the objectively correct passphrase — until `cooldownMs` has elapsed.
Checking the passphrase first and only enforcing the cooldown on
failure would let an attacker who eventually guesses right during the
cooldown window walk straight in, defeating the point of having a
cooldown at all; checking the cooldown BEFORE the (deliberately slow)
KDF even runs is also what keeps a lockout responsive rather than
paying a full PBKDF2 cost just to say no. `recordSuccess()` clears the
counter entirely rather than merely pausing it, so a legitimate owner
who mistypes a few times and then gets it right is never left carrying
a partial strike count into their next visit.

### A Bounded Unlock Lifetime Is Not The Same Claim As Idle Detection (0.2.47)

`identity/VaultTimeoutPolicy.js#isVaultExpired(unlockedAt, now,
timeoutMs)` answers "has it been more than `timeoutMs` since this
vault was last UNLOCKED" — not "has the user been inactive for
`timeoutMs`." The two sound similar and are not: real idle detection
needs an activity signal (a keystroke, a click, a mutation) reset on
every one, threaded through every surface of the UI, for a security
property a much simpler fixed-lifetime policy already delivers —
leave a protected identity unlocked and unattended, and it re-locks on
its own regardless of what else might be happening on the page. 0.2.47
states this trade honestly rather than implying a more sophisticated
mechanism than what's actually implemented — the same discipline
`identity/KeyEncryption.js`'s own comment applies to its chosen PBKDF2
iteration count.

### Exporting And Importing An Identity Preserves The Identity, Not Merely Its Name (0.2.48)

The test that actually matters for `identity/IdentityExport.js`/
`IdentityImport.js`/`IdentityRecovery.js` was never "do the fields
survive the round trip" — a `label` string surviving a JSON round trip
proves nothing about cryptography. It's "does a signature produced on
the SECOND device, after import, verify with the identity's ORIGINAL
public key" — exercised directly in `tests/PortableIdentity.test.js`'s
flagship test, which signs on a real Device A, exports, imports into a
completely independent `LocalIdentityProvider` instance standing in for
Device B, signs again there, and runs both signatures through the same
unmodified `LocalAuthorizationVerifier`. `identityId` is never taken on
faith either: `IdentityImport.validatePackage()` re-derives it from the
package's own `publicKey` via the identical did:key math `identity/
LocalIdentity.js`'s constructor already enforces, and `IdentityRecovery
.recoverIdentity()` derives a SECOND public key from the just-decrypted
seed and checks that against the package's claim too — two independent
checks a corrupted or hand-edited package would have to satisfy
simultaneously, not one.

### Recovery Is Not Password Recovery (0.2.48)

There is no "forgot your passphrase?" flow anywhere in this milestone,
and there cannot be one without breaking the model the rest of this
codebase has built: nothing about a decentralized identity involves a
central authority capable of resetting anything. An export package's
`encryptedPrivateKey` is exactly as opaque to anyone without its
passphrase as the on-disk record `identity/KeyEncryption.js` already
protects an identity with at rest — the SAME encrypt-then-MAC
construction, not a weaker "recovery-friendly" variant. Losing both the
exported file and its passphrase means the identity is gone; that is
not a bug this milestone left unfixed, it is the honest consequence of
"the private key on a device IS the identity" (docs/Principles.md,
"Login Unlocks An Identity; It Does Not Derive One From A Typed Name")
applied consistently to the portable case too.

### Duplicate Identity Import Is A No-Op, Never A Silent Overwrite (0.2.48)

`IdentityRecovery.recoverIdentity()` checks whether the package's
`identityId` already exists on this device BEFORE attempting to decrypt
anything — and if it does, with matching key material, the ENTIRE
operation short-circuits to `{ status: 'ALREADY_EXISTS' }` without ever
touching the passphrase at all (`tests/PortableIdentity.test.js` proves
this directly: importing an already-present identity with a deliberately
wrong passphrase still reports `ALREADY_EXISTS`, never an error). The
alternative designs both fail the same test differently: silently
overwriting the existing entry could downgrade a protected identity to
whatever the imported package happened to carry, and silently ignoring
the import without saying so leaves the owner unable to tell "nothing
to do" apart from "it silently failed." Mismatched key material under
the same `identityId` — unreachable through any two honestly-generated
packages, since a did:key is a bijective encoding of the public key
itself — is rejected outright as `IdentityConflictError` rather than
resolved either way automatically, the same "never automatic, never
forced" discipline `protectIdentity()` already applies to migrating an
identity in place.

### A Peer Connection Authenticates A Key, Not An Account (0.2.49)

`peer/PeerAuthenticationSession.js` answers exactly one question: "does
the other end of THIS connection currently hold the private key for
identityId X?" It never answers, and is never asked to answer, "is this
the same person Alice met yesterday," "does this key belong to a real
human," or "should Alice trust this key with anything." Those are
account, reputation, and authorization questions respectively — the
same separation `docs/Roadmap.md`'s own vocabulary draws between
Discovery ("how did I find this endpoint?"), Authentication ("who
controls this endpoint?"), Authorization ("what may it do?"), and
Visibility ("what am I willing to reveal?"). A successful handshake
produces a `peer/PeerIdentity.js` — a proven key, nothing more — and
0.2.49 deliberately stops there: there is no "friends" list, no
trusted-peer database, no persistence of the fact this handshake ever
happened, anywhere in this milestone. "Is this connection currently
controlled by identity X" and "do I trust X forever" are different
questions on purpose, and only the first one has an answer yet.

### A Peer Authentication Signature Is Scoped To One Connection, Never To One Identity (0.2.49)

Every signature `core/PeerAuthenticationEnvelope.js`'s
`getPeerAuthenticationSigningDescriptor()` produces covers the
connection's own `sessionNonce` (its connectionId) alongside the
challenge, identityId, and publicKey. This is deliberately NOT the same
shape 0.2.16 established for a `Publication` or `PlacementRecord`,
where a signature is meant to travel — to be copied, replicated, and
verified by anyone, indefinitely, independent of how it arrived. A
peer-authentication signature is the opposite on purpose: it proves
something true only about ONE live connection, at the moment it was
produced, and is worthless the instant that connection ends. Binding
every signature to `sessionNonce` is what makes `tests/
PeerAuthentication.test.js`'s replay test fail for the right reason —
capturing a completely genuine PROOF message and feeding it into a
brand-new connection doesn't fail because of some separate
"already-used signature" tracking table (the unbounded-memory failure
mode `core/PresenceReplayWindow.js`'s own header already rejected for a
different, higher-frequency stream); it fails because the signature
itself, reconstructed and re-verified against the new connection's
different `sessionNonce`, simply does not check out. The proof is
self-invalidating outside the one context it was made for, the same
way a Kerberos ticket or a TLS session key is scoped to one session
rather than to the identity that produced it.

### Transport State And Authentication State Are Two Different Questions (0.2.49)

`peer/PeerConnectionState.js` (DISCONNECTED/CONNECTING/CONNECTED/
FAILED/CLOSED) and `peer/PeerAuthenticationState.js` (IDLE/
AUTHENTICATING/AUTHENTICATED/FAILED) are two separate, independently
tracked enums, not two branches of one state machine. "A channel exists
to something" and "we know who is on it" are genuinely different facts
that change at different times for different reasons — a connection
can be CONNECTED for an arbitrary stretch before a handshake even
starts, and a FAILED handshake (a bad signature, a replayed message)
leaves the underlying transport completely untouched, still CONNECTED,
available for the caller to decide what happens next, rather than
forcibly tearing down a connection the handshake layer doesn't own.
Only one direction is wired automatically, deliberately: a connection
transitioning to CLOSED or FAILED always resets an in-progress or
completed `PeerAuthenticationSession` back to IDLE and discards its
`remoteIdentity`, because authentication about a connection that no
longer exists is never a fact worth keeping — see "A Peer Authentication
Signature Is Scoped To One Connection, Never To One Identity," above.
The reverse never happens: nothing about authentication succeeding,
failing, or being reset ever changes `transportState`.

### An Invitation Is A Rendezvous Hint, Never A Credential (0.2.50)

`peer/PeerInvitation.js` answers "where might Bob be reachable" — never
"this is Bob." An invitation is deliberately NOT signed, and its optional
`identityHint` is deliberately never consulted by
`peer/PeerAuthenticationSession.js`'s handshake. Someone who copies an
invitation verbatim, including its identityHint, gains only a candidate
address worth attempting a connection to — not Bob's identity, and not any
head start on proving it. This is what makes tampering with an invitation
harmless in the specific way that matters: modifying its endpoint makes the
connection attempt fail outright (`peer/PeerConnectionProvider.js#connect()`
either can't reach anything there or reaches something that fails the
handshake); modifying its identityHint changes nothing about what
authentication proves, because authentication was never reading it to begin
with. Only a verified PROOF may ever populate a `remoteIdentity` — see "A
Peer Connection Authenticates A Key, Not An Account" (0.2.49), which this
principle extends one layer earlier: discovery isn't merely untrusted
alongside authentication, it structurally cannot influence what
authentication concludes, because nothing in the handshake ever reads a
discovery-layer value at all.

### Discovery Finds A Candidate; It Never Authenticates One (0.2.50)

`peer/PeerDiscoveryProvider.js` and its records
(`peer/PeerDiscoveryRecord.js`) exist to answer exactly one question: "what
endpoint is worth attempting a connection to?" Whether that candidate turns
out to be who it claims — or anyone verifiable at all — is entirely
`peer/PeerAuthenticationSession.js`'s question, asked fresh, every time,
over whatever real connection `application/ConnectToPeerUseCase.js` opens
to that candidate. This is the same "Discovery, Authentication,
Authorization, Visibility are different questions" separation the 0.2.49
design doc already drew, made structural here rather than merely
documented: no discovery type carries a validity flag, no discovery method
returns anything resembling "trusted," and `application/
DiscoverPeersUseCase.js` has no method that could be mistaken for one. A
discovery mechanism may say "here is something that might be Bob." It
structurally cannot say "this is Bob" — there is no field to put that claim
in.

### A Peer's Lifecycle Is Derived, Never A Third State Machine (0.2.50)

`peer/PeerLifecycleState.js`'s DISCOVERED → CONNECTING → CONNECTED →
AUTHENTICATING → AUTHENTICATED → FAILED/CLOSED reads like a single
lifecycle, and a UI is meant to read it that way — but nothing ever stores
it. `derivePeerLifecycleState()` is a pure function recomputing this value,
every call, from whichever real `peer/PeerConnectionState.js` and
`peer/PeerAuthenticationState.js` currently exist (or their absence, for a
bare discovery candidate that was never connected to at all). Storing a
third value instead would immediately face the exact question 0.2.49's own
"Transport State And Authentication State Are Two Different Questions"
principle exists to avoid: what happens when the stored composite disagrees
with the two real state machines it's supposed to summarize? A derived
function has no such question to answer, by construction — the same
"computed, not stored" discipline this codebase already applies to document
lifecycle status (0.2.21), spatial overlap (0.2.25), and distance (0.2.28),
applied here to a peer's own connection lifecycle.

### A Peer Alias Is A Local Note, Never A Claim About The Peer (0.2.50)

`application/ConnectedPeer.js#setAlias()` is a purely local, in-memory
label this device typed for itself, about one live connection. It is never
signed, never sent to the peer, never written to storage, and disappears
the moment that `ConnectedPeer` is discarded — which happens automatically
the instant its connection closes (`application/
ConnectedPeerRegistry.js`). Reconnecting to the exact same, already-proven
identityId later starts with no alias carried over, exactly as 0.2.49
already established for `remoteIdentity` itself: "is this connection
currently controlled by identity X" and "do I have a permanent relationship
with X" remain different questions, and 0.2.50 deliberately does not answer
the second one. A real, persistent contacts/friends system — one where an
alias survives a reconnect, keyed by identityId rather than by connection —
is exactly the kind of "social friend system" the design doc asked NOT to
build yet; this principle is what keeps a future one from being backed into
accidentally by a convenience field.

### A Signaling Payload Is Not An Identity Proof (0.2.51)

`peer/PeerConnectionOffer.js` and `peer/PeerConnectionAnswer.js` answer "here
is the WebRTC session description and candidates needed to open a direct
channel" — never "this is who I am." Both are deliberately UNSIGNED, for
exactly the reason `peer/PeerInvitation.js` already is (see "An Invitation Is
A Rendezvous Hint, Never A Credential," 0.2.50): signing them would suggest
the payload is trustworthy evidence of something, when its only job is to
carry SDP and ICE candidates from one side to the other. Someone who
intercepts and replays an offer verbatim gains only a candidate SDP worth
attempting a connection to — not Bob's identity, and no head start on proving
it, because nothing in `peer/PeerAuthenticationSession.js`'s handshake ever
reads a signaling-layer value; that handshake runs identically, over the
real DataChannel this signaling produced, regardless of how honestly that
DataChannel came to exist. This is what makes a tampered or forged answer
harmless in the specific way that matters: `peer/
WebRtcPeerConnection.js#acceptRemoteAnswer()` checks the answer's
`connectionId` matches and that it has not expired — necessary for the
handshake to complete AT ALL — but even a fully well-formed answer, honestly
relayed from a genuine third party who is not who the offer was meant for,
produces nothing more than a working DataChannel to THAT third party;
whether the entity on the other end is who anyone expected remains entirely
peer/PeerAuthenticationSession.js's question, asked fresh, exactly as it is
for every other transport. Binding an offer's `connectionId` to the eventual
connection's own `sessionNonce` — see "A Peer Authentication Signature Is
Scoped To One Connection, Never To One Identity" (0.2.49) — is what closes
the loop: a signature produced for one WebRTC connection cannot be replayed
into a different one just because both happened to originate from
signaling payloads that were captured together.

### A Transport Connection Is Never An Authenticated Peer (0.2.51)

`peer/WebRtcPeerConnection.js` knows how bytes move — SDP, ICE candidates,
DataChannel open/close/message — and is structurally incapable of knowing
who owns them: it carries no identity field, no avatar reference, no
username, nothing an authentication layer could mistake for a shortcut. This
is the same discipline `peer/PeerConnection.js`'s own header has demanded
since 0.2.49 ("does a channel exist" vs. "who is on it"), now proven under a
transport that actually has real-world reasons to want the shortcut — a
live network connection to a specific machine FEELS like it should mean
something about who is there, the way it never quite does for an in-process
`LocalPeerConnection`. It still doesn't: a `peer/PeerIdentity.js` comes into
existence only when `peer/PeerAuthenticationSession.js`'s handshake verifies
a PROOF, exactly as before, and disappears the instant the connection closes
— including a REAL WebRTC connection closing, propagated now via an
explicit CLOSE_SENTINEL rather than an instantly mirrored one, but the
consequence is identical either way. Concretely: if Alice reconnects to Bob
five times over five separate WebRTC connections, that is five separate
`peer/PeerConnection.js#connectionId`s, five separate `peer/
PeerAuthenticationSession.js` instances, and five separately-proven `peer/
PeerIdentity.js` instances — even though all five may resolve to the exact
same public key. Nothing about having a real network underneath changes "is
this connection currently controlled by identity X" into "do I have a
standing relationship with X" (see "A Peer Connection Authenticates A Key,
Not An Account," 0.2.49); a real transport makes the connection real, not
the relationship.

### A Peer Connection Transports Messages; It Does Not Interpret Them (0.2.52)

`peer/PeerConnection.js` and `peer/WebRtcPeerConnection.js` move opaque,
JSON-shaped objects and have never known what any of them mean —
`send()`/`onMessage()` don't even know a HELLO from a PROOF, let alone a
future presence advertisement from a chat message. 0.2.52's `peer/
PeerMessageBus.js` sits directly on top of that same discipline rather than
breaking it: it routes on `protocol` — a bare string — and hands `payload`
to whatever subscribed, untouched, unopened, uninterpreted. There is no `if
(protocol === 'avatar-presence')` anywhere in `peer/PeerMessageBus.js`, on
purpose; a codebase where the multiplexer needs to know what every protocol
means to route it correctly is a codebase where adding protocol #6 requires
touching code that protocols #1 through #5 already depend on. `peer/
PeerMessage.js`'s own envelope enforces the same boundary from the other
side: it carries `messageId`/`protocol`/`version`/`payload` and nothing
else — no avatar state, no username, no authorization decision, no trust
state, and (see the next principle) no signature — because every one of
those is a claim about what `payload` MEANS, and meaning belongs entirely
to the protocol that produced it. This is also why 0.2.52 adds no second,
generic `PeerMessage.signature` field: the connection itself is already
authenticated (`peer/PeerAuthenticationSession.js`, unmodified since 0.2.49)
— that proves WHO controls the channel — and whether a given protocol's
OWN payload additionally needs cryptographic proof is a decision only that
protocol can make, exactly as `core/AvatarPresenceAdvertisement.js` and
friends already decide it for themselves today, over `BroadcastChannel`,
with no peer connection involved at all. A generic envelope-level signature
would be a cryptographic layer bolted on before any protocol using it has
said whether it needs one.

### A Peer Message Envelope Carries Routing Information, Never Meaning (0.2.52)

`messageId`, `protocol`, and `version` on a `peer/PeerMessage.js` envelope
exist for exactly one layer's own bookkeeping — `peer/PeerMessageBus.js`'s
own routing and duplicate-suppression — and none of the three means what a
protocol built on top might assume from the name. `messageId` is NOT a
sequence number: it exists purely so a bounded local window can recognize
"I already delivered this" when an unreliable transport redelivers the same
bytes, and it says nothing about ordering — two messages with unrelated
`messageId`s carry no implied relationship, arrival order, or causal
history. `version` is NOT this layer's own schema version; it is carried,
opaque, entirely for the PROTOCOL's own use (`core/
AvatarInteractionAdvertisement.js`'s `sequence`, `core/
AvatarProfileAdvertisement.js`'s `profileRevision`, and any future
protocol's own versioning scheme all remain that protocol's business, not
this envelope's) — `peer/PeerMessageBus.js` never compares two `version`
values against each other, only checks that the one on any given envelope
is a positive integer. `protocol` is a bare routing key, not a claim about
trust, freshness, or authorization — the whole reason PUBLIC/FRIENDS/LOCAL/
HIDDEN, replay windows, and equivocation handling all live one layer up in
`core/`/`application/`, per-protocol, rather than being generalized into
this envelope. Concretely: `peer/PeerMessageBus.js`'s bounded duplicate
window (see "Replay Semantics Belong To The Protocol, Never The Bus",
directly below) suppressing a repeated `messageId` is TRANSPORT hygiene —
"don't hand the same bytes to a handler twice" — and is a completely
different question from whether a PROTOCOL considers a given payload stale
or superseded, which is `core/PresenceFreshness.js`, `core/
PresenceReplayWindow.js`, and `application/AvatarInteractionTrustBoundary.js`'s
own, entirely separate business.

### Replay Semantics Belong To The Protocol, Never The Bus (0.2.52)

`peer/PeerMessageBus.js`'s own duplicate-`messageId` suppression is
deliberately narrow and deliberately BOUNDED — a small, fixed-size,
per-connection window, unlike `replication/ReplayGuard.js`'s own
unbounded, potentially-persisted ledger answering the completely different
question "have I ever accepted this immutable object." The bus's window
answers only "did I already hand this exact envelope to a handler a moment
ago" — pure transport hygiene against an unreliable channel redelivering
the same bytes, not a security boundary and not a freshness judgment. It
is not, and must never become, the place that decides whether a
presence advertisement is stale (`core/PresenceFreshness.js`), whether an
avatar interaction event is a legitimate duplicate or a replay attack
(`core/AvatarInteractionReplayWindow.js`'s own sequence + `interactionId`
tracking, consulted by `application/AvatarInteractionTrustBoundary.js`),
or whether two conflicting claims constitute equivocation (`core/
PresenceEquivocation.js`).
Each of those already exists, already works, and already lives ONE LAYER
ABOVE the transport — precisely where 0.2.37 through 0.2.45 put them,
before a real peer connection existed at all. Folding any of that
judgment into `peer/PeerMessageBus.js` would duplicate logic that already
has a home and, worse, would force every future protocol to inherit
whatever replay policy the bus happened to pick, rather than choosing its
own — the same mistake "Replay Detection And Freshness Are Different
Questions, Answered By Different Code" (0.2.38) already named once, one
layer down.

### A Transport Migration Should Leave The Trust Model Untouched (0.2.53)

`presence/PeerAvatarPresenceBroadcastProvider.js` is a second, real
implementation of `presence/AvatarPresenceBroadcastProvider.js`'s
interface — the SAME interface `presence/LocalAvatarPresenceBroadcastProvider.js`
has satisfied since 0.2.37 — and that is the entire reason 0.2.53 could
ship without touching `application/PresenceSyncService.js`,
`application/LocalPresenceStore.js`, `application/PresenceTrustBoundary.js`,
`core/PresenceIngestion.js`, `core/PresenceAuthority.js`,
`core/PresenceReplayWindow.js`, `core/PresenceEquivocation.js`, or
`core/PresenceFreshness.js` — every one of 0.2.37 through 0.2.38's own
files stays byte-for-byte what it already was. This is the payoff of a
design choice made six milestones earlier, in 0.2.37's own header,
when presence's transport was deliberately modeled as an interface
rather than a concrete dependency: "transport-independent" was a claim
worth testing, not just asserting, and 0.2.53's flagship
(`tests/PeerAvatarPresence.test.js`, Section D, assertion 35) tests it
directly — a tampered advertisement, carrying a stolen-but-genuine
signature, sent over a REAL authenticated peer connection instead of
`BroadcastChannel`, is rejected by the exact same, unmodified trust
boundary. A milestone that changes WHERE bytes travel and finds itself
also needing to change WHETHER a claim is believed has quietly stopped
being a transport migration and started being a trust redesign — see
"0.2.37 Establishes Transport Semantics; 0.2.38 Establishes Trust
Semantics" above, which named this exact boundary before a second
transport existed to test it against.

### Peer Selection Is A Transport Concern, Never A Presence-Core Concern (0.2.53)

`core/AvatarPresenceAdvertisement.js`'s wire shape gained nothing in
0.2.53 — no `recipient`, no `visibility`, no authorized-peer list ever
travels on it, over either transport. `application/PresenceSyncService.js#publish()`
still takes exactly one argument, an advertisement, exactly as it has
since 0.2.37, and still has no idea whether zero, one, or five peers
end up receiving it. The decision of WHICH of a replica's currently
AUTHENTICATED peer connections actually receive a given advertisement
lives entirely inside `presence/PeerAvatarPresenceBroadcastProvider.js#advertise()`,
which asks `core/PresenceVisibilityPolicy.js#shouldAdvertiseToPeer()`
once per peer, immediately before sending to that one peer specifically
— never once, in advance, to build a recipient list that then leaks
into anything upstream. Keeping this decision at the transport, rather
than teaching `PresenceSyncService` or `WorldNavigationSession` to
understand "peers" at all, is what let 0.2.53 add real, per-recipient
FRIENDS enforcement — the thing `core/PresenceVisibilityPolicy.js`
named as a future possibility all the way back in 0.2.40 — without
either of those two classes changing by a single line. A future
transport (a relay, a mesh) that needs a completely different
selection strategy changes nothing about `core/`/`application/`'s own
presence code either, for the identical reason.

### Presence Never Establishes A Connection (0.2.53)

Receiving a presence advertisement is deliberately never, anywhere in
this codebase, a trigger to `connect()` to anyone.
`presence/PeerAvatarPresenceBroadcastProvider.js` only ever iterates
`application/ConnectedPeerRegistry.js#list()` — connections that
already exist, right now, for reasons entirely outside this class's
own knowledge — and never calls `peer/PeerConnectionProvider.js#connect()`,
imports `application/ConnectToPeerUseCase.js`, or reacts to an
incoming advertisement by reaching for either. The layering stays
strictly one-directional: Discovery finds a candidate address (0.2.50)
→ Connection opens a transport to it (0.2.49/0.2.51) → Authentication
proves who is on the other end (0.2.49) → only THEN can Presence (or
any other protocol on `peer/PeerMessageBus.js`) exchange anything over
it. A design that let an inbound advertisement, or even a bare
`avatarId`/`ownerIdentity` claim, trigger an outbound connection
attempt would turn presence — a fire-and-forget, unauthenticated-until-
ingested claim — into a connection-amplification primitive: a
malicious or merely misconfigured sender could cause every replica
that happens to receive one broadcast advertisement to dial out
somewhere. Presence stays exactly what 0.2.33 originally scoped it to
be — a description of where an avatar already-connected-to-something
currently is — never a mechanism for becoming connected to anything.

### Profile Visibility Is Never Presence Visibility (0.2.54)

"Everyone allowed to see my presence" and "everyone allowed to see
what I look like" are different pieces of information, and 0.2.54
refuses to let a real point-to-point transport quietly collapse them
into one. `core/AvatarProfileVisibilityPolicy.js` is a genuinely
separate class from `core/PresenceVisibilityPolicy.js` — never the
same instance, never a subclass, never read by
`presence/PeerAvatarPresenceBroadcastProvider.js#advertise()`'s
profile-protocol instance through presence's own policy object. A
person choosing `Presence: PUBLIC, Profile: FRIENDS` (broadcast that
I'm online, but only friends see my appearance) or the reverse,
`Presence: FRIENDS, Profile: PUBLIC`, must both be real, independently
representable configurations — not a distinction the architecture
quietly can't express because one policy object got reused for two
questions. 0.2.54's own default rule is deliberately the simplest
thing that is still HONEST about this: `AvatarProfileVisibilityPolicy`
grants every AUTHENTICATED peer eligibility (no FRIENDS/LOCAL/HIDDEN
tier yet — there is still no live profile-sharing configuration
surface anywhere in the running app for a richer tier to mean
anything, the same posture `application/AvatarProfileTrustBoundary.js`
already took on the TRUST side in 0.2.41), rather than pretending
presence's own policy controls profile privacy just because reusing it
would have been less code. A future milestone can give
`AvatarProfileVisibilityPolicy` real tiers the identical additive way
0.2.40 first gave presence its own, without
`AvatarProfileSyncService`, `WorldNavigationSession`, or the wire shape
of `core/AvatarProfileAdvertisement.js` needing to change at all — see
"Peer Selection Is A Transport Concern, Never A Presence-Core Concern"
above, which applies here identically, one protocol over.

### A Protocol's State-Keeping Semantics Are Its Own, Never Borrowed From Its Neighbor (0.2.54)

By 0.2.54, three protocols share one `peer/PeerMessageBus.js`, and each
answers "what does a receiver keep?" completely differently — on
purpose, never by accident of implementation reuse:

| Protocol            | Meaning              | Receiver keeps                    |
| -------------------- | --------------------- | ---------------------------------- |
| `AvatarProfile`       | current appearance    | latest ACCEPTED revision, forever  |
| `AvatarPresence`      | current location      | latest ACCEPTED sequence, PRUNED once stale |
| `AvatarInteraction`   | something happened    | nothing — an event is never replicated state |

`application/LocalAvatarProfileStore.js` never expires a record on its
own — an avatar's LOOK is a durable fact, unaffected by its owner
being temporarily away — while `application/LocalPresenceStore.js`'s
own freshness/staleness machinery (0.2.38) exists specifically because
a LOCATION claim genuinely goes stale. 0.2.54's flagship
(`tests/PeerAvatarProfile.test.js`, Section C) proves this distinction
survives the SAME shared transport, not just the SAME shared code:
fast-forwarding a receiver's clock past presence's own staleness
window prunes Alice from `application/RemoteAvatarRegistry.js`
entirely, while her profile — sitting in a completely separate store,
reached over a completely separate `PeerMessageBus` protocol string —
is provably untouched. Neither store, nor either protocol's trust
boundary, was taught anything about the other to make this true; it
falls out of `core/AvatarProfileIngestion.js` and
`core/PresenceIngestion.js` staying the deliberately-duplicated,
independent functions 0.2.41 already chose them to be (see
`core/AvatarProfileIngestion.js`'s own header) rather than one shared
"replicated value" abstraction parameterized by protocol — a shared
abstraction would have had to grow a "does this protocol expire?" flag
sooner or later, and that flag is exactly the kind of coupling this
principle exists to rule out in advance. The same reasoning is why
`application/AvatarProfileSyncService.js` is never constructed with,
or made to depend on, a presence transport at all — 0.2.54's flagship
gives Charlie a profile transport and nothing else, and he still
resolves Alice's real appearance, proving "a peer can know your
profile without currently observing your avatar" structurally, not
merely by assertion.

### A Peer Session Manager Owns Connections, Never What Travels Over Them (0.2.55)

`application/PeerSessionManager.js` answers exactly one question — "how
does an invitation become an authenticated `ConnectedPeer`?" — and
stops there, on purpose. It has no method that sends an application
message, no method that reads or writes presence, a profile, or an
avatar, and no dependency on `peer/PeerMessageBus.js` anywhere in its
own file. This mirrors, one layer up, the exact boundary `peer/
PeerMessageBus.js` itself already drew in 0.2.52 ("A Peer Connection
Transports Messages; It Does Not Interpret Them") and `peer/
PeerConnection.js` drew below that in 0.2.49: each layer in this stack
answers a narrower question than the one below it makes possible, and
refuses every temptation to answer a broader one just because it
happens to be sitting closest to the code that could. Presence
(0.2.53), Profile (0.2.54), and any future chat protocol all attach to
the SAME `ConnectedPeerRegistry` a `PeerSessionManager` exposes via
`.registry` — never by routing through `PeerSessionManager` itself,
and never by `PeerSessionManager` reaching into them. A future
milestone that wired `presence/PeerAvatarPresenceBroadcastProvider.js`
to a real, running session's peers would do it by handing that
transport the SAME registry instance this class already produces —
never by teaching this class what presence is.

### An Authenticated Peer Is Not A Friend (0.2.55)

0.2.55 is the first milestone where a real person, not a test file,
can look at a `ConnectedPeer` and be tempted to think "this is someone
I know now." It is not, and the UI is built to never imply it is.
`ui/views/PeerConnectionsView.js`'s own Peer Identity panel labels a
connection's `Session` field "Ephemeral," never "Trusted" or "Saved,"
and offers no button whose effect outlives the connection it names —
no "Add Friend," no "Remember This Peer," no "Always Trust This
Identity." Closing a peer's connection removes it from
`ConnectedPeerRegistry` exactly as it always has since 0.2.50 — this
milestone does not add a shadow list that survives the removal. A
local alias (`ConnectedPeer#setAlias`) looks, at a glance, like it
might be the start of a contacts system; it structurally cannot become
one, because nothing about it — not the alias text, not the fact one
was ever set, not which `identityId` it was set for — is retained
anywhere once the `ConnectedPeer` it lives on is disposed. See
docs/Principles.md, "A Peer Alias Is A Local Note, Never A Claim About
The Peer" (0.2.50), which this milestone's UI is the first to actually
render on screen rather than only exercise in a test. Persistent Peer
Relationships / Friends remains exactly what docs/Roadmap.md has
called it since 0.2.49 first raised the possibility: a genuinely
separate, deliberately unscheduled architectural question, never
something a "Connected Peers" screen backs into by accident of what
was convenient to keep around.

### A Peer Relationship Remembers An Identity, Never An Endpoint (0.2.56)

`core/PeerRelationship.js` carries exactly six fields: `identityId`,
`publicKey`, `algorithm`, `alias`, `status`, and two timestamps. There
is no field for an endpoint, a `connectionId`, a session nonce, a
WebRTC candidate, or anything else that named a specific transport
session — see that file's own header, which calls this out explicitly
as the reason a `PeerRelationship` can never be used to skip a fresh
handshake. `application/PeerRelationshipUseCase.js#rememberPeer`
enforces where that identity is allowed to come from just as strictly
as it enforces what is stored: its one parameter must be an actual
`peer/PeerIdentity.js` instance — the type `peer/
PeerAuthenticationSession.js` only ever produces after a real, mutual,
signed proof completes — never a plain object, never a string, and
never anything built from a `peer/PeerInvitation.js#identityHint`. An
invitation can say "I might be Bob"; only a completed handshake can
say "I have proven possession of this key," and only the latter is
eligible to become a persistent relationship. Reconnecting to a known
peer therefore always means: open a brand-new connection through the
ordinary `PeerSessionManager` invitation flow (0.2.55, unmodified),
let it authenticate completely from nothing (0.2.49, unmodified), and
only THEN compare the freshly proven `remoteIdentity.identityId`
against `PeerRelationshipUseCase.getRelationship()`. The rendezvous
endpoint that got the two sides talking is never authoritative about
who's on the other end — the cryptographic identity always is.

### Remembering A Peer Is A Deliberate Act, Never A Side Effect Of Authentication (0.2.56)

Nothing in `application/PeerSessionManager.js`,
`application/ConnectToPeerUseCase.js`, or `peer/
PeerAuthenticationSession.js` calls `PeerRelationshipUseCase.rememberPeer()`.
Authenticating a connection and remembering an identity are two
independently triggered actions, on purpose: authentication proves
"this peer controls this key," a fact this codebase has been willing
to compute automatically since 0.2.49; remembering means "I want this
identity in my Known Peers," a decision only a person can make, and
`ui/views/PeerConnectionsView.js`'s own "Remember" button is the only
call site in the entire codebase. This is the direct continuation of
0.2.55's own "An Authenticated Peer Is Not A Friend" — 0.2.55 refused
to let a live connection MASQUERADE as a saved relationship; 0.2.56
adds the real, persistent relationship concept 0.2.55 pointedly left
out, and still refuses to create one without an explicit gesture. The
same discipline applies going forward: `noteAuthenticated()` — called
when a peer that is ALREADY known authenticates again — only ever
refreshes `lastAuthenticatedAt` on an existing record; it is
structurally incapable of creating a new one; it looks the identity
up first and returns `null` untouched if nothing is remembered yet.
Whether authenticating a connection to a NEW, not-yet-known identity
should ever surface an unprompted "you connected to someone new" nudge
in the UI remains open, deliberately unscheduled, future work — this
milestone shipped only the explicit "Remember" gesture the design doc
asked for.

### Forgetting A Peer Deletes A Local Record, Never The Peer (0.2.56)

`PeerRelationshipUseCase.forgetPeer(identityId)` does exactly one
thing: it removes one row from this device's own, locally-scoped
storage. It has no network call, no signature, no message sent to
anyone — it cannot have one, because nothing about a `PeerRelationship`
was ever addressed to the peer it describes in the first place (see "A
Peer Relationship Remembers An Identity, Never An Endpoint," above). Bob's
own `LocalIdentity`, his signing key, his `AvatarProfile`, his
publications, his documents, and his world placements are untouched by
Alice forgetting him — they live on Bob's device (or wherever he chose
to publish them), not on Alice's, and Alice's local relationship record
was never anything more than her own note that she once proved who he
was. Forgetting also never touches `application/ConnectedPeerRegistry.js`:
if the forgotten identity happens to be connected right now, the live
`ConnectedPeer` keeps running, exactly as authenticated as it was a
moment ago — forgetting only means the NEXT time this identity
authenticates, `PeerRelationshipUseCase.getRelationship()` will report
it as unknown again, same as anyone this device has never met.

### Knowing Is Not Befriending (0.2.56)

`core/PeerRelationshipStatus.js` defines exactly one value — `KNOWN` —
deliberately, not as a placeholder waiting to be filled in. "I have
authenticated this identity at least once and chosen to keep a local
note about it" is a complete, self-contained claim; it says nothing
about mutual consent, reciprocity, or any social meaning beyond "my
device recognizes this key." A genuine `Friend` relationship — one
where the design doc's own next milestone asks how Alice and Bob
mutually agree they are friends in a decentralized system, with
signed requests, acceptance, and revocation — is a real, separate
concept this milestone deliberately did not build, per docs/Roadmap.md,
Proposed, Unscheduled: "Decentralized Friend Relationship." Alice can
KNOW Bob the moment she authenticates and clicks Remember, entirely
unilaterally, with no action required from Bob at all — the same way
she could always set a local alias on him (0.2.50). Nothing about
`PeerRelationship` is ever sent to Bob, shown to Bob, or requires Bob's
agreement; conflating that with friendship would quietly promise a
mutual, social guarantee this milestone never built and never signed
anything to support.

### Friendship Is Mutual Consent, Never A Unilateral Claim (0.2.57)

`core/FriendshipState.js#deriveFriendshipState()` only ever returns
`FRIEND` for one shape of evidence: a signed REQUEST from one identity
answered by a signed ACCEPT from the OTHER. Two identities each sending
their own REQUEST, with no ACCEPT from either side, is still
`REQUESTED` — even though, informally, "they both asked." This is
deliberate, not an oversight: asking is not agreeing. A REQUEST is one
identity's unilateral desire; only an ACCEPT is signed evidence that
the OTHER side actually looked at that desire and consented to it. If
mutual, simultaneous REQUESTs alone were treated as `FRIEND`, two
identities could end up "friends" without either one ever having
reviewed or agreed to anything the other side actually proposed — the
same unilateral-claim failure mode `core/PeerRelationshipStatus.js`'s
own header already named for `KNOWN` ("Alice can KNOW Bob... entirely
unilaterally, with no action required from Bob at all"), reintroduced
one level up if `FRIEND` were allowed to work the same way. `core/
FriendshipRecord.js` therefore stores TWO independent slots —
`outgoingAction` (what this device authored) and `incomingAction` (what
the other identity authored, already verified) — and `FRIEND` is a
property of the PAIR, never of either slot alone.

### A Friend Request Is Signed Evidence, Never A Server Record (0.2.57)

There is no server anywhere in this architecture that could tell Alice
"Bob accepted your request" — the only thing that can ever tell her
that is Bob's own Ed25519 signature over exactly that claim, arriving
over the same authenticated connection 0.2.49 already proved he
controls. This is why `identity/LocalAuthorizationVerifier.js#verifyFriendshipAdvertisement()`
is the first verify* method in this file to refuse an UNSIGNED
advertisement outright, rather than tolerating it the way
`verifyPresenceAdvertisement()`/`verifyAvatarProfileAdvertisement()`/
`verifyAvatarInteractionAdvertisement()` all do (see core/
PresenceTrustPolicy.js for why those three CAN afford to be lenient:
an unsigned presence claim degrades to "less trusted," never to "no
relationship exists at all"). A friendship advertisement has no such
soft landing — an unsigned REQUEST or ACCEPT proves nothing whatsoever,
so it is not evidence at all, and this codebase refuses to pretend
otherwise by storing it as if it were.
`application/FriendRelationshipUseCase.js#_handleIncoming()` goes one
step further than the signature check alone: it also requires the
claimed `actorIdentity` to equal the `remoteIdentity` THIS SPECIFIC,
already-authenticated connection proved during its own 0.2.49
handshake — never merely whatever the payload claims about itself. A
signature that verifies perfectly is still discarded if it arrives over
the wrong connection, which is what makes even a captured, genuinely
valid advertisement worthless to a third party relaying it over their
OWN connection (see `tests/FriendRelationships.test.js`'s flagship,
step 15).

### Friendship Can Be Established, But Not Yet Revoked (0.2.57)

`core/FriendshipAction.js` defines exactly two actions — REQUEST and
ACCEPT — deliberately, not as a first installment waiting to be
completed. REJECT, CANCEL, BLOCK, and UNFRIEND were all considered and
all deliberately left out, because every one of them raises the same
hard question this milestone declines to answer yet: what happens when
the two sides' independently-held local records disagree about whether
a relationship still exists? If Alice unilaterally deletes her local
`FriendshipRecord` for Bob while Bob's own device still holds a valid
`FRIEND` derivation, the two replicas now disagree — not necessarily
WRONG, but a real state that needs its own explicit, signed semantics
(a REVOKE action Bob's device can verify and act on, most likely) that
this milestone did not design. Shipping half of that answer — letting
Alice's UI show "not friends" while Bob's still confidently shows
"friends," with no signed event ever explaining why — would be worse
than not offering the button at all. This milestone's invariant is
therefore intentionally narrower than a complete social graph: a
`FriendshipRecord`, once it reaches `FRIEND`, has no code path in this
codebase that ever moves it back to `REQUESTED` or `NONE`. Revocation
is real, substantial, unbuilt work, left to its own future milestone —
see docs/Roadmap.md's own list of what 0.2.57 deliberately left out.

### A Social Relationship Grants Eligibility; A Visibility Policy Grants Access (0.2.58)

Being friends does not automatically reveal anything. `core/
FriendshipRecord.js` (0.2.57) answers exactly one question — "have Alice
and Bob mutually consented to a relationship?" — and 0.2.58 refuses to
let that answer double as a distribution decision. `core/
PresenceVisibilityPolicy.js#shouldAdvertiseToPeer()` and `core/
AvatarProfileVisibilityPolicy.js#shouldAdvertiseToPeer()` both gained a
`context.isFriend` parameter this milestone, but FRIENDS visibility
still has to be SET — Alice choosing PUBLIC keeps broadcasting to Bob,
Charlie, and everyone else regardless of who she is or isn't friends
with; Alice choosing HIDDEN keeps hiding from Bob even though they are
mutual friends. Friendship is an INPUT a policy MAY reference, never a
bypass around one. This is the direct continuation of "AvatarProfile,
AvatarPresence, and PresenceVisibilityPolicy Are Three Independent
Concerns" (0.2.40): a fourth concern, `FriendshipRecord`, joins the
picture without collapsing into any of the first three.

### A Visibility Policy Consults A Fact, Never A Store (0.2.58)

`core/PresenceVisibilityPolicy.js` and `core/AvatarProfileVisibilityPolicy.js`
still import nothing from `core/FriendshipRecord.js`, `core/
FriendshipState.js`, or `application/FriendRelationshipUseCase.js` —
not before this milestone, not after it. Both classes' `shouldAdvertiseToPeer()`
methods accept a plain `{ isFriend }` boolean the CALLER computes and
hands in; both `shouldAdvertise()` methods accept the coarser `{
hasFriend }` counterpart, the same way. `presence/
PeerAvatarPresenceBroadcastProvider.js` — the one class in this
codebase that DOES read a friendship-flavored predicate — still never
reads a `FriendshipRecord` itself either: its constructor's `isFriend`
parameter is a plain function the wiring layer closes over its own
`FriendRelationshipUseCase.getState()` call to produce (see
`tests/FriendAwareVisibility.test.js`'s own FLAGSHIP for exactly this
shape). This is the same discipline "Peer Selection Is A Transport
Concern, Never A Presence-Core Concern" (0.2.53) already established,
extended one layer further: a pure policy answering "should I
advertise" must never itself be capable of going and finding out who is
a friend — it can only be TOLD, fresh, every time it is asked, by
whichever application-layer caller actually owns that store. A `core/`
class that could read `application/FriendRelationshipUseCase.js`
directly would blur exactly the boundary `docs/Architecture.md`'s own
layering has protected since this project's very first milestone.

### FRIENDS Means Mutual Friendship OR An Explicit Grant, Never Either Alone (0.2.58)

`core/PresenceVisibilityPolicy.js`'s `authorizedPeerIdentities` — the
plain, manually-typed allow-list 0.2.40 built, back when no mutual
friendship concept existed to wire it to — is not replaced by 0.2.58,
it is joined. `shouldAdvertiseToPeer()`'s FRIENDS branch now reads
`isFriend === true || this._authorizedPeerIdentities.includes(peerIdentityId)`
— an OR, never a replacement. This is deliberate: a manually-authorized
identity is a real, useful thing to be able to express — someone this
replica has decided to trust WITHOUT (or before completing) a full
0.2.57 REQUEST/ACCEPT exchange — and nothing about shipping real
friendship makes that capability wrong or worth deleting. What 0.2.58
refuses to do is the REVERSE: interpret any WEAKER relationship state as
sufficient on its own. `FriendshipState.REQUESTED` does not qualify.
`PeerRelationshipStatus.KNOWN` does not qualify. A merely
`PeerLifecycleState.AUTHENTICATED` connection, with no relationship
recorded at all, does not qualify. Only `FriendshipState.FRIEND` — one
side's signed REQUEST answered by the other side's signed ACCEPT — ever
sets `isFriend: true`. See "Friendship Is Mutual Consent, Never A
Unilateral Claim" (0.2.57), which this milestone extends rather than
loosens.

### The Sender's Own Friendship Record Decides, Never The Receiver's (0.2.58)

`presence/PeerAvatarPresenceBroadcastProvider.js#advertise()` computes
`isFriend` by asking ITS OWN replica's `isFriend` predicate about the
REMOTE peer's proven identityId — Alice's transport asks "does MY
`FriendshipRecord` for Bob say FRIEND," never anything carried on the
wire by Bob himself. A malicious or merely out-of-sync peer claiming
"we're friends" in some hypothetical future protocol extension could
never be trusted to grant itself anything — exactly the same posture
`core/PresenceTrustPolicy.js`/`application/PresenceTrustBoundary.js`
already take toward every other claim a remote peer makes about itself.
This is why `tests/FriendAwareVisibility.test.js`'s own FLAGSHIP proves
Bob structurally CANNOT alter Alice's policy (step 13): there is no
protocol anywhere in this codebase, existing or new, that lets an
incoming `PeerMessage` write to `PresenceVisibilityUseCase`/
`AvatarProfileVisibilityUseCase` — both live entirely in local storage,
read only by their own owner's transports.

### Profile Gets Its Own Publication Gate, Superseding The Shared One (0.2.58)

0.2.41's "Presence And Profile Share One Publication Gate" was itself
flagged, in 0.2.54's own header, as a temporary limitation: "there is
still no live profile-sharing configuration surface anywhere in the
running app for a richer tier to mean anything." That surface now
exists — `application/AvatarProfileVisibilityUseCase.js`,
`ui/views/AvatarSettingsView.js`'s own "Profile Visibility" section —
so `WorldNavigationSession._publishLocalAvatarProfile()` now consults
its OWN `avatarProfileVisibilityUseCase`, completely independent of
`presenceVisibilityUseCase`, whenever one is wired. `Presence: HIDDEN,
Profile: PUBLIC` (nobody sees you move, but your appearance is still
shared with whoever asks) and the reverse, `Presence: PUBLIC, Profile:
HIDDEN`, are both now real, independently-representable configurations
— see `tests/FriendAwareVisibility.test.js` Section D. A session that
does NOT wire `avatarProfileVisibilityUseCase` — every pre-0.2.58
caller, and any test exercising only `presenceVisibilityUseCase` —
falls back to the EXACT 0.2.41 shared-gate behavior, unchanged: this is
a purely additive change, proven by `tests/AvatarAppearanceSync.test.js`'s
own L4 (assertion 78) still passing completely unmodified.

### Withholding A Future Advertisement Is Not Remote Deletion (0.2.58)

Switching Profile Visibility to HIDDEN (or narrowing FRIENDS) stops the
NEXT profile advertisement from reaching an ineligible peer. It does
not, and structurally cannot, reach into a peer who already received an
earlier, ACCEPTED advertisement and make them forget it —
`application/LocalAvatarProfileStore.js` (0.2.41, unmodified) has no
expiry, no remote-wipe primitive, and no mechanism by which Alice's
policy change could ever be delivered to Bob's own local store as an
instruction to erase something. This was already true before 0.2.58 —
0.2.54's own `AvatarProfileVisibilityPolicy` header already noted "a
future milestone can give this real tiers" without ever promising those
tiers would retroactively redact anything — but it is worth stating
plainly now that a real, independently-configurable profile FRIENDS
tier exists to make someone reach for it: this protocol is state
SYNCHRONIZATION, not an access-control database with revocable grants.
`ui/views/AvatarSettingsView.js`'s own explanatory copy says so
directly, in the same place a person actually sets the policy, rather
than leaving it as an assumption only a source-reading engineer would
notice.

### Friendship Persists Across A Connection; Its Eligibility Is Re-Proven On Every One (0.2.58)

`core/FriendshipRecord.js` is keyed on `identityId`, never on a
`connectionId` or any other transport-scoped handle (see "A Peer
Relationship Remembers An Identity, Never An Endpoint," 0.2.56, which
applies identically here). So when Bob disconnects and later
reconnects, nothing about `presence/PeerAvatarPresenceBroadcastProvider.js`'s
`isFriend` wiring needs to know or care that anything happened: the
freshly-authenticated connection proves the SAME `identityId` all over
again (0.2.49, unmodified), the injected `isFriend` predicate is
re-consulted fresh on the very next `advertise()` call (never cached,
same as `getVisibilityPolicy()` itself), and it reports exactly what it
always would have — no re-authorization gesture, no re-sent friend
request, no special reconnect-time code path anywhere in this
codebase. `tests/FriendAwareVisibility.test.js`'s own FLAGSHIP proves
this directly: Bob's brand-new post-reconnect connection is recognized
as a friend on the very first movement that follows, from his proven
identity alone.

### A Transport Migration Is Complete Only Once Something Actually Uses It (0.2.59)

0.2.53 built `presence/PeerAvatarPresenceBroadcastProvider.js`. 0.2.54
proved it could carry a second, independent protocol on the same bus.
0.2.58 taught it to consult real friendship. All three milestones were,
by their own explicit scope notes, unwired: `application/
CreateWorldViewUseCase.js` — the one place that actually decides what
World View's avatar layer runs over — kept building `presence/
LocalAvatarPresenceBroadcastProvider.js` regardless. A capability that
exists, is tested, and is never reached by the running application is
not a shipped capability; it is a rehearsal. 0.2.59 is deliberately not
a new capability at all — every collaborator it touches
(`PeerAvatarPresenceBroadcastProvider`, `FriendRelationshipUseCase`,
`PresenceVisibilityPolicy`, `AvatarProfileVisibilityPolicy`) is
untouched — its entire content is closing the gap between "this code
path exists" and "this code path is what actually runs."

### Once A Peer Is Authenticated, Avatar State Travels Through It, Never Around It (0.2.59)

The organizing claim of this milestone, stated plainly: presence,
profile, and interaction are not three separate design questions about
which transport to use — they are three instances of the same answer.
Once `application/ConnectedPeerRegistry.js` holds an AUTHENTICATED
connection to a peer, every avatar-social protocol this replica speaks
attaches to that SAME connection, through the SAME `peer/
PeerMessageBus.js`, gated by that protocol's OWN visibility policy —
never a second, parallel channel that happens to reach the same peer
by a different, unauthenticated, unaccountable path. `presence/
LocalAvatarPresenceBroadcastProvider.js` (`BroadcastChannel`) is the
one deliberate exception, and it is exactly that: a SEPARATE,
same-origin, non-authenticated scope that was never claiming to BE a
peer connection in the first place (see "A Peer Connection Authenticates
A Key, Not An Account," 0.2.49). Once a real peer transport is
available, nothing about World View's avatar layer ever reaches for it
again.

### No Authenticated Peers Is A Population Of Zero, Never An Absent Transport (0.2.59)

"Alice has logged in but has no authenticated peer connections right
now" and "Alice's avatar social layer has no transport" are different
facts, and this milestone keeps them different on purpose.
`application/CreateWorldViewUseCase.js` decides ONCE, at construction
time, whether a real peer transport was supplied — never by polling
`connectedPeerRegistry.list().length` — so a replica with zero peers
right now still has a fully live `PeerAvatarPresenceBroadcastProvider`
for presence, profile, and interaction; `advertise()` simply has an
empty registry to iterate and sends nothing, the identical "fire into a
population of zero" behavior a real, populated deployment already
tolerates for every advertisement HIDDEN or an empty FRIENDS list
already suppresses (see core/PresenceVisibilityPolicy.js). The moment a
peer authenticates, the exact same already-built transport starts
reaching them — no rebuild, no re-subscribe, no session restart. See
"Login Does Not Make Someone Globally Visible" below for the layered
consequence this makes possible.

### BroadcastChannel Is A Development Transport, Never A Production One (0.2.59)

`presence/LocalAvatarPresenceBroadcastProvider.js` is not deleted by
this milestone, and should not be: it remains the fastest way to
demonstrate two same-origin browser tabs genuinely observing each
other's avatars, with zero peer-authentication setup, and every
existing test in this suite that never wires a peer transport keeps
working over it completely unchanged. What changes is its ROLE. Before
0.2.59, it was the only transport World View's avatar layer had ever
actually run over, so it was, by default, the production one. After
0.2.59, `application/CreateWorldViewUseCase.js` reaches for the real
peer transport whenever the caller supplies one, and the real, running
application (`ui/main.js` -> `ui/views/WorldView.js`) always does. A
same-origin `BroadcastChannel` was never a substitute for an
authenticated, cryptographically-identified connection to a specific
remote identity — it cannot tell two tabs apart, cannot exclude a
non-friend, and cannot outlive the origin it lives in — so treating it
as a fallback of last resort, rather than the default, is simply
naming what was already true about it.

### Login Does Not Make Someone Globally Visible (0.2.59)

Stacking every layer this arc has built, in order: logging in
establishes a LOCAL identity (0.2.46) — nobody else knows or is
affected. Authenticating a peer connection to Bob proves a
cryptographic fact about that ONE relationship (0.2.49) — it grants
Bob no visibility by itself. Presence/profile visibility policy
(0.2.40/0.2.54/0.2.58) then decides what, if anything, crosses that
specific authenticated connection. At no point in this chain does
"being logged in" imply "being broadcast to anyone, anywhere" — the
old `BroadcastChannel` transport's same-origin reach made this
distinction easy to blur (every same-origin tab heard everything PUBLIC
produced, with no authentication step at all); a real peer transport
makes the three layers observably separate, because each one now has
its own, independently inspectable gate a message must cross. A
replica with a local avatar, zero authenticated peers, and Presence:
PUBLIC is visible to precisely nobody — not hidden, not broadcasting
into a void, simply not yet connected to anyone who could receive it.

### A Cyclic Consent Vocabulary Needs A Reference, Never Just A Type (0.2.60)

0.2.57 shipped REQUEST/ACCEPT as a one-shot vocabulary — a relationship
could only ever be asked and answered once — and that fact alone made
`core/FriendshipAdvertisement.js`'s original replay defenses (bind the
signer to the claimed actor, bind the whole payload under one signature)
sufficient: a captured ACCEPT could never be replayed against anything
but the exact REQUEST it already answered, because no second REQUEST
between the same two identities could ever exist. 0.2.60 makes the
vocabulary CYCLIC — unfriend, then request again — and that single
change reopens the gap: a genuinely valid, once-honestly-produced ACCEPT
from an ENDED cycle would still cryptographically verify if replayed
against a brand-new cycle's REQUEST, because actor, subject, action, and
`sequence` are all IDENTICAL between the two cycles (only the untrusted
`timestamp` differs). Fixing this by type alone — "an ACCEPT satisfies
an outstanding REQUEST" — is not enough once more than one REQUEST can
ever exist between the same two identities over time. `inResponseTo`
closes it the same way this codebase has closed every reference-based
replay before: bind the answer to the SPECIFIC INSTANCE it answers, not
merely to its type. Every terminal action (REJECT/CANCEL/UNFRIEND) needs
the identical binding, for the identical reason — see
`tests/FriendshipRevocationAndBlocking.test.js`'s own FLAGSHIP A, which
proves the attack directly: it captures a genuine cycle-1 ACCEPT, sends
it against a fresh cycle-2 REQUEST, and confirms it changes nothing.

### Friendship Is Mutual Relationship State; Blocking Is A Unilateral Local Decision (0.2.60)

These read like they could be one axis — "how do I feel about this
identity" — and 0.2.60 deliberately keeps them two, in two completely
separate stores (`core/FriendshipRecord.js` vs. `core/PeerBlockRecord.js`),
because they answer different KINDS of question. Friendship is a claim
about a RELATIONSHIP: it requires evidence from both sides, is
meaningless until the other party has actually seen and answered it,
and is exactly as much Bob's fact as it is Alice's. Blocking is a claim
about a DEVICE'S OWN BEHAVIOR: it requires nothing from Bob, means
nothing to Bob (he is never told), and is entirely Alice's own,
un-negotiable decision about what her own replica will send and accept.
Collapsing them into one `FriendshipState`-shaped enum (`NONE` /
`REQUESTED` / `FRIEND` / `BLOCKED`) would force a false choice at the
exact moment blocking matters most: a currently-FRIEND relationship
Alice wants to silence without pretending the friendship itself was
never real. Keeping them separate makes `FRIEND + BLOCKED` an ordinary,
simultaneously-true combination instead of a contradiction either store
has to reconcile — see `ui/views/PeerConnectionsView.js`'s own Friends
list, which renders exactly that combination without any special-casing.

### Blocking Is An Additional Local Authorization Gate, Never A Replacement For One (0.2.60)

Every avatar-social channel already had a trust boundary before 0.2.60:
signature verification, authority (who may speak for this avatarId),
replay/staleness rejection. Blocking does not get to skip any of that
by being "more important" — it is checked strictly AFTER a claim is
already known to be genuinely, cryptographically valid (see every
trust boundary's own `evaluate()`: `isBlocked` is consulted right after
`signerId` is established, never before). A structurally malformed or
badly-signed claim from a blocked identity is still rejected for being
malformed or badly signed, not reported as `TrustStatus.BLOCKED` — the
two failure reasons stay honestly distinct, the same way `UNAUTHORIZED`
and `INVALID_SIGNATURE` always have. Symmetrically, on the sender side,
`presence/PeerAvatarPresenceBroadcastProvider.js` checks `isBlocked`
BEFORE consulting the visibility policy, but never INSTEAD of it —
blocking a peer doesn't change what FRIENDS/PUBLIC/HIDDEN would
otherwise decide, it simply vetoes the send to that one peer
regardless of the answer. Two independent authorization questions,
checked in a fixed order, neither one ever standing in for the other.

### Blocking Is Wired Twice, Once Per Direction, Because Neither Side May Trust The Other To Enforce It (0.2.60)

`application/CreateWorldViewUseCase.js` wires the SAME `isBlocked`
predicate to two genuinely different places: each outbound
`presence/PeerAvatarPresenceBroadcastProvider.js` (never SEND to a
blocked peer) and `application/WorldNavigationSession.js`'s inbound
trust boundaries (never ACCEPT from a blocked signer). Neither wiring
is optional, and neither one is redundant with the other, for the same
reason 0.2.38 already established that rendering presence and trusting
presence stay separate concerns: Alice's own sender-side gate protects
HER bandwidth and HER intent to stop reaching Bob, but it cannot protect
her from a Bob who — through a modified client, a bug, or simple bad
faith — keeps sending anyway; only Alice's OWN receiver-side trust
boundary, evaluated on HER replica, can refuse what actually arrives.
Symmetrically, the receiver-side gate alone would still let Alice leak
presence/profile/interaction TO a peer she has blocked, right up until
he discards it — worse for her privacy than simply never sending it. A
decentralized system with no server to enforce a block centrally has no
choice but to duplicate the check on both sides of every connection;
this is that duplication, deliberate and by design, not an oversight
that happened to work out twice.

### Blocking Is Silent — Never Announced To The Blocked Identity (0.2.60)

`core/PeerBlockRecord.js` has no `signature` field and
`application/PeerBlockUseCase.js` has no `peerMessageBus` — not an
oversight, the entire point. Telling Bob "Alice has blocked you" is
itself a piece of information Alice may not want to hand him (it invites
exactly the retaliation or renewed contact blocking exists to prevent),
and would require the OPPOSITE of what a block is trying to achieve —
a message deliberately sent TO the identity being cut off. A blocked
identity simply, silently, stops being sent anything and stops being
listened to; from Bob's own side, Alice's presence/profile/interaction
just goes quiet the way it would if she disconnected, and any message
he keeps sending her is dropped with no error, no rejection notice, and
no observable difference from her never having received it at all.

### Unblocking Restores Nothing But The Ability To Be Heard Again (0.2.60)

`application/PeerBlockUseCase.js#unblock()` does exactly one thing:
removes a `core/PeerBlockRecord.js` entry. It never touches
`core/FriendshipRecord.js`, never re-sends anything, and never
re-derives any other piece of state — see "Friendship Is Mutual
Relationship State; Blocking Is A Unilateral Local Decision" above for
why the two stores were kept separate in the first place. Concretely:
`BLOCK` then `UNBLOCK` on a stranger leaves friendship at `NONE`, on a
former friend leaves it at whatever UNFRIEND already left it, and on a
CURRENT friend leaves it at `FRIEND` — in every case, exactly what it
already, independently was. Unblocking is the precise inverse of
block(), nothing more; it hands back eligibility to be sent to and
heard from again, and stops there. `tests/FriendshipRevocationAndBlocking.test.js`'s
own FLAGSHIP B proves the never-friended case directly, on purpose —
the case where "restores nothing" is easiest to get wrong by silently
defaulting to FRIEND.

### Chat Is A Protocol Running Over Authenticated Peers, Never A Feature Of The Transport Itself (0.2.61)

`peer/PeerMessageBus.js` has said since 0.2.52 that it does "generic
transport hygiene... protocol semantics belong to the protocol." 0.2.61
is the first milestone to build a genuinely NEW, direct, two-party
protocol on top of that promise rather than another avatar-social
broadcast: `application/ChatUseCase.js` subscribes to its own namespaced
channel (`forkbuild:chat`), same as `application/FriendRelationshipUseCase.js`
(0.2.57) already does, and neither `peer/PeerMessageBus.js` nor
`peer/PeerConnection.js` gained a single line of chat-specific code.
Concretely: `peer/PeerMessageBus.js` never contains `if (protocol ===
'forkbuild:chat')`, chat messages are never distinguished from any
other protocol's traffic anywhere below `application/ChatUseCase.js`,
and a message being AUTHENTICATED is necessary but never sufficient for
it to be treated as chat — see "Friendship Authorizes A Protocol; It Is
Never The Protocol" below for what else is required.

### Friendship Authorizes A Protocol; It Is Never The Protocol (0.2.61)

`FriendshipState.FRIEND` (0.2.57) was designed as a fact about mutual
consent, not as permission to do anything specific with it — 0.2.58
already proved this once, gating avatar-social VISIBILITY on it without
folding visibility into the friendship protocol itself. 0.2.61 proves
it again, one layer further: `application/ChatUseCase.js` never sends,
receives, mutates, or even imports a `core/FriendshipAdvertisement.js`
— it only ever calls `friendRelationshipUseCase.getState(identityId)`,
fresh, on every single send and every single incoming message, exactly
the same "consult a predicate, never cache or special-case it" contract
`isFriend`/`isBlocked` already established. The rule this makes
possible is deliberately simple: authenticated peer + not blocked +
`FriendshipState.FRIEND` -> chat allowed; anything else (anonymous,
unauthenticated, not yet friends, blocked, disconnected) -> refused.
Becoming friends grants ELIGIBILITY for chat; it grants nothing else,
and a future protocol (say, world co-editing invitations) that also
wants to consult friendship will ask the exact same predicate rather
than asking chat, or friendship itself, to know anything about it.

### An Authenticated Connection Surviving Unfriend/Block Does Not Mean Chat Survives It (0.2.61)

0.2.60 already established that friendship/blocking and the peer
connection are independent axes — a block never closes the underlying
WebRTC connection (`core/PeerBlockRecord.js`'s own header). 0.2.61
inherits that precedent directly: `application/ChatUseCase.js` never
asks a connection to close when friendship ends or a block is recorded,
and never needs to — because both `sendMessage()` and the receiving
`_handleIncoming()` re-check `isBlocked`/`getState() === FRIEND` FRESH
on every single message, a connection that stays AUTHENTICATED after
Alice unfriends Bob (or blocks him) simply stops being usable for chat
at that instant, on both the sending and the receiving side
independently, with no separate "close the channel" step required
anywhere. `tests/PeerChat.test.js`'s own Attack D and Attack E prove
this directly: the connection's `PeerLifecycleState` is asserted to
remain `AUTHENTICATED` throughout, while chat itself stops.

### 0.2.61 Ships Live Chat, Not A Message Database (0.2.61)

The deliberate boundary of this milestone: two authenticated friends
exchange text over a direct connection, and nothing about that exchange
is written down anywhere. `application/LiveConversation.js` — named
that, and NOT `ChatHistory`, on purpose — holds a conversation's
transcript only in memory, only for as long as the owning
`application/ChatUseCase.js` instance lives, with no `toJSON`/`fromJSON`
at all. There is no store-and-forward: `peer/PeerMessageBus.js#send()`
already throws for a peer that is not, right now, AUTHENTICATED, and
`application/ChatUseCase.js` adds no queue anywhere to catch what that
throw prevents from being delivered — see `tests/PeerChat.test.js`'s own
Scenario G. What persistent message history should even mean in a
decentralized system — who stores it, whether an intermediary can read
it, how long it lives, whether it survives this device disappearing —
is a genuinely different, harder question than "can Alice and Bob talk
right now," deliberately left to a later milestone rather than
half-answered here.

### A Chat Message's Identity, Its Sequence, And Its Delivery Order Are Three Different Facts (0.2.61)

`core/ChatMessage.js#messageId` exists ONLY for exact-duplicate
suppression (`core/ChatReplayWindow.js`'s bounded per-sender set),
completely independent of ordering — replaying a captured, genuinely-
valid message is rejected by identity alone, regardless of its
(unchanged) `sequence`. `sequence` itself answers a narrower question
than it might look like it does: "is this newer than the highest one
already accepted from this exact sender, in this exact conversation?"
— never "is this the next number in an unbroken count," and never an
assumption that delivery itself arrives in order. `core/ChatMessageIngestion.js#resolveIncomingChatMessage()`
deliberately tolerates gaps (sequence 2 accepted, then sequence 10
arrives — accepted; nothing between 3 and 9 is ever required or
reconstructed) for exactly this reason: WebRTC/DataChannel delivery
happens to be ordered today, but this protocol's own correctness never
depends on that continuing to be true. Conflating any two of these
three facts — as, for instance, treating `messageId` as a sequence, or
`sequence` as a delivery-ordering guarantee — is exactly the mistake
this file's own header warns against.

### A Reconnect Verifies An Identity; It Never Assumes One (0.2.62)

A remembered `core/PeerRelationship.js` (0.2.56) answers "have I proven
this identity before and chosen to keep a local record of it" — it has
never, by itself, been a claim about any particular CONNECTION. 0.2.62
is the first milestone to actually put a second connection next to a
first one and ask what should happen, and the wrong answer was
tempting and specific: "this device already knows Bob's identityId; a
new connection that shows up while Alice is trying to reconnect to Bob
must BE Bob." `application/ConnectToPeerUseCase.js`'s new
`expectedIdentityId` refuses that shortcut structurally. The 0.2.49
handshake runs exactly as it always has — nothing here changes what
counts as a valid PROOF, and nothing here trusts a connection sooner or
more easily because a reconnect was requested. Only AFTER a connection
reaches `PeerLifecycleState.AUTHENTICATED` — the exact same bar every
other connection already has to clear — is the identity that handshake
just proved compared against the identity this attempt expected. A
match changes nothing further; a mismatch closes the connection
immediately. The rule this produces is deliberately narrow: a
reconnect never lowers the bar for trusting a connection, it only adds
one more question to ask once that bar is already cleared. See
`tests/PeerConnectionResilience.test.js`'s own SECURITY FLAGSHIP, which
proves the honest case directly — Charlie's invitation authenticates
completely genuinely, as Charlie, and is rejected anyway, because
genuine authentication was never the question a reconnect needed
answered.

### A Rejected Reconnect Is Not A Failed Handshake (0.2.62)

`peer/PeerAuthenticationState.js#FAILED` has meant one thing since
0.2.49: a HELLO or PROOF that never validated — malformed, wrong
session, wrong challenge, a signature that doesn't verify. 0.2.62
deliberately does NOT reuse it for an identity mismatch, even though
both end with the connection closed. The difference is not cosmetic:
a handshake FAILURE means this device still doesn't know who, if
anyone, was on the other end. An `expectedIdentityId` mismatch means
the opposite — the other end proved, cryptographically, exactly who it
is; that proof simply wasn't for the identity this attempt was
expecting. Collapsing the two into one FAILED would throw away
information a "Reconnect" UI genuinely needs: "nothing answered" and
"the wrong person answered, and here specifically is who" are different
facts that deserve different explanations, not a single indistinguishable
badge. `application/ConnectToPeerUseCase.js#onIdentityMismatch()` is
the dedicated channel this milestone adds for exactly that second case,
carrying both the expected and the actual identityId — never merged
into, and never gating, `peer/PeerAuthenticationState.js` itself.

### Connection Incarnation Was Already Solved; 0.2.62 Only Named It (0.2.62)

The design question "how do we stop a stale event from an OLD
connection corrupting the state of a NEW one with the same peer"
sounds like it wants a new identifier — some kind of connection
generation counter layered on top of everything 0.2.49 through 0.2.61
already built. It doesn't, because the codebase already had the exact
right answer, twice over, before 0.2.62 ever asked the question:
`peer/WebRtcPeerConnectionProvider.js#createOffer()` (0.2.51) already
mints a fresh, globally-unique `connectionId` for every single
connection, `application/ConnectedPeerRegistry.js` (0.2.50) already
keys its entire Map by that id and nothing else, and
`peer/PeerAuthenticationSession.js` (0.2.49) already binds its own
HELLO/PROOF `sessionNonce` to that exact same id, specifically so "a
captured, entirely genuine handshake fails when replayed into a
different connection." A reconnect's fresh connection gets a fresh
`connectionId` the same way any two connections ever have; an old
connection's belated close() event can only ever remove ITS OWN,
already-stale registry entry, never a different one it has no key for.
0.2.62 adds no second identifier, no generation counter, and no new
bookkeeping for this — see `application/PeerReconnectionUseCase.js`'s
own header for why inventing one would have been exactly the kind of
"a third thing sitting alongside two real state machines" mistake
`peer/PeerLifecycleState.js` (0.2.50) already named and rejected once,
one layer down. `tests/PeerConnectionResilience.test.js`'s own FLAGSHIP
part 2 proves this holds under an actual stale, belated close() call,
rather than merely asserting `connectionId` values differ.

### Send Means Live Delivery; SendOrQueue Means Deliberate Durability (0.2.63)

0.2.61 already answered "what happens to a message sent to an offline
peer" once, on purpose: it fails, immediately, with no queue anywhere
to catch it (`docs/Principles.md`, "0.2.61 Ships Live Chat, Not A
Message Database"). 0.2.63 does not reopen that answer — it adds a
SECOND, differently-named operation instead.
`application/ChatUseCase.js#sendMessage()` is completely unmodified:
it still requires a real, currently-`AUTHENTICATED` `ConnectedPeer` and
still throws outright if reachability fails. `#sendOrQueue()` is new
and addressed to a `peerIdentityId` rather than a connection, because
there may not be one; it enqueues a durable `core/ChatOutboxEntry.js`
and attempts an immediate flush in the same call, so the common case
(the peer IS online) is exactly as prompt as `sendMessage()` always
was. The design question this settles deliberately: should offline
delivery be automatic and silent, or an explicit, separately-named
operation a caller opts into? The codebase chose the second — a
caller (`ui/views/ChatView.js`'s own compose box) that wants offline
messages to wait chooses `sendOrQueue()` by name; nothing about
`sendMessage()`'s own meaning shifted underneath any existing caller
to make that possible. `tests/OfflineMessagingDeliveryState.test.js`'s
own Scenario A re-proves `sendMessage()`'s original throw-on-offline
behavior, byte-for-byte, specifically so a future change to
`sendOrQueue()` can never accidentally start meaning `sendMessage()`
too.

### A Durable Outbox Is Addressed To An Identity, Never A Connection (0.2.63)

`core/PeerRelationship.js` (0.2.56) already drew this line for
persistent relationships: remember an identity, never an endpoint,
because an endpoint is exactly as ephemeral as the connection it came
from. `core/ChatOutboxEntry.js` draws the identical line for a queued
message: it carries a `peerIdentityId`, never a `connectionId` — there
is structurally nowhere on it for one to go. This is what makes
`application/ChatUseCase.js#_attemptFlush()`, triggered automatically
by the exact same `connectedPeerRegistry.onChange()` subscription
0.2.61 already used to `attach()` every peer to the bus, correct
without any bespoke "is this still the connection I queued against"
bookkeeping: the only question it ever asks is "is THIS PROVEN
IDENTITY `AUTHENTICATED` right now" — never "has this specific
connection come back." Combined with 0.2.62's own `expectedIdentityId`
guard, this produces a security property nobody had to write new code
for: if Alice queues mail for Bob and a later "Reconnect" attempt
genuinely authenticates as Charlie instead (0.2.62's own honest-
mismatch scenario), `_attemptFlush()` is invoked with CHARLIE'S proven
identityId, which matches no outbox entry addressed to Bob — Bob's
mail is neither sent to Charlie nor lost, purely because it was never
addressed to a connection in the first place.
`tests/OfflineMessagingDeliveryState.test.js`'s own SECURITY FLAGSHIP
proves this directly, immediately followed by the real Bob reconnecting
and receiving the untouched, still-QUEUED message intact.

### Sent Is Not Delivered (0.2.63)

`core/ChatDeliveryState.js` keeps three facts about a queued message
genuinely separate, the same discipline `core/ChatMessage.js`'s own
header already applied to a message's identity/sequence/delivery-order
split (0.2.61): QUEUED (sitting in `application/ChatOutbox.js`, not yet
transmitted), SENT (handed to `peer/PeerMessageBus.js#send()` over a
live connection — the bus ACCEPTED it, nothing more), and DELIVERED (a
`core/ChatDeliveryAck.js` came back from the recipient's own,
already-trusted ingestion). The ack is a deliberately SEPARATE wire
vocabulary and a SEPARATE protocol string
(`ChatUseCase.ACK_PROTOCOL`), never folded into `core/ChatMessage.js`
or sent over `forkbuild:chat` — the same "own protocol, own wire
shape" discipline `application/ChatUseCase.js` itself already used to
avoid being folded into `peer/PeerMessageBus.js`. The receiving side
acknowledges every chat message it accepts, a freshly-accepted one and
an exact, already-seen duplicate alike — see
`application/ChatUseCase.js#_handleIncoming()` — which is precisely
what makes a retransmit after a dropped connection harmless without a
sender-side retry/timeout system of its own:
`core/ChatReplayWindow.js` (0.2.61, completely unmodified) already
rejects the duplicate CONTENT; the ack simply still goes back, so a
sender's outbox entry reaches DELIVERED even on a second transmission
of the exact same message. Conflating SENT with DELIVERED — treating
"the bus accepted it" as "the recipient has it" — is exactly the
mistake this state machine exists to make structurally impossible.

### The Outbox Prunes Itself; It Is Not A Message Database (0.2.63)

`application/LiveConversation.js` (0.2.61) is never durable at all —
no `toJSON`/`fromJSON`, gone the moment its owning `ChatUseCase`
instance does. `application/ChatOutbox.js` is the one genuinely new
piece of DURABLE chat state 0.2.63 introduces, and it is deliberately
narrow: an entry exists only for as long as a message remains in
flight. The instant a `core/ChatDeliveryAck.js` lands,
`ChatOutbox#acknowledge()` deletes the entry from storage rather than
retaining it DELIVERED forever; an entry whose TTL elapses before that
ever happens (`core/ChatOutboxEntry.js#isExpired()`) is dropped just
as completely by `pruneExpired()`, checked lazily on read rather than
on a background timer, the same lazy-check-on-read posture every other
TTL in this codebase already uses. Nothing in `application/ChatOutbox.js`
answers "what did we talk about" — that question still belongs
entirely to `application/LiveConversation.js`, exactly as ephemeral as
0.2.61 left it. A state machine that looks natural to add on top of
this — `LOCAL_ONLY`, `FAILED` — was deliberately left out of
`core/ChatDeliveryState.js`'s own four-value vocabulary because
nothing in this milestone ever transitions to either one; see that
file's own header. Don't add a state a real transition doesn't need
just because a design sketch imagined it.

### Discovery Is Untrusted Input; Only Authentication Answers Who (0.2.64)

`peer/PeerDiscoveryProvider.js` already established, in 0.2.50, that
"Discovery Finds A Candidate; It Never Authenticates One." 0.2.64 adds
a second way a candidate reaches this device — `discover(identityId)`,
a search over what's already been imported, rather than only
`importInvitation()`'s own push — and that second path inherits the
identical discipline, unchanged: a result is a CANDIDATE, never a
finding. The three-stage vocabulary the design doc for this milestone
asked for names it precisely: Discovery ("something claiming to be Bob
may be reachable here") → Rendezvous ("here is an endpoint worth
attempting") → Authentication ("this connection actually belongs to
Bob"). Only the third is ever authoritative. `application/
FindPeerUseCase.js#connect()` makes this concrete rather than
aspirational: it always threads the identity ALICE SEARCHED FOR as
`expectedIdentityId` into `application/ConnectToPeerUseCase.js`'s
existing 0.2.62 gate, never the candidate record's own `identityHint`
— so even a maliciously or carelessly mislabeled candidate ("here is
Bob!" pointing at Charlie's endpoint) is structurally incapable of
being accepted as Bob. Charlie still authenticates completely
honestly, as himself; the connection is simply closed the instant that
becomes provable, exactly the same "the peer proved something real,
just not what this attempt was for" shape 0.2.62 already established
for a rejected Reconnect. `tests/PeerIdentityDiscovery.test.js`'s own
SECURITY FLAGSHIP proves it directly: a forged candidate claiming Bob
authenticates as Charlie, is rejected and closed on both ends, and
Bob's own already-remembered relationship is left byte-for-byte
untouched.

### A Discovery Record's Freshness Outlives Neither The Identity Nor The Relationship It Might Lead To (0.2.64)

A `peer/PeerDiscoveryRecord.js`'s own `expiresAt`/`isExpired()` answers
one narrow question — "is THIS candidate endpoint still worth
attempting" — and nothing else. Bob changing networks makes exactly
one candidate stale; it does not un-know Bob, does not touch any
`core/PeerRelationship.js` this device already remembered for him, and
does not affect a `core/FriendshipRecord.js` either. Those three facts
live at entirely different layers, exactly as 0.2.56's own "Knowing Is
Not Befriending" already established for a different pair of them —
0.2.64 only adds a fourth layer (a mere candidate) beneath the two that
already existed, and keeps it exactly as separable from them.
Expiry is checked lazily, on read (`peer/LocalPeerDiscoveryProvider.js`'s
own `_pruneExpired()`), never on a background timer — the identical
posture `core/ChatOutboxEntry.js`'s own TTL (0.2.63) and
`peer/PeerInvitation.js`'s own expiry (0.2.50) already established.
An expired record is unusable, never merely "less preferred": it
disappears from `list()`/`discover()` entirely rather than sorting to
the bottom, so nothing downstream has to remember to check its age a
second time.

### Rediscovering A Candidate Refreshes It; It Never Duplicates It (0.2.64)

`peer/LocalPeerDiscoveryProvider.js#importInvitation()` treats a
re-import of the SAME candidate (identical `candidateEndpoint` and
`identityHint`, while the existing record is still fresh) as a refresh
of that one record — not a second, independent entry sitting beside
the first. Without this, a pool that simply accumulates every
invitation it's ever seen would grow forever and would let a UI's
"Find Someone" results silently duplicate the same candidate under
different `peerDiscoveryId`s every time it's re-added. A genuinely
DIFFERENT endpoint claiming the same identity is deliberately NOT
merged into the existing record, though — see `tests/
PeerIdentityDiscovery.test.js` — because collapsing those would let a
later, potentially bogus endpoint silently overwrite an
earlier-established candidate's own address under this provider's own
authority, an authority discovery is never supposed to have (see this
file's own "Discovery Is Untrusted Input" above). Two different claims
about how to reach the same identity are kept as two separate,
independently-evaluated candidates — connecting to either is exactly
as unauthoritative as connecting to one.

### A Discovery Source Describes Provenance, Never Trustworthiness (0.2.64)

`peer/PeerDiscoverySource.js` grows LAN, RENDEZVOUS_SERVICE, and
DISTRIBUTED alongside the one source 0.2.50 through 0.2.64 actually
implement, INVITATION — named now, unimplemented, for the same reason
`core/ChatDeliveryState.js` names DELIVERED before anything could
produce it yet: so `application/DiscoverPeersUseCase.js`, `application/
FindPeerUseCase.js`, and any future UI never have to special-case "what
kind of discovery was this" beyond reading the field. Deliberately not
built in 0.2.64: an actual LAN broadcast provider, a rendezvous
service, or a distributed/gossip network — see docs/Roadmap.md-style
scoping in this milestone's own README.md entry for why. Whichever of
those eventually ships, none of them earns one bit more trust than
INVITATION already has: `source` is provenance metadata a UI might
show a human ("found via invitation" vs. "found via LAN"), never an
input to `application/ConnectToPeerUseCase.js#_guardExpectedIdentity`
or to anything else that decides whether a connection is accepted.
Every source still produces nothing but `peer/PeerDiscoveryRecord.js`'s
own untrusted candidate, still required to pass a real
`peer/PeerAuthenticationSession.js` handshake before it means anything
at all.

### Rendezvous Distributes Candidates; Authentication Establishes Identity (0.2.65)

The one-sentence version of everything else in this section. 0.2.65
makes discovery genuinely networked — `peer/RendezvousTransport.js`'s
real PUBLISH/LOOKUP/REMOVE, not merely a search over what was already
imported (`peer/LocalPeerDiscoveryProvider.js#discover`, 0.2.64) — and
changes nothing about which of the three stages is ever allowed to say
"this is Bob": still only `peer/PeerAuthenticationSession.js`'s
handshake, gated by `application/ConnectToPeerUseCase.js`'s 0.2.62
`expectedIdentityId` check. A rendezvous node — even one implemented as
a real server, one day — is architecturally incapable of vouching for
an identity; it can only ever hand back candidates, exactly as
`peer/PeerDiscoveryProvider.js`'s own header established in 0.2.50 for
a purely local, out-of-band mechanism. Making discovery a real network
does not change its epistemic status. See `tests/
DistributedPeerRendezvous.test.js`'s own flagship: a malicious
publication claiming to be Bob costs the rendezvous LAYER nothing to
produce and nothing to reject — the cost of rejecting it is paid
entirely at the authentication layer, unmodified since 0.2.62, the
instant Charlie honestly authenticates as himself instead.

### A Rendezvous Publication Is Never A Permanent Directory Entry (0.2.65)

`peer/RendezvousPublication.js` wraps nothing but an ordinary
`peer/PeerInvitation.js` — still never a credential, see that file's
own header — plus the bookkeeping a rendezvous node needs to expire it.
Its own `expiresAt` can never outlive the invitation it wraps, no
matter what ttl a caller requests (`RendezvousPublication.create()`
takes the STRICTER of the two): a rendezvous layer that could
outlive its own invitation would let "Bob is reachable here" survive
longer than the hint that ever justified saying so in the first
place. `peer/LocalRendezvousNetwork.js` compounds this at the
transport level by keeping AT MOST ONE live publication per identity —
a fresh PUBLISH for the same identity simply replaces whatever was
there, never accumulates beside it — which is what makes "newer
publication replaces older candidate" fall out of the storage model
itself, with no separate enforcement code needed. The result: the
rendezvous network only ever answers "where is X reachable RIGHT NOW,"
never "here is everywhere X has ever been reachable." A publication
disappearing — through natural expiry or an explicit `unpublish()`/
REMOVE — means exactly one thing: "this device currently doesn't know
a route to that identity." It never means, and is never treated
anywhere in this codebase as meaning, "that identity no longer
exists" — see `docs/Principles.md`, "A Discovery Record's Freshness
Outlives Neither The Identity Nor The Relationship It Might Lead To"
(0.2.64), which this milestone extends one layer down rather than
replaces. `core/PeerRelationship.js`, `core/FriendshipRecord.js`, an
identity, a profile, presence, and chat state are all still
completely untouched by anything happening at the rendezvous layer.

### A Rendezvous Lookup Degrades; It Never Fails Loud (0.2.65)

`peer/RendezvousDiscoveryProvider.js#discover()` treats a transport
failure (the rendezvous network is temporarily unreachable) as
"produced zero fresh results this time," never as a thrown error —
the call falls back to whatever this device already has cached
locally and returns that instead. The same posture applies one layer
down, per entry rather than per call: a single malformed or malicious
publication a lookup returns (missing fields, garbage in place of a
real `peer/RendezvousPublication.js`) is caught and skipped in
`_mergePublication()`, never allowed to abort the rest of the lookup —
the exact "one bad record rejected and counted, the others go on"
failure-isolation discipline `spatial/
DecentralizedSpatialDiscoveryProvider.js` already established for a
much larger, cryptographically-verified trust pipeline, here applied
to a deliberately much smaller and entirely UNTRUSTED one. `peer/
DiscoveryBootstrap.js` repeats this pattern one layer higher still: a
single configured bootstrap provider throwing during `discover()` is
caught and skipped, never allowed to fail the fan-out to every other
configured provider. Three layers, one rule: a network hiccup makes a
peer HARDER to find, and never, at any layer, makes an
already-known candidate impossible to use, nor makes a healthy
source's answer disappear because an unhealthy one nearby failed.

### A Bootstrap List Is Configuration, Never An Authority (0.2.65)

`peer/DiscoveryBootstrap.js` answers 0.2.65's own bootstrap question —
"how does Alice find the rendezvous network at all, without already
knowing someone in it?" — by making the answer an explicit, inspectable,
changeable list (`addBootstrapProvider()`/`removeBootstrapProvider()`),
never one permanent, hard-coded discovery authority baked into the
architecture. Nothing about `application/FindPeerUseCase.js` or
`application/PeerSessionManager.js` needed to change to make this
possible — both already depended on nothing but the `peer/
PeerDiscoveryProvider.js` interface (see docs/Principles.md,
"Discovery Finds A Candidate; It Never Authenticates One," 0.2.50), so
a `DiscoveryBootstrap` instance, or a bare `peer/
RendezvousDiscoveryProvider.js`, or the original `peer/
LocalPeerDiscoveryProvider.js` are all equally valid things to hand
`PeerSessionManager`'s constructor. This is what leaves the door open
for LAN, a DHT, QR, NFC, manual invitation, and community-run
rendezvous nodes to coexist, or replace each other, purely as
configuration — never as a change to how Alice searches or how a
result is trusted. And "trusted" stays the operative word: being on
the bootstrap list only means "this device currently asks this
source" — see "A Discovery Source Describes Provenance, Never
Trustworthiness" (0.2.64) above, unchanged in spirit: a candidate from
a configured bootstrap provider earns no more trust than one a human
relayed by hand.

### Rendezvous Can Introduce An Endpoint; It Can Never Establish Identity (0.2.66)

The one-sentence version of this entire milestone, and nothing about
it is new — it is 0.2.65's own "Rendezvous Distributes Candidates;
Authentication Establishes Identity," restated because 0.2.66 is
exactly the milestone where it would be tempting to weaken it. A real
network transport (`peer/WebSocketRendezvousTransport.js`) sounds more
"official" than an in-memory `LocalRendezvousNetwork` did, and a
signed publication (see below) sounds more "verified." Neither is.
`tests/RealNetworkRendezvous.test.js`'s own flagship makes this the
literal, load-bearing assertion under test: a publication pointing
Bob's identityId at Charlie's own, completely genuine, completely
real WebRTC endpoint costs the attacker nothing, over the real
transport exactly as it cost nothing over the in-memory one in
0.2.65's flagship — Charlie authenticates honestly as himself, and
`application/ConnectToPeerUseCase.js`'s 0.2.62 `expectedIdentityId`
gate rejects the connection the instant that becomes provable. A
rendezvous node, real or simulated, malicious or merely broken, can
prevent discovery (by being unreachable, by refusing to answer, by
never having anything published) — see "A Rendezvous Lookup
Degrades; It Never Fails Loud" (0.2.65), unchanged — but it can never
manufacture a successful impersonation, because nothing it can PUBLISH
was ever capable of proving identity in the first place. Only
`peer/PeerAuthenticationSession.js`'s handshake, over a live
connection, proving possession of a private key, ever does that.

### A Rendezvous Transport Cannot Stay Synchronous (0.2.66)

`peer/RendezvousTransport.js`'s own contract (`publish()`/`lookup()`/
`remove()`) was synchronous through 0.2.65 because its one concrete
implementation, `peer/LocalRendezvousNetwork.js`, was an in-memory Map
— there was never anything to `await`. A real network round trip has
no such luxury, so 0.2.66 makes the entire contract `async`, and
propagates that upward exactly one caller at a time, never skipping a
layer: `peer/RendezvousDiscoveryProvider.js#discover/publish/
unpublish`, then `peer/DiscoveryBootstrap.js#discover/publishToAll`,
then `application/DiscoverPeersUseCase.js#discover/publish/unpublish`,
then `application/PeerSessionManager.js#discoverCandidates/
publishSelf/stopPublishing`, then `application/FindPeerUseCase.js#search/
publishSelf/stopPublishing`, finally `ui/views/PeerConnectionsView.js`'s
own `submitFind()`. `peer/LocalRendezvousNetwork.js` itself needed no
behavioral change at all — wrapping an already-resolved, purely
synchronous result in a Promise is free, and every existing test
exercising it needed only `await` added at each call site, never a
rewritten assertion. `list()`/`importInvitation()`/`forget()`/
`onDiscovered()` deliberately stayed synchronous throughout this
propagation: they only ever read or write a device's own LOCAL cache,
never the transport, so there was never a real asynchronous boundary
to cross for them. `peer/DiscoveryBootstrap.js#discover()` goes one
step further than mechanical propagation: every configured bootstrap
provider is queried CONCURRENTLY (`Promise.allSettled`, guarding
against a provider whose `discover()` still throws synchronously
rather than rejecting — every one built before 0.2.66 does), so asking
N rendezvous nodes costs roughly the slowest ONE of them, not their
sum — a real, and previously invisible, latency consequence of
`discover()` finally doing genuine network I/O.

### A Rendezvous Publication's Signature Is Tamper-Evidence, Never Trust (0.2.66)

`peer/RendezvousPublication.js` gains one optional field, `signature`
(`core/RendezvousPublicationEnvelope.js#getRendezvousPublicationSigningDescriptor`,
`peer/RendezvousPublicationSigning.js#signRendezvousPublication`,
`identity/LocalAuthorizationVerifier.js#verifyRendezvousPublication`,
a new, deliberately OPTIONAL `SignatureType.RENDEZVOUS_PUBLICATION` —
optional exactly like `AVATAR_PRESENCE`/`AVATAR_PROFILE`/
`AVATAR_INTERACTION`, unlike the REQUIRED `PEER_AUTHENTICATION`/
`FRIENDSHIP`). What it buys is narrow and deliberate: a receiver can
discard a publication whose signature is present but does not verify,
or whose signer does not match the `identityHint` it claims to
publish for — tampering caught ONE LAYER EARLIER than 0.2.65 could
catch it, before the entry ever becomes a `PeerDiscoveryRecord` at
all. It does NOT buy trust in the endpoint itself: see "Rendezvous Can
Introduce An Endpoint; It Can Never Establish Identity" above — a
publication signed by the genuine holder of `identityHint`'s own key
still says nothing about who actually answers at the endpoint it
carries, because signing happens once, at publish time, over data the
signer controls, while a WebRTC endpoint's own honesty can only ever
be proven live, per-connection, by
`peer/PeerAuthenticationSession.js`. This is also why
`peer/RendezvousPublicationSigning.js#signRendezvousPublication`
refuses to sign a publication whose `identityHint` is not the signing
device's own current identity — degrading silently to unsigned rather
than producing a signature that would misleadingly look like an
endorsement of someone else's claim. And it is why signing stays
OPTIONAL at the wire level rather than mandatory: an unsigned
publication was always exactly as valid a candidate as any other (see
`peer/RendezvousTransport.js`'s own header — nobody is ever
authenticated to PUBLISH in the first place), and 0.2.66 does not
retroactively demand otherwise.

### STUN Is Free Public Infrastructure; TURN Is Transport Infrastructure, Never A Trusted Application Server (0.2.66)

`peer/IceServerConfig.js` gives `peer/WebRtcPeerConnectionProvider.js`'s
own `iceServers` constructor option (present, unused, since 0.2.51) an
actual place to be configured from. STUN and TURN are treated
differently on purpose, not merely for convenience: a STUN server only
ever answers "what is my own reflexive address" — well-known, public,
free Internet infrastructure, learning it leaks no more than any
ordinary outbound connection already would, so `DEFAULT_ICE_SERVERS`
ships two long-standing public STUN servers so a fresh checkout can
attempt real NAT traversal with no setup. A TURN relay is categorically
different: it carries the actual DataChannel bytes when no direct path
can be found, and real deployments almost always gate it behind
operator-issued, time-limited credentials. `peer/IceServerConfig.js`
ships NO default TURN server for the same reason `peer/
RendezvousConfig.js` ships no default rendezvous URL (see "A Bootstrap
List Is Configuration, Never An Authority," 0.2.65) — this codebase
picks no relay operator for every deployment to depend on. And
whichever path a connection actually takes — direct, or relayed
through a configured TURN server — is invisible above `peer/
WebRtcPeerConnectionProvider.js`: `peer/PeerAuthenticationSession.js`'s
handshake runs identically either way, because it authenticates
whoever is on the other end of the DataChannel, never how the bytes
physically got there.

### One Publication Answers At Most One Connection Attempt (0.2.66)

`application/PeerSessionManager.js#publishSelf()` publishes a REAL
WebRTC offer under this device's own identity, and that inherits
`peer/WebRtcPeerConnectionProvider.js`'s own one-offer/one-answer
design exactly as it always has (see that file's own header: there is
no ambient "listen for anyone" channel, only `createOffer()`'s active
half and `connect()`'s active half). A publication is therefore
findable by many, but only ever COMPLETABLE by whichever ONE peer's
answer reaches `acceptRemoteAnswer()` first — a second peer who
discovers and tries the same publication after that finds the
underlying offer already consumed, exactly the same one-shot
completion `peer/WebRtcPeerConnection.js#acceptRemoteAnswer` has
always been. This is not a bug this milestone introduces so much as
one it is the first to make visible: 0.2.50 through 0.2.65 never had
"publish this offer to an audience of possibly-many," only "hand this
one offer to ONE specific person out-of-band," where the constraint
was never observable because there was only ever one intended
recipient to begin with. `publishSelf()` documents this plainly rather
than papering over it, and the fix is deliberately NOT attempted here:
solving many-peers-per-publication means a real signaling relay
capable of handing out a fresh offer per inbound attempt — a genuinely
different, harder problem, left to a later milestone.

### An Identity Identifier Is Immutable For The Lifetime Of That Cryptographic Identity (0.2.67)

`identity/LocalIdentity.js`'s founding invariant, since 0.2.46, is that
`identityId` IS the did:key derivation of `publicKey` — the constructor
refuses to construct one where the two disagree. 0.2.67's rotation
design had to either honor that invariant or quietly break it: could
"rotating a key" mean identityId stays the same string while the key
underneath it changes? No — every signature that identityId ever
produced would retroactively become unverifiable against whichever key
happens to be current NOW, turning `identityId` from a fixed
cryptographic fact into a mutable account name with a history problem.
So `identity/LocalIdentityProvider.js#declareSuccessor()` never
repoints an identityId at a new key. It always produces a NEW,
independent identity plus a signed, directional link
(`core/IdentitySuccessionEnvelope.js`) from the old one to the new one.
A rotation is two identities, always, never one identity that
changed.

### A Successor Declaration Is Signed By The Predecessor, Never Counter-Signed By The Successor (0.2.67)

`core/IdentitySuccessionEnvelope.js`'s signature is produced entirely
by the PREDECESSOR's key. The successor never signs anything to
"accept" the role. This is not an oversight — the successor identity
is already, on its own terms, a fully valid, independently provable
`LocalIdentity` the moment it is created; nothing about being named a
successor changes what it is or requires new proof of what it already
proved by existing. What the declaration establishes is a fact ABOUT
the predecessor ("I, identity A, name identity B as what replaces me")
— which is why only A's signature is either necessary or meaningful
here, the same way a will only needs the testator's signature, not the
heir's.

### Declaring A Successor Does Not Revoke The Predecessor (0.2.67)

`identity/LocalIdentityProvider.js#declareSuccessor()` never touches
`lifecycleState`. Alice can name her next key as a successor today and
keep signing with her current key for weeks — the declaration is a
statement of intent, not an event with consequences for what the old
key can still do. Revocation is a separate, deliberate act
(`revokeIdentity()`), which happens to accept an optional
`successorIdentityId` of its own so the common "I am rotating right
now, and the old key stops working right now" gesture can still be one
signed user action — but "I have a successor" and "I am revoked" stay
two independently-true-or-false facts about an identity, never one
collapsing into the other.

### An Identity Can Be Revoked Without A Successor (0.2.67)

The reverse of the principle above: `core/IdentityRevocationEnvelope.js`'s
`successorIdentityId` field is optional, and `revokeIdentity()` never
requires one. Losing a device, or simply wanting to stop using an
identity, is a completely valid reason to revoke it with nothing lined
up to replace it — this codebase does not force every revocation into
the shape of a planned rotation.

### A Revocation Is Self-Attested, Never Third-Party (0.2.67)

`core/IdentityRevocationEnvelope.js`'s REQUIRED signature must be
produced by the very identityId it revokes — the same discipline
`core/FriendshipAdvertisement.js` already established in 0.2.57 for
"there is no server anywhere that could otherwise vouch for this,"
applied here to a claim with even higher stakes. See the next
principle for what this rules out.

### No Central Authority Can Revoke An Identity It Does Not Control (0.2.67)

`identity/LocalAuthorizationVerifier.js#verifyIdentityRevocation()`
requires the signature's `signer` to equal the record's own
`identityId` — a revocation record is meaningless unless the identity
it claims to revoke is provably the one that produced it. This is a
deliberate, structural refusal to build the tempting alternative: a
ForkBuild identity server that could answer "is Alice revoked?"
authoritatively. That would undermine the single strongest property
this architecture has maintained since 0.2.16 — the key IS the
authority, not a server. So there is no code path anywhere, in 0.2.67
or otherwise, by which anyone other than an identity's own current key
can produce a revocation record for it. A stolen device does not, by
itself, let an attacker revoke the victim's OTHER identities; a
compromised identity can only ever revoke itself, by whoever currently
holds its key — which is exactly why backing up a key (0.2.48) before
it might be needed for exactly this purpose matters.

### Revocation Is A Signing Gate, Not A Session Gate (0.2.67)

`identity/LocalIdentityProvider.js#_requireAuthenticatedIdentity()` —
reached only by `signCanonical()`/`getSigningIdentity()` — is the one
and only place revocation is enforced. `authenticate()`, `currentSession()`,
and `currentUser()` are completely untouched by a revoked identity's
status: the app can still show a revoked identity as "logged in," and
its owner can still inspect its revocation record or export it one
final time. This extends, rather than breaks, the independence 0.2.46
established between "identity exists" and "session is authenticated,"
and 0.2.47 extended to "vault is unlocked": `VAULT LOCKED`,
`AUTHENTICATION INACTIVE`, and `IDENTITY REVOKED` are three genuinely
independent facts about one identity, checked in that order only
because a locked-vault question is meaningless before an authenticated-
session question is settled, and a revoked-identity question is
checked ahead of both because it is the most permanent of the three —
see `_requireAuthenticatedIdentity()`'s own comment for the exact
order and why.

### Revocation Prevents New Trust; It Does Not Retroactively Revoke Old Trust (0.2.67)

Revoking an identity closes exactly one door: the ability to produce a
new, valid signature — including a new `peer/PeerAuthenticationSession.js`
PROOF — from that point forward. It does not, and structurally cannot,
reach into an already-`AUTHENTICATED` `peer/PeerIdentity.js` on some
live connection elsewhere and tear it down, because this codebase has
never persisted a "currently trusted peers" ledger for a revocation to
even find: every peer connection has been fully ephemeral, re-proved
from nothing on every reconnect, since 0.2.49. This is a direct
consequence of that earlier design, not a gap 0.2.67 introduces — a
revocation reaching backward into a live session would require exactly
the kind of persistent cross-session peer-trust state 0.2.49 through
0.2.56 deliberately never built.

### Changing A Passphrase Never Changes The Identity (0.2.67)

`identity/LocalIdentityProvider.js#changePassphrase()` touches exactly
one thing: which bytes protect the private key at rest. identityId,
publicKey, label, createdAt, every signature ever produced, every
`core/PeerRelationship.js`/`core/FriendshipRecord.js` keyed on this
identity's identityId — none of it needs to change, or even be aware a
passphrase change happened, because none of it was ever keyed on the
passphrase. This is the same distinction 0.2.47 drew between "is the
key encrypted" and "which key is it" applied to the encryption itself
changing rather than merely being added.

### Backup, Recovery, Rotation, And Revocation Are Four Different Questions (0.2.67)

It would have been tempting to fold all four into one "account
management" surface — they all involve a passphrase, a stored package,
or a signed statement about an identity. This codebase deliberately
keeps them apart:

```text
Backup      "preserve this identity, elsewhere"           (0.2.48)
Recovery    "regain control of an identity I still have
             the exported package and passphrase for"     (0.2.48)
Rotation    "deliberately establish a successor identity" (0.2.67)
Revocation  "permanently invalidate an identity"           (0.2.67)
```

Backup and Recovery never needed a lifecycle concept at all — moving a
key between devices is orthogonal to whether that key is still trusted.
Rotation and Revocation never needed a second key-transport format —
they are signed statements ABOUT an identity, not packages containing
one. Collapsing these into a single mechanism would have made each one
individually less honest about what it actually guarantees; see this
file's own "Recovery Is Not Password Recovery" (0.2.48) for the same
instinct applied one milestone earlier.

### A Relayed Identity Lifecycle Record Is Trusted By Its Own Signature, Never By Who Relayed It (0.2.68)

`application/FriendRelationshipUseCase.js`'s ingestion boundary binds a
friendship advertisement's claimed actor to the SPECIFIC, already-
AUTHENTICATED connection it arrived on — a friendship claim is
first-person ("I did X"), so the relaying connection's proven identity
IS part of what makes it meaningful. An identity-lifecycle revocation
or succession record is a fundamentally different kind of claim: it is
THIRD-PARTY-relayable by construction, because it was never about the
connection it happens to arrive over. Charlie, merely connected to Bob
right now, can legitimately hand Bob a revocation Alice signed —
without Charlie being Alice, without Charlie ever having been directly
connected to her at all. `application/
IdentityLifecyclePropagationUseCase.js#_handleIncoming()` deliberately
never reads `meta.connectedPeer.remoteIdentity`; the record's own
signature, verified by the exact same `identity/
LocalAuthorizationVerifier.js` methods 0.2.67 already wrote, is the
entire trust boundary. Confusing this with friendship's own rule would
have made a revocation only reachable by identities the revoked
identity happened to still be directly connected to at the moment of
revocation — exactly the scenario propagation exists to not depend on.

### Propagation Reaches Identities This Device Already Knows, Never An Open Revocation Directory (0.2.68)

Without a bound, "any two authenticated peers can exchange signed
lifecycle facts about any identity" would let this protocol grow into
an unbounded cache of revocations for identities neither side has ever
otherwise interacted with — a shadow global directory this
architecture has no server for and no interest in building one of
implicitly. `application/IdentityLifecyclePropagationUseCase.js`'s
`knowsIdentity` predicate (wired, in the live app, against the SAME
`core/PeerRelationship.js`/`core/FriendshipRecord.js` stores every
other social feature already reads) is the deliberate bound: a
genuinely, validly signed record about an identity this device has
never remembered is dropped, not stored "just in case." This is a
relevance gate, never a trust downgrade — an identity Bob DOES know
gets exactly the same cryptographic verification either way.

### Identity Lifecycle State Does Not Implicitly Rewrite Unrelated Durable Social State (0.2.68)

Learning that identity A was revoked, or rotated to identity B, is
information — never, by itself, an instruction to mutate anything else
this device has on record. `core/RemoteIdentityLifecycle.js` is a
deliberately separate store from `core/PeerRelationship.js` and `core/
FriendshipRecord.js`, cross-referenced only for DISPLAY (`ui/views/
PeerConnectionsView.js`'s "⚠ Revoked" line) exactly the way "Known
Peers" already cross-references "My Peers" for live connection status.
Nothing in this milestone deletes a `PeerRelationship`, ends a
`FriendshipRecord`, merges A's relationship into B's, or otherwise acts
on this device's behalf because a lifecycle fact arrived. A verified
succession link between A and B establishes exactly one thing —
`A -> B` as a cryptographically verifiable identity-lifecycle
relationship — and nothing about what that should mean to
`PeerRelationship`, `FriendshipRecord`, a chat history, or any other
durable application state this codebase has or will ever have. Should
"Alice rotated, so treat my friendship with A as a friendship with B"
ever become a real, wanted feature, it is a higher-level, EXPLICIT
migration operation a person deliberately triggers — never something
propagation does silently on arrival. See also "Persistent State
Should Not Be Inferred From Ephemeral Transport State" (0.2.49) — this
is the same restraint, applied one layer up: durable social state
should not be inferred from a lifecycle event either, no matter how
cryptographically certain that event is.

### Propagation Carries A Record, It Does Not Mint A New Claim (0.2.68)

`core/IdentityLifecycleGossip.js`'s wire message is deliberately the
thinnest possible wrapper — a `kind` discriminator plus the EXACT
`core/IdentityRevocationEnvelope.js`/`core/IdentitySuccessionEnvelope.js`
record `identity/LocalIdentityProvider.js` already produced and stored
locally in 0.2.67, byte for byte. There is no second signature, no
propagation-specific envelope, and no new `SignatureType` — a gossiped
REVOCATION is the identical object `identity/
LocalAuthorizationVerifier.js#verifyIdentityRevocation()` already knew
how to verify before this milestone existed, merely handed to a peer
instead of only ever read back off the revoking device's own storage.
This is what keeps propagation from becoming a second, competing
source of truth about an identity's lifecycle: there is exactly one
kind of evidence, produced exactly one way, verified exactly one way,
whether it is read locally or received over the wire.

### A Reload Continues A Conversation; It Never Starts A New One (0.2.69)

`application/LiveConversation.js` (0.2.61) was always in-memory only,
and 0.2.63 deliberately kept it that way — see "The Outbox Prunes
Itself; It Is Not A Message Database" (0.2.63). That left an honest gap
open ever since: reload the page, and every conversation this device
ever had simply vanished, not because anything was wrong, but because
nothing durable backed it. `application/ChatUseCase.js#_rehydrateFromStore()`
closes that gap without touching `LiveConversation` itself at all — it
stays exactly as ephemeral as 0.2.61 left it, still with no toJSON/
fromJSON of its own. What changed is what SEEDS it: on construction,
every `LiveConversation` this owner has any stored history for is
rebuilt from `application/ConversationStore.js`, in order, BEFORE a
single peer is even attached to `peer/PeerMessageBus.js`. A reload is
therefore never "a new conversation that happens to look similar" — it
is the SAME conversation, continued, the same way `application/
PeerRelationshipUseCase.js` already ensured a remembered peer survives
a reload without pretending the old connection is still alive
(0.2.56).

### Sequence Continuity Is What Makes A Reload Actually Work, Not Merely Look Like It Works (0.2.69)

Restoring displayed message history after a reload is the easy half of
"a reload continues the conversation." The hard half, easy to miss
entirely, is this: `application/ChatUseCase.js#sendMessage()`/
`sendOrQueue()` both mint the next outgoing `sequence` from an
in-memory `_nextSequence` map — and a fresh `ChatUseCase` instance,
with no rehydration, would restart that count at 1 on every reload.
`core/ChatReplayWindow.js` (0.2.61, completely unmodified) rejects
anything that isn't STRICTLY NEWER than the highest sequence it already
accepted from that sender. A recipient who already accepted sequence 1,
2, and 3 from Alice in a prior session would therefore silently reject
her very next message after Alice reloads and resends starting at 1
again — not a crash, not a visible error, just a message that
disappears into a replay-rejection with nothing on either screen to
explain why. `_rehydrateFromStore()` re-seeds `_nextSequence` from the
highest sequence found among this device's own OUTGOING stored entries
for each peer, closing the gap before it can ever manifest. Nothing
about this required touching `core/ChatMessage.js`, `core/
ChatReplayWindow.js`, or the wire protocol — the fix lives entirely on
the sending side, in what a fresh instance assumes about its own prior
history.

### A Durable Conversation Store Is Addressed To An Identity, Never A Connection (0.2.69)

`core/PeerRelationship.js` (0.2.56) drew this line for persistent
relationships, and `core/ChatOutboxEntry.js` (0.2.63) drew the
identical line for queued outgoing mail: an endpoint is exactly as
ephemeral as the connection it came from, so nothing durable is ever
keyed by one. `core/ConversationEntry.js` draws the same line a third
time, for conversation HISTORY: every entry carries a `peerIdentityId`,
never a connectionId. This is what makes the 0.2.63 security property —
"if Alice queues mail for Bob and a later reconnect attempt genuinely
authenticates as Charlie instead, Bob's mail is neither sent to Charlie
nor lost, because it was never addressed to a connection in the first
place" — extend to conversation history for free, with no new
enforcement code: `application/ConversationStore.js` only ever answers
questions about a peerIdentityId, and a rejected reconnect never
produces one belonging to the wrong identity.

### A Local History Store Is Never An Authorization Mechanism (0.2.69)

`application/ConversationStore.js` sits entirely on the OUTPUT side of
`application/ChatUseCase.js`'s trust boundary, never the input side.
Every write to it — `append()`, `updateDeliveryState()` — is called
from exactly two places, `_appendMessage()` and `_publishDeliveryState()`,
and both are only ever reached AFTER `_handleIncoming()`'s full,
ordered six-point ingestion boundary (well-formed shape, sender matches
the authenticated connection, not blocked, FRIEND, correct
conversationId, replay/sequence valid — see that method's own header)
has already decided a message is genuine, or after `sendMessage()`/
`sendOrQueue()`'s own `_requireEligible()` gate has already authorized
an outgoing one. The store itself performs no friendship check, no
block check, no replay check, and is never consulted by
`_handleIncoming()` to decide whether to accept anything — it has no
method that could even be asked. A conversation's durable history is a
LOG of decisions already made, never a place a decision gets made from;
this is the same one-way relationship `application/LiveConversation.js`
already had with `ChatUseCase` in 0.2.61, simply extended to something
that now also survives a reload.

### Never Reuse A Durable Outbox As A Message Database, Or A Message Database As An Outbox (0.2.69)

`application/ChatOutbox.js` (0.2.63) and `application/ConversationStore.js`
(0.2.69) look, at a glance, like the same idea twice: both are durable,
per-owner, `peerIdentityId`-addressed stores of chat-adjacent state
behind an injected StorageProvider. They are deliberately kept as two
separate classes with two separate storage keys and zero shared code,
because they answer two genuinely different questions with two
genuinely opposite retention postures. The outbox answers "what have I
sent that I haven't yet confirmed arrived" and prunes itself the
INSTANT that question is answered — a DELIVERED entry is deleted from
storage immediately (see "The Outbox Prunes Itself; It Is Not A Message
Database," 0.2.63), and an expired one is dropped just as completely.
The conversation store answers "what did we talk about" and keeps
EVERY message, delivered or not, up to a per-peer cap that exists for
storage hygiene, never as a retention policy. Collapsing the two into
one store would force an uncomfortable choice on every entry — prune it
promptly (and lose conversation history) or keep it forever (and turn
the outbox into exactly the message database 0.2.63 refused to build)
— that neither original design intended and this milestone declines to
introduce.

### Idempotent Local Storage Is What Makes A Bounded, Resettable Replay Window Safe To Leave Alone (0.2.69)

`core/ChatReplayWindow.js` (0.2.61) is bounded and purely in-memory —
an explicit, accepted trade-off, not an oversight (see this file's own
precedent for `core/PresenceReplayWindow.js`, "a live presence stream
is nothing like the rare durable events" a heavier structure was built
for). 0.2.69 could have "fixed" this by persisting the replay window
too, so a reload never forgets which messages were already accepted.
It deliberately does not: the actual failure mode a reset replay window
produces — a stale retransmit being accepted a second time after a
reload, purely because the window forgot it once — is already
completely absorbed by `application/ConversationStore.js#append()`'s
own idempotence by `(peerIdentityId, messageId)`. The worst case is a
redundant, silently-discarded write to already-existing durable state,
never a duplicate entry in a user-visible transcript and never a
security exposure — the message content was already trusted the FIRST
time it was accepted, and accepting the identical bytes a second time
grants nothing new. Fixing a problem that never actually manifests, by
adding persistence to a component explicitly designed to stay bounded
and disposable, would have been solving the wrong layer.

### Offline Is Not Absence: Identity, Relationship, Friendship, And Conversation All Outlive The Connection (0.2.70)

0.2.56 through 0.2.69 each independently made ONE fact about another
participant durable — a `PeerRelationship` (0.2.56), a
`FriendshipRecord` (0.2.57), a conversation's own history (0.2.69) — and
each of those milestones proved, on its own, that the fact it added
survives a disconnect. 0.2.70 names the property that falls out of all
three having done that separately, on purpose, rather than merged into
one lifecycle: a connection closing is the ONLY thing that becomes
false. `application/PeerRelationshipUseCase.js` still has the
relationship. `application/FriendRelationshipUseCase.js` still has the
friendship. `application/ConversationStore.js` still has every message.
`application/ChatOutbox.js` still has whatever was queued, waiting for
exactly this moment to flush. None of those four stores has ever heard
of `application/ConnectedPeerRegistry.js`, and none of them needs to —
each already answers its own question correctly regardless of whether
anyone is connected right now, precisely because none of them was ever
built to depend on that. `application/PeerPresenceUseCase.js` is the
first piece of code in this codebase that reads all five facts
together, and it exists ONLY to make that already-true independence
visible to a UI in one place — see the next principle.

### A Peer Presence Summary Reconciles Independent Lifetimes; It Is Never A Fourth Store (0.2.70)

The temptation `application/PeerPresenceUseCase.js` was built to resist:
collapsing identity, relationship, friendship, connection, and
conversation into one `PeerState` object durable enough to be worth
caching. This codebase already has a name for what goes wrong when a
derived summary is stored instead of recomputed —
`peer/PeerLifecycleState.js#derivePeerLifecycleState()`'s own header:
"what happens when it disagrees with the two real state machines it's
supposed to be summarizing?" `PeerPresenceUseCase#getSummary()`/`list()`
apply the identical discipline one layer up, across five sources
instead of two: every call reads `ConnectedPeerRegistry`,
`PeerRelationshipUseCase`, `FriendRelationshipUseCase`,
`ConversationStore`, and `ChatOutbox` fresh, computes a plain object,
and stores nothing. There is no cache to invalidate and no snapshot that
can ever drift out of sync with the sources it summarizes, because
there is no snapshot at all outside of the single call that just
returned one. `onChange()` republishes by recomputing from scratch, not
by patching a stored value. The class also deliberately does NOT
introduce a second connection-lifecycle vocabulary (CONNECTING /
AUTHENTICATING / CONNECTED / DISCONNECTED / FAILED) alongside
`peer/PeerLifecycleState.js` — that file already is the one vocabulary
for transport/session state, and a summary needs only one new boolean,
`isConnectedNow`, to say the one new thing worth saying: whether a live,
AUTHENTICATED `ConnectedPeer` exists for this identity at all.

### A Read Marker Is A Local Note About What THIS Device Has Seen, Never A Receipt Sent To Anyone (0.2.70)

`core/ChatDeliveryAck.js` (0.2.63) already answers "did this message
reach the recipient's device" — a signed, transmitted, TRANSPORT fact,
sent back automatically by the recipient's own trust boundary the
instant it accepts a message, with no human involved at all. Whether a
human then actually looked at the screen is a genuinely different
question, and `application/ConversationReadTracker.js` answers only
that one, only for the device that asks it — `core/
ConversationReadMarker.js` is never signed, never carried over
`peer/PeerMessageBus.js`, and never read by
`application/ChatUseCase.js`'s own ingestion boundary. Bob marking a
conversation read tells Bob's own device that Bob's own device has seen
it; Alice has no way to observe that this happened, and no code path
anywhere in this codebase gives her one. This is a deliberate line, not
an oversight: a real read RECEIPT — signed evidence, transmitted to the
other participant, that a specific message was actually seen — is a
different protocol with its own authorization, replay, and persistence
semantics, and is explicitly deferred (see docs/Roadmap.md) rather than
casually implied by a name like "read" that could be mistaken for one.

### A Read Marker Answers A Third Question; It Is Never Folded Into The Outbox Or The History Store (0.2.70)

`application/ChatOutbox.js` (0.2.63) answers "what have I sent that
hasn't been confirmed delivered" and prunes itself the instant that
question is answered. `application/ConversationStore.js` (0.2.69)
answers "what did we talk about" and keeps everything, delivered or
not. `application/ConversationReadTracker.js` (0.2.70) answers a third
question neither of those two can: "what have I actually seen." All
three are durable, all three are per-owner, all three are addressed by
`peerIdentityId`, and all three could, at a glance, be merged into one
"chat state" store. They are kept as three separate classes with three
separate storage keys and zero shared code for the same reason 0.2.69's
own header already gave for keeping the first two apart: collapsing
opposite retention postures and genuinely different questions into one
store forces an uncomfortable compromise none of the three original
designs intended. The read tracker in particular never reads message
CONTENT at all — it only ever receives a bare `peerIdentityId` and a
sequence number to advance to, computed by its one caller,
`application/PeerPresenceUseCase.js#markRead()` — so it has no way to
become a second, competing copy of either of the other two stores even
by accident.

### A Read Receipt Is Computed Independently From The Local Read Marker, Never Transmitted From It (0.2.71)

The instruction that shaped this milestone was explicit: do not make
`core/ConversationReadMarker.js` (0.2.70) into a network read receipt
by simply transmitting it. `application/ChatUseCase.js#sendReadReceipt()`
honors that structurally, not merely by convention — it never reads
`application/ConversationReadTracker.js` at all. Instead it recomputes
"the highest incoming sequence I currently hold for this peer" itself,
straight from its own `_conversations`, which is the EXACT SAME
computation `application/PeerPresenceUseCase.js#markRead()`
independently performs against `application/ConversationStore.js` one
layer over. Two independent computations of one underlying fact, never
one derived from the other, feeding two genuinely different stores: a
LOCAL note (`ConversationReadTracker`, unsigned, never transmitted) and
a NETWORK claim (`application/ConversationReadOutbox.js` ->
`core/ChatReadReceipt.js`, authenticated by the connection that carries
it). Nothing in this codebase ever reads a `ConversationReadMarker` to
produce a `ChatReadReceipt`, so it is not merely undocumented that the
local marker never becomes the wire payload — there is no code path
that could make it so even by accident.

### A Coalescing Outbox Remembers The Latest Value, Not Every Event (0.2.71)

`application/ChatOutbox.js` (0.2.63) holds one entry per MESSAGE,
because every queued message is its own genuine, individually-important
event. `application/ConversationReadOutbox.js` (0.2.71) is a
structurally different kind of outbox for a structurally different kind
of fact: "read through sequence N" already logically implies "read
through sequence N-1, N-2, ... 1," so there is never anything worth
queuing alongside it, only something worth REPLACING it. It holds at
most one entry per peer (`core/ConversationReadOutboxEntry.js`), and
`enqueue()` coalesces every call into that single entry via the same
`Math.max`-style monotonic advance every other durable read-state value
object in this codebase already uses. Ten `markRead`/`sendReadReceipt`
calls in a row while a peer is offline never produce ten things to
transmit once they reconnect — they produce exactly one, the latest.
This is also why the protocol needs no replay window at all
(`application/ChatUseCase.js#_handleIncomingRead()`): an out-of-order or
duplicate delivery of a lower-or-equal value is harmless by
construction on the RECEIVING side too
(`application/RemoteReadReceiptStore.js`'s own monotonic write), never
something a receiver needs to detect and reject.

### A Read Marker And A Read Receipt Are Opposite-Direction Facts, Never The Same Store (0.2.71)

`core/ConversationReadMarker.js` (0.2.70) and `core/RemoteReadReceipt.js`
(0.2.71) are structurally identical — a peerIdentityId plus a monotonic
high-water-mark sequence — and were deliberately kept as two separate
classes with two separate durable stores anyway, because they answer
opposite-direction questions: "what have I seen of the PEER's messages"
(local, asserted about oneself) versus "what has the PEER told me they
have seen of MY OWN messages" (a received, trusted claim about oneself,
written only after `application/ChatUseCase.js`'s own trust gates —
connection-proven sender, correct re-derived conversationId — already
accepted it). The same reasoning "A Read Marker Answers A Third
Question" (above) already gives for keeping the outbox, the history
store, and the read tracker apart applies here again: collapsing a
local fact and a network claim into one store, just because their
shapes happen to match, is exactly the kind of conflation this
milestone's own founding instruction refused to allow.

### Social Authorization Controls What May Happen Next; It Never Rewrites What Already Happened (0.2.72)

Blocking or unfriending a peer changes what `application/ChatUseCase.js`
will do on the NEXT send, the NEXT incoming message, and the NEXT
reconnect. It never changes what already, genuinely happened.
`application/ConversationStore.js` (0.2.69), `application/
ConversationReadTracker.js` (0.2.70), and `application/
RemoteReadReceiptStore.js` (0.2.71) each have exactly one writer in this
codebase, and none of those writers is `PeerBlockUseCase#block()` or
`FriendRelationshipUseCase#unfriend()`. This was already true before
0.2.72 added a single line of code — the guarantee fell straight out of
those three stores' own write discipline, established one and two
milestones earlier for entirely different reasons. What 0.2.72
contributes is not new enforcement; it is proof, and a name: a message
already delivered stays delivered, a message already read stays marked
read, and a peer's own durable record that they saw your message stays
exactly as durable after you block them as before. Only what has not
yet happened — an unsent send, an unconfirmed delivery, an unflushed
queue entry — is ever subject to a change in authorization.

### Queued Mail Answers To The Same Eligibility Check As A Fresh Send, Never A Softer One (0.2.72)

`application/ChatUseCase.js#canChat()` has meant exactly one thing since
0.2.61: authenticated peer, not locally blocked, and currently a mutual
FRIEND, checked fresh every time it's asked. 0.2.63 extended that
discipline to a queued message's own eventual delivery —
`_attemptFlush()` re-checks `canChat()` before ever handing a QUEUED
entry to the wire, so a blocked or unfriended peer's mail was already
structurally incapable of being delivered, well before 0.2.72 existed.
What 0.2.72 adds is proactivity, not a new rule: `_cancelOutboxFor()`
answers the identical `canChat()` question `_attemptFlush()` already
asks, just earlier — the instant authorization is withdrawn, rather
than waiting for a reconnect a permanently-offline peer might never
attempt. Block and unfriend are deliberately never distinguished here:
both already revoke `canChat()` identically, and a message sitting
QUEUED does not get to answer a softer question than a message about to
be freshly sent would. Inventing a special case where an already-queued
message survives an unfriend but not a block — plausible as a product
choice in the abstract — would mean two different code paths
(`_attemptFlush()` and the new cancellation path) disagreeing about the
very same eligibility fact for the very same peer, the exact kind of
conflation this codebase's own "ask a predicate fresh, never cache or
special-case it" discipline (0.2.58's `isFriend`, 0.2.60's `isBlocked`,
0.2.61's `canChat()` itself) has refused since it was first established.

### A Fact About Time And A Fact About Authorization Are Different Terminal States, Never One Reused For The Other (0.2.72)

`core/ChatDeliveryState.js`'s `EXPIRED` (0.2.63) and `CANCELLED` (0.2.72)
can look, from a UI's distance, like the same thing: a message that
never reached its recipient. They are answers to different questions.
`EXPIRED` means this device waited as long as it was willing to
(`core/ChatOutboxEntry.js`'s own TTL) and the peer simply never came
back in time — the message MIGHT have been delivered if only this
device had stayed patient a little longer, or the peer had reconnected
a little sooner; it is a fact about a clock. `CANCELLED` means this
device's own owner made a deliberate decision — block or unfriend —
that the message was never going to be delivered again, REGARDLESS of
how much longer this device waited or how soon the peer reconnected; it
is a fact about a relationship. Reusing `EXPIRED` for both, as a first
sketch of this milestone considered, would have quietly told a user "I
gave up on time" when the true story was "you told me to stop" — a
materially different, and more honest, thing to say back to the person
who made that choice.

### Media Never Establishes Peer Identity; Authenticated Peer Identity Authorizes Media (0.2.73)

A WebRTC audio track proves nothing about who is speaking — it carries
no signature, no challenge/response, nothing `peer/PeerAuthenticationSession.js`
would recognize as evidence. `application/VoiceUseCase.js` never treats
it as though it did: every operation starts by requiring a
`connectedPeer` that is ALREADY, right now, `PeerLifecycleState.AUTHENTICATED`
— exactly the same precondition every other protocol built on
`peer/PeerMessageBus.js` (chat, friendship, presence) already enforces,
never a voice-specific relaxation of it. The direction only ever runs
one way: authentication (0.2.49) establishes who is on a connection;
voice (0.2.73), like every protocol before it, merely gets to ASK
whether that already-established identity is currently authorized to
do the thing it wants to do. Nothing about adding a media track ever
lets a connection skip, shortcut, or substitute for the identity proof
`peer/PeerAuthenticationSession.js` alone provides.

### One Logical PeerConnection Serves Every Protocol, Including Media (0.2.73)

The temptation a media feature almost always creates is a second
connection — its own signaling, its own lifecycle, its own trust
question to answer from scratch. 0.2.73 deliberately refuses it:
`peer/WebRtcPeerConnection.js`'s new `addAudioTrack()`/`renegotiate()`/
`applyRemoteOffer()`/`applyRemoteAnswer()`/`onRemoteTrack()` all operate
on the SAME `RTCPeerConnection` already carrying
`peer/PeerMessageBus.js`'s DataChannel — chat, friendship, presence, and
now voice are four protocols sharing ONE authenticated transport, never
four separately-authenticated ones. This is the same discipline
`peer/PeerMessageBus.js` itself established in 0.2.52 for data
protocols, extended for the first time to a MEDIA protocol: a shared
connection, once authenticated, is a resource every application-level
concern is entitled to build on, never a reason to open a parallel one.

### Renegotiation Travels In-Band, Over The Connection It Renegotiates (0.2.73)

The INITIAL WebRTC handshake (0.2.51) needs an out-of-band channel
precisely because no connection exists yet to carry it — an offer has
nowhere else to travel except through a discovery invitation, a
copy/paste, a QR code. A voice renegotiation has the opposite shape:
the connection it is renegotiating ALREADY exists, is ALREADY
authenticated, and already has a reliable, ordered channel of its own.
`core/VoiceMediaSignal.js` deliberately travels over that same
connection's own `peer/PeerMessageBus.js`, on its own protocol string,
rather than through any rendezvous or out-of-band mechanism — there is
nothing left to bootstrap once a connection already exists, and
inventing a second signaling path for renegotiation would only
reintroduce the exact bootstrap problem 0.2.49 through 0.2.66 spent
milestones solving, for a question that was already answered the moment
the call's own underlying connection authenticated.

### Exactly One Side Renegotiates; Role Decides Which, Forever (0.2.73)

Real WebRTC renegotiation between two peers that might both propose
changes at once ordinarily needs a "polite peer" protocol to resolve
the conflict. 0.2.73 avoids the entire class of problem structurally:
`peer/WebRtcPeerConnection.js#role` (0.2.51) — `'offerer'` or
`'answerer'`, fixed forever at the moment THAT connection's DataChannel
was first established, completely independent of who happens to place
any particular later call — is reused as the single, permanent answer
to "who renegotiates." `application/VoiceUseCase.js#_beginMediaNegotiation()`
runs identical code on both sides and only the `role === 'offerer'` side
ever calls `renegotiate()`; the other side attaches its own track and
waits. A fact 0.2.51 already established once, for an entirely
different reason, turns out to be exactly the tie-breaker every later
renegotiation needs — a coincidence worth naming, not re-deriving with
new state.

### Voice Lifecycle Is Independent Of Peer Lifecycle (0.2.73)

`peer/PeerConnection.js`'s own header already separated transport state
from authentication state, and 0.2.72 kept "what may still happen" fully
separate from "what already happened." 0.2.73 draws the identical
boundary a third time: `core/VoiceSessionState.js` answers "is this peer
currently participating in an audio session," a question with no
bearing at all on `peer/PeerLifecycleState.js`'s own "does a channel to
them exist, and is it authenticated." Ending a call never closes the
underlying connection — `application/VoiceUseCase.js#endCall()` only
ever tears down local media and sends a control signal — and a
connection dropping is what ends a call as a CONSEQUENCE, never
something voice itself decides to do to the connection. A peer can be
`AUTHENTICATED` with voice `IDLE`, or (briefly, mid-teardown) voice
`ENDED` with the peer still fully `AUTHENTICATED`; neither axis is ever
inferred from the other.

### Voice Reuses Chat's Own Authorization Question; It Never Invents A Second Trust System (0.2.73)

`application/ChatUseCase.js#canChat()` and
`application/VoiceUseCase.js#canCall()` are deliberately the same
predicate: authenticated, not blocked, `FriendshipState.FRIEND`. Voice
could have invented its own, narrower or broader, eligibility rule —
the design doc explicitly named this as a product decision it was
choosing NOT to make differently from chat without a concrete reason to.
Reusing the identical predicate means the SAME proactive-cancellation
machinery 0.2.72 already built for chat (subscribing to
`peerBlockUseCase.onBlockedChanged()`/`friendRelationshipUseCase
.onRelationshipsChanged()`, tearing down whatever is already in flight
the instant eligibility flips) extends to voice by simply subscribing a
second, independent time — no new trust vocabulary, no new revocation
mechanism, and no risk of chat and voice ever disagreeing about whether
two people are currently allowed to reach each other.

### Audio Device State Is Never Presence, Never A Wire Fact (0.2.73)

Presence (`core/AvatarPresence.js`, `core/PresenceLifecycleState.js`)
answers "where/how is this avatar currently represented" — deliberately
ephemeral, deliberately social, and deliberately never asked to carry
information it was never designed for. `application/VoiceUseCase.js#setMuted()`
only ever flips a local `MediaStreamTrack#enabled` flag — never
transmitted, never folded into `core/VoiceCallSignal.js` or
`core/VoiceMediaSignal.js`, and never surfaced through presence's own
vocabulary. "Bob is muted" as something Alice's UI could display is a
real, separate future feature — an explicit signal someone would have
to choose to send — never an accidental consequence of overloading a
vocabulary that already means something else.

### Voice Is Ephemeral Like Presence And Connections, Never Durable Like Conversations Or Relationships (0.2.73)

`application/ConversationStore.js` (0.2.69) made a deliberate, narrow
case for SOME chat state to survive a reload. Voice makes the opposite
case just as deliberately: nothing about a call — not its callId, not
its participants, not when it happened — is ever written to storage.
`core/VoiceSessionState.js#ENDED` is a genuinely terminal, transient
value, published exactly once and immediately cleared, the same shape
`peer/PeerAuthenticationState.js#FAILED` already established for one
connection's own authentication attempt. A "recent calls" list, a
missed-call notification, or any other durable trace of a call having
happened is real future work this milestone deliberately does not
attempt — voice stays exactly as ephemeral as the presence and
connection layers it is built on, never quietly acquiring the
durability chat earned for itself in 0.2.69–0.2.72.

### Ringing Is Bounded By Local Policy, Never By The Network (0.2.74)

Every OTHER bounded wait this codebase has ever built —
`application/PeerSessionManager.js`'s own signaling timeout,
`application/AutosaveScheduler.js`'s own debounce — is a purely local
decision, never something the remote side is consulted about or could
override. `application/VoiceUseCase.js#_armRingingTimeout()` extends the
identical discipline to CALLING/RINGING: each device starts its OWN timer
the instant it enters either state, and tears its OWN call down as
`VoiceCallEndReason.TIMEOUT` if the timer fires first — regardless of
whatever the OTHER device's own timer, ringtone, or human is doing. The
best-effort END notification a firing timer sends is a courtesy, proven
by construction to never be required for correctness: the OTHER side's own
independent timer would eventually reach the identical conclusion on its
own, with or without that notification ever arriving.

### Reasons Are Local Judgments, Never Transmitted Facts (0.2.74)

`core/VoiceCallEndReason.js` closes the free-text `reason` string 0.2.73
left open, but deliberately stops short of adding it to
`core/VoiceCallSignal.js`'s own wire shape. This is the same restraint
`core/AvatarPresenceAdvertisement.js` already showed by carrying no
sender-claimed timestamp (0.2.37's own header: presence lifecycle is
"derived purely from elapsed time on the RECEIVER's own clock, never a
stored fact") — a value only the RECEIVER is positioned to judge honestly
should never be accepted as a claim from the SENDER instead.
`VoiceCallSignalType.END` means exactly one thing on the wire, "this call
is over," and `application/VoiceUseCase.js#_handleEnd()` always maps it to
`VoiceCallEndReason.REMOTE_HANGUP` — never MEDIA_FAILED, never TIMEOUT,
never anything the sender would have to self-report and this side would
have to simply trust. REJECTED and BUSY remain the two exceptions, and
deliberately so: they are not reasons inferred from a generic signal, but
their OWN dedicated, honest `VoiceCallSignalType` values a sender chooses
to send.

### A Call Failure Always Tells The Other Side (0.2.74)

0.2.73 had a real, if narrow, hole: a media/negotiation failure after
ACCEPT had already been exchanged tore down the FAILING side's own call
but left the OTHER side stranded in CONNECTING, its own microphone
potentially already attached, waiting on a renegotiation SDP that would
now never arrive. `application/VoiceUseCase.js#_notifyPeerCallEnded()` —
factored out of `endCall()`'s own original 0.2.73 body, and now reused by
every LOCAL decision that a call is over (a hang up, a block/unfriend, a
ringing timeout, a media/negotiation failure) — closes it: every one of
those paths tells the peer via the SAME `VoiceCallSignalType.END` an
ordinary hang up already uses, never a new wire type invented for the
occasion. The peer never learns WHY (see this file's own "Reasons Are
Local Judgments" above) — only that there is nothing left to wait for.

### A Local Microphone Failure Is Never A Peer Or Connection Failure (0.2.74)

`application/VoiceUseCase.js#_beginMediaNegotiation()` now tags whatever
it throws with either `VoiceCallEndReason.MEDIA_FAILED` (this device's own
`application/LocalAudioTrackProvider.js#getLocalAudioTrack()` itself threw
— no microphone, a denied permission prompt) or `NEGOTIATION_FAILED` (the
track came, but attaching or renegotiating it over
`peer/WebRtcPeerConnection.js` failed). Neither one closes, or even
touches, `peer/PeerConnection.js` — the SAME boundary 0.2.73's own "Voice
Lifecycle Is Independent Of Peer Lifecycle" already drew, sharpened one
level further: a voice failure is now precise about WHICH of voice's own
two failure-prone steps (acquire locally, then negotiate remotely) is
actually responsible, without ever widening what either failure is allowed
to do to the connection carrying it. `tests/VoiceCallReliability.test.js`
proves both directly — a denied microphone and a synthetically failed
`renegotiate()` each report their own precise reason while the underlying
peer connection, and an ordinary chat message riding the SAME connection
immediately afterward, both stay completely unaffected.

### Device Selection Is Local State, Not Peer Protocol State (0.2.75)

`application/VoiceUseCase.js#setMuted()`'s own 0.2.73 precedent — a
local `MediaStreamTrack#enabled` flip, never transmitted, never folded
into `core/VoiceCallSignal.js` or `core/VoiceMediaSignal.js` — extends
unchanged to `setInputDevice()`. The peer hears whichever microphone this
device happens to be using and has no more business knowing WHICH one
than it does knowing whether silence on the line means "muted" or "the
room is quiet." `tests/VoiceUXAndDeviceControls.test.js`'s own flagship
proves this by sniffing the raw messages the OTHER side's connection
actually receives during both a mute and a live mid-call device switch:
zero additional messages either time — not merely "VoiceUseCase's public
surface never mentions the wire," but the wire itself, observed directly.

### A Live Device Switch Reuses RTCRtpSender#replaceTrack(), Never A Second Renegotiation (0.2.75)

`peer/WebRtcPeerConnection.js#addAudioTrack()`'s own 0.2.73 header named
this precedent before this milestone existed to use it: "a caller that
wants to swap tracks... uses the returned RTCRtpSender's own
`replaceTrack()`, not a second `addAudioTrack()`." `replaceAudioTrack()`
changes only WHICH `MediaStreamTrack` feeds an already-negotiated
`m=audio` section — never its presence, direction, or codec negotiation —
so no SDP offer/answer round trip is needed, and
`application/VoiceUseCase.js` never has to ask "am I the offerer" the way
`renegotiate()`/`applyRemoteOffer()` must. `core/VoiceSessionState.js`
never leaves ACTIVE for the duration of a switch: a device change is
invisible to the call state machine by construction, not by convention —
there is no `SWITCHING` state to forget to handle, because nothing about
the call's own lifecycle is actually in flux while it happens.

### A Local Media Problem Never Ends A Call By Itself (0.2.75)

0.2.74 already drew this line at the moment a call STARTS — a denied
microphone or a failed renegotiation each get their own honest
`VoiceCallEndReason`, but neither ever touches `peer/PeerConnection.js`.
0.2.75 extends the identical restraint to a device disappearing MID-CALL:
`application/VoiceUseCase.js#_handleLocalTrackEnded()` reacts to a real
`MediaStreamTrack`'s own `ended` event (the browser's own signal that the
underlying device is gone — never something a script's own `stop()` call
fires, a real distinction `tests/VoiceUXAndDeviceControls.test.js` has to
work around by dispatching the event directly, since a synthetic
Web-Audio track has no real hardware to lose) with exactly one automatic
fallback attempt to the platform default. If THAT also fails, the call is
left exactly as it was — still whatever `VoiceSessionState` it already
was, `peer/PeerConnection.js` still `AUTHENTICATED` — and
`onMicrophoneUnavailable()` fires as a purely informational signal, never
a `VoiceCallEndReason`, because nothing here decided the call was over.
Only an explicit hang up, block, unfriend, or peer disconnect — the SAME
closed set 0.2.74 already established — ever actually ends a call; a
local device going away was deliberately left off that list.

### Output Device Selection Never Enters VoiceSession (0.2.75)

Choosing which SPEAKER plays the remote party's audio is a fact about
this device's own audio hardware, never about the call. Once
`application/VoiceUseCase.js#getRemoteStream()` hands a UI its
`MediaStream` — unchanged since 0.2.73 — routing that stream to a chosen
output device is entirely a UI/platform concern: `ui/views/ChatView.js`
calls the bound `<audio>` element's own `setSinkId()` directly and
`application/VoiceUseCase.js` never even learns an output device was
chosen, let alone which one. Adding a `setOutputDevice()` to
`VoiceUseCase` would repeat the exact mistake `core/AvatarPresence.js`'s
own boundary already warns against elsewhere in this document — a
capability answering a question a different layer already owns the
answer to. This is the one piece of 0.2.75 that adds no application-layer
code at all; the restraint IS the design.

### Terrain Is A Pure Function Of World Coordinates And A World Seed, Never Persisted State (0.2.76)

`core/TerrainHeightField.js#terrainHeightAt(seed, x, z)` calls neither
`Math.random()` nor `Date.now()`, reads no module-level mutable state,
and touches no storage — its output depends on nothing but its own three
arguments. That single property is what lets 0.2.76 promise "the ground
never runs out no matter how far you roam" without a database of sampled
heights growing behind it: `Terrain = f(seed, x, z)`, computed fresh
every time a tile is built, never `Terrain = lookup(x, z)` against
anything written down. Two replicas, or the same replica revisiting a
position after roaming thousands of units away, compute the byte-
identical elevation at the byte-identical coordinate, because both are
evaluating the same closed-form function of the same public
`DEFAULT_WORLD_SEED` constant — proven directly in
`tests/WorldGroundTerrain.test.js`'s own flagship, which recomputes a
fixed coordinate's height independently before and after an entire
scripted journey across the world and asserts the two values are
identical. `DEFAULT_WORLD_SEED` is deliberately ONE hardcoded constant
shared by the whole live World View today, not a field on `core/World.js`
or `core/Document.js` — see docs/Architecture.md, 0.2.76, for why a
per-World seed would be a real schema change this milestone didn't reach
for, and why one shared constant already satisfies the invariant this
milestone actually needed.

### Terrain Elevation Is A Rendering-Time Offset, Never A Presence Or Placement Fact (0.2.76)

A building's `core/WorldPlacement.js` position and an avatar's
`core/AvatarPresence.js#position` both mean exactly what they meant
before 0.2.76 — ground level is `y = 0`, plus whatever the domain layer
itself adds (a jump's transient offset, a document's own layout Y). This
milestone never touches either. Instead, `renderer/WorldRenderer.js` and
`application/RenderWorldViewUseCase.js` each add
`renderer.terrainHeightAt(x, z)` to a mesh's/visual's Y position at the
moment it is actually drawn — after every domain computation has already
happened, immediately before the result reaches Three.js — and the
addition is never written back anywhere a domain object could observe
it. This is the same "renderer combines inputs it never modifies"
discipline `docs/Principles.md`'s own "An Avatar's Location Comes From
Presence, Never From The Avatar Itself" already established for 0.2.35's
avatar rendering, extended to a second input (terrain) instead of just
one (presence): `AvatarVisual.setPose()` receives a position that has
already been terrain-adjusted by its CALLER, and has no idea terrain
exists at all. One consequence worth naming directly:
`core/AvatarCollision.js`, `core/AvatarMovementSimulation.js`, and
`renderer/PickingService.js#pickGroundPosition()` all still reason about
a flat `y = 0` ground plane, completely unaware that the world now
visually undulates beneath it — collision, movement, and brick placement
are a deliberately separate, unstarted question (see docs/Roadmap.md,
0.2.76's own "Deliberately not in 0.2.76"), and conflating "where
something visually sits" with "where physics/picking says it is" would
have quietly turned a rendering milestone into a physics one.

### The Terrain Height Field Is The Shared Authority; The Renderer Is An Adapter, Not The Owner (0.2.77)

0.2.76 gave `renderer/Renderer.js` a `terrainHeightAt(x, z)` method, and
every 0.2.76 caller (building/avatar rendering) reached it through the
renderer because rendering was the only consumer that existed yet. That
was always a thin pass-through to `core/TerrainHeightField.js`'s own pure
`terrainHeightAt(seed, x, z)` — never a second, renderer-owned
computation — but with only one consumer, the distinction between "the
renderer happens to be how you reach terrain" and "the renderer IS
terrain" was never tested. 0.2.77 tests it: `application/
AvatarTerrainConstraint.js` needs the exact same elevation function for
movement, and it imports `core/TerrainHeightField.js` directly, never
`renderer.terrainHeightAt()` — proving the pure function was always the
real shared authority, and the renderer was always just its first
adapter. This is why `AvatarTerrainConstraint` has no Three.js dependency
and no Renderer collaborator at all: a movement constraint that could
only be evaluated by asking a WebGL renderer "what is the ground here"
would have quietly made rendering a prerequisite for movement, exactly
backwards from how every other domain computation in this codebase stays
independent of how (or whether) it is ever drawn. Any FUTURE consumer —
physics, AI pathing, a minimap, a server-side simulation with no renderer
at all — reaches the same one function the same way, never through
whatever happens to be drawing pixels this millisecond.

### Terrain Walkability Is A Movement Constraint, Never A Physics Slope (0.2.77)

`core/TerrainWalkability.js#isWalkableSlope()` answers exactly one
question — is this candidate horizontal step's slope within a walkable
limit — and nothing else. There is no sliding along a rejected slope, no
downhill acceleration, no force, no momentum carried from one tick to the
next because of terrain. A blocked step is simply not taken; the avatar
stays exactly where it already stood (Y still passes through from the
kinematic result, so a jump or fall already in progress is never
cancelled by a horizontal rejection — see `application/
AvatarTerrainConstraint.js#apply()`'s own header). This mirrors
`docs/Principles.md`'s own "Movement Is Kinematic, Not Physically
Simulated (0.2.36)" and extends 0.2.42's "Collision Is A Constraint
Applied To Movement, Never Part Of The Movement Simulation Itself" one
step further: where 0.2.42 constrains movement against discrete obstacle
geometry (bricks), 0.2.77 constrains it against a continuous height
field, using the identical shape — a pure `{ position, blocked }` result
consulted by `application/AvatarMovementController.js` exactly the way
`{ position, collided }` already was, applied second, on top of whatever
building collision already resolved. Deliberately NOT attempted: physical
sliding along a slope's contour, downhill momentum, terrain deformation,
or any other physics-engine concept the design doc explicitly ruled out —
see docs/Roadmap.md, 0.2.77's own "Deliberately not in 0.2.77."

### Terrain Requires No Streaming Concept; Collision Does (0.2.77)

`application/AvatarMovementConstraint.js` (0.2.42) exists largely to
answer "which obstacles are currently loaded near the avatar" — a real
question, because brick geometry only exists in a replica's memory once
some document has actually streamed in. `application/
AvatarTerrainConstraint.js` (0.2.77) has no equivalent question to
answer: `core/TerrainHeightField.js#terrainHeightAt(seed, x, z)` is a
pure function of its own arguments, computable for ANY coordinate whether
or not anything is "loaded" there at all — see `core/
TerrainHeightField.js`'s own header. This is why `AvatarTerrainConstraint`
takes no `loadedDocuments`, no `getWorldPosition`, and no query radius: it
needs nothing from `WorldNavigationSession`'s own streaming state, and
`WorldNavigationSession._buildAvatarTerrainConstraint()` builds one
unconditionally, with zero session-specific wiring, unlike its
`_buildAvatarMovementConstraint()` neighbor. A local avatar's terrain
walkability is therefore never bounded by "what this replica happened to
stream in" the way its building collision explicitly is (see "The Local
Avatar Is Constrained By Collision Geometry Currently Available To This
Replica, Never By The Entire World," 0.2.42) — terrain is everywhere,
always, by construction.

### Identity Authentication Proves A Key; Device Authorization Proves Permission (0.2.78)

`peer/PeerAuthenticationSession.js`'s handshake has answered exactly one
question since 0.2.49 — "who is holding this key, right now, on this
connection" — and 0.2.78 changes nothing about it: not one line under
`peer/` was touched. A device authorization
(`core/DeviceAuthorizationEnvelope.js`, `identity/
LocalIdentityProvider.js#authorizeDevice()`) answers a completely
different, narrower question layered strictly on top: "did some OTHER
identity give this key permission to act on its behalf." A connection
that authenticates successfully has proven possession of a key and
nothing more — it has proven nothing whatsoever about permission, which
is why `application/DeviceAuthorizationPropagationUseCase.js#resolvePeerAuthority()`
is a separate, independent query, never a side effect of reaching
`PeerLifecycleState.AUTHENTICATED`. Conflating the two would mean any two
people who happen to both be online could, by definition, act for each
other — the exact "one identity = one connection" shortcut docs/Roadmap.md
named as a danger from 0.2.67 onward. See `tests/MultiDeviceIdentity.test.js`'s
SECURITY FLAGSHIP B: a revoked device authenticates exactly as
successfully as it always could (its key is untouched) while its
authorization to act for the parent identity is independently, and
completely separately, gone.

### A Device Authorization Grant Is Signed By The Parent, Never Counter-Signed By The Device (0.2.78)

The same asymmetry `core/IdentitySuccessionEnvelope.js` already
established for successor declarations, extended here on purpose:
`identity/LocalIdentityProvider.js#authorizeDevice()` signs with the
PARENT identity's own key only. The device being authorized never
counter-signs the grant, because it never needs to — a device proves its
own key possession the ordinary way, live, the moment it actually
connects to someone, exactly like any other identity always has (see
"Identity Authentication Proves A Key; Device Authorization Proves
Permission," above). A grant is therefore meaningful the instant the
parent produces it, even for a device that doesn't exist yet or hasn't
finished being set up — the identical property `declareSuccessor()`
already relies on ("Alice can name a successor she generated on a
brand-new device she hasn't even finished setting up yet, as long as she
already knows its public identity").

### Device Authorization Can Be Re-Granted; Identity Revocation Cannot (0.2.78)

`identity/IdentityRevocationEnvelope.js`'s own revocation is a permanent,
one-way latch — once REVOKED, an identity stays REVOKED forever, and
`docs/Principles.md`'s own "Revocation Is Permanent, Never A State A
Later Event Reverses" is exactly why: an identity that could be
"un-revoked" would make revocation meaningless as a security signal. A
device authorization is a different kind of fact, and 0.2.78 deliberately
does NOT reuse that same permanent latch: `core/DeviceAuthority.js#isAuthorized`
is a plain timestamp comparison between the most recent grant and the
most recent revocation this device has independently verified, so a
strictly newer grant re-authorizes a device previously revoked. Losing a
device (a phone is stolen, then recovered; a laptop is reformatted and
re-set-up) is an ordinary, recoverable event for the PARENT identity,
never the identity's own compromise — collapsing the two into one
permanent latch would force Alice to rotate her entire identity every
time she merely wanted to take a device back off her authorized list and
later put it back on.

### A Connection Represents An Identity Either Directly Or Through One Verified Device Authorization, Never By Assumption (0.2.78)

`application/DeviceAuthorizationPropagationUseCase.js#resolvePeerAuthority()`
gives an explicit, two-mode answer — deliberately reusing `identity/
DelegationVerifier.js`'s own DIRECT/DELEGATED vocabulary as an
architectural shape, though never its code path (that class answers a
completely different question, publication ownership delegation): DIRECT
means the live connection's own proven key IS `identityId`, exactly as
every peer connection has represented an identity since 0.2.49; DEVICE
means the connection's proven key is a DIFFERENT key that this device has
independently verified `identityId` authorized, and that authorization
has not since been superseded by a newer revocation. There is
deliberately no third, implicit mode — a connection that is neither is
simply `{ authorized: false, mode: null }`, never defaulted to
"probably fine." See `tests/MultiDeviceIdentity.test.js`'s SECURITY
FLAGSHIP A: Charlie's connection is completely genuine (he really does
hold his own key) and still resolves as unauthorized to represent Alice,
because genuine authentication of A key was never, by itself, evidence of
permission to act for a DIFFERENT one.

### Device Authorization Changes Peer Authority, Never Social Identity (0.2.82)

Recorded as 0.2.82 — see docs/Roadmap.md, 0.2.82, "Numbering note."

0.2.78 proved `resolvePeerAuthority()` correct but consulted it nowhere.
0.2.82 wires it into `application/FriendRelationshipUseCase.js`/
`application/ChatUseCase.js`/`application/VoiceUseCase.js` under one
governing rule, stated in the design doc that opened this milestone: when
Alice's Phone and Alice's Laptop are two independently authorized devices
of one parent identity, a friendship formed over EITHER of them is the
SAME friendship, a conversation with EITHER of them is the SAME
conversation, and a block or unfriend on the PARENT identity reaches both
at once. Authorizing or revoking a device changes which connections are
recognized as speaking for a social identity — it never creates, splits,
or duplicates the social relationship itself. See
`tests/MultiDeviceSocialSemantics.test.js`'s own flagship: Bob's Laptop
connection is recognized as an authorized device of an already-FRIEND
identity without the Laptop ever sending its own friend request — proving
directly that "we should NOT create Alice Laptop <-> Bob = friendship
#2."

### Resolution Happens Strictly After Authentication, And Only On the Wire's Receiving Half (0.2.82)

Two disciplines, both load-bearing, both discovered the hard way by this
milestone's own flagship test failing until they were made explicit.
First: every existing authentication check — a claimed `actorIdentity`,
`senderIdentity`, or `callerIdentity` matching the live connection's own
proven key — is completely UNCHANGED by this milestone; social-identity
resolution (`resolveConnectionIdentity()`) is consulted only AFTER that
proof already holds, one layer higher, exactly mirroring 0.2.78's own
"authentication proves a key; authorization proves permission" split.
Second, and easier to get wrong: a SIGNED WIRE CLAIM addressed to a
specific connection — a friendship advertisement's `subjectIdentity`, a
chat message's `conversationId` derivation, an INVITE's `calleeIdentity`
— must stay addressed to the RAW, literally-authenticated key on BOTH
ends, never the resolved identity, because the RECEIVING device checks
that claim against its OWN unresolved local identity (a device is never
taught to resolve itself — see below), and would otherwise silently
reject a genuine, correctly-routed message as addressed to someone else.
Only business-state KEYING — which `FriendshipRecord`, which
`LiveConversation`, which call record a fact belongs to — resolves;
everything that travels on the wire or gets checked against "am I the
one this is for" stays raw.

### A Device Is Never Taught To Resolve Itself, Except Reflexively Against Itself (0.2.82; narrowed 0.2.83)

`resolveConnectionIdentity()` only ever answers "who is on the OTHER end
of this connection, socially?" — using THIS device's own independently
verified `DeviceAuthority` records about that OTHER party. No code path
in this milestone asks a device "which parent identity authorized YOU?" —
sidestepping entirely the much harder question of how a device would
even come to trust an answer to that about itself. This is precisely why
`application/ChatUseCase.js`'s own conversation bucketing can resolve the
PEER side while the wire-level `conversationId` keeps using this device's
own `myIdentityId` completely unresolved: a conversation still belongs to
one local device holding one identity's key on the SENDING side, exactly
as every milestone from 0.2.69 through 0.2.78 already established — this
milestone changes how a RECEIVER interprets an incoming connection's
authority, never how a device signs, addresses, or reasons about its own
outgoing traffic. Synchronizing what Alice's OWN several devices know
about each other — and about each other's conversations — is real,
substantial, and deliberately left to a later milestone (see
docs/Roadmap.md, 0.2.82, "Proposed, unscheduled follow-on milestones").

0.2.83 answers that later-milestone question, but keeps this principle's
OWN spirit intact rather than overturning it: `resolveOwnSocialIdentity()`
is not a device asking a THIRD PARTY "who am I" (still nowhere in this
codebase) — it is a device consulting its OWN already-adopted, already-
signed grant record, the identical durable evidence
`resolveConnectionIdentity()` already trusts when the SAME fact is about
someone else. Nothing here lets a device assert an identity for itself
that it cannot produce a signed grant for; the reflexive query is exactly
as evidence-gated as the other-directed one, applied to one more
`(identityId, deviceIdentityId)` pair than before.

### Terrain Surface Color Is A Function Of World Coordinates, Never Tile Coordinates (0.2.79)

`core/TerrainSurface.js#surfaceColorAt(seed, x, z)` has no idea a tile
grid exists at all — the same discipline `core/TerrainHeightField.js#
terrainHeightAt(seed, x, z)` already established for elevation in 0.2.76,
extended to color. This is what makes two neighboring
`renderer/TerrainStreamingController.js` tiles — streamed in
independently, on whatever frame the camera happened to approach them —
agree exactly at their shared edge without any coordination between them:
both sample `surfaceColorAt()` at the identical world `(x, z)`, so both
get the identical answer, proven directly in
`tests/TerrainSurfaceColor.test.js` at the exact vertex resolution
`renderer/TerrainTileMesh.js` samples at, for every segment count tested.
A function of `(tileX, tileZ)` instead would have let two adjacent tiles
land on different sides of a classification threshold and disagree at
their shared edge, exposing the streaming grid as a visible checkerboard
exactly where 0.2.76 worked hardest to make the ground continuous. The
low-frequency brightness variation layered on top follows the identical
rule for the identical reason: it is sampled from `surfaceColorAt()`'s own
continuous world-coordinate noise lattice, never from anything keyed by
which tile a vertex happens to belong to.

### Terrain Surface Color Is Deliberately Restrained; Buildings And Avatars Are The Visual Focus (0.2.79)

`core/TerrainSurface.js#SURFACE_PALETTE` is low-saturation and mid-value
by deliberate choice — a soft pale green, a muted warm brown, a light
neutral gray, a soft blue — never the saturated "game grass"/"game water"
tones a more decorative terrain system might reach for. Terrain's job in
World View is background, context, depth, and geography; a building's or
an avatar's own materials are the actual visual focus, and a loudly
saturated ground would compete with them for attention rather than
support it. This same restraint governs every other visual choice this
milestone makes: the low-frequency brightness variation
`core/TerrainSurface.js#variationAt()` applies is a single shared
lightness offset across all three color channels, never an independent
per-channel one, so terrain reads as "the same grass, gently lit
differently" rather than a dithered checkerboard that exposes the
underlying noise function; and "higher terrain -> lighter vegetation tone"
is a continuous blend within the existing GRASS category, never a new,
more elaborate `SURFACE_CATEGORY` that would over-model one color nuance
as if it were a distinct kind of ground. WATER/SOIL/ROCK/GRASS are visual
surface-color categories only — a WATER-classified coordinate looks like a
lake; it is not one, and nothing in this milestone simulates water,
vegetation, or geology (see docs/Roadmap.md, 0.2.79's own "Deliberately
not in 0.2.79").

### A Brick Is A Primitive, Never A Preassembled Structure (0.2.80)

`core/BrickDefinition.js` describes a small reusable geometric building
block — a shape, a bounding box, a category, a description — and nothing
in 0.2.80's eleven new definitions is allowed to describe more than that.
`core:wall_1x3` is a wall SEGMENT, not a "House Wall"; `core:roof_hip` is
a roof CAP, not a "Cottage Roof"; `core:arch` is an archway BLOCK, not a
"Gate" or a "Bridge." The moment a brick definition starts encoding a
specific building's identity rather than a general shape, the primitive
vocabulary stops being reusable and starts being an ever-growing catalog
of one-off nouns — `HOUSE_BRICK`, `BARN_BRICK`, `BRIDGE_BRICK` — that
would need to keep expanding forever to cover every conceivable
structure, instead of composing a fixed, small vocabulary into an
unbounded number of them. The intended ladder stays exactly
`Brick -> Building -> Structure`; nothing in this milestone lets a brick
skip a rung of it. A future forkable structure library composes bricks
into buildings and buildings into structures — it does not need, and must
never be given, brick definitions that have already done a structure's
job for it.

### A Brick's Bounding Box Is An Approximation Contract, Not A Shape Description (0.2.80)

`BrickDefinition#width/height/depth` was already an axis-aligned bounding
box before 0.2.80 — `core/AvatarCollision.js` and
`application/SelectionBoundsService.js` both read it that way from the
moment each was written — but every brick using it was symmetric enough
(a cube, a slope, a plate, a window pane) that the gap between "true
shape" and "bounding box" was never visually exercised. 0.2.80's
`core:stair`, `core:arch`, `core:roof_hip`, and `core:column` are all
genuinely non-box meshes, and every one of them still collides and
selects as its own rectangular bounding box — an avatar can stand "inside"
the empty space under a stair's own overhang, or "inside" an arch's own
open passage, and still be treated as colliding with the brick, exactly
the same restraint `core/AvatarCollision.js`'s own 0.2.42 header already
named as deliberate ("a box is a good enough capsule"), now extended to
built geometry instead of only avatars. This was a conscious choice, not
an oversight discovered too late to fix: a `BrickDefinition`'s
width/height/depth is a contract about placement and collision space, not
a promise that the rendered mesh fills every corner of it.

### A Mesh Factory's Own Orientation Belongs On The Geometry, Never On mesh.rotation (0.2.80)

`renderer/BrickRenderer.js#createMesh()` has, since 0.1.5, unconditionally
SET `mesh.rotation.y` from the brick's own placement rotation on every
call — never added to whatever a factory left there. That was invisible
as a rule until `core:roof_hip` needed a fixed 45° orientation to align a
four-segment `ConeGeometry`'s naturally diamond-shaped footprint with a
rectangular brick's own bounding box. The correct place for that fixed
orientation is `geometry.rotateY(Math.PI / 4)`, called once inside the
factory, baked permanently into the geometry's own vertices — never
`mesh.rotation.y`, which `BrickRenderer` will overwrite the instant the
brick is actually placed and rendered with its own, entirely independent
placement rotation. A factory that mixed the two would work by accident
in isolation (e.g. a unit test calling the factory directly) and silently
break the moment the same mesh reached `BrickRenderer` — the kind of bug
that is invisible until the exact two code paths that never talk to each
other both run, which is precisely why the rule is named here rather than
left to be rediscovered.

### A Structure Is The Next Rung On The Brick Ladder, Not An Escape From It (0.2.81)

0.2.80 named the ladder explicitly: `Brick -> Building -> Structure`,
and warned that a future forkable structure library "does not need, and
must never be given, brick definitions that have already done a
structure's job for it." 0.2.81 is that future milestone, and the
warning held: `core/Structure.js` is `{ id, name, category, tags,
description, bricks }`, where `bricks` is a flat array of nothing but
ordinary `core/Brick.js` instances referencing ordinary, already-
registered `core:*` definitionIds. `village:house` is not a `HOUSE`
brick wearing a Structure's clothing — it is `wall_1x3` × 15 + `door` ×
1 + `window_large` × 1 + `window_small` × 2 + `slab_4x4` × 1 +
`roof_hip` × 4 + `stair` × 1 + `cube` × 1, exactly the way an actual
building would be assembled brick by brick in the editor. Nothing about
`Structure` is privileged: it cannot be placed directly into a World,
rendered directly, or referenced by a `Brick`'s own `definitionId` — the
only thing you can ever do with a Structure is fork it into a `Document`,
at which point it stops being a Structure at all and becomes the same
kind of thing every other editable document already is. A Structure is
where composition ends and a Building's own bricks are handed to
`ForkStructureUseCase`; it is never a shortcut past composition.

### Forking A Structure Records Provenance, Never A Live Dependency (0.2.81)

`document.metadata.parentStructureId` (set once, by
`ForkStructureUseCase`, at the moment a fork is created) answers "what
Structure did this Document start as" — a historical fact, recorded the
same way `parentDocumentId` already records "what Document was this
cloned from." Neither field is ever consulted again after the fork is
created: editing a fork never reads from the Structure it came from,
saving a fork never writes back to it, and reloading a fork never
re-resolves it against the library's current state. This is enforced
structurally, not by convention — `ForkStructureUseCase` places a BRAND
NEW `Brick` instance for every one of the source Structure's bricks
(same `definitionId`/`position`/`rotation`, a freshly minted `id`), so
the library's own `Brick` objects are never handed to, or reachable
from, the fork's own `Building`. Forking the SAME Structure again,
after an earlier fork has been edited beyond recognition, always
reproduces the Structure's ORIGINAL, pristine content — proven directly
in `tests/ForkableStructureLibrary.test.js`'s flagship, not merely
assumed from the absence of a wired-up mutation path. This is the
Structure-scale instance of the same discipline `docs/Principles.md`'s
"A published snapshot is never mutated in place" (0.2.20) already
established for published Worlds, and deliberately rules out template
INHERITANCE of any kind: there is no `Village House -> inherits ->
Alice House -> inherits -> Alice House v2` chain where editing an
ancestor could ever ripple into a descendant. Every fork's parent is a
label, not a relationship a later mutation could ever traverse.

### Conversation Synchronization Is A Protocol Between A Device And Itself, Never A Wider Chat Feature (0.2.83)

`application/DeviceConversationSyncUseCase.js` runs strictly ALONGSIDE
`application/ChatUseCase.js`'s own `forkbuild:chat` protocol, on its own
namespaced wire channel, never folded into it. Bob's own `ChatUseCase`
never subscribes to `forkbuild:device-conversation-sync` at all — the
protocol only ever runs between two connections that BOTH resolve to the
SAME identity (see "Sibling Eligibility Is A Symmetric Identity
Comparison," below). Nothing this protocol does ever produces a
`core/ChatDeliveryAck.js` or a `core/ChatReadReceipt.js` on the wire:
those remain exactly what 0.2.63/0.2.71 built them to be, an
acknowledgement between this device and the PEER who actually sent
something, never between this device and one of its own siblings. A
message a sibling already held converges through the SAME idempotent
`application/ConversationStore.js#append()` every ordinary received
message already goes through — sync introduces no second notion of
"accepted."

### Sibling Eligibility Is A Symmetric Identity Comparison, Never A Device Allowlist (0.2.83)

Whether two connected devices may exchange conversation state is decided
by one comparison, re-derived fresh on every connection and every
incoming envelope, never cached and never stored as its own fact:
`resolveConnectionIdentity(peer).identityId === resolveOwnSocialIdentity().identityId`.
No list of "known sibling device IDs" exists anywhere in this codebase —
eligibility is computed, every time, from the same
`core/DeviceAuthority.js` records `application/DeviceAuthorizationPropagationUseCase.js`
already independently verifies for every other purpose. This is what
makes revocation isolation free rather than a second mechanism to build
and keep correct: a revoked device's resolution simply stops matching,
on both the revoking device (which now also self-applies its own
authored fact immediately — see below) and the revoked one, the instant
either has learned of it, through the completely unmodified 0.2.78/0.2.82
gossip path.

### A Device That Authors A Grant Never Waits For Its Own Broadcast To Come Back To Believe It (0.2.83)

Before this milestone, `broadcastAuthorization()`/`broadcastRevocation()`
only ever pushed a record OUTWARD — the authoring device's own
`DeviceAuthority` list never reflected a fact it had itself just
produced, because nothing fed its own gossip subscription from its own
outgoing send. That was harmless while `resolvePeerAuthority()`/
`resolveConnectionIdentity()` were only ever consulted about OTHER
devices by THIRD parties (0.2.78/0.2.82's own tests never needed the
author to evaluate its own authored fact). This milestone's own sibling-
eligibility check does need exactly that, so both methods now ALSO
self-apply their record to the author's own local view, in the same
call — never re-verified (the identityProvider that just produced the
signature has no reason to doubt it), only freshness-compared and stored
through the identical `_applyGrant`/`_applyRevocation` tail the gossip
path itself uses.

### Per-Device Local Read State And Identity-Observed Read State Are Never The Same Fact (0.2.83)

`application/ConversationReadTracker.js` (0.2.70) answers "what has THIS
device's owner actually looked at, on THIS screen" and stays completely
unmodified by this milestone — a sibling's report is never written into
it. `application/SiblingReadStateStore.js` (new) answers a genuinely
different, third-party question: "what has one of my OTHER devices told
me about ITS OWN read position." `DeviceConversationSyncUseCase#getIdentityObservedReadSequence()`
is the one place these two are ever combined, and even there only by
taking `Math.max()` of two independently-read values on every call —
never by writing one into the other, and never as a stored fourth fact
competing with either for authority. Laptop reading a message never
moves Phone's own local marker; what moves is only what Phone's derived,
identity-level VIEW reports, and only because Laptop told it so.
### Identity Presence Is An Aggregate Of Authorized Device Observations, Never A Fourth Store (0.2.85)

`application/PeerPresenceUseCase.js` already treated `isConnectedNow` as
computed, never stored (0.2.70's own "A Peer Presence Summary
Reconciles Independent Lifetimes; It Is Never A Fourth Store"). 0.2.85
extends that same discipline across MULTIPLE simultaneously-live
connections instead of one: `_liveConnectedPeers(identityId)` is a
`.filter()`, never a `.find()`, over every currently-AUTHENTICATED
`ConnectedPeer` whose RESOLVED social identity (`resolveConnectionIdentity()`,
0.2.79) matches. "Alice is online" is true iff that list is non-empty —
an aggregate over however many of her authorized devices this local
device currently observes as reachable, recomputed fresh on every call,
never cached as a single boolean that could drift. Three genuinely
different questions stay genuinely different: Connection Presence (one
`ConnectedPeer`'s own `getLifecycleState()`), Device Presence (one live
connection resolved to one specific authorized device), and Identity
Presence (at least one live, authorized device of the whole identity) —
collapsing any two of these into one is exactly the mistake this
principle exists to name. A stale disconnect on one of several live
connections therefore never flips presence by itself — only the LAST
one does — and a revoked device's connection stops contributing to its
PARENT's presence the instant `resolveConnectionIdentity()` itself stops
recognizing it (the connection stays genuinely authenticated throughout;
only which identity it counts toward changes), with no separate
revocation check anywhere in this class. Deliberately NOT gossiped or
synchronized between Alice's own devices — each observer (Bob, or any
other peer) derives what it currently knows entirely from its own live
connections, exactly as `docs/Principles.md`'s own "Discovery Finds A
Candidate; It Never Authenticates One" already keeps observation and
authority as separate axes one layer down. And deliberately NOT reused
for delivery-target selection: `application/ChatUseCase.js#_findAuthenticatedPeer()`
still picks exactly one device to send to (a `.find()`, unchanged) —
presence aggregation answers "is anyone home," never "which one do I
talk to," and the two stay two different questions on purpose.

### Ecology Is A Third Pure Function Layered On Terrain, Never A New Ground Truth (0.2.88)

`core/TerrainEcology.js#ecologyZoneAt(seed, x, z)` does not invent a
second opinion about the world's geography — it CONSULTS
`core/TerrainSurface.js#surfaceCategoryAt()` (itself already a function
of `core/TerrainHeightField.js#terrainHeightAt()`) and layers two more
independent, low-frequency noise fields on top. This is the same
"second pure function of the identical (seed, x, z) triple" discipline
`core/TerrainSurface.js`'s own header established relative to
`core/TerrainHeightField.js` in 0.2.79, now extended one layer further:
`TerrainHeightField` answers "how high," `TerrainSurface` answers "what
does it look like," `TerrainEcology` answers "what kind of environment is
this." Every zone boundary therefore correlates with the terrain
underneath by construction rather than by convention — WATER and ROCK
zones mirror `surfaceCategoryAt()` exactly, HIGHLAND shares the identical
`HIGHLAND_ELEVATION` threshold `surfaceColorAt()` already tints GRASS
lighter at (imported, never re-derived), and BEACH is a narrow band
against the same `WATER_LEVEL`. A world where the ecology map looked like
it was painted independently of the terrain map — a forest floating over
a lake, a beach on a cliff — would mean this principle had been violated;
`tests/TerrainEcology.test.js`'s own Section B exists specifically to
catch that class of bug by scanning hundreds of coordinates and asserting
the correlation holds everywhere, not merely at a few hand-picked spots.

### Natural Features Are Sampled, Never Stored (0.2.88)

`core/NaturalFeatureField.js#naturalFeaturesInRegion(seed, minX, minZ,
maxX, maxZ)` has no equivalent of a `TreeRecord` anywhere in this
codebase, and never will while this principle holds: every tree it
returns is recomputed from a fixed, jittered lattice keyed on nothing but
`(seed, x, z)`, the same "content-addressed by geography" posture
`core/TerrainHeightField.js`'s own header established for elevation in
0.2.76 — `Terrain = f(seed, x, z)`, never `Terrain = lookup(x, z)` —
applied here to WHAT grows somewhere instead of how high it stands. This
is what makes a forest safe to stream in and out thousands of times
across a session without ever writing a single byte: two replicas, or
the same replica returning to a position after roaming thousands of
units away, recompute the byte-identical tree at the byte-identical
position, because both are pure functions of their own arguments and
nothing else. It is also the structural reason a generated tree can never
accidentally become a `Document` -> `Brick` the way a user's house is:
there is no persistence layer a tree could be promoted into even by
accident, because `naturalFeaturesInRegion()` never writes anywhere in
the first place. `tests/NaturalFeatureField.test.js`'s own FLAGSHIP
proves this directly — a ring of tiles streamed in ascending order and
the identical ring streamed in descending order discover byte-identical
trees, because tile LOAD ORDER was never an input to the computation to
begin with.

### Tree Density Is Independent Of The Zone That Gates It, So Cover Fades Instead Of Stopping (0.2.88)

`core/NaturalFeatureField.js#forestDensityAt()` is deliberately its OWN
noise field, decorrelated from `core/TerrainEcology.js#moistureAt()` —
the field that decided whether a coordinate is FOREST or GRASSLAND in
the first place. If tree placement simply reused moisture directly, the
zone boundary and the tree-density boundary would be the same line
twice: a forest would stop exactly where the FOREST zone stops, a hard
edge no amount of jitter could soften. Instead, `naturalFeaturesInRegion()`
thresholds `forestDensityAt()` PERMISSIVELY inside FOREST (most
qualifying lattice cells host a tree — dense cover) and RESTRICTIVELY
inside GRASSLAND (only the density field's own local peaks qualify —
sparse, scattered fringe trees), against a zone boundary that itself
stays a hard line. The visible result is a forest that thins into
scattered trees before giving way to open grassland, rather than a wall
of trees ending in a straight edge — proven directly in
`tests/NaturalFeatureField.test.js`'s own Section C, which asserts
FOREST's tree rate exceeds GRASSLAND's by more than double over the same
wide scan, and that GRASSLAND's rate is nonzero rather than a hard
cutoff.

### Hydrology Is A Fourth Pure Function Layered On Terrain, Sibling To Ecology, Never A New Ground Truth (0.2.89)

`core/Hydrology.js` answers "where does water actually collect and
flow," a genuinely different question from `core/TerrainEcology.js`'s
"what kind of natural environment is this" — and, like `TerrainEcology`,
it does not invent a second opinion about the world's geography to
answer it. It CONSULTS `core/TerrainSurface.js#surfaceCategoryAt()`
directly (LAKE mirrors `SURFACE_CATEGORY.WATER` exactly) and layers its
own independent, low-frequency noise field on top for RIVER, the same
"second/third/fourth pure function of the identical `(seed, x, z)`
triple" discipline `core/TerrainSurface.js`'s own header established in
0.2.79 and `core/TerrainEcology.js`'s own header extended in 0.2.88, now
extended one layer further. The deliberate architectural choice is that
`Hydrology` is Ecology's SIBLING, not its dependent: both consult
`TerrainSurface` independently rather than `Hydrology` importing
`TerrainEcology` or vice versa, so there is no import cycle and no
ordering dependency between "what grows here" and "where does water
flow." A river coordinate is therefore guaranteed, by construction, to
sit only on the same GRASS-surface, below-`HIGHLAND_ELEVATION` ground the
flat ecology zones already occupy — a river cutting across ROCK or
appearing above `HIGHLAND_ELEVATION` would mean this principle had been
violated; `tests/Hydrology.test.js`'s own Section B exists specifically
to catch that class of bug by scanning thousands of coordinates and
asserting the correlation holds everywhere.

### A River Is A Bounded, Local Channel Field, Never A Global Drainage Simulation (0.2.89)

Real hydrological flow accumulation — how much upstream area drains
through a given point — cannot be answered as a bounded local function
of `(seed, x, z)`. Computing it exactly requires summing contributions
from an UNBOUNDED upstream area, which for a procedurally infinite world
means either persisting a drainage network somewhere (forbidden by the
same posture `core/TerrainHeightField.js`'s own header established for
elevation: `Terrain = f(seed, x, z)`, never `Terrain = lookup(x, z)`) or
an unworkable per-query cost that would fall apart the moment a
per-vertex, per-frame streaming renderer tried to call it. `core/Hydrology.js#isRiverAt()`
is therefore not an approximation of real flow accumulation that will
someday be replaced with the real thing — it is a deliberately different
KIND of function: a domain-warped noise band (the standard "fake a
winding river without simulating one" technique) gated to the same
lowland ground the flat ecology zones occupy and biased, never hard-
gated, toward locally lower cross-sections via a continuous
`valleyFactorAt()` multiplier. This is why `core/Hydrology.js` exports
`flowDirectionAt()` — a genuinely real, local, steepest-descent gradient
sample — as its OWN separate, honestly-scoped primitive, deliberately
never used to trace or accumulate a river's path: using it that way would
reintroduce the exact unbounded-cost problem this principle exists to
avoid. `tests/Hydrology.test.js`'s own Section E proves `flowDirectionAt()`
genuinely points downhill; Section B proves the channel field stays
correlated with the terrain underneath despite being a different kind of
computation, not a lesser one.

### A Lake Is Rendered Geometry; A River Is Ground Color (0.2.89)

`core/Hydrology.js` deliberately represents its two water features two
different ways, and the difference is not an oversight — it follows
directly from what each one physically is. A lake is STILL water: it
genuinely sits at one constant elevation regardless of how the lakebed
beneath it rises and falls, which only real flat geometry can express —
`renderer/WaterTileMesh.js` builds exactly that, a per-tile plane held at
`LAKE_SURFACE_HEIGHT` (`core/Hydrology.js`'s own re-export of
`WATER_LEVEL`, never a re-derived copy) wherever the ground below is
WATER, and several units beneath the actual terrain surface everywhere
else — an ordinary opaque-terrain depth test hides the sunk vertices with
zero seam-handling code, because every vertex is still placed from
nothing but its own world `(x, z)`, the same "continuous world
coordinates, never tile coordinates" discipline every sibling tile mesh
in this codebase already follows. A river is FLOWING water threaded
across sloped, varied terrain — a single flat plane could never follow
that convincingly without becoming its own small hydraulic simulation, so
it stays exactly what `core/TerrainEcology.js`'s own BEACH sand tint and
FIELD furrow tint already are: a ground-color treatment,
`core/Hydrology.js#hydrologyGroundColorAt()` layered onto
`ecologyGroundColorAt()`'s own unchanged output, needing no geometry, no
separate streaming, and no seam-handling of its own because it inherits
all three from the ground it's painted on. Reaching for one
representation everywhere ("give every water feature a mesh" or "tint
every water feature") would have meant either an oddly rigid lake that
tints instead of truly pooling, or a river rendered as a flat raft
floating disconnected from the terrain beneath it — this principle is
why the two get different treatment on purpose.

### A Structure Placement References Content, It Never Copies It (0.2.90)

`core/StructurePlacement.js` carries a `documentId`, a `position`, and a
`rotation` — nothing else. It is the same shape as `core/WorldPlacement.js`
one rung down (a lightweight spatial REFERENCE, never an owner of the
content it points at), applied to a Document placed INSIDE another
Document's own World rather than a Publication placed in shared global
space. The alternative this principle rules out — copying the referenced
Document's bricks into the placement, or into the containing World, at
the moment of placement — was rejected for exactly the reason
`WorldPlacement`'s own header already gives: it would create a second,
driftable representation of the same content, requiring synchronization
machinery (`Document` edited -> somehow propagate to every copy) that
this codebase has consistently refused to build anywhere else. Instead,
`application/StructureDocumentResolver.js` resolves a placement's
`documentId` to its CURRENT content fresh, on every call, straight from
storage — there is exactly one authoritative representation of a
structure's bricks (the Document itself) and a placement never holds a
second one. This is what makes "fork House, place it twice, edit House,
both placements reflect the edit" true by construction rather than by
a cache-invalidation strategy: there is no cache to invalidate. It also
means removing a placement (`RemoveStructurePlacementCommand`) can never
delete content, and nothing about a Document's own lifecycle needs to
know how many placements reference it, or whether any do at all — see
"A Missing Placement Target Is Absence, Not An Error," below, for what
happens when that reference can no longer be resolved.

### A Structure Placement Transforms Its Content At Render Time, Never At Rest (0.2.90)

A placed structure's bricks are never rewritten into the containing
World's own coordinate space, and a `StructurePlacement`'s
`position`/`rotation` are never baked into a second copy of its
referenced Document's `Brick` positions. `renderer/WorldRenderer.js`
composes the two — a resolved Brick's LOCAL position, rotated around the
origin by the placement's own rotation, then translated by the
placement's own position — fresh, every render, the same rendering-time-
only posture `docs/Principles.md`'s own "Terrain Elevation Is A
Rendering-Time Offset, Never A Presence Or Placement Fact" (0.2.76)
already established for ground height. "The placement transforms the
entire structure" (the 0.2.90 design conversation's own framing) is
enforced by this composition happening exactly ONCE, at the placement
level, never per-brick: every brick in a placed structure is rotated and
translated by the identical value, so the structure always arrives as
one rigid unit, upright and undeformed, regardless of what terrain or
offset the containing document itself sits on. Rotation math is shared,
not duplicated, with the gizmo/gesture system that already owns it —
`application/TransformMath.js#rotatePointAroundPivotY()` is injected into
`WorldRenderer` (mirroring how `application/RenderWorldUseCase.js`
already injects it into `TransformGizmoController`) rather than
reimplemented locally, because `renderer/` must never import
`application/` — see `RenderWorldUseCase.js`'s own header.

### A Missing Placement Target Is Absence, Not An Error (0.2.90)

ForkBuild has no Document deletion feature yet — the only way a
`StructurePlacement.documentId` can fail to resolve today is a
placement pointing at an id that was never actually saved, or storage
being cleared underneath it. Either way, `StructureDocumentResolver#resolve()`
answers `null`, never throws, and every caller treats that exactly like
"this placement currently contributes nothing" — `renderer/WorldRenderer.js`
renders no meshes for it, `application/StructurePlacementValidator.js`
treats it as contributing no collision, and nothing in the render or
collision path distinguishes "briefly unresolvable" from "permanently
gone." This mirrors `core/SpatialOverlap.js`'s own "Overlap Is A Fact;
Collision Is A Policy Decision" — a missing target is a plain
observation about the current state of storage, not a validation failure
this layer needs to react to. The placement itself is left completely
untouched: removing a `StructurePlacement`
(`RemoveStructurePlacementCommand`) is the only way to make an
unresolvable reference disappear, exactly as a dangling reference should
require an explicit removal, never a side effect of failing to resolve
it once. When a real Document-deletion feature eventually exists, it
will need its own explicit answer to "what happens to a placement that
still references the deleted id" — this graceful-null behavior is a
reasonable placeholder for that day, not a decision that day's design is
already made.

### Selecting An Instance Selects Its Spatial Reference, Never Its Content (0.2.91)

A `StructurePlacement` selection is a second KIND of selection item —
`{ type: 'structure-placement', placementId }` alongside the existing
`{ type: 'brick', brickId, buildingId }` — never a second selection
system running alongside `application/editor-state/SelectionState.js`.
This is the direct consequence of "A Structure Placement References
Content, It Never Copies It" (0.2.90) applied to selection specifically:
clicking a placed structure selects the ONE thing that is actually
editable in place — where it is — never one of its constituent bricks,
which remain reachable only by editing the referenced Document. Every
brick-shaped consumer of a selection (`SelectionBoundsService`,
`SpatialEditingService`, alignment/distribution/numeric-transform)
neither knows nor needs to know a placement selection exists — a
placement selection's `brickIds` is always empty, so those surfaces
correctly see "nothing to operate on" rather than crashing on an
unfamiliar shape. Move/rotate/duplicate for a placement selection
deliberately do NOT flow through that brick/group-shaped gesture kernel
at all; `application/EditorSession.js` branches on
`selection.isStructurePlacementSelection` before ever reaching it,
routing to small, dedicated commands
(`MoveStructurePlacementCommand`/`RotateStructurePlacementCommand`/
`DuplicateStructurePlacementCommand`) instead — the SELECTION model, the
ACTION registry, and `CommandHistory` are the abstractions this reuses;
`SpatialEditingService`'s own per-brick geometry is not one of them, and
widening it to also understand a whole placed structure would blur
exactly the distinction this principle exists to keep sharp.

### Duplicating An Instance Is A Spatial Operation; Forking Its Content Is Not (0.2.91)

`application/commands/DuplicateStructurePlacementCommand.js` creates a
new `StructurePlacement` referencing the exact SAME `documentId` — never
a new Document, never a call into `application/ForkStructureUseCase.js`.
This is the same content/spatial-state boundary 0.2.81 drew for forking
("Forking A Structure Records Provenance, Never A Live Dependency") and
0.2.90 drew for placing, applied one more time to duplication: House A
duplicated into House C keeps `documentId(A) === documentId(C)` while
`placementId(A) !== placementId(C)` — proven directly, by name, in
`tests/StructureInstanceEditing.test.js`'s own flagship. The
practical consequence is what makes the distinction real rather than
academic: editing the House Document afterward is immediately visible
through BOTH A and C (one authoritative Document,
`StructureDocumentResolver` resolving fresh for each, exactly as 0.2.90
already proved for two ordinary placements), while duplicating, moving,
or rotating either instance never mutates the Document at all. A UI
surface that wanted "duplicate this structure's bricks into a genuinely
independent copy" would need to call `ForkStructureUseCase` and then
place the fork — a different, more expensive operation this command
deliberately does not conflate with the cheap, purely-spatial "one more
instance of the same House."

### The Interactive Gizmo Dispatches By Selection Kind; It Never Merges Two Gesture Kernels Into One (0.2.92)

`renderer/TransformGizmoController.js` holds exactly one `gestureService`
reference for its whole lifetime — it was built in 0.1.46 around a single
brick/group-shaped kernel, `application/SpatialEditingService.js`, and
has no idea a `StructurePlacement` exists. 0.2.91 explicitly declined to
widen that kernel ("Selecting An Instance Selects Its Spatial Reference,
Never Its Content," just above) rather than blur the content/instance
boundary the whole 0.2.90 design rests on. So when this milestone gives a
placement selection the SAME interactive arrows/pad/ring gizmo a brick
selection already has, the two gesture kernels still don't merge:
`application/StructurePlacementGestureService.js` is a second,
independent implementation of the identical narrow 5-method contract
(`begin/preview/commit/cancelTransformGesture` + `getGestureFeedback`),
and `application/GizmoGestureRouter.js` is the one new piece of
machinery — a pure per-call dispatcher, `selection.isStructurePlacementSelection
? placement : brick`, that lets `TransformGizmoController` keep believing
it only ever talks to one gesture service. Neither kernel is modified;
neither knows the other or the router exists. The renderer-facing gizmo
visuals (`renderer/TransformGizmoRenderer.js`) are reused completely
unchanged — they were already selection-agnostic, anchored to nothing
more than `{ pivot, bounds }`, which is exactly why this milestone did
not need to touch them at all.

The same split shows up one layer up: `application/EditorSession.js`
still resolves "where does the gizmo go" through
`TransformGizmoUseCase` for a brick/group selection (untouched, exactly
the 0.1.46 use case it always was) and through
`StructurePlacementGestureService#getSelectionBounds()` for a placement
selection (`_resolveGizmoPresentation()`) — two resolution paths behind
one small `if`, not a widened `TransformGizmoUseCase`.

### A Placement's Elevation Is Never A Gizmo Or Numeric Target (0.2.92)

`application/PlacementPositionService.js#calculateStructureGround()`
already established, in 0.2.90, that a `StructurePlacement`'s local Y
stays exactly 0 (or whatever it already is) forever — terrain elevation
is composed on top at RENDER time only (`renderer/WorldRenderer.js`),
never baked into the placement's own stored position (see "A Structure
Placement Transforms Its Content At Render Time, Never At Rest," 0.2.90).
0.2.92's two new interaction surfaces both honor that rule structurally,
not by convention:
`StructurePlacementGestureService#previewTransformGesture()` reads
`transform.translation.x`/`.z` and *discards* `.y` unconditionally — the
gizmo's Y-axis handle is drawn (the shared `TransformGizmoRenderer` has
no idea a placement rather than a brick is selected) but produces no
effect when dragged for a placement, by construction, not by hiding or
disabling the handle. And `StructureInstancePanel`'s numeric inspector
never offers a Y field to type into at all — only X, Z, and rotation are
editable; Y is rendered as a read-only "Ground Y: 14.7," computed fresh
via `core/TerrainHeightField.js#terrainHeightAt()` (the exact pure
function every other ground-placement site in this engine already calls)
at the placement's CURRENT (x, z), never stored on the placement and
never a value either surface can set. A future milestone that wanted
genuine vertical placement (floating structures, stacked platforms) would
need to say so explicitly and change this rule on purpose — it cannot
happen by accident through either interaction surface this milestone
adds.

### Selection In World View Does Not Imply Editing Authority (0.2.93)

World View gained the ability to pick a `StructurePlacement` — a THIRD
raycast target set, alongside brick and avatar picking
(`renderer/PickingService.js#pickPlacement()`, wired into World View's
own `PickingService` for the first time this milestone) — without
gaining any way to move, rotate, duplicate, or delete one. That is not a
missing feature; it is the point. `application/spatial-state/
SpatialSelectionState.js#placement()` mints a selection whose `items`
array is ALWAYS EMPTY, and that single fact is the entire mechanism, not
merely a convention: `application/SelectionBoundsService.js#calculate()`
returns `null` for an item-less selection, so `TransformGizmoUseCase#
resolvePresentation()` never shows a gizmo for it; `application/
SpatialEditingService.js#getEditingContext()` falls through to
`SpatialEditingContext.empty()` for the same reason, so `WorldNavigationSession`'s
`moveSelection()`/`rotateSelection()`/`deleteSelection()` all return
`false` before a command is ever considered. Neither file was taught a
`placement` selection exists; each one simply sees a selection with
nothing to operate on, which is exactly the "select → inspect, never
select → manipulate" posture the design conversation asked World View to
hold, as distinct from the Editor's "select → manipulate" — see 0.2.27's
own "Camera Focus, Active Document, and Selection Are Three Different
Things" for the same instinct applied to a different pair of concepts.

The read-only surface a placement selection DOES get —
`application/SpatialInspectionService.js#_inspectPlacement()` — is
deliberately shaped nothing like `StructureInstancePanel`'s numeric
inspector: plain data only (title, source document id/title, local and
world position, rotation, groundY), no input field, no Apply button, no
Y target. The one authorized way out is `Open Source`
(`ui/views/WorldView.js#openStructureSource()`), which does not edit
anything itself — it leaves World View entirely and reuses the Editor's
existing `/editor?load=<id>` route, the same one `ui/components/
PublicationCatalog.js` already uses to open a document. Editing a placed
structure's content always happens by opening its Document in the
Editor, never by touching the instance from World View, extending
0.2.91's own "editing a placed structure's bricks should still happen by
editing its Document, not by touching the instance" one layer further
out — the instance now isn't touchable from World View at all.

This boundary is deliberately UI/selection-shaped today, not an
authorization decision — there is no permission check anywhere in this
milestone's code, on purpose. Alice inspecting Bob's World sees exactly
what she'd see inspecting her own, because World View has no mutation
surface to guard yet. That is what makes the eventual question "is Alice
AUTHORIZED to move this?" (0.2.95) attachable to one clean seam later —
the Editor's own existing command path — rather than requiring a future
milestone to first find and close editing affordances that quietly crept
into World View by accident. See also "Observation Does Not Imply
Authority, And Interaction Does Not Imply Control" (0.2.44), the same
shape applied to avatar gestures rather than spatial selection.

### A World Location Is Read From Existing Identity, Never A New Store (0.2.94)

World View Location & Navigation adds a Locations panel and a `Home`
action without adding a location database. `core/WorldLocation.js` is
never persisted, never has its own id-minting scheme, and is never
written by anything other than `application/WorldLocationDirectory.js#list()`
— every instance is DERIVED, on the fly, from identity that already
exists for an unrelated reason: a `StructurePlacement`'s own `id` and
`position` (0.2.90) for a `STRUCTURE` location, or the world's fixed
origin for the one `ORIGIN` location. Deleting the `StructurePlacement`
a location was built from means the next `list()` call simply no longer
produces it — there is no dangling row to clean up, because there was
never a row, only a read.

This is why `core/WorldLocationKind.js` ships with exactly two kinds
instead of the fuller `LANDMARK`/`SETTLEMENT`/`NATURAL_FEATURE`
vocabulary the design conversation named. Both of those additional kinds
would require either fabricating identity that doesn't exist (a
"landmark" for one arbitrary tree-density sample among the deterministic
infinity `core/NaturalFeatureField.js` can produce — see that file's own
"sampled, never stored" framing) or standing up the persistent location
store this milestone explicitly declined to build. Extending the kind
vocabulary later is additive — a new derivation function feeding the
same `list()` — never a breaking change to what already exists.

### A Camera Focus Never Jumps; It Interpolates Through A Deterministic Path (0.2.94)

Every pre-0.2.94 camera move in this codebase (`focusDocument`,
`focusTarget`, `focusSelection`) applies its target `CameraState` in a
single synchronous write — correct, but a visible jump-cut once the
world is large enough that "Home" or "Focus" can cover hundreds of World
Units in one call. `application/CameraFocusAnimator.js` is a pure
function of `(from, to, durationMs, elapsedMs)` — no clock, no renderer,
no session state — that WorldNavigationSession's own frame tick
(`_tickCameraFocus`, riding the exact `onAnimationFrame` loop avatar
movement and profile republishing already use) samples once per frame
and hands straight to `SpatialCameraController#applyFraming()`. The
determinism guarantee is exactly TerrainHeightField's own shape, carried
one layer up: the SAME `(from, to, durationMs)` produces the SAME
framing at the SAME `elapsedMs`, on any replica, independent of frame
rate — which is what lets two independent replicas that both call
`focusLocation(sameId)` land on the identical FINAL framing, even though
their frame-by-frame paths there depend on each replica's own render
loop timing.

Deliberately NOT collision-aware: the interpolation is a straight-line
eased lerp between two framings, not a navmesh route that swerves around
terrain or a building in between. "Never jumps" means the camera passes
through a continuous path of intermediate positions, not that the path
never clips geometry — true camera collision avoidance is exactly the
physics-shaped complexity the design conversation named and deliberately
postponed. `focusDocument`/`focusTarget`/`moveCamera` keep their
original pre-0.2.94 instant-apply behavior unchanged, on purpose — this
milestone adds animated navigation as new entry points
(`focusLocation`/`goHome`), it does not retrofit every existing camera
call with motion those callers, and their tests, never asked for.

### A Compass Heading Is Computed From Camera Orientation, Never Stored Or Broadcast (0.2.94)

`core/CompassHeading.js#computeCompassHeading()` takes nothing but the
camera's current position and target and returns `{ degrees, label }` or
`null` — the exact "pure function, nothing persisted" shape
`core/AvatarFacing.js#computeFacingYawDegrees()` already established for
avatar facing, whose angle convention this reuses outright (0° faces
+Z, 90° faces +X) rather than inventing a second one a caller would have
to convert between. `WorldNavigationSession#getCompassHeading()` re-runs
it fresh on every call; there is no `compassHeading` field anywhere in a
`Document`, a `WorldPlacement`, or any presence/profile advertisement —
a compass reading is exactly as ephemeral and locally-derived as
`_followAvatarIfEnabled`'s notion of "which way is the avatar facing,"
and for the same reason: it describes THIS replica's own camera, never
a fact about the shared world other replicas need to agree on.

"North" is `core/CompassHeading.js`'s own fixed reference direction
(+Z), not a real-world bearing — this is a synthetic `(seed, x, z)`
terrain (`core/TerrainHeightField.js`) with no geography to be north OF.
Choosing +Z as the label origin costs nothing and buys a stable,
document-independent reference frame for the compass to read against,
regardless of where the camera currently is or which World is loaded.

### World View Navigation Operates On Spatial Observation, Never On Document Mutation (0.2.94)

`getWorldLocations()`, `focusLocation()`, `goHome()`, and
`getCompassHeading()` join `focusDocument()`/`focusSelection()`/
`moveCamera()` as READ and CAMERA-ONLY operations — none of them touch
`_activeDocumentId`, `_spatialSelection`, `_spatialInspection`, a
`Document`, a `CommandHistory`, or any placement. `focusLocation()`
in particular resolves a `WorldLocation` and moves the camera toward it
without ever calling `setActiveDocument()` the way `focusDocument()`'s
own default does — extending 0.2.27's "Camera Focus, Active Document,
and Selection Are Three Different Things" with a FOURTH: Location.
Focusing "the House" is never the same operation as making the House's
Document the active editing target, exactly as focusing a search result
was never the same as selecting it (0.2.29).

This is the same boundary 0.2.93 drew for selection, extended to
navigation: World View gained a Locations panel and a Home action
without gaining a single new mutation surface. The flagship
(`tests/WorldViewLocationNavigation.test.js`) proves it structurally,
not just by convention — a `focusLocation()`/`goHome()` round trip
leaves the World document, the placement, and `CommandHistory`
byte-identical, and two independently-constructed sessions loading the
SAME world state produce the SAME `getWorldLocations()` list and the
SAME final framing for the SAME location, with nothing route- or
timing-dependent about either result.

### World Mutation Requires Explicit Document Editing Authority (0.2.95)

0.2.93's own framing was "Selection In World View Does Not Imply
Editing Authority." 0.2.95 states the positive form of the same rule:
World View mutation REQUIRES explicit document editing authority, asked
fresh, of the actual Document being touched, every single time. Not
once at session construction, not once at login, not once per World —
`application/WorldAuthorizationService.js#resolveAccess(document)` is a
pure function of (this Document, whoever is asking right now), called
again at every real mutation attempt. That is what makes revocation
(device or, later, any richer authority model) take effect on the very
next attempt with no cache to invalidate and no session to rebuild —
see "Device Authorization Changes Peer Authority, Never Social
Identity" (0.2.79) and "A Connection Represents An Identity Either
Directly Or Through One Verified Device Authorization, Never By
Assumption" (0.2.78) for the same "ask again, never remember" posture
applied to a different question.

The architectural rule underneath, worth stating in one line because
every future editing feature has to keep obeying it:

```text
UI -> UseCase -> Authorization -> Command -> Document
```

never

```text
UI -> "if owner then enable button" -> World mutation
```

A UI is free to READ `canEditDocument()`/`getWorldAccessLevel()` to
decide whether to even show a move/rotate/delete affordance — that is
good, ordinary UX, not a violation of this rule. What the rule forbids
is a UI decision being the ONLY gate: `application/SpatialEditingService.js`'s
own mutation methods (`beginTransformGesture`/`_executeLayoutOperation`/
`_executeForSelection`/`moveBrick`/`rotateBrick`/`deleteBrick`) all
re-consult authorization themselves, so a caller that skips the UI
entirely — a test, a script, a future automation, a bug — gets the
identical answer a button click would have. See
`tests/WorldEditingAuthorization.test.js`, Section G, "even bypassing
the UI entirely: call straight into SpatialEditingService."

### Ownership Is A Cryptographic Identity Fact, Never A Free-Text Label, When One Is Available (0.2.95)

`DocumentMetadata.author` has been a plain string since 0.1.17 — chosen
at login, never verified, never bound to a key. That was harmless while
nothing but display ever read it. It stops being harmless the moment
"does this viewer own this Document" becomes an authorization decision:
two people who both typed the display name "Alice" would otherwise both
look like the owner. `DocumentMetadata.authorIdentityId` records the
SAME fact with the strength authorization actually needs — a did:key,
resolved from `identityProvider.getSigningIdentity()` at
document-creation time by every site that already stamped `author`
(`application/CreateDocumentManagerUseCase.js`, `ForkDocumentUseCase.js`,
`ForkPublishedWorldUseCase.js`, `ForkStructureUseCase.js`, via the one
shared `identity/resolveSigningIdentityId.js` lookup).

Never a replacement for `author` — display still reads the label, and a
pre-0.2.95 document (or one saved by a provider with no cryptographic
surface at all) simply has no `authorIdentityId`.
`WorldAuthorizationService` degrades to comparing the legacy label in
that case, exactly the "validate strictly on write, degrade gracefully
on read" posture 0.2.34 established for `AvatarProfile.appearance` —
but the degrade is a courtesy for content that predates the stronger
fact existing, never a fallback path a caller can reach AFTER a strong
comparison has already been made and has already failed. Typing
someone else's display name never grants their authority once a
Document records a real owner identity.

### Authorization Composes With Device Resolution; It Never Reimplements It (0.2.95)

`WorldAuthorizationService` answers exactly one question — "given who
is looking, what may they do with THIS Document" — and refuses to
answer a second one it doesn't need to: "which physical device is this,
and does it speak for someone else." That second question already has
an owner, `application/DeviceAuthorizationPropagationUseCase.js`
(0.2.78/0.2.83), and `resolveOwnSocialIdentity()` already answers it
correctly, including revocation. `WorldAuthorizationService`'s optional
`resolveSocialIdentity` collaborator is nothing more than that exact
method, handed through — never re-implemented, never re-verified,
never cached independently. The consequence is structural, not a
behavior anyone had to code: Alice's Laptop and Alice's Phone both
resolve to her own `identityId` while her Phone's device authorization
is active, so both get `EDIT` on a World she owns with zero
device-aware code inside `WorldAuthorizationService` itself; the moment
that authorization is revoked, `resolveOwnSocialIdentity()` falls back
to the Phone's own bare signing identity (see 0.2.83's own header), and
`WorldAuthorizationService` loses `EDIT` for it on the very next call —
not because it noticed a revocation, but because it asked the same
question again and got a different, equally honest answer. See "Device
Authorization Changes Peer Authority, Never Social Identity" (0.2.79)
for the same compositional instinct applied to friendship/chat/voice.

### World Synchronization Is A Command Protocol, Never A Document Sync Channel (0.2.96)

`application/WorldCommandPropagationUseCase.js` never transmits a World,
a Document, or a placement list — the unit of propagation is exactly one
already-executed `application/commands/Command.js` instance, serialized
`command.toJSON()` the identical way `application/CommandHistory.js`'s
own persistence/replay already does, and reconstructed on the receiving
side through the SAME `application/commands/CommandRegistry.js`. This is
not an optimization; it is what keeps "local durable state" and
"replicated mutation" two genuinely different things rather than one
periodically overwriting the other. A protocol that instead shipped
`world.toJSON()` around would make "Bob just received Alice's whole
World" indistinguishable from "Bob's own in-progress edits got silently
replaced," and would make 0.2.97's eventual conflict-resolution work
strictly harder: there would be no operation boundary left to reason
about, only two competing snapshots. See "A Peer Connection Transports
Messages; It Does Not Interpret Them" (0.2.52) for the same instinct —
a wire protocol carries the smallest true fact, never a convenient bulk
substitute for it — applied one layer up, to what "the smallest true
fact" even IS for a World.

`forkbuild:world-sync` is its own protocol string, exactly the way
`forkbuild:device-conversation-sync` (0.2.83) is a SEPARATE protocol from
`forkbuild:chat`, never a new message kind riding either it or
`forkbuild:chat`/`forkbuild:device-authorization`. Chat is message-
oriented, durable-conversation, delivery/read-state shaped; World
synchronization is document-oriented, durable-spatial-state, mutation-
operation shaped. Folding one into the other's wire vocabulary would
couple two protocols with genuinely different failure and ordering
semantics for no reason beyond convenience.

### A Remote Operation Is Durable World State; It Is Never A Local Undo-Stack Entry (0.2.96)

`WorldCommandPropagationUseCase#_handleIncoming()` applies an accepted
remote operation with `command.execute({ world: document.world })`
directly — never `commandHistory.execute(command)`. The distinction
matters the moment two replicas are both live: if Bob's own `Undo`
could unwind a mutation Alice made on her replica, pressing it would not
restore Bob's own prior state at all, it would silently fight Alice for
control of a fact Bob never touched himself. `application/CommandHistory.js`
remains exactly what 0.1.37 built it to be — one replica's own local
editing session, undo/redo, and save-point tracking — and
`replication/ReplayGuard.js` (never `CommandHistory`) is what makes a
remote operation idempotent. A World document mutated by a remote
operation is genuinely, durably different afterward — this is not a
preview, a draft, or a pending change — it is simply never something
THIS replica's own undo gesture is allowed to reach for. See
`tests/WorldCommandPropagation.test.js`, Section C, "his own local
undo/redo history for World A is STILL completely empty," asserted both
immediately after acceptance and again after every later operation in
the flagship, including the refused ones.

### Authorization For A World Operation Is Asked About One Specific World, Never "Authorized Somewhere" (0.2.96)

The same discipline `WorldAuthorizationService#resolveAccess(document)`
already enforces for a local UI click — it takes the specific Document
being asked about, never a session-wide or World-wide answer (see
"Ownership Is A Cryptographic Identity Fact..." above, and 0.2.95's own
closing note on why placement-instance and referenced-structure
authorization were never merged into one decision) — extends unchanged
across the network. `WorldCommandPropagationUseCase` resolves the LOCAL
Document for the envelope's own `worldDocumentId` and asks
`WorldAuthorizationService` about THAT Document specifically; an
identity with real `EDIT` on one World carries no authority whatsoever
onto a different `worldDocumentId`, even one arriving over the exact
same already-authenticated connection in the exact same session. See
`tests/WorldCommandPropagation.test.js`, Section C, "Alice's real EDIT
authority on World A grants her nothing on World B."

### The Claimed Author Of An Operation Is Never Trusted Ahead Of The Connection That Carried It (0.2.96)

`application/ChatUseCase.js#_handleIncoming()` established the two-step
pattern in 0.2.63: first, the claim in the payload must equal the RAW
key this specific, already-authenticated connection proved during its
handshake; only then does social/device identity resolution ever run.
`WorldCommandPropagationUseCase` applies the identical two steps, never
collapsed into one: `envelope.authorIdentityId` is compared against
`connectedPeer.remoteIdentity.identityId` BEFORE
`resolveConnectionIdentity()` is even consulted. Charlie's own
authenticated connection, carrying Charlie's own cryptographically-proven
key, cannot make an operation authored by "Alice" merely by writing her
identityId into the envelope — the mismatch is caught at the cheapest,
earliest possible point, before any World is even resolved, before
authorization is even asked. "I am Alice" is data an attacker fully
controls; "this connection's own proven key" is not.

### Ordering Is A Deterministic Total Order, Never Wall-Clock Time (0.2.97)

`core/LogicalClock.js` is a Lamport logical clock, not a timestamp.
Two replicas' system clocks are never assumed to agree — not
approximately, not "close enough for a game" — because a wall-clock
comparison would make convergence depend on something no protocol in
this codebase controls: whether Alice's laptop and Bob's phone happen to
have synchronized NTP. `core/WorldOperationOrder.js#compareWorldOperations()`
instead orders by `(logicalClock, operationId)` — a scalar the sending
replica advances on every operation it authors and raises on every
operation it accepts from someone else, plus the operation's own already
globally-unique id (`application/commands/Command.js`'s own `createId()`)
as a tie-breaker for genuinely concurrent operations. Two distinct
operations can never compare equal under this order, which is what makes
it a TOTAL order, not merely a causal (partial, vector-clock) one: this
milestone never needs to answer "did A happen-before B," only "which of
these two does every replica agree comes first" — a strictly weaker,
sufficient question core/CausalStamp.js's own richer vector-clock
machinery (0.2.18, built for a different object — PlacementRecord) was
never the right tool for here. See `replication/WorldConflictResolver.js`'s
own header for what this order is used for.

### A Conflict Resolver Reorders Commands; It Never Reinvents Them (0.2.97)

`replication/WorldConflictResolver.js` is neither a CRDT nor an
operational-transform function — the design conversation was explicit
that 0.2.97 should stay "deliberately modest" and reach for neither
unless a real need demanded it, and none did. Every `application/
commands/Command.js` subclass keeps meaning exactly what it already
means; the resolver's entire vocabulary is the same two methods every
command has always implemented — `execute()` and `undo()` — called in a
different SEQUENCE than the order operations happened to arrive in, never
with different SEMANTICS. Reconciling an out-of-order operation undoes
the already-applied "tail" (operations canonically after the new one,
LIFO — the identical order `application/CommandHistory.js#undo()`
already uses for its own stack), inserts the new operation, and replays
the tail forward. This works, with zero command-specific code, only
because every command in this codebase was ALREADY required to be safely
re-executable after `undo()` — `CommandHistory#redo()` has depended on
that same property since 0.1.37. The conflict-resolution guarantee this
milestone adds costs nothing new of that kind; it only asks WHEN the
existing contract gets exercised.

### Delete Is Terminal — A Stated Conflict Policy, Not An Accident Of Arrival Order (0.2.97)

Given a delta-based Move/RotateStructurePlacementCommand always composes
(two concurrent moves of the same placement simply add), the one command
pair in this codebase that genuinely cannot both "win" is delete versus
modify: `RemoveStructurePlacementCommand#execute()` and every Move/
RotateStructurePlacementCommand's own `execute()` both already REQUIRE
their target to exist, throwing otherwise — a precondition this
milestone never relaxed. `replication/WorldConflictResolver.js#_tryApply()`
catches exactly that one failure mode during ordered replay and records
the operation SUPERSEDED, then keeps going. The consequence, worked out
once here rather than left to be discovered by an assertion: in EITHER
canonical order, the delete's own effect always survives. If the delete
is canonically first, the modify simply finds nothing there. If the
modify is canonically first, it genuinely applies — and is then removed
out from under it when the delete replays on top. Nothing in this
codebase resurrects a removed target except its own explicit `undo()`
(never invoked automatically by anything but a LATER, still-canonically-
earlier operation's own rebase). This is a chosen policy, matching the
design conversation's own instruction ("the system needs an explicit
rule rather than accidentally depending on arrival order"), not a
side-effect an implementer happened to notice.

### The Composition Gap Is Closed Through The Existing Event, Never A New Call Site (0.2.97)

0.2.96 left `WorldCommandPropagationUseCase#broadcastCommand()` fully
built and tested, but wired into nothing — `application/
WorldNavigationSession.js` has upward of a dozen places that create or
replace a `CommandHistory`. Rather than adding a `propagation.broadcastCommand()`
call at each of those sites (a change that would need to be
independently remembered and kept correct at every one, forever),
`WorldCommandPropagationUseCase#attachCommandHistory()` subscribes ONCE
to `application/CommandHistory.js`'s own, already-existing
`COMMAND_EXECUTED` event — the identical event every other consumer of a
CommandHistory already reacts to. `WorldNavigationSession` funnels every
`CommandHistory` it creates through one new private chokepoint,
`_registerCommandHistory()`, mirroring the "one seam, not N call sites"
discipline `application/SpatialEditingService.js#canEditDocument`
already established for 0.2.95's authorization gate. The result: a
future mutation chokepoint this file grows never has to remember to
broadcast anything — it inherits propagation for free the moment it
routes through a registered `CommandHistory`, the same way it already
inherits undo/redo, persistence, and replay.

### A World Edit Grant Is A Signed Capability About One World, Never A Role And Never A Second Kind Of Ownership (0.2.98)

`core/WorldEditAuthorizationEnvelope.js`/`application/WorldMembershipUseCase.js`
close the gap 0.2.97 named and deliberately left open: `WorldAuthorizationService`
granted `EDIT` to exactly one cryptographic owner (plus, transparently,
that owner's own authorized devices). A World edit grant does not widen
`core/WorldAccessLevel.js`'s own closed `NONE`/`READ`/`EDIT` vocabulary —
there is no `EDITOR` or `COLLABORATOR` level anywhere in this codebase,
and this milestone does not add one. Instead, a grant is a fact ABOUT a
viewer, checked the same way `authorIdentityId` itself already is: given
who is asking, about which exact World, do they hold `EDIT`? A grant is
scoped to exactly one `(worldDocumentId, subjectIdentityId)` pair — Bob
holding a grant on Alice's World A says nothing whatsoever about World B,
the identical "Alice can edit World A / Alice cannot therefore edit World
B" discipline ownership itself already enforced for a SINGLE owner's own
devices, now extended to a second, independent identity. Holding a grant
never confers the authority to grant it onward, either — only the
World's own owner may ever call `WorldMembershipUseCase#grantEdit()`
successfully; see the next principle for how that is enforced against a
dishonest sender, not merely a well-behaved local caller.

### Only The World's Own True Owner May Ever Issue A Membership Grant — Checked Structurally, On Every Replica, Against A Forged Claim (0.2.98)

`WorldMembershipUseCase` is a gossip protocol, structurally identical to
`application/DeviceAuthorizationPropagationUseCase.js`'s own: a record is
trusted by its OWN signature alone, never by who relayed it. Device
authorization never needed to ask "is the signer allowed to make this
claim" beyond "does it hold the key it claims to" — any identity may
authorize any device to act for ITSELF. A World edit grant is different,
and needs a second, genuinely new check: `grantingIdentityId` must equal
`worldDocumentId`'s own `metadata.authorIdentityId`, verified fresh
against the receiver's OWN locally-known World document on every
accepted grant/revocation — never merely against what the record itself
claims, and never trusted because the record is validly self-signed. A
perfectly legitimate, honestly-self-signed grant — Bob's own key,
properly signing a claim that Bob himself grants Charlie access to
Alice's World — is refused on every replica that knows Alice's World,
because `grantingIdentityId` (Bob) does not match that World's real
owner (Alice). Structural signature validity and "did the right party
issue this" are two different checks, and this milestone never conflates
them.

### World Presence Is Computed From Live, Authorized Connections, Never Persisted (0.2.98)

`core/WorldPresenceAdvertisement.js` is permanently unsigned, the exact
same posture `core/AvatarPresence.js` already established and for the
identical reason: nothing here is meant to be believed or relied on
beyond the single, currently-live, mutually-authenticated peer
connection it travels over. `application/WorldPresenceUseCase.js` never
writes a `WorldPresence` row to any `StorageProvider` — a participant's
presence in a World is answered fresh, on every `getRoster()` call, by
intersecting this replica's last-known advertisements against its OWN
`ConnectedPeerRegistry`'s CURRENT authenticated list. A disconnected
peer's entries are pruned the moment its connection drops; nothing needs
to tell the roster that participant left, the same way nothing needs to
tell a `RemoteAvatarRegistry` an avatar's movement stopped arriving.

### Being Online Is Not The Same As Being Authorized To Edit — A Presence Roster's `canEdit` Is Always Recomputed, Never Read Off A Remote Claim (0.2.98)

`core/WorldPresenceActivity.js`'s own `EDITING`/`EXPLORING` value is a
self-reported UI hint a remote participant advertises about themselves —
it is never treated as proof of anything. `WorldPresenceUseCase#getRoster()`
always recomputes each entry's `canEdit` LOCALLY, through the same
ownership/grant check `application/WorldAuthorizationService.js` and
`application/WorldMembershipUseCase.js` already answer, never by trusting
whatever activity string arrived on the wire. Revoking Bob's World edit
grant while his WebRTC connection stays perfectly alive therefore changes
what the very next `getRoster()` call reports for him — `canEdit` flips
to `false` immediately, `deviceCount` stays exactly what it was — with
zero need to ever disconnect him, the identical "revocation is an
authorization gate, never a connection-teardown event" discipline 0.2.78
established for device revocation, now extended to presence display
itself.

### The UI Displays Authorization; It Never Decides It (0.2.99)

`ui/components/WorldMembersPanel.js` offers Grant/Revoke buttons and
`ui/components/WorldPresenceIndicator.js` reports who is online, but
neither component — nor `ui/views/WorldView.js` hosting them — ever
decides whether a grant should succeed. Every fact a Collaboration UI
component renders was already decided one layer down:
`WorldNavigationSession#isWorldOwner()`/`canEditDocument()` (0.2.95,
0.2.98), `WorldMembershipUseCase#grantEdit()`/`revokeEdit()` (0.2.98,
re-verifying ownership fresh on every call), and
`WorldPresenceUseCase#getRoster()`'s own locally-recomputed `canEdit`
(0.2.98). `ui/components/WorldCollaborationRoster.js#buildWorldCollaborationRoster()`'s
`canManage` flag governs only whether a BUTTON is offered — never
whether a click succeeds. A caller that invoked
`session.grantWorldEdit()` directly, skipping the panel entirely, gets
refused by `WorldMembershipUseCase#_requireOwnerIdentity()` exactly the
same way a forged owner-only gossip message already was in 0.2.98's own
flagship. See docs/Roadmap.md, 0.2.99, for the full chain: "UI ->
WorldNavigationSession -> WorldMembershipUseCase/WorldPresenceUseCase/
WorldAuthorizationService," never "UI -> if currentUser === owner ->
grant()."

### A Collaboration UI Component Is Shared, Never Duplicated, Between World View And A Future Editor Surface (0.2.99)

`ui/components/WorldCollaborationRoster.js`'s `buildWorldCollaborationRoster()`
is a pure function — no Vue, no DOM, no network, no storage — precisely
so it can be consumed unchanged by any future collaboration surface
`application/EditorSession.js` grows, the same way `ui/components/WorldMembersPanel.js`
and `ui/components/WorldPresenceIndicator.js` are themselves generic
Vue components rather than `WorldView`-specific markup. The instinct
this continues is 0.2.93's own: "Selection In World View Does Not Imply
Editing Authority" established that World View could observe a World's
content without any capacity to change it; this milestone establishes
the parallel guarantee for collaboration state — observing WHO may
edit, and who is here, never itself implies a second, independently
maintained accounting of either fact. Building `WorldViewMembersPanel`
and a hypothetical `EditorMembersPanel` as two separate implementations
would have been the one mistake this milestone's own design
conversation warned against by name.

### Collaborative Spatial Presence Is Ephemeral Observation, Never World Content (0.3.0)

`core/WorldSpatialPresenceAdvertisement.js` carries a remote
participant's camera position, heading, selection, and activity — and,
like `core/AvatarPresence.js` and `core/WorldPresenceAdvertisement.js`
before it, is never passed to a `StorageProvider`, never signed, never
folded into a `World`, a `Document`, a `Command`, undo/redo, or a
`WorldOperationEnvelope`. If Bob disconnects, Bob disappears — the World
document a replica holds stays byte-identical whether or not Bob, or
anyone else, was ever spatially present in it; `tests/CollaborativeSpatialPresence.test.js`'s
own flagship proves this directly by comparing `document.toJSON()`
before and after the entire scenario. `application/WorldSpatialPresenceUseCase.js`
computes its roster from live, authenticated connections only, exactly
`WorldPresenceUseCase#getRoster()`'s own 0.2.98 discipline — a
disconnected device's last-known position is pruned, never left behind
as a stale ghost.

This also means `activity` — `core/WorldSpatialActivity.js`'s own
IDLE/WALKING/INSPECTING/BUILDING/MOVING_STRUCTURE/ROTATING_STRUCTURE
vocabulary — is never authorization, extending 0.2.98's own "being
online is not the same as being authorized to edit" one rung further:
seeing "Bob — Building" must never mean Bob currently holds EDIT
authority. `application/WorldAuthorizationService.js` remains the sole
authority on that question, and revoking Bob's grant never gates his
spatial presence at all — his camera, heading, and selection keep
flowing exactly as before, proven directly in the flagship's own Section
C. And `activity` is always DERIVED, never authored: `deriveWorldSpatialActivity()`
is a pure function of a session's own already-existing gizmo/selection/
movement state, never a free-text or user-typed field a remote claim
could forge into something a receiver misreads as an editing signal.

### Remote Selection Observation Is Never Local Editing Selection (0.3.0)

`core/WorldSpatialSelection.js` is deliberately NOT
`application/spatial-state/SpatialSelectionState.js` — see docs/Principles.md,
"UI Selection Must Never Imply Editing Authority (0.2.95)." A remote
participant's selection implies even less authority than a local one:
`WorldSpatialSelection` shares no type, and no code path, with
`SpatialSelectionState`, `application/SpatialEditingService.js`, the
transform gizmo pipeline, or any `application/commands/` class. Nothing
in `application/WorldSpatialPresenceUseCase.js` or
`renderer/RemoteSpatialPresenceRenderer.js` imports any of them. This is
the milestone's own defining security assertion, stated directly in its
flagship: remote spatial presence can never enter a mutation path —
there is no accidental `remote selection -> SelectionTool -> Command`
route for a future refactor to stumble into, because the two "selection"
concepts were never the same type to begin with.

### A Compass Heading's LABEL Stays Local; Raw Camera Orientation May Now Travel As Ephemeral Presence (0.3.0 amends 0.2.94)

0.2.94 established "A Compass Heading Is Computed From Camera
Orientation, Never Stored Or Broadcast" — true at the time because no
presence transport for it existed yet, and still true today in the
narrower sense that mattered: there has never been, and still is no,
`compassHeading` LABEL field in a `Document`, a `WorldPlacement`, or any
presence/profile advertisement. `WorldNavigationSession#getCompassHeading()`
still re-runs `core/CompassHeading.js#computeCompassHeading()` fresh on
every call, completely unchanged. What 0.3.0 adds is narrower than it
might first appear: `core/WorldSpatialPresenceAdvertisement.js`'s own
`heading` field carries a raw camera-orientation float in DEGREES, using
`core/CompassHeading.js`'s own fixed convention — the same category of
ephemeral, connection-scoped fact `position` already is, describing a
REMOTE replica's own camera, never a shared World fact. A receiver
computes its OWN "N"/"NE"/… label from it locally, on receipt, through
`core/CompassHeading.js#resolveCompassLabel()` — the identical pure
function, never a wire-transmitted string. The distinction 0.2.94 drew
— "a compass reading is ephemeral and locally-derived, never a fact
other replicas need to agree on" — holds exactly as before; 0.3.0 merely
gives one MORE replica's own local orientation a transport to travel
over, unsigned and unpersisted, on the way to becoming another
replica's own locally-computed reading of it.

### A Spatial Anchor Is A Presentation Decision, Never Remote Authority (0.3.1)

`core/WorldSpatialAnchor.js#deriveWorldSpatialAnchor()` turns a 0.3.0
observation (position, heading, selection, activity) into a proximity
tier, a view-cone visibility flag, a presentation mode, and a contextual
activity phrase — and every one of those is a decision about how
something ALREADY true gets DRAWN, never a new fact about what a remote
participant may do. A `WorldSpatialAnchor` is never persisted, never
signed, never broadcast, and is not itself a new wire format:
`core/WorldSpatialAnchor.js` imports nothing from `peer/` or any
`application/*PropagationUseCase.js`, and nothing it computes is
reachable from `application/WorldSpatialPresenceUseCase.js`'s own
ingestion path — the third protocol 0.3.0 introduced
(`forkbuild:world-spatial-presence`) remains the only one; this
milestone adds no fourth. Concretely: a collaborator who is FAR away or
outside the viewer's own view cone is presented more quietly
(`WorldSpatialPresentationMode.MARKER_ONLY`/`HIDDEN`) — this changes
nothing about what THAT collaborator can see or do; it only changes what
THIS viewer's own renderer happens to draw. Extending
`docs/Principles.md`'s own "Collaborative Spatial Presence Is Ephemeral
Observation, Never World Content (0.3.0)" one rung further: a spatial
anchor is ephemeral PRESENTATION, computed fresh on every roster refresh
from whatever the underlying 0.3.0 observation currently says, never
cached as a separate fact a later refresh could drift away from.

A remote selection's contextual label follows the identical restraint.
`WorldNavigationSession#_resolveSpatialContextualLabel()` resolves a
`WorldSpatialSelection` of kind `'placement'` to the referenced
document's OWN saved title, through the exact
`getStructurePlacement()`/`getSavedDocumentTitle()` steps
`application/EditorSession.js#getSelectedPlacementInfo()` already uses
for a LOCAL selection — never a second, remote-only naming scheme, and
never something the remote participant supplies directly (the wire
carries only `documentId`/`placementId`, exactly as 0.3.0 always did;
the TITLE is looked up locally, by the RECEIVER, from its own saved
documents). A selection of kind `'brick'` resolves to no label — see
"Remote Selection Observation Is Never Local Editing Selection (0.3.0)"
— rather than inventing a name `core/Building.js` has no field for.

### Follow Is Local Camera Navigation, Never A Shared Camera (0.3.1)

`WorldNavigationSession#focusCollaborator(deviceId)` reads a
collaborator's LAST KNOWN spatial position, once, and moves the
CALLER's own camera toward it through the identical
`_beginCameraFocus()`/`LOCATION_FOCUS_OFFSET` machinery
`focusLocation()` (0.2.94, "World View Navigation Operates On Spatial
Observation, Never On Document Mutation") already established — no
second camera-movement mechanism, and the same deterministic glide path
every other focus call in this codebase already produces. This is
deliberately NOT a subscription: there is no persistent "currently
following Bob" mode anywhere in this codebase to track, disable, toggle,
or synchronize. A second click on "Follow" simply reads Bob's position
again, wherever he now is, and re-focuses once more — exactly like
clicking a Locations-panel entry a second time re-focuses wherever that
placement now sits, never a live tether that keeps re-centering on its
own.

The other half of this principle matters just as much: Bob's own
replica has absolutely no way to learn that Alice followed him.
`focusCollaborator()` sends nothing over any wire — it is a purely LOCAL
read of `getWorldSpatialPresenceRoster()`'s own already-received roster,
followed by a purely LOCAL camera call. There is no
`forkbuild:world-spatial-presence` message, no fourth protocol, and no
new field anywhere that could tell a followed collaborator "someone is
watching you" — extending "Collaborative Spatial Presence Is Ephemeral
Observation, Never World Content (0.3.0)" with the same discipline
applied to navigation: observing where someone is, and choosing to look
there yourself, changes nothing about what they broadcast or how they
broadcast it.

### User-Controlled Avatar Mode Is Persistent Local Interaction State, Not A Transient Gesture (0.3.2)

`WorldNavigationSession#isAvatarControlModeActive()` changes for exactly
one reason: the user explicitly called `setAvatarControlMode()`. Nothing
else — not camera movement, not a World View render tick, not remote
presence arriving, not a selection change, not focus navigation, not
following a collaborator, not any other interaction mode entering or
leaving — is ever allowed to flip it. Before this milestone, a window
losing focus (alt-tab, a DevTools breakpoint, another app stealing
focus) silently unchecked "Control My Avatar" by calling
`setAvatarControlMode(false)` — a real, legitimate concern (a keyup the
browser never delivers must not leave the avatar "stuck" walking
forever) solved the wrong way, by conflating two different actions:
releasing held keys, and disabling the mode itself.

The fix is `WorldNavigationSession#releaseAvatarMovementKeys()` — it
calls straight through to `AvatarMovementController#releaseAll()`
(exactly the same release `setAvatarControlMode(false)` already
triggers as a side effect) without touching
`_avatarControlModeActive` at all. `ui/views/WorldView.js#onWindowBlur()`
calls this instead of `setAvatarControlMode(false)`: a held key still
cleanly releases the instant focus is lost, but the checkbox stays
checked, and WASD simply resumes working the moment the window regains
focus — no re-click required. Note this is the SAME shape every other
0.3.2 fix in this file follows: find the unintended reset and remove it,
never invent a second persistence mechanism to paper over it.

`tests/AvatarControlPersistence.test.js` is the regression: it drives a
session through movement, a Camera Perspective change, a plain location
focus, remote presence arriving, a render/selection-adjacent call,
Follow-a-collaborator, and Home — twice, once starting enabled and once
starting disabled — and asserts the mode never moves except at the two
explicit `setAvatarControlMode()` calls that bookend each run.

### Camera Perspective Determines An Offset; It Never Replaces The Camera Machinery (0.3.2)

`core/CameraPerspective.js` answers exactly one question: given an
avatar's position and facing, where should a first-person/third-person/
bird's-eye camera sit, and what should it look at? It is a pure
function — no Three.js, no session, no renderer — that returns a
`{ position, target }` framing exactly like `core/PreviewCameraFraming.js`
already does for structure previews.

That framing reaches the screen through the exact same, single write
path every camera-focus caller in this codebase already shares:
`application/SpatialCameraController.js#applyFraming()`. A perspective
is never a second camera controller, never a second Three.js camera,
and never a parallel code path alongside `focusLocation()`/
`focusCollaborator()`/`_beginCameraFocus()` — it is a NEW WAY TO COMPUTE
THE FRAMING those existing entry points already hand to the same
machinery. Concretely: `WorldNavigationSession#_followAvatarIfEnabled()`
computes a perspective's framing fresh on every avatar presence update
and calls `applyFraming()` directly (continuous per-tick application
already reads as smooth tracking, the same way plain Follow Avatar's own
`moveCamera()` call already does); `focusCollaborator()` computes a
perspective's framing once, from a collaborator's last-known position,
and hands it to the identical `_beginCameraFocus()` glide `focusLocation()`
itself uses. No third camera-movement mechanism was introduced to make
Camera Perspective possible.

### Camera Perspective Is Local Perception, Never Shared Reality (0.3.2)

`WorldNavigationSession#getCameraPerspective()`/`setCameraPerspective()`
are purely local UI/navigation state — never persisted, never signed,
never broadcast, and never read by any `application/*PropagationUseCase.js`
or `WorldSpatialPresenceUseCase`. Alice choosing Bird's-Eye view tells
Bob nothing, changes nothing about what Bob's own client renders, and
never touches `AvatarPresence`, `AvatarProfile`, or any
`WorldSpatialPresenceAdvertisement`. This extends "Collaborative Spatial
Presence Is Ephemeral Observation, Never World Content (0.3.0)" one step
further: not only is observing someone else's presence never authority
over them, but choosing HOW to look at the world yourself is not even
observation worth reporting. The camera is local perception; the avatar
is local agency; the World is shared reality — and a perspective is
purely the first of those three.

### Step-Up Movement Is A Deterministic Height Constraint, Never A Physics Climb (0.3.2)

`core/BrickWalkability.js#isStepClimbable()` answers one question with
one comparison: is the height difference between two support surfaces
within `MAX_STEP_HEIGHT`? There is no momentum, no climbing animation
curve, no partial ascent partway up a tall obstacle, no rigid-body
engine, and no gravity simulation beyond what
`core/AvatarMovementSimulation.js` already had for jumping. A step within
range is taken in full, in a single tick; a step beyond range is simply
never taken — the avatar stops at the edge, exactly the same "rejected
outright, never physically slid or accelerated" posture "Terrain
Walkability Is A Movement Constraint, Never A Physics Slope (0.2.77)"
already established for slope, restated here for a vertical rise instead
of a rise/run ratio. `application/AvatarStepConstraint.js` is the
application-layer collaborator that supplies the real, currently-loaded
brick geometry this pure comparison is applied to — the same
core/application split this codebase has used for every other movement
constraint since 0.2.42.

### Step-Up Movement Builds On The Flat Walking Plane; It Does Not Replace It (0.3.2)

`core/AvatarMovementSimulation.js#simulateAvatarMovement()` has always
walked the avatar on a flat plane at a fixed ground height (`GROUND_Y`,
originally hardcoded to 0). 0.3.2 generalizes that single constant into
an injectable `groundHeight` parameter — still just a plain number, with
no idea what a brick or a document is — so a grounded avatar can snap to
a brick's own top face instead of an absolute world origin. Every caller
that never mentions `groundHeight` (every pre-0.3.2 call site, and every
test that predates this milestone) defaults to exactly `0`: the
identical flat plane this function has always assumed.

Deliberately NOT generalized further, this milestone, into following
`core/TerrainHeightField.js`'s own real, hilly elevation: doing so would
make the avatar start climbing every gentle slope its feet currently
walk straight through, a much larger behavior change than "step onto a
brick" and well outside this milestone's own scope. `application/AvatarStepConstraint.js#supportHeightAt()`
therefore answers "what brick, if any, is directly beneath this point"
against a flat baseline, never against real terrain elevation —
`application/AvatarTerrainConstraint.js`'s own real-terrain slope check
remains the only place real terrain height influences movement at all,
and it still only ever BLOCKS a step, never snaps `Y` to it. Building on
the flat plane rather than replacing it is what keeps this milestone
additive: every controller and constraint built without a
`stepConstraint` wired behaves exactly as it did before this milestone,
byte for byte.

### Walkability Is Not Collision (0.3.3)

`core/SpatialBounds.js` and `core/AvatarCollision.js` answer one
question: does this geometry overlap that geometry? `core/WalkableSurface.js`
answers a different one: where may an avatar stand and move? They may
share the same underlying brick geometry, but they are not the same
question, and this codebase never lets one quietly become the other.
Reusing an AABB for walkability is the trap this principle names
outright: a slope's AABB is a plain box, and nothing about a box's own
min/max corners can answer "what is the actual support height at this
specific (x, z)?" — the question every sloped or stepped surface
genuinely needs answered. `core/WalkableSurface.js` therefore never
widens, reuses, or is read by anything `core/SpatialBounds.js` or
`core/AvatarCollision.js` already own; placement collision stays exactly
the conservative AABB test it always was, and this codebase's own
collision system never gradually grows into an accidental physics
engine just because a slope needed a real height function somewhere.
The split is structural, not cosmetic:

```text
Collision
  ↓
"What occupies this space?"

Walkability
  ↓
"Where may an avatar stand and move?"
```

### A Directional Walkable Shape Generalizes Its Own Seam, Never Reuses A Flat One (0.3.3)

`core/BrickWalkability.js#walkableTopAt()` was named, at the time of
0.3.2, as exactly the seam a future non-box primitive would specialize
— not a claim that one existed yet. `core/WalkableSurface.js` is that
specialization, and it is deliberately built ON TOP of the existing
seam rather than beside or instead of it: an ordinary flat-topped brick
(`WalkableSurfaceKind.FLAT`) still resolves through `walkableTopAt()`
directly, byte for byte unchanged from 0.3.2. Only a genuinely
directional shape (`STEP`, `SLOPE`) gets a new, local-space profile —
and even then, that profile is evaluated in the brick's own LOCAL
coordinate space, honoring `Brick.rotation`, because which way a stair
climbs or a slope rises IS the entire reason it is a stair or a slope,
not a box. `core/AvatarCollision.js#brickAabb()`'s own "ignore
`Brick.rotation`" simplification, documented since 0.2.42 for collision,
is untouched by this — a flat brick's own footprint test still makes
that same simplification, because a flat top face has no direction to
get wrong in the first place.

### A Per-Tick Height Delta Can Replace A Brick-Wide Wall Check, Once Something Downstream Is Equipped To Police It (0.3.3)

`application/AvatarMovementConstraint.js` decided, since 0.3.2, whether
a brick blocks horizontal passage by comparing its own overall PEAK
height against the avatar's current support height — correct for a
flat box, where the peak IS the only height that exists. A stair or a
slope has no single peak worth comparing: its near edge and far edge
can differ by the brick's own full height. 0.3.3 resolves this not by
teaching `AvatarMovementConstraint` to understand tread/ramp geometry
itself, but by recognizing that `application/AvatarStepConstraint.js`
already runs a per-tick, per-point height-DELTA check downstream of
it — so a directional shape is excluded from horizontal collision
UNCONDITIONALLY (once stepping is enabled at all), and the step
constraint's own existing `isStepClimbable()` check becomes the only
gate deciding whether any specific tick's approach is actually
climbable. This is not a special case bolted onto collision — it is a
recognition that two constraints already running in sequence
(`docs/Architecture.md`'s own five-stage 0.3.2 pipeline) can jointly
answer a question neither could answer alone, without either one
growing new knowledge of the other's domain. With stepping OFF entirely,
this carve-out vanishes completely — there is no downstream check left
to police the approach, so a directional shape reverts to being a
genuine, full-height wall, exactly as it always was pre-0.3.2.

### Falling Still Asks WalkableSurface The Same Question Walking Always Has (0.3.4)

`core/WalkableSurface.js` was built, in 0.3.3, to be the one shared
geometric truth every consumer of "where may an avatar stand?" reads —
walking, stepping onto a low brick, and climbing a stair tread or a
slope's own ramp. 0.3.4 adds a fourth consumer, landing, without adding
a second surface concept for it to consult. `application/AvatarStepConstraint.js#supportHeightAt()`
— unchanged since 0.3.3 — is both what a walking step snaps onto AND
what a falling avatar's own gravity integration lands on, recomputed
fresh every tick from wherever the avatar currently is:

```text
WalkableSurface
       │
       ├── walking    -> snap onto it
       ├── stepping   -> snap onto it
       └── landing    -> integrate gravity down onto it
```

This is why a falling avatar lands correctly on a stair's own tread or a
slope's own ramp, mid-surface, with no special "falling geometry" code
path anywhere: `core/AvatarMovementSimulation.js`'s own gravity
integration was already parameterized on `groundHeight` since 0.3.2 (to
support Step-Up Movement); 0.3.4 never had to teach it what a stair or a
slope is, because it was never taught what a flat plane or a brick's top
face was either — `groundHeight` has always just been a number, supplied
fresh each tick by whichever surface `application/AvatarStepConstraint.js`
resolves for the avatar's own current (x, z). Falling is not a new
geometric question; it is gravity finally being allowed to ask the same
old one.

### A Ledge Is An Absence Of Support; A Wall Is Occupied Geometry — They Stop Being The Same Kind Of Blocked (0.3.4)

Through 0.3.3, `application/AvatarStepConstraint.js#apply()` treated any
height delta beyond `maxStepHeight` identically, regardless of
direction: blocked, X/Z reverted, exactly like walking into a wall. That
symmetry was always a deliberately named simplification (see 0.3.3's own
"Falling off a ledge under gravity" entry in docs/Roadmap.md), never a
claim that a ledge and a wall were genuinely the same obstacle. They
aren't. A wall — a step UP beyond `maxStepHeight` — is real geometry
actively occupying the space the avatar wants to enter; a ledge — a step
DOWN beyond `maxStepHeight` — is the ABSENCE of a supporting surface,
which is exactly the question gravity (`core/AvatarMovementSimulation.js`,
unchanged since 0.2.36) already exists to answer. 0.3.4 is the milestone
where that distinction finally gets acted on: stepping UP beyond range
remains genuinely blocked; stepping DOWN beyond range is now accepted
horizontally and reported as falling, handing the vertical question off
to gravity instead of pretending the ledge was never there. Symmetry
in `core/BrickWalkability.js#isStepClimbable()` itself is untouched —
it still answers one honest question ("is this delta small enough to
walk, in either direction?") — the asymmetry belongs entirely to what
`AvatarStepConstraint` does with a `false` answer, never to the pure
math producing it.

### Avatar Vertical State Is Derived, Never A Second Physics Bookkeeping (0.3.4)

`core/AvatarVerticalState.js`'s SUPPORTED/RISING/FALLING vocabulary adds
no new mutable state anywhere in this codebase. `grounded` and
`verticalVelocity` have been the only vertical-motion bookkeeping
`core/AvatarMovementSimulation.js` and `application/AvatarMovementController.js`
carry since 0.2.36; `deriveAvatarVerticalState()` is a pure, stateless
read of exactly those two values, the same "derive, never duplicate"
discipline `core/WorldSpatialActivity.js#deriveWorldSpatialActivity()`
already established for a completely different question in 0.3.0. A
vocabulary is not a physics engine — naming SUPPORTED/RISING/FALLING
makes the avatar's own trajectory legible (to tests, to a future UI, to
`core/WorldSpatialActivity.js`'s own new JUMPING/FALLING cases) without
adding a single new place that trajectory could disagree with itself.

### Local Physics Is Local; Spatial Presence Is Observation (0.3.4)

Falling and jumping gained a real trajectory in 0.3.4 — `verticalVelocity`,
`grounded`, `AvatarVerticalState` — and NONE of it joins the
spatial-presence protocol `core/WorldSpatialPresenceAdvertisement.js`
carries between replicas. A remote participant never learns Bob's
vertical velocity, which of SUPPORTED/RISING/FALLING he is in, or
anything else about how his fall is being simulated — only his
`position`, once it changes, exactly like every other movement since
0.3.0. If Bob jumps off a roof, Alice eventually sees Bob's position
update through the ordinary presence mechanism; she never receives a
physics state to replay or reconcile against her own. This is a
deliberate boundary, not an oversight: turning spatial presence into a
physics-synchronization channel would couple every replica's rendering
to a shared simulation clock this codebase has never had and does not
need. `core/WorldSpatialActivity.js`'s own new JUMPING/FALLING values are
the one place vertical motion becomes visible to a collaborator at
all — a COSMETIC label, derived locally, exactly like every other
`WorldSpatialActivity` value already is, carrying no velocity, no
gravity state, and no claim of authority over what Bob's own client
does next.

### Exploration Is Derived From Place, Not Stored As Place (0.3.6)

`core/WorldSpatialContext.js`'s `deriveSpatialContext()` answers "what is
around me right now" from nothing but a position, a seed, the currently
loaded documents' own `StructurePlacement`s, and whatever collaborator
roster `WorldNavigationSession#getWorldSpatialPresenceRoster()` already
reports — every one of those a value this codebase already computed for
an unrelated reason (terrain ecology/hydrology since 0.2.76-0.2.89,
placements since 0.2.90, spatial presence since 0.3.0/0.3.1). No new
World state is introduced to represent "Alice is standing in the
forest," and none is needed: the same `(seed, x, z)` always derives the
same terrain zone and hydrology feature on any replica, and the same
loaded `World` always derives the same nearby structures, so two
independent replicas agree on a viewer's spatial context without either
one persisting or transmitting it. This is deliberately narrower than it
sounds — `WorldSpatialContext` answers "what is here," never "what did I
discover" or "what have I visited"; a durable per-user discovery/
achievement history is a different feature entirely, one this milestone
does not build, because mixing the two would turn a pure read into a
write path (see `application/WorldSpatialContextService.js`'s own
header). `WorldNavigationSession#getAvatarPosition()`/`getWorldSeed()`
(0.3.6) are the only new session-level surface this required — thin
reads over state (`_avatarPresenceSession`, the same `DEFAULT_WORLD_SEED`
every terrain query already shares) the session already held, exactly
the "takes `session`, calls back into it, never a second source of
truth" shape `application/WorldLocationDirectory.js` established in
0.2.94. Camera movement in response to a derived context — focusing a
structure, following a collaborator — still goes exclusively through
`focusLocation()`/`followAvatarId()` and `SpatialCameraController`; a
richer sense of "where am I" never grows a second way to move the
camera there.

### A Landmark Is World Content, Not Spatial Presence (0.3.7)

0.3.6 drew a hard line at "exploration is derived, never stored" — but
named its own limit plainly: nothing that milestone built lets anyone
leave a durable mark on a World. `core/WorldLandmark.js` is the
deliberate exception, and it is exactly that: an EXCEPTION, not a
loosening of 0.3.6's own rule. A `WorldLandmark` is not derived from
anything else the World already holds (contrast `core/WorldLocation.js`,
read fresh from a `StructurePlacement`'s own identity every time) — it
IS stored state, created by `application/commands/
CreateWorldLandmarkCommand.js`, persisted in `World#toJSON()`'s own
`landmarks` array, and propagated exactly like a `Group` or a
`StructurePlacement`: an ordinary `Command` executed through
`CommandHistory`, picked up by `WorldCommandPropagationUseCase`'s
existing `attachCommandHistory()` subscription with zero landmark-
specific wiring anywhere in the sync path. Editing authority is the
existing World membership model, never a new `LandmarkOwner`/ACL
concept — `authorIdentityId` records provenance only; anyone holding
EDIT on the World may rename, redescribe, or remove any landmark in it,
the same `WorldNavigationSession#canEditDocument()` gate every other
mutation chokepoint already consults. A landmark's position is X/Z
LOCAL to its containing World, exactly like `StructurePlacement`'s own —
`application/WorldLocationDirectory.js#_landmarkLocationsFor()` applies
the World's layout offset for display, and
`WorldNavigationSession#createLandmarkHere()` subtracts that same offset
from the avatar's own absolute position when creating one, the two
exact inverses of each other.

### Derived Place Describes the World; Landmarks Deliberately Modify Its Meaning (0.3.7)

The companion boundary to the principle above, stated from the other
side: `core/WorldSpatialContext.js` (0.3.6) and `core/WorldLandmark.js`
(0.3.7) now sit side by side in the same "what's around me" surfaces —
`WorldSpatialContextService`'s `nearbyStructures`/`nearbyLandmarks`, the
compass's contextual markers, the Locations panel — and it would be easy
to let them blur into one flat "stuff nearby" list. They stay two
different questions on purpose. Exploration (terrain zone, hydrology,
nearby structures) answers "what IS here" — a fact about the World any
two replicas derive identically from nothing but position and seed, and
a fact no one authored. A landmark answers "what does this place MEAN
to someone" — a human chose to stand here and say "Old Bridge, nice view
of the river," and that choice is content, not geometry.
`ui/components/LocationsPanel.js` keeps the distinction visible rather
than collapsing it into shared icons on one list: World / Structures /
Landmarks are three separate, clearly labeled sections, and only the
Landmarks section ever offers Add/Edit/Remove — Structures and World
stay exactly as read-only here as 0.2.94 first made them.

### Curation Organizes Content; It Does Not Own Content (0.3.8)

`core/WorldCurationContext.js` groups a World's existing landmarks,
structures, and collaborators into `PlaceContext`s by spatial proximity
alone — a landmark acts as the "nucleus" a nearby `StructurePlacement`
or collaborator gets grouped under, purely because `derivePlaceContexts()`
found it within a fixed radius on this particular call. No group
membership is ever stored: there is no `PlaceContext` id in `World#toJSON()`,
no "which area a structure belongs to" field anywhere a `StructurePlacement`
or `WorldLandmark` carries. Deleting the landmark a group formed around
does not delete the structures that happened to be near it; moving a
structure across a distance boundary does not require updating any
membership list, because there never was one to update — the next
`derivePlaceContexts()` call simply groups differently. This is the same
"derived, never stored" discipline 0.3.6 established for exploration and
0.3.7 deliberately carved an exception out of for landmarks themselves —
curation takes that landmark content and one further ORGANIZES it,
without becoming a second place that content can be edited from.
`WorldNavigationSession#getPlaceContexts()`/`focusPlace()` are thin reads
over this derivation, exactly the "takes session state, calls back into
existing collections, never a second source of truth" shape 0.3.6 and
0.3.7 both already used.

### Exploration Guides Attention, Never Ownership or Mutation (0.3.9)

`core/WorldWelcomeContext.js` composes everything the spatial-content
ladder up to 0.3.8 already produces — a World's terrain/ecology,
structures, landmarks, derived `PlaceContext`s, and live collaborator
presence — into a single arrival-time reading: "I just entered this
World; what should I look at, and why." A `WorldWelcomeContext` and its
`WorldExplorationSuggestion`s are, like `WorldSpatialContext` (0.3.6) and
`PlaceContext` (0.3.8) before them, DERIVED and EPHEMERAL — recomputed
fresh from `deriveWorldWelcomeContext()` on every call, never persisted,
never part of `World#toJSON()`. No `World.welcomeMessage`, `visitCount`,
`lastVisited`, or `recommendedLocation` field exists or ever should:
those would make the World remember something ABOUT a viewer's visit,
which is a different concept entirely from describing what the World
already contains. Choosing a suggested destination is exactly
`focusLocation()`/`focusPlace()`; following an active collaborator is
exactly `focusCollaborator()` — 0.3.9 introduces no third way to move
the camera, and per 0.3.2's own "Camera Navigation Is Never Avatar
Movement" boundary, never teleports the avatar either. This milestone is
also where product language deliberately steps in front of architectural
language: a newcomer sees "Places," "Landmarks," "Buildings," "People,"
never `StructurePlacement`, `WorldSpatialPresence`, or
`WorldCurationContext` — the architecture underneath is exactly as
described above, just never the vocabulary shown. And, as important as
what this milestone composes, is what it deliberately excludes: no
quests, objectives, XP, achievements, rewards, NPC guides, or scripted
missions. Suggestions point at content collaborators already created —
they never tell a newcomer what they are supposed to do.

### Personal Experience Is Not Shared World State (0.3.10)

0.3.9 already drew this line in its own closing paragraph — "No
`World.welcomeMessage`, `visitCount`, `lastVisited`, or
`recommendedLocation` field exists or ever should" — 0.3.10 is that same
boundary given its own home. `core/LocalWorldExperience.js` and
`application/LocalWorldExperienceStore.js` remember exactly one thing:
THIS replica's own camera framing (position, target, a derived heading
snapshot, and active Camera Perspective) the last time THIS user left a
given World, keyed by `worldId` in local storage. Nothing here is a
`Document` field, a `WorldPlacement` field, a `World#toJSON()` field, or
anything ever broadcast — a `LocalWorldExperience` record for Alice
never exists on Bob's replica, and never could, because nothing ever
sends it there. `WorldNavigationSession#saveWorldExperience()`/
`restoreWorldExperience()` are the ONLY read/write path, and both are
purely local: no peer message, no signed advertisement, no gossip
protocol, unlike literally everything else this session synchronizes
(presence, membership, commands, spatial anchors).

Camera Perspective (0.3.2) restores itself the same way it was chosen
in the first place: as an offset from the avatar's CURRENT position
(`core/CameraPerspective.js`), never a raw coordinate frozen at the
moment of the last visit — so returning after the avatar has moved (or
after a future milestone finally lets it persist across sessions) still
frames correctly. The free/orbit camera, having no avatar-relative
formula to fall back on, restores the exact saved `{position, target}`
pair instead — deliberately not reconstructed from a stored heading
angle alone, which would silently discard vertical framing (see
`core/CompassHeading.js`'s own "computed fresh, never stored" principle
for why a heading field here is a display SNAPSHOT, not a live source
of truth to rebuild a framing from).

Deliberately excluded, and named rather than merely absent: persistent
avatar position (a separate, larger question — is an avatar itself
durable World content? — left for its own future milestone), avatar
inventory, personal homes/ownership, bookmarks shared with anyone else,
visit-history synchronization, and any social activity feed ("Bob
visited Market," "Alice built a house") — the durable-vs-ephemeral
boundary `docs/Principles.md` already draws elsewhere between commands
(durable) and activity (ephemeral) stays exactly where it was; 0.3.10
adds no new durable fact about the World, and no new broadcast protocol
at all.

Finally, a local visit record is a UX convenience, never an
authorization claim: `WorldNavigationSession#canEditDocument()` is
re-derived from `worldAuthorizationService` alone on every call, same
as 0.2.95 established, and never consults
`hasVisitedWorld()`/`getWorldExperience()`. Having visited — or even
having previously edited — a World does not mean a since-revoked grant
is still honored on return; membership is always re-checked against
CURRENT World state, never inferred from local history.

### Copying Composes A Blueprint; Forking Creates One (0.4.0)

0.2.81 established Fork: `ForkStructureUseCase` turns a library
`Structure` into a brand-new, independent `Document`, recording
`metadata.parentStructureId` as provenance. 0.4.0 (Structure Composition
& Blueprint Library) adds the other verb a reusable-content architecture
was always missing: Copy. `CopyStructureIntoDocumentUseCase` turns the
same kind of `Structure` into bricks inserted straight into the
CURRENTLY OPEN Document — no new Document, no provenance field, no
`WorldPlacement`. The two use cases read the same input (a `Structure`)
and deliberately produce two structurally different kinds of output:

    Fork:  Structure --fork--> new independent Document   (provenance)
    Copy:  Structure --copy--> current Document's own bricks (composition)

Neither is a variant of the other, and nothing about Copy replaces or
deprecates Fork — a user who wants to keep editing House on its own
still forks it, exactly as 0.2.81 already offered; a user assembling
House + Well + Barn into one larger blueprint now copies each into the
document they're already building, without ever leaving it or losing
undo. `ui/components/BuildLibraryPanel.js` offers both actions on every
structure entry side by side ("Copy Into Document" and "Fork As New
Document") specifically so the distinction is visible at the point of
choice, never buried in a menu.

Composition never introduces a second command class to do it: see
`application/CopyStructureIntoDocumentUseCase.js`'s own header for why
it produces an ordinary `PasteBricksCommand` (0.1.42) — the exact "one
command, many bricks" shape composing many bricks in one atomic,
undoable, replicable step already needed — rather than a parallel
`PasteStructureCommand` that would duplicate execute()/undo()/toJSON()
logic already written, tested, and registered in `CommandRegistry` for
no behavioral difference. A Structure is simply another SOURCE of paste
items, the same relationship `PasteClipboardUseCase` already has to a
copied selection.

A Blueprint (the umbrella term for reusable content this milestone
names) is composed by Copy but never redefined by it: a Structure stays
exactly what `core/Structure.js` has always said it is — pure data, no
world placement, no terrain — and Copying one into a Document changes
only that Document's own bricks. The library a Structure comes from
stays a source, never a dependency: nothing about a copied brick
remembers, needs, or depends on the Structure or the library it came
from ever existing again, the same "provenance only, never a live
dependency" discipline 0.2.81 already established for Fork, applied
here to its logical conclusion — Copy doesn't even keep provenance,
because composing a blueprint was never a claim about where each piece
originated, only about what the current blueprint now contains.

### Extraction Copies A Blueprint; It Never Moves One (0.4.2)

0.4.0 gave composition its first verb, Copy: Structure into Document.
0.4.2 (Structure Extraction & Blueprint Creation) adds the direction
that verb never covered — Document into Structure —
`application/CreateStructureFromSelectionUseCase.js` turning a selection
of bricks a user has already composed back into a brand-new,
independent `core/Structure.js`. The same discipline "Copying Composes A
Blueprint; Forking Creates One (0.4.0)" established for Copy applies
here without exception: extraction is COPY, never move.

After `createStructureFromSelection()` returns, the Document it read
from is exactly what it was before the call — same bricks, same ids,
same geometry. The new Structure's bricks are freshly constructed
instances with freshly minted ids, never references to the Document's
own `Brick` objects, the same "never share an instance with where it
came from" rule `ForkStructureUseCase` already applies when a Structure
becomes a Document; extraction applies it in reverse, when a Document's
selection becomes a Structure. Nothing about the new Structure remembers
which Document it was extracted from, at what position, or when — a
Structure never carries provenance about a Document the way a fork
carries `parentStructureId` about a Structure, because "what shape did I
select" was never a claim about where in some Document it happened to
sit.

Normalization is the one geometry decision this operation owns: the
selection's own minimum X/Z occupied bounds become the new Structure's
local origin, using the exact same `core/SpatialBounds.js#fromBricks()`
derivation `core/Structure.js` and `CopyStructureIntoDocumentUseCase`
already share — never a second bounds calculation invented for this one
caller. Y is deliberately left untouched: a brick's Y is the height its
original author intended (every built-in Structure in
`core/library/VillageLibrary.js` already measures Y from the ground up),
never a footprint edge to normalize away. Selecting the same shape twice
— once composed near the World's origin, once composed far from it —
produces the identical Structure both times: extraction's output
depends only on the SHAPE selected, never on where in the Document that
shape happened to be sitting.

Selection eligibility draws the same boundary 0.2.93 already drew for
World View picking: only an ordinary brick selection can become a
Structure. A `StructurePlacement` selection is a reference to an
entirely different Document — silently dereferencing and flattening it
into "the bricks of the Structure I just extracted" would quietly turn
one operation (copy what I selected) into a different, much larger one
(import and flatten someone else's whole Document) without the user
ever asking for that. `CreateStructureFromSelectionUseCase` refuses
instead, with a message naming exactly why, rather than either
attempting the flatten or silently producing nothing.

### A Personal Library Persists What Extraction Only Returns (0.4.3)

0.4.2 deliberately stopped at `createStructureFromSelection()` returning
a valid, independent Structure — "saving it anywhere" was named as a
separate, larger question rather than folded into extraction itself.
0.4.3 (Personal Blueprint Library) answers it with
`application/LocalStructureLibraryStore.js`, and draws the same boundary
`LocalWorldExperience` (0.3.10) already drew for a different kind of
per-user state:

    LocalWorldExperience:        Personal camera framing is not shared World state.
    LocalStructureLibraryStore:  A personal blueprint is reusable content, not shared World state.

Three consequences follow directly:

- **Structurally separate from `core/World.js`.** A Personal Structure
  Library never holds a `WorldPlacement`, never touches a `Document`, and
  is never signed, published, or replicated — every operation on it is a
  read/write against its own `StorageProvider`-backed records, exactly
  the shape `LocalWorldExperienceStore` already established. Composing or
  forking a Structure still goes through the SAME `CopyStructureIntoDocumentUseCase`/
  `ForkStructureUseCase` a built-in Structure already uses — nothing
  about where a Structure is stored changes what can be done with it.
- **Extraction and persistence stay two different steps, always.**
  `EditorSession.saveStructureToPersonalLibrary(structure)` is called
  SEPARATELY, always after `createStructureFromSelection()` (0.4.2,
  unmodified) has already returned a valid Structure — never one call
  that both extracts and saves. This is the same restraint "Extraction
  Copies A Blueprint; It Never Moves One (0.4.2)" already applied to
  keeping extraction itself single-purpose, extended one step further:
  0.4.2 built the pure observation, 0.4.3 adds the pure persistence step
  after it, and neither absorbs the other's responsibility.
- **Deletion has no live dependency to break.** By the time a Structure's
  bricks are inside a Document — via Copy (0.4.0) or Fork (0.2.81) —
  they are ordinary bricks, fresh instances with fresh ids, structurally
  incapable of noticing their source Structure was ever removed from the
  library. Deleting a personal Structure therefore never affects a World
  that previously used it; this was already true architecturally (the
  same copy-never-reference guarantee `ForkStructureUseCase` and
  `CopyStructureIntoDocumentUseCase` both already provide), and
  `tests/PersonalStructureLibrary.test.js`'s flagship proves it directly
  rather than by inspection: compose into two independent Documents,
  delete from the library, assert both Documents are byte-identical to
  before the deletion.

Also local, not yet synchronized: a Personal Structure Library is
per-device state, exactly like `LocalWorldExperience` — a user's "My
Structures" on desktop and on a tablet can legitimately differ today.
Making personal blueprints follow a user across devices is a deliberate,
separate, later milestone, not a sixth replication mechanism smuggled in
alongside World/Publication/PlacementRecord/SpatialIndex/Presence.

### Library Membership Is Not Structure Identity (0.4.3)

`core/Structure.js`'s own fields stay exactly what 0.2.81 first defined:
`id`, `name`, `category`, `tags`, `description`, `bricks`. 0.4.3
introduces a second place a Structure can live — the user's own Personal
Structure Library, alongside the built-in Village Library — without
adding a single field to `Structure` itself to say which one it's in.
There is no `libraryId`, no `personal: true` flag, nothing that would let
a Structure carry an opinion about its own container.

This preserves a property 0.4.0 through 0.4.2 already built toward: the
SAME Structure can move freely between built-in, personal, forked, and
composed contexts without ever knowing where it came from or where it
currently sits. `CreateStructureFromSelectionUseCase` returns a Structure
identical in shape whether or not it's ever saved; `LocalStructureLibraryStore`
stores whatever independent Structure value it's handed, asking it
nothing about its origin; `CopyStructureIntoDocumentUseCase` and
`ForkStructureUseCase` accept a Structure from either library, or from
neither, with zero branching on which one it came from. A Structure's
identity is what it IS — its own bricks and metadata — never where it
happens to be catalogued today.

### A Structure Is A Reusable Spatial Composition, Never A Synonym For "Building" (0.4.4)

`core/Structure.js`'s own header has said it since 0.2.81: "a Structure
is a reusable, named collection of Bricks." Nothing about that
definition mentions walls, a roof, or an interior — it was never
narrower than what it actually says, but five structures shipping
without a single wall makes the claim concrete rather than merely true
in principle. `village:market_stall`, `village:pavilion`,
`village:village_gate`, `village:fence_segment`, and `village:dock`
(`core/library/VillageLibrary.js`, 0.4.4) each place zero
`core:wall_1x3` bricks — a canopy on two columns, an open gazebo, two
towers around a passage, a rail on two posts, a platform on stilts.

This matters beyond variety for its own sake. The Personal Blueprint
Library (0.4.3) lets a user extract and keep any selection of bricks
they've composed — a porch, a garden wall, a section of fence — and
until this milestone, every built-in precedent for "what does a good
Structure look like" was a fully enclosed dwelling or civic building.
Five deliberately non-building structures give a user five concrete
answers to "can I extract just THIS part," not only "can I extract a
whole house." A Structure was never required to look like a building;
0.4.4 is where the library stops implying otherwise.

### Buildable Things Share One Placement Experience (0.4.5)

Bricks and Structures may have different internal representations and
commit semantics, but selecting either from the Build Library enters
the same Place interaction: preview, transform, validate, and commit.
Architectural differences should not become unnecessary UX differences.

Before this milestone, that internal distinction leaked all the way to
the click: a Brick's card was one click away from a live ghost preview,
while a Structure's card offered two competing buttons — "Copy Into
Document" and "Fork As New Document" — neither of which was named
"Place," and the interactive preview those buttons already led to
(0.4.1) was hiding behind a verb ("Copy") that never suggested it. The
user does not experience `PlaceBrickCommand` versus
`CopyStructureIntoDocumentUseCase`; they experience "I want to put this
into my Document." `ui/components/BuildLibraryPanel.js` now treats a
structure card exactly like a brick card at the click boundary — the
whole card is the Place target, emitting `place-structure` the way a
brick emits `place` — and tucks Fork (a real, deliberately different
operation — see "Copying Composes A Blueprint; Forking Creates One
(0.4.0)") into a small secondary menu where it can no longer compete
with Place for the primary gesture.

This is a UI-boundary rename, not an architecture rewrite, and the two
are kept deliberately distinct:

- **User intent** ("Place House") is a vocabulary word chosen for what
  the person clicking experiences.
- **Mutation semantics** (`CopyStructureIntoDocumentUseCase`: transform
  a Structure into bricks and insert those bricks) describe what
  actually happens to the Document.

`EditorSession#beginStructureComposition()` keeps its own name — it
still only ever arms `StructureCompositionTool`, never touches the
Document itself — because renaming it would suggest the mutation
changed when only the button above it did. The same restraint that kept
`CopyStructureIntoDocumentUseCase` and `ForkStructureUseCase` as two
separate classes in 0.4.0 (rather than one "paste a structure" class
branching on a flag) keeps `PlacementTool` and `StructureCompositionTool`
as two separate, focused Tool implementations here: what's being placed
(one Brick vs. a Structure's whole brick set) and what gets committed
(`PlaceBrickCommand` vs. one `PasteBricksCommand`) genuinely differ, so
each keeps its own small class rather than being forced into one
tool that branches on kind internally. What unifies is the LIFECYCLE
shape both already shared — activate/select, pointer-move previews,
`R`/`Shift+R` rotates, a validated click commits, one command, one undo
step — made visible at the one place a user actually experiences it:
the Build Library's own click target.

This also draws a line worth keeping visible: `StructurePlacement` (the
World-level "reference to another Document," 0.2.90) is placement of a
different kind of thing — a live reference, not a composition — and
stays its own operation with its own tool
(`application/tools/StructurePlacementTool.js`), never folded into this
unification. "Buildable Things Share One Placement Experience" describes
the Build Library's two catalogs (Bricks, Structures) — the things a
Document is built FROM — not every spatial placement this engine has.

### A Blueprint Package Is Portable Data, Never A Live Dependency (0.4.6)

The Personal Structure Library (0.4.3) gave a Structure somewhere to
live; it never gave it a way to leave. A `LocalStructureLibraryStore` is
StorageProvider-backed, and StorageProvider is per-device — Alice's "My
Structures" and Bob's are, by construction, two different libraries that
have never heard of each other. 0.4.6 closes that gap with an EXPORT/
IMPORT boundary, deliberately not a live one:

    Alice's Structure --export--> Blueprint Package --import--> Bob's Structure

A Blueprint Package (`application/BlueprintPackage.js`) is plain,
self-contained JSON — a Structure's own `id`/`name`/`category`/`tags`/
`description`/`bricks`, wrapped in a small versioned envelope. It is not
a pointer to Alice's library, her device, or her session. The moment
Alice's export finishes, the package owes nothing further to where it
came from: deleting Alice's original Structure, renaming it, or her
device going offline forever has zero effect on a package already
written to disk, or on anything Bob later imports from it. Compare this
to what a `StructurePlacement` (0.2.90) deliberately IS — a live
reference into another Document, meaningful only as long as that
Document resolves — and the boundary is exactly the one this
milestone's own design conversation drew:

    Structure --export/import--> Blueprint Package    — portable, independent, never a World citizen
    Structure --publish-->        World                — 0.2.9x's own, separate question

**Untrusted input, validated before anything is built.** A blueprint
file may have crossed devices, been hand-edited, or arrived from a
stranger — it is never trusted the way a Structure already living in the
current process's own registry is. `application/BlueprintImportValidator.js`
answers exactly one question, "is this package well-formed?", and is
strictly separate from `application/ImportBlueprintUseCase.js`, which
only ever constructs a Structure from an ALREADY-validated package — the
identical split `identity/IdentityImport.js`/`identity/IdentityRecovery.js`
already draw for a portable identity package (0.2.48), applied here to
data that carries no secret at all. A blueprint is DATA, never
executable behavior:

    Import -> validate -> construct Structure -> save to personal library    — always
    Import -> execute arbitrary command                                     — never

**Every id crossing the boundary is fresh.** `ImportBlueprintUseCase`
mints a brand-new structure id and a brand-new id for every brick,
regardless of what the package itself claims — the same "an id crossing
a trust boundary always regenerates" rule `ForkStructureUseCase` (0.2.81)
and `CreateStructureFromSelectionUseCase` (0.4.2) already apply to
forking and extraction respectively. This is not merely hygiene: it is
what guarantees importing the same package twice — even into the same
library — always produces two independent entries, never a silent
overwrite of one by an id collision neither side asked for.

**Indistinguishable once imported.** An imported Structure is not a
second kind of "My Structures" entry. It renders through the same
`BuildLibraryPreview`, enters the same Place lifecycle (0.4.5), and
composes/forks through the exact same `CopyStructureIntoDocumentUseCase`/
`ForkStructureUseCase` paths as anything extracted locally or shipped in
`core/library/VillageLibrary.js`. Nothing downstream of import ever asks
"was this imported?" — the same "library membership is never part of a
Structure's own identity" rule 0.4.3 already established for built-in
versus personal now extends to imported without a single new field or
branch.

### Users Name Places; The World Derives Geography From Names (0.5.0)

0.3.7 drew one deliberate exception into 0.3.6's "exploration is
derived, never stored" rule: a `WorldLandmark`, a named POINT a human
plants because nothing about terrain, seed, or geometry can invent a
place's MEANING on its own. 0.5.0 (World Regions & Decentralized Place
Naming) extends that exact same exception from a point to an AREA —
`core/WorldRegion.js` — and then builds the one thing a point never
needed: a way for many named areas to combine into a place someone can
actually read, like *"Willow Village · Green Valley · Kingdom of
Eldoria."* The rule this milestone commits to, stated plainly:

> Users define the names; the World only ever DERIVES geographic
> context from names that already exist. There is no central naming
> authority, no procedurally "correct" name for a piece of ground, and
> no requirement that two people's names for overlapping ground ever be
> reconciled into one answer.

**Geometry decides containment; authorship never does.**
`core/WorldRegionGeography.js#regionsContaining()` answers "what named
area(s) is this position inside" using nothing but each region's own
center and radius — `distanceXZ() <= radius`, sorted smallest-first.
This function NEVER reads `parentRegionId`, and that omission is the
entire point. Consider Alice's authored hierarchy — Kingdom of Eldoria
containing Green Valley containing Willow Village, each one naming the
one before it as `parentRegionId` — sitting alongside Bob's completely
unrelated "Northern Settlement," drawn independently over some of the
same ground, naming no parent at all. Both are ordinary `WorldRegion`
content; both are equally "correct." A viewer standing where all four
overlap sees `describePlace()` produce *"Willow Village · Northern
Settlement · Green Valley · Kingdom of Eldoria"* — Bob's unrelated
region slots in purely by its own radius, between Alice's village and
her valley, with neither author having coordinated, asked permission, or
needing the system to arbitrate whose name for this ground is real. This
is deliberately WEAKER than a real hierarchy — a real GIS system would
insist a region belongs to exactly one parent — and the weakness is what
makes decentralized naming actually work: nothing about creating
"Willow Village" requires Green Valley to exist first, requires anyone's
approval, or breaks the moment two authors' geography disagrees.

**`parentRegionId` is informational, never load-bearing.** It exists so
a future UI could ask "show me everything Alice filed under Green
Valley," via `childRegions()` — and nothing else in this codebase
consults it. It is never validated against an actually-existing region
at creation time, and removing a region a child still names as its
parent leaves that reference simply dangling — the same graceful-
absence posture `application/WorldLocationDirectory.js` already takes
toward a removed `StructurePlacement`, never a cascade delete, never an
integrity error. A region with no parent at all is exactly as valid as
one nested three levels deep; hierarchy is a convenience a UI MIGHT
offer, never a requirement the geometry depends on.

**Named content stays separate from derived content, on purpose.**
`core/WorldSpatialContext.js`'s new `placeName` (from `containingRegions`)
sits deliberately apart from its existing `description` getter (terrain
zone, hydrology, nearest structure — pure derivation, byte-for-byte
unchanged by this milestone) rather than merged into one string. The
distinction 0.3.7's own principle already drew between "what IS here"
(a fact every replica derives identically from seed and position) and
"what does this place MEAN to someone" (a human's authored choice) holds
exactly as true for an area as it did for a point — this milestone adds
a second axis of that same boundary, never collapses the first one.

**Procedural naming stays a presentation option, never a stored fact.**
The design conversation that proposed this milestone named procedural
fallback naming (deterministic "Sector 12"-style labels for unnamed
ground) as a legitimate idea — and, just as deliberately, this milestone
does not build it. A position outside every named region has `placeName
=== ''`; `WorldNavigationSession#getCurrentPlaceName()` falls back to
the EXISTING `describeLocation()` reading (0.3.8's nearest-landmark/
structure heuristic) rather than inventing a new placeholder name. If a
procedural fallback is ever built, the boundary this principle insists
on is the same one 0.3.9 already drew for exploration suggestions:
presentation only, NEVER written back into `WorldRegion` or `World#toJSON()`
as if a human had authored it. A generated name a World merely DISPLAYS
and a name a human CHOSE must never become indistinguishable in storage,
or "users name places" quietly stops being true.

**No naming authority beyond ordinary World membership.** `WorldRegion`
carries `authorIdentityId` for provenance only — exactly the same
posture 0.3.7 already established for `WorldLandmark`. There is no
`officialName`, `verifiedName`, `canonicalName`, or `ADMIN_NAMING_AUTHORITY`
concept anywhere in this milestone: any identity holding EDIT access to
a World may create, rename, resize, or remove any region in it, the same
`WorldNavigationSession#canEditDocument()` gate every other World-content
mutation already consults. Introducing a governance layer over WHOSE
names count was named directly, in the original design conversation, as
something to deliberately not build yet — a World's geography stays
purely community-authored, with no built-in concept of a "more correct"
namer.

### A World Map Is A Derived View, Never A Second World (0.5.1)

0.5.0 gave a World's geography a NAME — `WorldRegion`, `regionsContaining()`,
a breadcrumb someone can read. It deliberately stopped short of showing
anyone that geography — no rendered boundary, no minimap, "a renderer
pass for visualizing region extents directly is future work, sized on
its own." 0.5.1 (World Maps & Geographic Navigation) is that renderer
pass, built on top of every derivation this codebase already trusts
rather than inventing a parallel one. The rule this milestone commits
to, stated plainly:

> A map is a PROJECTION of World content that already exists, computed
> fresh every time it's opened. It is never a second store of what a
> World contains, and nothing a viewer does TO the map — panning,
> zooming, clicking empty space — ever reaches the World, the 3D camera,
> or even the other viewers in it.

**`core/WorldMapProjection.js` is arithmetic, not a renderer.** It knows
nothing about SVG, Vue, or the World's own content — only how to turn a
`{ x, z }` and a viewport (`center`, `span`, `width`, `height`) into a
2D point, and back. This is exactly the same discipline
`core/WorldSpatialContext.js` and `core/WorldRegionGeography.js` already
hold: derivation lives in `core/`, stays pure, and stays trivially
testable without a DOM. Because the projection has no opinion on units
or on WHO is asking, the same math backs a full-screen map panel today
and could back a minimap or a thumbnail tomorrow with zero duplicated
geometry — see that file's own header.

**The map's DATA source is `WorldNavigationSession#getMapContent()`, the
exact same gather every other World-wide read in this codebase already
performs** — `_collectRegions()`, `application/WorldLocationDirectory.js#list()`.
Deliberately WORLD-WIDE, never streaming-radius-limited: `core/WorldSpatialContext.js`'s
`nearbyLandmarks`/`nearbyStructures` answer "what's near me right now,"
a genuinely different question from "what does this whole World
contain," and a map exists to answer the second one. A landmark 5,000
meters from the viewer is invisible to `nearbyLandmarks` and perfectly
visible on the map — that's not an inconsistency between the two, it's
the map doing the one job `WorldSpatialContext` was never built for.

**Panning and zooming are LOCAL VIEWER STATE, weaker even than "never
changes the World."** The design conversation that proposed this
milestone was explicit: *"Clicking the map never changes the World. It
only changes the local camera."* `ui/components/WorldMapPanel.js` goes
one step further than that sentence requires — clicking empty map space
doesn't even reach the 3D camera, it only re-centers the flat map view
itself (`unprojectPoint()` converting a click back to a world position,
purely presentational state the component owns). Only clicking an
actual place or person emits `focus-location`/`focus-collaborator`,
routed by the host straight to the SAME `session.focusLocation()`/
`focusCollaborator()` every other navigation entry point already uses
— `goHome`, the Locations panel, the Explore panel's suggestions, and
now the map. No second camera mechanism, no second navigation verb.

**Presentation tiers are labels, never geometry, exactly like
`RegionKind` itself.** `regionPresentationTier()` lets a `CONTINENT`
draw a bigger label than a `NEIGHBORHOOD` on the map — a rendering
weight only, the same "labels only, never behavior" restraint
`core/RegionKind.js` already documents for the kind vocabulary these
tiers are derived from. Nothing about a region's actual radius, its
containment math, or its authority to exist changes because of what
tier its `kind` happens to fall into.

**The map is refreshed on the same cadence as everything else it sits
beside, never a separate polling loop.** `mapContent` in
`ui/views/WorldView.js` is re-read inside the SAME `refreshSpatialUI()`
tick that already refreshes `cameraPosition`/`compassHeading`/
`spatialContext` — one clock, one source of truth for "what does the
live World currently look like," never a bespoke timer for the map
alone. What IS deliberately NOT re-derived on that cadence is the
viewer's own pan/zoom choice (`centerX`/`centerZ`/`span` in
`WorldMapPanel`'s own `data()`) — content refreshing every few seconds
must never silently yank the map back to "centered on me" while someone
is looking at the far side of a World.

### A Name Is A Claim, Not A Fact (0.5.2)

0.5.0 gave a World's geography a NAME, authored the same way every other
piece of World content is: whoever holds EDIT on the World may create,
rename, or remove a `WorldRegion`. That was deliberately the SIMPLEST
possible answer, and the design conversation that closed out 0.5.1 named
exactly what it leaves unsolved: what happens when Alice, Bob, and Carol
each have a genuine, good-faith opinion about what the same ground
should be called, and none of them holds — or wants — editorial
authority over anyone else's? 0.5.2 (Place Naming & Naming Claims)
answers that by drawing a boundary the design conversation stated
plainly:

> A `WorldRegion`'s own name is objective shared geometry's label —
> World content, exactly as 0.5.0 left it. A `PlaceNamingClaim` is a
> subjective, signed, published ASSERTION about what a region should be
> called — never World content, never authoritative, and never
> reconciled into one "correct" answer. A client's own naming VIEW is a
> derived reading of whatever claims it happens to know about — a
> ranking by confidence, never a claim of authority.

**A claim never touches the region it's about.** `core/PlaceNamingClaim.js`
carries a `regionId` it refers to, but is never stored inside
`World#toJSON()`, never travels through a Command, never touches
undo/redo, and is never propagated by
`application/WorldCommandPropagationUseCase.js`. Publishing "Riverbend"
about Alice's own "Willow Village" changes nothing about the region
itself — `region.name` stays exactly what it was, forever, regardless of
how many claims disagree with it or how strongly. See this milestone's
own capstone test (`tests/PlaceNamingClaims.test.js`, Section H) for the
proof: Alice's own claim for her own region loses 1-2 to Bob and Carol's
"Riverbend," and `region.name` never moves.

**No naming authority beyond a signature over one's own claim.** Unlike
`WorldRegion` (0.5.0's own "any EDIT member" posture) or a World edit
grant (0.2.98's owner-only posture), publishing a `PlaceNamingClaim`
requires NEITHER EDIT access to the region's World NOR membership in it
at all — the only thing `application/PlaceNamingClaimUseCase.js#publish()`
ever checks is "can this identity sign at all." This is intentional and
load-bearing: the entire point of a naming CLAIM, as opposed to a
naming EDIT, is that Bob's opinion about Alice's region needs no
permission from Alice. See `core/PlaceNamingClaim.js`'s own header, and
contrast this directly with 0.5.0's own "No naming authority beyond
ordinary World membership" principle above — 0.5.2 is a strictly WEAKER
authority requirement than 0.5.0 already was, on purpose.

**A claim is NEVER tolerated unsigned.** `SignatureType.PLACE_NAMING_CLAIM`
(`core/Signature.js`) is REQUIRED, the same discipline
`WORLD_EDIT_AUTHORIZATION_GRANT` already established — see
`identity/LocalAuthorizationVerifier.js#verifyPlaceNamingClaim()`, which
additionally requires the signer to equal the claim's own
`authorIdentityId` (never some separate "granting" identity — a naming
claim has exactly one party to it). This is what makes
`core/PlaceNamingView.js`'s own distinct-author scoring meaningful at
all: "3 people call this Green Valley" is worth exactly nothing as a
signal if any one of those "3" could be the same author copy-pasting
under a fabricated name.

**Confidence, never authority.** `core/PlaceNamingView.js#namingView()`
ranks names by the number of DISTINCT identities who have claimed each
one — an author who republishes the same name five times contributes
exactly one point, the same as an author who published it once (see
that module's own header, and `tests/PlaceNamingClaims.test.js` Section
C's own regression proof). Ten publications of "Green Valley" from ONE
identity never outrank three publications of "Emerald Valley" from
three DIFFERENT identities. There is still no protection against one
identity minting many distinct `did:key` identities to inflate a
name's score — real Sybil resistance (reputation, endorsement, proof of
distinct personhood) is explicitly future work, not this milestone's
(see docs/Roadmap.md, 0.5.2's own "Deliberately excluded" list) — but
"one author, one vote no matter how many times they shout" is the floor
this milestone commits to, and it is a floor, never presented as a
ceiling: nothing here computes or displays a "winner," only a ranking a
viewer can inspect and override.

**A third, genuinely local concept: the preference, never a claim.**
`application/LocalNamePreferenceStore.js` is deliberately NEVER signed,
NEVER stored in a `PlaceNamingClaim`, and NEVER leaves the device it was
set on. Alice can locally prefer "Green Valley" while Bob locally
prefers "Emerald Valley" for the exact same region on the exact same
shared World, and neither preference is visible to, or corrects, the
other's — proven directly in `tests/PlaceNamingClaims.test.js` Section F
(two identities sharing one `storageProvider`, each seeing only their
own preference) and Section H's own capstone. This is the THIRD naming
concept the original design conversation named, distinct from both a
`WorldRegion`'s own `name` and a published `PlaceNamingClaim`:

```text
Local name                — "my name for this place" — personal, never
                             published.
Published naming claim    — signed, publicly discoverable, never
                             authoritative.
Community-preferred name  — a client's own DERIVED ranking of whatever
                             claims it happens to know about.
```

**`getDisplayPlaceName()` is presentation, composing all three layers
without ever collapsing them into one stored fact.**
`application/WorldNavigationSession.js#getDisplayPlaceName()` reads, in
order, a viewer's own local preference, then the top-ranked claimed
name, then falls back to the region's own `WorldRegion.name` — the exact
0.5.0 behavior every pre-0.5.2 caller already saw. Nothing about this
priority order is written back anywhere; calling it twice in a row with
a different claim landscape can return a different string both times,
exactly as it should for a purely derived read. This mirrors
`core/WorldSpatialContext.js`'s own `placeName`/`description` split
0.5.0 already established: what a region a human explicitly authored
INTO the World says, versus what a client merely DISPLAYS, must never
become indistinguishable in storage.

**Not yet a decentralized exchange — that boundary is drawn on purpose.**
`application/LocalPlaceNamingClaimStore.js` persists and lists claims
for whichever World this replica happens to have; it never gossips one
to a peer, never fetches one from anywhere else, and never reconciles
two replicas' independently-published claims into one. This is
identical in spirit to 0.5.0's own "not a real-world GIS model"
restraint: establish the DATA MODEL first, prove it in isolation, and
size the actual decentralized transport as its own future milestone —
see docs/Roadmap.md, 0.5.2's own "Deliberately excluded" list.

### Naming Exchange Distributes Claims; It Never Establishes Truth (0.5.3)

0.5.2 built the naming MODEL and explicitly stopped at the exact
boundary its own design conversation named: two replicas that each
independently published a claim would show two different naming views
until "some future transport lets them exchange claims." 0.5.3
(Decentralized Place Name Exchange) is that transport, and its entire
design rests on one sentence, stated plainly by the design conversation
that asked for it:

> Naming exchange DISTRIBUTES claims; it never ESTABLISHES truth.

`application/PlaceNamingClaimExchange.js` proves this the same way
every prior milestone in this section proved its own restraint: by what
it deliberately never does. It never calls `core/PlaceNamingView.js#namingView()`,
never compares one claim's "confidence" against another's, and never
decides which of two disagreeing names a viewer should prefer. Every
one of those questions was already, correctly, answered by 0.5.2, and
answering it twice — once in the naming model, once in the exchange
layer — is exactly the kind of duplicated authority this architecture
has refused since 0.5.0's own "geometry decides containment; authorship
never does." Exchange only ever moves a claim, unchanged, still
carrying its own signature, from one replica's store to another's.

**Validate, construct, verify — always in that order, before anything
is persisted.** `PlaceNamingClaimExchange#importClaim()` follows the
exact same three-step discipline `application/ImportBlueprintUseCase.js`
already established one domain over for a Blueprint: a package is
untrusted input the moment it crosses a device boundary, so
`application/PlaceNamingClaimPublicationValidator.js` checks its SHAPE
first, `core/PlaceNamingClaim.js#fromJSON()` constructs a real claim
second, and only then does `identity/LocalAuthorizationVerifier.js#verifyPlaceNamingClaim()`
ask whether it is actually AUTHENTIC. "Well-formed" and "signed by who
it claims to be signed by" are never conflated into one check anywhere
in this codebase, and this milestone keeps that discipline rather than
inventing a shortcut for naming claims specifically.

**A claim's own `id` is its exchange identity — no second, derived
content hash needed.** The design conversation that proposed this
milestone suggested deriving a claim's identity from a hash of its
signed fields for deduplication purposes. This codebase already had a
simpler answer: `core/PlaceNamingClaim.js`'s own `id` is already bound
into the signed payload (`getSigningDescriptor()`'s own `payload.id`),
so a claim's id cannot be forged to a DIFFERENT payload without the
signature failing to verify — the exact property a derived content hash
would have existed to provide, already present for free. See
`application/LocalPlaceNamingClaimStore.js#has()`'s own header for why
this is a genuinely different question from that store's own
`save()`'s "never deduplicate by (regionId, name, author)" rule: that
rule is about the SAME author republishing a name under a brand-NEW
claim id (still two legitimate, distinct claims); `has()` answers "has
this EXACT claim, by id, already arrived," which is the only question
importing the SAME publication two, three, or a hundred times (the
ordinary cost of any real gossip transport) ever needs answered.

**`receivedAt` is the one fact no signature could ever cover — which is
exactly why it lives outside the claim.** The design conversation asked
for freshness metadata, and drew its own careful distinction: not on
the signed claim itself, where a second "publishedAt" would just be an
unsigned, spoofable shadow of `claim.createdAt` (already the real,
trustworthy signed timestamp); only `receivedAt` — "when did THIS
replica first learn about this" — is genuinely new, because by
definition no author could ever sign that in advance.
`application/LocalPlaceNamingPublicationLog.js` keeps it, first-seen-
wins, and 0.5.3 deliberately never reads it back into a ranking. This
mirrors `application/LocalNamePreferenceStore.js`'s own 0.5.2 restraint
exactly: preserve a genuinely local fact, but never let its mere
existence quietly become a second, competing naming authority.

**The first transport is deliberately boring, on purpose.** Every
package `application/PlaceNamingClaimExchange.js` produces or consumes
is plain, portable JSON, moved by hand today — a file export, a file
import, the exact same shape `application/BlueprintPackage.js` already
proved out for a Structure. This is 0.4.6's own restraint applied a
second time: prove the EXCHANGE BOUNDARY works, in isolation, before
building any real transport on top of it. A future WebRTC peer
exchange, rendezvous relay, or DHT plugs into `exportClaim()`/
`importClaim()` exactly as it stands today — the naming model
underneath never has to change, and neither does this class's own
public surface, for any transport that comes after it.

### Geographic Similarity Suggests Identity; It Never Mutates Identity (0.5.4)

0.5.2 and 0.5.3 each independently named, in their own "Deliberately
excluded" lists, the exact same open question: a `PlaceNamingClaim`'s
`regionId` is an exact reference to ONE `WorldRegion`, so two authors'
regions covering the same real ground but created independently are,
for naming purposes, still two separate places. 0.5.4 (Place Identity &
Geographic Claim Resolution) closes that gap, and the design
conversation that proposed it was explicit about the one trap to avoid:

> Don't make `WorldRegion A == WorldRegion B`. Don't modify either
> World. Geographic similarity SUGGESTS identity; it never MUTATES
> identity.

**A fingerprint match is CANDIDACY, never proof.** `core/PlaceIdentity.js#derivePlaceIdentity()`
returns exactly one word for its verdict — `candidate` — and that word
is used EVERYWHERE in this milestone's own code and comments in place
of "same," "matched," or "identical," because none of those words are
ever true here. Two regions whose `core/PlaceFingerprint.js` fingerprints
are byte-identical are worth showing a human as a SUGGESTION; they are
never worth acting on automatically. See this milestone's own
docs/Roadmap.md entry, "Candidacy, never proof."

**No region is ever merged, and no `WorldRegion` is ever mutated by
this milestone — full stop.** `core/GeographicPlaceResolution.js` never
calls `World#addWorldRegion()`, `updateWorldRegion()`, or any Command;
it never even receives a `World` — only plain region-like objects and
claims a caller already assembled. `tests/PlaceIdentity.test.js`
Sections D and F both include a direct assertion that a `WorldRegion`'s
own `.name` is byte-identical before and after every resolution this
milestone performs. This is 0.5.0's own "hierarchy is geometric, never
authored" restraint (`parentRegionId` is informational, never consulted
by `regionsContaining()`) applied one level up: place IDENTITY is
geometric-candidate-only, never authored into certainty by an
algorithm, exactly the same way region CONTAINMENT was never authored
into hierarchy.

**Quantization absorbs noise; it never manufactures agreement.**
`core/PlaceFingerprint.js#deriveFingerprint()` rounds a region's center
and radius to the nearest multiple of a small quantum (1 world unit by
default) specifically so two authors' independently-typed geometry
(100.00001 vs. 100.00002) fingerprints identically, while two
genuinely different, intentionally-authored values (100 vs. 180) never
do. The quantum is deliberately TIGHT: this milestone would rather
under-match — two authors describing the same ground with meaningfully
different geometry stay separate candidates — than over-match. See
`tests/PlaceIdentity.test.js` Section A for the direct noise-absorption
proof, and Section B for the full adversarial matrix (same center/
different radius, same radius/different center, nested regions,
overlapping-but-different-center, and completely unrelated regions) all
proving the SAME conservative bias.

**An exact-key partition, not a similarity-threshold cluster — because
that is what makes it an honest equivalence relation.**
`core/PlaceIdentity.js#groupRegionsByPlaceIdentity()` groups regions by
whether their QUANTIZED fingerprints are byte-identical, never by a
pairwise "close enough" comparison chained across a list. A threshold-
based approach would not necessarily be transitive (A close to B, B
close to C, but A not close to C is a real failure mode for any
tolerance-based clustering), which would make a grouping's result
depend on the order regions happened to be compared in — exactly the
kind of replica-dependent, non-deterministic outcome this entire
architecture has refused since `core/PlaceNamingView.js#namingView()`'s
own deterministic tie-breaks. Exact-key equality sidesteps the problem
entirely: it is reflexive, symmetric, and transitive BY CONSTRUCTION,
proven directly in `tests/PlaceIdentity.test.js` Section B rather than
merely assumed.

**`kind` is a hard gate, not a soft signal — a real, named limitation,
not an oversight.** Two regions with identical center and radius but a
different `kind` label (a Village one author calls a Village, the same
ground another author calls a Town) do NOT fingerprint-match today. This
trades a real false-negative cost (genuinely-same-ground authors who
happened to disagree about administrative granularity won't see their
names combined) for the same conservative "never over-match" bias
described above, and is named directly as future refinement in
docs/Roadmap.md's own "Deliberately excluded" list rather than solved
here with an unvalidated weighting scheme.

**Combined ranking is ADDITIVE, never a replacement for the per-region
view 0.5.2 already built.** `core/GeographicPlaceResolution.js` produces
a NEW, separate ranked view spanning every region in a candidate group
— it never replaces, filters, or reorders what `core/PlaceNamingView.js#namingView()`
already computes for one region alone. `ui/components/PlaceNamingPanel.js`
shows both, clearly separated and labeled: "Community Names" (this
region's own claims, exactly as 0.5.2 left it) and "Community Names
Across These Places" (the new, combined view), with an explicit "Other
Geographic Descriptions" section captioned "each stays its own separate
region" — a human reading the panel is never left to guess which
question either number is actually answering.

**Not yet explicit human confirmation — that boundary is drawn on
purpose, the same way 0.5.2 drew its own around exchange.** The design
conversation that proposed this milestone also sketched a stronger,
SEPARATE future concept — a signed `PlaceEquivalenceClaim`, "I
explicitly confirm these two regions describe the same place,"
geometry-plus-human-assertion rather than geometry alone. This
milestone deliberately proves CANDIDACY works first, in isolation,
before anything is built on top of it — the identical "data model
first" discipline 0.5.2 already established for naming claims
themselves, and 0.5.0 established before that for regions.

### A Geographic Place Is A Derived View, Never A Fourth Stored Object (0.5.5)

0.5.4 proved a client can group regions into geographic-place
candidates and rank their names together, but the result only ever
existed as a shape one naming panel, already scoped to a single region,
knew how to read. 0.5.5 (Geographic Place Directory & Identity UX) gives
that result somewhere to live for a viewer to actually browse — and
draws its whole design around one sentence from the design conversation
that proposed it:

> A geographic place is a DERIVED VIEW over descriptions, not a new
> object that owns them.

`core/GeographicPlaceView.js` is instantiated fresh on every read and
thrown away — there is no `WorldGeographicPlace` anywhere in
`core/World.js`, no cache keyed by fingerprint, nothing this milestone
persists at all. The pipeline it closes is now four steps, and the
FOURTH is presentation only:

```text
WorldRegion -> PlaceFingerprint -> PlaceIdentity -> GeographicPlaceView -> UI
```

**A representative region is a presentation choice, never an
authority.** `buildGeographicPlaceView()` picks `group.regions[0]` —
already sorted by `${worldId}:${id}`, the exact tie-break
`core/GeographicPlaceResolution.js#buildPlaceGroup()` established one
milestone earlier — to decide which region's label a directory row
shows, or which region's geometry a "Show on Map" click centers the
camera on. It decides NOTHING else. Nothing in this pipeline ever
writes "this is the real one" back into a `WorldRegion`, and two
replicas holding the exact same regions always pick the exact same
representative, for the same reason `core/PlaceIdentity.js#
groupRegionsByPlaceIdentity()`'s own group ordering already had to be
deterministic: a presentation choice that disagreed across replicas
would look, to a viewer, exactly like a decision the architecture
never actually made.

**A directory's ordering is a browsing convenience, never a ranking of
importance.** `core/GeographicPlaceDirectory.js` sorts alphabetically
by `displayName`, deliberately NOT by the fingerprint-key order
`groupRegionsByPlaceIdentity()` itself uses (that order exists purely
so replicas agree on GROUPING, and reads as arbitrary to a person
browsing by name) and deliberately NOT by description count, World
count, or contributor count either — any of those would quietly imply
"more descriptions matters more," a claim this architecture has never
made and has no basis to make. Alphabetical is the one order with
no opinion about which place is more important than another.

**"Why grouped together?" explains evidence that already existed; it
manufactures none of its own.** `describeCandidacyReasons()` is a
static, four-item checklist — same fingerprint, same center, same
radius, same kind — shown for any multi-region place, paired with
`CANDIDACY_CAVEAT`: "This is a geographic candidate, not a verified
identity." There is deliberately no confidence score, no percentage, no
"87% likely the same place." A number would claim a precision this
architecture has never had; the whole reason 0.5.4 committed to a
single boolean (`candidate`) rather than a similarity score was to
avoid manufacturing exactly that false precision, and 0.5.5's job is to
make that existing restraint VISIBLE to a person, not to quietly
undo it with a number in the UI layer instead.

**Read-only, on purpose — publishing stays where 0.5.2 put it.**
`ui/components/GeographicPlacePanel.js` shows names, descriptions, and
the candidacy checklist; it has no publish or retract action of its
own. Its "Names" button reopens the EXISTING `PlaceNamingPanel` for one
region rather than rebuilding that machinery a second time in a
world-wide surface — the same restraint that kept 0.5.4's own combined
ranking additive alongside the per-region view instead of replacing it,
applied here one more level up.

### A Geographic Place Highlights Existing Geometry; It Never Draws New Geometry (0.5.5)

`ui/components/WorldMapPanel.js`'s own header, since 0.5.1, has been
explicit that a map "should still render the actual regions, never
invent a new geographic boundary." "Show on Map" from a
`GeographicPlacePanel` extends that same restraint to a geographic
place candidate: it passes a set of `${worldId}:${id}` keys, and every
region ALREADY drawn on the map that matches one gets an extra
highlight class — a brighter stroke, a different fill. Nothing new is
projected, nothing new is computed, and no boundary is drawn around the
group as a whole. A geographic place candidate is a fact about which
EXISTING circles a viewer should look at together, never a shape of its
own — exactly 0.5.1's "a world map is a derived view, never a second
world" restraint, applied to a group of regions instead of one.

### A Geographic Place Is Navigable; It Does Not Become World Content (0.5.6)

0.5.5 made a geographic place candidate something a viewer could
BROWSE. The obvious next question — "I found a place, now take me
there" — could have been answered by giving a geographic place its own
row in `core/World.js`: a `WorldGeographicPlace` with a stored position,
alongside `Region`/`Landmark`/`Structure`. That would have been the
easy path, and it would have quietly undone every restraint 0.5.4 and
0.5.5 fought to keep: the moment a candidate identity gets a permanent
slot in the World's own document, "candidate" stops being true. Someone
would eventually read `World.getGeographicPlaces()` and treat it as a
list of real places, the same way a `WorldRegion` is a real place today
— and a fingerprint match would have quietly become an assertion this
architecture never actually verified.

So `core/GeographicPlaceNavigation.js` takes the harder path instead:

```text
World content:
    Region
    Landmark
    Structure

Derived content:
    GeographicPlace
```

A geographic place becomes navigable by being addressable through
`application/WorldLocationDirectory.js`'s own existing identifier
space — a `WorldLocation` whose kind is `GEOGRAPHIC_PLACE` and whose id
is `place:<fingerprintKey>`, built FRESH on every `find()` call by
resolving the place's own deterministic representative region (see
"A Representative Region Is A Presentation Choice, Never An Authority
(0.5.5)" above — this milestone reuses that exact pick rather than
adding a second one) and reusing that region's own already-computed,
layout-offset position. There is no `focusGeographicPlace()`, no second
camera system, and no new WorldLocationDirectory.list() entry — a
geographic place candidate is reachable through `focusLocation()`
addressed by its own derived id, and through nothing else. The
existing abstraction absorbed the new destination kind exactly because
it was never actually about STRUCTURE/LANDMARK/REGION specifically; it
was always about "somewhere a camera can be sent," and a geographic
place candidate qualifies without needing to become anything more
permanent than that.

The same restraint governs `getNearbyGeographicPlaces()`: the design
conversation was explicit that no `place.visitors`/`place.lastVisited`/
`place.distance` may ever be stored — distance is computed fresh from
the viewer's current position and the place's own resolved location on
every call, the same "rebuilt, never cached" posture
`getGeographicPlaceDirectory()` already held to in 0.5.5. A "Nearby
Places" list is a live reading of where the viewer happens to be
standing right now, never a record of where they've been.

**"Near," never "in."** A geographic place is only ever a cross-World
CANDIDATE identity — a fingerprint match, not a confirmation. A viewer
can stand inside its representative region's own radius and the
architecture still has no stronger claim to make than "this looks like
the ground several people have described." `ui/components/WorldWelcomePanel.js`
makes that distinction visible in its own wording: "You are in
Willow Village" for a named `WorldRegion` the viewer is actually
standing inside (real, human-authored geometry — a fact), "You are
near Kawahara Village" for the closest geographic place candidate (a
guess, however well-corroborated). Neither implies the other, and the
architecture never upgrades the second phrasing to the first just
because a viewer happens to be standing at the representative region's
own center.

**One resolution path, reused everywhere.** The directory's "Go to
Place," a place panel's "Go to Place," the compass's contextual
markers, the World View's "Nearby Places" legend, and
`WorldWelcomePanel`'s own arrival section all resolve a geographic
place through the exact same call:
`session.focusLocation(geographicPlaceLocationId(fingerprintKey))` ->
`WorldLocationDirectory#find()` -> the representative region's own
resolved position. None of them recompute a layout offset, a distance,
or a direction independently — `getNearbyGeographicPlaces()` itself
resolves each candidate's position by asking `WorldLocationDirectory`
the same question `focusLocation()` would, so "how far away is it" and
"where does Go To Place actually take me" can never quietly disagree.

### A Focus Context Describes What You Are Looking At; It Does Not Navigate (0.5.8)

0.3.6 through 0.5.7 gave World View a real information architecture —
regions, landmarks, structures, collaborators, and geographic place
candidates, each independently browsable from Explore, the Locations
panel, the World Map, or the Places directory. What none of them
shared was a single answer to one question, asked identically
regardless of which surface a viewer selected something from:

  "What am I looking at, right now?"

`core/WorldFocusContext.js` answers it the same way every other
"describe World state" module in this codebase already does: a small,
DERIVED, read-only reshaping of whatever was selected, rebuilt fresh on
every call, never persisted, and never a sixth stored kind alongside
`WorldRegion`/`WorldLandmark`/`StructurePlacement`/`GeographicPlaceView`/
`WorldSpatialContext`. `application/WorldNavigationSession.js#getFocusContextForLocation()`/
`getFocusContextForCollaborator()` are the only two places one is ever
built, and both are thin resolvers over collections the session already
had — no new World content, no new command, no new persistence.

**Three verbs, one noun, never confused.** By 0.5.7, this codebase
already used "Focus" to mean "move the camera" — `focusLocation()`,
`focusCollaborator()`, `focusPlace()`, and the "Focus" buttons on
`LocationsPanel`/`GeographicPlacePanel` that call them. This milestone
does not rename any of that: renaming a method called from dozens of
sites for a naming preference alone would be exactly the kind of
churn-for-its-own-sake this codebase avoids. Instead it draws the line
explicitly, in the one new surface that could have collided with it:

```text
Focus (noun, NEW)  — "show me information about this thing."
                      core/WorldFocusContext.js,
                      ui/components/WorldFocusPanel.js
Go    (verb, OLD)  — moves the 3D camera. focusLocation()/
                      focusCollaborator() — unrenamed.
Map   (verb, OLD)  — changes the 2D map viewport. WorldMapPanel's own
                      "Show on Map" — unrenamed.
```

`WorldFocusPanel`'s own camera-move button is labeled "Go" — the exact
word Explore's own "Nearby ___" rows already used for the same action
— never "Focus" a second time with a different meaning in the same
screen. A `WorldFocusContext` itself never calls `focusLocation()` or
touches the map; it only carries enough (`availableActions`, `source`)
for the host to offer those as separate buttons.

**"In," never upgraded to "near," and vice versa.** A `WorldFocusContext`
carries two independently-derived fields describing where its target
sits, geographically — `regionPath` (real, human-authored `WorldRegion`
containment of the TARGET's own position, not the viewer's) and
`geographicPlace` (the nearest geographic place CANDIDATE to that same
position). These are never merged into one guess: `arrivalPhrase`
renders "You are in ___" only from `regionPath`, "You are near ___"
only from `geographicPlace`, and a neutral fallback when neither
exists — reusing the exact two-tier wording "A Geographic Place Is
Navigable; It Does Not Become World Content (0.5.6)" established for
the viewer's own arrival, now available for whatever is FOCUSED
instead. Both fields are computed by reusing existing pure functions
wholesale (`core/WorldRegionGeography.js#regionsContaining()`,
`core/GeographicPlaceNavigation.js#deriveNearbyGeographicPlaces()`) —
this milestone adds no second distance/containment implementation.

**Selecting is not navigating.** Opening a `WorldFocusPanel` — from an
Explore nearby row's new "Info" button, or a `LocationsPanel` row's own
new "Info" button — never moves the camera, never changes the map
viewport, and never touches a single bit of World content; it only
reads. The camera only moves when the viewer explicitly presses "Go"
inside the panel, at which point it calls the exact same
`focusLocation()`/`focusCollaborator()` every pre-existing navigation
entry point already used — the same "Navigate ≠ Modify" boundary this
codebase has held to since 0.2.94, extended one more time to a surface
that, unlike its predecessors, doesn't even navigate by default.

### World View Observes and Navigates; Editor Mutates and Builds (0.5.9)

0.2.1 established "Editor / World Editing Parity" as a load-bearing
invariant: whatever mutation Editor View could do to a document, World
View could do too, through the same `EditorActionRegistry`/
`createStandardActions()` surface, "subject only to explicitly
documented presentation or navigation constraints." Milestone after
milestone then built that parity out in earnest — brick placement
(0.1.14, 0.2.87), the transform gizmo (0.1.46–0.1.49), groups (0.1.43),
clipboard (0.1.42), fork-on-write for a published snapshot's first edit
(0.2.20) — until World View was, quietly, a second full editor wearing
navigation chrome.

0.5.7 and 0.5.8 spent two milestones giving World View a real
information architecture — Explore/Map/Places, a unified Focus — built
entirely on READING World state. Once that architecture existed, the
editing capability sitting alongside it stopped looking like parity and
started looking like two competing editors solving the same problem
differently: World View's own in-place fork-on-write vs. Editor's
explicit `/editor?fork=` navigation; World View's own gizmo vs.
Editor's; a command palette that, in World View, quietly disabled half
its own actions because `WorldNavigationSession` had never actually
implemented `paste()`/`renameSelectedGroup()`/`duplicateSelectedGroup()`/
`deleteSelectedGroup()` — the exact entropy a "shared action registry"
was supposed to prevent, still accumulating for four milestones because
nothing forced the two surfaces to name their intent identically. This
milestone reverses 0.2.1's own invariant on purpose:

  **World View Observes and Navigates; Editor Mutates and Builds.**

Every brick/structure/group content-mutation method
`WorldNavigationSession` ever grew — `setActiveDefinitionId`/
`commitPlacement`/`cancelPlacement`/`rotatePlacementPreview` (placement),
`gizmoPointerDown`/`gizmoPointerMove`/`gizmoPointerUp`/`gizmoKeyDown`/
`isGestureActive` (the gizmo), `moveSelection`/`deleteSelection`/
`rotateSelection`/`alignSelection`/`distributeSelection`/
`snapSelectionToGrid`/`applyNumericTransform` (selection transform),
`copySelection`/`pasteClipboard`/`duplicateSelection`/`repeatSelection`
(clipboard), and the full group CRUD surface — is gone from that class
entirely, not merely hidden behind a disabled button. `EditorSession`
already had a complete, independent implementation of every one of
these (confirmed before removing anything — see this milestone's own
implementation notes), so nothing about EDITING got weaker; only WHERE
it lives changed. `ui/views/WorldView.js` no longer constructs an
`EditorActionRegistry`/`CommandPalette`/`EditingSidebar` at all — there
is nothing left in that registry a read-only surface could offer.

**Two deliberate exceptions, and why neither is "editing" in the sense
above.** `WorldNavigationSession` kept exactly two mutation-shaped
capabilities:

  1. **World Region/Landmark naming** (`createRegionHere()`/
     `updateRegion()`/`removeRegion()`/`createLandmarkHere()`/
     `updateLandmark()`/`removeLandmark()`, 0.5.0/0.3.7). These are
     driven by the live avatar's own current position inside World
     View — "name the place I am standing at" — a concept the Editor
     has no equivalent for at all, since it edits a single Document's
     bricks in the abstract, never "being somewhere in a live,
     multi-document World." Naming a place is annotation/curation, not
     construction: it adds no geometry, composes nothing, and (see
     0.5.0's own principle) is always a CLAIM, never authoritative
     content. Porting it to the Editor would require giving EditorSession
     an entirely new concept of World-level, avatar-anchored content —
     a real feature, wildly out of proportion to this milestone, and
     not what "World View Observes and Navigates" is actually
     objecting to.
  2. **`movePlacement()`** (0.2.23) — repositioning an existing
     `StructurePlacement` within the shared World layout. Its own
     pre-0.5.9 header already stated the principle this milestone
     merely reuses: "Moving A Placement Is Not Editing A Document — it
     never touches the Document/Publication, never forks anything."
     Arranging WHERE something sits in a shared layout is the same
     kind of act as naming a place — curating the World's own
     structure — never authoring the content itself.

Both exceptions still route through the exact same `canEditDocument()`/
`_ensureEditableDocumentId()`/`_forkForEdit()` machinery brick mutation
used — 0.2.95's authorization seam and 0.2.20's fork-on-write are
untouched, general-purpose infrastructure, not brick-specific. Undo/redo
(`undo()`/`redo()`) and the history-preview/replay machinery
(`beginHistoryPreview()`/`restoreHistoryAt()`/etc.) also stay for the
exact same reason: a viewer's landmark edit needs to be undoable too.

**Selection stays; it now serves focus and inspection, never mutation.**
`pick()`/`hover()`/`selectAll()`/`marqueeSelect()`/`clearSelection()`/
`getSpatialSelection()` are all still here — 0.2.93 already established
"Selection In World View Does Not Imply Editing Authority" for
StructurePlacement selection specifically; this milestone generalizes
that to EVERY selection. What selection now drives: `getSpatialInspection()`
(read-only brick/placement detail), `focusSelection()` (camera
movement), and collaborative presence (showing OTHERS what you have
selected). It drives nothing else — `getSpatialEditingContext()` still
exists (some call sites read it) but is now permanently empty, an
accurate "nothing is editable" answer rather than a removed method a
caller would have to guard against.

**Edit a Copy — the one deliberate door out.** World View was
deliberately NOT made a dead end. Every `WorldFocusContext` for a
REGION/LANDMARK/STRUCTURE (never a `GEOGRAPHIC_PLACE` — see below —
and never a COLLABORATOR, a person is not a document) now carries an
`EDIT_COPY` action and a `source.documentId`: the Document that actually
CONTAINS what is focused. For a landmark or region, that is the
containing World's own document. For a STRUCTURE, it is deliberately
the PLACED structure's own content document (`StructurePlacement#
documentId` — the exact id `ui/views/WorldView.js#openStructureSource()`
already loads for structure-source viewing), never the World that
merely positions it — "Edit a Copy" always forks what a viewer was
actually LOOKING AT, never a document-sized container around it.
`WorldFocusPanel`'s own "Edit a Copy" button, when pressed, calls the
EXACT SAME `/editor?fork=<documentId>&publication=<id>` navigation
`ui/components/PublicationCatalog.js#forkPublication()` already used
since 0.2.13/0.2.22 — never a second fork mechanism, never a new
`ForkWorldViewSnapshotUseCase`. `WorldNavigationSession#
getPublicationIdForDocument()` is the only new method this required: a
small, public wrapper around the SAME "most recent Publication governs"
resolution `_checkForkPolicy()` already used internally, so a fork
reached through World View can never see a different license/
fork-allowed outcome than the identical document's own in-session
fork-on-write would have applied.

**Edit a Copy reaches every inspection surface, not only Focus.** The
direct-click Inspection panel (0.2.93 — brick, ground, and placement) got
its own "Edit a Copy" too, alongside its pre-existing "Open Source": a
viewer who clicks something in the 3D view directly should not have to
first go find the same thing again in Explore or the Locations panel just
to fork it. `ui/views/WorldView.js#editInspectedCopy(documentId)` is the
one function both surfaces route through — for a brick or ground
inspection it forks `spatialInspection.documentId` (the containing
World), for a placement it forks `spatialInspection.sourceDocumentId`
(the placed structure's own content, the exact distinction `WorldFocusPanel`'s
own STRUCTURE case already draws) — never a second fork mechanism, the
same `/editor?fork=` navigation either way.

**A Geographic Place has no document to fork.** Consistent with 0.5.5's
own "A Geographic Place Is A Derived View, Never A Fourth Stored
Object" — a `GEOGRAPHIC_PLACE` focus context never offers `EDIT_COPY`
at all; it is a grouping of OTHER Worlds' own regions, with no single
document of its own. Each of ITS regions offers Edit a Copy
individually, exactly like any other region — the geographic place
itself stays exactly as non-authoritative and non-editable as it always
was.

**What this milestone deliberately does NOT do.** It does not give the
Editor any notion of avatar position, a live multi-document World, or
camera framing on open — `EditorSession` has no camera-positioning API
at all, and adding one is a real feature sized for its own milestone,
not a side effect of this one. "Edit a Copy" therefore hands off enough
DATA to identify what was focused (title, position, documentId) without
claiming the Editor's camera actually moves anywhere to meet it — see
`tests/WorldViewReadOnlyFork.test.js`'s own Section F for exactly what
is and is not proven. It also does not touch Document metadata editing
(title/description/license) or `movePlacement()`'s own dialog — neither
is brick/structure/group content construction, and both were already
outside 0.2.1's original parity list in spirit even if not in name.

### A Structure Has Two Different Forks, And Neither Is A Version Of The Other (0.6.3)

"Fork" already had one precise meaning in this codebase — `ForkStructureUseCase`
(0.2.81) turning a library Structure into a brand-new, editable
Document — and it stayed the only meaning for five milestones. 0.6.3
gives the word a second, deliberately DIFFERENT operation rather than
overloading the first one or inventing a new verb for it:

    Document fork:   Library Structure --fork--> new, editable Document
    Structure fork:  Library Structure --fork--> new, independent
                       personal Structure (no Document involved at all)

A person reaches for a Document fork when they want to BUILD starting
from a Structure. They reach for a Structure fork when they want to OWN
one — add "Village Hall" to My Structures, rename it, export it, remove
it — without building anything first and without the detour of forking
a Document, selecting everything, extracting it back into a Structure,
and discarding the Document that only ever existed to make that
possible. Both stay content operations, never World/placement
operations (per "Forking A Structure Records Provenance, Never A Live
Dependency," 0.2.81, which this principle extends rather than
replaces), and both leave the SOURCE Structure completely untouched:
`application/ForkStructureToLibraryUseCase.js` mints a fresh Structure
id and fresh brick ids, the same "an id crossing a boundary always
regenerates" rule every fork/import in this codebase already applies.

**Versioning a blueprint is still Place -> Modify -> Extract, never a
mutation of either fork.** Neither kind of fork is, or becomes, a
"version" of the Structure it started from. `core/Structure.js` gains
no `sourceStructureId`, no `version`, no `parentBlueprintId` — a
Structure fork's only relationship to its source is that it started out
geometrically identical, the same "provenance is a label, never a live
dependency" restraint 0.2.81 already applied to a Document fork's own
`parentStructureId`. "Farmstead" and "Farmstead Deluxe" (0.4.3's own
worked example, still true here) sit in My Structures as two ordinary,
unrelated-by-the-data-model entries. If a person wants to know which
came from which, that is exactly what naming them is for — turning that
into queryable data is a genealogy feature nobody has asked for yet,
and speculatively building it ahead of a real need is precisely the
kind of complexity this codebase has consistently declined to add early
(see, among others, 0.4.3's own "Library Membership Is Not Structure
Identity").

### Sorting Is Presentation, Never Identity (0.6.4)

A growing Build Library needs to stay browsable by more than scrolling —
0.6.4 adds a sort dropdown (Name, Recently created, Brick count,
Footprint, Height) to `ui/components/BuildLibraryPanel.js`. None of it
touches what a Structure IS. `core/sortStructures.js` is a pure function:
structures in, the SAME structures back out, reordered. It never mutates
a Structure, never reorders anything `core/StructureRegistry.js` or
`application/LocalStructureLibraryStore.js` itself hands back, and its
result is never serialized, cached, or treated as a second source of
truth about the library's contents. Choosing "Brick count" instead of
"Name" changes what the user sees in one render pass and nothing else —
a Structure's `id`, its `toJSON()` output, and its position in
`getAll()`/`listStructures()` stay exactly what they always were.

This is why every sort key breaks ties on `id`: two structures named
identically, or with identical brick counts, must render in the same
order on every call, on every device, forever — never left to whatever
order `Array.prototype.sort`'s own stability happens to preserve for a
comparator that returns 0. Determinism here isn't a nicety; it's what
keeps "sorted by X" from silently becoming "sorted by X, then by
insertion order, which varies" the moment two entries tie.

The "Recently created" key makes this restraint concrete rather than
hypothetical. It is tempting to add a `createdAt` field to
`core/Structure.js` to support it properly — this milestone doesn't.
Instead, `sortStructures()` accepts an optional `savedAtById` map
supplied by the caller, sourced from
`application/LocalStructureLibraryStore.js#getSavedAtById()` — a
personal Structure's own storage record already carries a `savedAt`
(0.4.3, preserved across a rename); this milestone only exposes it. A
built-in Village Structure was never "created" at any moment a user
witnessed, so it never appears in the map and always sorts as least
recent, falling back to the same id tie-break as everything else.
Recency lives exactly where it was already being tracked — in the
personal library's own storage record — never duplicated into the
domain object it describes.

### Usage History Is Local Presentation Metadata, Never Structure State (0.6.4)

The Build Library's "Recent" section answers "what did I just place,"
sourced from `application/LibraryUsageHistoryStore.js` — a new store
recording which structure id was used and when. It sits at the exact
same architectural altitude `application/LocalWorldExperienceStore.js`
(0.3.10, camera framing) and `application/LocalNamePreferenceStore.js`
(place-naming display choice) already established, extended to a third
kind of purely local, per-device, presentation-only signal:

```text
Structure                    LibraryUsageHistoryStore
    |                              |
immutable reusable value      local UI/session metadata
```

`core/Structure.js` gains no field for this — no `lastUsedAt`, no
`useCount`. `application/ExportBlueprintUseCase.js`'s portable package
carries exactly the Structure it always did; usage history never
crosses the export/import boundary, because it describes THIS device's
own recent activity, not a fact about the blueprint itself. Recording a
use never validates the id against either library, and resolving
"Recent" back into actual Structures — deciding whether a given id is
now built-in, personal, or gone entirely — is deliberately left to the
one caller that already knows how to tell them apart
(`ui/views/EditorView.js`, the same place `inspectStructure()` already
makes that call for the Info panel). A stale id, left behind after its
Structure is renamed, re-forked, or removed, is never a bug to guard
against — it simply fails to resolve, and the caller drops it.

**Placement consumes a blueprint; it does not create a live dependency
on it.** This isn't new with 0.6.4 — "Copying Composes A Blueprint;
Forking Creates One (0.4.0)" already established that placing or
forking a Structure produces ordinary bricks with no `Brick -> Structure
id` reference anywhere, and 0.6.3's own two-forks principle re-affirmed
it for Structure-to-Structure forking. Recording a Structure's id in
usage history changes nothing about that: it is a second, independent,
purely local fact ("this id was recently interesting to this device"),
never a pointer FROM a placed brick BACK TO the blueprint that produced
it. A Document's own bricks stay exactly as unaware of which library
entry (if any) they came from as they always have been.

### A Blueprint Fingerprint Is Derived From Design Content, Never From Local Identity (0.6.5)

`core/Structure.js#id` is intentionally LOCAL identity. 0.4.6's own
`ImportBlueprintUseCase.js` makes a deliberate, load-bearing choice: an
id crossing the export/import boundary always regenerates. Alice's
`Structure.id = "A123"` becomes Bob's `Structure.id = "B987"` — correct
for local independence, but it leaves "is Bob's B987 the same DESIGN as
Alice's A123?" with no answer at all. `core/BlueprintFingerprint.js`
answers exactly that, and nothing more:

```text
local Structure identity   (Structure#id, Brick#id)
        ≠
blueprint design identity  (BlueprintFingerprint)
```

Two intentionally separate identity spaces. A fingerprint is derived
from a blueprint's CANONICALIZED design content — every brick's
`definitionId`/position/rotation, plus the structure's own name/
category/description — and deliberately blind to everything that marks
where or how a particular copy happens to be stored: `Structure#id`,
every `Brick#id`, creation timestamp, library location, usage history,
source library, and local author identity. None of the latter group are
even fields `core/Structure.js` or `application/BlueprintPackage.js`'s
own wire shape carries — there was nothing to accidentally leak into the
fingerprint so much as nothing to have to remember to exclude.

This is the exact same restraint `core/PlaceFingerprint.js` already
established for geography, one milestone-family earlier: a
`WorldRegion`'s own identity and its derived geographic fingerprint are
two different things, and the fingerprint NEVER becomes a place a
caller writes to. `core/BlueprintFingerprint.js` keeps that restraint
just as strictly — **the fingerprint is derived data, computed fresh on
demand (`deriveBlueprintFingerprint(structure)`), and NEVER cached as a
field**:

```js
const fingerprint = deriveBlueprintFingerprint(structure);   // yes
structure.fingerprint;                                       // never
structure.blueprintId;                                       // never
```

Identity derived from content does not need to become mutable domain
state. Caching it on the Structure would create exactly the
synchronization hazard this codebase has consistently avoided elsewhere
(see "Sorting Is Presentation, Never Identity (0.6.4)" for the same
shape of restraint one rung over): a cached field can go stale the
moment the rule that derives it changes, where a pure function called
fresh every time never can.

Canonicalization was settled BEFORE `core/BlueprintAttribution.js` was
built, not discovered partway through it, exactly because the design
conversation that opened this milestone named the risk directly:
fingerprints are meant to be exchanged between independent replicas,
and changing the canonicalization rule after that has happened is a
compatibility break, not a refactor. Two decisions worth naming
explicitly: brick ORDER never matters (two structures built from the
same bricks in a different sequence must fingerprint identically —
`canonicalizeBlueprint()` sorts by each brick's own content, never by
array position), and `tags` are excluded FOR NOW, not because they
could never belong, but because 0.6.3 never gave any authoring surface
a tags field at all — there is no real authored content yet whose
semantics this milestone would be settling. The moment a real
tags-authoring UI exists is the moment to decide whether two designs
differing only in tags are the same blueprint or different ones — not
speculatively here, ahead of either existing.

A matching fingerprint is a CANDIDATE for "this is the same design," the
same restrained verdict `core/PlaceIdentity.js` already commits to for
matching geographic fingerprints — never proof, never grounds to
silently merge or deduplicate two library entries on its own. See
"Attribution Is An External Assertion About A Fingerprint, Never
Structure State (0.6.5)," directly below, for what a fingerprint match
is allowed to support once a human decides to act on it.

### Attribution Is An External Assertion About A Fingerprint, Never Structure State (0.6.5)

Once a blueprint has a stable design identity independent of any one
Structure instance (see above), "who made it?" becomes a question with
somewhere to attach an answer. `core/BlueprintAttribution.js` is that
answer, drawn with exactly the same boundary 0.5.2 already drew for
geography:

```text
BlueprintFingerprint  = objective, derived design identity
BlueprintAttribution  = a subjective, signed, published ASSERTION
                        about who authored that design
```

A `BlueprintAttribution` carries a `fingerprint` it is about, but is
never stored inside `core/Structure.js#toJSON()`, never travels through
a Command, never touches undo/redo, and is never written into
`application/BlueprintPackage.js`'s own portable Structure package.
Publishing an attribution for a fingerprint changes nothing about any
Structure that happens to fingerprint to it — on this device, or
anyone else's — the exact same "a claim about content is never mutation
of that content" restraint `core/PlaceNamingClaim.js` already holds for
a region's name.

**Never "ownership."** This codebase deliberately never models or names
a legal-ownership concept anywhere. "Author," "publisher," and
"contributor" each claim exactly one narrow thing — respectively, "I
made this," "I made this available," and "I contributed to this" — and
none of them imply exclusivity, permission, or a property right. A
future role beyond "author," should a real need for one ever appear, is
a SEPARATE assertion type with its own name, never a semantic expansion
of what `BlueprintAttribution` already means.

Signed, and REQUIRED to be — never tolerated unsigned, the identical
posture `core/Signature.js`'s own `PLACE_NAMING_CLAIM` header already
justifies for the same reason: "N known authors" only means anything if
each attribution is provably a DIFFERENT identity's own assertion, not
the same claim copy-pasted under a fabricated author. Structural
verification only, though — `identity/LocalAuthorizationVerifier.js#
verifyBlueprintAttribution()` checks that the signer equals the
attribution's own `authorIdentityId`, and nothing more. It never asks
whether that identity actually created the local Structure a
fingerprint was derived from, because that is not a question ANY
signature can answer — the same restraint `core/PlaceNamingClaim.js`
already applies to whether a name-claimant has any real connection to
the ground they're naming. Bob can publish an attribution for a design
Alice actually made; nothing here calls that impossible, because this
layer establishes what a claim MEANS, never whether it is true. Reading
several attributions for one fingerprint and deciding what to make of
disagreement between them is left entirely to whoever reads them later
— exactly the judgment `core/PlaceNamingView.js` already declines to
make on a naming claim's behalf.

0.6.5 builds no exchange transport for an attribution at all —
`application/LocalBlueprintAttributionStore.js` is exactly what its name
says, LOCAL, mirroring `application/LocalPlaceNamingClaimStore.js`
before 0.5.3 gave naming claims somewhere to travel. A fingerprint match
across two independent replicas remains informational only, never
grounds for this milestone to auto-deduplicate an import: "you already
have this blueprint" is a real, sensible future feature once
fingerprints and attributions have had a chance to prove themselves
this way first — not something to build speculatively ahead of that,
the same restraint that keeps 0.4.6's own "every id crossing a boundary
regenerates" rule completely unchanged by this milestone.

### Attribution Exchange Distributes Assertions; It Never Establishes Who Actually Made A Design (0.6.6)

0.6.5 built the whole attribution MODEL and stopped exactly where its own
design conversation said to: "0.6.5 builds no exchange transport for an
attribution at all... this is 0.6.6's own job." 0.6.6 (Decentralized
Blueprint Exchange) is that transport, and its entire design rests on the
identical sentence 0.5.3 already proved out for a naming claim, one
domain over:

> Attribution exchange DISTRIBUTES assertions; it never ESTABLISHES who
> actually made a design.

`application/BlueprintAttributionExchange.js` proves this the same way
`application/PlaceNamingClaimExchange.js` already proved its own
restraint: by what it deliberately never does. It never calls
`application/BlueprintAttributionUseCase.js#summarize()`, never compares
one attribution's plausibility against another's, and never decides
which of two identities attributing the same fingerprint is telling the
truth. Every one of those questions was already, correctly, answered by
0.6.5, and answering it twice — once in the attribution model, once in
the exchange layer — is exactly the kind of duplicated authority this
architecture has refused since 0.5.0. Exchange only ever moves an
attribution, unchanged, still carrying its own signature, from one
replica's store to another's.

**Two independent portable things, never one merged domain object.** The
design conversation that proposed this milestone considered a
"SharedBlueprint" or "BlueprintSharePackage" as a new domain concept and
explicitly declined to build one. A design's geometry
(`application/BlueprintPackage.js`, unchanged since 0.4.6) and a signed
assertion about who made it (`core/BlueprintAttribution.js#toJSON()`,
unchanged since 0.6.5) stay two separate, independently-portable,
independently-verifiable artifacts. `BlueprintPackage.js` only ever grows
one small, OPTIONAL, additive field — `attributions` — that BUNDLES the
two for the convenience of moving them in one file at once; it does not
merge them into a third thing. A Structure imported from a package with
no `attributions` at all is exactly as usable as one that arrived with
several, and an attribution can just as validly arrive completely on its
own, unconnected to any blueprint import happening at the same time — see
`ui/views/EditorView.js#importBareBlueprintAttribution()`.

**Never trust a package's claimed fingerprint when the actual design can
be fingerprinted locally.** This is the one genuinely new rule this
milestone adds beyond what 0.5.3 already established for a naming claim,
because unlike a `PlaceNamingClaim`'s `regionId` (which an importing
replica may not know anything about yet), a `BlueprintAttribution`'s
`fingerprint` can often be checked directly: the moment a receiver
actually has the Structure an attribution is about — typically because it
just imported the very Blueprint Package the attribution traveled
alongside — `deriveBlueprintFingerprint()` on that LOCAL Structure is
strictly more trustworthy than any string a portable package merely
claims. `application/BlueprintAttributionExchange.js#importAttribution()`'s
own `expectedFingerprint` parameter enforces exactly this: a
cryptographically PERFECT signature only proves the named identity signed
THIS payload — it proves nothing about whether that payload's
`fingerprint` field describes the design actually sitting in front of the
receiver. An attacker who genuinely controls a signing key can still sign
a syntactically valid attribution claiming an arbitrary fingerprint; the
cross-check is what catches "authentic signature, wrong subject" the
signature check alone never could. The check runs AFTER verification,
deliberately — the fingerprint field is only trustworthy once the
signature protecting it has already been confirmed, so checking it first
would compare a locally-derived fact against a number that, at that
point, nothing yet guarantees the attribution actually said.

**The fingerprint cross-check is opt-in, not mandatory — because a bare
attribution is still a legitimate, useful thing to hold.** An attribution
received with no accompanying Structure to compare against (the design
conversation's own "attribution should be able to travel independently of
the blueprint it's about") is neither rejected nor held back — it is
simply stored as an unconfirmed assertion about SOME design with that
fingerprint, exactly as informational as 0.6.5 already treats any
fingerprint match as being. `expectedFingerprint` is how a caller who
genuinely has something local to check supplies it; omitting it is not a
weaker import, only a different, equally valid one.

**`receivedAt` gets the same treatment a second time.**
`application/LocalBlueprintAttributionPublicationLog.js` is the exact
`application/LocalPlaceNamingPublicationLog.js` shape one domain over —
first-seen-wins, never read back into `summarize()`'s own attribution
list, preserved for a future freshness policy that this milestone
deliberately does not build. The reasoning is unchanged from 0.5.3: a
second, unsigned "publishedAt" would just be a spoofable shadow of
`attribution.createdAt` (already the real, signed timestamp); only "when
did THIS replica first learn about this" is genuinely new information no
signature could ever have covered in advance.

**The transport stays exactly as boring as 0.5.3's and 0.4.6's own.**
Every publication `BlueprintAttributionExchange` produces or consumes is
plain, portable JSON, moved by hand today — the identical restraint both
of this milestone's own ancestors already committed to, for the identical
reason: prove the exchange boundary works, in isolation, before building
any real transport on top of it. A future WebRTC peer exchange,
rendezvous relay, or DHT plugs into `exportAttribution()`/
`importAttribution()` exactly as they stand today.

### Attribution Resolution Ranks Presentation, Never Authorship (0.6.7)

0.6.5 built the attribution model; 0.6.6 built the transport that lets a
replica accumulate more than one signed attribution for the same
fingerprint. Neither ever answered what a person should actually be
SHOWN once several exist. `core/BlueprintAttributionView.js` is the
direct `core/PlaceNamingView.js` counterpart, one domain over — and its
entire design rests on generalizing that module's own restraint one
notch further:

> A valid signature proves who made the claim, not who actually made the
> design.

`core/PlaceNamingView.js` already answers "which name looks most
agreed-on, and by how much?" without ever claiming the winner is
correct — confidence, never authority. `core/BlueprintAttributionView.js`
asks the equivalent question about authorship and answers it the same
way, but with one structural difference the design conversation that
proposed this milestone was explicit about: **names compete; authors
never do.**

**A `PlaceNamingView` entry picks a winner. An `attributionView()` entry
never does.** A region has, at most, one PREFERRED name — that's the
entire point of `preferredClaimedName()`. A blueprint can legitimately
carry three attributed authors at once — an original creator, a
collaborator who reworked it, an adapter who built on top — with no
implication that any one of them is more "correct" than another.
`attributionView()`'s own `authors` list is therefore never trimmed to a
single answer the way a naming view's top entry is; every distinct
attributing identity is always present. `score` orders that list only for
STABLE, deterministic presentation — the identical distinct-identity
counting core/PlaceNamingView.js already established, applied here to
"how many of this one author's own signed claims for this design does
this replica have on file," never a cross-author trust comparison.
Labeling that count "supporting claims" rather than "votes" or "trust"
throughout the UI is deliberate: a claim supports an assertion someone
already made, it never adjudicates it.

**`summarize()` stays exactly as it was; `communityView()` is a new,
separate, additive method.** The design conversation considered folding
the new ranked view directly into `summarize()`'s own return shape and
rejected it, for the same reason `core/PlaceNamingView.js` has never been
merged into `application/PlaceNamingClaimUseCase.js`: a flat, unranked
read and a ranked, presentation-oriented derivation are two different
questions, and answering both from one method invites exactly the kind of
implicit coupling this architecture keeps refusing. Every pre-0.6.7 caller
of `summarize()` — `ui/views/EditorView.js#exportStructure()` chief among
them — keeps working, unchanged, reading the exact same flat shape it
always has.

**`receivedAt` finally gets consumed — but ranking still never sees it.**
`application/LocalBlueprintAttributionPublicationLog.js`'s own 0.6.6
header reserved its bookkeeping "for a future freshness policy... not
wired into 0.6.5's own plain, unranked attribution list now." This
milestone is that future policy, and it draws the boundary exactly where
that header implied it should: `communityView()` attaches a `receivedAt`
map for DISPLAY ("Received locally · Aug 24," never the claim's own
self-reported, spoofable `createdAt`) alongside the ranked view, but
`receivedAt` never once participates in `authorCount`, `score`, or
ordering. A claim received a minute ago and one received a year ago
count identically toward its author's own support — freshness is
something a future policy could still choose to weigh, but this milestone
explicitly declines to make that choice on anyone's behalf.

**Never "Created by."** Every label this milestone's own UI work adds —
"Community Attribution," "Attributed to," "Claimed authors," "Attribution
claims" — was chosen to preserve the exact distinction `core/
BlueprintAttribution.js`'s own 0.6.5 header drew and named "Attribution
Is An External Assertion About A Fingerprint, Never Structure State."
Resolving an `authorIdentityId` to a fabricated-looking human display
name was considered and explicitly declined, for a structural reason
beyond mere restraint: no directory mapping an arbitrary identity to a
verified display name exists anywhere in this codebase (see
`ui/components/WorldMembersPanel.js`'s own comment on why that
resolution, where it exists at all, is a HOST-level, ALIAS-then-
identityId concern, never baked into a shared derivation module) — so a
component here can show only what it can actually verify: "You," or a
truncated `authorIdentityId`, exactly `ui/components/PlaceNamingPanel.js`'s
own `formatAuthor()` already established one domain over.

**Blueprint lineage stays out of scope, on purpose.** The design
conversation that proposed this milestone explicitly declined to add
`parentBlueprintId`, `version`, `revision`, `createdBy`, `originalAuthor`,
or `forkedFrom` anywhere. `core/BlueprintFingerprint.js` already gives a
design CONTENT identity; `core/BlueprintAttribution.js` already gives an
assertion about AUTHORSHIP. "This design appears to be a modification of
that one" is a fundamentally different, much harder problem — similarity,
not equality — and folding it in here, just because the words sound
adjacent, would tangle four genuinely separate concepts this architecture
has kept apart since 0.6.5: identity ≠ authorship ≠ lineage ≠ version. A
future Blueprint Lineage milestone can build that relationship as its own
concept, on its own terms, exactly the way this milestone built attribution
resolution as its own concept rather than as a change to 0.6.6's exchange
layer.

### Lineage Is A Signed Claim, Never A Fact (0.6.8)

0.6.7's own closing "Deliberately excluded" list named this milestone
directly and drew the line in advance: "identity ≠ authorship ≠ lineage ≠
version." 0.6.8 is the milestone that finally builds the third of those
four concepts, and its entire design rests on refusing to let it collapse
into any of the other three.

**A `BlueprintLineageClaim` is exactly as strong as a `BlueprintAttribution`
— no stronger.** `core/BlueprintAttribution.js`'s own 0.6.5 header drew
the line: a signature proves who made the CLAIM, never who made the
design. `core/BlueprintLineageClaim.js` inherits that restraint whole: a
claim that "B was derived from A" proves identity X signed exactly that
assertion — never that B actually descends from A, never that X made
either design, never that the claim is even plausible. Two identities can
sign directly contradicting claims about the same pair of fingerprints,
and both remain equally valid signed facts, exactly the same non-
adjudicating posture `core/PlaceNamingClaim.js` established for
disagreeing place names and `core/BlueprintAttribution.js` established
for disagreeing authorship.

**A design cannot be derived from itself — the one structural invariant
this claim type enforces beyond "required signature."** Every other claim
type in this codebase (`PlaceNamingClaim`, `BlueprintAttribution`) is
about exactly ONE subject; a `BlueprintLineageClaim` is about a
RELATIONSHIP between two, and `sourceFingerprint === derivedFingerprint`
is the one shape that relationship can never honestly take. The
constructor enforces it directly, `application/
BlueprintLineageClaimPublicationValidator.js` enforces it again
structurally on anything arriving over the wire, and `identity/
LocalAuthorizationVerifier.js#verifyBlueprintLineageClaim()` never even
reaches that question — cryptographic and structural validity stay two
separate checks, as always in this codebase.

**No mutable version history, anywhere, full stop.** The design
conversation that proposed this milestone was explicit from its very
first sentence: "the important thing is to NOT turn it into a mutable
version-control system yet." `core/Structure.js` gains no
`parentBlueprintId`, no `version`, no `revision` — every fingerprint a
`BlueprintLineageClaim` names stays exactly as immutable and independent
as `core/BlueprintFingerprint.js` already made it in 0.6.5. Publishing a
lineage claim changes nothing about either Structure it names, on this
device or anyone else's — the identical boundary `core/
BlueprintAttribution.js`'s own header already drew for authorship,
extended here to derivation.

**A relationship vocabulary of exactly one member, on purpose.**
`BlueprintLineageRelationship` exports a single value, `DERIVED_FROM`.
The design conversation that proposed this milestone named
`INSPIRED_BY`/`VARIANT_OF`/`REBUILD_OF` directly and rejected building
any of them now, for the identical reason 0.6.6 already declined a richer
attribution vocabulary: these distinctions become ambiguous almost
immediately, and a small, honest vocabulary that says exactly one true
thing beats a large speculative one that invites a publisher to guess
which of ten overlapping words applies. A future relationship kind, once
it has a real, demonstrated need, is an ADDITION to the enum — never a
redesign of the claim itself.

**Contradiction is data, not an error to fix.** `core/
BlueprintLineageView.js#lineageView()` never picks a winner among several
`derivedFrom` claims, and `detectLocalLineageCycle()` never deletes,
merges, or silently prefers one side of a direct `A → B` / `B → A`
contradiction — it only ever adds a warning flag alongside BOTH claims,
still fully visible. This is the same "expose the claims, never fix
history" restraint every derived view in this codebase has kept since
`core/PlaceNamingView.js#namingView()` first drew it for disagreeing place
names.

### Similarity Is Evidence; It Never Becomes Lineage (0.6.8)

The direct one-concept-over descendant of 0.5.4's own "Geographic
Similarity Suggests Identity; It Never Mutates Identity" — the same trap,
in a different domain, named again by this milestone's own design
conversation from the start:

> Do NOT automatically infer and persist lineage from similarity. Alice
> and Bob might independently build almost identical houses. 98%
> similarity does not establish "Bob copied Alice."

**A similarity score is CANDIDACY for a human's attention, never proof of
anything.** `core/BlueprintSimilarity.js#compareBlueprintSimilarity()`
returns five plain, legible numbers — `positionOverlap`, `brickOverlap`,
`changedBricks`, `addedBricks`, `removedBricks` — plus a `similarity`
score that is nothing more sophisticated than the average of the first
two ratios. Deliberately not a fitted, weighted, or learned model: every
number this module produces is one a person reading the source could
recompute by hand, because the entire purpose of this module is to be
legible EVIDENCE, never an oracle a UI defers to.

**`core/BlueprintSimilarity.js` never signs, never persists, and is never
itself consulted by the layer that actually asserts lineage.**
`application/BlueprintLineageUseCase.js#publish()` reads exactly two
things before signing a claim: whether the caller can sign at all, and
whether the two fingerprints differ. It does not call
`compareBlueprintSimilarity()`, does not check `isPossibleLineageCandidate()`,
and would happily sign a claim between two designs that score 0%
similar — because a low similarity score is not proof of falsehood any
more than a high one is proof of truth. The two modules meet only in
`ui/views/EditorView.js`, where a person reads the evidence and decides;
nowhere in the domain or application layers does a percentage ever
become a signature.

**An identical pair is explicitly excluded from candidacy.**
`isPossibleLineageCandidate()` returns `false` whenever `evidence.identical`
is `true` — "these two fingerprint identically" is `core/
BlueprintFingerprint.js#blueprintFingerprintsEqual()`'s own question, and
answering it is never what a "possible predecessor" suggestion is for.
Offering a person a "derived from" button for the exact same design would
blur the one distinction this entire milestone exists to keep sharp:
`A == B` is equality; `A ≈ B` is similarity; `A → B` is lineage, and only
a human, not a percentage, is ever allowed to assert the third.

**The UI never asserts on a person's behalf.** `ui/components/
StructureInfoPanel.js`'s own "Possible Predecessors" list is captioned
"Evidence only — nothing here is asserted," and its "Derived from this"
button is the ONLY code path anywhere in this codebase that leads to
`BlueprintLineageUseCase#publish()` being called with a
similarity-suggested source — every click is a real, individual human
decision, never a batch action, never a default, never something that
fires above a threshold without someone choosing it.

### Publication Makes Content Discoverable; It Does Not Make It Authoritative (0.7.0)

0.2.14 already drew the boundary this milestone generalizes: "Published
content is identified by its content hash, not its storage location.
IPFS, Arweave, HTTP gateways, local storage, and future backends are
retrieval mechanisms rather than content identities." 0.7.0's entire job
is to let that same boundary hold for something other than a Document
snapshot — a `BlueprintAttribution`, a `BlueprintLineageClaim`, a
`PlaceNamingClaim`, anything already signed — without inventing a second
notion of what "published" means for each one.

**A locator is not an identity.** `core/ContentReference.js`'s own
header already says as much for a content hash versus its `uri`; `core/
DecentralizedPublication.js` extends the identical restraint one layer
up. `ipfs://bafy...`, `https://mirror.example/...`, and a future
`blockchain:...` anchor are three ways to ask "where might these bytes
be?" — never three different answers to "what are these bytes?" (the
hash already answered that) or "is this true?" (nothing ever answers
that automatically). A `DecentralizedPublication`'s signature proves
only that its own `publisherIdentity` chose to publish this exact
`ContentReference` under this `contentKind` — never that the wrapped
content is accurate, never that the signer of the WRAPPED content (a
separate signature, checked separately) is trustworthy, and never that
the content is even reachable at the locator it names.

**Blockchain inclusion does not turn a claim into truth.** If Alice
signs "I created blueprint X" and that assertion is anchored where
nobody can ever delete it, the anchor proves Alice's key produced that
exact assertion at that exact time — nothing more. It does not prove
Alice designed X, the identical restraint `core/BlueprintAttribution.js`
already established for an unanchored attribution in 0.6.5. A future
blockchain-anchored `ContentStore` is exactly that: one more retrieval
mechanism, immutable and independently timestamped, never a promotion
of anything it stores from claim to fact.

**The fingerprint of a design and the locator of a publication are two
independent axes, and neither is ever written into the other.**
`core/BlueprintFingerprint.js` names WHAT a design is; `core/
ContentReference.js`'s own `uri` names WHERE one copy of some bytes
might be found. The same fingerprint can be wrapped in any number of
independent `DecentralizedPublication` envelopes — published by
different identities, pointing at different storage backends, none more
authoritative than another — the exact same "several independently
signed facts, never reconciled into one" posture `core/
BlueprintAttributionView.js` and `core/BlueprintLineageView.js` already
hold for disagreeing claims, extended here to disagreeing LOCATIONS of
the same content.

**A resolver never trusts what it retrieves — it only ever verifies it.**
`application/PublicationResolver.js` runs the identical discipline every
exchange class in this codebase already followed ad hoc since 0.5.3
(`application/PlaceNamingClaimExchange.js`,
`application/BlueprintAttributionExchange.js`,
`application/BlueprintLineageExchange.js`): validate the envelope,
construct it, verify its signature, retrieve the referenced bytes,
verify the bytes actually hash to what was signed, validate the wrapped
content, construct it, verify ITS OWN signature, optionally cross-check
it against something already local, and only then store it. Never:
retrieve → trust. What 0.7.0 changes is making that discipline
protocol-neutral and reusable across content kinds, rather than
reimplemented once per domain — the resolver itself never imports a
single domain module (no `BlueprintAttribution`, no `PlaceNamingClaim`),
receiving instead a small `kindPlugin` supplying whatever
validator/constructor/verifier that domain already built.

### Availability Is Not Validity (0.7.1)

0.7.0's `application/PublicationResolver.js#resolve()` only had one way
to fail: throw, with a message. That was sufficient as long as the only
`ContentStore` behind it was `content/LocalContentStore.js` — a local
read either finds bytes or it doesn't, instantly and forever, and every
kind of "doesn't" really did mean the same thing: this is bad. A real,
network-backed `ContentStore` breaks that equivalence. Content can be
completely genuine — correctly signed, correctly hashed, correctly
addressed — and still be unreachable RIGHT NOW because a node hasn't
replicated it yet, a connection timed out, or a gateway is temporarily
down. None of that is evidence the publication is bad. Collapsing "bad"
and "not available yet" into one generic failure would force every
caller to guess which one actually happened from a string message.

**`application/PublicationResolutionOutcome.js` names the difference
structurally, not by convention.** `CONTENT_UNAVAILABLE` is its own
outcome, produced whenever `content/IpfsContentStore.js#get()` throws
or returns nothing — never conflated with `CONTENT_HASH_MISMATCH`
(bytes WERE retrieved, and they're wrong), `INVALID_CONTENT` (the bytes
parse but fail structural validation), or `INVALID_CONTENT_SIGNATURE`
(the wrapped object's own signature fails). A caller that only wants
"did it work" still treats every non-`RESOLVED` outcome as failure; a
caller that wants to retry later, rather than discard a publication
outright, checks for exactly `CONTENT_UNAVAILABLE` — the one outcome
that says nothing whatsoever about the publication's own trustworthiness.

**A `ContentStore` decides reachability. It never decides authenticity.**
`content/IpfsContentStore.js#get()` throws a `ContentUnavailableError`
for every network-shaped failure and NEVER for a hash mismatch or a bad
signature — those checks happen one layer up, in `application/
PublicationResolver.js`'s own step 5 (`CONTENT_HASH_MISMATCH`) and step
8 (`INVALID_CONTENT_SIGNATURE`), exactly where 0.7.0 already put them.
A store that tried to make that call itself would be reintroducing the
identical "retrieve → trust" shortcut `application/
PublicationResolver.js`'s own header has refused since 0.7.0.

**The CID is a locator. It is never this content's identity.** The
distinction `core/ContentReference.js` drew in 0.2.14 between a content
hash and its `uri` holds exactly as written the moment that `uri`
becomes `ipfs://bafy...` instead of `https://...`. `content/
IpfsContentStore.js#put()` computes its returned `ContentReference`'s
`hash` locally, from the bytes THIS REPLICA is looking at — the same
`computeContentHash()` `content/LocalContentStore.js` already uses —
and only ever writes the CID Kubo hands back into `uri`. A caller that
only ever reads `contentReference.hash` cannot tell whether the bytes
came from a local store or a real IPFS node, which is exactly why
`application/PublicationResolver.js` never had to change to gain one.

**A publication points at content, not at a device.** The property a
real decentralized network is FOR: once bytes are content-addressed and
replicated, resolving them never again depends on the specific node —
Alice's, or anyone else's — that first published them. `tests/
IpfsPublicationResolution.test.js`'s own flagship proves this
deterministically (a publication that is `CONTENT_UNAVAILABLE` on one
node resolves, unchanged, the moment the identical bytes exist on
another); `tests/IpfsLiveIntegration.test.js` is the one file in this
codebase that attempts to show the same thing against a real Kubo
network, when one happens to be running.

### Discovery Is Not Resolution (0.7.2)

`application/PublicationResolver.js` has always answered exactly one
question at a time: "here is a publication I already possess — can I
retrieve and verify its content?" Nothing before 0.7.2 ever gave a
replica anywhere to keep an envelope it had SEEN without immediately
resolving it, which quietly conflated two facts that are not the same:
knowing a publication exists, and being able to fetch what it points at
right now. `application/LocalPublicationCatalog.js` exists to keep those
facts apart, structurally rather than by convention.

**A catalog entry records that a signed envelope was seen. It never
records whether the content it points at is reachable.** Cataloging a
`DecentralizedPublication` runs exactly three checks — is the envelope
well-formed, does it construct, does its own signature verify — the
identical first three steps `application/PublicationResolver.js#resolve()`
already runs before it ever touches a `ContentStore`. It deliberately
stops there. A publication whose bytes are temporarily unreachable
(0.7.1's own `CONTENT_UNAVAILABLE`) is exactly as valid a catalog entry
as one that resolves instantly — the catalog has no way to tell the
difference, and asking it to try would mean fetching content merely to
decide whether to remember a locator, the exact "retrieve → trust"
shortcut `application/PublicationResolver.js`'s own header has refused
since 0.7.0.

**Resolution status is always derived, never stored.** `application/
LocalPublicationCatalog.js` has no `status` field, no cached
`RESOLVED`/`CONTENT_UNAVAILABLE` flag, nothing a background process
would need to keep in sync as content propagates, gets garbage
collected, or reappears. A caller that wants to know whether a cataloged
publication currently resolves calls `application/
PublicationResolver.js#resolve()` on it, on demand, every time — the
same restraint `application/PublicationResolutionOutcome.js`'s own
0.7.1 header already applied to a single resolution call, extended here
across the CATALOG'S entire lifetime: a cached verdict about
reachability is a verdict that can go silently wrong the moment the
network changes underneath it, and this codebase would rather ask again
than trust a stale answer.

**A catalog indexes; it never adjudicates.** `application/
LocalPublicationCatalog.js#findByContentHash()` can return several
independently signed publications for the identical bytes, published by
different identities, pointing at different backends — and returns all
of them, in the order this replica happened to receive them, with no
field anywhere ranking one over another. Adding a trust score,
a "canonical" flag, or a "preferred publisher" concept would turn
discovery into exactly the kind of adjudication `core/
BlueprintAttributionView.js` and `core/BlueprintLineageView.js` already
refuse for disagreeing claims one layer down — several independently
signed facts, never reconciled into one, extended here to disagreeing
LOCATIONS of the same content rather than disagreeing claims about it.

**Exchanging a publication moves a locator, never its content.**
`application/PublicationExchange.js` is the generalization of
`application/PlaceNamingClaimExchange.js`/`application/
BlueprintAttributionExchange.js` one layer up — the identical
validate → construct → verify discipline, applied to the WRAPPER those
two domains can optionally travel inside instead of to either domain
directly. It never calls `application/PublicationResolver.js`, never
touches a `ContentStore`, and never learns what a `contentKind` string
means. A live transport — gossiping envelopes over an actual peer
connection rather than a hand-off file — is deliberately still missing;
this class only establishes what moves and how it is checked, exactly
as boring on purpose as `application/PlaceNamingClaimExchange.js`'s own
0.5.3 header insisted its own first transport had to be.

### A Peer Connection Transports Publications; It Does Not Resolve Them (0.7.3)

0.7.2 closed with one thing named and unbuilt: a live transport for
`application/PublicationExchange.js`, which until 0.7.3 only ever moved
a plain envelope object in, a plain envelope object out — a caller
still had to physically carry that object from one replica to another
by hand. `application/PublicationPeerExchange.js` is that transport,
and the constraint this milestone's own design conversation stated
before any code existed: **do not make `application/
LocalPublicationCatalog.js` network-aware.** The catalog gained no new
method, no new field, and no idea that a peer connection exists at
all — a transport was built AROUND `application/
PublicationExchange.js`, never threaded into `application/
LocalPublicationCatalog.js` or `application/PublicationResolver.js`
themselves.

**A live announce runs through the exact same discipline a pasted file
already did.** `application/PublicationPeerExchange.js#_handleIncoming()`
calls `application/PublicationExchange.js#importPublication()`
UNCHANGED — validate, construct, verify, catalog — the identical four
steps 0.7.2's own flagship already proved against a hand-off JSON
object, now driven by a message that arrived over `peer/
PeerMessageBus.js` instead. Nothing about WHERE an envelope came from
changes what it takes to be believed; see `docs/Principles.md`,
"Exchanging A Publication Moves A Locator, Never Its Content" above,
extended here from "moved by hand" to "moved live."

**Discovery over a wire is still not resolution.** `application/
PublicationPeerExchange.js` never calls `application/
PublicationResolver.js`, never touches a `ContentStore`, and never asks
whether the content a freshly-announced publication points at is
actually reachable. `tests/PublicationPeerExchange.test.js`'s own
flagship proves this directly, over a REAL authenticated connection
rather than 0.7.2's hand-bridged one: Bob catalogs Alice's live
announcement, resolves `CONTENT_UNAVAILABLE` against his own empty
`ContentStore`, and only reaches `RESOLVED` once the bytes separately
propagate — with no second peer exchange of any kind. See "Discovery
Is Not Resolution (0.7.2)" above; a live transport changes nothing
about that boundary.

**No new transport hierarchy was invented.** `peer/PeerMessageBus.js`
(0.2.52) already answers "how do independent decentralized protocols
safely share one authenticated peer connection," proven transport-
agnostic by `tests/PeerMessaging.test.js`'s own flagship running
unmodified over both `peer/LocalPeerConnectionProvider.js` and `peer/
WebRtcPeerConnectionProvider.js`. `application/
PublicationPeerExchange.js` is built directly on that bus, the same
shape `application/IdentityLifecyclePropagationUseCase.js` and
`application/DeviceAuthorizationPropagationUseCase.js` already
established for their own gossiped records, rather than a second,
parallel transport abstraction duplicating hygiene that already
existed. A consequence, not a coincidence: a future real WebRTC
milestone is composition-root wiring, not new protocol work.

**Peer identity stays informational, never authority.**
`application/PublicationPeerExchange.js#_handleIncoming()` never reads
`meta.connectedPeer` — a publication received from Alice, from
Charlie, or from a pasted file is exactly as valid, because its own
signature (verified entirely inside `application/
PublicationExchange.js`, unchanged) is the only thing that ever made
it trustworthy. No `trustedPeer`, `trustedPublisher`, or `peerScore`
concept exists anywhere in this milestone, extending the identical
"publisher identity ≠ transport source" invariant this codebase has
held since `application/PlaceNamingClaimExchange.js`'s own 0.5.3
header, now proven true of a live connection as much as a file.

### Content Delivery Is Not Content Authority (0.7.4)

0.7.3 closed with one thing named and unbuilt: "a pull-based
request/response protocol... any form of content transfer." Every
milestone through 0.7.3 answered "who published this locator, and can
its bytes be resolved" without ever asking a THIRD replica to help —
the bytes a publication pointed at were always already sitting wherever
`application/PublicationResolver.js#resolve()` looked. `application/
PeerContentExchange.js` is the missing pull, and the rule its own
design conversation stated before any code existed: **a peer is never
trusted merely because it supplied bytes.**

**A publication's signature proves who published a LOCATOR, never who
may deliver its bytes.** `core/DecentralizedPublication.js`'s own header
has held this distinction since 0.7.0 — `contentReference.hash`
(cryptographic identity of the bytes) and `signature.signer` (identity
of whoever published the reference) were always two independent claims.
This milestone adds a third, equally independent fact: WHO physically
handed this replica a copy of those bytes just now. None of the three
implies either of the others. Alice's signature on a publication gives
Charlie no special authority to deliver its content, and Charlie
successfully delivering bytes gives him no retroactive claim to have
published anything.

**The hash is the only thing that ever makes a RESPONSE trustworthy.**
`application/PeerContentExchange.js#_handleResponse()` never reads
`meta.connectedPeer` to decide whether to accept a RESPONSE — the same
"peer identity stays informational, never authority" restraint
`application/PublicationPeerExchange.js`'s own header already
established for an ANNOUNCE, extended here from "is this signed
correctly" to "do these bytes hash to what I asked for." `core/
ContentReference.js#verify()` recomputes the hash of exactly what
arrived and compares it against exactly what was requested; a mismatch
is dropped before it ever reaches `content/LocalContentStore.js#put()`.
Storing itself was never the last line of defense — `put()` has
recomputed its own hash from the bytes it was handed since 0.7.0, so
mislabeled content was structurally impossible even before this
verification step existed. This milestone adds a check in front of
storage, not a fix inside it.

**Retrieval is authorized by what was published, never by what is
merely known.** `application/PeerContentExchange.js#request()` and
`#_handleRequest()` both refuse to act on a hash the local `application/
LocalPublicationCatalog.js` does not already hold, via some cataloged
publication's own `contentReference` — see `tests/
PeerContentExchange.test.js`'s own Section B for a request refused in
both directions. Without that gate, this protocol would answer any hash
a peer happened to already know, becoming a generic file-transfer
primitive with no relationship to `core/DecentralizedPublication.js` at
all. With it, "ask a peer for content" stays exactly what its own name
says: retrieving what a signed locator already promised was there,
never fetching by bare guess.

**No new trust concept was introduced.** Exactly like `application/
PublicationPeerExchange.js`'s own 0.7.3 header, no `trustedPeer`,
`peerScore`, or "preferred content source" field exists anywhere in
this milestone, and none should ever be added — a peer that supplies
verified bytes today is owed nothing more than a peer that supplies
none tomorrow. See `docs/Roadmap.md`, 0.7.4, "Peer identity is not
content authenticity," for the full milestone entry.

### A Resolution Coordinator Sequences; It Does Not Decide (0.7.5)

0.7.0 through 0.7.4 built five classes — `DecentralizedPublication`,
`PublicationResolver`, `LocalPublicationCatalog`/`PublicationExchange`,
`PublicationPeerExchange`, `PeerContentExchange` — each one deliberately
unaware of the others beyond the single collaborator it takes by
constructor injection. That was correct, and none of it changes here.
What none of the five ever answered is the question a PERSON actually
has, looking at one cataloged publication: "can I see this, and if not,
can you go get it?" Answering that means calling two of them in
sequence and reacting to an event neither raises on its own behalf.
`application/PublicationResolutionCoordinator.js` is exactly that
sequencing — and, this milestone's own design conversation insisted,
**nothing more**: it owns no storage, ranks nothing, and decides nothing
a person didn't already ask for.

**Sequencing a decision is not making it.** The coordinator's own
`resolve()` runs `PublicationResolver#resolve()` first, unconditionally,
and returns whatever it says unless the outcome is exactly
`CONTENT_UNAVAILABLE`. It never second-guesses a `RESOLVED`, never
retries an `INVALID_*`, and never invents a new outcome of its own —
every value a caller can see still comes from `application/
PublicationResolutionOutcome.js`, unchanged since 0.7.1. Composing two
existing operations is not the same as growing a third one with its own
opinions, and this class is written to make that structurally
impossible: it has no field, anywhere, that could hold an opinion.

**Retrieval is opt-in per call, never a default the coordinator
chooses.** `peer` is a required, per-call argument — never a peer this
class selects for itself, never "the first connected peer" or "every
connected peer." A caller with no peer to offer gets exactly the local
`resolve()` result back, unchanged; automatic, unattended retrieval for
every catalog entry a replica happens to hold was named directly in
this milestone's own design conversation and refused, for the identical
reason `application/PeerContentExchange.js`'s own 0.7.4 header refuses
to answer a hash nobody published a locator for. `ui/views/
DecentralizedPublicationsView.js` is where "which peer" actually gets
decided — a single, named, narrow default policy (the first
AUTHENTICATED peer) living in the UI layer, never inside the
coordinator. Asking more than one peer, racing candidates, or falling
back from one to another remains exactly as unbuilt as `docs/
Roadmap.md`'s own 0.7.4 entry already sized it (0.7.6) — a resolution
coordinator that quietly grew fallback logic would be that milestone
arriving early, wearing a different name.

**A cached verdict is the one thing this class refuses to become.**
`resolve()` stores nothing across calls and re-derives its answer from
scratch every time, the identical restraint `application/
LocalPublicationCatalog.js`'s own header already applies to itself —
see "Discovery Is Not Resolution (0.7.2)" above. Calling it twice for
the same publication, with or without a peer, is always safe and always
current; nothing about this milestone lets a replica's own view of "can
I see this" drift from what a fresh check would say.

**Resolving to look is not resolving to keep.** The two existing
`kindPlugin` factories (`application/
BlueprintAttributionPublicationKind.js`, `application/
PlaceNamingClaimPublicationKind.js`) both made their own `store`
parameter optional this milestone, so `application/
CreatePublicationDisplayKindRegistryUseCase.js` can build a kindPlugin
with no `store` at all — one that resolves a publication far enough to
describe it, and imports it nowhere. Merely opening `ui/views/
DecentralizedPublicationsView.js` to check whether a cataloged
attribution or naming claim can be seen right now must never, as a side
effect, add it to `application/LocalBlueprintAttributionStore.js` or
`application/LocalPlaceNamingClaimStore.js` — a person who actually
wants that already has "Claim authorship" and its naming-claim
equivalent, both entirely unchanged. Looking at a publication and
adopting it stay two different acts, exactly as separate as cataloging
and resolving already were.

See `docs/Roadmap.md`, 0.7.5, for the full milestone entry.

### Replication Creates Availability; It Does Not Create Authority (0.7.6)

0.7.4 built `application/PeerContentExchange.js#request()` to ask exactly
one peer for one hash. 0.7.5's own `application/
PublicationResolutionCoordinator.js` header named the obvious next step
and declined to build it: asking several peers, one after another, for
content this replica does not yet have. 0.7.6 is that step — a new
`application/PeerContentRetrievalCoordinator.js` that tries an ORDERED
list of candidates until one answers, or all of them don't. Nothing
about WHAT makes a RESPONSE trustworthy changed: `core/
ContentReference.js#verify()` still recomputes the hash of exactly what
arrived, from whichever peer it arrived from, exactly as it has since
0.7.4. What changed is only how many candidates get asked, and in what
order — never who they are, or what they are owed for answering.

**A replica that holds bytes is not the same as a replica that published
them.** Bob retrieving Alice's content puts real bytes in Bob's own
`content/ContentStore.js` — genuine replication, not a resolved verdict
that evaporates on the next page load. It does not put a new entry in
Bob's own `application/LocalPublicationCatalog.js`, does not sign
anything on Bob's behalf, and gives Bob no more claim to have published
Alice's design than a browser's HTTP cache gives it a claim to have
written a web page. `tests/PeerContentRetrievalCoordinator.test.js`'s
own flagship makes this literal: after Carol retrieves the identical
bytes Bob relayed to her, her catalog still holds exactly ONE
publication — Alice's, signed by Alice, unchanged — while her own
`ContentStore` now genuinely has the bytes. Three completely different
facts stay three completely different facts: "I possess these bytes,"
"a signed publication points at them," and "I am the one who signed
that publication." Collapsing any two of those would be a shortcut this
milestone's own design conversation refused to take.

**A publisher relaying a locator is not a second publisher.** `application/
PublicationPeerExchange.js#announce()` has never cared whether a
publication being announced is the caller's own or one it merely
cataloged some other way — Bob re-announcing Alice's ORIGINAL, unedited,
still-Alice-signed envelope to Carol and Dave is exactly that: the same
signed record, one more hop, `publisherIdentity` unchanged. Bob choosing
to publish his OWN envelope for the identical content hash — a distinct
act, with his own signature and his own publication id — is a
genuinely different thing, and both are legitimate at once. `application/
LocalPublicationCatalog.js#findByContentHash()` has returned every
independently signed locator for a hash, none more authoritative than
another, since 0.7.2; 0.7.6 changes nothing about that contract, only
proves it under a live, multi-hop scenario for the first time. No
"latest," no "canonical," no replacement — the identical restraint that
class's own header has held since it was written.

**Resolution asks what; retrieval asks whether.** `application/
PublicationResolutionOutcome.js` answers "what is the state of this
publication" — RESOLVED, CONTENT_UNAVAILABLE, one of the INVALID_*
values. `application/PeerContentRetrievalCoordinator.js#retrieve()`
answers a narrower, operational question: "did THIS attempt, against
THESE candidates, obtain verified bytes?" The two questions look similar
enough to tempt merging them into one enum, and this milestone's own
design conversation refused that temptation directly — a retrieval
outcome is carried on its own `retrieval` field
(`{ retrieved, hash, attemptedPeers, peer?, reason? }`), never folded
into `outcome`, so a caller that only ever cared about the five-year-old
`PublicationResolutionOutcome` contract sees it completely unchanged.
`application/PublicationResolutionCoordinator.js#resolve()` is the one
place both facts ever travel together, and only ever side by side.

**Trying candidate N before candidate N+1 is an ordering, never a
ranking.** `application/PeerContentRetrievalCoordinator.js` introduces
no field anywhere that could hold an opinion about which peer is more
reliable, more trustworthy, or "preferred" — the identical restraint
`application/PeerContentExchange.js`'s own 0.7.4 header already applies
to a single peer, extended here to a list of them. The ORDER candidates
are tried in is entirely the caller's own policy (see `ui/views/
DecentralizedPublicationsView.js` — every currently authenticated peer,
in registry order); this class does not choose it, does not remember
which peer answered last time, and re-derives its answer from scratch on
every call, exactly like `application/
PublicationResolutionCoordinator.js`'s own "always safe, always current"
restraint since 0.7.5.

See `docs/Roadmap.md`, 0.7.6, for the full milestone entry.

### External Anchoring Provides Evidence; It Does Not Establish Authority (0.8.0)

0.7.0's own header already said the words this milestone was built to
keep true the moment a real external system enters the picture:
"Blockchain inclusion does not turn a claim into truth. If Alice signs
'I created blueprint X' and that assertion is anchored where nobody can
ever delete it, the anchor proves Alice's key produced that exact
assertion at that exact time — nothing more." 0.7.0 through 0.7.6 built
the complete decentralized publication and replication loop that
sentence was written against; 0.8.0 is the first milestone that actually
introduces the concept the sentence was warning about, and it introduces
NOTHING that contradicts it. `core/PublicationAnchor.js` is a new kind of
signed record, sized deliberately narrower than every publication or
content object that came before it.

**An anchor is evidence about a hash. It is never a verdict about the
content.** A `PublicationAnchor`'s signature proves exactly one thing:
the named `anchorIdentity` attested that this `contentHash`, for this
`publicationId`, was recorded at this `locator` by whatever external
system `anchorType` names. It proves nothing about whether the anchored
content is authentic, nothing about who designed it, and nothing about
whether the `publisherIdentity` that originally published it (a
completely separate signature, checked separately — see `core/
DecentralizedPublication.js`) is trustworthy. Four independent claims,
never merged: "what are these bytes" (the content hash), "who chose to
publish this locator" (a `DecentralizedPublication`'s own signature),
"who designed this" (`core/BlueprintAttribution.js`'s own signature),
and now "who attests this hash was externally recorded, and where" (a
`PublicationAnchor`'s own signature). Adding a fourth claim to the list
never lets it collapse into, outrank, or stand in for any of the other
three.

**`anchoredAt` is a report, never a fact this replica can independently
establish.** The identical restraint this codebase already applies to a
peer message's `receivedAt` ("Arrival Order Is Never Trust," 0.2.19)
applies here to a second axis: an external system's own claimed record
time. This replica can say "the external system reports this
timestamp." It can never upgrade that report to "this publication was
definitely created at this time" — the external system could be wrong,
lag, or (for a `locator` this replica cannot itself query) simply be
taken on faith. Nothing in `core/PublicationAnchor.js` or `application/
ExternalAnchorVerifier.js` ever treats `anchoredAt` as more than what
the anchoring identity chose to attest.

**Signature validity, proof validity, and content authenticity are three
different questions, verified in that order, and none is ever skipped or
merged.** `identity/LocalAuthorizationVerifier.js#
verifyPublicationAnchor()` answers only the first: did the named
identity really sign exactly this tuple? `application/
ExternalAnchorVerifier.js` answers the second, and only when a caller
supplies a `proofVerifier` for the anchor's own `anchorType` — no such
plugin exists yet anywhere in this codebase, on purpose (see
`docs/Roadmap.md`), so `application/AnchorVerificationOutcome.js` names
`VALID_PROOF_UNVERIFIED` as its own honest, non-rejected outcome rather
than let "genuinely signed" quietly stand in for "proof independently
confirmed." Whether the anchored CONTENT is authentic is the third
question, and no anchor — proof-verified or not — ever answers it;
`application/PublicationResolver.js`'s own ten-step discipline is the
only place that question is ever asked.

**Multiple independent anchors for the identical content are never
collapsed, ranked, or reconciled — the same restraint this codebase has
held for every other kind of competing evidence since 0.7.0.** Two
anchoring identities, in two different external systems, naming two
different locators, can both attest to the SAME `publicationId`/
`contentHash`, and both verify completely independently — `tests/
PublicationAnchorProtocol.test.js`'s own Section C proves exactly this:
verifying a second anchor never touches, invalidates, or supersedes the
first. This is `core/DecentralizedPublication.js`'s own "several
independently signed facts, never reconciled into one" posture for
competing LOCATIONS of the same content, extended here to competing
PIECES OF EVIDENCE about the same content — see also `core/
BlueprintAttributionView.js`/`core/BlueprintLineageView.js`, which have
held the identical line for competing authorship claims since 0.6.x.

**Publishing and anchoring are two different acts, and this milestone
builds no path from one to the other.** A `DecentralizedPublication`
answers "where can a copy of this be found"; a `PublicationAnchor`
answers "what external evidence exists that this was recorded." Nothing
in 0.8.0 makes creating one automatically create the other — no anchor
is ever produced as a side effect of `application/
PublicationResolver.js#publish()`, and no future milestone should make
an expensive or irreversible external operation happen invisibly behind
an ordinary publish action. A person (or a future UI) that wants
external evidence asks for it explicitly, every time.

See `docs/Roadmap.md`, 0.8.0, for the full milestone entry.

### A Proof Verifier Reports "Cannot Presently Verify" Separately From "Proof Is Wrong" (0.8.1)

0.8.0 already drew one line between confidence levels: a genuinely
signed anchor with no `proofVerifier` plugged in
(`AnchorVerificationOutcome.VALID_PROOF_UNVERIFIED`) is never treated as
a rejection just because nobody checked its proof. 0.8.1 draws a SECOND,
narrower line inside the case where a `proofVerifier` for the anchor's
own `anchorType` DOES exist and WAS consulted: even then, "I checked and
it's wrong" and "I tried to check and couldn't get a definite answer"
are never the same outcome.

`anchoring/BitcoinOpReturnProofVerifier.js` is the first plugin in this
codebase that can actually fail in the second way, because it is the
first one that talks to a real, external, sometimes-unreachable system.
A transaction that does not exist yet on the block explorer it queried
might simply not have propagated there; one that exists but is not yet
confirmed might be confirmed a block later; the explorer itself might be
down. None of these says "this proof is fraudulent" — each one only says
"this replica cannot presently tell." `application/
AnchorVerificationOutcome.js`'s own `PROOF_UNAVAILABLE` names exactly
that state, and `application/ExternalAnchorVerifier.js#verify()` reaches
it two ways: a `proofVerifier` that returns
`{ valid: false, unavailable: true, reason }` explicitly, or one that
simply throws — treated identically, because a network error IS an
"unavailable," never a signal to guess.

Only a `proofVerifier` that was ABLE to reach the external system, got a
real answer, and that answer does not back the claimed `contentHash`
reports `INVALID_PROOF` — `anchoring/BitcoinOpReturnProofVerifier.js`'s
own Section D (`tests/BitcoinOpReturnProofVerifier.test.js`) proves the
distinction directly: a confirmed, reachable transaction whose OP_RETURN
output carries the WRONG data is a definite rejection, while the
identical transaction simply not found, or not yet confirmed, is
`PROOF_UNAVAILABLE` — never collapsed into each other in either
direction. A caller that conflated the two would either reject honest,
temporarily-unreachable evidence as fraudulent, or accept "couldn't
check" as "checked and fine" — both are worse than three separate,
honestly-named outcomes.

### External Evidence Adapters Never Change What PublicationAnchor Means (0.8.1)

0.8.0 built `core/PublicationAnchor.js`, `application/
ExternalAnchorVerifier.js`, and `application/
AnchorVerificationOutcome.js` with an open `proofVerifier` seam and
NOTHING plugged into it — deliberately, so that when a real backend
eventually arrived, "plugging it in" would be the entire scope of the
work, not an excuse to revisit what an anchor is or what verifying one
means. `anchoring/BitcoinOpReturnProofVerifier.js` is that real backend,
and it changes exactly what 0.8.0's own header promised it would: one
new file implementing the existing `{ anchorType, verify(proof, context)
}` contract, and nothing else.

`core/PublicationAnchor.js` gained no Bitcoin-shaped field. `anchorType`
is still an open string; `bitcoin-op-return` is one value among however
many a caller ever chooses to use, never a privileged one baked into the
class, the validator, or the signing descriptor. `application/
ExternalAnchorVerifier.js`'s own five-step pipeline — validate, construct,
verify signature, cross-check, optionally verify proof — is completely
unchanged in shape; the only additions are that step 5 can now resolve
its plugin from a registry instead of always requiring one supplied
directly, and that its result can now be a THIRD honest outcome
alongside the two 0.8.0 already had (see "A Proof Verifier Reports
'Cannot Presently Verify' Separately From 'Proof Is Wrong' (0.8.1)"
above). No `verified: true` field appears anywhere in `core/
PublicationAnchor.js` — verification stays what 0.8.0 already made it:
something computed fresh, every time, by calling `ExternalAnchorVerifier
#verify()` again, never something stored and trusted stale.

`application/ExternalProofVerifierRegistry.js` is the one piece of new
composability 0.8.1 actually adds, and it is deliberately dumb: a
`Map<anchorType, proofVerifier>` and nothing more. It never verifies
anything itself, never imports `anchoring/
BitcoinOpReturnProofVerifier.js` or any other concrete adapter, and
`application/ExternalAnchorVerifier.js` never imports the registry
either — both are wired together explicitly by a caller (see
`application/CreateExternalAnchorVerifierUseCase.js`'s own
`proofVerifiers` option), the identical "generic pipeline, concrete
plugin wired at the composition root" split `application/
PublicationResolver.js`'s own `kindPlugin` has held since 0.7.0. A
second, third, or hundredth real anchorType — an Ethereum contract event,
an OpenTimestamps calendar server, a notarization API — plugs in the
same way: implement `anchoring/ProofVerifier.js`'s own tiny contract,
register it, and change nothing about `core/PublicationAnchor.js`,
`application/ExternalAnchorVerifier.js`, or any anchor already signed
under a different `anchorType`.

See `docs/Roadmap.md`, 0.8.1, for the full milestone entry.

### Cataloging External Evidence Does Not Validate External Evidence (0.8.2)

`application/LocalPublicationCatalog.js`'s own 0.7.2 header already drew
this line for a different axis — "Discovery Is Not Resolution" — and
0.8.2 draws the identical line for evidence instead of locators.
`application/LocalPublicationAnchorCatalog.js#add()` records that a
`PublicationAnchor` exists and that this replica has seen it. It never
records, computes, or implies whether that anchor is genuinely signed,
whether its proof holds up, or whether it should be trusted at all.

**The catalog answers "what anchor claims do I know about?" The verifier
answers "what can I independently establish about one of those claims
right now?" Nothing in this codebase is ever allowed to collapse those
into one question.** `application/AddPublicationAnchorUseCase.js` runs
exactly two steps — validate the envelope's own structure, construct a
real `PublicationAnchor` — and stops. It never calls `identity/
LocalAuthorizationVerifier.js#verifyPublicationAnchor()`, never calls
`application/ExternalAnchorVerifier.js#verify()`, and never touches a
network. `tests/PublicationAnchorCatalog.test.js`'s own Section D proves
this directly: an unsigned, outright forged anchor catalogs exactly as
cleanly as a genuinely valid one, and a spy `proofVerifier` that would
fail its own assertion if `AddPublicationAnchorUseCase` ever called it
is never invoked by cataloging, under any circumstance.

**No verification outcome is ever stored beside a cataloged anchor.**
`application/LocalPublicationAnchorCatalog.js`'s stored record holds only
the signed envelope itself and `receivedAt`, the one fact genuinely local
to this replica and never part of what any identity signed — the same
restraint `application/LocalPublicationCatalog.js` already applies to a
`DecentralizedPublication`'s own `receivedAt`. No `verified`,
`verificationOutcome`, `verificationTimestamp`, or `verificationReason`
field exists anywhere in this class, and none should ever be added to
it: a verification result computed once and cached beside the anchor it
was computed for would silently reintroduce the exact "checked once,
trusted forever" shortcut `application/ExternalAnchorVerifier.js`'s own
0.8.0 header already refused — an external system's confirmation state
can change (a transaction gets confirmed later; a previously-unreachable
explorer comes back), and a stale cached "PROOF_UNAVAILABLE" or even a
stale cached "VALID" would misrepresent it. Verification stays what
0.8.0 already made it: computed fresh, every time, by calling
`ExternalAnchorVerifier#verify()` again.

**Multiple independent anchors for the same evidence are cataloged
exactly as multiple independent anchors, never merged, ranked, or
resolved to one.** `application/LocalPublicationAnchorCatalog.js#
findByPublicationId()` and `#findByContentHash()` both always return
every matching anchor this replica has cataloged, in the same
deterministic most-recently-received order `#list()` uses — the
identical "several independently signed facts, never reconciled into
one" posture `docs/Principles.md`'s own 0.8.0 entry already held for
verification, extended here to storage. `tests/
PublicationAnchorCatalog.test.js`'s own Section C proves this with three
coexisting anchors — two independent anchoring identities under two
different anchorTypes for the identical publicationId/contentHash, plus
a third, unrelated publication's own anchor — and confirms no lookup on
this catalog ever narrows any of them down to a "canonical" one.

**Cataloging an anchor still builds no path from evidence to peer
exchange.** 0.8.2 deliberately ships no `PublicationAnchorExchange` and
no anchor gossip — `application/AddPublicationAnchorUseCase.js` only
ever admits an anchor a caller already holds, with no untrusted-arrival
transport boundary for a signature check to guard. A future milestone
that DOES add that transport reuses `application/
PublicationExchange.js`'s own proven `validate → construct → verify
signature → catalog` shape rather than inventing a new one, exactly as
0.8.1's own "Deliberately excluded" list already anticipated.

See `docs/Roadmap.md`, 0.8.2, for the full milestone entry.

### Known Evidence Is Not Verified Evidence, And Verified Evidence Is Not Authority (0.8.3)

0.8.2's own header drew the discovery/verification line in the
application layer: "The catalog answers 'what anchor claims do I know
about?' The verifier answers 'what can I independently establish about
one of those claims right now?'" 0.8.3 is the milestone that makes a
PERSON able to see that same line, in the Publication Center, without
either question ever quietly answering the other.

**Discovery is always visible; verification is never automatic.**
`application/PublicationEvidenceCoordinator.js#discover()` is
synchronous, local-only, and runs the moment `ui/views/
DecentralizedPublicationsView.js`'s own list loads — a person sees "N
anchors known" for free, the same way they already see how many
publications this replica has cataloged. `#verify()` is the opposite in
every way that matters: asynchronous, may reach a real external system,
and runs ONLY when a person clicks "Verify Evidence" on one specific
anchor. Opening the Publication Center, expanding its evidence section,
or a fresh anchor simply arriving in the catalog — none of these ever
calls `application/ExternalAnchorVerifier.js`. `tests/
PublicationEvidenceUX.test.js`'s own Section D proves this with a
spying verifier that would fail if `discover()` — called repeatedly —
ever consulted it, and never does.

**No verification result is ever stored anywhere a later lookup could
find it.** Not on `core/PublicationAnchor.js`, not on `application/
LocalPublicationAnchorCatalog.js`, and not in any new storage this
milestone might have added instead — the identical restraint 0.8.2's own
principle above already states for the catalog, now held by the UI
layer too. A verification outcome lives only in `ui/views/
DecentralizedPublicationsView.js`'s own ephemeral `entry.verifications`,
exactly as long as that page stays open. This is not an oversight to be
fixed by adding a cache: an external system's own confirmation state can
change between two checks of the identical anchor — a transaction
confirms, an explorer that was unreachable comes back — and a value
computed once and trusted forever would misrepresent that. Verification
stays what 0.8.0 already made it: computed fresh, every time, by asking
again.

**Every outcome keeps its own word, and none of them says "trust."**
`application/PublicationEvidenceView.js#describeVerificationOutcome()`
gives each of the seven `AnchorVerificationOutcome` values its own
distinct label — "Independently verified" for `VALID`, "Proof not
independently verified" for `VALID_PROOF_UNVERIFIED`, "Verification
unavailable" for `PROOF_UNAVAILABLE`, and four more, down to "Invalid
external proof" for `INVALID_PROOF` — and never collapses any of them
into a shared "unverified" bucket, the same discipline `application/
AnchorVerificationOutcome.js`'s own 0.8.1 header already demanded of
every CALLER of `ExternalAnchorVerifier#verify()`, now honored by its
first UI. None of the seven labels ever uses the vocabulary this
milestone's own design deliberately excluded — "trusted," "authentic,"
"official," "confirmed author," "canonical" — because none of those
questions is one this codebase, at any layer, has ever answered. See
`docs/Principles.md`, "External Anchoring Provides Evidence; It Does Not
Establish Authority (0.8.0)," which this milestone's UI extends, not
revises.

**A verified transaction is not automatically evidence for the
publication on screen.** `ui/views/DecentralizedPublicationsView.js`
shows every anchor's own claimed `publicationId`/`contentHash` alongside
its verification badge — not merely a "Bitcoin ✓" — and `application/
PublicationEvidenceCoordinator.js#verify()` always cross-checks against
the SPECIFIC publication a person is looking at, exactly the guard that
turns a stray but genuinely-verified anchor for a DIFFERENT publication
into an honest `CONTENT_MISMATCH` rather than a false confirmation.

**No anchor is ever ranked, summed, or selected as canonical.** Several
independent anchors for the same publication are listed in the same
order `application/LocalPublicationAnchorCatalog.js` itself already
uses, each with its own independent verification state; nothing this
milestone added ever picks a "best" one, weighs several `VALID` outcomes
into a stronger claim, or derives "therefore this publication is
authoritative" from any count of anchors, verified or not.

See `docs/Roadmap.md`, 0.8.3, for the full milestone entry.

### Signature Verification Is Not Proof Verification (0.8.4)

0.8.0's own header already distinguished a `PublicationAnchor`'s
signature from the external proof it names: "verifying an anchor's
signature proves only that the named `anchorIdentity` really did sign
exactly this tuple. Verifying the `proof` itself... is a SEPARATE,
anchorType-specific question." 0.8.4 is the milestone that turns that
distinction into an actual second class, because a peer transport finally
needs it: `application/PublicationAnchorExchange.js` runs every incoming
anchor through validate -> construct -> verify SIGNATURE -> catalog,
stopping exactly where `application/AddPublicationAnchorUseCase.js`
(0.8.2) already stopped one step earlier, and exactly where
`application/ExternalAnchorVerifier.js` (0.8.0-0.8.1) goes one step
further.

**Three questions, three answerers, never conflated.** "Is this
envelope well-formed?" is `application/PublicationAnchorValidator.js`,
unchanged since 0.8.0. "Did the claimed identity really sign it?" is now
`application/PublicationAnchorExchange.js#importAnchor()`, calling
`identity/LocalAuthorizationVerifier.js#verifyPublicationAnchor()`
directly — REQUIRED, never optional, for anything arriving over
`application/PublicationAnchorPeerExchange.js`. "Does the external
system actually substantiate the claim?" stays entirely
`application/ExternalAnchorVerifier.js`'s own question, asked separately,
asked explicitly, asked only when a person clicks "Verify Evidence" —
`tests/PublicationAnchorPeerExchange.test.js`'s own Section B and C each
prove this with a spy `ExternalAnchorVerifier` that would fail the
moment `importAnchor()` — called any number of times — ever touched it,
and never does.

**A forged signature is refused before the catalog ever sees it; an
unreachable external system never is.** This is the one behavioral
difference between the two "add an anchor" paths this codebase now
carries side by side: `application/AddPublicationAnchorUseCase.js`
catalogs a well-formed-but-unsigned or forged anchor cleanly, because a
caller using it already trusts the anchor some other way (its own
freshly-signed record, an already-vetted import). `application/
PublicationAnchorExchange.js` refuses the identical forged record
outright, because an anchor arriving from a stranger over a peer
connection carries no such standing trust — see `tests/
PublicationAnchorPeerExchange.test.js` Section B, item 10, run against
the exact tampering `tests/PublicationAnchorCatalog.test.js` Section D
shows the OTHER use case tolerating. Neither use case was changed to
agree with the other; they answer different questions for different
callers, on purpose.

See `docs/Roadmap.md`, 0.8.4, for the full milestone entry.

### Peers Exchange Anchor Claims, Not Verification Results (0.8.4)

0.7.3's own principle already drew this line for publications: "a peer
connection transports... it does not resolve." 0.8.4 draws the identical
line one evidence layer over, and states it as its own invariant because
an anchor's very reason to exist is a VERIFIABLE claim about an external
system — the temptation to shortcut peer-to-peer trust by also gossiping
"and by the way, I checked, it's VALID" is real, and this milestone
exists in part to structurally foreclose it.

**What crosses the wire is exactly `PublicationAnchor.toJSON()`, nothing
more.** `application/PublicationAnchorPeerProtocol.js#
toPublicationAnchorAnnounceMessage()` wraps only `{ kind, envelope }` —
`tests/PublicationAnchorPeerExchange.test.js` Section A asserts the
wrapper carries exactly two keys, and Section C asserts the envelope a
live `announce()` actually sends carries no `verified` or
`verificationOutcome` field anywhere on it. No field for a verification
outcome, a confidence score, or a "checked by" identity was added to the
wire shape, to `core/PublicationAnchor.js`, or to `application/
LocalPublicationAnchorCatalog.js` — an anchor's signed payload is
unchanged from 0.8.0, byte for byte, whether it travelled zero peer hops
or several.

**Receiving an anchor is never verifying it.**
`application/PublicationAnchorPeerExchange.js#_handleIncoming()` never
calls `application/ExternalAnchorVerifier.js` — the single most important
restraint this class exists to enforce, named directly in its own header.
"Another replica told me about this evidence claim" and "the evidence has
been verified" stay two separate facts a person can hold about the exact
same anchor, exactly as separate as 0.8.2 already kept "cataloged" from
"verified" for an anchor that arrived by any other means.

**Authentication gates who a claim is sent to, never whether a received
claim is believed.** `application/PublicationAnchorPeerExchange.js#
announce()` sends only to peers `PeerLifecycleState.AUTHENTICATED` — the
identical channel-level gate `application/PublicationPeerExchange.js`
already applies to publications — but authentication is never asked to
do double duty as an authority mechanism. An anchor's own signature,
checked entirely inside `application/PublicationAnchorExchange.js`, is
the only thing that ever makes it acceptable; `_handleIncoming()` never
reads which connection a message arrived over, and this codebase adds no
notion of a "trusted peer" or "trusted anchor source" anywhere in this
milestone. `tests/PublicationAnchorPeerExchange.test.js` Section D proves
this is not merely a missing feature but an observed property: the exact
same claim, relayed through Bob, reaches Carol with an identical
signature to the one Alice produced — Bob's participation as a relay
changes the claim's PATH, never its CONTENT, and never grants Bob any
say over whether Carol should believe it.

**Verification stays local, and independently local, even for the
identical claim.** Section D's flagship gives Bob and Carol the exact
same signed anchor and two different, entirely honest, entirely
independent answers: Bob's own external system reports `VALID`; Carol's
own external system is unreachable and reports `PROOF_UNAVAILABLE`.
Neither result is ever written back into the shared claim, ever
transmitted to the other replica, or ever changes what the other replica
is able to independently determine for itself. A network of replicas
sharing anchors converges on a shared set of CLAIMS; it is never made to
converge on a shared VERDICT, because no verdict this codebase computes
was ever meant to be shared in the first place — see `docs/
Principles.md`, "External Anchoring Provides Evidence; It Does Not
Establish Authority (0.8.0)," which this milestone's transport extends
across a network, not past.

See `docs/Roadmap.md`, 0.8.4, for the full milestone entry.

### Synchronization Distributes Claims, Not Verification, Truth, Or Authority (0.8.5)

0.8.4 gave replicas a PUSH: an authenticated peer that happens to be
connected when an anchor is announced hears about it. 0.8.5 gives them a
PULL: a replica that connects LATER can explicitly ask for anchors it
missed. The mechanism is new — `application/
PublicationAnchorPeerProtocol.js`'s own `REQUEST`/`RESPONSE` pair,
`application/PublicationAnchorPeerExchange.js#requestAnchors()`/
`_handleRequest()`/`_handleResponse()` — but the invariant is not: this
milestone exists specifically to prove that adding a pull-based transport
never widens what actually crosses the wire.

**A RESPONSE is answered from THIS replica's own catalog, and nothing
else.** `_handleRequest()` never forwards a REQUEST to a third peer, and
never aggregates what OTHER peers might know — see docs/Roadmap.md,
0.8.5, "Deliberately excluded," on relayed/transitive discovery. A
replica can only ever tell another replica what IT itself has cataloged,
the identical restraint that already governs who can `announce()`
anything at all.

**Every anchor in a RESPONSE is verified exactly as strictly as one
ANNOUNCE always was — there is no bulk-trust shortcut.**
`_handleResponse()` runs each envelope in the batch through the IDENTICAL
`application/PublicationAnchorExchange.js#importAnchor()` call an
ANNOUNCE already used: validate, construct, verify SIGNATURE, catalog.
`tests/PublicationAnchorPeerExchange.test.js`'s own Section C proves a
forged anchor anywhere in a RESPONSE array is rejected exactly like a
forged ANNOUNCE, and — the one property specific to a BATCH transfer —
that one bad envelope never blocks a genuine sibling elsewhere in the
same array. Synchronizing ten anchors at once is never treated as ten
times more trustworthy than synchronizing one; each one still stands or
falls entirely on its own signature.

**A RESPONSE carries claims, never metadata about how this replica came
to know them.** `application/PublicationAnchorPeerProtocol.js#
toPublicationAnchorResponseMessage()`'s own wire shape is `{ kind,
publicationId, anchors }` — plain `PublicationAnchor.toJSON()` envelopes,
nothing else. No `receivedAt`, no verification outcome, and no "which
peer told me this" field was added anywhere. `receivedAt` in particular
stays exactly what 0.8.2 already made it: the LOCAL moment a replica's
OWN catalog first saw an anchor, never a value carried over from
whichever peer relayed it — `tests/PublicationAnchorPeerExchange.test.js`
Section D's own late-joiner flagship makes this concrete: Bob has held an
anchor for some time by the moment Carol connects and requests it, yet
Carol's own `receivedAt` is recorded fresh, at the moment SHE first heard
about it, never copied from Bob's.

**THE central invariant extends completely unchanged: neither new
handler ever calls `application/ExternalAnchorVerifier.js`.**
`_handleRequest()` answering a REQUEST and `_handleResponse()` importing
a RESPONSE both stay exactly where `_handleIncoming()` already stopped
for an ANNOUNCE — a synchronized anchor is exactly as unverified, on
arrival, as an announced one always was. `tests/
PublicationAnchorPeerExchange.test.js`'s own late-joiner flagship proves
the strongest version of this: Alice, Bob, and Carol each independently
verify the IDENTICAL synchronized claim and reach three different,
equally honest answers (VALID / PROOF_UNAVAILABLE / VALID) — verification
never depended on whether an anchor arrived via ANNOUNCE or via
synchronization, because nothing about HOW a claim arrived was ever part
of what gets verified.

See `docs/Roadmap.md`, 0.8.5, for the full milestone entry.

### Evidence Set Convergence Does Not Imply Truth Convergence (0.8.5)

`application/PublicationAnchorDiscoveryCoordinator.js`'s own flagship
sets up the exact asymmetry this principle is named for: Alice starts
knowing only Anchor A, Bob knows both A and B, Carol starts knowing only
B. After each of Alice and Carol runs `discoverFromPeers()` against Bob,
all three replicas hold the identical SET of two claims — `{A, B}`
everywhere. That is real, observable convergence, and this codebase is
happy to call it that. What it is not, and what no code in this
milestone was ever allowed to become, is convergence on what those claims
MEAN.

**Convergence is a property of the catalog, never a property of the
claims' own truth.** Nothing added in 0.8.5 computes a "most complete"
peer, ranks a replica that holds more anchors above one that holds fewer,
or treats a converged set as more authoritative than any individual
member of it. `application/PublicationAnchorDiscoveryCoordinator.js#
discoverFromPeers()` returns `{ publicationId, attemptedPeers,
discovered }` — an operation log of what was asked and what came back —
never a verdict, a score, or a "consensus" field. Two anchors that
directly CONTRADICT each other (different `anchorType`s, different
locators, even opposite claims about the same publication) converge onto
the same replica exactly as harmlessly as two that agree; see `core/
PublicationAnchor.js`'s own header and `docs/Principles.md`, "External
Anchoring Provides Evidence; It Does Not Establish Authority (0.8.0)," on
why multiple anchors were never meant to be reconciled into one verdict
in the first place.

**Deduplication is not agreement.** When Alice and Carol both discover
Anchor A through Bob, `application/LocalPublicationAnchorCatalog.js#
add()`'s own id-based dedup (0.8.2) means each ends up with exactly ONE
cataloged copy — never two redundant entries, and never a "confirmed by N
peers" counter either. Convergence here means "the set no longer differs
between replicas," never "N independent sources agree this is true" — no
code anywhere counts how many peers offered the same anchor, because
peer-count was never meant to stand in for evidentiary weight. A single
peer's RESPONSE and ten peers' identical RESPONSEs produce the exact same
cataloged outcome.

**Verification stays exactly as independent after synchronization as it
was before it.** `application/PublicationAnchorPeerExchange.js#
_handleResponse()`'s own header already establishes that a synchronized
anchor is exactly as unverified on arrival as an announced one — this
principle names the natural next question and forecloses it too: once
Alice and Carol both hold Anchor B, nothing about EITHER replica now
holding it changes what the OTHER can independently determine about it.
A converged evidence set is not a step toward a converged verdict; it is
the complete, final shape of what this layer of the system was ever built
to share. Whether — and how — several independently-held, possibly
disagreeing anchors for the SAME publication might ever be reasoned about
together is 0.8.6's own question, deliberately unopened here.

See `docs/Roadmap.md`, 0.8.5, for the full milestone entry.

### Evidence Relationships Are Derived, Never Adjudicated (0.8.6)

0.8.5's own closing question — "whether, and how, several
independently-held, possibly disagreeing anchors for the SAME
publication might ever be reasoned about together" — gets exactly one
answer in 0.8.6, and it is a narrow one: they can be COMPARED, never
RESOLVED. `application/PublicationEvidenceConvergence.js#
derivePublicationEvidenceConvergence()` is the first module in this
codebase that looks at more than one anchor for the same publicationId
at once and says something about how they relate. What it says is
strictly structural: do these anchors' own `contentHash` values agree
with each other, and (optionally) with an `expectedContentHash` the
caller already knows. What it never says, under any circumstance, is
which anchor is right.

**Detecting a conflict and adjudicating one are different acts, and this
codebase now performs exactly the first.** When cataloged anchors for a
publicationId carry more than one distinct `contentHash`,
`derivePublicationEvidenceConvergence()` reports `contentBindingConflict:
true` and the true partition in `contentHashGroups` — nothing is
dropped, hidden, or quarantined for disagreeing. `tests/
PublicationEvidenceConvergence.test.js`'s own flagship makes the
strongest version of this concrete: three anchors agree on one
`contentHash`, a fourth disagrees, and the derived result names the
fourth `DIFFERS_FROM_EXPECTED` — never `INVALID`, `MALICIOUS`, or
`REJECTED`, and never omitted from `anchorCount` for being the odd one
out. The larger group is never treated as more authoritative for
outnumbering the smaller one either: `contentHashGroups` reports both
group sizes honestly and stops there, exactly as `application/
PublicationAnchor.js`'s own header already required for a single pair of
competing anchors, now proven to hold for a set of four considered
together.

**No field in the derived result can be summed, sorted, or thresholded
into a verdict.** There is no `EvidenceTrustScore`, `EvidenceAuthority`,
`EvidenceConfidence`, `EvidenceRank`, `EvidenceStrength`, or
`EvidenceConsensus` anywhere in `application/
PublicationEvidenceConvergence.js`, and none was ever a step this
milestone took and then hid — `tests/
PublicationEvidenceConvergence.test.js`'s own flagship asserts this
directly, scanning the derived result's own serialized form for any
trace of "authority," "trust," "winner," "consensus," "correct,"
"malicious," or "reject." The distinction this principle draws is the
same one `docs/Principles.md`, "External Anchoring Provides Evidence; It
Does Not Establish Authority (0.8.0)," drew for a SINGLE anchor,
extended here to however many a replica has converged on: multiplicity
is never manufactured into authority, agreement is never manufactured
into truth, and a structural relationship between two claims is never
manufactured into a decision about which claim to believe.

See `docs/Roadmap.md`, 0.8.6, for the full milestone entry.

### Verification Observations Stay Local Even Under Comparison (0.8.6)

0.8.4 and 0.8.5 already established that verification outcomes never
cross the wire — an ANNOUNCE, a REQUEST, and a RESPONSE all carry
evidence claims and nothing about who verified what. 0.8.6 is the first
milestone whose whole purpose is to READ verification outcomes
alongside other evidence, which raises the one question those earlier
milestones never had to answer: does COMPARING two replicas' local
observations count as exchanging them? This principle's answer is no,
and the discipline that keeps it no is entirely about which module ever
sees more than one replica's observations at once.

**`application/PublicationEvidenceConvergence.js` never receives more
than one replica's own `verificationByAnchorId` map in a single call.**
There is no parameter for "which replica observed this," no way to
merge two maps into one, and no code path that could average, tally, or
prefer one replica's observation over another's — because the function
is never handed both at the same time in the first place. A caller that
wants to compare Alice's and Bob's independent observations of the
identical anchor calls this function TWICE, once against each replica's
own local state, and compares the two plain JavaScript objects that come
back ENTIRELY OUTSIDE this module — `tests/
PublicationEvidenceConvergence.test.js`'s own flagship does exactly
this: Alice's own `identity/LocalAuthorizationVerifier.js` reports
Anchor A `VALID`; Bob's independently reports the identical anchor
`PROOF_UNAVAILABLE` (his own external system happens to be unreachable
right now); each replica's own derived view carries only its own
observation, and neither is ever synthesized into a shared answer.

**A local verification observation never changes another axis of the
same derived result.** Supplying `verificationByAnchorId` populates the
`verification` field on the matching anchor entries and nothing else —
`contentBindingConflict`, `contentHashGroups`, `matchingAnchorIds`, and
`divergentAnchorIds` are computed purely from the anchors' own
`contentHash` values and stay identical whether or not any verification
was ever supplied at all. Structural relationships and local
observations are answers to two different questions, and one is never
allowed to leak into the other's result — the same separation of
concerns `docs/Principles.md`, "Signature Verification Is Not Proof
Verification (0.8.4)," already drew one layer down, extended here to a
third, independent axis.

See `docs/Roadmap.md`, 0.8.6, for the full milestone entry.

### Package Import Is Evidence Ingestion, Not Evidence Verification (0.8.7)

0.8.4 drew this line for a peer connection: `application/
PublicationAnchorExchange.js#importAnchor()` validates an envelope,
constructs it, and verifies its SIGNATURE — and stops there, never once
calling `application/ExternalAnchorVerifier.js`. 0.8.7 draws the
identical line for the other way an anchor can now arrive: bundled
inside an `application/BlueprintPackage.js`. Importing a package that
carries three anchors catalogs three CLAIMS. It proves nothing about any
of them.

**`application/ImportPackageAnchorsUseCase.js` calls
`PublicationAnchorExchange#importAnchor()` and nothing else.** No new
call to `application/ExternalAnchorVerifier.js` exists anywhere in this
class, or anywhere else this milestone touches — `tests/
PublicationAnchorPackageImport.test.js`'s own Section C proves this with
a spy `ExternalAnchorVerifier` that increments a counter every time it is
consulted: importing a package bundling a genuine anchor, a forged one,
and a structurally malformed one leaves that counter at zero throughout.
An explicit `verify()` call afterward — a deliberate, separate action —
is what moves the counter to one, exactly mirroring the identical
spy-verifier proof `tests/PublicationAnchorPeerExchange.test.js` already
ran for peer-delivered anchors in 0.8.4.

**A package is untrusted, portable data — exactly like a peer message —
so its anchors get exactly the same gate, never a looser one.** A
forged or tampered anchor bundled in a package is rejected at the
identical `identity/LocalAuthorizationVerifier.js#
verifyPublicationAnchor()` boundary a forged anchor arriving over
`application/PublicationAnchorPeerExchange.js` already is — see `docs/
Principles.md`, "Signature Verification Is Not Proof Verification
(0.8.4)." Nothing about arriving inside a `.json` file someone emailed,
rather than over a live authenticated connection, earns an anchor any
more standing trust.

**The Section D flagship makes the positive case.** Bob imports a
package bundling a Blueprint, an attribution, a lineage claim, and a
Bitcoin anchor from Alice, catalogs the anchor, and derives a full
`application/PublicationEvidenceConvergence.js` view over it — correctly
reporting one known anchor, one anchorType, no content-binding conflict
— entirely BEFORE he ever calls `ExternalAnchorVerifier.verify()` on it.
Evidence discovery, evidence comparison, and evidence verification stay
three separate steps, in that order, exactly as every milestone since
0.8.0 has insisted — package transport is simply a fourth way to reach
the first step, never a shortcut past the third.

See `docs/Roadmap.md`, 0.8.7, for the full milestone entry.

### Importing Evidence Preserves The Claim; It Does Not Repair The Claim (0.8.7)

A `BlueprintPackage` bundles a `Structure`; a `PublicationAnchor`
describes evidence about a `DecentralizedPublication`. This codebase has
never had a concept of "the publication a given Blueprint Package is
about" — no field on `application/BlueprintPackage.js` names one, and
0.8.7 does not invent one merely because a package can now also carry
anchors. That absence is deliberate, not an oversight this milestone
should have fixed.

**`application/ImportPackageAnchorsUseCase.js` never cross-checks a
bundled anchor's `publicationId`/`contentHash` against anything about the
package it arrived in, because there is nothing structurally binding the
two.** An anchor naming `publicationId: "pub-x"` bundled inside a package
whose `structure` has nothing at all to do with `pub-x` is exactly as
importable as one that agrees — this class has no basis to judge
"agreement" in the first place, and does not pretend to. The anchor's own
`publicationId`/`contentHash` fields are preserved byte-for-byte, exactly
as `application/PublicationAnchorExchange.js` already preserves them for
a peer-delivered anchor.

**Whether a bundled anchor's claims agree with what a caller separately
knows is `application/PublicationEvidenceConvergence.js`'s own question,
asked afterward, never this milestone's to pre-empt.** A caller that
wants to know whether an imported anchor's `contentHash` matches a
publication it has separately resolved passes `expectedContentHash` to
`ExternalAnchorVerifier.verify()`, or supplies the anchor to
`derivePublicationEvidenceConvergence()` alongside others — both existing
mechanisms, both unchanged by this milestone, both already built to
detect and report a mismatch without ever silently rewriting one side of
it. See `docs/Principles.md`, "Evidence Relationships Are Derived, Never
Adjudicated (0.8.6)" — a package importer that "fixed" a bundled anchor's
`publicationId` to match its own package would be adjudicating a claim
under a different name, the exact outcome that principle already forbids.

**No provenance of the package itself is ever written into the anchor.**
No `importedFromPackage`, `packageId`, or similar field was added to
`core/PublicationAnchor.js` — the signed envelope a package carries is
identical to the one a peer connection would have carried for the same
claim, and stays exactly as portable leaving this milestone's own import
path as it was arriving. `application/LocalPublicationAnchorCatalog.js#
receivedAt` remains this codebase's one place for local arrival
metadata, unchanged.

See `docs/Roadmap.md`, 0.8.7, for the full milestone entry.

### Creating an Anchor Claim Does Not Create External Evidence (0.8.8)

`application/CreatePublicationAnchorUseCase.js` is the first thing this
codebase has ever built that produces a brand-new `core/
PublicationAnchor.js` on ForkBuild's own initiative, rather than
receiving one from a stranger (0.8.4's peer exchange) or a portable file
(0.8.7's package import). That is a genuinely new capability, and it
would be easy to let it quietly cross a line every milestone since 0.8.0
has held: **ForkBuild can create a signed assertion that an external
system recorded a publication, but the assertion becomes independently
established evidence only through verification against that external
system.**

`execute()` never imports, constructs, or calls `application/
ExternalAnchorVerifier.js`, anywhere. `tests/PublicationAnchorCreation.test.js`'s
own Section D proves it with a spy authorization verifier: creating an
anchor — deriving its contentHash, signing it, self-checking that
signature, and cataloging it — consults the spy exactly once, for the
mandatory signature self-check `application/
BlueprintAttributionUseCase.js#publish()` already performs before
persisting anything, and zero times for anything proof-related. The same
section then takes the freshly created anchor and feeds it to a real
`ExternalAnchorVerifier` four separate times, each with a different
(or absent) proof verifier, and gets back all four of `application/
AnchorVerificationOutcome.js`'s distinct values in turn —
`VALID_PROOF_UNVERIFIED`, `VALID`, `INVALID_PROOF`, `PROOF_UNAVAILABLE`
— proving that nothing about HOW an anchor was created (by hand here, by
a stranger over a peer connection, unpacked from a package) has any
bearing on what verifying it later can conclude.

This gives the evidence architecture a fourth, permanently distinct
question, cutting across every milestone since 0.8.0 rather than adding
a new axis to any one of them:

```text
create a claim         (0.8.8, application/CreatePublicationAnchorUseCase.js)
    ≠
recording by the external system   (never this codebase's to perform)
    ≠
proof verification     (0.8.1, application/ExternalAnchorVerifier.js)
    ≠
authority               (never established anywhere in this codebase)
```

A Bitcoin anchor `CreatePublicationAnchorUseCase` creates today from a
`txid` a caller already obtained can report `PROOF_UNAVAILABLE` this
afternoon and `VALID` tomorrow, without the anchor itself changing at
all — the identical temporal restraint 0.8.1 already established, now
proven to hold across the creation boundary too, not just the import one.

**Creation is also where this codebase's one deliberate CREATE/IMPORT
asymmetry lives.** `CreatePublicationAnchorUseCase` derives `contentHash`
from a looked-up publication's own `contentReference.hash` — there is no
`contentHash` option a caller could supply instead — because this is the
one path where the claim being produced is ForkBuild's own, not a
stranger's already-signed envelope arriving over a peer connection
(0.8.4) or inside a package (0.8.7). Guaranteeing a locally CREATED
anchor cannot misname the publication it is about is not evidence
adjudication — `application/PublicationEvidenceConvergence.js`'s
restraint against ranking or reconciling independent anchors (0.8.6) is
completely untouched, and an anchor arriving by any other path still
carries its claims exactly as signed, unexamined against anything this
replica separately believes:

```text
create locally    → validate against a known publication (0.8.8)
import externally → preserve the external claim, unchanged (0.8.4/0.8.7)
```

See `docs/Roadmap.md`, 0.8.8, for the full milestone entry.

### Broadcast Acceptance Is Not Anchor Validity (0.8.9)

`anchoring/BitcoinAnchorPublisher.js` is the first thing this codebase has
ever built that performs a real external-system OPERATION rather than
merely checking or claiming one — it asks Bitcoin to record a
contentHash. That is new enough ground that it would be easy to let a
successful broadcast quietly start meaning more than it does. It does
not. A `{ published: true, locator, proof }` result means exactly one
thing: **the external system accepted this transaction for broadcast —
nothing about whether it will confirm, nothing about whether it already
has, and nothing about whether the claim eventually built from it will
verify.**

This gives the evidence architecture a lifecycle with four permanently
distinct steps, each owned by a different class that never imports the
others:

```text
create the transaction     (0.8.9, anchoring/BitcoinAnchorPublisher.js)
    ≠
broadcast acceptance       (a network-layer fact, not evidence at all)
    ≠
create the claim            (0.8.8, application/CreatePublicationAnchorUseCase.js)
    ≠
proof verification          (0.8.1, application/ExternalAnchorVerifier.js)
```

`tests/BitcoinAnchorCreationAdapter.test.js`'s own Section A and B prove
this directly, against one shared fake Bitcoin network rather than two
disconnected fakes: Alice's publisher broadcasts a transaction that is
accepted but unconfirmed; the `PublicationAnchor` built from that
evidence, fed to a real `ExternalAnchorVerifier` by Bob — who holds none
of Alice's publisher or broadcaster state — reports `PROOF_UNAVAILABLE`,
never `VALID`, while the transaction remains unconfirmed. The SAME fake
network then confirms the SAME transaction, and the SAME anchor,
byte-for-byte unchanged, now reports `VALID`. Nothing about the anchor
itself ever moved; only the external world did. This is the identical
temporal restraint 0.8.1 already established for evidence arriving by any
other path, now proven to hold from the very moment of creation, not just
afterward.

**Creating the transaction is not creating the claim.**
`BitcoinAnchorPublisher#publish()` never imports, constructs, or calls
`core/PublicationAnchor.js` or `application/CreatePublicationAnchorUseCase.js` —
it returns plain evidence parameters, `{ locator, proof }`, and stops.
Whether those parameters go on to become a signed `PublicationAnchor` at
all is entirely the caller's own next, explicit step, exactly as
`application/CreatePublicationAnchorUseCase.js`'s own header already
insists evidence parameters are always supplied BY the caller, never
fetched or constructed by that use case itself. A caller could just as
easily discard a `{ published: false }` result, retry a broadcast, or
hold onto accepted evidence for hours before ever creating a claim from
it — none of that is this class's concern.

**No manufactured `anchoredAt`.** A successful `publish()` result never
reports a timestamp — broadcast time is not confirmation time is not
block time, and this class has no way to honestly claim any of them
before the transaction confirms. Rather than inventing a value that would
look like it came from Bitcoin itself, a successful result simply omits
`anchoredAt`, letting `CreatePublicationAnchorUseCase`'s own existing
"defaults to now" behavior apply — the identical restraint `core/
PublicationAnchor.js`'s own header already holds for `anchoredAt` in
general: "the EXTERNAL system's OWN reported timestamp — never treated as
authoritative."

**Creation and verification stay two independent classes, deliberately
not unified.** `BitcoinAnchorPublisher` and `anchoring/
BitcoinOpReturnProofVerifier.js` (0.8.1) both speak Bitcoin, and it would
be tempting to give them a shared `ExternalAnchorAdapter` base. They
answer two different questions with two different failure models —
"can I ask this external system to record this hash?" (broadcast
accepted / rejected / presently unavailable) versus "can this evidence be
independently established?" (proof valid / invalid / presently
unavailable) — and nothing in this codebase yet needs them reconciled
into one hierarchy merely because both happen to target the same chain.

See `docs/Roadmap.md`, 0.8.9, for the full milestone entry.

### A Publisher's Failure Is Not the Orchestration's Failure — But It Is Still No Anchor (0.8.10)

`application/CreateExternalPublicationAnchorUseCase.js` is the first
class in this codebase that both TRIGGERS a real external operation
(0.8.9's own new ground) AND decides, immediately afterward, whether a
signed claim gets created from it. That combination invites two opposite
mistakes: treating a publisher's ordinary "not right now" as a crash this
orchestration itself failed to handle, or — worse — creating the anchor
anyway on the theory that the recording will probably go through
eventually. This milestone commits to neither.

```text
publisher succeeds  ──────────────────────────────▶  anchor MAY be created
publisher rejected  ──────────────────────────────▶  NO PublicationAnchor
publisher unavailable ────────────────────────────▶  NO PublicationAnchor
```

A `PUBLISH_REJECTED` or `PUBLISH_UNAVAILABLE` result from
`application/ExternalAnchorCreationOutcome.js` is not an exception this
orchestration failed to catch — it is the orchestration correctly
reporting an ordinary, expected fact about the external world, the
identical "unavailable is not a crash" discipline `application/
PublicationResolver.js` (0.7.1) already established for content
retrieval and `application/ExternalAnchorVerifier.js` (0.8.1) already
established for proof verification, applied here to a third operation:
requesting a recording in the first place. `execute()` still throws — but
only for what those two classes also reserve throwing for: a genuine
caller contract violation (an unknown `publicationId`, an `anchorType`
nobody registered a publisher for) that has no honest degraded outcome to
report, never for the publisher's own ordinary operational failure.

**Orchestrating is not authorizing a second construction path.**
`CreateExternalPublicationAnchorUseCase` could, technically, build a
`core/PublicationAnchor.js` itself once a publisher succeeds — it has
every field it would need. It deliberately does not. Every successful
run still ends by calling the real, unmodified `application/
CreatePublicationAnchorUseCase.js#execute()` (0.8.8) — the one place this
codebase signs an anchor claim — so that class's own identity resolution,
self-verification, and publication-binding guarantees apply exactly once,
regardless of how many different external systems eventually get
orchestration classes of their own. `tests/
ExternalAnchorCreationOrchestration.test.js`'s own Section B proves this
with a spy wrapped around a real `CreatePublicationAnchorUseCase`: called
exactly once per successful `execute()`, never zero, never twice, and
never bypassed by a hand-built envelope.

**Duplicate external evidence is not an error.** A publication anchored
twice on the same anchorType — two genuinely separate Bitcoin
transactions, say — produces two independent `PublicationAnchor` records,
and `CreateExternalPublicationAnchorUseCase` never checks the anchor
catalog before publishing to prevent this. Refusing a second anchor
because a first one already exists would be a hidden canonicalization
policy — deciding, on this replica's own authority, that only one
recording per publication "counts" — exactly the kind of adjudication
`application/PublicationEvidenceConvergence.js` (0.8.6) already refuses
to perform between independent anchors arriving by any other path. This
orchestration extends that same restraint to anchors it creates itself:
it is no more entitled to declare one of its own recordings canonical
than it is to declare a stranger's.

**No preferred anchor type; no automatic retry.** `application/
ExternalAnchorPublisherRegistry.js` resolves an explicit `anchorType`
string to a publisher — it never chooses one on the caller's behalf,
mirroring `application/ExternalProofVerifierRegistry.js`'s own restraint
against ranking or preferring verifiers (0.8.1). And a
`PUBLISH_UNAVAILABLE` outcome is never retried internally; `execute()`
consults its publisher exactly once, leaving retry/backoff policy
entirely to the caller, exactly as `anchoring/BitcoinAnchorPublisher.js`
itself already left it (0.8.9). Both restraints exist for the same
reason: an external recording operation is a visible, consequential side
effect, and nothing in this codebase gets to decide on a caller's behalf
when or how often to repeat one.

See `docs/Roadmap.md`, 0.8.10, for the full milestone entry.

### External Anchoring Is An Explicit User Action (0.8.11)

0.8.8 through 0.8.10 built a complete pipeline for orchestrating an
external recording — `application/CreatePublicationAnchorUseCase.js`,
`anchoring/BitcoinAnchorPublisher.js`, `application/
CreateExternalPublicationAnchorUseCase.js` — and every one of those
milestones' own "Deliberately excluded" list ended with the identical
line: no UI. That restraint was correct while the pipeline itself was
still being proven, but it cannot be permanent — a capability nobody can
reach is not, in any sense that matters to a person using ForkBuild, a
capability at all. 0.8.11 is the milestone that finally exposes it, and
it does so by drawing one hard line through the Publication Center:

```text
Discover  →  a local catalog read.        No side effect. No consent needed.
Create    →  an external side effect.     Always one explicit click.
Verify    →  an external observation.     Always one explicit click, separate from Create.
```

**Discovering evidence, listing which anchor types this replica can
create, and creating an anchor are three different questions, answered by
three different collaborators, and merely asking the first two never
answers the third.** `application/PublicationAnchorCreationCoordinator.js`
(new) sits directly beside `application/PublicationEvidenceCoordinator.js`
(0.8.3) rather than folding into it — the same "one class, one axis"
discipline `application/ExternalAnchorCreationOutcome.js` already applied
to outcomes, applied here to the coordinators built on top of them.
Opening the Publication Center, listing cataloged publications, expanding
or collapsing the evidence list, and reading `availableAnchorTypes()` are
ALL synchronous, side-effect-free, local reads. `tests/
PublicationAnchorCreationUX.test.js`'s own Section C proves this with a
spy wrapped around a real `BitcoinAnchorPublisher`: those reads run
freely, any number of times, with zero calls to `publish()` — only an
actual `create()` call, always the direct result of one person's click,
ever reaches it.

**Creating an anchor never automatically verifies it.** This is the
single most important restraint this milestone holds, and the one most
tempting to break: broadcasting a Bitcoin transaction and then
immediately checking whether it confirmed FEELS like one action to a
person, and chaining them in code is one line. 0.8.11 does not take that
line. The moment `application/CreateExternalPublicationAnchorUseCase.js`
(0.8.10, unmodified) reports `CREATED`, the resulting anchor is
re-discovered into the ordinary evidence list — application/
PublicationEvidenceCoordinator.js#discover(), the same purely local read
every other cataloged anchor already goes through — and shown exactly as
"Not yet verified," with its own separate "Verify Evidence" button, never
pre-checked or pre-labeled. `tests/PublicationAnchorCreationUX.test.js`'s
own Section C proves this too: a `create()` call that succeeds never once
touches a verifier spy sitting right next to it. The reason is not
caution for its own sake — it is honesty about what a fresh broadcast
actually means. `anchoring/BitcoinAnchorPublisher.js` (0.8.9) already
established that broadcast acceptance is not confirmation; verifying
immediately after creation would either report a true-but-misleadingly-
timed `PROOF_UNAVAILABLE` (technically correct, needlessly alarming a
person one second after a successful action) or tempt a future milestone
into inventing a "just wait and retry" loop this codebase has explicitly
declined to build at every layer beneath it (0.8.9's own publisher never
retries; 0.8.10's own orchestrator never retries). Leaving verification a
separate, later, equally explicit click keeps that restraint intact one
layer further out, and keeps visible the exact lifecycle `tests/
PublicationAnchorCreationUX.test.js`'s own flagship section demonstrates
end to end: the SAME anchor, completely unchanged, reporting
`PROOF_UNAVAILABLE` immediately after creation and `VALID` only once the
external world — never this codebase — actually changes.

**The UI never says more than the pipeline underneath it has actually
established.** `application/PublicationAnchorCreationView.js`'s own
header names the exact ceiling: "`<type>` evidence was recorded for this
content hash" is the strongest sentence a successful creation is ever
allowed to produce — never "verified," "confirmed," or "trusted," each of
which would claim a fact only an explicit, separate `verify()` call can
ever establish. A `PUBLISH_REJECTED` result and a `PUBLISH_UNAVAILABLE`
result stay visibly distinct, exactly as `application/
ExternalAnchorCreationOutcome.js` (0.8.10) itself distinguishes them — a
definite external "no" reads differently from "could not presently
tell," because retrying is reasonable after the second and pointless
after the first. A local precondition failure — nobody signed in, so
`application/CreateExternalPublicationAnchorUseCase.js` throws before any
publisher is ever consulted — is caught at the UI boundary (ui/views/
DecentralizedPublicationsView.js#createAnchor(), never inside
`application/PublicationAnchorCreationCoordinator.js` itself, which stays
as thin a pass-through as `application/PublicationEvidenceCoordinator.js`
already is) and reported honestly as its own case: to a person, it reads
exactly like "external system unreachable" — no anchor was created either
way — while the specific reason ("sign in to create a publication
anchor") is still shown, never replaced with a generic message.

**Multiple independent anchors are shown, never collapsed, exactly as
0.8.6 and 0.8.10 already insist at the data layer.** Clicking "Create
Bitcoin Anchor" a second time for a publication that already has one
produces a second, equally valid, equally visible anchor — this
milestone's own button label change ("Create Another Bitcoin Anchor")
makes that explicit rather than implying a replacement, but nothing in
`application/PublicationAnchorCreationCoordinator.js` or the pipeline
beneath it ever refuses, deduplicates, or ranks a second recording. See
`docs/Principles.md`, "A Publisher's Failure Is Not the Orchestration's
Failure — But It Is Still No Anchor (0.8.10)," for why that restraint
already existed one layer down; this milestone only makes it visible.

**No anchoring as a side effect of anything else.** Nothing in
`application/SaveDocumentUseCase.js`, `application/
PublishDocumentUseCase.js`, or anywhere else in this codebase calls
`application/PublicationAnchorCreationCoordinator.js#create()`. An
external recording costs real resources on a real external system and is
never triggered by anything other than the specific click this milestone
names — the identical restraint 0.8.9 already held for `publish()` itself
("Automatic anchoring... is only ever invoked explicitly"), held here one
layer further out, at the one place a person could otherwise imagine it
happening invisibly.

See `docs/Roadmap.md`, 0.8.11, for the full milestone entry.

### A Verification Result Describes What Can Be Established Now; It Does Not Rewrite The Historical Claim Being Verified (0.8.12)

0.8.8 through 0.8.11 built the complete, working machinery to create,
discover, and verify external evidence. None of those milestones ever
asked what happens the SECOND time a person checks the same evidence —
`ui/views/DecentralizedPublicationsView.js`'s own `entry.verifications`
simply overwrote whatever the previous check had found. That is fine the
first time a person clicks "Verify Evidence," and quietly wrong the
moment the external world stops holding still: a Bitcoin transaction that
was independently confirmed yesterday and reads `PROOF_UNAVAILABLE` today
— because the explorer this replica happens to be pointed at is down,
not because anything about the transaction changed — looked, before
0.8.12, EXACTLY like an anchor nobody had ever managed to confirm at all.
0.8.12 closes that gap with the smallest change that closes it:

```text
core/PublicationAnchor.js                 UNCHANGED — still exactly one
                                           signed claim, forever
        │
        ▼
ExternalAnchorVerifier.verify()           UNCHANGED — still one honest
        │                                 outcome per call, never cached
        ▼
PublicationAnchorVerificationObservation  NEW — one frozen record of
        │                                 ONE call, at ONE moment,
        │                                 APPENDED to this replica's own
        │                                 session history, never
        │                                 overwriting the one before it
        ▼
PublicationAnchorVerificationLifecycleView  NEW — derives, from that
                                           history alone, whether the
                                           CURRENT state should read as
                                           "currently unavailable" or
                                           "currently unavailable, but
                                           independently verified earlier"
```

**`core/PublicationAnchor.js` gained nothing.** No `status`,
`verifiedAt`, `lastVerifiedAt`, `confirmationCount`, or `stale` field
was added to it, and none of this milestone's new files import its
mutating surface (it has none — see that class's own header, "Anchors
are never updated in place"). `tests/PublicationAnchorLifecycle.test.js`'s
own Section A makes this the flagship assertion, not an incidental one:
the SAME anchor is verified four times, under three different simulated
external conditions (unconfirmed, confirmed, explorer unreachable,
explorer reachable again), and `anchor.toJSON()` is asserted
byte-identical after every single one. Verifying an anchor is reading the
external world through it, never writing to it.

**A history of observations adds exactly one new fact — `everValid` —
never a new state of its own.** `application/
PublicationAnchorVerificationLifecycleView.js#deriveAnchorVerificationLifecycle()`
still reports the CURRENT state (`NOT_VERIFIED`/`VERIFIED`/
`UNVERIFIED_PROOF`/`UNAVAILABLE`/`REJECTED` — application/
AnchorVerificationLifecycleState.js) from nothing but the MOST RECENT
observation, exactly as `application/PublicationEvidenceView.js` already
did from a single result. The temptation this milestone's own design
conversation named explicitly, and declined, was inventing a sixth state
— something like `PREVIOUSLY_VALID_NOW_UNAVAILABLE` — to carry that
extra fact. That would have been a step toward exactly the `AnchorStatus`
domain field 0.8.0 through 0.8.11 have consistently avoided: a state that
sounds like it describes the ANCHOR, when it only ever describes what
THIS replica happened to observe, in what order, this session. Instead,
`everValid` rides alongside the current state as its own plain boolean,
and `describeAnchorVerificationLifecycleNote()` uses the COMBINATION —
current state `UNAVAILABLE` and `everValid` true — to add one optional
sentence next to the UNCHANGED existing badge, never in place of it. The
sentence itself is deliberately worded: "independently verified earlier;
verification is currently unavailable" — never "invalid," "revoked," or
"expired," because none of those is true. `tests/
PublicationAnchorLifecycle.test.js`'s own assertion 12 checks the actual
wording, not just the state, for exactly this reason.

**Verification observations never cross a replica boundary, and this
milestone adds nothing that could make them.**
`application/PublicationAnchorVerificationObservation.js`'s own header
states this as a hard rule, and `tests/
PublicationAnchorLifecycle.test.js`'s own Section D proves it directly:
two independently constructed `ExternalAnchorVerifier` instances, each
pointed at a different fake Bitcoin network, verify the IDENTICAL anchor
at essentially the same time — one finds a confirmed transaction and
reports `VALID`, the other finds nothing at all and reports
`PROOF_UNAVAILABLE` — and a shared `LocalPublicationAnchorCatalog` is
asserted completely unaffected by either. This is the identical
restraint `application/PublicationEvidenceConvergence.js`'s own header
already held for a single replica's own `verificationByAnchorId` map
(0.8.6, "Verification Observations Never Cross A Replica Boundary
Through This Function") — 0.8.12 extends it from "one map, one moment"
to "a whole session's history," without weakening it anywhere.

**Multiple anchors still never influence each other's lifecycle, exactly
as 0.8.6 and 0.8.10 already insist.** `tests/
PublicationAnchorLifecycle.test.js`'s own Section C verifies three
anchors for the SAME publication — one confirmed and correct, one
unconfirmed, one confirmed but carrying the wrong data — and derives
three independent lifecycles, one per anchor's own observation history,
with nothing in `deriveAnchorVerificationLifecycle()`'s own signature
that could even accept a second anchor's history to compare against.

**Re-verification stays exactly as explicit, and exactly as
un-cached, as 0.8.3 already made it.** Nothing in this milestone adds a
timer, a poll, a TTL, or a "last known good" fallback — `tests/
PublicationAnchorLifecycle.test.js`'s own Section E calls `verify()`
three times with nothing changed (identical outcome every time) and then
once more immediately after a real external change (the very next call
reflects it). `application/PublicationAnchorVerificationObservation.js`'s
own `observedAt` records only when THIS replica happened to look, never
a validity window or an expiration — there is no code path anywhere in
this milestone that reads an old observation instead of asking again.

See `docs/Roadmap.md`, 0.8.12, for the full milestone entry.

### Evidence Comparison Is Not Adjudication (0.8.13)

`docs/Principles.md`, "Evidence Relationships Are Derived, Never
Adjudicated (0.8.6)," drew the line for the DERIVATION: `application/
PublicationEvidenceConvergence.js` may say that several anchors agree
or disagree, and exactly how, and never anything about which one is
right. 0.8.13 is the first milestone that puts that derivation on a
screen a person actually looks at, which raises the identical question
one layer up: can a PRESENTATION of a structural fact smuggle in the
verdict the derivation itself refused to make? A content-hash group
with two anchors and one with a single anchor are, honestly, different
sizes — the temptation to let the bigger one look more legitimate is a
presentation-layer temptation, not a data one, and this milestone's own
design conversation named it directly before writing a line of UI code.

**A larger content-hash group is never styled, ordered, worded, or
counted as more likely correct than a smaller one.** `application/
PublicationEvidenceConvergenceView.js#publicationEvidenceConvergenceView()`
returns `contentGroups` sorted the identical deterministic way
`application/PublicationEvidenceConvergence.js`'s own `contentHashGroups`
already is — by `contentHash`, never by size — and `ui/views/
DecentralizedPublicationsView.js` lays every group out as an
equal-sized card in a row. Two anchors claiming Hash A and one claiming
Hash B renders as "Hash A — 2 anchors" beside "Hash B — 1 anchor,"
never as a ranked list, never with the larger group first by virtue of
being larger, and never in a font, color, or position that reads as
"more likely true." `tests/PublicationEvidenceConvergenceView.test.js`'s
own Section B and flagship both scan the derived view's serialized form
for "authority," "trust," "winner," "consensus," "correct," "malicious,"
"reject," "best," "preferred," "confident," and "likely" — the identical
sweep `tests/PublicationEvidenceConvergence.test.js`'s own flagship
already ran one layer down, now proven to hold through the presentation
shaping too.

**`application/ContentBindingSetRelationship.js`'s own vocabulary is
deliberately two values, and deliberately those two.** `AGREEMENT`/
`CONFLICT` name a structural fact about the evidence SET — do these
claims match each other or not — and nothing else was ever a candidate
kept out of the final file: no `TRUSTED`/`UNTRUSTED`, no `BEST`/
`PREFERRED`, no `CONFIDENT`/`LIKELY`. The one sentence this milestone
writes to the screen when a conflict exists —
`describeContentBindingSetRelationship()`'s "Evidence claims disagree
about the content hash — N different content hashes are each claimed by
at least one anchor" — says only that a conflict exists and how many
claims are in it, never which claim a reader should believe.

**Verification observations sit ALONGSIDE the structural comparison,
never inside it.** `ui/views/DecentralizedPublicationsView.js`'s own
`recomputeConvergence()` still passes this replica's own local
`verificationByAnchorId` map into `derivePublicationEvidenceConvergence()`
exactly as 0.8.6 already allowed, so each anchor's own `verification`
field stays populated — but `publicationEvidenceConvergenceView()`'s own
`contentGroups`/`hasConflict` never read that field at all, and `tests/
PublicationEvidenceConvergenceView.test.js`'s own flagship proves it
directly: Bob verifies three anchors for the identical publication with
three DIFFERENT outcomes (`VALID`/`PROOF_UNAVAILABLE`/`INVALID_PROOF`),
and the derived convergence view — `contentGroups`, `hasConflict`,
`relationship`, `conflictDescription` — is asserted byte-identical
before and after. An anchor independently verified and one whose
verification is currently unavailable remain grouped under the
identical content hash, exactly as honestly as they would have been had
neither ever been checked at all.

**No batch "Verify All" action exists, and none should be added under
this milestone's own reasoning.** Each anchor keeps the individual,
explicit "Verify Evidence"/"Verify Again" control 0.8.3 and 0.8.11
already established — see those milestones' own `docs/Principles.md`
entries, "Known Evidence Is Not Verified Evidence, And Verified Evidence
Is Not Authority (0.8.3)" and "External Anchoring Is An Explicit User
Action (0.8.11)." A batch action would not itself rank anchors, but it
would quietly recast external verification as routine background
housekeeping rather than a deliberate act a person chooses, one claim at
a time — the same restraint those two milestones already drew, extended
here rather than crossed.

See `docs/Roadmap.md`, 0.8.13, for the full milestone entry.

### Inspection Is Observation; Verification Is An Explicit Operation (0.8.14)

`docs/Principles.md`'s 0.8.3 entry, "Known Evidence Is Not Verified
Evidence, And Verified Evidence Is Not Authority," drew the line between
DISCOVERING an anchor (a synchronous, local catalog read) and VERIFYING
one (an explicit, separate, potentially network-touching action). 0.8.14
adds a THIRD action to that same line — INSPECTING an anchor, looking at
everything it claims — and the design question this milestone's own
conversation asked before writing a line of code was whether inspection
could stay just as inert as discovery, or whether merely looking closely
at an anchor would quietly start doing more.

**Opening "Inspect Evidence" never calls `application/
ExternalAnchorVerifier.js`, never touches the network, never modifies
`application/LocalPublicationAnchorCatalog.js`, never creates a
verification observation, and never mutates the anchor itself.**
`application/PublicationAnchorDetailView.js#publicationAnchorDetailView()`
is a pure, synchronous reshape of state this replica already holds in
memory — the identical restraint application/
PublicationResolutionView.js/application/PublicationEvidenceView.js
already hold for their own derived views, applied here to the anchor's
full field set rather than a verification result. `tests/
PublicationAnchorInspectionUX.test.js`'s own flagship proves this
directly, not merely by omission: Bob receives an anchor Alice created
and signed, snapshots the anchor's own `toJSON()`, the catalog's full
contents, an (initially empty) verification-observation history, and the
derived `application/PublicationEvidenceConvergence.js` result — opens
"Inspect Evidence" — and re-checks all four are byte-identical, while a
call-counting spy around `ExternalAnchorVerifier` proves it was never
once consulted. Only Bob's SEPARATE, later "Verify Evidence" click moves
any of those numbers.

**A generic anchor detail view never reinterprets an anchorType-specific
`proof`.** `proof` is opaque by design since core/PublicationAnchor.js's
own 0.8.0 header ("Verifying the `proof` itself... is a SEPARATE,
anchorType-specific question this milestone deliberately does not
answer") — `application/PublicationAnchorDetailView.js` honors that at
the presentation layer too, returning `proof` exactly as the anchor
carries it, with no `proof.txid`/`proof.confirmations`/
`proof.blockHeight` read anywhere in that file. Anchor-type-specific
interpretation lives behind its own seam, `application/
ExternalAnchorEvidenceViewRegistry.js` — the THIRD `anchorType -> plugin`
registry this codebase now holds, after `application/
ExternalAnchorPublisherRegistry.js` (0.8.10, creation) and `application/
ExternalProofVerifierRegistry.js` (0.8.1, verification) — so `anchoring/
BitcoinAnchorEvidenceView.js` is the only place in this codebase a
Bitcoin-shaped `proof.txid`/`proof.network` is ever read, and there is no
`if (anchorType === 'bitcoin-op-return')` branch anywhere in the generic
detail view.

**A presentation adapter is held to the identical purity discipline as
the generic view it supplements.** `anchoring/BitcoinAnchorEvidenceView.js
#describe()` derives a followable `https://mempool.space/tx/<txid>`
destination from `proof.txid`/`proof.network` — pure string construction,
never a fetch — and explicitly does NOT verify the transaction, determine
its confirmation count, decide whether it is trustworthy, or decide
whether it belongs to the publication being inspected: all three stay
`anchoring/BitcoinOpReturnProofVerifier.js`'s own job, completely
unchanged by this milestone. A missing or malformed `proof` degrades
honestly to "not available" and a `null` `externalLocator` — `tests/
PublicationAnchorInspectionUX.test.js`'s own Section C proves this never
guesses and never throws.

**`anchoredAt` is never relabeled into an authority timestamp merely
because it is now shown in more detail.** core/PublicationAnchor.js's own
0.8.0 header already establishes that `anchoredAt` is the external
system's OWN reported timestamp, never something this replica
independently established — `application/PublicationAnchorDetailView.js`
carries that restraint onto the screen literally, attaching the fixed
label "Claimed external recording time" to the field rather than letting
each screen invent its own wording (and risk "Verified at" or "Confirmed
at" creeping in one day). The anchor's own claimed publicationId/
contentHash pair gets the identical treatment: `describeAnchorBinding()`
says only "This anchor claims that publication P was externally recorded
with content hash H" — worded as a claim, never cross-checked against a
locally known publication's own `contentReference.hash` here (that stays
`application/ExternalAnchorVerifier.js`'s own job), extending 0.8.7's own
"a bundled anchor's claim is preserved, never silently repaired"
restraint onto the inspection screen.

See `docs/Roadmap.md`, 0.8.14, for the full milestone entry.

### A Persistent Store Is An Untrusted Byte Source, Not A Second Trust Root (0.8.15)

`application/LocalPublicationAnchorCatalog.js` has taken a
`StorageProvider` and written every `add()` straight through it since
0.8.2 — this replica's anchor catalog was never actually in-memory-only,
and surviving a page reload was never the gap. The gap 0.8.15 closes is
narrower and easy to miss precisely because the data was already there:
a catalog read has always turned whatever JSON happened to be sitting in
storage directly into a `PublicationAnchor` instance, with no
re-validation and no signature check. For a record THIS replica's own
process just wrote, that is exactly the right amount of trust — it
already passed `application/PublicationAnchorExchange.js`'s own validate
→ construct → verify-signature gate on the way in, moments earlier, in
the same process. For a record that was already sitting in storage
before this process started, it is not: storage cannot distinguish
"written by `PublicationAnchorExchange` after a genuine signature check"
from "written by a bug in an earlier version of this codebase" from
"hand-edited through devtools" from "corrupted by bit rot." All four look
identical the moment they're read back.

**`application/LocalPublicationAnchorStore.js` treats whatever is in
storage as exactly what it is: an untrusted byte source, no more entitled
to automatic trust than a peer message or an imported package.** This is
why the class is deliberately, almost aggressively dumb — it never
imports `core/PublicationAnchor.js`, never validates an envelope, never
constructs an instance, and never checks a signature. `get()`/`list()`
hand back the RAW `{ anchor: <plain JSON>, receivedAt: <ISO string> }`
envelope exactly as stored, never a hydrated `PublicationAnchor` —
because hydrating it would be an implicit trust decision this class has
no business making. `tests/PersistentPublicationAnchorCatalog.test.js`'s
own Section A proves the other half directly: a malformed record (even a
bare `null`) injected straight into the raw storage backend, bypassing
`save()` entirely, never crashes `has()`/`get()`/`list()`/`remove()` — it
simply never matches anything a caller is looking for. A store that threw
on garbage would be a store that assumed everything reaching it was
already trustworthy, which is precisely the assumption this milestone
exists to remove.

**`application/LocalPublicationAnchorCatalog.js`'s own constructor,
public API, and every observed behavior are completely unchanged.** Every
call site written against it before 0.8.15 — `application/
AddPublicationAnchorUseCase.js`, `application/
PublicationAnchorExchange.js`, `application/
ImportPackageAnchorsUseCase.js`, every one of the roughly twenty existing
test files that construct it directly — keeps working identically. What
changed is purely internal: the catalog now delegates to an internally
constructed `LocalPublicationAnchorStore` instead of calling a
`StorageProvider` itself. The catalog remains the one place that turns a
raw envelope into a real `PublicationAnchor` (still via
`PublicationAnchor.fromJSON()`, still with NO signature re-check on an
ordinary read — see the next entry for why re-verifying on every read was
never the fix), because a record reaching the catalog through `add()` was
already gated on the way in by whichever caller called `add()`.
`tests/PersistentPublicationAnchorCatalog.test.js`'s own Section B proves
the store and the catalog genuinely share one physical storage, not a
private copy each: a write through the catalog is immediately visible
through an independently constructed store over the same
`StorageProvider`, and a removal through the store is immediately
invisible through the catalog.

See `docs/Roadmap.md`, 0.8.15, for the full milestone entry.

### Restoration Re-Earns Trust In The Claim; It Never Re-Asks The External System (0.8.15)

Given `application/LocalPublicationAnchorStore.js`'s own untrusted-byte-
source posture (previous entry), SOMETHING has to decide, at some point,
which of the records already sitting in storage this replica is willing
to vouch for again. Re-verifying on every ordinary catalog read was
considered and rejected: it would make `get()`/`list()` — used
constantly, throughout discovery, comparison, and inspection UX built in
0.8.2 through 0.8.14 — expensive and asynchronous, for a check that only
ever matters once, at the moment a record re-enters this replica's trust
after having left it (i.e., after a restart). `application/
RestorePublicationAnchorCatalogUseCase.js` is that one moment, made
explicit: it runs ONCE, at startup, over every record application/
LocalPublicationAnchorStore.js has on file, and never again afterward.

**Restoration reuses the IDENTICAL validate → construct → verify-
SIGNATURE boundary application/PublicationAnchorExchange.js already
established for a stranger's anchor arriving over a peer connection
(0.8.4) — and deliberately stops at the exact same place.** A record that
fails structural validation or signature verification is PRUNED, not
merely skipped: `store.remove()` withdraws it, so it cannot silently keep
failing this exact check on every future restart with no way for a
person to ever notice or clear it. `tests/
PersistentPublicationAnchorCatalog.test.js`'s own Section C proves both
failure modes distinctly — a structurally malformed record and a
well-formed-but-tampered-after-signing one are each rejected AND
removed, categorized `INVALID_STRUCTURE`/`INVALID_SIGNATURE`, the
identical per-entry-tolerant shape `application/
ImportPackageAnchorsUseCase.js` already established for a package's own
bundled anchors (0.8.7) — one bad record in a store of several never
aborts restoring the rest.

**Restoration never once calls `application/ExternalAnchorVerifier.js`.**
Signature verification answers "did the claimed identity really sign
exactly this claim" — a question about the CLAIM's own integrity, fully
answerable offline, from the record alone. Proof verification answers
"can the external system currently substantiate what was claimed" — a
question this replica already treats as a SEPARATE, explicit, per-click
operation (0.8.3's own "Known Evidence Is Not Verified Evidence"; 0.8.14's
own "Inspection Is Observation; Verification Is An Explicit Operation").
A restart is not a reason to blur that line: `tests/
PersistentPublicationAnchorCatalog.test.js`'s own Section C and its own
flagship (Section D) each prove this with a call-counting spy around
`ExternalAnchorVerifier.prototype.verify`, not merely by omission — zero
calls, even for a `bitcoin-op-return` anchor that would match a real
proof adapter if one were registered.

**A record that passes restoration is left exactly where it already
was.** `RestorePublicationAnchorCatalogUseCase` never calls
`catalog.add()` and never touches `receivedAt` — there is no separate
"now populate the catalog" step, because `application/
LocalPublicationAnchorCatalog.js` was never actually unpopulated to begin
with (see the previous entry). `tests/
PersistentPublicationAnchorCatalog.test.js`'s own flagship makes this
concrete: Bob catalogs four anchors in "process #1," restarts into a
"process #2" built from fresh catalog/store/exchange instances over the
identical underlying storage, and finds the identical anchor set —
`toJSON()` byte-identical, `receivedAt` UNCHANGED to the millisecond, and
a re-`importAnchor()` of the same claim after restart still reports
`isNew: false` and still never resets `receivedAt`, exactly as
first-seen-wins already promised before any of this milestone existed.
What does NOT survive is `application/
PublicationAnchorVerificationObservation.js`'s own ephemeral history: an
anchor Bob explicitly verified `VALID` in process #1 reads back as
`NOT_VERIFIED` in process #2, because that observation was never part of
what `LocalPublicationAnchorStore` ever persisted — see docs/
Principles.md's own 0.8.12 entry, "A Verification Result Describes What
Can Be Established Now; It Does Not Rewrite The Historical Claim Being
Verified," now proven across a process boundary, not merely within one
session.

See `docs/Roadmap.md`, 0.8.15, for the full milestone entry.

### Discovery Is Not Verification, And 'No New Evidence' Is Not 'No Evidence' (0.8.16)

`application/PublicationAnchorDiscoveryCoordinator.js` has been able to
ask peers for historical anchor claims since 0.8.5. What it never had,
until this milestone, was a person able to trigger it — and the moment a
"Discover from Peers" button exists on screen, a new, sharper version of
a rule this codebase has held since 0.8.3 ("Known Evidence Is Not
Verified Evidence, And Verified Evidence Is Not Authority") becomes
possible to violate by accident: a discovery button that quietly also
verifies, or a result screen that quietly implies "nothing new" means
"nothing at all."

**`application/PublicationEvidenceDiscoveryCoordinator.js` never imports
`application/ExternalAnchorVerifier.js`.** Discovery answers "what claims
did these peers offer?" — a question fully answered by the SAME
validate → construct → verify-SIGNATURE boundary
`application/PublicationAnchorExchange.js` already established for every
other arrival path (ANNOUNCE in 0.8.4, RESPONSE in 0.8.5, restoration in
0.8.15). Whether a discovered anchor's PROOF holds up is a completely
separate question, answered only by a later, separate, explicit "Verify
Evidence" click — unchanged since 0.8.3. `tests/
PublicationEvidenceDiscoveryUX.test.js`'s own Section C proves this with
a call-counting spy, not merely by omission: three anchors with wildly
different eventual proof outcomes (valid, unavailable, invalid) all
discover identically, because discovery never once asks.

**`NO_NEW_EVIDENCE` and `UNAVAILABLE` are kept permanently distinct, and
neither is ever worded as "no evidence exists."** `application/
PublicationEvidenceDiscoveryUiState.js` names both explicitly precisely
because they answer different questions: `NO_NEW_EVIDENCE` means peers
were reached and answered, and had nothing this replica did not already
know — a statement about THIS discovery attempt, never about the total
evidence that exists anywhere. `UNAVAILABLE` means the discovery
operation itself could not complete (no authenticated peer was there to
ask, or the attempt itself failed) — a statement about this replica's own
present inability to ask, never about whether evidence exists. Collapsing
either into "no evidence exists" would be an authority-like conclusion no
single UI state in this codebase has ever been allowed to assert — the
identical restraint `application/AnchorVerificationOutcome.js` already
holds between `PROOF_UNAVAILABLE` ("couldn't currently confirm") and a
definite rejection, applied here one layer up, to the act of asking
rather than the act of checking. `tests/
PublicationEvidenceDiscoveryUX.test.js`'s own Section B asserts this
directly: `NO_NEW_EVIDENCE`'s own message text is checked to never
contain anything resembling "no evidence exists" or "does not exist."

**A discovered anchor is a claim, not a verdict, exactly like any other
cataloged anchor.** `application/PublicationEvidenceDiscoveryCoordinator
.js#discover()`'s own result lands a newly discovered anchor in the
catalog through the identical peer-exchange ingestion boundary 0.8.4/0.8.5
already established; ui/views/DecentralizedPublicationsView.js's own
`discoverFromPeers()` re-reads that catalog locally afterward
(`loadEvidence()`, unchanged since 0.8.3) rather than treating discovery
itself as a second way to populate the evidence list. A discovered anchor
therefore shows "Not yet verified" exactly like a locally created one or
one that arrived via ordinary ANNOUNCE — discovery changes how an anchor
got INTO this replica's catalog, never what this replica is entitled to
believe about it once it's there.

See `docs/Roadmap.md`, 0.8.16, for the full milestone entry.

### Discovery Asks A Collective Question; It Never Asks Which Peer To Trust (0.8.16)

`application/PublicationAnchorDiscoveryCoordinator.js`'s own 0.8.5 header
already drew this distinction for its own `discoverFromPeers()`: unlike
`application/PeerContentRetrievalCoordinator.js`'s single right-answer
race, historical anchor discovery asks EVERY candidate, in order, and
unions whatever each one offers, because "which anchors exist" has no
single correct answer the way "do these bytes match this hash" does.
`application/PublicationEvidenceDiscoveryCoordinator.js` — the
application-facing layer this milestone adds directly above that
coordinator — inherits this restraint at the one place a new policy
question could otherwise sneak in: WHICH peers to ask in the first place.

**Peer selection is "every currently AUTHENTICATED peer, in registry
order" — the IDENTICAL policy `application/
PublicationAnchorPeerExchange.js#announce()` already bakes in one call
away (0.8.4) — and nothing more sophisticated than that.** This class
introduces no concept of a "nearest," "fastest," "most reliable," or
"most anchors" peer, and none should ever be added to it: those are all
answers to "which peer should I trust," a question this codebase has
never asked about a peer CONNECTION (see the 0.2.49 entry, "A Peer
Connection Authenticates A Key, Not An Account") and now deliberately
declines to ask about peer SELECTION for evidence discovery either.
`tests/PublicationEvidenceDiscoveryUX.test.js`'s own Section A proves the
selection itself is mechanical and order-preserving: a `CONNECTING`
(not-yet-authenticated) peer sitting between two `AUTHENTICATED` ones is
silently skipped, never reordered, and the two real candidates are asked
in exactly the order the registry lists them.

**The RESULT stays a union, never a race, one layer up from where 0.8.5
first established it.** `PublicationEvidenceDiscoveryCoordinator#
discover()` passes the complete peer list to `discoverFromPeers()`
UNCHANGED and reports back everything that call reports — every anchor
any asked peer offered, `newlyImportedCount`/`alreadyKnownCount` a plain
tally of `isNew`, never a ranking, never a "most anchors" peer singled
out, never a "best" evidence set assembled from parts of what different
peers said. Two peers offering the identical anchor converge to one
cataloged entry for the identical reason 0.8.5 already established:
`application/LocalPublicationAnchorCatalog.js#add()` dedupes by the
anchor's own id, not by which peer said it first or most confidently.

See `docs/Roadmap.md`, 0.8.16, for the full milestone entry.

### Acquisition Provenance Is Not Evidence Rank (0.8.17)

0.8.4 through 0.8.16 gave this codebase three genuinely different ways
for a replica to come to know about an anchor claim — signing one itself
(0.8.8), importing one bundled in a package (0.8.7), and receiving one
over a peer connection, whether ANNOUNCE (0.8.4) or RESPONSE (0.8.5) —
but never anywhere to record WHICH of the three happened, or when. The
temptation, the moment such a record exists, is to let it become a
tie-breaker: "prefer the anchor I created myself," "trust a peer-sourced
claim less than a package I chose to import," "show the earliest-learned
anchor first." This codebase has refused that temptation at every prior
layer that could have offered one — no canonical anchor (0.8.2), no
"best" verification outcome (0.8.6), no peer reputation (0.8.4), no
"most reliable" peer for discovery (0.8.16) — and 0.8.17 draws the
identical line for its own new concept, `application/
AnchorAcquisitionKind.js` and `application/AnchorKnowledgeRecord.js`.

**`AnchorAcquisitionKind` has exactly three values, and none of them
compares to another.** `LOCAL`, `PACKAGE`, and `PEER` are unordered
labels, never an enum a caller could sort by, filter "better than," or
default-select on. No file in this codebase ever writes `if (acquisition
=== LOCAL) { trustMore() }`, and none should ever be added that does.
`tests/AnchorKnowledgeProvenance.test.js`'s own Section F proves the
point structurally: Bob's independently computed `VALID` verification
outcome for an anchor he received over a peer connection is byte-for-byte
identical to what he would compute for an anchor he signed himself —
`acquisition.kind` is never an input `application/
ExternalAnchorVerifier.js` reads, because that class has no way to read
it at all; the two live in entirely separate collaborators.

**A `PublicationAnchor`'s own signed payload is never touched.** Every
one of this milestone's three recording call sites —
`application/CreatePublicationAnchorUseCase.js`, `application/
ImportPackageAnchorsUseCase.js`, `application/
PublicationAnchorPeerExchange.js` — calls `application/
LocalAnchorKnowledgeStore.js#record()` as a SEPARATE step alongside the
existing, unchanged `LocalPublicationAnchorCatalog#add()`-triggering
call, never as a parameter threaded into it. `application/
LocalPublicationAnchorCatalog.js#add(anchor)`'s own public contract is
exactly what it was before this milestone — see that file's own header,
which this milestone deliberately declined to touch. Two replicas that
hold the byte-identical, identically signed anchor can hold two
completely different `AnchorKnowledgeRecord`s for it — one `LOCAL`, one
`PEER` — and neither replica's record says anything about the other's.

**FIRST-SEEN-WINS is what makes "how I learned it" a genuine, stable fact
about MY history, not a flag that flips with whatever arrived most
recently.** `application/LocalAnchorKnowledgeStore.js#record()` never
overwrites an existing entry, regardless of which acquisition kind a
later call supplies — an anchor a replica first received over a peer
connection reports `PEER` forever afterward, even after that replica
later imports the identical anchor from a package, or restarts and
receives it again. `tests/AnchorKnowledgeProvenance.test.js`'s own
Section E proves this for every ordered pair of acquisition kinds, not
merely the one PEER-then-PACKAGE case this milestone's own design
conversation used as its illustrative example.

**Deliberately no `peerId`, no `RESTORED` kind, no `PEER_ANNOUNCEMENT`/
`PEER_DISCOVERY` split.** Each of these was considered and declined, for
the identical reason: none of them describe a genuinely different way a
replica came to know a claim, and each would invite exactly the ranking
this entry exists to forbid. `peerId` would let "which peer" quietly
become a data point for judging a claim, `RESTORED` would conflate
surviving a restart with a new acquisition (surviving one is 0.8.15's own
job, entirely separate — see `application/
RestorePublicationAnchorCatalogUseCase.js`), and splitting `PEER` by
transport would document a wire-protocol implementation detail no UI or
caller has ever needed. See `application/AnchorAcquisitionKind.js`'s own
header for the full reasoning on each.

**The UI names how, never who, and never scores.** `application/
PublicationAnchorKnowledgeView.js#describeAnchorKnowledge()` produces
"Learned via peer exchange," never "Source: Alice ✓" — `tests/
AnchorKnowledgeProvenance.test.js`'s own Section C asserts directly that
no acquisition label this file ever produces names a specific identity or
contains any word resembling "trust," "verified," or "authority." Local
Knowledge, shown in ui/views/DecentralizedPublicationsView.js's own
"Inspect Evidence" panel, is presented as a distinct subsection from
External Evidence for the identical reason 0.8.14 already keeps a raw
`proof` unreinterpreted at the generic level: naming HOW a replica
learned a claim, next to WHAT the claim itself says, without ever
blending the two into one combined verdict.

See `docs/Roadmap.md`, 0.8.17, for the full milestone entry.
