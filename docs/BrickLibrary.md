A brick library is a plain object with an id and a list of BrickDefinitions:

    { id, definitions: [ new BrickDefinition({ id, name, category, tags, description, ... }) ] }

BrickDefinitions (core/BrickDefinition.js) are pure metadata — id, name,
category, thumbnail, defaultRotation, tags, description, color. No mesh, no
Three.js.

Libraries register with the BrickRegistry (core/BrickRegistry.js) at
startup:

    registry.register(CoreLibrary);
    registry.register(MedievalLibrary);

BrickRegistry is a catalog, not just a lookup: get(id), has(id),
getAll(), getByCategory(category), search(tags), groupByCategory().
The Brick Palette (application/editor/PaletteUseCase.js) is built entirely on
getAll()/groupByCategory() today; getByCategory() and search() exist
for when a caller needs grouping/filtering by a single category or tag
set directly. (PaletteUseCase's own getDefinitions()/
getDefinitionsByCategory() pass-throughs had no callers and were removed
on 2026-09-23.)

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

0.2.84 (Building Library & Palette UX) replaces the standalone Brick
Palette UI with ui/components/BuildLibraryPanel.js — a single "Build
Library" panel that tabs between Bricks and Structures, adds a
same-tab text search over name/category/tags on top of
groupByCategory()'s existing grouping, and renders a small rendered
preview per definition via application/editor/LibraryPreviewService.js
(reusing the exact BrickRenderer/ThreeBrickFactory mesh pipeline every
brick already renders with, never a hand-drawn icon set). Nothing
about BrickRegistry, BrickDefinition, or PaletteUseCase changed —
clicking a brick still only ever calls
PaletteUseCase#selectDefinition(), exactly as it always has.

Brick colors (2026-09-22). A brick type's default color used to be
hardcoded per definitionId in renderer/ThreeBrickFactory.js. It is now
data on the definition: BrickDefinition#color (0xRRGGBB). A community
library sets it in its definitions list, next to the dimensions. Each placed
Brick may also carry an optional per-instance color override; null means
"use the definition's color" (see docs/Protocol.md, "Brick Color").

- The Build Library has a color swatch for the next bricks placed. The
  choice lives in ActiveBrickState and is shown in the placement preview.
- The Selection Inspector has a swatch that recolors the selected bricks
  through the undoable SetBrickColorCommand.
- Rendering resolves the color the same way everywhere: the instance
  override, else the definition's color (BrickRenderer when building a
  mesh, WorldRenderer#_onBrickUpdated on a recolor).
- core/ColorHex.js converts between the stored integer and CSS "#rrggbb".

Color never changes a brick's geometry, bounds or collision.
