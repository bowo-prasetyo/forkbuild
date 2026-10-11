// @environment browser
import { createApp, h } from 'vue';
import DocumentInfoPanel from '../ui/components/DocumentInfoPanel.js';
import RemixFamilyTree from '../ui/components/remix/RemixFamilyTree.js';
import { remixFamily } from '../core/RemixFamily.js';
import { t } from '../ui/i18n/i18n.js';
import { assert } from './support/Assert.js';

// Credit co-builders (core/BuiltWith.js), rendered by real Vue: the Editor's
// build panel and the family tree say who built a build with its author.
// The share page is in PublicationLinkViewBrowser.

function mount(component, props) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp({ render: () => h(component, props) });
    app.component('router-link', { props: ['to'], template: '<a><slot /></a>' });
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
