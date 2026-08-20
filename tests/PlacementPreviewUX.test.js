import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { CreateEditorContextUseCase } from '../application/CreateEditorContextUseCase.js';
import { PreviewUseCase } from '../application/PreviewUseCase.js';
import { CommandHistory } from '../application/CommandHistory.js';
import { PlacementTool } from '../application/tools/PlacementTool.js';
import { PreviewState } from '../application/editor-state/PreviewState.js';
import { SpatialPlacementState } from '../application/spatial-state/SpatialPlacementState.js';

// 0.2.87 — World Building Interaction & Placement UX.
//
// This file covers the EDITOR half only (PlacementTool + PreviewState +
// PreviewUseCase), deliberately kept free of any WorldNavigationSession/
// renderer import so it can run standalone, headlessly, with no 'three'
// dependency at all — every other file in this codebase that touches
// WorldNavigationSession (including tests/PlacementWorldView.test.js,
// where this milestone's WorldView-side coverage lives instead) pulls in
// renderer/Renderer.js -> 'three' at MODULE LOAD time regardless of
// whether a real WebGL context is ever created, so it can only run
// through the browser test runner (tests.html). PlacementTool has no
// such dependency — it never imports anything renderer/-side — so this
// file is a genuine, fully-executable unit test.
//
// Central architectural claim under test: the placement PREVIEW and the
// committed BRICK must never disagree about position or rotation — see
// docs/Principles.md and the design conversation's own "preview rotation
// = actual Brick.placement.rotation." Terrain elevation (the OTHER half
// of this milestone) is deliberately NOT under test here: it is a
// rendering-time-only offset applied in renderer/PreviewRenderer.js and
// application/WorldNavigationSession.js#_presentPlacementPreview(), never
// part of PreviewState/SpatialPlacementState's own position field — see
// those two files' own headers.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function buildTool({ occupied = [] } = {}) {
    const registry = new CreateBrickRegistryUseCase().execute();
    const editorContext = new CreateEditorContextUseCase().execute();
    const previewUseCase = new PreviewUseCase(editorContext);

    const world = new World({});
    const building = new Building({});
    for (const position of occupied) {
        building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(position.x, position.y, position.z) }));
    }
    world.addBuilding(building);
    const commandHistory = new CommandHistory({ world });

    const context = { registry, editorContext, world, previewUseCase, commandHistory };
    const tool = new PlacementTool(context);
    return { tool, context, world, building, editorContext, commandHistory };
}

function move(tool, x, y, z) {
    tool.onPointerMove({ worldPosition: { x, y, z }, pickedBrick: null });
}

function key(tool, k, shift = false) {
    tool.onKeyDown({ key: k, modifiers: { shift } });
}

