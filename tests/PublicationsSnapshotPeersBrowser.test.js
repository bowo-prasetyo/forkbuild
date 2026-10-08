// @environment browser
import { createApp, nextTick } from 'vue';
import DecentralizedPublicationsView from '../ui/views/DecentralizedPublicationsView.js';
import { PublicationResolutionOutcome } from '../application/publication/PublicationResolutionOutcome.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { SnapshotPeerPossessionState } from '../application/snapshot/possession/SnapshotPeerPossessionState.js';
import { PeerSnapshotMaterializationOutcome } from '../application/snapshot/materialization/PeerSnapshotMaterializationOutcome.js';
import { SnapshotMaterializationSourceKind } from '../application/snapshot/materialization/SnapshotMaterializationSourceKind.js';
import { assert } from './support/Assert.js';

// A card's Snapshot tab, rendered by real Vue over fake services: it is a
// regular feature with no Experimental badge. "Which peers have it?" lists
// every connected peer ticked, asks only the ones still ticked, shows each
// answer, and offers to get the snapshot only from a peer that said yes,
// from that peer alone. What this visit tried is listed once something was
// tried, and there is no separate Snapshot State summary.

const HASH = 'a'.repeat(64);
const json = { id: 'good', contentKind: 'forkbuild.structure', publisherIdentity: { id: 'did:key:zgood' }, contentReference: { hash: HASH } };
const publication = { ...json, title: 'good', toJSON: () => json };

function peer(connectionId, alias) {
    return { connectionId, alias, remoteIdentity: null, getLifecycleState: () => PeerLifecycleState.AUTHENTICATED };
}
const peers = [peer('c-alice', 'Alice'), peer('c-bob', 'Bob'), peer('c-carol', 'Carol')];
const ANSWERS = { 'c-alice': SnapshotPeerPossessionState.AVAILABLE, 'c-carol': SnapshotPeerPossessionState.NOT_AVAILABLE };

const asked = [];
const fetchedFrom = [];
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
app.provide('peerSessionManager', { listPeers: () => peers });
app.provide('publicationAnchorCreationCoordinator', null);
app.provide('publicationEvidenceCoordinator', null);
app.provide('publicationPeerExchange', null);
app.provide('publicationPeerContentExchange', null);
app.provide('snapshotPeerMaterializationCoordinator', { materialize: async () => { throw new Error('not used here'); } });
app.provide('snapshotPeerPossessionCoordinator', {
    observePeers: async ({ peers: list, publicationId, contentHash }) => {
        asked.push(list.map((p) => p.alias));
        return list.map((p) => ({ peerId: p.connectionId, publicationId, contentHash, state: ANSWERS[p.connectionId], observedAt: new Date() }));
    }
});
app.provide('snapshotMaterializationSelectionCoordinator', {
    materialize: async (selection) => {
        fetchedFrom.push(selection.peer.alias);
        return {
            outcome: PeerSnapshotMaterializationOutcome.STORED, reason: null,
            contentReference: { hash: HASH }, publicationId: 'good', contentHash: HASH, publicationKnown: true,
            source: { kind: SnapshotMaterializationSourceKind.PEER }
        };
    }
});
app.mount(host);

async function settle() {
    for (let i = 0; i < 20; i += 1) {
        await nextTick();
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
}
const buttonNamed = (root, label) => [...root.querySelectorAll('button')].find((button) => button.textContent.trim() === label);
const textOf = (element) => element.textContent.replace(/\s+/g, ' ').trim();
await settle();

const card = host.querySelector('.identity-mgmt-card');
const tab = card.querySelector('[role="tab"]');
assert(tab.textContent.trim() === 'Snapshot' && !tab.querySelector('.experimental-badge'), 'the Snapshot tab is not marked Experimental');
const snapshotTab = tab.closest('details').querySelector('.publications-tools-tabs').nextElementSibling;
const titles = () => [...snapshotTab.querySelectorAll('.evidence-convergence-title')].map((title) => title.textContent.trim());
assert(!snapshotTab.querySelector('.experimental-badge'), 'and nothing on it is');
assert(titles().join() === 'Local Snapshot,Which peers have it?', `one peer section, and no Snapshot State or attempts yet (got ${titles().join()})`);

const section = [...snapshotTab.querySelectorAll('.evidence-list')].find((list) => list.querySelector('.evidence-convergence-title')?.textContent.trim() === 'Which peers have it?');
const boxes = [...section.querySelectorAll('input[type="checkbox"]')];
assert(boxes.length === 3 && boxes.every((box) => box.checked), 'every connected peer is listed, ticked');
console.log('✓ the Snapshot tab is a regular feature, with one "Which peers have it?" section listing every peer ticked');

boxes[1].click();
await settle();
buttonNamed(section, 'Ask Selected Peers').click();
await settle();
assert(asked.length === 1 && asked[0].join() === 'Alice,Carol', `only the ticked peers are asked (got ${asked.join(' | ')})`);
const reports = [...section.querySelectorAll('.replica-knowledge-claim .peer-badge')].map((badge) => textOf(badge));
assert(reports.join() === 'Available,Not available', `each asked peer's answer is shown (got ${reports.join()})`);
const answered = [...section.querySelectorAll('.replica-knowledge-claim dl .evidence-field:first-child dd')].map((dd) => textOf(dd));
assert(answered.join() === 'Alice,Carol', `and only theirs; Bob, unticked, has no row (got ${answered.join()})`);
assert(buttonNamed(section, 'Get Snapshot from Alice') && !buttonNamed(section, 'Get Snapshot from Carol'),
    'only a peer that said yes offers the snapshot');
assert(buttonNamed(section, 'Ask Selected Peers Again'), 'and the button now asks again');
console.log('✓ it asks only the ticked peers, and offers the snapshot only from one that said yes');

buttonNamed(section, 'Get Snapshot from Alice').click();
await settle();
assert(fetchedFrom.join() === 'Alice', 'getting it asks that peer alone');
assert(titles().join() === 'Local Snapshot,Which peers have it?,Attempts this visit', `the attempt is then listed (got ${titles().join()})`);
assert(buttonNamed(snapshotTab, 'Show Acquisition History'), 'with its history');

buttonNamed(section, 'Show Answers from This Visit').click();
await settle();
assert(buttonNamed(section, 'Hide Answers from This Visit') && section.querySelectorAll('.replica-knowledge-claim-list').length === 3,
    'every answer from this visit can be listed');
console.log('✓ getting the snapshot from a peer is listed under this visit\'s attempts, and every answer can be shown');

app.unmount();
host.remove();
