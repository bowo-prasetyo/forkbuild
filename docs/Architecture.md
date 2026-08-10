ForkBuild is layered as core / application / renderer / ui, plus the
infrastructure adapters that surround them.

core/

Pure game model. World, Building, Brick, Position, WorldPosition,
BrickDefinition, BrickRegistry, PlacementValidator, Document,
DocumentMetadata, protocolVersion, createId, and events/ (EventBus,
DomainEvent, EventListener, and — as of 0.1.10 — EditorEvent). No
Three.js, no Vue, no browser APIs. Never imports anything from
application/, renderer/, or ui/.

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

WorldPosition (core/WorldPosition.js), added 0.1.27, is a coordinate
in shared world space — distinct from Position so brick-local and
world-global concepts never merge accidentally. toJSON()/fromJSON()
round-trip {x,y,z}; equals()/clone() exist for the same reasons as
Position.

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

RenderWorldViewUseCase (application/RenderWorldViewUseCase.js), updated
0.1.30, exposes selectBrick(brickId), clearSelection(),
hoverBrick(brickId), and clearHover() on its returned handle so
WorldNavigationSession can drive spatial highlighting without touching
Renderer directly. It also exposes removeWorld(world) for spatial
unloading. This is the same abstraction discipline as getCameraState/
setCameraState: the use case decides what the session can do; the
session does not reach past the use case into renderer internals.

application/

WorldNavigationSession (application/WorldNavigationSession.js), updated
0.1.30, owns the live read-only runtime graph for World View. It
coordinates six responsibilities: camera positioning via
SpatialCameraController, spatial discovery via WorldLayoutProvider,
document loading via LoadPublicationDocumentUseCase, world load/unload
reconciliation, spatial selection/hover state, and a shared EventBus
that feeds a single WorldRenderer.

SpatialCameraController (application/SpatialCameraController.js) is the
navigation abstraction: it translates spatial movement commands
(moveCamera(delta), focusDocument(documentId)) into renderer
CameraState changes, without WorldNavigationSession touching Three.js.
focusDocument() jumps the camera to a world's layout coordinate;
moveCamera() translates both position and target through world space.
The controller always reads the current renderer state before
modifying it, so user-driven orbit/pan remains synchronized.

The shared EventBus is the critical architectural change: all loaded
worlds publish domain events through the same bus, and WorldRenderer
subscribes exactly once. This lets multiple worlds coexist in the same
scene without WorldRenderer knowing why they are there. When a world
leaves the streaming radius, WorldNavigationSession calls
session.removeWorld(world) — a new renderer-level operation that purges
meshes without touching the world itself or unsubscribing from the bus.

WorldNavigationSession maintains two radii:
- STREAMING_RADIUS (150 units): worlds inside this are loaded.
- NAVIGATION_RADIUS (80 units): worlds inside this are shown in the
  "Nearby Worlds" UI panel but may or may not be loaded.

The larger streaming radius provides hysteresis: a world near the
boundary won't thrash between loaded/unloaded as the camera drifts.
Only when it exits the streaming radius is it actually purged.

navigateToDocument(documentId) positions the camera at the world's
layout coordinate (plus an offset) and immediately calls
updateSpatialView() to populate the scene. updateSpatialView() reads
the camera's current world-space position, asks WorldLayoutProvider for
visible documentIds, and reconciles the difference with the currently
loaded set — unloading departed worlds and loading newly visible ones.
Failed loads are retried with exponential cooldown (2s, 5s, 10s) rather
than permanently blacklisted. Both operations return { loaded, visible,
failed } so the UI can refresh its HUD.

getSpatialState() is the UI-facing query: it returns loaded documentIds,
visible documentIds (streaming radius), nearby documentIds (navigation
radius), failed documentIds, and the camera position — everything the
World View overlay needs without the UI reaching into the session's
private state.

Spatial selection and hover are kept strictly separate:
- pick(screenX, screenY, { toggle }) → SpatialSelectionState (persistent until
  cleared or the referenced world is unloaded). A normal click replaces the
  selection; Ctrl/Cmd/Shift-click toggles the hit brick in the current
  selection.
- hover(screenX, screenY) → SpatialHoverState (transient, updated on
  every pointer move with no buttons pressed).

The UI distinguishes click from drag using a 6-pixel threshold: a
pointerdown followed by pointerup with movement below the threshold is
a click (calls pick()); above the threshold is a drag (handled by the
renderer OrbitControls). This prevents accidental selection while
starting a camera orbit.

