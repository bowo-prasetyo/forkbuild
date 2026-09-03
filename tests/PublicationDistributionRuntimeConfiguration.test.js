import { readFile } from 'node:fs/promises';
import { resolvePublicationDistributionRuntimeConfiguration } from '../application/PublicationDistributionRuntimeConfiguration.js';
import { resolveArweaveUploaderOptions, resolveNostrPublisherOptions } from '../application/PublicationDistributionConfigurationProvider.js';
import { composePublicationDistributionCommand } from '../application/PublicationDistributionCommandComposition.js';
import { PublicationDistributionLifecycleMemoryStore } from '../application/PublicationDistributionLifecycleStore.js';
import { PublicationDistributionState } from '../application/PublicationDistributionLifecycle.js';
import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { Signature } from '../core/Signature.js';

// 0.9.106 — Publication Distribution Runtime Configuration.
// See docs/Roadmap.md, "0.9.106 — Publication Distribution Runtime
// Configuration," for the full milestone story.
//
//   Section A: an empty/absent runtime configuration source resolves both
//              substrates to undefined — today's exact ui/main.js state
//   Section B: a runtime configuration source carrying a real signer/
//              publishImpl resolves real options objects, identical to
//              calling the 0.9.105 resolvers directly
//   Section C: `arweave`/`nostr` are two independent sections — supplying
//              only one never affects the other
//   Section D: FLAGSHIP — the resolved configuration composes into a real
//              command that reaches the real orchestrator/executor
//   Section E: architectural regression

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function signedPublication(overrides = {}) {
    const publication = new Publication({
        id: 'pub-runtime-config-1',
        documentId: 'doc-runtime-config-1',
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
    // Section A — empty/absent source resolves undefined for both.
    // ---------------------------------------------------------------
    {
        const empty = resolvePublicationDistributionRuntimeConfiguration({});
        assert(empty.arweaveUploaderOptions === undefined, '1. an empty source resolves arweaveUploaderOptions to undefined');
        assert(empty.nostrPublisherOptions === undefined, '2. an empty source resolves nostrPublisherOptions to undefined');

        const noArgument = resolvePublicationDistributionRuntimeConfiguration();
        assert(noArgument.arweaveUploaderOptions === undefined && noArgument.nostrPublisherOptions === undefined,
            '3. calling with no argument at all behaves identically to an empty object — today\'s exact ui/main.js call shape');

        console.log('✓ Section A: an empty/absent runtime configuration source resolves both substrates to undefined, exactly today\'s ui/main.js state');
    }

    // ---------------------------------------------------------------
    // Section B — a real source resolves real options, identical to
    // calling the 0.9.105 resolvers directly.
    // ---------------------------------------------------------------
    {
        const transactionId = 'RuntimeConfigTransactionId123456789';
        const eventId = 'e'.repeat(64);
        const signer = fakeSigner(transactionId);
        const fetchImpl = fakeFetchImpl();
        const publishImpl = fakePublishImpl(eventId);

        const resolved = resolvePublicationDistributionRuntimeConfiguration({
            arweave: { signer, fetchImpl },
            nostr: { publishImpl, relayUrl: 'wss://relay.example', discoveryTag: 'forkbuild-runtime-config' }
        });

        const direct = {
            arweaveUploaderOptions: resolveArweaveUploaderOptions({ signer, fetchImpl }),
            nostrPublisherOptions: resolveNostrPublisherOptions({ publishImpl, relayUrl: 'wss://relay.example', discoveryTag: 'forkbuild-runtime-config' })
        };

        assert(resolved.arweaveUploaderOptions !== undefined, '4. a real signer resolves a real arweaveUploaderOptions');
        assert(resolved.arweaveUploaderOptions.signer === direct.arweaveUploaderOptions.signer, '5. the resolved signer is forwarded verbatim, identical to calling resolveArweaveUploaderOptions() directly');
        assert(resolved.nostrPublisherOptions !== undefined, '6. a real publishImpl/discoveryTag resolves a real nostrPublisherOptions');
        assert(resolved.nostrPublisherOptions.discoveryTag === direct.nostrPublisherOptions.discoveryTag, '7. the resolved discoveryTag is forwarded verbatim, identical to calling resolveNostrPublisherOptions() directly');

        console.log('✓ Section B: a runtime configuration source carrying a real signer/publishImpl resolves real options objects, identical to calling the 0.9.105 resolvers directly');
    }

    // ---------------------------------------------------------------
    // Section C — arweave/nostr are independent sections.
    // ---------------------------------------------------------------
    {
        const arweaveOnly = resolvePublicationDistributionRuntimeConfiguration({
            arweave: { signer: fakeSigner('ArweaveOnlyTransactionId000000000') }
        });
        assert(arweaveOnly.arweaveUploaderOptions !== undefined, '8. supplying only arweave resolves a real arweaveUploaderOptions');
        assert(arweaveOnly.nostrPublisherOptions === undefined, '9. supplying only arweave leaves nostrPublisherOptions undefined — nostr is never inferred from arweave');

        const nostrOnly = resolvePublicationDistributionRuntimeConfiguration({
            nostr: { publishImpl: fakePublishImpl('f'.repeat(64)), discoveryTag: 'forkbuild-nostr-only' }
        });
        assert(nostrOnly.nostrPublisherOptions !== undefined, '10. supplying only nostr resolves a real nostrPublisherOptions');
        assert(nostrOnly.arweaveUploaderOptions === undefined, '11. supplying only nostr leaves arweaveUploaderOptions undefined — arweave is never inferred from nostr');

        console.log('✓ Section C: arweave/nostr are two independent sections — supplying only one never affects the other');
    }

    // ---------------------------------------------------------------
    // Section D — FLAGSHIP: the resolved configuration composes into a
    // real command that reaches the real orchestrator/executor.
    // ---------------------------------------------------------------
    {
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const publication = signedPublication();
        const transactionId = 'RuntimeConfigFlagshipTransactionId1';
        const eventId = 'a'.repeat(64);

        // The exact shape a runtime configuration source (e.g. a future
        // wallet adapter's already-connected signer) would hand ui/main.js.
        const publicationDistributionRuntimeConfiguration = {
            arweave: { signer: fakeSigner(transactionId), fetchImpl: fakeFetchImpl() },
            nostr: { publishImpl: fakePublishImpl(eventId), relayUrl: 'wss://relay.example', discoveryTag: 'forkbuild-runtime-flagship' }
        };

        const { arweaveUploaderOptions, nostrPublisherOptions } = resolvePublicationDistributionRuntimeConfiguration(publicationDistributionRuntimeConfiguration);
        const publicationDistributionCommand = composePublicationDistributionCommand({
            lifecycleStore,
            arweaveUploaderOptions,
            nostrPublisherOptions
        });

        const result = await publicationDistributionCommand({
            publication,
            serializedMaterial: JSON.stringify(publication.toJSON())
        });

        assert(result !== null, '12. FLAGSHIP — the composed command resolves a real result');
        assert(result.material !== null && result.material.uri === `ar://${transactionId}`, '13. FLAGSHIP — the real orchestrator/executor actually uploaded through the runtime-resolved configuration');
        assert(result.discovery !== null && result.discovery.id === eventId, '14. FLAGSHIP — the real orchestrator/executor actually published through the runtime-resolved configuration');

        const lifecycle = lifecycleStore.get(publication.id);
        assert(lifecycle.material.state === PublicationDistributionState.PRESENT && lifecycle.discovery.state === PublicationDistributionState.PRESENT,
            '15. FLAGSHIP — the same lifecycle store World View observes now holds a real, complete distribution fact, reached entirely through a single runtime configuration object');

        console.log('✓ Section D: FLAGSHIP — a single runtime configuration object resolves into a real command that reaches the real orchestrator/executor end to end');
    }

    // ---------------------------------------------------------------
    // Section E — architectural regression.
    // ---------------------------------------------------------------
    {
        const sourceUrl = new URL('../application/PublicationDistributionRuntimeConfiguration.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(codeOnly.includes("import { resolveArweaveUploaderOptions, resolveNostrPublisherOptions } from './PublicationDistributionConfigurationProvider.js'"),
            '16. imports exactly the existing 0.9.105 resolvers — never a second implementation');
        assert(!codeOnly.includes('ArweavePublicationMaterialUploader') && !codeOnly.includes('NostrPublicationDiscoveryPublisher') && !codeOnly.includes('orchestratePublicationDistribution'),
            '17. never constructs distribution infrastructure or calls the orchestrator directly');
        assert(!codeOnly.includes("'../ui/") && !codeOnly.includes('"../ui/'), '18. no UI import of any kind');
        assert(!codeOnly.includes('localStorage') && !codeOnly.includes('window.'), '19. no persistence, no window/browser global read — a pure function of its own argument');
        assert((codeOnly.match(/\bexport\s+function\b/g) || []).length === 1, '20. exports exactly one function');
        assert((codeOnly.match(/resolveArweaveUploaderOptions\(/g) || []).length === 1 && (codeOnly.match(/resolveNostrPublisherOptions\(/g) || []).length === 1,
            '21. calls each 0.9.105 resolver exactly once');

        console.log('✓ Section E: architectural regression — a pure shape-forwarding seam, no re-implemented resolution logic, no UI import');
    }

    console.log('\nAll PublicationDistributionRuntimeConfiguration tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
