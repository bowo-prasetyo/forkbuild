import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import { composePublicationDistributionCommand } from '../application/PublicationDistributionCommandComposition.js';
import { resolveArweaveUploaderOptions, resolveNostrPublisherOptions } from '../application/PublicationDistributionConfigurationProvider.js';
import { PublicationDistributionLifecycleMemoryStore } from '../application/PublicationDistributionLifecycleStore.js';
import { PublicationDistributionState } from '../application/PublicationDistributionLifecycle.js';
import { WorldEncounterMaterialLoadStatus } from '../application/WorldEncounterMaterialLoading.js';
import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { Signature } from '../core/Signature.js';

// 0.9.105 — Publication Distribution Configuration Boundary.
//
// 0.9.104 wired a real "Distribute Publication" click on WorldEncounterCanvas
// straight through to the real command/orchestrator/executor, and stopped
// there — every click in the actually-running app reached 0.9.45's/0.9.46's
// own honest "a signer/publishImpl is required" throw, because nothing in
// `ui/main.js` supplied `arweaveUploaderOptions`/`nostrPublisherOptions`.
// This is the flagship test that closes that gap end to end: the SAME
// `WorldEncounterCanvas` click handler 0.9.104 built, driving a
// `distributionCommand` built the way `ui/main.js` now actually builds one
// (`composePublicationDistributionCommand()` + `resolveArweaveUploaderOptions()`/
// `resolveNostrPublisherOptions()`, all 0.9.105, unmodified here), fed fake
// signer/gateway/relay collaborators standing in for a real wallet/relay
// capability this codebase does not concretely implement yet — see
// `application/PublicationDistributionConfigurationProvider.js`'s own
// header. Proves the exact user-facing action that used to end in
// "Distribution could not be completed." now reaches the successful
// distribution path once valid configuration is supplied, with World View
// itself changed not at all.
//
//   Section A: FLAGSHIP — a World View click, a real command composed with
//              real (fake-backed) configuration, a real orchestrator/
//              executor, fake Arweave + fake Nostr, PRESENT material/
//              discovery facts, observed through the existing lifecycle
//              store and the existing Distribution panel
//   Section B: the identical click, with the command composed the way
//              ui/main.js composes it TODAY (nothing resolvable), still
//              ends in the SAME plain notice 0.9.104 already produces —
//              this milestone adds a seam, it does not change today's
//              running app
//   Section C: architectural regression — ui/main.js wiring

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function flushMicrotasks() {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let i = 0; i < 10; i++) {
        await Promise.resolve();
    }
}

