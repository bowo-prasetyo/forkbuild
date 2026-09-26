// The Publications page's Steem anchoring behavior, through its real
// composables (with the test Vue shim): a created anchor is watched until
// final, a verification shows the block's time, and several publications
// are anchored with one approval.
import { reactive } from 'vue';
import { useAnchorEvidence } from '../ui/views/decentralizedPublications/useAnchorEvidence.js';
import { useBatchAnchoring } from '../ui/views/decentralizedPublications/useBatchAnchoring.js';
import { composeSteemRuntime } from '../application/steem/SteemRuntimeComposition.js';
import { SteemAnchorFinalityObserver } from '../anchoring/SteemAnchorFinalityObserver.js';
import { createSteemRpcClient } from '../steem/SteemRpcClient.js';
import { DecentralizedPublication } from '../core/DecentralizedPublication.js';
import { ContentReference } from '../core/ContentReference.js';
import { LocalPublicationCatalog } from '../application/publication/LocalPublicationCatalog.js';
import { LocalPublicationAnchorCatalog } from '../application/anchoring/LocalPublicationAnchorCatalog.js';
import { CreateExternalPublicationAnchorOrchestratorUseCase } from '../application/anchoring/CreateExternalPublicationAnchorOrchestratorUseCase.js';
import { PublicationAnchorCreationCoordinator } from '../application/anchoring/PublicationAnchorCreationCoordinator.js';
import { ExternalAnchorEvidenceViewRegistry } from '../application/anchoring/ExternalAnchorEvidenceViewRegistry.js';
import { ExternalAnchorVerifier } from '../application/anchoring/ExternalAnchorVerifier.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { makeIdentity } from './support/TestIdentity.js';
import { fakeSteemChain } from './support/FakeSteemChain.js';
import { assert } from './support/Assert.js';

const HASHES = ['fnv1a-32:0000000a', 'fnv1a-32:0000000b', 'fnv1a-32:0000000c'];

function setUp() {
    const chain = fakeSteemChain();
    const runtime = composeSteemRuntime({ fetchImpl: chain.fetchImpl, getAccount: () => 'alice', getBroadcaster: () => chain.broadcaster });
    const publicationCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
    const anchorCatalog = new LocalPublicationAnchorCatalog(new InMemoryStorageProvider());
    const { createExternalPublicationAnchorUseCase, publisherRegistry } = new CreateExternalPublicationAnchorOrchestratorUseCase().execute({
        publicationCatalog, anchorCatalog, identityProvider: makeIdentity('Alice'), publishers: [runtime.anchorPublisher]
    });
    const creationCoordinator = new PublicationAnchorCreationCoordinator(createExternalPublicationAnchorUseCase, publisherRegistry);
    const evidenceViewRegistry = new ExternalAnchorEvidenceViewRegistry();
    evidenceViewRegistry.register(runtime.anchorEvidenceView);
    // Each sleep lets the chain move on a few blocks.
    const observer = new SteemAnchorFinalityObserver({
        rpc: createSteemRpcClient({ nodes: ['https://a'], fetchImpl: chain.fetchImpl }),
        sleep: async () => { chain.head += 7; }
    });
    const finalityObservers = new Map([['steem', observer]]);
    const verifier = new ExternalAnchorVerifier(new LocalAuthorizationVerifier());
    const evidenceCoordinator = {
        discover: (publicationId) => anchorCatalog.findByPublicationId ? anchorCatalog.findByPublicationId(publicationId) : [],
        verify: (anchor, options) => verifier.verify(anchor.toJSON(), { ...options, proofVerifier: runtime.proofVerifier })
    };
    const entries = reactive(HASHES.map((hash, i) => {
        const publication = new DecentralizedPublication({ id: `pub-${i}`, contentKind: 'forkbuild.structure', contentReference: new ContentReference({ hash }) });
        publicationCatalog.add(publication);
        return {
            publication, evidenceAnchors: [], evidence: null, evidenceExpanded: false, verifications: {},
            verificationHistory: {}, inspections: {}, creationAttempts: {}, preferredAnchorCreationAttempt: null
        };
    }));
    const loaded = [];
    const loadEvidence = (entry) => {
        loaded.push(entry.publication.id);
        entry.evidenceAnchors = anchorCatalog.list().filter((anchor) => anchor.publicationId === entry.publication.id);
    };
    const evidence = useAnchorEvidence({
        anchorKnowledgeStore: null, creationCoordinator, evidenceCoordinator, evidenceDiscoveryCoordinator: null,
        evidenceViewRegistry, knowledgeSynchronizationCoordinator: null, loadEvidence, loadPlacements: () => {},
        preferredAnchorCreationCoordinator: null, recomputeConvergence: () => {}, recomputeReplicaKnowledgeDetail: () => {},
        finalityObservers
    });
    const batch = useBatchAnchoring({
        creationCoordinator, entries, loadEvidence, watchFinality: evidence.watchFinality, describeFinality: evidence.describeFinality
    });
    return { chain, entries, evidence, batch, anchorCatalog, loaded };
}

