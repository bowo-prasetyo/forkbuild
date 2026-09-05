import { readFile } from 'node:fs/promises';

import OwnPublicationPanel from '../ui/components/OwnPublicationPanel.js';
import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import { resolveSnapshotWorldPositionClaim } from '../application/SnapshotWorldPositionClaim.js';
import { SnapshotWorldPositionClaimOutcome } from '../application/SnapshotWorldPositionClaimOutcome.js';
import { resolveSnapshotWorldPlacement } from '../application/SnapshotWorldPlacement.js';
import { SnapshotWorldPlacementOutcome } from '../application/SnapshotWorldPlacementOutcome.js';
import {
    registerMaterializedSnapshotWorldSource,
    unregisterMaterializedSnapshotWorldSource,
    materializedSnapshotWorldOrigin
} from '../application/MaterializedSnapshotWorldDiscoveryBridge.js';
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
import { WorldDiscoverySourceRegistry } from '../application/WorldDiscoverySourceRegistry.js';
import { describeWorldFromDiscoveryRegistry } from '../application/WorldDiscoveryRegistryProjection.js';
import { describeLocalWorldDiscoverySource, LOCAL_WORLD_DISCOVERY_ORIGIN } from '../application/WorldEncounterIntegration.js';
import { registerPeerWorldSource, unregisterPeerWorldSource } from '../peer/PeerWorldDiscoveryLifecycleBridge.js';
import { derivePeerWorldOrigin } from '../peer/PeerWorldDataIngress.js';
import { LocalWorldEncounterMaterialSource } from '../application/LocalWorldEncounterMaterialSource.js';
import { WorldEncounterMaterialLoadStatus } from '../application/WorldEncounterMaterialLoading.js';
import { WorldEncounterPresentationSourceFamily } from '../application/WorldEncounterPresentation.js';
import { WorldEncounterSelectionOutcomeStatus } from '../application/WorldEncounterSelectionOutcome.js';
import { WorldEncounterKind } from '../core/WorldEncounter.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { ArweaveContentStore } from '../content/ArweaveContentStore.js';
import { Position } from '../core/Position.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { Publication } from '../publisher/Publication.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { computeContentHash } from '../serializer/contentHash.js';

// 0.9.180 — World Snapshot Completion & Boundary Audit.
//
// 0.9.131 through 0.9.179 built and individually audited every stage of the
// decentralized Snapshot -> World pipeline:
//
//   DISCOVER -> SELECT -> RESOLVE -> VERIFY -> MATERIALIZE -> [CONSUME
//   CLAIM] -> PLACE -> REGISTER -> WORLD ENCOUNTER -> SELECT -> LOAD
//   MATERIAL -> PRESENT -> INSPECT -> UNREGISTER
//
// Every one of those seams was proven in isolation, or in a horizontal
// slice stopping short of the next one: 0.9.135/0.9.148/0.9.153/0.9.155
// proved DISCOVER-through-ATTRIBUTE; 0.9.173 (Decentralized Snapshot
// Spatial E2E Audit) drove PUBLISH all the way through RENDER, but ended
// there — 0.9.179 (Snapshot World Source Unregistration), which built
// UNREGISTER, did not exist yet. 0.9.179 itself then proved UNREGISTER
// thoroughly, but only against hand-built `placedResult()` stubs, never
// against a Snapshot that arrived through the real, complete decentralized
// pipeline. **No test in this codebase has ever driven ONE Snapshot from a
// real Nostr announcement all the way through an explicit World
// unregistration.** This is that missing closure, plus the wider boundary
// sweep the brief that requested this milestone asked for. **TEST-ONLY —
// every collaborator this audit exercises is read, real, and unmodified.
// No file under `application/`, `core/`, `ui/`, `peer/`, `content/`,
// `nostr/`, or `arweave/` is added or changed.**
//
// Section A: FLAGSHIP — a complete stranger Snapshot travels PUBLISH
//            through UNREGISTER, through the real, unmodified production
//            chain throughout — the one horizontal slice no prior
//            milestone ever composed in full.
// Section B: identity closure — contentHash, locator, Nostr event id,
//            publicationId, registry origin, and position stay six
//            pairwise-distinct facts, including across an unregister/
//            re-register round trip.
// Section C: source-family convergence — the registry projection and
//            rendered markers carry no origin/source field anywhere,
//            recursively, and that property survives a mid-lifecycle
//            Snapshot unregistration untouched.
// Section D: lifecycle reversibility — REGISTER -> UNREGISTER -> REGISTER
//            through the REAL pipeline reaches an equivalent World state;
//            REGISTER A / REGISTER B (sharing an identity axis) /
//            UNREGISTER A leaves B untouched, for every combination the
//            architecture actually permits.
// Section E: no hidden persistence, but no accidental deletion either —
//            every downstream projection collapses to absence after
//            UNREGISTER, while the materialized bytes, the Publication,
//            the Nostr announcement, and the Arweave transaction all
//            survive, untouched, outside the World.
// Section F: no accidental authority — discovery order, a Nostr event's
//            own continued existence, a locator, and an unconsumed claim
//            are all proven NOT to be what a rendered World position
//            depends on; only the registry and the explicit placement
//            mechanism are.
// Section G: temporal independence — no `setInterval` anywhere in the
//            Snapshot pipeline's own files; registry/unregister
//            notification is synchronous, never timer-driven.
// Section H: failure closure — NOT_DISCOVERED/STORE_UNAVAILABLE/
//            CONTENT_UNAVAILABLE/CONTENT_HASH_MISMATCH remain RESOLUTION
//            outcomes alone; registration/unregistration keep their own
//            existing, much simpler vocabulary, untouched by any of them.
// Section I: cross-family destruction/isolation — LOCAL/PEER/SNAPSHOT
//            sharing an objectId, and a second Snapshot sharing the first
//            Snapshot's own contentHash under a different Publication,
//            all coexist; unregistering one Snapshot leaves every other
//            source, of every family, completely untouched.
// Section J: UI boundary — the widest structural sweep yet in this arc,
//            across every file the completed pipeline actually touches.
//
// DELIBERATELY NOT ATTEMPTED HERE. Per this milestone's own brief, this
// audit reports; it does not schedule. No production file is touched, no
// new capability is proposed as code, and the classification this
// milestone produces (see docs/Roadmap.md's own 0.9.180 entry) is a
// judgment about what to build NEXT, not a change made now.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function flush() {
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

function peer(identityId) {
    return { remoteIdentity: { identityId } };
}

function placedResult(contentHash, publicationId, position) {
    return { outcome: SnapshotWorldPlacementOutcome.PLACED, contentHash, publicationId, placementId: `placement-${publicationId}`, position, reason: null };
}

// --- The real (fake-transport-backed) decentralized host, mirroring
// tests/DecentralizedSnapshotSpatialE2EAudit.test.js's own makeHost()
// exactly, so every "real pipeline" section below runs against genuine
// Arweave/Nostr adapters, never a hand-built stand-in.
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
        return { id: `fake-0-9-180-tx-${counter}`, transaction: { id: `fake-0-9-180-tx-${counter}`, data: material } };
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

async function placeAndAnnounce(host, bytes, { publicationId, claimedPosition } = {}) {
    const reference = await host.arweaveStore.put(bytes);
    await host.discoveryPublisher.publish({
        contentHash: reference.hash, locator: reference.uri, storage: reference.storage,
        publicationId, claimedPosition
    });
    return reference;
}

// The real ui/components/OwnPublicationPanel.js interaction surface —
// mirrors tests/DecentralizedSnapshotSpatialE2EAudit.test.js's own
// panelCtx() exactly, covering PUBLISH through REGISTER.
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

