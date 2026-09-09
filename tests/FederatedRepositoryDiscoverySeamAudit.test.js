import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { License } from '../core/License.js';
import { DecentralizedPublication } from '../core/DecentralizedPublication.js';
import { PublicationResolver } from '../application/PublicationResolver.js';
import { PublicationResolutionOutcome } from '../application/PublicationResolutionOutcome.js';
import { PUBLICATION_CONTENT_KIND } from '../application/PublicationContentValidator.js';
import { createPublicationContentKind } from '../application/PublicationContentKind.js';
import { DiscoveryProvider } from '../discovery/DiscoveryProvider.js';
import { SearchPublicationsUseCase } from '../application/SearchPublicationsUseCase.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';

// 0.9.334 — Federated Repository Discovery Seam Audit.
//
// Test-only. Production changes: none (enforced by Section L's own git-diff
// guard). 0.9.330 recorded the product direction and named a smallest FIRST
// seam (a third DecentralizedPublication content-kind plugin). 0.9.331 built
// it. 0.9.332 proved it genuinely travels the existing decentralized
// transport. 0.9.333 closed the one gap 0.9.332 named — display — and its
// own "What comes after" pointed here explicitly: "what existing
// decentralized discovery capability could actually produce
// forkbuild.publication candidates suitable for a future Repository search
// seam remains open... a substantially different question from transport,
// resolution, or display."
//
// This milestone answers that question, and only that question:
//
//   What is the smallest EXISTING discovery seam through which a resolved
//   decentralized `forkbuild.publication` object can become a Repository
//   search CANDIDATE?
//
// The originating brief's own diagram read:
//
//   Repository -> SearchPublicationsUseCase -> LocalPublicationCatalog -> Publication
//
// Section A corrects this against source before anything else, the same
// "vocabulary corrected against source rather than accepted as given"
// discipline 0.9.330's own Section A applied to the brief's "Snapshot"
// vocabulary one milestone earlier: `application/LocalPublicationCatalog.js`
// never appears anywhere in Repository's own call chain. Every later
// section reasons about the REAL chain, traced fresh from source.
//
//   Section A — Vocabulary correction: TWO differently-named "publication
//               catalogs" exist, and they are not the same thing.
//   Section B — Question A: what Repository's search contract actually is,
//               traced to its real collaborators.
//   Section C — The decoy seam: a DiscoveryProvider subclass already
//               touches the DecentralizedPublication world, but is not,
//               and cannot be, Repository's own seam.
//   Section D — Question A, answered: Publication -> searchable Repository
//               result, never a catalog-specific projection.
//   Section E — Question B: a resolved decentralized Publication, proven
//               LIVE (not merely by type-reading) to satisfy Repository's
//               real, unmodified SearchPublicationsUseCase contract.
//   Section F — What Section E's own proof required that production code
//               does not yet supply: a place to accumulate a resolved
//               candidate for list() to find.
//   Section G — Question D: peer infrastructure, reconfirmed fresh.
//   Section H — Question E: decentralized discovery, reconfirmed fresh —
//               two unrelated envelope families, neither producing
//               forkbuild.publication candidates.
//   Section I — Question F: identity, proven structurally distinct.
//   Section J — Question G: deduplication, characterized, not built.
//   Section K — A direct correction: one 0.9.330 claim re-verified fresh
//               against source, found to rest on a regex blind spot.
//   Section L — No UI change; no production file touched.
//   Section M — Final classification.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch { threw = true; }
    assert(threw, message);
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function readSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

