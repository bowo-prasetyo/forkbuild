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

As of 0.1.32, World.updateBrick(buildingId, brickId, changes) is the
mutation path for transform edits: it applies position/rotation changes
to the Brick and publishes BRICK_UPDATED. As of 0.1.46 this is also the
exact path the interactive gizmo's live preview and committed
TransformSelectionCommand flow through — the gizmo never touches a mesh
to "move" anything; it changes domain state and lets the renderer react.
As of 0.1.48 the same path carries alignment and distribution results —
two more generators of absolute transforms, same event, same renderer
reaction.

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

InputDispatcher (application/InputDispatcher.js) normalizes raw DOM
PointerEvent/KeyboardEvent/WheelEvent into stable, platform-independent
interaction events and performs picking ONCE per pointer event, before
forwarding to ToolManager. Pointer event shape: { pointerType, buttons,
modifiers: {ctrl,shift,alt,meta}, screenPosition: {x,y}, worldPosition,
pickedBrick }. Both pickedBrick and worldPosition are always computed on
every pointer event, regardless of which one a given tool ends up using —
a conscious trade-off (two raycasts per move instead of one) in exchange
for InputDispatcher never having to guess which half a tool cares about.
Deliberately outside InputDispatcher's job: global, tool-independent
decisions (tool switch shortcuts, Ctrl/Cmd+S/Z/Y) — those don't go to a
tool at all. As of 0.1.46, both EditorSession and WorldNavigationSession
offer every event to the interactive gizmo BEFORE the normal input
pipeline: an active gizmo gesture owns the pointer and keyboard
exclusively (see "Interactive Transform Gizmo" below).

EditorSession (application/EditorSession.js), added 0.1.20C, owns the
entire live runtime graph — the render session (Renderer/WorldRenderer/
PickingService/SelectionRenderer/PreviewRenderer, via
RenderWorldUseCase), the domain EventBus, World, CommandHistory,
ToolManager, and InputDispatcher — as one unit. start(container) builds
it the first time; loadDocument(id) and newDocument() tear the whole
thing down and rebuild it against a different World, sharing the exact
same _rebuild() path start() uses — there is only one way the runtime
graph gets built, whether it's the first time or the fifth.

As of 0.1.46, EditorSession also owns the Editor's gesture service — a
SpatialEditingService wired to the open document through a trivial
getDocument() shim and a world-id -> CommandHistory map refreshed on
every _rebuild() — plus a TransformGizmoUseCase for gizmo presentation.
It passes the gesture service into RenderWorldUseCase so the Editor's
gizmo is driven by exactly the same gesture contract and TransformMath
as World View's. Input routing is exclusive: every pointer/key event is
offered to the gizmo FIRST; while a gesture is active, nothing reaches
the tools (only Escape cancels). As of 0.1.47 pointer move/up forward
modifier state into the transaction and return gesture feedback upward
for the transient overlay. As of 0.1.48 EditorSession also exposes
alignSelection(mode)/distributeSelection(axis) — the same gateway as
every other transform input, so the Editor's alignment panel, keyboard
transforms, and gizmo drags all terminate in the same command machinery.

registry/editorContext/toolRegistry/documentManager/selectionUseCase/
previewUseCase are constructed once, outside EditorSession, and are the
SAME instances across every replacement — only the per-world runtime
gets torn down and rebuilt. EditorContext.selection and the preview are
explicitly cleared on every _rebuild(), since a brickId from the old
world means nothing in the new one.

WorldNavigationSession (application/WorldNavigationSession.js), updated
0.1.30, owns the live read-only runtime graph for World View. It
coordinates camera positioning via SpatialCameraController, spatial
discovery via WorldLayoutProvider, document loading via
LoadPublicationDocumentUseCase, world load/unload reconciliation, spatial
selection/hover state, and a shared EventBus that feeds a single
WorldRenderer.

As of 0.1.46, WorldNavigationSession also exposes the World View's gizmo
surface: gizmoPointerDown/gizmoPointerMove/gizmoPointerUp/gizmoKeyDown
forward raw DOM events to the render session's TransformGizmoController
with the current SpatialSelectionState, and _refreshGizmo() resolves
presentation in document-local coordinates then lifts it into shared
world space with the layout offset — the same coordinate discipline
placement uses. The gesture service is the SAME SpatialEditingService
this session already owned; the gizmo simply drives its existing
begin/preview/commit/cancel contract, so a pointer drag in World View
and a pointer drag in the Editor produce identical
TransformSelectionCommand semantics. As of 0.1.47 the same methods carry
modifier state (precision mode) and gesture feedback; keyboard selection
transforms route through the gesture transaction. As of 0.1.48 the
session exposes alignSelection(mode)/distributeSelection(axis),
refreshing inspection and gizmo presentation after each committed
operation.

