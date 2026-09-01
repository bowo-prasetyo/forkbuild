import { readFile } from 'node:fs/promises';
import { describeDecentralizedPublicationLocationClaim } from '../core/DecentralizedPublicationLocationClaim.js';

// 0.9.29 — Decentralized Association Evidence Ingress.
//
// See docs/Roadmap.md, "0.9.29 — Decentralized Association Evidence
// Ingress," for the full milestone story.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function publicationOf(overrides = {}) {
    return {
        id: 'pub-1',
        title: 'Some Title',
        signature: { signer: 'alice', algorithm: 'ed25519', signature: 'deadbeef' },
        contentReference: { hash: 'sha256:ABC', uri: 'ar://ABC123', storage: 'ar' },
        ...overrides
    };
}

// ---------------------------------------------------------------------
// 1. Flagship: a signed Publication with a contentReference.uri describes
//    a well-formed location claim.
// ---------------------------------------------------------------------
{
    const claim = describeDecentralizedPublicationLocationClaim({ publication: publicationOf() });
    assert(claim !== null, '1. FLAGSHIP — a well-formed, signed publication describes a claim');
    assert(claim.kind === 'PUBLICATION', '2. FLAGSHIP — the claim kind is always PUBLICATION');
    assert(claim.objectId === 'pub-1', '3. FLAGSHIP — objectId is the publication\'s own id, verbatim');
    assert(claim.uri === 'ar://ABC123', '4. FLAGSHIP — uri is the contentReference\'s own uri, verbatim');
    assert(Object.isFrozen(claim), '5. FLAGSHIP — the claim is frozen');

    console.log('✓ Flagship: a signed publication\'s own fields describe a location claim');
}

// ---------------------------------------------------------------------
// 2. Duck-typed: a plain JSON record (never a Publication instance) works
//    identically.
// ---------------------------------------------------------------------
{
    const plainRecord = JSON.parse(JSON.stringify(publicationOf()));
    const claim = describeDecentralizedPublicationLocationClaim({ publication: plainRecord });
    assert(claim !== null && claim.objectId === 'pub-1' && claim.uri === 'ar://ABC123', 'a plain JSON record, duck-typed, describes the identical claim');

    console.log('✓ Duck-typed: a plain JSON record works identically to a hydrated instance');
}

// ---------------------------------------------------------------------
// 3. An unsigned publication never produces a claim — "no unsigned
//    claims."
// ---------------------------------------------------------------------
{
    assert(describeDecentralizedPublicationLocationClaim({ publication: publicationOf({ signature: null }) }) === null, 'a null signature degrades to null');
    assert(describeDecentralizedPublicationLocationClaim({ publication: publicationOf({ signature: undefined }) }) === null, 'a missing signature degrades to null');

    console.log('✓ An unsigned publication never produces a location claim');
}

// ---------------------------------------------------------------------
// 4. Every field is required; malformed input degrades to null, never
//    throws.
// ---------------------------------------------------------------------
{
    assert(describeDecentralizedPublicationLocationClaim() === null, 'no argument at all degrades to null');
    assert(describeDecentralizedPublicationLocationClaim({}) === null, 'no publication at all degrades to null');
    assert(describeDecentralizedPublicationLocationClaim({ publication: null }) === null, 'a null publication degrades to null');
    assert(describeDecentralizedPublicationLocationClaim({ publication: 'not-an-object' }) === null, 'a non-object publication degrades to null');
    assert(describeDecentralizedPublicationLocationClaim({ publication: publicationOf({ id: '' }) }) === null, 'an empty id degrades to null');
    assert(describeDecentralizedPublicationLocationClaim({ publication: publicationOf({ id: undefined }) }) === null, 'a missing id degrades to null');
    assert(describeDecentralizedPublicationLocationClaim({ publication: publicationOf({ contentReference: null }) }) === null, 'a null contentReference degrades to null');
    assert(describeDecentralizedPublicationLocationClaim({ publication: publicationOf({ contentReference: undefined }) }) === null, 'a missing contentReference degrades to null');
    assert(describeDecentralizedPublicationLocationClaim({ publication: publicationOf({ contentReference: { hash: 'sha256:ABC' } }) }) === null, 'a contentReference with no uri degrades to null');
    assert(describeDecentralizedPublicationLocationClaim({ publication: publicationOf({ contentReference: { hash: 'sha256:ABC', uri: '' } }) }) === null, 'a contentReference with an empty uri degrades to null');

    console.log('✓ Every field is required; malformed input degrades to null, never throws');
}

// ---------------------------------------------------------------------
// 5. Vocabulary boundary: no verification, retrieval, avatar, or trust
//    vocabulary; never imports the Publication class or ContentReference.
// ---------------------------------------------------------------------
{
    const sourceUrl = new URL('../core/DecentralizedPublicationLocationClaim.js', import.meta.url);
    const source = await readFile(sourceUrl, 'utf8');
    const codeOnly = source
        .split('\n')
        .filter((line) => !line.trim().startsWith('//'))
        .join('\n');

    assert(!codeOnly.includes("from '../publisher/Publication.js'") && !codeOnly.includes('publisher/Publication'), 'core/DecentralizedPublicationLocationClaim.js must never import the Publication class — duck-typed only');
    assert(!codeOnly.includes('ContentReference'), 'core/DecentralizedPublicationLocationClaim.js must never reference ContentReference');
    assert(!codeOnly.includes('LocalAuthorizationVerifier'), 'core/DecentralizedPublicationLocationClaim.js must never verify a signature');
    assert(!codeOnly.includes('AVATAR'), 'core/DecentralizedPublicationLocationClaim.js must never produce an AVATAR claim');

    const forbidden = ['trust', 'verified', 'authority', 'priority', 'weight', 'confidence', 'rank', 'preferred', 'best', 'fetch(', 'websocket', 'WebSocket', 'StorageProvider'];
    for (const term of forbidden) {
        assert(!codeOnly.toLowerCase().includes(term.toLowerCase()), `core/DecentralizedPublicationLocationClaim.js code must never use the word "${term}"`);
    }

    console.log('✓ Vocabulary boundary: no verification, retrieval, avatar, or trust vocabulary');
}

console.log('\nAll DecentralizedPublicationLocationClaim tests passed.');
