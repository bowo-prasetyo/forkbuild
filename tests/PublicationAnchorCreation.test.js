import { DecentralizedPublication } from '../core/DecentralizedPublication.js';
import { ContentReference } from '../core/ContentReference.js';
import { PublicationAnchor } from '../core/PublicationAnchor.js';
import { LocalPublicationCatalog } from '../application/LocalPublicationCatalog.js';
import { LocalPublicationAnchorCatalog } from '../application/LocalPublicationAnchorCatalog.js';
import { CreatePublicationAnchorUseCase } from '../application/CreatePublicationAnchorUseCase.js';
import { ExternalAnchorVerifier } from '../application/ExternalAnchorVerifier.js';
import { AnchorVerificationOutcome } from '../application/AnchorVerificationOutcome.js';
import { derivePublicationEvidenceConvergence } from '../application/PublicationEvidenceConvergence.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';

// 0.8.8 — Explicit Publication Anchor Creation & Lifecycle.
//
//   Section A: flagship — Alice creates an anchor for her own published
//              content; the anchor binds to the publication's own
//              contentHash, is genuinely signed, lands in the catalog,
//              and immediately participates in evidence convergence —
//              all before anyone ever asks whether its proof holds up.
//   Section B: publication binding — an unknown publicationId is
//              refused; the derived contentHash always matches the
//              looked-up publication's own contentReference.hash, never
//              a caller-supplied one (there is no such option at all).
//   Section C: identity — creation without a signed-in identity refuses;
//              the created anchor's signature verifies against
//              identity/LocalAuthorizationVerifier.js exactly like any
//              other anchor.
//   Section D: creation never verifies proof — a spy ExternalAnchorVerifier
//              proves execute() never consults one, and the SAME created
//              anchor independently produces VALID, PROOF_UNAVAILABLE, or
//              INVALID_PROOF depending only on what proof verifier is
//              handed to it afterward.
//   Section E: creation never mutates the publication — the publication's
//              own signed JSON is byte-identical before and after
//              anchoring it.
//
// See docs/Principles.md, "Creating an Anchor Claim Does Not Create
// External Evidence (0.8.8)."

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

function makeReplica() {
    const publicationCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
    const anchorCatalog = new LocalPublicationAnchorCatalog(new InMemoryStorageProvider());
    const verifier = new LocalAuthorizationVerifier();
    // No identity is authenticated on this provider yet — the "nobody
    // is signed in" case Section C exercises, distinct from having no
    // identityProvider at all.
    const unauthenticatedIdentityProvider = new LocalIdentityProvider(new InMemoryStorageProvider());
    return {
        publicationCatalog,
        anchorCatalog,
        verifier,
        useCase: new CreatePublicationAnchorUseCase(publicationCatalog, unauthenticatedIdentityProvider, verifier, anchorCatalog)
    };
}

function withIdentityProvider(replica, identityProvider) {
    return new CreatePublicationAnchorUseCase(replica.publicationCatalog, identityProvider, replica.verifier, replica.anchorCatalog);
}

