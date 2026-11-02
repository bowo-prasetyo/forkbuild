// @environment browser
import { createApp, h } from 'vue';
import DocumentInfoPanel from '../ui/components/DocumentInfoPanel.js';
import { t } from '../ui/i18n/i18n.js';
import { assert } from './support/Assert.js';
import { PublishDocumentUseCase } from '../application/publication/PublishDocumentUseCase.js';
import { DocumentManager } from '../application/document/DocumentManager.js';
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

// A build imported from a file that couldn't show who made it
// (core/document/DocumentMetadata.js#unverifiedOrigin), rendered by real Vue:
// the Editor's and World View's build panel say so, and a Publication of it
// signs the mark, so it reaches whoever opens the published build.

function mount(component, props) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp({ render: () => h(component, props) });
    app.mount(host);
    return { host, unmount: () => { app.unmount(); host.remove(); } };
}

const info = { title: 'Harbor', status: 'saved', editable: true, builtWith: [], unverifiedOrigin: true };

{
    const compact = mount(DocumentInfoPanel, { info, compact: true });
    const line = compact.host.querySelector('.document-info-unverified-origin');
    assert(line && line.textContent.trim() === t('documentInfo.unverifiedOrigin'), `the Editor's panel says where it came from can't be shown (${line && line.textContent})`);
    compact.unmount();

    const full = mount(DocumentInfoPanel, { info });
    const row = full.host.querySelector('.document-info-unverified-origin');
    assert(row && row.textContent.includes(t('documentInfo.origin')) && row.textContent.includes(t('documentInfo.unverifiedOrigin')), 'and so does its full form');
    full.unmount();

    for (const compactForm of [true, false]) {
        const plain = mount(DocumentInfoPanel, { info: { ...info, unverifiedOrigin: false }, compact: compactForm });
        assert(!plain.host.querySelector('.document-info-unverified-origin'), `a build not marked says nothing of it (${compactForm ? 'compact' : 'full'})`);
        plain.unmount();
    }
    console.log('✓ the build panel says when a build came from a file that couldn\'t show who made it');
}

{
    const storage = new InMemoryStorageProvider();
    const identity = new LocalIdentityProvider(storage);
    identity.login('origin-bob');
    const world = new World();
    const building = new Building({ creator: 'origin-bob' });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    const metadata = new DocumentMetadata({ title: 'Imported Harbor', author: 'origin-bob', authorIdentityId: identity.getSigningIdentity().id, unverifiedOrigin: true });
    const contentStore = new LocalContentStore(storage);
    const publication = new PublishDocumentUseCase(new LocalPublisherProvider(storage, contentStore), identity).execute(new DocumentManager(new Document({ world, metadata })));
    const signed = await contentStore.get({ hash: publication.contentHash });
    const json = typeof signed === 'string' ? JSON.parse(signed) : signed;
    assert(json.metadata.unverifiedOrigin === true, 'the published build carries the mark its publisher signed');
    console.log('✓ a Publication of a marked build signs the mark');
}

console.log('\n✅ All UnverifiedOrigin browser tests passed.');
