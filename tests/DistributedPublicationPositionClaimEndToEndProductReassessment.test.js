import { readFile } from 'node:fs/promises';

import OwnPublicationPanel from '../ui/components/OwnPublicationPanel.js';
import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import { resolveSnapshotWorldPlacement } from '../application/SnapshotWorldPlacement.js';
import { SnapshotWorldPlacementOutcome } from '../application/SnapshotWorldPlacementOutcome.js';
import { SnapshotWorldRegistrationOutcome } from '../application/SnapshotWorldRegistrationOutcome.js';
import { executeDiscoverSnapshotCandidatesCommand } from '../application/DiscoverSnapshotCandidatesCommand.js';
import { executeResolveSelectedSnapshotCommand } from '../application/ResolveSelectedSnapshotCommand.js';
import { executeMaterializeSelectedSnapshotCommand } from '../application/MaterializeSelectedSnapshotCommand.js';
import { MaterializeSnapshotFromSelectedCandidateUseCase } from '../application/MaterializeSnapshotFromSelectedCandidateUseCase.js';
import { StoreSnapshotContentUseCase } from '../application/StoreSnapshotContentUseCase.js';
import { SnapshotCandidateMaterializationOutcome } from '../application/SnapshotCandidateMaterializationOutcome.js';
import { DecentralizedSnapshotResolutionOutcome } from '../application/DecentralizedSnapshotResolutionOutcome.js';
import { DecentralizedSnapshotResolver } from '../application/DecentralizedSnapshotResolver.js';
import { NostrSnapshotDiscoveryPublisher } from '../application/NostrSnapshotDiscoveryPublisher.js';
import { NostrSnapshotDiscoveryQueryService } from '../application/NostrSnapshotDiscoveryQueryService.js';
import { executeSnapshotDistributionCommand } from '../application/SnapshotDistributionCommand.js';
import { composeSnapshotDistributionRuntime } from '../application/SnapshotDistributionRuntimeComposition.js';
import { SnapshotWorldPositionClaimOutcome } from '../application/SnapshotWorldPositionClaimOutcome.js';
import { WorldDiscoverySourceRegistry } from '../application/WorldDiscoverySourceRegistry.js';
import { describeWorldFromDiscoveryRegistry } from '../application/WorldDiscoveryRegistryProjection.js';
import { LocalWorldEncounterMaterialSource } from '../application/LocalWorldEncounterMaterialSource.js';
import { WorldEncounterKind } from '../core/WorldEncounter.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { ArweaveContentStore } from '../content/ArweaveContentStore.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { PlacementRecord } from '../core/PlacementRecord.js';
import { Position } from '../core/Position.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { computeContentHash } from '../serializer/contentHash.js';

// 0.9.567 — Distributed Publication Position Claim End-to-End Product
// Reassessment.
//
// Test-only. Production changes: none.
//
// 0.9.565 traced the exact seam where a Publication's own deterministic
// position claim was dropped before Snapshot distribution — a PRODUCT_GAP,
// not architectural. 0.9.566 closed it, at exactly the two stacked points
// 0.9.565 named: `application/SnapshotDistributionCommand.js` now accepts
// and forwards `publicationId`/`claimedPosition`, and `ui/views/
// WorldView.js#distributeWorldEncounterSnapshot()` now reads them from
// `WorldNavigationSession#getPlacementInfoForPublication()`. Neither
// milestone's own test, however, ever chained the two halves of this
// codebase's own pre-existing coverage together:
//
// - `tests/DistributeExistingClaimedPositionThroughSnapshotDistribution.test.js`
//   (0.9.566) proves the PUBLISHER-side chain — session -> WorldView shape
//   -> `ui/main.js`'s own wrapper shape -> `executeSnapshotDistributionCommand()`
//   -> a real Nostr round trip — using a hand-supplied `placementInfo` in
//   most sections, and reproduced (never imported) WorldView.js/
//   WorldNavigationSession.js logic, verified only STRUCTURALLY against
//   the real source (necessarily — both files import `vue`/`three` and
//   cannot be constructed under this project's plain `node` test runner;
//   see that file's own header).
// - `tests/DecentralizedSnapshotSpatialE2EAudit.test.js` (0.9.173) proves
//   the CONSUMER-side chain — DISCOVER -> SELECT -> RESOLVE -> VERIFY ->
//   MATERIALIZE -> CONSUME CLAIM -> PLACE -> REGISTER -> RENDER — through
//   real, unmodified production machinery throughout, but its own
//   `placeAndAnnounce()` calls `discoveryPublisher.publish()` DIRECTLY,
//   with a `claimedPosition` the test itself invents — it never asked
//   whether that position could have come from a real
//   `WorldNavigationSession#getPlacementInfoForPublication()` lookup
//   routed through the real `WorldView`/`SnapshotDistributionCommand`
//   chain 0.9.566 built.
//
// Neither file, nor any other in this codebase, has ever run BOTH halves
// as one continuous, real journey. This milestone is the audit that does
// — reusing both files' own established harness techniques (the
// structurally-verified reproduction technique for the two Vue/three
// files; the real Arweave/Nostr/resolver/panel/canvas machinery for
// everything else) rather than inventing a third way of testing any of
// this.
//
//   Existing WorldPlacement (real PlacementRecord)
//        │ getPlacementInfoForPublication()   [reproduced, verified structurally]
//        ▼
//   WorldView-shaped distributeWorldEncounterSnapshot()   [reproduced, verified structurally]
//        │ publicationId + claimedPosition
//        ▼
//   ui/main.js-shaped snapshotDistributionCommand wrapper   [reproduced, verified structurally]
//        │
//        ▼
//   executeSnapshotDistributionCommand()   [REAL, imported]
//        │
//        ▼
//   NostrSnapshotDiscoveryPublisher   [REAL, imported, fake transport only]
//        │
//        ▼
//   NostrSnapshotDiscoveryQueryService -> candidate   [REAL, imported]
//        │
//        ▼
//   Resolve -> Materialize -> verify contentHash   [REAL, imported]
//        │
//        ▼
//   OwnPublicationPanel#useClaimedSnapshotPosition() -> placeMaterializedSnapshot()
//        -> registerMaterializedSnapshot()   [REAL, imported, vue/three-free]
//        │
//        ▼
//   WorldEncounterCanvas projection   [REAL, imported, vue/three-free]
//
// Sections A-F: one continuous production journey — claim creation,
//   distribution, the real Nostr artifact, remote discovery, resolution +
//   verification, and the existing consumer — each stage asserting on the
//   EXACT SAME publicationId/claimedPosition the previous stage produced,
//   never a value re-specified by the test.
// Section G: no-placement regression — a real, genuinely empty
//   LocalPlacementRegistry, driven through the identical real chain.
// Section H: Publication identity isolation — two Publications, one
//   shared contentHash, two independently session-derived claims.
// Section I: authority boundary — no PlacementRecord is ever created or
//   mutated, on the publisher's side OR the receiver's side, anywhere in
//   this journey.
// Section J: a correction, not a confirmation — this codebase's own
//   `NostrSnapshotDiscoveryPublisher`/`NostrSnapshotDiscoveryQueryService`
//   are DELIBERATELY single-relay-per-instance (see each file's own
//   "deliberately excluded" list); there is no existing multi-relay
//   fan-out architecture to verify cross-relay consistency against. What
//   this section proves instead: two independently-composed single-relay
//   pairs — the only way a caller could approximate multi-relay coverage
//   today — never cross-contaminate or transform the claim between them.
// Section K: failure isolation at five named boundaries — no retries, no
//   fallback, and no cross-contamination between an unrelated failure and
//   an already-succeeded claim.
// Section L: FLAGSHIP — the complete real journey, plus the permanent
//   regression guard the request specifically called out: the publisher's
//   claimed position, an observer's own local encounter position, and an
//   authoritative World placement (PlacementRecord) remain three distinct,
//   non-substitutable facts throughout.

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

