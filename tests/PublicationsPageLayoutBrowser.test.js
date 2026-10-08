// @environment browser
import { createApp, nextTick } from 'vue';
import DecentralizedPublicationsView from '../ui/views/DecentralizedPublicationsView.js';
import { PublicationResolutionOutcome } from '../application/publication/PublicationResolutionOutcome.js';
import { LEGACY_HASH_REASON } from '../serializer/contentHash.js';
import { CreatePublicationDisplayKindRegistryUseCase } from '../application/publication/CreatePublicationDisplayKindRegistryUseCase.js';
import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { assert } from './support/Assert.js';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// The Publications page, rendered by real Vue with the shipped CSS over fake
// services: usable publications are listed as full cards with Distribution
// folded, publications that failed their check are folded into one group of
// compact cards, the batch-anchor picker lists only usable publications, the
// "no peer" notice appears only when something could be retrieved, and failed
// publications can be removed from this device after a confirm step. Cards
// and picker rows are named by the checked content's title when it has one.
// An old publication one of this device's identities signed is listed first
// in the failed group, marked as yours, with how to publish it again, and,
// when this device still has its record, that World's title and a link that
// opens it in the Editor. The
// page-wide tools sit below the publications. A card's Distribution section
// leads with one button for the saved preferred storage or anchoring
// provider, folding the per-type cards, and shows the cards with a reason
// when that preference can't be used.

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
    availableAnchorTypes: () => ['bitcoin-op-return', 'steem'],
    batchAnchorTypes: () => [{ anchorType: 'steem', maxBatchSize: 64 }]
};

// Saved preferred providers by role, and what each preferred trigger was
// asked to do.
const preferences = { CONTENT: 'ipfs', PROOF_AND_ANCHORING: 'bitcoin-op-return' };
const preferredCalls = { placements: [], anchors: [] };
function provideDistribution(target) {
    target.provide('roleProviderPreferenceStore', { get: (role) => (preferences[role] ? { role, providerKey: preferences[role] } : null) });
    target.provide('snapshotPlacementCreationCoordinator', { availableStorageTypes: () => ['local', 'ipfs'] });
    target.provide('preferredSnapshotPlacementCreationCoordinator', {
        preferableStorageTypes: () => ['ipfs'],
        create: async (publicationId) => {
            preferredCalls.placements.push(publicationId);
            return { outcome: 'placement-unavailable', placement: null, reason: 'the IPFS node could not be reached' };
        }
    });
    target.provide('preferredPublicationAnchorCreationCoordinator', {
        create: async (publicationId) => {
            preferredCalls.anchors.push(publicationId);
            return { outcome: 'publish-unavailable', anchor: null, reason: 'Steem Keychain is not installed' };
        }
    });
}
function distributionRoles(card) {
    const roles = [...card.querySelectorAll('.identity-mgmt-distribution-role')];
    const named = (title) => roles.find((role) => role.querySelector('.evidence-convergence-title').textContent.trim() === title);
    return { content: named('Content'), proof: named('Proof / Anchoring') };
}

// Renders a route object as path?query, as the real router's href would.
const RouterLinkStub = {
    props: ['to'],
    computed: {
        href() {
            return typeof this.to === 'string' ? this.to : `${this.to.path}?${new URLSearchParams(this.to.query || {})}`;
        }
    },
    template: '<a :href="href"><slot /></a>'
};

// This device's own records know the World that 'mine' shared.
const findOwnSharedPublicationCalls = [];
const findsMine = {
    find: async (envelope) => {
        findOwnSharedPublicationCalls.push(envelope.id);
        return envelope.id === 'mine' ? { publicationId: 'pub-castle', documentId: 'doc-castle', title: 'My Castle' } : null;
    }
};

const host = document.createElement('div');
document.body.appendChild(host);
const app = createApp(DecentralizedPublicationsView);
app.config.warnHandler = () => {};
app.component('router-link', RouterLinkStub);
app.provide('findOwnSharedPublicationUseCase', findsMine);
app.provide('publicationCatalog', catalog);
app.provide('publicationResolutionCoordinator', coordinator);
app.provide('publicationDisplayKindPlugins', {
    'forkbuild.structure': { describe: () => 'a structure' },
    'forkbuild.publication': publicationKindPlugin
});
app.provide('identityUseCase', { listIdentities: () => [{ identityId: 'did:key:zme' }] });
provideDistribution(app);
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