SpatialSelectionState (application/spatial-state/SpatialSelectionState.js)
is pure data representing what is currently selected in the spatial
world. As of 0.1.36 it can represent one brick, many bricks, ground, or
nothing. Brick selections store references only: documentId plus an
items[] array whose entries are { type: 'brick', buildingId, brickId }.
Convenience accessors preserve the old single-selection shape: type,
buildingId, brickId, primary, isEmpty, isSingle, and brickIds. It is
deliberately NOT the same as editor SelectionState — spatial selection
is observation, not editing. A user may select a brick in another world
without entering an editing session. Immutable factories:
SpatialSelectionState.empty(), .brick({...}), .bricks({...}),
.ground(...).

SpatialHoverState (application/spatial-state/SpatialHoverState.js)
mirrors SpatialSelectionState but represents transient hover
observation rather than persistent selection. It is used by the
World View HUD to show temporary identity information without
committing to a selection.

SpatialCameraState (application/spatial-state/SpatialCameraState.js)
holds position, target, and mode ('orbit') for the spatial camera —
navigation semantics, not Three.js. Like the other spatial-state
objects, it is runtime-only and never serialized.

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

CreateWorldLayoutUseCase (application/CreateWorldLayoutUseCase.js)
constructs the concrete world layout backend and returns the provider,
so ui/ never imports world-layout/ or discovery/ directly. Same shape as
CreatePersistenceUseCase, CreatePublisherUseCase, and
CreateIdentityProviderUseCase. Swapping to a geographic, procedural, or
blockchain-anchored layout later means changing exactly this one file.

WorldViewSession (application/WorldViewSession.js), updated 0.1.27, owns
the live read-only runtime graph for World View. It now accepts a
WorldLayoutProvider and uses it to position the camera when a document
is loaded, and to answer spatial queries (getNearbyDocuments,
getDocumentPosition) for the navigation UI. This keeps the renderer
completely ignorant of layout: WorldViewSession translates layout
coordinates into CameraState, then hands that state to
RenderWorldViewUseCase's abstraction.

RenderWorldViewUseCase (application/RenderWorldViewUseCase.js), updated
0.1.27, now exposes getCameraState()/setCameraState() on its returned
handle so WorldViewSession can position the camera without touching
Renderer directly. This is the same abstraction discipline used
elsewhere: the use case decides what the session can do; the session does
not reach past the use case into renderer internals.

LoadPublicationDocumentUseCase (application/LoadPublicationDocumentUseCase.js)
loads a Document by its world id for read-only consumption. It bypasses
DocumentManager entirely because World View does not track dirty/saved
state. This use case is the concrete architectural boundary between
Publication (metadata that navigates) and Document/World (geometry that
renders).

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
how many children it has. execute() runs children in the order added.
As of 0.1.36, execution is transactional: if a later child throws,
CompositeCommand undoes the already-executed children in reverse order
and then rethrows the original error, so the world is not left partially
modified. undo() also reverses children in the OPPOSITE order, since a
later child might depend on an earlier one having already happened.
canUndo() is true only if there's at least one child and every child can
be undone — a composite is only as undoable as its least-undoable part.
CompositeCommand can also carry an optional description such as
"Move 5 Bricks" for user-facing undo/redo labels.

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
CompositeCommand delegates to its single child, reports grouped brick
labels such as "Move 5 Bricks" when children share the same action, or
falls back to "N actions"). Both label methods return null rather than throwing when
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

Command Serialization & Registry (0.1.35)

Every Command now carries a stable identity (id, timestamp) and a type
string (e.g. "place-brick", "move-brick"). All concrete commands implement
toJSON() and fromJSON(json, registry), making them serializable without
losing undo capability.

CommandRegistry (application/commands/CommandRegistry.js) is the central
factory: register(type, CommandClass) maps a type string to a class,
and fromJSON(json) reconstructs any registered command from its JSON
representation. This eliminates the need for CommandHistory or
persistence code to know about concrete command classes.

CommandHistory gained toJSON() and CommandHistory.fromJSON(json, context,
registry) in 0.1.35. As of 0.1.37, its persistent-session envelope is
cursor-based rather than stack-based:

    {
        schemaVersion: 1,
        cursor: 2,
        commands: [
            { type: "move-brick", ... },
            { type: "composite", commands: [ ... ], ... },
            { type: "rotate-brick", ... }
        ]
    }

Commands before cursor are currently applied and form the undo stack.
Commands at and after cursor form the redo branch. CommandHistory validates
this envelope, rejects unsupported schema versions and out-of-bounds cursors,
and lets CommandRegistry reject malformed or unknown command payloads safely.
The older { executed, redo } shape is still accepted as a migration input,
but new writes use { schemaVersion, cursor, commands }.

