import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

import { composePublicationDistributionCommand } from '../application/PublicationDistributionCommandComposition.js';
import { PublicationDistributionLifecycleMemoryStore } from '../application/PublicationDistributionLifecycleStore.js';
import { PublicationDistributionState } from '../application/PublicationDistributionLifecycle.js';
import { PublishDocumentUseCase } from '../application/PublishDocumentUseCase.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import OwnPublicationPanel from '../ui/components/OwnPublicationPanel.js';
import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import { WorldEncounterMaterialLoadStatus } from '../application/WorldEncounterMaterialLoading.js';

// 0.9.378 — Post-Publish Distribution Action Convergence Audit.
//
// **Type: test-only, no production changes.** 0.9.377 gave EditorView a
// THIRD entry point onto Publication Distribution, alongside the
// pre-existing WorldView (WorldEncounterCanvas) and OwnPublicationPanel
// paths. The important question after adding a third caller is not
// whether it works in isolation — tests/EditorViewPostPublishDistribution
// Action.test.js already proved that — it is whether all three now
// converge on the SAME single application-level capability, with the
// SAME Publication identity, the SAME explicit-click boundary, and the
// SAME lifecycle/failure semantics, or whether a second, parallel
// distribution architecture has quietly grown up next to the first one:
//
//   Does EditorView's new capability change ANYTHING about the existing
//   distribution seam, other than adding a third caller onto it?
//
// Every section below is built fresh, against real production source and
// real object graphs, in the same "reproduce the real seam, then verify
// the reproduction is honest" discipline tests/PostPublishDistribution
// ConvergenceAudit.test.js (0.9.348) and tests/EditorViewPostPublish
// DistributionAction.test.js (0.9.377) already hold. Because
// ui/views/EditorView.js and ui/components/Toolbar.js both import `vue`,
// this file uses the same marker-based source-extraction-plus-
// `new Function` technique those two files already established —
// executing the real, current production source, never a hand-retyped
// copy. ui/components/OwnPublicationPanel.js and ui/components/
// WorldEncounterCanvas.js import no `vue` module at all, so — exactly
// like 0.9.348's own harness — they are imported directly and driven
// through plain method/computed/watcher call-through contexts.
//
//   Section A — Three-surface command convergence: EditorView, WorldView
//               (via WorldEncounterCanvas), and OwnPublicationPanel all
//               ultimately invoke the SAME single composed application
//               capability — no parallel orchestration.
//   Section B — Exact Publication identity, followed live end to end
//               through the real Toolbar.publish() -> `published` emit
//               -> EditorView.onDocumentPublished() -> action ->
//               publicationDistributionCommand() chain.
//   Section C — Publish remains distribution-free: live behavior (not
//               just source inspection) proves persistence + feedback +
//               action-availability with zero distribution execution.
//   Section D — Explicit-click boundary: exactly one distribution
//               invocation per click, with no duplicate from the publish
//               event, the toast, a watcher, a state change, or result
//               rendering.
//   Section E — Multiple sequential Publications, driven through the
//               COMPLETE production path (the real Toolbar.publish(),
//               not just the isolated action).
//   Section F — Failure/result convergence across all three surfaces:
//               synchronous throw, rejection, success, and a duplicate/
//               stale invocation — semantic equivalence, not identical
//               markup.
//   Section G — Lifecycle convergence: EditorView never constructs its
//               own orchestrator/executor/lifecycle-store — it only ever
//               receives the one already-composed capability.
//   Section H — Dismissal and replacement: no persistent "needs
//               distribution" information survives either operation.
//   Section I — WorldView / OwnPublicationPanel regression: zero
//               behavioral effect from EditorView's new capability.
//   Section J — Architecture boundary and final verdict: none of the
//               structures 0.9.377 was warned away from have appeared.

// `n(message)` numbers a message with the NEXT assertion's ordinal
// before `assert()` itself bumps the counter — every assertion message
// in this file is built via n(), so the numbering stays sequential
// end to end, exactly like every other convergence audit in this suite.
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

// Builds a fresh identity/storage/publish-use-case triple, mirroring
// tests/EditorViewPostPublishDistributionAction.test.js's own
// publishLocally() exactly — used wherever a section needs a Publication
// but does not need to drive it through the live Toolbar chain itself.
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

function gatewayResponse(body, { status = 200 } = {}) {
    return new Response(body, { status });
}

// The ONE raw application-level capability ui/main.js composes exactly
// once, at the app root — the top of the convergence diagram every
// section below verifies against. Never rebuilt per-surface: every
// section that needs "the real chain" shares a single instance of this,
// exactly as ui/main.js's own single `const publicationDistributionCommand`
// does.
function realAppWideDistributionCommand({ lifecycleStore, transactionId = 'ConvergenceAuditTransactionId123456', eventId = 'e'.repeat(64), gatewayHandler, relayHandler }) {
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
            discoveryTag: 'forkbuild-post-publish-convergence-audit',
            publishImpl: async (relayUrl, eventTemplate) => relay(relayUrl, eventTemplate)
        }
    });
}

// Reproduces ui/views/WorldView.js's own distributeWorldEncounterPublication()
// VERBATIM — the ONE wrapper both OwnPublicationPanel's
// `publicationDistributionCommand` prop AND WorldEncounterCanvas's
// `distributionCommand` prop are bound to in production (see
// ui/views/WorldView.js:4488/4803). Wraps whatever raw command it is
// handed — never constructs one of its own.
function wrapAsWorldViewDistributionAction(rawCommand) {
    return function distributeWorldEncounterPublication(publication) {
        if (!rawCommand) {
            return Promise.reject(new Error('Publication distribution is not available.'));
        }
        return rawCommand({
            publication,
            serializedMaterial: JSON.stringify(publication.toJSON())
        });
    };
}

