ForkBuild is layered as core / application / renderer / ui, plus the
infrastructure adapters that surround them.

core/

Pure game model. World, Building, Brick, Position, BrickDefinition,
BrickRegistry, and events/ (EventBus, Event, EventListener). No Three.js,
no Vue, no browser APIs. Never imports anything from application/,
renderer/, or ui/.

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
PlaceBrickUseCase). Constructs the shared EventBus and wires it to both
World and the renderer — core/ and renderer/ never reference each other
directly, only the events between them.

This is also where commands/ (undoable actions) and services/ (export,
import, screenshot today; later SelectionService, CameraService,
ToolService, ClipboardService) live. Two flavors of "service" share this
folder: cross-cutting operations (export/import/screenshot) and stateful
editor services (selection, active tool, camera mode). Neither belongs in
core/ (they describe how the editor behaves, not what the world is) or
renderer/ (they're independent of Three.js).

renderer/

Three.js. WorldRenderer subscribes to World's domain events and reacts
incrementally — BrickAdded creates one mesh, BrickRemoved deletes one,
BuildingAdded/BuildingRemoved handle a whole building at once (e.g. on
initial load). There is no render(world) sweep. MeshRegistry maps brick
id -> mesh so removal never has to search the scene graph.
BuildingRenderer -> BrickRenderer resolve each brick's definitionId
against the registry, then ask renderer/ThreeBrickFactory.js — the
renderer-side counterpart to BrickRegistry — to build the actual mesh.
Owns the scene, camera, lights, grid, and render loop. Owns no game state,
and (as of the event system) doesn't even hold a reference to a World —
only to the events it emits.

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

Dependency direction

ui -> application -> core
application -> renderer
application -> storage / publisher / identity / serializer
renderer -> core (reads domain events and data; never the reverse)

core never depends on anything above it. renderer never owns data, only
visualizes what it's given, and now only reacts to events rather than
being handed a World directly.
