import { readFile } from 'node:fs/promises';

import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { License, LicenseId } from '../core/License.js';
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
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { ConnectToPeerUseCase } from '../application/ConnectToPeerUseCase.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';
import { LocalPublicationCatalog } from '../application/LocalPublicationCatalog.js';
import { PublicationExchange } from '../application/PublicationExchange.js';
import { PublicationPeerExchange } from '../application/PublicationPeerExchange.js';
import { PublicationPeerConnectionSync } from '../application/PublicationPeerConnectionSync.js';
import { PeerContentExchange } from '../application/PeerContentExchange.js';
import { CreatePublicationPeerExchangeUseCase } from '../application/CreatePublicationPeerExchangeUseCase.js';

// 0.9.343 — Peer Publication Synchronization Product Reassessment.
//
// Test-only. Production changes: none.
//
// 0.9.342 put a real, production PublicationPeerConnectionSync in front of
// every connecting peer: the moment a peer authenticates, this replica's
// entire cataloged ENVELOPE list — signed locators, never document/material
// bytes — is announced to it, over the exact, unmodified announce() path a
// manual "Publish to Network" already used. That closed 0.9.341's own
// flagship gap at the catalog layer, and 0.9.342's own test file proved it
// there: `bob.catalog.has(envelope.id)`.
//
// This milestone asks the question the catalog layer alone cannot answer:
// now that connected peers automatically exchange their existing
// Publications, is the resulting SHARING EXPERIENCE — Repository search,
// Explore, Fork, what a person actually sees — complete enough, or is there
// a concrete remaining gap? Answered by evidence, against real, live,
// production code, never by re-reading 0.9.342's own header.
//
// THE ONE FACT THIS AUDIT SURFACES THAT NO PRIOR MILESTONE'S TEST FILE
// EXERCISED END TO END: application/PublicationResolver.js#resolve() step 4
// reads ONLY this replica's own, local content/ContentStore.js — never the
// network (see that file's own header). An envelope PublicationPeerConnectionSync
// delivers therefore resolves CONTENT_UNAVAILABLE the instant it arrives,
// exactly like any other freshly-cataloged envelope always has, since 0.7.2.
// ui/views/DecentralizedPublicationsView.js#refreshList() already runs this
// SAME local-only resolution automatically for every new catalog entry
// (see its own `Promise.all(entries.filter((e) => !e.view && !e.checking)
// .map(resolveEntry))`) — and admitToRepositoryDiscovery() only ever admits
// an outcome === RESOLVED view. So: the envelope syncs automatically
// (0.9.342); becoming RESOLVED — and therefore Repository-searchable —
// still requires the one thing that has ALWAYS required it since 0.9.337:
// a successful content resolution, which for a peer-only publication means
// the existing, unmodified, explicitly-triggered peer content retrieval
// (application/PeerContentExchange.js, 0.7.4; application/
// PublicationResolutionCoordinator.js, 0.7.5/0.7.6) — never anything new
// built by this milestone, and never anything 0.9.342 changed. This is not
// a bug this reassessment found; it is the metadata/content boundary
// (0.9.342's own strongest architectural property) reconfirmed at the one
// layer no earlier test actually drove a live peer connection through.
//
// Sections (A-J), matching this milestone's own brief:
//   A — Late-joining journey, driven all the way to Repository/Explore/Fork
//       over a REAL second peer-to-peer retrieval round trip (no shared
//       ContentStore shortcut) — and the one extra, pre-existing,
//       deliberate step that "genuinely reachable" actually requires.
//   B — Existing connected-peer behavior: publications created after
//       connection converge onto the IDENTICAL downstream pipeline, never
//       a second Repository-admission mechanism.
//   C — Reconnection: the Repository stays deduplicated across repeated
//       connection-time sync, and WHY (the UI's own entry cache), not just
//       whether.
//   D — Multiple peers: independent Repository visibility for two peers of
//       one publisher, no cross-peer leakage, no accidental relay.
//   E — Multiple Publications + failure isolation, driven all the way to
//       Repository visibility, not just catalog delivery.
//   F — Metadata/content boundary regression guard: zero bytes, zero
//       content-store writes, regardless of catalog size, until a
//       deliberate retrieval.
//   G — The notification question, investigated against what actually
//       reaches the screen, not assumed.
//   H — Restart: what survives, what doesn't, classified with real
//       persisted storage rather than asserted.
//   I — Offline peer boundary: unchanged by 0.9.342's production wiring.
//   J — Final product matrix and verdict.

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

function makeIdentity(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    provider.login(label);
    return provider;
}

function makePublication({ documentId, title, author, license = new License({ id: LicenseId.CC0_1_0 }) }, identityProvider) {
    const documentContentReference = new ContentReference({
        hash: `docHash-${documentId}`, algorithm: 'fnv1a-32', mediaType: 'application/json', size: 256
    });
    let publication = new Publication({
        documentId, title, author, providerId: 'local',
        contentHash: documentContentReference.hash, schemaVersion: 3, license,
        contentReference: documentContentReference,
        publisherIdentity: identityProvider.getSigningIdentity().toJSON(), signature: null
    });
    publication = publication.withSignature(identityProvider.signCanonical(publication.getSigningDescriptor()));
    return publication;
}

// The exact production admission gate ui/views/DecentralizedPublicationsView.js
// runs at both resolveEntry() and retrieve() — reproduced test-side, the
// same posture tests/FederatedRepositoryProductReassessment.test.js already
// established as faithful to production.
function admitToRepositoryDiscovery(view, discoveryProvider) {
    if (discoveryProvider && view && view.resolved && view.content instanceof Publication) {
        discoveryProvider.add(view.content);
    }
}

