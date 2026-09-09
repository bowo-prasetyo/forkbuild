import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { License } from '../core/License.js';
import { DecentralizedPublication } from '../core/DecentralizedPublication.js';
import { PublicationResolver } from '../application/PublicationResolver.js';
import { PublicationResolutionOutcome } from '../application/PublicationResolutionOutcome.js';
import {
    PUBLICATION_CONTENT_KIND,
    validatePublicationContent,
    PublicationContentError
} from '../application/PublicationContentValidator.js';
import { createPublicationContentKind } from '../application/PublicationContentKind.js';

import { BlueprintAttribution, BLUEPRINT_ATTRIBUTION_KIND, CURRENT_SCHEMA_VERSION as ATTRIBUTION_SCHEMA_VERSION } from '../core/BlueprintAttribution.js';
import { createBlueprintAttributionPublicationKind } from '../application/BlueprintAttributionPublicationKind.js';

import { LocalContentStore } from '../content/LocalContentStore.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';

// 0.9.331 — Publication Content Kind for Decentralized Discovery.
//
// The flagship this milestone's own docs/Roadmap.md entry asks for
// directly: a complete round trip —
//
//   existing Publication -> PublicationContentKind -> DecentralizedPublication
//     -> existing serialization -> existing parser -> same semantic
//     Publication representation
//
// — proving `id`/`documentId`/`contentReference`/content are all
// preserved exactly, that `contentKind` is unambiguous against the two
// other content kinds this codebase already ships, and — the "why zero
// overlap matters" negative test 0.9.330's own audit called for — that
// an ORDINARY Publication never accidentally becomes a decentralized one
// merely by existing; it takes an explicit, deliberate
// PublicationResolver#publish() call every time.
//
//   Section A: round trip — publish an ordinary Publication, resolve it
//              back, every identity field preserved
//   Section B: production compatibility — an UNSIGNED Publication (the
//              one publisher/LocalPublisherProvider.js actually ships
//              when its identityProvider cannot sign) resolves exactly
//              as successfully as a signed one
//   Section C: contentKind is unambiguous — a Publication envelope
//              rejected by the BlueprintAttribution kindPlugin, a
//              BlueprintAttribution envelope rejected by the Publication
//              kindPlugin, in both directions
//   Section D: negative test — an ordinary Publication's own JSON is
//              never, by itself, a well-formed DecentralizedPublication;
//              becoming one is always an explicit, separate act
//   Section E: structural validation — PublicationContentValidator
//              rejects a payload missing documentId, and separately
//              rejects a signature without an accompanying
//              publisherIdentity, without ever requiring a signature at
//              all
//   Section F: tamper detection — content mutated after publish fails
//              CONTENT_HASH_MISMATCH, the same discipline every other
//              content kind in this pipeline already gets for free from
//              application/PublicationResolver.js itself
//
// See docs/Roadmap.md, 0.9.330 and 0.9.331.

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

