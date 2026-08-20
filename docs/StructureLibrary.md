A structure library is a plain object with an id and a list of
Structures:

    { id, structures: [ new Structure({ id, name, category, tags, description, bricks }) ] }

Structures (core/Structure.js) are pure data — id, name, category, tags,
description, and a flat array of ordinary core/Brick.js instances
positioned in the Structure's own local coordinate space. No world
placement, no terrain, no StructureBuilder/StructureEngine/
StructureRuntime subsystem. A Structure's "dimensions" are never stored
— core/SpatialBounds.js#fromBricks(structure.bricks, brickRegistry)
derives them fresh from the bricks + the live BrickRegistry, the same
way a World's bounds always were (SpatialBounds#fromWorld is now a thin
wrapper over fromBricks).

Every brick a Structure places must be an ordinary, already-registered
BrickDefinition id — "village:house" is composed entirely of core:*
bricks (wall_1x3, slab_4x4, roof_hip, door, window_large, ...), never a
special "House" brick. See docs/Principles.md, "A Brick Is A Primitive,
Never A Preassembled Structure" — a Structure is the next rung up that
same ladder, not an exception to it.

Structure libraries register with the StructureRegistry
(core/StructureRegistry.js) at startup, the same shape
docs/BrickLibrary.md already documents for BrickRegistry:

    registry.register(VillageLibrary);
    registry.register(SomeCommunityStructureLibrary);

StructureRegistry is a catalog: get(id), has(id), getAll(),
getByCategory(category), search(tags), groupByCategory() —
byte-for-byte the same contract BrickRegistry offers, one rung up.
groupByCategory() (0.2.84) is the one method BrickRegistry got first
(0.2.80) — deferred here until the Build Library needed Structures to
group the same way Bricks already did; getAll(), getByCategory(), and
search() are unchanged since 0.2.81.

village:house, village:barn, village:well, village:market, village:mill,
and village:bridge (core/library/VillageLibrary.js) are the current
built-in structure library — namespaced "village:structure", mirroring
docs/BrickIDs.md's own "library:brick" convention.

## Forking a Structure

application/ForkStructureUseCase.js turns a Structure into a brand-new,
independent Document:

    const document = new ForkStructureUseCase().execute(structure, identityProvider);
    editorSession.openDocument(document);   // the SAME editor — no second UI

The fork gets a fresh document identity (world.id) and fresh brick
identities throughout — every Brick placed into the new Document is a
newly constructed instance, never one of the library Structure's own
Brick objects, so nothing about editing a fork can ever mutate the
library. `document.metadata.parentStructureId` records which Structure
the fork came from (core/DocumentMetadata.js) — provenance only, never a
live dependency: editing, saving, or reloading a fork never reads from
or writes back to the Structure it was forked from, and the Structure
keeps existing (and forkable again) exactly as it was, indefinitely.

Forking a Structure does NOT create a WorldPlacement — forking is a
content operation, placing is a spatial operation, the exact separation
application/ForkPublishedWorldUseCase.js already draws for published
worlds. A forked Document is placed in the World like any other document,
whenever that becomes a separate, later action.

ui/components/BuildLibraryPanel.js (0.2.84; replaces the earlier
standalone ui/components/StructureLibraryPanel.js) is the UI surface
today: the Structures tab of the unified "Build Library," grouped by
category via groupByCategory() above, searchable by name/category/tag,
each entry showing a small rendered preview (application/
LibraryPreviewService.js, same BrickRenderer/ThreeBrickFactory pipeline
every Structure's bricks already render with) and a Fork button, wired
through EditorSession.forkStructure(structure) (application/
EditorSession.js) — which forks, then calls the session's own
openDocument(), the identical path Load and "Fork Published World"
already use. There is no separate structure-editing mode. Clicking Fork
is the only action a Structure entry offers — nothing in the Build
Library ever places a Structure directly into the current document,
exactly as 0.2.81 established.

## Placing a Document as a Structure (0.2.90)

Forking produces an ordinary, independent Document — nothing about that
Document knows it started life as a library Structure beyond
`metadata.parentStructureId`, a provenance label, per "Forking a
Structure" above. 0.2.90 answers the question 0.2.81 deliberately left
open next: once you have such a Document (or any other saved Document —
placing has nothing to do with a Structure library specifically), how do
you put it INTO the World you're currently building, more than once,
without copying its bricks?

`core/StructurePlacement.js` is a lightweight spatial REFERENCE — `id`,
`documentId`, `position`, `rotation` — mirroring `core/WorldPlacement.js`
one rung down (which places a whole published World in shared global
space); a StructurePlacement places one Document inside another
Document's own `core/World.js`, alongside its ordinary Buildings and
Groups. It never owns bricks. `application/StructureDocumentResolver.js`
resolves `documentId` to its CURRENT content fresh from storage on every
call — there is exactly one authoritative representation of a
structure's bricks, never a cached copy that could drift out of sync
with the Document itself. This is what makes multiple placements of the
SAME Document genuinely useful: fork House once, place it at A and at B
with independent positions and rotations, edit House later, and both
instances reflect the edit the next time anything resolves them — see
docs/Principles.md, "A Structure Placement References Content, It Never
Copies It."

The entry point is deliberately the simplest one available rather than a
new document browser: `ui/components/Toolbar.js`'s existing Recent
Documents dropdown gains a Place button beside the pre-existing Load —

    editorSession.placeDocument(doc.id, doc.title);

— which enters `ToolId.PLACE_STRUCTURE` mode, a dedicated
`application/tools/StructurePlacementTool.js` (a separate `Tool` from
`PlacementTool`, not a mode flag on it — what's being placed, what
decides validity, and what gets committed all diverge). Hovering the
ground shows a text hint (`StructurePreviewState`/`StructurePreviewUseCase`
— there is no 3D ghost mesh preview yet, see docs/Roadmap.md, 0.2.90's
own "deliberately not" list); 'R'/Shift+R rotate the pending placement in
90° increments, following the exact "orient once, place a row" workflow
0.2.87 established for ordinary bricks; a click commits a
`PlaceStructureCommand`, exactly like `PlaceBrickCommand` one rung down,
with the same undo/redo and CommandRegistry serialization support.
Collision is conservative and AABB-only
(`application/StructurePlacementValidator.js`, translate-only, rotation
ignored — the same V1 simplification `core/SpatialBounds.js` already
declared for whole-World bounds) against both ordinary bricks and other
placements.

Rendering resolves and composes at RENDER TIME only —
`renderer/WorldRenderer.js` rotates each resolved Brick's local position
around the origin by the placement's own rotation, translates by the
placement's own position, then applies the containing document's own
terrain offset exactly as it already does for ordinary bricks (0.2.76) —
so a placed structure always arrives as one rigid, upright, undeformed
unit. Placement meshes are tracked separately from `meshRegistry` and are
NOT yet pickable — selecting, moving, rotating, duplicating, or deleting
an already-placed instance through the viewport is "0.2.91 — World
Editing / Placement Management," a deliberately later milestone; 0.2.90
is the data model and reliable rendering of instances only. Removing a
placement (`application/commands/RemoveStructurePlacementCommand.js`)
never touches the Document it referenced — a placement and its content
are two different lifecycles, exactly as removing a Brick never touches
the BrickDefinition it was an instance of.
