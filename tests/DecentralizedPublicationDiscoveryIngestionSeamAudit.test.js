import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { License } from '../core/License.js';
import { DecentralizedPublication } from '../core/DecentralizedPublication.js';
import { PublicationExchange } from '../application/PublicationExchange.js';
import { PublicationResolver } from '../application/PublicationResolver.js';
import { PublicationResolutionOutcome } from '../application/PublicationResolutionOutcome.js';
import { PublicationResolutionCoordinator } from '../application/PublicationResolutionCoordinator.js';
import { resolvePublicationView } from '../application/PublicationResolutionView.js';
import { CreatePublicationDisplayKindRegistryUseCase } from '../application/CreatePublicationDisplayKindRegistryUseCase.js';
import { CreateDiscoveryUseCase } from '../application/CreateDiscoveryUseCase.js';
import { PUBLICATION_CONTENT_KIND, createPublicationContentKind } from '../application/PublicationContentKind.js';
import { LocalPublicationCatalog } from '../application/LocalPublicationCatalog.js';
import { PublicationPeerExchange } from '../application/PublicationPeerExchange.js';
import { ConnectToPeerUseCase } from '../application/ConnectToPeerUseCase.js';
import { DecentralizedPublicationDiscoveryProvider } from '../discovery/DecentralizedPublicationDiscoveryProvider.js';
import { SearchPublicationsUseCase } from '../application/SearchPublicationsUseCase.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';

// 0.9.336 — Decentralized Publication Discovery Ingestion Seam Audit.
//
// Test-only. Production changes: none (enforced by Section K's own git-diff
// guard). 0.9.335 closed the accumulator gap 0.9.334's own Section F named:
// discovery/DecentralizedPublicationDiscoveryProvider.js is real, tested, and
// deliberately unwired — a caller resolves a candidate through the existing
// decentralized pipeline elsewhere, then hands the result to add(). Its own
// "What comes after" pointed here explicitly:
//
//   an ingestion-seam audit asking which existing decentralized discovery
//   mechanism (Nostr publication discovery, peer exchange, or another)
//   could naturally feed a resolved candidate into add() — the smallest
//   real production ingestion point — before any milestone wires actual
//   decentralized discovery into this provider or touches Repository's own
//   composition root.
//
// This milestone answers that question, and only that question. It traces
// two candidate routes fresh against source (never by citation), corrects
// the originating brief's own Route A diagram where it does not survive
// contact with source, and characterizes provider lifetime and repeated
// observations — building nothing.
//
//   Section A — Vocabulary/diagram correction: the brief's own Route A
//               diagram names a PublicationResolver call that does not
//               exist in application/PublicationPeerExchange.js or
//               application/PublicationExchange.js.
//   Section B — Route A, traced fresh: what peer reception actually
//               produces (a cataloged ENVELOPE, never a resolved
//               Publication) and the one real event it fires.
//   Section C — Where resolution of that envelope actually happens today:
//               application/PublicationResolutionView.js#resolvePublicationView(),
//               an application-layer function, wired to the peer event
//               from exactly one production call site.
//   Section D — FLAGSHIP: the whole Route A seam, live, over a real
//               authenticated peer connection, using the real production
//               kindPlugins registry — then (test-only) into add() and
//               Repository's own real, unmodified SearchPublicationsUseCase.
//   Section E — Is the seam application-level or UI-only? Answered
//               honestly: application-layer function, UI-only caller.
//   Section F — Route B, traced fresh: no existing Nostr mechanism
//               produces a forkbuild.publication candidate at all — there
//               is no resolution to terminate anywhere, "at the caller" or
//               otherwise.
//   Section G — One seam or two? Answered: one, and it is catalog-shaped,
//               not peer-specific.
//   Section H — Provider lifetime, characterized against the TWO different
//               composition patterns this codebase already uses.
//   Section I — Repeated observations, characterized live.
//   Section J — Repository visibility, proven end to end without wiring
//               Repository's own composition root.
//   Section K — No production file touched.
//   Section L — Final classification.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function readSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

function grepFiles(pattern, dirs, { ignoreCase = false } = {}) {
    let hits = '';
    try {
        const flags = ignoreCase ? '-rliE' : '-rlE';
        hits = execSync(`grep ${flags} "${pattern}" ${dirs.join(' ')} --include="*.js" || true`,
            { cwd: SOURCE_ROOT.pathname }).toString();
    } catch { /* grep exits non-zero on no match; treated as zero hits */ }
    return hits.trim() ? hits.trim().split('\n') : [];
}

function normalizeProse(text) {
    return text.replace(/\/\//g, ' ').replace(/\s+/g, ' ').trim();
}

function proseIncludes(haystack, needle) {
    return normalizeProse(haystack).includes(normalizeProse(needle));
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

// Mirrors publisher/LocalPublisherProvider.js's own real construction shape
// — never a hand-rolled shape invented for this audit alone. Identical to
// tests/FederatedRepositoryDiscoverySeamAudit.test.js's own helper.
function makeLocalStylePublication({ documentId, title, author }, identityProvider) {
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
        license: new License({ id: 'CC0-1.0' }),
        contentReference: documentContentReference,
        publisherIdentity: identityProvider.getSigningIdentity().toJSON(),
        signature: null
    });
    publication = publication.withSignature(identityProvider.signCanonical(publication.getSigningDescriptor()));
    return publication;
}

