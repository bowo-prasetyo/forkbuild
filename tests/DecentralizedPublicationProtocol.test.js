import {
    DecentralizedPublication,
    DECENTRALIZED_PUBLICATION_KIND,
    CURRENT_SCHEMA_VERSION as PUBLICATION_SCHEMA_VERSION
} from '../core/DecentralizedPublication.js';
import { ContentReference } from '../core/ContentReference.js';
import {
    validateDecentralizedPublication,
    DecentralizedPublicationError
} from '../application/DecentralizedPublicationValidator.js';
import { PublicationResolver } from '../application/PublicationResolver.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { BlueprintAttribution, BLUEPRINT_ATTRIBUTION_KIND, CURRENT_SCHEMA_VERSION as ATTRIBUTION_SCHEMA_VERSION } from '../core/BlueprintAttribution.js';
import { LocalBlueprintAttributionStore } from '../application/LocalBlueprintAttributionStore.js';
import { createBlueprintAttributionPublicationKind } from '../application/BlueprintAttributionPublicationKind.js';

// 0.7.0 — Decentralized Publication Protocol & Content Addressing.
//
//   Section A: DecentralizedPublication — construction, signing,
//              serialization round trip, structural validation
//              rejections
//   Section B: LocalAuthorizationVerifier#verifyDecentralizedPublication —
//              valid, unsigned, tampered, impersonated
//   Section C: PublicationResolver — publish()/resolve() end to end
//              through a BlueprintAttribution kindPlugin, across two
//              independent replicas bridged only by content bytes at a
//              shared hash (the one thing an eventual IPFS-backed
//              ContentStore would do for real) — wrong-kind rejection,
//              missing-content rejection, tampered-envelope rejection,
//              fingerprint cross-check rejection, dedup-by-id
//
// See docs/Principles.md, "Publication Makes Content Discoverable; It
// Does Not Make It Authoritative (0.7.0)."

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

