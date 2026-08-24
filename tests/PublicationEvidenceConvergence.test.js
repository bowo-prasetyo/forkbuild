import { PublicationAnchor } from '../core/PublicationAnchor.js';
import { AnchorVerificationOutcome } from '../application/AnchorVerificationOutcome.js';
import { ContentBindingRelationship } from '../application/ContentBindingRelationship.js';
import { derivePublicationEvidenceConvergence } from '../application/PublicationEvidenceConvergence.js';
import { LocalPublicationAnchorCatalog } from '../application/LocalPublicationAnchorCatalog.js';
import { PublicationAnchorExchange } from '../application/PublicationAnchorExchange.js';
import { PublicationAnchorPeerExchange } from '../application/PublicationAnchorPeerExchange.js';
import { PublicationAnchorDiscoveryCoordinator } from '../application/PublicationAnchorDiscoveryCoordinator.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { ConnectToPeerUseCase } from '../application/ConnectToPeerUseCase.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';

// 0.8.6 — Multi-Evidence Convergence & Evidence Relationship Derivation.
//
//   Section A: derivePublicationEvidenceConvergence() argument handling —
//              requires a publicationId, tolerates no anchors, ignores
//              anchors naming a DIFFERENT publicationId, dedups by anchor
//              id, and is order-independent (same set -> byte-identical
//              result regardless of input order)
//   Section B: the five scenarios docs/Roadmap.md's own 0.8.6 entry names
//              by letter — complete agreement, conflicting content
//              binding, verification disagreement, multiple anchor
//              types, and duplicate anchor knowledge
//   Section C: FLAGSHIP — extends the 0.8.5 three-replica convergence
//              flagship with a FOURTH anchor whose contentHash
//              contradicts the other three. Alice, Bob, and Carol
//              synchronize over real live authenticated connections
//              (application/PublicationAnchorDiscoveryCoordinator.js,
//              unchanged) and converge on the identical evidence SET —
//              network convergence — while each replica's own derived
//              view reports the content-binding conflict WITHOUT any of
//              them ever deciding which anchor is correct — evidence
//              non-adjudication, demonstrated simultaneously with
//              convergence itself. A second act then shows Alice and Bob
//              independently verifying the identical anchor and reaching
//              two different, entirely local, entirely honest
//              observations that never influence each other's derived
//              view.
//
// See docs/Principles.md, "Evidence Relationships Are Derived, Never
// Adjudicated (0.8.6)," and "Verification Observations Stay Local Even
// Under Comparison (0.8.6)."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch (e) { threw = true; }
    assert(threw, message);
}

function wait(ms = 20) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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

function makeAnchorExchange() {
    const catalog = new LocalPublicationAnchorCatalog(new InMemoryStorageProvider());
    const verifier = new LocalAuthorizationVerifier();
    const exchange = new PublicationAnchorExchange(catalog, verifier);
    return { catalog, verifier, exchange };
}

