import { PublicationAnchor } from '../core/PublicationAnchor.js';
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

// 0.8.5 — Historical Anchor Discovery & Synchronization.
//
//   Section A: constructor requirements
//   Section B: PublicationAnchorDiscoveryCoordinator#discoverFromPeers()
//              against a stub exchange — no candidates, every candidate
//              timing out, several candidates offering DIFFERENT anchors
//              (the UNION, never a "first one wins" race), tried strictly
//              in order, a synchronously-throwing request() never blocks
//              the loop, and events for an unrelated publicationId are
//              filtered out of the result
//   Section C: FLAGSHIP — CONVERGENCE. Alice starts knowing only Anchor
//              A, Bob knows both A and B, Carol starts knowing only
//              Anchor B — the exact three-replica asymmetry docs/
//              Roadmap.md's own 0.8.5 entry names. Alice and Carol each
//              discover their missing anchor through Bob, over real live
//              authenticated connections, and all three converge on the
//              identical SET of two claims — never a verdict about them.
//
// See docs/Principles.md, "Synchronization Distributes Claims, Not
// Verification, Truth, Or Authority (0.8.5)," and "Evidence Set
// Convergence Does Not Imply Truth Convergence (0.8.5)."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch (e) { threw = true; }
    assert(threw, message);
}

