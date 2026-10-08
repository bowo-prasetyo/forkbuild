// @environment browser
import { createApp, nextTick } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import PublicationLinkView from '../ui/views/PublicationLinkView.js';
import { OpenPublicationLinkOutcome } from '../application/publication/OpenPublicationLink.js';
import { encodePublicationLinkPayload } from '../application/publication/sharing/PublicationLinkPayload.js';
import { PublishDocumentUseCase } from '../application/publication/PublishDocumentUseCase.js';
import { DocumentManager } from '../application/document/DocumentManager.js';
import { DecentralizedPublicationDiscoveryProvider } from '../discovery/DecentralizedPublicationDiscoveryProvider.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { Publication } from '../publisher/Publication.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { ShowcaseLibrary } from '../core/library/ShowcaseLibrary.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { License, LicenseId } from '../core/License.js';
import { EditorEntryReason } from '../core/EditorEntryContext.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { t } from '../ui/i18n/i18n.js';
import { assert } from './support/Assert.js';

// The screen a shared link opens on, rendered by real Vue with the shipped
// CSS: the build turning, its maker, what it was remixed from and how many
// remixes of it this device knows, Edit a Copy (the fork World View makes,
// with this build's World to go back to) and the walk around it; a build
// whose license allows no copies offers only the walk. (The phone layout is
// checked in tests/run-bundle.mjs, which can size the window.)

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
        await new Promise((resolve) => setTimeout(resolve, 25));
    }
}

// A castle published by alice, as a remix of bob's "Old Keep" when `remix`.
function publishCastle({ license = LicenseId.CC_BY_4_0, remix = true } = {}) {
    const storage = new InMemoryStorageProvider();
    const identity = new LocalIdentityProvider(storage);
    identity.login('link-view-alice');
    const contentStore = new LocalContentStore(storage);
    const world = new World();
    const building = new Building({ creator: 'alice' });
    for (const brick of ShowcaseLibrary.structures.find((s) => s.id === 'showcase:castle').bricks) {
        building.addBrick(new Brick({ definitionId: brick.definitionId, position: brick.position, rotation: brick.rotation, color: brick.color }));
    }
    world.addBuilding(building);
    const attribution = remix ? { author: 'bob', title: 'Old Keep', sourcePublicationId: 'pub-old-keep', sourceDocumentId: 'doc-old-keep' } : null;
    const manager = new DocumentManager();
    manager.load(new Document({
        world,
        metadata: new DocumentMetadata({
            title: 'Castle on the hill', author: 'alice',
            license: new License({ id: license, attribution }),
            parentDocumentId: remix ? 'doc-old-keep' : null
        })
    }), `doc-castle-${license}`);
    const publication = new PublishDocumentUseCase(new LocalPublisherProvider(storage, contentStore), identity).execute(manager);
    return { publication, contentStore };
}

function remixOf(documentId, remixDocumentId, id, publishedAt) {
    return new Publication({ id, documentId: remixDocumentId, title: `Remix ${id}`, author: 'carol', providerId: 'local', publishedAt, parentDocumentId: documentId, contentHash: 'sha256:00' });
}

// Mounts the view on `#/s/<payload>`, opening the link with a stand-in for
// ui/main.js's openPublicationLink that has already checked it.
async function mount({ publication, contentStore, discovery = new DecentralizedPublicationDiscoveryProvider(), outcome = OpenPublicationLinkOutcome.OPENED }) {
    const payload = await encodePublicationLinkPayload({ claim: publication.toJSON(), snapshotText: await contentStore.get(publication.contentReference) });
    const counted = [];
    const router = createRouter({
        history: createMemoryHistory(),
        routes: [
            { path: '/s/:payload', component: PublicationLinkView },
            { path: '/editor', component: { template: '<p>editor</p>' } },
            { path: '/world/:id', component: { template: '<p>world</p>' } },
            { path: '/', component: { template: '<p>home</p>' } }
        ]
    });
    await router.push(`/s/${payload}`);
    const host = document.createElement('div');
    host.style.cssText = 'display: flex; width: 1200px; height: 800px;';
    document.body.appendChild(host);
    const app = createApp({ template: '<router-view />' });
    app.use(router);
    app.provide('openPublicationLink', async ({ linkOnly }) => {
        assert(linkOnly && linkOnly.claim.id === publication.id, 'the view opens the claim the link carries');
        return outcome === OpenPublicationLinkOutcome.OPENED
            ? { outcome, publication, documentId: publication.documentId, message: null }
            : { outcome, publication: null, documentId: null, message: t('publicationLink.damaged') };
    });
    app.provide('publicationContentStore', contentStore);
    app.provide('decentralizedPublicationDiscoveryProvider', discovery);
    app.provide('funnelEventCounter', { openedSharedLink: (documentId) => counted.push(documentId) });
    app.mount(host);
    await nextTick();
    return { host, router, counted, unmount: () => { app.unmount(); host.remove(); } };
}

const text = (host, selector) => host.querySelector(selector)?.textContent.trim() ?? null;

