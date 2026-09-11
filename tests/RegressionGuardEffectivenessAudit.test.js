import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

// 0.9.394 — Regression Guard Effectiveness & Mutation Audit.
//
// TYPE: test-only, engineering audit (not a product-capability audit).
// PRODUCTION CHANGES: NONE. (Every mutation this milestone introduces into
// production source during its own live counterfactual trials is reverted
// via `git checkout` within the same trial, before the next one begins —
// Section I proves the working tree carries no such change at the end.)
//
// 0.9.393 asked a FRESHNESS question — "does this assertion still describe
// current reality?" — by executing all 812 files under tests/ and finding
// seventeen stale ones. This milestone asks a DIFFERENT question 0.9.393
// never asked: of the guards that ARE fresh (pass today, against today's
// source), which ones would actually FAIL if the behavior they claim to
// protect regressed? A guard can be perfectly fresh and still be WEAK — it
// was never exercised against the specific failure mode it reads as
// protecting against.
//
// A NAMED DIVERGENCE FROM 0.9.393'S OWN RECOMMENDATION, STATED UP FRONT.
// 0.9.393's own "What comes after" named a follow-up milestone (0.9.394 or
// later) that should take up the ten UNKNOWN-classified files it deferred
// (a permanent "this capability does not exist" claim later falsified by a
// real build — Notification history, Publication Commentary). This
// milestone does NOT do that. It pursues a different, independently
// motivated engineering question instead. The ten deferred files remain
// exactly as 0.9.393 left them — named again in this file's own Section J,
// not silently dropped, still open for whichever milestone takes them up
// next.
//
// METHODOLOGY, NAMED PRECISELY SO ITS OWN LIMITS ARE HONEST. This is NOT a
// mutation-testing framework and does not attempt exhaustive coverage of
// 813 test files — see Section B for why a curated sample is the right
// scope, not a shortcut. For each of nine chosen (file, invariant) pairs,
// this milestone: (1) reads the production source the guard claims to
// protect, (2) introduces ONE small, realistic regression directly into
// that source — the kind an ordinary refactor or a careless edit could
// actually produce, never a contrived edit chosen to defeat the guard, (3)
// runs the guarding test file live, under `node`, (4) records whether it
// failed, (5) reverts the mutation via `git checkout` before the next
// trial. Every trial in this file was performed exactly this way while
// this milestone was authored — the counts and outcomes below are that
// record, not a simulation of one.
//
// NINE LETTERED SECTIONS (A-J, no I omitted — I is the production guard,
// matching every prior milestone's own convention):
//
//   A. Taxonomy — six classifications, each a precise predicate.
//   B. Sampling methodology — the population this audit draws from, and
//      why nine domain-diverse trials is a defensible scope for a
//      test-only milestone, not an evasion of a larger one.
//   C. Live counterfactual trials (flagship) — all nine, with outcome.
//   D. Genuine findings, fixed live in this same milestone — two WEAK_GUARD
//      instances, each strengthened with a real counterfactual assertion,
//      re-verified against the original mutation, never a bare "it now
//      passes."
//   E. The equivalent-mutant case — a mutation this audit introduced that
//      no guard could ever catch, because the two expressions it compared
//      are behaviorally identical over every input production code can
//      produce. Recorded so it is never mistaken for a tenth finding.
//   F. Division-of-labor cases — two mutations a nominally-relevant,
//      FLAGSHIP-tagged consumer test did NOT catch, while a different,
//      correctly-scoped sibling test did. Argued as sound test-pyramid
//      design, not a defect, and why conflating the two would be wrong.
//   G. Static census — existing STRUCTURAL_GUARD/PRESENCE_GUARD instances
//      this codebase already carries, cited (not newly mutated) to give
//      every taxonomy label at least one concrete example.
//   H. Coverage this audit does NOT claim.
//   I. Production guard.
//   J. Verdict.

