import { LocalPublicationCatalog } from '../application/LocalPublicationCatalog.js';
import { PublicationExchange } from '../application/PublicationExchange.js';
import { PublicationResolver } from '../application/PublicationResolver.js';
import { PublicationResolutionOutcome } from '../application/PublicationResolutionOutcome.js';
import { PublicationPeerExchange } from '../application/PublicationPeerExchange.js';
import { PublicationResolutionCoordinator } from '../application/PublicationResolutionCoordinator.js';
import { PeerContentRetrievalCoordinator } from '../application/PeerContentRetrievalCoordinator.js';
import { PeerContentExchange } from '../application/PeerContentExchange.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { BlueprintAttribution, BLUEPRINT_ATTRIBUTION_KIND } from '../core/BlueprintAttribution.js';
import { LocalBlueprintAttributionStore } from '../application/LocalBlueprintAttributionStore.js';
import { createBlueprintAttributionPublicationKind } from '../application/BlueprintAttributionPublicationKind.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { ConnectToPeerUseCase } from '../application/ConnectToPeerUseCase.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';

// 0.7.6 — Multi-Peer Publication Retrieval & Replication.
//
//   Section A: PeerContentRetrievalCoordinator — constructor requirements
//   Section B: PeerContentRetrievalCoordinator#retrieve() against a stub
//              exchange — no candidates, every candidate timing out, and
//              a later candidate succeeding after an earlier one does
//              not, tried strictly in order
//   Section C: PublicationResolutionCoordinator — the new `peers` array
//              option, `peer` (singular) still working unchanged, and
//              the new `retrieval` field surfaced on the result without
//              ever contaminating `outcome`
//   Section D: FLAGSHIP — Alice publishes; Bob retrieves her bytes over
//              a real live connection (through
//              PublicationResolutionCoordinator's own `peers` path);
//              Alice disconnects entirely; Bob relays the SAME signed
//              publication to Dave and Carol; Carol asks Dave first (he
//              has cataloged the locator but never fetched its bytes,
//              so he never answers) and falls through to Bob (through
//              PeerContentRetrievalCoordinator directly) — replication
//              without republication, and an independent republish by
//              Bob that produces a SECOND, equally legitimate
//              publication for the identical content hash
//
// See docs/Principles.md, "Replication Creates Availability; It Does
// Not Create Authority (0.7.6)."

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
    provider.login(label);
    return provider;
}

// A stand-in for application/PeerContentExchange.js whose request()
// only ever "answers" (fires onContentReceived, after a short delay —
// never synchronously, so ordering across candidates is genuinely
// exercised) for a peer whose `.id` is in `respondingPeerIds`. Every
// other candidate is silently ignored, exactly the restraint a real
// PeerContentExchange applies to a hash it cannot serve — see that
// class's own header on why there is no NOT_FOUND reply.
class RecordingPeerContentExchange {
    constructor(respondingPeerIds = []) {
        this.requested = [];
        this._listeners = new Set();
        this._respondingPeerIds = new Set(respondingPeerIds);
    }
    request(peer, hash) {
        this.requested.push({ peer, hash });
        if (this._respondingPeerIds.has(peer.id)) {
            setTimeout(() => {
                for (const callback of this._listeners) callback({ hash });
            }, 5);
        }
    }
    onContentReceived(callback) {
        this._listeners.add(callback);
        return () => this._listeners.delete(callback);
    }
}

// A stand-in for application/PublicationResolver.js that returns the
// NEXT result off a fixed sequence on each call (clamped to the last
// entry once exhausted) — Section C needs a resolver whose SECOND call
// can report something different from its first (CONTENT_UNAVAILABLE,
// then RESOLVED once bytes "arrived"), which the existing StubResolver
// in tests/PublicationResolutionCoordinator.test.js was never asked to
// do.
class SequenceResolver {
    constructor(results) { this.results = results; this.calls = 0; }
    async resolve() {
        const result = this.results[Math.min(this.calls, this.results.length - 1)];
        this.calls += 1;
        return result;
    }
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — constructor requirements
    // ---------------------------------------------------------------
    {
        expectThrows(() => new PeerContentRetrievalCoordinator(null),
            '1. constructor requires a PeerContentExchange');
        expectThrows(() => new PeerContentRetrievalCoordinator({}),
            '2. constructor requires a PeerContentExchange with request()/onContentReceived()');
        expectThrows(() => new PeerContentRetrievalCoordinator({ request() {} }),
            '3. constructor requires onContentReceived() too, not just request()');

        const coordinator = new PeerContentRetrievalCoordinator(new RecordingPeerContentExchange());
        await expectRejects(coordinator.retrieve(null, []), '4. retrieve() rejects a missing hash');
    }
    console.log('✓ Section A: constructor requirements');

