import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { Structure } from '../core/Structure.js';
import { SpatialBounds } from '../core/SpatialBounds.js';
import { createId } from '../core/createId.js';

// 0.4.2 — Structure Extraction & Blueprint Creation. The other direction
// 0.4.0/0.4.1 deliberately left open (docs/Roadmap.md, 0.4.1's own
// "Deliberately excluded"): turning bricks a user has already composed
// in a Document back into a reusable core/Structure.js — closing the
// loop this milestone names:
//
//   Structure --copy/compose--> Document --extract--> Structure
//
// Reads a selection (application/editor-state/SelectionState.js) out of
// a Document and produces a brand-new Structure instance — pure
// observation, exactly like application/CopySelectionUseCase.js's own
// header describes for the clipboard: no UI, no persistence, no World
// mutation. The source bricks are NEVER touched — see
// docs/Principles.md, "Extraction Copies A Blueprint; It Never Moves
// One (0.4.2)": after execute() returns, the Document that was
// extracted FROM is byte-identical to before the call.
//
// Selection rule: only an ordinary brick selection can become a
// Structure. A StructurePlacement selection (0.2.93) is a reference to
// an entirely different Document — automatically dereferencing and
// flattening it here would be a different, larger operation (import/
// flatten a placement's content) that this milestone deliberately does
// not attempt. Rather than silently ignoring a placement selection (or
// worse, silently extracting nothing), execute() throws a descriptive
// error so the UI can say exactly why nothing happened.
//
// Normalization (the one geometry rule this use case owns): the source
// bricks' own minimum X/Z occupied bounds become the new Structure's
// origin — computed with the exact same core/SpatialBounds.js#fromBricks()
// math core/Structure.js and CopyStructureIntoDocumentUseCase already
// rely on, never a second bounds calculation. Y is left exactly as
// authored — every built-in Structure (core/library/VillageLibrary.js)
// already measures Y from the ground up (a brick's Y is the height its
// AUTHOR intended, not a footprint edge), so shifting Y the same way X/Z
// are shifted would lift or bury the extracted Structure relative to its
// own floor. This makes extraction deterministic and independent of
// wherever in the Document the selection happened to sit — selecting
// the same shape at a different Document position always produces the
// same Structure.
export class CreateStructureFromSelectionUseCase {
    // metadata: { name, category, tags, description } — everything
    // core/Structure.js accepts today. Author/version/thumbnail are
    // deliberately not accepted here; they belong to the Personal
    // Blueprint Library (0.4.3), not this milestone.
    execute(selection, document, { registry = null, name, category = 'uncategorized', tags = [], description = '' } = {}) {
        if (!selection || selection.isEmpty || !document) {
            return null;
        }
        if (selection.isStructurePlacementSelection || selection.items.some((item) => item.type !== 'brick')) {
            throw new Error('Create Structure requires brick selections only.');
        }
        if (!name) {
            throw new Error('CreateStructureFromSelectionUseCase: a name is required.');
        }

        const world = document.world;
        const sourceBricks = [];
        for (const item of selection.items) {
            const building = world.getBuilding(item.buildingId);
            const brick = building ? building.findBrick(item.brickId) : null;
            if (brick) {
                sourceBricks.push(brick);
            }
        }
        if (sourceBricks.length === 0) {
            return null;
        }

        // Normalize to the selection's own minimum X/Z bounds — see this
        // class's own header on why Y is left untouched.
        const bounds = SpatialBounds.fromBricks(sourceBricks, registry);
        const originX = bounds.min.x;
        const originZ = bounds.min.z;

        // Fresh Brick instances, fresh ids — never one of the Document's
        // own brick objects or identities, the same "a Structure never
        // shares an instance with where it came from" rule
        // ForkStructureUseCase already applies one rung over. This is
        // what makes extraction COPY, never move: nothing about the
        // Document's own bricks changes, and nothing about the new
        // Structure could mutate them even by accident.
        const bricks = sourceBricks.map((brick) => new Brick({
            definitionId: brick.definitionId,
            position: new Position(
                brick.position.x - originX,
                brick.position.y,
                brick.position.z - originZ
            ),
            rotation: brick.rotation
        }));

        return new Structure({
            id: createId(),
            name,
            category,
            tags,
            description,
            bricks
        });
    }
}
