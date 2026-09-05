import OwnPublicationPanel from '../ui/components/OwnPublicationPanel.js';
import {
    registerMaterializedSnapshotWorldSource,
    unregisterMaterializedSnapshotWorldSource,
    materializedSnapshotWorldOrigin
} from '../application/MaterializedSnapshotWorldDiscoveryBridge.js';
import { SnapshotWorldRegistrationOutcome } from '../application/SnapshotWorldRegistrationOutcome.js';
import { SnapshotWorldPlacementOutcome } from '../application/SnapshotWorldPlacementOutcome.js';
import { resolveSnapshotWorldPlacement } from '../application/SnapshotWorldPlacement.js';
import { WorldDiscoverySourceRegistry } from '../application/WorldDiscoverySourceRegistry.js';
import { assembleWorldDiscoveryInputs } from '../core/WorldDiscoverySourceAssembly.js';
import { deriveWorldEncounters } from '../core/WorldEncounter.js';
import { composeDiscoverSnapshotRuntime } from '../application/DiscoverSnapshotRuntimeComposition.js';
import { executeDiscoverSnapshotCandidatesCommand } from '../application/DiscoverSnapshotCandidatesCommand.js';
import { executeResolveSelectedSnapshotCommand } from '../application/ResolveSelectedSnapshotCommand.js';
import { executeMaterializeSelectedSnapshotCommand } from '../application/MaterializeSelectedSnapshotCommand.js';
import { MaterializeSnapshotFromSelectedCandidateUseCase } from '../application/MaterializeSnapshotFromSelectedCandidateUseCase.js';
import { StoreSnapshotContentUseCase } from '../application/StoreSnapshotContentUseCase.js';
import { SnapshotCandidateMaterializationOutcome } from '../application/SnapshotCandidateMaterializationOutcome.js';
import { DecentralizedSnapshotResolutionOutcome } from '../application/DecentralizedSnapshotResolutionOutcome.js';
import { NostrSnapshotDiscoveryPublisher } from '../application/NostrSnapshotDiscoveryPublisher.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { PlacementRecord } from '../core/PlacementRecord.js';
import { Position } from '../core/Position.js';
import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { computeContentHash } from '../serializer/contentHash.js';

// 0.9.160 — Selected Snapshot World Runtime Registration.
//
// 0.9.159 produced a placement FACT that lived only inside
// OwnPublicationPanel.js's own ephemeral interaction state. This milestone
// adds exactly one seam over that output — application/
// MaterializedSnapshotWorldDiscoveryBridge.js#registerMaterializedSnapshotWorldSource()
// — which makes a PLACED Snapshot observable to the running World by
// mutating the SAME, pre-existing `WorldDiscoverySourceRegistry` (0.9.9) a
// connected peer's own World contribution already registers into, under
// its own dedicated origin. No new World-state authority, no new registry,
// no rendering.
//
//   Section A: registerMaterializedSnapshotWorldSource() — constructor/
//              contract validation, REGISTERED, and every non-PLACED
//              outcome (UNPLACED and materialization failures passed
//              through from further upstream) reported verbatim, without
//              ever calling registry.setSource().
//   Section B: identity preservation — the SAME publication object
//              reference is registered, unchanged; position is
//              placement's own, never recomputed; contentHash/locator/
//              storage/publicationId stay pairwise distinct.
//   Section C: the registered source uses ONLY the already-computed
//              placement position — no PlacementRegistry/spatial index of
//              its own (structural sweep).
//   Section D: idempotency — registering the identical contentHash twice
//              leaves exactly one entry in the registry (never two); two
//              DIFFERENT contentHashes occupy two independent slots, and
//              unregistering one never disturbs the other.
//   Section E: OwnPublicationPanel's own UI state machine — guard/no-op,
//              staleness resets on a new selection, a fresh resolution, a
//              fresh materialization, a fresh placement, and a Publication
//              change; independence from placement/materialization/
//              attribution; the real, injected registry is genuinely
//              mutated.
//   Section F — FLAGSHIP: a real composed runtime (real Nostr discovery,
//              real Arweave resolution, real local materialization) PLUS a
//              real, independently-created WorldPlacement PLUS a real
//              WorldDiscoverySourceRegistry — registering the result and
//              confirming it flows, completely unmodified, through
//              assembleWorldDiscoveryInputs() -> deriveWorldEncounters()
//              (the SAME pipeline WorldEncounterCanvas already renders
//              from) into a genuine, correctly-positioned encounter.
//   Section G: structural sweep — no PlacementRegistry/ContentStore/Nostr/
//              Arweave/rendering import inside the new bridge file,
//              SnapshotWorldRegistrationOutcome carries exactly its own
//              one value, and no automatic unregistration exists.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function flushMicrotasks() {
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let i = 0; i < 10; i++) {
        await Promise.resolve();
    }
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function makeFakeArweaveGateway() {
    const network = new Map();
    async function fetchImpl(url, options = {}) {
        const parsed = new URL(url);
        if (options.method === 'POST' && parsed.pathname === '/tx') {
            const transaction = JSON.parse(options.body);
            network.set(transaction.id, transaction.data);
            return new Response('OK', { status: 200 });
        }
        const id = parsed.pathname.slice(1);
        if (!network.has(id)) return new Response('not found', { status: 404 });
        return new Response(network.get(id));
    }
    return { network, fetchImpl };
}

