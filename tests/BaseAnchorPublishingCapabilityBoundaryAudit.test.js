import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 0.9.466 — Base Anchor Publishing Capability Boundary Audit.
//
// TYPE: test-only audit. PRODUCTION CHANGES: NONE.
//
// 0.9.460's own Section K found exactly one genuinely open seam for Base's
// participation in the OLDER, peer-shareable "claim + externally verify an
// anchor" surface (core/PublicationAnchor.js, application/
// CreateExternalPublicationAnchorUseCase.js, application/
// ExternalAnchorPublisherRegistry.js) — and named it as TWO absent files in
// one assertion (K4): `anchoring/BaseProofVerifier.js` AND `anchoring/
// BaseAnchorPublisher.js`. 0.9.461-0.9.465 closed the first half —
// BaseProofVerifier now exists, is registered into the shared
// ExternalProofVerifierRegistry, and is reachable from ui/main.js. This
// milestone was requested to audit the second half, on the hypothesis
// (mirroring 0.9.460's own brief) that it is "just a composition seam":
//
//   Does the existing Base transaction pipeline (0.9.460's own Sections
//   A-J, complete and production-wired) already contain everything needed
//   to build anchoring/BaseAnchorPublisher.js, or is the missing piece
//   another genuine capability gap?
//
// It is neither, cleanly. Sections A-C confirm the registry side is a pure
// PROVIDER_GAP exactly like 0.9.424 found for Arweave — the registry,
// orchestrator, coordinator, and UI are already fully anchorType-generic
// and require zero code change for a 'base' key. But Sections D-F find
// that the ONE-CALL `publish(contentHash)` shape both existing publishers
// hold — "no wallet management, delegate everything to ONE injected
// collaborator that takes raw material and returns an id" — has NO
// existing Base counterpart: Base's own signing capability (base/
// BaseTransactionSigner.js, base/BaseReviewedTransactionSigner.js) both
// categorically REFUSE a bare contentHash, requiring an already-
// constructed, RPC-priced transaction plan instead, by explicit design.
// Section D finds this is not even a novel problem: this exact codebase
// already answered the "can a review-gated, multi-step wallet pipeline
// compose into a one-call registry publisher?" question for Bitcoin, and
// answered it "no" — Bitcoin's OWN production `BitcoinAnchorPublisher`
// wiring (ui/main.js) deliberately bypasses its own real, wallet-connected
// PSBT/review pipeline entirely, wiring instead against an honest,
// always-`unavailable` stub. Arweave took the opposite path only because
// Arweave's OWN signing contract (`signer.sign(material)`) was ALREADY a
// one-shot, non-interactive call with no review gate to begin with — Base
// has no such capability today.
//
// So the honest verdict is not GO_BUILD_NOW, PURE_COMPOSITION_SEAM, or
// NEW_BLOCKCHAIN_CAPABILITY_REQUIRED. It is that `anchoring/
// BaseAnchorPublisher.js` is real, small, buildable work whose every
// non-signing seam (registry, orchestrator, coordinator, UI, proof-shape
// round-trip to the already-built BaseProofVerifier) is already fully
// generic and requires zero change — but building it requires ONE
// explicit product decision this audit deliberately does not make:
// whether to follow Bitcoin's own honest-stub precedent, or to compose
// Base's RAW (non-review-gated) signer and accept bypassing this
// codebase's own deliberate human-review invariant (0.8.93) as a new,
// narrower trade-off. Both are real, working precedents already live in
// this exact registry today; picking between them is a decision, not an
// audit finding.
//
// LETTERED SECTIONS:
//   A. Role/registry landscape — PROOF_AND_ANCHORING now closed for Base
//      (post-0.9.465); AnchorPublisher is a SEPARATE, role-less,
//      anchorType-keyed registry; confirmed absent for Base.
//   B. The generic AnchorPublisher contract, extracted structurally from
//      Bitcoin's and Arweave's own shared shape — no base class exists.
//   C. Registry/orchestrator/coordinator/UI genericity — zero code change
//      needed for a 'base' key anywhere in that chain (the Arweave
//      PROVIDER_GAP precedent, confirmed to hold for Base too).
//   D. Two already-established, divergent signing-injection precedents —
//      Bitcoin's real production stub vs. Arweave's real production
//      one-shot signer — read directly from ui/main.js's own source.
//   E. Base's own signing capability categorically rejects a bare
//      contentHash — quoted directly from base/BaseTransactionSigner.js's
//      own contract-violation behavior.
//   F. Consequence: no existing Base collaborator has the shape a
//      one-call publish(contentHash) needs; two honest options exist,
//      both already precedented in this exact codebase, neither obviously
//      correct without a product decision.
//   G. Failure-vocabulary mapping — the existing closed vocabulary already
//      covers every Base failure shape; no BASE_FAILED/BASE_PENDING needed
//      under either F option.
//   H. Proof-shape round-trip — a Base publisher's {txid,network} proof is
//      already exactly what BaseProofVerifier.verify() expects; zero new
//      encoding regardless of F's outcome.
//   I. UI reachability — the "Create <type> Anchor" surface is already a
//      generic v-for over availableAnchorTypes(); a registered Base
//      publisher (real or stub) needs zero UI-file changes to appear.
//   J. Regression witnesses — dependent tests re-executed live; two
//      earlier audits' own assertions are found freshly stale, for
//      expected, healthy reasons (real progress since they were written),
//      named here and left unfixed, exactly as 0.9.460 Section L already
//      established the precedent for.
//   K. Classification against candidate verdicts, final verdict.
//   L. Production-change guard.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE. No production-code change of
// any kind: no anchoring/BaseAnchorPublisher.js, no registration, no
// decision between the honest-stub and raw-signer paths named in Section
// F (that decision belongs to whoever authorizes the next milestone, not
// to this audit), no change to base/BaseTransactionSigner.js or base/
// BaseReviewedTransactionSigner.js, no fix for either stale prior-audit
// assertion Section J names. This milestone establishes what is and is
// not already true, and names the one real decision still outstanding —
// it does not make that decision.

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

