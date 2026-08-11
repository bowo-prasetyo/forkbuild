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

As of 0.1.46, EditorSession also owns the Editor's transform gesture
service — a SpatialEditingService wired to the open document through a
trivial getDocument() shim and a world-id -> CommandHistory map refreshed
on every _rebuild() — plus a TransformGizmoUseCase for gizmo
presentation. It passes the gesture service into RenderWorldUseCase so
the Editor's gizmo is driven by exactly the same gesture contract and
TransformMath as World View's. Input routing is exclusive: every
pointer/key event is offered to the gizmo FIRST; while a gesture is
active, nothing reaches the tools (only Escape cancels). Gizmo
presentation is refreshed from state, never from gesture internals:
selection changes, tool changes, and every command executed/undone/redone
re-resolve { pivot, bounds } and reposition (or hide) the gizmo.

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
TransformSelectionCommand semantics.

SpatialCameraController (application/SpatialCameraController.js) is the
navigation abstraction: it translates spatial movement commands
(moveCamera(delta), focusDocument(documentId)) into renderer
CameraState changes, without WorldNavigationSession touching Three.js.

SpatialEditingService (application/SpatialEditingService.js) translates
spatial editing intent into domain mutations via CommandHistory (see
"Spatial Editing Context (0.1.32)" below). Since 0.1.38 it also owns the
transform gesture transaction — beginTransformGesture /
previewTransformGesture / commitTransformGesture /
cancelTransformGesture — which as of 0.1.46 is driven by BOTH the
keyboard paths and the interactive pointer gizmo. See "Transform Gesture
Architecture" below for the full transaction and its invariants.

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
committed. The controller also enforces gesture exclusivity: on drag
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

SpatialSelectionRenderer tracks selected brick ids, a primary selected
brick id, and the hovered brick id independently; a single
_applyHighlight(brickId) decides the actual emissive color, so hover can
never erase selection and vice versa.

Spatial Focus Navigation (0.1.31)

SpatialCameraController gained focusTarget(target, offset) alongside
focusDocument(documentId, layoutPosition), enabling document/building/
brick-level focus.

Multi-World Layout Offsets (0.1.31)

WorldRenderer.addWorld(world, documentId, layoutPosition) translates
every brick mesh by the layout offset, letting multiple worlds coexist
in shared space.

Spatial Editing Context (0.1.32)

SpatialEditingContext describes what is currently editable and what
operations are permitted (capability flags: move, rotate, delete,
place). SpatialEditingService is the sole authority for translating
editing intent into domain mutations: getEditingContext(selection),
single-brick operations, and selection-level moveSelection()/
rotateSelection()/deleteSelection() (wrapped in CompositeCommand for
multi-selection). The UI never touches Brick.position directly.

Spatial Placement & Stacking (0.1.33)

SpatialPlacementService translates world-space pick results into
document-local placement positions (ground snap or face-normal
stacking). PlacementPositionService is shared between PlacementTool
(EditorView) and SpatialPlacementService (WorldView) and is
geometry-aware (reads width/height/depth from BrickDefinition).

Brick Dimensions (0.1.33)

BrickDefinition carries width, height, depth — pure metadata, used by
placement calculations and (as of 0.1.38) selection bounds.

Coordinate Space Discipline (0.1.33)

Placement maintains strict separation between Screen Space, Ray/Hit
Space, World Space, and Domain Position. As of 0.1.46 the SAME
discipline applies to the gizmo in World View: presentation is resolved
in document-local coordinates, lifted into shared world space with the
layout offset, and drag deltas — being frame-independent — apply back
to local positions unchanged.

Coordinate Spaces (0.1.32)

Local Position (brick.position inside its own World/Document), Layout
Position (where the document lives in shared space), and World Position
(local + layout offset). WorldRenderer tracks layout offsets per
documentId and applies them on addWorld() and _onBrickUpdated().

BRICK_UPDATED (0.1.32)

World.updateBrick(buildingId, brickId, changes) applies changes and
publishes DomainEvent.BRICK_UPDATED. As of 0.1.46 this event is what
makes the gizmo's live preview visible: previewTransformGesture updates
the domain, and WorldRenderer reacts — the preview is not a renderer
hack.

Spatial Identity Note (0.1.32)

MeshRegistry keys meshes by brickId alone, storing documentId per entry
so a future migration to composite keys stays localized.

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

The invariants this architecture protects:

- One command per gesture. Pointer moves never create commands; the
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
  Transform gestures change only brick transforms; group membership is
  untouched, and one undo restores every member.
- Pivot semantics are the 0.1.44 semantics, made visible. Single brick:
  the brick's own center. Multi-selection — manual or group-resolved:
  the union-bounds center. Rotation happens around that pivot. No
  special "group pivot" concept exists or is needed.