function makeFakeArweaveSigner() {
    let counter = 0;
    async function sign(material) {
        counter += 1;
        return { id: `fake-registration-tx-${counter}`, transaction: { id: `fake-registration-tx-${counter}`, data: material } };
    }
    return { sign };
}

function makeNostrNetwork() {
    const events = [];
    let counter = 0;
    async function publishImpl(relayUrl, eventTemplate) {
        counter += 1;
        const id = counter.toString(16).padStart(64, '0');
        events.push({ id, pubkey: 'fake-pubkey', kind: eventTemplate.kind, tags: eventTemplate.tags, content: eventTemplate.content, sig: 'fake-sig' });
        return { published: true, id };
    }
    async function queryImpl(relayUrl, filter) {
        const tagFilters = Object.entries(filter).filter(([key]) => key.startsWith('#'));
        return events
            .filter((event) => {
                if (Array.isArray(filter.kinds) && !filter.kinds.includes(event.kind)) return false;
                return tagFilters.every(([key, values]) => {
                    const tagName = key.slice(1);
                    return event.tags.some((tag) => tag[0] === tagName && values.includes(tag[1]));
                });
            })
            .slice(0, filter.limit);
    }
    return { events, publishImpl, queryImpl };
}

function makeHost(discoveryTag) {
    const gateway = makeFakeArweaveGateway();
    const signer = makeFakeArweaveSigner();
    const network = makeNostrNetwork();

    const { resolver, contentStore, queryService } = composeDiscoverSnapshotRuntime({
        arweaveContentStoreOptions: { signer, fetchImpl: gateway.fetchImpl },
        nostrSnapshotDiscoveryQueryServiceOptions: { queryImpl: network.queryImpl }
    });

    const announcer = new NostrSnapshotDiscoveryPublisher({ discoveryTag, publishImpl: network.publishImpl });

    const localContentStore = new LocalContentStore(new InMemoryStorageProvider());
    const storeSnapshotContentUseCase = new StoreSnapshotContentUseCase(localContentStore);
    const materializer = new MaterializeSnapshotFromSelectedCandidateUseCase(storeSnapshotContentUseCase);

    const discoverSnapshotCandidatesCommand = () => executeDiscoverSnapshotCandidatesCommand({
        discoveryTag, discoveryQueryService: queryService
    });
    const resolveSelectedSnapshotCommand = (candidate) => executeResolveSelectedSnapshotCommand({
        candidate, resolver, contentStore
    });
    const materializeSelectedSnapshotCommand = (resolution) => executeMaterializeSelectedSnapshotCommand({
        resolution, materializer
    });

    return {
        gateway, signer, network, discoveryTag, resolver, contentStore, queryService, announcer,
        localContentStore, storeSnapshotContentUseCase, materializer,
        discoverSnapshotCandidatesCommand, resolveSelectedSnapshotCommand, materializeSelectedSnapshotCommand
    };
}

async function placeAndAnnounce(host, bytes) {
    const reference = await host.contentStore.put(bytes);
    await host.announcer.publish({ contentHash: reference.hash, locator: reference.uri, storage: reference.storage });
    return reference;
}

