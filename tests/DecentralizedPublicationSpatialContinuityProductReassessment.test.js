
import { AutomaticSnapshotEncounterCascade } from '../application/snapshot/AutomaticSnapshotEncounterCascade.js';
import { AutomaticSnapshotEncounterCascadeOutcome } from '../application/snapshot/AutomaticSnapshotEncounterCascadeOutcome.js';
import { DecentralizedSnapshotResolutionOutcome } from '../application/snapshot/DecentralizedSnapshotResolutionOutcome.js';
import { SnapshotWorldPlacementOutcome } from '../application/snapshot/placement/SnapshotWorldPlacementOutcome.js';
import { SnapshotWorldRegistrationOutcome } from '../application/snapshot/placement/SnapshotWorldRegistrationOutcome.js';
import { StoreSnapshotContentOutcome } from '../application/snapshot/materialization/StoreSnapshotContentOutcome.js';
import { SnapshotWorldPositionClaimOutcome } from '../application/snapshot/placement/SnapshotWorldPositionClaimOutcome.js';
import { resolveSnapshotWorldPlacement } from '../application/snapshot/placement/SnapshotWorldPlacement.js';
import { registerMaterializedSnapshotWorldSource, materializedSnapshotWorldOrigin } from '../application/snapshot/materialization/MaterializedSnapshotWorldDiscoveryBridge.js';
import { executeDiscoverSnapshotCandidatesCommand } from '../application/snapshot/DiscoverSnapshotCandidatesCommand.js';
import { executeResolveSelectedSnapshotCommand } from '../application/snapshot/ResolveSelectedSnapshotCommand.js';
import { executeMaterializeSelectedSnapshotCommand } from '../application/snapshot/materialization/MaterializeSelectedSnapshotCommand.js';
import { MaterializeSnapshotFromSelectedCandidateUseCase } from '../application/snapshot/materialization/MaterializeSnapshotFromSelectedCandidateUseCase.js';
import { StoreSnapshotContentUseCase } from '../application/snapshot/materialization/StoreSnapshotContentUseCase.js';
import { executeSnapshotDistributionCommand } from '../application/snapshot/SnapshotDistributionCommand.js';
import { NostrSnapshotDiscoveryPublisher } from '../application/nostr/NostrSnapshotDiscoveryPublisher.js';
import { NostrSnapshotDiscoveryQueryService } from '../application/nostr/NostrSnapshotDiscoveryQueryService.js';
import { DecentralizedSnapshotResolver } from '../application/snapshot/DecentralizedSnapshotResolver.js';
import { WorldDiscoverySourceRegistry } from '../application/discovery/WorldDiscoverySourceRegistry.js';
import { describeWorldFromDiscoveryRegistry } from '../application/discovery/WorldDiscoveryRegistryProjection.js';
import { ObserverLocalEncounterStore } from '../application/worldEncounter/ObserverLocalEncounterStore.js';
import { describeObserverLocalPublicationEncounter } from '../core/ObserverLocalPublicationEncounter.js';
import { LocalWorldEncounterMaterialSource } from '../application/worldEncounter/LocalWorldEncounterMaterialSource.js';
import { WorldEncounterKind } from '../core/WorldEncounter.js';
import { WorldEncounterSelectionOutcomeStatus } from '../application/worldEncounter/WorldEncounterSelectionOutcome.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { ArweaveContentStore } from '../content/ArweaveContentStore.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { PlacementRecord } from '../core/PlacementRecord.js';
import { Position } from '../core/Position.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { computeContentHash } from '../serializer/contentHash.js';
import OwnPublicationPanel from '../ui/components/OwnPublicationPanel.js';
import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import { worldEncounterCanvasFiles, ownPublicationPanelFiles, mainFiles } from './support/SourceFileGroups.js';
import { assert } from './support/Assert.js';
import { readSource } from './support/SourceText.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';

// 0.9.568 — Decentralized Publication Spatial Continuity Product
// Reassessment.
//
// TYPE: test-only product reassessment. Production changes: none.
//
// 0.9.565 traced a dropped wire; 0.9.566 closed it; 0.9.567 proved the
// complete PUBLISH -> DISTRIBUTE -> DISCOVER -> RESOLVE -> VERIFY ->
// CONSUME journey end to end, through real production machinery, and
// classified the arc END-TO-END_COMPLETE. This milestone asks a broader,
// genuinely different question: now that a Publication's own position can
// reach a Wanderer through THREE independently-evolved spatial mechanisms —
//
//   PlacementRecord       — authoritative, persistent, shared World state
//                            (core/PlacementRecord.js, placement/
//                            LocalPlacementRegistry.js)
//   claimedPosition        — a publisher's own self-reported, distributed
//                            claim, CONSUMED only by an explicit person
//                            action (application/snapshot/placement/SnapshotWorldPositionClaim.js,
//                            0.9.172), never automatically
//   Observer-local encounter — an ephemeral, session-scoped record of what
//                            THIS Wanderer's own walking materialized,
//                            never promoted to a PlacementRecord
//                            (core/ObserverLocalPublicationEncounter.js,
//                            0.9.552)
//
// — does the overall product experience of discovering a Publication in
// space, and continuing to interact with it, still make coherent sense? Or
// have three independently-correct mechanisms, each individually proven
// (0.9.159-0.9.172, 0.9.552-0.9.559, 0.9.565-0.9.567), produced an
// INCOHERENT combination once a real Wanderer's session can exercise more
// than one of them for the SAME Publication?
//
// Checked against real, unmodified production source throughout: the real
// cascade, the real stores/registries, the real `OwnPublicationPanel.js`
// interaction surface (0.9.567's own established technique), and the real
// `WorldEncounterCanvas.js` component driven directly through its own
// `data`/`computed`/`methods`/`mounted`/`beforeUnmount` (0.9.553's own
// established "call X.call(ctx)" discipline). `ui/views/WorldView.js`/
// `application/world/WorldNavigationSession.js` remain unimportable under this
// project's plain `node` test runner (THREE.js/Vue-dependent renderer
// stack) and are instead verified structurally, by reading their own
// unmodified source — the same documented constraint every milestone in
// this arc has already named.
//
//   Section A. Three spatial identities constructed for real — never
//              sharing a type, a store, or a merge point.
//   Section B. Same coordinates vs. different coordinates — coincidence
//              never implies interchangeability.
//   Section C. Distributed claim -> encounter — connecting 0.9.567's own
//              claim-consumption chain to 0.9.552-0.9.554's own
//              observer-local machinery for the first time.
//   Section D. FLAGSHIP FINDING (AMENDED BY 0.9.570, FIXED) — an existing
//              authoritative placement that becomes known AFTER an
//              observer-local encounter was already recorded, within the
//              SAME session, used to produce a genuine, reproducible
//              double presentation: the identical Publication rendered as
//              BOTH a permanent, fully-actionable marker AND a stale
//              "Discovered here" ghost, simultaneously. 0.9.570 shipped a
//              presentational filter in WorldEncounterCanvas.js's own
//              projectedObserverLocalEncounters that suppresses the ghost;
//              see this section's own in-line amendment notes.
//   Section E. Multiple Publications, shared position — identity never
//              collapses onto coordinates.
//   Section F. Republished identical content, different positions —
//              neither Publication inherits the other's.
//   Section G. User journey continuity for an observer-local encounter —
//              Walk -> Discover -> Inspect -> Open/Fork/Explore/Comment ->
//              walk away -> rediscover, built on 0.9.558/0.9.559.
//   Section H. Vocabulary audit — what the product's own real strings
//              say, and one narrow, secondary gap: the primary channel's
//              own "Source" label cannot distinguish an authoritative
//              placement from a person-registered claim.
//   Section I. Lifecycle — what actually survives leave/rediscover/
//              reload/new session, derived from real behavior, not
//              assumption.
//   Section J. Failure isolation at five independent boundaries.
//   Section K. Consumer action safety — Open/Fork/Explore/Comment remain
//              safe and non-promoting even under Section D's own
//              double-presentation condition.
//   Section L. FLAGSHIP ADVERSARIAL SCENARIO — two Publications sharing
//              one contentHash, two distinct real, distributed claims,
//              discovered together, each independently actionable; no
//              content-hash shortcut collapses their spatial identity.
//   Section M. Product classification and verdict.
//
// CLASSIFICATION VOCABULARY: `ALREADY_CORRECT`, `DOCUMENTATION_GAP`,
// `PRODUCT_GAP`, `ARCHITECTURAL_GAP`, `DELIBERATE_BOUNDARY` — the SAME
// five values 0.9.553/0.9.555 already established; no new vocabulary is
// invented here.
//
// DELIBERATELY EXCLUDED — PER THIS MILESTONE'S OWN BRIEF. "Use Claimed
// Position" is NOT implemented as a new placement mechanism here — see
// this file's own Section M for why the one gap this milestone finds
// (Section D) is a presentation defect, never evidence that a claim
// should become more authoritative than it already is. No production
// code changes ship with this milestone.

async function flushMicrotasks() {
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let i = 0; i < 10; i++) {
        await Promise.resolve();
    }
}

function codeOnlyLines(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

// ===================================================================
// Harness — combines tests/DistributedPublicationPositionClaimEndToEnd
// ProductReassessment.test.js's own publisher/distribution harness
// (0.9.567) with tests/ObserverLocalEncounterExperienceProductReassessment
// .test.js's own cascade harness (0.9.553) and tests/
// KnownPublicationEncounterContinuation.test.js's own extended
// WorldEncounterCanvas harness (0.9.558) — duplicated here per this
// codebase's own established per-file harness convention.
// ===================================================================

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
        return { id: `fake-0-9-568-tx-${counter}`, transaction: { id: `fake-0-9-568-tx-${counter}`, data: material } };
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

// A full, real decentralized host — mirrors 0.9.567's own makeHost().
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
        localContentStore,
        discoverSnapshotCandidatesCommand, resolveSelectedSnapshotCommand, materializeSelectedSnapshotCommand
    };
}