// Experimental parts are marked on the page itself: the notice, the tools
// panel, and parts inside the detail tabs, never a detail tab as a whole.
assert(view.textContent.includes('Parts marked') && view.querySelector(':scope > p .experimental-badge'), 'the intro says which parts are Experimental');
assert(view.querySelector('#publications-tools > summary .experimental-badge'), 'the tools panel is marked Experimental');
{
    const tabs = [...view.querySelector('.identity-mgmt-card .publications-tools-tabs').querySelectorAll('[role="tab"]')];
    const marked = tabs.filter((tab) => tab.querySelector('.experimental-badge')).map((tab) => tab.firstChild.textContent.trim());
    assert(marked.length === 0, `no detail tab is marked as a whole (got ${marked.join()})`);
}
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
assert(mineCard.textContent.includes('Yours') && mineCard.textContent.includes('Open it in the Editor and publish it again'),
    'your own old publication is listed first, saying how to publish it again');
assert(!mineCard.textContent.includes(LEGACY_HASH_REASON), "instead of telling you to ask its author");
assert(mineCard.querySelector('.identity-mgmt-name').textContent.trim() === 'My Castle'
    && mineCard.querySelector('.identity-mgmt-status').textContent.trim().startsWith('Shared World ·'),
    "it is named by your own record's title, its kind moved to the line below");
const mineLink = [...mineCard.querySelectorAll('a')].find((link) => link.textContent.trim() === 'Open in Editor');
assert(mineLink && mineLink.getAttribute('href') === '/editor?load=doc-castle', 'with a link that opens that World in the Editor');
assert(findOwnSharedPublicationCalls.join() === 'mine', "only your own old entries are looked up, other people's never");
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

// The page-wide tools come after the publications, folded; the intro's link
// opens them on the Blockchain Anchoring tab.
const toolsPanel = view.querySelector(':scope > #publications-tools');
assert(toolsPanel && !toolsPanel.open, 'the tools panel is folded');
const order = [...view.children];
assert(order.indexOf(mainList) < order.indexOf(toolsPanel) && order.indexOf(failedGroup) < order.indexOf(toolsPanel),
    'and comes after the publications and the failed group');
toolsPanel.querySelector('[role="tab"]:nth-child(2)').click();
await settle();
buttonNamed(view.querySelector(':scope > p'), 'Wallet, Archive & Publisher Tools').click();
await settle();
assert(toolsPanel.open, "the intro's link opens it");
assert(toolsPanel.querySelector('[role="tab"][aria-selected="true"]').textContent.trim() === 'Blockchain Anchoring', 'on the Blockchain Anchoring tab');

// Distribution with a usable storage preference: one named button, the
// per-backend cards folded under it.
{
    const { content, proof } = distributionRoles(usableCards[0]);
    const storeButton = buttonNamed(content, 'Store on IPFS');
    assert(storeButton && content.textContent.includes('your preferred storage'), 'Content leads with a button naming the saved storage');
    const storageOptions = content.querySelector('details.identity-mgmt-distribution-options');
    assert(storageOptions && !storageOptions.open && storageOptions.querySelector('summary').textContent.trim() === 'Other storage options (2)',
        'the per-backend cards are folded under it');
    storeButton.click();
    await settle();
    assert(preferredCalls.placements.join() === 'good', 'the button places this publication through the preferred trigger');
    assert(content.textContent.includes('the IPFS node could not be reached'), 'and shows how that went');

    // A Bitcoin preference takes wallet steps, so no one-click button: the
    // cards stay open and the hint says where to go.
    assert(!buttonNamed(proof, 'Anchor on Bitcoin'), 'no one-click button for a wallet-guided preference');
    assert(proof.textContent.includes('Your preferred anchoring provider, Bitcoin, is anchored through its wallet steps'), 'the hint names it and says where');
    const anchorOptions = proof.querySelector('details.identity-mgmt-distribution-options');
    assert(anchorOptions.open && anchorOptions.querySelector('summary').textContent.trim() === 'Anchoring options (1)', 'the per-type cards are shown');
    assert(buttonNamed(anchorOptions, 'Create Steem Anchor'), 'with their own buttons');
    assert(!buttonNamed(proof, 'Create Bitcoin Anchor') && !proof.textContent.includes('Bitcoin</span>'),
        'but no one-click Bitcoin card, which has no wallet behind it and never succeeds');
    assert(proof.querySelector('.evidence-discovery-header .experimental-badge'), 'Proof / Anchoring is marked Experimental');
    assert(!content.querySelector('.evidence-discovery-header .experimental-badge'), 'Content is not');
    const steemCard = [...anchorOptions.querySelectorAll('.evidence-anchor-card')]
        .find((anchorCard) => anchorCard.querySelector('.evidence-anchor-type').textContent.trim() === 'Steem');
    assert(steemCard && steemCard.querySelector('.evidence-anchor-header .experimental-badge'), 'and so is each anchor type on its own card');
}

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