function placementInfoFor(placementRegistry, publicationId) {
    const records = placementRegistry.findByPublicationId(publicationId);
    if (records.length === 0) return null;
    const record = records.reduce((latest, r) => (!latest || r.updatedAt > latest.updatedAt) ? r : latest, null);
    return {
        placementId: record.placementId,
        publicationId: record.publicationId,
        position: { x: record.position.x, y: record.position.y, z: record.position.z },
        rotation: record.rotation,
        revision: record.revision,
        owner: record.owner,
        movable: true,
        overlapCount: 0
    };
}

function placeReal(placementRegistry, publicationId, position, owner = 'alice') {
    const record = new PlacementRecord({ publicationId, position, owner });
    placementRegistry.add(record);
    return record;
}

function panelCtx(overrides = {}) {
    return {
        publication: null,
        placementInfo: null,
        worldDiscoverySourceRegistry: null,
        discoverSnapshotCandidatesCommand: null,
        resolveSelectedSnapshotCommand: null,
        materializeSelectedSnapshotCommand: null,
        snapshotCandidateDiscoveryExecuting: false,
        snapshotCandidateDiscoveryError: null,
        snapshotCandidateDiscoveryResult: null,
        snapshotCandidateDiscoveryRequestId: 0,
        selectedSnapshotCandidate: null,
        selectedSnapshotResolutionExecuting: false,
        selectedSnapshotResolutionError: null,
        selectedSnapshotResolutionResult: null,
        selectedSnapshotResolutionRequestId: 0,
        selectedSnapshotAttributionResult: null,
        selectedSnapshotMaterializationExecuting: false,
        selectedSnapshotMaterializationError: null,
        selectedSnapshotMaterializationResult: null,
        selectedSnapshotMaterializationRequestId: 0,
        selectedSnapshotWorldPlacementResult: null,
        selectedSnapshotWorldRegistrationResult: null,
        discoverSnapshotCandidates: OwnPublicationPanel.methods.discoverSnapshotCandidates,
        selectSnapshotCandidate: OwnPublicationPanel.methods.selectSnapshotCandidate,
        resolveSelectedSnapshot: OwnPublicationPanel.methods.resolveSelectedSnapshot,
        attributeSelectedSnapshot: OwnPublicationPanel.methods.attributeSelectedSnapshot,
        materializeSelectedSnapshot: OwnPublicationPanel.methods.materializeSelectedSnapshot,
        placeMaterializedSnapshot: OwnPublicationPanel.methods.placeMaterializedSnapshot,
        registerMaterializedSnapshot: OwnPublicationPanel.methods.registerMaterializedSnapshot,
        ...overrides
    };
}

