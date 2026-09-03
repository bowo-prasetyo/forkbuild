import { readFile } from 'node:fs/promises';
import { composePublicationDistributionCommand } from '../application/PublicationDistributionCommandComposition.js';
import { resolveArweaveUploaderOptions, resolveNostrPublisherOptions } from '../application/PublicationDistributionConfigurationProvider.js';
import { PublicationDistributionLifecycleMemoryStore } from '../application/PublicationDistributionLifecycleStore.js';
import { PublicationDistributionState } from '../application/PublicationDistributionLifecycle.js';
import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { Signature } from '../core/Signature.js';

// 0.9.105 — Publication Distribution Configuration Boundary.
// See docs/Roadmap.md, "0.9.105 — Publication Distribution Configuration
// Boundary," for the full milestone story.
//
//   Section A: FLAGSHIP — a command composed with real, resolved
//              configuration reaches the real orchestrator/executor and
//              actually succeeds, with the calling request supplying
//              nothing but { publication, serializedMaterial } — exactly
//              WorldView.js's own shape
//   Section B: the composed command reaches TODAY's exact honest failure
//              when composed the way ui/main.js composes it right now
//              (both resolvers given nothing) — this milestone changes no
//              observable behavior in the running app
//   Section C: the three composition-root collaborators always win over
//              anything a caller's own request happens to carry
//   Section D: two composed commands are entirely independent — no shared
//              state between them
//   Section E: architectural regression

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch (e) { threw = true; }
    assert(threw, message);
}