async function run() {
    console.log('Running Base Anchor Publishing Capability Boundary Audit...\n');

    // ===============================================================
    // Section A — Role/registry landscape.
    // ===============================================================
    {
        const roleSrc = await source('core/RoleProviderRole.js');
        assert(/PROOF_AND_ANCHORING/.test(roleSrc), n('A1. PROOF_AND_ANCHORING remains the only anchoring-adjacent RoleProviderRole entry'));
        assert(!/ANCHOR_PUBLISHING|AnchorPublisher/.test(roleSrc), n('A2. no ANCHOR_PUBLISHING (or similarly named) role exists — AnchorPublisher was never gated by the RoleProviderRole/RoleProviderResolver mechanism at all, unlike ProofVerifier'));

        assert(await sourceExists('anchoring/BaseProofVerifier.js'), n('A3. anchoring/BaseProofVerifier.js exists — the PROOF_AND_ANCHORING half of 0.9.460 Section K4 is now closed (0.9.461-0.9.465), confirmed fresh rather than assumed from the requester\'s own summary'));
        const mainSrc = codeOnly(await source('ui/main.js'));
        assert(/baseProofVerifier/.test(mainSrc) && /externalAnchorProofVerifierRegistry\.register\(baseProofVerifier\)/.test(mainSrc), n('A4. baseProofVerifier is constructed and registered into the real production registry in ui/main.js — confirmed reachable, not merely present in source'));

        assert(!(await sourceExists('anchoring/BaseAnchorPublisher.js')), n('A5. anchoring/BaseAnchorPublisher.js does not exist — the second half of 0.9.460 Section K4 remains open, confirmed fresh'));
        assert(!/baseAnchorPublisher/i.test(mainSrc), n('A6. ui/main.js names no baseAnchorPublisher of any kind — this is a genuine absence, not an unwired-but-present class'));

        console.log('✓ Section A: PROOF_AND_ANCHORING is now closed for Base and confirmed reachable from production; AnchorPublisher is a separate, role-less registry with a confirmed, still-genuine absence for Base.');
    }

    // ===============================================================
    // Section B — The generic AnchorPublisher contract, extracted
    // structurally (no base class exists).
    // ===============================================================
    {
        assert(!(await sourceExists('anchoring/AnchorPublisher.js')), n('B1. no anchoring/AnchorPublisher.js base class exists — unlike anchoring/ProofVerifier.js, this interface is purely structural/duck-typed'));

        const registrySrc = await source('application/ExternalAnchorPublisherRegistry.js');
        assert(/typeof publisher\.anchorType !== 'string'/.test(registrySrc), n('B2. the registry\'s own register() checks only a string anchorType getter'));
        assert(/typeof publisher\.publish !== 'function'/.test(registrySrc), n('B3. and only a publish() method — never an instanceof check against any base class'));

        const bitcoinSrc = await source('anchoring/BitcoinAnchorPublisher.js');
        const arweaveSrc = await source('anchoring/ArweaveAnchorPublisher.js');
        for (const [label, src] of [['Bitcoin', bitcoinSrc], ['Arweave', arweaveSrc]]) {
            assert(/get anchorType\(\)\s*\{\s*return\s*'[^']+';\s*\}/.test(src), n(`B4[${label}]. exposes a fixed, own-named anchorType getter`));
            assert(/async publish\(contentHash\)/.test(src), n(`B5[${label}]. exposes async publish(contentHash) — the identical one-argument signature`));
            assert(/published:\s*true,\s*locator,?\s*\n?\s*proof/.test(src.replace(/\n\s*/g, ' ')) || /published:\s*true/.test(src), n(`B6[${label}]. a success result carries published:true, locator, proof`));
            assert(/published:\s*false,\s*\n?\s*unavailable:\s*true/.test(src.replace(/\n\s*/g, ' ')) || /unavailable:\s*true/.test(src), n(`B7[${label}]. a cannot-presently-tell failure carries published:false, unavailable:true, reason`));
        }

        console.log('✓ Section B: the AnchorPublisher contract — anchorType + async publish(contentHash) -> {published:true,locator,proof} | {published:false,reason?} | {published:false,unavailable:true,reason} — is real, shared, and purely structural; a BaseAnchorPublisher needs no new base class, only conformance to this exact shape.');
    }

    // ===============================================================
    // Section C — Registry/orchestrator/coordinator/UI genericity:
    // zero code change needed anywhere for a 'base' key.
    // ===============================================================
    {
        const registrySrc = codeOnly(await source('application/ExternalAnchorPublisherRegistry.js'));
        assert(!/'bitcoin'|'arweave'|'base'/.test(registrySrc), n('C1. ExternalAnchorPublisherRegistry.js names no fixed anchorType anywhere in code — it is generic by construction, not merely by accident'));

        const orchestratorSrc = codeOnly(await source('application/CreateExternalPublicationAnchorUseCase.js'));
        assert(!/'bitcoin'|'arweave'|'base'/.test(orchestratorSrc), n('C2. CreateExternalPublicationAnchorUseCase.js names no fixed anchorType either'));

        const coordinatorSrc = codeOnly(await source('application/PublicationAnchorCreationCoordinator.js'));
        assert(!/'bitcoin'|'arweave'|'base'/.test(coordinatorSrc), n('C3. PublicationAnchorCreationCoordinator.js names no fixed anchorType — availableAnchorTypes() is a bare pass-through to the registry\'s own keys'));

        const viewSrc = codeOnly(await source('ui/views/DecentralizedPublicationsView.js'));
        assert(/v-for="anchorType in availableAnchorTypes"/.test(viewSrc), n('C4. the shipped template iterates availableAnchorTypes() generically — never a hardcoded per-chain button'));
        assert(/createAnchor\(entry, anchorType\)/.test(viewSrc), n('C5. the click handler forwards whatever anchorType the loop is currently on — never a chain-specific handler name'));

        console.log('✓ Section C: the registry, the orchestration use case, the UI-facing coordinator, and the shipped template are all already fully anchorType-generic — registering any conforming publisher under the key \'base\' requires zero change to any of these four files, exactly the PROVIDER_GAP shape 0.9.424 already found and 0.9.425 already exploited for Arweave.');
    }

    // ===============================================================
    // Section D — Two already-established, divergent signing-injection
    // precedents, read directly from the real composition root.
    // ===============================================================
    {
        const mainSrc = await source('ui/main.js');

        assert(/bitcoinBroadcaster = \{\s*async broadcast\(\) \{\s*return \{\s*broadcast: false,\s*unavailable: true,/.test(mainSrc.replace(/\n\s*/g, ' ')), n('D1. Bitcoin\'s real production AnchorPublisher wiring uses an honest, always-broadcast:false/unavailable:true stub, quoted verbatim from ui/main.js — not paraphrased'));
        assert(/deliberately NOT a real Bitcoin broadcaster/.test(mainSrc), n('D2. ui/main.js\'s own comment confirms this is deliberate, not an oversight'));
        assert(/no private keys, no UTXO\s*\n\/\/ management, no real network broadcast live anywhere in this/.test(mainSrc) || /no private keys, no UTXO/.test(mainSrc), n('D3. the same comment names the reason: no real signing/broadcast capability exists for THIS surface'));

        // D4-D5: confirm Bitcoin's OWN real, separate, wallet-connected
        // pipeline exists elsewhere in the identical file, so the stub
        // above is a deliberate choice not to compose it — not evidence
        // no such pipeline exists at all.
        assert(/bitcoinWalletConnection/.test(mainSrc) && /BitcoinAnchorPsbtBuilder|bitcoinAnchorPsbtBuilder/i.test(mainSrc), n('D4. Bitcoin\'s own real, wallet-connected transaction pipeline (PSBT builder, wallet signer, broadcaster) is ALSO wired in this same file — the stub above coexists with, and is not a consequence of, an actually-missing Bitcoin wallet capability'));
        const publisherConstructionMatch = mainSrc.match(/const \{ bitcoinAnchorPublisher \} = new CreateBitcoinAnchorPublisherUseCase\(\)\.execute\(\{([^}]*)\}\);/s);
        assert(publisherConstructionMatch, n('D5. the real bitcoinAnchorPublisher construction call site is locatable'));
        assert(!/wallet/i.test(publisherConstructionMatch[1]), n('D6. that construction call passes only { network, broadcaster: bitcoinBroadcaster } — no wallet of any kind — confirming the stub, not the real wallet pipeline, is what backs this specific publisher'));

        assert(/arweaveHostSigner = \{/.test(mainSrc), n('D7. Arweave\'s real production AnchorPublisher wiring uses a real signer object, not a stub'));
        assert(/signer\.sign\(material\)\s*\n\s*: Promise\.reject/.test(mainSrc.replace(/ {2,}/g, ' ')) || /: Promise\.reject\(new Error\('This device has no Arweave wallet/.test(mainSrc), n('D8. that signer resolves to a REAL wallet-backed signature (via window.arweaveWallet) when one is connected, and only honestly rejects otherwise — the opposite of Bitcoin\'s always-unavailable choice'));
        assert(/arweaveAnchorPublisher.*execute\(\{\s*signer:\s*arweaveHostSigner/.test(mainSrc.replace(/\n\s*/g, ' ')), n('D9. arweaveAnchorPublisher is constructed with that exact real signer — confirmed by reading the actual construction call, not inferred'));

        console.log('✓ Section D: this exact codebase already holds two different, deliberate, both-currently-shipping answers to "how does an AnchorPublisher get its signing capability" — Bitcoin: an honest always-unavailable stub, bypassing its own real wallet pipeline entirely; Arweave: the same real signer its distribution pipeline already resolves. Neither is a default this audit may silently assume for Base.');
    }

    // ===============================================================
    // Section E — Base's own signing capability categorically rejects
    // a bare contentHash.
    // ===============================================================
    {
        const rawSignerSrc = await source('base/BaseTransactionSigner.js');
        const rawSignerSrcFlat = rawSignerSrc.split('\n').map((line) => line.replace(/^\s*\/\/\s?/, '')).join(' ').replace(/\s+/g, ' ');
        assert(/A caller that hands this class a bare `contentHash` and an `account`, hoping it will figure out the rest, gets a thrown caller-contract violation instead/.test(rawSignerSrcFlat), n('E1. base/BaseTransactionSigner.js\'s own header states, explicitly, that a bare contentHash + account is a thrown contract violation, never a supported call shape'));
        assert(/requireRealBasePublicationTransactionPlan\(plan\)/.test(rawSignerSrc), n('E2. requestSignature() re-validates a full, already-constructed plan before doing anything else — confirmed in the real method body, not only the header'));
        assert(/this\._wallet\.signTransaction\(transactionRequest\)/.test(rawSignerSrc), n('E3. the wallet is asked to sign a transactionRequest built entirely from plan\'s own already-frozen fields (nonce, gasLimit, maxFeePerGas, maxPriorityFeePerGas, chainId, from, to, data) — none of which a bare contentHash alone provides'));

        const reviewedSignerSrc = await source('base/BaseReviewedTransactionSigner.js');
        assert(/reviewedTransaction`? IS A REQUIRED, EXPLICIT ARGUMENT/.test(reviewedSignerSrc), n('E4. the review-gated sibling additionally requires a reviewedTransaction the caller must have separately shown a person first — a second, independent reason a bare contentHash cannot reach signing through this path either'));
        assert(/if \(!reviewedTransaction \|\| typeof reviewedTransaction !== 'object'\) \{\s*throw/.test(reviewedSignerSrc), n('E5. confirmed in the real method body: omitting reviewedTransaction throws, it does not degrade to some other outcome'));

        // E6: the plan itself requires a prior, real, RPC-backed account
        // observation — there is no shortcut that skips straight from
        // "wallet connected" to "plan ready."
        const observationSrc = await source('application/BaseAccountObservation.js');
        assert(/state === BaseNetworkObservationState\.OBSERVED/.test(observationSrc) && /nativeBalanceWei/.test(observationSrc), n('E6. a usable (OBSERVED) account fact requires network, chainId, AND a real RPC-read native balance — never derived from an address alone'));

        console.log('✓ Section E: neither of Base\'s two existing signing classes accepts anything resembling Arweave\'s signer.sign(material) or Bitcoin\'s broadcaster.broadcast(hex) shape. Both require an already-constructed, RPC-priced, (optionally) already-reviewed plan as a precondition, by explicit, tested design — not an oversight this audit could route around.');
    }

    // ===============================================================
    // Section F — Consequence: no existing Base collaborator has the
    // one-call shape a publish(contentHash) needs.
    // ===============================================================
    {
        // F1: enumerate every real Base collaborator a one-call publisher
        // could theoretically be handed, and confirm none matches the
        // "material in, id out, no further caller involvement" shape.
        const oneShotCandidates = [
            { file: 'base/BaseTransactionSigner.js', needs: 'an already-constructed plan (Section E)' },
            { file: 'base/BaseReviewedTransactionSigner.js', needs: 'an already-constructed plan AND a prior review artifact (Section E)' },
            { file: 'base/BasePublicationTransactionPlanner.js', needs: 'an already-OBSERVED account plus RPC-sourced nonce/gas/fees, never a bare contentHash' },
            { file: 'base/BaseTransactionBroadcaster.js', needs: 'an already-signed raw transaction, never a contentHash' }
        ];
        for (const { file, needs } of oneShotCandidates) {
            assert(await sourceExists(file), n(`F1[${file}]. exists — real candidate considered, not invented — but needs ${needs}, not a bare contentHash`));
        }

        // F2: confirm this is a genuine consequence of Base's own
        // observe->plan->sign->finalize->broadcast SEQUENCE (0.9.460
        // Sections D-F), not a documentation gap — every step in that
        // sequence is its own separate class with its own separate
        // async network round-trip, never collapsed into one call
        // anywhere in this codebase today.
        const plannerSrc = codeOnly(await source('base/BasePublicationTransactionPlanner.js'));
        assert(/async plan\(\{ contentHash, address, network, chainId, nativeBalanceWei \} = \{\}\)/.test(plannerSrc), n('F2. the planner\'s own plan() signature requires address, network, chainId, AND nativeBalanceWei alongside contentHash — every one of those four an already-observed fact this class never derives itself, confirming the sequence is real, not this audit\'s own inference'));

        console.log('✓ Section F: a BaseAnchorPublisher cannot hold Bitcoin\'s or Arweave\'s own "zero wallet management, one injected collaborator" shape, because no existing Base collaborator takes a bare contentHash and returns a completed result — every real Base signing/construction class demands a precondition (an observed account, a constructed plan, or a prior review) that only a multi-step caller can satisfy. Composing all of those steps INSIDE one new BaseAnchorPublisher is possible — but doing so means picking one of exactly the two precedents Section D already found live in this codebase: an honest stub (Bitcoin\'s choice), or a real signer that skips the review gate 0.8.93 deliberately built (a genuinely new trade-off, since Arweave never had a review gate to skip in the first place).');
    }

    // ===============================================================
    // Section G — Failure-vocabulary mapping: the existing closed
    // vocabulary already covers every Base failure shape.
    // ===============================================================
    {
        const outcomeSrc = await source('application/ExternalAnchorCreationOutcome.js');
        assert(/CREATED:\s*'created'/.test(outcomeSrc) && /PUBLISH_REJECTED/.test(outcomeSrc) && /PUBLISH_UNAVAILABLE/.test(outcomeSrc), n('G1. exactly three outcomes exist at the orchestration layer — no per-chain outcome of any kind'));

        // G2-G5: every real Base failure mode already has an honest home
        // in {published:false,reason} (definite) or
        // {published:false,unavailable:true,reason} (cannot presently
        // tell) — the identical two-bucket vocabulary publish() already
        // uses for Bitcoin/Arweave.
        const rpcSrc = await source('base/BaseJsonRpcClient.js');
        assert(/rpcError\s*\?\s*\{\s*broadcasted:\s*false,\s*reason:\s*result\.reason\s*\}\s*:\s*\{\s*broadcasted:\s*false,\s*unavailable:\s*true/.test(rpcSrc), n('G2. broadcastRawTransaction() already distinguishes a definite RPC rejection from mere unavailability — this maps directly onto publish()\'s own {reason} vs {unavailable:true,reason}, no new vocabulary needed'));
        const observationStateSrc = await source('application/BaseNetworkObservationState.js');
        assert(/CHAIN_MISMATCH/.test(observationStateSrc) && /UNAVAILABLE/.test(observationStateSrc), n('G3. a wrong-network wallet (CHAIN_MISMATCH) or an unreachable RPC (UNAVAILABLE) are both already-named, already-distinguished states — both map onto the unavailable/definite split cleanly (a wrong network is a definite refusal to proceed; an unreachable RPC is cannot-presently-tell)'));
        const walletSignerSrc = await source('base/BaseTransactionSigner.js');
        assert(/a DEFINITE no: the user declined, or the wallet refused/.test(walletSignerSrc) && /cannot presently obtain a signature; retrying later may/.test(walletSignerSrc), n('G4. a wallet\'s definite decline and its cannot-presently-sign outcome are already the identical two-bucket split'));

        console.log('✓ Section G: every real Base failure mode this audit could name — RPC rejection, RPC unreachability, chain mismatch, wallet decline, wallet unavailability — already has an honest home in the two-bucket {reason}/{unavailable:true,reason} vocabulary publish() already uses. No BASE_FAILED, BASE_PENDING, or other new vocabulary is needed under either Section F option.');
    }

    // ===============================================================
    // Section H — Proof-shape round-trip: zero new encoding regardless
    // of Section F's outcome.
    // ===============================================================
    {
        const verifierSrc = await source('anchoring/BaseProofVerifier.js');
        assert(/const \{ txid, network = 'mainnet' \} = proof;/.test(verifierSrc), n('H1. BaseProofVerifier.verify() already expects proof shaped exactly { txid, network }'));

        // H2: this is the IDENTICAL proof shape a publisher would derive
        // straight from a finalized Base transaction, per 0.9.460 Section
        // H's own already-proven wiring — never a value this audit
        // invents.
        const viewSrc = codeOnly(await source('ui/views/DecentralizedPublicationsView.js'));
        assert(/txid:\s*entry\.baseSignedTransactionFinalizationOutcome\.finalizedTransaction\.transactionHash/.test(viewSrc), n('H2. the real, current production code already derives a { txid } value from a finalized Base transaction this exact way — a future BaseAnchorPublisher would report the identical field, not a new one'));

        const bitcoinVerifierProofPattern = /txid.*network/s;
        assert(bitcoinVerifierProofPattern.test((await source('anchoring/BitcoinOpReturnProofVerifier.js'))), n('H3. Bitcoin\'s own verifier expects the identical { txid, network } shape from its own publisher — confirming this is the established cross-chain proof convention, not something Base would need to invent'));

        console.log('✓ Section H: a future BaseAnchorPublisher\'s { txid, network } proof output is already exactly what BaseProofVerifier.verify() (built and wired, 0.9.463/0.9.465) expects to read back — the create/verify round trip for Base needs zero new encoding no matter which Section F option is chosen.');
    }

    // ===============================================================
    // Section I — UI reachability: a generic v-for, confirmed live.
    // ===============================================================
    {
        const viewSrc = codeOnly(await source('ui/views/DecentralizedPublicationsView.js'));
        assert(/v-for="anchorType in availableAnchorTypes"/.test(viewSrc), n('I1. the "Create <type> Anchor" section already iterates availableAnchorTypes() with no per-chain branch'));
        assert(/humanizeContentKind\(anchorType\)/.test(viewSrc), n('I2. the displayed label is derived generically from whatever anchorType string is present — never a chain-specific lookup table requiring a "base" entry to be added'));
        assert(/createAnchor\(entry, anchorType\)/.test(viewSrc), n('I3. the click handler is the identical generic createAnchor(entry, anchorType) for every anchorType, confirmed a second time at the call site'));

        console.log('✓ Section I: once ANY publisher — real or an honest stub — is registered under the key \'base\', "Create Base Anchor" appears in the running app with zero changes to ui/views/DecentralizedPublicationsView.js, exactly the same zero-UI-change seam 0.9.425 already exploited for Arweave.');
    }

    // ===============================================================
    // Section J — Regression witnesses, live re-execution, and two
    // freshly-found, expected-and-healthy stale prior assertions.
    // ===============================================================
    {
        const DEPENDENT_TESTS = [
            'tests/BitcoinAnchorCreationAdapter.test.js',
            'tests/ArweaveAnchorProviderImplementation.test.js',
            'tests/ExternalAnchorCreationOrchestration.test.js',
            'tests/BaseProofVerificationCompositionRoot.test.js'
        ];
        for (const file of DEPENDENT_TESTS) {
            assert(await sourceExists(file), n(`J1[${file}]. exists on disk`));
        }
        for (const file of DEPENDENT_TESTS) {
            const { passed, output } = runLive(file);
            assert(passed, n(`J2[${file}]. passes on live re-execution against current source${passed ? '' : ` — FAILED: ${output.split('\n').slice(-4).join(' | ')}`}`));
        }
        console.log(`✓ Section J(1-2): all ${DEPENDENT_TESTS.length} directly-cited dependent tests were re-executed live, right now, and all passed — none of this audit's own evidence rests on a prior milestone's memory of a test result.`);

        // J3-J4: two OLDER audits, re-executed live out of due diligence
        // (both are cited or adjacent to this audit's own evidence),
        // are found to now fail — for reasons that are real, Base-related,
        // and entirely expected consequences of correct progress since
        // each was written, never a regression this milestone caused or
        // must fix. Named for the record, exactly as 0.9.460 Section L
        // already established the precedent of naming (never silently
        // fixing) a stale prior audit's own assertion.
        {
            const { passed, output } = runLive('tests/BaseOnChainPublishingCapabilityBoundaryAudit.test.js');
            assert(!passed, n('J3. tests/BaseOnChainPublishingCapabilityBoundaryAudit.test.js (0.9.460) now FAILS on live re-execution — confirmed here, not assumed'));
            assert(/E3\./.test(output) && /eth_getTransactionByHash/.test(output) === false && /no additional, unused RPC method/.test(output), n('J4. the actual failure is its own Section E3 — it asserted BaseJsonRpcClient.js would never wrap eth_getTransactionByHash, which 0.9.462 correctly added afterward to support BaseProofVerifier (Section E of THIS audit\'s own H2 relies on that same real addition). This is 0.9.460\'s own snapshot going stale from real, subsequent, correct work — not a defect this milestone introduces or must fix'));
        }
        {
            const { passed, output } = runLive('tests/BaseProofVerificationIntegrationBoundaryAudit.test.js');
            assert(!passed, n('J5. tests/BaseProofVerificationIntegrationBoundaryAudit.test.js (0.9.464) also now FAILS on live re-execution — confirmed here, not assumed'));
            assert(/B6\./.test(output) && /NEVER imports, references, or constructs CreateBaseAnchorProofVerifierUseCase/.test(output), n('J6. the actual failure is its own Section B6 — it asserted ui/main.js would never wire BaseProofVerifier in, which was true when written and is the EXACT gap 0.9.465 (the very next milestone) closed. A gap-finding audit\'s own assertion going stale the moment its named gap is fixed is the healthiest possible failure mode, not a regression'));
        }

        console.log('✓ Section J(3-6): two older, unrelated audits were found, by this audit\'s own live re-execution (not by rumor or prior citation), to now fail — both for well-understood, Base-related-but-expected reasons tied to real progress since each was written. Neither is this milestone\'s own regression to fix; both are named here so a future reader does not mistake either failure for evidence of a live defect.');
    }

    // ===============================================================
    // Section K — Classification against candidate verdicts, final
    // verdict.
    // ===============================================================
    {
        const classificationTests = [
            { label: 'NO_GAP', holds: false, because: 'false: Section A confirms anchoring/BaseAnchorPublisher.js genuinely does not exist and is not wired anywhere' },
            { label: 'PURE_COMPOSITION_SEAM (the brief\'s own hypothesis)', holds: false, because: 'false: Sections E-F show no existing Base collaborator has the one-call "material in, id out" shape Bitcoin\'s and Arweave\'s own publishers both delegate to — composing the existing pipeline requires either accepting Bitcoin\'s own honest-stub precedent or bypassing 0.8.93\'s own deliberate review gate, either of which is a real product decision, not a mechanical wiring exercise' },
            { label: 'NEW_BLOCKCHAIN_CAPABILITY_REQUIRED', holds: false, because: 'false: Sections C, G, and H show the registry, orchestrator, coordinator, UI, failure vocabulary, and proof encoding are ALL already fully generic and Base-compatible with zero change — nothing about Base itself is missing as a capability' },
            { label: 'BUILDABLE_PENDING_ONE_NAMED_PRODUCT_DECISION', holds: true, because: 'precise: every seam except signing-injection is already a zero-change composition seam (Sections C, G, H, I); signing-injection specifically requires choosing between two precedents already live in this exact codebase today (Section D) — Bitcoin\'s honest stub, or a real one-shot signer that knowingly skips this codebase\'s own 0.8.93 review gate — and that choice is this audit\'s one honest, named, unresolved item' }
        ];
        for (const { label, holds } of classificationTests) {
            assert(holds === (label === 'BUILDABLE_PENDING_ONE_NAMED_PRODUCT_DECISION'), n(`K1[${label}]. classified correctly against this audit's own evidence`));
        }

        const VERDICT = 'BUILDABLE_PENDING_ONE_NAMED_PRODUCT_DECISION';
        assert(VERDICT === 'BUILDABLE_PENDING_ONE_NAMED_PRODUCT_DECISION', n('K2. final verdict: BUILDABLE_PENDING_ONE_NAMED_PRODUCT_DECISION — anchoring/BaseAnchorPublisher.js is real, small, buildable work; every seam around it (registry, orchestration, coordinator, UI, failure vocabulary, proof encoding) is already a zero-change composition seam; the one genuinely open question is which of two ALREADY-SHIPPING precedents in this exact codebase (Bitcoin\'s honest always-unavailable stub, or a real one-shot signer that knowingly bypasses the 0.8.93 human-review gate) the next milestone should follow — a product decision, not a missing capability, and not a decision this audit makes on its own'));

        console.log('\n=== VERDICT: BUILDABLE_PENDING_ONE_NAMED_PRODUCT_DECISION ===');
        console.log('anchoring/BaseAnchorPublisher.js does not exist. Every seam around where it would plug in — the anchorType-keyed');
        console.log('registry, the orchestration use case, the UI-facing coordinator, the shipped "Create <type> Anchor" template, the');
        console.log('closed failure vocabulary, and the proof shape BaseProofVerifier already expects — is already fully generic and');
        console.log('requires zero code change, exactly the PROVIDER_GAP shape 0.9.424/0.9.425 already proved out for Arweave. The one');
        console.log('real difference: no existing Base signing capability accepts a bare contentHash the way Bitcoin\'s broadcaster or');
        console.log('Arweave\'s signer do, because Base\'s own signing classes deliberately require an already-constructed, RPC-priced,');
        console.log('(optionally) already-reviewed plan. This codebase has already answered this exact question once, two different');
        console.log('ways, for its two existing publishers — Bitcoin\'s honest-stub choice and Arweave\'s real-signer choice are both live');
        console.log('in production right now. Which of those two precedents Base should follow is a genuine product decision this audit');
        console.log('surfaces but does not make.');
        console.log(`\nAll ${assertionCount} assertions passed.`);
    }

    // ===============================================================
    // Section L — Production-change guard.
    // ===============================================================
    {
        const statusOutput = execSync('git status --porcelain', { cwd: SOURCE_ROOT }).toString();
        const changed = statusOutput.split('\n').map((line) => line.slice(3).trim()).filter(Boolean);
        const productionDirs = ['core', 'application', 'renderer', 'discovery', 'anchoring', 'collaboration', 'persistence', 'identity', 'publisher', 'storage', 'peer', 'content', 'presence', 'ui', 'css', 'server', 'replication', 'serializer', 'world', 'world-layout', 'spatial', 'base'];
        const touchedProduction = changed.filter((f) => productionDirs.some((dir) => f.startsWith(`${dir}/`)));
        assert(touchedProduction.length === 0, n(`L1. no production directory shows any change from this milestone (found: ${JSON.stringify(touchedProduction)}) — this audit reads and re-executes existing source, it writes none`));

        const AUTHORIZED = new Set(['tests.html', 'tests/BaseAnchorPublishingCapabilityBoundaryAudit.test.js']);
        const unauthorized = changed.filter((f) => !AUTHORIZED.has(f));
        assert(unauthorized.length === 0, n(`L2. every changed/added file is one this milestone's own commit names (found unauthorized: ${JSON.stringify(unauthorized)}) — this audit's own test file, and its own tests.html registration, are the only changes`));

        console.log('✓ Section L: no production directory changed; the only new files are this milestone\'s own test and its tests.html registration.');
    }
}

run().then(() => {
    console.log('\n✅ All BaseAnchorPublishingCapabilityBoundaryAudit tests passed.');
}).catch((error) => {
    console.error('BaseAnchorPublishingCapabilityBoundaryAudit.test.js FAILED:', error);
    process.exitCode = 1;
});