SpatialCameraController (application/SpatialCameraController.js) is the
navigation abstraction: it translates spatial movement commands
(moveCamera(delta), focusDocument(documentId)) into renderer
CameraState changes, without WorldNavigationSession touching Three.js.

SpatialEditingService (application/SpatialEditingService.js) translates
spatial editing intent into domain mutations via CommandHistory (see
"Spatial Editing Context (0.1.32)" below). Since 0.1.38 it also owns the
transform gesture transaction — beginTransformGesture /
previewTransformGesture / commitTransformGesture /
cancelTransformGesture — driven since 0.1.46 by BOTH the keyboard paths
and the interactive pointer gizmo, and since 0.1.47 the single home of
transform snapping. As of 0.1.48 it additionally owns alignment and
distribution (alignSelection/distributeSelection). See "Transform
Gesture Architecture", "Transform Precision & Snapping (0.1.47)", and
"Alignment & Distribution (0.1.48)" below for the full invariants.

TransformMath (application/TransformMath.js), added 0.1.46, is the
single source of truth for every transform calculation in the engine:
translation, Y-axis rotation around a pivot, angle measurement around
the pivot, axis projection for constrained drags, rotation deltas from
pointer angles, and the calculateTransforms()/transformsEqual() pair the
gesture transaction uses for preview and commit. Keyboard transforms,
the gizmo's live drag preview, and the committed
TransformSelectionCommand all resolve to these functions — parity is a
construction-time property, not a bug class to test away later.
TransformMath lives in application/, and renderer/ needs it — resolved
by INJECTION, not by importing upward: RenderWorldUseCase and
RenderWorldViewUseCase import it and hand it to the gizmo controller
they construct. If a second consumer below application/ ever needs it,
the correct move is to lower it into core/, never to copy it.

TransformGizmoUseCase (application/TransformGizmoUseCase.js), added
0.1.46, is the gizmo's presentation decision: given a selection, should
a gizmo be visible, and if so where? It answers { bounds, pivot } from
the gesture service's bounds calculation — pivot is always the selection
bounds center (a single brick's own center, or the union-bounds center
of a multi-selection). Pure data in, pure data out — no Three.js, no
mutation, and no opinion about dragging. Both EditorSession and
WorldNavigationSession call it, so "where does the gizmo go" exists
exactly once. Critical invariant restated where the code lives: it only
ever sees a RESOLVED selection — items[], bounds, pivot — never a Group,
a Group.id, or group membership.

TransformSnap (application/TransformSnap.js), added 0.1.47, is the pure
snapping math: snapValue/snapTranslation/snapRotation plus
effectiveIncrement for precision mode. It snaps GESTURE DELTAS, never
absolute positions, always measured from the gesture origin — so a brick
at x = 2.37 nudged by +0.2 stays at 2.37, and crossing +0.7 moves it to
3.37. Snapping once per frame from the origin (never re-snapping a
snapped value) is what makes repeated previews stable and pointer motion
reversible. Includes floating-point hygiene (toPrecision(12)) because
snapped values flow into committed commands, replay comparisons, and the
on-screen readout.

TransformSettings (application/TransformSettings.js), added 0.1.47, is
the session/application-level transform preferences: snappingEnabled,
translationSnap (1 — deliberately matching the placement grid),
rotationSnap (15°), precisionMultiplier (0.1). NOT document state:
nothing here belongs to a World, Document, Building, Brick, or Group,
and nothing here is serialized into the ForkBuild Protocol. Each session
(EditorSession, WorldNavigationSession) owns one instance and hands it
to its gesture service; precision changes gesture interpretation, never
document state.

TransformAlignment (application/TransformAlignment.js), added 0.1.48, is
the pure alignment/distribution math — the entire geometry of the
milestone. calculateAlignmentTransforms(entries, selectionBounds, mode)
implements the nine world-axis operations ('x-min' … 'z-max');
calculateDistributionTransforms(entries, axis) implements even center
distribution with deterministic ordering (axis coordinate, then
buildingId, then brickId) and pinned endpoints. Inputs and outputs are
plain data — no World, Group, Brick, renderer, history, or UI — which is
exactly what keeps groups invisible to this layer and makes it trivially
testable.