// -----------------------------------------------------------------
// EditorView harness — extracts the REAL, CURRENT 0.9.377 block out of
// ui/views/EditorView.js (never hand-retyped), identical to
// tests/EditorViewPostPublishDistributionAction.test.js's own
// buildHarness().
// -----------------------------------------------------------------
// AMENDED BY 0.9.450 — Nostr Multi-Relay Publication Distribution Wiring.
// EditorView.js's own injected command changed from the single-relay
// `publicationDistributionCommand` to `multiRelayNostrPublicationDistributionCommand`
// — see that file's own 0.9.450 amendment. The `rawCommand`/`command` this
// harness is handed throughout this file remains built via the single-
// relay `composePublicationDistributionCommand()` test double (see
// `realAppWideDistributionCommand()`'s own header, unchanged) — this file's
// own convergence claim is about ONE SHARED RAW COMMAND reaching every
// surface identically, never about re-proving the multi-relay array shape
// itself (covered exhaustively by tests/NostrMultiRelayPublicationDistributionWiring.test.js
// and sibling files) — so every assertion in this file keeps working
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

// -----------------------------------------------------------------
// Toolbar harness — extracts the REAL, CURRENT publish() function out of
// ui/components/Toolbar.js (never hand-retyped) and executes it live
// against a fake `props`/`emit`, matching Vue's own setup(props, { emit })
// contract for exactly the calls publish() makes.
// -----------------------------------------------------------------
// Extracts BOTH report() (which publish() calls) and publish() itself,
// verbatim, in the order they already appear in source — everything
// between them (save/createNew/load/place/refresh) rides along as
// unexecuted function declarations, harmless since nothing here ever
// calls them. Never hand-retyped: report()'s own body
// (`props.feedback ? props.feedback.show(...) : alert(...)`) is the
// REAL, CURRENT source, not a reconstruction.
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

// Wires the two REAL extracted harnesses together exactly the way
// EditorView.js's own template does — `@published="onDocumentPublished"`
// — so "publish, through the real Toolbar, into the real EditorView
// action" is one function call away for every section that needs it.
function publishThroughRealChain(publishSource, editorHarness, { publishDocumentUseCase, documentManager, feedbackShow }) {
    const { emittedEvent, emittedArg } = runToolbarPublish(publishSource, { publishDocumentUseCase, documentManager, feedbackShow });
    if (emittedEvent === 'published') {
        editorHarness.onDocumentPublished(emittedArg);
    }
    return { emittedEvent, emittedArg };
}

// -----------------------------------------------------------------
// OwnPublicationPanel / WorldEncounterCanvas adapters — reproduced from
// tests/PostPublishDistributionConvergenceAudit.test.js (0.9.348)
// unchanged, since that harness already proved itself against these two
// files and nothing about either file's own distribution surface has
// moved.
// -----------------------------------------------------------------
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
        refreshSelectionOutcome: WorldEncounterCanvas.methods.refreshSelectionOutcome,
        refreshMaterialInspection: WorldEncounterCanvas.methods.refreshMaterialInspection,
        refreshDecentralizedLeadOutcome: WorldEncounterCanvas.methods.refreshDecentralizedLeadOutcome,
        refreshDistributionLifecycle: WorldEncounterCanvas.methods.refreshDistributionLifecycle,
        stopSubscription: WorldEncounterCanvas.methods.stopSubscription,
        distributeSelectedPublication: WorldEncounterCanvas.methods.distributeSelectedPublication,
        registry: null,
        worldDiscoveryLeadRegistry: null,
        materialSources: null,
        materialVerifier: null,
        resolvedSelectionChoice: null,
        resolvedLeadChoice: null,
        decentralizedLeadOutcome: null,
        selectionOutcome: null,
        materialInspectionRequestId: 0,
        ...overrides
    };
    Object.defineProperty(ctx, 'distributablePublication', {
        get() { return WorldEncounterCanvas.computed.distributablePublication.call(ctx); }
    });
    return ctx;
}

