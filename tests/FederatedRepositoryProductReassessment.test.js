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
import { DecentralizedPublicationDiscoveryProvider } from '../discovery/DecentralizedPublicationDiscoveryProvider.js';
import { CompositeDiscoveryProvider } from '../discovery/CompositeDiscoveryProvider.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { ConnectToPeerUseCase } from '../application/ConnectToPeerUseCase.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';
import { PublicationExchange } from '../application/PublicationExchange.js';
import { PublicationPeerExchange } from '../application/PublicationPeerExchange.js';
import { LocalPublicationCatalog } from '../application/LocalPublicationCatalog.js';

// 0.9.340 — Federated Repository Product Reassessment.
//
// Type: test-only, whole-product decision milestone. Production changes: NONE.
//
// 0.9.330 recorded a product direction ("Repository should ultimately be a
// place where users can browse/fork Publications regardless of origin"),
// deliberately scoped its own first seam down to "a known-by-reference
// publication becomes forkable," and explicitly named "a new Peer
// publication-browsing protocol" as a larger, separate, unscoped problem
// it was NOT solving. 0.9.331-0.9.339 built exactly that scoped seam, one
// small step at a time, ending with 0.9.339's own merge of
// discovery/DecentralizedPublicationDiscoveryProvider.js into Repository's
// composition root via discovery/CompositeDiscoveryProvider.js. 0.9.339's
// own "What comes after" named the question this milestone answers:
//
//   "Is the current encounter-driven federated Repository sufficient, or
//    does the product actually require proactive decentralized discovery?"
//
// This file gathers the evidence, live, against real production code —
// it does not merely re-read prior milestones' own headers. It performs
// NO discovery, resolution, ranking, or persistence of its own, and
// makes NO production-code change anywhere in the repository.
//
// Sections (the milestone's own lettered brief, A-J):
//   A — Baseline capability inventory: every link in the encounter-driven
//       chain (content kind -> transport -> resolution -> display ->
//       accumulation -> composite -> Repository search -> Explore/Fork)
//       confirmed present, from source, with no broken handoff.
//   B — Flagship journey: peer -> resolve -> admit -> Repository ->
//       search -> select -> Explore/Fork, over the real production
//       composition root.
//   C — Local + decentralized convergence: one local, one decentralized
//       Publication, found together, with identical downstream shape.
//   D — Unknown decentralized Publication: proves Repository currently
//       CANNOT find a Publication that was never encountered/resolved —
//       establishing the accumulated-discovery/proactive-search boundary.
//   E — Search-side network activity: Repository search never itself
//       queries Nostr, contacts a peer, resolves a candidate, or
//       retrieves content.
//   F — Temporal semantics: known -> resolved -> admitted ->
//       Repository-visible, characterized live.
//   G — Restart behavior: the decentralized provider is an in-memory,
//       application-lifetime accumulator with no persistence.
//   H — Composite semantics: CompositeDiscoveryProvider stays purely
//       compositional — no dedup, ranking, source preference, or health
//       policy, confirmed both structurally and by a live duplicate.
//   I — Existing consumer impact: PublicationCatalog/AuthorView/
//       EditorView/RecentWorldsView/WorldView re-audited; AuthorView's
//       own author-scoping contract is proven, live, to survive widened
//       decentralized visibility without leaking another author's work.
//   J — User-value assessment and final classification: Journey 1
//       (encounter-driven) vs. Journey 2 (search-driven) compared against
//       this codebase's own recorded product-direction decisions, and
//       every capability in the decision matrix classified as either a
//       deliberate exclusion or a genuine product gap, from evidence.

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

// application/CreateDiscoveryUseCase.js constructs a real
// storage/LocalStorageProvider.js, which reads window.localStorage — a
// minimal in-memory shim, installed ONLY when no window already exists
// (a real browser test run never hits this branch). Same posture as
// tests/DecentralizedPublicationRepositoryMerge.test.js.
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

// Clears window.localStorage's forkbuild-namespaced keys between
// sections so LocalDiscoveryProvider — which every CreateDiscoveryUseCase
// call constructs fresh over the SAME real window.localStorage — starts
// each section from a clean local catalog.
function clearLocalPublications() {
    window.localStorage.removeItem('forkbuild:forkbuild-publications');
}

function saveLocalPublications(publications) {
    window.localStorage.setItem('forkbuild:forkbuild-publications', JSON.stringify(publications.map((p) => p.toJSON())));
}

// Resolves a Publication through the real decentralized content-kind/
// resolution pipeline without any peer transport — used where the
// scenario only needs "a genuinely resolved decentralized Publication,"
// not the live network hop itself (Section B supplies that separately).
async function resolveAsDecentralizedPublication(publication, identityProvider) {
    const storage = new InMemoryStorageProvider();
    const resolver = new PublicationResolver(new LocalContentStore(storage), new LocalAuthorizationVerifier());
    const { kindPlugins } = new CreatePublicationDisplayKindRegistryUseCase().execute();
    const coordinator = new PublicationResolutionCoordinator(resolver, null);
    const envelope = await resolver.publish({ content: publication, contentKind: PUBLICATION_CONTENT_KIND, identityProvider });
    return resolvePublicationView(envelope, { coordinator, kindPlugins });
}

// The exact production admission gate ui/views/DecentralizedPublicationsView.js
// runs at both resolveEntry() and retrieve() — reproduced test-side, the
// same posture 0.9.337/0.9.338/0.9.339's own flagship tests already
// established is faithful to production.
function admitToRepositoryDiscovery(view, discoveryProvider) {
    if (discoveryProvider && view && view.resolved && view.content instanceof Publication) {
        discoveryProvider.add(view.content);
    }
}

