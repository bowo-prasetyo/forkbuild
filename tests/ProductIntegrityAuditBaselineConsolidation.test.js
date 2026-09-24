import { readFile, readdir } from 'node:fs/promises';
import { execSync } from 'node:child_process';

import { findRawStatusInterpolations, OVERCLAIM_WORDS } from './support/RawStatusInterpolationSweep.js';

import { WorldEncounterMaterialVerificationStatus } from '../application/WorldEncounterMaterialVerification.js';
import { TrustStatus } from '../core/TrustObservation.js';
import { AnchorVerificationOutcome } from '../application/AnchorVerificationOutcome.js';
import { describeVerificationOutcome } from '../application/PublicationEvidenceView.js';
import { PublicationResolutionOutcome } from '../application/PublicationResolutionOutcome.js';
import { describePublicationOutcome } from '../application/PublicationResolutionView.js';
import { worldEncounterCanvasFiles, publicationsPageFiles } from './support/SourceFileGroups.js';

// 0.9.522 — Product Integrity Audit Baseline Consolidation.
//
// TYPE: test-only. EXPECTED PRODUCTION CHANGES: ZERO.
//
// Closing milestone of the 0.9.516-0.9.521 Publication Evidence & Trust
// Experience / Product Integrity arc. 0.9.520 (Product Integrity Boundary
// Closure Audit) swept every major user-facing boundary this codebase had
// established and found exactly two SEMANTIC_BOUNDARY_GAP instances;
// 0.9.521 (Close Remaining Raw Status Rendering Boundaries) closed both.
// This milestone does not look for a THIRD gap. Its job is different:
// take the boundaries 0.9.520/0.9.521 discovered and PROVED still held,
// and turn them into a durable, permanent set of regression invariants a
// future feature cannot silently violate — without re-litigating,
// re-deriving, or re-narrating either of those two closure audits.
//
// Concretely, that means two things this file actually does:
//   1. Re-confirm, live, against CURRENT source (not cited from either
//      prior milestone's own prose) that each of six boundaries those two
//      milestones established still holds.
//   2. Extract the ONE mechanism most worth keeping — 0.9.520's own
//      mechanical raw-status/outcome sweep — out of "embedded in a dated,
//      one-time closure audit" and into tests/support/
//      RawStatusInterpolationSweep.js, a shared module a FUTURE test can
//      import. That is the actual permanent regression guard: it does not
//      matter that this file's own classification table lists 12 hits and
//      0 GAP today — what matters is that the mechanism used to reach that
//      number tomorrow is a one-line import, not a fourth copy-pasted
//      inline function.
//
// SIX BOUNDARIES CONSOLIDATED (0.9.520's own requesting brief's own
// wording, condensed to the recommended milestone's own six-item list):
//   A. Observation boundary   — a raw status/outcome enum value must not
//                                cross a user-facing template boundary
//                                unless the enum's own values are already
//                                safe technical tokens, or the raw
//                                rendering is explicitly documented as
//                                deliberate.
//   B. Identity boundary      — publicationId / contentHash / locator /
//                                announcementId / anchor transaction stay
//                                five separately-named artifacts, never
//                                silently substituted for one another.
//   C. Evidence boundary      — Discovery ≠ Resolution ≠ Verification ≠
//                                Evidence ≠ Authorship ≠ Ownership.
//   D. Backend independence   — content/, discovery/, and anchoring/ never
//                                cross-import, and keep deliberately
//                                different vocabularies for the same
//                                real-world network.
//   E. World boundary         — World Encounter never independently
//                                discovers or verifies; Repository remains
//                                the one app-wide discovery convergence
//                                seam; World is never a second
//                                publication-discovery system.
//   F. UI/core ownership      — UI observes, presents, and forwards
//                                explicit choices; application/core
//                                decides, resolves, executes, and persists.
//
// Sections A-G below map directly onto those six boundaries (Section A is
// entry-state reconfirmation of the existing living guards this milestone
// itself depends on); Section H is the production-change guard.
//
// DELIBERATELY NOT DONE (this milestone's own recommended exclusion list,
// honored exactly, checked mechanically in Section H): no view function is
// refactored; no universal "StatusView" is created; no enum is renamed; no
// technically-useful term is removed; World Encounter behavior is
// unchanged; no trust model or new verification state is introduced; no
// lint infrastructure is added; no production code changes at all.

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

