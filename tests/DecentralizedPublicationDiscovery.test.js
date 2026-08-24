import { DecentralizedPublication } from '../core/DecentralizedPublication.js';
import { ContentReference } from '../core/ContentReference.js';
import { LocalPublicationCatalog } from '../application/LocalPublicationCatalog.js';
import { PublicationExchange } from '../application/PublicationExchange.js';
import { PublicationResolver } from '../application/PublicationResolver.js';
import { PublicationResolutionOutcome } from '../application/PublicationResolutionOutcome.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { BlueprintAttribution, BLUEPRINT_ATTRIBUTION_KIND } from '../core/BlueprintAttribution.js';
import { LocalBlueprintAttributionStore } from '../application/LocalBlueprintAttributionStore.js';
import { createBlueprintAttributionPublicationKind } from '../application/BlueprintAttributionPublicationKind.js';

// 0.7.2 — Decentralized Publication Discovery & Catalog.
//
//   Section A: LocalPublicationCatalog — add/has/get/list/remove,
//              dedup-by-id, first-seen-wins receivedAt, findByContentHash/
//              findByContentKind/findByPublisher
//   Section B: PublicationExchange — the validate/construct/verify
//              import discipline, structural + signature rejections,
//              re-import dedup, export guards
//   Section C: Cataloging is not resolving — a publication whose content
//              is not yet locally available still catalogs cleanly, and
//              stays cataloged, unchanged, across a
//              CONTENT_UNAVAILABLE -> RESOLVED transition driven entirely
//              by application/PublicationResolver.js, never by the
//              catalog itself
//
// See docs/Principles.md, "Discovery Is Not Resolution (0.7.2)."

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

