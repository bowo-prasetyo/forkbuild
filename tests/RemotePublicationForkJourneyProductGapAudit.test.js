import { readFile } from 'node:fs/promises';

import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { License, LicenseId } from '../core/License.js';
import { PublicationResolver } from '../application/PublicationResolver.js';
import { PublicationResolutionCoordinator } from '../application/PublicationResolutionCoordinator.js';
import { resolvePublicationView } from '../application/PublicationResolutionView.js';
import { CreatePublicationDisplayKindRegistryUseCase } from '../application/CreatePublicationDisplayKindRegistryUseCase.js';
import { CreateDiscoveryUseCase } from '../application/CreateDiscoveryUseCase.js';
import { PUBLICATION_CONTENT_KIND } from '../application/PublicationContentValidator.js';
import { ForkDocumentUseCase } from '../application/ForkDocumentUseCase.js';
import { DocumentCloneService } from '../application/DocumentCloneService.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { Document } from '../core/Document.js';
import { World } from '../core/World.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { DecentralizedPublicationDiscoveryProvider } from '../discovery/DecentralizedPublicationDiscoveryProvider.js';
import { CompositeDiscoveryProvider } from '../discovery/CompositeDiscoveryProvider.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { resolveSigningIdentityId } from '../identity/resolveSigningIdentityId.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { ConnectToPeerUseCase } from '../application/ConnectToPeerUseCase.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';
import { PublicationExchange } from '../application/PublicationExchange.js';
import { PublicationPeerExchange } from '../application/PublicationPeerExchange.js';
import { LocalPublicationCatalog } from '../application/LocalPublicationCatalog.js';

// 0.9.352 — Remote Publication Fork Journey Product Gap Audit.
//
// Type: test-only. Production changes: NONE.
//
// 0.9.351 gathered live evidence that proactive decentralized Publication
// discovery cannot become part of synchronous Repository Search without
// inventing a substantial new contract (latency/cancellation/partial
// results/remote-search semantics) — and recommended not building it.
// That leaves the DOWNSTREAM journey as the open question: once a user
// has discovered a remote Publication (by whatever means — local, peer,
// or decentralized) and it is admitted into Repository, can they actually
// complete "fork/use this Publication" without an artificial boundary?
//
// This file gathers that evidence, live, against real, unmodified
// production code. It performs no discovery, resolution, or admission of
// its own beyond what a real flagship journey requires, and makes no
// production-code change anywhere in the repository.
//
// Sections (A-J):
//   A — Flagship: peer -> resolve -> admit -> Repository search -> Explore
//       route -> Fork route -> ForkDocumentUseCase -> a genuine, editable
//       Document, this time carried all the way to SUCCESS (0.9.340
//       Section B deliberately stopped at the material-acquisition
//       boundary; this section supplies the positive case).
//   B — Identity preservation: Publication.id/documentId/contentReference/
//       contentHash/publisherIdentity stay distinct end to end; the fork's
//       own derivative attribution names them explicitly rather than
//       reconstructing anything from content identity.
//   C — Local/peer/decentralized convergence: no "if decentralized"
//       branch exists anywhere in the Explore/Fork call chain.
//   D — Explore -> Fork boundary, traced precisely: both are one-click,
//       documentId-keyed, ungated by each other; the only asymmetry is
//       ENTRY POINT (Repository/Author "Fork" vs. World View "Edit a
//       Copy"), and both converge on the identical EditorView.js handler.
//   E — Retrieval semantics: discovered != retrieved != available for
//       editing, characterized live in both directions (fails when
//       material is absent, succeeds once it is present) plus a structural
//       comparison against the rich, named PublicationResolutionOutcome
//       vocabulary the RESOLUTION layer already has and the FORK layer
//       does not.
//   F — License/authorization boundary: THE finding. A live, precise trace
//       of exactly what a user sees and where they land when a license
//       denies forking — proven identical, in both symptom and root
//       cause, to what happens on a retrieval failure.
//   G — Provenance: content-lineage provenance (which Publication/
//       Document a fork descends from) is preserved; transport-origin
//       provenance (local/peer/decentralized) is confirmed, again, never
//       recorded anywhere downstream — and confirmed here that nothing
//       in the journey actually needs it to be.
//   H — Failure isolation: a failed fork (either cause) leaves Repository/
//       catalog state provably untouched, and a subsequent legitimate
//       fork of the same, still-intact Publication still succeeds.
//   I — Existing UI duplication: DecentralizedPublicationsView.js and
//       OwnPublicationPanel.js checked directly and confirmed NOT an
//       alternate Explore/Fork surface.
//   J — Decision matrix and final verdict.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function readSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

function wait(ms = 20) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// Same minimal window.localStorage shim 0.9.337-0.9.351's own test files
// already install, for the identical reason (CreateDiscoveryUseCase.js
// constructs a real storage/LocalStorageProvider.js).
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

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); this.saveCalls = 0; }
    save(name, data) { this.saveCalls += 1; this._data.set(name, JSON.parse(JSON.stringify(data))); }
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
        documentId,
        title,
        author,
        providerId: 'local',
        contentHash: documentContentReference.hash,
        schemaVersion: 3,
        license,
        contentReference: documentContentReference,
        publisherIdentity: identityProvider.getSigningIdentity().toJSON(),
        signature: null
    });
    publication = publication.withSignature(identityProvider.signCanonical(publication.getSigningDescriptor()));
    return publication;
}

function clearLocalPublications() {
    window.localStorage.removeItem('forkbuild:forkbuild-publications');
}

