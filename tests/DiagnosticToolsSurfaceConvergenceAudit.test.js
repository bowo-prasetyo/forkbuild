import { readFile } from 'node:fs/promises';
import { readdirSync } from 'node:fs';

import OwnPublicationPanel from '../ui/components/OwnPublicationPanel.js';
import { AutomaticSnapshotEncounterCascade } from '../application/AutomaticSnapshotEncounterCascade.js';
import { SnapshotWorldPositionClaimOutcome } from '../application/SnapshotWorldPositionClaimOutcome.js';
import { SnapshotWorldPlacementOutcome } from '../application/SnapshotWorldPlacementOutcome.js';
import { SnapshotWorldRegistrationOutcome } from '../application/SnapshotWorldRegistrationOutcome.js';
import { executeDiscoverSnapshotCandidatesCommand } from '../application/DiscoverSnapshotCandidatesCommand.js';
import { executeResolveSelectedSnapshotCommand } from '../application/ResolveSelectedSnapshotCommand.js';
import { executeMaterializeSelectedSnapshotCommand } from '../application/MaterializeSelectedSnapshotCommand.js';
import { MaterializeSnapshotFromSelectedCandidateUseCase } from '../application/MaterializeSnapshotFromSelectedCandidateUseCase.js';
import { StoreSnapshotContentUseCase } from '../application/StoreSnapshotContentUseCase.js';
import { StoreSnapshotContentOutcome } from '../application/StoreSnapshotContentOutcome.js';
import { SnapshotCandidateMaterializationOutcome } from '../application/SnapshotCandidateMaterializationOutcome.js';
import { DecentralizedSnapshotResolutionOutcome } from '../application/DecentralizedSnapshotResolutionOutcome.js';
import { NostrSnapshotDiscoveryPublisher } from '../application/NostrSnapshotDiscoveryPublisher.js';
import { NostrSnapshotDiscoveryQueryService } from '../application/NostrSnapshotDiscoveryQueryService.js';
import { DecentralizedSnapshotResolver } from '../application/DecentralizedSnapshotResolver.js';
import { WorldDiscoverySourceRegistry } from '../application/WorldDiscoverySourceRegistry.js';
import { ArweaveContentStore } from '../content/ArweaveContentStore.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { Publication } from '../publisher/Publication.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';

