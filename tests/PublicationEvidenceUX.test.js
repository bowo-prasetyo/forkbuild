import { PublicationAnchor } from '../core/PublicationAnchor.js';
import { LocalPublicationAnchorCatalog } from '../application/LocalPublicationAnchorCatalog.js';
import { AddPublicationAnchorUseCase } from '../application/AddPublicationAnchorUseCase.js';
import { ExternalAnchorVerifier } from '../application/ExternalAnchorVerifier.js';
import { AnchorVerificationOutcome } from '../application/AnchorVerificationOutcome.js';
import { PublicationEvidenceCoordinator } from '../application/PublicationEvidenceCoordinator.js';
import { CreatePublicationEvidenceCoordinatorUseCase } from '../application/CreatePublicationEvidenceCoordinatorUseCase.js';
import {
    publicationEvidenceView, describeAnchorEvidence, describeVerificationOutcome, describeKnownEvidenceCount
} from '../application/PublicationEvidenceView.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';

// 0.8.3 — Publication Center: External Evidence UX.
//
//   Section A: FLAGSHIP — Alice signs a PublicationAnchor; Bob catalogs
//              it exactly as 0.8.2 already proved; Bob's Publication
//              Center DISCOVERS it (application/
//              PublicationEvidenceCoordinator.js#discover(), no
//              network); Bob explicitly VERIFIES it (#verify(), one
//              anchor, one click) and the derived view reports
//              "Independently verified."
//   Section B: discovery — no anchors, one anchor, several anchors, and
//              several independent anchors for the SAME publication all
//              coexist in the discovered/derived list, in the catalog's
//              own order, never ranked or narrowed to "the" anchor.
//   Section C: every application/AnchorVerificationOutcome.js value
//              reachable through the coordinator gets its own distinct
//              label — never collapsed into a shared "unverified."
//   Section D: separation — discover() never consults a verifier,
//              opening/deriving a view never verifies anything, and
//              verify() only ever affects the ONE anchor it was called
//              for, leaving every other known anchor exactly as
//              "not yet verified" as before.
//
// See docs/Principles.md, "Known Evidence Is Not Verified Evidence, And
// Verified Evidence Is Not Authority (0.8.3)."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch (e) { threw = true; }
    assert(threw, message);
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
    return anchor.withSignature(identityProvider.signCanonical(anchor.getSigningDescriptor()));
}