function placedResult(contentHash, publicationId, position, placementId = 'placement-x') {
    return { outcome: SnapshotWorldPlacementOutcome.PLACED, contentHash, publicationId, placementId, position, reason: null };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — registerMaterializedSnapshotWorldSource()
    // ---------------------------------------------------------------
    {
        let threw = false;
        try { registerMaterializedSnapshotWorldSource(null, {}); } catch (e) { threw = true; }
        assert(threw, '1. a missing registry throws — a caller contract violation');
        threw = false;
        try { registerMaterializedSnapshotWorldSource({}, {}); } catch (e) { threw = true; }
        assert(threw, '2. a registry with no setSource() also throws');

        const registry = new WorldDiscoverySourceRegistry();
        threw = false;
        try { registerMaterializedSnapshotWorldSource(registry, null); } catch (e) { threw = true; }
        assert(threw, '3. a missing worldPlacementResult throws');
        threw = false;
        try { registerMaterializedSnapshotWorldSource(registry, {}); } catch (e) { threw = true; }
        assert(threw, '4. a worldPlacementResult with no outcome field also throws');

        // UNPLACED and every non-PLACED, pass-through-from-upstream outcome
        // is reported VERBATIM, and registry.setSource() is never called.
        const nonPlacedCases = [
            { outcome: SnapshotWorldPlacementOutcome.UNPLACED, contentHash: 'hash-a', reason: null },
            { outcome: DecentralizedSnapshotResolutionOutcome.NOT_DISCOVERED, contentHash: null, reason: 'no candidates' },
            { outcome: SnapshotCandidateMaterializationOutcome.HASH_MISMATCH, contentHash: 'hash-b', reason: 'hash mismatch' }
        ];
        for (const failure of nonPlacedCases) {
            const result = registerMaterializedSnapshotWorldSource(registry, failure, null);
            assert(result.outcome === failure.outcome, `5. ${failure.outcome} is reported verbatim, never remapped to REGISTERED`);
            assert(result.origin === null, `6. ${failure.outcome} registers no origin`);
            assert(result.contentHash === (failure.contentHash || null), `7. ${failure.outcome} carries contentHash through unchanged`);
            assert(registry.listSources().length === 0, `8. ${failure.outcome} never calls registry.setSource()`);
        }

        // A publication/publicationId mismatch on an otherwise-PLACED
        // result is a caller contract violation.
        const placed = placedResult('hash-c', 'pub-c', { x: 1, y: 2, z: 3 });
        threw = false;
        try { registerMaterializedSnapshotWorldSource(registry, placed, new Publication({ id: 'pub-DIFFERENT', title: 'x' })); } catch (e) { threw = true; }
        assert(threw, '9. a publication.id that does not match the placement result\'s own publicationId throws');
        assert(registry.listSources().length === 0, '10. the failed attempt above registered nothing');

        // REGISTERED — a genuine PLACED result with a matching publication.
        const publication = new Publication({ id: 'pub-c', title: 'Section A Publication' });
        const registered = registerMaterializedSnapshotWorldSource(registry, placed, publication);
        assert(registered.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, '11. a matching PLACED result registers as REGISTERED');
        assert(registered.origin === 'snapshot:hash-c:pub-c', '12. origin is the deterministic snapshot:<contentHash>:<publicationId> scheme (0.9.163)');
        assert(registered.contentHash === 'hash-c', '13. contentHash is retained');
        assert(registry.listSources().length === 1, '14. exactly one source now exists in the registry');
    }
    console.log('✓ Section A: registerMaterializedSnapshotWorldSource() — contract validation, REGISTERED, and every non-PLACED outcome passed through verbatim without ever mutating the registry');

    // ---------------------------------------------------------------
    // Section B — identity preservation
    // ---------------------------------------------------------------
    {
        const registry = new WorldDiscoverySourceRegistry();
        const contentHash = computeContentHash('Section B content');
        const publicationId = 'pub-b';
        const position = { x: 7, y: 8, z: 9 };
        const publication = new Publication({
            id: publicationId,
            title: 'Section B Publication',
            contentReference: new ContentReference({ hash: computeContentHash('unrelated document bytes') })
        });
        const placed = placedResult(contentHash, publicationId, position, 'placement-b');

        const result = registerMaterializedSnapshotWorldSource(registry, placed, publication);
        const [source] = registry.listSources();

        assert(source.publications[0] === publication, '1. the EXACT same publication object reference is registered — never cloned or reconstructed');
        assert(source.placements[0].position.x === 7 && source.placements[0].position.y === 8 && source.placements[0].position.z === 9,
            '2. the registered position is the placement result\'s own, borrowed verbatim');
        assert(source.placements[0].publicationId === publicationId, '3. the registered placement names the correct publicationId');
        assert(result.contentHash === contentHash, '4. the result\'s own contentHash is the Snapshot\'s content identity');
        assert(result.contentHash !== publicationId, '5. contentHash is never the publicationId');
        assert(result.contentHash !== publication.contentReference.hash, '6. contentHash is never the Publication\'s own unrelated document contentReference hash');
        assert(result.origin !== JSON.stringify(position), '7. sanity: origin is a string key, never the position itself');
        assert(!('locator' in result) && !('storage' in result) && !('contentReference' in result),
            '8. no locator/storage/contentReference field of any kind on the registration result');
    }
    console.log('✓ Section B: identity preservation — the same publication reference is registered unchanged; position is borrowed verbatim; contentHash/publicationId/locator stay pairwise distinct');

    // ---------------------------------------------------------------
    // Section C — no independent spatial authority
    // ---------------------------------------------------------------
    {
        const { readFile } = await import('node:fs/promises');
        const bridgeSource = await readFile(new URL('../application/MaterializedSnapshotWorldDiscoveryBridge.js', import.meta.url), 'utf8');
        const importLines = bridgeSource.split('\n').filter((line) => line.trim().startsWith('import '));
        assert(!importLines.some((line) => /PlacementRegistry|SpatialIndex|WorldNavigationSession/.test(line)),
            '1. the bridge imports no PlacementRegistry, spatial index, or WorldNavigationSession of its own');
        assert(!bridgeSource.includes('new Position') && !bridgeSource.includes('.add(') && !bridgeSource.includes('findByPublicationId'),
            '2. the bridge never constructs a position or queries a placement store — it only reads worldPlacementResult.position');

        // Behaviorally: two DIFFERENT positions handed in produce two
        // DIFFERENT registered positions, verbatim — nothing here recomputes
        // or normalizes a position.
        const registry = new WorldDiscoverySourceRegistry();
        const pubX = new Publication({ id: 'pub-x', title: 'X' });
        const pubY = new Publication({ id: 'pub-y', title: 'Y' });
        registerMaterializedSnapshotWorldSource(registry, placedResult('hash-x', 'pub-x', { x: 1, y: 0, z: 0 }), pubX);
        registerMaterializedSnapshotWorldSource(registry, placedResult('hash-y', 'pub-y', { x: -1, y: 0, z: 0 }), pubY);
        const sources = registry.listSources();
        const posX = sources.find((s) => s.origin === 'snapshot:hash-x:pub-x').placements[0].position.x;
        const posY = sources.find((s) => s.origin === 'snapshot:hash-y:pub-y').placements[0].position.x;
        assert(posX === 1 && posY === -1, '3. each registration carries its own supplied position, unmixed with the other');
    }
    console.log('✓ Section C: the bridge uses only the already-computed placement position — no PlacementRegistry, spatial index, or position recomputation of its own');

    // ---------------------------------------------------------------
    // Section D — idempotency
    // ---------------------------------------------------------------
    {
        const registry = new WorldDiscoverySourceRegistry();
        const publication = new Publication({ id: 'pub-d', title: 'Section D' });
        const placed = placedResult('hash-d', 'pub-d', { x: 5, y: 5, z: 5 });

        registerMaterializedSnapshotWorldSource(registry, placed, publication);
        registerMaterializedSnapshotWorldSource(registry, placed, publication);
        registerMaterializedSnapshotWorldSource(registry, placed, publication);
        assert(registry.listSources().length === 1, '1. registering the identical contentHash three times leaves exactly ONE entry — the registry\'s own replacement semantics, never a new dedup mechanism');

        // A second, DIFFERENT Snapshot occupies its own independent slot.
        const publicationE = new Publication({ id: 'pub-e', title: 'Section D (second)' });
        registerMaterializedSnapshotWorldSource(registry, placedResult('hash-e', 'pub-e', { x: -5, y: -5, z: -5 }), publicationE);
        assert(registry.listSources().length === 2, '2. a different contentHash registers as a SECOND, independent entry — never replacing the first');

        // Unregistering one never disturbs the other.
        unregisterMaterializedSnapshotWorldSource(registry, 'hash-d', 'pub-d');
        assert(registry.listSources().length === 1, '3. unregistering hash-d/pub-d removes exactly its own entry');
        assert(registry.listSources()[0].origin === 'snapshot:hash-e:pub-e', '4. the surviving entry is hash-e/pub-e\'s own, untouched');

        // Unregistering an absent/malformed contentHash/publicationId pair is
        // a harmless no-op.
        unregisterMaterializedSnapshotWorldSource(registry, 'never-registered', 'pub-e');
        unregisterMaterializedSnapshotWorldSource(null, 'hash-e', 'pub-e');
        unregisterMaterializedSnapshotWorldSource(registry, null, 'pub-e');
        unregisterMaterializedSnapshotWorldSource(registry, 'hash-e', null);
        assert(registry.listSources().length === 1, '5. unregistering an absent/malformed target changes nothing');

        assert(materializedSnapshotWorldOrigin('abc', 'pub-abc') === 'snapshot:abc:pub-abc', '6. materializedSnapshotWorldOrigin() is the deterministic, reused key derivation over BOTH contentHash and publicationId (0.9.163)');
        assert(materializedSnapshotWorldOrigin('', 'pub-abc') === null && materializedSnapshotWorldOrigin(null, 'pub-abc') === null, '7. an empty/missing contentHash derives no origin');
        assert(materializedSnapshotWorldOrigin('abc', '') === null && materializedSnapshotWorldOrigin('abc', null) === null, '7b. an empty/missing publicationId also derives no origin');
    }
    console.log('✓ Section D: idempotent by construction — repeated registration of the identical Snapshot never accumulates, and independently registered Snapshots never disturb one another');

    // ---------------------------------------------------------------
    // Section E — OwnPublicationPanel UI state machine
    // ---------------------------------------------------------------
    {
        const host = makeHost('registration-ui-state');
        const bytesOne = 'Section E: first candidate';
        const bytesTwo = 'Section E: second candidate, genuinely different content';
        await placeAndAnnounce(host, bytesOne);
        await placeAndAnnounce(host, bytesTwo);

        const registry = new WorldDiscoverySourceRegistry();
        const publication = new Publication({ id: 'pub-section-e', title: 'Section E' });
        const placementInfo = { placementId: 'placement-e', publicationId: 'pub-section-e', position: { x: 3, y: 3, z: 3 } };

        const ctx = panelCtx({
            publication,
            placementInfo,
            worldDiscoverySourceRegistry: registry,
            discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
            resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
            materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand
        });

        // E1. a no-op with no placement result yet.
        ctx.registerMaterializedSnapshot();
        assert(ctx.selectedSnapshotWorldRegistrationResult === null, '1. registering before any placement exists is a safe no-op');
        assert(registry.listSources().length === 0, '2. sanity: nothing was registered');

        ctx.discoverSnapshotCandidates();
        await flushMicrotasks();
        const [candidateOne, candidateTwo] = ctx.snapshotCandidateDiscoveryResult;

        ctx.selectSnapshotCandidate(candidateOne);
        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();
        ctx.materializeSelectedSnapshot();
        await flushMicrotasks();
        ctx.placeMaterializedSnapshot();
        assert(ctx.selectedSnapshotWorldPlacementResult.outcome === SnapshotWorldPlacementOutcome.PLACED, '3. sanity: the first selection places');

        // E2. registration is synchronous and genuinely mutates the real,
        // injected registry.
        ctx.registerMaterializedSnapshot();
        assert(ctx.selectedSnapshotWorldRegistrationResult !== null, '4. registerMaterializedSnapshot() is synchronous — the result exists immediately');
        assert(ctx.selectedSnapshotWorldRegistrationResult.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, '5. REGISTERED, against the real supplied registry');
        assert(registry.listSources().length === 1, '6. the REAL, injected registry now genuinely holds one source');

        // E3. selecting a different candidate clears the stale registration
        // result immediately — resolution/materialization/placement all
        // already do this; registration now does too.
        ctx.selectSnapshotCandidate(candidateTwo);
        assert(ctx.selectedSnapshotWorldRegistrationResult === null, '7. selecting a different candidate clears the prior registration result');
        assert(ctx.selectedSnapshotWorldPlacementResult === null, '8. sanity: it also clears the prior placement result (unchanged, 0.9.159)');
        assert(registry.listSources().length === 1, '9. clearing the UI\'s own displayed result never unregisters anything from the runtime registry itself');

        // E4. re-placing the CURRENT materialization clears a stale
        // registration result computed from the earlier placement.
        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();
        ctx.materializeSelectedSnapshot();
        await flushMicrotasks();
        ctx.placeMaterializedSnapshot();
        ctx.registerMaterializedSnapshot();
        assert(ctx.selectedSnapshotWorldRegistrationResult !== null, '10. sanity: a registration result exists before re-placing');
        ctx.placeMaterializedSnapshot();
        assert(ctx.selectedSnapshotWorldRegistrationResult === null, '11. re-placing the current materialization immediately clears the stale registration result');

        // E5. a Publication change resets the entire registration family too.
        ctx.registerMaterializedSnapshot();
        assert(ctx.selectedSnapshotWorldRegistrationResult !== null, '12. sanity: a registration result exists before the Publication changes');
        const otherPublication = { id: 'pub-section-e-other', contentReference: null };
        OwnPublicationPanel.watch.publication.call(ctx, otherPublication, publication);
        ctx.publication = otherPublication;
        assert(ctx.selectedSnapshotWorldRegistrationResult === null, '13. a Publication change clears the registration result');

        // E6. independence: registering never touches placement/
        // materialization/attribution results, and placing never
        // automatically registers anything.
        ctx.publication = publication;
        ctx.selectSnapshotCandidate(candidateOne);
        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();
        ctx.materializeSelectedSnapshot();
        await flushMicrotasks();
        ctx.placeMaterializedSnapshot();
        assert(ctx.selectedSnapshotWorldRegistrationResult === null, '14. placing never automatically registers anything — only a separate click does');
        const placementBeforeRegistering = ctx.selectedSnapshotWorldPlacementResult;
        ctx.registerMaterializedSnapshot();
        assert(ctx.selectedSnapshotWorldPlacementResult === placementBeforeRegistering, '15. registering never mutates or replaces the placement result it read');
        assert(ctx.selectedSnapshotAttributionResult === null, '16. sanity: nothing in this chain ever touches attribution');

        // E7. no worldDiscoverySourceRegistry supplied at all -> safe no-op.
        const noRegistryCtx = panelCtx({ selectedSnapshotWorldPlacementResult: placementBeforeRegistering, worldDiscoverySourceRegistry: null });
        noRegistryCtx.registerMaterializedSnapshot();
        assert(noRegistryCtx.selectedSnapshotWorldRegistrationResult === null, '17. with no registry supplied, registering is a safe no-op rather than throwing');

        console.log('✓ Section E: registerMaterializedSnapshot() follows the identical guard/staleness pattern every sibling action in this panel already holds, is synchronous, and genuinely mutates the real, injected registry');
    }

    // ---------------------------------------------------------------
    // Section F — FLAGSHIP: real composed runtime + real placement + real
    // registry, flowing all the way through the EXISTING World Encounter
    // pipeline.
    // ---------------------------------------------------------------
    {
        const host = makeHost('registration-flagship');
        const bytes = JSON.stringify({ world: { buildings: [{ id: 'registration-flagship-building', bricks: 4 }] } });
        const reference = await placeAndAnnounce(host, bytes);

        const placementRegistry = new LocalPlacementRegistry(new InMemoryStorageProvider());
        const publicationId = 'flagship-registration-publication';
        placeReal(placementRegistry, publicationId, new Position(64, 2, -8));

        const publication = new Publication({ id: publicationId, title: 'Flagship Registered World', contentReference: reference });
        const placementInfo = placementInfoFor(placementRegistry, publicationId);

        const worldDiscoverySourceRegistry = new WorldDiscoverySourceRegistry();
        const ctx = panelCtx({
            publication,
            placementInfo,
            worldDiscoverySourceRegistry,
            discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
            resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
            materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand
        });

        ctx.discoverSnapshotCandidates();
        await flushMicrotasks();
        assert(ctx.snapshotCandidateDiscoveryResult.length === 1, '1. the real candidate was genuinely discovered');
        const candidate = ctx.snapshotCandidateDiscoveryResult[0];

        ctx.selectSnapshotCandidate(candidate);
        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();
        ctx.materializeSelectedSnapshot();
        await flushMicrotasks();
        ctx.placeMaterializedSnapshot();
        assert(ctx.selectedSnapshotWorldPlacementResult.outcome === SnapshotWorldPlacementOutcome.PLACED, '2. sanity: the materialized candidate places');

        // Before registering: the World Encounter pipeline, run over
        // whatever THIS registry currently holds, shows nothing at all.
        const beforeSources = worldDiscoverySourceRegistry.listSources();
        const beforeInputs = assembleWorldDiscoveryInputs(beforeSources);
        const beforeEncounters = deriveWorldEncounters(beforeInputs);
        assert(beforeEncounters.publications.length === 0, '3. before registration, this Publication is not yet encounterable through the registry\'s own current contents');

        ctx.registerMaterializedSnapshot();
        assert(ctx.selectedSnapshotWorldRegistrationResult.outcome === SnapshotWorldRegistrationOutcome.REGISTERED,
            '4. FLAGSHIP — a real Nostr-discovered, resolved, materialized, and placed Snapshot registers with the real World runtime registry');

        // FLAGSHIP: run the EXACT, entirely unmodified existing pipeline
        // (registry -> assembly -> encounter derivation) that
        // WorldEncounterCanvas itself already runs, and confirm the
        // registered Publication is now genuinely encounterable at the
        // exact real placement position.
        const sources = worldDiscoverySourceRegistry.listSources();
        const inputs = assembleWorldDiscoveryInputs(sources);
        const encounters = deriveWorldEncounters(inputs);
        assert(encounters.publications.length === 1, '5. FLAGSHIP — the registered Snapshot\'s own Publication is now encounterable through the SAME, unmodified core/WorldEncounter.js#deriveWorldEncounters() pipeline WorldEncounterCanvas already renders from');
        const [encounter] = encounters.publications;
        assert(encounter.objectId === publicationId, '6. the encounter names the correct Publication');
        assert(encounter.position.x === 64 && encounter.position.y === 2 && encounter.position.z === -8,
            '7. FLAGSHIP — the encounter\'s own position is EXACTLY the real PlacementRecord\'s own position, carried through registration unchanged');
        assert(encounter.title === 'Flagship Registered World', '8. the Publication\'s own title survives, unreconstructed, all the way to the encounter');

        console.log('✓ Section F: FLAGSHIP — a real Nostr-discovered, resolved, materialized, and placed Snapshot registers with a real WorldDiscoverySourceRegistry and becomes a genuine, correctly-positioned encounter through the entirely unmodified existing World Encounter pipeline');
    }

    // ---------------------------------------------------------------
    // Section G — structural sweep
    // ---------------------------------------------------------------
    {
        const outcomeKeys = Object.keys(SnapshotWorldRegistrationOutcome);
        assert(outcomeKeys.length === 1 && outcomeKeys.includes('REGISTERED'), '1. SnapshotWorldRegistrationOutcome carries exactly its own one value');

        const { readFile } = await import('node:fs/promises');
        const bridgeSource = await readFile(new URL('../application/MaterializedSnapshotWorldDiscoveryBridge.js', import.meta.url), 'utf8');
        const bridgeImportLines = bridgeSource.split('\n').filter((line) => line.trim().startsWith('import '));
        assert(!bridgeImportLines.some((line) => /ContentStore|NostrSnapshotDiscovery|Arweave|Renderer|WorldEncounterCanvas|deriveWorldEncounters|WorldEncounter\.js/.test(line)),
            '2. the bridge imports no content store, discovery, or rendering/encounter-derivation machinery of its own');
        assert(!bridgeSource.includes('fetch(') && !bridgeSource.includes('await '),
            '3. the bridge performs no network/async I/O — every exported function is plain and synchronous');
        assert(!/viewport|visible|camera|mesh|scene/i.test(bridgeSource.replace(/\/\/.*$/gm, '').replace(/^\s*\*.*$/gm, '')),
            '4. no viewport/visibility/camera/rendering vocabulary appears in the bridge\'s own executable code');

        // registerMaterializedSnapshot() never calls resolveSnapshotWorldPlacement()
        // or the materialization/resolution commands — it only reads their
        // already-computed results.
        const panelSource = await readFile(new URL('../ui/components/OwnPublicationPanel.js', import.meta.url), 'utf8');
        const bodyStart = panelSource.indexOf('registerMaterializedSnapshot() {');
        const bodyEnd = panelSource.indexOf('\n    }', bodyStart);
        const body = panelSource.slice(bodyStart, bodyEnd);
        assert(!body.includes('resolveSnapshotWorldPlacement') && !body.includes('resolveSnapshotPublicationAttribution'),
            '5. registerMaterializedSnapshot() never calls resolveSnapshotWorldPlacement() or resolveSnapshotPublicationAttribution() itself');
        assert(!body.includes('materializeSelectedSnapshotCommand') && !body.includes('resolveSelectedSnapshotCommand'),
            '6. registerMaterializedSnapshot() never calls the materialization or resolution command directly');
        assert(body.includes('this.selectedSnapshotWorldPlacementResult') && body.includes('this.worldDiscoverySourceRegistry') && body.includes('this.publication'),
            '7. registerMaterializedSnapshot() reads the placement result, the registry, and the publication, exactly as documented');

        // No automatic unregistration call site exists anywhere in the panel.
        assert(!panelSource.includes('unregisterMaterializedSnapshotWorldSource'), '8. no automatic unregistration exists in this panel — only an explicit, future caller would use it');

        console.log('✓ Section G: structural sweep — SnapshotWorldRegistrationOutcome carries exactly its own one value, the bridge performs no I/O and imports no discovery/rendering machinery, and no automatic unregistration exists');
    }

    console.log('\n✅ All Snapshot World Runtime Registration tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