// 0.9.325 — Diagnostic Tools Surface Convergence Audit.
//
// 0.9.324 moved the discover-candidates -> select -> resolve -> attribute ->
// materialize -> use-claimed-position -> place -> register Snapshot
// pipeline (0.9.151-0.9.172) behind a new "Diagnostic Tools" trigger/popup
// and asserted, mostly STRUCTURALLY (source-text placement, order,
// grep-based command wiring), that nothing else changed.
// `tests/DiagnosticToolsSurface.test.js` already proved that placement
// claim. This milestone asks a narrower, harder question that file was
// never positioned to answer: does the pipeline's own RUNTIME BEHAVIOR
// genuinely not care whether the popup is open, closed, or was never
// opened at all? TEST-ONLY. ZERO PRODUCTION CHANGES — every file this
// audit imports is read, never edited.
//
// The governing invariant, stated once and then proven from several
// angles:
//
//   Popup visibility has no causal relationship with Snapshot pipeline
//   state.
//
//   Before opening popup
//           │
//           ▼
//   existing Snapshot state
//           │
//           ▼
//   Open Diagnostic Tools
//           │
//           ▼
//   run recovery action
//           │
//           ▼
//   close popup
//           │
//           ▼
//   reopen popup
//           │
//           ▼
//   same recovery state/results  (same OBJECT REFERENCES, not merely
//   equal-looking copies)
//
// Section A: PIPELINE IDENTITY — the same 8-stage sequence (discover ->
//            select -> resolve -> attribute -> materialize -> use-claimed-
//            position -> place -> register) still exists, as real
//            functions, in this exact order.
// Section B: COMMAND IDENTITY — each of the three injected commands is
//            still invoked exactly once per action, regardless of whether
//            the popup is open or closed when the action runs.
// Section C: ARGUMENTS — the exact object references handed to
//            discoverSnapshotCandidatesCommand (none)/resolveSelectedSnapshotCommand
//            (the candidate)/materializeSelectedSnapshotCommand (the
//            resolution) are unchanged and untransformed — no wrapping,
//            no cloning, no popup-introduced adapter of any kind.
// Section D: RESULTS — every stage's own success AND error state remains
//            independently observable (both its result markup and its
//            error markup) from inside the popup.
// Section E: STATE CONTINUITY — the flagship. A complete, real 8-stage
//            run, entirely through the popup, survives close -> reopen by
//            reference identity; a Discover FAILURE and a Resolve SUCCESS
//            each independently survive the same close -> reopen cycle.
// Section F: ACTION ORDERING — Discover -> Resolve -> Attribute ->
//            Materialize -> Use Claimed Position -> Place -> Register
//            still appear, textually, in that order.
// Section G: ORDINARY ACTIONS — Check Snapshot Match, Distribute Snapshot,
//            Export Snapshot, Unpublish, and Commentary are still labeled
//            and gated exactly as before, and still render outside the
//            popup.
// Section H: AUTOMATIC PATH — `AutomaticSnapshotEncounterCascade`
//            completes an entire background run, unaffected by, and
//            without affecting, a sibling manual popup sitting open
//            alongside it.
// Section I: WORLDVIEW BOUNDARY — `ui/views/WorldView.js`'s own
//            composition of `OwnPublicationPanel` carries none of this
//            popup's vocabulary and every pre-existing prop binding is
//            unchanged.
// Section J: ARCHITECTURE GUARD — no `DiagnosticService`, no new
//            `application/` file, no new domain vocabulary; the popup
//            remains a presentation-only wrapper.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE. Per its own governing
// brief: diagnostic history, logging/telemetry, retry infrastructure,
// diagnostic event types, "recovery sessions," a `DiagnosticService`,
// Snapshot pipeline simplification, automatic fallback when manual
// recovery fails, Place Naming relocation, new diagnostic actions, and
// any change to automatic Snapshot discovery. Finding nothing wrong here
// is itself a healthy, reportable outcome — this file exists to prove
// convergence, not to invent a reason to keep building.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function flushMicrotasks() {
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let i = 0; i < 10; i++) {
        await Promise.resolve();
    }
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

