A brick library is a plain object with an id and a list of BrickDefinitions:

    { id, definitions: [ new BrickDefinition({ id, name, category, tags, description, ... }) ] }

BrickDefinitions (core/BrickDefinition.js) are pure metadata — id, name,
category, thumbnail, defaultRotation, tags, description. No mesh, no
Three.js.

Libraries register with the BrickRegistry (core/BrickRegistry.js) at
startup:

    registry.register(CoreLibrary);
    registry.register(MedievalLibrary);

BrickRegistry is a catalog, not just a lookup: get(id), has(id),
getAll(), getByCategory(category), search(tags). The Brick Palette
(application/PaletteUseCase.js, ui/components/BrickPalette.js) is built
entirely on getAll() today; getByCategory() and search() exist for when
the palette needs grouping/filtering as libraries multiply.

The renderer never imports a library directly. It asks the registry for a
brick's definition, then asks renderer/ThreeBrickFactory.js to build the
mesh for that same definitionId. A community library only needs to ship
two things: a core-side definitions list (data), and a renderer-side set
of mesh factories (geometry). No other file changes.

core:cube, core:slope_45, core:plate_2x4, and core:window_small are the
current built-in library — see docs/BrickIDs.md for the namespace rules.
