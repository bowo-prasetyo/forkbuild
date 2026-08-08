ForkBuild is layered as core / application / renderer / ui, plus the
infrastructure adapters that surround them.

core/

Pure game model. World, Building, Brick, Position, BrickDefinition,
BrickRegistry, PlacementValidator, Document, DocumentMetadata,
protocolVersion, createId, and events/ (EventBus, DomainEvent,
EventListener, and — as of 0.1.10 — EditorEvent). No Three.js, no Vue, no
browser APIs. Never imports anything from application/, renderer/, or
ui/.

Every World, Building, and Brick has a first-class UUID identity
(createId(), defaulted in each constructor) rather than a hand-picked or
sequential id. This matters once forking, merging, multiplayer, and
comments/annotations exist — everything references an id, never an array
index or a caller-chosen string. Don't confuse this with a
BrickDefinition id like "core:cube": that's a stable, namespaced *type*
identifier (docs/BrickIDs.md), not a per-instance UUID.

A Brick stores a definitionId, not geometry. BrickRegistry resolves
definitionId -> BrickDefinition (metadata only). Libraries (e.g.
core/library/CoreLibrary.js) register their definitions with the
registry at startup — see docs/BrickLibrary.md.

BrickDefinition metadata: id, name, category, thumbnail, defaultRotation,
tags, description. thumbnail already serves the role a separate "icon"
field would (both are just "the palette's visual for this definition") —
kept as one field rather than two. BrickRegistry is a proper catalog:
get(id), has(id), getAll(), getByCategory(category), search(tags) (single
tag or array; matches if a definition's tags intersect the query at all).

Document (core/Document.js) is the publishable/persistable unit: a World
plus DocumentMetadata (title, author, created, modified, protocolVersion,
engineVersion — the latter two reusing core/protocolVersion.js and
core/version.js rather than duplicating those numbers). A Document is
not a World; it CONTAINS one, the same relationship as Building
containing Bricks. This is what a future Serializer will read/write and
what a Publisher eventually transmits — both toJSON()/fromJSON() exist
now, before either consumer does, matching how every other core/ class
has gotten this pair ahead of need. Deliberately excludes anything
session-local (dirty, readOnly, "loaded from") — that's DocumentState,
Editor State, in application/editor-state/. See "Domain State vs Editor
State" below.

World is the aggregate root. addBuilding/removeBuilding and
addBrickToBuilding/removeBrickFromBuilding publish BuildingAdded /
BuildingRemoved / BrickAdded / BrickRemoved through an EventBus. The bus
itself lives in core/events/ rather than application/events/ even though
application/ is what constructs and wires it: World is the publisher, and
core/ must never depend upward on application/, so the mechanism has to
sit at or below the layer that uses it. This is a deliberate deviation
from a "use cases live in application/" instinct — event *plumbing* is
domain infrastructure, not a use case.

application/

Use cases. Coordinates core/ and the infrastructure layers to do
something (e.g. CreateEventBusUseCase, RenderWorldUseCase, and later
PlaceBrickUseCase). Constructs the shared domain EventBus and wires it to
both World and the renderer — core/ and renderer/ never reference each
other directly, only the events between them.

EditorContext (application/EditorContext.js) holds all transient editor
state: selection, active tool, active brick, camera pose, preview,
settings. This is Editor State, not Domain State — see the distinction
below. It has its own EventBus (SelectionChanged, ToolChanged,
ActiveBrickChanged, CameraStateChanged, PreviewChanged, SettingsChanged),
kept separate from the domain EventBus on purpose: nothing about "what
tool is active" should ever be reachable from a subscription meant for
"what changed in the world." EditorContext itself correctly lives in
application/, as originally proposed — nothing in core/ needs to publish
or receive editor events. But the EditorEvent *constants*
(core/events/EditorEvent.js) had to move to core/events/ once
renderer/SelectionRenderer needed to subscribe to them: renderer/ must
never depend on application/, so the shared vocabulary between
EditorContext (publisher, application/) and SelectionRenderer/
PreviewRenderer (subscribers, renderer/) needed a home both can reach
without depending on each other — the same reasoning as the domain
EventBus, just discovered one milestone later. Sub-state pieces
(SelectionState, ToolState, ActiveBrickState, PreviewState,
EditorSettings) live in application/editor-state/, each pure data with no
Three.js/Vue/DOM.

This is also where commands/ (undoable actions) and services/ (export,
import, screenshot) live — cross-cutting operations, as distinct from
EditorContext's stateful editor concerns. SelectionUseCase
(application/SelectionUseCase.js) is the single entry point for changing
selection — UI calls select()/clear() here rather than touching
EditorContext.selection directly, so history/analytics/multiplayer can
hook into "a selection happened" in one place later without
SelectionState needing to know any of them exist.

PaletteUseCase (application/PaletteUseCase.js) is the Brick Palette's
single entry point, and deliberately holds no state of its own —
getDefinitions() reads BrickRegistry, getSelectedDefinitionId()/
selectDefinition() read/write EditorContext.activeBrick (built in 0.1.9
specifically for this). A PaletteModel duplicating either would create
two sources of truth that could disagree; skipped for that reason.
onActiveBrickChanged() wraps the event subscription so ui/ never needs
to import core/events/EditorEvent itself.

Tool Framework (application/tools/, application/ToolManager.js,
application/CreateToolRegistryUseCase.js): Tool is the base class every
tool extends (activate/deactivate, onPointerMove/Down/Up, onKeyDown/Up,
onWheel — pointer terminology throughout, not mouse-specific, so touch/
stylus/VR input can drive the same tools later without an API change).
ToolRegistry maps a tool id to its Tool subclass — same shape as
BrickRegistry, but deliberately in application/ rather than core/, since
nothing in core/ ever needs to know which tools exist. ToolManager owns
"what is the current tool" and dispatches input to it, reacting to
EditorEvent.TOOL_CHANGED (published by EditorContext.setActiveTool(),
unchanged since 0.1.9) to swap the live Tool instance via
deactivate()/activate(). SelectionTool (application/tools/SelectionTool.js)
is the first tool: pointer down -> pick -> select or clear, plus
Escape-to-clear moved out of EditorView and into the tool's own
onKeyDown() — a concrete demonstration of the framework's payoff, since
that input handling used to live in ui/.

ToolContext is a plain object, not a class — it has no behavior of its
own, just references a tool is allowed to touch (world, editorContext,
selectionUseCase, previewUseCase, commandHistory today; more as tools
need them). Deliberately narrower than the { world, editorContext,
renderer, picking, commands } originally proposed: no raw Renderer
reference (would let any tool bypass PickingService/WorldRenderer and
touch Three.js directly, undoing "the editor manipulates domain objects,
not meshes"), and tools mutate editor state only through use cases like
selectionUseCase/previewUseCase, never by calling editorContext.setX()
directly — reading editorContext is fine, writing isn't, mirroring the
discipline ui/ already follows. As of 0.1.18, pick/pickGround are gone
from ToolContext entirely — see InputDispatcher below; tools receive
picking results pre-computed on the event itself and never call
PickingService.

Naming collision avoided: application/editor-state/Tool.js (the tool id
constants, e.g. ToolId.SELECT) was renamed to ToolId.js/ToolId once the
Tool base class needed the name Tool for itself. ToolState still stores
just the id string (e.g. "select"), not a resolved Tool instance — same
pattern as SelectionState storing brickId (not a Brick) and ActiveBrickState
storing definitionId (not a BrickDefinition): EditorContext holds ids,
resolution happens through the relevant registry when needed.

InputDispatcher (application/InputDispatcher.js) normalizes raw DOM
PointerEvent/KeyboardEvent/WheelEvent into stable, platform-independent
interaction events and performs picking ONCE per pointer event, before
forwarding to ToolManager. Pointer event shape: { pointerType, buttons,
modifiers: {ctrl,shift,alt,meta}, screenPosition: {x,y}, worldPosition,
pickedBrick }. pickedBrick is { brickId, buildingId } | null — kept as a
pair rather than a lone id, since PickingService has returned brickId
paired with buildingId since 0.1.8 specifically because a brick's
identity is meaningless for World mutation without knowing which
building it belongs to; collapsing to a scalar here would just force
tools to re-derive the pairing elsewhere. Both pickedBrick and
worldPosition are always computed on every pointer event, regardless of
which one a given tool ends up using — a conscious trade-off (two
raycasts per move instead of one) in exchange for InputDispatcher never
having to guess which half a tool cares about; SelectionTool and
PlacementTool each just read the field they need. pointerType is always
'mouse' today (only DOM PointerEvent is wired in EditorView), but
nothing about the shape assumes that — touch/pen/gamepad input could
construct the identical event without ToolManager or any Tool changing.
Key events: { key, modifiers }. Wheel events: { deltaY, modifiers }.

Deliberately outside InputDispatcher's job: the temporary '1'/'2'
tool-switch shortcuts and Ctrl/Cmd+Z / Ctrl/Cmd+Y undo/redo, still wired
directly in EditorView. These are global, tool-independent decisions —
"normalize and forward to whichever tool is active" doesn't apply to
them, since they don't go to a tool at all.

EditorSession (application/EditorSession.js), added 0.1.20C, owns the
entire live runtime graph — the render session (Renderer/WorldRenderer/
PickingService/SelectionRenderer/PreviewRenderer, via
RenderWorldUseCase), the domain EventBus, World, CommandHistory,
ToolManager, and InputDispatcher — as one unit. start(container) builds
it the first time; loadDocument(id) and newDocument() tear the whole
thing down and rebuild it against a different World, sharing the exact
same _rebuild() path start() uses — there is only one way the runtime
graph gets built, whether it's the first time or the fifth. This exists
because "replace the current document" turned out to require more than
swapping a reference: WorldRenderer's MeshRegistry would go stale, a
fresh domain EventBus is needed so the old and new worlds' events can
never cross-contaminate, and the renderer has to be subscribed to that
fresh EventBus BEFORE the new World is populated — the same ordering
constraint the engine has followed since the Event System milestone,
now enforced inside _rebuild() itself rather than only at initial
bootstrap. As of 0.1.21, EditorSession also accepts an optional
identityProvider, passed through to CreateDocumentManagerUseCase.
attachWorld() on every start()/newDocument() so DocumentMetadata.author
gets populated whenever someone's logged in — loadDocument() doesn't
pass it through, since a loaded document already has its own saved
author from when it was originally created.

registry/editorContext/toolRegistry/documentManager/selectionUseCase/
previewUseCase are constructed once, outside EditorSession, and are the
SAME instances across every replacement — only the per-world runtime
gets torn down and rebuilt. EditorContext.selection and the preview are
explicitly cleared on every _rebuild(), since a brickId from the old
world means nothing in the new one. DOM listeners (wired once, by
EditorView, in onMounted()) delegate to session.onPointerDown()/
onPointerMove()/onKeyDown() at call time rather than capturing
toolManager/inputDispatcher directly — this is what lets EditorView
attach listeners exactly once and never touch them again, even across
repeated document replacements: only the instance fields those methods
read get swapped underneath.

EditorView.js shrank considerably as a result: it no longer imports
CreateEventBusUseCase, CreateDemoWorldUseCase, RenderWorldUseCase,
CommandHistory, or ToolManager at all — it builds the collaborators
EditorSession needs, then only ever calls start()/dispose() and forwards
raw events. It has no idea a document replacement tears down and rebuilds
an entire runtime graph underneath it. Ctrl/Cmd+Z/Y still read
editorSession.commandHistory fresh on every keypress (a getter, not a
captured reference), so undo/redo keep working correctly across a
document replacement without EditorView needing to resubscribe anything.

PreviewUseCase (application/PreviewUseCase.js) is the placement preview's
single entry point: show(definitionId, position, rotation)/hide(),
writing through EditorContext.preview (PreviewState — visible,
definitionId, position, rotation; Editor State, never becomes a real
Brick until PlaceBrickCommand commits it). PlacementTool
(application/tools/PlacementTool.js) drives it: pointer move -> pick (is
an existing brick under the cursor?) -> pickGround (where would a ray
hit the ground plane?) -> snap to EditorSettings.gridSnapSize ->
previewUseCase.show(). Known limitation carried over from 0.1.13:
hovering an existing brick hides the preview rather than stacking on top
of it; face-relative placement needs face-normal detection from the
raycast hit and stays deferred until it's actually needed.

As of 0.1.14, PlacementTool.onPointerDown is real: PlacementValidator
(core/PlacementValidator.js — see below for why it's in core/, not
application/) checks the previewed position is unoccupied, then
PlaceBrickCommand (application/commands/PlaceBrickCommand.js) is
constructed and routed through CommandHistory.execute() rather than
called directly. PlaceBrickCommand is immutable and holds no brickId —
it creates the Brick's identity when executed, not before — which is
what makes it serializable (toJSON()/fromJSON() round-trip worldId/
buildingId/definitionId/position/rotation as plain data) and, eventually,
what a command-history/undo system and multiplayer transport can work
with directly. It is completely renderer-ignorant: execute() calls
World.addBrickToBuilding() (which publishes BrickAdded) and stops — the
renderer, preview, and selection systems react to that event on their
own, the same as any other BrickAdded. execute(context) takes { world }
rather than storing a live World reference, and checks context.world.id
against its own worldId as a data-integrity guard (not collision
logic — that's PlacementValidator's job, called by PlacementTool before
the command is even constructed, never by the command itself). After a
successful commit, PlacementTool immediately hides the preview so the
ghost doesn't sit visually overlapping the brick WorldRenderer just
created for real.

As of 0.1.15, Command (application/commands/Command.js) is the base
class every command extends. As of 0.1.16, its contract is
execute(context) + undo(context) + canUndo() — both execute() and
undo() throw by default (a command must explicitly implement undo() to
support it; existing is not the same as being reversible) and canUndo()
defaults to true, overridden per command. No redo() on Command: redo is
simply execute() again, with CommandHistory managing which direction is
being replayed.

DeleteBrickCommand (application/commands/DeleteBrickCommand.js) mirrors
PlaceBrickCommand closely (same worldId-mismatch guard, same
toJSON()/fromJSON() shape) but carries a brickId instead of a
definitionId/position/rotation, and calls
World.removeBrickFromBuilding() (publishing BrickRemoved) instead of
addBrickToBuilding(). Wired into SelectionTool: Delete/Backspace deletes
the current selection and clears it — input handling living with the
tool it belongs to, same reasoning as Escape-to-clear.

Both PlaceBrickCommand and DeleteBrickCommand have one narrow,
deliberate crack in immutability: constructor fields never change, but
each command remembers "what actually happened" after execute() runs —
PlaceBrickCommand keeps the id of the brick it created
(_executedBrickId); DeleteBrickCommand snapshots the removed brick's
full data (_removedBrickSnapshot) before removing it, since that data is
gone once World.removeBrickFromBuilding() runs. Both are deliberately
excluded from toJSON() — they're bookkeeping for THIS command instance's
own undo/redo within a session, not part of the command's serializable
intent. A command reconstructed via fromJSON() starts fresh
(canUndo() === false) and would need its own execute() call before it
could be undone; replaying a command elsewhere (multiplayer, a fresh
session) correctly creates a new placement with a new identity, not a
resurrection of the original.

Redo stability: PlaceBrickCommand.execute() reuses _executedBrickId if
already set, so undo() -> redo() (execute() again) recreates the SAME
brick identity rather than a new one. DeleteBrickCommand.undo() restores
the brick with its ORIGINAL id from the snapshot, for the same reason:
delete -> undo should be indistinguishable from "the delete never
happened," which requires the exact identity back.

CompositeCommand (application/commands/CompositeCommand.js) is a Command
made of other Commands: add(command) before execute(), then
CommandHistory treats the whole thing as one undo step regardless of
how many children it has. execute() runs children in the order added;
undo() reverses them in the OPPOSITE order, since a later child might
depend on an earlier one having already happened. canUndo() is true only
if there's at least one child and every child can be undone — a
composite is only as undoable as its least-undoable part.

CommandHistory (application/CommandHistory.js) is what tools actually
call — commandHistory.execute(command), not command.execute(context)
directly. context ({ world } today) is bound once at construction, not
passed per call. Traditional undo/redo stacks: execute() pushes onto the
undo stack and clears the redo stack entirely (a fresh action
invalidates whatever "future" an undo had left available). undo() pops
the undo stack, calls command.undo(), pushes onto the redo stack.
redo() pops the redo stack and calls command.execute() again — literally
the same method as the first execution, per Command having no redo() of
its own. getExecutedCommands() reflects the current undo stack (what's
presently applied to the document), not a permanent audit log of
everything ever run — a command that's been undone moves to the redo
stack and drops out of this list until/unless it's redone. A tool never
knows or cares whether undo/redo exists; PlacementTool and SelectionTool
both call commandHistory.execute() exactly as before, unchanged by any
of this. As of 0.1.18, getUndoLabel()/getRedoLabel() expose human-readable
labels (e.g. "Undo Place Brick") for a future Edit menu/status bar,
built on Command.describe() (defaults to the class name; PlaceBrickCommand/
DeleteBrickCommand override it to "Place Brick"/"Delete Brick";
CompositeCommand delegates to its single child or falls back to "N
actions"). Both label methods return null rather than throwing when
there's nothing to undo/redo, so a caller can disable a menu item
without a separate canUndo()/canRedo() check.

As of 0.1.17, CommandHistory also publishes CommandExecuted/
CommandUndone/CommandRedone (application/events/CommandHistoryEvent.js)
through its own EventBus on every successful operation. This is a third
event vocabulary, distinct from both DomainEvent and EditorEvent — and
unlike those two, it does NOT need to live in core/: both the publisher
(CommandHistory) and its only subscriber (DocumentManager) live in
application/, so the lowest layer both sides can reach without depending
on each other is application/ itself this time. The general rule that's
crystallized across all three cases: event vocabulary lives at the
lowest layer both the publisher and every subscriber can reach — that's
sometimes core/, sometimes the layer the publisher already sits in.
CommandHistory doesn't call documentManager.markDirty() itself; that
coupling lives entirely in DocumentManager.trackCommandHistory(), so
CommandHistory has no idea DocumentManager exists.

DocumentManager (application/DocumentManager.js) owns document lifecycle
— mirrors what CommandHistory does for command execution: one place
decides what "the current document" is and how its DocumentState
changes. markDirty()/markSaved()/newDocument()/load()/close() are the
only ways DocumentState should change; all of them funnel through a
private _setState() helper that also publishes
DocumentManagerEvent.STATE_CHANGED (application/events/
DocumentManagerEvent.js) through DocumentManager's own EventBus, added
in 0.1.20B so ui/ (Toolbar's dirty indicator, recent-documents list) can
react without polling. onStateChanged(callback) wraps the subscription —
ui/ never imports DocumentManagerEvent or EventBus itself, same pattern
as PaletteUseCase.onActiveBrickChanged(). trackCommandHistory(commandHistory)
subscribes to that history's CommandExecuted/Undone/Redone events and
calls markDirty() on each, returning an unsubscribe function — so a
tool placing or deleting a brick automatically dirties the document
without PlacementTool or SelectionTool needing to know DocumentManager
exists, the same way neither needs to know CommandHistory publishes
those events at all. Known simplification: undo also marks dirty, even
if it happens to land exactly back on a previously-saved state — true
"is the content identical to what's on disk" tracking is future work,
not needed until this dirty indicator makes the distinction observable
enough to matter.

CreateDocumentManagerUseCase (application/CreateDocumentManagerUseCase.js)
constructs Document/DocumentMetadata (both core/ classes) on
application/'s behalf, so ui/ never has to import core/Document directly
just to get a DocumentManager — same reasoning as PlacementTool
constructing its own PlacementValidator instead of EditorView doing it.
Split into two methods as of 0.1.20B: execute() builds an empty
DocumentManager (wrapping DocumentManager's own default empty Document),
safe to construct in EditorView's setup() before a World exists — Toolbar
needs one as a required prop for its very first render, well before
CreateDemoWorldUseCase has run. attachWorld(documentManager, world,
identityProvider) points that SAME manager at a real World once one
exists, called from onMounted() after the World has already been
populated and its events fired into an already-subscribed renderer —
internally just documentManager.newDocument(new Document({world,
metadata})), so it also resets DocumentState to clean, exactly as
loading a fresh document should. As of 0.1.21, author attribution comes
from identityProvider.currentUser().username when available; otherwise
author stays null, which is correct for an anonymous session.

No separate DocumentSession/CurrentDocument class: document.world.id
(stable since 0.1.10) already is the active document id. A parallel
tracker would risk exactly the two-sources-of-truth problem
PaletteModel was skipped for in 0.1.11 — DocumentManager already owns
"what document is open."

CreatePersistenceUseCase (application/CreatePersistenceUseCase.js)
constructs the concrete LocalStorageProvider and the SaveDocumentUseCase/
LoadDocumentUseCase that depend on it, so ui/ never imports storage/
directly — the same "ui/ only ever talks to application/" discipline
applied to reaching an infrastructure adapter, not just core/ or
renderer/. Swapping storage backends later means changing exactly this
one file; the use cases themselves stay storage-agnostic exactly as
designed in 0.1.20A.

CreateEmptyWorldUseCase (application/CreateEmptyWorldUseCase.js), added
0.1.20C for "New Document" — one Building, no bricks, mirroring
CreateDemoWorldUseCase's shape without a demo brick to place inside.
Toolbar's Save/New buttons and clickable Recent Documents entries call
saveDocumentUseCase.execute()/editorSession.newDocument()/
editorSession.loadDocument(id) directly — none of the three needed new
wiring in Toolbar beyond what 0.1.20B already built, since New and Load
both go through DocumentManager's own state-changing methods internally
(attachWorld -> newDocument, or LoadDocumentUseCase -> load), which the
Toolbar's existing onStateChanged() subscription already reacts to.

Recognized, not implemented: CommandHistory's undo stack is, in effect,
an append-only log of everything that changed this document — which
means World = Replay(all commands) is already a valid way to describe
the architecture, even though nothing here is event-sourced. Worth
naming for future debugging/replay tooling (step through a building
session command by command), but not a system to build until something
actually needs it.

Entities vs Domain Services (a distinction within core/, worth naming
explicitly): World, Building, and Brick are entities — they own state
and behavior tied directly to themselves. PlacementValidator is a
domain service — it owns a rule that spans multiple entities (a Brick's
legality depends on the whole Building it would join) and doesn't
naturally belong to any single object. Both live in core/ under the same
dependency rules, but they answer different questions: an entity answers
"what am I," a domain service answers "is this operation valid." Future
rules like structural stability, connectivity validation, or import
verification are domain services in this same sense, not entity methods.

PlacementTool constructs its own PlacementValidator internally rather
than receiving it through ToolContext from EditorView: EditorView (ui/)
must never import core/ directly (see the ui/ section below), and
threading a core/ class through ui/-assembled ToolContext would do
exactly that. application/tools/ -> core/ is an allowed dependency on
its own, so the tool just constructs what it needs.

Input System: built as of 0.1.18 — see InputDispatcher, documented above
alongside ToolContext. What used to be inline DOM normalization in
EditorView is now a proper application/ class, and picking moved from
"something every tool calls" to "something computed once and handed to
tools" as part of the same change.

renderer/

Three.js. WorldRenderer subscribes to World's domain events and reacts
incrementally — BrickAdded creates one mesh, BrickRemoved deletes one,
BuildingAdded/BuildingRemoved handle a whole building at once (e.g. on
initial load). There is no render(world) sweep. MeshRegistry maps brick
id <-> mesh (bidirectional) plus brick id -> building id, so removal
never has to search the scene graph and a raycast hit can be resolved
straight back to a brick/building id.
BuildingRenderer -> BrickRenderer resolve each brick's definitionId
against the registry, then ask renderer/ThreeBrickFactory.js — the
renderer-side counterpart to BrickRegistry — to build the actual mesh.
Owns the scene, camera, lights, grid, and render loop. Owns no game state,
and (as of the event system) doesn't even hold a reference to a World —
only to the events it emits.

PickingService answers two questions from screen coordinates: what brick
is under this position (pick), and where would a ray hit the ground
plane (pickGroundPosition, added 0.1.13 for placement preview — returns a
core/Position, never a Three.js type). It raycasts against MeshRegistry's
meshes and resolves the hit back to { brickId, buildingId } via the same
registry. It knows nothing about selection, preview, or any other UI
state — Picking does not depend on them; they depend on Picking.
RenderWorldUseCase wires PickingService up alongside Renderer/
WorldRenderer and exposes plain pick(screenX, screenY)/
pickGround(screenX, screenY) functions on its returned handle, so ui/
(and tools) never need a Three.js reference to use it.

CameraController owns orbit/pan/zoom (via Three.js's OrbitControls
addon), resize, and reset (bound to the Home key). CameraState is a pure
data snapshot (position, target, zoom — reusing core/Position) exchanged
via getState()/setState(). Focus(), saved/restored camera state, and
smooth transitions (CameraAnimator) are Camera Intelligence and
deliberately not here yet — CameraController only knows how to be driven
by hand, not how to decide where to go on its own.

SelectionRenderer is the renderer's first overlay: WorldRenderer's job is
World -> Meshes, SelectionRenderer's is Selection -> Visual Highlight,
kept deliberately separate since selection isn't part of rendering the
world. Subscribes to EditorEvent.SELECTION_CHANGED (not a domain event)
and sets the selected mesh's material.emissive color directly — no
OutlinePass or post-processing pipeline for Version 0.1. Known trade-off:
this mutates a mesh BrickRenderer already owns rather than adding an
independent overlay object, so it's not a "true" overlay in the strict
sense yet (see Render Layers below); it was the simplest thing that looks
right for this milestone.

PreviewRenderer is the renderer's second overlay: PreviewState -> a
single semi-transparent ghost mesh, subscribed to
EditorEvent.PREVIEW_CHANGED. Reuses ThreeBrickFactory so the ghost has
the exact geometry the real brick would have, then clones the material
and sets transparent/opacity — never touches the World, never creates a
real Brick. Recreates the mesh only when definitionId changes (e.g. the
palette selection changed); otherwise just moves the existing mesh, so
dragging the pointer around doesn't churn geometry every frame.

Render Layers (conceptual, not yet code)

Think of the scene as three logical layers even though everything
currently lives in one Three.js Scene: a World Layer (bricks, buildings,
terrain — what WorldRenderer manages), an Overlay Layer (selection,
hover, placement preview, measurements — purely visual, never modifies
the World), and a Gizmo Layer (future transform handles, axes,
manipulators). None of this requires separate THREE.Scene or THREE.Group
objects yet — the point is that new visual features should be reasoned
about as "which layer does this belong to" before writing code, so they
land in the right place by default. SelectionRenderer and PreviewRenderer
both conceptually belong to the Overlay Layer, even though SelectionRenderer's
current implementation (mutating the brick's own material) blurs that
line slightly — a future pass could replace it with a true independent
overlay mesh, matching how PreviewRenderer already adds its own separate
mesh, without changing either renderer's public shape.

ui/

Vue. The application shell, routes, views, and components. Talks only to
application/, never directly to core/, renderer/, or (confirmed
explicitly as of 0.1.20B, via CreatePersistenceUseCase) storage/ — the
rule isn't really "never touch core/ or renderer/," it's "never reach
past application/ to any layer beneath it," which just hadn't had a
storage/ case to prove out until Toolbar needed a save button. Kept
intentionally "dumb" so a future non-Vue client could reuse core/ and
application/ unchanged. Known exception: ui/views/AboutView.js imports
core/version.js directly to display the version number — a leftover
from Step 2, before this rule existed. Inert (a static constant, no
behavior) but technically a violation; noted rather than fixed as a
drive-by inside an unrelated milestone. As of 0.1.11, EditorView.js and
BrickPalette.js use the Vue 3 Composition API (setup(), ref,
onMounted/onBeforeUnmount) per CodingConventions.md — earlier views used
Options-API-flavored lifecycle hooks (mounted()/beforeUnmount()
directly), which still worked but wasn't
strictly the stated convention.

storage/

Filled in at 0.1.20A (persistence API; UI integration is a deliberately
separate 0.1.20B, not yet done). StorageProvider is the base class: save/
load/remove/list, operating on plain string names and JSON-safe values.
LocalStorageProvider is the first concrete implementation, backed by
window.localStorage, namespacing every key under "forkbuild:" so list()
never returns unrelated data the page's localStorage might hold.

storage/ is the most decoupled layer in the engine — more so than
renderer/ or serializer/, both of which at least need core/. Storage
doesn't know what a Document is, let alone a World or a Brick; it only
knows names and blobs. That pairing — "a Document is the thing being
saved" — happens one layer up, in application/SaveDocumentUseCase.js and
application/LoadDocumentUseCase.js, which take a storageProvider purely
as an injected constructor parameter and never import a concrete
provider themselves. Whoever wires the editor together (0.1.20B) decides
which backend to use; the use cases work identically with any of them.

application/DocumentManifest.js is the catalog of saved documents ({id,
title, modified} entries), kept as its own stored blob ("forkbuild-index")
so a future Open Document dialog can read one small object instead of
scanning every StorageProvider key. SaveDocumentUseCase upserts an entry
on every save (replacing, not duplicating, an existing entry for the
same id); LoadDocumentUseCase.listSavedDocuments() reads it back.

The stored id is document.world.id — a stable UUID since 0.1.10 — not a
separately invented one. Saving the same document twice naturally
overwrites the same slot. SaveDocumentUseCase.execute(documentManager)
serializes via DocumentSerializer, saves, upserts the manifest, then
calls documentManager.markSaved() — the only correct way DocumentState
changes, per DocumentManager's own rule. LoadDocumentUseCase.execute()
mirrors this: load, deserialize (through DocumentSerializer's validation
gate — protocol version mismatches are caught here exactly the same as
anywhere else JSON enters the engine), then documentManager.load().

serializer/

World <-> JSON and Document <-> JSON, used by both storage/ and
publisher/ once those exist. Filled in at 0.1.19 — the first top-level
adapter folder (of storage/publisher/identity/serializer, all sketched
back at the core/application/renderer/ui reorg) to get real content,
confirming the dependency-direction rule stated then (application ->
storage/publisher/identity/serializer) rather than needing revision now
that there's something to depend on.

Serializer (serializer/Serializer.js) is the shared base: serialize(object)/
deserialize(json), both throwing by default — same discipline as Command.
WorldSerializer wraps World.toJSON()/fromJSON(); DocumentSerializer wraps
Document.toJSON()/fromJSON() (which itself delegates to WorldSerializer
for the nested world) and additionally validates metadata.protocolVersion
against core/protocolVersion.js on every deserialize — a mismatch throws
today ("Later: migration," not yet needed with only one protocol version
in existence). validate(json) is public on both, returning a
ValidationResult (serializer/ValidationResult.js — valid/errors/warnings)
rather than being a private step inside deserialize(), so a future
caller (a load dialog, say) can check validity and show a friendly error
without needing to catch an exception.

Deliberately not done: moving World.fromJSON()/Document.fromJSON() out
of core/ and into the serializers entirely, so the domain model would
own zero knowledge of JSON. That's a real direction worth keeping in
mind — it would make future formats (binary, compressed, a blockchain
payload) cleaner to add — but refactoring it now, with exactly one format
and no second consumer yet, would be a wide, disruptive change (touching
World, Document, and every existing call site) for a benefit nothing
currently needs. WorldSerializer/DocumentSerializer delegate to the
existing methods rather than duplicating or replacing them.

serializer/ depends on core/ only — never application/, renderer/, or
ui/ — the same one-directional relationship renderer/ has with core/,
just for a different top-level adapter. Nothing calls these serializers
yet (Local Storage, 0.1.20, is the first real consumer); both classes
are fully tested standalone, same as EditorContext shipping "wired to
nothing" in 0.1.9 and DocumentManager shipping with no UI surface in
0.1.17.

publisher/

Filled in at 0.1.22 — the Publisher Adapter stub. PublisherProvider is
the base class: publish(document, identityProvider) returns a
Publication. LocalPublisherProvider is the first concrete
implementation: no blockchain, but exercises the exact same interface a
future SteemPublisherProvider will use. It stores Publication records
via an injected StorageProvider, so the publish flow is real and testable
even before a blockchain backend exists.

The key dependency direction: PublisherProvider receives an
IdentityProvider and may call identityProvider.sign() to attest
authorship, but never knows or cares whether that signature came from
Steem Keychain, MetaMask, or a local fake provider. The publisher
knows *that* signing happened, never *how*. This mirrors the exact
same inversion already established for StorageProvider and
IdentityProvider.

Publication (publisher/Publication.js) is the pure-data bridge between
Publisher and a future Discovery layer. It carries: id, documentId,
title, author, providerId, publishedAt, url, and (as of 0.1.23)
parentDocumentId — reserved for the upcoming Forking milestone.
Repository View, Author View, and World View all consume these fields
directly without knowing how the Publication was created.

discovery/

Filled in at 0.1.23 — the Discovery Adapter stub. DiscoveryProvider is
the base class: list(), findById(id), findByAuthor(author),
findByParentId(parentDocumentId). LocalDiscoveryProvider is the first
concrete implementation: reads the same localStorage key that
LocalPublisherProvider writes to, returning Publication objects.

The critical architectural separation: Publisher answers "How do I
publish this document?" Discovery answers "How do I find published
documents?" The UI should never care whether the source is
LocalStorage, Steem, Hive, Ethereum, IPFS, or another ForkBuild node.
It simply asks the application: "find publications."

This separation becomes essential once Steem is introduced.
SteemPublisherProvider posts a document; SteemDiscoveryProvider queries
Steem posts and converts them into Publication objects. Neither the
publisher nor the discovery provider knows about the other, and the UI
depends on neither.

View Modes (conceptual architecture, partially implemented)

ForkBuild's Document abstraction makes three distinct presentation
modes possible without duplicating data:

Repository View — the "GitHub" mode. A list of projects per author,
searchable, forkable. Each entry is a Publication (or a local
DocumentSummary). Users open one, inspect bricks, fork it, modify it.
This is the builder's primary interface. Implemented as of 0.1.23 as
ui/views/RepositoryView.js.

Author View — the "profile" mode. Every Publication has an author
field. Grouping by author produces a portfolio page: published works,
fork counts, follower counts. Nothing about the document changes;
only the query differs. Not yet implemented; will follow the exact
same pattern as Repository View.

World View — the "Minecraft" mode. Published documents that carry an
optional worldPosition appear as placed objects inside a shared virtual
world. The renderer streams documents on demand based on camera
position (like Google Maps tiles). Walking farther loads new creations;
older ones unload. The same Japanese Temple document can be a project
in Repository View and a physical place in World View simultaneously.
Not yet implemented; will add a WorldLayoutProvider abstraction.

All three modes are views over the same underlying data graph:

          Alice (author)
             │
     Medieval House (Publication)
        │      │      │
     uses    near   forked
        │      │      │
   Stone Pack Castle  Bob's House

Repository View explores the "contains" edge.
World View explores the "near" edge.
Author View explores the "authored" edge.

The publisher interface intentionally knows nothing about which view
mode will consume its output. It simply produces a Publication. A
future DiscoveryProvider (or the view layers themselves) decides how to
index and present them.

World Layout (future, not yet implemented)

Rather than hard-coding "The Global World," ForkBuild will likely
introduce a WorldLayoutProvider abstraction whose sole job is
findVisibleDocuments(camera). Implementations could be:

- Geographic: documents have lat/long coordinates.
- Random island: one island per author.
- Theme park: fantasy district, sci-fi district, modern district.
- Time-based: newest builds nearby, older builds farther away.

The renderer doesn't care. It asks the layout provider what to show,
then loads the corresponding Documents via a Discovery layer.

Forking (0.1.24)

A fork is a new Document derived from an existing published document,
not merely a copy of its JSON. The operation is:

1. Load the source Document from storage (via its publication.documentId).
2. Deep-clone the World, stripping all instance IDs so that World,
   Building, and Brick all regenerate fresh UUIDs.
3. Create new DocumentMetadata with:
   - title: "Fork of {original title}"
   - author: current user (from IdentityProvider)
   - parentDocumentId: source document's world.id
4. Open the resulting Document as an ordinary editable document.

The lineage is immutable from the parent's perspective. The complete
ancestry graph can be reconstructed by querying DiscoveryProvider with
findByParentId().

Fork is distinguished from View (open another document without copying)
and Import (bring external data into the workspace). Repository View
offers both Open and Fork actions on each Publication card.

The implementation lives in ForkDocumentUseCase (application/). It is
deliberately not a Command — forking creates a new document, it does
not mutate the current one, so it lives outside the undo/redo stack.
EditorSession gained openDocument() to load an already-constructed
Document (as opposed to loadDocument() which loads from storage by id).

Domain State vs Editor State

Two kinds of state exist in ForkBuild, and they must never mix.

Domain State — World, Building, Brick, and (as of 0.1.17) Document/
DocumentMetadata (core/). Publishable, serializable, shared, forkable.
This is what the ForkBuild Protocol describes and what storage/publisher
eventually persist and transmit. Document doesn't replace World as the
aggregate root — it wraps World plus the metadata (title, author,
timestamps, versions, parentDocumentId) that travels alongside it when
saved or published.

Editor State — everything in EditorContext (application/): selection,
active tool, active brick, camera pose, placement preview, settings —
plus, as of 0.1.17, DocumentState (dirty, readOnly, loadedFrom,
lastSaved), owned by DocumentManager rather than EditorContext (a
deliberate peer, not a sub-field — see the application/ section above).
Purely local to one editing session. Never part of a World or Document,
never serialized into the Protocol, never sent to a publisher. The placement
preview in particular is worth being explicit about: it looks like a
brick, sits in the same 3D space as real bricks, but is Editor State
through and through — it never becomes a Brick until PlaceBrickCommand
commits it to World.

The practical rule: if a serializer is ever tempted to write a field
from EditorContext into a World's JSON, that's a bug. Domain State
answers "what did the user build?" Editor State answers "what is the
user currently doing while building it?" — the second question's answer
should never leak into the first's.

Dependency direction

ui -> application -> core
application -> renderer
application -> storage / publisher / identity / serializer / discovery
renderer -> core (reads domain events and data; never the reverse)

core never depends on anything above it. renderer never owns data, only
visualizes what it's given, and now only reacts to events rather than
being handed a World directly.

Naming convention

| Purpose                           | Suffix    |
|------------------------------------|-----------|
| Persistent domain object          | *(none)* — World, Brick, Building |
| Mutable editor state               | State     |
| Long-lived shared state container | Context   |
| Lookup/index                       | Registry  |
| Adapter to external systems        | Provider  |
| Pure application workflow          | UseCase   |
| Renderer subsystem                 | Renderer  |
| Short-lived event payload          | Event     |
| Engine capability                  | Service   |
| Executable action (undoable later)| Command   |

Refined as of 0.1.12: Service was originally going to be avoided entirely,
but PickingService doesn't fit any other row — it's not a lookup, not a
renderer, not a workflow, not editor state. It's a capability the engine
provides. So is CameraController, which is left as Controller rather than
forced into Renderer: it directly drives interactive hardware-like input
(mouse, keyboard, OrbitControls), which reads differently from "visualizes
domain data," the actual job every other *Renderer class does. Neither
name changes.

Recognized, not implemented (future direction, not a commitment):
Workspace — deliberately above DocumentManager, not a replacement for
it. Today: one EditorView, one Document, one DocumentManager. A future
desktop build might want multiple open documents, an active-document
pointer, window layout, recent files. None of that changes the document
model itself; it would sit above DocumentManager the same way
DocumentManager sits above Document. Not a Version 0.1 concern.
