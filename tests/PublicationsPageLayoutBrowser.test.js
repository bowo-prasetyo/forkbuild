// @environment browser
import { createApp, nextTick } from 'vue';
import DecentralizedPublicationsView from '../ui/views/DecentralizedPublicationsView.js';
import { PublicationResolutionOutcome } from '../application/publication/PublicationResolutionOutcome.js';
import { LEGACY_HASH_REASON } from '../serializer/contentHash.js';
import { assert } from './support/Assert.js';

// The Publications page, rendered by real Vue with the shipped CSS over fake
// services: usable publications are listed as full cards with Distribution
// folded, publications that failed their check are folded into one group of
// compact cards, the batch-anchor picker lists only usable publications, and
// the "no peer" notice appears only when something could be retrieved.

await new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/css/main.css';
    link.onload = resolve;
    link.onerror = () => reject(new Error('css/main.css failed to load'));
    document.head.appendChild(link);
});

function fakePublication(id, hash) {
    const json = { id, contentKind: 'forkbuild.structure', publisherIdentity: { id: `did:key:z${id}` }, contentReference: { hash } };
    return { ...json, title: id, toJSON: () => json };
}

const publications = [
    fakePublication('good', 'sha256:' + 'a'.repeat(64)),
    fakePublication('old-1', 'fnv1a-32:0000000a'),
    fakePublication('old-2', 'fnv1a-32:0000000b')
];

const catalog = {
    list: () => publications,
    has: (id) => publications.some((publication) => publication.id === id),
    getReceivedAt: () => '2026-09-27T18:53:00.000Z'
};
const coordinator = {
    resolve: async (json) => json.id === 'good'
        ? { outcome: PublicationResolutionOutcome.RESOLVED, content: { name: 'Good' }, reason: null }
        : { outcome: PublicationResolutionOutcome.CONTENT_HASH_MISMATCH, content: null, reason: LEGACY_HASH_REASON }
};
const creationCoordinator = {
    availableAnchorTypes: () => ['steem'],
    batchAnchorTypes: () => [{ anchorType: 'steem', maxBatchSize: 64 }]
};

const host = document.createElement('div');
document.body.appendChild(host);
const app = createApp(DecentralizedPublicationsView);
app.config.warnHandler = () => {};
app.component('router-link', { props: ['to'], template: '<a :href="String(to)"><slot /></a>' });
app.provide('publicationCatalog', catalog);
app.provide('publicationResolutionCoordinator', coordinator);
app.provide('publicationDisplayKindPlugins', { 'forkbuild.structure': { describe: (content) => `Structure ${content.name}` } });
app.provide('peerSessionManager', { listPeers: () => [] });
app.provide('publicationAnchorCreationCoordinator', creationCoordinator);
app.provide('publicationEvidenceCoordinator', null);
app.provide('publicationPeerExchange', null);
app.provide('publicationPeerContentExchange', null);
app.mount(host);

for (let i = 0; i < 20; i += 1) {
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));
}

const view = host.querySelector('.publications-view');
const mainList = view.querySelector(':scope > .identity-mgmt-list');
assert(mainList && mainList.querySelectorAll(':scope > .identity-mgmt-card').length === 1, 'only the usable publication gets a full card');
const distribution = mainList.querySelector('.identity-mgmt-distribution');
assert(distribution && !distribution.open, 'its Distribution section is folded');
assert([...mainList.querySelectorAll('summary')].some((summary) => summary.textContent.trim() === 'Details'), 'its details disclosure is called Details');

const groups = [...view.querySelectorAll(':scope > details.publications-tools-panel')];
const failedGroup = groups.find((details) => details.querySelector('summary').textContent.includes("can't be used"));
assert(failedGroup, 'the failed publications are folded into one group');
assert(failedGroup.querySelector('summary').textContent.trim() === "2 publications that can't be used", 'the group says how many');
assert(!failedGroup.open, 'and it is folded while something usable is listed');
const failedCards = failedGroup.querySelectorAll('.identity-mgmt-card');
assert(failedCards.length === 2, 'each failed publication has a card');
for (const card of failedCards) {
    assert(card.textContent.includes(LEGACY_HASH_REASON), 'a failed card says why');
    assert(!card.querySelector('.identity-mgmt-distribution') && !card.textContent.includes('Create Steem Anchor'), 'and offers no distribution or anchoring');
    assert([...card.querySelectorAll('button')].map((button) => button.textContent.trim()).join() === 'Re-check', 'only Re-check');
}

const pickerRows = view.querySelectorAll('.batch-anchoring-list label');
assert(pickerRows.length === 1, 'the batch-anchor picker lists only the usable publication');

assert(!view.textContent.includes('Retrieve from Peers" can'), 'no "no peer" notice when nothing is retrievable');

app.unmount();
host.remove();
console.log('✓ the Publications page separates usable publications from failed ones');