async function runTests() {
    // -------------------------------------------------------------
    // Section A: PreviewState / PreviewUseCase — the new `valid` field
    // -------------------------------------------------------------
    {
        const hidden = PreviewState.hidden();
        assert(hidden.valid === true, '1. PreviewState.hidden() defaults valid to true — irrelevant while invisible, but never silently false');

        const shown = new PreviewState({ visible: true, definitionId: 'core:cube', valid: false });
        assert(shown.valid === false, '2. PreviewState carries an explicit valid:false through construction');

        const editorContext = new CreateEditorContextUseCase().execute();
        const previewUseCase = new PreviewUseCase(editorContext);
        previewUseCase.show('core:cube', { x: 1, y: 0.5, z: 2 }, 90, false);
        assert(editorContext.preview.valid === false && editorContext.preview.rotation === 90,
            '3. PreviewUseCase.show()\'s new 4th argument reaches EditorContext.preview.valid unchanged');
        previewUseCase.show('core:cube', { x: 1, y: 0.5, z: 2 }, 90);
        assert(editorContext.preview.valid === true,
            '4. omitting the 4th argument still defaults to valid:true — every pre-0.2.87 call site keeps working unmodified');
    }

    // -------------------------------------------------------------
    // Section B: SpatialPlacementState — the new `blocked` field
    // -------------------------------------------------------------
    {
        const empty = SpatialPlacementState.empty();
        assert(empty.blocked === false && empty.valid === false,
            '5. SpatialPlacementState.empty() defaults blocked to false alongside the pre-existing valid:false');

        const blocked = new SpatialPlacementState({ valid: true, blocked: true, rotation: 180 });
        assert(blocked.valid === true && blocked.blocked === true && blocked.rotation === 180,
            '6. valid ("a target was resolved") and blocked ("that target is occupied") are independent fields, both readable');
    }

    // -------------------------------------------------------------
    // Section C: PlacementTool — hover shows a terrain-independent,
    // collision-aware, rotatable preview
    // -------------------------------------------------------------
    {
        const { tool, editorContext } = buildTool();

        // No active brick selected yet -> hovering shows nothing.
        move(tool, 0, 0, 0);
        assert(editorContext.preview.visible === false,
            '7. no brick selected -> onPointerMove never shows a preview');

        editorContext.setActiveBrick('core:cube');
        move(tool, 3, 0, 4);
        assert(editorContext.preview.visible === true && editorContext.preview.definitionId === 'core:cube',
            '8. selecting a brick and hovering shows the ghost');
        assert(editorContext.preview.position.x === 3 && editorContext.preview.position.z === 4,
            '9. the ghost follows the hovered ground position (grid-snapped, matching PlacementPositionService)');
        assert(editorContext.preview.rotation === 0, '10. rotation starts at 0');
        assert(editorContext.preview.valid === true, '11. an empty building means every position is collision-clear');
    }

    // -------------------------------------------------------------
    // Section D: Rotation — 'R' rotates the PENDING preview, never a
    // placed brick; Shift+R reverses; it survives a brick switch but not
    // deactivate(); and, critically, the committed Brick carries the
    // EXACT rotation the preview last showed.
    // -------------------------------------------------------------
    {
        const { tool, editorContext, world, commandHistory } = buildTool();
        editorContext.setActiveBrick('core:cube');
        move(tool, 5, 0, 5);
        assert(editorContext.preview.rotation === 0, '12. freshly hovering starts at rotation 0');

        key(tool, 'r');
        assert(editorContext.preview.rotation === 90, '13. \'r\' rotates the pending preview +90° in place, without moving the pointer');
        assert(editorContext.preview.position.x === 5 && editorContext.preview.position.z === 5,
            '14. rotating does not move the cached position');

        key(tool, 'r');
        key(tool, 'r');
        assert(editorContext.preview.rotation === 270, '15. rotation keeps accumulating across repeated presses (270 = 90+90+90)');

        key(tool, 'R', true); // Shift+R
        assert(editorContext.preview.rotation === 180, '16. Shift+R subtracts 90° instead of adding it (270 - 90 = 180)');

        key(tool, 'x'); // not a rotate key
        assert(editorContext.preview.rotation === 180, '17. any other key is ignored — no accidental rotation');

        // Switching to a different brick definition keeps the rotation —
        // only deactivate() (leaving Place mode) resets it.
        editorContext.setActiveBrick('core:slope_45');
        move(tool, 5, 0, 5);
        assert(editorContext.preview.rotation === 180,
            '18. switching the selected brick mid-session preserves the pending rotation, matching the design conversation\'s own "orient once, place a row" workflow');

        // Commit: the placed Brick's rotation must equal exactly what the
        // preview showed — the one invariant this milestone must never blur.
        const buildingId = world.getBuildings()[0].id;
        tool.onPointerDown({});
        const placed = world.getBuilding(buildingId).getBricks()[0];
        assert(placed && placed.rotation === 180,
            '19. FLAGSHIP: the committed Brick.rotation is byte-identical to the preview\'s own rotation at the moment of the click');
        assert(commandHistory.isDirty(), '19b. placing a brick is a real, undoable domain mutation');

        tool.deactivate();
        assert(editorContext.preview.visible === false, '20. deactivate() hides the preview');
        editorContext.setActiveBrick('core:cube');
        move(tool, 1, 0, 1);
        assert(editorContext.preview.rotation === 0,
            '21. deactivate() (leaving Place mode) resets the pending rotation back to 0 for the next placement session');
    }

    // -------------------------------------------------------------
    // Section E: Collision — the preview shows blocked (invalid) at an
    // occupied position rather than silently doing nothing, and
    // clicking there is still refused, exactly matching
    // core/PlacementValidator.js's own exact-position rule.
    // -------------------------------------------------------------
    {
        const { tool, editorContext, world } = buildTool({ occupied: [{ x: 2, y: 0.5, z: 2 }] });
        editorContext.setActiveBrick('core:cube');
        const buildingId = world.getBuildings()[0].id;

        move(tool, 2, 0, 2);
        assert(editorContext.preview.position.x === 2 && editorContext.preview.position.z === 2,
            '22. hovering directly over the existing brick resolves to its exact position');
        assert(editorContext.preview.valid === false,
            '23. FLAGSHIP: the preview reports invalid at an occupied position — visible feedback BEFORE the click, not just a silent no-op after it');

        const bricksBefore = world.getBuilding(buildingId).getBricks().length;
        tool.onPointerDown({});
        assert(world.getBuilding(buildingId).getBricks().length === bricksBefore,
            '24. clicking an invalid (occupied) position places nothing — existing PlacementValidator collision rules are reused unchanged, never a second collision system');

        // Move one grid step away: collision-clear again.
        move(tool, 3, 0, 2);
        assert(editorContext.preview.valid === true,
            '25. moving off the occupied cell makes the preview valid again, still without ever touching World');
        tool.onPointerDown({});
        assert(world.getBuilding(buildingId).getBricks().length === bricksBefore + 1,
            '26. and clicking a valid position places exactly one brick, as before this milestone');
    }

    // -------------------------------------------------------------
    // Section F: rotating with nothing hovered is a safe no-op — you
    // cannot rotate a preview that was never shown.
    // -------------------------------------------------------------
    {
        const { tool, editorContext } = buildTool();
        editorContext.setActiveBrick('core:cube');
        key(tool, 'r');
        assert(editorContext.preview.visible === false,
            '27. pressing R before ever hovering the world does nothing — there is no cached position to re-show');
    }

    console.log('✅ All Placement Preview UX (Editor) tests passed.');
}

runTests().catch((e) => { console.error(e); throw e; });
