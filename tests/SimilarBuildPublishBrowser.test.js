// @environment browser
import { createApp, h, nextTick } from 'vue';
import Toolbar from '../ui/components/Toolbar.js';
import { License, LicenseId } from '../core/License.js';
import { setAppLocale } from '../ui/i18n/i18n.js';
import en from '../ui/i18n/messages/en.js';
import { assert } from './support/Assert.js';

// Publish in the Editor's toolbar, rendered by real Vue, with a stand-in for
// application/publication/SimilarBuildFinder.js: a build that looks a lot
// like someone else's is pointed out before it is published, once a visit,
// and the builder decides; with nothing alike, or when the check fails, it
// publishes as before.

const flush = async () => {
    for (let i = 0; i < 5; i += 1) {
        await Promise.resolve();
        await nextTick();
    }
};

function match({ title = 'Cozy Cottage', author = 'alice', licenseId = LicenseId.CC_BY_4_0, similarity = 0.86, id = 'p1' } = {}) {
    return {
        publication: { id, documentId: `doc-${id}`, title, author, license: new License({ id: licenseId }) },
        evidence: { similarity, shared: 40, onlyMine: 3, onlyTheirs: 4, turn: 0 }
    };
}

function mount({ worldId, find }) {
    const published = [];
    const asked = [];
    const document = { world: { id: worldId }, metadata: { title: 'Mine', license: new License({ id: LicenseId.CC_BY_4_0 }) } };
    const host = window.document.createElement('div');
    window.document.body.appendChild(host);
    const app = createApp({
        render: () => h(Toolbar, {
            documentManager: { document, state: { dirty: false }, onStateChanged: () => () => {} },
            saveDocumentUseCase: { execute: () => {} },
            loadDocumentUseCase: { listSavedDocuments: () => [] },
            editorSession: {},
            publishDocumentUseCase: { execute: () => { published.push(worldId); return { title: 'Mine' }; } },
            feedback: { show: () => {} }
        })
    });
    app.provide('similarBuildFinder', {
        find: async (doc, options) => {
            asked.push({ doc, options });
            return find();
        }
    });
    app.mount(host);
    return {
        host,
        published,
        asked,
        document,
        publish: async () => {
            host.querySelector('.toolbar-publish').click();
            await flush();
        },
        dialog: () => host.querySelector('.similar-build-dialog'),
        unmount: () => {
            app.unmount();
            host.remove();
        }
    };
}

await setAppLocale('en');

{
    const toolbar = mount({ worldId: 'w-keep', find: () => [match(), match({ id: 'p2', title: '', author: null, licenseId: LicenseId.ALL_RIGHTS_RESERVED, similarity: 0.7 })] });
    await toolbar.publish();
    assert(toolbar.asked.length === 1 && toolbar.asked[0].doc === toolbar.document, 'the open build is checked when Publish is pressed');
    assert(toolbar.dialog(), 'a build like someone else\'s is pointed out');
    assert(toolbar.published.length === 0, 'and is not published yet');
    const items = [...toolbar.host.querySelectorAll('.similar-build-match')];
    assert(items.length === 2, 'each look-alike is listed');
    assert(items[0].querySelector('.similar-build-name').textContent.trim() === '"Cozy Cottage" by alice', `with its title and builder (${items[0].querySelector('.similar-build-name').textContent})`);
    assert(items[0].querySelector('.similar-build-percent').textContent.trim() === '86% the same', 'how alike it is');
    assert(items[0].querySelector('.similar-build-terms').textContent.trim() === en['similarBuild.remixAllowed'], 'and, when remixes are allowed, the way to credit them');
    assert(items[1].querySelector('.similar-build-name').textContent.trim() === en['similarBuild.untitled'], 'an untitled build by an unnamed builder still reads');
    assert(items[1].querySelector('.similar-build-terms').textContent.trim() === en['similarBuild.remixNotAllowed'], 'one that may not be copied says so');
    assert(window.document.activeElement === toolbar.host.querySelector('.similar-build-keep'), 'Keep building has the focus');

    toolbar.host.querySelector('.similar-build-keep').click();
    await flush();
    assert(!toolbar.dialog() && toolbar.published.length === 0, 'Keep building closes it without publishing');

    await toolbar.publish();
    assert(toolbar.asked.length === 1 && !toolbar.dialog(), 'it is pointed out once a visit');
    assert(toolbar.published.join() === 'w-keep', 'so the next Publish publishes');
    toolbar.unmount();
}
console.log('✓ a look-alike is pointed out once, and Keep building waits');

{
    const toolbar = mount({ worldId: 'w-own', find: () => [match()] });
    await toolbar.publish();
    toolbar.host.querySelector('.similar-build-publish').click();
    await flush();
    assert(!toolbar.dialog() && toolbar.published.join() === 'w-own', 'It\'s my own publishes it');
    toolbar.unmount();
}
console.log('✓ the builder can publish anyway');

{
    const none = mount({ worldId: 'w-none', find: () => [] });
    await none.publish();
    assert(!none.dialog() && none.published.join() === 'w-none', 'with nothing alike it publishes at once');
    none.unmount();

    const failing = mount({ worldId: 'w-fail', find: () => { throw new Error('storage blocked'); } });
    await failing.publish();
    assert(!failing.dialog() && failing.published.join() === 'w-fail', 'a failed check publishes as before');
    failing.unmount();
}
console.log('✓ nothing alike, or a failed check, publishes as before');

{
    let release;
    const toolbar = mount({ worldId: 'w-slow', find: () => new Promise((resolve) => { release = resolve; }) });
    await toolbar.publish();
    const button = toolbar.host.querySelector('.toolbar-publish');
    assert(button.disabled && button.getAttribute('aria-busy') === 'true', 'Publish waits while it looks');
    button.click();
    await flush();
    assert(toolbar.asked.length === 1, 'and pressing it again does not look twice');
    release([]);
    await flush();
    assert(!button.disabled && toolbar.published.join() === 'w-slow', 'then publishes');
    toolbar.unmount();
}
console.log('✓ Publish waits for the check');

console.log('✅ All similar build publish browser tests passed.');
