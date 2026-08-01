ForkBuild is layered as core / application / renderer / ui, plus the
infrastructure adapters that surround them.

core/

Pure game model. World, Building, Brick, Position, BrickDefinition,
BrickRegistry, createId, and events/ (EventBus, Event, EventListener). No
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
state: selection, active tool, active brick, camera pose, settings. This
is Editor State, not Domain State — see the distinction below. It has its
own EventBus (application/events/EditorEvent.js defines SelectionChanged,
ToolChanged, ActiveBrickChanged, CameraStateChanged, SettingsChanged),
kept separate from the domain EventBus on purpose: nothing about "what
tool is active" should ever be reachable from a subscription meant for
"what changed in the world." Unlike the domain EventBus, EditorContext
correctly lives in application/ rather than core/ — nothing in core/
needs to publish or receive editor events, so there's no dependency-
direction problem requiring it to live lower. Sub-state pieces
(SelectionState, ToolState, ActiveBrickState, EditorSettings) live in
application/editor-state/, each pure data with no Three.js/Vue/DOM.

This is also where commands/ (undoable actions) and services/ (export,
import, screenshot) live — cross-cutting operations, as distinct from
EditorContext's stateful editor concerns.

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

PickingService answers exactly one question: what brick is under this
screen position? It raycasts against MeshRegistry's meshes and resolves
the hit back to { brickId, buildingId } via the same registry. It knows
nothing about selection, highlighting, or any other UI state — Picking
does not depend on Selection; Selection (0.1.10+) will depend on Picking.
RenderWorldUseCase wires PickingService up alongside Renderer/
WorldRenderer and exposes a plain pick(screenX, screenY) function on its
returned handle, so ui/ never needs a Three.js reference to use it.

CameraController owns orbit/pan/zoom (via Three.js's OrbitControls
addon), resize, and reset (bound to the Home key). CameraState is a pure
data snapshot (position, target, zoom — reusing core/Position) exchanged
via getState()/setState(). Focus(), saved/restored camera state, and
smooth transitions (CameraAnimator) are Camera Intelligence and
deliberately not here yet — CameraController only knows how to be driven
by hand, not how to decide where to go on its own.

ui/

Vue. The application shell, routes, views, and components. Talks only to
application/, never directly to core/ or renderer/. Kept intentionally
"dumb" so a future non-Vue client could reuse core/ and application/
unchanged.

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
active tool, active brick, camera pose, settings. Purely local to one
editing session. Never part of a World, never serialized into the
Protocol, never sent to a publisher.

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
