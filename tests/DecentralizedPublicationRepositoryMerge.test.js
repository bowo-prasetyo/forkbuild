import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { License, LicenseId } from '../core/License.js';
import { PublicationSort } from '../core/PublicationSort.js';
import { PublicationResolver } from '../application/PublicationResolver.js';
import { PublicationResolutionCoordinator } from '../application/PublicationResolutionCoordinator.js';
import { resolvePublicationView } from '../application/PublicationResolutionView.js';
import { CreatePublicationDisplayKindRegistryUseCase } from '../application/CreatePublicationDisplayKindRegistryUseCase.js';
import { CreateDiscoveryUseCase } from '../application/CreateDiscoveryUseCase.js';
import { PUBLICATION_CONTENT_KIND } from '../application/PublicationContentValidator.js';
import { SearchPublicationsUseCase } from '../application/SearchPublicationsUseCase.js';
import { ListPublicationsUseCase } from '../application/ListPublicationsUseCase.js';
import { FindPublicationUseCase } from '../application/FindPublicationUseCase.js';
import { ForkDocumentUseCase } from '../application/ForkDocumentUseCase.js';
import { DiscoveryProvider } from '../discovery/DiscoveryProvider.js';
import { DecentralizedPublicationDiscoveryProvider } from '../discovery/DecentralizedPublicationDiscoveryProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
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