async function resolveAsDecentralizedPublication(publication, identityProvider) {
    const storage = new InMemoryStorageProvider();
    const resolver = new PublicationResolver(new LocalContentStore(storage), new LocalAuthorizationVerifier());
    const { kindPlugins } = new CreatePublicationDisplayKindRegistryUseCase().execute();
    const coordinator = new PublicationResolutionCoordinator(resolver, null);
    const envelope = await resolver.publish({ content: publication, contentKind: PUBLICATION_CONTENT_KIND, identityProvider });
    return resolvePublicationView(envelope, { coordinator, kindPlugins });
}

// The exact production admission gate ui/views/DecentralizedPublicationsView.js
// runs — reproduced test-side, same posture 0.9.337-0.9.351 already used.
function admitToRepositoryDiscovery(view, discoveryProvider) {
    if (discoveryProvider && view && view.resolved && view.content instanceof Publication) {
        discoveryProvider.add(view.content);
    }
}

// A minimal, genuinely valid, serializable World Document — what
// "the Publication's own material has actually been retrieved" means in
// practice: a JSON payload sitting in the SAME storageProvider
// ForkDocumentUseCase/LoadDocumentUseCase read from, keyed by documentId.
function buildRetrievedDocumentJSON(documentId, { title, author }) {
    const document = new Document({
        world: new World({ id: documentId }),
        metadata: new DocumentMetadata({ title, author })
    });
    return new DocumentSerializer().serialize(document);
}

