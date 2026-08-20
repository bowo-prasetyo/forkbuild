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
original built-in library — see docs/BrickIDs.md for the namespace rules.

0.2.80 (Expanded Brick Vocabulary) added eleven more: core:block_2x2,
core:wall_1x3, core:slab_4x4, core:roof_hip, core:stair, core:column,
core:beam, core:arch, core:window_large, core:door, core:trim — one per
category in the vocabulary the design conversation asked for
(structural, wall, floor, roof, stairs, column, beam, arch, window,
door, decorative). Every one of them is still a BrickDefinition: pure
metadata, a bounding box (width/height/depth) used for placement and
collision, no mesh. Each gets its own mesh factory in
renderer/ThreeBrickFactory.js — some as plain boxes, some (core:stair,
core:arch) as a single THREE.Shape/ExtrudeGeometry, and core:roof_hip
as a four-sided THREE.ConeGeometry — but every one is still ONE
factory function keyed by ONE definitionId, the same pattern the
original four already established. See docs/Principles.md, "A Brick Is
A Primitive, Never A Preassembled Structure": adding these eleven
required no change to core/Brick.js, core/documentSchema.js, or
serializer/DocumentSchemaMigrator.js — a document that only ever used
the original four bricks is untouched, and a document using the new
eleven is exactly as portable as one that doesn't.

BrickRegistry#groupByCategory() (0.2.80) groups getAll()'s contents by
category in first-seen order — [{ category, definitions }] — for the
Brick Palette to render as sections now that eleven categories exist;
getAll(), getByCategory(), and search() are all unchanged.
