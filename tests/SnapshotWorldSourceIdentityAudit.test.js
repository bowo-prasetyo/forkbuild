import { readFile, readdir } from 'node:fs/promises';
import OwnPublicationPanel from '../ui/components/OwnPublicationPanel.js';
import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import WorldEncounterMarker from '../ui/components/WorldEncounterMarker.js';
import {
    registerMaterializedSnapshotWorldSource,
    unregisterMaterializedSnapshotWorldSource,
    materializedSnapshotWorldOrigin
} from '../application/MaterializedSnapshotWorldDiscoveryBridge.js';
import { SnapshotWorldPlacementOutcome } from '../application/SnapshotWorldPlacementOutcome.js';
import { SnapshotWorldRegistrationOutcome } from '../application/SnapshotWorldRegistrationOutcome.js';
import { resolveSnapshotWorldPlacement } from '../application/SnapshotWorldPlacement.js';
import { resolveSnapshotPublicationAttribution } from '../application/SnapshotPublicationAttribution.js';
import { SnapshotPublicationAttributionOutcome } from '../application/SnapshotPublicationAttributionOutcome.js';
import { DecentralizedSnapshotResolutionOutcome } from '../application/DecentralizedSnapshotResolutionOutcome.js';
import { DecentralizedSnapshotResolver } from '../application/DecentralizedSnapshotResolver.js';
import { StoreSnapshotContentOutcome } from '../application/StoreSnapshotContentOutcome.js';
import { StoreSnapshotContentUseCase } from '../application/StoreSnapshotContentUseCase.js';
import { MaterializeSnapshotFromSelectedCandidateUseCase } from '../application/MaterializeSnapshotFromSelectedCandidateUseCase.js';
import { NostrSnapshotDiscoveryPublisher } from '../application/NostrSnapshotDiscoveryPublisher.js';
import { NostrSnapshotDiscoveryQueryService } from '../application/NostrSnapshotDiscoveryQueryService.js';
import { composeDiscoverSnapshotRuntime } from '../application/DiscoverSnapshotRuntimeComposition.js';
import { executeDiscoverSnapshotCandidatesCommand } from '../application/DiscoverSnapshotCandidatesCommand.js';
import { executeResolveSelectedSnapshotCommand } from '../application/ResolveSelectedSnapshotCommand.js';
import { executeMaterializeSelectedSnapshotCommand } from '../application/MaterializeSelectedSnapshotCommand.js';
import { WorldDiscoverySourceRegistry } from '../application/WorldDiscoverySourceRegistry.js';
import { describeWorldFromDiscoveryRegistry } from '../application/WorldDiscoveryRegistryProjection.js';
import { describeLocalWorldDiscoverySource } from '../application/WorldEncounterIntegration.js';
import { describePeerWorldDiscoverySource } from '../peer/PeerWorldDataIngress.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { PlacementRecord } from '../core/PlacementRecord.js';
import { Position } from '../core/Position.js';
import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.9.164 — Snapshot World Source Identity Audit.
//
// 0.9.150 through 0.9.163 built and then repaired one continuous pipeline:
//
//   DISCOVER -> SELECT -> RESOLVE -> VERIFY -> ATTRIBUTE -> MATERIALIZE ->
//   PLACE -> REGISTER -> RENDER
//
// Along the way that pipeline accumulated SIX genuinely different
// identities, each answering a different question:
//
//   contentHash    — what the Snapshot's bytes ARE (content identity)
//   locator/storage — WHERE those bytes can be RETRIEVED from (retrieval
//                     identity — two fields, one question)
//   Nostr event id  — WHICH announcement a candidate was learned from
//                     (discovery identity)
//   publicationId   — WHICH World Publication a Snapshot represents
//                     (Publication identity)
//   origin          — WHICH registry slot a discovery contribution
//                     occupies (registry identity — 0.9.163's own derived
//                     `snapshot:<contentHash>:<publicationId>` key)
//   position         — WHERE a Publication sits in shared World space
//                     (spatial identity)
//
// 0.9.163 fixed a genuine collision one layer BELOW where these identities
// meet — two different Publications sharing one contentHash were
// colliding on one registry slot because `origin` was derived from
// `contentHash` alone. The fix folded `publicationId` into that
// derivation. This milestone asks the wider question that fix's own
// existence raises: now that `origin` is a function of TWO identities
// instead of one, does every OTHER layer of this pipeline still keep all
// six identities strictly apart, or did some other seam quietly borrow one
// identity to stand in for another?
//
//   TEST-ONLY, BY DESIGN. Every file this milestone touches lives under
// `tests/` alone (see Section J's own structural sweep). Where an earlier
// section finds an already-proven invariant (0.9.162's convergence
// findings, 0.9.163's own origin fix), this file re-confirms it directly
// against the real, unmodified production code — never re-implements it —
// so this audit stays a freeze, not a second copy of the behavior it
// checks.
//
//   Section A: content identity — contentHash is the identity RESOLUTION,
//              VERIFICATION, and ATTRIBUTION all key off; it is never, by
//              itself, sufficient to name a World registry slot.
//   Section B: Publication identity — two Publications sharing one
//              contentHash remain independently observable; placement
//              never substitutes one publicationId for another.
//   Section C: retrieval identity — locator/storage never becomes a
//              second World object identity, from RESOLUTION all the way
//              through to the rendered encounter.
//   Section D: discovery identity — a Nostr event's own id never survives
//              past the query service into a candidate, and never alters
//              contentHash/publicationId/position for two differently
//              announced routes to the identical content.
//   Section E: registry origin — the central invariant 0.9.163 created:
//              same contentHash + same publicationId -> same origin; same
//              contentHash + different publicationId (or vice versa) ->
//              different origin.
//   Section F: spatial identity — retrieval/discovery metadata changing
//              never moves a Publication's position; a different
//              Publication naturally selects its OWN placement authority.
//   Section G: rendering identity — the renderer always receives
//              objectId = publication.id, never contentHash/origin/
//              locator/eventId.
//   Section H: full-path identity preservation — the real, unmodified
//              pipeline, run end to end, with the six identities captured
//              at every boundary and cross-checked for silent
//              substitution.
//   Section I: THE ADVERSARIAL MATRIX — two Publications, identical
//              content, different locators, different discovery routes,
//              different positions, run through the REAL pipeline twice;
//              both remain independently placed and encounterable.
//   Section J: structural sweep — no `SnapshotIdentity`/`WorldSnapshot`
//              class exists anywhere in this codebase; no dedup/
//              reconciliation/merge/trust/ranking vocabulary was added;
//              this milestone adds no production file.

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