This history envelope is explicitly separate from Document serialization:
Document JSON remains the canonical persisted world state, while command
history JSON is optional editing/session persistence layered around that
state. This keeps runtime selection/spatial-editing state and protocol state
separate, and leaves command replay as a later concern rather than making the
undo stack part of the core document format.

Linear history invariant: executing a new command after undo() clears
the redo branch entirely. A fresh action invalidates whatever "future"
an undo had left available. This is enforced inside execute(), not by
callers.

CompositeCommand is fully serializable via the registry. Its fromJSON()
recursively deserializes child commands through the same registry,
preserving atomicity across save/load boundaries. As of 0.1.36 this
foundation is active: selecting ten bricks and moving, rotating, or
deleting them produces one CompositeCommand and therefore one undo/redo
entry.

The command subsystem is now a first-class architectural layer:

    UI / Session
         ↓
    SpatialEditingService / Tool
         ↓
    CommandHistory
         ↓
    CommandRegistry
         ↓
    ┌────┴────┬────────┐
    ↓         ↓        ↓
  Place     Move    Rotate
  Delete  Composite  ...

CommandHistory knows nothing about World View, selection, Vue, or the
renderer. It only knows: execute, undo, redo, serialize. The session
remains the coordinator.

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

IdentityUseCase (application/IdentityUseCase.js) wraps IdentityProvider
to provide a subscription-based interface for UI components, mirroring
DocumentManager's onStateChanged pattern. login(username)/logout()
publish IdentityChanged events; onUserChanged(callback) returns an
unsubscribe function. The underlying provider is exposed via
identityUseCase.provider so that EditorSession, ForkDocumentUseCase,
and CreatePublisherUseCase can receive the same shared instance that
the UI layer logs in and out of. Constructed once in ui/main.js and
provided to the Vue app via provide/inject, so every view shares the
same login state without ui/ importing identity/ directly.

CreatePublisherUseCase (application/CreatePublisherUseCase.js) wires the
concrete publishing backend and returns the use case, so ui/ never
imports publisher/ or storage/ directly. Same shape as
CreatePersistenceUseCase and CreateIdentityProviderUseCase.
Swapping to a Steem/Hive/Ethereum publisher later means changing
exactly this one file — the use case and UI stay untouched.

CreateWorldViewUseCase (application/CreateWorldViewUseCase.js) constructs
the read-only world exploration backend and returns a session factory,
so ui/ never imports storage/ or renderer/ directly. Same shape as
CreatePersistenceUseCase and CreatePublisherUseCase — swapping to a
networked document loader later means changing exactly this one file.

WorldNavigationSession (application/WorldNavigationSession.js), added
0.1.28, replaces WorldViewSession as the owner of the live read-only
runtime graph for World View. It coordinates five responsibilities:
camera positioning, spatial discovery via WorldLayoutProvider,
document loading via LoadPublicationDocumentUseCase, world load/unload
reconciliation, and a shared EventBus that feeds a single
WorldRenderer.

The shared EventBus is the critical architectural change: all loaded
worlds publish domain events through the same bus, and WorldRenderer
subscribes exactly once. This lets multiple worlds coexist in the same
scene without WorldRenderer knowing why they are there. When a world
leaves the streaming radius, WorldNavigationSession calls
session.removeWorld(world) — a new renderer-level operation that purges
meshes without touching the world itself or unsubscribing from the bus.

WorldNavigationSession maintains two radii:
- STREAMING_RADIUS (150 units): worlds inside this are loaded.
- NAVIGATION_RADIUS (80 units): worlds inside this are shown in the
  "Nearby Worlds" UI panel but may or may not be loaded.

The larger streaming radius provides hysteresis: a world near the
boundary won't thrash between loaded/unloaded as the camera drifts.
Only when it exits the streaming radius is it actually purged.

navigateToDocument(documentId) positions the camera at the world's
layout coordinate (plus an offset) and immediately calls
updateSpatialView() to populate the scene. updateSpatialView() reads
the camera's current world-space position, asks WorldLayoutProvider for
visible documentIds, and reconciles the difference with the currently
loaded set — unloading departed worlds and loading newly visible ones.
Both operations return { loaded, visible } so the UI can refresh its HUD.

getSpatialState() is the UI-facing query: it returns loaded documentIds,
visible documentIds (streaming radius), nearby documentIds (navigation
radius), and the camera position — everything the World View overlay
needs without the UI reaching into the session's private state.

RenderWorldViewUseCase (application/RenderWorldViewUseCase.js), updated
0.1.28, exposes removeWorld(world) on its returned handle so
WorldNavigationSession can unload geometry without touching Renderer
directly. This is the same abstraction discipline as getCameraState/
setCameraState: the use case decides what the session can do; the
session does not reach past the use case into renderer internals.