async function run() {
    console.log('Running Decentralized Publication Discovery Ingestion Seam Audit tests...\n');

    // ===============================================================
    // Section A — Vocabulary/diagram correction: the brief's own Route A
    // diagram is checked against source before anything else, the same
    // discipline 0.9.330/0.9.334 already applied to their own briefs.
    // ===============================================================
    {
        // A1. The brief's own diagram reads:
        //   PublicationPeerExchange -> PublicationExchange ->
        //   PublicationResolver -> Publication -> ??? -> provider.
        // Both files' own headers state, directly, that this call never
        // happens.
        const peerExchangeSource = await readSource('application/PublicationPeerExchange.js');
        assert(proseIncludes(peerExchangeSource, 'it NEVER calls application/PublicationResolver.js, and never inspects the wrapped content or the locator\'s reachability'),
            '1. application/PublicationPeerExchange.js\'s own header states directly it never calls PublicationResolver.');
        assert(!/^import .*PublicationResolver/m.test(peerExchangeSource),
            '2. confirmed structurally: application/PublicationPeerExchange.js never even IMPORTS application/PublicationResolver.js (the header discusses it in prose only — checked by import statement, not by bare string match).');

        const publicationExchangeSource = await readSource('application/PublicationExchange.js');
        assert(proseIncludes(publicationExchangeSource, 'never retrieves the wrapped content, never calls application/PublicationResolver.js'),
            "3. application/PublicationExchange.js's own header states the identical restraint one layer down.");
        assert(!/^import .*PublicationResolver/m.test(publicationExchangeSource),
            '4. confirmed structurally: application/PublicationExchange.js never IMPORTS application/PublicationResolver.js either.');

        // A2. What importPublication() actually returns — a cataloged
        // DecentralizedPublication (the signed ENVELOPE/locator), never
        // publisher/Publication.js's own resolved content.
        assert(publicationExchangeSource.includes('return this._catalog.add(publication);') &&
            publicationExchangeSource.includes('const publication = DecentralizedPublication.fromJSON(publicationJson);'),
            '5. importPublication() constructs and catalogs a DecentralizedPublication instance — the envelope — never the wrapped Publication.');
        assert(!/publisher\/Publication\.js/.test(publicationExchangeSource),
            '6. confirmed structurally: application/PublicationExchange.js never imports publisher/Publication.js at all — it cannot produce one.');
    }
    console.log('✓ Section A: the brief\'s own Route A diagram does not survive contact with source. Neither application/PublicationPeerExchange.js nor application/PublicationExchange.js ever calls application/PublicationResolver.js — both their own headers say so directly, and confirmed structurally by import search. Receiving a publication over a peer connection catalogs a signed DecentralizedPublication ENVELOPE (a locator), never a resolved publisher/Publication.js instance. The real Route A has one fewer automatic step than the brief assumed.');

    // ===============================================================
    // Section B — Route A, traced fresh: what peer reception actually
    // produces, and the one real event it fires.
    // ===============================================================
    {
        // B1. The real chain, live: Alice announces a signed envelope to
        // Bob over a stub bus; Bob's onPublicationReceived fires with
        // `{ publication, isNew }` where `publication` is the cataloged
        // DecentralizedPublication — proven by instanceof, not by
        // reading a header.
        const alice = makeIdentity('Alice');
        const aliceCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const verifier = new LocalAuthorizationVerifier();
        const aliceExchange = new PublicationExchange(aliceCatalog, verifier);

        const originalPublication = makeLocalStylePublication(
            { documentId: 'world-seam-1', title: 'Seam Audit World', author: 'alice' }, alice
        );
        const aliceResolver = new PublicationResolver(new LocalContentStore(new InMemoryStorageProvider()), verifier);
        const envelope = await aliceResolver.publish({
            content: originalPublication, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: alice
        });
        aliceCatalog.add(envelope);

        class StubBus {
            constructor() { this._handlers = new Map(); }
            attach() {}
            send(peer, protocol, payload) { const h = this._handlers.get(protocol); if (h) for (const fn of h) fn(payload); }
            subscribe(protocol, handler) {
                if (!this._handlers.has(protocol)) this._handlers.set(protocol, new Set());
                this._handlers.get(protocol).add(handler);
                return () => this._handlers.get(protocol).delete(handler);
            }
        }
        class StubRegistry {
            constructor(peers) { this._peers = peers; }
            list() { return this._peers; }
            onChange() { return () => {}; }
        }
        const authenticatedPeer = { connectionId: 'stub', getLifecycleState: () => PeerLifecycleState.AUTHENTICATED };
        const bus = new StubBus();

        const bobCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const bobExchange = new PublicationExchange(bobCatalog, verifier);
        const bobPeerExchange = new PublicationPeerExchange(bobExchange, bus, new StubRegistry([authenticatedPeer]));

        const observations = [];
        bobPeerExchange.onPublicationReceived((result) => observations.push(result));

        const alicePeerExchange = new PublicationPeerExchange(aliceExchange, bus, new StubRegistry([authenticatedPeer]));
        alicePeerExchange.announce(envelope);

        assert(observations.length === 1, '1. onPublicationReceived fires exactly once for a freshly announced envelope — a real, already-built application-level event.');
        assert(observations[0].publication instanceof DecentralizedPublication,
            '2. what it carries is a DecentralizedPublication — the ENVELOPE — proven by instanceof, not a publisher/Publication.js instance.');
        assert(!(observations[0].publication instanceof Publication),
            '3. and it is specifically NOT a Publication instance — the two classes are structurally distinct, confirmed live off the real object this event actually produced.');
        assert(observations[0].isNew === true, '4. isNew is true for a genuinely new envelope, mirroring application/LocalPublicationCatalog.js#add()\'s own contract unchanged.');

        // B2. The envelope this event carries already names its own
        // contentKind — enough for a caller to DECIDE whether resolution
        // as a Publication is even worth attempting, without this class
        // (or the provider) ever needing to know what a "Publication" is.
        assert(observations[0].publication.contentKind === PUBLICATION_CONTENT_KIND,
            "5. the observed envelope's own contentKind is readable by the caller — the dispatch key Section C's real seam uses, never invented by this audit.");

        bobPeerExchange.dispose();
        alicePeerExchange.dispose();
    }
    console.log('✓ Section B: reconfirmed live. Route A\'s real chain is PublicationPeerExchange -> PublicationExchange#importPublication() -> LocalPublicationCatalog (envelope cataloged) -> onPublicationReceived({ publication: DecentralizedPublication, isNew }) — a real, already-built application-level event, proven to fire with the ENVELOPE, never a resolved Publication. That envelope already carries enough information (its own contentKind) for a caller to decide whether resolving it as a forkbuild.publication is worth attempting — the actual dispatch key the real seam (Section C) uses.');

    // ===============================================================
    // Section C — Where resolution of that envelope actually happens
    // today: an application-layer function, wired to the peer event
    // from exactly one production call site.
    // ===============================================================
    {
        // C1. application/PublicationResolutionView.js#resolvePublicationView()
        // is a real, UI-agnostic application-layer function — it imports
        // no DOM/Vue module, only application/PublicationResolutionOutcome.js.
        const resolutionViewSource = await readSource('application/PublicationResolutionView.js');
        assert(!/from ['"]vue['"]|document\.|window\./.test(resolutionViewSource),
            '1. application/PublicationResolutionView.js imports no UI framework and touches no DOM/window global — genuinely application-layer, not embedded UI logic.');
        assert(resolutionViewSource.includes('export async function resolvePublicationView('),
            '2. resolvePublicationView() is exported, callable by any collaborator, not a private helper.');

        // C2. It already dispatches through a kindPlugins registry keyed
        // by contentKind, and returns `content` — the resolved object —
        // directly, alongside `resolved` (a plain boolean) and
        // `contentKind`.
        assert(resolutionViewSource.includes('const kindPlugin = kindPlugins[contentKind];') &&
            resolutionViewSource.includes('const resolved = result.outcome === PublicationResolutionOutcome.RESOLVED;'),
            '3. resolvePublicationView() dispatches by contentKind and reports a plain resolved boolean plus the resolved content — everything a caller needs to decide whether to hand the result to a discovery provider.');

        // C3. The registry it is handed already includes the Publication
        // content kind (0.9.333) — reconfirmed fresh, not cited.
        const registrySource = await readSource('application/CreatePublicationDisplayKindRegistryUseCase.js');
        assert(registrySource.includes('createPublicationContentKind({ verifier })') &&
            registrySource.includes('[publicationKind.contentKind]: publicationKind'),
            '4. application/CreatePublicationDisplayKindRegistryUseCase.js registers the Publication content kind — a contentKind match at Section C2\'s dispatch actually resolves to a real Publication.');

        // C4. Exactly one production call site wires the peer event
        // (Section B) to resolvePublicationView(): ui/views/
        // DecentralizedPublicationsView.js. Confirmed directly, not
        // assumed from proximity.
        const viewSource = await readSource('ui/views/DecentralizedPublicationsView.js');
        assert(viewSource.includes("? publicationPeerExchange.onPublicationReceived(() => refreshList())"),
            '5. the real UI wires onPublicationReceived to refreshList() — a live peer announcement actually triggers this path, not merely a manual page load.');
        assert(viewSource.includes('entry.view = await resolvePublicationView(entry.publication, { coordinator, kindPlugins });') ||
            viewSource.includes('entry.view = await resolvePublicationView(entry.publication, { coordinator, kindPlugins, peers });'),
            '6. refreshList()/resolveEntry() call resolvePublicationView() with the real production kindPlugins registry — not a hand-rolled dispatch.');
        assert(viewSource.includes('await Promise.all(entries.filter((entry) => !entry.view && !entry.checking).map(resolveEntry));') ||
            /entries\.filter\(\(entry\) => !entry\.view/.test(viewSource),
            '7. only entries with no view yet are resolved — a re-announce of an already-known envelope is never re-resolved (load-bearing for Section I below).');

        // C5. UPDATED by 0.9.337 — Wire Resolved Decentralized
        // Publications into Repository Discovery. At the time THIS audit
        // was written, this call site was the ONLY production consumer
        // of resolvePublicationView()'s own `content` field for anything
        // beyond display, and referenced no discovery provider at all.
        // 0.9.337 closed exactly the gap this audit's own "What comes
        // after" named: the identical call site now also admits a
        // resolved Publication into the application-lifetime
        // DecentralizedPublicationDiscoveryProvider ui/main.js
        // constructs — see tests/DecentralizedPublicationRepositoryIntegration.test.js
        // for that milestone's own flagship proof. Reconfirmed fresh,
        // the same "reconfirmed in place rather than left to rot"
        // discipline 0.9.335 already applied to this file's own Section
        // B7 predecessor claim.
        assert(/DecentralizedPublicationDiscoveryProvider/.test(viewSource) &&
            viewSource.includes("inject('decentralizedPublicationDiscoveryProvider', null)") &&
            viewSource.includes('discoveryProvider.add(view.content)'),
            '8. UPDATED (0.9.337): ui/views/DecentralizedPublicationsView.js now references discovery/DecentralizedPublicationDiscoveryProvider.js by injecting the application-lifetime instance and admitting a resolved Publication via discoveryProvider.add(view.content) — the resolved content is no longer used for display alone.');
    }
    console.log('✓ Section C: resolution of a peer-delivered envelope already happens today, at application/PublicationResolutionView.js#resolvePublicationView() — a real, exported, UI-agnostic application-layer function, dispatching by contentKind through a registry that already includes the Publication content kind (0.9.333). Exactly one production call site wires it to the peer event from Section B: ui/views/DecentralizedPublicationsView.js\'s refreshList()/resolveEntry(), which only resolves entries with no view yet (never re-resolving a repeat announce). UPDATED (0.9.337): that call site\'s own resolved `content` is now also admitted into Repository discovery via the shared DecentralizedPublicationDiscoveryProvider instance, whenever resolution succeeded with a genuine Publication.');

    // ===============================================================
    // Section D — FLAGSHIP: the whole Route A seam, live, over a real
    // authenticated peer connection, using the real production
    // kindPlugins registry — then, test-only, into add() and
    // Repository's own real, unmodified SearchPublicationsUseCase.
    // ===============================================================
    {
        const network = new LocalPeerNetwork();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');

        const aliceTransport = new LocalPeerConnectionProvider('alice-seam', network);
        const bobTransport = new LocalPeerConnectionProvider('bob-seam', network);
        const aliceConnect = new ConnectToPeerUseCase({ peerConnectionProvider: aliceTransport, identityProvider: alice });
        const stopListening = aliceConnect.listen();
        const bobConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bobTransport, identityProvider: bob });
        const bobConnectedPeer = bobConnect.connect({ candidateEndpoint: 'alice-seam' });
        await wait(20);
        assert(bobConnectedPeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '1. setup: a real, live, authenticated peer connection.');

        const verifier = new LocalAuthorizationVerifier();
        const sharedContentStorage = new InMemoryStorageProvider();
        const aliceContentStore = new LocalContentStore(sharedContentStorage);
        const bobContentStore = new LocalContentStore(sharedContentStorage);
        const aliceResolver = new PublicationResolver(aliceContentStore, verifier);
        const bobResolver = new PublicationResolver(bobContentStore, verifier);

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

        // Alice publishes an ORDINARY publisher/Publication.js instance
        // as a forkbuild.publication envelope (0.9.331's own pipeline,
        // unmodified) and catalogs + announces it — exactly what a
        // self-published entry looks like today.
        const originalPublication = makeLocalStylePublication(
            { documentId: 'world-seam-flagship', title: 'The Seam Lighthouse', author: 'alice' }, alice
        );
        const envelope = await aliceResolver.publish({
            content: originalPublication, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: alice
        });
        aliceCatalog.add(envelope);
        const sentCount = alicePeerExchange.announce(envelope);
        assert(sentCount === 1, '2. Alice announces to her one live authenticated peer.');
        await wait(20);

        assert(observed.length === 1 && observed[0].publication.id === envelope.id,
            "3. Bob's onPublicationReceived fires with the real, live, peer-delivered envelope.");

        // The exact production dispatch: the real
        // CreatePublicationDisplayKindRegistryUseCase output, the real
        // PublicationResolutionCoordinator, the real
        // resolvePublicationView() — nothing reimplemented, nothing
        // hand-rolled.
        const { kindPlugins: bobKindPlugins } = new CreatePublicationDisplayKindRegistryUseCase().execute();
        const bobCoordinator = new PublicationResolutionCoordinator(bobResolver);

        const view = await resolvePublicationView(observed[0].publication, { coordinator: bobCoordinator, kindPlugins: bobKindPlugins });
        assert(view.resolved === true, `4. resolvePublicationView() resolves the peer-delivered envelope (${view.reason}).`);
        assert(view.content instanceof Publication,
            '5. the resolved content is a genuine publisher/Publication.js instance — proven by instanceof off the REAL production dispatch path, not a type annotation.');
        assert(view.content.documentId === 'world-seam-flagship' && view.content.title === 'The Seam Lighthouse',
            "6. the resolved Publication's own fields survive the whole round trip: peer transport, envelope resolution, kindPlugin dispatch.");

        // THE MISSING ARROW — the one line this audit was asked to
        // locate, exercised here for the first time against the REAL
        // production seam identified above. Never itself production
        // code; see Section K's own git-diff guard.
        const provider = new DecentralizedPublicationDiscoveryProvider();
        if (view.resolved && view.content instanceof Publication) {
            provider.add(view.content);
        }

        // Repository's own real, unmodified SearchPublicationsUseCase,
        // never a rewritten copy.
        const searchUseCase = new SearchPublicationsUseCase(provider);
        const byText = searchUseCase.execute({ text: 'seam lighthouse' });
        assert(byText.items.length === 1 && byText.items[0].id === view.content.id,
            "7. Repository's own real SearchPublicationsUseCase finds the peer-delivered, resolved Publication by title text search.");
        const byAuthor = searchUseCase.execute({ author: 'alice' });
        assert(byAuthor.items.length === 1 && byAuthor.items[0].documentId === 'world-seam-flagship',
            '8. ...and by author filter, with documentId intact.');
        const miss = searchUseCase.execute({ text: 'no-such-title-exists' });
        assert(miss.items.length === 0, '9. ...and correctly excludes it from an unrelated query.');

        alicePeerExchange.dispose();
        bobPeerExchange.dispose();
        stopListening();
        aliceTransport.dispose();
        bobTransport.dispose();
    }
    console.log('✓ Section D: FLAGSHIP. Over a real, live, authenticated peer connection (peer/LocalPeerConnectionProvider.js + application/ConnectToPeerUseCase.js, unmodified), Alice\'s self-published Publication reaches Bob\'s onPublicationReceived as a signed envelope; the REAL production resolvePublicationView() call — with the REAL CreatePublicationDisplayKindRegistryUseCase output, never a stub — resolves it back to a genuine publisher/Publication.js instance; and a single, test-only `if (view.resolved && view.content instanceof Publication) provider.add(view.content);` line is enough to make it visible to Repository\'s own real, unmodified SearchPublicationsUseCase, by title text and by author, with documentId intact. Nothing about PublicationPeerExchange, PublicationExchange, PublicationResolver, PublicationResolutionView, or the provider itself needed to change — the entire gap is exactly that one line, at exactly that call site.');

    // ===============================================================
    // Section E — Is the seam application-level or UI-only? Answered
    // honestly, not overclaimed.
    // ===============================================================
    {
        // E1. resolvePublicationView() itself lives in application/ and
        // is genuinely UI-agnostic — Section C1 already proved this
        // structurally. Section D just proved it live, called with no
        // Vue component in the loop at all.
        //
        // E2. But its only PRODUCTION caller today is a Vue component
        // (ui/views/DecentralizedPublicationsView.js) — confirmed by
        // grep: no application/ file calls resolvePublicationView().
        const applicationCallers = grepFiles('await resolvePublicationView\\(', ['application'])
            .filter((f) => !f.includes('.test.js') && !f.endsWith('application/PublicationResolutionView.js'));
        assert(applicationCallers.length === 0,
            `1. no application/ file other than its own definition actually CALLS resolvePublicationView() today (found: ${applicationCallers.join(', ') || 'none'}) — every production call is made from ui/. (Checked by the real call pattern "await resolvePublicationView(", not a bare string match — application/CreatePublicationDisplayKindRegistryUseCase.js's own header cites the function name in prose without calling it.)`);
        const uiCallers = grepFiles('await resolvePublicationView\\(', ['ui']);
        assert(uiCallers.length === 1 && uiCallers[0] === 'ui/views/DecentralizedPublicationsView.js',
            `2. exactly one production caller exists, and it is a UI view (found: ${uiCallers.join(', ') || 'none'}).`);
    }
    console.log('✓ Section E: honestly characterized. The seam ITSELF (resolvePublicationView()) is application-layer and UI-agnostic — Section D called it with no Vue component involved at all, live. But its only PRODUCTION caller today is a UI view; no non-UI application/ coordinator invokes it yet. Wiring add() at this seam therefore means either (a) adding the one line inside that UI view\'s own resolveEntry(), or (b) building a small, new, non-UI application-layer coordinator that also calls resolvePublicationView() — a real, open choice for a future milestone, not a foregone one this audit should pre-decide.');

    // ===============================================================
    // Section F — Route B, traced fresh: no existing Nostr mechanism
    // produces a forkbuild.publication candidate at all.
    // ===============================================================
    {
        // F1. Exhaustive, fresh search: every Nostr-named file in the
        // codebase, checked directly for any reference to the
        // forkbuild.publication family — never cited from 0.9.334.
        const nostrFiles = [
            ...grepFiles('.', ['nostr']),
            ...grepFiles('.', ['application']).filter((f) => /Nostr/.test(f))
        ].filter((f) => !f.includes('.test.js'));
        assert(nostrFiles.length > 0, '1. at least one Nostr-named production file exists to check.');

        const hits = grepFiles('DecentralizedPublication\\b|PublicationResolver|LocalPublicationCatalog|PublicationExchange\\b', nostrFiles);
        assert(hits.length === 0,
            `2. confirmed structurally, fresh: zero Nostr-named production files reference DecentralizedPublication, PublicationResolver, LocalPublicationCatalog, or PublicationExchange (found: ${hits.join(', ') || 'none'}).`);

        // F2. What the existing Nostr publication pipeline actually
        // speaks: core/DecentralizedDiscoveryEnvelope.js — a location
        // claim for material belonging to an ALREADY-KNOWN publication,
        // never a forkbuild.publication envelope itself.
        const discoveryEnvelope = await readSource('core/DecentralizedDiscoveryEnvelope.js');
        assert(proseIncludes(discoveryEnvelope, 'a small, JSON, substrate-neutral envelope a publisher can attach to whatever payload field THEIR substrate already offers'),
            "3. core/DecentralizedDiscoveryEnvelope.js's own header names its own purpose directly: a location envelope, not a content-kind envelope.");
        const nostrPublisher = await readSource('application/NostrPublicationDiscoveryPublisher.js');
        assert(proseIncludes(nostrPublisher, "It never imports `publisher/Publication.js`, signs anything belonging to a Publication, or reads a Publication's own `signature` field"),
            '4. application/NostrPublicationDiscoveryPublisher.js\'s own header confirms it never touches Publication or its signature.');
        const nostrQueryService = await readSource('application/NostrDiscoveryQueryService.js');
        assert(!/DecentralizedPublication\b|PublicationResolver|createPublicationContentKind/.test(nostrQueryService),
            '5. application/NostrDiscoveryQueryService.js cannot produce a resolvable forkbuild.publication candidate today — reconfirmed fresh.');

        // F3. Question B, answered directly: "does the existing Nostr
        // publication discovery mechanism produce enough information to
        // resolve a Publication?" NO. And "where does resolution
        // currently terminate" has no answer of the form "at the
        // caller" — there is no producer of a DecentralizedPublication-
        // shaped candidate from Nostr anywhere in this codebase for a
        // caller to even receive. Resolution does not terminate early;
        // it never begins.
    }
    console.log('✓ Section F: reconfirmed fresh (not cited). No existing Nostr mechanism in this codebase — publisher or query service — imports or references core/DecentralizedPublication.js, application/PublicationResolver.js, application/LocalPublicationCatalog.js, or application/PublicationExchange.js. The Nostr pipeline that DOES exist for Publications speaks core/DecentralizedDiscoveryEnvelope.js, a self-declared {protocol,kind,objectId,uri} LOCATION claim for material belonging to a publication the caller already knows about — never a forkbuild.publication envelope. Question B\'s honest answer is not "resolution terminates at the caller" — it is "resolution never begins": no producer of a resolvable candidate exists on the Nostr side today, at all.');

    // ===============================================================
    // Section G — One seam or two? Answered: one, and it is
    // catalog-shaped, not peer-specific.
    // ===============================================================
    {
        // G1. Given Section F, there is no second route to converge
        // with — Route B produces nothing today. So "one seam" is not a
        // discovered convergence between two live routes; it is simply
        // the only route that exists.
        //
        // G2. And that one seam is not actually "peer ingestion" — it is
        // "any cataloged envelope, resolved for display." A second real
        // production writer into the identical LocalPublicationCatalog
        // exists: application/ImportPublicationReplicaPackageUseCase.js,
        // via the identical PublicationExchange#importPublication() call.
        const importUseCase = await readSource('application/ImportPublicationReplicaPackageUseCase.js');
        assert(importUseCase.includes('this._publicationExchange.importPublication(pkg.publication)'),
            '1. application/ImportPublicationReplicaPackageUseCase.js catalogs through the identical PublicationExchange#importPublication() call Route A uses — the same envelope-cataloging step, over a file-package transport instead of a live peer.');

        // G3. Whichever transport wrote the entry, ui/views/
        // DecentralizedPublicationsView.js's own refreshList() reads
        // from ONE catalog (`catalog.list()`) and resolves EVERY new
        // entry through the identical resolvePublicationView() call —
        // confirmed already in Section C, restated here as the direct
        // answer to "one seam or two."
        //
        // G4. This use case is not currently wired into ui/main.js or
        // any UI view — confirmed by grep — so it is real, tested,
        // production code with no live caller today, not a second
        // active ingestion route this audit needs to reconcile.
        const wiredCallers = grepFiles('ImportPublicationReplicaPackageUseCase', ['ui'])
            .filter((f) => !f.includes('.test.js'));
        assert(wiredCallers.length === 0,
            `2. confirmed: ImportPublicationReplicaPackageUseCase has no production UI caller today (found: ${wiredCallers.join(', ') || 'none'}) — a second real writer into the same catalog, currently dormant.`);
    }
    console.log('✓ Section G: exactly one existing ingestion seam, and it is shaped by the CATALOG, not the TRANSPORT. Given Section F (Route B produces nothing), there is no second live route to converge with. And what looked like "Route A\'s own seam" is really "any application/LocalPublicationCatalog.js entry\'s own seam" — a second production writer, application/ImportPublicationReplicaPackageUseCase.js, catalogs through the identical PublicationExchange#importPublication() call over a file-package transport instead of a live peer (currently unwired into any UI, confirmed by grep), and would flow through the identical resolvePublicationView() call site the moment it were wired. Peer, package-import, and self-publish all converge on ONE catalog and ONE resolution seam today.');

    // ===============================================================
    // Section H — Provider lifetime, characterized against the TWO
    // different composition patterns this codebase already uses.
    // ===============================================================
    {
        // H1. publicationCatalog/publicationPeerExchange/
        // publicationResolutionCoordinator are constructed EXACTLY ONCE
        // in ui/main.js and handed to every view via app.provide() — an
        // application-lifetime singleton, confirmed by grep count, not
        // merely read off one call site.
        const mainSource = await readSource('ui/main.js');
        const peerExchangeConstructions = (mainSource.match(/new CreatePublicationPeerExchangeUseCase\(\)/g) || []).length;
        assert(peerExchangeConstructions === 1,
            `1. application/CreatePublicationPeerExchangeUseCase.js is constructed exactly once in ui/main.js (found ${peerExchangeConstructions}) — an application-lifetime singleton, its catalog/peerExchange shared app-wide via app.provide().`);
        assert(mainSource.includes("app.provide('publicationCatalog', publicationCatalog);") &&
            mainSource.includes("app.provide('publicationPeerExchange', publicationPeerExchange);"),
            '2. both are handed to every view through Vue\'s own provide/inject, confirmed directly.');

        // H2. By sharp contrast, application/CreateDiscoveryUseCase.js —
        // the composition root that actually builds SearchPublicationsUseCase's
        // own discoveryProvider — is NEVER constructed in ui/main.js at
        // all, and IS constructed fresh, per call, inside five separate
        // views' own setup().
        assert(!mainSource.includes('new CreateDiscoveryUseCase()'),
            '3. confirmed: ui/main.js never constructs CreateDiscoveryUseCase — it is not part of the application-lifetime singleton set at all.');
        const discoveryUseCaseCallers = grepFiles('new CreateDiscoveryUseCase\\(\\)', ['ui'])
            .filter((f) => !f.includes('.test.js'));
        assert(discoveryUseCaseCallers.length >= 4,
            `4. CreateDiscoveryUseCase is instead constructed fresh inside multiple separate views' own setup() (found: ${discoveryUseCaseCallers.join(', ')}) — a genuinely different, per-call composition pattern.`);

        // H3. Live proof this second pattern is fresh, not cached: two
        // calls to execute() never return the same discoveryProvider
        // reference.
        const first = new CreateDiscoveryUseCase().execute();
        const second = new CreateDiscoveryUseCase().execute();
        assert(first.discoveryProvider !== second.discoveryProvider,
            '5. two CreateDiscoveryUseCase().execute() calls return two DISTINCT discoveryProvider instances, live — safe today only because LocalDiscoveryProvider is a stateless projection over persistent localStorage (both instances read the identical underlying storage key).');

        // H4. The concrete failure mode this pattern would cause for an
        // IN-MEMORY accumulator, proven live rather than merely argued:
        // two independently-constructed DecentralizedPublicationDiscoveryProvider
        // instances share no state at all.
        const carol = makeIdentity('Carol');
        const carolResolver = new PublicationResolver(new LocalContentStore(new InMemoryStorageProvider()), new LocalAuthorizationVerifier());
        const carolPublication = makeLocalStylePublication({ documentId: 'world-lifetime-1', title: 'Lifetime Probe', author: 'carol' }, carol);
        const carolEnvelope = await carolResolver.publish({ content: carolPublication, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: carol });
        const carolKindPlugin = createPublicationContentKind({ verifier: new LocalAuthorizationVerifier() });
        const carolResult = await carolResolver.resolve(carolEnvelope.toJSON(), carolKindPlugin);
        assert(carolResult.outcome === PublicationResolutionOutcome.RESOLVED, '6. setup: a real resolved Publication to probe lifetime with.');

        const providerInstanceOne = new DecentralizedPublicationDiscoveryProvider();
        const providerInstanceTwo = new DecentralizedPublicationDiscoveryProvider();
        providerInstanceOne.add(carolResult.content);
        assert(providerInstanceOne.list().length === 1, '7. the FIRST instance holds the added candidate.');
        assert(providerInstanceTwo.list().length === 0,
            '8. a SECOND, independently-constructed instance holds nothing — proving, live, that constructing this provider the SAME per-call way CreateDiscoveryUseCase constructs LocalDiscoveryProvider today would silently discard every previously ingested candidate the instant any other view\'s setup() ran again.');
    }
    console.log('✓ Section H: ANSWER. Two composition patterns already coexist in this codebase, and only one of them is compatible with an in-memory accumulator. publicationCatalog/publicationPeerExchange/publicationResolutionCoordinator are constructed EXACTLY ONCE in ui/main.js (confirmed by grep count) and shared app-wide via app.provide() — application lifetime. application/CreateDiscoveryUseCase.js, by contrast, is never constructed in ui/main.js at all and is instead constructed FRESH inside every consuming view\'s own setup() — safe today only because LocalDiscoveryProvider is a stateless projection over persistent localStorage, proven live: two execute() calls return distinct discoveryProvider references. A live probe with two independently-constructed DecentralizedPublicationDiscoveryProvider instances proves the concrete failure mode directly: an item added through one is invisible through the other. The only existing lifetime scope this evidence supports is APPLICATION LIFETIME — a single instance built once, alongside publicationCatalog/publicationPeerExchange, in ui/main.js. Wiring it through CreateDiscoveryUseCase\'s own present per-call shape would be a real regression, not a neutral choice, unless that composition root itself changes to accept an injected, shared instance instead of constructing one.');

    // ===============================================================
    // Section I — Repeated observations, characterized live.
    // ===============================================================
    {
        const dave = makeIdentity('Dave');
        const sharedStorage = new InMemoryStorageProvider();
        const resolver = new PublicationResolver(new LocalContentStore(sharedStorage), new LocalAuthorizationVerifier());
        const publication = makeLocalStylePublication({ documentId: 'world-repeat-1', title: 'Repeat Probe', author: 'dave' }, dave);

        // I1. Two INDEPENDENT publish() calls for the identical
        // Publication content — e.g. re-announcing it under a fresh
        // envelope — produce two DIFFERENT envelope ids (core/
        // DecentralizedPublication.js's own id defaults to a fresh
        // createId() per construction), so LocalPublicationCatalog's own
        // id-based dedup (application/LocalPublicationCatalog.js's own
        // header, "Deduplicates by the envelope's own id, never by
        // content hash") never collapses them.
        const envelopeOne = await resolver.publish({ content: publication, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: dave });
        const envelopeTwo = await resolver.publish({ content: publication, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: dave });
        assert(envelopeOne.id !== envelopeTwo.id,
            '1. two independent publish() calls for the SAME Publication content produce two DIFFERENT envelope ids, live — never deduplicated by application/LocalPublicationCatalog.js.');

        const catalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        catalog.add(envelopeOne);
        catalog.add(envelopeTwo);
        assert(catalog.list().length === 2, '2. both are cataloged as two SEPARATE entries — reconfirmed live.');

        // I2. Both resolve independently to two DISTINCT Publication
        // object references sharing the identical Publication.id/
        // documentId/title/author — exactly "the same Publication,
        // observed twice."
        const kindPlugin = createPublicationContentKind({ verifier: new LocalAuthorizationVerifier() });
        const resultOne = await resolver.resolve(envelopeOne.toJSON(), kindPlugin);
        const resultTwo = await resolver.resolve(envelopeTwo.toJSON(), kindPlugin);
        assert(resultOne.content !== resultTwo.content,
            '3. resolving each envelope produces two DISTINCT object references — never a cached/shared instance.');
        assert(resultOne.content.id === resultTwo.content.id && resultOne.content.documentId === resultTwo.content.documentId,
            "4. ...yet both share the identical underlying Publication.id/documentId — this genuinely IS the same publication, observed through two independent envelopes.");

        // I3. Handed to a real provider, per its own documented,
        // deliberate no-dedup contract (0.9.335), BOTH are retained as
        // two separate accumulated entries.
        const provider = new DecentralizedPublicationDiscoveryProvider();
        provider.add(resultOne.content);
        provider.add(resultTwo.content);
        assert(provider.list().length === 2,
            '5. both observations are retained — consistent with discovery/DecentralizedPublicationDiscoveryProvider.js\'s own documented "no invented deduplication policy," never a contradiction of it.');

        // I4. Contrast: a literal RE-ANNOUNCE of the identical envelope
        // (Section C7) is suppressed BEFORE it would ever reach this
        // provider at all — a caller wired at the resolvePublicationView()
        // seam (Sections C/D) only resolves entries with no view yet, so
        // a duplicate ANNOUNCE of the same envelope id never calls
        // resolvePublicationView(), and therefore never calls add(),
        // a second time. Proven structurally in Section C7; restated
        // here as the direct answer to "what happens when the SAME
        // publication reaches the provider via two paths."
        const catalogResult = catalog.add(envelopeOne);
        assert(catalogResult.isNew === false, '6. re-adding the IDENTICAL envelope to the catalog is a no-op, isNew: false — the suppression point upstream of the seam.');
    }
    console.log('✓ Section I: characterized live, not built. A literal re-announce of the IDENTICAL signed envelope is suppressed upstream of the seam entirely — application/LocalPublicationCatalog.js\'s own id-based dedup makes it isNew:false, and the real UI call site (Section C7) only resolves entries with no view yet, so it never reaches resolvePublicationView() or add() a second time. But TWO INDEPENDENTLY signed envelopes wrapping the identical underlying Publication (proven live: two publish() calls of the same content yield two different envelope ids, both cataloged, both resolved to two distinct object references sharing one Publication.id/documentId) are NOT deduplicated anywhere in this pipeline — handed to a real provider, both are retained, exactly matching discovery/DecentralizedPublicationDiscoveryProvider.js\'s own documented "no invented deduplication policy." This is real evidence for a future federated-observation-identity decision, not a bug this milestone should fix.');

    // ===============================================================
    // Section J — Repository visibility, proven end to end without
    // wiring Repository's own composition root.
    // ===============================================================
    {
        // Restates Section D's own live proof as the direct answer to
        // Question F: decentralized source -> resolve -> add ->
        // SearchPublicationsUseCase -> Repository result — all five
        // links proven live in Section D, over a REAL peer connection,
        // through Repository's own real, unmodified SearchPublicationsUseCase.
        // Confirmed here, fresh, that neither it nor its own composition
        // root carries any trace of this milestone's own additions —
        // Repository's real seam is genuinely untouched, not merely
        // unmentioned in a header.
        const searchUseCaseSource = await readSource('application/SearchPublicationsUseCase.js');
        assert(!/DecentralizedPublicationDiscoveryProvider/.test(searchUseCaseSource),
            '1. application/SearchPublicationsUseCase.js never references discovery/DecentralizedPublicationDiscoveryProvider.js — Section D\'s proof required no change to it.');
        const createDiscoveryUseCaseSource = await readSource('application/CreateDiscoveryUseCase.js');
        assert(!/DecentralizedPublicationDiscoveryProvider/.test(createDiscoveryUseCaseSource),
            '2. application/CreateDiscoveryUseCase.js still wires only LocalDiscoveryProvider — this milestone leaves Repository\'s own composition root exactly as 0.9.335 left it.');
    }
    console.log('✓ Section J: Section D\'s own flagship already IS this proof — decentralized source (a real, live peer connection) -> resolve (the real application/PublicationResolutionView.js#resolvePublicationView() seam) -> add (the one test-only line) -> Repository\'s own real, unmodified SearchPublicationsUseCase -> a real Repository-shaped { items } result, matched by title and by author. Nothing about application/CreateDiscoveryUseCase.js or any Repository UI file was touched or imported to produce it.');

    // ===============================================================
    // Section K — No production file touched.
    // ===============================================================
    {
        const changedNonTestFiles = execSync('git diff --name-only HEAD -- . ":(exclude)tests" ":(exclude)docs/Roadmap.md" ":(exclude)tests.html"',
            { cwd: SOURCE_ROOT.pathname }).toString().trim();
        assert(changedNonTestFiles === '', `1. no production file is modified by this milestone (found: ${changedNonTestFiles || 'none'}).`);
    }
    console.log('✓ Section K: the git-diff guard confirms no production file outside tests/, tests.html, and docs/Roadmap.md was touched by this milestone.');

    // ===============================================================
    // Section L — Final classification.
    // ===============================================================
    {
        const CLASSIFICATIONS = [
            'ONE_SEAM_EXISTS_APPLICATION_LAYER_UI_ONLY_CALLER',
            'TWO_SEAMS_EXIST',
            'NO_SEAM_EXISTS'
        ];
        const verdict = 'ONE_SEAM_EXISTS_APPLICATION_LAYER_UI_ONLY_CALLER';
        assert(CLASSIFICATIONS.includes(verdict), '1. the verdict is drawn from this milestone\'s own named taxonomy.');
    }
    console.log('\n✓ Section L: FINAL DECISION.\n' +
'\n' +
'OUTCOME: ONE_SEAM_EXISTS_APPLICATION_LAYER_UI_ONLY_CALLER.\n' +
'\n' +
"WHY. Route A (peer): Section A corrected the brief's own diagram — PublicationPeerExchange/PublicationExchange never\n" +
'call PublicationResolver; peer reception catalogs a signed ENVELOPE, never a resolved Publication (Section B). The\n' +
'real resolution seam is application/PublicationResolutionView.js#resolvePublicationView() (Section C) — an\n' +
'application-layer, UI-agnostic function, dispatching by contentKind through a registry that already includes the\n' +
'Publication content kind — wired to the peer event from exactly one production call site, a UI view. Section D\n' +
'proved the entire route live, over a real authenticated peer connection, using the real production kindPlugins\n' +
'registry: the missing arrow is exactly one line, `if (view.resolved && view.content instanceof Publication)\n' +
'provider.add(view.content);`, at that exact call site — nothing about the transport, resolution, or provider itself\n' +
'needs to change. Section E is the honest caveat: the seam is application-layer by construction, but its only\n' +
'PRODUCTION caller today is a UI view, not a non-UI coordinator.\n' +
'\n' +
'Route B (Nostr): Section F reconfirmed fresh, by exhaustive search, that no Nostr-named file in this codebase\n' +
'references DecentralizedPublication, PublicationResolver, LocalPublicationCatalog, or PublicationExchange. The\n' +
'existing Nostr publication pipeline speaks a structurally different envelope (a location claim for material\n' +
'belonging to an ALREADY-KNOWN publication) — resolution does not terminate early on this route; it never begins.\n' +
'\n' +
'One seam or two (Section G): given Route B produces nothing, there is only one live route — and it is catalog-\n' +
'shaped, not peer-specific: application/ImportPublicationReplicaPackageUseCase.js writes into the identical catalog\n' +
'through the identical importPublication() call (currently unwired into any UI), and would flow through the\n' +
'identical resolvePublicationView() seam the moment it were wired.\n' +
'\n' +
'Provider lifetime (Section H): publicationCatalog/publicationPeerExchange are application-lifetime singletons, built\n' +
'once in ui/main.js; application/CreateDiscoveryUseCase.js is instead built FRESH per view, proven live to return\n' +
'distinct instances — safe today only because LocalDiscoveryProvider is a stateless localStorage projection. A live\n' +
'probe proves an in-memory accumulator built the same per-call way would silently lose every prior candidate. The\n' +
'only lifetime this evidence supports is APPLICATION LIFETIME, alongside publicationCatalog/publicationPeerExchange.\n' +
'\n' +
'Repeated observations (Section I): a literal re-announce of the identical envelope is suppressed upstream of the\n' +
'seam (catalog id-dedup + "only unresolved entries get resolved"). Two independently signed envelopes for the same\n' +
'underlying Publication are NOT deduplicated anywhere in this pipeline and would both reach add() — consistent with,\n' +
'never a contradiction of, the provider\'s own documented no-dedup stance.\n' +
'\n' +
'What this means for a future milestone: the smallest real wiring change is one line at ui/views/\n' +
'DecentralizedPublicationsView.js\'s own resolveEntry(), guarded by an application-lifetime provider instance built\n' +
'once in ui/main.js next to publicationCatalog/publicationPeerExchange — never inside CreateDiscoveryUseCase\'s own\n' +
'present per-call shape unless that composition root itself changes first. Whether that line belongs in the UI view\n' +
'directly, or behind a new, small, non-UI coordinator that also calls resolvePublicationView(), is a real, open\n' +
'choice this audit deliberately leaves unresolved for that milestone to make.\n');

    console.log('\nAll Decentralized Publication Discovery Ingestion Seam Audit tests passed.');
}

run().catch((error) => {
    console.error('DecentralizedPublicationDiscoveryIngestionSeamAudit.test.js FAILED:', error);
    process.exitCode = 1;
});
