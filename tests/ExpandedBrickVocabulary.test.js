import * as THREE from 'three';
import { BrickRegistry } from '../core/BrickRegistry.js';
import { CoreLibrary } from '../core/library/CoreLibrary.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { PaletteUseCase } from '../application/PaletteUseCase.js';
import { EditorContext } from '../application/EditorContext.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { PlacementValidator } from '../core/PlacementValidator.js';
import { SelectionBoundsService } from '../application/SelectionBoundsService.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { BrickRenderer } from '../renderer/BrickRenderer.js';
import { ThreeBrickFactory } from '../renderer/ThreeBrickFactory.js';
import {
    PRE_GROUPS_DOCUMENT,
    GROUPS_DOCUMENT,
    CURRENT_DOCUMENT
} from './fixtures/historicalDocuments.js';

// 0.2.80 — Expanded Brick Vocabulary.
//
// Central architectural claim under test: adding eleven new
// BrickDefinitions (structural, wall, floor, roof, stairs, column, beam,
// arch, window, door, decorative) required no change whatsoever to
// core/Brick.js, core/documentSchema.js, or
// serializer/DocumentSchemaMigrator.js — a Brick is still nothing but
// { id, definitionId, position, rotation }, and a document's own
// serialization shape is untouched. Every new definition is a genuine
// PRIMITIVE (one BrickDefinition, one mesh factory, one definitionId) —
// never a hidden composite of smaller bricks — per docs/Principles.md,
// "A Brick Is A Primitive, Never A Preassembled Structure."
//
//   Section A: registry contents — 15 definitions, the original 4 unchanged
//   Section B: groupByCategory() — palette grouping
//   Section C: ThreeBrickFactory / BrickRenderer — every id builds a real,
//              distinctly-sized mesh, never silently falling back
//   Section D: placement / collision plumbing (PlacementValidator,
//              SelectionBoundsService) works unmodified for new definitions
//   Section E: backward compatibility — pre-0.2.80 historical fixtures
//              still deserialize, validate, and round-trip identically
//   Section F: FLAGSHIP — create document -> place every brick type ->
//              save -> reload -> render -> same geometry, same brick
//              types, same document semantics

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const NEW_DEFINITION_IDS = [
    'core:block_2x2', 'core:wall_1x3', 'core:slab_4x4', 'core:roof_hip',
    'core:stair', 'core:column', 'core:beam', 'core:arch',
    'core:window_large', 'core:door', 'core:trim'
];
const ORIGINAL_DEFINITION_IDS = [
    'core:cube', 'core:slope_45', 'core:plate_2x4', 'core:window_small'
];
const ALL_DEFINITION_IDS = [...ORIGINAL_DEFINITION_IDS, ...NEW_DEFINITION_IDS];

function boundingBoxSize(mesh) {
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox;
    return {
        x: box.max.x - box.min.x,
        y: box.max.y - box.min.y,
        z: box.max.z - box.min.z
    };
}

function assertApprox(actual, expected, tolerance, message) {
    assert(Math.abs(actual - expected) <= tolerance, `${message} (got ${actual}, expected ~${expected})`);
}