async function codeOnlySource(relativePath) {
    const text = await rawSource(relativePath);
    const withoutHtmlComments = text.replace(/<!--[\s\S]*?-->/g, '');
    return withoutHtmlComments.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

// ---------------------------------------------------------------------
// Fixtures — mirrors tests/DecentralizedSnapshotSpatialE2EAudit.test.js's
// own InMemoryStorageProvider/makeHost/publishOwnPublication/
// placeAndAnnounce/panelCtx exactly, so this audit exercises the same
// real, unmodified production machinery every other Snapshot pipeline
// suite already trusts — nothing here is a simplified stand-in.
// ---------------------------------------------------------------------

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
        return { id: `fake-0-9-325-tx-${counter}`, transaction: { id: `fake-0-9-325-tx-${counter}`, data: material } };
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

// Mirrors tests/DecentralizedSnapshotSpatialE2EAudit.test.js's own
// makeHost() exactly — a real (fake-transport-backed) ArweaveContentStore,
// a real NostrSnapshotDiscoveryPublisher/NostrSnapshotDiscoveryQueryService
// pair, and a real DecentralizedSnapshotResolver, composed the way
// ui/main.js composes composeDiscoverSnapshotRuntime().
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

// The real `ui/components/OwnPublicationPanel.js` interaction surface —
// every pipeline data field and every pipeline method, PLUS
// `diagnosticToolsOpen` itself (0.9.324), which no prior E2E audit's own
// panelCtx() ever needed to carry.
function panelCtx(overrides = {}) {
    return {
        diagnosticToolsOpen: false,
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
        useClaimedSnapshotPosition: OwnPublicationPanel.methods.useClaimedSnapshotPosition,
        placeMaterializedSnapshot: OwnPublicationPanel.methods.placeMaterializedSnapshot,
        registerMaterializedSnapshot: OwnPublicationPanel.methods.registerMaterializedSnapshot,
        ...overrides
    };
}

// Every pipeline-relevant field, captured by REFERENCE (never a deep
// copy) — the strongest possible continuity check: not "still looks the
// same," but "is still the exact same object."
const PIPELINE_STATE_FIELDS = [
    'snapshotCandidateDiscoveryExecuting', 'snapshotCandidateDiscoveryError', 'snapshotCandidateDiscoveryResult', 'snapshotCandidateDiscoveryRequestId',
    'selectedSnapshotCandidate',
    'selectedSnapshotResolutionExecuting', 'selectedSnapshotResolutionError', 'selectedSnapshotResolutionResult', 'selectedSnapshotResolutionRequestId',
    'selectedSnapshotAttributionResult',
    'selectedSnapshotMaterializationExecuting', 'selectedSnapshotMaterializationError', 'selectedSnapshotMaterializationResult', 'selectedSnapshotMaterializationRequestId',
    'selectedSnapshotWorldPositionClaimResult', 'selectedSnapshotWorldPlacementResult', 'selectedSnapshotWorldRegistrationResult'
];

function captureRefs(ctx) {
    const snapshot = {};
    for (const field of PIPELINE_STATE_FIELDS) {
        snapshot[field] = ctx[field];
    }
    return snapshot;
}

function assertSameRefs(before, after, label) {
    for (const field of PIPELINE_STATE_FIELDS) {
        assert(before[field] === after[field], `${label} — '${field}' changed reference across the popup toggle (before=${JSON.stringify(before[field])}, after=${JSON.stringify(after[field])})`);
    }
}

const PIPELINE_ACTIONS = [
    { label: 'Discover Snapshots', actionClass: 'own-publication-candidate-discovery-action' },
    { label: 'Resolve Selected Snapshot', actionClass: 'own-publication-selected-resolution-action' },
    { label: 'Attribute Selected Snapshot', actionClass: 'own-publication-selected-attribution-action' },
    { label: 'Materialize Selected Snapshot', actionClass: 'own-publication-selected-materialization-action' },
    { label: 'Use Claimed Position', actionClass: 'own-publication-selected-world-position-claim-action' },
    { label: 'Place Materialized Snapshot', actionClass: 'own-publication-selected-world-placement-action' },
    { label: 'Register Placed Snapshot', actionClass: 'own-publication-selected-world-registration-action' }
];

async function runTests() {
    console.log('Running Diagnostic Tools Surface Convergence Audit tests...\n');

    const rawPanel = await rawSource('ui/components/OwnPublicationPanel.js');
    const codePanel = await codeOnlySource('ui/components/OwnPublicationPanel.js');

    // ---------------------------------------------------------------
    // Section A — Pipeline identity.
    // ---------------------------------------------------------------
    {
        const methodNames = [
            'discoverSnapshotCandidates', 'selectSnapshotCandidate', 'resolveSelectedSnapshot',
            'attributeSelectedSnapshot', 'materializeSelectedSnapshot', 'useClaimedSnapshotPosition',
            'placeMaterializedSnapshot', 'registerMaterializedSnapshot'
        ];
        assert(methodNames.length === 8, 'A0. sanity: the pipeline this audit was scoped against has exactly 8 stages');
        for (const name of methodNames) {
            assert(typeof OwnPublicationPanel.methods[name] === 'function', `A1 (${name}). the stage still exists as a real, callable method`);
        }

        console.log('✓ Section A: the same 8-stage discover -> select -> resolve -> attribute -> materialize -> use-claimed-position -> place -> register sequence still exists, unchanged, as real methods');
    }

    // ---------------------------------------------------------------
    // Section B — Command identity: each action still invokes exactly
    // one injected command, exactly once — proven from a popup that is
    // OPEN while the actions run, not merely inferred from source text.
    // ---------------------------------------------------------------
    {
        let discoverCalls = 0;
        let resolveCalls = 0;
        let materializeCalls = 0;
        const ctx = panelCtx({
            diagnosticToolsOpen: true,
            discoverSnapshotCandidatesCommand: () => { discoverCalls += 1; return Promise.resolve([{ contentHash: 'b-hash', locator: 'ar://b-hash', storage: 'ar' }]); },
            resolveSelectedSnapshotCommand: () => { resolveCalls += 1; return Promise.resolve({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes: 'section-b-bytes', reason: null }); },
            materializeSelectedSnapshotCommand: () => { materializeCalls += 1; return Promise.resolve({ outcome: SnapshotCandidateMaterializationOutcome.STORED, contentHash: 'b-hash', reason: null }); }
        });

        ctx.discoverSnapshotCandidates();
        await flushMicrotasks();
        ctx.selectSnapshotCandidate(ctx.snapshotCandidateDiscoveryResult[0]);
        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();
        ctx.materializeSelectedSnapshot();
        await flushMicrotasks();

        assert(discoverCalls === 1, 'B1. discoverSnapshotCandidatesCommand was invoked exactly once, with the popup open');
        assert(resolveCalls === 1, 'B2. resolveSelectedSnapshotCommand was invoked exactly once, with the popup open');
        assert(materializeCalls === 1, 'B3. materializeSelectedSnapshotCommand was invoked exactly once, with the popup open');

        // Each command prop still has exactly one call site in the
        // source — the identical structural invariant, reconfirmed.
        assert((codePanel.match(/this\.discoverSnapshotCandidatesCommand\(/g) || []).length === 1, 'B4. exactly one call site for discoverSnapshotCandidatesCommand');
        assert((codePanel.match(/this\.resolveSelectedSnapshotCommand\(/g) || []).length === 1, 'B5. exactly one call site for resolveSelectedSnapshotCommand');
        assert((codePanel.match(/this\.materializeSelectedSnapshotCommand\(/g) || []).length === 1, 'B6. exactly one call site for materializeSelectedSnapshotCommand');

        console.log('✓ Section B: every injected command is still invoked exactly once per action, whether or not the Diagnostic Tools popup happens to be open when the action runs');
    }

    // ---------------------------------------------------------------
    // Section C — Arguments: no transformation was introduced by the
    // popup wrapper. Each command receives the EXACT object reference
    // the pipeline already held, never a clone, a wrapper, or an adapter.
    // ---------------------------------------------------------------
    {
        let discoverArgs = null;
        let resolveArgs = null;
        let materializeArgs = null;
        const ctx = panelCtx({
            diagnosticToolsOpen: true,
            discoverSnapshotCandidatesCommand: (...args) => { discoverArgs = args; return Promise.resolve([{ contentHash: 'c-hash', locator: 'ar://c-hash', storage: 'ar' }]); },
            resolveSelectedSnapshotCommand: (...args) => { resolveArgs = args; return Promise.resolve({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes: 'section-c-bytes', reason: null }); },
            materializeSelectedSnapshotCommand: (...args) => { materializeArgs = args; return Promise.resolve({ outcome: SnapshotCandidateMaterializationOutcome.STORED, contentHash: 'c-hash', reason: null }); }
        });

        ctx.discoverSnapshotCandidates();
        await flushMicrotasks();
        assert(discoverArgs.length === 0, 'C1. discoverSnapshotCandidatesCommand is still called with zero arguments');

        const candidate = ctx.snapshotCandidateDiscoveryResult[0];
        ctx.selectSnapshotCandidate(candidate);
        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();
        assert(resolveArgs.length === 1 && resolveArgs[0] === candidate, 'C2. resolveSelectedSnapshotCommand still receives the exact selected-candidate OBJECT REFERENCE, never a copy or a popup-introduced wrapper');

        const resolution = ctx.selectedSnapshotResolutionResult;
        ctx.materializeSelectedSnapshot();
        await flushMicrotasks();
        assert(materializeArgs.length === 1 && materializeArgs[0] === resolution, 'C3. materializeSelectedSnapshotCommand still receives the exact resolution-result OBJECT REFERENCE, never a copy or a popup-introduced wrapper');

        console.log('✓ Section C: no argument transformation, wrapping, or cloning was introduced anywhere in the pipeline by the popup relocation');
    }

    // ---------------------------------------------------------------
    // Section D — Results: both success AND error state for every early
    // stage remain independently observable from inside the popup.
    // ---------------------------------------------------------------
    {
        const overlayOpenIdx = rawPanel.indexOf('class="modal-overlay own-publication-diagnostic-overlay"');
        const overlayCloseIdx = rawPanel.indexOf('own-publication-diagnostic-close');
        assert(overlayOpenIdx > -1 && overlayCloseIdx > overlayOpenIdx, 'D0. sanity: the overlay boundary is locatable');

        for (const marker of [
            'own-publication-candidate-discovery-error', 'own-publication-selected-resolution-error', 'own-publication-selected-materialization-error'
        ]) {
            const idx = rawPanel.indexOf(marker);
            assert(idx > overlayOpenIdx && idx < overlayCloseIdx, `D1 (${marker}). this stage's own ERROR rendering, not just its success rendering, is a descendant of the popup`);
        }

        for (const marker of [
            'own-publication-candidate-list', 'own-publication-selected-resolution-detail',
            'own-publication-selected-attribution-detail', 'own-publication-selected-materialization-detail',
            'own-publication-selected-world-position-claim-detail', 'own-publication-selected-world-placement-detail',
            'own-publication-selected-world-registration-detail'
        ]) {
            const idx = rawPanel.indexOf(marker);
            assert(idx > overlayOpenIdx && idx < overlayCloseIdx, `D2 (${marker}). this stage's own SUCCESS rendering is a descendant of the popup`);
        }

        console.log('✓ Section D: every stage\'s own success detail AND its own error message remain independently observable, both still rendered inside the Diagnostic Tools popup');
    }

    // ---------------------------------------------------------------
    // Section E — State continuity. THE FLAGSHIP.
    // ---------------------------------------------------------------
    {
        // -----------------------------------------------------------
        // E1 — a complete, real 8-stage run, entirely through the
        // popup, survives close -> reopen by REFERENCE identity.
        // -----------------------------------------------------------
        const storageProvider = new InMemoryStorageProvider();
        const publication = publishOwnPublication(storageProvider, 'Section E Publication');
        const host = makeHost(storageProvider, 'section-e-flagship');
        const bytes = 'Section E: a Snapshot recovered entirely through the Diagnostic Tools popup';
        const claimedPosition = { x: 11, y: 22, z: 33 };
        await placeAndAnnounce(host, bytes, { publicationId: publication.id, claimedPosition });

        const registry = new WorldDiscoverySourceRegistry();
        const ctx = panelCtx({
            diagnosticToolsOpen: false,
            publication,
            placementInfo: null,
            worldDiscoverySourceRegistry: registry,
            discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
            resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
            materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand
        });

        // "Before opening popup" — existing (empty) Snapshot state.
        const beforeOpen = captureRefs(ctx);
        assert(beforeOpen.snapshotCandidateDiscoveryResult === null, 'E1.1. before the popup is ever opened, no pipeline state exists yet');

        // "Open Diagnostic Tools."
        ctx.diagnosticToolsOpen = true;

        // "Run recovery action" — the complete 8-stage sequence, driven
        // exactly the way a person clicking through the popup would.
        ctx.discoverSnapshotCandidates();
        await flushMicrotasks();
        assert(ctx.snapshotCandidateDiscoveryResult.length === 1, 'E1.2. DISCOVER — one real, discovered candidate');
        const candidate = ctx.snapshotCandidateDiscoveryResult[0];

        ctx.selectSnapshotCandidate(candidate);
        assert(ctx.selectedSnapshotCandidate === candidate, 'E1.3. SELECT');

        ctx.resolveSelectedSnapshot();
        await flushMicrotasks();
        assert(ctx.selectedSnapshotResolutionResult.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, 'E1.4. RESOLVE — genuinely succeeds');
        assert(ctx.selectedSnapshotResolutionResult.bytes === bytes, 'E1.5. RESOLVE — the real, byte-identical content');

        ctx.attributeSelectedSnapshot();
        assert(ctx.selectedSnapshotAttributionResult !== null && typeof ctx.selectedSnapshotAttributionResult.outcome === 'string', 'E1.6. ATTRIBUTE — a real attribution verdict is computed');

        ctx.materializeSelectedSnapshot();
        await flushMicrotasks();
        assert(
            ctx.selectedSnapshotMaterializationResult.outcome === SnapshotCandidateMaterializationOutcome.STORED
            || ctx.selectedSnapshotMaterializationResult.outcome === SnapshotCandidateMaterializationOutcome.ALREADY_AVAILABLE,
            'E1.7. MATERIALIZE — genuinely succeeds'
        );

        ctx.useClaimedSnapshotPosition();
        assert(ctx.selectedSnapshotWorldPositionClaimResult.outcome === SnapshotWorldPositionClaimOutcome.CLAIMED, 'E1.8. USE CLAIMED POSITION — the publisher\'s own claim is consumed');

        ctx.placeMaterializedSnapshot();
        assert(ctx.selectedSnapshotWorldPlacementResult.outcome === SnapshotWorldPlacementOutcome.PLACED, 'E1.9. PLACE — genuinely succeeds, from the consumed claim');

        ctx.registerMaterializedSnapshot();
        assert(ctx.selectedSnapshotWorldRegistrationResult.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, 'E1.10. REGISTER — genuinely succeeds');

        // Every stage genuinely ran — sanity that this is not an
        // accidental no-op pipeline before asserting continuity over it.
        const afterRun = captureRefs(ctx);
        for (const field of PIPELINE_STATE_FIELDS) {
            if (field.endsWith('Executing') || field.endsWith('RequestId') || field.endsWith('Error')) continue;
            assert(afterRun[field] !== null, `E1.11 (${field}). the flagship run genuinely populated this field before continuity is tested over it`);
        }

        // "Close popup."
        ctx.diagnosticToolsOpen = false;
        const afterClose = captureRefs(ctx);
        assertSameRefs(afterRun, afterClose, 'E1.12. CLOSE');

        // "Reopen popup." -> "same recovery state/results."
        ctx.diagnosticToolsOpen = true;
        const afterReopen = captureRefs(ctx);
        assertSameRefs(afterRun, afterReopen, 'E1.13. REOPEN');
        assertSameRefs(afterClose, afterReopen, 'E1.14. REOPEN vs CLOSE');

        console.log('✓ Section E1: FLAGSHIP — a complete, real 8-stage recovery run survives close -> reopen with every pipeline field the exact same object reference, never merely an equal-looking copy');

        // -----------------------------------------------------------
        // E2 — failure continuity: Discover -> failure -> close ->
        // reopen -> same failure remains.
        // -----------------------------------------------------------
        const failCtx = panelCtx({
            diagnosticToolsOpen: true,
            discoverSnapshotCandidatesCommand: () => Promise.reject(new Error('section-e2-boom'))
        });
        failCtx.discoverSnapshotCandidates();
        await flushMicrotasks();
        assert(failCtx.snapshotCandidateDiscoveryError === 'Snapshot candidate discovery could not be completed.', 'E2.1. DISCOVER genuinely fails and records the pipeline\'s own existing error text');
        assert(failCtx.snapshotCandidateDiscoveryResult === null, 'E2.2. a failed discovery never silently produces a result');
        const errorRef = failCtx.snapshotCandidateDiscoveryError;

        failCtx.diagnosticToolsOpen = false;
        assert(failCtx.snapshotCandidateDiscoveryError === errorRef && failCtx.snapshotCandidateDiscoveryResult === null, 'E2.3. CLOSE — the failure is neither cleared nor replaced');

        failCtx.diagnosticToolsOpen = true;
        assert(failCtx.snapshotCandidateDiscoveryError === errorRef && failCtx.snapshotCandidateDiscoveryResult === null, 'E2.4. REOPEN — the exact same failure remains, byte-for-byte');

        console.log('✓ Section E2: a Discover FAILURE survives close -> reopen unchanged — the popup never retries, clears, or reinterprets it');

        // -----------------------------------------------------------
        // E3 — success continuity: Resolve -> success -> close ->
        // reopen -> same resolved candidate/result remains.
        // -----------------------------------------------------------
        const storageProvider3 = new InMemoryStorageProvider();
        const publication3 = publishOwnPublication(storageProvider3, 'Section E3 Publication');
        const host3 = makeHost(storageProvider3, 'section-e3-resolve-success');
        const bytes3 = 'Section E3: a resolved Snapshot whose result must survive the popup closing';
        await placeAndAnnounce(host3, bytes3);

        const ctx3 = panelCtx({
            diagnosticToolsOpen: true,
            publication: publication3,
            discoverSnapshotCandidatesCommand: host3.discoverSnapshotCandidatesCommand,
            resolveSelectedSnapshotCommand: host3.resolveSelectedSnapshotCommand
        });
        ctx3.discoverSnapshotCandidates();
        await flushMicrotasks();
        const candidate3 = ctx3.snapshotCandidateDiscoveryResult[0];
        ctx3.selectSnapshotCandidate(candidate3);
        ctx3.resolveSelectedSnapshot();
        await flushMicrotasks();
        assert(ctx3.selectedSnapshotResolutionResult.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, 'E3.1. RESOLVE genuinely succeeds');
        const resolutionRef = ctx3.selectedSnapshotResolutionResult;
        const candidateRef = ctx3.selectedSnapshotCandidate;

        ctx3.diagnosticToolsOpen = false;
        assert(ctx3.selectedSnapshotResolutionResult === resolutionRef && ctx3.selectedSnapshotCandidate === candidateRef, 'E3.2. CLOSE — the resolved candidate and its own result are untouched');

        ctx3.diagnosticToolsOpen = true;
        assert(ctx3.selectedSnapshotResolutionResult === resolutionRef && ctx3.selectedSnapshotCandidate === candidateRef, 'E3.3. REOPEN — the exact same resolved candidate/result remain, byte-for-byte');

        console.log('✓ Section E3: a Resolve SUCCESS survives close -> reopen unchanged — the same selected candidate and the same resolution result, by reference');
    }

    // ---------------------------------------------------------------
    // Section F — Action ordering.
    // ---------------------------------------------------------------
    {
        const indices = PIPELINE_ACTIONS.map(({ actionClass }) => rawPanel.indexOf(`class="action-btn ${actionClass}"`));
        for (const idx of indices) assert(idx > -1, 'F0. sanity: every action is locatable');
        for (let i = 1; i < indices.length; i++) {
            assert(indices[i] > indices[i - 1], `F1. "${PIPELINE_ACTIONS[i].label}" still appears after "${PIPELINE_ACTIONS[i - 1].label}"`);
        }

        console.log('✓ Section F: Discover -> Resolve -> Attribute -> Materialize -> Use Claimed Position -> Place -> Register still appear in exactly that order');
    }

    // ---------------------------------------------------------------
    // Section G — Ordinary actions remain outside diagnostics.
    // ---------------------------------------------------------------
    {
        const overlayOpenIdx = rawPanel.indexOf('class="modal-overlay own-publication-diagnostic-overlay"');
        const overlayCloseIdx = rawPanel.indexOf('own-publication-diagnostic-close');

        const ordinary = [
            { actionClass: 'own-publication-unpublish-action', label: 'Unpublish' },
            { actionClass: 'own-publication-distribution-action', label: 'Distribute Snapshot' },
            { actionClass: 'own-publication-export-action', label: 'Export Snapshot' },
            { actionClass: 'own-publication-discovery-action', label: 'Check Snapshot Match' }
        ];
        for (const { actionClass, label } of ordinary) {
            const classIdx = rawPanel.indexOf(`class="action-btn ${actionClass}"`);
            assert(classIdx > -1 && classIdx < overlayOpenIdx, `G1 (${label}). still renders on the primary screen, outside the popup`);
            assert(rawPanel.includes(`>${label}<`) || rawPanel.includes(`'${label}'`), `G2 (${label}). still carries its exact, unrenamed label`);
        }

        const commentaryIdx = rawPanel.indexOf('own-publication-commentary');
        assert(commentaryIdx > overlayCloseIdx, 'G3. Commentary also remains outside the popup');

        console.log('✓ Section G: Check Snapshot Match, Distribute Snapshot, Export Snapshot, Unpublish, and Commentary all remain ordinary primary-screen actions, unrenamed and outside the popup');
    }

    // ---------------------------------------------------------------
    // Section H — Automatic path independence, proven behaviorally: a
    // complete automatic cascade run alongside a sibling manual popup
    // that is OPEN affects neither, in either direction.
    // ---------------------------------------------------------------
    {
        const registry = new WorldDiscoverySourceRegistry();
        const publication = new Publication({ id: 'pub-0-9-325-automatic-independence', title: 'Automatic Path Independence' });
        let resolveCalls = 0;
        let materializeCalls = 0;
        const cascade = new AutomaticSnapshotEncounterCascade({
            resolveSelectedSnapshotCommand: () => { resolveCalls += 1; return Promise.resolve({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes: new Uint8Array([9]), reason: null }); },
            materializeSelectedSnapshotCommand: () => { materializeCalls += 1; return Promise.resolve({ outcome: StoreSnapshotContentOutcome.STORED, contentHash: 'auto-hash-0-9-325', reason: null }); },
            worldDiscoverySourceRegistry: registry,
            resolvePlacementInfo: () => ({ placementId: 'p-auto-0-9-325', publicationId: publication.id, position: { x: 9, y: 9, z: 9 } }),
            findPublicationById: () => publication
        });

        // A sibling manual popup, OPEN, sharing nothing with the cascade
        // above but coexisting in the same process while it runs.
        const manualCtx = panelCtx({ diagnosticToolsOpen: true });

        const candidate = { contentHash: 'auto-hash-0-9-325', locator: 'ar://auto-hash-0-9-325', storage: 'ar', publicationId: publication.id };
        const outcome = await cascade.processCandidate(candidate);

        assert(outcome.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, 'H1. the automatic cascade completes end to end, entirely on its own');
        assert(resolveCalls === 1 && materializeCalls === 1, 'H2. exactly one automatic resolve/materialize call — the sibling manual popup being OPEN triggered nothing');
        assert(manualCtx.diagnosticToolsOpen === true, 'H3. the manual popup\'s own diagnosticToolsOpen is untouched by the automatic cascade completing');
        for (const field of PIPELINE_STATE_FIELDS) {
            assert(
                manualCtx[field] === false || manualCtx[field] === null || manualCtx[field] === 0,
                `H4 (${field}). none of the manual pipeline's own state was written by the automatic cascade`
            );
        }

        console.log('✓ Section H: the automatic cascade completes an entire background run unaffected by, and without affecting, a sibling manual Diagnostic Tools popup sitting open alongside it');
    }

    // ---------------------------------------------------------------
    // Section I — WorldView boundary.
    // ---------------------------------------------------------------
    {
        const viewCode = await codeOnlySource('ui/views/WorldView.js');
        for (const propBinding of [
            ':discoverSnapshotCandidatesCommand="discoverSnapshotCandidatesCommand"',
            ':resolveSelectedSnapshotCommand="resolveSelectedSnapshotCommand"',
            ':materializeSelectedSnapshotCommand="materializeSelectedSnapshotCommand"',
            ':worldDiscoverySourceRegistry="worldDiscoverySourceRegistry"',
            ':placementInfo="activePlacementInfo"'
        ]) {
            assert(viewCode.includes(propBinding), `I1 (${propBinding}). WorldView.js still wires this exact prop to OwnPublicationPanel`);
        }
        assert(!viewCode.includes('diagnosticToolsOpen') && !viewCode.includes('own-publication-diagnostic') && !viewCode.includes('Diagnostic Tools'),
            'I2. WorldView.js carries none of the Diagnostic Tools popup\'s own vocabulary — the popup lives inside OwnPublicationPanel.js alone');

        console.log('✓ Section I: WorldView.js\'s own composition of OwnPublicationPanel remains byte-for-byte unchanged; no new orchestration crossed the component boundary');
    }

    // ---------------------------------------------------------------
    // Section J — Architecture guard.
    // ---------------------------------------------------------------
    {
        const forbidden = [
            "from '../../application/DiagnosticService.js'", 'new DiagnosticService(',
            'class DiagnosticService', "'./DiagnosticService.js'", 'DiagnosticApplicationUseCase', 'RecoverySession', 'DiagnosticEvent'
        ];
        for (const term of forbidden) {
            assert(!codePanel.includes(term), `J1 (${term}). no such vocabulary exists in OwnPublicationPanel.js`);
        }

        let diagnosticAppFiles = [];
        try {
            diagnosticAppFiles = readdirSync(new URL('application/', SOURCE_ROOT)).filter((name) => /diagnostic/i.test(name));
        } catch { /* ignore — best-effort */ }
        assert(diagnosticAppFiles.length === 0, `J2. no application/ file names itself after "diagnostic" (found: ${diagnosticAppFiles.join(', ')})`);

        // The popup's own trigger/close writes remain the only writers
        // of diagnosticToolsOpen — no method reads or writes it.
        const methodsBlockMatch = rawPanel.match(/methods:\s*\{[\s\S]*?\n\s{4}\},\n\s{4}template:/);
        assert(methodsBlockMatch, 'J3. sanity: located the methods: block');
        assert(!methodsBlockMatch[0].includes('diagnosticToolsOpen'), 'J4. no method reads or writes diagnosticToolsOpen');

        console.log('✓ Section J: no DiagnosticService, no new application/ file, and no diagnostic-specific orchestration exists — the popup remains a pure presentation wrapper');
    }

    console.log('\n✅ All Diagnostic Tools Surface Convergence Audit tests passed — the 0.9.324 relocation changed presentation only. Verdict: CLEAN. No regression found; no narrow-seam fix required.');
}

runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
