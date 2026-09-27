// World View's "Place Copy Here": each click adds another copy at "here", but a
// click where a copy of this Publication already sits is refused, so repeated
// clicks without moving never stack duplicates on one spot.
import { useOwnPublicationActions } from '../ui/views/worldView/useOwnPublicationActions.js';

function assert(condition, message) {
    if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function harness({ avatar = null, camera = null } = {}) {
    const placements = [];
    const messages = [];
    const session = {
        getAvatarPosition: () => avatar,
        getCameraPosition: () => camera,
        getPlacementsForPublication: (publicationId) => placements.filter((p) => p.publicationId === publicationId),
        placePublication: (publicationId, position) => {
            placements.push({ placementId: `pl-${placements.length + 1}`, publicationId, position: { ...position } });
        }
    };
    const actions = useOwnPublicationActions({
        feedback: { show: (message) => messages.push(message) },
        guarded: (fn) => fn(),
        placementEditTarget: { value: null },
        placementOverlapWarning: { value: null },
        refreshSpatialUI: () => {},
        session,
        showPlacementEditor: { value: false }
    });
    return { actions, placements, messages, move(position) { avatar = position; } };
}

const publication = { id: 'pub-1' };

{
    const h = harness({ avatar: { x: 1095, y: 0, z: 2455 } });
    h.actions.placeOwnPublication(publication);
    assert(h.placements.length === 1, 'the first click places a copy');
    assert(h.messages[0] === 'Copy placed at 1095.0, 0.0, 2455.0 (1 placement now)',
        `the confirmation names where and how many — got "${h.messages[0]}"`);

    h.actions.placeOwnPublication(publication);
    h.actions.placeOwnPublication(publication);
    assert(h.placements.length === 1, 'repeated clicks on the same spot place nothing more');
    assert(/already placed here/.test(h.messages[1]) && /Move Placement/.test(h.messages[1]),
        'a refused click says why and points at Move Placement');

    h.move({ x: 1200, y: 0, z: 2455 });
    h.actions.placeOwnPublication(publication);
    assert(h.placements.length === 2, 'after moving, another copy can be placed');
    assert(h.messages[h.messages.length - 1].endsWith('(2 placements now)'), 'the count includes every copy');
    console.log('✓ Place Copy Here refuses a duplicate on the same spot and places again after moving');
}

{
    const h = harness({ camera: { x: 5, y: 0, z: 5 } });
    h.placements.push({ placementId: 'other', publicationId: 'pub-2', position: { x: 5, y: 0, z: 5 } });
    h.actions.placeOwnPublication(publication);
    assert(h.placements.length === 2, 'another Publication at the same spot does not block this one');
    console.log('✓ only copies of the same Publication block the spot');
}