Spatial selection/hover/inspection/placement state classes live in
application/spatial-state/ (SpatialSelectionState, SpatialHoverState,
SpatialInspectionState, SpatialPlacementState, SpatialCameraState,
SpatialEditingContext, TransformGizmoState) — all runtime-only, all
pure data, none serialized. SpatialSelectionState can represent one
brick, many bricks, ground, or nothing; brick selections store
references only (documentId + items[] of { type, buildingId, brickId }).
It is deliberately NOT the same as editor SelectionState — spatial
selection is observation, not editing.

renderer/

Three.js. WorldRenderer subscribes to World's domain events and reacts
incrementally — BrickAdded creates one mesh, BrickRemoved deletes one,
BuildingAdded/BuildingRemoved handle a whole building at once (e.g. on
initial load). There is no render(world) sweep. MeshRegistry maps brick
id <-> mesh (bidirectional) plus brick id -> building id and brick id ->
document id, so removal never has to search the scene graph and a raycast
hit can be resolved straight back to a brick/building/document id.

PickingService answers two questions from screen coordinates: what brick
is under this position (pick/pickRich), and where would a ray hit the
ground plane (pickGroundPosition). As of 0.1.33 it also returns the
quantized face normal of a brick hit, which the placement system uses
for stacking. It knows nothing about selection, preview, or any other UI
state — Picking does not depend on them; they depend on it.

CameraController owns orbit/pan/zoom (via Three.js's OrbitControls
addon), resize, and reset (bound to the Home key). CameraState is a pure
data snapshot (position, target, zoom — reusing core/Position) exchanged
via getState()/setState(). As of 0.1.46, setEnabled() lets an active
editing gesture freeze the camera: TransformGizmoController disables
controls for the duration of a gizmo drag, and while disabled both
OrbitControls pointer handling and the Home reset shortcut are ignored —
nothing can move the camera underneath a live drag.

SelectionRenderer, PreviewRenderer, and SpatialPreviewRenderer are the
overlay renderers built before 0.1.46 (selection highlight, editor
placement ghost, spatial placement ghost respectively).

TransformGizmoRenderer (renderer/TransformGizmoRenderer.js), added
0.1.46, is the purely visual half of the interactive transform gizmo:
three translation axis handles (X red, Y green, Z blue), a center
free-move pad, one Y-rotation ring, a pivot marker, and — for selections
that span meaningful space — a subtle bounds box. It handles show/hide,
hover and active highlighting, camera-distance scaling (the gizmo stays
a usable screen size while orbiting), and positioning in world space.
It never mutates the World, never creates commands, and never decides
what a drag means — that is TransformGizmoController's job. It is
anchored to { pivot, bounds } and nothing else: it has no knowledge of
Groups by design, because a group selection arrives already flattened to
its member bricks.

TransformGizmoController (renderer/TransformGizmoController.js), added
0.1.46, is the interaction half: hit testing against the handle meshes,
pointer down/move/up, the active handle, gesture state, and Escape
cancellation. It does not mutate the World either — it drives the
gesture contract (beginTransformGesture / previewTransformGesture /
commitTransformGesture / cancelTransformGesture) implemented by
SpatialEditingService, so a completed pointer drag still produces
exactly ONE TransformSelectionCommand, exactly as the 0.1.38 discipline
requires. All drag math (axis projection, rotation-angle deltas) comes
from the injected TransformMath module — the same definitions the final
command uses — so what you see while dragging is exactly what gets
committed. As of 0.1.47 the controller forwards modifier state with
every move/up (precision mode is interpreted by the transaction, not
here) and passes the transaction's gesture feedback blob upward
opaquely. The controller also enforces gesture exclusivity: on drag
start it disables the camera controls via controlsEnabler, keeps the
selection captured at pointer-down (selection is frozen for the duration),
and re-enables everything on commit or cancel.

Render Layers (conceptual, not yet code)

