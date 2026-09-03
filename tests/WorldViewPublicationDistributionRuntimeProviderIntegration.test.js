import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import { composePublicationDistributionCommand } from '../application/PublicationDistributionCommandComposition.js';
import { resolvePublicationDistributionRuntimeConfiguration } from '../application/PublicationDistributionRuntimeConfiguration.js';
import { createPublicationDistributionRuntimeProvider } from '../application/PublicationDistributionRuntimeProvider.js';
import { PublicationDistributionLifecycleMemoryStore } from '../application/PublicationDistributionLifecycleStore.js';
import { PublicationDistributionState } from '../application/PublicationDistributionLifecycle.js';
import { WorldEncounterMaterialLoadStatus } from '../application/WorldEncounterMaterialLoading.js';
import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { Signature } from '../core/Signature.js';

// 0.9.107 — Publication Distribution Runtime Provider.
//
// 0.9.106's own flagship test fed a hand-shaped `{ arweave, nostr }`
// literal straight into `resolvePublicationDistributionRuntimeConfiguration()` —
// the exact way `ui/main.js` composed it at the time. `ui/main.js` no
// longer builds that object by hand; it now calls a real, injectable
// factory, `createPublicationDistributionRuntimeProvider()` (0.9.107,
// NEW), and resolves ITS OWN `resolveRuntimeCapabilities()` result
// instead. This is the flagship test for that seam: the SAME
// `WorldEncounterCanvas` click handler 0.9.104 built, driving a
// `distributionCommand` built the way `ui/main.js` now actually builds
// one — a runtime provider constructed from concrete (fake-backed) host
// capabilities, regrouped through the new 0.9.107 seam, resolved through
// 0.9.106's own unmodified seam, then composed through 0.9.105's own
// unmodified `composePublicationDistributionCommand()`.
//
//   Section A: FLAGSHIP — a World View click, a real command composed from
//              a real runtime provider fed concrete host capabilities,
//              a real orchestrator/executor, fake Arweave + fake Nostr,
//              PRESENT material/discovery facts, observed through the
//              existing lifecycle store and the existing Distribution
//              panel
//   Section B: the identical click, with the provider built the way
//              ui/main.js builds it TODAY (no host capabilities supplied)
//              — still ends in the SAME plain notice 0.9.104/0.9.105/
//              0.9.106 already produce
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
        id: 'pub-runtime-provider-integration-1',
        documentId: 'doc-runtime-provider-integration-1',
        title: 'A Runtime-Provider-Distributed Publication',
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
        const transactionId = 'RuntimeProviderIntegrationTxId12345';
        const eventId = 'd'.repeat(64);

        // Exactly the flat vocabulary a real host capability source (a
        // future wallet adapter's already-connected signer, a
        // development/test signer, or any other host-provided capability —
        // see application/PublicationDistributionRuntimeProvider.js's own
        // header) would hand createPublicationDistributionRuntimeProvider().
        const publicationDistributionRuntimeProvider = createPublicationDistributionRuntimeProvider({
            signer: { sign: async () => ({ id: transactionId, transaction: {} }) },
            fetchImpl: async () => gatewayResponse('accepted'),
            publishImpl: async () => ({ published: true, id: eventId }),
            relayUrl: 'wss://relay.example',
            discoveryTag: 'forkbuild-runtime-provider-integration'
        });

        // Exactly ui/main.js's own three calls, in order: build the
        // provider, resolve its own capabilities into a runtime
        // configuration, then compose the command from it.
        const { arweaveUploaderOptions, nostrPublisherOptions } = resolvePublicationDistributionRuntimeConfiguration(publicationDistributionRuntimeProvider.resolveRuntimeCapabilities());
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
        assert(ctx.distributionDiscoveryState === PublicationDistributionState.PRESENT, '6. FLAGSHIP — both dimensions are observed — real orchestrator/executor reached end to end, through the new runtime provider seam');
        assert(lifecycleStore.get(publication.id).material.uri === `ar://${transactionId}`, '7. FLAGSHIP — the SAME app-wide lifecycle store the panel watches now holds the real result');
        assert(lifecycleStore.get(publication.id).discovery.id === eventId, '8. FLAGSHIP — the discovery fact is real too, not fabricated');

        console.log('✓ Flagship: a World View click, driven through a command composed from a real runtime provider fed concrete host capabilities, resolved the way ui/main.js now resolves it, reaches the successful distribution path end to end');
    }

    // ---------------------------------------------------------------
    // Section B — the identical click, with the provider built the way
    // ui/main.js builds it TODAY (no host capabilities supplied).
    // ---------------------------------------------------------------
    {
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const publication = signedPublication({ id: 'pub-runtime-provider-integration-b' });

        const publicationDistributionRuntimeProvider = createPublicationDistributionRuntimeProvider({});
        const { arweaveUploaderOptions, nostrPublisherOptions } = resolvePublicationDistributionRuntimeConfiguration(publicationDistributionRuntimeProvider.resolveRuntimeCapabilities());
        const publicationDistributionCommand = composePublicationDistributionCommand({
            lifecycleStore,
            arweaveUploaderOptions,
            nostrPublisherOptions
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

        console.log('✓ Section B: with the provider built the way ui/main.js builds it today, the identical click still reaches exactly today\'s existing honest failure');
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
        assert(codeOnly.includes("import { resolvePublicationDistributionRuntimeConfiguration } from '../application/PublicationDistributionRuntimeConfiguration.js'"),
            '13. ui/main.js imports the real 0.9.106 runtime configuration seam, unmodified by this milestone');
        assert(codeOnly.includes("import { createPublicationDistributionRuntimeProvider } from '../application/PublicationDistributionRuntimeProvider.js'"),
            '14. ui/main.js imports the real runtime provider factory, never a hand-rolled equivalent');
        assert(!codeOnly.includes("PublicationDistributionConfigurationProvider.js'"),
            '15. ui/main.js still never imports the 0.9.105 resolvers directly');
        assert(codeOnly.includes('createPublicationDistributionRuntimeProvider({})'),
            '16. ui/main.js actually calls the new provider factory — still with nothing to supply yet, exactly today\'s honest state');
        assert(codeOnly.includes('resolvePublicationDistributionRuntimeConfiguration(publicationDistributionRuntimeProvider.resolveRuntimeCapabilities())'),
            '17. ui/main.js resolves the runtime configuration from the provider\'s own resolveRuntimeCapabilities(), never a hand-shaped object literal');
        assert(codeOnly.includes('composePublicationDistributionCommand({') && codeOnly.includes('lifecycleStore: publicationDistributionLifecycleStore'),
            '18. ui/main.js still composes the command with the SAME lifecycle store 0.9.100/0.9.103 already wired for observation');
        assert(!/ArweavePublicationMaterialUploader|NostrPublicationDiscoveryPublisher|PublicationDistributionExecutor|PublicationDistributionOrchestrator|PublicationDistributionRuntimeComposition|orchestratePublicationDistribution|executePublicationDistribution\(/.test(codeOnly),
            '19. ui/main.js still never constructs distribution infrastructure or calls the orchestrator/executor directly — even after adding the runtime provider seam');

        console.log('✓ Section C: ui/main.js wires the real runtime provider seam, with no distribution infrastructure of its own');
    }

    console.log('\n✅ All World View Publication Distribution Runtime Provider tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