CreateWorldViewUseCase (application/CreateWorldViewUseCase.js), updated
0.1.28, now constructs a single shared LocalStorageProvider and wires
it to LocalDiscoveryProvider, LocalWorldLayoutProvider, and
LoadPublicationDocumentUseCase. This fixes the 0.1.27 issue where two
independent storage graphs existed; the same provider instances now
flow through the entire composition root.

renderer/

WorldRenderer (renderer/WorldRenderer.js), updated 0.1.28, adds
removeWorld(world). It iterates every building and brick in the world
and purges each mesh from MeshRegistry and the Three.js scene. The
EventBus subscription remains active because other loaded worlds still
publish through the same bus. This is the concrete multi-world support:
WorldRenderer now manages a heterogeneous set of meshes from arbitrary
documents without knowing which world each mesh came from — it only
knows brickIds, and brickIds are globally unique UUIDs.


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
state — Picking does not depend on them; they depend on it.
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

MeshRegistry (renderer/MeshRegistry.js), updated 0.1.29, now tracks
documentId per mesh. The registry maps brickId -> { documentId,
buildingId, mesh } so that a raycast hit can be resolved not just to
a brick and building, but to the world/document that owns it. This is
the critical identity bridge for multi-world spatial interaction:
without it, picking in a scene with multiple loaded worlds would be
ambiguous.

PickingService (renderer/PickingService.js), updated 0.1.29, adds
pickRich(screenX, screenY) returning a renderer-independent interaction
result:

    { type: 'brick', documentId, buildingId, brickId, point }

or null. The legacy pick() shape ({ brickId, buildingId }) remains for
EditorView compatibility. pickGroundPosition() now returns a
core/WorldPosition and is wrapped by pickGround() in
RenderWorldViewUseCase to return a consistent { type: 'ground', position }
shape.

SpatialSelectionRenderer (renderer/SpatialSelectionRenderer.js) is the
third overlay layer (after SelectionRenderer and PreviewRenderer). It
handles both selection (orange) and hover (blue) highlighting for the
spatial world using emissive color, driven imperatively by
WorldNavigationSession rather than by EventBus. selectBrick() and
hoverBrick() operate independently — a brick can be hovered while
another is selected, and clearing one does not affect the other. This
keeps spatial selection completely separate from editor selection.

WorldRenderer (renderer/WorldRenderer.js), updated 0.1.29, adds
addWorld(world, documentId) for imperative multi-world loading. When
WorldNavigationSession loads a document, it calls addWorld() with the
documentId so MeshRegistry can associate every brick mesh with its
owning document. The event-driven subscribe() mode still works for
single-world EditorView sessions, but World View now uses imperative
addWorld/removeWorld instead.

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

WorldView (ui/views/WorldView.js), updated 0.1.30, is now fully
interactive with free spatial navigation. Pointer clicks on the
viewport call session.pick() only when the pointer movement stays
below a 6-pixel drag threshold; above the threshold, the interaction
is treated as a camera drag. Pointer moves with no buttons pressed
drive session.hover(), producing transient SpatialHoverState. The
overlay displays both hover and selection panels, including world
title, author, brick identity, and coordinates. Nearby Worlds are
focused via focusWorld(documentId), which calls session.focusDocument()
and updates the URL with router.replace() — no page reload.

The renderer remains ignorant of why multiple worlds are present. It
simply renders whatever meshes the shared EventBus delivers.


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
directly), which still worked but wasn't strictly the stated convention.

ForkTree (ui/components/ForkTree.js) is a recursive component that renders
a Publication's descendant lineage from parentDocumentId links. Consumed
by Author View; could be reused anywhere a fork graph is needed.

WorldView (ui/views/WorldView.js), updated 0.1.27, is now spatially
aware. It displays the loaded world's layout coordinates and a "Nearby
Worlds" panel populated via WorldLayoutProvider.findVisibleDocuments().
Clicking a nearby world navigates to it. The renderer itself remains
ignorant of why worlds are where they are — it simply renders whatever
WorldViewSession asks it to.



world-layout/

The spatial adapter family, added 0.1.27. Answers "Where do published
worlds exist in a shared spatial coordinate system?" It does NOT load
Documents — that is LoadPublicationDocumentUseCase's job. It only answers
spatial questions: given a camera/view region, which documents are
visible? Given a documentId, where is it?

WorldLayoutProvider (world-layout/WorldLayoutProvider.js) is the base
class: findVisibleDocuments(viewCenter, viewRadius) returns documentIds;
getPosition(documentId) returns a core/WorldPosition. Both throw by
default — same discipline as DiscoveryProvider, PublisherProvider, etc.

