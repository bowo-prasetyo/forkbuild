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

A behavior with two surfaces needs one math source (0.1.46). When the
keyboard and the pointer must produce identical results, they share one
module — TransformMath — rather than each carrying its own copy. Parity
should be a property of construction, not a bug class discovered later:
if two code paths compute the same concept twice, they will eventually
disagree. This generalizes: one gesture transaction, one bounds
calculation, one pivot rule — every "where could this diverge?" gets
answered by deleting the second copy, not by testing both harder.

When a lower layer needs logic owned by a higher layer, inject it across
the boundary — never import upward (0.1.46). renderer/ needed
TransformMath, which lives in application/; the use case that constructs
the gizmo controller simply hands the module down as a collaborator. The
renderer keeps its renderer -> core dependency direction, the math exists
exactly once, and no file had to move. Injection is the pressure valve
that keeps "never import upward" livable — and if a second lower-layer
consumer ever appears, the correct response is to lower the shared file
into core/, still never to copy it.

An active editing gesture owns the pointer (0.1.45 → 0.1.46). While a
gesture is in flight — marquee selection, a gizmo drag, and any future
begin/preview/commit gesture — camera controls, selection changes,
hover updates, and tool shortcuts are suspended; only the gesture's own
cancel (Escape) gets through. Input exclusivity is what keeps one
pointer from driving two systems at once, and it generalizes to every
future gesture without new machinery.

Session state never masquerades as document state (0.1.38 → 0.1.46).
Preview transforms, gizmo hover/active handles, gesture pivots — all of
it is session/render state. It may touch the live World transiently (a
preview does), but it never enters CommandHistory and never serializes.
The only thing a completed gesture leaves behind in history is exactly
one command.
