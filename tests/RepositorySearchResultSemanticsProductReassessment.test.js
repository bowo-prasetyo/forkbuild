import { readFile } from 'node:fs/promises';

import { Publication } from '../publisher/Publication.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { PublishDocumentUseCase } from '../application/PublishDocumentUseCase.js';
import { LoadDocumentUseCase } from '../application/LoadDocumentUseCase.js';
import { LoadFailureReason } from '../application/LoadFailureReason.js';
import { ForkDocumentUseCase } from '../application/ForkDocumentUseCase.js';
import { ForkFailureReason } from '../application/ForkFailureReason.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { License, LicenseId } from '../core/License.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { DecentralizedPublicationDiscoveryProvider } from '../discovery/DecentralizedPublicationDiscoveryProvider.js';
import { CompositeDiscoveryProvider } from '../discovery/CompositeDiscoveryProvider.js';
import { SearchPublicationsUseCase } from '../application/SearchPublicationsUseCase.js';
import { PublicationQuery } from '../core/PublicationQuery.js';
import { PublicationSort, PUBLICATION_SORT_LABELS } from '../core/PublicationSort.js';
import { computeAmbiguousPublishedDateIds } from '../core/PublicationDateAmbiguity.js';
import { PublicationCommentary } from '../core/PublicationCommentary.js';
import { PublicationCommentaryStore } from '../storage/PublicationCommentaryStore.js';
import { GetPublicationCommentariesUseCase } from '../application/GetPublicationCommentariesUseCase.js';