// -----------------------------------------------------------------------
// Section A: registry contents
// -----------------------------------------------------------------------
{
    const registry = new CreateBrickRegistryUseCase().execute();
    const all = registry.getAll();
    assert(all.length === 15, `registry has 15 definitions (got ${all.length})`);

    for (const id of ALL_DEFINITION_IDS) {
        assert(registry.has(id), `registry has ${id}`);
        assert(registry.get(id) !== null, `registry resolves ${id}`);
    }

    // The original four are byte-for-byte unchanged: same category, same
    // tags, same bounding box. An existing document referencing them
    // still resolves the identical geometry it always did.
    const cube = registry.get('core:cube');
    assert(cube.category === 'primitive', 'core:cube category unchanged');
    assert(cube.width === 1 && cube.height === 1 && cube.depth === 1, 'core:cube dims unchanged');

    const plate = registry.get('core:plate_2x4');
    assert(plate.category === 'primitive', 'core:plate_2x4 category unchanged');
    assert(plate.width === 2 && plate.height === 0.25 && plate.depth === 4, 'core:plate_2x4 dims unchanged');

    const slope = registry.get('core:slope_45');
    assert(slope.width === 1 && slope.height === 1 && slope.depth === 1, 'core:slope_45 dims unchanged');

    const windowSmall = registry.get('core:window_small');
    assert(windowSmall.width === 1 && windowSmall.height === 1 && windowSmall.depth === 0.25,
        'core:window_small dims unchanged');

    // Every new definition declares a real, positive bounding box and a
    // non-'primitive' category drawn from the design conversation's own
    // vocabulary — never a placeholder.
    const expectedCategories = {
        'core:block_2x2': 'structural',
        'core:wall_1x3': 'wall',
        'core:slab_4x4': 'floor',
        'core:roof_hip': 'roof',
        'core:stair': 'stairs',
        'core:column': 'column',
        'core:beam': 'beam',
        'core:arch': 'arch',
        'core:window_large': 'window',
        'core:door': 'door',
        'core:trim': 'decorative'
    };
    for (const [id, category] of Object.entries(expectedCategories)) {
        const definition = registry.get(id);
        assert(definition.category === category, `${id} has category ${category}`);
        assert(definition.width > 0 && definition.height > 0 && definition.depth > 0,
            `${id} has a positive bounding box`);
        assert(typeof definition.name === 'string' && definition.name.length > 0, `${id} has a name`);
        assert(typeof definition.description === 'string' && definition.description.length > 0,
            `${id} has a description`);
    }

    console.log('✓ Section A: registry contents — 15 definitions, original 4 unchanged');
}

// -----------------------------------------------------------------------
// Section B: groupByCategory()
// -----------------------------------------------------------------------
{
    const registry = new BrickRegistry();
    registry.register(CoreLibrary);
    const groups = registry.groupByCategory();

    const totalGrouped = groups.reduce((sum, g) => sum + g.definitions.length, 0);
    assert(totalGrouped === 15, 'grouping loses no definitions');

    const categories = groups.map((g) => g.category);
    assert(new Set(categories).size === categories.length, 'each category appears in exactly one group');
    assert(categories.includes('primitive'), 'primitive group present');
    for (const category of Object.values({
        'core:block_2x2': 'structural', 'core:wall_1x3': 'wall', 'core:slab_4x4': 'floor',
        'core:roof_hip': 'roof', 'core:stair': 'stairs', 'core:column': 'column',
        'core:beam': 'beam', 'core:arch': 'arch', 'core:window_large': 'window',
        'core:door': 'door', 'core:trim': 'decorative'
    })) {
        assert(categories.includes(category), `${category} group present`);
    }

    const primitiveGroup = groups.find((g) => g.category === 'primitive');
    assert(primitiveGroup.definitions.length === 4, 'primitive group has the original 4 definitions');

    // getAll()/getByCategory()/search() stay exactly as they were.
    assert(registry.getAll().length === 15, 'getAll() unchanged');
    assert(registry.getByCategory('primitive').length === 4, 'getByCategory() unchanged');
    assert(registry.search('roof').some((d) => d.id === 'core:roof_hip'), 'search() finds core:roof_hip by tag');
    assert(registry.search('roof').some((d) => d.id === 'core:slope_45'), 'search() still finds core:slope_45 by tag');

    // application/PaletteUseCase.js exposes the same grouping to the UI.
    const editorContext = new EditorContext();
    const paletteUseCase = new PaletteUseCase(registry, editorContext);
    const paletteGroups = paletteUseCase.getGroupedDefinitions();
    assert(paletteGroups.length === groups.length, 'PaletteUseCase.getGroupedDefinitions() matches the registry');
    assert(paletteUseCase.getDefinitions().length === 15, 'PaletteUseCase.getDefinitions() still returns everything');

    console.log('✓ Section B: groupByCategory() groups all 15 definitions correctly');
}

