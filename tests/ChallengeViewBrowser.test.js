// @environment browser
import { createApp, nextTick } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import ChallengeView from '../ui/views/ChallengeView.js';
import { challengeAt, previousChallenge } from '../core/BuildChallenge.js';
import { ChallengeEntryLog } from '../application/challenge/ChallengeEntryLog.js';
import { DecentralizedPublicationDiscoveryProvider } from '../discovery/DecentralizedPublicationDiscoveryProvider.js';
import { Publication } from '../publisher/Publication.js';
import { t } from '../ui/i18n/i18n.js';
import { assert } from './support/Assert.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';

// The challenge page, rendered by real Vue with the shipped CSS: this week's
// theme with Join, how to enter, the entries found under the week's tag
// (listed at once from the entry log, then again after the networks are
// searched), ideas to start from, and an earlier week by its Monday.

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
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
}

const challenge = challengeAt(Date.now());
const previous = previousChallenge(challenge);
const discovery = new DecentralizedPublicationDiscoveryProvider();
const entryLog = new ChallengeEntryLog(new InMemoryStorageProvider());
const entry = (id, title) => new Publication({ id, documentId: `doc-${id}`, title, author: 'ana', publishedAt: new Date() });
discovery.add(entry('pub-logged', 'Harbor Light'));
discovery.add(entry('pub-found', 'Cliff Beacon'));
discovery.add(entry('pub-other', 'Not an entry'));
entryLog.add(challenge.tag, ['pub-logged']);

let releaseSearch;
const searched = [];
const entryDiscovery = {
    run: (tag) => {
        searched.push(tag);
        return new Promise((resolve) => {
            releaseSearch = () => {
                entryLog.add(tag, ['pub-found']);
                resolve({ found: tag === challenge.tag ? 1 : 0, pending: 0 });
            };
        });
    }
};

const router = createRouter({
    history: createMemoryHistory(),
    routes: [
        { path: '/challenge', component: ChallengeView },
        { path: '/challenge/:id', component: ChallengeView },
        { path: '/:rest(.*)', component: { template: '<div></div>' } }
    ]
});
const host = document.createElement('div');
host.style.cssText = 'display: flex; width: 1200px; height: 900px;';
document.body.appendChild(host);
const app = createApp({ template: '<router-view />' });
app.use(router);
app.provide('challengeEntryLog', entryLog);
app.provide('challengeEntryDiscovery', entryDiscovery);
app.provide('decentralizedPublicationDiscoveryProvider', discovery);
router.push('/challenge');
await router.isReady();
app.mount(host);
await nextTick();

// This week: the theme, Join, how to enter, and the logged entry at once.
{
    assert(host.querySelector('.challenge-title').textContent.trim() === t(`challenge.theme.${challenge.themeId.replace(/-([a-z])/g, (_, c) => c.toUpperCase())}.title`), 'the theme is the headline');
    assert(host.querySelector('.challenge-card-tag').textContent.trim() === `#${challenge.tag}`, 'the week\'s tag is shown');
    const join = host.querySelector('.challenge-join');
    assert(join && join.getAttribute('href') === router.resolve({ path: '/editor', query: { start: challenge.starterStructureId, challenge: challenge.id } }).href,
        `Join opens the starting build for this week (${join && join.getAttribute('href')})`);
    assert(host.querySelectorAll('.challenge-steps li').length === 3, 'three steps to enter');
    assert(searched.join() === challenge.tag, 'the networks are searched for this week\'s tag');
    assert(host.querySelector('.publication-catalog-network').textContent.includes(t('challenge.network.searching')), 'and it says so');
    assert(host.querySelectorAll('.challenge-entries > *').length === 1, 'the logged entry is listed before the search ends');
    assert(host.textContent.includes('Harbor Light') && !host.textContent.includes('Not an entry'), 'only entries are listed');
    console.log('✓ this week\'s theme, Join, steps, and known entries render at once');
}

// The search adds what it found.
{
    releaseSearch();
    await until(() => host.querySelectorAll('.challenge-entries > *').length === 2, 'the found entry');
    assert(host.textContent.includes('Cliff Beacon'), 'the entry found on the networks is listed');
    assert(host.querySelector('.publication-catalog-network').textContent.includes(t('challenge.network.found', { count: 1 })), 'it says one was found');
    assert(host.querySelector('.challenge-entry-count').textContent.trim() === t('challenge.entriesCount', { count: 2 }), 'the count follows');
    await until(() => host.querySelectorAll('.challenge-section .featured-build-card').length === challenge.ideaStructureIds.length, 'the ideas');
    const ideaLinks = [...host.querySelectorAll('.challenge-section .featured-build-link')].map((link) => link.getAttribute('href'));
    assert(ideaLinks.every((href) => href.includes(`challenge=${challenge.id}`)), 'each idea opens tagged for the week');
    console.log('✓ entries found on the networks join the list; ideas open tagged for the week');
}

// Last week, by its Monday: no Join, no steps, and its own search.
{
    await router.push(`/challenge/${previous.id}`);
    await until(() => searched.length === 2, 'last week\'s search');
    await nextTick();
    assert(searched[1] === previous.tag, 'last week\'s tag is searched');
    assert(!host.querySelector('.challenge-join') && !host.querySelector('.challenge-steps'), 'an ended week cannot be joined');
    assert(host.querySelector('.challenge-card-time').textContent.trim() === t('challenge.ended'), 'it says it ended');
    assert(host.querySelector('.challenge-no-entries').textContent.trim() === t('challenge.noEntriesEnded'), 'and that nothing was entered');
    assert(host.querySelector('.challenge-current-link'), 'with a way back to this week');
    releaseSearch();
    console.log('✓ an earlier week shows its own entries and cannot be joined');
}

// A week that isn't a Monday names no challenge.
{
    await router.push('/challenge/2026-10-13');
    await nextTick();
    assert(host.textContent.includes(t('challenge.notFound')), 'it says there is no such week');
    console.log('✓ a date that isn\'t a Monday names no challenge');
}

app.unmount();
host.remove();
console.log('\n✅ All ChallengeView browser tests passed.');