// A remix, with remixes of its own: who made it, where it came from, how often
// it was remixed, and Edit a Copy into the Editor.
{
    const castle = publishCastle();
    const discovery = new DecentralizedPublicationDiscoveryProvider();
    discovery.add(remixOf(castle.publication.documentId, 'doc-remix-1', 'pub-remix-1a', '2026-10-01T00:00:00Z'));
    discovery.add(remixOf(castle.publication.documentId, 'doc-remix-1', 'pub-remix-1b', '2026-10-02T00:00:00Z'));
    discovery.add(remixOf(castle.publication.documentId, 'doc-remix-2', 'pub-remix-2', '2026-10-03T00:00:00Z'));
    discovery.add(remixOf('doc-someone-else', 'doc-remix-3', 'pub-remix-3', '2026-10-03T00:00:00Z'));
    const view = await mount({ ...castle, discovery });
    try {
        await until(() => view.host.querySelector('.shared-build-view'), 'the arrival screen');
        assert(text(view.host, '.shared-build-title') === 'Castle on the hill', 'it names the build');
        assert(text(view.host, '.shared-build-author') === t('publicationLink.by', { author: 'link-view-alice' }), `and its maker (${text(view.host, '.shared-build-author')})`);
        assert(text(view.host, '.shared-build-remixed-from') === t('remix.fromBy', { title: 'Old Keep', author: 'bob' }),
            `it says what it was remixed from, from the credit its license carries (${text(view.host, '.shared-build-remixed-from')})`);
        assert(text(view.host, '.shared-build-remix-count') === t('remix.count', { count: 2 }),
            `and counts its remixes, one per remixed build (${text(view.host, '.shared-build-remix-count')})`);
        assert(view.counted.join() === castle.publication.documentId, 'opening it is counted once, for this build');
        assert(text(view.host, '.shared-build-hint') === t('publicationLink.editCopyHint'), 'it says a copy needs no account');
        await until(() => view.host.querySelector('.shared-build-stage .build-turntable-canvas, .shared-build-stage .build-turntable-fallback'), 'the turning build');
        const edit = view.host.querySelector('.shared-build-edit-copy');
        assert(edit && edit.textContent.trim() === t('publicationLink.editCopy'), 'Edit a Copy is offered');
        const button = edit.getBoundingClientRect();
        assert(button.height >= 40, `as the big button (${button.height}px tall)`);
        edit.click();
        await until(() => view.router.currentRoute.value.path === '/editor', 'the Editor');
        const query = view.router.currentRoute.value.query;
        assert(query.fork === castle.publication.documentId && query.publication === castle.publication.id,
            'Edit a Copy forks this build, naming its Publication so its license and build are found');
        assert(query.entryReason === EditorEntryReason.SHARED_LINK_EDIT_COPY && query.entryReturnWorld === castle.publication.documentId && query.entryTitle === 'Castle on the hill',
            'with this build\'s World to go back to');
        console.log('✓ a shared remix shows its maker, its source and its remixes, and Edit a Copy forks it');
    } finally {
        view.unmount();
    }
}

// The parent's own Publication, when this device has it, names the source.
{
    const castle = publishCastle();
    const discovery = new DecentralizedPublicationDiscoveryProvider();
    discovery.add(new Publication({ id: 'pub-old-keep-2', documentId: 'doc-old-keep', title: 'The Old Keep, rebuilt', author: 'bob-the-builder', providerId: 'local', publishedAt: '2026-10-05T00:00:00Z', contentHash: 'sha256:00' }));
    const view = await mount({ ...castle, discovery });
    try {
        await until(() => view.host.querySelector('.shared-build-view'), 'the arrival screen');
        assert(text(view.host, '.shared-build-remixed-from') === t('remix.fromBy', { title: 'The Old Keep, rebuilt', author: 'bob-the-builder' }),
            `the parent's own Publication names it (${text(view.host, '.shared-build-remixed-from')})`);
        assert(!view.host.querySelector('.shared-build-remix-count'), 'a build no one has remixed shows no count');
        console.log('✓ the source is named from its own Publication when this device knows it');
    } finally {
        view.unmount();
    }
}

// A build whose license allows no copies: only the walk around it.
{
    const castle = publishCastle({ license: LicenseId.ALL_RIGHTS_RESERVED, remix: false });
    const view = await mount(castle);
    try {
        await until(() => view.host.querySelector('.shared-build-view'), 'the arrival screen');
        assert(!view.host.querySelector('.shared-build-edit-copy'), 'no Edit a Copy');
        assert(!view.host.querySelector('.shared-build-lineage'), 'and no lineage for a build that isn\'t a remix');
        assert(text(view.host, '.shared-build-hint') === t('publicationLink.noRemix'), 'it says why');
        const walk = view.host.querySelector('.shared-build-walk');
        assert(walk.classList.contains('cta-button'), 'the walk is the main button instead');
        walk.click();
        await until(() => view.router.currentRoute.value.path === `/world/${castle.publication.documentId}`, 'World View');
        console.log('✓ a build that may not be copied offers only the walk around it');
    } finally {
        view.unmount();
    }
}

// A link that fails still says why, as before.
{
    const castle = publishCastle();
    const view = await mount({ ...castle, outcome: OpenPublicationLinkOutcome.INVALID_LINK });
    try {
        await until(() => view.host.querySelector('.publication-link-message'), 'the message');
        assert(!view.host.querySelector('.shared-build-view'), 'no arrival screen');
        assert(text(view.host, '.publication-link-message') === t('publicationLink.damaged'), 'it says what went wrong');
        assert(view.counted.length === 0, 'and nothing is counted as opened');
        console.log('✓ a link that can\'t open says why');
    } finally {
        view.unmount();
    }
}
