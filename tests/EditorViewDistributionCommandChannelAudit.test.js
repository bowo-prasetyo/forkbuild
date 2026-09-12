import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

import { executePublicationDistributionCommand } from '../application/PublicationDistributionCommand.js';
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

// 0.9.376 — EditorView Distribution Command Channel Audit.
//
// **Type: test-only, no production changes.** 0.9.375's own verdict
// (DEFER) rejected exactly one mechanism — a clickable action inside the
// existing publish-success notification (ActionFeedback.js) — and, in
// doing so, surfaced a different, more precise question that milestone
// deliberately left unbuilt: EditorView has Publish, has feedback, but
// has no distribution-command channel at all, while WorldView already
// has one. This milestone audits ONE question, precisely:
//
//   Is giving EditorView a narrowly scoped Publication Distribution
//   command channel architecturally justified, and can it converge on
//   the exact existing distribution path — the same app-wide command
//   WorldView already calls — without creating a second distribution
//   architecture?
//
// Every section below is evidence gathered fresh against real,
// unmodified production source and real object graphs — the identical
// "reproduce the real seam, verify the reproduction is honest"
// discipline 0.9.346-0.9.349/0.9.375 already hold.
//
//   Section A — Trace the existing command; identify the smallest
//               callable contract EditorView could receive.
//   Section B — Publication identity: is the exact just-published
//               Publication available without a "find latest" step?
//   Section C — Caller-agnostic proof, at the import-graph level, not
//               merely the parameter-signature level.
//   Section D — Command-channel design options, compared against what
//               already exists in this codebase today.
//   Section E — Lifecycle timing: publish → persistence → feedback →
//               command availability, and unmount hygiene.
//   Section F — Failure semantics: does a third caller inherit the
//               existing vocabulary for free?
//   Section G — Local-first preservation: publish itself still performs
//               no distribution I/O, and never calls the command itself.
//   Section H — Existing WorldView behavior: structurally provably
//               unaffected by anything EditorView would do.
//   Section I — Scope and API pollution: one capability, not a bus.
//   Section J — Final decision matrix and verdict.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

function codeOnlyLines(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

async function codeOnlySource(relativePath) {
    return codeOnlyLines(await rawSource(relativePath));
}

function grepFiles(pattern, dirs) {
    try {
        const out = execSync(`grep -rl "${pattern}" ${dirs.join(' ')} --include="*.js" || true`,
            { cwd: SOURCE_ROOT.pathname }).toString().trim();
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

const PRODUCTION_DIRS = ['application', 'ui', 'core', 'publisher'];

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

function gatewayResponse(body, { status = 200 } = {}) {
    return new Response(body, { status });
}

// Builds the REAL app-wide `publicationDistributionCommand` exactly the
// way ui/main.js composes it (composePublicationDistributionCommand +
// executePublicationDistributionCommand, unmodified), so every section
// below calls the identical function shape a browser session would
// actually have injected — never a stand-in.
function realAppWideDistributionCommand({ lifecycleStore, transactionId = 'ChannelAuditTransactionId1234567', eventId = 'e'.repeat(64), gatewayHandler, relayHandler }) {
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
            discoveryTag: 'forkbuild-editor-channel-audit',
            publishImpl: async (relayUrl, eventTemplate) => relay(relayUrl, eventTemplate)
        }
    });
}

