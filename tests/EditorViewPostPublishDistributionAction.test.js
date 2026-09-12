import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

import { executePublicationDistributionCommand } from '../application/PublicationDistributionCommand.js';
import { composeMultiRelayNostrPublicationDistributionCommand } from '../application/PublicationDistributionCommandComposition.js';
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

// 0.9.377 — EditorView Post-Publish Distribution Action.
//
// 0.9.376's own audit (test-only, BUILD_NEXT) named a five-line scope:
// inject the existing app-wide `publicationDistributionCommand`, add a
// wrapper identical in shape to WorldView.js's own
// distributeWorldEncounterPublication(publication), and a minimal
// EditorView-owned action surface — never a change to ActionFeedback.js.
// This milestone builds exactly that:
//
//   Toolbar.publish()  (existing, UNCHANGED in what it decides — only a
//        │               new `published` emit carrying the exact
//        │               Publication it already holds locally)
//        ▼
//   EditorView#onDocumentPublished(publication)   (NEW — the ONLY writer
//        │                                          of publishedPublication)
//        │  user clicks "Distribute now"
//        ▼
//   EditorView#distributePublishedDocument()   (NEW — mirrors
//        │                                       OwnPublicationPanel.js's
//        │                                       own distributeOwnPublication()
//        │                                       exactly)
//        ▼
//   distributeEditorPublication(publication)   (NEW — mirrors WorldView.js's
//        │                                       own distributeWorldEncounterPublication()
//        │                                       byte-for-byte in shape)
//        ▼
//   publicationDistributionCommand(...)   (injected — the SAME app-wide
//                                           command WorldView.js/
//                                           OwnPublicationPanel.js already
//                                           call)
//
// Because ui/views/EditorView.js and ui/components/Toolbar.js both import
// `vue`, this repo's plain `node tests/*.test.js` runner cannot `import`
// them directly (see tests/ForkFailureUXConvergenceAudit.test.js's own
// header, and tests/EditorViewDistributionCommandChannelAudit.test.js,
// 0.9.376, for the identical constraint). This file uses the SAME
// established technique: extract the REAL, CURRENT source of the new
// 0.9.377 block out of EditorView.js by marker-to-marker slicing (never
// hand-retyped), wrap it in `new Function(...)` with fake `ref`/`inject`
// implementations matching Vue's own contract for exactly the calls this
// block makes, and execute it against real and spy collaborators.
//
//   Section A — Command injection: EditorView receives the exact
//               app-wide command.
//   Section B — Successful publication: publish produces the action with
//               the exact returned Publication.
//   Section C — Exact identity: clicking the action passes the exact
//               Publication object, never a reconstructed equivalent.
//   Section D — Explicit action: simply publishing causes zero
//               distribution calls.
//   Section E — Successful distribution reaches the real
//               orchestrator/executor/lifecycle chain, end to end.
//   Section F — Distribution failure (rejection, synchronous throw, and
//               "no command supplied") preserves existing behavior.
//   Section G — Multiple publications: Publish A -> action A, Publish B
//               -> action B, click B must distribute B — no global "last
//               Publication" lookup, and a stale in-flight response from
//               A never leaks into B's own displayed state.
//   Section H — Existing WorldView path: unaffected, same command.
//   Section I — Unpublish/lifecycle interaction: a rejection surfaces
//               through the existing generic vocabulary, never a new one.
//   Section J — Regression: existing Publication Distribution test files
//               still pass, run live as real subprocesses.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
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
    assert(start !== -1, `${label || startMarker}: start marker located in source`);
    const end = source.indexOf(endMarker, start);
    assert(end !== -1, `${label || startMarker}: end marker located after start`);
    return source.slice(start, end);
}

