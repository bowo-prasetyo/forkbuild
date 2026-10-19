// @environment browser
import { createApp, nextTick } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import RecentWorldsView from '../ui/views/RecentWorldsView.js';
import { PublishDocumentUseCase } from '../application/publication/PublishDocumentUseCase.js';
import { DocumentManager } from '../application/document/DocumentManager.js';
import { LocalWorldExperienceStore } from '../application/world/LocalWorldExperienceStore.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { LocalWorldExperience } from '../core/LocalWorldExperience.js';
import { CameraPerspective } from '../core/CameraPerspective.js';
import { thumbnailPreview } from '../core/DocumentPreview.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { t } from '../ui/i18n/i18n.js';
import { assert } from './support/Assert.js';

// My Worlds (ui/views/RecentWorldsView.js) rendered by real Vue with the
// shipped CSS, from Worlds published and visited on this device: each card
// with its thumbnail and description, the World visited last on its own,
// the rest shelved by when, at desktop and phone width.

await new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/css/main.css';
    link.onload = resolve;
    link.onerror = () => reject(new Error('css/main.css failed to load'));
    document.head.appendChild(link);
});

async function until(condition, what, timeoutMs = 5000) {
    const start = Date.now();
    while (!condition()) {
        if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${what}`);
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
}

const storage = new LocalStorageProvider();
const identity = new LocalIdentityProvider(storage);
identity.login('worlds-ana');

function publish(title, description) {
    const world = new World();
    const building = new Building({ creator: 'x' });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    const manager = new DocumentManager();
    manager.load(new Document({ world, metadata: new DocumentMetadata({ title, author: 'worlds-ana', description }) }), `doc-${title}`);
    return new PublishDocumentUseCase(new LocalPublisherProvider(storage, new LocalContentStore(storage)), identity).execute(manager);
}

const DAY_MS = 24 * 60 * 60 * 1000;
const harbor = publish('Worlds Harbor', 'A **quiet** harbor with a lighthouse.');
const tower = publish('Worlds Tower', '');
const bridge = publish('Worlds Bridge', 'Stone arches over a slow river.');
const experiences = new LocalWorldExperienceStore({ storageProvider: storage });
experiences.saveExperience(new LocalWorldExperience({ worldId: harbor.documentId, cameraPerspective: CameraPerspective.BIRD_EYE, lastVisitedAt: Date.now() - 1000 }));
experiences.saveExperience(new LocalWorldExperience({ worldId: tower.documentId, lastVisitedAt: Date.now() - 3 * DAY_MS }));
experiences.saveExperience(new LocalWorldExperience({ worldId: bridge.documentId, lastVisitedAt: Date.now() - 30 * DAY_MS }));
experiences.saveExperience(new LocalWorldExperience({ worldId: 'worlds-gone', lastVisitedAt: Date.now() - 40 * DAY_MS }));

// A rendered thumbnail for the harbor only; the rest keep their placeholder.
const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const previewService = {
    getCached: (contentHash) => (contentHash === harbor.contentHash ? thumbnailPreview(PIXEL) : null),
    request: () => ({ promise: Promise.resolve(null), cancel() {} })
};

async function mount(width) {
    const router = createRouter({
        history: createMemoryHistory(),
        routes: [
            { path: '/worlds/recent', component: RecentWorldsView },
            { path: '/world/:id', component: { template: '<p>world</p>' } },
            { path: '/:rest(.*)', component: { template: '<p>elsewhere</p>' } }
        ]
    });
    await router.push('/worlds/recent');
    const host = document.createElement('div');
    host.style.cssText = `display: flex; width: ${width}px;`;
    document.body.appendChild(host);
    const app = createApp({ template: '<router-view />' });
    app.use(router);
    app.provide('previewService', previewService);
    app.provide('identityUseCase', { provider: identity, currentUser: () => identity.currentUser() });
    app.mount(host);
    await nextTick();
    await until(() => host.querySelector('.recent-worlds-view'), 'My Worlds');
    return { host, router, unmount: () => { app.unmount(); host.remove(); } };
}

const text = (node) => node.textContent.replace(/\s+/g, ' ').trim();

// The World visited last on its own, the rest shelved by when.
{
    const view = await mount(1200);
    try {
        const latest = view.host.querySelector('.recent-worlds-latest');
        assert(text(latest.querySelector('h2')) === t('recentWorldsView.pickUpWhereYouLeftOff'), 'a shelf to pick up where you left off');
        const featured = latest.querySelectorAll('.world-card');
        assert(featured.length === 1 && featured[0].classList.contains('world-card--featured'), 'holding one, wider card');
        assert(text(featured[0].querySelector('h3')) === 'Worlds Harbor', 'the World visited last');

        const groups = [...view.host.querySelectorAll('.recent-worlds-group')];
        assert(groups.map((group) => text(group.querySelector('h2'))).join() === [t('recentWorldsView.group.thisWeek'), t('recentWorldsView.group.earlier')].join(), `no empty Today shelf (${groups.map((group) => text(group.querySelector('h2')))})`);
        assert([...groups[1].querySelectorAll('h3')].map(text).join() === `Worlds Bridge,${t('recentWorldsView.untitledWorld')}`, 'earlier, most recent first');

        const cardStyle = getComputedStyle(featured[0]);
        assert(cardStyle.flexDirection === 'row', `the picture beside the words when there is room (${cardStyle.flexDirection})`);
        console.log('✓ My Worlds offers the World visited last, then the rest by when');
    } finally {
        view.unmount();
    }
}

// Each card: its thumbnail, description, and the visit set apart.
{
    const view = await mount(1200);
    try {
        const [harborCard, towerCard] = view.host.querySelectorAll('.world-card');
        const image = harborCard.querySelector('.world-card-thumbnail img.publication-preview-image');
        assert(image && image.getAttribute('src') === PIXEL, 'the rendered thumbnail');
        assert(towerCard.querySelector('.world-card-thumbnail .publication-preview-label').textContent === 'W', 'a placeholder until there is one');
        assert(text(harborCard.querySelector('.publication-description')) === 'A quiet harbor with a lighthouse.', 'the description, without its markup');
        assert(!towerCard.querySelector('.publication-description'), 'none for a World without one');

        const visit = harborCard.querySelector('.world-card-visit');
        assert(visit.querySelector('svg[aria-hidden="true"]'), 'the visit line has its clock');
        assert(text(visit).includes(t('worldCard.leftInView', { perspective: t('worldCard.perspective.birdEye') })), `and says how it was left (${text(visit)})`);
        assert(getComputedStyle(visit).borderTopStyle === 'solid', 'set apart from the World\'s own details');

        const thumbnail = harborCard.querySelector('.world-card-thumbnail');
        assert(thumbnail.getAttribute('tabindex') === '-1' && thumbnail.getAttribute('aria-hidden') === 'true', 'the thumbnail is a pointer shortcut, not another tab stop');
        thumbnail.click();
        await until(() => view.router.currentRoute.value.path === `/world/${harbor.documentId}`, 'entering the World from its thumbnail');
        console.log('✓ a World Card shows its thumbnail and description, and the visit apart');
    } finally {
        view.unmount();
    }
}

// Open in Editor, only for a World with a copy on this device.
{
    const view = await mount(1200);
    try {
        const cards = [...view.host.querySelectorAll('.world-card')];
        const gone = cards.find((card) => text(card.querySelector('h3')) === t('recentWorldsView.untitledWorld'));
        assert(!gone.querySelector('.world-card-open'), 'nothing to open for a World with no copy here');
        assert(!gone.querySelector('.publication-description') && gone.querySelector('.publication-preview-label'), 'which still has its placeholder');
        const open = cards[0].querySelector('.world-card-open');
        assert(open && text(open) === t('worldCard.open') && open.title === t('worldCard.openInEditor'), 'Open beside Continue Exploring');
        assert(open.offsetTop === cards[0].querySelector('.action-btn--explore').offsetTop, 'on the same line');
        open.click();
        await until(() => view.router.currentRoute.value.path === '/editor', 'the Editor');
        assert(view.router.currentRoute.value.query.load === harbor.documentId, 'loading that World');
        console.log('✓ Open in Editor, for Worlds kept on this device');
    } finally {
        view.unmount();
    }
}

// At phone width the featured card stacks and nothing overflows sideways.
{
    const view = await mount(360);
    try {
        const featured = view.host.querySelector('.world-card--featured');
        assert(getComputedStyle(featured).flexDirection === 'column', 'stacked on a phone');
        assert(document.documentElement.scrollWidth <= window.innerWidth, 'nothing overflows sideways');
        console.log('✓ My Worlds at phone width');
    } finally {
        view.unmount();
    }
}