function placeReal(placementRegistry, publicationId, position, owner = 'alice') {
    const record = new PlacementRecord({ publicationId, position, owner });
    placementRegistry.add(record);
    return record;
}

// Mirrors application/world/WorldNavigationSession.js's own real
// getPlacementInfoForPublication(publicationId) exactly — reproduced
// rather than imported (Vue/three.js-dependent, unresolvable under this
// project's plain `node` test runner). Verified structurally against the
// real source below, the identical technique 0.9.566/0.9.567 established.
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

function makeRealSnapshotDistributionCommand({ contentStore, discoveryPublisher }) {
    return (bytes, storage = 'ar', publicationId, claimedPosition) => executeSnapshotDistributionCommand({
        bytes, contentStore, discoveryPublisher, publicationId, claimedPosition
    });
}

// Mirrors ui/views/WorldView.js's own real distributeWorldEncounterSnapshot(publication).
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
// store; every Publication below is given a contentReference whose hash
// equals its own id, so `entries` stays keyed by publication id.
function fakeContentStore(entries = {}) {
    return {
        get(contentReference) {
            const key = contentReference && contentReference.hash;
            return Object.prototype.hasOwnProperty.call(entries, key) ? JSON.stringify(entries[key]) : null;
        }
    };
}

// The real ui/components/OwnPublicationPanel.js interaction surface.
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

function knowPublicationsLocally(storageProvider, publications) {
    const existing = storageProvider.load('forkbuild-publications') || [];
    storageProvider.save('forkbuild-publications', [...existing, ...publications.map((p) => p.toJSON())]);
}

class MapVerifier {
    constructor(map) { this._map = map; this.calls = []; }
    async verifyIdentity(resolvedSelection, material) {
        this.calls.push({ objectId: resolvedSelection && resolvedSelection.objectId, materialId: material && material.id });
        return this._map[resolvedSelection && resolvedSelection.objectId] === true;
    }
}

function commandSpy() {
    const calls = [];
    const fn = (...args) => { calls.push(args); };
    fn.calls = calls;
    return fn;
}

function makeWorldModel(placementRegistry) {
    const publications = new Map();
    return {
        publications,
        placementRegistry,
        knowPublication(publication) { publications.set(publication.id, publication); },
        resolvePlacementInfo: (publicationId) => {
            const records = placementRegistry.findByPublicationId(publicationId);
            if (records.length === 0) return null;
            const record = records.reduce((latest, r) => (!latest || r.updatedAt > latest.updatedAt) ? r : latest, null);
            return { placementId: record.placementId, publicationId: record.publicationId, position: { x: record.position.x, y: record.position.y, z: record.position.z } };
        },
        findPublicationById: (publicationId) => publications.get(publicationId) || null
    };
}

function makeCascade(host, worldModel, registry, overrides = {}) {
    return new AutomaticSnapshotEncounterCascade({
        resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
        materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand,
        worldDiscoverySourceRegistry: registry,
        resolvePlacementInfo: worldModel.resolvePlacementInfo,
        findPublicationById: worldModel.findPublicationById,
        ...overrides
    });
}

// WorldEncounterCanvas real-component harness — mirrors 0.9.558's own
// extended buildCanvasInstance() exactly.
function buildCanvasInstance({
    registry = null,
    observerLocalEncounterRegistry = null,
    materialSources = null,
    materialVerifier = null,
    decentralizedPublicationDiscoveryProvider = null,
    openPublicationCommand = null,
    forkPublicationCommand = null,
    explorePublicationCommand = null,
    getPublicationCommentariesCommand = null,
    addPublicationCommentaryCommand = null
} = {}) {
    const ctx = {
        registry,
        observerLocalEncounterRegistry,
        view: WorldEncounterCanvas.props.view.default(),
        materialSources,
        materialVerifier,
        decentralizedPublicationDiscoveryProvider,
        openPublicationCommand,
        forkPublicationCommand,
        explorePublicationCommand,
        getPublicationCommentariesCommand,
        addPublicationCommentaryCommand
    };
    Object.assign(ctx, WorldEncounterCanvas.data.call(ctx));
    Object.assign(ctx, WorldEncounterCanvas.methods);
    for (const name of [
        'resolvedEncounterSelection',
        'resolvedLead',
        'observerLocalEncounterResolvedSelection',
        'observerLocalEncounterActionablePublication',
        'observerLocalEncounterCommentaryPublicationId',
        'encounterCommentaryPublicationId',
        'selectedEncounterInspection',
        'selectedEncounterPresentation',
        'selectedEncounterPresentationSourceLabel'
    ]) {
        Object.defineProperty(ctx, name, {
            get() { return WorldEncounterCanvas.computed[name].call(ctx); }
        });
    }
    return ctx;
}

function mountCanvas(ctx) { WorldEncounterCanvas.mounted.call(ctx); }
function unmountCanvas(ctx) { WorldEncounterCanvas.beforeUnmount.call(ctx); }

function projectedPublicationsOf(ctx) {
    ctx.effectiveView = WorldEncounterCanvas.computed.effectiveView.call(ctx);
    ctx.publicationRows = WorldEncounterCanvas.computed.publicationRows.call(ctx);
    return WorldEncounterCanvas.computed.projectedPublications.call(ctx);
}

function projectedObserverLocalEncountersOf(ctx) {
    return WorldEncounterCanvas.computed.projectedObserverLocalEncounters.call(ctx);
}

function viewById(registry) {
    const view = describeWorldFromDiscoveryRegistry(registry);
    return Object.fromEntries(view.publications.map((p) => [p.objectId, p]));
}

