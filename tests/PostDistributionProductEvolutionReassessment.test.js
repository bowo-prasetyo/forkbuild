import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

import { composePublicationDistributionCommand } from '../application/PublicationDistributionCommandComposition.js';
import { executePublicationDistributionCommand } from '../application/PublicationDistributionCommand.js';
import { PublicationDistributionLifecycleMemoryStore } from '../application/PublicationDistributionLifecycleStore.js';
import { PublicationDistributionState, describePublicationDistributionLifecycle } from '../application/PublicationDistributionLifecycle.js';
import { IpfsRemotePublicationCoordinator } from '../application/IpfsRemotePublicationCoordinator.js';
import { PublishDocumentUseCase } from '../application/PublishDocumentUseCase.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { Signature } from '../core/Signature.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import OwnPublicationPanel from '../ui/components/OwnPublicationPanel.js';
import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import { WorldEncounterMaterialLoadStatus } from '../application/WorldEncounterMaterialLoading.js';

// 0.9.379 — Post-Distribution Product Evolution Reassessment.
//
// **Type: test-only, whole-arc product audit. No production changes.**
// 0.9.349 asked "is there still a genuine gap in Post-Publish Distribution"
// once the one existing announcement action became reachable without World
// Encounter navigation, and answered STABLE_STOP. Since then, 0.9.375-0.9.378
// gave the SAME capability a THIRD entry point (EditorView, reachable the
// instant local publish succeeds) and proved, freshly and structurally, that
// the third entry point converges on the identical single command rather
// than growing a parallel architecture. This milestone asks the question
// that arc's own closing note deliberately left for "a fresh whole-product
// reassessment to raise on its own evidence":
//
//   Now that post-publish distribution is reachable from the natural
//   publication workflow on all three surfaces, what — if anything — should
//   the product do next?
//
// Every section below is evidence gathered fresh against real, unmodified
// production source and real object graphs — never prose carried over from
// 0.9.349/0.9.374/0.9.377/0.9.378 without re-checking it against the current
// tree — in the identical "reproduce the real seam, verify the reproduction
// is honest" discipline those milestones already hold.
//
//   Section A — Completed distribution capability inventory: seven named
//               mechanisms, each classified COMPLETE/INTERNAL/DEFERRED
//               against real evidence.
//   Section B — User journey reassessment: Create -> Edit -> Publish ->
//               Distribute, driven through the real EditorView/Toolbar
//               chain, asking whether a meaningful task still ends
//               prematurely.
//   Section C — Distribution-result usability: what the existing result
//               actually gives the user, split into five distinct
//               properties rather than one "is it good enough" question.
//   Section D — Discovery convergence: Distributed != Discovered, checked
//               live and structurally, without reopening the already-
//               deferred proactive Repository discovery architecture.
//   Section E — Cross-surface consistency: a regression check, not a new
//               architecture, confirming EditorView/OwnPublicationPanel/
//               WorldEncounterCanvas remain presentation-only.
//   Section F — Partial distribution semantics: a mixed PRESENT/ABSENT
//               outcome is not reported as "fully distributed" anywhere.
//   Section G — Failure/recovery product gap: whether a person left with
//               today's generic failure notice can actually do anything
//               about it, without inventing retry infrastructure.
//   Section H — Existing deferred directions, revisited on fresh evidence,
//               not automatically reactivated.
//   Section I — Architecture-driven feature rejection: candidates whose
//               only justification is "we already have a lifecycle, so
//               let's expose more of it" are explicitly rejected.
//   Section J — Final decision matrix and verdict.