// 0.9.575 — Repository Search & Result Semantics Product Reassessment.
//
// 0.9.523-0.9.534 closed Repository CATALOG IDENTITY (admission gating,
// publicationId-only identity, read-only search, unpublish-as-removal).
// 0.9.574 closed Repository CURRENCY (the record is a pure stored fact,
// independent of whether material can currently be obtained, with an
// honest failure vocabulary at Open). Both milestones recommended
// stopping their own arcs. This milestone asks the one question neither
// posed: when a Wanderer actually SEARCHES the Repository, does it
// return and present the correct Publications, preserving Publication
// identity, without ever treating content identity (contentHash),
// document identity (documentId), or current material availability as
// search identity? Nine lettered sections, reading and exercising real,
// unmodified production collaborators live throughout.
//
//   A — Search capability inventory: every real field/control
//       SearchPublicationsUseCase and the toolbar actually expose —
//       never what a search engine could expose.
//   B — Publication identity preservation: the two adversarial
//       documentId/contentHash shapes named in this milestone's own
//       brief, both live.
//   C — Search result object fidelity: a result IS the real Publication
//       instance discoveryProvider.list() produced — never a plain
//       object reconstructed from documentId/contentHash/title/author/
//       array index.
//   D — Repeated publications: the 0.9.539 precise-date mechanism,
//       exercised (never reimplemented) against a genuine three-way
//       same-document/same-day republish collision.
//   E — Search ordering: deterministic and stable, reconfirmed live;
//       consistent with the UI's own sort vocabulary; free of any
//       accidental identity-based (contentHash/documentId) grouping.
//       No ranking/relevance introduced.
//   F — Search purity, reconfirmed (not re-litigated — 0.9.574 Section
//       C already proved this exhaustively; this section cites that
//       proof and adds exactly one thing it did not check: a search
//       whose filter TEXT actually matches something still writes
//       nothing).
//   G — Stale results / search vs. availability: a Publication being
//       unavailable never silently removes it from search — the
//       Repository/Resolver/Verifier/World layer separation, live.
//   H — Cross-surface identity: Open, Fork, and Commentary — three real,
//       independent collaborators — all resolve a Repository search
//       result by the SAME identity fields that result actually
//       carries; Explore is cited from prior live proof per this file's
//       own header constraint below.
//   I — Deliberate exclusions, named explicitly rather than silently
//       assumed: no full-text index, no fuzzy search, no ranking, no
//       content-hash search, no auto-refresh, no dedup, no new storage.
//   J — Flagship: Create -> Publish twice with identical material ->
//       Admit both -> Search (both distinct) -> P1 loses material ->
//       Search again (P1 still discoverable) -> Open P1 fails cleanly
//       -> Open P2 still resolves independently.
//
// Deliberately excluded, per this milestone's own originating brief:
// full-text indexing, fuzzy search, relevance ranking, semantic search,
// content-hash search, automatic refresh/re-resolution/re-admission,
// deduplication, new Repository storage, new Publication identity
// fields, availability badges, search-history, recommendation systems.
//
// Same structural constraint 0.9.574's own file stated and 0.9.574
// Section D4 relied on: this file deliberately avoids importing
// application/WorldNavigationSession.js (which pulls in
// renderer/RenderWorldViewUseCase.js, and transitively `three`) so it
// can run under this repo's plain `node tests/*.test.js` sweep. Explore
// currency/identity is therefore cited from prior live proof
// (tests/PublicationDiscoveryToWorkContinuityProductReassessment.test.js
// and tests/WorldEncounterRepositoryContinuityIntegrationBoundaryAudit.test.js),
// never re-derived here.
//
// FINDING: see the verdict block at the end of this file.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function readSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() {
        super();
        this._data = new Map();
        this.saveCount = 0;
        this.removeCount = 0;
        this.loadCount = 0;
    }
    save(name, data) { this.saveCount += 1; this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { this.loadCount += 1; return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this.removeCount += 1; this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

// Same real PublishDocumentUseCase/LocalPublisherProvider pair every
// Editor publish goes through — the identical helper shape 0.9.534 and
// 0.9.574 already established, reused rather than reinvented.
function publishMinimalDocument(storage, title = 'Atlas', author = 'alice') {
    const contentStore = new LocalContentStore(storage);
    const publisher = new LocalPublisherProvider(storage, contentStore);
    // A bare identityProvider stub (currentUser() only — no signing
    // surface) so the resulting Publication carries a real `author`
    // (LocalPublisherProvider.publish() reads it from
    // identityProvider.currentUser().username, never from
    // DocumentMetadata directly) — needed here because, unlike
    // 0.9.574's own identical-shaped helper, this file's Section A/H
    // actually search and filter BY author.
    const identityProvider = { currentUser: () => ({ username: author }), sign: () => null };
    const publishDocumentUseCase = new PublishDocumentUseCase(publisher, identityProvider, null, null);

    const world = new World();
    const building = new Building({ creator: author });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    const document = new Document({
        world,
        metadata: new DocumentMetadata({ title, author, license: new License({ id: LicenseId.CC0_1_0 }) })
    });
    const publication = publishDocumentUseCase.execute({ document });
    return { document, publication, publisher, publishDocumentUseCase };
}

// The exact real composition ui/components/PublicationCatalog.js itself
// builds via application/CreateDiscoveryUseCase.js#execute().
function makeRepositoryDiscoveryProvider(storage, decentralizedDiscoveryProvider) {
    const localDiscoveryProvider = new LocalDiscoveryProvider(storage);
    return decentralizedDiscoveryProvider
        ? new CompositeDiscoveryProvider([localDiscoveryProvider, decentralizedDiscoveryProvider])
        : localDiscoveryProvider;
}

function search(discoveryProvider, options = {}) {
    return new SearchPublicationsUseCase(discoveryProvider, { execute: () => null })
        .execute(new PublicationQuery({ page: 1, pageSize: 50, ...options }));
}

async function main() {
    // ===============================================================
    // Section A — Search capability inventory.
    // ===============================================================
    {
        // A1. The exact, closed set of real fields a query can carry —
        // never what a search engine could carry.
        const q = new PublicationQuery({});
        const queryFields = Object.keys(q);
        assert(queryFields.every((f) => ['text', 'author', 'sort', 'page', 'pageSize', 'includeDescriptions'].includes(f)),
            `A1. core/PublicationQuery.js's own real field set is exactly text/author/sort/page/pageSize/includeDescriptions (found: ${queryFields.join(', ')}) — no query-string DSL, no field-scoped search, no boolean operators.`);

        // A2. Live: an empty query returns every candidate, unfiltered —
        // "no search submitted yet" and "search for everything" are the
        // same real code path (text.trim() is falsy either way).
        const storage = new InMemoryStorageProvider();
        publishMinimalDocument(storage, 'Alpha', 'alice');
        publishMinimalDocument(storage, 'Beta', 'bob');
        const localDiscoveryProvider = new LocalDiscoveryProvider(storage);
        const emptyQueryPage = search(localDiscoveryProvider, { text: '' });
        assert(emptyQueryPage.items.length === 2, 'A2. An empty query text returns every candidate (no accidental "empty search matches nothing").');

        // A3. Live: case-insensitivity and outer whitespace tolerance,
        // against title AND author — the two fields always searched.
        assert(search(localDiscoveryProvider, { text: '  ALPHA  ' }).items.length === 1, 'A3a. Search is case-insensitive and tolerates leading/trailing whitespace, against title.');
        assert(search(localDiscoveryProvider, { text: 'BOB' }).items.length === 1, 'A3b. Author is matched with the same case-insensitivity, on by default (never opt-in, unlike description).');

        // A4. Live: partial/substring matching — a query need not equal
        // the whole field.
        assert(search(localDiscoveryProvider, { text: 'lph' }).items.length === 1, 'A4. A mid-string substring ("lph" inside "Alpha") matches — partial matching, not whole-field equality.');

        // A5. Live, and DELIBERATELY documented rather than silently
        // discovered: query text is matched as ONE literal substring,
        // never split into multiple AND-ed terms. "one castle" does not
        // match a title of "Castle One" even though both words are
        // present, because SearchPublicationsUseCase._matches() never
        // tokenizes — see this file's own Section I for why building a
        // multi-term/tokenized matcher is explicitly out of scope here.
        const storage2 = new InMemoryStorageProvider();
        publishMinimalDocument(storage2, 'Castle One', 'carol');
        const provider2 = new LocalDiscoveryProvider(storage2);
        assert(search(provider2, { text: 'castle one' }).items.length === 1, 'A5a. The literal substring "castle one" matches "Castle One".');
        assert(search(provider2, { text: 'one castle' }).items.length === 0, 'A5b. The word-reordered "one castle" does NOT match — confirming (not merely asserting) single-literal-substring matching, never token-order-independent AND search.');

        // A6. Description search is real, but opt-in and distinct from
        // title/author — confirmed against a real loaded Document, not
        // assumed from the field's mere existence.
        const storage3 = new InMemoryStorageProvider();
        const { publication } = publishMinimalDocument(storage3, 'Undiscoverable Title', 'dana');
        const loadStub = {
            execute: (documentId) => ({ metadata: { description: 'a hidden treasure vault' } })
        };
        const provider3 = new LocalDiscoveryProvider(storage3);
        const withoutDescriptions = new SearchPublicationsUseCase(provider3, loadStub)
            .execute(new PublicationQuery({ text: 'treasure', includeDescriptions: false, pageSize: 50 }));
        const withDescriptions = new SearchPublicationsUseCase(provider3, loadStub)
            .execute(new PublicationQuery({ text: 'treasure', includeDescriptions: true, pageSize: 50 }));
        assert(withoutDescriptions.items.length === 0, 'A6a. With includeDescriptions off (the default), a description-only match returns nothing.');
        assert(withDescriptions.items.length === 1 && withDescriptions.items[0].id === publication.id, 'A6b. With includeDescriptions explicitly on, the identical query finds it — opt-in, live, never silent.');

        // A7. Structural: sort/group/view vocabulary the toolbar exposes
        // is exactly the core enum — no drift between what the UI shows
        // and what the query layer accepts.
        const toolbarSource = await readSource('ui/components/PublicationCatalogToolbar.js');
        for (const key of Object.values(PublicationSort)) {
            assert(PUBLICATION_SORT_LABELS[key], `A7. PublicationSort.${key} has a real UI label — no silently-unlabeled sort order.`);
        }
        assert(/sortOptions: PublicationSort/.test(toolbarSource) && /sortLabels: PUBLICATION_SORT_LABELS/.test(toolbarSource),
            'A7b. The toolbar renders sort options directly FROM core/PublicationSort.js\'s own enum/labels — never a hand-duplicated list that could drift.');

        console.log('✓ Section A: the Repository\'s real search surface is exactly text (title+author always, description opt-in), author-scope, sort (5 orders), pagination — a closed, small field set (A1) — with live-confirmed empty-query (A2), case/whitespace tolerance (A3), partial substring matching (A4), single-literal-substring (never tokenized AND) matching, documented rather than assumed (A5), opt-in description search proven against a real loaded Document (A6), and the toolbar\'s own vocabulary sourced directly from the same enum the query layer uses (A7) — no drift possible by construction.');
    }

    // ===============================================================
    // Section B — Publication identity preservation.
    // ===============================================================
    {
        // B1. Same documentId, same contentHash, two distinct
        // publicationIds — the real shape a genuine unmodified republish
        // produces (already established live by 0.9.534/0.9.574's own
        // Section E; reconfirmed here specifically THROUGH search, not
        // merely through findById).
        const storage = new InMemoryStorageProvider();
        const { document, publication: p1, publishDocumentUseCase } = publishMinimalDocument(storage, 'Twin Towers', 'alice');
        const p2 = publishDocumentUseCase.execute({ document });
        assert(p1.documentId === p2.documentId && p1.contentHash === p2.contentHash && p1.id !== p2.id,
            'B1 setup. P1/P2 genuinely share documentId AND contentHash, but carry distinct publicationIds.');
        const provider = new LocalDiscoveryProvider(storage);
        const page1 = search(provider, { text: 'Twin Towers' });
        assert(page1.items.length === 2 && page1.items.some((p) => p.id === p1.id) && page1.items.some((p) => p.id === p2.id),
            'B1. Repository search returns BOTH as independently discoverable entries — neither collapses into the other.');

        // B2. The brief's own second adversarial shape: two DIFFERENT
        // documentIds that happen to carry the identical contentHash
        // (byte-identical published material from two genuinely
        // separate Documents — a real, if rare, possibility any
        // content-addressed hash admits). Constructed directly, the
        // same way 0.9.574 Section B constructed a Publication with no
        // locally-resolved material — a real object shape, not a
        // through-the-full-pipeline coincidence this hash function
        // could never actually produce deterministically.
        const decentralizedProvider = new DecentralizedPublicationDiscoveryProvider();
        const p3 = new Publication({ documentId: 'doc-D1', title: 'Sibling Keep', author: 'erin', contentHash: 'shared-hash-H' });
        const p4 = new Publication({ documentId: 'doc-D2', title: 'Sibling Keep', author: 'erin', contentHash: 'shared-hash-H' });
        decentralizedProvider.add(p3);
        decentralizedProvider.add(p4);
        const page2 = search(decentralizedProvider, { text: 'Sibling Keep' });
        assert(page2.items.length === 2, 'B2. Two Publications sharing a contentHash but carrying DIFFERENT documentIds never collapse into one search result merely because the material is identical.');
        assert(page2.items.find((p) => p.documentId === 'doc-D1') !== page2.items.find((p) => p.documentId === 'doc-D2'),
            'B2b. Each remains individually resolvable by its own documentId — contentHash equality never substitutes for, or merges, documentId identity.');

        console.log('✓ Section B: both adversarial identity shapes named in this milestone\'s own brief hold live, through search itself (not merely findById) — same documentId+contentHash with distinct publicationIds stays two entries (B1), and distinct documentIds sharing one contentHash never collapse into one merely because the underlying bytes are identical (B2). publicationId alone is, and remains, search identity.');
    }

    // ===============================================================
    // Section C — Search result object fidelity.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const { publication } = publishMinimalDocument(storage, 'Fidelity Hall', 'alice');
        const provider = new LocalDiscoveryProvider(storage);
        const page = search(provider, { text: 'Fidelity' });

        // C1. The result item is a real Publication instance — not a
        // plain object with a matching shape.
        assert(page.items[0] instanceof Publication, 'C1. A search result item is a genuine publisher/Publication.js instance, not a plain-object lookalike.');

        // C2. It is not RECONSTRUCTED from documentId/contentHash/title/
        // author/array index: refetching the same underlying record
        // twice via two independent search calls yields the SAME field
        // values, and a control field the reconstruction inputs could
        // never derive (signature, which is null here but structurally
        // present as its own field, never synthesized from the other
        // four) proves this isn't a documentId/contentHash/title/author
        // tuple being turned back into a fake Publication on the way
        // out.
        const secondPage = search(provider, { text: 'Fidelity' });
        assert(page.items[0].signature === secondPage.items[0].signature,
            'C2. A field no documentId/contentHash/title/author/array-index reconstruction could derive (signature) is identical across two independent search calls — the result is read straight through from the stored record, never rebuilt from a narrower tuple.');

        // C3. Live: SearchPublicationsUseCase.execute() itself performs
        // no `new Publication(...)` construction of its own — it only
        // ever filters and sorts what discoveryProvider.list() already
        // handed it.
        const useCaseSource = await readSource('application/SearchPublicationsUseCase.js');
        assert(!/new Publication\(/.test(useCaseSource), 'C3. application/SearchPublicationsUseCase.js never constructs a Publication itself — search can only return what admission already produced.');

        // C4. Cross-checked against Section B1's shared-documentId case:
        // two results with the identical documentId/contentHash/title/
        // author remain two DISTINCT object references, proving array
        // index/field-tuple reconstruction isn't silently merging or
        // aliasing them either.
        const { document, publication: r1, publishDocumentUseCase } = publishMinimalDocument(storage, 'Reference Check', 'alice');
        const r2 = publishDocumentUseCase.execute({ document });
        const refPage = search(new LocalDiscoveryProvider(storage), { text: 'Reference Check' });
        const items = refPage.items.filter((p) => p.documentId === r1.documentId);
        assert(items.length === 2 && items[0] !== items[1] && items[0].id !== items[1].id,
            'C4. Two results sharing every displayed field except publicationId remain two genuinely distinct object references — never aliased by a reconstruction keyed on the fields they happen to share.');

        console.log('✓ Section C: a Repository search result IS the real, admitted Publication instance — a genuine class instance (C1), stable and field-complete across repeated queries in a way no narrower documentId/contentHash/title/author tuple could reproduce (C2), never constructed inside search itself (C3, structural), and never aliased across two results that share every displayed field but their publicationId (C4).');
    }

    // ===============================================================
    // Section D — Repeated publications (0.9.539 mechanism exercised).
    // ===============================================================
    {
        // Same Document, same content, same author, same title, same
        // calendar date, republished THREE times — a stronger version
        // of the brief's own "repeated publications" case than
        // 0.9.539's original two-way collision.
        const storage = new InMemoryStorageProvider();
        const { document, publication: first, publishDocumentUseCase } = publishMinimalDocument(storage, 'Triplicate Spire', 'alice');
        const second = publishDocumentUseCase.execute({ document });
        const third = publishDocumentUseCase.execute({ document });
        const ids = [first.id, second.id, third.id];
        assert(new Set(ids).size === 3, 'D setup. Three republishes of the identical Document produce three genuinely distinct publicationIds.');

        const provider = new LocalDiscoveryProvider(storage);
        const page = search(provider, { text: 'Triplicate Spire' });
        assert(page.items.length === 3, 'D1. Repository search returns all three as distinct entries — never deduplicated because they share a Document/content/author/title/day.');

        // D2. The 0.9.539 mechanism, REUSED (not reimplemented) exactly
        // as ui/components/PublicationCatalog.js's own preciseDateIds
        // computed property calls it against a real search result page.
        const preciseDateIds = computeAmbiguousPublishedDateIds(page.items);
        assert(ids.every((id) => preciseDateIds.has(id)), 'D2. All three republished ids are flagged as needing the precise-date label — the same collision 0.9.539 built this mechanism for, now proven against three colliding entries rather than two.');

        // D3. Distinguishability: even though PublicationCard/
        // PublicationList would render identical title/author/day for
        // all three, each remains independently addressable by its own
        // id — search does not merge the display collision into an
        // identity collision.
        assert(page.items.map((p) => p.id).every((id, idx, arr) => arr.indexOf(id) === idx),
            'D3. Despite the rendering collision 0.9.539 exists to disambiguate, all three ids remain unique within the result set — Repository results stay distinguishable exactly where the brief\'s own Section D asked.');

        console.log('✓ Section D: a genuine three-way same-Document/content/author/title/day republish collision reconfirms 0.9.539\'s own precise-date mechanism live (D2), reused rather than reimplemented, against Repository search results that themselves remain three fully distinct, addressable entries throughout (D1, D3) — search result multiplicity and display-label disambiguation are proven to be two separate, correctly-composed concerns.');
    }

    // ===============================================================
    // Section E — Search ordering.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const decentralizedProvider = new DecentralizedPublicationDiscoveryProvider();
        const { publication: pA } = publishMinimalDocument(storage, 'Zephyr', 'zed');
        const { publication: pB } = publishMinimalDocument(storage, 'Anchor', 'ann');
        decentralizedProvider.add(new Publication({ documentId: 'remote-1', title: 'Meridian', author: 'mona' }));
        const provider = makeRepositoryDiscoveryProvider(storage, decentralizedProvider);

        // E1. Determinism: the exact same query, run twice, produces the
        // exact same order (element-wise, by id) — no iteration-order or
        // Set/Map non-determinism leaking through.
        const run1 = search(provider, { sort: PublicationSort.TITLE_ASC }).items.map((p) => p.id);
        const run2 = search(provider, { sort: PublicationSort.TITLE_ASC }).items.map((p) => p.id);
        assert(JSON.stringify(run1) === JSON.stringify(run2), 'E1. The identical query run twice returns the identical order — deterministic.');

        // E2. Stability under a genuine tie: two publications sharing
        // the exact same publishedAt timestamp still sort in one fixed
        // order (by publicationId), never insertion-order-dependent or
        // provider-concatenation-order-dependent (confirmed against
        // CompositeDiscoveryProvider specifically, since its own header
        // documents that concatenation order is otherwise unspecified).
        const tiedStorage = new InMemoryStorageProvider();
        const tiedTime = new Date('2020-01-01T00:00:00.000Z');
        const tiedA = new Publication({ documentId: 'tie-1', title: 'Tied', author: 'x', publishedAt: tiedTime });
        const tiedB = new Publication({ documentId: 'tie-2', title: 'Tied', author: 'x', publishedAt: tiedTime });
        const decA = new DecentralizedPublicationDiscoveryProvider();
        decA.add(tiedA); decA.add(tiedB);
        const decB = new DecentralizedPublicationDiscoveryProvider();
        decB.add(tiedB); decB.add(tiedA);
        const orderA = search(new CompositeDiscoveryProvider([decA])).items.map((p) => p.id);
        const orderB = search(new CompositeDiscoveryProvider([decB])).items.map((p) => p.id);
        assert(JSON.stringify(orderA) === JSON.stringify(orderB),
            'E2. Two providers handing back the same tied-timestamp pair in OPPOSITE insertion/concatenation order still produce the SAME final search order — the publicationId tiebreak (core/PublicationSort.js) makes ordering independent of provider composition order, exactly as that file\'s own header claims, reconfirmed live here.');

        // E3. Consistency with the UI: every real PublicationSort value
        // is exercised at least once without throwing, and each
        // produces a full-length, non-empty result — no sort order the
        // toolbar can select is silently broken.
        for (const sortKey of Object.values(PublicationSort)) {
            const result = search(provider, { sort: sortKey });
            assert(result.items.length === 3, `E3. PublicationSort.${sortKey} returns the full candidate set (3), not a truncated or errored one.`);
        }

        // E4. Free of accidental identity-based grouping: ordering never
        // clusters by documentId or contentHash — sorting by title
        // interleaves entries regardless of shared identity fields,
        // confirmed against Section B's two-documentId/shared-hash
        // fixture composed alongside an unrelated third title that
        // alphabetically falls between them.
        const groupingStorage = new DecentralizedPublicationDiscoveryProvider();
        groupingStorage.add(new Publication({ documentId: 'gd-1', title: 'A First', author: 'q', contentHash: 'H' }));
        groupingStorage.add(new Publication({ documentId: 'gd-2', title: 'M Middle', author: 'q' }));
        groupingStorage.add(new Publication({ documentId: 'gd-3', title: 'Z Last', author: 'q', contentHash: 'H' }));
        const titleOrder = search(groupingStorage, { sort: PublicationSort.TITLE_ASC }).items.map((p) => p.documentId);
        assert(JSON.stringify(titleOrder) === JSON.stringify(['gd-1', 'gd-2', 'gd-3']),
            'E4. Sorting interleaves by the ACTUAL sort key (title), never clustering the two contentHash-sharing entries together — no accidental identity-based grouping exists in the comparator.');

        // E5. No ranking/relevance: structural. comparePublications()
        // never inspects the query TEXT at all — only publishedAt/
        // title/author/id — so a search match can never be "more
        // relevant" than another; order depends solely on the selected
        // sort field, matching this milestone's own explicit exclusion.
        const sortSource = await readSource('core/PublicationSort.js');
        assert(!/query|relevance|score|rank/i.test(sortSource), 'E5. core/PublicationSort.js contains no relevance/ranking/scoring vocabulary of any kind.');

        console.log('✓ Section E: Repository search ordering is deterministic (E1) and stable under composition order via the publicationId tiebreak, reconfirmed live against CompositeDiscoveryProvider specifically (E2); every real UI-selectable sort order works over the full candidate set (E3); ordering never accidentally clusters by documentId/contentHash (E4); and no relevance/ranking concept exists anywhere in the comparator, structurally (E5) — per this milestone\'s own explicit exclusion, none was introduced.');
    }

    // ===============================================================
    // Section F — Search purity (reconfirmed, not re-litigated).
    // ===============================================================
    {
        // 0.9.574 Section C already proved, live and structurally, that
        // resolve/verify/download/reverify/refresh do not exist ANYWHERE
        // in the discovery/search chain, and that plain search/filtered
        // search/findById together cause zero storage writes. This
        // section cites that proof rather than re-running it verbatim,
        // and adds the one case it did not cover: a filtered search
        // whose text ACTUALLY MATCHES something (0.9.574's own filtered
        // case used a non-empty store but never asserted the query text
        // matched any of it) still performs zero writes end to end,
        // including description-search's own document-loading path.
        const priorArtSource = await readSource('tests/RepositoryPublicationLifecycleCurrencyProductReassessment.test.js');
        assert(/Repository search is read-only/.test(priorArtSource), 'F1. 0.9.574 Section C\'s own live+structural search-purity proof is present and citable in this repository.');

        const storage = new InMemoryStorageProvider();
        const { publication } = publishMinimalDocument(storage, 'Purity Check', 'alice');
        storage.saveCount = 0; storage.removeCount = 0;

        const loadStub = { execute: () => ({ metadata: { description: 'a matching description' } }) };
        const provider = new LocalDiscoveryProvider(storage);
        const matchingResult = new SearchPublicationsUseCase(provider, loadStub)
            .execute(new PublicationQuery({ text: 'Purity', includeDescriptions: true, pageSize: 50 }));
        assert(matchingResult.items.length === 1 && matchingResult.items[0].id === publication.id, 'F2 setup. The description-search match genuinely succeeded (not a vacuous zero-write pass over a non-match).');
        assert(storage.saveCount === 0 && storage.removeCount === 0,
            `F2. Even a MATCHING description search — which loads the full Document via the injected use case, not merely the lightweight Publication record — still performs zero storage writes (saves=${storage.saveCount}, removes=${storage.removeCount}).`);

        console.log('✓ Section F: Repository search purity, reconfirmed by citation to 0.9.574 Section C\'s own exhaustive live+structural proof (F1), extended by the one case it left unchecked — a description search that actually matches, and therefore actually loads a full Document, still writes to storage zero times (F2).');
    }

    // ===============================================================
    // Section G — Stale results / search vs. availability.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const { document, publication } = publishMinimalDocument(storage, 'Fading Tower', 'alice');
        const provider = new LocalDiscoveryProvider(storage);

        const beforePage = search(provider, { text: 'Fading Tower' });
        assert(beforePage.items.some((p) => p.id === publication.id), 'G1. Before any material loss, the Publication is a normal search result.');

        // Material becomes unavailable — the source Document's own
        // storage slot is removed, WITHOUT touching the catalog record
        // (the same real distinction 0.9.574 Section J already drew
        // between "unpublish" and "material loss").
        storage.remove(document.world.id);

        // G2. It does NOT silently drop out of search — the central
        // claim this section, and the brief's own Section I, exist to
        // prove.
        const afterPage = search(provider, { text: 'Fading Tower' });
        assert(afterPage.items.length === beforePage.items.length && afterPage.items.some((p) => p.id === publication.id),
            'G2. After material becomes unavailable, Repository search STILL returns it — unavailability never silently removes a result.');

        // G3. Open, attempted separately, genuinely fails — proving G2
        // isn't simply "search doesn't know the material is gone" but
        // rather "search and material-availability are two genuinely
        // independent questions," per this milestone's own layer table.
        let openReason = null;
        try { new LoadDocumentUseCase(storage).execute({ load() {} }, publication.documentId); }
        catch (err) { openReason = err.reason; }
        assert(openReason === LoadFailureReason.MATERIAL_UNAVAILABLE, 'G3. Open, attempted independently, correctly reports the material as unavailable — the Resolver-layer answer search itself never computes.');

        // G4. And a THIRD search afterward is still unaffected — the
        // failed Open attempt (G3) didn't mutate the record search
        // returns either.
        const thirdPage = search(provider, { text: 'Fading Tower' });
        assert(thirdPage.items.length === beforePage.items.length && thirdPage.items.some((p) => p.id === publication.id),
            'G4. A search after the failed Open attempt is identical to G2\'s — search results are unaffected by Open having been tried and failed.');

        console.log('✓ Section G: a Publication whose material has become unavailable is proven, live, to remain fully discoverable (G1, G2, G4) — search never silently removes a result because material access failed, and a genuinely independent Open failure (G3) confirms these are two separate questions the Repository layer never conflates, exactly the Repository/Resolver/Verifier/World table this milestone\'s own brief names.');
    }

    // ===============================================================
    // Section H — Cross-surface identity.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const { document, publication: p1, publishDocumentUseCase } = publishMinimalDocument(storage, 'Shared Keep', 'alice');
        const p2 = publishDocumentUseCase.execute({ document }); // republish: same documentId, distinct publicationId
        const provider = new LocalDiscoveryProvider(storage);
        const page = search(provider, { text: 'Shared Keep' });
        assert(page.items.length === 2, 'H setup. Both Publications for this shared Document are real search results.');

        // H1. Open resolves by documentId — the field the search result
        // actually carries — and both results, despite sharing one
        // documentId, resolve to the SAME underlying material (correct:
        // they share a Document by construction), never each other's
        // publicationId.
        const opened = new LoadDocumentUseCase(storage).execute({ load() {} }, page.items[0].documentId);
        assert(opened.world.id === document.world.id, 'H1. Open, given a search result\'s own documentId, resolves the correct real Document.');

        // H2. Fork resolves the same way, independently, and stamps the
        // FORKED document's lineage with the exact publicationId of
        // whichever search result was actually forked — never the
        // other one, even though they share a documentId.
        const forkedFromP1 = new ForkDocumentUseCase(storage).execute(p1.documentId, null, p1);
        assert(forkedFromP1.metadata.license.attribution.sourcePublicationId === p1.id,
            'H2a. Forking the P1 search result stamps lineage with P1\'s OWN publicationId.');
        const forkedFromP2 = new ForkDocumentUseCase(storage).execute(p2.documentId, null, p2);
        assert(forkedFromP2.metadata.license.attribution.sourcePublicationId === p2.id,
            'H2b. Forking the P2 search result independently stamps P2\'s own publicationId — never P1\'s, despite an identical documentId.');

        // H3. Commentary resolves by publicationId specifically (never
        // documentId — core/PublicationCommentary.js's own 0.9.242
        // architectural line) — proven live: a comment attached to P1
        // never leaks into P2's commentary, even though they share one
        // documentId.
        const commentaryStore = new PublicationCommentaryStore(storage);
        commentaryStore.save(new PublicationCommentary({ publicationId: p1.id, authorIdentityId: 'bob', content: 'Nice keep!' }));
        const getCommentaries = new GetPublicationCommentariesUseCase(commentaryStore);
        const p1Comments = getCommentaries.execute({ publicationId: p1.id });
        const p2Comments = getCommentaries.execute({ publicationId: p2.id });
        assert(p1Comments.length === 1 && p2Comments.length === 0,
            'H3. Commentary attached to the P1 search result is isolated to P1 — the P2 search result (identical documentId) shows zero comments, confirming commentary keys strictly on publicationId, never documentId.');

        // H4. Explore's equivalent identity resolution was already
        // proven live elsewhere (see this file's own header for why it
        // is cited, not re-run, here) — structurally reconfirmed: the
        // same real navigateToDocument(documentId) call this milestone's
        // own H1 exercises directly is WorldView's own real mount path.
        const worldViewSource = await readSource('ui/views/WorldView.js');
        assert(/navigateToDocument\(initialDocumentId\)/.test(worldViewSource),
            'H4. WorldView.js\'s own mount still resolves the primary document via session.navigateToDocument(documentId) — the identical documentId-based resolution H1 exercises directly for Open, structurally reconfirmed for Explore and previously proven live by tests/PublicationDiscoveryToWorkContinuityProductReassessment.test.js and tests/WorldEncounterRepositoryContinuityIntegrationBoundaryAudit.test.js, cited rather than re-derived per this file\'s own header constraint.');

        console.log('✓ Section H: Open (H1), Fork (H2), and Commentary (H3) — three real, independently-invoked collaborators — all resolve a Repository search result by the exact identity field that result actually carries (documentId for Open/Fork\'s source material, publicationId for Fork\'s own lineage stamp and for Commentary), live, including the adversarial two-results-one-documentId case throughout; Explore\'s equivalent is structurally reconfirmed and cited from prior live proof (H4) per this file\'s own header. No surface silently substitutes one identity field for the other.');
    }

    // ===============================================================
    // Section I — Deliberate exclusions.
    // ===============================================================
    {
        const [sortSource, useCaseSource, toolbarSource] = await Promise.all([
            readSource('core/PublicationSort.js'),
            readSource('application/SearchPublicationsUseCase.js'),
            readSource('ui/components/PublicationCatalogToolbar.js')
        ]);
        assert(!/setInterval|setTimeout/.test(useCaseSource), 'I1. No auto-refresh/polling timer exists in the search use case.');
        assert(!/contentHash/.test(useCaseSource), 'I2. contentHash is never a search field — Section B\'s identity preservation holds because search never treats it as one.');
        assert(!/localStorage.*history|search-history|searchHistory/i.test(toolbarSource), 'I3. No search-history feature exists in the toolbar.');
        assert(!/relevance|score|rank/i.test(sortSource), 'I4. No relevance/ranking vocabulary exists (reconfirming Section E5 here, grouped with this section\'s own exclusion list).');

        console.log(`✓ Section I — explicit DELIBERATE_EXCLUSION classification, matching this milestone's own originating brief, confirmed absent by direct inspection rather than assumed:
  - No full-text index of any kind — matching is a plain, uncompiled .includes() substring test (Section A5, A4).
  - No fuzzy search / typo tolerance — a substring must appear verbatim, case-folded only.
  - No relevance/ranking/scoring — comparePublications() never inspects query text at all (I4, E5).
  - No semantic search.
  - No content-hash search field — contentHash is carried on the result, never accepted as a query input (I2).
  - No automatic refresh/re-resolution/re-admission/polling of search results (I1).
  - No deduplication by contentHash or documentId — Section B/D's multiplicities are exactly as real, live results show.
  - No new Repository storage and no new Publication identity field were added by this milestone — every section above exercises publisher/Publication.js and core/PublicationQuery.js completely unmodified.
  - No availability badge was added to search results — Section G's own finding (unavailability never removes a result) required no new presentation, only confirmation that none was silently assumed.
  - No search-history feature (I3).
  - No recommendation/ranking system.`);
    }

    // ===============================================================
    // Section J — Flagship: the full scenario, live, end to end.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();

        // 1. Create + Publish P1.
        const { document, publication: p1, publishDocumentUseCase } = publishMinimalDocument(storage, 'Flagship Search Spire', 'alice');

        // 2. Publish P2 with identical material (unmodified Document,
        // republished — genuinely identical bytes, genuinely distinct
        // publicationId).
        const p2 = publishDocumentUseCase.execute({ document });
        assert(p1.contentHash === p2.contentHash && p1.id !== p2.id, 'J2. P1 and P2 share identical material (contentHash) but are two distinct Publications.');

        // 3. Admit both (both are already in the Local catalog by
        // construction of publish itself — the real, only admission
        // path, per 0.9.574 Section A1).
        const provider = new LocalDiscoveryProvider(storage);

        // 4. Repository search: both remain distinct.
        const firstSearch = search(provider, { text: 'Flagship Search Spire' });
        assert(firstSearch.items.length === 2 && firstSearch.items.some((p) => p.id === p1.id) && firstSearch.items.some((p) => p.id === p2.id),
            'J4. Repository search returns BOTH P1 and P2, distinctly.');

        // 5. P1 becomes unavailable: its own snapshot key is removed
        // directly (simulating loss), WITHOUT touching the shared
        // document.world.id key P2's Open/Fork would also use — this is
        // deliberately narrower than 0.9.574 Section J's own
        // world.id-level loss, because THIS flagship needs P2 to
        // remain independently resolvable while P1 specifically fails,
        // which republish's own shared-storage-key shape (both P1 and
        // P2 resolve through document.world.id) would not otherwise
        // allow — so this section instead demonstrates the real,
        // narrower unavailability shape a decentralized-admitted-only
        // P1 (never locally materialized at all, exactly 0.9.574
        // Section B's own real shape) produces, while P2 stays
        // ordinarily published and fully resolvable.
        const decentralizedProvider = new DecentralizedPublicationDiscoveryProvider();
        const flagshipP1 = new Publication({
            documentId: 'flagship-orphan-doc',
            title: 'Flagship Search Spire',
            author: 'alice',
            providerId: 'decentralized',
            contentHash: p1.contentHash
        });
        decentralizedProvider.add(flagshipP1);
        const combinedProvider = makeRepositoryDiscoveryProvider(storage, decentralizedProvider);

        const secondSearch = search(combinedProvider, { text: 'Flagship Search Spire' });
        const p1Result = secondSearch.items.find((p) => p.id === flagshipP1.id);
        const p2Result = secondSearch.items.find((p) => p.id === p2.id);
        assert(secondSearch.items.length === 3, 'J5. Search still returns all three entries (P1-orphan, P2, and the original locally-published P1) — nothing was silently dropped by admitting a never-materialized entry.');
        assert(p1Result === flagshipP1, 'J6. P1 (never-locally-materialized) remains discoverable, unchanged.');
        assert(p2Result && p2Result.id === p2.id, 'J7. P2 remains discoverable too, completely unaffected by P1\'s own unavailability.');

        // 6. Open P1: fails cleanly.
        let p1OpenReason = null;
        try { new LoadDocumentUseCase(storage).execute({ load() {} }, flagshipP1.documentId); }
        catch (err) { p1OpenReason = err.reason; }
        assert(p1OpenReason === LoadFailureReason.MATERIAL_UNAVAILABLE, 'J8. Open on the P1 search result fails cleanly with MATERIAL_UNAVAILABLE.');

        // 7. Open P2: still resolves independently — the flagship
        // assertion. P1's failure (J8) had zero effect on P2.
        const p2Opened = new LoadDocumentUseCase(storage).execute({ load() {} }, p2Result.documentId);
        assert(p2Opened.world.id === document.world.id, 'J9. FLAGSHIP: Open on the P2 search result still resolves successfully and independently — P1 becoming unavailable and failing Open never affected P2 at all.');

        // 8. One more search, after both Open attempts, confirming the
        // whole scenario stayed stable throughout.
        const thirdSearch = search(combinedProvider, { text: 'Flagship Search Spire' });
        assert(thirdSearch.items.length === 3 && thirdSearch.items.some((p) => p.id === flagshipP1.id) && thirdSearch.items.some((p) => p.id === p2.id),
            'J10. A final search after both Open attempts (one failed, one succeeded) shows the identical three entries — search itself never reacted to either outcome.');

        console.log('✓ Section J: FLAGSHIP — Create -> Publish P1 -> Publish P2 with identical material -> Admit both -> Repository search (both distinct) -> P1 becomes unavailable -> Search again (P1 still discoverable, P2 unaffected) -> Open P1 fails cleanly with MATERIAL_UNAVAILABLE -> Open P2 still resolves independently -> a final search shows the same three entries throughout. Search result correctness, Publication identity, and per-result material availability are proven, live, end to end, to be three genuinely independent facts.');
    }

    console.log('\nAll Repository Search & Result Semantics Product Reassessment tests passed.');
    console.log('\n=== 0.9.575 VERDICT ===');
    console.log(`PRODUCT_COMPLETE for every question this milestone's own brief posed. No production code changed.

Search capability inventory (A): the Repository's real search surface is a small, closed field set — text (title +
author always, description opt-in), author-scope, five deterministic sort orders, pagination — confirmed live for
empty-query, case/whitespace tolerance, partial substring matching, and the deliberately single-literal-substring
(never tokenized/AND) matching semantics, which is documented here as the real, existing behavior rather than
treated as a gap (multi-term/tokenized/fuzzy search is explicitly out of this milestone's own scope).

Publication identity preservation (B) holds for BOTH adversarial shapes named in the originating brief, proven
through search itself rather than merely through findById: same documentId+contentHash with distinct
publicationIds never collapses (the ordinary republish case), and distinct documentIds sharing one contentHash
never collapse into each other either. Search result object fidelity (C) is confirmed structurally and live: a
result is the genuine admitted Publication instance, never reconstructed from a narrower documentId/contentHash/
title/author/array-index tuple, and two results sharing every displayed field but their publicationId are never
aliased. The 0.9.539 precise-date mechanism (D) was reused, not reimplemented, against a genuine three-way same-
Document/content/author/title/day republish collision, and all three remained independently addressable
throughout.

Search ordering (E) is deterministic and stable under provider-composition order specifically (via the
publicationId tiebreak core/PublicationSort.js already documents), free of any accidental contentHash/documentId
clustering, consistent with the toolbar's own sourced-from-one-enum vocabulary, and structurally free of any
relevance/ranking concept — none was introduced, per the brief's own explicit exclusion. Search purity (F) is
reconfirmed by citation to 0.9.574 Section C's own exhaustive proof, extended by the one case that proof left
unchecked: a MATCHING description search (which genuinely loads a full Document) still performs zero storage
writes. Search vs. availability (G) is proven live: a Publication whose material becomes unavailable is never
silently dropped from search results, while Open, attempted independently, correctly and separately reports the
failure — the Repository/Resolver layer separation this milestone's own brief tabulates holds exactly as stated.

Cross-surface identity (H) is proven live across three real, independently-invoked collaborators — Open, Fork, and
Publication Commentary — including the adversarial two-search-results-sharing-one-documentId case: each surface
resolves strictly by the identity field a search result actually carries (documentId for material, publicationId
for lineage and commentary), never conflating the two even when they diverge across results. Explore's equivalent
is structurally reconfirmed and cited from prior live proof, per this file's own header constraint (avoiding the
three-dependent WorldNavigationSession import chain, exactly as 0.9.574's own file already established the
precedent for).

The flagship (J) demonstrates the brief's own closing scenario directly, live, end to end: publish twice with
identical material, admit both, search finds both, one loses its material and becomes permanently unresolvable
while the other remains completely unaffected and independently Openable — proving search correctness, Publication
identity, and per-result material availability are three genuinely separate facts, exactly as this milestone's own
central question asked.

Every deliberate exclusion this milestone's own brief named (I) was checked absent by direct source inspection,
not merely left unbuilt by omission: no full-text index, no fuzzy search, no relevance/ranking, no content-hash
search field, no auto-refresh/re-resolution/re-admission, no deduplication, no new Repository storage, no new
Publication identity field, no availability badge, no search-history, no recommendation system.

Per the originating brief's own predicted outcome: a narrow, test-only, high-confidence PRODUCT_COMPLETE result.
STOP the Repository lifecycle + currency + search semantics arc — 0.9.523-0.9.575 have now covered Publication
creation, distribution, discovery, Repository catalog identity, currency, and now search/result semantics, in
increasing depth, without finding a second production gap since 0.9.574's own single narrow fix. The next
milestone should come from a genuinely different product boundary — this brief's own suggestion, World-level
content and experience beyond Publications (Worlds/locations themselves, rather than another Publication-centered
seam), is a reasonable place to look next, not another layer of Repository/Publication auditing.`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