async function run() {
    console.log('Running Decentralized Publication Spatial Continuity Product Reassessment tests...\n');

    // =======================================================================
    // Section A — three spatial identities constructed for real.
    // =======================================================================
    {
        const storageProvider = new InMemoryStorageProvider();
        const publication = publishOwnPublication(storageProvider, 'Section A Publication');
        const placementRegistry = new LocalPlacementRegistry(storageProvider);

        // 1. PlacementRecord — authoritative.
        const record = placeReal(placementRegistry, publication.id, new Position(1, 0, 1));
        assert(record instanceof PlacementRecord, 'A1. PlacementRecord is its own real class.');
        assert(typeof record.contentHash === 'string' || record.contentHash === null || record.computeContentHash, 'A1b. sanity — PlacementRecord carries its own identity machinery, never borrowed from another concept.');

        // 2. claimedPosition — a distributed claim, resolved via
        // application/snapshot/placement/SnapshotWorldPositionClaim.js, never a PlacementRecord.
        const candidateWithClaim = { contentHash: 'h', locator: 'l', storage: 's', publicationId: publication.id, claimedPosition: { x: 9, y: 0, z: 9 } };
        const { resolveSnapshotWorldPositionClaim } = await import('../application/snapshot/placement/SnapshotWorldPositionClaim.js');
        const claim = resolveSnapshotWorldPositionClaim(candidateWithClaim, publication.id);
        assert(claim.outcome === SnapshotWorldPositionClaimOutcome.CLAIMED, 'A2. A claim resolves to CLAIMED.');
        assert(!(claim instanceof PlacementRecord) && !('placementId' in claim), 'A3. A resolved claim is never, and never resembles, a PlacementRecord — no placementId, no PlacementRecord prototype.');

        // 3. Observer-local encounter — never a PlacementRecord, never
        // sharing a type with a claim result.
        const encounter = describeObserverLocalPublicationEncounter({ publicationId: publication.id, contentHash: 'h2', encounterPosition: { x: 4, y: 0, z: 4 } });
        assert(!(encounter instanceof PlacementRecord), 'A4. An observer-local encounter is never, and never resembles, a PlacementRecord.');
        assert(encounter.kind === 'OBSERVER_LOCAL_PUBLICATION_ENCOUNTER' && !('outcome' in encounter),
            'A5. An observer-local encounter carries its own distinct `kind`, never the claim family\'s own `outcome` vocabulary (CLAIMED/ABSENT/MISMATCHED) — the two are never accidentally structurally interchangeable.');

        // No file in this codebase merges these three concepts into one
        // class or store.
        const placementCode = codeOnlyLines(await readSource('core/PlacementRecord.js'));
        const claimCode = codeOnlyLines(await readSource('application/snapshot/placement/SnapshotWorldPositionClaim.js'));
        const encounterCode = codeOnlyLines(await readSource('core/ObserverLocalPublicationEncounter.js'));
        assert(!claimCode.includes('PlacementRecord') && !encounterCode.includes('PlacementRecord') && !encounterCode.includes('claimedPosition'),
            'A6. In actual CODE (comments excluded — both files\' own headers discuss these names at length precisely to explain excluding them) neither the claim-resolution file nor the observer-local-encounter file imports or references PlacementRecord; the encounter file never reads claimedPosition either — confirmed against live source.');
        assert(!placementCode.includes('claimedPosition') && !placementCode.includes('ObserverLocalPublicationEncounter'),
            'A7. PlacementRecord itself references neither a distributed claim nor an observer-local encounter, in code.');

        console.log('✓ A — three genuinely distinct spatial concepts exist in this codebase, verified as distinct by type, by source, and by cross-reference: none merges into, extends, or is structurally confusable with either other.');
    }

    // =======================================================================
    // Section B — same coordinates vs. different coordinates.
    // =======================================================================
    {
        const storageProvider = new InMemoryStorageProvider();
        const publication = publishOwnPublication(storageProvider, 'Section B Publication');
        const placementRegistry = new LocalPlacementRegistry(storageProvider);
        placeReal(placementRegistry, publication.id, new Position(5, 0, 5));
        const session = makeRealSession(placementRegistry);
        const { resolveSnapshotWorldPositionClaim } = await import('../application/snapshot/placement/SnapshotWorldPositionClaim.js');

        // B1 — coordinates equal: an honest candidate whose claimedPosition
        // was itself derived FROM the same PlacementRecord (the honest
        // 0.9.566/0.9.567 flow).
        const placementInfo = session.getPlacementInfoForPublication(publication.id);
        const honestCandidate = { contentHash: 'h', locator: 'l', storage: 's', publicationId: publication.id, claimedPosition: placementInfo.position };
        const honestClaim = resolveSnapshotWorldPositionClaim(honestCandidate, publication.id);
        assert(honestClaim.position.x === placementInfo.position.x && honestClaim.position.z === placementInfo.position.z,
            'B1. Coordinates equal by construction — yet the claim result and the PlacementRecord-derived placementInfo remain two independent objects.');
        assert(honestClaim.position !== placementInfo.position, 'B1b. The claim never reuses the placementInfo object reference — a fresh, independently-frozen structure every time, per application/snapshot/placement/SnapshotWorldPositionClaim.js\'s own "never a domain object" restraint.');

        // B2 — coordinates differ: a forged/adversarial claim naming a
        // wildly different position for the SAME publicationId. The claim
        // is still CLAIMED (this file never verifies truthfulness, only
        // addressing — see that file's own header) but the two positions
        // never reconcile, merge, or average.
        const forgedCandidate = { contentHash: 'h', locator: 'l', storage: 's', publicationId: publication.id, claimedPosition: { x: 999, y: 0, z: -999 } };
        const forgedClaim = resolveSnapshotWorldPositionClaim(forgedCandidate, publication.id);
        assert(forgedClaim.outcome === SnapshotWorldPositionClaimOutcome.CLAIMED, 'B2. A structurally well-formed claim resolves CLAIMED regardless of plausibility — truthfulness is out of scope for this function, by design.');
        assert(forgedClaim.position.x === 999, 'B2b. The claim itself carries the forged coordinates, unmodified.');
        const placementInfoAfter = session.getPlacementInfoForPublication(publication.id);
        assert(placementInfoAfter.position.x === 5 && placementInfoAfter.position.z === 5,
            'B3. The authoritative PlacementRecord is completely unaffected by resolving an implausible claim — resolving a claim is a pure, read-only computation over the CANDIDATE, never a write to the PlacementRegistry.');

        console.log('✓ B — whether a distributed claim\'s own coordinates happen to match or diverge from an existing authoritative placement, the two remain independent records throughout; equality is never treated as identity, and divergence never corrupts the authoritative side.');
    }

    // =======================================================================
    // Section C — distributed claim -> encounter: connecting 0.9.567 with
    // 0.9.552-0.9.554 for the first time.
    // =======================================================================
    {
        const storageProvider = new InMemoryStorageProvider();
        const publication = publishOwnPublication(storageProvider, 'Section C Publication');
        // Deliberately NO PlacementRecord for this publication anywhere —
        // this replica (the RECEIVING Wanderer) has never placed it.
        const publisherPlacementRegistry = new LocalPlacementRegistry(new InMemoryStorageProvider());
        placeReal(publisherPlacementRegistry, publication.id, new Position(30, 0, 40));
        const publisherSession = makeRealSession(publisherPlacementRegistry);

        const host = makeHost(storageProvider, 'section-c-claim-to-encounter');
        const publicationContentStore = fakeContentStore({ [publication.contentReference.hash]: { world: { buildings: [{ id: 'section-c' }] } } });
        const snapshotDistributionCommand = makeRealSnapshotDistributionCommand({ contentStore: host.arweaveStore, discoveryPublisher: host.discoveryPublisher });
        const distribute = makeDistributeWorldEncounterSnapshotAction({ snapshotDistributionCommand, publicationContentStore, session: publisherSession });
        await distribute(publication);

        // The RECEIVER's own world: a real WorldDiscoverySourceRegistry, a
        // real ObserverLocalEncounterStore, and a real cascade whose own
        // resolvePlacementInfo consults the RECEIVER's OWN (empty)
        // placement registry — never the publisher's.
        const receiverPlacementRegistry = new LocalPlacementRegistry(new InMemoryStorageProvider());
        const receiverWorldModel = makeWorldModel(receiverPlacementRegistry);
        receiverWorldModel.knowPublication(publication);
        const registry = new WorldDiscoverySourceRegistry();
        const store = new ObserverLocalEncounterStore();
        const receiverEncounterPosition = { x: 2, y: 0, z: 3 };
        const cascade = makeCascade(host, receiverWorldModel, registry, { resolveEncounterPosition: () => receiverEncounterPosition });

        const [candidate] = await host.discoverSnapshotCandidatesCommand();
        assert(candidate.publicationId === publication.id && candidate.claimedPosition.x === 30 && candidate.claimedPosition.z === 40,
            'C1. The real, distributed candidate carries the real claim.');

        // Path 1 — AUTOMATIC: the cascade never reads claimedPosition, has
        // no local placement to fall back to, and stops at UNPLACED with an
        // observer-local encounter at the RECEIVER's own position, not the
        // claim's.
        const cascadeResult = await cascade.processCandidate(candidate);
        assert(cascadeResult.outcome === SnapshotWorldPlacementOutcome.UNPLACED, 'C2. The automatic path never consumes the claim — it stops at UNPLACED exactly as if no claim existed.');
        assert(cascadeResult.encounter.position.x === 2 && cascadeResult.encounter.position.z === 3,
            'C3. The resulting observer-local encounter carries the RECEIVER\'s own encounter position (2, _, 3) — never the publisher\'s claimed (30, _, 40).');
        store.record(cascadeResult.encounter);

        // Path 2 — EXPLICIT: the SAME candidate, driven instead through
        // the real, person-initiated OwnPublicationPanel chain (0.9.172),
        // consumes the claim on request — an entirely separate, real
        // production path for the identical discovery result.
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
        assert(ctx.selectedSnapshotWorldPositionClaimResult.outcome === SnapshotWorldPositionClaimOutcome.CLAIMED
            && ctx.selectedSnapshotWorldPositionClaimResult.position.x === 30 && ctx.selectedSnapshotWorldPositionClaimResult.position.z === 40,
            'C4. The explicit path DOES consume the real claim — (30, _, 40), the publisher\'s own position — entirely independent of, and never blocked by, the automatic path\'s own already-recorded observer-local encounter above.');

        console.log('✓ C — the SAME real, distributed candidate reaches two genuinely independent production consumers: the automatic cascade (never touches claimedPosition, produces a session-local encounter at the OBSERVER\'s own position) and the explicit OwnPublicationPanel action (consumes claimedPosition on request, producing neither a PlacementRecord nor an automatic World mutation). 0.9.567\'s own claim-consumption chain and 0.9.552-0.9.554\'s own observer-local chain are now connected by one real discovery result, for the first time.');
    }

    // =======================================================================
    // Section D — FLAGSHIP FINDING: double presentation of one Publication.
    //
    // AMENDED BY 0.9.570 — Suppress Observer-Local Ghosts After
    // Authoritative Placement, in place, mirroring this codebase's own
    // established amendment precedent (e.g. 0.9.566 amending 0.9.565's own
    // Section B, and 0.9.570 itself amending 0.9.569's own Sections A/E/F/K
    // for the identical situation) rather than leaving a now-false "both
    // markers coexist" assertion behind. D1-D4, D7, D9-D10 are unchanged;
    // D5/D6/D8 are updated below to the opposite, now-true fact: the
    // shipped filter suppresses the stale marker. See
    // tests/SuppressObserverLocalGhostsAfterAuthoritativePlacement.test.js
    // for the full production-fix test suite.
    // =======================================================================
    {
        const storageProvider = new InMemoryStorageProvider();
        const publication = publishOwnPublication(storageProvider, 'Section D Publication');
        const publisherPlacementRegistry = new LocalPlacementRegistry(new InMemoryStorageProvider());
        placeReal(publisherPlacementRegistry, publication.id, new Position(10, 0, 20));
        const publisherSession = makeRealSession(publisherPlacementRegistry);

        const host = makeHost(storageProvider, 'section-d-double-presentation');
        const publicationContentStore = fakeContentStore({ [publication.contentReference.hash]: { world: { buildings: [{ id: 'section-d' }] } } });
        const snapshotDistributionCommand = makeRealSnapshotDistributionCommand({ contentStore: host.arweaveStore, discoveryPublisher: host.discoveryPublisher });
        const distribute = makeDistributeWorldEncounterSnapshotAction({ snapshotDistributionCommand, publicationContentStore, session: publisherSession });
        await distribute(publication);

        // One shared registry and one shared observer-local store — EXACTLY
        // the objects a single real ui/main.js composition root hands to
        // BOTH WorldEncounterCanvas AND OwnPublicationPanel for the SAME
        // WorldView mount (application/discovery/WorldDiscoveryRuntimeBootstrap.js:
        // "the ONE piece of mutable runtime state ui/main.js constructs
        // once at startup"; ui/views/WorldView.js: "a fresh
        // ObserverLocalEncounterStore accompanies each fresh session").
        const registry = new WorldDiscoverySourceRegistry();
        const store = new ObserverLocalEncounterStore();

        // T0 — the RECEIVING Wanderer has, as yet, no local placement for
        // this Publication: passive walking discovers it, and the
        // AUTOMATIC cascade stops at UNPLACED, recording an observer-local
        // encounter — the ordinary, already-proven 0.9.552 experience.
        const receiverPlacementRegistry = new LocalPlacementRegistry(new InMemoryStorageProvider());
        const receiverWorldModel = makeWorldModel(receiverPlacementRegistry);
        receiverWorldModel.knowPublication(publication);
        const cascade = makeCascade(host, receiverWorldModel, registry, { resolveEncounterPosition: () => ({ x: 1, y: 0, z: 1 }) });
        const [candidate] = await host.discoverSnapshotCandidatesCommand();
        const t0Result = await cascade.processCandidate(candidate);
        assert(t0Result.outcome === SnapshotWorldPlacementOutcome.UNPLACED && t0Result.encounter, 'D1. T0 — sanity: the ordinary, already-proven UNPLACED + observer-local-encounter outcome.');
        store.record(t0Result.encounter);

        const beforeCtx = buildCanvasInstance({ registry, observerLocalEncounterRegistry: store });
        mountCanvas(beforeCtx);
        assert(projectedPublicationsOf(beforeCtx).length === 0 && projectedObserverLocalEncountersOf(beforeCtx).length === 1,
            'D2. Immediately after T0: the primary channel is empty, and exactly one "Discovered here" marker renders — the ordinary, already-proven state.');
        unmountCanvas(beforeCtx);

        // T1 — STILL WITHIN THE SAME SESSION (same registry, same store —
        // no new WorldView mount, no reload), the SAME Wanderer takes the
        // real, already-shipped, explicit OwnPublicationPanel path for the
        // SAME Publication (e.g. rediscovering their own distributed work,
        // or a peer walking them through recovery) and completes it all
        // the way to "Register Placed Snapshot" — landing a real
        // registration in the SAME shared registry the canvas above reads.
        const panel = panelCtx({
            publication, placementInfo: null, worldDiscoverySourceRegistry: registry,
            discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
            resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
            materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand
        });
        panel.discoverSnapshotCandidates();
        await flushMicrotasks();
        panel.selectSnapshotCandidate(panel.snapshotCandidateDiscoveryResult[0]);
        panel.resolveSelectedSnapshot();
        await flushMicrotasks();
        panel.materializeSelectedSnapshot();
        await flushMicrotasks();
        panel.useClaimedSnapshotPosition();
        panel.placeMaterializedSnapshot();
        panel.registerMaterializedSnapshot();
        assert(panel.selectedSnapshotWorldRegistrationResult.outcome === SnapshotWorldRegistrationOutcome.REGISTERED,
            'D3. T1 — the real, already-shipped explicit path completes to REGISTERED, landing in the SAME shared registry.');

        // The double presentation, live, in one mount.
        const afterCtx = buildCanvasInstance({ registry, observerLocalEncounterRegistry: store });
        mountCanvas(afterCtx);
        const primaryAfter = projectedPublicationsOf(afterCtx);
        const observerLocalAfter = projectedObserverLocalEncountersOf(afterCtx);
        assert(primaryAfter.length === 1 && primaryAfter[0].objectId === publication.id,
            'D4. The primary channel now correctly, permanently renders the Publication at its real, claim-derived position.');
        assert(observerLocalAfter.length === 0,
            'D5. (AMENDED BY 0.9.570) THE FINDING, FIXED: the observer-local channel no longer renders a marker for this SAME publicationId — WorldEncounterCanvas.js\'s own projectedObserverLocalEncounters now suppresses any row whose publicationId already has a publicationRows entry.');
        assert(store.list().some((e) => e.publicationId === publication.id),
            'D6. (AMENDED BY 0.9.570) The underlying ObserverLocalEncounterStore recorded encounter from T0 is untouched — only the RENDERED projection changed; this remains a presentation-only fix, exactly as 0.9.569 Section J/L located it.');

        // The observer-local panel's OWN real vocabulary, quoted verbatim
        // from live source.
        const canvasSource = (await Promise.all(worldEncounterCanvasFiles().map((file) => readSource(file)))).join('\n');
        assert(canvasSource.includes('This was discovered during your current World session. It has not been placed'),
            'D7. The real, shipped observer-local inspection panel text is confirmed, verbatim, against live source.');
        assert(receiverPlacementRegistry.findByPublicationId(publication.id).length === 0,
            'D8. (AMENDED BY 0.9.570) To be precise about WHAT this text still describes: "has not been placed" remains literally true of the PlacementRecord layer (the receiver still holds zero authoritative PlacementRecords) — and, unlike the pre-0.9.570 finding this section used to make, the sentence is no longer shown alongside a permanent marker for the SAME Publication on the same canvas: the marker that would have made it misleading (D5, above) no longer renders. An inspection panel already open before convergence is a separate, deliberately-preserved case — see 0.9.569 Section H / this file\'s own Section K, unaffected by this amendment.');

        // Re-processing the identical candidate a second time (an ordinary
        // later observation tick, e.g. the Wanderer walks past again) does
        // NOT self-heal this — the cascade's own idempotency map returns
        // the FIRST, memoized UNPLACED result forever, never re-consulting
        // resolvePlacementInfo even though a real PlacementRecord now
        // exists for this exact publicationId one call earlier in this
        // same test.
        placeReal(receiverPlacementRegistry, publication.id, new Position(10, 0, 20));
        assert(receiverWorldModel.resolvePlacementInfo(publication.id) !== null,
            'D9. Sanity — resolvePlacementInfo, consulted FRESH, would now genuinely find a placement.');
        const secondResult = await cascade.processCandidate(candidate);
        assert(secondResult.outcome === SnapshotWorldPlacementOutcome.UNPLACED,
            'D10. Yet re-processing the SAME candidate on this SAME cascade instance still returns the memoized UNPLACED result — 0.9.187\'s own idempotency ("the FIRST call... stores its own result... every SUBSEQUENT call... receives that SAME stored promise back") means an observer-local encounter, once recorded, has no path back to REGISTERED for its own cascade instance, even after an authoritative placement becomes known.');

        console.log('✓ D — (AMENDED BY 0.9.570) FLAGSHIP FINDING, FIXED: once a Publication is discovered while UNPLACED (recording a session-scoped observer-local "Discovered here" encounter) and LATER, within the SAME session, reaches the primary WorldDiscoverySourceRegistry channel by any real, already-shipped means, only the permanent, authoritative marker now renders — the stale observer-local ghost is suppressed by WorldEncounterCanvas.js\'s own projectedObserverLocalEncounters, reproduced here through the same two entirely real, already-shipped production paths (automatic cascade + explicit OwnPublicationPanel registration) sharing the one registry ui/main.js genuinely hands both. The underlying ObserverLocalEncounterStore record is untouched (D6); this remains presentation-only — see Section K.');
    }

    // =======================================================================
    // Section E — multiple Publications, shared position.
    // =======================================================================
    {
        const storageProvider = new InMemoryStorageProvider();
        const p1 = publishOwnPublication(storageProvider, 'Section E Publication 1');
        const p2 = publishOwnPublication(storageProvider, 'Section E Publication 2');
        const p3 = publishOwnPublication(storageProvider, 'Section E Publication 3');
        const placementRegistry = new LocalPlacementRegistry(storageProvider);
        const sharedPosition = new Position(100, 0, 100);
        placeReal(placementRegistry, p1.id, sharedPosition);
        placeReal(placementRegistry, p2.id, sharedPosition);
        placeReal(placementRegistry, p3.id, new Position(-100, 0, -100));
        const session = makeRealSession(placementRegistry);

        const registry = new WorldDiscoverySourceRegistry();
        for (const publication of [p1, p2, p3]) {
            const placementInfo = session.getPlacementInfoForPublication(publication.id);
            const materialization = { outcome: StoreSnapshotContentOutcome.STORED, contentHash: `hash-${publication.id}`, contentReference: new ContentReference({ hash: `hash-${publication.id}`, uri: 'local://x', storage: 'local' }) };
            const placement = resolveSnapshotWorldPlacement(materialization, placementInfo);
            registerMaterializedSnapshotWorldSource(registry, placement, publication);
        }

        const view = viewById(registry);
        assert(view[p1.id].x === 100 && view[p1.id].z === 100, 'E1. P1 at A.');
        assert(view[p2.id].x === 100 && view[p2.id].z === 100, 'E2. P2 at A — the SAME coordinates as P1.');
        assert(view[p3.id].x === -100 && view[p3.id].z === -100, 'E3. P3 at B.');
        assert(p1.id !== p2.id && p1.id !== p3.id && p2.id !== p3.id, 'E4. Sanity — three genuinely distinct Publication identities.');

        const ctx = buildCanvasInstance({ registry });
        mountCanvas(ctx);
        const projected = projectedPublicationsOf(ctx);
        assert(projected.length === 3, 'E5. All three render as three independent markers — spatial coincidence never collapses them into one, into two, or into a merged/averaged entity.');
        assert(new Set(projected.map((m) => m.objectId)).size === 3, 'E6. Three distinct objectIds — the registry never deduplicates by position.');

        ctx.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: p1.id });
        assert(ctx.selectedEncounterInspection.title === 'Section E Publication 1', 'E7. Selecting the marker AT position A resolves to exactly P1, addressed by its own distinct origin/id, never an ambiguous "whichever Publication is at A" resolution.');

        console.log('✓ E — three Publications, two of them sharing one exact World position, remain three fully independent, individually addressable, individually selectable entities throughout.');
    }

    // =======================================================================
    // Section F — republished identical content, different positions.
    // =======================================================================
    {
        const storageProvider = new InMemoryStorageProvider();
        // Two DIFFERENT Publications, deliberately given the identical
        // contentHash by registering the SAME ContentReference for both —
        // mirrors tests/SnapshotWorldOriginCollision.test.js's own 0.9.163
        // setup.
        const sharedContentHash = 'section-f-shared-hash';
        const p1 = new Publication({ id: 'section-f-p1', documentId: 'doc-f-1', title: 'Republished As P1', author: 'alice', contentHash: sharedContentHash, contentReference: new ContentReference({ hash: sharedContentHash, uri: 'local://f', storage: 'local' }) });
        const p2 = new Publication({ id: 'section-f-p2', documentId: 'doc-f-2', title: 'Republished As P2', author: 'bob', contentHash: sharedContentHash, contentReference: new ContentReference({ hash: sharedContentHash, uri: 'local://f', storage: 'local' }) });

        const placementRegistry = new LocalPlacementRegistry(storageProvider);
        placeReal(placementRegistry, p1.id, new Position(11, 0, 11));
        placeReal(placementRegistry, p2.id, new Position(22, 0, 22));
        const session = makeRealSession(placementRegistry);

        const registry = new WorldDiscoverySourceRegistry();
        for (const publication of [p1, p2]) {
            const placementInfo = session.getPlacementInfoForPublication(publication.id);
            const materialization = { outcome: StoreSnapshotContentOutcome.STORED, contentHash: sharedContentHash, contentReference: publication.contentReference };
            const placement = resolveSnapshotWorldPlacement(materialization, placementInfo);
            registerMaterializedSnapshotWorldSource(registry, placement, publication);
        }
        const view = viewById(registry);
        assert(view[p1.id].x === 11 && view[p2.id].x === 22, 'F1. Via the PRIMARY/PlacementRecord channel — republishing identical content at a different position never leaks the sibling\'s own position.');

        // The identical proof through the OBSERVER-LOCAL channel: two
        // independent candidates, sharing one contentHash, each carrying
        // its OWN claim, each independently consumed.
        const { resolveSnapshotWorldPositionClaim } = await import('../application/snapshot/placement/SnapshotWorldPositionClaim.js');
        const candidateP1 = { contentHash: sharedContentHash, locator: 'l', storage: 's', publicationId: p1.id, claimedPosition: { x: 11, y: 0, z: 11 } };
        const candidateP2 = { contentHash: sharedContentHash, locator: 'l', storage: 's', publicationId: p2.id, claimedPosition: { x: 22, y: 0, z: 22 } };
        const claimP1AgainstP1 = resolveSnapshotWorldPositionClaim(candidateP1, p1.id);
        const claimP2AgainstP1 = resolveSnapshotWorldPositionClaim(candidateP2, p1.id);
        assert(claimP1AgainstP1.outcome === SnapshotWorldPositionClaimOutcome.CLAIMED && claimP1AgainstP1.position.x === 11,
            'F2. P1\'s own candidate, checked against P1, resolves CLAIMED at P1\'s own position.');
        assert(claimP2AgainstP1.outcome === SnapshotWorldPositionClaimOutcome.MISMATCHED,
            'F3. P2\'s own candidate, checked against P1\'s identity, resolves MISMATCHED — the shared contentHash never lets P2\'s claim silently stand in for P1\'s.');

        // And through the OBSERVER-LOCAL ENCOUNTER: two independent
        // encounters, the SAME contentHash, each keyed by its own
        // publicationId:contentHash pair.
        const encounterP1 = describeObserverLocalPublicationEncounter({ publicationId: p1.id, contentHash: sharedContentHash, encounterPosition: { x: 1, y: 0, z: 1 } });
        const encounterP2 = describeObserverLocalPublicationEncounter({ publicationId: p2.id, contentHash: sharedContentHash, encounterPosition: { x: 2, y: 0, z: 2 } });
        const store = new ObserverLocalEncounterStore();
        store.record(encounterP1);
        store.record(encounterP2);
        assert(store.list().length === 2, 'F4. Two independent observer-local encounters — the shared contentHash never causes one to replace the other; the store key is publicationId:contentHash, not contentHash alone.');

        console.log('✓ F — two Publications republishing identical content at different positions stay fully separated across all three spatial mechanisms: the primary/authoritative channel, distributed claim resolution, and observer-local encounters.');
    }

    // =======================================================================
    // Section G — user journey continuity for an observer-local encounter.
    // =======================================================================
    {
        const storageProvider = new InMemoryStorageProvider();
        const publicationId = 'section-g-pub';
        const documentId = 'section-g-doc';
        const contentHash = 'section-g-hash';
        const publication = new Publication({ id: publicationId, documentId, title: 'Section G Publication', author: 'alice', contentHash, contentReference: new ContentReference({ hash: contentHash, uri: 'local://g', storage: 'local' }) });
        knowPublicationsLocally(storageProvider, [publication]);
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
        const verifier = new MapVerifier({ [publicationId]: true });

        const openPublicationCommand = commandSpy();
        const forkPublicationCommand = commandSpy();
        const explorePublicationCommand = commandSpy();
        const getPublicationCommentariesCommand = () => [];

        const registry = new WorldDiscoverySourceRegistry();
        const store = new ObserverLocalEncounterStore();
        store.record(describeObserverLocalPublicationEncounter({ publicationId, contentHash, encounterPosition: { x: 7, y: 0, z: 7 } }));

        // Walk -> discover -> see it in World.
        const ctx = buildCanvasInstance({
            registry, observerLocalEncounterRegistry: store, materialSources: { local: localSource }, materialVerifier: verifier,
            openPublicationCommand, forkPublicationCommand, explorePublicationCommand, getPublicationCommentariesCommand
        });
        mountCanvas(ctx);
        assert(projectedObserverLocalEncountersOf(ctx).some((m) => m.publicationId === publicationId), 'G1. Walk -> Discover -> see it in World: the marker renders.');

        // Inspect.
        ctx.selectObserverLocalEncounter({ publicationId, contentHash });
        await flushMicrotasks();
        assert(ctx.observerLocalEncounterInspection && ctx.observerLocalEncounterInspection.verification.status === 'VERIFIED', 'G2. Inspect: material resolves and verifies.');
        assert(ctx.observerLocalEncounterActionablePublication && ctx.observerLocalEncounterActionablePublication.id === publicationId, 'G3. The resolved, actionable Publication is exactly this one.');

        // Open / Fork / Explore / Comment.
        ctx.openObserverLocalEncounterPublication();
        ctx.forkObserverLocalEncounterPublication();
        ctx.exploreObserverLocalEncounterPublication();
        assert(openPublicationCommand.calls.length === 1 && openPublicationCommand.calls[0][0].id === publicationId, 'G4. Open reaches the real, resolved Publication object.');
        assert(forkPublicationCommand.calls.length === 1, 'G5. Fork likewise.');
        assert(explorePublicationCommand.calls.length === 1, 'G6. Explore likewise.');
        ctx.toggleObserverLocalEncounterCommentary();
        await flushMicrotasks();
        assert(ctx.observerLocalEncounterCommentaryPublicationId === publicationId, 'G7. Comment is keyed to exactly this Publication\'s own id.');

        // Walk away.
        ctx.dismissObserverLocalEncounterInspection();
        assert(ctx.selectedObserverLocalEncounter === null, 'G8. Walk away: the selection clears, but the underlying store entry is untouched — see 0.9.555 Section B, "walk away and return."');
        assert(store.list().length === 1, 'G8b. Sanity — dismissing a selection never removes the store\'s own record.');

        // Rediscover.
        ctx.selectObserverLocalEncounter({ publicationId, contentHash });
        await flushMicrotasks();
        assert(ctx.observerLocalEncounterActionablePublication && ctx.observerLocalEncounterActionablePublication.id === publicationId,
            'G9. Rediscover: re-selecting the same still-recorded encounter resolves to the identical actionable Publication, and every action remains available exactly as before.');
        ctx.openObserverLocalEncounterPublication();
        assert(openPublicationCommand.calls.length === 2, 'G10. Open works again after rediscovery, with no re-registration of any kind required.');

        console.log('✓ G — the complete Walk -> Discover -> Inspect -> Open/Fork/Explore/Comment -> walk away -> rediscover journey holds together for a Publication that originated purely from decentralized, observer-local discovery, built entirely on the real 0.9.552-0.9.559 machinery.');
    }

    // =======================================================================
    // Section H — vocabulary audit.
    // =======================================================================
    {
        const canvasSource = (await Promise.all(worldEncounterCanvasFiles().map((file) => readSource(file)))).join('\n');
        const panelSource = (await Promise.all(ownPublicationPanelFiles().map((file) => readSource(file)))).join('\n');
        const canvasSourceNormalized = canvasSource.replace(/\s+/g, ' ');

        // 1. Observer-local: "Discovered here" — never a claim of ownership,
        // authenticity, or permanence.
        assert(canvasSource.includes('>Discovered here<'), 'H1. The observer-local marker\'s own label is exactly "Discovered here" — an event, never a standing claim.');
        assert(canvasSource.includes('This publication was discovered while you were here. Its publisher\'s own location claim has not been used as a World placement.'),
            'H2. The marker\'s own tooltip explicitly disclaims that a publisher\'s location claim was ever used as a World placement — the exact distinction Section H of this milestone\'s own brief asked for, already present, verbatim.');
        assert(canvasSourceNormalized.includes('This was discovered during your current World session. It has not been placed anywhere in the shared World, and will not be found here again after you leave or reload.'),
            'H3. The inspection panel\'s own prose is explicit about session-scoping and non-placement — none of it implies ownership or authority.');

        // 2. Distributed claim consumption (OwnPublicationPanel): "Position
        // Claim" / "Claimed Position" — never "Placed" until the SEPARATE
        // "Place Materialized Snapshot" action is taken.
        assert(panelSource.includes('>Use Claimed Position<') && panelSource.includes('Selected Snapshot Position Claim') && panelSource.includes('<dt>Claimed Position</dt>'),
            'H4. The claim-consumption vocabulary is its own distinct family — "Position Claim"/"Claimed Position" — never conflated with "World Placement" (a separate dt/dd block, gated behind a SEPARATE, later "Place Materialized Snapshot" click).');

        // 3. The gap this section actually finds: once a Publication
        // reaches the PRIMARY registry-backed channel, its own "Source"
        // label distinguishes Local/Peer/Snapshot (transport family) but
        // nothing distinguishes an authoritative-PlacementRecord-backed
        // registration from a claim-consumption-backed one — both are
        // "Source: Snapshot," with no further provenance shown.
        const storageProvider = new InMemoryStorageProvider();
        const publication = publishOwnPublication(storageProvider, 'Section H Publication');
        const placementRegistry = new LocalPlacementRegistry(storageProvider);
        placeReal(placementRegistry, publication.id, new Position(3, 0, 3));
        const session = makeRealSession(placementRegistry);
        const placementInfo = session.getPlacementInfoForPublication(publication.id);
        const materialization = { outcome: StoreSnapshotContentOutcome.STORED, contentHash: 'h', contentReference: new ContentReference({ hash: 'h', uri: 'local://x', storage: 'local' }) };
        const authoritativePlacement = resolveSnapshotWorldPlacement(materialization, placementInfo);
        const registry = new WorldDiscoverySourceRegistry();
        registerMaterializedSnapshotWorldSource(registry, authoritativePlacement, publication);

        const ctx = buildCanvasInstance({ registry });
        mountCanvas(ctx);
        projectedPublicationsOf(ctx);
        ctx.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: publication.id });
        assert(ctx.selectedEncounterPresentationSourceLabel === 'Snapshot', 'H5. An authoritative-PlacementRecord-backed registration presents as "Source: Snapshot."');

        // A SEPARATE Publication, registered via a hand-built claim-derived
        // placementInfo (mirroring OwnPublicationPanel#placeMaterializedSnapshot()'s
        // own synthetic placementInfo for a CLAIMED result) — same origin
        // family, same label.
        const claimedPublication = publishOwnPublication(storageProvider, 'Section H Claimed Publication');
        const claimDerivedPlacementInfo = Object.freeze({ placementId: `claim:h2:${claimedPublication.id}`, publicationId: claimedPublication.id, position: { x: 77, y: 0, z: 77 } });
        const claimDerivedMaterialization = { outcome: StoreSnapshotContentOutcome.STORED, contentHash: 'h2', contentReference: new ContentReference({ hash: 'h2', uri: 'local://y', storage: 'local' }) };
        const claimDerivedPlacement = resolveSnapshotWorldPlacement(claimDerivedMaterialization, claimDerivedPlacementInfo);
        registerMaterializedSnapshotWorldSource(registry, claimDerivedPlacement, claimedPublication);
        projectedPublicationsOf(ctx);
        ctx.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: claimedPublication.id });
        assert(ctx.selectedEncounterPresentationSourceLabel === 'Snapshot', 'H6. A claim-consumption-backed registration presents IDENTICALLY — "Source: Snapshot" — with no textual or visual distinction from an authoritative-PlacementRecord-backed one.');

        console.log('✓ H — the observer-local and claim-consumption vocabularies are both already honest and already distinct from "placed"/"authoritative." One narrow, secondary gap: once EITHER a real PlacementRecord or a person-registered distributed claim reaches the primary channel, both present identically as "Source: Snapshot" — a Wanderer inspecting either has no way to tell, from the product\'s own vocabulary, which kind of spatial provenance they are looking at. See Section M.');
    }

    // =======================================================================
    // Section I — lifecycle: what actually survives each boundary.
    // =======================================================================
    {
        // 1. PlacementRecord — persistent, via StorageProvider.
        const storageProvider = new InMemoryStorageProvider();
        const publication = publishOwnPublication(storageProvider, 'Section I Publication');
        const placementRegistry = new LocalPlacementRegistry(storageProvider);
        placeReal(placementRegistry, publication.id, new Position(1, 0, 1));
        const freshRegistryOverSameStorage = new LocalPlacementRegistry(storageProvider);
        assert(freshRegistryOverSameStorage.findByPublicationId(publication.id).length === 1,
            'I1. PERSISTENT — a brand-new LocalPlacementRegistry instance, over the SAME underlying StorageProvider (mirroring a reload/new session reconnecting to the same local storage), still finds the PlacementRecord.');

        // 2. Distributed claimedPosition — persists on the decentralized
        // network (rediscoverable indefinitely by ANY replica), but
        // consuming/registering it locally is NOT itself persisted; see
        // ui/main.js's own construction, verified below.
        const mainSource = (await Promise.all(mainFiles().map((file) => readSource(file)))).join('\n');
        assert(/const worldDiscoveryRuntime\s*=\s*bootstrapWorldDiscoveryRuntime/.test(mainSource) || mainSource.includes('bootstrapWorldDiscoveryRuntime'),
            'I2. sanity — ui/main.js genuinely constructs the World discovery runtime (registry included) once, at startup — confirmed against live source.');
        const bridgeSource = await readSource('application/snapshot/materialization/MaterializedSnapshotWorldDiscoveryBridge.js');
        assert(bridgeSource.includes('mutable runtime state'),
            'I3. application/snapshot/materialization/MaterializedSnapshotWorldDiscoveryBridge.js\'s own header confirms the registry is "the ONE piece of mutable runtime state ui/main.js constructs once at startup" — constructed fresh, in memory, every time, never loaded from a StorageProvider.');
        const registry = new WorldDiscoverySourceRegistry();
        assert(typeof registry.constructor === 'function' && registry.listSources().length === 0,
            'I4. A freshly-constructed WorldDiscoverySourceRegistry (the SAME shape a reload produces) starts genuinely empty — a REGISTERED claim from a prior session does not survive; only rediscovering and re-consuming the still-announced claim from the network would restore it, which is a fresh act, not a resumed one.');

        // 3. Observer-local encounter — session-local, in-memory, no
        // persistence of any kind (0.9.552's own header, reconfirmed
        // directly by constructing one and checking it exposes no
        // storage/persistence surface at all).
        const store = new ObserverLocalEncounterStore();
        assert(typeof store.save === 'undefined' && typeof store.load === 'undefined' && typeof store.persist === 'undefined',
            'I5. ObserverLocalEncounterStore exposes no save/load/persist method of any kind — a fresh instance (the SAME shape a reload, or a new WorldView mount, produces) starts genuinely empty, with no mechanism by which it ever could not.');
        const encounterSource = await readSource('application/worldEncounter/ObserverLocalEncounterStore.js');
        assert(encounterSource.includes('No `StorageProvider`, no survival across a'), 'I5b. Confirmed against the file\'s own explicit header.');

        console.log('✓ I — derived from real behavior, not assumption: PlacementRecord survives leave/rediscover/reload/new session (ordinary StorageProvider persistence); a distributed claimedPosition survives on the network indefinitely but a LOCAL registration of it never outlives the runtime registry that held it — a reload requires rediscovering and re-consuming it, a genuinely fresh act; an observer-local encounter survives only "walk away and return" within the SAME session, and never a reload or a new session — confirming the table this milestone\'s own brief proposed as a hypothesis is, in fact, what the real code does.');
    }

    // =======================================================================
    // Section J — failure isolation at five independent boundaries.
    // =======================================================================
    {
        const storageProvider = new InMemoryStorageProvider();
        const publicationA = publishOwnPublication(storageProvider, 'Section J Publication A');
        const publicationB = publishOwnPublication(storageProvider, 'Section J Publication B');
        const placementRegistry = new LocalPlacementRegistry(storageProvider);
        placeReal(placementRegistry, publicationB.id, new Position(5, 0, 5));
        const worldModel = makeWorldModel(placementRegistry);
        worldModel.knowPublication(publicationA);
        worldModel.knowPublication(publicationB);
        const registry = new WorldDiscoverySourceRegistry();

        // J1 — claim unavailable (no publicationId/claimedPosition at all)
        // never blocks a SEPARATE candidate that does carry one.
        const host = makeHost(storageProvider, 'section-j-failure-isolation');
        const refA = await host.arweaveStore.put('bytes-a');
        await host.discoveryPublisher.publish({ contentHash: refA.hash, locator: refA.uri, storage: refA.storage }); // no claim
        const refB = await host.arweaveStore.put('bytes-b');
        await host.discoveryPublisher.publish({ contentHash: refB.hash, locator: refB.uri, storage: refB.storage, publicationId: publicationB.id, claimedPosition: { x: 5, y: 0, z: 5 } });
        const cascade = makeCascade(host, worldModel, registry, { resolveEncounterPosition: () => ({ x: 0, y: 0, z: 0 }) });
        const candidates = await host.discoverSnapshotCandidatesCommand();
        const results = await Promise.all(candidates.map((c) => cascade.processCandidate(c)));
        assert(results.some((r) => r.outcome === AutomaticSnapshotEncounterCascadeOutcome.INELIGIBLE),
            'J1. A candidate carrying no publicationId is INELIGIBLE for the cascade — and this never prevents the SEPARATE, real claim-carrying candidate from reaching REGISTERED.');
        assert(results.some((r) => r.outcome === SnapshotWorldRegistrationOutcome.REGISTERED), 'J1b. The other candidate genuinely does reach REGISTERED, unaffected.');

        // J2 — placement unavailable (materialized, but no authoritative
        // placement known) degrades to UNPLACED, never corrupting a sibling.
        assert(worldModel.resolvePlacementInfo(publicationA.id) === null, 'J2. Sanity — Publication A genuinely has no placement.');

        // J3 — discovery unavailable.
        const discoveryResult = await executeDiscoverSnapshotCandidatesCommand({ discoveryTag: 'section-j-nonexistent-tag', discoveryQueryService: host.discoveryQueryService });
        assert(Array.isArray(discoveryResult) && discoveryResult.length === 0, 'J3. An unmatched discovery tag returns an empty result, never a throw, never affecting the tag used above.');

        // J4 — verification fails (content-hash mismatch) never rescues,
        // nor is rescued by, a plausible claim.
        const forgedRef = await host.arweaveStore.put('Section J genuinely different bytes');
        const forgedCandidate = { contentHash: 'not-the-real-hash', locator: forgedRef.uri, storage: forgedRef.storage, publicationId: publicationB.id, claimedPosition: { x: 5, y: 0, z: 5 } };
        const forgedResolution = await host.resolveSelectedSnapshotCommand(forgedCandidate);
        assert(forgedResolution.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH, 'J4. Verification genuinely fails despite a plausible, correctly-addressed claim.');
        assert(registry.listSources().length === 1, 'J4b. The earlier, successful registration above (Publication B) is completely unaffected by this unrelated failure.');

        // J5 — observer-local position unavailable degrades to
        // `encounter: null`, never corrupting the underlying UNPLACED
        // outcome.
        const unpositionedCascade = makeCascade(host, worldModel, new WorldDiscoverySourceRegistry(), { resolveEncounterPosition: () => { throw new Error('no position available'); } });
        const refC = await host.arweaveStore.put('bytes-c-section-j');
        await host.discoveryPublisher.publish({ contentHash: refC.hash, locator: refC.uri, storage: refC.storage, publicationId: publicationA.id, claimedPosition: { x: 8, y: 0, z: 8 } });
        const [candidateC] = (await host.discoverSnapshotCandidatesCommand()).filter((c) => c.contentHash === refC.hash);
        const j5Result = await unpositionedCascade.processCandidate(candidateC);
        assert(j5Result.outcome === SnapshotWorldPlacementOutcome.UNPLACED && j5Result.encounter === null,
            'J5. A throwing resolveEncounterPosition degrades to `encounter: null` — the UNPLACED outcome itself, already earned by real resolution/verification/materialization, is never retroactively corrupted into a failure.');

        console.log('✓ J — each of the five named failure boundaries (claim absence, placement absence, discovery miss, verification failure, encounter-position failure) fails in isolation, propagating its own real, pre-existing outcome, never corrupting an unrelated already-succeeded result.');
    }

    // =======================================================================
    // Section K — consumer action safety under Section D's own condition.
    //
    // AMENDED BY 0.9.570 — K0 updated to the now-fixed rendering fact (see
    // Section D's own amendment note); K1-K6 are unchanged and still prove
    // exactly what they always did: an observer-local SELECTION, made
    // directly (never through the now-filtered projected marker list),
    // stays fully actionable and uncorrupted even once the marker that
    // would have led a Wanderer to make it has stopped rendering — the
    // "inspection continuity" property 0.9.569 Section H and this
    // milestone's own Section F/H already established.
    // =======================================================================
    {
        const storageProvider = new InMemoryStorageProvider();
        const documentId = 'section-k-doc';
        const contentHash = 'section-k-hash';
        const publication = new Publication({ id: 'section-k-pub', documentId, title: 'Section K Publication', author: 'alice', contentHash, contentReference: new ContentReference({ hash: contentHash, uri: 'local://k', storage: 'local' }) });
        knowPublicationsLocally(storageProvider, [publication]);
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
        const verifier = new MapVerifier({ [publication.id]: true });

        const registry = new WorldDiscoverySourceRegistry();
        const store = new ObserverLocalEncounterStore();
        // Reproduce Section D's own double-presentation condition for THIS
        // Publication: a stale observer-local encounter, PLUS a real
        // primary registration.
        store.record(describeObserverLocalPublicationEncounter({ publicationId: publication.id, contentHash, encounterPosition: { x: 9, y: 0, z: 9 } }));
        const placementRegistry = new LocalPlacementRegistry(storageProvider);
        placeReal(placementRegistry, publication.id, new Position(40, 0, 40));
        const session = makeRealSession(placementRegistry);
        const placementInfo = session.getPlacementInfoForPublication(publication.id);
        const materialization = { outcome: StoreSnapshotContentOutcome.STORED, contentHash, contentReference: publication.contentReference };
        const placement = resolveSnapshotWorldPlacement(materialization, placementInfo);
        registerMaterializedSnapshotWorldSource(registry, placement, publication);

        const beforeAdd = placementRegistry.findByPublicationId(publication.id).length;

        const openPublicationCommand = commandSpy();
        const forkPublicationCommand = commandSpy();
        const explorePublicationCommand = commandSpy();
        const getPublicationCommentariesCommand = (publicationId) => [{ commentaryId: 'c1', publicationId, content: 'hi', authorIdentityId: 'bob' }];

        const ctx = buildCanvasInstance({
            registry, observerLocalEncounterRegistry: store, materialSources: { local: localSource }, materialVerifier: verifier,
            openPublicationCommand, forkPublicationCommand, explorePublicationCommand, getPublicationCommentariesCommand
        });
        mountCanvas(ctx);
        assert(projectedPublicationsOf(ctx).length === 1 && projectedObserverLocalEncountersOf(ctx).length === 0,
            'K0. (AMENDED BY 0.9.570) Sanity — the primary marker renders; the observer-local marker for the SAME publicationId is now suppressed, exactly as Section D\'s own fix produces. K1-K6, below, confirm this does not corrupt a direct observer-local SELECTION made despite the marker no longer rendering.');

        // K1 — the PRIMARY marker's own Open/Fork/Explore/Comment (via
        // ordinary selection) act on the resolved Publication, never
        // creating or mutating a PlacementRecord.
        ctx.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: publication.id });
        assert(ctx.selectionOutcome.status === WorldEncounterSelectionOutcomeStatus.RESOLVED, 'K1. The primary marker selects normally.');
        ctx.toggleEncounterCommentary();
        await flushMicrotasks();
        assert(ctx.encounterCommentaryPublicationId === publication.id && ctx.encounterCommentaries.length === 1,
            'K2. Commentary on the primary marker is keyed by exactly this publicationId.');

        // K2 — the STALE observer-local marker's own Open/Fork/Explore/
        // Comment ALSO act on the identical resolved Publication (the
        // SAME real local material, the SAME real id/documentId) —
        // neither path is corrupted by the other's presence.
        ctx.selectObserverLocalEncounter({ publicationId: publication.id, contentHash });
        await flushMicrotasks();
        assert(ctx.observerLocalEncounterActionablePublication.id === publication.id && ctx.observerLocalEncounterActionablePublication.documentId === documentId,
            'K3. The stale observer-local marker STILL resolves to the correct, real Publication — never a corrupted or orphaned reference merely because a primary registration now also exists.');
        ctx.openObserverLocalEncounterPublication();
        ctx.forkObserverLocalEncounterPublication();
        ctx.exploreObserverLocalEncounterPublication();
        assert(openPublicationCommand.calls.length === 1 && openPublicationCommand.calls[0][0].id === publication.id, 'K4. Open, from the stale marker, still hands back the correct, real object.');
        assert(forkPublicationCommand.calls.length === 1 && forkPublicationCommand.calls[0][0].documentId === documentId,
            'K5. Fork preserves the real documentId lineage — never a documentId synthesized from the encounter\'s own contentHash/position.');
        assert(explorePublicationCommand.calls.length === 1, 'K6. Explore likewise.');

        // K3 — no action, from EITHER marker, ever creates or mutates a
        // PlacementRecord — the double presentation is confirmed to be a
        // presentation-only defect, never an authority leak.
        assert(placementRegistry.findByPublicationId(publication.id).length === beforeAdd,
            'K7. After exercising every action on BOTH the primary and the stale observer-local marker, the authoritative PlacementRegistry is byte-for-byte unchanged — no action anywhere silently promotes an encounter, a selection, or an inspection into a new or modified PlacementRecord.');

        console.log('✓ K — even under Section D\'s own double-presentation condition, Open/Fork/Explore/Comment remain fully safe on both markers: identity stays correct, lineage stays correct, commentary stays correctly keyed, and no action ever creates or mutates a PlacementRecord. The gap Section D found is confirmed, here, to be presentation-only.');
    }

    // =======================================================================
    // Section L — FLAGSHIP ADVERSARIAL SCENARIO.
    // =======================================================================
    {
        const storageProvider = new InMemoryStorageProvider();
        const p1 = publishOwnPublication(storageProvider, 'Publisher A — P1');
        const p2 = publishOwnPublication(storageProvider, 'Publisher A — P2');
        const publisherPlacementRegistry = new LocalPlacementRegistry(new InMemoryStorageProvider());
        placeReal(publisherPlacementRegistry, p1.id, new Position(10, 0, 10));
        placeReal(publisherPlacementRegistry, p2.id, new Position(50, 0, 50));
        const publisherSession = makeRealSession(publisherPlacementRegistry);

        // Publisher A distributes both, sharing ONE contentHash (identical
        // bytes republished under two Publication identities).
        const host = makeHost(storageProvider, 'section-l-flagship');
        const sharedSnapshotJson = { world: { buildings: [{ id: 'flagship-shared' }] } };
        const publicationContentStore = fakeContentStore({ [p1.contentReference.hash]: sharedSnapshotJson, [p2.contentReference.hash]: sharedSnapshotJson });
        const snapshotDistributionCommand = makeRealSnapshotDistributionCommand({ contentStore: host.arweaveStore, discoveryPublisher: host.discoveryPublisher });
        const distribute = makeDistributeWorldEncounterSnapshotAction({ snapshotDistributionCommand, publicationContentStore, session: publisherSession });
        const distP1 = await distribute(p1);
        const distP2 = await distribute(p2);
        assert(distP1.contentReference.hash === distP2.contentReference.hash, 'L1. Sanity — P1 and P2 genuinely share one contentHash.');

        // Wanderer/Publisher B discovers both via Nostr.
        const candidates = await host.discoverSnapshotCandidatesCommand();
        assert(candidates.length === 2, 'L2. Both are independently discoverable.');
        const candidateP1 = candidates.find((c) => c.publicationId === p1.id);
        const candidateP2 = candidates.find((c) => c.publicationId === p2.id);

        // Walk / encounter: the Wanderer has never placed either locally,
        // so BOTH stop at UNPLACED via the automatic cascade, each with
        // its OWN observer-local encounter at the Wanderer's own position.
        const receiverPlacementRegistry = new LocalPlacementRegistry(new InMemoryStorageProvider());
        const worldModel = makeWorldModel(receiverPlacementRegistry);
        worldModel.knowPublication(p1);
        worldModel.knowPublication(p2);
        const registry = new WorldDiscoverySourceRegistry();
        const store = new ObserverLocalEncounterStore();
        const cascade = makeCascade(host, worldModel, registry, { resolveEncounterPosition: () => ({ x: 0, y: 0, z: 0 }) });
        const resultP1 = await cascade.processCandidate(candidateP1);
        const resultP2 = await cascade.processCandidate(candidateP2);
        assert(resultP1.outcome === SnapshotWorldPlacementOutcome.UNPLACED && resultP2.outcome === SnapshotWorldPlacementOutcome.UNPLACED,
            'L3. Both stop at UNPLACED — the shared contentHash never causes one to inherit an authoritative placement it does not itself have.');
        store.record(resultP1.encounter);
        store.record(resultP2.encounter);

        // Inspect -> Open/Fork/Explore/Comment for EACH, correctly, via the
        // explicit claim path (the Wanderer chooses to trust and use each
        // publisher's own claim) — never a content-hash shortcut that
        // collapses P1/P2.
        const { resolveSnapshotWorldPositionClaim } = await import('../application/snapshot/placement/SnapshotWorldPositionClaim.js');
        const claimP1 = resolveSnapshotWorldPositionClaim(candidateP1, p1.id);
        const claimP2 = resolveSnapshotWorldPositionClaim(candidateP2, p2.id);
        assert(claimP1.outcome === SnapshotWorldPositionClaimOutcome.CLAIMED && claimP1.position.x === 10 && claimP1.position.z === 10, 'L4. P1 -> correct claim (10, _, 10).');
        assert(claimP2.outcome === SnapshotWorldPositionClaimOutcome.CLAIMED && claimP2.position.x === 50 && claimP2.position.z === 50, 'L5. P2 -> correct claim (50, _, 50).');
        const crossCheck = resolveSnapshotWorldPositionClaim(candidateP1, p2.id);
        assert(crossCheck.outcome === SnapshotWorldPositionClaimOutcome.MISMATCHED,
            'L6. P1\'s own candidate, checked against P2\'s identity, is MISMATCHED — despite the identical contentHash, no shortcut ever lets one candidate\'s claim silently satisfy the other Publication.');

        // Full real Open/Fork/Explore/Comment continuity for each,
        // independently, through the observer-local surface.
        const documentIdOf = { [p1.id]: p1.documentId, [p2.id]: p2.documentId };
        const openPublicationCommand = commandSpy();
        const ctx = buildCanvasInstance({ registry, observerLocalEncounterRegistry: store, materialSources: { local: new LocalWorldEncounterMaterialSource(storageProvider) }, materialVerifier: new MapVerifier({ [p1.id]: true, [p2.id]: true }), openPublicationCommand });
        mountCanvas(ctx);
        const projectedObserverLocal = projectedObserverLocalEncountersOf(ctx);
        assert(projectedObserverLocal.length === 2 && new Set(projectedObserverLocal.map((m) => m.publicationId)).size === 2,
            'L7. Two independent markers render — never merged into one despite the shared contentHash.');

        ctx.selectObserverLocalEncounter({ publicationId: p1.id, contentHash: candidateP1.contentHash });
        await flushMicrotasks();
        ctx.openObserverLocalEncounterPublication();
        ctx.selectObserverLocalEncounter({ publicationId: p2.id, contentHash: candidateP2.contentHash });
        await flushMicrotasks();
        ctx.openObserverLocalEncounterPublication();
        assert(openPublicationCommand.calls.length === 2, 'L8. Open was invoked once per Publication.');
        assert(openPublicationCommand.calls[0][0].id === p1.id && openPublicationCommand.calls[0][0].documentId === documentIdOf[p1.id], 'L9. First Open call resolved to P1, with P1\'s own real documentId.');
        assert(openPublicationCommand.calls[1][0].id === p2.id && openPublicationCommand.calls[1][0].documentId === documentIdOf[p2.id], 'L10. Second Open call resolved to P2, with P2\'s own real documentId — never P1\'s, despite the identical contentHash both share.');

        // Section D's own gap, confirmed to be per-identity, not a global
        // corruption: registering ONLY P1 afterward (the Wanderer places
        // just P1) never touches P2's own rendering or actions.
        const placementInfoP1 = { placementId: `claim:${candidateP1.contentHash}:${p1.id}`, publicationId: p1.id, position: claimP1.position };
        const materializationP1 = { outcome: StoreSnapshotContentOutcome.STORED, contentHash: candidateP1.contentHash, contentReference: new ContentReference({ hash: candidateP1.contentHash, uri: candidateP1.locator, storage: candidateP1.storage }) };
        const placementP1 = resolveSnapshotWorldPlacement(materializationP1, placementInfoP1);
        registerMaterializedSnapshotWorldSource(registry, placementP1, p1);
        const primaryAfter = projectedPublicationsOf(ctx);
        const observerLocalAfter = projectedObserverLocalEncountersOf(ctx);
        assert(primaryAfter.length === 1 && primaryAfter[0].objectId === p1.id, 'L11. Only P1 reaches the primary channel.');
        assert(observerLocalAfter.length === 1 && observerLocalAfter[0].publicationId === p2.id,
            'L12. (AMENDED BY 0.9.570) P1\'s own observer-local marker is now suppressed by the shipped fix; P2\'s own marker, position, and actions remain completely untouched by P1\'s own promotion — the suppression is confirmed local to the specific identity it affects, never a cross-Publication corruption, and never triggered by the shared contentHash the two happen to share.');

        console.log('✓ L — FLAGSHIP: two Publications sharing one contentHash, each with its own real, distributed claim, discovered together, remain fully independent across discovery, claim resolution, observer-local rendering, inspection, and every continuation action (Open/Fork/Explore) — no content-hash shortcut ever collapses P1 and P2\'s spatial or object identity, and (AMENDED BY 0.9.570) P1\'s own convergence-driven suppression never touches P2\'s own still-rendering marker.');
    }

    // =======================================================================
    // Section M — product classification and verdict.
    // =======================================================================
    {
        const classifications = [
            ['Three spatial concepts (PlacementRecord, claimedPosition, observer-local encounter) sharing a type, store, or merge point', 'ALREADY_CORRECT — Section A: verified distinct by type and by live cross-reference.'],
            ['Coincidental coordinate equality between a claim and an existing placement implying interchangeability', 'ALREADY_CORRECT — Section B: equality is never treated as identity; divergence never corrupts the authoritative side.'],
            ['A distributed claim reaching an observer-local encounter\'s own presentation', 'ALREADY_CORRECT — Section C: two real, independent consumption paths for the same candidate, connected for the first time; neither ever substitutes for the other.'],
            ['A Publication rendering simultaneously as a primary, permanent, fully-actionable marker AND a stale "Discovered here" observer-local marker, within one session, once an authoritative/registered placement becomes known after the observer-local encounter was already recorded', '(AMENDED BY 0.9.570) FIXED — Section D (FLAGSHIP): was real, reproducible via two independent, already-shipped production paths sharing one registry; 0.9.570 added a presentational filter to WorldEncounterCanvas.js\'s own projectedObserverLocalEncounters that suppresses the stale marker once its publicationId also has an authoritative publicationRows entry.'],
            ['Spatial coincidence collapsing distinct Publication identity (same position, or shared contentHash)', 'ALREADY_CORRECT — Sections E, F, L: verified with real, independently-addressable, independently-actionable Publications throughout.'],
            ['Discovery-to-work continuity for a purely observer-local-originated Publication', 'ALREADY_CORRECT — Section G: the complete Walk->Discover->Inspect->Open/Fork/Explore/Comment->walk away->rediscover journey holds, built on real 0.9.552-0.9.559 machinery.'],
            ['Vocabulary implying ownership, authenticity, or authority for either a distributed claim or an observer-local encounter', 'ALREADY_CORRECT — Section H: both are already explicit and disclaiming, verified verbatim against live source.'],
            ['The primary channel\'s own "Source" label distinguishing an authoritative PlacementRecord-backed registration from a person-registered distributed-claim-backed one', 'PRODUCT_GAP, narrow and secondary — Section H: both present identically as "Source: Snapshot." Worth a future, small presentation fix; not this milestone\'s own flagship.'],
            ['Lifecycle survival across leave/rediscover/reload/new session for each of the three mechanisms', 'ALREADY_CORRECT — Section I: derived from real behavior; matches the hypothesis this milestone\'s own brief proposed.'],
            ['Failure isolation across five independent boundaries (claim, placement, discovery, verification, encounter-position)', 'ALREADY_CORRECT — Section J: each fails independently, propagating its own real outcome, never corrupting a sibling.'],
            ['Consumer action safety (Open/Fork/Explore/Comment) under Section D\'s own double-presentation condition, and authority-leak risk from that condition', 'ALREADY_CORRECT — Section K: every action on either marker resolves correctly, and no action anywhere creates or mutates a PlacementRecord — Section D\'s own gap is presentation-only, confirmed.'],
            ['Content-hash shortcuts collapsing two Publications\' spatial identity under a full adversarial two-Publication, shared-contentHash, dual-real-claim scenario', 'ALREADY_CORRECT — Section L: fully verified, including Section D\'s own gap applied to only one of the two, confirmed non-corrupting to the sibling.']
        ];
        for (const [topic, verdict] of classifications) {
            assert(typeof topic === 'string' && typeof verdict === 'string', 'M-sanity.');
        }
        console.log('\nCLASSIFICATION TABLE:');
        for (const [topic, verdict] of classifications) {
            console.log(`  - ${topic}\n      -> ${verdict}`);
        }

        console.log('\n✅ All Decentralized Publication Spatial Continuity Product Reassessment tests passed.');
        console.log('CLASSIFICATION (AMENDED BY 0.9.570): ALREADY_CORRECT, throughout — the overall three-mechanism spatial model is coherent, safe, and well-vocabularied everywhere this milestone checked, INCLUDING the one concrete, reproducible defect this milestone originally found (Section D): a Publication discovered while UNPLACED, then later placed/registered within the SAME session by any real means, used to render BOTH as a permanent marker and a stale, factually-outdated "Discovered here" ghost simultaneously; 0.9.569 located the fix and 0.9.570 shipped it, in ui/components/WorldEncounterCanvas.js\'s own `projectedObserverLocalEncounters` — a presentational filter, requiring no new PlacementRecord, no automatic promotion, and no change to either mechanism\'s own authority boundary. "Use Claimed Position" as a new placement mechanism remains NOT recommended — see this file\'s own header.');
    }
}

run().catch((error) => {
    console.error('DecentralizedPublicationSpatialContinuityProductReassessment.test.js FAILED:', error);
    process.exitCode = 1;
});