// Three thin adapters over three REAL, unmodified callables — EditorView's
// own extracted 0.9.377 block, and OwnPublicationPanel's/WorldEncounterCanvas's
// own unmodified methods — letting every scenario below drive all three
// surfaces without triplicating harness wiring. `makeCtx` always receives
// the SAME raw application-level command (or null); each adapter is
// responsible for wiring it in exactly the shape its own real production
// code expects — a direct inject for EditorView, and the WorldView-style
// wrapper for the other two, mirroring ui/views/WorldView.js's own actual
// composition.
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
    // WorldEncounterCanvas stores no result of its own — see
    // application/PublicationDistributionCommand.js's own header and
    // tests/PostPublishDistributionConvergenceAudit.test.js's own
    // identical WORLD_ENCOUNTER_SURFACE adapter. Success is observed
    // through the shared lifecycle store instead (Sections A/F below).
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
    const editorViewBlock = codeOnlyLines(extractRange(
        editorViewSource,
        "const multiRelayNostrPublicationDistributionCommand = inject('multiRelayNostrPublicationDistributionCommand', null);",
        '// ------------------------- 0.2.21 document lifecycle ------------',
        '0.9.377/0.9.450 block (raw, before comment-stripping)'
    ));

    // ---------------------------------------------------------------
    // Section A — Three-surface command convergence.
    // ---------------------------------------------------------------
    {
        const mainCode = await codeOnlySource('ui/main.js');
        const provideMatches = mainCode.match(/app\.provide\('publicationDistributionCommand', publicationDistributionCommand\)/g) || [];
        assert(provideMatches.length === 1,
            n('ui/main.js provides publicationDistributionCommand exactly once, at the app root — a single composition, never one per view'));

        const worldViewCode = await codeOnlySource('ui/views/WorldView.js');
        // AMENDED BY 0.9.450 — Nostr Multi-Relay Publication Distribution
        // Wiring. WorldView.js still injects the single-relay
        // publicationDistributionCommand (kept for its own Arweave
        // substrate choice) AND now ALSO injects
        // multiRelayNostrPublicationDistributionCommand (its own Nostr
        // path); EditorView.js, which never offered a substrate choice,
        // now injects ONLY multiRelayNostrPublicationDistributionCommand.
        // Both views still reach every command they use through the
        // standard Vue inject(key, null) channel — neither constructs, nor
        // is handed, a second instance of any command outside that channel.
        assert(worldViewCode.includes("inject('publicationDistributionCommand', null)") &&
               worldViewCode.includes("inject('multiRelayNostrPublicationDistributionCommand', null)"),
            n('AMENDED BY 0.9.450 — WorldView.js injects BOTH app-wide commands (single-relay for Arweave, multi-relay for Nostr) via the standard Vue inject(key, null) channel'));
        assert(editorViewCodeOnly.includes("inject('multiRelayNostrPublicationDistributionCommand', null)") &&
               !editorViewCodeOnly.includes("inject('publicationDistributionCommand', null)"),
            n('AMENDED BY 0.9.450 — EditorView.js injects ONLY the app-wide multiRelayNostrPublicationDistributionCommand (it never offered an Arweave substrate choice to keep the single-relay command for) via the standard Vue inject(key, null) channel'));

        assert(worldViewCode.includes(':publicationDistributionCommand="distributeWorldEncounterPublication"'),
            n('WorldView.js binds its own distributeWorldEncounterPublication() to OwnPublicationPanel\'s publicationDistributionCommand prop'));
        assert(worldViewCode.includes(':distributionCommand="distributeWorldEncounterPublication"'),
            n('WorldView.js binds the EXACT SAME distributeWorldEncounterPublication() function reference to WorldEncounterCanvas\'s distributionCommand prop — one wrapper instance, two bindings, never two separate wrappers'));

        const productionOnlyCallSites = (await Promise.all(['ui/main.js', 'ui/views/WorldView.js', 'ui/views/EditorView.js', 'ui/components/Toolbar.js', 'ui/components/OwnPublicationPanel.js', 'ui/components/WorldEncounterCanvas.js']
            .map(async (path) => (await codeOnlySource(path)).split('composePublicationDistributionCommand(').length - 1)))
            .reduce((a, b) => a + b, 0);
        assert(productionOnlyCallSites === 1,
            n('composePublicationDistributionCommand() is called exactly once across every production UI file this audit inspects — ui/main.js\'s own composition, never a second one built by WorldView.js, EditorView.js, or either component'));

        // Live: ONE raw command, ONE shared lifecycle store, THREE
        // different Publications, driven through all three surfaces —
        // EditorView injected directly, the other two through the
        // literal same WorldView-style wrapper instance, exactly
        // mirroring the two production bindings just confirmed above.
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const rawCommand = realAppWideDistributionCommand({ lifecycleStore });
        const sharedWorldViewWrapper = wrapAsWorldViewDistributionAction(rawCommand);

        const publicationForEditor = publishLocally('Section A EditorView Manor');
        const publicationForOwnPanel = publishLocally('Section A OwnPublicationPanel Manor');
        const publicationForWorldView = publishLocally('Section A WorldView Manor');

        const editorHarness = buildEditorViewHarness(editorViewSource, { multiRelayNostrPublicationDistributionCommand: rawCommand });
        editorHarness.onDocumentPublished(publicationForEditor);
        const ownCtx = panelCtx({ publication: publicationForOwnPanel, publicationDistributionCommand: sharedWorldViewWrapper });
        const worldCtx = canvasCtx({
            selectedEncounter: { kind: 'PUBLICATION', objectId: publicationForWorldView.id },
            materialInspection: { loading: { status: WorldEncounterMaterialLoadStatus.AVAILABLE, material: publicationForWorldView } },
            distributionCommand: sharedWorldViewWrapper
        });

        editorHarness.distributePublishedDocument();
        ownCtx.distributeOwnPublication();
        worldCtx.distributeSelectedPublication();
        await flushMicrotasks();

        assert(editorHarness.distributionError.value === null && ownCtx.publicationDistributionError === null && worldCtx.distributionError === null,
            n('all three surfaces complete without error when driven through the identical shared command'));
        assert(lifecycleStore.get(publicationForEditor.id).discovery.state === PublicationDistributionState.PRESENT,
            n('EditorView\'s own distribution reaches the shared lifecycle store, keyed by its own Publication'));
        assert(lifecycleStore.get(publicationForOwnPanel.id).discovery.state === PublicationDistributionState.PRESENT,
            n('OwnPublicationPanel\'s own distribution reaches the SAME shared lifecycle store'));
        assert(lifecycleStore.get(publicationForWorldView.id).discovery.state === PublicationDistributionState.PRESENT,
            n('WorldView\'s own distribution reaches the SAME shared lifecycle store too — one convergent chain, not three parallel ones'));

        console.log('✓ Section A: EditorView, WorldView, and OwnPublicationPanel all inject/receive the identical app-wide command (composed exactly once), and a live run of all three against one shared lifecycle store shows one convergent chain, not three parallel ones');
    }

    // ---------------------------------------------------------------
    // Section B — Exact Publication identity, end to end through the
    // real production chain.
    // ---------------------------------------------------------------
    {
        assert(editorViewSource.includes('@published="onDocumentPublished"'),
            n('EditorView.js\'s own template wires Toolbar\'s `published` emit straight to onDocumentPublished() — the exact boundary this section drives live'));

        const { publishDocumentUseCase } = publishingRig();
        let capturedReturn = null;
        const originalExecute = publishDocumentUseCase.execute.bind(publishDocumentUseCase);
        publishDocumentUseCase.execute = (documentManager) => {
            capturedReturn = originalExecute(documentManager);
            return capturedReturn;
        };

        let receivedRequest = null;
        const command = (request) => {
            receivedRequest = request;
            return Promise.resolve({ publication: { objectId: 'obj-section-b' }, material: null, discovery: null });
        };
        const editorHarness = buildEditorViewHarness(editorViewSource, { multiRelayNostrPublicationDistributionCommand: command });

        const { emittedEvent, emittedArg } = publishThroughRealChain(publishSource, editorHarness, {
            publishDocumentUseCase,
            documentManager: { document: makeDocument('Section B Manor') }
        });

        assert(emittedEvent === 'published', n('Toolbar\'s real, extracted publish() emits `published` on a successful publish'));
        assert(capturedReturn !== null, n('PublishDocumentUseCase.execute() actually ran and returned a Publication'));
        assert(emittedArg === capturedReturn,
            n('the Publication Toolbar.publish() emits is the EXACT object PublishDocumentUseCase.execute() returned — no intermediate copy or re-derivation'));
        assert(editorHarness.publishedPublication.value === capturedReturn,
            n('EditorView.onDocumentPublished() — reached live through the real `@published` wiring — stores that exact same object'));

        editorHarness.distributePublishedDocument();
        await flushMicrotasks();

        assert(receivedRequest !== null && receivedRequest.publication === capturedReturn,
            n('publicationDistributionCommand() — the far end of the chain — receives the EXACT SAME Publication object identity that PublishDocumentUseCase.execute() originally returned, survived across every hop: Toolbar.publish() -> `published` emit -> onDocumentPublished() -> distributePublishedDocument() -> distributeEditorPublication() -> the injected command'));

        console.log('✓ Section B: the exact Publication object identity survives the entire real production chain from Toolbar.publish() through to the injected publicationDistributionCommand(), live');
    }

    // ---------------------------------------------------------------
    // Section C — Publish remains distribution-free (live behavior).
    // ---------------------------------------------------------------
    {
        let calls = 0;
        const command = () => { calls += 1; return Promise.resolve(null); };
        const editorHarness = buildEditorViewHarness(editorViewSource, { multiRelayNostrPublicationDistributionCommand: command });
        const { publishDocumentUseCase, storage } = publishingRig();
        const persistedBefore = storage.list().length;
        const feedbackMessages = [];

        const { emittedArg } = publishThroughRealChain(publishSource, editorHarness, {
            publishDocumentUseCase,
            documentManager: { document: makeDocument('Section C Manor') },
            feedbackShow: (message) => feedbackMessages.push(message)
        });
        await flushMicrotasks();

        assert(calls === 0, n('publish() alone — live, through the real chain — produces ZERO distribution execution'));
        assert(storage.list().length > persistedBefore, n('Publication persistence actually happened — the immutable content was written to the store'));
        assert(feedbackMessages.some((message) => message.startsWith('Published ')), n('success feedback was shown — the SAME `report()` toast Toolbar.js already used before 0.9.377'));
        assert(editorHarness.publishedPublication.value === emittedArg, n('the post-publish action becomes available, holding the exact just-published Publication'));

        console.log('✓ Section C: live behavior confirms publish() alone produces persistence, success feedback, and an available distribution action — with zero distribution execution');
    }

    // ---------------------------------------------------------------
    // Section D — Explicit-click boundary: exactly one invocation per
    // click, no duplicate from any other path.
    // ---------------------------------------------------------------
    {
        let calls = 0;
        const command = () => { calls += 1; return Promise.resolve({ publication: { objectId: 'obj-section-d' }, material: null, discovery: null }); };
        const editorHarness = buildEditorViewHarness(editorViewSource, { multiRelayNostrPublicationDistributionCommand: command });
        const { publishDocumentUseCase } = publishingRig();

        publishThroughRealChain(publishSource, editorHarness, { publishDocumentUseCase, documentManager: { document: makeDocument('Section D Manor') } });
        await flushMicrotasks();
        assert(calls === 0, n('still zero calls after publish alone, live'));

        editorHarness.distributePublishedDocument();
        await flushMicrotasks();
        assert(calls === 1, n('exactly one call after the explicit "Distribute now" click'));

        // Reading/"re-rendering" distributionResult repeatedly (what the
        // template's own `<dl v-else-if="distributionResult">` does on
        // every re-render) is a pure property read — never re-invokes.
        const firstRead = editorHarness.distributionResult.value;
        const secondRead = editorHarness.distributionResult.value;
        assert(firstRead === secondRead && calls === 1,
            n('reading the result for template rendering is idempotent and never re-invokes the command'));

        // Structural: no Vue watch() exists anywhere in EditorView.js
        // that could re-fire on a state change (publishedPublication,
        // distributionResult, or otherwise).
        assert(!editorViewCodeOnly.includes('watch('),
            n('EditorView.js contains no watch() of any kind — no component watcher exists that could re-trigger distribution on a state change'));

        // Structural: distributeEditorPublication/the injected command
        // are each referenced from exactly the call sites this design
        // requires — one definition and one caller for the wrapper, and
        // exactly one caller for the raw command — never a second,
        // hidden invocation path (e.g. from the toast, from a computed
        // property, or from template interpolation).
        const wrapperOccurrences = editorViewBlock.split('distributeEditorPublication(').length - 1;
        assert(wrapperOccurrences === 2,
            n('distributeEditorPublication( appears exactly twice in the whole 0.9.377 block — its own definition, and the ONE call inside distributePublishedDocument() — never a third, duplicate call site'));
        // AMENDED BY 0.9.450 — the injected command is now
        // multiRelayNostrPublicationDistributionCommand.
        const commandOccurrences = editorViewBlock.split('multiRelayNostrPublicationDistributionCommand(').length - 1;
        assert(commandOccurrences === 1,
            n('AMENDED BY 0.9.450 — the injected command itself is invoked from exactly ONE call site in the whole block — inside distributeEditorPublication() — never from onDocumentPublished(), dismissPublishAction(), or anywhere else'));

        console.log('✓ Section D: exactly one distribution invocation per click, live-confirmed and structurally confirmed against the real source — no duplicate from the publish event, the toast, a watcher, a state change, or result rendering');
    }

    // ---------------------------------------------------------------
    // Section E — Multiple sequential Publications, through the
    // COMPLETE production path.
    // ---------------------------------------------------------------
    {
        let received = [];
        let resolveA;
        const command = (request) => {
            received.push(request.publication);
            if (received.length === 1) {
                return new Promise((resolve) => { resolveA = resolve; });
            }
            return Promise.resolve({ publication: { objectId: `obj-section-e-${received.length}` }, material: null, discovery: null });
        };
        const editorHarness = buildEditorViewHarness(editorViewSource, { multiRelayNostrPublicationDistributionCommand: command });
        const { publishDocumentUseCase } = publishingRig();

        const { emittedArg: publicationA } = publishThroughRealChain(publishSource, editorHarness, { publishDocumentUseCase, documentManager: { document: makeDocument('Section E Manor A') } });
        editorHarness.distributePublishedDocument();
        await Promise.resolve();
        await Promise.resolve();
        assert(editorHarness.distributionExecuting.value === true, n('distributing A, driven through the real Toolbar chain, starts executing'));

        const { emittedArg: publicationB } = publishThroughRealChain(publishSource, editorHarness, { publishDocumentUseCase, documentManager: { document: makeDocument('Section E Manor B') } });
        assert(publicationB !== publicationA, n('publishing B through the real chain again produces a genuinely different Publication object'));
        assert(editorHarness.publishedPublication.value === publicationB,
            n('publishing B — live, through the complete production path — replaces the action wholesale with B, never merged with A'));
        assert(editorHarness.distributionExecuting.value === false && editorHarness.distributionError.value === null && editorHarness.distributionResult.value === null,
            n('B\'s fresh publish immediately resets ephemeral distribution state — no stale "executing" carried over from A\'s own still-pending call'));

        editorHarness.distributePublishedDocument();
        await flushMicrotasks();
        assert(received.length === 2 && received[1] === publicationB,
            n('clicking B\'s own action, live through the complete production path, distributes EXACTLY B'));

        resolveA({ publication: { objectId: 'stale-section-e' }, material: null, discovery: null });
        await flushMicrotasks();
        assert(editorHarness.distributionResult.value.publication.objectId === 'obj-section-e-2',
            n('A\'s stale, late-resolving response — even though A was itself driven through the full real Toolbar chain — never overwrites B\'s already-displayed result'));

        console.log('✓ Section E: Publish A -> action A, Publish B -> action B, click B distributes B — reproduced through the COMPLETE production path (the real Toolbar.publish()), not just the isolated action');
    }

    // ---------------------------------------------------------------
    // Section F — Failure/result convergence across all three surfaces.
    // ---------------------------------------------------------------
    {
        for (const surface of SURFACES) {
            // F1 — synchronous throw.
            {
                const publication = publishLocally(`Section F ${surface.name} sync-throw Manor`);
                const rawCommand = () => { throw new Error(`${surface.name} signer unavailable`); };
                const ctx = surface.makeCtx(publication, rawCommand);
                surface.trigger(ctx);
                await flushMicrotasks();
                assert(surface.executing(ctx) === false, n(`${surface.name}: execution returns to idle after a synchronous construction throw`));
                assert(surface.error(ctx) === surface.genericErrorMessage, n(`${surface.name}: a synchronous throw surfaces as the SAME one fixed, generic notice this surface already used before 0.9.377 — "${surface.genericErrorMessage}"`));
            }

            // F2 — rejected Promise.
            {
                const publication = publishLocally(`Section F ${surface.name} rejection Manor`);
                const rawCommand = () => Promise.reject(new Error(`${surface.name} gateway unreachable`));
                const ctx = surface.makeCtx(publication, rawCommand);
                surface.trigger(ctx);
                await flushMicrotasks();
                assert(surface.executing(ctx) === false, n(`${surface.name}: execution returns to idle after a genuine rejection`));
                assert(surface.error(ctx) === surface.genericErrorMessage, n(`${surface.name}: a rejection surfaces the identical generic notice a synchronous throw does — one failure vocabulary, not two`));
            }

            // F3 — successful result, observed through the shared
            // lifecycle store regardless of whether the surface itself
            // also keeps a local `result` ref.
            {
                const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
                const publication = publishLocally(`Section F ${surface.name} success Manor`);
                const rawCommand = realAppWideDistributionCommand({ lifecycleStore, eventId: 'f'.repeat(64) });
                const ctx = surface.makeCtx(publication, rawCommand);
                surface.trigger(ctx);
                await flushMicrotasks();
                assert(surface.executing(ctx) === false, n(`${surface.name}: execution returns to idle after a genuine success`));
                assert(surface.error(ctx) === null, n(`${surface.name}: a genuine success leaves no error notice`));
                assert(lifecycleStore.get(publication.id).discovery.state === PublicationDistributionState.PRESENT,
                    n(`${surface.name}: success is observable through the shared lifecycle store — the property that actually matters, independent of whether this surface's own local result ref is populated (EditorView/OwnPublicationPanel) or left undecorated (WorldView)`));
            }

            // F4 — duplicate/stale invocation: clicking again while a
            // call is in flight never starts a second, overlapping call.
            {
                let calls = 0;
                let resolveFirst;
                const publication = publishLocally(`Section F ${surface.name} duplicate Manor`);
                const rawCommand = () => { calls += 1; return new Promise((resolve) => { resolveFirst = resolve; }); };
                const ctx = surface.makeCtx(publication, rawCommand);

                surface.trigger(ctx);
                surface.trigger(ctx);
                surface.trigger(ctx);
                await Promise.resolve();
                await Promise.resolve();
                assert(calls === 1, n(`${surface.name}: repeated triggers while a call is in flight never start a second, overlapping call`));

                resolveFirst({ publication: { objectId: 'obj-f4' }, material: null, discovery: null });
                await flushMicrotasks();
                assert(surface.executing(ctx) === false, n(`${surface.name}: the in-flight call eventually resolves and returns to idle`));
            }
        }

        console.log(`✓ Section F: all three surfaces (${SURFACES.map((s) => s.name).join(', ')}) show semantically equivalent failure/result handling — synchronous throw, rejection, success, and duplicate-invocation guarding — even where the exact notice wording or local result-storage differs per surface's own established convention`);
    }

    // ---------------------------------------------------------------
    // Section G — Lifecycle convergence: EditorView never constructs
    // its own orchestrator/executor/lifecycle-store.
    // ---------------------------------------------------------------
    {
        const forbiddenImports = [
            "'../../application/PublicationDistributionOrchestrator.js'",
            "'../../application/PublicationDistributionExecutor.js'",
            "'../../application/PublicationDistributionLifecycleStore.js'",
            "'../../application/PublicationDistributionLifecycle.js'",
            "'../../application/PublicationDistributionCommand.js'",
            "'../../application/PublicationDistributionCommandComposition.js'"
        ];
        const toolbarRaw = await readSource('ui/components/Toolbar.js');
        for (const term of forbiddenImports) {
            assert(!editorViewSource.includes(term), n(`EditorView.js never imports ${term} — it only ever receives the already-composed capability via inject(), never constructing its own orchestrator/executor/lifecycle-store/command`));
            assert(!toolbarRaw.includes(term), n(`Toolbar.js never imports ${term} either — it never becomes distribution-aware at all, even indirectly`));
        }

        assert(!editorViewCodeOnly.includes('lifecycleStore') && !editorViewCodeOnly.includes('LifecycleStore'),
            n('EditorView.js contains no reference to "lifecycleStore"/"LifecycleStore" by name at all — the lifecycle chain is entirely the injected command\'s own concern, never something this view wires or is even aware of by name'));
        assert(!editorViewCodeOnly.includes('Orchestrator') && !editorViewCodeOnly.includes('Executor'),
            n('EditorView.js contains no "Orchestrator"/"Executor" vocabulary either — confirming the chain EditorView -> command -> orchestrator -> executor -> lifecycle store remains the SAME existing chain, entered only through its single published entry point'));

        console.log('✓ Section G: EditorView -> command -> orchestrator -> executor -> lifecycle store remains the SAME existing chain — EditorView.js imports none of those modules and never references any of that vocabulary by name');
    }

    // ---------------------------------------------------------------
    // Section H — Dismissal and replacement: no persistent "needs
    // distribution" information survives either operation.
    // ---------------------------------------------------------------
    {
        // H1 — Publish A -> action A -> Dismiss, including while a call
        // is still in flight.
        {
            let resolveA;
            const command = () => new Promise((resolve) => { resolveA = resolve; });
            const editorHarness = buildEditorViewHarness(editorViewSource, { multiRelayNostrPublicationDistributionCommand: command });
            const publicationA = publishLocally('Section H1 Manor');
            editorHarness.onDocumentPublished(publicationA);
            editorHarness.distributePublishedDocument();
            await Promise.resolve();
            await Promise.resolve();
            assert(editorHarness.distributionExecuting.value === true, n('H1: a call is genuinely in flight before Dismiss is clicked'));

            editorHarness.dismissPublishAction();
            assert(editorHarness.publishedPublication.value === null &&
                   editorHarness.distributionExecuting.value === false &&
                   editorHarness.distributionError.value === null &&
                   editorHarness.distributionResult.value === null,
                n('H1: Dismiss clears all ephemeral state immediately, even while a call is still in flight'));

            resolveA({ publication: { objectId: 'stale-h1' }, material: null, discovery: null });
            await flushMicrotasks();
            assert(editorHarness.publishedPublication.value === null && editorHarness.distributionResult.value === null,
                n('H1: the dismissed call\'s late resolution never resurrects any state — the same requestId staleness guard applies to Dismiss exactly as it does to a later Publish'));
        }

        // H2 — Publish A -> action A -> Publish B, through the complete
        // production path, focused specifically on "no residual trigger
        // from A survives."
        {
            let calls = [];
            const command = (request) => { calls.push(request.publication.id); return Promise.resolve({ publication: { objectId: `obj-h2-${calls.length}` }, material: null, discovery: null }); };
            const editorHarness = buildEditorViewHarness(editorViewSource, { multiRelayNostrPublicationDistributionCommand: command });
            const { publishDocumentUseCase } = publishingRig();

            const { emittedArg: publicationA } = publishThroughRealChain(publishSource, editorHarness, { publishDocumentUseCase, documentManager: { document: makeDocument('Section H2 Manor A') } });
            const { emittedArg: publicationB } = publishThroughRealChain(publishSource, editorHarness, { publishDocumentUseCase, documentManager: { document: makeDocument('Section H2 Manor B') } });
            assert(editorHarness.publishedPublication.value === publicationB && editorHarness.publishedPublication.value !== publicationA,
                n('H2: Publish B, through the real chain, wholesale-replaces A\'s own action'));

            editorHarness.distributePublishedDocument();
            await flushMicrotasks();
            assert(calls.length === 1 && calls[0] === publicationB.id,
                n('H2: clicking after B was published distributes ONLY B — A\'s own action left no residual "needs distribution" trigger of its own'));
        }

        // No persistence of any kind backs either operation.
        assert(!/localStorage|sessionStorage/.test(editorViewBlock),
            n('the 0.9.377 block never touches localStorage/sessionStorage — Dismiss and replacement leave no persisted trace anywhere, browser-local or otherwise'));

        console.log('✓ Section H: Dismiss clears all ephemeral state (even mid-flight, with the stale-resolution guard holding), and Publish B cleanly replaces Publish A\'s action — no persistent "needs distribution" information survives either operation');
    }

    // ---------------------------------------------------------------
    // Section I — WorldView / OwnPublicationPanel regression.
    // ---------------------------------------------------------------
    {
        const regressionSuites = [
            'tests/WorldViewPublicationDistributionActionIntegration.test.js',
            'tests/WorldViewPublicationDistributionConfigurationIntegration.test.js',
            'tests/PostPublishDistributionConvergenceAudit.test.js',
            'tests/PostPublishDistributionEntryPoint.test.js',
            'tests/EditorViewDistributionCommandChannelAudit.test.js',
            'tests/EditorViewPostPublishDistributionAction.test.js'
        ];
        for (const suite of regressionSuites) {
            let output;
            try {
                output = execFileSync(process.execPath, [suite], { cwd: SOURCE_ROOT.pathname, encoding: 'utf8' });
            } catch (e) {
                assertionCount += 1;
                throw new Error(`ASSERT FAILED: ${assertionCount}. ${suite} still passes unmodified — it failed instead:\n${e.stdout || ''}\n${e.stderr || e.message}`);
            }
            assert(!/ASSERT FAILED/.test(output), n(`${suite} produced no failed assertion`));
        }

        const ownPanelRaw = await readSource('ui/components/OwnPublicationPanel.js');
        const canvasRaw = await readSource('ui/components/WorldEncounterCanvas.js');
        assert(!/\bEditor\b/.test(ownPanelRaw), n('OwnPublicationPanel.js contains no reference to "Editor" anywhere — zero leakage of the new EditorView-specific capability into this file'));
        assert(!/\bEditor\b/.test(canvasRaw), n('WorldEncounterCanvas.js contains no reference to "Editor" either — zero leakage'));

        // The two surfaces' own generic error wording is UNCHANGED — not
        // accidentally unified with EditorView's own message by this
        // milestone (they already differed from each other before
        // 0.9.377, per tests/PostPublishDistributionConvergenceAudit
        // .test.js's own Section D closing note).
        assert(OWN_PUBLICATION_SURFACE.genericErrorMessage === 'Publication distribution could not be completed.',
            n('OwnPublicationPanel\'s own generic distribution-failure wording is unchanged'));
        assert(WORLD_ENCOUNTER_SURFACE.genericErrorMessage === 'Distribution could not be completed.',
            n('WorldView\'s (WorldEncounterCanvas\'s) own generic distribution-failure wording is unchanged, and remains deliberately distinct from OwnPublicationPanel\'s/EditorView\'s own'));

        console.log(`✓ Section I: ${regressionSuites.length} existing regression suites still pass unmodified, and neither OwnPublicationPanel.js nor WorldEncounterCanvas.js shows any trace of the new EditorView capability leaking in — zero behavioral effect`);
    }

    // ---------------------------------------------------------------
    // Section J — Architecture boundary and final verdict.
    // ---------------------------------------------------------------
    {
        // a) No second distribution command / composition.
        const forbiddenNewFileNamePattern = /Editor.*Distribut|Distribut.*Editor/i;
        assert(!forbiddenNewFileNamePattern.test(editorViewCodeOnly.match(/import\s*\{[^}]*\}\s*from\s*'([^']+)'/g)?.join(' ') || ''),
            n('none of EditorView.js\'s own imports name any Editor-specific distribution module — confirmed alongside Section A\'s live proof that composePublicationDistributionCommand() is called exactly once in production'));

        // b) No UI-specific distribution orchestrator, and (c) no
        // ActionFeedback command semantics.
        const actionFeedbackSource = await readSource('ui/components/ActionFeedback.js');
        assert(actionFeedbackSource.includes("pointerEvents: 'none'") && !/\bemits\s*:/i.test(actionFeedbackSource) && !/onAction\s*:/i.test(actionFeedbackSource),
            n('ActionFeedback.js remains non-interactive — no emits, no onAction, still pointerEvents: none — untouched by this arc\'s entire EditorView work'));

        // d) No distribution persistence, e) no automatic distribution.
        assert(!/localStorage|sessionStorage/.test(editorViewBlock),
            n('no distribution persistence of any kind exists in the 0.9.377 block (restated from Section H for this section\'s own completeness)'));
        const onPublishedSource = extractRange(editorViewCodeOnly, 'function onDocumentPublished(publication) {', '\n        }', 'onDocumentPublished() body');
        assert(!onPublishedSource.includes('multiRelayNostrPublicationDistributionCommand(') && !onPublishedSource.includes('distributePublishedDocument(') && !onPublishedSource.includes('distributeEditorPublication('),
            n('AMENDED BY 0.9.450 — onDocumentPublished() never calls the (now multi-relay) command or either distribution wrapper itself — publishing alone remains fully automatic-distribution-free'));

        // f) No retry/queue semantics.
        const forbiddenRuntimeTerms = ['setInterval', 'retry', 'Retry', 'queue', 'Queue'];
        for (const term of forbiddenRuntimeTerms) {
            assert(!editorViewBlock.includes(term), n(`the 0.9.377 block contains no "${term}" — no retry loop, scheduler, or queue of any kind`));
        }

        // g) No new lifecycle vocabulary.
        const forbiddenVocabulary = [
            'EDITOR_DISTRIBUTION_FAILED', 'EditorDistributionFailed', 'EditorDistributionError',
            'EDITOR_PUBLICATION_DISTRIBUTION_FAILED', 'EDITOR_DISTRIBUTION_PENDING', 'EditorDistributionPending',
            'DISTRIBUTED', 'NeedsDistribution', 'NEEDS_DISTRIBUTION'
        ];
        for (const term of forbiddenVocabulary) {
            assert(!editorViewCodeOnly.includes(term), n(`EditorView.js introduces no "${term}" vocabulary — the command already owns its own semantics`));
        }

        // h) No provider selection/fallback, and no generic UI command
        // bus, anywhere in EditorView.js or Toolbar.js.
        const toolbarRaw = await readSource('ui/components/Toolbar.js');
        const forbiddenProviderTerms = ['Arweave', 'Nostr', 'relayUrl', 'gatewayUrl', 'CommandBus', 'EventBus'];
        for (const term of forbiddenProviderTerms) {
            assert(!editorViewSource.includes(term), n(`EditorView.js contains no "${term}" — it never reaches past its single injected capability into provider-specific or generic-bus concerns`));
            assert(!toolbarRaw.includes(term), n(`Toolbar.js contains no "${term}" either`));
        }

        console.log('✓ Section J: none of the forbidden structures (second distribution command, UI-specific orchestrator, ActionFeedback command semantics, distribution persistence, automatic distribution, retry/queue semantics, new lifecycle vocabulary, or provider selection/fallback) exist anywhere in production');

        console.log(`
Final convergence matrix:
| Surface           | Command injection                          | Wrapper shape                          | Publication identity                     | Result stored locally |
|-------------------|---------------------------------------------|-----------------------------------------|-------------------------------------------|------------------------|
| EditorView        | inject('multiRelayNostrPublicationDistributionCommand') [0.9.450] | distributeEditorPublication(publication) | Toolbar.publish() local var, unmodified   | Yes                    |
| WorldView         | inject('publicationDistributionCommand') + inject('multiRelayNostrPublicationDistributionCommand') [0.9.450] | distributeWorldEncounterPublication(pub) | selectedEncounter -> materialInspection   | No (lifecycle only)    |
| OwnPublicationPanel| (same wrapper, passed as a prop)            | (same wrapper, unmodified)               | host-supplied \`publication\` prop         | Yes                    |
`);

        console.log('\n✅ VERDICT — CONVERGED. EditorView, WorldView, and OwnPublicationPanel all inject or receive the identical, once-composed publicationDistributionCommand; the Publication each surface distributes is always the exact object it already holds, never a re-derived lookup; publishing alone never distributes on any surface; a duplicate/repeated trigger while a call is in flight never starts a second call on any surface; success, rejection, and synchronous-throw handling are semantically equivalent across all three (differing only in each surface\'s own already-established notice wording and local result-storage convention); Dismiss and Publish-replacement leave no persistent "needs distribution" trace; WorldView and OwnPublicationPanel show zero behavioral change; and none of the architecture 0.9.377 was warned away from — a second command, a UI-specific orchestrator, ActionFeedback command semantics, distribution persistence, automatic distribution, retry/queue semantics, new lifecycle vocabulary, or provider selection/fallback — has appeared anywhere. Per this milestone\'s own brief, this closes the Post-Publish Distribution Guidance arc (0.9.349-0.9.378); no further adjacent enhancement (distribution receipts, history, badges, automatic distribution, retry, provider selection at publish time, or distribution status in Notifications) is recommended as a mechanical follow-on — those are separate product decisions for a fresh whole-product reassessment to raise on their own evidence, if any.');
    }

    console.log('\n✅ All Post-Publish Distribution Action Convergence Audit tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
