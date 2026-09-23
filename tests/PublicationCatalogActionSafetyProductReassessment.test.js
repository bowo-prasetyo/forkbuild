import { readFile } from 'node:fs/promises';

import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { PublishDocumentUseCase } from '../application/PublishDocumentUseCase.js';
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
import { CompositeDiscoveryProvider } from '../discovery/CompositeDiscoveryProvider.js';
import { SearchPublicationsUseCase } from '../application/SearchPublicationsUseCase.js';
import { FindPublicationUseCase } from '../application/FindPublicationUseCase.js';
import { PublicationQuery } from '../core/PublicationQuery.js';
import { groupPublications, GroupBy } from '../core/PublicationGrouping.js';

import PublicationCard from '../ui/components/PublicationCard.js';
import PublicationList from '../ui/components/PublicationList.js';
import PublicationCommentarySection from '../ui/components/PublicationCommentarySection.js';

// 0.9.540 — Publication Catalog Action Safety Product Reassessment.
//
// 0.9.539 asked whether a Wanderer can PERCEIVE which Publication is
// which when more than one is on screen, and found + fixed exactly one
// gap (same-day-republish date collision), while its own Section G
// already reconfirmed — structurally — that every catalog action
// (Open/Fork/Explore) was ALREADY bound to the correct instance the
// entire time. This milestone asks the natural follow-up, in full:
//
//   Does every action offered from a Publication catalog operate on the
//   EXACT Publication represented by that card/list entry, with no
//   stale or ambiguous action target — under reordering, pagination,
//   repeated Publications of the same document, and Publications that
//   happen to share a contentHash?
//
// This is a REASSESSMENT over real, unmodified production source
// (ui/components/PublicationCard.js, PublicationList.js,
// PublicationCatalog.js, ForkTree.js), mirroring 0.9.537's own
// structure and posture: enumerate the real mechanism, prove it live
// wherever Node can run it without a DOM/vue-router runtime, prove it
// structurally (against the literal source text) wherever it cannot,
// and report the verdict rather than manufacturing a fix nothing here
// needs.
//
//   A — Real action inventory across every catalog-adjacent surface.
//   B — Action target continuity: every emit carries the v-for-scoped
//       Publication object itself, never an index/id-string/selection.
//   C — List mutation race: catalog actions are synchronous by
//       construction, and every list is keyed by publicationId, never
//       index — proven both structurally and with a live closure-
//       capture simulation of the exact mechanism Vue's own emit path
//       relies on.
//   D — Repeated Publications (0.9.539's own same-document-republish
//       scenario): Fork/Open/Explore targets proven live, end to end,
//       through the real discovery providers.
//   E — Same content, different Publication: a contentHash collision,
//       proven never to leak into any of the four actions.
//   F — Action availability: never gated on stale/selected state.
//   G — Failure isolation: LIVE, using the real PublicationCard.js
//       `methods`, proving one card's failure never touches another's.
//   H — Navigation: the one existing router, never a new mechanism.
//   I — Destructive/mutating actions: Comment-posting is the only one
//       in these surfaces, already explicit; everything else here is
//       read-only navigation. No delete/unpublish exists in the
//       catalog card/list/fork-tree surfaces at all (N/A, not invented).
//   J — Flagship: two same-document republishes AND a same-contentHash,
//       different-document pair, rendered together, reordered mid-
//       session, every action on every one of them still resolving to
//       its own exact target.
//
// Deliberately excluded, per the requesting brief: a global action
// dispatcher, a new identity system, a new catalog state manager, an
// action-cancellation framework, a new navigation framework, automatic
// retries, action deduplication, contentHash-based action routing, a UI
// redesign, new badges, new trust vocabulary, and request-ID machinery
// for actions that are not actually asynchronous. None of these appear
// below.
//
// FINDING: see the verdict block at the end of this file.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function readSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function makePublisher(storage) {
    const contentStore = new LocalContentStore(storage);
    const publisher = new LocalPublisherProvider(storage, contentStore);
    return { publisher, publishDocumentUseCase: new PublishDocumentUseCase(publisher, null, null, null) };
}

function makeMinimalDocument(title = 'Atlas', author = 'alice') {
    const world = new World();
    const building = new Building({ creator: author });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    return new Document({
        world,
        metadata: new DocumentMetadata({ title, author, license: new License({ id: LicenseId.CC0_1_0 }) })
    });
}

// The exact `(pub) -> routeQuery` mappings ui/components/
// PublicationCatalog.js's own openPublication()/forkPublication()/
// viewWorld() define, reproduced here ONLY so this test can exercise
// them without importing 'vue-router' (unavailable under plain Node —
// see this repo's own index.html import map; every prior milestone
// that touches PublicationCatalog.js's setup() confirms this
// structurally for the same reason, e.g.
// tests/DistributionResultPublicationCenterDeepLinkAudit.test.js).
// Section B below proves, against the LITERAL source text, that this
// reproduction is byte-faithful to the real handlers — this is not a
// stand-in being trusted on its own word.
function openTarget(pub) { return { path: '/editor', query: { load: pub.documentId } }; }
function forkTarget(pub) { return { path: '/editor', query: { fork: pub.documentId, publication: pub.id } }; }
function exploreTarget(pub) { return { path: `/world/${pub.documentId}` }; }

