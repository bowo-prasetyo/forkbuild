import { readFile } from 'node:fs/promises';

import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalContentResolver } from '../discovery/LocalContentResolver.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { computeContentHash } from '../serializer/contentHash.js';

import { executePublicationDistribution } from '../application/PublicationDistributionExecutor.js';
import { composePublicationDistributionRuntime } from '../application/PublicationDistributionRuntimeComposition.js';

import { IpfsContentStore } from '../content/IpfsContentStore.js';
import { LocalPublicationSnapshotPlacementCatalog } from '../application/LocalPublicationSnapshotPlacementCatalog.js';
import { CreateSnapshotPlacementOrchestratorUseCase } from '../application/CreateSnapshotPlacementOrchestratorUseCase.js';
import { SnapshotPlacementCreationOutcome } from '../application/SnapshotPlacementCreationOutcome.js';
import { SnapshotPlacementResolutionOutcome } from '../application/SnapshotPlacementResolutionOutcome.js';
import { SnapshotPlacementStoreRegistry } from '../application/SnapshotPlacementStoreRegistry.js';
import { SnapshotPlacementResolver } from '../application/SnapshotPlacementResolver.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';

// 0.9.131 — Snapshot Distribution Boundary.
//
// 0.9.44 through 0.9.122 built and then closed an entire subsystem for
// distributing a SIGNED CLAIM — `publisher/Publication.js`'s own signed
// record — onto Arweave (its serialized bytes, `application/
// ArweavePublicationMaterialUploader.js`) and announcing it on Nostr
// (`application/NostrPublicationDiscoveryPublisher.js`), sequenced by
// `application/PublicationDistributionExecutor.js` into one
// `PublicationDistributionResult` whose own header already insists
// `material`/`discovery` stay two independent, independently-absent
// facts. Separately, and much earlier, 0.8.18 built an entire subsystem
// for distributing a SNAPSHOT — the actual World content a publication's
// own `contentReference.hash` names — as an additive, signed `core/
// PublicationSnapshotPlacement.js` locator, resolved independently by
// `application/SnapshotPlacementResolver.js` against whichever
// `content/ContentStore.js` a `application/
// SnapshotPlacementStoreRegistry.js` names for that placement's own
// `storage`.
//
// Nothing in this codebase has ever written down that these are two
// DIFFERENT distribution problems, deliberately kept apart, rather than
// one gap somebody eventually needs to unify. This is that boundary,
// named once and proven to already hold:
//
//   publisher/Publication.js  (signed once, immutable)
//        │
//        ├── SIGNED CLAIM distribution         SNAPSHOT distribution
//        │   (0.9.44-0.9.122)                   (0.8.18+)
//        │        │                                  │
//        │        ▼                                  ▼
//        │   material.uri                    PublicationSnapshotPlacement
//        │   (the claim's OWN                 .locator
//        │   serialized bytes,                (the CONTENT's bytes,
//        │   e.g. ar://TX...)                 e.g. ipfs://Qm...)
//        │        │                                  │
//        │        ▼                                  ▼
//        │   discovery announcement           storeRegistry.get(storage)
//        │   (Nostr — 0.9.46)                 (never Nostr — peer-based,
//        │                                     0.8.19)
//        │
//        └── contentReference.hash — the ONE fact both sides trace back
//            to, and the ONLY thing they share
//
// THE BOUNDARY CONTRACT — six statements, each verified directly below,
// either structurally (sweep the source of the file that owns the claim
// — the same technique `tests/PublicationDistributionDescriptor.test.js`'s
// own Section 8 already established) or behaviorally (drive both real
// pipelines and observe):
//
//   1. A claim's own distributed `material.uri` and a snapshot's own
//      `locator` are never the same value, and a placement's
//      `contentHash` traces to the publication's own `contentReference`,
//      never to anything the claim-distribution pipeline produced.
//   2. Distributing a Signed Claim never imports, constructs, or reads
//      anything from the Snapshot Placement family.
//   3. Placing or resolving a Snapshot never imports, constructs, or
//      reads anything from the Signed Claim distribution family.
//   4. Snapshot placement/resolution never imports or references Nostr —
//      a Snapshot's own discovery stays peer-based (0.8.19); placing one
//      is never itself a Nostr announcement.
//   5. No `ArweaveContentStore` exists anywhere in this codebase yet, and
//      a claim's own Arweave material upload is never reachable through
//      `SnapshotPlacementStoreRegistry` — the `ar://` scheme is used by
//      both families, but names two unconnected referents.
//   6. Both distributions are independently failable and independently
//      successful, in either direction, within one continuous scenario —
//      neither pipeline's outcome is affected by the other's failure.
//
// See docs/Roadmap.md, 0.9.131.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function makeIdentity(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    return provider;
}

