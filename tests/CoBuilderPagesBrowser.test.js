// @environment browser
import { createApp, nextTick } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import BuilderView from '../ui/views/BuilderView.js';
import RecentWorldsView from '../ui/views/RecentWorldsView.js';
import { PublishDocumentUseCase } from '../application/publication/PublishDocumentUseCase.js';
import { DocumentManager } from '../application/document/DocumentManager.js';
import { HelpedBuildsStore } from '../application/buildTogether/HelpedBuildsStore.js';
import { DecentralizedPublicationDiscoveryProvider } from '../discovery/DecentralizedPublicationDiscoveryProvider.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { Document } from '../core/document/Document.js';
import { DocumentMetadata } from '../core/document/DocumentMetadata.js';
import { World } from '../core/document/World.js';
import { Building } from '../core/building/Building.js';
import { Brick } from '../core/building/Brick.js';
import { Position } from '../core/document/Position.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { t } from '../ui/i18n/i18n.js';
import { assert } from './support/Assert.js';

// A builder's page by identity (ui/views/BuilderView.js) and My Worlds'
// "Builds you helped make", rendered by real Vue with the shipped CSS, from
// real signed Publications, at phone width.

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

function person(name) {
    const storage = new InMemoryStorageProvider();
    const identity = new LocalIdentityProvider(storage);
    identity.login(name);
    return { identity, storage, id: identity.getSigningIdentity().id };
}

function publish(owner, title, builtWith = []) {
    const world = new World();
    const building = new Building({ creator: 'x' });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    const manager = new DocumentManager();
    manager.load(new Document({ world, metadata: new DocumentMetadata({ title, author: 'x', authorIdentityId: owner.id, builtWith }) }), `doc-${title}`);
    return new PublishDocumentUseCase(new LocalPublisherProvider(owner.storage, new LocalContentStore(owner.storage)), owner.identity).execute(manager);
}

const ana = person('pages-ana');
const kim = person('pages-kim');
const discovery = new DecentralizedPublicationDiscoveryProvider();
const harbor = publish(ana, 'Pages Harbor', [{ name: 'Kim', identityId: kim.id }]);
const tower = publish(kim, 'Pages Tower');
discovery.add(harbor);
discovery.add(tower);
const helpedStore = new HelpedBuildsStore({ storageProvider: new InMemoryStorageProvider() });
helpedStore.note(kim.id, { documentId: 'pages-draft', title: 'Pages Draft', authorName: 'pages-ana', authorIdentityId: ana.id, at: '2026-10-01T00:00:00Z' });

async function mount(path, viewer, { actsFor = null } = {}) {
    const router = createRouter({
        history: createMemoryHistory(),
        routes: [
            { path: '/builder/:identityId', component: BuilderView },
            { path: '/worlds/recent', component: RecentWorldsView },
            { path: '/world/:id', component: { template: '<p>world</p>' } },
            { path: '/:rest(.*)', component: { template: '<p>elsewhere</p>' } }
        ]
    });
    await router.push(path);
    const host = document.createElement('div');
    host.style.cssText = 'display: flex; width: 360px; height: 800px;';
    document.body.appendChild(host);
    const app = createApp({ template: '<router-view />' });
    app.use(router);
    app.provide('decentralizedPublicationDiscoveryProvider', discovery);
    app.provide('identityUseCase', { provider: viewer.identity, currentUser: () => viewer.identity.currentUser() });
    app.provide('helpedBuildsStore', helpedStore);
    if (actsFor) app.provide('deviceAuthorizationUseCase', { resolveOwnSocialIdentity: () => ({ identityId: actsFor }) });
    app.mount(host);
    await nextTick();
    return { host, router, unmount: () => { app.unmount(); host.remove(); } };
}

const texts = (host, selector) => [...host.querySelectorAll(selector)].map((node) => node.textContent.replace(/\s+/g, ' ').trim());