- Session state stays out of history. TransformGizmoState plus the
  transient hover/active handle state (inactive, hovering-x/y/z/rotate,
  dragging-x/y/z/rotate) are session/render state. They never enter
  CommandHistory and never serialize.
- An active editing gesture temporarily owns the pointer. During a gizmo
  drag: OrbitControls disabled (CameraController.setEnabled(false)),
  selection frozen (the controller holds the selection captured at
  pointer-down), hover/picking/marquee bypassed, keyboard swallowed
  except Escape (cancel). Pointer-up commits and restores normal
  interaction. This generalizes the exclusivity principle the 0.1.45
  marquee established.
- Parity is structural. EditorSession and WorldNavigationSession wire
  the same gizmo renderer/controller design (constructed by
  RenderWorldUseCase / RenderWorldViewUseCase) against the same gesture
  contract and the same TransformMath. Same gesture in either view ->
  byte-identical committed transforms, asserted directly by
  tests/InteractiveGizmo.test.js. The Editor had keyboard transform
  parity since 0.1.44; 0.1.46 closed the pointer surface gap.

Dependency-direction note: TransformMath lives in application/, but
renderer/TransformGizmoController needs it — and renderer/ must never
import application/. The resolution is injection, not duplication:
RenderWorldUseCase and RenderWorldViewUseCase (both application/) import
TransformMath and hand it to the controller they construct. The renderer
keeps its renderer -> core discipline, the math exists exactly once, and
the rule "never import upward" survives contact with a real cross-layer
need. (Same precedent as EditorEvent moving to core/events/ — except
here no file had to move at all.)

The gesture lifecycle is deliberately compatible with a future
EditingGesture family — MarqueeGesture and TransformGizmoGesture already
share begin -> preview -> commit/cancel, and box resize, rotation
snapping, drag duplication, measurement, and alignment guides would all
fit the same shape. No generic GestureManager exists yet — 0.1.46
explicitly deferred one — but nothing built here would need to change to
introduce it. The important property is already true: command semantics
are never duplicated between gestures.

Interactive Transform Gizmo (0.1.46) — what was deliberately NOT built

- No scale handles. The domain has position/rotation/definition but no
  settled scale semantics (definition dimensions, collision, registry,
  rotation + scale, copy/paste, group duplication, renderer geometry).
  A gizmo scale handle now would tempt Brick.scale into existence
  prematurely. Translate + Rotate only.
- No new commands. No MoveGizmoCommand, no RotateGizmoCommand, no
  GroupTransformCommand — those would violate the architecture the
  0.1.38–0.1.45 milestones established. The gizmo emits the existing
  transform-selection command.
- No snapping. Rotation/translation snapping, alignment guides, and
  distribution belong to 0.1.47 (Editing UX / Alignment / Snapping).
- No nested groups. 0.1.46 proves the existing architecture works under
  real pointer interaction first; nested groups (0.1.48, optional) are a
  genuinely new domain concept and were deliberately moved down the
  roadmap rather than stacked on top of an unproven pointer surface.

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
against the spatial selection, with identical gesture semantics.

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

The practical rule: if a serializer is ever tempted to write a field
from EditorContext into a World's JSON, that's a bug.

Spatial State — as of 0.1.30, a third kind of runtime state exists for
the World View: SpatialCameraState, SpatialSelectionState, and
SpatialHoverState. As of 0.1.31, SpatialInspectionState joins this
group. As of 0.1.32, SpatialEditingContext completes it. As of 0.1.36,
SpatialSelectionState and SpatialEditingContext can carry
multi-selection references through items[]. As of 0.1.46,
TransformGizmoState and the transient gizmo hover/active handle state
join this group — presentation and gesture state derived from the
current selection, never serialized, and never entering CommandHistory:
a completed gizmo gesture contributes exactly one transform-selection
command and nothing else. All spatial state is runtime-only and never
serialized into the Protocol.

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
but PickingService doesn't fit any other row. CameraController is left as
Controller rather than forced into Renderer: it directly drives
interactive hardware-like input. As of 0.1.46, TransformGizmoController
follows the same precedent — it drives interaction, while its sibling
TransformGizmoRenderer does the actual visualizing.

Recognized, not implemented (future direction, not a commitment):

Workspace — deliberately above DocumentManager, not a replacement for it.
EditingGesture family — MarqueeGesture and TransformGizmoGesture already
share one lifecycle shape; a common abstraction waits for a third
gesture to prove it. Scale semantics — no settled domain model yet; the
gizmo stays Translate + Rotate until there is one. Nested groups —
deferred behind 0.1.47 polish; see docs/Roadmap.md.
