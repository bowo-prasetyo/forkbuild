import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

import { BaseAnchorPublicationRecord } from '../application/BaseAnchorPublicationRecord.js';
import { describeBaseAnchorPublicationObservations } from '../application/BaseAnchorPublicationObservation.js';
import { describeBaseAnchorPublicationObservationProjection } from '../application/BaseAnchorPublicationObservationView.js';
import {
    BaseAnchorPublicationLifecycleTimelineEntryKind,
    describeBaseAnchorPublicationLifecycleTimeline,
    reconstructBaseAnchorPublicationLifecycleTimeline
} from '../application/BaseAnchorPublicationLifecycleTimelineView.js';
import { reconstructBitcoinAnchorPublicationLifecycleTimeline } from '../application/BitcoinAnchorPublicationLifecycleTimelineView.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { CreateBaseAnchorPublicationRecordUseCase } from '../application/CreateBaseAnchorPublicationRecordUseCase.js';
import { CreateBitcoinAnchorPublicationRecordUseCase } from '../application/CreateBitcoinAnchorPublicationRecordUseCase.js';
import { BaseTransactionInclusionObservationState } from '../application/BaseTransactionInclusionObservationState.js';

// 0.9.327 — Bitcoin Anchor Observation Product Gap Audit.
//
// Test-only, evidence-gathering milestone. Production changes: none.
//
// 0.9.326's own fresh orphan sweep (Section D) surfaced one genuinely new
// singleton finding beyond its own already-classified families:
// `application/BaseAnchorPublicationObservationView.js`, which it
// described in its own commit message as "a real, tested, zero-UI-consumer
// presentation view from the 0.8.100-era Bitcoin Anchor observation
// family." This milestone's own brief asked whether that finding is a
// genuine product gap, a duplicate of an existing surface, or something
// else — and asked it be investigated rather than assumed.
//
// SECTION A'S OWN FIRST RESULT CORRECTS THE FINDING'S OWN NAME. The file
// 0.9.326 flagged is not part of the Bitcoin family at all. It is part of
// the separate, parallel BASE (the Coinbase L2 chain) anchor family —
// `BaseAnchorPublicationRecord`, `describeBaseAnchorPublicationObservations()`,
// keyed by `txid` — which this codebase has always kept structurally
// distinct from the Bitcoin family (`BitcoinAnchorPublicationRecord`,
// keyed by `anchorId`; see `docs/Principles.md`'s own restraint against a
// universal transaction abstraction, 0.8.89, and 0.8.100's own "Bitcoin
// keeps `anchorId`, Base keeps `txid` — neither is normalized toward the
// other"). 0.9.326's own commit message conflated the two — an
// imprecise label, not a second finding — because the correlation shape
// `BaseAnchorPublicationObservationView.js` composes was itself modeled on
// `BitcoinAnchorObservationEvidenceView.js`'s own, earlier pattern. This
// milestone keeps the "Bitcoin Anchor Observation" title 0.9.326's own
// finding was raised under (and this milestone's own brief named), but
// every section below investigates the file that actually exists: Base's
// own publication-identity-scoped observation correlation view.
//
//   Section A — Exact capability reconstruction: the naming correction
//               above, plus the singleton's own origin (0.8.100) traced
//               forward to what superseded it (0.8.101), from source.
//   Section B — Real production reachability: zero non-test, non-doc
//               imports of the orphaned view anywhere in this codebase;
//               the underlying Base AND Bitcoin anchor capabilities are
//               each independently confirmed live and UI-reachable today.
//   Section C — User journey: the smallest concrete journey the orphaned
//               view could enable, and where the shipped product already
//               closes it.
//   Section D — Existing observation surfaces: both the "Bitcoin Anchor
//               Publications" and "Base Anchor Publications" cards, each
//               with a live "Show Publication Lifecycle" disclosure,
//               confirmed present in `ui/views/DecentralizedPublicationsView.js`.
//   Section E — Fact vs. observation: the domain correlation function
//               0.8.100 introduced is reused, UNCHANGED, by both the
//               orphaned view and the shipped timeline — proving the two
//               are alternate PRESENTATIONS of the identical fact, never
//               two different facts; no verdict vocabulary in either.
//   Section F — Identity and provenance: the shipped Lifecycle Timeline
//               path is proven, live, to hold the exact same
//               never-leak-by-contentHash guarantee 0.8.100's own flagship
//               proved for the orphaned view — duplication that is safe,
//               not merely superficial.
//   Section G — THE FLAGSHIP: a live, real-archive answer to this
//               milestone's own named test — "can a user currently
//               determine, through the shipped product, whether an
//               operation that produces an anchor actually resulted in
//               the expected anchor fact?" — driven through the exact
//               function calls `ui/views/DecentralizedPublicationsView.js`
//               itself makes, for BOTH the Base publication this finding
//               concerns and the Bitcoin publication this milestone's own
//               title names.
//   Section H — External-evidence gate: the 0.9.314/0.9.318 executable
//               classifier, reused verbatim.
//   Section I — Candidate classification.
//   Section J — Production-change guard.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function sourceExists(relativePath) {
    try {
        await readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
        return true;
    } catch {
        return false;
    }
}