let assertionCount = 0;
function assert(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function n(message) {
    return `${assertionCount + 1}. ${message}`;
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function readSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

function codeOnlyLines(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

async function codeOnlySource(relativePath) {
    return codeOnlyLines(await readSource(relativePath));
}

function extractRange(source, startMarker, endMarker, label) {
    const start = source.indexOf(startMarker);
    if (start === -1) throw new Error(`ASSERT FAILED: ${label || startMarker}: start marker located in source`);
    const end = source.indexOf(endMarker, start);
    if (end === -1) throw new Error(`ASSERT FAILED: ${label || startMarker}: end marker located after start`);
    return source.slice(start, end);
}

async function flushMicrotasks() {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let i = 0; i < 10; i++) {
        await Promise.resolve();
    }
}

function grepFiles(pattern, dirs) {
    try {
        const out = execFileSync('grep', ['-rl', pattern, ...dirs, '--include=*.js'], { cwd: SOURCE_ROOT.pathname }).toString().trim();
        return out ? out.split('\n') : [];
    } catch { return []; }
}

async function grepCodeOnlyFiles(pattern, dirs) {
    const candidates = grepFiles(pattern, dirs);
    const hits = [];
    for (const file of candidates) {
        const code = await codeOnlySource(file);
        if (code.includes(pattern)) hits.push(file);
    }
    return hits;
}

const PRODUCTION_DIRS = ['application', 'ui', 'core', 'publisher', 'storage', 'discovery'];

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function makeDocument(title) {
    const world = new World();
    const building = new Building({ creator: 'alice' });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    return new Document({ world, metadata: new DocumentMetadata({ title, author: 'alice' }) });
}

function publishingRig() {
    const storage = new InMemoryStorageProvider();
    const alice = new LocalIdentityProvider(storage);
    alice.login('alice');
    const publishDocumentUseCase = new PublishDocumentUseCase(new LocalPublisherProvider(storage, new LocalContentStore(storage)), alice);
    return { storage, publishDocumentUseCase };
}

function publishLocally(title) {
    return publishingRig().publishDocumentUseCase.execute({ document: makeDocument(title) });
}

function signedPublication(overrides = {}) {
    const publication = new Publication({
        id: 'pub-reassessment-379-1',
        documentId: 'doc-reassessment-379-1',
        title: 'A Reassessed Publication',
        author: 'author-1',
        contentReference: new ContentReference({ hash: 'legacy-hash', uri: 'ipfs://legacy-cid', storage: 'ipfs' }),
        ...overrides
    });
    if (overrides.signature !== undefined) return publication;
    return publication.withSignature(new Signature({
        algorithm: 'Ed25519',
        signer: 'author-1',
        signature: 'fake-signature-value',
        signedHash: 'fake-signed-hash',
        domain: 'forkbuild'
    }));
}

function gatewayResponse(body, { status = 200 } = {}) {
    return new Response(body, { status });
}

// The ONE raw application-level capability ui/main.js composes exactly
// once, at the app root — reused from tests/PostPublishDistributionAction
// ConvergenceAudit.test.js (0.9.378) unmodified.
function realAppWideDistributionCommand({ lifecycleStore, transactionId = 'ReassessmentTransactionId123456789', eventId = 'e'.repeat(64), gatewayHandler, relayHandler }) {
    const gateway = gatewayHandler || (() => gatewayResponse('accepted'));
    const relay = relayHandler || (() => ({ published: true, id: eventId }));
    return composePublicationDistributionCommand({
        lifecycleStore,
        arweaveUploaderOptions: {
            signer: { sign: async (material) => ({ id: transactionId, transaction: { data: material } }) },
            fetchImpl: async (url, options) => gateway(url, options)
        },
        nostrPublisherOptions: {
            relayUrl: 'wss://relay.example',
            discoveryTag: 'forkbuild-post-distribution-reassessment',
            publishImpl: async (relayUrl, eventTemplate) => relay(relayUrl, eventTemplate)
        }
    });
}

function wrapAsWorldViewDistributionAction(rawCommand) {
    return function distributeWorldEncounterPublication(publication) {
        if (!rawCommand) return Promise.reject(new Error('Publication distribution is not available.'));
        return rawCommand({ publication, serializedMaterial: JSON.stringify(publication.toJSON()) });
    };
}

// -----------------------------------------------------------------
// EditorView harness — extracts the REAL, CURRENT 0.9.377 block out of
// ui/views/EditorView.js, unmodified, exactly as tests/EditorViewPostPublish
// DistributionAction.test.js (0.9.377) and tests/PostPublishDistribution
// ActionConvergenceAudit.test.js (0.9.378) already do.
// -----------------------------------------------------------------
// AMENDED BY 0.9.450 — Nostr Multi-Relay Publication Distribution Wiring.
// EditorView.js's own injected command changed from the single-relay
// `publicationDistributionCommand` to `multiRelayNostrPublicationDistributionCommand`
// — see that file's own 0.9.450 amendment. `rawCommand` throughout this
// file remains built via the single-relay `composePublicationDistributionCommand()`
// test double (see `realAppWideDistributionCommand()`'s own header) — this
// file's own convergence/reassessment claims are unaffected by which
// composer built the shared test double, so every assertion keeps working
// against a plain, single-object result, unchanged.
function buildEditorViewHarness(editorViewSource, { multiRelayNostrPublicationDistributionCommand = null } = {}) {
    const blockSource = extractRange(
        editorViewSource,
        "const multiRelayNostrPublicationDistributionCommand = inject('multiRelayNostrPublicationDistributionCommand', null);",
        '// ------------------------- 0.2.21 document lifecycle ------------',
        '0.9.377/0.9.450 post-publish distribution block'
    );

    function ref(initial) { return { value: initial }; }
    function inject(key, fallback) {
        if (key === 'multiRelayNostrPublicationDistributionCommand') {
            return multiRelayNostrPublicationDistributionCommand === null ? fallback : multiRelayNostrPublicationDistributionCommand;
        }
        return fallback;
    }

    // eslint-disable-next-line no-new-func
    const factory = new Function(
        'inject', 'ref',
        `${blockSource}\nreturn {
            multiRelayNostrPublicationDistributionCommand,
            distributeEditorPublication,
            publishedPublication,
            distributionExecuting,
            distributionError,
            distributionResult,
            onDocumentPublished,
            dismissPublishAction,
            distributePublishedDocument
        };`
    );
    return factory(inject, ref);
}

function extractToolbarPublishChain(toolbarCodeOnly) {
    const publishMatch = toolbarCodeOnly.match(/function publish\(\)\s*\{[\s\S]*?\n {8}\}/);
    if (!publishMatch) throw new Error('ASSERT FAILED: Toolbar.js publish() function located in source');
    const reportStart = toolbarCodeOnly.indexOf('function report(message) {');
    if (reportStart === -1) throw new Error('ASSERT FAILED: Toolbar.js report() function located in source');
    return toolbarCodeOnly.slice(reportStart, publishMatch.index + publishMatch[0].length);
}

function runToolbarPublish(publishChainSource, { publishDocumentUseCase, documentManager, feedbackShow }) {
    const props = { publishDocumentUseCase, documentManager, feedback: { show: feedbackShow || (() => {}) } };
    let emittedEvent = null;
    let emittedArg = null;
    function emit(event, arg) { emittedEvent = event; emittedArg = arg; }
    // eslint-disable-next-line no-new-func
    const factory = new Function('props', 'emit', `${publishChainSource}\nreturn publish;`);
    factory(props, emit)();
    return { emittedEvent, emittedArg };
}

function publishThroughRealChain(publishSource, editorHarness, { publishDocumentUseCase, documentManager, feedbackShow }) {
    const { emittedEvent, emittedArg } = runToolbarPublish(publishSource, { publishDocumentUseCase, documentManager, feedbackShow });
    if (emittedEvent === 'published') {
        editorHarness.onDocumentPublished(emittedArg);
    }
    return { emittedEvent, emittedArg };
}

function panelCtx(overrides = {}) {
    return {
        publication: null,
        publicationDistributionCommand: null,
        publicationDistributionExecuting: false,
        publicationDistributionError: null,
        publicationDistributionResult: null,
        publicationDistributionRequestId: 0,
        distributeOwnPublication: OwnPublicationPanel.methods.distributeOwnPublication,
        ...overrides
    };
}

function canvasCtx(overrides = {}) {
    const ctx = {
        selectedEncounter: null,
        materialInspection: null,
        distributionLifecycleStore: null,
        distributionLifecycle: null,
        unsubscribeDistributionLifecycle: null,
        distributionCommand: null,
        distributionExecuting: false,
        distributionError: null,
        distributionRequestId: 0,
        selectEncounter: WorldEncounterCanvas.methods.selectEncounter,
        distributeSelectedPublication: WorldEncounterCanvas.methods.distributeSelectedPublication,
        registry: null,
        worldDiscoveryLeadRegistry: null,
        materialSources: null,
        materialVerifier: null,
        ...overrides
    };
    Object.defineProperty(ctx, 'distributablePublication', {
        get() { return WorldEncounterCanvas.computed.distributablePublication.call(ctx); }
    });
    return ctx;
}

function makeEditorViewSurface(editorViewSource) {
    return {
        name: 'EditorView',
        makeCtx: (publication, rawCommand) => {
            const harness = buildEditorViewHarness(editorViewSource, { multiRelayNostrPublicationDistributionCommand: rawCommand });
            harness.onDocumentPublished(publication);
            return harness;
        },
        trigger: (ctx) => ctx.distributePublishedDocument(),
        executing: (ctx) => ctx.distributionExecuting.value,
        error: (ctx) => ctx.distributionError.value,
        result: (ctx) => ctx.distributionResult.value,
        genericErrorMessage: 'Publication distribution could not be completed.'
    };
}

const OWN_PUBLICATION_SURFACE = {
    name: 'OwnPublicationPanel',
    makeCtx: (publication, rawCommand) => panelCtx({ publication, publicationDistributionCommand: wrapAsWorldViewDistributionAction(rawCommand) }),
    trigger: (ctx) => ctx.distributeOwnPublication(),
    executing: (ctx) => ctx.publicationDistributionExecuting,
    error: (ctx) => ctx.publicationDistributionError,
    result: (ctx) => ctx.publicationDistributionResult,
    genericErrorMessage: 'Publication distribution could not be completed.'
};

const WORLD_ENCOUNTER_SURFACE = {
    name: 'WorldView',
    makeCtx: (publication, rawCommand) => canvasCtx({
        selectedEncounter: { kind: 'PUBLICATION', objectId: publication.id },
        materialInspection: { loading: { status: WorldEncounterMaterialLoadStatus.AVAILABLE, material: publication } },
        distributionCommand: wrapAsWorldViewDistributionAction(rawCommand)
    }),
    trigger: (ctx) => ctx.distributeSelectedPublication(),
    executing: (ctx) => ctx.distributionExecuting,
    error: (ctx) => ctx.distributionError,
    result: () => undefined,
    genericErrorMessage: 'Distribution could not be completed.'
};

async function run() {
    const editorViewSource = await readSource('ui/views/EditorView.js');
    const editorViewCodeOnly = codeOnlyLines(editorViewSource);
    const toolbarCodeOnly = await codeOnlySource('ui/components/Toolbar.js');
    const publishSource = extractToolbarPublishChain(toolbarCodeOnly);
    const EDITOR_VIEW_SURFACE = makeEditorViewSurface(editorViewSource);
    const SURFACES = [EDITOR_VIEW_SURFACE, OWN_PUBLICATION_SURFACE, WORLD_ENCOUNTER_SURFACE];

    // ---------------------------------------------------------------
    // Section A — Completed distribution capability inventory.
    // ---------------------------------------------------------------
    {
        const appCode = await readSource('ui/App.js');
        const routerCode = await readSource('ui/router/index.js');

        // 1. Publication distribution (material + discovery). COMPLETE.
        const commandCode = await readSource('application/PublicationDistributionCommand.js');
        assert(commandCode.includes('export function executePublicationDistributionCommand'),
            n('Publication distribution: application/PublicationDistributionCommand.js exports the command boundary — COMPLETE'));

        // 2. Nostr announcement — the discovery half of #1, its own named
        // substrate rather than a generic "discovery" abstraction.
        const orchestratorCode = await readSource('application/PublicationDistributionOrchestrator.js');
        assert(orchestratorCode.includes('NostrPublicationDiscoveryPublisher') || orchestratorCode.includes('nostrPublisherOptions'),
            n('Nostr announcement: the orchestrator composes a real Nostr discovery publisher from nostrPublisherOptions — COMPLETE, reachable as the "discovery" half of Publication distribution on all three surfaces'));

        // 3. Snapshot distribution. COMPLETE, independently reachable.
        const snapshotCommandCode = await readSource('application/SnapshotDistributionCommand.js');
        assert(snapshotCommandCode.includes('export function executeSnapshotDistributionCommand'),
            n('Snapshot distribution: application/SnapshotDistributionCommand.js exports its own command, still separate from Publication distribution — COMPLETE'));

        // 4. IPFS placement/pinning. COMPLETE but gated by a real external
        // prerequisite (a pre-configured hosted pinning endpoint) —
        // reachable from the Publication Center, not the immediate
        // post-publish surface, unchanged since 0.9.349.
        const ipfsCode = await readSource('application/IpfsRemotePublicationCoordinator.js');
        assert(ipfsCode.includes('class IpfsRemotePublicationCoordinator'),
            n('IPFS placement/pinning: application/IpfsRemotePublicationCoordinator.js exists — COMPLETE'));
        const publicationsViewSource = await readSource('ui/views/DecentralizedPublicationsView.js');
        assert(publicationsViewSource.includes('IpfsRemotePublicationCoordinator') || publicationsViewSource.includes('IpfsRemotePublishingConfiguration'),
            n('IPFS placement/pinning is wired into the real Publication Center view (ui/views/DecentralizedPublicationsView.js), not merely defined and unreached'));

        // 5. Bitcoin anchoring — COMPLETE, real wallet prerequisite named
        // on file. Base anchoring — DEFERRED, explicitly reserved.
        const bitcoinCode = await readSource('application/CreateBitcoinAnchorPublisherUseCase.js');
        assert(/never the wallet\/transaction capability/i.test(bitcoinCode),
            n('Bitcoin anchoring: COMPLETE, with its own source explicit that a connected, funded wallet is a separate prerequisite it does not itself supply'));
        const blockchainKindCode = await readSource('application/BlockchainKind.js');
        assert(/RESERVED/i.test(blockchainKindCode) && blockchainKindCode.includes("BASE: 'base'"),
            n('Base anchoring: DEFERRED — BlockchainKind.BASE remains named but reserved, reconfirmed fresh'));
        assert((await grepCodeOnlyFiles('class.*Base.*Publisher', PRODUCTION_DIRS)).length === 0,
            n('no Base-specific anchor publisher class exists anywhere in production, reconfirmed fresh'));

        // 6. Provider preference for Snapshot content. COMPLETE and
        // reachable through its own top-nav settings destination.
        const roleProviderPreferenceCode = await readSource('core/RoleProviderPreference.js');
        assert(roleProviderPreferenceCode.includes('export class RoleProviderPreference') || roleProviderPreferenceCode.includes('export function'),
            n('provider preference for Snapshot content: core/RoleProviderPreference.js exists'));
        assert(routerCode.includes("path: '/settings/content-provider'"),
            n('provider preference for Snapshot content is reachable through a real route (/settings/content-provider) — COMPLETE, not INTERNAL'));
        assert(appCode.includes('to="/settings"'),
            n('the Content Provider settings destination is reachable through the always-mounted Network Settings hub link — COMPLETE'));
        const networkSettingsCode = await readSource('ui/views/NetworkSettingsView.js');
        assert(networkSettingsCode.includes('to="/settings/content-provider"'),
            n('the Network Settings hub itself links to the Content Provider settings destination'));

        // 7. Post-publish distribution action — three converging entry
        // points, reconfirmed present (not re-litigating 0.9.378's own
        // proof of convergence, only that all three still exist).
        assert(editorViewCodeOnly.includes('function distributePublishedDocument()'),
            n('post-publish distribution action: EditorView.js (0.9.377) still carries its own action'));
        const panelSource = await readSource('ui/components/OwnPublicationPanel.js');
        const canvasSource = await readSource('ui/components/WorldEncounterCanvas.js');
        assert(panelSource.includes('distributeOwnPublication') && canvasSource.includes('distributeSelectedPublication'),
            n('OwnPublicationPanel.js and WorldEncounterCanvas.js still each carry their own pre-existing entry point onto the identical capability'));

        console.log('✓ Section A: seven named mechanisms inventoried against real evidence — Publication distribution, Nostr announcement, Snapshot distribution, IPFS placement/pinning, Bitcoin anchoring, and the post-publish distribution action are all COMPLETE and reachable; Base anchoring remains DEFERRED (reserved, unimplemented); nothing in this inventory is merely INTERNAL (unreachable from the running application)');
    }

    // ---------------------------------------------------------------
    // Section B — User journey reassessment: Create -> Edit -> Publish
    // -> Distribute, through the real EditorView/Toolbar chain, asking
    // whether a meaningful task still ends prematurely.
    // ---------------------------------------------------------------
    {
        const editorHarness = buildEditorViewHarness(editorViewSource, { multiRelayNostrPublicationDistributionCommand: null });
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const rawCommand = realAppWideDistributionCommand({ lifecycleStore });
        const editorHarnessLive = buildEditorViewHarness(editorViewSource, { multiRelayNostrPublicationDistributionCommand: rawCommand });
        const { publishDocumentUseCase } = publishingRig();

        const { emittedEvent, emittedArg } = publishThroughRealChain(publishSource, editorHarnessLive, {
            publishDocumentUseCase,
            documentManager: { document: makeDocument('Section B Reassessment Manor') }
        });
        assert(emittedEvent === 'published', n('Create -> Edit -> Publish, through the real Toolbar chain, produces a real published Publication'));
        assert(editorHarnessLive.publishedPublication.value === emittedArg,
            n('the post-publish action becomes available immediately, holding the exact just-published Publication — the journey has not ended yet, by design'));

        editorHarnessLive.distributePublishedDocument();
        await flushMicrotasks();

        assert(editorHarnessLive.distributionError.value === null && editorHarnessLive.distributionResult.value !== null,
            n('Distribute now completes the explicit distribution step the journey brief names — the task the user actually asked for (tell the network about my Publication) is genuinely finished, not merely started'));

        // "What does the user reasonably expect next" — checked, not
        // assumed. The task this journey names (get material onto
        // Arweave, get a discovery announcement onto Nostr) is complete;
        // a DIFFERENT, later task (verify/browse it again another day) is
        // Section C/D's own separate question, not evidence that THIS
        // task ended prematurely.
        assert(editorHarnessLive.distributionResult.value.publication.objectId === emittedArg.id,
            n('the completed result names the exact Publication the user just distributed (result.publication.objectId === the just-published Publication\'s own id) — the immediate task has a concrete, checkable outcome, not a dangling "something happened" state'));

        // Unused harness kept only to document the "publish alone,
        // nothing pending" baseline this journey departs from.
        assert(editorHarness.publishedPublication.value === null,
            n('sanity: a freshly-constructed harness with no publish yet shows no pending post-publish action — the journey genuinely starts from nothing'));

        console.log('✓ Section B: Create -> Edit -> Publish -> Distribute is a complete, live-reproduced journey through the real Toolbar/EditorView chain; the immediate task the journey brief names (tell the network about this Publication) reaches a concrete, checkable outcome — it does not end prematurely');
    }

    // ---------------------------------------------------------------
    // Section C — Distribution-result usability: five distinct
    // properties, not one "is it good enough" question.
    // ---------------------------------------------------------------
    {
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const rawCommand = realAppWideDistributionCommand({ lifecycleStore, eventId: 'c'.repeat(64) });
        const publication = publishLocally('Section C Usability Manor');
        const editorHarness = buildEditorViewHarness(editorViewSource, { multiRelayNostrPublicationDistributionCommand: rawCommand });
        editorHarness.onDocumentPublished(publication);
        editorHarness.distributePublishedDocument();
        await flushMicrotasks();

        // C1 — operation succeeded.
        assert(editorHarness.distributionError.value === null,
            n('operation succeeded: no error was recorded for a genuine success'));

        // C2 — distribution lifecycle recorded.
        const lifecycle = lifecycleStore.get(publication.id);
        assert(lifecycle && lifecycle.discovery.state === PublicationDistributionState.PRESENT,
            n('distribution lifecycle recorded: the shared lifecycle store genuinely holds a PRESENT discovery fact for this Publication'));

        // C3 — locator/result available, and genuinely rendered (not
        // merely present on the object graph but never shown).
        const result = editorHarness.distributionResult.value;
        assert(result.material.uri && result.discovery.id === 'c'.repeat(64),
            n('locator/result available: the result carries a real material URI and a real discovery event id, not placeholders'));
        // AMENDED BY 0.9.450 — distributionResult is now an ARRAY (one
        // element per configured relay); the template reads material from
        // the first element and discovery per relay result — see
        // EditorView.js's own 0.9.450 amendment.
        assert(editorViewSource.includes('{{ distributionResult[0].material ? distributionResult[0].material.uri : ') &&
               editorViewSource.includes('relayResult.discovery ? relayResult.discovery.id : '),
            n('AMENDED BY 0.9.450 — EditorView.js\'s own template actually renders material.uri and discovery.id to the user — the locator is not merely computed and discarded'));
        const panelSource = await readSource('ui/components/OwnPublicationPanel.js');
        assert(panelSource.includes('{{ publicationDistributionResult.material ? publicationDistributionResult.material.uri : ') &&
               panelSource.includes('{{ publicationDistributionResult.discovery ? publicationDistributionResult.discovery.id : '),
            n('OwnPublicationPanel.js renders the identical shape — cross-surface consistent, not an EditorView-only property'));

        // C4 — user can discover the publication: a real, always-reachable
        // Publication Center exists and already implements exactly this
        // "browse/resolve a cataloged Publication" capability, independent
        // of how the Publication got there.
        const routerCode = await readSource('ui/router/index.js');
        const appCode = await readSource('ui/App.js');
        assert(routerCode.includes("path: '/publications'") && appCode.includes('to="/publications"'),
            n('user can discover the publication: the Publication Center is a real, always-mounted top-nav route — the capability exists'));

        // C5 — user can verify/retrieve it later: the Publication Center
        // genuinely composes real resolution/retrieval machinery, not a
        // static list.
        const publicationsViewSource = await readSource('ui/views/DecentralizedPublicationsView.js');
        assert(publicationsViewSource.includes('resolvePublicationView') && publicationsViewSource.includes('describeRetrieval'),
            n('user can verify/retrieve it later: the Publication Center composes real resolution-view and retrieval-description logic, not a placeholder list'));

        // The genuine, narrow finding this section's own evidence
        // supported at the time: C3's locator is real and rendered, C4/C5's
        // capability is real and reachable, but nothing connected them —
        // recorded here, decided in Section D/J of THIS milestone (0.9.379),
        // and then re-audited fresh by 0.9.380 (which corrected the
        // destination away from the Publication Center) and closed by
        // 0.9.381. Scoped to the 0.9.377 post-publish block itself, since
        // EditorView.js legitimately uses router.push() elsewhere (fork
        // navigation) — unrelated to this finding.
        const editorPostPublishBlock = extractRange(
            editorViewSource,
            "const multiRelayNostrPublicationDistributionCommand = inject('multiRelayNostrPublicationDistributionCommand', null);",
            '// ------------------------- 0.2.21 document lifecycle ------------',
            '0.9.377/0.9.450 post-publish distribution block'
        );
        assert(!editorPostPublishBlock.includes('/publications'),
            n('EditorView.js\'s own 0.9.377/0.9.381 post-publish block still contains no link, route, or navigation toward the Publication Center — 0.9.380\'s own audit proved that destination structurally wrong, and 0.9.381 correctly never built it'));
        assert(editorPostPublishBlock.includes('router.push') && editorPostPublishBlock.includes("path: `/world/"),
            n('EditorView.js\'s own post-publish block now DOES navigate — 0.9.381 closed the connective-link gap this section found, retargeted (per 0.9.380\'s own audit) to the real destination, /world/<documentId>, never the Publication Center this section originally had in mind'));
        assert(!panelSource.includes('/publications') && !panelSource.includes('router.push'),
            n('OwnPublicationPanel.js shows the identical absence, unmodified — per 0.9.380\'s own Section E, this surface already lives at the destination and needs no link'));

        console.log('✓ Section C: operation-succeeded, lifecycle-recorded, and locator-available are all TRUE and genuinely rendered to the user on both surfaces that keep a local result; discover and verify/retrieve are both TRUE as SEPARATE, already-complete capabilities (the Publication Center) — but no result panel links to that capability for the Publication just distributed. A missing connective link is not evidence that a new receipt model is needed (Section J)');
    }

    // ---------------------------------------------------------------
    // Section D — Discovery convergence: Distributed != Discovered.
    // ---------------------------------------------------------------
    {
        // D1 — live: a genuine, successful Nostr announcement never
        // mutates the local Repository read model — reconfirmed fresh,
        // one milestone further downstream from 0.9.349's own proof.
        const storage = new InMemoryStorageProvider();
        const alice = new LocalIdentityProvider(storage);
        alice.login('alice');
        const publisherProvider = new LocalPublisherProvider(storage, new LocalContentStore(storage));
        const discoveryProvider = new LocalDiscoveryProvider(storage);
        const publishUseCase = new PublishDocumentUseCase(publisherProvider, alice);
        const publication = publishUseCase.execute({ document: makeDocument('Section D Discovery Lodge') });
        const beforeJson = JSON.stringify(discoveryProvider.findById(publication.id).toJSON());

        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const rawCommand = realAppWideDistributionCommand({ lifecycleStore });
        const editorHarness = buildEditorViewHarness(editorViewSource, { multiRelayNostrPublicationDistributionCommand: rawCommand });
        editorHarness.onDocumentPublished(publication);
        editorHarness.distributePublishedDocument();
        await flushMicrotasks();
        assert(editorHarness.distributionError.value === null && lifecycleStore.get(publication.id).discovery.state === PublicationDistributionState.PRESENT,
            n('sanity: the announcement genuinely succeeded, driven this time through the EditorView surface rather than OwnPublicationPanel'));

        const afterJson = JSON.stringify(discoveryProvider.findById(publication.id).toJSON());
        assert(beforeJson === afterJson,
            n('a successful Nostr announcement never mutates the local Repository read model — Distributed != Discovered holds fresh, one entry point further than 0.9.349 checked'));

        // D2 — the Publication Center already IS the "discovered" side of
        // this distinction, real and reachable (Section C4), so this
        // finding is not a call to reopen proactive Repository discovery
        // (0.9.330/0.9.340/0.9.350/0.9.351/0.9.374, all DEFER) — it is a
        // narrower, presentation-only question: does landing on that page
        // ever let you jump straight to the Publication you just
        // distributed? It does not, today.
        const publicationsViewSource = await readSource('ui/views/DecentralizedPublicationsView.js');
        assert(!publicationsViewSource.includes('useRoute') && !/route\.query/.test(publicationsViewSource),
            n('the Publication Center reads no route query parameter — it has no "jump straight to Publication X" mechanism at all, so a link from the distribution result could not target one yet even if added; the finding is real, but it is a build task, not a five-line prop wiring like 0.9.377\'s own'));

        // D3 — reconfirm, fresh, that Repository search itself still does
        // not reach out over the network on its own initiative — the
        // larger, already-deferred seam this milestone does NOT reopen.
        const searchCode = await codeOnlySource('application/SearchPublicationsUseCase.js');
        assert(!/Arweave|Nostr|Ipfs|fetch\(|WebSocket/i.test(searchCode),
            n('SearchPublicationsUseCase.js still imports no network/discovery collaborator and stays synchronous — proactive Repository discovery remains correctly DEFERRED, not reopened by this finding'));

        console.log('✓ Section D: Distributed != Discovered reconfirmed live and fresh (one entry point further than 0.9.349); the Publication Center already implements "discovered," reachable and real; the one genuine gap this section finds is narrower and different from proactive discovery — no route-query "jump to this Publication" mechanism exists yet anywhere in the Publication Center, so a contextual link would need that mechanism first. Proactive Repository discovery itself is correctly NOT reopened');
    }

    // ---------------------------------------------------------------
    // Section E — Cross-surface consistency: a regression check, not a
    // new architecture.
    // ---------------------------------------------------------------
    {
        const regressionSuites = [
            'tests/PostPublishDistributionActionConvergenceAudit.test.js',
            'tests/EditorViewPostPublishDistributionAction.test.js',
            'tests/WorldViewPublicationDistributionActionIntegration.test.js'
        ];
        for (const suite of regressionSuites) {
            let output;
            try {
                output = execFileSync(process.execPath, [suite], { cwd: SOURCE_ROOT.pathname, encoding: 'utf8' });
            } catch (e) {
                assertionCount += 1;
                throw new Error(`ASSERT FAILED: ${assertionCount}. ${suite} still passes unmodified — it failed instead:\n${e.stdout || ''}\n${e.stderr || e.message}`);
            }
            assert(!/ASSERT FAILED/.test(output), n(`${suite} produced no failed assertion, reconfirming EditorView/WorldView/OwnPublicationPanel convergence fresh`));
        }

        // Live, minimal reconfirmation of the same three-surface command
        // identity 0.9.378 Section A already proved, using this file's own
        // independent object graph rather than importing that result.
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const rawCommand = realAppWideDistributionCommand({ lifecycleStore, eventId: 'e'.repeat(64) });
        for (const surface of SURFACES) {
            const publication = publishLocally(`Section E ${surface.name} Manor`);
            const ctx = surface.makeCtx(publication, rawCommand);
            surface.trigger(ctx);
            await flushMicrotasks();
            assert(surface.error(ctx) === null, n(`${surface.name}: still converges on the same command, fresh — no error`));
            assert(lifecycleStore.get(publication.id).discovery.state === PublicationDistributionState.PRESENT,
                n(`${surface.name}: still lands in the same shared lifecycle store, fresh`));
        }

        console.log(`✓ Section E: ${regressionSuites.length} regression suites re-run live and pass unmodified; a fresh, independent three-surface run confirms EditorView/OwnPublicationPanel/WorldView remain presentation-only entry points over the identical command — this is a regression check, not a new architecture`);
    }

    // ---------------------------------------------------------------
    // Section F — Partial distribution semantics.
    // ---------------------------------------------------------------
    {
        // F1 — live: material succeeds, discovery declines (a Nostr relay
        // returning null) — a real, mixed PRESENT/ABSENT lifecycle.
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const publication = signedPublication({ id: 'pub-379-partial-1' });
        const rawCommand = realAppWideDistributionCommand({ lifecycleStore, relayHandler: () => null });
        const editorHarness = buildEditorViewHarness(editorViewSource, { multiRelayNostrPublicationDistributionCommand: rawCommand });
        editorHarness.onDocumentPublished(publication);
        editorHarness.distributePublishedDocument();
        await flushMicrotasks();

        assert(editorHarness.distributionError.value === null,
            n('a declined discovery announcement, with material still placed, is not treated as an overall failure, reconfirmed through EditorView'));
        const lifecycle = describePublicationDistributionLifecycle(editorHarness.distributionResult.value);
        assert(lifecycle.material.state === PublicationDistributionState.PRESENT && lifecycle.discovery.state === PublicationDistributionState.ABSENT,
            n('the lifecycle genuinely records material PRESENT / discovery ABSENT independently — one destination succeeded, the other did not'));

        // F2 — the rendered result reflects exactly that partial state
        // (the template's own fallback text), never a fabricated success.
        assert(editorViewSource.includes("'Not yet announced'"),
            n('EditorView.js\'s own template renders "Not yet announced" for a declined discovery outcome — it never implies the announcement succeeded when it did not'));

        // F3 — no aggregate "fully distributed" claim exists anywhere in
        // production — the exact concern this section's own brief names,
        // and there is still no aggregate distribution state to make one
        // plausible from.
        const forbiddenAggregateVocabulary = [
            'fully distributed', 'Fully Distributed', 'isFullyDistributed', 'allDistributed',
            'globallyDistributed', 'aggregateDistributionStatus', 'AggregateDistributionStatus'
        ];
        for (const term of forbiddenAggregateVocabulary) {
            const hits = await grepCodeOnlyFiles(term, PRODUCTION_DIRS);
            assert(hits.length === 0, n(`no "${term}" vocabulary exists anywhere in production — found: ${JSON.stringify(hits)}`));
        }

        console.log('✓ Section F: a mixed material-PRESENT / discovery-ABSENT outcome is live-proven, rendered honestly (each dimension shown independently, never merged into one verdict), and no "fully distributed" aggregate vocabulary exists anywhere — reconfirmed there is still no aggregate distribution state to misrepresent one from');
    }

    // ---------------------------------------------------------------
    // Section G — Failure/recovery product gap.
    // ---------------------------------------------------------------
    {
        // G1 — live, per surface: a synchronous failure leaves the action
        // available for an immediate manual retry (a second click), and
        // that retry, once the underlying cause is gone, succeeds cleanly
        // — proving today's UX already covers "try again" without any
        // retry infrastructure.
        for (const surface of SURFACES) {
            const publication = publishLocally(`Section G ${surface.name} Manor`);
            let attempt = 0;
            const flakyCommand = (request) => {
                attempt += 1;
                if (attempt === 1) throw new Error(`${surface.name} gateway unavailable`);
                return Promise.resolve({ publication: { objectId: request?.publication?.objectId || publication.id }, material: null, discovery: null });
            };
            const ctx = surface.makeCtx(publication, flakyCommand);

            surface.trigger(ctx);
            await flushMicrotasks();
            assert(surface.error(ctx) === surface.genericErrorMessage,
                n(`${surface.name}: a first synchronous failure surfaces the existing generic notice`));

            surface.trigger(ctx);
            await flushMicrotasks();
            assert(surface.error(ctx) === null,
                n(`${surface.name}: a manual retry — the SAME explicit trigger, clicked again — clears the prior error once the underlying attempt now succeeds, with no dedicated retry control of its own`));
        }

        // G2 — structural: no retry/queue/scheduler vocabulary exists in
        // any of the three surfaces, reconfirmed fresh across all three
        // rather than just EditorView.js as 0.9.378 Section J checked.
        const canvasCodeOnly = await codeOnlySource('ui/components/WorldEncounterCanvas.js');
        const panelCodeOnly = await codeOnlySource('ui/components/OwnPublicationPanel.js');
        for (const [label, code] of [['EditorView.js', editorViewCodeOnly], ['OwnPublicationPanel.js', panelCodeOnly], ['WorldEncounterCanvas.js', canvasCodeOnly]]) {
            for (const term of ['setInterval', 'RetryQueue', 'retryQueue', 'RetryScheduler']) {
                assert(!code.includes(term), n(`${label} contains no "${term}" — no retry loop, queue, or scheduler of any kind`));
            }
        }

        console.log('✓ Section G: today\'s generic failure notice already leaves a person able to act — the same explicit trigger, clicked again, is a complete manual retry that a real recovered attempt actually succeeds through, live-proven on all three surfaces; no retry infrastructure of any kind exists or is warranted by this evidence');
    }

    // ---------------------------------------------------------------
    // Section H — Existing deferred directions, revisited.
    // ---------------------------------------------------------------
    {
        const forbiddenVocabulary = [
            'DistributionHistory', 'distributionHistory', 'DistributionHistoryView',
            'DeliveryNotification', 'deliveryNotification', 'DeliveryReceipt', 'deliveryReceipt',
            'RetryQueue', 'retryQueue', 'DistributionRetryQueue',
            'ProviderFallback', 'providerFallback', 'DistributionFallback',
            'ProviderHealth', 'providerHealth', 'ProviderHealthCheck',
            'AutomaticDistribution', 'automaticDistribution',
            'MultiProviderDistribution', 'multiProviderDistribution'
        ];
        for (const term of forbiddenVocabulary) {
            const hits = await grepCodeOnlyFiles(term, PRODUCTION_DIRS);
            assert(hits.length === 0, n(`no "${term}" vocabulary exists anywhere in production — found: ${JSON.stringify(hits)}`));
        }

        // Proactive Repository discovery: reconfirmed DEFER a further
        // time, on fresh evidence (already checked live in Section D2/D3),
        // not reopened here beyond restating the file-level fact.
        const repositoryViewCode = await codeOnlySource('ui/views/RepositoryView.js');
        assert(!repositoryViewCode.includes('PublicationDistributionCommand') && !repositoryViewCode.includes('SnapshotDistributionCommand'),
            n('RepositoryView.js still imports neither distribution command — the infrastructure/distribution arcs changed reachability of distribution, never whether Repository search reaches out on its own'));

        console.log('✓ Section H: none of distribution history, delivery notifications, a retry queue, provider fallback, provider health, automatic distribution, or multi-provider distribution exist anywhere in production; proactive Repository discovery remains correctly DEFERRED on fresh evidence — no new evidence changes any of their prior status');
    }

    // ---------------------------------------------------------------
    // Section I — Architecture-driven feature rejection.
    // ---------------------------------------------------------------
    {
        // No file or export exists whose only reason to exist would be
        // "expose more of the lifecycle we already built."
        const forbiddenFileNames = [
            'application/PublicationDistributionHistory.js',
            'application/PublicationDistributionHistoryView.js',
            'application/DistributionReceipt.js',
            'application/PublicationDistributionReceipt.js',
            'application/DistributionStatusPanel.js'
        ];
        for (const relativePath of forbiddenFileNames) {
            let exists = true;
            try {
                await readSource(relativePath);
            } catch {
                exists = false;
            }
            assert(!exists, n(`${relativePath} does not exist — no lifecycle-exposure feature has been built merely because the lifecycle store already exists`));
        }

        // The lifecycle store itself still accumulates no history array —
        // reconfirmed fresh, the same structural guarantee that makes a
        // "distribution history" feature a genuinely new capability to
        // build, never a thin view over data already collected.
        const storeCode = await codeOnlySource('application/PublicationDistributionLifecycleStore.js');
        assert(!storeCode.includes('push('),
            n('PublicationDistributionLifecycleStore.js still accumulates no history array — each Publication maps to its single latest fact only, reconfirmed fresh'));

        // The lifecycle vocabulary itself is unchanged — still exactly
        // two states, not something this milestone's own audit grew.
        const lifecycleStateCode = await readSource('application/PublicationDistributionLifecycle.js');
        const stateValues = [...lifecycleStateCode.matchAll(/^\s{4}([A-Z_]+):\s*'([A-Z_]+)'/gm)].map((m) => m[2]);
        assert(stateValues.length === 2 && stateValues.includes('ABSENT') && stateValues.includes('PRESENT'),
            n(`PublicationDistributionState still carries exactly ABSENT/PRESENT and nothing else — found: ${JSON.stringify(stateValues)}`));

        console.log('✓ Section I: no candidate whose only justification is "the lifecycle already exists, so expose more of it" has been built — no history file, no receipt file, no status-panel file exists, the lifecycle store still accumulates no history array, and the lifecycle vocabulary is unchanged at exactly two states');
    }

    // ---------------------------------------------------------------
    // Section J — Final decision matrix and verdict.
    // ---------------------------------------------------------------
    {
        console.log('');
        console.log('Final decision matrix:');
        console.log('| Candidate                        | Evidence                                                    | Decision |');
        console.log('|-----------------------------------|--------------------------------------------------------------|----------|');
        console.log('| Distribution history               | no demonstrated user task; store holds latest fact only       | STOP     |');
        console.log('| Automatic distribution              | conflicts with explicit user agency (Sections B, G)           | STOP     |');
        console.log('| Retry queue                         | manual re-click already recovers a real failure, live-proven  | STOP     |');
        console.log('| Provider fallback/health             | no demonstrated recurring need; not raised by this arc        | STOP     |');
        console.log('| Proactive Repository discovery       | previously identified larger seam, reconfirmed DEFER (5th+)   | DEFER    |');
        console.log('| Distribution receipt (new model)     | existing result already carries a real locator, rendered      | STOP     |');
        console.log('| Publication Center contextual link   | real, narrow, presentation-only gap — but needs a route-query | DEFER    |');
        console.log('|                                     | mechanism the Center itself does not have yet (Section D2)   |          |');
        console.log('| Another distribution provider        | no demonstrated need; seventh mechanism already inventoried  | STOP     |');
        console.log('');
        console.log('✓ Section J: VERDICT — STABLE_STOP. Every capability in Section A\'s inventory is COMPLETE and reachable except Base anchoring');
        console.log('  (deliberately DEFERRED, unimplemented); the Create -> Edit -> Publish -> Distribute journey, driven live through the real');
        console.log('  EditorView/Toolbar chain, reaches a concrete, checkable outcome without ending prematurely; the distribution result genuinely');
        console.log('  gives operation-succeeded, lifecycle-recorded, and a real rendered locator; discovery and verification already exist as a');
        console.log('  separate, complete, always-reachable capability (the Publication Center) rather than something this arc still owes the user;');
        console.log('  Distributed != Discovered holds fresh, live, one entry point further downstream; all three surfaces remain presentation-only');
        console.log('  and pass their own regression suites unmodified; partial distribution is reported honestly with no aggregate "fully');
        console.log('  distributed" claim anywhere; today\'s generic failure notice already supports a genuine manual retry, live-proven; and none of');
        console.log('  the eight previously-deferred directions gained new evidence changing their status. The one real, narrow finding — no result');
        console.log('  panel links to the Publication Center for the Publication just distributed, and the Center itself has no mechanism yet to');
        console.log('  jump straight to one Publication — is recorded as DEFER, on the same footing as proactive Repository discovery: real,');
        console.log('  available to a future milestone on genuine evidence, and deliberately NOT selected as this milestone\'s own BUILD_NEXT. No');
        console.log('  0.9.380 is pre-selected from within this arc.');

        console.log('\n✅ All Post-Distribution Product Evolution Reassessment tests passed.');
    }
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
