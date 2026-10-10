// @environment browser
import { createApp, h, nextTick } from 'vue';
import BuilderStamps from '../ui/components/home/BuilderStamps.js';
import { assert } from './support/Assert.js';

// Home's Your stamps, rendered by real Vue: the stamps earned, each with its
// fact, and nothing at all before the first.

async function mount(facts) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp({ render: () => h(BuilderStamps, { facts }) });
    app.mount(host);
    await nextTick();
    await nextTick();
    return { host, unmount: () => { app.unmount(); host.remove(); } };
}

{
    const { host, unmount } = await mount({ publishedBuilds: 1, remixesByOthers: 3, challengesEntered: 0 });
    const stamps = [...host.querySelectorAll('.builder-stamp')];
    assert(stamps.map((s) => s.dataset.stamp).join() === 'published,remixed', 'the earned stamps');
    assert(stamps[0].querySelector('.builder-stamp-fact').textContent === 'Published 1 build', 'with their facts');
    assert(stamps[1].querySelector('.builder-stamp-fact').textContent === 'Others made 3 remixes of your builds', 'counted');
    assert(host.querySelector('#builder-stamps-title').textContent === 'Your stamps', 'under Your stamps');
    unmount();
    console.log('✓ earned stamps show with their facts');
}

{
    const { host, unmount } = await mount({ publishedBuilds: 0 });
    assert(!host.querySelector('.builder-stamps'), 'no stamps, no section');
    unmount();
    console.log('✓ nothing before the first stamp');
}
