import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { EventBus } from '../core/events/EventBus.js';
import { EditorEvent } from '../core/events/EditorEvent.js';
import { CompositionPreviewRenderer } from '../renderer/CompositionPreviewRenderer.js';
import { CompositionPreviewState } from '../application/editor-state/CompositionPreviewState.js';
import { TransformMath } from '../application/TransformMath.js';

// 0.4.1 — Interactive Structure Composition UX: the rendering half.
// tests/StructureCompositionPlacement.test.js covers everything that
// never touches Three.js; this file covers
// renderer/CompositionPreviewRenderer.js specifically, using the exact
// "real ghost meshes, minimal fake low-level renderer" technique
// tests/StructurePlacementRendering.test.js already established for its
// own StructurePreviewRenderer coverage.
//
//   Section A: showing a preview builds one ghost mesh per Structure
//              brick, composed with the preview's own position/rotation
//              — mirrors WorldRenderer's own placement composition
//              exactly (rotate around the LOCAL origin, then translate)
//   Section B: moving/rotating an already-visible preview updates the
//              SAME meshes in place, never rebuilding them, UNLESS the
//              Structure identity itself changes
//   Section C: an invalid preview tints every ghost mesh; a valid one
//              restores each mesh's own base color
//   Section D: hiding the preview removes every ghost mesh
//   Section E: graceful absence — no transformMath still renders
//              (unrotated), never throws

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function makeFakeRenderer() {
    const meshes = new Set();
    return { renderer: { add: (m) => meshes.add(m), remove: (m) => meshes.delete(m) }, meshes };
}

function makeStructure(id, bricks) {
    return { id, name: id, bricks };
}

