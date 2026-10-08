// @environment browser
import { createApp } from 'vue';
import PublicationShareLink from '../ui/components/PublicationShareLink.js';
import { decodePublicationLinkPayload } from '../application/publication/sharing/PublicationLinkPayload.js';
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
import { BUILD_PICTURE_HEIGHT, BUILD_PICTURE_WIDTH } from '../renderer/BuildPicture.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { t } from '../ui/i18n/i18n.js';
import { challengeAt } from '../core/BuildChallenge.js';
import { assert } from './support/Assert.js';

// Share, Copy link and Save picture for a build just published, rendered by
// real Vue in a real browser: the link carries the build, copying it is
// counted, and the picture is a PNG of the build at link-preview size.

function publishCastle({ signedIn = true, tags = [] } = {}) {
    const storage = new InMemoryStorageProvider();
    const identity = new LocalIdentityProvider(storage);
    if (signedIn) identity.login('share-browser-alice');
    const contentStore = new LocalContentStore(storage);
    const world = new World();
    const building = new Building({ creator: 'alice' });
    for (const brick of ShowcaseLibrary.structures.find((s) => s.id === 'showcase:castle').bricks) {
        building.addBrick(new Brick({ definitionId: brick.definitionId, position: brick.position, rotation: brick.rotation, color: brick.color }));
    }
    world.addBuilding(building);
    const manager = new DocumentManager();
    manager.load(new Document({ world, metadata: new DocumentMetadata({ title: 'Castle on the hill', author: 'alice', license: new License({ id: LicenseId.CC_BY_4_0 }), tags }) }), 'doc-castle');
    const publication = new PublishDocumentUseCase(new LocalPublisherProvider(storage, contentStore), identity).execute(manager);
    return { publication, contentStore };
}

function mount({ publication, contentStore }) {
    const counted = [];
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp(PublicationShareLink, { publicationId: publication.id, title: publication.title, publication });
    app.provide('publicationContentStore', contentStore);
    app.provide('funnelEventCounter', { sharedLink: () => counted.push('share-link'), copiedEmbedCode: () => counted.push('embed-code') });
    app.mount(host);
    return { host, counted, unmount: () => { app.unmount(); host.remove(); } };
}

async function until(condition, what) {
    for (let i = 0; i < 200; i++) {
        if (condition()) return;
        await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`timed out waiting for ${what}`);
}

// Copying goes to a clipboard this test reads; downloads to a list.
const copied = [];
Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text) => { copied.push(text); } } });
const downloads = [];
HTMLAnchorElement.prototype.click = function captureDownload() {
    downloads.push({ href: this.href, download: this.download });
};

