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
getByCategory(category), search(tags) — byte-for-byte the same contract
BrickRegistry offers, one rung up.

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

ui/components/StructureLibraryPanel.js is the one UI surface today: a
flat list of every registered Structure with a Fork button, wired
through EditorSession.forkStructure(structure) (application/
EditorSession.js) — which forks, then calls the session's own
openDocument(), the identical path Load and "Fork Published World"
already use. There is no separate structure-editing mode.
