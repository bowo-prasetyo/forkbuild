// Which substrate serves which of the three roles (core/RoleProviderRole.js),
// checked against the real providers rather than written down from memory.
// Proof & Anchoring is read from the registries ui/main/composeAnchoring.js
// actually fills. Content is read from a SnapshotPlacementStoreRegistry
// holding each substrate's real ContentStore. For Announcement & Discovery,
// each substrate's Snapshot discovery publisher and query service do a real
// round trip against a fake of that substrate: what one publishes, the
// other finds (tests/AnnouncementDiscoveryProviderRegistry.test.js covers
// the role's registry). The matrix at the end is the expected one;
// changing what a substrate serves means changing it here on purpose.
import { composeAnchoring } from '../ui/main/composeAnchoring.js';
import { composeSteemRuntime } from '../application/steem/SteemRuntimeComposition.js';
import { composeBlurtRuntime } from '../application/blurt/BlurtRuntimeComposition.js';
import { SteemReadingConfiguration } from '../core/SteemReadingConfiguration.js';
import { BlurtReadingConfiguration } from '../core/BlurtReadingConfiguration.js';
import { LocalPublicationAnchorCatalog } from '../application/anchoring/LocalPublicationAnchorCatalog.js';
import { LocalPublicationCatalog } from '../application/publication/LocalPublicationCatalog.js';
import { LocalAnchorKnowledgeStore } from '../application/anchoring/LocalAnchorKnowledgeStore.js';
import { RoleProviderPreferenceStore } from '../storage/RoleProviderPreferenceStore.js';
import { ProofVerifier } from '../anchoring/ProofVerifier.js';
import { ContentStore } from '../content/ContentStore.js';
import { ArweaveContentStore } from '../content/ArweaveContentStore.js';
import { IpfsContentStore } from '../content/IpfsContentStore.js';
import { IpfsGatewayFailoverContentStore } from '../content/IpfsGatewayFailoverContentStore.js';
import { SnapshotPlacementStoreRegistry } from '../application/snapshot/placement/SnapshotPlacementStoreRegistry.js';
import { NostrSnapshotDiscoveryPublisher } from '../application/nostr/NostrSnapshotDiscoveryPublisher.js';
import { NostrSnapshotDiscoveryQueryService } from '../application/nostr/NostrSnapshotDiscoveryQueryService.js';
import { ArweaveSnapshotDiscoveryPublisher } from '../application/arweave/ArweaveSnapshotDiscoveryPublisher.js';
import { ArweaveSnapshotDiscoveryQueryService } from '../application/arweave/ArweaveSnapshotDiscoveryQueryService.js';
import { RoleProviderRole } from '../core/RoleProviderRole.js';
import { fakeBlurtChain } from './support/FakeBlurtChain.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { makeIdentity } from './support/TestIdentity.js';
import { assert } from './support/Assert.js';

const SUBSTRATES = ['arweave', 'steem', 'blurt', 'nostr', 'ipfs', 'bitcoin', 'base'];
const ANCHOR_TYPE = { arweave: 'arweave', steem: 'steem', blurt: 'blurt', bitcoin: 'bitcoin-op-return', base: 'base' };
const STORAGE = { arweave: 'ar', steem: 'steem', blurt: 'blurt', ipfs: 'ipfs' };
const TAG = 'forkbuild-snapshot';
const noWallet = { sign: async () => { throw new Error('no wallet in this test'); } };
const offline = async () => { throw new Error('offline'); };

// A Steem node and Keychain: every forkbuild-* thread is open, and a
// broadcast reply is stored where get_content_replies finds it.
function fakeSteem() {
    const replies = new Map();
    let blockNum = 100;
    const fetchImpl = async (url, init) => {
        const { method, params, id } = JSON.parse(init.body);
        let result;
        if (method === 'condenser_api.get_content') {
            const [author, permlink] = params;
            result = permlink.startsWith('forkbuild-') ? { author, permlink, allow_replies: true } : { author: '', permlink: '' };
        } else if (method === 'condenser_api.get_content_replies') {
            result = replies.get(`${params[0]}/${params[1]}`) ?? [];
        } else {
            return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id, error: { message: `unknown method ${method}` } }) };
        }
        return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id, result }) };
    };
    const broadcaster = {
        async broadcast(account, operations) {
            const [, comment] = operations.find(([name]) => name === 'comment');
            const key = `${comment.parent_author}/${comment.parent_permlink}`;
            replies.set(key, [...(replies.get(key) ?? []), { ...comment, created: new Date().toISOString().slice(0, 19) }]);
            blockNum += 1;
            return { transactionId: blockNum.toString(16).padStart(40, '0'), blockNum };
        }
    };
    return { fetchImpl, broadcaster };
}