// A just-published build has a link straight away, with the build inside.
{
    const castle = publishCastle();
    const { host, counted, unmount } = mount(castle);
    await until(() => host.querySelector('.publication-share-link-url'), 'the link');
    const url = host.querySelector('.publication-share-link-url').value;
    assert(url.startsWith('https://forkbuild-rendezvous.prazjp.workers.dev/b/1'), `the link is a link-only share, through the link-preview worker (got ${url.slice(0, 60)})`);
    const decoded = await decodePublicationLinkPayload(url.slice(url.indexOf('/b/') + 3));
    assert(decoded.claim.id === castle.publication.id && decoded.snapshotText === castle.contentStore.getSync(castle.publication.contentReference), 'it carries the signed claim and the exact build');
    assert(host.textContent.includes(t('share.linkOnlyHint')), 'it says the build travels inside the link');

    const copy = [...host.querySelectorAll('button')].find((button) => button.textContent.trim() === t('share.copy'));
    copy.click();
    await until(() => host.querySelector('.publication-share-link-feedback').textContent === t('share.copied'), 'the copy to be confirmed');
    assert(copied.length === 1 && copied[0] === url && counted.join() === 'share-link', `copying puts the link on the clipboard and is counted (${counted})`);
    console.log('✓ a just-published build shares inside the link');

    // The picture: a PNG at link-preview size, named after the build.
    host.querySelector('.publication-share-link-picture').click();
    await until(() => downloads.length === 1, 'the picture');
    const [{ href, download }] = downloads;
    assert(download === 'forkbuild-castle-on-the-hill.png', `named after the build (got ${download})`);
    const blob = await (await fetch(href)).blob();
    assert(blob.type === 'image/png', `a PNG (got ${blob.type})`);
    const bitmap = await createImageBitmap(blob);
    assert(bitmap.width === BUILD_PICTURE_WIDTH && bitmap.height === BUILD_PICTURE_HEIGHT, `at 1200 × 630 (got ${bitmap.width} × ${bitmap.height})`);
    // The middle shows the build, not only the sky: some pixel there is far from sky blue.
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d');
    context.drawImage(bitmap, 0, 0);
    const { data } = context.getImageData(400, 150, 400, 300);
    let notSky = 0;
    for (let i = 0; i < data.length; i += 4) {
        if (Math.abs(data[i] - 0x87) + Math.abs(data[i + 1] - 0xce) + Math.abs(data[i + 2] - 0xeb) > 90) notSky++;
    }
    assert(notSky > 5000, `the build is drawn in the middle (${notSky} pixels that aren't sky)`);
    const strip = context.getImageData(0, BUILD_PICTURE_HEIGHT - 40, BUILD_PICTURE_WIDTH, 1).data;
    let light = 0;
    for (let i = 0; i < strip.length; i += 4) if (strip[i] > 200 && strip[i + 1] > 200 && strip[i + 2] > 200) light++;
    assert(light > 20, `the strip along the bottom carries text (${light} light pixels)`);
    assert(!host.querySelector('[role="alert"]'), 'no error is shown');
    console.log('✓ Save picture downloads a 1200 × 630 PNG of the build');

    // Embed: the <iframe> code, with the same build inside, to copy.
    assert(!host.querySelector('.publication-share-embed'), 'the embed code starts folded away');
    const embedButton = host.querySelector('.publication-share-link-embed');
    assert(embedButton && embedButton.getAttribute('aria-expanded') === 'false', 'Embed is offered');
    embedButton.click();
    await until(() => host.querySelector('.publication-share-embed-code'), 'the embed code');
    const code = host.querySelector('.publication-share-embed-code').value;
    const payload = url.slice(url.indexOf('/b/') + 3);
    assert(code.startsWith(`<iframe src="https://bowo-prasetyo.github.io/forkbuild/embed.html#${payload}" `), `an iframe of the same build (${code.slice(0, 70)})`);
    assert(code.includes(`title="${t('share.embedFrameTitle', { title: 'Castle on the hill' })}"`), 'named for screen readers');
    assert(host.textContent.includes(t('share.embedHint')) && embedButton.getAttribute('aria-expanded') === 'true', 'saying where to paste it');
    host.querySelector('.publication-share-embed-copy').click();
    await until(() => host.querySelector('.publication-share-embed .publication-share-link-feedback').textContent === t('share.embedCopied'), 'the embed code to be copied');
    assert(copied.at(-1) === code && counted.at(-1) === 'embed-code', `copying it puts it on the clipboard and is counted (${counted})`);
    embedButton.click();
    await until(() => !host.querySelector('.publication-share-embed'), 'Embed to fold away again');
    unmount();
    console.log('✓ Embed copies an <iframe> of the build');
}

// An unsigned build gets no link, says why, and can still have a picture.
{
    const { host, unmount } = mount(publishCastle({ signedIn: false }));
    await until(() => host.querySelector('.publication-share-link .form-hint'), 'the reason');
    assert(!host.querySelector('.publication-share-link-url'), 'no link');
    assert(host.textContent.includes(t('share.linkOnlyUnsigned')), 'it says the build is not signed');
    assert(host.querySelector('.publication-share-link-picture'), 'Save picture is still offered');
    assert(!host.querySelector('.publication-share-link-embed'), 'but no Embed, which needs a link');
    unmount();
    console.log('✓ an unsigned build explains why there is no link');
}

// A challenge entry's share text names the challenge and carries its tag.
{
    const challenge = challengeAt(Date.now());
    const shared = [];
    Object.defineProperty(navigator, 'share', { configurable: true, value: async (data) => { shared.push(data); } });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    try {
        for (const [tags, expectChallenge] of [[[challenge.tag, 'castle'], true], [['castle'], false]]) {
            const { host, unmount } = mount(publishCastle({ tags }));
            await until(() => host.querySelector('.publication-share-link-url'), 'the link');
            const shareButton = [...host.querySelectorAll('button')].find((button) => button.textContent.trim() === t('share.share'));
            shareButton.click();
            await until(() => shared.length > 0, 'the share sheet');
            const { text } = shared.pop();
            if (expectChallenge) {
                assert(text.includes(`#${challenge.tag}`) && text.includes('Castle on the hill'), `an entry is shared as one (${text})`);
            } else {
                assert(text === t('share.text', { title: 'Castle on the hill' }), `any other build keeps the usual text (${text})`);
            }
            unmount();
        }
    } finally {
        delete navigator.share;
        delete navigator.canShare;
    }
    console.log('✓ a challenge entry is shared with the challenge\'s name and tag');
}