// Reproduces ui/views/WorldView.js's own distributeWorldEncounterPublication()
// VERBATIM (unchanged since 0.9.104/0.9.347) — the "smallest callable
// contract" this audit's Section A is asked to name. A hypothetical
// EditorView wrapper (Section D) would be this exact same body, with
// nothing about "World" in it anywhere.
function wrapAsPublicationDistributionCaller(appWideCommand) {
    return function distributePublication(publication) {
        if (!appWideCommand) {
            return Promise.reject(new Error('Publication distribution is not available.'));
        }
        return appWideCommand({
            publication,
            serializedMaterial: JSON.stringify(publication.toJSON())
        });
    };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — Trace the existing command; identify the smallest
    // callable contract EditorView could receive.
    // ---------------------------------------------------------------
    {
        const mainCode = await codeOnlySource('ui/main.js');
        const provideMatches = mainCode.match(/app\.provide\('publicationDistributionCommand', publicationDistributionCommand\)/g) || [];
        assert(provideMatches.length === 1,
            '1. ui/main.js provides publicationDistributionCommand exactly once, at the APP level (app.provide), not scoped to any route or view');
        assert(mainCode.includes('const publicationDistributionCommand = composePublicationDistributionCommand({'),
            '2. that app-wide instance is built by composePublicationDistributionCommand() — a named, independently testable composition, never an inline closure');

        const compositionCode = await codeOnlySource('application/PublicationDistributionCommandComposition.js');
        assert(compositionCode.includes("return (request) => executePublicationDistributionCommand({") && compositionCode.includes('...request,'),
            '3. composePublicationDistributionCommand() forwards its own request verbatim into the SAME executePublicationDistributionCommand() 0.9.103 already established, plus the three composition-root collaborators');

        const worldViewCode = await codeOnlySource('ui/views/WorldView.js');
        assert(worldViewCode.includes("inject('publicationDistributionCommand', null)"),
            '4. WorldView.js injects the app-wide command via inject(key, null) — the standard Vue provide/inject channel, not a bespoke one');
        // AMENDED BY 0.9.430 — Announcement/Discovery Provider Selection
        // Reachability. `discoveryProvider` joined this wrapper as a new,
        // optional second parameter, forwarded into the same request object
        // as a second added field — see `application/
        // PublicationDistributionRuntimeComposition.js`'s own header for why
        // that choice belongs at a caller boundary, never computed here.
        // The contract's own SHAPE is otherwise unchanged: still a plain,
        // non-`async` function calling exactly one thing.
        assert(worldViewCode.includes('function distributeWorldEncounterPublication(publication, discoveryProvider)') &&
               worldViewCode.includes('return publicationDistributionCommand({') &&
               worldViewCode.includes('serializedMaterial: JSON.stringify(publication.toJSON())'),
            '5. WorldView.js\'s own distributeWorldEncounterPublication(publication, discoveryProvider) is the smallest callable contract: a TWO-argument (publication, discoveryProvider) -> Promise function that adds exactly two fields (serializedMaterial, discoveryProvider) to the injected command\'s own request shape');

        // Live: the exact composition chain end to end, called through a
        // wrapper with the identical shape WorldView.js's own function
        // has — proving the "smallest callable contract" really is
        // callable, not just textually present.
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const appWideCommand = realAppWideDistributionCommand({ lifecycleStore });
        const caller = wrapAsPublicationDistributionCaller(appWideCommand);

        const storage = new InMemoryStorageProvider();
        const alice = new LocalIdentityProvider(storage);
        alice.login('alice');
        const publishUseCase = new PublishDocumentUseCase(new LocalPublisherProvider(storage, new LocalContentStore(storage)), alice);
        const publication = publishUseCase.execute({ document: makeDocument('Channel Audit Manor') });

        const result = await caller(publication);
        assert(result.discovery && result.discovery.id === 'e'.repeat(64) && lifecycleStore.get(publication.id).discovery.state === PublicationDistributionState.PRESENT,
            '6. calling the smallest contract end to end, live, reaches the REAL orchestrator/executor/lifecycle-store chain and produces a real, persisted lifecycle transition');

        console.log('✓ Section A: the existing command is provided exactly once, at the app level, and its smallest callable contract — a one-argument (publication) -> Promise wrapper — is live-proven end to end through the real orchestrator/executor/lifecycle-store chain');
    }

    // ---------------------------------------------------------------
    // Section B — Publication identity: is the exact just-published
    // Publication available without a "find latest" step?
    // ---------------------------------------------------------------
    {
        const toolbarCode = await codeOnlySource('ui/components/Toolbar.js');
        assert(/function publish\(\)\s*\{[\s\S]*?const publication = props\.publishDocumentUseCase\.execute\(props\.documentManager\);/.test(toolbarCode),
            '7. Toolbar.js\'s publish() — the Editor\'s own Publish button — holds the just-published Publication in a LOCAL variable, the direct return value of execute(), never a subsequent lookup');

        const worldViewRaw = await rawSource('ui/views/WorldView.js');
        assert(worldViewRaw.includes('session.getPublicationForDocument(activeId)'),
            '8. by contrast, WorldView.js\'s own path re-DERIVES ownPublication through session.getPublicationForDocument(activeId) inside refreshSpatialUI() — a real, working, but indirect "find latest publication for this document" step Toolbar.js\'s own path does not need at all');

        // Confirms EditorView's publishDocumentUseCase and WorldView's own
        // publish path are both built from the SAME PublishDocumentUseCase
        // class — never two divergent publish semantics for the two views.
        const createPublisherCode = await codeOnlySource('application/CreatePublisherUseCase.js');
        assert(createPublisherCode.includes('new PublishDocumentUseCase('),
            '9. EditorView\'s own publishDocumentUseCase (via CreatePublisherUseCase, injected in ui/views/EditorView.js) is a real PublishDocumentUseCase instance');
        const createWorldViewCode = await codeOnlySource('application/CreateWorldViewUseCase.js');
        assert(createWorldViewCode.includes('const publishDocumentUseCase = new PublishDocumentUseCase('),
            '10. World View\'s own publish path is composed from the SAME PublishDocumentUseCase class, not a parallel implementation — confirmed fresh');

        // Live: the publication actually returned is immediately usable
        // by the exact request shape the distribution command needs
        // (publication.toJSON()) — no additional field is missing, no
        // additional async step is required first.
        const storage = new InMemoryStorageProvider();
        const alice = new LocalIdentityProvider(storage);
        alice.login('alice');
        const publishUseCase = new PublishDocumentUseCase(new LocalPublisherProvider(storage, new LocalContentStore(storage)), alice);
        function toolbarPublish(documentManager) {
            // Reproduces Toolbar.js's own publish() body exactly.
            const publication = publishUseCase.execute(documentManager);
            return publication;
        }
        const publication = toolbarPublish({ document: makeDocument('Direct Identity Manor') });
        assert(typeof publication.id === 'string' && publication.id.length > 0,
            '11. the returned Publication carries a real id, live-confirmed');
        let serialized;
        try {
            serialized = JSON.stringify(publication.toJSON());
        } catch (e) {
            serialized = null;
        }
        assert(typeof serialized === 'string' && serialized.length > 0,
            '12. the SAME local `publication` variable Toolbar.publish() already holds serializes successfully with no further lookup — it is already exactly what the distribution command\'s own serializedMaterial field needs');

        console.log('✓ Section B: EditorView\'s own publish path already holds the exact Publication identity more DIRECTLY than World View\'s own existing path does (a local return value vs. a re-derived session lookup), live-confirmed against the shared PublishDocumentUseCase');
    }

    // ---------------------------------------------------------------
    // Section C — Caller-agnostic proof, at the import-graph level.
    // ---------------------------------------------------------------
    {
        const commandRaw = await rawSource('application/PublicationDistributionCommand.js');
        const signatureMatch = commandRaw.match(/export function executePublicationDistributionCommand\(\{([\s\S]*?)\} = \{\}\)/);
        assert(signatureMatch, '13. executePublicationDistributionCommand()\'s own destructured signature is found in source');
        const parameterNames = signatureMatch[1].split(',').map((p) => p.trim()).filter(Boolean);
        assert(parameterNames.every((p) => !/caller|surface|toast|invoker|view|world|editor/i.test(p)),
            `14. executePublicationDistributionCommand()'s own parameter list names no caller/surface/view-identifying field — found: ${JSON.stringify(parameterNames)}`);

        // Stronger than a signature check: the ENTIRE import graph behind
        // the app-wide command — command, orchestrator, lifecycle,
        // lifecycle transition, composition — imports nothing from ui/,
        // and mentions no WorldView/WorldEncounterCanvas/OwnPublicationPanel/
        // "encounter"/"selected" vocabulary anywhere in their own code.
        const chainFiles = [
            'application/PublicationDistributionCommand.js',
            'application/PublicationDistributionCommandComposition.js',
            'application/PublicationDistributionOrchestrator.js',
            'application/PublicationDistributionLifecycle.js',
            'application/PublicationDistributionLifecycleTransition.js'
        ];
        for (const file of chainFiles) {
            const code = await codeOnlySource(file);
            assert(!/from ['"].*\/ui\//.test(code) && !code.includes("from '../ui"),
                `15. ${file} imports nothing from ui/ — confirmed fresh`);
            assert(!/WorldView|WorldEncounterCanvas|OwnPublicationPanel|EditorView/.test(code),
                `16. ${file} names no specific UI view or component anywhere in its own code`);
        }

        console.log('✓ Section C: the existing distribution command is caller-agnostic not merely by its parameter signature but by its entire import graph — no file in the command/orchestrator/lifecycle chain imports anything from ui/ or names a specific view, live-confirmed across all five files');
    }

    // ---------------------------------------------------------------
    // Section D — Command-channel design options, compared against
    // what already exists in this codebase today.
    // ---------------------------------------------------------------
    {
        // Option 1 — direct prop via router registration.
        const routerCode = await codeOnlySource('ui/router/index.js');
        assert(!/props\s*:/.test(routerCode),
            '17. ui/router/index.js uses `props` on NO route, for ANY view — a router-level prop channel would be a brand-new pattern for the entire app, not a small addition scoped to EditorView alone');

        // Option 2 — session/application capability (Vue provide/inject).
        // Already the dominant existing pattern, and already how the
        // SAME command reaches WorldView.
        const editorViewRaw = await rawSource('ui/views/EditorView.js');
        const injectCalls = editorViewRaw.match(/inject\(('|")[a-zA-Z]+\1(,\s*null)?\)/g) || [];
        assert(injectCalls.length >= 9,
            `18. EditorView.js already calls inject() at least 9 times today for other app-wide capabilities (identityUseCase, publicationResolver, publicationCatalog, publicationPeerExchange, peerMessageBus, peerSessionManager, deviceAuthorizationUseCase, peerBlockUseCase, decentralizedPublicationDiscoveryProvider) — found ${injectCalls.length}`);
        const optionalInjectCalls = editorViewRaw.match(/inject\('[a-zA-Z]+',\s*null\)/g) || [];
        assert(optionalInjectCalls.length >= 4,
            `19. at least 4 of those already use the exact inject(key, null) optional/degrade-to-null shape a publicationDistributionCommand injection would use — found ${optionalInjectCalls.length}: ${JSON.stringify(optionalInjectCalls)}`);
        // 0.9.377 — EditorView Post-Publish Distribution Action closed
        // exactly the gap this section identified, using exactly the
        // option this section's own verdict recommended (Section J,
        // below): the identical inject(key, null) shape, never a new
        // channel. This assertion now confirms the closure rather than
        // the gap — the rest of this audit's own evidence (Sections A-C,
        // E-J) is unaffected, since none of it depended on the gap
        // staying open.
        assert(editorViewRaw.includes("inject('publicationDistributionCommand', null)"),
            '20. EditorView.js now injects publicationDistributionCommand — 0.9.377 closed the gap this section identified, using the exact inject(key, null) shape recommended below');

        // Option 3 — ActionFeedback as command carrier. Reconfirmed
        // absent and still architecturally rejected (0.9.375, Sections
        // C/I) — never revisited by this milestone.
        const actionFeedbackSource = await rawSource('ui/components/ActionFeedback.js');
        assert(actionFeedbackSource.includes("pointerEvents: 'none'") && !/onAction\s*:|actionCommand\s*:|emits\s*:/i.test(actionFeedbackSource),
            '21. ActionFeedback.js remains non-interactive with no onAction/actionCommand prop and no emits — Option 3 stays rejected, unrevisited by this milestone');

        console.log('✓ Section D: Option 1 (a router-level prop) would be an entirely new pattern for this app; Option 2 (Vue inject) is already how the SAME command reaches WorldView AND already EditorView\'s own dominant pattern for every other app-wide capability it uses; Option 3 stays correctly rejected — the smallest real option is also the one already in use everywhere else in this file');
    }

    // ---------------------------------------------------------------
    // Section E — Lifecycle timing: publish → persistence → feedback →
    // command availability, and unmount hygiene.
    // ---------------------------------------------------------------
    {
        const publishUseCaseCode = await codeOnlySource('application/PublishDocumentUseCase.js');
        assert(!/async |await |Promise/.test(publishUseCaseCode),
            '22. PublishDocumentUseCase.execute() is fully synchronous — no async, no await, no Promise anywhere in its own source');
        const localPublisherCode = await codeOnlySource('publisher/LocalPublisherProvider.js');
        assert(!/async /.test(localPublisherCode),
            '23. LocalPublisherProvider.publish() is fully synchronous too — a returned Publication is immediately, fully persisted the instant execute() returns, with no pending write');

        const toolbarCode = await codeOnlySource('ui/components/Toolbar.js');
        assert(/function publish\(\)\s*\{[\s\S]*?const publication = props\.publishDocumentUseCase\.execute\(props\.documentManager\);\s*report\(/.test(toolbarCode),
            '24. publish() computes the Publication and calls report() (which shows feedback) in the SAME synchronous function body — no race between persistence and feedback appearing');

        // Unmount hygiene: EditorView already disposes every subscription
        // AND clears its own feedback timer on teardown — the identical
        // discipline a hypothetical distribution wrapper would need no
        // NEW mechanism to join, since a distribution promise resolving
        // after unmount would be a harmless no-op write to a detached
        // ref, exactly the same class of event EditorView's own EXISTING
        // async action (publishInspectedAttributionToNetwork(), an
        // await'd network call writing to a ref afterward with no
        // requestId guard of its own) already tolerates today, live in
        // production, without incident.
        const editorViewRaw = await rawSource('ui/views/EditorView.js');
        const unmountBlock = editorViewRaw.match(/onBeforeUnmount\(\(\) => \{[\s\S]*?\n {8}\}\);/)[0];
        assert(unmountBlock.includes('clearTimeout(feedbackTimer)') && unmountBlock.includes('editorSession.dispose()'),
            '25. EditorView.js\'s own onBeforeUnmount() already clears its feedback timer and disposes editorSession — real, existing teardown discipline a new async action would simply inherit, not invent');
        assert(editorViewRaw.includes('async function publishInspectedAttributionToNetwork()') &&
               editorViewRaw.includes('const publication = await publicationResolver.publish({'),
            '26. EditorView.js already has a real async action (publishInspectedAttributionToNetwork) that awaits a network call and writes to component state afterward — a distribution action would be the SECOND such action, not the first, and inherits no new class of unmount risk');

        console.log('✓ Section E: publish → persistence → feedback is one synchronous call with no internal race; EditorView already holds the exact teardown discipline (timer clearing, session disposal) and already runs at least one other unguarded async network action after which state is written — a distribution wrapper introduces no new lifecycle-timing risk, live-confirmed');
    }

    // ---------------------------------------------------------------
    // Section F — Failure semantics: does a third caller inherit the
    // existing vocabulary for free?
    // ---------------------------------------------------------------
    {
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const storage = new InMemoryStorageProvider();
        const alice = new LocalIdentityProvider(storage);
        alice.login('alice');
        const publishUseCase = new PublishDocumentUseCase(new LocalPublisherProvider(storage, new LocalContentStore(storage)), alice);
        const publication = publishUseCase.execute({ document: makeDocument('Failure Semantics Manor') });

        const failingAppWideCommand = realAppWideDistributionCommand({
            lifecycleStore,
            gatewayHandler: () => { throw new Error('gateway unreachable'); }
        });
        const failingCaller = wrapAsPublicationDistributionCaller(failingAppWideCommand);
        let threw = false;
        try {
            await failingCaller(publication);
        } catch (e) {
            threw = true;
        }
        assert(threw, '27. the exact real command chain rejects on a genuine failure when called through the SAME one-argument wrapper contract a hypothetical EditorView caller would use');

        const panelCode = await codeOnlySource('ui/components/OwnPublicationPanel.js');
        assert(panelCode.includes("this.publicationDistributionError = 'Publication distribution could not be completed.'"),
            '28. the ONE existing UI-facing failure message stays a single fixed string — a fourth caller (a hypothetical EditorView surface) would reuse this exact string, never a distinct one, the same restraint 0.9.375 already confirmed for a third caller');

        const forbiddenFailureVocabulary = ['EDITOR_DISTRIBUTION_FAILED', 'EditorDistributionFailed', 'EditorDistributionError', 'EDITOR_PUBLICATION_DISTRIBUTION_FAILED'];
        for (const term of forbiddenFailureVocabulary) {
            const hits = await grepCodeOnlyFiles(term, PRODUCTION_DIRS);
            assert(hits.length === 0, `29. no "${term}" vocabulary exists anywhere in production`);
        }

        console.log('✓ Section F: a fourth caller of the exact existing command inherits its real rejection and its one fixed, generic failure message for free — live-confirmed — and no editor-specific failure vocabulary has been pre-built anywhere');
    }

    // ---------------------------------------------------------------
    // Section G — Local-first preservation: publish itself still
    // performs no distribution I/O, and never calls the command itself.
    // ---------------------------------------------------------------
    {
        const forbiddenIoTerms = ['fetch(', 'WebSocket', 'PublicationDistribution', 'ArweaveContentStore', 'Nostr'];
        const toolbarCode = await codeOnlySource('ui/components/Toolbar.js');
        const publishFn = toolbarCode.match(/function publish\(\)\s*\{[\s\S]*?\n {8}\}/)[0];
        for (const term of forbiddenIoTerms) {
            assert(!publishFn.includes(term), `30. Toolbar.js's own publish() contains no "${term}" — Publish itself performs zero distribution I/O`);
        }
        const publishUseCaseCode = await codeOnlySource('application/PublishDocumentUseCase.js');
        assert(!/Arweave|Nostr|Ipfs|Bitcoin|distribut/i.test(publishUseCaseCode),
            '31. PublishDocumentUseCase.js still carries no distribution vocabulary, reconfirmed fresh');

        // Structural: in WorldView.js today, publishActiveDocument() and
        // distributeWorldEncounterPublication() are two entirely separate
        // functions — publishing NEVER calls the distribution function
        // itself, only a later, explicit user click does (OwnPublicationPanel's
        // own @click="distributeOwnPublication"). A hypothetical
        // EditorView wrapper would hold the identical separation: this
        // audit's own Section A/D wrapper (distributePublication) is
        // never called from inside toolbarPublish()/publish() anywhere
        // above in this file, by construction — the same restraint,
        // live-demonstrated rather than merely asserted.
        const worldViewCode = await codeOnlySource('ui/views/WorldView.js');
        const publishActiveDocumentFn = worldViewCode.match(/function publishActiveDocument\(\)[\s\S]*?\n {8}\}/)[0];
        assert(!publishActiveDocumentFn.includes('distributeWorldEncounterPublication('),
            '32. WorldView.js\'s own publishActiveDocument() never calls distributeWorldEncounterPublication() itself — distribution only ever happens on a LATER, separate, explicit user action');

        console.log('✓ Section G: Publish remains local-first — no distribution I/O in the publish path itself, and the existing WorldView precedent (and this audit\'s own reproduction) both keep publishing and distributing as two entirely separate calls, crossed only by an explicit user click');
    }

    // ---------------------------------------------------------------
    // Section H — Existing WorldView behavior: structurally provably
    // unaffected by anything EditorView would do.
    // ---------------------------------------------------------------
    {
        const mainCode = await codeOnlySource('ui/main.js');
        const provideCount = (mainCode.match(/app\.provide\('publicationDistributionCommand'/g) || []).length;
        assert(provideCount === 1,
            '33. publicationDistributionCommand is provided exactly once, at the app root — a SECOND injector (EditorView) reads the SAME already-constructed instance, it cannot cause a second one to be built or the first to be reconstructed');

        const worldViewRaw = await rawSource('ui/views/WorldView.js');
        assert(!/\n {8}provide\('publicationDistributionCommand'/.test(worldViewRaw),
            '34. WorldView.js never locally re-provides publicationDistributionCommand under its own scope — it only ever injects the SAME app-level value, so nothing about WorldView\'s own supply of this capability could be shadowed or altered by another component injecting the identical key elsewhere in the tree');

        // Vue's provide/inject is a read-only fan-out from a single
        // provided value to any number of injectors — confirmed by the
        // fact that WorldEncounterCanvas AND OwnPublicationPanel already
        // both receive the SAME distributeWorldEncounterPublication
        // function reference today (0.9.375, Section D), with neither
        // affecting the other. A third and fourth reader (a hypothetical
        // EditorView inject() plus its own wrapper) is the identical
        // fan-out, one reader further — not a new mechanism.
        assert(worldViewRaw.includes(':publicationDistributionCommand="distributeWorldEncounterPublication"') &&
               worldViewRaw.includes(':distributionCommand="distributeWorldEncounterPublication"'),
            '35. WorldView.js already hands the SAME function reference to two different child components today — confirmed fresh — proving one provided command safely fans out to multiple independent callers with no cross-talk');

        console.log('✓ Section H: publicationDistributionCommand is a single app-level value with proven multi-reader fan-out already in production (two callers inside WorldView today) — an EditorView reader would be a third/fourth reader of the identical value, provably unable to alter what WorldView itself receives or does');
    }

    // ---------------------------------------------------------------
    // Section I — Scope and API pollution: one capability, not a bus.
    // ---------------------------------------------------------------
    {
        // The proposed capability, in full, mirrors WorldView.js's own
        // distributeWorldEncounterPublication() body exactly (Section A):
        // one inject() call plus a ~10-line wrapper function. Nothing
        // resembling a registry, dispatcher, or bus is required for it —
        // demonstrated by this audit's own wrapAsPublicationDistributionCaller()
        // helper above, used unchanged as both the WorldView-shaped AND
        // the hypothetical-EditorView-shaped caller in every section
        // above: literally the same function serves both, because
        // nothing view-specific is threaded through it anywhere.
        const forbiddenBusVocabulary = ['uiCommandManager', 'GlobalCommandBus', 'NotificationActionRouter', 'EditorCommandBus', 'EditorDistributionCommand', 'DistributionCommandRegistry'];
        for (const term of forbiddenBusVocabulary) {
            const hits = await grepCodeOnlyFiles(term, PRODUCTION_DIRS);
            assert(hits.length === 0, `36. no "${term}" vocabulary exists anywhere in production`);
        }

        // EditorActionRegistry already exists in this codebase — checked
        // explicitly so this audit doesn't mistake it for a half-built
        // generic command bus. Its own header scopes it to EDITING
        // actions (undo/redo, delete, rotate, align, selection, palette)
        // only — never publication distribution, never an app-wide
        // capability dispatcher.
        const registryHeader = (await rawSource('application/EditorActionRegistry.js')).split('\n').slice(0, 40).join('\n');
        assert(!/[Pp]ublication[Dd]istribution/.test(registryHeader),
            '37. EditorActionRegistry.js\'s own header names nothing about Publication Distribution — it is a scoped editing-action registry, not a generic command bus this milestone could or should reuse');

        console.log('✓ Section I: the proposed capability is exactly one inject() call plus the SAME small wrapper function WorldView.js already has — no registry, dispatcher, or bus vocabulary exists anywhere in production, and the codebase\'s one existing "registry" (EditorActionRegistry) is confirmed scoped to unrelated editing actions, not distribution');
    }

    // ---------------------------------------------------------------
    // Section J — Final decision matrix and verdict.
    // ---------------------------------------------------------------
    {
        console.log('');
        console.log('Final architectural decision matrix:');
        console.log('| Question                                                    | Finding                                                |');
        console.log('|--------------------------------------------------------------|----------------------------------------------------------|');
        console.log('| Smallest callable contract identifiable?                    | Yes — (publication) -> Promise, live-proven end to end    |');
        console.log('| Publication identity available without a lookup?           | Yes — MORE directly than WorldView\'s own existing path    |');
        console.log('| Command caller-agnostic at the import-graph level?          | Yes — zero ui/ imports anywhere in the command/lifecycle  |');
        console.log('|                                                              | chain, confirmed across all five files                    |');
        console.log('| Does the needed channel already exist as infrastructure?    | Yes — app.provide(\'publicationDistributionCommand\', ...) |');
        console.log('|                                                              | already runs at the app root, unconditionally              |');
        console.log('| Is inject() already EditorView\'s own dominant pattern?      | Yes — 9 existing calls, 4 in the identical (key, null) form|');
        console.log('| Lifecycle timing race-free?                                 | Yes — publish is fully synchronous; teardown already       |');
        console.log('|                                                              | disciplined; an unguarded async precedent already exists   |');
        console.log('| Failure semantics reusable with no new vocabulary?          | Yes — live-proven rejection + one fixed message            |');
        console.log('| Local-first invariant preserved?                            | Yes — publish and distribute remain two separate calls     |');
        console.log('| WorldView\'s own behavior providably unaffected?             | Yes — single provided value, proven multi-reader fan-out   |');
        console.log('| Scope contained to one capability, not a bus?               | Yes — no bus/registry/dispatcher vocabulary anywhere       |');
        console.log('');
        console.log('✓ Section J: VERDICT — BUILD_NEXT.');
        console.log('  Every question 0.9.375 left open resolves the same direction: the channel this milestone asked about is not merely');
        console.log('  "architecturally justified" in the abstract — it already exists as running infrastructure (ui/main.js\'s own');
        console.log('  app.provide(\'publicationDistributionCommand\', ...), unconditional, at the app root) and EditorView already uses the');
        console.log('  exact mechanism (Vue inject(key, null)) needed to reach it, nine times over, for nine other app-wide capabilities.');
        console.log('  Reaching it a tenth time requires no new provide call, no new composition-root wiring, no new router pattern, and no');
        console.log('  new failure vocabulary — only the SAME small wrapper function WorldView.js already has, reused verbatim in shape.');
        console.log('  Publication identity is, if anything, MORE directly available in EditorView\'s own Toolbar.publish() (a local return');
        console.log('  value) than in WorldView\'s own existing, already-shipped path (a re-derived session lookup) — so this is not a smaller');
        console.log('  or shakier version of what WorldView has, it converges on the identical command through an EASIER identity path.');
        console.log('');
        console.log('  RECOMMENDED SCOPE FOR THE NEXT MILESTONE (0.9.377):');
        console.log('    1. ui/views/EditorView.js: const publicationDistributionCommand = inject(\'publicationDistributionCommand\', null);');
        console.log('    2. A wrapper function, identical in shape to WorldView.js\'s own distributeWorldEncounterPublication(publication) —');
        console.log('       no new name pattern, no new request field.');
        console.log('    3. A minimal, EditorView-owned action surface (the smallest defensible option: mount OwnPublicationPanel scoped to');
        console.log('       the currently open document\'s own publication — the SAME component, the SAME props shape, WorldView already');
        console.log('       uses) — never a change to ActionFeedback.js, which stays exactly as non-interactive and passive as 0.9.375 left it.');
        console.log('    4. No new manager, queue, registry, or bus of any kind — this audit\'s own Section I already confirms none is needed.');
        console.log('');
        console.log('  This milestone builds none of that itself — it is test-only, per its own type. It hands the next milestone a scope');
        console.log('  narrow enough, and evidenced enough, that "the smallest possible EditorView capability injection" is no longer a');
        console.log('  proposal to evaluate but a concrete, five-line change to make.');

        console.log('\n✅ All EditorView Distribution Command Channel Audit tests passed.');
    }
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
