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
import { Document } from '../core/document/Document.js';
import { DocumentMetadata } from '../core/document/DocumentMetadata.js';
import { World } from '../core/document/World.js';
import { Building } from '../core/building/Building.js';
import { Brick } from '../core/building/Brick.js';
import { License, LicenseId } from '../core/document/License.js';
import { EditorEntryReason } from '../core/document/EditorEntryContext.js';
import { SimilarBuildFinder } from '../application/publication/SimilarBuildFinder.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { t } from '../ui/i18n/i18n.js';
import { assert } from './support/Assert.js';

// The screen a shared link opens on, rendered by real Vue with the shipped
// CSS: the build turning, its maker, what it was remixed from and how many
// remixes of it this device knows, Edit a Copy (the fork World View makes,
// with this build's World to go back to) and the walk around it; a build
// whose license allows no copies offers only the walk, and your own build
// offers Keep building instead of a copy. (The phone layout is
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
function publishCastle({ license = LicenseId.CC_BY_4_0, remix = true, builtWith = [] } = {}) {
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
            parentDocumentId: remix ? 'doc-old-keep' : null,
            builtWith
        })
    }), `doc-castle-${license}`);
    const publication = new PublishDocumentUseCase(new LocalPublisherProvider(storage, contentStore), identity).execute(manager);
    return { publication, contentStore, identity };
}

function remixOf(documentId, remixDocumentId, id, publishedAt) {
    return new Publication({ id, documentId: remixDocumentId, title: `Remix ${id}`, author: 'carol', providerId: 'local', publishedAt, parentDocumentId: documentId, contentHash: 'sha256:00' });
}

