// @environment browser
import { createApp, h, nextTick } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import PublicationCard from '../ui/components/PublicationCard.js';
import { Publication } from '../publisher/Publication.js';
import { t } from '../ui/i18n/i18n.js';
import { assert } from './support/Assert.js';

// An Explore card (ui/components/PublicationCard.js) for a build this device
// published itself shows, and only there, how many builds by other people
// published after it look a lot like it, and opens their list; nobody else's
// card is labelled.

const flush = async () => {
    for (let i = 0; i < 6; i += 1) {
        await Promise.resolve();
        await nextTick();
    }
};

function publication(id, title, { author = 'someone', publishedAt = '2026-09-01T00:00:00Z' } = {}) {
    return new Publication({ id, documentId: `doc-${id}`, title, author, publishedAt, contentHash: `sha256:${id}` });
}

function match(id, title, author, similarity) {
    return { publication: publication(id, title, { author, publishedAt: '2026-10-05T00:00:00Z' }), evidence: { similarity } };
}

function mount({ shown, own, findLater }) {
    const asked = [];
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:any(.*)*', component: { template: '<div />' } }] });
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp({ render: () => h('ul', [h(PublicationCard, { publication: shown })]) });
    app.use(router);
    app.provide('similarBuildFinder', { findLater: async (p) => { asked.push(p.id); return findLater(p); } });
    app.provide('isOwnPublication', (p) => own.has(p.id));
    app.mount(host);
    return { host, asked, unmount: () => { app.unmount(); host.remove(); } };
}

const own = new Set(['mine']);

{
    const card = mount({ shown: publication('mine', 'My Cottage'), own, findLater: () => [match('copy', 'Their Cottage', 'mallory', 0.92), match('other', 'Another', 'zed', 0.7)] });
    await flush();
    assert(card.asked.join() === 'mine', 'a build this device published is looked up');
    const toggle = card.host.querySelector('.publication-look-alikes-toggle');
    assert(toggle && toggle.textContent.trim() === t('publicationCard.lookAlikes', { count: 2 }), `its card says how many later builds look like it (${toggle && toggle.textContent})`);
    assert(toggle.getAttribute('aria-expanded') === 'false' && !card.host.querySelector('.similar-earlier'), 'the list stays closed until asked for');
    toggle.click();
    await flush();
    assert(toggle.getAttribute('aria-expanded') === 'true', 'it opens');
    assert(card.host.querySelector('.similar-earlier-title').textContent === t('similarLater.title'), 'as the builds published later');
    const names = [...card.host.querySelectorAll('.similar-earlier-name')].map((name) => name.textContent.replace(/\s+/g, ' ').trim());
    assert(names.join('|') === `${t('similarEarlier.byAuthor', { title: 'Their Cottage', author: 'mallory' })}|${t('similarEarlier.byAuthor', { title: 'Another', author: 'zed' })}`,
        `listing each one, by its builder (${names.join('|')})`);
    assert(card.host.querySelector('.similar-earlier-note').textContent === t('similarLater.note'), 'with the note that only its builder sees it and that it doesn\'t mean anyone copied');
    assert(card.host.querySelector('a.similar-earlier-link').getAttribute('href').includes('/world/doc-copy'), 'each opening where Explore would open it');
    toggle.click();
    await flush();
    assert(!card.host.querySelector('.similar-earlier'), 'and closes');
    card.unmount();
}
console.log('✓ your own card says how many later builds look like it, and lists them');

{
    const theirs = mount({ shown: publication('theirs', 'Their build'), own, findLater: () => [match('copy', 'Copy', 'mallory', 0.9)] });
    await flush();
    assert(theirs.asked.length === 0 && !theirs.host.querySelector('.publication-look-alikes'), 'someone else\'s card is never looked up or labelled');
    theirs.unmount();

    const none = mount({ shown: publication('mine', 'My Cottage'), own, findLater: () => [] });
    await flush();
    assert(!none.host.querySelector('.publication-look-alikes'), 'with nothing alike, your card says nothing');
    none.unmount();

    const failing = mount({ shown: publication('mine', 'My Cottage'), own, findLater: () => { throw new Error('storage blocked'); } });
    await flush();
    assert(!failing.host.querySelector('.publication-look-alikes') && failing.host.querySelector('h3').textContent === 'My Cottage', 'a failed look says nothing, and the card shows as always');
    failing.unmount();
}
console.log('✓ nobody else\'s card is labelled; nothing alike or a failed look says nothing');

console.log('✅ All own look-alikes card tests passed.');
