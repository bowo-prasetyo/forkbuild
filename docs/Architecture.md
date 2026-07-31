ForkBuild is layered as core / application / renderer / ui, plus the
infrastructure adapters that surround them.

core/

Pure game model. World, Building, Brick, Position, BrickDefinition,
BrickRegistry. No Three.js, no Vue, no browser APIs. Never imports
anything from renderer/ or ui/.

A Brick stores a definitionId, not geometry. BrickRegistry resolves
definitionId -> BrickDefinition (metadata only). Libraries (e.g.
core/library/CoreLibrary.js) register their definitions with the
registry at startup — see docs/BrickLibrary.md.

application/

Use cases. Coordinates core/ and the infrastructure layers to do
something (e.g. RenderWorldUseCase, and later PlaceBrickUseCase). This is
where commands/ (undoable actions) and services/ (export, import,
screenshot) live, since they are also use-case-shaped.

renderer/

Three.js. Turns a World (via WorldRenderer -> BuildingRenderer ->
BrickRenderer) into meshes and displays them. BrickRenderer resolves each
brick's definitionId against the registry, then asks
renderer/ThreeBrickFactory.js — the renderer-side counterpart to
BrickRegistry — to build the actual mesh for that id. Owns the scene,
camera, lights, grid, and render loop. Owns no game state.

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

core never depends on anything above it. renderer never owns data, only
visualizes what it's given.