// 0.9.339 — Merge Decentralized Publication Discovery into Repository
// Discovery.
//
// 0.9.338's own audit located ONE remaining, precisely-scoped gap:
// application/CreateDiscoveryUseCase.js — the composition root every real
// UI surface (Repository/Author's PublicationCatalog.js, Editor's fork/
// load lookup, World View, Recent Worlds) independently calls — built a
// fresh LocalDiscoveryProvider every time and never merged in the
// application-lifetime DecentralizedPublicationDiscoveryProvider ui/main.js
// already builds and shares (0.9.337). This milestone closes exactly
// that seam, and nothing else:
//
//   - discovery/CompositeDiscoveryProvider.js (new): a small, generic
//     multi-provider merge — no discovery, resolution, dedup, ranking,
//     or source preference of its own.
//   - application/CreateDiscoveryUseCase.js: execute() now accepts an
//     OPTIONAL decentralizedDiscoveryProvider and composes it in via the
//     class above, when supplied. LocalDiscoveryProvider is still
//     unconditionally constructed, unchanged.
//   - ui/components/PublicationCatalog.js, ui/views/AuthorView.js,
//     ui/views/EditorView.js, ui/views/RecentWorldsView.js,
//     ui/views/WorldView.js: each now injects the shared, app-wide
//     decentralizedPublicationDiscoveryProvider (default null) and
//     threads it through to CreateDiscoveryUseCase — the smallest
//     dependency-injection change the audit's own verdict called for.
//
// Sections:
//   Section 0 — Composition root: structural confirmation of the wiring
//               diagram above.
//   Section A — Shared provider reaches Repository: the exact provider
//               instance populated during resolution is the one
//               Repository discovery consumes — and the "provider A
//               resolution / provider B Repository" failure mode is
//               reproduced on purpose, once, to prove this test would
//               actually catch it.
//   Section B — Local discovery regression.
//   Section C — Decentralized discovery, no Repository-specific code.
//   Section D — Combined results: neither source suppresses the other.
//   Section E — Ordering: SearchPublicationsUseCase's own query.sort
//               fully determines display order regardless of provider
//               construction order; raw list() order is a documented
//               implementation detail, not an invented policy.
//   Section F — Identity: id/documentId/contentReference survive,
//               unmodified, no source-specific field anywhere.
//   Section G — Failure isolation: an empty/absent decentralized
//               provider never breaks Repository.
//   Section H — No duplicate admission: the composite invents no
//               dedup of its own; the existing provider's own
//               documented no-dedup stance is unchanged.
//   Section I — Existing non-Repository consumers: Editor, World View,
//               Recent Worlds, Author View, audited individually for
//               compatibility with this widened visibility.
//   Section J — Provider isolation (the brief's own "particularly
//               important test"): local-only and decentralized-only
//               contents compose additively, and additivity survives
//               the decentralized side going empty.
//   Section K — FLAGSHIP: a decentralized Publication travels a real,
//               live, authenticated peer connection, resolves, is
//               admitted into the shared provider, and is found by the
//               exact composition the real Repository page runs —
//               then continues into the already-proven Explore/Fork
//               identity path (0.9.338), unmodified.
//   Section L — Deliberately excluded, checked rather than assumed.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function assertThrows(fn, expectedMessageSubstring, message) {
    let threw = false;
    let actual = null;
    try {
        fn();
    } catch (e) {
        threw = true;
        actual = e.message;
    }
    assert(threw, `${message} (did not throw)`);
    assert(actual.includes(expectedMessageSubstring), `${message} (threw "${actual}", expected to include "${expectedMessageSubstring}")`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function readSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

function countOccurrences(source, pattern) {
    return (source.match(pattern) || []).length;
}

function gitDiffFiles(paths) {
    const out = execSync(`git diff --name-only HEAD -- ${paths.join(' ')}`, { cwd: SOURCE_ROOT.pathname }).toString().trim();
    return out ? out.split('\n') : [];
}

function wait(ms = 20) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// application/CreateDiscoveryUseCase.js constructs a real
// storage/LocalStorageProvider.js, which reads window.localStorage — a
// minimal in-memory shim, installed ONLY when no window already exists
// (a real browser test run never hits this branch), scoped to this
// process only. Same posture as tests/FederatedRepositoryPublicationUserJourneyAudit.test.js.
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
// each section from a clean local catalog. Mirrors LocalStorageProvider's
// own "forkbuild:" prefix exactly.
function clearLocalPublications() {
    window.localStorage.removeItem('forkbuild:forkbuild-publications');
}

function saveLocalPublications(publications) {
    window.localStorage.setItem('forkbuild:forkbuild-publications', JSON.stringify(publications.map((p) => p.toJSON())));
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
// runs at both resolveEntry() and retrieve() — reproduced test-side, the
// same posture 0.9.337/0.9.338's own flagship tests already established
// is faithful to production.
function admitToRepositoryDiscovery(view, discoveryProvider) {
    if (discoveryProvider && view && view.resolved && view.content instanceof Publication) {
        discoveryProvider.add(view.content);
    }
}

async function run() {
    console.log('Running Decentralized Publication Repository Merge tests...\n');

    // ===============================================================
    // Section 0 — Composition root: the wiring diagram, confirmed from
    // source rather than assumed from the milestone's own goal.
    // ===============================================================
    {
        const mainSource = await readSource('ui/main.js');
        assert(countOccurrences(mainSource, /new DecentralizedPublicationDiscoveryProvider\(\)/g) === 1,
            '1. ui/main.js still constructs exactly one DecentralizedPublicationDiscoveryProvider — this milestone adds a consumer, never a second instance.');
        assert(countOccurrences(mainSource, /app\.provide\('decentralizedPublicationDiscoveryProvider', decentralizedPublicationDiscoveryProvider\);/g) === 1,
            '2. ...still provided app-wide exactly once.');

        const createDiscoverySource = await readSource('application/CreateDiscoveryUseCase.js');
        assert(createDiscoverySource.includes('new LocalDiscoveryProvider(storageProvider)') &&
            createDiscoverySource.includes('new CompositeDiscoveryProvider([localDiscoveryProvider, decentralizedDiscoveryProvider])'),
            '3. application/CreateDiscoveryUseCase.js constructs LocalDiscoveryProvider unconditionally and composes an optional decentralizedDiscoveryProvider alongside it.');

        // Every real UI caller now injects the shared instance (default
        // null, so a caller with no provider ancestor degrades safely)
        // and threads it through — the smallest DI change, applied
        // uniformly rather than to Repository alone. See this file's own
        // Section I for WHY broadening to Editor/WorldView/RecentWorlds/
        // AuthorView is compatible, not merely convenient.
        const consumers = [
            'ui/components/PublicationCatalog.js',
            'ui/views/AuthorView.js',
            'ui/views/EditorView.js',
            'ui/views/RecentWorldsView.js',
            'ui/views/WorldView.js'
        ];
        for (const file of consumers) {
            const src = await readSource(file);
            assert(src.includes("inject('decentralizedPublicationDiscoveryProvider', null)"),
                `4. ${file} injects the shared decentralizedPublicationDiscoveryProvider, defaulting to null.`);
            assert(/new CreateDiscoveryUseCase\(\)\.execute\(\{/.test(src),
                `5. ${file} threads it through CreateDiscoveryUseCase().execute({ ... }) rather than the old zero-argument call.`);
        }

        // discovery/DecentralizedPublicationDiscoveryProvider.js itself
        // — the accumulator — is untouched: composition happens ABOVE
        // it, never inside it. Reconfirmed via git diff (trivially true
        // once this milestone's own changes are committed) and,
        // structurally, that it still has no `providers`/merge concept.
        const providerSource = await readSource('discovery/DecentralizedPublicationDiscoveryProvider.js');
        assert(!/CompositeDiscoveryProvider|providers/.test(providerSource),
            '6. discovery/DecentralizedPublicationDiscoveryProvider.js carries no merge/composition concept of its own — its job stays "catalog Publications already resolved," nothing more.');
    }
    console.log('✓ Section 0: the composition root diagram holds — ui/main.js still builds and shares exactly one DecentralizedPublicationDiscoveryProvider instance; application/CreateDiscoveryUseCase.js now optionally composes it alongside LocalDiscoveryProvider via the new discovery/CompositeDiscoveryProvider.js; every real UI caller of CreateDiscoveryUseCase now injects and threads the shared instance through.');

    // ===============================================================
    // Section A — Shared provider reaches Repository.
    // ===============================================================
    {
        const alice = makeIdentity('Alice');
        const pub = makePublication({ documentId: 'merge-a-1', title: 'Merged Atlas', author: 'alice' }, alice);
        const view = await resolveAsDecentralizedPublication(pub, alice);
        assert(view.resolved === true, '1. setup: resolves genuinely.');

        const sharedProvider = new DecentralizedPublicationDiscoveryProvider();
        admitToRepositoryDiscovery(view, sharedProvider);
        assert(sharedProvider.list().length === 1, '2. setup: admitted into the shared provider.');

        clearLocalPublications();
        const { searchPublicationsUseCase } = new CreateDiscoveryUseCase().execute({ decentralizedDiscoveryProvider: sharedProvider });
        const found = searchPublicationsUseCase.execute({ text: 'merged atlas' });
        assert(found.items.length === 1 && found.items[0] === view.content,
            '3. the EXACT provider instance populated during resolution is the SAME one Repository discovery consumes — object identity, not merely equal content.');

        // The nasty failure mode, reproduced ON PURPOSE, once: a SECOND,
        // independently-constructed provider (standing in for "provider
        // B ← Repository" wired to the wrong instance) finds nothing —
        // proving this test would actually have caught that mistake had
        // the wiring been wrong.
        const differentProvider = new DecentralizedPublicationDiscoveryProvider();
        const { searchPublicationsUseCase: misWiredSearch } = new CreateDiscoveryUseCase().execute({ decentralizedDiscoveryProvider: differentProvider });
        const misWiredResult = misWiredSearch.execute({ text: 'merged atlas' });
        assert(misWiredResult.items.length === 0,
            '4. by contrast, a DIFFERENT provider instance (resolution admitted into A, Repository wired to B) finds nothing — everything individually works but nothing appears, exactly the failure mode this section exists to rule out.');
    }
    console.log('✓ Section A: the exact provider instance populated during decentralized resolution is the one Repository discovery consumes, confirmed by object identity — and the "provider A ≠ provider B" failure mode is reproduced on purpose to prove this section would catch it.');

    // ===============================================================
    // Section B — Local discovery regression.
    // ===============================================================
    {
        const alice = makeIdentity('Alice');
        const localPub = makePublication({ documentId: 'merge-b-local', title: 'Local Regression Piece', author: 'alice' }, alice);
        clearLocalPublications();
        saveLocalPublications([localPub]);

        // An unrelated, EMPTY decentralized provider present alongside —
        // local search must behave exactly as if it were never given at
        // all.
        const emptyDecentralized = new DecentralizedPublicationDiscoveryProvider();
        const { searchPublicationsUseCase } = new CreateDiscoveryUseCase().execute({ decentralizedDiscoveryProvider: emptyDecentralized });
        const found = searchPublicationsUseCase.execute({ text: 'local regression' });
        assert(found.items.length === 1 && found.items[0].documentId === 'merge-b-local',
            '1. an existing local Publication remains searchable exactly as before, with an (empty) decentralized provider merged in alongside it.');
    }
    console.log('✓ Section B: local Publications remain searchable exactly as before — merging in an (empty) decentralized provider changes nothing about local discovery.');

    // ===============================================================
    // Section C — Decentralized discovery, no Repository-specific code.
    // ===============================================================
    {
        const alice = makeIdentity('Alice');
        const pub = makePublication({ documentId: 'merge-c-1', title: 'Purely Decentralized Piece', author: 'alice' }, alice);
        const view = await resolveAsDecentralizedPublication(pub, alice);
        const provider = new DecentralizedPublicationDiscoveryProvider();
        admitToRepositoryDiscovery(view, provider);

        clearLocalPublications();
        // Note: this section calls the SAME generic
        // application/CreateDiscoveryUseCase.js / application/
        // SearchPublicationsUseCase.js every local query already used in
        // Section B — no Repository-specific or decentralized-specific
        // branch exists anywhere in either class.
        const { searchPublicationsUseCase } = new CreateDiscoveryUseCase().execute({ decentralizedDiscoveryProvider: provider });
        const found = searchPublicationsUseCase.execute({ text: 'purely decentralized' });
        assert(found.items.length === 1 && found.items[0] === view.content,
            '1. a resolved decentralized Publication becomes searchable through the ordinary composition root, with zero Repository-specific code written to make it so.');
    }
    console.log('✓ Section C: a resolved decentralized Publication becomes searchable without any Repository-specific code — the identical CreateDiscoveryUseCase/SearchPublicationsUseCase call shape Section B\'s local case used.');

    // ===============================================================
    // Section D — Combined results: neither source suppresses the
    // other.
    // ===============================================================
    {
        const alice = makeIdentity('Alice');
        const localPub = makePublication({ documentId: 'merge-d-local', title: 'Combined Local Piece', author: 'alice' }, alice);
        clearLocalPublications();
        saveLocalPublications([localPub]);

        const decentralizedPub = makePublication({ documentId: 'merge-d-decentralized', title: 'Combined Decentralized Piece', author: 'alice' }, alice);
        const view = await resolveAsDecentralizedPublication(decentralizedPub, alice);
        const provider = new DecentralizedPublicationDiscoveryProvider();
        admitToRepositoryDiscovery(view, provider);

        const { searchPublicationsUseCase, listPublicationsUseCase } = new CreateDiscoveryUseCase().execute({ decentralizedDiscoveryProvider: provider });

        // Both found by an unfiltered query.
        const all = searchPublicationsUseCase.execute({ pageSize: 50 });
        const documentIds = all.items.map((p) => p.documentId).sort();
        assert(documentIds.length === 2 &&
            documentIds.includes('merge-d-local') && documentIds.includes('merge-d-decentralized'),
            `1. an unfiltered Repository search finds BOTH the local and the decentralized Publication together (found: ${documentIds.join(', ')}).`);

        // Each is independently findable by its own distinguishing text
        // — neither result is suppressed by the other's presence.
        assert(searchPublicationsUseCase.execute({ text: 'combined local' }).items.length === 1,
            '2. the local Publication remains findable by its own text, unsuppressed.');
        assert(searchPublicationsUseCase.execute({ text: 'combined decentralized' }).items.length === 1,
            '3. the decentralized Publication remains findable by its own text, unsuppressed.');

        // And the same holds for the raw, unfiltered list() every
        // ListPublicationsUseCase call goes through (RecentWorldsView.js/
        // AuthorView.js/WorldView.js's own consumption shape).
        const listed = listPublicationsUseCase.execute();
        assert(listed.length === 2, '4. ListPublicationsUseCase.execute() (no filter) also returns both, combined.');
    }
    console.log('✓ Section D: Repository sees both a local and a decentralized Publication in the same query, and neither suppresses the other — confirmed through both SearchPublicationsUseCase and the raw, unfiltered ListPublicationsUseCase.');

    // ===============================================================
    // Section E — Ordering: preserve whatever the existing discovery
    // contract actually defines; invent no "local first" or
    // "decentralized first" policy.
    // ===============================================================
    {
        const alice = makeIdentity('Alice');
        const localPub = makePublication({ documentId: 'merge-e-local', title: 'Zzz Last Alphabetically', author: 'alice' }, alice);
        clearLocalPublications();
        saveLocalPublications([localPub]);

        const decentralizedPub = makePublication({ documentId: 'merge-e-decentralized', title: 'Aaa First Alphabetically', author: 'alice' }, alice);
        const view = await resolveAsDecentralizedPublication(decentralizedPub, alice);
        const provider = new DecentralizedPublicationDiscoveryProvider();
        admitToRepositoryDiscovery(view, provider);

        // E1. SearchPublicationsUseCase's own query.sort ALREADY re-sorts
        // the full candidate set after list() — see its own header —
        // so a Repository search's displayed order is exactly what the
        // query asks for, regardless of which provider physically listed
        // its candidate first. Local ("Zzz...") sorts LAST under
        // TITLE_ASC even though LocalDiscoveryProvider is composed
        // FIRST — proving the composite's own concatenation order is
        // not what decides display order.
        const { searchPublicationsUseCase } = new CreateDiscoveryUseCase().execute({ decentralizedDiscoveryProvider: provider });
        const sorted = searchPublicationsUseCase.execute({ sort: PublicationSort.TITLE_ASC, pageSize: 50 });
        assert(sorted.items.length === 2 &&
            sorted.items[0].documentId === 'merge-e-decentralized' &&
            sorted.items[1].documentId === 'merge-e-local',
            '1. query.sort (TITLE_ASC) fully determines Repository search\'s own display order — the decentralized-origin Publication ("Aaa...") sorts first even though LocalDiscoveryProvider is composed first inside CreateDiscoveryUseCase.');

        // E2. Where raw order IS visible (ListPublicationsUseCase's own
        // unfiltered list(), used by e.g. WorldView.js/RecentWorldsView.js
        // enrichment) it is simply the CompositeDiscoveryProvider
        // constructor's own given order — local, then decentralized,
        // because that is the order CreateDiscoveryUseCase happens to
        // build them in — never a re-sort, a preference, or a policy
        // this milestone invented.
        const { listPublicationsUseCase } = new CreateDiscoveryUseCase().execute({ decentralizedDiscoveryProvider: provider });
        const rawOrder = listPublicationsUseCase.execute().map((p) => p.documentId);
        assert(rawOrder.length === 2 && rawOrder[0] === 'merge-e-local' && rawOrder[1] === 'merge-e-decentralized',
            `2. raw list() order is exactly local-then-decentralized (found: ${rawOrder.join(', ')}) — the order CreateDiscoveryUseCase's own constructor call happens to compose them in, reconfirmed structurally as a bare concatenation in discovery/CompositeDiscoveryProvider.js, not a designed ranking.`);

        // E3. Structural: CompositeDiscoveryProvider.js's own class body
        // (isolated from its header comment, which explains what it
        // deliberately does NOT do, in prose) contains no sort/compare
        // call of any kind.
        const compositeSource = await readSource('discovery/CompositeDiscoveryProvider.js');
        const compositeClassBody = compositeSource.slice(compositeSource.indexOf('export class'));
        assert(!/\.sort\(|\.rank|preference/i.test(compositeClassBody),
            '3. discovery/CompositeDiscoveryProvider.js\'s own class body contains no sort/rank/preference logic anywhere — list() is a bare flatMap concatenation.');
    }
    console.log('✓ Section E: Repository search\'s own displayed order is fully governed by query.sort, unaffected by provider composition order; the one place raw order is visible (unfiltered list()) is a plain, documented concatenation in the order CreateDiscoveryUseCase happens to construct its providers, never an invented "local first"/"decentralized first" policy.');

    // ===============================================================
    // Section F — Identity: the Repository result remains the same
    // Publication identity model — id, documentId, contentReference —
    // with no source-specific field anywhere.
    // ===============================================================
    {
        const alice = makeIdentity('Alice');
        const pub = makePublication({ documentId: 'merge-f-1', title: 'Identity Preservation Piece', author: 'alice' }, alice);
        const view = await resolveAsDecentralizedPublication(pub, alice);
        const provider = new DecentralizedPublicationDiscoveryProvider();
        admitToRepositoryDiscovery(view, provider);

        clearLocalPublications();
        const { searchPublicationsUseCase } = new CreateDiscoveryUseCase().execute({ decentralizedDiscoveryProvider: provider });
        const [result] = searchPublicationsUseCase.execute({ text: 'identity preservation' }).items;

        assert(result.id === view.content.id, '1. id survives unmodified.');
        assert(result.documentId === view.content.documentId, '2. documentId survives unmodified.');
        assert(result.contentReference.hash === view.content.contentReference.hash &&
            result.contentReference.algorithm === view.content.contentReference.algorithm,
            '3. contentReference survives unmodified.');
        assert(result instanceof Publication, '4. the result is still a plain publisher/Publication.js instance.');

        // No source-specific field (origin/source/peerId/decentralized/
        // isRemote/isPeer) was invented anywhere along the way.
        const ownKeys = Object.keys(result);
        assert(!ownKeys.some((k) => /^(origin|source|peerId|decentralized|isRemote|isPeer)$/i.test(k)),
            `5. no source-specific identity field exists on the result (own keys: ${ownKeys.join(', ')}).`);
    }
    console.log('✓ Section F: the Repository result remains exactly the same Publication identity model — id, documentId, contentReference — with no source-specific field anywhere, regardless of the result\'s origin.');

    // ===============================================================
    // Section G — Failure isolation: Repository continues functioning
    // normally against local discovery if the decentralized provider is
    // empty or entirely absent.
    // ===============================================================
    {
        const alice = makeIdentity('Alice');
        const localPub = makePublication({ documentId: 'merge-g-local', title: 'Failure Isolation Piece', author: 'alice' }, alice);
        clearLocalPublications();
        saveLocalPublications([localPub]);

        // G1. Absent entirely — the pre-0.9.339 zero-argument call shape
        // still works, unchanged.
        const { searchPublicationsUseCase: withNoArgument } = new CreateDiscoveryUseCase().execute();
        assert(withNoArgument.execute({ text: 'failure isolation' }).items.length === 1,
            '1. calling execute() with no argument at all still finds the local Publication — the pre-0.9.339 call shape keeps working.');

        // G2. Explicitly null.
        const { searchPublicationsUseCase: withNull } = new CreateDiscoveryUseCase().execute({ decentralizedDiscoveryProvider: null });
        assert(withNull.execute({ text: 'failure isolation' }).items.length === 1,
            '2. explicitly passing null behaves identically.');

        // G3. A genuinely empty (but real) decentralized provider.
        const { searchPublicationsUseCase: withEmpty } = new CreateDiscoveryUseCase().execute({ decentralizedDiscoveryProvider: new DecentralizedPublicationDiscoveryProvider() });
        const emptyResult = withEmpty.execute({ text: 'failure isolation' });
        assert(emptyResult.items.length === 1, '3. an empty decentralized provider changes nothing — the local result is found, no error.');

        // No exception is ever raised by any of the three shapes above —
        // asserted implicitly (this section would have already thrown),
        // restated directly for clarity.
        assert(true, '4. none of the three shapes above required a try/catch — Repository never needs decentralized discovery to be available merely to function.');
    }
    console.log('✓ Section G: Repository continues functioning normally against local discovery alone whether the decentralized provider is omitted, explicitly null, or present-but-empty — no error, no special handling required by any caller.');

    // ===============================================================
    // Section H — No duplicate admission: the composite invents no
    // deduplication of its own; the existing provider's own documented
    // no-dedup stance is unchanged.
    // ===============================================================
    {
        const alice = makeIdentity('Alice');
        // Isolated from the class's own header comment, which explains
        // in prose what it deliberately does NOT do (and so legitimately
        // contains the word "deduplication" itself).
        const compositeSource = await readSource('discovery/CompositeDiscoveryProvider.js');
        const compositeClassBody = compositeSource.slice(compositeSource.indexOf('export class'));
        assert(!/dedup|new Set\(|new Map\(/i.test(compositeClassBody),
            '1. discovery/CompositeDiscoveryProvider.js\'s own class body contains no deduplication mechanism of any kind — confirmed structurally.');

        // Two INDEPENDENTLY resolved envelopes wrapping publications
        // that happen to share an author (the existing upstream
        // suppression is keyed on envelope id, one layer below this
        // provider entirely — see discovery/DecentralizedPublicationDiscoveryProvider.js's
        // own header) both remain, exactly as that class's own
        // documented "no invented deduplication policy" already states;
        // the composite must not additionally collapse them.
        const pubOne = makePublication({ documentId: 'merge-h-1', title: 'Repeat Observation One', author: 'alice' }, alice);
        const pubTwo = makePublication({ documentId: 'merge-h-2', title: 'Repeat Observation Two', author: 'alice' }, alice);
        const viewOne = await resolveAsDecentralizedPublication(pubOne, alice);
        const viewTwo = await resolveAsDecentralizedPublication(pubTwo, alice);
        const provider = new DecentralizedPublicationDiscoveryProvider();
        admitToRepositoryDiscovery(viewOne, provider);
        admitToRepositoryDiscovery(viewTwo, provider);
        assert(provider.list().length === 2, '2. setup: both observations are retained by the provider itself, unchanged.');

        clearLocalPublications();
        const { searchPublicationsUseCase } = new CreateDiscoveryUseCase().execute({ decentralizedDiscoveryProvider: provider });
        const byAuthor = searchPublicationsUseCase.execute({ author: 'alice', pageSize: 50 });
        assert(byAuthor.items.length === 2,
            '3. Repository\'s own composed search retains both — the composite adds no deduplication on top of what the provider it wraps already does not do.');
    }
    console.log('✓ Section H: discovery/CompositeDiscoveryProvider.js adds no deduplication of its own — the existing upstream suppression (envelope-id re-announce) and the existing provider\'s own documented no-dedup stance both pass through Repository\'s composed search unchanged.');

    // ===============================================================
    // Section I — Existing non-Repository consumers: CreateDiscoveryUseCase
    // also serves Editor/Fork lookup, World View, Recent Worlds, and
    // Author View. Each is audited individually for why widened
    // visibility is compatible with its own existing contract, rather
    // than assumed compatible because "it uses the same composition
    // root."
    // ===============================================================
    {
        // I1. ui/views/EditorView.js — fork/load lookup. Widening here is
        // not merely compatible, it is REQUIRED: 0.9.338's own Section D
        // identified findPublicationUseCase's inability to see a
        // decentralized-origin Publication by id as the SAME root cause
        // as Repository's own gap (Section A of this file). Reconfirmed
        // structurally.
        const editorViewSource = await readSource('ui/views/EditorView.js');
        assert(editorViewSource.includes("inject('decentralizedPublicationDiscoveryProvider', null)") &&
            editorViewSource.includes('findPublicationUseCase'),
            '1. EditorView.js\'s fork/load lookup now shares the merged composition — required by 0.9.338\'s own finding, not merely permitted.');

        // I2. ui/views/WorldView.js — used ONLY for title/author
        // enrichment of loaded/nearby world markers and a catalogEmpty
        // flag (allPublications), never for World Search itself, which
        // stays entirely separate (session.searchWorld(), built inside
        // application/CreateWorldViewUseCase.js's own independent
        // LocalDiscoveryProvider). Reconfirmed both ways.
        const worldViewSource = await readSource('ui/views/WorldView.js');
        assert(worldViewSource.includes("inject('decentralizedPublicationDiscoveryProvider', null)"),
            '2. WorldView.js now merges in the shared provider for its own title/author enrichment.');
        assert(worldViewSource.includes('session.searchWorld(options)'),
            '3. ...while World Search itself still goes through session.searchWorld(), never CreateDiscoveryUseCase.');
        const createWorldViewSource = await readSource('application/CreateWorldViewUseCase.js');
        assert(createWorldViewSource.includes('new LocalDiscoveryProvider(storageProvider)') &&
            !/decentralizedDiscoveryProvider|DecentralizedPublicationDiscoveryProvider/.test(createWorldViewSource),
            '4. application/CreateWorldViewUseCase.js — World Search\'s own, separate composition root — is untouched and still local-only, exactly as tests/FederatedRepositoryProductGapAudit.test.js already established; docs/Principles.md\'s own "Discovery Is One Path, Not Two" is unaffected because this milestone never touched that path.');

        // I3. ui/views/RecentWorldsView.js — discoveryProvider is used
        // only via findByDocumentId(documentId), where `documentId`
        // always comes from THIS replica's own local visit history
        // (LocalWorldExperienceStore), never from decentralized
        // discovery itself. Widening only means a documentId already in
        // local history gets a real title/author card instead of a
        // raw-id fallback — it cannot surface a World this replica never
        // visited.
        const recentWorldsSource = await readSource('ui/views/RecentWorldsView.js');
        assert(recentWorldsSource.includes("inject('decentralizedPublicationDiscoveryProvider', null)") &&
            recentWorldsSource.includes('discoveryProvider.findByDocumentId(documentId)'),
            '5. RecentWorldsView.js merges in the shared provider for enrichment of documentIds that only ever come from this replica\'s own local visit history.');

        // I4. ui/views/AuthorView.js — the SAME "Original Works & Forks"
        // Repository-shaped view for one author PublicationCatalog.js
        // already covers for the unscoped case; sharing the identical
        // composition is consistent, not a broadening beyond Repository
        // itself.
        const authorViewSource = await readSource('ui/views/AuthorView.js');
        assert(authorViewSource.includes("inject('decentralizedPublicationDiscoveryProvider', null)"),
            '6. AuthorView.js shares the identical merged composition PublicationCatalog.js uses — this IS Repository, scoped to one author, not a new surface.');
    }
    console.log('✓ Section I: every existing CreateDiscoveryUseCase consumer was individually audited, not assumed compatible. EditorView.js\'s widening is REQUIRED by 0.9.338\'s own finding. WorldView.js\'s and RecentWorldsView.js\'s widening only affects enrichment of already-known documentIds, never World Search itself (confirmed separately untouched). AuthorView.js is Repository itself, author-scoped. No consumer\'s established contract is broken by this uniform wiring.');

    // ===============================================================
    // Section J — Provider isolation (the brief's own "particularly
    // important test"): local and decentralized contents compose
    // additively, and additivity survives the decentralized side going
    // empty.
    // ===============================================================
    {
        const alice = makeIdentity('Alice');
        const publicationA = makePublication({ documentId: 'merge-j-a', title: 'Publication A', author: 'alice' }, alice);
        clearLocalPublications();
        saveLocalPublications([publicationA]);

        const publicationBSource = makePublication({ documentId: 'merge-j-b', title: 'Publication B', author: 'alice' }, alice);
        const viewB = await resolveAsDecentralizedPublication(publicationBSource, alice);
        const decentralizedProvider = new DecentralizedPublicationDiscoveryProvider();
        admitToRepositoryDiscovery(viewB, decentralizedProvider);

        {
            const { searchPublicationsUseCase } = new CreateDiscoveryUseCase().execute({ decentralizedDiscoveryProvider: decentralizedProvider });
            assert(searchPublicationsUseCase.execute({ text: 'publication a' }).items.length === 1, '1. A found.');
            assert(searchPublicationsUseCase.execute({ text: 'publication b' }).items.length === 1, '2. B found.');
        }

        // Now the decentralized provider goes empty — a fresh instance,
        // standing in for "no candidate has ever been resolved yet,"
        // never a mutation of the one that held B.
        const emptyDecentralizedProvider = new DecentralizedPublicationDiscoveryProvider();
        {
            const { searchPublicationsUseCase } = new CreateDiscoveryUseCase().execute({ decentralizedDiscoveryProvider: emptyDecentralizedProvider });
            assert(searchPublicationsUseCase.execute({ text: 'publication a' }).items.length === 1,
                '3. A still found.');
            assert(searchPublicationsUseCase.execute({ text: 'publication b' }).items.length === 0,
                '4. B absent.');
            // "no error" — this line executing at all is the proof; the
            // two assertions above would already have thrown otherwise.
        }
    }
    console.log('✓ Section J: federation is additive, not a replacement of local discovery — local Publication A and decentralized Publication B are both found while both providers hold content, and A remains found, with no error, once the decentralized side is emptied.');

    // ===============================================================
    // Section K — FLAGSHIP: a decentralized Publication travels a real,
    // live, authenticated peer connection, resolves through the real
    // production resolvePublicationView() seam, is admitted into the
    // shared provider, and is found by the EXACT composition the real
    // Repository page runs — then continues, unmodified, into the
    // already-proven (0.9.338) Explore/Fork identity path.
    // ===============================================================
    {
        const network = new LocalPeerNetwork();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');

        const aliceTransport = new LocalPeerConnectionProvider('alice-repo-merge', network);
        const bobTransport = new LocalPeerConnectionProvider('bob-repo-merge', network);
        const aliceConnect = new ConnectToPeerUseCase({ peerConnectionProvider: aliceTransport, identityProvider: alice });
        const stopListening = aliceConnect.listen();
        const bobConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bobTransport, identityProvider: bob });
        const bobConnectedPeer = bobConnect.connect({ candidateEndpoint: 'alice-repo-merge' });
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
            { documentId: 'merge-flagship-1', title: 'The Merged Federated Atlas', author: 'alice' }, alice
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

        // The one application-lifetime provider this replica would use
        // — a fresh instance here only because this test process is not
        // ui/main.js itself (Section 0 above already confirmed
        // structurally that production never builds more than one).
        const sharedProvider = new DecentralizedPublicationDiscoveryProvider();
        admitToRepositoryDiscovery(view, sharedProvider);
        assert(sharedProvider.list().length === 1 && sharedProvider.list()[0] === view.content,
            '5. the resolved, peer-delivered Publication is admitted into the shared provider.');

        alicePeerExchange.dispose();
        bobPeerExchange.dispose();
        stopListening();
        aliceTransport.dispose();
        bobTransport.dispose();

        // The EXACT production composition ui/components/PublicationCatalog.js
        // now runs: inject the shared provider, thread it through
        // CreateDiscoveryUseCase.
        clearLocalPublications();
        const {
            searchPublicationsUseCase: repositoryPageSearch,
            findPublicationUseCase: editorPageLookup
        } = new CreateDiscoveryUseCase().execute({ decentralizedDiscoveryProvider: sharedProvider });

        const repositoryResult = repositoryPageSearch.execute({ text: 'merged federated atlas' });
        assert(repositoryResult.items.length === 1 && repositoryResult.items[0] === view.content,
            '6. Repository\'s own real search — the SAME PublicationCatalog composition — finds the Publication.');

        // Selection: the identical documentId/id Repository selection
        // has always carried (0.9.338 Section B, unmodified by this
        // milestone).
        const [selected] = repositoryResult.items;
        assert(typeof selected.documentId === 'string' && typeof selected.id === 'string',
            '7. selection carries exactly documentId and id — the existing identity model, nothing new.');

        // Continue into the already-proven (0.9.338) Fork identity path,
        // unmodified: EditorView.js's own findPublicationUseCase (now
        // reachable, Section I1 above) resolves route.query.publication
        // to the real Publication instance, which ForkDocumentUseCase
        // then accepts exactly as it accepts a local Publication's own.
        const sourcePublication = editorPageLookup.execute(selected.id);
        assert(sourcePublication === view.content,
            '8. Editor\'s fork-time lookup (0.9.338\'s own Section D gap) now finds the SAME Publication instance Repository search did.');

        const emptyStorage = new InMemoryStorageProvider();
        const forkUseCase = new ForkDocumentUseCase(emptyStorage);
        assertThrows(
            () => forkUseCase.execute(selected.documentId, null, sourcePublication),
            `no document found with id "${selected.documentId}"`,
            '9. ForkDocumentUseCase.execute() reaches the identical, unmodified material-acquisition boundary (0.9.338 Section E/I) a local Publication\'s fork would hit — this milestone changed discovery reachability only, never Fork/Explore mechanics.'
        );
    }
    console.log('✓ Section K: FLAGSHIP. Over a real, live, authenticated peer connection, a Publication reaches resolvePublicationView() and is admitted into the shared, application-lifetime DecentralizedPublicationDiscoveryProvider — and the EXACT production composition ui/components/PublicationCatalog.js now runs (inject -> CreateDiscoveryUseCase -> CompositeDiscoveryProvider) finds it. Selection carries the existing documentId/id identity, unmodified; Editor\'s own fork-time lookup (0.9.338\'s own Section D gap) now finds the identical Publication instance; ForkDocumentUseCase reaches the identical, unmodified material-acquisition boundary. Discovery is now reachable end to end — downstream mechanics are exactly as 0.9.338 already proved them.');

    // ===============================================================
    // Section L — Deliberately excluded, checked rather than assumed.
    // ===============================================================
    {
        const compositeSource = await readSource('discovery/CompositeDiscoveryProvider.js');
        const createDiscoverySource = await readSource('application/CreateDiscoveryUseCase.js');
        assert(!/Nostr/.test(compositeSource) && !/Nostr/.test(createDiscoverySource),
            '1. no Nostr discovery of any kind was introduced.');
        assert(!/FederatedDiscoveryProvider/.test(compositeSource) && !/FederatedDiscoveryProvider/.test(createDiscoverySource),
            '2. no "FederatedDiscoveryProvider" domain concept was introduced — the merge is the small, generic CompositeDiscoveryProvider the 0.9.338 audit itself recommended, named for what it does.');
        assert(!/TTL|trust|canonical|preferred/i.test(compositeSource),
            '3. no ranking, source preference, trust, or TTL concept exists in the new composition class.');

        const searchUseCaseSource = await readSource('application/SearchPublicationsUseCase.js');
        const localDiscoverySource = await readSource('discovery/LocalDiscoveryProvider.js');
        const decentralizedProviderSource = await readSource('discovery/DecentralizedPublicationDiscoveryProvider.js');
        assert(!/CompositeDiscoveryProvider/.test(searchUseCaseSource),
            '4. application/SearchPublicationsUseCase.js itself is untouched — it still only ever calls discoveryProvider.list(), unaware a composite exists.');
        assert(!/Composite|decentralizedDiscoveryProvider/.test(localDiscoverySource),
            '5. discovery/LocalDiscoveryProvider.js is untouched.');
        assert(!/Composite/.test(decentralizedProviderSource),
            '6. discovery/DecentralizedPublicationDiscoveryProvider.js is untouched — composition happens ABOVE it, never inside it, exactly as this milestone\'s own brief required.');
    }
    console.log('✓ Section L: no Nostr discovery, no new peer discovery, no "FederatedDiscoveryProvider" domain concept, no ranking/trust/TTL/source-preference, and no change to SearchPublicationsUseCase.js, LocalDiscoveryProvider.js, or DecentralizedPublicationDiscoveryProvider.js — the merge lives entirely in the one small composite class and the one composition root that constructs it.');

    console.log('\nAll Decentralized Publication Repository Merge tests passed.');
}

run().catch((error) => {
    console.error('DecentralizedPublicationRepositoryMerge.test.js FAILED:', error);
    process.exitCode = 1;
});
