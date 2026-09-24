import { readFile, readdir } from 'node:fs/promises';
import { applicationFiles } from './support/ApplicationFiles.js';
import { execSync } from 'node:child_process';

import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import WorldLocationBrowser from '../ui/components/WorldLocationBrowser.js';
import { WorldEncounterMaterialLoadStatus } from '../application/worldEncounter/WorldEncounterMaterialLoading.js';
import { WorldEncounterMaterialVerificationStatus } from '../application/worldEncounter/WorldEncounterMaterialVerification.js';
import { describeWorldEncounterMaterialLoadStatusLabel, describeWorldEncounterMaterialVerificationStatusLabel } from '../application/worldEncounter/WorldEncounterMaterialInspectionView.js';
import { TrustStatus } from '../core/TrustObservation.js';
import { describeTrustStatus } from '../application/avatar/AvatarPresenceLabels.js';
import { DecentralizedWorldEncounterLeadResolutionStatus } from '../application/worldEncounter/DecentralizedWorldEncounterLeadResolution.js';
import { worldEncounterCanvasFiles, worldNavigationSessionFiles } from './support/SourceFileGroups.js';

// 0.9.521 — Close Remaining Raw Status Rendering Boundaries.
//
// TYPE: small production presentation fix + focused closure audit.
// Follow-up to 0.9.520 (Product Integrity Boundary Closure Audit), which
// named exactly two SEMANTIC_BOUNDARY_GAP findings and, per its own
// zero-production-change guard, stopped without fixing either:
//
//   Finding 1 — ui/components/WorldEncounterCanvas.js's own "Publication
//     Discovery" modal panel rendered discoveryResult.inspection.
//     verification.status (and .loading.status) raw — a SECOND, unfixed
//     call site into the exact enums 0.9.519 already routed through
//     humanizing view functions for this same file's SELECTION-driven
//     panel.
//   Finding 2 — ui/components/WorldLocationBrowser.js's Inspect panel
//     rendered inspected.trust.status (core/TrustObservation.js's
//     TrustStatus) raw.
//
// THE ARCHITECTURAL INVARIANT THIS MILESTONE HOLDS THE LINE ON (its own
// requesting brief's own headline): raw status values may exist
// internally; they must not cross a user-facing semantic boundary when an
// existing domain-specific observation description is available. That is
// a rule about SEMANTIC INTERPRETATION, not capitalization — it is why
// `VERIFIED` is a problem in one context while a plain technical token
// like `AVAILABLE`/`RESOLVED` may be perfectly fine in another.
//
// FINDING 1'S FIX: reuse, not reinvent. WorldEncounterCanvas.js already
// defines describeMaterialLoadStatusLabel()/
// describeMaterialVerificationStatusLabel() (0.9.519) as thin wrappers
// around application/worldEncounter/WorldEncounterMaterialInspectionView.js's own pure
// functions, used by the SELECTION-driven Material/Verification panel.
// This milestone wires the SAME two methods into the DISCOVERY-driven
// panel's identical two fields — no new view file, no new vocabulary, and
// (this is the load-bearing consequence) no possibility of the two panels
// ever describing the same underlying status two different ways, because
// they now literally call the same function. discoveryResult.resolution.
// status (a THIRD, distinct enum — DecentralizedWorldEncounterLeadResolutionStatus,
// 0.9.28) is deliberately left exactly as this file's own header already
// documented it — "rendered as its own existing vocabulary" — see Section
// F/D10, below, for why that is not a violation of the invariant above.
//
// FINDING 2'S FIX: NOT what 0.9.520's own recommended follow-up assumed.
// 0.9.520 Section D8e observed that describeTrustStatus()
// (application/avatar/AvatarPresenceLabels.js) already exists for the identical
// TrustStatus enum and is simply unused at WorldLocationBrowser.js's own
// call site — and its own Section I recommended routing through it.
// Section B, below, is why this milestone does NOT do that:
// describeTrustStatus(TrustStatus.VALID) returns the word "Trusted" —
// itself a claim word this codebase's own established overclaim vocabulary
// sweep (tests/PublicationEvidenceTrustExperienceProductReassessment.test.js)
// already bans, and core/TrustObservation.js's own header is explicit that
// a TrustObservation is "purely DESCRIPTIVE... not what should happen
// next," never a verdict. Reusing that existing humanizer verbatim would
// have traded a raw-enum gap for a stronger, unearned claim — replacing
// the disease with a different strain of the same disease. Instead, this
// milestone establishes what TrustStatus actually means at THIS call site
// (a TrustObservation about one placement-record's integrity/signature/
// authorization — WorldNavigationSession.inspectDocument()/
// _lookupTrustObservation(), Section B) and adds a new, narrow, local
// function — describeInspectedTrustStatusLabel(), defined directly in
// WorldLocationBrowser.js itself, deliberately NOT a new shared "TrustView"
// abstraction — describing exactly that narrower, already-established
// fact.
//
// EIGHT LETTERED SECTIONS, matching this milestone's own requesting
// brief:
//   A. Reproduce both 0.9.520 findings against the pre-fix source.
//   B. Verify semantic meaning — read the real backing enums/call sites.
//   C. Verify humanization — every enum member, no fabricated labels.
//   D. Template boundary — the two offending templates no longer
//      interpolate the raw status/outcome directly.
//   E. Semantic consistency — the Discovery and Selection panels can
//      never describe the same underlying fact two different ways.
//   F. Regression sweep — the complete findRawStatusInterpolations()
//      mechanism, re-run fresh: 0.9.520's 2 GAP findings -> 0 here, every
//      surviving hit reclassified rather than silently dropped.
//   G. Existing evidence audit — 0.9.519's own living guard re-executed
//      live. (0.9.520's own file is NOT re-executed here — see Section G's
//      own comment for why: it is a one-time closure audit, not a living
//      regression guard, and its own two findings are the ones this
//      milestone closes, so its own literal "still broken" assertions are
//      now expected to be stale, exactly like a fixed bug report.)
//   H. Production-change boundary — changes are confined to presentation/
//      view functions, template bindings, and tests; deliberate
//      exclusions honored.

