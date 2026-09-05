import { readFile } from 'node:fs/promises';
import OwnPublicationPanel from '../ui/components/OwnPublicationPanel.js';
import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import { registerMaterializedSnapshotWorldSource } from '../application/MaterializedSnapshotWorldDiscoveryBridge.js';
import { SnapshotWorldRegistrationOutcome } from '../application/SnapshotWorldRegistrationOutcome.js';
import { SnapshotWorldPlacementOutcome } from '../application/SnapshotWorldPlacementOutcome.js';
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
import { WorldEncounterPresentationSourceFamily } from '../application/WorldEncounterPresentation.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { PlacementRecord } from '../core/PlacementRecord.js';
import { Position } from '../core/Position.js';
import { Publication } from '../publisher/Publication.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.9.176 — World Snapshot Presentation.
//
// 0.9.161 through 0.9.175 proved the complete DISCOVER -> ... -> REGISTER ->
// WORLD ENCOUNTER -> SELECT -> LOAD MATERIAL -> RENDER path structurally
// sound. Nothing in that chain ever let a Wanderer tell, once selected,
// that a particular encounter came from a materialized Snapshot rather
// than an ordinary local or peer-contributed Publication. This file proves
// the one new, additive fact `application/WorldEncounterPresentation.js`
// introduces — `sourceFamily` — reaches a REAL, mounted
// `WorldEncounterCanvas`'s own inspection panel for a REAL, Nostr-
// discovered, resolved, materialized, PLACED, and REGISTERED Snapshot, and
// that an ordinary LOCAL or PEER Publication still presents exactly as it
// always has.
//
//   Section A — FLAGSHIP: the complete pipeline (discover -> select ->
//              resolve -> verify -> materialize -> place -> register),
//              observed through a REAL, MOUNTED WorldEncounterCanvas
//              sharing the SAME registry OwnPublicationPanel registered
//              into (reproducing ui/views/WorldView.js's own real wiring
//              by hand, exactly like tests/SnapshotWorldRendering.test.js's
//              own Section B) — selecting the rendered marker resolves a
//              sourceFamily of SNAPSHOT.
//   Section B — an ordinary LOCAL Publication presents with sourceFamily
//              LOCAL — the pre-existing baseline, unchanged.
//   Section C — an ordinary PEER-discovered Publication presents with
//              sourceFamily PEER — the pre-existing baseline, unchanged.
//   Section D — before a selection resolves (AMBIGUOUS, no explicit choice
//              yet), sourceFamily stays null/"Unresolved" — presentation
//              never guesses.
//   Section E — structural sweep: no production file other than
//              ui/components/WorldEncounterCanvas.js, css/main.css, and the
//              new application/WorldEncounterPresentation.js was touched;
//              the registration bridge and WorldEncounterMarker.js remain
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
        return { id: `fake-presentation-tx-${counter}`, transaction: { id: `fake-presentation-tx-${counter}`, data: material } };
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

// Reproduces ui/views/WorldView.js's own real wiring by hand, mirroring
// tests/SnapshotWorldRendering.test.js's own buildCanvasInstance() exactly,
// with live getters added for every computed this milestone's own
// presentation chain depends on — the SAME "Object.defineProperty(...,
// { get() {...} })" discipline tests/WorldSourceSelectionConsistencyAudit.test.js
// already established for `resolvedEncounterSelection`/`resolvedLead`.
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
    return ctx;
}

function mountCanvas(ctx) { WorldEncounterCanvas.mounted.call(ctx); }
function unmountCanvas(ctx) { WorldEncounterCanvas.beforeUnmount.call(ctx); }

// Mirrors tests/SnapshotWorldRendering.test.js's own projectedPublicationsOf()
// exactly — resolves every computed a rendered marker actually depends on,
// in dependency order, since `publicationRows` is not one of the live
// getters buildCanvasInstance() defines above.
function projectedPublicationsOf(ctx) {
    ctx.publicationRows = WorldEncounterCanvas.computed.publicationRows.call(ctx);
    return WorldEncounterCanvas.computed.projectedPublications.call(ctx);
}

