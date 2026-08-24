import {
    PublicationAnchor,
    PUBLICATION_ANCHOR_KIND,
    CURRENT_SCHEMA_VERSION as ANCHOR_SCHEMA_VERSION
} from '../core/PublicationAnchor.js';
import {
    validatePublicationAnchor,
    PublicationAnchorError
} from '../application/PublicationAnchorValidator.js';
import { ExternalAnchorVerifier } from '../application/ExternalAnchorVerifier.js';
import { AnchorVerificationOutcome } from '../application/AnchorVerificationOutcome.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';

// 0.8.0 — Decentralized Publication Anchoring & External Evidence.
//
//   Section A: PublicationAnchor — construction, signing, serialization
//              round trip, structural validation rejections
//   Section B: LocalAuthorizationVerifier#verifyPublicationAnchor —
//              valid, unsigned, tampered, impersonated
//   Section C: ExternalAnchorVerifier — full pipeline: malformed
//              envelope, bad signature, content/publication mismatch,
//              no proof verifier available (VALID_PROOF_UNVERIFIED,
//              never a rejection), a matching proof verifier accepting
//              (VALID) or rejecting (INVALID_PROOF) the proof, and the
//              central architectural property this milestone exists to
//              prove: two INDEPENDENT anchors — different anchoring
//              identities, different anchorTypes, different locators —
//              for the exact same publicationId/contentHash both verify
//              independently, neither one ever collapsing into or
//              invalidating the other.
//
// See docs/Principles.md, "External Anchoring Provides Evidence; It
// Does Not Establish Authority (0.8.0)."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    let error = null;
    try { fn(); } catch (e) { threw = true; error = e; }
    assert(threw, message);
    return error;
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function makeIdentity(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    return provider;
}

