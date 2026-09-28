import { useViewportInput } from '../ui/views/worldView/useViewportInput.js';
import { assert } from './support/Assert.js';

// World View's Home key does what its Home button does: goHome(). It never
// reaches the Editor's camera-reset shortcut (World View's renderer turns
// that off; see tests/CameraResetKeyBrowser.test.js).

function setup() {
    const calls = [];
    const input = useViewportInput({
        compassHeading: { value: null },
        goHome: () => calls.push('goHome'),
        onAvatarKeyDown: () => { calls.push('avatar'); return false; },
        redoAction: () => calls.push('redo'),
        refreshHoverUI: () => {},
        refreshSpatialUI: () => {},
        session: {},
        undoAction: () => calls.push('undo')
    });
    return { calls, input };
}

function keyEvent(key, { target = { tagName: 'CANVAS' }, ...modifiers } = {}) {
    let prevented = false;
    return {
        key, target, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...modifiers,
        preventDefault() { prevented = true; },
        get prevented() { return prevented; }
    };
}

// Home goes home, and the browser's own Home (scroll to top) is prevented.
{
    const { calls, input } = setup();
    const event = keyEvent('Home');
    input.onKeyDown(event);
    assert(JSON.stringify(calls) === JSON.stringify(['goHome']), `Home calls goHome() only — got ${calls.join(', ')}`);
    assert(event.prevented, 'Home is prevented, so the page does not scroll');
}

// In a text field, Home moves the cursor as usual.
{
    const { calls, input } = setup();
    const event = keyEvent('Home', { target: { tagName: 'INPUT' } });
    input.onKeyDown(event);
    assert(calls.length === 0, `Home in a text field does nothing here — got ${calls.join(', ')}`);
    assert(!event.prevented, 'Home in a text field is left to the field');
}

// With a modifier it's some other shortcut, not Home.
for (const modifier of ['ctrlKey', 'metaKey', 'altKey', 'shiftKey']) {
    const { calls, input } = setup();
    input.onKeyDown(keyEvent('Home', { [modifier]: true }));
    assert(!calls.includes('goHome'), `${modifier}+Home does not go home`);
}

// Other keys still reach Avatar Control Mode.
{
    const { calls, input } = setup();
    input.onKeyDown(keyEvent('w'));
    assert(JSON.stringify(calls) === JSON.stringify(['avatar']), `W goes to Avatar Control Mode — got ${calls.join(', ')}`);
}

console.log('WorldViewHomeKey: all assertions passed');