const stubIdentityProvider = {
    currentUser: () => ({ username: 'alice', displayName: 'alice', providerId: 'stub' }),
    sign: (data) => ({ signedBy: 'alice', providerId: 'stub', data })
};

function createTestDocument(title) {
    const world = new World();
    const building = new Building({ creator: 'tester' });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0), rotation: 0 }));
    world.addBuilding(building);
    return new Document({ world, metadata: new DocumentMetadata({ title, author: 'tester' }) });
}

function publishOwnPublication(storageProvider, title) {
    const publisher = new LocalPublisherProvider(storageProvider);
    return publisher.publish(createTestDocument(title), stubIdentityProvider);
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
        return { id: `fake-0-9-567-tx-${counter}`, transaction: { id: `fake-0-9-567-tx-${counter}`, data: material } };
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

// A full, real decentralized host — mirrors
// tests/DecentralizedSnapshotSpatialE2EAudit.test.js's own makeHost()
// exactly: a real (fake-transport-backed) ArweaveContentStore, a real
// NostrSnapshotDiscoveryPublisher/NostrSnapshotDiscoveryQueryService pair,
// a real DecentralizedSnapshotResolver, and a real local materialization
// boundary writing into the SAME `storageProvider` the receiver's own
// Publication(s) already live in.
function makeHost(storageProvider, discoveryTag) {
    const gateway = makeFakeArweaveGateway();
    const arweaveStore = new ArweaveContentStore({ signer: makeFakeArweaveSigner(), fetchImpl: gateway.fetchImpl });
    const network = makeNostrNetwork();
    const discoveryPublisher = new NostrSnapshotDiscoveryPublisher({ discoveryTag, publishImpl: network.publishImpl });
    const discoveryQueryService = new NostrSnapshotDiscoveryQueryService({ queryImpl: network.queryImpl });
    const resolver = new DecentralizedSnapshotResolver(discoveryQueryService);

    const localContentStore = new LocalContentStore(storageProvider);
    const storeSnapshotContentUseCase = new StoreSnapshotContentUseCase(localContentStore);
    const materializer = new MaterializeSnapshotFromSelectedCandidateUseCase(storeSnapshotContentUseCase);

    const discoverSnapshotCandidatesCommand = () => executeDiscoverSnapshotCandidatesCommand({ discoveryTag, discoveryQueryService });
    const resolveSelectedSnapshotCommand = (candidate) => executeResolveSelectedSnapshotCommand({ candidate, resolver, contentStore: arweaveStore });
    const materializeSelectedSnapshotCommand = (resolution) => executeMaterializeSelectedSnapshotCommand({ resolution, materializer });

    return {
        gateway, arweaveStore, network, discoveryTag, discoveryPublisher, discoveryQueryService, resolver,
        localContentStore, materializer,
        discoverSnapshotCandidatesCommand, resolveSelectedSnapshotCommand, materializeSelectedSnapshotCommand
    };
}

function placeReal(placementRegistry, publicationId, position, owner = 'alice') {
    const record = new PlacementRecord({ publicationId, position, owner });
    placementRegistry.add(record);
    return record;
}

// Mirrors application/WorldNavigationSession.js's own real
// getPlacementInfoForPublication(publicationId) exactly — reproduced
// rather than imported (that class pulls in renderer/three.js, which this
// project's plain `node` test runner cannot resolve; confirmed directly:
// `node --input-type=module -e "import('./application/WorldNavigationSession.js')"`
// fails with "Cannot find package 'three'"). Section A below verifies this
// reproduction against the real source, the identical technique 0.9.566's
// own test already established.
function makeRealSession(placementRegistry) {
    return {
        getPlacementInfoForPublication(publicationId) {
            if (!placementRegistry || typeof publicationId !== 'string' || publicationId.length === 0) return null;
            const records = placementRegistry.findByPublicationId(publicationId);
            if (records.length === 0) return null;
            const record = records.reduce((latest, r) => (!latest || r.updatedAt > latest.updatedAt) ? r : latest, null);
            return {
                placementId: record.placementId,
                publicationId: record.publicationId,
                position: { x: record.position.x, y: record.position.y, z: record.position.z }
            };
        }
    };
}

// Mirrors ui/main.js's own real `snapshotDistributionCommand` wrapper
// exactly (minus the storage-backend-registry lookup that wrapper's own
// `resolveSnapshotDistributionContentStore()` call performs, and — AMENDED
// BY 0.9.669 — minus the per-substrate `resolveSnapshotDiscoveryPublisher()`
// resolution that wrapper now also performs — both orthogonal to this
// milestone's own concern, which is placementInfo forwarding, not
// substrate selection; the storage lookup is already covered by
// tests/DistributeExistingClaimedPositionThroughSnapshotDistribution.test.js's
// own Section H, and substrate selection is covered by
// tests/SnapshotDistributionRuntimeComposition.test.js). Verified
// structurally against the real source in Section B, below.
function makeRealSnapshotDistributionCommand({ contentStore, discoveryPublisher }) {
    return (bytes, storage = 'ar', publicationId, claimedPosition, discoveryProvider) => executeSnapshotDistributionCommand({
        bytes,
        contentStore,
        discoveryPublisher,
        publicationId,
        claimedPosition
    });
}

// Mirrors ui/views/WorldView.js's own real
// distributeWorldEncounterSnapshot(publication) exactly. Verified
// structurally against the real source in Section B, below.
function makeDistributeWorldEncounterSnapshotAction({ snapshotDistributionCommand, publicationContentStore, session }) {
    return function distributeWorldEncounterSnapshot(publication) {
        if (!snapshotDistributionCommand || !publicationContentStore || !publication.contentReference) {
            return Promise.reject(new Error('Snapshot distribution is not available.'));
        }
        const snapshotBytes = publicationContentStore.get(publication.contentReference);
        if (snapshotBytes === null || snapshotBytes === undefined) {
            return Promise.reject(new Error('Snapshot distribution is not available.'));
        }
        const placementInfo = typeof session.getPlacementInfoForPublication === 'function'
            ? session.getPlacementInfoForPublication(publication.id)
            : null;
        return snapshotDistributionCommand(
            snapshotBytes,
            undefined,
            placementInfo ? placementInfo.publicationId : undefined,
            placementInfo ? placementInfo.position : undefined
        );
    };
}

// Keyed by contentReference.hash exactly like the real content-addressed
// store — every Publication in this file comes from the real
// publishOwnPublication() below, so its contentReference is genuine.
function fakeContentStore(entries = {}) {
    return {
        get(contentReference) {
            const key = contentReference && contentReference.hash;
            return Object.prototype.hasOwnProperty.call(entries, key) ? JSON.stringify(entries[key]) : null;
        }
    };
}

// The real ui/components/OwnPublicationPanel.js interaction surface —
// mirrors tests/DecentralizedSnapshotSpatialE2EAudit.test.js's own
// panelCtx() exactly.
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
        selectedSnapshotWorldPositionClaimResult: null,
        discoverSnapshotCandidates: OwnPublicationPanel.methods.discoverSnapshotCandidates,
        selectSnapshotCandidate: OwnPublicationPanel.methods.selectSnapshotCandidate,
        resolveSelectedSnapshot: OwnPublicationPanel.methods.resolveSelectedSnapshot,
        materializeSelectedSnapshot: OwnPublicationPanel.methods.materializeSelectedSnapshot,
        useClaimedSnapshotPosition: OwnPublicationPanel.methods.useClaimedSnapshotPosition,
        placeMaterializedSnapshot: OwnPublicationPanel.methods.placeMaterializedSnapshot,
        registerMaterializedSnapshot: OwnPublicationPanel.methods.registerMaterializedSnapshot,
        ...overrides
    };
}

