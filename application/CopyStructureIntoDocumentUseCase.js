import { PasteBricksCommand } from './commands/PasteBricksCommand.js';
import { SpatialBounds } from '../core/SpatialBounds.js';

// Composition margin between successively copied structures along X, in
// the same units as Position — the whole-structure equivalent of
// PasteClipboardUseCase's own PASTE_OFFSET, sized for a structure's
// footprint rather than a single brick's.
export const COMPOSITION_MARGIN = 2;

// 0.4.0 — Structure Composition & Blueprint Library. Turns a library
// Structure (core/Structure.js) into ONE PasteBricksCommand that inserts
// its bricks into the CURRENT Document's own bricks — composition, not
// provenance. See docs/Principles.md, "Copying Composes A Blueprint;
// Forking Creates One (0.4.0)":
//
//   ForkStructureUseCase   Structure --fork--> new independent Document
//   CopyStructureIntoDocumentUseCase   Structure --copy--> current Document's own bricks
//
// Deliberately reuses PasteBricksCommand rather than introducing a
// parallel "PasteStructureCommand" — PasteBricksCommand (0.1.42) already
// IS "one command, many bricks": one undo entry, one CommandHistory
// replay, one CommandRegistry-serializable payload, exactly what copying
// 85 bricks in one gesture needs. A Structure's bricks are just another
// source of paste items, the same relationship PasteClipboardUseCase
// already has to the selection clipboard — introducing a second command
// class for the same shape would duplicate PasteBricksCommand's own
// execute()/undo()/toJSON() logic (and its existing replication/
// serialization test coverage in tests/DocumentCloning.test.js and
// tests/Grouping.test.js) for no behavioral difference.
//
// A Structure never carries group intent (core/Structure.js has no
// concept of groups), so the produced command's groups are always empty
// — unlike a clipboard paste, which can carry groups copied from a live
// selection.
//
// Positioning (Composition Offset): a Structure's bricks are already
// authored in the Structure's own local space, centered on its own
// footprint (core/Structure.js's own header). Copying into an EMPTY
// document places them unmodified, so "Copy House" into a blank
// Document produces byte-identical geometry to "Fork House" — both are
// just the Structure's own bricks, untranslated. Copying into a
// document that already has content instead appends the new structure
// just past the document's current occupied footprint along +X (using
// the exact same SpatialBounds.fromWorld()/fromBricks() math
// core/Structure.js already uses to derive bounds rather than store
// them) — deterministic, and guaranteed not to overlap what's already
// there, so composing House + Well + Barn into one blueprint never
// requires the caller to pick coordinates by hand.
export class CopyStructureIntoDocumentUseCase {
    execute(structure, { worldId, buildingId, world, registry } = {}) {
        if (!structure || !worldId || !buildingId || !world) {
            return null;
        }
        const offset = this._nextOffset(structure, world, registry);
        const items = structure.bricks.map((brick) => ({
            definitionId: brick.definitionId,
            position: {
                x: brick.position.x + offset.x,
                y: brick.position.y + offset.y,
                z: brick.position.z + offset.z
            },
            rotation: brick.rotation
        }));
        return new PasteBricksCommand({
            worldId,
            buildingId,
            items,
            description: `Copy ${structure.name} Into Document`
        });
    }

    _nextOffset(structure, world, registry) {
        const hasContent = world.getBuildings().some((building) => building.getBricks().length > 0);
        if (!hasContent) {
            return { x: 0, y: 0, z: 0 };
        }
        const worldBounds = SpatialBounds.fromWorld(world, registry);
        const structureBounds = SpatialBounds.fromBricks(structure.bricks, registry);
        return {
            x: (worldBounds.max.x + COMPOSITION_MARGIN) - structureBounds.min.x,
            y: 0,
            z: 0
        };
    }
}
