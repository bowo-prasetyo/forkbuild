import { readFile } from 'node:fs/promises';
import { resolveArweaveUploaderOptions, resolveNostrPublisherOptions } from '../application/PublicationDistributionConfigurationProvider.js';

// 0.9.105 — Publication Distribution Configuration Boundary.
// See docs/Roadmap.md, "0.9.105 — Publication Distribution Configuration
// Boundary," for the full milestone story.
//
//   Section A: resolveArweaveUploaderOptions — no signer, or a signer
//              missing sign(), resolves undefined
//   Section B: resolveArweaveUploaderOptions — a real signer resolves a
//              usable options object, every other field forwarded verbatim
//   Section C: resolveNostrPublisherOptions — no publishImpl, or a missing/
//              empty discoveryTag, resolves undefined
//   Section D: resolveNostrPublisherOptions — valid input resolves a usable
//              options object, every other field forwarded verbatim
//   Section E: neither resolver mutates its own input or the app-wide
//              defaults either underlying constructor already owns
//   Section F: architectural regression

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — resolveArweaveUploaderOptions: unresolvable input.
    // ---------------------------------------------------------------
    {
        assert(resolveArweaveUploaderOptions() === undefined, '1. no arguments at all resolves undefined');
        assert(resolveArweaveUploaderOptions({}) === undefined, '2. an empty options object resolves undefined — nothing configured');
        assert(resolveArweaveUploaderOptions({ signer: null }) === undefined, '3. an explicit null signer resolves undefined');
        assert(resolveArweaveUploaderOptions({ signer: {} }) === undefined, '4. a signer with no sign() function resolves undefined');
        assert(resolveArweaveUploaderOptions({ signer: { sign: 'not-a-function' } }) === undefined, '5. a signer whose sign is not a function resolves undefined');

        console.log('✓ Section A: resolveArweaveUploaderOptions resolves undefined for any signer that could not actually sign');
    }

    // ---------------------------------------------------------------
    // Section B — resolveArweaveUploaderOptions: real input.
    // ---------------------------------------------------------------
    {
        const signer = { sign: async () => ({ id: 'tx', transaction: {} }) };
        const fetchImpl = async () => {};

        const minimal = resolveArweaveUploaderOptions({ signer });
        assert(minimal !== undefined, '6. a signer with a sign() function alone is enough to resolve');
        assert(minimal.signer === signer, '7. the exact signer instance is forwarded, never wrapped or copied');
        assert(minimal.gatewayUrl === undefined, '8. an unsupplied gatewayUrl stays undefined — no default invented here, 0.9.45\'s own constructor default still applies');
        assert(minimal.fetchImpl === undefined, '9. an unsupplied fetchImpl stays undefined');

        const full = resolveArweaveUploaderOptions({ signer, gatewayUrl: 'https://custom.gateway', fetchImpl });
        assert(full.gatewayUrl === 'https://custom.gateway', '10. a supplied gatewayUrl is forwarded verbatim');
        assert(full.fetchImpl === fetchImpl, '11. a supplied fetchImpl is forwarded verbatim, the exact same reference');

        console.log('✓ Section B: resolveArweaveUploaderOptions resolves a usable options object once a real signer is present, forwarding every other field verbatim');
    }

    // ---------------------------------------------------------------
    // Section C — resolveNostrPublisherOptions: unresolvable input.
    // ---------------------------------------------------------------
    {
        const publishImpl = async () => ({ published: true, id: 'a'.repeat(64) });

        assert(resolveNostrPublisherOptions() === undefined, '12. no arguments at all resolves undefined');
        assert(resolveNostrPublisherOptions({}) === undefined, '13. an empty options object resolves undefined');
        assert(resolveNostrPublisherOptions({ discoveryTag: 'forkbuild' }) === undefined, '14. a discoveryTag with no publishImpl resolves undefined');
        assert(resolveNostrPublisherOptions({ publishImpl }) === undefined, '15. a publishImpl with no discoveryTag resolves undefined');
        assert(resolveNostrPublisherOptions({ publishImpl, discoveryTag: '' }) === undefined, '16. an empty-string discoveryTag resolves undefined');
        assert(resolveNostrPublisherOptions({ publishImpl, discoveryTag: '   ' }) === undefined, '17. a whitespace-only discoveryTag resolves undefined');
        assert(resolveNostrPublisherOptions({ publishImpl: 'not-a-function', discoveryTag: 'forkbuild' }) === undefined, '18. a non-function publishImpl resolves undefined');

        console.log('✓ Section C: resolveNostrPublisherOptions resolves undefined unless BOTH a real publishImpl and a non-empty discoveryTag are present');
    }

    // ---------------------------------------------------------------
    // Section D — resolveNostrPublisherOptions: real input.
    // ---------------------------------------------------------------
    {
        const publishImpl = async () => ({ published: true, id: 'a'.repeat(64) });

        const minimal = resolveNostrPublisherOptions({ publishImpl, discoveryTag: 'forkbuild' });
        assert(minimal !== undefined, '19. a publishImpl plus a non-empty discoveryTag alone is enough to resolve');
        assert(minimal.publishImpl === publishImpl, '20. the exact publishImpl instance is forwarded, never wrapped');
        assert(minimal.discoveryTag === 'forkbuild', '21. discoveryTag is forwarded verbatim');
        assert(minimal.relayUrl === undefined, '22. an unsupplied relayUrl stays undefined — 0.9.46\'s own constructor default still applies');
        assert(minimal.tagName === undefined && minimal.kind === undefined, '23. unsupplied tagName/kind stay undefined');

        const full = resolveNostrPublisherOptions({ publishImpl, discoveryTag: 'forkbuild', relayUrl: 'wss://relay.example', tagName: 'x', kind: 30078 });
        assert(full.relayUrl === 'wss://relay.example' && full.tagName === 'x' && full.kind === 30078, '24. every other supplied field is forwarded verbatim');

        console.log('✓ Section D: resolveNostrPublisherOptions resolves a usable options object once real input is present, forwarding every other field verbatim');
    }

    // ---------------------------------------------------------------
    // Section E — neither resolver mutates or invents.
    // ---------------------------------------------------------------
    {
        const signer = { sign: async () => ({}) };
        const publishImpl = async () => ({});
        const arweaveInput = { signer, gatewayUrl: 'https://custom.gateway' };
        const nostrInput = { publishImpl, discoveryTag: 'forkbuild' };

        const arweaveResolved = resolveArweaveUploaderOptions(arweaveInput);
        const nostrResolved = resolveNostrPublisherOptions(nostrInput);

        assert(arweaveInput.gatewayUrl === 'https://custom.gateway', '25. the caller\'s own input object is never mutated (Arweave)');
        assert(nostrInput.discoveryTag === 'forkbuild', '26. the caller\'s own input object is never mutated (Nostr)');
        assert(Object.isFrozen(arweaveResolved) && Object.isFrozen(nostrResolved), '27. both resolved options objects are frozen');

        console.log('✓ Section E: neither resolver mutates its own input, and both return frozen results');
    }

    // ---------------------------------------------------------------
    // Section F — architectural regression.
    // ---------------------------------------------------------------
    {
        const sourceUrl = new URL('../application/PublicationDistributionConfigurationProvider.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(!codeOnly.includes('import'), '28. this file imports nothing — two pure functions, no collaborators');
        assert(!codeOnly.includes('ArweavePublicationMaterialUploader') && !codeOnly.includes('NostrPublicationDiscoveryPublisher'),
            '29. never constructs either concrete distribution collaborator — that stays entirely 0.9.47\'s own composition');
        assert(!codeOnly.includes('window') && !codeOnly.includes('process.env') && !codeOnly.includes('import.meta.env') && !codeOnly.includes('localStorage'),
            '30. never reads a browser global, an environment variable, or persisted storage itself — deciding where real values originate stays entirely a caller\'s own concern');
        assert(!/return\s+null\s*;/.test(codeOnly), '31. an unresolvable substrate returns undefined, never null — see this file\'s own header on why that distinction matters');
        assert((codeOnly.match(/\bexport\s+function\b/g) || []).length === 2, '32. exports exactly two functions — no combined "credentials" shape');

        console.log('✓ Section F: architectural regression — two independent, side-effect-free resolver functions, nothing more');
    }

    console.log('\nAll PublicationDistributionConfigurationProvider tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
