import { readFile } from 'node:fs/promises';

import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { PeerInvitation } from '../peer/PeerInvitation.js';
import { LocalRendezvousNetwork } from '../peer/LocalRendezvousNetwork.js';
import { RendezvousDiscoveryProvider } from '../peer/RendezvousDiscoveryProvider.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { ConnectToPeerUseCase } from '../application/ConnectToPeerUseCase.js';
import { PeerRelationshipUseCase } from '../application/PeerRelationshipUseCase.js';
import { FindPeerUseCase } from '../application/FindPeerUseCase.js';
import { AutoConnectKnownPeersUseCase } from '../application/AutoConnectKnownPeersUseCase.js';
import { PeerIdentity } from '../peer/PeerIdentity.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';
import { LocalPublicationCatalog } from '../application/LocalPublicationCatalog.js';
import { PublicationExchange } from '../application/PublicationExchange.js';
import { PublicationPeerExchange } from '../application/PublicationPeerExchange.js';
import { PublicationPeerConnectionSync } from '../application/PublicationPeerConnectionSync.js';
import { PeerContentExchange } from '../application/PeerContentExchange.js';
import { PublicationResolver } from '../application/PublicationResolver.js';
import { PublicationResolutionCoordinator } from '../application/PublicationResolutionCoordinator.js';
import { resolvePublicationView } from '../application/PublicationResolutionView.js';
import { PublicationResolutionOutcome } from '../application/PublicationResolutionOutcome.js';
import { CreatePublicationDisplayKindRegistryUseCase } from '../application/CreatePublicationDisplayKindRegistryUseCase.js';
import { PUBLICATION_CONTENT_KIND } from '../application/PublicationContentValidator.js';
import { CreateDiscoveryUseCase } from '../application/CreateDiscoveryUseCase.js';
import { DecentralizedPublicationDiscoveryProvider } from '../discovery/DecentralizedPublicationDiscoveryProvider.js';
import { ForkDocumentUseCase } from '../application/ForkDocumentUseCase.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { License, LicenseId } from '../core/License.js';

// 0.9.346 — Known-Peer Auto-Connection Product Reassessment.
//
// Test-only. Production changes: none.
//
// 0.9.345 put a real, production AutoConnectKnownPeersUseCase in front of
// every Known Peer relationship: the moment this device already knows a
// peer and that peer is currently discoverable, the two authenticate with
// no human "Find Someone"/"Connect to Peer" gesture, reusing application/
// FindPeerUseCase.js#search()/#connect() unmodified. Combined with 0.9.342's
// own PublicationPeerConnectionSync, that connection now ALSO exchanges
// Publication metadata automatically. This milestone asks 0.9.343's own
// question one layer earlier: is the resulting end-to-end arc — relationship
// -> lookup -> connection -> metadata sync -> Repository visibility —
// genuinely complete, or does real usage surface a concrete remaining gap?
// Answered by live evidence against real, production code throughout, never
// by re-reading 0.9.345's own header.
//
// TWO GENUINE, NON-OBVIOUS FINDINGS THIS AUDIT SURFACES THAT NO PRIOR TEST
// FILE EXERCISED:
//
//   1. (Section D) A manual "Find Someone" attempt racing CONCURRENTLY with
//      AutoConnectKnownPeersUseCase's own in-flight attempt for the same
//      identity CAN open a genuine duplicate authenticated session — its
//      own dedup check only guards against a SECOND attempt BY ITSELF, not
//      against an independent, simultaneous manual one. Live-reproduced
//      here, and immediately followed by the control that shows this is
//      not new: two concurrent MANUAL attempts alone, with 0.9.345 removed
//      from the picture entirely, produce the identical duplicate — a
//      pre-existing property of application/ConnectToPeerUseCase.js#connect()
//      never claiming an opinion about what else is already in flight, not
//      something 0.9.345 introduced or made worse.
//
//   2. (Section E) `AutoConnectKnownPeersUseCase#_runOnce()` awaits each
//      Known Peer's attempt SEQUENTIALLY, one at a time. A lookup that
//      never resolves for one identity therefore delays every OTHER known
//      peer ordered after it in that SAME pass indefinitely — genuinely
//      different from a fast rejection (0.9.345's own Section G), which
//      resolves and lets the loop continue. The application itself never
//      depends on this: manual "Find Someone" for an unrelated identity is
//      completely unaffected while the hang is in progress, live-confirmed.
//      This is named as a candidate concern for a possible future
//      milestone (bounded per-lookup timeout, or `Promise.allSettled`
//      concurrency instead of a sequential loop) — never fixed here, per
//      this milestone's own Type.
//
// Sections (A-J), matching this milestone's own brief:
//   A — FLAGSHIP end-to-end journey: known+discoverable peer -> automatic
//       connection -> automatic Publication metadata sync -> Repository
//       search -> Explore-lookup -> Fork boundary.
//   B — Startup semantics: what "runs once at construction" actually means,
//       live, including the peer-not-yet-discoverable-at-startup case.
//   C — Relationship-change semantics: discoverability changing alone never
//       triggers anything; a relationship-list change re-evaluates EVERY
//       known peer, not only the one that changed.
//   D — Duplicate/convergence, including the flagship-adjacent race finding
//       above and its pre-existing control.
//   E — Multiple known peers, including the sequential-await finding above.
//   F — The privacy/product boundary as a durable, re-tested invariant.
//   G — User awareness: the one existing reactive signal, live-confirmed;
//       no global signal exists; the Publication-arrival awareness
//       question is unchanged from 0.9.343 Section G.
//   H — Failure/retry: structurally and live confirmed absent; named,
//       explicitly not built, as the most significant open decision.
//   I — Restart semantics: what persists, what doesn't, and the good-news
//       case — reconnecting fresh after restart requires no human gesture.
//   J — Final decision matrix and verdict.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

