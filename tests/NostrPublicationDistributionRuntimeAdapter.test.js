import { readFile } from 'node:fs/promises';
import { createNostrPublicationDistributionRuntimeAdapter } from '../application/NostrPublicationDistributionRuntimeAdapter.js';
import { createPublicationDistributionRuntimeProvider } from '../application/PublicationDistributionRuntimeProvider.js';
import { resolvePublicationDistributionRuntimeConfiguration } from '../application/PublicationDistributionRuntimeConfiguration.js';
import { composePublicationDistributionCommand } from '../application/PublicationDistributionCommandComposition.js';
import { PublicationDistributionLifecycleMemoryStore } from '../application/PublicationDistributionLifecycleStore.js';
import { PublicationDistributionState } from '../application/PublicationDistributionLifecycle.js';
import { NostrPublicationDiscoveryPublisher } from '../application/NostrPublicationDiscoveryPublisher.js';
import { describePublicationDistribution } from '../application/PublicationDistributionDescriptor.js';
import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { Signature } from '../core/Signature.js';

// 0.9.108 — Nostr Publication Discovery Runtime Adapter.
// See docs/Roadmap.md, "0.9.108 — Nostr Publication Discovery Runtime
// Adapter," for the full milestone story.
//
//   Section A: publish renames onto publishImpl, relayUrl forwarded verbatim
//   Section B: no host capability supplied — undefined, never a throw
//   Section C: the adapter's own output is spread-compatible with
//              createPublicationDistributionRuntimeProvider()'s own input
//              vocabulary, identical to handing publishImpl directly
//   Section D: FLAGSHIP — a fake host publisher, adapted through this file,
//              reaches the real orchestrator/executor/lifecycle end to end
//   Section E: independent substrate — no Arweave capability supplied at
//              any layer; the adapter's own Nostr capability still resolves
//              to a real, independently usable NostrPublicationDiscoveryPublisher
//   Section F: architectural regression

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function signedPublication(overrides = {}) {
    const publication = new Publication({
        id: 'pub-nostr-adapter-1',
        documentId: 'doc-nostr-adapter-1',
        title: 'A Nostr-Adapter-Distributed Publication',
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

function fakeHostPublisher(eventId) {
    return async (relayUrl, eventTemplate) => {
        assert(typeof relayUrl === 'string' && relayUrl.length > 0, 'fakeHostPublisher received a relayUrl');
        assert(eventTemplate && typeof eventTemplate.content === 'string', 'fakeHostPublisher received a real event template');
        return { published: true, id: eventId };
    };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — publish renames onto publishImpl, relayUrl forwarded
    // verbatim.
    // ---------------------------------------------------------------
    {
        const publish = async () => ({ published: true, id: 'a'.repeat(64) });
        const adapted = createNostrPublicationDistributionRuntimeAdapter({ publish, relayUrl: 'wss://relay.example' });

        assert(adapted.publishImpl === publish, '1. publish is forwarded verbatim onto publishImpl — never wrapped, never re-implemented');
        assert(adapted.relayUrl === 'wss://relay.example', '2. relayUrl is forwarded verbatim');

        console.log('✓ Section A: a host publish capability renames onto publishImpl, relayUrl forwarded verbatim');
    }

    // ---------------------------------------------------------------
    // Section B — no host capability supplied — undefined, never a throw.
    // ---------------------------------------------------------------
    {
        const adapted = createNostrPublicationDistributionRuntimeAdapter({});
        assert(adapted.publishImpl === undefined, '3. no publish supplied degrades to publishImpl: undefined, never a throw');
        assert(adapted.relayUrl === undefined, '4. no relayUrl supplied degrades to relayUrl: undefined');

        const noArgument = createNostrPublicationDistributionRuntimeAdapter();
        assert(noArgument.publishImpl === undefined && noArgument.relayUrl === undefined,
            '5. calling with no argument at all behaves identically to an empty object');

        console.log('✓ Section B: no host capability supplied degrades gracefully to undefined, never a throw');
    }

    // ---------------------------------------------------------------
    // Section C — the adapter's own output is spread-compatible with
    // createPublicationDistributionRuntimeProvider()'s own input vocabulary.
    // ---------------------------------------------------------------
    {
        const publishImplDirect = async () => ({ published: true, id: 'c'.repeat(64) });
        const adapted = createNostrPublicationDistributionRuntimeAdapter({ publish: publishImplDirect, relayUrl: 'wss://relay.example' });

        const providerViaAdapter = createPublicationDistributionRuntimeProvider({
            ...adapted,
            discoveryTag: 'forkbuild-nostr-adapter'
        });
        const providerDirect = createPublicationDistributionRuntimeProvider({
            publishImpl: publishImplDirect,
            relayUrl: 'wss://relay.example',
            discoveryTag: 'forkbuild-nostr-adapter'
        });

        const resolvedViaAdapter = resolvePublicationDistributionRuntimeConfiguration(providerViaAdapter.resolveRuntimeCapabilities());
        const resolvedDirect = resolvePublicationDistributionRuntimeConfiguration(providerDirect.resolveRuntimeCapabilities());

        assert(resolvedViaAdapter.nostrPublisherOptions !== undefined, '6. spreading the adapter\'s own output resolves a real nostrPublisherOptions');
        assert(resolvedViaAdapter.nostrPublisherOptions.publishImpl === resolvedDirect.nostrPublisherOptions.publishImpl,
            '7. going through the adapter resolves the identical publishImpl a direct call would');
        assert(resolvedViaAdapter.nostrPublisherOptions.relayUrl === resolvedDirect.nostrPublisherOptions.relayUrl,
            '8. going through the adapter resolves the identical relayUrl a direct call would');
        assert(resolvedViaAdapter.arweaveUploaderOptions === undefined, '9. the adapter contributes nothing to the arweave section');

        console.log('✓ Section C: the adapter\'s own output is spread-compatible with the runtime provider\'s existing input vocabulary');
    }

    // ---------------------------------------------------------------
    // Section D — FLAGSHIP: a fake host publisher, adapted through this
    // file, reaches the real orchestrator/executor/lifecycle end to end.
    // ---------------------------------------------------------------
    {
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const publication = signedPublication();
        const transactionId = 'NostrAdapterFlagshipTxId123456789';
        const eventId = 'd'.repeat(64);

        // The one thing this milestone actually introduces: a host's own
        // publishing capability, named "publish" from the host's own
        // vantage point, adapted into this codebase's existing publishImpl
        // vocabulary.
        const nostrRuntimeCapabilities = createNostrPublicationDistributionRuntimeAdapter({
            publish: fakeHostPublisher(eventId),
            relayUrl: 'wss://relay.example'
        });

        // This flagship test is scoped to the Nostr adapter alone — a plain
        // fake signer supplied directly, exactly as every prior milestone's
        // own flagship test already does, rather than through 0.9.109's own
        // (now-shipped) Arweave adapter, which has its own dedicated
        // flagship test.
        const provider = createPublicationDistributionRuntimeProvider({
            signer: { sign: async () => ({ id: transactionId, transaction: {} }) },
            fetchImpl: async () => gatewayResponse('accepted'),
            ...nostrRuntimeCapabilities,
            discoveryTag: 'forkbuild-nostr-adapter-flagship'
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

        assert(result !== null, '10. FLAGSHIP — the composed command resolves a real result');
        assert(result.material !== null && result.material.uri === `ar://${transactionId}`, '11. FLAGSHIP — the arweave side still uploads normally, untouched by this milestone');
        assert(result.discovery !== null && result.discovery.id === eventId, '12. FLAGSHIP — the event id came from the fake HOST publisher, proving this file\'s own translation actually powered the real publish');

        const lifecycle = lifecycleStore.get(publication.id);
        assert(lifecycle.material.state === PublicationDistributionState.PRESENT && lifecycle.discovery.state === PublicationDistributionState.PRESENT,
            '13. FLAGSHIP — the same lifecycle store World View observes now holds a real, complete distribution fact, reached entirely through the new Nostr runtime adapter');

        console.log('✓ Section D: FLAGSHIP — a fake host publisher, adapted through this file, resolves into a real command that reaches the real orchestrator/executor/lifecycle end to end');
    }

    // ---------------------------------------------------------------
    // Section E — independent substrate: no Arweave capability supplied at
    // any layer; the adapter's own Nostr capability still resolves to a
    // real, independently usable NostrPublicationDiscoveryPublisher.
    // ---------------------------------------------------------------
    {
        // orchestratePublicationDistribution()'s own upload-first sequencing
        // (0.9.49, unmodified, out of scope for this milestone) means a full
        // ORCHESTRATED distribution still requires a working material
        // upload before it ever attempts a publish — that is an existing,
        // unrelated restraint this milestone does not revisit. What this
        // section proves instead is the level at which Nostr genuinely IS
        // independent of Arweave in this architecture: the runtime
        // provider/configuration layer, and the Nostr publisher itself.
        const eventId = 'e'.repeat(64);
        const nostrRuntimeCapabilities = createNostrPublicationDistributionRuntimeAdapter({
            publish: fakeHostPublisher(eventId),
            relayUrl: 'wss://relay.example'
        });

        // No signer, no gatewayUrl, no fetchImpl supplied anywhere — the
        // arweave side of the provider's own vocabulary is entirely absent.
        const provider = createPublicationDistributionRuntimeProvider({
            ...nostrRuntimeCapabilities,
            discoveryTag: 'forkbuild-nostr-adapter-independent'
        });
        const { arweaveUploaderOptions, nostrPublisherOptions } = resolvePublicationDistributionRuntimeConfiguration(provider.resolveRuntimeCapabilities());

        assert(arweaveUploaderOptions === undefined, '14. independent substrate — no arweave capability was ever supplied, so arweaveUploaderOptions stays undefined');
        assert(nostrPublisherOptions !== undefined, '15. independent substrate — the adapter\'s own nostr capability resolves to a real nostrPublisherOptions regardless');

        // The Nostr publisher itself, built from exactly what the adapter
        // resolved, works completely on its own — no ArweavePublicationMaterialUploader
        // is ever constructed anywhere in this section.
        const publisher = new NostrPublicationDiscoveryPublisher(nostrPublisherOptions);
        const publication = signedPublication({ id: 'pub-nostr-adapter-independent' });
        const distribution = describePublicationDistribution({ publication, materialUri: 'ar://already-known-tx', materialStorage: 'ar' });
        const published = await publisher.publish(distribution.discoveryEnvelope);

        assert(published !== null && published.id === eventId, '16. independent substrate — Nostr remains fully usable, publishing successfully with zero Arweave-side configuration in play');

        console.log('✓ Section E: with no Arweave capability supplied anywhere, the adapter\'s own Nostr capability still resolves and publishes independently');
    }

    // ---------------------------------------------------------------
    // Section F — architectural regression.
    // ---------------------------------------------------------------
    {
        const sourceUrl = new URL('../application/NostrPublicationDistributionRuntimeAdapter.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(!/NostrPublicationDiscoveryPublisher|NostrDiscoveryQueryService|PublicationDistributionRuntimeProvider|PublicationDistributionRuntimeComposition|PublicationDistributionExecutor|PublicationDistributionOrchestrator|orchestratePublicationDistribution|ArweavePublicationMaterialUploader/.test(codeOnly),
            '17. never imports or constructs any Nostr/Arweave/distribution infrastructure — a pure bridge, not an abstraction layer');
        assert(!codeOnly.includes("'../ui/") && !codeOnly.includes('"../ui/'), '18. no UI import of any kind');
        assert(!codeOnly.includes('localStorage') && !codeOnly.includes('window.'), '19. no persistence, no window/browser global read — a pure factory of its own argument');
        assert(!/\basync\b|Promise|\.then\(|await\b/.test(codeOnly), '20. no asynchronous connection of any kind — a synchronous factory, exactly like the seam beneath it');
        assert((codeOnly.match(/\bexport\s+function\b/g) || []).length === 1, '21. exports exactly one function');
        assert(!/discoveryTag|tagName|\bkind\b/.test(codeOnly), '22. never reads or resolves discoveryTag/tagName/kind — ForkBuild\'s own campaign configuration, never a host concern');

        console.log('✓ Section F: architectural regression — a thin, synchronous bridge, no Nostr abstraction layer, no UI import, no distribution infrastructure');
    }

    console.log('\nAll NostrPublicationDistributionRuntimeAdapter tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