function makePublication({ signed }, identityProvider) {
    // Mirrors exactly what publisher/LocalPublisherProvider.js itself
    // constructs on a real local publish — the same fields, the same
    // conditional signing, never a hand-rolled shape invented for this
    // test alone.
    const documentContentReference = new ContentReference({
        hash: 'docHash-fixed-content-1', algorithm: 'fnv1a-32', mediaType: 'application/json', size: 128
    });
    let publication = new Publication({
        documentId: 'world-farmstead-1',
        title: 'The Farmstead',
        author: signed ? 'alice' : null,
        providerId: 'local',
        parentDocumentId: null,
        contentHash: documentContentReference.hash,
        schemaVersion: 3,
        license: new License({ id: 'CC0-1.0' }),
        contentReference: documentContentReference,
        publisherIdentity: signed ? identityProvider.getSigningIdentity().toJSON() : null,
        signature: null
    });
    if (signed) {
        publication = publication.withSignature(identityProvider.signCanonical(publication.getSigningDescriptor()));
    }
    return publication;
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — round trip: every identity preserved
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        // Shared backing storage — the same "content propagates
        // independently of the publisher's device" property tests/
        // IpfsPublicationResolution.test.js already established one
        // transport over, modeled here the same way tests/
        // DecentralizedPublicationProtocol.test.js already does for a
        // LocalContentStore-backed exchange.
        const sharedStorage = new InMemoryStorageProvider();
        const aliceResolver = new PublicationResolver(new LocalContentStore(sharedStorage), new LocalAuthorizationVerifier());

        const originalPublication = makePublication({ signed: true }, alice);

        const envelope = await aliceResolver.publish({
            content: originalPublication,
            contentKind: PUBLICATION_CONTENT_KIND,
            identityProvider: alice
        });
        assert(envelope instanceof DecentralizedPublication, '1. publish() returns a DecentralizedPublication envelope');
        assert(!(envelope instanceof Publication), '2. the envelope is never itself a Publication — distinct layers');
        assert(envelope.contentKind === PUBLICATION_CONTENT_KIND, '3. the envelope declares the Publication content kind');

        // The exact bytes that would cross a peer, a pasted file, or a
        // real decentralized transport to reach a second replica.
        const envelopeJson = envelope.toJSON();

        const bobVerifier = new LocalAuthorizationVerifier();
        const bobResolver = new PublicationResolver(new LocalContentStore(sharedStorage), bobVerifier);
        const kindPlugin = createPublicationContentKind({ verifier: bobVerifier });

        const result = await bobResolver.resolve(envelopeJson, kindPlugin);
        assert(result.outcome === PublicationResolutionOutcome.RESOLVED, `4. Bob resolves the Publication (${result.reason})`);

        const resolved = result.content;
        assert(resolved instanceof Publication, '5. resolved content is a real Publication instance');
        assert(resolved !== originalPublication, '6. resolving never returns the SAME object — it is a freshly constructed representation');

        // The identities this milestone exists to preserve.
        assert(resolved.id === originalPublication.id, '7. publicationId preserved');
        assert(resolved.documentId === originalPublication.documentId, '8. documentId preserved');
        assert(resolved.contentReference.hash === originalPublication.contentReference.hash, '9. contentReference preserved');
        assert(resolved.contentReference.hash === 'docHash-fixed-content-1', '9b. contentReference still names the original DOCUMENT content, never the envelope\'s own hash');
        assert(resolved.title === originalPublication.title, '10. title preserved');
        assert(resolved.author === originalPublication.author, '11. author preserved');
        assert(resolved.license.id === 'CC0-1.0', '12. license preserved');
        assert(resolved.schemaVersion === originalPublication.schemaVersion, '13. schemaVersion preserved');
        assert(resolved.signature.signer === alice.getSigningIdentity().id, '14. the Publication\'s OWN signature (never the envelope\'s) is preserved and still names its real signer');

        console.log('✓ Section A: full round trip — every Publication identity field survives PublicationContentKind unmodified');
    }

    // ---------------------------------------------------------------
    // Section B — an UNSIGNED Publication (LocalPublisherProvider's own
    // default when identityProvider cannot sign) resolves exactly as
    // successfully as a signed one — the one production compatibility
    // fact 0.9.330's own audit found necessary and 0.9.331 exists to not
    // break.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice'); // still needed to sign the ENVELOPE — publish() always requires that
        const storage = new InMemoryStorageProvider();
        const resolver = new PublicationResolver(new LocalContentStore(storage), new LocalAuthorizationVerifier());

        const unsignedPublication = makePublication({ signed: false }, alice);
        assert(unsignedPublication.signature === null, 'precondition: this Publication carries no signature of its own');

        const envelope = await resolver.publish({
            content: unsignedPublication,
            contentKind: PUBLICATION_CONTENT_KIND,
            identityProvider: alice
        });

        const bobVerifier = new LocalAuthorizationVerifier();
        const kindPlugin = createPublicationContentKind({ verifier: bobVerifier });
        const result = await new PublicationResolver(new LocalContentStore(storage), bobVerifier)
            .resolve(envelope.toJSON(), kindPlugin);

        assert(result.outcome === PublicationResolutionOutcome.RESOLVED, `15. an unsigned Publication still resolves (${result.reason})`);
        assert(result.content.signature === null, '16. the resolved Publication is honestly still unsigned — nothing here fabricates a signature');
        console.log('✓ Section B: an unsigned Publication (the real LocalPublisherProvider default) resolves exactly as successfully as a signed one');
    }

    // ---------------------------------------------------------------
    // Section C — contentKind is unambiguous, in both directions
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const storage = new InMemoryStorageProvider();
        const resolver = new PublicationResolver(new LocalContentStore(storage), new LocalAuthorizationVerifier());
        const bobVerifier = new LocalAuthorizationVerifier();

        const publication = makePublication({ signed: true }, alice);
        const publicationEnvelope = await resolver.publish({
            content: publication, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: alice
        });

        let attribution = new BlueprintAttribution({ fingerprint: 'bp:farmstead-1', authorIdentityId: alice.getSigningIdentity().id });
        attribution = attribution.withSignature(alice.signCanonical(attribution.getSigningDescriptor()));
        const attributionEnvelope = await resolver.publish({
            content: attribution, contentKind: BLUEPRINT_ATTRIBUTION_KIND, contentSchemaVersion: ATTRIBUTION_SCHEMA_VERSION, identityProvider: alice
        });

        const publicationKind = createPublicationContentKind({ verifier: bobVerifier });
        const attributionKind = createBlueprintAttributionPublicationKind({ verifier: bobVerifier });

        const wrongWay = await new PublicationResolver(new LocalContentStore(storage), bobVerifier)
            .resolve(attributionEnvelope.toJSON(), publicationKind);
        assert(wrongWay.outcome === PublicationResolutionOutcome.INVALID_ENVELOPE, '17. a BlueprintAttribution envelope is rejected by the Publication kindPlugin');

        const otherWrongWay = await new PublicationResolver(new LocalContentStore(storage), bobVerifier)
            .resolve(publicationEnvelope.toJSON(), attributionKind);
        assert(otherWrongWay.outcome === PublicationResolutionOutcome.INVALID_ENVELOPE, '18. a Publication envelope is rejected by the BlueprintAttribution kindPlugin');

        assert(PUBLICATION_CONTENT_KIND !== BLUEPRINT_ATTRIBUTION_KIND, '19. the two content kind strings are themselves distinct');
        console.log('✓ Section C: contentKind discrimination holds in both directions — no accidental cross-acceptance between kinds');
    }

    // ---------------------------------------------------------------
    // Section D — negative test: an ordinary Publication never
    // accidentally becomes decentralized merely by existing. 0.9.330's
    // own audit found ZERO existing overlap between Publication and
    // DecentralizedPublication in production; this proves the new
    // content kind does not silently create any.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const ordinaryPublication = makePublication({ signed: true }, alice);

        assert(!(ordinaryPublication instanceof DecentralizedPublication), '20. an ordinary Publication is never itself a DecentralizedPublication');

        const rawJson = ordinaryPublication.toJSON();
        assert(rawJson.contentKind === undefined, '21. a Publication\'s own JSON carries no contentKind — it never self-declares as decentralized content');
        assert(rawJson.contentReference !== undefined && rawJson.kind === undefined,
            '22. a Publication\'s own JSON has no envelope-level `kind` discriminator at all — it is structurally never mistakable for a DecentralizedPublication envelope');

        expectThrows(
            () => DecentralizedPublication.fromJSON(rawJson),
            '23. constructing a DecentralizedPublication directly from a bare Publication\'s own JSON throws — it is missing contentKind entirely, one of several required envelope fields a bare Publication never carries'
        );

        console.log('✓ Section D: an ordinary Publication remains an ordinary Publication — it becomes decentralized content only through an explicit publish() call, never automatically');
    }

    // ---------------------------------------------------------------
    // Section E — structural validation
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const validPublication = makePublication({ signed: true }, alice).toJSON();

        // Well-formed input passes cleanly.
        validatePublicationContent(validPublication);

        // Missing documentId — the one identity this milestone exists to
        // protect — is rejected.
        const missingDocumentId = { ...validPublication, documentId: undefined };
        const err = expectThrows(
            () => validatePublicationContent(missingDocumentId),
            '24. a payload missing documentId is rejected'
        );
        assert(err instanceof PublicationContentError, '25. the thrown error is a PublicationContentError');

        // A signature present without its accompanying publisherIdentity
        // is rejected — the identical pairing identity/
        // LocalAuthorizationVerifier.js#verifyPublication() itself
        // already requires.
        const signatureWithoutIdentity = { ...validPublication, publisherIdentity: null };
        expectThrows(
            () => validatePublicationContent(signatureWithoutIdentity),
            '26. a signature without a publisherIdentity is rejected'
        );

        // But an entirely UNSIGNED payload — no signature, no
        // publisherIdentity at all — passes: signing a Publication has
        // never been required (unlike every other content kind this
        // codebase ships).
        const entirelyUnsigned = { ...validPublication, signature: null, publisherIdentity: null };
        validatePublicationContent(entirelyUnsigned);

        console.log('✓ Section E: structural validation protects documentId and signature/publisherIdentity pairing without ever requiring a signature');
    }

    // ---------------------------------------------------------------
    // Section F — tamper detection, inherited for free from
    // application/PublicationResolver.js's own pipeline
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const storage = new InMemoryStorageProvider();
        const resolver = new PublicationResolver(new LocalContentStore(storage), new LocalAuthorizationVerifier());
        const publication = makePublication({ signed: true }, alice);

        const envelope = await resolver.publish({
            content: publication, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: alice
        });

        // Corrupt the stored bytes after the fact — the same attack
        // shape tests/DecentralizedPublicationProtocol.test.js already
        // exercises for BlueprintAttribution, one content kind over.
        storage.save('content:' + envelope.contentReference.hash, JSON.stringify({ ...publication.toJSON(), documentId: 'a-different-document' }));

        const bobVerifier = new LocalAuthorizationVerifier();
        const kindPlugin = createPublicationContentKind({ verifier: bobVerifier });
        const result = await new PublicationResolver(new LocalContentStore(storage), bobVerifier)
            .resolve(envelope.toJSON(), kindPlugin);

        assert(result.outcome === PublicationResolutionOutcome.CONTENT_HASH_MISMATCH, '27. tampering with the stored Publication bytes is caught as a hash mismatch, never silently accepted');
        assert(result.content === null, '28. no content is ever returned on a failed resolution');
        console.log('✓ Section F: content tampering is caught by application/PublicationResolver.js\'s own existing pipeline — this content kind adds no new trust');
    }

    console.log('\nAll Publication Content Kind tests passed.');
}

run().catch((error) => {
    console.error('PublicationContentKind.test.js FAILED:', error);
    process.exitCode = 1;
});
