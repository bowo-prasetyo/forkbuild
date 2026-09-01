import { readFile } from 'node:fs/promises';
import { describePublicationDistributionLifecycle, PublicationDistributionState } from '../application/PublicationDistributionLifecycle.js';
import { describePublicationDistributionResult } from '../application/PublicationDistributionResult.js';
import { executePublicationDistribution } from '../application/PublicationDistributionExecutor.js';
import { describePublicationDistribution } from '../application/PublicationDistributionDescriptor.js';
import { ArweavePublicationMaterialUploader } from '../application/ArweavePublicationMaterialUploader.js';
import { NostrPublicationDiscoveryPublisher } from '../application/NostrPublicationDiscoveryPublisher.js';
import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { Signature } from '../core/Signature.js';

// 0.9.50 — Publication Distribution Lifecycle State Boundary.
// See docs/Roadmap.md, "0.9.50 — Publication Distribution Lifecycle State
// Boundary," for the full milestone story.
//
//   Section A: FLAGSHIP — the exact 0.9.49 scenario (Arweave upload
//              succeeds, descriptor succeeds, Nostr publish declines)
//              describes to material PRESENT / discovery ABSENT
//   Section B: the four fundamental material x discovery combinations,
//              including discovery-present-without-material, tested
//              deliberately rather than forbidden
//   Section C: provenance is preserved, never reconstructed — uri,
//              discoveryTag, and origin stay three distinct identities
//   Section D: malformed input degrades to null, never throws
//   Section E: determinism and freezing
//   Section F: architectural regression — no I/O, no execution imports,
//              no PENDING/FAILED/status vocabulary

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function signedPublication(overrides = {}) {
    const publication = new Publication({
        id: 'pub-1',
        documentId: 'doc-1',
        title: 'A Signed Publication',
        author: 'author-1',
        contentReference: new ContentReference({ hash: 'legacy-hash', uri: 'ipfs://legacy-cid', storage: 'ipfs' }),
        ...overrides
    });
    if (overrides.signature !== undefined) {
        return publication;
    }
    return publication.withSignature(new Signature({
        algorithm: 'Ed25519',
        signer: 'author-1',
        signature: 'fake-signature-value',
        signedHash: 'fake-signed-hash',
        domain: 'forkbuild'
    }));
}

function makeFakeSigner({ handler } = {}) {
    async function sign(material) {
        return handler ? handler(material) : { id: 'fake-tx-id', transaction: { data: material } };
    }
    return { sign };
}

function gatewayResponse(body, { status = 200 } = {}) {
    return new Response(body, { status });
}