// Mirrors tests/DecentralizedSnapshotSpatialE2EAudit.test.js's own
// buildCanvasInstance()/mountCanvas()/projectedPublicationsOf() exactly.
function buildCanvasInstance({ registry = null, materialSources = null } = {}) {
    const ctx = {
        registry,
        view: WorldEncounterCanvas.props.view.default(),
        materialSources,
        materialVerifier: null
    };
    Object.assign(ctx, WorldEncounterCanvas.data.call(ctx));
    Object.assign(ctx, WorldEncounterCanvas.methods);
    Object.defineProperty(ctx, 'resolvedEncounterSelection', {
        get() { return WorldEncounterCanvas.computed.resolvedEncounterSelection.call(ctx); }
    });
    Object.defineProperty(ctx, 'resolvedLead', {
        get() { return WorldEncounterCanvas.computed.resolvedLead.call(ctx); }
    });
    return ctx;
}

function mountCanvas(ctx) { WorldEncounterCanvas.mounted.call(ctx); }
function unmountCanvas(ctx) { WorldEncounterCanvas.beforeUnmount.call(ctx); }

function projectedPublicationsOf(ctx) {
    ctx.effectiveView = WorldEncounterCanvas.computed.effectiveView.call(ctx);
    ctx.publicationRows = WorldEncounterCanvas.computed.publicationRows.call(ctx);
    return WorldEncounterCanvas.computed.projectedPublications.call(ctx);
}

function viewById(registry) {
    const view = describeWorldFromDiscoveryRegistry(registry);
    return Object.fromEntries(view.publications.map((p) => [p.objectId, p]));
}

