import { Structure } from '../core/Structure.js';
import { SpatialBounds } from '../core/SpatialBounds.js';
import { VillageLibrary } from '../core/library/VillageLibrary.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { CreateStructureRegistryUseCase } from '../application/CreateStructureRegistryUseCase.js';
import { ForkStructureUseCase } from '../application/ForkStructureUseCase.js';
import { CopyStructureIntoDocumentUseCase } from '../application/CopyStructureIntoDocumentUseCase.js';
import { transformStructureBricks } from '../application/StructureCompositionTransform.js';
import { CommandHistory } from '../application/CommandHistory.js';
import { BrickRenderer } from '../renderer/BrickRenderer.js';

// 0.4.4 — Village Library Expansion.
//
// 0.2.81 shipped six Village structures as a proof of the architecture;
// 0.4.4 grows the same library to twenty, content only — no new brick
// primitive, no new Structure field, no new library-loading code path.
// This file is the "does the CONTENT hold up?" companion to
// tests/ForkableStructureLibrary.test.js's own "does the MACHINERY hold
// up?" — every check here is a claim from docs/Roadmap.md's own 0.4.4
// quality bar, run against the real, full VillageLibrary rather than a
// synthetic fixture:
//
//   Section A: catalog shape — twenty structures across five categories,
//              matching docs/StructureLibrary.md's own taxonomy
//   Section B: per-structure geometry — unique brick ids, every
//              definitionId resolves in BrickRegistry, non-empty,
//              valid derived bounds
//   Section C: deterministic serialization — toJSON -> fromJSON ->
//              toJSON is byte-identical for every structure, and
//              building the registry twice produces byte-identical
//              content
//   Section D: no accidental duplicate-position bricks — two bricks
//              never occupy the exact same definitionId/position/
//              rotation within one structure (a real copy-paste bug,
//              never confused with the ordinary "door flush in a wall
//              opening" idiom every structure already uses)
//   Section E: every structure renders through the unmodified
//              BrickRenderer/ThreeBrickFactory pipeline
//   Section F: FORK produces independent bricks for every structure —
//              fresh ids throughout, source Structure untouched
//   Section G: COPY INTO DOCUMENT produces independent bricks for every
//              structure — fresh ids, source Structure untouched
//   Section H: composition preview matches committed geometry — the
//              exact transform application/tools/StructureCompositionTool.js's
//              ghost preview would compute (transformStructureBricks)
//              matches what actually lands in the Document once
//              CopyStructureIntoDocumentUseCase commits it
//   Section I: brick vocabulary diversity — every one of the 15 core:*
//              primitives is used by at least one Village structure
//   Section J: Structure != Building — several structures place zero
//              wall_1x3 bricks, proving a Structure is a reusable
//              spatial composition, never a synonym for "building"

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const EXPECTED_CATEGORY_COUNTS = {
    residential: 4,
    agricultural: 5,
    commercial: 2,
    community: 3,
    infrastructure: 6
};

// Structures deliberately built with no enclosing walls at all — the
// "Structure != Building" set docs/Roadmap.md's own 0.4.4 calls out.
const NON_BUILDING_IDS = ['village:pavilion', 'village:village_gate', 'village:fence_segment', 'village:dock', 'village:market_stall'];

const stubIdentityProvider = {
    currentUser: () => ({ username: 'alice', displayName: 'alice', providerId: 'stub' })
};

function makeEmptyDocument(title) {
    const world = new World();
    const building = new Building({ creator: 'local' });
    world.addBuilding(building);
    const document = new Document({ world, metadata: new DocumentMetadata({ title }) });
    return { world, building, document };
}