// Kim's page, seen by Ana: the build he signed and the one he built with her.
{
    const view = await mount(`/builder/${encodeURIComponent(kim.id)}?name=Kim`, ana);
    try {
        await until(() => view.host.querySelector('.builder-view'), 'the page');
        assert(view.host.querySelector('h1').textContent.trim() === 'pages-kim', `named as he publishes (${view.host.querySelector('h1').textContent})`);
        assert(texts(view.host, '.builder-builds a').join() === 'Pages Tower', 'his build');
        assert(view.host.querySelector('.builder-builds a').getAttribute('href').endsWith(`/world/${tower.documentId}`), 'opening its World');
        assert(texts(view.host, '.builder-built-with a').join() === t('remixFamily.byAuthor', { title: 'Pages Harbor', author: 'pages-ana' }), `and the build he built with Ana (${texts(view.host, '.builder-built-with a')})`);
        assert(!view.host.querySelector('.builder-you') && !view.host.querySelector('.helped-builds-list'), 'not my page, so no list of mine');
        assert(document.documentElement.scrollWidth <= window.innerWidth, 'nothing overflows sideways');
        console.log('✓ a builder\'s page lists their builds and the ones they built with others');
    } finally {
        view.unmount();
    }
}

// Kim's own page: the builds he helped make, published or not yet.
{
    const view = await mount(`/builder/${encodeURIComponent(kim.id)}`, kim);
    try {
        await until(() => view.host.querySelector('.builder-view'), 'the page');
        assert(view.host.querySelector('.builder-you').textContent.trim() === t('builderView.you'), 'it says it\'s mine');
        const helped = texts(view.host, '.helped-build');
        assert(helped.length === 2 && helped[0].startsWith('Pages Harbor') && helped[1].includes(t('helpedBuilds.notPublished')), `the builds I helped make (${helped})`);
        const ownerLink = view.host.querySelector('.helped-build-author a');
        assert(ownerLink && ownerLink.getAttribute('href').includes(`/builder/${encodeURIComponent(ana.id)}`), 'each with a link to its author\'s page');
        console.log('✓ your own page lists the builds you helped make');
    } finally {
        view.unmount();
    }
}

// My Worlds lists them too; nobody who helped make nothing sees the section.
{
    const view = await mount('/worlds/recent', kim);
    try {
        await until(() => view.host.querySelector('.recent-worlds-view'), 'My Worlds');
        assert(view.host.querySelector('#recent-worlds-helped-title').textContent === t('helpedBuilds.title'), 'a section for the builds I helped make');
        const first = view.host.querySelector('.helped-build a.helped-build-title');
        assert(first && first.textContent === 'Pages Harbor' && first.getAttribute('href').endsWith(`/world/${harbor.documentId}`), 'the published one opens its World');
        assert(!view.host.querySelectorAll('.helped-build')[1].querySelector('a.helped-build-title'), 'the unpublished one, kept nowhere here, opens nowhere');
        console.log('✓ My Worlds lists the builds you helped make');
    } finally {
        view.unmount();
    }
    const alone = await mount('/worlds/recent', person('pages-nobody'));
    try {
        await until(() => alone.host.querySelector('.recent-worlds-view'), 'My Worlds');
        assert(!alone.host.querySelector('.helped-builds-shelf'), 'nobody who helped make nothing sees the section');
    } finally {
        alone.unmount();
    }
}

// Another device of Kim's (its own key, acting for his identity): his page is
// its own, with the builds he helped make, kept under the identity his
// devices share.
{
    const phone = person('pages-kims-phone');
    const view = await mount(`/builder/${encodeURIComponent(kim.id)}`, phone, { actsFor: kim.id });
    try {
        await until(() => view.host.querySelector('.builder-view'), 'the page');
        assert(view.host.querySelector('.builder-you'), 'his other device knows the page is his');
        assert(view.host.querySelectorAll('.helped-build').length === 2, 'and lists the builds he helped make');
        console.log('✓ your other devices know your page, and the builds you helped make');
    } finally {
        view.unmount();
    }
}