async function expectRejects(promise, message) {
    let threw = false;
    try { await promise; } catch (e) { threw = true; }
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

// A stand-in for application/PublicationAnchorPeerExchange.js whose
// requestAnchors() only ever "answers" (fires onAnchorReceived, after a
// short delay — never synchronously, so ordering across candidates is
// genuinely exercised) for a peer whose `.id` has a configured response.
// Every other candidate is silently ignored, exactly the restraint a
// real PublicationAnchorPeerExchange applies to a publicationId it
// cannot serve — see that class's own header on why there is no
// NOT_FOUND reply. Mirrors tests/PeerContentRetrievalCoordinator.test.js
// own RecordingPeerContentExchange exactly, applied one domain over.
class RecordingAnchorPeerExchange {
    constructor(responsesByPeerId = {}) {
        this.requested = [];
        this._listeners = new Set();
        this._responses = responsesByPeerId;
    }
    requestAnchors(peer, publicationId) {
        this.requested.push({ peer, publicationId });
        if (peer.throws) {
            throw new Error('RecordingAnchorPeerExchange: simulated send failure');
        }
        const results = this._responses[peer.id];
        if (results) {
            setTimeout(() => {
                for (const result of results) {
                    for (const callback of this._listeners) callback(result);
                }
            }, 5);
        }
    }
    onAnchorReceived(callback) {
        this._listeners.add(callback);
        return () => this._listeners.delete(callback);
    }
}

function fakeAnchor(id, publicationId) {
    return { id, publicationId, toJSON() { return { id, publicationId }; } };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — constructor requirements
    // ---------------------------------------------------------------
    {
        expectThrows(() => new PublicationAnchorDiscoveryCoordinator(null),
            '1. constructor requires a PublicationAnchorPeerExchange');
        expectThrows(() => new PublicationAnchorDiscoveryCoordinator({}),
            '2. constructor requires a PublicationAnchorPeerExchange with requestAnchors()/onAnchorReceived()');
        expectThrows(() => new PublicationAnchorDiscoveryCoordinator({ requestAnchors() {} }),
            '3. constructor requires onAnchorReceived() too, not just requestAnchors()');

        const coordinator = new PublicationAnchorDiscoveryCoordinator(new RecordingAnchorPeerExchange());
        await expectRejects(coordinator.discoverFromPeers(null, []), '4. discoverFromPeers() rejects a missing publicationId');
    }
    console.log('✓ Section A: constructor requirements');

    // ---------------------------------------------------------------
    // Section B — discoverFromPeers() against a stub exchange
    // ---------------------------------------------------------------
    {
        const noCandidatesCoordinator = new PublicationAnchorDiscoveryCoordinator(new RecordingAnchorPeerExchange());
        const noCandidatesResult = await noCandidatesCoordinator.discoverFromPeers('pub-x', []);
        assert(noCandidatesResult.attemptedPeers.length === 0, '1. no candidates -> attemptedPeers is empty');
        assert(noCandidatesResult.discovered.length === 0, '2. no candidates -> discovered is empty');
        assert(noCandidatesResult.publicationId === 'pub-x', '3. the result echoes the requested publicationId');

        const silentExchange = new RecordingAnchorPeerExchange();
        const timeoutCoordinator = new PublicationAnchorDiscoveryCoordinator(silentExchange);
        const badPeerA = { id: 'a' };
        const badPeerB = { id: 'b' };
        const start = Date.now();
        const timeoutResult = await timeoutCoordinator.discoverFromPeers('pub-y', [badPeerA, badPeerB], { timeoutMs: 20 });
        const elapsed = Date.now() - start;
        assert(timeoutResult.discovered.length === 0, '4. every candidate offering nothing -> discovered is empty');
        assert(timeoutResult.attemptedPeers.length === 2 && timeoutResult.attemptedPeers[0] === badPeerA && timeoutResult.attemptedPeers[1] === badPeerB,
            '5. every candidate is recorded in attemptedPeers, in the order supplied');
        assert(silentExchange.requested.length === 2, '6. requestAnchors() was actually sent to both candidates, not just the first');
        assert(elapsed >= 35, '7. EACH candidate\'s own full timeout window elapsed — never an early exit merely because nothing arrived, unlike content retrieval\'s single right-answer race');

        // Two candidates, each offering a DIFFERENT anchor for the same
        // publicationId — the result is the UNION of both, never "first
        // one wins." Sequential, in order, never concurrent.
        const anchorFromPeerOne = fakeAnchor('anchor-1', 'pub-union');
        const anchorFromPeerTwo = fakeAnchor('anchor-2', 'pub-union');
        const unionExchange = new RecordingAnchorPeerExchange({
            'peer-one': [{ anchor: anchorFromPeerOne, isNew: true }],
            'peer-two': [{ anchor: anchorFromPeerTwo, isNew: true }]
        });
        const unionCoordinator = new PublicationAnchorDiscoveryCoordinator(unionExchange);
        const peerOne = { id: 'peer-one' };
        const peerTwo = { id: 'peer-two' };
        const unionStart = Date.now();
        const unionResult = await unionCoordinator.discoverFromPeers('pub-union', [peerOne, peerTwo], { timeoutMs: 40 });
        const unionElapsed = Date.now() - unionStart;
        assert(unionResult.discovered.length === 2, '8. discoverFromPeers() collects anchors from BOTH candidates, never stopping at the first that answers');
        assert(unionResult.discovered.some((r) => r.anchor.id === 'anchor-1') && unionResult.discovered.some((r) => r.anchor.id === 'anchor-2'),
            '9. the result is the UNION of what each peer offered, not a race won by whichever answered first');
        assert(unionResult.discovered[0].anchor.id === 'anchor-1' && unionResult.discovered[1].anchor.id === 'anchor-2',
            '10. results are ordered by candidate order — peer-one\'s offering appears before peer-two\'s');
        assert(unionElapsed >= 35, '11. candidates were tried sequentially — peer-two was not asked until peer-one\'s own window closed');
        assert(unionExchange.requested[0].peer === peerOne && unionExchange.requested[1].peer === peerTwo, '12. requestAnchors() was called on peer-one strictly before peer-two');

        // An event for a DIFFERENT publicationId arriving during the
        // window (e.g. unrelated live ANNOUNCE traffic on the same
        // shared onAnchorReceived stream) is correctly excluded from
        // this call's own result.
        const unrelatedAnchor = fakeAnchor('anchor-unrelated', 'pub-something-else');
        const filteringExchange = new RecordingAnchorPeerExchange({
            'peer-filter': [{ anchor: unrelatedAnchor, isNew: true }, { anchor: fakeAnchor('anchor-match', 'pub-filter-target'), isNew: true }]
        });
        const filteringCoordinator = new PublicationAnchorDiscoveryCoordinator(filteringExchange);
        const filterResult = await filteringCoordinator.discoverFromPeers('pub-filter-target', [{ id: 'peer-filter' }], { timeoutMs: 30 });
        assert(filterResult.discovered.length === 1 && filterResult.discovered[0].anchor.id === 'anchor-match',
            '13. an anchor naming a DIFFERENT publicationId is filtered out of the result, even though it arrived during this call\'s own window');

        // requestAnchors() throwing synchronously (e.g. the peer
        // disconnected right before send()) never blocks the loop, and
        // never waits out the full timeout for that candidate.
        const throwingPeer = { id: 'peer-throws', throws: true };
        const workingPeer = { id: 'peer-works' };
        const resilientExchange = new RecordingAnchorPeerExchange({
            'peer-works': [{ anchor: fakeAnchor('anchor-resilient', 'pub-resilient'), isNew: true }]
        });
        const resilientCoordinator = new PublicationAnchorDiscoveryCoordinator(resilientExchange);
        const resilientStart = Date.now();
        const resilientResult = await resilientCoordinator.discoverFromPeers('pub-resilient', [throwingPeer, workingPeer], { timeoutMs: 200 });
        const resilientElapsed = Date.now() - resilientStart;
        assert(resilientResult.attemptedPeers.length === 2, '14. a candidate whose requestAnchors() throws synchronously is still recorded as attempted');
        assert(resilientResult.discovered.length === 1 && resilientResult.discovered[0].anchor.id === 'anchor-resilient',
            '15. the throwing candidate contributes nothing, but the next candidate is still tried and still contributes');
        assert(resilientElapsed < 200 + 25, '16. the throwing candidate never waited out its own full timeout window — it failed immediately and moved on');
    }
    console.log('✓ Section B: discoverFromPeers() tries candidates strictly in order, unions what each offers rather than racing to a single winner, filters events by publicationId, and never lets one candidate\'s failure block another');

    // ---------------------------------------------------------------
    // Section C — FLAGSHIP: CONVERGENCE. Alice knows only A, Bob knows
    // A and B, Carol knows only B. Each discovers its missing anchor
    // through Bob, over real live authenticated connections.
    // ---------------------------------------------------------------
    {
        const network = new LocalPeerNetwork();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const carol = makeIdentity('Carol');

        const aliceTransport = new LocalPeerConnectionProvider('alice-converge', network);
        const bobTransport = new LocalPeerConnectionProvider('bob-converge', network);
        const carolTransport = new LocalPeerConnectionProvider('carol-converge', network);

        const aliceConnect = new ConnectToPeerUseCase({ peerConnectionProvider: aliceTransport, identityProvider: alice });
        const stopAliceListening = aliceConnect.listen();
        const bobConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bobTransport, identityProvider: bob });
        const stopBobListening = bobConnect.listen();
        const bobToAlice = bobConnect.connect({ candidateEndpoint: 'alice-converge' });
        const carolConnect = new ConnectToPeerUseCase({ peerConnectionProvider: carolTransport, identityProvider: carol });
        const carolToBob = carolConnect.connect({ candidateEndpoint: 'bob-converge' });

        await wait(20);
        assert(bobToAlice.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '1. setup: Bob<->Alice authenticates');
        assert(carolToBob.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '2. setup: Carol<->Bob authenticates');

        const aliceToBob = aliceConnect.registry.list()[0];
        assert(aliceToBob && aliceToBob.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '3. setup: Alice sees her own connection to Bob too, symmetric to Bob\'s');

        const { catalog: aliceCatalog, exchange: aliceExchange } = makeAnchorExchange();
        const aliceBus = new PeerMessageBus();
        const alicePeerExchange = new PublicationAnchorPeerExchange(aliceExchange, aliceBus, aliceConnect.registry);
        const aliceCoordinator = new PublicationAnchorDiscoveryCoordinator(alicePeerExchange);

        const { catalog: bobCatalog, exchange: bobExchange } = makeAnchorExchange();
        const bobBus = new PeerMessageBus();
        const bobPeerExchange = new PublicationAnchorPeerExchange(bobExchange, bobBus, bobConnect.registry);

        const { catalog: carolCatalog, exchange: carolExchange } = makeAnchorExchange();
        const carolBus = new PeerMessageBus();
        const carolPeerExchange = new PublicationAnchorPeerExchange(carolExchange, carolBus, carolConnect.registry);
        const carolCoordinator = new PublicationAnchorDiscoveryCoordinator(carolPeerExchange);

        const anchorA = signAnchor(alice, { publicationId: 'pub-converge', contentHash: 'hash-converge', anchorType: 'bitcoin-op-return', locator: 'bitcoin://tx/converge-a' });
        const anchorB = signAnchor(bob, { publicationId: 'pub-converge', contentHash: 'hash-converge', anchorType: 'other-ledger', locator: 'other://chain/converge-b' });

        // The exact asymmetry docs/Roadmap.md's own 0.8.5 entry names:
        // Alice knows A. Bob knows A AND B. Carol knows B. Nobody
        // announced anything yet — each replica's own starting catalog
        // is set up directly, exactly as if each had learned its own
        // anchor independently, at a different time, from a different
        // source.
        aliceCatalog.add(anchorA);
        bobExchange.importAnchor(anchorA.toJSON());
        bobExchange.importAnchor(anchorB.toJSON());
        carolCatalog.add(anchorB);

        assert(aliceCatalog.findByPublicationId('pub-converge').length === 1, '4. setup: Alice starts knowing only A');
        assert(bobCatalog.findByPublicationId('pub-converge').length === 2, '5. setup: Bob starts knowing both A and B');
        assert(carolCatalog.findByPublicationId('pub-converge').length === 1, '6. setup: Carol starts knowing only B');

        const aliceResult = await aliceCoordinator.discoverFromPeers('pub-converge', [aliceToBob], { timeoutMs: 200 });
        const carolResult = await carolCoordinator.discoverFromPeers('pub-converge', [carolToBob], { timeoutMs: 200 });

        assert(aliceCatalog.has(anchorA.id) && aliceCatalog.has(anchorB.id), '7. Alice discovered Anchor B through Bob — she now holds both');
        assert(carolCatalog.has(anchorA.id) && carolCatalog.has(anchorB.id), '8. Carol discovered Anchor A through Bob — she now holds both');
        assert(aliceCatalog.findByPublicationId('pub-converge').length === 2
            && bobCatalog.findByPublicationId('pub-converge').length === 2
            && carolCatalog.findByPublicationId('pub-converge').length === 2,
            '9. all THREE replicas have now converged on the identical SET of two claims — evidence set convergence, exactly as docs/Principles.md describes it');

        // discoverFromPeers()'s own returned `discovered` reports BOTH
        // anchors Bob sent back to Alice — the one she already had
        // (isNew: false, confirmed, not re-added) and the one she
        // didn't (isNew: true, genuinely new) — never silently hiding
        // the redundant one from the result.
        assert(aliceResult.discovered.length === 2, '10. Alice\'s own discovery call reports both anchors Bob offered, not merely the new one');
        const aliceSawA = aliceResult.discovered.find((r) => r.anchor.id === anchorA.id);
        const aliceSawB = aliceResult.discovered.find((r) => r.anchor.id === anchorB.id);
        assert(aliceSawA && aliceSawA.isNew === false, '11. Alice\'s own copy of A is confirmed already known — isNew: false');
        assert(aliceSawB && aliceSawB.isNew === true, '12. Anchor B is genuinely new to Alice — isNew: true');

        assert(carolResult.discovered.length === 2, '13. Carol\'s own discovery call reports both anchors Bob offered too');
        const carolSawA = carolResult.discovered.find((r) => r.anchor.id === anchorA.id);
        const carolSawB = carolResult.discovered.find((r) => r.anchor.id === anchorB.id);
        assert(carolSawA && carolSawA.isNew === true, '14. Anchor A is genuinely new to Carol — isNew: true');
        assert(carolSawB && carolSawB.isNew === false, '15. Carol\'s own copy of B is confirmed already known — isNew: false');

        // Byte-identical claims — nothing was re-signed or re-derived by
        // passing through Bob or through this coordinator.
        assert(aliceCatalog.get(anchorB.id).signature.signature === anchorB.signature.signature, '16. Alice\'s discovered copy of B carries Bob\'s exact original signature');
        assert(carolCatalog.get(anchorA.id).signature.signature === anchorA.signature.signature, '17. Carol\'s discovered copy of A carries Alice\'s exact original signature');

        // Running discovery again is harmless and reports the SAME set,
        // now entirely isNew: false — convergence is stable, never a
        // growing log of duplicates.
        const aliceResultAgain = await aliceCoordinator.discoverFromPeers('pub-converge', [aliceToBob], { timeoutMs: 200 });
        assert(aliceResultAgain.discovered.length === 2 && aliceResultAgain.discovered.every((r) => r.isNew === false),
            '18. re-running discovery reports the identical set, now fully isNew: false — the catalog never grows past two entries');
        assert(aliceCatalog.findByPublicationId('pub-converge').length === 2, '19. Alice\'s catalog still holds exactly two entries after discovering twice');

        alicePeerExchange.dispose();
        bobPeerExchange.dispose();
        carolPeerExchange.dispose();
        stopAliceListening();
        stopBobListening();
        aliceTransport.dispose();
        bobTransport.dispose();
        carolTransport.dispose();
    }
    console.log('✓ Section C: FLAGSHIP — Alice (knows A) and Carol (knows B) each discover their missing anchor through Bob (knows both), over live authenticated connections; all three converge on the identical evidence SET; discoverFromPeers() reports isNew accurately for both the confirmed and the genuinely new anchor; re-discovery is stable');

    console.log('\nAll Publication Anchor Discovery Coordinator tests passed.');
}

run().catch((error) => {
    console.error('PublicationAnchorDiscoveryCoordinator.test.js FAILED:', error);
    process.exitCode = 1;
});
