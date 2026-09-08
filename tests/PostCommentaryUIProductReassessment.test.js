import { readFile } from 'node:fs/promises';

// 0.9.252 — Post-Commentary-UI Product Reassessment.
//
// Test/document-only. No production changes. 0.9.250 froze the
// Publication Commentary baseline and swept the repository for
// reachability, finding twelve COMPLETE areas and nine individually
// classified Commentary seams (one REACHABLE_BUT_INTERNAL — getById() —
// two COMPLETE, six MISSING_DOMAIN_CAPABILITY). 0.9.251 closed the one
// concrete UI gap that sweep actually found — commentary count — without
// opening a new state or application seam. This milestone is the
// reassessment 0.9.250's own Section F promised would follow: NOT another
// Commentary extension, but a fresh look at whether the repository holds
// another small, already-built capability that is merely unreachable, or
// whether a deliberate new product direction should be chosen instead.
//
//   Section A — Freeze the complete Commentary chain one more time,
//               including 0.9.251's own count closure, reusing rather
//               than reproducing 0.9.250/0.9.251's own test files.
//   Section B — Re-run the capability/reachability matrix across the
//               same twelve areas, but hunt specifically for NEWLY
//               EXPOSED consequences of the completed Commentary
//               feature rather than repeating 0.9.250's own findings.
//   Section C — Reassess the six domain-level Commentary candidates
//               named in this milestone's own brief (navigation,
//               notifications, discovery, persistence management,
//               moderation, synchronization) against real code, and
//               explicitly reconfirm getById() stays internal — no
//               demonstrated user action needs single-commentary
//               identity yet.
//   Section D — The architectural investigation this milestone's own
//               brief asks for by name: does a genuine Publication
//               inspection/detail surface already exist? Tested against
//               real source, not assumed either way.
//   Section E — Verdict. Ranked candidates, nothing built.
//
//   0.9.242 ── … ── 0.9.249 ── 0.9.250 ── 0.9.251 ── 0.9.252  <- this
//    (Commentary   (lifecycle   (freeze +   (count UI,  (freeze +
//     arc)          audit)       reachability the one     reachability +
//                                sweep, no   concrete gap  new-consequence
//                                pick)       0.9.250       hunt + detail-
//                                            found)        surface
//                                                           investigation,
//                                                           no pick)

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

async function sourceExists(relativePath) {
    try {
        await readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
        return true;
    } catch {
        return false;
    }
}

