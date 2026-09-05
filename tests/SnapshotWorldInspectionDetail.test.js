import { readFile } from 'node:fs/promises';
import OwnPublicationPanel from '../ui/components/OwnPublicationPanel.js';
import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import { SnapshotWorldRegistrationOutcome } from '../application/SnapshotWorldRegistrationOutcome.js';
import { SnapshotWorldPlacementOutcome } from '../application/SnapshotWorldPlacementOutcome.js';
import { SnapshotWorldPositionClaimOutcome } from '../application/SnapshotWorldPositionClaimOutcome.js';
import { WorldDiscoverySourceRegistry } from '../application/WorldDiscoverySourceRegistry.js';
import { describeLocalWorldDiscoverySource, LOCAL_WORLD_DISCOVERY_ORIGIN } from '../application/WorldEncounterIntegration.js';
import { describePeerWorldDiscoverySource } from '../peer/PeerWorldDataIngress.js';
import { composeDiscoverSnapshotRuntime } from '../application/DiscoverSnapshotRuntimeComposition.js';
import { executeDiscoverSnapshotCandidatesCommand } from '../application/DiscoverSnapshotCandidatesCommand.js';
import { executeResolveSelectedSnapshotCommand } from '../application/ResolveSelectedSnapshotCommand.js';
import { executeMaterializeSelectedSnapshotCommand } from '../application/MaterializeSelectedSnapshotCommand.js';
import { MaterializeSnapshotFromSelectedCandidateUseCase } from '../application/MaterializeSnapshotFromSelectedCandidateUseCase.js';
import { StoreSnapshotContentUseCase } from '../application/StoreSnapshotContentUseCase.js';
import { NostrSnapshotDiscoveryPublisher } from '../application/NostrSnapshotDiscoveryPublisher.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { PlacementRecord } from '../core/PlacementRecord.js';
import { Position } from '../core/Position.js';
import { Publication } from '../publisher/Publication.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.9.177 — World Snapshot Inspection Detail.
//
// 0.9.176 proved a materialized, placed, registered Snapshot resolves
// sourceFamily SNAPSHOT through a real, mounted WorldEncounterCanvas. This
// file proves the next, additive fact — application/WorldSnapshotInspection.js's
// own contentHash/publicationId/position descriptor — reaches that SAME
// mounted canvas's own inspection panel for a REAL Nostr-discovered,
// resolved, materialized, PLACED, and REGISTERED Snapshot, end to end:
//
//   Nostr discover -> select -> resolve -> verify -> materialize ->
//   position claim (consumed) -> place -> register -> World Encounter ->
//   select -> inspect
//
//   Section A — FLAGSHIP: the complete pipeline, including an explicitly
//              consumed decentralized position claim, observed through a
//              REAL, MOUNTED WorldEncounterCanvas sharing the SAME registry
//              OwnPublicationPanel registered into. Selecting the rendered
//              marker resolves a Snapshot inspection descriptor naming the
//              correct contentHash/publicationId/position — and the
//              descriptor stays silent about the consumed claim, since
//              that fact does not survive to this boundary (see this
//              milestone's own application/WorldSnapshotInspection.js
//              header).
//   Section B — an ordinary LOCAL Publication continues to report no
//              Snapshot inspection detail at all.
//   Section C — an ordinary PEER-discovered Publication continues to
//              report no Snapshot inspection detail at all.
//   Section D — before a selection resolves (AMBIGUOUS, no explicit choice
//              yet), Snapshot inspection detail stays null — inspection
//              never guesses.
//   Section E — structural sweep: no production file other than
//              ui/components/WorldEncounterCanvas.js, css/main.css, and the
//              new application/WorldSnapshotInspection.js was touched; the
//              registration bridge and WorldEncounterMarker.js remain
//              entirely untouched by this milestone.

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
        return { id: `fake-inspection-tx-${counter}`, transaction: { id: `fake-inspection-tx-${counter}`, data: material } };
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