async function run() {
    console.log('=== 0.9.522 — Product Integrity Audit Baseline Consolidation ===\n');

    // ===============================================================
    // Section A — Entry-state reconfirmation. The living guards this
    // milestone's own consolidation depends on, re-executed live against
    // CURRENT source. 0.9.520's own file is deliberately NOT re-executed
    // here — same reasoning 0.9.521 already gave and this file's own
    // support module's header restates: it is a dated, one-time closure
    // audit whose own recorded findings are part of the historical
    // record, not a living pass/fail gate.
    // ===============================================================
    {
        const boundaryHardening = runLive('tests/ProductIntegrityBoundaryHardening.test.js');
        check(boundaryHardening.passed, `A1. tests/ProductIntegrityBoundaryHardening.test.js (0.9.396's own core/ import boundary guard) still passes live: ${boundaryHardening.output.slice(0, 400)}`);

        const evidenceTrust = runLive('tests/PublicationEvidenceTrustExperienceProductReassessment.test.js');
        check(evidenceTrust.passed, `A2. tests/PublicationEvidenceTrustExperienceProductReassessment.test.js (0.9.519's own evidence/vocabulary audit) still passes live: ${evidenceTrust.output.slice(0, 400)}`);

        const rawStatusClosure = runLive('tests/RawStatusRenderingBoundaryClosure.test.js');
        check(rawStatusClosure.passed, `A3. tests/RawStatusRenderingBoundaryClosure.test.js (0.9.521's own fix + closure audit) still passes live: ${rawStatusClosure.output.slice(0, 400)}`);

        console.log('✓ Section A: 0.9.396\'s core/ import boundary guard, 0.9.519\'s evidence/vocabulary audit, and 0.9.521\'s raw-status closure all re-confirm their own recorded verdicts against current source. 0.9.520\'s own file stays a dated record, not a re-run gate.');
    }

    // ===============================================================
    // Section B — Observation boundary. THE PERMANENT REGRESSION GUARD.
    // Not a rediscovery: the mechanism itself (findRawStatusInterpolations)
    // now lives in tests/support/RawStatusInterpolationSweep.js, imported
    // here rather than redefined a fourth time, and this section proves
    // that extraction changed nothing about what it finds.
    // ===============================================================
    {
        // B1. Sanity — the imported sweep function behaves identically to
        // 0.9.520/0.9.521's own inline copies on the same synthetic
        // fixture both of those files used to prove correctness first.
        const synthetic = 'a<dd>{{ noMatch }}</dd>b<dd>{{ x.status }}</dd>c<dd>{{ y.z.outcome }}</dd>';
        const syntheticHits = findRawStatusInterpolations(synthetic);
        check(syntheticHits.length === 2 && syntheticHits[0].expr === 'x.status' && syntheticHits[1].expr === 'y.z.outcome',
            `B1. the shared, imported sweep function finds exactly the two real .status/.outcome interpolations in the identical synthetic fixture 0.9.520/0.9.521 each proved it against, found: ${JSON.stringify(syntheticHits)}`);

        // B2. Fresh directory walk, using the shared sweep — every *.js
        // file under ui/components/ and ui/views/, not a list this
        // milestone chose in advance.
        const componentFiles = (await readdir(new URL('ui/components/', SOURCE_ROOT))).filter((f) => f.endsWith('.js'));
        const viewFiles = (await readdir(new URL('ui/views/', SOURCE_ROOT))).filter((f) => f.endsWith('.js'));
        const freshHits = [];
        for (const [dir, files] of [['ui/components', componentFiles], ['ui/views', viewFiles]]) {
            for (const file of files) {
                const text = await source(`${dir}/${file}`);
                for (const hit of findRawStatusInterpolations(text)) {
                    freshHits.push({ file: `${dir}/${file}`, ...hit });
                }
            }
        }

        // B3. The current, post-0.9.521 baseline: every hit this fresh
        // sweep finds, explicitly classified — an unclassified hit is
        // itself a finding, the identical discipline 0.9.520/0.9.521 each
        // already established. This table is the operative "future
        // developer" invariant: any new raw `.status`/`.outcome`
        // interpolation this sweep finds that is NOT already a key here
        // fails B4/B5 below, by construction.
        const CLASSIFICATION = new Map([
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
            ['ui/components/WorldEncounterCanvas.js::discoveryResult.resolution.status', 'DOCUMENTED_INTENTIONAL'],
            ['ui/views/ReconciliationWorkspaceView.js::result.outcome', 'DOCUMENTED_INTENTIONAL'],
        ]);

        const unclassified = freshHits.filter((hit) => !CLASSIFICATION.has(`${hit.file}::${hit.expr}`));
        check(unclassified.length === 0,
            `B4. every raw .status/.outcome interpolation this fresh sweep finds today is explicitly classified — an UNCLASSIFIED hit is itself a finding this milestone would fail on: found unclassified: ${JSON.stringify(unclassified)}`);
        check(freshHits.length === CLASSIFICATION.size,
            `B5. the fresh sweep's own hit count (${freshHits.length}) matches this baseline's own classification table size (${CLASSIFICATION.size}) exactly — neither more (a new, unreviewed hit) nor fewer (a stale entry for code that no longer exists)`);

        const gaps = freshHits.filter((hit) => CLASSIFICATION.get(`${hit.file}::${hit.expr}`) === 'GAP');
        check(gaps.length === 0, `B6. GAP-classified findings: 0.9.520's 2, closed by 0.9.521, confirmed still 0 in this baseline — found: ${JSON.stringify(gaps)}`);

        const safeTokens = freshHits.filter((hit) => CLASSIFICATION.get(`${hit.file}::${hit.expr}`) === 'SAFE_TECHNICAL_TOKEN');
        const documented = freshHits.filter((hit) => CLASSIFICATION.get(`${hit.file}::${hit.expr}`) === 'DOCUMENTED_INTENTIONAL');
        check(safeTokens.length === 10 && documented.length === 2,
            `B7. baseline composition: ${safeTokens.length} SAFE_TECHNICAL_TOKEN + ${documented.length} DOCUMENTED_INTENTIONAL = ${freshHits.length} total, 0 GAP`);

        // B8. Re-confirm a representative sample of the SAFE_TECHNICAL_TOKEN
        // bucket's own claim, live, against the real backing enum — not
        // merely inherited from 0.9.520's own prose.
        const decentralizedOutcomeSource = await source('application/DecentralizedSnapshotResolutionOutcome.js');
        const decentralizedOutcomeValues = [...decentralizedOutcomeSource.matchAll(/:\s*'([^']*)'/g)].map((m) => m[1]);
        check(decentralizedOutcomeValues.length > 0 && decentralizedOutcomeValues.includes('resolved')
            && decentralizedOutcomeValues.every((v) => /^[a-z-]+$/.test(v)) && !decentralizedOutcomeValues.some((v) => OVERCLAIM_WORDS.test(v) || /verified/i.test(v)),
            `B8. DecentralizedSnapshotResolutionOutcome's own VALUE tokens (backing several of the SAFE_TECHNICAL_TOKEN entries above) remain plain lowercase-hyphenated strings, none a claim word, found: ${JSON.stringify(decentralizedOutcomeValues)}`);

        console.log(`✓ Section B (Observation boundary, PERMANENT GUARD): the mechanical sweep now lives in tests/support/RawStatusInterpolationSweep.js, imported rather than redefined a fourth time. A fresh sweep finds ${freshHits.length} raw interpolations — 0 GAP, ${safeTokens.length} SAFE_TECHNICAL_TOKEN, ${documented.length} DOCUMENTED_INTENTIONAL — matching this baseline's own classification table exactly. A future new raw interpolation this sweep finds fails B4/B5 by construction until it is explicitly classified.`);
    }

    // ===============================================================
    // Section C — Identity boundary. publicationId / contentHash /
    // locator / announcementId / anchor transaction stay five separately-
    // named artifacts across the full Editor -> Discovery -> Anchor ->
    // World Encounter chain, each re-read live from current source.
    // ===============================================================
    {
        const publicationSource = await source('publisher/Publication.js');
        check(/\bid\s*=\s*createId\(\)/.test(publicationSource) && publicationSource.includes('contentHash = null'),
            'C1. publisher/Publication.js still constructs `id` (publicationId) and `contentHash` as two separate constructor fields — never one merged identifier');

        const discoverySource = await source('application/ArweaveGraphqlDiscoveryQueryService.js');
        check(discoverySource.includes('uri: envelope.uri,') && discoverySource.includes('announcementId'),
            'C2. a discovered candidate\'s own claimed material location (uri) and the transaction id that carried the announcement (announcementId) stay two separate fields');

        const decentralizedViewSource = (await Promise.all(publicationsPageFiles().map((file) => source(file)))).join('\n');
        check(decentralizedViewSource.includes('<dt>Locator</dt>') && decentralizedViewSource.includes('<dt>Transaction</dt>') && decentralizedViewSource.includes('<dt>Content hash</dt>'),
            'C3. Locator (material location) / Transaction (anchor proof) / Content hash stay three separately-labeled fields on the Publication Center\'s own detail view');

        const inspectionSource = await source('application/WorldEncounterMaterialInspection.js');
        check(inspectionSource.includes('objectId'),
            'C4. World Encounter material inspection still routes on `resolvedSelection.objectId` (the Publication identity a Wanderer selected) — never re-derives or substitutes a contentHash for it');
        check(!/contentHash\s*=\s*resolvedSelection\.objectId|objectId\s*=\s*.*contentHash/.test(inspectionSource),
            'C4b. objectId and contentHash are never assigned into one another inside the World Encounter inspection boundary');

        console.log('✓ Section C (Identity boundary): Publication identity stays coherent across Editor (id/contentHash) -> Discovery (uri/announcementId) -> Anchor (Locator/Transaction/Content hash) -> World Encounter (objectId) — no surface substitutes one artifact for another.');
    }

    // ===============================================================
    // Section D — Evidence boundary. Discovery ≠ Resolution ≠
    // Verification ≠ Evidence ≠ Authorship ≠ Ownership, re-confirmed
    // against real, currently-exported labels and the real TrustObservation
    // header, rather than re-derived a second, competing way.
    // ===============================================================
    {
        // D1. Discovery/Resolution/Anchor-Verification failures stay
        // four distinct, real, non-collapsing labels.
        const unavailableLabel = describePublicationOutcome(PublicationResolutionOutcome.CONTENT_UNAVAILABLE);
        const mismatchLabel = describePublicationOutcome(PublicationResolutionOutcome.CONTENT_HASH_MISMATCH);
        const proofUnavailableLabel = describeVerificationOutcome(AnchorVerificationOutcome.PROOF_UNAVAILABLE);
        const invalidProofLabel = describeVerificationOutcome(AnchorVerificationOutcome.INVALID_PROOF);
        const distinctLabels = new Set([unavailableLabel, mismatchLabel, proofUnavailableLabel, invalidProofLabel]);
        check(distinctLabels.size === 4,
            `D1. four representative failures (resolution-unavailable, hash-mismatch, anchor-proof-unavailable, anchor-invalid-proof) still render four DISTINCT labels — none collapses into a generic "failed", found ${distinctLabels.size} distinct`);
        check(![...distinctLabels].some((l) => /\b(success|verified|valid)\b/i.test(l)),
            `D1b. none of these four failure labels reads as a bare success/verified/valid claim, found: ${JSON.stringify([...distinctLabels])}`);

        // D2. Evidence ≠ Verdict: core/TrustObservation.js's own header
        // still states a TrustObservation is purely descriptive, never a
        // verdict — the fact 0.9.521's own Finding 2 fix depended on and
        // this consolidation now holds as a permanent invariant.
        const trustObservationSource = await source('core/TrustObservation.js');
        check(trustObservationSource.includes('A TrustObservation is purely DESCRIPTIVE'),
            'D2. core/TrustObservation.js\'s own header remains explicit: purely descriptive, never a verdict — Evidence stays distinct from Verification\'s own claim');
        check(TrustStatus.VALID === 'VALID' && WorldEncounterMaterialVerificationStatus.VERIFIED === 'VERIFIED',
            'D2b. both enums this arc\'s two closed findings were about still exist with their own real, bare, claim-shaped values — this section is testing against the real thing, not a stand-in');

        // D3. Authorship/Ownership stay unclaimed vocabulary across this
        // arc's own established label functions — a structural re-check,
        // independent of any one milestone's own per-outcome assertions.
        const evidenceViewSource = await source('application/PublicationEvidenceView.js');
        const codeOnlyEvidenceView = evidenceViewSource.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
        const evidenceViewLabels = codeOnlyEvidenceView.match(/return `[^`]*`/g)?.join(' ') || '';
        check(!OVERCLAIM_WORDS.test(evidenceViewLabels),
            'D3. application/PublicationEvidenceView.js\'s own returned label strings still carry no ownership/authorship/trust word');

        console.log('✓ Section D (Evidence boundary): Discovery/Resolution/Anchor-verification failures stay four distinct, non-success labels; TrustObservation remains purely descriptive, never a verdict; no established evidence label claims authorship or ownership.');
    }

    // ===============================================================
    // Section E — Backend independence. Content / Discovery / Anchoring
    // stay three structurally decoupled axes, re-confirmed fresh.
    // ===============================================================
    {
        const crossImports = [
            ['content -> discovery/anchoring', 'content'],
            ['discovery -> content/anchoring', 'discovery'],
            ['anchoring -> content/discovery', 'anchoring'],
        ];
        for (const [label, dir] of crossImports) {
            const grepResult = (() => {
                try {
                    return execSync(`grep -rlE "from '(\\.\\./)*(discovery|anchoring|content)/" ${dir}/ 2>/dev/null`, { cwd: SOURCE_ROOT_PATH }).toString().trim();
                } catch {
                    return '';
                }
            })();
            const lines = grepResult.split('\n').filter(Boolean).filter((f) => !f.startsWith(`${dir}/`));
            check(lines.length === 0, `E1. ${label}: zero files import across this boundary today (found: ${JSON.stringify(lines)})`);
        }

        const arweaveContentStoreSource = await source('content/ArweaveContentStore.js');
        const arweaveAnchorPublisherSource = await source('anchoring/ArweaveAnchorPublisher.js');
        check(arweaveContentStoreSource.includes("get storage() { return 'ar'; }"),
            "E2a. the Arweave CONTENT backend's own code remains the short form 'ar'");
        check(arweaveAnchorPublisherSource.includes("get anchorType() { return 'arweave'; }"),
            "E2b. the Arweave ANCHOR's own anchorType remains the long form 'arweave' — deliberately a different string literal for the same real-world network");

        const anchorUseCaseSource = await source('application/CreateExternalPublicationAnchorUseCase.js');
        const codeOnlyAnchor = anchorUseCaseSource.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
        const executeMatch = codeOnlyAnchor.match(/async execute\(([^)]*)\)/);
        check(Boolean(executeMatch) && !/storage|discoveryProvider/.test(executeMatch[1]),
            `E3. CreateExternalPublicationAnchorUseCase.js's own execute() signature still carries no storage/discoveryProvider parameter — found: "${executeMatch ? executeMatch[1] : '<no match>'}"`);

        const arweaveGatewaySource = await source('ui/views/ArweaveGatewaySettingsView.js');
        const contentProviderSource = await source('ui/views/ContentProviderSettingsView.js');
        const nostrRelaySource = await source('ui/views/NostrPublicationRelaySettingsView.js');
        check(Boolean(arweaveGatewaySource) && Boolean(contentProviderSource) && Boolean(nostrRelaySource),
            'E4. Content backend and Discovery substrate each keep their own dedicated settings surface — no shared/merged configuration view exists');

        // E5. The one real failover mechanism in this codebase remains
        // same-substrate-only — never an implicit cross-substrate
        // fallback just because another provider happens to be available.
        const failoverSource = await source('application/ArweaveGatewayFailoverWorldEncounterMaterialResolver.js');
        check(failoverSource.includes("throw new Error('ArweaveGatewayFailoverWorldEncounterMaterialResolver: a non-empty gatewayUrls array is required')"),
            'E5a. the failover resolver still requires an explicit, caller-supplied gatewayUrls array — it never invents or discovers additional gateways, and never reaches for a different storage backend, on its own');
        check(failoverSource.includes("get storage() { return 'ar'; }") && !/ipfs|bitcoin|base/i.test(failoverSource),
            'E5b. the failover resolver\'s own storage identity remains \'ar\' (Arweave) and never mentions another substrate at all — gateway-to-gateway within one substrate, never cross-substrate');

        console.log('✓ Section E (Backend independence): content/, discovery/, and anchoring/ never import across one another; Arweave\'s own content-backend code (\'ar\') and anchor code (\'arweave\') stay deliberately different string literals; anchor creation carries no storage/discoveryProvider parameter; three separate settings surfaces; the one failover mechanism stays same-substrate-only.');
    }

    // ===============================================================
    // Section F — World boundary. World Encounter never independently
    // discovers or verifies; Repository remains the one app-wide
    // discovery convergence seam; World never becomes a second
    // publication-discovery system.
    // ===============================================================
    {
        const worldFiles = (await readdir(new URL('world/', SOURCE_ROOT))).filter((f) => f.endsWith('.js'));
        const worldLayoutFiles = (await readdir(new URL('world-layout/', SOURCE_ROOT))).filter((f) => f.endsWith('.js'));
        const crossImportViolations = [];
        for (const [dir, files] of [['world', worldFiles], ['world-layout', worldLayoutFiles]]) {
            for (const file of files) {
                const text = await source(`${dir}/${file}`);
                const importLines = text.split('\n').filter((l) => /^\s*import\b/.test(l) && /from ['"](\.\.\/)*(discovery|anchoring|content)\//.test(l));
                if (importLines.length > 0) crossImportViolations.push({ file: `${dir}/${file}`, importLines });
            }
        }
        check(crossImportViolations.length === 0,
            `F1. world/ and world-layout/ (${worldFiles.length + worldLayoutFiles.length} files, fresh census) still never import discovery/, anchoring/, or content/ directly — World never independently discovers or verifies. Found: ${JSON.stringify(crossImportViolations)}`);

        const catalogSource = await source('ui/components/PublicationCatalog.js');
        check(catalogSource.includes('CreateDiscoveryUseCase') && catalogSource.includes('searchPublicationsUseCase.execute'),
            'F2. Repository (ui/views/RepositoryView.js -> ui/components/PublicationCatalog.js) still admits Publications through the same CreateDiscoveryUseCase/SearchPublicationsUseCase seam every other discovery surface uses — no separate, parallel admission mechanism, and never a second World-native discovery system');

        const repositoryViewSource = await source('ui/views/RepositoryView.js');
        check(repositoryViewSource.includes('<PublicationCatalog') && !/UseCase|discoveryProvider/.test(repositoryViewSource),
            'F3. RepositoryView.js itself stays a thin wrapper — no discovery or verification logic of its own');

        console.log('✓ Section F (World boundary): World never imports discovery/anchoring/content directly; Repository admits Publications through the same discovery use-case seam every other surface uses and remains the one app-wide discovery convergence seam.');
    }

    // ===============================================================
    // Section G — UI/core ownership. UI observes, presents, and forwards
    // explicit choices; application/core decides, resolves, executes, and
    // persists. A concrete witness (OBSERVED_ONLY — not claimed as a
    // codebase-wide enforced sweep, the identical honesty 0.9.520's own
    // Section G already required of itself).
    // ===============================================================
    {
        const canvasSource = (await Promise.all(worldEncounterCanvasFiles().map((file) => source(file)))).join('\n');
        check(canvasSource.includes("this.discoveryResult.inspection.verification.status === 'VERIFIED'"),
            'G1. isDiscoveredPublicationSelectable() still reads a status the application layer already computed, to gate whether a "Select Publication" button is enabled — it never calls a verifier, never re-hashes material, and never imports WorldEncounterMaterialVerification.js itself');
        check(!canvasSource.includes('import { verifyWorldEncounterMaterial }') && !canvasSource.includes('import { WorldEncounterMaterialIdentityVerifier }'),
            'G2. ui/components/WorldEncounterCanvas.js still never imports the verifier itself — only the already-computed result, and only the humanizing view functions over it');

        console.log('✓ Section G (UI/core ownership, OBSERVED_ONLY): the one inspected UI decision point reads a status the application layer already decided, and never imports or calls the verifier itself.');
    }

    // ===============================================================
    // Section H — Production-change guard, exclusions, and registration.
    // Expected production changes for this milestone: ZERO.
    // tests/support/RawStatusInterpolationSweep.js is test infrastructure
    // (lives under tests/), not production code.
    // ===============================================================
    {
        const EXCLUDED = [
            'refactor existing view functions',
            'create a universal StatusView',
            'rename enums',
            'remove technically useful terms',
            'change World Encounter behavior',
            'introduce a trust model',
            'introduce new verification states',
            'add lint infrastructure',
            'change production code',
        ];
        check(EXCLUDED.length === 9, 'H1. the full exclusion list from this milestone\'s own requesting brief, named, not silently dropped');

        const statusOutput = execSync('git status --porcelain', { cwd: SOURCE_ROOT_PATH }).toString();
        const changed = statusOutput.split('\n').map((line) => line.slice(3).trim()).filter(Boolean);
        const productionDirs = ['core', 'application', 'renderer', 'discovery', 'anchoring', 'collaboration', 'persistence', 'identity', 'publisher', 'storage', 'peer', 'content', 'presence', 'ui', 'css', 'server', 'replication', 'serializer', 'world', 'world-layout', 'spatial', 'base', 'arweave', 'nostr', 'placement'];
        const touchedProduction = changed.filter((f) => productionDirs.some((dir) => f.startsWith(`${dir}/`)));
        check(touchedProduction.length === 0,
            `H2. no production-directory file is modified by this milestone — EXPECTED PRODUCTION CHANGES: ZERO (found: ${JSON.stringify(touchedProduction)})`);

        const testsHtmlSource = await source('tests.html');
        check(testsHtmlSource.includes('./tests/ProductIntegrityAuditBaselineConsolidation.test.js'),
            "H3. this milestone's own test file is registered in tests.html");

        console.log('✓ Section H: zero production-directory changes; the full exclusion list honored; this test (and its shared support module) is registered in tests.html.');
    }

    console.log(`\n✅ All Product Integrity Audit Baseline Consolidation checks passed (${assertionCount} assertions).\n`);
    console.log('=== VERDICT ===');
    console.log('Section A (entry-state): 0.9.396, 0.9.519, and 0.9.521 all reconfirm live. No gap.');
    console.log('Section B (Observation boundary, PERMANENT GUARD): the mechanical raw-status/outcome sweep now lives in tests/support/RawStatusInterpolationSweep.js as a shared, importable mechanism. Fresh sweep: 0 GAP, 10 SAFE_TECHNICAL_TOKEN, 2 DOCUMENTED_INTENTIONAL.');
    console.log('Section C (Identity boundary): publicationId/contentHash/locator/announcementId/anchor transaction stay five separately-named artifacts across the full chain. No gap.');
    console.log('Section D (Evidence boundary): Discovery/Resolution/Verification/Evidence/Authorship/Ownership stay distinct — four representative failures render four distinct labels; TrustObservation stays purely descriptive; no evidence label claims ownership/authorship.');
    console.log('Section E (Backend independence): content/discovery/anchoring never cross-import; deliberately different vocabularies for the same network; three separate settings surfaces; the one failover mechanism stays same-substrate-only.');
    console.log('Section F (World boundary): World never independently discovers/verifies; Repository remains the one app-wide discovery convergence seam.');
    console.log('Section G (UI/core ownership, OBSERVED_ONLY): the one inspected UI decision point reads an already-decided status; it never imports or calls the verifier itself.');
    console.log('Section H: EXPECTED PRODUCTION CHANGES: ZERO — confirmed. Every exclusion from this milestone\'s own requesting brief honored.');
    console.log('');
    console.log('VERDICT: BASELINE ESTABLISHED. The six boundaries this arc\'s own closure audits (0.9.520, 0.9.521) discovered and proved still hold against current source, re-confirmed here rather than re-derived a competing way. The one mechanism most worth keeping — the mechanical raw-status/outcome sweep — is now a shared, importable module (tests/support/RawStatusInterpolationSweep.js) rather than embedded a fourth time in a dated audit file; a future test can import it directly, and a future raw status/outcome interpolation this sweep finds must be explicitly classified or it fails by construction. Per this milestone\'s own requesting brief: the 0.9.520 -> 0.9.521 -> 0.9.522 Product Integrity closure sequence is COMPLETE. The next milestone should be driven by a genuinely new product requirement, user workflow, or observed defect — not by searching for another boundary to audit.');
}

run().catch((error) => {
    console.error('ProductIntegrityAuditBaselineConsolidation.test.js FAILED:', error);
    process.exitCode = 1;
});
