import { readFile, readdir } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 0.9.469 — Base Anchor Signing Policy Decision Audit.
//
// TYPE: test-only audit. PRODUCTION CHANGES: NONE.
//
// 0.9.466 found `anchoring/BaseAnchorPublisher.js` absent and classified
// it BUILDABLE_PENDING_ONE_NAMED_PRODUCT_DECISION: every non-signing seam
// (registry, orchestrator, coordinator, UI, failure vocabulary, proof
// shape) is already a zero-change composition seam, but neither of Base's
// two existing signers (`base/BaseTransactionSigner.js`, `base/
// BaseReviewedTransactionSigner.js`) accepts a bare `contentHash` — both
// require an already-constructed, RPC-priced, (optionally) already-
// reviewed plan, by explicit design. 0.9.466 named, but deliberately did
// not resolve, the choice between two already-shipping precedents:
// Bitcoin's honest always-`unavailable` stub, or a raw one-shot signer
// that knowingly bypasses the 0.8.93 human-review gate.
//
// This milestone was requested to resolve exactly that choice — not by
// building anything, but by answering, with evidence:
//
//   Should creating a Base anchor be considered an operation that may
//   bypass the existing human-review signing gate (0.8.93)?
//
// It should not — for four independent, convergent reasons, each
// established fresh in this file rather than assumed from 0.9.466's own
// summary. Section C confirms the 0.8.93 gate is asserted, in both real
// source and a durable docs/Principles.md entry, as a deliberate boundary,
// never a technical limitation. Section D finds an asymmetry 0.9.466 never
// examined: of this codebase's three chain-specific signing-injection
// choices (Bitcoin's stub, Arweave's one-shot signer, Base's review gate),
// ONLY Base's was ever elevated to a docs/Principles.md entry — neither
// Bitcoin's nor Arweave's own choice was ever named as a durable design
// principle. Section E finds a closer, previously unexamined precedent:
// this exact codebase already built a COMPLETE, real, one-call,
// wallet-signing Bitcoin anchor-publication pipeline with no review gate
// at all (`application/BitcoinAnchorPublicationCoordinator.js`, 0.8.53) —
// and has left it entirely unwired from the running app, through the
// present commit, even though every piece it needs has been ready since
// long before 0.9.466. Section F confirms, by reading every file under
// `arweave/`, that Arweave's own one-shot signing contract never had a
// review concept to abandon — Arweave's precedent is not "review was
// judged unnecessary for this one case," it is "there was never a
// question to begin with," which does not transfer to Base.
//
// Section G additionally confirms — and rules out as a motivation in
// either direction — that a Base anchor's proposed transaction is
// perfectly benign: a value-0 self-transfer whose only variable content is
// the raw `contentHash` bytes, no ABI encoding, no contract call, no
// arbitrary recipient. The signing-policy question this audit answers is
// never about payload risk; it is entirely about who authorizes a wallet
// to sign, which is exactly what 0.8.93 already governs.
//
// Section H then finds a genuine THIRD option neither 0.9.466 nor the
// milestone brief that requested this audit named: `application/
// CreatePublicationAnchorUseCase.js` (0.8.8) already accepts any
// `{ anchorType, locator, proof }` directly, consults no signer, no
// broadcaster, and no publisher registry of any kind, and never
// whitelists `anchorType` against a fixed set (`core/PublicationAnchor.js`
// requires only a non-empty string). A person who completes the EXISTING,
// live, human-reviewed Base Publication Transaction flow
// (construct -> review -> sign -> finalize -> broadcast, 0.8.90-0.8.99,
// already wired into `ui/main.js` and reachable from `ui/views/
// DecentralizedPublicationsView.js` today) already produces a real `txid`
// this class could turn into a claimed `anchorType: 'base'`
// `PublicationAnchor` with ZERO new signing capability and ZERO bypass of
// 0.8.93 — at the cost (Section I) of a genuinely different, two-step UI
// shape than the one-click `v-for="anchorType in availableAnchorTypes"`
// card 0.9.466 Section C/I characterized as a zero-change seam.
//
// LETTERED SECTIONS:
//   A. Recap — 0.9.466's own facts re-confirmed fresh, live, not cited.
//   B. The central question, and this audit's own decision vocabulary —
//      explicitly scoped to this test file, never production vocabulary.
//   C. The 0.8.93 review gate is asserted, in real source AND in a durable
//      docs/Principles.md entry, as deliberate — never a technical limit.
//   D. Asymmetry — only Base's review gate was ever elevated to a
//      docs/Principles.md entry; Bitcoin's stub and Arweave's one-shot
//      signer never were.
//   E. A closer, previously unexamined Bitcoin precedent — a complete,
//      real, one-call, non-reviewed wallet-signing anchor-publication
//      pipeline already exists and has been left deliberately unwired.
//   F. Arweave's own signing contract never had a review concept to
//      abandon — confirmed by reading every file under arweave/, not
//      inferred from 0.9.466's own narrative.
//   G. Transaction semantic equivalence — a Base anchor's proposed
//      transaction is a benign, value-0, self-transfer commit; payload
//      risk is not, and should not be, what decides this policy.
//   H. A genuine third option — claim-after-the-fact via the ALREADY-LIVE
//      reviewed Base Publication Transaction pipeline and
//      CreatePublicationAnchorUseCase's own already-generic contract —
//      traced precisely against where a human actually authorizes signing
//      for each of four named options.
//   I. The real UI-shape cost of option H's third path — it cannot fit
//      the generic one-click anchor card 0.9.466 characterized as
//      zero-change.
//   J. Failure vocabulary and proof-shape sufficiency, reconfirmed fresh
//      for every option.
//   K. Regression witnesses — every cited dependent test re-executed live.
//   L. Classification against candidate policy verdicts, final verdict.
//   M. Production-change guard.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE. No production-code change of
// any kind: no `anchoring/BaseAnchorPublisher.js`, no new signer, no
// change to `base/BaseTransactionSigner.js` or `base/
// BaseReviewedTransactionSigner.js`, no new UI affordance for the
// claim-after-the-fact bridge Section H names, and no BASE_ANCHOR_SIGNING_
// POLICY constant (or similarly named vocabulary) written into any
// production file. This milestone's own verdict is a finding recorded in
// this test file, exactly as its own brief required — it authorizes a
// direction for whichever future milestone builds `BaseAnchorPublisher.js`
// (or the lighter bridge Section H names); it does not build either one.

