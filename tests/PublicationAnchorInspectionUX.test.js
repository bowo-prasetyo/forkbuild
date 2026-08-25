import { PublicationAnchor } from '../core/PublicationAnchor.js';
import { DecentralizedPublication } from '../core/DecentralizedPublication.js';
import { ContentReference } from '../core/ContentReference.js';
import { LocalPublicationCatalog } from '../application/LocalPublicationCatalog.js';
import { LocalPublicationAnchorCatalog } from '../application/LocalPublicationAnchorCatalog.js';
import { AddPublicationAnchorUseCase } from '../application/AddPublicationAnchorUseCase.js';
import { CreatePublicationAnchorUseCase } from '../application/CreatePublicationAnchorUseCase.js';
import { CreatePublicationEvidenceCoordinatorUseCase } from '../application/CreatePublicationEvidenceCoordinatorUseCase.js';
import { ExternalAnchorVerifier } from '../application/ExternalAnchorVerifier.js';
import { createVerificationObservation } from '../application/PublicationAnchorVerificationObservation.js';
import { derivePublicationEvidenceConvergence } from '../application/PublicationEvidenceConvergence.js';
import { publicationAnchorDetailView, describeAnchorBinding } from '../application/PublicationAnchorDetailView.js';
import { ExternalAnchorEvidenceViewRegistry } from '../application/ExternalAnchorEvidenceViewRegistry.js';
import { BitcoinAnchorEvidenceView } from '../anchoring/BitcoinAnchorEvidenceView.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';

// 0.8.14 — External Evidence Inspection & Locator UX.
//
//   Section A: publicationAnchorDetailView() — argument handling, the
//              generic shape it derives (proof returned opaque, never
//              reinterpreted), and describeAnchorBinding()'s own wording
//              ("claims... was externally recorded with," never "is,"
//              "matches," or "belongs to").
//   Section B: ExternalAnchorEvidenceViewRegistry — the same
//              anchorType -> plugin lookup discipline application/
//              ExternalAnchorPublisherRegistry.js/application/
//              ExternalProofVerifierRegistry.js already established.
//   Section C: BitcoinAnchorEvidenceView#describe() — a well-formed
//              Bitcoin proof produces a followable mempool.space
//              destination; a missing/malformed one degrades honestly
//              to "not available" and a null externalLocator, never a
//              guess and never a throw.
//   Section D: FLAGSHIP — Alice creates and signs a PublicationAnchor;
//              Bob receives it through peer exchange (application/
//              AddPublicationAnchorUseCase.js, the same boundary
//              application/PublicationAnchorPeerExchange.js's own
//              ingestion uses) and discovers it. Bob opens "Inspect
//              Evidence" — proven NOT to call ExternalAnchorVerifier,
//              not to touch the network, not to modify the catalog, not
//              to create an observation, and not to mutate the anchor —
//              then, separately, clicks "Verify Evidence," which is
//              proven to be the only action that ever does any of those
//              things.
//
// See docs/Principles.md, "Inspection Is Observation; Verification Is
// An Explicit Operation (0.8.14)."

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