function createTestDocument(title) {
    const world = new World();
    const building = new Building({ creator: 'tester' });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0), rotation: 0 }));
    world.addBuilding(building);
    return new Document({
        world,
        metadata: new DocumentMetadata({ title, author: 'tester' })
    });
}

function fakeCid(text) {
    return 'bafyFAKE' + computeContentHash(text);
}

// Mirrors tests/IpfsPublicationResolution.test.js's own makeFakeIpfsNode().
function makeFakeIpfsNode(network) {
    return async function fetchImpl(url, options) {
        const parsed = new URL(url);
        if (parsed.pathname === '/api/v0/add') {
            const blob = options.body.get('file');
            const text = await blob.text();
            const cid = fakeCid(text);
            network.set(cid, text);
            return new Response(JSON.stringify({ Hash: cid, Size: String(text.length) }), { status: 200 });
        }
        if (parsed.pathname === '/api/v0/cat') {
            const cid = parsed.searchParams.get('arg');
            if (!network.has(cid)) return new Response('not found', { status: 500 });
            return new Response(network.get(cid), { status: 200 });
        }
        return new Response('unknown route', { status: 404 });
    };
}

function publishLocally(title) {
    const storage = new InMemoryStorageProvider();
    const alice = makeIdentity('alice');
    const publisher = new LocalPublisherProvider(storage);
    const doc = createTestDocument(title);
    const publication = publisher.publish(doc, alice);
    const discoveryProvider = new LocalDiscoveryProvider(storage);
    const contentResolver = new LocalContentResolver(publisher);
    return { alice, publication, discoveryProvider, contentResolver };
}

function makeFakeSigner({ handler } = {}) {
    return { sign: async (material) => (handler ? handler(material) : { id: 'fake-tx-id', transaction: { data: material } }) };
}

function makeFakeRelay({ handler }) {
    const calls = [];
    return { calls, publishImpl: async (relayUrl, eventTemplate) => { calls.push({ relayUrl, eventTemplate }); return handler(relayUrl, eventTemplate); } };
}