async function settle() {
    for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setImmediate(resolve));
}

// Creating one anchor: "Anchor created", then watched until "Anchored".
{
    const { chain, entries, evidence } = setUp();
    const [entry] = entries;
    await evidence.createAnchor(entry, 'steem');
    assert(evidence.creationView(entry, 'steem').label === 'Anchor created', 'the anchor is created');
    const pending = evidence.creationFinality(entry, 'steem');
    assert(pending && ['Waiting for finality', 'Anchored'].includes(pending.label), 'and its finality is being watched');
    await settle();
    const final = evidence.creationFinality(entry, 'steem');
    assert(final.label === 'Anchored' && final.message.includes(`block ${entry.creationAttempts.steem.anchor.proof.blockNum}`), 'once the block is final, the card says Anchored');
    assert(chain.broadcasts.length === 1, 'one broadcast');
    console.log('✓ a created Steem anchor is reported as anchored once final');
}

// Verifying shows when and by whom the block was recorded.
{
    const { chain, entries, evidence } = setUp();
    const [entry] = entries;
    await evidence.createAnchor(entry, 'steem');
    await settle();
    chain.finalize();
    const anchor = entry.creationAttempts.steem.anchor;
    entry.evidenceAnchors = [anchor];
    const anchorView = { anchorId: anchor.id, anchorType: 'steem' };
    await evidence.verifyAnchor(entry, anchorView);
    const note = evidence.verificationNote(entry, anchorView);
    const block = chain.blocks.get(anchor.proof.blockNum);
    assert(note && note.includes(`Recorded in Steem block ${anchor.proof.blockNum} at ${block.timestamp.replace('T', ' ')} UTC by witness witness-one`), 'the verification note gives the block time and witness');
    assert(note.includes('kept block evidence checks out offline'), 'and the kept evidence');
    console.log('✓ a verification shows the block time');
}

// Batch: pick publications, one approval, an anchor for each, then final.
{
    const { chain, entries, batch, loaded } = setUp();
    assert(batch.batchAnchorTypes.length === 1 && batch.batchAnchorTypes[0].anchorType === 'steem', 'Steem is offered for batches');
    assert(batch.batchButtonDisabled('steem') && batch.batchButtonLabel('steem') === 'Anchor 0 Publications on Steem', 'nothing picked, nothing to do');
    batch.selectUnanchoredForBatch('steem');
    assert(batch.batchSelectedIds('steem').length === 3 && batch.batchButtonLabel('steem') === 'Anchor 3 Publications on Steem', 'every unanchored publication is picked');
    batch.batchAnchoring.steem.selected['pub-2'] = false;
    await batch.createBatchAnchors('steem');
    assert(chain.broadcasts.length === 1, 'one broadcast for the batch');
    const view = batch.batchCreationView('steem');
    assert(view.label === 'Anchor created' && view.message.startsWith('2 publications anchored with one Steem transaction'), 'the batch reports its anchors');
    assert(loaded.join() === 'pub-0,pub-1' && entries[0].evidenceAnchors.length === 1 && entries[2].evidenceAnchors.length === 0, 'each picked publication gets its own anchor');
    assert(batch.batchSelectedIds('steem').length === 0, 'the selection is cleared');
    await settle();
    assert(batch.batchFinality('steem').label === 'Anchored', 'and the shared block is watched until final');

    batch.selectUnanchoredForBatch('steem');
    assert(batch.batchSelectedIds('steem').join() === 'pub-2', 'afterwards only the unanchored one is picked');
    console.log('✓ several publications anchored with one approval');
}

// A declined batch reports why, and anchors nothing.
{
    const { chain, entries, batch } = setUp();
    chain.broadcaster.broadcast = async () => { throw new Error('user_cancel'); };
    batch.selectUnanchoredForBatch('steem');
    await batch.createBatchAnchors('steem');
    const view = batch.batchCreationView('steem');
    assert(view.label === 'No anchor was created' && view.reason === 'user_cancel', 'a declined batch says so');
    assert(entries.every((entry) => entry.evidenceAnchors.length === 0) && batch.batchFinality('steem') === null, 'nothing was anchored or watched');
    console.log('✓ a declined batch');
}
