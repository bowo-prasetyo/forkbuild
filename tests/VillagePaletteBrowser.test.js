// @environment browser
import { createApp, h, nextTick, ref } from 'vue';
import VillagePaletteSwatches from '../ui/components/VillagePaletteSwatches.js';
import { VILLAGE_PALETTE } from '../core/building/VillagePalette.js';
import { assert } from './support/Assert.js';

// The village palette's swatches, rendered by real Vue: one named button per
// colour, a click chooses that colour, and the colour in use is marked.

const chosen = [];
const selected = ref(null);
const host = document.createElement('div');
document.body.appendChild(host);
const app = createApp({
    render: () => h(VillagePaletteSwatches, {
        selected: selected.value,
        onChoose: (color) => { chosen.push(color); selected.value = color; }
    })
});
app.mount(host);

const swatches = [...host.querySelectorAll('.village-palette-swatch')];
assert(swatches.length === VILLAGE_PALETTE.length, `one swatch per colour (got ${swatches.length})`);
assert(swatches.every((swatch) => swatch.getAttribute('aria-label')), 'every swatch is named');
assert(host.querySelector('.village-palette').getAttribute('aria-label') === 'Village colours', 'the row is named');
assert(!host.querySelector('.village-palette-swatch--selected'), 'nothing is marked before a choice');

swatches[5].click();
await nextTick();
assert(chosen.length === 1 && chosen[0] === VILLAGE_PALETTE[5].color, 'a click chooses that colour');
const marked = [...host.querySelectorAll('.village-palette-swatch--selected')];
assert(marked.length === 1 && marked[0] === host.querySelectorAll('.village-palette-swatch')[5], 'and marks it');
assert(marked[0].getAttribute('aria-pressed') === 'true', 'as pressed');

// From the keyboard the row is one Tab stop, the colour in use, and the arrow
// keys, Home and End move along it.
const live = () => [...host.querySelectorAll('.village-palette-swatch')];
const stops = () => live().filter((swatch) => swatch.tabIndex === 0);
assert(stops().length === 1 && stops()[0] === live()[5], 'the colour in use is the row\'s one Tab stop');
const press = (element, key) => element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
live()[5].focus();
press(live()[5], 'ArrowRight');
assert(document.activeElement === live()[6], 'Right moves to the next colour');
press(live()[6], 'ArrowLeft');
press(live()[5], 'ArrowLeft');
assert(document.activeElement === live()[4], 'Left moves back');
press(live()[4], 'End');
assert(document.activeElement === live()[live().length - 1], 'End goes to the last colour');
press(document.activeElement, 'Home');
assert(document.activeElement === live()[0], 'Home goes to the first');
app.unmount();
host.remove();
console.log('✓ the village palette chooses and marks a colour, and moves by the arrow keys');
