// @environment browser
import { createApp } from 'vue';
import EmbedView from '../ui/embed/EmbedView.js';
import { prepareLinkOnlyShare } from '../application/publication/PublicationShareLink.js';
import { composeWorldEncounterMaterialVerifier } from '../application/worldEncounter/WorldEncounterMaterialVerifierRuntimeComposition.js';
import { PublishDocumentUseCase } from '../application/publication/PublishDocumentUseCase.js';
import { DocumentManager } from '../application/document/DocumentManager.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { ShowcaseLibrary } from '../core/library/ShowcaseLibrary.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { License, LicenseId } from '../core/License.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { t } from '../ui/i18n/i18n.js';
import { assert } from './support/Assert.js';

// The embed page's view (embed.html, ui/embed/EmbedView.js), rendered by real
// Vue in a real browser: a signed build turns, a drag turns it by hand, and
// its one link opens the shared link's screen in ForkBuild; a damaged one
// says so. Each step is counted.

const APP_URL = 'https://forkbuild.example/app/';

async function payloadOf({ title = 'Castle on the hill', license = LicenseId.CC_BY_4_0 } = {}) {
    const storage = new InMemoryStorageProvider();
    const identity = new LocalIdentityProvider(storage);
    identity.login('alice');
    const contentStore = new LocalContentStore(storage);
    const world = new World();
    const building = new Building({ creator: 'alice' });
    for (const brick of ShowcaseLibrary.structures.find((s) => s.id === 'showcase:castle').bricks) {
        building.addBrick(new Brick({ definitionId: brick.definitionId, position: brick.position, rotation: brick.rotation, color: brick.color }));
    }
    world.addBuilding(building);
    const manager = new DocumentManager();
    manager.load(new Document({ world, metadata: new DocumentMetadata({ title, author: 'alice', license: new License({ id: license }) }) }), 'doc-embed-browser');
    const publication = new PublishDocumentUseCase(new LocalPublisherProvider(storage, contentStore), identity).execute(manager);
    return (await prepareLinkOnlyShare({ publication, contentStore })).payload;
}

function mount(payload) {
    const counted = [];
    const host = document.createElement('div');
    host.style.cssText = 'width: 640px; height: 480px; display: flex; flex-direction: column;';
    document.body.appendChild(host);
    // The link opens a new tab; here only its handler is followed.
    host.addEventListener('click', (event) => event.preventDefault());
    const funnel = { embedViewed: () => counted.push('embed-view'), openedFromEmbed: () => counted.push('embed-open') };
    const app = createApp(EmbedView, { payload, verifier: composeWorldEncounterMaterialVerifier().verifier, funnel, appUrl: APP_URL });
    app.mount(host);
    return { host, counted, unmount: () => { app.unmount(); host.remove(); } };
}

async function until(condition, what) {
    for (let i = 0; i < 400; i++) {
        if (condition()) return;
        await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`timed out waiting for ${what}`);
}

// A signed build: turning, named, one link into ForkBuild.
{
    const payload = await payloadOf();
    const { host, counted, unmount } = mount(payload);
    await until(() => host.querySelector('.embed-open'), 'the build');
    assert(host.querySelector('.embed-title').textContent.trim() === 'Castle on the hill', 'named');
    assert(host.querySelector('.embed-author').textContent.trim() === t('publicationLink.by', { author: 'alice' }), 'with its maker');
    const open = host.querySelector('.embed-open');
    assert(open.textContent.trim() === t('embed.remix'), `a build others may remix offers Remix on ForkBuild (${open.textContent.trim()})`);
    assert(open.getAttribute('href') === `${APP_URL}#/s/${payload}` && open.target === '_blank' && open.rel === 'noopener',
        'which opens the shared link\'s screen of this copy of ForkBuild in a new tab');
    assert(counted.join() === 'embed-view', `being shown is counted once (${counted})`);

    await until(() => host.querySelector('canvas.build-turntable-canvas--draggable'), 'the turning build');
    const canvas = host.querySelector('canvas');
    assert(canvas.getAttribute('aria-label') === t('embed.turntableLabel', { title: 'Castle on the hill' }), 'described for screen readers');
    assert(host.querySelector('.embed-hint'), 'saying it can be dragged');
    const box = canvas.getBoundingClientRect();
    const pointer = (type, x) => canvas.dispatchEvent(new PointerEvent(type, { pointerId: 7, clientX: box.left + x, clientY: box.top + 100, bubbles: true }));
    pointer('pointerdown', 100);
    pointer('pointermove', 180);
    pointer('pointerup', 180);
    await until(() => !host.querySelector('.embed-hint'), 'the hint to go once dragged');

    open.click();
    assert(counted.join() === 'embed-view,embed-open', `opening it in ForkBuild is counted (${counted})`);
    assert(!host.querySelector('[role="alert"]'), 'no error is shown');
    unmount();
    console.log('✓ a signed build turns, turns by hand, and opens in ForkBuild');
}

// A build its maker allows no copies of is opened, not remixed.
{
    const { host, unmount } = mount(await payloadOf({ license: LicenseId.ALL_RIGHTS_RESERVED }));
    await until(() => host.querySelector('.embed-open'), 'the build');
    assert(host.querySelector('.embed-open').textContent.trim() === t('embed.open'), 'Open in ForkBuild');
    unmount();
    console.log('✓ a build with no copies allowed offers Open in ForkBuild');
}

// A damaged embed says so, and links to ForkBuild.
{
    const { host, counted, unmount } = mount('1AAAAAAAA');
    await until(() => host.querySelector('[role="alert"]'), 'the complaint');
    assert(host.querySelector('[role="alert"]').textContent.trim() === t('embed.invalid'), 'it says the embed is damaged');
    assert(!host.querySelector('.embed-open') && host.querySelector('.embed-status a').getAttribute('href') === APP_URL, 'and links to ForkBuild only');
    assert(counted.length === 0, 'nothing is counted');
    unmount();
    console.log('✓ a damaged embed says so');
}