// A second visit with a Steem anchoring preference and no storage preference.
{
    preferences.CONTENT = null;
    preferences.PROOF_AND_ANCHORING = 'steem';
    const secondHost = document.createElement('div');
    document.body.appendChild(secondHost);
    const second = createApp(DecentralizedPublicationsView);
    second.config.warnHandler = () => {};
    second.component('router-link', RouterLinkStub);
    second.provide('publicationCatalog', catalog);
    second.provide('publicationResolutionCoordinator', coordinator);
    second.provide('publicationDisplayKindPlugins', { 'forkbuild.structure': { describe: () => 'a structure' } });
    second.provide('peerSessionManager', { listPeers: () => [] });
    second.provide('publicationAnchorCreationCoordinator', creationCoordinator);
    second.provide('publicationEvidenceCoordinator', null);
    second.provide('publicationPeerExchange', null);
    second.provide('publicationPeerContentExchange', null);
    provideDistribution(second);
    second.mount(secondHost);
    await settle();

    const card = secondHost.querySelector('.publications-view > .identity-mgmt-list > .identity-mgmt-card');
    const { content, proof } = distributionRoles(card);
    const anchorButton = buttonNamed(proof, 'Anchor on Steem');
    assert(anchorButton && proof.textContent.includes('your preferred anchoring provider'), 'Proof / Anchoring leads with a button naming the saved provider');
    assert(proof.querySelector('.evidence-discovery > p .experimental-badge'), 'which is marked Experimental, as Steem is');
    assert(!proof.querySelector('details.identity-mgmt-distribution-options').open, 'the per-type cards are folded under it');
    anchorButton.click();
    await settle();
    assert(preferredCalls.anchors.join() === 'good' && proof.textContent.includes('Steem Keychain is not installed'), 'it anchors through the preferred trigger and shows how that went');

    assert(!content.querySelector('.evidence-discovery') && content.textContent.includes('No preferred storage is set'), 'with no storage saved, no button and no guess');
    const storageOptions = content.querySelector('details.identity-mgmt-distribution-options');
    assert(storageOptions.open && storageOptions.querySelector('summary').textContent.trim() === 'Storage options (2)', 'the per-backend cards are shown instead');

    second.unmount();
    secondHost.remove();
    console.log('✓ Distribution leads with the saved preferred provider, or shows every option when there is none');
}

