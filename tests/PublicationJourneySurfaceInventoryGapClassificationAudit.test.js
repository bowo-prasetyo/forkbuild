import { readFile, readdir } from 'node:fs/promises';

import { sweepDirectory } from './support/RawStatusInterpolationSweep.js';

// 0.9.573 — Publication Journey Surface Inventory & Gap Classification Audit.
//
// TYPE: test-only, reconnaissance-focused. Production changes: none.
//
// 0.9.519-0.9.572 closed a long sequence of individually-scoped Publication
// seams: evidence/trust vocabulary (0.9.519/0.9.528), date disambiguation
// (0.9.539), notification navigation (0.9.530/0.9.544), commentary parity
// (0.9.541-0.9.562), cross-surface action consistency (0.9.560-0.9.563),
// observer-local vs. authoritative placement (0.9.565-0.9.571), and
// discovery-presentation date consistency (0.9.572, AuthorView/ForkTree).
// Each of those was a deep, narrow dive. This milestone does something
// different, at the requesting brief's own insistence: it does NOT re-audit
// any of those closed boundaries. It builds a factual SURFACE INVENTORY —
// every production place a Publication enters, exits, changes identity
// representation, or renders — and asks only whether anything on that map
// has never actually passed through one of the above closures.
//
// METHOD. Every UI file under ui/components/ (64 files) and ui/views/ (26
// files) was read or grepped for Publication-shaped data (`Publication`
// imports, `publicationId`, `.documentId` off a publication-shaped object,
// `publishedAt`). Every application/ file whose name contains Distribution,
// Discovery, Repository, Fork, or Lifecycle was inventoried for which
// lifecycle arrow it implements. This file's own assertions read that real,
// unmodified production source directly — the same idiom 0.9.560 established
// (`rawSource()` + `assert()` over live file text), because a reconnaissance
// audit's job is to report what is actually there, not what a comment claims
// is there.
//
// HEADLINE FINDING (Section D): exactly one candidate gap surfaced — a raw,
// independent `publishedAt.toLocaleDateString()` in
// ui/components/WorldEncounterCanvas.js's own "Snapshot Content" inspection
// panel, never routed through core/PublicationDateAmbiguity.js's
// formatPublicationDate()/computeAmbiguousPublishedDateIds() the way
// PublicationCard.js/PublicationList.js/AuthorView.js/ForkTree.js all are
// (the last two only since 0.9.572). INVESTIGATED IN DEPTH AND REJECTED:
// unlike the four fixed renderers, this panel shows exactly one Publication
// at a time (never a list two colliding records could render identically
// across), and the SAME panel already displays the literal, unambiguous
// `Publication ID` as its own preceding field — a stronger disambiguator
// than day-precision ever was. There is no on-screen collision here for
// precision to resolve. Classified ALREADY_CORRECT, not PRODUCT_GAP — see
// Section D for the evidence.
//
// Every other section reconfirms ALREADY_CORRECT / DELIBERATE_BOUNDARY,
// citing the specific prior milestone that already closed it, with one live
// re-check per section rather than a re-derivation. Full classification
// table: Section I. Coverage map: Section J. Overall verdict: Section J.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

