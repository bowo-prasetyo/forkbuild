import { WorldNavigationSession } from '../application/world/WorldNavigationSession.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { PLAZA_CENTER } from '../core/ChallengePlaza.js';
import { PLAZA_QUIET_RADIUS } from '../core/PlazaEntrySpots.js';
import { settleInVillage } from '../core/BuildSettlement.js';
import { computeDeterministicGridPosition } from '../core/DeterministicGridPlacement.js';
import { STREAMING_RADIUS } from '../application/worldNavigation/constants.js';
import { WorldPosition } from '../core/WorldPosition.js';
import { assert } from './support/Assert.js';

// While a week's plaza is visited, only that week's entries stand round the
// square: placed builds near it from other weeks (placed there while builds
// still settled round the plaza) are left out of World View, on screen only,
// and stream in again once the visitor leaves (session.setPlazaQuiet(),
// core/PlazaEntrySpots.js).

const positions = {
    'doc-this-week': settleInVillage({ publicationId: 'pub-this-week' }),
    'doc-last-week': { x: PLAZA_CENTER.x, y: 0, z: PLAZA_CENTER.z + 78 },
    'doc-far': { x: PLAZA_CENTER.x + PLAZA_QUIET_RADIUS + 30, y: 0, z: PLAZA_CENTER.z },
    'doc-grid': computeDeterministicGridPosition('pub-grid')
};

function session() {
    return new WorldNavigationSession({
        registry: new CreateBrickRegistryUseCase().execute(),
        loadPublicationDocumentUseCase: null,
        worldLayoutProvider: {
            findVisibleDocuments: () => Object.keys(positions),
            getPosition: (id) => {
                const p = positions[id];
                return new WorldPosition(p.x, p.y || 0, p.z);
            }
        }
    });
}

const quiet = { center: PLAZA_CENTER, radius: PLAZA_QUIET_RADIUS, keep: ['doc-this-week'] };

{
    assert(PLAZA_QUIET_RADIUS === STREAMING_RADIUS, 'a camera in the square sees none of the builds left out');
    // The grid covers x, z >= 0 (core/DeterministicGridPlacement.js).
    assert(-PLAZA_CENTER.x > PLAZA_QUIET_RADIUS, `no grid spot is near enough to be left out (the grid starts ${-PLAZA_CENTER.x} off)`);
    console.log('✓ the square is quiet as far as World View streams, and never reaches the grid');
}

{
    const s = session();
    const all = s._findVisibleDocuments(PLAZA_CENTER, STREAMING_RADIUS);
    assert(all.length === 4, 'outside a plaza every placed build streams in');

    s.setPlazaQuiet(quiet);
    const visible = s._findVisibleDocuments(PLAZA_CENTER, STREAMING_RADIUS);
    assert(visible.includes('doc-this-week'), 'the week\'s entry placed round the square still stands there');
    assert(!visible.includes('doc-last-week'), 'another week\'s build placed round the square is left out');
    assert(visible.includes('doc-far') && visible.includes('doc-grid'), 'builds further off are untouched');

    s.setPlazaQuiet(null);
    assert(s._findVisibleDocuments(PLAZA_CENTER, STREAMING_RADIUS).length === 4, 'once the visitor leaves, every build streams in again');
    console.log('✓ while a plaza is visited, only its week\'s builds stand round the square; leaving brings the rest back');
}

{
    const s = session();
    s._localOnlyDocumentIds.add('doc-last-week');
    s.setPlazaQuiet(quiet);
    assert(s._findVisibleDocuments(PLAZA_CENTER, STREAMING_RADIUS).includes('doc-last-week'), 'a build the visitor is working on is never left out');
    s.setPlazaQuiet({ center: PLAZA_CENTER, radius: NaN });
    assert(s._plazaQuiet === null, 'a malformed request leaves nothing out');
    console.log('✓ what the visitor is working on is never left out');
}
