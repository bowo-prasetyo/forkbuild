// A World link (/world/:documentId) to a build this device can't place
// anywhere: World View only ever streams in placed builds, so it asks
// isDocumentPlaced() first and says the build isn't here instead of waiting
// for ever (and recording a World visited). LocalWorldLayoutProvider's
// getPosition() gives an unplaced build the origin, so hasPosition() is what
// tells the two apart.
import { Position } from '../core/document/Position.js';
import { WorldPlacement } from '../core/publication/WorldPlacement.js';
import { computeDeterministicGridPosition } from '../core/world/DeterministicGridPlacement.js';
import { LocalWorldLayoutProvider } from '../world-layout/LocalWorldLayoutProvider.js';
import { WorldLayoutProvider } from '../world-layout/WorldLayoutProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { Publication } from '../publisher/Publication.js';
import { stateQueryMethods } from '../application/worldNavigation/stateQueryMethods.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

function layoutWith(publications, placements = []) {
    const storage = new InMemoryStorageProvider();
    storage.save('forkbuild-publications', publications.map((publication) => publication.toJSON()));
    const spatial = new LocalSpatialIndexProvider(storage);
    for (const placement of placements) spatial.add(placement);
    return new LocalWorldLayoutProvider(spatial, new LocalDiscoveryProvider(storage));
}

{
    const harbor = new Publication({ id: 'harbor-pub', documentId: 'harbor-doc', title: 'Harbor', author: 'alice' });
    const castle = new Publication({ id: 'castle-pub', documentId: 'castle-doc', title: 'Castle', author: 'alice' });
    const layout = layoutWith([harbor, castle], [new WorldPlacement({ publicationId: 'castle-pub', position: new Position(500, 0, -200) })]);

    assert(layout.hasPosition('castle-doc'), 'a build with a placement has a position');
    const castleAt = layout.getPosition('castle-doc');
    assert(castleAt.x === 500 && castleAt.z === -200, 'at its placement');
    assert(layout.hasPosition('harbor-doc'), 'a published build with no placement has one on the grid');
    const grid = computeDeterministicGridPosition('harbor-pub');
    const harborAt = layout.getPosition('harbor-doc');
    assert(harborAt.x === grid.x && harborAt.z === grid.z, 'its grid position, unchanged');

    assert(!layout.hasPosition('no-such-doc'), 'a build nobody published here has no position');
    const fallback = layout.getPosition('no-such-doc');
    assert(fallback.x === 0 && fallback.y === 0 && fallback.z === 0, 'though getPosition() still gives it the origin, as before');
    console.log('✓ the layout tells a placed build from one it only gives the origin');
}

// A provider that can't tell says every build it gives a position is placed.
{
    class Fixed extends WorldLayoutProvider {
        getPosition(documentId) { return documentId === 'known' ? new Position(1, 0, 1) : null; }
    }
    const layout = new Fixed();
    assert(layout.hasPosition('known') && !layout.hasPosition('other'), 'the base hasPosition() follows getPosition()');
    console.log('✓ a layout provider without its own hasPosition() answers from getPosition()');
}

// World View's question, as the session answers it.
{
    const layout = layoutWith([new Publication({ id: 'mill-pub', documentId: 'mill-doc', title: 'Mill', author: 'alice' })]);
    const session = Object.assign(Object.create(stateQueryMethods), {
        _loadedDocuments: new Map([['loaded-doc', {}]]),
        _localPositions: new Map([['forked-doc', new Position(3, 0, 3)]]),
        _worldLayoutProvider: layout
    });
    assert(session.isDocumentPlaced('mill-doc'), 'a published build is placed');
    assert(session.isDocumentPlaced('loaded-doc'), 'so is one already loaded');
    assert(session.isDocumentPlaced('forked-doc'), 'and a copy made here, placed beside its original');
    assert(!session.isDocumentPlaced('zz-bogus-id-123'), 'a link to anything else is not');
    assert(!session.isDocumentPlaced(null) && !session.isDocumentPlaced(''), 'nor is no build at all');

    // Test doubles for the layout that predate hasPosition().
    const legacy = Object.assign(Object.create(stateQueryMethods), {
        _loadedDocuments: new Map(),
        _localPositions: new Map(),
        _worldLayoutProvider: { getPosition: (id) => (id === 'placed' ? { x: 0, y: 0, z: 0 } : null) }
    });
    assert(legacy.isDocumentPlaced('placed') && !legacy.isDocumentPlaced('elsewhere'), 'a layout with only getPosition() is asked that');
    console.log('✓ World View can tell a link to a build it can show from one it never could');
}