Think of the scene as three logical layers even though everything
currently lives in one Three.js Scene: a World Layer (bricks, buildings,
terrain — what WorldRenderer manages), an Overlay Layer (selection,
hover, placement preview, measurements — purely visual, never modifies
the World), and a Gizmo Layer (transform handles, axes, manipulators).
As of 0.1.46 the Gizmo Layer is no longer conceptual:
TransformGizmoRenderer and TransformGizmoController are its first real
inhabitants, and the pattern they establish — separate from
WorldRenderer, overlay semantics (depthTest off, high renderOrder),
never mutating the World — is what future gizmos and manipulators should
follow. SelectionRenderer and PreviewRenderer both conceptually belong
to the Overlay Layer; a future pass could replace SelectionRenderer's
emissive mutation with a true independent overlay mesh without changing
either renderer's public shape.

ui/

Vue. The application shell, routes, views, and components. Talks only to
application/, never directly to core/, renderer/, or storage/ — the rule
isn't really "never touch core/ or renderer/," it's "never reach past
application/ to any layer beneath it." Kept intentionally "dumb" so a
future non-Vue client could reuse core/ and application/ unchanged.

EditorView and WorldView (updated 0.1.46) route every pointer and key
event through the session's gizmo surface FIRST: an active gizmo gesture
owns the pointer exclusively — no camera drag, no selection changes, no
hover updates, and no tool shortcuts until pointer-up or Escape. The
gizmo's pointer-up listener sits on window (not the viewport) so a drag
released outside the canvas still commits cleanly. Both views forward
the same raw events; neither knows or cares which gesture service sits
underneath — that parity is the session's job, not the UI's.

TransformFeedback (ui/components/TransformFeedback.js), added 0.1.47, is
the transient gesture overlay: mode/axis, effective snap increment,
precision tag, and the snapped Δ readout ("Move X • Grid 1 / Δ +3",
"Rotate Y • 15° (precision) / Δ +13.5°"). Purely presentational, inline
styles, no state of its own; it displays exactly what the transaction
decided will commit.

AlignmentPanel (ui/components/AlignmentPanel.js), added 0.1.48, is the
compact alignment/distribution surface hosted by both views: nine
alignment buttons (world-axis edges/centers) and three center-
distribution buttons. It knows the operation identifiers ('x-min' …
'z-max', 'x'/'y'/'z') and nothing about the geometry underneath — the
application layer decides what they mean. Enable/disable mirrors the
operation requirements (alignment needs 2+, distribution 3+); no
keyboard shortcuts in this milestone by design.

world-layout/

The spatial adapter family, added 0.1.27. Answers "Where do published
worlds exist in a shared spatial coordinate system?" It does NOT load
Documents — that is LoadPublicationDocumentUseCase's job.
WorldLayoutProvider (world-layout/WorldLayoutProvider.js) is the base
class: findVisibleDocuments(viewCenter, viewRadius) returns documentIds;
getPosition(documentId) returns a core/WorldPosition.
LocalWorldLayoutProvider is the first concrete implementation: a
deterministic 2D grid layout computed from the discovery catalog.

storage/

Filled in at 0.1.20A. StorageProvider is the base class: save/load/
remove/list, operating on plain string names and JSON-safe values.
LocalStorageProvider is the first concrete implementation, namespacing
every key under "forkbuild:". storage/ is the most decoupled layer in
the engine — it doesn't know what a Document is; that pairing happens in
application/SaveDocumentUseCase.js and LoadDocumentUseCase.js.

serializer/

World <-> JSON and Document <-> JSON, used by both storage/ and
publisher/. Serializer (serializer/Serializer.js) is the shared base;
WorldSerializer wraps World.toJSON()/fromJSON(); DocumentSerializer wraps
Document.toJSON()/fromJSON() and validates metadata.protocolVersion on
every deserialize. validate(json) is public on both, returning a
ValidationResult. serializer/ depends on core/ only.

publisher/

Filled in at 0.1.22 — the Publisher Adapter stub. PublisherProvider is
the base class: publish(document, identityProvider) returns a
Publication. LocalPublisherProvider is the first concrete implementation:
no blockchain, but exercises the exact same interface a future
SteemPublisherProvider will use. Publication (publisher/Publication.js)
is the pure-data bridge between Publisher and Discovery.

discovery/

Filled in at 0.1.23 — the Discovery Adapter stub. DiscoveryProvider is
the base class: list(), findById(id), findByAuthor(author),
findByParentId(parentDocumentId), findByDocumentId(documentId).
LocalDiscoveryProvider reads the same localStorage key that
LocalPublisherProvider writes to, returning Publication objects.