    // ---------------------------------------------------------------
    // Section B — retrieve() against a stub exchange
    // ---------------------------------------------------------------
    {
        const noCandidatesCoordinator = new PeerContentRetrievalCoordinator(new RecordingPeerContentExchange());
        const noCandidatesResult = await noCandidatesCoordinator.retrieve('feed01', []);
        assert(noCandidatesResult.retrieved === false, '1. no candidates -> retrieved: false');
        assert(noCandidatesResult.attemptedPeers.length === 0, '2. no candidates -> attemptedPeers is empty');
        assert(noCandidatesResult.reason.includes('no peer candidates'), '3. no candidates -> a specific reason, not a generic failure');

        const silentExchange = new RecordingPeerContentExchange();
        const timeoutCoordinator = new PeerContentRetrievalCoordinator(silentExchange);
        const badPeerA = { id: 'a' };
        const badPeerB = { id: 'b' };
        const timeoutResult = await timeoutCoordinator.retrieve('feed02', [badPeerA, badPeerB], { timeoutMs: 20 });
        assert(timeoutResult.retrieved === false, '4. every candidate timing out -> retrieved: false');
        assert(timeoutResult.attemptedPeers.length === 2 && timeoutResult.attemptedPeers[0] === badPeerA && timeoutResult.attemptedPeers[1] === badPeerB,
            '5. every candidate is recorded in attemptedPeers, in the order supplied');
        assert(timeoutResult.reason.includes('2 candidate'), '6. the reason names how many candidates were tried');
        assert(silentExchange.requested.length === 2, '7. request() was actually sent to both candidates, not just the first');

        const respondingExchange = new RecordingPeerContentExchange(['good']);
        const fallbackCoordinator = new PeerContentRetrievalCoordinator(respondingExchange);
        const badPeer = { id: 'bad' };
        const goodPeer = { id: 'good' };
        const start = Date.now();
        const fallbackResult = await fallbackCoordinator.retrieve('feed03', [badPeer, goodPeer], { timeoutMs: 30 });
        const elapsed = Date.now() - start;
        assert(fallbackResult.retrieved === true, '8. the second candidate answering still counts as retrieved');
        assert(fallbackResult.peer === goodPeer, '9. the reported peer is the one that actually answered, never the first candidate merely because it was tried first');
        assert(fallbackResult.attemptedPeers.length === 2, '10. the candidate that timed out is still recorded in attemptedPeers');
        assert(elapsed >= 25, '11. the first candidate\'s own timeout genuinely elapsed before the second was tried — never raced concurrently');
        assert(respondingExchange.requested.every((r) => r.hash === 'feed03'), '12. every request named the exact hash asked for');

        // Trying the SAME good peer FIRST proves order is the only thing
        // that changed — content validity never depended on it.
        const orderIndependentExchange = new RecordingPeerContentExchange(['good']);
        const orderCoordinator = new PeerContentRetrievalCoordinator(orderIndependentExchange);
        const orderResult = await orderCoordinator.retrieve('feed03', [goodPeer, badPeer], { timeoutMs: 30 });
        assert(orderResult.retrieved === true && orderResult.peer === goodPeer && orderResult.attemptedPeers.length === 1,
            '13. asking the peer that has it FIRST succeeds without ever trying the second');
    }
    console.log('✓ Section B: retrieve() tries candidates strictly in order, records every attempt, and never trusts a peer merely for answering first');