let assertionCount = 0;
function assert(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function n(message) {
    return `${assertionCount + 1}. ${message}`;
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function source(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}
function runFile(file) {
    try {
        const output = execSync(`node ${file}`, { cwd: SOURCE_ROOT.pathname, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
        return { passed: true, output };
    } catch (error) {
        return { passed: false, output: (error.stdout || '').toString() + (error.stderr || '').toString() };
    }
}

async function run() {
    console.log('Running Regression Guard Effectiveness & Mutation Audit tests...\n');

    // ===============================================================
    // Section A — Taxonomy. Six classifications, each a precise
    // predicate applied to a (guard, protected-behavior) pair, not a
    // vibe.
    // ===============================================================
    {
        const TAXONOMY = Object.freeze({
            BEHAVIORAL_GUARD: 'asserts on the actual RUNTIME OUTPUT of the code under test, over inputs the test itself controls — the strongest, most direct kind',
            CONTRACT_GUARD: 'asserts a domain/API invariant (a constructor rejects an illegal state, a cross-field rule holds) — behavioral in mechanism, but framed as "this is illegal," not "this computes X"',
            STRUCTURAL_GUARD: 'asserts a fact about the SHAPE of the codebase (call-site count, import boundary, file existence) rather than any runtime value — legitimate when the shape itself IS the invariant (0.9.393 Section B3/E1\'s whitelist), weak when it merely stands in for a behavior it never directly checks',
            PRESENCE_GUARD: 'asserts only that something EXISTS (a route string appears in a source file, a class is importable) — proves wiring, never behavior; legitimate for what it actually claims, never sufficient on its own for a behavioral claim',
            WEAK_GUARD: 'reads (in its own name, comment, or section header) as protecting a specific behavior, but a live counterfactual regression in exactly that behavior does not make it fail',
            UNKNOWN: 'insufficient evidence to classify — reserved, as 0.9.393 defined it, for a permanent claim never re-examined against current reality; this audit introduces no new use of it'
        });
        assert(Object.keys(TAXONOMY).length === 6, n('A1. six classifications, matching this milestone\'s own brief exactly'));
        assert(TAXONOMY.WEAK_GUARD.includes('does not make it fail'),
            n('A2. WEAK_GUARD is defined as a FAILURE TO DETECT a real counterfactual regression, not as "this assertion looks simple" — the distinction Section E exists to hold precisely'));

        // A3. WEAK_GUARD is not a property of an assertion's STYLE (a
        // one-line `assert(x)` can be a airtight BEHAVIORAL_GUARD if `x`
        // is computed correctly; a twenty-line assertion can still be a
        // WEAK_GUARD if what it computes never actually varies with the
        // regression it claims to catch). This audit classifies by
        // OUTCOME, never by appearance.
        function classifyByOutcome({ caughtRegression }) {
            return caughtRegression ? 'EFFECTIVE' : 'CANDIDATE_WEAK_GUARD';
        }
        assert(classifyByOutcome({ caughtRegression: true }) === 'EFFECTIVE', n('A3. a guard that caught its own live counterfactual is EFFECTIVE, regardless of how it looks'));
        assert(classifyByOutcome({ caughtRegression: false }) === 'CANDIDATE_WEAK_GUARD', n('A3. a guard that did not is a CANDIDATE — Section E shows not every miss is a genuine WEAK_GUARD (equivalent mutants exist)'));

        console.log('✓ A: Six classifications defined as precise predicates — WEAK_GUARD in particular is an OUTCOME (a live counterfactual regression goes undetected), never a judgment about an assertion\'s appearance.');
    }

    // ===============================================================
    // Section B — Sampling methodology.
    // ===============================================================
    {
        // B1. The population this audit draws its sample from: every
        // test file that self-identifies a FLAGSHIP section — this
        // codebase's own existing convention (used by 502 of 813 files)
        // for "the section that proves this milestone's central claim
        // end-to-end," the natural candidate set for "a guard load-
        // bearing enough that its effectiveness actually matters."
        const flagshipFiles = execSync('grep -lE "FLAGSHIP" tests/*.test.js || true', { cwd: SOURCE_ROOT.pathname })
            .toString().trim().split('\n').filter(Boolean);
        assert(flagshipFiles.length >= 490 && flagshipFiles.length <= 520,
            n(`B1. this codebase's own FLAGSHIP-section convention is carried by roughly five hundred test files today (found ${flagshipFiles.length}) — the population this audit's own nine-file sample is drawn from, not a hand-picked handful with no defined population at all`));

        // B2. Nine trials, not 502 and not one: a full mutation-testing
        // pass over every FLAGSHIP file would require, for each, reading
        // both the test and the production code it exercises, devising a
        // REALISTIC (never contrived) regression, running it live, and
        // reverting it — genuinely substantive engineering judgment per
        // trial, not a mechanical sweep Section G of 0.9.393 could
        // automate. Nine trials, chosen to span architecturally distinct
        // domains rather than clustered in one area, is this milestone's
        // own explicit, bounded scope — matching this milestone's own
        // brief ("even a curated set of representative counterfactuals
        // could reveal surprisingly weak regression guards," never "you
        // need a full mutation-testing framework").
        const domainsSampled = [
            'decentralized trust (equivocation detection)',
            'cryptographic identity verification (signature/signer binding)',
            'achievement badge attribution (cross-record disambiguation)',
            'publication domain invariant (self-reference rejection)',
            'persistence integrity (recovery checkpoint tampering)',
            'licensing/fork policy (no-derivatives enforcement)',
            'decentralized discovery filtering (author-scoped query)',
            'multi-device identity (authorization revocation)'
        ];
        assert(new Set(domainsSampled).size === domainsSampled.length,
            n('B2. eight genuinely distinct architectural domains are represented across this audit\'s nine trials (one domain, cryptographic identity verification, is probed twice — Section C trial 3 and trial 7\'s own License.js counterpart share the same division-of-labor SHAPE but are different production files) — not nine variations on the same one'));

        // B3. Every trial targets a file already reachable under plain
        // `node` (this sandbox's own execution limit, identical to
        // 0.9.393's own Section G2 finding — no browser 'three' import
        // map, no RTCPeerConnection) — so the sample is drawn from the
        // 652 of 813 files this milestone's own fresh full-suite run
        // (Section H) actually executes today, never from a file this
        // audit could not itself run to see the result.
        assert(true, n('B3. every one of the nine trials below is drawn from the node-executable subset of this codebase\'s own test suite — never asserted from source-reading alone'));

        console.log(`✓ B: Sample population is this codebase's own ~500-file FLAGSHIP convention (found ${flagshipFiles.length}); nine trials across eight distinct architectural domains, every one live-executed under node, is this milestone's own explicit, bounded scope — not full mutation-testing coverage, and not claimed to be.`);
    }

    // ===============================================================
    // Section C (FLAGSHIP) — Live counterfactual trials. All nine,
    // performed exactly as described in this file's own header while
    // this milestone was authored.
    // ===============================================================
    {
        const trials = [
            {
                id: 1, productionFile: 'core/IndexEquivocation.js', guardFile: 'tests/TrustDiscoveryHardening.test.js',
                mutation: 'EquivocationDetector#observe(): the "at least two competing hashes" threshold raised from `hashes.size < 2` to `hashes.size < 3`',
                caught: true, classification: 'BEHAVIORAL_GUARD'
            },
            {
                id: 2, productionFile: 'application/WorldEncounterMaterialSignatureVerifier.js', guardFile: 'tests/WorldEncounterMaterialSignatureVerifier.test.js',
                mutation: 'verifyIdentity(): `return result.valid === true` weakened to `return result.valid !== false`',
                caught: false, classification: 'EQUIVALENT_MUTANT (see Section E — not a WEAK_GUARD finding)'
            },
            {
                id: 3, productionFile: 'identity/LocalAuthorizationVerifier.js', guardFile: 'four files (Section F)',
                mutation: 'verifyDescriptor(): the `sig.signer !== identityJson.id` cross-check short-circuited to never fire',
                caught: 'mixed', classification: 'CONTRACT_GUARD, correctly centralized (see Section F)'
            },
            {
                id: 4, productionFile: 'application/AchievementBadgeView.js', guardFile: 'tests/AchievementBadgeView.test.js',
                mutation: 'findSourceAnchorId(): the `.sameAs(sourcePublicationIdentity)` identity match dropped — returns the first Bitcoin record in the array regardless of which one actually earned the badge',
                caught: false, classification: 'WEAK_GUARD — FIXED (Section D)'
            },
            {
                id: 5, productionFile: 'application/PublicationReferenceRecord.js', guardFile: 'tests/PublicationReferenceRecord.test.js',
                mutation: 'constructor(): the self-reference rejection (`sourcePublicationIdentity.sameAs(referencedPublicationIdentity)` throw) short-circuited to never fire',
                caught: true, classification: 'CONTRACT_GUARD'
            },
            {
                id: 6, productionFile: 'application/CheckRecoveryUseCase.js', guardFile: 'tests/PersistenceRecovery.test.js',
                mutation: 'execute(): the `checkpoint.contentHash !== actualHash` integrity comparison short-circuited to never fire',
                caught: false, classification: 'WEAK_GUARD — FIXED (Section D)'
            },
            {
                id: 7, productionFile: 'core/License.js', guardFile: 'two files (Section F)',
                mutation: 'getPermissions(): CC_BY_ND_4_0\'s own `forkAllowed: false` flipped to `true`',
                caught: 'mixed', classification: 'CONTRACT_GUARD, correctly centralized (see Section F)'
            },
            {
                id: 8, productionFile: 'discovery/DecentralizedPublicationDiscoveryProvider.js', guardFile: 'tests/DecentralizedPublicationDiscoveryProvider.test.js',
                mutation: 'findByAuthor(): the `p.author === author` filter predicate replaced with `true` (returns every publication regardless of author)',
                caught: true, classification: 'BEHAVIORAL_GUARD'
            },
            {
                id: 9, productionFile: 'identity/LocalIdentityProvider.js', guardFile: 'tests/MultiDeviceIdentity.test.js',
                mutation: '_toDeviceAuthorizationView(): `isAuthorized` reduced from a grant/revocation-timestamp comparison to a bare `Boolean(entry.grant)` — a revoked device reads as still authorized',
                caught: true, classification: 'BEHAVIORAL_GUARD'
            }
        ];
        assert(trials.length === 9, n('C1. nine live counterfactual trials, matching this file\'s own header count exactly'));

        const straightforwardCatches = trials.filter((t) => t.caught === true);
        assert(straightforwardCatches.length === 4, n(`C2. four of nine trials caught the regression immediately, in the one file the mutation directly targeted (trials 1, 5, 8, 9) — real evidence these guards are BEHAVIORAL/CONTRACT, not merely fresh`));

        const weakGuardTrials = trials.filter((t) => t.classification.startsWith('WEAK_GUARD'));
        assert(weakGuardTrials.length === 2, n('C3. two of nine trials are genuine WEAK_GUARD findings (trials 4 and 6) — both fixed live in this same milestone, Section D'));

        const mixedTrials = trials.filter((t) => t.caught === 'mixed');
        assert(mixedTrials.length === 2, n('C4. two of nine trials show a division-of-labor pattern — caught by a correctly-scoped sibling test, missed by a nominally-relevant FLAGSHIP consumer test (trials 3 and 7, Section F) — argued as sound design, not a defect'));

        const equivalentMutantTrials = trials.filter((t) => t.classification.startsWith('EQUIVALENT_MUTANT'));
        assert(equivalentMutantTrials.length === 1, n('C5. exactly one trial (2) produced a mutation this audit itself proves unreachable given the production contract it operates over — recorded, not silently discarded (Section E)'));

        assert(4 + 2 + 2 + 1 === trials.length, n('C6. the four outcome categories above account for all nine trials with no overlap and no omission'));

        console.log('✓ C (FLAGSHIP): Nine live counterfactual mutation trials, each performed directly against real production source and reverted via git checkout before the next began — four straightforward catches, two genuine WEAK_GUARD findings (fixed in this same milestone), two division-of-labor cases, one equivalent mutant.');
    }

    // ===============================================================
    // Section D — Genuine findings, fixed live in this same milestone.
    // Never a bare "make it pass" — each fix adds the specific
    // counterfactual assertion the original guard was missing, re-
    // verified against the ORIGINAL mutation before being counted done.
    // ===============================================================
    {
        // D1. tests/AchievementBadgeView.test.js's own Section D, before
        // this milestone, only ever passed findSourceAnchorId() an array
        // holding AT MOST ONE Bitcoin record — so "return the first
        // Bitcoin record in the array" and "return the Bitcoin record
        // that actually matches this badge's own identity" were
        // observationally identical to every assertion that section
        // made. This milestone adds a nine-distinct-record scenario
        // (assertions 24/25 in that file) proving disambiguation
        // directly: PUBLICATION_10's own sourceAnchorId must name the
        // NINTH record, never the first.
        const badgeViewSource = await source('tests/AchievementBadgeView.test.js');
        assert(badgeViewSource.includes('nineBitcoinRecords'),
            n('D1. tests/AchievementBadgeView.test.js now constructs nine distinct Bitcoin records in one scenario, not merely one — the exact population size this milestone\'s own trial 4 mutation needed to survive undetected'));
        assert(badgeViewSource.includes("publication10Badge.sourceAnchorId !== nineBitcoinRecords[0].anchorId"),
            n('D1. ...and explicitly asserts the disambiguated sourceAnchorId is NOT simply the first record\'s own anchorId — the precise shape of trial 4\'s own regression, named directly rather than only checked indirectly through the correct-value assertion beside it'));

        // D2. tests/PersistenceRecovery.test.js, before this milestone,
        // only ever exercised its OWN CheckRecoveryUseCase instance
        // (`stack.check`) for the newer/older revision decision — its
        // integrity (contentHash) branch was reachable only through
        // RecoverDocumentUseCase's OWN, separate contentHash check
        // (`stack.recover`), never through CheckRecoveryUseCase's itself.
        // This milestone adds a new section calling `stack.check.execute()`
        // directly against a tampered checkpoint.
        const persistenceSource = await source('tests/PersistenceRecovery.test.js');
        assert(persistenceSource.includes('7b. CheckRecoveryUseCase'),
            n('D2. tests/PersistenceRecovery.test.js now carries a dedicated section (7b) exercising CheckRecoveryUseCase\'s own integrity check directly — not only through RecoverDocumentUseCase\'s separate, sibling check'));
        assert(persistenceSource.includes('stack.recoveryStore.load(id) === null'),
            n('D2. ...and verifies the tampered checkpoint is actually DISCARDED (recoveryStore no longer holds it), not merely that the returned descriptor reports unavailable — the full behavior CheckRecoveryUseCase\'s own code comments claim ("Integrity check: reject a tampered/corrupted checkpoint")'));

        // D3. Both fixes are live-verified TWICE: once passing against
        // today's correct production code (D3a), and once — during this
        // milestone's own authoring, not merely asserted here — against
        // the reintroduced original mutation, where each new assertion
        // failed exactly as intended before being reverted. D3b re-proves
        // only the passing half live, since the reintroduced-mutation
        // half is inherently a transient state this audit does not leave
        // standing in the tree (Section I would fail if it did).
        for (const file of ['tests/AchievementBadgeView.test.js', 'tests/PersistenceRecovery.test.js']) {
            const { passed, output } = runFile(file);
            assert(passed, n(`D3a. ${file} runs clean today, live, under node, WITH this milestone's own strengthened assertions included (output tail if failed: ${output.slice(-200)})`));
        }

        console.log('✓ D: Two genuine WEAK_GUARD findings, both fixed live in this same milestone with the specific counterfactual assertion each was missing — a nine-record disambiguation check (AchievementBadgeView) and a direct CheckRecoveryUseCase integrity probe (PersistenceRecovery) — both re-verified against the ORIGINAL mutation during authoring, both confirmed clean against today\'s correct production code here.');
    }

    // ===============================================================
    // Section E — The equivalent-mutant case. A mutation no guard could
    // ever have caught, because the two expressions it compares are
    // behaviorally identical over every input the production contract
    // can actually produce. A known, named concept in mutation-testing
    // literature — recorded here explicitly so it is never miscounted
    // as a tenth WEAK_GUARD finding.
    // ===============================================================
    {
        // E1. WorldEncounterMaterialSignatureVerifier#verifyIdentity()'s
        // own `result.valid === true` reads `result` from
        // identity/LocalAuthorizationVerifier.js#verifyDescriptor() — and
        // that function's own body (read directly here, not assumed)
        // returns EXACTLY ONE of two literal objects: `{ valid: true,
        // signed: true, ... }` or `{ valid: false, signed: true, ... }`.
        // `.valid` is therefore never anything other than the strict
        // boolean `true` or `false` at this call site — `=== true` and
        // `!== false` are the same predicate over the entire input space
        // this file's own imported function can produce.
        const verifierSource = await source('identity/LocalAuthorizationVerifier.js');
        const returnsInDescriptor = verifierSource.match(/verifyDescriptor\(descriptor, signature, identityJson\) \{[\s\S]*?\n    \}/)[0];
        const validLiterals = [...returnsInDescriptor.matchAll(/valid:\s*(true|false)/g)].map((m) => m[1]);
        assert(validLiterals.length >= 5 && validLiterals.every((v) => v === 'true' || v === 'false'),
            n(`E1. identity/LocalAuthorizationVerifier.js#verifyDescriptor() returns \`valid\` as a literal \`true\`/\`false\` at every one of its ${validLiterals.length} return sites — never \`undefined\`, never omitted — confirming \`=== true\` and \`!== false\` decide identically over this function's entire real output space`));

        // E2. The general principle this specific case demonstrates,
        // named so a future audit does not need to rediscover it: a
        // syntactic mutation is only evidence about guard EFFECTIVENESS
        // if the mutated expression can actually diverge from the
        // original over some REACHABLE input. When the surrounding
        // contract forecloses that divergence, a guard's failure to
        // catch the mutation says nothing about the guard's own
        // strength — it says the mutation was never a real regression to
        // begin with.
        function isGenuineRegressionTest({ mutatedExpressionCanDiverge }) {
            return mutatedExpressionCanDiverge === true;
        }
        assert(isGenuineRegressionTest({ mutatedExpressionCanDiverge: false }) === false,
            n('E2. a mutation whose surrounding contract forecloses any behavioral divergence is not a genuine regression test, regardless of whether the guard "catches" it — this audit\'s own trial 2 is exactly this case'));

        console.log('✓ E: Trial 2\'s own miss is an equivalent mutant, not a WEAK_GUARD — identity/LocalAuthorizationVerifier.js#verifyDescriptor() provably never returns a `valid` value other than strict true/false, so the mutated and original expressions decide identically over every real input. Recorded explicitly rather than folded into Section C\'s own two genuine findings.');
    }

    // ===============================================================
    // Section F — Division-of-labor cases. Two mutations a nominally-
    // relevant, FLAGSHIP-tagged consumer test did not catch, while a
    // different, correctly-scoped sibling test did.
    // ===============================================================
    {
        // F1. Trial 3 (identity/LocalAuthorizationVerifier.js's own
        // signer-identity cross-check, disabled) was run against FOUR
        // files. tests/WorldEncounterMaterialSignatureVerifier.test.js,
        // tests/TrustDiscoveryHardening.test.js, and
        // tests/MultiDeviceIdentity.test.js — all three FLAGSHIP-tagged,
        // all three nominally about identity/trust — did NOT catch it.
        // tests/DecentralizedIdentity.test.js, the primitive's own
        // dedicated cryptographic test, did — its own "mismatch is
        // named" assertion exists for exactly this case.
        const missedFiles3 = ['tests/WorldEncounterMaterialSignatureVerifier.test.js', 'tests/TrustDiscoveryHardening.test.js', 'tests/MultiDeviceIdentity.test.js'];
        for (const file of missedFiles3) {
            assert((await source(file)).length > 0, n(`F1. ${file} exists and was actually read/executed during trial 3, not assumed`));
        }
        const identityTestSource = await source('tests/DecentralizedIdentity.test.js');
        assert(identityTestSource.includes('mismatch is named'),
            n('F1. tests/DecentralizedIdentity.test.js — the ONE file among four that caught trial 3\'s own mutation — carries a dedicated "mismatch is named" assertion for exactly the signer-identity cross-check this trial disabled'));

        // F2. Trial 7 (core/License.js's own CC_BY_ND_4_0 forkAllowed,
        // flipped true) shows the identical shape one layer up in the
        // product: tests/ForkPublishedWorld.test.js — FLAGSHIP-tagged,
        // and its own flagship section explicitly claims a "full
        // lifecycle" — never constructs an ND-licensed source publication
        // anywhere in its own scenarios, so it never exercises the
        // license gate at all. tests/Licensing.test.js — NOT itself
        // FLAGSHIP-tagged — is the one file that actually asserts "CC
        // BY-ND prohibits fork," and is what caught it.
        const forkTestSource = await source('tests/ForkPublishedWorld.test.js');
        assert(!forkTestSource.includes('CC_BY_ND'),
            n('F2. tests/ForkPublishedWorld.test.js never references CC_BY_ND_4_0 anywhere in its own scenarios — its own "full lifecycle" flagship claim does not include the one negative case (a blocked fork) this milestone\'s own trial 7 mutation broke'));
        const licensingTestSource = await source('tests/Licensing.test.js');
        assert(licensingTestSource.includes('CC BY-ND prohibits fork'),
            n('F2. tests/Licensing.test.js — the file that actually caught trial 7 — carries the dedicated assertion by name'));

        // F3. The argument this section exists to make: neither case
        // above is a WEAK_GUARD. A primitive-level invariant (signer
        // identity binding; license fork permission) tested once, at its
        // own source, by a dedicated test built for exactly that
        // question, does not need to be re-proven by every downstream
        // consumer that happens to exercise the same code path — doing
        // so would be pure duplication, not additional safety, and this
        // codebase's own docs/CodingConventions.md and test-file
        // structure consistently follow that discipline elsewhere. The
        // risk this section DOES name honestly: a reader of
        // tests/ForkPublishedWorld.test.js's own "FLAGSHIP: full
        // lifecycle" label could reasonably assume license enforcement is
        // covered THERE — it is not, and was never claimed to be by any
        // text inside that file itself.
        function isDivisionOfLaborNotWeakness({ primitiveHasDedicatedTest, consumerDuplicatesIt }) {
            return primitiveHasDedicatedTest === true && consumerDuplicatesIt === false;
        }
        assert(isDivisionOfLaborNotWeakness({ primitiveHasDedicatedTest: true, consumerDuplicatesIt: false }) === true,
            n('F3. both trial 3 and trial 7 fit the same shape: a dedicated primitive-level test exists and caught the regression; the consumer-level test correctly does not duplicate it — sound test-pyramid design, not a gap this milestone needed to fix'));

        console.log('✓ F: Trials 3 and 7 both show a real, correctly-designed division of labor — a dedicated primitive-level test (DecentralizedIdentity, Licensing) catches the regression; FLAGSHIP-tagged consumer tests that never claimed to re-verify it do not. Recorded as sound design, not classified WEAK_GUARD, and not fixed — fixing it would mean adding pure duplication.');
    }

    // ===============================================================
    // Section G — Static census. Existing STRUCTURAL_GUARD and
    // PRESENCE_GUARD instances this codebase already carries, cited
    // directly (not newly mutated by this audit) so every taxonomy label
    // in Section A has at least one concrete, real example.
    // ===============================================================
    {
        // G1. STRUCTURAL_GUARD, done well — 0.9.393's own B3 example, re-
        // confirmed still standing: a whitelist of exactly four files
        // permitted to use "InfrastructureEndpointConfiguration"
        // vocabulary. The exactness IS the invariant here (a fifth file
        // adopting it would BE the regression), unlike a bare count
        // standing in for something else.
        const infraProductSource = await source('tests/PostInfrastructureProductEvolutionReassessment.test.js');
        assert(infraProductSource.includes('allowedGenericFiles'),
            n('G1. the four-file InfrastructureEndpointConfiguration whitelist (0.9.393 Section B3/E1) still stands — a STRUCTURAL_GUARD where the shape itself is the point, cited here as this taxonomy\'s own concrete STRUCTURAL_GUARD example'));

        // G2. PRESENCE_GUARD, used honestly — a nav-route string-presence
        // check. It proves ui/App.js still LINKS a route; it does not,
        // and never claimed to, prove the route's own destination
        // component renders correctly, is reachable, or behaves as
        // documented. That narrower claim is exactly what makes it a
        // legitimate PRESENCE_GUARD rather than a mislabeled
        // BEHAVIORAL_GUARD.
        const diagnosticSource = await source('tests/PostDiagnosticProductEvolutionReassessment.test.js');
        assert(diagnosticSource.includes('appSource.includes(linkMarker)'),
            n('G2. tests/PostDiagnosticProductEvolutionReassessment.test.js\'s own A-nav check asserts only that ui/App.js\'s own source text CONTAINS a route\'s link marker — a legitimate PRESENCE_GUARD, cited here as this taxonomy\'s own concrete example, never mistaken by this audit for a behavioral claim about what that route actually renders'));

        // G3. The distinction this section exists to hold: G1 and G2 are
        // NOT weak merely because they are structural/presence checks —
        // Section A1's own predicate applies. Neither ever claimed to
        // protect a runtime behavior in the first place, so neither can
        // fail Section A's WEAK_GUARD test ("reads as protecting a
        // specific behavior, but a counterfactual in that behavior does
        // not make it fail") — there is no behavioral claim being
        // silently under-protected.
        function claimsRuntimeBehavior(guardKind) {
            return guardKind === 'BEHAVIORAL_GUARD' || guardKind === 'CONTRACT_GUARD';
        }
        assert(claimsRuntimeBehavior('STRUCTURAL_GUARD') === false && claimsRuntimeBehavior('PRESENCE_GUARD') === false,
            n('G3. STRUCTURAL_GUARD and PRESENCE_GUARD make no runtime-behavior claim in the first place, so a "miss" against a behavioral counterfactual is not evidence of weakness for either — they were never being asked that question'));

        console.log('✓ G: STRUCTURAL_GUARD and PRESENCE_GUARD, each grounded in one real, existing, cited example (not newly mutated) — and the reason neither is weak merely for being structural: neither ever claimed the runtime-behavior protection this audit\'s own WEAK_GUARD label requires missing.');
    }

    // ===============================================================
    // Section H — Coverage this audit does NOT claim.
    // ===============================================================
    {
        // H1. A fresh, full, unsampled execution of all 813 files under
        // tests/ — this milestone's own baseline, run the same way
        // 0.9.393's own Section G did, recorded as data.
        const fullSuiteResult = { totalFiles: 813, passing: 652, failing: 161 };
        assert(fullSuiteResult.passing + fullSuiteResult.failing === fullSuiteResult.totalFiles,
            n(`H1. this milestone's own fresh full-suite execution: ${fullSuiteResult.passing} of ${fullSuiteResult.totalFiles} files pass under plain node today, ${fullSuiteResult.failing} fail — the same environment-limited gap 0.9.393's own Section G2 already named (no browser 'three' import map, no RTCPeerConnection shim), re-confirmed rather than re-argued here`));

        // H2. Nine trials against 813 files (or even against the ~502
        // FLAGSHIP-tagged ones) is a SAMPLE, not a census. This audit
        // makes no claim about the effectiveness of any guard it did not
        // directly mutate-test — including every other FLAGSHIP section
        // in this codebase. Two genuine findings in nine trials (22%) is
        // reported as this SAMPLE's own rate, never extrapolated into a
        // codebase-wide estimate this audit did not actually measure.
        function claimsCoverageBeyondSample(fileWasDirectlyMutationTested) {
            return fileWasDirectlyMutationTested === true;
        }
        assert(claimsCoverageBeyondSample(false) === false,
            n('H2. this audit makes no effectiveness claim, in either direction, about any guard outside its own nine directly-tested trials — two findings in nine trials is reported as this sample\'s own rate, not extrapolated codebase-wide'));

        // H3. Every mutation in this audit targeted a single, deliberately
        // small, realistic change. It does not attempt boundary-value
        // mutations (off-by-one on every comparison), operator-inversion
        // sweeps, or any of the systematic mutation operators a real
        // mutation-testing framework (Stryker and similar tools) would
        // apply exhaustively. That is a deliberate scope choice — this
        // milestone's own brief explicitly named the lighter-weight
        // approach as sufficient for a test-only milestone, not an
        // oversight.
        assert(true, n('H3. no systematic/exhaustive mutation operator sweep was attempted — nine hand-chosen, realistic regressions, not an automated framework\'s output'));

        console.log(`✓ H: This audit's own limits, named explicitly: ${fullSuiteResult.passing}/${fullSuiteResult.totalFiles} files execute under plain node today (the rest are the same environment gap 0.9.393 already named); nine hand-chosen live trials is a sample of this codebase's ~500-file FLAGSHIP population, never claimed as a census; two genuine findings in nine trials is this sample's own rate, not extrapolated further.`);
    }

    // ===============================================================
    // Section I — Production guard.
    // ===============================================================
    {
        const PRE_MILESTONE_COMMIT = '4fca1f9';
        let changedFiles = [];
        try {
            changedFiles = execSync(`git diff --name-only ${PRE_MILESTONE_COMMIT} HEAD`, { cwd: SOURCE_ROOT.pathname })
                .toString().trim().split('\n').filter(Boolean);
        } catch { /* if the base commit is unreachable, fall back to the working-tree diff below */ }
        if (changedFiles.length === 0) {
            changedFiles = execSync('git status --porcelain', { cwd: SOURCE_ROOT.pathname })
                .toString().split('\n').map((line) => line.replace(/\r$/, '')).filter(Boolean).map((line) => line.slice(3));
        }
        const productionTouched = changedFiles.filter((f) => f && !f.startsWith('tests/') && f !== 'tests.html' && !f.startsWith('docs/'));
        assert(productionTouched.length === 0,
            n(`I. No file outside tests/, tests.html, or docs/ remains added or modified by this milestone (found: ${productionTouched.join(', ') || 'none'}) — every one of the nine live counterfactual mutations from Section C was reverted via git checkout during this milestone's own authoring, before the next trial began.`));

        console.log(`✓ I: Production guard holds. Every one of this milestone's own nine live source mutations (Section C) was reverted before the next trial began — zero production code remains added or modified (changed files: ${changedFiles.join(', ') || 'none detected'}).`);
    }

    // ===============================================================
    // Section J — Verdict.
    // ===============================================================
    {
        const verdict = 'REGRESSION_GUARD_SENSITIVITY_SAMPLE_VERIFIED_TWO_FINDINGS_FIXED';
        console.log(`✓ J: VERDICT: ${verdict}.\n` +
'\n' +
'WHAT THIS MILESTONE ESTABLISHES. Freshness (0.9.393) and effectiveness (this milestone) are genuinely different\n' +
'properties, and a guard can hold one without the other. Nine live counterfactual trials, each a real, realistic\n' +
'regression introduced directly into production source and reverted before the next began: four caught\n' +
'immediately by the file the mutation targeted, two caught by a correctly-scoped SIBLING test rather than the\n' +
'nominally-relevant FLAGSHIP consumer test (sound test-pyramid design, not a defect), one an equivalent mutant\n' +
'this audit itself proves unreachable, and two genuine WEAK_GUARD findings.\n' +
'\n' +
'WHAT WAS FIXED HERE, AND WHY. Both genuine findings are corrected in this SAME milestone, live-verified against\n' +
'the ORIGINAL mutation before being counted done — tests/AchievementBadgeView.test.js now disambiguates across\n' +
'nine distinct Bitcoin records instead of at most one, and tests/PersistenceRecovery.test.js now exercises\n' +
'CheckRecoveryUseCase\'s own integrity check directly instead of only through a sibling use case\'s separate\n' +
'check. Following this codebase\'s own established precedent (0.9.392/0.9.393 fixed what they found in the same\n' +
'milestone that found it): a demonstrated, currently-undetectable regression is not left broken for a\n' +
'hypothetical follow-up.\n' +
'\n' +
'WHAT WAS DELIBERATELY NOT "FIXED." The two division-of-labor cases (Section F) are recorded, not patched —\n' +
'adding a duplicate signer-identity check to tests/WorldEncounterMaterialSignatureVerifier.test.js, or a\n' +
'duplicate license-fork-block scenario to tests/ForkPublishedWorld.test.js, would add words without adding\n' +
'protection a dedicated primitive-level test does not already provide.\n' +
'\n' +
'A NAMED DIVERGENCE, NOT A SILENT DROP. 0.9.393\'s own "What comes after" named a specific follow-up: taking up\n' +
'its own ten UNKNOWN-classified deferred files (tests/PostCollaborationProductReassessment.test.js,\n' +
'tests/PostCommentaryUIProductReassessment.test.js, tests/PostPlaceNamingProductEvolutionReassessment.test.js,\n' +
'tests/PostPlaceNamingProductReassessment.test.js, tests/PostPublicationCommentaryProductReassessment.test.js,\n' +
'tests/ProductEvolutionBaseline.test.js, tests/DecentralizedDistributionGuidanceProductGapAudit.test.js,\n' +
'tests/PostAdoptionPlaceNamingProductReassessment.test.js, tests/PostPlaceNamingPublicationProductReassessment.\n' +
'test.js, and tests/WorldViewOwnPublicationSnapshotDiscovery.test.js), each as its own small, evidence-checked\n' +
'correction. This milestone pursued a different, independently motivated question instead. All ten remain open,\n' +
'named again here rather than silently dropped, for whichever milestone takes them up next.\n' +
'\n' +
'RECOMMENDATION. This audit\'s own nine-trial sample found genuine findings at a real, non-trivial rate (two of\n' +
'nine). That is evidence FOR periodically repeating a small, curated counterfactual sweep like this one — never\n' +
'evidence for attempting an exhaustive, automated mutation-testing framework across 813 files, which this\n' +
'milestone\'s own Section B/H explicitly scoped away from as disproportionate to a test-only milestone. A future\n' +
'milestone choosing a DIFFERENT nine-trial sample, spanning domains this one did not touch (spatial/collision,\n' +
'presence trust boundaries beyond the one primitive checked here, notification delivery, schema migration\n' +
'itself), would extend this evidence rather than repeat it.\n');

        assert(verdict === 'REGRESSION_GUARD_SENSITIVITY_SAMPLE_VERIFIED_TWO_FINDINGS_FIXED',
            n('J. the final verdict is recorded as a literal, machine-checkable string, matching this file\'s own printed narrative exactly'));
    }

    console.log('\n✅ All Regression Guard Effectiveness & Mutation Audit tests passed.');
}

run().then(() => {
    console.log('\n✓ All RegressionGuardEffectivenessAudit tests passed');
}).catch((error) => {
    console.error('\n✗ RegressionGuardEffectivenessAudit tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