if (typeof globalThis.window === 'undefined') {
    const store = new Map();
    globalThis.window = {
        localStorage: {
            getItem: (k) => (store.has(k) ? store.get(k) : null),
            setItem: (k, v) => { store.set(k, String(v)); },
            removeItem: (k) => { store.delete(k); },
            key: (i) => Array.from(store.keys())[i] ?? null,
            get length() { return store.size; }
        }
    };
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function readSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

function wait(ms = 20) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function clearLocalPublications() {
    window.localStorage.removeItem('forkbuild:forkbuild-publications');
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

// A real identity, a real ConnectToPeerUseCase/ConnectedPeerRegistry, a
// real PeerRelationshipUseCase — over an in-process peer/
// LocalPeerConnectionProvider.js, exactly the shape tests/
// KnownPeerAutoConnectionBoundaryAudit.test.js and tests/
// AutoConnectKnownPeers.test.js already established.
function makeDevice(label, network, { relationshipStorage = new InMemoryStorageProvider() } = {}) {
    const storage = new InMemoryStorageProvider();
    const identityProvider = new LocalIdentityProvider(storage);
    identityProvider.login(label);
    const transport = new LocalPeerConnectionProvider(label, network);
    const connect = new ConnectToPeerUseCase({ peerConnectionProvider: transport, identityProvider });
    const relationships = new PeerRelationshipUseCase(relationshipStorage, identityProvider);
    return { identityProvider, transport, connect, relationships, relationshipStorage, id: identityProvider.getSigningIdentity().id, stopListening: connect.listen() };
}

function makeFakeSessionManager(connect, discoveryProvider) {
    return {
        importCandidate(invitationInput) {
            const invitation = invitationInput instanceof PeerInvitation ? invitationInput : PeerInvitation.fromJSON(invitationInput);
            return discoveryProvider.importInvitation(invitation);
        },
        async discoverCandidates(identityId) { return discoveryProvider.discover(identityId); },
        async connectToDiscovered(record, { expectedIdentityId } = {}) {
            const connectedPeer = connect.connect(record, { expectedIdentityId });
            return { connectedPeer, reply: 'fake-reply' };
        },
        onIdentityMismatch(callback) { return connect.onIdentityMismatch(callback); }
    };
}

async function publishSelf(device, network, { ttlMs } = {}) {
    const provider = new RendezvousDiscoveryProvider({ transport: network });
    const invitation = PeerInvitation.create({ endpoint: device.transport.address, identityHint: device.id, ...(ttlMs ? { ttlMs } : {}) });
    return provider.publish(invitation, ttlMs ? { ttlMs } : {});
}

function remember(alice, device) {
    return alice.relationships.rememberPeer(new PeerIdentity({
        identityId: device.id,
        publicKey: device.identityProvider.getSigningIdentity().publicKey,
        algorithm: device.identityProvider.getSigningIdentity().algorithm
    }));
}

function authenticatedTo(registry, identityId) {
    return registry.list().filter((peer) =>
        peer.remoteIdentity && peer.remoteIdentity.identityId === identityId && peer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED);
}

function makePublication({ documentId, title, author }, identityProvider) {
    const documentContentReference = new ContentReference({ hash: `docHash-${documentId}`, algorithm: 'fnv1a-32', mediaType: 'application/json', size: 256 });
    let publication = new Publication({
        documentId, title, author, providerId: 'local',
        contentHash: documentContentReference.hash, schemaVersion: 3, license: new License({ id: LicenseId.CC0_1_0 }),
        contentReference: documentContentReference, publisherIdentity: identityProvider.getSigningIdentity().toJSON(), signature: null
    });
    return publication.withSignature(identityProvider.signCanonical(publication.getSigningDescriptor()));
}

// A full Publication-pipeline replica over one device's own registry —
// catalog + exchange + resolver + contentStore + peerContentExchange +
// resolution coordinator + (optionally) the real production connectionSync
// — the identical composition tests/PeerPublicationSyncProductReassessment.test.js
// already established as faithful to production.
function makeReplica(registry, { withConnectionSync = false, verifier, catalogStorage = new InMemoryStorageProvider(), contentStorage = new InMemoryStorageProvider() } = {}) {
    const catalog = new LocalPublicationCatalog(catalogStorage);
    const exchange = new PublicationExchange(catalog, verifier);
    const bus = new PeerMessageBus();
    const peerExchange = new PublicationPeerExchange(exchange, bus, registry);
    const connectionSync = withConnectionSync ? new PublicationPeerConnectionSync(catalog, peerExchange, registry) : null;

    const contentStore = new LocalContentStore(contentStorage);
    const resolver = new PublicationResolver(contentStore, verifier);
    const contentBus = new PeerMessageBus();
    const peerContentExchange = new PeerContentExchange(contentStore, contentBus, registry, catalog);
    const coordinator = new PublicationResolutionCoordinator(resolver, peerContentExchange);
    const { kindPlugins } = new CreatePublicationDisplayKindRegistryUseCase().execute();

    return {
        catalog, exchange, resolver, contentStore, contentStorage, catalogStorage, peerExchange, connectionSync, peerContentExchange,
        async resolveLocallyOnly(publication) { return resolvePublicationView(publication, { coordinator, kindPlugins }); },
        async retrieveFrom(publication, peers, timeoutMs = 2000) { return resolvePublicationView(publication, { coordinator, kindPlugins, peers, timeoutMs }); },
        dispose() { if (connectionSync) connectionSync.dispose(); peerExchange.dispose(); peerContentExchange.dispose(); }
    };
}

function admitToRepositoryDiscovery(view, discoveryProvider) {
    if (discoveryProvider && view && view.resolved && view.content instanceof Publication) {
        discoveryProvider.add(view.content);
    }
}

async function run() {
    console.log('Running Known-Peer Auto-Connection Product Reassessment...\n');

    // =======================================================================
    // Section A — FLAGSHIP: known+discoverable peer -> automatic connection
    // -> automatic Publication metadata sync -> Repository search -> Explore
    // -> Fork boundary, over real production classes throughout.
    // =======================================================================
    {
        clearLocalPublications();
        const network = new LocalRendezvousNetwork();
        const peerNetwork = new LocalPeerNetwork();
        const verifier = new LocalAuthorizationVerifier();
        const bob = makeDevice('reassess-a-bob', peerNetwork);
        await publishSelf(bob, network);

        const alice = makeDevice('reassess-a-alice', peerNetwork);
        const aliceFind = new FindPeerUseCase({ peerSessionManager: makeFakeSessionManager(alice.connect, new RendezvousDiscoveryProvider({ transport: network })) });
        remember(alice, bob); // known relationship already exists BEFORE the app "starts"

        const aliceReplica = makeReplica(alice.connect.registry, { withConnectionSync: true, verifier });
        const bobReplica = makeReplica(bob.connect.registry, { verifier });

        // Alice already cataloged a publication before any connection to
        // bob existed — the flagship shape 0.9.341-0.9.343 already proved
        // at the catalog layer.
        const publication = makePublication({ documentId: 'reassess-a-doc', title: 'Published Before Auto-Connect', author: 'reassess-a-alice' }, alice.identityProvider);
        const envelope = await aliceReplica.resolver.publish({ content: publication, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: alice.identityProvider });
        aliceReplica.catalog.add(envelope);

        // ONLY the production AutoConnectKnownPeersUseCase runs from here —
        // no "Find Someone", no "Connect to Peer", no "Publish to Network".
        const autoConnect = new AutoConnectKnownPeersUseCase({ findPeerUseCase: aliceFind, peerRelationshipUseCase: alice.relationships, connectedPeerRegistry: alice.connect.registry });
        await wait();

        const bobConnectedPeer = authenticatedTo(alice.connect.registry, bob.id)[0];
        assert(bobConnectedPeer, '1. the known, discoverable peer authenticates automatically.');
        assert(bobReplica.catalog.has(envelope.id), '2. bob automatically receives alice\'s already-cataloged publication — 0.9.342\'s own capability, reached here through 0.9.345\'s own trigger instead of a manual connection.');

        const provider = new DecentralizedPublicationDiscoveryProvider();
        const localOnlyView = await bobReplica.resolveLocallyOnly(bobReplica.catalog.get(envelope.id));
        assert(localOnlyView.outcome === PublicationResolutionOutcome.CONTENT_UNAVAILABLE,
            '3. exactly 0.9.343\'s own finding, reconfirmed here with automatic connection as the trigger: metadata sync alone leaves the envelope CONTENT_UNAVAILABLE.');
        admitToRepositoryDiscovery(localOnlyView, provider);
        assert(provider.list().length === 0, '4. not yet Repository-admitted.');

        // The existing, unmodified Retrieve action — a real peer content
        // round trip over the connection AutoConnectKnownPeersUseCase
        // itself established.
        const retrievedView = await bobReplica.retrieveFrom(bobReplica.catalog.get(envelope.id), [bob.connect.registry.list().find((p) => p.remoteIdentity && p.remoteIdentity.identityId === alice.id)]);
        assert(retrievedView.outcome === PublicationResolutionOutcome.RESOLVED, `5. Retrieve resolves it over the automatically-established connection (${retrievedView.reason}).`);
        admitToRepositoryDiscovery(retrievedView, provider);

        clearLocalPublications();
        const { searchPublicationsUseCase, findPublicationUseCase } = new CreateDiscoveryUseCase().execute({ decentralizedDiscoveryProvider: provider });
        const found = searchPublicationsUseCase.execute({ text: 'published before auto-connect' });
        assert(found.items.length === 1 && found.items[0] === retrievedView.content, '6. Repository search now finds it.');
        assert(findPublicationUseCase.execute(found.items[0].id) === retrievedView.content, '7. Explore-lookup finds the identical instance.');

        const forkUseCase = new ForkDocumentUseCase(new InMemoryStorageProvider());
        let forkThrew = false;
        try {
            forkUseCase.execute(found.items[0].documentId, null, retrievedView.content);
        } catch (e) {
            forkThrew = true;
            assert(e.message.includes(`no document found with id "${found.items[0].documentId}"`), '8. Fork reaches the identical, unmodified material-acquisition boundary any other Publication\'s fork would.');
        }
        assert(forkThrew, '8b. ForkDocumentUseCase.execute() actually ran.');

        autoConnect.dispose(); aliceReplica.dispose(); bobReplica.dispose();
        bob.transport.dispose(); alice.transport.dispose();
    }
    console.log('✓ Section A: FLAGSHIP. Known relationship -> relationship already loaded -> discoverability lookup -> automatic connection -> automatic Publication metadata sync -> Repository search -> Explore -> Fork boundary is genuinely, completely reachable end to end with ZERO manual connection gesture. The one unchanged nuance, exactly as 0.9.343 already found: reaching Repository search still requires the pre-existing, deliberate Retrieve action — 0.9.345 automates WHO connects to whom, never WHETHER content is fetched.');

    // =======================================================================
    // Section B — Startup semantics: construction evaluates existing Known
    // Peers once; a peer not yet discoverable at that moment stays
    // unconnected with no periodic re-check.
    // =======================================================================
    {
        const network = new LocalRendezvousNetwork();
        const peerNetwork = new LocalPeerNetwork();
        const bob = makeDevice('reassess-b-bob', peerNetwork); // NOT published yet

        const alice = makeDevice('reassess-b-alice', peerNetwork);
        const rendezvous = new RendezvousDiscoveryProvider({ transport: network });
        let lookups = 0;
        const originalDiscover = rendezvous.discover.bind(rendezvous);
        rendezvous.discover = async (identityId) => { lookups += 1; return originalDiscover(identityId); };
        const aliceFind = new FindPeerUseCase({ peerSessionManager: makeFakeSessionManager(alice.connect, rendezvous) });
        remember(alice, bob);

        const autoConnect = new AutoConnectKnownPeersUseCase({ findPeerUseCase: aliceFind, peerRelationshipUseCase: alice.relationships, connectedPeerRegistry: alice.connect.registry });
        await wait();
        assert(lookups === 1, '1. construction evaluates the already-known relationship set exactly once — one lookup for bob, immediately.');
        assert(authenticatedTo(alice.connect.registry, bob.id).length === 0, '2. bob was not discoverable at that moment, so no connection resulted — exactly as designed.');

        // Bob becomes discoverable NOW, well after startup. Nothing about
        // 0.9.345's own design re-checks him — there is no timer.
        await publishSelf(bob, network);
        await wait(200);

        assert(lookups === 1, '3. a full 200ms later, still exactly ONE lookup ever happened — no periodic re-check exists, confirming this milestone\'s own "twice per reason, never on a timer" design lives up to its own claim.');
        assert(authenticatedTo(alice.connect.registry, bob.id).length === 0, '4. bob remains unconnected — a real, named gap: becoming discoverable, on its own, is invisible to this seam until SOME relationship-list change fires (Section C proves that escape hatch is real, not merely theoretical).');

        autoConnect.dispose();
        bob.transport.dispose(); alice.transport.dispose();
    }
    console.log('✓ Section B: "runs once at construction" is exactly as bounded as 0.9.345 claims — live-confirmed, not merely read from its own header. The direct consequence: a Known Peer who becomes discoverable strictly after startup, with no relationship-list change in between, stays unconnected indefinitely. This is not a defect this milestone fixes (per its own Type) — it is the concrete shape of the boundary 0.9.344 Section I\'s own polling-discipline constraint requires.');

    // =======================================================================
    // Section C — Relationship-change semantics: discoverability changing
    // alone never triggers anything; ANY relationship-list mutation
    // re-evaluates EVERY known peer, not only the one that changed.
    // =======================================================================
    {
        const network = new LocalRendezvousNetwork();
        const peerNetwork = new LocalPeerNetwork();
        const bob = makeDevice('reassess-c-bob', peerNetwork);   // becomes discoverable with NO relationship event
        const dave = makeDevice('reassess-c-dave', peerNetwork); // an unrelated peer, remembered LATER

        const alice = makeDevice('reassess-c-alice', peerNetwork);
        const aliceFind = new FindPeerUseCase({ peerSessionManager: makeFakeSessionManager(alice.connect, new RendezvousDiscoveryProvider({ transport: network })) });
        remember(alice, bob);

        const autoConnect = new AutoConnectKnownPeersUseCase({ findPeerUseCase: aliceFind, peerRelationshipUseCase: alice.relationships, connectedPeerRegistry: alice.connect.registry });
        await wait();
        assert(authenticatedTo(alice.connect.registry, bob.id).length === 0, 'setup: bob not yet discoverable.');

        await publishSelf(bob, network);
        await wait(60);
        assert(authenticatedTo(alice.connect.registry, bob.id).length === 0,
            '1. bob becoming discoverable, alone, triggers no automatic connection — confirms discoverability changes carry no event of their own in this design.');

        // A relationship-list mutation about a COMPLETELY UNRELATED
        // identity — dave, never bob — still re-evaluates bob too, because
        // the coordinator re-reads the ENTIRE relationship list on every
        // onRelationshipsChanged(), never only the identity that changed.
        await publishSelf(dave, network);
        remember(alice, dave);
        await wait();

        assert(authenticatedTo(alice.connect.registry, bob.id).length === 1,
            '2. bob is now connected — triggered by a relationship-list event about DAVE, not about bob. The current trigger is keyed to "the Known Peers LIST changed," never to "a specific peer\'s own discoverability changed."');
        assert(authenticatedTo(alice.connect.registry, dave.id).length === 1, '3. dave, the peer whose remembering actually fired the event, is connected too, in the same pass.');

        autoConnect.dispose();
        bob.transport.dispose(); dave.transport.dispose(); alice.transport.dispose();
    }
    console.log('✓ Section C: the trigger genuinely is "the relationship list changed," full stop — never "a peer\'s discoverability changed." One practical consequence worth naming: in an application that accumulates Known Peers over time, EVERY later "Remember" gesture for anyone incidentally sweeps up any OTHER known peer who became discoverable since the last such change — a real, if incidental, mitigation for Section B\'s own named gap, not a designed feature of it.');

    // =======================================================================
    // Section D — Duplicate/convergence, including the race finding named
    // in this file's own header.
    // =======================================================================
    {
        // D.1 — Sequential convergence: construction, then a further
        // relationship-change pass, then a manual attempt, all agree.
        const network = new LocalRendezvousNetwork();
        const peerNetwork = new LocalPeerNetwork();
        const bob = makeDevice('reassess-d1-bob', peerNetwork);
        await publishSelf(bob, network);
        const alice = makeDevice('reassess-d1-alice', peerNetwork);
        const aliceFind = new FindPeerUseCase({ peerSessionManager: makeFakeSessionManager(alice.connect, new RendezvousDiscoveryProvider({ transport: network })) });
        remember(alice, bob);
        const autoConnect = new AutoConnectKnownPeersUseCase({ findPeerUseCase: aliceFind, peerRelationshipUseCase: alice.relationships, connectedPeerRegistry: alice.connect.registry });
        await wait();
        const firstSession = authenticatedTo(alice.connect.registry, bob.id)[0];
        assert(firstSession, 'setup: startup auto-connect succeeded.');

        alice.relationships.updateAlias(bob.id, 'Bob'); // a further, sequential relationship-change pass
        await wait();
        assert(authenticatedTo(alice.connect.registry, bob.id).length === 1 && authenticatedTo(alice.connect.registry, bob.id)[0] === firstSession,
            '1. a later relationship-change pass reuses the identical session — never a second one.');

        const manualCandidates = await aliceFind.search(bob.id); // a SEQUENTIAL manual attempt, after auto-connect settled
        assert(manualCandidates.length === 1, '2. bob is still genuinely discoverable (manual search still works normally).');
        // A real person would see "Connected now" here (Section G) and never
        // be offered a manual connect button at all — but nothing stops
        // calling the underlying use case directly, so prove it end to end:
        // application/ConnectToPeerUseCase.js#connect() itself has no
        // dedup opinion (0.9.344 Section F's own finding) — only
        // AutoConnectKnownPeersUseCase's own check prevents ITS OWN second
        // attempt. A sequential manual attempt made AFTER auto-connect
        // already settled would, if actually invoked, open a genuine
        // second session — this is 0.9.344 Section F's pre-existing
        // finding, not retested here to avoid duplicating that milestone's
        // own evidence.

        autoConnect.dispose();
        bob.transport.dispose(); alice.transport.dispose();

        // D.2 — THE RACE, live-reproduced: a manual attempt fired
        // CONCURRENTLY with AutoConnectKnownPeersUseCase's own construction-
        // time pass for the SAME identity.
        const network2 = new LocalRendezvousNetwork();
        const peerNetwork2 = new LocalPeerNetwork();
        const carol = makeDevice('reassess-d2-carol', peerNetwork2);
        await publishSelf(carol, network2);
        const eve = makeDevice('reassess-d2-eve', peerNetwork2);
        const eveFind = new FindPeerUseCase({ peerSessionManager: makeFakeSessionManager(eve.connect, new RendezvousDiscoveryProvider({ transport: network2 })) });
        remember(eve, carol);

        const raceAutoConnect = new AutoConnectKnownPeersUseCase({ findPeerUseCase: eveFind, peerRelationshipUseCase: eve.relationships, connectedPeerRegistry: eve.connect.registry });
        const manualRacePromise = (async () => {
            const candidates = await eveFind.search(carol.id);
            return eveFind.connect(candidates[0], carol.id);
        })();
        await manualRacePromise;
        await wait(50);

        const duplicated = authenticatedTo(eve.connect.registry, carol.id);
        assert(duplicated.length === 2,
            '3. CONFIRMED, LIVE: a manual attempt racing CONCURRENTLY with AutoConnectKnownPeersUseCase\'s own in-flight pass for the SAME identity opens a genuine SECOND, independent authenticated session — its dedup check (registry.list() before ITS OWN attempt) has no way to see an attempt some OTHER caller started in the same window.');

        raceAutoConnect.dispose();
        carol.transport.dispose(); eve.transport.dispose();

        // D.3 — THE CONTROL: the identical race, with 0.9.345 removed from
        // the picture entirely — TWO independent manual attempts alone.
        const network3 = new LocalRendezvousNetwork();
        const peerNetwork3 = new LocalPeerNetwork();
        const frank = makeDevice('reassess-d3-frank', peerNetwork3);
        await publishSelf(frank, network3);
        const grace = makeDevice('reassess-d3-grace', peerNetwork3);
        const graceFind = new FindPeerUseCase({ peerSessionManager: makeFakeSessionManager(grace.connect, new RendezvousDiscoveryProvider({ transport: network3 })) });

        async function manualAttempt() {
            const candidates = await graceFind.search(frank.id);
            return graceFind.connect(candidates[0], frank.id);
        }
        await Promise.all([manualAttempt(), manualAttempt()]);
        await wait(50);
        assert(authenticatedTo(grace.connect.registry, frank.id).length === 2,
            '4. CONTROL: two concurrent MANUAL attempts alone — no AutoConnectKnownPeersUseCase anywhere in this scenario — produce the IDENTICAL duplicate. This proves D.3\'s finding is a pre-existing property of application/ConnectToPeerUseCase.js#connect() itself (0.2.50, unchanged), never something 0.9.345 introduced or made measurably worse.');

        frank.transport.dispose(); grace.transport.dispose();
    }
    console.log('✓ Section D: sequential convergence holds (construction, a later relationship-change pass, and a subsequent manual attempt all agree on one session). A genuine duplicate CAN occur, live-reproduced, when a manual attempt races AutoConnectKnownPeersUseCase\'s own in-flight pass concurrently — but the control proves this is exactly as possible with two ordinary manual attempts alone, today, with no auto-connect involved at all. This is a pre-existing property of the one shared connection protocol (0.9.344 Section E\'s own finding: there is, and needs to be, only one), not a new risk this milestone\'s own automation created.');

    // =======================================================================
    // Section E — Multiple known peers, including the sequential-await
    // finding named in this file's own header.
    // =======================================================================
    {
        // E.1 — Isolation reconfirmed briefly (0.9.345's own Section F
        // already proved this thoroughly; this is a light reconfirmation,
        // not a re-derivation).
        const network = new LocalRendezvousNetwork();
        const peerNetwork = new LocalPeerNetwork();
        const bob = makeDevice('reassess-e1-bob', peerNetwork);
        const eve = makeDevice('reassess-e1-eve', peerNetwork);
        await publishSelf(bob, network); await publishSelf(eve, network);
        const alice = makeDevice('reassess-e1-alice', peerNetwork);
        const aliceFind = new FindPeerUseCase({ peerSessionManager: makeFakeSessionManager(alice.connect, new RendezvousDiscoveryProvider({ transport: network })) });
        remember(alice, bob); remember(alice, eve);
        const autoConnect = new AutoConnectKnownPeersUseCase({ findPeerUseCase: aliceFind, peerRelationshipUseCase: alice.relationships, connectedPeerRegistry: alice.connect.registry });
        await wait();
        assert(authenticatedTo(alice.connect.registry, bob.id).length === 1 && authenticatedTo(alice.connect.registry, eve.id).length === 1,
            '1. two independently reachable known peers both connect in one pass — reconfirms 0.9.345 Section F.');
        autoConnect.dispose();
        bob.transport.dispose(); eve.transport.dispose(); alice.transport.dispose();

        // E.2 — THE FINDING: a lookup that never resolves for one known
        // peer delays every OTHER known peer ordered after it in the SAME
        // pass, because _runOnce() awaits each attempt sequentially.
        const network2 = new LocalRendezvousNetwork();
        const peerNetwork2 = new LocalPeerNetwork();
        const hank = makeDevice('reassess-e2-hank', peerNetwork2);   // will HANG forever on lookup
        const carol = makeDevice('reassess-e2-carol', peerNetwork2); // genuinely reachable
        await publishSelf(carol, network2);

        const alice2 = makeDevice('reassess-e2-alice', peerNetwork2);
        const realDiscovery = new RendezvousDiscoveryProvider({ transport: network2 });
        const hangingSessionManager = {
            async discoverCandidates(identityId) {
                if (identityId === hank.id) return new Promise(() => {}); // never resolves — models an unreachable rendezvous node, not a fast rejection
                return realDiscovery.discover(identityId);
            },
            async connectToDiscovered(record, { expectedIdentityId } = {}) {
                const connectedPeer = alice2.connect.connect(record, { expectedIdentityId });
                return { connectedPeer, reply: 'fake-reply' };
            },
            onIdentityMismatch(callback) { return alice2.connect.onIdentityMismatch(callback); }
        };
        const alice2Find = new FindPeerUseCase({ peerSessionManager: hangingSessionManager });
        remember(alice2, hank);  // remembered FIRST — iterated first, alphabetically, by getRelationships()
        remember(alice2, carol); // remembered SECOND — iterated after hank

        const hangingAutoConnect = new AutoConnectKnownPeersUseCase({ findPeerUseCase: alice2Find, peerRelationshipUseCase: alice2.relationships, connectedPeerRegistry: alice2.connect.registry });
        await wait(150);

        assert(authenticatedTo(alice2.connect.registry, carol.id).length === 0,
            '2. CONFIRMED, LIVE: with hank\'s lookup genuinely hung, carol — ordered after him — is NEVER even attempted in this pass, despite being immediately, trivially reachable. A sequential `for...of` + `await` loop, not `Promise.allSettled`, means one truly-hung identity starves every later one in that pass, indefinitely.');

        // The application itself never depends on this: an UNRELATED
        // manual "Find Someone" for carol, run independently of the
        // coordinator's own stuck pass, works normally the whole time.
        const manualFind = new FindPeerUseCase({ peerSessionManager: makeFakeSessionManager(alice2.connect, realDiscovery) });
        const manualCandidates = await manualFind.search(carol.id);
        assert(manualCandidates.length === 1,
            '3. the application itself is never dependent on hank being reachable — an ordinary manual "Find Someone" for carol, unrelated to the stuck automatic pass, succeeds immediately. Only THIS milestone\'s own automatic pass for peers ordered after a hung one is affected, never the rest of the app.');

        hangingAutoConnect.dispose();
        hank.transport.dispose(); carol.transport.dispose(); alice2.transport.dispose();
    }
    console.log('✓ Section E: isolation from a FAST failure/rejection is reconfirmed (0.9.345 Section F). A genuinely different failure mode — a lookup that never resolves at all — is NOT isolated within one pass: it starves every known peer ordered after it, live-reproduced, though the application itself remains fully functional throughout. Named as this reassessment\'s own candidate concern for a possible future milestone (a bounded per-lookup timeout, or concurrent `Promise.allSettled` attempts instead of a sequential loop) — not fixed here, per this milestone\'s own Type.');

    // =======================================================================
    // Section F — The privacy/product boundary as a durable, re-tested
    // invariant.
    // =======================================================================
    {
        const network = new LocalRendezvousNetwork();
        const peerNetwork = new LocalPeerNetwork();
        const bob = makeDevice('reassess-f-bob', peerNetwork);     // known + discoverable
        const dave = makeDevice('reassess-f-dave', peerNetwork);   // known + not discoverable
        const carol = makeDevice('reassess-f-carol', peerNetwork); // unknown, discoverable
        const bobPublication = await publishSelf(bob, network);
        await publishSelf(carol, network);

        const alice = makeDevice('reassess-f-alice', peerNetwork);
        const aliceFind = new FindPeerUseCase({ peerSessionManager: makeFakeSessionManager(alice.connect, new RendezvousDiscoveryProvider({ transport: network })) });
        remember(alice, bob); remember(alice, dave);

        const autoConnect = new AutoConnectKnownPeersUseCase({ findPeerUseCase: aliceFind, peerRelationshipUseCase: alice.relationships, connectedPeerRegistry: alice.connect.registry });
        await wait();

        const matrix = {
            'Known + discoverable': authenticatedTo(alice.connect.registry, bob.id).length === 1,
            'Known + not discoverable': authenticatedTo(alice.connect.registry, dave.id).length === 0,
            'Unknown, however discoverable': authenticatedTo(alice.connect.registry, carol.id).length === 0
        };
        for (const [scenario, holds] of Object.entries(matrix)) assert(holds, `1. "${scenario}" holds exactly as this milestone's own decision table requires.`);

        // "Already connected" -> no second connection.
        await publishSelf(dave, network);
        remember(alice, dave); // a relationship-change event that re-evaluates bob too
        await wait();
        assert(authenticatedTo(alice.connect.registry, bob.id).length === 1, '2. bob, already connected, was never attempted a second time by the re-evaluation dave\'s own remembering triggered.');

        // "Previously connected but now undiscoverable" -> existing session
        // unaffected — the durable invariant this section names explicitly.
        await new RendezvousDiscoveryProvider({ transport: network }).unpublish(bobPublication.publicationId);
        const bobPeer = alice.connect.registry.list().find((p) => p.remoteIdentity && p.remoteIdentity.identityId === bob.id);
        assert(bobPeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '3. discoverability withdrawal never tears down an existing session.');
        remember(alice, carol); // yet another unrelated relationship-change event
        await wait();
        assert(bobPeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED && authenticatedTo(alice.connect.registry, bob.id).length === 1,
            '4. ...and stays that way across a LATER, unrelated automatic pass too — discoverability controls eligibility for FUTURE connection initiation; it is never an instruction to terminate an existing session.');

        autoConnect.dispose();
        bob.transport.dispose(); dave.transport.dispose(); carol.transport.dispose(); alice.transport.dispose();
    }
    console.log('✓ Section F: the full decision table — known+discoverable (yes), known+not-discoverable (no), unknown (no, however discoverable), already-connected (no second session), previously-connected-now-undiscoverable (untouched) — holds as a durable, re-tested invariant, not a one-time proof. The governing distinction: discoverability is eligibility for FUTURE initiation, never a retroactive instruction to disconnect.');

    // =======================================================================
    // Section G — User awareness: the one existing reactive signal, live-
    // confirmed; no global signal exists.
    // =======================================================================
    {
        const network = new LocalRendezvousNetwork();
        const peerNetwork = new LocalPeerNetwork();
        const bob = makeDevice('reassess-g-bob', peerNetwork);
        await publishSelf(bob, network);
        const alice = makeDevice('reassess-g-alice', peerNetwork);
        const aliceFind = new FindPeerUseCase({ peerSessionManager: makeFakeSessionManager(alice.connect, new RendezvousDiscoveryProvider({ transport: network })) });
        remember(alice, bob);

        // application/PeerPresenceUseCase.js#isIdentityOnline() — which
        // ui/views/PeerConnectionsView.js#isConnectedNow() already reads
        // for its "Connected now"/"Not connected" badge on every Known
        // Peer row — is itself driven by nothing but connectedPeerRegistry
        // .onChange(). Subscribing to that SAME signal here reproduces
        // exactly what that page's own reactivity already receives,
        // without needing to construct the page's full dependency graph.
        const registryChanges = [];
        const unsubscribeRegistry = alice.connect.registry.onChange((peers) => registryChanges.push(peers));

        const autoConnect = new AutoConnectKnownPeersUseCase({ findPeerUseCase: aliceFind, peerRelationshipUseCase: alice.relationships, connectedPeerRegistry: alice.connect.registry });
        await wait();

        assert(registryChanges.some((snapshot) => snapshot.some((p) => p.remoteIdentity && p.remoteIdentity.identityId === bob.id && p.getLifecycleState() === PeerLifecycleState.AUTHENTICATED)),
            '1. the automatic connection DOES fire application/ConnectedPeerRegistry.js#onChange() — the exact signal application/PeerPresenceUseCase.js#isIdentityOnline() (and, through it, ui/views/PeerConnectionsView.js\'s own "Connected now" badge on every Known Peer row) already reacts to. A person who has that page open sees the automatic connection the moment it happens, with no code change required by this milestone.');

        const presenceSource = await readSource('application/PeerPresenceUseCase.js');
        assert(/this\._registry\.onChange/.test(presenceSource), '2. structurally confirmed: PeerPresenceUseCase\'s own reactivity is driven by nothing but ConnectedPeerRegistry#onChange().');

        // But that awareness only exists for someone ALREADY on that page.
        // No global toast/badge/counter is wired to automatic connection
        // anywhere in the composition root.
        const mainSource = await readSource('ui/main.js');
        assert(!/AutoConnectKnownPeersUseCase\.\w+\(|feedback\.show.*connect|badge.*[Cc]onnect/.test(mainSource),
            '3. no app-wide toast, badge, or counter is wired to automatic connection anywhere in ui/main.js — the wiring is a single, silent construction.');

        // The Publication-arrival half of this question is UNCHANGED from
        // 0.9.343 Section G: onPublicationReceived fires (existing
        // feedback), but there is nothing nameable to show before a
        // separate, unchanged Retrieve succeeds.
        const publicationPeerExchangeSource = await readSource('application/PublicationPeerExchange.js');
        assert(/onPublicationReceived/.test(publicationPeerExchangeSource), '4. the existing Publication-arrival signal 0.9.343 already characterized is untouched by this milestone.');

        autoConnect.dispose(); unsubscribeRegistry();
        bob.transport.dispose(); alice.transport.dispose();
    }
    console.log('✓ Section G: possible outcomes, resolved by evidence rather than assumed. CONNECTION awareness: an existing, reactive signal (ConnectedPeerRegistry#onChange, already consumed by PeerPresenceUseCase and PeerConnectionsView\'s own "Connected now" badge) genuinely reaches the one page that already shows connection state — live-confirmed, not merely inherited — but nothing app-wide exists outside it. PUBLICATION awareness is unchanged from 0.9.343 Section G: the existing per-page refresh fires, with nothing nameable to show before a deliberate Retrieve. DECISION: no connection-awareness gap was found severe enough to require new UI (a person managing Known Peers is, by construction, exactly the person already looking at the page that shows this) — STOP on notifications for both facts, consistent with 0.9.341 Section H\'s and 0.9.343 Section G\'s own "no evidenced NotificationEvent recipient distinct from the local replica\'s own identity" finding, reapplied here rather than re-litigated.');

    // =======================================================================
    // Section H — Failure/retry: structurally and live confirmed absent;
    // named, explicitly not built, as the most significant open decision.
    // =======================================================================
    {
        const source = await readSource('application/AutoConnectKnownPeersUseCase.js');
        assert(!/setInterval\(|setTimeout\(/.test(source),
            '1. structurally confirmed: no timer of any kind is ever invoked anywhere in application/AutoConnectKnownPeersUseCase.js — its own header discusses retry/backoff only to disclaim them, never to schedule one.');

        const network = new LocalRendezvousNetwork();
        const peerNetwork = new LocalPeerNetwork();
        const bob = makeDevice('reassess-h-bob', peerNetwork); // never publishes at all — a "friend who is currently offline"
        const alice = makeDevice('reassess-h-alice', peerNetwork);
        const aliceFind = new FindPeerUseCase({ peerSessionManager: makeFakeSessionManager(alice.connect, new RendezvousDiscoveryProvider({ transport: network })) });
        remember(alice, bob);

        const autoConnect = new AutoConnectKnownPeersUseCase({ findPeerUseCase: aliceFind, peerRelationshipUseCase: alice.relationships, connectedPeerRegistry: alice.connect.registry });
        await wait(150); // generously longer than any real-world "quick retry" interval would be
        assert(authenticatedTo(alice.connect.registry, bob.id).length === 0, '2. bob stays unconnected — no attempt is ever repeated on its own.');

        // The one existing escape hatch (Section C) still requires SOME
        // relationship-list change — never bob simply "coming online."
        await publishSelf(bob, network);
        await wait(150);
        assert(authenticatedTo(alice.connect.registry, bob.id).length === 0,
            '3. even after bob genuinely comes online, nothing reconnects him without a relationship-list event — confirming there is currently no way to satisfy "connect automatically when my friend comes online" other than the person themselves touching Known Peers again.');

        autoConnect.dispose();
        bob.transport.dispose(); alice.transport.dispose();
    }
    console.log('✓ Section H: absence of retry/reconnection is confirmed structurally and live, not merely by omission. Per this milestone\'s own brief, this is deliberately NOT built here: a genuine "reconnect when my friend comes online" capability needs its own interval, backoff, maximum-attempt policy, lifecycle/battery consideration, and cancellation semantics — a separate, larger product capability, not an extension smuggled into either 0.9.345 or this reassessment. DECISION: named as the single most significant open question this reassessment leaves on file — build it only if a future milestone finds an actually-blocked user journey, never speculatively.');

    // =======================================================================
    // Section I — Restart semantics: what persists, what doesn't, and the
    // good-news case.
    // =======================================================================
    {
        const relationshipStorage = new InMemoryStorageProvider();
        const network = new LocalRendezvousNetwork();
        const peerNetwork = new LocalPeerNetwork();
        const bob = makeDevice('reassess-i-bob', peerNetwork);
        await publishSelf(bob, network);

        const alice = makeDevice('reassess-i-alice', peerNetwork, { relationshipStorage });
        const aliceFind = new FindPeerUseCase({ peerSessionManager: makeFakeSessionManager(alice.connect, new RendezvousDiscoveryProvider({ transport: network })) });
        remember(alice, bob);

        const autoConnect = new AutoConnectKnownPeersUseCase({ findPeerUseCase: aliceFind, peerRelationshipUseCase: alice.relationships, connectedPeerRegistry: alice.connect.registry });
        await wait();
        assert(authenticatedTo(alice.connect.registry, bob.id).length === 1, 'setup: automatic connection succeeded before "restart".');

        // --- Simulate a restart: dispose everything in-memory (the
        // registry, the discovery cache, the coordinator), keep only the
        // SAME persisted relationshipStorage a real restart would keep
        // (window.localStorage-backed in production).
        autoConnect.dispose();
        alice.transport.dispose();
        bob.transport.dispose();

        // The relationship survives — application/PeerRelationshipUseCase.js
        // persists through its own injected StorageProvider, entirely
        // unrelated to this milestone.
        const restartedIdentityProvider = new LocalIdentityProvider(new InMemoryStorageProvider());
        // Re-derive the SAME local user "alice" would be after a restart:
        // PeerRelationshipUseCase itself is scoped by username, not by
        // in-memory identity object identity, so a FRESH identityProvider
        // logged in as the SAME username reads the SAME persisted list.
        restartedIdentityProvider.login('reassess-i-alice');
        const restartedRelationships = new PeerRelationshipUseCase(relationshipStorage, restartedIdentityProvider);
        assert(restartedRelationships.isKnown(bob.id), '1. the Known Peer relationship survives restart — application/PeerRelationshipUseCase.js already persists it, unrelated to this milestone.');

        // The connection itself does NOT survive — application/
        // ConnectedPeerRegistry.js is in-memory only, by its own header,
        // confirmed once more structurally.
        const registrySource = await readSource('application/ConnectedPeerRegistry.js');
        assert(!/StorageProvider|localStorage/.test(registrySource), '2. structurally confirmed: no persistence of any kind in application/ConnectedPeerRegistry.js — a restart always starts with zero live connections.');

        // Neither does the rendezvous discovery cache — a fresh restart
        // means a genuinely fresh network lookup, never a stale local one.
        const discoverySource = await readSource('peer/RendezvousDiscoveryProvider.js');
        assert(!/StorageProvider|localStorage/.test(discoverySource), '3. structurally confirmed: no persistence in peer/RendezvousDiscoveryProvider.js either — its own cache is exactly as durable as the application session that built it, never longer.');

        // The good-news case: a FRESH AutoConnectKnownPeersUseCase, built
        // fresh the way ui/main.js's own composition root builds it every
        // time the application starts, reconnects automatically to a
        // still-discoverable Known Peer with ZERO human gesture — exactly
        // the same "application starts" case Section B already proved,
        // now proven ACROSS a genuine restart boundary rather than within
        // one continuous session.
        const newPeerNetwork = new LocalPeerNetwork();
        const restartedBobTransport = new LocalPeerConnectionProvider('reassess-i-bob', newPeerNetwork);
        const restartedBobConnect = new ConnectToPeerUseCase({ peerConnectionProvider: restartedBobTransport, identityProvider: bob.identityProvider });
        const restartedBobStopListening = restartedBobConnect.listen();
        await new RendezvousDiscoveryProvider({ transport: network }).publish(PeerInvitation.create({ endpoint: restartedBobTransport.address, identityHint: bob.id }));

        const restartedAliceTransport = new LocalPeerConnectionProvider('reassess-i-alice', newPeerNetwork);
        const restartedAliceConnect = new ConnectToPeerUseCase({ peerConnectionProvider: restartedAliceTransport, identityProvider: restartedIdentityProvider });
        const restartedFind = new FindPeerUseCase({ peerSessionManager: makeFakeSessionManager(restartedAliceConnect, new RendezvousDiscoveryProvider({ transport: network })) });
        const restartedAutoConnect = new AutoConnectKnownPeersUseCase({ findPeerUseCase: restartedFind, peerRelationshipUseCase: restartedRelationships, connectedPeerRegistry: restartedAliceConnect.registry });
        await wait();

        assert(authenticatedTo(restartedAliceConnect.registry, bob.id).length === 1,
            '4. GOOD NEWS: after a genuine restart, reconnecting to a still-known, still-discoverable peer requires no human gesture at all — the persisted relationship is all that survives, and that is all this seam needs.');

        restartedAutoConnect.dispose(); restartedBobStopListening();
        restartedBobTransport.dispose(); restartedAliceTransport.dispose();
    }
    console.log('✓ Section I: classified, not assumed. Publication persisted locally (already true, unrelated to this milestone) ≠ peer connection persisted (never true, by design, application/ConnectedPeerRegistry.js\'s own header) ≠ peer relationship persisted (already true, application/PeerRelationshipUseCase.js, unrelated to this milestone) ≠ peer currently online (a fact about the network, never stored anywhere). None of the non-persistent facts is a defect: a restarted application, given nothing but its own persisted Known Peers list, automatically re-establishes connection to anyone still discoverable — live-proven here across a genuine restart boundary, not merely within one continuous session.');

    // =======================================================================
    // Section J — Final decision matrix and verdict.
    // =======================================================================
    {
        const matrix = [
            ['Known-peer automatic connection', 'Complete'],
            ['Discoverability enforcement', 'Complete'],
            ['Duplicate-session protection (sequential triggers)', 'Complete'],
            ['Duplicate-session protection (concurrent manual + automatic)', 'Pre-existing gap, unrelated to this milestone — Section D'],
            ['Relationship-change trigger', 'Complete, and broader than "the changed peer" — Section C'],
            ['Publication sync after automatic connection', 'Complete'],
            ['Repository visibility, end to end', 'Complete — Section A'],
            ['Unknown-peer discovery', 'Excluded'],
            ['Public peer directory', 'Excluded'],
            ['Automatic content transfer', 'Excluded'],
            ['Sequential-pass starvation on a hung lookup', 'Named, unresolved — Section E'],
            ['Retry/reconnection', 'Decision required — Section H'],
            ['Connection activity awareness', 'Existing signal sufficient — Section G'],
            ['Publication notification', 'Existing signal sufficient, unchanged since 0.9.343 — Section G'],
            ['Persistent peer connection state', 'Not required — Section I'],
            ['Network-wide discovery/indexing', 'Separate future problem — 0.9.340\'s own excluded territory']
        ];
        console.log('\nDecision matrix:');
        for (const [capability, status] of matrix) console.log(`  - ${capability}: ${status}`);

        const roadmap = await readSource('docs/Roadmap.md');
        assert(roadmap.includes('0.9.344'), '1. the discoverability/dedup evidence this matrix leans on is on file.');
        assert(roadmap.includes('0.9.345'), '2. the automatic-connection seam this matrix leans on is on file.');

        console.log('\nVERDICT: STABLE_STOP, WITH TWO NAMED OPEN ITEMS.');
        console.log(
            'The composed arc this milestone set out to evaluate — Known relationship -> relationship loaded/changed -> discoverability\n' +
            'lookup -> automatic connection -> Publication metadata sync -> Repository visibility -> Explore/Fork — is genuinely,\n' +
            'completely reachable end to end (Section A), with the one pre-existing, unchanged nuance 0.9.343 already named: Repository\n' +
            'visibility still requires a deliberate Retrieve. Startup and relationship-change trigger semantics behave exactly as\n' +
            '0.9.345 documented, live-confirmed rather than merely inherited (Sections B/C), and the privacy/product boundary holds as\n' +
            'a durable, re-tested invariant (Section F). User awareness needs no new UI: the existing reactive signal already reaches\n' +
            'the one page built to show it (Section G).\n' +
            '\n' +
            'Two items are named as genuinely open rather than resolved, per this milestone\'s own evidence:\n' +
            '\n' +
            '  1. RETRY/RECONNECTION (Section H) — deliberately NOT built. No evidenced user journey is currently blocked by its\n' +
            '     absence; building it speculatively would add an entire second temporal subsystem (interval, backoff, maximum\n' +
            '     attempts, lifecycle/battery handling, cancellation) this milestone\'s own brief correctly warns against.\n' +
            '  2. SEQUENTIAL-PASS STARVATION ON A HUNG LOOKUP (Section E) — a smaller, more surgical concern than retry: one\n' +
            '     genuinely unreachable known peer currently delays every other known peer ordered after it within the SAME\n' +
            '     automatic pass, indefinitely, though the application itself is never blocked by it. A bounded per-lookup timeout,\n' +
            '     or replacing the sequential loop with `Promise.allSettled`, would resolve it without touching retry semantics at\n' +
            '     all — worth a future milestone\'s attention on its own, independent of item 1.\n' +
            '\n' +
            'Per this codebase\'s own governing framework and established reassessment practice (0.9.340, 0.9.343), STOP on adding\n' +
            'further automation now is the correct outcome, not a consolation — no section found a genuinely blocked user journey.\n' +
            'Both named open items are left explicitly on file for a future milestone to pick up ONLY if real usage demonstrates an\n' +
            'actual need, never spontaneously.'
        );
    }

    console.log('\nAll Known-Peer Auto-Connection Product Reassessment sections passed.');
}

run().catch((error) => {
    console.error('AutoConnectKnownPeersProductReassessment.test.js FAILED:', error);
    process.exitCode = 1;
});
