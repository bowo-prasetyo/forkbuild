// @environment browser
import { createApp, nextTick } from 'vue';
import DecentralizedPublicationsView from '../ui/views/DecentralizedPublicationsView.js';
import { PublicationResolutionOutcome } from '../application/publication/PublicationResolutionOutcome.js';
import { LEGACY_HASH_REASON } from '../serializer/contentHash.js';
import { CreatePublicationDisplayKindRegistryUseCase } from '../application/publication/CreatePublicationDisplayKindRegistryUseCase.js';
import { assert } from './support/Assert.js';

// The Publications page, rendered by real Vue with the shipped CSS over fake
// services: usable publications are listed as full cards with Distribution
// folded, publications that failed their check are folded into one group of
// compact cards, the batch-anchor picker lists only usable publications, the
// "no peer" notice appears only when something could be retrieved, and failed
// publications can be removed from this device after a confirm step. Cards
// and picker rows are named by the checked content's title when it has one.
// An old publication one of this device's identities signed is listed first
// in the failed group, marked as yours, with how to publish it again.

await new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/css/main.css';
    link.onload = resolve;
    link.onerror = () => reject(new Error('css/main.css failed to load'));
    document.head.appendChild(link);
});

function fakePublication(id, hash, { contentKind = 'forkbuild.structure', publisherId = `did:key:z${id}` } = {}) {
    const json = { id, contentKind, publisherIdentity: { id: publisherId }, contentReference: { hash } };
    return { ...json, title: id, toJSON: () => json };
}

const publications = [
    fakePublication('good', 'a'.repeat(64)),
    fakePublication('untitled', 'b'.repeat(64)),
    fakePublication('long', 'c'.repeat(64)),
    fakePublication('old-1', '0000000a'),
    fakePublication('old-2', '0000000b'),
    // Signed by an identity on this device.
    fakePublication('mine', '0000000c', { contentKind: 'forkbuild.publication', publisherId: 'did:key:zme' })
];

const LONG_TITLE = 'A'.repeat(120);
const CONTENT = { good: { title: 'Harbour Lighthouse' }, untitled: {}, long: { title: LONG_TITLE } };

const catalog = {
    list: () => [...publications],
    remove: (id) => {
        const index = publications.findIndex((publication) => publication.id === id);
        if (index === -1) return false;
        publications.splice(index, 1);
        return true;
    },
    has: (id) => publications.some((publication) => publication.id === id),
    getReceivedAt: () => '2026-09-27T18:53:00.000Z'
};
const coordinator = {
    resolve: async (json) => (CONTENT[json.id]
        ? { outcome: PublicationResolutionOutcome.RESOLVED, content: CONTENT[json.id], reason: null }
        : { outcome: PublicationResolutionOutcome.CONTENT_HASH_MISMATCH, content: null, reason: LEGACY_HASH_REASON })
};
const { publicationKindPlugin } = new CreatePublicationDisplayKindRegistryUseCase().execute();
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
app.provide('publicationDisplayKindPlugins', {
    'forkbuild.structure': { describe: () => 'a structure' },
    'forkbuild.publication': publicationKindPlugin
});
app.provide('identityUseCase', { listIdentities: () => [{ identityId: 'did:key:zme' }] });
app.provide('peerSessionManager', { listPeers: () => [] });
app.provide('publicationAnchorCreationCoordinator', creationCoordinator);
app.provide('publicationEvidenceCoordinator', null);
app.provide('publicationPeerExchange', null);
app.provide('publicationPeerContentExchange', null);
app.mount(host);

