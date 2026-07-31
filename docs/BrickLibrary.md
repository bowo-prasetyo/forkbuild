A brick library is a plain object with an id and a list of BrickDefinitions:

    { id, definitions: [ new BrickDefinition({ id, name, category, ... }) ] }

BrickDefinitions (core/BrickDefinition.js) are pure metadata — id, name,
category, thumbnail, defaultRotation. No mesh, no Three.js.

Libraries register with the BrickRegistry (core/BrickRegistry.js) at
startup:

    registry.register(CoreLibrary);
    registry.register(MedievalLibrary);

The renderer never imports a library directly. It asks the registry for a
brick's definition, then asks renderer/ThreeBrickFactory.js to build the
mesh for that same definitionId. A community library only needs to ship
two things: a core-side definitions list (data), and a renderer-side set
of mesh factories (geometry). No other file changes.

core:cube, core:slope_45, core:plate_2x4, and core:window_small are the
current built-in library — see docs/BrickIDs.md for the namespace rules.
