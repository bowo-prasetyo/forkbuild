import { pointerInputMethods } from '../application/editorSession/pointerInputMethods.js';
import { assert } from './support/Assert.js';

// EditorSession's pointer input, on a host with a recording dispatcher and a
// gizmo that claims touches only where told to.
function makeHost({ gizmoAt = null } = {}) {
    const dispatched = [];
    const marquees = [];
    const controls = [];
    let gizmoActive = false;
    const host = Object.assign({}, pointerInputMethods, {
        _touchBoxSelect: false,
        marqueeSelect(rect, options) {
            marquees.push({ rect, options });
            return true;
        },
        _editorContext: { selection: null },
        _marqueeState: null,
        _touchPointerIds: new Set(),
        _touchTap: null,
        _touchMultiSelect: false,
        _refreshGizmo() {},
        _session: {
            gizmoPointerDown(x, y) {
                gizmoActive = Boolean(gizmoAt && gizmoAt.x === x && gizmoAt.y === y);
                return gizmoActive;
            },
            gizmoPointerMove() {
                return gizmoActive ? { consumed: true, feedback: 'dragging' } : null;
            },
            gizmoPointerUp() {
                const consumed = gizmoActive;
                gizmoActive = false;
                return consumed ? { consumed: true, feedback: null } : null;
            },
            setControlsEnabled(enabled) {
                controls.push(enabled);
            }
        },
        _inputDispatcher: {
            dispatchPointerMove: (e) => dispatched.push({ type: 'move', e }),
            dispatchPointerDown: (e) => dispatched.push({ type: 'down', e }),
            dispatchPointerUp: (e) => dispatched.push({ type: 'up', e })
        }
    });
    return { host, dispatched, marquees, controls };
}

function touch(pointerId, x, y, isPrimary = true) {
    return { pointerType: 'touch', pointerId, clientX: x, clientY: y, button: 0, buttons: 1, isPrimary };
}

// 1. A still tap replays as hover, press and release at the lift point.
{
    const { host, dispatched } = makeHost();
    host.onPointerDown(touch(1, 100, 100));
    assert(dispatched.length === 0, 'a touch-down reaches no tool yet');
    host.onPointerMove(touch(1, 104, 103));
    assert(dispatched.length === 0, 'a touch-move is never a hover');
    host.onPointerUp(touch(1, 104, 103));
    assert(dispatched.map((d) => d.type).join(',') === 'move,down,up', 'a tap replays move, down, up');
    assert(dispatched.every((d) => d.e.clientX === 104 && d.e.clientY === 103), 'at the lift point');
    assert(dispatched[1].e.buttons === 1 && dispatched[1].e.ctrlKey === false, 'as a plain primary press');
    console.log('✓ tap replays as a click');
}

// 2. A drag (the camera orbiting) never reaches the tools.
{
    const { host, dispatched } = makeHost();
    host.onPointerDown(touch(1, 100, 100));
    host.onPointerMove(touch(1, 140, 100));
    host.onPointerMove(touch(1, 102, 100));
    host.onPointerUp(touch(1, 102, 100));
    assert(dispatched.length === 0, 'a drag that comes back is still not a tap');
    console.log('✓ drag is not a tap');
}

// 3. A second finger (pinch or pan) cancels the tap, for either finger.
{
    const { host, dispatched } = makeHost();
    host.onPointerDown(touch(1, 100, 100));
    host.onPointerDown(touch(2, 200, 200, false));
    host.onPointerUp(touch(2, 200, 200, false));
    host.onPointerUp(touch(1, 100, 100));
    assert(dispatched.length === 0, 'a two-finger touch is no tap');
    // And the next single tap works again.
    host.onPointerDown(touch(3, 50, 50));
    host.onPointerUp(touch(3, 50, 50));
    assert(dispatched.length === 3, 'the next tap after a pinch still works');
    console.log('✓ second finger cancels the tap');
}

// 4. A lost pointerup cannot block later taps; pointercancel drops the tap.
{
    const { host, dispatched } = makeHost();
    host.onPointerDown(touch(1, 10, 10));
    // pointerup for 1 never arrives; the next first finger starts afresh.
    host.onPointerDown(touch(2, 20, 20));
    host.onPointerUp(touch(2, 20, 20));
    assert(dispatched.length === 3, 'a stale pointer id does not turn a tap into a pinch');
    dispatched.length = 0;
    host.onPointerDown(touch(4, 30, 30));
    host.onPointerCancel(touch(4, 30, 30));
    host.onPointerUp(touch(4, 30, 30));
    assert(dispatched.length === 0, 'a cancelled touch is no tap');
    console.log('✓ stale ids and pointercancel');
}

// 5. Multi-select mode makes a tap a Ctrl-click.
{
    const { host, dispatched } = makeHost();
    host.setTouchMultiSelect(true);
    assert(host.isTouchMultiSelect() === true, 'mode reads back');
    host.onPointerDown(touch(1, 5, 5));
    host.onPointerUp(touch(1, 5, 5));
    assert(dispatched.every((d) => d.e.ctrlKey === true), 'every replayed event carries Ctrl');
    console.log('✓ multi-select tap');
}