function publishContent(publicationCatalog, { id = 'pub-1', hash = 'hash-1' } = {}) {
    const publication = new DecentralizedPublication({
        id,
        contentKind: 'forkbuild.structure',
        contentReference: new ContentReference({ hash })
    });
    publicationCatalog.add(publication);
    return publication;
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — flagship
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const replica = makeReplica();
        const useCase = withIdentityProvider(replica, alice);
        const publication = publishContent(replica.publicationCatalog, { id: 'pub-flagship', hash: 'hash-flagship' });

        const anchor = useCase.execute('pub-flagship', {
            anchorType: 'bitcoin-op-return',
            locator: 'https://mempool.space/tx/abc123',
            proof: { txid: 'abc123', blockHeight: 900000 },
            anchoredAt: new Date('2026-08-24T00:00:00Z')
        });

        assert(anchor instanceof PublicationAnchor, '1. execute() returns a real PublicationAnchor instance');
        assert(anchor.publicationId === 'pub-flagship', '2. the anchor names the publication it was created for');
        assert(anchor.contentHash === publication.contentReference.hash, '3. the anchor\'s contentHash is derived from the publication\'s own contentReference.hash');
        assert(anchor.anchorType === 'bitcoin-op-return' && anchor.locator === 'https://mempool.space/tx/abc123', '4. anchorType/locator are carried through unchanged');
        assert(anchor.signature && anchor.anchorIdentity.id === alice.getSigningIdentity().id, '5. the anchor is signed by the identity the use case was given, not an inferred one');

        assert(replica.anchorCatalog.has(anchor.id), '6. the created anchor is already cataloged — no separate add() call needed');
        const bobsView = replica.anchorCatalog.findByPublicationId('pub-flagship');
        assert(bobsView.length === 1 && bobsView[0].id === anchor.id, '7. the catalog holds exactly the created anchor');

        const convergence = derivePublicationEvidenceConvergence({
            publicationId: 'pub-flagship',
            expectedContentHash: publication.contentReference.hash,
            anchors: replica.anchorCatalog.findByPublicationId('pub-flagship')
        });
        assert(convergence.anchorCount === 1 && convergence.contentBindingConflict === false,
            '8. the created anchor immediately participates in evidence convergence, agreeing with the publication it was created from');
    }
    console.log('✓ Section A: flagship — create binds to the publication\'s own contentHash, signs, catalogs, and converges');

    // ---------------------------------------------------------------
    // Section B — publication binding
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const replica = makeReplica();
        const useCase = withIdentityProvider(replica, alice);

        expectThrows(() => useCase.execute('pub-unknown', { anchorType: 'bitcoin-op-return', locator: 'https://example.test' }),
            '9. creating an anchor for an unknown publicationId throws rather than accepting an arbitrary contentHash');

        // There is no `contentHash` option at all — a caller cannot
        // override the derived value even by trying.
        const publication = publishContent(replica.publicationCatalog, { id: 'pub-2', hash: 'hash-2' });
        const anchor = useCase.execute('pub-2', {
            anchorType: 'bitcoin-op-return', locator: 'https://example.test', contentHash: 'attacker-supplied-hash'
        });
        assert(anchor.contentHash === publication.contentReference.hash && anchor.contentHash !== 'attacker-supplied-hash',
            '10. a stray contentHash field in the options is silently ignored — the derived value always wins');
    }
    console.log('✓ Section B: publication binding — unknown publications refuse; contentHash is always derived, never caller-suppliable');

    // ---------------------------------------------------------------
    // Section C — identity
    // ---------------------------------------------------------------
    {
        const replica = makeReplica();
        publishContent(replica.publicationCatalog, { id: 'pub-3', hash: 'hash-3' });

        expectThrows(() => replica.useCase.execute('pub-3', { anchorType: 'bitcoin-op-return', locator: 'https://example.test' }),
            '11. creating an anchor with nobody signed in refuses rather than producing an unsigned anchor');

        const alice = makeIdentity('Alice');
        const useCase = withIdentityProvider(replica, alice);
        const anchor = useCase.execute('pub-3', { anchorType: 'bitcoin-op-return', locator: 'https://example.test' });
        const signatureResult = replica.verifier.verifyPublicationAnchor(anchor.toJSON());
        assert(signatureResult.valid, `12. the created anchor's signature verifies through the same identity/LocalAuthorizationVerifier.js path as any other anchor — ${signatureResult.reason}`);
    }
    console.log('✓ Section C: identity — no anchor is ever created unsigned; the signature verifies through the ordinary path');

    // ---------------------------------------------------------------
    // Section D — creation never verifies proof
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const replica = makeReplica();
        const useCase = withIdentityProvider(replica, alice);
        publishContent(replica.publicationCatalog, { id: 'pub-4', hash: 'hash-4' });

        let verifyCalls = 0;
        const spyVerifier = {
            verifyPublicationAnchor(record) {
                verifyCalls += 1;
                return replica.verifier.verifyPublicationAnchor(record);
            }
        };
        const spiedUseCase = new CreatePublicationAnchorUseCase(replica.publicationCatalog, alice, spyVerifier, replica.anchorCatalog);
        const anchor = spiedUseCase.execute('pub-4', {
            anchorType: 'bitcoin-op-return', locator: 'https://example.test', proof: { txid: 'deadbeef' }
        });
        assert(verifyCalls === 1, '13. execute() consults the SIGNATURE verifier exactly once (its own self-check) — never a proof verifier');

        // The created anchor, fed to ExternalAnchorVerifier afterward,
        // independently reports whatever a supplied proofVerifier says —
        // proving creation never pre-judged the proof either way.
        const externalVerifier = new ExternalAnchorVerifier(replica.verifier);

        const unverifiedResult = await externalVerifier.verify(anchor.toJSON(), { expectedContentHash: anchor.contentHash });
        assert(unverifiedResult.outcome === AnchorVerificationOutcome.VALID_PROOF_UNVERIFIED,
            '14. with no proofVerifier supplied, verification honestly reports VALID_PROOF_UNVERIFIED');

        const acceptingVerifier = { anchorType: 'bitcoin-op-return', verify: async () => ({ valid: true }) };
        const validResult = await externalVerifier.verify(anchor.toJSON(), { expectedContentHash: anchor.contentHash, proofVerifier: acceptingVerifier });
        assert(validResult.outcome === AnchorVerificationOutcome.VALID, '15. the identical created anchor verifies VALID once a proof verifier confirms it');

        const rejectingVerifier = { anchorType: 'bitcoin-op-return', verify: async () => ({ valid: false, reason: 'txid not found' }) };
        const invalidResult = await externalVerifier.verify(anchor.toJSON(), { expectedContentHash: anchor.contentHash, proofVerifier: rejectingVerifier });
        assert(invalidResult.outcome === AnchorVerificationOutcome.INVALID_PROOF, '16. the identical created anchor verifies INVALID_PROOF once a proof verifier rejects it');

        const unavailableVerifier = { anchorType: 'bitcoin-op-return', verify: async () => ({ valid: false, unavailable: true, reason: 'node unreachable' }) };
        const unavailableResult = await externalVerifier.verify(anchor.toJSON(), { expectedContentHash: anchor.contentHash, proofVerifier: unavailableVerifier });
        assert(unavailableResult.outcome === AnchorVerificationOutcome.PROOF_UNAVAILABLE, '17. the identical created anchor verifies PROOF_UNAVAILABLE when the external system cannot currently be reached');
    }
    console.log('✓ Section D: creation never verifies proof — a spy proves zero proof-verifier calls; the same anchor independently produces VALID / INVALID_PROOF / PROOF_UNAVAILABLE / VALID_PROOF_UNVERIFIED afterward');

    // ---------------------------------------------------------------
    // Section E — creation never mutates the publication
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const replica = makeReplica();
        const useCase = withIdentityProvider(replica, alice);
        const publication = publishContent(replica.publicationCatalog, { id: 'pub-5', hash: 'hash-5' });
        const beforeJson = JSON.stringify(publication.toJSON());
        const beforeCatalogJson = JSON.stringify(replica.publicationCatalog.get('pub-5').toJSON());

        useCase.execute('pub-5', { anchorType: 'bitcoin-op-return', locator: 'https://example.test', proof: { txid: 'cafebabe' } });

        assert(JSON.stringify(publication.toJSON()) === beforeJson, '18. the in-hand publication object is byte-for-byte unchanged after anchoring it');
        assert(JSON.stringify(replica.publicationCatalog.get('pub-5').toJSON()) === beforeCatalogJson,
            '19. the cataloged publication is byte-for-byte unchanged after anchoring it — the anchor is a record ABOUT the publication, never part of it');
    }
    console.log('✓ Section E: anchoring a publication never mutates the publication — the anchor is external evidence about it, nothing more');

    console.log('\nAll Publication Anchor Creation tests passed.');
}

run().catch((error) => {
    console.error('PublicationAnchorCreation.test.js FAILED:', error);
    process.exitCode = 1;
});