async function run() {
    // ---------------------------------------------------------------
    // Section A — DecentralizedPublication
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const contentReference = new ContentReference({ hash: 'abc123', algorithm: 'fnv1a-32', size: 42 });

        expectThrows(() => new DecentralizedPublication({ contentReference }),
            '1. rejects a missing contentKind');
        expectThrows(() => new DecentralizedPublication({ contentKind: 'forkbuild.test-content' }),
            '2. rejects a missing contentReference');
        expectThrows(() => new DecentralizedPublication({ contentKind: 'forkbuild.test-content', contentReference: new ContentReference({ hash: null }) }),
            '3. rejects a contentReference with no hash');

        let publication = new DecentralizedPublication({
            contentKind: 'forkbuild.test-content',
            contentSchemaVersion: 1,
            contentReference,
            publisherIdentity: alice.getSigningIdentity().toJSON()
        });
        publication = publication.withSignature(alice.signCanonical(publication.getSigningDescriptor()));

        const json = publication.toJSON();
        assert(json.kind === DECENTRALIZED_PUBLICATION_KIND, '4. self-describes with the envelope kind constant');
        assert(json.schemaVersion === PUBLICATION_SCHEMA_VERSION, '5. carries the current envelope schema version');
        assert(json.contentKind === 'forkbuild.test-content', '6. preserves the wrapped content kind');
        assert(json.contentReference.hash === 'abc123', '7. preserves the content reference');
        assert(json.publisherIdentity.id === alice.getSigningIdentity().id, '8. preserves the publisher identity');

        const restored = DecentralizedPublication.fromJSON(json);
        assert(restored.id === publication.id, '9. round-trips id');
        assert(restored.contentKind === publication.contentKind, '10. round-trips contentKind');
        assert(restored.contentReference.hash === publication.contentReference.hash, '11. round-trips contentReference');
        assert(restored.signature.signature === publication.signature.signature, '12. round-trips signature');

        // Structural validation never throws on a well-formed publication.
        validateDecentralizedPublication(json);

        expectThrows(() => validateDecentralizedPublication(null), '13. rejects a null package');
        expectThrows(() => validateDecentralizedPublication('not json'), '14. rejects a non-object package');
        expectThrows(() => validateDecentralizedPublication({ ...json, kind: 'something.else' }),
            '15. rejects the wrong kind discriminator');
        expectThrows(() => validateDecentralizedPublication({ ...json, schemaVersion: 999 }),
            '16. rejects an unsupported schema version');
        for (const field of ['id', 'contentKind', 'publishedAt']) {
            const bad = { ...json, [field]: '' };
            const err = expectThrows(() => validateDecentralizedPublication(bad), `17. rejects a missing ${field}`);
            assert(err instanceof DecentralizedPublicationError, `18. ${field} rejection is a DecentralizedPublicationError`);
        }
        expectThrows(() => validateDecentralizedPublication({ ...json, contentSchemaVersion: 'not a number' }),
            '19. rejects a non-numeric contentSchemaVersion');
        expectThrows(() => validateDecentralizedPublication({ ...json, contentReference: { ...json.contentReference, hash: '' } }),
            '20. rejects a contentReference missing its own hash');
        expectThrows(() => validateDecentralizedPublication({ ...json, publisherIdentity: { ...json.publisherIdentity, publicKey: '' } }),
            '21. rejects a publisherIdentity missing its own publicKey');
        expectThrows(() => validateDecentralizedPublication({ ...json, signature: null }),
            '22. rejects a missing signature');
        expectThrows(() => validateDecentralizedPublication({ ...json, signature: { ...json.signature, signer: '' } }),
            '23. rejects a signature missing its own signer field');
    }
    console.log('✓ Section A: DecentralizedPublication — construction, signing, serialization, structural validation');

    // ---------------------------------------------------------------
    // Section B — verifyDecentralizedPublication
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const verifier = new LocalAuthorizationVerifier();
        const contentReference = new ContentReference({ hash: 'def456', size: 7 });

        let publication = new DecentralizedPublication({
            contentKind: 'forkbuild.test-content',
            contentReference,
            publisherIdentity: alice.getSigningIdentity().toJSON()
        });
        publication = publication.withSignature(alice.signCanonical(publication.getSigningDescriptor()));

        const valid = verifier.verifyDecentralizedPublication(publication.toJSON());
        assert(valid.valid === true, '1. a genuinely signed publication verifies');

        const unsigned = new DecentralizedPublication({
            contentKind: 'forkbuild.test-content',
            contentReference,
            publisherIdentity: alice.getSigningIdentity().toJSON()
        });
        const unsignedResult = verifier.verifyDecentralizedPublication(unsigned.toJSON());
        assert(unsignedResult.valid === false && unsignedResult.signed === false, '2. an unsigned publication is rejected, never tolerated');

        const tampered = { ...publication.toJSON(), contentReference: { ...publication.contentReference.toJSON(), hash: 'tampered-hash' } };
        const tamperedResult = verifier.verifyDecentralizedPublication(tampered);
        assert(tamperedResult.valid === false, '3. a tampered contentReference fails verification even with a present signature');

        const impersonated = { ...publication.toJSON(), publisherIdentity: bob.getSigningIdentity().toJSON() };
        const impersonatedResult = verifier.verifyDecentralizedPublication(impersonated);
        assert(impersonatedResult.valid === false, '4. swapping in a different publisher identity after signing is rejected');
    }
    console.log('✓ Section B: verifyDecentralizedPublication — valid, unsigned, tampered, impersonated');

    // ---------------------------------------------------------------
    // Section C — PublicationResolver, end to end
    // ---------------------------------------------------------------
    {
        expectThrows(() => new PublicationResolver(null, new LocalAuthorizationVerifier()),
            '1. rejects construction without a ContentStore');
        expectThrows(() => new PublicationResolver(new LocalContentStore(new InMemoryStorageProvider()), null),
            '2. rejects construction without a verifier');

        // --- Alice's replica: signs an attribution, publishes it ------
        const alice = makeIdentity('Alice');
        let attribution = new BlueprintAttribution({ fingerprint: 'bp:farmstead-1', authorIdentityId: alice.getSigningIdentity().id });
        attribution = attribution.withSignature(alice.signCanonical(attribution.getSigningDescriptor()));

        const aliceContentStore = new LocalContentStore(new InMemoryStorageProvider());
        const aliceResolver = new PublicationResolver(aliceContentStore, new LocalAuthorizationVerifier());

        expectThrows(() => aliceResolver.publish({ content: attribution, contentKind: BLUEPRINT_ATTRIBUTION_KIND, identityProvider: {} }),
            '3. rejects publishing without a cryptographic identityProvider');

        const publication = aliceResolver.publish({
            content: attribution,
            contentKind: BLUEPRINT_ATTRIBUTION_KIND,
            contentSchemaVersion: ATTRIBUTION_SCHEMA_VERSION,
            identityProvider: alice
        });
        assert(publication instanceof DecentralizedPublication, '4. publish() returns a DecentralizedPublication');
        assert(publication.contentKind === BLUEPRINT_ATTRIBUTION_KIND, '5. carries the requested contentKind');
        assert(publication.publisherIdentity.id === alice.getSigningIdentity().id, '6. carries Alice as the publisher');
        assert(!!publication.signature, '7. is signed');

        // The portable form: this JSON is what would actually travel
        // over a rendezvous network, a pasted file, or an IPFS pointer.
        const publicationJson = publication.toJSON();

        // --- Bob's replica: an independent ContentStore/store/verifier,
        //     bridged only by fetching the same bytes at the same hash —
        //     exactly what a real IpfsContentStore#get() would do for
        //     Bob automatically once 0.7.1 builds one. Never a shared
        //     JS object, never Alice's own store.
        const bobContentStore = new LocalContentStore(new InMemoryStorageProvider());
        const bobAttributionStore = new LocalBlueprintAttributionStore(new InMemoryStorageProvider());
        const bobVerifier = new LocalAuthorizationVerifier();
        const bobResolver = new PublicationResolver(bobContentStore, bobVerifier);

        const bridgedReference = bobContentStore.put(JSON.stringify(attribution.toJSON()));
        assert(bridgedReference.hash === publicationJson.contentReference.hash,
            '8. content addressing is deterministic — the same bytes hash identically on both replicas');

        const kindPlugin = createBlueprintAttributionPublicationKind({ verifier: bobVerifier, store: bobAttributionStore });

        const wrongKindPlugin = createBlueprintAttributionPublicationKind({ verifier: bobVerifier, store: bobAttributionStore });
        wrongKindPlugin.contentKind = 'forkbuild.something-else';
        expectThrows(() => bobResolver.resolve(publicationJson, wrongKindPlugin),
            '9. rejects resolving a publication as the wrong contentKind');

        const emptyContentStore = new LocalContentStore(new InMemoryStorageProvider());
        const emptyResolver = new PublicationResolver(emptyContentStore, bobVerifier);
        expectThrows(() => emptyResolver.resolve(publicationJson, kindPlugin),
            '10. rejects resolving a publication whose referenced bytes are not in this ContentStore');

        const tamperedEnvelope = { ...publicationJson, contentReference: { ...publicationJson.contentReference, hash: bridgedReference.hash } };
        // Re-sign nothing — the signature above was for the ORIGINAL
        // hash, so mutating contentReference (even to another valid
        // hash) must invalidate the envelope's own signature.
        tamperedEnvelope.contentReference = { ...publicationJson.contentReference, mediaType: 'text/plain' };
        expectThrows(() => bobResolver.resolve(tamperedEnvelope, kindPlugin),
            '11. rejects an envelope whose contentReference was altered after signing');

        const mismatchPlugin = createBlueprintAttributionPublicationKind({
            verifier: bobVerifier,
            store: bobAttributionStore,
            expectedFingerprint: 'bp:some-other-design'
        });
        expectThrows(() => bobResolver.resolve(publicationJson, mismatchPlugin),
            '12. rejects a resolved attribution whose fingerprint does not match an expected local fingerprint');

        const result = bobResolver.resolve(publicationJson, kindPlugin);
        assert(result.isNew === true, '13. first resolution is new');
        assert(result.attribution.fingerprint === 'bp:farmstead-1', '14. resolved attribution carries the correct fingerprint');
        assert(result.attribution.authorIdentityId === alice.getSigningIdentity().id, '15. resolved attribution carries the correct author');
        assert(bobAttributionStore.has('bp:farmstead-1', attribution.id), '16. the resolved attribution is now in Bob\'s own store');

        const secondResult = bobResolver.resolve(publicationJson, kindPlugin);
        assert(secondResult.isNew === false, '17. re-resolving the same publication is a no-op, never an error');

        // Alice's own local state is completely untouched by anything
        // Bob did with his independent replica.
        assert(aliceContentStore.has(publication.contentReference), '18. Alice\'s own content store still has her original bytes');
    }
    console.log('✓ Section C: PublicationResolver — publish/resolve end to end, wrong-kind/missing/tampered/mismatch rejection, dedup');

    console.log('\nAll Decentralized Publication Protocol tests passed.');
}

run().catch((error) => {
    console.error('DecentralizedPublicationProtocol.test.js FAILED:', error);
    process.exitCode = 1;
});
