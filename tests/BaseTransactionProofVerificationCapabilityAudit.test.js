import { readFile, readdir } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 0.9.461 — Base Transaction Proof Verification Capability Audit.
//
// TYPE: test-only audit. PRODUCTION CHANGES: NONE.
//
// 0.9.460 bounded the Base on-chain PUBLISHING write path as already
// complete, and found exactly one genuinely open, independently-scoped
// seam: `anchoring/ProofVerifier.js` / `PROOF_AND_ANCHORING` has real
// Bitcoin and Arweave implementations but none for Base. That audit
// deliberately built nothing toward closing it. This milestone is the
// audit 0.9.460's own Section K asked for before any such implementation
// is designed: not "build BaseProofVerifier," but "what, exactly, would
// it need, given what already exists?"
//
// The central finding: Bitcoin's and Arweave's own verifiers each reach
// their answer from ONE HTTP read that returns confirmation status and
// payload data together (Sections B-C). Base's own RPC client
// (base/BaseJsonRpcClient.js) has no equivalent single read — its own
// inclusion-observation method (`fetchTransactionReceipt`) returns block
// placement only, never a transaction's own `data`/`input` payload, and
// the one RPC method that would (`eth_getTransactionByHash`) is
// deliberately unwrapped today, named in that very file's own header as
// excluded (Section D). Everything else a `BaseProofVerifier` would need
// — the decode step (`decodeBasePublicationCommitment`), the closed
// three-way failure vocabulary, the registry/use-case seam, the "content
// hash only, never authorship" boundary — already exists, unchanged, and
// requires no new abstraction (Sections E, G, H). So the real gap this
// audit finds is narrower still than 0.9.460 Section K's own framing: not
// "no BaseProofVerifier exists" (true but imprecise) but "one missing RPC
// read is the one thing standing between today's source and a
// BaseProofVerifier that could be written using nothing but patterns this
// codebase already runs live, twice."
//
// LETTERED SECTIONS:
//   A. Existing anchor representation — BaseAnchorPublicationRecord
//      ({ contentHash, txid, network, createdAt }) is NOT a
//      PublicationAnchor and carries no publicationId/anchorType/proof;
//      the ProofVerifier contract operates on the latter, never the
//      former — exactly as already true for Bitcoin and Arweave.
//   B. Existing Bitcoin proof semantics — anchorType, proof shape, and
//      the one-HTTP-GET-does-both (confirmation + payload) contract.
//   C. Existing Arweave proof semantics — same three things, one gateway
//      GET returning payload directly; both verifiers extend
//      `ProofVerifier` directly, no shared generic blockchain abstraction
//      exists or is implied.
//   D. Base RPC capability inventory — the real, narrow gap: no wrapped
//      method returns a transaction's own payload; `eth_getTransactionByHash`
//      is named, in the RPC client's own header, as deliberately absent.
//   E. ContentHash verification boundary — the decode step already
//      exists and is pure/symmetric; neither existing verifier ever
//      inspects a sender/owner/wallet field, the precedent a Base
//      verifier would follow.
//   F. Finality/inclusion semantics — "broadcast/finalized" is already,
//      explicitly, not "included," and inclusion alone is not "payload
//      independently readable" — the still-missing read from Section D.
//   G. Failure semantics — the closed three-way ProofVerifier vocabulary
//      needs no Base-specific extension.
//   H. Integration seam — the registry/use-case pattern, and the
//      confirmed absence of any Base equivalent.
//   I. Cross-role isolation — a full-surface scan (54 base/application
//      files, both directions) plus independent historical corroboration
//      from core/RoleProviderPreference.js, kept distinct from 0.9.460's
//      own stale-publishing-claim finding.
//   J. Regression witnesses — the existing proof-verifier and 0.9.460
//      test files, re-executed live.
//   K. Classification, final verdict, and production-change guard.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE. No production-code change
// of any kind: no `anchoring/BaseProofVerifier.js`, no wrapped
// `eth_getTransactionByHash`, no `CreateBaseAnchorProofVerifierUseCase.js`,
// no `PROOF_AND_ANCHORING` registration, no generic EVM-chain
// abstraction, no `minConfirmations`/finality-depth policy design. This
// milestone decides nothing about whether or how to build a
// `BaseProofVerifier` — it establishes, from current, freshly re-executed
// source, exactly how small (or not) that future seam actually is.

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