async function flushMicrotasks() {
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let i = 0; i < 5; i++) {
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

function publishLocally(title) {
    const storage = new InMemoryStorageProvider();
    const alice = new LocalIdentityProvider(storage);
    alice.login('alice');
    const publishUseCase = new PublishDocumentUseCase(new LocalPublisherProvider(storage, new LocalContentStore(storage)), alice);
    return publishUseCase.execute({ document: makeDocument(title) });
}

function gatewayResponse(body, { status = 200 } = {}) {
    return new Response(body, { status });
}

// AMENDED BY 0.9.450 — Nostr Multi-Relay Publication Distribution Wiring.
// EditorView.js's own injected command changed from the single-relay
// `publicationDistributionCommand` to `multiRelayNostrPublicationDistributionCommand`
// (see that file's own 0.9.450 amendment) — this helper is renamed and
// rebuilt to compose the REAL app-wide multi-relay command exactly the way
// `ui/main.js` composes it now, unmodified otherwise.
function realAppWideDistributionCommand({ lifecycleStore, transactionId = 'EditorActionTransactionId123456789', eventId = 'e'.repeat(64), gatewayHandler, relayHandler, nostrRelayUrls = ['wss://relay.example'] }) {
    const gateway = gatewayHandler || (() => gatewayResponse('accepted'));
    const relay = relayHandler || (() => ({ published: true, id: eventId }));
    return composeMultiRelayNostrPublicationDistributionCommand({
        lifecycleStore,
        arweaveUploaderOptions: {
            signer: { sign: async (material) => ({ id: transactionId, transaction: { data: material } }) },
            fetchImpl: async (url, options) => gateway(url, options)
        },
        nostrRelayUrls,
        nostrPublisherOptions: {
            discoveryTag: 'forkbuild-editor-post-publish-action',
            publishImpl: async (relayUrl, eventTemplate) => relay(relayUrl, eventTemplate)
        }
    });
}

// -----------------------------------------------------------------
// Harness — extracts the REAL, CURRENT 0.9.377 block (AMENDED BY 0.9.450)
// out of ui/views/EditorView.js (never hand-retyped) and executes it with
// fake `ref`/`inject` implementations matching exactly the calls that
// block makes: `ref(initial)` -> `{ value: initial }` (Vue's own contract
// for every read/write this block performs), `inject('multiRelayNostrPublicationDistributionCommand', null)`
// -> whatever command this harness was given, or `null`.
// -----------------------------------------------------------------
function buildHarness(editorViewSource, { multiRelayNostrPublicationDistributionCommand = null } = {}) {
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

async function run() {
    const editorViewSource = await readSource('ui/views/EditorView.js');
    const editorViewCodeOnly = codeOnlyLines(editorViewSource);

    // ---------------------------------------------------------------
    // Section A — Command injection: EditorView receives the exact
    // application-root command.
    // ---------------------------------------------------------------
    {
        const marker = () => Promise.resolve(null);
        const harness = buildHarness(editorViewSource, { multiRelayNostrPublicationDistributionCommand: marker });
        assert(harness.multiRelayNostrPublicationDistributionCommand === marker,
            '1. AMENDED BY 0.9.450 — EditorView\'s own injected multiRelayNostrPublicationDistributionCommand is the EXACT function instance handed in by the app root, never a copy or wrapper of it');

        const degraded = buildHarness(editorViewSource, { multiRelayNostrPublicationDistributionCommand: null });
        assert(degraded.multiRelayNostrPublicationDistributionCommand === null,
            '2. with no command provided (e.g. a headless/composition-less caller), EditorView degrades to null exactly like every other optional inject(key, null) in this file — never throws at setup time');

        console.log('✓ Section A: AMENDED BY 0.9.450 — EditorView receives the exact application-root multiRelayNostrPublicationDistributionCommand instance, and degrades to null when none is provided');
    }

    // ---------------------------------------------------------------
    // Section B — Successful publication: publish produces the action
    // with the exact returned Publication.
    // ---------------------------------------------------------------
    {
        const harness = buildHarness(editorViewSource, { multiRelayNostrPublicationDistributionCommand: () => Promise.resolve(null) });
        assert(harness.publishedPublication.value === null,
            '3. before any publish, publishedPublication is null — no action renders yet');

        const publication = publishLocally('Section B Manor');
        harness.onDocumentPublished(publication);

        assert(harness.publishedPublication.value === publication,
            '4. onDocumentPublished() — Toolbar\'s own @published handler — stores the EXACT Publication object handed to it, the direct return value of PublishDocumentUseCase.execute(), never a re-derived lookup');
        assert(harness.distributionExecuting.value === false && harness.distributionError.value === null && harness.distributionResult.value === null,
            '5. a fresh publish starts with clean ephemeral distribution state — no stale executing/error/result from a prior session');

        console.log('✓ Section B: a successful publish produces the action holding the exact returned Publication, with clean ephemeral state');
    }

    // ---------------------------------------------------------------
    // Section C — Exact identity: clicking the action passes the exact
    // Publication object, never a reconstructed equivalent.
    // ---------------------------------------------------------------
    {
        let received = null;
        const command = (request) => { received = request; return Promise.resolve({ publication: { objectId: 'obj-1' }, material: null, discovery: null }); };
        const harness = buildHarness(editorViewSource, { multiRelayNostrPublicationDistributionCommand: command });

        const publication = publishLocally('Section C Manor');
        harness.onDocumentPublished(publication);
        harness.distributePublishedDocument();
        await flushMicrotasks();

        assert(received !== null, '6. clicking the action actually invokes the injected command');
        assert(received.publication === publication,
            '7. the command receives the EXACT same Publication object reference — object identity, not merely a structurally-equal reconstruction');
        assert(received.serializedMaterial === JSON.stringify(publication.toJSON()),
            '8. the ONE extra field this wrapper adds (serializedMaterial) is derived from that same exact object, mirroring WorldView.js\'s own distributeWorldEncounterPublication() request shape exactly');

        console.log('✓ Section C: clicking "Distribute now" forwards the exact Publication object identity into the injected command\'s request');
    }

    // ---------------------------------------------------------------
    // Section D — Explicit action: simply publishing causes zero
    // distribution calls.
    // ---------------------------------------------------------------
    {
        let calls = 0;
        const command = () => { calls += 1; return Promise.resolve(null); };
        const harness = buildHarness(editorViewSource, { multiRelayNostrPublicationDistributionCommand: command });

        const publication = publishLocally('Section D Manor');
        harness.onDocumentPublished(publication);
        await flushMicrotasks();

        assert(calls === 0,
            '9. onDocumentPublished() — the exact live effect of a successful publish reaching EditorView — never itself calls publicationDistributionCommand; distribution only happens on the later, separate, explicit click this milestone\'s own brief requires');

        // Structural: onDocumentPublished()'s own body never calls
        // distributePublishedDocument() or the injected command directly
        // — confirmed against the REAL, extracted source text, not
        // merely the live behavior above.
        const onPublishedSource = extractRange(editorViewCodeOnly,
            'function onDocumentPublished(publication) {', '\n        }',
            'onDocumentPublished() body');
        assert(!onPublishedSource.includes('multiRelayNostrPublicationDistributionCommand(') && !onPublishedSource.includes('distributePublishedDocument(') && !onPublishedSource.includes('distributeEditorPublication('),
            '10. AMENDED BY 0.9.450 — the REAL, extracted onDocumentPublished() source never calls the (now multi-relay) command or either distribution wrapper itself');

        // Toolbar.js's own publish() still performs no distribution I/O
        // and never calls anything distribution-shaped itself — mirrors
        // tests/EditorViewDistributionCommandChannelAudit.test.js's own
        // Section G, reconfirmed after this milestone's own Toolbar.js
        // edit (the new `published` emit).
        const toolbarCode = await codeOnlySource('ui/components/Toolbar.js');
        const publishFn = toolbarCode.match(/function publish\(\)\s*\{[\s\S]*?\n {8}\}/)[0];
        for (const term of ['fetch(', 'WebSocket', 'PublicationDistribution', 'ArweaveContentStore', 'Nostr', 'distribute']) {
            assert(!publishFn.includes(term), `11. Toolbar.js's own publish() still contains no "${term}" — publishing itself performs zero distribution I/O and never references distribution at all, even after gaining the new \`published\` emit`);
        }
        assert(publishFn.includes("emit('published', publication)"),
            '12. Toolbar.js\'s own publish() DOES forward the exact local Publication via the new `published` emit — the one and only new thing publish() itself does');

        console.log('✓ Section D: publishing alone — live and structurally — causes zero distribution calls; only an explicit later click does');
    }

    // ---------------------------------------------------------------
    // Section E — Successful distribution reaches the real
    // orchestrator/executor/lifecycle chain, end to end.
    // ---------------------------------------------------------------
    {
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const publication = publishLocally('Section E Manor');
        const harness = buildHarness(editorViewSource, {
            multiRelayNostrPublicationDistributionCommand: realAppWideDistributionCommand({ lifecycleStore })
        });

        harness.onDocumentPublished(publication);
        harness.distributePublishedDocument();
        assert(harness.distributionExecuting.value === true, '13. clicking the action enters executing state synchronously');

        await flushMicrotasks();

        assert(harness.distributionExecuting.value === false, '14. execution returns to idle once the real command resolves');
        assert(harness.distributionError.value === null, '15. a genuine successful distribution leaves no error notice');
        // AMENDED BY 0.9.450 — the real command is now the multi-relay one,
        // resolving an ARRAY of PublicationDistributionResult (one per
        // configured relay — here, a single-relay array, since
        // realAppWideDistributionCommand() defaults to one relay).
        assert(Array.isArray(harness.distributionResult.value) && harness.distributionResult.value.length === 1
            && harness.distributionResult.value[0].discovery && harness.distributionResult.value[0].discovery.id === 'e'.repeat(64),
            '16. AMENDED BY 0.9.450 — the real orchestrator/executor/lifecycle chain is reached end to end — a real PublicationDistributionResult, wrapped in a one-element array (one configured relay), is stored, live');
        assert(lifecycleStore.get(publication.id).discovery.state === PublicationDistributionState.PRESENT,
            '17. the SAME app-wide lifecycle store a distribution triggered elsewhere (WorldView/OwnPublicationPanel) would also observe now holds this real transition');

        console.log('✓ Section E: clicking "Distribute now" reaches the REAL command/orchestrator/executor/lifecycle-store chain end to end, live');
    }

    // ---------------------------------------------------------------
    // Section F — Distribution failure (rejection, synchronous throw,
    // and "no command supplied") preserves existing behavior.
    // ---------------------------------------------------------------
    {
        // F1 — a genuine rejection.
        {
            const publication = publishLocally('Section F1 Manor');
            const harness = buildHarness(editorViewSource, {
                multiRelayNostrPublicationDistributionCommand: () => Promise.reject(new Error('gateway unreachable'))
            });
            harness.onDocumentPublished(publication);
            harness.distributePublishedDocument();
            await flushMicrotasks();

            assert(harness.distributionExecuting.value === false, '18. execution returns to idle after a rejection');
            assert(harness.distributionError.value === 'Publication distribution could not be completed.',
                '19. a genuine rejection becomes the SAME one fixed, generic notice OwnPublicationPanel.js\'s own distributeOwnPublication() already uses — never a distinct, editor-specific string');
            assert(harness.distributionResult.value === null, '20. a failed call never leaves a stale result behind');
        }

        // F2 — a synchronous construction throw (e.g. missing signer/relay
        // configuration) is caught exactly like an asynchronous rejection
        // — mirrors tests/WorldViewPublicationDistributionActionIntegration
        // .test.js's own Section D, one caller over.
        {
            const publication = publishLocally('Section F2 Manor');
            const harness = buildHarness(editorViewSource, {
                multiRelayNostrPublicationDistributionCommand: () => { throw new Error('signer is required'); }
            });
            harness.onDocumentPublished(publication);
            harness.distributePublishedDocument();
            await flushMicrotasks();

            assert(harness.distributionExecuting.value === false, '21. execution returns to idle after a synchronous throw');
            assert(harness.distributionError.value === 'Publication distribution could not be completed.',
                '22. a synchronous construction throw surfaces the SAME generic notice a rejection would');
        }

        // F3 — no command supplied at all: the action stays entirely
        // inert, never fabricating an error.
        {
            const publication = publishLocally('Section F3 Manor');
            const harness = buildHarness(editorViewSource, { multiRelayNostrPublicationDistributionCommand: null });
            harness.onDocumentPublished(publication);
            harness.distributePublishedDocument();
            await flushMicrotasks();

            assert(harness.distributionExecuting.value === false, '23. with no command supplied, the action never enters executing state');
            assert(harness.distributionError.value === null, '24. ...and never fabricates an error either — it is simply inert');
        }

        // F4 — repeated clicks while a call is in flight never start a
        // second, overlapping call.
        {
            let calls = 0;
            let resolveFirst;
            const publication = publishLocally('Section F4 Manor');
            const harness = buildHarness(editorViewSource, {
                multiRelayNostrPublicationDistributionCommand: () => { calls += 1; return new Promise((resolve) => { resolveFirst = resolve; }); }
            });
            harness.onDocumentPublished(publication);

            harness.distributePublishedDocument();
            harness.distributePublishedDocument();
            harness.distributePublishedDocument();
            await Promise.resolve();
            await Promise.resolve();
            assert(calls === 1, '25. clicking "Distribute now" repeatedly while a call is in flight never starts a second, overlapping call');

            resolveFirst({ publication: { objectId: 'obj-f4' }, material: null, discovery: null });
            await flushMicrotasks();
            assert(harness.distributionExecuting.value === false, '26. the in-flight call eventually resolves and returns to idle');

            harness.distributePublishedDocument();
            await Promise.resolve();
            await Promise.resolve();
            assert(calls === 2, '27. once idle again, a fresh click starts a new call');
        }

        console.log('✓ Section F: existing distribution failure behavior (rejection, synchronous throw, no-command inertness, and duplicate-click guarding) is preserved exactly');
    }

    // ---------------------------------------------------------------
    // Section G — Multiple publications: no global "last Publication"
    // lookup, and a stale in-flight response never leaks across
    // Publications.
    // ---------------------------------------------------------------
    {
        let received = [];
        let resolveA;
        const command = (request) => {
            received.push(request.publication);
            if (received.length === 1) {
                return new Promise((resolve) => { resolveA = resolve; });
            }
            return Promise.resolve({ publication: { objectId: `obj-${received.length}` }, material: null, discovery: null });
        };
        const harness = buildHarness(editorViewSource, { multiRelayNostrPublicationDistributionCommand: command });

        const publicationA = publishLocally('Section G Manor A');
        const publicationB = publishLocally('Section G Manor B');

        // Publish A -> action A -> click (starts, never resolves yet).
        harness.onDocumentPublished(publicationA);
        harness.distributePublishedDocument();
        await Promise.resolve();
        await Promise.resolve();
        assert(harness.distributionExecuting.value === true, '28. distributing A starts executing');

        // Publish B BEFORE A's own call ever resolves — supersedes A's
        // action wholesale, including its in-flight ephemeral state.
        harness.onDocumentPublished(publicationB);
        assert(harness.publishedPublication.value === publicationB,
            '29. a second publish replaces publishedPublication with the NEW exact Publication — never merged with, or derived from, the first');
        assert(harness.distributionExecuting.value === false && harness.distributionError.value === null && harness.distributionResult.value === null,
            '30. the fresh publish immediately resets ephemeral distribution state — no stale "executing" carried over from A\'s own still-pending call');

        // Click B's own action — must distribute B, never A, and never a
        // globally-remembered "last Publication."
        harness.distributePublishedDocument();
        await flushMicrotasks();
        assert(received.length === 2 && received[1] === publicationB,
            '31. clicking B\'s own action calls the command with EXACTLY publicationB — the object this specific action was created for, never a global "last Publication" lookup');
        assert(harness.distributionResult.value && harness.distributionResult.value.publication.objectId === 'obj-2',
            '32. B\'s own click produces B\'s own result');

        // A's stale call finally resolves — it must never retroactively
        // affect the now-current (B's) displayed state.
        resolveA({ publication: { objectId: 'stale-obj-a' }, material: null, discovery: null });
        await flushMicrotasks();
        assert(harness.distributionResult.value.publication.objectId === 'obj-2',
            '33. A\'s own stale, late-resolving response never overwrites B\'s already-displayed result — no cross-talk between two Publications\' own action state');

        console.log('✓ Section G: Publish A -> action A, Publish B -> action B, click B distributes B — no global "last Publication" lookup, and A\'s stale response never leaks into B\'s state');
    }

    // ---------------------------------------------------------------
    // Section H — Existing WorldView path: unaffected, same command.
    // ---------------------------------------------------------------
    {
        const worldViewCode = await codeOnlySource('ui/views/WorldView.js');
        assert(worldViewCode.includes("inject('publicationDistributionCommand', null)"),
            '34. WorldView.js still injects the SAME app-wide publicationDistributionCommand, unmodified by this milestone');
        // AMENDED BY 0.9.430 — Announcement/Discovery Provider Selection
        // Reachability. distributeWorldEncounterPublication() gained a new,
        // optional discoveryProvider parameter — this milestone's own
        // EditorView wrapper (Section E, above) still mirrors whatever
        // SHAPE WorldView.js's own wrapper currently has; 0.9.430 amends
        // both together, never one without the other.
        assert(worldViewCode.includes('function distributeWorldEncounterPublication(publication, discoveryProvider)') &&
               worldViewCode.includes('return publicationDistributionCommand({') &&
               worldViewCode.includes('serializedMaterial: JSON.stringify(publication.toJSON())'),
            '35. WorldView.js\'s own distributeWorldEncounterPublication() is unchanged except for 0.9.430\'s own discoveryProvider parameter — this milestone\'s EditorView wrapper mirrors its SHAPE, never edits it');

        const mainCode = await codeOnlySource('ui/main.js');
        const provideMatches = mainCode.match(/app\.provide\('publicationDistributionCommand', publicationDistributionCommand\)/g) || [];
        assert(provideMatches.length === 1,
            '36. ui/main.js still provides publicationDistributionCommand exactly once, at the app root — EditorView reading it a second time cannot cause a second instance to be constructed');

        // EditorView.js's own wrapper is structurally the SAME shape as
        // WorldView.js's — same request fields, same guard, same
        // rejection message — confirmed against the real extracted
        // source text of both. AMENDED BY 0.9.450: EditorView.js's own
        // command is now multiRelayNostrPublicationDistributionCommand
        // (never a substrate choice, since this view offers none — see
        // that file's own 0.9.450 amendment), the SAME command
        // WorldView.js's own wrapper calls on its own Nostr branch.
        const editorWrapper = extractRange(editorViewCodeOnly,
            'function distributeEditorPublication(publication) {', '\n        }',
            'distributeEditorPublication() body');
        assert(editorWrapper.includes('multiRelayNostrPublicationDistributionCommand({') && editorWrapper.includes('serializedMaterial: JSON.stringify(publication.toJSON())'),
            '37. AMENDED BY 0.9.450 — EditorView.js\'s own distributeEditorPublication() calls the injected multi-relay command with the identical request shape WorldView.js\'s own wrapper uses on its own Nostr branch');

        console.log('✓ Section H: WorldView.js\'s own Publication Distribution path is completely unaffected, and EditorView\'s new wrapper mirrors its exact shape without editing it');
    }

    // ---------------------------------------------------------------
    // Section I — Unpublish/lifecycle interaction: a rejection surfaces
    // through the existing generic vocabulary, never a new one.
    // ---------------------------------------------------------------
    {
        // Models "the Publication was subsequently unpublished/removed":
        // the real orchestrator chain rejects on an invalid/incomplete
        // request the same way it would for a Publication the command
        // itself can no longer act on — this action invents no lifecycle
        // classification of its own; it just surfaces whatever the
        // command reports, through the SAME generic message every other
        // caller already uses.
        const publication = publishLocally('Section I Manor');
        const harness = buildHarness(editorViewSource, {
            multiRelayNostrPublicationDistributionCommand: () => Promise.reject(new Error('Publication is no longer available for distribution'))
        });
        harness.onDocumentPublished(publication);
        harness.distributePublishedDocument();
        await flushMicrotasks();

        assert(harness.distributionError.value === 'Publication distribution could not be completed.',
            '38. a rejection modeling an unpublished/unavailable Publication surfaces through the SAME existing generic message — never a bespoke "unpublished" notice invented by this view');

        const forbiddenVocabulary = [
            'EDITOR_DISTRIBUTION_FAILED', 'EditorDistributionFailed', 'EditorDistributionError',
            'EDITOR_PUBLICATION_DISTRIBUTION_FAILED', 'EDITOR_DISTRIBUTION_PENDING', 'EditorDistributionPending'
        ];
        for (const term of forbiddenVocabulary) {
            assert(!editorViewCodeOnly.includes(term), `39. EditorView.js introduces no "${term}" vocabulary — the command already owns its own semantics`);
        }

        console.log('✓ Section I: a Publication the command can no longer act on surfaces through the SAME existing generic failure vocabulary — no new lifecycle semantics invented');
    }

    // ---------------------------------------------------------------
    // Section J — Regression: existing Publication Distribution test
    // files still pass, run live as real subprocesses.
    // ---------------------------------------------------------------
    {
        const regressionSuites = [
            'tests/PublicationDistributionCommandComposition.test.js',
            'tests/WorldViewPublicationDistributionActionIntegration.test.js',
            'tests/WorldViewPublicationDistributionConfigurationIntegration.test.js',
            'tests/PostPublishDistributionEntryPoint.test.js',
            'tests/EditorViewDistributionCommandChannelAudit.test.js'
        ];
        for (const suite of regressionSuites) {
            let output;
            try {
                output = execFileSync(process.execPath, [suite], { cwd: SOURCE_ROOT.pathname, encoding: 'utf8' });
            } catch (e) {
                throw new Error(`ASSERT FAILED: 40. ${suite} still passes unmodified — it failed instead:\n${e.stdout || ''}\n${e.stderr || e.message}`);
            }
            assert(!/ASSERT FAILED/.test(output), `40. ${suite} produced no failed assertion`);
        }

        // ActionFeedback.js stays exactly as passive and non-interactive
        // as 0.9.375 left it — this milestone's own key implementation
        // rule.
        const actionFeedbackSource = await readSource('ui/components/ActionFeedback.js');
        assert(actionFeedbackSource.includes("pointerEvents: 'none'") && !/onAction\s*:|actionCommand\s*:|emits\s*:/i.test(actionFeedbackSource),
            '41. ActionFeedback.js remains non-interactive — this milestone never touched it');

        console.log(`✓ Section J: ${regressionSuites.length} existing Publication Distribution test files still pass unmodified, and ActionFeedback.js remains untouched`);
    }

    console.log('\n✅ All EditorView Post-Publish Distribution Action tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
