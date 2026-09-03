import { readFile } from 'node:fs/promises';
import { createArweavePublicationDistributionRuntimeAdapter } from '../application/ArweavePublicationDistributionRuntimeAdapter.js';
import { createPublicationDistributionRuntimeProvider } from '../application/PublicationDistributionRuntimeProvider.js';
import { resolvePublicationDistributionRuntimeConfiguration } from '../application/PublicationDistributionRuntimeConfiguration.js';
import { composePublicationDistributionCommand } from '../application/PublicationDistributionCommandComposition.js';
import { PublicationDistributionLifecycleMemoryStore } from '../application/PublicationDistributionLifecycleStore.js';
import { PublicationDistributionState } from '../application/PublicationDistributionLifecycle.js';
import { ArweavePublicationMaterialUploader } from '../application/ArweavePublicationMaterialUploader.js';
import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { Signature } from '../core/Signature.js';

// 0.9.109 — Arweave Publication Distribution Runtime Adapter.
// See docs/Roadmap.md, "0.9.109 — Arweave Publication Distribution Runtime
// Adapter," for the full milestone story.
//
//   Section A: signer/gatewayUrl/fetchImpl forwarded verbatim — an identity
//              passthrough, never a rename (Arweave's own vocabulary already
//              matches)
//   Section B: no host capability supplied — undefined, never a throw
//   Section C: the adapter's own output is spread-compatible with
//              createPublicationDistributionRuntimeProvider()'s own input
//              vocabulary, identical to handing signer directly
//   Section D: FLAGSHIP — a fake host signer, adapted through this file,
//              reaches the real orchestrator/executor/lifecycle end to end
//   Section E: independent substrate — Arweave available, Nostr
//              unavailable at any layer; the adapter's own Arweave
//              capability still resolves to a real, independently usable
//              ArweavePublicationMaterialUploader
//   Section F: architectural regression

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function signedPublication(overrides = {}) {
    const publication = new Publication({
        id: 'pub-arweave-adapter-1',
        documentId: 'doc-arweave-adapter-1',
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

function fakeHostSigner(transactionId) {
    return {
        sign: async (material) => {
            assert(typeof material === 'string' && material.length > 0, 'fakeHostSigner received real material');
            return { id: transactionId, transaction: { material } };
        }
    };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — signer/gatewayUrl/fetchImpl forwarded verbatim.
    // ---------------------------------------------------------------
    {
        const signer = { sign: async () => ({ id: 'a'.repeat(43), transaction: {} }) };
        const fetchImpl = async () => gatewayResponse('accepted');
        const adapted = createArweavePublicationDistributionRuntimeAdapter({ signer, gatewayUrl: 'https://gateway.example', fetchImpl });

        assert(adapted.signer === signer, '1. signer is forwarded verbatim — never wrapped, never re-implemented');
        assert(adapted.gatewayUrl === 'https://gateway.example', '2. gatewayUrl is forwarded verbatim');
        assert(adapted.fetchImpl === fetchImpl, '3. fetchImpl is forwarded verbatim');

        console.log('✓ Section A: a host signing capability passes through unchanged — an identity seam, never a rename');
    }

    // ---------------------------------------------------------------
    // Section B — no host capability supplied — undefined, never a throw.
    // ---------------------------------------------------------------
    {
        const adapted = createArweavePublicationDistributionRuntimeAdapter({});
        assert(adapted.signer === undefined, '4. no signer supplied degrades to signer: undefined, never a throw');
        assert(adapted.gatewayUrl === undefined, '5. no gatewayUrl supplied degrades to gatewayUrl: undefined');
        assert(adapted.fetchImpl === undefined, '6. no fetchImpl supplied degrades to fetchImpl: undefined');

        const noArgument = createArweavePublicationDistributionRuntimeAdapter();
        assert(noArgument.signer === undefined && noArgument.gatewayUrl === undefined && noArgument.fetchImpl === undefined,
            '7. calling with no argument at all behaves identically to an empty object');

        console.log('✓ Section B: no host capability supplied degrades gracefully to undefined, never a throw');
    }

    // ---------------------------------------------------------------
    // Section C — the adapter's own output is spread-compatible with
    // createPublicationDistributionRuntimeProvider()'s own input vocabulary.
    // ---------------------------------------------------------------
    {
        const signerDirect = { sign: async () => ({ id: 'c'.repeat(43), transaction: {} }) };
        const adapted = createArweavePublicationDistributionRuntimeAdapter({ signer: signerDirect, gatewayUrl: 'https://gateway.example' });

        const providerViaAdapter = createPublicationDistributionRuntimeProvider({ ...adapted });
        const providerDirect = createPublicationDistributionRuntimeProvider({
            signer: signerDirect,
            gatewayUrl: 'https://gateway.example'
        });

        const resolvedViaAdapter = resolvePublicationDistributionRuntimeConfiguration(providerViaAdapter.resolveRuntimeCapabilities());
        const resolvedDirect = resolvePublicationDistributionRuntimeConfiguration(providerDirect.resolveRuntimeCapabilities());

        assert(resolvedViaAdapter.arweaveUploaderOptions !== undefined, '8. spreading the adapter\'s own output resolves a real arweaveUploaderOptions');
        assert(resolvedViaAdapter.arweaveUploaderOptions.signer === resolvedDirect.arweaveUploaderOptions.signer,
            '9. going through the adapter resolves the identical signer a direct call would');
        assert(resolvedViaAdapter.arweaveUploaderOptions.gatewayUrl === resolvedDirect.arweaveUploaderOptions.gatewayUrl,
            '10. going through the adapter resolves the identical gatewayUrl a direct call would');
        assert(resolvedViaAdapter.nostrPublisherOptions === undefined, '11. the adapter contributes nothing to the nostr section');

        console.log('✓ Section C: the adapter\'s own output is spread-compatible with the runtime provider\'s existing input vocabulary');
    }

    // ---------------------------------------------------------------
    // Section D — FLAGSHIP: a fake host signer, adapted through this file,
    // reaches the real orchestrator/executor/lifecycle end to end.
    // ---------------------------------------------------------------
    {
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const publication = signedPublication();
        const transactionId = 'ArweaveAdapterFlagshipTxId123456789';
        const eventId = 'd'.repeat(64);

        // The one thing this milestone actually introduces: a host's own
        // signing capability, named "signer" from the host's own vantage
        // point — the same name the runtime provider already accepts —
        // adapted through this file into the vocabulary
        // createPublicationDistributionRuntimeProvider() already expects.
        const arweaveRuntimeCapabilities = createArweavePublicationDistributionRuntimeAdapter({
            signer: fakeHostSigner(transactionId),
            fetchImpl: async () => gatewayResponse('accepted')
        });

        // Nostr has its own, already-shipped adapter (0.9.108) — a plain
        // fake publishImpl supplied directly here, exactly as 0.9.108's own
        // flagship test supplied a plain fake Arweave signer directly.
        const provider = createPublicationDistributionRuntimeProvider({
            ...arweaveRuntimeCapabilities,
            publishImpl: async () => ({ published: true, id: eventId }),
            relayUrl: 'wss://relay.example',
            discoveryTag: 'forkbuild-arweave-adapter-flagship'
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

        assert(result !== null, '12. FLAGSHIP — the composed command resolves a real result');
        assert(result.material !== null && result.material.uri === `ar://${transactionId}`, '13. FLAGSHIP — the transaction id came from the fake HOST signer, proving this file\'s own translation actually powered the real upload');
        assert(result.discovery !== null && result.discovery.id === eventId, '14. FLAGSHIP — the nostr side still publishes normally, untouched by this milestone');

        const lifecycle = lifecycleStore.get(publication.id);
        assert(lifecycle.material.state === PublicationDistributionState.PRESENT && lifecycle.discovery.state === PublicationDistributionState.PRESENT,
            '15. FLAGSHIP — the same lifecycle store World View observes now holds a real, complete distribution fact, reached entirely through the new Arweave runtime adapter');

        console.log('✓ Section D: FLAGSHIP — a fake host signer, adapted through this file, resolves into a real command that reaches the real orchestrator/executor/lifecycle end to end');
    }

    // ---------------------------------------------------------------
    // Section E — independent substrate: Arweave available, Nostr
    // unavailable at any layer; the adapter's own Arweave capability still
    // resolves to a real, independently usable ArweavePublicationMaterialUploader.
    // ---------------------------------------------------------------
    {
        // composePublicationDistributionRuntime()'s own unconditional
        // construction of BOTH collaborators (0.9.47, unmodified, out of
        // scope for this milestone) means a full ORCHESTRATED distribution
        // still requires a constructible Nostr publisher even when only
        // Arweave is actually wanted — that is an existing, unrelated
        // restraint this milestone does not revisit (see 0.9.108's own
        // flagship test, Section E, drawing the identical line in the
        // opposite direction). What this section proves instead is the
        // level at which Arweave genuinely IS independent of Nostr in this
        // architecture: the runtime provider/configuration layer, and the
        // Arweave uploader itself.
        const transactionId = 'ArweaveAdapterIndependentTxId123456789';
        const arweaveRuntimeCapabilities = createArweavePublicationDistributionRuntimeAdapter({
            signer: fakeHostSigner(transactionId),
            fetchImpl: async () => gatewayResponse('accepted')
        });

        // No publishImpl, no relayUrl, no discoveryTag supplied anywhere —
        // the nostr side of the provider's own vocabulary is entirely
        // absent.
        const provider = createPublicationDistributionRuntimeProvider({
            ...arweaveRuntimeCapabilities
        });
        const { arweaveUploaderOptions, nostrPublisherOptions } = resolvePublicationDistributionRuntimeConfiguration(provider.resolveRuntimeCapabilities());

        assert(nostrPublisherOptions === undefined, '16. independent substrate — no nostr capability was ever supplied, so nostrPublisherOptions stays undefined');
        assert(arweaveUploaderOptions !== undefined, '17. independent substrate — the adapter\'s own arweave capability resolves to a real arweaveUploaderOptions regardless');

        // The Arweave uploader itself, built from exactly what the adapter
        // resolved, works completely on its own — no
        // NostrPublicationDiscoveryPublisher is ever constructed anywhere
        // in this section.
        const uploader = new ArweavePublicationMaterialUploader(arweaveUploaderOptions);
        const uri = await uploader.upload(JSON.stringify({ hello: 'world' }));

        assert(uri === `ar://${transactionId}`, '18. independent substrate — Arweave remains fully usable, uploading successfully with zero Nostr-side configuration in play');

        console.log('✓ Section E: with no Nostr capability supplied anywhere, the adapter\'s own Arweave capability still resolves and uploads independently');
    }

    // ---------------------------------------------------------------
    // Section F — architectural regression.
    // ---------------------------------------------------------------
    {
        const sourceUrl = new URL('../application/ArweavePublicationDistributionRuntimeAdapter.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(!/ArweavePublicationMaterialUploader|NostrPublicationDiscoveryPublisher|NostrPublicationDistributionRuntimeAdapter|PublicationDistributionRuntimeProvider|PublicationDistributionRuntimeComposition|PublicationDistributionExecutor|PublicationDistributionOrchestrator|orchestratePublicationDistribution/.test(codeOnly),
            '19. never imports or constructs any Arweave/Nostr/distribution infrastructure — a pure bridge, not an abstraction layer');
        assert(!codeOnly.includes("'../ui/") && !codeOnly.includes('"../ui/'), '20. no UI import of any kind');
        assert(!codeOnly.includes('localStorage') && !codeOnly.includes('window.'), '21. no persistence, no window/browser global read — a pure factory of its own argument');
        assert(!/\basync\b|Promise|\.then\(|await\b/.test(codeOnly), '22. no asynchronous connection of any kind — a synchronous factory, exactly like the seam beneath it');
        assert((codeOnly.match(/\bexport\s+function\b/g) || []).length === 1, '23. exports exactly one function');
        assert(!/privateKey|mnemonic|\bseed\b|walletPassword/i.test(codeOnly), '24. never reads or derives a private key, mnemonic, seed, or wallet password — a signer is accepted, never constructed');
        assert(!/gatewayUrl\s*=\s*['"]/.test(codeOnly), '25. never defaults gatewayUrl itself — that remains the uploader\'s own constructor default');

        console.log('✓ Section F: architectural regression — a thin, synchronous identity seam, no wallet system, no key management, no distribution infrastructure');
    }

    console.log('\nAll ArweavePublicationDistributionRuntimeAdapter tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