function placeReal(placementRegistry, publicationId, position, owner = 'alice') {
    const record = new PlacementRecord({ publicationId, position, owner });
    placementRegistry.add(record);
    return record;
}

// Mirrors OwnPublicationPanel.js's own placementInfoFor()/WorldNavigationSession#
// getPlacementInfo() shape — the exact duck type resolveSnapshotWorldPlacement()
// (0.9.159) requires, identical to every sibling test file's own helper.
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

function materializedResult(contentHash, locator = `local:${contentHash}`) {
    return { outcome: StoreSnapshotContentOutcome.STORED, contentHash, locator, reason: null };
}

function placedResult(contentHash, publicationId, position, placementId = 'placement-x') {
    return { outcome: SnapshotWorldPlacementOutcome.PLACED, contentHash, publicationId, placementId, position, reason: null };
}

function resolvedResult(bytes, candidates = []) {
    return { outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes, candidates, locator: null, storage: null, reason: null };
}

// Reproduces ui/views/WorldView.js's own real wiring by hand — identical to
// every sibling test file's own buildCanvasInstance().
function buildCanvasInstance({ registry = null, view } = {}) {
    const ctx = {
        registry,
        view: view !== undefined ? view : WorldEncounterCanvas.props.view.default()
    };
    Object.assign(ctx, WorldEncounterCanvas.data.call(ctx));
    Object.assign(ctx, WorldEncounterCanvas.methods);
    return ctx;
}

function mountCanvas(ctx) { WorldEncounterCanvas.mounted.call(ctx); }
function unmountCanvas(ctx) { WorldEncounterCanvas.beforeUnmount.call(ctx); }

function projectedPublicationsOf(ctx) {
    ctx.effectiveView = WorldEncounterCanvas.computed.effectiveView.call(ctx);
    ctx.publicationRows = WorldEncounterCanvas.computed.publicationRows.call(ctx);
    return WorldEncounterCanvas.computed.projectedPublications.call(ctx);
}

function markerGlyphAndSelection(projectedMarker) {
    const ctx = { kind: 'PUBLICATION', objectId: projectedMarker.objectId, label: projectedMarker.label, x: projectedMarker.x, y: projectedMarker.y, $emit(event, payload) { ctx.emitted = { event, payload }; } };
    const glyph = WorldEncounterMarker.computed.glyph.call(ctx);
    WorldEncounterMarker.methods.emitSelect.call(ctx);
    return { glyph, emitted: ctx.emitted };
}

async function flushMicrotasks() {
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let i = 0; i < 10; i++) {
        await Promise.resolve();
    }
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

function makeFakeArweaveSigner(prefix = 'fake-identity-tx') {
    let counter = 0;
    async function sign(material) {
        counter += 1;
        return { id: `${prefix}-${counter}`, transaction: { id: `${prefix}-${counter}`, data: material } };
    }
    return { sign };
}

