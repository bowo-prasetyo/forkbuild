// @environment browser
import { createApp, h, nextTick } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import SimilarEarlierBuilds from '../ui/components/remix/SimilarEarlierBuilds.js';
import { useSimilarEarlierBuilds } from '../ui/views/worldView/useSimilarEarlierBuilds.js';
import { t } from '../ui/i18n/i18n.js';
import { assert } from './support/Assert.js';

// World View's About this build look-alikes (ui/views/worldView/useSimilarEarlierBuilds.js),
// rendered as World View renders them: looked up once per Publication shown,
// however often the panels refresh; a newer build shown drops an older
// build's answer; a failed look shows nothing.

const flush = async () => {
    for (let i = 0; i < 5; i += 1) {
        await Promise.resolve();
        await nextTick();
    }
};

function match(id, title, author, similarity) {
    return { publication: { id, documentId: `doc-${id}`, title, author, publishedAt: '2026-03-14T00:00:00Z' }, evidence: { similarity } };
}

const asked = [];
const answers = new Map();
const finder = {
    findEarlier: (publication) => {
        asked.push(publication.id);
        const answer = answers.get(publication.id);
        return typeof answer === 'function' ? answer() : Promise.resolve(answer || []);
    }
};

let refresh;
const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:any(.*)*', component: { template: '<div />' } }] });
const host = document.createElement('div');
document.body.appendChild(host);
const app = createApp({
    setup() {
        const { documentSimilarEarlier, refreshSimilarEarlier, similarEarlierRoute } = useSimilarEarlierBuilds();
        refresh = refreshSimilarEarlier;
        return () => (documentSimilarEarlier.value.length
            ? h('div', { class: 'document-info-panel world-similar-earlier' }, [h(SimilarEarlierBuilds, { matches: documentSimilarEarlier.value, routeFor: similarEarlierRoute, heading: 'h4' })])
            : null);
    }
});
app.use(router);
app.provide('similarBuildFinder', finder);
app.mount(host);

{
    answers.set('pub-castle', [match('pub-old', 'Old Castle', 'dora', 0.88)]);
    await refresh({ id: 'pub-castle' });
    await flush();
    assert(host.querySelector('.world-similar-earlier h4.similar-earlier-title')?.textContent === t('similarEarlier.title'), 'the shown build\'s look-alikes appear in a panel');
    assert(host.querySelector('.similar-earlier-link').getAttribute('href').includes('/world/doc-pub-old'), 'each opening where the Repository would open it');
    for (let i = 0; i < 5; i += 1) await refresh({ id: 'pub-castle' });
    assert(asked.join() === 'pub-castle', `looked up once however often the panels refresh (${asked.join()})`);
    console.log('✓ the shown build\'s look-alikes, looked up once');
}

{
    let release;
    answers.set('pub-slow', () => new Promise((resolve) => { release = resolve; }));
    answers.set('pub-quick', []);
    const slow = refresh({ id: 'pub-slow' });
    await flush();
    assert(!host.querySelector('.world-similar-earlier'), 'showing another build clears the last one\'s');
    await refresh({ id: 'pub-quick' });
    release([match('pub-stale', 'Stale', 'eve', 0.9)]);
    await slow;
    await flush();
    assert(!host.querySelector('.world-similar-earlier'), 'an answer for a build no longer shown is dropped');

    answers.set('pub-fail', () => Promise.reject(new Error('storage blocked')));
    await refresh({ id: 'pub-fail' });
    await flush();
    assert(!host.querySelector('.world-similar-earlier'), 'a failed look shows nothing');
    await refresh(null);
    await flush();
    assert(!host.querySelector('.world-similar-earlier'), 'nor does a build with no Publication');
    console.log('✓ stale answers dropped; failures and unpublished builds show nothing');
}

app.unmount();
host.remove();
console.log('✅ All World View look-alike tests passed.');
