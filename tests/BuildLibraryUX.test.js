import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { CreateStructureRegistryUseCase } from '../application/CreateStructureRegistryUseCase.js';
import { VillageLibrary } from '../core/library/VillageLibrary.js';
import { LibraryPreviewService } from '../application/LibraryPreviewService.js';
import { PreviewType } from '../core/DocumentPreview.js';
import { matches, normalize } from '../ui/components/BuildLibraryPanel.js';
import { EditorContext } from '../application/EditorContext.js';
import { PaletteUseCase } from '../application/PaletteUseCase.js';
import { ForkStructureUseCase } from '../application/ForkStructureUseCase.js';
import { EditorSession } from '../application/EditorSession.js';
import { DocumentManager } from '../application/DocumentManager.js';
import { Brick } from '../core/Brick.js';
import { BrickRenderer } from '../renderer/BrickRenderer.js';

// 0.2.84 — Building Library & Palette UX.
//
// Central architectural claim under test, per the design conversation:
// a growing brick/structure vocabulary needs to stay browsable by
// NAVIGATION (categories, search, previews) rather than by shrinking
// icons — and unifying how Bricks and Structures are found must never
// blur WHAT clicking either one does. Selecting a brick still only
// ever touches PaletteUseCase/EditorContext; forking a structure still
// only ever produces a brand-new Document. Nothing here changes
// BrickDefinition, Structure, ForkStructureUseCase, or what either
// action actually does — only how both are found.
//
// Following tests/PreviewService.test.js's own established boundary:
// LibraryPreviewService's queue/cache/cancellation logic is tested here
// with a FAKE renderer, no real WebGL — the actual pixel-producing
// path (renderer/DocumentThumbnailRenderer.js#renderBricks()) is a
// renderer-touching concern, verified visually instead.
//
//   Section A: StructureRegistry#groupByCategory() — same shape as
//              BrickRegistry's own, exercised against the real
//              VillageLibrary
//   Section B: the Build Library's search/filter rule (matches/
//              normalize) in isolation
//   Section C: LibraryPreviewService — lazy renderer, cache, brick vs.
//              structure key separation, cancellation, renderer
//              failure never throws and never retries
//   Section D: every brick definition and every structure still
//              renders a real mesh through the unmodified
//              BrickRenderer/ThreeBrickFactory pipeline — a preview is
//              a picture of the real content, never a second visual
//              language
//   Section E: Place vs Fork stay structurally independent — selecting
//              a brick never touches the active tool or opens a
//              document; forking a structure never touches the active
//              brick or the active tool

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const stubIdentityProvider = {
    currentUser: () => ({ username: 'alice', displayName: 'alice', providerId: 'stub' })
};