    // ---------------------------------------------------------------
    // Section C — PublicationResolutionCoordinator's new `peers` option
    // ---------------------------------------------------------------
    {
        const unavailable = { outcome: PublicationResolutionOutcome.CONTENT_UNAVAILABLE, content: null, publication: { contentReference: { hash: 'c0ffee' } }, reason: 'not here' };
        const resolved = { outcome: PublicationResolutionOutcome.RESOLVED, content: { x: 42 }, publication: { contentReference: { hash: 'c0ffee' } }, reason: null };

        // Every candidate fails -> the ORIGINAL result, unchanged,
        // carrying a `retrieval` field that explains what was tried.
        {
            const resolver = new SequenceResolver([unavailable, resolved]);
            const exchange = new RecordingPeerContentExchange([]);
            const coordinator = new PublicationResolutionCoordinator(resolver, exchange);
            const result = await coordinator.resolve({}, {}, { peers: [{ id: 'x' }, { id: 'y' }], timeoutMs: 20 });
            assert(result.outcome === PublicationResolutionOutcome.CONTENT_UNAVAILABLE, '1. exhausting every candidate returns the original outcome unchanged');
            assert(result.reason === 'not here', '2. the original reason is preserved verbatim');
            assert(result.retrieval && result.retrieval.retrieved === false && result.retrieval.attemptedPeers.length === 2,
                '3. the result carries a retrieval field describing the failed attempt, never folded into outcome');
            assert(resolver.calls === 1, '4. a failed retrieval never triggers a second local resolve() call');
        }

        // A later candidate in `peers` succeeding -> RESOLVED, with
        // `retrieval.peer` naming exactly which one answered.
        {
            const resolver = new SequenceResolver([unavailable, resolved]);
            const exchange = new RecordingPeerContentExchange(['good']);
            const coordinator = new PublicationResolutionCoordinator(resolver, exchange);
            const badPeer = { id: 'bad' };
            const goodPeer = { id: 'good' };
            const result = await coordinator.resolve({}, {}, { peers: [badPeer, goodPeer], timeoutMs: 30 });
            assert(result.outcome === PublicationResolutionOutcome.RESOLVED, '5. a candidate answering re-resolves to RESOLVED');
            assert(result.content.x === 42, '6. the RESOLVED content is exactly the second resolve() call\'s own result');
            assert(result.retrieval.retrieved === true && result.retrieval.peer === goodPeer,
                '7. retrieval.peer names the candidate that actually answered');
            assert(result.retrieval.attemptedPeers.length === 2, '8. the candidate tried and skipped over is still recorded');
            assert(resolver.calls === 2, '9. a successful retrieval always triggers exactly one second local resolve() call');
        }

        // `peer` (singular) still behaves exactly as it did before
        // 0.7.6 — a one-candidate shorthand, never a separate code path.
        {
            const resolver = new SequenceResolver([unavailable, resolved]);
            const exchange = new RecordingPeerContentExchange(['solo']);
            const coordinator = new PublicationResolutionCoordinator(resolver, exchange);
            const soloPeer = { id: 'solo' };
            const result = await coordinator.resolve({}, {}, { peer: soloPeer, timeoutMs: 30 });
            assert(result.outcome === PublicationResolutionOutcome.RESOLVED, '10. singular `peer` still triggers retrieval, unchanged since 0.7.5');
            assert(result.retrieval.attemptedPeers.length === 1 && result.retrieval.attemptedPeers[0] === soloPeer,
                '11. singular `peer` is treated as exactly one candidate');
        }

        // RESOLVED/INVALID_* first results still never touch the
        // exchange at all, `peers` supplied or not — unchanged since
        // 0.7.5.
        {
            const resolver = new SequenceResolver([resolved]);
            const exchange = new RecordingPeerContentExchange(['x']);
            const coordinator = new PublicationResolutionCoordinator(resolver, exchange);
            const result = await coordinator.resolve({}, {}, { peers: [{ id: 'x' }] });
            assert(result.outcome === PublicationResolutionOutcome.RESOLVED, '12. an already-RESOLVED first result passes through');
            assert(result.retrieval === undefined, '13. no retrieval field is ever added when no retrieval was attempted');
            assert(exchange.requested.length === 0, '14. a resolved publication never triggers a peer request, even with candidates supplied');
        }
    }
    console.log('✓ Section C: PublicationResolutionCoordinator\'s new `peers` array tries candidates in order, `peer` still works as a one-candidate shorthand, and `retrieval` never contaminates `outcome`');