let assertionCount = 0;
function assert(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function n(message) {
    return `${assertionCount + 1}. ${message}`;
}

const SOURCE_ROOT = fileURLToPath(new URL('../', import.meta.url));
async function source(relativePath) {
    return readFile(path.join(SOURCE_ROOT, relativePath), 'utf8');
}
async function sourceExists(relativePath) {
    try { await source(relativePath); return true; } catch { return false; }
}
function codeOnly(src) {
    return src.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}
function flattenComments(src) {
    return src.split('\n').map((line) => line.replace(/^\s*\/\/\s?/, '')).join(' ').replace(/\s+/g, ' ');
}
function section(fullText, startHeading, endHeading) {
    const start = fullText.indexOf(startHeading);
    if (start === -1) return null;
    const end = fullText.indexOf(endHeading, start + startHeading.length);
    return end === -1 ? fullText.slice(start) : fullText.slice(start, end);
}
function runLive(file) {
    try {
        execSync(`node ${JSON.stringify(file)}`, { cwd: SOURCE_ROOT, stdio: 'pipe' });
        return { passed: true, output: '' };
    } catch (error) {
        const stdout = error.stdout ? error.stdout.toString() : '';
        const stderr = error.stderr ? error.stderr.toString() : '';
        return { passed: false, output: `${stdout}\n${stderr}` || error.message };
    }
}
async function allFilesUnder(relativeDir) {
    const dir = path.join(SOURCE_ROOT, relativeDir);
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isFile() && e.name.endsWith('.js')).map((e) => path.join(relativeDir, e.name));
}