async function run() {
    // ---------------------------------------------------------------
    // Section A: StructureRegistry#groupByCategory()
    // ---------------------------------------------------------------
    {
        const registry = new CreateStructureRegistryUseCase().execute();
        const groups = registry.groupByCategory();

        const totalGrouped = groups.reduce((sum, g) => sum + g.structures.length, 0);
        assert(totalGrouped === registry.getAll().length,
            'groupByCategory: every registered structure appears in exactly one group');

        // First-seen order, matching VillageLibrary's own declaration
        // order (house:residential, barn:agricultural, well/market/
        // mill/bridge...) — byte-for-byte the same contract
        // BrickRegistry#groupByCategory() already established.
        const categoryOrder = groups.map((g) => g.category);
        assert(categoryOrder[0] === 'residential', 'groupByCategory: first group is residential (House is first-declared)');
        assert(categoryOrder[1] === 'agricultural', 'groupByCategory: second group is agricultural (Barn is next)');
        assert(new Set(categoryOrder).size === categoryOrder.length, 'groupByCategory: no category repeats as a second group');

        const agricultural = groups.find((g) => g.category === 'agricultural');
        const agriculturalIds = agricultural.structures.map((s) => s.id).sort();
        assert(JSON.stringify(agriculturalIds) === JSON.stringify(['village:barn', 'village:mill']),
            'groupByCategory: Barn and Mill share the agricultural group');

        const infrastructure = groups.find((g) => g.category === 'infrastructure');
        const infrastructureIds = infrastructure.structures.map((s) => s.id).sort();
        assert(JSON.stringify(infrastructureIds) === JSON.stringify(['village:bridge', 'village:well']),
            'groupByCategory: Well and Bridge share the infrastructure group');

        // getAll()/getByCategory()/search() stay exactly what 0.2.81 shipped.
        assert(registry.getAll().length === 6, 'groupByCategory: getAll() is unaffected — still six structures');
        assert(registry.getByCategory('commercial').length === 1, 'groupByCategory: getByCategory() is unaffected');

        console.log('✓ Section A: StructureRegistry#groupByCategory() — same shape as BrickRegistry, real VillageLibrary contents');
    }

    // ---------------------------------------------------------------
    // Section B: search/filter rule
    // ---------------------------------------------------------------
    {
        assert(normalize('  Door  ') === 'door', 'normalize: trims and lowercases');
        assert(normalize(null) === '', 'normalize: null becomes empty string');
        assert(normalize(undefined) === '', 'normalize: undefined becomes empty string');

        assert(matches('', 'Anything') === true, 'matches: empty query matches everything');
        assert(matches('door', 'Door', 'openings', 'door window') === true, 'matches: matches the name field');
        assert(matches('open', 'Door', 'openings', 'door window') === true, 'matches: matches the category field');
        assert(matches('window', 'Door', 'openings', 'door window') === true, 'matches: matches a tag field');
        assert(matches('house', 'Door', 'openings', 'door window') === false, 'matches: no match across any field returns false');
        assert(matches(normalize('DOOR'), 'door', '', '') === true, 'matches: case-insensitive once the query itself is normalized (matches() takes an already-normalized query, same as its one real call site in BuildLibraryPanel.js)');

        console.log('✓ Section B: Build Library search/filter rule — matches name/category/tags, case-insensitive, empty query passes all');
    }

    // ---------------------------------------------------------------
    // Section C: LibraryPreviewService
    // ---------------------------------------------------------------
    {
        // 1. Lazy renderer construction — never built until the first
        //    real request, mirroring PreviewService's own guarantee.
        let rendererBuilds = 0;
        const renderCalls = [];
        const makeService = () => new LibraryPreviewService({
            createRenderer: () => {
                rendererBuilds += 1;
                return {
                    renderBricks(bricks) {
                        renderCalls.push(bricks);
                        return `fake-image:${bricks.length}`;
                    }
                };
            }
        });

        const brickA = { id: 'core:cube', name: 'Cube' };
        const structureA = { id: 'village:house', name: 'House', bricks: [new Brick({ definitionId: 'core:cube' })] };

        {
            const service = makeService();
            assert(rendererBuilds === 0, 'lazy: constructing the service builds nothing');
            assert(service.getCached('brick:core:cube') === null, 'lazy: nothing cached before any request');

            const { promise } = service.requestBrickPreview(brickA);
            const preview = await promise;
            assert(rendererBuilds === 1, 'lazy: the renderer is built on the first real request');
            assert(preview.type === PreviewType.THUMBNAIL, 'request: resolves a THUMBNAIL preview');
            assert(preview.image === 'fake-image:1', 'request: preview image comes from the fake renderer');

            const cached = service.getCached('brick:core:cube');
            assert(cached === preview, 'cache: a resolved preview is retrievable via getCached() by its own key');
        }

        // 2. Brick and structure previews never collide, even when a
        //    brick definitionId and a structure id happen to share
        //    their raw id string — the kind is part of the key.
        {
            const service = makeService();
            const sharedId = 'shared:id';
            const brick = { id: sharedId, name: 'Shared Brick' };
            const structure = { id: sharedId, name: 'Shared Structure', bricks: [new Brick({ definitionId: 'core:cube' })] };

            const brickResult = await service.requestBrickPreview(brick).promise;
            const structureResult = await service.requestStructurePreview(structure).promise;

            assert(service.getCached('brick:' + sharedId) === brickResult, 'keying: brick preview cached under its own "brick:" key');
            assert(service.getCached('structure:' + sharedId) === structureResult, 'keying: structure preview cached under its own "structure:" key');
            assert(brickResult !== structureResult, 'keying: a shared raw id never reuses the other kind\'s cached preview');
        }

        // 3. A second request for the same key never re-renders.
        {
            let renders = 0;
            const service = new LibraryPreviewService({
                createRenderer: () => ({
                    renderBricks(bricks) {
                        renders += 1;
                        return `fake-image:${bricks.length}`;
                    }
                })
            });
            await service.requestBrickPreview(brickA).promise;
            await service.requestBrickPreview(brickA).promise;
            assert(renders === 1, 'cache: identical requests render exactly once, the second is served from cache');
        }

        // 4. Cancellation removes a waiter before it ever resolves.
        {
            const service = makeService();
            const { promise, cancel } = service.requestStructurePreview(structureA);
            let resolved = false;
            promise.then(() => { resolved = true; });
            cancel();
            // Nothing left to await for a cancelled-before-drain waiter;
            // give the idle-scheduled queue a turn and confirm the
            // cancelled waiter's own promise never settled as a result
            // of this service doing any work for it.
            await new Promise((resolve) => setTimeout(resolve, 20));
            assert(resolved === false, 'cancel: a cancelled request\'s own promise is never resolved by this service');
        }

        // 5. Renderer construction failure degrades to null, once, and
        //    never retries — matching PreviewService's own
        //    "false = attempted and failed, never retry" contract.
        {
            let attempts = 0;
            const service = new LibraryPreviewService({
                createRenderer: () => {
                    attempts += 1;
                    throw new Error('no WebGL here');
                }
            });
            const first = await service.requestBrickPreview(brickA).promise;
            const second = await service.requestBrickPreview({ id: 'core:door', name: 'Door' }).promise;
            assert(first === null, 'renderer failure: first request resolves null, never throws');
            assert(second === null, 'renderer failure: a different key also resolves null');
            assert(attempts === 1, 'renderer failure: construction is attempted exactly once, never retried');
        }

        console.log('✓ Section C: LibraryPreviewService — lazy, cached by kind-qualified key, cancellable, never retries a failed renderer');
    }

    // ---------------------------------------------------------------
    // Section D: every brick and structure renders through the
    // unmodified pipeline (no WebGL — mesh construction only, same
    // boundary tests/ForkableStructureLibrary.test.js's own Section E
    // already draws)
    // ---------------------------------------------------------------
    {
        const brickRegistry = new CreateBrickRegistryUseCase().execute();
        const renderer = new BrickRenderer(brickRegistry);

        for (const definition of brickRegistry.getAll()) {
            const mesh = renderer.createMesh(new Brick({ definitionId: definition.id }));
            assert(mesh !== null && mesh !== undefined, `${definition.id}: a synthetic single-brick preview renders a real mesh`);
        }

        for (const structure of VillageLibrary.structures) {
            for (const brick of structure.bricks) {
                const mesh = renderer.createMesh(brick);
                assert(mesh !== null && mesh !== undefined, `${structure.id}: ${brick.definitionId} renders a real mesh`);
            }
        }

        console.log('✓ Section D: every brick definition and every structure renders through the unmodified BrickRenderer pipeline');
    }

    // ---------------------------------------------------------------
    // Section E: Place vs Fork stay structurally independent
    // ---------------------------------------------------------------
    {
        const brickRegistry = new CreateBrickRegistryUseCase().execute();
        const structureRegistry = new CreateStructureRegistryUseCase().execute();
        const editorContext = new EditorContext();
        const paletteUseCase = new PaletteUseCase(brickRegistry, editorContext);

        const toolBefore = editorContext.tool.activeTool;
        paletteUseCase.selectDefinition('core:door');
        assert(paletteUseCase.getSelectedDefinitionId() === 'core:door', 'select: PaletteUseCase records the new active brick');
        assert(editorContext.tool.activeTool === toolBefore, 'select: selecting a brick never changes the active tool by itself');

        const house = structureRegistry.get('village:house');
        const forkStructureUseCase = new ForkStructureUseCase();
        const session = new EditorSession({
            registry: brickRegistry,
            editorContext,
            toolRegistry: null,
            documentManager: new DocumentManager(),
            selectionUseCase: null,
            previewUseCase: null,
            loadDocumentUseCase: null,
            identityProvider: stubIdentityProvider,
            forkStructureUseCase
        });
        let openedWith = null;
        session.openDocument = (document) => { openedWith = document; };

        const activeBrickBefore = editorContext.activeBrick.definitionId;
        const toolBeforeFork = editorContext.tool.activeTool;
        const result = session.forkStructure(house);

        assert(result === true, 'fork: forking a structure succeeds');
        assert(openedWith.metadata.parentStructureId === 'village:house', 'fork: opens a new Document carrying provenance');
        assert(editorContext.activeBrick.definitionId === activeBrickBefore,
            'fork: forking a structure never touches the active brick selection');
        assert(editorContext.tool.activeTool === toolBeforeFork,
            'fork: forking a structure never touches the active tool by itself');

        console.log('✓ Section E: selecting a brick and forking a structure are structurally independent actions');
    }

    console.log('✓ All BuildLibraryUX tests passed');
}

// tests.html's `await import(file)` only reliably waits for a module's
// synchronous top-level evaluation — see every other test file's own
// closing comment on this — so this is invoked with top-level await,
// never fire-and-forget.
await run();
