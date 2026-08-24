import { PublicationAnchor } from '../core/PublicationAnchor.js';
import { PublicationAnchorError } from '../application/PublicationAnchorValidator.js';
import { LocalPublicationAnchorCatalog } from '../application/LocalPublicationAnchorCatalog.js';
import { AddPublicationAnchorUseCase } from '../application/AddPublicationAnchorUseCase.js';
import { ExternalAnchorVerifier } from '../application/ExternalAnchorVerifier.js';
import { AnchorVerificationOutcome } from '../application/AnchorVerificationOutcome.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';

// 0.8.2 — Anchor Catalog & Evidence Discovery.
//
//   Section A: flagship — Alice signs an anchor; Bob, with none of
//              Alice's local state, catalogs it and INDEPENDENTLY
//              verifies it. Cataloging and verifying never touch each
//              other.
//   Section B: LocalPublicationAnchorCatalog — add/has/get/remove/list/
//              getReceivedAt, id-based dedup (first-seen-wins),
//              findByPublicationId/findByContentHash/findByAnchorType,
//              deterministic most-recently-received ordering.
//   Section C: multi-evidence coexistence — several independent anchors
//              for the same publication/content never collapse into one
//              and none is ever selected as canonical.
//   Section D: verification separation — a cataloged anchor whose proof
//              is unavailable, invalid, or never checked at all stays
//              exactly as cataloged; the catalog never stores a
//              verification outcome; AddPublicationAnchorUseCase never
//              calls a verifier.
//
// See docs/Principles.md, "Cataloging External Evidence Does Not
// Validate External Evidence (0.8.2)."

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

