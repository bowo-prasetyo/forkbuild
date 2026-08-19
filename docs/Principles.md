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