async function settle() {
    for (let i = 0; i < 20; i += 1) {
        await nextTick();
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
}
function buttonNamed(root, label) {
    return [...root.querySelectorAll('button')].find((button) => button.textContent.trim() === label);
}
await settle();

const view = host.querySelector('.publications-view');
const mainList = view.querySelector(':scope > .identity-mgmt-list');
const usableCards = mainList ? [...mainList.querySelectorAll(':scope > .identity-mgmt-card')] : [];
assert(usableCards.length === 3, 'only the usable publications get a full card');
const cardNames = usableCards.map((card) => card.querySelector('.identity-mgmt-name').textContent.trim());
assert(cardNames[0] === 'Harbour Lighthouse', `a card is named by its content's title (got ${cardNames[0]})`);
assert(usableCards[0].querySelector('.identity-mgmt-status').textContent.trim().startsWith('Structure ·'), 'with its kind moved to the line below');
assert(cardNames[1] === 'Structure' && usableCards[1].querySelector('.identity-mgmt-status').textContent.trim().startsWith('Published by'), 'an untitled one keeps its kind as its name');
assert(cardNames[2] === `${'A'.repeat(79)}…`, 'a long title is shortened');
const distribution = mainList.querySelector('.identity-mgmt-distribution');
assert(distribution && !distribution.open, 'its Distribution section is folded');
assert([...mainList.querySelectorAll('summary')].some((summary) => summary.textContent.trim() === 'Details'), 'its details disclosure is called Details');

const groups = [...view.querySelectorAll(':scope > details.publications-tools-panel')];
const failedGroup = groups.find((details) => details.querySelector('summary').textContent.includes("can't be used"));
assert(failedGroup, 'the failed publications are folded into one group');
assert(failedGroup.querySelector('summary').textContent.trim() === "3 publications that can't be used", 'the group says how many');
assert(!failedGroup.open, 'and it is folded while something usable is listed');
const failedCards = failedGroup.querySelectorAll('.identity-mgmt-card');
assert(failedCards.length === 3, 'each failed publication has a card');
assert(failedGroup.textContent.includes('1 is yours'), 'the group says how many are yours');
const [mineCard, ...othersCards] = failedCards;
assert(mineCard.textContent.includes('Yours') && mineCard.textContent.includes('Share with Peers under it in the Repository'),
    'your own old publication is listed first, saying how to publish it again');
assert(!mineCard.textContent.includes(LEGACY_HASH_REASON), "instead of telling you to ask its author");
const mineLink = [...mineCard.querySelectorAll('a')].find((link) => link.textContent.trim() === 'Open Repository');
assert(mineLink && mineLink.getAttribute('href') === '/repository', 'with a link to where you do it');
for (const card of othersCards) {
    assert(!card.textContent.includes('Yours') && !card.querySelector('a'), "someone else's gets no such advice");
}
for (const card of failedCards) {
    if (card !== mineCard) assert(card.textContent.includes(LEGACY_HASH_REASON), 'a failed card says why');
    assert(!card.querySelector('.identity-mgmt-distribution') && !card.textContent.includes('Create Steem Anchor'), 'and offers no distribution or anchoring');
    assert([...card.querySelectorAll('button')].map((button) => button.textContent.trim()).join() === 'Re-check,Remove from This Device', 'only Re-check and Remove');
}

const pickerRows = [...view.querySelectorAll('.batch-anchoring-list label')];
assert(pickerRows.length === 3, 'the batch-anchor picker lists only the usable publications');
assert(pickerRows[0].textContent.replace(/\s+/g, ' ').trim().startsWith('Harbour Lighthouse · Structure · aaaaaaaa'), `a picker row leads with the title (got ${pickerRows[0].textContent.trim()})`);
assert(pickerRows[1].textContent.replace(/\s+/g, ' ').trim().startsWith('Structure · bbbbbbbb'), 'an untitled row starts with its kind');

assert(!view.textContent.includes('Retrieve from Peers" can'), 'no "no peer" notice when nothing is retrievable');

// Removing one failed publication asks first, and Cancel keeps it.
const firstCard = failedGroup.querySelector('.identity-mgmt-card');
buttonNamed(firstCard, 'Remove from This Device').click();
await settle();
assert(firstCard.textContent.includes('Remove it from this device?') && buttonNamed(firstCard, 'Remove'), 'Remove asks for confirmation');
buttonNamed(firstCard, 'Cancel').click();
await settle();
assert(publications.length === 6 && buttonNamed(firstCard, 'Remove from This Device'), 'Cancel removes nothing');
buttonNamed(firstCard, 'Remove from This Device').click();
await settle();
buttonNamed(firstCard, 'Remove').click();
await settle();
assert(publications.length === 5 && !publications.some((publication) => publication.id === 'mine'), 'confirming removes that publication from the catalog');
assert(failedGroup.querySelectorAll('.identity-mgmt-card').length === 2
    && failedGroup.querySelector('summary').textContent.trim() === "2 publications that can't be used", 'and its card');

// Remove All asks first too, then forgets every failed one and nothing else.
buttonNamed(failedGroup, 'Remove All 2 from This Device').click();
await settle();
assert(failedGroup.textContent.includes('Remove all 2 from this device?'), 'Remove All asks for confirmation');
buttonNamed(failedGroup, 'Remove All').click();
await settle();
assert(publications.map((publication) => publication.id).join() === 'good,untitled,long', 'only the usable publications are left');
assert(![...view.querySelectorAll(':scope > details')].some((details) => details.textContent.includes("can't be used")), 'and the group is gone');
assert(mainList.querySelectorAll(':scope > .identity-mgmt-card').length === 3, 'the usable cards are untouched');

app.unmount();
host.remove();
console.log('✓ the Publications page separates usable publications from failed ones');