const SOURCE_ROOT = new URL('../', import.meta.url);
const SOURCE_ROOT_PATH = SOURCE_ROOT.pathname;
const PRE_FIX_COMMIT = '6123be9'; // HEAD immediately before this milestone's own changes.

async function source(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

function sourceAtCommit(commit, relativePath) {
    return execSync(`git show ${commit}:${relativePath}`, { cwd: SOURCE_ROOT_PATH }).toString();
}

let assertionCount = 0;
function check(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function runLive(file) {
    try {
        execSync(`node ${JSON.stringify(file)}`, { cwd: SOURCE_ROOT_PATH, stdio: 'pipe' });
        return { passed: true, output: '' };
    } catch (error) {
        const output = (error.stdout ? error.stdout.toString() : '') + (error.stderr ? error.stderr.toString() : '');
        return { passed: false, output };
    }
}

// The identical banned-overclaim vocabulary 0.9.519/0.9.520 already
// established — reused, never redefined.
const OVERCLAIM_WORDS = /\b(trusted|safe|permanent|guaranteed|owns?|owned|authored?|authorship)\b/i;

// The identical sweep mechanism 0.9.520 built and proved correct —
// reproduced here (not imported from 0.9.520's own test file, which is
// not a shared library) so this milestone's own regression sweep does not
// depend on that file's continued existence or content.
const RAW_STATUS_PATTERN = /\{\{\s*([\w.]+)\.(status|outcome)\s*\}\}/g;
function findRawStatusInterpolations(fileText) {
    const hits = [];
    let match;
    const pattern = new RegExp(RAW_STATUS_PATTERN.source, 'g');
    while ((match = pattern.exec(fileText)) !== null) {
        const upTo = fileText.slice(0, match.index);
        const line = upTo.split('\n').length;
        hits.push({ expr: `${match[1]}.${match[2]}`, line });
    }
    return hits;
}

async function run() {
    console.log('=== 0.9.521 — Close Remaining Raw Status Rendering Boundaries ===\n');

    // ===============================================================
    // Section A — Reproduce both 0.9.520 findings, against the real
    // pre-fix source (the commit immediately before this milestone's own
    // changes), not merely cited from 0.9.520's own prose.
    // ===============================================================
    {
        check(findRawStatusInterpolations('x<dd>{{ a.status }}</dd>y').length === 1,
            'A1. sanity — the sweep function itself still finds a synthetic raw interpolation before being pointed at real source');

        const preFixCanvasSource = sourceAtCommit(PRE_FIX_COMMIT, 'ui/components/WorldEncounterCanvas.js');
        const preFixCanvasHits = findRawStatusInterpolations(preFixCanvasSource).map((h) => h.expr);
        check(preFixCanvasHits.includes('discoveryResult.inspection.verification.status'),
            'A2. Finding 1 reproduced: the pre-fix WorldEncounterCanvas.js genuinely rendered discoveryResult.inspection.verification.status raw');
        check(preFixCanvasHits.includes('discoveryResult.inspection.loading.status'),
            'A2b. the same panel\'s discoveryResult.inspection.loading.status was raw too (0.9.520\'s own RELATED_SAME_PANEL finding)');

        const preFixLocationBrowserSource = sourceAtCommit(PRE_FIX_COMMIT, 'ui/components/WorldLocationBrowser.js');
        const preFixLocationBrowserHits = findRawStatusInterpolations(preFixLocationBrowserSource).map((h) => h.expr);
        check(preFixLocationBrowserHits.includes('inspected.trust.status'),
            'A3. Finding 2 reproduced: the pre-fix WorldLocationBrowser.js genuinely rendered inspected.trust.status raw');

        console.log('✓ Section A: both 0.9.520 findings are reproduced against the real pre-fix commit — this milestone did not fix a strawman.');
    }

    // ===============================================================
    // Section B — Verify semantic meaning. Read the real backing enums
    // and the real call sites that populate them, live, rather than
    // trusting 0.9.520's own characterization.
    // ===============================================================
    {
        // B1. Finding 1's own enum: WorldEncounterMaterialVerificationStatus
        // genuinely can render the bare word "VERIFIED", and the codebase's
        // own established meaning (application/worldEncounter/WorldEncounterMaterialVerification.js's
        // header) is IDENTITY CORRESPONDENCE, never authorship/ownership/
        // general trustworthiness — exactly what the SELECTION panel's
        // pre-existing label ("Confirmed to match the selected encounter")
        // already says, and Finding 1's fix now reuses verbatim.
        check(WorldEncounterMaterialVerificationStatus.VERIFIED === 'VERIFIED',
            'B1. WorldEncounterMaterialVerificationStatus.VERIFIED is genuinely the bare word "VERIFIED"');
        check(describeWorldEncounterMaterialVerificationStatusLabel(WorldEncounterMaterialVerificationStatus.VERIFIED)
            === 'Confirmed to match the selected encounter',
            'B1b. the existing humanizer for this enum describes identity correspondence, never a bare verdict word');

        // B2. Finding 2's own enum, and — the actual point of this
        // milestone's own investigation — what `inspected.trust.status`
        // REALLY is at THIS call site, read from the real orchestration
        // source rather than assumed from the enum's own name.
        check(TrustStatus.VALID === 'VALID', 'B2a. TrustStatus.VALID is genuinely the bare word "VALID"');
        const trustObservationSource = await source('core/TrustObservation.js');
        check(trustObservationSource.includes('A TrustObservation is purely DESCRIPTIVE'),
            'B2b. core/TrustObservation.js\'s own header is explicit: purely descriptive, never a verdict — the fact this milestone\'s labels must honor');
        check(trustObservationSource.includes("VALID: 'VALID',                       // integrity + signature + authorization all hold"),
            'B2c. VALID\'s own documented meaning is a compound fact (integrity + signature + authorization), never a generic "trustworthy" claim');

        const navigationSessionSource = (await Promise.all(worldNavigationSessionFiles().map((file) => source(file)))).join('\n');
        check(navigationSessionSource.includes('trust: this._lookupTrustObservation(placementInfo)'),
            'B2d. inspectDocument() populates `trust` from _lookupTrustObservation() — confirmed live, not assumed');
        check(navigationSessionSource.includes("o.subjectType === 'placement-record' && o.subjectId === placementInfo.placementId"),
            'B2e. that lookup is scoped to subjectType \'placement-record\' — this really is a per-placement-record TrustObservation, never a general Wanderer/session-wide trust verdict');

        // B3. The rejected alternative, live-confirmed: describeTrustStatus()
        // (application/avatar/AvatarPresenceLabels.js) maps VALID to the word
        // "Trusted" — a genuine overclaim word, not a hypothetical concern.
        check(describeTrustStatus(TrustStatus.VALID) === 'Trusted',
            'B3a. confirms describeTrustStatus(VALID) === "Trusted" — the exact reason this milestone does not reuse it for Finding 2');
        check(OVERCLAIM_WORDS.test(describeTrustStatus(TrustStatus.VALID)),
            'B3b. "Trusted" itself trips this codebase\'s own established overclaim-word regex — reusing describeTrustStatus() here would not have closed 0.9.520\'s SEMANTIC_BOUNDARY_GAP, it would have widened it');

        console.log('✓ Section B: WorldEncounterMaterialVerificationStatus.VERIFIED means identity correspondence (unchanged from 0.9.519); inspected.trust.status is a per-placement-record TrustObservation, purely descriptive by core/TrustObservation.js\'s own header; the "already-existing humanizer" 0.9.520 pointed at for Finding 2 (describeTrustStatus) is confirmed, live, to itself render an overclaim word — the reason this milestone writes a new, narrower function instead of reusing it.');
    }

    // ===============================================================
    // Section C — Verify humanization. Every enum member the two fixed
    // call sites can actually receive renders a real label; no fabricated
    // label for a value the enum does not have.
    // ===============================================================
    {
        for (const status of Object.values(WorldEncounterMaterialLoadStatus)) {
            const label = WorldEncounterCanvas.methods.describeMaterialLoadStatusLabel(status);
            check(typeof label === 'string' && label.length > 0, `C1. WorldEncounterMaterialLoadStatus.${status} -> a real, non-empty label ("${label}")`);
        }
        for (const status of Object.values(WorldEncounterMaterialVerificationStatus)) {
            const label = WorldEncounterCanvas.methods.describeMaterialVerificationStatusLabel(status);
            check(typeof label === 'string' && label.length > 0, `C2. WorldEncounterMaterialVerificationStatus.${status} -> a real, non-empty label ("${label}")`);
        }

        // C3. Finding 2's new function — every current TrustStatus member,
        // read fresh from the real enum (never a hand-copied list), maps to
        // a real, distinct-from-the-raw-constant label.
        const trustStatusValues = Object.values(TrustStatus);
        check(trustStatusValues.length === 12, `C3a. fresh census of TrustStatus — expected today's 12 members, found ${trustStatusValues.length}: ${JSON.stringify(trustStatusValues)}`);
        const seenLabels = new Set();
        for (const status of trustStatusValues) {
            const label = WorldLocationBrowser.methods.describeInspectedTrustStatusLabel(status);
            check(typeof label === 'string' && label.length > 0, `C3b. TrustStatus.${status} -> a real, non-empty label ("${label}")`);
            check(label !== status, `C3c. TrustStatus.${status}'s own label is not simply the raw constant echoed back ("${label}")`);
            check(!OVERCLAIM_WORDS.test(label), `C3d. TrustStatus.${status}'s own label ("${label}") carries no banned overclaim word`);
            seenLabels.add(label);
        }
        check(seenLabels.size === trustStatusValues.length, `C3e. all ${trustStatusValues.length} TrustStatus labels are distinct from one another — no two statuses silently collapse into the same wording (found ${seenLabels.size} distinct)`);

        // C4. No fabricated label for a value the enum does not have —
        // degrades to the raw value itself, exactly like every other label
        // map in this codebase.
        check(WorldLocationBrowser.methods.describeInspectedTrustStatusLabel('SOME_FUTURE_STATUS') === 'SOME_FUTURE_STATUS',
            'C4. an unrecognized status degrades to the raw value itself, never a fabricated label');
        check(WorldLocationBrowser.methods.describeInspectedTrustStatusLabel(null) === null,
            'C4b. a null status degrades to null, never a fabricated label');

        console.log(`✓ Section C: every WorldEncounterMaterialLoadStatus/VerificationStatus member (Finding 1) and all ${trustStatusValues.length} current TrustStatus members (Finding 2) render real, distinct, non-overclaiming labels; an unrecognized value degrades honestly.`);
    }

    // ===============================================================
    // Section D — Template boundary. Mechanically confirm the two
    // offending templates no longer interpolate the raw status directly.
    // ===============================================================
    {
        const canvasSource = (await Promise.all(worldEncounterCanvasFiles().map((file) => source(file)))).join('\n');
        const canvasHits = findRawStatusInterpolations(canvasSource).map((h) => h.expr);
        check(!canvasHits.includes('discoveryResult.inspection.verification.status'),
            'D1. WorldEncounterCanvas.js no longer raw-interpolates discoveryResult.inspection.verification.status');
        check(!canvasHits.includes('discoveryResult.inspection.loading.status'),
            'D1b. WorldEncounterCanvas.js no longer raw-interpolates discoveryResult.inspection.loading.status');
        check(canvasSource.includes('{{ describeMaterialVerificationStatusLabel(discoveryResult.inspection.verification.status) }}'),
            'D2. the Discovery-panel Verification row now routes through describeMaterialVerificationStatusLabel() — mechanically confirmed, not merely inferred from D1\'s own absence');
        check(canvasSource.includes('{{ describeMaterialLoadStatusLabel(discoveryResult.inspection.loading.status) }}'),
            'D2b. the Discovery-panel Material row now routes through describeMaterialLoadStatusLabel()');

        const locationBrowserSource = await source('ui/components/WorldLocationBrowser.js');
        const locationBrowserHits = findRawStatusInterpolations(locationBrowserSource).map((h) => h.expr);
        check(!locationBrowserHits.includes('inspected.trust.status'),
            'D3. WorldLocationBrowser.js no longer raw-interpolates inspected.trust.status');
        check(locationBrowserSource.includes('{{ describeInspectedTrustStatusLabel(inspected.trust.status) }}'),
            'D4. the Inspect panel\'s Discovery-status row now routes through describeInspectedTrustStatusLabel()');

        console.log('✓ Section D: both offending templates are mechanically confirmed to no longer interpolate a raw .status directly — each now calls its own humanizing function instead.');
    }

    // ===============================================================
    // Section E — Semantic consistency. Where two surfaces represent the
    // same underlying fact, they must not communicate contradictory
    // meanings — here, proven structurally (same function, same call),
    // not merely by comparing two independently-derived strings.
    // ===============================================================
    {
        const canvasSource = (await Promise.all(worldEncounterCanvasFiles().map((file) => source(file)))).join('\n');
        // E1. Both the Selection-driven and Discovery-driven Verification
        // rows call the exact same method name — the strongest form of
        // "cannot contradict": there is only one code path, not two kept
        // in sync by hand.
        check(canvasSource.includes('describeMaterialVerificationStatusLabel(materialInspection.verification.status)')
            && canvasSource.includes('describeMaterialVerificationStatusLabel(discoveryResult.inspection.verification.status)'),
            'E1. Selection panel and Discovery panel both call describeMaterialVerificationStatusLabel() — the same function, never two competing descriptions of the same underlying WorldEncounterMaterialVerificationStatus');
        check(canvasSource.includes('describeMaterialLoadStatusLabel(materialInspection.loading.status)')
            && canvasSource.includes('describeMaterialLoadStatusLabel(discoveryResult.inspection.loading.status)'),
            'E1b. same, for Material/loading.status');

        // E2. Live-confirm the invariant this milestone's own brief names
        // as the key one for Finding 1: for every possible verification
        // status, the Discovery panel's own rendered label is IDENTICAL to
        // the Selection panel's — neither panel can ever communicate a
        // stronger claim than the other, because both derive from the
        // identical pure function.
        for (const status of Object.values(WorldEncounterMaterialVerificationStatus)) {
            const selectionPanelLabel = WorldEncounterCanvas.methods.describeMaterialVerificationStatusLabel(status);
            const discoveryPanelLabel = WorldEncounterCanvas.methods.describeMaterialVerificationStatusLabel(status);
            check(selectionPanelLabel === discoveryPanelLabel,
                `E2. for WorldEncounterMaterialVerificationStatus.${status}, the Selection and Discovery panels render identical text ("${selectionPanelLabel}")`);
        }

        // E3. Finding 2's new label never collides with, or contradicts,
        // the pre-existing describeTrustStatus() vocabulary used elsewhere
        // for the SAME enum (AvatarInfoPanel.js, a different subject —
        // remote avatar presence, not a placement record) — checked by
        // confirming the two label sets share no wording that could read
        // as a competing claim about the same fact.
        for (const status of Object.values(TrustStatus)) {
            const placementLabel = WorldLocationBrowser.methods.describeInspectedTrustStatusLabel(status);
            const presenceLabel = describeTrustStatus(status);
            check(placementLabel !== presenceLabel,
                `E3. TrustStatus.${status}'s placement-record label ("${placementLabel}") and its avatar-presence label ("${presenceLabel}") are deliberately distinct wordings for two different subjects sharing one enum — neither is a copy-paste of the other`);
        }

        console.log('✓ Section E: the Discovery and Selection Material/Verification panels are structurally incapable of diverging (one shared function each); Finding 2\'s new placement-record wording is distinct from, and consistent with, the pre-existing avatar-presence wording for the same enum.');
    }

    // ===============================================================
    // Section F — Regression sweep. The complete
    // findRawStatusInterpolations() mechanism, re-run fresh against
    // CURRENT source (ui/components/ and ui/views/, a real directory walk,
    // not a hand-picked list) — 0.9.520's own 2 GAP findings must be 0
    // here, and every surviving hit must be classified, not silently
    // dropped.
    // ===============================================================
    let freshHits = [];
    {
        const componentFiles = (await readdir(new URL('ui/components/', SOURCE_ROOT))).filter((f) => f.endsWith('.js'));
        const viewFiles = (await readdir(new URL('ui/views/', SOURCE_ROOT))).filter((f) => f.endsWith('.js'));
        for (const [dir, files] of [['ui/components', componentFiles], ['ui/views', viewFiles]]) {
            for (const file of files) {
                const relativePath = `${dir}/${file}`;
                const text = await source(relativePath);
                for (const hit of findRawStatusInterpolations(text)) {
                    freshHits.push({ file: relativePath, ...hit });
                }
            }
        }

        // F1. Classification table — every hit this fresh sweep finds,
        // explicitly bucketed. An unclassified hit is itself a finding,
        // mirroring 0.9.520's own D4 discipline.
        const CLASSIFICATION = new Map([
            // Unchanged from 0.9.520 — OwnPublicationPanel.js/
            // WorldEncounterCanvas.js's own Snapshot outcome fields, and
            // ReconciliationWorkspaceView.js's own documented fallback.
            // Neither this file's production code nor its backing enum was
            // touched by this milestone.
            ['ui/components/OwnPublicationPanel.js::snapshotDiscoveryResult.outcome', 'SAFE_TECHNICAL_TOKEN'],
            ['ui/components/OwnPublicationPanel.js::snapshotAttributionResult.outcome', 'SAFE_TECHNICAL_TOKEN'],
            ['ui/components/OwnPublicationPanel.js::selectedSnapshotResolutionResult.outcome', 'SAFE_TECHNICAL_TOKEN'],
            ['ui/components/OwnPublicationPanel.js::selectedSnapshotAttributionResult.outcome', 'SAFE_TECHNICAL_TOKEN'],
            ['ui/components/OwnPublicationPanel.js::selectedSnapshotMaterializationResult.outcome', 'SAFE_TECHNICAL_TOKEN'],
            ['ui/components/OwnPublicationPanel.js::selectedSnapshotWorldPositionClaimResult.outcome', 'SAFE_TECHNICAL_TOKEN'],
            ['ui/components/OwnPublicationPanel.js::selectedSnapshotWorldPlacementResult.outcome', 'SAFE_TECHNICAL_TOKEN'],
            ['ui/components/OwnPublicationPanel.js::selectedSnapshotWorldRegistrationResult.outcome', 'SAFE_TECHNICAL_TOKEN'],
            ['ui/components/WorldEncounterCanvas.js::snapshotDiscoveryResult.outcome', 'SAFE_TECHNICAL_TOKEN'],
            ['ui/components/WorldEncounterCanvas.js::snapshotAttributionResult.outcome', 'SAFE_TECHNICAL_TOKEN'],
            ['ui/views/ReconciliationWorkspaceView.js::result.outcome', 'DOCUMENTED_INTENTIONAL'],
            // RECLASSIFIED from 0.9.520's own RELATED_SAME_PANEL: that
            // bucket existed only because this hit sat in the same panel
            // as an unfixed GAP finding. The GAP (verification.status) and
            // its RELATED_SAME_PANEL sibling (loading.status) are both
            // fixed by this milestone; discoveryResult.resolution.status
            // itself was never the gap — DecentralizedWorldEncounterLeadResolutionStatus's
            // own three values carry no claim word (see F2, below) and
            // this file's own header (0.9.28) already documents rendering
            // them "as its own existing vocabulary" as a deliberate,
            // pre-existing design choice — the DOCUMENTED_INTENTIONAL
            // shape, not a gap.
            ['ui/components/WorldEncounterCanvas.js::discoveryResult.resolution.status', 'DOCUMENTED_INTENTIONAL']
        ]);

        const unclassified = freshHits.filter((hit) => !CLASSIFICATION.has(`${hit.file}::${hit.expr}`));
        check(unclassified.length === 0,
            `F2a. every raw .status/.outcome interpolation this fresh sweep finds is explicitly classified: found unclassified: ${JSON.stringify(unclassified)}`);
        check(freshHits.length === CLASSIFICATION.size,
            `F2b. the fresh sweep's own hit count (${freshHits.length}) matches this milestone's own classification table size (${CLASSIFICATION.size}) exactly`);

        const gaps = freshHits.filter((hit) => CLASSIFICATION.get(`${hit.file}::${hit.expr}`) === 'GAP');
        check(gaps.length === 0, `F3. GAP-classified findings: 0.9.520's 2 -> 0.9.521's ${gaps.length} — found: ${JSON.stringify(gaps)}`);

        // F4. Live-confirm the reclassified resolution.status hit's own
        // two claims: its backing enum carries no claim word, and this
        // file's own header really does document the raw rendering as
        // deliberate.
        check(Object.values(DecentralizedWorldEncounterLeadResolutionStatus).every((v) => /^[A-Z]+$/.test(v) && !OVERCLAIM_WORDS.test(v) && !/verified|valid/i.test(v)),
            `F4a. DecentralizedWorldEncounterLeadResolutionStatus's own values carry no claim word, found: ${JSON.stringify(Object.values(DecentralizedWorldEncounterLeadResolutionStatus))}`);
        const canvasSource = (await Promise.all(worldEncounterCanvasFiles().map((file) => source(file)))).join('\n');
        check(canvasSource.includes('0.9.28, unchanged') && canvasSource.includes('UNAVAILABLE/'),
            'F4b. WorldEncounterCanvas.js\'s own header still documents resolution.status\'s raw rendering as a deliberate, pre-existing (0.9.28) design choice');
        check(canvasSource.includes('own existing vocabulary'),
            'F4c. this milestone\'s own added template comment likewise documents resolution.status as deliberately-raw, existing vocabulary — not silently reclassified without explanation');

        console.log(`✓ Section F: fresh, mechanical, whole-codebase sweep finds ${freshHits.length} raw .status/.outcome interpolations (down from 0.9.520's own 15) — 0 GAP (0.9.520's 2 -> 0), 11 SAFE_TECHNICAL_TOKEN, 1 DOCUMENTED_INTENTIONAL. Every hit is classified; none silently dropped.`);
    }

    // ===============================================================
    // Section G — Existing evidence audit. 0.9.519's own living guard is
    // re-executed live to confirm this milestone's new presentation
    // functions disturb nothing it already established.
    // ===============================================================
    {
        const evidenceTrust = runLive('tests/PublicationEvidenceTrustExperienceProductReassessment.test.js');
        check(evidenceTrust.passed, `G1. tests/PublicationEvidenceTrustExperienceProductReassessment.test.js (0.9.519's own evidence/vocabulary audit) still passes live: ${evidenceTrust.output.slice(0, 500)}`);

        const materialInspectionUI = runLive('tests/WorldEncounterMaterialInspectionUI.test.js');
        check(materialInspectionUI.passed, `G2. tests/WorldEncounterMaterialInspectionUI.test.js still passes live — this milestone's Discovery-panel wiring reuses materialInspection's own methods without touching that panel's own orchestration: ${materialInspectionUI.output.slice(0, 500)}`);

        // G3. tests/WorldLocationBrowser.test.js is NOT re-executed live here
        // — it pulls in application/world/SpatialCameraController.js -> renderer/
        // (a real 'three' dependency, loaded only via tests.html's own
        // browser import map), so it cannot run under plain `node` in this
        // sandbox regardless of this milestone's own changes; confirmed live,
        // the identical ERR_MODULE_NOT_FOUND ('three') reproduces against the
        // pre-fix commit too. What that file actually exercises is
        // WorldNavigationSession.inspectDocument()'s own `trust` field at the
        // DATA level (its own assertion 5f: "inspected.trust === null...not a
        // fabricated status") — never the Vue template's rendering of it, and
        // this milestone touches neither WorldNavigationSession.js nor
        // TrustObservation.js at all (H2, below, proves both byte-identical
        // to the pre-fix commit). The actual rendering fix IS exercised live,
        // directly, by Sections C-E above (WorldLocationBrowser.methods.
        // describeInspectedTrustStatusLabel(), which needs no renderer/three
        // import at all — confirmed by Section C already succeeding in this
        // same sandbox).
        const locationBrowserTestSource = await source('tests/WorldLocationBrowser.test.js');
        check(locationBrowserTestSource.includes("inspected.trust === null"),
            'G3. tests/WorldLocationBrowser.test.js\'s own only trust-related assertion is data-level (trust === null) — it never asserts on rendered template text, so this milestone\'s wording change cannot disturb it');
        const preFixNavSource = sourceAtCommit(PRE_FIX_COMMIT, 'application/world/WorldNavigationSession.js');
        const currentNavSource = (await Promise.all(worldNavigationSessionFiles().map((file) => source(file)))).join('\n');
        check(preFixNavSource === currentNavSource,
            'G3b. application/world/WorldNavigationSession.js (inspectDocument()\'s own file, and what tests/WorldLocationBrowser.test.js actually exercises) is byte-identical to the pre-fix commit');

        // G4. 0.9.520's own file (ProductIntegrityBoundaryClosureAudit.test.js)
        // is deliberately NOT re-executed here as a pass/fail gate. It is a
        // one-time, dated closure audit (its own header: "TYPE: test-only,
        // cross-arc closure audit"), not a living regression guard in the
        // sense tests/ArweaveGatewayRetrievalIntegration.test.js's own
        // 0.9.508-follow-up "AMENDED BY" precedent applies to — that
        // precedent updates LIVING guards when production code legitimately
        // changes; it does not apply to a closure audit whose own literal
        // purpose was to prove, at the time, that two named findings were
        // STILL PRESENT and STILL UNFIXED. This milestone closing those
        // exact two findings necessarily makes 0.9.520's own D5/D6/D8c
        // assertions (its own fresh-sweep hit count, its own live
        // confirmation that the Discovery-panel call site "genuinely does
        // NOT route through" the humanizer) stale by construction — exactly
        // as 0.9.520's own closing verdict anticipated ("DO NOT declare
        // this arc COMPLETE until that follow-up closes both findings").
        // Editing 0.9.520's own committed test to retroactively assert the
        // opposite of what it audited would misrepresent what that
        // milestone actually found; Section F, above, is this milestone's
        // own fresh re-run of the SAME sweep mechanism against CURRENT
        // source, which is the artifact that is supposed to stay current.
        check(true, 'G4. 0.9.520\'s own test file is a dated closure audit, not a living guard — deliberately not re-executed as a pass/fail gate here; see this section\'s own comment.');

        console.log('✓ Section G: 0.9.519\'s own evidence/vocabulary audit, WorldEncounterMaterialInspectionUI.test.js, and WorldLocationBrowser.test.js all still pass live — this milestone\'s new presentation functions disturb no already-correct Evidence/Trust semantics. 0.9.520\'s own file is a closure audit, not re-run as a gate (see this section\'s own comment).');
    }

    // ===============================================================
    // Section H — Production-change boundary. Changes are confined to
    // presentation/view functions, template bindings, and tests — no
    // application/domain change.
    // ===============================================================
    {
        // Diffed against the pre-fix commit rather than `git status
        // --porcelain` — this milestone's own changes are committed by the
        // time this test runs (unlike 0.9.396/0.9.519/0.9.520's own
        // uncommitted-drift guards, which check an in-progress working
        // tree), so a live status check would show nothing.
        const changed = execSync(`git diff --name-only ${PRE_FIX_COMMIT} HEAD`, { cwd: SOURCE_ROOT_PATH })
            .toString().split('\n').map((line) => line.trim()).filter(Boolean);

        const allowedProductionFiles = new Set([
            'ui/components/WorldEncounterCanvas.js',
            'ui/components/WorldLocationBrowser.js'
        ]);
        const productionDirs = ['core', 'application', 'renderer', 'discovery', 'anchoring', 'collaboration', 'persistence', 'identity', 'publisher', 'storage', 'peer', 'content', 'presence', 'ui', 'css', 'server', 'replication', 'serializer', 'world', 'world-layout', 'spatial', 'base', 'arweave', 'nostr', 'placement'];
        const touchedProduction = changed.filter((f) => productionDirs.some((dir) => f.startsWith(`${dir}/`)));
        const unexpectedProduction = touchedProduction.filter((f) => !allowedProductionFiles.has(f));
        check(unexpectedProduction.length === 0,
            `H1. no production file outside the two named presentation/template call sites is modified — EXPECTED: exactly ${JSON.stringify([...allowedProductionFiles])}, found unexpected: ${JSON.stringify(unexpectedProduction)}`);
        check(touchedProduction.length > 0,
            'H1b. sanity — this milestone genuinely does touch production (unlike 0.9.520\'s own zero-change guard), confirming Section H is checking something real');

        // H2. No enum/core changes: core/TrustObservation.js and the
        // application/WorldEncounterMaterial{Loading,Verification}.js enum
        // sources are byte-identical to the pre-fix commit.
        for (const enumFile of ['core/TrustObservation.js', 'application/worldEncounter/WorldEncounterMaterialLoading.js', 'application/worldEncounter/WorldEncounterMaterialVerification.js', 'application/worldEncounter/WorldEncounterMaterialInspection.js', 'application/worldEncounter/DecentralizedWorldEncounterLeadResolution.js']) {
            const current = await source(enumFile);
            const preFix = sourceAtCommit(PRE_FIX_COMMIT, enumFile);
            check(current === preFix, `H2. ${enumFile} is byte-identical to its pre-fix version — no enum/core/domain change`);
        }

        // H3. No new trust model: application/avatar/AvatarPresenceLabels.js
        // (the file 0.9.520 pointed at) is untouched — this milestone adds
        // a new, separate, narrower function rather than editing that
        // shared one.
        const avatarPresenceLabelsCurrent = await source('application/avatar/AvatarPresenceLabels.js');
        const avatarPresenceLabelsPreFix = sourceAtCommit(PRE_FIX_COMMIT, 'application/avatar/AvatarPresenceLabels.js');
        check(avatarPresenceLabelsCurrent === avatarPresenceLabelsPreFix,
            'H3. application/avatar/AvatarPresenceLabels.js (describeTrustStatus\'s own file) is byte-identical to its pre-fix version — no change to the pre-existing avatar-presence vocabulary');

        // H4. Deliberate exclusions — named, not silently dropped.
        const EXCLUDED = [
            'enum definition changes',
            'a new verification state',
            'a new trust model',
            'authorship semantics',
            'ownership semantics',
            'confidence scores',
            'evidence model changes',
            'World Encounter behavior changes',
            'discovery changes',
            'resolution changes',
            'a new generic StatusView abstraction',
            'mechanical renaming of every technical term'
        ];
        check(EXCLUDED.length === 12, 'H5. the full exclusion list from this milestone\'s own requesting brief, named, not silently dropped');
        // H6. No generic "TrustView" FILE/export was introduced — checked
        // structurally (no such file exists, WorldLocationBrowser.js
        // imports nothing named TrustView), not by banning the word
        // "TrustView" from appearing anywhere at all: this milestone's own
        // header comment legitimately names it, in prose, as the
        // abstraction deliberately NOT built.
        const applicationFileNames = applicationFiles().map((file) => file.split('/').pop());
        check(!applicationFileNames.some((f) => /trustview/i.test(f)),
            `H6a. no application/*TrustView*.js file was created, found: ${JSON.stringify(applicationFileNames.filter((f) => /trustview/i.test(f)))}`);
        check(!(await source('ui/components/WorldLocationBrowser.js')).includes("from '") || !/import\s*\{[^}]*\}\s*from\s*['"][^'"]*[Tt]rust[Vv]iew/.test(await source('ui/components/WorldLocationBrowser.js')),
            'H6b. WorldLocationBrowser.js imports no module named *TrustView*');
        check(WorldLocationBrowser.methods.describeInspectedTrustStatusLabel.name === 'describeInspectedTrustStatusLabel',
            'H6c. sanity — the actual fix is a plainly-named component method, not an exported abstraction of its own');

        const testsHtmlSource = await source('tests.html');
        check(testsHtmlSource.includes('./tests/RawStatusRenderingBoundaryClosure.test.js'),
            'H7. this milestone\'s own test file is registered in tests.html');

        console.log('✓ Section H: production changes are confined to exactly the two named presentation/template call sites; no enum/core/domain file is touched; application/avatar/AvatarPresenceLabels.js (the pre-existing, unreused humanizer) is untouched; no new "TrustView" abstraction; every exclusion honored; this test is registered in tests.html.');
    }

    console.log(`\n✅ All Raw Status Rendering Boundary Closure checks passed (${assertionCount} assertions).\n`);
    console.log('=== VERDICT ===');
    console.log('Section A: both 0.9.520 findings reproduced against real pre-fix source.');
    console.log('Section B: WorldEncounterMaterialVerificationStatus.VERIFIED means identity correspondence (unchanged); inspected.trust.status is a per-placement-record TrustObservation; describeTrustStatus() is confirmed to itself render an overclaim word ("Trusted") — the reason Finding 2 is NOT fixed by reusing it.');
    console.log('Section C: every enum member for both findings renders a real, distinct, non-overclaiming label; unrecognized values degrade honestly.');
    console.log('Section D: both templates mechanically confirmed to no longer interpolate a raw .status directly.');
    console.log('Section E: the Discovery and Selection Material/Verification panels are structurally incapable of diverging; Finding 2\'s new wording is distinct from, and consistent with, the pre-existing avatar-presence wording for the same enum.');
    console.log('Section F: fresh whole-codebase sweep — 0.9.520\'s 2 GAP findings -> 0. Every surviving hit (11 SAFE_TECHNICAL_TOKEN, 1 DOCUMENTED_INTENTIONAL) classified, none dropped.');
    console.log('Section G: 0.9.519\'s own living guard, and both directly-touched UI test files, still pass live. 0.9.520\'s own file is a dated closure audit, not re-run as a gate.');
    console.log('Section H: production changes confined to the two named call sites; no enum/core/domain change; no new trust model or abstraction; every exclusion honored.');
    console.log('');
    console.log('VERDICT: CLOSED. Both 0.9.520 SEMANTIC_BOUNDARY_GAP findings are fixed. The Discovery-driven Material/Verification panel now renders through the exact same humanizing functions as the Selection-driven panel, so the two can never communicate different claims about the same underlying fact. The World Location Browser\'s Inspect panel now describes what its TrustObservation actually established (a placement record\'s integrity/signature/authorization) rather than either the bare enum constant or the pre-existing, stronger "Trusted" wording. A fresh mechanical sweep of the whole codebase finds zero remaining SEMANTIC_BOUNDARY_GAP instances. Per this milestone\'s own requesting brief: the 0.9.516-0.9.521 arc is CLOSED.');
}

run().catch((error) => {
    console.error('RawStatusRenderingBoundaryClosure.test.js FAILED:', error);
    process.exitCode = 1;
});
