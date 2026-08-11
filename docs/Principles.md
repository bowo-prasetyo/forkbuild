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