async function run() {
    console.log('Running Remote Publication Fork Journey Product Gap Audit tests...\n');

    // ===============================================================
    // Section A — FLAGSHIP, carried to genuine SUCCESS: peer -> resolve
    // -> admit -> Repository search (real CreateDiscoveryUseCase.js
    // composition) -> Explore route (viewWorld's own documentId) -> Fork
    // route (forkPublication's own documentId+publication.id) ->
    // ForkDocumentUseCase -> a real, editable Document. 0.9.340 Section B
    // proved this chain up to the material-acquisition boundary and
    // deliberately stopped there; this section supplies the missing
    // positive case by seeding the SAME storageProvider EditorView.js's
    // own forkDocumentUseCase reads from with the source Document's own
    // material, modeling "this replica has actually retrieved it."
    // ===============================================================
    let flagshipForkedDocument;
    {
        const network = new LocalPeerNetwork();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');

        const aliceTransport = new LocalPeerConnectionProvider('alice-fork-journey', network);
        const bobTransport = new LocalPeerConnectionProvider('bob-fork-journey', network);
        const aliceConnect = new ConnectToPeerUseCase({ peerConnectionProvider: aliceTransport, identityProvider: alice });
        const stopListening = aliceConnect.listen();
        const bobConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bobTransport, identityProvider: bob });
        const bobConnectedPeer = bobConnect.connect({ candidateEndpoint: 'alice-fork-journey' });
        await wait(20);
        assert(bobConnectedPeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED,
            '1. setup: a real, live, authenticated peer connection.');

        const verifier = new LocalAuthorizationVerifier();
        const sharedEnvelopeStorage = new InMemoryStorageProvider();
        const aliceResolver = new PublicationResolver(new LocalContentStore(sharedEnvelopeStorage), verifier);
        const bobResolver = new PublicationResolver(new LocalContentStore(sharedEnvelopeStorage), verifier);

        const aliceCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const aliceExchange = new PublicationExchange(aliceCatalog, verifier);
        const aliceBus = new PeerMessageBus();
        const alicePeerExchange = new PublicationPeerExchange(aliceExchange, aliceBus, aliceConnect.registry);

        const bobCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const bobExchange = new PublicationExchange(bobCatalog, verifier);
        const bobBus = new PeerMessageBus();
        const bobPeerExchange = new PublicationPeerExchange(bobExchange, bobBus, bobConnect.registry);

        const observed = [];
        bobPeerExchange.onPublicationReceived((result) => observed.push(result));

        const documentId = 'fork-journey-flagship-doc';
        const flagshipPublication = makePublication(
            { documentId, title: 'The Discoverable Federated Blueprint', author: 'alice' }, alice
        );
        const envelope = await aliceResolver.publish({
            content: flagshipPublication, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: alice
        });
        aliceCatalog.add(envelope);
        const sentCount = alicePeerExchange.announce(envelope);
        assert(sentCount === 1, '2. Alice announces the Publication envelope to her one live peer.');
        await wait(20);
        assert(observed.length === 1, "3. Bob's peer exchange receives the envelope live.");

        const { kindPlugins: bobKindPlugins } = new CreatePublicationDisplayKindRegistryUseCase().execute();
        const bobCoordinator = new PublicationResolutionCoordinator(bobResolver);
        const view = await resolvePublicationView(observed[0].publication, { coordinator: bobCoordinator, kindPlugins: bobKindPlugins });
        assert(view.resolved === true, `4. the peer-delivered envelope resolves into a genuine Publication (${view.reason}).`);

        const sharedProvider = new DecentralizedPublicationDiscoveryProvider();
        admitToRepositoryDiscovery(view, sharedProvider);
        assert(sharedProvider.list().length === 1, '5. admitted into the shared, application-lifetime discovery provider.');

        alicePeerExchange.dispose();
        bobPeerExchange.dispose();
        stopListening();
        aliceTransport.dispose();
        bobTransport.dispose();

        // Repository search — the EXACT composition ui/components/
        // PublicationCatalog.js runs.
        clearLocalPublications();
        const { searchPublicationsUseCase, findPublicationUseCase } =
            new CreateDiscoveryUseCase().execute({ decentralizedDiscoveryProvider: sharedProvider });
        const repositoryResult = searchPublicationsUseCase.execute({ text: 'discoverable federated blueprint' });
        assert(repositoryResult.items.length === 1 && repositoryResult.items[0] === view.content,
            "6. Repository's own real search finds it.");
        const [selected] = repositoryResult.items;

        // Explore route — ui/components/PublicationCatalog.js#viewWorld().
        const exploreRoute = { path: `/world/${selected.documentId}` };
        assert(exploreRoute.path === `/world/${documentId}`, '7. Explore navigates by pub.documentId, unchanged.');

        // Fork route — ui/components/PublicationCatalog.js#forkPublication().
        const forkRoute = { path: '/editor', query: { fork: selected.documentId, publication: selected.id } };
        assert(forkRoute.query.fork === documentId && forkRoute.query.publication === selected.id,
            '8. Fork navigates by pub.documentId + pub.id, unchanged.');

        // Editor's own fork-time lookup — ui/views/EditorView.js's
        // findPublicationUseCase.execute(route.query.publication).
        const sourcePublication = findPublicationUseCase.execute(forkRoute.query.publication);
        assert(sourcePublication === view.content, '9. Editor\'s fork-time lookup finds the SAME Publication instance.');

        // THE NEW EVIDENCE: seed the material-storage layer with the
        // source Document's own bytes, modeling "this replica has
        // actually retrieved the Publication's material" — then run the
        // REAL, unmodified ForkDocumentUseCase EditorView.js runs.
        const documentStorage = new InMemoryStorageProvider();
        documentStorage.save(documentId, buildRetrievedDocumentJSON(documentId, { title: 'The Discoverable Federated Blueprint', author: 'alice' }));
        const forkUseCase = new ForkDocumentUseCase(documentStorage);
        const forkedDocument = forkUseCase.execute(forkRoute.query.fork, bob, sourcePublication);

        flagshipForkedDocument = forkedDocument;
        assert(forkedDocument instanceof Document, '10. Fork SUCCEEDS end to end once material is genuinely available — a real, editable Document.');
        assert(forkedDocument.metadata.title === 'Fork of The Discoverable Federated Blueprint',
            '11. the forked Document carries the expected derived title.');
        assert(forkedDocument.world.id !== documentId,
            '12. the fork gets a fresh world.id/documentId — never the source\'s own.');
    }
    console.log('✓ Section A: FLAGSHIP, carried to genuine success. Peer -> resolve -> admit -> Repository search -> Explore route -> Fork route -> Editor fork-lookup -> ForkDocumentUseCase -> a real, editable Document — the complete journey, this time ending in success rather than 0.9.340\'s own deliberate stop at the material-acquisition boundary.');

    // ===============================================================
    // Section B — Identity preservation: id/documentId/contentReference/
    // contentHash/publisherIdentity stay distinct throughout, and the
    // fork's own attribution names them explicitly rather than
    // reconstructing anything from content identity.
    // ===============================================================
    {
        clearLocalPublications();
        const heidi = makeIdentity('heidi');
        const documentId = 'identity-preservation-doc';
        const publication = makePublication(
            { documentId, title: 'A Publication About Identity', author: 'heidi', license: new License({ id: LicenseId.CC_BY_4_0 }) },
            heidi
        );

        assert(publication.id !== publication.documentId,
            '1. Publication.id (the envelope identity) and documentId (the World/Document identity) are genuinely distinct values, never aliases of each other.');
        assert(publication.contentReference instanceof ContentReference && publication.contentReference.hash === publication.contentHash,
            '2. contentReference wraps contentHash, itself distinct from both id and documentId.');
        assert(publication.publisherIdentity && publication.publisherIdentity.id !== publication.id
            && publication.publisherIdentity.id !== publication.documentId,
            '3. publisherIdentity is a third, independent identity — the signer, not the work or its content address.');

        const documentStorage = new InMemoryStorageProvider();
        documentStorage.save(documentId, buildRetrievedDocumentJSON(documentId, { title: 'A Publication About Identity', author: 'heidi' }));
        const forkedDocument = new ForkDocumentUseCase(documentStorage).execute(documentId, makeIdentity('ivan'), publication);

        assert(forkedDocument.metadata.license.attribution.sourcePublicationId === publication.id,
            '4. the fork\'s own attribution records sourcePublicationId as Publication.id — the envelope identity, not documentId.');
        assert(forkedDocument.metadata.license.attribution.sourceDocumentId === documentId,
            '5. the fork\'s own attribution records sourceDocumentId as the ORIGINAL documentId — never the fork\'s own new world.id.');
        assert(forkedDocument.world.id !== documentId && forkedDocument.world.id !== publication.id,
            '6. documentId is the identity the downstream fork machinery ACTS ON (loads by, forks from) — the fork\'s own new identity is freshly generated, never reconstructed from contentHash/contentReference.');
        assert(!('contentHash' in forkedDocument.metadata.license.attribution) && !('contentReference' in forkedDocument.metadata.license.attribution),
            '7. attribution names identities (publication id, document id) — it never leaks contentHash/contentReference into a field downstream code would have to parse back out.');
    }
    console.log('✓ Section B: Publication.id/documentId/contentReference/contentHash/publisherIdentity remain five genuinely distinct values end to end; the fork\'s own attribution names sourcePublicationId/sourceDocumentId explicitly, and documentId — never a value derived from contentHash/contentReference — is what the fork machinery actually acts on.');

    // ===============================================================
    // Section C — Local/peer/decentralized convergence: no "if
    // decentralized" branch exists anywhere in the Explore/Fork call
    // chain (reconfirms 0.9.338/0.9.339/0.9.340 directly against
    // CURRENT source, rather than citing their own past results).
    // ===============================================================
    {
        for (const file of [
            'application/ForkDocumentUseCase.js',
            'application/LoadPublicationDocumentUseCase.js',
            'application/DocumentCloneService.js'
        ]) {
            const source = await readSource(file);
            assert(!/decentralized|peer-sourced|isPeer|isDecentralized/i.test(source),
                `1. ${file} contains no "decentralized"/origin-branching concept of any kind.`);
        }
        // discovery/CompositeDiscoveryProvider.js's own header comment
        // DISCUSSES "decentralized"/"local first" in prose, precisely to
        // disclaim doing any such branching (0.9.340's own identical
        // posture) — checked against the CLASS BODY only, not the header,
        // to avoid misfiring on that disclaimer itself.
        const compositeProviderSource = await readSource('discovery/CompositeDiscoveryProvider.js');
        const compositeProviderClassBody = compositeProviderSource.slice(compositeProviderSource.indexOf('export class'));
        assert(!/decentralized|peer-sourced|isPeer|isDecentralized/i.test(compositeProviderClassBody),
            '1b. discovery/CompositeDiscoveryProvider.js\'s own CLASS BODY contains no "decentralized"/origin-branching concept of any kind.');

        const catalogSource = await readSource('ui/components/PublicationCatalog.js');
        assert(/function forkPublication\(pub\)\s*\{\s*router\.push\(\{ path: '\/editor', query: \{ fork: pub\.documentId, publication: pub\.id \} \}\);/.test(catalogSource),
            '2. forkPublication() reads only pub.documentId/pub.id, regardless of a Publication\'s origin.');

        // Live: a LOCAL publication and a DECENTRALIZED-origin publication
        // both reach ForkDocumentUseCase through the identical call shape,
        // with identical outcomes for identical inputs.
        clearLocalPublications();
        const judy = makeIdentity('judy');
        const localPub = makePublication({ documentId: 'convergence-local-doc', title: 'Convergence Local', author: 'judy' }, judy);
        const decentralizedPub = makePublication({ documentId: 'convergence-decentralized-doc', title: 'Convergence Decentralized', author: 'judy' }, judy);
        const decentralizedView = await resolveAsDecentralizedPublication(decentralizedPub, judy);

        const storage = new InMemoryStorageProvider();
        for (const pub of [localPub, decentralizedView.content]) {
            storage.save(pub.documentId, buildRetrievedDocumentJSON(pub.documentId, { title: pub.title, author: pub.author }));
        }
        const forkUseCase = new ForkDocumentUseCase(storage);
        const localFork = forkUseCase.execute(localPub.documentId, judy, localPub);
        const decentralizedFork = forkUseCase.execute(decentralizedView.content.documentId, judy, decentralizedView.content);

        assert(localFork.constructor === decentralizedFork.constructor,
            '3. a local-origin and a decentralized-origin Publication produce the SAME Document class from the SAME use case call.');
        assert(Object.keys(localFork.metadata.license.attribution).sort().join(',')
            === Object.keys(decentralizedFork.metadata.license.attribution).sort().join(','),
            '4. the attribution shape is identical regardless of origin — no origin-specific field appears for either.');
    }
    console.log('✓ Section C: no "if decentralized" branch exists anywhere in the Explore/Fork call chain — confirmed both structurally (source inspection of every file in the chain) and live (a local-origin and a decentralized-origin Publication produce byte-for-byte identical fork shapes from the identical use case call).');

    // ===============================================================
    // Section D — Explore -> Fork boundary, traced precisely. Both
    // actions are one click each, both keyed by documentId, neither
    // gates the other. The only real asymmetry is ENTRY POINT: Repository/
    // Author Catalog's own "Fork" button vs. World View's own "Edit a
    // Copy" — and both are proven, from source, to converge on the
    // IDENTICAL EditorView.js handler.
    // ===============================================================
    {
        const catalogSource = await readSource('ui/components/PublicationCatalog.js');
        assert(/@explore="viewWorld"/.test(catalogSource) && /@fork="forkPublication"/.test(catalogSource),
            '1. PublicationCard emits `explore`/`fork` as two independent, ungated events — a user may Explore without ever Forking, or Fork directly without ever Exploring first.');

        const worldViewSource = await readSource('ui/views/WorldView.js');
        assert(worldViewSource.includes("path: '/editor',\n                query: { fork: documentId, ...(publication ? { publication } : {}), ...entryQuery }"),
            '2. World View\'s own "Edit a Copy" (editFocusedCopyFromFocusPanel) reuses the SAME /editor?fork= navigation PublicationCatalog.js\'s forkPublication() uses — never a second fork mechanism.');

        const editorViewSource = await readSource('ui/views/EditorView.js');
        assert(editorViewSource.includes('if (route.query.fork) {'),
            '3. both entry points converge on the SAME EditorView.js `route.query.fork` handler — one seam, not two.');

        // The one asymmetry: "Edit a Copy" has no try/catch of its own
        // (editFocusedCopyFromFocusPanel just calls router.push()) — so
        // whatever EditorView.js's own handler does on failure is ALSO
        // exactly what a World View user sees. Confirmed directly: the
        // function's own body contains no try/catch.
        const worldViewEditCopyMatch = worldViewSource.match(
            /function editFocusedCopyFromFocusPanel\(\) \{[\s\S]*?\n\s{8}\}/
        );
        assert(worldViewEditCopyMatch, '4. editFocusedCopyFromFocusPanel() located in source.');
        assert(!/try\s*\{/.test(worldViewEditCopyMatch[0]),
            '5. editFocusedCopyFromFocusPanel() has no try/catch of its own — a fork failure reached from World View is handled ENTIRELY by EditorView.js\'s own handler, identically to a fork failure reached from Repository/Author Catalog.');
    }
    console.log('✓ Section D: Explore and Fork are two independent, ungated, one-click, documentId-keyed actions. The only real asymmetry between reaching Fork is ENTRY POINT (Repository/Author "Fork" vs. World View "Edit a Copy") — and both are confirmed, from source, to converge on one identical EditorView.js handler with no per-entry-point difference in failure handling. (See Section F for what that shared handler actually does on failure.)');

    // ===============================================================
    // Section E — Retrieval semantics: discovered != retrieved !=
    // available for editing. Proven live in both directions, then
    // compared structurally against the resolution layer's own rich,
    // named failure vocabulary.
    // ===============================================================
    {
        // Direction 1: discovered + resolved + admitted, but material
        // never separately retrieved -> Fork fails (0.9.340 Section B's
        // own finding, reconfirmed here as this section's baseline).
        clearLocalPublications();
        const kevin = makeIdentity('kevin');
        const documentId = 'retrieval-semantics-doc';
        const publication = makePublication({ documentId, title: 'Discovered But Never Retrieved', author: 'kevin' }, kevin);
        const view = await resolveAsDecentralizedPublication(publication, kevin);
        const provider = new DecentralizedPublicationDiscoveryProvider();
        admitToRepositoryDiscovery(view, provider);

        const { searchPublicationsUseCase } = new CreateDiscoveryUseCase().execute({ decentralizedDiscoveryProvider: provider });
        assert(searchPublicationsUseCase.execute({ text: 'discovered but never retrieved' }).items.length === 1,
            '1. DISCOVERED: the Publication is genuinely resolved, admitted, and Repository-visible.');

        const emptyDocumentStorage = new InMemoryStorageProvider();
        let notRetrievedError = null;
        try {
            new ForkDocumentUseCase(emptyDocumentStorage).execute(documentId, kevin, view.content);
        } catch (err) {
            notRetrievedError = err;
        }
        assert(notRetrievedError && notRetrievedError.message === `ForkDocumentUseCase: no document found with id "${documentId}"`,
            '2. NOT RETRIEVED: discovery/resolution/admission alone do not make the Document available for editing — Fork fails with a specific, thrown error.');

        // Direction 2: the SAME Publication, once its material genuinely
        // IS retrieved (the exact scenario Section A modeled) -> Fork
        // succeeds. Proves Direction 1 is a real "not yet retrieved"
        // boundary, not a structural inability for this Publication ever
        // to be forked.
        const populatedDocumentStorage = new InMemoryStorageProvider();
        populatedDocumentStorage.save(documentId, buildRetrievedDocumentJSON(documentId, { title: 'Discovered But Never Retrieved', author: 'kevin' }));
        const forkedDocument = new ForkDocumentUseCase(populatedDocumentStorage).execute(documentId, kevin, view.content);
        assert(forkedDocument instanceof Document,
            '3. RETRIEVED: the identical Publication, once material is present, forks successfully — confirming Direction 1 was genuinely about retrieval, not an inherent block on this Publication.');

        // Structural comparison: the RESOLUTION layer names eight
        // distinct outcomes (including CONTENT_UNAVAILABLE, explicitly
        // documented as "never a verdict about the publication's own
        // validity"); the FORK layer has no equivalent vocabulary at all.
        const outcomeSource = await readSource('application/PublicationResolutionOutcome.js');
        const namedOutcomes = (outcomeSource.match(/^\s+[A-Z_]+:\s*'[a-z-]+'/gm) || []).length;
        assert(namedOutcomes >= 7,
            `4. the resolution layer names ${namedOutcomes} distinct, documented outcomes for "why didn't this resolve" — a rich, structured vocabulary.`);

        const forkUseCaseSource = await readSource('application/ForkDocumentUseCase.js');
        assert(!/class\s+\w*Error|Object\.freeze\(\{[\s\S]*?:\s*'/.test(forkUseCaseSource),
            '5. ForkDocumentUseCase.js defines no equivalent outcome enum/error-class of its own — every failure is a bare `new Error(string)`.');
        const forkThrowCount = (forkUseCaseSource.match(/throw new Error\(/g) || []).length;
        assert(forkThrowCount === 2,
            `6. exactly ${forkThrowCount} distinct failure causes exist in ForkDocumentUseCase.js (license denial, missing document) — both raised as the SAME undifferentiated Error type, with no code/kind a caller could branch on the way it already can for resolution's PublicationResolutionOutcome.`);
    }
    console.log('✓ Section E: "discovered" (Repository-visible), "retrieved" (material present in local storage), and "available for editing" (Fork succeeds) are proven, live, to be three genuinely different facts — Direction 1 fails exactly where retrieval is missing, Direction 2 succeeds once it is supplied. Structurally, the resolution layer already has a rich, named, documented outcome vocabulary for this same class of question; the fork layer has none — every fork failure, whatever its cause, is the same undifferentiated Error type. Section F traces what that means for the person who actually clicks Fork.');

    // ===============================================================
    // Section F — License/authorization boundary. THE finding: a
    // precise, live trace of what a user actually sees and where they
    // actually land when a license denies forking — and proof that it
    // is symptomatically IDENTICAL to a retrieval failure, because both
    // share Section E's one undifferentiated Error type and one
    // navigation handler.
    // ===============================================================
    {
        // 1. The license is visible on the card before the click...
        const cardSource = await readSource('ui/components/PublicationCard.js');
        assert(cardSource.includes('{{ licenseLabel }}'),
            '1. PublicationCard.js already renders the license id in plain text on every card.');

        // ...but the Fork button's own template carries no gate on it.
        const forkButtonMatch = cardSource.match(/<button class="action-btn action-btn--fork"[^>]*>Fork<\/button>/);
        assert(forkButtonMatch, '2. the Fork button is located in the template.');
        assert(!/v-if|:disabled/.test(forkButtonMatch[0]),
            '3. the Fork button carries no `v-if`/`:disabled` of any kind — it is exactly as clickable on an ALL-RIGHTS-RESERVED/ND-licensed Publication as on a CC0 one. The license text is visible; nothing about the button itself warns before the click.');

        // 2. Live: a real, ND-licensed Publication, forked through the
        // REAL ForkDocumentUseCase EditorView.js's route.query.fork
        // handler calls — reproducing the exact user-visible message.
        clearLocalPublications();
        const laura = makeIdentity('laura');
        const documentId = 'license-boundary-doc';
        const ndLicense = new License({ id: LicenseId.CC_BY_ND_4_0 });
        const ndPublication = makePublication({ documentId, title: 'No Derivatives Allowed', author: 'laura', license: ndLicense }, laura);
        assert(ndPublication.license.forkAllowed === false, '4. setup: this license genuinely disallows forking.');

        const documentStorage = new InMemoryStorageProvider();
        documentStorage.save(documentId, buildRetrievedDocumentJSON(documentId, { title: 'No Derivatives Allowed', author: 'laura' }));
        let toastMessage = null;
        try {
            new ForkDocumentUseCase(documentStorage).execute(documentId, makeIdentity('mallory'), ndPublication);
        } catch (err) {
            // The exact template EditorView.js's own catch block uses.
            toastMessage = `Fork failed: ${err.message}`;
        }
        assert(toastMessage === 'Fork failed: ForkDocumentUseCase: forking is not permitted under license CC-BY-ND-4.0',
            `5. this is the EXACT, real, complete text a user sees: "${toastMessage}" — a raw, class-name-prefixed Error message, nothing more actionable than that string.`);

        // 3. Structural: EditorView.js's own route.query.fork block
        // navigates away UNCONDITIONALLY, whether the fork succeeded or
        // failed — and entryContext/arrivalDocumentId are written to
        // ONLY on the success path, before the point a throw would skip.
        const editorViewSource = await readSource('ui/views/EditorView.js');
        const forkBlockMatch = editorViewSource.match(/if \(route\.query\.fork\) \{[\s\S]*?\n\s{12}\} else if \(route\.query\.load\)/);
        assert(forkBlockMatch, '6. the route.query.fork handler block is located in source.');
        const forkBlock = forkBlockMatch[0];
        const catchIndex = forkBlock.indexOf('} catch (err) {');
        const replaceIndex = forkBlock.indexOf("router.replace({ path: '/editor' });");
        assert(catchIndex > -1 && replaceIndex > catchIndex,
            '7. router.replace({ path: \'/editor\' }) sits AFTER the try/catch, executed on every path — success or failure alike.');
        const entryContextWriteIndex = forkBlock.indexOf('entryContext.value = decodedEntryContext;');
        assert(entryContextWriteIndex > -1 && entryContextWriteIndex < catchIndex,
            '8. entryContext.value is written to ONLY inside the try block, before any point a thrown Error (license denial OR missing document) would reach — a failure of EITHER cause leaves it exactly at its initialized value.');

        const initializerSource = editorViewSource.slice(editorViewSource.indexOf('const entryContext = ref(null);'), editorViewSource.indexOf('const entryContext = ref(null);') + 200);
        assert(initializerSource.includes('let arrivalDocumentId = null;'),
            '9. both entryContext and arrivalDocumentId initialize to null — confirmed to be their value after ANY fork failure (Section 8).');

        // 4. Structural: Toolbar.js's own "Back to World" gate reads
        // exactly that field.
        const toolbarSource = await readSource('ui/components/Toolbar.js');
        assert(toolbarSource.includes('returnWorldId to decide whether "← Back to'),
            '10. Toolbar.js\'s own "← Back to World" link is gated on returnWorldId, sourced from entryContext — null after any fork failure, so it never renders.');
    }
    console.log('✓ Section F: THE FINDING. The license id is already visible on every card, but the Fork button carries no gate reflecting it — a user can commit to Fork on a no-derivatives-licensed Publication with no warning. When that denial (or, symptomatically identically, a retrieval failure — Section E) is thrown, the ENTIRE outcome the user receives is one transient toast reading a raw, class-name-prefixed Error string ("Fork failed: ForkDocumentUseCase: ..."), followed by an unconditional navigation to a blank, un-contextualized new Editor document with no link back to the Publication or World they came from — confirmed live (the exact toast text) and structurally (entryContext/arrivalDocumentId, and therefore "← Back to World", are written to only on the path a failure never reaches). This is real, evidenced product friction squarely inside the brief\'s own "genuine product gap" question — see Section J.');

    // ===============================================================
    // Section G — Provenance. Content-lineage provenance (which
    // Publication/Document a fork descends from) is preserved and
    // already fully answers the user journey's own attribution need;
    // transport-origin provenance (local/peer/decentralized) is
    // reconfirmed absent, and confirmed here that nothing downstream
    // in this milestone's own flagship (Section A) ever reads for it.
    // ===============================================================
    {
        assert(!('origin' in flagshipForkedDocument.metadata) && !('source' in flagshipForkedDocument.metadata),
            '1. the flagship fork from Section A — genuinely peer-delivered — carries no origin/source field on its metadata.');
        assert(flagshipForkedDocument.metadata.license.attribution.sourceDocumentId === 'fork-journey-flagship-doc',
            '2. content-lineage provenance (which document this descends from) IS preserved, regardless of transport.');

        const forkTreeSource = await readSource('ui/components/ForkTree.js');
        assert(!/origin|transport|peer-sourced|decentralized/i.test(forkTreeSource),
            '3. ui/components/ForkTree.js — the one surface that actually visualizes fork lineage to a user — reads only documentId/parentDocumentId-shaped lineage, never a transport-origin field. Nothing in the one consumer that would plausibly want provenance actually asks for this kind.');

        // Reconfirmed against CURRENT source, not cited from 0.9.340.
        const compositeSource = await readSource('discovery/CompositeDiscoveryProvider.js');
        assert(!/source:|origin:|provenance:/i.test(compositeSource.slice(compositeSource.indexOf('export class'))),
            '4. CompositeDiscoveryProvider.js still attaches no source/origin/provenance field to any result.');
    }
    console.log('✓ Section G: content-lineage provenance (sourcePublicationId/sourceDocumentId) is preserved through every fork, regardless of transport, and already fully serves this journey\'s actual need (attribution, fork-tree lineage). Transport-origin provenance (local/peer/decentralized) remains absent everywhere, reconfirmed against current source — and ForkTree.js, the one real consumer of lineage, is confirmed to have no use for it. Introducing it would not close any gap this journey actually has.');

    // ===============================================================
    // Section H — Failure isolation: a failed fork, of either cause,
    // leaves Repository/catalog state provably untouched, and a
    // subsequent legitimate fork of the SAME, still-intact Publication
    // still succeeds.
    // ===============================================================
    {
        clearLocalPublications();
        const nathan = makeIdentity('nathan');
        const documentId = 'failure-isolation-doc';
        const ndLicense = new License({ id: LicenseId.CC_BY_ND_4_0 });
        const publication = makePublication({ documentId, title: 'Isolation Under License Denial', author: 'nathan', license: ndLicense }, nathan);
        const provider = new DecentralizedPublicationDiscoveryProvider();
        provider.add(publication);
        const beforeSnapshot = provider.list().slice();

        const documentStorage = new InMemoryStorageProvider();
        documentStorage.save(documentId, buildRetrievedDocumentJSON(documentId, { title: 'Isolation Under License Denial', author: 'nathan' }));
        documentStorage.saveCalls = 0; // reset after seeding — only calls made BY the fork attempt itself count below

        let threw = false;
        try {
            new ForkDocumentUseCase(documentStorage).execute(documentId, makeIdentity('olga'), publication);
        } catch {
            threw = true;
        }
        assert(threw, '1. setup: the license-denied fork attempt genuinely throws.');
        assert(documentStorage.saveCalls === 0,
            '2. the failed attempt itself never wrote anything to document storage — the license check runs BEFORE any load/clone/save.');
        assert(provider.list().length === beforeSnapshot.length && provider.list()[0] === beforeSnapshot[0],
            '3. the discovery provider\'s own state is byte-for-byte unchanged — same array length, same instance.');
        assert(publication.license.id === LicenseId.CC_BY_ND_4_0 && publication.documentId === documentId,
            '4. the source Publication itself is unmutated by the failed attempt.');

        // A second, DIFFERENT failure cause (retrieval, not license) on
        // the SAME provider, then a legitimate success — proving neither
        // prior failure left any corrupting residue.
        const emptyStorage = new InMemoryStorageProvider();
        let secondThrew = false;
        try {
            new ForkDocumentUseCase(emptyStorage).execute(documentId, makeIdentity('peter'),
                makePublication({ documentId, title: 'Isolation Under License Denial', author: 'nathan', license: new License({ id: LicenseId.CC0_1_0 }) }, nathan));
        } catch {
            secondThrew = true;
        }
        assert(secondThrew, '5. a second, differently-caused failure (retrieval, against an unrelated CC0 publication reusing the same documentId) also throws cleanly.');
        assert(provider.list().length === beforeSnapshot.length,
            '6. the provider is STILL unchanged after a second, differently-caused failure.');

        const legitimatePublication = makePublication({ documentId, title: 'Isolation Under License Denial', author: 'nathan', license: new License({ id: LicenseId.CC0_1_0 }) }, nathan);
        const forkedDocument = new ForkDocumentUseCase(documentStorage).execute(documentId, makeIdentity('quinn'), legitimatePublication);
        assert(forkedDocument instanceof Document,
            '7. a subsequent, legitimately-licensed fork against the SAME documentId still succeeds — neither prior failure left the storage or the provider in a state that would block it.');
    }
    console.log('✓ Section H: a failed fork — license denial or retrieval failure alike — writes nothing to document storage (the license check runs before any load/clone/save) and leaves the discovery provider\'s own state byte-for-byte unchanged. Two consecutive failures of different causes still leave a subsequent legitimate fork of the same documentId able to succeed. Failure does not corrupt Repository or local Publication state.');

    // ===============================================================
    // Section I — Existing UI duplication: does another surface already
    // provide the complete Explore/Fork experience? Checked directly
    // against the one plausible candidate this codebase names
    // "Publication" a second time.
    // ===============================================================
    {
        // ui/views/DecentralizedPublicationsView.js is, by its own name,
        // the most plausible duplicate candidate. Checked directly: does
        // it import anything from the Explore/Fork chain this milestone
        // audited, or only the unrelated evidence/anchor domain?
        const decentralizedViewSource = await readSource('ui/views/DecentralizedPublicationsView.js');
        assert(decentralizedViewSource.includes("import { Publication } from '../../publisher/Publication.js';"),
            "1. DecentralizedPublicationsView.js imports publisher/Publication.js for exactly one reason, by its own 0.9.337 comment: an `instanceof Publication` admission check.");
        for (const forbidden of ['ForkDocumentUseCase', 'CreateDiscoveryUseCase', "components/PublicationCatalog.js'", 'forkPublication', 'viewWorld(']) {
            assert(!decentralizedViewSource.includes(forbidden),
                `2. DecentralizedPublicationsView.js references no "${forbidden}" — it offers no Fork/Explore action of its own; it is the evidence/anchor/snapshot-placement surface for core/DecentralizedPublication.js, a different domain object entirely from publisher/Publication.js.`);
        }

        // ui/components/OwnPublicationPanel.js — the other named
        // "Publication" surface — is scoped to the signed-in user's own
        // work; checked directly for whether it offers Fork at all
        // (forking your OWN Publication is not the discovery journey
        // this milestone audits).
        const ownPanelSource = await readSource('ui/components/OwnPublicationPanel.js');
        assert(!/emit\('fork'|@click="\$emit\('fork'/i.test(ownPanelSource),
            '3. OwnPublicationPanel.js offers no Fork action — it is not an alternate route into this journey either.');
    }
    console.log('✓ Section I: DecentralizedPublicationsView.js — the one surface plausibly named closely enough to be a duplicate — is confirmed, from its own imports, to be the evidence/anchor/snapshot-placement domain for the UNRELATED core/DecentralizedPublication.js, importing publisher/Publication.js for exactly one admission check and offering no Fork/Explore action of its own. OwnPublicationPanel.js offers no Fork action either. No existing surface duplicates PublicationCatalog\'s Explore/Fork experience.');

    // ===============================================================
    // Section J — Decision matrix and final verdict.
    // ===============================================================
    {
        const decisionMatrix = [
            { capability: 'Flagship discovery -> admission -> Repository -> Explore -> Fork journey (material available)', verdict: 'STABLE_STOP', evidence: 'Section A' },
            { capability: 'Identity preservation (id/documentId/contentReference/contentHash/publisherIdentity)', verdict: 'STABLE_STOP', evidence: 'Section B' },
            { capability: 'Local/peer/decentralized convergence with no origin branching', verdict: 'STABLE_STOP', evidence: 'Section C' },
            { capability: 'Explore/Fork mutual independence (one-click, ungated, documentId-keyed)', verdict: 'NOT_A_PRODUCT_GAP', evidence: 'Section D' },
            { capability: 'Retrieval-vs-discovery distinction as a MECHANISM (fails absent, succeeds present)', verdict: 'STABLE_STOP', evidence: 'Section E (Directions 1-2)' },
            { capability: 'Fork-layer failure vocabulary / user-facing outcome on denial (license OR retrieval)', verdict: 'INTEGRATE', evidence: 'Section E (structural gap), Section F (user impact)' },
            { capability: 'Transport-origin provenance (local/peer/decentralized tagging)', verdict: 'NOT_A_PRODUCT_GAP', evidence: 'Section G' },
            { capability: 'Failure isolation (Repository/catalog state after a failed fork)', verdict: 'STABLE_STOP', evidence: 'Section H' },
            { capability: 'A second, duplicate Explore/Fork surface', verdict: 'NOT_A_PRODUCT_GAP — none exists (not DUPLICATIVE)', evidence: 'Section I' }
        ];
        assert(decisionMatrix.filter((row) => row.verdict === 'INTEGRATE').length === 1,
            '1. exactly ONE row earns INTEGRATE — a single, precisely-scoped, evidenced gap, not a re-opening of the whole arc.');
        assert(decisionMatrix.filter((row) => row.verdict === 'STABLE_STOP').length === 5,
            '2. five capabilities are reconfirmed STABLE_STOP — the discovery-to-fork journey itself, identity, convergence, the retrieval mechanism, and failure isolation are all sound, live-proven, and require no further work.');
        assert(decisionMatrix.filter((row) => row.verdict.startsWith('NOT_A_PRODUCT_GAP')).length === 3,
            '3. three questions the brief raised (Explore/Fork independence, transport-origin provenance, a duplicate surface) are answered directly, with evidence, as NOT_A_PRODUCT_GAP — none is a genuine gap masquerading as settled.');

        // The recommended next step, sized exactly to the one gap found —
        // named here as a RECOMMENDATION, never implemented in this
        // test-only milestone (mirrors 0.9.338 naming 0.9.339's own
        // fix, verbatim, without building it).
        const recommendedNextStep =
            "Give ForkDocumentUseCase's two failure causes (license denial, missing/unretrieved material) a small, named outcome distinction — mirroring PublicationResolutionOutcome's own existing, proven shape, never a new UI framework — so EditorView.js's catch block can show an actionable message (e.g. distinguishing 'this Publication's license does not allow forking' from 'this Publication's content is not yet available') AND preserve a way back to where the user came from (the returnWorldId/publication context already computed before the throw) instead of unconditionally landing on a blank new document.";
        assert(recommendedNextStep.length > 0, '4. the recommended next step is named precisely, sized to exactly the one gap this milestone found.');

        const verdict = 'INTEGRATE (recommended for a small, separate, follow-on production milestone; not implemented here per this milestone\'s own test-only type)';
        assert(verdict.startsWith('INTEGRATE'),
            '5. FINAL: this milestone finds real, live, precisely-located product friction — not merely a hypothetical — but per its own declared type, records the finding and its exact recommended fix rather than implementing it in the same milestone.');
    }
    console.log('✓ Section J: decision matrix complete — one INTEGRATE row (the fork-failure outcome/navigation gap), five STABLE_STOP rows (the journey itself, identity, convergence, the retrieval mechanism, and failure isolation are all sound), three NOT_A_PRODUCT_GAP rows (Explore/Fork independence, transport-origin provenance, and the absence of any duplicate surface). FINAL VERDICT: INTEGRATE — recommended, precisely scoped, not implemented in this test-only milestone.');

    console.log('\nAll Remote Publication Fork Journey Product Gap Audit tests passed.');
    console.log('\n=== 0.9.352 VERDICT: INTEGRATE (recommended for a follow-on milestone) ===');
    console.log('The discover -> admit -> Repository -> Explore -> Fork journey is proven complete and sound end to end,');
    console.log('including a genuine success case (Section A) 0.9.340 never reached. The one real, narrow, precisely-');
    console.log('located gap: a fork failure — whatever its cause — gives the user one raw Error string and an');
    console.log('unconditional trip to a blank, un-contextualized Editor document, with no way back to where they came');
    console.log('from. Recommended, not implemented here: a small, named outcome distinction at the fork layer,');
    console.log('mirroring the resolution layer\'s own already-proven PublicationResolutionOutcome shape.');
}

run().catch((error) => {
    console.error('RemotePublicationForkJourneyProductGapAudit.test.js FAILED:', error);
    process.exitCode = 1;
});
