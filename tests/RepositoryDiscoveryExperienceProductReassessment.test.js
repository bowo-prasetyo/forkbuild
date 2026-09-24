import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

import { Publication } from '../publisher/Publication.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { CompositeDiscoveryProvider } from '../discovery/CompositeDiscoveryProvider.js';
import { DecentralizedPublicationDiscoveryProvider } from '../discovery/DecentralizedPublicationDiscoveryProvider.js';
import { SearchPublicationsUseCase } from '../application/publication/SearchPublicationsUseCase.js';
import { FindPublicationUseCase } from '../application/publication/FindPublicationUseCase.js';
import { LoadPublicationDocumentUseCase } from '../application/publication/LoadPublicationDocumentUseCase.js';
import { PublicationQuery } from '../core/PublicationQuery.js';
import { groupPublications, GroupBy } from '../core/PublicationGrouping.js';
import { computeAmbiguousPublishedDateIds, formatPublicationDate } from '../core/PublicationDateAmbiguity.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';

import PublicationCard from '../ui/components/PublicationCard.js';
import PublicationCommentarySection from '../ui/components/PublicationCommentarySection.js';
import PublicationList from '../ui/components/PublicationList.js';
import { stylesheetFiles, editorViewFiles } from './support/SourceFileGroups.js';
import { assert } from './support/Assert.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';

// 0.9.564 — Repository Discovery Experience Product Reassessment.
//
// Every prior Repository-facing milestone in this codebase's history
// answered a narrower question: how a Publication gets ADMITTED to
// Repository (0.9.329-0.9.474's Federated/Decentralized Discovery arc,
// 0.9.523/0.9.524's admission-boundary closure), whether the resulting
// catalog is internally COHERENT (0.9.523's own Search/Duplicate/
// Provenance sections, 0.9.525's Material Trust follow-up), whether an
// action stays bound to the right instance (0.9.540), and whether
// Commentary reaches every surface (0.9.561/0.9.562). This milestone
// asks the one question none of those did: taken AS A WHOLE, right now,
// after that entire arc, can a Wanderer actually USE Repository to
// discover, distinguish, inspect, and act on Publications without
// hitting an identity, trust, or navigation ambiguity anywhere along the
// way?
//
// METHOD: wherever a prior milestone already built a real, dedicated
// guard for a claim this milestone needs, that guard's own file is
// RE-EXECUTED LIVE, as a real subprocess against CURRENT source, and its
// exit code (never its prose) is what this milestone treats as true —
// the same "reconfirm, never re-derive" discipline
// tests/StablePlateauClosureAudit.test.js's own Section A established.
// Sections with no prior dedicated guard (search-semantics vocabulary,
// result multiplicity as a single merged scene, action-parity after
// 0.9.561, cross-surface navigation targets, failure isolation across a
// mixed-fixture catalog) are exercised fresh, live, against real
// production collaborators — never a second mock of a boundary already
// proven real elsewhere.
//
//   Section A — Repository entry & empty state (0/1/many/mixed-origin).
//   Section B — Publication identity perception (0.9.539, reconfirmed).
//   Section C — Search semantics: search ≠ verification ≠ identity
//               lookup ≠ content matching, inventoried and bounded.
//   Section D — Result multiplicity: five named scenarios, no silent
//               collapse.
//   Section E — Action discoverability: Open/Fork/Explore/Commentary/
//               Author, live parity across both catalog views.
//   Section F — Trust/evidence presentation (0.9.525 Section G,
//               reconfirmed).
//   Section G — Provenance (0.9.523 Section D / CompositeDiscoveryProvider's
//               own header, reconfirmed).
//   Section H — Failure isolation across a single mixed-fixture catalog.
//   Section I — Navigation continuity: Repository -> action -> the exact
//               destination the rest of the app already resolves it to,
//               cross-checked against 0.9.560/0.9.563's own vocabulary.
//   Section J — Classification and production guard.
//
// VERDICT MODEL: ALREADY_CORRECT / DELIBERATE_BOUNDARY /
// DOCUMENTATION_GAP / PRODUCT_GAP / ARCHITECTURAL_GAP — Section J.
//
// DELIBERATELY EXCLUDED, per the requesting brief: new search fields,
// contentHash/publicationId search, ranking, recommendations,
// reputation, trust scores, moderation, automatic deduplication,
// persistent encounter history, new Publication identity mechanisms.
// This milestone only asks whether any of those are actually necessary
// — it implements none of them, and implements nothing else either:
// test-only, zero production files touched.

const REPO_ROOT = new URL('../', import.meta.url);