function signedPublication(overrides = {}) {
    const publication = new Publication({
        id: 'pub-config-integration-1',
        documentId: 'doc-config-integration-1',
        title: 'A Configuration-Boundary-Distributed Publication',
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
    Object.defineProperty(ctx, 'distributionMaterialState', {
        get() { return WorldEncounterCanvas.computed.distributionMaterialState.call(ctx); }
    });
    Object.defineProperty(ctx, 'distributionDiscoveryState', {
        get() { return WorldEncounterCanvas.computed.distributionDiscoveryState.call(ctx); }
    });
    return ctx;
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP.
    // ---------------------------------------------------------------
    {
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const publication = signedPublication();
        const transactionId = 'ConfigIntegrationTransactionId1234567';
        const eventId = 'd'.repeat(64);

        // Exactly the two ui/main.js calls, fed fake collaborators standing
        // in for a real wallet/relay capability — see this file's own
        // header.
        const arweaveUploaderOptions = resolveArweaveUploaderOptions({
            signer: { sign: async () => ({ id: transactionId, transaction: {} }) },
            fetchImpl: async () => gatewayResponse('accepted')
        });
        const nostrPublisherOptions = resolveNostrPublisherOptions({
            publishImpl: async () => ({ published: true, id: eventId }),
            relayUrl: 'wss://relay.example',
            discoveryTag: 'forkbuild-config-integration'
        });

        // Exactly ui/main.js's own composePublicationDistributionCommand()
        // call — the app-wide publicationDistributionCommand a real
        // WorldView.js injects.
        const publicationDistributionCommand = composePublicationDistributionCommand({
            lifecycleStore,
            arweaveUploaderOptions,
            nostrPublisherOptions
        });

        // Exactly WorldView.js's own distributeWorldEncounterPublication()
        // shape — a thin (publication) -> Promise wrapper adding only
        // serializedMaterial, forwarded to WorldEncounterCanvas as its
        // distributionCommand prop.
        const distributionCommand = (publication) => publicationDistributionCommand({
            publication,
            serializedMaterial: JSON.stringify(publication.toJSON())
        });

        const ctx = canvasCtx({ distributionLifecycleStore: lifecycleStore, distributionCommand });
        ctx.selectedEncounter = { kind: 'PUBLICATION', objectId: publication.id };
        ctx.refreshDistributionLifecycle();
        ctx.materialInspection = {
            loading: { status: WorldEncounterMaterialLoadStatus.AVAILABLE, resolvedSelection: ctx.selectedEncounter, material: publication }
        };

        assert(ctx.distributionMaterialState === PublicationDistributionState.ABSENT, '1. FLAGSHIP — before distributing, the panel observes ABSENT');

        ctx.distributeSelectedPublication();
        assert(ctx.distributionExecuting === true, '2. FLAGSHIP — the action enters executing state synchronously on click');

        await flushMicrotasks();

        assert(ctx.distributionExecuting === false, '3. FLAGSHIP — execution returns to idle once the command resolves');
        assert(ctx.distributionError === null, '4. FLAGSHIP — a successful call leaves no error notice — the "Distribution could not be completed" path is NOT taken');
        assert(ctx.distributionMaterialState === PublicationDistributionState.PRESENT, '5. FLAGSHIP — the Distribution panel now observes a real material fact, through the existing subscription alone');
        assert(ctx.distributionDiscoveryState === PublicationDistributionState.PRESENT, '6. FLAGSHIP — both dimensions are observed — real orchestrator/executor reached end to end');
        assert(lifecycleStore.get(publication.id).material.uri === `ar://${transactionId}`, '7. FLAGSHIP — the SAME app-wide lifecycle store the panel watches now holds the real result');
        assert(lifecycleStore.get(publication.id).discovery.id === eventId, '8. FLAGSHIP — the discovery fact is real too, not fabricated');

        console.log('✓ Flagship: a World View click, driven through a command composed the way ui/main.js now composes it, with real (fake-backed) configuration, reaches the successful distribution path end to end');
    }

    // ---------------------------------------------------------------
    // Section B — the identical click, composed the way ui/main.js
    // composes it TODAY, still ends in the same plain notice.
    // ---------------------------------------------------------------
    {
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const publication = signedPublication({ id: 'pub-config-integration-b' });

        const publicationDistributionCommand = composePublicationDistributionCommand({
            lifecycleStore,
            arweaveUploaderOptions: resolveArweaveUploaderOptions({}),
            nostrPublisherOptions: resolveNostrPublisherOptions({})
        });
        const distributionCommand = (publication) => publicationDistributionCommand({
            publication,
            serializedMaterial: JSON.stringify(publication.toJSON())
        });

        const ctx = canvasCtx({
            distributionLifecycleStore: lifecycleStore,
            selectedEncounter: { kind: 'PUBLICATION', objectId: publication.id },
            materialInspection: { loading: { status: WorldEncounterMaterialLoadStatus.AVAILABLE, material: publication } },
            distributionCommand
        });

        ctx.distributeSelectedPublication();
        await flushMicrotasks();

        assert(ctx.distributionExecuting === false, '9. today\'s configuration — execution still returns to idle');
        assert(ctx.distributionError === 'Distribution could not be completed.', '10. today\'s configuration — the click still ends in exactly 0.9.104\'s own plain notice, unchanged');
        assert(lifecycleStore.get(publication.id) === null, '11. today\'s configuration — the lifecycle store is left untouched, exactly as before this milestone');

        console.log('✓ Section B: composed the way ui/main.js composes it today, the identical click still reaches exactly today\'s existing honest failure');
    }

    // ---------------------------------------------------------------
    // Section C — architectural regression: ui/main.js wiring.
    // ---------------------------------------------------------------
    {
        const { readFile } = await import('node:fs/promises');
        const source = await readFile(new URL('../ui/main.js', import.meta.url), 'utf8');
        const codeOnly = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(codeOnly.includes("import { composePublicationDistributionCommand } from '../application/PublicationDistributionCommandComposition.js'"),
            '12. ui/main.js imports the real composition function, never a hand-rolled equivalent');
        assert(codeOnly.includes("import { resolveArweaveUploaderOptions, resolveNostrPublisherOptions } from '../application/PublicationDistributionConfigurationProvider.js'"),
            '13. ui/main.js imports the real configuration resolvers');
        assert(codeOnly.includes('composePublicationDistributionCommand({') && codeOnly.includes('lifecycleStore: publicationDistributionLifecycleStore'),
            '14. ui/main.js actually calls the composition function with the SAME lifecycle store 0.9.100/0.9.103 already wired for observation');
        assert(!/ArweavePublicationMaterialUploader|NostrPublicationDiscoveryPublisher|PublicationDistributionExecutor|PublicationDistributionOrchestrator|PublicationDistributionRuntimeComposition|orchestratePublicationDistribution|executePublicationDistribution\(/.test(codeOnly),
            '15. ui/main.js still never constructs distribution infrastructure or calls the orchestrator/executor directly — even after adding the configuration boundary');

        console.log('✓ Section C: ui/main.js wires the real composition function and the real configuration resolvers, with no distribution infrastructure of its own');
    }

    console.log('\n✅ All World View Publication Distribution Configuration Boundary tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