identity/

Filled in at 0.1.21. IdentityProvider is the base class: login()/
logout()/currentUser()/sign(data). LocalIdentityProvider is the first
concrete implementation (username + attribution stamp). IdentityUseCase
(application/) wraps it with a subscription interface for the UI.

Spatial Inspection (0.1.31)

SpatialInspectionState is pure runtime data resolved from the loaded
Document/World — never from the renderer. SpatialInspectionService
resolves a SpatialSelectionState against the session's loaded documents.
The four-layer boundary: PickingService (renderer/) -> SpatialSelectionState
(application/) -> SpatialInspectionService (application/) -> World/Document
(core/).

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

SpatialCameraController gained focusTarget(target, offset) alongside
focusDocument(documentId, layoutPosition). This enables document/
building/brick-level focus. WorldNavigationSession exposes
focusSelection(), which reads the current SpatialInspectionState and, if
it carries a position, calls focusTarget() with a tight offset.

Multi-World Layout Offsets (0.1.31)

WorldRenderer.addWorld(world, documentId, layoutPosition) now accepts
an optional layoutPosition. When provided, every brick mesh in that
world is translated by the layout offset before entering the scene.

Spatial Editing Context (0.1.32)

The spatial layer became bidirectional: 0.1.31 established reading the
world; 0.1.32 establishes expressing changes to it without the UI or
renderer mutating domain objects directly.

SpatialEditingContext (application/spatial-state/SpatialEditingContext.js)
is runtime-only state describing what is currently editable and what
operations are permitted on it. It carries capability flags (move,
rotate, delete, place) rather than assuming every object supports every
operation.

SpatialEditingService (application/SpatialEditingService.js) is the
sole authority for translating editing intent into domain mutations.
The editing flow is:

UI input (keyboard nudge, delete key, gizmo drag, align button)
↓
WorldNavigationSession / EditorSession
↓
SpatialEditingService
↓
gesture transaction / TransformSelectionCommand / CompositeCommand
↓
World.updateBrick / addBrickToBuilding / removeBrickFromBuilding
↓
DomainEvent.BRICK_UPDATED / BRICK_ADDED / BRICK_REMOVED
↓
WorldRenderer
↓
mesh refreshed from domain + layout offset

This preserves the invariant: Domain -> Event -> Renderer, never the
reverse.

Spatial Placement & Stacking (0.1.33)

The spatial editing loop is complete: Select → Position → Preview →
Place → Domain Mutation → Event → Renderer. SpatialPlacementState is
runtime-only state describing where a brick would be placed if
committed. SpatialPlacementService translates world-space pick results
into document-local placement positions. PlacementPositionService is
shared between PlacementTool (EditorView) and SpatialPlacementService
(WorldView) and is geometry-aware: it reads width/height/depth from
BrickDefinition rather than hard-coding offsets.

Brick Dimensions (0.1.33)

BrickDefinition now carries width, height, and depth (default 1, 1, 1).
These dimensions are pure metadata — no geometry — but they let the
placement system calculate correct stacking positions. As of 0.1.38 they
also drive SelectionBoundsService, and as of 0.1.48 they drive the
per-brick bounds used by alignment/distribution.

Coordinate Space Discipline (0.1.33)

Placement maintains strict separation between three frames:

Screen Space     — mouse coordinates (clientX/Y)
↓
Ray / Hit Space  — world-space intersection point from PickingService
↓
World Space      — hit point minus layout offset = document-local
↓
Domain Position  — stored in Brick.position

Coordinate Spaces (0.1.32)

A strict distinction exists between three coordinate frames:

Local Position    — brick.position inside its own World/Document.
Layout Position   — where the document lives in shared spatial space.
World Position    — local + layout offset.

BRICK_UPDATED (0.1.32)

World.updateBrick(buildingId, brickId, changes) is the domain mutation.
It applies changes to the Brick instance and publishes
DomainEvent.BRICK_UPDATED with the payload { buildingId, brick }.
The renderer subscribes to this event and updates the corresponding
mesh position/rotation without touching the domain object.

Spatial Identity Note (0.1.32)

MeshRegistry keys meshes by brickId alone. In practice, brickIds are
UUIDs generated by core/createId.js, and ForkDocumentUseCase strips and
regenerates all instance IDs during a fork, making collisions
astronomically unlikely. MeshRegistry.set() also stores documentId per
entry, so a future migration to composite keys would be localized.

