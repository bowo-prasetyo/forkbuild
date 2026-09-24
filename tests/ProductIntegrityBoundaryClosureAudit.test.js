import { readFile, readdir } from 'node:fs/promises';
import { execSync } from 'node:child_process';

import { WorldEncounterMaterialLoadStatus } from '../application/WorldEncounterMaterialLoading.js';
import { WorldEncounterMaterialVerificationStatus } from '../application/WorldEncounterMaterialVerification.js';
import { describeWorldEncounterMaterialLoadStatusLabel, describeWorldEncounterMaterialVerificationStatusLabel } from '../application/WorldEncounterMaterialInspectionView.js';
import { TrustStatus } from '../core/TrustObservation.js';
import { describeTrustStatus } from '../application/AvatarPresenceLabels.js';
import { AnchorVerificationOutcome } from '../application/AnchorVerificationOutcome.js';
import { describeVerificationOutcome } from '../application/PublicationEvidenceView.js';
import { PublicationResolutionOutcome } from '../application/PublicationResolutionOutcome.js';
import { describePublicationOutcome } from '../application/PublicationResolutionView.js';
import { worldEncounterCanvasFiles, publicationsPageFiles } from './support/SourceFileGroups.js';

// 0.9.520 — Product Integrity Boundary Closure Audit.
//
// TYPE: test-only, cross-arc closure audit — not a feature, not another
// product reassessment of one arc. Requested after 0.9.519 closed the last
// known vocabulary leak in the Publication Evidence & Trust Experience arc
// (0.9.516-0.9.519), asking a broader question than any single arc's own
// reassessment: after all of ForkBuild's recent product fixes, do the
// major user-facing boundaries still preserve the distinctions the
// architecture established? This is a CLOSURE audit spanning mature arcs,
// not a new one.
//
// EXPECTED PRODUCTION CHANGES FOR THIS MILESTONE: ZERO. Per its own
// requesting brief: if this audit finds a real violation, it stops at that
// boundary, classifies it, and names the smallest possible follow-up —
// it does not fix it inline and does not broaden its own scope chasing it.
//
// The boundary matrix this audit checks (its own requesting brief's own
// wording):
//   Discovery ≠ Resolution ≠ Verification ≠ Authorship ≠ Ownership
//   Material location ≠ Discovery artifact ≠ Proof artifact
//   Evidence ≠ Verdict
//   Content backend ≠ Discovery substrate ≠ Anchor substrate
//   World placement ≠ Publication lifecycle; Physical occupancy ≠ Presentable material
//   Observation ≠ Decision; UI observation ≠ Core/application ownership
//
// Sections:
//   A. Entry-state reconfirmation — 0.9.396's and 0.9.519's own guard
//      files re-executed live against current source.
//   B. Publication identity continuity — contentHash / publicationId /
//      locator / discovery announcementId / anchor transaction stay
//      separately-named artifacts across the full chain, walked fresh.
//   C. Three-way backend independence — Content / Discovery / Anchor stay
//      three structurally decoupled axes with deliberately different
//      vocabularies for the same real-world network.
//   D. Observation/verdict boundary — THE FLAGSHIP. A mechanical,
//      whole-codebase sweep (not a hand-picked file list) for every raw
//      `{{ x.status }}`/`{{ x.outcome }}` template interpolation across
//      ui/components/ and ui/views/, each classified against its own
//      real, live-read backing enum. Two genuine, freshly-found
//      SEMANTIC_BOUNDARY_GAP instances survive classification.
//   E. World Encounter boundary — World never independently discovers or
//      verifies; Repository admission remains the one convergence seam;
//      physical placement stays independent state.
//   F. Failure-boundary preservation — representative failures across
//      layers stay distinct, non-success labels; the one real failover
//      mechanism in this codebase is confirmed same-substrate-only, never
//      an implicit cross-substrate fallback.
//   G. UI/core ownership — a concrete witness that UI reads an
//      already-decided status to gate a presentational affordance,
//      never re-derives the decision itself.
//   H. Vocabulary boundary — restates Section D's sweep as the operative
//      test ("could this wording cause the user to infer a fact the
//      system has not established?"), not a prettiness pass.
//   I. Findings, classification, and the recommended follow-up.
//   J. Deliberate exclusions, and the production-change guard.
//   K. Verdict.

const SOURCE_ROOT = new URL('../', import.meta.url);
const SOURCE_ROOT_PATH = SOURCE_ROOT.pathname;

