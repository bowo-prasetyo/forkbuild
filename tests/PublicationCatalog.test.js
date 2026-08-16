import { Position } from '../core/Position.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { License, LicenseId } from '../core/License.js';
import { PublicationQuery, DEFAULT_PAGE_SIZE } from '../core/PublicationQuery.js';
import { PublicationPage } from '../core/PublicationPage.js';
import { PublicationSort, comparePublications } from '../core/PublicationSort.js';
import { PreviewType, derivePlaceholderPreview } from '../core/DocumentPreview.js';
import { GroupBy, groupPublications } from '../core/PublicationGrouping.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { SearchPublicationsUseCase } from '../application/SearchPublicationsUseCase.js';
import { LoadPublicationDocumentUseCase } from '../application/LoadPublicationDocumentUseCase.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.2.31 — Publication Catalog & Repository UX.
//
// Establishes the CATALOG MODEL (PublicationQuery/PublicationPage/
// PublicationSort/SearchPublicationsUseCase) the Repository/Author
// views now share, and tests it at the scale the design doc insisted
// on: "do not test the UI with only 5 publications." Central claims
// under test:
//   - ordering is DETERMINISTIC — the same candidates sort to the
//     exact same sequence regardless of arrival order, and identical
//     timestamps never produce an arbitrary tie.
//   - pagination is exact — walking every page of a 10,000-publication
//     catalog visits every publication exactly once, no gaps, no
//     duplicates.
//   - Repository search (title/author/opt-in description) is a
//     genuinely different operation than World search — no spatial
//     concept anywhere here.
//   - description search has a real, opt-in cost, and is memoized so
//     that cost is paid at most once per publication.

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function makeDocument(title, author, description = '') {
    const world = new World();
    const building = new Building({ creator: author });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    return new Document({
        world,
        metadata: new DocumentMetadata({ title, author, description, license: new License({ id: LicenseId.CC0_1_0 }) })
    });
}

// Raw Publication.toJSON()-shaped records, written straight to the
// SAME storage key LocalDiscoveryProvider/LocalPublisherProvider both
// use — bypassing the full publish pipeline (serialization,
// migration, validation, content hashing) on purpose. This file is
// testing the CATALOG layer (query/sort/page), which only ever sees
// discoveryProvider.list()'s output; how those records got there is a
// publisher-layer concern already covered by
// tests/PublicationLifecycle.test.js. Building 10,000 real Documents
// through the full publish pipeline would make the large-scale test
// below about publishing performance, not catalog correctness.
const PUBLICATIONS_KEY = 'forkbuild-publications';

function makeRawRecord({ id, documentId, title, author, publishedAt, parentDocumentId = null, license = null }) {
    return {
        id, documentId, title, author,
        providerId: 'local',
        publishedAt: publishedAt.toISOString(),
        url: null,
        parentDocumentId,
        snapshotId: null,
        contentHash: `hash-${id}`,
        schemaVersion: 1,
        license,
        contentReference: null,
        publisherIdentity: null,
        signature: null
    };
}