async function run() {
    const brickRegistry = new CreateBrickRegistryUseCase().execute();
    const structureRegistry = new CreateStructureRegistryUseCase().execute();
    const allStructures = structureRegistry.getAll();

    // ---------------------------------------------------------------
    // Section A: catalog shape
    // ---------------------------------------------------------------
    {
        assert(allStructures.length === 20, `registry: exactly twenty structures (got ${allStructures.length})`);

        const counts = {};
        for (const structure of allStructures) {
            counts[structure.category] = (counts[structure.category] || 0) + 1;
        }
        for (const [category, expected] of Object.entries(EXPECTED_CATEGORY_COUNTS)) {
            assert(counts[category] === expected,
                `registry: category "${category}" has ${expected} structures (got ${counts[category] || 0})`);
        }
        const totalCounted = Object.values(counts).reduce((a, b) => a + b, 0);
        assert(totalCounted === allStructures.length, 'registry: every structure falls into exactly one of the five known categories');

        // No id collides, none silently duplicated.
        const ids = new Set(allStructures.map((s) => s.id));
        assert(ids.size === allStructures.length, 'registry: every structure id is unique');

        console.log('✓ Section A: catalog shape — twenty structures, five categories, matching docs/StructureLibrary.md');
    }

    // ---------------------------------------------------------------
    // Section B: per-structure geometry
    // ---------------------------------------------------------------
    {
        let totalBricks = 0;
        for (const structure of allStructures) {
            assert(structure.bricks.length > 0, `${structure.id}: non-empty geometry`);
            totalBricks += structure.bricks.length;

            const brickIds = new Set();
            for (const brick of structure.bricks) {
                assert(!brickIds.has(brick.id), `${structure.id}: brick id ${brick.id} is unique within the structure`);
                brickIds.add(brick.id);
                assert(brickRegistry.has(brick.definitionId),
                    `${structure.id}: brick definitionId "${brick.definitionId}" resolves in BrickRegistry`);
            }

            const bounds = SpatialBounds.fromBricks(structure.bricks, brickRegistry);
            const size = bounds.size;
            assert(size.x > 0 && size.y > 0 && size.z > 0,
                `${structure.id}: derived bounds have real, positive extent (${JSON.stringify(size)})`);
        }
        assert(totalBricks >= 200, `registry: the expanded Village collection is a genuine multi-brick vocabulary (got ${totalBricks} bricks total)`);

        console.log(`✓ Section B: per-structure geometry — ${allStructures.length} structures, ${totalBricks} bricks, every definitionId real, every brick id unique, every bound valid`);
    }

    // ---------------------------------------------------------------
    // Section C: deterministic serialization
    // ---------------------------------------------------------------
    {
        for (const structure of allStructures) {
            const json = structure.toJSON();
            const restored = Structure.fromJSON(json);
            assert(JSON.stringify(restored.toJSON()) === JSON.stringify(json),
                `${structure.id}: toJSON -> fromJSON -> toJSON is byte-identical`);
        }

        // Building the registry from scratch a second time produces
        // byte-identical content — the library itself is static data,
        // never randomized or time-dependent.
        const secondRegistry = new CreateStructureRegistryUseCase().execute();
        for (const structure of allStructures) {
            const again = secondRegistry.get(structure.id);
            assert(again !== null, `${structure.id}: present in a freshly-built second registry`);
            assert(JSON.stringify(again.toJSON()) === JSON.stringify(structure.toJSON()),
                `${structure.id}: byte-identical across two independently constructed registries`);
        }

        console.log('✓ Section C: deterministic serialization — every structure round-trips and rebuilds byte-identically');
    }

    // ---------------------------------------------------------------
    // Section D: no accidental duplicate-position bricks
    // ---------------------------------------------------------------
    {
        for (const structure of allStructures) {
            const seen = new Set();
            for (const brick of structure.bricks) {
                const key = `${brick.definitionId}|${brick.position.x}|${brick.position.y}|${brick.position.z}|${brick.rotation}`;
                assert(!seen.has(key),
                    `${structure.id}: no two bricks share the exact same definitionId/position/rotation (${key})`);
                seen.add(key);
            }
        }
        console.log('✓ Section D: no accidental duplicate-position bricks in any structure');
    }

    // ---------------------------------------------------------------
    // Section E: every structure renders
    // ---------------------------------------------------------------
    {
        const renderer = new BrickRenderer(brickRegistry);
        for (const structure of allStructures) {
            for (const brick of structure.bricks) {
                const mesh = renderer.createMesh(brick);
                assert(mesh !== null && mesh !== undefined, `${structure.id}: ${brick.definitionId} renders a real mesh`);
            }
        }
        console.log('✓ Section E: all twenty structures render through the unmodified BrickRenderer/ThreeBrickFactory pipeline');
    }

    // ---------------------------------------------------------------
    // Section F: fork produces independent bricks, for every structure
    // ---------------------------------------------------------------
    {
        const forkUseCase = new ForkStructureUseCase();
        for (const structure of allStructures) {
            const before = structure.toJSON();
            const sourceIds = new Set(structure.bricks.map((b) => b.id));

            const forkDocument = forkUseCase.execute(structure, stubIdentityProvider);
            const forkedBricks = forkDocument.world.getBuildings()[0].getBricks();

            assert(forkedBricks.length === structure.bricks.length,
                `${structure.id}: fork has the same brick count as the source`);
            for (const brick of forkedBricks) {
                assert(!sourceIds.has(brick.id), `${structure.id}: forked brick id is never one of the library's own`);
            }
            assert(forkDocument.metadata.parentStructureId === structure.id,
                `${structure.id}: fork records provenance`);

            assert(JSON.stringify(structure.toJSON()) === JSON.stringify(before),
                `${structure.id}: forking never mutates the source Structure`);
        }
        console.log('✓ Section F: fork produces fresh, independent bricks for every structure; the library is never mutated');
    }

    // ---------------------------------------------------------------
    // Section G: copy into document produces independent bricks, for
    // every structure
    // ---------------------------------------------------------------
    {
        const copyUseCase = new CopyStructureIntoDocumentUseCase();
        for (const structure of allStructures) {
            const before = structure.toJSON();
            const sourceIds = new Set(structure.bricks.map((b) => b.id));

            const { world, building } = makeEmptyDocument(structure.name);
            const commandHistory = new CommandHistory({ world });
            const command = copyUseCase.execute(structure, {
                worldId: world.id, buildingId: building.id, world, registry: brickRegistry
            });
            commandHistory.execute(command);

            const composedBricks = building.getBricks();
            assert(composedBricks.length === structure.bricks.length,
                `${structure.id}: copy into an empty document places every brick`);
            for (const brick of composedBricks) {
                assert(!sourceIds.has(brick.id), `${structure.id}: copied brick id is never one of the library's own`);
            }

            assert(JSON.stringify(structure.toJSON()) === JSON.stringify(before),
                `${structure.id}: copying never mutates the source Structure`);
        }
        console.log('✓ Section G: copy into document produces fresh, independent bricks for every structure; the library is never mutated');
    }

    // ---------------------------------------------------------------
    // Section H: composition preview matches committed geometry
    // ---------------------------------------------------------------
    {
        const copyUseCase = new CopyStructureIntoDocumentUseCase();
        const transform = { position: { x: 7, y: 0, z: -3 }, rotation: 90 };

        for (const structure of allStructures) {
            // The exact geometry a ghost preview would show, per
            // application/StructureCompositionTransform.js.
            const previewed = transformStructureBricks(structure, transform)
                .map((item) => `${item.definitionId}|${item.position.x}|${item.position.y}|${item.position.z}|${item.rotation}`)
                .sort();

            const { world, building } = makeEmptyDocument(structure.name);
            const commandHistory = new CommandHistory({ world });
            const command = copyUseCase.execute(structure, {
                worldId: world.id, buildingId: building.id, world, registry: brickRegistry, transform
            });
            commandHistory.execute(command);

            const committed = building.getBricks()
                .map((brick) => `${brick.definitionId}|${brick.position.x}|${brick.position.y}|${brick.position.z}|${brick.rotation}`)
                .sort();

            assert(JSON.stringify(committed) === JSON.stringify(previewed),
                `${structure.id}: committed geometry matches the exact transform a composition preview would show`);
        }
        console.log('✓ Section H: composition preview and committed geometry share one pipeline for every structure');
    }

    // ---------------------------------------------------------------
    // Section I: brick vocabulary diversity
    // ---------------------------------------------------------------
    {
        const usedDefinitionIds = new Set();
        for (const structure of allStructures) {
            for (const brick of structure.bricks) {
                usedDefinitionIds.add(brick.definitionId);
            }
        }
        const allDefinitionIds = brickRegistry.getAll().map((def) => def.id);
        assert(allDefinitionIds.length === 15, `sanity: BrickRegistry still has 15 core definitions (got ${allDefinitionIds.length})`);
        for (const definitionId of allDefinitionIds) {
            assert(usedDefinitionIds.has(definitionId),
                `vocabulary: ${definitionId} is used by at least one Village structure`);
        }
        console.log('✓ Section I: every one of the 15 core:* primitives is used somewhere in the Village library');
    }

    // ---------------------------------------------------------------
    // Section J: Structure != Building
    // ---------------------------------------------------------------
    {
        assert(NON_BUILDING_IDS.length >= 4, 'sanity: the non-building set is non-trivial');
        for (const id of NON_BUILDING_IDS) {
            const structure = structureRegistry.get(id);
            assert(structure !== null, `${id}: registered`);
            const hasWall = structure.bricks.some((brick) => brick.definitionId === 'core:wall_1x3');
            assert(!hasWall, `${id}: places zero wall_1x3 bricks — a Structure is a reusable spatial composition, not a synonym for "building"`);
        }
        console.log('✓ Section J: several Village structures are deliberately not buildings — no enclosing walls at all');
    }

    console.log('\nAll Village Library Expansion tests passed.');
}

await run();
