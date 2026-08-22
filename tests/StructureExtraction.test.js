import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { SpatialBounds } from '../core/SpatialBounds.js';
import { SelectionState } from '../application/editor-state/SelectionState.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { CreateStructureRegistryUseCase } from '../application/CreateStructureRegistryUseCase.js';
import { CopyStructureIntoDocumentUseCase } from '../application/CopyStructureIntoDocumentUseCase.js';
import { CreateStructureFromSelectionUseCase } from '../application/CreateStructureFromSelectionUseCase.js';
import { ForkStructureUseCase } from '../application/ForkStructureUseCase.js';
import { CommandHistory } from '../application/CommandHistory.js';

// 0.4.2 — Structure Extraction & Blueprint Creation.
//
// Central architectural claim under test: the loop 0.4.0/0.4.1 left open
// now closes —
//
//   Structure --copy/compose--> Document --extract--> Structure
//
// CreateStructureFromSelectionUseCase turns a SELECTION of bricks
// already sitting in a Document back into a brand-new, independent
// core/Structure.js — never mutating the Document it was extracted
// from, normalized to its own local origin (minimum X/Z bounds), so the
// same shape produces the same Structure no matter where in the
// Document it happened to be composed.
//
//   Phase A: Build — compose House + Well + Barn into one Document via
//            CopyStructureIntoDocumentUseCase (0.4.0), unmodified
//   Phase B: Extract — select every brick, Create Structure ("Farmstead")
//   Phase C: Normalize — Farmstead's own bricks sit at minimum X/Z = 0;
//            the source Document is completely untouched (copy, never
//            move)
//   Phase D: Fork — ForkStructureUseCase(Farmstead) reproduces its exact
//            geometry with fresh brick identities
//   Phase E: Copy — CopyStructureIntoDocumentUseCase(Farmstead) into a
//            fresh empty Document reproduces its exact geometry
//   Phase F: Compose again — Farmstead A + Farmstead B + Market compose
//            into one Village Document with disjoint footprints
//   Phase G: Determinism — running Build+Extract twice from scratch
//            produces byte-identical Structure geometry and metadata
//   Guards:  a StructurePlacement selection, an empty selection, and a
//            missing name are all rejected predictably

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function bricksSnapshot(bricks) {
    return bricks
        .map((b) => `${b.definitionId}|${b.position.x}|${b.position.y}|${b.position.z}|${b.rotation}`)
        .sort();
}

function makeEmptyDocument(title = 'Extraction') {
    const world = new World();
    const building = new Building({ creator: 'local' });
    world.addBuilding(building);
    const document = new Document({ world, metadata: new DocumentMetadata({ title }) });
    return { world, building, document };
}

// Composes House + Well + Barn into a fresh empty Document, in that
// order, each as its own CopyStructureIntoDocumentUseCase command — the
// exact 0.4.0 composition path, never a shortcut. Returns everything a
// later phase needs to build a selection over the result.
function buildComposedVillage(structureRegistry, brickRegistry) {
    const { world, building, document } = makeEmptyDocument('Village');
    const commandHistory = new CommandHistory({ world });
    const copyUseCase = new CopyStructureIntoDocumentUseCase();

    for (const structureId of ['village:house', 'village:well', 'village:barn']) {
        const structure = structureRegistry.get(structureId);
        const command = copyUseCase.execute(structure, {
            worldId: world.id,
            buildingId: building.id,
            world,
            registry: brickRegistry
        });
        commandHistory.execute(command);
    }

    return { world, building, document, commandHistory };
}