// A Nostr network double whose own events carry a genuinely distinct
// `id` per publish call — the SAME fact NIP-01 events always carry — so
// this file can prove that id never leaks past the query service. Seeded
// from a module-level counter so two independently constructed networks
// (two separate "replicas"/hosts within one test section) never mint the
// same event id, exactly as two genuinely different Nostr relays never
// would.
let globalNostrEventCounter = 0;
function makeNostrNetwork() {
    const events = [];
    async function publishImpl(relayUrl, eventTemplate) {
        globalNostrEventCounter += 1;
        const id = globalNostrEventCounter.toString(16).padStart(64, '0');
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

// Reproduces application/*RuntimeComposition.js + OwnPublicationPanel.js's
// own real wiring for one "replica" — identical to tests/
// SnapshotWorldRendering.test.js's own makeHost(), so this file exercises
// the REAL pipeline, not a reimplementation of it.
function makeHost(discoveryTag, { txPrefix = 'fake-identity-tx' } = {}) {
    const gateway = makeFakeArweaveGateway();
    const signer = makeFakeArweaveSigner(txPrefix);
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
    const announceResult = await host.announcer.publish({ contentHash: reference.hash, locator: reference.uri, storage: reference.storage });
    return { reference, announceResult };
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

// Drives one Publication all the way through the real, unmodified pipeline
// — DISCOVER -> SELECT -> RESOLVE -> VERIFY -> ATTRIBUTE -> MATERIALIZE ->
// PLACE -> REGISTER — via OwnPublicationPanel.js's own real methods,
// exactly the sequence a person clicking through the actual UI would
// trigger. Returns every identifier captured at every boundary, so a
// caller can cross-check none of them were silently substituted for
// another.
async function runFullPipeline({ discoveryTag, publicationId, bytes, position, placementRegistry, sharedRegistry, txPrefix }) {
    const host = makeHost(discoveryTag, { txPrefix });
    const { reference, announceResult } = await placeAndAnnounce(host, bytes);

    placeReal(placementRegistry, publicationId, position);
    const publication = new Publication({ id: publicationId, title: `Identity Audit ${publicationId}`, contentReference: reference });
    const placementInfo = placementInfoFor(placementRegistry, publicationId);

    const panel = panelCtx({
        publication,
        placementInfo,
        worldDiscoverySourceRegistry: sharedRegistry,
        discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
        resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
        materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand
    });

    panel.discoverSnapshotCandidates();
    await flushMicrotasks();
    const candidate = panel.snapshotCandidateDiscoveryResult[0];

    panel.selectSnapshotCandidate(candidate);
    panel.resolveSelectedSnapshot();
    await flushMicrotasks();
    panel.attributeSelectedSnapshot();
    panel.materializeSelectedSnapshot();
    await flushMicrotasks();
    panel.placeMaterializedSnapshot();
    panel.registerMaterializedSnapshot();

    return {
        host, publication, reference, placementInfo,
        eventId: host.network.events[host.network.events.length - 1].id,
        candidate,
        resolution: panel.selectedSnapshotResolutionResult,
        attribution: panel.selectedSnapshotAttributionResult,
        materialization: panel.selectedSnapshotMaterializationResult,
        placement: panel.selectedSnapshotWorldPlacementResult,
        registration: panel.selectedSnapshotWorldRegistrationResult
    };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — content identity: contentHash is the identity
    // RESOLUTION, VERIFICATION, and ATTRIBUTION all key off — and it is
    // NEVER, by itself, sufficient to name a World registry slot.
    // ---------------------------------------------------------------
    {
        const bytes = JSON.stringify({ world: { note: 'section-a-content' } });
        const reference = new ContentReference({ hash: 'hash-content-a', uri: 'ipfs://irrelevant', storage: 'ipfs' });
        assert(reference.verify(bytes) === false, '1. sanity — a made-up contentHash never verifies against real bytes');

        // ATTRIBUTE: resolveSnapshotPublicationAttribution() compares a
        // RECOMPUTED content hash against publication.contentReference.hash
        // — never a locator, a storage tag, an eventId, or a publicationId.
        const publication = new Publication({ id: 'pub-content-a', contentReference: new ContentReference({ hash: 'wont-matter', uri: 'ipfs://one' }) });
        const matchingResolution = resolvedResult(bytes, [{ contentHash: 'wont-matter', locator: 'ipfs://one', storage: 'ipfs' }]);
        const attributionOne = resolveSnapshotPublicationAttribution(publication, matchingResolution);
        // Same bytes, wildly different locator/storage on the candidate the
        // resolution carries: the attribution outcome is unaffected, because
        // it never reads locator/storage at all.
        const attributionTwo = resolveSnapshotPublicationAttribution(publication,
            resolvedResult(bytes, [{ contentHash: 'wont-matter', locator: 'ar://totally-different-locator', storage: 'ar' }]));
        assert(attributionOne.outcome === attributionTwo.outcome && attributionOne.snapshotHash === attributionTwo.snapshotHash,
            '2. attribution is a pure function of the recomputed content hash — changing only locator/storage on the surrounding resolution never changes its verdict');

        // A publicationId never enters the comparison either: two
        // publications with DIFFERENT ids but the SAME contentReference.hash
        // both attribute identically against the identical bytes.
        const publicationOther = new Publication({ id: 'pub-content-a-other', contentReference: publication.contentReference });
        const attributionThree = resolveSnapshotPublicationAttribution(publicationOther, matchingResolution);
        assert(attributionThree.outcome === attributionOne.outcome && attributionThree.snapshotHash === attributionOne.snapshotHash,
            '3. attribution never reads publicationId — two different Publications sharing one contentReference.hash attribute identically');

        // REGISTRY: contentHash alone is never sufficient to derive a
        // registry origin — materializedSnapshotWorldOrigin() requires
        // publicationId too (0.9.163).
        assert(materializedSnapshotWorldOrigin('hash-content-a', null) === null, '4. contentHash alone never derives a registry origin — publicationId is required alongside it');
        assert(materializedSnapshotWorldOrigin('hash-content-a', '') === null, '4b. an empty publicationId is likewise rejected — never silently treated as "no Publication, key on content alone"');

        // contentHash still PARTICIPATES in the derived key (the matrix's
        // "derived use" cell) — changing it, with publicationId held fixed,
        // still changes the origin.
        assert(materializedSnapshotWorldOrigin('hash-content-a', 'pub-x') !== materializedSnapshotWorldOrigin('hash-content-b', 'pub-x'),
            '5. contentHash still participates in the derived registry key — changing it, publicationId held fixed, changes the origin');

        console.log('✓ Section A: content identity — contentHash drives resolution/verification/attribution alone, and is never, by itself, a sufficient World registry identity');
    }

    // ---------------------------------------------------------------
    // Section B — Publication identity: two Publications sharing one
    // contentHash remain independently observable, and placement never
    // substitutes one publicationId for another.
    // ---------------------------------------------------------------
    {
        const registry = new WorldDiscoverySourceRegistry();
        const publicationA = new Publication({ id: 'pub-identity-a', title: 'Identity A' });
        const publicationB = new Publication({ id: 'pub-identity-b', title: 'Identity B' });

        const resultA = registerMaterializedSnapshotWorldSource(registry, placedResult('hash-shared-identity', 'pub-identity-a', { x: 1, y: 0, z: 1 }), publicationA);
        const resultB = registerMaterializedSnapshotWorldSource(registry, placedResult('hash-shared-identity', 'pub-identity-b', { x: 2, y: 0, z: 2 }), publicationB);
        assert(resultA.outcome === SnapshotWorldRegistrationOutcome.REGISTERED && resultB.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, '1. both Publications register successfully, sharing one contentHash');

        const view = describeWorldFromDiscoveryRegistry(registry);
        assert(view.publications.length === 2, '2. publicationId A !== publicationId B remains true — both Publications are independently observable in the World, never collapsed');
        assert(view.publications.some((p) => p.objectId === 'pub-identity-a') && view.publications.some((p) => p.objectId === 'pub-identity-b'), '3. each Publication is present under its own id');

        // Placement never substitutes one publicationId for another: two
        // DIFFERENT placementInfos naming two different publicationIds, but
        // coincidentally the SAME position, still resolve to two DISTINCT
        // publicationIds on the placement result.
        const placementInfoA = { placementId: 'placement-a', publicationId: 'pub-identity-a', position: { x: 9, y: 9, z: 9 } };
        const placementInfoB = { placementId: 'placement-b', publicationId: 'pub-identity-b', position: { x: 9, y: 9, z: 9 } };
        const placedA = resolveSnapshotWorldPlacement(materializedResult('hash-x'), placementInfoA);
        const placedB = resolveSnapshotWorldPlacement(materializedResult('hash-x'), placementInfoB);
        assert(placedA.publicationId === 'pub-identity-a' && placedB.publicationId === 'pub-identity-b', '4. placement never substitutes one publicationId for another, even when both placements coincidentally share one position');
        assert(placedA.publicationId !== placedB.publicationId, '5. THE INVARIANT — publicationId A !== publicationId B remains true even where every other observable fact (contentHash, position) coincides');

        console.log('✓ Section B: Publication identity — two Publications sharing one contentHash remain independently observable; placement never substitutes one publicationId for another');
    }

    // ---------------------------------------------------------------
    // Section C — retrieval identity: locator/storage never becomes a
    // second World object identity, from RESOLUTION through to the
    // rendered encounter.
    // ---------------------------------------------------------------
    {
        // RESOLVE: the SAME bytes, addressed through two candidates that
        // differ ONLY in locator, resolve to the SAME verified contentHash
        // — LocalContentStore keys storage by hash, never by locator.
        const storageProvider = new InMemoryStorageProvider();
        const contentStore = new LocalContentStore(storageProvider);
        const bytes = JSON.stringify({ world: { note: 'section-c-retrieval' } });
        const reference = contentStore.put(bytes);
        // resolveCandidate() never calls the injected queryService (see
        // that method's own header, "never calls this._queryService.search()")
        // — a minimally duck-typed stand-in satisfies the constructor only.
        const resolver = new DecentralizedSnapshotResolver({ search: async () => [] });

        const resolutionViaLocatorOne = await resolver.resolveCandidate(
            { contentHash: reference.hash, locator: 'local://path-one', storage: 'local' }, { contentStore }
        );
        const resolutionViaLocatorTwo = await resolver.resolveCandidate(
            { contentHash: reference.hash, locator: 'local://path-two', storage: 'local' }, { contentStore }
        );
        assert(resolutionViaLocatorOne.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED
            && resolutionViaLocatorTwo.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED,
            '1. both differently-located candidates resolve successfully');
        assert(resolutionViaLocatorOne.bytes === resolutionViaLocatorTwo.bytes,
            '2. changing ONLY the locator never changes the retrieved, verified bytes — retrieval identity (locator/storage) is orthogonal to content identity');

        // REGISTER: the same invariant 0.9.162's Section D / 0.9.163's
        // Section F already proved, reconfirmed here as this milestone's own
        // freeze — changing locator/storage never changes the derived
        // registry origin.
        const registry = new WorldDiscoverySourceRegistry();
        const publicationId = 'pub-retrieval-identity';
        const referenceOne = new ContentReference({ hash: reference.hash, uri: 'ipfs://locator-one' });
        const referenceTwo = new ContentReference({ hash: reference.hash, uri: 'ar://locator-two' });
        const firstRegistration = registerMaterializedSnapshotWorldSource(
            registry, placedResult(reference.hash, publicationId, { x: 1, y: 1, z: 1 }),
            new Publication({ id: publicationId, contentReference: referenceOne })
        );
        const secondRegistration = registerMaterializedSnapshotWorldSource(
            registry, placedResult(reference.hash, publicationId, { x: 1, y: 1, z: 1 }),
            new Publication({ id: publicationId, contentReference: referenceTwo })
        );
        assert(firstRegistration.origin === secondRegistration.origin, '3. changing only the locator/storage never changes the derived World registry origin');
        assert(registry.listSources().length === 1, '4. re-registering under a changed locator is a harmless, idempotent replacement — never a second World object');

        // RENDER: the rendered encounter carries no locator/storage/
        // contentReference field of any kind.
        const view = describeWorldFromDiscoveryRegistry(registry);
        const [encounter] = view.publications;
        assert(!('locator' in encounter) && !('uri' in encounter) && !('storage' in encounter) && !('contentReference' in encounter),
            '5. the rendered encounter carries no retrieval-identity field of any kind');

        console.log('✓ Section C: retrieval identity — locator/storage never becomes a second World object identity, from resolution through to the rendered encounter');
    }

    // ---------------------------------------------------------------
    // Section D — discovery identity: a Nostr event's own id never
    // survives past the query service into a candidate, and never alters
    // contentHash/publicationId/position for two differently announced
    // routes to the identical content.
    // ---------------------------------------------------------------
    {
        // Two Nostr events, each with a genuinely distinct `id`, announcing
        // the IDENTICAL Snapshot Discovery Envelope.
        const envelope = { protocol: 'forkbuild-snapshot-discovery', version: 1, contentHash: 'hash-discovery-identity', locator: 'ipfs://discovery-identity', storage: 'ipfs' };
        const eventOne = { id: 'a'.repeat(64), pubkey: 'p1', kind: 1, tags: [['t', 'tag-discovery-identity']], content: JSON.stringify(envelope), sig: 'sig-1' };
        const eventTwo = { id: 'b'.repeat(64), pubkey: 'p2', kind: 1, tags: [['t', 'tag-discovery-identity']], content: JSON.stringify(envelope), sig: 'sig-2' };
        assert(eventOne.id !== eventTwo.id, '1. sanity — the two announcing events genuinely have different ids');

        const service = new NostrSnapshotDiscoveryQueryService({ queryImpl: async () => [eventOne, eventTwo] });
        const candidates = await service.search('tag-discovery-identity');
        assert(candidates.length === 2, '2. both announcements are discovered');
        for (const candidate of candidates) {
            assert(!('id' in candidate) && !('eventId' in candidate) && !('pubkey' in candidate) && !('sig' in candidate),
                '3. THE STRUCTURAL FACT — a discovered candidate carries no Nostr event id (or pubkey/sig) at all; discovery identity never survives past the query service (failed for one candidate)');
        }
        assert(JSON.stringify(candidates[0]) === JSON.stringify(candidates[1]),
            '4. two events with different ids, announcing the identical envelope, produce STRUCTURALLY IDENTICAL candidates — the event id was never a distinguishing fact to begin with');

        // End to end: the SAME contentHash+publicationId, discovered
        // through two hosts whose own Arweave "transaction ids" (this
        // codebase's other decentralized announcement identity) differ,
        // still yields the identical contentHash/publicationId/position at
        // every downstream boundary.
        const placementRegistry = new LocalPlacementRegistry(new InMemoryStorageProvider());
        const publicationId = 'pub-discovery-identity';
        placeReal(placementRegistry, publicationId, new Position(7, 1, -7));
        const bytes = JSON.stringify({ world: { note: 'section-d-discovery' } });

        const registryOne = new WorldDiscoverySourceRegistry();
        const registryTwo = new WorldDiscoverySourceRegistry();
        const runOne = await runFullPipeline({ discoveryTag: 'discovery-identity-route-one', publicationId, bytes, position: new Position(7, 1, -7), placementRegistry, sharedRegistry: registryOne, txPrefix: 'route-one-tx' });
        const runTwo = await runFullPipeline({ discoveryTag: 'discovery-identity-route-two', publicationId, bytes, position: new Position(7, 1, -7), placementRegistry, sharedRegistry: registryTwo, txPrefix: 'route-two-tx' });

        assert(runOne.eventId !== runTwo.eventId, '5. sanity — the two routes were genuinely announced under different Nostr event ids');
        assert(runOne.reference.hash === runTwo.reference.hash, '6. sanity — both routes carry the identical content');
        assert(runOne.placement.contentHash === runTwo.placement.contentHash, '7. the two differently-announced routes resolve to the identical contentHash');
        assert(runOne.placement.publicationId === runTwo.placement.publicationId, '8. the two differently-announced routes resolve to the identical publicationId');
        assert(JSON.stringify(runOne.placement.position) === JSON.stringify(runTwo.placement.position), '9. the two differently-announced routes resolve to the identical position — the discovery event id never influenced any of it');
        assert(runOne.registration.origin === runTwo.registration.origin, '10. the two differently-announced routes derive the identical registry origin — origin is a function of contentHash+publicationId alone, never of which event announced it');

        console.log('✓ Section D: discovery identity — a Nostr event\'s own id never survives past the query service, and never alters contentHash/publicationId/position for two independently announced routes to the identical content');
    }

    // ---------------------------------------------------------------
    // Section E — registry origin: the central invariant 0.9.163 created.
    // ---------------------------------------------------------------
    {
        assert(materializedSnapshotWorldOrigin('hash-e', 'pub-e') === 'snapshot:hash-e:pub-e', '1. the origin scheme is exactly snapshot:<contentHash>:<publicationId>');

        // same contentHash + same publicationId -> same origin
        assert(materializedSnapshotWorldOrigin('hash-e', 'pub-e') === materializedSnapshotWorldOrigin('hash-e', 'pub-e'), '2. same contentHash + same publicationId -> same origin');

        // same contentHash + different publicationId -> different origin
        assert(materializedSnapshotWorldOrigin('hash-e', 'pub-e-1') !== materializedSnapshotWorldOrigin('hash-e', 'pub-e-2'), '3. same contentHash + different publicationId -> different origin');

        // different contentHash + same publicationId -> different origin
        assert(materializedSnapshotWorldOrigin('hash-e-1', 'pub-e') !== materializedSnapshotWorldOrigin('hash-e-2', 'pub-e'), '4. different contentHash + same publicationId -> different origin');

        // different contentHash + different publicationId -> different origin
        assert(materializedSnapshotWorldOrigin('hash-e-1', 'pub-e-1') !== materializedSnapshotWorldOrigin('hash-e-2', 'pub-e-2'), '5. different contentHash + different publicationId -> different origin');

        // Confirmed live against the real registry, not merely the pure
        // derivation function: re-registering the SAME pair is idempotent;
        // registering a DIFFERENT pair is never idempotent with it.
        const registry = new WorldDiscoverySourceRegistry();
        const publication = new Publication({ id: 'pub-e', title: 'Origin E' });
        registerMaterializedSnapshotWorldSource(registry, placedResult('hash-e', 'pub-e', { x: 0, y: 0, z: 0 }), publication);
        registerMaterializedSnapshotWorldSource(registry, placedResult('hash-e', 'pub-e', { x: 0, y: 0, z: 0 }), publication);
        assert(registry.listSources().length === 1, '6. same contentHash + same publicationId, registered twice, occupies exactly one registry slot');

        unregisterMaterializedSnapshotWorldSource(registry, 'hash-e', 'pub-e');
        assert(registry.listSources().length === 0, '7. the symmetric undo targets exactly the slot the matching pair created');

        console.log('✓ Section E: registry origin — same contentHash + same publicationId -> same origin; changing either alone -> a different origin');
    }

    // ---------------------------------------------------------------
    // Section F — spatial identity: retrieval/discovery metadata changing
    // never moves a Publication's position; a different Publication
    // naturally selects its OWN placement authority.
    // ---------------------------------------------------------------
    {
        const placementRegistry = new LocalPlacementRegistry(new InMemoryStorageProvider());
        placeReal(placementRegistry, 'pub-spatial-one', new Position(11, 2, -11));
        placeReal(placementRegistry, 'pub-spatial-two', new Position(-11, 2, 11));

        const placementInfoOne = placementInfoFor(placementRegistry, 'pub-spatial-one');
        const placementInfoTwo = placementInfoFor(placementRegistry, 'pub-spatial-two');

        // Retrieval/discovery metadata changing (locator, storage, and even
        // which materialization result is handed in) never moves the
        // resolved position — resolveSnapshotWorldPlacement() only ever
        // reads placementInfo.position.
        const placedViaLocatorOne = resolveSnapshotWorldPlacement(materializedResult('hash-spatial-one', 'ipfs://locator-one'), placementInfoOne);
        const placedViaLocatorTwo = resolveSnapshotWorldPlacement(materializedResult('hash-spatial-one', 'ar://an-entirely-different-locator'), placementInfoOne);
        assert(JSON.stringify(placedViaLocatorOne.position) === JSON.stringify(placedViaLocatorTwo.position),
            '1. changing only the materialization\'s own locator never moves the resolved position');

        // A DIFFERENT Publication naturally selects its OWN placement
        // authority — never another Publication's.
        const placedOne = resolveSnapshotWorldPlacement(materializedResult('hash-spatial-shared'), placementInfoOne);
        const placedTwo = resolveSnapshotWorldPlacement(materializedResult('hash-spatial-shared'), placementInfoTwo);
        assert(placedOne.position.x === 11 && placedOne.position.z === -11, '2. Publication one resolves against its OWN placement authority');
        assert(placedTwo.position.x === -11 && placedTwo.position.z === 11, '3. Publication two resolves against ITS OWN, entirely different placement authority — even sharing one contentHash');
        assert(JSON.stringify(placedOne.position) !== JSON.stringify(placedTwo.position), '4. the two positions are never reconciled or averaged — each Publication\'s own authority survives independently');

        // Confirmed live in the registry/render layer: registering both
        // under the shared contentHash produces two encounters at two
        // distinct positions.
        const registry = new WorldDiscoverySourceRegistry();
        registerMaterializedSnapshotWorldSource(registry, placedOne, new Publication({ id: 'pub-spatial-one', title: 'Spatial One' }));
        registerMaterializedSnapshotWorldSource(registry, placedTwo, new Publication({ id: 'pub-spatial-two', title: 'Spatial Two' }));
        const view = describeWorldFromDiscoveryRegistry(registry);
        const encounterOne = view.publications.find((p) => p.objectId === 'pub-spatial-one');
        const encounterTwo = view.publications.find((p) => p.objectId === 'pub-spatial-two');
        assert(encounterOne.x === 11 && encounterOne.z === -11, '5. the rendered encounter for Publication one carries ITS OWN position');
        assert(encounterTwo.x === -11 && encounterTwo.z === 11, '6. the rendered encounter for Publication two carries ITS OWN, different position');

        console.log('✓ Section F: spatial identity — retrieval metadata changing never moves a position; a different Publication always selects its own placement authority');
    }

    // ---------------------------------------------------------------
    // Section G — rendering identity: the renderer always receives
    // objectId = publication.id, never contentHash/origin/locator/eventId.
    // ---------------------------------------------------------------
    {
        const contentHash = 'hash-render-identity';
        const publicationId = 'pub-render-identity';
        const reference = new ContentReference({ hash: contentHash, uri: 'ipfs://render-identity-locator' });
        const publication = new Publication({ id: publicationId, title: 'Render Identity', contentReference: reference });

        const registry = new WorldDiscoverySourceRegistry();
        const registration = registerMaterializedSnapshotWorldSource(registry, placedResult(contentHash, publicationId, { x: 3, y: 0, z: 3 }), publication);
        const expectedOrigin = materializedSnapshotWorldOrigin(contentHash, publicationId);
        assert(registration.origin === expectedOrigin, '1. sanity — the registered origin is exactly the documented derivation');

        const canvas = buildCanvasInstance({ registry });
        mountCanvas(canvas);
        const [marker] = projectedPublicationsOf(canvas);

        assert(marker.objectId === publicationId, '2. the rendered marker\'s objectId IS the Publication\'s own id');
        assert(marker.objectId !== contentHash, '3. objectId is never the contentHash');
        assert(marker.objectId !== expectedOrigin, '4. objectId is never the derived registry origin');
        assert(marker.objectId !== reference.uri, '5. objectId is never the locator');
        assert(!('origin' in marker) && !('contentHash' in marker) && !('locator' in marker), '6. the projected marker exposes none of contentHash/origin/locator as fields of its own');

        const { emitted } = markerGlyphAndSelection(marker);
        assert(emitted.payload.objectId === publicationId, '7. selecting the rendered marker reports the Publication\'s own id, never any other identity');

        unmountCanvas(canvas);
        console.log('✓ Section G: rendering identity — the renderer always receives objectId = publication.id, never contentHash/origin/locator');
    }

    // ---------------------------------------------------------------
    // Section H — full-path identity preservation: the real, unmodified
    // pipeline, run end to end, with every identity captured at every
    // boundary.
    // ---------------------------------------------------------------
    {
        const placementRegistry = new LocalPlacementRegistry(new InMemoryStorageProvider());
        const publicationId = 'pub-full-path';
        const position = new Position(17, 5, -9);
        const bytes = JSON.stringify({ world: { buildings: [{ id: 'full-path-building', bricks: 3 }] } });
        const sharedRegistry = new WorldDiscoverySourceRegistry();

        const canvas = buildCanvasInstance({ registry: sharedRegistry });
        mountCanvas(canvas);
        assert(projectedPublicationsOf(canvas).length === 0, '1. before this Publication is registered, the already-mounted canvas shows nothing for it');

        const captured = await runFullPipeline({ discoveryTag: 'full-path-audit', publicationId, bytes, position, placementRegistry, sharedRegistry });

        // Boundary-by-boundary identifier capture.
        assert(captured.candidate.contentHash === captured.reference.hash, '2. CANDIDATE boundary — the discovered candidate\'s contentHash is exactly the announced content\'s own hash');
        assert(!('publicationId' in captured.candidate) && !('eventId' in captured.candidate) && !('id' in captured.candidate),
            '3. CANDIDATE boundary — the candidate carries no publicationId, no eventId — discovery never invents a Publication or discovery identity of its own');

        assert(captured.resolution.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, '4. RESOLVE/VERIFY boundary — the candidate genuinely resolved and verified');
        assert(captured.resolution.candidates[0].contentHash === captured.reference.hash, '5. RESOLVE boundary — the resolution\'s own attempted candidate still names the identical contentHash');

        assert(captured.attribution.outcome === SnapshotPublicationAttributionOutcome.MATCH, '6. ATTRIBUTE boundary — the verified Snapshot matches this Publication\'s own declared contentReference.hash');
        assert(captured.attribution.snapshotHash === captured.reference.hash, '7. ATTRIBUTE boundary — the recomputed snapshotHash is exactly the content identity, never a locator or publicationId');

        assert(captured.materialization.contentHash === captured.reference.hash, '8. MATERIALIZE boundary — materialization\'s own contentHash is unchanged from the resolved candidate\'s');
        assert(captured.materialization.contentReference.hash === captured.reference.hash, '9. MATERIALIZE boundary — the newly possessed contentReference carries the identical hash, never a re-derived one');

        assert(captured.placement.outcome === SnapshotWorldPlacementOutcome.PLACED, '10. PLACE boundary — placement succeeded against the pre-existing WorldPlacement');
        assert(captured.placement.publicationId === publicationId, '11. PLACE boundary — the placement result names exactly this Publication, never substituted');
        assert(captured.placement.contentHash === captured.reference.hash, '12. PLACE boundary — placement carries the SAME contentHash forward, unre-derived');
        assert(captured.placement.position.x === 17 && captured.placement.position.y === 5 && captured.placement.position.z === -9, '13. PLACE boundary — the position is exactly the pre-existing authoritative WorldPlacement\'s own');

        assert(captured.registration.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, '14. REGISTER boundary — registration succeeded');
        assert(captured.registration.origin === `snapshot:${captured.reference.hash}:${publicationId}`, '15. REGISTER boundary — the origin is exactly contentHash AND publicationId, together, per 0.9.163');
        assert(captured.registration.contentHash === captured.reference.hash, '16. REGISTER boundary — the registration result\'s own contentHash is unchanged');

        // WORLD RUNTIME / RENDER boundary — the already-mounted canvas
        // observes the registration with zero further action.
        const projected = projectedPublicationsOf(canvas);
        assert(projected.length === 1, '17. WORLD RUNTIME boundary — the already-mounted canvas now shows exactly this one Publication');
        const [marker] = projected;
        assert(marker.objectId === publicationId, '18. RENDER boundary — the marker\'s objectId is the Publication\'s id');
        assert(marker.objectId !== captured.reference.hash, '19. RENDER boundary — objectId is never the contentHash');
        assert(marker.objectId !== captured.registration.origin, '20. RENDER boundary — objectId is never the registry origin');
        assert(marker.objectId !== captured.eventId, '21. RENDER boundary — objectId is never the discovering Nostr event\'s own id');

        // Cross-boundary sweep — objectId IS publicationId, by design (see
        // Section G) — that is the ONE deliberate equality in this model.
        // Every OTHER pairing among the remaining five identities
        // (contentHash, locator, eventId, publicationId, origin) must never
        // collide.
        assert(marker.objectId === publicationId, '22. the one deliberate equality in this model — objectId IS publicationId, never a coincidence, never any other identity');
        const identities = {
            contentHash: captured.reference.hash,
            locator: captured.reference.uri,
            eventId: captured.eventId,
            publicationId,
            origin: captured.registration.origin
        };
        const values = Object.values(identities);
        for (let i = 0; i < values.length; i++) {
            for (let j = i + 1; j < values.length; j++) {
                assert(values[i] !== values[j], `23. no two of the five remaining distinct identities are ever equal — ${Object.keys(identities)[i]} ('${values[i]}') collided with ${Object.keys(identities)[j]} ('${values[j]}')`);
            }
        }

        unmountCanvas(canvas);
        console.log('✓ Section H: full-path identity preservation — DISCOVER through RENDER, captured at every boundary, with no silent substitution of one identity for another');
    }

    // ---------------------------------------------------------------
    // Section I — THE ADVERSARIAL MATRIX: two Publications, identical
    // content, different locators, different discovery routes, different
    // positions, run through the REAL pipeline twice.
    // ---------------------------------------------------------------
    {
        const placementRegistry = new LocalPlacementRegistry(new InMemoryStorageProvider());
        const bytes = JSON.stringify({ world: { note: 'shared-adversarial-content' } });

        const publicationIdA = 'pub-matrix-a';
        const publicationIdB = 'pub-matrix-b';
        const positionA = new Position(25, 0, 25);
        const positionB = new Position(-25, 0, -25);

        const sharedRegistry = new WorldDiscoverySourceRegistry();

        const runA = await runFullPipeline({
            discoveryTag: 'adversarial-matrix-route-a', publicationId: publicationIdA, bytes,
            position: positionA, placementRegistry, sharedRegistry, txPrefix: 'matrix-tx-a'
        });
        const runB = await runFullPipeline({
            discoveryTag: 'adversarial-matrix-route-b', publicationId: publicationIdB, bytes,
            position: positionB, placementRegistry, sharedRegistry, txPrefix: 'matrix-tx-b'
        });

        // Preconditions the scenario itself depends on.
        assert(runA.reference.hash === runB.reference.hash, '1. sanity — both Publications genuinely share one contentHash');
        assert(runA.reference.uri !== runB.reference.uri, '2. sanity — the two routes genuinely differ in locator (independent Arweave placements)');
        assert(runA.eventId !== runB.eventId, '3. sanity — the two routes were genuinely announced under different Nostr events');
        assert(runA.registration.origin !== runB.registration.origin, '4. origin A !== origin B — the two Publications occupy independent registry slots');
        assert(runA.publication.id !== runB.publication.id, '5. objectId A !== objectId B (checked below via the rendered marker)');

        // THE FLAGSHIP ASSERTION — the final World contains BOTH,
        // independently placed, independently registered.
        const view = describeWorldFromDiscoveryRegistry(sharedRegistry);
        assert(view.publications.length === 2, `6. THE FLAGSHIP — the World contains BOTH Publications, never collapsed into one; got ${view.publications.length}`);

        const encounterA = view.publications.find((p) => p.objectId === publicationIdA);
        const encounterB = view.publications.find((p) => p.objectId === publicationIdB);
        assert(encounterA && encounterB, '7. both Publications are present under their own distinct objectId');
        assert(encounterA.x === 25 && encounterA.z === 25, '8. Publication A -> POS-A, exactly, unaffected by B\'s presence');
        assert(encounterB.x === -25 && encounterB.z === -25, '9. Publication B -> POS-B, exactly, unaffected by A\'s presence');

        // Rendered through the real, mounted, unmodified canvas too.
        const canvas = buildCanvasInstance({ registry: sharedRegistry });
        mountCanvas(canvas);
        const projected = projectedPublicationsOf(canvas);
        assert(projected.length === 2, '10. both Publications render as two distinct markers through the real, unmodified canvas');
        const markerA = projected.find((p) => p.objectId === publicationIdA);
        const markerB = projected.find((p) => p.objectId === publicationIdB);
        assert(markerA.objectId !== markerB.objectId, '11. objectId A !== objectId B');
        unmountCanvas(canvas);

        console.log('✓ Section I: THE ADVERSARIAL MATRIX — two Publications sharing identical content, different locators, different discovery routes, and different positions both remain independently placed and encounterable, with origin A !== origin B and objectId A !== objectId B throughout');
    }

    // ---------------------------------------------------------------
    // Section J — structural sweep: no SnapshotIdentity/WorldSnapshot class
    // exists anywhere; no dedup/reconciliation/merge/trust/ranking
    // vocabulary was added; this milestone adds no production file.
    // ---------------------------------------------------------------
    {
        const productionDirectories = ['application', 'core', 'ui', 'peer', 'publisher', 'placement', 'content', 'storage', 'serializer'];
        const forbiddenClassPattern = /class\s+(SnapshotIdentity|WorldSnapshot)\b/;
        for (const dir of productionDirectories) {
            const entries = await collectJsFiles(new URL(`../${dir}/`, import.meta.url));
            for (const relativePath of entries) {
                const source = await readFile(relativePath, 'utf8');
                assert(!forbiddenClassPattern.test(source), `1. no 'SnapshotIdentity' or 'WorldSnapshot' aggregate class exists anywhere in production code (failed for ${relativePath})`);
            }
        }

        // The identity-bearing files this audit itself is about, swept for
        // vocabulary this milestone was told never to introduce.
        const filesToSweep = [
            '../application/MaterializedSnapshotWorldDiscoveryBridge.js',
            '../application/SnapshotWorldPlacement.js',
            '../application/SnapshotPublicationAttribution.js',
            '../core/WorldDiscoverySourceAssembly.js',
            '../application/WorldDiscoverySourceRegistry.js',
            '../core/WorldEncounter.js',
            '../application/WorldDiscoveryRegistryProjection.js'
        ];
        for (const relativePath of filesToSweep) {
            const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
            const codeOnly = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
            assert(!/dedup|reconcil|merge\(|trust|ranking|priorit/i.test(codeOnly), `2. ${relativePath} contains no deduplication/reconciliation/merge/trust/ranking/prioritization vocabulary in its own executable code (failed for ${relativePath})`);
        }

        // materializedSnapshotWorldOrigin() stays a pure derivation over two
        // already-computed facts — never a constructor, never a class, never
        // something a caller could new up as a first-class identity object.
        assert(typeof materializedSnapshotWorldOrigin('h', 'p') === 'string', '3. materializedSnapshotWorldOrigin() returns a plain string, never an object/class instance');

        console.log('✓ Section J: structural sweep — no SnapshotIdentity/WorldSnapshot class exists anywhere; no dedup/reconciliation/merge/trust/ranking vocabulary was introduced by this milestone');
    }

    console.log('\n✅ All Snapshot World Source Identity Audit tests passed.');
}

// Recursively collects every `.js` file under `dirUrl`, skipping nothing —
// this audit's own structural sweep intentionally covers all of
// production code, not a hand-picked subset.
async function collectJsFiles(dirUrl) {
    const entries = await readdir(dirUrl, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const entryUrl = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dirUrl);
        if (entry.isDirectory()) {
            files.push(...await collectJsFiles(entryUrl));
        } else if (entry.name.endsWith('.js')) {
            files.push(entryUrl);
        }
    }
    return files;
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