// Distributes `publication`'s SIGNED CLAIM — never touches the snapshot
// family in any way. `transactionId`/`relayHandler` let each call
// produce an independent success or failure.
async function distributeClaim(publication, { transactionId, relayHandler }) {
    const relay = makeFakeRelay({ handler: relayHandler });
    const runtime = composePublicationDistributionRuntime({
        arweaveUploaderOptions: {
            signer: makeFakeSigner({ handler: () => ({ id: transactionId || 'FailedGatewayPlaceholderTx000000000001', transaction: { placeholder: true } }) }),
            fetchImpl: async () => (transactionId ? new Response('accepted', { status: 200 }) : new Response('gateway down', { status: 500 }))
        },
        nostrPublisherOptions: {
            relayUrl: 'wss://relay.example',
            discoveryTag: 'forkbuild-publication',
            publishImpl: relay.publishImpl
        }
    });
    const result = await executePublicationDistribution({
        publication,
        serializedMaterial: JSON.stringify(publication.toJSON()),
        materialUploader: runtime.uploader,
        distributionDescriptor: runtime.describeDistribution,
        discoveryPublisher: runtime.publisher
    });
    return { result, relay };
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function codeOnlySource(relativePath) {
    const text = await readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
    return text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

async function fileExists(relativePath) {
    try {
        await readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
        return true;
    } catch (error) {
        if (error.code === 'ENOENT') return false;
        throw error;
    }
}

const CLAIM_DISTRIBUTION_FILES = [
    'application/PublicationDistributionDescriptor.js',
    'application/PublicationDistributionExecutor.js',
    'application/PublicationDistributionResult.js',
    'application/PublicationDistributionOrchestrator.js',
    'application/PublicationDistributionRuntimeComposition.js',
    'application/PublicationDistributionCommand.js',
    'application/ArweavePublicationMaterialUploader.js',
    'application/NostrPublicationDiscoveryPublisher.js'
];

const SNAPSHOT_PLACEMENT_FILES = [
    'core/PublicationSnapshotPlacement.js',
    'application/CreatePublicationSnapshotPlacementUseCase.js',
    'application/CreateExternalSnapshotPlacementUseCase.js',
    'application/SnapshotPlacementResolver.js',
    'application/SnapshotPlacementStoreRegistry.js',
    'application/PublicationSnapshotPlacementDiscoveryCoordinator.js',
    'application/PublicationSnapshotPlacementExchange.js',
    'content/ContentStore.js',
    'content/IpfsContentStore.js',
    'content/LocalContentStore.js',
    'content/ArweaveContentStore.js'
];

async function run() {
    // ===============================================================
    // Section CONTRACT — one direct check per numbered statement in this
    // file's own header.
    // ===============================================================

    // 1 — a claim's material.uri and a snapshot's locator are never the
    // same value; a placement's contentHash traces to contentReference,
    // never to anything the claim pipeline produced.
    {
        const { alice, publication, discoveryProvider, contentResolver } = publishLocally('Boundary Claim vs Snapshot');

        const { result: claimResult } = await distributeClaim(publication, { transactionId: 'BoundaryClaimTx0000000000000000000001', relayHandler: () => ({ published: true, id: 'a'.repeat(64) }) });
        assert(claimResult.material.uri === 'ar://BoundaryClaimTx0000000000000000000001', '1a. claim distribution genuinely produced a material.uri');

        const network = new Map();
        const aliceIpfs = new IpfsContentStore({ fetchImpl: makeFakeIpfsNode(network) });
        const placementCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        const orchestrator = new CreateSnapshotPlacementOrchestratorUseCase().execute({ discoveryProvider, contentResolver, placementCatalog, identityProvider: alice, stores: [aliceIpfs] });
        const placementResult = await orchestrator.createExternalSnapshotPlacementUseCase.execute(publication.id, 'ipfs');
        assert(placementResult.outcome === SnapshotPlacementCreationOutcome.CREATED, '1b. snapshot placement genuinely produced a locator');

        assert(claimResult.material.uri !== placementResult.placement.locator, '1c. the claim\'s own material.uri and the snapshot\'s own locator are never the same value');
        assert(placementResult.placement.contentHash === publication.contentReference.hash, '1d. the placement\'s contentHash traces to the publication\'s own contentReference, never to the claim distribution\'s material.uri');
        assert(!claimResult.material.uri.includes(placementResult.placement.contentHash), '1e. the claim\'s material.uri does not embed the snapshot\'s own contentHash either');

        console.log('✓ 1. material.uri and locator are two distinct identities, never derived from one another');
    }

    // 2 — distributing a Signed Claim never imports/constructs/reads
    // anything from the Snapshot Placement family (structural).
    {
        for (const file of CLAIM_DISTRIBUTION_FILES) {
            const code = await codeOnlySource(file);
            assert(!code.includes('PublicationSnapshotPlacement'), `2a. ${file} never references PublicationSnapshotPlacement`);
            assert(!code.includes('SnapshotPlacementResolver'), `2b. ${file} never references SnapshotPlacementResolver`);
            assert(!code.includes('SnapshotPlacementStoreRegistry'), `2c. ${file} never references SnapshotPlacementStoreRegistry`);
            assert(!code.includes('ContentStore'), `2d. ${file} never references ContentStore`);
        }
        console.log('✓ 2. the Signed Claim distribution family never references the Snapshot Placement family, anywhere');
    }

    // 3 — placing or resolving a Snapshot never imports/constructs/reads
    // anything from the Signed Claim distribution family (structural),
    // and behaviorally succeeds for a publication that was NEVER
    // distributed as a claim at all.
    {
        for (const file of SNAPSHOT_PLACEMENT_FILES) {
            const code = await codeOnlySource(file);
            assert(!code.includes('PublicationDistribution'), `3a. ${file} never references the PublicationDistribution family`);
            assert(!code.includes('ArweavePublicationMaterialUploader'), `3b. ${file} never references ArweavePublicationMaterialUploader`);
            assert(!code.includes('NostrPublicationDiscoveryPublisher'), `3c. ${file} never references NostrPublicationDiscoveryPublisher`);
        }

        const { alice, publication, discoveryProvider, contentResolver } = publishLocally('Snapshot Without Any Claim');
        // No distributeClaim() call at all for this publication — its
        // material/discovery were never even attempted.
        const network = new Map();
        const ipfs = new IpfsContentStore({ fetchImpl: makeFakeIpfsNode(network) });
        const placementCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        const orchestrator = new CreateSnapshotPlacementOrchestratorUseCase().execute({ discoveryProvider, contentResolver, placementCatalog, identityProvider: alice, stores: [ipfs] });
        const placed = await orchestrator.createExternalSnapshotPlacementUseCase.execute(publication.id, 'ipfs');
        assert(placed.outcome === SnapshotPlacementCreationOutcome.CREATED, '3d. a snapshot can be placed for a publication whose claim was never distributed');

        const resolved = await orchestrator.snapshotPlacementResolver.resolve(placed.placement.toJSON(), { storeRegistry: orchestrator.storeRegistry });
        assert(resolved.outcome === SnapshotPlacementResolutionOutcome.RESOLVED, '3e. that snapshot resolves fully — resolution never needed a claim distribution to have happened');

        console.log('✓ 3. the Snapshot Placement family never references the Signed Claim family, and needs no claim distribution to function');
    }

    // 4 — snapshot placement/resolution never references Nostr; a
    // snapshot's own discovery stays peer-based (structural).
    {
        for (const file of SNAPSHOT_PLACEMENT_FILES) {
            const code = await codeOnlySource(file);
            assert(!/nostr/i.test(code), `4. ${file} never references Nostr in any form — a Snapshot's own discovery stays peer-based, never a side-effect Nostr announcement`);
        }
        console.log('✓ 4. no file in the Snapshot Placement family references Nostr — placing a snapshot is never itself a discovery announcement');
    }

    // 5 — 0.9.132 filled the boundary this point originally named as
    // still-empty: content/ArweaveContentStore.js now exists. What this
    // point still proves, unchanged in spirit, is that its EXISTENCE
    // alone changes nothing about the boundary — it is not auto-wired
    // into any composition root, content/ContentStore.js still
    // constructs nothing itself, and a claim's own Arweave material is
    // still never reachable through SnapshotPlacementStoreRegistry
    // unless a caller explicitly, separately registers this exact store.
    {
        assert(await fileExists('content/ArweaveContentStore.js'), '5a. content/ArweaveContentStore.js exists as of 0.9.132 — the boundary named at 0.9.131 is now filled in exactly the one place that milestone\'s own header said it should be');
        const contentStoreSource = await codeOnlySource('content/ContentStore.js');
        assert(!contentStoreSource.includes('ArweaveContentStore'), '5b. content/ContentStore.js itself still constructs no ArweaveContentStore — it remains an abstract base only');

        const { ArweaveContentStore } = await import('../content/ArweaveContentStore.js');
        const arweave = new ArweaveContentStore({
            signer: { sign: async () => ({ id: 'BoundaryPoint5FillerTxId0000000000001', transaction: {} }) },
            fetchImpl: async () => new Response('accepted', { status: 200 })
        });
        assert(arweave.storage === 'ar', '5c. the new store self-identifies with the SAME "ar" storage label the claim family\'s own material.storage already uses — the scheme is shared, the referent is not (see this file\'s own header, point 5)');

        const { alice, publication, discoveryProvider, contentResolver } = publishLocally('Arweave Content Store Exists But Is Not Auto-Wired');
        const { result: claimResult } = await distributeClaim(publication, { transactionId: 'ArweaveContentStoreExistsTx00000000001', relayHandler: () => ({ published: true, id: 'b'.repeat(64) }) });
        assert(claimResult.material.storage === 'ar', '5d. sanity: the claim really was distributed onto the "ar" storage label');

        // The registry a real composition root actually builds
        // (application/CreateSnapshotPlacementOrchestratorUseCase.js)
        // only ever gets whatever `stores` a caller EXPLICITLY passes it
        // — content/ArweaveContentStore.js existing changes nothing here,
        // because no caller anywhere in this codebase's own production
        // composition passes one in automatically.
        const registry = new SnapshotPlacementStoreRegistry();
        const placementCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        const orchestrator = new CreateSnapshotPlacementOrchestratorUseCase().execute({ discoveryProvider, contentResolver, placementCatalog, identityProvider: alice, stores: [] });
        assert(orchestrator.storeRegistry.get('ar') === null, '5e. SnapshotPlacementStoreRegistry still has no store registered for "ar" when no caller passes one — the claim\'s own material.uri is not resolvable as a snapshot locator through this registry merely because ArweaveContentStore now exists somewhere in the codebase');
        assert(registry.get('ar') === null, '5f. ...true of a freshly constructed registry too, not merely this one orchestrator instance');

        // Registering it explicitly works exactly like every other
        // ContentStore already does — proving this store is a genuine,
        // interchangeable plugin, never a special case.
        const wiredOrchestrator = new CreateSnapshotPlacementOrchestratorUseCase().execute({ discoveryProvider, contentResolver, placementCatalog: new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider()), identityProvider: alice, stores: [arweave] });
        assert(wiredOrchestrator.storeRegistry.get('ar') === arweave, '5g. once a caller explicitly registers content/ArweaveContentStore.js, SnapshotPlacementStoreRegistry resolves "ar" to it — exactly the same opt-in wiring content/IpfsContentStore.js already requires, never automatic');

        console.log('✓ 5. content/ArweaveContentStore.js now exists, is not auto-wired anywhere, and a claim\'s own Arweave material stays unreachable through the snapshot placement registry unless a caller opts in explicitly');
    }

    // ===============================================================
    // Section SEQUENCE — the flagship boundary contract test: ONE
    // publication, distributed as a Signed Claim and placed as a
    // Snapshot in the same continuous scenario, each direction of
    // failure proven independent of the other.
    // ===============================================================
    {
        const { alice, publication, discoveryProvider, contentResolver } = publishLocally('Flagship Boundary');

        // Signed Claim distribution — material + discovery both succeed.
        const { result: claimResult, relay } = await distributeClaim(publication, {
            transactionId: 'FlagshipClaimTransactionId000000000001',
            relayHandler: () => ({ published: true, id: 'c'.repeat(64) })
        });
        assert(claimResult.material.uri === 'ar://FlagshipClaimTransactionId000000000001', 'SEQ. claim material genuinely distributed');
        assert(claimResult.discovery.id === 'c'.repeat(64), 'SEQ. claim discovery genuinely published');
        assert(relay.calls.length === 1, 'SEQ. exactly one relay call was made for the claim\'s own discovery announcement');

        // Snapshot placement — completely independent operation, same
        // publication, real fake-IPFS network.
        const network = new Map();
        const aliceIpfs = new IpfsContentStore({ fetchImpl: makeFakeIpfsNode(network) });
        const placementCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        const aliceOrchestrator = new CreateSnapshotPlacementOrchestratorUseCase().execute({
            discoveryProvider, contentResolver, placementCatalog, identityProvider: alice, stores: [aliceIpfs]
        });
        const placed = await aliceOrchestrator.createExternalSnapshotPlacementUseCase.execute(publication.id, 'ipfs');
        assert(placed.outcome === SnapshotPlacementCreationOutcome.CREATED, 'SEQ. snapshot placement independently succeeded');

        // Bob — a second replica who only ever sees the cataloged
        // placement and his own IPFS store — resolves the SAME bytes,
        // never touching Arweave or Nostr at any point.
        const bobIpfs = new IpfsContentStore({ fetchImpl: makeFakeIpfsNode(network) });
        const bobVerifier = new LocalAuthorizationVerifier();
        const bobResolver = new SnapshotPlacementResolver(bobVerifier);
        const bobRegistry = new SnapshotPlacementStoreRegistry().register(bobIpfs);
        const bobResolved = await bobResolver.resolve(placed.placement.toJSON(), { storeRegistry: bobRegistry });
        assert(bobResolved.outcome === SnapshotPlacementResolutionOutcome.RESOLVED, 'SEQ. Bob resolves the snapshot purely from the catalog entry and his own IPFS store');
        assert(bobResolved.bytes === JSON.stringify(contentResolver.resolve(publication.id)), 'SEQ. Bob\'s resolved bytes are byte-identical to Alice\'s own local snapshot');

        // Independence, direction 1: a SECOND claim distribution for the
        // same publication fails at the material step (gateway down) —
        // the already-resolved snapshot is completely unaffected.
        const { result: failedClaimResult } = await distributeClaim(publication, { transactionId: null, relayHandler: () => ({ published: true, id: 'd'.repeat(64) }) });
        assert(failedClaimResult.material === null, 'SEQ. independence 1: the second claim distribution genuinely failed at the material step');
        assert(failedClaimResult.discovery === null, 'SEQ. independence 1: ...and never reached the discovery step either');
        const bobResolvedAgain = await bobResolver.resolve(placed.placement.toJSON(), { storeRegistry: bobRegistry });
        assert(bobResolvedAgain.outcome === SnapshotPlacementResolutionOutcome.RESOLVED, 'SEQ. independence 1: the snapshot still resolves perfectly — a failed claim distribution never touched it');
        assert(bobResolvedAgain.bytes === bobResolved.bytes, 'SEQ. independence 1: ...with byte-identical content to before');

        // Independence, direction 2: placing a SECOND snapshot for the
        // same publication onto an unregistered storage name fails — the
        // already-completed, fully successful claim distribution above
        // is completely unaffected.
        let placementThrew = false;
        try {
            await aliceOrchestrator.createExternalSnapshotPlacementUseCase.execute(publication.id, 'arweave');
        } catch (error) {
            placementThrew = true;
        }
        assert(placementThrew, 'SEQ. independence 2: placing onto an unregistered "arweave" storage name fails — this orchestrator\'s own stores list never included one, exactly as documented (content/ArweaveContentStore.js exists as of 0.9.132, but nothing here registered it)');
        assert(claimResult.material.uri === 'ar://FlagshipClaimTransactionId000000000001', 'SEQ. independence 2: the original claim\'s own material fact is untouched by the failed placement attempt');
        assert(claimResult.discovery.id === 'c'.repeat(64), 'SEQ. independence 2: ...and its discovery fact too — nothing about it was ever mutated');

        console.log('✓ SEQUENCE: one publication, a Signed Claim distributed and a Snapshot placed independently, each direction of failure proven not to touch the other');
    }

    console.log('✅ All Snapshot Distribution Boundary tests passed.');
}

await run();