function publishTestEnvelope(identityProvider, { contentKind = 'forkbuild.test-content', hash = 'hash-' + Math.random() } = {}) {
    const contentReference = new ContentReference({ hash, algorithm: 'fnv1a-32', size: 1 });
    let publication = new DecentralizedPublication({
        contentKind,
        contentReference,
        publisherIdentity: identityProvider.getSigningIdentity().toJSON()
    });
    publication = publication.withSignature(identityProvider.signCanonical(publication.getSigningDescriptor()));
    return publication;
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — LocalPublicationCatalog
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const catalog = new LocalPublicationCatalog(new InMemoryStorageProvider());

        const pubA = publishTestEnvelope(alice, { contentKind: 'forkbuild.test-content', hash: 'shared-hash' });
        const pubB = publishTestEnvelope(bob, { contentKind: 'forkbuild.other-content', hash: 'shared-hash' });

        assert(catalog.list().length === 0, '1. a fresh catalog knows about nothing');
        assert(catalog.has(pubA.id) === false, '2. has() is false before add()');
        assert(catalog.get(pubA.id) === null, '3. get() is null before add()');
        assert(catalog.getReceivedAt(pubA.id) === null, '4. getReceivedAt() is null before add()');

        const addResultA = catalog.add(pubA);
        assert(addResultA.isNew === true, '5. adding a new publication reports isNew');
        assert(catalog.has(pubA.id), '6. has() is true after add()');
        assert(catalog.get(pubA.id).id === pubA.id, '7. get() returns the cataloged publication');
        assert(typeof catalog.getReceivedAt(pubA.id) === 'string', '8. getReceivedAt() is set after add()');

        const firstReceivedAt = catalog.getReceivedAt(pubA.id);
        const addAgain = catalog.add(pubA);
        assert(addAgain.isNew === false, '9. re-adding the identical id reports isNew: false');
        assert(catalog.getReceivedAt(pubA.id) === firstReceivedAt, '10. re-adding never resets receivedAt (first-seen-wins)');
        assert(catalog.list().length === 1, '11. re-adding never creates a second entry');

        catalog.add(pubB);
        assert(catalog.list().length === 2, '12. two distinct publication ids both catalog');

        const byHash = catalog.findByContentHash('shared-hash');
        assert(byHash.length === 2, '13. findByContentHash finds every envelope pointing at the same bytes');
        assert(byHash.some((p) => p.id === pubA.id) && byHash.some((p) => p.id === pubB.id),
            '14. findByContentHash finds both independently signed publications for shared-hash');

        assert(catalog.findByContentKind('forkbuild.test-content').length === 1, '15. findByContentKind narrows by wrapped kind');
        assert(catalog.findByContentKind('forkbuild.test-content')[0].id === pubA.id, '16. findByContentKind returns the right publication');
        assert(catalog.findByContentKind('forkbuild.nonexistent-kind').length === 0, '17. findByContentKind returns nothing for an unknown kind');

        assert(catalog.findByPublisher(alice.getSigningIdentity().id).length === 1, '18. findByPublisher narrows by signer');
        assert(catalog.findByPublisher(alice.getSigningIdentity().id)[0].id === pubA.id, '19. findByPublisher returns the right publication');
        assert(catalog.findByPublisher(bob.getSigningIdentity().id)[0].id === pubB.id, '20. findByPublisher distinguishes publishers');

        assert(catalog.remove('not-a-real-id') === false, '21. remove() on an unknown id returns false');
        assert(catalog.remove(pubA.id) === true, '22. remove() on a known id returns true');
        assert(catalog.has(pubA.id) === false, '23. remove() actually forgets the publication');
        assert(catalog.list().length === 1, '24. remove() leaves the other entry untouched');

        expectThrows(() => catalog.add(null), '25. add() rejects a non-publication value');
        expectThrows(() => catalog.add({}), '26. add() rejects a plain object with no id/toJSON');
    }
    console.log('✓ Section A: LocalPublicationCatalog — add/has/get/list/remove, dedup, receivedAt, find*');

    // ---------------------------------------------------------------
    // Section B — PublicationExchange
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const catalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const verifier = new LocalAuthorizationVerifier();
        const exchange = new PublicationExchange(catalog, verifier);

        const publication = publishTestEnvelope(alice);
        const envelope = exchange.exportPublication(publication);
        assert(envelope.id === publication.id, '1. exportPublication round-trips the envelope id');

        expectThrows(() => exchange.exportPublication({}), '2. exportPublication rejects a non-instance');
        expectThrows(() => exchange.exportPublication(new DecentralizedPublication({
            contentKind: 'forkbuild.test-content',
            contentReference: new ContentReference({ hash: 'x' })
        })), '3. exportPublication rejects an unsigned publication');

        const importResult = exchange.importPublication(envelope);
        assert(importResult.isNew === true, '4. importing a new envelope reports isNew');
        assert(catalog.has(publication.id), '5. importPublication actually catalogs the publication');

        const reImportResult = exchange.importPublication(envelope);
        assert(reImportResult.isNew === false, '6. re-importing the identical envelope reports isNew: false');
        assert(catalog.list().length === 1, '7. re-importing never duplicates the catalog entry');

        expectThrows(() => exchange.importPublication(null), '8. importPublication rejects a null package');
        expectThrows(() => exchange.importPublication({ ...envelope, kind: 'something.else' }),
            '9. importPublication rejects a malformed envelope (structural)');

        const tampered = { ...envelope, contentReference: { ...envelope.contentReference, hash: 'tampered-hash' } };
        const err = expectThrows(() => exchange.importPublication(tampered),
            '10. importPublication rejects an envelope whose signature no longer matches its own fields');
        assert(/unverifiable/.test(err.message), '11. the rejection reason names signature verification');

        const forged = { ...envelope, publisherIdentity: { ...envelope.publisherIdentity, id: 'did:key:someone-else' } };
        expectThrows(() => exchange.importPublication(forged),
            '12. importPublication rejects an envelope with a swapped publisher identity');
    }
    console.log('✓ Section B: PublicationExchange — import discipline, structural + signature rejections, dedup, export guards');

    // ---------------------------------------------------------------
    // Section C — Cataloging is not resolving
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');

        const aliceContentStore = new LocalContentStore(new InMemoryStorageProvider());
        const bobContentStore = new LocalContentStore(new InMemoryStorageProvider());
        const verifier = new LocalAuthorizationVerifier();

        const aliceAttributionStore = new LocalBlueprintAttributionStore(new InMemoryStorageProvider());
        const bobAttributionStore = new LocalBlueprintAttributionStore(new InMemoryStorageProvider());

        const aliceResolver = new PublicationResolver(aliceContentStore, verifier);
        const bobResolver = new PublicationResolver(bobContentStore, verifier);
        const bobCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const bobExchange = new PublicationExchange(bobCatalog, verifier);

        const attribution = new BlueprintAttribution({
            fingerprint: 'bp:farmstead-1',
            authorIdentityId: alice.getSigningIdentity().id
        });
        const signedAttribution = attribution.withSignature(
            alice.signCanonical(attribution.getSigningDescriptor())
        );

        const publication = await aliceResolver.publish({
            content: signedAttribution,
            contentKind: BLUEPRINT_ATTRIBUTION_KIND,
            identityProvider: alice
        });
        const envelope = publication.toJSON();

        // Bob receives the publication envelope (a pasted file, in this
        // milestone's own deliberately boring transport) before he has
        // any copy of the bytes it points at — he was never sent Alice's
        // ContentStore, only the signed locator.
        const importResult = bobExchange.importPublication(envelope);
        assert(importResult.isNew === true, '1. Bob catalogs the publication he never saw before');
        assert(bobCatalog.has(publication.id), '2. the publication is now known to Bob');

        const bobKindPlugin = createBlueprintAttributionPublicationKind({ verifier, store: bobAttributionStore });

        const beforeResult = await bobResolver.resolve(envelope, bobKindPlugin);
        assert(beforeResult.outcome === PublicationResolutionOutcome.CONTENT_UNAVAILABLE,
            '3. resolving a cataloged publication with no local bytes yet reports CONTENT_UNAVAILABLE');
        assert(bobCatalog.has(publication.id), '4. a CONTENT_UNAVAILABLE resolution never evicts the catalog entry');
        assert(bobAttributionStore.list('bp:farmstead-1').length === 0,
            '5. nothing was stored on the domain side for an unresolved publication');

        // The bytes propagate — exactly the same "bridge two replicas by
        // hand" step 0.7.0's own Section C flagship already uses in place
        // of a real network, and 0.7.1's own IpfsPublicationResolution
        // test performs for real against Kubo.
        const bytes = await aliceContentStore.get(publication.contentReference);
        await bobContentStore.put(bytes);

        const afterResult = await bobResolver.resolve(envelope, bobKindPlugin);
        assert(afterResult.outcome === PublicationResolutionOutcome.RESOLVED,
            '6. the identical cataloged publication now resolves once its bytes are locally available');
        assert(afterResult.content.attribution.fingerprint === 'bp:farmstead-1',
            '7. the resolved content is the correct attribution');
        assert(bobAttributionStore.has('bp:farmstead-1', signedAttribution.id),
            '8. resolving now stores the attribution on the domain side');

        // The catalog entry itself never changed shape across the
        // transition — same publication, same receivedAt, only the
        // RESOLVER'S derived outcome moved.
        assert(bobCatalog.get(publication.id).id === publication.id,
            '9. the cataloged publication is unchanged by resolving it');
        assert(bobCatalog.list().length === 1, '10. resolving never adds a second catalog entry');
    }
    console.log('✓ Section C: Cataloging is not resolving — CONTENT_UNAVAILABLE -> RESOLVED transition leaves the catalog entry untouched');

    console.log('\nAll Decentralized Publication Discovery tests passed.');
}

run().catch((error) => {
    console.error('DecentralizedPublicationDiscovery.test.js FAILED:', error);
    process.exitCode = 1;
});