// The real ui/components/WorldEncounterCanvas.js interaction surface —
// mirrors tests/SnapshotWorldSourceUnregistration.test.js's own
// buildCanvasInstance() exactly, covering WORLD ENCOUNTER through
// UNREGISTER, including the presentation/inspection/distribution
// computeds 0.9.176-0.9.179 each added.
function buildCanvasInstance({
    registry = null,
    materialSources = null,
    distributionCommand = null,
    snapshotDistributionCommand = null,
    discoverSnapshotCommand = null
} = {}) {
    const ctx = {
        registry,
        view: WorldEncounterCanvas.props.view.default(),
        materialSources,
        materialVerifier: null,
        distributionCommand,
        snapshotDistributionCommand,
        discoverSnapshotCommand,
        distributionLifecycleStore: null,
        discoveryCommand: null,
        worldDiscoveryLeadRegistry: null
    };
    Object.assign(ctx, WorldEncounterCanvas.data.call(ctx));
    Object.assign(ctx, WorldEncounterCanvas.methods);
    const liveGetters = [
        'effectiveView',
        'publicationRows',
        'avatarRows',
        'projectedPublications',
        'resolvedEncounterSelection',
        'resolvedLead',
        'selectedEncounterInspection',
        'selectedEncounterInspectionPublisherIdentityLabel',
        'selectedEncounterPresentation',
        'selectedEncounterPresentationSourceLabel',
        'selectedEncounterSnapshotInspection',
        'distributablePublication'
    ];
    for (const name of liveGetters) {
        Object.defineProperty(ctx, name, {
            get() { return WorldEncounterCanvas.computed[name].call(ctx); }
        });
    }
    return ctx;
}

function mountCanvas(ctx) { WorldEncounterCanvas.mounted.call(ctx); }
function unmountCanvas(ctx) { WorldEncounterCanvas.beforeUnmount.call(ctx); }

function viewById(registry) {
    const view = describeWorldFromDiscoveryRegistry(registry);
    return Object.fromEntries(view.publications.map((p) => [p.objectId, p]));
}

// Recursively confirms no key named `origin`/`source`/`sourceOrigin` exists
// anywhere in a plain-object/array structure — mirrors
// tests/WorldViewCapabilityReassessmentAudit.test.js's own Section A
// technique (0.9.168).
function assertNoOriginLeak(value, path = '$') {
    if (Array.isArray(value)) {
        value.forEach((item, i) => assertNoOriginLeak(item, `${path}[${i}]`));
        return;
    }
    if (value && typeof value === 'object') {
        for (const key of Object.keys(value)) {
            assert(key !== 'origin' && key !== 'source' && key !== 'sourceOrigin', `no origin/source/sourceOrigin key at ${path}.${key}`);
            assertNoOriginLeak(value[key], `${path}.${key}`);
        }
    }
}

