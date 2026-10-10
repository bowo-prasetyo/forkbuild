// @environment browser
import { createApp, h, nextTick, ref } from 'vue';
import VillagePaletteSwatches from '../ui/components/VillagePaletteSwatches.js';
import { VILLAGE_PALETTE } from '../core/VillagePalette.js';
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
app.unmount();
host.remove();
console.log('✓ the village palette chooses and marks a colour');
