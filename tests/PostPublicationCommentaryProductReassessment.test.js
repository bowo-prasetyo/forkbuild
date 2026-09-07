import { readFile } from 'node:fs/promises';

// 0.9.250 — Post-Publication-Commentary Product Reassessment.
//
// Test/document-only. No production changes. 0.9.242-0.9.249 ran one
// continuous arc: a domain boundary that deliberately ties commentary to
// an immutable Publication rather than a mutable Document (0.9.242),
// durable append-only storage (0.9.243), an application write command
// (0.9.244), authenticated authorship (0.9.245), enforced authorization
// (0.9.246), an application read/query command (0.9.247), real UI
// integration into OwnPublicationPanel through WorldNavigationSession
// (0.9.248), and a ten-section lifecycle/isolation audit that found the
// implementation already correct on every property it tested (0.9.249).
//
// This milestone does not extend that arc. Like 0.9.221 (after the first
// product-evolution baseline arc) and 0.9.241 (after the collaboration
// arc) before it, it does the same four things one arc later:
//
//   Section A — Freeze the Commentary pipeline as a compact fingerprint:
//               one concrete source signal per stage named in this
//               milestone's own brief, Publication through
//               OwnPublicationPanel.
//   Section B — Reuse, not reproduce, 0.9.249's own 755-line lifecycle
//               audit: a handful of fresh, cheap, structural
//               re-verifications of its named properties, plus an
//               explicit verdict.
//   Section C — A repository-wide capability/reachability sweep across
//               the twelve areas this milestone's own brief names,
//               classified COMPLETE / REACHABLE_BUT_INTERNAL /
//               MISSING_UI / MISSING_DOMAIN_CAPABILITY /
//               OBSOLETE_CANDIDATE / DEFERRED.
//   Section D — Commentary's own remaining seams, tested individually
//               rather than assumed: detail/inspection, identity
//               display, count, navigation, notifications, discovery,
//               persistence management, moderation/removal,
//               synchronization.
//   Section E — Reconfirm the collaboration boundary: prove there is
//               still no reason to merge Commentary into the
//               0.9.222-0.9.240 causal-collaboration arc.
//   Section F — Verdict. Ranked candidates, nothing built.
//
//   0.9.196 ── … ── 0.9.221 ── 0.9.222 ── … ── 0.9.241 ── 0.9.242 ── … ── 0.9.249 ── 0.9.250  <- this
//    (arc 1:        (product      (arc 2:      (freeze +   (arc 3:       (lifecycle   (freeze +
//     reachability)  evolution     collab.)     re-rank,     Commentary)   audit)       reachability +
//                     baseline)                 picks                                  re-rank, no pick)
//                                                Commentary)

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