LocalWorldLayoutProvider (world-layout/LocalWorldLayoutProvider.js) is the
first concrete implementation: a deterministic 2D grid layout computed
from the discovery catalog. No persistence, no GPS, no blockchain — just
a pure function of the publication list so the spatial boundary can be
exercised before external complexity is introduced. Publications are spaced
at 40-unit intervals on the XZ plane; the grid rebuilds whenever the
discovery catalog changes.

The critical architectural separation: DiscoveryProvider answers "What
has been published?" WorldLayoutProvider answers "Where are those
publications in space?" Neither knows about the other at the protocol
level; LocalWorldLayoutProvider consumes a DiscoveryProvider as an
implementation detail, but the UI consumes them through separate use-case
factories.

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

As of 0.1.25, the local publication lifecycle is complete. A document
can be created → saved → published → discovered in Repository View →
opened for viewing or forked into a new independent document. The three
identity layers (Document, Publication, Blockchain) are kept strictly
separate: Publication.id is not Document.world.id, and a future
blockchain transaction ID will not replace either.

DiscoveryProvider gained findByDocumentId(documentId) so callers can
locate every publication that references a given document — necessary
when one document has been published multiple times or through multiple
providers.

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

As of 0.1.26, three views consume the same DiscoveryProvider
abstraction: Repository View (technical exploration), Author View
(social exploration), and World View (spatial exploration). No separate
discovery systems are needed for each.

identity/

As of 0.1.21B, IdentityUseCase provides the UI-facing wrapper, and
ui/components/UserWidget.js / LoginModal.js are the first identity UI.
The widget lives in the global app header, so the current user is
visible across all views; the modal prompts for a username and calls
identityUseCase.login(). The same shared provider instance is injected
into EditorView, so documents created or forked after login
automatically carry the correct author — completing the loop from
login → currentUser() → DocumentMetadata.author → Publication.author
→ Repository View.

Spatial Inspection (0.1.31)

The spatial layer gained a fourth responsibility: domain inspection.
Picking answers "what is under the cursor?" Selection answers "what did
the user choose?" Inspection answers "what do we know about it?" — and
it answers by reaching into the loaded Document/World, never into the
renderer.

SpatialInspectionState (application/spatial-state/SpatialInspectionState.js)
is pure runtime data: type, documentId, buildingId, brickId, and a data
payload carrying resolved domain metadata (title, author, brick type,
position, rotation, building brick count, etc.). It is deliberately
not serializable and not part of the ForkBuild Protocol — it describes
the current viewer's observation, not the persisted world.

SpatialInspectionService (application/SpatialInspectionService.js)
resolves a SpatialSelectionState against the session's loaded documents.
If the selection references a brick, it walks World -> Building ->
Brick and returns a populated SpatialInspectionState. If the selection
references ground, it returns world metadata plus the ground position.
The service knows nothing about Three.js; the UI consumes its output
without ever importing renderer/.

This creates a clean four-layer boundary:

    PickingService          (renderer/ — raycasts meshes)
         ↓
    SpatialSelectionState   (application/ — what was chosen)
         ↓
    SpatialInspectionService (application/ — what do we know about it)
         ↓
    World / Document        (core/ — domain truth)

WorldNavigationSession owns the inspection lifecycle: pick() refreshes
the inspection after every selection change, and clearSelection() resets
it. Unloading a world that owns the current selection also clears the
inspection, maintaining the Spatial Selection Invariant.

Highlight Compositor (0.1.31)