// One relay: a published event is returned to any query.
function fakeNostrRelay() {
    const events = [];
    return {
        publishImpl: async (relayUrl, template) => {
            const id = (events.length + 1).toString(16).padStart(64, '0');
            events.push({ ...template, id, pubkey: 'a'.repeat(64), created_at: 1790000000 + events.length, sig: 'b'.repeat(128) });
            return { published: true, id };
        },
        queryImpl: async () => events.map((event) => ({ ...event }))
    };
}

// One gateway: an uploaded transaction is listed by GraphQL and served by id.
function fakeArweaveGateway() {
    const transactions = new Map();
    return {
        uploadTaggedTransaction: async (material) => {
            const id = `AnnounceTx${String(transactions.size + 1).padStart(33, '0')}`;
            transactions.set(id, material);
            return { id };
        },
        fetchImpl: async (url, options = {}) => {
            if ((options.method || 'GET') === 'POST') {
                return { ok: true, json: async () => ({ data: { transactions: { edges: [...transactions.keys()].map((id) => ({ node: { id } })) } } }) };
            }
            const id = url.split('/').pop();
            if (!transactions.has(id)) return { ok: false };
            return { ok: true, headers: { get: () => null }, text: async () => transactions.get(id) };
        }
    };
}

async function roundTrip(publisher, queryService, contentHash) {
    await publisher.publish({ contentHash, locator: `ar://SnapshotContentTx${contentHash.slice(-4).padStart(24, '0')}`, storage: 'ar' });
    const { outcome, candidates } = await queryService.searchWithOutcome(TAG);
    return outcome === 'found' && candidates.some((candidate) => candidate.contentHash === contentHash);
}

const matrix = Object.fromEntries(SUBSTRATES.map((substrate) => [substrate, new Set()]));

// Proof & Anchoring: the registries the app's anchoring composition fills.
{
    const steemRuntime = composeSteemRuntime({ fetchImpl: offline });
    const blurtRuntime = composeBlurtRuntime({ fetchImpl: offline });
    const composed = composeAnchoring({
        identityProvider: makeIdentity('Alice'),
        resolvedBitcoinEsploraApiUrls: ['https://esplora.invalid/api'],
        publicationCatalog: new LocalPublicationCatalog(new InMemoryStorageProvider()),
        publicationAnchorCatalog: new LocalPublicationAnchorCatalog(new InMemoryStorageProvider()),
        anchorKnowledgeStore: new LocalAnchorKnowledgeStore(new InMemoryStorageProvider()),
        roleProviderPreferenceStore: new RoleProviderPreferenceStore(new InMemoryStorageProvider()),
        arweaveHostSigner: noWallet,
        resolvedArweaveGatewayUrl: 'https://arweave.invalid',
        steemRuntime,
        blurtRuntime
    });
    for (const substrate of SUBSTRATES) {
        const anchorType = ANCHOR_TYPE[substrate];
        if (!anchorType || !composed.externalAnchorProofVerifierRegistry.has(anchorType)) continue;
        const verifier = composed.externalAnchorProofVerifierRegistry.get(anchorType);
        assert(verifier instanceof ProofVerifier && verifier.anchorType === anchorType, `${substrate}'s verifier is a ProofVerifier for "${anchorType}"`);
        assert(composed.externalAnchorEvidenceViewRegistry.has(anchorType), `${substrate} anchors can be described, not only verified`);
        matrix[substrate].add(RoleProviderRole.PROOF_AND_ANCHORING);
    }
    const creatable = SUBSTRATES.filter((substrate) => ANCHOR_TYPE[substrate] && composed.externalAnchorPublisherRegistry.has(ANCHOR_TYPE[substrate]));
    // Base anchors are created through their own wallet pipeline (anchoring/BaseAnchorPublisher.js), not this registry.
    assert(creatable.join() === 'arweave,steem,blurt,bitcoin', `anchors are created through the shared registry on every verifiable substrate but Base (got ${creatable})`);
    console.log('✓ Proof & Anchoring, from the composed registries');
}

