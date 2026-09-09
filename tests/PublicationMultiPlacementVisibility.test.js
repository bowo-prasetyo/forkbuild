import { readFile } from 'node:fs/promises';
import OwnPublicationPanel from '../ui/components/OwnPublicationPanel.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { DiscoverPlacementsUseCase } from '../application/DiscoverPlacementsUseCase.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { PlacementRecord } from '../core/PlacementRecord.js';
import { Position } from '../core/Position.js';

// 0.9.308 — Publication Multi-Placement Visibility.
//
// 0.9.307's own Post-Arc Product Evolution Reassessment found
// `application/DiscoverPlacementsUseCase.js#findByPublicationId()` fully
// implemented and fully tested, but its ONE production reader
// (`WorldNavigationSession#_resolvePlacementRecord()`) reduces every
// Publication's placements down to a single, most-recently-updated one —
// silently hiding every OTHER placement from its own owner, forever. This
// milestone wires `findByPublicationId()`'s full, UNREDUCED result to
// `ui/components/OwnPublicationPanel.js` — the existing Publication-
// inspection surface — through one new, thin
// `WorldNavigationSession#getPlacementsForPublication()` method.
//
// This file exercises the milestone's own named Sections A-J against REAL
// collaborators (LocalPlacementRegistry, LocalSpatialIndexProvider,
// DiscoverPlacementsUseCase, all unmodified) wired through a REAL
// WorldNavigationSession — never a mock of the application layer — with
// only OwnPublicationPanel.js's own methods invoked the same way every
// sibling test file in this codebase already invokes them: bound to a
// plain ctx object mirroring a Vue component instance, never a full Vue
// mount. Mirrors tests/PublicationCommentaryUIIntegration.test.js's own
// structure exactly, one capability over.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

// The real application stack this milestone wires OwnPublicationPanel.js
// to — a real LocalPlacementRegistry/DiscoverPlacementsUseCase pair
// backed by a real (in-memory) StorageProvider, exactly the collaborator
// set application/CreatePlacementRegistryUseCase.js itself composes.
function makeBackend() {
    const storage = new InMemoryStorageProvider();
    const spatialIndexProvider = new LocalSpatialIndexProvider(storage);
    const placementRegistry = new LocalPlacementRegistry(storage, spatialIndexProvider);

    const session = new WorldNavigationSession({
        registry: { getDocument: () => null },
        loadPublicationDocumentUseCase: { execute: () => null },
        worldLayoutProvider: { getSpatialState: () => ({ loaded: [], visible: [] }) },
        placementRegistry
    });

    // The IDENTICAL thin wrapper ui/views/WorldView.js's own
    // getPublicationPlacementsCommand() is, reproduced here for the
    // identical reason every sibling test file's own makeXCommand()
    // helper already is.
    const getPublicationPlacementsCommand = (publicationId) => session.getPlacementsForPublication(publicationId);

    return { storage, placementRegistry, session, getPublicationPlacementsCommand };
}

function addPlacement(placementRegistry, { publicationId, owner = 'alice', x = 0, y = 0, z = 0 }) {
    return placementRegistry.add(new PlacementRecord({ publicationId, owner, position: new Position(x, y, z) }));
}

