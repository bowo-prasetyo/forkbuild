// Per-row Move and Remove in the Own Publication panel's Placements list: a
// Publication placed several times is acted on one copy at a time, by
// placementId, never through "the latest placement of this document".
import OwnPublicationPanel from '../ui/components/OwnPublicationPanel.js';
import { WorldNavigationSession } from '../application/world/WorldNavigationSession.js';
import { MoveWorldPlacementUseCase } from '../application/placement/MoveWorldPlacementUseCase.js';
import { RemoveWorldPlacementUseCase } from '../application/placement/RemoveWorldPlacementUseCase.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { WorldPlacement } from '../core/WorldPlacement.js';
import { PlacementRecord } from '../core/PlacementRecord.js';
import { Position } from '../core/Position.js';
import { assert } from './support/Assert.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';

function makeBackend() {
    const storage = new InMemoryStorageProvider();
    const spatialIndexProvider = new LocalSpatialIndexProvider(storage);
    const placementRegistry = new LocalPlacementRegistry(storage, spatialIndexProvider);
    const session = new WorldNavigationSession({
        registry: { getDocument: () => null },
        loadPublicationDocumentUseCase: { execute: () => null },
        worldLayoutProvider: { getSpatialState: () => ({ loaded: [], visible: [] }) },
        placementRegistry,
        moveWorldPlacementUseCase: new MoveWorldPlacementUseCase(spatialIndexProvider, placementRegistry),
        removeWorldPlacementUseCase: new RemoveWorldPlacementUseCase(spatialIndexProvider, placementRegistry)
    });
    const place = (publicationId, x, owner = null) => {
        const placement = new WorldPlacement({ publicationId, position: new Position(x, 0, 0) });
        spatialIndexProvider.add(placement);
        placementRegistry.add(new PlacementRecord({ placementId: placement.id, publicationId, owner, position: new Position(x, 0, 0) }));
        return placement.id;
    };
    return { session, placementRegistry, place };
}

// Section A — the session acts on exactly the chosen copy.
{
    const { session, place } = makeBackend();
    const first = place('pub-a', 10);
    const second = place('pub-a', 20);
    const third = place('pub-a', 30);

    session.movePublicationPlacement('pub-a', second, { x: 25, y: 0, z: 5 });
    const byId = new Map(session.getPlacementsForPublication('pub-a').map((p) => [p.placementId, p]));
    assert(byId.get(second).position.x === 25 && byId.get(second).position.z === 5, 'A1. the chosen copy moved');
    assert(byId.get(second).revision === 2, 'A2. moving makes a new revision of that copy');
    assert(byId.get(first).position.x === 10 && byId.get(third).position.x === 30, 'A3. the other placements are untouched');

    session.removePublicationPlacement('pub-a', first);
    const remaining = session.getPlacementsForPublication('pub-a').map((p) => p.placementId).sort();
    assert(JSON.stringify(remaining) === JSON.stringify([second, third].sort()), 'A4. only the chosen copy is removed');

    let threw = null;
    try { session.removePublicationPlacement('pub-a', first); } catch (e) { threw = e; }
    assert(threw && /no longer exists/.test(threw.message), 'A5. a stale row (already removed) refuses rather than acting on another placement');

    const other = place('pub-b', 40);
    threw = null;
    try { session.movePublicationPlacement('pub-a', other, { x: 0, y: 0, z: 0 }); } catch (e) { threw = e; }
    assert(threw, 'A6. a placement of a different Publication is never reachable through this one');

    const check = session.checkPublicationPlacementOverlap('pub-a', second, { x: 30, y: 0, z: 0 });
    assert(check && check.overlap && check.overlap.count === 1, 'A7. the overlap pre-flight sees the sibling copy at the destination');
    const self = session.checkPublicationPlacementOverlap('pub-a', second, { x: 25, y: 0, z: 5 });
    assert(self.overlap.count === 0, 'A8. a copy never overlaps itself');
    console.log('✓ A — the session moves and removes exactly the chosen copy, by placementId');
}