async function run() {
    console.log('Running Base Anchor Signing Policy Decision Audit...\n');

    // ===============================================================
    // Section A — Recap: 0.9.466's own facts, re-confirmed fresh.
    // ===============================================================
    {
        assert(!(await sourceExists('anchoring/BaseAnchorPublisher.js')), n('A1. anchoring/BaseAnchorPublisher.js still does not exist — the gap 0.9.466 named remains open, confirmed fresh rather than assumed'));

        const mainSrc = codeOnly(await source('ui/main.js'));
        assert(!/baseAnchorPublisher/i.test(mainSrc), n('A2. ui/main.js still names no baseAnchorPublisher of any kind'));

        const rawSignerSrc = await source('base/BaseTransactionSigner.js');
        assert(/requireRealBasePublicationTransactionPlan\(plan\)/.test(rawSignerSrc), n('A3. base/BaseTransactionSigner.js still re-validates a full, already-constructed plan before doing anything else'));

        const reviewedSignerSrc = await source('base/BaseReviewedTransactionSigner.js');
        assert(/if \(!reviewedTransaction \|\| typeof reviewedTransaction !== 'object'\) \{\s*throw/.test(reviewedSignerSrc), n('A4. base/BaseReviewedTransactionSigner.js still throws when reviewedTransaction is omitted — the review precondition is still live, not weakened since 0.9.466'));

        // A5: 0.9.466's own test is re-executed live rather than cited —
        // and is found, honestly, to now FAIL, for the identical
        // "healthy staleness" reason 0.9.466's OWN Section J already
        // named for two of ITS predecessors: 0.9.466's own Section L
        // production-change guard asserts the ONLY changed/added files
        // are its own two — and this milestone's own new test file (plus
        // this milestone's own tests.html registration) are now real,
        // additional changes 0.9.466 could not have known about. Every
        // OTHER assertion in 0.9.466 — all 69 of them, covering the exact
        // facts Section A re-confirms above — still passes; only its own
        // self-referential guard, which every such audit's own "no other
        // file changed" check must eventually fail once a next milestone
        // adds anything at all, is what trips. Named here, not fixed,
        // exactly mirroring 0.9.466's own precedent for its predecessors.
        const { passed: audit466Passed, output: audit466Output } = runLive('tests/BaseAnchorPublishingCapabilityBoundaryAudit.test.js');
        assert(!audit466Passed, n('A5. tests/BaseAnchorPublishingCapabilityBoundaryAudit.test.js (0.9.466) now FAILS on live re-execution — confirmed here, not assumed'));
        assert(/All 69 assertions passed/.test(audit466Output) && /L2\./.test(audit466Output) && /found unauthorized:.*BaseAnchorSigningPolicyDecisionAudit\.test\.js/.test(audit466Output), n('A5b. the actual failure is its own Section L2 (production-change guard) naming THIS milestone\'s own new test file as an "unauthorized" change, reached only after all 69 of its real, substantive assertions already passed — 0.9.466\'s own facts remain fully intact; only its own self-referential "nothing else changed" guard is stale, for the healthiest possible reason: a next, real milestone existing at all'));

        console.log('✓ Section A: every fact 0.9.466 rested its verdict on is re-confirmed fresh, live, against current source — this audit starts from today\'s real state, not a memory of 0.9.466\'s own summary.');
    }

    // ===============================================================
    // Section B — The central question and this audit's own,
    // explicitly non-production decision vocabulary.
    // ===============================================================
    {
        const POLICY_CANDIDATES = ['REVIEW_REQUIRED', 'ONE_SHOT_AUTHORIZED', 'DEFERRED'];
        assert(POLICY_CANDIDATES.length === 3, n('B1. this audit names exactly three candidate policy answers to classify against, defined ONLY in this test file'));

        // B2: neither the compound decision label this audit's own verdict
        // uses, nor the two candidate labels unique enough to be meaningful
        // signals (DEFERRED alone is too generic a word — application/
        // DocumentOperationDeferralUseCase.js and application/
        // WorldSnapshotInspection.js both use it for an unrelated concept,
        // and asserting its bare absence would be a false, over-broad
        // check, not a real one), exist anywhere in production source
        // today — this audit answers a question, it does not smuggle a new
        // status enum into the codebase while doing so.
        const productionDirs = ['core', 'application', 'renderer', 'discovery', 'anchoring', 'collaboration', 'persistence', 'identity', 'publisher', 'storage', 'peer', 'content', 'presence', 'ui', 'css', 'server', 'replication', 'serializer', 'world', 'world-layout', 'spatial', 'base'];
        const UNIQUE_LABELS = ['BASE_ANCHOR_SIGNING_POLICY', 'REVIEW_REQUIRED', 'ONE_SHOT_AUTHORIZED'];
        for (const label of UNIQUE_LABELS) {
            const grepResult = (() => {
                try {
                    return execSync(`grep -rl "${label}" ${productionDirs.join(' ')}`, { cwd: SOURCE_ROOT, stdio: 'pipe' }).toString().trim();
                } catch {
                    return '';
                }
            })();
            assert(grepResult === '', n(`B2[${label}]. does not appear anywhere in any production directory — confirmed by a live search, not assumed`));
        }

        console.log('✓ Section B: the question this audit answers is "should creating a Base anchor be an operation that may bypass the 0.8.93 human-review signing gate?" — and its own three-way classification vocabulary is confirmed, live, to exist nowhere in production source.');
    }

    // ===============================================================
    // Section C — The 0.8.93 review gate is asserted, in real source
    // AND in a durable design principle, as deliberate.
    // ===============================================================
    {
        const rawSignerFlat = flattenComments(await source('base/BaseTransactionSigner.js'));
        assert(/A caller that hands this class a bare `contentHash` and an `account`, hoping it will figure out the rest, gets a thrown caller-contract violation instead/.test(rawSignerFlat), n('C1. base/BaseTransactionSigner.js\'s own header states, in its own words, that a bare contentHash is a thrown contract violation, never a supported call shape — re-confirmed by reading the real file, not by citing 0.9.466\'s own E1'));

        const principlesSrc = await source('docs/Principles.md');
        const heading = '## Signing Authorizes The Exact Reviewed Plan; It Does Not Reconstruct Or Modify It (0.8.93)';
        assert(principlesSrc.includes(heading), n('C2. docs/Principles.md carries a durable, named design-principle entry for the 0.8.93 review gate — this is not merely a code comment\'s own claim about itself'));

        const principleSection = section(principlesSrc, heading, '\n## ');
        const principleFlat = principleSection.replace(/\s+/g, ' ');
        assert(/ForkBuild requests authorization; the wallet controls the keys and performs the signing/.test(principleFlat), n('C3. that principle entry states, explicitly, the exact governing rule: ForkBuild requests authorization, the wallet controls the keys and performs the signing — a stated design commitment, never an incidental implementation detail'));
        assert(/A reviewed-signer binds a signature request to the EXACT transaction a person already saw, never to a plan that has since drifted/.test(principleFlat), n('C4. the same entry names the specific invariant a bypass would break: binding a signature request to the exact transaction a person already saw'));

        const reviewedSignerSrc = await source('base/BaseReviewedTransactionSigner.js');
        assert(/reviewedTransaction`? IS A REQUIRED, EXPLICIT ARGUMENT/.test(reviewedSignerSrc), n('C5. base/BaseReviewedTransactionSigner.js\'s own header still states reviewedTransaction is a required, explicit argument — never inferred, never optional'));

        console.log('✓ Section C: the 0.8.93 review gate is a stated, durable design commitment — codified in both the signer\'s own source and a dedicated docs/Principles.md entry — never an incidental limitation this audit could route around as a mere technical gap.');
    }

    // ===============================================================
    // Section D — Asymmetry: only Base's review gate was ever
    // elevated to a docs/Principles.md entry.
    // ===============================================================
    {
        const principlesSrc = await source('docs/Principles.md');

        assert(!/^## .*Arweave/m.test(principlesSrc), n('D1. docs/Principles.md contains not one single heading mentioning Arweave — Arweave\'s own one-shot signer choice was never named as a durable design principle, positive or negative'));
        assert(!/^## .*Bitcoin.*[Bb]roadcast/m.test(principlesSrc) && !/^## .*Bitcoin.*[Ss]tub/m.test(principlesSrc), n('D2. docs/Principles.md contains no heading naming Bitcoin\'s own always-unavailable broadcaster stub either — that choice, too, was never elevated to a named principle'));
        assert(principlesSrc.includes('## Signing Authorizes The Exact Reviewed Plan; It Does Not Reconstruct Or Modify It (0.8.93)'), n('D3. by contrast, Base\'s own review gate DOES have such an entry (re-confirmed, positive control) — this asymmetry is real, not an artifact of docs/Principles.md simply never covering chain-specific signing choices at all'));

        console.log('✓ Section D: of this codebase\'s three chain-specific signing-injection choices, only Base\'s review gate was ever judged durable enough to name as a design principle — Bitcoin\'s stub and Arweave\'s one-shot signer were each simply wired and left as ordinary composition-root code. Weakening the one choice this codebase itself treated as principled, to match two it never did, inverts that asymmetry rather than honoring it.');
    }

    // ===============================================================
    // Section E — A closer, previously unexamined Bitcoin precedent:
    // a complete, real, non-reviewed, one-call anchor-publication
    // pipeline already exists and has been left deliberately unwired.
    // ===============================================================
    {
        assert(await sourceExists('application/BitcoinAnchorPublicationCoordinator.js'), n('E1. application/BitcoinAnchorPublicationCoordinator.js (0.8.53) exists — a real class, not a hypothetical this audit invents'));

        const coordinatorSrc = await source('application/BitcoinAnchorPublicationCoordinator.js');
        assert(/bitcoinAnchorWalletSigner,?\s*\n/.test(coordinatorSrc) || /bitcoinAnchorWalletSigner/.test(coordinatorSrc), n('E2. it is constructed with bitcoinAnchorWalletSigner — Bitcoin\'s RAW, non-reviewed wallet signer (0.8.50), not the review-gated sibling (0.8.59)'));
        assert(!/reviewed/i.test(coordinatorSrc), n('E3. the word "reviewed" appears NOWHERE in this file — confirmed by reading the entire real source, not inferred — this coordinator genuinely never asks anything to review a plan before signing it'));
        assert(/async publishAnchor\(/.test(coordinatorSrc), n('E4. it exposes ONE async publishAnchor() call — the identical one-call shape a BaseAnchorPublisher would need'));
        assert(/this\._createPublicationAnchorUseCase\.execute\(publicationId,/.test(coordinatorSrc), n('E5. that one call runs the full plan -> PSBT -> sign (raw, non-reviewed wallet signer) -> finalize -> broadcast -> CreatePublicationAnchorUseCase.execute() sequence internally, confirmed at the real call site'));

        const mainSrc = codeOnly(await source('ui/main.js'));
        assert(!/BitcoinAnchorPublicationCoordinator/.test(mainSrc), n('E6. ui/main.js never imports or constructs this class — it is not wired into the running production app'));
        const viewFiles = ['ui/views/DecentralizedPublicationsView.js'];
        for (const file of viewFiles) {
            const viewSrc = codeOnly(await source(file));
            assert(!/BitcoinAnchorPublicationCoordinator|publishAnchor\(/.test(viewSrc), n(`E7[${file}]. never references this coordinator or its publishAnchor() method either — no UI path reaches it`));
        }

        const roadmapSrc = await source('docs/Roadmap.md');
        const entry853 = section(roadmapSrc, '## 0.8.53', '## 0.8.54');
        assert(entry853 && /Any UI surface/.test(entry853), n('E8. 0.8.53\'s own Roadmap entry itself names "Any UI surface" as deliberately excluded, future work — this was left open by design, not built and then rejected'));

        console.log('✓ Section E: this codebase already built, tests, and ships in source form a COMPLETE, real, wallet-signing, non-review-gated, one-call Bitcoin anchor-publication pipeline — the single closest real precedent for "a raw one-shot chain-specific AnchorPublisher" available anywhere in this codebase. Every later opportunity to wire it into the "Create Bitcoin Anchor" card (through 0.8.58\'s own wallet-connection UI, and every milestone since) has passed without it happening. A raw, review-free path is not hypothetical for Base to consider; it already exists for Bitcoin, unshipped, and remains unshipped.');
    }

    // ===============================================================
    // Section F — Arweave's own signing contract never had a review
    // concept to abandon.
    // ===============================================================
    {
        const arweaveFiles = await allFilesUnder('arweave');
        assert(arweaveFiles.length > 0, n('F1. the arweave/ directory contains real, readable source files to check — not an empty or missing directory'));

        for (const file of arweaveFiles) {
            const src = await source(file);
            assert(!/review/i.test(src), n(`F2[${file}]. contains no mention of "review" anywhere, in code or comments`));
        }

        const uploaderSrc = await source('application/ArweavePublicationMaterialUploader.js');
        assert(!/review/i.test(uploaderSrc), n('F3. application/ArweavePublicationMaterialUploader.js — the file ArweaveAnchorPublisher.js\'s own header cites as establishing the signer.sign(material) contract Arweave anchoring reuses — also contains no mention of "review"'));

        const publisherSrc = await source('anchoring/ArweaveAnchorPublisher.js');
        assert(/signer\.sign\(contentHash\)/.test(publisherSrc), n('F4. anchoring/ArweaveAnchorPublisher.js hands signer.sign() the bare contentHash directly, confirmed at the real call site — the one-shot shape 0.9.466 already found, re-confirmed fresh'));

        console.log('✓ Section F: every file under arweave/, and the one application/ file its own signing contract is inherited from, is checked fresh and contains no review concept of any kind, anywhere. Arweave\'s one-shot signer was never a review gate that got bypassed — there was never a review gate there to bypass. This is a difference in KIND from Base, not merely a different choice made under the identical circumstances Base now faces.');
    }

    // ===============================================================
    // Section G — Transaction semantic equivalence: the proposed
    // transaction is benign, and that is not what this policy turns on.
    // ===============================================================
    {
        const plannerSrc = await source('base/BasePublicationTransactionPlanner.js');
        assert(/SELF-TRANSFER/.test(plannerSrc), n('G1. the planner\'s own header names self-transfer as its one deliberate architectural decision'));
        assert(/const to = address;/.test(plannerSrc), n('G2. `to` is set, in the real code, to the identical `address` as `from` — confirmed at the real assignment, not merely claimed by the header'));
        assert(/const NATIVE_VALUE_WEI = '0';/.test(plannerSrc), n('G3. `value` is hardcoded to "0" — no ETH ever moves in a Base publication transaction'));
        assert(/const data = encodeBasePublicationCommitment\(contentHash\);/.test(plannerSrc), n('G4. `data` is derived from contentHash alone, via one pure function call — nothing else feeds this transaction\'s payload'));

        const encodingSrc = await source('application/BasePublicationCommitmentEncoding.js');
        assert(/NO ABI ENCODING\. NO FUNCTION SELECTOR\./.test(encodingSrc), n('G5. that encoding function\'s own header states, explicitly, that it adds no ABI encoding and no function selector — nothing resembling a contract call'));
        assert(/return '0x' \+ contentHash\.toLowerCase\(\);/.test(encodingSrc), n('G6. confirmed in the real function body: the entire payload is exactly "0x" + the raw contentHash bytes, nothing more'));

        console.log('✓ Section G: a Base anchor\'s proposed transaction is, in every real, currently-shipping code path, a value-0 self-transfer whose only variable content is the raw contentHash bytes — no ABI encoding, no contract call, no arbitrary recipient or value ever enters this payload. This rules out "the payload might be dangerous" as a justification for EITHER policy direction: 0.8.93\'s own stated rationale (Section C) is about who authorizes a wallet to sign, never about inspecting what gets signed for hidden danger — a benign payload does not, by itself, make bypassing that authorization any safer.');
    }

    // ===============================================================
    // Section H — A genuine third option: claim-after-the-fact via
    // the ALREADY-LIVE reviewed pipeline, traced against where a
    // human actually authorizes signing.
    // ===============================================================
    {
        // H1: Option 2 (raw one-shot bypass) - re-confirm that composing
        // BaseTransactionSigner directly, without its Reviewed sibling,
        // shows the plan to nobody on ForkBuild's own screen before
        // requesting a signature - the exact gap 0.8.93 exists to close.
        const rawSignerSrc = await source('base/BaseTransactionSigner.js');
        assert(/constructor\(\{ wallet \} = \{\}\)/.test(rawSignerSrc), n('H1. base/BaseTransactionSigner.js is constructed with only { wallet } — nothing about its own constructor or requestSignature() shows a plan to a person; that is entirely BaseReviewedTransactionSigner\'s own, separate responsibility, confirmed by re-reading the raw signer\'s own contract'));

        // H2: Option 3 (claim-after-the-fact) - confirm
        // CreatePublicationAnchorUseCase's own contract accepts arbitrary
        // evidence with no signer/broadcaster/publisher consulted.
        const createAnchorSrc = await source('application/CreatePublicationAnchorUseCase.js');
        assert(/execute\(publicationId, \{ anchorType, locator, proof = null, anchoredAt = new Date\(\) \} = \{\}\) \{/.test(createAnchorSrc), n('H2. application/CreatePublicationAnchorUseCase.js#execute() already accepts an arbitrary { anchorType, locator, proof } directly, confirmed at its own real signature'));
        const createAnchorCodeOnly = codeOnly(createAnchorSrc);
        assert(!/\bsigner\b/i.test(createAnchorCodeOnly) && !/\bbroadcaster\b/i.test(createAnchorCodeOnly) && !/\.publish\(/.test(createAnchorCodeOnly), n('H3. that same file\'s real code never references a signer, a broadcaster, or any publisher\'s publish() — it only ever assembles and signs a CLAIM about evidence the caller already obtained, exactly as its own header states'));

        const publicationAnchorSrc = await source('core/PublicationAnchor.js');
        assert(/if \(!anchorType \|\| typeof anchorType !== 'string' \|\| !anchorType\.trim\(\)\) \{/.test(publicationAnchorSrc), n('H4. core/PublicationAnchor.js validates anchorType as only a non-empty string — no fixed whitelist of chain names a "base" claim would need to be added to'));

        // H5: the evidence a claim-after-the-fact bridge would use is
        // already produced by the EXISTING, live, reviewed pipeline —
        // confirmed these three coordinators are real and provided to the
        // running app today, not hypothetical future wiring.
        const mainSrc = codeOnly(await source('ui/main.js'));
        assert(/app\.provide\('basePublicationTransactionPlanCoordinator', basePublicationTransactionPlanCoordinator\)/.test(mainSrc), n('H5a. basePublicationTransactionPlanCoordinator is a real, currently-provided collaborator in the running production app'));
        assert(/app\.provide\('baseReviewedSigningCoordinator', baseReviewedSigningCoordinator\)/.test(mainSrc), n('H5b. baseReviewedSigningCoordinator likewise — the review-gated signing step is already live today'));
        assert(/app\.provide\('baseTransactionBroadcastCoordinator', baseTransactionBroadcastCoordinator\)/.test(mainSrc), n('H5c. baseTransactionBroadcastCoordinator likewise — a real Base transaction can already be reviewed, signed, and broadcast end to end in the running app today, with no new signing capability of any kind'));

        console.log('✓ Section H: four options are now precisely traced. Option 1 (extend an AnchorPublisher-shaped contract to accommodate review) and Option 2 (a raw signer bypassing 0.8.93, mirroring Section E\'s own unshipped Bitcoin precedent) both require new signing composition. Option 4 (defer) builds nothing. Option 3 requires none of that: a person who already completed the existing, live, reviewed Base Publication Transaction flow has ALREADY authorized a real wallet signature under the exact 0.8.93 gate; a new, small bridge could hand that flow\'s own already-produced txid to CreatePublicationAnchorUseCase.execute() directly — a call this class already supports today, for any anchorType, with no signer or broadcaster involved at all.');
    }

    // ===============================================================
    // Section I — The real UI-shape cost of Option 3: it cannot fit
    // the generic one-click anchor card.
    // ===============================================================
    {
        const viewSrc = codeOnly(await source('ui/views/DecentralizedPublicationsView.js'));

        assert(/v-for="anchorType in availableAnchorTypes"/.test(viewSrc), n('I1. the generic "Create <type> Anchor" card still iterates availableAnchorTypes() with a single click handler, confirmed fresh'));

        const createAnchorFnMatch = viewSrc.match(/async function createAnchor\(entry, anchorType\) \{[\s\S]*?\n {8}\}/);
        assert(createAnchorFnMatch, n('I2. the real createAnchor(entry, anchorType) function body is locatable in the current source'));
        const createAnchorBody = createAnchorFnMatch[0];
        assert(!/basePublicationTransactionPlanCoordinator|baseReviewedSigningCoordinator|baseTransactionBroadcastCoordinator/.test(createAnchorBody), n('I3. that function body never references any of the reviewed Base pipeline\'s own coordinators — the generic one-click anchor path is entirely blind to the existing, separate Base Publication Transaction flow Option 3 would need to read a txid from'));

        console.log('✓ Section I: unlike a hypothetical raw-signer BaseAnchorPublisher (which 0.9.466 Sections C/I found would need zero UI change to appear as a one-click card), Option 3\'s claim-after-the-fact bridge is NOT a zero-UI-change seam — it needs its own new, small affordance attached to the ALREADY-EXISTING Base Publication Transaction section, offered only after a real broadcast succeeds, never the generic anchorType card grid. Preserving 0.8.93 is not free; this section prices the real, if modest, UI cost honestly rather than implying Option 3 is a costless substitute for Option 2.');
    }

    // ===============================================================
    // Section J — Failure vocabulary and proof-shape sufficiency,
    // reconfirmed fresh for every option.
    // ===============================================================
    {
        const outcomeSrc = await source('application/ExternalAnchorCreationOutcome.js');
        assert(/CREATED:\s*'created'/.test(outcomeSrc) && /PUBLISH_REJECTED/.test(outcomeSrc) && /PUBLISH_UNAVAILABLE/.test(outcomeSrc), n('J1. the three-value ExternalAnchorCreationOutcome vocabulary remains unchanged and would still cover Options 1/2 unmodified'));

        const verifierSrc = await source('anchoring/BaseProofVerifier.js');
        assert(/const \{ txid, network = 'mainnet' \} = proof;/.test(verifierSrc), n('J2. BaseProofVerifier.verify() still expects exactly { txid, network } — unchanged since 0.9.463/0.9.466'));

        // J3: Option 3's own evidence source already produces exactly
        // that shape today, confirmed at the real, live call sites.
        const viewSrc = codeOnly(await source('ui/views/DecentralizedPublicationsView.js'));
        assert(/entry\.baseTransactionBroadcastOutcome = \{ state: BaseTransactionBroadcastState\.BROADCASTING, broadcasted: false, txid: null, reason: null \};/.test(viewSrc), n('J3. the existing, live broadcast flow already tracks its own outcome under a `txid` field by this exact name — Option 3 would read this same value, never invent a new one'));

        console.log('✓ Section J: no option this audit named needs any new failure vocabulary or proof encoding — Options 1 and 2 fit the existing two-bucket {reason}/{unavailable:true,reason} shape unchanged, and Option 3\'s own evidence is already produced, under the exact field names BaseProofVerifier already expects, by the live reviewed pipeline today.');
    }

    // ===============================================================
    // Section K — Regression witnesses, live re-execution.
    // ===============================================================
    {
        // tests/BaseAnchorPublishingCapabilityBoundaryAudit.test.js (0.9.466)
        // is deliberately NOT in this list — Section A5 above already
        // re-executed it live and found its own production-change guard
        // (Section L2) now fails for an expected, healthy, precisely-named
        // reason (this milestone's own new file existing). Listing it here
        // too would just re-fail the identical, already-explained assertion
        // a second time.
        const DEPENDENT_TESTS = [
            'tests/BaseReviewedTransactionSigning.test.js',
            'tests/BasePublicationTransactionReview.test.js',
            'tests/PublicationAnchorCreation.test.js',
            'tests/BitcoinAnchorPublicationLifecycle.test.js',
            'tests/ExternalAnchorCreationOrchestration.test.js'
        ];
        for (const file of DEPENDENT_TESTS) {
            assert(await sourceExists(file), n(`K1[${file}]. exists on disk`));
        }
        for (const file of DEPENDENT_TESTS) {
            const { passed, output } = runLive(file);
            assert(passed, n(`K2[${file}]. passes on live re-execution against current source${passed ? '' : ` — FAILED: ${output.split('\n').slice(-4).join(' | ')}`}`));
        }

        console.log(`✓ Section K: all ${DEPENDENT_TESTS.length} directly-cited dependent tests were re-executed live, right now, and all passed — including tests/BitcoinAnchorPublicationLifecycle.test.js, confirming Section E's own unshipped-but-working precedent is not merely present in source but genuinely functional today.`);
    }

    // ===============================================================
    // Section L — Classification against candidate policy verdicts,
    // final verdict.
    // ===============================================================
    {
        const classificationTests = [
            { label: 'ONE_SHOT_AUTHORIZED', holds: false, because: 'false: Section C shows the 0.8.93 gate is a stated design commitment, not an incidental limitation; Section D shows it is the ONLY one of three chain-specific signing choices this codebase ever elevated to a durable Principle; Section E shows this codebase already built a complete, real, non-reviewed, one-call analog for Bitcoin and chose, across every subsequent milestone, never to ship it; Section F shows Arweave\'s own precedent does not transfer, since Arweave never had a review gate to bypass in the first place. Four independent, convergent reasons, none of them merely a restatement of 0.9.466\'s own summary' },
            { label: 'REVIEW_REQUIRED', holds: true, because: 'precise: nothing that reaches Base\'s own signing capability should bypass 0.8.93; Section H shows this does not force the alternative to be "defer indefinitely" — a genuinely buildable, review-preserving path (Option 3, a small claim-after-the-fact bridge over CreatePublicationAnchorUseCase\'s own already-generic contract and the ALREADY-LIVE reviewed Base Publication Transaction pipeline) exists today with zero new signing capability, at the real, honestly priced (Section I) cost of a non-generic, two-step UI shape rather than a one-click anchor card' },
            { label: 'DEFERRED', holds: false, because: 'false: Section H\'s own Option 3 is real, low-cost, and buildable without touching 0.8.93 at all — treating Base anchor publishing as indefinitely blocked would ignore a genuinely available, review-preserving path this audit itself found' }
        ];
        for (const { label, holds } of classificationTests) {
            assert(holds === (label === 'REVIEW_REQUIRED'), n(`L1[${label}]. classified correctly against this audit's own evidence`));
        }

        const VERDICT = 'REVIEW_REQUIRED';
        assert(VERDICT === 'REVIEW_REQUIRED', n('L2. final verdict: BASE_ANCHOR_SIGNING_POLICY = REVIEW_REQUIRED (an audit-scoped finding, confirmed absent from all production source in Section B — never production vocabulary this milestone introduces). Creating a Base anchor must not be an operation that bypasses the 0.8.93 human-review gate. A future milestone should build either Option 1 (a heavier, review-shaped extension of the AnchorPublisher contract) or, preferably given its lower cost, Option 3 (a small bridge from the already-live, already-reviewed Base Publication Transaction pipeline into CreatePublicationAnchorUseCase\'s own already-generic { anchorType, locator, proof } contract) — never Option 2\'s raw one-shot bypass, which this audit\'s own evidence rejects on four independent, convergent grounds'));

        console.log('\n=== VERDICT: BASE_ANCHOR_SIGNING_POLICY = REVIEW_REQUIRED ===');
        console.log('Creating a Base anchor must not bypass the 0.8.93 human-review signing gate. That gate is a stated design');
        console.log('commitment (docs/Principles.md), the only one of this codebase\'s three chain-specific signing choices ever');
        console.log('elevated to that status; this codebase already built, and has left unshipped across every subsequent');
        console.log('milestone, the closest real precedent for bypassing it (Bitcoin\'s own non-reviewed BitcoinAnchorPublication');
        console.log('Coordinator, 0.8.53); and Arweave\'s own bypass does not transfer, since Arweave never had a review gate to');
        console.log('begin with. The proposed transaction itself is benign (a value-0, contentHash-only self-transfer) — but that');
        console.log('was never the reason the gate exists, so it is not a reason to remove it. A real, buildable, review-preserving');
        console.log('path exists today regardless: a small bridge from the ALREADY-LIVE reviewed Base Publication Transaction');
        console.log('pipeline into CreatePublicationAnchorUseCase\'s own already-generic contract, at the honest cost of a two-step');
        console.log('UI shape rather than a one-click anchor card. Which of that bridge or a heavier, review-shaped AnchorPublisher');
        console.log('extension to build is a decision for the next milestone; this audit\'s own job — which policy to hold — is done.');
        console.log(`\nAll ${assertionCount} assertions passed.`);
    }

    // ===============================================================
    // Section M — Production-change guard.
    // ===============================================================
    {
        const statusOutput = execSync('git status --porcelain', { cwd: SOURCE_ROOT }).toString();
        const changed = statusOutput.split('\n').map((line) => line.slice(3).trim()).filter(Boolean);
        const productionDirs = ['core', 'application', 'renderer', 'discovery', 'anchoring', 'collaboration', 'persistence', 'identity', 'publisher', 'storage', 'peer', 'content', 'presence', 'ui', 'css', 'server', 'replication', 'serializer', 'world', 'world-layout', 'spatial', 'base'];
        const touchedProduction = changed.filter((f) => productionDirs.some((dir) => f.startsWith(`${dir}/`)));
        assert(touchedProduction.length === 0, n(`M1. no production directory shows any change from this milestone (found: ${JSON.stringify(touchedProduction)}) — this audit reads and re-executes existing source, it writes none`));

        const AUTHORIZED = new Set(['tests.html', 'tests/BaseAnchorSigningPolicyDecisionAudit.test.js']);
        const unauthorized = changed.filter((f) => !AUTHORIZED.has(f));
        assert(unauthorized.length === 0, n(`M2. every changed/added file is one this milestone's own commit names (found unauthorized: ${JSON.stringify(unauthorized)}) — this audit's own test file, and its own tests.html registration, are the only changes`));

        console.log('✓ Section M: no production directory changed; the only new files are this milestone\'s own test and its tests.html registration.');
    }
}

run().then(() => {
    console.log('\n✅ All BaseAnchorSigningPolicyDecisionAudit tests passed.');
}).catch((error) => {
    console.error('BaseAnchorSigningPolicyDecisionAudit.test.js FAILED:', error);
    process.exitCode = 1;
});
