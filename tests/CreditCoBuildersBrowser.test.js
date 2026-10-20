// @environment browser
import { createApp, h } from 'vue';
import DocumentInfoPanel from '../ui/components/DocumentInfoPanel.js';
import RemixFamilyTree from '../ui/components/remix/RemixFamilyTree.js';
import { remixFamily } from '../core/publication/RemixFamily.js';
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

// Credit co-builders (core/catalog/BuiltWith.js), rendered by real Vue: the Editor's
// build panel and the family tree say who built a build with its author.
// The share page is in PublicationLinkViewBrowser.

function mount(component, props) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp({ render: () => h(component, props) });
    app.component('router-link', { props: ['to'], template: '<a :data-to="typeof to === \'string\' ? to : to.path"><slot /></a>' });
    app.mount(host);
    return { host, unmount: () => { app.unmount(); host.remove(); } };
}

const names = (...list) => new Intl.ListFormat('en', { type: 'conjunction' }).format(list);
const info = { title: 'Harbor', status: 'saved', editable: true, builtWith: [{ name: 'Kim', identityId: 'did:key:kim' }, { name: null, identityId: 'did:key:x' }] };

{
    const compact = mount(DocumentInfoPanel, { info, compact: true });
    const line = compact.host.querySelector('.document-info-compact-built-with');
    assert(line && line.textContent.trim() === t('builtWith.line', { names: names('Kim', t('builtWith.someone')) }), `the Editor's panel says who built it too (${line && line.textContent})`);
    assert(line.querySelector('a.built-with-name') && line.querySelectorAll('a.built-with-name').length === 2, 'each credited name a link to their page');
    compact.unmount();
    const full = mount(DocumentInfoPanel, { info });
    assert(full.host.textContent.includes(t('documentInfo.builtWith')), 'and its full form');
    full.unmount();
    const alone = mount(DocumentInfoPanel, { info: { ...info, builtWith: [] }, compact: true });
    assert(!alone.host.querySelector('.document-info-compact-built-with'), 'a build made alone says nothing of it');
    alone.unmount();
    console.log('✓ the Editor\'s build panel credits co-builders');
}

{
    const family = remixFamily({ documentId: 'mine', title: 'Mill', builtWith: [{ name: 'Lee' }], parentDocumentId: 'old' }, {
        findByDocumentId: (id) => (id === 'old' ? [{ documentId: 'old', title: 'Old Mill', author: 'ana', builtWith: [{ name: 'Kim' }, { name: 'Sam' }], publishedAt: '2026-10-01' }] : []),
        findByParentId: () => []
    });
    const tree = mount(RemixFamilyTree, { family, routeFor: () => null });
    const line = [...tree.host.querySelectorAll('.remix-family-line > li')].map((li) => li.textContent.replace(/\s+/g, ' ').trim());
    assert(line[0] === t('remixFamily.byAuthorWith', { title: 'Old Mill', author: 'ana', names: names('Kim', 'Sam') }), `an ancestor names who built it (${line[0]})`);
    assert(line[1].startsWith(t('remixFamily.titleWith', { title: 'Mill', names: 'Lee' })), `and so does this build, with no author named (${line[1]})`);
    tree.unmount();
    console.log('✓ the family tree credits co-builders');
}

// A signed build: its maker's name links to their page, by the identity whose
// signature verifies, and so does each credited name; its title, to the build.
{
    const storage = new InMemoryStorageProvider();
    const identity = new LocalIdentityProvider(storage);
    identity.login('tree-ana');
    const world = new World();
    const building = new Building({ creator: 'x' });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    const manager = new DocumentManager();
    manager.load(new Document({ world, metadata: new DocumentMetadata({ title: 'Tree Harbor', builtWith: [{ name: 'Kim', identityId: 'did:key:kim' }] }) }), 'tree-doc');
    const parent = new PublishDocumentUseCase(new LocalPublisherProvider(storage, new LocalContentStore(storage)), identity).execute(manager);
    const child = { documentId: 'tree-child', parentDocumentId: parent.documentId, title: 'Tree Harbor II', author: 'sam', publishedAt: new Date().toISOString() };
    const family = remixFamily(child, { findByDocumentId: (id) => (id === parent.documentId ? [parent] : []), findByParentId: () => [] });
    const tree = mount(RemixFamilyTree, { family, routeFor: (member) => (member.publication ? { path: `/world/${member.documentId}` } : null) });
    const ancestor = tree.host.querySelector('.remix-family-ancestor');
    assert(ancestor.querySelector('.remix-family-link').dataset.to === `/world/${parent.documentId}` && ancestor.querySelector('.remix-family-link').textContent === 'Tree Harbor', 'the title links to the build');
    const author = ancestor.querySelector('.remix-family-author');
    assert(author && author.textContent === 'tree-ana' && author.dataset.to === `/builder/${encodeURIComponent(identity.getSigningIdentity().id)}`, 'its maker to their page, by the identity that signed it');
    const credit = ancestor.querySelector('.built-with-name');
    assert(credit && credit.textContent === 'Kim' && credit.dataset.to === `/builder/${encodeURIComponent('did:key:kim')}`, 'and each credited name to theirs');
    assert(!tree.host.querySelector('.remix-family-self .remix-family-author'), 'an unsigned build\'s maker links nowhere');
    tree.unmount();
    console.log('✓ the family tree\'s names link to their people');
}
