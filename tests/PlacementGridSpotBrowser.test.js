// @environment browser
import { createApp, h, nextTick } from 'vue';
import PlacementEditorDialog from '../ui/components/PlacementEditorDialog.js';
import { computeDeterministicGridPosition } from '../core/world/DeterministicGridPlacement.js';
import { assert } from './support/Assert.js';

// Move Placement's "Move to its grid spot", rendered by real Vue: it fills the
// form with the placement's own spot on the id-keyed grid, where a build is
// placed when published, and Move submits it like any other position. A way
// back for builds placed round the challenge plaza from 2026-10-12.

function mount(info) {
    const moves = [];
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp({ render: () => h(PlacementEditorDialog, { info, onMove: (position) => moves.push(position) }) });
    app.mount(host);
    return { host, moves, done: () => { app.unmount(); host.remove(); } };
}

{
    const grid = computeDeterministicGridPosition('pub-harbor-wall-light');
    const { host, moves, done } = mount({ publicationId: 'pub-harbor-wall-light', position: { x: -180.3, y: 0, z: 355.1 } });
    const button = host.querySelector('.placement-grid-spot-btn');
    assert(button && !button.disabled, 'a placement round the plaza offers its grid spot');
    const hint = host.querySelector('.placement-grid-spot .form-hint').textContent;
    const n = (value) => new Intl.NumberFormat('en').format(value);
    assert(hint.includes(`X ${n(grid.x)}, Z ${n(grid.z)}`), `and says where it is (${hint})`);

    button.click();
    await nextTick();
    const [x, y, z] = [...host.querySelectorAll('input[type="number"]')].map((input) => Number(input.value));
    assert(x === grid.x && y === grid.y && z === grid.z, `the form is filled with the grid spot (${x}, ${y}, ${z})`);
    assert(button.disabled, 'there, the button has nothing more to do');
    assert(moves.length === 0, 'nothing moves until Move is clicked');

    host.querySelector('.modal-actions .action-btn--primary').click();
    assert(moves.length === 1 && moves[0].x === grid.x && moves[0].y === grid.y && moves[0].z === grid.z, 'Move submits the grid spot');
    done();
    console.log('✓ Move to its grid spot fills in the placement\'s grid spot, and Move submits it');
}

{
    const grid = computeDeterministicGridPosition('pub-on-grid');
    const { host, done } = mount({ publicationId: 'pub-on-grid', position: { x: grid.x, y: grid.y, z: grid.z } });
    assert(host.querySelector('.placement-grid-spot-btn').disabled, 'a placement already on its grid spot has nowhere to go');
    done();
    const unknown = mount({ position: { x: 1, y: 0, z: 2 } });
    assert(!unknown.host.querySelector('.placement-grid-spot-btn'), 'with no Publication known, no grid spot is offered');
    unknown.done();
    console.log('✓ already there, or with no Publication known, there is nothing to offer');
}
