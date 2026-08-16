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
