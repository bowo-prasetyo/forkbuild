// EditorSession#frameDocument() (application/editorSession/selectionEditingMethods.js):
// after a ready-made build opens, the camera looks at the middle of the
// whole document from far enough back to see all of it, whatever its size.
import { selectionEditingMethods } from '../application/editorSession/selectionEditingMethods.js';
import { ForkStructureUseCase } from '../application/editor/ForkStructureUseCase.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { CreateStructureRegistryUseCase } from '../application/editor/CreateStructureRegistryUseCase.js';
import { SpatialBounds } from '../core/SpatialBounds.js';
import { assert } from './support/Assert.js';

const registry = new CreateBrickRegistryUseCase().execute();
const structures = new CreateStructureRegistryUseCase().execute();

// A session holding `document`, recording the camera states it is given.
function sessionWith(document, { rendering = true } = {}) {
    const states = [];
    const session = {
        ...selectionEditingMethods,
        _registry: registry,
        _documentManager: { document },
        _session: rendering ? { setCameraState: (state) => states.push(state) } : null
    };
    return { session, states };
}

function framed(id) {
    const document = new ForkStructureUseCase().execute(structures.get(id));
    const { session, states } = sessionWith(document);
    assert(session.frameDocument() === true, `${id}: framed`);
    assert(states.length === 1, `${id}: the camera is set once`);
    const bricks = document.world.getBuildings().flatMap((building) => building.getBricks());
    return { state: states[0], bounds: SpatialBounds.fromBricks(bricks, registry) };
}

// The camera looks at the document's middle, from above and to one side.
{
    for (const id of ['village:house', 'showcase:castle', 'showcase:village_square']) {
        const { state, bounds } = framed(id);
        const { center } = bounds;
        assert(Math.abs(state.target.x - center.x) < 1e-9 && Math.abs(state.target.y - center.y) < 1e-9 && Math.abs(state.target.z - center.z) < 1e-9,
            `${id}: the camera looks at the middle of the build`);
        assert(state.position.y > bounds.max.y, `${id}: from above it`);
        const distance = Math.hypot(state.position.x - center.x, state.position.y - center.y, state.position.z - center.z);
        const radius = Math.hypot(bounds.size.x, bounds.size.y, bounds.size.z) / 2;
        assert(distance > radius * 2, `${id}: from outside it, far enough back to see it all (${distance.toFixed(1)} for a radius of ${radius.toFixed(1)})`);
    }
    console.log('✓ the camera frames the whole build, looking at its middle');
}

// A larger build is seen from further back.
{
    const distanceTo = (id) => {
        const { state } = framed(id);
        return Math.hypot(state.position.x - state.target.x, state.position.y - state.target.y, state.position.z - state.target.z);
    };
    assert(distanceTo('showcase:village_square') > distanceTo('showcase:castle') && distanceTo('showcase:castle') > distanceTo('village:house'),
        'the square is framed from further back than the castle, and the castle than the house');
    console.log('✓ larger builds are framed from further back');
}

// Nothing to frame: no rendering yet, no document, or no bricks.
{
    const house = new ForkStructureUseCase().execute(structures.get('village:house'));
    const notRendering = sessionWith(house, { rendering: false });
    assert(notRendering.session.frameDocument() === false, 'before the Editor renders, nothing happens');
    const noDocument = sessionWith(null);
    assert(noDocument.session.frameDocument() === false && noDocument.states.length === 0, 'without a document, the camera stays');
    const empty = { world: { getBuildings: () => [] } };
    const nothing = sessionWith(empty);
    assert(nothing.session.frameDocument() === false && nothing.states.length === 0, 'an empty document leaves the camera where it is');
    console.log('✓ nothing to frame leaves the camera alone');
}

console.log('\n✅ All EditorFrameDocument tests passed.');