// Mirrors tests/PostCollaborationProductReassessment.test.js's own helper,
// itself mirroring tests/ProductEvolutionBaseline.test.js's B3 — the one
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
    console.log('Running Post-Publication-Commentary Product Reassessment tests...\n');

    // ---------------------------------------------------------------
    // Section A — Commentary capability closure.
    //
    // One representative wiring signal per stage of this milestone's own
    // brief's pipeline diagram, read fresh from the real, unmodified
    // source — not restated from 0.9.242-0.9.249's own headers.
    // ---------------------------------------------------------------
    {
        const domain = await rawSource('core/PublicationCommentary.js');
        const store = await rawSource('storage/PublicationCommentaryStore.js');
        const addUseCase = await rawSource('application/AddPublicationCommentaryUseCase.js');
        const getUseCase = await rawSource('application/GetPublicationCommentariesUseCase.js');
        const canComment = await rawSource('application/CanCommentOnPublicationUseCase.js');
        const navSession = await rawSource('application/WorldNavigationSession.js');
        const createWorldView = await rawSource('application/CreateWorldViewUseCase.js');
        const panel = await rawSource('ui/components/OwnPublicationPanel.js');

        // A1a. Publication, not Document — the one architectural decision
        // 0.9.242's own header calls out explicitly.
        assert(/publicationId/.test(domain) && !/\bdocumentId\b/.test(codeOnlyLines(domain)),
            'A1a. core/PublicationCommentary.js still keys commentary on publicationId and its own CODE never mentions documentId — a commentary discusses an immutable Publication, never a mutable Document (0.9.242).');

        // A1b. Persistent storage — append-only, no remove/update/clear.
        assert(store.includes('export class PublicationCommentaryStore') && store.includes('save(commentary)') && store.includes('getForPublication('),
            'A1b. storage/PublicationCommentaryStore.js still exposes save()/getById()/getForPublication() over an injected StorageProvider (0.9.243).');
        assert(!/\bremove\s*\(|\bupdate\s*\(|\bclear\s*\(/.test(codeOnlyLines(store)),
            'A1b\'. storage/PublicationCommentaryStore.js\'s own CODE still exposes no remove()/update()/clear() method — append-only, exactly as its own header states (0.9.243).');

        // A1c. Authenticated authorship — resolved from the identity
        // infrastructure, never accepted as caller input.
        assert(addUseCase.includes('resolveSigningIdentityId(this._identityProvider)'),
            'A1c. application/AddPublicationCommentaryUseCase.js still resolves authorIdentityId from resolveSigningIdentityId(identityProvider), never from caller input (0.9.245).');
        assert(!/input\.authorIdentityId|\{\s*authorIdentityId[,\s]/.test(codeOnlyLines(addUseCase)),
            'A1c\'. application/AddPublicationCommentaryUseCase.js\'s own execute() still never destructures or reads an authorIdentityId from its input.');

        // A1d. Authorization — enforced BEFORE construction, via an
        // injected collaborator, never inlined. Searched within
        // codeOnlyLines() only — the header's own prose diagram mentions
        // both phrases too, in the opposite order, and would otherwise
        // produce a false pass/fail unrelated to the real execute() body.
        const addUseCaseCode = codeOnlyLines(addUseCase);
        const authIdx = addUseCaseCode.indexOf('_canCommentOnPublicationUseCase.execute(');
        const constructIdx = addUseCaseCode.indexOf('new PublicationCommentary(');
        assert(authIdx !== -1 && constructIdx !== -1 && authIdx < constructIdx,
            'A1d. application/AddPublicationCommentaryUseCase.js still calls canCommentOnPublicationUseCase.execute() strictly before constructing a PublicationCommentary — a denied request never reaches domain construction (0.9.246).');
        assert(canComment.includes('discoveryProvider.findById(publicationId)'),
            'A1d\'. application/CanCommentOnPublicationUseCase.js still enforces "the Publication actually resolves through discovery" as its one real policy, reusing discoveryProvider rather than a new permission table (0.9.246).');

        // A1e. Read command — no identity/authorization dependency at
        // all, deliberately thinner than the write side. Checked against
        // codeOnlyLines() — the header's own prose explains the ABSENCE
        // of identityProvider by name, which would otherwise defeat a
        // raw substring check.
        assert(/constructor\s*\(\s*store\s*\)/.test(getUseCase) && !codeOnlyLines(getUseCase).includes('identityProvider'),
            'A1e. application/GetPublicationCommentariesUseCase.js still takes only a store — no identityProvider, no authorization check on the read path (0.9.247).');

        // A1f. Write command — the one orchestrator tying identity,
        // authorization, domain, and storage together.
        assert(/constructor\s*\(\s*store,\s*identityProvider,\s*canCommentOnPublicationUseCase\s*\)/.test(addUseCase),
            'A1f. application/AddPublicationCommentaryUseCase.js still requires exactly store, identityProvider, and canCommentOnPublicationUseCase — the full write-side chain, nothing more (0.9.244-0.9.246).');

        // A1g. WorldNavigationSession — thin delegation, no reimplemented
        // logic, asymmetric failure posture (read degrades, write throws).
        assert(navSession.includes('return this._getPublicationCommentariesUseCase.execute({ publicationId });') &&
               navSession.includes('return this._addPublicationCommentaryUseCase.execute({ publicationId, content });'),
            'A1g. application/WorldNavigationSession.js#getPublicationCommentaries()/addPublicationCommentary() still delegate their entire body to the injected use cases (0.9.248).');

        // A1h. WorldView composition root — the SAME storageProvider/
        // discoveryProvider/identityProvider every other local
        // collaborator in CreateWorldViewUseCase already shares.
        assert(createWorldView.includes('new PublicationCommentaryStore(storageProvider)') &&
               createWorldView.includes('new CanCommentOnPublicationUseCase(discoveryProvider)') &&
               /new AddPublicationCommentaryUseCase\(\s*publicationCommentaryStore,\s*identityProvider,\s*canCommentOnPublicationUseCase\s*\)/.test(createWorldView),
            'A1h. application/CreateWorldViewUseCase.js still composes the commentary chain from the exact same storageProvider/discoveryProvider/identityProvider variables every other local collaborator in this method already shares — no second storage key, no second discovery or identity mechanism (0.9.248).');

        // A1i. OwnPublicationPanel — the UI never imports the domain,
        // storage, or use-case classes directly; only the two thin
        // command props reach it.
        const panelHead = panel.slice(0, panel.indexOf('export default') !== -1 ? panel.indexOf('export default') : 2000);
        for (const forbidden of ['PublicationCommentary', 'PublicationCommentaryStore', 'GetPublicationCommentariesUseCase', 'AddPublicationCommentaryUseCase', 'CanCommentOnPublicationUseCase']) {
            assert(!panel.includes(`import`) || !new RegExp(`import[^\\n]*\\b${forbidden}\\b`).test(panel),
                `A1i. ui/components/OwnPublicationPanel.js still never imports ${forbidden} — it reaches commentary only through getPublicationCommentariesCommand/addPublicationCommentaryCommand (0.9.248).`);
        }
        assert(panel.includes('getPublicationCommentariesCommand') && panel.includes('addPublicationCommentaryCommand'),
            'A1i\'. ui/components/OwnPublicationPanel.js still reaches commentary through exactly the two injected command props.');

        console.log('✓ A: All nine pipeline stages this milestone\'s own brief names — Publication (a), persistent storage (b), authenticated authorship (c), authorization (d), read command (e), write command (f), WorldNavigationSession (g), WorldView/CreateWorldViewUseCase composition (h), and OwnPublicationPanel (i) — still hold their representative wiring signal in the real, unmodified source. No production file needed a change to reconfirm this.');
    }

    // ---------------------------------------------------------------
    // Section B — Lifecycle closure, reused from 0.9.249, not
    // reproduced. 0.9.249's own ten sections (A-J) already proved create,
    // read, persistence, authorship authority, authorization enforcement,
    // Publication isolation, UI-state/store separation, and failure-
    // boundary cleanliness against the real application stack end to end.
    // This section re-verifies a handful of the cheapest, most durable
    // structural facts those findings depend on, fresh, and then states
    // the verdict — it does not re-run 0.9.249's own 755 lines.
    // ---------------------------------------------------------------
    {
        assert(await sourceExists('tests/PublicationCommentaryLifecycleAudit.test.js'),
            'B1. tests/PublicationCommentaryLifecycleAudit.test.js (0.9.249) still exists as the authoritative ten-section lifecycle/isolation audit this section reuses rather than reproduces.');

        const lifecycleAudit = await rawSource('tests/PublicationCommentaryLifecycleAudit.test.js');
        assert(lifecycleAudit.includes('Section J. Architecture boundary') || lifecycleAudit.includes('J. Architecture boundary') || /Section J/.test(lifecycleAudit),
            'B2. tests/PublicationCommentaryLifecycleAudit.test.js still contains its own Section J architecture-boundary proof — the source this milestone leans on rather than re-deriving.');

        // B3. Persistence: the store's own key is a single, fixed,
        // unmodified constant — a fresh, cheap re-check that the
        // durable-storage claim 0.9.249 Section H proved end to end still
        // rests on one unchanged storage key, not a new one introduced
        // since.
        const store = await rawSource('storage/PublicationCommentaryStore.js');
        assert(store.includes("const COMMENTARY_STORE_KEY = 'publication-commentary:entries';"),
            'B3. storage/PublicationCommentaryStore.js still persists under the exact same single, unchanged key 0.9.249\'s own Section H persistence audit ran against.');

        // B4. Authorship authority: still resolved fresh per call, never
        // cached on the use case instance itself (a stale cached identity
        // would silently misattribute authorship across users sharing one
        // WorldNavigationSession/use-case composition — 0.9.249 Section E
        // proved this live with Alice/Bob/Alice; this is the structural
        // precondition that result depends on).
        const addUseCase = await rawSource('application/AddPublicationCommentaryUseCase.js');
        assert(!/this\._authorIdentityId\s*=/.test(addUseCase),
            'B4. application/AddPublicationCommentaryUseCase.js still caches no authorIdentityId on itself — resolveSigningIdentityId() runs fresh inside execute() every call, the precondition 0.9.249 Section E\'s Alice/Bob/Alice authorship-isolation proof depends on.');

        // B5. UI state is not a second source of truth: OwnPublicationPanel
        // still re-queries rather than optimistically appending on a
        // successful submission — the exact structural fact 0.9.249
        // Section C proved with a destructive stale-array test.
        const panel = await rawSource('ui/components/OwnPublicationPanel.js');
        assert(panel.includes('refreshPublicationCommentaries()') &&
               !/publicationCommentaries\.push\(/.test(codeOnlyLines(panel)),
            'B5. ui/components/OwnPublicationPanel.js\'s own CODE still never pushes a locally-held commentary object into publicationCommentaries — every successful submission re-queries through refreshPublicationCommentaries(), the store staying the one source of truth (0.9.248/0.9.249 Section C).');

        // B6. Failure boundaries: a failed read still never wipes
        // existing state; only a failed empty/no-capability case does.
        assert(panel.includes('this.publicationCommentaryError = error.message') || panel.includes('publicationCommentaryError ='),
            'B6. ui/components/OwnPublicationPanel.js still surfaces read/write failures through publicationCommentaryError rather than silently discarding them (0.9.249 Section G).');

        console.log('✓ B: 0.9.249\'s ten-section lifecycle/isolation audit is reused, not reproduced (B1/B2); its persistence key (B3), fresh-per-call authorship resolution (B4), re-query-not-append UI discipline (B5), and failure-surfacing behavior (B6) are all re-verified fresh against the real, unmodified source. Verdict: Publication Commentary baseline COMPLETE — create, read, persistence, authorship authority, authorization enforcement, Publication isolation, UI/store separation, and failure-boundary cleanliness all hold, with no production change required to reconfirm any of them.');
    }

    // ---------------------------------------------------------------
    // Section C — Repository-wide capability/reachability sweep across
    // the twelve areas this milestone's own brief names. Each row cites
    // one concrete, grep-verifiable composition-root signal — the same
    // "fingerprint, not full re-derivation" discipline Section A uses,
    // applied one layer up. Areas already established COMPLETE by
    // 0.9.196's own baseline (Editor, World Navigation, World Presence,
    // Publication, Snapshot) and by 0.9.241 (Collaboration) are
    // reconfirmed fresh here, not re-audited from zero.
    // ---------------------------------------------------------------
    {
        const capabilityRegister = [];

        // C1. Editor — ui/views/EditorView.js constructs the real
        // EditorSession composition root (0.9.196 baseline, reconfirmed
        // 0.9.241 Section B1a).
        const editorView = await rawSource('ui/views/EditorView.js');
        assert(/new\s+EditorSession\s*\(/.test(editorView),
            'C1. ui/views/EditorView.js still constructs a real EditorSession.');
        capabilityRegister.push(['Editor', 'COMPLETE']);

        // C2. World Navigation — ui/views/WorldView.js reaches
        // CreateWorldViewUseCase, which itself constructs the real
        // WorldNavigationSession composition root.
        const worldView = await rawSource('ui/views/WorldView.js');
        const createWorldView = await rawSource('application/CreateWorldViewUseCase.js');
        assert(worldView.includes('CreateWorldViewUseCase') && createWorldView.includes('new WorldNavigationSession('),
            'C2. ui/views/WorldView.js still reaches application/CreateWorldViewUseCase.js, which still constructs a real WorldNavigationSession.');
        capabilityRegister.push(['World Navigation', 'COMPLETE']);

        // C3. World Presence — refreshWorldPresenceActivity() wired into
        // WorldView, CreateAvatarPresenceSessionUseCase wired into
        // CreateWorldViewUseCase (0.9.217-0.9.219).
        assert(worldView.includes('session.refreshWorldPresenceActivity(') && createWorldView.includes('CreateAvatarPresenceSessionUseCase'),
            'C3. ui/views/WorldView.js still calls session.refreshWorldPresenceActivity(), and application/CreateWorldViewUseCase.js still wires CreateAvatarPresenceSessionUseCase.');
        capabilityRegister.push(['World Presence', 'COMPLETE']);

        // C4. Vehicles — AvatarVehicleInteractionController/
        // AvatarVehicleMovementController imported and used by
        // WorldNavigationSession, referenced live in WorldView.
        const navSession = await rawSource('application/WorldNavigationSession.js');
        assert(navSession.includes("import { AvatarVehicleInteractionController }") &&
               navSession.includes("import { AvatarVehicleMovementController }") &&
               worldView.includes('vehicleInteractionState'),
            'C4. application/WorldNavigationSession.js still imports both vehicle controllers, and ui/views/WorldView.js still reads vehicleInteractionState() live.');
        capabilityRegister.push(['Vehicles', 'COMPLETE']);

        // C5. Publication — the publish workflow's own composition root,
        // PublishDocumentUseCase, wired into CreateWorldViewUseCase and
        // constructed live from ui/views/EditorView.js's own
        // CreatePublisherUseCase call.
        assert(createWorldView.includes("import { PublishDocumentUseCase }") &&
               editorView.includes('new CreatePublisherUseCase()'),
            'C5. application/CreateWorldViewUseCase.js still imports PublishDocumentUseCase, and ui/views/EditorView.js still constructs a real CreatePublisherUseCase.');
        capabilityRegister.push(['Publication', 'COMPLETE']);

        // C6. Snapshot — CreateExternalSnapshotPlacementUseCase reached
        // live from WorldView (0.9.215/0.9.216 baseline).
        assert(worldView.includes('CreateExternalSnapshotPlacementUseCase'),
            'C6. ui/views/WorldView.js still references application/CreateExternalSnapshotPlacementUseCase.js live.');
        capabilityRegister.push(['Snapshot', 'COMPLETE']);

        // C7. Commentary — Section A/B above, in full.
        capabilityRegister.push(['Commentary', 'COMPLETE']);

        // C8. Collaboration — EditorSession still wires
        // DocumentCommandPropagationUseCase (0.9.222-0.9.240 baseline,
        // reconfirmed 0.9.241 Section A/B1); the legacy 0.2.7-0.2.9
        // authority protocol 0.9.241 Section B2 found stranded is
        // reconfirmed still stranded here, fresh, not re-derived from
        // scratch — one call each, not the six-file audit 0.9.241 ran.
        assert(editorView.includes('DocumentCommandPropagationUseCase'),
            'C8a. ui/views/EditorView.js still references DocumentCommandPropagationUseCase directly.');
        const legacyCollabCallers = await constructorCallerCount('CollaborationSession', ['application', 'ui'], { excludeSuffix: 'CreateCollaborationUseCase.js' });
        assert(legacyCollabCallers === 0,
            `C8b. collaboration/CollaborationSession.js still has zero "new CollaborationSession(" callers in application/ or ui/ outside application/CreateCollaborationUseCase.js (found ${legacyCollabCallers}) — the 0.9.241 Section B2 OBSOLETE_CANDIDATE finding still holds, unchanged, nothing deleted.`);
        capabilityRegister.push(['Collaboration', 'COMPLETE (legacy 0.2.7-0.2.9 authority protocol: OBSOLETE_CANDIDATE, unchanged since 0.9.241)']);

        // C9. Discovery — PublicationCatalogDiscoveryProvider constructed
        // live in ui/main.js.
        const mainJs = await rawSource('ui/main.js');
        assert(mainJs.includes('new PublicationCatalogDiscoveryProvider('),
            'C9. ui/main.js still constructs a real PublicationCatalogDiscoveryProvider.');
        capabilityRegister.push(['Discovery', 'COMPLETE']);

        // C10. Distribution — composePublicationDistributionCommand
        // reached from ui/main.js, executePublicationDistributionCommand
        // reached from a live component.
        const worldEncounterCanvas = await rawSource('ui/components/WorldEncounterCanvas.js');
        assert(mainJs.includes('composePublicationDistributionCommand') && worldEncounterCanvas.includes('executePublicationDistributionCommand'),
            'C10. ui/main.js still reaches composePublicationDistributionCommand(), and ui/components/WorldEncounterCanvas.js still calls executePublicationDistributionCommand().');
        capabilityRegister.push(['Distribution', 'COMPLETE']);

        // C11. Recovery — RecoveryBanner mounted in EditorView, backed by
        // CheckRecoveryUseCase/RecoverDocumentUseCase.
        assert(editorView.includes("import RecoveryBanner from '../components/RecoveryBanner.js'") &&
               (editorView.includes('CheckRecoveryUseCase') || editorView.includes('RecoverDocumentUseCase')),
            'C11. ui/views/EditorView.js still mounts RecoveryBanner and references the recovery use cases behind it.');
        capabilityRegister.push(['Recovery', 'COMPLETE']);

        // C12. History — HistoryTimelinePanel mounted in WorldView.
        assert(worldView.includes("import HistoryTimelinePanel from '../components/HistoryTimelinePanel.js'") &&
               worldView.includes('<HistoryTimelinePanel'),
            'C12. ui/views/WorldView.js still imports and mounts a real HistoryTimelinePanel.');
        capabilityRegister.push(['History', 'COMPLETE']);

        assert(capabilityRegister.length === 12 && capabilityRegister.every(([, status]) => status.startsWith('COMPLETE')),
            'C13. All twelve areas this milestone\'s own brief names classify COMPLETE at the composition-root level — no area is MISSING_UI or MISSING_DOMAIN_CAPABILITY at this macro granularity; the one standing OBSOLETE_CANDIDATE (legacy collaboration) is a sub-finding within an otherwise COMPLETE Collaboration row, unchanged since 0.9.241.');

        console.log('✓ C: Repository-wide capability/reachability sweep — all twelve areas (Editor, World Navigation, World Presence, Vehicles, Publication, Snapshot, Commentary, Collaboration, Discovery, Distribution, Recovery, History) reconfirmed COMPLETE and reachable from a real product entry point, each on one fresh, concrete, grep-verifiable composition-root signal. The only sub-finding is the legacy 0.2.7-0.2.9 collaboration protocol 0.9.241 already classified OBSOLETE_CANDIDATE — still zero callers, still undeleted. Nothing new is stranded at this macro level; the genuinely interesting reachability gaps are all internal to Commentary itself — Section D.');

        console.log('\nCapability register (macro, composition-root level):');
        for (const [name, status] of capabilityRegister) {
            console.log(`    ${name.padEnd(16)} ${status}`);
        }
        console.log('');
    }

    // ---------------------------------------------------------------
    // Section D — Commentary's own remaining seams. Not assumed absent
    // or present — each one tested individually, against the real
    // source, per this milestone's own brief.
    // ---------------------------------------------------------------
    {
        const seamRegister = [];

        // D1. Commentary detail/inspection. core/PublicationCommentaryCollection.js
        // exports getPublicationCommentaryById(); storage/
        // PublicationCommentaryStore.js wraps it as getById(). Both exist
        // — but do either have a real caller reaching from application/
        // or ui/ outside their own two files?
        const collection = await rawSource('core/PublicationCommentaryCollection.js');
        const store = await rawSource('storage/PublicationCommentaryStore.js');
        assert(collection.includes('export function getPublicationCommentaryById') && store.includes('getById(commentaryId)'),
            'D1a. core/PublicationCommentaryCollection.js#getPublicationCommentaryById() and storage/PublicationCommentaryStore.js#getById() both still exist — single-commentary lookup by id is already built at the domain/storage layers.');
        const getByIdCallers = await grepCount('\\.getById(', ['application', 'ui'], { excludeSuffix: 'PublicationCommentaryStore.js' });
        assert(getByIdCallers === 0,
            `D1b. storage/PublicationCommentaryStore.js#getById() still has zero callers in application/ or ui/ outside its own file (found ${getByIdCallers}) — single-commentary detail/inspection is REACHABLE_BUT_INTERNAL: built, but nothing above the storage layer wires it to a use case or a UI affordance yet.`);
        seamRegister.push(['detail/inspection', 'REACHABLE_BUT_INTERNAL — getById() exists at domain+storage, zero application/UI callers']);

        // D2. Commentary identity display. The template already renders
        // authorIdentityId per entry — this is not merely storable data,
        // it's already ON SCREEN, exactly as this milestone's own brief
        // asks to check.
        const panel = await rawSource('ui/components/OwnPublicationPanel.js');
        assert(panel.includes('own-publication-commentary-author') && panel.includes('{{ commentary.authorIdentityId }}'),
            'D2. ui/components/OwnPublicationPanel.js still renders {{ commentary.authorIdentityId }} for every commentary entry — identity display already exists, as the raw authenticated identity id (no profile-name resolution).');
        seamRegister.push(['identity display', 'COMPLETE (raw authorIdentityId shown per entry; no display-name resolution)']);

        // D3. Commentary count. publicationCommentaries.length is read
        // exactly once, only as a boolean empty-state gate — never
        // rendered as a number anywhere.
        assert((panel.match(/publicationCommentaries\.length/g) || []).length === 1,
            'D3a. ui/components/OwnPublicationPanel.js still reads publicationCommentaries.length exactly once.');
        assert(!/\{\{\s*publicationCommentaries\.length\s*\}\}/.test(panel),
            'D3b. ui/components/OwnPublicationPanel.js still never renders publicationCommentaries.length as a visible number — the data already sits in component state, but no count is displayed.');
        seamRegister.push(['count', 'MISSING_UI — length already in component state, never rendered as a number']);

        // D4. Commentary navigation (e.g. a deep link or scroll-to a
        // specific commentaryId). No route, anchor, or scroll-target
        // vocabulary exists anywhere in the commentary chain.
        const navHits = await grepCount('commentaryId.*(scrollTo|anchor|#comment|routeTo)', ['application', 'ui'], { ignoreCase: true });
        assert(navHits === 0,
            'D4. No file in application/ or ui/ ties a commentaryId to any scroll-target, anchor, or route — commentary navigation does not exist at any layer.');
        seamRegister.push(['navigation', 'MISSING_DOMAIN_CAPABILITY — no commentaryId-addressable UI target anywhere']);

        // D5. Commentary notifications. Re-confirms 0.9.221/0.9.241's own
        // finding, extended to commentary specifically: zero Notification
        // vocabulary exists anywhere in this codebase, commentary
        // included.
        const notificationHits = await grepCount('class .*Notification\\|NotificationUseCase\\|NotificationService', ['application', 'core', 'ui'], { ignoreCase: true });
        assert(notificationHits === 0,
            'D5. No Notification class/use case/service exists anywhere in application/, core/, or ui/ — still genuinely absent, one commentary arc later, exactly as 0.9.221 and 0.9.241 both found for the codebase overall.');
        seamRegister.push(['notifications', 'MISSING_DOMAIN_CAPABILITY — absent codebase-wide, not merely for commentary']);

        // D6. Commentary discovery (e.g. "Publications with recent/most
        // commentary," or full-text search over comment content). No
        // such query exists anywhere.
        const discoveryHits = await grepCount('CommentaryDiscovery\\|CommentDiscovery\\|searchComment\\|commentarySearch', ['application', 'core', 'ui', 'discovery'], { ignoreCase: true });
        assert(discoveryHits === 0,
            'D6. No commentary-aware discovery or search vocabulary exists anywhere — discovery/ providers still resolve Publications only, never rank or filter by commentary.');
        seamRegister.push(['discovery', 'MISSING_DOMAIN_CAPABILITY — deliberately absent']);

        // D7. Commentary persistence management (bulk export, archival,
        // pruning). storage/PublicationCommentaryStore.js exposes none —
        // re-verified directly against its own code, not its header's
        // claim.
        assert(!/\bexport\s*\(|\barchive\s*\(|\bprune\s*\(/.test(codeOnlyLines(store)),
            'D7. storage/PublicationCommentaryStore.js\'s own CODE still exposes no export()/archive()/prune() method — persistence management beyond save()/getById()/getForPublication() does not exist.');
        seamRegister.push(['persistence management', 'MISSING_DOMAIN_CAPABILITY — store exposes only save/getById/getForPublication']);

        // D8. Commentary moderation/removal. Re-verifies the exact claim
        // core/PublicationCommentary.js's own 0.9.242 header and
        // storage/PublicationCommentaryStore.js's own 0.9.243 header both
        // make, against real code rather than restating the header.
        const domain = await rawSource('core/PublicationCommentary.js');
        assert(!/moderat|tombstone|deleted.?at|retract/i.test(codeOnlyLines(domain)) && !/moderat|tombstone|deleted.?at|retract/i.test(codeOnlyLines(store)),
            'D8a. Neither core/PublicationCommentary.js nor storage/PublicationCommentaryStore.js\'s own CODE contains any moderation, tombstone, deleted-at, or retraction vocabulary.');
        assert(!/\bremove\s*\(|\bdelete\s*\(/.test(codeOnlyLines(store)),
            'D8b. storage/PublicationCommentaryStore.js\'s own CODE still exposes no remove()/delete() method at all — a commentary, once saved, stays on file for as long as the injected storage holds it.');
        seamRegister.push(['moderation/removal', 'MISSING_DOMAIN_CAPABILITY — deliberately absent per 0.9.242/0.9.243\'s own headers, reconfirmed in code']);

        // D9. Commentary synchronization (live updates, polling,
        // subscriptions, decentralized propagation). Re-verifies the
        // exact claim application/GetPublicationCommentariesUseCase.js's
        // own 0.9.247 header and ui/components/OwnPublicationPanel.js's
        // own 0.9.248 header both make.
        const getUseCase = await rawSource('application/GetPublicationCommentariesUseCase.js');
        // ui/components/OwnPublicationPanel.js is a large file covering
        // unrelated Snapshot/Nostr/Arweave distribution features — a
        // whole-file check would false-positive on that legitimate,
        // unrelated vocabulary (including inside its own HTML template
        // comments, which codeOnlyLines() does not strip). Scoped to the
        // two real commentary methods' own bodies instead.
        const refreshMethod = panel.match(/refreshPublicationCommentaries\(\) \{[\s\S]*?\n        \},/);
        const submitMethod = panel.match(/submitPublicationCommentary\(\) \{[\s\S]*?\n        \}/);
        assert(refreshMethod && submitMethod, 'D9a. Both real commentary methods still exist on ui/components/OwnPublicationPanel.js in their expected shape.');
        const syncVocab = /subscri|\bpoll(?:ing)?\b|websocket|nostr/i;
        assert(!syncVocab.test(codeOnlyLines(getUseCase)) && !syncVocab.test(refreshMethod[0]) && !syncVocab.test(submitMethod[0]),
            'D9b. Neither application/GetPublicationCommentariesUseCase.js\'s own CODE nor OwnPublicationPanel\'s own refreshPublicationCommentaries()/submitPublicationCommentary() method bodies contain any subscription, polling, WebSocket, or Nostr vocabulary — reads are one-shot, on mount and on Publication change, never live.');
        seamRegister.push(['synchronization', 'MISSING_DOMAIN_CAPABILITY — deliberately absent, one-shot reads only']);

        assert(seamRegister.length === 9,
            'D10. All nine seams this milestone\'s own brief names were tested individually.');

        console.log('✓ D: Commentary\'s own remaining seams, tested individually rather than assumed. One real REACHABLE_BUT_INTERNAL finding — single-commentary detail/inspection (getById()) is fully built at the domain and storage layers with zero application/UI callers. One COMPLETE finding already in production — identity display (raw authorIdentityId, per entry). One MISSING_UI finding — count (data already in component state, never rendered as a number). Six MISSING_DOMAIN_CAPABILITY findings, each deliberate per its own layer\'s header, reconfirmed against real code rather than restated: navigation, notifications, discovery, persistence management, moderation/removal, and synchronization.');

        console.log('\nCommentary seam register:');
        for (const [name, status] of seamRegister) {
            console.log(`    ${name.padEnd(24)} ${status}`);
        }
        console.log('');

        // D11. The distinction this milestone's own brief asks for,
        // stated explicitly and grounded in D1-D9's own evidence: a
        // commentary UI enhancement (D2/D3 — identity display, count) is
        // architecturally nothing like commentary synchronization (D9 —
        // subscriptions/polling/propagation), which is nothing like
        // commentary collaboration (Section E — causal ordering, CRDT/OT,
        // CommandHistory integration), which is nothing like commentary
        // moderation (D8 — a mutation/lifecycle-state concept the
        // immutable domain class has no method for at all). Each would
        // touch a different layer: a UI enhancement touches only
        // OwnPublicationPanel's own template; synchronization would need
        // a new observer/transport layer neither the domain nor storage
        // boundary has ever carried; collaboration would mean importing
        // the entire causal-consistency machinery Section E proves
        // absent; moderation would require PublicationCommentary to gain
        // its first-ever mutation method, a deliberate reversal of
        // 0.9.242's own "no withX()" decision.
        console.log('✓ D11: commentary UI enhancement ≠ commentary synchronization ≠ commentary collaboration ≠ commentary moderation — each would touch a different architectural layer (template-only; a new observer/transport layer; the entire 0.9.222-0.9.240 causal chain; PublicationCommentary\'s first mutation method), confirmed by where D1-D9\'s own evidence actually lives, not asserted by category alone.');
    }

    // ---------------------------------------------------------------
    // Section E — Reconfirm the collaboration boundary. Commentary is
    // adjacent to the 0.9.222-0.9.240 collaboration arc, never a
    // continuation of it — this section proves that stays true, against
    // real code, not merely by citing 0.9.242's own header.
    // ---------------------------------------------------------------
    {
        const collaborationVocabulary = /causalPredecessor|logicalClock|\boperationId\b|DocumentOperationEnvelope|ReplayGuard|CommandHistory|\bCRDT\b|operational.transform|readiness|eligib|deferral/i;

        const commentaryFiles = [
            'core/PublicationCommentary.js',
            'core/PublicationCommentaryCollection.js',
            'storage/PublicationCommentaryStore.js',
            'application/AddPublicationCommentaryUseCase.js',
            'application/GetPublicationCommentariesUseCase.js',
            'application/CanCommentOnPublicationUseCase.js'
        ];

        for (const path of commentaryFiles) {
            const code = codeOnlyLines(await rawSource(path));
            assert(!collaborationVocabulary.test(code),
                `E1. ${path}'s own CODE (comments excluded) still contains no collaboration-arc vocabulary (causal predecessors, logical clocks, operation ids, DocumentOperationEnvelope, ReplayGuard, CommandHistory, readiness/eligibility/deferral, CRDT/OT) — commentary and collaboration remain two independent chains.`);
        }

        // E2. WorldNavigationSession's own commentary methods never touch
        // CommandHistory, EditorSession, or the causal chain — they
        // delegate exclusively to the two commentary use cases.
        const navSession = await rawSource('application/WorldNavigationSession.js');
        const getMethodMatch = navSession.match(/getPublicationCommentaries\(publicationId\) \{[\s\S]*?\n    \}/);
        const addMethodMatch = navSession.match(/addPublicationCommentary\(\{ publicationId, content \}\) \{[\s\S]*?\n    \}/);
        assert(getMethodMatch && addMethodMatch, 'E2a. Both commentary methods still exist on WorldNavigationSession in their expected shape.');
        assert(!collaborationVocabulary.test(getMethodMatch[0]) && !collaborationVocabulary.test(addMethodMatch[0]),
            'E2b. WorldNavigationSession#getPublicationCommentaries()/addPublicationCommentary() still reference no collaboration-arc vocabulary in their own method bodies — pure delegation to the two commentary use cases, nothing else.');

        // E3. A commentary carries no causal identity at all — no
        // predecessor list, no operation envelope — confirmed directly
        // against PublicationCommentary's own constructor signature.
        const domain = await rawSource('core/PublicationCommentary.js');
        assert(/constructor\(\{[\s\S]*?commentaryId = createId\(\),[\s\S]*?publicationId,[\s\S]*?authorIdentityId,[\s\S]*?content,[\s\S]*?createdAt = new Date\(\)[\s\S]*?\} = \{\}\)/.test(domain),
            'E3. core/PublicationCommentary.js\'s own constructor still accepts exactly five fields (commentaryId, publicationId, authorIdentityId, content, createdAt) — no causalPredecessors, no operationId, no logical clock of any kind.');

        // E4. The architectural reason, stated once and grounded in E1-E3:
        // a comment is a single authored fact about an already-published,
        // immutable Publication, with no shared mutable state to
        // reconcile — there is nothing here for causal ordering, gap
        // detection, or recovery to do, because nothing here is ever
        // merged with anything else. Document collaboration exists
        // precisely because a Document IS shared mutable state multiple
        // peers edit concurrently; a Publication, and everything attached
        // to it, is immutable by construction (0.9.242's own header).

        console.log('✓ E: The collaboration boundary holds. No collaboration-arc vocabulary exists in any of the six commentary files\' own code (E1), WorldNavigationSession\'s two commentary methods remain pure delegation with no causal-chain reference (E2), and PublicationCommentary\'s own constructor still carries no causal identity at all (E3). The architectural reason: a comment is a single authored fact about an immutable Publication, never an operation applied to shared mutable state — there is no reason to introduce DocumentOperationEnvelope, causal predecessors, CommandHistory integration, collaborative editing, CRDT/OT, or synchronized comment state, because nothing in commentary is ever merged with anything else (E4). Still true, one Commentary arc later.');
    }

    // ---------------------------------------------------------------
    // Section F — Verdict.
    // ---------------------------------------------------------------
    {
        console.log(
'\n0.9.250 — Post-Publication-Commentary Product Reassessment — Verdict\n' +
'\n' +
'PUBLICATION COMMENTARY BASELINE\n' +
'    COMPLETE (Section A/B)\n' +
'\n' +
'REPOSITORY-WIDE REACHABILITY (macro, composition-root level)\n' +
'    Editor              COMPLETE\n' +
'    World Navigation    COMPLETE\n' +
'    World Presence      COMPLETE\n' +
'    Vehicles            COMPLETE\n' +
'    Publication         COMPLETE\n' +
'    Snapshot            COMPLETE\n' +
'    Commentary          COMPLETE\n' +
'    Collaboration       COMPLETE (legacy authority protocol: OBSOLETE_CANDIDATE, unchanged)\n' +
'    Discovery           COMPLETE\n' +
'    Distribution        COMPLETE\n' +
'    Recovery            COMPLETE\n' +
'    History             COMPLETE\n' +
'\n' +
'COMMENTARY SEAMS (Section D)\n' +
'    detail/inspection        REACHABLE_BUT_INTERNAL (getById(), zero real callers)\n' +
'    identity display          COMPLETE (raw id, no profile-name resolution)\n' +
'    count                      MISSING_UI\n' +
'    navigation                 MISSING_DOMAIN_CAPABILITY\n' +
'    notifications               MISSING_DOMAIN_CAPABILITY (absent codebase-wide)\n' +
'    discovery                   MISSING_DOMAIN_CAPABILITY\n' +
'    persistence management      MISSING_DOMAIN_CAPABILITY\n' +
'    moderation/removal          MISSING_DOMAIN_CAPABILITY (deliberate)\n' +
'    synchronization              MISSING_DOMAIN_CAPABILITY (deliberate)\n' +
'\n' +
'COLLABORATION BOUNDARY\n' +
'    Still no reason to merge Commentary into the causal-collaboration arc (Section E)\n' +
'\n' +
'RANKED CANDIDATES FOR THE NEXT PRODUCT SEAM (named, not built)\n' +
'    1. Notifications — the single gap 0.9.221 and 0.9.241 both already named,\n' +
'       still genuinely absent codebase-wide (D5), and now has the concrete\n' +
'       first cross-user event 0.9.241 Section C4 predicted it would need:\n' +
'       "someone commented on your Publication." Still a delivery-guarantee\n' +
'       question, so still not to be built speculatively — but Commentary\n' +
'       shipping is the precondition 0.9.241 said was missing, and that\n' +
'       precondition is now satisfied.\n' +
'    2. Commentary UI enhancement (count display, identity-to-profile-name\n' +
'       resolution, surfacing detail/inspection via the already-built\n' +
'       getById()) — low-risk, MISSING_UI/REACHABLE_BUT_INTERNAL, not\n' +
'       urgent, addressable independently of every other candidate here.\n' +
'    3. Commentary moderation/removal — MISSING_DOMAIN_CAPABILITY, deliberately\n' +
'       deferred pending real evidence of a retraction/abuse need; would\n' +
'       require PublicationCommentary\'s first-ever mutation method, a\n' +
'       reversal of 0.9.242\'s own explicit "no withX()" decision.\n' +
'    4. Commentary synchronization — MISSING_DOMAIN_CAPABILITY, deliberately\n' +
'       deferred for the same delivery-guarantee caution 0.9.225/0.9.240/\n' +
'       0.9.241 already established for the codebase generally.\n' +
'\n' +
'NEXT PRODUCT SEAM\n' +
'    Not selected here. Per this milestone\'s own brief: the repository and\n' +
'    existing architecture name the candidates above; choosing and building\n' +
'    one is a separate, later, evidence-driven decision.\n');

        console.log('✓ Section F: Verdict recorded. Publication Commentary baseline is COMPLETE (Section A/B); all twelve named repository areas remain reachable with no new gap at the macro level (Section C); Commentary\'s own nine remaining seams are individually classified, finding one genuine REACHABLE_BUT_INTERNAL capability (detail/inspection) and six deliberate MISSING_DOMAIN_CAPABILITY absences (Section D); the collaboration boundary holds with no reason to merge (Section E); and four candidates are ranked with reasoning, notifications first, matching but not exceeding 0.9.241\'s own restraint — Commentary itself does not automatically become the next development area, and no implementation happens in this milestone.');
    }

    console.log('\n✅ All PostPublicationCommentaryProductReassessment tests passed.');
}

runTests().then(() => {
    console.log('\n✓ All PostPublicationCommentaryProductReassessment tests passed');
}).catch((error) => {
    console.error('\n✗ PostPublicationCommentaryProductReassessment tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