Transform Gesture Architecture (0.1.38 foundation, 0.1.46 pointer surface)

Since 0.1.38, every transform gesture — keyboard or pointer — runs
through one transaction owned by SpatialEditingService:

    beginTransformGesture(selection, { mode, axis })
        capture initial transforms, compute bounds + pivot
    previewTransformGesture(selection, transform)   x N
        apply to the live World directly — NO command, NO history
    commitTransformGesture(selection, transform)
        restore original state, then execute ONE
        TransformSelectionCommand; returns false (no command) when
        before == after — the no-op discipline
    cancelTransformGesture(selection)
        restore original state — NO command

0.1.46 added the pointer surface on top of exactly this transaction,
without adding a second one:

    Selection (Editor or World View)
            │
            ├── keyboard transform ──┐
            ├── gizmo drag ──────────┤
            └── future input ────────┘
                                     ▼
                      gesture contract above
                                     ▼
                    TransformMath (one source of truth)
                                     ▼
              TransformSelectionCommand — exactly one per gesture
                                     ▼
                              CommandHistory
                                     ▼
                                  World

As of 0.1.48 the same diagram gains two more arrows into the
transaction's command machinery — align and distribute — which bypass
the preview step (they are not gestures) but terminate in the identical
TransformSelectionCommand. See "Alignment & Distribution (0.1.48)".

The invariants this architecture protects:

- One command per operation. Pointer moves never create commands; the
  preview mutates the live world directly, and only pointer-up produces
  history. A drag with no effective movement commits nothing — the
  commitTransformGesture no-op check, unchanged since 0.1.38.
- One math source. Keyboard transforms, the gizmo's live preview, and
  the committed command all resolve to TransformMath. A "the gizmo
  looked slightly different from keyboard rotation" class of bug cannot
  exist by construction.
- The gizmo never knows about groups. A group selection is flattened to
  its member bricks before the gizmo ever sees it; the gizmo receives
  Selection -> items[] + bounds + pivot and nothing group-shaped.
  Transform operations change only brick transforms; group membership is
  untouched, and one undo restores every member.
- Pivot semantics are the 0.1.44 semantics, made visible. Single brick:
  the brick's own center. Multi-selection — manual or group-resolved:
  the union-bounds center. Rotation happens around that pivot. No
  special "group pivot" concept exists or is needed.
- Session state stays out of history. TransformGizmoState, the
  transient hover/active handle state, and gesture feedback are
  session/render state. They never enter CommandHistory and never
  serialize.
- An active editing gesture temporarily owns the pointer. During a gizmo
  drag: OrbitControls disabled (CameraController.setEnabled(false)),
  selection frozen, hover/picking/marquee bypassed, keyboard swallowed
  except Escape (cancel). Pointer-up commits and restores normal
  interaction. This generalizes the exclusivity principle the 0.1.45
  marquee established.
- Parity is structural. EditorSession and WorldNavigationSession wire
  the same gizmo renderer/controller design against the same gesture
  contract and the same TransformMath. Same gesture in either view ->
  byte-identical committed transforms, asserted directly by
  tests/InteractiveGizmo.test.js.

Dependency-direction note: TransformMath lives in application/, but
renderer/TransformGizmoController needs it — and renderer/ must never
import application/. The resolution is injection, not duplication:
RenderWorldUseCase and RenderWorldViewUseCase (both application/) import
TransformMath and hand it to the controller they construct. The renderer
keeps its renderer -> core discipline, the math exists exactly once, and
the rule "never import upward" survives contact with a real cross-layer
need.

Interactive Transform Gizmo (0.1.46) — what was deliberately NOT built

- No scale handles. The domain has position/rotation/definition but no
  settled scale semantics. Translate + Rotate only — still true as of
  0.1.48; alignment and distribution change positions only and leave
  rotation untouched.
- No new commands. No MoveGizmoCommand, no RotateGizmoCommand, no
  GroupTransformCommand — and 0.1.48 added no AlignCommand /
  DistributeCommand either.
- No snapping in 0.1.46 — that arrived in 0.1.47, inside the
  transaction, not in the gizmo.
- No generic GestureManager — the lifecycle is already shared shape-wise;
  the abstraction waits for a third gesture to prove it.

Transform Precision & Snapping (0.1.47)