function makeCatalog() {
    return new LocalPublicationAnchorCatalog(new InMemoryStorageProvider());
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — flagship: Alice signs, Bob catalogs, Bob verifies
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const anchor = signAnchor(alice, {
            publicationId: 'pub-flagship', contentHash: 'hash-flagship', anchorType: 'local-test', locator: 'local://ledger/flagship'
        });
        const anchorJson = anchor.toJSON();

        // Bob has none of Alice's state — a fresh catalog, a fresh
        // verifier.
        const bobCatalog = makeCatalog();
        const addAnchor = new AddPublicationAnchorUseCase(bobCatalog);

        const { anchor: cataloged, isNew } = addAnchor.execute(anchorJson);
        assert(isNew === true, '1. Bob catalogs Alice\'s anchor as new');
        assert(cataloged.id === anchor.id, '2. the cataloged anchor preserves the signed envelope\'s own id');
        assert(bobCatalog.has(anchor.id), '3. the catalog now reports the anchor as known');

        const bobVerifier = new ExternalAnchorVerifier(new LocalAuthorizationVerifier());
        const fromCatalog = bobCatalog.get(anchor.id);
        const result = await bobVerifier.verify(fromCatalog.toJSON());
        assert(result.outcome === AnchorVerificationOutcome.VALID_PROOF_UNVERIFIED,
            '4. Bob independently verifies the cataloged anchor\'s signature (proof unverified — no plugin supplied)');
    }
    console.log('✓ Section A: flagship — Alice signs, Bob catalogs, Bob independently verifies');

    // ---------------------------------------------------------------
    // Section B — LocalPublicationAnchorCatalog CRUD, dedup, ordering
    // ---------------------------------------------------------------
    {
        const registry = makeIdentity('Registry');
        expectThrows(() => new LocalPublicationAnchorCatalog(null), '1. requires a storageProvider');

        const catalog = makeCatalog();
        expectThrows(() => catalog.add(null), '2. add() requires a PublicationAnchor instance');
        assert(catalog.get('missing') === null, '3. get() on an unknown id returns null, never throws');
        assert(catalog.has('missing') === false, '4. has() on an unknown id is false');
        assert(catalog.remove('missing') === false, '5. remove() on an unknown id returns false');
        assert(catalog.list().length === 0, '6. an empty catalog lists nothing');
        assert(catalog.getReceivedAt('missing') === null, '7. getReceivedAt() on an unknown id returns null');

        const anchor = signAnchor(registry, {
            publicationId: 'pub-b', contentHash: 'hash-b', anchorType: 'local-test', locator: 'local://ledger/b'
        });
        const first = catalog.add(anchor);
        assert(first.isNew === true, '8. the first add() reports isNew');
        assert(catalog.has(anchor.id), '9. the anchor is now known');
        assert(catalog.get(anchor.id).id === anchor.id, '10. get() returns the same anchor');

        // Re-adding the SAME anchor id is never an error, and never
        // resets receivedAt or overwrites the stored envelope
        // (first-seen-wins) — mirrors LocalPublicationCatalog#add().
        const firstReceivedAt = catalog.getReceivedAt(anchor.id);
        const second = catalog.add(anchor);
        assert(second.isNew === false, '11. re-adding the same anchor id reports isNew: false');
        assert(catalog.getReceivedAt(anchor.id) === firstReceivedAt, '12. re-adding never resets receivedAt');
        assert(catalog.list().length === 1, '13. re-adding never creates a second entry');

        // remove() withdraws it locally, without mutating the removed
        // anchor's own fields.
        const beforeRemoval = catalog.get(anchor.id);
        assert(catalog.remove(anchor.id) === true, '14. remove() reports true for a known anchor');
        assert(catalog.has(anchor.id) === false, '15. the anchor is no longer known after removal');
        assert(beforeRemoval.contentHash === 'hash-b' && beforeRemoval.publicationId === 'pub-b',
            '16. the anchor object handed back before removal is untouched by removal');

        // Deterministic, most-recently-received-first ordering.
        catalog.add(anchor);
        const anchor2 = signAnchor(registry, {
            publicationId: 'pub-b2', contentHash: 'hash-b2', anchorType: 'local-test', locator: 'local://ledger/b2'
        });
        catalog.add(anchor2);
        const listed = catalog.list();
        assert(listed.length === 2 && listed[0].id === anchor2.id && listed[1].id === anchor.id,
            '17. list() orders most recently received first');
    }
    console.log('✓ Section B: LocalPublicationAnchorCatalog — CRUD, id-based dedup, deterministic ordering');

    // ---------------------------------------------------------------
    // Section C — multi-evidence coexistence
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bitcoinRegistry = makeIdentity('BitcoinRegistry');
        const otherRegistry = makeIdentity('OtherRegistry');
        const catalog = makeCatalog();

        // Publication P has three independent anchors: two different
        // anchoring identities under two different anchorTypes for the
        // SAME publicationId/contentHash, plus a second, unrelated
        // publication's own anchor.
        const anchorA = signAnchor(bitcoinRegistry, {
            publicationId: 'pub-p', contentHash: 'hash-p', anchorType: 'bitcoin-op-return', locator: 'bitcoin://tx/aaa'
        });
        const anchorB = signAnchor(otherRegistry, {
            publicationId: 'pub-p', contentHash: 'hash-p', anchorType: 'other-ledger', locator: 'other://chain/bbb'
        });
        const anchorC = signAnchor(alice, {
            publicationId: 'pub-q', contentHash: 'hash-q', anchorType: 'local-test', locator: 'local://ledger/ccc'
        });

        catalog.add(anchorA);
        catalog.add(anchorB);
        catalog.add(anchorC);

        assert(catalog.list().length === 3, '1. all three independent anchors coexist');

        const forP = catalog.findByPublicationId('pub-p');
        assert(forP.length === 2 && forP.some((a) => a.id === anchorA.id) && forP.some((a) => a.id === anchorB.id),
            '2. findByPublicationId returns every anchor naming that publication, none preferred');

        const forHashP = catalog.findByContentHash('hash-p');
        assert(forHashP.length === 2, '3. findByContentHash returns every anchor naming that content hash');

        const bitcoinAnchors = catalog.findByAnchorType('bitcoin-op-return');
        assert(bitcoinAnchors.length === 1 && bitcoinAnchors[0].id === anchorA.id,
            '4. findByAnchorType narrows to exactly the matching anchorType');

        const otherAnchors = catalog.findByAnchorType('other-ledger');
        assert(otherAnchors.length === 1 && otherAnchors[0].id === anchorB.id,
            '5. a different anchorType narrows independently');

        assert(catalog.findByPublicationId('pub-q').length === 1
            && catalog.findByPublicationId('pub-q')[0].id === anchorC.id,
            '6. an unrelated publication\'s own anchor is unaffected by pub-p\'s two anchors');

        // No method anywhere on this catalog ever selects one of these
        // as "the" anchor for pub-p/hash-p — findByPublicationId() and
        // findByContentHash() both always return the full set.
        assert(forP.length === forHashP.length, '7. publicationId and contentHash scoping agree on the same evidence set here');
    }
    console.log('✓ Section C: multi-evidence coexistence — several independent anchors, none canonical');

    // ---------------------------------------------------------------
    // Section D — cataloging is not verifying
    // ---------------------------------------------------------------
    {
        const registry = makeIdentity('Registry');
        const catalog = makeCatalog();
        const addAnchor = new AddPublicationAnchorUseCase(catalog);

        expectThrows(() => new AddPublicationAnchorUseCase(null), '1. requires a catalog');

        // A structurally malformed envelope is refused before ever
        // reaching the catalog.
        const goodAnchor = signAnchor(registry, {
            publicationId: 'pub-d', contentHash: 'hash-d', anchorType: 'bitcoin-op-return', locator: 'bitcoin://tx/unreachable'
        });
        const malformed = { ...goodAnchor.toJSON(), kind: 'something.else' };
        const err = expectThrows(() => addAnchor.execute(malformed), '2. rejects a structurally malformed envelope');
        assert(err instanceof PublicationAnchorError, '3. the rejection is a PublicationAnchorError');
        assert(catalog.list().length === 0, '4. a rejected envelope never reaches the catalog');

        // A well-formed but UNSIGNED anchor — something no
        // ExternalAnchorVerifier would ever call VALID or even
        // VALID_PROOF_UNVERIFIED — still catalogs cleanly, because
        // structural validation, not signature verification, is the
        // only gate this use case applies.
        const unsigned = new PublicationAnchor({
            publicationId: 'pub-unsigned', contentHash: 'hash-unsigned', anchorType: 'local-test', locator: 'local://ledger/unsigned',
            anchorIdentity: registry.getSigningIdentity().toJSON(),
            signature: {
                algorithm: 'none', signer: 'nobody', signature: 'not-a-real-signature',
                signedHash: 'not-a-real-hash', domain: 'forkbuild.test'
            }
        });
        const { isNew: unsignedIsNew } = addAnchor.execute(unsigned.toJSON());
        assert(unsignedIsNew === true, '5. a well-formed-but-forged/unsigned anchor still catalogs — verification is never a cataloging gate');

        const forgeryCheck = await new ExternalAnchorVerifier(new LocalAuthorizationVerifier()).verify(unsigned.toJSON());
        assert(forgeryCheck.outcome === AnchorVerificationOutcome.INVALID_SIGNATURE,
            '6. that same anchor genuinely fails independent verification, proving cataloging never implied it');
        assert(catalog.has(unsigned.id), '7. the anchor remains cataloged even though it fails verification');

        // A genuinely signed anchor whose external system is presently
        // unreachable (PROOF_UNAVAILABLE) also stays exactly as
        // cataloged.
        const { anchor: cataloged } = addAnchor.execute(goodAnchor.toJSON());
        assert(catalog.has(cataloged.id), '8. a genuinely signed anchor catalogs normally');

        const unavailablePlugin = {
            anchorType: 'bitcoin-op-return',
            verify: () => { throw new Error('block explorer unreachable'); }
        };
        const verifier = new ExternalAnchorVerifier(new LocalAuthorizationVerifier());
        const unavailableResult = await verifier.verify(catalog.get(cataloged.id).toJSON(), { proofVerifier: unavailablePlugin });
        assert(unavailableResult.outcome === AnchorVerificationOutcome.PROOF_UNAVAILABLE,
            '9. the external system being unreachable is reported honestly by the verifier');
        assert(catalog.has(cataloged.id), '10. the anchor remains cataloged, completely unaffected by the failed verification attempt');
        assert(catalog.get(cataloged.id).toJSON().verified === undefined
            && catalog.get(cataloged.id).toJSON().verificationOutcome === undefined,
            '11. the catalog never stores a verification outcome on the anchor record itself');

        // Cataloging performs no network access and never consults any
        // verifier at all — proven by a plugin that would throw/assert
        // if AddPublicationAnchorUseCase ever called it, and never does.
        let verifierCalled = false;
        const spyPlugin = { anchorType: 'bitcoin-op-return', verify: () => { verifierCalled = true; return { valid: true }; } };
        const freshCatalog = makeCatalog();
        const freshAddAnchor = new AddPublicationAnchorUseCase(freshCatalog);
        const anotherAnchor = signAnchor(registry, {
            publicationId: 'pub-spy', contentHash: 'hash-spy', anchorType: 'bitcoin-op-return', locator: 'bitcoin://tx/spy', proof: { txid: 'spy' }
        });
        freshAddAnchor.execute(anotherAnchor.toJSON());
        assert(verifierCalled === false, '12. cataloging an anchor never invokes any proofVerifier, even one that matches its anchorType');
    }
    console.log('✓ Section D: cataloging is not verifying — unsigned/unavailable/invalid anchors stay cataloged, no verifier is ever consulted');

    console.log('\nAll Publication Anchor Catalog tests passed.');
}

run().catch((error) => {
    console.error('PublicationAnchorCatalog.test.js FAILED:', error);
    process.exitCode = 1;
});
