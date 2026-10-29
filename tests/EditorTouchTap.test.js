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

// 7. Mouse in Select: hover reaches the tools as it happens; a press reaches
// them only once released as a click, so a drag that turns the camera neither
// clears the selection nor selects what it began on.
{
    const { host, dispatched } = makeHost();
    const mouse = { pointerType: 'mouse', pointerId: 1, clientX: 1, clientY: 1, button: 0, buttons: 1, shiftKey: false };
    host.onPointerMove({ ...mouse, buttons: 0 });
    assert(dispatched.map((d) => d.type).join(',') === 'move', 'hover passes straight through');
    host.onPointerDown(mouse);
    assert(dispatched.length === 1, 'a press waits');
    host.onPointerUp({ ...mouse, buttons: 0 });
    assert(dispatched.map((d) => d.type).join(',') === 'move,move,down,up', `released where it began, it is a click (${dispatched.map((d) => d.type)})`);
    dispatched.length = 0;
    host.onPointerDown(mouse);
    host.onPointerMove({ ...mouse, clientX: 60 });
    host.onPointerUp({ ...mouse, clientX: 60, buttons: 0 });
    assert(dispatched.every((d) => d.type === 'move'), 'a drag (the camera turning) reaches no tool as a press');
    dispatched.length = 0;
    host.onPointerDown({ ...mouse, button: 2 });
    host.onPointerUp({ ...mouse, button: 2, buttons: 0 });
    assert(dispatched.length === 0, 'nor does a right click');
    console.log('✓ mouse in Select: a click on release, a drag nothing');
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

// 12. Placing with a mouse: a press reaches the tools only once it is
// released as a click, so orbiting (left-drag) or panning (right-drag) the
// camera places nothing.
{
    const placingHost = (activeTool) => {
        const made = makeHost();
        made.host._editorContext = { selection: null, tool: { activeTool } };
        made.host._placePress = null;
        return made;
    };
    const mouse = (x, y, extra = {}) => ({ pointerType: 'mouse', pointerId: 1, clientX: x, clientY: y, button: 0, buttons: 1, shiftKey: false, ...extra });

    for (const tool of ['place', 'place-structure', 'compose-structure']) {
        const { host, dispatched } = placingHost(tool);
        host.onPointerMove(mouse(10, 10, { buttons: 0 }));
        assert(dispatched.map((d) => d.type).join(',') === 'move', `${tool}: hover still reaches the tool`);
        dispatched.length = 0;
        host.onPointerDown(mouse(10, 10));
        assert(dispatched.length === 0, `${tool}: a press alone places nothing`);
        host.onPointerMove(mouse(13, 12));
        host.onPointerUp(mouse(13, 12, { buttons: 0 }));
        assert(dispatched.map((d) => d.type).join(',') === 'move,move,down,up', `${tool}: a click replays move, down, up`);
        assert(dispatched.slice(1).every((d) => d.e.clientX === 13 && d.e.clientY === 12), `${tool}: at the release point`);
        assert(dispatched[2].e.buttons === 1 && dispatched[2].e.button === 0, `${tool}: as a primary press`);
    }

    {
        const { host, dispatched } = placingHost('place');
        host.onPointerDown(mouse(100, 100));
        host.onPointerMove(mouse(160, 110));
        host.onPointerMove(mouse(101, 100));
        host.onPointerUp(mouse(101, 100, { buttons: 0 }));
        assert(dispatched.every((d) => d.type === 'move'), 'a left-drag (orbit) places nothing, even when it comes back');
    }

    {
        const { host, dispatched } = placingHost('compose-structure');
        host.onPointerDown(mouse(50, 50, { button: 2, buttons: 2 }));
        host.onPointerUp(mouse(50, 50, { button: 2, buttons: 0 }));
        host.onPointerDown(mouse(50, 50, { button: 1, buttons: 4 }));
        host.onPointerUp(mouse(50, 50, { button: 1, buttons: 0 }));
        assert(dispatched.length === 0, 'a right or middle click (pan, zoom) places nothing');
    }

    {
        const { host, dispatched } = placingHost('place');
        host.onPointerDown(mouse(5, 5));
        host.onPointerCancel(mouse(5, 5));
        host.onPointerUp(mouse(5, 5, { buttons: 0 }));
        assert(dispatched.length === 0, 'a cancelled press places nothing');
        host.onPointerDown(mouse(7, 7, { pointerType: 'pen' }));
        host.onPointerUp(mouse(7, 7, { pointerType: 'pen', buttons: 0 }));
        assert(dispatched.map((d) => d.type).join(',') === 'move,down,up', 'a pen tap places, like a click');
        assert(dispatched[0].e.pointerType === 'pen', 'and says it was a pen');
    }

    {
        const { host, dispatched } = placingHost('select');
        host.onPointerDown(mouse(1, 1));
        assert(dispatched.length === 0, 'Select waits for the release too');
        host.onPointerUp(mouse(1, 1, { buttons: 0 }));
        assert(dispatched.map((d) => d.type).join(',') === 'move,down,up', 'and gets the click then');
    }
    console.log('✓ placing and selecting act on a click, never on a camera drag');
}

// 13. Placing by touch takes two taps: the first shows the ghost, a second on
// it places. The Place button places the ghost; Cancel stops placing.
{
    // A placing tool's ghost follows a tap to its 40 px cell; a press places.
    const placingTouchHost = (activeTool = 'place') => {
        const made = makeHost();
        const { host } = made;
        const placed = [];
        const preview = { visible: false, position: null };
        const tools = [];
        host._editorContext = {
            selection: null,
            tool: { activeTool },
            preview, compositionPreview: preview, structurePreview: preview,
            setActiveComposition(structure) { tools.push(`composition:${structure}`); },
            setActiveTool(id) { this.tool.activeTool = id; tools.push(id); }
        };
        host._placePress = null;
        host._lastPlacingTap = null;
        host._inputDispatcher = {
            dispatchPointerMove: (e) => {
                preview.visible = true;
                preview.position = { x: Math.round(e.clientX / 40), y: 0.5, z: Math.round(e.clientY / 40) };
            },
            dispatchPointerDown: () => {
                placed.push({ ...preview.position });
                preview.visible = false; // a placed piece's ghost hides until the next tap
            },
            dispatchPointerUp: () => {}
        };
        const tap = (x, y, id = 1) => {
            host.onPointerDown(touch(id, x, y));
            host.onPointerUp(touch(id, x, y));
        };
        return { host, placed, preview, tools, tap };
    };

    for (const tool of ['place', 'place-structure', 'compose-structure']) {
        const { host, placed, tap } = placingTouchHost(tool);
        assert(host.hasPlacementGhost() === false, `${tool}: no ghost before a tap`);
        tap(100, 100);
        assert(placed.length === 0 && host.hasPlacementGhost(), `${tool}: the first tap only shows the ghost`);
        tap(112, 106);
        assert(placed.length === 1 && placed[0].x === 3 && placed[0].z === 3, `${tool}: a second tap on it places it where it was shown`);
    }

    {
        const { placed, tap } = placingTouchHost();
        tap(100, 100);
        tap(300, 300);
        assert(placed.length === 0, 'a second tap elsewhere moves the ghost, places nothing');
        tap(301, 302);
        assert(placed.length === 1 && placed[0].x === 8, 'and a tap on it there places it');
        tap(301, 302);
        assert(placed.length === 1, 'after placing, the next tap shows the next ghost first (stacking sees it before it lands)');
        tap(302, 301);
        assert(placed.length === 2, 'and the tap after that places it');
    }

    {
        // A drag (the camera turned) in between: the ghost moved on screen, so a
        // tap at the old point is a fresh look unless it resolves to the ghost's spot.
        const drag = (host) => {
            host.onPointerDown(touch(2, 200, 200));
            host.onPointerMove(touch(2, 260, 200));
            host.onPointerUp(touch(2, 260, 200));
        };
        const near = placingTouchHost();
        near.tap(100, 100);
        drag(near.host);
        near.tap(90, 90);
        assert(near.placed.length === 0, 'after a camera drag, a nearby tap that lands elsewhere places nothing');
        const onSpot = placingTouchHost();
        onSpot.tap(100, 100);
        drag(onSpot.host);
        onSpot.tap(118, 118);
        assert(onSpot.placed.length === 1 && onSpot.placed[0].x === 3 && onSpot.placed[0].z === 3,
            'a tap that lands on the ghost\'s own spot places it, camera moved or not');
    }

    {
        const { host, placed, preview, tap } = placingTouchHost();
        assert(host.confirmPlacement() === false && placed.length === 0, 'Place with no ghost does nothing');
        tap(40, 40);
        assert(host.confirmPlacement() === true && placed.length === 1 && placed[0].x === 1, 'Place puts the ghost down where it is');
        assert(preview.visible === false && host.hasPlacementGhost() === false, 'leaving no ghost to place again');
    }

    {
        const { host, tools, tap } = placingTouchHost('compose-structure');
        tap(40, 40);
        assert(host.cancelPlacement() === true, 'Cancel while placing');
        assert(tools.join() === 'composition:null,select', 'puts the structure down and returns to Select');
        assert(host.cancelPlacement() === false, 'Cancel with nothing being placed does nothing');
        const brick = placingTouchHost('place');
        brick.host.cancelPlacement();
        assert(brick.tools.join() === 'select', 'Cancel while placing a brick returns to Select');
    }

    {
        const { host, placed, tap } = placingTouchHost('select');
        const dispatched = [];
        host._inputDispatcher = {
            dispatchPointerMove: (e) => dispatched.push('move'),
            dispatchPointerDown: (e) => dispatched.push('down'),
            dispatchPointerUp: (e) => dispatched.push('up')
        };
        tap(10, 10);
        assert(dispatched.join() === 'move,down,up' && placed.length === 0, 'Select still acts on the first tap');
    }
    console.log('✓ placing by touch: see it, then place it');
}