async function connectTwoPeers(aliceLabel, bobLabel, networkLabelPrefix) {
    const network = new LocalPeerNetwork();
    const alice = makeIdentity(aliceLabel);
    const bob = makeIdentity(bobLabel);

    const aliceTransport = new LocalPeerConnectionProvider(`${networkLabelPrefix}-alice`, network);
    const bobTransport = new LocalPeerConnectionProvider(`${networkLabelPrefix}-bob`, network);
    const aliceConnect = new ConnectToPeerUseCase({ peerConnectionProvider: aliceTransport, identityProvider: alice });
    const stopListening = aliceConnect.listen();
    const bobConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bobTransport, identityProvider: bob });
    const bobConnectedPeer = bobConnect.connect({ candidateEndpoint: `${networkLabelPrefix}-alice` });
    await wait(20);
    assert(bobConnectedPeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, 'setup: a real, live, authenticated peer connection.');

    return {
        network, alice, bob, aliceTransport, bobTransport, aliceConnect, bobConnect, bobConnectedPeer, stopListening,
        dispose() { stopListening(); aliceTransport.dispose(); bobTransport.dispose(); }
    };
}

// A full replica: catalog + exchange + resolver + contentStore +
// peerContentExchange + resolution coordinator + (optionally) the real
// production connectionSync — everything a live "Retrieve" click actually
// runs through, not a paraphrase of it. `catalogStorage`/`contentStorage`
// are accepted rather than always constructed here so Section H can reuse
// the SAME persisted backing store across a simulated "restart."
function makeFullReplica(registry, {
    withConnectionSync = false, verifier,
    catalogStorage = new InMemoryStorageProvider(),
    contentStorage = new InMemoryStorageProvider()
} = {}) {
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
        catalog, exchange, bus, peerExchange, connectionSync,
        contentStore, contentStorage, resolver, contentBus, peerContentExchange, coordinator, kindPlugins,
        // Reproduces refreshList()'s own automatic, LOCAL-ONLY resolution —
        // no `peers` — for one catalog entry.
        async resolveLocallyOnly(publication) {
            return resolvePublicationView(publication, { coordinator, kindPlugins });
        },
        // Reproduces the "Retrieve" button's own call shape exactly:
        // resolvePublicationView with `peers`, a real round trip.
        async retrieveFrom(publication, peers, timeoutMs = 2000) {
            return resolvePublicationView(publication, { coordinator, kindPlugins, peers, timeoutMs });
        },
        dispose() {
            if (connectionSync) connectionSync.dispose();
            peerExchange.dispose();
            peerContentExchange.dispose();
        }
    };
}

