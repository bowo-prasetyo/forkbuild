// @environment browser
import { createApp, h, nextTick, ref } from 'vue';
import BuildPlotBanner from '../ui/components/BuildPlotBanner.js';
import { assert } from './support/Assert.js';

// The Editor's Build here banner, rendered by real Vue: before publishing it
// says where the build will stand; after, that it stands there, with a way to
// go and see it; either way the spot can be forgotten.

const published = ref(false);
const events = [];
const host = document.createElement('div');
document.body.appendChild(host);
const app = createApp({
    render: () => h(BuildPlotBanner, {
        plot: { buildDocumentId: 'b', worldDocumentId: 'w', worldTitle: 'Willow Village', position: { x: 0, y: 0, z: 0 } },
        published: published.value,
        onVisit: () => events.push('visit'),
        onForget: () => events.push('forget')
    })
});
app.mount(host);

const text = () => host.querySelector('.build-plot-banner-text').textContent;
assert(text().includes('Willow Village') && text().includes('when you publish'), `before publishing it says where it will stand (${text()})`);
assert(!host.querySelector('.build-plot-visit'), 'nothing to see yet');
host.querySelector('.build-plot-forget').click();
assert(events.join() === 'forget', 'the spot can be forgotten');

published.value = true;
await nextTick();
assert(text().startsWith('Published') && text().includes('Willow Village'), 'after publishing it says it stands there');
host.querySelector('.build-plot-visit').click();
assert(events.join() === 'forget,visit', 'and offers to go and see it');
app.unmount();
host.remove();
console.log('✓ the Build here banner says where the build stands');