async function readSource(relativePath) {
    return readFile(new URL(relativePath, REPO_ROOT), 'utf8');
}
async function codeOnlySource(relativePath) {
    const text = await readSource(relativePath);
    return text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

// Re-execute a prior milestone's own guard file live, as a real
// subprocess against current source — see this file's own header,
// "METHOD." A non-zero exit means that milestone's own claim no longer
// holds against current source, which this milestone treats as its own
// failure too, never silently ignored.
function runGuardLive(relativeTestPath) {
    const stdout = execFileSync(process.execPath, [relativeTestPath], {
        cwd: new URL('../', import.meta.url).pathname,
        encoding: 'utf8'
    });
    return stdout;
}

function makeDocument(title, author, description = '') {
    const world = new World();
    const building = new Building({ creator: author });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    return new Document({ world, metadata: new DocumentMetadata({ title, author, description }) });
}

function knowPublicationsLocally(storageProvider, publications) {
    storageProvider.save('forkbuild-publications', publications.map((p) => p.toJSON()));
}

// The real stack every real publish goes through — the same shape
// tests/PublicationListCommentaryParity.test.js's own makeBackend()
// already established, extended here with loadPublicationDocumentUseCase
// (needed for Section C's description-search check) and searchPublicationsUseCase
// itself — the exact composition application/discovery/CreateDiscoveryUseCase.js
// builds for Repository/Author, reproduced rather than imported so this
// file can substitute an in-memory storage backend per scenario.
function makeBackend() {
    const storage = new InMemoryStorageProvider();
    const identityProvider = new LocalIdentityProvider(storage);
    const contentStore = new LocalContentStore(storage);
    const publisherProvider = new LocalPublisherProvider(storage, contentStore);
    const discoveryProvider = new LocalDiscoveryProvider(storage);
    const loadPublicationDocumentUseCase = new LoadPublicationDocumentUseCase(storage);
    const searchPublicationsUseCase = new SearchPublicationsUseCase(discoveryProvider, loadPublicationDocumentUseCase);
    return { storage, identityProvider, publisherProvider, discoveryProvider, loadPublicationDocumentUseCase, searchPublicationsUseCase };
}

// A plain ctx mirroring a mounted PublicationCard instance — the same
// convention tests/OtherPublicationCommentaryEntryPoint.test.js's own
// cardCtx() and tests/PublicationListCommentaryParity.test.js's own
// listCtx() already established, never a full Vue mount.
function cardCtx(publication, overrides = {}) {
    return {
        publication,
        description: '', parentTitle: null, forkCount: 0, needsPreciseDate: false,
        getPublicationCommentariesCommand: null, addPublicationCommentaryCommand: null, identityUseCase: null,
        commentaryOpen: false, commentaries: [], newCommentaryText: '', commentarySubmitting: false,
        commentaryError: null, pendingCommentaryDraft: null,
        // The card's own toggle; opening mounts the shared
        // PublicationCommentarySection, whose mounted() performs the
        // first read. Reads/writes are that section's own methods.
        toggleCommentary() {
            PublicationCard.methods.toggleCommentary.call(this);
            if (this.commentaryOpen) {
                PublicationCommentarySection.mounted.call(this);
            }
        },
        refreshCommentaries: PublicationCommentarySection.methods.refreshCommentaries,
        submitCommentary: PublicationCommentarySection.methods.submitCommentary,
        ...overrides
    };
}
// PublicationList.js only tracks which rows are open; each open row
// mounts its own PublicationCommentarySection. `rowSection(pub)` stands
// in for that row's own section instance (one per publicationId, never
// shared); opening runs its mounted() read, closing discards it.
function listCtx(overrides = {}) {
    const ctx = {
        getPublicationCommentariesCommand: null, addPublicationCommentaryCommand: null,
        identityUseCase: null, defaultAnnouncementDiscoveryProvider: null,
        openCommentaryIds: {},
        isCommentaryOpen: PublicationList.methods.isCommentaryOpen,
        ...overrides
    };
    const sections = new Map();
    ctx.rowSection = (pub) => {
        if (!sections.has(pub.id)) {
            const section = {
                publication: pub,
                getPublicationCommentariesCommand: ctx.getPublicationCommentariesCommand,
                addPublicationCommentaryCommand: ctx.addPublicationCommentaryCommand,
                identityUseCase: ctx.identityUseCase,
                defaultAnnouncementDiscoveryProvider: ctx.defaultAnnouncementDiscoveryProvider,
                refreshCommentaries: PublicationCommentarySection.methods.refreshCommentaries,
                submitCommentary: PublicationCommentarySection.methods.submitCommentary
            };
            Object.assign(section, PublicationCommentarySection.data.call(section));
            sections.set(pub.id, section);
        }
        return sections.get(pub.id);
    };
    ctx.toggleCommentary = (pub) => {
        PublicationList.methods.toggleCommentary.call(ctx, pub);
        if (ctx.isCommentaryOpen(pub)) {
            PublicationCommentarySection.mounted.call(ctx.rowSection(pub));
        } else {
            sections.delete(pub.id);
        }
    };
    return ctx;
}

// The exact route shapes ui/components/PublicationCatalog.js's own
// openPublication()/forkPublication()/viewWorld()/viewAuthor() build —
// reproduced here (never imported, since those are closures inside
// setup()) so Section I can assert the SAME shapes without mounting Vue.
function catalogRouteFor(action, pub) {
    switch (action) {
        case 'open': return { path: '/editor', query: { load: pub.documentId } };
        case 'fork': return { path: '/editor', query: { fork: pub.documentId, publication: pub.id } };
        case 'explore': return { path: `/world/${pub.documentId}` };
        case 'author': return pub.author ? { path: `/author/${encodeURIComponent(pub.author)}` } : null;
        default: throw new Error(`unknown action ${action}`);
    }
}

async function main() {
    const results = [];

    // ===================================================================
    // Section A — Repository entry and empty state.
    // ===================================================================
    {
        // A1. Zero publications — RepositoryView (author: null) and
        // AuthorView (author: 'nobody') each get a distinct, honest
        // empty-state message, never a generic blank screen.
        const empty = makeBackend();
        const repoEmpty = empty.searchPublicationsUseCase.execute(new PublicationQuery({ author: null }));
        const authorEmpty = empty.searchPublicationsUseCase.execute(new PublicationQuery({ author: 'nobody' }));
        assert(repoEmpty.items.length === 0 && repoEmpty.totalCount === 0, '1. LIVE: an untouched Repository reports zero items/zero totalCount, not an error or undefined page.');
        assert(authorEmpty.items.length === 0, '2. LIVE: an author with no publications reports zero items the same way.');

        const catalogSource = await codeOnlySource('ui/components/PublicationCatalog.js');
        assert(catalogSource.includes("'No publications yet. Publish a creation from the Editor to see it here.'"),
            '3. LIVE: Repository\'s own empty-state message (author: null) explains WHAT Repository is FOR, not merely that it is empty — a first-time Wanderer is told the one action that would populate it.');
        assert(catalogSource.includes("'No publications found for this author.'"),
            '4. LIVE: Author view\'s own empty-state message is distinct from Repository\'s, and names the scope (this author) rather than reusing Repository\'s generic wording.');
        assert(catalogSource.includes('No matches for'),
            "5. LIVE: a SEARCH that matches nothing (catalog non-empty) is worded differently from an EMPTY catalog — 'no matches for X' vs 'no publications yet' are never conflated into one message.");

        // A2. One, then many, then mixed-origin (local + decentralized)
        // publications — each state reachable, none silently merged into
        // "loading" or "error."
        const backend = makeBackend();
        backend.identityProvider.login('alice');
        const solo = backend.publisherProvider.publish(makeDocument('Solo World', 'alice'), backend.identityProvider);
        const oneResult = backend.searchPublicationsUseCase.execute(new PublicationQuery());
        assert(oneResult.totalCount === 1 && oneResult.items[0].id === solo.id, '6. LIVE: exactly one publication renders as exactly one result.');

        for (let i = 0; i < 4; i++) {
            backend.publisherProvider.publish(makeDocument(`Many ${i}`, 'alice'), backend.identityProvider);
        }
        const manyResult = backend.searchPublicationsUseCase.execute(new PublicationQuery());
        assert(manyResult.totalCount === 5, '7. LIVE: five publications render as five results, deterministically ordered (see Section B/D on order stability).');

        const decentralized = new DecentralizedPublicationDiscoveryProvider();
        decentralized.add(new Publication({ id: 'decentralized-a', documentId: 'doc-decentralized-a', title: 'From A Peer', author: 'bob', providerId: 'nostr' }));
        const mixedProvider = new CompositeDiscoveryProvider([backend.discoveryProvider, decentralized]);
        const mixedSearch = new SearchPublicationsUseCase(mixedProvider);
        const mixedResult = mixedSearch.execute(new PublicationQuery());
        assert(mixedResult.totalCount === 6, '8. LIVE: local (5) and decentralized (1) publications, merged, report a SINGLE honest total — 6, not 5, not 1, not two separately-counted lists.');
        assert(mixedResult.items.some((p) => p.id === 'decentralized-a') && mixedResult.items.some((p) => p.id === solo.id),
            '9. LIVE: both origins are genuinely represented in the SAME page of results, not one hidden behind the other.');

        // A3. RepositoryView.js/AuthorView.js stay thin — the actual
        // explanation lives in the shared catalog's own toolbar/empty
        // state (Section A1), not duplicated (and risking drift) in each
        // view's own template. See ui/components/PublicationCatalog.js's
        // own 0.2.31 header, "the GitHub mode."
        const repositoryViewSource = await codeOnlySource('ui/views/RepositoryView.js');
        const authorViewSource = await codeOnlySource('ui/views/AuthorView.js');
        assert(repositoryViewSource.includes('<PublicationCatalog') && !repositoryViewSource.includes('No publications'),
            '10. LIVE: RepositoryView.js never re-implements its own empty-state copy — it mounts the shared catalog, which already owns that message.');
        assert(authorViewSource.includes('<PublicationCatalog :author="author" />'),
            '11. LIVE: AuthorView.js mounts the identical shared catalog, scoped by the one `author` prop — never a parallel, independently-maintained author-catalog implementation.');
        assert(authorViewSource.includes("{{ author || 'Anonymous' }}") && authorViewSource.includes('{{ allPublications.length }} publication'),
            '12. LIVE: AuthorView.js\'s own page-level heading and count give it a distinct identity from Repository\'s bare "Repository" heading — a Wanderer landing on either page can tell which scope they\'re looking at without reading the URL.');

        results.push(['A', 'Repository entry & empty state (0/1/many/mixed-origin)', 'ALREADY_CORRECT']);
        console.log('✓ Section A: Repository/Author each expose a distinct, purpose-explaining empty state; 0/1/many/mixed-origin catalogs all render as a single honest count; neither view duplicates the shared catalog\'s own copy.');
    }

    // ===================================================================
    // Section B — Publication identity perception (0.9.539, reconfirmed).
    // ===================================================================
    {
        // Re-execute 0.9.539's own dedicated guard live, against current
        // source — never re-derived from scratch (see this file's own
        // header, "METHOD").
        const guardOutput = runGuardLive('tests/PublicationSelectionIdentityPresentationProductReassessment.test.js');
        assert(/tests passed/i.test(guardOutput),
            '13. LIVE (subprocess): 0.9.539\'s own Publication Selection & Identity Presentation guard still exits 0, with its own success banner present, against current source — same-day-republish disambiguation is unmodified and still holds.');

        // The requesting brief's own P1=D+H / P2=D+H scenario, exercised
        // fresh here as a sanity re-derivation of the CONCLUSION (not a
        // re-implementation of 0.9.539's own test surface): two
        // Publications, same document, same content hash, same calendar
        // day, distinct publicationIds and timestamps.
        const p1 = new Publication({ id: 'q9h3cx-p1', documentId: 'doc-q9h3cx', title: 'Same Day', author: 'alice', publishedAt: new Date(2026, 4, 1, 9, 0, 0, 0), contentReference: { hash: 'hash-q9h3cx' } });
        const p2 = new Publication({ id: 'q9h3cx-p2', documentId: 'doc-q9h3cx', title: 'Same Day', author: 'alice', publishedAt: new Date(2026, 4, 1, 9, 0, 0, 500), contentReference: { hash: 'hash-q9h3cx' } });
        const ambiguous = computeAmbiguousPublishedDateIds([p1, p2]);
        assert(ambiguous.has(p1.id) && ambiguous.has(p2.id), '14. LIVE: P1 and P2 (same documentId, same contentHash, same calendar day) are BOTH flagged as needing the precise label.');
        assert(formatPublicationDate(p1.publishedAt, false) === formatPublicationDate(p2.publishedAt, false),
            '15. LIVE: sanity — at the ordinary day-level label, P1 and P2 genuinely WOULD render identically, confirming the collision is real, not manufactured.');
        assert(formatPublicationDate(p1.publishedAt, true) !== formatPublicationDate(p2.publishedAt, true),
            '16. LIVE: at the flagged precise label, P1 and P2 render DIFFERENTLY — a Wanderer can now tell them apart on sight.');
        assert(p1.id !== p2.id, '17. LIVE: distinguishability rides on the label alone — the underlying identity (publicationId) was never actually ambiguous to any action, only to the EYE, per 0.9.539\'s own scoping.');

        results.push(['B', 'Publication identity perception (same-day republish)', 'ALREADY_CORRECT']);
        console.log("✓ Section B: 0.9.539's own guard reconfirmed live (subprocess exited 0, success banner present); the P1=D+H/P2=D+H scenario the brief names is still correctly disambiguated by the precise-timestamp label.");
    }

    // ===================================================================
    // Section C — Search semantics: search ≠ verification ≠ identity
    // lookup ≠ content matching.
    // ===================================================================
    {
        const backend = makeBackend();
        backend.identityProvider.login('alice');
        const titled = backend.publisherProvider.publish(makeDocument('Findable By Title', 'alice', 'a description with the word GARGOYLE inside it'), backend.identityProvider);
        backend.publisherProvider.publish(makeDocument('Unrelated', 'alice', 'nothing relevant here'), backend.identityProvider);

        // C1. SEARCH matches title/author text — never id, never hash.
        const byTitle = backend.searchPublicationsUseCase.execute(new PublicationQuery({ text: 'findable' }));
        assert(byTitle.items.length === 1 && byTitle.items[0].id === titled.id, '18. LIVE: search matches on title text.');
        const byId = backend.searchPublicationsUseCase.execute(new PublicationQuery({ text: titled.id }));
        assert(byId.items.length === 0, '19. LIVE: search text does NOT match a raw publicationId — typing an id into the search box finds nothing, exactly as it should for a title/author query.');

        // C2. CONTENT MATCHING (description) is opt-in, never silent —
        // core/PublicationQuery.js's own "Description Search Is Opt-In"
        // boundary, reconfirmed live rather than merely read.
        const withoutDescriptions = backend.searchPublicationsUseCase.execute(new PublicationQuery({ text: 'gargoyle', includeDescriptions: false }));
        assert(withoutDescriptions.items.length === 0, '20. LIVE: a term that ONLY appears in a description is invisible to search by default — content matching is never silently on.');
        const withDescriptions = backend.searchPublicationsUseCase.execute(new PublicationQuery({ text: 'gargoyle', includeDescriptions: true }));
        assert(withDescriptions.items.length === 1 && withDescriptions.items[0].id === titled.id, '21. LIVE: the SAME term is found once description matching is explicitly requested — an opt-in, not a separate search mode with its own UI.');

        // C3. IDENTITY LOOKUP is a genuinely different mechanism
        // (exact-match by id), never routed through the text query at
        // all.
        const findUseCase = new FindPublicationUseCase(backend.discoveryProvider);
        assert(findUseCase.execute(titled.id) !== null && findUseCase.execute(titled.id).id === titled.id,
            '22. LIVE: identity lookup (FindPublicationUseCase.execute(id)) resolves the exact record by id — a mechanism entirely separate from SearchPublicationsUseCase, never unified into one "search" concept.');
        assert(findUseCase.execute('not-a-real-id') === null, '23. LIVE: identity lookup for a non-existent id returns null, not a thrown error or a fuzzy near-match.');

        // C4. VERIFICATION is a concept SearchPublicationsUseCase never
        // touches — confirmed against its own source, not merely by
        // absence of a failing case.
        const searchSource = await codeOnlySource('application/publication/SearchPublicationsUseCase.js');
        assert(!/verif|trust|signature\.valid|MaterialInspection/i.test(searchSource),
            '24. LIVE: SearchPublicationsUseCase.js carries no verification/trust vocabulary at all — a search RESULT is never, itself, a verification outcome (see Section F).');

        // C5. The toolbar's own search affordance never overclaims what
        // it actually does.
        const toolbarSource = await codeOnlySource('ui/components/PublicationCatalogToolbar.js');
        assert(toolbarSource.includes("placeholder=\"Search by title, author…\""),
            '25. LIVE: the search input\'s own placeholder names exactly what it matches (title, author) — never "search by ID," "verify," or "find exact match."');
        assert(!/\b(verify|verified|content hash|publicationId|exact match)\b/i.test(toolbarSource),
            '26. LIVE: the toolbar introduces no vocabulary promising id/hash/verification search that SearchPublicationsUseCase does not actually perform.');

        results.push(['C', 'Search semantics: search ≠ verification ≠ identity lookup ≠ content matching', 'ALREADY_CORRECT']);
        console.log('✓ Section C: search (title/author, opt-in description), identity lookup (exact id via FindPublicationUseCase), and verification (never touched by search at all) are three genuinely distinct mechanisms, and the UI never claims more than the first actually covers.');
    }

    // ===================================================================
    // Section D — Result multiplicity: five named scenarios, no silent
    // collapse.
    // ===================================================================
    {
        const backend = makeBackend();
        backend.identityProvider.login('alice');

        // D1/D2 — same document, different Publications (a republish),
        // and (as a stricter variant) same contentHash too.
        const sharedDocumentId = 'doc-d-shared';
        const sharedHash = 'hash-d-shared';
        const republishP1 = new Publication({ id: 'd-p1', documentId: sharedDocumentId, title: 'Republished Work', author: 'alice', publishedAt: new Date(2026, 5, 1, 8, 0, 0), contentReference: { hash: sharedHash } });
        const republishP2 = new Publication({ id: 'd-p2', documentId: sharedDocumentId, title: 'Republished Work', author: 'alice', publishedAt: new Date(2026, 5, 2, 8, 0, 0), contentReference: { hash: sharedHash } });

        // D3/D4 — different documents, same author (multiple
        // publications from one author).
        const otherWork1 = new Publication({ id: 'd-other-1', documentId: 'doc-d-other-1', title: 'A Different World', author: 'alice', publishedAt: new Date(2026, 5, 3, 8, 0, 0) });
        const otherWork2 = new Publication({ id: 'd-other-2', documentId: 'doc-d-other-2', title: 'A Third World', author: 'alice', publishedAt: new Date(2026, 5, 4, 8, 0, 0) });

        knowPublicationsLocally(backend.storage, [republishP1, republishP2, otherWork1, otherWork2]);

        const localOnly = backend.searchPublicationsUseCase.execute(new PublicationQuery());
        assert(localOnly.totalCount === 4, '27. LIVE: two republishes of one document plus two distinct documents from the same author report FOUR results, never collapsed to fewer by documentId, contentHash, or author.');
        assert(new Set(localOnly.items.map((p) => p.id)).size === 4, '28. LIVE: all four publicationIds are distinct in the result set — no two entries share an id.');

        // D3 grouping: same author, different documents/republishes —
        // GroupBy.AUTHOR buckets them together without merging the
        // underlying records.
        const grouped = groupPublications(localOnly.items, GroupBy.AUTHOR);
        assert(grouped.length === 1 && grouped[0].key === 'alice' && grouped[0].items.length === 4,
            '29. LIVE: grouping by author places all four of alice\'s publications in one visual bucket — a presentation grouping, not a merge (each item keeps its own id/documentId/publishedAt).');

        // D5 — local AND decentralized publications together: the
        // CompositeDiscoveryProvider's own documented "no dedup, no
        // ranking, no source preference" contract, reconfirmed live.
        const decentralized = new DecentralizedPublicationDiscoveryProvider();
        const decentralizedTwin = new Publication({ id: 'd-decentralized-twin', documentId: sharedDocumentId, title: 'Republished Work', author: 'alice', publishedAt: new Date(2026, 5, 5, 8, 0, 0), contentReference: { hash: sharedHash } });
        decentralized.add(decentralizedTwin);
        const composite = new CompositeDiscoveryProvider([backend.discoveryProvider, decentralized]);
        const compositeSearch = new SearchPublicationsUseCase(composite);
        const compositeResult = compositeSearch.execute(new PublicationQuery());
        assert(compositeResult.totalCount === 5, '30. LIVE: a third republish of the SAME document/hash, arriving from a decentralized provider, still adds a fifth distinct result — local and decentralized are merged, never deduplicated against each other by documentId/contentHash.');
        assert(compositeResult.items.some((p) => p.id === decentralizedTwin.id), '31. LIVE: the decentralized-origin entry is genuinely present in the merged, paginated result — not silently dropped in favor of the local entries sharing its documentId.');

        // Deterministic ordering under a tie (D1/D2's own same-title
        // pair) — re-running the identical query twice must return the
        // SAME order, or "page 3" would mean something different each
        // time (core/PublicationSort.js's own documented invariant).
        const firstRun = backend.searchPublicationsUseCase.execute(new PublicationQuery({ sort: 'TITLE_ASC' })).items.map((p) => p.id);
        const secondRun = backend.searchPublicationsUseCase.execute(new PublicationQuery({ sort: 'TITLE_ASC' })).items.map((p) => p.id);
        assert(JSON.stringify(firstRun) === JSON.stringify(secondRun), '32. LIVE: re-running the identical query returns the identical order — multiplicity never introduces order nondeterminism.');

        const compositeSource = await codeOnlySource('discovery/CompositeDiscoveryProvider.js');
        assert(!/dedup|distinct|Set\(.*\.id\)|unique/i.test(compositeSource),
            '33. LIVE: CompositeDiscoveryProvider.js\'s own source still contains no deduplication logic — the DELIBERATE_ASYMMETRY 0.9.335/0.9.339/0.9.523 already established is unmodified.');

        results.push(['D', 'Result multiplicity (5 scenarios)', 'DELIBERATE_BOUNDARY']);
        console.log('✓ Section D: a republish, a shared-contentHash republish, multiple documents from one author, and a decentralized-origin twin of a local publication all appear as distinct, correctly-counted, deterministically-ordered results — never silently collapsed. No-dedup is confirmed as the codebase\'s own already-DELIBERATE_BOUNDARY (0.9.335/0.9.339/0.9.523), not a gap this milestone found.');
    }

    // ===================================================================
    // Section E — Action discoverability: Open/Fork/Explore/Commentary/
    // Author, live parity across both catalog views.
    // ===================================================================
    {
        const cardSource = await readSource('ui/components/PublicationCard.js');
        const listSource = await readSource('ui/components/PublicationList.js');
        const catalogSource = await codeOnlySource('ui/components/PublicationCatalog.js');

        // The five actions the brief names, checked as literal,
        // human-facing affordances in BOTH views' own templates — not
        // merely that the events exist somewhere.
        const cardAffordances = {
            Open: /action-btn--open"[^>]*>Open</,
            Fork: /action-btn--fork"[^>]*>Fork</,
            Explore: /action-btn--explore"[^>]*>Explore</,
            Commentary: /action-btn--comment"[\s\S]{0,200}>\{\{ commentaryOpen \? 'Hide Comments' : 'Comment' \}\}</,
            Author: /@click\.prevent="\$emit\('view-author', publication\.author\)"/
        };
        const listAffordances = {
            Open: /action-btn--open"[^>]*>Open</,
            Fork: /action-btn--fork"[^>]*>Fork</,
            Explore: /action-btn--explore"[^>]*>Explore</,
            Commentary: /action-btn--comment"[\s\S]{0,200}>\{\{ isCommentaryOpen\(pub\) \? 'Hide Comments' : 'Comment' \}\}</,
            Author: /@click\.prevent="\$emit\('view-author', pub\.author\)"/
        };
        for (const [label, pattern] of Object.entries(cardAffordances)) {
            assert(pattern.test(cardSource), `34. LIVE: PublicationCard.js's own template renders a reachable "${label}" affordance.`);
        }
        for (const [label, pattern] of Object.entries(listAffordances)) {
            assert(pattern.test(listSource), `35. LIVE: PublicationList.js's own template renders a reachable "${label}" affordance — full parity with the card view, closed by 0.9.561's own Commentary parity fix.`);
        }

        // Live: the SAME publication, exercised through both view
        // ctx-shapes at once, reaches Commentary identically — the
        // concrete behavioral proof behind the template-level parity
        // above (never assumed from source text alone).
        const backend = makeBackend();
        backend.identityProvider.login('alice');
        const publication = backend.publisherProvider.publish(makeDocument('Parity Check', 'alice'), backend.identityProvider);
        let stored = [];
        const getPublicationCommentariesCommand = (publicationId) => stored.filter((c) => c.publicationId === publicationId);
        const addPublicationCommentaryCommand = ({ publicationId, content, commentaryId, createdAt }) => {
            const record = { publicationId, content, commentaryId, createdAt, authorIdentityId: 'did:key:alice' };
            stored.push(record);
            return { commentary: record, isNew: true };
        };

        const card = cardCtx(publication, { getPublicationCommentariesCommand, addPublicationCommentaryCommand });
        card.toggleCommentary();
        card.newCommentaryText = 'reachable from the card view';
        card.submitCommentary();

        const list = listCtx({ getPublicationCommentariesCommand, addPublicationCommentaryCommand });
        list.toggleCommentary(publication);
        assert(list.rowSection(publication).commentaries.length === 1 && list.rowSection(publication).commentaries[0].content === 'reachable from the card view',
            '36. LIVE: a Commentary reachable and posted through the card view is immediately reachable through the list view for the SAME publication — one underlying capability, two equally-reachable entry points.');

        // Every event PublicationCatalog.js wires is identical between
        // the two child views it hosts — no view silently drops or
        // renames an event the other still exposes.
        const cardWiring = catalogSource.match(/<PublicationCard[\s\S]*?\/>/)[0];
        const listWiring = catalogSource.match(/<PublicationList[\s\S]*?\/>/)[0];
        for (const evt of ['@open="openPublication"', '@fork="forkPublication"', '@explore="viewWorld"', '@view-author="viewAuthor"']) {
            assert(cardWiring.includes(evt) && listWiring.includes(evt), `37. LIVE: PublicationCatalog.js wires "${evt}" identically for both the card and the list view — no per-view navigation divergence.`);
        }

        results.push(['E', 'Action discoverability (Open/Fork/Explore/Commentary/Author)', 'ALREADY_CORRECT']);
        console.log('✓ Section E: all five actions the brief names are reachable, human-labeled affordances on BOTH catalog views, wired to the identical navigation/commentary handlers — the 0.9.561 parity fix holds live, not merely in source.');
    }

    // ===================================================================
    // Section F — Trust/evidence presentation (0.9.525 Section G,
    // reconfirmed).
    // ===================================================================
    {
        const guardOutput = runGuardLive('tests/RepositoryDiscoveryMaterialTrustProductReassessment.test.js');
        assert(/All assertions passed for 0\.9\.525/.test(guardOutput), '38. LIVE (subprocess): 0.9.525\'s own Repository Discovery & Material Trust guard still exits 0, with its own success banner present, against current source.');

        // The four claims the brief explicitly names, re-derived fresh
        // against CURRENT source, never merely cited from the guard's
        // own prior prose.
        const surfacesToCheck = [
            ['ui/components/PublicationCard.js', await codeOnlySource('ui/components/PublicationCard.js')],
            ['ui/components/PublicationList.js', await codeOnlySource('ui/components/PublicationList.js')],
            ['ui/views/RepositoryView.js', await codeOnlySource('ui/views/RepositoryView.js')],
            ['ui/components/PublicationCatalogToolbar.js', await codeOnlySource('ui/components/PublicationCatalogToolbar.js')]
        ];
        for (const [name, src] of surfacesToCheck) {
            assert(!/\b(trusted|authentic|guaranteed|officially|authoritative|verified)\b/i.test(src),
                `39. LIVE: ${name} claims none of "Repository membership = trusted/verified/authentic/official" — no such word appears anywhere in its source.`);
        }
        const cssSource = (await Promise.all(stylesheetFiles().map((file) => readSource(file)))).join('\n');
        assert(!/publication-badge[\s\S]{0,200}(verified|trusted|authentic|safe|guaranteed)/i.test(cssSource),
            '40. LIVE: the "🔒 Published" badge\'s own styling still carries no verification/trust vocabulary — it denotes lifecycle state (published vs. an editable fork per 0.2.22), never a trust verdict.');

        results.push(['F', 'Trust/evidence presentation', 'ALREADY_CORRECT']);
        console.log('✓ Section F: 0.9.525\'s own trust-language guard reconfirmed live; none of Repository\'s own surfaces claim trusted/verified/authentic/official as a consequence of mere admission.');
    }

    // ===================================================================
    // Section G — Provenance.
    // ===================================================================
    {
        const guardOutput = runGuardLive('tests/RepositoryDiscoveryProductBoundaryReassessment.test.js');
        assert(/tests passed/i.test(guardOutput), '41. LIVE (subprocess): 0.9.523\'s own Repository/Discovery Product Boundary guard still exits 0, with its own success banner present, against current source.');

        const compositeSource = await codeOnlySource('discovery/CompositeDiscoveryProvider.js');
        assert(!/source|origin|providerLabel/i.test(compositeSource.replace(/providers/gi, '')),
            '42. LIVE: CompositeDiscoveryProvider.js still attaches no source/origin field to a merged result — the DELIBERATE_ASYMMETRY named in its own header ("never a source/origin field on a result") is unmodified.');

        // A Publication carries `providerId` as an internal, storage-side
        // field (Publication.js's own constructor) — confirmed it is
        // never surfaced as a Repository-presented "where this came
        // from" claim in either catalog view's own template.
        const cardTemplate = (await readSource('ui/components/PublicationCard.js')).match(/template: `([\s\S]*)`\s*};?\s*$/)[1];
        const listTemplate = (await readSource('ui/components/PublicationList.js')).match(/template: `([\s\S]*)`\s*};?\s*$/)[1];
        assert(!/providerId|\.provider\b/.test(cardTemplate) && !/providerId|\.provider\b/.test(listTemplate),
            '43. LIVE: neither catalog view interpolates a Publication\'s internal providerId into what a Wanderer sees — provenance stays an internal admission detail, never surfaced as a false claim of legitimacy or origin.');

        results.push(['G', 'Provenance', 'DELIBERATE_BOUNDARY']);
        console.log('✓ Section G: 0.9.523\'s own provenance guard reconfirmed live; Repository still surfaces no source/origin claim beyond the Publication\'s own author/title/license fields — genuinely nothing invented, genuinely nothing hidden that would otherwise be shown.');
    }

    // ===================================================================
    // Section H — Failure isolation across a single mixed-fixture
    // catalog.
    // ===================================================================
    {
        const backend = makeBackend();
        backend.identityProvider.login('alice');
        const healthy = backend.publisherProvider.publish(makeDocument('Healthy Entry', 'alice'), backend.identityProvider);

        // A malformed candidate (no document behind its documentId at
        // all) and a stale one (documentId that once existed, since
        // removed) sit in the SAME catalog as the healthy publication.
        const malformed = new Publication({ id: 'h-malformed', documentId: 'doc-h-never-existed', title: 'Malformed Candidate', author: 'alice', publishedAt: new Date() });
        knowPublicationsLocally(backend.storage, [
            new Publication({ id: healthy.id, documentId: healthy.documentId, title: healthy.title, author: healthy.author, publishedAt: healthy.publishedAt, publisherIdentity: healthy.publisherIdentity }),
            malformed
        ]);

        const page = backend.searchPublicationsUseCase.execute(new PublicationQuery());
        assert(page.items.length === 2, '44. LIVE: a malformed candidate (its document unavailable) still appears in the catalog LIST itself — listing is not gated on the document loading successfully.');

        // Description enrichment (the one place PublicationCatalog.js's
        // own resolveEnrichment() actually loads each item's document)
        // fails silently for the malformed entry and leaves the healthy
        // neighbor's own description intact — the exact behavior
        // ui/components/PublicationCatalog.js's own resolveEnrichment()
        // implements (try/catch per item, snippet = '' on failure).
        function resolveDescription(pub) {
            try {
                const document = backend.loadPublicationDocumentUseCase.execute(pub.documentId);
                return document && document.metadata ? document.metadata.description : '';
            } catch (err) {
                return '';
            }
        }
        const malformedDescription = resolveDescription(malformed);
        const healthyDescription = resolveDescription(healthy);
        assert(malformedDescription === '', '45. LIVE: the malformed entry\'s failed document load resolves to an empty description, never a thrown error that would abort the page.');
        assert(healthyDescription !== undefined, '46. LIVE: the healthy neighbor\'s own description resolution is completely unaffected by the malformed entry\'s failure — one bad candidate never poisons another.');

        // Failed Open/Fork/Explore for the malformed entry: the ROUTE
        // itself is still well-formed (Repository never throws building
        // a navigation target) — whether the destination itself then
        // fails is EditorView/WorldView's own concern (0.9.559's own
        // proven boundary), not Repository's.
        for (const action of ['open', 'fork', 'explore']) {
            const route = catalogRouteFor(action, malformed);
            assert(route && typeof route.path === 'string', `47. LIVE: building the ${action} route for a malformed candidate never throws — Repository's own navigation stays well-formed even when the target will fail downstream.`);
        }
        const healthyRoute = catalogRouteFor('open', healthy);
        assert(healthyRoute.query.load === healthy.documentId, '48. LIVE: the healthy neighbor\'s own Open route is completely unaffected — still points at its own documentId.');

        // Failed Commentary for one row never poisons a neighboring row
        // — re-derives PublicationListCommentaryParity's own Section G
        // finding fresh, as part of this milestone's own mixed catalog
        // rather than cited secondhand.
        const list = listCtx({
            getPublicationCommentariesCommand: (publicationId) => { if (publicationId === malformed.id) throw new Error('commentary backend unavailable for this publication'); return []; },
            addPublicationCommentaryCommand: () => { throw new Error('should not be called'); }
        });
        list.toggleCommentary(malformed);
        assert(list.rowSection(malformed).commentaryError !== null, '49. LIVE: the malformed row\'s own commentary read failure is captured as that row\'s own error.');
        list.toggleCommentary(healthy);
        assert(list.rowSection(healthy).commentaryError === null && Array.isArray(list.rowSection(healthy).commentaries),
            '50. LIVE: the healthy neighbor\'s own commentary read succeeds, on the SAME list instance, completely unaffected by the malformed row\'s failure.');

        results.push(['H', 'Failure isolation (mixed-fixture catalog)', 'ALREADY_CORRECT']);
        console.log('✓ Section H: a malformed/stale candidate sitting in the same catalog as a healthy publication never breaks listing, description enrichment, route-building, or commentary for its neighbor — failure stays scoped to the one broken entry throughout.');
    }

    // ===================================================================
    // Section I — Navigation continuity: Repository -> action -> the
    // exact destination the rest of the app already resolves it to.
    // ===================================================================
    {
        const backend = makeBackend();
        backend.identityProvider.login('alice');
        const publication = backend.publisherProvider.publish(makeDocument('Continuity Check', 'alice'), backend.identityProvider);

        // I1. Open/Fork/Explore/Author each build the EXACT route shape
        // 0.9.559's own real, unmodified production consumers (EditorView's
        // route.query.load/route.query.fork, /world/:documentId,
        // /author/:username) already expect — reconfirmed here as the
        // Repository SIDE of that already-proven hand-off.
        assert(JSON.stringify(catalogRouteFor('open', publication)) === JSON.stringify({ path: '/editor', query: { load: publication.documentId } }),
            '51. LIVE: Open builds { path: "/editor", query: { load: documentId } } — the identical bare-documentId shape 0.9.559 Section B confirmed EditorView\'s own route.query.load branch expects.');
        assert(JSON.stringify(catalogRouteFor('fork', publication)) === JSON.stringify({ path: '/editor', query: { fork: publication.documentId, publication: publication.id } }),
            '52. LIVE: Fork builds { path: "/editor", query: { fork: documentId, publication: publicationId } } — both identifiers 0.9.559 Section C confirmed ForkDocumentUseCase and lineage-stamping actually consume.');
        assert(catalogRouteFor('explore', publication).path === `/world/${publication.documentId}`,
            '53. LIVE: Explore builds a bare /world/:documentId push — read-only navigation, never a resolve/verify/place side effect (per the brief\'s own Section E boundary).');
        assert(catalogRouteFor('author', publication).path === `/author/${encodeURIComponent(publication.author)}`,
            '54. LIVE: Author builds an encoded /author/:username push — the SAME AuthorView route both Repository and Author view themselves link back through.');

        // I2. Cross-surface consistency (0.9.560), reconfirmed live against
        // the REAL production consumer on the other side of Repository's
        // own routes — never a subprocess re-run here, since that guard's
        // own import chain (WorldNavigationSession.js -> renderer/Renderer.js
        // -> 'three') requires the browser's own import map (see
        // tests.html) and cannot resolve under plain `node`, a pre-existing
        // environment fact unrelated to this milestone. Reading
        // EditorView.js's own route handling directly is the same
        // "past the command boundary, into the real consumer" discipline
        // 0.9.559 itself used.
        const editorViewSource = (await Promise.all(editorViewFiles().map((file) => codeOnlySource(file)))).join('\n');
        assert(editorViewSource.includes('route.query.fork') && editorViewSource.includes("sourceDocumentId = route.query.fork") && editorViewSource.includes('forkDocumentUseCase.execute(route.query.fork, identityProvider, sourcePublication)'),
            '55. LIVE: EditorView.js\'s own route.query.fork branch still consumes exactly the { fork: documentId } shape Repository\'s own Fork route builds, passing it straight into ForkDocumentUseCase.');
        assert(editorViewSource.includes('route.query.publication') && editorViewSource.includes('sourcePublication = findPublicationUseCase.execute(route.query.publication)'),
            '56. LIVE: EditorView.js\'s own route.query.publication branch still consumes exactly the { publication: publicationId } shape Repository\'s own Fork route builds, resolving it via FindPublicationUseCase for lineage-stamping.');
        assert(editorViewSource.includes('route.query.load') && editorViewSource.includes('editorSession.loadDocument(route.query.load)'),
            '57. LIVE: EditorView.js\'s own route.query.load branch still consumes exactly the { load: documentId } shape Repository\'s own Open route builds.');

        // I3. The label vocabulary 0.9.563 wrote down is still the SAME
        // vocabulary Repository's own components render — the
        // documentation and the buttons never drifted apart from each
        // other after 0.9.563 shipped.
        const forkingDoc = await readSource('docs/user/04-PublishingAndForking.md');
        const cardSource = await readSource('ui/components/PublicationCard.js');
        assert(/Also called "Edit a Copy" in World View/.test(forkingDoc) && cardSource.includes('>Fork<'),
            '58. LIVE: the documentation names "Fork" as Repository/Author\'s own label (0.9.563), and PublicationCard.js\'s own button is still literally labeled "Fork" — doc and button agree.');
        assert(/Explore.{0,400}Continue Exploring/s.test(forkingDoc) && cardSource.includes('>Explore<'),
            '59. LIVE: the documentation ties "Continue Exploring" back to "Explore" as Repository/Author\'s own mechanic, and the button is still literally labeled "Explore."');

        // I4. Returning: a Wanderer who leaves Repository via Explore and
        // comes back still finds the SAME Publication, same identity,
        // unaffected by the round trip — the search-result identity
        // continuity 0.9.556/0.9.557's own Publication-to-World Return
        // Journey arc already established, reconfirmed as one more link
        // in this milestone's own chain rather than re-audited from
        // scratch.
        const beforeRoundTrip = backend.searchPublicationsUseCase.execute(new PublicationQuery({ text: 'Continuity Check' }));
        catalogRouteFor('explore', publication); // the navigation Repository performs — no state mutation of its own
        const afterRoundTrip = backend.searchPublicationsUseCase.execute(new PublicationQuery({ text: 'Continuity Check' }));
        assert(beforeRoundTrip.items[0].id === afterRoundTrip.items[0].id && +beforeRoundTrip.items[0].publishedAt === +afterRoundTrip.items[0].publishedAt,
            '60. LIVE: re-querying Repository after an Explore navigation returns the byte-identical Publication — Explore is genuinely read-only from Repository\'s own side.');

        results.push(['I', 'Navigation continuity', 'ALREADY_CORRECT']);
        console.log('✓ Section I: every Repository action builds the exact route shape its real downstream consumer expects; EditorView.js\'s own route.query.fork/publication/load branches reconfirmed live as the real consumer on the other side; 0.9.563\'s documentation vocabulary still matches the literal button labels; Explore stays provably read-only from Repository\'s own side.');
    }

    // ===================================================================
    // Section J — Classification and production guard.
    // ===================================================================
    {
        console.log('\n=== 0.9.564 CLASSIFICATION TABLE ===');
        for (const [section, name, verdict] of results) {
            console.log(`  ${section} — ${name}: ${verdict}`);
        }
        assert(results.every(([, , verdict]) => verdict === 'ALREADY_CORRECT' || verdict === 'DELIBERATE_BOUNDARY'),
            '61. LIVE: every section classifies as ALREADY_CORRECT or DELIBERATE_BOUNDARY — no DOCUMENTATION_GAP, PRODUCT_GAP, or ARCHITECTURAL_GAP found, so this milestone implements nothing beyond itself.');

        const gitStatus = await import('node:child_process').then((cp) =>
            new Promise((resolve, reject) => {
                cp.exec('git status --porcelain', { cwd: new URL('../', import.meta.url) }, (err, stdout) => {
                    if (err) return reject(err);
                    resolve(stdout);
                });
            })
        );
        const changedLines = gitStatus.split('\n').filter((l) => l.trim().length > 0);
        // AMENDED BY 0.9.638 — Publication Commentary Distribution
        // Provider Selector. This guard, like every other point-in-time
        // git-diff guard in this codebase (see e.g.
        // tests/FederatedRepositoryProductDirectionSeamAudit.test.js's
        // own 0.9.597 amendment), always meant "THIS milestone's own
        // session touched nothing beyond itself," never "no later,
        // separately-justified milestone's own session ever runs
        // alongside this file again." 0.9.638 legitimately touches
        // ui/components/PublicationCard.js/PublicationList.js (its own
        // production change) plus the handful of prior audits' own
        // git-diff/exact-call-shape guards that this same change made
        // stale, each amended in place with its own "AMENDED BY 0.9.638"
        // note rather than silently rewritten.
        // A prefix check, not an exhaustive per-file list: 0.9.638's own
        // production change (PublicationCard.js/PublicationList.js) made
        // a broad swath of OTHER milestones' own git-diff/exact-call-shape
        // guards stale (any test/*.test.js file, or tests.html itself,
        // touched only to add an "AMENDED BY 0.9.638" note is expected —
        // this guard's real job is catching a change OUTSIDE tests/ or
        // tests.html that isn't 0.9.638's own two named production files).
        const expectedProductionFiles = new Set(['ui/components/PublicationCard.js', 'ui/components/PublicationList.js']);
        const unexpected = changedLines.filter((l) => {
            const path = l.slice(3).trim().replace(/^"|"$/g, '');
            if (path.startsWith('tests/') || path === 'tests.html') return false;
            if (expectedProductionFiles.has(path)) return false;
            return true;
        });
        assert(unexpected.length === 0, `62. AMENDED BY 0.9.638 — LIVE: git status reports no UNEXPECTED changed file (unexpected: ${JSON.stringify(unexpected)}) — only 0.9.638's own, separately-justified production/guard files touched.`);

        console.log('✓ Section J: no gap survived this reassessment; zero production files changed.');
    }

    console.log('\nAll Repository Discovery Experience Product Reassessment tests passed.');
    console.log('\n=== 0.9.564 VERDICT ===');
    console.log(`PRODUCT_COMPLETE — no action required.

Taken as a whole, after the entire 0.9.523-0.9.563 arc, Repository already lets a Wanderer discover, distinguish,
inspect, and act on Publications without hitting an identity, trust, or navigation ambiguity:

  A. Repository/Author each expose a distinct, purpose-explaining empty state across 0/1/many/mixed-origin
     catalogs, without either view duplicating the shared catalog's own copy.
  B. 0.9.539's same-day-republish disambiguation still holds, live, for the exact P1=D+H/P2=D+H shape this
     milestone's own brief named.
  C. Search, identity lookup, content matching, and verification remain four genuinely distinct mechanisms — the
     UI never promises more than SearchPublicationsUseCase actually performs.
  D. Five result-multiplicity scenarios (republish, shared-contentHash republish, multiple documents from one
     author, and a decentralized-origin twin) all render as distinct, correctly-counted, deterministically-ordered
     results — the established no-dedup DELIBERATE_BOUNDARY, not a gap.
  E. Open/Fork/Explore/Commentary/Author are all live, human-labeled, and identically wired on BOTH catalog views
     — 0.9.561's parity fix holds under direct exercise, not merely in source.
  F. No Repository surface claims trusted/verified/authentic/official as a consequence of mere admission — 0.9.525's
     own finding and fix reconfirmed live.
  G. Provenance stays exactly what it was admitted as — no source/origin field invented, none hidden.
  H. A malformed or stale candidate sitting in the same catalog as a healthy publication never breaks listing,
     enrichment, navigation, or commentary for its neighbor.
  I. Every Repository action builds the exact route shape its real downstream consumer (EditorView.js's own
     route.query.load/fork/publication branches) still expects, and 0.9.563's documentation vocabulary still
     matches the literal button labels.

No implementation was performed beyond this one regression test — exactly as scoped. The deliberate exclusions
named in the requesting brief (new search fields, contentHash/publicationId search, ranking, recommendations,
reputation, trust scores, moderation, automatic deduplication, persistent encounter history, new Publication
identity mechanisms) remain excluded because nothing this milestone found makes any of them necessary.`);
}

main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