// Content: each substrate's real ContentStore, resolved by its storage key.
{
    const registry = new SnapshotPlacementStoreRegistry();
    const stores = {
        arweave: new ArweaveContentStore({ signer: noWallet, fetchImpl: offline }),
        steem: composeSteemRuntime({ fetchImpl: offline }).contentStore,
        blurt: composeBlurtRuntime({ fetchImpl: offline }).contentStore,
        ipfs: new IpfsContentStore({ apiUrl: 'http://127.0.0.1:5001' })
    };
    for (const store of Object.values(stores)) registry.register(store);
    for (const [substrate, store] of Object.entries(stores)) {
        assert(store instanceof ContentStore && store.storage === STORAGE[substrate], `${substrate}'s store is a ContentStore for "${STORAGE[substrate]}"`);
        assert(registry.get(STORAGE[substrate]) === store, `the placement registry resolves "${STORAGE[substrate]}" to ${substrate}'s store`);
        matrix[substrate].add(RoleProviderRole.CONTENT);
    }
    // IPFS reads without a node, through public gateways, under the same key.
    assert(new IpfsGatewayFailoverContentStore({ gatewayUrls: ['https://ipfs.invalid', 'https://dweb.invalid'] }).storage === 'ipfs', 'the IPFS gateway store resolves the same placements');
    console.log('✓ Content, from the placement store registry');
}

// Announcement & Discovery: what each substrate's publisher announces, its
// query service finds.
{
    const relay = fakeNostrRelay();
    const nostr = await roundTrip(
        new NostrSnapshotDiscoveryPublisher({ discoveryTag: TAG, publishImpl: relay.publishImpl }),
        new NostrSnapshotDiscoveryQueryService({ queryImpl: relay.queryImpl }),
        'fnv1a-32:0000aaaa'
    );
    const gateway = fakeArweaveGateway();
    const arweave = await roundTrip(
        new ArweaveSnapshotDiscoveryPublisher({ discoveryTag: TAG, uploadTaggedTransaction: gateway.uploadTaggedTransaction }),
        new ArweaveSnapshotDiscoveryQueryService({ fetchImpl: gateway.fetchImpl }),
        'fnv1a-32:0000bbbb'
    );
    const steemNode = fakeSteem();
    const steemRuntime = composeSteemRuntime({
        configuration: new SteemReadingConfiguration({ apiNodes: ['https://steem.invalid'] }),
        fetchImpl: steemNode.fetchImpl,
        getAccount: () => 'alice',
        getBroadcaster: () => steemNode.broadcaster
    });
    const steem = await roundTrip(steemRuntime.snapshotDiscoveryPublisher, steemRuntime.snapshotDiscoveryQueryService, 'fnv1a-32:0000cccc');
    const blurtChain = fakeBlurtChain({ nexus: true });
    const blurtRuntime = composeBlurtRuntime({
        configuration: new BlurtReadingConfiguration({ apiNodes: ['https://blurt.invalid'] }),
        fetchImpl: blurtChain.fetchImpl,
        getAccount: () => 'alice',
        getBroadcaster: () => blurtChain.broadcaster
    });
    const blurt = await roundTrip(blurtRuntime.snapshotDiscoveryPublisher, blurtRuntime.snapshotDiscoveryQueryService, 'fnv1a-32:0000dddd');
    for (const [substrate, found] of Object.entries({ nostr, arweave, steem, blurt })) {
        assert(found, `${substrate}: an announced Snapshot is found again`);
        matrix[substrate].add(RoleProviderRole.ANNOUNCEMENT_AND_DISCOVERY);
    }
    console.log('✓ Announcement & Discovery, by publishing and finding on each substrate');
}

// The matrix itself.
{
    const D = RoleProviderRole.ANNOUNCEMENT_AND_DISCOVERY;
    const C = RoleProviderRole.CONTENT;
    const P = RoleProviderRole.PROOF_AND_ANCHORING;
    const expected = {
        arweave: [D, C, P],
        steem: [D, C, P],
        blurt: [D, C, P],
        nostr: [D],
        ipfs: [C],
        bitcoin: [P],
        base: [P]
    };
    for (const substrate of SUBSTRATES) {
        const got = [D, C, P].filter((role) => matrix[substrate].has(role));
        assert(got.join() === expected[substrate].join(), `${substrate} serves ${expected[substrate].join(', ')} (got ${got.join(', ') || 'nothing'})`);
    }
    for (const role of [D, C, P]) {
        const providers = SUBSTRATES.filter((substrate) => matrix[substrate].has(role));
        assert(providers.length >= 3, `${role} has at least three independent substrates (got ${providers.join(', ')})`);
    }
    console.log('✓ the substrate/role matrix');
}