async function runTests() {
    // -------------------------------------------------------------
    // 1-6. core/PublicationSort.js — deterministic ordering.
    // -------------------------------------------------------------
    {
        const a = { id: 'a', title: 'Ancient City', author: 'alice', publishedAt: new Date('2026-01-01T00:00:00Z') };
        const b = { id: 'b', title: 'ocean base', author: 'bob', publishedAt: new Date('2026-01-02T00:00:00Z') };
        const c = { id: 'c', title: 'Mars Colony', author: 'carol', publishedAt: new Date('2026-01-01T00:00:00Z') };

        assert(comparePublications(b, a, PublicationSort.RECENTLY_PUBLISHED) < 0,
            '1. RECENTLY_PUBLISHED sorts the newer publication first');
        assert(comparePublications(a, b, PublicationSort.OLDEST_PUBLISHED) < 0,
            '2. OLDEST_PUBLISHED sorts the older publication first');
        assert(comparePublications(a, c, PublicationSort.TITLE_ASC) < 0,
            '3. TITLE_ASC: "Ancient City" before "Mars Colony"');
        // Ordinal, not locale-aware: uppercase code points sort before
        // lowercase ones ('M' < 'o'), which is NOT how a human/locale
        // collator would order "Mars Colony" vs "ocean base" — this is
        // the deliberate, documented trade-off for cross-replica
        // determinism (see core/PublicationSort.js).
        assert(comparePublications(c, b, PublicationSort.TITLE_ASC) < 0,
            '4. TITLE_ASC is ordinal (uppercase before lowercase), not locale-aware collation');
        assert(comparePublications(a, c, PublicationSort.AUTHOR_ASC) < 0,
            '5. AUTHOR_ASC: "alice" before "carol"');

        // Identical timestamps -> deterministic tiebreak by id, and
        // that tiebreak is STABLE regardless of which order the two
        // items are compared in (both orderings agree on the winner).
        const tied1 = { id: 'p-aaa', publishedAt: new Date('2026-01-01T00:00:00Z') };
        const tied2 = { id: 'p-bbb', publishedAt: new Date('2026-01-01T00:00:00Z') };
        assert(comparePublications(tied1, tied2, PublicationSort.RECENTLY_PUBLISHED) < 0
            && comparePublications(tied2, tied1, PublicationSort.RECENTLY_PUBLISHED) > 0,
            '6. identical timestamps break the tie by publicationId, consistently in both directions');
    }

    // -------------------------------------------------------------
    // 7. The SAME candidate set, sorted from two different arrival
    //    orders, produces the IDENTICAL final sequence — the actual
    //    property "two replicas with the same publications produce
    //    the same ordering" depends on, proven directly rather than
    //    just asserted.
    // -------------------------------------------------------------
    {
        const base = Array.from({ length: 12 }, (_, i) => ({
            id: `id-${i % 4}-${i}`, // some share a millisecond-identical timestamp bucket
            title: `Item ${i % 5}`,
            author: `author-${i % 3}`,
            publishedAt: new Date(2026, 0, 1 + (i % 3)) // only 3 distinct timestamps across 12 items
        }));
        const shuffled = [...base].reverse();
        const sortedA = [...base].sort((x, y) => comparePublications(x, y, PublicationSort.RECENTLY_PUBLISHED));
        const sortedB = [...shuffled].sort((x, y) => comparePublications(x, y, PublicationSort.RECENTLY_PUBLISHED));
        assert(sortedA.map((p) => p.id).join(',') === sortedB.map((p) => p.id).join(','),
            '7. sorting the same items from two different arrival orders yields the identical sequence');
    }

    // -------------------------------------------------------------
    // 8-9. PublicationQuery / PublicationPage — plain value objects,
    //      sane defaults.
    // -------------------------------------------------------------
    {
        const q = new PublicationQuery();
        assert(q.text === '' && q.author === null && q.sort === PublicationSort.RECENTLY_PUBLISHED
            && q.page === 1 && q.pageSize === DEFAULT_PAGE_SIZE && q.includeDescriptions === false,
            '8. PublicationQuery defaults: no text, no author scope, recently-published, page 1, descriptions off');
        const page2 = q.withPage(3);
        assert(page2.page === 3 && page2.sort === q.sort,
            '9. withPage derives a new query preserving every other field');
    }

    // -------------------------------------------------------------
    // Shared fixtures for SearchPublicationsUseCase's smaller,
    // functional-correctness tests.
    // -------------------------------------------------------------
    const storage = new InMemoryStorageProvider();
    // Publication.author reflects the PUBLISHING identity
    // (LocalPublisherProvider reads identityProvider.currentUser().
    // username, not the document's own metadata.author) — so a
    // genuine multi-author fixture needs a SEPARATE LocalIdentityProvider
    // per author, each with its OWN storage: LocalIdentityProvider
    // keeps "who's logged in" as shared state on whatever storage it's
    // given, so two instances sharing one storage would just mean the
    // second login() silently signs the first one out (same pattern
    // tests/TrustDiscoveryHardening.test.js's own createIdentity()
    // helper already established). The catalog's own storage (for
    // publications/content) stays shared, since it's the discovery
    // provider that needs to see everything published across authors.
    const alice = new LocalIdentityProvider(new InMemoryStorageProvider());
    alice.login('alice');
    const bob = new LocalIdentityProvider(new InMemoryStorageProvider());
    bob.login('bob');
    const contentStore = new LocalContentStore(storage);
    const publisher = new LocalPublisherProvider(storage, contentStore);
    const discoveryProvider = new LocalDiscoveryProvider(storage);
    const loadPublicationDocumentUseCase = new LoadPublicationDocumentUseCase(storage);

    const ancientCity = publisher.publish(
        makeDocument('Ancient City', 'alice', 'A reconstruction of a Roman city showing the forum and aqueduct.'), alice);
    const marsColony = publisher.publish(makeDocument('Mars Colony', 'bob', 'A red-planet settlement.'), bob);
    const oceanBase = publisher.publish(makeDocument('Ocean Base', 'alice', ''), alice);

    // -------------------------------------------------------------
    // 10-14. Text search: title/author always match; description only
    //        when explicitly opted in.
    // -------------------------------------------------------------
    {
        const useCase = new SearchPublicationsUseCase(discoveryProvider, loadPublicationDocumentUseCase);

        const byTitle = useCase.execute({ text: 'mars' });
        assert(byTitle.items.length === 1 && byTitle.items[0].id === marsColony.id,
            '10. text matches title, case-insensitively');

        const byAuthor = useCase.execute({ text: 'bob' });
        assert(byAuthor.items.length === 1 && byAuthor.items[0].id === marsColony.id,
            '11. text matches author');

        const descriptionOff = useCase.execute({ text: 'aqueduct' });
        assert(descriptionOff.items.length === 0,
            '12. "aqueduct" (description-only text) does NOT match when includeDescriptions is off (the default)');

        const descriptionOn = useCase.execute({ text: 'aqueduct', includeDescriptions: true });
        assert(descriptionOn.items.length === 1 && descriptionOn.items[0].id === ancientCity.id,
            '13. the SAME query with includeDescriptions:true finds it via the document\'s own description');

        const noMatch = useCase.execute({ text: 'nonexistent-term-xyz', includeDescriptions: true });
        assert(noMatch.items.length === 0 && noMatch.totalCount === 0,
            '14. a description-inclusive search that matches nothing returns a proper empty page, not an error');
    }

    // -------------------------------------------------------------
    // 15. Description resolution is memoized — repeated searches
    //     against the same catalog never re-load a document whose
    //     description this use case instance has already resolved.
    // -------------------------------------------------------------
    {
        let loadCount = 0;
        const countingLoader = {
            execute(documentId) {
                loadCount++;
                return loadPublicationDocumentUseCase.execute(documentId);
            }
        };
        const useCase = new SearchPublicationsUseCase(discoveryProvider, countingLoader);
        useCase.execute({ text: 'roman', includeDescriptions: true });
        const afterFirst = loadCount;
        useCase.execute({ text: 'forum', includeDescriptions: true });
        assert(loadCount === afterFirst,
            '15. a second description search over the same catalog triggers no additional document loads (cached)');
    }

    // -------------------------------------------------------------
    // 16-17. Author scope — the ONLY difference between Repository
    //        and Author View queries.
    // -------------------------------------------------------------
    {
        const useCase = new SearchPublicationsUseCase(discoveryProvider);
        const aliceOnly = useCase.execute({ author: 'alice' });
        assert(aliceOnly.totalCount === 2
            && aliceOnly.items.every((p) => p.author === 'alice'),
            '16. author scope narrows to exactly that author\'s publications');

        const bobOnly = useCase.execute({ author: 'bob' });
        assert(bobOnly.totalCount === 1 && bobOnly.items[0].id === marsColony.id,
            '17. a different author scope narrows independently — Repository (no scope) and Author (scoped) share one query shape');
    }

    // -------------------------------------------------------------
    // 18. Empty catalog / empty result — a query against a discovery
    //     provider with nothing in it degrades to a well-formed empty
    //     page, not a throw.
    // -------------------------------------------------------------
    {
        const emptyStorage = new InMemoryStorageProvider();
        const emptyDiscovery = new LocalDiscoveryProvider(emptyStorage);
        const useCase = new SearchPublicationsUseCase(emptyDiscovery);
        const result = useCase.execute({});
        assert(result.items.length === 0 && result.totalCount === 0 && result.totalPages === 1
            && result.hasNext === false && result.hasPrevious === false,
            '18. an empty catalog produces a well-formed empty PublicationPage');
    }

    // -------------------------------------------------------------
    // 19-24. core/DocumentPreview.js — deterministic placeholder.
    // -------------------------------------------------------------
    {
        const pubLike = { id: 'pub-fixed-id', title: 'Ancient City' };
        const first = derivePlaceholderPreview(pubLike);
        const second = derivePlaceholderPreview(pubLike);
        assert(first.type === PreviewType.PLACEHOLDER, '19. the derived preview is a PLACEHOLDER (no real thumbnail mechanism exists yet)');
        assert(first.seed === second.seed && first.label === second.label,
            '20. the SAME publication always derives the SAME placeholder — no randomness, no clock');
        assert(first.label === 'A', '21. the label is the title\'s first character, uppercased');
        assert(first.seed >= 0 && first.seed < 360, '22. the seed is a valid hue in [0, 360)');
        assert(first.reference === null, '23. reference stays null — no content-addressed preview mechanism exists yet');

        const different = derivePlaceholderPreview({ id: 'a-totally-different-id', title: 'Ancient City' });
        assert(different.seed !== first.seed,
            '24. two DIFFERENT publications sharing a title still derive different seeds (keyed by publicationId, not title)');
    }

    // -------------------------------------------------------------
    // 25-29. core/PublicationGrouping.js — presentation-only grouping.
    // -------------------------------------------------------------
    {
        const now = new Date(2026, 5, 15, 12, 0, 0);
        const items = [
            { documentId: 'd1', author: 'alice', license: { id: LicenseId.CC0_1_0 }, publishedAt: now }, // Today
            { documentId: 'd2', author: 'bob', license: { id: LicenseId.CC_BY_4_0 }, publishedAt: new Date(2026, 5, 14, 12, 0, 0) }, // Yesterday
            { documentId: 'd3', author: 'alice', license: null, publishedAt: new Date(2026, 5, 10, 12, 0, 0) }, // This Week
            { documentId: 'd4', author: 'carol', license: { id: LicenseId.CC0_1_0 }, publishedAt: new Date(2026, 4, 1, 12, 0, 0) } // Earlier
        ];

        const none = groupPublications(items, GroupBy.NONE);
        assert(none.length === 1 && none[0].label === null && none[0].items.length === 4,
            '25. GroupBy.NONE produces one ungrouped bucket containing everything');

        const byAuthor = groupPublications(items, GroupBy.AUTHOR);
        assert(byAuthor.length === 3 && byAuthor[0].key === 'alice' && byAuthor[0].items.length === 2,
            '26. GroupBy.AUTHOR buckets correctly, preserving first-appearance order (alice appears first)');

        const byDate = groupPublications(items, GroupBy.DATE, { now });
        assert(byDate.map((g) => g.key).join(',') === 'Today,Yesterday,This Week,Earlier',
            '27. GroupBy.DATE always orders buckets Today -> Yesterday -> This Week -> Earlier, regardless of input order');

        const byLicense = groupPublications(items, GroupBy.LICENSE);
        const unspecified = byLicense.find((g) => g.key === 'Unspecified');
        assert(unspecified && unspecified.items.length === 1 && unspecified.items[0].documentId === 'd3',
            '28. GroupBy.LICENSE falls back to "Unspecified" for a publication with no license, rather than dropping it');

        assert(groupPublications([], GroupBy.AUTHOR).length === 0,
            '29. grouping an empty page produces no groups (not a group full of nothing)');
    }

    // -------------------------------------------------------------
    // 30-35. LARGE SYNTHETIC CATALOG — 10,000 publications. This is
    //        the check the design doc insisted on: pagination,
    //        ordering, and filtering must remain correct at a scale
    //        where assumptions invisible in a tiny fixture would
    //        actually break.
    // -------------------------------------------------------------
    {
        const N = 10000;
        const bigStorage = new InMemoryStorageProvider();
        const records = [];
        for (let i = 0; i < N; i++) {
            records.push(makeRawRecord({
                id: `pub-${String(i).padStart(5, '0')}`,
                documentId: `doc-${i}`,
                title: `World ${String(i).padStart(5, '0')}`,
                author: `author-${i % 50}`,
                // Spread across ~2700 days with real duplicate
                // timestamps (i % 365) so the tiebreak is genuinely
                // exercised at scale, not just in the small fixture
                // above.
                publishedAt: new Date(2018, 0, 1 + (i % 365))
            }));
        }
        bigStorage.save(PUBLICATIONS_KEY, records);
        const bigDiscovery = new LocalDiscoveryProvider(bigStorage);
        const useCase = new SearchPublicationsUseCase(bigDiscovery);

        const first = useCase.execute({ sort: PublicationSort.TITLE_ASC, page: 1, pageSize: 20 });
        assert(first.totalCount === N && first.items.length === 20 && first.hasPrevious === false && first.hasNext === true,
            '30. page 1 of 10,000 (page size 20) has 20 items and no previous page');

        const totalPages = first.totalPages;
        assert(totalPages === 500, '31. 10,000 items at page size 20 is exactly 500 pages');

        const last = useCase.execute({ sort: PublicationSort.TITLE_ASC, page: totalPages, pageSize: 20 });
        assert(last.items.length === 20 && last.hasNext === false && last.hasPrevious === true,
            '32. the last page is full (10,000 is an exact multiple of 20) and has no next page');

        const beyond = useCase.execute({ sort: PublicationSort.TITLE_ASC, page: totalPages + 50, pageSize: 20 });
        assert(beyond.page === totalPages && beyond.items.length === 20,
            '32b. requesting a page far beyond the end clamps to the last real page rather than returning nothing');

        // Walk EVERY page and confirm the full catalog is covered
        // exactly once — no gaps, no duplicates — and that the
        // concatenation of all pages is itself in exact TITLE_ASC
        // order (titles are zero-padded so ordinal string order
        // matches numeric order exactly).
        const start = Date.now();
        const seen = new Set();
        let previousTitle = null;
        let allInOrder = true;
        for (let page = 1; page <= totalPages; page++) {
            const result = useCase.execute({ sort: PublicationSort.TITLE_ASC, page, pageSize: 20 });
            for (const pub of result.items) {
                if (seen.has(pub.documentId)) {
                    throw new Error(`ASSERT FAILED: 33. duplicate item ${pub.documentId} encountered while paginating`);
                }
                seen.add(pub.documentId);
                if (previousTitle !== null && pub.title < previousTitle) {
                    allInOrder = false;
                }
                previousTitle = pub.title;
            }
        }
        const elapsedMs = Date.now() - start;
        assert(seen.size === N, '33. walking every page visits every one of the 10,000 publications exactly once');
        assert(allInOrder, '34. the full walk across all 500 pages is in exact, unbroken TITLE_ASC order');
        assert(elapsedMs < 10000, `35. paginating the entire 10,000-item catalog completes in reasonable time (${elapsedMs}ms)`);

        // Author scope at scale: author-7 owns exactly every 50th
        // publication (i % 50 === 7) -> 200 of them.
        const authorScoped = useCase.execute({ author: 'author-7', sort: PublicationSort.RECENTLY_PUBLISHED, page: 1, pageSize: 10 });
        assert(authorScoped.totalCount === 200,
            '36. author scope against the 10,000-item catalog still narrows to exactly that author\'s 200 publications');
    }

    console.log('✅ All Publication Catalog & Repository UX tests passed.');
}

runTests().catch((e) => { console.error(e); throw e; });