async function run() {
    // -------------------------------------------------------------
    // Section A: preview composition — rotate around local origin,
    // then translate, exactly like WorldRenderer#_renderStructurePlacement()
    // -------------------------------------------------------------
    {
        const structure = makeStructure('test:well', [
            new Brick({ definitionId: 'core:cube', position: new Position(1, 0.5, 0), rotation: 0 })
        ]);
        const { renderer, meshes } = makeFakeRenderer();
        const compositionRenderer = new CompositionPreviewRenderer(renderer, TransformMath);
        const editorEventBus = new EventBus();
        compositionRenderer.subscribe(editorEventBus);

        const preview = new CompositionPreviewState({
            visible: true, structure, position: new Position(50, 0, 50), rotation: 90, valid: true
        });
        editorEventBus.publish(EditorEvent.COMPOSITION_PREVIEW_CHANGED, { compositionPreview: preview });

        assert(meshes.size === 1, '1. one Structure brick -> one ghost mesh added to the renderer');
        const mesh = Array.from(meshes)[0];
        // Local (1, 0, 0) rotated +90 around the origin -> (0, 0, 1),
        // then translated by the preview's own position (50, 0, 50).
        assert(Math.abs(mesh.position.x - 50) < 1e-9, '2. ghost x = rotated local x + preview position x');
        assert(Math.abs(mesh.position.z - 51) < 1e-9, '3. ghost z = rotated local z + preview position z');
        assert(mesh.material.transparent === true && mesh.material.opacity < 1,
            '4. ghost meshes are semi-transparent, never opaque like a committed brick');

        compositionRenderer.unsubscribe();
        console.log('✓ Section A: preview composition matches rotate-around-origin-then-translate exactly');
    }

    // -------------------------------------------------------------
    // Section B: moving/rotating updates the SAME meshes; a different
    // Structure identity rebuilds them
    // -------------------------------------------------------------
    {
        const structureA = makeStructure('test:house', [
            new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) })
        ]);
        const structureB = makeStructure('test:barn', [
            new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }),
            new Brick({ definitionId: 'core:cube', position: new Position(1, 0.5, 0) })
        ]);
        const { renderer, meshes } = makeFakeRenderer();
        const compositionRenderer = new CompositionPreviewRenderer(renderer, TransformMath);
        const editorEventBus = new EventBus();
        compositionRenderer.subscribe(editorEventBus);

        editorEventBus.publish(EditorEvent.COMPOSITION_PREVIEW_CHANGED, {
            compositionPreview: new CompositionPreviewState({ visible: true, structure: structureA, position: new Position(0, 0, 0), rotation: 0, valid: true })
        });
        const firstMeshes = new Set(meshes);
        assert(firstMeshes.size === 1, '5. structureA (1 brick) renders 1 ghost mesh');

        // Same Structure identity, moved — the SAME mesh instance updates
        // in place, never rebuilt.
        editorEventBus.publish(EditorEvent.COMPOSITION_PREVIEW_CHANGED, {
            compositionPreview: new CompositionPreviewState({ visible: true, structure: structureA, position: new Position(10, 0, 0), rotation: 0, valid: true })
        });
        assert(meshes.size === 1 && Array.from(meshes)[0] === Array.from(firstMeshes)[0],
            '6. moving the SAME structure identity updates the existing mesh, never rebuilds it');
        assert(Math.abs(Array.from(meshes)[0].position.x - 10) < 1e-9, '7. the updated mesh reflects the new position');

        // A DIFFERENT Structure identity — old meshes removed, new ones built.
        editorEventBus.publish(EditorEvent.COMPOSITION_PREVIEW_CHANGED, {
            compositionPreview: new CompositionPreviewState({ visible: true, structure: structureB, position: new Position(0, 0, 0), rotation: 0, valid: true })
        });
        assert(meshes.size === 2, '8. switching to a different Structure (2 bricks) rebuilds the ghost as 2 fresh meshes');
        assert(!meshes.has(Array.from(firstMeshes)[0]), '9. the previous Structure\'s own mesh is gone, not reused');

        compositionRenderer.unsubscribe();
        console.log('✓ Section B: same-identity moves update meshes in place; a different Structure rebuilds them');
    }

    // -------------------------------------------------------------
    // Section C: validity tints every ghost mesh
    // -------------------------------------------------------------
    {
        const structure = makeStructure('test:market', [
            new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }),
            new Brick({ definitionId: 'core:cube', position: new Position(1, 0.5, 0) })
        ]);
        const { renderer, meshes } = makeFakeRenderer();
        const compositionRenderer = new CompositionPreviewRenderer(renderer, TransformMath);
        const editorEventBus = new EventBus();
        compositionRenderer.subscribe(editorEventBus);

        editorEventBus.publish(EditorEvent.COMPOSITION_PREVIEW_CHANGED, {
            compositionPreview: new CompositionPreviewState({ visible: true, structure, position: new Position(0, 0, 0), rotation: 0, valid: false })
        });
        const baseColors = Array.from(meshes).map((m) => m.userData.baseColor.getHex());
        const invalidColors = Array.from(meshes).map((m) => m.material.color.getHex());
        assert(invalidColors.every((hex, i) => hex !== baseColors[i]), '10. an invalid preview tints every ghost mesh away from its base color');

        editorEventBus.publish(EditorEvent.COMPOSITION_PREVIEW_CHANGED, {
            compositionPreview: new CompositionPreviewState({ visible: true, structure, position: new Position(0, 0, 0), rotation: 0, valid: true })
        });
        const restoredColors = Array.from(meshes).map((m) => m.material.color.getHex());
        assert(JSON.stringify(restoredColors) === JSON.stringify(baseColors), '11. a valid preview restores each mesh\'s own base color');

        compositionRenderer.unsubscribe();
        console.log('✓ Section C: invalid/valid previews tint and restore ghost mesh colors');
    }

    // -------------------------------------------------------------
    // Section D: hiding removes every ghost mesh
    // -------------------------------------------------------------
    {
        const structure = makeStructure('test:mill', [new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) })]);
        const { renderer, meshes } = makeFakeRenderer();
        const compositionRenderer = new CompositionPreviewRenderer(renderer, TransformMath);
        const editorEventBus = new EventBus();
        compositionRenderer.subscribe(editorEventBus);

        editorEventBus.publish(EditorEvent.COMPOSITION_PREVIEW_CHANGED, {
            compositionPreview: new CompositionPreviewState({ visible: true, structure, position: new Position(0, 0, 0), rotation: 0, valid: true })
        });
        assert(meshes.size === 1, '12. showing renders the ghost');

        editorEventBus.publish(EditorEvent.COMPOSITION_PREVIEW_CHANGED, {
            compositionPreview: CompositionPreviewState.hidden()
        });
        assert(meshes.size === 0, '13. hiding removes every ghost mesh');

        compositionRenderer.unsubscribe();
        assert(meshes.size === 0, '14. unsubscribe() leaves no meshes behind');
        console.log('✓ Section D: hiding the preview removes every ghost mesh; unsubscribe() cleans up');
    }

    // -------------------------------------------------------------
    // Section E: graceful absence — no transformMath, never throws
    // -------------------------------------------------------------
    {
        const structure = makeStructure('test:bridge', [new Brick({ definitionId: 'core:cube', position: new Position(2, 0.5, 0) })]);
        const { renderer, meshes } = makeFakeRenderer();
        const compositionRenderer = new CompositionPreviewRenderer(renderer, null);
        const editorEventBus = new EventBus();
        compositionRenderer.subscribe(editorEventBus);

        editorEventBus.publish(EditorEvent.COMPOSITION_PREVIEW_CHANGED, {
            compositionPreview: new CompositionPreviewState({ visible: true, structure, position: new Position(5, 0, 5), rotation: 90, valid: true })
        });
        const mesh = Array.from(meshes)[0];
        // Without transformMath, rotation is never applied — the local
        // point passes through untouched, only translated.
        assert(Math.abs(mesh.position.x - 7) < 1e-9 && Math.abs(mesh.position.z - 5) < 1e-9,
            '15. no transformMath -> rotation degrades to a no-op (translate only), never throws');

        compositionRenderer.unsubscribe();
        console.log('✓ Section E: graceful absence — a renderer built without transformMath never throws');
    }

    console.log('\nAll structure composition rendering tests passed.');
}

await run();
