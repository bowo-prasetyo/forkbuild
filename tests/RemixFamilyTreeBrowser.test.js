// @environment browser
import { createApp, h } from 'vue';
import RemixFamilyTree from '../ui/components/remix/RemixFamilyTree.js';
import { remixFamily } from '../core/RemixFamily.js';
import { assert } from './support/Assert.js';

// The family tree, rendered by real Vue: ancestors in order down to this
// build, then its remixes nested under it, each a link where it can be
// opened, and nothing at all for a build with no family.

const RouterLinkStub = { props: ['to'], template: '<a :href="to.path"><slot /></a>' };
const publications = [
    { documentId: 'original', parentDocumentId: null, title: 'Old Mill', author: 'ana', publishedAt: '2026-10-01' },
    { documentId: 'mine', parentDocumentId: 'original', title: 'My Mill', author: 'ben', publishedAt: '2026-10-02' },
    { documentId: 'remix', parentDocumentId: 'mine', title: 'Mill by the River', author: 'cy', publishedAt: '2026-10-03' }
];
const lookUp = {
    findByDocumentId: (id) => publications.filter((p) => p.documentId === id),
    findByParentId: (id) => publications.filter((p) => p.parentDocumentId === id)
};

function mount(family) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp({ render: () => h(RemixFamilyTree, { family, routeFor: (m) => (m.publication ? { path: `/world/${m.documentId}` } : null) }) });
    app.component('router-link', RouterLinkStub);
    app.mount(host);
    return { host, unmount: () => { app.unmount(); host.remove(); } };
}

{
    const { host, unmount } = mount(remixFamily(publications[1], lookUp));
    const line = [...host.querySelectorAll('.remix-family-line > li')].map((li) => li.textContent.replace(/\s+/g, ' ').trim());
    assert(line[0].startsWith('Old Mill by ana'), `the original first (got ${line[0]})`);
    assert(line[1].startsWith('My Mill by ben') && line[1].includes('(this build)'), 'then this build, marked');
    const remix = host.querySelector('.remix-family-self .remix-family-remixes a');
    assert(remix && remix.textContent === 'Mill by the River by cy' && remix.getAttribute('href') === '/world/remix', 'its remix, linked, under it');
    assert(host.querySelector('.remix-family-ancestor a').getAttribute('href') === '/world/original', 'the original links too');
    assert(host.querySelector('.remix-family-title').textContent === 'Family tree', 'headed Family tree');
    unmount();
    console.log('✓ the tree shows the line down to this build and its remixes');
}

{
    const { host, unmount } = mount(remixFamily({ documentId: 'alone', title: 'Alone' }, lookUp));
    assert(!host.querySelector('.remix-family'), 'a build with no family shows no tree');
    unmount();
    console.log('✓ no family, no tree');
}
