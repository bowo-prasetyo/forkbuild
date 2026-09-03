import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import { composePublicationDistributionCommand } from '../application/PublicationDistributionCommandComposition.js';
import { resolvePublicationDistributionRuntimeConfiguration } from '../application/PublicationDistributionRuntimeConfiguration.js';
import { createPublicationDistributionRuntimeProvider } from '../application/PublicationDistributionRuntimeProvider.js';
import { createArweavePublicationDistributionRuntimeAdapter } from '../application/ArweavePublicationDistributionRuntimeAdapter.js';
import { createNostrPublicationDistributionRuntimeAdapter } from '../application/NostrPublicationDistributionRuntimeAdapter.js';
import { PublicationDistributionLifecycleMemoryStore } from '../application/PublicationDistributionLifecycleStore.js';
import { PublicationDistributionState } from '../application/PublicationDistributionLifecycle.js';
import { WorldEncounterMaterialLoadStatus } from '../application/WorldEncounterMaterialLoading.js';
import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { Signature } from '../core/Signature.js';

// 0.9.109 — Arweave Publication Distribution Runtime Adapter.
//
// 0.9.107's own flagship test fed `createPublicationDistributionRuntimeProvider()`
// a flat `signer` field directly, as if this codebase already had a
// concrete Arweave signing capability sitting next to a fake Nostr
// publisher. It does not — `ui/main.js` still calls
// `createArweavePublicationDistributionRuntimeAdapter({})`. This is the
// flagship test for that adapter: the SAME `WorldEncounterCanvas` click
// handler 0.9.104 built, driving a `distributionCommand` built the way
// `ui/main.js` now actually builds one — a runtime provider fed a
// FAKE HOST ARWEAVE SIGNER, translated through the new 0.9.109 adapter,
// alongside the already-shipped 0.9.108 Nostr adapter (still fed no host
// capability, matching ui/main.js's own current, honest state).
//
//   Section A: FLAGSHIP — a World View click, a real command composed from
//              a real runtime provider whose Arweave side is fed through
//              the new Arweave runtime adapter from a fake HOST signer, a
//              real orchestrator/executor, PRESENT material/discovery
//              facts, observed through the existing lifecycle store and
//              the existing Distribution panel
//   Section B: the identical click, with BOTH adapters fed no host
//              capability, the way ui/main.js builds it TODAY — still ends
//              in the SAME plain notice 0.9.104-0.9.108 already produce
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
        id: 'pub-arweave-adapter-integration-1',
        documentId: 'doc-arweave-adapter-integration-1',
        title: 'An Arweave-Adapter-Distributed Publication',
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
        const transactionId = 'ArweaveAdapterIntegrationTxId123456';
        const eventId = 'd'.repeat(64);

        // A fake HOST Arweave signer — the shape a real host capability (a
        // browser wallet extension, a hardware signer, a development
        // fixture) would expose under its own "signer" name, the SAME name
        // this codebase's own runtime provider already accepts.
        const fakeHostSigner = {
            sign: async (material) => {
                assert(typeof material === 'string' && material.length > 0, 'the host signer receives real serialized material');
                return { id: transactionId, transaction: { material } };
            }
        };

        // Exactly ui/main.js's own new sequence: adapt the host Arweave
        // capability, spread it into the runtime provider alongside the
        // already-shipped 0.9.108 Nostr adapter (fed a fake host publisher
        // directly here, standing in for "however ui/main.js's own Nostr
        // side is currently configured").
        const arweavePublicationRuntimeCapabilities = createArweavePublicationDistributionRuntimeAdapter({
            signer: fakeHostSigner,
            fetchImpl: async () => gatewayResponse('accepted')
        });
        const nostrPublicationRuntimeCapabilities = createNostrPublicationDistributionRuntimeAdapter({
            publish: async (relayUrl, eventTemplate) => {
                assert(relayUrl === 'wss://relay.example', 'the host publisher receives the configured relayUrl');
                assert(eventTemplate && typeof eventTemplate.content === 'string', 'the host publisher receives a real event template');
                return { published: true, id: eventId };
            },
            relayUrl: 'wss://relay.example'
        });
        const publicationDistributionRuntimeProvider = createPublicationDistributionRuntimeProvider({
            ...arweavePublicationRuntimeCapabilities,
            ...nostrPublicationRuntimeCapabilities,
            discoveryTag: 'forkbuild-arweave-adapter-integration'
        });

        const { arweaveUploaderOptions, nostrPublisherOptions } = resolvePublicationDistributionRuntimeConfiguration(publicationDistributionRuntimeProvider.resolveRuntimeCapabilities());
        const publicationDistributionCommand = composePublicationDistributionCommand({
            lifecycleStore,
            arweaveUploaderOptions,
            nostrPublisherOptions
        });

        // Exactly WorldView.js's own distributeWorldEncounterPublication()
        // shape.
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
        assert(ctx.distributionError === null, '4. FLAGSHIP — a successful call leaves no error notice');
        assert(ctx.distributionMaterialState === PublicationDistributionState.PRESENT, '5. FLAGSHIP — the Distribution panel now observes a real material fact');
        assert(ctx.distributionDiscoveryState === PublicationDistributionState.PRESENT, '6. FLAGSHIP — both dimensions are observed — real orchestrator/executor reached end to end, through the new Arweave runtime adapter');
        assert(lifecycleStore.get(publication.id).material.uri === `ar://${transactionId}`, '7. FLAGSHIP — the material fact came from the fake HOST signer, proving the adapter\'s own translation reached World View');
        assert(lifecycleStore.get(publication.id).discovery.id === eventId, '8. FLAGSHIP — the discovery fact is real, untouched by this milestone');

        console.log('✓ Flagship: a World View click, driven through a command whose Arweave capability came from a fake host signer adapted through the new file, reaches the successful distribution path end to end');
    }

    // ---------------------------------------------------------------
    // Section B — the identical click, with BOTH adapters fed no host
    // capability, the way ui/main.js builds it TODAY.
    // ---------------------------------------------------------------
    {
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const publication = signedPublication({ id: 'pub-arweave-adapter-integration-b' });

        const arweavePublicationRuntimeCapabilities = createArweavePublicationDistributionRuntimeAdapter({});
        const nostrPublicationRuntimeCapabilities = createNostrPublicationDistributionRuntimeAdapter({});
        const publicationDistributionRuntimeProvider = createPublicationDistributionRuntimeProvider({
            ...arweavePublicationRuntimeCapabilities,
            ...nostrPublicationRuntimeCapabilities
        });
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
        assert(lifecycleStore.get(publication.id) === null, '11. today\'s configuration — the lifecycle store is left untouched');

        console.log('✓ Section B: with both adapters fed no host capability, the way ui/main.js builds it today, the identical click still reaches exactly today\'s existing honest failure');
    }

    // ---------------------------------------------------------------
    // Section C — architectural regression: ui/main.js wiring.
    // ---------------------------------------------------------------
    {
        const { readFile } = await import('node:fs/promises');
        const source = await readFile(new URL('../ui/main.js', import.meta.url), 'utf8');
        const codeOnly = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(codeOnly.includes("import { createArweavePublicationDistributionRuntimeAdapter } from '../application/ArweavePublicationDistributionRuntimeAdapter.js'"),
            '12. ui/main.js imports the real Arweave runtime adapter, never a hand-rolled equivalent');
        assert(codeOnly.includes('createArweavePublicationDistributionRuntimeAdapter({})'),
            '13. ui/main.js actually calls the new adapter — still with no host capability to supply yet, exactly today\'s honest state');
        assert(codeOnly.includes('const publicationDistributionRuntimeProvider = createPublicationDistributionRuntimeProvider({') &&
            codeOnly.includes('...arweavePublicationRuntimeCapabilities') &&
            codeOnly.includes('...nostrPublicationRuntimeCapabilities'),
            '14. ui/main.js spreads BOTH adapters\' own resolved capabilities into the runtime provider, never a hand-shaped signer/publishImpl literal');
        assert(codeOnly.includes('composePublicationDistributionCommand({') && codeOnly.includes('lifecycleStore: publicationDistributionLifecycleStore'),
            '15. ui/main.js still composes the command with the same lifecycle store 0.9.100/0.9.103 already wired for observation');
        assert(!/ArweavePublicationMaterialUploader|NostrPublicationDiscoveryPublisher|NostrDiscoveryQueryService|PublicationDistributionExecutor|PublicationDistributionOrchestrator|PublicationDistributionRuntimeComposition|orchestratePublicationDistribution|executePublicationDistribution\(/.test(codeOnly),
            '16. ui/main.js still never constructs distribution infrastructure or calls the orchestrator/executor directly — even after adding the Arweave runtime adapter seam');

        console.log('✓ Section C: ui/main.js wires the real Arweave runtime adapter seam, with no distribution infrastructure of its own');
    }

    console.log('\n✅ All World View Arweave Publication Distribution Runtime Adapter tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
