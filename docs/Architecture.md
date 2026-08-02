ForkBuild is layered as core / application / renderer / ui, plus the
infrastructure adapters that surround them.

core/

Pure game model. World, Building, Brick, Position, BrickDefinition,
BrickRegistry, createId, and events/ (EventBus, DomainEvent,
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
pick, pickGround, selectionUseCase, previewUseCase today; more as tools
need them). Deliberately narrower than the { world, editorContext,
renderer, picking, commands } originally proposed: no raw Renderer
reference (would let any tool bypass PickingService/WorldRenderer and
touch Three.js directly, undoing "the editor manipulates domain objects,
not meshes"), and tools mutate editor state only through use cases like
selectionUseCase/previewUseCase, never by calling editorContext.setX()
directly — reading editorContext is fine, writing isn't, mirroring the
discipline ui/ already follows.

Naming collision avoided: application/editor-state/Tool.js (the tool id
constants, e.g. ToolId.SELECT) was renamed to ToolId.js/ToolId once the
Tool base class needed the name Tool for itself. ToolState still stores
just the id string (e.g. "select"), not a resolved Tool instance — same
pattern as SelectionState storing brickId (not a Brick) and ActiveBrickState
storing definitionId (not a BrickDefinition): EditorContext holds ids,
resolution happens through the relevant registry when needed.

PreviewUseCase (application/PreviewUseCase.js) is the placement preview's
single entry point: show(definitionId, position, rotation)/hide(),
writing through EditorContext.preview (PreviewState — visible,
definitionId, position, rotation; Editor State, never becomes a real
Brick until a future PlaceBrickCommand commits it). PlacementTool
(application/tools/PlacementTool.js) drives it: pointer move -> pick (is
an existing brick under the cursor?) -> pickGround (where would a ray
hit the ground plane?) -> snap to EditorSettings.gridSnapSize ->
previewUseCase.show(). onPointerDown is a documented no-op — actual
placement needs PlaceBrickCommand, which doesn't exist until the next
milestone. Known limitation: hovering an existing brick hides the preview
rather than stacking on top of it; face-relative placement needs
face-normal detection from the raycast hit and is deliberately deferred
to when PlaceBrickCommand needs to decide exact placement rules anyway.

Input System: not built yet. EditorView currently normalizes raw DOM
PointerEvent/KeyboardEvent into plain {screenX, screenY, button}/{key}
objects inline before calling ToolManager. Extracting that into a proper
platform-independent InputSystem (so desktop/Electron/touch input could
drive the same tools without ui/ changes) is worthwhile future work, but
deliberately not bundled into the Placement Preview milestone — mixing
architectural cleanup with feature work makes both harder to review.

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
application/, never directly to core/ or renderer/. Kept intentionally
"dumb" so a future non-Vue client could reuse core/ and application/
unchanged. Known exception: ui/views/AboutView.js imports core/version.js
directly to display the version number — a leftover from Step 2, before
this rule existed. Inert (a static constant, no behavior) but technically
a violation; noted rather than fixed as a drive-by inside an unrelated
milestone. As of 0.1.11, EditorView.js and BrickPalette.js use the Vue 3
Composition API (setup(), ref, onMounted/onBeforeUnmount) per
CodingConventions.md — earlier views used Options-API-flavored lifecycle
hooks (mounted()/beforeUnmount() directly), which still worked but wasn't
strictly the stated convention.

storage/

Local persistence adapter (LocalStorage to start).

publisher/

Publishing adapter interface, with Steem as the first concrete provider.

identity/

Wallet / key management, tied to whichever publisher is active.

serializer/

World <-> JSON, used by both storage/ and publisher/.

Domain State vs Editor State

Two kinds of state exist in ForkBuild, and they must never mix.

Domain State — World, Building, Brick (core/). Publishable, serializable,
shared, forkable. This is what the ForkBuild Protocol describes and what
storage/publisher eventually persist and transmit.

Editor State — everything in EditorContext (application/): selection,
active tool, active brick, camera pose, placement preview, settings.
Purely local to one editing session. Never part of a World, never
serialized into the Protocol, never sent to a publisher. The placement
preview in particular is worth being explicit about: it looks like a
brick, sits in the same 3D space as real bricks, but is Editor State
through and through — it never becomes a Brick until PlaceBrickCommand
(0.1.14) commits it to World.

The practical rule: if a serializer (0.1.14+) is ever tempted to write a
field from EditorContext into a World's JSON, that's a bug. Domain State
answers "what did the user build?" Editor State answers "what is the
user currently doing while building it?" — the second question's answer
should never leak into the first's.

Dependency direction

ui -> application -> core
application -> renderer
application -> storage / publisher / identity / serializer
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

Refined as of 0.1.12: Service was originally going to be avoided entirely,
but PickingService doesn't fit any other row — it's not a lookup, not a
renderer, not a workflow, not editor state. It's a capability the engine
provides. So is CameraController, which is left as Controller rather than
forced into Renderer: it directly drives interactive hardware-like input
(mouse, keyboard, OrbitControls), which reads differently from "visualizes
domain data," the actual job every other *Renderer class does. Neither
name changes.