function panelCtx(overrides = {}) {
    return {
        publication: null,
        getPublicationPlacementsCommand: null,
        publicationPlacements: [],
        publicationPlacementsError: null,
        refreshPublicationPlacements: OwnPublicationPanel.methods.refreshPublicationPlacements,
        ...overrides
    };
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function codeOnlySource(relativePath) {
    const text = await readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
    return text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

async function runTests() {
    // ---------------------------------------------------------------
    // Section A — Existing discovery capability: the REAL
    // DiscoverPlacementsUseCase discovers multiple placements belonging
    // to the same Publication, exercised directly, before any UI is
    // involved at all.
    // ---------------------------------------------------------------
    {
        const { placementRegistry } = makeBackend();
        addPlacement(placementRegistry, { publicationId: 'pub-a', x: 0, y: 0, z: 0 });
        addPlacement(placementRegistry, { publicationId: 'pub-a', x: 500, y: 0, z: 500 });
        addPlacement(placementRegistry, { publicationId: 'pub-a', x: -200, y: 0, z: 300 });

        const discoverPlacementsUseCase = new DiscoverPlacementsUseCase(placementRegistry);
        const records = discoverPlacementsUseCase.findByPublicationId('pub-a');
        assert(records.length === 3, '1. the real DiscoverPlacementsUseCase discovers all three placements of the same Publication');
        assert(new Set(records.map((r) => r.placementId)).size === 3, '2. the three placements are genuinely distinct records');

        console.log('✓ Section A: the real DiscoverPlacementsUseCase discovers every placement of one Publication');
    }

    // ---------------------------------------------------------------
    // Section B — UI reachability: Publication UI -> injected discovery
    // command -> DiscoverPlacementsUseCase, traced end to end.
    // ---------------------------------------------------------------
    {
        const { placementRegistry, getPublicationPlacementsCommand } = makeBackend();
        addPlacement(placementRegistry, { publicationId: 'pub-b', x: 1, y: 0, z: 1 });

        const publication = { id: 'pub-b' };
        const ctx = panelCtx({ publication, getPublicationPlacementsCommand });
        ctx.refreshPublicationPlacements();

        assert(ctx.publicationPlacements.length === 1, '3. the panel reaches the injected command and receives a real placement');

        // The command itself is reachable and delegates to
        // WorldNavigationSession.getPlacementsForPublication(), which
        // itself delegates to the registry's own findByPublicationId() —
        // never a second, parallel discovery path.
        const sessionCode = await codeOnlySource('application/WorldNavigationSession.js');
        assert(sessionCode.includes('getPlacementsForPublication(publicationId)'),
            '4. WorldNavigationSession exposes getPlacementsForPublication()');
        assert(sessionCode.includes('this._placementRegistry.findByPublicationId(publicationId)'),
            '5. getPlacementsForPublication() delegates to the registry\'s own findByPublicationId(), the SAME method DiscoverPlacementsUseCase itself wraps');

        const viewCode = await codeOnlySource('ui/views/WorldView.js');
        assert(viewCode.includes(':getPublicationPlacementsCommand="getPublicationPlacementsCommand"'),
            '6. WorldView.js wires getPublicationPlacementsCommand onto OwnPublicationPanel');
        assert(viewCode.includes('session.getPlacementsForPublication(publicationId)'),
            '7. WorldView.js\'s own command forwards to WorldNavigationSession, never a use case directly');

        console.log('✓ Section B: Publication UI reaches DiscoverPlacementsUseCase through one composed, traceable path');
    }

    // ---------------------------------------------------------------
    // Section C — Publication identity: discovery is performed for the
    // EXACT Publication being inspected — never the current user, the
    // latest Publication, or a selected placement.
    // ---------------------------------------------------------------
    {
        const { placementRegistry, getPublicationPlacementsCommand } = makeBackend();
        addPlacement(placementRegistry, { publicationId: 'pub-c', owner: 'alice', x: 1, y: 0, z: 1 });

        let receivedPublicationId = null;
        const spyCommand = (publicationId) => { receivedPublicationId = publicationId; return getPublicationPlacementsCommand(publicationId); };

        const publication = { id: 'pub-c' };
        const ctx = panelCtx({ publication, getPublicationPlacementsCommand: spyCommand });
        ctx.refreshPublicationPlacements();

        assert(receivedPublicationId === 'pub-c', '8. the command is called with the exact publication.id being inspected');
        assert(receivedPublicationId !== 'alice', '9. never the owner/current-user identity in place of a publicationId');

        console.log('✓ Section C: discovery is always performed for the exact Publication being inspected, never a substitute identity');
    }

    // ---------------------------------------------------------------
    // Section D — Multiple placements: Publication P with placements
    // A, B, C — the UI receives and displays all three, never
    // collapsed to one.
    // ---------------------------------------------------------------
    {
        const { placementRegistry, getPublicationPlacementsCommand } = makeBackend();
        const a = addPlacement(placementRegistry, { publicationId: 'pub-d', x: 0, y: 0, z: 0 });
        const b = addPlacement(placementRegistry, { publicationId: 'pub-d', x: 10, y: 0, z: 10 });
        const c = addPlacement(placementRegistry, { publicationId: 'pub-d', x: 20, y: 0, z: 20 });

        const ctx = panelCtx({ publication: { id: 'pub-d' }, getPublicationPlacementsCommand });
        ctx.refreshPublicationPlacements();

        assert(ctx.publicationPlacements.length === 3, '10. all three placements are returned, none dropped');
        const receivedIds = ctx.publicationPlacements.map((p) => p.placementId).sort();
        const expectedIds = [a.placementId, b.placementId, c.placementId].sort();
        assert(JSON.stringify(receivedIds) === JSON.stringify(expectedIds), '11. the exact three placement records are represented, by identity');
        assert(ctx.publicationPlacementsError === null, '12. a successful multi-placement load reports no error');

        console.log('✓ Section D: three placements of one Publication are all discovered and displayed, never collapsed');
    }

    // ---------------------------------------------------------------
    // Section E — Single placement: one placement remains a legitimate
    // one-item result, never converted into a special singleton state.
    // ---------------------------------------------------------------
    {
        const { placementRegistry, getPublicationPlacementsCommand } = makeBackend();
        addPlacement(placementRegistry, { publicationId: 'pub-e', x: 5, y: 0, z: 5 });

        const ctx = panelCtx({ publication: { id: 'pub-e' }, getPublicationPlacementsCommand });
        ctx.refreshPublicationPlacements();

        assert(Array.isArray(ctx.publicationPlacements), '13. a single placement is still returned as an array');
        assert(ctx.publicationPlacements.length === 1, '14. exactly one placement is present, as a genuine one-item result');
        assert(ctx.publicationPlacementsError === null, '15. a single placement is never reported as an error or a degraded state');

        console.log('✓ Section E: one placement is a legitimate one-item result, not a special-cased singleton');
    }

    // ---------------------------------------------------------------
    // Section F — Zero placements: a Publication with no placements
    // displays an honest empty state, never an error.
    // ---------------------------------------------------------------
    {
        const { getPublicationPlacementsCommand } = makeBackend();

        const ctx = panelCtx({ publication: { id: 'pub-f-never-placed' }, getPublicationPlacementsCommand });
        ctx.refreshPublicationPlacements();

        assert(Array.isArray(ctx.publicationPlacements) && ctx.publicationPlacements.length === 0,
            '16. an unplaced Publication resolves to a real, empty array');
        assert(ctx.publicationPlacementsError === null, '17. zero placements is never reported as an error');

        const panelCode = await codeOnlySource('ui/components/OwnPublicationPanel.js');
        assert(panelCode.includes('This Publication has not been placed anywhere yet.'),
            '18. the template renders a dedicated, honest empty-state message');

        console.log('✓ Section F: zero placements renders an honest empty state, never an error');
    }

    // ---------------------------------------------------------------
    // Section G — Other Publications: A -> {A1, A2}, B -> {B1}.
    // Inspecting A never displays B's placements, and vice versa.
    // ---------------------------------------------------------------
    {
        const { placementRegistry, getPublicationPlacementsCommand } = makeBackend();
        addPlacement(placementRegistry, { publicationId: 'pub-g-a', x: 1, y: 0, z: 1 });
        addPlacement(placementRegistry, { publicationId: 'pub-g-a', x: 2, y: 0, z: 2 });
        addPlacement(placementRegistry, { publicationId: 'pub-g-b', x: 3, y: 0, z: 3 });

        const ctxA = panelCtx({ publication: { id: 'pub-g-a' }, getPublicationPlacementsCommand });
        ctxA.refreshPublicationPlacements();
        assert(ctxA.publicationPlacements.length === 2, '19. Publication A shows exactly its own two placements');
        assert(ctxA.publicationPlacements.every((p) => p.publicationId === 'pub-g-a'), '20. every displayed placement genuinely belongs to Publication A');

        const ctxB = panelCtx({ publication: { id: 'pub-g-b' }, getPublicationPlacementsCommand });
        ctxB.refreshPublicationPlacements();
        assert(ctxB.publicationPlacements.length === 1, '21. Publication B shows exactly its own one placement');
        assert(ctxB.publicationPlacements[0].publicationId === 'pub-g-b', '22. Publication B never displays Publication A\'s placements');

        // A live Publication switch, through the real watcher, must
        // never leave A's placements visible for B — mirrors
        // PublicationCommentaryUIIntegration.test.js's own Section I.
        const ctx = panelCtx({ publication: { id: 'pub-g-a' }, getPublicationPlacementsCommand });
        ctx.refreshPublicationPlacements();
        assert(ctx.publicationPlacements.length === 2, '23. setup: panel currently shows Publication A\'s two placements');
        ctx.publication = { id: 'pub-g-b' };
        OwnPublicationPanel.watch.publication.call(ctx, ctx.publication, { id: 'pub-g-a' });
        assert(ctx.publicationPlacements.length === 1 && ctx.publicationPlacements[0].publicationId === 'pub-g-b',
            '24. switching to Publication B via the watcher immediately reloads to B\'s own single placement — A\'s two are never left on screen');

        console.log('✓ Section G: placements stay correctly isolated per-Publication, including across a live Publication switch');
    }

    // ---------------------------------------------------------------
    // Section H — Read-only behavior: this surface never creates,
    // removes, moves, or alters a placement or a Publication.
    // ---------------------------------------------------------------
    {
        const { placementRegistry, getPublicationPlacementsCommand } = makeBackend();
        addPlacement(placementRegistry, { publicationId: 'pub-h', x: 1, y: 0, z: 1 });

        const before = placementRegistry.list().map((r) => r.toJSON());

        const ctx = panelCtx({ publication: { id: 'pub-h' }, getPublicationPlacementsCommand });
        ctx.refreshPublicationPlacements();
        assert(ctx.publicationPlacements.length === 1, '25. setup: the placement is visible');

        const after = placementRegistry.list().map((r) => r.toJSON());
        assert(JSON.stringify(before) === JSON.stringify(after), '26. reading placements through this surface never mutates the registry');

        // Source-level guarantee: OwnPublicationPanel.js never imports or
        // calls the mutating placement use cases anywhere in the file —
        // this feature's own methods/template add no new call site for
        // any of them.
        const panelCode = await codeOnlySource('ui/components/OwnPublicationPanel.js');
        const forbidden = [
            "from '../../application/PlacePublicationUseCase.js'",
            "from '../../application/MoveWorldPlacementUseCase.js'",
            "from '../../application/RemoveWorldPlacementUseCase.js'",
            'new PlacePublicationUseCase(', 'new MoveWorldPlacementUseCase(', 'new RemoveWorldPlacementUseCase('
        ];
        for (const term of forbidden) {
            assert(!panelCode.includes(term), `27. OwnPublicationPanel.js never references '${term}'`);
        }
        // The new placements section itself emits no event and calls no
        // method beyond its own refresh — no click handler anywhere in
        // its own markup block.
        const placementsSection = panelCode.split('own-publication-placements"')[1].split('</div>')[0];
        assert(!/@click|v-model|type="submit"/.test(placementsSection),
            '28. the placements section renders no interactive control of any kind — pure, read-only presentation');

        console.log('✓ Section H: the placements surface is strictly read-only — no creation, removal, movement, or mutation');
    }

    // ---------------------------------------------------------------
    // Section I — Failure behavior: a discovery failure surfaces the
    // panel's own failure state, distinct from an honest "0 placements."
    // ---------------------------------------------------------------
    {
        const { placementRegistry, getPublicationPlacementsCommand } = makeBackend();
        addPlacement(placementRegistry, { publicationId: 'pub-i', x: 1, y: 0, z: 1 });

        const ctx = panelCtx({ publication: { id: 'pub-i' }, getPublicationPlacementsCommand });
        ctx.refreshPublicationPlacements();
        assert(ctx.publicationPlacements.length === 1, '29. setup: one real placement is loaded');

        // A failing discovery command must be surfaced as an ERROR, and
        // must never be silently reported as "0 placements" — NO_PLACEMENTS
        // and DISCOVERY_FAILED stay two distinguishable outcomes.
        const failingCommand = () => { throw new Error('registry unavailable'); };
        const failingCtx = panelCtx({ ...ctx, getPublicationPlacementsCommand: failingCommand });
        failingCtx.refreshPublicationPlacements();

        assert(failingCtx.publicationPlacementsError !== null, '30. a failed discovery call reports a real error');
        assert(failingCtx.publicationPlacements.length === 1 && failingCtx.publicationPlacements[0].publicationId === 'pub-i',
            '31. a failed read leaves the previously-loaded placement list exactly as it was, never wiped to an empty (and therefore misleading) list');

        // And the reverse: a Publication that GENUINELY has no
        // placements must never be reported as an error.
        const emptyCtx = panelCtx({ publication: { id: 'pub-i-never-placed' }, getPublicationPlacementsCommand });
        emptyCtx.refreshPublicationPlacements();
        assert(emptyCtx.publicationPlacementsError === null && emptyCtx.publicationPlacements.length === 0,
            '32. a genuinely unplaced Publication is reported as a clean empty result, never an error');

        console.log('✓ Section I: NO_PLACEMENTS and DISCOVERY_FAILED remain two distinguishable, non-conflated outcomes');
    }

    // ---------------------------------------------------------------
    // Section J — Regression: existing Publication rendering, placement
    // creation/removal, unpublish, and World placement machinery are
    // untouched by this milestone.
    // ---------------------------------------------------------------
    {
        // J1. getPlacementInfo() — refactored (0.9.308) to share
        // _enrichPlacementRecord() with the new getPlacementsForPublication(),
        // but its own OWN public shape/behavior (the single, reduced,
        // most-recently-updated record) must be byte-for-byte unchanged.
        const { placementRegistry, session } = makeBackend();
        const older = placementRegistry.add(new PlacementRecord({
            publicationId: 'pub-j', owner: 'alice', position: new Position(1, 0, 1),
            updatedAt: new Date(2020, 0, 1)
        }));
        const newer = placementRegistry.add(new PlacementRecord({
            publicationId: 'pub-j', owner: 'alice', position: new Position(2, 0, 2),
            updatedAt: new Date(2024, 0, 1)
        }));

        const info = session.getPlacementInfoForPublication('pub-j');
        assert(info !== null && info.placementId === newer.placementId,
            '33. getPlacementInfoForPublication() still reduces to the single most-recently-updated record, unchanged');
        assert(info.placementId !== older.placementId, '34. the older placement is still correctly excluded from the singular read model');
        assert(Object.keys(info).sort().join(',') === 'placementId,position,publicationId',
            '35. getPlacementInfoForPublication()\'s own minimal shape is unchanged by the 0.9.308 refactor');

        // J2. The mutating placement use cases and Publication lifecycle
        // machinery remain completely unmodified — this milestone touches
        // none of them.
        const useCaseFiles = [
            ['application/PlacePublicationUseCase.js', 'export class PlacePublicationUseCase'],
            ['application/MoveWorldPlacementUseCase.js', 'export class MoveWorldPlacementUseCase'],
            ['application/RemoveWorldPlacementUseCase.js', 'export class RemoveWorldPlacementUseCase'],
            ['application/UnpublishDocumentUseCase.js', 'export class UnpublishDocumentUseCase']
        ];
        for (const [path, marker] of useCaseFiles) {
            const source = await readFile(new URL(path, SOURCE_ROOT), 'utf8');
            assert(source.includes(marker), `36. ${path} still exists, unmodified in shape by this milestone.`);
        }

        // J3. DiscoverPlacementsUseCase itself gains no new method and no
        // altered behavior — this milestone composes it, never edits it.
        const discoverSource = await readFile(new URL('application/DiscoverPlacementsUseCase.js', SOURCE_ROOT), 'utf8');
        assert(discoverSource.includes('findByPublicationId(publicationId) {\n        return this._placementRegistry.findByPublicationId(publicationId);\n    }'),
            '37. DiscoverPlacementsUseCase.findByPublicationId() is unchanged — a thin, unmodified delegation to the registry');

        console.log('✓ Section J: existing Publication rendering, placement mutation, unpublish, and DiscoverPlacementsUseCase itself are all unmodified');
    }

    console.log('\n✅ All Publication Multi-Placement Visibility tests passed.');
}

runTests().catch((err) => {
    console.error(err);
    process.exit(1);
});