// 6. A touch on a gizmo handle drags it at once and is no tap.
{
    const { host, dispatched } = makeHost({ gizmoAt: { x: 70, y: 70 } });
    host.onPointerDown(touch(1, 70, 70));
    const moved = host.onPointerMove(touch(1, 71, 71));
    assert(moved && moved.consumed && moved.feedback === 'dragging', 'the gizmo takes the move');
    const up = host.onPointerUp(touch(1, 71, 71));
    assert(up && up.consumed, 'and the release');
    assert(dispatched.length === 0, 'the tools see nothing');
    console.log('✓ gizmo drag by touch');
}

// 7. Mouse input is unchanged: every event reaches the tools as it happens.
{
    const { host, dispatched } = makeHost();
    const mouse = { pointerType: 'mouse', pointerId: 1, clientX: 1, clientY: 1, button: 0, buttons: 1, shiftKey: false };
    host.onPointerMove({ ...mouse, buttons: 0 });
    host.onPointerDown(mouse);
    host.onPointerUp({ ...mouse, buttons: 0 });
    assert(dispatched.map((d) => d.type).join(',') === 'move,down,up', 'mouse events pass straight through');
    console.log('✓ mouse unchanged');
}

// 8. Box mode: a drag draws the marquee with the camera held still.
{
    const { host, dispatched, marquees, controls } = makeHost();
    host.setTouchBoxSelect(true);
    assert(host.isTouchBoxSelect() === true, 'box mode reads back');
    host.onPointerDown(touch(1, 10, 20));
    assert(controls.join(',') === 'false', 'the camera stops following the finger');
    host.onPointerMove(touch(1, 60, 90));
    assert(JSON.stringify(host.getMarqueeRect()) === JSON.stringify({ x0: 10, y0: 20, x1: 60, y1: 90 }), 'the box follows the finger');
    host.onPointerUp(touch(1, 60, 90));
    assert(marquees.length === 1, 'lifting selects once');
    assert(JSON.stringify(marquees[0].rect) === JSON.stringify({ x0: 10, y0: 20, x1: 60, y1: 90 }), 'with the drawn box');
    assert(marquees[0].options.additive === false, 'replacing the selection');
    assert(controls.join(',') === 'false,true', 'and the camera is back');
    assert(host.getMarqueeRect() === null && dispatched.length === 0, 'no box left over, no tool event');
    console.log('✓ box drag');
}

// 9. Box with Multi adds to the selection; a still tap in box mode is a tap.
{
    const { host, dispatched, marquees } = makeHost();
    host.setTouchBoxSelect(true);
    host.setTouchMultiSelect(true);
    host.onPointerDown(touch(1, 0, 0));
    host.onPointerMove(touch(1, 40, 40));
    host.onPointerUp(touch(1, 40, 40));
    assert(marquees[0].options.additive === true, 'Multi makes the box additive');

    host.onPointerDown(touch(2, 5, 5));
    host.onPointerMove(touch(2, 8, 7));
    host.onPointerUp(touch(2, 8, 7));
    assert(marquees.length === 1, 'a still touch draws no box');
    assert(dispatched.map((d) => d.type).join(',') === 'move,down,up', 'it replays as a tap');
    assert(dispatched[1].e.ctrlKey === true, 'a Multi tap');
    console.log('✓ box with multi, and taps');
}

// 10. A second finger or a pointercancel drops the box and restores the camera.
{
    const { host, marquees, controls } = makeHost();
    host.setTouchBoxSelect(true);
    host.onPointerDown(touch(1, 0, 0));
    host.onPointerMove(touch(1, 50, 50));
    host.onPointerDown(touch(2, 100, 100, false));
    assert(host.getMarqueeRect() === null, 'a second finger cancels the box');
    host.onPointerUp(touch(2, 100, 100, false));
    host.onPointerUp(touch(1, 50, 50));
    assert(marquees.length === 0, 'nothing is selected');
    assert(controls[controls.length - 1] === true, 'the camera is back');

    host.onPointerDown(touch(3, 0, 0));
    host.onPointerMove(touch(3, 50, 50));
    host.onPointerCancel(touch(3, 50, 50));
    host.onPointerUp(touch(3, 50, 50));
    assert(marquees.length === 0 && host.getMarqueeRect() === null, 'a cancelled touch selects nothing');
    assert(controls[controls.length - 1] === true, 'and restores the camera');
    console.log('✓ box cancelled');
}

// 11. Gizmo handles still win in box mode.
{
    const { host, marquees } = makeHost({ gizmoAt: { x: 70, y: 70 } });
    host.setTouchBoxSelect(true);
    host.onPointerDown(touch(1, 70, 70));
    assert(host.getMarqueeRect() === null, 'a touch on a handle starts no box');
    const moved = host.onPointerMove(touch(1, 90, 90));
    assert(moved && moved.consumed, 'the gizmo drags');
    host.onPointerUp(touch(1, 90, 90));
    assert(marquees.length === 0, 'and nothing is box-selected');
    console.log('✓ gizmo in box mode');
}
