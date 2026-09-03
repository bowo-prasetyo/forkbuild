import { readFile } from 'node:fs/promises';
import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import { executePublicationDistributionCommand } from '../application/PublicationDistributionCommand.js';
import { PublicationDistributionLifecycleMemoryStore } from '../application/PublicationDistributionLifecycleStore.js';
import { PublicationDistributionState } from '../application/PublicationDistributionLifecycle.js';
import { WorldEncounterMaterialLoadStatus } from '../application/WorldEncounterMaterialLoading.js';
import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { Signature } from '../core/Signature.js';

// 0.9.104 — World View Publication Distribution Action.
//
// 0.9.100 wired OBSERVATION of a Publication's own distribution lifecycle
// into World View; 0.9.103 then built the one thing missing to actually
// PRODUCE a fresh one — `executePublicationDistributionCommand()` — and
// deliberately stopped short of any UI trigger. This milestone is that
// trigger: a "Distribute Publication" action on `WorldEncounterCanvas`'s
// own existing Distribution panel, calling exactly one caller-injected
// function — `distributionCommand`, `(publication) -> Promise` — with the
// same `Publication` domain object 0.9.39's own material inspection
// already loads. `ui/views/WorldView.js` supplies that function as a thin
// wrapper around the app-wide `publicationDistributionCommand` (0.9.103),
// adding only `serializedMaterial`; everything else the real request needs
// (signer/relay configuration) stays deliberately unsupplied, a separate,
// later milestone's own decision.
//
// Section A: FLAGSHIP — a real selection, real material inspection, a
//            real `distributionCommand` backed by the real
//            `executePublicationDistributionCommand()`/orchestrator/
//            executor with fake Arweave/Nostr collaborators, observed
//            through the SAME lifecycle store the Distribution panel
//            already watches.
// Section B: no distribution occurs without a selected, materially-loaded
//            Publication — the action is a no-op.
// Section C: a genuine rejection surfaces as a plain notice, and never
//            writes to the lifecycle store.
// Section D: a synchronous construction throw (malformed distribution
//            infrastructure) is caught exactly the same way as an
//            asynchronous rejection.
// Section E: repeated clicks while a call is in flight never start a
//            second, overlapping call.
// Section F: switching the selection resets ephemeral execution/error
//            state and ignores a stale in-flight response.
// Section G: no `distributionCommand` supplied — the action renders
//            nothing and stays entirely inert.
// Section H: architectural regression — WorldEncounterCanvas.js never
//            constructs distribution infrastructure, never touches the
//            store directly, and introduces no new lifecycle vocabulary.
// Section I: architectural regression — WorldView.js wires a thin wrapper
//            around the existing publicationDistributionCommand, forwards
//            it verbatim, and constructs no distribution infrastructure
//            itself.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function flushMicrotasks() {
    // The FLAGSHIP section's own distributionCommand runs the real
    // orchestrator/executor chain (several nested awaits across upload/
    // publish/describe/transition/store steps), which needs more turns of
    // the microtask queue than a single synthetic promise resolution would
    // — a couple of real setTimeout(0) turns is a simple, reliable way to
    // let all of it settle without hard-coding an exact tick count.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let i = 0; i < 10; i++) {
        await Promise.resolve();
    }
}