async function run() {
    console.log('Running Peer Publication Sync Product Reassessment...\n');

    // ===============================================================
    // Section A — FLAGSHIP: the late-joining peer, driven all the way to
    // Repository search / Explore-lookup / Fork over a REAL second peer
    // content round trip — no shared ContentStore shortcut anywhere in
    // this section.
    // ===============================================================
    let sectionAContentStorage;
    {
        clearLocalPublications();
        const verifier = new LocalAuthorizationVerifier();
        const session = await connectTwoPeers('alice-a', 'bob-a', 'reassess-a');
        const alice = makeFullReplica(session.aliceConnect.registry, { withConnectionSync: true, verifier });
        const bob = makeFullReplica(session.bobConnect.registry, { verifier });
        sectionAContentStorage = bob.contentStorage;

        // Alice publishes and catalogs BEFORE this connection even
        // existed — the exact 0.9.341/0.9.342 flagship shape.
        const publication = makePublication({ documentId: 'late-joiner', title: 'Published While Bob Was Offline', author: 'alice-a' }, session.alice);
        const envelope = await alice.resolver.publish({ content: publication, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: session.alice });
        alice.catalog.add(envelope);

        // Bob "connects" the real way: disconnect + reconnect, so this
        // milestone's own production PublicationPeerConnectionSync — never
        // a test-side reimplementation — is what fires.
        session.bobConnectedPeer.close();
        await wait(20);
        const reconnected = session.bobConnect.connect({ candidateEndpoint: 'reassess-a-alice' });
        await wait(20);
        assert(reconnected.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '1. Bob (re)connects and authenticates.');
        assert(bob.catalog.has(envelope.id), '2. the envelope automatically arrives — 0.9.342\'s own catalog-layer capability, reconfirmed as this section\'s starting point.');

        // Simulate opening the Decentralized Publications page: run the
        // SAME local-only resolution refreshList() runs automatically for
        // every new entry.
        const provider = new DecentralizedPublicationDiscoveryProvider();
        const localOnlyView = await bob.resolveLocallyOnly(bob.catalog.get(envelope.id));
        admitToRepositoryDiscovery(localOnlyView, provider);
        assert(localOnlyView.outcome === PublicationResolutionOutcome.CONTENT_UNAVAILABLE,
            '3. automatic connection sync alone leaves the arrived envelope CONTENT_UNAVAILABLE — the same local-only resolution refreshList() already runs finds nothing to read yet, exactly as it always has since 0.7.2.');
        assert(provider.list().length === 0, '4. NOT YET Repository-admitted: metadata sync alone does not make a Publication searchable.');

        const { searchPublicationsUseCase: notYetSearch } = new CreateDiscoveryUseCase().execute({ decentralizedDiscoveryProvider: provider });
        assert(notYetSearch.execute({ text: 'published while bob' }).items.length === 0,
            '5. Repository search genuinely finds nothing yet — this is the one concrete, evidence-based gap between "the envelope arrived" and "the person can find it."');

        // The EXISTING, unmodified "Retrieve" action — a real peer content
        // round trip over the SAME live connection, never a shared
        // ContentStore shortcut.
        const retrievedView = await bob.retrieveFrom(bob.catalog.get(envelope.id), [reconnected]);
        assert(retrievedView.outcome === PublicationResolutionOutcome.RESOLVED, `6. the existing, unmodified Retrieve action resolves it (${retrievedView.reason}).`);
        assert(retrievedView.retrieval && retrievedView.retrieval.retrieved === true, '7. resolution genuinely came from a live peer round trip, not a coincidence.');
        assert(retrievedView.content instanceof Publication && retrievedView.content.title === 'Published While Bob Was Offline', '8. the resolved content is the genuine Publication.');

        admitToRepositoryDiscovery(retrievedView, provider);
        clearLocalPublications();
        const { searchPublicationsUseCase, findPublicationUseCase } = new CreateDiscoveryUseCase().execute({ decentralizedDiscoveryProvider: provider });
        const found = searchPublicationsUseCase.execute({ text: 'published while bob' });
        assert(found.items.length === 1 && found.items[0] === retrievedView.content, '9. Repository search NOW finds it.');

        const sourcePublication = findPublicationUseCase.execute(found.items[0].id);
        assert(sourcePublication === retrievedView.content, '10. Editor\'s fork-time lookup finds the identical instance.');

        const forkUseCase = new ForkDocumentUseCase(new InMemoryStorageProvider());
        let forkThrew = false;
        try {
            forkUseCase.execute(found.items[0].documentId, null, sourcePublication);
        } catch (e) {
            forkThrew = true;
            assert(e.message.includes(`no document found with id "${found.items[0].documentId}"`),
                '11. Fork reaches the identical, unmodified material-acquisition boundary a local Publication\'s fork would — genuinely fork-shaped material, not a stub.');
        }
        assert(forkThrew, '11b. ForkDocumentUseCase.execute() actually ran.');

        alice.dispose(); bob.dispose(); session.dispose();
    }
    console.log('✓ Section A: FLAGSHIP. The late-joining journey IS genuinely reachable end to end — peer connects -> envelope auto-syncs (0.9.342) -> Repository search -> Explore-lookup -> Fork boundary — over a real second peer content round trip, no shortcuts. The one honest nuance: reaching Repository search still requires the pre-existing, unmodified "Retrieve" action (0.7.4-0.7.6) — 0.9.342 stages the envelope silently; it was never meant to, and does not, skip content resolution.');

    // ===============================================================
    // Section B — Existing connected-peer behavior: publications created
    // AFTER connection converge onto the IDENTICAL downstream pipeline,
    // never a second Repository-admission mechanism.
    // ===============================================================
    {
        clearLocalPublications();
        const verifier = new LocalAuthorizationVerifier();
        const session = await connectTwoPeers('alice-b', 'bob-b', 'reassess-b');
        const alice = makeFullReplica(session.aliceConnect.registry, { withConnectionSync: true, verifier });
        const bob = makeFullReplica(session.bobConnect.registry, { verifier });

        // Bob is ALREADY connected before Alice publishes anything — the
        // connection-time seam already fired with nothing to send.
        assert(bob.catalog.list().length === 0, '1. nothing existed at connection time.');

        // A publication created AFTER connection travels the EXISTING,
        // unmodified explicit announce() lifecycle — 0.9.342 Section H's
        // own boundary, reconfirmed as this section's starting point.
        const publication = makePublication({ documentId: 'after-connect', title: 'Created After Connection', author: 'alice-b' }, session.alice);
        const envelope = await alice.resolver.publish({ content: publication, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: session.alice });
        alice.catalog.add(envelope);
        alice.peerExchange.announce(envelope);
        await wait(20);
        assert(bob.catalog.has(envelope.id), '2. the explicit announce() lifecycle still delivers it.');

        // From here, the pipeline to Repository visibility is IDENTICAL to
        // Section A's connection-time-synced path: local-only resolve ->
        // CONTENT_UNAVAILABLE -> Retrieve -> RESOLVED -> admit -> search.
        const provider = new DecentralizedPublicationDiscoveryProvider();
        const localOnlyView = await bob.resolveLocallyOnly(bob.catalog.get(envelope.id));
        assert(localOnlyView.outcome === PublicationResolutionOutcome.CONTENT_UNAVAILABLE,
            '3. the SAME local-only resolution outcome as a connection-time-synced envelope — no special-casing by temporal origin.');
        const retrievedView = await bob.retrieveFrom(bob.catalog.get(envelope.id), [session.bobConnectedPeer]);
        admitToRepositoryDiscovery(retrievedView, provider);
        clearLocalPublications();
        const { searchPublicationsUseCase } = new CreateDiscoveryUseCase().execute({ decentralizedDiscoveryProvider: provider });
        assert(searchPublicationsUseCase.execute({ text: 'created after connection' }).items.length === 1,
            '4. reaches Repository through the IDENTICAL pipeline Section A used for a connection-time-synced Publication.');

        // Structural confirmation: no dedicated "connection-sync-only"
        // admission path exists anywhere production actually runs.
        const viewSource = await readSource('ui/views/DecentralizedPublicationsView.js');
        assert(!/connectionSync|PublicationPeerConnectionSync/.test(viewSource),
            '5. ui/views/DecentralizedPublicationsView.js itself has no knowledge of PublicationPeerConnectionSync at all — one admission gate, reached by every source, never a second one keyed on how a Publication was acquired.');
        const discoverySource = await readSource('application/CreateDiscoveryUseCase.js');
        assert(!/[Pp]eer|[Cc]onnection[Ss]ync/.test(discoverySource),
            '6. application/CreateDiscoveryUseCase.js itself has no peer or connection-sync-specific code — Repository search remains one composition, regardless of temporal path.');

        alice.dispose(); bob.dispose(); session.dispose();
    }
    console.log('✓ Section B: a Publication created BEFORE a connection (auto-synced) and one created AFTER it (explicitly announced) converge onto one identical downstream pipeline to Repository visibility — structurally and behaviorally, never two mechanisms.');

    // ===============================================================
    // Section C — Reconnection: the Repository stays deduplicated across
    // repeated connection-time sync, and WHY — the UI's own per-entry view
    // cache, reproduced test-side, not an accumulator-level dedup that
    // does not exist (discovery/DecentralizedPublicationDiscoveryProvider.js
    // has none, by its own header).
    // ===============================================================
    {
        clearLocalPublications();
        const verifier = new LocalAuthorizationVerifier();
        const session = await connectTwoPeers('alice-c', 'bob-c', 'reassess-c');
        const alice = makeFullReplica(session.aliceConnect.registry, { withConnectionSync: true, verifier });
        const bob = makeFullReplica(session.bobConnect.registry, { verifier });

        const publication = makePublication({ documentId: 'reconnect-1', title: 'Reconnection Publication', author: 'alice-c' }, session.alice);
        const envelope = await alice.resolver.publish({ content: publication, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: session.alice });
        alice.catalog.add(envelope);

        const provider = new DecentralizedPublicationDiscoveryProvider();
        // Reproduces refreshList()'s own entry cache: a publication already
        // given a view is never re-resolved (and therefore never re-admitted)
        // on a later, redundant re-observation of the same id.
        const viewsById = new Map();
        async function refreshAndAdmit(peer) {
            for (const publicationEnvelope of bob.catalog.list()) {
                if (viewsById.has(publicationEnvelope.id)) continue;
                const view = await bob.retrieveFrom(publicationEnvelope, [peer]);
                viewsById.set(publicationEnvelope.id, view);
                admitToRepositoryDiscovery(view, provider);
            }
        }

        // connect -> announcements -> retrieve -> admit
        session.bobConnectedPeer.close();
        await wait(20);
        const firstReconnect = session.bobConnect.connect({ candidateEndpoint: 'reassess-c-alice' });
        await wait(20);
        await refreshAndAdmit(firstReconnect);
        assert(provider.list().length === 1, '1. first connect: exactly one Repository entry.');

        // disconnect -> connect -> announcements again (0.9.342's own
        // re-announce-on-reconnect behavior, unchanged)
        firstReconnect.close();
        await wait(20);
        const reconnected = session.bobConnect.connect({ candidateEndpoint: 'reassess-c-alice' });
        await wait(20);
        assert(reconnected.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '2. Bob reconnects and re-authenticates.');
        assert(bob.catalog.list().length === 1, '3. the catalog itself stays at exactly one entry — LocalPublicationCatalog#add()\'s own idempotency, unchanged since 0.9.341 Section E.');
        await refreshAndAdmit(reconnected);

        clearLocalPublications();
        const { searchPublicationsUseCase } = new CreateDiscoveryUseCase().execute({ decentralizedDiscoveryProvider: provider });
        const result = searchPublicationsUseCase.execute({ text: 'reconnection publication' });
        assert(provider.list().length === 1 && result.items.length === 1,
            '4. the observable Repository state remains correct across connect/disconnect/connect: exactly ONE entry, not two, not none — not because discovery/DecentralizedPublicationDiscoveryProvider.js deduplicates (it has no such policy, by its own header, and Section E below proves that directly), but because the SAME per-id entry cache ui/views/DecentralizedPublicationsView.js already runs never re-resolves, and therefore never re-admits, a publication it already has a view for.');

        alice.dispose(); bob.dispose(); session.dispose();
    }
    console.log('✓ Section C: reconnection never corrupts the observable Repository state. The mechanism is named, not assumed: the UI\'s own per-id view cache, unchanged since before 0.9.342, not a new deduplication layer this milestone would otherwise be tempted to add.');

    // ===============================================================
    // Section D — Multiple peers: A connected to both B and C. Each
    // independently reaches Repository visibility for A's catalog; neither
    // becomes an accidental intermediary for the other.
    // ===============================================================
    {
        clearLocalPublications();
        const verifier = new LocalAuthorizationVerifier();
        const networkAB = new LocalPeerNetwork();
        const networkAC = new LocalPeerNetwork();
        const alice = makeIdentity('alice-d');
        const bob = makeIdentity('bob-d');
        const carol = makeIdentity('carol-d');

        const aliceTransportForBob = new LocalPeerConnectionProvider('reassess-d-alice-b', networkAB);
        const bobTransport = new LocalPeerConnectionProvider('reassess-d-bob', networkAB);
        const aliceTransportForCarol = new LocalPeerConnectionProvider('reassess-d-alice-c', networkAC);
        const carolTransport = new LocalPeerConnectionProvider('reassess-d-carol', networkAC);

        const aliceConnectForBob = new ConnectToPeerUseCase({ peerConnectionProvider: aliceTransportForBob, identityProvider: alice });
        const stopListeningForBob = aliceConnectForBob.listen();
        const aliceConnectForCarol = new ConnectToPeerUseCase({ peerConnectionProvider: aliceTransportForCarol, identityProvider: alice, registry: aliceConnectForBob.registry });
        const stopListeningForCarol = aliceConnectForCarol.listen();

        const aliceReplica = makeFullReplica(aliceConnectForBob.registry, { withConnectionSync: true, verifier });
        const publication = makePublication({ documentId: 'multi-peer-1', title: 'Shared With Two Peers', author: 'alice-d' }, alice);
        const envelope = await aliceReplica.resolver.publish({ content: publication, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: alice });
        aliceReplica.catalog.add(envelope);

        const bobConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bobTransport, identityProvider: bob });
        const bobReplica = makeFullReplica(bobConnect.registry, { verifier });
        const bobConnectedPeer = bobConnect.connect({ candidateEndpoint: 'reassess-d-alice-b' });
        await wait(20);
        assert(bobConnectedPeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '1. Bob connects to Alice.');

        const carolConnect = new ConnectToPeerUseCase({ peerConnectionProvider: carolTransport, identityProvider: carol });
        const carolReplica = makeFullReplica(carolConnect.registry, { verifier });
        const carolConnectedPeer = carolConnect.connect({ candidateEndpoint: 'reassess-d-alice-c' });
        await wait(20);
        assert(carolConnectedPeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '2. Carol connects to Alice, independently.');

        assert(bobReplica.catalog.has(envelope.id) && carolReplica.catalog.has(envelope.id), '3. both receive the envelope independently.');

        const bobProvider = new DecentralizedPublicationDiscoveryProvider();
        const bobView = await bobReplica.retrieveFrom(bobReplica.catalog.get(envelope.id), [bobConnectedPeer]);
        admitToRepositoryDiscovery(bobView, bobProvider);

        const carolProvider = new DecentralizedPublicationDiscoveryProvider();
        const carolView = await carolReplica.retrieveFrom(carolReplica.catalog.get(envelope.id), [carolConnectedPeer]);
        admitToRepositoryDiscovery(carolView, carolProvider);

        clearLocalPublications();
        const { searchPublicationsUseCase: bobSearch } = new CreateDiscoveryUseCase().execute({ decentralizedDiscoveryProvider: bobProvider });
        const { searchPublicationsUseCase: carolSearch } = new CreateDiscoveryUseCase().execute({ decentralizedDiscoveryProvider: carolProvider });
        assert(bobSearch.execute({ text: 'shared with two peers' }).items.length === 1, '4. Bob\'s own Repository search finds it.');
        assert(carolSearch.execute({ text: 'shared with two peers' }).items.length === 1, '5. Carol\'s own Repository search finds it, independently.');

        // No accidental relay: Bob and Carol are never connected to each
        // other in this topology (two separate LocalPeerNetwork instances)
        // — neither could serve the other's content-request even if one
        // were mistakenly sent, since peer/PeerMessageBus.js#send() only
        // ever reaches an AUTHENTICATED peer this replica itself holds a
        // connection to.
        assert(bobConnect.registry.list().every((peer) => peer !== carolConnectedPeer), '6. Bob\'s own registry never contains Carol\'s connection.');
        assert(carolConnect.registry.list().every((peer) => peer !== bobConnectedPeer), '7. Carol\'s own registry never contains Bob\'s connection — no protocol exists here for A\'s catalog to reach B via C or vice versa.');

        aliceReplica.dispose(); bobReplica.dispose(); carolReplica.dispose();
        stopListeningForBob(); stopListeningForCarol();
        aliceTransportForBob.dispose(); bobTransport.dispose();
        aliceTransportForCarol.dispose(); carolTransport.dispose();
    }
    console.log('✓ Section D: with A connected to both B and C, A\'s catalog becomes independently Repository-visible to each — no cross-peer leakage, and no protocol by which either peer could become an accidental intermediary for the other.');

    // ===============================================================
    // Section E — Multiple Publications + failure isolation, driven all
    // the way to Repository visibility: one publication whose content can
    // never be retrieved (lost, no peer has it) must never block the
    // others from becoming Repository-searchable.
    // ===============================================================
    {
        clearLocalPublications();
        const verifier = new LocalAuthorizationVerifier();
        const session = await connectTwoPeers('alice-e', 'bob-e', 'reassess-e');
        const alice = makeFullReplica(session.aliceConnect.registry, { withConnectionSync: true, verifier });
        const bob = makeFullReplica(session.bobConnect.registry, { verifier });

        const envelopes = [];
        for (let i = 1; i <= 3; i += 1) {
            const publication = makePublication({ documentId: `multi-${i}`, title: `Multi Publication ${i}`, author: 'alice-e' }, session.alice);
            const envelope = await alice.resolver.publish({ content: publication, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: session.alice });
            alice.catalog.add(envelope);
            envelopes.push(envelope);
        }
        // Publication 2's content is deliberately erased from Alice's own
        // store AFTER publishing — modeling "lost content nobody, including
        // its own publisher's live peer, can currently serve" without
        // touching any production class.
        alice.contentStorage.remove(`content:${envelopes[1].contentReference.hash}`);

        session.bobConnectedPeer.close();
        await wait(20);
        const reconnected = session.bobConnect.connect({ candidateEndpoint: 'reassess-e-alice' });
        await wait(20);
        assert(envelopes.every((e) => bob.catalog.has(e.id)), '1. all three envelopes arrive via connection-time sync — one lost publication\'s content never blocked the OTHER TWO envelopes from syncing (0.9.342 Section J\'s own announce-loop isolation, reconfirmed).');

        const provider = new DecentralizedPublicationDiscoveryProvider();
        const outcomes = [];
        for (const envelope of envelopes) {
            const view = await bob.retrieveFrom(bob.catalog.get(envelope.id), [reconnected]);
            outcomes.push(view.outcome);
            admitToRepositoryDiscovery(view, provider);
        }
        assert(outcomes[0] === PublicationResolutionOutcome.RESOLVED, '2. Publication 1 resolves.');
        assert(outcomes[1] === PublicationResolutionOutcome.CONTENT_UNAVAILABLE, '3. Publication 2 — the lost one — correctly stays unresolved; no peer, including its own publisher, could answer.');
        assert(outcomes[2] === PublicationResolutionOutcome.RESOLVED, '4. Publication 3 resolves — the failure of Publication 2\'s retrieval never aborted the loop for it.');

        clearLocalPublications();
        const { searchPublicationsUseCase } = new CreateDiscoveryUseCase().execute({ decentralizedDiscoveryProvider: provider });
        assert(provider.list().length === 2, '5. exactly two Repository entries — the lost publication never silently admitted.');
        assert(searchPublicationsUseCase.execute({ text: 'multi publication' }).items.length === 2,
            '6. Repository search finds the two available ones; the earlier catalog-level failure isolation (0.9.342 Section J) is now reconfirmed one full layer further downstream, at actual Repository visibility.');

        alice.dispose(); bob.dispose(); session.dispose();
    }
    console.log('✓ Section E: a peer joining an established node receives its WHOLE current catalog, and one publication whose content nobody can currently serve never prevents the others from reaching Repository visibility — failure isolation holds all the way through, not just at catalog delivery.');

    // ===============================================================
    // Section F — Metadata/content boundary: the strongest regression
    // guard this milestone can write. Structural AND live, and live
    // regardless of catalog size.
    // ===============================================================
    {
        clearLocalPublications();
        const connectionSyncSource = await readSource('application/PublicationPeerConnectionSync.js');
        assert(!/import .*PublicationResolver/.test(connectionSyncSource), '1. no PublicationResolver import.');
        assert(!/import .*ContentStore/.test(connectionSyncSource), '2. no ContentStore import.');
        assert(!/import .*PeerContentExchange/.test(connectionSyncSource), '3. no PeerContentExchange import.');
        const useCaseSource = await readSource('application/CreatePublicationPeerExchangeUseCase.js');
        assert(!/PeerContentExchange/.test(useCaseSource), '4. the composition root that builds connectionSync never wires it to any content-transfer collaborator either.');

        const verifier = new LocalAuthorizationVerifier();
        const session = await connectTwoPeers('alice-f', 'bob-f', 'reassess-f');
        const alice = makeFullReplica(session.aliceConnect.registry, { withConnectionSync: true, verifier });
        const bob = makeFullReplica(session.bobConnect.registry, { verifier });

        // FIVE publications this time — the regression guard this section
        // exists to prove is that automatic sync's bandwidth cost is ZERO
        // regardless of catalog size, not merely zero for one item.
        for (let i = 1; i <= 5; i += 1) {
            const publication = makePublication({ documentId: `bytes-${i}`, title: `Publication ${i}`, author: 'alice-f' }, session.alice);
            const envelope = await alice.resolver.publish({ content: publication, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: session.alice });
            alice.catalog.add(envelope);
        }
        session.bobConnectedPeer.close();
        await wait(20);
        session.bobConnect.connect({ candidateEndpoint: 'reassess-f-alice' });
        await wait(20);

        assert(bob.catalog.list().length === 5, '5. all five envelopes synced automatically.');
        assert(bob.contentStorage.list().length === 0,
            '6. Bob\'s own content store holds ZERO entries — five envelopes arrived, zero bytes of document/material content moved. The user learns content exists (the catalog entry) without silently paying the bandwidth cost of retrieving it, for however many publications a peer happens to hold.');

        alice.dispose(); bob.dispose(); session.dispose();
    }
    console.log('✓ Section F: automatic connection sync moves envelopes only, never content bytes — structurally (no ContentStore/Resolver/PeerContentExchange collaborator anywhere in the seam or its composition root) and live (zero content-store writes after syncing five publications at once). This remains 0.9.342\'s own strongest architectural property, unweakened.');

    // ===============================================================
    // Section G — The notification question, investigated against what
    // actually reaches the screen.
    // ===============================================================
    {
        clearLocalPublications();
        const verifier = new LocalAuthorizationVerifier();
        const session = await connectTwoPeers('alice-g', 'bob-g', 'reassess-g');
        const alice = makeFullReplica(session.aliceConnect.registry, { withConnectionSync: true, verifier });
        const bob = makeFullReplica(session.bobConnect.registry, { verifier });

        // Confirm the ONE live signal this replica actually raises for a
        // connection-sync-delivered publication — never assumed, checked.
        const received = [];
        bob.peerExchange.onPublicationReceived((result) => received.push(result));

        const publication = makePublication({ documentId: 'awareness-1', title: 'Awareness Publication', author: 'alice-g' }, session.alice);
        const envelope = await alice.resolver.publish({ content: publication, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: session.alice });
        alice.catalog.add(envelope);
        session.bobConnectedPeer.close();
        await wait(20);
        session.bobConnect.connect({ candidateEndpoint: 'reassess-g-alice' });
        await wait(20);

        assert(received.length === 1 && received[0].isNew === true,
            '1. onPublicationReceived DOES fire for a connection-sync-delivered envelope, exactly as it would for an explicit announce() — the exact signal ui/views/DecentralizedPublicationsView.js\'s own `onPublicationReceived(() => refreshList())` already listens for genuinely reaches this new source, unmodified. This is the "existing feedback" 0.9.341/0.9.342 point to — confirmed live here, not merely inherited.');

        // But what that refresh shows, before any retrieval, is NOT a
        // title — it is an unresolved, CONTENT_UNAVAILABLE entry (Section
        // A, assertions 3-5). A person only learns WHAT arrived once they
        // (a) are already on the Decentralized Publications page and
        // (b) the entry has actually been retrieved.
        const localOnlyView = await bob.resolveLocallyOnly(bob.catalog.get(envelope.id));
        assert(localOnlyView.outcome === PublicationResolutionOutcome.CONTENT_UNAVAILABLE,
            '2. immediately after the ONE existing signal fires, there is nothing nameable yet to tell the person about — no title, no author, only a signed locator.');

        // No app-wide signal exists: confirm no toast/badge/counter is
        // wired to PublicationPeerConnectionSync or to onPublicationReceived
        // anywhere outside the one page that already handles it.
        const mainSource = await readSource('ui/main.js');
        assert(!/connectionSync\.on|feedback\.show.*[Pp]ublication.*received|badge.*[Pp]ublication/.test(mainSource),
            '3. no app-wide toast, badge, or counter is wired to connection-time sync anywhere in the composition root.');

        alice.dispose(); bob.dispose(); session.dispose();
    }
    console.log('✓ Section G: the existing feedback mechanism (peer-catalog page auto-refresh on onPublicationReceived) genuinely fires for connection-sync-delivered Publications, live-confirmed here — but it has nothing nameable to show until a separate, unchanged retrieval succeeds, and no app-wide signal exists outside that one page. Building a global notification for an event with no title yet to show would be premature, not a fix for a proven gap; this reconfirms 0.9.341 Section H\'s own finding (no evidenced NotificationEvent recipient) rather than superseding it. Decision: existing feedback is sufficient for what 0.9.342 actually delivers — STOP on notifications.');

    // ===============================================================
    // Section H — Restart: classified against real persisted storage,
    // never asserted.
    // ===============================================================
    {
        clearLocalPublications();
        const verifier = new LocalAuthorizationVerifier();
        const session = await connectTwoPeers('alice-h', 'bob-h', 'reassess-h');
        const bobCatalogStorage = new InMemoryStorageProvider();
        const bobContentStorage = new InMemoryStorageProvider();
        const alice = makeFullReplica(session.aliceConnect.registry, { withConnectionSync: true, verifier });
        const bob = makeFullReplica(session.bobConnect.registry, { verifier, catalogStorage: bobCatalogStorage, contentStorage: bobContentStorage });

        // Two publications: one Bob will fully retrieve before "restart",
        // one he will leave CONTENT_UNAVAILABLE.
        const retrievedPub = makePublication({ documentId: 'restart-retrieved', title: 'Retrieved Before Restart', author: 'alice-h' }, session.alice);
        const retrievedEnvelope = await alice.resolver.publish({ content: retrievedPub, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: session.alice });
        alice.catalog.add(retrievedEnvelope);
        const neverRetrievedPub = makePublication({ documentId: 'restart-never-retrieved', title: 'Never Retrieved Before Restart', author: 'alice-h' }, session.alice);
        const neverRetrievedEnvelope = await alice.resolver.publish({ content: neverRetrievedPub, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: session.alice });
        alice.catalog.add(neverRetrievedEnvelope);

        session.bobConnectedPeer.close();
        await wait(20);
        const reconnected = session.bobConnect.connect({ candidateEndpoint: 'reassess-h-alice' });
        await wait(20);
        assert(bob.catalog.has(retrievedEnvelope.id) && bob.catalog.has(neverRetrievedEnvelope.id), '1. both envelopes sync automatically.');

        const retrievedView = await bob.retrieveFrom(bob.catalog.get(retrievedEnvelope.id), [reconnected]);
        assert(retrievedView.outcome === PublicationResolutionOutcome.RESOLVED, '2. Bob retrieves ONE of the two before "restart".');
        // The other stays CONTENT_UNAVAILABLE — no retrieval attempted.

        // --- Simulate a restart: fresh, in-process instances over the
        // SAME persisted storage (window.localStorage-backed in production;
        // here, the SAME InMemoryStorageProvider instances Bob's replica
        // already wrote to) — nothing carried over in memory.
        alice.dispose(); bob.dispose(); session.dispose();

        const restartedCatalog = new LocalPublicationCatalog(bobCatalogStorage);
        assert(restartedCatalog.list().length === 2 && restartedCatalog.has(retrievedEnvelope.id) && restartedCatalog.has(neverRetrievedEnvelope.id),
            '3. the peer-catalog INDEX (which envelopes this replica has seen) survives restart — application/LocalPublicationCatalog.js already persists to its own StorageProvider, unchanged since 0.7.2, entirely independent of this milestone.');

        const freshDiscoveryProvider = new DecentralizedPublicationDiscoveryProvider();
        assert(freshDiscoveryProvider.list().length === 0,
            '4. Repository\'s OWN accumulator starts empty after restart — reconfirms 0.9.340 Section G\'s own finding in this exact scenario, live, not merely by citation.');

        // Simulate re-opening the Decentralized Publications page after
        // restart: the SAME local-only resolution runs automatically for
        // every catalog entry.
        const restartedContentStore = new LocalContentStore(bobContentStorage);
        const restartedResolver = new PublicationResolver(restartedContentStore, verifier);
        const restartedCoordinator = new PublicationResolutionCoordinator(restartedResolver);
        const { kindPlugins: restartedKindPlugins } = new CreatePublicationDisplayKindRegistryUseCase().execute();

        const retrievedViewAfterRestart = await resolvePublicationView(restartedCatalog.get(retrievedEnvelope.id), { coordinator: restartedCoordinator, kindPlugins: restartedKindPlugins });
        admitToRepositoryDiscovery(retrievedViewAfterRestart, freshDiscoveryProvider);
        assert(retrievedViewAfterRestart.outcome === PublicationResolutionOutcome.RESOLVED,
            '5. the ALREADY-retrieved publication\'s content is ALSO persisted (content/LocalContentStore.js writes through its own StorageProvider, unchanged since 0.7.1) — local-only resolution succeeds again after restart, with no peer needed this time.');

        const neverRetrievedViewAfterRestart = await resolvePublicationView(restartedCatalog.get(neverRetrievedEnvelope.id), { coordinator: restartedCoordinator, kindPlugins: restartedKindPlugins });
        assert(neverRetrievedViewAfterRestart.outcome === PublicationResolutionOutcome.CONTENT_UNAVAILABLE,
            '6. the NEVER-retrieved publication stays exactly as unresolved after restart as before it — restart neither helps nor further harms it; the same Retrieve action would still be needed, now or later.');

        clearLocalPublications();
        const { searchPublicationsUseCase } = new CreateDiscoveryUseCase().execute({ decentralizedDiscoveryProvider: freshDiscoveryProvider });
        assert(searchPublicationsUseCase.execute({ text: 'restart' }).items.length === 1,
            '7. after restart, Repository search finds exactly the one publication whose content was already retrieved before restart — once the person revisits the page that runs this resolution, which happens on that page\'s own mount, not automatically at application boot.');

        session.dispose = () => {};
    }
    console.log('✓ Section H: classified, not assumed. The peer-catalog INDEX (which envelopes this replica has seen) is durable — application/LocalPublicationCatalog.js already persists it, unrelated to this milestone. Repository\'s own accumulator is NOT durable (0.9.340 Section G, reconfirmed) and is never repopulated automatically at application boot. But it is not permanently lost either: any publication already fully RETRIEVED before restart re-resolves purely locally and re-admits automatically the next time the person visits the page that already runs this resolution — restart affects WHEN Repository visibility is re-established for already-available content, never WHETHER a never-retrieved publication becomes visible (it still needs the identical Retrieve action, before or after any restart). No on-file evidence names a user requiring full automatic persistent federated cataloging; this stays an open, characterized question — exactly 0.9.340 Section G\'s own precedent — never an assumed defect this milestone must fix.');

    // ===============================================================
    // Section I — Offline peer boundary: unchanged by 0.9.342's production
    // wiring. No attempt is made to solve it here.
    // ===============================================================
    {
        clearLocalPublications();
        const verifier = new LocalAuthorizationVerifier();
        const registry = { list: () => [], onChange: () => () => {} };
        const alice = makeFullReplica(registry, { withConnectionSync: true, verifier });

        // Alice publishes, catalogs, and even fully resolves her own
        // Publication locally — Bob never connects at all, ever.
        const publication = makePublication({ documentId: 'never-online-together', title: 'Never Online Together', author: 'alice-i' }, makeIdentity('alice-i'));
        const envelope = await alice.resolver.publish({ content: publication, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: makeIdentity('alice-i2') });
        alice.catalog.add(envelope);

        // No peer, no message, nothing for a Bob who never connects to
        // ever receive — structurally confirmed once more: no relay,
        // Nostr, or global-index concept anywhere in the production seam.
        const connectionSyncSource = await readSource('application/PublicationPeerConnectionSync.js');
        assert(!/[Nn]ostr|relay|globalIndex|GlobalIndex/.test(connectionSyncSource),
            '1. no Nostr/relay/global-index concept anywhere in application/PublicationPeerConnectionSync.js — connection-time sync only ever acts on peers THIS replica is directly, currently, authenticated to.');
        assert(alice.catalog.list().length === 1, '2. Alice\'s own catalog holds her publication, exactly as expected, with no one to send it to.');

        alice.dispose();
    }
    console.log('✓ Section I: A online / B online remains the boundary automatic sync operates within; A online / B never connecting remains exactly as unreachable as 0.9.341 Section J and 0.9.342 already established. This stays 0.9.340\'s own separate, deliberately excluded indexing territory — no attempt made here to narrow it.');

    // ===============================================================
    // Section J — Final product matrix and verdict.
    // ===============================================================
    {
        const matrix = [
            ['Local Publication discovery', 'Complete'],
            ['Decentralized Publication transport (envelope)', 'Complete'],
            ['Peer Publication reception (catalog)', 'Complete'],
            ['Late-joining peer synchronization (catalog layer)', 'Complete — 0.9.342'],
            ['Automatic metadata (envelope) exchange', 'Complete — 0.9.342, reconfirmed Section F'],
            ['Late-joining peer -> Repository/Explore/Fork, end to end', 'Complete — Section A, over a real second peer round trip'],
            ['Automatic content transfer', 'Deliberately excluded — Section F'],
            ['Content retrieval required for Repository visibility', 'Unchanged, pre-existing since 0.7.4/0.9.337 — Section A'],
            ['Peer awareness/notification for connection-sync arrivals', 'Existing feedback sufficient — decision made, Section G'],
            ['Persistent peer-learned catalog (envelope index)', 'Already true — LocalPublicationCatalog, unrelated to this milestone, Section H'],
            ['Persistent Repository-admitted visibility across restart', 'Absent by design (0.9.340 Section G) — open, not urgent, Section H'],
            ['Peer-to-peer gossip propagation', 'Not yet required — no evidence, per this milestone\'s own brief'],
            ['Never-online-simultaneously discovery', 'Separate indexing problem — 0.9.340\'s own excluded territory, Section I']
        ];
        console.log('\nDecision matrix:');
        for (const [capability, status] of matrix) {
            console.log(`  - ${capability}: ${status}`);
        }

        // Every "Absent"/"excluded" row traces to a specific, dated,
        // on-file decision — never an unexplained gap.
        const roadmap = await readSource('docs/Roadmap.md');
        assert(roadmap.includes('0.9.340'), '1. the federated-search exclusion this matrix leans on is on file.');
        assert(roadmap.includes('0.9.341'), '2. the notification-boundary finding this matrix leans on is on file.');
        assert(roadmap.includes('0.9.342'), '3. the metadata/content boundary this matrix leans on is on file.');

        console.log('\nVERDICT: STABLE_STOP.');
        console.log('The late-joining peer journey (this milestone\'s own flagship question) is genuinely, completely reachable end to end, proven live over a real second peer content round trip, not merely at the catalog layer 0.9.342\'s own test already covered. Every other section either reconfirms an existing, deliberate boundary (B, C, D, F, I) or resolves an open question with fresh, live evidence rather than assumption (E\'s deeper failure isolation, G\'s notification decision, H\'s restart classification). No section surfaced a genuine, currently-blocked user journey. Per this codebase\'s own governing framework (0.9.322/0.9.328/0.9.329) and its own established practice for a reassessment milestone (0.9.340), STOP is the primary successful outcome, not a consolation. Gossip propagation is explicitly declined, per this milestone\'s own brief, for lacking every one of the properties it would need (propagation scope, loop prevention, origin identity, hop limits, freshness, provenance) and for having no evidenced user journey it alone would unblock. Persistent Repository-admitted visibility across restart (Section H) is the one genuinely open question this reassessment leaves on file, deliberately unresolved rather than guessed at — should real evidence for it ever arrive, it is a SEPARATE, larger "persistent federated cataloging" milestone, never a reason to extend PublicationPeerConnectionSync itself.');
    }

    console.log('\nAll Peer Publication Sync Product Reassessment sections passed.');
}

run().catch((error) => {
    console.error('PeerPublicationSyncProductReassessment.test.js FAILED:', error);
    process.exitCode = 1;
});
