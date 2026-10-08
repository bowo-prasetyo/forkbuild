// @environment browser
import { createApp, nextTick } from 'vue';
import DecentralizedPublicationsView from '../ui/views/DecentralizedPublicationsView.js';
import { PublicationResolutionOutcome } from '../application/publication/PublicationResolutionOutcome.js';
import { assert } from './support/Assert.js';

// Arweave anchoring and the Decentralization & Evidence tab are regular
// features, rendered by real Vue over fake services. With Arweave offered,
// the Proof / Anchoring block loses its block-wide badge and the Arweave card
// has none, while Steem's keeps its own. The Decentralization & Evidence tab
// carries no badge: the Decentralization summary and the External Evidence
// list are regular, and in the list only an Experimental anchor type (Steem
// here) is marked.

const HASH = 'a'.repeat(64);
const json = { id: 'good', contentKind: 'forkbuild.structure', publisherIdentity: { id: 'did:key:zgood' }, contentReference: { hash: HASH } };
const publication = { ...json, title: 'good', toJSON: () => json };

function anchor(id, anchorType, locator) {
    return {
        id, anchorType, locator, publicationId: 'good', contentHash: HASH,
        anchoredAt: new Date('2026-10-08T00:00:00Z'), anchorIdentity: { id: 'did:key:zgood' }, proof: {}
    };
}
const anchors = [anchor('anchor-ar', 'arweave', 'ar://abc'), anchor('anchor-steem', 'steem', 'steem://forkbuild/x')];

const host = document.createElement('div');
document.body.appendChild(host);
const app = createApp(DecentralizedPublicationsView);
app.config.warnHandler = () => {};
app.component('router-link', { props: ['to'], template: '<a><slot /></a>' });
app.provide('publicationCatalog', { list: () => [publication], has: () => true, getReceivedAt: () => null, remove: () => false });
app.provide('publicationResolutionCoordinator', {
    resolve: async () => ({ outcome: PublicationResolutionOutcome.RESOLVED, content: { title: 'Harbour Lighthouse' }, reason: null })
});
app.provide('publicationDisplayKindPlugins', { 'forkbuild.structure': { describe: () => 'a structure' } });
app.provide('peerSessionManager', { listPeers: () => [] });
app.provide('publicationAnchorCreationCoordinator', {
    availableAnchorTypes: () => ['arweave', 'steem'],
    batchAnchorTypes: () => []
});
app.provide('publicationEvidenceCoordinator', { discover: () => anchors, verify: async () => null });
app.provide('publicationPeerExchange', null);
app.provide('publicationPeerContentExchange', null);
app.mount(host);

async function settle() {
    for (let i = 0; i < 20; i += 1) {
        await nextTick();
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
}
const buttonNamed = (root, label) => [...root.querySelectorAll('button')].find((button) => button.textContent.trim() === label);
const cardTyped = (root, type) => [...root.querySelectorAll('.evidence-anchor-card')]
    .find((anchorCard) => anchorCard.querySelector('.evidence-anchor-type')?.textContent.trim() === type);
await settle();

const card = host.querySelector('.identity-mgmt-card');
const proof = [...card.querySelectorAll('.identity-mgmt-distribution-role')]
    .find((role) => role.querySelector('.evidence-convergence-title').textContent.trim() === 'Proof / Anchoring');
assert(proof, 'the Proof / Anchoring block is offered');
assert(!proof.querySelector('.evidence-discovery-header .experimental-badge'), 'with Arweave offered, the block is not marked Experimental as a whole');
// An Arweave anchor already exists, so its button offers another.
assert(buttonNamed(proof, 'Create Another Arweave Anchor') && !cardTyped(proof, 'Arweave').querySelector('.experimental-badge'),
    'Arweave anchoring is a regular feature');
assert(cardTyped(proof, 'Steem').querySelector('.experimental-badge'), 'while Steem anchoring stays marked');
console.log('✓ Arweave anchoring is offered unmarked, and Steem keeps its own badge');

const tab = [...card.querySelectorAll('[role="tab"]')].find((candidate) => candidate.textContent.trim() === 'Decentralization & Evidence');
assert(tab && !tab.querySelector('.experimental-badge'), 'the Decentralization & Evidence tab is not marked Experimental');
tab.click();
await settle();
const evidenceTab = tab.closest('details').querySelector('.publications-tools-tabs').parentElement;
const summary = evidenceTab.querySelector('.decentralization-summary');
assert(summary && summary.textContent.includes('Decentralization') && !summary.querySelector('.experimental-badge'),
    'the Decentralization summary is shown, unmarked');
buttonNamed(evidenceTab, 'Show Evidence').click();
await settle();
const list = evidenceTab.querySelector('.evidence-list');
assert(cardTyped(list, 'Arweave') && !cardTyped(list, 'Arweave').querySelector('.experimental-badge'), 'an Arweave anchor is listed unmarked');
assert(cardTyped(list, 'Steem').querySelector('.experimental-badge'), 'a Steem anchor is marked Experimental');
console.log('✓ the Decentralization & Evidence tab is a regular feature, marking only Experimental anchor types');

app.unmount();
host.remove();
