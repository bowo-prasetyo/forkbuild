import { DecentralizedPublication } from '../core/DecentralizedPublication.js';
import { LocalPublicationCatalog } from '../application/LocalPublicationCatalog.js';
import { PublicationExchange } from '../application/PublicationExchange.js';
import { PublicationResolver } from '../application/PublicationResolver.js';
import { PublicationResolutionOutcome } from '../application/PublicationResolutionOutcome.js';
import { PublicationPeerExchange } from '../application/PublicationPeerExchange.js';
import { PublicationResolutionCoordinator } from '../application/PublicationResolutionCoordinator.js';
import { resolvePublicationView, describePublicationOutcome } from '../application/PublicationResolutionView.js';
import { CreatePublicationDisplayKindRegistryUseCase } from '../application/CreatePublicationDisplayKindRegistryUseCase.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { BlueprintAttribution, BLUEPRINT_ATTRIBUTION_KIND } from '../core/BlueprintAttribution.js';
import { LocalBlueprintAttributionStore } from '../application/LocalBlueprintAttributionStore.js';
import { createBlueprintAttributionPublicationKind } from '../application/BlueprintAttributionPublicationKind.js';
import { PeerContentExchange } from '../application/PeerContentExchange.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { ConnectToPeerUseCase } from '../application/ConnectToPeerUseCase.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';

// 0.7.5 — Decentralized Publication UX & Resolution.
//
//   Section A: constructor requirements + local-only passthrough — a
//              RESOLVED, an INVALID_*, and a peer-less CONTENT_UNAVAILABLE
//              result all pass through application/
//              PublicationResolutionCoordinator.js#resolve() completely
//              unchanged, and it NEVER touches a supplied
//              PeerContentExchange unless the outcome is genuinely
//              CONTENT_UNAVAILABLE
//   Section B: a peer that never answers — resolve() returns the
//              ORIGINAL CONTENT_UNAVAILABLE result once its own
//              timeoutMs elapses, never a different outcome invented
//              for "I tried and it didn't work"
//   Section C: FLAGSHIP — a real, live, authenticated connection: Bob
//              catalogs Alice's publication, resolves
//              CONTENT_UNAVAILABLE through the coordinator with no peer
//              supplied, then RESOLVED the moment he supplies
//              `bobConnectedPeer` — one call, no second exchange, no
//              file
//   Section D: application/PublicationResolutionView.js +
//              application/CreatePublicationDisplayKindRegistryUseCase.js —
//              a display-only kindPlugin (no `store`) resolves without
//              ever importing into LocalBlueprintAttributionStore, and
//              an unsupported contentKind is reported, not guessed at
//
// See docs/Principles.md, "A Resolution Coordinator Sequences; It Does
// Not Decide (0.7.5)."

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
    provider.login(label);
    return provider;
}

// A stand-in for application/PublicationResolver.js that returns
// whatever `nextResult` was set to, regardless of what it was called
// with — Section A/B only need to prove application/
// PublicationResolutionCoordinator.js's own SEQUENCING logic, never
// application/PublicationResolver.js's own ten-step discipline, which
// tests/DecentralizedPublicationDiscovery.test.js/tests/
// IpfsPublicationResolution.test.js already cover directly.
class StubResolver {
    constructor(nextResult) {
        this.nextResult = nextResult;
        this.calls = 0;
    }
    async resolve() {
        this.calls += 1;
        return this.nextResult;
    }
}