function fakeAnchor(id, publicationId, contentHash, anchorType) {
    return { id, publicationId, contentHash, anchorType };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — argument handling
    // ---------------------------------------------------------------
    {
        expectThrows(() => derivePublicationEvidenceConvergence({}), '1. requires a publicationId');
        expectThrows(() => derivePublicationEvidenceConvergence({ publicationId: '  ' }), '2. rejects a blank publicationId');

        const empty = derivePublicationEvidenceConvergence({ publicationId: 'pub-empty' });
        assert(empty.anchorCount === 0, '3. no anchors supplied -> anchorCount is 0');
        assert(empty.anchorTypes.length === 0 && empty.anchors.length === 0, '4. no anchors supplied -> empty arrays, never an error');
        assert(empty.contentBindingConflict === false, '5. no anchors -> no conflict');
        assert(empty.expectedContentHash === null, '6. expectedContentHash defaults to null, echoed back unchanged');

        const mixed = derivePublicationEvidenceConvergence({
            publicationId: 'pub-target',
            anchors: [
                fakeAnchor('a1', 'pub-target', 'hash-x', 'bitcoin-op-return'),
                fakeAnchor('a2', 'pub-other', 'hash-y', 'bitcoin-op-return')
            ]
        });
        assert(mixed.anchorCount === 1 && mixed.anchors[0].anchorId === 'a1',
            '7. an anchor naming a DIFFERENT publicationId is silently excluded, never counted');

        const duplicated = derivePublicationEvidenceConvergence({
            publicationId: 'pub-dup',
            anchors: [
                fakeAnchor('a1', 'pub-dup', 'hash-x', 'bitcoin-op-return'),
                fakeAnchor('a1', 'pub-dup', 'hash-x', 'bitcoin-op-return')
            ]
        });
        assert(duplicated.anchorCount === 1, '8. the same anchor id appearing twice in the input is counted once — one anchor identity, not two pieces of evidence');

        const forward = derivePublicationEvidenceConvergence({
            publicationId: 'pub-order',
            anchors: [fakeAnchor('z', 'pub-order', 'h', 't'), fakeAnchor('a', 'pub-order', 'h', 't')]
        });
        const reversed = derivePublicationEvidenceConvergence({
            publicationId: 'pub-order',
            anchors: [fakeAnchor('a', 'pub-order', 'h', 't'), fakeAnchor('z', 'pub-order', 'h', 't')]
        });
        assert(JSON.stringify(forward) === JSON.stringify(reversed),
            '9. the identical underlying set produces a byte-identical result regardless of input order');
        assert(forward.anchors[0].anchorId === 'a' && forward.anchors[1].anchorId === 'z',
            '10. the anchors array is sorted by anchorId, never by input/arrival order');
    }
    console.log('✓ Section A: derivePublicationEvidenceConvergence() argument handling — publicationId required, empty input tolerated, cross-publication anchors excluded, duplicates deduped, order-independent');

    // ---------------------------------------------------------------
    // Section B — the five named scenarios
    // ---------------------------------------------------------------
    {
        // Scenario A — complete agreement: three anchors, all bound to
        // the same publicationId/contentHash. No conflict.
        const agreement = derivePublicationEvidenceConvergence({
            publicationId: 'pub-agree',
            expectedContentHash: 'hash-h',
            anchors: [
                fakeAnchor('a', 'pub-agree', 'hash-h', 'bitcoin-op-return'),
                fakeAnchor('b', 'pub-agree', 'hash-h', 'other-ledger'),
                fakeAnchor('c', 'pub-agree', 'hash-h', 'transparency-log')
            ]
        });
        assert(agreement.anchorCount === 3, '1. Scenario A: three independent anchors counted');
        assert(agreement.contentBindingConflict === false, '2. Scenario A: no binding conflict when every anchor agrees');
        assert(agreement.contentHashGroups.length === 1 && agreement.contentHashGroups[0].anchorIds.length === 3,
            '3. Scenario A: a single content-hash group containing all three anchors');
        assert(agreement.matchingAnchorIds.length === 3 && agreement.divergentAnchorIds.length === 0,
            '4. Scenario A: all three match the expected content hash');

        // Scenario B — conflicting content binding: two anchors, two
        // different contentHash values. Conflict IS detected. Neither
        // anchor is ever declared correct or incorrect.
        const conflict = derivePublicationEvidenceConvergence({
            publicationId: 'pub-conflict',
            anchors: [
                fakeAnchor('a', 'pub-conflict', 'hash-h1', 'bitcoin-op-return'),
                fakeAnchor('b', 'pub-conflict', 'hash-h2', 'other-ledger')
            ]
        });
        assert(conflict.contentBindingConflict === true, '5. Scenario B: a conflict IS detected between two disagreeing anchors');
        assert(conflict.contentHashGroups.length === 2, '6. Scenario B: two distinct content-hash groups reported');
        assert(!('correct' in conflict) && !('winner' in conflict) && !('invalid' in conflict),
            '7. Scenario B: the result contains no field naming either anchor correct or incorrect');
        assert(conflict.anchors.every((entry) => entry.contentBinding === ContentBindingRelationship.NOT_COMPARED),
            '8. Scenario B: with no expectedContentHash supplied, neither anchor is compared against a caller-known truth — only against each other');

        // Scenario C — verification disagreement: the SAME anchor,
        // observed with two different local verification outcomes across
        // two SEPARATE calls (never one call, since verification is
        // always one replica's own local state — see this file's own
        // header on why derivePublicationEvidenceConvergence() never
        // takes more than one replica's observations at a time).
        const sharedAnchor = [fakeAnchor('shared-a', 'pub-verify', 'hash-h', 'bitcoin-op-return')];
        const aliceView = derivePublicationEvidenceConvergence({
            publicationId: 'pub-verify',
            anchors: sharedAnchor,
            verificationByAnchorId: { 'shared-a': AnchorVerificationOutcome.VALID }
        });
        const bobView = derivePublicationEvidenceConvergence({
            publicationId: 'pub-verify',
            anchors: sharedAnchor,
            verificationByAnchorId: { 'shared-a': AnchorVerificationOutcome.PROOF_UNAVAILABLE }
        });
        assert(aliceView.anchors[0].verification === AnchorVerificationOutcome.VALID, '9. Scenario C: Alice\'s own local view reports her own observation');
        assert(bobView.anchors[0].verification === AnchorVerificationOutcome.PROOF_UNAVAILABLE, '10. Scenario C: Bob\'s own local view reports his own, different observation');
        assert(aliceView.anchors[0].anchorId === bobView.anchors[0].anchorId && aliceView.anchors[0].contentHash === bobView.anchors[0].contentHash,
            '11. Scenario C: same anchor identity, same binding — only the LOCAL verification observation differs, and nothing declares a global winner');

        // Scenario D — multiple anchor types: three independent evidence
        // records, no ranking implied anywhere by their order or type.
        const multiType = derivePublicationEvidenceConvergence({
            publicationId: 'pub-types',
            expectedContentHash: 'hash-h',
            anchors: [
                fakeAnchor('a', 'pub-types', 'hash-h', 'bitcoin-op-return'),
                fakeAnchor('b', 'pub-types', 'hash-h', 'transparency-log'),
                fakeAnchor('c', 'pub-types', 'hash-h', 'other-ledger')
            ]
        });
        assert(multiType.anchorTypes.length === 3, '12. Scenario D: three distinct anchor types reported');
        assert(JSON.stringify(multiType.anchorTypes) === JSON.stringify([...multiType.anchorTypes].sort()),
            '13. Scenario D: anchorTypes is a plain sorted list, never an ordered ranking');

        // Scenario E — duplicate anchor knowledge: the identical anchor
        // known via two different routes collapses to ONE entry, not two.
        const anchorInstance = fakeAnchor('dup-1', 'pub-dup-evidence', 'hash-h', 'bitcoin-op-return');
        const duplicateKnowledge = derivePublicationEvidenceConvergence({
            publicationId: 'pub-dup-evidence',
            // Simulates Alice's catalog and Bob's catalog both handing
            // back their own copy of the SAME anchor id to a caller that
            // merged both lists.
            anchors: [anchorInstance, { ...anchorInstance }]
        });
        assert(duplicateKnowledge.anchorCount === 1, '14. Scenario E: one anchor identity known through two routes is one anchor, never two pieces of evidence');
    }
    console.log('✓ Section B: the five named scenarios — complete agreement, conflicting content binding (detected, never adjudicated), verification disagreement (stays local, per replica), multiple anchor types (no ranking), duplicate anchor knowledge (collapses to one)');

    // ---------------------------------------------------------------
    // Section C — FLAGSHIP: network convergence AND evidence
    // non-adjudication, proven simultaneously. Extends 0.8.5's own
    // three-replica flagship with a fourth, contradicting anchor.
    // ---------------------------------------------------------------
    {
        const network = new LocalPeerNetwork();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const carol = makeIdentity('Carol');

        const aliceTransport = new LocalPeerConnectionProvider('alice-evidence', network);
        const bobTransport = new LocalPeerConnectionProvider('bob-evidence', network);
        const carolTransport = new LocalPeerConnectionProvider('carol-evidence', network);

        const aliceConnect = new ConnectToPeerUseCase({ peerConnectionProvider: aliceTransport, identityProvider: alice });
        const stopAliceListening = aliceConnect.listen();
        const bobConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bobTransport, identityProvider: bob });
        const stopBobListening = bobConnect.listen();
        const bobToAlice = bobConnect.connect({ candidateEndpoint: 'alice-evidence' });
        const carolConnect = new ConnectToPeerUseCase({ peerConnectionProvider: carolTransport, identityProvider: carol });
        const carolToAlice = carolConnect.connect({ candidateEndpoint: 'alice-evidence' });
        const carolToBob = carolConnect.connect({ candidateEndpoint: 'bob-evidence' });

        await wait(20);
        assert(bobToAlice.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '1. setup: Bob<->Alice authenticates');
        assert(carolToAlice.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '2. setup: Carol<->Alice authenticates');
        assert(carolToBob.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '3. setup: Carol<->Bob authenticates');

        const bobIdentityId = bob.getSigningIdentity().id;
        const carolIdentityId = carol.getSigningIdentity().id;
        const aliceToBob = aliceConnect.registry.list().find((c) => c.remoteIdentity && c.remoteIdentity.identityId === bobIdentityId);
        const aliceToCarol = aliceConnect.registry.list().find((c) => c.remoteIdentity && c.remoteIdentity.identityId === carolIdentityId);
        const bobToCarol = bobConnect.registry.list().find((c) => c.remoteIdentity && c.remoteIdentity.identityId === carolIdentityId);

        const { catalog: aliceCatalog, exchange: aliceExchange } = makeAnchorExchange();
        const aliceBus = new PeerMessageBus();
        const alicePeerExchange = new PublicationAnchorPeerExchange(aliceExchange, aliceBus, aliceConnect.registry);
        const aliceCoordinator = new PublicationAnchorDiscoveryCoordinator(alicePeerExchange);

        const { catalog: bobCatalog, exchange: bobExchange } = makeAnchorExchange();
        const bobBus = new PeerMessageBus();
        const bobPeerExchange = new PublicationAnchorPeerExchange(bobExchange, bobBus, bobConnect.registry);
        const bobCoordinator = new PublicationAnchorDiscoveryCoordinator(bobPeerExchange);

        const { catalog: carolCatalog, exchange: carolExchange } = makeAnchorExchange();
        const carolBus = new PeerMessageBus();
        const carolPeerExchange = new PublicationAnchorPeerExchange(carolExchange, carolBus, carolConnect.registry);
        const carolCoordinator = new PublicationAnchorDiscoveryCoordinator(carolPeerExchange);

        const EXPECTED_HASH = 'hash-evidence-h';
        const CONTRADICTING_HASH = 'hash-evidence-h2';

        // Alice: A, B.  Bob: A, C.  Carol: B, D — the four-anchor,
        // three-replica asymmetry docs/Roadmap.md's own 0.8.6 entry
        // names. D is signed by Carol against a DIFFERENT contentHash —
        // structurally inconsistent with A/B/C, exactly the "an
        // incompatible record" case core/PublicationAnchor.js's own
        // header describes, never treated as forged or malicious.
        const anchorA = signAnchor(alice, { publicationId: 'pub-flagship', contentHash: EXPECTED_HASH, anchorType: 'bitcoin-op-return', locator: 'bitcoin://tx/flagship-a' });
        const anchorB = signAnchor(bob, { publicationId: 'pub-flagship', contentHash: EXPECTED_HASH, anchorType: 'other-ledger', locator: 'other://chain/flagship-b' });
        const anchorC = signAnchor(bob, { publicationId: 'pub-flagship', contentHash: EXPECTED_HASH, anchorType: 'transparency-log', locator: 'log://entry/flagship-c' });
        const anchorD = signAnchor(carol, { publicationId: 'pub-flagship', contentHash: CONTRADICTING_HASH, anchorType: 'another-system', locator: 'another://record/flagship-d' });

        aliceExchange.importAnchor(anchorA.toJSON());
        aliceExchange.importAnchor(anchorB.toJSON());
        bobExchange.importAnchor(anchorA.toJSON());
        bobExchange.importAnchor(anchorC.toJSON());
        carolExchange.importAnchor(anchorB.toJSON());
        carolExchange.importAnchor(anchorD.toJSON());

        assert(aliceCatalog.findByPublicationId('pub-flagship').length === 2, '4. setup: Alice starts knowing A and B');
        assert(bobCatalog.findByPublicationId('pub-flagship').length === 2, '5. setup: Bob starts knowing A and C');
        assert(carolCatalog.findByPublicationId('pub-flagship').length === 2, '6. setup: Carol starts knowing B and D');

        // Historical discovery/synchronization — 0.8.5's own mechanism,
        // completely unchanged. Each replica asks every peer it has.
        await aliceCoordinator.discoverFromPeers('pub-flagship', [aliceToBob, aliceToCarol].filter(Boolean), { timeoutMs: 200 });
        await bobCoordinator.discoverFromPeers('pub-flagship', [bobToAlice, bobToCarol].filter(Boolean), { timeoutMs: 200 });
        await carolCoordinator.discoverFromPeers('pub-flagship', [carolToAlice, carolToBob].filter(Boolean), { timeoutMs: 200 });
        // A second round lets whatever a replica only just picked up in
        // round one (e.g. Carol learning C through Bob) propagate the
        // rest of the way (e.g. Alice learning D once Carol has told
        // Bob, and Alice next asks Bob).
        await aliceCoordinator.discoverFromPeers('pub-flagship', [aliceToBob, aliceToCarol].filter(Boolean), { timeoutMs: 200 });
        await bobCoordinator.discoverFromPeers('pub-flagship', [bobToAlice, bobToCarol].filter(Boolean), { timeoutMs: 200 });
        await carolCoordinator.discoverFromPeers('pub-flagship', [carolToAlice, carolToBob].filter(Boolean), { timeoutMs: 200 });

        // --- NETWORK CONVERGENCE ---
        // all three replicas now hold the identical SET of four claims.
        assert(aliceCatalog.findByPublicationId('pub-flagship').length === 4
            && bobCatalog.findByPublicationId('pub-flagship').length === 4
            && carolCatalog.findByPublicationId('pub-flagship').length === 4,
            '7. NETWORK CONVERGENCE: all three replicas converge on the identical set of four anchors, exactly as docs/Principles.md, "Evidence Set Convergence Does Not Imply Truth Convergence (0.8.5)," describes');

        const aliceEvidence = derivePublicationEvidenceConvergence({
            publicationId: 'pub-flagship',
            expectedContentHash: EXPECTED_HASH,
            anchors: aliceCatalog.findByPublicationId('pub-flagship')
        });
        const bobEvidence = derivePublicationEvidenceConvergence({
            publicationId: 'pub-flagship',
            expectedContentHash: EXPECTED_HASH,
            anchors: bobCatalog.findByPublicationId('pub-flagship')
        });
        const carolEvidence = derivePublicationEvidenceConvergence({
            publicationId: 'pub-flagship',
            expectedContentHash: EXPECTED_HASH,
            anchors: carolCatalog.findByPublicationId('pub-flagship')
        });

        // Each replica derives the SAME structural picture from its own
        // converged catalog — the derivation is a pure function of the
        // (now identical) evidence set, so all three agree byte-for-byte.
        assert(JSON.stringify(aliceEvidence) === JSON.stringify(bobEvidence)
            && JSON.stringify(bobEvidence) === JSON.stringify(carolEvidence),
            '8. all three replicas\' independently derived evidence views are byte-identical — a pure function of the converged set, computed with no coordination between them');
        assert(aliceEvidence.anchorCount === 4, '9. four independent anchors known');
        assert(JSON.stringify(aliceEvidence.anchorTypes) === JSON.stringify(['another-system', 'bitcoin-op-return', 'other-ledger', 'transparency-log']),
            '10. four distinct anchor types, none ranked over another');

        // --- EVIDENCE NON-ADJUDICATION ---
        // the conflict IS detected...
        assert(aliceEvidence.contentBindingConflict === true,
            '11. EVIDENCE NON-ADJUDICATION: the content-binding conflict between {A,B,C} and D IS detected by every replica');
        assert(aliceEvidence.contentHashGroups.length === 2, '12. two distinct content-hash groups reported');
        const majorityGroup = aliceEvidence.contentHashGroups.find((g) => g.contentHash === EXPECTED_HASH);
        const minorityGroup = aliceEvidence.contentHashGroups.find((g) => g.contentHash === CONTRADICTING_HASH);
        assert(majorityGroup.anchorIds.length === 3 && minorityGroup.anchorIds.length === 1,
            '13. the true, honest group sizes are reported (three vs. one)');
        // ...but D is never declared false, and A/B/C are never declared
        // authoritative merely for outnumbering it.
        assert(aliceEvidence.matchingAnchorIds.length === 3 && aliceEvidence.divergentAnchorIds.length === 1,
            '14. three anchors match the expected hash, one diverges — "diverges," never "is wrong"');
        assert(aliceEvidence.divergentAnchorIds[0] === anchorD.id,
            '15. Anchor D is named as DIVERGENT, never as invalid, false, or rejected');
        const serialized = JSON.stringify(aliceEvidence);
        assert(!/authorit|trust|winner|consensus|correct|malicious|reject/i.test(serialized),
            '16. no adjudicating language or field — no authority, trust, winner, consensus, correctness, or rejection verdict anywhere in the derived result');
        // D still coexists in the same evidence set as A/B/C — it was
        // never dropped, quarantined, or excluded from anchorCount for
        // conflicting.
        assert(aliceEvidence.anchors.some((entry) => entry.anchorId === anchorD.id),
            '17. Anchor D remains a first-class member of the evidence set despite the conflict it participates in');

        // --- A SECOND ACT: verification disagreement, still local ---
        // Alice and Bob each independently verify the IDENTICAL Anchor A
        // against their own LocalAuthorizationVerifier and report it back
        // into their own local view — never into each other's.
        const aliceVerifier = new LocalAuthorizationVerifier();
        const aliceSignatureCheck = aliceVerifier.verifyPublicationAnchor(anchorA.toJSON());
        const bobVerifier = new LocalAuthorizationVerifier();
        const bobSignatureCheck = bobVerifier.verifyPublicationAnchor(anchorA.toJSON());
        assert(aliceSignatureCheck.valid && bobSignatureCheck.valid, '18. setup: both replicas can genuinely verify Anchor A\'s signature independently');

        const aliceEvidenceWithVerification = derivePublicationEvidenceConvergence({
            publicationId: 'pub-flagship',
            expectedContentHash: EXPECTED_HASH,
            anchors: aliceCatalog.findByPublicationId('pub-flagship'),
            verificationByAnchorId: { [anchorA.id]: AnchorVerificationOutcome.VALID }
        });
        const bobEvidenceWithVerification = derivePublicationEvidenceConvergence({
            publicationId: 'pub-flagship',
            expectedContentHash: EXPECTED_HASH,
            anchors: bobCatalog.findByPublicationId('pub-flagship'),
            // Bob's own external system for anchorType 'bitcoin-op-return'
            // happens to be unreachable right now — an entirely honest,
            // entirely local "couldn't confirm," never a rejection.
            verificationByAnchorId: { [anchorA.id]: AnchorVerificationOutcome.PROOF_UNAVAILABLE }
        });
        const aliceOnA = aliceEvidenceWithVerification.anchors.find((entry) => entry.anchorId === anchorA.id);
        const bobOnA = bobEvidenceWithVerification.anchors.find((entry) => entry.anchorId === anchorA.id);
        assert(aliceOnA.verification === AnchorVerificationOutcome.VALID, '19. Alice\'s own derived view reports her own VALID observation for Anchor A');
        assert(bobOnA.verification === AnchorVerificationOutcome.PROOF_UNAVAILABLE, '20. Bob\'s own derived view reports his own, different PROOF_UNAVAILABLE observation for the identical anchor');
        assert(aliceOnA.contentBinding === bobOnA.contentBinding && aliceOnA.contentHash === bobOnA.contentHash,
            '21. same anchor identity, same structural binding — only the LOCAL verification observation differs between replicas');
        // Neither replica's supplying its own observation changed the
        // OTHER'S evidence-set-wide conflict finding — verification and
        // structural relationships stay on entirely separate axes.
        assert(aliceEvidenceWithVerification.contentBindingConflict === true && bobEvidenceWithVerification.contentBindingConflict === true,
            '22. supplying a local verification observation never changes the structural content-binding conflict finding — the two axes stay independent');

        alicePeerExchange.dispose();
        bobPeerExchange.dispose();
        carolPeerExchange.dispose();
        stopAliceListening();
        stopBobListening();
        aliceTransport.dispose();
        bobTransport.dispose();
        carolTransport.dispose();
    }
    console.log('✓ Section C: FLAGSHIP — Alice/Bob/Carol converge over live authenticated connections on the identical four-anchor evidence set (NETWORK CONVERGENCE); every replica\'s independently derived evidence view reports the same content-binding conflict between {A,B,C} and D without ever declaring a winner (EVIDENCE NON-ADJUDICATION); Alice and Bob then independently verify the identical Anchor A and reach two different, honest, entirely local observations that never cross into each other\'s derived view');

    console.log('\nAll Publication Evidence Convergence tests passed.');
}

run().catch((error) => {
    console.error('PublicationEvidenceConvergence.test.js FAILED:', error);
    process.exitCode = 1;
});
