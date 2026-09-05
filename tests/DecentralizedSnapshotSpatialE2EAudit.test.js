import OwnPublicationPanel from '../ui/components/OwnPublicationPanel.js';
import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import { resolveSnapshotWorldPositionClaim } from '../application/SnapshotWorldPositionClaim.js';
import { SnapshotWorldPositionClaimOutcome } from '../application/SnapshotWorldPositionClaimOutcome.js';
import { resolveSnapshotWorldPlacement } from '../application/SnapshotWorldPlacement.js';
import { SnapshotWorldPlacementOutcome } from '../application/SnapshotWorldPlacementOutcome.js';
import {
    registerMaterializedSnapshotWorldSource,
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
import { LocalWorldEncounterMaterialSource } from '../application/LocalWorldEncounterMaterialSource.js';
import { WorldEncounterMaterialLoadStatus } from '../application/WorldEncounterMaterialLoading.js';
import { WorldEncounterKind } from '../core/WorldEncounter.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { ArweaveContentStore } from '../content/ArweaveContentStore.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { PlacementRecord } from '../core/PlacementRecord.js';
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

// 0.9.173 — Decentralized Snapshot Spatial E2E Audit.
//
// 0.9.171 taught a Snapshot discovery candidate to CARRY a publisher's own
// position claim; 0.9.172 taught `ui/components/OwnPublicationPanel.js` to
// explicitly CONSUME one, one seam short of the World itself. Neither
// milestone ever drove a claim all the way through REGISTRATION into a
// live `WorldDiscoverySourceRegistry`, a real `WorldEncounterCanvas`
// projection, a Wanderer's own selection, or ordinary World material
// loading — the exact remaining question this **test-only** audit answers:
// does a Snapshot published by someone else, carrying only a publisher's
// own claimed position, genuinely travel the complete decentralized path
// and arrive in World View AT that position, coexisting correctly with
// every other identity boundary this codebase already holds? No
// production file is added or modified by this milestone.
//
//   PUBLISH -> DISCOVER -> SELECT -> RESOLVE -> VERIFY -> MATERIALIZE
//     -> CONSUME CLAIM -> PLACE -> REGISTER -> WORLD ENCOUNTER -> SELECT
//     -> LOAD MATERIAL -> RENDER
//
// Section A: FLAGSHIP — a complete stranger Snapshot, carrying only a
//            publisher-claimed position (no pre-existing local placement
//            at all), travels the entire path above and renders at the
//            claimed position, through the real, unmodified production
//            machinery throughout.
// Section B: the claimed position's own x/y/z survive DISCOVER -> claim
//            consumption -> PLACE -> REGISTER -> World Encounter row ->
//            projected canvas coordinates bit-for-bit, verified against
//            WorldEncounterCanvas's own known projectToCanvas() formula.
// Section C: publisher identity binding — a claim addressed to Publication
//            A can never be consumed by Publication B, including when
//            both share an identical contentHash, all the way through
//            registration (nothing is ever registered for the mismatched
//            target).
// Section D: receiver-local placement vs. claimed placement — two
//            deliberately different, intentional behaviors, plus the
//            ABSENT/MISMATCHED/CLAIMED distinction made observable BEFORE
//            any placement fallback decision is made.
// Section E: explicit consumption only — DISCOVER -> SELECT -> RESOLVE ->
//            MATERIALIZE never repositions anything; only an explicit
//            useClaimedSnapshotPosition() call changes what
//            placeMaterializedSnapshot() borrows.
// Section F: placement identity — `claim:<contentHash>:<publicationId>` is
//            deterministic, distinct between Publications, independent of
//            locator and of the underlying Nostr event id, and is never
//            written into `placement/LocalPlacementRegistry.js`.
// Section G: spatial authority — once a claim is consumed, the resulting
//            World placement (never the Nostr event) is what
//            `WorldDiscoverySourceRegistry` -> `WorldEncounter` ->
//            `projectToCanvas()` -> marker position all derive from;
//            structural sweep confirms no involved file imports Nostr.
// Section H: material independence — changing a claimed position changes
//            no content-identity fact (contentHash/locator/storage/
//            retrieved bytes/verification outcome).
// Section I: rendering convergence — a claimed Snapshot's World Encounter
//            reaches the exact same WorldEncounterCanvas/WorldEncounterMarker
//            machinery a local Publication's own encounter already does;
//            structural sweep confirms no `if snapshot ...` rendering
//            branch exists in either file.
// Section J: failure and legacy vocabulary — ABSENT, MISMATCHED,
//            unavailable material, invalid resolution, and failed
//            materialization all still produce their own pre-existing,
//            unmodified outcome vocabulary, never a new one invented here.
// Section K: FULL FLAGSHIP — two Publications, IDENTICAL Snapshot bytes
//            (one shared contentHash), two independent claimed positions,
//            registered and rendered SIMULTANEOUSLY in one running World —
//            they coexist at two distinct positions and load two distinct
//            Publications, never merged, never averaged, never collided.
//
// DELIBERATELY NOT SOLVED HERE — MULTIPLE CLAIMS FOR ONE PUBLICATION.
// Nothing in this codebase reconciles, ranks, timestamps, or trusts among
// several announcements naming the SAME Publication with DIFFERENT
// claimed positions — `application/SnapshotWorldPositionClaim.js`'s own
// header already names this "deliberately excluded," and this audit does
// not change that. Section F's own final assertions merely document, as
// an observed fact rather than a gap this milestone attempts to close,
// that several valid claims can coexist unranked and that the CURRENT
// explicit-candidate-selection mechanism (0.9.151) is what decides which
// one is ever consumed — never a "latest wins," "most trusted," or
// "highest position count" policy of any kind.

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

// A minimal, real Document — mirrors tests/SnapshotWorldEncounterMaterialLoading.test.js's
// own createTestDocument() exactly, so publishing goes through the real
// validation path.
function createTestDocument(title) {
    const world = new World();
    const building = new Building({ creator: 'tester' });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0), rotation: 0 }));
    world.addBuilding(building);
    return new Document({ world, metadata: new DocumentMetadata({ title, author: 'tester' }) });
}

// The local receiver's own, genuinely published Publication — the SAME
// real object ui/components/OwnPublicationPanel.js's own `publication`
// prop always is.
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
        return { id: `fake-0-9-173-tx-${counter}`, transaction: { id: `fake-0-9-173-tx-${counter}`, data: material } };
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

// A full, real decentralized host: a real (fake-transport-backed)
// ArweaveContentStore, a real NostrSnapshotDiscoveryPublisher/
// NostrSnapshotDiscoveryQueryService pair, a real DecentralizedSnapshotResolver,
// and a real local materialization boundary writing into the SAME
// `storageProvider` the receiver's own Publication(s) already live in —
// so `application/LocalWorldEncounterMaterialSource.js` can later find
// both.
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