async function sourceExists(relativePath) {
    try {
        await readSource(relativePath);
        return true;
    } catch {
        return false;
    }
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

// Mirrors publisher/LocalPublisherProvider.js's own real construction shape
// (Section K re-verifies exactly which fields that class actually
// populates) — never a hand-rolled shape invented for this audit alone.
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
    console.log('Running Federated Repository Discovery Seam Audit tests...\n');

    // ===============================================================
    // Section A — Vocabulary correction: two differently-named
    // "publication catalogs" exist, and they are not the same thing.
    // ===============================================================
    {
        // A1. application/LocalPublicationCatalog.js is real — but it
        // indexes core/DecentralizedPublication.js ENVELOPES (any
        // contentKind), never publisher/Publication.js instances, and its
        // own header says so directly.
        const localPublicationCatalog = await readSource('application/LocalPublicationCatalog.js');
        assert(localPublicationCatalog.includes("import { DecentralizedPublication } from '../core/DecentralizedPublication.js';"),
            '1. application/LocalPublicationCatalog.js is built on core/DecentralizedPublication.js, never publisher/Publication.js.');
        assert(!/publisher\/Publication\.js/.test(localPublicationCatalog),
            '2. confirmed structurally: application/LocalPublicationCatalog.js never imports publisher/Publication.js at all.');
        assert(proseIncludes(localPublicationCatalog, 'A core/DecentralizedPublication.js instance already IS the slim, signed locator record'),
            "3. its own header states directly what it stores — a DecentralizedPublication locator, never Repository's own Publication.");

        // A2. Repository's REAL search contract never imports or
        // references application/LocalPublicationCatalog.js at all — the
        // originating brief's own diagram does not survive contact with
        // source.
        const searchPublicationsUseCase = await readSource('application/SearchPublicationsUseCase.js');
        assert(!/LocalPublicationCatalog/.test(searchPublicationsUseCase),
            '4. application/SearchPublicationsUseCase.js never mentions LocalPublicationCatalog — the brief\'s own diagram link does not exist in source.');
        const createDiscoveryUseCase = await readSource('application/CreateDiscoveryUseCase.js');
        assert(!/LocalPublicationCatalog/.test(createDiscoveryUseCase),
            '5. application/CreateDiscoveryUseCase.js — the composition root that actually builds SearchPublicationsUseCase\'s collaborator — never references LocalPublicationCatalog either.');

        // A3. Repository's REAL local store has no "Catalog" class at
        // all: discovery/LocalDiscoveryProvider.js reads a plain
        // localStorage array directly, under a DIFFERENT key than
        // LocalPublicationCatalog's own.
        const localDiscoveryProvider = await readSource('discovery/LocalDiscoveryProvider.js');
        assert(localDiscoveryProvider.includes("const PUBLICATIONS_KEY = 'forkbuild-publications';"),
            '6. discovery/LocalDiscoveryProvider.js reads storage key "forkbuild-publications" directly — no catalog class wraps it.');
        assert(localPublicationCatalog.includes("const STORAGE_KEY = 'publication-catalog:entries';"),
            "7. application/LocalPublicationCatalog.js reads a DIFFERENT storage key entirely — the two are not two names for one store.");

        // A4. And the one class that DOES bridge LocalPublicationCatalog
        // to a DiscoveryProvider-shaped interface is wired to neither
        // Repository nor SearchPublicationsUseCase — Section C traces
        // exactly where it goes instead.
        assert(await sourceExists('discovery/PublicationCatalogDiscoveryProvider.js'),
            '8. the one existing DiscoveryProvider subclass over LocalPublicationCatalog, discovery/PublicationCatalogDiscoveryProvider.js, is real — Section C traces what it actually does.');
    }
    console.log('✓ Section A: the originating brief\'s own diagram ("SearchPublicationsUseCase -> LocalPublicationCatalog -> Publication") is corrected against source. application/LocalPublicationCatalog.js is real, but it indexes core/DecentralizedPublication.js envelopes (any contentKind) for the Publications Center — never publisher/Publication.js, and never referenced anywhere in Repository\'s own SearchPublicationsUseCase.js or its composition root, CreateDiscoveryUseCase.js. Repository\'s real local store has no catalog CLASS at all: discovery/LocalDiscoveryProvider.js scans a plain array under its own, differently-named storage key. Every later section reasons about the REAL chain, not the brief\'s own.');

    // ===============================================================
    // Section B — Question A: what Repository's search contract
    // actually is, traced to its real collaborators.
    // ===============================================================
    {
        // B1. SearchPublicationsUseCase's own real dependency: an
        // injected discoveryProvider, called synchronously, once, for
        // the WHOLE candidate set — never LocalPublicationCatalog, never
        // an async source.
        const searchPublicationsUseCase = await readSource('application/SearchPublicationsUseCase.js');
        assert(searchPublicationsUseCase.includes('constructor(discoveryProvider, loadPublicationDocumentUseCase = null)'),
            '1. SearchPublicationsUseCase\'s own constructor takes a discoveryProvider as its primary, required collaborator.');
        assert(searchPublicationsUseCase.includes('let candidates = this._discoveryProvider.list();'),
            '2. execute() pulls the FULL candidate set synchronously from discoveryProvider.list() — never awaited, never paginated at the source.');

        // B2. discovery/DiscoveryProvider.js is ALREADY an abstract seam
        // deliberately designed for multiple sources — this is not a
        // gap this milestone needs to invent.
        const discoveryProvider = await readSource('discovery/DiscoveryProvider.js');
        assert(proseIncludes(discoveryProvider, 'without knowing whether the source is localStorage, Steem, Hive, IPFS, or another ForkBuild node'),
            '3. discovery/DiscoveryProvider.js\'s own header already frames itself as substrate-neutral — the pluggable-source SHAPE already exists.');
        assert(discoveryProvider.includes('list()') && discoveryProvider.includes('findById(id)'),
            '4. its own contract is exactly list()/findById()/findByAuthor()/findByParentId()/findByDocumentId() — all synchronous, all throwing stubs for a subclass to implement.');

        // B3. The candidates a REAL discoveryProvider hands back today
        // are genuine publisher/Publication.js instances, not a
        // catalog-specific wrapper.
        const localDiscoveryProvider = await readSource('discovery/LocalDiscoveryProvider.js');
        assert(localDiscoveryProvider.includes("import { Publication } from '../publisher/Publication.js';") &&
            localDiscoveryProvider.includes('Publication.fromJSON(record)'),
            '5. discovery/LocalDiscoveryProvider.js#list() returns real publisher/Publication.js instances, constructed via Publication.fromJSON() — never a projection type.');

        // B4. Composition root: UPDATED by 0.9.339 — Merge Decentralized
        // Publication Discovery into Repository Discovery. At the time
        // THIS audit was written, exactly one DiscoveryProvider
        // (LocalDiscoveryProvider, unconditionally) was ever constructed
        // and injected into SearchPublicationsUseCase in production.
        // 0.9.339 widened this the same way Section B5/B6 below already
        // widens "exactly two/three DiscoveryProvider subclasses" rather
        // than leaving a stale "exactly one" claim to rot: LocalDiscoveryProvider
        // is still unconditionally constructed, unchanged, but is now
        // OPTIONALLY combined with an injected decentralizedDiscoveryProvider
        // through discovery/CompositeDiscoveryProvider.js — a real
        // second discoveryProvider now reaches SearchPublicationsUseCase
        // in production whenever a caller supplies one (every real UI
        // caller now does — see tests/DecentralizedPublicationRepositoryMerge.test.js).
        const createDiscoveryUseCase = await readSource('application/CreateDiscoveryUseCase.js');
        assert(createDiscoveryUseCase.includes('const localDiscoveryProvider = new LocalDiscoveryProvider(storageProvider);') &&
            createDiscoveryUseCase.includes('new CompositeDiscoveryProvider([localDiscoveryProvider, decentralizedDiscoveryProvider])') &&
            createDiscoveryUseCase.includes('new SearchPublicationsUseCase(discoveryProvider, loadPublicationDocumentUseCase)'),
            '6. UPDATED (0.9.339): application/CreateDiscoveryUseCase.js still unconditionally constructs LocalDiscoveryProvider, and now optionally composes it with an injected decentralizedDiscoveryProvider via discovery/CompositeDiscoveryProvider.js — LocalDiscoveryProvider alone is no longer the ONLY discoveryProvider Repository search can be given in production.');
        // 0.9.335 added the third: discovery/DecentralizedPublicationDiscoveryProvider.js,
        // exactly the accumulator this audit's own Section F named as
        // missing. Widened here explicitly, the same way 0.9.333 widened
        // 0.9.332's own Section G3 exception list, rather than left to
        // rot into a false "exactly two" claim. 0.9.339 adds a fourth:
        // discovery/CompositeDiscoveryProvider.js, the small, generic
        // merge Section B4 above just reconfirmed — it performs no
        // discovery of its own, only forwarding to the providers it is
        // given (see its own header), so it does not change this
        // section's own "no Steem/Hive/IPFS/Peer live-querying
        // implementation has ever been built" finding.
        const extendsDiscoveryProvider = grepFiles('extends DiscoveryProvider', ['discovery']);
        assert(extendsDiscoveryProvider.length === 4 &&
            extendsDiscoveryProvider.includes('discovery/LocalDiscoveryProvider.js') &&
            extendsDiscoveryProvider.includes('discovery/PublicationCatalogDiscoveryProvider.js') &&
            extendsDiscoveryProvider.includes('discovery/DecentralizedPublicationDiscoveryProvider.js') &&
            extendsDiscoveryProvider.includes('discovery/CompositeDiscoveryProvider.js'),
            `7. UPDATED (0.9.339): exactly FOUR DiscoveryProvider subclasses exist in this codebase today (found: ${extendsDiscoveryProvider.join(', ')}) — 0.9.335 added the accumulator this audit's own Section F named as the missing half of the gap, and 0.9.339 added the small, generic merge that combines it with LocalDiscoveryProvider; still no Steem/Hive/IPFS/Peer live-querying implementation has ever been built.`);
    }
    console.log('✓ Section B: Repository\'s real search contract, traced to its actual collaborators — SearchPublicationsUseCase.execute() calls discoveryProvider.list() synchronously, once, for the entire candidate set, then filters/sorts/paginates in memory. discovery/DiscoveryProvider.js is ALREADY an abstract, substrate-neutral seam by its own header — the shape a federated source would plug into already exists. At the time this audit was originally written, exactly one working implementation existed in production, LocalDiscoveryProvider, unconditionally wired by CreateDiscoveryUseCase.js, returning real Publication instances from a plain localStorage scan; 0.9.335 has since added a second, accumulator-shaped one (discovery/DecentralizedPublicationDiscoveryProvider.js), reconfirmed above rather than left stale. No Peer, Steem, Hive, or IPFS DiscoveryProvider that itself performs live querying has ever been built.');

    // ===============================================================
    // Section C — The decoy seam: a DiscoveryProvider subclass already
    // touches the DecentralizedPublication world, but is not, and
    // cannot be, Repository's own seam.
    // ===============================================================
    {
        const bridgeProvider = await readSource('discovery/PublicationCatalogDiscoveryProvider.js');

        // C1. It DOES extend DiscoveryProvider and DOES wrap
        // LocalPublicationCatalog — the one point of contact between
        // the two worlds Section A distinguished.
        assert(bridgeProvider.includes('export class PublicationCatalogDiscoveryProvider extends DiscoveryProvider {') &&
            bridgeProvider.includes('this._publicationCatalog = publicationCatalog;'),
            '1. discovery/PublicationCatalogDiscoveryProvider.js does extend DiscoveryProvider and does wrap a LocalPublicationCatalog — a real point of contact, not imagined.');

        // C2. But it implements ONLY findById(), and findById() returns
        // whatever LocalPublicationCatalog#get() returns — a
        // DecentralizedPublication, never a Publication. list() is left
        // as DiscoveryProvider's own inherited throwing stub.
        assert(bridgeProvider.includes('findById(id) {') && bridgeProvider.includes('return this._publicationCatalog.get(id);'),
            '2. its own findById() is a pure pass-through to LocalPublicationCatalog#get() — which returns a DecentralizedPublication, confirmed in Section A.');
        assert(!/\n\s*list\(/.test(bridgeProvider),
            '3. list() is never overridden here — a caller invoking it gets DiscoveryProvider\'s own inherited throw, never a candidate set.');
        assert(proseIncludes(bridgeProvider, 'list()/findByAuthor()/findByParentId()/ findByDocumentId() are deliberately left unimplemented'),
            '4. its own header confirms this is deliberate, not an oversight — inventing meaning for a catalog with a genuinely different shape "would invent behavior nobody asked for."');

        // C3. It is wired to a DIFFERENT pipeline entirely — Snapshot
        // placement creation (0.8.18/0.8.25) — never Repository.
        assert(proseIncludes(bridgeProvider, 'so the 0.8.18 creation pipeline can finally be wired against the SAME catalog'),
            '5. its own header names its real caller directly: the Snapshot placement creation pipeline, not Repository search.');
        const searchPublicationsUseCase = await readSource('application/SearchPublicationsUseCase.js');
        const publicationCatalogUi = await readSource('ui/components/PublicationCatalog.js');
        const createDiscoveryUseCase = await readSource('application/CreateDiscoveryUseCase.js');
        for (const [name, src] of [
            ['application/SearchPublicationsUseCase.js', searchPublicationsUseCase],
            ['ui/components/PublicationCatalog.js', publicationCatalogUi],
            ['application/CreateDiscoveryUseCase.js', createDiscoveryUseCase]
        ]) {
            assert(!/PublicationCatalogDiscoveryProvider/.test(src),
                `6. ${name} never references discovery/PublicationCatalogDiscoveryProvider.js — confirmed directly, not merely inferred from its header.`);
        }
        const bridgeConsumers = grepFiles('PublicationCatalogDiscoveryProvider', ['application', 'ui'])
            .filter((f) => !f.includes('.test.js'));
        assert(!bridgeConsumers.some((f) => /Search|Repository/i.test(f)),
            `7. no Repository- or Search-named production file consumes PublicationCatalogDiscoveryProvider (production consumers found: ${bridgeConsumers.join(', ') || 'none'}).`);

        // C4. So: same base class, similar name, adjacent domain — but
        // structurally unusable as SearchPublicationsUseCase's own
        // discoveryProvider even if someone tried, because it returns
        // the wrong TYPE (DecentralizedPublication, not Publication)
        // and does not implement list() at all.
        let thrown = null;
        class ThrowsUnlessOverridden extends DiscoveryProvider {}
        try {
            new ThrowsUnlessOverridden().list();
        } catch (error) {
            thrown = error;
        }
        assert(thrown && /must be implemented by a subclass/.test(thrown.message),
            '8. reconfirmed live: DiscoveryProvider\'s own list() throws unless a subclass overrides it — exactly what PublicationCatalogDiscoveryProvider inherits unmodified.');
    }
    console.log('✓ Section C: a false-friend seam, ruled out by direct evidence rather than assumed absent. discovery/PublicationCatalogDiscoveryProvider.js DOES extend DiscoveryProvider and DOES wrap LocalPublicationCatalog — the one real point of contact between the two worlds Section A distinguished. But it implements only findById() (returning a DecentralizedPublication — the wrong type for SearchPublicationsUseCase\'s own contract), leaves list() as an inherited throw, and its own header names its real, sole caller as the Snapshot placement creation pipeline (0.8.18/0.8.25) — never Repository. Confirmed in both directions: Repository\'s own files never reference it, and it never references Repository.');

    // ===============================================================
    // Section D — Question A, answered: Publication -> searchable
    // Repository result, never a catalog-specific projection.
    // ===============================================================
    {
        // D1. No RepositoryEntry/projection wrapper type exists anywhere.
        const suspiciousProjectionNames = ['RepositoryEntry', 'RepositorySearchResult', 'PublicationCatalogEntry', 'DiscoveryResult'];
        for (const name of suspiciousProjectionNames) {
            const hits = grepFiles(`class ${name}`, ['application', 'core', 'discovery', 'ui']);
            assert(hits.length === 0, `1. no "class ${name}" exists anywhere — Repository invents no second, catalog-specific result type (found: ${hits.join(', ') || 'none'}).`);
        }

        // D2. SearchPublicationsUseCase's own filtering/sorting operates
        // directly on Publication's own real fields — proof by usage,
        // not merely by absence of a wrapper class.
        const searchPublicationsUseCase = await readSource('application/SearchPublicationsUseCase.js');
        assert(searchPublicationsUseCase.includes('p.author === query.author') &&
            searchPublicationsUseCase.includes("(publication.title || '').toLowerCase()") &&
            searchPublicationsUseCase.includes('publication.documentId'),
            '2. SearchPublicationsUseCase reads .author/.title/.documentId directly off each candidate — exactly Publication\'s own real getters, confirmed by usage.');

        console.log('✓ Section D: ANSWER — Repository\'s contract is "Publication -> searchable Repository result," never "LocalPublicationCatalog entry -> searchable result." No projection or wrapper type exists anywhere in this codebase (confirmed by direct search for the obvious candidate names), and SearchPublicationsUseCase\'s own filtering/sorting logic reads Publication\'s own real fields (.author, .title, .documentId) directly, with no intermediate shape at all.');
    }

    // ===============================================================
    // Section E — Question B: a resolved decentralized Publication,
    // proven LIVE (not merely by type-reading) to satisfy Repository's
    // real, unmodified SearchPublicationsUseCase contract.
    // ===============================================================
    let liveResolvedPublication;
    {
        // E1. FLAGSHIP. Alice publishes an ordinary Publication as a
        // forkbuild.publication envelope (0.9.331's own pipeline,
        // completely unmodified), Bob resolves it back — the exact
        // round trip tests/PublicationContentKind.test.js's own Section
        // A already proves for identity preservation. This section asks
        // a NEW question that file never asked: can the RESULT be
        // consumed by Repository's own real SearchPublicationsUseCase?
        const alice = makeIdentity('Alice');
        const sharedStorage = new InMemoryStorageProvider();
        const aliceResolver = new PublicationResolver(new LocalContentStore(sharedStorage), new LocalAuthorizationVerifier());

        const originalPublication = makeLocalStylePublication(
            { documentId: 'world-lighthouse-1', title: 'The Lighthouse', author: 'alice' },
            alice
        );

        const envelope = await aliceResolver.publish({
            content: originalPublication,
            contentKind: PUBLICATION_CONTENT_KIND,
            identityProvider: alice
        });
        assert(envelope instanceof DecentralizedPublication, '1. publish() wraps the Publication in a DecentralizedPublication envelope, unmodified 0.9.331 behavior.');

        const bobVerifier = new LocalAuthorizationVerifier();
        const bobResolver = new PublicationResolver(new LocalContentStore(sharedStorage), bobVerifier);
        const kindPlugin = createPublicationContentKind({ verifier: bobVerifier });
        const result = await bobResolver.resolve(envelope.toJSON(), kindPlugin);
        assert(result.outcome === PublicationResolutionOutcome.RESOLVED, `2. Bob resolves the envelope back to real content (${result.reason}).`);

        liveResolvedPublication = result.content;
        assert(liveResolvedPublication instanceof Publication,
            '3. the resolved content is a genuine publisher/Publication.js instance — the EXACT class LocalDiscoveryProvider.list() already returns, confirmed by instanceof, not by reading a type annotation.');

        // E2. The real seam: a minimal, TEST-ONLY DiscoveryProvider that
        // lists exactly this one resolved Publication — nothing
        // Repository-owned is modified, no new store is built, this
        // stub is disposed at the end of this section. It proves the
        // SHAPE of the smallest adapter without committing to one.
        class SingleCandidateDiscoveryProvider extends DiscoveryProvider {
            constructor(publications) { super(); this._publications = publications; }
            list() { return this._publications; }
            findById(id) { return this._publications.find((p) => p.id === id) || null; }
        }
        const decentralizedOriginProvider = new SingleCandidateDiscoveryProvider([liveResolvedPublication]);

        // E3. The REAL, unmodified SearchPublicationsUseCase, imported
        // from application/SearchPublicationsUseCase.js exactly as
        // Repository's own composition root imports it — never a stub,
        // never a rewritten copy.
        const searchUseCase = new SearchPublicationsUseCase(decentralizedOriginProvider);

        const byText = searchUseCase.execute({ text: 'lighthouse' });
        assert(byText.items.length === 1 && byText.items[0].id === liveResolvedPublication.id,
            '4. Repository\'s own real SearchPublicationsUseCase finds the resolved decentralized-origin Publication by title text search, unmodified.');

        const byAuthor = searchUseCase.execute({ author: 'alice' });
        assert(byAuthor.items.length === 1 && byAuthor.items[0].documentId === 'world-lighthouse-1',
            '5. ...and by author filter, with documentId intact — the exact field Repository\'s own Fork/Explore actions key on (0.9.330 Section D).');

        const miss = searchUseCase.execute({ text: 'no-such-title-exists' });
        assert(miss.items.length === 0,
            '6. ...and correctly excludes it from an unrelated query — this is a real filter running against real fields, not a a tautological pass-through.');
    }
    console.log('✓ Section E: ANSWER — YES, empirically, not just by type-reading. A Publication resolved through the existing, completely unmodified PublicationResolver/PublicationContentKind pipeline (0.9.331/0.9.332) IS a genuine publisher/Publication.js instance, and Repository\'s own REAL, unmodified SearchPublicationsUseCase finds it by title text and by author filter the moment it is handed a DiscoveryProvider that lists it — with documentId (the field Fork/Explore key on) intact. The smallest possible adapter is exactly what Section B already named as the missing piece: a DiscoveryProvider implementation over resolved decentralized Publications — never a new Repository model, never a change to SearchPublicationsUseCase itself.');

    // ===============================================================
    // Section F — What Section E's own proof required that production
    // code does not yet supply: a place to accumulate a resolved
    // candidate for list() to find.
    // ===============================================================
    {
        // F1. Section E's stub provider was handed an array constructed
        // BY THE TEST, in memory, for exactly one already-resolved
        // Publication. In production, nothing plays that role: no
        // caller of createPublicationContentKind() ever gets a `store`
        // option, by design.
        const publicationContentKind = await readSource('application/PublicationContentKind.js');
        assert(proseIncludes(publicationContentKind, 'Deliberately NO `store` option, unlike the other two kind plugins'),
            "1. application/PublicationContentKind.js's own header states this restraint directly.");
        assert(!/store:/.test(publicationContentKind.split('createPublicationContentKind')[1] || ''),
            '2. confirmed structurally: the returned kindPlugin object literal never includes a `store` key.');

        // F2. No production file constructs a Publication FROM a
        // resolved decentralized envelope and hands it anywhere
        // persistent — the resolved object Section E worked with is,
        // in production, returned to a caller and then discarded.
        const resolutionCallSites = grepFiles('createPublicationContentKind\\(', ['application', 'ui'])
            .filter((f) => !f.includes('.test.js') && f !== 'application/PublicationContentKind.js');
        assert(resolutionCallSites.length === 1 && resolutionCallSites[0] === 'application/CreatePublicationDisplayKindRegistryUseCase.js',
            `3. the ONLY production call site for createPublicationContentKind() is the Publications Center's own display registry (found: ${resolutionCallSites.join(', ') || 'none'}) — a resolved Publication is used for display, not persisted anywhere list()-able.`);

        // F3. Reconfirmed fresh: no new Repository-owned store has been
        // introduced since 0.9.330's own guard — the constraint that
        // audit named still holds today.
        const suspiciousStoreNames = ['RepositoryFederationStore', 'RepositorySnapshotStore', 'RepositoryDecentralizedStore',
            'RepositoryPublicationSource', 'FederatedPublicationCatalog', 'DecentralizedRepositoryDiscoveryProvider'];
        for (const name of suspiciousStoreNames) {
            assert(!(await sourceExists(`application/${name}.js`)) && !(await sourceExists(`discovery/${name}.js`)),
                `4. ${name}.js does not exist in application/ or discovery/ — no second Repository-owned source of truth has been introduced.`);
        }
    }
    console.log('✓ Section F: Section E\'s own proof is honest about what it required — a test-built, in-memory array standing in for a producer/accumulator that does not exist in production. application/PublicationContentKind.js deliberately ships with no `store` option (confirmed structurally, not just quoted), and its one production caller (the Publications Center\'s own display registry) never persists a resolved Publication anywhere list()-able. No new Repository-owned store has been introduced since 0.9.330\'s own guard — reconfirmed fresh. This is the concrete, mechanical shape of a DISCOVERY GAP: the CONTRACT already accepts the right type (Section E); nothing in production yet produces or holds a candidate for it to receive.');

    // ===============================================================
    // Section G — Question D: peer infrastructure, reconfirmed fresh.
    // ===============================================================
    {
        // G1. Peer discovery still only ever answers a connectivity
        // question, never a content question.
        const peerDiscoveryProvider = await readSource('peer/PeerDiscoveryProvider.js');
        assert(proseIncludes(peerDiscoveryProvider, 'It only ever answers "what endpoints are worth attempting?"'),
            '1. peer/PeerDiscoveryProvider.js\'s own header still states this directly, unchanged since 0.9.330.');
        assert(!/Publication/.test(peerDiscoveryProvider),
            '2. it still never mentions "Publication" anywhere in its own source.');

        // G2. PublicationPeerExchange carries a live gossip transport,
        // but only ANNOUNCES envelopes a replica already holds to peers
        // it is ALREADY authenticated with — never a "does anyone know
        // about a publication I haven't seen" broadcast query, and
        // never a call into PublicationResolver.
        const publicationPeerExchange = await readSource('application/PublicationPeerExchange.js');
        assert(proseIncludes(publicationPeerExchange, 'it NEVER calls application/PublicationResolver.js, and never inspects the wrapped content or the locator\'s reachability'),
            '3. its own header states directly: this class never resolves, only relays already-signed envelopes.');
        assert(publicationPeerExchange.includes('const authenticatedPeers = this._registry.list().filter((peer) => peer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED);'),
            '4. announce() only ever reaches peers ALREADY authenticated on this replica\'s own ConnectedPeerRegistry — never a stranger with no prior connection.');
        assert(!/discoveryTag|browse|search/i.test(publicationPeerExchange),
            '5. confirmed structurally: no browse/search/discoveryTag vocabulary exists anywhere in this file — it is a relay, never a catalog query.');

        // G3. So Peer's real capability today, precisely: propagate an
        // ALREADY-KNOWN envelope to ALREADY-CONNECTED peers. It cannot
        // ask a peer "what have you got that I don't" — the exact gap
        // 0.9.330's own Section H already scoped down explicitly.
        assert(proseIncludes(publicationPeerExchange, 'a publication a caller can export is, by construction, already a real DecentralizedPublication instance the caller obtained some other way'),
            '6. reconfirmed: this class only ever moves a publication the CALLER already possesses — it is not, and cannot become, a stranger-catalog browse mechanism by itself.');
    }
    console.log('✓ Section G: reconfirmed fresh, unchanged since 0.9.330. peer/PeerDiscoveryProvider.js still only answers a connectivity question ("what endpoints are worth attempting?"), never a content one, and still never mentions Publication at all. application/PublicationPeerExchange.js DOES carry a live, real gossip transport for DecentralizedPublication envelopes — but it only ANNOUNCES an envelope a replica already holds to peers it is already authenticated with, never calls PublicationResolver, and carries no browse/query vocabulary. Peer infrastructure discovers ENDPOINTS and relays ALREADY-KNOWN envelopes among ALREADY-CONNECTED peers — it does not, and does not claim to, constitute a stranger-publication discovery catalog.');

    // ===============================================================
    // Section H — Question E: decentralized discovery, reconfirmed
    // fresh — two unrelated envelope families, neither producing
    // forkbuild.publication candidates.
    // ===============================================================
    {
        // H1. The Nostr pipeline that DOES exist for Publications
        // (NostrPublicationDiscoveryPublisher/NostrDiscoveryQueryService)
        // speaks a DIFFERENT envelope shape — DecentralizedDiscoveryEnvelope
        // { protocol, version, kind, objectId, uri } — built for
        // publication MATERIAL/location discovery of an
        // ALREADY-KNOWN publication, never for discovering an unknown
        // forkbuild.publication (DecentralizedPublication) envelope.
        const discoveryEnvelope = await readSource('core/DecentralizedDiscoveryEnvelope.js');
        assert(proseIncludes(discoveryEnvelope, 'a small, JSON, substrate-neutral envelope a publisher can attach to whatever payload field THEIR substrate already offers'),
            '1. core/DecentralizedDiscoveryEnvelope.js\'s own header names its own purpose directly: a location envelope, not a content-kind envelope.');
        assert(!/DecentralizedPublication\.js|PublicationResolver|forkbuild\.publication/.test(discoveryEnvelope),
            '2. confirmed structurally: it never imports core/DecentralizedPublication.js, application/PublicationResolver.js, or references forkbuild.publication at all.');

        const nostrPublisher = await readSource('application/NostrPublicationDiscoveryPublisher.js');
        assert(proseIncludes(nostrPublisher, 'It never imports `publisher/Publication.js`, signs anything belonging to a Publication, or reads a Publication\'s own `signature` field'),
            '3. application/NostrPublicationDiscoveryPublisher.js\'s own header confirms it never touches Publication or its signature at all.');
        assert(!/DecentralizedPublication\b/.test(nostrPublisher),
            '4. confirmed structurally: it never references core/DecentralizedPublication.js — it publishes a location envelope, never a forkbuild.publication one.');

        const nostrQueryService = await readSource('application/NostrDiscoveryQueryService.js');
        assert(!/DecentralizedPublication\b|PublicationResolver|createPublicationContentKind/.test(nostrQueryService),
            '5. application/NostrDiscoveryQueryService.js never references DecentralizedPublication, PublicationResolver, or the Publication content-kind plugin — it cannot produce a resolvable forkbuild.publication candidate today.');

        // H2. The other decentralized "browse the unknown by tag"
        // pattern in this codebase (Nostr Snapshot discovery) is real,
        // but 0.9.330 Section A/B5 already proved Snapshot is a
        // structurally disjoint domain object from Publication — this
        // is reconfirmed here, fresh, rather than merely cited.
        const nostrSnapshotDiscovery = await readSource('application/NostrSnapshotDiscoveryQueryService.js');
        assert(!/publisher\/Publication\.js|DecentralizedPublication\b|SearchPublicationsUseCase/.test(nostrSnapshotDiscovery),
            '6. application/NostrSnapshotDiscoveryQueryService.js still never imports Publication, DecentralizedPublication, or SearchPublicationsUseCase — its browsing pattern remains wired to Snapshot, a different domain object.');

        // H3. So: no existing decentralized discovery service — Nostr or
        // otherwise — currently emits a candidate a caller could hand to
        // application/PublicationResolver.js with createPublicationContentKind()
        // and expect RESOLVED. Confirmed by direct search across every
        // production caller of the resolver with that specific plugin
        // (Section F1 already found exactly one: the display registry,
        // which is handed an envelope a replica ALREADY cataloged via
        // PublicationExchange/PublicationPeerExchange, never one
        // discovered fresh from Nostr).
        const resolverCallers = grepFiles('createPublicationContentKind\\(', ['application', 'ui']).filter((f) => !f.includes('.test.js'));
        assert(resolverCallers.every((f) => !/Nostr/i.test(f)),
            `7. no Nostr-named file is among createPublicationContentKind()'s production callers (${resolverCallers.join(', ')}) — the decentralized discovery family and the Publication resolution family remain two unconnected pipelines today.`);
    }
    console.log('✓ Section H: reconfirmed fresh. Two structurally separate decentralized discovery families exist, and neither produces a forkbuild.publication candidate today. The Nostr pipeline built for Publications (NostrPublicationDiscoveryPublisher/NostrDiscoveryQueryService) speaks core/DecentralizedDiscoveryEnvelope.js — a self-declared {protocol,kind,objectId,uri} LOCATION claim for material belonging to a publication the caller ALREADY knows about — never core/DecentralizedPublication.js, and never forkbuild.publication. The other existing "browse the unknown by tag" pattern (Nostr Snapshot discovery) remains wired to a structurally disjoint domain object, unchanged since 0.9.330. This directly answers Question E: no existing decentralized discovery mechanism can produce a forkbuild.publication candidate with enough information to resolve it — that production capability does not exist yet, at all.');

    // ===============================================================
    // Section I — Question F: identity, proven structurally distinct.
    // ===============================================================
    {
        // I1. Publication.id, documentId, and contentReference.hash are
        // three distinct fields, proven live off the object Section E
        // itself produced through the real pipeline — not merely read
        // from a class definition.
        assert(typeof liveResolvedPublication.id === 'string' && liveResolvedPublication.id.length > 0,
            '1. Publication.id is a real, non-empty string.');
        assert(liveResolvedPublication.documentId === 'world-lighthouse-1',
            '2. Publication.documentId is a separate, caller-supplied field naming the World/document this publication wraps.');
        assert(liveResolvedPublication.id !== liveResolvedPublication.documentId,
            '3. id and documentId are, live, two different values on the same real object — never one field doing two jobs.');
        assert(liveResolvedPublication.contentReference instanceof ContentReference &&
            liveResolvedPublication.contentReference.hash !== liveResolvedPublication.id &&
            liveResolvedPublication.contentReference.hash !== liveResolvedPublication.documentId,
            '4. contentReference.hash (content-addressing identity of the DOCUMENT bytes) is a third, independent value.');

        // I2. The DecentralizedPublication envelope's own id is a FOURTH,
        // independent identity space — proven by direct construction,
        // not merely asserted from a header comment.
        const alice = makeIdentity('Alice');
        const storage = new InMemoryStorageProvider();
        const resolver = new PublicationResolver(new LocalContentStore(storage), new LocalAuthorizationVerifier());
        const publication = makeLocalStylePublication({ documentId: 'world-second-1', title: 'Second', author: 'alice' }, alice);
        const envelope = await resolver.publish({ content: publication, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: alice });
        assert(envelope.id !== publication.id,
            '5. the DecentralizedPublication envelope\'s own id is genuinely distinct from the wrapped Publication\'s own id — proven by direct construction, not read off a comment.');
        assert(envelope.contentReference.hash !== publication.contentReference.hash,
            "6. the envelope's own contentReference (hash of the transported Publication's own JSON) and the wrapped Publication's own contentReference (hash of the underlying Document content it references) are a FIFTH and SIXTH independent value — two separate content-addressing layers, never one hash doing two jobs.");

        // I3. Discovery-identity (a Nostr event id) and transport-identity
        // (a peer connection id) are two further, currently-unwired
        // fields — confirmed structurally never to feed into either
        // Publication.id or DecentralizedPublication.id anywhere.
        const nostrPublisher = await readSource('application/NostrPublicationDiscoveryPublisher.js');
        assert(proseIncludes(nostrPublisher, 'a Nostr event\'s own id is a hash of its signed fields'),
            "7. a Nostr event id is its own, independent identity space — this file's own header names it directly.");
        const peerConnection = await readSource('peer/PeerConnection.js');
        assert(/connectionId/.test(peerConnection),
            '8. peer/PeerConnection.js exposes its own connectionId — a transport identity, structurally unrelated to any publication field.');
        assert(!/publicationId|documentId/.test(peerConnection),
            '9. confirmed: peer/PeerConnection.js never references a publicationId or documentId — transport identity and publication identity are never conflated in this class.');
    }
    console.log('✓ Section I: ANSWER — Publication.id, documentId, contentReference (content-addressing), the DecentralizedPublication envelope\'s own id, a Nostr event id (discovery identity, not yet wired to forkbuild.publication at all), and a peer connectionId (transport identity) are proven, live, to be independent identity spaces — never one field standing in for another anywhere in this pipeline. Repository would invent no new identity by consuming a resolved decentralized Publication: it already has exactly the same id/documentId/contentReference shape as a locally-published one.');

    // ===============================================================
    // Section J — Question G: deduplication, characterized, not built.
    // ===============================================================
    {
        // J1. LocalPublicationCatalog's own dedup key is the envelope's
        // id, never a content hash — findByContentHash finds SIBLINGS,
        // it does not collapse them.
        const localPublicationCatalog = await readSource('application/LocalPublicationCatalog.js');
        assert(proseIncludes(localPublicationCatalog, 'Deduplicates by the envelope\'s own `id`, never by content hash'),
            "1. LocalPublicationCatalog's own header states its real dedup key directly.");
        assert(proseIncludes(localPublicationCatalog, 'Every cataloged publication whose OWN contentReference.hash equals'),
            '2. findByContentHash() answers "which independently-signed envelopes share these bytes," never "which one is canonical."');
        assert(proseIncludes(localPublicationCatalog, 'none more authoritative than another'),
            '3. its own header states directly: no result of findByContentHash() is ever treated as more authoritative than a sibling.');

        // J2. "same contentHash = same Repository record" is not an
        // existing semantic anywhere in Repository's own search/catalog
        // stack — confirmed by direct search, never assumed refuted.
        const searchPublicationsUseCase = await readSource('application/SearchPublicationsUseCase.js');
        const localDiscoveryProvider = await readSource('discovery/LocalDiscoveryProvider.js');
        for (const [name, src] of [
            ['application/SearchPublicationsUseCase.js', searchPublicationsUseCase],
            ['discovery/LocalDiscoveryProvider.js', localDiscoveryProvider]
        ]) {
            assert(!/contentHash|contentReference/.test(src),
                `4. ${name} never reads contentHash or contentReference for any purpose at all — Repository's own search stack has no notion of content-identity-based equality to begin with.`);
        }

        // J3. Two independent, already-standing architectural
        // restraints (0.9.330's own Section F) still govern any future
        // dedup policy — reconfirmed fresh, not merely cited.
        const principles = await readSource('docs/Principles.md');
        assert(principles.includes('### Acquisition Provenance Is Not Evidence Rank (0.8.17)') &&
            principles.includes('### Discovery Is Not Resolution (0.7.2)'),
            '5. both standing principles LocalPublicationCatalog\'s own dedup posture answers to are still present in docs/Principles.md, unchanged.');
    }
    console.log('✓ Section J: characterized, not built, per this milestone\'s own scope. LocalPublicationCatalog\'s own dedup key is the envelope\'s id, never content hash — findByContentHash() surfaces SIBLINGS explicitly, "none more authoritative than another," never a canonical pick. "Same contentHash = same Repository record" is not an existing semantic anywhere in Repository\'s own search/catalog stack (confirmed by direct search — neither SearchPublicationsUseCase.js nor LocalDiscoveryProvider.js reads contentHash/contentReference for any purpose today). Any future dedup policy for a federated Repository would answer to the same two standing, independent principles 0.9.330 already named — this audit builds no dedup logic of its own.');

    // ===============================================================
    // Section K — A direct correction: one 0.9.330 claim re-verified
    // fresh against source, found to rest on a regex blind spot.
    // ===============================================================
    {
        // K1. 0.9.330's own Section C3 asserted LocalPublisherProvider.js
        // "never sets contentReference or publisherIdentity at all,"
        // checked via `!/contentReference:|publisherIdentity:/`. That
        // regex requires a COLON immediately after the field name — but
        // the real source uses ES6 shorthand property syntax
        // (`contentReference,` with no colon at all), which the regex
        // structurally cannot detect either way. Re-verified fresh here,
        // directly, rather than trusted from a prior milestone's own
        // citation.
        const localPublisherProvider = await readSource('publisher/LocalPublisherProvider.js');
        assert(localPublisherProvider.includes('const contentReference = this._contentStore.put(canonicalString);'),
            "1. publisher/LocalPublisherProvider.js computes a REAL contentReference for every publish() call, unconditionally.");
        assert(/new Publication\(\{[\s\S]*?\bcontentReference,[\s\S]*?\}\)/.test(localPublisherProvider),
            '2. ...and passes it into `new Publication({ ..., contentReference, ... })` via ES6 shorthand — a pattern 0.9.330\'s own `/contentReference:/` regex could never have matched either way, whether the field were populated or omitted.');
        assert(/new Publication\(\{[\s\S]*?\bpublisherIdentity,[\s\S]*?\}\)/.test(localPublisherProvider),
            '3. publisherIdentity is passed the identical way — populated with a real signing identity whenever the identityProvider can sign (the common, crypto-capable path).');

        console.log('✓ Section K: a direct correction, verified fresh rather than inherited. 0.9.330 Section C3 concluded contentReference/publisherIdentity are "completely unused at the production-path level," checked via a regex requiring a literal colon. publisher/LocalPublisherProvider.js in fact populates BOTH fields on every real publish() call, using ES6 object-shorthand syntax (`contentReference,` / `publisherIdentity,`) that the prior regex was structurally unable to detect in either direction. This strengthens, rather than weakens, Section E/I\'s own finding: a locally-published Publication already carries the identical contentReference identity a decentralized-origin one carries — Repository would gain no new field shape by accepting either.');
    }

    // ===============================================================
    // Section L — No UI change; no production file touched.
    // ===============================================================
    {
        // L1. Repository's own UI carries no filter-tab, source-badge,
        // or ranking vocabulary — reconfirmed fresh, per this
        // milestone's own explicit "no UI yet" scope.
        for (const file of ['ui/components/PublicationCatalog.js', 'ui/components/PublicationCatalogToolbar.js', 'ui/views/RepositoryView.js']) {
            if (!(await sourceExists(file))) continue;
            const src = await readSource(file);
            assert(!/SourceFilter|ProvenanceBadge|\[All\]\s*\[Local\]\s*\[Peers\]|federat/i.test(src),
                `1. ${file} carries no source-filter, provenance-badge, ranking, or "federat*" vocabulary — nothing has been silently pre-built ahead of this audit's own verdict.`);
        }

        // L2. Publication's own identity is untouched — no new field,
        // no renamed getter.
        const publicationSource = await readSource('publisher/Publication.js');
        assert(publicationSource.includes('get id() { return this._id; }') &&
            publicationSource.includes('get documentId() { return this._documentId; }'),
            "2. publisher/Publication.js's own id/documentId getters are unchanged — this audit invents no new Repository identity.");

        // L3. LocalPublicationCatalog itself is untouched/unreplaced.
        assert(await sourceExists('application/LocalPublicationCatalog.js'),
            '3. application/LocalPublicationCatalog.js still exists, unreplaced.');

        // L4. The production-change guard: no file outside tests/,
        // tests.html, and docs/Roadmap.md is modified by this milestone.
        const changedNonTestFiles = execSync('git diff --name-only HEAD -- . ":(exclude)tests" ":(exclude)docs/Roadmap.md" ":(exclude)tests.html"',
            { cwd: SOURCE_ROOT.pathname }).toString().trim();
        assert(changedNonTestFiles === '', `4. no production file is modified by this milestone (found: ${changedNonTestFiles || 'none'}).`);
    }
    console.log('✓ Section L: no UI change (Repository\'s own UI files still carry no filter-tab, provenance-badge, ranking, or "federat*" vocabulary), Publication\'s own identity is untouched, LocalPublicationCatalog is neither replaced nor modified, and the git-diff guard confirms no production file outside tests/, tests.html, and docs/Roadmap.md was touched by this milestone.');

    // ===============================================================
    // Section M — Final classification.
    // ===============================================================
    {
        const CLASSIFICATIONS = [
            'CLEAN_EXISTING_SEAM',
            'DISCOVERY_GAP',
            'CONTRACT_GAP'
        ];
        const verdict = 'DISCOVERY_GAP';
        assert(CLASSIFICATIONS.includes(verdict), '1. the verdict is drawn from this milestone\'s own named taxonomy.');
        assert(liveResolvedPublication instanceof Publication,
            '2. Section E\'s own live proof — the central fact this verdict rests on — is carried forward, not re-litigated.');
    }
    console.log('\n✓ Section M: FINAL DECISION.\n' +
'\n' +
'OUTCOME: DISCOVERY_GAP.\n' +
'\n' +
"WHY. Section A corrected the originating brief's own diagram against source: application/LocalPublicationCatalog.js\n" +
'indexes core/DecentralizedPublication.js envelopes for the Publications Center and is never referenced anywhere in\n' +
"Repository's own SearchPublicationsUseCase.js or its composition root. Section B traced Repository's REAL contract:\n" +
'discoveryProvider.list() -> Publication[], through discovery/DiscoveryProvider.js, an ALREADY substrate-neutral\n' +
'abstraction by its own header, with exactly one working implementation (LocalDiscoveryProvider) wired in production.\n' +
'Section C ruled out a decoy: discovery/PublicationCatalogDiscoveryProvider.js touches the DecentralizedPublication\n' +
'world but implements only findById() (returning the WRONG type) and is wired to Snapshot placement creation, never\n' +
"Repository. Section D answered Question A directly: Repository's contract is Publication -> searchable result, never\n" +
"a catalog-specific projection - no wrapper type exists anywhere. Section E answered Question B empirically: a\n" +
'Publication resolved through the existing, completely unmodified PublicationResolver/PublicationContentKind pipeline\n' +
"IS a genuine Publication instance, and Repository's own real, unmodified SearchPublicationsUseCase finds it by text\n" +
'and author search the moment any DiscoveryProvider lists it - proven live, not by type-reading. Section F named the\n' +
'other half of the gap: nothing in production yet accumulates a resolved decentralized Publication anywhere list()\n' +
'could read it from - PublicationContentKind deliberately ships with no store option, and no second Repository-owned\n' +
'store has been introduced. Section G reconfirmed Peer discovers endpoints and relays already-known envelopes among\n' +
'already-connected peers - never a stranger-catalog browse mechanism. Section H reconfirmed no existing decentralized\n' +
'discovery service - Nostr or otherwise - currently produces a forkbuild.publication candidate; the Nostr pipeline\n' +
'built for Publications answers a different question (material LOCATION for an already-known publication). Section I\n' +
'proved, live, that Publication.id/documentId/contentReference, the envelope\'s own id, a Nostr event id, and a peer\n' +
'connectionId are five genuinely independent identity spaces - Repository would invent no new identity by accepting a\n' +
'decentralized-origin Publication. Section J characterized (never built) a dedup policy from LocalPublicationCatalog\'s\n' +
'own existing, non-content-hash dedup key. Section K corrected one 0.9.330 claim directly against source:\n' +
'contentReference/publisherIdentity are not dormant in production - LocalPublisherProvider populates both today,\n' +
'via ES6 shorthand syntax the prior regex-based check could not have detected either way. Section L confirmed no UI\n' +
'change and no production file touched.\n' +
'\n' +
'WHAT THIS MEANS. The CONTRACT is not the gap (ruling out CONTRACT_GAP): Repository already accepts a plain\n' +
"Publication instance from any DiscoveryProvider, and a resolved decentralized Publication already IS one, with no\n" +
'new field, wrapper, or identity required. But this is not yet a CLEAN_EXISTING_SEAM ready for a small adapter alone,\n' +
'because two things production code does not yet supply would both be needed before any DiscoveryProvider could\n' +
'meaningfully list() a decentralized-origin Publication: (1) a mechanism that produces a forkbuild.publication\n' +
'candidate a replica does not already possess - which neither Peer (endpoint discovery + already-known-envelope\n' +
'relay among already-connected peers) nor any existing decentralized discovery service (wired to a different\n' +
'envelope, for a different purpose) currently does - and (2) somewhere to hold a resolved candidate once one exists,\n' +
"since resolution itself is deliberately ephemeral and 0.9.330's own Section G already rejected inventing a new\n" +
'Repository-owned store for it. Per this milestone\'s own outcome taxonomy, the next milestone should build the\n' +
'smallest decentralized Publication discovery SOURCE - a mechanism that lets a replica learn about a\n' +
'forkbuild.publication envelope it does not already hold - not a federated search implementation, not a new\n' +
'Repository model, and not a change to SearchPublicationsUseCase, which this audit\'s own Section E already proved\n' +
'needs none.\n');

    console.log('\n✅ All Federated Repository Discovery Seam Audit tests passed.');
}

run().then(() => {
    console.log('\n✓ All FederatedRepositoryDiscoverySeamAudit tests passed');
}).catch((error) => {
    console.error('\n✗ FederatedRepositoryDiscoverySeamAudit tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
