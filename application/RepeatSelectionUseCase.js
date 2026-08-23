import { CopySelectionUseCase } from './CopySelectionUseCase.js';
import { PasteClipboardUseCase } from './PasteClipboardUseCase.js';
import { CompositeCommand } from './commands/CompositeCommand.js';
import { RepetitionMath } from './RepetitionMath.js';
import { SelectionTransformValidator } from '../core/SelectionTransformValidator.js';

// 0.4.9 — Alignment, Snapping & Repetition. "Repeat" is duplication
// generalized from one offset copy to N — see
// application/CopySelectionUseCase.js's own header on why duplication
// is copy immediately re-pasted, geometrically, with no separate math to
// invent: this reuses the exact same bounds-relative, group-aware
// clipboard and re-anchoring EditorSession#_duplicateBrickSelection()
// already established for a single copy, just called against N anchor
// positions (application/RepetitionMath.js) instead of one. No new
// World identity concept is introduced — every copy is ordinary
// PasteBricksCommand output with fresh brick/group ids, never a
// persistent "RepeatingStructure"/"ArrayObject" entity.
//
// The one genuinely new rule this milestone adds: repetition is
// ATOMIC. Ordinary duplication never collision-checks (that class's own
// header: "Collision validation: NONE"). Repetition validates the WHOLE
// batch — every candidate copy, against the bricks already in the
// World AND against every OTHER candidate copy in the same batch —
// BEFORE a single brick is created. A mid-batch collision (say, copy 4
// of 5) rejects the ENTIRE operation; nothing partially commits. This
// mirrors 0.4.8's own posture for the transform gesture ("a building
// gesture either produces the complete requested result or produces no
// mutation") one rung over, for creation instead of movement.
//
// core/SelectionTransformValidator.js is reused UNCHANGED for that
// check: it treats any transform whose brickId isn't already present in
// the target building as landing on a "non-member" cell if occupied —
// exactly the right rule for brand-new bricks that don't exist in the
// World yet, with zero changes needed to that validator. Candidate ids
// are synthetic placeholders used only for this pre-flight check; the
// real bricks that get created afterward mint their OWN fresh ids the
// normal PasteBricksCommand way, so validation ids and committed ids
// never need to match.
export class RepeatSelectionUseCase {
    constructor(brickRegistry, collisionValidator = new SelectionTransformValidator()) {
        this._copySelectionUseCase = new CopySelectionUseCase(brickRegistry);
        this._pasteClipboardUseCase = new PasteClipboardUseCase();
        this._collisionValidator = collisionValidator;
    }

    // options.count: how many ADDITIONAL copies to create — the
    // original selection is never touched (same "duplicate never
    // mutates the source" rule CopySelectionUseCase's own header
    // states). options.offset: { x, y, z } — the per-copy translation,
    // the same shape PasteClipboardUseCase's own PASTE_OFFSET uses.
    //
    // Returns a single CompositeCommand ready for CommandHistory.execute()
    // — one call, one history entry, per this class's own header — or
    // null if the request is empty/invalid/would collide. The caller
    // never has to distinguish "nothing to repeat" from "blocked by
    // collision": either way, calling execute() on the result is safe,
    // and a null result means the World is guaranteed untouched.
    execute(selection, document, { count, offset } = {}) {
        if (!selection || selection.isEmpty || selection.type === 'ground' || !document) {
            return null;
        }
        if (!Number.isInteger(count) || count <= 0) {
            return null;
        }
        if (!offset || (offset.x === 0 && offset.y === 0 && offset.z === 0)) {
            return null;
        }
        const clipboard = this._copySelectionUseCase.execute(selection, document);
        if (!clipboard || clipboard.isEmpty) {
            return null;
        }
        const buildingId = selection.buildingId;
        const world = document.world;
        const anchors = RepetitionMath.generateAnchors(clipboard.origin, offset, count);

        // Validate the ENTIRE batch before creating anything — see this
        // class's own header on why plain synthetic ids are enough to
        // make SelectionTransformValidator check exactly what
        // repetition needs, unmodified.
        const candidates = [];
        for (const anchor of anchors) {
            for (const item of clipboard.items) {
                candidates.push({
                    buildingId,
                    brickId: `repeat-candidate-${candidates.length}`,
                    position: {
                        x: item.position.x + anchor.x,
                        y: item.position.y + anchor.y,
                        z: item.position.z + anchor.z
                    },
                    rotation: item.rotation
                });
            }
        }
        if (!this._collisionValidator.canApply(world, candidates)) {
            return null;
        }

        const composite = new CompositeCommand({
            description: `Repeat ${count} ${count === 1 ? 'Copy' : 'Copies'}`
        });
        for (const anchor of anchors) {
            const command = this._pasteClipboardUseCase.execute(clipboard, {
                worldId: world.id,
                buildingId,
                position: anchor
            });
            if (!command) {
                return null;
            }
            composite.add(command);
        }
        return composite;
    }
}
