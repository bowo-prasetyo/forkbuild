import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import { composePublicationDistributionCommand } from '../application/PublicationDistributionCommandComposition.js';
import { resolvePublicationDistributionRuntimeConfiguration } from '../application/PublicationDistributionRuntimeConfiguration.js';
import { PublicationDistributionLifecycleMemoryStore } from '../application/PublicationDistributionLifecycleStore.js';
import { PublicationDistributionState } from '../application/PublicationDistributionLifecycle.js';
import { WorldEncounterMaterialLoadStatus } from '../application/WorldEncounterMaterialLoading.js';
import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { Signature } from '../core/Signature.js';

// 0.9.106 — Publication Distribution Runtime Configuration.
//
// 0.9.105's own flagship test (`WorldViewPublicationDistributionConfigurationIntegration.test.js`)
// fed fake signer/publishImpl collaborators straight into
// `resolveArweaveUploaderOptions()`/`resolveNostrPublisherOptions()` — the
// two 0.9.105 resolvers, called directly, exactly as `ui/main.js` called
// them at the time. `ui/main.js` no longer calls those resolvers directly;
// it now defines ONE `publicationDistributionRuntimeConfiguration` object
// and resolves it through `resolvePublicationDistributionRuntimeConfiguration()`
// (0.9.106, NEW). This is the flagship test for THAT seam: the SAME
// `WorldEncounterCanvas` click handler 0.9.104 built, driving a
// `distributionCommand` built the way `ui/main.js` now actually builds
// one — a single runtime configuration object resolved through the new
// 0.9.106 seam, then composed through 0.9.105's own unmodified
// `composePublicationDistributionCommand()` — fed fake signer/gateway/relay
// collaborators standing in for a real wallet/relay capability this
// codebase does not concretely implement yet.
//
//   Section A: FLAGSHIP — a World View click, a real command composed from
//              a single resolved runtime configuration object, a real
//              orchestrator/executor, fake Arweave + fake Nostr, PRESENT
//              material/discovery facts, observed through the existing
//              lifecycle store and the existing Distribution panel
//   Section B: the identical click, with the runtime configuration source
//              empty — the way ui/main.js composes it TODAY — still ends
//              in the SAME plain notice 0.9.104/0.9.105 already produce
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
        id: 'pub-runtime-config-integration-1',
        documentId: 'doc-runtime-config-integration-1',
        title: 'A Runtime-Configuration-Distributed Publication',
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
        const transactionId = 'RuntimeConfigIntegrationTxId1234567';
        const eventId = 'd'.repeat(64);

        // Exactly the shape a real runtime configuration source (a future
        // wallet adapter's already-connected signer, a development/test
        // signer, or any other host-provided capability — see
        // application/PublicationDistributionRuntimeConfiguration.js's own
        // header) would hand ui/main.js.
        const publicationDistributionRuntimeConfiguration = {
            arweave: {
                signer: { sign: async () => ({ id: transactionId, transaction: {} }) },
                fetchImpl: async () => gatewayResponse('accepted')
            },
            nostr: {
                publishImpl: async () => ({ published: true, id: eventId }),
                relayUrl: 'wss://relay.example',
                discoveryTag: 'forkbuild-runtime-config-integration'
            }
        };

        // Exactly ui/main.js's own two calls, in order: resolve the single
        // runtime configuration object, then compose the command from it.
        const { arweaveUploaderOptions, nostrPublisherOptions } = resolvePublicationDistributionRuntimeConfiguration(publicationDistributionRuntimeConfiguration);
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
        assert(ctx.distributionDiscoveryState === PublicationDistributionState.PRESENT, '6. FLAGSHIP — both dimensions are observed — real orchestrator/executor reached end to end, through the new runtime configuration seam');
        assert(lifecycleStore.get(publication.id).material.uri === `ar://${transactionId}`, '7. FLAGSHIP — the SAME app-wide lifecycle store the panel watches now holds the real result');
        assert(lifecycleStore.get(publication.id).discovery.id === eventId, '8. FLAGSHIP — the discovery fact is real too, not fabricated');

        console.log('✓ Flagship: a World View click, driven through a command composed from a single runtime configuration object resolved the way ui/main.js now resolves it, reaches the successful distribution path end to end');
    }

    // ---------------------------------------------------------------
    // Section B — the identical click, with the runtime configuration
    // source empty, the way ui/main.js composes it TODAY.
    // ---------------------------------------------------------------
    {
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const publication = signedPublication({ id: 'pub-runtime-config-integration-b' });

        const { arweaveUploaderOptions, nostrPublisherOptions } = resolvePublicationDistributionRuntimeConfiguration({});
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

        console.log('✓ Section B: with the runtime configuration source empty, the way ui/main.js composes it today, the identical click still reaches exactly today\'s existing honest failure');
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
            '13. ui/main.js imports the real runtime configuration seam, never the 0.9.105 resolvers directly');
        assert(!codeOnly.includes("PublicationDistributionConfigurationProvider.js'"),
            '14. ui/main.js no longer imports the 0.9.105 resolvers directly — resolvePublicationDistributionRuntimeConfiguration() is the one seam now');
        assert(codeOnly.includes('resolvePublicationDistributionRuntimeConfiguration(publicationDistributionRuntimeConfiguration)'),
            '15. ui/main.js actually calls the new seam with its own named runtime configuration object');
        assert(codeOnly.includes('composePublicationDistributionCommand({') && codeOnly.includes('lifecycleStore: publicationDistributionLifecycleStore'),
            '16. ui/main.js still composes the command with the SAME lifecycle store 0.9.100/0.9.103 already wired for observation');
        assert(!/ArweavePublicationMaterialUploader|NostrPublicationDiscoveryPublisher|PublicationDistributionExecutor|PublicationDistributionOrchestrator|PublicationDistributionRuntimeComposition|orchestratePublicationDistribution|executePublicationDistribution\(/.test(codeOnly),
            '17. ui/main.js still never constructs distribution infrastructure or calls the orchestrator/executor directly — even after adding the runtime configuration seam');

        console.log('✓ Section C: ui/main.js wires the real runtime configuration seam, with no distribution infrastructure of its own');
    }

    console.log('\n✅ All World View Publication Distribution Runtime Configuration tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