function placedResult(contentHash, publicationId, position, placementId = 'placement-x') {
    return { outcome: SnapshotWorldPlacementOutcome.PLACED, contentHash, publicationId, placementId, position, reason: null };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP: a real Nostr-discovered, resolved, materialized,
    // PLACED, and REGISTERED Snapshot, observed through a REAL, MOUNTED
    // WorldEncounterCanvas sharing the SAME registry OwnPublicationPanel
    // registered into. Selecting the rendered marker resolves a
    // sourceFamily of SNAPSHOT.
    // ---------------------------------------------------------------
    {
        const host = makeHost('presentation-flagship');
        const bytes = JSON.stringify({ world: { buildings: [{ id: 'presentation-flagship-building', bricks: 3 }] } });
        const reference = await placeAndAnnounce(host, bytes);

        const placementRegistry = new LocalPlacementRegistry(new InMemoryStorageProvider());
        const publicationId = 'flagship-presentation-publication';
        placeReal(placementRegistry, publicationId, new Position(11, 0, -7));

        const publication = new Publication({ id: publicationId, title: 'Flagship Presented Snapshot', contentReference: reference });
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
        assert(canvas.selectedEncounterPresentation === null, '1. before any selection, there is nothing to present');

        // DISCOVER -> SELECT -> RESOLVE -> VERIFY -> MATERIALIZE -> PLACE ->
        // REGISTER — the exact, unmodified pipeline 0.9.150-0.9.163 built.
        panel.discoverSnapshotCandidates();
        await flushMicrotasks();
        assert(panel.snapshotCandidateDiscoveryResult.length === 1, '2. sanity — the real candidate was genuinely discovered over Nostr');
        const candidate = panel.snapshotCandidateDiscoveryResult[0];

        panel.selectSnapshotCandidate(candidate);
        panel.resolveSelectedSnapshot();
        await flushMicrotasks();
        panel.materializeSelectedSnapshot();
        await flushMicrotasks();
        panel.placeMaterializedSnapshot();
        assert(panel.selectedSnapshotWorldPlacementResult.outcome === SnapshotWorldPlacementOutcome.PLACED, '3. sanity — the materialized candidate places against the real WorldPlacement position');

        panel.registerMaterializedSnapshot();
        assert(panel.selectedSnapshotWorldRegistrationResult.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, '4. sanity — the placed Snapshot registers with the shared runtime registry');

        // The already-mounted canvas already observes the registered
        // Snapshot as an ordinary encounter — 0.9.161's own finding,
        // unmodified.
        const projected = projectedPublicationsOf(canvas);
        assert(projected.length === 1 && projected[0].objectId === publicationId, '5. sanity — the registered Snapshot renders as a genuine projected marker, exactly as 0.9.161 already established');

        // WORLD ENCOUNTER -> SELECT: the Wanderer clicks the marker, through
        // the entirely unmodified selectEncounter() entry point.
        canvas.selectEncounter({ kind: 'PUBLICATION', objectId: publicationId });

        assert(canvas.resolvedEncounterSelection !== null, "6. the click resolves unambiguously (this Publication is registered under exactly one origin) — resolvedEncounterSelection is not null");
        assert(canvas.resolvedEncounterSelection.origin.startsWith('snapshot:'), '7. sanity — the resolved origin is genuinely this Snapshot\'s own dedicated origin');

        assert(canvas.selectedEncounterInspection !== null, '8. sanity — the existing, unmodified WorldEncounterInspection join still finds the selected Publication');
        assert(canvas.selectedEncounterInspection.title === 'Flagship Presented Snapshot', "9. sanity — the Publication's own title is still inspectable, unaffected by this milestone");

        // FLAGSHIP ASSERTION — the one new fact this milestone introduces.
        assert(canvas.selectedEncounterPresentation !== null, '10. FLAGSHIP — a presentation descriptor now exists for the selected encounter');
        assert(canvas.selectedEncounterPresentation.sourceFamily === WorldEncounterPresentationSourceFamily.SNAPSHOT,
            '11. FLAGSHIP — the Snapshot is visibly identifiable: sourceFamily is exactly SNAPSHOT, never LOCAL or PEER');
        assert(canvas.selectedEncounterPresentation.objectId === publicationId, '12. the presentation descriptor names the correct Publication');
        assert(canvas.selectedEncounterPresentation.title === 'Flagship Presented Snapshot', "13. the Publication's own title reaches the presentation descriptor unmodified");
        assert(canvas.selectedEncounterPresentationSourceLabel === 'Snapshot', '14. the friendly UI-facing label reads exactly "Snapshot"');

        // Identity/position stay exactly what 0.9.161's own Section F
        // already proved — this milestone changes nothing about them.
        assert(canvas.selectedEncounterPresentation.objectId !== reference.hash, '15. the presentation descriptor\'s own objectId is never the Snapshot\'s own contentHash');

        unmountCanvas(canvas);
        console.log('✓ Section A: FLAGSHIP — a real Nostr-discovered, resolved, materialized, placed, and registered Snapshot is visibly identified with sourceFamily SNAPSHOT once selected, through the entirely unmodified DISCOVER -> ... -> RENDER -> SELECT path');
    }

    // ---------------------------------------------------------------
    // Section B — an ordinary LOCAL Publication still presents exactly as
    // before: sourceFamily LOCAL.
    // ---------------------------------------------------------------
    {
        const registry = new WorldDiscoverySourceRegistry();
        registry.setSource(describeLocalWorldDiscoverySource({
            publications: [{ id: 'pub-local-presentation', title: 'A Local Publication' }],
            placements: [{ id: 'placement-local', publicationId: 'pub-local-presentation', position: { x: 2, y: 0, z: 2 } }]
        }));

        const canvas = buildCanvasInstance({ registry });
        mountCanvas(canvas);
        canvas.selectEncounter({ kind: 'PUBLICATION', objectId: 'pub-local-presentation' });

        assert(canvas.resolvedEncounterSelection.origin === LOCAL_WORLD_DISCOVERY_ORIGIN, '1. sanity — resolves to the LOCAL origin');
        assert(canvas.selectedEncounterPresentation.sourceFamily === WorldEncounterPresentationSourceFamily.LOCAL, '2. an ordinary local Publication presents with sourceFamily LOCAL, unchanged by this milestone');
        assert(canvas.selectedEncounterPresentationSourceLabel === 'Local', '3. the friendly label reads exactly "Local"');

        unmountCanvas(canvas);
        console.log('✓ Section B: an ordinary LOCAL Publication presents exactly as before — sourceFamily LOCAL');
    }

    // ---------------------------------------------------------------
    // Section C — an ordinary PEER-discovered Publication still presents
    // exactly as before: sourceFamily PEER.
    // ---------------------------------------------------------------
    {
        const registry = new WorldDiscoverySourceRegistry();
        registry.setSource(describePeerWorldDiscoverySource({
            publications: [{ id: 'pub-peer-presentation', title: 'A Peer Publication' }],
            placements: [{ id: 'placement-peer', publicationId: 'pub-peer-presentation', position: { x: -3, y: 0, z: -3 } }]
        }, { remoteIdentity: { identityId: 'did:key:zPeerPresentation' } }));

        const canvas = buildCanvasInstance({ registry });
        mountCanvas(canvas);
        canvas.selectEncounter({ kind: 'PUBLICATION', objectId: 'pub-peer-presentation' });

        assert(canvas.resolvedEncounterSelection.origin === 'peer:did:key:zPeerPresentation', '1. sanity — resolves to the peer\'s own origin');
        assert(canvas.selectedEncounterPresentation.sourceFamily === WorldEncounterPresentationSourceFamily.PEER, '2. an ordinary peer-discovered Publication presents with sourceFamily PEER, unchanged by this milestone');
        assert(canvas.selectedEncounterPresentationSourceLabel === 'Peer', '3. the friendly label reads exactly "Peer"');

        unmountCanvas(canvas);
        console.log('✓ Section C: an ordinary PEER-discovered Publication presents exactly as before — sourceFamily PEER');
    }

    // ---------------------------------------------------------------
    // Section D — an AMBIGUOUS selection with no explicit choice yet
    // presents with sourceFamily null / label "Unresolved" — presentation
    // never guesses among several valid candidates.
    // ---------------------------------------------------------------
    {
        const registry = new WorldDiscoverySourceRegistry();
        const sharedPublicationId = 'pub-ambiguous-presentation';
        registry.setSource(describeLocalWorldDiscoverySource({
            publications: [{ id: sharedPublicationId, title: 'Ambiguous Publication' }],
            placements: [{ id: 'placement-a', publicationId: sharedPublicationId, position: { x: 0, y: 0, z: 0 } }]
        }));
        registry.setSource(describePeerWorldDiscoverySource({
            publications: [{ id: sharedPublicationId, title: 'Ambiguous Publication' }],
            placements: [{ id: 'placement-b', publicationId: sharedPublicationId, position: { x: 0, y: 0, z: 0 } }]
        }, { remoteIdentity: { identityId: 'did:key:zPeerAmbiguous' } }));

        const canvas = buildCanvasInstance({ registry });
        mountCanvas(canvas);
        canvas.selectEncounter({ kind: 'PUBLICATION', objectId: sharedPublicationId });

        assert(canvas.resolvedEncounterSelection === null, '1. sanity — two sources offering the same Publication is genuinely AMBIGUOUS, with no explicit choice yet');
        assert(canvas.selectedEncounterInspection !== null, '2. sanity — the encounter is still inspectable (title/position), independent of source ambiguity');
        assert(canvas.selectedEncounterPresentation !== null, '3. a presentation descriptor still exists — identity/position are still known');
        assert(canvas.selectedEncounterPresentation.sourceFamily === null, '4. sourceFamily is null while ambiguous — this milestone never guesses a source among several valid candidates');
        assert(canvas.selectedEncounterPresentationSourceLabel === 'Unresolved', '5. the friendly label reads "Unresolved", never a fabricated family');

        // Making the explicit choice a Wanderer already has resolves it.
        canvas.chooseSelectionOrigin({ kind: 'PUBLICATION', objectId: sharedPublicationId, origin: LOCAL_WORLD_DISCOVERY_ORIGIN });
        assert(canvas.selectedEncounterPresentation.sourceFamily === WorldEncounterPresentationSourceFamily.LOCAL, '6. an explicit choice among ambiguous candidates resolves sourceFamily exactly like any other resolved selection');

        unmountCanvas(canvas);
        console.log('✓ Section D: an AMBIGUOUS selection presents with sourceFamily null / "Unresolved" until an explicit choice is made — never a guess');
    }

    // ---------------------------------------------------------------
    // Section E — structural sweep.
    // ---------------------------------------------------------------
    {
        const bridgeSource = await readFile(new URL('../application/MaterializedSnapshotWorldDiscoveryBridge.js', import.meta.url), 'utf8');
        assert(!bridgeSource.includes('WorldEncounterPresentation'), '1. the registration bridge is untouched by this milestone — it knows nothing about presentation');

        const markerSource = await readFile(new URL('../ui/components/WorldEncounterMarker.js', import.meta.url), 'utf8');
        assert(!/^\s*import /m.test(markerSource), '2. WorldEncounterMarker.js still imports nothing at all — no Snapshot-specific marker component was introduced, and pre-selection marker rendering is untouched by this milestone');

        const presentationSource = await readFile(new URL('../application/WorldEncounterPresentation.js', import.meta.url), 'utf8');
        const presentationCodeOnly = presentationSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        assert(!/fetch\(|localStorage|WebRTC|WorldDiscoverySourceRegistry|deriveWorldEncounters\(/.test(presentationCodeOnly),
            '3. application/WorldEncounterPresentation.js performs no I/O and never recomputes the World from scratch — it is a pure join over two already-computed facts');
        assert(!/rank|trust|verified|best|preferred|reliable|freshness|quality|score/i.test(presentationCodeOnly),
            '4. no rank/trust/verified/best/preferred/reliable/freshness/quality/score vocabulary anywhere in the new module\'s own executable code');

        console.log('✓ Section E: structural sweep — the registration bridge and WorldEncounterMarker.js remain untouched, and the new presentation module performs no I/O and carries no rank/trust vocabulary');
    }

    console.log('\n✅ All World Snapshot Presentation tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