// Your old entry again, when this device has no record of its World (it was
// unpublished since, say): the card falls back to the kind's own advice.
{
    publications.push(fakePublication('mine', '0000000c', { contentKind: 'forkbuild.publication', publisherId: 'did:key:zme' }));
    const thirdHost = document.createElement('div');
    document.body.appendChild(thirdHost);
    const third = createApp(DecentralizedPublicationsView);
    third.config.warnHandler = () => {};
    third.component('router-link', RouterLinkStub);
    third.provide('publicationCatalog', catalog);
    third.provide('publicationResolutionCoordinator', coordinator);
    third.provide('publicationDisplayKindPlugins', {
        'forkbuild.structure': { describe: () => 'a structure' },
        'forkbuild.publication': publicationKindPlugin
    });
    third.provide('identityUseCase', { listIdentities: () => [{ identityId: 'did:key:zme' }] });
    third.provide('findOwnSharedPublicationUseCase', { find: async () => null });
    third.provide('peerSessionManager', { listPeers: () => [] });
    third.provide('publicationAnchorCreationCoordinator', creationCoordinator);
    third.provide('publicationEvidenceCoordinator', null);
    third.provide('publicationPeerExchange', null);
    third.provide('publicationPeerContentExchange', null);
    third.mount(thirdHost);
    await settle();

    const card = [...thirdHost.querySelectorAll('.identity-mgmt-card')].find((candidate) => candidate.textContent.includes('Yours'));
    assert(card && card.querySelector('.identity-mgmt-name').textContent.trim() === 'Shared World', 'without a record, the card keeps its kind as its name');
    assert(card.textContent.includes('Share with Peers under it in the Repository'), "and the kind's own advice");
    const link = [...card.querySelectorAll('a')].find((candidate) => candidate.textContent.trim() === 'Open Repository');
    assert(link && link.getAttribute('href') === '/repository' && !card.textContent.includes('Open in Editor'), 'with a link to the Repository, not the Editor');

    third.unmount();
    thirdHost.remove();
    console.log('✓ your own old World opens in the Editor when this device still has its record');
}

