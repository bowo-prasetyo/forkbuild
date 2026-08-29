import { PublicationReferenceRecord } from '../application/PublicationReferenceRecord.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { CreatePublicationReferenceRecordUseCase } from '../application/CreatePublicationReferenceRecordUseCase.js';
import { CreateBitcoinAnchorPublicationRecordUseCase } from '../application/CreateBitcoinAnchorPublicationRecordUseCase.js';
import { CreateBaseAnchorPublicationRecordUseCase } from '../application/CreateBaseAnchorPublicationRecordUseCase.js';
import { BlockchainKind } from '../application/BlockchainKind.js';
import { BlockchainPublicationIdentity } from '../application/BlockchainPublicationIdentity.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalStoragePublicationObservationArchive } from '../storage/LocalStoragePublicationObservationArchive.js';
import {
    describePublicationReferenceGraph,
    reconstructPublicationReferenceGraph,
    findPublicationReferenceGraphNode
} from '../application/PublicationReferenceGraphView.js';

// 0.8.105 — Publication Reference Graph Projection.
//
// Section A: an empty/malformed input projects to an empty graph
// Section B: a single reference edge produces a two-node graph — one
//            outgoing-only node, one incoming-only node
// Section C: FLAGSHIP — Bob references Alice three times, Carol once;
//            edges stay four independent entries, never collapsed, and
//            Bob's own outgoingReferences carries all three
// Section D: a publication that is both a source and a referenced target
//            elsewhere is ONE node, carrying both directions
// Section E: distinctSourcePublicationCount/distinctReferencedPublicationCount
//            are graph-shape facts, kept separate from edgeCount
// Section F: node identity is blockchain + chainReference, never
//            contentHash — the cross-chain shared-contentHash proof
// Section G: findPublicationReferenceGraphNode — sameAs() lookup, null
//            for an untouched identity or malformed input
// Section H: reconstructPublicationReferenceGraph() over a real,
//            persisted archive — reload equivalence, zero network access
// Section I: determinism, node ordering by first appearance, and no
//            verdict/score/weight/rank vocabulary anywhere in the graph

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const FORBIDDEN_KEYS = [
    'status', 'confidence', 'health', 'trusted', 'valid', 'canonical', 'reliable',
    'risk', 'severity', 'cause', 'verdict', 'score', 'weight', 'strength', 'popularity',
    'influence', 'included', 'confirmed', 'safe', 'healthy', 'rank', 'points', 'level', 'tier'
];
function assertNeverScored(obj, path) {
    if (!obj || typeof obj !== 'object') return;
    for (const [key, value] of Object.entries(obj)) {
        const lower = key.toLowerCase();
        assert(!FORBIDDEN_KEYS.includes(lower), `${path}.${key} must never exist — a reference graph is inspectable, it does not score its own nodes or edges`);
        if (value && typeof value === 'object' && !(value instanceof Date)) {
            if (Array.isArray(value)) value.forEach((item, i) => assertNeverScored(item, `${path}.${key}[${i}]`));
            else assertNeverScored(value, `${path}.${key}`);
        }
    }
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function identity({ blockchain, contentHash, chainReference, createdAt }) {
    return new BlockchainPublicationIdentity({ blockchain, contentHash, chainReference, createdAt });
}

const CONTENT_HASH_ALICE = 'a'.repeat(64);
const CONTENT_HASH_BOB = 'b'.repeat(64);
const CONTENT_HASH_CAROL = 'c'.repeat(64);
const BITCOIN_TXID_ALICE = '1'.repeat(64);
const BASE_TXID_BOB = '0x' + '2'.repeat(64);
const BITCOIN_TXID_CAROL = '3'.repeat(64);
const NETWORK = 'mainnet';

async function run() {
    // ---------------------------------------------------------------
    // Section A — an empty/malformed input projects to an empty graph.
    // ---------------------------------------------------------------
    {
        const empty = describePublicationReferenceGraph([]);
        assert(empty.edgeCount === 0, '1. an empty record list projects to zero edges');
        assert(empty.edges.length === 0, '2. an empty record list projects to an empty edges array');
        assert(empty.distinctSourcePublicationCount === 0, '3. distinctSourcePublicationCount is zero for an empty graph');
        assert(empty.distinctReferencedPublicationCount === 0, '4. distinctReferencedPublicationCount is zero for an empty graph');
        assert(empty.nodes.length === 0, '5. an empty record list projects to zero nodes');

        const fromNull = describePublicationReferenceGraph(null);
        assert(fromNull.edgeCount === 0 && fromNull.nodes.length === 0, '6. a null input degrades to an empty graph rather than throwing');

        const fromDefault = describePublicationReferenceGraph();
        assert(fromDefault.edgeCount === 0, '7. calling with no argument at all degrades to an empty graph');
    }
    console.log('✓ Section A: empty/malformed input projects to an empty graph');

    // ---------------------------------------------------------------
    // Section B — a single reference edge produces a two-node graph.
    // ---------------------------------------------------------------
    {
        const createdAt = new Date('2026-08-20T00:00:00Z');
        const source = identity({ blockchain: BlockchainKind.BASE, contentHash: CONTENT_HASH_BOB, chainReference: BASE_TXID_BOB, createdAt });
        const referenced = identity({ blockchain: BlockchainKind.BITCOIN, contentHash: CONTENT_HASH_ALICE, chainReference: BITCOIN_TXID_ALICE, createdAt });
        const record = new PublicationReferenceRecord({ sourcePublicationIdentity: source, referencedPublicationIdentity: referenced, createdAt });

        const graph = describePublicationReferenceGraph([record]);
        assert(graph.edgeCount === 1, '8. one record projects to one edge');
        assert(graph.edges[0].sourcePublicationIdentity === source, '9. the edge carries the exact sourcePublicationIdentity instance');
        assert(graph.edges[0].referencedPublicationIdentity === referenced, '10. the edge carries the exact referencedPublicationIdentity instance');
        assert(graph.edges[0].createdAt.getTime() === createdAt.getTime(), '11. the edge carries createdAt unchanged');
        assert(graph.nodes.length === 2, '12. one edge between two distinct publications produces exactly two nodes');

        const sourceNode = findPublicationReferenceGraphNode(graph, source);
        assert(sourceNode.outgoingReferenceCount === 1 && sourceNode.incomingReferenceCount === 0, '13. the source node has one outgoing reference and zero incoming');
        assert(sourceNode.outgoingReferences[0] === graph.edges[0], '14. the source node\'s own outgoingReferences carries the exact same edge object');

        const referencedNode = findPublicationReferenceGraphNode(graph, referenced);
        assert(referencedNode.incomingReferenceCount === 1 && referencedNode.outgoingReferenceCount === 0, '15. the referenced node has one incoming reference and zero outgoing');
        assert(referencedNode.incomingReferences[0] === graph.edges[0], '16. the referenced node\'s own incomingReferences carries the exact same edge object');
    }
    console.log('✓ Section B: a single reference edge produces a two-node graph');

    // ---------------------------------------------------------------
    // Section C — FLAGSHIP: Bob references Alice three times, Carol
    // references Alice once — four independent edges, never collapsed.
    // ---------------------------------------------------------------
    let bobIdentity, aliceIdentity, carolIdentity, flagshipGraph;
    {
        const referenceUseCase = new CreatePublicationReferenceRecordUseCase();
        const bitcoinUseCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        const baseUseCase = new CreateBaseAnchorPublicationRecordUseCase();

        let archive = PublicationObservationArchive.empty();
        archive = bitcoinUseCase.execute(archive, { anchorId: 'anchor-alice', contentHash: CONTENT_HASH_ALICE, txid: BITCOIN_TXID_ALICE, network: NETWORK, createdAt: new Date('2026-08-10T00:00:00Z') });
        archive = baseUseCase.execute(archive, { contentHash: CONTENT_HASH_BOB, txid: BASE_TXID_BOB, network: NETWORK, createdAt: new Date('2026-08-11T00:00:00Z') });
        archive = bitcoinUseCase.execute(archive, { anchorId: 'anchor-carol', contentHash: CONTENT_HASH_CAROL, txid: BITCOIN_TXID_CAROL, network: NETWORK, createdAt: new Date('2026-08-12T00:00:00Z') });

        aliceIdentity = archive.bitcoinAnchorPublicationRecords.find((r) => r.anchorId === 'anchor-alice').toBlockchainPublicationIdentity();
        bobIdentity = archive.baseAnchorPublicationRecords[0].toBlockchainPublicationIdentity();
        carolIdentity = archive.bitcoinAnchorPublicationRecords.find((r) => r.anchorId === 'anchor-carol').toBlockchainPublicationIdentity();

        archive = referenceUseCase.execute(archive, { sourcePublicationIdentity: bobIdentity, referencedPublicationIdentity: aliceIdentity, createdAt: new Date('2026-08-13T00:00:00Z') });
        archive = referenceUseCase.execute(archive, { sourcePublicationIdentity: bobIdentity, referencedPublicationIdentity: aliceIdentity, createdAt: new Date('2026-08-13T01:00:00Z') });
        archive = referenceUseCase.execute(archive, { sourcePublicationIdentity: bobIdentity, referencedPublicationIdentity: aliceIdentity, createdAt: new Date('2026-08-13T02:00:00Z') });
        archive = referenceUseCase.execute(archive, { sourcePublicationIdentity: carolIdentity, referencedPublicationIdentity: aliceIdentity, createdAt: new Date('2026-08-14T00:00:00Z') });

        flagshipGraph = describePublicationReferenceGraph(archive.publicationReferenceRecords);
        assert(flagshipGraph.edgeCount === 4, '17. FOUR independent edges exist — three from Bob, one from Carol — never collapsed into one');

        const bobNode = findPublicationReferenceGraphNode(flagshipGraph, bobIdentity);
        assert(bobNode.outgoingReferenceCount === 3, '18. Bob\'s own node shows THREE outgoing references, never collapsed to one');
        assert(bobNode.incomingReferenceCount === 0, '19. Bob\'s own node has zero incoming references');

        const carolNode = findPublicationReferenceGraphNode(flagshipGraph, carolIdentity);
        assert(carolNode.outgoingReferenceCount === 1, '20. Carol\'s own node shows exactly one outgoing reference');

        const aliceNode = findPublicationReferenceGraphNode(flagshipGraph, aliceIdentity);
        assert(aliceNode.incomingReferenceCount === 4, '21. Alice\'s own node shows all FOUR incoming references — three from Bob, one from Carol');
        assert(aliceNode.incomingReferences.filter((e) => e.sourcePublicationIdentity.sameAs(bobIdentity)).length === 3, '22. three of Alice\'s incoming references are attributed to Bob');
        assert(aliceNode.incomingReferences.filter((e) => e.sourcePublicationIdentity.sameAs(carolIdentity)).length === 1, '23. one of Alice\'s incoming references is attributed to Carol');
    }
    console.log('✓ Section C: FLAGSHIP — Bob\'s three references and Carol\'s one stay four independent edges, correctly attributed');

    // ---------------------------------------------------------------
    // Section D — a publication that is both a source and a referenced
    // target elsewhere is ONE node, carrying both directions.
    // ---------------------------------------------------------------
    {
        // Carol references Bob's publication too — Bob is now BOTH a
        // source (of his three references to Alice) AND a referenced
        // target (of Carol's new reference to him).
        const referenceUseCase = new CreatePublicationReferenceRecordUseCase();
        let archive = PublicationObservationArchive.empty();
        const recordBobToAlice = new PublicationReferenceRecord({ sourcePublicationIdentity: bobIdentity, referencedPublicationIdentity: aliceIdentity, createdAt: new Date('2026-08-13T00:00:00Z') });
        const recordCarolToBob = new PublicationReferenceRecord({ sourcePublicationIdentity: carolIdentity, referencedPublicationIdentity: bobIdentity, createdAt: new Date('2026-08-15T00:00:00Z') });

        const graph = describePublicationReferenceGraph([recordBobToAlice, recordCarolToBob]);
        assert(graph.nodes.length === 3, '24. three distinct publications appear across the two edges — Bob, Alice, Carol');

        const bobNode = findPublicationReferenceGraphNode(graph, bobIdentity);
        assert(bobNode.outgoingReferenceCount === 1, '25. Bob\'s node still shows his own outgoing reference to Alice');
        assert(bobNode.incomingReferenceCount === 1, '26. the SAME node also shows Carol\'s incoming reference to him — never split into two nodes');
        assert(bobNode.incomingReferences[0].sourcePublicationIdentity.sameAs(carolIdentity), '27. Bob\'s incoming reference is correctly attributed to Carol');
        void archive;
    }
    console.log('✓ Section D: a publication that is both a source and a referenced target elsewhere stays one node, both directions intact');

    // ---------------------------------------------------------------
    // Section E — distinctSourcePublicationCount/distinctReferencedPublicationCount
    // are graph-shape facts, kept separate from edgeCount.
    // ---------------------------------------------------------------
    {
        assert(flagshipGraph.distinctSourcePublicationCount === 2, '28. exactly two distinct publications ever appear as a source — Bob and Carol — even though four edges exist');
        assert(flagshipGraph.distinctReferencedPublicationCount === 1, '29. exactly one distinct publication is ever referenced — Alice');
        assert(flagshipGraph.edgeCount === 4, '30. edgeCount stays the flat total of four — never collapsed to match either distinct count');
    }
    console.log('✓ Section E: distinct source/referenced publication counts stay graph-shape facts, separate from the flat edge count');

    // ---------------------------------------------------------------
    // Section F — node identity is blockchain + chainReference, never
    // contentHash — the cross-chain shared-contentHash proof.
    // ---------------------------------------------------------------
    {
        const createdAt = new Date('2026-08-16T00:00:00Z');
        const SHARED_RAW_REFERENCE = 'f'.repeat(64);
        const SHARED_CONTENT_HASH = 'e'.repeat(64);

        const bitcoinShared = identity({ blockchain: BlockchainKind.BITCOIN, contentHash: SHARED_CONTENT_HASH, chainReference: SHARED_RAW_REFERENCE, createdAt });
        const baseShared = identity({ blockchain: BlockchainKind.BASE, contentHash: SHARED_CONTENT_HASH, chainReference: SHARED_RAW_REFERENCE, createdAt });
        const source = identity({ blockchain: BlockchainKind.BITCOIN, contentHash: 'd'.repeat(64), chainReference: '4'.repeat(64), createdAt });

        assert(bitcoinShared.sameAs(baseShared) === false, '31. sanity check — the two identities never compare equal across chains');

        const recordToBitcoin = new PublicationReferenceRecord({ sourcePublicationIdentity: source, referencedPublicationIdentity: bitcoinShared, createdAt });
        const recordToBase = new PublicationReferenceRecord({ sourcePublicationIdentity: source, referencedPublicationIdentity: baseShared, createdAt });

        const graph = describePublicationReferenceGraph([recordToBitcoin, recordToBase]);
        assert(graph.edgeCount === 2, '32. referencing two identities that share a contentHash and raw chainReference across chains stays two independent edges');
        assert(graph.nodes.length === 3, '33. the Bitcoin and Base identities are TWO SEPARATE NODES despite sharing contentHash and chainReference — source, bitcoinShared, baseShared');

        const bitcoinNode = findPublicationReferenceGraphNode(graph, bitcoinShared);
        const baseNode = findPublicationReferenceGraphNode(graph, baseShared);
        assert(bitcoinNode.incomingReferenceCount === 1 && baseNode.incomingReferenceCount === 1, '34. each of the two chain-distinct nodes carries exactly its own one incoming reference, never merged into the other\'s count');
    }
    console.log('✓ Section F: node identity is blockchain + chainReference — never contentHash, even across chains that share both a contentHash and a raw chainReference');

    // ---------------------------------------------------------------
    // Section G — findPublicationReferenceGraphNode: sameAs() lookup,
    // null for an untouched identity or malformed input.
    // ---------------------------------------------------------------
    {
        const createdAt = new Date('2026-08-17T00:00:00Z');
        const untouched = identity({ blockchain: BlockchainKind.BASE, contentHash: 'never'.padEnd(64, '0'), chainReference: '9'.repeat(64), createdAt });
        assert(findPublicationReferenceGraphNode(flagshipGraph, untouched) === null, '35. looking up a publication no edge in this graph touches returns null, never a guess');
        assert(findPublicationReferenceGraphNode(flagshipGraph, null) === null, '36. looking up a non-identity returns null rather than throwing');
        assert(findPublicationReferenceGraphNode(null, aliceIdentity) === null, '37. looking up against a null/malformed graph returns null rather than throwing');
        assert(findPublicationReferenceGraphNode({}, aliceIdentity) === null, '38. looking up against an object with no nodes array returns null rather than throwing');
    }
    console.log('✓ Section G: findPublicationReferenceGraphNode looks up by sameAs() alone, never guessing at an untouched or malformed identity');

    // ---------------------------------------------------------------
    // Section H — reconstructPublicationReferenceGraph() over a real,
    // persisted archive — reload equivalence, zero network access.
    // ---------------------------------------------------------------
    {
        const referenceUseCase = new CreatePublicationReferenceRecordUseCase();
        const bitcoinUseCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        const baseUseCase = new CreateBaseAnchorPublicationRecordUseCase();

        let archive = PublicationObservationArchive.empty();
        archive = bitcoinUseCase.execute(archive, { anchorId: 'anchor-h-alice', contentHash: CONTENT_HASH_ALICE, txid: '5'.repeat(64), network: NETWORK, createdAt: new Date('2026-08-18T00:00:00Z') });
        archive = baseUseCase.execute(archive, { contentHash: CONTENT_HASH_BOB, txid: '0x' + '6'.repeat(64), network: NETWORK, createdAt: new Date('2026-08-18T01:00:00Z') });
        const hAliceIdentity = archive.bitcoinAnchorPublicationRecords.find((r) => r.anchorId === 'anchor-h-alice').toBlockchainPublicationIdentity();
        const hBobIdentity = archive.baseAnchorPublicationRecords[0].toBlockchainPublicationIdentity();
        archive = referenceUseCase.execute(archive, { sourcePublicationIdentity: hBobIdentity, referencedPublicationIdentity: hAliceIdentity, createdAt: new Date('2026-08-18T02:00:00Z') });

        assert(reconstructPublicationReferenceGraph(null).edgeCount === 0, '39. reconstructing from a non-archive input degrades to an empty graph rather than throwing');
        assert(reconstructPublicationReferenceGraph(PublicationObservationArchive.empty()).edgeCount === 0, '40. reconstructing from a genuinely empty archive produces an empty graph');

        const liveGraph = reconstructPublicationReferenceGraph(archive);
        assert(liveGraph.edgeCount === 1, '41. reconstructPublicationReferenceGraph() reads the archive\'s own publicationReferenceRecords');

        const storageProvider = new InMemoryStorageProvider();
        const persistence = new LocalStoragePublicationObservationArchive(storageProvider);
        persistence.save(archive);

        let networkCallOccurred = false;
        const originalFetch = globalThis.fetch;
        globalThis.fetch = (...args) => { networkCallOccurred = true; return originalFetch ? originalFetch(...args) : Promise.reject(new Error('no fetch in this environment')); };
        let restored;
        try {
            restored = persistence.load();
        } finally {
            globalThis.fetch = originalFetch;
        }
        assert(!networkCallOccurred, '42. reconstructing the graph after reload performs no network access of its own');

        const restoredGraph = reconstructPublicationReferenceGraph(restored);
        assert(restoredGraph.edgeCount === 1, '43. the reconstructed graph survives a real save/load round trip');
        assert(JSON.stringify(restoredGraph) === JSON.stringify(liveGraph), '44. the reloaded graph is byte-identical to the graph computed before persistence');

        const restoredBobNode = findPublicationReferenceGraphNode(restoredGraph, hBobIdentity);
        assert(restoredBobNode.outgoingReferenceCount === 1, '45. node grouping still resolves correctly by sameAs() after a real reload');
    }
    console.log('✓ Section H: reconstructPublicationReferenceGraph() over a real, persisted archive — reload equivalence, zero network access');

    // ---------------------------------------------------------------
    // Section I — determinism, node ordering by first appearance, and no
    // verdict/score/weight/rank vocabulary anywhere in the graph.
    // ---------------------------------------------------------------
    {
        const again = describePublicationReferenceGraph(
            [
                new PublicationReferenceRecord({ sourcePublicationIdentity: bobIdentity, referencedPublicationIdentity: aliceIdentity, createdAt: new Date('2026-08-13T00:00:00Z') }),
                new PublicationReferenceRecord({ sourcePublicationIdentity: bobIdentity, referencedPublicationIdentity: aliceIdentity, createdAt: new Date('2026-08-13T01:00:00Z') }),
                new PublicationReferenceRecord({ sourcePublicationIdentity: bobIdentity, referencedPublicationIdentity: aliceIdentity, createdAt: new Date('2026-08-13T02:00:00Z') }),
                new PublicationReferenceRecord({ sourcePublicationIdentity: carolIdentity, referencedPublicationIdentity: aliceIdentity, createdAt: new Date('2026-08-14T00:00:00Z') })
            ]
        );
        assert(JSON.stringify(again) === JSON.stringify(flagshipGraph), '46. calling describePublicationReferenceGraph() twice with byte-identical input returns a byte-identical result');

        // Node order follows first appearance while walking edges oldest
        // first — never sorted by reference count (which would rank
        // Alice, the most-referenced node, first).
        assert(flagshipGraph.nodes[0].identity.sameAs(bobIdentity), '47. Bob\'s node appears first — he is the source of the first edge in oldest-first order');
        assert(flagshipGraph.nodes[1].identity.sameAs(aliceIdentity), '48. Alice\'s node appears second — first seen as the referenced side of that same first edge');
        assert(flagshipGraph.nodes[2].identity.sameAs(carolIdentity), '49. Carol\'s node appears last — first seen only on the fourth edge, despite Alice holding the most incoming references');

        assertNeverScored(flagshipGraph, 'flagshipGraph');
        assertNeverScored(describePublicationReferenceGraph([]), 'emptyGraph');
    }
    console.log('✓ Section I: describePublicationReferenceGraph() is deterministic, orders nodes by first appearance rather than by reference count, and carries no verdict vocabulary');

    console.log('\nAll PublicationReferenceGraphView tests passed.');
}

run().catch((error) => {
    console.error('PublicationReferenceGraphView.test.js FAILED:', error);
    process.exitCode = 1;
});