function makeCoordinator({ verifierSpy = null } = {}) {
    const catalog = new LocalPublicationAnchorCatalog(new InMemoryStorageProvider());
    const addAnchor = new AddPublicationAnchorUseCase(catalog);
    const realVerifier = new ExternalAnchorVerifier(new LocalAuthorizationVerifier());
    const verifier = verifierSpy
        ? { verify: (...args) => { verifierSpy.calls += 1; return realVerifier.verify(...args); } }
        : realVerifier;
    const { coordinator } = new CreatePublicationEvidenceCoordinatorUseCase().execute({
        anchorCatalog: catalog, externalAnchorVerifier: verifier
    });
    return { catalog, addAnchor, coordinator };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP: Alice signs, Bob catalogs, Bob discovers,
    // Bob explicitly verifies
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const anchor = signAnchor(alice, {
            publicationId: 'pub-flagship', contentHash: 'hash-flagship',
            anchorType: 'bitcoin-op-return', locator: 'bitcoin://tx/flagship',
            proof: { txid: 'a'.repeat(64) }
        });

        const { addAnchor, coordinator } = makeCoordinator();
        addAnchor.execute(anchor.toJSON());

        // Discovery — Bob's Publication Center learns about the anchor,
        // purely locally.
        const discovered = coordinator.discover('pub-flagship');
        assert(discovered.length === 1 && discovered[0].id === anchor.id, '1. Bob discovers the cataloged anchor');

        let preVerifyView = publicationEvidenceView(discovered);
        assert(preVerifyView.anchors[0].verified === false, '2. before verifying, the derived view reports the anchor as not verified');
        assert(preVerifyView.anchors[0].verificationLabel === 'Not yet verified', '3. and labels it plainly, never a false positive');

        // Verification — Bob explicitly selects this one anchor and
        // asks the coordinator to verify it, supplying a matching
        // proofVerifier that confirms the proof.
        const bitcoinProofVerifier = { anchorType: 'bitcoin-op-return', verify: () => ({ valid: true }) };
        const result = await coordinator.verify(discovered[0], {
            expectedContentHash: 'hash-flagship', expectedPublicationId: 'pub-flagship',
            proofVerifierRegistry: { get: (type) => (type === 'bitcoin-op-return' ? bitcoinProofVerifier : null) }
        });
        assert(result.outcome === AnchorVerificationOutcome.VALID, '4. the anchor independently verifies as VALID');

        const view = publicationEvidenceView(discovered, { [anchor.id]: { outcome: result.outcome, reason: result.reason } });
        assert(view.anchors[0].verified === true, '5. the derived view now reports the anchor as verified');
        assert(view.anchors[0].verificationLabel === 'Independently verified', '6. and labels it with the precise, non-"trust" wording this milestone requires');
        assert(view.anchors[0].publicationId === 'pub-flagship' && view.anchors[0].contentHash === 'hash-flagship',
            '7. the view exposes the anchor\'s own claimed publicationId/contentHash binding, never a generic badge alone');
    }
    console.log('✓ Section A: FLAGSHIP — Alice signs, Bob catalogs, discovers, and explicitly verifies one anchor');

    // ---------------------------------------------------------------
    // Section B — discovery
    // ---------------------------------------------------------------
    {
        const { catalog, addAnchor, coordinator } = makeCoordinator();
        const registry = makeIdentity('Registry');
        const other = makeIdentity('OtherRegistry');

        expectThrows(() => new PublicationEvidenceCoordinator(null, {}), '1. constructor requires an anchor catalog');
        expectThrows(() => new PublicationEvidenceCoordinator(catalog, null), '2. constructor requires an ExternalAnchorVerifier');
        expectThrows(() => coordinator.discover(), '3. discover() requires a publicationId');

        assert(coordinator.discover('pub-empty').length === 0, '4. no anchors known -> empty discovery, never an error');
        const emptyView = publicationEvidenceView(coordinator.discover('pub-empty'));
        assert(emptyView.count === 0, '5. the derived view reports zero known anchors');
        assert(describeKnownEvidenceCount(emptyView) === 'No external evidence known', '6. and describes that plainly');

        const single = signAnchor(registry, { publicationId: 'pub-one', contentHash: 'hash-one', anchorType: 'local-test', locator: 'local://a' });
        addAnchor.execute(single.toJSON());
        const oneView = publicationEvidenceView(coordinator.discover('pub-one'));
        assert(oneView.count === 1, '7. one cataloged anchor -> one discovered/derived entry');
        assert(describeKnownEvidenceCount(oneView) === '1 anchor known', '8. singular count wording');

        // Several independent anchors for the SAME publication — two
        // different anchoring identities, two different anchorTypes —
        // all coexist, none preferred, in the catalog's own order.
        const anchorA = signAnchor(registry, { publicationId: 'pub-multi', contentHash: 'hash-multi', anchorType: 'bitcoin-op-return', locator: 'bitcoin://tx/a' });
        const anchorB = signAnchor(other, { publicationId: 'pub-multi', contentHash: 'hash-multi', anchorType: 'other-ledger', locator: 'other://chain/b' });
        addAnchor.execute(anchorA.toJSON());
        addAnchor.execute(anchorB.toJSON());
        const multiDiscovered = coordinator.discover('pub-multi');
        assert(multiDiscovered.length === 2, '9. multiple independent anchors for one publication all coexist');
        const multiView = publicationEvidenceView(multiDiscovered);
        assert(multiView.count === 2 && describeKnownEvidenceCount(multiView) === '2 anchors known', '10. plural count wording');
        assert(multiView.anchors.every((a) => a.verified === false), '11. none is preferred, ranked, or pre-marked verified — all start identically');
        assert(multiDiscovered.map((a) => a.id).join(',') === catalog.findByPublicationId('pub-multi').map((a) => a.id).join(','),
            '12. discover() returns exactly the catalog\'s own order — this file never reorders or ranks');

        // An unrelated publication's own anchor is unaffected.
        assert(coordinator.discover('pub-one').length === 1, '13. discovering pub-multi never leaks into an unrelated publicationId');
    }
    console.log('✓ Section B: discovery — empty/one/many, several independent anchors coexist, no ranking, catalog order preserved');

    // ---------------------------------------------------------------
    // Section C — every outcome gets its own honest label
    // ---------------------------------------------------------------
    {
        // Pure labeling — every value application/AnchorVerificationOutcome
        // .js defines maps to its own distinct, non-"trust" wording, and
        // no two distinct outcomes ever collapse onto the same label.
        const labels = Object.values(AnchorVerificationOutcome).map(describeVerificationOutcome);
        assert(new Set(labels).size === labels.length, '1. every AnchorVerificationOutcome value gets its own distinct label');
        assert(describeVerificationOutcome(AnchorVerificationOutcome.VALID) === 'Independently verified', '2. VALID');
        assert(describeVerificationOutcome(AnchorVerificationOutcome.VALID_PROOF_UNVERIFIED) === 'Proof not independently verified', '3. VALID_PROOF_UNVERIFIED');
        assert(describeVerificationOutcome(AnchorVerificationOutcome.PROOF_UNAVAILABLE) === 'Verification unavailable', '4. PROOF_UNAVAILABLE');
        assert(describeVerificationOutcome(AnchorVerificationOutcome.INVALID_ENVELOPE) === 'Invalid evidence', '5. INVALID_ENVELOPE');
        assert(describeVerificationOutcome(AnchorVerificationOutcome.INVALID_SIGNATURE) === 'Invalid signature', '6. INVALID_SIGNATURE');
        assert(describeVerificationOutcome(AnchorVerificationOutcome.CONTENT_MISMATCH) === 'Content mismatch', '7. CONTENT_MISMATCH');
        assert(describeVerificationOutcome(AnchorVerificationOutcome.INVALID_PROOF) === 'Invalid external proof', '8. INVALID_PROOF');
        assert(describeVerificationOutcome(AnchorVerificationOutcome.PROOF_UNAVAILABLE) !== describeVerificationOutcome(AnchorVerificationOutcome.INVALID_PROOF),
            '9. "couldn\'t check" and "checked and rejected" are never the same label');

        // Reachable, end-to-end, through the coordinator: VALID,
        // VALID_PROOF_UNVERIFIED, PROOF_UNAVAILABLE, INVALID_SIGNATURE,
        // CONTENT_MISMATCH, INVALID_PROOF.
        const { addAnchor, coordinator } = makeCoordinator();
        const registry = makeIdentity('Registry');

        const goodAnchor = signAnchor(registry, {
            publicationId: 'pub-c', contentHash: 'hash-c', anchorType: 'bitcoin-op-return', locator: 'bitcoin://tx/c', proof: { txid: 'c'.repeat(64) }
        });
        addAnchor.execute(goodAnchor.toJSON());
        const [cataloged] = coordinator.discover('pub-c');

        const noRegistry = await coordinator.verify(cataloged, { expectedContentHash: 'hash-c', expectedPublicationId: 'pub-c' });
        assert(noRegistry.outcome === AnchorVerificationOutcome.VALID_PROOF_UNVERIFIED, '10. no proofVerifier plugged in -> VALID_PROOF_UNVERIFIED');

        const unavailablePlugin = { anchorType: 'bitcoin-op-return', verify: () => { throw new Error('explorer unreachable'); } };
        const unavailable = await coordinator.verify(cataloged, {
            expectedContentHash: 'hash-c', expectedPublicationId: 'pub-c',
            proofVerifierRegistry: { get: () => unavailablePlugin }
        });
        assert(unavailable.outcome === AnchorVerificationOutcome.PROOF_UNAVAILABLE, '11. an unreachable external system -> PROOF_UNAVAILABLE, never a rejection');

        const rejectingPlugin = { anchorType: 'bitcoin-op-return', verify: () => ({ valid: false, reason: 'hash not found in any output' }) };
        const invalidProof = await coordinator.verify(cataloged, {
            expectedContentHash: 'hash-c', expectedPublicationId: 'pub-c',
            proofVerifierRegistry: { get: () => rejectingPlugin }
        });
        assert(invalidProof.outcome === AnchorVerificationOutcome.INVALID_PROOF, '12. a definite rejection from the external system -> INVALID_PROOF');

        const mismatch = await coordinator.verify(cataloged, { expectedContentHash: 'some-other-hash', expectedPublicationId: 'pub-c' });
        assert(mismatch.outcome === AnchorVerificationOutcome.CONTENT_MISMATCH, '13. a caller-supplied expectedContentHash that disagrees -> CONTENT_MISMATCH');

        const unsigned = new PublicationAnchor({
            publicationId: 'pub-forged', contentHash: 'hash-forged', anchorType: 'local-test', locator: 'local://forged',
            anchorIdentity: registry.getSigningIdentity().toJSON(),
            signature: { algorithm: 'none', signer: 'nobody', signature: 'nope', signedHash: 'nope', domain: 'forkbuild.test' }
        });
        addAnchor.execute(unsigned.toJSON());
        const [forged] = coordinator.discover('pub-forged');
        const forgedResult = await coordinator.verify(forged);
        assert(forgedResult.outcome === AnchorVerificationOutcome.INVALID_SIGNATURE, '14. a forged/unsigned anchor -> INVALID_SIGNATURE');
    }
    console.log('✓ Section C: every reachable outcome — VALID/VALID_PROOF_UNVERIFIED/PROOF_UNAVAILABLE/INVALID_SIGNATURE/CONTENT_MISMATCH/INVALID_PROOF — keeps its own distinct label');

    // ---------------------------------------------------------------
    // Section D — separation: discovery never verifies, verify() never
    // spills onto other anchors
    // ---------------------------------------------------------------
    {
        const verifierSpy = { calls: 0 };
        const { addAnchor, coordinator } = makeCoordinator({ verifierSpy });
        const registry = makeIdentity('Registry');

        const anchorA = signAnchor(registry, { publicationId: 'pub-d', contentHash: 'hash-d-a', anchorType: 'local-test', locator: 'local://d-a' });
        const anchorB = signAnchor(registry, { publicationId: 'pub-d', contentHash: 'hash-d-b', anchorType: 'local-test', locator: 'local://d-b' });
        addAnchor.execute(anchorA.toJSON());
        addAnchor.execute(anchorB.toJSON());

        // Cataloging + repeated discovery never touches the verifier —
        // the identical restraint application/AddPublicationAnchorUseCase
        // .js's own 0.8.2 test already proved for cataloging alone,
        // extended here through the coordinator's own discover().
        coordinator.discover('pub-d');
        coordinator.discover('pub-d');
        const discovered = coordinator.discover('pub-d');
        assert(verifierSpy.calls === 0, '1. discover() — called repeatedly — never consults the verifier');

        // Deriving a display view from what discover() returned is
        // equally side-effect-free.
        publicationEvidenceView(discovered);
        publicationEvidenceView(discovered, {});
        assert(verifierSpy.calls === 0, '2. deriving a view from discovered anchors never consults the verifier either');

        // Verifying ONE anchor never affects the other.
        const targetAnchor = discovered.find((a) => a.id === anchorA.id);
        const result = await coordinator.verify(targetAnchor, { expectedContentHash: 'hash-d-a', expectedPublicationId: 'pub-d' });
        assert(verifierSpy.calls === 1, '3. verify() consults the verifier exactly once, for exactly the one anchor supplied');

        const partialView = publicationEvidenceView(discovered, { [anchorA.id]: { outcome: result.outcome, reason: result.reason } });
        const viewA = partialView.anchors.find((a) => a.anchorId === anchorA.id);
        const viewB = partialView.anchors.find((a) => a.anchorId === anchorB.id);
        assert(viewA.verified === true, '4. the verified anchor reports as verified');
        assert(viewB.verified === false && viewB.verificationLabel === 'Not yet verified',
            '5. the OTHER known anchor for the same publication is completely unaffected — still "not yet verified"');

        // Verification results are never written back onto the catalog
        // or the anchor's own record — they exist only in whatever map
        // the caller passes to publicationEvidenceView(), exactly as
        // ephemeral session state.
        const refetched = coordinator.discover('pub-d').find((a) => a.id === anchorA.id);
        assert(refetched.toJSON().verified === undefined && refetched.toJSON().verificationOutcome === undefined,
            '6. re-discovering the anchor shows no verification field was ever persisted onto it');

        // A checking-in-flight state is reported as its own distinct
        // state, never folded into either "verified" or "not yet
        // verified."
        const inFlightView = describeAnchorEvidence(targetAnchor, { checking: true });
        assert(inFlightView.checking === true && inFlightView.verified === false && inFlightView.verificationLabel === 'Checking…',
            '7. an in-flight verification is its own distinct, honestly labeled state');

        // The composition root wires already-constructed collaborators,
        // never fresh ones — proven by cataloging AFTER construction and
        // still finding it through the SAME coordinator.
        const catalog = new LocalPublicationAnchorCatalog(new InMemoryStorageProvider());
        const wiringAddAnchor = new AddPublicationAnchorUseCase(catalog);
        const { coordinator: wiredCoordinator } = new CreatePublicationEvidenceCoordinatorUseCase().execute({
            anchorCatalog: catalog, externalAnchorVerifier: new ExternalAnchorVerifier(new LocalAuthorizationVerifier())
        });
        const lateAnchor = signAnchor(registry, { publicationId: 'pub-wired', contentHash: 'hash-wired', anchorType: 'local-test', locator: 'local://wired' });
        wiringAddAnchor.execute(lateAnchor.toJSON());
        assert(wiredCoordinator.discover('pub-wired').length === 1,
            '8. CreatePublicationEvidenceCoordinatorUseCase wires the SAME catalog instance passed in, never a disconnected copy');
    }
    console.log('✓ Section D: separation — discovery never verifies, verify() never spills onto other anchors, no result is ever persisted');

    console.log('\nAll Publication Center: External Evidence UX tests passed.');
}

run().catch((error) => {
    console.error('PublicationEvidenceUX.test.js FAILED:', error);
    process.exitCode = 1;
});