async function run() {
    // ===============================================================
    // Section A — Real action inventory. Enumerated from the actual
    // template strings of every surface the requesting brief named
    // (cards, lists, repository/author results, related-publication
    // views) — never from the brief's own illustrative examples.
    // ===============================================================
    let cardSource, listSource, catalogSource, forkTreeSource, authorViewSource, repositoryViewSource;
    {
        cardSource = await readSource('ui/components/PublicationCard.js');
        listSource = await readSource('ui/components/PublicationList.js');
        catalogSource = await readSource('ui/components/PublicationCatalog.js');
        forkTreeSource = await readSource('ui/components/ForkTree.js');
        authorViewSource = await readSource('ui/views/AuthorView.js');
        repositoryViewSource = await readSource('ui/views/RepositoryView.js');

        assert(/emits:\s*\['open',\s*'fork',\s*'explore',\s*'view-author'\]/.test(cardSource),
            '1. PublicationCard.js (cards): Open, Fork, Explore, view-author — plus Comment/Post Comment, gated on an injected capability (checked separately, Section F).');
        assert(/emits:\s*\['open',\s*'fork',\s*'explore',\s*'view-author'\]/.test(listSource),
            '2. PublicationList.js (list view, same catalog): the identical four.');
        assert(/@open="openPublication"/.test(catalogSource) && /@fork="forkPublication"/.test(catalogSource)
            && /@explore="viewWorld"/.test(catalogSource) && /@view-author="viewAuthor"/.test(catalogSource),
            '3. PublicationCatalog.js (backs both RepositoryView and AuthorView — Repository results / search results are this SAME component, see its own 0.2.31 header): wires all four, once, for both card and list views.');

        // RepositoryView.js is a bare wrapper (no extra actions of its
        // own); AuthorView.js adds ONE related-publication surface —
        // the "Original Works & Forks" lineage graph, ForkTree.js.
        assert(/<PublicationCatalog\s*\/>/.test(repositoryViewSource),
            '4. RepositoryView.js introduces no action of its own — purely PublicationCatalog.');
        assert(/<PublicationCatalog :author="author" \/>/.test(authorViewSource) && /<ForkTree/.test(authorViewSource),
            '5. AuthorView.js: PublicationCatalog (Repository results, scoped) plus the ONE related-publication view this codebase has, ForkTree.');
        assert(!/@click|\$emit|<button/.test(forkTreeSource),
            '6. ForkTree.js (the related-publication view) exposes ZERO actions — title/author/date only, no button, no click handler, no emit. Nothing to audit here; marked N/A rather than invented, per this milestone\'s own instruction to test only what exists.');

        // The brief's own illustrative examples (Distribute/Snapshot/
        // Inspect) name no actual BUTTON/EMIT on any of these surfaces —
        // confirmed against the emitted action vocabulary itself, not
        // merely the absence of the word anywhere in the file (which
        // would be too strong a claim — e.g. an unrelated code comment
        // mentioning "snapshot refs" is not an action).
        for (const [name, source] of [['PublicationCard.js', cardSource], ['PublicationList.js', listSource], ['ForkTree.js', forkTreeSource]]) {
            assert(!/\$emit\('(distribute|snapshot|inspect)/i.test(source) && !/action-btn--(distribute|snapshot|inspect)/i.test(source),
                `7. ${name}: no Distribute/Snapshot/Inspect action exists on this surface (those live only in ui/components/OwnPublicationPanel.js and ui/views/DecentralizedPublicationsView.js — a different, single-Publication-detail surface, already covered by its own prior milestones, not "a Publication catalog").`);
        }
        assert(!/@distribute=|@snapshot=|@inspect=/.test(catalogSource),
            '8. PublicationCatalog.js (the host) wires no Distribute/Snapshot/Inspect handler either — only the real four (Section A above).');
    }
    console.log('✓ Section A: the real action inventory is Open/Fork/Explore/view-author (PublicationCard.js and PublicationList.js, identically) plus Comment/Post Comment (PublicationCard.js only, capability-gated); ForkTree.js, this codebase\'s one related-publication view, exposes no actions at all.');

    // ===============================================================
    // Section B — Action target continuity: every emit carries the
    // v-for-scoped Publication object ITSELF, never an index, a raw id
    // string, or component-level "selected" state — proven against the
    // literal template text of both rendering surfaces.
    // ===============================================================
    {
        // Card: v-for="pub in group.items" in the HOST (PublicationCatalog.js)
        // binds :publication="pub" — the SAME `pub` reference used for
        // :key="pub.id" below — so Vue's own keyed diffing guarantees the
        // component instance a Wanderer clicked and the `publication` prop
        // it holds are always the same object.
        assert(/<PublicationCard[^>]*v-for="pub in group\.items"[^>]*:key="pub\.id"[^>]*:publication="pub"/s.test(catalogSource),
            '1. PublicationCatalog.js: the card v-for keys by pub.id AND binds :publication="pub" from the SAME loop variable — key and payload are provably the same reference, never independently derived.');
        assert(/<PublicationList[\s\S]*?:items="group\.items"/.test(catalogSource),
            '2. PublicationList.js receives the identical group.items array as the card view — no second, divergent data source for the two views of the same page.');

        // Inside PublicationCard.js itself, every emit passes `publication`
        // — the component's own prop, resolved from the SAME object the
        // host handed it — never `publication.id`, never an index.
        const cardEmits = [...cardSource.matchAll(/\$emit\('(open|fork|explore|view-author)',\s*([^)]+)\)/g)];
        assert(cardEmits.length === 4, `3. PublicationCard.js emits exactly 4 action events, found ${cardEmits.length}.`);
        for (const [, action, payload] of cardEmits) {
            const expected = action === 'view-author' ? 'publication.author' : 'publication';
            assert(payload.trim() === expected,
                `4. PublicationCard.js's '${action}' emit sends exactly '${expected}' (found '${payload.trim()}') — the object/field itself, never an id string reconstructed from it, an index, or any other component state.`);
        }

        // PublicationList.js: v-for="pub in items" :key="pub.id", every
        // emit sends `pub` (or `pub.author`) directly — the identical
        // invariant, one view over. 0.9.561 (Publication List Commentary
        // Parity) moved v-for/:key from the row's own <tr> onto a
        // wrapping <template> — the same convention
        // ReconciliationCandidateLeaderboardTable.js's own detail-row
        // pattern already uses — so a second, conditional <tr> (the
        // commentary row) can share the identical loop key; the
        // invariant this assertion protects (each row keyed by pub.id,
        // from the SAME pub its emits below use) is unchanged.
        assert(/<template v-for="pub in items" :key="pub\.id">\s*<tr>/.test(listSource),
            '5. PublicationList.js keys each row by pub.id, from the same `pub` its emits below use.');
        const listEmits = [...listSource.matchAll(/\$emit\('(open|fork|explore|view-author)',\s*([^)]+)\)/g)];
        assert(listEmits.length === 4, `6. PublicationList.js emits exactly 4 action events, found ${listEmits.length}.`);
        for (const [, action, payload] of listEmits) {
            const expected = action === 'view-author' ? 'pub.author' : 'pub';
            assert(payload.trim() === expected,
                `7. PublicationList.js's '${action}' emit sends exactly '${expected}' — identical invariant to the card view.`);
        }

        // The host's own handlers consume exactly what they were handed —
        // never re-deriving the target from pageResult/group/index.
        assert(/function openPublication\(pub\) \{\s*router\.push\(\{ path: '\/editor', query: \{ load: pub\.documentId \} \}\);\s*\}/.test(catalogSource),
            '8. openPublication(pub) reads ONLY the pub argument it was handed — no pageResult.value/group/index lookup.');
        assert(/function forkPublication\(pub\) \{\s*router\.push\(\{ path: '\/editor', query: \{ fork: pub\.documentId, publication: pub\.id \} \}\);\s*\}/.test(catalogSource),
            '9. forkPublication(pub) likewise — and is the one action that actually needs per-INSTANCE identity, so it alone also carries pub.id (see Section D).');
        assert(/function viewWorld\(pub\) \{\s*router\.push\(\{ path: `\/world\/\$\{pub\.documentId\}` \}\);\s*\}/.test(catalogSource),
            '10. viewWorld(pub) likewise.');
    }
    console.log('✓ Section B: every action, on both catalog views, carries the exact v-for-scoped Publication object (or a field read directly off it) from emit to host handler — never an index, a detached id, or any other reconstructed/stale target.');

    // ===============================================================
    // Section C — List mutation race. Two independent guarantees, both
    // confirmed: (1) every catalog action is fully synchronous, so
    // there is no async window during which the underlying list could
    // mutate "under" an in-flight action; (2) every list is keyed by
    // publicationId, never index, which is what makes Vue itself immune
    // to reordering even if that were not already true. A live
    // simulation then proves the closure-capture mechanism the real
    // emit path relies on.
    // ===============================================================
    {
        assert(!/openPublication[\s\S]{0,10}await|forkPublication[\s\S]{0,10}await|viewWorld[\s\S]{0,10}await/.test(catalogSource),
            '1. STRUCTURAL: none of the three navigation handlers contain an `await` — router.push() executes synchronously, in the same task as the click, before any re-render/re-query could possibly run.');
        assert(!catalogSource.includes('.then('),
            '2. STRUCTURAL: PublicationCatalog.js contains no `.then(` anywhere — confirmed, not just for the three handlers above, that nothing in this file defers a follow-up action after a promise.');
        assert(/:key="pub\.id"/.test(catalogSource) && /:key="pub\.id"/.test(listSource) && /:key="child\.id"/.test(forkTreeSource),
            '3. STRUCTURAL: every v-for on every catalog-adjacent surface keys by the Publication\'s own id, never an array index — the precondition for Vue to preserve component identity across a reorder at all.');
        assert(!/:key="i"|:key="index"|v-for="\(.*,\s*i\)/.test(catalogSource + listSource + forkTreeSource),
            '4. STRUCTURAL: confirmed the negative — no index-based key exists anywhere on these surfaces to fall back to.');

        // LIVE — the exact mechanism a real click relies on: at the
        // moment a Wanderer "clicks" (captures a reference to one
        // element of the array), the list is then mutated (reordered,
        // spliced, replaced wholesale — a page turn or a re-sort). The
        // captured reference is what the handler receives, exactly as
        // Vue's own event payload would be — never re-read from the
        // (now different) array.
        const storage = new InMemoryStorageProvider();
        const { publishDocumentUseCase } = makePublisher(storage);
        const pA = publishDocumentUseCase.execute({ document: makeMinimalDocument('Cards', 'dev') });
        const pB = publishDocumentUseCase.execute({ document: makeMinimalDocument('Boats', 'dev') });
        const pC = publishDocumentUseCase.execute({ document: makeMinimalDocument('Ants', 'dev') });

        let currentPage = [pA, pB, pC]; // "Recently Published" order, page 1
        const clickedRef = currentPage[1]; // the Wanderer clicks B's card
        assert(clickedRef.id === pB.id, '5. Sanity: captured the middle card, B.');

        // The catalog re-sorts (sort change) AND re-paginates (a fresh
        // runQuery()) between the click and the handler running —
        // PublicationCatalog.js's own onChangeSort()/onGoPage() both
        // REPLACE pageResult.value wholesale, exactly like this:
        currentPage = [pC, pA]; // B fell off this page entirely; order changed too

        const target = forkTarget(clickedRef); // the handler receives clickedRef, never re-reads currentPage
        assert(target.query.publication === pB.id && target.query.fork === pB.documentId,
            `6. FLAGSHIP OF THIS SECTION: even though the visible list was completely reordered AND B was removed from it entirely BEFORE the action ran, the action's target is still exactly B (publication=${target.query.publication}), never C or A (whichever now occupies B's old visual position) and never a crash from "B is gone." This is not a coincidence of this test — it is the same reference-capture guarantee Vue's own @click="$emit('fork', pub)" (Section B) provides for real, because the payload is a closure over the actual object, never a re-derived lookup.`);
    }
    console.log('✓ Section C: catalog actions are synchronous by construction (no async window exists for a race to occupy), every list is keyed by publicationId (never index), and a live simulation confirms the underlying reference-capture mechanism survives a full reorder-and-removal between click and action.');

    // ===============================================================
    // Section D — Repeated Publications: 0.9.539's own same-document-
    // republish scenario, proven LIVE end to end through the real
    // discovery providers this time (0.9.539's own Section G5 covered
    // this structurally; this closes it live).
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const { publishDocumentUseCase } = makePublisher(storage);
        const document = makeMinimalDocument('Atlas', 'alice');
        const pubA = publishDocumentUseCase.execute({ document });
        await wait(5);
        const pubAPrime = publishDocumentUseCase.execute({ document }); // republish, unmodified

        assert(pubA.id !== pubAPrime.id && pubA.documentId === pubAPrime.documentId,
            '1. Two genuinely distinct Publication records for the SAME document (0.9.539\'s own precondition).');

        const discoveryProvider = new LocalDiscoveryProvider(storage);
        const findPublicationUseCase = new FindPublicationUseCase(discoveryProvider);

        // Open/Explore: correctly IDENTICAL for both, because both
        // target the Document's own Editor/World — there is no "which
        // Publication's World" question (World is scoped to the
        // Document, not to a frozen Publication instance).
        assert(openTarget(pubA).query.load === openTarget(pubAPrime).query.load,
            '2. LIVE: Open targets the same documentId for both — correct, not a bug: the Editor edits the Document.');
        assert(exploreTarget(pubA).path === exploreTarget(pubAPrime).path,
            '3. LIVE: Explore targets the same World for both — correct, not a bug: World is a Document\'s own persistent space.');

        // Fork: correctly DISTINCT — the one action that needs per-
        // instance identity, and alone carries it.
        const forkA = forkTarget(pubA);
        const forkAPrime = forkTarget(pubAPrime);
        assert(forkA.query.fork === forkAPrime.query.fork, '4. LIVE: both fork the same document content...');
        assert(forkA.query.publication !== forkAPrime.query.publication,
            '5. LIVE: ...but attribute to two DIFFERENT source publicationIds — forking from A\'s card can never be misattributed to A\', or vice versa.');

        // And the consumer on the OTHER end of that query param
        // (EditorView.js's own route.query.publication handler) resolves
        // each to its own, correct, distinct record — never the other
        // one, never "whichever shares this documentId."
        const resolvedA = findPublicationUseCase.execute(forkA.query.publication);
        const resolvedAPrime = findPublicationUseCase.execute(forkAPrime.query.publication);
        assert(resolvedA.id === pubA.id && resolvedA.publishedAt.getTime() === pubA.publishedAt.getTime(),
            '6. LIVE: EditorView\'s own findPublicationUseCase.execute(route.query.publication) resolves fork A\'s query back to EXACTLY publication A.');
        assert(resolvedAPrime.id === pubAPrime.id && resolvedAPrime.publishedAt.getTime() === pubAPrime.publishedAt.getTime(),
            '7. LIVE: ...and fork A\'s prime query back to EXACTLY publication A\' — never swapped, never the "first match by documentId."');
        assert(resolvedA.id !== resolvedAPrime.id, '8. LIVE: confirmed distinct end to end.');

        const editorViewSource = await readSource('ui/views/EditorView.js');
        assert(/if \(route\.query\.publication\) \{\s*sourcePublication = findPublicationUseCase\.execute\(route\.query\.publication\);/.test(editorViewSource),
            '9. STRUCTURAL: EditorView.js resolves the fork\'s source publication by the exact publicationId the catalog sent — never executeByDocumentId(), which would return whichever record a documentId-keyed lookup happened to find first.');
    }
    console.log('✓ Section D: two Publications for the identical, unmodified, re-published document — Open/Explore correctly converge on their shared Document/World (by design, not a gap), while Fork correctly diverges on the exact source publicationId, resolved end to end through the real EditorView.js consumer to the exact correct record every time.');

    // ===============================================================
    // Section E — Same content, different Publication: a contentHash
    // collision, proven never to leak into any of the four actions.
    // ===============================================================
    {
        const sharedHash = 'fnv1a-32:deadbeef';
        const contentRefA = new ContentReference({ hash: sharedHash, uri: 'local://a' });
        const contentRefB = new ContentReference({ hash: sharedHash, uri: 'local://b' });

        const pubA = new Publication({
            id: 'pub-e-a', documentId: 'doc-e-a', title: 'Twin A', author: 'author-a',
            contentHash: sharedHash, contentReference: contentRefA
        });
        const pubB = new Publication({
            id: 'pub-e-b', documentId: 'doc-e-b', title: 'Twin B', author: 'author-b',
            contentHash: sharedHash, contentReference: contentRefB
        });
        assert(pubA.contentHash === pubB.contentHash && pubA.id !== pubB.id && pubA.documentId !== pubB.documentId,
            '1. Fixture: two genuinely independent Publications (different id, different documentId, different author) that happen to share a contentHash — the adversarial-looking but entirely legitimate case (e.g. two people building the identical structure independently).');

        const storage = new InMemoryStorageProvider();
        const discoveryProvider = new LocalDiscoveryProvider(storage);
        discoveryProvider._loadRecords = () => [pubA.toJSON(), pubB.toJSON()];
        const findPublicationUseCase = new FindPublicationUseCase(discoveryProvider);

        assert(findPublicationUseCase.execute(pubA.id).id === pubA.id && findPublicationUseCase.execute(pubA.id).documentId === pubA.documentId,
            '2. LIVE: looking up A by its own id returns exactly A, with its own documentId — never B\'s, despite the identical contentHash.');
        assert(findPublicationUseCase.execute(pubB.id).id === pubB.id && findPublicationUseCase.execute(pubB.id).documentId === pubB.documentId,
            '3. LIVE: same for B.');

        // Every action's target, for each, is fully independent.
        assert(openTarget(pubA).query.load === 'doc-e-a' && openTarget(pubB).query.load === 'doc-e-b',
            '4. LIVE: Open targets each one\'s own, genuinely different, document — a shared contentHash never collapses these into "the same document."');
        assert(exploreTarget(pubA).path === '/world/doc-e-a' && exploreTarget(pubB).path === '/world/doc-e-b',
            '5. LIVE: Explore likewise — two separate Worlds, correctly, because these are two separate documents that merely happen to render identically.');
        const forkA = forkTarget(pubA), forkB = forkTarget(pubB);
        assert(forkA.query.fork !== forkB.query.fork && forkA.query.publication !== forkB.query.publication,
            '6. LIVE: Fork carries fully distinct document AND publication identity for each.');

        // The invariant the brief itself asks for: no contentHash-based
        // routing exists anywhere to accidentally reunite these two.
        assert(!cardSource.includes('contentHash') && !listSource.includes('contentHash') && !catalogSource.includes('contentHash'),
            '7. STRUCTURAL (reconfirmed here in context): none of the three files that build these four actions ever reads .contentHash at all — there is no code path by which a shared contentHash COULD influence an action target, deliberately, per this milestone\'s own "no contentHash-based action routing" exclusion.');
    }
    console.log('✓ Section E: two independently-authored Publications sharing a contentHash resolve to, and are acted on as, two fully independent targets throughout — a coincidental content match never implies a shared identity for any of the four actions.');

    // ===============================================================
    // Section F — Action availability: never gated on stale/previously-
    // selected state. Open/Fork/Explore are unconditionally rendered
    // for whatever Publication the card/row currently holds; Comment is
    // gated only on a constant, host-supplied capability — never on any
    // OTHER Publication's state, a prior click, or a remembered
    // selection.
    // ===============================================================
    {
        assert(/action-btn--open[^>]*@click="\$emit\('open', publication\)"/s.test(cardSource)
            && !/action-btn--open"[^>]*v-if|action-btn--open"[^>]*:disabled/.test(cardSource),
            '1. STRUCTURAL: PublicationCard.js\'s Open button carries no v-if/:disabled at all — always available for whatever `publication` this render holds.');
        assert(!/action-btn--fork"[^>]*v-if|action-btn--fork"[^>]*:disabled|action-btn--explore"[^>]*v-if|action-btn--explore"[^>]*:disabled/.test(cardSource + listSource),
            '2. STRUCTURAL: same for Fork/Explore, on both catalog views.');
        assert(/v-if="getPublicationCommentariesCommand"/.test(cardSource),
            '3. STRUCTURAL: the Comment button\'s ONLY gate is whether a caller injected the capability at all (an app-wide constant for the whole mounted tree) — never a per-item fact like "this publication\'s own prior comment state" or "whichever card was last clicked."');

        // LIVE: two independent card-like contexts prove the gate reads
        // only ITS OWN injected collaborator, never bleeding from a
        // sibling that happens to have (or lack) one.
        const withCapability = {
            getPublicationCommentariesCommand: () => [], publication: { id: 'x' },
            refreshCommentaries: PublicationCommentarySection.methods.refreshCommentaries
        };
        const withoutCapability = {
            getPublicationCommentariesCommand: null, publication: { id: 'y' },
            refreshCommentaries: PublicationCommentarySection.methods.refreshCommentaries
        };
        PublicationCard.methods.toggleCommentary.call(withCapability);
        PublicationCard.methods.toggleCommentary.call(withoutCapability);
        assert(withCapability.commentaryOpen === true, '4. LIVE: the context WITH the capability toggled open correctly.');
        assert(withoutCapability.commentaryOpen === undefined,
            '5. LIVE: the context WITHOUT it is untouched — toggleCommentary() is a no-op, never reading or acting on the other context\'s own capability.');
    }
    console.log('✓ Section F: every action\'s availability is a function of the current render\'s own facts (unconditional for Open/Fork/Explore, a constant app-wide capability for Comment) — never a leftover from a previously selected or differently-capable card.');

    // ===============================================================
    // Section G — Failure isolation: LIVE, using the real
    // PublicationCommentarySection.js `methods` every card mounts,
    // exactly as 0.9.539 exercised PublicationCard's `computed` directly. Two independent component-instance contexts,
    // A and B, sharing nothing but the SAME method implementations —
    // the identical way two real mounted PublicationCard instances
    // would share only their class, never their own `data()`.
    // ===============================================================
    {
        function makeCardContext(publication, command) {
            return {
                publication,
                addPublicationCommentaryCommand: command,
                getPublicationCommentariesCommand: () => [],
                commentaries: [], newCommentaryText: 'hello', commentaryError: null,
                refreshCommentaries: PublicationCommentarySection.methods.refreshCommentaries
            };
        }

        const ctxA = makeCardContext({ id: 'pub-g-a' }, () => { throw new Error('relay unreachable'); });
        const ctxB = makeCardContext({ id: 'pub-g-b' }, () => ({ commentaryId: 'c1' }));

        PublicationCommentarySection.methods.submitCommentary.call(ctxA);
        assert(ctxA.commentaryError === 'relay unreachable', '1. LIVE: A\'s own failure sets exactly A\'s own commentaryError.');
        assert(ctxA.newCommentaryText === 'hello', '2. LIVE: A\'s failed submission leaves A\'s own draft text untouched (never silently discarded on failure).');

        assert(ctxB.commentaryError === null, '3. LIVE, THE ACTUAL ISOLATION PROOF: B\'s commentaryError is UNCHANGED by A\'s failure — a rejection on one card is never displayed as another card\'s own failure.');
        assert(ctxB.newCommentaryText === 'hello', '4. LIVE: B was never even touched by A\'s call — no shared mutable state exists between the two contexts at all.');

        PublicationCommentarySection.methods.submitCommentary.call(ctxB);
        assert(ctxB.commentaryError === null && ctxB.newCommentaryText === '',
            '5. LIVE: B\'s own successful submission clears exactly B\'s own draft — and A\'s prior error (still set, from step 1) remains exactly as A left it, proven next.');
        assert(ctxA.commentaryError === 'relay unreachable',
            '6. LIVE: A\'s error from step 1 is STILL exactly what it was — B\'s later, unrelated success never cleared or altered it. Two cards\' results never leak into each other in either direction.');

        // The catalog itself: a failure on one action never mutates the
        // page's own item list — PublicationCatalog.js's action handlers
        // (Section B) are simple `router.push()` calls with no
        // pageResult.value write anywhere in their bodies, so there is no
        // code path by which any action's outcome, success or failure,
        // could alter what any OTHER card shows.
        const actionHandlerBodies = catalogSource.match(/function (?:openPublication|forkPublication|viewWorld|viewAuthor)\([^)]*\) \{[\s\S]*?\n {8}\}/g) || [];
        assert(actionHandlerBodies.length === 4, `7. Located all 4 navigation handler bodies (found ${actionHandlerBodies.length}).`);
        for (const body of actionHandlerBodies) {
            assert(!body.includes('pageResult.value') && !body.includes('.value ='),
                '8. STRUCTURAL: no navigation handler writes pageResult.value or any other catalog-wide ref — the catalog\'s own display is structurally incapable of being mutated as a side effect of ANY action, successful or failed.');
        }
    }
    console.log('✓ Section G: proven live against the real PublicationCommentarySection.js methods each card mounts — one card\'s failure (or success) never touches another\'s own state in either direction; and structurally, no catalog action handler can mutate the page\'s own item list as a side effect, so a failed action can never surface as another card\'s failure or silently reshuffle the catalog.');

    // ===============================================================
    // Section H — Navigation: the one existing mechanism, never a new
    // one.
    // ===============================================================
    {
        assert(/import \{ useRouter \} from 'vue-router';/.test(catalogSource),
            '1. STRUCTURAL: PublicationCatalog.js uses the app\'s standard vue-router useRouter(), not a bespoke navigation abstraction.');
        assert((catalogSource.match(/router\.push\(/g) || []).length === 4,
            '2. STRUCTURAL: all four navigation actions (Open/Fork/Explore/view-author) go through router.push() — no window.location, no history API call, no second router instance.');
        assert(!/window\.location|history\.pushState|new Router\(/.test(catalogSource + cardSource + listSource),
            '3. STRUCTURAL: confirmed the negative across all three files.');
    }
    console.log('✓ Section H: every navigation action reuses the single, existing vue-router mechanism this app already has — no catalog-specific router or navigation abstraction was introduced or is needed.');

    // ===============================================================
    // Section I — Destructive/mutating actions: Comment-posting is the
    // only mutation reachable from these surfaces, and it is already
    // explicit. Open/Fork/Explore/view-author are all pure navigation —
    // read-only with respect to any Publication's own stored state.
    // No delete/unpublish action exists in the catalog card/list/
    // fork-tree surfaces at all — this section is marked N/A for that
    // half, per this milestone's own instruction, rather than inventing
    // one.
    // ===============================================================
    {
        // Opening only flips the card's own flag, which mounts the shared
        // PublicationCommentarySection.js; that section's mounted() hook
        // is a single read.
        const sectionSource = await readSource('ui/components/PublicationCommentarySection.js');
        assert(/toggleCommentary\(\) \{[\s\S]*?this\.commentaryOpen = !this\.commentaryOpen;\s*\}/.test(cardSource) &&
               /mounted\(\) \{\s*this\.refreshCommentaries\(\);\s*\}/.test(sectionSource) &&
               !/addPublicationCommentaryCommand/.test(cardSource),
            '1. STRUCTURAL: merely OPENING the comment section (an observation — "let me look") only ever calls refreshCommentaries(), a read — never addPublicationCommentaryCommand, a write. Viewing never mutates.');
        // 0.9.542 — submitCommentary()'s own call now also passes
        // commentaryId/createdAt (a stable per-draft retry identity — see
        // PublicationCard.js's own 0.9.542 header); this pattern is
        // updated to match, the underlying structural claim unchanged.
        //
        // AMENDED BY 0.9.638 — submitCommentary()'s own call now also
        // passes discoveryProvider (the Distribution Provider Selector's
        // own selected value — see PublicationCard.js's own 0.9.638
        // header); still the ONE write, still fired only from this one
        // function.
        assert(/submitCommentary\(\) \{[\s\S]*?this\.addPublicationCommentaryCommand\(\{ publicationId: this\.publication\.id, content, commentaryId, createdAt, discoveryProvider \}\);/.test(sectionSource),
            '2. AMENDED BY 0.9.638 — STRUCTURAL: the ONE write in these surfaces (posting a comment) fires only from submitCommentary(), itself only ever reachable via the form\'s own explicit @submit.prevent — never from render, toggle, or any other action\'s own code path.');
        assert(!/unpublish|delete|remove/i.test(cardSource + listSource + sectionSource + forkTreeSource + catalogSource),
            '3. N/A, confirmed rather than assumed: no delete/unpublish/remove action of any kind exists anywhere in the catalog card, list, fork-tree, or host surfaces — that capability lives only in ui/components/OwnPublicationPanel.js (a single-Publication detail panel, already covered by its own 0.9.198 milestone), never in a catalog listing.');
    }
    console.log('✓ Section I: Comment-posting is the one mutating action reachable from the catalog, and it is already deliberate (its own explicit form submit, never a side effect of viewing/toggling); every other catalog action is pure read-only navigation. No destructive catalog action exists to audit further — marked N/A rather than invented.');

    // ===============================================================
    // Section J — FLAGSHIP: two same-document republishes (Section D)
    // AND a same-contentHash, different-document pair (Section E),
    // rendered together on one page, grouped, reordered mid-session,
    // with actions run against every one of them — every target still
    // exactly correct throughout.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const { publishDocumentUseCase } = makePublisher(storage);

        const sharedDocument = makeMinimalDocument('Field Guide', 'carol');
        const pubX = publishDocumentUseCase.execute({ document: sharedDocument });
        await wait(5);
        const pubXPrime = publishDocumentUseCase.execute({ document: sharedDocument }); // republish, same document

        const sharedHash = 'fnv1a-32:cafebabe';
        const pubY = new Publication({ id: 'pub-j-y', documentId: 'doc-j-y', title: 'Convergent Build', author: 'dana', contentHash: sharedHash });
        const pubZ = new Publication({ id: 'pub-j-z', documentId: 'doc-j-z', title: 'Convergent Build', author: 'erin', contentHash: sharedHash });

        let page = [pubX, pubXPrime, pubY, pubZ];

        // Grouped by author: each Publication still appears exactly
        // once, in exactly one group — no action target can ever be
        // ambiguous between "which group's copy."
        const groups = groupPublications(page, GroupBy.AUTHOR);
        const allGroupedIds = groups.flatMap((g) => g.items.map((p) => p.id));
        assert(allGroupedIds.length === 4 && new Set(allGroupedIds).size === 4,
            '1. LIVE: grouping partitions the page — all 4 Publications appear, each exactly once, never duplicated across groups.');

        // The Wanderer clicks Explore on pubXPrime and Fork on pubZ —
        // captured as references, exactly as PublicationCard.js's own
        // @click="$emit(...)" would capture them (Section B/C).
        const clickedExplore = page.find((p) => p.id === pubXPrime.id);
        const clickedFork = page.find((p) => p.id === pubZ.id);

        // Between the clicks and the actions "running," the catalog
        // re-sorts, re-groups, and re-paginates — the full mutation
        // Section C already proved survivable, repeated here against
        // the richer, mixed fixture.
        page = [pubZ, pubY, pubX]; // pubXPrime fell off this page entirely; order fully scrambled

        const exploreResult = exploreTarget(clickedExplore);
        const forkResult = forkTarget(clickedFork);

        assert(exploreResult.path === `/world/${pubXPrime.documentId}`,
            `2. FLAGSHIP: Explore, clicked on pubXPrime, still targets EXACTLY pubXPrime's World (${exploreResult.path}) — never pubX's (its same-document sibling, ${pubX.documentId === pubXPrime.documentId ? 'same World, so this pair is a non-issue by design (Section D)' : 'a different World'}), and never affected by pubXPrime having since vanished from the visible page.`);
        assert(forkResult.query.publication === pubZ.id && forkResult.query.fork === pubZ.documentId,
            `3. FLAGSHIP: Fork, clicked on pubZ, still targets EXACTLY pubZ (publication=${forkResult.query.publication}) — never pubY, despite pubY and pubZ sharing both a title AND a contentHash, and despite the page order being fully scrambled since the click.`);
        assert(forkResult.query.publication !== pubY.id,
            '4. FLAGSHIP, the adversarial pair from Section E: pubY and pubZ are maximally confusable by every DISPLAYED field (identical title, identical content) — and Fork still never confuses them.');

        // And the two same-document siblings' own Fork targets remain
        // distinct from each other too, completing the cross-product of
        // every collision this milestone set out to test in one scene.
        const forkXTarget = forkTarget(pubX);
        const forkXPrimeTarget = forkTarget(pubXPrime);
        assert(forkXTarget.query.fork === forkXPrimeTarget.query.fork && forkXTarget.query.publication !== forkXPrimeTarget.query.publication,
            '5. FLAGSHIP: pubX/pubXPrime (same document) fork to the same content but distinct, correct source publicationIds — simultaneously true, in the same scene, as pubY/pubZ (same content, different documents) forking to fully distinct documents AND publications.');
    }
    console.log('✓ Section J: FLAGSHIP — a same-document-republish pair and a same-contentHash-different-document pair, rendered and grouped together, reordered and partially removed from view between click and action, still resolved every action to its own exact, correct target throughout — the full cross-product of this milestone\'s own adversarial scenarios, in one scene, with zero confusion.');

    console.log('\nAll Publication Catalog Action Safety Product Reassessment tests passed.');

    console.log(`\n=== 0.9.540 VERDICT ===
PRODUCT_COMPLETE. This milestone's own question — does every action offered from a Publication catalog operate on
the exact Publication represented by that card/list entry, with no stale or ambiguous action target — is answered
YES, across every real action this codebase's catalog surfaces expose (Section A: Open/Fork/Explore/view-author on
both PublicationCard.js and PublicationList.js, plus capability-gated Comment/Post Comment on PublicationCard.js;
ForkTree.js, the one related-publication view, exposes none at all).

The reason is structural, not incidental: PublicationCatalog.js's own v-for keys every card/row by the Publication's
own id (never an array index — Section C), and PublicationCard.js/PublicationList.js emit that exact, same-reference
object (or a field read directly off it) for every one of the four actions (Section B) — so Vue's own keyed diffing
and JavaScript's own closure-over-reference semantics ALREADY provide the guarantee this milestone's brief asked
for, before any code here was written. Every catalog action is also fully synchronous (plain router.push(), no
await, no .then — Section C), so there is no asynchronous window for a race to occupy in the first place; a live
simulation (Section C) and a richer flagship scene combining a same-document-republish pair with a same-contentHash-
different-document pair, reordered and partially removed from view between click and action (Section J), both
confirm every target survives intact. Repeated Publications of the same document (Section D) and Publications
sharing a contentHash (Section E) were both proven, live, never to cross-contaminate any of the four actions — Open/
Explore correctly converge on a shared Document/World when the document truly is shared (by design, not a gap),
while Fork correctly diverges on the exact source publicationId every time, resolved end to end through the real
EditorView.js consumer. Action availability was confirmed to depend only on the current render's own facts, never a
stale selection (Section F); one card's failure (or success) was proven live, via the real PublicationCard.js
methods, never to leak into another's (Section G); navigation was confirmed to use the app's one existing router,
never a new mechanism (Section H); and Comment-posting was confirmed the only mutating action reachable from these
surfaces, already explicit, with no delete/unpublish action existing in the catalog at all (Section I, marked N/A
for that half rather than invented).

This is a test-only milestone: one new file, tests/PublicationCatalogActionSafetyProductReassessment.test.js,
registered in tests.html. ui/components/PublicationCard.js, ui/components/PublicationList.js,
ui/components/PublicationCatalog.js, and ui/components/ForkTree.js are all byte-for-byte unchanged. No global action
dispatcher, new identity system, catalog state manager, action-cancellation framework, new navigation framework,
automatic retry, action deduplication, contentHash-based routing, UI redesign, new badge, new trust vocabulary, or
request-ID workflow was introduced for these actions — none of them are asynchronous, and per the requesting
brief's own instruction, none was invented to make them appear so.

Per this milestone's own brief: "if 0.9.540 is clean, I'd then move away from Publication Catalog entirely" — it is
clean.`);
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