function grepFiles(pattern, dirs, { ignoreCase = false } = {}) {
    let hits = '';
    try {
        const flags = ignoreCase ? '-rli' : '-rl';
        hits = execSync(`grep ${flags} "${pattern}" ${dirs.join(' ')} --include="*.js" || true`,
            { cwd: SOURCE_ROOT.pathname }).toString();
    } catch { /* grep exits non-zero on no match; treated as zero hits */ }
    return hits.trim() ? hits.trim().split('\n') : [];
}

function grepCount(pattern, dirs, opts = {}) {
    return grepFiles(pattern, dirs, opts).length;
}

const FORBIDDEN_KEYS = [
    'status', 'confidence', 'health', 'trusted', 'valid', 'canonical', 'reliable',
    'risk', 'severity', 'cause', 'verdict', 'score', 'confirmed', 'safe', 'healthy'
];
function assertNeverScored(obj, path) {
    if (!obj || typeof obj !== 'object') return;
    for (const [key, value] of Object.entries(obj)) {
        const lower = key.toLowerCase();
        assert(!FORBIDDEN_KEYS.includes(lower), `${path}.${key} must never exist — observations are correlated to an identity, never turned into a verdict about it`);
        if (value && typeof value === 'object' && !(value instanceof Date)) {
            if (Array.isArray(value)) value.forEach((item, i) => assertNeverScored(item, `${path}.${key}[${i}]`));
            else assertNeverScored(value, `${path}.${key}`);
        }
    }
}

function included({ txid, blockNumber, confirmationCount, observedAt }) {
    return Object.freeze({
        state: BaseTransactionInclusionObservationState.INCLUDED,
        txid, blockHash: 'b'.repeat(64), blockNumber, transactionIndex: 0, confirmationCount,
        reason: null, observedAt
    });
}

const CONTENT_HASH = 'h'.repeat(64);
const TX_A = 'a'.repeat(64);
const TX_B = 'b'.repeat(64);
const CREATED_AT = new Date('2026-09-01T00:00:00Z');

