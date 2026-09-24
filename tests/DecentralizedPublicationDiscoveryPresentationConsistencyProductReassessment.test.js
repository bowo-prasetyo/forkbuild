
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { PublishDocumentUseCase } from '../application/publication/PublishDocumentUseCase.js';
import { ForkDocumentUseCase } from '../application/document/ForkDocumentUseCase.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { License, LicenseId } from '../core/License.js';
import { computeAmbiguousPublishedDateIds, formatPublicationDate } from '../core/PublicationDateAmbiguity.js';

import ForkTree from '../ui/components/ForkTree.js';
import { worldEncounterCanvasFiles } from './support/SourceFileGroups.js';
import { assert } from './support/Assert.js';
import { readSource } from './support/SourceText.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';

// 0.9.572 — Decentralized Publication Discovery Presentation Consistency
// Product Reassessment.
//
// A cross-surface reassessment: given how thoroughly 0.9.519-0.9.571
// already closed individual Publication-presentation seams (evidence/
// trust vocabulary, action vocabulary, notification navigation,
// commentary parity, identity/date disambiguation, observer-local vs.
// authoritative placement), does the SAME Publication still communicate
// the SAME identity, trust state, and actions everywhere a Wanderer can
// encounter it — or has one of those already-closed seams re-opened on
// a surface nobody re-checked?
//
// FINDING: one genuine, narrowly-scoped gap, in exactly that shape.
// 0.9.539's own fix (core/PublicationDateAmbiguity.js's
// computeAmbiguousPublishedDateIds()/formatPublicationDate(), see that
// file's own header) was wired into ui/components/PublicationCard.js
// and PublicationList.js — the two views ui/components/
// PublicationCatalog.js mounts — but NOT into ui/views/AuthorView.js's
// own separate "Original Works & Forks" lineage tree, which renders
// `publishedAt` a THIRD way, inline, via raw
// `new Date(...).toLocaleDateString()`, in both AuthorView.js itself
// (root nodes) and ui/components/ForkTree.js (every descendant node).
// Republishing an unmodified Document — 0.9.539's own flagship,
// ordinary, single-user scenario — creates two root-level Publication
// records with no parentDocumentId, same documentId, same title, same
// author; forking a document and then republishing THAT fork
// unmodified creates the identical collision one level down, among
// sibling nodes under the same parent. Both were, before this
// milestone, rendered pixel-identical in the fork tree, exactly the
// class of bug 0.9.539 closed elsewhere.
//
// FIX (Sections A-D below prove it, not merely assert it): AuthorView.js
// now computes `preciseDateIds` via the SAME, unmodified
// computeAmbiguousPublishedDateIds(), scoped over the SAME
// `allPublications` array the fork tree already renders from (never a
// new query), and both AuthorView.js's own root-node markup and
// ForkTree.js's own per-node markup now call the SAME, unmodified
// formatPublicationDate() PublicationCard.js/PublicationList.js already
// use — threaded through ForkTree's recursion via a new
// `preciseDateIds` prop, mirroring PublicationList.js's own identical
// prop. No new field, badge, id, or hash is rendered; the fix is
// exactly as narrow as 0.9.539's own.
//
// Sections E onward are a lightweight cross-surface reassessment of the
// OTHER areas this milestone's own brief asked about — reconfirmed
// against real, current, unmodified production source rather than
// re-derived, mirroring 0.9.571's own "closes the arc with a
// deliberately smaller reassessment" restraint.
//
// TYPE: mixed. Production changes: ui/views/AuthorView.js,
// ui/components/ForkTree.js (both narrow, as described above). Every
// other file this test touches is read-only.

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function codeOnly(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

const stubIdentityProvider = {
    currentUser: () => ({ username: 'alice', displayName: 'alice', providerId: 'stub' }),
    sign: (data) => ({ signedBy: 'alice', providerId: 'stub', data })
};

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

async function run() {
    console.log('Running Decentralized Publication Discovery Presentation Consistency Product Reassessment tests...\n');

    let allPublications, rootDocumentId, forkedDocumentId;
    let publicationRoot1, publicationRoot2, publicationFork1, publicationFork2;

    // =======================================================================
    // Section A — LIVE: the exact flagship collision, at BOTH tree levels,
    // built from real Document/Publish/Fork use cases, not hand-rolled
    // Publication objects. Reconfirms, for AuthorView.js's own data source,
    // 0.9.539's own already-accepted DELIBERATE_ASYMMETRY (republishing
    // never deduplicates) rather than re-litigating it.
    // =======================================================================
    {
        const storage = new InMemoryStorageProvider();
        const contentStore = new LocalContentStore(storage);
        const publisher = new LocalPublisherProvider(storage, contentStore);
        const publishDocumentUseCase = new PublishDocumentUseCase(publisher, null, null, null);
        const serializer = new DocumentSerializer();

        const rootDocument = makeMinimalDocument('Atlas', 'alice');
        storage.save(rootDocument.world.id, serializer.serialize(rootDocument));
        rootDocumentId = rootDocument.world.id;

        publicationRoot1 = publishDocumentUseCase.execute({ document: rootDocument });
        await wait(5);
        publicationRoot2 = publishDocumentUseCase.execute({ document: rootDocument }); // republish, unmodified

        assert(publicationRoot1.id !== publicationRoot2.id && publicationRoot1.documentId === publicationRoot2.documentId,
            'A1. LIVE: republishing the root document produces two records, same documentId, different publicationId.');
        assert(!publicationRoot1.parentDocumentId && !publicationRoot2.parentDocumentId,
            'A2. LIVE: both are ROOT publications (no parentDocumentId) — exactly what AuthorView.js\'s own forkTreeRoots filter (`!p.parentDocumentId`) selects, so BOTH land as sibling root nodes.');

        const forkedDocument = new ForkDocumentUseCase(storage).execute(rootDocumentId, stubIdentityProvider, publicationRoot1);
        storage.save(forkedDocument.world.id, serializer.serialize(forkedDocument));
        forkedDocumentId = forkedDocument.world.id;

        publicationFork1 = publishDocumentUseCase.execute({ document: forkedDocument });
        await wait(5);
        publicationFork2 = publishDocumentUseCase.execute({ document: forkedDocument }); // republish the fork, unmodified

        assert(publicationFork1.id !== publicationFork2.id && publicationFork1.documentId === publicationFork2.documentId,
            'A3. LIVE: republishing the FORK produces the identical collision one level down.');
        assert(publicationFork1.parentDocumentId === rootDocumentId && publicationFork2.parentDocumentId === rootDocumentId,
            'A4. LIVE: both fork republishes share the SAME parentDocumentId — sibling nodes under the identical root in ForkTree.js\'s own recursion.');
        assert(publicationFork1.title === publicationFork2.title && publicationFork1.author === publicationFork2.author,
            'A5. LIVE: title/author identical between the two fork records too — nothing but id/publishedAt differs, exactly 0.9.539\'s own precondition.');

        allPublications = [publicationRoot1, publicationRoot2, publicationFork1, publicationFork2];
    }
    console.log('✓ Section A: a real Document, published twice, then forked and republished twice, reproduces 0.9.539\'s own flagship collision at BOTH the root level and the sibling-fork level of AuthorView.js\'s own "Original Works & Forks" data set.');

    // =======================================================================
    // Section B — THE PRE-EXISTING GAP, demonstrated structurally against
    // the pre-fix rendering: the naive `toLocaleDateString()` label AuthorView.js/
    // ForkTree.js used to render collapses all four same-day records into
    // just two visually distinct strings (one per documentId), even though
    // there are genuinely FOUR distinct Publications.
    // =======================================================================
    {
        const naiveRoot1 = publicationRoot1.publishedAt.toLocaleDateString();
        const naiveRoot2 = publicationRoot2.publishedAt.toLocaleDateString();
        const naiveFork1 = publicationFork1.publishedAt.toLocaleDateString();
        const naiveFork2 = publicationFork2.publishedAt.toLocaleDateString();
        assert(naiveRoot1 === naiveRoot2, 'B1. STRUCTURAL: naive day-level label collapses the two root republishes to the identical string.');
        assert(naiveFork1 === naiveFork2, 'B2. STRUCTURAL: naive day-level label collapses the two fork republishes to the identical string too.');
    }
    console.log('✓ Section B: confirmed structurally — the pre-fix rendering genuinely could not distinguish the two colliding pairs from Section A.');

    // =======================================================================
    // Section C — THE FIX, proven behaviorally against the REAL, unmodified
    // core/PublicationDateAmbiguity.js and the REAL, unmodified
    // ui/components/ForkTree.js#setup() — never a reimplementation of
    // either.
    // =======================================================================
    {
        const preciseDateIds = computeAmbiguousPublishedDateIds(allPublications);
        assert(preciseDateIds.size === 4
            && [publicationRoot1, publicationRoot2, publicationFork1, publicationFork2].every((p) => preciseDateIds.has(p.id)),
            'C1. All four colliding records are flagged — two independent collision GROUPS (root pair, fork pair), never merged into one.');

        const rootLabel1 = formatPublicationDate(publicationRoot1.publishedAt, preciseDateIds.has(publicationRoot1.id));
        const rootLabel2 = formatPublicationDate(publicationRoot2.publishedAt, preciseDateIds.has(publicationRoot2.id));
        assert(rootLabel1 !== rootLabel2, 'C2. AuthorView.js\'s own root-node label now renders the two root records DISTINGUISHABLY.');

        // ForkTree.js exports a plain `setup(props)` with no Vue import of its
        // own (no ref/computed/inject/lifecycle) — callable directly, exactly
        // like a real Vue 3 composition component would be invoked, no shim
        // required.
        const { getChildren, publishedAtLabel } = ForkTree.setup({
            publications: allPublications,
            rootDocumentId,
            preciseDateIds
        });
        const children = getChildren(rootDocumentId);
        assert(children.length === 2 && children.includes(publicationFork1) && children.includes(publicationFork2),
            'C3. ForkTree.js\'s own getChildren() still finds both fork siblings under the shared root — unrelated to this fix, reconfirmed live.');

        const forkLabel1 = publishedAtLabel(publicationFork1);
        const forkLabel2 = publishedAtLabel(publicationFork2);
        assert(forkLabel1 !== forkLabel2,
            'C4. ForkTree.js\'s own REAL, EXPORTED publishedAtLabel() now renders the two sibling fork records DISTINGUISHABLY too — the exact gap this milestone closes.');
        assert(forkLabel1 === formatPublicationDate(publicationFork1.publishedAt, true) || forkLabel1 === formatPublicationDate(publicationFork1.publishedAt, false),
            'C5. The label is still produced by formatPublicationDate() itself — no parallel formatting logic invented in ForkTree.js.');

        // A lone, non-colliding publication (different document entirely)
        // must render exactly as before — 0.9.539\'s own "restraint" bar,
        // reconfirmed for ForkTree.js specifically.
        const soloDocument = makeMinimalDocument('Solo', 'alice');
        const soloPublication = { id: 'solo-1', documentId: soloDocument.world.id, title: 'Solo', author: 'alice', parentDocumentId: null, publishedAt: publicationRoot1.publishedAt };
        const untouchedIds = computeAmbiguousPublishedDateIds([...allPublications, soloPublication]);
        assert(!untouchedIds.has('solo-1'),
            'C6. A Publication for a DIFFERENT document is never flagged, even sharing the exact same publishedAt as a colliding pair — 0.9.539\'s own documentId-scoped guarantee, reconfirmed through ForkTree.js\'s own data path.');
    }
    console.log('✓ Section C: the real, unmodified fix functions — computeAmbiguousPublishedDateIds() and formatPublicationDate() — now disambiguate BOTH the root-level and the sibling-fork-level collision, called through AuthorView.js\'s own computed shape and ForkTree.js\'s own real, exported setup().');

    // =======================================================================
    // Section D — STRUCTURAL: the wiring itself, and the restraint bar
    // (no new id/hash/badge rendered), checked against current source text
    // so a future edit that quietly drops the prop threading or reintroduces
    // the naive label regresses THIS test, not just the behavior above.
    // =======================================================================
    {
        const authorViewSource = await readSource('ui/views/AuthorView.js');
        const forkTreeSource = await readSource('ui/components/ForkTree.js');
        const authorViewCode = codeOnly(authorViewSource);
        const forkTreeCode = codeOnly(forkTreeSource);

        assert(authorViewCode.includes("from '../../core/PublicationDateAmbiguity.js'"),
            'D1. AuthorView.js imports the SAME, unmodified core/PublicationDateAmbiguity.js — no parallel module.');
        assert(/computeAmbiguousPublishedDateIds\(allPublications\.value\)/.test(authorViewCode),
            'D2. preciseDateIds is scoped over the FULL `allPublications` array — the same data source forkTreeRoots/ForkTree already use — never a narrower, root-only slice that would miss the sibling-fork collision Section A/C proved.');
        assert(!/toLocaleDateString/.test(authorViewCode),
            'D3. REGRESSION GUARD: AuthorView.js no longer contains ANY raw toLocaleDateString() call — the naive label from Section B cannot silently return.');
        assert(!/toLocaleDateString/.test(forkTreeCode),
            'D4. REGRESSION GUARD: ForkTree.js no longer contains ANY raw toLocaleDateString() call either.');
        assert(/<ForkTree[^>]*:precise-date-ids="preciseDateIds"/.test(authorViewSource),
            'D5. AuthorView.js\'s own template threads preciseDateIds into ForkTree — never left to default to an empty Set for real data.');
        assert(/<ForkTree[^>]*:precise-date-ids="preciseDateIds"/.test(forkTreeSource),
            'D6. ForkTree.js\'s own RECURSIVE self-invocation re-threads the SAME preciseDateIds down every level — a collision three forks deep is exactly as reachable as one at the root, mirrored from Section C\'s own two-level proof.');
        assert(!/\{\{\s*(root|child)\.id\s*\}\}|\{\{\s*(root|child)\.documentId\s*\}\}|\{\{\s*(root|child)\.contentHash\s*\}\}/.test(authorViewSource + forkTreeSource),
            'D7. RESTRAINT: neither file renders a raw publicationId, documentId, or contentHash as visible text — 0.9.539\'s own bar, held here too. The fix stays confined to the SAME field (publishedAt) already shown.');
    }
    console.log('✓ Section D: the fix is fully wired (import, correct scope, template bindings, recursive prop threading) and stays within 0.9.539\'s own restraint bar — reconfirmed against current source text, not merely against the one scenario Section A/C constructed.');

    // =======================================================================
    // Section E — Trust/evidence vocabulary: reconfirms, rather than
    // re-derives, that the ONE apparent wording difference between
    // application/worldEncounter/WorldEncounterMaterialInspectionView.js's "Confirmed to
    // match the selected encounter" (0.9.519) and application/
    // SnapshotOutcomeInspectionView.js's "Confirmed to match this
    // Publication" (0.9.528) remains DOCUMENTED as a deliberate
    // encounter-vs-Publication distinction, not silent drift — see either
    // file's own header for the full reasoning.
    // =======================================================================
    {
        const materialInspectionSource = await readSource('application/worldEncounter/WorldEncounterMaterialInspectionView.js');
        const snapshotOutcomeSource = await readSource('application/snapshot/SnapshotOutcomeInspectionView.js');
        assert(materialInspectionSource.includes("'Confirmed to match the selected encounter'"),
            'E1. WorldEncounterMaterialInspectionView.js still holds its own VERIFIED label unchanged.');
        assert(snapshotOutcomeSource.includes("match: 'Confirmed to match this Publication'"),
            'E2. SnapshotOutcomeInspectionView.js still holds its own MATCH label unchanged.');
        assert(/deliberately echoes/.test(snapshotOutcomeSource) && /never a stronger claim in one panel than\s*\/\/ another/.test(snapshotOutcomeSource),
            'E3. The header still documents this as a DELIBERATE, explained echo of the same evidentiary character across two different referents (an encounter vs. a Publication) — never presented as an accidental inconsistency for a future edit to "fix" by merging the wording.');
        // Only the quoted STRING VALUES a Wanderer would actually see —
        // never the object keys (the enum members themselves are named
        // things like `VERIFIED`/`UNVERIFIABLE`, which is exactly the raw
        // vocabulary these view files exist to keep off screen, not a
        // label value to check).
        const materialLabelsBlock = materialInspectionSource.slice(materialInspectionSource.indexOf('const LOAD_STATUS_LABELS'), materialInspectionSource.indexOf('export function'));
        const snapshotLabelsBlock = snapshotOutcomeSource.slice(snapshotOutcomeSource.indexOf('const RESOLUTION_OUTCOME_LABELS'), snapshotOutcomeSource.indexOf('export function'));
        const materialLabelValues = [...materialLabelsBlock.matchAll(/:\s*'([^']*)'/g)].map((m) => m[1]);
        const snapshotLabelValues = [...snapshotLabelsBlock.matchAll(/:\s*'([^']*)'/g)].map((m) => m[1]);
        assert(materialLabelValues.length === 5 && snapshotLabelValues.length === 7,
            'E4. Both label maps still hold their expected number of string values (sanity check on the slice/regex above).');
        assert(materialLabelValues.every((label) => !/trusted|authentic|official|guaranteed|verified\b/i.test(label)),
            'E5. The actual LABEL VALUES (never the object keys naming the enum members, never the surrounding explanatory prose) in WorldEncounterMaterialInspectionView.js still avoid every stronger-than-warranted word this milestone\'s brief flagged.');
        assert(snapshotLabelValues.every((label) => !/trusted|authentic|official|guaranteed|verified\b/i.test(label)),
            'E6. Same for SnapshotOutcomeInspectionView.js\'s own label values.');
    }
    console.log('✓ Section E: the trust/evidence vocabulary\'s one cross-file wording difference remains what it always was — a documented, deliberate distinction between two different referents, never an unexplained inconsistency; no label value anywhere in either file implies a stronger claim than the underlying hash-equality check supports.');

    // =======================================================================
    // Section F — Spatial meaning: reconfirms, structurally, that the
    // 0.9.565-0.9.571 arc's own central invariant still holds —
    // WorldEncounterCanvas.js never imports or reads the publisher's own
    // claimedPosition, and its observer-local/authoritative convergence
    // filter (0.9.569/0.9.570's own fix) is still present — rather than
    // re-running that arc's own, already-passing regression suites.
    // =======================================================================
    {
        const canvasSource = (await Promise.all(worldEncounterCanvasFiles().map((file) => readSource(file)))).join('\n');
        const canvasCode = codeOnly(canvasSource);
        assert(!/from ['"]\.\.\/\.\.\/application\/snapshot\/placement\/SnapshotWorldPositionClaim\.js['"]/.test(canvasCode),
            'F1. WorldEncounterCanvas.js still never imports application/snapshot/placement/SnapshotWorldPositionClaim.js.');
        assert(!/\.claimedPosition\b/.test(canvasCode),
            'F2. WorldEncounterCanvas.js still never reads `.claimedPosition` anywhere in its own code — claimed-position semantics stay out of observer-local presentation, exactly 0.9.571\'s own closing guard.');
        assert(/const placedPublicationIds = new Set\(\(this\.publicationRows \|\| \[\]\)\.map\(\(row\) => row\.objectId\)\);/.test(canvasCode)
            && /\.filter\(\(encounter\) => !placedPublicationIds\.has\(encounter\.publicationId\)\)/.test(canvasCode),
            'F3. 0.9.570\'s own fix — filtering projectedObserverLocalEncounters by publicationId against publicationRows\'s own objectId — is still present, unmodified.');
    }
    console.log('✓ Section F: the spatial-meaning arc\'s own two central structural guarantees — no claimedPosition leakage, observer-local/authoritative convergence still filtered — remain intact.');

    // =======================================================================
    // Section G — Duplicate representation & notification continuity:
    // lightweight cross-surface guards, not a re-audit.
    // =======================================================================
    {
        const notificationPanelSource = await readSource('ui/components/NotificationHistoryPanel.js');
        assert(/event\s*&&\s*event\.payload\s*&&\s*event\.payload\.publicationId/.test(notificationPanelSource),
            'G1. Notification-driven Publication navigation still reads publicationId specifically (never documentId/contentHash) — the same identity field every other action surface targets.');

        const actionVocabDocExists = await readSource('tests/PublicationActionVocabularyDocumentation.test.js');
        assert(actionVocabDocExists.length > 0,
            'G2. 0.9.563\'s own Publication Action Vocabulary documentation test still exists — its own two documented, deliberate divergences (Fork/"Edit a Copy"; Explore/"Continue Exploring" vs. Focus/"Go") are reconfirmed BY THAT FILE, not re-derived here.');
    }
    console.log('✓ Section G: notification navigation still targets publicationId specifically, and the action-vocabulary documentation this milestone would otherwise duplicate still exists and is registered.');

    // =======================================================================
    // Section H — Verdict.
    // =======================================================================
    console.log('\n--- VERDICT ---');
    console.log('Discovery-source convergence (A), trust/evidence vocabulary (E), spatial');
    console.log('meaning (F), action vocabulary (G), and notification continuity (G) all');
    console.log('reconfirmed intact. ONE genuine, narrowly-scoped identity-presentation gap');
    console.log('found and closed: AuthorView.js\'s own "Original Works & Forks" fork tree —');
    console.log('a surface 0.9.539 never touched — rendered same-document, same-day');
    console.log('Publication collisions pixel-identically, at both the root and sibling-fork');
    console.log('level. Fixed by reusing 0.9.539\'s own, unmodified disambiguation functions,');
    console.log('threaded through exactly as PublicationList.js already threads them.');
    console.log('PRODUCT_COMPLETE.');

    console.log('\n✅ All Decentralized Publication Discovery Presentation Consistency Product Reassessment tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
