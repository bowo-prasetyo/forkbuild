import { readFile } from 'node:fs/promises';
import { describePublicationDistribution } from '../application/PublicationDistributionDescriptor.js';
import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { Signature } from '../core/Signature.js';
import {
    describeDecentralizedDiscoveryEnvelope,
    parseDecentralizedDiscoveryEnvelope
} from '../core/DecentralizedDiscoveryEnvelope.js';

// 0.9.44 — Publication Discovery Distribution Model.
// See docs/Roadmap.md, "0.9.44 — Publication Discovery Distribution Model,"
// for the full milestone story.

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

async function run() {
    // ---------------------------------------------------------------
    // 1. Flagship: a signed publication + a supplied materialUri
    //    describes a real distribution, whose own discoveryEnvelope is
    //    exactly what core/DecentralizedDiscoveryEnvelope.js already
    //    validates and a consumer can already parse.
    // ---------------------------------------------------------------
    {
        const publication = signedPublication();
        const distribution = describePublicationDistribution({
            publication,
            materialUri: 'ar://TX123'
        });

        assert(distribution !== null, '1. FLAGSHIP — a signed publication with a supplied materialUri describes a distribution');
        assert(distribution.kind === 'PUBLICATION', '2. FLAGSHIP — kind is always PUBLICATION');
        assert(distribution.objectId === 'pub-1', "3. FLAGSHIP — objectId is the publication's own id");
        assert(distribution.material.uri === 'ar://TX123', '4. FLAGSHIP — material.uri carries the supplied materialUri verbatim');
        assert(distribution.material.storage === 'ar', '5. FLAGSHIP — material.storage is inferred from the uri scheme');
        assert(Object.isFrozen(distribution) && Object.isFrozen(distribution.material), '6. FLAGSHIP — the result and its material are frozen');

        const envelope = distribution.discoveryEnvelope;
        assert(envelope !== null, '7. FLAGSHIP — a discoveryEnvelope is produced');
        assert(envelope.protocol === 'forkbuild' && envelope.version === 1, '8. FLAGSHIP — the envelope carries the real forkbuild protocol/version');
        assert(envelope.kind === 'PUBLICATION' && envelope.objectId === 'pub-1' && envelope.uri === 'ar://TX123', '9. FLAGSHIP — the envelope names the same object and uri');
        assert(describeDecentralizedDiscoveryEnvelope(envelope) !== null, '10. FLAGSHIP — the produced envelope is itself independently accepted by describeDecentralizedDiscoveryEnvelope()');

        const roundTripped = parseDecentralizedDiscoveryEnvelope(JSON.stringify(envelope));
        assert(roundTripped !== null && roundTripped.objectId === 'pub-1' && roundTripped.uri === 'ar://TX123', '11. FLAGSHIP — the envelope survives a JSON round trip, exactly as a consumer (e.g. a Nostr event content field) would receive it');

        console.log('✓ Flagship: a signed publication + a supplied materialUri describes a distribution whose envelope a real consumer already accepts');
    }

    // ---------------------------------------------------------------
    // 2. materialUri is decoupled from contentReference — the legacy
    //    ipfs:// backend the fixture carries is never read.
    // ---------------------------------------------------------------
    {
        const publication = signedPublication();
        assert(publication.contentReference.uri === 'ipfs://legacy-cid', 'sanity: the fixture carries an unrelated legacy contentReference');

        const distribution = describePublicationDistribution({ publication, materialUri: 'ar://TX999' });
        assert(distribution.material.uri === 'ar://TX999', '12. material.uri is the supplied materialUri, never contentReference.uri');
        assert(distribution.discoveryEnvelope.uri === 'ar://TX999', '13. the envelope names the supplied materialUri too');

        const noContentReference = describePublicationDistribution({
            publication: signedPublication({ contentReference: null }),
            materialUri: 'ar://TX999'
        });
        assert(noContentReference !== null, '14. a publication with no contentReference at all still describes a distribution — materialUri never depends on it');

        console.log('✓ materialUri is supplied independently of the legacy contentReference field');
    }

    // ---------------------------------------------------------------
    // 3. An unsigned publication never describes a distribution.
    // ---------------------------------------------------------------
    {
        const unsigned = new Publication({ id: 'pub-2', documentId: 'doc-2', title: 'Unsigned', author: 'author-1' });
        assert(unsigned.signature === null, 'sanity: the fixture is genuinely unsigned');
        assert(describePublicationDistribution({ publication: unsigned, materialUri: 'ar://TX1' }) === null, '15. an unsigned publication degrades to null — never distributed');

        console.log('✓ An unsigned Publication never describes a distribution');
    }

    // ---------------------------------------------------------------
    // 4. materialStorage: caller-supplied wins over inference; a uri
    //    with no recognizable scheme infers null, never a rejection.
    // ---------------------------------------------------------------
    {
        const publication = signedPublication();

        const explicit = describePublicationDistribution({ publication, materialUri: 'ar://TX1', materialStorage: 'custom-label' });
        assert(explicit.material.storage === 'custom-label', '16. an explicitly-supplied materialStorage overrides scheme inference');

        const ipfsInferred = describePublicationDistribution({ publication, materialUri: 'ipfs://CID123' });
        assert(ipfsInferred.material.storage === 'ipfs', '17. storage is inferred for a non-Arweave scheme too — this file names no backend in code');

        const noScheme = describePublicationDistribution({ publication, materialUri: 'not-a-uri-at-all' });
        assert(noScheme !== null && noScheme.material.storage === null, '18. a materialUri with no recognizable scheme still describes a distribution, with storage: null');

        console.log('✓ material.storage is caller-overridable, otherwise inferred, and never a reason to reject an otherwise valid distribution');
    }

    // ---------------------------------------------------------------
    // 5. Malformed input degrades to null, never throws.
    // ---------------------------------------------------------------
    {
        assert(describePublicationDistribution() === null, '19. no argument at all degrades to null');
        assert(describePublicationDistribution({}) === null, '20. no fields at all degrades to null');
        assert(describePublicationDistribution({ publication: null, materialUri: 'ar://TX1' }) === null, '21. a null publication degrades to null');
        assert(describePublicationDistribution({ publication: 'not-an-object', materialUri: 'ar://TX1' }) === null, '22. a non-object publication degrades to null');
        assert(describePublicationDistribution({ publication: signedPublication({ id: '' }), materialUri: 'ar://TX1' }) === null, '23. an empty publication id degrades to null');
        assert(describePublicationDistribution({ publication: { signature: { value: 'x' } }, materialUri: 'ar://TX1' }) === null, '24. a missing publication id degrades to null');
        assert(describePublicationDistribution({ publication: signedPublication(), materialUri: '' }) === null, '25. an empty materialUri degrades to null');
        assert(describePublicationDistribution({ publication: signedPublication(), materialUri: undefined }) === null, '26. a missing materialUri degrades to null');
        assert(describePublicationDistribution({ publication: signedPublication(), materialUri: 42 }) === null, '27. a non-string materialUri degrades to null');

        console.log('✓ Malformed input degrades to null, never throws');
    }

    // ---------------------------------------------------------------
    // 6. Duck-typed: a plain object shaped like a signed Publication
    //    works exactly like a real Publication instance.
    // ---------------------------------------------------------------
    {
        const plain = { id: 'pub-3', signature: { value: 'anything-truthy' } };
        const distribution = describePublicationDistribution({ publication: plain, materialUri: 'ar://TX3' });
        assert(distribution !== null, '28. a plain, duck-typed object works exactly like a real Publication instance');
        assert(distribution.objectId === 'pub-3', '29. objectId is read off the plain object verbatim');

        console.log('✓ Duck-typed: no Publication class import required');
    }

    // ---------------------------------------------------------------
    // 7. Determinism: two calls with byte-identical input produce
    //    byte-identical (deep-equal) output.
    // ---------------------------------------------------------------
    {
        const publication = signedPublication();
        const first = describePublicationDistribution({ publication, materialUri: 'ar://TXDET' });
        const second = describePublicationDistribution({ publication, materialUri: 'ar://TXDET' });
        assert(JSON.stringify(first) === JSON.stringify(second), '30. two calls with byte-identical input produce byte-identical output');

        console.log('✓ Determinism: no hidden state, no caching, no clock');
    }

    // ---------------------------------------------------------------
    // 8. Architectural regression — no I/O, no second envelope format,
    //    no signing, no key management, no vocabulary this milestone
    //    deliberately excluded.
    // ---------------------------------------------------------------
    {
        const sourceUrl = new URL('../application/PublicationDistributionDescriptor.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(codeOnly.includes('describeDecentralizedDiscoveryEnvelope'), '31. reuses the real 0.9.30 envelope validator, never a second envelope format of its own');
        assert(!/protocol\s*:\s*['"]forkbuild['"]/.test(codeOnly.replace(/DECENTRALIZED_DISCOVERY_ENVELOPE_PROTOCOL/g, '')), '32. never hard-codes the literal protocol string outside the imported constant');
        assert(!codeOnly.includes("import { Publication }"), '33. never imports the Publication class — duck-typed only');
        assert(!/\bfetch\(/.test(codeOnly), '34. never calls fetch(...) — no network access of its own');
        assert(!codeOnly.includes('WebSocket'), '35. never references WebSocket');
        assert(!codeOnly.includes('StorageProvider'), '36. never imports or references StorageProvider — no storage access');
        assert(!codeOnly.includes('LocalAuthorizationVerifier'), '37. never imports the signature verifier — never checks a signature cryptographically');
        assert(!/new\s+Signature\s*\(/.test(codeOnly), '38. never constructs a new Signature — no signing of any kind');
        assert(!codeOnly.includes('Arweave') && !codeOnly.includes('Nostr'), '39. names no concrete substrate in code — substrate-neutral, as documented');

        const forbiddenTerms = ['trusted', 'reputation', 'weight', 'confidence', 'ranking', 'scoring', 'preferred'];
        for (const term of forbiddenTerms) {
            assert(!codeOnly.toLowerCase().includes(term.toLowerCase()), `40. code must never use "${term}" — no trust/ranking vocabulary at this boundary`);
        }

        console.log('✓ Architectural regression: reuses the real envelope validator, no I/O, no signing, no substrate hard-coded');
    }

    console.log('\nAll PublicationDistributionDescriptor tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