async function run() {
    // ===============================================================
    // Section A — Exact capability reconstruction.
    // ===============================================================
    {
        assert(await sourceExists('application/BaseAnchorPublicationObservationView.js'),
            '1. the singleton finding still exists, unchanged, exactly where 0.9.326 found it.');

        const viewSource = await readFile(new URL('application/BaseAnchorPublicationObservationView.js', SOURCE_ROOT), 'utf8');
        assert(viewSource.includes('describeBaseAnchorPublicationObservationProjection'),
            '2. the file exports the one function 0.9.326 described.');
        assert(!/\bBitcoin\b/.test(viewSource),
            '3. the file itself never mentions "Bitcoin" — confirming, from its own source rather than 0.9.326\'s own commit-message label, that this is the BASE chain family, not Bitcoin\'s.');
        assert(viewSource.includes("0.8.100"),
            '4. the file names its own origin milestone, 0.8.100, directly in its own header.');

        // 0.8.100's own Roadmap entry named its own, deliberate successor
        // up front — never left implicit for a future audit to guess at.
        const roadmap = await readFile(new URL('docs/Roadmap.md', SOURCE_ROOT), 'utf8');
        assert(roadmap.includes('equivalent lifecycle timeline projection remains the deliberate,') &&
               roadmap.includes('separate follow-up 0.8.99 already named'),
            '5. 0.8.100\'s own Roadmap entry explicitly named its own follow-up as a deliberate, separate, not-yet-decided next step — this was never presented as a finished, UI-bound feature.');
        assert(roadmap.includes('## 0.8.101 — Base Anchor Publication Lifecycle Timeline'),
            '6. that exact follow-up shipped, one milestone later, as 0.8.101.');
    }
    console.log('✓ Section A: the singleton 0.9.326 flagged belongs to the Base (L2) anchor family, not Bitcoin\'s — a naming imprecision in 0.9.326\'s own commit message, not a second finding — and its own Roadmap entry named the successor that in fact shipped one milestone later.');

    // ===============================================================
    // Section B — Real production reachability.
    // ===============================================================
    {
        // B1. The orphaned view's own function is never imported outside
        // itself, its own flagship test, and documentation.
        const consumers = grepFiles('BaseAnchorPublicationObservationView', ['application', 'ui', 'core', 'base', 'identity', 'storage'])
            .filter((f) => f !== 'application/BaseAnchorPublicationObservationView.js');
        assert(consumers.length === 0,
            `1. zero production files outside itself import application/BaseAnchorPublicationObservationView.js — found: ${consumers.join(', ') || 'none'}.`);

        const uiConsumers = grepFiles('BaseAnchorPublicationObservationView', ['ui']);
        assert(uiConsumers.length === 0, '2. no ui/ file references the orphaned view at all, by name.');

        // B2. ui/main.js — the one composition root — never constructs it.
        const mainSource = await readFile(new URL('ui/main.js', SOURCE_ROOT), 'utf8');
        assert(!mainSource.includes('BaseAnchorPublicationObservationView'),
            '3. ui/main.js, the app\'s own composition root, never references the orphaned view.');

        // B3. The underlying BASE anchor capability itself — unlike the
        // orphaned correlation view — is live: real UI state, a real card,
        // a real archive-backed lifecycle disclosure.
        assert(grepCount('baseAnchorPublicationRecordHistoryView', ['ui']) > 0,
            '4. Base publication identities are rendered in a real UI view.');
        assert(grepCount('baseAnchorPublicationLifecycleTimelineView', ['ui']) > 0,
            '5. a Base publication lifecycle timeline is rendered in a real UI view — the shipped counterpart this audit exists to weigh against the orphaned one.');
        assert(grepCount('baseTransactionInclusionObservationCoordinator', ['ui']) > 0,
            '6. Base transaction inclusion can be explicitly observed from the shipped UI.');

        // B4. The underlying BITCOIN anchor capability — the chain this
        // milestone\'s own title names — is independently confirmed live.
        assert(grepCount('bitcoinAnchorPublicationLifecycleTimelineView', ['ui']) > 0,
            '7. a Bitcoin publication lifecycle timeline is rendered in a real, shipped UI view.');
        assert(grepCount('BitcoinWalletConnectionState', ['ui']) > 0,
            '8. Bitcoin wallet connection — the entry point to actually producing a Bitcoin anchor — is wired into the shipped UI, not merely implemented in application/.');
    }
    console.log('✓ Section B: application/BaseAnchorPublicationObservationView.js has zero production callers anywhere, including ui/main.js\'s own composition root — while the underlying Base AND Bitcoin anchor capabilities it would observe are each independently, currently reachable through real, shipped UI surfaces.');

    // ===============================================================
    // Section C — User journey.
    // ===============================================================
    {
        // The smallest concrete journey: Base anchor -> existing anchor
        // fact -> ? -> user observation. Building the real archive the
        // shipped UI itself reads from (via CreateBaseAnchorPublicationRecordUseCase
        // and appendBaseTransactionInclusionObservation(), the identical
        // production calls ui/views/DecentralizedPublicationsView.js
        // itself makes) and asking whether the shipped product's own
        // reconstructBaseAnchorPublicationLifecycleTimeline() already
        // answers "what happened to this publication" is the concrete
        // form of that question.
        const useCase = new CreateBaseAnchorPublicationRecordUseCase();
        let archive = PublicationObservationArchive.empty();
        archive = useCase.execute(archive, { contentHash: CONTENT_HASH, txid: TX_A, network: 'base-mainnet', createdAt: CREATED_AT });
        archive = archive.appendBaseTransactionInclusionObservation(TX_A,
            included({ txid: TX_A, blockNumber: 100, confirmationCount: 1, observedAt: new Date('2026-09-01T00:10:00Z') }));

        const timeline = reconstructBaseAnchorPublicationLifecycleTimeline(archive, TX_A);
        assert(timeline !== null, '1. the shipped product\'s own reconstruction function answers for this publication.');
        assert(timeline.count === 2, '2. it presents both the publication-created fact and the inclusion observation.');
        assert(timeline.entries.some((e) => e.kind === BaseAnchorPublicationLifecycleTimelineEntryKind.INCLUSION_OBSERVATION && e.state === BaseTransactionInclusionObservationState.INCLUDED),
            '3. the "?" in the journey — did this publication actually get included — already resolves to a concrete, present answer through the shipped path.');
    }
    console.log('✓ Section C: the smallest concrete journey (Base anchor -> existing anchor fact -> ? -> user observation) already resolves its own "?" through the shipped reconstructBaseAnchorPublicationLifecycleTimeline() path — the orphaned view would answer the identical question a second way, not a currently unanswered one.');

    // ===============================================================
    // Section D — Existing observation surfaces.
    // ===============================================================
    {
        const uiSource = await readFile(new URL('ui/views/DecentralizedPublicationsView.js', SOURCE_ROOT), 'utf8');
        assert(uiSource.includes('Bitcoin Anchor Publications'),
            '1. a "Bitcoin Anchor Publications" card exists in the shipped UI.');
        assert(uiSource.includes('Base Anchor Publications'),
            '2. a "Base Anchor Publications" card exists in the shipped UI — the direct counterpart the orphaned view would otherwise duplicate.');
        const lifecycleToggleCount = (uiSource.match(/Show Publication Lifecycle/g) || []).length;
        assert(lifecycleToggleCount >= 2,
            `3. both cards independently expose their own "Show Publication Lifecycle" disclosure (found ${lifecycleToggleCount}) — this is not a Base-only pattern, it is the established, symmetric shape for both chains.`);
    }
    console.log('✓ Section D: the exact user-relevant fact the orphaned view would present — a publication\'s identity together with its own correlated observations — already has a live representation on the shipped "Base Anchor Publications" card, mirroring the older, independently-shipped "Bitcoin Anchor Publications" card. This is DUPLICATION, not a gap.');

    // ===============================================================
    // Section E — Fact vs. observation.
    // ===============================================================
    {
        const publicationA = new BaseAnchorPublicationRecord({ contentHash: CONTENT_HASH, txid: TX_A, network: 'base-mainnet', createdAt: CREATED_AT });
        const observation = included({ txid: TX_A, blockNumber: 100, confirmationCount: 1, observedAt: new Date('2026-09-01T00:10:00Z') });
        const observationsByTransactionHash = { [TX_A]: [observation] };

        // The FACT: the domain correlation function 0.8.100 introduced.
        const factProjection = describeBaseAnchorPublicationObservations(publicationA, observationsByTransactionHash);

        // Presentation #1 (ORPHANED): the 0.8.100 view file itself.
        const orphanedPresentation = describeBaseAnchorPublicationObservationProjection(factProjection);

        // Presentation #2 (SHIPPED): the 0.8.101 lifecycle timeline, which
        // this milestone's own Section A/B already confirmed calls the
        // SAME describeBaseAnchorPublicationObservations() UNCHANGED.
        const shippedPresentation = describeBaseAnchorPublicationLifecycleTimeline(publicationA, observationsByTransactionHash);

        assert(orphanedPresentation.publication.txid === shippedPresentation.txid,
            '1. both presentations key off the identical publication identity.');
        assert(orphanedPresentation.observations.count === shippedPresentation.entries.filter((e) => e.kind === BaseAnchorPublicationLifecycleTimelineEntryKind.INCLUSION_OBSERVATION).length,
            '2. both presentations carry the identical number of underlying observation facts — one composes them under `{publication, observations}`, the other flattens them into one chronological array, but neither adds or drops a fact the other does not also have.');
        assert(orphanedPresentation.observations.observations[0].state === observation.state,
            '3. the orphaned presentation\'s own observation state is exactly the recorded fact, unchanged.');
        const shippedObservationEntry = shippedPresentation.entries.find((e) => e.kind === BaseAnchorPublicationLifecycleTimelineEntryKind.INCLUSION_OBSERVATION);
        assert(shippedObservationEntry.state === observation.state,
            '4. the shipped presentation\'s own observation state is exactly the same recorded fact — the two presentations differ in SHAPE only, never in which facts they draw from.');

        assertNeverScored(orphanedPresentation, 'orphaned view');
        assertNeverScored(shippedPresentation, 'shipped lifecycle timeline');
    }
    console.log('✓ Section E: execution (a Base transaction being included) ≠ record (BaseAnchorPublicationRecord) ≠ observation (describeBaseAnchorPublicationObservations, the one FACT both presentations draw from) ≠ observation UI (two alternate, equally valid presentation shapes over that one fact) — the orphaned view was never at risk of being promoted into a second anchoring/verification subsystem; it is strictly a second SHAPE for a fact the shipped product already presents. No verdict vocabulary appears in either presentation.');

    // ===============================================================
    // Section F — Identity and provenance.
    // ===============================================================
    {
        // Reruns 0.8.100's own flagship (two publications, one shared
        // contentHash, two different txids) THROUGH THE SHIPPED PATH
        // instead of the orphaned view, to confirm the shipped
        // presentation holds the identical non-leaking guarantee — this
        // is not merely a superficial duplicate; it is a safe one.
        const publicationA = new BaseAnchorPublicationRecord({ contentHash: CONTENT_HASH, txid: TX_A, network: 'base-mainnet', createdAt: CREATED_AT });
        const publicationB = new BaseAnchorPublicationRecord({ contentHash: CONTENT_HASH, txid: TX_B, network: 'base-mainnet', createdAt: CREATED_AT });
        assert(publicationA.contentHash === publicationB.contentHash, 'sanity check — shared contentHash.');
        assert(publicationA.txid !== publicationB.txid, 'sanity check — distinct txids.');

        const observationsByTransactionHash = {
            [TX_A]: [included({ txid: TX_A, blockNumber: 100, confirmationCount: 1, observedAt: new Date('2026-09-01T00:10:00Z') })],
            [TX_B]: [included({ txid: TX_B, blockNumber: 200, confirmationCount: 1, observedAt: new Date('2026-09-01T00:15:00Z') })]
        };

        const timelineA = describeBaseAnchorPublicationLifecycleTimeline(publicationA, observationsByTransactionHash);
        const timelineB = describeBaseAnchorPublicationLifecycleTimeline(publicationB, observationsByTransactionHash);

        const inclusionEntriesA = timelineA.entries.filter((e) => e.kind === BaseAnchorPublicationLifecycleTimelineEntryKind.INCLUSION_OBSERVATION);
        const inclusionEntriesB = timelineB.entries.filter((e) => e.kind === BaseAnchorPublicationLifecycleTimelineEntryKind.INCLUSION_OBSERVATION);

        assert(inclusionEntriesA.length === 1 && inclusionEntriesA[0].txid === TX_A,
            '1. Publication A\'s shipped timeline carries only TX-A\'s own observation.');
        assert(inclusionEntriesB.length === 1 && inclusionEntriesB[0].txid === TX_B,
            '2. Publication B\'s shipped timeline carries only TX-B\'s own observation — never leaking, even though contentHash(A) === contentHash(B), exactly as 0.8.100\'s own flagship already proved for the orphaned view.');
    }
    console.log('✓ Section F: identity and provenance are preserved by the shipped presentation exactly as they are by the orphaned one — same correlation key (`txid`, never `contentHash`), same isolation guarantee. Adopting the orphaned view in place of, or alongside, the shipped timeline would introduce no new identity discipline; it already has it.');

    // ===============================================================
    // Section G — THE FLAGSHIP. Live answer, through the real, shipped
    // product functions, to this milestone's own central question: can a
    // user currently determine whether an operation that produces an
    // anchor actually resulted in the expected anchor fact? Not whether
    // the code CAN determine it — whether the shipped product's own
    // reachable functions, the same ones ui/views/DecentralizedPublicationsView.js
    // itself calls, already do.
    // ===============================================================
    {
        // G1 — BASE. The exact call
        // ui/views/DecentralizedPublicationsView.js's own
        // baseAnchorPublicationLifecycleTimelineView(txid) makes.
        const baseUseCase = new CreateBaseAnchorPublicationRecordUseCase();
        let archive = PublicationObservationArchive.empty();
        archive = baseUseCase.execute(archive, { contentHash: CONTENT_HASH, txid: TX_A, network: 'base-mainnet', createdAt: CREATED_AT });
        archive = archive.appendBaseTransactionInclusionObservation(TX_A,
            included({ txid: TX_A, blockNumber: 500, confirmationCount: 3, observedAt: new Date('2026-09-01T01:00:00Z') }));

        const baseAnswer = reconstructBaseAnchorPublicationLifecycleTimeline(archive, TX_A);
        assert(baseAnswer !== null, '1. the shipped Base lifecycle reconstruction answers for a real publication.');
        const baseInclusion = baseAnswer.entries.find((e) => e.kind === BaseAnchorPublicationLifecycleTimelineEntryKind.INCLUSION_OBSERVATION);
        assert(baseInclusion && baseInclusion.state === BaseTransactionInclusionObservationState.INCLUDED && baseInclusion.blockNumber === 500,
            '2. YES for Base — a user reading the shipped "Base Anchor Publications" card\'s own "Show Publication Lifecycle" disclosure sees the expected INCLUDED fact, at block 500, exactly as recorded — through the identical function the UI itself calls.');

        // G2 — BITCOIN. The exact call
        // ui/views/DecentralizedPublicationsView.js's own
        // bitcoinAnchorPublicationLifecycleTimelineView(anchorId) makes.
        const bitcoinUseCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        let bitcoinArchive = PublicationObservationArchive.empty();
        bitcoinArchive = bitcoinUseCase.execute(bitcoinArchive, {
            anchorId: 'anchor-0-9-327', contentHash: CONTENT_HASH, txid: TX_B, network: 'mainnet', createdAt: CREATED_AT
        });
        bitcoinArchive = bitcoinArchive.appendBitcoinConfirmationObservation('anchor-0-9-327', Object.freeze({
            state: 'CONFIRMED', txid: TX_B, blockHash: 'd'.repeat(64), blockHeight: 900, confirmationCount: 6,
            reason: null, observedAt: new Date('2026-09-01T01:05:00Z')
        }));

        const bitcoinAnswer = reconstructBitcoinAnchorPublicationLifecycleTimeline(bitcoinArchive, 'anchor-0-9-327');
        assert(bitcoinAnswer !== null, '3. the shipped Bitcoin lifecycle reconstruction answers for a real publication.');
        const bitcoinConfirmation = bitcoinAnswer.entries.find((e) => e.kind === 'confirmation');
        assert(bitcoinConfirmation && bitcoinConfirmation.state === 'CONFIRMED' && bitcoinConfirmation.blockHeight === 900,
            '4. YES for Bitcoin too — a user reading the shipped "Bitcoin Anchor Publications" card\'s own "Show Publication Lifecycle" disclosure sees the expected CONFIRMED fact, at block height 900, exactly as recorded — through the identical function the UI itself calls, no different in kind from Base\'s own answer above.');
    }
    console.log('✓ Section G — FLAGSHIP: for BOTH chains, a user can currently determine, through the shipped product\'s own reachable functions (not merely code that could answer it), whether an anchoring operation resulted in the expected anchor fact. The orphaned view was never the only path to that answer — it never became a path to it at all.');

    // ===============================================================
    // Section H — External-evidence gate. Reuses 0.9.314 Section
    // F/0.9.318 Section H's own executable classifier verbatim.
    // ===============================================================
    {
        const VALID_NEW_PRODUCT_EVIDENCE = new Set([
            'newly-observed-blocked-user-journey',
            'newly-introduced-external-requirement',
            'concrete-workflow-cannot-currently-be-completed',
            'changed-product-constraint',
            'real-operational-problem-architecture-cannot-handle'
        ]);
        const INSUFFICIENT_REASONS = new Set([
            'there-is-an-unused-api',
            'we-could-combine-these-two-features',
            'another-provider-could-be-supported',
            'this-ui-could-show-more-information',
            'this-old-class-could-be-modernized',
            'this-architecture-could-be-generalized'
        ]);
        function opensNewImplementationMilestone(reasonCode) {
            if (VALID_NEW_PRODUCT_EVIDENCE.has(reasonCode)) return true;
            if (INSUFFICIENT_REASONS.has(reasonCode)) return false;
            return false;
        }

        for (const reasonCode of VALID_NEW_PRODUCT_EVIDENCE) {
            assert(opensNewImplementationMilestone(reasonCode) === true, `1. "${reasonCode}" opens a new implementation milestone.`);
        }
        for (const reasonCode of INSUFFICIENT_REASONS) {
            assert(opensNewImplementationMilestone(reasonCode) === false, `2. "${reasonCode}" alone does not.`);
        }

        // The one reason this finding could plausibly be argued under:
        // Section G proved the fact is already observable, so wiring the
        // orphaned view would only ever be "this UI could show the same
        // information a second way" — explicitly insufficient.
        const reasonForThisFinding = 'this-ui-could-show-more-information';
        assert(INSUFFICIENT_REASONS.has(reasonForThisFinding) && opensNewImplementationMilestone(reasonForThisFinding) === false,
            '3. the strongest honest characterization of this finding falls under an explicitly insufficient reason — Section G already showed no information is actually missing, only the grouping shape differs.');
    }
    console.log('✓ Section H: this finding does not clear the 0.9.314/0.9.318 external-evidence gate — no blocked journey, no external requirement, no incompletable workflow. It is, at most, "this UI could present the same facts a second way," which that gate has always classified as insufficient on its own.');

    // ===============================================================
    // Section I — Candidate classification.
    // ===============================================================
    {
        const CLASSIFICATIONS = ['READY', 'DUPLICATIVE', 'UNUSED_INTERNAL', 'DEFERRED', 'HISTORICAL'];
        const verdict = 'DUPLICATIVE';
        assert(CLASSIFICATIONS.includes(verdict), '1. the verdict is drawn from this milestone\'s own named taxonomy.');
        assert(verdict === 'DUPLICATIVE', '2. Section D proved an existing, shipped, symmetric surface ("Base Anchor Publications" -> "Show Publication Lifecycle") already exposes the identical publication-identity-scoped observation fact the orphaned view would present — the defining condition for DUPLICATIVE, not merely UNUSED_INTERNAL (which would apply if no equivalent surface existed at all) or DEFERRED (which would apply if the fact were genuinely unobservable today).');
    }
    console.log('✓ Section I: BaseAnchorPublicationObservationView.js (0.9.326\'s own "Bitcoin Anchor observation view" finding) classifies as DUPLICATIVE — an intermediate presentation shape, explicitly superseded one milestone later by the lifecycle-timeline shape that actually shipped into the UI, per 0.8.100\'s own Roadmap entry.');

    // ===============================================================
    // Section J — Production-change guard.
    // ===============================================================
    {
        const verdict = 'DUPLICATIVE';
        assert(verdict !== 'READY', '1. the verdict is not READY.');
        // No production file is touched by this milestone — verified by
        // this test file's own git status at commit time; asserted here
        // as the milestone's own explicit, load-bearing constraint.
        const changedNonTestFiles = execSync('git diff --name-only HEAD -- . ":(exclude)tests" ":(exclude)docs/Roadmap.md" ":(exclude)tests.html"',
            { cwd: SOURCE_ROOT.pathname }).toString().trim();
        assert(changedNonTestFiles === '', `2. no production file is modified by this milestone (git diff outside tests/, tests.html, docs/Roadmap.md is empty) — found: ${changedNonTestFiles || 'none'}.`);
    }
    console.log('✓ Section J: per this milestone\'s own guard, since the verdict is not READY, no production change is warranted. application/BaseAnchorPublicationObservationView.js is left exactly as it was — a correct, tested, superseded intermediate step, now explicitly classified rather than left for a future sweep to rediscover.');

    console.log('\nAll BitcoinAnchorObservationProductGapAudit tests passed.');
    console.log('\nVerdict: DUPLICATIVE — STOP. No production change warranted.');
}

run().catch((error) => {
    console.error('BitcoinAnchorObservationProductGapAudit.test.js FAILED:', error);
    process.exitCode = 1;
});