function signAnchor(identityProvider, fields) {
    let anchor = new PublicationAnchor({
        ...fields,
        anchorIdentity: identityProvider.getSigningIdentity().toJSON()
    });
    anchor = anchor.withSignature(identityProvider.signCanonical(anchor.getSigningDescriptor()));
    return anchor;
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — PublicationAnchor
    // ---------------------------------------------------------------
    {
        const registry = makeIdentity('Registry');

        expectThrows(() => new PublicationAnchor({ contentHash: 'abc123', anchorType: 'local-test', locator: 'local://1' }),
            '1. rejects a missing publicationId');
        expectThrows(() => new PublicationAnchor({ publicationId: 'pub-1', anchorType: 'local-test', locator: 'local://1' }),
            '2. rejects a missing contentHash');
        expectThrows(() => new PublicationAnchor({ publicationId: 'pub-1', contentHash: 'abc123', locator: 'local://1' }),
            '3. rejects a missing anchorType');
        expectThrows(() => new PublicationAnchor({ publicationId: 'pub-1', contentHash: 'abc123', anchorType: 'local-test' }),
            '4. rejects a missing locator');
        expectThrows(() => new PublicationAnchor({ publicationId: 'pub-1', contentHash: 'abc123', anchorType: 'local-test', locator: 'local://1', anchoredAt: 'not-a-date' }),
            '5. rejects an invalid anchoredAt');

        const anchor = signAnchor(registry, {
            publicationId: 'pub-1',
            contentHash: 'abc123',
            anchorType: 'local-test',
            locator: 'local://ledger/1',
            proof: { entries: ['pub-1'] }
        });

        const json = anchor.toJSON();
        assert(json.kind === PUBLICATION_ANCHOR_KIND, '6. self-describes with the anchor kind constant');
        assert(json.schemaVersion === ANCHOR_SCHEMA_VERSION, '7. carries the current schema version');
        assert(json.publicationId === 'pub-1', '8. preserves the publicationId');
        assert(json.contentHash === 'abc123', '9. preserves the contentHash');
        assert(json.anchorType === 'local-test', '10. preserves the anchorType');
        assert(json.locator === 'local://ledger/1', '11. preserves the locator');
        assert(json.proof.entries[0] === 'pub-1', '12. preserves the proof');
        assert(json.anchorIdentity.id === registry.getSigningIdentity().id, '13. preserves the anchoring identity');

        const restored = PublicationAnchor.fromJSON(json);
        assert(restored.id === anchor.id, '14. round-trips id');
        assert(restored.publicationId === anchor.publicationId, '15. round-trips publicationId');
        assert(restored.contentHash === anchor.contentHash, '16. round-trips contentHash');
        assert(restored.signature.signature === anchor.signature.signature, '17. round-trips signature');

        // Structural validation never throws on a well-formed anchor.
        validatePublicationAnchor(json);

        expectThrows(() => validatePublicationAnchor(null), '18. rejects a null record');
        expectThrows(() => validatePublicationAnchor('not json'), '19. rejects a non-object record');
        expectThrows(() => validatePublicationAnchor({ ...json, kind: 'something.else' }),
            '20. rejects the wrong kind discriminator');
        expectThrows(() => validatePublicationAnchor({ ...json, schemaVersion: 999 }),
            '21. rejects an unsupported schema version');
        for (const field of ['id', 'publicationId', 'contentHash', 'anchorType', 'locator', 'anchoredAt']) {
            const bad = { ...json, [field]: '' };
            const err = expectThrows(() => validatePublicationAnchor(bad), `22. rejects a missing ${field}`);
            assert(err instanceof PublicationAnchorError, `23. ${field} rejection is a PublicationAnchorError`);
        }
        expectThrows(() => validatePublicationAnchor({ ...json, anchorIdentity: { ...json.anchorIdentity, publicKey: '' } }),
            '24. rejects an anchorIdentity missing its own publicKey');
        expectThrows(() => validatePublicationAnchor({ ...json, signature: null }),
            '25. rejects a missing signature');
        expectThrows(() => validatePublicationAnchor({ ...json, signature: { ...json.signature, signer: '' } }),
            '26. rejects a signature missing its own signer field');

        const circular = {};
        circular.self = circular;
        expectThrows(() => validatePublicationAnchor({ ...json, proof: circular }),
            '27. rejects a non-JSON-serializable proof');
    }
    console.log('✓ Section A: PublicationAnchor — construction, signing, serialization, structural validation');

    // ---------------------------------------------------------------
    // Section B — verifyPublicationAnchor
    // ---------------------------------------------------------------
    {
        const registry = makeIdentity('Registry');
        const impostor = makeIdentity('Impostor');
        const verifier = new LocalAuthorizationVerifier();

        const anchor = signAnchor(registry, {
            publicationId: 'pub-2', contentHash: 'def456', anchorType: 'local-test', locator: 'local://ledger/2'
        });

        const valid = verifier.verifyPublicationAnchor(anchor.toJSON());
        assert(valid.valid === true, '1. a genuinely signed anchor verifies');

        const unsigned = new PublicationAnchor({
            publicationId: 'pub-2', contentHash: 'def456', anchorType: 'local-test', locator: 'local://ledger/2',
            anchorIdentity: registry.getSigningIdentity().toJSON()
        });
        const unsignedResult = verifier.verifyPublicationAnchor(unsigned.toJSON());
        assert(unsignedResult.valid === false && unsignedResult.signed === false, '2. an unsigned anchor is rejected, never tolerated');

        const tampered = { ...anchor.toJSON(), contentHash: 'tampered-hash' };
        const tamperedResult = verifier.verifyPublicationAnchor(tampered);
        assert(tamperedResult.valid === false, '3. a tampered contentHash fails verification even with a present signature');

        const impersonated = { ...anchor.toJSON(), anchorIdentity: impostor.getSigningIdentity().toJSON() };
        const impersonatedResult = verifier.verifyPublicationAnchor(impersonated);
        assert(impersonatedResult.valid === false, '4. swapping in a different anchoring identity after signing is rejected');
    }
    console.log('✓ Section B: verifyPublicationAnchor — valid, unsigned, tampered, impersonated');

    // ---------------------------------------------------------------
    // Section C — ExternalAnchorVerifier
    // ---------------------------------------------------------------
    {
        expectThrows(() => new ExternalAnchorVerifier(null), '1. rejects construction without a verifier');
        expectThrows(() => new ExternalAnchorVerifier({}), '2. rejects a verifier without verifyPublicationAnchor');

        const registry = makeIdentity('Registry');
        const verifier = new LocalAuthorizationVerifier();
        const anchorVerifier = new ExternalAnchorVerifier(verifier);

        const anchor = signAnchor(registry, {
            publicationId: 'pub-3', contentHash: 'hash-3', anchorType: 'local-test', locator: 'local://ledger/3', proof: { index: 3 }
        });
        const anchorJson = anchor.toJSON();

        const malformedResult = await anchorVerifier.verify({ ...anchorJson, kind: 'something.else' });
        assert(malformedResult.outcome === AnchorVerificationOutcome.INVALID_ENVELOPE, '3. reports INVALID_ENVELOPE for a malformed record');

        const badSignatureResult = await anchorVerifier.verify({ ...anchorJson, locator: 'local://ledger/tampered' });
        assert(badSignatureResult.outcome === AnchorVerificationOutcome.INVALID_SIGNATURE, '4. reports INVALID_SIGNATURE for a record altered after signing');

        const wrongHashResult = await anchorVerifier.verify(anchorJson, { expectedContentHash: 'some-other-hash' });
        assert(wrongHashResult.outcome === AnchorVerificationOutcome.CONTENT_MISMATCH, '5. reports CONTENT_MISMATCH when contentHash does not match what the caller expected');

        const wrongPublicationResult = await anchorVerifier.verify(anchorJson, { expectedPublicationId: 'some-other-publication' });
        assert(wrongPublicationResult.outcome === AnchorVerificationOutcome.CONTENT_MISMATCH, '6. reports CONTENT_MISMATCH when publicationId does not match what the caller expected');

        const noPluginResult = await anchorVerifier.verify(anchorJson, { expectedContentHash: 'hash-3', expectedPublicationId: 'pub-3' });
        assert(noPluginResult.outcome === AnchorVerificationOutcome.VALID_PROOF_UNVERIFIED, '7. reports VALID_PROOF_UNVERIFIED when no proofVerifier is supplied — never a rejection');

        const mismatchedTypePlugin = { anchorType: 'some-other-chain', verify: () => ({ valid: true }) };
        const mismatchedTypeResult = await anchorVerifier.verify(anchorJson, { proofVerifier: mismatchedTypePlugin });
        assert(mismatchedTypeResult.outcome === AnchorVerificationOutcome.VALID_PROOF_UNVERIFIED, '8. a proofVerifier for a different anchorType is never consulted');

        const acceptingPlugin = {
            anchorType: 'local-test',
            verify: (proof, { publicationId, contentHash }) => {
                assert(proof.index === 3, '9. the proof verifier receives the anchor\'s own proof');
                assert(publicationId === 'pub-3' && contentHash === 'hash-3', '10. the proof verifier receives the anchor\'s own publicationId/contentHash');
                return { valid: true };
            }
        };
        const acceptedResult = await anchorVerifier.verify(anchorJson, { proofVerifier: acceptingPlugin });
        assert(acceptedResult.outcome === AnchorVerificationOutcome.VALID, '11. a matching proofVerifier that accepts the proof reports VALID');

        const rejectingPlugin = { anchorType: 'local-test', verify: () => ({ valid: false, reason: 'ledger entry not found' }) };
        const rejectedResult = await anchorVerifier.verify(anchorJson, { proofVerifier: rejectingPlugin });
        assert(rejectedResult.outcome === AnchorVerificationOutcome.INVALID_PROOF, '12. a matching proofVerifier that rejects the proof reports INVALID_PROOF');
        assert(rejectedResult.reason === 'ledger entry not found', '13. carries the proofVerifier\'s own rejection reason');

        // --- The central property: independent anchors for the SAME
        //     publicationId/contentHash, from different identities, in
        //     different external systems, neither collapsing into nor
        //     invalidating the other.
        const secondRegistry = makeIdentity('SecondRegistry');
        const secondAnchor = signAnchor(secondRegistry, {
            publicationId: 'pub-3', contentHash: 'hash-3', anchorType: 'other-ledger', locator: 'other://chain/99'
        });
        const secondResult = await anchorVerifier.verify(secondAnchor.toJSON(), { expectedContentHash: 'hash-3', expectedPublicationId: 'pub-3' });
        assert(secondResult.outcome === AnchorVerificationOutcome.VALID_PROOF_UNVERIFIED, '14. a second, independent anchor for the identical publication/content verifies on its own terms');
        assert(secondResult.anchor.anchorIdentity.id === secondRegistry.getSigningIdentity().id, '15. the second anchor carries its own, distinct anchoring identity');
        assert(secondResult.anchor.locator !== anchor.locator, '16. the two anchors name different locators');

        const firstStillValid = await anchorVerifier.verify(anchorJson, { expectedContentHash: 'hash-3', expectedPublicationId: 'pub-3' });
        assert(firstStillValid.outcome === AnchorVerificationOutcome.VALID_PROOF_UNVERIFIED, '17. the first anchor is completely unaffected by the second anchor\'s existence');
    }
    console.log('✓ Section C: ExternalAnchorVerifier — envelope/signature/mismatch/proof outcomes, independent multi-anchor evidence');

    console.log('\nAll Publication Anchor Protocol tests passed.');
}

run().catch((error) => {
    console.error('PublicationAnchorProtocol.test.js FAILED:', error);
    process.exitCode = 1;
});