// A stand-in for application/PeerContentExchange.js that never fires
// onContentReceived — Section B's "the peer never answers" case.
class SilentPeerContentExchange {
    constructor() { this.requested = []; }
    request(peer, hash) { this.requested.push({ peer, hash }); }
    onContentReceived() { return () => {}; }
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — constructor requirements + local-only passthrough
    // ---------------------------------------------------------------
    {
        expectThrows(() => new PublicationResolutionCoordinator(null),
            '1. constructor requires a PublicationResolver');
        expectThrows(() => new PublicationResolutionCoordinator({}),
            '2. constructor requires a PublicationResolver with a resolve() method');

        // No peerContentExchange at all — still a valid, local-only
        // coordinator (see this class's own header).
        const coordinatorNoPeer = new PublicationResolutionCoordinator(new StubResolver({
            outcome: PublicationResolutionOutcome.RESOLVED, content: { x: 1 }, publication: null, reason: null
        }));
        const resolvedResult = await coordinatorNoPeer.resolve({}, {});
        assert(resolvedResult.outcome === PublicationResolutionOutcome.RESOLVED, '3. a RESOLVED result passes through unchanged');
        assert(resolvedResult.content.x === 1, '4. the RESOLVED content is exactly what the resolver returned');

        const invalidResolver = new StubResolver({
            outcome: PublicationResolutionOutcome.INVALID_PUBLICATION_SIGNATURE, content: null, publication: null, reason: 'bad signature'
        });
        const peerContentExchange = new SilentPeerContentExchange();
        const coordinatorWithPeer = new PublicationResolutionCoordinator(invalidResolver, peerContentExchange);
        const invalidResult = await coordinatorWithPeer.resolve({}, {}, { peer: { connectionId: 'p1' } });
        assert(invalidResult.outcome === PublicationResolutionOutcome.INVALID_PUBLICATION_SIGNATURE,
            '5. an INVALID_* outcome passes through unchanged, even with a peer supplied');
        assert(peerContentExchange.requested.length === 0,
            '6. a coordinator never asks a peer for anything unless the outcome is genuinely CONTENT_UNAVAILABLE');

        const unavailableResolver = new StubResolver({
            outcome: PublicationResolutionOutcome.CONTENT_UNAVAILABLE, content: null,
            publication: { contentReference: { hash: 'abc123' } }, reason: 'not here'
        });
        const coordinatorPeerless = new PublicationResolutionCoordinator(unavailableResolver, new SilentPeerContentExchange());
        const noPeerResult = await coordinatorPeerless.resolve({}, {});
        assert(noPeerResult.outcome === PublicationResolutionOutcome.CONTENT_UNAVAILABLE,
            '7. CONTENT_UNAVAILABLE with no peer supplied returns unchanged — retrieval is opt-in per call, never automatic');
        assert(unavailableResolver.calls === 1,
            '8. resolve() is called exactly once locally when no peer retrieval is attempted');
    }
    console.log('✓ Section A: constructor requirements + local-only passthrough — RESOLVED/INVALID_*/peer-less CONTENT_UNAVAILABLE all pass through unchanged');

    // ---------------------------------------------------------------
    // Section B — a peer that never answers
    // ---------------------------------------------------------------
    {
        const unavailableResolver = new StubResolver({
            outcome: PublicationResolutionOutcome.CONTENT_UNAVAILABLE, content: null,
            publication: { contentReference: { hash: 'deadbeef' } }, reason: 'not here yet'
        });
        const silentExchange = new SilentPeerContentExchange();
        const coordinator = new PublicationResolutionCoordinator(unavailableResolver, silentExchange);

        const start = Date.now();
        const result = await coordinator.resolve({}, {}, { peer: { connectionId: 'ghost' }, timeoutMs: 30 });
        const elapsed = Date.now() - start;

        assert(result.outcome === PublicationResolutionOutcome.CONTENT_UNAVAILABLE,
            '1. a timed-out peer request returns the ORIGINAL CONTENT_UNAVAILABLE result, never a different outcome');
        assert(result.reason === 'not here yet', '2. the original reason is preserved verbatim');
        assert(elapsed >= 25, '3. resolve() actually waited out the configured timeout before giving up');
        assert(silentExchange.requested.length === 1 && silentExchange.requested[0].hash === 'deadbeef',
            '4. exactly one request was sent, for the exact hash the unresolved publication names');
        assert(unavailableResolver.calls === 1,
            '5. a timed-out retrieval never triggers a second local resolve() call — nothing new arrived to re-check');
    }
    console.log('✓ Section B: a peer that never answers times out to the ORIGINAL CONTENT_UNAVAILABLE result, unchanged');