Snapping lives INSIDE the gesture transaction — the one place every
transform input converges — so keyboard and pointer are byte-identical
by construction. The invariants:

- Snap the gesture DELTA, never absolute positions, always measured from
  the gesture origin. A brick at x = 2.37 dragged by raw +0.2 stays at
  2.37; crossing +0.7 lands at 3.37. Snapping is a gesture increment,
  not a re-alignment of the world to a global grid.
- Snap once per frame from the origin; never re-snap a snapped value.
  Combined with the 0.1.38 discipline (every frame recomputes from the
  captured initial transforms), this makes previews stable and pointer
  motion reversible.
- One snapped delta for the whole selection — relative arrangement is
  preserved exactly.
- Constraint first, then snap — axis handles resolve to {x: d, y: 0,
  z: 0} before snapping touches anything.
- Precision mode (Shift) scales increments down by the precision
  multiplier (1 → 0.1 units, 15 → 1.5°) per gesture frame. Precision
  changes gesture interpretation, not document state.
- Keyboard selection transforms route through the transaction as
  instantaneous gestures (begin + commit), so a keyboard nudge and an
  equivalently-snapped gizmo drag produce byte-identical
  TransformSelectionCommand payloads — the flagship parity property.
- The no-op discipline survives: a gesture that never crosses a snap
  boundary snaps to zero, transformsEqual rejects it, and zero history
  entries are created.
- Visual feedback: the transaction exposes getGestureFeedback() (snapped
  transform + effective increments + precision flag), passed opaquely
  through the gizmo controller to the views' TransformFeedback overlay.
  The user always sees the transformation that will be committed — no
  release-time jump.

Alignment & Distribution (0.1.48)

Alignment and distribution are transform-generation algorithms, not
new domain operations or command types.

Selection resolves to brick transforms. Selection bounds provide the
alignment reference. The calculated absolute transforms are submitted
through the existing TransformSelectionCommand.

Alignment never passes through gesture snapping: it produces exact
geometric targets rather than user-authored movement deltas. 0.1.47
snapping governs user-authored transform deltas; alignment/distribution
bypass it entirely, because snapping a computed target can destroy the
very relationship being established.

Alignment references the WHOLE selection bounds (min/center/max edge),
never the first selected brick, so selection ordering is irrelevant.
Nine operations, all WORLD axes (never camera directions):

          X             Y             Z
minimum   Left          Bottom        Front
center    Center X      Center Y      Center Z
maximum   Right         Top           Back

Distribution sorts selected members deterministically along the
requested world axis (axis coordinate, then buildingId, then brickId —
replay-safe even for equal coordinates) and interpolates target center
positions between the two endpoint members. Only interior members move;
endpoints are pinned exactly. Centers only — edge-to-edge distribution
is deliberately deferred.

Degenerate rules: alignment with fewer than two bricks, distribution
with fewer than three or a zero span, and already-satisfied arrangements
all produce no history entry — the same transformsEqual discipline the
gesture transaction has enforced since 0.1.38, not a special history
rule.

No group is visible to this layer. A selected group is already resolved
to its member bricks before alignment/distribution begins; membership
and group ids are untouched, and tests assert this byte-for-byte.

No-op operations produce no history entry. One operation produces
exactly one TransformSelectionCommand; undo, redo, serialization, and
replay require no architectural changes whatsoever — that is the point
of building on the closed transform architecture.

View Modes

ForkBuild's Document abstraction makes three distinct presentation
modes possible without duplicating data:

Repository View — the "GitHub" mode. A list of projects per author,
searchable, forkable. Each entry is a Publication (or a local
DocumentSummary). Implemented as of 0.1.23; enhanced in 0.1.26.

Author View — the "profile" mode. Every Publication has an author
field. Grouping by author produces a portfolio page: published works,
fork counts, and recursive fork trees reconstructed client-side from
parentDocumentId. Implemented as of 0.1.26.

World View — the "Minecraft" mode. As of 0.1.30, World View is a free
spatial navigation environment. As of 0.1.46 it is also a full editing
surface: the same interactive gizmo available in the Editor works here
against the spatial selection, with identical gesture semantics — and as
of 0.1.48 the same alignment/distribution operations.

All three modes are views over the same underlying data graph. The three
views consume the same DiscoveryProvider and Publication abstraction —
no separate discovery systems.

World Layout (0.1.27)