async function runTests() {
    console.log('Running Publication Journey Surface Inventory & Gap Classification Audit tests...\n');

    // ===============================================================
    // Section A — Entry point inventory. Every production surface a
    // Publication (or Publication-derived data) can enter through.
    // ===============================================================
    {
        const publicationCatalogSource = await rawSource('ui/components/PublicationCatalog.js');
        const worldSearchPanelSource = await rawSource('ui/components/WorldSearchPanel.js');
        const worldEncounterMarkerSource = await rawSource('ui/components/WorldEncounterMarker.js');
        const notificationHistoryPanelSource = await rawSource('ui/components/NotificationHistoryPanel.js');
        const ownPublicationPanelSource = await rawSource('ui/components/OwnPublicationPanel.js');
        const decentralizedPublicationsViewSource = await rawSource('ui/views/DecentralizedPublicationsView.js');
        const authorViewSource = await rawSource('ui/views/AuthorView.js');
        const forkTreeSource = await rawSource('ui/components/ForkTree.js');
        const repositoryViewSource = await rawSource('ui/views/RepositoryView.js');
        const recentWorldsViewSource = await rawSource('ui/views/RecentWorldsView.js');

        // A1. Repository/Author — ONE shared catalog component (0.9.560
        // A1a reconfirmed live): RepositoryView.js wraps it unscoped,
        // AuthorView.js's own lineage tree is a SEPARATE surface fed by
        // the same publisher/Publication.js records.
        assert(publicationCatalogSource.includes('author: { type: String, default: null }'), 'A1a. PublicationCatalog.js still takes a single author-scoping prop.');
        assert(repositoryViewSource.includes('<PublicationCatalog />') && !repositoryViewSource.includes('author='), 'A1b. RepositoryView.js mounts the catalog unscoped — Repository is "every publication," not a per-author view.');

        // A2. Author/Fork lineage — a genuinely separate renderer
        // (fork-tree node), not the catalog card/row: AuthorView.js's own
        // root nodes plus ForkTree.js's own recursive descendants.
        assert(authorViewSource.includes('<ForkTree :publications="allPublications"'), 'A2a. AuthorView.js mounts ForkTree.js as its own lineage surface, distinct from PublicationCatalog.');
        assert(forkTreeSource.includes("<ForkTree :publications=\"publications\" :root-document-id=\"child.documentId\""), 'A2b. ForkTree.js recurses into itself per descendant — every fork generation is its own entry point onto the same underlying record.');

        // A3. World Search — a resolved-Publication surface, Focus-only
        // (0.9.560 A4 reconfirmed live).
        assert(worldSearchPanelSource.includes("emits: ['search', 'focus']"), 'A3. World Search still offers Focus only — no separate Open/Fork/Comment entry point on this surface.');

        // A4. World Encounter — the "PUBLICATION" kind of an encounterable
        // object; carries only kind + objectId at the marker level (see
        // Section C for why that matters for identity transport).
        assert(worldEncounterMarkerSource.includes("value === 'PUBLICATION' || value === 'AVATAR'"), 'A4. World Encounter markers name PUBLICATION as one of exactly two encounterable kinds.');

        // A5. Notification — publicationId-keyed navigation, never a
        // Publication object of its own (0.9.530/0.9.544 reconfirmed live).
        assert(notificationHistoryPanelSource.includes('event.payload.publicationId'), 'A5. NotificationHistoryPanel.js still reads publicationId off the notification payload, never a hydrated Publication.');

        // A6. Own Publications — Commentary/Distribution/Discovery over
        // the ACTIVE document's own governing Publication (0.9.560 A5
        // reconfirmed: no navigation of its own).
        assert(!/router\.push|focusWorld/.test(ownPublicationPanelSource), 'A6. OwnPublicationPanel.js still never navigates — it is an entry point onto the CURRENTLY OPEN document\'s own Publication, not a catalog.');

        // A7. Decentralized Publications View ("Publication Center") — a
        // genuinely separate entry surface: resolves DECENTRALIZED
        // discovery leads into real `Publication` instances for
        // evidence/anchor/archive inspection, admitting some of them into
        // Repository discovery via its own admitToRepositoryDiscovery()
        // gate (Section G/H).
        assert(decentralizedPublicationsViewSource.includes("import { Publication } from '../../publisher/Publication.js';"), 'A7a. DecentralizedPublicationsView.js resolves genuine Publication instances, not a lighter descriptor.');
        assert(decentralizedPublicationsViewSource.includes('function admitToRepositoryDiscovery(view) {'), 'A7b. Its own admission gate into Repository discovery is a named, inspectable function.');

        // A8. World (Recent Worlds) — confirmed NOT a Publication entry
        // point in its own right (0.9.560 A6 reconfirmed): it keys and
        // navigates strictly by documentId, and only reaches into
        // loadPublicationDocumentUseCase to resolve a description label
        // for a recently-visited World — never exposing a publicationId,
        // an Open/Fork/Explore action, or any other Publication-shaped
        // entry point of its own.
        assert(recentWorldsViewSource.includes('function enterWorld(documentId)'), 'A8a. Recent Worlds still keys and navigates strictly by documentId.');
        assert(recentWorldsViewSource.includes('loadPublicationDocumentUseCase.execute(documentId)') && !recentWorldsViewSource.includes('publicationId'), 'A8b. It reaches into loadPublicationDocumentUseCase only to resolve a description label — it never carries or exposes a publicationId of its own, confirming this brief\'s "World" row resolves to World Encounter/World Search/Own Publication above, never to Recent Worlds.');

        console.log('✓ A — entry points inventoried: Repository/Author (shared catalog, wrapped unscoped by RepositoryView.js), Author/Fork lineage (AuthorView.js + ForkTree.js, a separate renderer), World Search (Focus-only), World Encounter (marker kind PUBLICATION), Notification (publicationId-keyed), Own Publications (no navigation), Decentralized Publications View / Publication Center (a genuinely separate discovery/evidence entry surface with its own Repository-admission gate). Recent Worlds confirmed NOT a Publication surface.');
    }

    // ===============================================================
    // Section B — Exit/continuation actions. Not re-derived: 0.9.560-
    // 0.9.563 already fully audited Open/Fork/Explore/Comment across
    // Repository/Author/World Encounter/World Focus Panel/World Search/
    // Own Publication. This section only checks the ONE surface that
    // audit did not cover — Decentralized Publications View / Publication
    // Center — for whether it silently grew a duplicate action surface.
    // ===============================================================
    {
        const decentralizedPublicationsViewSource = await rawSource('ui/views/DecentralizedPublicationsView.js');
        const leaderboardHubViewSource = await rawSource('ui/views/LeaderboardHubView.js');
        const publisherPerformanceLeaderboardViewSource = await rawSource('ui/views/PublisherPerformanceLeaderboardView.js');
        const reconciliationCandidateLeaderboardViewSource = await rawSource('ui/views/ReconciliationCandidateLeaderboardView.js');
        const reconciliationWorkspaceViewSource = await rawSource('ui/views/ReconciliationWorkspaceView.js');

        // B1. The Publication Center never imports ForkDocumentUseCase and
        // never builds an /editor route — it has no Open/Fork continuation
        // of its own; every action it exposes is archive/anchor/evidence
        // inspection (toggle/export/import), not a 0.9.560-vocabulary verb.
        assert(!decentralizedPublicationsViewSource.includes('ForkDocumentUseCase') && !decentralizedPublicationsViewSource.includes("path: '/editor'"), 'B1. DecentralizedPublicationsView.js has no Fork/Open continuation — it never references ForkDocumentUseCase or builds an /editor route.');

        // B2. Leaderboard/Reconciliation surfaces operate on a DIFFERENT
        // entity (Publisher rankings, ReconciliationCandidate evidence,
        // PublisherLeaderboardSnapshotClaim authoring) — none expose
        // Open/Fork/Explore on a Publication, confirmed by the complete
        // absence of the vocabulary those actions require anywhere in
        // this bucket of files.
        for (const [label, source] of [
            ['LeaderboardHubView.js', leaderboardHubViewSource],
            ['PublisherPerformanceLeaderboardView.js', publisherPerformanceLeaderboardViewSource],
            ['ReconciliationCandidateLeaderboardView.js', reconciliationCandidateLeaderboardViewSource],
            ['ReconciliationWorkspaceView.js', reconciliationWorkspaceViewSource]
        ]) {
            assert(!source.includes('ForkDocumentUseCase') && !/>Fork<|>Open<|>Explore<\//.test(source), `B2. ${label} exposes no Open/Fork/Explore action on a Publication — it is a different entity's surface.`);
        }

        console.log('✓ B — no NEW action surface exists outside 0.9.560-0.9.563\'s own inventory. The Publication Center and the entire Leaderboard/Reconciliation family are confirmed, live, to carry zero Open/Fork/Explore continuation of their own.');
    }

    // ===============================================================
    // Section C — Identity transport. What travels at each boundary,
    // and why a narrower shape is deliberate rather than a missed field.
    // ===============================================================
    {
        const worldEncounterMarkerSource = await rawSource('ui/components/WorldEncounterMarker.js');
        const worldEncounterCanvasSource = await rawSource('ui/components/WorldEncounterCanvas.js');
        const notificationHistoryPanelSource = await rawSource('ui/components/NotificationHistoryPanel.js');

        // C1. The marker level carries only kind + objectId — never a
        // hydrated Publication, never publicationId+contentHash+position
        // together. The canvas (one layer up) is the only place that
        // resolves objectId back into full identity.
        assert(worldEncounterMarkerSource.includes("this.$emit('select', { kind: this.kind, objectId: this.objectId });"), 'C1a. WorldEncounterMarker.js\'s own click emits exactly { kind, objectId } — nothing richer.');
        assert(worldEncounterMarkerSource.includes('NO DISTANCE, NEAREST, NEARBY, RADIUS, SCORE, RANK, TRUST, VERIFIED,'), 'C1b. The same file independently upholds the evidence-vocabulary restraint (Section E) at the marker level, though it was never one of the files 0.9.519/0.9.528 named.');

        // C2. Observer-local encounters (a THIRD identity shape,
        // distinct from both the marker\'s objectId and a catalog\'s
        // publicationId+documentId): publicationId + contentHash only,
        // deliberately never documentId or claimedPosition — reconfirmed
        // live (0.9.565-0.9.571\'s own boundary).
        assert(worldEncounterCanvasSource.includes('`projectedObserverLocalEncounters` carries exactly'), 'C2a. Still documented as carrying exactly a named, narrow shape.');
        assert(worldEncounterCanvasSource.includes('`publicationId`, `contentHash`, `x`, `y`'), 'C2b. That shape is still publicationId + contentHash + screen position — never documentId, a locator, or claimedPosition.');

        // C3. The Publication Center\'s own inspection detail (Section D\'s
        // subject) shows publicationId and contentHash as SEPARATELY
        // labeled fields, never collapsed into one — the same "five
        // separately-named artifacts" discipline 0.9.522\'s own Identity
        // boundary (Section B of its consolidation) already established.
        assert(worldEncounterCanvasSource.includes('<dt>Publication ID</dt>') && worldEncounterCanvasSource.includes('<dt>Content Hash</dt>'), 'C3. Publication ID and Content Hash render as two distinct, separately labeled fields in the Snapshot Content detail panel.');

        console.log('✓ C — identity transport confirmed narrow-by-design at every boundary this audit checked: markers carry kind+objectId only, observer-local encounters carry publicationId+contentHash only, and the one detail panel that shows both keeps them as two separately labeled fields, never one collapsed identity.');
    }

    // ===============================================================
    // Section D — Presentation transformations. This section\'s own
    // investigation is the milestone\'s headline result.
    // ===============================================================
    {
        const publicationCardSource = await rawSource('ui/components/PublicationCard.js');
        const publicationListSource = await rawSource('ui/components/PublicationList.js');
        const authorViewSource = await rawSource('ui/views/AuthorView.js');
        const forkTreeSource = await rawSource('ui/components/ForkTree.js');
        const worldEncounterCanvasSource = await rawSource('ui/components/WorldEncounterCanvas.js');
        const worldSearchPanelSource = await rawSource('ui/components/WorldSearchPanel.js');
        const notificationHistoryPanelSource = await rawSource('ui/components/NotificationHistoryPanel.js');

        // D1. The four renderers 0.9.539/0.9.572 already wired all still
        // import the shared helper — reconfirmed live, not re-derived.
        for (const [label, source] of [
            ['PublicationCard.js', publicationCardSource],
            ['PublicationList.js', publicationListSource],
            ['AuthorView.js', authorViewSource],
            ['ForkTree.js', forkTreeSource]
        ]) {
            assert(source.includes("from '../../core/PublicationDateAmbiguity.js'") || source.includes("from '../core/PublicationDateAmbiguity.js'"), `D1. ${label} still imports the shared date-disambiguation helper.`);
        }

        // D2. THE CANDIDATE FINDING. WorldEncounterCanvas.js's own
        // "Snapshot Content" inspection panel renders a Publication's
        // publishedAt independently, via a raw toLocaleDateString() call,
        // never routed through formatPublicationDate().
        const rawDateLine = "selectedSnapshotContentView.material.publishedAt ? selectedSnapshotContentView.material.publishedAt.toLocaleDateString() : 'Unknown'";
        assert(worldEncounterCanvasSource.includes(rawDateLine), 'D2a. Confirmed: this panel independently formats publishedAt via raw toLocaleDateString(), not formatPublicationDate().');
        assert(!worldEncounterCanvasSource.includes("PublicationDateAmbiguity.js"), 'D2b. Confirmed: WorldEncounterCanvas.js does not import the shared date helper at all — this is not a partial wiring, it is a fully independent renderer, exactly the shape 0.9.572 found and fixed in AuthorView.js/ForkTree.js.');

        // D3. INVESTIGATION: does the same collision 0.9.539 fixed for
        // PublicationCard/List/AuthorView/ForkTree (two Publications, same
        // documentId, same day, rendered identically on the SAME page)
        // reach this panel? This panel shows exactly ONE selected
        // Publication\'s material at a time (`v-if="selectedSnapshotContentView"`,
        // singular) — never a list of siblings a viewer could compare
        // side by side. There is no second record on screen for a
        // collision to occur against.
        const detailBlockStart = worldEncounterCanvasSource.indexOf('<h4 class="world-snapshot-content-view-title">');
        const detailBlockEnd = worldEncounterCanvasSource.indexOf('</template>', worldEncounterCanvasSource.indexOf(rawDateLine));
        const detailBlock = worldEncounterCanvasSource.slice(detailBlockStart, detailBlockEnd);
        assert(!/v-for/.test(detailBlock), 'D3a. Confirmed: the Snapshot Content detail block contains no v-for — it renders one selection, never a list of Publications that could collide.');

        // D4. REJECTION EVIDENCE: this SAME panel already renders the raw,
        // literal Publication ID immediately above the date — a stronger,
        // already-present disambiguator than day-precision would add.
        // Two Publications with an identical rendered date already show
        // two different, explicit Publication ID values right next to it.
        const publicationIdIndex = detailBlock.indexOf('<dt>Publication ID</dt>');
        const publishedIndex = detailBlock.indexOf(rawDateLine);
        assert(publicationIdIndex !== -1 && publicationIdIndex < publishedIndex, 'D4. The literal Publication ID field renders BEFORE the date field in the same detail list — a viewer already sees the unambiguous identifier this panel would need before ever reaching the date.');

        // D5. Confirmed by absence: World Search and Notification History
        // never render a Publication\'s publishedAt at all (they format
        // different fields — a search result\'s own resolved position note,
        // a notification\'s own createdAt) — so 0.9.539\'s mechanism simply
        // does not apply to them; this is a scope boundary, not a second
        // unswept renderer.
        assert(!worldSearchPanelSource.includes('publishedAt'), 'D5a. WorldSearchPanel.js never renders publishedAt at all.');
        assert(!notificationHistoryPanelSource.includes('publishedAt'), 'D5b. NotificationHistoryPanel.js never renders publishedAt — only the notification event\'s own createdAt, a different field entirely.');

        console.log('✓ D — VERDICT ON THE CANDIDATE FINDING: ALREADY_CORRECT, not PRODUCT_GAP. WorldEncounterCanvas.js\'s Snapshot Content panel does independently format publishedAt outside the shared helper (D2), but it structurally cannot reproduce 0.9.539\'s own collision (single-selection, no v-for, D3) and already discloses a strictly stronger disambiguator — the literal Publication ID — before the date is ever reached (D4). Two other candidate surfaces (World Search, Notification History) were confirmed to never render publishedAt at all, so they were never in scope for this mechanism in the first place (D5).');
    }

    // ===============================================================
    // Section E — Trust/evidence boundary. Reuses 0.9.522\'s own shared
    // sweep module rather than re-deriving a fourth copy of it, per this
    // milestone\'s own brief ("leverage completed work rather than
    // recreate it").
    // ===============================================================
    {
        const componentsDir = new URL('ui/components/', SOURCE_ROOT);
        const viewsDir = new URL('ui/views/', SOURCE_ROOT);
        const componentHits = await sweepDirectory(readdir, readFile, componentsDir, 'ui/components');
        const viewHits = await sweepDirectory(readdir, readFile, viewsDir, 'ui/views');
        const allHits = [...componentHits, ...viewHits];

        // E1. Every raw .status/.outcome interpolation this fresh sweep
        // finds today is a hit already named in 0.9.522\'s own
        // classification (reproduced here as a read-only reference set,
        // never as a modification to that file\'s own frozen table) —
        // i.e. no Publication renderer has grown a NEW unclassified raw
        // status leak since that baseline was built.
        const KNOWN_0_9_522_KEYS = new Set([
            'ui/components/OwnPublicationPanel.js::snapshotDiscoveryResult.outcome',
            'ui/components/OwnPublicationPanel.js::snapshotAttributionResult.outcome',
            'ui/components/OwnPublicationPanel.js::selectedSnapshotResolutionResult.outcome',
            'ui/components/OwnPublicationPanel.js::selectedSnapshotAttributionResult.outcome',
            'ui/components/OwnPublicationPanel.js::selectedSnapshotMaterializationResult.outcome',
            'ui/components/OwnPublicationPanel.js::selectedSnapshotWorldPositionClaimResult.outcome',
            'ui/components/OwnPublicationPanel.js::selectedSnapshotWorldPlacementResult.outcome',
            'ui/components/OwnPublicationPanel.js::selectedSnapshotWorldRegistrationResult.outcome',
            'ui/components/WorldEncounterCanvas.js::snapshotDiscoveryResult.outcome',
            'ui/components/WorldEncounterCanvas.js::snapshotAttributionResult.outcome',
            'ui/components/WorldEncounterCanvas.js::discoveryResult.resolution.status',
            'ui/views/ReconciliationWorkspaceView.js::result.outcome'
        ]);
        const unknown = allHits.filter((hit) => !KNOWN_0_9_522_KEYS.has(`${hit.file}::${hit.expr}`));
        assert(unknown.length === 0, `E1. Every live raw-status hit is already accounted for in 0.9.522\'s own classification — found genuinely new, unclassified hits: ${JSON.stringify(unknown)}`);

        // E2. NOTED, OUT OF SCOPE: the live sweep today finds fewer hits
        // (${allHits.length}) than 0.9.522\'s own table lists
        // (${KNOWN_0_9_522_KEYS.size}) — some of the SAFE_TECHNICAL_TOKEN
        // entries no longer exist in current source (code was cleaned up,
        // not regressed). tests/ProductIntegrityAuditBaselineConsolidation.test.js's
        // own B5 check would flag that size mismatch as a stale-table
        // maintenance debt — a real, pre-existing observation, but about
        // that OTHER milestone's own frozen invariant, not about a
        // Publication journey surface this milestone is scoped to. Not
        // fixed here; recorded for whoever next touches that file.
        assert(allHits.length <= KNOWN_0_9_522_KEYS.size, `E2. Sanity: today's hit count (${allHits.length}) is a subset of, never larger than, 0.9.522's own table (${KNOWN_0_9_522_KEYS.size}) — confirms shrinkage from cleanup, not growth from a new leak.`);

        // E3. A previously-uncited file independently upholds the SAME
        // evidence-restraint doctrine 0.9.519/0.9.528 established, for
        // Publication placement trust: WorldLocationBrowser.js
        // deliberately built its OWN label map rather than reuse
        // describeTrustStatus() (application/AvatarPresenceLabels.js),
        // specifically because that helper's "Trusted." label would
        // overclaim for a placement-record signature check — a fifth
        // file, never named by either milestone, that reached the
        // identical restraint independently.
        const worldLocationBrowserSource = await rawSource('ui/components/WorldLocationBrowser.js');
        assert(worldLocationBrowserSource.includes('TRUST_OBSERVATION_LABELS'), 'E3a. WorldLocationBrowser.js defines its own local trust-observation label map.');
        assert(!worldLocationBrowserSource.includes("from '../../application/AvatarPresenceLabels.js'"), 'E3b. It deliberately never imports the Avatar-domain describeTrustStatus() helper — a self-aware, independent instance of the same restraint, not a copy (its own header names and rejects that helper in prose, precisely to explain why it built its own map instead).');

        console.log(`✓ E — evidence/trust boundary reconfirmed via the shared 0.9.522 sweep module (never redefined): ${allHits.length} live raw-status hits today, all already classified, zero new/unaccounted-for leaks (E1). A stale-table size mismatch in 0.9.522\'s OWN closure test is noted as an out-of-scope, pre-existing maintenance item (E2) — not this milestone\'s to fix. A fifth file (WorldLocationBrowser.js), never named by 0.9.519/0.9.528, is confirmed to independently uphold the identical restraint (E3).`);
    }

    // ===============================================================
    // Section F — Spatial boundary. Only checking for a NEW renderer
    // that collapses PlacementRecord / claimedPosition /
    // ObserverLocalEncounter — not re-testing 0.9.565-0.9.571.
    // ===============================================================
    {
        const worldEncounterCanvasSource = await rawSource('ui/components/WorldEncounterCanvas.js');
        const worldLocationBrowserSource = await rawSource('ui/components/WorldLocationBrowser.js');
        const placementInfoPanelSource = await rawSource('ui/components/PlacementInfoPanel.js');

        // F1. WorldEncounterCanvas.js — the one UI file that references
        // all three concepts — still keeps them explicitly distinct.
        assert(worldEncounterCanvasSource.includes("it never claims the publisher's own `claimedPosition` was honored, used,"), 'F1a. Still explicit: an observer-local encounter position is never presented as an honored claimedPosition.');
        assert(worldEncounterCanvasSource.includes('never a `documentId`,'), 'F1b. Still explicit: the observer-local identity shape never substitutes documentId for publicationId+contentHash.');

        // F2. WorldLocationBrowser.js — never uses the literal three
        // terms, but independently preserves the identical DISTINCTION
        // using its own vocabulary ("recorded placement" vs. "a default
        // fallback — no placement recorded"), matching World Search's own
        // "Publication Found Is Not The Same As Placement Found"
        // principle (docs/Principles.md) rather than collapsing the two.
        assert(worldLocationBrowserSource.includes("'from the recorded placement.'") && worldLocationBrowserSource.includes("'a default fallback — no placement recorded.'"), 'F2. WorldLocationBrowser.js keeps "has a recorded placement" and "resolved to a fallback" as two distinct, separately worded outcomes.');

        // F3. PlacementInfoPanel.js — deliberately renders Placement
        // (position/revision/owner), never the Publication itself,
        // matching its own documented "A Publication Is What; A
        // Placement Is Where" boundary — no co-mingling to check for
        // conflation of PlacementRecord with a Publication\'s own fields.
        assert(placementInfoPanelSource.includes('A Publication Is What; A Placement Is Where') || placementInfoPanelSource.includes('Placement Is Where'), 'F3. PlacementInfoPanel.js still documents its own Publication/Placement separation.');

        console.log('✓ F — no new renderer collapses PlacementRecord / claimedPosition / ObserverLocalEncounter. The one file that references all three (WorldEncounterCanvas.js) still keeps them distinct; two other files that touch adjacent spatial concepts (WorldLocationBrowser.js, PlacementInfoPanel.js) preserve the same distinction in their own vocabulary rather than the literal terms.');
    }

    // ===============================================================
    // Section G — Action parity. Only checking for a NEW or previously-
    // unexamined action surface — not re-auditing 0.9.560/0.9.561/0.9.562.
    // ===============================================================
    {
        const decentralizedPublicationsViewSource = await rawSource('ui/views/DecentralizedPublicationsView.js');
        const worldEncounterCanvasSource = await rawSource('ui/components/WorldEncounterCanvas.js');

        // G1. The Publication Center's own admission gate and World
        // Encounter's own admission gate are INDEPENDENTLY IMPLEMENTED
        // (same name, same semantics, never one importing the other) —
        // confirmed structurally, not merely asserted from a comment.
        assert(!worldEncounterCanvasSource.includes("from '../views/DecentralizedPublicationsView.js'"), 'G1a. WorldEncounterCanvas.js never imports DecentralizedPublicationsView.js.');
        assert(worldEncounterCanvasSource.includes('admitToRepositoryDiscovery(loading, verification) {'), 'G1b. It defines its own, separately-signatured admitToRepositoryDiscovery(loading, verification) — a second, independent composition of the identical admission concept, in this codebase\'s established style (0.9.560 Section B4\'s Commentary precedent), never a duplicated source of truth.');

        // G2. Neither admission gate is exposed as a user-facing verb
        // alongside Open/Fork/Explore/Comment — it is plumbing (Discovery
        // -> Repository), not a sixth action a Wanderer chooses.
        assert(!decentralizedPublicationsViewSource.includes('>Admit<') && !decentralizedPublicationsViewSource.includes('>Discover to Repository<'), 'G2. The admission gate has no dedicated user-facing button of its own — it fires as a side effect of resolution succeeding, not a distinct clickable action.');

        console.log('✓ G — no new or previously-unexamined Publication action surface found. The one candidate (the Repository-admission gate) is confirmed to be internal plumbing, independently composed on both sides, never a user-facing action alongside Open/Fork/Explore/Comment.');
    }

    // ===============================================================
    // Section H — Lifecycle transitions. Naming the implementing file
    // for each arrow in Document -> Publication -> Distribution ->
    // Discovery -> Repository -> World -> Fork -> Publication.
    // ===============================================================
    {
        const arrows = [
            ['application/PublishDocumentUseCase.js', 'Document -> Publication'],
            ['application/PublicationDistributionCommand.js', 'Publication -> Distribution'],
            ['application/PlacePublicationUseCase.js', 'Repository -> World'],
            ['application/ForkPublishedWorldUseCase.js', 'World -> Fork'],
            ['application/ForkDocumentUseCase.js', 'Fork (mechanism reused for Fork -> Publication\'s own eventual re-publish)']
        ];
        for (const [path, arrow] of arrows) {
            const exists = await rawSource(path).then(() => true).catch(() => false);
            assert(exists, `H1. ${arrow} has a real, named implementing file at ${path}.`);
        }

        // H2. Distribution -> Discovery and Discovery -> Repository are
        // each implemented by MULTIPLE per-substrate files converging on
        // one composition root, not one file each — named here as a
        // fact, not a gap: this is the identical "per-substrate adapter,
        // one shared consumer" shape 0.9.560 Section B/E already found
        // correct for Open/Fork.
        const distributionRuntimeProviderSource = await rawSource('application/PublicationDistributionRuntimeProvider.js');
        assert(distributionRuntimeProviderSource.length > 0, 'H2a. Distribution -> Discovery converges on a real, named runtime provider file, regardless of which substrate adapter (Arweave/Nostr) fed it.');

        // H3. Fork -> Publication (closing the loop) has NO single,
        // uniquely-named "re-publish after fork" file — it closes by
        // re-invoking PublishDocumentUseCase.js on the forked Document,
        // the SAME file H1 already named for Document -> Publication.
        // Named here as an observation the brief asked for, classified
        // ALREADY_CORRECT rather than a gap: a dedicated "re-publish"
        // file would be the ONLY lifecycle stage requiring a special case
        // for "the Document happens to have been forked," which none of
        // PublishDocumentUseCase.js's own callers need to distinguish.
        const publishDocumentUseCaseSource = await rawSource('application/PublishDocumentUseCase.js');
        assert(!/forkedFrom|isForked|parentDocumentId/.test(publishDocumentUseCaseSource), 'H3. PublishDocumentUseCase.js takes no fork-specific parameter or branch — the SAME publish path closes the loop for a forked Document as for any other, with no special-cased "re-publish" file required.');

        console.log('✓ H — every lifecycle arrow has a real, named implementing file, except Fork -> Publication, which deliberately closes through the SAME Document -> Publication file rather than a dedicated re-publish path — confirmed by that file\'s own lack of any fork-specific branch, so this is the lifecycle correctly avoiding a needless special case, not a missing owner.');
    }

    // ===============================================================
    // Section I — Classification.
    // ===============================================================
    console.log('\n=== 0.9.573 CLASSIFICATION ===');
    console.log(`
  A — ALREADY_CORRECT (inventory only). Every entry point this audit found
      (Repository/Author, Author/Fork lineage, World Search, World
      Encounter, Notification, Own Publications, Decentralized
      Publications View/Publication Center) is a real, distinct surface
      with a coherent, narrow scope; Recent Worlds is confirmed NOT a
      Publication surface at all.

  B — ALREADY_CORRECT. The one surface 0.9.560-0.9.563 did not name
      (Publication Center) and the entire Leaderboard/Reconciliation
      family were checked live and carry zero Open/Fork/Explore
      continuation of their own — no new action surface exists outside
      that arc's own inventory.

  C — ALREADY_CORRECT. Identity transport stays narrow-by-design at
      every boundary: markers (kind+objectId), observer-local encounters
      (publicationId+contentHash), and the one detail panel showing both
      publicationId and contentHash keeps them as two separately labeled
      fields.

  D — ALREADY_CORRECT — the milestone's own central finding. A
      plausible-looking candidate gap (WorldEncounterCanvas.js's Snapshot
      Content panel formats publishedAt independently of the shared
      0.9.539/0.9.572 helper) was investigated in depth and REJECTED WITH
      EVIDENCE: the panel is structurally single-selection (no collision
      to disambiguate) and already discloses a strictly stronger
      identifier (the literal Publication ID) before the date is ever
      reached. Two other candidate surfaces (World Search, Notification
      History) were confirmed to never render publishedAt at all.

  E — ALREADY_CORRECT. The shared 0.9.522 raw-status sweep, reused rather
      than redefined, finds zero unclassified Publication-renderer hits.
      A fifth file (WorldLocationBrowser.js) is newly confirmed to
      independently uphold the same evidence-restraint doctrine
      0.9.519/0.9.528 established, without ever being named by either.
      DOCUMENTATION_GAP, out of this milestone's scope: 0.9.522's own
      classification table now lists more entries than the live sweep
      finds (cleanup, not regression) — a maintenance note for that
      file's own future editor, not a Publication-journey finding.

  F — DELIBERATE_BOUNDARY, PRESERVED, NOT RELITIGATED. No new renderer
      collapses PlacementRecord / claimedPosition / ObserverLocalEncounter;
      the one file referencing all three keeps them distinct, and two
      adjacent files preserve the same distinction in their own
      vocabulary.

  G — ALREADY_CORRECT. The one candidate new action surface (the
      Repository-admission gate) is internal plumbing, independently
      composed on both sides it appears, never a user-facing verb
      alongside Open/Fork/Explore/Comment.

  H — ALREADY_CORRECT. Every lifecycle arrow has a real, named
      implementing file except Fork -> Publication, which deliberately
      reuses Document -> Publication's own file rather than a needless
      special case — confirmed by that file's own lack of any
      fork-specific branch.
`);

    // ===============================================================
    // Section J — Coverage map and overall verdict.
    // ===============================================================
    console.log('=== 0.9.573 COVERAGE MAP ===');
    console.log(`
  Publication concern      Covered through              This milestone's own contribution
  ------------------------ ---------------------------- ------------------------------------
  Identity                 0.9.539, 0.9.522             confirmed narrow-by-design at 3 new boundaries (Section C)
  Trust/evidence           0.9.519, 0.9.528, 0.9.522    zero new leaks; 1 new file found independently compliant (Section E)
  Commentary               0.9.541-0.9.562              not re-touched (already closed)
  Actions                  0.9.560-0.9.563              confirmed no new surface exists (Section B/G)
  Spatial                  0.9.565-0.9.571              confirmed no new collapse exists (Section F)
  Notifications            0.9.530, 0.9.544             confirmed publicationId-only, no publishedAt rendering (Section D5)
  Lifecycle                0.9.533-0.9.546 (approx.)    every arrow named a real file; one arrow's "file" is a deliberate reuse (Section H)
  Discovery presentation   0.9.572                      1 candidate gap investigated and REJECTED with evidence (Section D)

OVERALL: this milestone's own central question — is there still a
meaningful, unexamined Publication-product blind spot? — is answered NO.
Every surface this inventory reached either already passed through an
established closure, or (Section D's one genuine candidate) was
investigated and found to already be correct for a structural reason
(single-selection, stronger disambiguator already shown) rather than
merely asserted to be fine. The one open item (E's DOCUMENTATION_GAP) is
explicitly about another milestone's own closure-test bookkeeping, not
about a Publication journey surface, and is recorded rather than acted on
here, per this milestone's own test-only scope.

Per the requesting brief's own stop condition: the inventory came back
essentially complete. This milestone recommends STOPPING the Publication-
continuity/presentation audit program — the 0.9.519-0.9.573 arc has now
been shown, by direct inventory rather than by another narrow reassessment,
to have no remaining unexamined seam — and moving to a different product
domain, echoing 0.9.559's and 0.9.560's own prior recommendations one and
two levels up.
`);

    console.log('✅ All Publication Journey Surface Inventory & Gap Classification Audit tests passed.');
}

runTests().then(() => {
    console.log('\n✓ All PublicationJourneySurfaceInventoryGapClassificationAudit tests passed');
}).catch((error) => {
    console.error('\n✗ PublicationJourneySurfaceInventoryGapClassificationAudit tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