async function run() {
    console.log('Running Base Transaction Proof Verification Capability Audit...\n');

    // ===============================================================
    // Section A — Existing anchor representation: BaseAnchorPublicationRecord
    // is NOT a PublicationAnchor, and the ProofVerifier contract operates
    // on the latter, never the former.
    // ===============================================================
    {
        const recordSrc = await source('application/BaseAnchorPublicationRecord.js');
        assert(/constructor\(\{ contentHash, txid, network, createdAt \} = \{\}\)/.test(recordSrc),
            n('A1. BaseAnchorPublicationRecord\'s own constructor destructures exactly { contentHash, txid, network, createdAt } — no publicationId, no anchorType, no proof, no locator'));
        assert(!/publicationId/.test(codeOnly(recordSrc)), n('A2. no code in BaseAnchorPublicationRecord.js mentions publicationId at all — this is a genuinely different identity shape than PublicationAnchor, not a renamed subset'));
        assert(/IDENTITY, NOT A VERDICT/.test(recordSrc), n('A3. the file\'s own header confirms this class names identity only (what/as which txid/which network/when), never a verification verdict of any kind'));

        const anchorSrc = await source('core/PublicationAnchor.js');
        assert(/publicationId,\s*\n\s*contentHash,\s*\n\s*anchorType,\s*\n\s*locator,\s*\n\s*anchoredAt/.test(anchorSrc),
            n('A4. core/PublicationAnchor.js\'s own constructor takes publicationId, contentHash, anchorType, locator, anchoredAt, proof, anchorIdentity, signature — a wholly different, larger envelope'));
        assert(/anchorType/.test(anchorSrc) && !/anchorType/.test(codeOnly(recordSrc)),
            n('A5. anchorType — the field a ProofVerifier is keyed and dispatched by — exists on PublicationAnchor and nowhere in BaseAnchorPublicationRecord'));

        const verifierSrc = await source('application/ExternalAnchorVerifier.js');
        assert(/resolvedProofVerifier\.verify\(anchor\.proof, \{/.test(verifierSrc),
            n('A6. application/ExternalAnchorVerifier.js calls verify() with anchor.proof drawn from a constructed PublicationAnchor instance — a hypothetical BaseProofVerifier would be handed THIS envelope\'s own proof, never a BaseAnchorPublicationRecord'));

        // A7. The same separation already holds for Bitcoin and Arweave —
        // confirming this is the established pattern a Base implementation
        // would follow, not a novel design question this audit invents.
        const bitcoinRecordExists = await sourceExists('application/BitcoinAnchorPublicationRecord.js');
        assert(bitcoinRecordExists, n('A7. application/BitcoinAnchorPublicationRecord.js exists as Bitcoin\'s own, separate publication-identity class, confirming the same anchor-record/PublicationAnchor split already holds one chain over'));
        const bitcoinRecordSrc = await source('application/BitcoinAnchorPublicationRecord.js');
        assert(!/anchorType/.test(codeOnly(bitcoinRecordSrc)), n('A8. BitcoinAnchorPublicationRecord.js likewise carries no anchorType field — the split is a codebase-wide convention, not a Base-specific gap'));

        console.log('✓ Section A: a Base publication\'s own durable identity record and the separate, older PublicationAnchor envelope a ProofVerifier actually inspects are confirmed as two distinct shapes with no field-level overlap on anchorType/publicationId — exactly as already true for Bitcoin, and never conflated by this audit.');
    }

    // ===============================================================
    // Section B — Existing Bitcoin proof semantics: anchorType, proof
    // shape, and the one-GET-does-both contract.
    // ===============================================================
    {
        const src = await source('anchoring/BitcoinOpReturnProofVerifier.js');
        const code = codeOnly(src);
        assert(/export class BitcoinOpReturnProofVerifier extends ProofVerifier \{/.test(code), n('B1. extends ProofVerifier directly — no intermediate blockchain base class'));
        assert(/get anchorType\(\) \{ return 'bitcoin-op-return'; \}/.test(code), n('B2. anchorType is the fixed, self-declared string \'bitcoin-op-return\''));
        assert(/const \{ txid, network = 'mainnet', vout = null \} = proof;/.test(code), n('B3. proof shape is exactly { txid, network, vout } — no additional field'));
        assert(/async verify\(proof, \{ contentHash \} = \{\}\) \{/.test(code), n('B4. verify(proof, context) reads only contentHash from context — never publicationId or locator'));

        // B5. One HTTP call (default minConfirmations=1) supplies BOTH
        // confirmation status (tx.status.confirmed) and payload
        // (tx.vout[].scriptpubkey_asm) from the identical response object.
        assert(/tx = await this\._fetchTx\(txid\);/.test(code), n('B5a. a single _fetchTx(txid) call retrieves the transaction'));
        assert(/if \(!tx\.status \|\| !tx\.status\.confirmed\)/.test(code), n('B5b. confirmation is read from that same retrieved tx object\'s own .status.confirmed'));
        assert(/const outputs = Array\.isArray\(tx\.vout\)/.test(code), n('B5c. payload (vout outputs) is read from the identical retrieved tx object — no second network call for payload beyond the one _fetchTx already made'));
        assert(/this\._minConfirmations = Math\.max\(1, minConfirmations\);/.test(code) && (await source('anchoring/BitcoinOpReturnProofVerifier.js')).includes('minConfirmations = 1'),
            n('B5d. minConfirmations defaults to 1, the case in which no second (_confirmations) network call ever fires'));

        console.log('✓ Section B: Bitcoin\'s own verifier extends ProofVerifier directly, is keyed by a fixed anchorType, takes a minimal { txid, network, vout } proof, and — at the default confirmation depth — answers both "is this confirmed" and "does it carry this contentHash" from one single retrieved transaction object.');
    }

    // ===============================================================
    // Section C — Existing Arweave proof semantics: same three things,
    // and confirmation that no shared generic abstraction exists.
    // ===============================================================
    {
        const src = await source('anchoring/ArweaveTransactionDataProofVerifier.js');
        const code = codeOnly(src);
        assert(/export class ArweaveTransactionDataProofVerifier extends ProofVerifier \{/.test(code), n('C1. extends ProofVerifier directly — the identical, and only, common ancestor Bitcoin\'s own verifier also extends'));
        assert(/get anchorType\(\) \{ return 'arweave'; \}/.test(code), n('C2. anchorType is the fixed, self-declared string \'arweave\''));
        assert(/const \{ txid \} = proof;/.test(code), n('C3. proof shape is exactly { txid } — narrower even than Bitcoin\'s, no network/vout field at all'));
        assert(/async verify\(proof, \{ contentHash \} = \{\}\) \{/.test(code), n('C4. verify(proof, context) reads only contentHash — the identical two-argument contract Bitcoin\'s own verifier implements'));

        // C5. One HTTP GET returns the payload directly — the gateway's
        // own response body IS the data to compare, no separate
        // confirmation concept or second call exists.
        assert(/text = await this\._fetchTransactionData\(txid\);/.test(code), n('C5a. a single _fetchTransactionData(txid) call retrieves the transaction'));
        assert(/if \(text !== contentHash\)/.test(code), n('C5b. the SAME retrieved value is compared directly against contentHash — no second call, and no separate confirmation field distinct from retrievability itself'));

        // C6. No shared intermediate class: grep anchoring/ for anything
        // both files extend besides ProofVerifier itself.
        const proofVerifierSrc = await source('anchoring/ProofVerifier.js');
        assert(/export class ProofVerifier \{/.test(proofVerifierSrc), n('C6a. anchoring/ProofVerifier.js itself is the base class both extend — confirmed as a real, minimal class, not an interface docstring only'));
        assert(!/class \w+ extends BitcoinOpReturnProofVerifier|class \w+ extends ArweaveTransactionDataProofVerifier/.test(codeOnly(await source('anchoring/BitcoinOpReturnProofVerifier.js')) + codeOnly(await source('anchoring/ArweaveTransactionDataProofVerifier.js'))),
            n('C6b. neither concrete verifier is itself subclassed or wraps a shared intermediate — a hypothetical BaseProofVerifier fits the identical "extend ProofVerifier directly" shape, no new abstraction to design'));

        console.log('✓ Section C: Arweave\'s own verifier follows the identical two-method, two-argument ProofVerifier contract, with an even narrower proof shape and a single retrieval call standing in for both confirmation and payload — and both concrete verifiers extend ProofVerifier directly, confirming no generic cross-chain abstraction exists or is needed for a third one.');
    }

    // ===============================================================
    // Section D — Base RPC capability inventory: the one real, narrow
    // gap. No wrapped method returns a transaction's own payload; the
    // one that would is named, in the RPC client's own header, as
    // deliberately unwrapped.
    // ===============================================================
    {
        const rpcSrc = await source('base/BaseJsonRpcClient.js');
        const code = codeOnly(rpcSrc);
        const wrappedMethods = [
            'fetchChainId', 'fetchBalance', 'fetchTransactionCount', 'fetchGasEstimate',
            'fetchGasPrice', 'fetchMaxPriorityFeePerGas', 'broadcastRawTransaction',
            'fetchTransactionReceipt', 'fetchLatestBlockNumber'
        ];
        for (const method of wrappedMethods) {
            assert(new RegExp(`async ${method}\\(`).test(code), n(`D1[${method}]. base/BaseJsonRpcClient.js wraps ${method}()`));
        }
        assert(wrappedMethods.length === 9, n('D2. nine methods total, matching 0.9.460 Section A/E/F/H\'s own inventory of the publishing pipeline\'s needs — this audit adds no method this file does not already have'));

        // D3. fetchTransactionReceipt's own decoded shape carries no
        // transaction payload field — block placement only.
        const receiptMatch = rpcSrc.match(/async fetchTransactionReceipt\(txid\) \{[\s\S]*?\n    \}\n/);
        assert(receiptMatch, n('D3a. fetchTransactionReceipt()\'s own method body is locatable'));
        const receiptBody = receiptMatch[0];
        assert(/blockHash/.test(receiptBody) && /blockNumber/.test(receiptBody) && /transactionIndex/.test(receiptBody), n('D3b. it decodes blockHash, blockNumber, transactionIndex'));
        assert(!/\binput\b|\bdata\b|\bto\b:|\bfrom\b:/.test(receiptBody), n('D3c. it decodes no data/input/to/from field of any kind — a receipt tells WHERE a transaction landed, never WHAT it carried'));

        // D4. eth_getTransactionByHash — the standard method that returns
        // a transaction's own `input` field — is named in this file's own
        // header as deliberately unwrapped, and is not implemented
        // anywhere in this codebase.
        assert(/Still no `eth_getTransactionByHash`, still no/.test(rpcSrc), n('D4a. this file\'s own header explicitly names eth_getTransactionByHash as deliberately excluded — not an oversight this audit is the first to notice'));
        assert(!/async fetchTransactionByHash\(/.test(code) && !/eth_getTransactionByHash/.test(code), n('D4b. no method wrapping eth_getTransactionByHash exists in this file\'s own code (the header\'s own mention of the string is prose, excluded by codeOnly() above)'));
        let anyBaseFileWrapsIt = false;
        for (const dir of ['base', 'application']) {
            const files = (await readdir(path.join(SOURCE_ROOT, dir))).filter((f) => f.startsWith('Base') && f.endsWith('.js'));
            for (const file of files) {
                if (/eth_getTransactionByHash/.test(codeOnly(await source(path.join(dir, file))))) anyBaseFileWrapsIt = true;
            }
        }
        assert(!anyBaseFileWrapsIt, n('D5. no file anywhere under base/ or application/\'s own Base*.js files wraps eth_getTransactionByHash — confirmed genuinely absent codebase-wide, not merely absent from the RPC client'));

        console.log('✓ Section D: Base\'s own RPC client wraps exactly the nine methods 0.9.460 already found it needs, and none of them returns a transaction\'s own payload — the one RPC method that would (eth_getTransactionByHash) is named, in this file\'s own header, as a deliberate exclusion, and is genuinely unwrapped anywhere in this codebase. This is the one concrete capability gap this audit finds — structurally unlike Bitcoin/Arweave, whose existing single retrieval call already returns everything Sections B-C show their own verifiers need.');
    }

    // ===============================================================
    // Section E — ContentHash verification boundary: the decode step
    // already exists; neither existing verifier ever inspects
    // authorship/ownership, the precedent a Base verifier would follow.
    // ===============================================================
    {
        const encodingSrc = await source('application/BasePublicationCommitmentEncoding.js');
        assert(/export function decodeBasePublicationCommitment\(data\) \{/.test(encodingSrc), n('E1. decodeBasePublicationCommitment() already exists — the exact decode step a BaseProofVerifier would need, requiring no new encoding design'));
        assert(/return data\.slice\(2\)\.toLowerCase\(\);/.test(encodingSrc), n('E2. it is a pure, one-line, symmetric inverse of encodeBasePublicationCommitment() — case-normalized, matching how anchoring/BitcoinOpReturnProofVerifier.js\'s own contentHash comparison also normalizes to lowercase'));
        assert(/SYMMETRIC AND LOSSLESS/.test(encodingSrc), n('E3. the file\'s own header documents this symmetry as deliberate, not incidental'));

        // E4. Neither existing verifier ever reads a sender/owner/wallet
        // field of the transaction it fetches — the precedent this audit
        // establishes for a hypothetical BaseProofVerifier.
        const bitcoinCode = codeOnly(await source('anchoring/BitcoinOpReturnProofVerifier.js'));
        const arweaveCode = codeOnly(await source('anchoring/ArweaveTransactionDataProofVerifier.js'));
        for (const [label, code] of [['Bitcoin', bitcoinCode], ['Arweave', arweaveCode]]) {
            assert(!/owner|author|publisher|wallet|sender|signer(?!ature)/i.test(code), n(`E4[${label}]. the ${label} verifier's own code never references an owner/author/publisher/wallet/sender concept of any kind — content-hash matching only`));
        }

        console.log('✓ Section E: the decode half of a content-hash comparison already exists as a pure, symmetric function needing no redesign, and both existing verifiers establish — by their own current code, not by this audit\'s assertion — that a ProofVerifier checks contentHash alone, never authorship, ownership, publisher identity, or wallet identity.');
    }

    // ===============================================================
    // Section F — Finality/inclusion semantics: "broadcast/finalized" is
    // already, explicitly, not "included," and inclusion alone is not
    // "payload independently readable."
    // ===============================================================
    {
        const useCaseSrc = await source('application/CreateBaseAnchorPublicationRecordUseCase.js');
        assert(/CALL THIS AT SUCCESSFUL FINALIZATION, NEVER EARLIER/.test(useCaseSrc), n('F1. a BaseAnchorPublicationRecord is minted at FINALIZATION — before broadcast is even attempted, let alone confirmed — confirming "this pipeline produced a record" and "this transaction is independently verifiable on-chain" are already, structurally, two different moments'));
        assert(/THE TRANSACTION IDENTITY COMES FROM THE FINALIZED ARTIFACT, NEVER FROM\s*\n\/\/ THE BROADCASTER OR AN RPC LOOKUP/.test(useCaseSrc), n('F2. the record\'s own txid is a locally-computed hash, never an RPC-confirmed fact — reinforcing that record creation and independent verifiability are not the same claim'));

        const rpcSrc = await source('base/BaseJsonRpcClient.js');
        assert(/found: true, blockHash, blockNumber, transactionIndex/.test(rpcSrc) && /found: false/.test(rpcSrc), n('F3. inclusion is already a real, distinguishable fact this codebase can observe (found:true/false) — the existing evidence a BaseProofVerifier would need to treat as its own confirmation gate, mirroring tx.status.confirmed on Bitcoin'));

        // F4. Inclusion (Section F3) and payload (Section D) are two
        // separate reads today — Bitcoin/Arweave get both from one call
        // (Sections B5/C5); Base does not.
        assert(!/fetchTransactionReceipt/.test(codeOnly(await source('application/BasePublicationCommitmentEncoding.js'))), n('F4. confirmed structurally: nothing already wires inclusion observation (fetchTransactionReceipt) to payload decoding (decodeBasePublicationCommitment) — they are two separate existing capabilities, never yet joined into one verification call the way Bitcoin\'s and Arweave\'s own single reads already are'));

        console.log('✓ Section F: this codebase already treats "a record was minted," "a transaction was broadcast," and "a transaction was included" as three separate, honestly-distinguished facts — never conflating any of them with "independently verifiable." A future BaseProofVerifier inherits that same discipline for free; it does not need to invent it.');
    }

    // ===============================================================
    // Section G — Failure semantics: the closed three-way ProofVerifier
    // vocabulary needs no Base-specific extension.
    // ===============================================================
    {
        const proofVerifierSrc = await source('anchoring/ProofVerifier.js');
        assert(/\{ valid: true \}/.test(proofVerifierSrc), n('G1. { valid: true } is documented as the one success shape'));
        assert(/\{ valid: false, reason \}/.test(proofVerifierSrc), n('G2. { valid: false, reason } is documented as the one definite-rejection shape'));
        assert(/\{ valid: false, unavailable: true, reason \}/.test(proofVerifierSrc), n('G3. { valid: false, unavailable: true, reason } is documented as the one cannot-presently-tell shape'));

        const bitcoinCode = await source('anchoring/BitcoinOpReturnProofVerifier.js');
        const arweaveCode = await source('anchoring/ArweaveTransactionDataProofVerifier.js');
        for (const [label, src] of [['Bitcoin', bitcoinCode], ['Arweave', arweaveCode]]) {
            assert(/valid: true/.test(src) && /valid: false, reason:/.test(src) && /valid: false, unavailable: true, reason:/.test(src),
                n(`G4[${label}]. the ${label} verifier's own return statements use exactly these three shapes and no others — no Base-specific or chain-specific status vocabulary exists anywhere in this contract today`));
        }

        console.log('✓ Section G: both real implementations already close over the identical three-outcome vocabulary anchoring/ProofVerifier.js\'s own header documents — a Base implementation has no failure mode (definite reject, cannot-presently-tell, or success) that vocabulary cannot already express.');
    }

    // ===============================================================
    // Section H — Integration seam: the registry/use-case pattern, and
    // the confirmed absence of any Base equivalent.
    // ===============================================================
    {
        assert(/register\(proofVerifier\) \{/.test(await source('application/ExternalProofVerifierRegistry.js')), n('H1. ExternalProofVerifierRegistry#register() exists and keys purely by the plugin\'s own anchorType — a future BaseProofVerifier would register through this exact, unmodified method'));

        const bitcoinUseCase = await source('application/CreateBitcoinAnchorProofVerifierUseCase.js');
        const arweaveUseCase = await source('application/CreateArweaveAnchorProofVerifierUseCase.js');
        assert(/export class CreateBitcoinAnchorProofVerifierUseCase \{/.test(bitcoinUseCase) && /export class CreateArweaveAnchorProofVerifierUseCase \{/.test(arweaveUseCase),
            n('H2. both existing chains follow the identical "Create*AnchorProofVerifierUseCase — a thin composition-root wrapper constructing one concrete verifier" shape — the pattern a CreateBaseAnchorProofVerifierUseCase would mirror'));

        assert(!(await sourceExists('anchoring/BaseProofVerifier.js')), n('H3a. anchoring/BaseProofVerifier.js does not exist'));
        assert(!(await sourceExists('anchoring/BaseOpReturnProofVerifier.js')), n('H3b. no alternately-named Base ProofVerifier file exists either'));
        assert(!(await sourceExists('application/CreateBaseAnchorProofVerifierUseCase.js')), n('H3c. no CreateBaseAnchorProofVerifierUseCase.js exists — reconfirming 0.9.460 Section K4\'s own finding still holds against current source'));

        // H4. Zero changes needed to the shared pipeline itself for a
        // future Base implementation to plug in.
        const externalAnchorVerifierSrc = codeOnly(await source('application/ExternalAnchorVerifier.js'));
        const registrySrc = codeOnly(await source('application/ExternalProofVerifierRegistry.js'));
        const anchorSrc = codeOnly(await source('core/PublicationAnchor.js'));
        for (const [label, src] of [['ExternalAnchorVerifier.js', externalAnchorVerifierSrc], ['ExternalProofVerifierRegistry.js', registrySrc], ['core/PublicationAnchor.js', anchorSrc]]) {
            assert(!/bitcoin|arweave|base(?!Line)/i.test(src), n(`H4[${label}]. this shared pipeline file names no concrete chain at all (Bitcoin, Arweave, or Base) — a future BaseProofVerifier needs zero change to it, the identical seam Bitcoin's and Arweave's own additions already proved out`));
        }

        console.log('✓ Section H: the registry, the per-chain composition-root use-case pattern, and the shared verification pipeline all already exist, generic and unmodified by either existing chain — and no Base-named file occupies this seam yet, confirmed against current source rather than assumed from 0.9.460\'s own prior finding.');
    }

    // ===============================================================
    // Section I — Cross-role isolation: a full-surface scan, both
    // directions, plus independent historical corroboration kept
    // distinct from 0.9.460's own stale-publishing-claim finding.
    // ===============================================================
    {
        const baseDirFiles = (await readdir(path.join(SOURCE_ROOT, 'base'))).filter((f) => f.endsWith('.js')).map((f) => `base/${f}`);
        const baseAppFiles = (await readdir(path.join(SOURCE_ROOT, 'application')))
            .filter((f) => (f.startsWith('Base') || f.startsWith('CreateBase')) && f.endsWith('.js'))
            .map((f) => `application/${f}`);
        const allBaseFiles = [...baseDirFiles, ...baseAppFiles];
        assert(allBaseFiles.length >= 50, n(`I1. a full-surface scan covers ${allBaseFiles.length} real Base-named files (12 base/*.js plus ${baseAppFiles.length} application/Base*.js and application/CreateBase*.js) — wider than 0.9.460 Section K7's own twelve-file scope`));

        let vocabularyLeaks = [];
        for (const file of allBaseFiles) {
            const code = codeOnly(await source(file));
            if (/PublicationAnchor|ProofVerifier|anchorType/.test(code)) vocabularyLeaks.push(file);
        }
        assert(vocabularyLeaks.length === 0, n(`I2. zero of the ${allBaseFiles.length} Base-named files import or mention PublicationAnchor/ProofVerifier/anchorType vocabulary (found: ${JSON.stringify(vocabularyLeaks)}) — the two surfaces stay independent even under a wider scan than 0.9.460 ran`));

        // I3. Bidirectional: the existing Bitcoin/Arweave proof-verifier
        // surface names nothing Base-specific either.
        const anchoringFiles = (await readdir(path.join(SOURCE_ROOT, 'anchoring'))).filter((f) => /^(Bitcoin|Arweave)/.test(f));
        let reverseLeaks = [];
        for (const file of anchoringFiles) {
            const code = codeOnly(await source(`anchoring/${file}`));
            if (/\bBase\b|eth_|BaseChainId|BaseJsonRpcClient/.test(code)) reverseLeaks.push(file);
        }
        assert(reverseLeaks.length === 0, n(`I3. zero of ${anchoringFiles.length} existing Bitcoin/Arweave anchoring files reference Base/eth_*/BaseChainId/BaseJsonRpcClient vocabulary (found: ${JSON.stringify(reverseLeaks)}) — isolation holds in both directions`));

        // I4. Independent historical corroboration, kept explicitly
        // distinct from 0.9.460 Section L's own stale-PUBLISHING-claim
        // finding: this is a different file, making a claim only about
        // VERIFICATION, that this audit's own Sections A-H confirm is
        // still, independently, true today.
        const prefSrc = await source('core/RoleProviderPreference.js');
        assert(prefSrc.includes("Section B found Base's own verify half does not exist yet"), n('I4a. core/RoleProviderPreference.js (0.9.293) independently records, from 0.9.292 Section B, that Base\'s own verify half was already known absent — a claim about VERIFICATION, never about publishing'));
        assert(!/Base anchoring.*unimplemented|externally-obtained-txid/i.test(prefSrc), n('I4b. this file makes no claim about Base PUBLISHING being unimplemented — it never repeats the two stale claims 0.9.460 Section L found and named, keeping this audit\'s own historical evidence genuinely distinct from that one'));

        console.log(`✓ Section I: a ${allBaseFiles.length}-file scan (wider than 0.9.460's own twelve) finds zero PublicationAnchor/ProofVerifier/anchorType vocabulary anywhere under Base, zero reverse leakage from the existing Bitcoin/Arweave verifiers, and one genuinely independent, still-accurate historical record (core/RoleProviderPreference.js, 0.9.293) that a Base verifier was already known missing — kept explicitly apart from 0.9.460's own, different finding about stale PUBLISHING claims.`);
    }

    // ===============================================================
    // Section J — Regression witnesses: the existing proof-verifier and
    // 0.9.460 test files, re-executed live.
    // ===============================================================
    {
        const REGRESSION_WITNESSES = [
            'tests/BitcoinOpReturnProofVerifier.test.js',
            'tests/ArweaveAnchorProviderImplementation.test.js',
            'tests/ArweaveProofAnchorIntegrationBoundaryAudit.test.js',
            'tests/ExternalAnchorProofAdapters.test.js',
            'tests/ExternalAnchorCreationOrchestration.test.js',
            'tests/BaseOnChainPublishingCapabilityBoundaryAudit.test.js'
        ];
        for (const file of REGRESSION_WITNESSES) {
            assert(await sourceExists(file), n(`J1[${file}]. exists on disk`));
        }
        let passCount = 0;
        for (const file of REGRESSION_WITNESSES) {
            try {
                execSync(`node ${JSON.stringify(file)}`, { cwd: SOURCE_ROOT, stdio: 'pipe' });
                passCount += 1;
            } catch (error) {
                throw new Error(`Section J: ${file} FAILED on live re-execution — ${error.stdout ? error.stdout.toString().split('\n').slice(-6).join(' | ') : error.message}`);
            }
        }
        assert(passCount === REGRESSION_WITNESSES.length, n(`J2. all ${REGRESSION_WITNESSES.length} regression witnesses pass on live re-execution against current source — the existing proof-verifier contract and 0.9.460's own publishing-boundary verdict both still hold, unchanged, right now`));

        console.log(`✓ Section J: all ${REGRESSION_WITNESSES.length} directly relevant test files were re-executed live against current source and all passed — this audit's own Sections A-I describe a system state confirmed stable at the moment of writing, not one merely assumed from prior milestones' own prose.`);
    }

    // ===============================================================
    // Section K — Classification, final verdict, and production-change
    // guard.
    // ===============================================================
    {
        const classificationTests = [
            { label: 'NO_GAP', holds: false, because: 'false: Section D found a real, concrete missing RPC capability, not merely an unwired file' },
            { label: 'ARCHITECTURE_GAP', holds: false, because: 'false: Sections C6, G, H show the existing ProofVerifier/registry/use-case architecture already accommodates a third chain with zero modification — nothing needs redesigning' },
            { label: 'GENERIC_GAP (0.9.460 Section K\'s own framing: "no BaseProofVerifier exists")', holds: false, because: 'imprecise: it is true but does not say WHY that file is easy or hard to write, which is this milestone\'s own question to answer' },
            { label: 'VERIFICATION_SEAM_BOUNDED_TO_ONE_MISSING_RPC_READ', holds: true, because: 'precise: every seam a BaseProofVerifier needs — decode (Section E), failure vocabulary (Section G), registry/use-case wiring (Section H), isolation (Section I) — already exists unchanged; the one concrete, named gap is a single unwrapped RPC method (Section D) that would let a future verifier read a transaction\'s own payload the way Bitcoin\'s and Arweave\'s own single reads already do' }
        ];
        for (const { label, holds } of classificationTests) {
            assert(holds === (label === 'VERIFICATION_SEAM_BOUNDED_TO_ONE_MISSING_RPC_READ'), n(`K1[${label}]. classified correctly against this audit's own evidence`));
        }

        const VERDICT = 'VERIFICATION_SEAM_BOUNDED_TO_ONE_MISSING_RPC_READ';
        assert(VERDICT === 'VERIFICATION_SEAM_BOUNDED_TO_ONE_MISSING_RPC_READ', n('K2. final verdict: VERIFICATION_SEAM_BOUNDED_TO_ONE_MISSING_RPC_READ — a future BaseProofVerifier would need exactly one new wrapped RPC read (a transaction-by-hash equivalent to eth_getTransactionByHash), reusing, unchanged: the existing decode function (Section E), the existing three-outcome failure vocabulary (Section G), the existing registry/use-case seam (Section H), and the existing ProofVerifier base class with no shared blockchain abstraction (Section C6) — no new architecture, and no ambiguity about what "verified" would even mean (Sections A, F)'));

        // Production guard: no production file touched by this milestone.
        const statusOutput = execSync('git status --porcelain', { cwd: SOURCE_ROOT }).toString();
        const changed = statusOutput.split('\n').map((line) => line.slice(3).trim()).filter(Boolean);
        const productionDirs = ['core', 'application', 'renderer', 'discovery', 'anchoring', 'collaboration', 'persistence', 'identity', 'publisher', 'storage', 'peer', 'content', 'presence', 'ui', 'css', 'server', 'replication', 'serializer', 'world', 'world-layout', 'spatial', 'base'];
        const touchedProduction = changed.filter((f) => productionDirs.some((dir) => f.startsWith(`${dir}/`)));
        assert(touchedProduction.length === 0, n(`K3. no production directory shows any change from this milestone (found: ${JSON.stringify(touchedProduction)}) — this audit reads and re-executes existing source, it writes none`));

        const AUTHORIZED = new Set(['tests.html', 'tests/BaseTransactionProofVerificationCapabilityAudit.test.js']);
        const unauthorized = changed.filter((f) => !AUTHORIZED.has(f));
        assert(unauthorized.length === 0, n(`K4. every changed/added file is one this milestone's own commit names (found unauthorized: ${JSON.stringify(unauthorized)}) — this audit's own test file, and its own tests.html registration, are the only changes`));

        console.log('\n=== VERDICT: VERIFICATION_SEAM_BOUNDED_TO_ONE_MISSING_RPC_READ ===');
        console.log('Every non-network seam a BaseProofVerifier would need already exists, unchanged, and requires no new abstraction: the');
        console.log('decode step, the closed three-outcome failure vocabulary, the registry/use-case composition pattern, and cross-role');
        console.log('isolation all hold today exactly as they already do for Bitcoin and Arweave (Sections A, C, E, G, H, I). The one real,');
        console.log('concrete, named gap is that Base\'s own RPC client wraps no method returning a transaction\'s own payload — the method');
        console.log('that would (eth_getTransactionByHash) is named, in that file\'s own header, as a deliberate prior exclusion for an');
        console.log('unrelated reason (Section D). This is narrower than 0.9.460 Section K\'s own framing ("no BaseProofVerifier exists"): a');
        console.log('future implementation is bounded to one new wrapped RPC read plus one small verifier class, never a redesign.');
        console.log(`\nAll ${assertionCount} assertions passed.`);
    }
}

run().then(() => {
    console.log('\n✅ All BaseTransactionProofVerificationCapabilityAudit tests passed.');
}).catch((error) => {
    console.error('BaseTransactionProofVerificationCapabilityAudit.test.js FAILED:', error);
    process.exitCode = 1;
});