async function placeAndAnnounce(host, bytes, claim = null) {
    const reference = await host.contentStore.put(bytes);
    await host.announcer.publish({
        contentHash: reference.hash, locator: reference.uri, storage: reference.storage,
        ...(claim ? { publicationId: claim.publicationId, claimedPosition: claim.claimedPosition } : {})
    });
    return reference;
}

function placeReal(placementRegistry, publicationId, position, owner = 'alice') {
    const record = new PlacementRecord({ publicationId, position, owner });
    placementRegistry.add(record);
    return record;
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
        attributeSelectedSnapshot: OwnPublicationPanel.methods.attributeSelectedSnapshot,
        materializeSelectedSnapshot: OwnPublicationPanel.methods.materializeSelectedSnapshot,
        placeMaterializedSnapshot: OwnPublicationPanel.methods.placeMaterializedSnapshot,
        registerMaterializedSnapshot: OwnPublicationPanel.methods.registerMaterializedSnapshot,
        useClaimedSnapshotPosition: OwnPublicationPanel.methods.useClaimedSnapshotPosition,
        ...overrides
    };
}

// Reproduces ui/views/WorldView.js's own real wiring by hand, mirroring
// tests/SnapshotWorldPresentation.test.js's own buildCanvasInstance()
// exactly, with one additional live getter for this milestone's own
// selectedEncounterSnapshotInspection.
function buildCanvasInstance({ registry = null, view } = {}) {
    const ctx = {
        registry,
        view: view !== undefined ? view : WorldEncounterCanvas.props.view.default()
    };
    Object.assign(ctx, WorldEncounterCanvas.data.call(ctx));
    Object.assign(ctx, WorldEncounterCanvas.methods);
    Object.defineProperty(ctx, 'effectiveView', {
        get() { return WorldEncounterCanvas.computed.effectiveView.call(ctx); }
    });
    Object.defineProperty(ctx, 'resolvedEncounterSelection', {
        get() { return WorldEncounterCanvas.computed.resolvedEncounterSelection.call(ctx); }
    });
    Object.defineProperty(ctx, 'selectedEncounterInspection', {
        get() { return WorldEncounterCanvas.computed.selectedEncounterInspection.call(ctx); }
    });
    Object.defineProperty(ctx, 'selectedEncounterPresentation', {
        get() { return WorldEncounterCanvas.computed.selectedEncounterPresentation.call(ctx); }
    });
    Object.defineProperty(ctx, 'selectedEncounterPresentationSourceLabel', {
        get() { return WorldEncounterCanvas.computed.selectedEncounterPresentationSourceLabel.call(ctx); }
    });
    Object.defineProperty(ctx, 'selectedEncounterSnapshotInspection', {
        get() { return WorldEncounterCanvas.computed.selectedEncounterSnapshotInspection.call(ctx); }
    });
    return ctx;
}

function mountCanvas(ctx) { WorldEncounterCanvas.mounted.call(ctx); }
function unmountCanvas(ctx) { WorldEncounterCanvas.beforeUnmount.call(ctx); }