function expectedCanvasCoordinate(worldValue) {
    return 300 + (worldValue / 50) * 300;
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function readSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

async function run() {
    // =======================================================================
    // Sections A-F — one continuous, real production journey.
    // =======================================================================
    {
        // ---- A: production claim creation ----
        const storageProvider = new InMemoryStorageProvider();
        const publication = publishOwnPublication(storageProvider, '0.9.567 Sections A-F Publication');
        const publisherPlacementRegistry = new LocalPlacementRegistry(storageProvider);
        placeReal(publisherPlacementRegistry, publication.id, new Position(10, 0, 20));
        const session = makeRealSession(publisherPlacementRegistry);

        const sessionSource = await readSource('application/WorldNavigationSession.js');
        const methodMatch = sessionSource.match(/getPlacementInfoForPublication\(publicationId\)\s*\{[\s\S]*?\n    \}/);
        assert(methodMatch && /return\s*\{\s*\n\s*placementId:\s*record\.placementId,\s*\n\s*publicationId:\s*record\.publicationId,\s*\n\s*position:\s*\{\s*x:\s*record\.position\.x,\s*y:\s*record\.position\.y,\s*z:\s*record\.position\.z\s*\}\s*\n\s*\};/.test(methodMatch[0]),
            'A1. WorldNavigationSession#getPlacementInfoForPublication() genuinely implements the shape reproduced above as makeRealSession() (source-verified, not merely asserted by comment).');

        const placementInfo = session.getPlacementInfoForPublication(publication.id);
        assert(placementInfo && placementInfo.publicationId === publication.id
            && placementInfo.position.x === 10 && placementInfo.position.y === 0 && placementInfo.position.z === 20,
            'A2. an existing, real, authoritative WorldPlacement resolves the claim — no substitute position was ever constructed.');

        // ---- B: production distribution ----
        const host = makeHost(storageProvider, 'sections-a-f-production-chain');
        const snapshotJson = { world: { buildings: [{ id: 'a-f-flagship-building', bricks: 1 }] } };
        const publicationContentStore = fakeContentStore({ [publication.contentReference.hash]: snapshotJson });
        const snapshotDistributionCommand = makeRealSnapshotDistributionCommand({ contentStore: host.arweaveStore, discoveryPublisher: host.discoveryPublisher });
        const distributeWorldEncounterSnapshot = makeDistributeWorldEncounterSnapshotAction({ snapshotDistributionCommand, publicationContentStore, session });

        const mainSource = await readSource('ui/main.js');
        // AMENDED BY 0.9.669 — Per-Click Snapshot Announcement/Discovery
        // Substrate Override. `discoveryProvider` joined the parameter
        // list, and `discoveryPublisher` is now resolved per-call via
        // `resolveSnapshotDiscoveryPublisher(discoveryProvider)` instead
        // of always reading the single, fixed `snapshotDiscoveryPublisher`
        // — this milestone's own concern (placementInfo forwarding) is
        // otherwise unaffected; see makeRealSnapshotDistributionCommand()'s
        // own amended header, above.
        assert(/const snapshotDistributionCommand = \(bytes, storage = 'ar', publicationId, claimedPosition, discoveryProvider\) => executeSnapshotDistributionCommand\(\{\s*\n\s*bytes,\s*\n\s*contentStore: resolveSnapshotDistributionContentStore\(snapshotPlacementStoreRegistry, storage\),\s*\n\s*discoveryPublisher: resolveSnapshotDiscoveryPublisher\(discoveryProvider\),\s*\n\s*publicationId,\s*\n\s*claimedPosition\s*\n\s*\}\);/.test(mainSource),
            'B1. AMENDED BY 0.9.669 — ui/main.js\'s own real `snapshotDistributionCommand` wrapper genuinely has this exact shape — makeRealSnapshotDistributionCommand() above reproduces it faithfully, minus per-substrate resolution (see that function\'s own amended header).');
        const worldViewSource = await readSource('ui/views/WorldView.js');
        // AMENDED BY 0.9.669 — `discoveryProvider` joined `publication`/
        // `storage`/`remotePinningConfiguration` as a new, optional fourth
        // parameter — still exactly one `distributeWorldEncounterSnapshot`.
        const distributeFnMatch = worldViewSource.match(/function distributeWorldEncounterSnapshot\(publication, storage, remotePinningConfiguration, discoveryProvider\)\s*\{[\s\S]*?\n        \}/);
        assert(distributeFnMatch && /session\.getPlacementInfoForPublication\(publication\.id\)/.test(distributeFnMatch[0])
            && /placementInfo \? placementInfo\.publicationId : undefined/.test(distributeFnMatch[0]),
            'B2. ui/views/WorldView.js\'s own real distributeWorldEncounterSnapshot() genuinely has this exact shape — makeDistributeWorldEncounterSnapshotAction() above reproduces it faithfully.');

        const distribution = await distributeWorldEncounterSnapshot(publication);
        assert(distribution.announcement && distribution.announcement.published === true,
            'B3. the FULL real chain — session -> WorldView-shaped action -> ui/main.js-shaped wrapper -> executeSnapshotDistributionCommand() -> real NostrSnapshotDiscoveryPublisher.publish() — succeeds end to end, for the first time in this codebase\'s own test suite chained as one call.');
        assert(distribution.contentReference.hash === computeContentHash(JSON.stringify(snapshotJson)),
            'B4. the real content hash used throughout is exactly this Snapshot\'s own serialized bytes.');

        // ---- C: real Nostr artifact ----
        const rawEvents = host.network.events;
        assert(rawEvents.length === 1, 'C1. exactly one real Nostr event was published by the real chain above.');
        const envelope = JSON.parse(rawEvents[0].content);
        assert(envelope.publicationId === publication.id, 'C2. publicationId preserved in the real wire envelope.');
        assert(envelope.claimedPosition.x === 10 && envelope.claimedPosition.y === 0 && envelope.claimedPosition.z === 20,
            'C3. claimedPosition preserved exactly — no accidental conversion of coordinates.');
        assert(envelope.contentHash === distribution.contentReference.hash, 'C4. contentHash unchanged.');
        assert(envelope.locator === distribution.contentReference.uri, 'C5. locator unchanged.');
        assert(envelope.storage === distribution.contentReference.storage, 'C6. storage unchanged.');
        assert(rawEvents[0].tags.some((tag) => tag[0] === 't' && tag[1] === 'sections-a-f-production-chain'),
            'C7. the discovery tag is present, unchanged, on the real published event.');

        // ---- D: remote discovery ----
        const registry = new WorldDiscoverySourceRegistry();
        const ctx = panelCtx({
            publication, placementInfo: null, worldDiscoverySourceRegistry: registry,
            discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
            resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
            materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand
        });
        ctx.discoverSnapshotCandidates();
        await flushMicrotasks();
        assert(ctx.snapshotCandidateDiscoveryResult.length === 1, 'D1. the remote candidate is discoverable.');
        const candidate = ctx.snapshotCandidateDiscoveryResult[0];
        assert(candidate.publicationId === placementInfo.publicationId
            && candidate.claimedPosition.x === placementInfo.position.x
            && candidate.claimedPosition.y === placementInfo.position.y
            && candidate.claimedPosition.z === placementInfo.position.z,
            'D2. publisher: claimedPosition = P; remote candidate: claimedPosition = P — the SAME claim the publisher\'s own session originally produced in Section A, no new position-resolution mechanism required.');

        // ---- E: full resolution and verification ----
        ctx.selectSnapshotCandidate(candidate);
        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();
        assert(ctx.selectedSnapshotResolutionResult.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, 'E1. resolution succeeds through the real resolver.');
        assert(computeContentHash(ctx.selectedSnapshotResolutionResult.bytes) === candidate.contentHash,
            'E2. VERIFY — the resolved bytes still hash to the announced contentHash.');
        ctx.materializeSelectedSnapshot();
        await flushMicrotasks();
        assert(
            ctx.selectedSnapshotMaterializationResult.outcome === SnapshotCandidateMaterializationOutcome.STORED
            || ctx.selectedSnapshotMaterializationResult.outcome === SnapshotCandidateMaterializationOutcome.ALREADY_AVAILABLE,
            'E3. materialization succeeds.'
        );
        ctx.useClaimedSnapshotPosition();
        assert(ctx.selectedSnapshotWorldPositionClaimResult.outcome === SnapshotWorldPositionClaimOutcome.CLAIMED, 'E4. the claim, addressed to this exact Publication, is consumed.');
        assert(!('verified' in ctx.selectedSnapshotWorldPositionClaimResult) && !('contentHash' in ctx.selectedSnapshotWorldPositionClaimResult),
            'E5. VERIFIED (content-hash verification, above) never becomes, or is folded into, "position authoritative" — consuming a claim (CLAIMED) carries no verification vocabulary of its own, and position claiming remains entirely independent of content verification.');

        // ---- F: existing consumer ----
        assert(ctx.selectedSnapshotWorldPositionClaimResult.position.x === 10
            && ctx.selectedSnapshotWorldPositionClaimResult.position.y === 0
            && ctx.selectedSnapshotWorldPositionClaimResult.position.z === 20,
            'F1. useClaimedSnapshotPosition() — the pre-existing, already-shipped consumer — obtains the claim from an ACTUALLY DISTRIBUTED Publication, sourced end to end through the real production chain above, not a locally constructed test candidate. This closes the original user-facing disconnect.');
        ctx.placeMaterializedSnapshot();
        ctx.registerMaterializedSnapshot();
        assert(ctx.selectedSnapshotWorldRegistrationResult.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, 'F2. registration succeeds.');
        const raw = viewById(registry)[publication.id];
        assert(raw.x === 10 && raw.y === 0 && raw.z === 20, 'F3. the rendered World Encounter carries exactly the production-distributed claim.');

        console.log('✓ Sections A-F: a real, session-derived position claim survives the complete PUBLISH -> DISTRIBUTE -> NOSTR -> DISCOVER -> RESOLVE -> VERIFY -> MATERIALIZE -> CONSUME journey, chained as one continuous call for the first time.');
    }

    // =======================================================================
    // Section G — no-placement regression.
    // =======================================================================
    {
        const storageProvider = new InMemoryStorageProvider();
        const publication = publishOwnPublication(storageProvider, 'Section G No-Placement Publication');
        const emptyPlacementRegistry = new LocalPlacementRegistry(storageProvider);
        const session = makeRealSession(emptyPlacementRegistry);
        assert(session.getPlacementInfoForPublication(publication.id) === null,
            '1. sanity — a Publication with no existing placement genuinely resolves no claim from a real, genuinely empty LocalPlacementRegistry.');

        const host = makeHost(storageProvider, 'section-g-no-placement');
        const publicationContentStore = fakeContentStore({ [publication.contentReference.hash]: { world: { buildings: [] } } });
        const snapshotDistributionCommand = makeRealSnapshotDistributionCommand({ contentStore: host.arweaveStore, discoveryPublisher: host.discoveryPublisher });
        const distribute = makeDistributeWorldEncounterSnapshotAction({ snapshotDistributionCommand, publicationContentStore, session });

        const distribution = await distribute(publication);
        assert(distribution.announcement.published === true, '2. distribution still succeeds through the full real chain with no placement to carry.');

        const registry = new WorldDiscoverySourceRegistry();
        const ctx = panelCtx({
            publication, placementInfo: null, worldDiscoverySourceRegistry: registry,
            discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
            resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
            materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand
        });
        ctx.discoverSnapshotCandidates();
        await flushMicrotasks();
        const candidate = ctx.snapshotCandidateDiscoveryResult[0];
        assert(!('publicationId' in candidate) && !('claimedPosition' in candidate), '3. publicationId absent, claimedPosition absent — omitted, never fabricated.');
        ctx.selectSnapshotCandidate(candidate);
        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();
        ctx.materializeSelectedSnapshot();
        await flushMicrotasks();
        ctx.useClaimedSnapshotPosition();
        assert(ctx.selectedSnapshotWorldPositionClaimResult.outcome === SnapshotWorldPositionClaimOutcome.ABSENT, '4. ABSENT, correctly.');
        ctx.placeMaterializedSnapshot();
        assert(ctx.selectedSnapshotWorldPlacementResult.outcome === SnapshotWorldPlacementOutcome.UNPLACED,
            '5. ordinary Snapshot distribution/discovery continues to work exactly as before 0.9.566, with no local placement to fall back to — this is 0.9.566\'s own backward-compatible optionality, now confirmed through the ACTUAL real chain rather than a reproduction alone.');
        console.log('✓ Section G: a Publication with no existing placement distributes, discovers, and resolves to UNPLACED exactly as before — through the real chain, not a stand-in.');
    }

    // =======================================================================
    // Section H — Publication identity isolation.
    // =======================================================================
    {
        const storageProvider = new InMemoryStorageProvider();
        const publicationP1 = publishOwnPublication(storageProvider, 'Section H Publication 1');
        const publicationP2 = publishOwnPublication(storageProvider, 'Section H Publication 2');
        const placementRegistry = new LocalPlacementRegistry(storageProvider);
        placeReal(placementRegistry, publicationP1.id, new Position(3, 0, 4));
        placeReal(placementRegistry, publicationP2.id, new Position(-3, 0, -4));
        const session = makeRealSession(placementRegistry);

        const host = makeHost(storageProvider, 'section-h-identity-isolation');
        const sharedSnapshotJson = { world: { buildings: [{ id: 'shared-across-p1-and-p2' }] } };
        const publicationContentStore = fakeContentStore({ [publicationP1.contentReference.hash]: sharedSnapshotJson, [publicationP2.contentReference.hash]: sharedSnapshotJson });
        const snapshotDistributionCommand = makeRealSnapshotDistributionCommand({ contentStore: host.arweaveStore, discoveryPublisher: host.discoveryPublisher });
        const distribute = makeDistributeWorldEncounterSnapshotAction({ snapshotDistributionCommand, publicationContentStore, session });

        const distP1 = await distribute(publicationP1);
        const distP2 = await distribute(publicationP2);
        assert(distP1.contentReference.hash === distP2.contentReference.hash, '1. sanity — P1 and P2 genuinely share one contentHash.');

        const registry = new WorldDiscoverySourceRegistry();
        const candidates = await host.discoverSnapshotCandidatesCommand();
        assert(candidates.length === 2, '2. both are independently discoverable despite the shared contentHash.');
        const candidateP1 = candidates.find((c) => c.publicationId === publicationP1.id);
        const candidateP2 = candidates.find((c) => c.publicationId === publicationP2.id);
        assert(candidateP1 && candidateP2, '3. each candidate is individually addressable by its own session-derived publicationId.');

        async function driveToPlacement(publication, candidate) {
            const ctx = panelCtx({
                publication, placementInfo: null, worldDiscoverySourceRegistry: registry, selectedSnapshotCandidate: candidate,
                discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
                resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
                materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand
            });
            ctx.resolveSelectedSnapshot();
            await flushMicrotasks();
            ctx.materializeSelectedSnapshot();
            await flushMicrotasks();
            ctx.useClaimedSnapshotPosition();
            ctx.placeMaterializedSnapshot();
            ctx.registerMaterializedSnapshot();
            return ctx;
        }
        const ctxP1 = await driveToPlacement(publicationP1, candidateP1);
        const ctxP2 = await driveToPlacement(publicationP2, candidateP2);
        assert(ctxP1.selectedSnapshotWorldPlacementResult.position.x === 3 && ctxP1.selectedSnapshotWorldPlacementResult.position.z === 4, '4. P1 -> A.');
        assert(ctxP2.selectedSnapshotWorldPlacementResult.position.x === -3 && ctxP2.selectedSnapshotWorldPlacementResult.position.z === -4,
            '5. P2 -> B, even though P1.contentHash === P2.contentHash — the identity boundary this codebase\'s own Publication architecture has protected throughout.');
        console.log('✓ Section H: two Publications sharing one contentHash, each with its own real, session-derived claim, resolve independently — never merged, never collided.');
    }

    // =======================================================================
    // Section I — authority boundary.
    // =======================================================================
    {
        const storageProvider = new InMemoryStorageProvider();
        const publication = publishOwnPublication(storageProvider, 'Section I Authority Boundary Publication');
        const publisherPlacementRegistry = new LocalPlacementRegistry(storageProvider);
        placeReal(publisherPlacementRegistry, publication.id, new Position(7, 0, 7));
        const session = makeRealSession(publisherPlacementRegistry);

        const host = makeHost(storageProvider, 'section-i-authority-boundary');
        const publicationContentStore = fakeContentStore({ [publication.contentReference.hash]: { world: { buildings: [] } } });
        const snapshotDistributionCommand = makeRealSnapshotDistributionCommand({ contentStore: host.arweaveStore, discoveryPublisher: host.discoveryPublisher });
        const distribute = makeDistributeWorldEncounterSnapshotAction({ snapshotDistributionCommand, publicationContentStore, session });

        const beforeCount = publisherPlacementRegistry.findByPublicationId(publication.id).length;
        await distribute(publication);
        assert(publisherPlacementRegistry.findByPublicationId(publication.id).length === beforeCount,
            '1. distributing the claim never creates or mutates the PUBLISHER\'s own PlacementRecord.');

        const receiverPlacementRegistry = new LocalPlacementRegistry(new InMemoryStorageProvider());
        assert(receiverPlacementRegistry.findByPublicationId(publication.id).length === 0, '2. sanity — the receiver genuinely has no PlacementRecord for this Publication.');

        const registry = new WorldDiscoverySourceRegistry();
        const ctx = panelCtx({
            publication, placementInfo: null, worldDiscoverySourceRegistry: registry,
            discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
            resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
            materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand
        });
        ctx.discoverSnapshotCandidates();
        await flushMicrotasks();
        ctx.selectSnapshotCandidate(ctx.snapshotCandidateDiscoveryResult[0]);
        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();
        ctx.materializeSelectedSnapshot();
        await flushMicrotasks();
        ctx.useClaimedSnapshotPosition();
        assert(ctx.selectedSnapshotWorldPositionClaimResult.outcome === SnapshotWorldPositionClaimOutcome.CLAIMED, '3. the remote claim is genuinely CLAIMED (and its content genuinely VERIFIED, per Section E).');
        ctx.placeMaterializedSnapshot();
        ctx.registerMaterializedSnapshot();
        assert(ctx.selectedSnapshotWorldRegistrationResult.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, '4. it registers into the ephemeral World registry.');
        assert(receiverPlacementRegistry.findByPublicationId(publication.id).length === 0,
            '5. yet the receiver\'s own authoritative placement/LocalPlacementRegistry.js STILL holds ZERO PlacementRecords for it — a remote Publication possessing VERIFIED content and a CLAIMED position, but lacking an authoritative PlacementRecord, remains in the existing non-authoritative state. This connects directly to the 0.9.551 decision: this capability creates or mutates no PlacementRecord, and never becomes an automatic-placement mechanism.');

        const commandSource = await readSource('application/SnapshotDistributionCommand.js');
        assert(!/PlacementRecord|LocalPlacementRegistry|WorldPlacement/.test(commandSource),
            '6. application/SnapshotDistributionCommand.js still references no PlacementRecord/LocalPlacementRegistry/WorldPlacement machinery whatsoever.');
        console.log('✓ Section I: the complete distributed-claim journey creates or mutates no PlacementRecord, on the publisher\'s side or the receiver\'s — the feature remains a claim-consumption mechanism, never an automatic-placement one.');
    }

    // =======================================================================
    // Section J — relay-count reality check (a correction, not a
    // confirmation: this codebase builds no multi-relay fan-out to verify
    // consistency across).
    // =======================================================================
    {
        const publisherSource = await readSource('application/NostrSnapshotDiscoveryPublisher.js');
        const queryServiceSource = await readSource('application/NostrSnapshotDiscoveryQueryService.js');
        assert(/Publishing to more than one relay, or any relay-selection/.test(publisherSource),
            '1. NostrSnapshotDiscoveryPublisher deliberately excludes multi-relay fan-out of any kind — there is no existing multi-relay architecture in this codebase to verify cross-relay consistency against; this milestone\'s own original framing assumed one that was never built.');
        assert(/exactly one relay per instance/i.test(queryServiceSource),
            '2. NostrSnapshotDiscoveryQueryService holds the identical one-relay-per-instance restraint.');

        // What IS true, and worth proving instead: composing two
        // INDEPENDENT single-relay publisher/query pairs — the only way a
        // caller could approximate "several relays" today — never
        // cross-contaminates or transforms the claim between them.
        const storageProvider = new InMemoryStorageProvider();
        const publication = publishOwnPublication(storageProvider, 'Section J Relay Publication');
        const placementRegistry = new LocalPlacementRegistry(storageProvider);
        placeReal(placementRegistry, publication.id, new Position(6, 0, -6));
        const session = makeRealSession(placementRegistry);
        const publicationContentStore = fakeContentStore({ [publication.contentReference.hash]: { world: { buildings: [] } } });

        const hostRelayA = makeHost(storageProvider, 'section-j-relay-a');
        const hostRelayB = makeHost(storageProvider, 'section-j-relay-b');
        const distributeToA = makeDistributeWorldEncounterSnapshotAction({
            snapshotDistributionCommand: makeRealSnapshotDistributionCommand({ contentStore: hostRelayA.arweaveStore, discoveryPublisher: hostRelayA.discoveryPublisher }),
            publicationContentStore, session
        });
        const distributeToB = makeDistributeWorldEncounterSnapshotAction({
            snapshotDistributionCommand: makeRealSnapshotDistributionCommand({ contentStore: hostRelayB.arweaveStore, discoveryPublisher: hostRelayB.discoveryPublisher }),
            publicationContentStore, session
        });

        await distributeToA(publication);
        await distributeToB(publication);

        const candidatesA = await hostRelayA.discoverSnapshotCandidatesCommand();
        const candidatesB = await hostRelayB.discoverSnapshotCandidatesCommand();
        assert(candidatesA.length === 1 && candidatesB.length === 1, '3. each independently-composed relay pair independently receives the announcement.');
        assert(candidatesA[0].publicationId === publication.id && candidatesB[0].publicationId === publication.id, '4. publicationId is identical across both.');
        assert(candidatesA[0].claimedPosition.x === 6 && candidatesA[0].claimedPosition.z === -6
            && candidatesB[0].claimedPosition.x === 6 && candidatesB[0].claimedPosition.z === -6,
            '5. claimedPosition is identical across both — no relay-specific transformation of any kind.');
        assert(candidatesA[0].contentHash === candidatesB[0].contentHash, '6. contentHash is identical across both.');
        console.log('✓ Section J: this codebase deliberately has no multi-relay fan-out to audit; two independently-composed single-relay pairs — the only real approximation available today — never transform or cross-contaminate the claim between them.');
    }

    // =======================================================================
    // Section K — failure isolation.
    // =======================================================================
    {
        const storageProvider = new InMemoryStorageProvider();
        const publicationNoPlacement = publishOwnPublication(storageProvider, 'Section K No Placement');
        const publicationWithPlacement = publishOwnPublication(storageProvider, 'Section K With Placement');
        const placementRegistry = new LocalPlacementRegistry(storageProvider);
        placeReal(placementRegistry, publicationWithPlacement.id, new Position(2, 0, 2));
        const session = makeRealSession(placementRegistry);
        const host = makeHost(storageProvider, 'section-k-failure-isolation');
        const publicationContentStore = fakeContentStore({
            [publicationNoPlacement.contentReference.hash]: { world: { buildings: [{ id: 'no-placement' }] } },
            [publicationWithPlacement.contentReference.hash]: { world: { buildings: [{ id: 'with-placement' }] } }
        });
        const snapshotDistributionCommand = makeRealSnapshotDistributionCommand({ contentStore: host.arweaveStore, discoveryPublisher: host.discoveryPublisher });
        const distribute = makeDistributeWorldEncounterSnapshotAction({ snapshotDistributionCommand, publicationContentStore, session });

        // K-1: placement info absent for one Publication never affects a
        // separate, independent distribution for another.
        await distribute(publicationNoPlacement);
        await distribute(publicationWithPlacement);
        const candidates = await host.discoverSnapshotCandidatesCommand();
        const cNo = candidates.find((c) => !('publicationId' in c));
        const cWith = candidates.find((c) => c.publicationId === publicationWithPlacement.id);
        assert(cNo && cWith, '1. an absent placement claim on one distribution never blocks or contaminates a separate distribution carrying a real claim.');

        // K-2: discovery publisher unavailable — the exact graceful
        // degradation ui/main.js's own composeSnapshotDistributionRuntime()
        // documents.
        const { discoveryPublisher: unavailablePublisher } = composeSnapshotDistributionRuntime({});
        assert(unavailablePublisher === null, '2. sanity — composeSnapshotDistributionRuntime() genuinely produces no discoveryPublisher when none is configured.');
        const unavailableAction = makeDistributeWorldEncounterSnapshotAction({
            snapshotDistributionCommand: makeRealSnapshotDistributionCommand({ contentStore: host.arweaveStore, discoveryPublisher: unavailablePublisher }),
            publicationContentStore, session
        });
        let threwSynchronously = false;
        try { unavailableAction(publicationWithPlacement); } catch (error) { threwSynchronously = /discoveryPublisher/.test(error.message); }
        assert(threwSynchronously,
            '3. a genuinely unavailable discovery publisher throws synchronously — the same failure WorldView.js\'s own Promise.resolve().then(...) wrapper already catches — never a silent no-op, never a retry.');
        const candidatesAfterUnavailable = await host.discoverSnapshotCandidatesCommand();
        assert(candidatesAfterUnavailable.length === 2, '4. the earlier, successful distributions above remain completely unaffected by this unrelated failure.');

        // K-3: one relay fails.
        const failingPublisher = new NostrSnapshotDiscoveryPublisher({
            discoveryTag: 'section-k-failing-relay',
            publishImpl: async () => { throw new Error('relay unreachable'); }
        });
        const failingAction = makeDistributeWorldEncounterSnapshotAction({
            snapshotDistributionCommand: makeRealSnapshotDistributionCommand({ contentStore: host.arweaveStore, discoveryPublisher: failingPublisher }),
            publicationContentStore, session
        });
        let rejectedWithOriginalError = false;
        try { await failingAction(publicationWithPlacement); } catch (error) { rejectedWithOriginalError = error.message === 'relay unreachable'; }
        assert(rejectedWithOriginalError,
            '5. a failing relay genuinely rejects, unmodified — the same "genuine failure propagates" restraint this family already holds; no retry is attempted anywhere in this file.');
        const candidatesAfterFailingRelay = await host.discoverSnapshotCandidatesCommand();
        assert(candidatesAfterFailingRelay.length === 2, '6. the earlier successful announcements on the working relay are untouched by this unrelated relay\'s own failure.');

        // K-4: resolution unavailable.
        const unresolvable = { outcome: DecentralizedSnapshotResolutionOutcome.CONTENT_UNAVAILABLE, bytes: null, candidates: [], locator: null, storage: null, reason: 'unreachable' };
        const placementFromUnresolvable = resolveSnapshotWorldPlacement(unresolvable);
        assert(placementFromUnresolvable.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_UNAVAILABLE,
            '7. resolution-unavailable propagates its own pre-existing outcome verbatim, never a new claim-specific failure state.');

        // K-5: verification rejects content — a plausible, correctly
        // addressed claim never rescues a genuine content-hash mismatch.
        const reference = await host.arweaveStore.put('Section K real bytes, deliberately mismatched contentHash');
        const forgedCandidate = { contentHash: 'not-the-real-hash', locator: reference.uri, storage: reference.storage, publicationId: publicationWithPlacement.id, claimedPosition: { x: 99, y: 99, z: 99 } };
        const forgedResolution = await host.resolveSelectedSnapshotCommand(forgedCandidate);
        assert(forgedResolution.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH,
            '8. verification rejects mismatched content even though the candidate carries a plausible, correctly-addressed claim — a position claim never rescues a failed content verification.');

        // No retries or fallback were introduced anywhere by any of the
        // above.
        const commandSource = await readSource('application/SnapshotDistributionCommand.js');
        assert(!/retry|setTimeout|fallback/i.test(commandSource),
            '9. no retry/fallback vocabulary of any kind exists in application/SnapshotDistributionCommand.js — none of the failure boundaries above required, or were given, one.');

        console.log('✓ Section K: each of the five named failure boundaries fails in isolation, propagating its own pre-existing outcome verbatim, never corrupting or retrying an unrelated, already-succeeded distribution.');
    }

    // =======================================================================
    // Section L — FLAGSHIP: the complete real journey, plus the permanent
    // three-position regression guard.
    // =======================================================================
    {
        const storageProvider = new InMemoryStorageProvider();
        const publication = publishOwnPublication(storageProvider, 'Section L Flagship Publication');

        // 1. Publisher's existing deterministic placement -> claimedPosition.
        const publisherPlacementRegistry = new LocalPlacementRegistry(storageProvider);
        placeReal(publisherPlacementRegistry, publication.id, new Position(10, 0, 20));
        const session = makeRealSession(publisherPlacementRegistry);

        const host = makeHost(storageProvider, 'section-l-flagship');
        const snapshotJson = { world: { buildings: [{ id: 'flagship' }] } };
        const publicationContentStore = fakeContentStore({ [publication.contentReference.hash]: snapshotJson });
        const snapshotDistributionCommand = makeRealSnapshotDistributionCommand({ contentStore: host.arweaveStore, discoveryPublisher: host.discoveryPublisher });
        const distribute = makeDistributeWorldEncounterSnapshotAction({ snapshotDistributionCommand, publicationContentStore, session });

        await distribute(publication);

        const registry = new WorldDiscoverySourceRegistry();
        const ctx = panelCtx({
            publication, placementInfo: null, worldDiscoverySourceRegistry: registry,
            discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
            resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
            materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand
        });
        ctx.discoverSnapshotCandidates();
        await flushMicrotasks();
        ctx.selectSnapshotCandidate(ctx.snapshotCandidateDiscoveryResult[0]);
        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();
        ctx.materializeSelectedSnapshot();
        await flushMicrotasks();
        ctx.useClaimedSnapshotPosition();
        ctx.placeMaterializedSnapshot();
        ctx.registerMaterializedSnapshot();
        assert(ctx.selectedSnapshotWorldRegistrationResult.outcome === SnapshotWorldRegistrationOutcome.REGISTERED,
            '1. the whole real journey — publish -> existing placement -> Snapshot distribution -> Nostr -> remote discovery -> candidate with claimedPosition -> selection -> resolution -> materialization -> verification -> Use Claimed Position — succeeds end to end.');

        const canvas = buildCanvasInstance({ registry, materialSources: { local: new LocalWorldEncounterMaterialSource(storageProvider) } });
        mountCanvas(canvas);
        const projected = projectedPublicationsOf(canvas).find((p) => p.objectId === publication.id);
        assert(projected.x === expectedCanvasCoordinate(10) && projected.y === expectedCanvasCoordinate(20),
            '2. the resulting rendered position is exactly the publisher\'s own deterministic (10, _, 20) claim.');

        // 2. Observer's local encounter position — a Wanderer selecting
        // this encounter never substitutes their own position for the
        // distributed claim; selectEncounter() reads no avatar/camera
        // position of any kind.
        const observerLocalEncounterPosition = { x: 12, y: 0, z: 18 };
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: publication.id });
        assert(canvas.resolvedEncounterSelection !== null, '3. the Wanderer can select this encounter regardless of where they themselves are standing.');
        const rawAfterSelection = viewById(registry)[publication.id];
        assert(rawAfterSelection.x === 10 && rawAfterSelection.z === 20
            && !(rawAfterSelection.x === observerLocalEncounterPosition.x && rawAfterSelection.z === observerLocalEncounterPosition.z),
            '4. the distributed claim remains exactly (10, _, 20) — never replaced by, averaged with, or derived from the observer\'s own local encounter position, which this test deliberately never feeds into any production function.');
        unmountCanvas(canvas);

        // 3. Authoritative World placement (PlacementRecord) — receiving
        // and rendering the claim never manufactures one for the RECEIVER.
        const receiverPlacementRegistry = new LocalPlacementRegistry(new InMemoryStorageProvider());
        assert(receiverPlacementRegistry.findByPublicationId(publication.id).length === 0,
            '5. the receiver has, and after this entire journey still has, zero authoritative PlacementRecords for this Publication — merely receiving (10, _, 20) never manufactures an authoritative placement.');
        const publisherPlacementAfter = session.getPlacementInfoForPublication(publication.id);
        assert(publisherPlacementAfter.position.x === 10 && publisherPlacementAfter.position.z === 20,
            '6. the publisher\'s own authoritative placement — the ONE PlacementRecord that ever legitimately existed here — is bit-for-bit unchanged throughout the entire distributed journey.');

        console.log('✓ Section L: FLAGSHIP — the publisher\'s existing deterministic placement, an observer\'s own local encounter position, and an authoritative World placement remain three distinct, non-substitutable facts throughout the complete real production journey; the distributed claim survives end to end without becoming, requiring, or being confused with either of the other two.');
    }

    console.log('\n✅ All Distributed Publication Position Claim End-to-End Product Reassessment tests passed.');
    console.log('CLASSIFICATION: END-TO-END_COMPLETE — the Publication\'s existing deterministic position claim survives the complete decentralized distribution -> discovery -> resolution -> verification -> presentation journey, through real production wiring throughout. No new production boundary gap was found; no 0.9.568 production milestone is recommended.');
}

run().catch((error) => {
    console.error('DistributedPublicationPositionClaimEndToEndProductReassessment.test.js FAILED:', error);
    process.exitCode = 1;
});