// Places real bytes on the (fake-backed) Arweave store and genuinely
// announces them over the (fake-backed) Nostr network — optionally
// carrying a publisher's own position claim, exactly as
// application/SnapshotDistributionCommand.js's own real callers already
// do.
async function placeAndAnnounce(host, bytes, { publicationId, claimedPosition } = {}) {
    const reference = await host.arweaveStore.put(bytes);
    await host.discoveryPublisher.publish({
        contentHash: reference.hash, locator: reference.uri, storage: reference.storage,
        publicationId, claimedPosition
    });
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

// The real `ui/components/OwnPublicationPanel.js` interaction surface,
// invoked exactly the way tests/SnapshotWorldPositionClaimConsumption.test.js's
// own panelCtx() already does — extended with the 0.9.160
// `worldDiscoverySourceRegistry`/`registerMaterializedSnapshot` pair this
// milestone's own REGISTER stage needs, which that suite never exercised.
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

// Mirrors tests/SnapshotWorldEncounterMaterialLoading.test.js's own
// buildCanvasInstance()/mountCanvas()/projectedPublicationsOf() exactly —
// a real, mounted WorldEncounterCanvas, driven by its own `computed`/
// `methods` dictionaries directly rather than a full Vue render, the same
// "call computed.call(ctx)" discipline this codebase's UI tests already
// established.
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

// WorldEncounterCanvas.js's own fixed, private projection constants
// (WORLD_HALF_SPAN = 50, CANVAS_SIZE = 600) — reproduced here exactly the
// way tests/WorldEncounterCanvasUI.test.js's own Section B already does,
// so Section B/K below can assert exact expected canvas coordinates
// rather than merely "some number."
function expectedCanvasCoordinate(worldValue) {
    return 300 + (worldValue / 50) * 300;
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP: a complete stranger Snapshot, carrying only a
    // publisher's own claimed position (NO pre-existing local placement
    // at all), travels PUBLISH -> ... -> RENDER end to end.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        // The receiver's own real Publication — but, critically, it has
        // NEVER been placed anywhere in this replica's own
        // LocalPlacementRegistry: `placementInfo` will be `null`
        // throughout. Whatever World position this Snapshot ends up at
        // can only have come from the publisher's own claim.
        const publication = publishOwnPublication(storageProvider, 'Section A Stranger Publication');

        const host = makeHost(storageProvider, 'section-a-flagship');
        const bytes = 'Section A: a complete stranger Snapshot, recoverable only through its own publisher-claimed position';
        const claimedPosition = { x: 100, y: 5, z: -50 };
        await placeAndAnnounce(host, bytes, { publicationId: publication.id, claimedPosition });

        const registry = new WorldDiscoverySourceRegistry();
        const ctx = panelCtx({
            publication,
            placementInfo: null,
            worldDiscoverySourceRegistry: registry,
            discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
            resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
            materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand
        });

        // DISCOVER
        ctx.discoverSnapshotCandidates();
        await flushMicrotasks();
        assert(ctx.snapshotCandidateDiscoveryResult.length === 1, '1. exactly one real, discovered candidate');
        const candidate = ctx.snapshotCandidateDiscoveryResult[0];
        assert(candidate.publicationId === publication.id, '2. the discovered candidate carries the publisher\'s own claim, addressed to this exact Publication');

        // SELECT
        ctx.selectSnapshotCandidate(candidate);
        assert(ctx.selectedSnapshotCandidate === candidate, '3. selection is a plain, explicit assignment');

        // RESOLVE
        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();
        assert(ctx.selectedSnapshotResolutionResult.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, '4. resolution genuinely succeeds — location and retrieval both passed');
        assert(ctx.selectedSnapshotResolutionResult.bytes === bytes, '5. the resolved bytes are byte-identical to what the stranger originally published');

        // VERIFY — made explicit: the resolved bytes still hash to the
        // originally announced contentHash.
        assert(computeContentHash(ctx.selectedSnapshotResolutionResult.bytes) === candidate.contentHash, '6. VERIFY — the resolved bytes still hash to the candidate\'s own declared contentHash');

        // MATERIALIZE
        ctx.materializeSelectedSnapshot();
        await flushMicrotasks();
        assert(
            ctx.selectedSnapshotMaterializationResult.outcome === SnapshotCandidateMaterializationOutcome.STORED
            || ctx.selectedSnapshotMaterializationResult.outcome === SnapshotCandidateMaterializationOutcome.ALREADY_AVAILABLE,
            `7. materialization genuinely succeeds; got '${ctx.selectedSnapshotMaterializationResult.outcome}'`
        );

        // CONSUME CLAIM — the one explicit seam this milestone's own
        // predecessor (0.9.172) added.
        ctx.useClaimedSnapshotPosition();
        assert(ctx.selectedSnapshotWorldPositionClaimResult.outcome === SnapshotWorldPositionClaimOutcome.CLAIMED, '8. the claim, addressed to this exact Publication, is consumed');
        assert(
            ctx.selectedSnapshotWorldPositionClaimResult.position.x === 100
            && ctx.selectedSnapshotWorldPositionClaimResult.position.y === 5
            && ctx.selectedSnapshotWorldPositionClaimResult.position.z === -50,
            '9. the consumed claim carries the publisher\'s own exact position'
        );

        // PLACE
        ctx.placeMaterializedSnapshot();
        assert(ctx.selectedSnapshotWorldPlacementResult.outcome === SnapshotWorldPlacementOutcome.PLACED, '10. placement genuinely succeeds, from the consumed claim alone — there is no local placementInfo to fall back to');
        assert(
            ctx.selectedSnapshotWorldPlacementResult.position.x === 100
            && ctx.selectedSnapshotWorldPlacementResult.position.y === 5
            && ctx.selectedSnapshotWorldPlacementResult.position.z === -50,
            '11. the placement\'s own position is exactly the publisher\'s claimed position — never (0,0,0), never fabricated'
        );

        // REGISTER
        ctx.registerMaterializedSnapshot();
        assert(ctx.selectedSnapshotWorldRegistrationResult.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, '12. registration genuinely succeeds');
        const expectedOrigin = materializedSnapshotWorldOrigin(ctx.selectedSnapshotMaterializationResult.contentHash, publication.id);
        assert(ctx.selectedSnapshotWorldRegistrationResult.origin === expectedOrigin, '13. the registered origin is exactly the derived snapshot:<contentHash>:<publicationId> string');

        // WORLD ENCOUNTER — the real, unmodified WorldEncounterCanvas,
        // observing the SAME registry.
        const canvas = buildCanvasInstance({ registry });
        mountCanvas(canvas);
        const projected = projectedPublicationsOf(canvas);
        assert(projected.some((p) => p.objectId === publication.id), '14. the registered stranger Snapshot reaches a rendered World Encounter marker');
        const raw = viewById(registry)[publication.id];
        assert(raw.x === 100 && raw.y === 5 && raw.z === -50, '15. the rendered World Encounter carries exactly the publisher\'s claimed position, never a locally-invented one');

        // SELECT (the Wanderer)
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: publication.id });
        assert(canvas.selectionOutcome.status === 'RESOLVED', '16. the Wanderer\'s selection resolves unambiguously');
        assert(canvas.resolvedEncounterSelection.origin === expectedOrigin, '17. the resolved selection carries exactly the registered Snapshot\'s own origin');

        // LOAD MATERIAL — the ordinary, unmodified World material loading
        // path, using the SAME storageProvider the Publication and its
        // materialized Snapshot content both already live in.
        canvas.materialSources = { local: new LocalWorldEncounterMaterialSource(storageProvider) };
        canvas.refreshMaterialInspection();
        await flushMicrotasks();

        // RENDER
        assert(canvas.materialInspection !== null, '18. FLAGSHIP — the full pipeline ends in a real material inspection result');
        assert(canvas.materialInspection.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE, `19. FLAGSHIP — the discovered, resolved, verified, materialized, claim-placed, registered stranger Snapshot now loads AVAILABLE material; got '${canvas.materialInspection.loading.status}'`);
        assert(canvas.materialInspection.loading.material instanceof Publication && canvas.materialInspection.loading.material.id === publication.id, '20. FLAGSHIP — the rendered material is the exact, real Publication this pipeline started from');

        unmountCanvas(canvas);
        console.log('✓ Section A: FLAGSHIP — a complete stranger Snapshot with no pre-existing local placement travels PUBLISH through RENDER and lands exactly at the publisher\'s own claimed position');
    }

    // ---------------------------------------------------------------
    // Section B — the claimed position's own x/y/z survive every stage
    // bit-for-bit, including the projected screen coordinates.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const publication = publishOwnPublication(storageProvider, 'Section B Publication');
        const host = makeHost(storageProvider, 'section-b-preservation');
        const bytes = 'Section B: exact position preservation, non-trivial coordinates';
        // Deliberately non-integer, non-zero on every axis, so no
        // transformation, rounding, or accidental (0,0,0) default could
        // ever pass unnoticed.
        const claimedPosition = { x: 25, y: -3.5, z: -25 };
        await placeAndAnnounce(host, bytes, { publicationId: publication.id, claimedPosition });

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
        assert(candidate.claimedPosition.x === 25 && candidate.claimedPosition.y === -3.5 && candidate.claimedPosition.z === -25, '1. DISCOVER — the envelope\'s own claimed position arrives unchanged');

        ctx.selectSnapshotCandidate(candidate);
        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();
        ctx.materializeSelectedSnapshot();
        await flushMicrotasks();

        ctx.useClaimedSnapshotPosition();
        const claim = ctx.selectedSnapshotWorldPositionClaimResult;
        assert(claim.position.x === 25 && claim.position.y === -3.5 && claim.position.z === -25, '2. CONSUME CLAIM — resolveSnapshotWorldPositionClaim() reports the identical x/y/z');

        ctx.placeMaterializedSnapshot();
        const placement = ctx.selectedSnapshotWorldPlacementResult;
        assert(placement.position.x === 25 && placement.position.y === -3.5 && placement.position.z === -25, '3. PLACE — resolveSnapshotWorldPlacement() borrows the identical x/y/z');

        ctx.registerMaterializedSnapshot();
        assert(ctx.selectedSnapshotWorldRegistrationResult.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, '4. REGISTER — registration succeeds');

        const raw = viewById(registry)[publication.id];
        assert(raw.x === 25 && raw.y === -3.5 && raw.z === -25, '5. WORLD ENCOUNTER — the derived World Encounter row carries the identical x/y/z');

        const canvas = buildCanvasInstance({ registry });
        mountCanvas(canvas);
        const projected = projectedPublicationsOf(canvas).find((p) => p.objectId === publication.id);
        assert(projected.x === expectedCanvasCoordinate(25), `6. RENDER — projected canvas X is exactly WorldEncounterCanvas.js's own known projectToCanvas(25) = ${expectedCanvasCoordinate(25)}, got ${projected.x}`);
        assert(projected.y === expectedCanvasCoordinate(-25), `7. RENDER — projected canvas Y is exactly projectToCanvas(-25) = ${expectedCanvasCoordinate(-25)} (world z, never world y/elevation), got ${projected.y}`);
        unmountCanvas(canvas);

        console.log('✓ Section B: the publisher\'s own claimed position survives DISCOVER -> CONSUME CLAIM -> PLACE -> REGISTER -> World Encounter -> projected canvas coordinates, bit-for-bit');
    }

    // ---------------------------------------------------------------
    // Section C — publisher identity binding: a claim for Publication A
    // can never be consumed by Publication B, all the way through
    // registration, including when both share an identical contentHash.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const publicationA = publishOwnPublication(storageProvider, 'Section C Publication A');
        const publicationB = publishOwnPublication(storageProvider, 'Section C Publication B');

        const sharedBytes = 'Section C: identical Snapshot bytes, a claim addressed only to Publication A';
        const contentHash = computeContentHash(sharedBytes);
        const candidate = { contentHash, locator: 'ar://section-c', storage: 'ar', publicationId: publicationA.id, claimedPosition: { x: 8, y: 8, z: 8 } };

        // The identity check itself, run against the WRONG target.
        const crossed = resolveSnapshotWorldPositionClaim(candidate, publicationB.id);
        assert(crossed.outcome === SnapshotWorldPositionClaimOutcome.MISMATCHED, '1. a claim addressed to Publication A is MISMATCHED when checked against Publication B, despite sharing the same contentHash');
        assert(crossed.position === null, '2. a mismatched claim never leaks the claimed position');

        // Driven end to end through the real panel/registry: attempting
        // to place Publication B using Publication A's own claim (no
        // local placementInfo exists for B either) falls back to
        // UNPLACED — never Publication A's own (8,8,8).
        const registry = new WorldDiscoverySourceRegistry();
        const ctxB = panelCtx({
            publication: publicationB,
            placementInfo: null,
            worldDiscoverySourceRegistry: registry,
            selectedSnapshotCandidate: candidate,
            selectedSnapshotMaterializationResult: { outcome: SnapshotCandidateMaterializationOutcome.STORED, contentHash, contentReference: { hash: contentHash, uri: 'local://section-c', storage: 'local' }, reason: null, source: 'CANDIDATE' }
        });
        ctxB.useClaimedSnapshotPosition();
        assert(ctxB.selectedSnapshotWorldPositionClaimResult.outcome === SnapshotWorldPositionClaimOutcome.MISMATCHED, '3. the panel itself reports MISMATCHED for Publication B');
        ctxB.placeMaterializedSnapshot();
        assert(ctxB.selectedSnapshotWorldPlacementResult.outcome === SnapshotWorldPlacementOutcome.UNPLACED, '4. placement for Publication B falls back to UNPLACED — Publication A\'s own claimed position is never borrowed');
        ctxB.registerMaterializedSnapshot();
        assert(ctxB.selectedSnapshotWorldRegistrationResult.outcome === SnapshotWorldPlacementOutcome.UNPLACED, '5. registration reports that SAME UNPLACED outcome, unchanged, and registers nothing');
        assert(registry.listSources().length === 0, '6. NOTHING was ever registered into the World for Publication B out of Publication A\'s own claim');

        // The SAME candidate, checked/placed/registered against its OWN,
        // correctly-addressed Publication A, succeeds normally.
        const ctxA = panelCtx({
            publication: publicationA,
            placementInfo: null,
            worldDiscoverySourceRegistry: registry,
            selectedSnapshotCandidate: candidate,
            selectedSnapshotMaterializationResult: { outcome: SnapshotCandidateMaterializationOutcome.STORED, contentHash, contentReference: { hash: contentHash, uri: 'local://section-c', storage: 'local' }, reason: null, source: 'CANDIDATE' }
        });
        ctxA.useClaimedSnapshotPosition();
        ctxA.placeMaterializedSnapshot();
        ctxA.registerMaterializedSnapshot();
        assert(ctxA.selectedSnapshotWorldRegistrationResult.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, '7. the SAME claim, checked against its OWN Publication, registers correctly');
        assert(registry.listSources().length === 1, '8. exactly one World source now exists — Publication A\'s own, never a phantom entry for B');
        const raw = viewById(registry)[publicationA.id];
        assert(raw.x === 8 && raw.y === 8 && raw.z === 8, '9. Publication A\'s own World row carries exactly its own claimed position');

        console.log('✓ Section C: a claim addressed to one Publication is never consumable by another, all the way through World registration, even under an identical contentHash');
    }

    // ---------------------------------------------------------------
    // Section D — receiver-local placement vs. claimed placement: two
    // intentional, distinct behaviors — plus ABSENT/MISMATCHED/CLAIMED
    // made observable BEFORE any fallback decision.
    // ---------------------------------------------------------------
    {
        const contentHash = computeContentHash('Section D content');

        // ABSENT — no claim at all (every pre-0.9.171 announcement).
        const absentCandidate = { contentHash, locator: 'ar://d-absent', storage: 'ar' };
        const absent = resolveSnapshotWorldPositionClaim(absentCandidate, 'publication-d');
        assert(absent.outcome === SnapshotWorldPositionClaimOutcome.ABSENT, '1. no claim at all -> ABSENT, observed directly');

        // MISMATCHED — a real claim exists, addressed elsewhere.
        const mismatchedCandidate = { contentHash, locator: 'ar://d-mismatched', storage: 'ar', publicationId: 'someone-elses-publication', claimedPosition: { x: 77, y: 77, z: 77 } };
        const mismatched = resolveSnapshotWorldPositionClaim(mismatchedCandidate, 'publication-d');
        assert(mismatched.outcome === SnapshotWorldPositionClaimOutcome.MISMATCHED, '2. a claim addressed to a DIFFERENT Publication -> MISMATCHED, observed directly');

        // The subtle point this milestone was explicitly asked to protect:
        // MISMATCHED must never collapse into, or become indistinguishable
        // from, ABSENT — even though both currently drive placement to the
        // SAME eventual fallback.
        assert(absent.outcome !== mismatched.outcome, '3. ABSENT and MISMATCHED remain two DIFFERENT, individually observable outcomes — never folded into one');
        assert(absent.position === null && mismatched.position === null, '4. sanity — both report position: null, which is exactly why the OUTCOME field, not the position field, must carry the distinction');

        // CLAIMED — a real claim, correctly addressed.
        const claimedCandidate = { contentHash, locator: 'ar://d-claimed', storage: 'ar', publicationId: 'publication-d', claimedPosition: { x: 3, y: 3, z: 3 } };
        const claimed = resolveSnapshotWorldPositionClaim(claimedCandidate, 'publication-d');
        assert(claimed.outcome === SnapshotWorldPositionClaimOutcome.CLAIMED, '5. a correctly-addressed claim -> CLAIMED, observed directly, distinct from both of the above');

        // Now the two INTENTIONALLY different placement behaviors,
        // end to end: no claim -> the receiver's own existing local
        // placement; a valid consumed claim -> the publisher's own
        // claimed position. Never the same position by coincidence.
        const storageProvider = new InMemoryStorageProvider();
        const publication = publishOwnPublication(storageProvider, 'Section D Publication');
        const placementRegistry = new LocalPlacementRegistry(storageProvider);
        placeReal(placementRegistry, publication.id, new Position(1, 1, 1));
        const receiverLocalPlacementInfo = placementInfoFor(placementRegistry, publication.id);

        const host = makeHost(storageProvider, 'section-d-behaviors');
        const bytes = 'Section D: same Snapshot bytes, published once with no claim and once with a claim';

        // D-i — no claim: the RECEIVER's own existing (1,1,1) local
        // placement is used.
        {
            const registry = new WorldDiscoverySourceRegistry();
            await placeAndAnnounce(host, bytes); // no publicationId/claimedPosition at all
            const ctx = panelCtx({
                publication, placementInfo: receiverLocalPlacementInfo, worldDiscoverySourceRegistry: registry,
                discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
                resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
                materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand
            });
            ctx.discoverSnapshotCandidates();
            await flushMicrotasks();
            const candidate = ctx.snapshotCandidateDiscoveryResult.find((c) => !('publicationId' in c));
            ctx.selectSnapshotCandidate(candidate);
            ctx.resolveSelectedSnapshot();
            await flushMicrotasks();
            ctx.materializeSelectedSnapshot();
            await flushMicrotasks();
            ctx.useClaimedSnapshotPosition();
            assert(ctx.selectedSnapshotWorldPositionClaimResult.outcome === SnapshotWorldPositionClaimOutcome.ABSENT, '6. D-i — no claim on this candidate -> ABSENT');
            ctx.placeMaterializedSnapshot();
            assert(ctx.selectedSnapshotWorldPlacementResult.position.x === 1 && ctx.selectedSnapshotWorldPlacementResult.position.y === 1 && ctx.selectedSnapshotWorldPlacementResult.position.z === 1,
                '7. D-i — with no claim, placement is the RECEIVER\'s own existing local (1,1,1), never any other value');
        }

        // D-ii — a valid, correctly-addressed claim: the PUBLISHER's own
        // (9,9,9), even though the SAME receiver still has its own
        // (1,1,1) local placement sitting right there, unused.
        {
            const registry = new WorldDiscoverySourceRegistry();
            await placeAndAnnounce(host, bytes + ' (claimed variant)', { publicationId: publication.id, claimedPosition: { x: 9, y: 9, z: 9 } });
            const ctx = panelCtx({
                publication, placementInfo: receiverLocalPlacementInfo, worldDiscoverySourceRegistry: registry,
                discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
                resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
                materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand
            });
            ctx.discoverSnapshotCandidates();
            await flushMicrotasks();
            const candidate = ctx.snapshotCandidateDiscoveryResult.find((c) => c.publicationId === publication.id);
            ctx.selectSnapshotCandidate(candidate);
            ctx.resolveSelectedSnapshot();
            await flushMicrotasks();
            ctx.materializeSelectedSnapshot();
            await flushMicrotasks();
            ctx.useClaimedSnapshotPosition();
            assert(ctx.selectedSnapshotWorldPositionClaimResult.outcome === SnapshotWorldPositionClaimOutcome.CLAIMED, '8. D-ii — a correctly-addressed claim -> CLAIMED');
            ctx.placeMaterializedSnapshot();
            assert(ctx.selectedSnapshotWorldPlacementResult.position.x === 9 && ctx.selectedSnapshotWorldPlacementResult.position.y === 9 && ctx.selectedSnapshotWorldPlacementResult.position.z === 9,
                '9. D-ii — with a consumed claim, placement is the PUBLISHER\'s own (9,9,9) — the receiver\'s own (1,1,1) local placement, though it still exists, is never used');
        }

        console.log('✓ Section D: ABSENT/MISMATCHED/CLAIMED remain three individually observable outcomes, and receiver-local placement vs. publisher-claimed placement remain two intentionally different, correctly-selected behaviors');
    }

    // ---------------------------------------------------------------
    // Section E — explicit consumption only: DISCOVER -> SELECT ->
    // RESOLVE -> MATERIALIZE never repositions anything on their own.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const publication = publishOwnPublication(storageProvider, 'Section E Publication');
        const host = makeHost(storageProvider, 'section-e-explicit');
        const bytes = 'Section E: explicit consumption only, never automatic';
        await placeAndAnnounce(host, bytes, { publicationId: publication.id, claimedPosition: { x: 11, y: 12, z: 13 } });

        const registry = new WorldDiscoverySourceRegistry();
        const ctx = panelCtx({
            publication, placementInfo: null, worldDiscoverySourceRegistry: registry,
            discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
            resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
            materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand
        });

        ctx.discoverSnapshotCandidates();
        await flushMicrotasks();
        assert(ctx.selectedSnapshotWorldPositionClaimResult === null, '1. DISCOVER alone never computes a claim result');
        assert(ctx.selectedSnapshotWorldPlacementResult === null, '2. DISCOVER alone never places anything');
        assert(registry.listSources().length === 0, '3. DISCOVER alone never touches the World registry');

        const candidate = ctx.snapshotCandidateDiscoveryResult[0];
        ctx.selectSnapshotCandidate(candidate);
        assert(ctx.selectedSnapshotWorldPositionClaimResult === null, '4. SELECT alone never computes a claim result');
        assert(registry.listSources().length === 0, '5. SELECT alone never touches the World registry');

        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();
        ctx.materializeSelectedSnapshot();
        await flushMicrotasks();
        assert(ctx.selectedSnapshotWorldPositionClaimResult === null, '6. RESOLVE + MATERIALIZE never automatically consume the candidate\'s own claim');
        assert(ctx.selectedSnapshotWorldPlacementResult === null, '7. RESOLVE + MATERIALIZE never place anything');
        assert(registry.listSources().length === 0, '8. RESOLVE + MATERIALIZE never touch the World registry');

        // Calling PLACE before ever consuming the claim still respects
        // the gate — with no claim consumed yet, placement falls back to
        // `placementInfo` (null here), never peeking at the candidate's
        // own claimedPosition directly.
        ctx.placeMaterializedSnapshot();
        assert(ctx.selectedSnapshotWorldPlacementResult.outcome === SnapshotWorldPlacementOutcome.UNPLACED, '9. placing BEFORE consuming the claim falls back to UNPLACED, never (11,12,13) — the claim is inert until explicitly consumed, regardless of call order');
        ctx.registerMaterializedSnapshot();
        assert(registry.listSources().length === 0, '10. and therefore nothing is registered yet either');

        // Only now, the explicit click.
        ctx.useClaimedSnapshotPosition();
        assert(ctx.selectedSnapshotWorldPositionClaimResult.outcome === SnapshotWorldPositionClaimOutcome.CLAIMED, '11. only the explicit useClaimedSnapshotPosition() click consumes the claim');
        assert(ctx.selectedSnapshotWorldPlacementResult === null, '12. consuming the claim alone still places nothing — placeMaterializedSnapshot() clears the stale UNPLACED result but computes no new one until clicked again');

        ctx.placeMaterializedSnapshot();
        assert(ctx.selectedSnapshotWorldPlacementResult.outcome === SnapshotWorldPlacementOutcome.PLACED, '13. only NOW does the explicit placement click apply the consumed claim');
        assert(ctx.selectedSnapshotWorldPlacementResult.position.x === 11 && ctx.selectedSnapshotWorldPlacementResult.position.y === 12 && ctx.selectedSnapshotWorldPlacementResult.position.z === 13, '14. the applied position is exactly the publisher\'s own claimed position');

        assert(registry.listSources().length === 0, '15. and STILL nothing is registered — REGISTER remains its own separate, explicit click');
        ctx.registerMaterializedSnapshot();
        assert(registry.listSources().length === 1, '16. only the explicit registerMaterializedSnapshot() click finally makes the claimed placement observable to the running World');

        console.log('✓ Section E: DISCOVER -> SELECT -> RESOLVE -> MATERIALIZE never reposition or register anything; only the explicit consume -> place -> register click sequence does, in that order, regardless of when placement is attempted');
    }

    // ---------------------------------------------------------------
    // Section F — placement identity: deterministic, distinct between
    // Publications, independent of locator/event id, never written into
    // LocalPlacementRegistry.
    // ---------------------------------------------------------------
    {
        const contentHash = 'shared-content-hash-section-f';

        // Deterministic — calling the whole consume-and-place sequence
        // twice, for the SAME contentHash/publicationId pair, produces
        // the IDENTICAL synthetic placementId both times.
        function claimPlacementId(publicationId, cHash = contentHash) {
            const candidate = { contentHash: cHash, locator: `ar://f-${Math.random()}`, storage: 'ar', publicationId, claimedPosition: { x: 1, y: 1, z: 1 } };
            const materialization = { outcome: SnapshotCandidateMaterializationOutcome.STORED, contentHash: cHash, contentReference: { hash: cHash, uri: 'local://f', storage: 'local' }, reason: null, source: 'CANDIDATE' };
            const claim = resolveSnapshotWorldPositionClaim(candidate, publicationId);
            const effectivePlacementInfo = Object.freeze({
                placementId: `claim:${materialization.contentHash}:${publicationId}`,
                publicationId,
                position: claim.position
            });
            return resolveSnapshotWorldPlacement(materialization, effectivePlacementInfo).placementId;
        }

        const firstCall = claimPlacementId('publication-f-1');
        const secondCall = claimPlacementId('publication-f-1');
        assert(firstCall === secondCall, `1. deterministic — the SAME contentHash/publicationId pair always derives the SAME placementId ('${firstCall}')`);
        assert(firstCall === `claim:${contentHash}:publication-f-1`, '2. the placementId is exactly claim:<contentHash>:<publicationId>');

        // Distinct between Publications.
        const otherPublication = claimPlacementId('publication-f-2');
        assert(firstCall !== otherPublication, '3. distinct — a DIFFERENT publicationId derives a DIFFERENT placementId, even for the identical contentHash');

        // Independent of locator — two candidates for the identical
        // contentHash/publicationId, but genuinely different locators,
        // still derive the identical placementId (claimPlacementId()
        // itself already randomizes the locator on every call above).
        const thirdCall = claimPlacementId('publication-f-1');
        assert(thirdCall === firstCall, '4. independent of locator — a different locator, same contentHash/publicationId, still derives the identical placementId');

        // Independent of the underlying Nostr event id — run the SAME
        // check end to end, through two genuinely SEPARATE Nostr
        // announcements (and therefore two different, real event ids)
        // for the identical contentHash/publicationId pair.
        {
            const storageProvider = new InMemoryStorageProvider();
            const publication = publishOwnPublication(storageProvider, 'Section F Publication');
            const host = makeHost(storageProvider, 'section-f-event-independence');
            const bytes = 'Section F: two separate Nostr events, one claim identity';
            await placeAndAnnounce(host, bytes, { publicationId: publication.id, claimedPosition: { x: 2, y: 2, z: 2 } });
            await placeAndAnnounce(host, bytes, { publicationId: publication.id, claimedPosition: { x: 2, y: 2, z: 2 } });
            assert(host.network.events.length === 2 && host.network.events[0].id !== host.network.events[1].id, '5. sanity — two genuinely distinct Nostr events were published');

            const registry = new WorldDiscoverySourceRegistry();
            const ctx = panelCtx({
                publication, placementInfo: null, worldDiscoverySourceRegistry: registry,
                discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
                resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
                materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand
            });
            ctx.discoverSnapshotCandidates();
            await flushMicrotasks();
            assert(ctx.snapshotCandidateDiscoveryResult.length === 2, '6. sanity — both independent announcements are discoverable');

            const placementIds = [];
            for (const candidate of ctx.snapshotCandidateDiscoveryResult) {
                ctx.selectSnapshotCandidate(candidate);
                ctx.resolveSelectedSnapshot();
                await flushMicrotasks();
                ctx.materializeSelectedSnapshot();
                await flushMicrotasks();
                ctx.useClaimedSnapshotPosition();
                ctx.placeMaterializedSnapshot();
                placementIds.push(ctx.selectedSnapshotWorldPlacementResult.placementId);
            }
            assert(placementIds[0] === placementIds[1], `7. independent of the underlying Nostr event id — two genuinely different events, identical contentHash/publicationId, derive the identical placementId ('${placementIds[0]}')`);
        }

        // Never inserted into LocalPlacementRegistry — a claim-derived
        // placement, end to end, leaves the receiver's own real
        // placement registry completely untouched.
        {
            const storageProvider = new InMemoryStorageProvider();
            const publication = publishOwnPublication(storageProvider, 'Section F Registry Isolation Publication');
            const host = makeHost(storageProvider, 'section-f-registry-isolation');
            const bytes = 'Section F: a claim-derived placement never touches LocalPlacementRegistry';
            await placeAndAnnounce(host, bytes, { publicationId: publication.id, claimedPosition: { x: 6, y: 6, z: 6 } });

            const placementRegistry = new LocalPlacementRegistry(storageProvider);
            assert(placementRegistry.findByPublicationId(publication.id).length === 0, '8. sanity — the receiver genuinely has no PRE-existing local placement for this Publication');

            const worldRegistry = new WorldDiscoverySourceRegistry();
            const ctx = panelCtx({
                publication, placementInfo: null, worldDiscoverySourceRegistry: worldRegistry,
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
            assert(ctx.selectedSnapshotWorldRegistrationResult.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, '9. the claim-derived placement genuinely registers into the WORLD registry');

            assert(placementRegistry.findByPublicationId(publication.id).length === 0, '10. yet placement/LocalPlacementRegistry.js — a genuinely different registry — still holds ZERO records for this Publication: a claim never becomes a real PlacementRecord');
        }

        console.log('✓ Section F: claim:<contentHash>:<publicationId> is deterministic, distinct between Publications, independent of locator and of the underlying Nostr event id, and is never written into LocalPlacementRegistry');
    }

    // ---------------------------------------------------------------
    // Section G — spatial authority: the World registry (never the
    // Nostr event) is what the rendered position is derived from;
    // structural sweep confirms no involved production file imports
    // Nostr.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const publication = publishOwnPublication(storageProvider, 'Section G Publication');
        const host = makeHost(storageProvider, 'section-g-authority');
        const bytes = 'Section G: spatial authority lives in the World registry, never the Nostr event';
        await placeAndAnnounce(host, bytes, { publicationId: publication.id, claimedPosition: { x: 15, y: 0, z: 15 } });

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

        // Once registered, DELETING every trace of the original Nostr
        // event from the (fake) relay network changes nothing about the
        // already-rendered World position — proving the registry, not
        // the event, is now the spatial authority.
        host.network.events.length = 0;
        const canvas = buildCanvasInstance({ registry });
        mountCanvas(canvas);
        const projected = projectedPublicationsOf(canvas).find((p) => p.objectId === publication.id);
        const raw = viewById(registry)[publication.id];
        assert(raw.x === 15 && raw.z === 15, '1. the World Encounter row still carries the claimed position after the originating Nostr event is gone — the registry, not the event, is the spatial authority');
        assert(projected.x === expectedCanvasCoordinate(15) && projected.y === expectedCanvasCoordinate(15), '2. the rendered marker position is likewise unaffected — projectToCanvas() reads only the registry-derived row');
        unmountCanvas(canvas);

        // Structural sweep — none of the files that carry the registry
        // -> WorldEncounter -> projectToCanvas() -> marker chain ever
        // import Nostr machinery of any kind.
        const { readFile } = await import('node:fs/promises');
        const filesInChain = [
            '../application/WorldDiscoverySourceRegistry.js',
            '../application/WorldDiscoveryRegistryProjection.js',
            '../application/WorldEncounterIntegration.js',
            '../core/WorldEncounter.js',
            '../ui/components/WorldEncounterCanvas.js',
            '../ui/components/WorldEncounterMarker.js'
        ];
        for (const relativePath of filesInChain) {
            const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
            const importLines = source.split('\n').filter((line) => line.trim().startsWith('import '));
            assert(!importLines.some((line) => /nostr|arweave/i.test(line)), `3. ${relativePath} imports no Nostr/Arweave machinery of any kind — position resolution never reaches back into the network layer`);
        }

        console.log('✓ Section G: once a claim is consumed and registered, the World registry is the sole spatial authority — WorldEncounter/projectToCanvas()/marker position derive from it alone, never from a later reconstruction off the Nostr event');
    }

    // ---------------------------------------------------------------
    // Section H — material independence: changing a claimed position
    // changes no content-identity fact.
    // ---------------------------------------------------------------
    {
        const storageProviderP1 = new InMemoryStorageProvider();
        const storageProviderP2 = new InMemoryStorageProvider();
        const publicationP1 = publishOwnPublication(storageProviderP1, 'Section H Publication (position 1)');
        const publicationP2 = publishOwnPublication(storageProviderP2, 'Section H Publication (position 2)');
        const hostP1 = makeHost(storageProviderP1, 'section-h-independence-p1');
        const hostP2 = makeHost(storageProviderP2, 'section-h-independence-p2');
        const bytes = 'Section H: identical Snapshot bytes, two entirely different claimed positions';

        const refP1 = await placeAndAnnounce(hostP1, bytes, { publicationId: publicationP1.id, claimedPosition: { x: 1000, y: 1000, z: 1000 } });
        const refP2 = await placeAndAnnounce(hostP2, bytes, { publicationId: publicationP2.id, claimedPosition: { x: -1000, y: -1000, z: -1000 } });

        assert(refP1.hash === refP2.hash, '1. sanity — identical bytes hash identically regardless of the claimed position that will later accompany them');

        const resultP1 = await hostP1.resolveSelectedSnapshotCommand({ contentHash: refP1.hash, locator: refP1.uri, storage: refP1.storage, publicationId: publicationP1.id, claimedPosition: { x: 1000, y: 1000, z: 1000 } });
        const resultP2 = await hostP2.resolveSelectedSnapshotCommand({ contentHash: refP2.hash, locator: refP2.uri, storage: refP2.storage, publicationId: publicationP2.id, claimedPosition: { x: -1000, y: -1000, z: -1000 } });

        assert(resultP1.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED && resultP2.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, '2. resolution succeeds identically regardless of the claimed position');
        assert(resultP1.bytes === resultP2.bytes, '3. the retrieved bytes are byte-for-byte identical — a claimed position never influences retrieval');
        assert(resultP1.locator === refP1.uri && resultP2.locator === refP2.uri, '4. each locator remains its own real value, unrelated to the claimed position');

        const materializedP1 = await hostP1.materializeSelectedSnapshotCommand(resultP1);
        const materializedP2 = await hostP2.materializeSelectedSnapshotCommand(resultP2);
        assert(materializedP1.contentHash === materializedP2.contentHash, '5. the materialized contentHash never differs because of a different claimed position');

        // And the position itself never leaks backward into content
        // identity: the CLAIMED result carries no contentHash/locator/
        // storage field of its own.
        const claimP1 = resolveSnapshotWorldPositionClaim({ contentHash: refP1.hash, locator: refP1.uri, storage: refP1.storage, publicationId: publicationP1.id, claimedPosition: { x: 1000, y: 1000, z: 1000 } }, publicationP1.id);
        assert(!('contentHash' in claimP1) && !('locator' in claimP1) && !('storage' in claimP1) && !('bytes' in claimP1), '6. a position claim result carries no content-identity field of any kind');

        console.log('✓ Section H: a claimed position never influences contentHash, locator, storage, retrieved bytes, or verification — spatial identity and material identity remain fully independent');
    }

    // ---------------------------------------------------------------
    // Section I — rendering convergence: a claimed Snapshot reaches the
    // exact same WorldEncounterCanvas/WorldEncounterMarker machinery as
    // local material; no `if snapshot ...` branch exists in either file.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const localPublication = publishOwnPublication(storageProvider, 'Section I Local Publication');
        const claimedPublication = publishOwnPublication(storageProvider, 'Section I Claimed Publication');

        const host = makeHost(storageProvider, 'section-i-convergence');
        const bytes = 'Section I: rendering convergence between local and claimed material';
        await placeAndAnnounce(host, bytes, { publicationId: claimedPublication.id, claimedPosition: { x: 20, y: 0, z: -20 } });

        const registry = new WorldDiscoverySourceRegistry();
        // Register the LOCAL Publication directly under the 'local'
        // origin, exactly as application/WorldDiscoveryRuntimeBootstrap.js's
        // own real local-origin registration eventually would.
        registry.setSource({ origin: 'local', publications: [localPublication], avatars: [], placements: [{ publicationId: localPublication.id, position: { x: 5, y: 0, z: 5 } }] });

        const ctx = panelCtx({
            publication: claimedPublication, placementInfo: null, worldDiscoverySourceRegistry: registry,
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
        assert(ctx.selectedSnapshotWorldRegistrationResult.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, '1. sanity — the claimed Snapshot registers alongside the local Publication');

        const canvas = buildCanvasInstance({ registry, materialSources: { local: new LocalWorldEncounterMaterialSource(storageProvider) } });
        mountCanvas(canvas);
        const projected = projectedPublicationsOf(canvas);
        const localMarker = projected.find((p) => p.objectId === localPublication.id);
        const claimedMarker = projected.find((p) => p.objectId === claimedPublication.id);
        assert(localMarker && claimedMarker, '2. both a local-origin marker and a claimed Snapshot-origin marker render, side by side, from the same projectedPublications array');
        assert(Object.keys(localMarker).sort().join(',') === Object.keys(claimedMarker).sort().join(','), '3. the two markers carry the exact same projected SHAPE (objectId/label/x/y) — no extra "this one is a Snapshot" field distinguishes them');

        // Select and load material for each in turn, through the
        // identical selectEncounter()/refreshMaterialInspection() call
        // sequence.
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: localPublication.id });
        await flushMicrotasks();
        assert(canvas.materialInspection.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE, '4. the local Publication loads AVAILABLE material through the ordinary path');
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: claimedPublication.id });
        await flushMicrotasks();
        assert(canvas.materialInspection.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE, '5. the claimed Snapshot loads AVAILABLE material through the IDENTICAL path, no separate machinery');
        unmountCanvas(canvas);

        // Structural sweep — the actual position/marker-shaping functions
        // carry no "snapshot" vocabulary of any kind. WorldEncounterCanvas.js
        // legitimately mentions "Snapshot" many times elsewhere (its own,
        // separate Distribute/Discover Snapshot UI actions) — this sweep is
        // deliberately narrow, extracting ONLY the functions that decide a
        // marker's own kind/position, mirroring 0.9.165's own Section E
        // technique of scoping a sweep precisely around a file's OTHER,
        // legitimate, unrelated Snapshot-distribution UI.
        const { readFile } = await import('node:fs/promises');
        const canvasSource = await readFile(new URL('../ui/components/WorldEncounterCanvas.js', import.meta.url), 'utf8');
        const markerSource = await readFile(new URL('../ui/components/WorldEncounterMarker.js', import.meta.url), 'utf8');

        function extractBetween(source, startMarker, endMarker) {
            const start = source.indexOf(startMarker);
            assert(start !== -1, `sanity — '${startMarker}' was found in the source under sweep`);
            const end = source.indexOf(endMarker, start + startMarker.length);
            assert(end !== -1, `sanity — '${endMarker}' was found after '${startMarker}'`);
            return source.slice(start, end);
        }

        const projectToCanvasFn = extractBetween(canvasSource, 'function projectToCanvas(value) {', '\nfunction resolvedEncounterSelectionsEqual');
        const projectedPublicationsFn = extractBetween(canvasSource, 'projectedPublications() {', 'projectedAvatars() {');
        const projectedAvatarsFn = extractBetween(canvasSource, 'projectedAvatars() {', 'projectedWanderer() {');
        assert(!/snapshot/i.test(projectToCanvasFn), '6. projectToCanvas() itself contains no "snapshot" vocabulary of any kind — it is a plain x/z linear transform');
        assert(!/snapshot/i.test(projectedPublicationsFn), '7. projectedPublications() — the function that shapes every rendered publication marker, claimed Snapshots included — contains no "snapshot" vocabulary, and therefore no snapshot-specific branch');
        assert(!/snapshot/i.test(projectedAvatarsFn), '8. projectedAvatars() likewise contains no "snapshot" vocabulary');

        // WorldEncounterMarker.js draws every marker through one shared
        // template regardless of provenance — the ENTIRE file is checked,
        // since (per its own header) it imports nothing and decides
        // nothing beyond kind/glyph.
        assert(!/snapshot/i.test(markerSource), '9. ui/components/WorldEncounterMarker.js — the actual marker-drawing component — contains no "snapshot" vocabulary anywhere in the file, confirming there is no Snapshot-specific rendering path at all, only the shared PUBLICATION/AVATAR glyph switch every marker already goes through');

        console.log('✓ Section I: a claimed Snapshot\'s World Encounter reaches the exact same WorldEncounterCanvas/WorldEncounterMarker machinery a local Publication\'s own encounter already does — no "if snapshot ..." rendering branch exists');
    }

    // ---------------------------------------------------------------
    // Section J — failure and legacy vocabulary: no new outcome is ever
    // invented for a claim-adjacent failure.
    // ---------------------------------------------------------------
    {
        // No position claim (legacy announcement).
        const legacyCandidate = { contentHash: 'h-legacy', locator: 'ar://legacy', storage: 'ar' };
        const legacy = resolveSnapshotWorldPositionClaim(legacyCandidate, 'publication-j');
        assert(legacy.outcome === SnapshotWorldPositionClaimOutcome.ABSENT, '1. a legacy, claim-free candidate still resolves to the pre-existing ABSENT outcome');

        // Mismatched publicationId.
        const mismatchedCandidate = { contentHash: 'h-mismatch', locator: 'ar://mismatch', storage: 'ar', publicationId: 'someone-else', claimedPosition: { x: 1, y: 1, z: 1 } };
        const mismatched = resolveSnapshotWorldPositionClaim(mismatchedCandidate, 'publication-j');
        assert(mismatched.outcome === SnapshotWorldPositionClaimOutcome.MISMATCHED, '2. a mismatched publicationId still resolves to the pre-existing MISMATCHED outcome');

        // Unavailable material — a materialization failure passed through
        // unchanged by placement, even when a claim WAS consumed.
        const failedMaterialization = { outcome: 'UNAVAILABLE_STAND_IN', contentHash: 'h-unavailable', reason: 'content genuinely unreachable' };
        const claimedButUnmaterialized = resolveSnapshotWorldPlacement(failedMaterialization, Object.freeze({ placementId: 'claim:h-unavailable:publication-j', publicationId: 'publication-j', position: { x: 1, y: 1, z: 1 } }));
        assert(claimedButUnmaterialized.outcome === 'UNAVAILABLE_STAND_IN', '3. a materialization failure is reported VERBATIM by resolveSnapshotWorldPlacement(), never remapped to UNPLACED, even with a claim in hand');
        assert(claimedButUnmaterialized.position === null, '4. no position is ever fabricated for a failed materialization, regardless of any claim');

        // Invalid resolution — CONTENT_HASH_MISMATCH passes through the
        // exact same way.
        {
            const storageProvider = new InMemoryStorageProvider();
            const host = makeHost(storageProvider, 'section-j-invalid-resolution');
            const realBytes = 'Section J: the actually-stored bytes';
            const reference = await host.arweaveStore.put(realBytes);
            // A candidate whose DECLARED contentHash does not match what
            // is actually stored at that locator — a definite mismatch,
            // carrying a claim that must never rescue it.
            const forgedCandidate = { contentHash: 'not-the-real-hash', locator: reference.uri, storage: reference.storage, publicationId: 'publication-j', claimedPosition: { x: 1, y: 1, z: 1 } };
            const resolution = await host.resolveSelectedSnapshotCommand(forgedCandidate);
            assert(resolution.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH, `5. an invalid resolution still reports CONTENT_HASH_MISMATCH, unchanged, even though the candidate itself carried a claim; got '${resolution.outcome}'`);
        }

        // Failed materialization — the resolver's own failure outcome is
        // what a caller who never even reached MATERIALIZE would see,
        // never a claim-specific catch-all.
        {
            const failedResolution = { outcome: DecentralizedSnapshotResolutionOutcome.CONTENT_UNAVAILABLE, bytes: null, candidates: [], locator: null, storage: null, reason: 'unreachable' };
            const placementFromFailedResolution = resolveSnapshotWorldPlacement(failedResolution);
            assert(placementFromFailedResolution.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_UNAVAILABLE, '6. a resolution that never reached RESOLVED still passes its own failure outcome through placement, verbatim');
        }

        // No new vocabulary anywhere: SnapshotWorldPositionClaimOutcome
        // still carries exactly its own three pre-existing values.
        const outcomeKeys = Object.keys(SnapshotWorldPositionClaimOutcome);
        assert(outcomeKeys.length === 3 && outcomeKeys.includes('CLAIMED') && outcomeKeys.includes('ABSENT') && outcomeKeys.includes('MISMATCHED'),
            '7. SnapshotWorldPositionClaimOutcome still carries exactly CLAIMED/ABSENT/MISMATCHED — no new value was ever needed to describe a failure case');

        console.log('✓ Section J: every failure and legacy case — no claim, a mismatched claim, unavailable material, invalid resolution, failed materialization — still produces its own pre-existing, unmodified outcome vocabulary');
    }

    // ---------------------------------------------------------------
    // Section K — FULL FLAGSHIP: two Publications, identical Snapshot
    // bytes, two independent claimed positions, registered and rendered
    // SIMULTANEOUSLY.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const publicationA = publishOwnPublication(storageProvider, 'Flagship Publication A');
        const publicationB = publishOwnPublication(storageProvider, 'Flagship Publication B');

        const host = makeHost(storageProvider, 'section-k-full-flagship');
        const sharedBytes = 'Section K: identical Snapshot bytes, two Publications, two independent positions';

        const refA = await placeAndAnnounce(host, sharedBytes, { publicationId: publicationA.id, claimedPosition: { x: 25, y: 0, z: -25 } });
        const refB = await placeAndAnnounce(host, sharedBytes, { publicationId: publicationB.id, claimedPosition: { x: -25, y: 0, z: 25 } });
        assert(refA.hash === refB.hash, '1. sanity — both Publications genuinely share ONE contentHash');

        const registry = new WorldDiscoverySourceRegistry();

        // DISCOVER — one call, both candidates.
        const candidates = await host.discoverSnapshotCandidatesCommand();
        assert(candidates.length === 2, '2. both independent announcements are discoverable together');
        const candidateA = candidates.find((c) => c.publicationId === publicationA.id);
        const candidateB = candidates.find((c) => c.publicationId === publicationB.id);
        assert(candidateA && candidateB, '3. each candidate is individually addressable by its own publicationId, despite the shared contentHash');

        // Drive each Publication's own SELECT -> RESOLVE -> MATERIALIZE ->
        // CONSUME CLAIM -> PLACE -> REGISTER through its own panel
        // context, sharing only the ONE World registry.
        async function driveToRegistration(publication, candidate) {
            const ctx = panelCtx({
                publication, placementInfo: null, worldDiscoverySourceRegistry: registry,
                selectedSnapshotCandidate: candidate,
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

        const ctxA = await driveToRegistration(publicationA, candidateA);
        const ctxB = await driveToRegistration(publicationB, candidateB);

        assert(ctxA.selectedSnapshotWorldPositionClaimResult.outcome === SnapshotWorldPositionClaimOutcome.CLAIMED
            && ctxB.selectedSnapshotWorldPositionClaimResult.outcome === SnapshotWorldPositionClaimOutcome.CLAIMED,
            '4. both candidates, sharing one contentHash, are independently CLAIMED against their OWN Publication');
        assert(ctxA.selectedSnapshotWorldPlacementResult.position.x === 25 && ctxB.selectedSnapshotWorldPlacementResult.position.x === -25,
            '5. FLAGSHIP — identical content, two Publications, two independently authoritative claimed positions; never merged, never averaged');
        assert(ctxA.selectedSnapshotWorldRegistrationResult.outcome === SnapshotWorldRegistrationOutcome.REGISTERED
            && ctxB.selectedSnapshotWorldRegistrationResult.outcome === SnapshotWorldRegistrationOutcome.REGISTERED,
            '6. both registrations succeed independently');
        assert(ctxA.selectedSnapshotWorldRegistrationResult.origin !== ctxB.selectedSnapshotWorldRegistrationResult.origin,
            '7. each occupies its own dedicated registry origin — publicationId, folded into the origin string, prevents the shared contentHash from colliding the two slots (0.9.163)');
        assert(registry.listSources().length === 2, '8. the World registry now genuinely holds TWO independent sources, not one overwriting the other');

        // WORLD ENCOUNTER + RENDER — both coexist, at two distinct
        // canvas positions, through the real, unmodified
        // WorldEncounterCanvas.
        const canvas = buildCanvasInstance({ registry, materialSources: { local: new LocalWorldEncounterMaterialSource(storageProvider) } });
        mountCanvas(canvas);
        const projected = projectedPublicationsOf(canvas);
        const markerA = projected.find((p) => p.objectId === publicationA.id);
        const markerB = projected.find((p) => p.objectId === publicationB.id);
        assert(markerA && markerB, '9. both Publications render as two separate, findable World Encounter markers');
        assert(markerA.label === 'Flagship Publication A' && markerB.label === 'Flagship Publication B', '10. each marker carries its own real, distinct title — never merged, never a generic "Snapshot" label');
        assert(markerA.x === expectedCanvasCoordinate(25) && markerA.y === expectedCanvasCoordinate(-25), '11. Publication A renders at exactly its own claimed (25,_,-25)');
        assert(markerB.x === expectedCanvasCoordinate(-25) && markerB.y === expectedCanvasCoordinate(25), '12. Publication B renders at exactly its own claimed (-25,_,25)');
        assert(markerA.x !== markerB.x && markerA.y !== markerB.y, '13. the two markers occupy genuinely different screen positions — never coincident, never collapsed onto one point');

        // SELECT + LOAD MATERIAL — each, in turn, loads its own correct
        // Publication, never the other's, despite the shared contentHash.
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: publicationA.id });
        await flushMicrotasks();
        assert(canvas.materialInspection.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE && canvas.materialInspection.loading.material.id === publicationA.id,
            '14. selecting the World Encounter at (25,_,-25) loads Publication A, never B');
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: publicationB.id });
        await flushMicrotasks();
        assert(canvas.materialInspection.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE && canvas.materialInspection.loading.material.id === publicationB.id,
            '15. selecting the World Encounter at (-25,_,25) loads Publication B, never A');
        unmountCanvas(canvas);

        console.log('✓ Section K: FULL FLAGSHIP — two Publications sharing one contentHash, two independently publisher-claimed positions, registered and rendered simultaneously in one running World, coexisting at two distinct positions with two distinct, correctly-loaded Publications');
    }

    console.log('\n✅ All Decentralized Snapshot Spatial E2E Audit tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