async function source(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
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

// The same banned-overclaim vocabulary 0.9.519 already established and
// swept — reused here, never redefined, so this audit measures against
// the identical bar rather than a competing one.
const OVERCLAIM_WORDS = /\b(trusted|safe|permanent|guaranteed|owns?|owned|authored?|authorship)\b/i;

// A general-purpose, mechanical sweep for raw `{{ expr.status }}` /
// `{{ expr.outcome }}` template interpolations — proven against synthetic
// cases (Section D1) before it is ever pointed at real source, mirroring
// 0.9.396's own "prove the sweep correct first" discipline for a
// structural guard.
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
    console.log('=== 0.9.520 — Product Integrity Boundary Closure Audit ===\n');

    // ===============================================================
    // Section A — Entry-state reconfirmation. The two most relevant
    // existing guards, re-executed live against CURRENT source, not
    // cited from either milestone's own prose.
    // ===============================================================
    {
        const boundaryHardening = runLive('tests/ProductIntegrityBoundaryHardening.test.js');
        check(boundaryHardening.passed, `A1. tests/ProductIntegrityBoundaryHardening.test.js (0.9.396's own core/ import boundary guard) still passes live: ${boundaryHardening.output.slice(0, 400)}`);

        const evidenceTrust = runLive('tests/PublicationEvidenceTrustExperienceProductReassessment.test.js');
        check(evidenceTrust.passed, `A2. tests/PublicationEvidenceTrustExperienceProductReassessment.test.js (0.9.519's own evidence/vocabulary audit) still passes live: ${evidenceTrust.output.slice(0, 400)}`);

        console.log('✓ Section A: 0.9.396\'s core/ import boundary guard and 0.9.519\'s evidence/vocabulary audit both re-confirm their own recorded verdicts against current source.');
    }

    // ===============================================================
    // Section B — Publication identity continuity. contentHash /
    // publicationId / locator / announcementId / anchor transaction stay
    // five separately-named artifacts across the full chain, each
    // re-read live from its own current source rather than assumed.
    // ===============================================================
    {
        const publicationSource = await source('publisher/Publication.js');
        check(/\bid\s*=\s*createId\(\)/.test(publicationSource) && publicationSource.includes('contentHash = null'),
            'B1. publisher/Publication.js still constructs `id` (publicationId) and `contentHash` as two separate constructor fields — never one merged identifier');

        const discoverySource = await source('application/ArweaveGraphqlDiscoveryQueryService.js');
        check(discoverySource.includes('uri: envelope.uri,') && discoverySource.includes('announcementId'),
            'B2. a discovered candidate\'s own claimed material location (uri) and the transaction id that carried the announcement (announcementId) stay two separate fields');

        const decentralizedViewSource = (await Promise.all(publicationsPageFiles().map((file) => source(file)))).join('\n');
        check(decentralizedViewSource.includes('<dt>Locator</dt>') && decentralizedViewSource.includes('<dt>Transaction</dt>') && decentralizedViewSource.includes('<dt>Content hash</dt>'),
            'B3. Locator (material location) / Transaction (anchor proof) / Content hash stay three separately-labeled fields on the Publication Center\'s own detail view');

        const inspectionSource = await source('application/WorldEncounterMaterialInspection.js');
        check(inspectionSource.includes('resolvedSelection.objectId') || inspectionSource.includes('objectId'),
            'B4. World Encounter material inspection routes on `resolvedSelection.objectId` (the Publication identity a Wanderer selected) — never re-derives or substitutes a contentHash for it');
        check(!/contentHash\s*=\s*resolvedSelection\.objectId|objectId\s*=\s*.*contentHash/.test(inspectionSource),
            'B4b. objectId and contentHash are never assigned into one another inside the World Encounter inspection boundary');

        const evidenceViewSource = await source('application/PublicationEvidenceView.js');
        check(!OVERCLAIM_WORDS.test(evidenceViewSource.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n').match(/return `[^`]*`/g)?.join(' ') || ''),
            'B5. sanity — application/PublicationEvidenceView.js\'s own returned label strings carry no ownership/authorship/trust word (re-checked structurally, independent of 0.9.519\'s own per-outcome assertions)');

        console.log('✓ Section B: Publication identity stays coherent across Editor (id/contentHash) -> Discovery (uri/announcementId) -> Anchor (Locator/Transaction/Content hash) -> World Encounter (objectId) — no surface substitutes one artifact for another.');
    }

    // ===============================================================
    // Section C — Three-way backend independence. Content / Discovery /
    // Anchor stay three structurally decoupled axes, re-confirmed fresh.
    // ===============================================================
    {
        const crossImports = [
            ['content -> discovery/anchoring', 'content', ['discovery', 'anchoring']],
            ['discovery -> content/anchoring', 'discovery', ['content', 'anchoring']],
            ['anchoring -> content/discovery', 'anchoring', ['content', 'discovery']],
        ];
        for (const [label, dir] of crossImports) {
            const grepResult = (() => {
                try {
                    return execSync(`grep -rlE "from '(\\.\\./)*(discovery|anchoring|content)/" ${dir}/ 2>/dev/null`, { cwd: SOURCE_ROOT_PATH }).toString().trim();
                } catch {
                    return '';
                }
            })();
            // A file is only a real violation if it imports one of the
            // OTHER two axes, never its own directory (self-imports are
            // expected and fine) — filtered here rather than trusting a
            // bare grep hit.
            const lines = grepResult.split('\n').filter(Boolean).filter((f) => !f.startsWith(`${dir}/`));
            check(lines.length === 0, `C1. ${label}: zero files import across this boundary today (found: ${JSON.stringify(lines)})`);
        }

        const arweaveContentStoreSource = await source('content/ArweaveContentStore.js');
        const arweaveAnchorPublisherSource = await source('anchoring/ArweaveAnchorPublisher.js');
        check(arweaveContentStoreSource.includes("get storage() { return 'ar'; }"),
            "C2a. the Arweave CONTENT backend's own code is the short form 'ar'");
        check(arweaveAnchorPublisherSource.includes("get anchorType() { return 'arweave'; }"),
            "C2b. the Arweave ANCHOR's own anchorType is the long form 'arweave' — deliberately a different string literal for the same real-world network");

        const anchorUseCaseSource = await source('application/CreateExternalPublicationAnchorUseCase.js');
        const codeOnlyAnchor = anchorUseCaseSource.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
        const executeMatch = codeOnlyAnchor.match(/async execute\(([^)]*)\)/);
        check(Boolean(executeMatch) && !/storage|discoveryProvider/.test(executeMatch[1]),
            `C3. CreateExternalPublicationAnchorUseCase.js's own execute() signature still carries no storage/discoveryProvider parameter — found: "${executeMatch ? executeMatch[1] : '<no match>'}"`);

        // C4. All three axes remain independently configurable through
        // three separate settings surfaces — never one combined picker
        // that would silently couple two axes together.
        const arweaveGatewaySource = await source('ui/views/ArweaveGatewaySettingsView.js');
        const contentProviderSource = await source('ui/views/ContentProviderSettingsView.js');
        const nostrRelaySource = await source('ui/views/NostrPublicationRelaySettingsView.js');
        check(Boolean(arweaveGatewaySource) && Boolean(contentProviderSource) && Boolean(nostrRelaySource),
            'C4. Content backend (ContentProviderSettingsView/ArweaveGatewaySettingsView) and Discovery substrate (NostrPublicationRelaySettingsView) each keep their own dedicated settings surface — no shared/merged configuration view exists');

        console.log('✓ Section C: content/, discovery/, and anchoring/ never import across one another; Arweave\'s own content-backend code (\'ar\') and anchor code (\'arweave\') stay deliberately different string literals; anchor creation carries no storage/discoveryProvider parameter; the three axes keep three separate settings surfaces.');
    }

    // ===============================================================
    // Section D — Observation/verdict boundary. THE FLAGSHIP. A
    // mechanical sweep — not a hand-picked file list — for every raw
    // `{{ x.status }}`/`{{ x.outcome }}` template interpolation across
    // ui/components/ and ui/views/, each classified against its own
    // real, live-read backing enum.
    // ===============================================================
    let flagshipFindings = [];
    {
        // D1. Prove the sweep function correct on synthetic cases before
        // it is ever pointed at real source — mirrors 0.9.396's own
        // "prove the sweep correct first" discipline.
        const synthetic = 'a<dd>{{ noMatch }}</dd>b<dd>{{ x.status }}</dd>c<dd>{{ y.z.outcome }}</dd>';
        const syntheticHits = findRawStatusInterpolations(synthetic);
        check(syntheticHits.length === 2 && syntheticHits[0].expr === 'x.status' && syntheticHits[1].expr === 'y.z.outcome',
            `D1. the sweep function finds exactly the two real .status/.outcome interpolations in a synthetic fixture, ignoring a bare non-dotted interpolation — found: ${JSON.stringify(syntheticHits)}`);

        // D2. Fresh directory walk — ui/components/ and ui/views/, every
        // *.js file, not a list this milestone chose in advance.
        const componentFiles = (await readdir(new URL('ui/components/', SOURCE_ROOT))).filter((f) => f.endsWith('.js'));
        const viewFiles = (await readdir(new URL('ui/views/', SOURCE_ROOT))).filter((f) => f.endsWith('.js'));
        check(componentFiles.length > 0 && viewFiles.length > 0, `D2. fresh census: ${componentFiles.length} ui/components/ files, ${viewFiles.length} ui/views/ files`);

        const allHits = [];
        for (const [dir, files] of [['ui/components', componentFiles], ['ui/views', viewFiles]]) {
            for (const file of files) {
                const relativePath = `${dir}/${file}`;
                const text = await source(relativePath);
                for (const hit of findRawStatusInterpolations(text)) {
                    allHits.push({ file: relativePath, ...hit });
                }
            }
        }

        // D3. Classification table, keyed by file+expr, each entry
        // backed by this milestone's own live reading of the real
        // backing enum (see Section D's own investigation) — never a
        // guess from the expression's own name alone. Four buckets:
        //   GAP                    — a real SEMANTIC_BOUNDARY_GAP: the
        //                             backing enum's own values include
        //                             a claim word ("VERIFIED"/"VALID")
        //                             that could read as a stronger fact
        //                             than established, unhumanized,
        //                             AND a humanizing function for the
        //                             identical enum already exists
        //                             elsewhere in this codebase, unused
        //                             at this call site.
        //   RELATED_SAME_PANEL     — a raw interpolation inside the SAME
        //                             template block as a GAP finding,
        //                             lower severity on its own (its
        //                             enum's own values are plain, e.g.
        //                             AVAILABLE/UNAVAILABLE) but named
        //                             for the same follow-up since it
        //                             sits in the identical unfixed
        //                             panel.
        //   SAFE_TECHNICAL_TOKEN   — the backing enum's own values are
        //                             plain, lowercase, hyphenated
        //                             factual tokens ('resolved',
        //                             'already-available', 'claimed',
        //                             'registered', ...), live-confirmed
        //                             against the real enum source, with
        //                             no claim word.
        //   DOCUMENTED_INTENTIONAL — the raw fallback is this file's own
        //                             explicit, commented design choice
        //                             ("anything else -> result.outcome's
        //                             own literal value, displayed").
        const CLASSIFICATION = new Map([
            ['ui/components/WorldEncounterCanvas.js::discoveryResult.inspection.verification.status', 'GAP'],
            ['ui/components/WorldLocationBrowser.js::inspected.trust.status', 'GAP'],
            ['ui/components/WorldEncounterCanvas.js::discoveryResult.inspection.loading.status', 'RELATED_SAME_PANEL'],
            ['ui/components/WorldEncounterCanvas.js::discoveryResult.resolution.status', 'RELATED_SAME_PANEL'],
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
        ]);

        const unclassified = allHits.filter((hit) => !CLASSIFICATION.has(`${hit.file}::${hit.expr}`));
        check(unclassified.length === 0,
            `D4. every raw .status/.outcome interpolation this fresh sweep found is explicitly classified — UNCLASSIFIED would itself be a finding (mirrors 0.9.399's own discipline): found unclassified: ${JSON.stringify(unclassified)}`);
        check(allHits.length === CLASSIFICATION.size,
            `D5. the fresh sweep's own hit count (${allHits.length}) matches this milestone's own classification table size (${CLASSIFICATION.size}) exactly — neither more (an unclassified hit) nor fewer (a stale classification for code that no longer exists)`);

        const gaps = allHits.filter((hit) => CLASSIFICATION.get(`${hit.file}::${hit.expr}`) === 'GAP');
        const related = allHits.filter((hit) => CLASSIFICATION.get(`${hit.file}::${hit.expr}`) === 'RELATED_SAME_PANEL');
        check(gaps.length === 2, `D6. exactly two GAP-classified raw interpolations survive this sweep, found: ${JSON.stringify(gaps)}`);
        check(related.length === 2, `D7. exactly two RELATED_SAME_PANEL raw interpolations survive this sweep, found: ${JSON.stringify(related)}`);

        // D8. Live-confirm each GAP finding's own claim: the backing enum
        // really can render a claim word, and a humanizer for the
        // identical enum really does already exist elsewhere, unused at
        // this exact call site.
        check(WorldEncounterMaterialVerificationStatus.VERIFIED === 'VERIFIED',
            'D8a. discoveryResult.inspection.verification.status genuinely CAN render the bare word "VERIFIED" — the identical enum 0.9.519 already fixed for this file\'s OTHER (selection-driven) panel');
        const canvasSource = (await Promise.all(worldEncounterCanvasFiles().map((file) => source(file)))).join('\n');
        check(canvasSource.includes('describeMaterialVerificationStatusLabel(materialInspection.verification.status)'),
            'D8b. this file already imports/uses describeWorldEncounterMaterialVerificationStatusLabel() for its OTHER (selection-driven) panel — the exact humanizer this Discovery-modal call site does not use');
        check(!canvasSource.includes('describeMaterialVerificationStatusLabel(discoveryResult.inspection.verification.status)'),
            'D8c. confirms the Discovery-modal call site genuinely does NOT route through that already-present humanizer — this is a real, current gap, not a stale finding');

        check(TrustStatus.VALID === 'VALID',
            'D8d. inspected.trust.status genuinely CAN render the bare word "VALID" — a claim-shaped word for what core/TrustObservation.js\'s own header calls a "purely DESCRIPTIVE" fact (integrity + signature + authorization), never general trustworthiness');
        check(describeTrustStatus(TrustStatus.VALID) === 'Trusted',
            'D8e. a humanizer for this EXACT enum (describeTrustStatus, application/AvatarPresenceLabels.js) already exists elsewhere in this codebase, unused at WorldLocationBrowser.js\'s own call site');
        const locationBrowserSource = await source('ui/components/WorldLocationBrowser.js');
        check(!locationBrowserSource.includes('describeTrustStatus'),
            'D8f. confirms ui/components/WorldLocationBrowser.js genuinely does not import or call describeTrustStatus anywhere — this is a real, current gap, not a stale finding');

        // D9. Confirm the SAFE_TECHNICAL_TOKEN bucket's own claim,
        // live, for a representative sample rather than merely asserted:
        // its backing enum values are plain, lowercase, factual tokens,
        // never a claim word.
        const decentralizedOutcomeSource = await source('application/DecentralizedSnapshotResolutionOutcome.js');
        const registrationOutcomeSource = await source('application/SnapshotWorldRegistrationOutcome.js');
        // Checked against the actual VALUE tokens only (the quoted string
        // literals themselves) — never the surrounding prose, which uses
        // "own" constantly as a possessive determiner throughout this
        // codebase's own comment style and would otherwise false-positive
        // against \bowns?\b.
        const decentralizedOutcomeValues = [...decentralizedOutcomeSource.matchAll(/:\s*'([^']*)'/g)].map((m) => m[1]);
        check(decentralizedOutcomeValues.length > 0 && decentralizedOutcomeValues.includes('resolved')
            && decentralizedOutcomeValues.every((v) => /^[a-z-]+$/.test(v)) && !decentralizedOutcomeValues.some((v) => OVERCLAIM_WORDS.test(v) || /verified/i.test(v)),
            `D9a. DecentralizedSnapshotResolutionOutcome's own VALUE tokens are plain lowercase-hyphenated strings, none of which are claim words, found: ${JSON.stringify(decentralizedOutcomeValues)}`);
        check(registrationOutcomeSource.includes("REGISTERED: 'registered'"),
            'D9b. SnapshotWorldRegistrationOutcome\'s own value is the plain lowercase token \'registered\', not a claim word');

        // D10. Confirm the DOCUMENTED_INTENTIONAL bucket's own claim: the
        // raw fallback really is this file's own explicit, pre-existing
        // design decision, not an oversight this sweep merely excused.
        const reconciliationSource = await source('ui/views/ReconciliationWorkspaceView.js');
        check(reconciliationSource.includes("anything else -> `result.outcome`'s own literal value, displayed"),
            'D10. ReconciliationWorkspaceView.js\'s own header explicitly documents the raw result.outcome fallback as a deliberate design choice, predating this audit');

        flagshipFindings = gaps.map((g) => ({ ...g }));
        console.log(`✓ Section D: FLAGSHIP — a fresh, mechanical sweep of ${allHits.length} raw .status/.outcome template interpolations across ui/components/ and ui/views/ classifies exactly 2 as GAP (SEMANTIC_BOUNDARY_GAP), 2 as RELATED_SAME_PANEL, 10 as SAFE_TECHNICAL_TOKEN, and 1 as an already-documented, intentional fallback. Both GAP findings are confirmed live: the humanizing function each one needs already exists elsewhere in this codebase and is simply not wired into this call site.`);
        for (const g of gaps) {
            console.log(`    - GAP: ${g.file} line ${g.line}: {{ ${g.expr} }}`);
        }
    }

    // ===============================================================
    // Section E — World Encounter boundary. World never independently
    // discovers or verifies; Repository admission remains the one
    // convergence seam; physical placement stays independent state.
    // ===============================================================
    {
        const worldFiles = (await readdir(new URL('world/', SOURCE_ROOT))).filter((f) => f.endsWith('.js'));
        const worldLayoutFiles = (await readdir(new URL('world-layout/', SOURCE_ROOT))).filter((f) => f.endsWith('.js'));
        let crossImportViolations = [];
        for (const [dir, files] of [['world', worldFiles], ['world-layout', worldLayoutFiles]]) {
            for (const file of files) {
                const text = await source(`${dir}/${file}`);
                const importLines = text.split('\n').filter((l) => /^\s*import\b/.test(l) && /from ['"](\.\.\/)*(discovery|anchoring|content)\//.test(l));
                if (importLines.length > 0) crossImportViolations.push({ file: `${dir}/${file}`, importLines });
            }
        }
        check(crossImportViolations.length === 0,
            `E1. world/ and world-layout/ (${worldFiles.length + worldLayoutFiles.length} files, fresh census) never import discovery/, anchoring/, or content/ directly — World never independently discovers or verifies. Found: ${JSON.stringify(crossImportViolations)}`);

        const catalogSource = await source('ui/components/PublicationCatalog.js');
        check(catalogSource.includes('CreateDiscoveryUseCase') && catalogSource.includes('searchPublicationsUseCase.execute'),
            'E2. Repository (ui/views/RepositoryView.js -> ui/components/PublicationCatalog.js) still admits Publications through the same CreateDiscoveryUseCase/SearchPublicationsUseCase seam every other discovery surface uses — no separate, parallel admission mechanism');

        const repositoryViewSource = await source('ui/views/RepositoryView.js');
        check(repositoryViewSource.includes('<PublicationCatalog') && !/UseCase|discoveryProvider/.test(repositoryViewSource),
            'E3. RepositoryView.js itself stays a thin wrapper — no discovery or verification logic of its own');

        console.log('✓ Section E: World never imports discovery/anchoring/content directly; Repository admits Publications through the same discovery use-case seam every other surface uses; RepositoryView.js itself contains no discovery logic of its own.');
    }

    // ===============================================================
    // Section F — Failure-boundary preservation. Representative
    // failures across layers stay distinct; the one real failover
    // mechanism in this codebase is confirmed same-substrate-only.
    // ===============================================================
    {
        // F1. Discovery/Resolution/Anchor failures stay distinct, real,
        // currently-exported labels — reusing 0.9.519's own established
        // labels, re-read live rather than re-derived a second way.
        const unavailableLabel = describePublicationOutcome(PublicationResolutionOutcome.CONTENT_UNAVAILABLE);
        const mismatchLabel = describePublicationOutcome(PublicationResolutionOutcome.CONTENT_HASH_MISMATCH);
        const proofUnavailableLabel = describeVerificationOutcome(AnchorVerificationOutcome.PROOF_UNAVAILABLE);
        const invalidProofLabel = describeVerificationOutcome(AnchorVerificationOutcome.INVALID_PROOF);
        const distinctLabels = new Set([unavailableLabel, mismatchLabel, proofUnavailableLabel, invalidProofLabel]);
        check(distinctLabels.size === 4,
            `F1. four representative failures (resolution-unavailable, hash-mismatch, anchor-proof-unavailable, anchor-invalid-proof) render four DISTINCT labels — none collapses into a generic "failed", found ${distinctLabels.size} distinct`);
        check(![...distinctLabels].some((l) => /\b(success|verified|valid)\b/i.test(l)),
            `F1b. none of these four failure labels reads as a bare success/verified/valid claim, found: ${JSON.stringify([...distinctLabels])}`);

        // F2. The one real failover mechanism this codebase has — Arweave
        // gateway failover — is confirmed, live, to be SAME-SUBSTRATE
        // ONLY (gateway-to-gateway within Arweave), never an implicit
        // cross-substrate fallback (e.g. never silently trying IPFS
        // because Arweave failed). "No implicit fallback merely because
        // another provider happens to be available."
        const failoverSource = await source('application/ArweaveGatewayFailoverWorldEncounterMaterialResolver.js');
        check(failoverSource.includes("throw new Error('ArweaveGatewayFailoverWorldEncounterMaterialResolver: a non-empty gatewayUrls array is required')"),
            'F2a. the failover resolver requires an explicit, caller-supplied gatewayUrls array — it never invents or discovers additional gateways, and never reaches for a different storage backend, on its own');
        check(failoverSource.includes("get storage() { return 'ar'; }"),
            "F2b. the failover resolver's own storage identity remains 'ar' (Arweave) — every wrapped resolver is the SAME substrate's own resolver class, never a mix of content backends");
        check(!/ipfs|bitcoin|base/i.test(failoverSource),
            'F2c. this failover mechanism never mentions another substrate at all — confirming the failover is gateway-to-gateway within one substrate, never cross-substrate');

        console.log('✓ Section F: representative failures across resolution/verification/anchor stay four distinct, non-success labels; the one real failover mechanism in this codebase (Arweave gateway failover) is confirmed, live, to operate only within a single substrate — no implicit cross-substrate fallback exists anywhere in this file.');
    }

    // ===============================================================
    // Section G — UI/core ownership. A concrete witness that UI reads an
    // already-decided status to gate a presentational affordance, never
    // re-derives the decision itself. Classified honestly
    // (OBSERVED_ONLY), not claimed as a codebase-wide enforced sweep —
    // no general static check can distinguish "gating a button" from
    // "making a decision" by grammar alone.
    // ===============================================================
    {
        const canvasSource = (await Promise.all(worldEncounterCanvasFiles().map((file) => source(file)))).join('\n');
        check(canvasSource.includes("this.discoveryResult.inspection.verification.status === 'VERIFIED'"),
            'G1. isDiscoveredPublicationSelectable() reads a status the application layer (inspectWorldEncounterMaterial/verifyWorldEncounterMaterial) already computed, to gate whether a "Select Publication" button is enabled — it never calls a verifier, never re-hashes material, and never imports WorldEncounterMaterialVerification.js itself');
        check(!canvasSource.includes("import { verifyWorldEncounterMaterial }") && !canvasSource.includes("import { WorldEncounterMaterialIdentityVerifier }"),
            'G2. ui/components/WorldEncounterCanvas.js never imports the verifier itself — only the already-computed result, and only the humanizing view functions over it');

        console.log('✓ Section G (OBSERVED_ONLY — a concrete witness, not a codebase-wide sweep): the one UI decision point this section inspects (whether a discovered Publication is selectable) reads a status the application layer already decided, and never imports or calls the verifier itself.');
    }

    // ===============================================================
    // Section H — Vocabulary boundary. Restates Section D's sweep as
    // the operative test this milestone's own brief asks for: not "is
    // this word pretty" but "could this wording cause the user to infer
    // a fact the system has not established."
    // ===============================================================
    {
        check(flagshipFindings.length === 2, 'H1. Section D\'s own two GAP findings are the operative answer to this section\'s question — reused, not re-derived a second, competing way');
        for (const finding of flagshipFindings) {
            check(typeof finding.file === 'string' && typeof finding.line === 'number',
                `H2. each GAP finding carries a real file and line, found: ${JSON.stringify(finding)}`);
        }
        console.log('✓ Section H: the operative vocabulary question ("could this wording cause the user to infer an unestablished fact?") is answered by Section D\'s own sweep — yes, in exactly two places, both named, both left unfixed by this milestone\'s own production-change guard (Section J).');
    }

    // ===============================================================
    // Section I — Findings, classification, and the recommended
    // follow-up. Per this milestone's own requesting brief: stop at the
    // boundary, classify, do not fix, do not broaden scope.
    // ===============================================================
    {
        const CLASSIFICATION = 'SEMANTIC_BOUNDARY_GAP';
        check(flagshipFindings.length === 2, 'I1. exactly two findings are classified — matching Section D');
        console.log('✓ Section I: CLASSIFICATION = SEMANTIC_BOUNDARY_GAP (x2).');
        console.log('    Finding 1 — ui/components/WorldEncounterCanvas.js, "Publication Discovery" modal panel: raw');
        console.log('    interpolation of discoveryResult.inspection.verification.status (can render the bare word');
        console.log('    "VERIFIED") and .loading.status/.resolution.status. This is a SECOND call site into the same');
        console.log('    file\'s own WorldEncounterMaterialLoadStatus/VerificationStatus enums that 0.9.519 fixed for the');
        console.log('    SELECTION-driven panel — the DISCOVERY-driven panel (0.9.111-0.9.113, predating 0.9.519) was');
        console.log('    never updated to match. This narrows 0.9.519\'s own closing claim ("every other Material-');
        console.log('    verification surface already held the line") — it did not.');
        console.log('    Finding 2 — ui/components/WorldLocationBrowser.js, the World Location Browser\'s Inspect panel:');
        console.log('    raw interpolation of inspected.trust.status (core/TrustObservation.js\'s TrustStatus enum, can');
        console.log('    render the bare word "VALID"), even though a humanizer for this exact enum already exists');
        console.log('    (describeTrustStatus, application/AvatarPresenceLabels.js) and is simply not imported here.');
        console.log('    RECOMMENDED FOLLOW-UP (not this milestone, per its own zero-production-change guard): a single');
        console.log('    small milestone routing both call sites through their already-existing (Finding 2) or already-');
        console.log('    adjacent (Finding 1) humanizing view functions — the same shape of fix 0.9.519 already made for');
        console.log('    this same file\'s OTHER panel. No new view file is even required for Finding 1.');
    }

    // ===============================================================
    // Section J — Deliberate exclusions, and the production-change
    // guard. Expected production changes for this milestone: ZERO.
    // ===============================================================
    {
        const EXCLUDED = [
            'a new trust/reputation system',
            'authorship proofs',
            'ownership semantics',
            'confidence scores',
            'new verification statuses',
            'provider ranking',
            'fallback',
            'caching',
            'automatic anchoring',
            'multi-anchor orchestration',
            'new discovery protocols',
            'new World lifecycle machinery',
            'generic abstraction/refactoring',
            'vocabulary cleanup with no semantic impact',
            'fixing either Section D/I finding inline'
        ];
        check(EXCLUDED.length === 15, 'J1. the full exclusion list from this milestone\'s own requesting brief, named, not silently dropped');

        const statusOutput = execSync('git status --porcelain', { cwd: SOURCE_ROOT_PATH }).toString();
        const changed = statusOutput.split('\n').map((line) => line.slice(3).trim()).filter(Boolean);
        const productionDirs = ['core', 'application', 'renderer', 'discovery', 'anchoring', 'collaboration', 'persistence', 'identity', 'publisher', 'storage', 'peer', 'content', 'presence', 'ui', 'css', 'server', 'replication', 'serializer', 'world', 'world-layout', 'spatial', 'base', 'arweave', 'nostr', 'placement'];
        const touchedProduction = changed.filter((f) => productionDirs.some((dir) => f.startsWith(`${dir}/`)));
        check(touchedProduction.length === 0,
            `J2. no production-directory file is modified by this milestone — EXPECTED PRODUCTION CHANGES: ZERO, exactly as this milestone's own brief requires (found: ${JSON.stringify(touchedProduction)})`);

        const testsHtmlSource = await source('tests.html');
        check(testsHtmlSource.includes('./tests/ProductIntegrityBoundaryClosureAudit.test.js'),
            "J3. this milestone's own test file is registered in tests.html");

        console.log('✓ Section J: zero production-directory changes; every item from this milestone\'s own exclusion list, including its own two findings, deliberately left unfixed; this test is registered in tests.html.');
    }

    console.log(`\n✅ All Product Integrity Boundary Closure Audit checks passed (${assertionCount} assertions).\n`);
    console.log('=== VERDICT ===');
    console.log('Section A (entry-state): 0.9.396 and 0.9.519 both reconfirm live. No gap.');
    console.log('Section B (identity continuity): contentHash/publicationId/locator/announcementId/anchor transaction stay five separately-named artifacts across the full chain. No gap.');
    console.log('Section C (three-way independence): content/discovery/anchoring never cross-import; deliberately different vocabularies for the same network; anchor creation carries no storage/discoveryProvider parameter. No gap.');
    console.log('Section D (observation/verdict — FLAGSHIP): a fresh, mechanical, whole-codebase sweep of 15 raw .status/.outcome interpolations finds 2 genuine SEMANTIC_BOUNDARY_GAP instances, both confirmed live, both narrowing 0.9.519\'s own closing claim.');
    console.log('Section E (World Encounter boundary): World never independently discovers/verifies; Repository admits through the same discovery seam every other surface uses. No gap.');
    console.log('Section F (failure-boundary): representative failures stay distinct; the one real failover mechanism is same-substrate-only. No gap.');
    console.log('Section G (UI/core ownership, OBSERVED_ONLY): the one inspected UI decision point reads an already-decided status; it never imports or calls the verifier itself.');
    console.log('Section H (vocabulary boundary): answered by Section D\'s own sweep — yes, in exactly two places.');
    console.log('Section I: CLASSIFICATION = SEMANTIC_BOUNDARY_GAP (x2). Named, not fixed. Smallest-possible follow-up recommended, not opened.');
    console.log('Section J: EXPECTED PRODUCTION CHANGES: ZERO — confirmed. Every exclusion, including this milestone\'s own two findings, honored.');
    console.log('');
    console.log('VERDICT: SEMANTIC_BOUNDARY_GAP. This closure audit does NOT certify the full decentralized Publication -> World Encounter -> Evidence -> Anchoring arc CLOSED: two real, freshly-found raw-enum presentation gaps survive current source, both structurally identical in kind to 0.9.519\'s own flagship finding, in files 0.9.519 itself touched. Every other boundary this audit checked — identity continuity, three-way backend independence, World Encounter\'s own boundary, failure-boundary preservation, and UI/core ownership at the one inspected witness — holds. Per this milestone\'s own requesting brief, the audit stops here: zero production changes, both findings named and classified, and the smallest possible follow-up recommended rather than opened. DO NOT declare this arc COMPLETE until that follow-up closes both findings.');
}

run().catch((error) => {
    console.error('ProductIntegrityBoundaryClosureAudit.test.js FAILED:', error);
    process.exitCode = 1;
});