    // ---------------------------------------------------------------
    // Section C — FLAGSHIP: a real, live, authenticated connection
    // ---------------------------------------------------------------
    {
        const network = new LocalPeerNetwork();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');

        const aliceTransport = new LocalPeerConnectionProvider('alice-resolution', network);
        const bobTransport = new LocalPeerConnectionProvider('bob-resolution', network);

        const aliceConnect = new ConnectToPeerUseCase({ peerConnectionProvider: aliceTransport, identityProvider: alice });
        const stopListening = aliceConnect.listen();
        const bobConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bobTransport, identityProvider: bob });
        const bobConnectedPeer = bobConnect.connect({ candidateEndpoint: 'alice-resolution' });

        await wait(20);
        assert(bobConnectedPeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '1. setup: Bob authenticates over a real live connection');

        const verifier = new LocalAuthorizationVerifier();
        const aliceContentStore = new LocalContentStore(new InMemoryStorageProvider());
        const bobContentStore = new LocalContentStore(new InMemoryStorageProvider());
        const aliceResolver = new PublicationResolver(aliceContentStore, verifier);
        const bobResolver = new PublicationResolver(bobContentStore, verifier);

        const aliceCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const aliceExchange = new PublicationExchange(aliceCatalog, verifier);
        const bobCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const bobExchange = new PublicationExchange(bobCatalog, verifier);
        const bobAttributionStore = new LocalBlueprintAttributionStore(new InMemoryStorageProvider());

        const aliceBus = new PeerMessageBus();
        const bobBus = new PeerMessageBus();
        const alicePublicationPeerExchange = new PublicationPeerExchange(aliceExchange, aliceBus, aliceConnect.registry);
        const bobPublicationPeerExchange = new PublicationPeerExchange(bobExchange, bobBus, bobConnect.registry);
        const aliceContentExchange = new PeerContentExchange(aliceContentStore, aliceBus, aliceConnect.registry, aliceCatalog);
        const bobContentExchange = new PeerContentExchange(bobContentStore, bobBus, bobConnect.registry, bobCatalog);

        const bobCoordinator = new PublicationResolutionCoordinator(bobResolver, bobContentExchange);

        const attribution = new BlueprintAttribution({ fingerprint: 'bp:silo-2', authorIdentityId: alice.getSigningIdentity().id });
        const signedAttribution = attribution.withSignature(alice.signCanonical(attribution.getSigningDescriptor()));
        const publication = await aliceResolver.publish({ content: signedAttribution, contentKind: BLUEPRINT_ATTRIBUTION_KIND, identityProvider: alice });
        aliceCatalog.add(publication);

        alicePublicationPeerExchange.announce(publication);
        await wait(20);
        assert(bobCatalog.has(publication.id), '2. Bob catalogs the live announcement');

        const bobKindPlugin = createBlueprintAttributionPublicationKind({ verifier, store: bobAttributionStore });
        const envelope = publication.toJSON();

        const withoutPeer = await bobCoordinator.resolve(envelope, bobKindPlugin);
        assert(withoutPeer.outcome === PublicationResolutionOutcome.CONTENT_UNAVAILABLE,
            '3. with no peer supplied, the coordinator behaves exactly like calling the resolver directly');
        assert(bobAttributionStore.list('bp:silo-2').length === 0,
            '4. an unresolved attempt never imports anything into the local attribution store');

        const withPeer = await bobCoordinator.resolve(envelope, bobKindPlugin, { peer: bobConnectedPeer });
        assert(withPeer.outcome === PublicationResolutionOutcome.RESOLVED,
            '5. supplying the live peer retrieves the content and re-resolves to RESOLVED, in one call');
        assert(withPeer.content.attribution.fingerprint === 'bp:silo-2', '6. the resolved content is the correct attribution');
        assert(withPeer.content.isNew === true, '7. resolving through the coordinator still imports exactly once, via the kindPlugin\'s own store()');
        assert(bobCatalog.list().length === 1, '8. resolving never adds a second catalog entry');

        alicePublicationPeerExchange.dispose();
        bobPublicationPeerExchange.dispose();
        aliceContentExchange.dispose();
        bobContentExchange.dispose();
        stopListening();
        aliceTransport.dispose();
        bobTransport.dispose();
    }
    console.log('✓ Section C: FLAGSHIP — CONTENT_UNAVAILABLE without a peer, RESOLVED the moment a live authenticated peer is supplied, one coordinator call each way');

    // ---------------------------------------------------------------
    // Section D — PublicationResolutionView + display-only kindPlugins
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const verifier = new LocalAuthorizationVerifier();
        const contentStore = new LocalContentStore(new InMemoryStorageProvider());
        const resolver = new PublicationResolver(contentStore, verifier);
        const coordinator = new PublicationResolutionCoordinator(resolver, null);

        const { kindPlugins } = new CreatePublicationDisplayKindRegistryUseCase().execute();
        assert(kindPlugins[BLUEPRINT_ATTRIBUTION_KIND].contentKind === BLUEPRINT_ATTRIBUTION_KIND,
            '1. the BlueprintAttribution display kindPlugin is registered under its own contentKind');
        assert(kindPlugins[BLUEPRINT_ATTRIBUTION_KIND].store === undefined,
            '2. a display kindPlugin carries no store() — merely resolving it can never import anything');

        const attribution = new BlueprintAttribution({ fingerprint: 'bp:granary-3', authorIdentityId: alice.getSigningIdentity().id });
        const signedAttribution = attribution.withSignature(alice.signCanonical(attribution.getSigningDescriptor()));
        const publication = await resolver.publish({ content: signedAttribution, contentKind: BLUEPRINT_ATTRIBUTION_KIND, identityProvider: alice });

        const view = await resolvePublicationView(publication, { coordinator, kindPlugins });
        assert(view.resolved === true, '3. resolvePublicationView() resolves a known, locally-available contentKind');
        assert(view.outcome === PublicationResolutionOutcome.RESOLVED, '4. its outcome is exactly what the coordinator returned');
        assert(view.contentSummary.includes('bp:granary-3'), '5. contentSummary is built from the display kindPlugin\'s own describe()');
        assert(view.publisherIdentityId === alice.getSigningIdentity().id, '6. publisherIdentityId reads the envelope\'s own publisherIdentity, never the wrapped content');
        assert(describePublicationOutcome(view.outcome) === 'Available', '7. describePublicationOutcome() labels RESOLVED as "Available"');

        const unknownKindPublication = await resolver.publish({
            content: { toJSON: () => ({ x: 1 }) },
            contentKind: 'forkbuild.some-future-kind',
            identityProvider: alice
        });
        const unknownView = await resolvePublicationView(unknownKindPublication, { coordinator, kindPlugins });
        assert(unknownView.outcome === null && unknownView.resolved === false,
            '8. an unsupported contentKind is reported directly, never guessed at with the wrong kindPlugin');
        assert(unknownView.reason.includes('forkbuild.some-future-kind'), '9. the reason names the unsupported contentKind');
        assert(describePublicationOutcome(unknownView.outcome) === 'Unsupported publication kind',
            '10. describePublicationOutcome() labels a null outcome distinctly from every real PublicationResolutionOutcome');
    }
    console.log('✓ Section D: PublicationResolutionView derives a display-ready shape without importing anything, and reports an unsupported contentKind honestly');

    console.log('\nAll Decentralized Publication UX & Resolution tests passed.');
}

run().catch((error) => {
    console.error('PublicationResolutionCoordinator.test.js FAILED:', error);
    process.exitCode = 1;
});
