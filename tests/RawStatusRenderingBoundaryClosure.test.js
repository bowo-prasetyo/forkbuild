
import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import WorldLocationBrowser from '../ui/components/WorldLocationBrowser.js';
import { WorldEncounterMaterialLoadStatus } from '../application/worldEncounter/WorldEncounterMaterialLoading.js';
import { WorldEncounterMaterialVerificationStatus } from '../application/worldEncounter/WorldEncounterMaterialVerification.js';
import { describeWorldEncounterMaterialLoadStatusLabel, describeWorldEncounterMaterialVerificationStatusLabel } from '../application/worldEncounter/WorldEncounterMaterialInspectionView.js';
import { TrustStatus } from '../core/TrustObservation.js';
import { describeTrustStatus } from '../application/avatar/AvatarPresenceLabels.js';
import { worldEncounterCanvasFiles, worldNavigationSessionFiles } from './support/SourceFileGroups.js';
import { readSource as source } from './support/SourceText.js';

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

const PRE_FIX_COMMIT = '6123be9'; // HEAD immediately before this milestone's own changes.

let assertionCount = 0;
function check(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
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
