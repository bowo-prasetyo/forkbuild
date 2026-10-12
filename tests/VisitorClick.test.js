import { selectionMethods } from '../application/worldNavigation/selectionMethods.js';
import { assert } from './support/Assert.js';

// World View without Advanced (docs/reviews/CreativeDirection-2026-10-12b.md,
// finding 5): a visitor clicks the view to walk, and that click selects
// nothing, so no brick's inspection opens. Another avatar can still be
// picked. With Advanced, a click picks a brick as before.

function fakeSession({ brick = null, avatar = null } = {}) {
    const calls = [];
    const state = {
        selection: null,
        avatar: null,
        _session: {
            pick: () => brick,
            pickAvatar: () => avatar,
            pickPlacement: () => null,
            pickGround: () => ({ position: { x: 1, y: 0, z: 2 } }),
            selectBricks: (ids) => calls.push(['selectBricks', ids]),
            clearSelection: () => calls.push(['clearSelection']),
            clearHover: () => {}
        },
        _setAvatarInteraction(next) { this.avatar = next; this._avatarInteraction = next; },
        _setSpatialSelection(next) { this.selection = next; this._spatialSelection = next; },
        _spatialSelection: null,
        _refreshInspection() {},
        _refreshEditingContext() {},
        _refreshGizmo() {}
    };
    return { state, calls };
}

const brickHit = { brickId: 'b1', buildingId: 'g1', documentId: 'd1', distance: 5 };

{
    const { state, calls } = fakeSession({ brick: brickHit });
    const picked = selectionMethods.pick.call(state, 10, 10, { builds: false });
    assert(picked === null, 'a visitor\'s click on a brick picks nothing');
    assert(state.selection.isEmpty === true && !calls.some(([name]) => name === 'selectBricks'), 'and selects no brick');
    console.log('✓ a visitor\'s click on a build selects nothing');
}

{
    const { state } = fakeSession({ brick: brickHit, avatar: { avatarId: 'friend', distance: 3 } });
    const picked = selectionMethods.pick.call(state, 10, 10, { builds: false });
    assert(picked && state.avatar.avatarId === 'friend', 'another avatar is still picked');
    console.log('✓ a visitor can still pick another avatar');
}

{
    const { state, calls } = fakeSession({ brick: brickHit });
    selectionMethods.pick.call(state, 10, 10);
    assert(calls.some(([name, ids]) => name === 'selectBricks' && ids.includes('b1')), 'with Advanced, the brick is selected as before');
    console.log('✓ with Advanced, a click picks the brick');
}