// Section B — the panel's row methods: ownership gates, two-step Remove.
{
    const calls = [];
    const refreshes = [];
    const ctx = {
        pendingRemovalPlacementId: null,
        movePlacementCommand: (p) => calls.push(['move', p.placementId]),
        removePlacementCommand: (p) => calls.push(['remove', p.placementId]),
        refreshPublicationPlacements: () => refreshes.push(true),
        ...Object.fromEntries(['movePublicationPlacement', 'requestPlacementRemoval', 'confirmPlacementRemoval']
            .map((name) => [name, OwnPublicationPanel.methods[name]]))
    };
    const mine = { placementId: 'p-mine', movable: true, removable: true };
    const theirs = { placementId: 'p-theirs', movable: false, removable: false };

    ctx.movePublicationPlacement(theirs);
    ctx.requestPlacementRemoval(theirs);
    assert(calls.length === 0 && ctx.pendingRemovalPlacementId === null, 'B1. someone else\'s copy can be neither moved nor removed from here');

    ctx.requestPlacementRemoval(mine);
    assert(calls.length === 0 && ctx.pendingRemovalPlacementId === 'p-mine', 'B2. the first Remove click only asks');
    ctx.movePublicationPlacement(mine);
    assert(ctx.pendingRemovalPlacementId === null && calls[0][0] === 'move', 'B3. Move opens the mover and drops a pending removal');

    ctx.requestPlacementRemoval(mine);
    ctx.confirmPlacementRemoval(mine);
    assert(calls[1][0] === 'remove' && calls[1][1] === 'p-mine', 'B4. confirming removes that copy');
    assert(ctx.pendingRemovalPlacementId === null && refreshes.length === 1, 'B5. the confirmation closes and the list re-reads');
    console.log('✓ B — row Move/Remove honor ownership, and Remove asks once before acting');
}

// Section C — World View's Move dialog routes a row's target (no documentId)
// through the placement-id methods, and bumps the list's revision.
{
    const { useOwnPublicationActions } = await import('../ui/views/worldView/useOwnPublicationActions.js');
    const calls = [];
    const session = {
        checkPublicationPlacementOverlap: (...args) => { calls.push(['check', ...args]); return { allowed: true, requiresConfirmation: false }; },
        movePublicationPlacement: (...args) => calls.push(['move', ...args]),
        removePublicationPlacement: (...args) => calls.push(['remove', ...args]),
        checkPlacementOverlap: () => { throw new Error('documentId path must not be used for a row'); },
        movePlacement: () => { throw new Error('documentId path must not be used for a row'); }
    };
    const actions = useOwnPublicationActions({
        feedback: { show: () => {} },
        guarded: (fn) => fn(),
        placementEditTarget: { value: null },
        placementOverlapWarning: { value: null },
        refreshSpatialUI: () => {},
        session,
        showPlacementEditor: { value: false }
    });
    const row = { publicationId: 'pub-c', placementId: 'p-2', position: { x: 1, y: 0, z: 1 }, movable: true, removable: true };

    actions.openPlacementEditor(row);
    actions.onMovePlacement({ x: 5, y: 0, z: 5 });
    assert(JSON.stringify(calls.map((c) => c.slice(0, 3))) === JSON.stringify([['check', 'pub-c', 'p-2'], ['move', 'pub-c', 'p-2']]),
        `C1. a row's move is checked and applied by placementId — got ${JSON.stringify(calls)}`);
    assert(actions.placementsRevision.value === 1, 'C2. a finished move bumps the Placements list revision');

    actions.removePublicationPlacement(row);
    assert(calls[2][0] === 'remove' && calls[2][2] === 'p-2', 'C3. a row\'s Remove removes that placementId');
    assert(actions.placementsRevision.value === 2, 'C4. a removal bumps the revision too');
    console.log('✓ C — World View acts on a row\'s own placement and refreshes the list');
}