    // ---------------------------------------------------------------
    // Section D — FLAGSHIP: Alice -> Bob -> {Carol, Dave} replication
    // ---------------------------------------------------------------
    {
        const network = new LocalPeerNetwork();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const carol = makeIdentity('Carol');
        const dave = makeIdentity('Dave');
        const verifier = new LocalAuthorizationVerifier();

        const aliceTransport = new LocalPeerConnectionProvider('alice-relay', network);
        const bobTransport = new LocalPeerConnectionProvider('bob-relay', network);
        const carolTransport = new LocalPeerConnectionProvider('carol-relay', network);
        const daveTransport = new LocalPeerConnectionProvider('dave-relay', network);

        // Topology: Alice only ever knows Bob. Bob knows Alice, Carol,
        // and Dave. Carol and Dave each know Bob only — proving Carol's
        // eventual retrieval never depends on any connection to Alice,
        // who will be gone entirely by the time Carol asks for anything.
        const aliceConnect = new ConnectToPeerUseCase({ peerConnectionProvider: aliceTransport, identityProvider: alice });
        const stopAliceListening = aliceConnect.listen();
        const bobConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bobTransport, identityProvider: bob });
        const bobToAlice = bobConnect.connect({ candidateEndpoint: 'alice-relay' });
        const stopBobListening = bobConnect.listen();
        const carolConnect = new ConnectToPeerUseCase({ peerConnectionProvider: carolTransport, identityProvider: carol });
        const carolToBob = carolConnect.connect({ candidateEndpoint: 'bob-relay' });
        const daveConnect = new ConnectToPeerUseCase({ peerConnectionProvider: daveTransport, identityProvider: dave });
        const daveToBob = daveConnect.connect({ candidateEndpoint: 'bob-relay' });
        const stopDaveListening = daveConnect.listen(); // Carol connects to Dave directly later, purely to ask him for content

        await wait(20);
        assert(bobToAlice.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '1. setup: Bob<->Alice authenticates');
        assert(carolToBob.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '2. setup: Carol<->Bob authenticates');
        assert(daveToBob.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '3. setup: Dave<->Bob authenticates');

        const aliceContentStore = new LocalContentStore(new InMemoryStorageProvider());
        const bobContentStore = new LocalContentStore(new InMemoryStorageProvider());
        const carolContentStore = new LocalContentStore(new InMemoryStorageProvider());
        const daveContentStore = new LocalContentStore(new InMemoryStorageProvider());

        const aliceResolver = new PublicationResolver(aliceContentStore, verifier);
        const bobResolver = new PublicationResolver(bobContentStore, verifier);
        const carolResolver = new PublicationResolver(carolContentStore, verifier);

        const aliceCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const bobCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const carolCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const daveCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());

        const aliceExchange = new PublicationExchange(aliceCatalog, verifier);
        const bobExchange = new PublicationExchange(bobCatalog, verifier);
        const carolExchange = new PublicationExchange(carolCatalog, verifier);
        const daveExchange = new PublicationExchange(daveCatalog, verifier);

        const aliceBus = new PeerMessageBus();
        const bobBus = new PeerMessageBus();
        const carolBus = new PeerMessageBus();
        const daveBus = new PeerMessageBus();

        const alicePublicationPeerExchange = new PublicationPeerExchange(aliceExchange, aliceBus, aliceConnect.registry);
        const bobPublicationPeerExchange = new PublicationPeerExchange(bobExchange, bobBus, bobConnect.registry);
        const carolPublicationPeerExchange = new PublicationPeerExchange(carolExchange, carolBus, carolConnect.registry);
        const davePublicationPeerExchange = new PublicationPeerExchange(daveExchange, daveBus, daveConnect.registry);

        const aliceContentExchange = new PeerContentExchange(aliceContentStore, aliceBus, aliceConnect.registry, aliceCatalog);
        const bobContentExchange = new PeerContentExchange(bobContentStore, bobBus, bobConnect.registry, bobCatalog);
        const carolContentExchange = new PeerContentExchange(carolContentStore, carolBus, carolConnect.registry, carolCatalog);
        const daveContentExchange = new PeerContentExchange(daveContentStore, daveBus, daveConnect.registry, daveCatalog);

        const bobAttributionStore = new LocalBlueprintAttributionStore(new InMemoryStorageProvider());
        const carolAttributionStore = new LocalBlueprintAttributionStore(new InMemoryStorageProvider());
        const bobKindPlugin = createBlueprintAttributionPublicationKind({ verifier, store: bobAttributionStore });
        const carolKindPlugin = createBlueprintAttributionPublicationKind({ verifier, store: carolAttributionStore });

        // Alice publishes and catalogs her own signed attribution, and
        // announces it — Bob is the only peer who ever hears it
        // directly from her.
        const attribution = new BlueprintAttribution({ fingerprint: 'bp:harbor-7', authorIdentityId: alice.getSigningIdentity().id });
        const signedAttribution = attribution.withSignature(alice.signCanonical(attribution.getSigningDescriptor()));
        const publication = await aliceResolver.publish({ content: signedAttribution, contentKind: BLUEPRINT_ATTRIBUTION_KIND, identityProvider: alice });
        aliceCatalog.add(publication);
        alicePublicationPeerExchange.announce(publication);
        await wait(20);

        assert(bobCatalog.has(publication.id), '4. Bob catalogs Alice\'s live announcement');
        assert(carolCatalog.has(publication.id) === false && daveCatalog.has(publication.id) === false,
            '5. neither Carol nor Dave has heard of it yet — Alice never announced to either directly');

        const hash = publication.contentReference.hash;
        const envelope = publication.toJSON();

        // Bob resolves through PublicationResolutionCoordinator's OWN
        // new `peers` option — a one-item candidate list is still the
        // SAME multi-peer code path a longer list would use.
        const bobCoordinator = new PublicationResolutionCoordinator(bobResolver, bobContentExchange);
        const bobBefore = await bobCoordinator.resolve(envelope, bobKindPlugin);
        assert(bobBefore.outcome === PublicationResolutionOutcome.CONTENT_UNAVAILABLE, '6. Bob has not retrieved the bytes yet');
        const bobAfter = await bobCoordinator.resolve(envelope, bobKindPlugin, { peers: [bobToAlice] });
        assert(bobAfter.outcome === PublicationResolutionOutcome.RESOLVED, '7. Bob retrieves Alice\'s bytes over a real live connection, through PublicationResolutionCoordinator\'s own peers option');
        assert(bobContentStore.has(publication.contentReference), '8. the bytes are now genuinely in Bob\'s own ContentStore — replication, not merely a resolved verdict');
        assert(bobCatalog.list().length === 1, '9. retrieving never creates a new publication — Bob does not become "the publisher" merely by holding the bytes');

        // Alice goes away entirely — closes her transport, disposes
        // both her exchanges. Everything from here on must work without
        // her.
        alicePublicationPeerExchange.dispose();
        aliceContentExchange.dispose();
        stopAliceListening();
        aliceTransport.dispose();
        await wait(10);

        // Bob relays the SAME signed envelope (never re-signs it,
        // never creates a new one) to everyone still connected to him —
        // Carol and Dave both catalog Alice's ORIGINAL publication,
        // attributed to Alice, exactly as she signed it.
        const relayedCount = bobPublicationPeerExchange.announce(publication);
        assert(relayedCount === 2, '10. Bob relays to exactly his two remaining connected peers, Carol and Dave');
        await wait(20);

        assert(carolCatalog.has(publication.id) && daveCatalog.has(publication.id), '11. Carol and Dave both catalog the relayed publication');
        assert(carolCatalog.get(publication.id).publisherIdentity.id === alice.getSigningIdentity().id,
            '12. the relayed publication is still attributed to Alice, never to Bob — a relay is not a republish');
        assert(daveContentStore.has(publication.contentReference) === false, '13. Dave has cataloged the LOCATOR only — he never fetched the bytes');

        // Carol asks Dave FIRST — he knows the locator but has no
        // bytes, so he never answers — and only THEN Bob, who does.
        // Exercises application/PeerContentRetrievalCoordinator.js
        // directly, proving the standalone class's own live behavior,
        // not merely PublicationResolutionCoordinator's use of it.
        const carolBefore = await carolResolver.resolve(envelope, carolKindPlugin);
        assert(carolBefore.outcome === PublicationResolutionOutcome.CONTENT_UNAVAILABLE, '14. Carol has not retrieved the bytes yet either');

        const carolRetrieval = new PeerContentRetrievalCoordinator(carolContentExchange);
        const carolToDave = carolConnect.connect({ candidateEndpoint: 'dave-relay' });
        await wait(20);
        assert(carolToDave.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '15. setup: Carol<->Dave authenticates too, purely for this content request');

        const retrieval = await carolRetrieval.retrieve(hash, [carolToDave, carolToBob], { timeoutMs: 300 });
        assert(retrieval.retrieved === true, '16. Carol\'s retrieval succeeds despite Dave never answering');
        assert(retrieval.peer === carolToBob, '17. the reported source is Bob, the peer that actually answered — never Dave, merely for being asked first');
        assert(retrieval.attemptedPeers.length === 2 && retrieval.attemptedPeers[0] === carolToDave,
            '18. Dave is still recorded as an attempted candidate, even though he never answered');

        const carolAfter = await carolResolver.resolve(envelope, carolKindPlugin);
        assert(carolAfter.outcome === PublicationResolutionOutcome.RESOLVED, '19. re-resolving after retrieval succeeds now that the bytes verified and are stored');
        assert(carolContentStore.has(publication.contentReference), '20. the bytes are genuinely replicated onto Carol\'s own ContentStore');
        assert(carolCatalog.list().length === 1, '21. Carol still holds exactly Alice\'s ORIGINAL publication — retrieving content never adds, mutates, or replaces a catalog entry');
        assert(carolCatalog.get(publication.id).publisherIdentity.id === alice.getSigningIdentity().id,
            '22. Carol never becomes "the publisher" — the cataloged publication is still Alice\'s, signed by Alice, unchanged');

        // Bob independently republishes the identical bytes under his
        // OWN signed envelope — a second, equally legitimate
        // publication for the same content hash, never a replacement
        // for Alice's.
        const bobsOwnPublication = await bobResolver.publish({ content: signedAttribution, contentKind: BLUEPRINT_ATTRIBUTION_KIND, identityProvider: bob });
        bobCatalog.add(bobsOwnPublication);
        assert(bobsOwnPublication.contentReference.hash === hash, '23. Bob\'s own publication points at the IDENTICAL content hash');
        assert(bobsOwnPublication.id !== publication.id, '24. Bob\'s own publication is a genuinely distinct envelope, with its own id');
        const siblings = bobCatalog.findByContentHash(hash);
        assert(siblings.length === 2, '25. Bob\'s own catalog now holds TWO publications for the same hash — Alice\'s original and his own — neither replacing the other');
        assert(new Set(siblings.map((p) => p.publisherIdentity.id)).size === 2,
            '26. the two publications are attributed to two different identities — no canonical publisher, no winner');

        alicePublicationPeerExchange.dispose(); // already disposed above; idempotent per its own header — proves double-dispose is safe
        bobPublicationPeerExchange.dispose();
        carolPublicationPeerExchange.dispose();
        davePublicationPeerExchange.dispose();
        bobContentExchange.dispose();
        carolContentExchange.dispose();
        daveContentExchange.dispose();
        stopBobListening();
        stopDaveListening();
        bobTransport.dispose();
        carolTransport.dispose();
        daveTransport.dispose();
    }
    console.log('✓ Section D: FLAGSHIP — Bob retrieves from Alice, Alice disconnects entirely, Carol falls through Dave (who never answers) to Bob, replication never creates a new publication, and an independent republish produces two equally legitimate publications for one content hash');

    console.log('\nAll Multi-Peer Publication Retrieval & Replication tests passed.');
}

run().catch((error) => {
    console.error('PeerContentRetrievalCoordinator.test.js FAILED:', error);
    process.exitCode = 1;
});