async function run() {
    // ---------------------------------------------------------------
    // Section A — publicationAnchorDetailView()
    // ---------------------------------------------------------------
    {
        expectThrows(() => publicationAnchorDetailView(), '1. requires an anchor');
        expectThrows(() => publicationAnchorDetailView({}), '2. rejects a plain object with no toJSON()');

        const proof = { txid: '9'.repeat(64), network: 'mainnet', vout: 0 };
        const anchor = new PublicationAnchor({
            publicationId: 'pub-detail',
            contentHash: 'deadbeef',
            anchorType: 'bitcoin-op-return',
            locator: `bitcoin:${proof.txid}`,
            proof,
            anchoredAt: new Date('2026-01-01T00:00:00.000Z'),
            anchorIdentity: { id: 'identity-alice', publicKey: 'pk' }
        });

        const detail = publicationAnchorDetailView(anchor);
        assert(detail.anchorId === anchor.id, '3. anchorId is the anchor\'s own id');
        assert(detail.anchorType === 'bitcoin-op-return', '4. anchorType is carried through unchanged');
        assert(detail.publicationId === 'pub-detail' && detail.contentHash === 'deadbeef', '5. publicationId/contentHash are the anchor\'s own claim');
        assert(detail.locator === anchor.locator, '6. locator is carried through unchanged');
        assert(detail.anchoredAt === '2026-01-01T00:00:00.000Z', '7. anchoredAt is the anchor\'s own reported timestamp, verbatim');
        assert(detail.anchoredAtLabel === 'Claimed external recording time', '8. anchoredAtLabel never says "Verified at"/"Confirmed at"/"Recorded at"');
        assert(detail.anchorIdentityId === 'identity-alice', '9. anchorIdentityId is derived from the anchor\'s own signer');

        // THE CENTRAL RULE: proof is returned OPAQUE — exactly what the
        // anchor carries, byte-identical, never reinterpreted into
        // txid/network/confirmations fields of its own.
        assert(JSON.stringify(detail.proof) === JSON.stringify(proof), '10. proof is returned exactly as the anchor carries it');
        assert(!('txid' in detail) && !('network' in detail) && !('confirmations' in detail),
            '11. no top-level txid/network/confirmations field — this file never reaches into an anchorType-specific proof');

        assert(detail.bindingDescription === describeAnchorBinding('pub-detail', 'deadbeef'), '12. bindingDescription matches the standalone helper');
        assert(detail.bindingDescription.includes('pub-detail') && detail.bindingDescription.includes('deadbeef'),
            '13. bindingDescription names both the publicationId and the contentHash');
        const bindingWords = detail.bindingDescription.toLowerCase();
        assert(bindingWords.includes('claims'), '14. bindingDescription is worded as a claim');
        for (const forbidden of ['is authentic', 'verified', 'confirmed', 'trusted', 'canonical', 'proof of authorship', 'ownership']) {
            assert(!bindingWords.includes(forbidden), `15. bindingDescription never says "${forbidden}"`);
        }

        // Calling twice is byte-identical — a pure, deterministic reshape.
        assert(JSON.stringify(publicationAnchorDetailView(anchor)) === JSON.stringify(detail), '16. calling publicationAnchorDetailView() twice is byte-identical');

        // No proof, no anchorIdentity — both degrade honestly, never guessed.
        const bareAnchor = new PublicationAnchor({ publicationId: 'p', contentHash: 'h', anchorType: 'other-ledger', locator: 'loc:1' });
        const bareDetail = publicationAnchorDetailView(bareAnchor);
        assert(bareDetail.proof === null, '17. no proof supplied -> proof stays null, never fabricated');
        assert(bareDetail.anchorIdentityId === null, '18. no anchorIdentity -> anchorIdentityId is null');
    }
    console.log('✓ Section A: publicationAnchorDetailView() derives the full generic shape, proof stays opaque, and bindingDescription is worded as a claim, never an established fact');

    // ---------------------------------------------------------------
    // Section B — ExternalAnchorEvidenceViewRegistry
    // ---------------------------------------------------------------
    {
        const registry = new ExternalAnchorEvidenceViewRegistry();
        expectThrows(() => registry.register(null), '19. register() rejects a null plugin');
        expectThrows(() => registry.register({ anchorType: '' }), '20. register() rejects an empty anchorType');
        expectThrows(() => registry.register({ anchorType: 'x' }), '21. register() rejects a plugin with no describe()');

        assert(registry.get('bitcoin-op-return') === null, '22. an unregistered anchorType returns null, never throws');
        assert(registry.has('bitcoin-op-return') === false, '23. has() agrees');
        assert(registry.anchorTypes.length === 0, '24. anchorTypes starts empty');

        const bitcoinView = new BitcoinAnchorEvidenceView();
        registry.register(bitcoinView);
        assert(registry.has('bitcoin-op-return') === true, '25. registering a plugin makes has() true for its OWN anchorType');
        assert(registry.get('bitcoin-op-return') === bitcoinView, '26. get() returns the exact registered instance');
        assert(registry.anchorTypes.length === 1 && registry.anchorTypes[0] === 'bitcoin-op-return', '27. anchorTypes lists exactly the registered type');

        // Re-registering the same anchorType replaces the first — "last
        // write wins," the identical posture every sibling registry
        // already takes.
        const secondBitcoinView = { anchorType: 'bitcoin-op-return', describe: () => ({ summary: 'second' }) };
        registry.register(secondBitcoinView);
        assert(registry.get('bitcoin-op-return') === secondBitcoinView, '28. re-registering an anchorType replaces the prior plugin');

        registry.unregister('bitcoin-op-return');
        assert(registry.get('bitcoin-op-return') === null, '29. unregister() removes the plugin');
    }
    console.log('✓ Section B: ExternalAnchorEvidenceViewRegistry — the same anchorType -> plugin lookup discipline every sibling registry already holds, an unregistered type always falls through to null');

    // ---------------------------------------------------------------
    // Section C — BitcoinAnchorEvidenceView#describe()
    // ---------------------------------------------------------------
    {
        const view = new BitcoinAnchorEvidenceView();
        assert(view.anchorType === 'bitcoin-op-return', '30. anchorType matches the sibling publisher/verifier adapters exactly');

        const txid = 'a'.repeat(64);
        const mainnetAnchor = { proof: { txid, network: 'mainnet' } };
        const mainnetDescribed = view.describe(mainnetAnchor);
        assert(mainnetDescribed.summary === 'Bitcoin', '31. summary is "Bitcoin"');
        const networkField = mainnetDescribed.fields.find((f) => f.label === 'Network');
        const txidField = mainnetDescribed.fields.find((f) => f.label === 'Transaction ID');
        assert(networkField.value === 'mainnet' && txidField.value === txid, '32. Network/Transaction ID fields carry the proof\'s own values');
        assert(mainnetDescribed.externalLocator.url === `https://mempool.space/tx/${txid}`, '33. mainnet locator points at mempool.space\'s own /tx/ path');
        assert(mainnetDescribed.externalLocator.label === 'View on block explorer', '34. locator label is honest and non-committal');

        const testnetDescribed = view.describe({ proof: { txid, network: 'testnet' } });
        assert(testnetDescribed.externalLocator.url === `https://mempool.space/testnet/tx/${txid}`, '35. a non-mainnet network is reflected in the explorer path');

        // Malformed/missing proof degrades honestly — never a guess, never a throw.
        const noProof = view.describe({ proof: null });
        assert(noProof.externalLocator === null, '36. no proof -> no externalLocator');
        assert(noProof.fields.find((f) => f.label === 'Transaction ID').value === 'not available', '37. no proof -> "not available," never a fabricated txid');
        assert(noProof.fields.find((f) => f.label === 'Network').value === 'unknown', '38. no proof -> Network reads "unknown"');

        const malformedTxid = view.describe({ proof: { txid: 'not-hex', network: 'mainnet' } });
        assert(malformedTxid.externalLocator === null, '39. a malformed txid never produces a locator');

        let threw = false;
        try { view.describe(undefined); } catch (e) { threw = true; }
        assert(!threw, '40. describe() never throws, even for a completely missing anchor');

        // describe() never mutates what it was handed.
        const realAnchor = new PublicationAnchor({ publicationId: 'p', contentHash: 'h', anchorType: 'bitcoin-op-return', locator: 'bitcoin:x', proof: { txid, network: 'mainnet' } });
        const beforeProof = JSON.stringify(realAnchor.proof);
        view.describe(realAnchor);
        assert(JSON.stringify(realAnchor.proof) === beforeProof, '41. describe() never mutates the anchor\'s own proof');
    }
    console.log('✓ Section C: BitcoinAnchorEvidenceView#describe() derives a followable mempool.space destination from a well-formed proof and degrades honestly, never guessing, for a missing or malformed one — it never verifies or mutates anything');

    // ---------------------------------------------------------------
    // Section D — FLAGSHIP: Alice creates, Bob receives, Bob inspects
    // (never touching verification), then Bob separately verifies.
    // ---------------------------------------------------------------
    {
        // Alice's own replica: creates and signs a real PublicationAnchor.
        const aliceStorage = new InMemoryStorageProvider();
        const alicePublicationCatalog = new LocalPublicationCatalog(aliceStorage);
        const aliceAnchorCatalog = new LocalPublicationAnchorCatalog(new InMemoryStorageProvider());
        const aliceIdentity = makeIdentity('Alice');
        const aliceVerifier = new LocalAuthorizationVerifier();

        const publication = new DecentralizedPublication({
            id: 'pub-flagship',
            contentKind: 'forkbuild.structure',
            contentReference: new ContentReference({ hash: 'f00dcafe' })
        });
        alicePublicationCatalog.add(publication);

        const txid = 'c'.repeat(64);
        const createUseCase = new CreatePublicationAnchorUseCase(alicePublicationCatalog, aliceIdentity, aliceVerifier, aliceAnchorCatalog);
        const aliceAnchor = createUseCase.execute('pub-flagship', {
            anchorType: 'bitcoin-op-return',
            locator: `bitcoin:${txid}`,
            proof: { txid, network: 'mainnet' }
        });

        // Bob's own, completely separate replica. The anchor "arrives
        // through peer exchange" the identical boundary application/
        // PublicationAnchorPeerExchange.js's own ingestion already uses —
        // application/AddPublicationAnchorUseCase.js, fed the plain wire
        // envelope Alice's anchor serializes to.
        const bobAnchorCatalog = new LocalPublicationAnchorCatalog(new InMemoryStorageProvider());
        const { anchor: bobAnchor } = new AddPublicationAnchorUseCase(bobAnchorCatalog).execute(aliceAnchor.toJSON());

        const bobAuthVerifier = new LocalAuthorizationVerifier();
        const bobExternalAnchorVerifier = new ExternalAnchorVerifier(bobAuthVerifier);
        let verifyCalls = 0;
        const verifierSpy = { verify: (...args) => { verifyCalls += 1; return bobExternalAnchorVerifier.verify(...args); } };
        const { coordinator: bobEvidenceCoordinator } = new CreatePublicationEvidenceCoordinatorUseCase().execute({
            anchorCatalog: bobAnchorCatalog, externalAnchorVerifier: verifierSpy
        });

        const bobEvidenceViewRegistry = new ExternalAnchorEvidenceViewRegistry();
        bobEvidenceViewRegistry.register(new BitcoinAnchorEvidenceView());

        // Bob discovers it — a synchronous local catalog read, unchanged
        // since 0.8.3.
        const discovered = bobEvidenceCoordinator.discover('pub-flagship');
        assert(discovered.length === 1 && discovered[0].id === aliceAnchor.id, '42. Bob discovers the exact anchor Alice created');
        const anchor = discovered[0];

        // Snapshot everything the milestone's own invariant names, BEFORE
        // Bob opens "Inspect Evidence."
        const beforeAnchorJson = JSON.stringify(anchor.toJSON());
        const beforeCatalogJson = JSON.stringify(bobAnchorCatalog.list().map((a) => a.toJSON()));
        const verificationHistory = {};
        const beforeHistoryJson = JSON.stringify(verificationHistory);
        const convergenceBefore = derivePublicationEvidenceConvergence({
            publicationId: 'pub-flagship', expectedContentHash: 'f00dcafe', anchors: discovered
        });
        const beforeConvergenceJson = JSON.stringify(convergenceBefore);

        // --- Bob opens "Inspect Evidence." ---
        const detail = publicationAnchorDetailView(anchor);
        const typeSpecific = bobEvidenceViewRegistry.has(anchor.anchorType)
            ? bobEvidenceViewRegistry.get(anchor.anchorType).describe(anchor)
            : null;

        assert(verifyCalls === 0, '43. INVARIANT: opening "Inspect Evidence" never calls ExternalAnchorVerifier');
        assert(JSON.stringify(anchor.toJSON()) === beforeAnchorJson, '44. INVARIANT: the anchor itself is byte-identical before/after inspection');
        assert(JSON.stringify(bobAnchorCatalog.list().map((a) => a.toJSON())) === beforeCatalogJson, '45. INVARIANT: the catalog is unchanged by inspection');
        assert(JSON.stringify(verificationHistory) === beforeHistoryJson, '46. INVARIANT: no verification observation is ever created by inspection');
        const convergenceAfterInspect = derivePublicationEvidenceConvergence({
            publicationId: 'pub-flagship', expectedContentHash: 'f00dcafe', anchors: bobEvidenceCoordinator.discover('pub-flagship')
        });
        assert(JSON.stringify(convergenceAfterInspect) === beforeConvergenceJson, '47. INVARIANT: the derived evidence convergence is unchanged by inspection');

        // The inspection result itself is correct and complete.
        assert(detail.anchorId === aliceAnchor.id && detail.publicationId === 'pub-flagship' && detail.contentHash === 'f00dcafe',
            '48. the detail view names the exact anchor Bob is looking at');
        assert(detail.locator === `bitcoin:${txid}`, '49. locator is carried through unchanged');
        assert(JSON.stringify(detail.proof) === JSON.stringify({ txid, network: 'mainnet' }), '50. proof is exactly what Alice\'s anchor carries');
        assert(detail.anchorIdentityId === aliceIdentity.getSigningIdentity().id, '51. anchorIdentityId names Alice\'s own signing identity');
        assert(typeSpecific.summary === 'Bitcoin' && typeSpecific.externalLocator.url === `https://mempool.space/tx/${txid}`,
            '52. the Bitcoin-specific adapter derives a followable external destination from the SAME anchor');

        console.log('✓ Section D (inspect): Bob opens "Inspect Evidence" on the anchor Alice created and Bob received through peer exchange — the anchor, the catalog, the verification history, and the derived convergence are all byte-identical before and after, and ExternalAnchorVerifier is never once consulted');

        // --- Bob separately clicks "Verify Evidence." Only NOW does the
        // verifier get consulted, and only now does an observation exist. ---
        const result = await bobEvidenceCoordinator.verify(anchor, { expectedContentHash: 'f00dcafe', expectedPublicationId: 'pub-flagship' });
        assert(verifyCalls === 1, '53. an explicit "Verify Evidence" click is the only thing that ever consults the verifier');
        verificationHistory[anchor.id] = [createVerificationObservation({ anchorId: anchor.id, outcome: result.outcome, reason: result.reason })];
        assert(verificationHistory[anchor.id].length === 1, '54. verifying explicitly is what creates an observation — inspecting never does');
        assert(JSON.stringify(anchor.toJSON()) === beforeAnchorJson, '55. even verifying never mutates the anchor itself — the same immutable envelope throughout');
    }
    console.log('✓ Section D (verify): only the SEPARATE, explicit "Verify Evidence" action ever consults ExternalAnchorVerifier or produces a verification observation');

    console.log('\nAll Publication Anchor Inspection UX tests passed.');
}

run().catch((error) => {
    console.error('PublicationAnchorInspectionUX.test.js FAILED:', error);
    process.exitCode = 1;
});