Rather than hard-coding "The Global World," ForkBuild introduces a
WorldLayoutProvider abstraction whose sole job is spatial placement.
The renderer doesn't care. It asks the layout provider where to place
the camera, then loads the corresponding Documents via
LoadPublicationDocumentUseCase and renders them through
RenderWorldViewUseCase.

Forking (0.1.24)

A fork is a new Document derived from an existing published document,
not merely a copy of its JSON. The lineage is immutable from the
parent's perspective; the complete ancestry graph can be reconstructed
by querying DiscoveryProvider with findByParentId(). Fork is
distinguished from View and Import.

Domain State vs Editor State

Two kinds of state exist in ForkBuild, and they must never mix.

Domain State — World, Building, Brick, and Document/DocumentMetadata
(core/). Publishable, serializable, shared, forkable.

Editor State — everything in EditorContext (application/): selection,
active tool, active brick, camera pose, placement preview, settings —
plus DocumentState (dirty, readOnly, loadedFrom, lastSaved), owned by
DocumentManager. Purely local to one editing session. Never part of a
World or Document, never serialized into the Protocol, never sent to a
publisher.

TransformSettings (0.1.47) belongs firmly on this side of the line:
snap increments and the precision multiplier are session preferences —
they shape how gestures are interpreted, and nothing about them ever
reaches a serialized Document or the protocol.

Spatial State — as of 0.1.30, a third kind of runtime state exists for
the World View: SpatialCameraState, SpatialSelectionState, and
SpatialHoverState. As of 0.1.31, SpatialInspectionState joins this
group. As of 0.1.32, SpatialEditingContext completes it. As of 0.1.36,
SpatialSelectionState and SpatialEditingContext can carry
multi-selection references through items[]. As of 0.1.46,
TransformGizmoState and the transient gizmo hover/active handle state
join this group; as of 0.1.47, gesture feedback does too. All spatial
state is runtime-only and never serialized into the Protocol.

Spatial Selection Invariant

A SpatialSelectionState may reference only a currently loaded document.
When that document leaves the streaming radius, the selection is cleared
before its meshes are removed. Enforced by
WorldNavigationSession._unloadWorld().

Publication vs Document vs Location

Three distinct abstractions, kept strictly separate:

- Publication — describes that something was published. Metadata only.
- Document/World — describes what exists. Geometry, bricks, buildings.
- WorldLayout/WorldPosition — describes where it exists in a shared
  spatial coordinate system.

No abstraction leaks into another.

Dependency direction

ui -> application -> core
application -> renderer
application -> storage / publisher / identity / serializer / discovery / world-layout
renderer -> core (reads domain events and data; never the reverse)
core never depends on anything above it. renderer never owns data, only
visualizes what it's given, and now only reacts to events rather than
being handed a World directly.

application -> renderer includes construction AND injection: use cases
build renderer subsystems and hand them their collaborators. As of
0.1.46 this includes injecting application/TransformMath into
TransformGizmoController, so renderer/ never imports application/ even
when it needs application-owned logic.

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
but PickingService doesn't fit any other row — it's a capability the
engine provides. CameraController is left as Controller rather than
forced into Renderer: it directly drives interactive hardware-like input.
As of 0.1.46, TransformGizmoController follows the same precedent — it
drives interaction, while its sibling TransformGizmoRenderer does the
actual visualizing.

Recognized, not implemented (future direction, not a commitment):

Workspace — deliberately above DocumentManager, not a replacement for
it. Not a Version 0.1 concern.

EditingGesture family — MarqueeGesture and TransformGizmoGesture already
share one lifecycle shape; alignment/distribution (0.1.48) deliberately
did NOT join it — they are not gestures (no preview, no pointer
ownership), just transform generators that terminate in the same
command. A common gesture abstraction waits for a third true gesture.

Smart guides, magnetic snapping, edge-to-edge distribution, collision-
aware distribution, camera-relative alignment — all explicitly deferred
behind 0.1.48; each would introduce a new interaction or presentation
subsystem immediately after the transform kernel was proven. Numeric
transform input is 0.1.49; a scoped command palette (rather than a
keyboard shortcut matrix) belongs to 0.1.50.

Scale semantics — no settled domain model yet; the gizmo stays
Translate + Rotate, and alignment/distribution change positions only,
until there is one. Nested groups — optional/post-0.2; groups remain
useful without being hierarchical.