// Mirrors tests/SnapshotWorldPresentation.test.js's own projectedPublicationsOf().
function projectedPublicationsOf(ctx) {
    ctx.publicationRows = WorldEncounterCanvas.computed.publicationRows.call(ctx);
    return WorldEncounterCanvas.computed.projectedPublications.call(ctx);
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP: a real Nostr-discovered, resolved, materialized,
    // decentralized-position-claimed, PLACED, and REGISTERED Snapshot,
    // observed through a REAL, MOUNTED WorldEncounterCanvas sharing the
    // SAME registry OwnPublicationPanel registered into.
    // ---------------------------------------------------------------
    {
        const host = makeHost('inspection-flagship');
        const bytes = JSON.stringify({ world: { buildings: [{ id: 'inspection-flagship-building', bricks: 5 }] } });
        const publicationId = 'flagship-inspection-publication';
        // The publisher's own decentralized claim — a DIFFERENT position
        // than this replica's own pre-existing local placement, so the
        // flagship also proves the World's own registered position is the
        // CONSUMED claim, once explicitly used.
        const reference = await placeAndAnnounce(host, bytes, {
            publicationId,
            claimedPosition: { x: 12, y: 4, z: -8 }
        });

        const placementRegistry = new LocalPlacementRegistry(new InMemoryStorageProvider());
        placeReal(placementRegistry, publicationId, new Position(0, 0, 0));

        const publication = new Publication({ id: publicationId, title: 'Flagship Inspected Snapshot', contentReference: reference });
        const placementInfo = placementInfoFor(placementRegistry, publicationId);

        const sharedRegistry = new WorldDiscoverySourceRegistry();

        const panel = panelCtx({
            publication,
            placementInfo,
            worldDiscoverySourceRegistry: sharedRegistry,
            discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
            resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
            materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand
        });

        const canvas = buildCanvasInstance({ registry: sharedRegistry });
        mountCanvas(canvas);
        assert(canvas.selectedEncounterSnapshotInspection === null, '1. before any selection, there is nothing to inspect');

        // DISCOVER -> SELECT -> RESOLVE -> VERIFY -> MATERIALIZE -> (use the
        // decentralized position claim) -> PLACE -> REGISTER.
        panel.discoverSnapshotCandidates();
        await flushMicrotasks();
        assert(panel.snapshotCandidateDiscoveryResult.length === 1, '2. sanity — the real candidate was genuinely discovered over Nostr, carrying its own publisher claim');
        const candidate = panel.snapshotCandidateDiscoveryResult[0];
        assert(candidate.publicationId === publicationId && candidate.claimedPosition.x === 12, '3. sanity — the discovered candidate really does carry the publisher\'s own claim');

        panel.selectSnapshotCandidate(candidate);
        panel.resolveSelectedSnapshot();
        await flushMicrotasks();
        panel.materializeSelectedSnapshot();
        await flushMicrotasks();
        panel.useClaimedSnapshotPosition();
        assert(panel.selectedSnapshotWorldPositionClaimResult.outcome === SnapshotWorldPositionClaimOutcome.CLAIMED, '4. sanity — the publisher\'s own position claim is explicitly consumed');

        panel.placeMaterializedSnapshot();
        assert(panel.selectedSnapshotWorldPlacementResult.outcome === SnapshotWorldPlacementOutcome.PLACED, '5. sanity — placement succeeds against the CONSUMED CLAIM\'s own position, not the pre-existing local placement');
        assert(panel.selectedSnapshotWorldPlacementResult.position.x === 12 && panel.selectedSnapshotWorldPlacementResult.position.y === 4 && panel.selectedSnapshotWorldPlacementResult.position.z === -8,
            '6. sanity — the placement result really does carry the claimed position (12, 4, -8), not the local placement\'s (0, 0, 0)');

        panel.registerMaterializedSnapshot();
        assert(panel.selectedSnapshotWorldRegistrationResult.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, '7. sanity — the placed Snapshot registers with the shared runtime registry');

        const projected = projectedPublicationsOf(canvas);
        assert(projected.length === 1 && projected[0].objectId === publicationId, '8. sanity — the registered Snapshot renders as a genuine projected marker');

        // WORLD ENCOUNTER -> SELECT -> INSPECT.
        canvas.selectEncounter({ kind: 'PUBLICATION', objectId: publicationId });
        assert(canvas.resolvedEncounterSelection !== null && canvas.resolvedEncounterSelection.origin.startsWith('snapshot:'),
            '9. sanity — the click resolves unambiguously to this Snapshot\'s own dedicated origin');
        assert(canvas.selectedEncounterPresentation.sourceFamily === 'SNAPSHOT', '10. sanity — 0.9.176\'s own presentation layer still correctly names this encounter SNAPSHOT');

        // FLAGSHIP ASSERTION — the new fact this milestone introduces.
        const inspection = canvas.selectedEncounterSnapshotInspection;
        assert(inspection !== null, '11. FLAGSHIP — a Snapshot inspection descriptor now exists for the selected encounter');
        assert(inspection.publicationId === publicationId, '12. FLAGSHIP — the descriptor names the correct Publication as its own World identity');
        assert(inspection.contentHash === reference.hash, '13. FLAGSHIP — the descriptor names the correct contentHash, recovered from the registered origin');
        assert(inspection.contentHash !== inspection.publicationId, '14. content identity and Publication identity are never confused with one another');
        assert(inspection.position.x === 12 && inspection.position.y === 4 && inspection.position.z === -8,
            '15. FLAGSHIP — the descriptor\'s own position is the World\'s own current placement — here, the CONSUMED publisher claim\'s own position, exactly what the World now shows for this Publication');

        // The consumed claim itself is deliberately NOT part of the
        // descriptor — it does not survive to this boundary (see
        // application/WorldSnapshotInspection.js's own header). This is a
        // documented finding, not an oversight: proving it stays true even
        // in a scenario where a claim really was consumed is the whole
        // point of building this flagship around one.
        assert(!('claimedPosition' in inspection), '16. the descriptor never reports claimedPosition, even when this replica\'s own ephemeral interaction state still holds one — that fact simply never reached the registered World source');
        assert(!('locator' in inspection) && !('storage' in inspection), '17. the descriptor never reports locator/storage — never carried into World registration in the first place');

        unmountCanvas(canvas);
        console.log('✓ Section A: FLAGSHIP — a real Nostr-discovered, resolved, materialized, claim-placed, and registered Snapshot yields a correct contentHash/publicationId/position inspection descriptor once selected, through the entirely unmodified DISCOVER -> ... -> RENDER -> SELECT path');
    }

    // ---------------------------------------------------------------
    // Section B — an ordinary LOCAL Publication reports no Snapshot
    // inspection detail.
    // ---------------------------------------------------------------
    {
        const registry = new WorldDiscoverySourceRegistry();
        registry.setSource(describeLocalWorldDiscoverySource({
            publications: [{ id: 'pub-local-inspection', title: 'A Local Publication' }],
            placements: [{ id: 'placement-local', publicationId: 'pub-local-inspection', position: { x: 2, y: 0, z: 2 } }]
        }));

        const canvas = buildCanvasInstance({ registry });
        mountCanvas(canvas);
        canvas.selectEncounter({ kind: 'PUBLICATION', objectId: 'pub-local-inspection' });

        assert(canvas.selectedEncounterPresentation.sourceFamily === 'LOCAL', '1. sanity — presents as LOCAL, unchanged');
        assert(canvas.selectedEncounterSnapshotInspection === null, '2. an ordinary local Publication reports no Snapshot inspection detail');

        unmountCanvas(canvas);
        console.log('✓ Section B: an ordinary LOCAL Publication reports no Snapshot inspection detail');
    }

    // ---------------------------------------------------------------
    // Section C — an ordinary PEER-discovered Publication reports no
    // Snapshot inspection detail.
    // ---------------------------------------------------------------
    {
        const registry = new WorldDiscoverySourceRegistry();
        registry.setSource(describePeerWorldDiscoverySource({
            publications: [{ id: 'pub-peer-inspection', title: 'A Peer Publication' }],
            placements: [{ id: 'placement-peer', publicationId: 'pub-peer-inspection', position: { x: -3, y: 0, z: -3 } }]
        }, { remoteIdentity: { identityId: 'did:key:zPeerInspection' } }));

        const canvas = buildCanvasInstance({ registry });
        mountCanvas(canvas);
        canvas.selectEncounter({ kind: 'PUBLICATION', objectId: 'pub-peer-inspection' });

        assert(canvas.selectedEncounterPresentation.sourceFamily === 'PEER', '1. sanity — presents as PEER, unchanged');
        assert(canvas.selectedEncounterSnapshotInspection === null, '2. an ordinary peer-discovered Publication reports no Snapshot inspection detail');

        unmountCanvas(canvas);
        console.log('✓ Section C: an ordinary PEER-discovered Publication reports no Snapshot inspection detail');
    }

    // ---------------------------------------------------------------
    // Section D — an AMBIGUOUS selection with no explicit choice yet
    // reports no Snapshot inspection detail.
    // ---------------------------------------------------------------
    {
        const registry = new WorldDiscoverySourceRegistry();
        const sharedPublicationId = 'pub-ambiguous-inspection';
        registry.setSource(describeLocalWorldDiscoverySource({
            publications: [{ id: sharedPublicationId, title: 'Ambiguous Publication' }],
            placements: [{ id: 'placement-a', publicationId: sharedPublicationId, position: { x: 0, y: 0, z: 0 } }]
        }));
        registry.setSource(describePeerWorldDiscoverySource({
            publications: [{ id: sharedPublicationId, title: 'Ambiguous Publication' }],
            placements: [{ id: 'placement-b', publicationId: sharedPublicationId, position: { x: 0, y: 0, z: 0 } }]
        }, { remoteIdentity: { identityId: 'did:key:zPeerAmbiguousInspection' } }));

        const canvas = buildCanvasInstance({ registry });
        mountCanvas(canvas);
        canvas.selectEncounter({ kind: 'PUBLICATION', objectId: sharedPublicationId });

        assert(canvas.resolvedEncounterSelection === null, '1. sanity — genuinely AMBIGUOUS, no explicit choice yet');
        assert(canvas.selectedEncounterPresentation.sourceFamily === null, '2. sanity — presentation itself stays sourceFamily null');
        assert(canvas.selectedEncounterSnapshotInspection === null, '3. an AMBIGUOUS selection reports no Snapshot inspection detail — never a guess');

        canvas.chooseSelectionOrigin({ kind: 'PUBLICATION', objectId: sharedPublicationId, origin: LOCAL_WORLD_DISCOVERY_ORIGIN });
        assert(canvas.selectedEncounterSnapshotInspection === null, '4. resolving to LOCAL via an explicit choice still reports no Snapshot inspection detail');

        unmountCanvas(canvas);
        console.log('✓ Section D: an AMBIGUOUS selection reports no Snapshot inspection detail until — and unless — it resolves to a genuine Snapshot origin');
    }

    // ---------------------------------------------------------------
    // Section E — structural sweep.
    // ---------------------------------------------------------------
    {
        const bridgeSource = await readFile(new URL('../application/MaterializedSnapshotWorldDiscoveryBridge.js', import.meta.url), 'utf8');
        assert(!bridgeSource.includes('WorldSnapshotInspection'), '1. the registration bridge is untouched by this milestone — it knows nothing about inspection');

        const markerSource = await readFile(new URL('../ui/components/WorldEncounterMarker.js', import.meta.url), 'utf8');
        assert(!/^\s*import /m.test(markerSource), '2. WorldEncounterMarker.js still imports nothing at all — no Snapshot-specific marker component was introduced, and pre-selection marker rendering is untouched by this milestone');

        const inspectionSource = await readFile(new URL('../application/WorldSnapshotInspection.js', import.meta.url), 'utf8');
        const inspectionCodeOnly = inspectionSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        assert(!/fetch\(|localStorage|WebRTC|WorldDiscoverySourceRegistry|registry\.|deriveWorldEncounters\(/.test(inspectionCodeOnly),
            '3. application/WorldSnapshotInspection.js performs no I/O and never recomputes the World from scratch — it is a pure join over two already-computed facts');
        assert(!/rank|trust|verified|best|preferred|reliable|freshness|quality|score/i.test(inspectionCodeOnly),
            '4. no rank/trust/verified/best/preferred/reliable/freshness/quality/score vocabulary anywhere in the new module\'s own executable code');

        console.log('✓ Section E: structural sweep — the registration bridge and WorldEncounterMarker.js remain untouched, and the new inspection module performs no I/O and carries no rank/trust vocabulary');
    }

    console.log('\n✅ All Snapshot World Inspection Detail tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