async function runRendererTests() {
    // -------------------------------------------------------------
    // Section C: ThreeBrickFactory / BrickRenderer
    // -------------------------------------------------------------
    {
        const registry = new CreateBrickRegistryUseCase().execute();
        const factory = new ThreeBrickFactory();
        const renderer = new BrickRenderer(registry, factory);

        // Every one of the 15 ids builds a real mesh whose bounding box
        // approximately matches its BrickDefinition's own width/height/depth
        // — the same AABB approximation core/AvatarCollision.js and
        // application/SelectionBoundsService.js already rely on for every
        // brick, proving the new geometry (boxes, a cylinder, a cone, and
        // two Shape/ExtrudeGeometry primitives) is actually sized the way
        // its definition claims, not silently falling back to a 1x1x1 box.
        for (const id of ALL_DEFINITION_IDS) {
            const definition = registry.get(id);
            const mesh = factory.createMesh(id);
            assert(mesh instanceof THREE.Mesh, `${id} builds a THREE.Mesh`);
            const size = boundingBoxSize(mesh);
            // Faceted primitives (stair, arch: extrusion; roof_hip: a
            // 4-segment cone) can be a little short of their nominal
            // bounding box; a generous but real tolerance still catches a
            // silent fallback-to-1x1x1 for anything whose real dimensions
            // differ meaningfully from a unit cube.
            const tolerance = Math.max(definition.width, definition.height, definition.depth) * 0.35;
            assertApprox(size.x, definition.width, tolerance, `${id} mesh width`);
            assertApprox(size.y, definition.height, tolerance, `${id} mesh height`);
            assertApprox(size.z, definition.depth, tolerance, `${id} mesh depth`);
        }

        // The four original ids still build the exact same nominal size
        // they always did — proven exactly, not approximately, since
        // they're all plain boxes.
        for (const id of ORIGINAL_DEFINITION_IDS) {
            const definition = registry.get(id);
            const size = boundingBoxSize(factory.createMesh(id));
            assertApprox(size.x, definition.width, 0.001, `${id} mesh width exact`);
            assertApprox(size.y, definition.height, 0.001, `${id} mesh height exact`);
            assertApprox(size.z, definition.depth, 0.001, `${id} mesh depth exact`);
        }

        // A factory-level static orientation (core:roof_hip's 45° cone
        // rotation) is baked into the GEOMETRY, never mesh.rotation —
        // BrickRenderer.createMesh() always SETS mesh.rotation.y from the
        // brick's own placement rotation, so anything left on mesh.rotation
        // by a factory would be silently overwritten the instant a brick
        // is actually placed and rendered.
        const roofBrick = new Brick({ definitionId: 'core:roof_hip', position: new Position(0, 0, 0), rotation: 90 });
        const roofMesh = renderer.createMesh(roofBrick);
        assertApprox(roofMesh.rotation.y, 90 * (Math.PI / 180), 0.0001,
            'BrickRenderer applies the brick\'s own placement rotation, not a factory-baked one');

        // An unknown definitionId still falls back rather than throwing
        // from the factory (BrickRenderer itself throws first, at the
        // registry-lookup step, exactly as before 0.2.80).
        let threw = false;
        try {
            renderer.createMesh(new Brick({ definitionId: 'core:not_a_real_id', position: new Position() }));
        } catch (e) {
            threw = true;
            assert(e.message.includes('core:not_a_real_id'), 'unknown definitionId error names the id');
        }
        assert(threw, 'BrickRenderer throws on an unknown definitionId');

        console.log('✓ Section C: every id builds a real, correctly-sized mesh');
    }

    // -------------------------------------------------------------
    // Section D: placement / collision plumbing works unmodified
    // -------------------------------------------------------------
    {
        const registry = new CreateBrickRegistryUseCase().execute();
        const world = new World();
        const building = new Building({ creator: 'tester' });
        const column = new Brick({ definitionId: 'core:column', position: new Position(0, 1.5, 0) });
        building.addBrick(column);
        world.addBuilding(building);

        const validator = new PlacementValidator();
        assert(validator.canPlace(world, building.id, new Position(5, 0, 0)) === true,
            'an empty position is placeable regardless of brick vocabulary');
        assert(validator.canPlace(world, building.id, new Position(0, 1.5, 0)) === false,
            'an occupied position is rejected the same way for a new brick type as an old one');

        // SelectionBoundsService derives a bounding box straight from the
        // new definition's own width/height/depth — no new code path.
        const boundsService = new SelectionBoundsService(registry);
        const bounds = boundsService.calculateBrickBounds(column);
        assertApprox(bounds.size.x, 0.5, 0.001, 'core:column bounds width');
        assertApprox(bounds.size.y, 3, 0.001, 'core:column bounds height');
        assertApprox(bounds.size.z, 0.5, 0.001, 'core:column bounds depth');
        assertApprox(bounds.center.y, 1.5, 0.001, 'core:column bounds centered on brick position');

        console.log('✓ Section D: PlacementValidator/SelectionBoundsService work unmodified for new bricks');
    }

    // -------------------------------------------------------------
    // Section E: backward compatibility — pre-0.2.80 fixtures unaffected
    // -------------------------------------------------------------
    {
        const serializer = new DocumentSerializer();
        const registry = new CreateBrickRegistryUseCase().execute();

        for (const fixture of [PRE_GROUPS_DOCUMENT, GROUPS_DOCUMENT, CURRENT_DOCUMENT]) {
            const doc = serializer.deserialize(fixture);
            for (const b of doc.world.getBuildings()) {
                for (const brick of b.getBricks()) {
                    assert(ORIGINAL_DEFINITION_IDS.includes(brick.definitionId),
                        `historical fixture only references pre-0.2.80 ids (${brick.definitionId})`);
                    assert(registry.has(brick.definitionId),
                        `the expanded registry still resolves ${brick.definitionId}`);
                }
            }
            const reserialized = serializer.serialize(doc);
            const redeserialized = serializer.deserialize(reserialized);
            assert(JSON.stringify(serializer.serialize(redeserialized)) === JSON.stringify(reserialized),
                'historical fixture round-trips byte-identically through the expanded registry');
        }

        // The registry itself, not just the fixtures, is what changed —
        // confirm a fixture brick's definition is the identical object
        // (same width/height/depth) an 0.2.79 registry would have
        // returned, proving the new definitions were purely additive.
        const cubeFromFixture = registry.get('core:cube');
        assert(cubeFromFixture.width === 1 && cubeFromFixture.height === 1 && cubeFromFixture.depth === 1,
            'core:cube as resolved for a historical fixture is unchanged');

        console.log('✓ Section E: pre-0.2.80 historical documents remain fully backward compatible');
    }

    // -------------------------------------------------------------
    // Section F: FLAGSHIP — create -> place every type -> save ->
    // reload -> render -> same geometry, same types, same semantics
    // -------------------------------------------------------------
    {
        const registry = new CreateBrickRegistryUseCase().execute();
        const factory = new ThreeBrickFactory();
        const renderer = new BrickRenderer(registry, factory);
        const serializer = new DocumentSerializer();

        // 1. Create a document and place one instance of EVERY brick
        //    type — original four and all eleven new ones — at distinct,
        //    non-overlapping positions.
        const world = new World();
        const building = new Building({ creator: 'flagship-tester' });
        // Positions are spaced 5 units apart along X — trivially
        // non-overlapping, so every one of the 15 placements is legal.
        ALL_DEFINITION_IDS.forEach((definitionId, index) => {
            building.addBrick(new Brick({
                definitionId,
                position: new Position(index * 5, 0, 0),
                rotation: (index % 4) * 90
            }));
        });
        world.addBuilding(building);
        const validator = new PlacementValidator();
        for (const brick of building.getBricks()) {
            assert(validator.canPlace(world, building.id, brick.position) === false,
                `flagship: ${brick.definitionId}'s own already-occupied position correctly reports unplaceable`);
        }
        assert(validator.canPlace(world, building.id, new Position(9999, 0, 0)) === true,
            'flagship: an untouched position among the 15 stays placeable');
        const doc = new Document({
            world,
            metadata: new DocumentMetadata({ title: 'Expanded Vocabulary Flagship', author: 'flagship-tester' })
        });
        assert(building.getBricks().length === 15, 'every brick type was placed exactly once');

        // 2. Render before saving — every placed brick builds a real mesh
        //    with no exceptions.
        const meshesBeforeSave = building.getBricks().map((brick) => renderer.createMesh(brick));
        assert(meshesBeforeSave.length === 15, 'every placed brick renders before save');
        meshesBeforeSave.forEach((mesh) => assert(mesh instanceof THREE.Mesh, 'rendered object is a THREE.Mesh'));

        // 3. Save (serialize).
        const saved = serializer.serialize(doc);
        assert(saved.schemaVersion !== undefined, 'saved document carries schemaVersion — no envelope change needed');

        // 4. Reload (deserialize a fresh copy, simulating a page reload).
        const reloadedJson = JSON.parse(JSON.stringify(saved));
        const reloaded = serializer.deserialize(reloadedJson);
        const reloadedBuilding = reloaded.world.getBuildings()[0];

        // 5. Same brick types: every definitionId placed is still present,
        //    in the same order, after the round trip.
        const originalIds = building.getBricks().map((b) => b.definitionId).sort();
        const reloadedIds = reloadedBuilding.getBricks().map((b) => b.definitionId).sort();
        assert(JSON.stringify(originalIds) === JSON.stringify(reloadedIds),
            'flagship: same 15 brick types survive save -> reload');

        // 6. Render after reload — same geometry: each reloaded brick's
        //    mesh has the identical bounding box as its pre-save mesh
        //    (matched by definitionId, since ids are freshly generated
        //    per Brick instance but the SET of definitionIds is what
        //    "same brick types" means here).
        const sizeById = new Map();
        for (const brick of building.getBricks()) {
            if (!sizeById.has(brick.definitionId)) {
                sizeById.set(brick.definitionId, boundingBoxSize(renderer.createMesh(brick)));
            }
        }
        for (const brick of reloadedBuilding.getBricks()) {
            const before = sizeById.get(brick.definitionId);
            const after = boundingBoxSize(renderer.createMesh(brick));
            assertApprox(after.x, before.x, 0.0001, `flagship: ${brick.definitionId} width identical after reload`);
            assertApprox(after.y, before.y, 0.0001, `flagship: ${brick.definitionId} height identical after reload`);
            assertApprox(after.z, before.z, 0.0001, `flagship: ${brick.definitionId} depth identical after reload`);
        }

        // 7. Same document semantics: re-serializing the reloaded document
        //    is byte-identical to the original save — nothing was lost,
        //    reordered, or silently defaulted by the round trip.
        const resaved = serializer.serialize(reloaded);
        assert(JSON.stringify(resaved) === JSON.stringify(saved),
            'flagship: reloaded document re-serializes byte-identically to the original save');

        // 8. Original four bricks are indistinguishable, in the reloaded
        //    document, from how they behaved before this milestone shipped
        //    — the specific backward-compatibility claim the design
        //    conversation asked to prove, not merely assert.
        for (const id of ORIGINAL_DEFINITION_IDS) {
            const brick = reloadedBuilding.getBricks().find((b) => b.definitionId === id);
            assert(brick !== undefined, `flagship: original brick ${id} present after reload`);
            const definition = registry.get(id);
            const size = boundingBoxSize(renderer.createMesh(brick));
            assertApprox(size.x, definition.width, 0.001, `flagship: ${id} width matches its unchanged definition`);
            assertApprox(size.y, definition.height, 0.001, `flagship: ${id} height matches its unchanged definition`);
            assertApprox(size.z, definition.depth, 0.001, `flagship: ${id} depth matches its unchanged definition`);
        }

        console.log('✓ Section F: FLAGSHIP — create -> place all 15 types -> save -> reload -> render, ' +
            'identical geometry, identical types, byte-identical document semantics');
    }

    console.log('\nAll expanded brick vocabulary tests passed.');
}

// Top-level await, not `runRendererTests().catch(...)` — see
// tests/AvatarRendering.test.js's own note (and 0.2.32's original
// discovery on tests/PreviewService.test.js): tests.html's
// `await import(file)` only reliably waits for a module's SYNCHRONOUS
// top-level evaluation, so a fire-and-forget async call here could let
// a failing assertion be counted as "passed" by the runner. Top-level
// await makes import() itself the thing that waits.
await runRendererTests();