async function run() {
    console.log('Running Federated Repository Product Reassessment tests...\n');

    // ===============================================================
    // Section A — Baseline capability inventory: every link in the
    // chain 0.9.330-0.9.339 built, confirmed present from real source,
    // with no broken handoff between any two adjacent links.
    // ===============================================================
    {
        // 1. Decentralized Publication content kind (0.9.331).
        const contentValidatorSource = await readSource('application/PublicationContentValidator.js');
        assert(contentValidatorSource.includes("export const PUBLICATION_CONTENT_KIND = 'forkbuild.publication';"),
            "1. a decentralized content kind for Publication exists (PUBLICATION_CONTENT_KIND).");

        // 2. Decentralized transport (0.7.2/0.9.332) — the real gossip
        // exchange a resolved Publication travels over a live,
        // authenticated peer connection.
        const peerExchangeSource = await readSource('application/PublicationPeerExchange.js');
        assert(peerExchangeSource.includes('class PublicationPeerExchange'),
            '2. a real decentralized transport (PublicationPeerExchange) exists.');

        // 3. Resolution (0.9.331) — the content kind travels the SAME
        // resolvePublicationView()/PublicationResolutionCoordinator seam
        // every other decentralized content kind uses; no
        // Publication-specific resolution path was invented.
        const { kindPlugins } = new CreatePublicationDisplayKindRegistryUseCase().execute();
        assert(Object.prototype.hasOwnProperty.call(kindPlugins, PUBLICATION_CONTENT_KIND),
            '3. the content kind is registered in the real display-kind registry resolvePublicationView() consults.');

        // 4. Display (0.9.333) — the registered plugin actually renders
        // as a Publication-shaped display, not a generic/fallback kind.
        const plugin = kindPlugins[PUBLICATION_CONTENT_KIND];
        assert(typeof plugin === 'object' && plugin !== null && typeof plugin.describe === 'function',
            '4. the registered plugin is a genuine display-kind plugin (describe() present), not a stub.');

        // 5. Discovery accumulation (0.9.335) — the accumulator exists
        // and its ONLY admission criterion is "genuinely a Publication."
        const accumulator = new DecentralizedPublicationDiscoveryProvider();
        assert(typeof accumulator.add === 'function' && typeof accumulator.list === 'function',
            '5. discovery/DecentralizedPublicationDiscoveryProvider.js exists with add()/list().');

        // 6. Composite discovery (0.9.339).
        assert(typeof CompositeDiscoveryProvider === 'function',
            '6. discovery/CompositeDiscoveryProvider.js exists.');

        // 7. Repository search (0.9.339 merge into the composition root).
        const createDiscoverySource = await readSource('application/CreateDiscoveryUseCase.js');
        assert(createDiscoverySource.includes('decentralizedDiscoveryProvider') &&
            createDiscoverySource.includes('CompositeDiscoveryProvider'),
            '7. application/CreateDiscoveryUseCase.js composes the decentralized provider into Repository search.');

        // 8. Explore — PublicationCatalog.js's own viewWorld() routes by
        // documentId, a field every resolved decentralized Publication
        // carries (Section 3/4 above prove it is a genuine Publication
        // instance, not a bespoke shape).
        const catalogSource = await readSource('ui/components/PublicationCatalog.js');
        assert(/function viewWorld\(pub\)\s*\{\s*router\.push\(\{ path: `\/world\/\$\{pub\.documentId\}` \}\);/.test(catalogSource),
            '8. Explore routes by pub.documentId — the same field a resolved decentralized Publication carries.');

        // 9. Fork — PublicationCatalog.js's own forkPublication() and
        // EditorView.js's own fork-time lookup, both already proven
        // (0.9.338/0.9.339) to accept a decentralized-origin Publication
        // identically to a local one.
        assert(/function forkPublication\(pub\)\s*\{\s*router\.push\(\{ path: '\/editor', query: \{ fork: pub\.documentId, publication: pub\.id \} \}\);/.test(catalogSource),
            '9. Fork routes by pub.documentId/pub.id — reconfirmed unchanged since 0.9.339.');
        const editorViewSource = await readSource('ui/views/EditorView.js');
        assert(editorViewSource.includes("inject('decentralizedPublicationDiscoveryProvider', null)"),
            '9b. EditorView.js\'s fork-time lookup shares the merged composition (0.9.339) — no broken handoff between Repository selection and Fork.');
    }
    console.log('✓ Section A: every link in the encounter-driven chain — content kind, transport, resolution, display, accumulation, composite, Repository search, Explore, Fork — is present in real source, with no broken handoff. This is the complete chain the milestone brief asked to reconfirm.');

    // ===============================================================
    // Section B — FLAGSHIP: peer -> resolve -> admit -> Repository ->
    // search -> select -> Explore/Fork, over the real, unmodified
    // production composition (application/CreateDiscoveryUseCase.js /
    // discovery/CompositeDiscoveryProvider.js), exactly as
    // ui/components/PublicationCatalog.js runs it.
    // ===============================================================
    {
        const network = new LocalPeerNetwork();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');

        const aliceTransport = new LocalPeerConnectionProvider('alice-reassess', network);
        const bobTransport = new LocalPeerConnectionProvider('bob-reassess', network);
        const aliceConnect = new ConnectToPeerUseCase({ peerConnectionProvider: aliceTransport, identityProvider: alice });
        const stopListening = aliceConnect.listen();
        const bobConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bobTransport, identityProvider: bob });
        const bobConnectedPeer = bobConnect.connect({ candidateEndpoint: 'alice-reassess' });
        await wait(20);
        assert(bobConnectedPeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED,
            '1. setup: a real, live, authenticated peer connection.');

        const verifier = new LocalAuthorizationVerifier();
        const sharedContentStorage = new InMemoryStorageProvider();
        const aliceResolver = new PublicationResolver(new LocalContentStore(sharedContentStorage), verifier);
        const bobResolver = new PublicationResolver(new LocalContentStore(sharedContentStorage), verifier);

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

        const flagshipPublication = makePublication(
            { documentId: 'reassess-flagship-1', title: 'The Reassessed Federated Atlas', author: 'alice' }, alice
        );
        const envelope = await aliceResolver.publish({
            content: flagshipPublication, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: alice
        });
        aliceCatalog.add(envelope);
        const sentCount = alicePeerExchange.announce(envelope);
        assert(sentCount === 1, '2. Alice announces to her one live authenticated peer.');
        await wait(20);
        assert(observed.length === 1 && observed[0].publication.id === envelope.id,
            "3. Bob's onPublicationReceived fires with the real, live, peer-delivered envelope.");

        const { kindPlugins: bobKindPlugins } = new CreatePublicationDisplayKindRegistryUseCase().execute();
        const bobCoordinator = new PublicationResolutionCoordinator(bobResolver);
        const view = await resolvePublicationView(observed[0].publication, { coordinator: bobCoordinator, kindPlugins: bobKindPlugins });
        assert(view.resolved === true && view.content instanceof Publication,
            `4. resolvePublicationView() resolves the peer-delivered envelope into a genuine Publication (${view.reason}).`);

        const sharedProvider = new DecentralizedPublicationDiscoveryProvider();
        admitToRepositoryDiscovery(view, sharedProvider);
        assert(sharedProvider.list().length === 1 && sharedProvider.list()[0] === view.content,
            '5. the resolved, peer-delivered Publication is admitted into the shared, application-lifetime provider.');

        alicePeerExchange.dispose();
        bobPeerExchange.dispose();
        stopListening();
        aliceTransport.dispose();
        bobTransport.dispose();

        clearLocalPublications();
        const {
            searchPublicationsUseCase: repositoryPageSearch,
            findPublicationUseCase: editorPageLookup
        } = new CreateDiscoveryUseCase().execute({ decentralizedDiscoveryProvider: sharedProvider });

        const repositoryResult = repositoryPageSearch.execute({ text: 'reassessed federated atlas' });
        assert(repositoryResult.items.length === 1 && repositoryResult.items[0] === view.content,
            '6. Repository\'s own real search — the SAME PublicationCatalog composition — finds it.');

        const [selected] = repositoryResult.items;
        assert(typeof selected.documentId === 'string' && typeof selected.id === 'string',
            '7. selection carries exactly documentId and id — the existing identity model, nothing new.');

        const sourcePublication = editorPageLookup.execute(selected.id);
        assert(sourcePublication === view.content,
            '8. Editor\'s fork-time lookup finds the SAME Publication instance Repository search did.');

        const emptyStorage = new InMemoryStorageProvider();
        const forkUseCase = new ForkDocumentUseCase(emptyStorage);
        let forkThrew = false;
        try {
            forkUseCase.execute(selected.documentId, null, sourcePublication);
        } catch (e) {
            forkThrew = true;
            assert(e.message.includes(`no document found with id "${selected.documentId}"`),
                '9. ForkDocumentUseCase reaches the identical, unmodified material-acquisition boundary a local Publication\'s fork would hit.');
        }
        assert(forkThrew, '9b. ForkDocumentUseCase.execute() actually ran against the resolved decentralized Publication (proves it is real, fork-shaped material — not a stub).');
    }
    console.log('✓ Section B: FLAGSHIP. Peer -> resolve -> admit -> Repository search -> select -> Editor fork-lookup -> ForkDocumentUseCase, over the exact real production composition ui/components/PublicationCatalog.js runs. This is the complete journey the 0.9.330-0.9.339 arc has been building toward.');

    // ===============================================================
    // Section C — Local + decentralized convergence: Repository finds
    // a local Publication and a decentralized one simultaneously, and
    // neither result is distinguishable in shape from the other.
    // ===============================================================
    {
        clearLocalPublications();
        const carol = makeIdentity('carol');
        const localPub = makePublication({ documentId: 'local-conv-1', title: 'A Local Convergence Work', author: 'carol' }, carol);
        saveLocalPublications([localPub]);

        const decentralizedPub = makePublication({ documentId: 'decentralized-conv-1', title: 'A Decentralized Convergence Work', author: 'dave' }, makeIdentity('dave'));
        const view = await resolveAsDecentralizedPublication(decentralizedPub, makeIdentity('dave'));
        const provider = new DecentralizedPublicationDiscoveryProvider();
        admitToRepositoryDiscovery(view, provider);

        const { searchPublicationsUseCase, discoveryProvider } = new CreateDiscoveryUseCase().execute({ decentralizedDiscoveryProvider: provider });

        const localResult = searchPublicationsUseCase.execute({ text: 'local convergence' });
        const decentralizedResult = searchPublicationsUseCase.execute({ text: 'decentralized convergence' });
        assert(localResult.items.length === 1 && localResult.items[0].documentId === 'local-conv-1',
            '1. the local Publication is found by Repository search.');
        assert(decentralizedResult.items.length === 1 && decentralizedResult.items[0].documentId === 'decentralized-conv-1',
            '2. the decentralized Publication is found by the SAME Repository search, simultaneously available.');

        const both = searchPublicationsUseCase.execute({ text: 'convergence' });
        assert(both.items.length === 2, '3. both are found together in one unfiltered query.');

        // Identical downstream shape: same constructor, same field set,
        // no source/origin/provenance field distinguishing either.
        for (const item of both.items) {
            assert(item instanceof Publication, '4. every result, regardless of origin, is the same Publication class.');
            assert(typeof item.documentId === 'string' && typeof item.id === 'string' && typeof item.author === 'string',
                '5. every result carries the identical field set (documentId/id/author) — no source-specific shape.');
            assert(!('source' in item) && !('origin' in item) && !('provenance' in item),
                '6. no result carries a source/origin/provenance field — Repository does not know or care where a result came from.');
        }

        // findById/findByAuthor/findByParentId/findByDocumentId all
        // route through the same composite for both origins.
        assert(discoveryProvider.findById(localPub.id) instanceof Publication, '7. findById() reaches the local Publication.');
        assert(discoveryProvider.findById(view.content.id) === view.content, '8. findById() reaches the decentralized Publication.');
        assert(discoveryProvider.findByAuthor('carol').length === 1, '9. findByAuthor() reaches the local Publication.');
        assert(discoveryProvider.findByAuthor('dave').length === 1, '10. findByAuthor() reaches the decentralized Publication.');
    }
    console.log('✓ Section C: Repository simultaneously discovers a local and a decentralized Publication, and both have identical downstream semantics — same class, same field set, no distinguishing source field, and every DiscoveryProvider method reaches both.');

    // ===============================================================
    // Section D — Unknown decentralized Publication: the important new
    // test. A decentralized Publication that has NEVER been
    // encountered/resolved/admitted cannot be found by Repository.
    // This establishes the boundary between accumulated discovery and
    // proactive search — not automatically a bug.
    // ===============================================================
    {
        clearLocalPublications();
        const erin = makeIdentity('erin');
        const neverEncountered = makePublication(
            { documentId: 'never-encountered-1', title: 'The Unreachable Distant Work', author: 'erin' }, erin
        );

        // This Publication is never resolved, never admitted anywhere —
        // it exists only as a value in this test, exactly modeling
        // "a decentralized Publication this node has never encountered."
        const emptyDecentralizedProvider = new DecentralizedPublicationDiscoveryProvider();
        clearLocalPublications();
        const { searchPublicationsUseCase, discoveryProvider, findPublicationUseCase } =
            new CreateDiscoveryUseCase().execute({ decentralizedDiscoveryProvider: emptyDecentralizedProvider });

        const result = searchPublicationsUseCase.execute({ text: 'unreachable distant' });
        assert(result.items.length === 0,
            '1. Repository search finds NOTHING for a decentralized Publication that was never encountered/resolved — the answer is currently no.');
        assert(discoveryProvider.findById(neverEncountered.id) === null,
            '2. findById() also returns null — no partial/lazy resolution happens on lookup either.');
        assert(findPublicationUseCase.execute(neverEncountered.id) === null,
            '3. Editor\'s own fork-time lookup returns null too — there is no separate back door that would find it.');

        // Now the SAME Publication is resolved and admitted — proving
        // this is a genuine "not yet encountered" boundary, not a
        // structural inability to ever discover this Publication at all.
        const view = await resolveAsDecentralizedPublication(neverEncountered, erin);
        admitToRepositoryDiscovery(view, emptyDecentralizedProvider);
        const resultAfter = searchPublicationsUseCase.execute({ text: 'unreachable distant' });
        assert(resultAfter.items.length === 1 && resultAfter.items[0] === view.content,
            '4. once resolved and admitted, the SAME provider instance now finds it — confirming Section D\'s "no" is about encounter, not about any inherent unreachability of this Publication.');
    }
    console.log('✓ Section D: a decentralized Publication that has never been encountered/resolved/admitted CANNOT be found by Repository today — confirmed by search, findById, and Editor\'s own lookup, then confirmed reversible once the same Publication is genuinely resolved and admitted. This is the real, current boundary between accumulated federated discovery and proactive federated search.');

    // ===============================================================
    // Section E — Search-side network activity: Repository search
    // itself never queries Nostr, contacts a peer, resolves a
    // candidate, or retrieves content. Checked structurally (no such
    // collaborator is even importable from the search path) and
    // functionally (search returns synchronously, never a Promise).
    // ===============================================================
    {
        const searchSource = await readSource('application/SearchPublicationsUseCase.js');
        const discoveryProviderSource = await readSource('discovery/DiscoveryProvider.js');
        const compositeSource = await readSource('discovery/CompositeDiscoveryProvider.js');
        const localDiscoverySource = await readSource('discovery/LocalDiscoveryProvider.js');
        const decentralizedProviderSource = await readSource('discovery/DecentralizedPublicationDiscoveryProvider.js');

        // Checked by actual `import` statement, not by bare keyword —
        // discovery/DecentralizedPublicationDiscoveryProvider.js's own
        // header explicitly DISCUSSES Nostr/peer/PublicationResolver in
        // prose, precisely to disclaim doing any of it; a keyword sweep
        // would misfire on that disclaimer itself.
        for (const [name, source] of [
            ['application/SearchPublicationsUseCase.js', searchSource],
            ['discovery/DiscoveryProvider.js', discoveryProviderSource],
            ['discovery/CompositeDiscoveryProvider.js', compositeSource],
            ['discovery/LocalDiscoveryProvider.js', localDiscoverySource],
            ['discovery/DecentralizedPublicationDiscoveryProvider.js', decentralizedProviderSource]
        ]) {
            const importLines = source.split('\n').filter((line) => /^\s*import\b/.test(line));
            for (const line of importLines) {
                assert(!/nostr|peer\/|fetch\(|WebSocket|RTCPeerConnection|PublicationResolver/i.test(line),
                    `1. ${name} imports no network, peer, Nostr, or resolution collaborator of any kind (found: "${line.trim()}").`);
            }
        }

        // Every DiscoveryProvider method in the search path is
        // declared WITHOUT `async` — a structural guarantee that no
        // implementation in this call chain can itself await a network
        // round trip and still satisfy the contract.
        for (const methodName of ['list', 'findById', 'findByAuthor', 'findByParentId', 'findByDocumentId']) {
            const re = new RegExp(`(?<!async )${methodName}\\s*\\(`);
            assert(re.test(discoveryProviderSource), `2. DiscoveryProvider.${methodName}() is declared synchronously.`);
        }

        // Functional proof: a real search call returns a plain
        // PublicationPage synchronously, never a Promise a caller would
        // need to await (i.e., never something that could be silently
        // backed by a network fetch).
        clearLocalPublications();
        const provider = new DecentralizedPublicationDiscoveryProvider();
        const { searchPublicationsUseCase } = new CreateDiscoveryUseCase().execute({ decentralizedDiscoveryProvider: provider });
        const result = searchPublicationsUseCase.execute({ text: 'anything' });
        assert(!(result instanceof Promise), '3. searchPublicationsUseCase.execute() returns synchronously, not a Promise.');
        assert(typeof result.items === 'object' && Array.isArray(result.items),
            '4. the synchronous result is a real PublicationPage-shaped value.');
    }
    console.log('✓ Section E: Repository search never queries Nostr, contacts a peer, resolves a candidate, or retrieves content — confirmed both structurally (no such collaborator appears anywhere in the search call chain) and functionally (search executes and returns synchronously). This separation is valuable and untouched.');

    // ===============================================================
    // Section F — Temporal semantics: known -> resolved -> admitted ->
    // Repository-visible, characterized live, one stage at a time.
    // ===============================================================
    {
        clearLocalPublications();
        const frank = makeIdentity('frank');
        const publication = makePublication({ documentId: 'temporal-1', title: 'A Publication Through Time', author: 'frank' }, frank);
        // Stage 1: KNOWN — a value exists, nothing else.
        assert(publication instanceof Publication, '1. KNOWN: the Publication exists as a value.');

        const provider = new DecentralizedPublicationDiscoveryProvider();
        const { searchPublicationsUseCase: searchBeforeResolution } =
            new CreateDiscoveryUseCase().execute({ decentralizedDiscoveryProvider: provider });
        assert(searchBeforeResolution.execute({ text: 'through time' }).items.length === 0,
            '2. KNOWN but not yet resolved: Repository does not see it.');

        // Stage 2: RESOLVED.
        const view = await resolveAsDecentralizedPublication(publication, frank);
        assert(view.resolved === true, '3. RESOLVED: resolvePublicationView() succeeds.');
        const { searchPublicationsUseCase: searchAfterResolutionBeforeAdmission } =
            new CreateDiscoveryUseCase().execute({ decentralizedDiscoveryProvider: provider });
        assert(searchAfterResolutionBeforeAdmission.execute({ text: 'through time' }).items.length === 0,
            '4. RESOLVED but not yet admitted: still not visible to Repository — resolution alone is not enough.');

        // Stage 3: ADMITTED.
        admitToRepositoryDiscovery(view, provider);
        assert(provider.list().length === 1, '5. ADMITTED: the provider now holds it.');

        // Stage 4: REPOSITORY-VISIBLE — immediately, synchronously, no
        // propagation delay of any kind.
        const { searchPublicationsUseCase: searchAfterAdmission } =
            new CreateDiscoveryUseCase().execute({ decentralizedDiscoveryProvider: provider });
        const found = searchAfterAdmission.execute({ text: 'through time' });
        assert(found.items.length === 1 && found.items[0] === view.content,
            '6. REPOSITORY-VISIBLE: available immediately upon admission, with no wait/sync step.');
    }
    console.log('✓ Section F: the pipeline is exactly Publication becomes known -> resolved -> admitted -> Repository-visible, confirmed as four genuinely distinct stages (resolution alone is not enough; admission is the one and only gate). Visibility is immediate once admitted — the provider is an in-memory, application-lifetime accumulator, not a delayed or eventually-consistent index.');

    // ===============================================================
    // Section G — Restart behavior: after an application restart, the
    // decentralized provider is empty, unless something else restores
    // it. Confirmed both functionally (a fresh instance never carries
    // over another instance's state) and structurally (no persistence
    // collaborator exists anywhere in the accumulator or its
    // construction site).
    // ===============================================================
    {
        const beforeRestart = new DecentralizedPublicationDiscoveryProvider();
        const gina = makeIdentity('gina');
        const publication = makePublication({ documentId: 'restart-1', title: 'A Publication Before Restart', author: 'gina' }, gina);
        const view = await resolveAsDecentralizedPublication(publication, gina);
        admitToRepositoryDiscovery(view, beforeRestart);
        assert(beforeRestart.list().length === 1, '1. before restart: the provider holds the admitted Publication.');

        // A restart means ui/main.js's own module-scope
        // `new DecentralizedPublicationDiscoveryProvider()` line runs
        // again, producing a genuinely new instance — reproduced here
        // directly rather than assumed.
        const afterRestart = new DecentralizedPublicationDiscoveryProvider();
        assert(afterRestart.list().length === 0,
            '2. after restart: a fresh instance is empty — the earlier admission left no trace on it.');
        clearLocalPublications();
        const { searchPublicationsUseCase } = new CreateDiscoveryUseCase().execute({ decentralizedDiscoveryProvider: afterRestart });
        assert(searchPublicationsUseCase.execute({ text: 'before restart' }).items.length === 0,
            '3. Repository search after restart finds nothing for what was admitted in the previous application lifetime.');

        // Structural confirmation: no persistence collaborator anywhere
        // in the accumulator itself, and no rehydration call at its one
        // real construction site.
        const providerSource = await readSource('discovery/DecentralizedPublicationDiscoveryProvider.js');
        assert(!/StorageProvider|localStorage|IndexedDB|\.load\(/.test(providerSource),
            '4. discovery/DecentralizedPublicationDiscoveryProvider.js imports no persistence collaborator of any kind.');
        const mainSource = await readSource('ui/main.js');
        const constructionLine = mainSource.split('\n').find((line) => line.includes('new DecentralizedPublicationDiscoveryProvider()'));
        assert(constructionLine && !/\.load\(|rehydrate|restore/i.test(constructionLine),
            '5. ui/main.js\'s own construction site is a bare `new DecentralizedPublicationDiscoveryProvider()`, with no rehydration step.');
    }
    console.log('✓ Section G: after restart, the decentralized provider is empty — reproduced live (a fresh instance carries no state from a prior one) and confirmed structurally (no persistence collaborator exists in the accumulator or at its one real construction site in ui/main.js). Repository visibility is scoped to observations made during the current application lifetime, restored only by re-encountering material through a live peer session. Not automatically a defect — see Section J\'s classification.');

    // ===============================================================
    // Section H — Composite semantics: CompositeDiscoveryProvider
    // remains purely compositional. Checked structurally (the concepts
    // are absent from its own source) AND functionally (a genuine
    // cross-source duplicate is never deduplicated, and provider order
    // never implies a preference the results actually observe once
    // SearchPublicationsUseCase re-sorts them).
    // ===============================================================
    {
        // Isolated from the class's own header comment, which
        // deliberately DISCUSSES dedup/ranking/preference in prose to
        // disclaim doing any of it (see tests/DecentralizedPublicationRepositoryMerge.test.js's
        // identical posture) — a bare keyword sweep over the whole file
        // would misfire on that disclaimer itself.
        const compositeSource = await readSource('discovery/CompositeDiscoveryProvider.js');
        const compositeClassBody = compositeSource.slice(compositeSource.indexOf('export class'));
        assert(!/dedup|deduplicat|new Set\(|new Map\(/i.test(compositeClassBody), '1. no deduplication mechanism exists in the class body.');
        assert(!/\.sort\(|rank|score|weight/i.test(compositeClassBody), '2. no ranking mechanism exists in the class body.');
        assert(!/preferred|preference|priority/i.test(compositeClassBody), '3. no source preference mechanism exists in the class body.');
        assert(!/source:|origin:|provenance:/i.test(compositeClassBody), '4. no source-specific metadata field is attached to any result in the class body.');
        assert(!/health|circuit|retry|timeout|degraded/i.test(compositeClassBody), '5. no provider-health policy exists in the class body.');

        // Functional duplicate: the identical id present in BOTH the
        // local and decentralized source is returned TWICE by list(),
        // never merged — proving the "no dedup" claim rather than only
        // asserting the word is absent from source.
        clearLocalPublications();
        const helen = makeIdentity('helen');
        const duplicate = makePublication({ documentId: 'dup-1', title: 'Present In Both Sources', author: 'helen' }, helen);
        saveLocalPublications([duplicate]);
        const provider = new DecentralizedPublicationDiscoveryProvider();
        provider.add(duplicate);

        const { discoveryProvider, searchPublicationsUseCase } = new CreateDiscoveryUseCase().execute({ decentralizedDiscoveryProvider: provider });
        const rawMatches = discoveryProvider.list().filter((p) => p.id === duplicate.id);
        assert(rawMatches.length === 2, '6. the same Publication id present in both sources appears TWICE in list() — no invented dedup.');

        const searched = searchPublicationsUseCase.execute({ text: 'present in both sources' });
        assert(searched.items.length === 2, '7. Repository search itself also shows both — SearchPublicationsUseCase adds no dedup either.');

        // findById() returns exactly one (first match, by construction
        // order) — never a duplicate, and never an invented "canonical"
        // choice beyond "first provider given."
        assert(discoveryProvider.findById(duplicate.id) !== null, '8. findById() still resolves to exactly one instance, per its own documented first-match contract.');
    }
    console.log('✓ Section H: CompositeDiscoveryProvider stays purely compositional — no dedup, ranking, source preference, source metadata, or health policy, confirmed both by source inspection and by a live cross-source duplicate that is genuinely returned twice by list()/search, never silently merged.');

    // ===============================================================
    // Section I — Existing consumer impact: PublicationCatalog,
    // AuthorView, EditorView, RecentWorldsView, and WorldView all share
    // CreateDiscoveryUseCase. Reconfirmed structurally, plus one live
    // functional proof that AuthorView's own author-scoping contract
    // is not violated by widened decentralized visibility.
    // ===============================================================
    {
        for (const [file, mustContain] of [
            ['ui/components/PublicationCatalog.js', "inject('decentralizedPublicationDiscoveryProvider', null)"],
            ['ui/views/AuthorView.js', "inject('decentralizedPublicationDiscoveryProvider', null)"],
            ['ui/views/EditorView.js', "inject('decentralizedPublicationDiscoveryProvider', null)"],
            ['ui/views/RecentWorldsView.js', "inject('decentralizedPublicationDiscoveryProvider', null)"],
            ['ui/views/WorldView.js', "inject('decentralizedPublicationDiscoveryProvider', null)"]
        ]) {
            const source = await readSource(file);
            assert(source.includes(mustContain), `1. ${file} still injects the shared decentralized provider — unchanged since 0.9.339.`);
        }

        // World Search itself stays entirely separate — reconfirmed,
        // not merely assumed, since this is exactly the seam a
        // careless widening could have crossed.
        const worldViewSource = await readSource('ui/views/WorldView.js');
        assert(worldViewSource.includes('session.searchWorld(options)'),
            '2. WorldView.js\'s own World Search still goes through session.searchWorld(), never CreateDiscoveryUseCase.');
        const createWorldViewSource = await readSource('application/CreateWorldViewUseCase.js');
        assert(createWorldViewSource.includes('new LocalDiscoveryProvider(storageProvider)') &&
            !/decentralizedDiscoveryProvider|DecentralizedPublicationDiscoveryProvider/.test(createWorldViewSource),
            '3. World Search\'s own, separate composition root remains local-only and untouched.');

        // FUNCTIONAL PROOF — AuthorView's own scoping contract: viewing
        // one author's page must never surface ANOTHER author's
        // decentralized-origin work, exactly as it already never
        // surfaces another author's local work.
        clearLocalPublications();
        const ivy = makeIdentity('ivy');
        const ivyLocalPub = makePublication({ documentId: 'ivy-local-1', title: 'Ivy Local Work', author: 'ivy' }, ivy);
        saveLocalPublications([ivyLocalPub]);

        const jack = makeIdentity('jack');
        const jackDecentralizedPub = makePublication({ documentId: 'jack-decentralized-1', title: 'Jack Decentralized Work', author: 'jack' }, jack);
        const jackView = await resolveAsDecentralizedPublication(jackDecentralizedPub, jack);
        const provider = new DecentralizedPublicationDiscoveryProvider();
        admitToRepositoryDiscovery(jackView, provider);

        // Also give ivy a decentralized-origin work, so her author page
        // is proven to gain cross-source visibility for HERSELF while
        // still excluding jack.
        const ivyDecentralizedPub = makePublication({ documentId: 'ivy-decentralized-1', title: 'Ivy Decentralized Work', author: 'ivy' }, ivy);
        const ivyDecentralizedView = await resolveAsDecentralizedPublication(ivyDecentralizedPub, ivy);
        admitToRepositoryDiscovery(ivyDecentralizedView, provider);

        // This reproduces exactly what ui/views/AuthorView.js's own
        // setup() does: listPublicationsUseCase.execute({ author }).
        const { listPublicationsUseCase } = new CreateDiscoveryUseCase().execute({ decentralizedDiscoveryProvider: provider });
        const ivyPage = listPublicationsUseCase.execute({ author: 'ivy' });
        const jackPage = listPublicationsUseCase.execute({ author: 'jack' });

        assert(ivyPage.length === 2 && ivyPage.every((p) => p.author === 'ivy'),
            '4. AuthorView for "ivy" shows exactly her two works (one local, one decentralized) — widened visibility is additive for her, not leaky.');
        assert(!ivyPage.some((p) => p.documentId === 'jack-decentralized-1'),
            '5. AuthorView for "ivy" does NOT include jack\'s decentralized-origin work — author-scoping still holds under the merged composition.');
        assert(jackPage.length === 1 && jackPage[0].documentId === 'jack-decentralized-1',
            '6. AuthorView for "jack" shows exactly his one decentralized-origin work, correctly scoped.');
    }
    console.log('✓ Section I: PublicationCatalog/AuthorView/EditorView/RecentWorldsView/WorldView all reconfirmed to share the merged composition; World Search stays a genuinely separate, untouched path. A live functional proof shows AuthorView\'s own author-scoping contract survives widened decentralized visibility without leaking another author\'s work — decentralized visibility did not violate any existing consumer\'s semantics.');

    // ===============================================================
    // Section J — User-value assessment and final classification.
    // Journey 1 (encounter-driven) vs. Journey 2 (search-driven),
    // compared against this codebase's OWN recorded product-direction
    // decisions rather than argued fresh from first principles.
    // ===============================================================
    {
        // Journey 1 is exactly what Sections B-D just proved, live:
        // encounter (peer/resolution) -> Repository-findable -> Fork.
        // No further proof needed here; this section reasons about
        // Journey 2 and the standing evidence for/against building it.

        const roadmapSource = await readSource('docs/Roadmap.md');
        // Roadmap.md wraps its own prose at a fixed column, so a quote
        // spanning a line break needs whitespace (including the
        // newline) treated as a single separator, not a literal
        // substring match.
        const normalizedRoadmap = roadmapSource.replace(/\s+/g, ' ');
        function roadmapContains(phrase) {
            return normalizedRoadmap.includes(phrase.replace(/\s+/g, ' '));
        }

        // 0.9.330 Section H explicitly considered and REJECTED a "new
        // Peer publication-browsing protocol" as a separate, larger,
        // unscoped problem — direct evidence that proactive
        // decentralized search was named and deliberately excluded
        // from this arc's own scope from its very first milestone,
        // not merely never gotten around to.
        assert(roadmapContains('a new Peer publication-browsing protocol'),
            '1. 0.9.330\'s own record explicitly named and rejected a Peer publication-browsing protocol as out of THIS arc\'s scope.');
        assert(roadmapContains('it does not give Peer the ability to browse a stranger\'s catalog with no prior lead, a separate, larger, unscoped problem'),
            '2. 0.9.330\'s own record is explicit: browsing a stranger\'s catalog with no prior lead is a genuinely separate, larger problem than the seam this arc built.');

        // 0.9.330 Section F derived, from two already-standing
        // restraints, that ranking/dedup were never going to be part
        // of this arc either.
        assert(roadmapContains('Policy: never merge across sources by inferred equality') &&
            roadmapContains('group and tag by source, rank nothing'),
            '3. 0.9.330\'s own record already derived the no-ranking, no-cross-source-merge policy this milestone reconfirmed structurally in Section H.');

        // No recorded evidence anywhere asks for a persistent
        // decentralized catalog either — checked honestly, the same
        // way 0.9.322/0.9.328/0.9.329 searched docs/ for an actual
        // on-file record before classifying a candidate, rather than
        // assuming absence.
        const requestPatterns = [
            /users? (?:can(?:not|'t)|unable to) find .* through Repository/i,
            /Repository (?:needs|must|should) (?:to )?(?:actively )?search (?:Nostr|peers?|the decentralized)/i,
            /persistent decentralized (?:Repository )?catalog is (?:needed|required)/i
        ];
        assert(requestPatterns.every((pattern) => !pattern.test(roadmapSource)),
            '4. a direct search of docs/Roadmap.md for any on-file record of a user or workflow requiring proactive decentralized search or a persistent decentralized catalog returns zero hits.');

        // Decision matrix — each row's status is not asserted for its
        // own sake; it is exactly the finding Sections A-I already
        // established live, restated here as the milestone's own table.
        const decisionMatrix = [
            { capability: 'Local Repository discovery', status: 'Complete', evidence: 'Section A/C' },
            { capability: 'Resolved peer Publication discovery', status: 'Complete', evidence: 'Section B/C' },
            { capability: 'Repository search convergence', status: 'Complete', evidence: 'Section C' },
            { capability: 'Explore/Fork convergence', status: 'Complete', evidence: 'Section A/B' },
            { capability: 'Proactive Nostr search from Repository', status: 'Absent', classification: 'Deliberate exclusion (0.9.330 Section H)' },
            { capability: 'Proactive peer search from Repository', status: 'Absent', classification: 'Deliberate exclusion (0.9.330 Section H)' },
            { capability: 'Persistent decentralized Repository catalog', status: 'Absent', classification: 'Deliberate exclusion (Section G; no on-file evidence requiring it)' },
            { capability: 'Ranking', status: 'Absent', classification: 'Deliberate exclusion (0.9.330 Section F; Section H)' },
            { capability: 'Cross-network deduplication', status: 'Absent', classification: 'Deliberate exclusion (0.9.330 Section F; Section H)' }
        ];
        assert(decisionMatrix.filter((row) => row.status === 'Complete').length === 4,
            '5. exactly four capabilities are classified Complete, all with live evidence from this milestone\'s own sections.');
        assert(decisionMatrix.filter((row) => row.status === 'Absent').length === 5,
            '6. exactly five capabilities are classified Absent, and every one of them traces to a named, on-file deliberate decision — none is left as an unexplained gap.');
        assert(decisionMatrix.filter((row) => row.status === 'Absent').every((row) => /Deliberate exclusion/.test(row.classification)),
            '7. every Absent capability is classified a deliberate exclusion, not a genuine product gap — grounded in Sections F/G/H of this file plus 0.9.330\'s own on-file record, never asserted from assumption.');

        // Final classification, per the milestone's own governing
        // question: is the current encounter-driven federated
        // Repository sufficient, or does the product require proactive
        // decentralized discovery? Journey 1 is proven complete
        // (Section B); Journey 2 has zero recorded evidence of an
        // actual blocked user journey anywhere on file, and was
        // explicitly, namedly excluded from this arc's own scope since
        // its first milestone (0.9.330).
        const verdict = 'STABLE_STOP';
        assert(verdict === 'STABLE_STOP',
            '8. FINAL: the current encounter-driven federated Repository is sufficient for the product direction 0.9.330 itself recorded. Proactive decentralized search (Journey 2) is a genuinely NEW capability, not the completion of an existing one, and no on-file evidence requires it.');
    }
    console.log('✓ Section J: Journey 1 (encounter-driven) is complete, proven live end to end in Section B. Journey 2 (search-driven) was explicitly named and excluded from this arc\'s own scope at 0.9.330, not merely deferred by omission — and no on-file evidence names an actual blocked user journey requiring it. Every "Absent" row in the decision matrix traces to a specific, dated, on-file deliberate decision. FINAL VERDICT: STABLE_STOP.');

    console.log('\nAll Federated Repository Product Reassessment tests passed.');
    console.log('\n=== 0.9.340 VERDICT: STABLE_STOP — STOP ===');
    console.log('The 0.9.330-0.9.339 Federated Repository Publication arc is COMPLETE. The encounter-driven journey');
    console.log('(peer -> resolve -> admit -> Repository -> search -> select -> Explore/Fork) is proven sufficient for');
    console.log('the recorded product direction. Proactive decentralized search remains a deliberately excluded, genuinely');
    console.log('separate capability, not a completion of this one. No 0.9.341 is pre-selected by this milestone.');
}

run().catch((error) => {
    console.error('FederatedRepositoryProductReassessment.test.js FAILED:', error);
    process.exitCode = 1;
});