// Distribute Snapshot on a World announces the World's own snapshot on the
// chosen substrate, with its publisher's signed placement, and names that
// substrate in the result; any other kind announces its content by hash
// alone.
{
    const WORLD_HASH = 'd'.repeat(64);
    const world = new Publication({
        id: 'pub-world', documentId: 'doc-world', title: 'Stone Harbour', author: 'someone',
        contentReference: new ContentReference({ hash: WORLD_HASH, storage: 'local' }),
        publisherIdentity: { id: 'did:key:zpublisher', algorithm: 'Ed25519', publicKey: 'key' }
    });
    const envelopes = [
        fakePublication('world-envelope', 'e'.repeat(64), { contentKind: 'forkbuild.publication' }),
        fakePublication('claim', 'f'.repeat(64))
    ];
    const bytes = { [WORLD_HASH]: 'WORLD-BYTES', ['e'.repeat(64)]: 'ENVELOPE-BYTES', ['f'.repeat(64)]: 'CLAIM-BYTES' };
    const calls = [];
    const fourthHost = document.createElement('div');
    document.body.appendChild(fourthHost);
    const fourth = createApp(DecentralizedPublicationsView);
    fourth.config.warnHandler = () => {};
    fourth.component('router-link', RouterLinkStub);
    fourth.provide('publicationCatalog', { list: () => [...envelopes], getReceivedAt: () => '2026-09-28T10:00:00.000Z' });
    fourth.provide('publicationResolutionCoordinator', {
        resolve: async (json) => ({
            outcome: PublicationResolutionOutcome.RESOLVED,
            content: json.id === 'world-envelope' ? world : { title: 'Plain Claim' },
            reason: null
        })
    });
    fourth.provide('publicationDisplayKindPlugins', {
        'forkbuild.structure': { describe: () => 'a structure' },
        'forkbuild.publication': { describe: () => 'a World' }
    });
    fourth.provide('peerSessionManager', { listPeers: () => [] });
    fourth.provide('publicationAnchorCreationCoordinator', creationCoordinator);
    fourth.provide('publicationEvidenceCoordinator', null);
    fourth.provide('publicationPeerExchange', null);
    fourth.provide('publicationPeerContentExchange', null);
    fourth.provide('publicationContentStore', { get: async (reference) => bytes[reference.hash] ?? null });
    fourth.provide('defaultAnnouncementDiscoveryProvider', 'steem');
    fourth.provide('snapshotDistributionAvailableStorageTypes', () => ['ipfs', 'steem']);
    fourth.provide('defaultContentDistributionProvider', 'ipfs');
    fourth.provide('publisherPlacementClaimLookup', {
        claimFor: (publication) => (publication.id === 'pub-world'
            ? { publicationId: 'pub-world', claimedPosition: { x: 1, y: 2, z: 3 }, placementRecord: { placementId: 'signed' } }
            : {})
    });
    fourth.provide('snapshotDistributionCommand', async (snapshotBytes, storage, publicationId, claimedPosition, discoveryProvider, placementRecord) => {
        calls.push({ snapshotBytes, storage, publicationId, claimedPosition, discoveryProvider, placementRecord });
        return { contentReference: { hash: 'h', uri: 'ipfs://cid', storage }, announcement: { id: 'announced' } };
    });
    fourth.mount(fourthHost);
    await settle();

    const cards = [...fourthHost.querySelectorAll('.publications-view > .identity-mgmt-list > .identity-mgmt-card')];
    const worldCard = cards.find((card) => card.querySelector('.identity-mgmt-name').textContent.trim() === 'Stone Harbour');
    const claimCard = cards.find((card) => card.querySelector('.identity-mgmt-name').textContent.trim() === 'Plain Claim');
    assert(worldCard && claimCard, 'both cards are listed');
    const snapshotCard = (card) => [...card.querySelectorAll('.evidence-anchor-card')]
        .find((candidate) => candidate.querySelector('.evidence-anchor-type').textContent.trim() === 'Snapshot');
    const worldSnapshot = snapshotCard(worldCard);
    const optionTexts = (select) => [...select.options].map((option) => option.textContent.trim());
    const [storageSelect, substrateSelect] = worldSnapshot.querySelectorAll('select');
    assert(optionTexts(storageSelect).includes('Steem (Experimental)') && optionTexts(storageSelect).includes('IPFS'), 'Steem storage is labelled Experimental');
    assert(optionTexts(substrateSelect).join() === 'Arweave,Blurt (Experimental),Nostr,Steem (Experimental)', 'and so are the Steem and Blurt substrates');
    assert(substrateSelect.value === 'steem', 'the substrate starts on the saved preference');
    assert([...worldSnapshot.querySelectorAll('a')].some((link) => link.textContent.trim() === 'Configure Steem'), 'with its own Configure link');
    assert(!worldSnapshot.textContent.includes('Configure Nostr'), 'not always Nostr');

    buttonNamed(worldSnapshot, 'Distribute Snapshot').click();
    await settle();
    assert(calls.length === 1 && calls[0].snapshotBytes === 'WORLD-BYTES', "a World's own snapshot is distributed, not its Publication record");
    assert(calls[0].publicationId === 'pub-world' && same(calls[0].claimedPosition, { x: 1, y: 2, z: 3 }) && calls[0].placementRecord.placementId === 'signed',
        "with its publisher's signed placement");
    assert(calls[0].discoveryProvider === 'steem' && calls[0].storage === 'ipfs', 'on the chosen substrate and storage');
    assert(worldSnapshot.textContent.includes('Steem: Announced') && worldSnapshot.textContent.includes("with its publisher's placement"),
        'and the result names the substrate it used');
    assert(!worldSnapshot.textContent.includes('Nostr: Announced'), 'never Nostr regardless');

    const claimSnapshot = snapshotCard(claimCard);
    const claimSubstrate = claimSnapshot.querySelectorAll('select')[1];
    claimSubstrate.value = 'nostr';
    claimSubstrate.dispatchEvent(new Event('change'));
    await settle();
    buttonNamed(claimSnapshot, 'Distribute Snapshot').click();
    await settle();
    assert(calls.length === 2 && calls[1].snapshotBytes === 'CLAIM-BYTES' && calls[1].publicationId === undefined && calls[1].claimedPosition === undefined,
        'another kind is announced by its content hash alone');
    assert(calls[1].discoveryProvider === 'nostr' && claimSnapshot.textContent.includes('Nostr: Announced'), 'on the substrate chosen for it');
    assert(!claimSnapshot.textContent.includes('placement'), 'saying nothing about a placement');

    fourth.unmount();
    fourthHost.remove();
    console.log("✓ Distribute Snapshot announces a World's snapshot with its publisher's placement, and names the substrate it used");
}