async function run() {
    const brickRegistry = new CreateBrickRegistryUseCase().execute();
    const structureRegistry = new CreateStructureRegistryUseCase().execute();
    const extractUseCase = new CreateStructureFromSelectionUseCase();
    const forkStructureUseCase = new ForkStructureUseCase();

    // ---------------------------------------------------------------
    // Phase A: Build — House + Well + Barn composed into one Document
    // ---------------------------------------------------------------
    const { world, building, document } = buildComposedVillage(structureRegistry, brickRegistry);
    const house = structureRegistry.get('village:house');
    const well = structureRegistry.get('village:well');
    const barn = structureRegistry.get('village:barn');
    const expectedBrickCount = house.bricks.length + well.bricks.length + barn.bricks.length;
    assert(building.getBricks().length === expectedBrickCount,
        'build: House + Well + Barn are all present in the composed document');
    console.log('✓ Phase A: House + Well + Barn composed into one Document');

    // ---------------------------------------------------------------
    // Phase B: Extract — select everything, Create Structure
    // ---------------------------------------------------------------
    const sourceBricksBefore = building.getBricks();
    const sourceSnapshotBefore = bricksSnapshot(sourceBricksBefore);
    const sourceIdsBefore = new Set(sourceBricksBefore.map((b) => b.id));

    const selection = new SelectionState({
        items: sourceBricksBefore.map((brick) => ({ buildingId: building.id, brickId: brick.id }))
    });

    const farmstead = extractUseCase.execute(selection, document, {
        registry: brickRegistry,
        name: 'Farmstead',
        category: 'residential',
        tags: ['farmstead', 'composed'],
        description: 'House, well and barn compound'
    });
    assert(farmstead !== null, 'extract: a valid brick selection produces a Structure');
    assert(farmstead.name === 'Farmstead', 'extract: the Structure carries the requested name');
    assert(farmstead.bricks.length === expectedBrickCount,
        'extract: every selected brick is carried into the new Structure');
    console.log('✓ Phase B: selected bricks extracted into a new "Farmstead" Structure');

    // ---------------------------------------------------------------
    // Phase C: Normalize — minimum X/Z becomes the origin; the source
    // Document is completely untouched
    // ---------------------------------------------------------------
    const farmsteadBounds = SpatialBounds.fromBricks(farmstead.bricks, brickRegistry);
    assert(farmsteadBounds.min.x === 0, 'normalize: the extracted Structure\'s minimum X is exactly 0');
    assert(farmsteadBounds.min.z === 0, 'normalize: the extracted Structure\'s minimum Z is exactly 0');

    const sourceBounds = SpatialBounds.fromBricks(sourceBricksBefore, brickRegistry);
    assert(sourceBounds.min.x !== 0 || sourceBounds.min.z !== 0,
        'normalize: the source selection itself was NOT already sitting at the origin (the test is meaningful)');

    const sourceBricksAfter = building.getBricks();
    assert(sourceBricksAfter.length === sourceBricksBefore.length,
        'copy-never-move: extraction changed nothing about the source Document\'s brick count');
    assert(JSON.stringify(bricksSnapshot(sourceBricksAfter)) === JSON.stringify(sourceSnapshotBefore),
        'copy-never-move: the source Document\'s geometry is byte-identical after extraction');
    for (const brick of sourceBricksAfter) {
        assert(sourceIdsBefore.has(brick.id), 'copy-never-move: every original brick id is still present, untouched');
    }
    const farmsteadIds = new Set(farmstead.bricks.map((b) => b.id));
    for (const id of farmsteadIds) {
        assert(!sourceIdsBefore.has(id), 'extract: the new Structure never reuses a source brick\'s own identity');
    }
    console.log('✓ Phase C: normalized to its own minimum X/Z origin; the source Document is untouched');

    // ---------------------------------------------------------------
    // Phase D: Fork — ForkStructureUseCase reproduces Farmstead exactly
    // ---------------------------------------------------------------
    const forkedDocument = forkStructureUseCase.execute(farmstead);
    const forkedBuildingId = forkedDocument.world.getBuildings()[0].id;
    const forkedBricks = forkedDocument.world.getBuilding(forkedBuildingId).getBricks();
    assert(forkedBricks.length === farmstead.bricks.length, 'fork: every one of Farmstead\'s bricks is present in the fork');
    assert(JSON.stringify(bricksSnapshot(forkedBricks)) === JSON.stringify(bricksSnapshot(farmstead.bricks)),
        'fork: forked geometry matches the extracted Structure exactly');
    const farmsteadOwnIds = new Set(farmstead.bricks.map((b) => b.id));
    for (const brick of forkedBricks) {
        assert(!farmsteadOwnIds.has(brick.id), 'fork: forking mints fresh brick identities, never Farmstead\'s own');
    }
    console.log('✓ Phase D: forking Farmstead reproduces its exact geometry with fresh identities');

    // ---------------------------------------------------------------
    // Phase E: Copy — CopyStructureIntoDocumentUseCase into a fresh
    // empty Document reproduces Farmstead exactly (0.4.0's own
    // "byte-identical to an empty document" guarantee, one rung over
    // for a USER-extracted Structure, not just a built-in one)
    // ---------------------------------------------------------------
    const copyUseCase = new CopyStructureIntoDocumentUseCase();
    const target = makeEmptyDocument('Copy Target');
    const targetHistory = new CommandHistory({ world: target.world });
    const copyCommand = copyUseCase.execute(farmstead, {
        worldId: target.world.id,
        buildingId: target.building.id,
        world: target.world,
        registry: brickRegistry
    });
    targetHistory.execute(copyCommand);
    const copiedBricks = target.building.getBricks();
    assert(copiedBricks.length === farmstead.bricks.length, 'copy: every one of Farmstead\'s bricks was inserted');
    assert(JSON.stringify(bricksSnapshot(copiedBricks)) === JSON.stringify(bricksSnapshot(farmstead.bricks)),
        'copy: copying Farmstead into an empty document keeps its own local geometry exactly');
    console.log('✓ Phase E: copying Farmstead into a fresh Document reproduces its exact geometry');

    // ---------------------------------------------------------------
    // Phase F: Compose again — Farmstead A + Farmstead B + Market into
    // one Village, disjoint footprints, one command each
    // ---------------------------------------------------------------
    const market = structureRegistry.get('village:market');
    const village = makeEmptyDocument('New Village');
    const villageHistory = new CommandHistory({ world: village.world });
    const composedNames = ['Farmstead A', 'Farmstead B', 'Market'];
    const composedStructures = [farmstead, farmstead, market];
    const priorBrickIdSets = [];
    for (let i = 0; i < composedStructures.length; i++) {
        const beforeIds = new Set(village.building.getBricks().map((b) => b.id));
        const command = copyUseCase.execute(composedStructures[i], {
            worldId: village.world.id,
            buildingId: village.building.id,
            world: village.world,
            registry: brickRegistry
        });
        villageHistory.execute(command);
        const afterBricks = village.building.getBricks();
        const newIds = afterBricks.map((b) => b.id).filter((id) => !beforeIds.has(id));
        assert(newIds.length === composedStructures[i].bricks.length,
            `compose-again: ${composedNames[i]} contributed exactly its own brick count`);
        priorBrickIdSets.push(new Set(newIds));
    }
    assert(villageHistory.getCursor() === 3, 'compose-again: three separate composition commands, never merged');
    const allVillageBricks = village.building.getBricks();
    assert(allVillageBricks.length === composedStructures.reduce((sum, s) => sum + s.bricks.length, 0),
        'compose-again: the Village document holds every brick from all three compositions');

    // No AABB overlap between successive compositions, mirroring
    // tests/BlueprintComposition.test.js's own Phase B check.
    for (let i = 1; i < priorBrickIdSets.length; i++) {
        const previousBricks = allVillageBricks.filter((b) =>
            priorBrickIdSets.slice(0, i).some((set) => set.has(b.id)));
        const thisBricks = allVillageBricks.filter((b) => priorBrickIdSets[i].has(b.id));
        const previousBounds = SpatialBounds.fromBricks(previousBricks, brickRegistry);
        const thisBounds = SpatialBounds.fromBricks(thisBricks, brickRegistry);
        assert(previousBounds.max.x <= thisBounds.min.x,
            `compose-again: ${composedNames[i]} occupies a disjoint footprint along X from everything composed before it`);
    }
    console.log('✓ Phase F: Farmstead A + Farmstead B + Market compose into one Village with disjoint footprints');

    // ---------------------------------------------------------------
    // Phase G: Determinism — Build + Extract twice from scratch
    // produces byte-identical Structure geometry and metadata
    // ---------------------------------------------------------------
    function buildAndExtractFarmstead() {
        const built = buildComposedVillage(structureRegistry, brickRegistry);
        const bricks = built.building.getBricks();
        const sel = new SelectionState({
            items: bricks.map((brick) => ({ buildingId: built.building.id, brickId: brick.id }))
        });
        return extractUseCase.execute(sel, built.document, {
            registry: brickRegistry,
            name: 'Farmstead',
            category: 'residential',
            tags: ['farmstead', 'composed'],
            description: 'House, well and barn compound'
        });
    }
    const runOne = buildAndExtractFarmstead();
    const runTwo = buildAndExtractFarmstead();
    assert(runOne.name === runTwo.name && runOne.category === runTwo.category
        && runOne.description === runTwo.description
        && JSON.stringify(runOne.tags) === JSON.stringify(runTwo.tags),
        'determinism: two independent runs produce identical Structure metadata');
    assert(JSON.stringify(bricksSnapshot(runOne.bricks)) === JSON.stringify(bricksSnapshot(runTwo.bricks)),
        'determinism: two independent runs produce byte-identical Structure geometry (ids aside)');
    console.log('✓ Phase G: two independent Build+Extract runs produce byte-identical Structure geometry and metadata');

    // ---------------------------------------------------------------
    // Guards: only an ordinary brick selection can become a Structure
    // ---------------------------------------------------------------
    {
        const placementSelection = new SelectionState({
            items: [{ type: 'structure-placement', placementId: 'placement-1' }]
        });
        let threw = false;
        try {
            extractUseCase.execute(placementSelection, document, { registry: brickRegistry, name: 'Nope' });
        } catch (error) {
            threw = true;
            assert(error.message === 'Create Structure requires brick selections only.',
                'guard: a StructurePlacement selection throws the exact predictable message');
        }
        assert(threw, 'guard: a StructurePlacement selection is rejected, never silently ignored');

        const nothing = extractUseCase.execute(SelectionState.empty(), document, { registry: brickRegistry, name: 'Nope' });
        assert(nothing === null, 'guard: an empty selection produces nothing, without throwing');

        let threwForName = false;
        try {
            extractUseCase.execute(selection, document, { registry: brickRegistry });
        } catch (error) {
            threwForName = true;
        }
        assert(threwForName, 'guard: a missing name is rejected rather than creating an unnamed Structure');

        console.log('✓ Guards: StructurePlacement selections and missing names are rejected predictably');
    }

    console.log('\nAll structure extraction tests passed.');
}

// tests.html's `await import(file)` only reliably waits for a module's
// synchronous top-level evaluation — see every other test file's own
// closing comment on this — so this is invoked with top-level await,
// never fire-and-forget.
await run();
