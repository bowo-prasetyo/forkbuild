// @environment browser
import { createApp, h, nextTick, reactive } from 'vue';
import SoundControl from '../ui/components/SoundControl.js';
import { assert } from './support/Assert.js';

// The Editor's Sound on a phone or a touch screen (finding P2-11 of
// docs/reviews/EditorPlacementUX-2026-10-27.md): folded into one small
// button that opens the sound and music toggles, instead of a panel floating
// over the build; without `compact`, the panel is as it was.

const state = reactive({ muted: false, music: true, compact: true });
const events = [];
const host = document.createElement('div');
document.body.appendChild(host);
const app = createApp({
    render: () => h(SoundControl, {
        compact: state.compact, muted: state.muted, music: state.music, volume: 0.5,
        onToggle: () => { events.push('toggle'); state.muted = !state.muted; },
        onToggleMusic: () => { events.push('music'); state.music = !state.music; }
    })
});
app.mount(host);
await nextTick();

const button = () => host.querySelector('.editor-sound-button');
const menu = () => host.querySelector('.editor-sound-menu');

assert(button() && !host.querySelector('.world-view-sound'), 'compact, it is one button, not the floating panel');
assert(button().textContent.trim() === '🔊' && button().getAttribute('aria-label') === 'Sound', 'showing sound is on, and named');
assert(!menu() && button().getAttribute('aria-expanded') === 'false', 'its toggles start folded away');

button().click();
await nextTick();
assert(menu() && button().getAttribute('aria-expanded') === 'true', 'a tap opens them');
const labels = [...menu().querySelectorAll('button')].map((b) => b.textContent.trim());
assert(labels.length === 2 && /Sound on/.test(labels[0]) && /Music on/.test(labels[1]), `the sound and music toggles (${labels})`);

menu().querySelector('.world-view-sound-music').click();
await nextTick();
assert(events.join() === 'music' && /Music off/.test(menu().querySelector('.world-view-sound-music').textContent), 'music turns off and says so');
menu().querySelector('.world-view-sound-toggle').click();
await nextTick();
assert(events.join() === 'music,toggle' && button().textContent.trim() === '🔇', 'sound turns off, and the button shows it');
assert(menu().querySelectorAll('button').length === 1, 'with sound off, music has nothing to say');

document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
await nextTick();
assert(!menu(), 'a tap anywhere else folds it away');

state.compact = false;
await nextTick();
assert(host.querySelector('.world-view-sound') && !button(), 'without compact, the full panel shows as before');

app.unmount();
host.remove();
console.log('✓ Sound folds into one button in the Editor on a phone');