// Mounts the view on `#/s/<payload>`, opening the link with a stand-in for
// ui/main.js's openPublicationLink that has already checked it.
async function mount({ publication, contentStore, discovery = new DecentralizedPublicationDiscoveryProvider(), outcome = OpenPublicationLinkOutcome.OPENED, similarBuildFinder = null, viewer = null }) {
    const payload = await encodePublicationLinkPayload({ claim: publication.toJSON(), snapshotText: await contentStore.get(publication.contentReference) });
    const counted = [];
    const router = createRouter({
        history: createMemoryHistory(),
        routes: [
            { path: '/s/:payload', component: PublicationLinkView },
            { path: '/editor', component: { template: '<p>editor</p>' } },
            { path: '/world/:id', component: { template: '<p>world</p>' } },
            { path: '/builder/:identityId', component: { template: '<p>builder</p>' } },
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
    if (similarBuildFinder) app.provide('similarBuildFinder', similarBuildFinder);
    // Who is looking: an identity provider whose name is in use.
    if (viewer) app.provide('identityUseCase', { provider: viewer });
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
        assert(!view.host.querySelector('.shared-build-built-with'), 'a build made alone credits nobody else');
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

// A build made together credits the friends who built it with its author
// (core/catalog/BuiltWith.js), here and in its family tree.
{
    const castle = publishCastle({ remix: false, builtWith: [{ name: 'Kim', identityId: 'did:key:z6MkKim' }, { name: 'Sam', identityId: 'did:key:z6MkSam' }] });
    const discovery = new DecentralizedPublicationDiscoveryProvider();
    discovery.add(remixOf(castle.publication.documentId, 'doc-remix-9', 'pub-remix-9', '2026-10-04T00:00:00Z'));
    const view = await mount({ ...castle, discovery });
    try {
        await until(() => view.host.querySelector('.shared-build-view'), 'the arrival screen');
        const names = new Intl.ListFormat('en', { type: 'conjunction' }).format(['Kim', 'Sam']);
        assert(text(view.host, '.shared-build-built-with') === t('builtWith.line', { names }), `it says who built it with its maker (${text(view.host, '.shared-build-built-with')})`);
        const nameLinks = [...view.host.querySelectorAll('.shared-build-built-with a.built-with-name')];
        assert(nameLinks.map((link) => link.textContent).join() === 'Kim,Sam' && nameLinks[0].getAttribute('href').includes(`/builder/${encodeURIComponent('did:key:z6MkKim')}`),
            'each name links to that person\'s page');
        const authorLink = view.host.querySelector('.shared-build-author a.shared-build-author-link');
        assert(authorLink && authorLink.getAttribute('href').includes(`/builder/${encodeURIComponent(castle.publication.publisherIdentity.id)}`), 'and the maker\'s name to theirs, by the identity that signed it');
        const self = view.host.querySelector('.remix-family-self .remix-family-label');
        assert(self && self.textContent.replace(/\s+/g, ' ').trim() === t('remixFamily.byAuthorWith', { title: 'Castle on the hill', author: 'link-view-alice', names }), `and so does its family tree (${self && self.textContent})`);
        assert(view.host.querySelector('.remix-family-self strong').textContent === 'Castle on the hill', 'this build\'s own title in bold');
        assert(view.host.querySelector('.remix-family-self .remix-family-author').getAttribute('href').includes(`/builder/${encodeURIComponent(castle.publication.publisherIdentity.id)}`), 'its maker linking to their page');
        assert([...view.host.querySelectorAll('.remix-family-self .built-with-name')].map((link) => link.textContent).join() === 'Kim,Sam', 'and each co-builder to theirs');
        console.log('✓ a build made together credits everyone who built it');
    } finally {
        view.unmount();
    }
}

// A short link (`#/n/<publication id>`): the notes the relays hold are opened
// newest first until one checks out; with none, it says so and offers Try
// again, which asks the relays once more.
{
    const castle = publishCastle({ remix: false });
    const linkOnly = { claim: castle.publication.toJSON(), snapshotText: await castle.contentStore.get(castle.publication.contentReference) };
    const forged = { claim: { ...linkOnly.claim, title: 'Free prizes' }, snapshotText: linkOnly.snapshotText };
    let answers = [];
    const asked = [];
    const opened = [];
    const router = createRouter({
        history: createMemoryHistory(),
        routes: [
            { path: '/n/:noteId', component: PublicationLinkView },
            { path: '/', component: { template: '<p>home</p>' } }
        ]
    });
    await router.push(`/n/${castle.publication.id}`);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp({ template: '<router-view />' });
    app.use(router);
    app.provide('buildNoteDiscovery', { findLinkOnly: async (id) => { asked.push(id); return answers; } });
    app.provide('openPublicationLink', async ({ linkOnly: candidate }) => {
        opened.push(candidate.claim.title);
        return candidate === forged
            ? { outcome: OpenPublicationLinkOutcome.NOT_VERIFIED, publication: null, documentId: null, message: 'forged' }
            : { outcome: OpenPublicationLinkOutcome.OPENED, publication: castle.publication, documentId: castle.publication.documentId, message: null };
    });
    app.provide('publicationContentStore', castle.contentStore);
    app.provide('decentralizedPublicationDiscoveryProvider', new DecentralizedPublicationDiscoveryProvider());
    app.provide('funnelEventCounter', { openedSharedLink: () => {} });
    app.mount(host);
    try {
        await until(() => host.querySelector('.publication-link-message'), 'the message');
        assert(asked.join() === castle.publication.id, 'the relays are asked for the build the link names');
        assert(text(host, '.publication-link-message') === t('publicationLink.noteNotFound'), 'with no note, it says the build isn\'t on the relays');
        const retry = [...host.querySelectorAll('.publication-link-actions button')].find((button) => button.textContent.trim() === t('publicationLink.tryAgain'));
        assert(retry, 'and offers Try again');

        answers = [forged, linkOnly];
        retry.click();
        await until(() => host.querySelector('.shared-build-view'), 'the arrival screen');
        assert(asked.length === 2, 'Try again asks the relays once more');
        assert(opened.join('|') === 'Free prizes|Castle on the hill', 'the newest note, forged, is passed over for the one that checks out');
        assert(host.querySelector('.shared-build-view').textContent.includes('Castle on the hill'), 'the build arrives');
        console.log('✓ a short link opens the note that checks out, and says when there is none');
    } finally {
        app.unmount();
        host.remove();
    }
}

// Under the family tree, builds by other people published before this one that
// look a lot like it (application/publication/SimilarBuildFinder.js), with the
// plain word that looking alike doesn't mean anyone copied.
{
    const castle = publishCastle({ remix: false });
    // The same castle, moved, published by dora before alice's, and by zed after.
    function copyOf(documentId, author, publishedAt) {
        const world = new World();
        const building = new Building({ creator: author });
        for (const brick of ShowcaseLibrary.structures.find((s) => s.id === 'showcase:castle').bricks) {
            building.addBrick(new Brick({ definitionId: brick.definitionId, position: { x: brick.position.x + 7, y: brick.position.y, z: brick.position.z - 3 }, rotation: brick.rotation, color: brick.color }));
        }
        world.addBuilding(building);
        const reference = castle.contentStore.put(JSON.stringify(new Document({ world, metadata: new DocumentMetadata({ title: `${author}'s castle`, author }) }).toJSON()));
        return new Publication({
            id: `pub-${documentId}`, documentId, title: `${author}'s castle`, author, providerId: 'local', publishedAt,
            contentHash: reference.hash, contentReference: reference, publisherIdentity: { id: `did:key:${author}` }
        });
    }
    const discovery = new DecentralizedPublicationDiscoveryProvider();
    discovery.add(copyOf('doc-dora-castle', 'dora', '2026-01-02T00:00:00Z'));
    discovery.add(copyOf('doc-zed-castle', 'zed', '2099-01-01T00:00:00Z'));
    const finder = new SimilarBuildFinder({ listPublications: () => discovery.list(), contentStore: castle.contentStore });
    const view = await mount({ ...castle, discovery, similarBuildFinder: finder });
    try {
        await until(() => view.host.querySelector('.similar-earlier'), 'the similar builds published earlier');
        assert(text(view.host, '.similar-earlier-title') === t('similarEarlier.title'), 'it has its own heading');
        const builds = [...view.host.querySelectorAll('.similar-earlier-build')];
        assert(builds.length === 1, `only the build published before it is listed (${builds.length})`);
        assert(builds[0].querySelector('.similar-earlier-name').textContent.replace(/\s+/g, ' ').trim() === t('similarEarlier.byAuthor', { title: 'dora\'s castle', author: 'dora' }),
            `with its title and maker (${builds[0].textContent})`);
        assert(builds[0].querySelector('a.similar-earlier-link').getAttribute('href').includes('/world/doc-dora-castle'), 'opening where the Repository would open it');
        assert(!builds[0].querySelector('a.similar-earlier-author'), 'a maker whose signature doesn\'t check out isn\'t linked to a page');
        assert(text(builds[0], '.similar-earlier-detail').startsWith(t('similarEarlier.percent', { percent: 100 })), `how alike, and when it was published (${text(builds[0], '.similar-earlier-detail')})`);
        assert(text(view.host, '.similar-earlier-note') === t('similarEarlier.note'), 'and that looking alike doesn\'t mean anyone copied');
        const tree = view.host.querySelector('.remix-family');
        assert(!tree || (tree.compareDocumentPosition(view.host.querySelector('.similar-earlier')) & Node.DOCUMENT_POSITION_FOLLOWING), 'under the family tree');
        console.log('✓ a build\'s page lists builds published earlier that look like it');
    } finally {
        view.unmount();
    }

    const failing = await mount({ ...castle, discovery, similarBuildFinder: { findEarlier: async () => { throw new Error('storage blocked'); } } });
    try {
        await until(() => failing.host.querySelector('.shared-build-view'), 'the arrival screen');
        await new Promise((resolve) => setTimeout(resolve, 50));
        assert(!failing.host.querySelector('.similar-earlier'), 'a failed look shows nothing');
        assert(text(failing.host, '.shared-build-title') === 'Castle on the hill', 'and the build shows as always');
    } finally {
        failing.unmount();
    }
    const none = await mount({ ...castle, similarBuildFinder: { findEarlier: async () => [] } });
    try {
        await until(() => none.host.querySelector('.shared-build-view'), 'the arrival screen');
        await new Promise((resolve) => setTimeout(resolve, 50));
        assert(!none.host.querySelector('.similar-earlier'), 'with nothing alike, there is no section');
    } finally {
        none.unmount();
    }
    console.log('✓ nothing alike, or a failed look, shows no section');
}

// Your own build: no copy of itself. Saved on this device, Keep building
// opens it in the Editor; built on another, the page says where to change it.
{
    const castle = publishCastle();
    const storage = new LocalStorageProvider();
    const documentId = castle.publication.documentId;
    storage.remove(documentId);
    const elsewhere = await mount({ ...castle, viewer: castle.identity });
    try {
        await until(() => elsewhere.host.querySelector('.shared-build-view'), 'the arrival screen');
        assert(!elsewhere.host.querySelector('.shared-build-edit-copy'), 'its maker isn\'t offered a copy of it');
        assert(!elsewhere.host.querySelector('.shared-build-keep-building'), 'and, with it saved on another device, nothing to open here');
        assert(text(elsewhere.host, '.shared-build-hint') === t('publicationLink.yoursElsewhere'), `the page says where it can be changed (${text(elsewhere.host, '.shared-build-hint')})`);
        assert(elsewhere.host.querySelector('.shared-build-walk').classList.contains('cta-button'), 'and the walk is the main button');
    } finally {
        elsewhere.unmount();
    }

    storage.save(documentId, { saved: true });
    const here = await mount({ ...castle, viewer: castle.identity });
    try {
        await until(() => here.host.querySelector('.shared-build-view'), 'the arrival screen');
        assert(!here.host.querySelector('.shared-build-edit-copy'), 'saved here, still no copy');
        const keep = here.host.querySelector('.shared-build-keep-building');
        assert(keep && keep.classList.contains('cta-button') && keep.textContent.trim() === t('publicationLink.keepBuilding'), 'Keep building is the main button');
        assert(!here.host.querySelector('.shared-build-walk').classList.contains('cta-button'), 'with the walk second');
        assert(text(here.host, '.shared-build-hint') === t('publicationLink.yoursHint'), 'it says the build opens as it was saved');
        keep.click();
        await until(() => here.router.currentRoute.value.path === '/editor', 'the Editor');
        const query = here.router.currentRoute.value.query;
        assert(query.load === documentId && !query.fork, `it opens the build itself, not a copy (${JSON.stringify(query)})`);
    } finally {
        here.unmount();
        storage.remove(documentId);
    }

    const someoneElse = new LocalIdentityProvider(new InMemoryStorageProvider());
    someoneElse.login('link-view-bob');
    const visitor = await mount({ ...castle, viewer: someoneElse });
    try {
        await until(() => visitor.host.querySelector('.shared-build-view'), 'the arrival screen');
        assert(visitor.host.querySelector('.shared-build-edit-copy') && !visitor.host.querySelector('.shared-build-keep-building'), 'anyone else is offered Edit a Copy');
        assert(text(visitor.host, '.shared-build-hint') === t('publicationLink.editCopyHint'), 'with the copy\'s hint');
    } finally {
        visitor.unmount();
    }
    console.log('✓ your own build offers Keep building when it is saved here, and no copy of itself');
}