function signedPublication(overrides = {}) {
    const publication = new Publication({
        id: 'pub-composed-1',
        documentId: 'doc-composed-1',
        title: 'A Composition-Configured Publication',
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

// Stands in for whatever real capability a browser wallet extension /
// relay client would eventually supply — see application/
// PublicationDistributionConfigurationProvider.js's own header, "Nothing
// real to resolve yet." Fed to the REAL resolveArweaveUploaderOptions()/
// resolveNostrPublisherOptions() — not bypassed — so this test proves the
// actual composition-root code path, not a test-only replica of it.
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
    // Section A — FLAGSHIP.
    // ---------------------------------------------------------------
    {
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const publication = signedPublication();
        const transactionId = 'ComposedFlagshipTransactionId123456789';
        const eventId = 'a'.repeat(64);

        // The exact two calls ui/main.js itself makes — real resolvers, fed
        // fake collaborators standing in for a real wallet/relay capability
        // this codebase does not concretely implement yet (see
        // PublicationDistributionConfigurationProvider.js's own header).
        const arweaveUploaderOptions = resolveArweaveUploaderOptions({
            signer: fakeSigner(transactionId),
            fetchImpl: fakeFetchImpl()
        });
        const nostrPublisherOptions = resolveNostrPublisherOptions({
            publishImpl: fakePublishImpl(eventId),
            relayUrl: 'wss://relay.example',
            discoveryTag: 'forkbuild-composed'
        });
        assert(arweaveUploaderOptions !== undefined && nostrPublisherOptions !== undefined, '1. FLAGSHIP — both resolvers actually resolved real configuration');

        const publicationDistributionCommand = composePublicationDistributionCommand({
            lifecycleStore,
            arweaveUploaderOptions,
            nostrPublisherOptions
        });

        // The exact request shape ui/views/WorldView.js's own
        // distributeWorldEncounterPublication() supplies — nothing about
        // signer/relay configuration, ever.
        const result = await publicationDistributionCommand({
            publication,
            serializedMaterial: JSON.stringify(publication.toJSON())
        });

        assert(result !== null, '2. FLAGSHIP — the composed command resolves a real result');
        assert(result.material !== null && result.material.uri === `ar://${transactionId}`, '3. FLAGSHIP — the real orchestrator/executor actually uploaded through the composed configuration');
        assert(result.discovery !== null && result.discovery.id === eventId, '4. FLAGSHIP — the real orchestrator/executor actually published through the composed configuration');

        const lifecycle = lifecycleStore.get(publication.id);
        assert(lifecycle.material.state === PublicationDistributionState.PRESENT && lifecycle.discovery.state === PublicationDistributionState.PRESENT,
            '5. FLAGSHIP — the SAME lifecycle store World View observes now holds a real, complete distribution fact — the exact "Distribution could not be completed" path now reaches success when valid configuration is supplied');

        console.log('✓ Flagship: a command composed with real, resolved configuration reaches the real orchestrator/executor and actually succeeds, from a request carrying nothing but { publication, serializedMaterial }');
    }

    // ---------------------------------------------------------------
    // Section B — today's exact composition (ui/main.js's own call shape)
    // still reaches today's exact honest failure.
    // ---------------------------------------------------------------
    {
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const publication = signedPublication({ id: 'pub-composed-b' });

        const publicationDistributionCommand = composePublicationDistributionCommand({
            lifecycleStore,
            arweaveUploaderOptions: resolveArweaveUploaderOptions({}),
            nostrPublisherOptions: resolveNostrPublisherOptions({})
        });

        expectThrows(
            () => publicationDistributionCommand({ publication, serializedMaterial: JSON.stringify(publication.toJSON()) }),
            '6. with nothing real to resolve (today\'s exact ui/main.js state), the composed command still throws synchronously for the missing signer — this milestone changes no observable behavior in the running app'
        );
        assert(lifecycleStore.get(publication.id) === null, '7. an unconfigured attempt never touches the lifecycle store');

        console.log('✓ Section B: composed the way ui/main.js composes it today, the command reaches exactly today\'s existing honest failure — no regression, no fabricated success');
    }

    // ---------------------------------------------------------------
    // Section C — pre-bound collaborators always win over a caller's own
    // request.
    // ---------------------------------------------------------------
    {
        const realStore = new PublicationDistributionLifecycleMemoryStore();
        const decoyStore = { get: () => { throw new Error('the decoy store must never be consulted'); }, set: () => { throw new Error('the decoy store must never be consulted'); } };
        const publication = signedPublication({ id: 'pub-composed-c' });
        const realArweaveOptions = resolveArweaveUploaderOptions({ signer: fakeSigner('RealTransactionId0000000000000000'), fetchImpl: fakeFetchImpl() });
        const realNostrOptions = resolveNostrPublisherOptions({ publishImpl: fakePublishImpl('b'.repeat(64)), discoveryTag: 'forkbuild-composed-c' });

        const publicationDistributionCommand = composePublicationDistributionCommand({
            lifecycleStore: realStore,
            arweaveUploaderOptions: realArweaveOptions,
            nostrPublisherOptions: realNostrOptions
        });

        const result = await publicationDistributionCommand({
            publication,
            serializedMaterial: JSON.stringify(publication.toJSON()),
            // A caller attempting to supply its own collaborators, exactly
            // as WorldView.js never does today — all three must be ignored.
            lifecycleStore: decoyStore,
            arweaveUploaderOptions: { signer: { sign: async () => { throw new Error('the decoy signer must never be consulted'); } } },
            nostrPublisherOptions: { discoveryTag: 'decoy', publishImpl: async () => { throw new Error('the decoy publishImpl must never be consulted'); } }
        });

        assert(result.material.uri === 'ar://RealTransactionId0000000000000000', '8. the composition-root\'s own arweaveUploaderOptions wins over a request-supplied one');
        assert(realStore.get(publication.id) !== null, '9. the composition-root\'s own lifecycleStore is the one actually written to');

        console.log('✓ Section C: composition-root collaborators (lifecycleStore, arweaveUploaderOptions, nostrPublisherOptions) always win over anything a caller\'s own request carries');
    }

    // ---------------------------------------------------------------
    // Section D — two composed commands are entirely independent.
    // ---------------------------------------------------------------
    {
        const storeOne = new PublicationDistributionLifecycleMemoryStore();
        const storeTwo = new PublicationDistributionLifecycleMemoryStore();
        const publication = signedPublication({ id: 'pub-composed-d' });

        const commandOne = composePublicationDistributionCommand({
            lifecycleStore: storeOne,
            arweaveUploaderOptions: resolveArweaveUploaderOptions({ signer: fakeSigner('IndependentTxOne00000000000000000'), fetchImpl: fakeFetchImpl() }),
            nostrPublisherOptions: resolveNostrPublisherOptions({ publishImpl: fakePublishImpl('c'.repeat(64)), discoveryTag: 'forkbuild-d-one' })
        });
        const commandTwo = composePublicationDistributionCommand({
            lifecycleStore: storeTwo,
            arweaveUploaderOptions: resolveArweaveUploaderOptions({}),
            nostrPublisherOptions: resolveNostrPublisherOptions({})
        });

        await commandOne({ publication, serializedMaterial: JSON.stringify(publication.toJSON()) });
        assert(storeOne.get(publication.id) !== null, '10. the first composed command\'s own store received the real result');
        assert(storeTwo.get(publication.id) === null, '11. the second, independently composed command\'s own store is entirely unaffected');

        expectThrows(
            () => commandTwo({ publication, serializedMaterial: JSON.stringify(publication.toJSON()) }),
            '12. the second command, composed with no real configuration, still throws on its own — one composed command never leaks configuration into another'
        );

        console.log('✓ Section D: two composed commands hold entirely independent configuration and lifecycle stores');
    }

    // ---------------------------------------------------------------
    // Section E — architectural regression.
    // ---------------------------------------------------------------
    {
        const sourceUrl = new URL('../application/PublicationDistributionCommandComposition.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(codeOnly.includes("import { executePublicationDistributionCommand } from './PublicationDistributionCommand.js'"),
            '13. imports exactly the existing 0.9.103 command — never a second implementation');
        assert(!codeOnly.includes('ArweavePublicationMaterialUploader') && !codeOnly.includes('NostrPublicationDiscoveryPublisher') && !codeOnly.includes('orchestratePublicationDistribution'),
            '14. never constructs distribution infrastructure or calls the orchestrator directly — that stays entirely 0.9.103\'s own concern');
        assert(!codeOnly.includes("'../ui/") && !codeOnly.includes('"../ui/'), '15. no UI import of any kind');
        assert((codeOnly.match(/\bexport\s+function\b/g) || []).length === 1, '16. exports exactly one function');
        assert((codeOnly.match(/executePublicationDistributionCommand\(/g) || []).length === 1, '17. calls executePublicationDistributionCommand exactly once');

        console.log('✓ Section E: architectural regression — a pure composition seam, no re-implemented distribution logic, no UI import');
    }

    console.log('\nAll PublicationDistributionCommandComposition tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
