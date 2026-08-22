import { TransformMath } from './TransformMath.js';

// 0.4.1 — Interactive Structure Composition UX. The single pure function
// behind "rotate and move a Structure before it lands" — turns a
// core/Structure.js's own bricks (authored in the Structure's LOCAL
// space, per that class's own header) into plain PasteBricksCommand
// items, transformed as ONE rigid unit by a { position, rotation }.
//
// Reuses application/TransformMath.js's rotatePointAroundPivotY() rather
// than inventing a second rotation formula — the exact function
// renderer/WorldRenderer.js#_renderStructurePlacement() and
// renderer/StructurePreviewRenderer.js already use to compose a
// StructurePlacement's bricks with its own position/rotation. Composing
// a copied Structure is the same geometry problem one rung over (a
// rigid set of bricks, rotated around its own local origin, then
// translated) — see docs/Principles.md, "A Structure Placement
// Transforms Its Content At Render Time, Never At Rest," which this
// function deliberately mirrors even though a COPIED structure has no
// placement at all: the geometry is identical, only what happens to the
// result (flattened into ordinary bricks here, vs. resolved fresh every
// render there) differs.
//
// Renderer-ignorant and World-ignorant: takes a Structure and a
// transform, returns plain data. application/CopyStructureIntoDocumentUseCase.js
// is the only caller that turns the result into a command;
// application/tools/StructureCompositionTool.js's live preview and its
// eventual commit both resolve through THAT use case, never through a
// second, hand-rolled copy of this math — see that use case's own
// header on why preview and commit must share one geometry pipeline.
export function transformStructureBricks(structure, { position = { x: 0, y: 0, z: 0 }, rotation = 0 } = {}) {
    return structure.bricks.map((brick) => {
        const rotated = rotation
            ? TransformMath.rotatePointAroundPivotY(brick.position, { x: 0, y: 0, z: 0 }, rotation)
            : brick.position;
        return {
            definitionId: brick.definitionId,
            position: {
                x: rotated.x + (position.x || 0),
                y: rotated.y + (position.y || 0),
                z: rotated.z + (position.z || 0)
            },
            rotation: normalizeRotation(brick.rotation + rotation)
        };
    });
}

// Wraps to [0, 360) — a rotated brick's own rotation stays a small,
// canonical, deterministic number no matter how many 90-degree turns
// composed to produce it (e.g. 270 + 180 -> 90, never 450), the same
// determinism guarantee docs/Roadmap.md's own 0.4.1 "Rotation Should Be
// Deterministic" section asks for.
function normalizeRotation(degrees) {
    return ((degrees % 360) + 360) % 360;
}
