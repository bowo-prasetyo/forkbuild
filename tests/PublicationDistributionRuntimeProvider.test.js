import { readFile } from 'node:fs/promises';
import { createPublicationDistributionRuntimeProvider } from '../application/PublicationDistributionRuntimeProvider.js';
import { resolvePublicationDistributionRuntimeConfiguration } from '../application/PublicationDistributionRuntimeConfiguration.js';
import { composePublicationDistributionCommand } from '../application/PublicationDistributionCommandComposition.js';
import { PublicationDistributionLifecycleMemoryStore } from '../application/PublicationDistributionLifecycleStore.js';
import { PublicationDistributionState } from '../application/PublicationDistributionLifecycle.js';
import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { Signature } from '../core/Signature.js';

// 0.9.107 — Publication Distribution Runtime Provider.
// See docs/Roadmap.md, "0.9.107 — Publication Distribution Runtime
// Provider," for the full milestone story.
//
//   Section A: an empty provider's resolveRuntimeCapabilities() regroups
//              into a shape that still resolves both substrates to
//              undefined — today's exact ui/main.js state
//   Section B: a provider carrying a real signer/publishImpl regroups into
//              a shape that resolves real options objects, identical to
//              handing the same fields directly to
//              resolvePublicationDistributionRuntimeConfiguration()
//   Section C: arweave-side and nostr-side fields are two independent
//              groupings — supplying only one never affects the other
//   Section D: FLAGSHIP — a provider built from concrete (fake-backed)
//              capabilities composes into a real command that reaches the
//              real orchestrator/executor
//   Section E: architectural regression

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function signedPublication(overrides = {}) {
    const publication = new Publication({
        id: 'pub-runtime-provider-1',
        documentId: 'doc-runtime-provider-1',
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

function fakeSigner(transactionId) {
    return { sign: async () => ({ id: transactionId, transaction: {} }) };
}

function fakeFetchImpl() {
    return async () => gatewayResponse('accepted');
}

function fakePublishImpl(eventId) {
    return async () => ({ published: true, id: eventId });
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — an empty provider still resolves both substrates to
    // undefined.
    // ---------------------------------------------------------------
    {
        const provider = createPublicationDistributionRuntimeProvider({});
        const capabilities = provider.resolveRuntimeCapabilities();
        assert(capabilities.arweave !== undefined && capabilities.nostr !== undefined,
            '1. an empty provider still regroups into both an arweave and a nostr section');

        const { arweaveUploaderOptions, nostrPublisherOptions } = resolvePublicationDistributionRuntimeConfiguration(capabilities);
        assert(arweaveUploaderOptions === undefined, '2. an empty provider resolves arweaveUploaderOptions to undefined');
        assert(nostrPublisherOptions === undefined, '3. an empty provider resolves nostrPublisherOptions to undefined');

        const noArgumentProvider = createPublicationDistributionRuntimeProvider();
        const noArgumentResolved = resolvePublicationDistributionRuntimeConfiguration(noArgumentProvider.resolveRuntimeCapabilities());
        assert(noArgumentResolved.arweaveUploaderOptions === undefined && noArgumentResolved.nostrPublisherOptions === undefined,
            '4. calling with no argument at all behaves identically to an empty object — today\'s exact ui/main.js call shape');

        console.log('✓ Section A: an empty provider regroups into a shape that still resolves both substrates to undefined, exactly today\'s ui/main.js state');
    }

    // ---------------------------------------------------------------
    // Section B — a real provider regroups into real options, identical to
    // handing the same fields directly to
    // resolvePublicationDistributionRuntimeConfiguration().
    // ---------------------------------------------------------------
    {
        const transactionId = 'RuntimeProviderTransactionId123456';
        const eventId = 'b'.repeat(64);
        const signer = fakeSigner(transactionId);
        const fetchImpl = fakeFetchImpl();
        const publishImpl = fakePublishImpl(eventId);

        const provider = createPublicationDistributionRuntimeProvider({
            signer,
            fetchImpl,
            publishImpl,
            relayUrl: 'wss://relay.example',
            discoveryTag: 'forkbuild-runtime-provider'
        });
        const resolved = resolvePublicationDistributionRuntimeConfiguration(provider.resolveRuntimeCapabilities());

        const direct = resolvePublicationDistributionRuntimeConfiguration({
            arweave: { signer, fetchImpl },
            nostr: { publishImpl, relayUrl: 'wss://relay.example', discoveryTag: 'forkbuild-runtime-provider' }
        });

        assert(resolved.arweaveUploaderOptions !== undefined, '5. a real signer regroups into a real arweaveUploaderOptions');
        assert(resolved.arweaveUploaderOptions.signer === direct.arweaveUploaderOptions.signer, '6. the regrouped signer is forwarded verbatim, identical to the hand-shaped equivalent');
        assert(resolved.nostrPublisherOptions !== undefined, '7. a real publishImpl/discoveryTag regroups into a real nostrPublisherOptions');
        assert(resolved.nostrPublisherOptions.discoveryTag === direct.nostrPublisherOptions.discoveryTag, '8. the regrouped discoveryTag is forwarded verbatim, identical to the hand-shaped equivalent');

        console.log('✓ Section B: a provider carrying a real signer/publishImpl regroups into a shape that resolves real options objects, identical to the hand-shaped equivalent');
    }

    // ---------------------------------------------------------------
    // Section C — arweave-side and nostr-side fields are independent
    // groupings.
    // ---------------------------------------------------------------
    {
        const arweaveOnlyProvider = createPublicationDistributionRuntimeProvider({
            signer: fakeSigner('ArweaveOnlyProviderTxId0000000000')
        });
        const arweaveOnly = resolvePublicationDistributionRuntimeConfiguration(arweaveOnlyProvider.resolveRuntimeCapabilities());
        assert(arweaveOnly.arweaveUploaderOptions !== undefined, '9. supplying only signer regroups into a real arweaveUploaderOptions');
        assert(arweaveOnly.nostrPublisherOptions === undefined, '10. supplying only signer leaves nostrPublisherOptions undefined — nostr fields are never inferred from arweave fields');

        const nostrOnlyProvider = createPublicationDistributionRuntimeProvider({
            publishImpl: fakePublishImpl('c'.repeat(64)),
            discoveryTag: 'forkbuild-nostr-only-provider'
        });
        const nostrOnly = resolvePublicationDistributionRuntimeConfiguration(nostrOnlyProvider.resolveRuntimeCapabilities());
        assert(nostrOnly.nostrPublisherOptions !== undefined, '11. supplying only publishImpl/discoveryTag regroups into a real nostrPublisherOptions');
        assert(nostrOnly.arweaveUploaderOptions === undefined, '12. supplying only publishImpl/discoveryTag leaves arweaveUploaderOptions undefined — arweave fields are never inferred from nostr fields');

        console.log('✓ Section C: arweave-side and nostr-side fields are two independent groupings — supplying only one never affects the other');
    }

    // ---------------------------------------------------------------
    // Section D — FLAGSHIP: a provider built from concrete (fake-backed)
    // capabilities composes into a real command that reaches the real
    // orchestrator/executor.
    // ---------------------------------------------------------------
    {
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const publication = signedPublication();
        const transactionId = 'RuntimeProviderFlagshipTxId1234567';
        const eventId = 'd'.repeat(64);

        // Exactly the flat vocabulary a real host capability source (a
        // future wallet adapter's already-connected signer, for instance)
        // would hand createPublicationDistributionRuntimeProvider().
        const provider = createPublicationDistributionRuntimeProvider({
            signer: fakeSigner(transactionId),
            fetchImpl: fakeFetchImpl(),
            publishImpl: fakePublishImpl(eventId),
            relayUrl: 'wss://relay.example',
            discoveryTag: 'forkbuild-runtime-provider-flagship'
        });

        const { arweaveUploaderOptions, nostrPublisherOptions } = resolvePublicationDistributionRuntimeConfiguration(provider.resolveRuntimeCapabilities());
        const publicationDistributionCommand = composePublicationDistributionCommand({
            lifecycleStore,
            arweaveUploaderOptions,
            nostrPublisherOptions
        });

        const result = await publicationDistributionCommand({
            publication,
            serializedMaterial: JSON.stringify(publication.toJSON())
        });

        assert(result !== null, '13. FLAGSHIP — the composed command resolves a real result');
        assert(result.material !== null && result.material.uri === `ar://${transactionId}`, '14. FLAGSHIP — the real orchestrator/executor actually uploaded through the provider-resolved configuration');
        assert(result.discovery !== null && result.discovery.id === eventId, '15. FLAGSHIP — the real orchestrator/executor actually published through the provider-resolved configuration');

        const lifecycle = lifecycleStore.get(publication.id);
        assert(lifecycle.material.state === PublicationDistributionState.PRESENT && lifecycle.discovery.state === PublicationDistributionState.PRESENT,
            '16. FLAGSHIP — the same lifecycle store World View observes now holds a real, complete distribution fact, reached entirely through the new runtime provider seam');

        console.log('✓ Section D: FLAGSHIP — a provider built from concrete capabilities resolves into a real command that reaches the real orchestrator/executor end to end');
    }

    // ---------------------------------------------------------------
    // Section E — architectural regression.
    // ---------------------------------------------------------------
    {
        const sourceUrl = new URL('../application/PublicationDistributionRuntimeProvider.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(!/ArweavePublicationMaterialUploader|NostrPublicationDiscoveryPublisher|orchestratePublicationDistribution|PublicationDistributionRuntimeComposition|PublicationDistributionExecutor|PublicationDistributionOrchestrator/.test(codeOnly),
            '17. never constructs distribution infrastructure or calls the orchestrator/executor directly');
        assert(!codeOnly.includes("'../ui/") && !codeOnly.includes('"../ui/'), '18. no UI import of any kind');
        assert(!codeOnly.includes('localStorage') && !codeOnly.includes('window.'), '19. no persistence, no window/browser global read — a pure factory of its own argument');
        assert(!/\basync\b|Promise|\.then\(|await\b/.test(codeOnly), '20. no asynchronous discovery of any kind — a synchronous factory, exactly like the seam beneath it');
        assert((codeOnly.match(/\bexport\s+function\b/g) || []).length === 1, '21. exports exactly one function');
        assert(codeOnly.includes('resolveRuntimeCapabilities'), '22. the returned object exposes resolveRuntimeCapabilities(), matching the milestone\'s own named contract');

        console.log('✓ Section E: architectural regression — a pure, synchronous regrouping factory, no re-implemented resolution logic, no UI import, no distribution infrastructure');
    }

    console.log('\nAll PublicationDistributionRuntimeProvider tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