function signedPublication(overrides = {}) {
    const publication = new Publication({
        id: 'pub-action-1',
        documentId: 'doc-action-1',
        title: 'A World-View-Distributed Publication',
        author: 'author-1',
        contentReference: new ContentReference({ hash: 'legacy-hash', uri: 'ipfs://legacy-cid', storage: 'ipfs' }),
        ...overrides
    });
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

function realDistributionCommand({ lifecycleStore, transactionId = 'ActionTransactionId1234567890123456', eventId = 'e'.repeat(64), gatewayHandler, relayHandler }) {
    const gateway = gatewayHandler || (() => gatewayResponse('accepted'));
    const relay = relayHandler || (() => ({ published: true, id: eventId }));
    return (publication) => executePublicationDistributionCommand({
        publication,
        serializedMaterial: JSON.stringify(publication.toJSON()),
        arweaveUploaderOptions: {
            signer: { sign: async (material) => ({ id: transactionId, transaction: { data: material } }) },
            fetchImpl: async (url, options) => gateway(url, options)
        },
        nostrPublisherOptions: {
            relayUrl: 'wss://relay.example',
            discoveryTag: 'forkbuild-world-view-action',
            publishImpl: async (relayUrl, eventTemplate) => relay(relayUrl, eventTemplate)
        },
        lifecycleStore
    });
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
        // These are read by the pre-existing refresh methods this fake
        // context still calls through selectEncounter() — kept inert
        // (no registry/materialSources injected) so this test controls
        // `materialInspection` directly, exactly like the 0.9.100
        // integration test controls `distributionLifecycle` directly.
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
    Object.defineProperty(ctx, 'distributionMaterialState', {
        get() { return WorldEncounterCanvas.computed.distributionMaterialState.call(ctx); }
    });
    Object.defineProperty(ctx, 'distributionDiscoveryState', {
        get() { return WorldEncounterCanvas.computed.distributionDiscoveryState.call(ctx); }
    });
    return ctx;
}

async function runTests() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP.
    // ---------------------------------------------------------------
    {
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const publication = signedPublication();
        const ctx = canvasCtx({
            distributionLifecycleStore: lifecycleStore,
            distributionCommand: realDistributionCommand({ lifecycleStore })
        });

        ctx.selectedEncounter = { kind: 'PUBLICATION', objectId: publication.id };
        ctx.refreshDistributionLifecycle();
        ctx.materialInspection = {
            loading: { status: WorldEncounterMaterialLoadStatus.AVAILABLE, resolvedSelection: ctx.selectedEncounter, material: publication }
        };

        assert(ctx.distributablePublication === publication,
            '1. FLAGSHIP — distributablePublication is the exact loaded Publication object, forwarded from materialInspection');
        assert(ctx.distributionMaterialState === PublicationDistributionState.ABSENT,
            '2. FLAGSHIP — before distributing, the panel observes ABSENT, never a fabricated PRESENT');

        ctx.distributeSelectedPublication();
        assert(ctx.distributionExecuting === true, '3. FLAGSHIP — the action enters executing state synchronously on click');

        await flushMicrotasks();

        assert(ctx.distributionExecuting === false, '4. FLAGSHIP — execution returns to idle once the command resolves');
        assert(ctx.distributionError === null, '5. FLAGSHIP — a successful call leaves no error notice');

        // The click handler never wrote distributionLifecycle itself —
        // whatever is observed came entirely through the existing
        // distributionLifecycleStore subscription 0.9.100 already wired.
        assert(ctx.distributionMaterialState === PublicationDistributionState.PRESENT,
            '6. FLAGSHIP — the Distribution panel observes a real new fact, through the existing subscription alone');
        assert(ctx.distributionDiscoveryState === PublicationDistributionState.PRESENT,
            '7. FLAGSHIP — both dimensions are observed, real orchestrator/executor reached end to end');
        assert(lifecycleStore.get(publication.id).material.uri === `ar://ActionTransactionId1234567890123456`,
            '8. FLAGSHIP — the SAME app-wide lifecycle store the panel watches now holds the real result');

        console.log('✓ Flagship: a World View click reaches the real command/orchestrator/executor and the Distribution panel observes the result live');
    }

    // ---------------------------------------------------------------
    // Section B — no distribution without a selected, loaded Publication.
    // ---------------------------------------------------------------
    {
        let calls = 0;
        const ctx = canvasCtx({ distributionCommand: () => { calls += 1; return Promise.resolve(null); } });

        // No selection at all.
        ctx.distributeSelectedPublication();
        assert(calls === 0, '9. no selection — distributionCommand is never called');

        // A PUBLICATION selection, but material never loaded.
        ctx.selectedEncounter = { kind: 'PUBLICATION', objectId: 'pub-unloaded' };
        ctx.distributeSelectedPublication();
        assert(calls === 0, '10. selected but not materially loaded — distributionCommand is never called');

        // An AVATAR selection, even with something resembling material.
        ctx.selectedEncounter = { kind: 'AVATAR', objectId: 'avatar-1' };
        ctx.materialInspection = { loading: { status: WorldEncounterMaterialLoadStatus.AVAILABLE, material: {} } };
        ctx.distributeSelectedPublication();
        assert(calls === 0, '11. an AVATAR selection is never distributable, regardless of materialInspection');

        console.log('✓ No distribution occurs without an appropriately selected, materially-loaded Publication');
    }

    // ---------------------------------------------------------------
    // Section C — a genuine rejection surfaces as a plain notice, and the
    // store stays untouched.
    // ---------------------------------------------------------------
    {
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const publication = signedPublication({ id: 'pub-action-c' });
        const ctx = canvasCtx({
            distributionLifecycleStore: lifecycleStore,
            selectedEncounter: { kind: 'PUBLICATION', objectId: publication.id },
            materialInspection: { loading: { status: WorldEncounterMaterialLoadStatus.AVAILABLE, material: publication } },
            distributionCommand: () => Promise.reject(new Error('no wallet available'))
        });

        ctx.distributeSelectedPublication();
        await flushMicrotasks();

        assert(ctx.distributionExecuting === false, '12. execution returns to idle after a rejection');
        assert(ctx.distributionError === 'Distribution could not be completed.',
            '13. a genuine rejection becomes one plain, generic notice — never the underlying error message');
        assert(lifecycleStore.get(publication.id) === null,
            '14. a rejected call never corrupts or writes into the lifecycle store');

        console.log('✓ A genuine rejection surfaces as a plain notice, with the lifecycle store left untouched');
    }

    // ---------------------------------------------------------------
    // Section D — a synchronous construction throw is caught exactly the
    // same way as an asynchronous rejection.
    // ---------------------------------------------------------------
    {
        const publication = signedPublication({ id: 'pub-action-d' });
        const ctx = canvasCtx({
            selectedEncounter: { kind: 'PUBLICATION', objectId: publication.id },
            materialInspection: { loading: { status: WorldEncounterMaterialLoadStatus.AVAILABLE, material: publication } },
            distributionCommand: () => { throw new Error('signer is required'); }
        });

        ctx.distributeSelectedPublication();
        await flushMicrotasks();

        assert(ctx.distributionExecuting === false, '15. execution returns to idle after a synchronous throw');
        assert(ctx.distributionError === 'Distribution could not be completed.',
            '16. a synchronous construction throw is caught and surfaces the same generic notice a rejection would');

        console.log('✓ A synchronous construction throw is caught exactly like a genuine rejection');
    }

    // ---------------------------------------------------------------
    // Section E — repeated clicks never start a second, overlapping call.
    // ---------------------------------------------------------------
    {
        let calls = 0;
        let resolveFirst;
        const publication = signedPublication({ id: 'pub-action-e' });
        const ctx = canvasCtx({
            selectedEncounter: { kind: 'PUBLICATION', objectId: publication.id },
            materialInspection: { loading: { status: WorldEncounterMaterialLoadStatus.AVAILABLE, material: publication } },
            distributionCommand: () => { calls += 1; return new Promise((resolve) => { resolveFirst = resolve; }); }
        });

        ctx.distributeSelectedPublication();
        assert(ctx.distributionExecuting === true, '17a. the first click enters executing state synchronously');
        ctx.distributeSelectedPublication();
        ctx.distributeSelectedPublication();
        // Let the first (and only legitimate) call actually reach the
        // mock distributionCommand — its own increment happens inside a
        // microtask, one tick after distributeSelectedPublication() itself
        // returns.
        await Promise.resolve();
        await Promise.resolve();
        assert(calls === 1, '17. clicking repeatedly while a call is in flight never starts a second, overlapping call');

        resolveFirst(null);
        await flushMicrotasks();
        assert(ctx.distributionExecuting === false, '18. the in-flight call eventually resolves and returns to idle');

        ctx.distributeSelectedPublication();
        await Promise.resolve();
        await Promise.resolve();
        assert(calls === 2, '19. once idle again, a fresh click starts a new call');

        console.log('✓ Repeated clicks never create duplicate simultaneous executions');
    }

    // ---------------------------------------------------------------
    // Section F — switching selection resets ephemeral state and ignores
    // a stale in-flight response.
    // ---------------------------------------------------------------
    {
        let resolveStale;
        const publicationA = signedPublication({ id: 'pub-action-f-a' });
        const publicationB = signedPublication({ id: 'pub-action-f-b' });
        const ctx = canvasCtx({
            distributionCommand: () => new Promise((resolve) => { resolveStale = resolve; })
        });

        ctx.selectEncounter({ kind: 'PUBLICATION', objectId: publicationA.id });
        ctx.materialInspection = { loading: { status: WorldEncounterMaterialLoadStatus.AVAILABLE, material: publicationA } };
        ctx.distributeSelectedPublication();
        assert(ctx.distributionExecuting === true, '20. a call for publication A starts executing');
        // distributionCommand itself is invoked one microtask later (see
        // distributeSelectedPublication()'s own Promise.resolve().then()
        // wrapping) — let it actually run so resolveStale is captured
        // before the Wanderer switches selection below.
        await Promise.resolve();
        await Promise.resolve();

        // The Wanderer selects a different publication before A's own
        // call ever resolves.
        ctx.selectEncounter({ kind: 'PUBLICATION', objectId: publicationB.id });
        assert(ctx.distributionExecuting === false, '21. a fresh selection resets executing state immediately, without waiting for the stale call');
        assert(ctx.distributionError === null, '22. a fresh selection also clears any prior error notice');

        // A's own call finally resolves — its effect on ephemeral state
        // must never reach the new selection.
        resolveStale(null);
        await flushMicrotasks();
        assert(ctx.distributionExecuting === false, '23. the stale call\'s own resolution never re-enters executing state for the new selection');

        console.log('✓ Switching the selected Publication invalidates a stale in-flight distribution response');
    }

    // ---------------------------------------------------------------
    // Section G — no distributionCommand supplied.
    // ---------------------------------------------------------------
    {
        const publication = signedPublication({ id: 'pub-action-g' });
        const ctx = canvasCtx({
            selectedEncounter: { kind: 'PUBLICATION', objectId: publication.id },
            materialInspection: { loading: { status: WorldEncounterMaterialLoadStatus.AVAILABLE, material: publication } },
            distributionCommand: null
        });

        ctx.distributeSelectedPublication();
        assert(ctx.distributionExecuting === false, '24. with no distributionCommand supplied, the action never enters executing state');
        assert(ctx.distributionError === null, '25. ...and never fabricates an error either — it is simply inert');

        console.log('✓ No distributionCommand supplied — the action stays entirely inert');
    }

    // ---------------------------------------------------------------
    // Section H — architectural regression: WorldEncounterCanvas.js.
    // ---------------------------------------------------------------
    {
        const sourceUrl = new URL('../ui/components/WorldEncounterCanvas.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(!/ArweavePublicationMaterialUploader|NostrPublicationDiscoveryPublisher|PublicationDistributionExecutor|PublicationDistributionOrchestrator|PublicationDistributionRuntimeComposition|orchestratePublicationDistribution|executePublicationDistribution\(/.test(codeOnly),
            '26. WorldEncounterCanvas.js never constructs distribution infrastructure or calls the orchestrator/executor directly — it only calls the injected distributionCommand');
        assert(!/distributionLifecycleStore\.set\(|transitionPublicationDistributionLifecycle/.test(codeOnly),
            '27. WorldEncounterCanvas.js never writes into the lifecycle store or transitions a lifecycle itself');
        assert(!/\bINITIATED\b|\bRUNNING\b|\bCOMPLETED\b|\bDISPATCHED\b|\bCOMMANDED\b/.test(codeOnly),
            '28. no new lifecycle vocabulary is introduced — execution stays ephemeral UI state only');
        assert(codeOnly.includes('distributablePublication') && codeOnly.includes('distributeSelectedPublication'),
            '29. the new computed/method are actually present');
        assert((codeOnly.match(/this\.distributionCommand\(/g) || []).length === 1,
            '30. distributionCommand is called from exactly one place');

        console.log('✓ WorldEncounterCanvas.js constructs no distribution infrastructure and introduces no new lifecycle vocabulary');
    }

    // ---------------------------------------------------------------
    // Section I — architectural regression: ui/views/WorldView.js.
    // ---------------------------------------------------------------
    {
        const viewSourceUrl = new URL('../ui/views/WorldView.js', import.meta.url);
        const viewSource = await readFile(viewSourceUrl, 'utf8');
        const viewCodeOnly = viewSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(viewCodeOnly.includes("inject('publicationDistributionCommand', null)"),
            '31. WorldView.js injects the existing publicationDistributionCommand, defaulting to null');
        assert(/:distributionCommand="distributeWorldEncounterPublication"/.test(viewCodeOnly),
            '32. WorldView.js forwards its own wrapper to WorldEncounterCanvas as its new distributionCommand prop');
        assert(viewCodeOnly.includes('function distributeWorldEncounterPublication(publication)')
            && viewCodeOnly.includes('return publicationDistributionCommand({'),
            '33. distributeWorldEncounterPublication calls the injected publicationDistributionCommand — never a second command');
        assert(!/ArweavePublicationMaterialUploader|NostrPublicationDiscoveryPublisher|PublicationDistributionExecutor|PublicationDistributionOrchestrator|PublicationDistributionRuntimeComposition|orchestratePublicationDistribution/.test(viewCodeOnly),
            '34. WorldView.js never constructs distribution infrastructure or calls the orchestrator directly, either');
        assert(!/arweaveUploaderOptions\s*:|nostrPublisherOptions\s*:/.test(viewCodeOnly),
            '35. WorldView.js supplies no signer/relay configuration — that remains a separate, later milestone\'s own decision');

        // The pre-existing (0.9.17/0.9.98/0.9.99/0.9.100) wiring is unaffected.
        assert(viewCodeOnly.includes(':registry="worldDiscoverySourceRegistry"'), '36. the pre-existing registry binding is unchanged');
        assert(viewCodeOnly.includes(':distributionLifecycleStore="publicationDistributionLifecycleStore"'), '37. the pre-existing distributionLifecycleStore binding is unchanged');

        console.log('✓ WorldView.js wires a thin wrapper around the existing command, with no signer/relay configuration or infrastructure of its own');
    }

    console.log('\n✅ All World View Publication Distribution Action tests passed.');
}

runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