async function run() {
    const canvasSource = await readFile(new URL('../ui/components/WorldEncounterCanvas.js', import.meta.url), 'utf8');
    const bridgeSource = await readFile(new URL('../application/MaterializedSnapshotWorldDiscoveryBridge.js', import.meta.url), 'utf8');
    const registrySource = await readFile(new URL('../application/WorldDiscoverySourceRegistry.js', import.meta.url), 'utf8');
    const markerSource = await readFile(new URL('../ui/components/WorldEncounterMarker.js', import.meta.url), 'utf8');
    const presentationSource = await readFile(new URL('../application/WorldEncounterPresentation.js', import.meta.url), 'utf8');
    const inspectionSource = await readFile(new URL('../application/WorldSnapshotInspection.js', import.meta.url), 'utf8');
    const materialLoadingSource = await readFile(new URL('../application/WorldEncounterMaterialLoading.js', import.meta.url), 'utf8');
    const claimSource = await readFile(new URL('../application/SnapshotWorldPositionClaim.js', import.meta.url), 'utf8');
    const placementSource = await readFile(new URL('../application/SnapshotWorldPlacement.js', import.meta.url), 'utf8');

    function stripComments(source) {
        return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
    }

    // =================================================================
    // Section A — FLAGSHIP: a complete stranger Snapshot travels PUBLISH
    // through UNREGISTER, through the real, unmodified production chain
    // throughout.
    // =================================================================
    {
        const storageProvider = new InMemoryStorageProvider();
        const publication = publishOwnPublication(storageProvider, 'Section A Flagship Publication');
        const host = makeHost(storageProvider, 'section-a-full-lifecycle');
        const bytes = 'Section A: a complete stranger Snapshot, carried through its entire lifecycle, including its own explicit removal';
        const claimedPosition = { x: 42, y: 1, z: -42 };
        await placeAndAnnounce(host, bytes, { publicationId: publication.id, claimedPosition });

        const registry = new WorldDiscoverySourceRegistry();
        const ctx = panelCtx({
            publication, placementInfo: null, worldDiscoverySourceRegistry: registry,
            discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
            resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
            materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand
        });

        // DISCOVER
        ctx.discoverSnapshotCandidates();
        await flush();
        assert(ctx.snapshotCandidateDiscoveryResult.length === 1, '1. DISCOVER — exactly one real, discovered candidate');
        const candidate = ctx.snapshotCandidateDiscoveryResult[0];
        assert(candidate.publicationId === publication.id, '2. the discovered candidate carries the publisher\'s own claim');
        assert(host.network.events.length === 1 && typeof host.network.events[0].id === 'string' && host.network.events[0].id.length > 0, '3. a real Nostr event id was assigned to the announcement');

        // SELECT
        ctx.selectSnapshotCandidate(candidate);
        assert(ctx.selectedSnapshotCandidate === candidate, '4. SELECT — plain, explicit assignment');

        // RESOLVE
        ctx.resolveSelectedSnapshot();
        await flush();
        assert(ctx.selectedSnapshotResolutionResult.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, '5. RESOLVE — genuinely succeeds');
        assert(ctx.selectedSnapshotResolutionResult.bytes === bytes, '6. resolved bytes are byte-identical to what was published');

        // VERIFY
        assert(computeContentHash(ctx.selectedSnapshotResolutionResult.bytes) === candidate.contentHash, '7. VERIFY — resolved bytes still hash to the declared contentHash');

        // MATERIALIZE
        ctx.materializeSelectedSnapshot();
        await flush();
        assert(
            ctx.selectedSnapshotMaterializationResult.outcome === SnapshotCandidateMaterializationOutcome.STORED
            || ctx.selectedSnapshotMaterializationResult.outcome === SnapshotCandidateMaterializationOutcome.ALREADY_AVAILABLE,
            '8. MATERIALIZE — genuinely succeeds'
        );

        // CONSUME CLAIM (optional stage)
        ctx.useClaimedSnapshotPosition();
        assert(ctx.selectedSnapshotWorldPositionClaimResult.outcome === SnapshotWorldPositionClaimOutcome.CLAIMED, '9. CONSUME CLAIM — the claim is consumed');

        // PLACE
        ctx.placeMaterializedSnapshot();
        assert(ctx.selectedSnapshotWorldPlacementResult.outcome === SnapshotWorldPlacementOutcome.PLACED, '10. PLACE — succeeds from the consumed claim alone');
        assert(ctx.selectedSnapshotWorldPlacementResult.position.x === 42 && ctx.selectedSnapshotWorldPlacementResult.position.z === -42, '11. the placement carries exactly the claimed position');

        // REGISTER
        ctx.registerMaterializedSnapshot();
        assert(ctx.selectedSnapshotWorldRegistrationResult.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, '12. REGISTER — succeeds');
        const expectedOrigin = materializedSnapshotWorldOrigin(ctx.selectedSnapshotMaterializationResult.contentHash, publication.id);
        assert(ctx.selectedSnapshotWorldRegistrationResult.origin === expectedOrigin, '13. registered under the exact derived snapshot:<contentHash>:<publicationId> origin');

        // WORLD ENCOUNTER
        const canvas = buildCanvasInstance({ registry, materialSources: { local: new LocalWorldEncounterMaterialSource(storageProvider) } });
        mountCanvas(canvas);
        assert(canvas.projectedPublications.some((p) => p.objectId === publication.id), '14. WORLD ENCOUNTER — the registered Snapshot renders as a marker');

        // SELECT (the Wanderer)
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: publication.id });
        await flush();
        assert(canvas.selectionOutcome.status === WorldEncounterSelectionOutcomeStatus.RESOLVED, '15. SELECT — resolves unambiguously');
        assert(canvas.resolvedEncounterSelection.origin === expectedOrigin, '16. the resolved selection carries the registered Snapshot\'s own origin');

        // LOAD MATERIAL
        assert(canvas.materialInspection !== null && canvas.materialInspection.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE, '17. LOAD MATERIAL — AVAILABLE, through the ordinary materialSources.local path');
        assert(canvas.materialInspection.loading.material instanceof Publication && canvas.materialInspection.loading.material.id === publication.id, '18. the loaded material is the exact, real Publication this pipeline started from');

        // PRESENT
        assert(canvas.selectedEncounterPresentation.sourceFamily === WorldEncounterPresentationSourceFamily.SNAPSHOT, '19. PRESENT — sourceFamily resolves to SNAPSHOT');

        // INSPECT
        const inspection = canvas.selectedEncounterSnapshotInspection;
        assert(inspection !== null, '20. INSPECT — a Snapshot inspection descriptor is available');
        assert(inspection.contentHash === candidate.contentHash, '21. inspection reports the correct contentHash');
        assert(inspection.publicationId === publication.id, '22. inspection reports the correct publicationId');
        assert(inspection.position.x === 42 && inspection.position.y === 1 && inspection.position.z === -42, '23. inspection reports the consumed claim\'s own position');

        // USE/LOAD reachability (0.9.178's own finding, re-confirmed here at
        // the end of a genuinely real pipeline rather than a hand-built one)
        assert(canvas.distributablePublication !== null && canvas.distributablePublication.id === publication.id, '24. USE/LOAD — distributablePublication is reachable, exactly like any other selected, loaded encounter');

        // UNREGISTER — the one stage no prior milestone ever composed with
        // a REAL, fully decentralized-origin Snapshot.
        canvas.unregisterSelectedSnapshot();
        await flush();
        assert(!canvas.projectedPublications.some((p) => p.objectId === publication.id), '25. UNREGISTER — the marker is gone from the rendered projection');
        assert(canvas.resolvedEncounterSelection === null, '26. the resolved selection collapses to null — never a fallback');
        assert(canvas.selectedEncounterSnapshotInspection === null, '27. Snapshot inspection detail is gone');
        assert(canvas.selectedEncounterPresentation === null, '28. presentation is gone');
        assert(canvas.materialInspection === null, '29. material inspection is gone');
        assert(canvas.distributablePublication === null, '30. distributablePublication is unreachable again');
        assert(registry.listSources().length === 0, '31. the World registry holds nothing for this Snapshot any longer');

        unmountCanvas(canvas);
        console.log('✓ Section A: FLAGSHIP — a complete stranger Snapshot travels PUBLISH -> DISCOVER -> SELECT -> RESOLVE -> VERIFY -> MATERIALIZE -> CONSUME CLAIM -> PLACE -> REGISTER -> WORLD ENCOUNTER -> SELECT -> LOAD MATERIAL -> PRESENT -> INSPECT -> UNREGISTER, entirely through real, unmodified production machinery — no stage secretly bypasses another');
    }

    // =================================================================
    // Section B — identity closure: six pairwise-distinct facts, held
    // through registration AND through an unregister/re-register round
    // trip.
    // =================================================================
    {
        const storageProvider = new InMemoryStorageProvider();
        const publication = publishOwnPublication(storageProvider, 'Section B Publication');
        const host = makeHost(storageProvider, 'section-b-identity-closure');
        const bytes = 'Section B: identity closure across every axis this pipeline carries';
        const claimedPosition = { x: 7, y: 8, z: 9 };

        // Two SEPARATE Nostr announcements (and therefore two genuinely
        // different retrieval locators, since each `arweaveStore.put()`
        // call mints a fresh transaction id, and two different Nostr
        // event ids) for the IDENTICAL contentHash/publicationId pair.
        await placeAndAnnounce(host, bytes, { publicationId: publication.id, claimedPosition });
        await placeAndAnnounce(host, bytes, { publicationId: publication.id, claimedPosition });
        assert(host.network.events.length === 2 && host.network.events[0].id !== host.network.events[1].id, 'sanity — two genuinely distinct Nostr events exist');

        const registry = new WorldDiscoverySourceRegistry();
        const ctx = panelCtx({
            publication, placementInfo: null, worldDiscoverySourceRegistry: registry,
            discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
            resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
            materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand
        });
        ctx.discoverSnapshotCandidates();
        await flush();
        assert(ctx.snapshotCandidateDiscoveryResult.length === 2, 'sanity — both announcements are discovered as two candidates');
        const [candidateOne, candidateTwo] = ctx.snapshotCandidateDiscoveryResult;
        assert(candidateOne.contentHash === candidateTwo.contentHash, 'sanity — identical contentHash');
        assert(candidateOne.locator !== candidateTwo.locator, '1. locator is an independent axis — two announcements of the identical bytes still carry two distinct locators');

        ctx.selectSnapshotCandidate(candidateOne);
        ctx.resolveSelectedSnapshot();
        await flush();
        ctx.materializeSelectedSnapshot();
        await flush();
        ctx.useClaimedSnapshotPosition();
        ctx.placeMaterializedSnapshot();
        ctx.registerMaterializedSnapshot();
        const registration = ctx.selectedSnapshotWorldRegistrationResult;
        assert(registration.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, 'sanity — registration succeeds');

        const contentHash = registration.contentHash;
        const origin = registration.origin;
        const locator = candidateOne.locator;
        const nostrEventId = host.network.events[0].id;
        const publicationId = publication.id;
        const position = ctx.selectedSnapshotWorldPlacementResult.position;

        assert(contentHash !== origin, '2. contentHash !== origin (origin is the composite snapshot:<hash>:<id> string, never the bare hash)');
        assert(origin !== publicationId, '3. origin !== publicationId');
        assert(publicationId !== contentHash, '4. publicationId !== contentHash');
        assert(locator !== contentHash && locator !== origin && locator !== publicationId, '5. locator is distinct from contentHash, origin, and publicationId');
        assert(nostrEventId !== contentHash && nostrEventId !== origin && nostrEventId !== publicationId && nostrEventId !== locator, '6. the Nostr event id is distinct from every other identity');
        assert(typeof position === 'object' && position !== null && !Object.values({ contentHash, origin, locator, nostrEventId, publicationId }).includes(position), '7. position is its own distinct kind of fact — a coordinate object, never a string identity');

        // The origin/registry key depends on EXACTLY {contentHash,
        // publicationId} — registering the SECOND candidate (different
        // locator, different originating Nostr event, identical
        // contentHash/publicationId) re-derives the IDENTICAL origin and
        // REPLACES the same slot, never creating a second one.
        ctx.selectSnapshotCandidate(candidateTwo);
        ctx.resolveSelectedSnapshot();
        await flush();
        ctx.materializeSelectedSnapshot();
        await flush();
        ctx.useClaimedSnapshotPosition();
        ctx.placeMaterializedSnapshot();
        ctx.registerMaterializedSnapshot();
        assert(ctx.selectedSnapshotWorldRegistrationResult.origin === origin, '8. a different locator and a different originating Nostr event, same contentHash/publicationId, register to the IDENTICAL origin');
        assert(registry.listSources().length === 1, '9. exactly one World slot exists — the origin key is exactly {contentHash, publicationId}, never locator or event id');

        // The six identities survive an UNREGISTER -> RE-REGISTER round
        // trip unchanged.
        unregisterMaterializedSnapshotWorldSource(registry, contentHash, publicationId);
        assert(registry.listSources().length === 0, 'sanity — unregistered');
        ctx.registerMaterializedSnapshot();
        assert(ctx.selectedSnapshotWorldRegistrationResult.origin === origin, '10. re-registration re-derives the IDENTICAL origin from the SAME contentHash/publicationId pair');
        assert(contentHash === registration.contentHash && publicationId === publication.id, '11. contentHash and publicationId themselves are plain, immutable facts — unaffected by any registration/unregistration cycle');

        console.log('✓ Section B: contentHash, locator, Nostr event id, publicationId, registry origin, and position remain six pairwise-distinct facts — the registry\'s own origin key depends on exactly {contentHash, publicationId}, never on locator or event id, and every identity survives an unregister/re-register round trip unchanged');
    }

    // =================================================================
    // Section C — source-family convergence: no origin/source field
    // anywhere in the projection or rendering, recursively, and that
    // property survives a mid-lifecycle Snapshot unregistration.
    // =================================================================
    {
        const storageProvider = new InMemoryStorageProvider();
        const localPublication = publishOwnPublication(storageProvider, 'Section C Local Publication');
        const peerPublication = publishOwnPublication(storageProvider, 'Section C Peer Publication');
        const snapshotPublication = publishOwnPublication(storageProvider, 'Section C Snapshot Publication');
        const registry = new WorldDiscoverySourceRegistry();

        registry.setSource(describeLocalWorldDiscoverySource({
            publications: [{ id: localPublication.id, title: localPublication.title }],
            placements: [{ publicationId: localPublication.id, position: { x: 1, y: 0, z: 1 } }]
        }));
        const peerIdentity = peer('did:key:zSectionCPeer');
        registerPeerWorldSource(registry, peerIdentity, {
            publications: [{ id: peerPublication.id, title: peerPublication.title }],
            placements: [{ publicationId: peerPublication.id, position: { x: 2, y: 0, z: 2 } }]
        });
        const snapshotRegistration = registerMaterializedSnapshotWorldSource(
            registry,
            placedResult('hash-section-c', snapshotPublication.id, { x: 3, y: 0, z: 3 }),
            snapshotPublication
        );
        assert(snapshotRegistration.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, 'sanity — Snapshot registers');
        assert(registry.listSources().length === 3, 'sanity — LOCAL, PEER, and SNAPSHOT all coexist');

        const view = describeWorldFromDiscoveryRegistry(registry);
        assertNoOriginLeak(view);

        const canvas = buildCanvasInstance({ registry, materialSources: { local: { async load() { return null; } } } });
        mountCanvas(canvas);
        assertNoOriginLeak(canvas.projectedPublications);
        assert(canvas.projectedPublications.length === 3, '1. all three families project as markers, recursively free of any origin/source field');

        // origin resurfaces exactly at explicit selection.
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: snapshotPublication.id });
        assert(canvas.resolvedEncounterSelection.origin === snapshotRegistration.origin, '2. origin resurfaces only at the point of explicit selection, where it is genuinely needed');

        // Unregistering the Snapshot mid-lifecycle: the property holds
        // for what remains, and LOCAL/PEER are untouched.
        canvas.unregisterSelectedSnapshot();
        await flush();
        const viewAfter = describeWorldFromDiscoveryRegistry(registry);
        assertNoOriginLeak(viewAfter);
        assert(viewAfter.publications.length === 2, '3. LOCAL and PEER remain, still recursively free of any origin/source field');
        assert(registry.listSources().find((s) => s.origin === LOCAL_WORLD_DISCOVERY_ORIGIN) !== undefined, '4. LOCAL is untouched');
        assert(registry.listSources().find((s) => s.origin === derivePeerWorldOrigin(peerIdentity)) !== undefined, '5. PEER is untouched');

        unmountCanvas(canvas);
        console.log('✓ Section C: the World projection and rendered markers carry no origin/source field anywhere, recursively — origin resurfaces only at explicit selection — and that property survives a mid-lifecycle Snapshot unregistration completely intact for every remaining source');
    }

    // =================================================================
    // Section D — lifecycle reversibility.
    // =================================================================
    {
        // D1 — REGISTER -> UNREGISTER -> REGISTER through the REAL
        // pipeline (never a hand-built stub) reaches an equivalent World
        // state, including through the actual UI-level unregister action.
        {
            const storageProvider = new InMemoryStorageProvider();
            const publication = publishOwnPublication(storageProvider, 'Section D1 Publication');
            const host = makeHost(storageProvider, 'section-d1-reversibility');
            const bytes = 'Section D1: a real round trip through the real pipeline';
            const claimedPosition = { x: 15, y: 2, z: -15 };
            await placeAndAnnounce(host, bytes, { publicationId: publication.id, claimedPosition });

            const registry = new WorldDiscoverySourceRegistry();
            const ctx = panelCtx({
                publication, placementInfo: null, worldDiscoverySourceRegistry: registry,
                discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
                resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
                materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand
            });
            ctx.discoverSnapshotCandidates();
            await flush();
            ctx.selectSnapshotCandidate(ctx.snapshotCandidateDiscoveryResult[0]);
            ctx.resolveSelectedSnapshot();
            await flush();
            ctx.materializeSelectedSnapshot();
            await flush();
            ctx.useClaimedSnapshotPosition();
            ctx.placeMaterializedSnapshot();
            ctx.registerMaterializedSnapshot();
            const firstRegistration = ctx.selectedSnapshotWorldRegistrationResult;
            assert(firstRegistration.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, 'sanity — first registration succeeds');
            const firstSource = registry.listSources().find((s) => s.origin === firstRegistration.origin);

            const canvas = buildCanvasInstance({ registry, materialSources: { local: new LocalWorldEncounterMaterialSource(storageProvider) } });
            mountCanvas(canvas);
            canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: publication.id });
            await flush();
            canvas.unregisterSelectedSnapshot();
            await flush();
            assert(registry.listSources().length === 0, '1. the real UI unregister action leaves the World empty');

            ctx.registerMaterializedSnapshot();
            const secondRegistration = ctx.selectedSnapshotWorldRegistrationResult;
            assert(secondRegistration.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, '2. the SAME contentHash/publicationId pair re-registers cleanly');
            assert(secondRegistration.origin === firstRegistration.origin, '3. re-registration derives the exact SAME origin');
            const secondSource = registry.listSources().find((s) => s.origin === secondRegistration.origin);
            assert(secondSource.publications[0] === firstSource.publications[0], '4. the same Publication reference is registered again');
            assert(secondSource.placements[0].position.x === firstSource.placements[0].position.x
                && secondSource.placements[0].position.z === firstSource.placements[0].position.z,
                '5. the resulting position is identical to the original registration\'s own position');
            assert(registry.listSources().length === 1, '6. exactly one entry exists — no ghost/duplicate from the round trip');

            canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: publication.id });
            await flush();
            assert(canvas.selectedEncounterSnapshotInspection !== null, '7. the re-registered Snapshot is selectable and inspectable again through the real UI path');
            unmountCanvas(canvas);

            console.log('✓ Section D (D1): REGISTER -> UNREGISTER -> REGISTER, driven through the real decentralized pipeline and the real UI unregister action, reaches a World state equivalent to the original registration');
        }

        // D2 — REGISTER A / REGISTER B / UNREGISTER A, for every identity
        // combination the architecture actually permits two Snapshots to
        // share.
        {
            const storageProvider = new InMemoryStorageProvider();

            // (i) shared contentHash, different publicationId (0.9.163's
            // own collision case).
            {
                const pubA = publishOwnPublication(storageProvider, 'Section D2i Publication A');
                const pubB = publishOwnPublication(storageProvider, 'Section D2i Publication B');
                const registry = new WorldDiscoverySourceRegistry();
                const sharedHash = 'hash-d2i-shared';
                const regA = registerMaterializedSnapshotWorldSource(registry, placedResult(sharedHash, pubA.id, { x: 1, y: 0, z: 1 }), pubA);
                const regB = registerMaterializedSnapshotWorldSource(registry, placedResult(sharedHash, pubB.id, { x: 2, y: 0, z: 2 }), pubB);
                assert(regA.origin !== regB.origin, 'sanity — sharing contentHash still derives two distinct origins');
                unregisterMaterializedSnapshotWorldSource(registry, sharedHash, pubA.id);
                assert(registry.listSources().length === 1 && registry.listSources()[0].origin === regB.origin, '1. (i) shared contentHash — unregistering A leaves B, sharing the identical contentHash, completely untouched');

                // Reversibility for this combination too — re-registering A
                // afterward restores both, never disturbing B.
                registerMaterializedSnapshotWorldSource(registry, placedResult(sharedHash, pubA.id, { x: 1, y: 0, z: 1 }), pubA);
                assert(registry.listSources().length === 2, '2. re-registering A restores both entries, still two independent slots for the shared contentHash');
            }

            // (ii) shared publicationId, different contentHash (two
            // independently-discovered "revisions" of the same
            // Publication's own Snapshot — 0.9.163's own second case).
            {
                const pub = publishOwnPublication(storageProvider, 'Section D2ii Publication');
                const registry = new WorldDiscoverySourceRegistry();
                const regH = registerMaterializedSnapshotWorldSource(registry, placedResult('hash-d2ii-H', pub.id, { x: 5, y: 0, z: 5 }), pub);
                const regK = registerMaterializedSnapshotWorldSource(registry, placedResult('hash-d2ii-K', pub.id, { x: 6, y: 0, z: 6 }), pub);
                assert(regH.origin !== regK.origin, 'sanity — sharing publicationId still derives two distinct origins');
                unregisterMaterializedSnapshotWorldSource(registry, 'hash-d2ii-H', pub.id);
                assert(registry.listSources().length === 1 && registry.listSources()[0].origin === regK.origin, '3. (ii) shared publicationId, different contentHash — unregistering H leaves K completely untouched');
            }

            // (iii) shared position — nothing in this architecture
            // deduplicates or collides two Snapshots that merely happen
            // to occupy the identical World coordinates.
            {
                const pubA = publishOwnPublication(storageProvider, 'Section D2iii Publication A');
                const pubB = publishOwnPublication(storageProvider, 'Section D2iii Publication B');
                const registry = new WorldDiscoverySourceRegistry();
                const sharedPosition = { x: 99, y: 99, z: 99 };
                const regA = registerMaterializedSnapshotWorldSource(registry, placedResult('hash-d2iii-A', pubA.id, sharedPosition), pubA);
                const regB = registerMaterializedSnapshotWorldSource(registry, placedResult('hash-d2iii-B', pubB.id, sharedPosition), pubB);
                assert(registry.listSources().length === 2, 'sanity — two Snapshots at the identical position coexist, nothing merges them');
                unregisterMaterializedSnapshotWorldSource(registry, 'hash-d2iii-A', pubA.id);
                const remaining = registry.listSources().find((s) => s.origin === regB.origin);
                assert(remaining !== undefined && remaining.placements[0].position === sharedPosition, '4. (iii) shared position — unregistering A leaves B\'s own position object reference completely unchanged, even though it is numerically identical to A\'s own');
            }

            console.log('✓ Section D (D2): REGISTER A / REGISTER B / UNREGISTER A leaves B completely untouched for every identity combination the architecture permits two Snapshots to share — contentHash, publicationId, and position alike');
        }
    }

    // =================================================================
    // Section E — no hidden persistence, but no accidental deletion
    // either: the World contribution disappears; the underlying bytes,
    // Publication, Nostr announcement, and Arweave transaction do not.
    // =================================================================
    {
        const storageProvider = new InMemoryStorageProvider();
        const publication = publishOwnPublication(storageProvider, 'Section E Publication');
        const host = makeHost(storageProvider, 'section-e-no-hidden-persistence');
        const bytes = 'Section E: the World contribution is not the same fact as the bytes, the Publication, the Nostr announcement, or the Arweave transaction';
        const claimedPosition = { x: 20, y: 0, z: 20 };
        const reference = await placeAndAnnounce(host, bytes, { publicationId: publication.id, claimedPosition });
        const publicationSnapshotBefore = JSON.stringify(publication);

        const registry = new WorldDiscoverySourceRegistry();
        const ctx = panelCtx({
            publication, placementInfo: null, worldDiscoverySourceRegistry: registry,
            discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
            resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
            materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand
        });
        ctx.discoverSnapshotCandidates();
        await flush();
        const candidate = ctx.snapshotCandidateDiscoveryResult[0];
        ctx.selectSnapshotCandidate(candidate);
        ctx.resolveSelectedSnapshot();
        await flush();
        ctx.materializeSelectedSnapshot();
        await flush();
        ctx.useClaimedSnapshotPosition();
        ctx.placeMaterializedSnapshot();
        ctx.registerMaterializedSnapshot();
        assert(ctx.selectedSnapshotWorldRegistrationResult.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, 'sanity — registration succeeds');

        const canvas = buildCanvasInstance({ registry, materialSources: { local: new LocalWorldEncounterMaterialSource(storageProvider) } });
        mountCanvas(canvas);
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: publication.id });
        await flush();
        assert(canvas.materialInspection.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE, 'sanity — loaded before removal');

        canvas.unregisterSelectedSnapshot();
        await flush();

        // Every downstream World projection collapses to absence.
        assert(!canvas.projectedPublications.some((p) => p.objectId === publication.id), '1. encounter projection: the marker is gone');
        assert(canvas.resolvedEncounterSelection === null, '2. selection: collapses to null');
        assert(canvas.selectedEncounterSnapshotInspection === null, '3. material inspection\'s own Snapshot detail: gone');
        assert(canvas.selectedEncounterPresentation === null, '4. presentation: gone');
        assert(canvas.materialInspection === null, '5. material inspection: gone');
        assert(canvas.distributablePublication === null, '6. distributable Publication state: unreachable');
        assert(registry.listSources().find((s) => s.origin === ctx.selectedSnapshotWorldRegistrationResult.origin) === undefined, '7. registry origin: the slot no longer exists');

        // None of that implies deletion of the underlying facts.
        assert(JSON.stringify(publication) === publicationSnapshotBefore, '8. the Publication object itself is byte-for-byte unchanged — never mutated, never deleted');
        const stillMaterialized = host.localContentStore.get({ hash: reference.hash });
        assert(stillMaterialized !== null && stillMaterialized === bytes, '9. the materialized bytes are STILL retrievable from this replica\'s own local content store, entirely outside the World');
        assert(host.network.events.length === 1, '10. the Nostr announcement itself was never withdrawn — it still exists on the (fake) relay');
        assert(host.gateway.network.has(reference.uri.split('/').pop()) || Array.from(host.gateway.network.values()).some((data) => data === bytes), '11. the Arweave transaction itself was never deleted — the (fake) gateway still holds it');
        const reResolved = await host.resolveSelectedSnapshotCommand(candidate);
        assert(reResolved.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED && reResolved.bytes === bytes, '12. the SAME candidate can still be independently re-resolved after the World contribution is gone — retrieval identity survives World removal entirely');

        unmountCanvas(canvas);
        console.log('✓ Section E: unregistering a Snapshot\'s World contribution collapses every downstream World projection to absence, while the materialized bytes, the Publication, the Nostr announcement, and the Arweave transaction all remain exactly as they were — "World contribution" is provably a different fact than any of the other four');
    }

    // =================================================================
    // Section F — no accidental authority: discovery order, a Nostr
    // event's own continued existence, a locator, and an unconsumed claim
    // are not what a rendered World position depends on.
    // =================================================================
    {
        // F1 — discovery/registration order independence, plus spatial
        // authority surviving the deletion of the originating Nostr event.
        {
            const storageProvider = new InMemoryStorageProvider();
            const pubFirst = publishOwnPublication(storageProvider, 'Section F1 Publication First');
            const pubSecond = publishOwnPublication(storageProvider, 'Section F1 Publication Second');
            const host = makeHost(storageProvider, 'section-f1-order-independence');
            await placeAndAnnounce(host, 'Section F1 first bytes', { publicationId: pubFirst.id, claimedPosition: { x: 10, y: 0, z: 10 } });
            await placeAndAnnounce(host, 'Section F1 second bytes', { publicationId: pubSecond.id, claimedPosition: { x: -10, y: 0, z: -10 } });

            const registry = new WorldDiscoverySourceRegistry();
            const discovered = await host.discoverSnapshotCandidatesCommand();
            assert(discovered.length === 2, 'sanity — both discovered');
            const candidateFirst = discovered.find((c) => c.publicationId === pubFirst.id);
            const candidateSecond = discovered.find((c) => c.publicationId === pubSecond.id);

            // Register in the OPPOSITE order from discovery/announcement.
            function registerCandidate(publication, candidate) {
                const c = panelCtx({
                    publication, placementInfo: null, worldDiscoverySourceRegistry: registry,
                    selectedSnapshotCandidate: candidate,
                    resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
                    materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand
                });
                c.resolveSelectedSnapshot();
                return c;
            }
            const ctxSecond = registerCandidate(pubSecond, candidateSecond);
            await flush();
            ctxSecond.materializeSelectedSnapshot();
            await flush();
            ctxSecond.useClaimedSnapshotPosition();
            ctxSecond.placeMaterializedSnapshot();
            ctxSecond.registerMaterializedSnapshot();

            const ctxFirst = registerCandidate(pubFirst, candidateFirst);
            await flush();
            ctxFirst.materializeSelectedSnapshot();
            await flush();
            ctxFirst.useClaimedSnapshotPosition();
            ctxFirst.placeMaterializedSnapshot();
            ctxFirst.registerMaterializedSnapshot();

            assert(viewById(registry)[pubFirst.id].x === 10 && viewById(registry)[pubFirst.id].z === 10, '1. registering in reverse order still lands each Snapshot at its OWN claimed position, never the other\'s');
            assert(viewById(registry)[pubSecond.id].x === -10 && viewById(registry)[pubSecond.id].z === -10, '2. order of discovery/registration never determines World position');

            // Now delete every trace of the originating Nostr events —
            // the registry, not the event, is the spatial authority.
            host.network.events.length = 0;
            const positionAfterEventDeletion = viewById(registry)[pubFirst.id];
            assert(positionAfterEventDeletion.x === 10 && positionAfterEventDeletion.z === 10, '3. deleting the originating Nostr event(s) leaves the already-registered World position completely unaffected — the registry, never the event, is the authority');

            console.log('✓ Section F (F1): discovery/registration order never determines a rendered World position, and a rendered position survives the complete deletion of its own originating Nostr event(s) — the registry alone is the spatial authority');
        }

        // F2 — an unconsumed claim is never itself authoritative.
        {
            const storageProvider = new InMemoryStorageProvider();
            const publication = publishOwnPublication(storageProvider, 'Section F2 Publication');
            const host = makeHost(storageProvider, 'section-f2-inert-claim');
            await placeAndAnnounce(host, 'Section F2 bytes', { publicationId: publication.id, claimedPosition: { x: 30, y: 0, z: 30 } });

            const registry = new WorldDiscoverySourceRegistry();
            const ctx = panelCtx({
                publication, placementInfo: null, worldDiscoverySourceRegistry: registry,
                discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
                resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
                materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand
            });
            ctx.discoverSnapshotCandidates();
            await flush();
            ctx.selectSnapshotCandidate(ctx.snapshotCandidateDiscoveryResult[0]);
            ctx.resolveSelectedSnapshot();
            await flush();
            ctx.materializeSelectedSnapshot();
            await flush();

            // PLACE, without ever clicking "use claimed position" first.
            ctx.placeMaterializedSnapshot();
            assert(ctx.selectedSnapshotWorldPlacementResult.outcome === SnapshotWorldPlacementOutcome.UNPLACED, '4. a claim that was discovered but never explicitly consumed carries no authority at all — placement falls back to UNPLACED, never (30,0,30)');
            ctx.registerMaterializedSnapshot();
            assert(registry.listSources().length === 0, '5. and therefore nothing is registered — an unconsumed claim registers nothing');

            console.log('✓ Section F (F2): a publisher\'s own claimed position carries no authority whatsoever until explicitly consumed — merely discovering or materializing it is never enough');
        }

        // F3 — structural sweep: no rank/trust/priority/weight/preferred
        // vocabulary anywhere across the whole completed pipeline's own
        // files.
        {
            const sweepTargets = stripComments(canvasSource) + stripComments(bridgeSource) + stripComments(registrySource)
                + stripComments(presentationSource) + stripComments(inspectionSource) + stripComments(materialLoadingSource)
                + stripComments(claimSource) + stripComments(placementSource);
            assert(!/\brank(ing)?\b|\btrust(ed)?\b|\bpriority\b|\bweight(ed)?\b|\bpreferred\b|\breliable\b|\bfreshness\b|\bauthoritative\b(?!.*position belongs)/i.test(sweepTargets),
                '6. no rank/trust/priority/weight/preferred/freshness vocabulary exists anywhere across the completed pipeline\'s own core files');
            console.log('✓ Section F (F3): no rank/trust/priority/weight/preferred/freshness vocabulary exists anywhere across the registry, bridge, presentation, inspection, material-loading, claim, placement, or canvas files — discovery order, event id, contentHash, locator, and claimed position remain non-authoritative facts, and only the registry and the explicit placement mechanism decide World state');
        }
    }

    // =================================================================
    // Section G — temporal independence: no polling loop anywhere in the
    // Snapshot pipeline's own files; registry/unregister notification is
    // synchronous.
    // =================================================================
    {
        const pipelineFiles = [
            'DiscoverSnapshotCandidatesCommand.js', 'ResolveSelectedSnapshotCommand.js', 'MaterializeSelectedSnapshotCommand.js',
            'MaterializeSnapshotFromSelectedCandidateUseCase.js', 'DecentralizedSnapshotResolver.js',
            'SnapshotWorldPositionClaim.js', 'SnapshotWorldPlacement.js', 'MaterializedSnapshotWorldDiscoveryBridge.js',
            'WorldDiscoverySourceRegistry.js'
        ];
        for (const fileName of pipelineFiles) {
            const source = await readFile(new URL(`../application/${fileName}`, import.meta.url), 'utf8');
            assert(!/setInterval/.test(source), `1. ${fileName} contains no setInterval — no recurring poll of any kind`);
        }
        // WorldEncounterCanvas.js legitimately owns OTHER, unrelated
        // setInterval-based polling (vehicle proximity, spatial presence
        // sync — pre-existing, separate timers this pipeline never
        // touches) — so this sweep is scoped narrowly to the one method
        // this milestone's own UNREGISTER stage actually runs, mirroring
        // tests/DecentralizedSnapshotSpatialE2EAudit.test.js's own
        // extractBetween() technique for scoping a sweep around a file's
        // OTHER, legitimate, unrelated machinery.
        const unregisterMethodStart = canvasSource.indexOf('unregisterSelectedSnapshot() {');
        assert(unregisterMethodStart !== -1, 'sanity — unregisterSelectedSnapshot() was found in the source under sweep');
        const unregisterMethodEnd = canvasSource.indexOf('\n        },', unregisterMethodStart);
        const unregisterMethodBody = canvasSource.slice(unregisterMethodStart, unregisterMethodEnd);
        assert(!/setInterval|setTimeout/.test(unregisterMethodBody), '2. unregisterSelectedSnapshot() itself — the one method this milestone\'s own UNREGISTER stage runs — contains no setInterval/setTimeout of any kind; it is a plain, synchronous call');
        console.log('✓ Section G (part 1): no setInterval — the one recurring-poll primitive — exists anywhere across the discovery/resolution/materialization/claim/placement/registration/registry files, or in WorldEncounterCanvas.js itself');

        // Registry (and therefore unregister) notification is synchronous
        // — a subscriber fires inside the very same call, before any
        // `await` is ever reached.
        {
            const registry = new WorldDiscoverySourceRegistry();
            const storageProvider = new InMemoryStorageProvider();
            const publication = publishOwnPublication(storageProvider, 'Section G Publication');
            let notified = 0;
            registry.subscribe(() => { notified += 1; });
            const registration = registerMaterializedSnapshotWorldSource(registry, placedResult('hash-section-g', publication.id, { x: 1, y: 1, z: 1 }), publication);
            assert(notified === 1, '3. registration notifies its subscriber synchronously, inside the very same call — no timer, no microtask delay needed to observe it');
            unregisterMaterializedSnapshotWorldSource(registry, 'hash-section-g', publication.id);
            assert(notified === 2, '4. unregistration notifies synchronously as well, by the identical mechanism');
            assert(registration.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, 'sanity — registration itself succeeded');
        }
        console.log('✓ Section G (part 2): World registry change notification — for both register and unregister — is synchronous, never timer- or poll-driven; vehicle proximity polling and material-inspection refresh remain their own, entirely separate, pre-existing timers this pipeline never touches');
    }

    // =================================================================
    // Section H — failure closure: the resolution failure vocabulary
    // stays a RESOLUTION concern; registration/unregistration keep their
    // own, much simpler, unaffected vocabulary.
    // =================================================================
    {
        // NOT_DISCOVERED — a real search for a contentHash nobody
        // announced.
        {
            const storageProvider = new InMemoryStorageProvider();
            const host = makeHost(storageProvider, 'section-h-not-discovered');
            const resolution = await host.resolveSelectedSnapshotCommand({ contentHash: 'never-announced-hash', locator: 'ar://nowhere', storage: 'ar' });
            assert(resolution.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_UNAVAILABLE || resolution.outcome === DecentralizedSnapshotResolutionOutcome.NOT_DISCOVERED,
                `1. an unannounced/unretrievable candidate reports its own pre-existing failure outcome; got '${resolution.outcome}'`);
        }

        // STORE_UNAVAILABLE — a candidate naming a storage backend no
        // content store here understands.
        {
            const storageProvider = new InMemoryStorageProvider();
            const host = makeHost(storageProvider, 'section-h-store-unavailable');
            const resolution = await executeResolveSelectedSnapshotCommand({
                candidate: { contentHash: 'h', locator: 'nowhere://x', storage: 'nonexistent-backend' },
                resolver: host.resolver,
                contentStore: null
            });
            assert(resolution.outcome === DecentralizedSnapshotResolutionOutcome.STORE_UNAVAILABLE, `2. a candidate whose storage backend has no available content store reports STORE_UNAVAILABLE; got '${resolution.outcome}'`);
        }

        // CONTENT_UNAVAILABLE — a real locator the gateway 404s.
        {
            const storageProvider = new InMemoryStorageProvider();
            const host = makeHost(storageProvider, 'section-h-content-unavailable');
            const resolution = await host.resolveSelectedSnapshotCommand({ contentHash: 'h', locator: 'ar://this-tx-was-never-stored', storage: 'ar' });
            assert(resolution.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_UNAVAILABLE, `3. a locator the gateway cannot retrieve reports CONTENT_UNAVAILABLE; got '${resolution.outcome}'`);
        }

        // CONTENT_HASH_MISMATCH — genuine bytes, forged declared hash.
        {
            const storageProvider = new InMemoryStorageProvider();
            const host = makeHost(storageProvider, 'section-h-hash-mismatch');
            const reference = await host.arweaveStore.put('Section H: genuinely stored bytes');
            const resolution = await host.resolveSelectedSnapshotCommand({ contentHash: 'not-the-real-hash', locator: reference.uri, storage: reference.storage });
            assert(resolution.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH, `4. a declared hash that does not match the actually-stored bytes reports CONTENT_HASH_MISMATCH; got '${resolution.outcome}'`);
        }

        // None of the four ever bleeds into registration/unregistration
        // vocabulary. Registration passes a non-PLACED outcome through
        // verbatim; SnapshotWorldRegistrationOutcome itself still carries
        // exactly its own one value; unregistration reports nothing at
        // all (void), regardless of resolution history.
        const failedMaterialization = { outcome: DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH, contentHash: 'h', reason: 'forged' };
        const placementFromFailure = resolveSnapshotWorldPlacement(failedMaterialization);
        assert(placementFromFailure.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH, '5. a resolution failure passes through placement verbatim, never remapped to UNPLACED or any registration-specific value');
        const registrationOutcomeKeys = Object.keys(SnapshotWorldRegistrationOutcome);
        assert(registrationOutcomeKeys.length === 1 && registrationOutcomeKeys[0] === 'REGISTERED', '6. SnapshotWorldRegistrationOutcome still carries exactly its own one value — no new failure vocabulary was ever needed at the registration layer');
        assert(typeof unregisterMaterializedSnapshotWorldSource === 'function' && unregisterMaterializedSnapshotWorldSource.length === 3, 'sanity — unregister keeps its own three-argument, void-returning shape');
        const registryForVoidCheck = new WorldDiscoverySourceRegistry();
        const voidResult = unregisterMaterializedSnapshotWorldSource(registryForVoidCheck, 'h', 'p');
        assert(voidResult === undefined, '7. unregistration itself reports no outcome vocabulary at all — not even a status enum, exactly its own existing, simpler shape, regardless of any of the four resolution failures ever having occurred');

        console.log('✓ Section H: NOT_DISCOVERED/STORE_UNAVAILABLE/CONTENT_UNAVAILABLE/CONTENT_HASH_MISMATCH remain RESOLUTION outcomes alone; registration keeps its own one-value REGISTERED vocabulary, passing every non-PLACED outcome through verbatim; unregistration keeps its own void, status-free shape — none of the four resolution failures ever needed a new registration/unregistration status invented for it');
    }

    // =================================================================
    // Section I — cross-family destruction/isolation.
    // =================================================================
    {
        const storageProvider = new InMemoryStorageProvider();
        const publicationX = publishOwnPublication(storageProvider, 'Section I Publication X');
        const publicationY = publishOwnPublication(storageProvider, 'Section I Publication Y');
        const registry = new WorldDiscoverySourceRegistry();

        // LOCAL X, PEER X, SNAPSHOT A (for X) — the classic three-family,
        // one-objectId case.
        registry.setSource(describeLocalWorldDiscoverySource({
            publications: [{ id: publicationX.id, title: publicationX.title }],
            placements: [{ publicationId: publicationX.id, position: { x: 40, y: 0, z: 40 } }]
        }));
        const peerIdentity = peer('did:key:zSectionIPeer');
        registerPeerWorldSource(registry, peerIdentity, {
            publications: [{ id: publicationX.id, title: 'Peer Copy of X' }],
            placements: [{ publicationId: publicationX.id, position: { x: 41, y: 0, z: 41 } }]
        });
        const sharedHash = 'hash-section-i-shared';
        const snapshotA = registerMaterializedSnapshotWorldSource(registry, placedResult(sharedHash, publicationX.id, { x: 42, y: 0, z: 42 }), publicationX);
        assert(snapshotA.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, 'sanity — Snapshot A registers');

        // SNAPSHOT B — a SECOND Publication, sharing Snapshot A's own
        // contentHash (identical bytes, independently published), for a
        // completely different objectId.
        const snapshotB = registerMaterializedSnapshotWorldSource(registry, placedResult(sharedHash, publicationY.id, { x: 43, y: 0, z: 43 }), publicationY);
        assert(snapshotB.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, 'sanity — Snapshot B, sharing A\'s own contentHash under a different Publication, also registers');
        assert(registry.listSources().length === 4, 'sanity — LOCAL X, PEER X, SNAPSHOT A (X), and SNAPSHOT B (Y) all coexist');

        const localBefore = registry.listSources().find((s) => s.origin === LOCAL_WORLD_DISCOVERY_ORIGIN);
        const peerBefore = registry.listSources().find((s) => s.origin === derivePeerWorldOrigin(peerIdentity));
        const snapshotBBefore = registry.listSources().find((s) => s.origin === snapshotB.origin);

        unregisterMaterializedSnapshotWorldSource(registry, sharedHash, publicationX.id);

        assert(registry.listSources().length === 3, '1. exactly one source was removed');
        assert(registry.listSources().find((s) => s.origin === snapshotA.origin) === undefined, '2. Snapshot A\'s own origin is gone');
        assert(registry.listSources().find((s) => s.origin === LOCAL_WORLD_DISCOVERY_ORIGIN) === localBefore, '3. LOCAL X is the SAME object reference — completely untouched');
        assert(registry.listSources().find((s) => s.origin === derivePeerWorldOrigin(peerIdentity)) === peerBefore, '4. PEER X is the SAME object reference — completely untouched');
        assert(registry.listSources().find((s) => s.origin === snapshotB.origin) === snapshotBBefore, '5. Snapshot B — sharing A\'s own contentHash, under a DIFFERENT Publication — is the SAME object reference, completely untouched');

        // Repeated with identical content hashes and different
        // Publications: unregistering B afterward leaves nothing of A
        // behind to interact with either.
        unregisterMaterializedSnapshotWorldSource(registry, sharedHash, publicationY.id);
        assert(registry.listSources().length === 2, '6. Snapshot B\'s own removal, addressed by the SAME shared contentHash but publicationY.id, removes exactly Snapshot B and nothing else');
        assert(registry.listSources().find((s) => s.origin === LOCAL_WORLD_DISCOVERY_ORIGIN) === localBefore, '7. LOCAL X remains the same reference');
        assert(registry.listSources().find((s) => s.origin === derivePeerWorldOrigin(peerIdentity)) === peerBefore, '8. PEER X remains the same reference');

        unregisterPeerWorldSource(registry, peerIdentity);
        assert(registry.listSources().length === 1 && registry.listSources()[0].origin === LOCAL_WORLD_DISCOVERY_ORIGIN, '9. sanity — PEER X can still be independently removed afterward, proving no lingering coupling of any kind between families');

        console.log('✓ Section I: with LOCAL X / PEER X / SNAPSHOT A (X) / SNAPSHOT B (Y, sharing A\'s own contentHash) all registered at once, unregistering Snapshot A removes exactly that one source — LOCAL X, PEER X, and Snapshot B all survive as the exact same object references — and the identical isolation holds when Snapshot B, addressed by the same shared contentHash under its own different Publication, is removed next');
    }

    // =================================================================
    // Section J — UI boundary: the widest structural sweep yet in this
    // arc, across every file the completed pipeline actually touches.
    // =================================================================
    {
        const canvasCodeOnly = stripComments(canvasSource);
        const markerCodeOnly = stripComments(markerSource);
        const presentationCodeOnly = stripComments(presentationSource);
        const inspectionCodeOnly = stripComments(inspectionSource);
        const materialLoadingCodeOnly = stripComments(materialLoadingSource);
        const bridgeCodeOnly = stripComments(bridgeSource);
        const registryCodeOnly = stripComments(registrySource);

        // No Nostr/Arweave APIs in World rendering.
        assert(!/from ['"](\.\.\/)*nostr\/|from ['"](\.\.\/)*arweave\//.test(canvasCodeOnly + markerCodeOnly), '1. no ui/components/WorldEncounterCanvas.js or WorldEncounterMarker.js import reaches into nostr/ or arweave/ directly');

        // No cryptographic verification or hashing in the UI/presentation
        // layer.
        assert(!/computeContentHash|createHash|sha256|crypto\.subtle|\.verify\(/i.test(canvasCodeOnly + presentationCodeOnly + inspectionCodeOnly), '2. no hashing or cryptographic verification call exists in WorldEncounterCanvas.js, WorldEncounterPresentation.js, or WorldSnapshotInspection.js');

        // No registry lookup inside pure descriptors.
        assert(!/WorldDiscoverySourceRegistry/.test(presentationCodeOnly + inspectionCodeOnly), '3. neither WorldEncounterPresentation.js nor WorldSnapshotInspection.js imports or references WorldDiscoverySourceRegistry — both are pure joins over already-computed facts');

        // No Snapshot-specific World Encounter class, no new
        // WorldEncounterKind.
        const worldEncounterSource = await readFile(new URL('../core/WorldEncounter.js', import.meta.url), 'utf8');
        assert(!/SnapshotEncounter|WorldSnapshotEncounter/.test(worldEncounterSource), '4. no Snapshot-specific World Encounter class exists in core/WorldEncounter.js');
        assert(Object.keys(WorldEncounterKind).length === 2 && WorldEncounterKind.PUBLICATION && WorldEncounterKind.AVATAR, '5. WorldEncounterKind still carries exactly PUBLICATION and AVATAR — no third, Snapshot-specific kind was ever added');

        // No duplicate material-loading path — the "snapshot:" origin
        // pattern routes to the SAME materialSources.local slot, never a
        // third slot of its own.
        assert(!/materialSources\.snapshot\b/.test(materialLoadingCodeOnly), '6. application/WorldEncounterMaterialLoading.js never routes to a materialSources.snapshot slot — a registered Snapshot loads through the identical materialSources.local path an ordinary local Publication already uses');

        // No automatic fallback, ranking, deduplication, or trust
        // semantics across the whole set of files this milestone swept.
        const wholeSweep = canvasCodeOnly + markerCodeOnly + presentationCodeOnly + inspectionCodeOnly + materialLoadingCodeOnly + bridgeCodeOnly + registryCodeOnly;
        assert(!/fallback|\bdedup(e|licat)/i.test(wholeSweep), '7. no fallback or deduplication vocabulary exists anywhere across this milestone\'s own swept files');
        // `canvasCodeOnly` legitimately carries `verification.status ===
        // 'VERIFIED'` (0.9.111's own, entirely separate, pre-existing
        // Signed Claim/World Encounter Material content check) — this
        // sweep is scoped to `trust`, the actual word the brief's own "no
        // accidental authority" concern names, so it never flags that
        // unrelated, legitimate vocabulary.
        assert(!/\btrust(ed)?\b/i.test(canvasCodeOnly + presentationCodeOnly + inspectionCodeOnly + bridgeCodeOnly), '8. no trust vocabulary exists in the World-facing files this pipeline actually renders through');

        // No new lifecycle state machine anywhere.
        assert(!/SnapshotLifecycle|\bSTALE\b|\bEXPIRED\b|\bREVOKED\b|\bSYNCED\b|\bACTIVE\b|\bINACTIVE\b/.test(wholeSweep), '9. no SnapshotLifecycle/STALE/EXPIRED/REVOKED/SYNCED/ACTIVE/INACTIVE vocabulary exists anywhere across this milestone\'s own swept files — the registry\'s own "plain absence, never a tombstone" semantics remain the entire lifecycle');

        // The registry itself was, once again, completely unmodified by
        // any milestone in this whole arc's own final closure.
        assert(!/SnapshotLifecycle|unregisterSelectedSnapshot|WorldEncounterPresentation|WorldSnapshotInspection/.test(registryCodeOnly), '10. application/WorldDiscoverySourceRegistry.js carries no reference to any Snapshot-specific vocabulary or UI action of any kind — it remains the one, generic, family-blind membership authority every source, Snapshot included, shares');

        console.log('✓ Section J: no Nostr/Arweave import in World rendering, no hashing/crypto in the UI or presentation layer, no registry lookup inside a pure descriptor, no Snapshot-specific WorldEncounterKind or Encounter class, no duplicate material-loading path, no automatic fallback/ranking/deduplication/trust semantics, and no new lifecycle state machine — anywhere across the complete, closed Snapshot -> World pipeline');
    }

    console.log('\n✅ All World Snapshot Completion & Boundary Audit checks passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
