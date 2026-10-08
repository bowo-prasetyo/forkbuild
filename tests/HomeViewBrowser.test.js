// @environment browser
import { createApp, nextTick } from 'vue';
import HomeView from '../ui/views/HomeView.js';
import { ShowcaseTurntableRenderer } from '../renderer/ShowcaseTurntableRenderer.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { CreateStructureRegistryUseCase } from '../application/editor/CreateStructureRegistryUseCase.js';
import { FEATURED_STRUCTURE_IDS, SHOWCASE_STRUCTURE_IDS, composeShowcase, featuredStructures } from '../application/home/FeaturedBuilds.js';
import { t } from '../ui/i18n/i18n.js';
import { assert } from './support/Assert.js';

// Home, rendered by real Vue with the shipped CSS: what ForkBuild is, a
// button straight into a ready-made house, a card for each ready-made build
// (loaded after the page, with its 3D showcase), and the showcase's
// turntable, which holds still for reduced motion.

await new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/css/main.css';
    link.onload = resolve;
    link.onerror = () => reject(new Error('css/main.css failed to load'));
    document.head.appendChild(link);
});

async function until(condition, what, timeoutMs = 20000) {
    const start = Date.now();
    while (!condition()) {
        if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${what}`);
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
}

// A router-link that renders the address it would go to, as the hash router does.
const RouterLinkStub = {
    props: ['to'],
    computed: {
        href() {
            if (typeof this.to === 'string') return `#${this.to}`;
            const query = new URLSearchParams(this.to.query || {}).toString();
            return `#${this.to.path}${query ? `?${query}` : ''}`;
        }
    },
    template: '<a :href="href"><slot></slot></a>'
};

const host = document.createElement('div');
host.style.cssText = 'display: flex; width: 1200px; height: 800px;';
document.body.appendChild(host);
const app = createApp(HomeView);
app.component('router-link', RouterLinkStub);
app.mount(host);
await nextTick();

// What it is, and the ways in, render with the page.
{
    assert(host.querySelector('h1').textContent.trim() === t('homeView.heroTitle'), 'the headline says what ForkBuild is');
    const primary = host.querySelector('.home-cta-primary');
    assert(primary && primary.getAttribute('href') === '#/editor?start=village%3Ahouse', `the main button opens the ready-made house (${primary && primary.getAttribute('href')})`);
    const secondary = [...host.querySelectorAll('.home-cta-secondary')].map((link) => link.getAttribute('href'));
    assert(secondary.join() === '#/editor,#/repository', `and the others an empty plot and the Repository (${secondary.join()})`);
    assert(host.querySelector('.home-reassurance').textContent.trim() === t('homeView.noAccountNeeded'), 'it says no account is needed');
    assert(host.querySelectorAll('.home-reason').length === 4, 'four reasons to try it');
    const external = [...host.querySelectorAll('.home-footer a')];
    assert(external.length === 2 && external.every((link) => link.target === '_blank' && link.rel === 'noopener' && link.href.startsWith('https://github.com/bowo-prasetyo/forkbuild')),
        'the footer links to the guide and the source, in a new tab');
    console.log('✓ the headline, the buttons and the reasons render with the page');
}

// The ready-made builds and the showcase load after it.
{
    await until(() => host.querySelectorAll('.featured-build-card').length === FEATURED_STRUCTURE_IDS.length, 'the ready-made builds');
    const links = [...host.querySelectorAll('.featured-build-link')];
    assert(links.map((link) => new URLSearchParams(link.getAttribute('href').split('?')[1]).get('start')).join() === FEATURED_STRUCTURE_IDS.join(),
        'each card opens its own structure');
    assert(links.every((link) => link.getAttribute('aria-label') && link.querySelector('.featured-build-name').textContent.trim()),
        'each card is named, for screen readers too');
    await until(() => host.querySelector('.home-showcase .build-turntable-canvas, .home-showcase .build-turntable-fallback'), 'the showcase');
    const showcase = host.querySelector('.home-showcase');
    assert(showcase.getBoundingClientRect().height > 100, 'the showcase has room');
    console.log('✓ the ready-made builds and the 3D showcase load after the page');
}

app.unmount();
host.remove();
console.log('✓ Home unmounts cleanly');

// The turntable draws the village, turns on animation frames, and holds
// still for reduced motion.
{
    const brickRegistry = new CreateBrickRegistryUseCase().execute();
    const structureRegistry = new CreateStructureRegistryUseCase().execute();
    const bricks = composeShowcase(featuredStructures(structureRegistry, SHOWCASE_STRUCTURE_IDS), brickRegistry);

    const realRequest = window.requestAnimationFrame;
    const realCancel = window.cancelAnimationFrame;
    const requested = [];
    const cancelled = [];
    window.requestAnimationFrame = (callback) => requested.push(callback);
    window.cancelAnimationFrame = (id) => cancelled.push(id);
    try {
        for (const reducedMotion of [true, false]) {
            const canvas = document.createElement('canvas');
            canvas.style.cssText = 'width: 320px; height: 240px;';
            document.body.appendChild(canvas);
            const renderer = new ShowcaseTurntableRenderer(brickRegistry, canvas, { reducedMotion });
            renderer.resize();
            renderer.show(bricks);
            if (reducedMotion) {
                // Read back in the same task as the draw, before the buffer is cleared.
                const copy = document.createElement('canvas');
                copy.width = canvas.width;
                copy.height = canvas.height;
                const context = copy.getContext('2d');
                context.drawImage(canvas, 0, 0);
                const { data } = context.getImageData(0, 0, copy.width, copy.height);
                let notSky = 0;
                for (let i = 0; i < data.length; i += 4) {
                    if (Math.abs(data[i] - 0x87) + Math.abs(data[i + 1] - 0xce) + Math.abs(data[i + 2] - 0xeb) > 40) notSky++;
                }
                assert(notSky > (data.length / 4) * 0.1, `the village fills part of the frame (${notSky} pixels aren't sky)`);
            }
            const before = requested.length;
            renderer.start();
            if (reducedMotion) {
                assert(requested.length === before, 'reduced motion: one still frame, no animation');
            } else {
                assert(requested.length === before + 1, 'it asks for an animation frame to turn');
                requested[requested.length - 1](1000);
                requested[requested.length - 1](1500);
                assert(requested.length === before + 3, 'and keeps asking while it turns');
                renderer.stop();
                assert(cancelled[cancelled.length - 1] === requested.length, 'stop() cancels the frame it asked for');
            }
            renderer.dispose();
            canvas.remove();
        }
    } finally {
        window.requestAnimationFrame = realRequest;
        window.cancelAnimationFrame = realCancel;
    }
    console.log('✓ the turntable draws the village, turns, and holds still for reduced motion');
}

console.log('\n✅ All HomeView browser tests passed.');