SpatialSelectionRenderer (renderer/SpatialSelectionRenderer.js) was
rewritten as a composited state machine. As of 0.1.36 it tracks a Set of
selected brick ids, a primary selected brick id, and the hovered brick id
independently. A single private _applyHighlight(brickId) method decides
the actual emissive color:

    selected + hovered → combined amber (#ffcc00)
    primary selected   → bright amber (#ffdd33)
    selected only      → orange (#ffaa00)
    hovered only       → blue (#44aaff)
    neither            → black (#000000)

This fixes the 0.1.30 bug where hover could overwrite selection and
clearHover could erase a selected brick's highlight. The architecture
already said selection and hover were independent; the renderer now
matches that promise.

Spatial Focus Navigation (0.1.31)

SpatialCameraController gained focusTarget(target, offset) in addition
to the existing focusDocument(documentId, layoutPosition). This enables
three levels of spatial focus:

    focusDocument(documentId)  → jump to a world's layout coordinate
    focusBuilding(...)         → jump to a building's centroid
    focusBrick(...)            → jump to a brick's position

WorldNavigationSession exposes focusSelection(), which reads the current
SpatialInspectionState and, if it carries a position, calls
focusTarget() with a tight offset (12 units). This lets a user click a
brick, inspect it, and then focus the camera directly on it — the
first step toward a navigable building environment rather than just a
world viewer.

Multi-World Layout Offsets (0.1.31)

WorldRenderer.addWorld(world, documentId, layoutPosition) now accepts
an optional layoutPosition. When provided, every brick mesh in that
world is translated by the layout offset before entering the scene.
This lets multiple worlds coexist in shared space without overlapping,
since each occupies the region assigned by WorldLayoutProvider.

LocalWorldLayoutProvider places publications on a 40-unit grid, so worlds
are naturally separated. The renderer no longer needs to know why worlds
are where they are — it simply applies the offset it is given.

Spatial Editing Context (0.1.32)

The spatial layer became bidirectional: 0.1.31 established reading the
world; 0.1.32 establishes expressing changes to it without the UI or
renderer mutating domain objects directly.

SpatialEditingContext (application/spatial-state/SpatialEditingContext.js)
is runtime-only state describing what is currently editable and what
operations are permitted on it. It carries capability flags (move,
rotate, delete, place) rather than assuming every object supports every
operation. The UI reads these flags to decide which controls to render;
it never assumes "a brick can always be moved."

SpatialEditingService (application/SpatialEditingService.js) is the
sole authority for translating editing intent into domain mutations.
It exposes getEditingContext(selection) -> SpatialEditingContext,
single-brick operations like moveBrick(documentId, buildingId, brickId,
delta), and selection-level operations moveSelection(), rotateSelection(),
and deleteSelection(). For multi-selection, the service builds one child
MoveBrickCommand/RotateBrickCommand/DeleteBrickCommand per selected item
and wraps them in a CompositeCommand. The UI calls these operations; it
never touches Brick.position directly.

The editing flow is:

    UI input (keyboard nudge, delete key)
         ↓
    WorldNavigationSession.moveSelection(delta)
         ↓
    SpatialEditingService.moveSelection(...)
         ↓
    CompositeCommand
         ↓
    MoveBrickCommand / RotateBrickCommand / DeleteBrickCommand
         ↓
    World.updateBrick(buildingId, brickId, { position })
         ↓
    DomainEvent.BRICK_UPDATED
         ↓
    WorldRenderer._onBrickUpdated
         ↓
    Mesh position refreshed from domain + layout offset

This preserves the invariant: Domain -> Event -> Renderer, never the
reverse. The renderer reacts to BRICK_UPDATED by reading the brick's
new local position, adding the world's layout offset, and updating the
mesh — it does not mutate the brick.

Spatial Placement & Stacking (0.1.33)

The spatial editing loop is now complete: Select → Position → Preview
→ Place → Domain Mutation → Event → Renderer.

SpatialPlacementState (application/spatial-state/SpatialPlacementState.js)
is runtime-only state describing where a brick would be placed if
committed. It carries document-local position, rotation, the target
document/building, and a valid flag. Like all spatial state, it never
enters the Protocol.

SpatialPlacementService (application/SpatialPlacementService.js)
translates world-space pick results into document-local placement
positions. It handles two cases:

- Ground hit: uses PlacementPositionService.calculateGround() to snap
  to grid and rest the brick on the ground plane using its half-height.

- Brick surface hit: uses PlacementPositionService.calculateStack() to
  derive the new position from the clicked face normal and both bricks'
  dimensions. A click on the top face of a 1×1×1 cube places another
  cube at y + 1; a click on the side places it adjacent in X or Z.

The placement position is always in document-local space. The renderer
adds the world's layout offset when showing the preview ghost and when
reacting to BRICK_ADDED. This keeps the domain model ignorant of where
its world lives in shared space.

PlacementPositionService (application/PlacementPositionService.js) is
shared between PlacementTool (EditorView) and SpatialPlacementService
(WorldView). It is geometry-aware: it reads width/height/depth from
BrickDefinition rather than hard-coding offsets. This means a 2×4 plate
(0.25 height) stacks correctly on top of a 1×1 cube (1.0 height) because
the service adds half of each dimension along the face normal.

PickingService (renderer/PickingService.js) now returns face normals
for brick hits. pickRich() computes the world-space normal from the
intersected face, quantizes it to the nearest axis (±X, ±Y, ±Z), and
returns it as { x, y, z } integers. This gives the placement system a
clean "which face was clicked" signal without Three.js leaking upward.

SpatialPreviewRenderer (renderer/SpatialPreviewRenderer.js) is the
World View counterpart to PreviewRenderer. It is driven imperatively by
WorldNavigationSession rather than by EventBus: show(definitionId,
position, rotation) adds or moves a ghost mesh; hide() removes it.
The ghost uses the same ThreeBrickFactory as real bricks but with
transparent material. It never touches domain state.

The placement flow in World View:

    Hover over ground or brick
         ↓
    SpatialPlacementService.calculateFromHit()
         ↓
    SpatialPlacementState (document-local position)
         ↓
    SpatialPreviewRenderer shows ghost at world-space position
         ↓
    User clicks
         ↓
    WorldNavigationSession.commitPlacement()
         ↓
    PlaceBrickCommand (reused from 0.1.14)
         ↓
    CommandHistory.execute()
         ↓
    World.addBrickToBuilding()
         ↓
    DomainEvent.BRICK_ADDED
         ↓
    WorldRenderer._onBrickAdded()
         ↓
    Mesh appears at correct world-space position (local + layout offset)

This reuses the exact same PlaceBrickCommand and CommandHistory that
the Editor View has used since 0.1.14. There is no second mutation
mechanism for spatial editing — one authoritative path exists for
adding bricks.

Brick Dimensions (0.1.33)

BrickDefinition now carries width, height, and depth (default 1, 1, 1).
CoreLibrary definitions declare their true sizes: plate_2x4 is
width=2, height=0.25, depth=4; window_small is depth=0.25. These
dimensions are pure metadata — no geometry — but they let the placement
system calculate correct stacking positions without assuming every brick
is a 1×1×1 cube.

The renderer's ThreeBrickFactory already produced correctly-sized
meshes (BoxGeometry sizes). Now the domain model agrees with the
renderer about how much space each brick occupies, making placement
calculations accurate in both directions.

Coordinate Space Discipline (0.1.33)

Placement maintains strict separation between three frames:

    Screen Space     — mouse coordinates (clientX/Y)
         ↓
    Ray / Hit Space  — world-space intersection point from PickingService
         ↓
    World Space      — hit point minus layout offset = document-local
         ↓
    Domain Position  — stored in Brick.position

SpatialPlacementState.position is always document-local. The preview
renderer adds the layout offset. The focus camera uses worldPosition
(from inspection). This prevents the coordinate drift that would
otherwise accumulate when placing bricks in offset worlds.

Coordinate Spaces (0.1.32)

A strict distinction now exists between three coordinate frames:

    Local Position    — brick.position inside its own World/Document.
                      This is what the domain model stores.

    Layout Position   — where the document lives in shared spatial
                      space, from WorldLayoutProvider.

    World Position    — local + layout offset. This is where the
                      mesh actually appears in the Three.js scene.

SpatialInspectionState.data carries both localPosition and
worldPosition so consumers can choose the right frame for their
purpose. focusSelection() uses worldPosition (where the camera should
look), while moveSelection() operates on localPosition (the domain
model's native frame).

WorldRenderer tracks layout offsets per documentId in _documentOffsets
and applies them during addWorld() and _onBrickUpdated(). This means
a brick moved in local space automatically renders at the correct
world-space location regardless of which layout cell its document
occupies.

BRICK_UPDATED (0.1.32)

World.updateBrick(buildingId, brickId, changes) is the new domain
mutation. It applies changes to the Brick instance and publishes
DomainEvent.BRICK_UPDATED with the payload { buildingId, brick }.
The renderer subscribes to this event and updates the corresponding
mesh position/rotation without touching the domain object.

This event is intentionally minimal: it carries the brick itself
(rather than a delta) so the renderer simply reads authoritative
state. A future command-history system could choose to record either
the delta or the before/after snapshot; the event itself remains
agnostic.

Spatial Identity Note (0.1.32)

MeshRegistry keys meshes by brickId alone. In practice, brickIds are
UUIDs generated by core/createId.js, and ForkDocumentUseCase strips
and regenerates all instance IDs during a fork, making collisions
between independently created documents astronomically unlikely.
However, MeshRegistry.set() also stores documentId per entry, so a
future migration to composite keys (documentId + brickId) or a
dedicated SpatialObjectId would be localized to MeshRegistry and
PickingService without touching the domain model or the UI.

View Modes

ForkBuild's Document abstraction makes three distinct presentation
modes possible without duplicating data:

Repository View — the "GitHub" mode. A list of projects per author,
searchable, forkable. Each entry is a Publication (or a local
DocumentSummary). Users open one, inspect bricks, fork it, modify it.
This is the builder's primary interface. Implemented as of 0.1.23;
enhanced in 0.1.26 with Explore actions and clickable author links that
route to Author View.

Author View — the "profile" mode. Every Publication has an author
field. Grouping by author produces a portfolio page: published works,
fork counts, and recursive fork trees reconstructed client-side from
parentDocumentId. Implemented as of 0.1.26 as ui/views/AuthorView.js.

World View — the "Minecraft" mode. As of 0.1.30, World View is a
free spatial navigation environment. Users can orbit, pan, and zoom
through a continuous 3D space while worlds stream in and out based on
camera position. Clicking selects a brick or ground point; hovering
shows transient identity information without committing to a selection.
The camera position is the source of truth for streaming — not UI
buttons. Editing is explicitly not part of this milestone — spatial
interaction is observation, not mutation.

All three modes are views over the same underlying data graph:

          Alice (author)
             │
     Medieval House (Publication)
        │      │      │
     uses    near   forked
        │      │      │
   Stone Pack Castle  Bob's House

Repository View explores the "contains" edge.
World View explores the "near" edge via WorldLayoutProvider.
Author View explores the "authored" edge.

The three views consume the same DiscoveryProvider and Publication
abstraction — no separate discovery systems. Repository View and Author
View operate almost entirely on Publication metadata. World View loads
the actual Document/World through LoadPublicationDocumentUseCase because
it needs geometry and semantic information to render. World View also
consumes WorldLayoutProvider because it needs to know where to place
the camera and which neighbors exist. This is the concrete
demonstration of the Publication/Document/Location boundary:
Publication describes that something was published; World describes
what exists; WorldLayout describes where it exists.

World Layout (0.1.27)

Rather than hard-coding "The Global World," ForkBuild introduces a
WorldLayoutProvider abstraction whose sole job is spatial placement.
The LocalWorldLayoutProvider implementation arranges publications on
a deterministic grid; future implementations could be:

- Geographic: documents have lat/long coordinates.
- Random island: one island per author.
- Theme park: fantasy district, sci-fi district, modern district.
- Time-based: newest builds nearby, older builds farther away.

The renderer doesn't care. It asks the layout provider where to place
the camera, then loads the corresponding Documents via
LoadPublicationDocumentUseCase and renders them through
RenderWorldViewUseCase. As of 0.1.27, World View loads one document at
a time by direct navigation, positioned at its layout coordinate; a
future milestone could extend this to ambient spatial streaming based
on camera movement.

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
offers both Open and Fork actions on each Publication card; World View
offers Open and Fork from the spatial scene.

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

Spatial State — as of 0.1.30, a third kind of runtime state exists for
the World View: SpatialCameraState, SpatialSelectionState, and
SpatialHoverState. These are neither Domain State nor Editor State;
they are transient navigation observations local to a spatial viewing
session. As of 0.1.31, SpatialInspectionState joins this group. As of
0.1.32, SpatialEditingContext completes it — describing what the viewer
can currently do to a selected object. As of 0.1.36, SpatialSelectionState
and SpatialEditingContext can carry multi-selection references through
items[] while still exposing a primary item for single-selection UI. All
spatial state is runtime-only and never serialized into the Protocol.

Spatial Selection Invariant

A SpatialSelectionState may reference only a currently loaded document.
When that document leaves the streaming radius, the selection is cleared
before its meshes are removed. This invariant is enforced by
WorldNavigationSession._unloadWorld(), which checks whether the
selection or hover references the departing document and clears them
before the renderer purges the world's meshes. Violating this invariant
would produce application state pointing to unloaded geometry, which
does not crash the renderer (MeshRegistry simply returns null) but
creates a logical inconsistency that would confuse UI and future
multiplayer synchronization.

Publication vs Document vs Location

Three distinct abstractions, kept strictly separate:

- Publication — describes that something was published. Metadata only:
  title, author, publishedAt, parentDocumentId. Enough for Repository
  and Author Views.

- Document/World — describes what exists. Geometry, bricks, buildings.
  Required for World View rendering. Loaded on demand by
  LoadPublicationDocumentUseCase.

- WorldLayout/WorldPosition — describes where it exists in a shared
  spatial coordinate system. Required for World View camera placement
  and neighbor discovery. Answered by WorldLayoutProvider.

No abstraction leaks into another. Publication does not carry geometry.
Document does not carry layout coordinates. WorldLayoutProvider does not
load Documents. This separation means the same Document can appear in
multiple layouts, or the same Publication can reference a Document whose
geometry is temporarily unavailable, without breaking any view.

Dependency direction

ui -> application -> core
application -> renderer
application -> storage / publisher / identity / serializer / discovery / world-layout
renderer -> core (reads domain events and data; never the reverse)

core never depends on anything above it. renderer never owns data, only
visualizes what it's given, and now only reacts to events rather than
being handed a World directly.

Naming convention

| Purpose                           | Suffix    |
|------------------------------------|-----------|
| Persistent domain object          | *(none)* — World, Brick, Building |
| Mutable editor state               | State     |
| Spatial observation state          | State     |
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