function makeFakeRelay({ handler }) {
    const calls = [];
    async function publishImpl(relayUrl, eventTemplate) {
        calls.push({ relayUrl, eventTemplate });
        return handler(relayUrl, eventTemplate);
    }
    return { calls, publishImpl };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP: the exact 0.9.49 scenario — Arweave upload
    // succeeds, descriptor succeeds, Nostr publish declines ordinarily —
    // describes to material PRESENT / discovery ABSENT, reading execution
    // facts rather than inventing recovery semantics.
    // ---------------------------------------------------------------
    {
        const transactionId = 'LifecycleFlagshipTransactionId123456789';
        const materialUploader = new ArweavePublicationMaterialUploader({
            signer: makeFakeSigner({ handler: () => ({ id: transactionId, transaction: { placeholder: true } }) }),
            fetchImpl: async () => gatewayResponse('accepted')
        });
        const relay = makeFakeRelay({ handler: () => null });
        const discoveryPublisher = new NostrPublicationDiscoveryPublisher({
            relayUrl: 'wss://relay.example',
            discoveryTag: 'forkbuild-publication',
            publishImpl: relay.publishImpl
        });

        const publication = signedPublication();

        const result = await executePublicationDistribution({
            publication,
            serializedMaterial: 'serialized publication material',
            materialUploader,
            distributionDescriptor: describePublicationDistribution,
            discoveryPublisher
        });

        assert(result !== null, 'sanity: 0.9.49 still produces a result for an ordinary Nostr decline after a successful upload');
        assert(result.material !== null && result.discovery === null, 'sanity: material PRESENT, discovery ABSENT is exactly the 0.9.49 decline shape');

        const lifecycle = describePublicationDistributionLifecycle(result);

        assert(lifecycle !== null, '1. FLAGSHIP — a lifecycle is described from the 0.9.49 decline result');
        assert(lifecycle.material.state === PublicationDistributionState.PRESENT, '2. FLAGSHIP — material state is PRESENT: the upload genuinely happened');
        assert(lifecycle.discovery.state === PublicationDistributionState.ABSENT, '3. FLAGSHIP — discovery state is ABSENT: the ordinary Nostr decline, read as a fact, never as a fabricated failure');
        assert(lifecycle.material.uri === `ar://${transactionId}`, '4. FLAGSHIP — material.uri is exactly what the uploader produced, preserved through the lifecycle boundary');
        assert(lifecycle.material.storage === 'ar', '5. FLAGSHIP — material.storage is preserved too');
        assert(!('origin' in lifecycle.discovery) && !('id' in lifecycle.discovery), '6. FLAGSHIP — an ABSENT discovery carries no leftover origin/id fields');

        assert(!('PENDING' in lifecycle) && JSON.stringify(lifecycle).toUpperCase().indexOf('PENDING') === -1, '7. FLAGSHIP — no PENDING/recovery vocabulary appears anywhere in the described lifecycle');

        console.log('✓ Flagship: the exact 0.9.49 decline scenario describes to material PRESENT / discovery ABSENT, reading facts rather than inventing recovery semantics');
    }

    // ---------------------------------------------------------------
    // Section B — the four fundamental material x discovery
    // combinations, each independently valid, never collapsed into one
    // global state.
    // ---------------------------------------------------------------
    {
        const publication = signedPublication();
        const validMaterial = { uri: 'ar://TXVALID', storage: 'ar' };
        const validDiscovery = { relayUrl: 'wss://relay.example', discoveryTag: 'tag-1', id: 'a'.repeat(64) };

        const neitherResult = describePublicationDistributionResult({ publication });
        const neither = describePublicationDistributionLifecycle(neitherResult);
        assert(neither !== null && neither.material.state === 'ABSENT' && neither.discovery.state === 'ABSENT', '8. absent/absent — nothing distributed — describes successfully');

        const materialOnlyResult = describePublicationDistributionResult({ publication, material: validMaterial });
        const materialOnly = describePublicationDistributionLifecycle(materialOnlyResult);
        assert(materialOnly !== null && materialOnly.material.state === 'PRESENT' && materialOnly.discovery.state === 'ABSENT', '9. present/absent — material exists without discovery fact');

        const discoveryOnlyResult = describePublicationDistributionResult({ publication, discovery: validDiscovery });
        const discoveryOnly = describePublicationDistributionLifecycle(discoveryOnlyResult);
        assert(discoveryOnly !== null && discoveryOnly.material.state === 'ABSENT' && discoveryOnly.discovery.state === 'PRESENT', '10. absent/present — a discovery fact without a material fact — deliberately allowed, never rejected as inconsistent');

        const bothResult = describePublicationDistributionResult({ publication, material: validMaterial, discovery: validDiscovery });
        const both = describePublicationDistributionLifecycle(bothResult);
        assert(both !== null && both.material.state === 'PRESENT' && both.discovery.state === 'PRESENT', '11. present/present — both facts available');

        // No single collapsed value anywhere.
        for (const lifecycle of [neither, materialOnly, discoveryOnly, both]) {
            assert(!('status' in lifecycle) && !('overall' in lifecycle) && !('distributed' in lifecycle), '12. no collapsed overall status field exists on any combination');
        }

        console.log('✓ All four material x discovery combinations describe independently, including discovery-present-without-material');
    }

    // ---------------------------------------------------------------
    // Section C — provenance is preserved, never reconstructed: uri,
    // discoveryTag, and origin stay three distinct identities.
    // ---------------------------------------------------------------
    {
        const publication = signedPublication();
        const result = describePublicationDistributionResult({
            publication,
            material: { uri: 'ar://TX123', storage: 'ar' },
            discovery: { relayUrl: 'wss://relay.example', discoveryTag: 'forkbuild-publication', id: 'EVENT123ID' + 'f'.repeat(54) }
        });

        const lifecycle = describePublicationDistributionLifecycle(result);

        assert(lifecycle.material.uri === 'ar://TX123', '13. material.uri is forwarded unchanged');
        assert(lifecycle.discovery.origin === 'wss://relay.example', "14. discovery.origin is result.discovery.relayUrl, renamed for readability, never re-derived");
        assert(lifecycle.discovery.discoveryTag === 'forkbuild-publication', '15. discoveryTag is forwarded under its own established name, never reconstructed from uri or origin');
        assert(lifecycle.discovery.id === 'EVENT123ID' + 'f'.repeat(54), '16. discovery.id is forwarded unchanged');
        assert(
            lifecycle.material.uri !== lifecycle.discovery.discoveryTag && lifecycle.discovery.discoveryTag !== lifecycle.discovery.origin && lifecycle.material.uri !== lifecycle.discovery.origin,
            '17. material uri, discovery tag, and relay origin remain three distinct identities, never conflated'
        );

        console.log('✓ Provenance is preserved through the lifecycle boundary: uri, discoveryTag, and origin stay three distinct, unreconstructed identities');
    }

    // ---------------------------------------------------------------
    // Section D — malformed input degrades to null, never throws.
    // ---------------------------------------------------------------
    {
        assert(describePublicationDistributionLifecycle() === null, '18. no argument at all degrades to null');
        assert(describePublicationDistributionLifecycle(null) === null, '19. a null result degrades to null');
        assert(describePublicationDistributionLifecycle('not-an-object') === null, '20. a non-object result degrades to null');
        assert(describePublicationDistributionLifecycle({}) !== null, '21. a bare object with no material/discovery at all still describes — both sections default to ABSENT');
        assert(describePublicationDistributionLifecycle({ material: {} }) === null, '22. a present-but-malformed material (missing uri) degrades to null');
        assert(describePublicationDistributionLifecycle({ material: { uri: '' } }) === null, '23. an empty material.uri degrades to null');
        assert(describePublicationDistributionLifecycle({ discovery: {} }) === null, '24. a present-but-malformed discovery (missing fields) degrades to null');
        assert(describePublicationDistributionLifecycle({ discovery: { relayUrl: 'wss://relay.example' } }) === null, '25. a discovery missing discoveryTag/id degrades to null');
        assert(describePublicationDistributionLifecycle({ material: { uri: 'ar://TX' }, discovery: {} }) === null, '26. a malformed discovery invalidates the whole call even when material is valid');

        console.log('✓ Malformed or missing input degrades to null; never throws');
    }

    // ---------------------------------------------------------------
    // Section E — determinism and freezing.
    // ---------------------------------------------------------------
    {
        const result = Object.freeze({
            publication: Object.freeze({ kind: 'PUBLICATION', objectId: 'pub-1' }),
            material: Object.freeze({ uri: 'ar://TXDET', storage: 'ar' }),
            discovery: Object.freeze({ relayUrl: 'wss://relay.example', discoveryTag: 'tag-det', id: 'b'.repeat(64) })
        });

        const first = describePublicationDistributionLifecycle(result);
        const second = describePublicationDistributionLifecycle(result);
        assert(JSON.stringify(first) === JSON.stringify(second), '27. two calls with byte-identical input produce byte-identical output');
        assert(Object.isFrozen(first) && Object.isFrozen(first.material) && Object.isFrozen(first.discovery), '28. the lifecycle and every one of its sections are frozen');

        console.log('✓ Determinism and freezing: no hidden state, no mutation');
    }

    // ---------------------------------------------------------------
    // Section F — architectural regression.
    // ---------------------------------------------------------------
    {
        const sourceUrl = new URL('../application/PublicationDistributionLifecycle.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(!codeOnly.includes("from './PublicationDistributionResult"), '29. never imports the 0.9.48 result module');
        assert(!codeOnly.includes("from './PublicationDistributionExecutor"), '30. never imports the 0.9.49 execution module');
        assert(!codeOnly.includes('ArweavePublicationMaterialUploader') && !codeOnly.includes('NostrPublicationDiscoveryPublisher') && !codeOnly.includes('PublicationDistributionDescriptor') && !codeOnly.includes('PublicationDistributionRuntimeComposition'), '31. never imports any of the four collaborator/execution files — this file only describes facts it is handed');
        assert(!/\bfetch\(/.test(codeOnly), '32. never calls fetch(...) — no network access of its own');
        assert(!codeOnly.includes('WebSocket'), '33. never references WebSocket');
        assert(!codeOnly.includes('StorageProvider'), '34. never imports or references StorageProvider — no persistence');
        assert(!codeOnly.includes('async '), '35. contains no async function of its own — synchronous only');
        assert(!codeOnly.includes('setTimeout'), '36. no retry/scheduling machinery of its own');
        assert(!codeOnly.includes('new Date') && !codeOnly.includes('Date.now'), '37. no clock read of any kind');

        const forbiddenTerms = ['pending', 'failed', 'failure', 'retrying', 'confirmed', 'withdrawn', 'rollback', 'compensation', 'transaction', 'queue', 'schedule'];
        for (const term of forbiddenTerms) {
            const pattern = new RegExp(`\\b${term}\\b`, 'i');
            assert(!pattern.test(codeOnly), `38. code must never use "${term}" — no operational-interpretation vocabulary at this boundary`);
        }

        const resultSource = await readFile(new URL('../application/PublicationDistributionResult.js', import.meta.url), 'utf8');
        assert(!resultSource.includes('PublicationDistributionLifecycle'), '39. the 0.9.48 result file itself is never modified to know about this lifecycle file');

        const executorSource = await readFile(new URL('../application/PublicationDistributionExecutor.js', import.meta.url), 'utf8');
        assert(!executorSource.includes('PublicationDistributionLifecycle'), '40. the 0.9.49 executor file itself is never modified to know about this lifecycle file');

        console.log('✓ Architectural regression: no I/O, no execution/collaborator imports, no clock, no PENDING/FAILED/status vocabulary, no existing file modified');
    }

    console.log('\nAll PublicationDistributionLifecycle tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