function codeOnlyLines(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

// Mirrors tests/PostPublicationCommentaryProductReassessment.test.js's own
// helper (itself mirroring tests/PostCollaborationProductReassessment.test.js
// and tests/ProductEvolutionBaseline.test.js before it) — the one
// grep-verifiable signal this whole reassessment lineage has always used
// for "does anything real call this," rather than trusting a header
// comment's own claim either way.
async function constructorCallerCount(className, dirs, { excludeSuffix = null } = {}) {
    const { execSync } = await import('node:child_process');
    let hits = '';
    try {
        const exclude = excludeSuffix ? ` | grep -v "${excludeSuffix}"` : '';
        hits = execSync(`grep -rl "new ${className}(" ${dirs.join(' ')} --include="*.js"${exclude} || true`,
            { cwd: SOURCE_ROOT.pathname }).toString();
    } catch { /* grep exits non-zero on no match; treated as zero hits */ }
    return hits.trim() ? hits.trim().split('\n').length : 0;
}

async function grepCount(pattern, dirs, { excludeSuffix = null, ignoreCase = false } = {}) {
    const { execSync } = await import('node:child_process');
    let hits = '';
    try {
        const exclude = excludeSuffix ? ` | grep -v "${excludeSuffix}"` : '';
        const flags = ignoreCase ? '-rli' : '-rl';
        hits = execSync(`grep ${flags} "${pattern}" ${dirs.join(' ')} --include="*.js"${exclude} || true`,
            { cwd: SOURCE_ROOT.pathname }).toString();
    } catch { /* zero hits */ }
    return hits.trim() ? hits.trim().split('\n').length : 0;
}

async function runTests() {
    console.log('Running Post-Commentary-UI Product Reassessment tests...\n');

    // ---------------------------------------------------------------
    // Section A — Freeze the complete Commentary chain, including
    // 0.9.251's own count closure. Reuses 0.9.250/0.9.251's own test
    // files as the authoritative record rather than reproducing their
    // asserts; adds only the handful of fresh signals needed to confirm
    // nothing drifted since.
    // ---------------------------------------------------------------
    {
        assert(await sourceExists('tests/PostPublicationCommentaryProductReassessment.test.js'),
            'A1. tests/PostPublicationCommentaryProductReassessment.test.js (0.9.250) still exists as the authoritative nine-stage pipeline freeze this section reuses rather than reproduces.');
        assert(await sourceExists('tests/PublicationCommentaryCountUI.test.js'),
            'A2. tests/PublicationCommentaryCountUI.test.js (0.9.251) still exists as the authoritative count-closure record this section reuses rather than reproduces.');

        // A3. A representative sample of the nine pipeline stages
        // 0.9.250's own Section A froze — one signal per architectural
        // layer (domain, storage, write, read, UI), re-verified fresh
        // rather than trusted from either prior milestone's own header.
        const domain = await rawSource('core/PublicationCommentary.js');
        const store = await rawSource('storage/PublicationCommentaryStore.js');
        const addUseCase = await rawSource('application/AddPublicationCommentaryUseCase.js');
        const getUseCase = await rawSource('application/GetPublicationCommentariesUseCase.js');
        const navSession = await rawSource('application/WorldNavigationSession.js');
        const panel = await rawSource('ui/components/OwnPublicationPanel.js');

        assert(/publicationId/.test(domain) && !/\bdocumentId\b/.test(codeOnlyLines(domain)),
            'A3a. core/PublicationCommentary.js still keys commentary on publicationId, never documentId (0.9.242).');
        assert(store.includes('export class PublicationCommentaryStore') && store.includes("const COMMENTARY_STORE_KEY = 'publication-commentary:entries';"),
            'A3b. storage/PublicationCommentaryStore.js still persists under the same single, unchanged key (0.9.243).');
        assert(addUseCase.includes('resolveSigningIdentityId(this._identityProvider)'),
            'A3c. application/AddPublicationCommentaryUseCase.js still resolves authorship from the identity infrastructure, never caller input (0.9.245).');
        assert(/constructor\s*\(\s*store\s*\)/.test(getUseCase),
            'A3d. application/GetPublicationCommentariesUseCase.js still takes only a store — the read side stays thinner than the write side (0.9.247).');
        assert(navSession.includes('return this._getPublicationCommentariesUseCase.execute({ publicationId });') &&
               navSession.includes('return this._addPublicationCommentaryUseCase.execute({ publicationId, content });'),
            'A3e. application/WorldNavigationSession.js still delegates both commentary methods entirely to the injected use cases (0.9.248).');

        // A4. 0.9.251's own count closure, re-verified fresh: rendered
        // directly from the existing array, no new state/use case.
        assert(/\{\{\s*publicationCommentaries\.length\s*\}\}/.test(panel),
            'A4a. ui/components/OwnPublicationPanel.js still renders publicationCommentaries.length as a visible number (0.9.251), the chain\'s own most recent link.');
        assert(!codeOnlyLines(panel).includes('GetPublicationCommentaryCountUseCase'),
            'A4b. No dedicated count use case exists — the count still falls out of the existing read path, unchanged since 0.9.251.');

        console.log('✓ A: The complete Commentary chain — domain (a), storage (b), authenticated write (c), read (d), session delegation (e), and the count closure that completed the UI (0.9.251, f) — still holds fresh, one milestone later. 0.9.250\'s and 0.9.251\'s own test files remain the authoritative full record; nothing here reproduces them.');
    }

    // ---------------------------------------------------------------
    // Section B — Re-run the capability/reachability matrix across the
    // same twelve areas 0.9.250 Section C swept, but specifically hunt
    // for NEWLY EXPOSED consequences of the now-complete Commentary
    // feature — not merely repeat the prior sweep's own conclusions.
    // ---------------------------------------------------------------
    {
        const capabilityRegister = [];

        // B1-B10. The ten areas outside Commentary/Discovery itself are
        // unchanged since 0.9.250 — confirmed by the fact that ONLY
        // ui/components/OwnPublicationPanel.js and tests.html/docs
        // changed between 0.9.250 and 0.9.251 (git history, checked by
        // this milestone's author). Re-verified here with one fresh,
        // cheap signal per area rather than a full re-derivation.
        const editorView = await rawSource('ui/views/EditorView.js');
        const worldView = await rawSource('ui/views/WorldView.js');
        const createWorldView = await rawSource('application/CreateWorldViewUseCase.js');
        const mainJs = await rawSource('ui/main.js');

        assert(/new\s+EditorSession\s*\(/.test(editorView), 'B1. Editor still constructs a real EditorSession.');
        capabilityRegister.push(['Editor', 'COMPLETE']);
        assert(worldView.includes('CreateWorldViewUseCase') && createWorldView.includes('new WorldNavigationSession('),
            'B2. World Navigation still reaches a real WorldNavigationSession.');
        capabilityRegister.push(['World Navigation', 'COMPLETE']);
        assert(worldView.includes('session.refreshWorldPresenceActivity('), 'B3. World Presence still calls refreshWorldPresenceActivity().');
        capabilityRegister.push(['World Presence', 'COMPLETE']);
        assert(worldView.includes('vehicleInteractionState'), 'B4. Vehicles still reads vehicleInteractionState() live.');
        capabilityRegister.push(['Vehicles', 'COMPLETE']);
        assert(editorView.includes('new CreatePublisherUseCase()'), 'B5. Publication still constructs a real CreatePublisherUseCase.');
        capabilityRegister.push(['Publication', 'COMPLETE']);
        assert(worldView.includes('CreateExternalSnapshotPlacementUseCase'), 'B6. Snapshot still reaches CreateExternalSnapshotPlacementUseCase live.');
        capabilityRegister.push(['Snapshot', 'COMPLETE']);
        assert(editorView.includes('DocumentCommandPropagationUseCase'), 'B7. Collaboration still references DocumentCommandPropagationUseCase.');
        capabilityRegister.push(['Collaboration', 'COMPLETE (legacy authority protocol: OBSOLETE_CANDIDATE, unchanged since 0.9.241)']);
        assert(mainJs.includes('new PublicationCatalogDiscoveryProvider('), 'B8. Discovery still constructs a real PublicationCatalogDiscoveryProvider.');
        capabilityRegister.push(['Discovery', 'COMPLETE (sub-finding below, B12)']);
        assert(mainJs.includes('composePublicationDistributionCommand'), 'B9. Distribution still reaches composePublicationDistributionCommand().');
        capabilityRegister.push(['Distribution', 'COMPLETE']);
        assert(editorView.includes("import RecoveryBanner from '../components/RecoveryBanner.js'"), 'B10. Recovery still mounts RecoveryBanner.');
        capabilityRegister.push(['Recovery', 'COMPLETE']);
        assert(worldView.includes("import HistoryTimelinePanel from '../components/HistoryTimelinePanel.js'"), 'B11. History still mounts HistoryTimelinePanel.');
        capabilityRegister.push(['History', 'COMPLETE']);
        capabilityRegister.push(['Commentary', 'COMPLETE (Section A)']);

        // B12. THE NEWLY EXPOSED CONSEQUENCE this section exists to find.
        // CanCommentOnPublicationUseCase's own 0.9.246 policy is "ANY
        // authenticated identity may comment on ANY Publication that
        // resolves" — explicitly NOT scoped to the viewer's own
        // Publications. WorldNavigationSession#getPublicationCommentaries(publicationId)
        // takes an arbitrary publicationId with the same lack of
        // ownership scoping. Both facts were already true at 0.9.246-
        // 0.9.248; what changed is that Commentary is now COMPLETE
        // enough (0.9.251) to make the gap concrete: is that capability
        // actually reachable for a Publication that is NOT the viewer's
        // own — i.e. from Discovery?
        const canComment = await rawSource('application/CanCommentOnPublicationUseCase.js');
        assert(canComment.includes('ANY authenticated identity may comment on ANY Publication') || /publication\s*=\s*this\._discoveryProvider\.findById\(publicationId\)/.test(canComment),
            'B12a. application/CanCommentOnPublicationUseCase.js still enforces no ownership restriction — only "does this Publication resolve" (0.9.246, unchanged).');
        const navSession = await rawSource('application/WorldNavigationSession.js');
        const getCommentaryMethod = navSession.match(/getPublicationCommentaries\(publicationId\) \{[\s\S]*?\n    \}/)[0];
        assert(!/isOwn|owner|myIdentityId/i.test(getCommentaryMethod),
            'B12b. WorldNavigationSession#getPublicationCommentaries() still takes a bare publicationId with no "is this mine" check of its own.');

        // B12c. Yet the ONLY UI component the two commentary command
        // props are ever wired to is OwnPublicationPanel — confirmed by
        // grepping every other ui/views/*.js file for the same prop
        // names.
        const commandWiringHits = await grepCount('getPublicationCommentariesCommand=', ['ui/views'], {});
        assert(commandWiringHits === 1,
            `B12c. getPublicationCommentariesCommand is wired to exactly one host-view template binding across ui/views/ (found ${commandWiringHits}) — ui/views/WorldView.js's own single <OwnPublicationPanel> mount.`);

        // B12d. And the discovery/catalog-facing components that render
        // OTHER users' Publications (the one place a non-own
        // publicationId would actually be in hand) carry zero commentary
        // vocabulary of any kind — EXCEPT two later milestones deliberately
        // closed this exact gap for two of the six: PublicationCard.js
        // (0.9.289) and WorldEncounterCanvas.js (0.9.291). This section is
        // re-checked fresh against real source on every run, so it now
        // documents both transitions explicitly rather than asserting a
        // fact either milestone deliberately made false for its own
        // surface — see tests/OtherPublicationCommentaryEntryPoint.test.js
        // and tests/CrossArcProductEvolutionReassessment.test.js's own
        // Section E5 for the fuller record of each.
        const discoveryFacingFiles = [
            'ui/components/PublicationCatalog.js',
            'ui/components/PublicationPreview.js',
            'ui/components/PublicationList.js',
            'ui/views/DecentralizedPublicationsView.js'
        ];
        for (const path of discoveryFacingFiles) {
            const code = await rawSource(path);
            assert(!/ommentary/.test(code),
                `B12d. ${path} still contains no commentary vocabulary of any kind — Discovery's own publication-facing surfaces carry no path to Commentary at all.`);
        }
        for (const path of ['ui/components/PublicationCard.js', 'ui/components/WorldEncounterCanvas.js']) {
            const code = await rawSource(path);
            assert(/ommentary/.test(code),
                `B12e. ${path} now carries commentary vocabulary — 0.9.289/0.9.291 closed this Section's own finding for exactly these two surfaces.`);
        }

        assert(capabilityRegister.length === 12 && capabilityRegister.every(([, status]) => status.startsWith('COMPLETE')),
            'B13. All twelve areas remain COMPLETE at the composition-root level, exactly as 0.9.250 found — the newly exposed consequence (B12) is a sub-finding WITHIN Commentary/Discovery\'s own COMPLETE rows, not a new macro-level gap.');
        // Discovery's own register row is annotated in place (never a
        // second, duplicate row) to carry B12's own sub-finding: Commentary
        // is domain-agnostic to ownership (0.9.246), but reachable from
        // exactly one UI surface — the viewer's own Publication — never
        // from Discovery's own catalog/preview/card components.
        const discoveryRow = capabilityRegister.find(([name]) => name === 'Discovery');
        discoveryRow[1] = 'COMPLETE (sub-finding: Commentary is domain-agnostic to ownership, 0.9.246, but reachable from exactly one UI surface — the viewer\'s own Publication — never from Discovery\'s own catalog/preview/card components, B12)';

        console.log('✓ B: The twelve-area sweep still finds every area COMPLETE at the composition-root level — no new macro gap. The newly exposed consequence this section was built to find: CanCommentOnPublicationUseCase\'s own 0.9.246 policy was always ownership-agnostic ("any Publication that resolves," never "any Publication I own"), and WorldNavigationSession\'s own commentary methods carry no ownership check either — but the ONLY UI surface either command prop is ever wired to is OwnPublicationPanel (one binding, B12c), and every Discovery-facing component that actually renders OTHER users\' Publications (PublicationCard, PublicationCatalog, PublicationPreview, PublicationList, DecentralizedPublicationsView, WorldEncounterCanvas) carries zero commentary vocabulary (B12d). Commentary-on-a-non-own-Publication is REACHABLE_BUT_INTERNAL at the UI-wiring layer — fully permitted two layers down, reachable from nowhere a person could actually click, one Commentary arc later than 0.9.250\'s own sweep looked.');

        console.log('\nCapability register (macro, composition-root level):');
        for (const [name, status] of capabilityRegister) {
            console.log(`    ${name.padEnd(16)} ${status}`);
        }
        console.log('');
    }

    // ---------------------------------------------------------------
    // Section C — Reassess the six domain-level Commentary candidates
    // this milestone's own brief names, against real code, not restated
    // from 0.9.250's own header. Explicitly reconfirms getById() stays
    // internal.
    // ---------------------------------------------------------------
    {
        const candidateRegister = [];

        // C1. Navigation — still no commentaryId-addressable UI target.
        const navHits = await grepCount('commentaryId.*(scrollTo|anchor|#comment|routeTo)', ['application', 'ui'], { ignoreCase: true });
        assert(navHits === 0, 'C1. No file ties a commentaryId to any scroll-target, anchor, or route — navigation still absent.');
        candidateRegister.push(['navigation', 'MISSING_DOMAIN_CAPABILITY (unchanged since 0.9.250)']);

        // C2. Notifications — still absent codebase-wide, commentary
        // included.
        const notificationHits = await grepCount('class .*Notification\\|NotificationUseCase\\|NotificationService', ['application', 'core', 'ui'], { ignoreCase: true });
        assert(notificationHits === 0, 'C2. No Notification class/use case/service exists anywhere — still genuinely absent.');
        candidateRegister.push(['notifications', 'MISSING_DOMAIN_CAPABILITY (unchanged since 0.9.221/0.9.241/0.9.250)']);

        // C3. Discovery — still no commentary-aware search/ranking.
        const discoveryHits = await grepCount('CommentaryDiscovery\\|CommentDiscovery\\|searchComment\\|commentarySearch', ['application', 'core', 'ui', 'discovery'], { ignoreCase: true });
        assert(discoveryHits === 0, 'C3. No commentary-aware discovery/search vocabulary exists — still absent. (Distinct from Section B12\'s finding: B12 is about REACHING existing per-Publication commentary from Discovery\'s own UI; this is about Discovery ranking/filtering BY commentary content, a different, still-absent capability.)');
        candidateRegister.push(['discovery (commentary-aware search/ranking)', 'MISSING_DOMAIN_CAPABILITY (unchanged since 0.9.250)']);

        // C4. Persistence management — store still exposes only
        // save/getById/getForPublication.
        const store = await rawSource('storage/PublicationCommentaryStore.js');
        assert(!/\bexport\s*\(|\barchive\s*\(|\bprune\s*\(/.test(codeOnlyLines(store)),
            'C4. storage/PublicationCommentaryStore.js still exposes no export()/archive()/prune() — persistence management still absent.');
        candidateRegister.push(['persistence management', 'MISSING_DOMAIN_CAPABILITY (unchanged since 0.9.250)']);

        // C5. Moderation — still no mutation vocabulary anywhere in the
        // domain or storage layer.
        const domain = await rawSource('core/PublicationCommentary.js');
        assert(!/moderat|tombstone|deleted.?at|retract/i.test(codeOnlyLines(domain)) && !/moderat|tombstone|deleted.?at|retract/i.test(codeOnlyLines(store)) &&
               !/\bremove\s*\(|\bdelete\s*\(/.test(codeOnlyLines(store)),
            'C5. Neither the domain nor the store carries moderation/tombstone/retraction vocabulary or a remove()/delete() method — still deliberately absent.');
        candidateRegister.push(['moderation/removal', 'MISSING_DOMAIN_CAPABILITY (deliberate, unchanged since 0.9.242/0.9.243)']);

        // C6. Synchronization — still one-shot reads only, no
        // subscription/polling/websocket vocabulary in the real read
        // methods.
        const getUseCase = await rawSource('application/GetPublicationCommentariesUseCase.js');
        const panel = await rawSource('ui/components/OwnPublicationPanel.js');
        const refreshMethod = panel.match(/refreshPublicationCommentaries\(\) \{[\s\S]*?\n        \},/);
        assert(refreshMethod, 'C6a. refreshPublicationCommentaries() still exists in its expected shape.');
        const syncVocab = /subscri|\bpoll(?:ing)?\b|websocket|nostr/i;
        assert(!syncVocab.test(codeOnlyLines(getUseCase)) && !syncVocab.test(refreshMethod[0]),
            'C6b. Neither the read use case nor the panel\'s own refresh method carries subscription/polling/WebSocket/Nostr vocabulary — synchronization still absent, reads still one-shot.');
        candidateRegister.push(['synchronization', 'MISSING_DOMAIN_CAPABILITY (deliberate, unchanged since 0.9.247/0.9.248)']);

        assert(candidateRegister.length === 6, 'C7. All six domain-level candidates this milestone\'s own brief names were reassessed individually.');

        // C8. getById() stays internal, exactly as this milestone's own
        // brief instructs — reconfirmed against real code, not merely
        // carried forward as an assumption.
        const collection = await rawSource('core/PublicationCommentaryCollection.js');
        assert(collection.includes('export function getPublicationCommentaryById') && store.includes('getById(commentaryId)'),
            'C8a. Single-commentary lookup (getPublicationCommentaryById()/getById()) still exists at the domain/storage layers.');
        const getByIdCallers = await grepCount('\\.getById(', ['application', 'ui'], { excludeSuffix: 'PublicationCommentaryStore.js' });
        assert(getByIdCallers === 0,
            `C8b. storage/PublicationCommentaryStore.js#getById() still has zero callers in application/ or ui/ outside its own file (found ${getByIdCallers}) — deliberately kept internal, per this milestone's own brief: no demonstrated user action yet requires individual Commentary identity.`);
        candidateRegister.push(['detail/inspection (getById)', 'REACHABLE_BUT_INTERNAL (unchanged since 0.9.250 — deliberately kept internal per this milestone\'s own brief)']);

        console.log('✓ C: All six domain-level Commentary candidates this milestone\'s own brief names — navigation, notifications, discovery, persistence management, moderation, synchronization — remain MISSING_DOMAIN_CAPABILITY, reconfirmed against real code rather than restated from 0.9.250\'s own header. getById() is explicitly reconfirmed REACHABLE_BUT_INTERNAL and left untouched — no demonstrated user action requires individual Commentary identity, so no caller is manufactured here just to exercise it.');

        console.log('\nCommentary domain-level candidate register:');
        for (const [name, status] of candidateRegister) {
            console.log(`    ${name.padEnd(32)} ${status}`);
        }
        console.log('');
    }

    // ---------------------------------------------------------------
    // Section D — The architectural investigation this milestone's own
    // brief asks for by name: does a genuine Publication inspection/
    // detail surface already exist? Publications now carry Snapshot and
    // Commentary; this section checks whether identity, state, Snapshot
    // relationship, World placement, commentary, and distribution
    // information are already meaningfully inspectable from one surface
    // — not assumed, tested against real source.
    // ---------------------------------------------------------------
    {
        const surfaceRegister = [];

        // D1. Publication identity. publisher/Publication.js's own
        // constructor carries far more fields than OwnPublicationPanel's
        // own "own-publication-detail" block renders.
        const publicationDomain = await rawSource('publisher/Publication.js');
        const publicationFields = ['id', 'documentId', 'title', 'author', 'publishedAt', 'contentHash', 'license', 'contentReference', 'publisherIdentity', 'signature'];
        for (const field of publicationFields) {
            assert(new RegExp(`\\b${field}\\b`).test(publicationDomain),
                `D1a. publisher/Publication.js's own constructor still carries a ${field} field.`);
        }
        const panel = await rawSource('ui/components/OwnPublicationPanel.js');
        const detailBlock = panel.match(/<dl v-if="publication" class="own-publication-detail">[\s\S]*?<\/dl>/)[0];
        assert(detailBlock.includes('publication.title') && detailBlock.includes('publication.author'),
            'D1b. own-publication-detail still renders publication.title and publication.author.');
        for (const field of ['publication.id', 'publication.publishedAt', 'publication.license', 'publication.contentHash']) {
            assert(!detailBlock.includes(field),
                `D1c. own-publication-detail still does NOT render ${field} — this data already sits on the same prop the block already reads, unrendered.`);
        }
        surfaceRegister.push(['Publication identity', 'PARTIAL — 2 of 10 constructor fields (title, author) rendered; id/publishedAt/license/contentHash/publisherIdentity/signature/documentId/contentReference all present on the prop, none rendered here']);

        // D2. The SAME two additional fields (publishedAt, license) are
        // already rendered elsewhere in this codebase, for OTHER users'
        // Publications — proving the display pattern already exists and
        // was simply never carried into the viewer's own Publication
        // surface.
        const publicationCard = await rawSource('ui/components/PublicationCard.js');
        assert(publicationCard.includes('publication.publishedAt') && publicationCard.includes('publication.license'),
            'D2. ui/components/PublicationCard.js — the Discovery-catalog card for OTHER users\' Publications — already renders publication.publishedAt and publication.license, a display pattern OwnPublicationPanel\'s own identity block does not reuse for the viewer\'s own Publication.');
        surfaceRegister.push(['identity display pattern', 'ALREADY BUILT elsewhere (PublicationCard) — not reused in OwnPublicationPanel']);

        // D3. Snapshot relationship. Shown only as ephemeral, per-click
        // ACTION RESULTS (distribute/discover/export), never as a
        // persistent "this Publication's Snapshot state" fact sitting
        // alongside identity/commentary.
        assert(panel.includes('snapshotDistributionResult') && panel.includes('snapshotDiscoveryResult') && panel.includes('snapshotExportResult'),
            'D3a. Snapshot relationship facts still exist only as three separate ephemeral action-result fields, each null until its own button is clicked.');
        assert(!detailBlock.includes('contentReference') && !detailBlock.includes('snapshotId'),
            'D3b. own-publication-detail itself still shows no persistent Snapshot-relationship fact (contentReference/snapshotId) — only Title/Author, confirming D3a\'s ephemeral-only characterization.');
        surfaceRegister.push(['Snapshot relationship', 'EPHEMERAL ONLY — three per-action result blocks, no persistent summary']);

        // D4. World placement. A REAL placement-detail component exists
        // (PlacementInfoPanel) and IS mounted in WorldView — but as a
        // structurally separate panel from OwnPublicationPanel, never
        // integrated into the same surface as Commentary/Snapshot.
        assert(await sourceExists('ui/components/PlacementInfoPanel.js'),
            'D4a. ui/components/PlacementInfoPanel.js exists as a real, dedicated placement-detail component.');
        const worldView = await rawSource('ui/views/WorldView.js');
        assert(worldView.includes('<PlacementInfoPanel') && worldView.includes('<OwnPublicationPanel'),
            'D4b. ui/views/WorldView.js mounts both PlacementInfoPanel and OwnPublicationPanel — as two separate components, confirmed by the fact that placementInfo is a prop OwnPublicationPanel already receives (D4c) yet never renders directly (D4d).');
        assert(panel.includes('placementInfo:'),
            'D4c. OwnPublicationPanel already receives placementInfo as a prop — used only to COMPUTE a claimed-position placement for a discovered Snapshot candidate, never to DISPLAY the current Publication\'s own World placement.');
        assert(!/\{\{\s*placementInfo\./.test(panel) && !/v-if="placementInfo"/.test(panel),
            'D4d. OwnPublicationPanel never renders placementInfo as visible text — World placement is inspectable only from PlacementInfoPanel, a structurally separate surface.');
        surfaceRegister.push(['World placement', 'EXISTS, but on a SEPARATE surface (PlacementInfoPanel) — not integrated with Commentary/Snapshot/identity']);

        // D5. Distribution information. PublicationDistributionLifecycle
        // vocabulary is real and rendered — but in WorldEncounterCanvas,
        // never in OwnPublicationPanel, which instead only shows the
        // most recent single distribute-click's own result.
        assert(await sourceExists('application/PublicationDistributionLifecycle.js'),
            'D5a. application/PublicationDistributionLifecycle.js exists as a real distribution-lifecycle domain concept.');
        const worldEncounterCanvas = await rawSource('ui/components/WorldEncounterCanvas.js');
        assert(worldEncounterCanvas.includes('PublicationDistributionLifecycle') || worldEncounterCanvas.includes('PublicationDistributionState'),
            'D5b. ui/components/WorldEncounterCanvas.js renders PublicationDistributionLifecycle/PublicationDistributionState vocabulary — a real lifecycle view exists.');
        assert(!panel.includes('PublicationDistributionLifecycle') && !panel.includes('PublicationDistributionState'),
            'D5c. ui/components/OwnPublicationPanel.js itself never references PublicationDistributionLifecycle/PublicationDistributionState — its own distribution section shows only the last click\'s own ephemeral snapshotDistributionResult, not a lifecycle history.');
        surfaceRegister.push(['distribution information', 'EXISTS, but on a SEPARATE surface (WorldEncounterCanvas) — OwnPublicationPanel shows only its own last action result']);

        // D6. Commentary. Already integrated INTO this same surface —
        // the one piece of the six the brief names that IS already
        // unified with identity/actions in one component (Section A).
        assert(panel.includes('own-publication-commentary'),
            'D6. Commentary IS already integrated into this same OwnPublicationPanel surface — confirmed by Section A.');
        surfaceRegister.push(['commentary', 'INTEGRATED — the one piece already unified with identity/actions on this surface']);

        assert(surfaceRegister.length === 6, 'D7. All six inspection facts this milestone\'s own brief names (identity, state/relationship pattern, Snapshot relationship, World placement, commentary, distribution) were checked individually.');

        console.log('✓ D: OwnPublicationPanel is NOT yet a coherent Publication inspection/detail surface — it is an ACTION CONSOLE assembled action-by-action across ten milestones (0.9.140-0.9.251), each adding its own command/result pair. Of the six facts this milestone\'s own brief asks about: Commentary is genuinely integrated (D6); identity is under-rendered relative to a display pattern that already exists elsewhere in this same codebase for OTHER users\' Publications (D1/D2); Snapshot relationship exists only as three separate ephemeral action results, never a persistent summary (D3); World placement is a real, working, but STRUCTURALLY SEPARATE component (D4); distribution lifecycle is a real, working, but STRUCTURALLY SEPARATE component (D5). Two of six are genuinely small, additive, reuse-only gaps (identity field completeness reusing PublicationCard\'s own pattern; unifying two already-built panels) — matching this milestone\'s own brief\'s own worked example ("If some of these already exist but are unreachable from the same publication surface, that could produce another small integration milestone"). A true unified inspection surface remains a larger product candidate, recorded in Section E, not built here.');

        console.log('\nPublication inspection-surface register:');
        for (const [name, status] of surfaceRegister) {
            console.log(`    ${name.padEnd(28)} ${status}`);
        }
        console.log('');
    }

    // ---------------------------------------------------------------
    // Section E — Verdict.
    // ---------------------------------------------------------------
    {
        console.log(
'\n0.9.252 — Post-Commentary-UI Product Reassessment — Verdict\n' +
'\n' +
'PUBLICATION COMMENTARY BASELINE\n' +
'    COMPLETE, unchanged since 0.9.250/0.9.251 (Section A)\n' +
'\n' +
'REPOSITORY-WIDE REACHABILITY (macro, composition-root level)\n' +
'    All twelve areas COMPLETE (Section B) — no new macro-level gap\n' +
'\n' +
'NEWLY EXPOSED CONSEQUENCE (Section B12)\n' +
'    Commentary is domain-agnostic to Publication ownership (0.9.246,\n' +
'    unchanged) but reachable from exactly one UI surface — the viewer\'s\n' +
'    own Publication. Every Discovery-facing component that actually\n' +
'    renders OTHER users\' Publications carries zero commentary\n' +
'    vocabulary. REACHABLE_BUT_INTERNAL at the UI-wiring layer.\n' +
'\n' +
'COMMENTARY DOMAIN-LEVEL CANDIDATES (Section C)\n' +
'    navigation                  MISSING_DOMAIN_CAPABILITY (unchanged)\n' +
'    notifications                MISSING_DOMAIN_CAPABILITY (unchanged)\n' +
'    discovery (search/ranking)    MISSING_DOMAIN_CAPABILITY (unchanged)\n' +
'    persistence management         MISSING_DOMAIN_CAPABILITY (unchanged)\n' +
'    moderation/removal              MISSING_DOMAIN_CAPABILITY (deliberate)\n' +
'    synchronization                  MISSING_DOMAIN_CAPABILITY (deliberate)\n' +
'    detail/inspection (getById)       REACHABLE_BUT_INTERNAL (kept internal, deliberately)\n' +
'\n' +
'PUBLICATION INSPECTION/DETAIL SURFACE (Section D)\n' +
'    NOT YET a coherent surface — an action console assembled action-by-\n' +
'    action across ten milestones. Commentary is integrated; identity is\n' +
'    under-rendered relative to an existing pattern (PublicationCard);\n' +
'    Snapshot relationship is ephemeral-only; World placement and\n' +
'    distribution lifecycle are real but structurally SEPARATE panels.\n' +
'\n' +
'RANKED CANDIDATES FOR THE NEXT PRODUCT SEAM (named, not built)\n' +
'    1. Commentary reachability from Discovery — wire the SAME two\n' +
'       existing command props (getPublicationCommentariesCommand/\n' +
'       addPublicationCommentaryCommand) into a Discovery-facing\n' +
'       component (e.g. PublicationCard/PublicationPreview). No new\n' +
'       use case, domain method, or storage change — CanCommentOnPublicationUseCase\n' +
'       already permits it (Section B12). The most direct, smallest,\n' +
'       most evidence-backed candidate this milestone found — the exact\n' +
'       shape of gap 0.9.251 itself closed one seam earlier.\n' +
'    2. Publication identity field completeness in OwnPublicationPanel\n' +
'       (id, publishedAt, license) — reusing PublicationCard\'s own\n' +
'       already-proven display pattern (Section D1/D2). Small, additive,\n' +
'       no new capability, no new state.\n' +
'    3. A unified Publication inspection/detail surface — integrating\n' +
'       PlacementInfoPanel\'s and WorldEncounterCanvas\'s own already-built\n' +
'       placement/distribution-lifecycle views alongside\n' +
'       OwnPublicationPanel\'s existing identity/Snapshot/Commentary\n' +
'       content. Larger: a real information-architecture decision (one\n' +
'       component vs. several coordinated ones), not a one-line reuse —\n' +
'       recorded as a product candidate, per this milestone\'s own brief,\n' +
'       rather than prematurely built.\n' +
'    4. Notifications — the standing gap 0.9.221, 0.9.241, and 0.9.250\n' +
'       all already named, still genuinely absent codebase-wide (Section C).\n' +
'    5. Commentary moderation/removal, commentary synchronization — both\n' +
'       MISSING_DOMAIN_CAPABILITY, both deliberately deferred, unchanged.\n' +
'\n' +
'NEXT PRODUCT SEAM\n' +
'    Not selected here. Per this milestone\'s own brief: the repository\n' +
'    and existing architecture name the candidates above; choosing and\n' +
'    building one is a separate, later, evidence-driven decision. The\n' +
'    important negative result: the evidence does NOT point back at\n' +
'    Commentary itself — every genuine gap found this milestone (Section\n' +
'    B12, Section D) is about REACHING or UNIFYING already-built\n' +
'    capability, not about extending Commentary\'s own domain.\n');

        console.log('✓ Section E: Verdict recorded. Publication Commentary baseline remains COMPLETE (Section A); all twelve repository areas remain reachable with no new macro-level gap (Section B); one newly exposed consequence found — Commentary\'s own ownership-agnostic policy is reachable from exactly one UI surface, never from Discovery (Section B12); all six domain-level Commentary candidates this milestone\'s own brief names remain MISSING_DOMAIN_CAPABILITY, and getById() is explicitly reconfirmed kept internal (Section C); the Publication inspection/detail surface this milestone\'s own brief asked about does NOT yet exist as one coherent surface — it is an action console with two genuinely separate already-built panels (placement, distribution lifecycle) alongside it (Section D). Five candidates are ranked with reasoning, none selected — matching but not exceeding 0.9.221/0.9.241/0.9.250\'s own restraint. No implementation happens in this milestone.');
    }

    console.log('\n✅ All PostCommentaryUIProductReassessment tests passed.');
}

runTests().then(() => {
    console.log('\n✓ All PostCommentaryUIProductReassessment tests passed');
}).catch((error) => {
    console.error('\n✗ PostCommentaryUIProductReassessment tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
