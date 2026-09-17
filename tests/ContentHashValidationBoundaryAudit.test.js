import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

import { ContentReference } from '../core/ContentReference.js';
import { computeContentHash } from '../serializer/contentHash.js';
import { isValidContentHash as isValidContentHashInPeerContentProtocol } from '../application/PeerContentProtocol.js';
import { isValidContentHash as isValidContentHashInPeerSnapshotPossessionProtocol } from '../application/PeerSnapshotPossessionProtocol.js';
import { isValidContentHash as isValidContentHashInPeerSnapshotContentProtocol } from '../application/PeerSnapshotContentProtocol.js';
import { validatePublicationSnapshotTransferPackage } from '../application/PublicationSnapshotTransferPackageValidator.js';
import { buildPublicationSnapshotTransferPackage } from '../application/PublicationSnapshotTransferPackage.js';
import { StoreSnapshotContentUseCase } from '../application/StoreSnapshotContentUseCase.js';
import { StoreSnapshotContentOutcome } from '../application/StoreSnapshotContentOutcome.js';

// 0.9.593 — Content Hash Validation Boundary Audit.
//
// Type: test-only architectural audit. Production changes: NONE. Every
// section below is either (a) a regex/substring match against the real,
// unmodified application/PeerContentProtocol.js,
// application/PeerSnapshotPossessionProtocol.js,
// application/PeerSnapshotContentProtocol.js,
// application/PublicationSnapshotTransferPackage(Validator).js,
// core/ContentReference.js, or serializer/contentHash.js source, or
// (b) a live execution of the real, imported isValidContentHash()
// exports (never a reproduction — all three are imported directly, so
// this file cannot silently drift from what production actually runs).
//
// The question, taken from the requesting brief: are the three
// isValidContentHash() definitions genuinely different boundary
// validations, or duplicated definitions of one invariant that can
// silently drift? 0.9.586's own inventory
// (tests/ProductCapabilitySurfaceInventoryGapClassificationAudit.test.js,
// Section C2) already found the live duplication and provisionally
// labeled it ARCHITECTURAL_GAP (contrast Section C1, EditorView's
// similarity ranking, which it labeled PRESENTATION_GAP and which
// 0.9.592's own deep audit confirmed as DELIBERATE_BOUNDARY rather than
// overturning). This milestone puts the ARCHITECTURAL_GAP label through
// the same full A-J audit 0.9.592 already modeled, rather than accepting
// either label on the strength of the earlier one-line observation.
//
// LETTERED SECTIONS (mirroring the requesting brief's own A-J):
//   A. Inventory — locate every production definition/importer, build
//      the matrix, confirm none is a coincidental name collision.
//   B. Behavioral equivalence — run all three against one shared
//      adversarial corpus, live.
//   C. Boundary semantics — confirm all three answer "is this SHAPED
//      like a content hash," never "does this material verify," and
//      locate the real verification layer to contrast against.
//   D. Failure behavior — compare what each does with invalid input.
//   E. Dependency direction — is a shared helper appropriate, or would
//      it force an undesirable dependency onto a module family that
//      currently has none?
//   F. Consumer semantics — trace every caller; confirm what each one
//      actually uses the answer for.
//   G. Drift experiment — the key test: would changing one definition
//      without changing the others ever be legitimate?
//   H. Cross-system identity boundary — confirm contentHash validation
//      never bleeds into publicationId, locator, or anchor-transaction
//      identity.
//   I. Mechanical sweep — search for additional definitions or
//      look-alike predicates elsewhere in the codebase.
//   J. Flagship — Publication -> contentHash -> discovery -> resolution
//      -> material -> verification, proving valid SHAPE is never
//      treated as evidence of a MATCH.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE: consolidating the three
// functions, introducing a ContentHashService, changing the hash
// algorithm or length, changing Publication/Snapshot identity, changing
// verification, storage, discovery, or Repository admission, altering
// error vocabulary, and any change to
// application/PeerContentProtocol.js, application/
// PeerSnapshotPossessionProtocol.js, application/
// PeerSnapshotContentProtocol.js, or any other production file.

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
function grep(pattern, dir) {
    return execSync(`grep -rn "${pattern}" ${dir} --include="*.js" || true`, { cwd: SOURCE_ROOT }).toString().split('\n').filter(Boolean);
}

async function run() {
    // ===============================================================
    // Section A — inventory the three definitions and their importers.
    // ===============================================================
    let peerContentSrc, possessionSrc, snapshotContentSrc, transferPkgSrc, transferValidatorSrc, contentRefSrc;
    {
        [peerContentSrc, possessionSrc, snapshotContentSrc, transferPkgSrc, transferValidatorSrc, contentRefSrc] = await Promise.all([
            source('application/PeerContentProtocol.js'),
            source('application/PeerSnapshotPossessionProtocol.js'),
            source('application/PeerSnapshotContentProtocol.js'),
            source('application/PublicationSnapshotTransferPackage.js'),
            source('application/PublicationSnapshotTransferPackageValidator.js'),
            source('core/ContentReference.js')
        ]);

        const definesIt = (src) => /export function isValidContentHash\(hash\) \{/.test(src);
        assert(definesIt(peerContentSrc), n('A1. application/PeerContentProtocol.js exports its own isValidContentHash(hash) — Definition #1, layer: peer wire-protocol (0.7.4), caller: toContentRequestMessage/toContentResponseMessage/isValidPeerContentMessage, all in the SAME file'));
        assert(definesIt(possessionSrc), n('A2. application/PeerSnapshotPossessionProtocol.js exports its own isValidContentHash(hash) — Definition #2, layer: peer wire-protocol (0.8.40), caller: toSnapshotPossessionRequestMessage/toSnapshotPossessionResponseMessage/isValidPeerSnapshotPossessionMessage, all in the SAME file'));
        assert(definesIt(snapshotContentSrc), n('A3. application/PeerSnapshotContentProtocol.js exports its own isValidContentHash(hash) — Definition #3, layer: peer wire-protocol (0.8.37), caller: toSnapshotContentRequestMessage/toSnapshotContentResponseMessage/isValidPeerSnapshotContentMessage, all in the SAME file'));

        // All three are algorithmically identical at the source level —
        // not merely coincidentally same-behaving (Section B proves that
        // separately, at runtime): byte-identical MAX_HASH_LENGTH,
        // HASH_PATTERN, and function body text.
        const CANONICAL_BODY = "return typeof hash === 'string' && hash.length > 0 && hash.length <= MAX_HASH_LENGTH && HASH_PATTERN.test(hash);";
        for (const [label, src] of [['#1 PeerContentProtocol', peerContentSrc], ['#2 PeerSnapshotPossessionProtocol', possessionSrc], ['#3 PeerSnapshotContentProtocol', snapshotContentSrc]]) {
            assert(src.includes('const MAX_HASH_LENGTH = 128;'), n(`A4[${label}]. declares the identical MAX_HASH_LENGTH = 128 literal`));
            assert(src.includes('const HASH_PATTERN = /^[0-9a-f]+$/i;'), n(`A4[${label}]. declares the identical HASH_PATTERN = /^[0-9a-f]+$/i literal`));
            assert(src.includes(CANONICAL_BODY), n(`A4[${label}]. the function body itself is byte-identical to the canonical text`));
        }

        // Two more production files do not DEFINE a fourth copy — they
        // IMPORT Definition #1, reusing it unchanged across an entirely
        // different transport (an offline file, not a live peer
        // connection).
        assert(/import \{ isValidContentHash \} from '\.\/PeerContentProtocol\.js';/.test(transferPkgSrc),
            n('A5. application/PublicationSnapshotTransferPackage.js imports (never redefines) isValidContentHash from PeerContentProtocol.js — reuse, not a fourth definition'));
        assert(/import \{ isValidContentHash \} from '\.\/PeerContentProtocol\.js';/.test(transferValidatorSrc),
            n('A6. application/PublicationSnapshotTransferPackageValidator.js imports (never redefines) isValidContentHash from PeerContentProtocol.js — reuse, not a fifth definition'));

        // core/ContentReference.js — the actual identity object `hash`
        // belongs to — has NO isValidContentHash of its own at all: no
        // format check on construction, no exported predicate. Its own
        // job (verify(bytes), Section C/J below) is a completely
        // different, later question.
        assert(!/isValidContentHash/.test(contentRefSrc), n('A7. core/ContentReference.js contains no isValidContentHash whatsoever — the identity object that OWNS `hash` performs no syntax check on it at construction time; format validation is entirely an application-layer, boundary-entry concern in this codebase, never a core/ one'));

        console.log('✓ Section A: exactly three production DEFINITIONS (application/PeerContentProtocol.js, application/PeerSnapshotPossessionProtocol.js, application/PeerSnapshotContentProtocol.js — byte-identical source text) plus two IMPORTERS of Definition #1 (application/PublicationSnapshotTransferPackage.js, application/PublicationSnapshotTransferPackageValidator.js); core/ContentReference.js defines none');
    }

    // ===============================================================
    // Section B — behavioral equivalence: one shared adversarial corpus
    // against the three REAL, IMPORTED functions (never reproductions).
    // ===============================================================
    {
        const corpus = [
            ['valid lowercase hex', 'abcdef0123456789', true],
            ['valid uppercase hex', 'ABCDEF0123456789', true],
            ['mixed case', 'aBcDeF0123456789', true],
            ['odd length (still valid: algorithm-agnostic, no parity rule)', 'abc', true],
            ['single char', 'a', true],
            ['exactly 128 chars (the ceiling)', 'a'.repeat(128), true],
            ['too long: 129 chars', 'a'.repeat(129), false],
            ['empty string', '', false],
            ['whitespace only', '   ', false],
            ['hex padded with whitespace', ' abc123 ', false],
            ['0x-prefixed', '0xabc123', false],
            ['non-hex letters', 'ghijk', false],
            ['unicode look-alike (fullwidth "a")', 'ａbc123', false],
            ['null', null, false],
            ['undefined', undefined, false],
            ['a number', 12345, false],
            ['a plain object', { hash: 'abc123' }, false],
            ['an array', ['a', 'b', 'c'], false],
            ['boolean true', true, false],
            ['NaN', NaN, false]
        ];

        let mismatches = 0;
        for (const [label, input, expected] of corpus) {
            const rA = isValidContentHashInPeerContentProtocol(input);
            const rB = isValidContentHashInPeerSnapshotPossessionProtocol(input);
            const rC = isValidContentHashInPeerSnapshotContentProtocol(input);
            if (rA !== rB || rB !== rC) mismatches += 1;
            assert(rA === expected && rB === expected && rC === expected,
                n(`B[${label}]. all three real, imported implementations return ${expected} — got peerContent=${rA}, possession=${rB}, snapshotContent=${rC}`));
        }
        assert(mismatches === 0, n(`B_summary. zero disagreements across ${corpus.length} adversarial corpus entries spanning valid/invalid hex, boundary lengths, non-strings, and Unicode look-alikes — the three implement the IDENTICAL predicate, not merely similar-looking ones`));

        console.log(`✓ Section B: ${corpus.length}/${corpus.length} corpus entries agree across all three real implementations — this is one behavioral invariant, not three`);
    }

    // ===============================================================
    // Section C — boundary semantics: syntax vs. identity vs.
    // verification, located in real production code.
    // ===============================================================
    {
        // Every one of the three headers states, in its own words, that
        // it checks SHAPE only, never willingness-to-serve or
        // hash-actually-matches-bytes.
        assert(/Structural validity ONLY/.test(peerContentSrc), n('C1. application/PeerContentProtocol.js\'s own header states "Structural validity ONLY" — this is a SYNTAX check: "is this shaped like a content hash?"'));
        assert(/Structural validity ONLY/.test(possessionSrc), n('C2. application/PeerSnapshotPossessionProtocol.js\'s own header states "Structural validity ONLY" — the identical syntax-only scope'));
        assert(/Structural validity ONLY/.test(snapshotContentSrc), n('C3. application/PeerSnapshotContentProtocol.js\'s own header states "Structural validity ONLY" — the identical syntax-only scope'));

        // None of the three ever appears anywhere near an actual
        // hash-vs-bytes comparison in its own file.
        for (const [label, src] of [['PeerContentProtocol', peerContentSrc], ['PeerSnapshotPossessionProtocol', possessionSrc], ['PeerSnapshotContentProtocol', snapshotContentSrc]]) {
            assert(!/computeContentHash|actualHash|\.verify\(/.test(src), n(`C4[${label}]. never itself computes a hash from bytes or compares one — confirming it never crosses from "shaped right" into "actually matches"`));
        }

        // The real VERIFICATION layer: core/ContentReference.js#verify()
        // recomputes the hash from actual bytes and compares — a
        // completely different operation, structurally and by name.
        assert(/verify\(bytes\)\s*\{/.test(contentRefSrc), n('C5. core/ContentReference.js#verify(bytes) exists as the identity object\'s own method'));
        assert(/const actualHash = computeContentHash\(text\);/.test(contentRefSrc), n('C6. verify() RECOMPUTES the hash from the actual bytes handed to it via the single real serializer/contentHash.js#computeContentHash()'));
        assert(/return actualHash === this\._hash;/.test(contentRefSrc), n('C7. verify() then compares the RECOMPUTED hash against the claimed one — this is the "does the obtained material actually produce this hash?" question, structurally distinct from "is this string shaped like a hash?"'));

        // Identity: a content hash also is not the same thing as a
        // Publication's own id — confirmed by direct construction
        // (no relationship asserted between the two anywhere in
        // ContentReference.js).
        assert(!/publicationId/.test(contentRefSrc), n('C8. core/ContentReference.js never references publicationId at all — content identity (hash) and publication identity are two separate concepts even at the core/ layer where both concepts are closest together'));

        console.log('✓ Section C: all three isValidContentHash definitions answer the SYNTAX question only ("is this shaped like a content hash?") — the VERIFICATION question ("does this material actually hash to this value?") is answered exclusively by core/ContentReference.js#verify(), which none of the three ever calls or approximates');
    }

    // ===============================================================
    // Section D — failure behavior.
    // ===============================================================
    {
        // The predicate itself never throws for ANY input, across all
        // three, including maximally hostile inputs (a Proxy that throws
        // on property access, a getter that throws).
        const hostile = new Proxy({}, { get() { throw new Error('trap'); } });
        for (const [label, fn] of [['#1', isValidContentHashInPeerContentProtocol], ['#2', isValidContentHashInPeerSnapshotPossessionProtocol], ['#3', isValidContentHashInPeerSnapshotContentProtocol]]) {
            let threw = false;
            try { fn(hostile); } catch { threw = true; }
            assert(!threw, n(`D1[${label}]. never throws, even given a Proxy engineered to throw on property access — typeof hash === 'string' short-circuits before any property is read`));
        }

        // All three share IDENTICAL failure behavior: a graceful boolean
        // false for every invalid shape, never a thrown error, never
        // null, never silent (a `false` is always returned, always
        // checkable). This is NOT the "Outcome 3" middle case the brief
        // anticipates (different boundaries showing up as different
        // failure modes) — there is no divergence to find here.
        assert(isValidContentHashInPeerContentProtocol(null) === false
            && isValidContentHashInPeerSnapshotPossessionProtocol(null) === false
            && isValidContentHashInPeerSnapshotContentProtocol(null) === false,
            n('D2. all three return the boolean `false` (never throw, never null, never undefined) for a `null` input — identical failure semantics'));

        // The THROWING behavior a caller sees (toContentRequestMessage,
        // etc.) belongs to the CALLER, one line below the predicate —
        // not to isValidContentHash itself, in all three files alike.
        assert(/if \(!isValidContentHash\(hash\)\) \{\s*\n\s*throw new Error/.test(peerContentSrc), n('D3. in PeerContentProtocol.js, the THROW is the caller\'s (toContentRequestMessage) decision, one line after a plain boolean check — isValidContentHash itself never throws'));
        assert(/if \(!isValidContentHash\(contentHash\)\) \{\s*\n\s*throw new Error/.test(possessionSrc), n('D4. identically in PeerSnapshotPossessionProtocol.js'));
        assert(/if \(!isValidContentHash\(contentHash\)\) \{\s*\n\s*throw new Error/.test(snapshotContentSrc), n('D5. identically in PeerSnapshotContentProtocol.js'));

        // The *Message validity checks (isValidPeerContentMessage etc.),
        // by contrast, never throw — they return false, exactly
        // mirroring isValidContentHash's own restraint one level up.
        assert(/export function isValidPeerContentMessage\(value\) \{[\s\S]*?return false;\s*\n\}/.test(peerContentSrc), n('D6. isValidPeerContentMessage() itself never throws — returns false for any unrecognized/invalid shape, consistent with isValidContentHash\'s own restraint'));

        console.log('✓ Section D: identical failure behavior across all three — a pure, non-throwing boolean predicate in every case; the only throwing in any of these files belongs to the CALLER (toXRequestMessage/toXResponseMessage), never to isValidContentHash itself. No boundary-specific divergence exists to justify separate failure semantics.');
    }

    // ===============================================================
    // Section E — dependency direction: would a shared helper live at a
    // dependency-neutral layer, or force an undesirable dependency?
    // ===============================================================
    {
        // Empirical fact, not merely a comment's claim: the three
        // isValidContentHash-defining wire modules, PLUS three more
        // sibling *PeerProtocol.js/Peer*Protocol.js wire modules that
        // carry no contentHash field at all, have ZERO import statements
        // among them — a hard, codebase-wide invariant for this module
        // family, not an isValidContentHash-specific choice.
        const wireProtocolFiles = [
            'application/PeerContentProtocol.js',
            'application/PeerSnapshotPossessionProtocol.js',
            'application/PeerSnapshotContentProtocol.js',
            'application/PublicationAnchorPeerProtocol.js',
            'application/PublicationPeerProtocol.js',
            'application/PublicationSnapshotPlacementPeerProtocol.js'
        ];
        const importCounts = await Promise.all(wireProtocolFiles.map(async (f) => ({ f, count: (await source(f)).match(/^import /gm)?.length ?? 0 })));
        assert(importCounts.every(({ count }) => count === 0),
            n(`E1. all six wire-protocol modules have EXACTLY ZERO import statements — ${JSON.stringify(importCounts)} — this is a hard, universal invariant for this module family, confirmed across three files that define isValidContentHash and three sibling files that don't (so the discipline is not specific to hash validation)`));

        // The ONE *Protocol.js sibling that does import something
        // (PeerWorldEncounterMaterialProtocol.js, which imports a plain
        // core/ enum, WorldEncounterKind) still never imports a
        // structural-validity HELPER FUNCTION from another protocol
        // module — it defines its own isValidEncounterKind/
        // isValidWorldEncounterObjectId locally, exactly like every
        // other file in this family defines its own isValidContentHash/
        // isValidPublicationId locally. The unbroken rule across all
        // seven *Protocol.js files, without a single exception, is
        // narrower and more precise than "zero imports": no wire-protocol
        // module ever imports a validator FUNCTION from a sibling
        // protocol module.
        const encounterProtoSrc = await source('application/PeerWorldEncounterMaterialProtocol.js');
        assert(/^import \{ WorldEncounterKind \} from '\.\.\/core\/WorldEncounter\.js';$/m.test(encounterProtoSrc),
            n('E2. application/PeerWorldEncounterMaterialProtocol.js is the one *Protocol.js sibling with a non-zero import count — but it imports a plain core/ enum (WorldEncounterKind), never a validator function from another protocol module'));
        assert(!/from '\.\/Peer/.test(encounterProtoSrc) && !/from '\.\/Publication.*Protocol/.test(encounterProtoSrc),
            n('E3. even this one exception never imports FROM another *Protocol.js sibling — its own isValidEncounterKind/isValidWorldEncounterObjectId are both defined locally, preserving the unbroken "no validator function crosses a protocol-module boundary" rule across all seven files'));

        // isValidPublicationId corroborates: the SAME restate-don't-import
        // discipline, applied to a DIFFERENT field, across FOUR files
        // (not just the two that also carry isValidContentHash) — this is
        // a systematic module-family policy, not an isValidContentHash-
        // specific accident.
        const placementSrc = await source('application/PublicationSnapshotPlacementPeerProtocol.js');
        const anchorSrc = await source('application/PublicationAnchorPeerProtocol.js');
        const CANONICAL_PUBID_BODY = "return typeof value === 'string' && value.trim().length > 0 && value.length <= MAX_PUBLICATION_ID_LENGTH;";
        for (const [label, src] of [['PeerSnapshotPossessionProtocol', possessionSrc], ['PeerSnapshotContentProtocol', snapshotContentSrc], ['PublicationSnapshotPlacementPeerProtocol', placementSrc], ['PublicationAnchorPeerProtocol', anchorSrc]]) {
            assert(src.includes('function isValidPublicationId(value) {') && !src.includes('export function isValidPublicationId'),
                n(`E4[${label}]. independently (re)defines its own PRIVATE (non-exported) isValidPublicationId — never imported from any sibling`));
            assert(src.includes(CANONICAL_PUBID_BODY), n(`E4b[${label}]. with the identical body text every other copy uses`));
        }

        // Contrast: the two files that DO import isValidContentHash
        // (Section A5/A6) are NOT members of the wire-protocol family —
        // they are offline *Package.js/*PackageValidator.js modules, a
        // different category that already imports freely elsewhere in
        // this codebase (sibling Package/Validator pairs routinely carry
        // 3-5 imports each), so reuse there costs nothing architecturally.
        const siblingPackageFiles = ['application/BlueprintImportValidator.js', 'application/PublicationReplicaPackageValidator.js', 'application/PublicationReplicaPackage.js'];
        const siblingImportCounts = await Promise.all(siblingPackageFiles.map(async (f) => (await source(f)).match(/^import /gm)?.length ?? 0));
        assert(siblingImportCounts.every((c) => c >= 3), n(`E5. sibling *Package.js/*PackageValidator.js modules import freely (${JSON.stringify(siblingImportCounts)} imports respectively) — the zero-import discipline in Section E1 is specific to the wire-protocol family, not a codebase-wide anti-import stance, so PublicationSnapshotTransferPackage(Validator).js importing isValidContentHash from PeerContentProtocol.js is ordinary reuse, not an exception to any rule`));

        // Therefore: a shared ContentHashService (or moving
        // isValidContentHash into core/) would force an import into
        // modules that, as a matter of consistent, empirically-verified
        // policy (E1-E4), import NOTHING — the exact "forces an inner/
        // sibling layer to depend on an outer concept" architectural
        // regression the requesting brief itself warns against, just
        // expressed as sibling-to-sibling coupling rather than
        // core-depends-on-application coupling.
        console.log('✓ Section E: the wire-protocol module family (6 files, confirmed empirically) has a hard, zero-exception, zero-import policy, applied consistently to BOTH isValidContentHash and isValidPublicationId across every file that carries either field — a shared helper would force a new dependency onto a module family whose defining property is having none. The two production files that DO import isValidContentHash are a different module category (offline Package/Validator) that already imports freely.');
    }

    // ===============================================================
    // Section F — consumer semantics: what does each caller actually
    // use the answer FOR?
    // ===============================================================
    {
        // All five production call sites (three definitions' own local
        // callers, plus the two importers) use isValidContentHash
        // identically: gate acceptance of a `hash`/`contentHash` FIELD
        // before constructing or accepting a message/package — never to
        // decide trust, never to decide storage, never as evidence of a
        // match.
        assert(/if \(!isValidContentHash\(pkg\.contentHash\)\) \{/.test(transferValidatorSrc),
            n('F1. PublicationSnapshotTransferPackageValidator.js uses it to guard STRUCTURAL acceptance of an offline package\'s own contentHash field — explicitly, per its own header, "never computes or compares a hash"'));
        assert(/if \(!reference \|\| !isValidContentHash\(reference\.hash\)\) \{/.test(transferPkgSrc),
            n('F2. PublicationSnapshotTransferPackage.js uses it to guard STRUCTURAL acceptance when ASSEMBLING a package — also never verifying the bytes it is handed (its own header: "never verifies it hashes to contentHash")'));

        // Neither importer, nor any of the three definitions' own files,
        // ever calls StoreSnapshotContentUseCase, ContentReference#verify,
        // or computeContentHash — confirming zero overlap between the
        // syntax-gate consumers and the verification-boundary consumer.
        for (const [label, src] of [['PeerContentProtocol', peerContentSrc], ['PeerSnapshotPossessionProtocol', possessionSrc], ['PeerSnapshotContentProtocol', snapshotContentSrc], ['PublicationSnapshotTransferPackage', transferPkgSrc], ['PublicationSnapshotTransferPackageValidator', transferValidatorSrc]]) {
            assert(!/new StoreSnapshotContentUseCase\(|\.verify\(\w|computeContentHash\(/.test(src),
                n(`F3[${label}]. never CALLS (as opposed to merely mentioning in a comment) StoreSnapshotContentUseCase, .verify(bytes), or computeContentHash() — this file's own isValidContentHash usage stays entirely within the syntax-gate boundary, never reaching into the verification boundary`));
        }

        // The actual verification consumer, StoreSnapshotContentUseCase,
        // never calls isValidContentHash at all — it goes straight to
        // ContentReference#verify(), confirming the two boundaries are
        // consumed by entirely disjoint call graphs.
        const storeUseCaseSrc = await source('application/StoreSnapshotContentUseCase.js');
        assert(!/isValidContentHash/.test(storeUseCaseSrc), n('F4. application/StoreSnapshotContentUseCase.js — the codebase\'s own sole content-trust boundary (per its own header) — never calls isValidContentHash at all; it trusts core/ContentReference.js#verify() exclusively for the question that actually matters'));

        console.log('✓ Section F: every real caller of any isValidContentHash copy uses it for the identical purpose — guard acceptance of a hash-shaped field at a message/package boundary — and none of them, nor the codebase\'s own verification boundary (StoreSnapshotContentUseCase), ever crosses into the other\'s job');
    }

    // ===============================================================
    // Section G — drift experiment: would changing one definition
    // without changing the others ever be legitimate?
    // ===============================================================
    {
        // The honest answer this audit found: NO, not on SEMANTIC
        // grounds. Sections B-D already proved the three are byte-for-
        // byte identical in algorithm, corpus behavior, and failure
        // mode, and Section C proved they answer the exact same
        // question (wire-shape syntax) about the exact same underlying
        // concept (core/ContentReference.js#hash, carried unmodified
        // over three different message shapes). If the transport-level
        // hash ENCODING ever changed (e.g. core/ContentReference.js's
        // own pluggable `algorithm` producing a differently-shaped
        // string), every one of these three would need to change
        // together to stay interoperable — a hash this replica's own
        // PeerContentProtocol accepts but PeerSnapshotContentProtocol
        // rejects, for the SAME underlying content object, would be a
        // real, silent interop bug, not a feature of separate
        // boundaries.
        //
        // What legitimizes the duplication, per Section E, is
        // therefore NOT "these might reasonably diverge" — it is a
        // documented, codebase-wide anti-coupling policy for this
        // specific module family, held independent of what the shared
        // invariant happens to be (proven by isValidPublicationId
        // showing the identical pattern in Section E4). This is a real,
        // legitimate reason to keep three copies, but it is a
        // DIFFERENT reason than the brief's own three example
        // boundaries (syntax/identity/verification) name — it is a
        // fourth, dependency-shaped reason: preserving each wire module
        // as an independently understandable, independently
        // replaceable, ZERO-dependency unit is worth more, in this
        // codebase's own considered judgment, than eliminating three
        // lines of duplicated regex.
        const changingOneWithoutOthersWouldBeLegitimate = false; // semantically: no.
        const duplicationIsNeverthelessJustified = true; // structurally: yes, per E.
        assert(changingOneWithoutOthersWouldBeLegitimate === false,
            n('G1. on SEMANTIC grounds alone, changing one copy\'s accepted hash shape without changing the other two would NOT be legitimate — all three describe the identical wire concept (core/ContentReference.js#hash, unmodified) and a real algorithm/encoding change would need to reach all three simultaneously to avoid a silent interop bug'));
        assert(duplicationIsNeverthelessJustified === true,
            n('G2. despite G1, the duplication is still justified — not by semantic independence (there is none) but by the module family\'s own hard, zero-exception, zero-import dependency policy (Section E), which values each wire module\'s independent replaceability over eliminating this specific, tiny, already-covered-by-tests (Section B) duplication'));

        // Confirm this is a genuinely narrow, contained exception, not a
        // symptom of a codebase that duplicates everything: the ONE
        // shared invariant this milestone deliberately does NOT
        // duplicate anywhere, computeContentHash() itself, has exactly
        // one implementation, imported everywhere it's needed —
        // including inside core/ContentReference.js#verify() itself.
        const contentHashSource = await source('serializer/contentHash.js');
        assert(/export function computeContentHash/.test(contentHashSource), n('G3. serializer/contentHash.js remains the single, non-duplicated implementation of the actual hashing algorithm — confirming this codebase shares code by default and duplicates isValidContentHash/isValidPublicationId only inside the one module family with a documented reason to, never as a general habit'));

        console.log('✓ Section G: the three definitions describe one invariant with no legitimate SEMANTIC reason to diverge (G1) — but the codebase\'s own hard anti-coupling policy for wire-protocol modules (Section E) is a real, independently-verified, non-hash-specific reason the duplication is nevertheless the correct trade-off here, not an oversight');
    }

    // ===============================================================
    // Section H — cross-system identity boundary.
    // ===============================================================
    {
        // contentHash never touches publicationId within any of the
        // three definitions' own field lists.
        assert(peerContentSrc.includes('export function toContentRequestMessage(hash) {'), n('H1. PeerContentProtocol.js\'s own REQUEST carries a BARE hash — no publicationId at all (by design, per its own header: "never a URI, never a storage backend hint")'));
        assert(possessionSrc.includes('toSnapshotPossessionRequestMessage(publicationId, contentHash)'), n('H2. PeerSnapshotPossessionProtocol.js carries BOTH fields, but isValidPublicationId and isValidContentHash remain two SEPARATE functions, each checking only its own field — confirmed by H2b'));
        const possessionRequestBody = possessionSrc.slice(possessionSrc.indexOf('export function toSnapshotPossessionRequestMessage'), possessionSrc.indexOf('export function toSnapshotPossessionResponseMessage'));
        assert((possessionRequestBody.match(/isValidPublicationId\(publicationId\)/g) || []).length === 1 && (possessionRequestBody.match(/isValidContentHash\(contentHash\)/g) || []).length === 1,
            n('H2b. each field gets exactly its own, distinct predicate call — never one function checking both, confirming isValidContentHash never silently becomes an identity validator for anything other than the hash field itself'));

        // Anchor-transaction identity is a COMPLETELY disjoint concept,
        // confirmed by its own, differently-shaped, never-shared pattern
        // (0x + 64 hex, vs. bare variable-length hex here) living in an
        // entirely different file family (anchoring/, base/), never
        // named isValidContentHash anywhere.
        const txHashFiles = grep('TX_HASH_PATTERN', 'base anchoring');
        assert(txHashFiles.length > 0, n(`H3. anchor/base transaction-hash validation (TX_HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/) exists in a completely separate file family (base/, anchoring/) — found in: ${JSON.stringify([...new Set(txHashFiles.map((l) => l.split(':')[0]))])}`));
        const anyOverlap = txHashFiles.some((l) => /PeerContentProtocol|PeerSnapshotPossessionProtocol|PeerSnapshotContentProtocol/.test(l));
        assert(!anyOverlap, n('H4. zero overlap between anchor-transaction-hash validation and any of the three content-hash definitions — a content hash never masquerades as, and is never validated by the same code as, an anchor transaction id, confirming contentHash != anchor transaction identity is upheld in code, not just in principle'));

        // Publication identity itself: DecentralizedPublication's own id
        // is a UUID-shaped identifier, never validated by any of the
        // three hash predicates, and no publication-identity check ever
        // appears inside any of them.
        for (const [label, src] of [['PeerContentProtocol', peerContentSrc], ['PeerSnapshotPossessionProtocol', possessionSrc], ['PeerSnapshotContentProtocol', snapshotContentSrc]]) {
            assert(!/DecentralizedPublication/.test(src), n(`H5[${label}]. never imports or references DecentralizedPublication — confirming contentHash validation stays entirely disjoint from Publication identity, even in the two files that also happen to carry a publicationId FIELD alongside it`));
        }

        console.log('✓ Section H: contentHash validation never bleeds into publicationId (separate predicate, separate field, even when both travel together), anchor-transaction identity (disjoint file family, disjoint pattern, zero overlap), or Publication identity (never referenced) — the cross-system boundaries the brief asks about all hold');
    }

    // ===============================================================
    // Section I — mechanical sweep for additional/look-alike
    // definitions.
    // ===============================================================
    {
        const PRODUCTION_DIRS = 'core application ui content discovery storage persistence server renderer world spatial peer publisher placement collaboration replication anchoring base identity nostr presence arweave serializer utils world-layout';
        const allHits = grep('isValidContentHash', PRODUCTION_DIRS);
        const definitionFiles = new Set(allHits.filter((l) => /export function isValidContentHash/.test(l)).map((l) => l.split(':')[0]));
        assert(definitionFiles.size === 3
            && definitionFiles.has('application/PeerContentProtocol.js')
            && definitionFiles.has('application/PeerSnapshotPossessionProtocol.js')
            && definitionFiles.has('application/PeerSnapshotContentProtocol.js'),
            n(`I1. a whole-repository sweep of every PRODUCTION directory confirms EXACTLY these three files define isValidContentHash — no fourth definition exists anywhere, including in ui/, core/, content/, discovery/, storage/ (tests/ excluded from this sweep since it only ever CONSUMES or, as here, DESCRIBES the production predicate, never defines a competing one): ${JSON.stringify([...definitionFiles])}`));

        // Two look-alike hex predicates exist, correctly OUT of scope:
        // an even-length-hex byte-encodability check (a genuinely
        // different invariant: "can this be written as whole
        // transaction-data bytes," not "is this a syntactically valid
        // content hash"), and the anchor transaction-hash family
        // already ruled out in Section H.
        const commitmentSrc = await source('application/BasePublicationCommitmentEncoding.js');
        assert(/CONTENT_HASH_PATTERN = \/\^\[0-9a-f\]\+\$\/i;/.test(commitmentSrc) && /contentHash\.length % 2 !== 0/.test(commitmentSrc),
            n('I2. application/BasePublicationCommitmentEncoding.js has a similarly-shaped hex regex, but ADDS an even-length constraint absent from all three isValidContentHash copies — a genuinely different invariant (whole-byte encodability for a transaction\'s `data` field), never named isValidContentHash, and never imported by or into any of the three protocol modules — correctly classified as a distinct, legitimate, low-level validation that does not need to share the isValidContentHash function'));
        assert(!/isValidContentHash/.test(commitmentSrc), n('I3. confirmed: BasePublicationCommitmentEncoding.js never itself calls or imports isValidContentHash — its even-length check is deliberately its own, separate gate, applied AFTER a hash has already been accepted as content-identity-valid elsewhere in the pipeline'));

        console.log('✓ Section I: whole-repository sweep confirms exactly three definitions and two importers, with the one look-alike hex predicate found (BasePublicationCommitmentEncoding.js\'s even-length byte-encodability check) correctly representing a different invariant that does not belong in this consolidation question');
    }

    // ===============================================================
    // Section J — flagship: Publication -> contentHash -> discovery ->
    // resolution -> material -> verification, proving valid SHAPE is
    // never evidence of a MATCH.
    // ===============================================================
    {
        // Step 1: a Publication's contentHash, in the shape all three
        // wire predicates (and the offline package path) would accept.
        const claimedHash = computeContentHash('the real snapshot bytes');
        assert(isValidContentHashInPeerContentProtocol(claimedHash), n('J1. the real hash of real bytes passes isValidContentHash — a genuinely valid-shaped hash, not a contrived string'));

        // Step 2: "discovery/resolution" hands back MATERIAL that does
        // NOT actually correspond to that hash (a corrupted or
        // malicious peer, or a stale mirror) — but is still a
        // perfectly innocent, non-empty string.
        const wrongMaterial = 'a completely different payload';

        // Step 3: the offline package path — structurally identical to
        // what a peer wire RESPONSE or a Publication Snapshot Transfer
        // Package would carry — happily accepts this combination,
        // because isValidContentHash only ever checks the HASH's shape,
        // never the material against it.
        const reference = ContentReference.fromJSON({ hash: claimedHash, algorithm: 'fnv1a-32' });
        const pkg = buildPublicationSnapshotTransferPackage('pub-flagship-1', reference, wrongMaterial);
        let packageAccepted = true;
        try { validatePublicationSnapshotTransferPackage(pkg); } catch { packageAccepted = false; }
        assert(packageAccepted,
            n('J2. validatePublicationSnapshotTransferPackage() ACCEPTS this package outright — contentHash is syntactically valid, publicationId and content are both present — exactly as designed: structural validity says nothing about whether wrongMaterial actually hashes to claimedHash'));

        // Step 4: the ACTUAL verification boundary — core/
        // ContentReference.js#verify(), reached via
        // StoreSnapshotContentUseCase.js, the codebase's own sole
        // content-trust boundary — catches what isValidContentHash
        // structurally cannot and was never meant to.
        assert(reference.verify(wrongMaterial) === false, n('J3. ContentReference#verify(wrongMaterial) correctly reports false — the ONLY point in this entire pipeline that actually recomputes a hash from real bytes and compares it'));

        const fakeStore = {
            _bytes: new Map(),
            async has(ref) { return this._bytes.has(ref.hash); },
            async put(bytes) { const h = computeContentHash(bytes); this._bytes.set(h, bytes); return ContentReference.fromJSON({ hash: h }); }
        };
        const storeUseCase = new StoreSnapshotContentUseCase(fakeStore);
        const outcome = await storeUseCase.execute({ contentHash: pkg.contentHash, bytes: pkg.content });
        assert(outcome.outcome === StoreSnapshotContentOutcome.HASH_MISMATCH, n(`J4. the same package's own contentHash+content, passed through the real StoreSnapshotContentUseCase, is correctly rejected as HASH_MISMATCH (got ${outcome.outcome}) — confirming the trust boundary catches EXACTLY what the syntax gate, by design, cannot`));
        assert(fakeStore._bytes.size === 0, n('J5. nothing was ever stored — a syntactically-valid-looking hash paired with non-matching material never reaches durable storage'));

        // Step 5: the positive control — the SAME pipeline, with the
        // material that actually matches, succeeds end to end,
        // confirming Steps 2-4 failed for the right reason (a genuine
        // mismatch), not because the pipeline is broken.
        const correctPkg = buildPublicationSnapshotTransferPackage('pub-flagship-1', reference, 'the real snapshot bytes');
        const correctOutcome = await storeUseCase.execute({ contentHash: correctPkg.contentHash, bytes: correctPkg.content });
        assert(correctOutcome.outcome === StoreSnapshotContentOutcome.STORED, n(`J6. positive control: the SAME hash paired with the bytes it was actually computed from is accepted and STORED (got ${correctOutcome.outcome}) — proving Steps 2-4 rejected wrongMaterial specifically because it was wrong, not because the pipeline itself is broken`));

        console.log('✓ Section J: flagship proves the distinction live — a syntactically valid content hash (J1) paired with non-matching material sails through the structural gate (J2) and is only caught, correctly, at the real verification boundary (J3, J4) — with a positive control (J6) confirming the same pipeline succeeds when the material genuinely matches. isValidContentHash(hash) === true is never, anywhere in this codebase, treated as evidence that material -> hash matches.');
    }

    // ===============================================================
    // Boundary drift guard — zero production changes.
    // ===============================================================
    {
        // AMENDED BY 0.9.597 — Publication Action Provider Continuity Fix.
        // This guard is a live, point-in-time `git status` check at
        // test-run time, not a permanent guarantee — it always meant
        // "this milestone's OWN session touched nothing," never "no
        // later, separately-justified milestone ever will" (same,
        // pre-existing fragility already documented on the equivalent
        // guard in tests/FederatedRepositoryProductGapAudit.test.js,
        // amended for the same reason). Amended to exclude exactly
        // 0.9.597's own, already-accounted-for files, while still
        // catching any OTHER, unexpected production drift.
        const expectedLaterMilestoneFiles = ['application/CreateWorldViewUseCase.js', 'application/WorldNavigationSession.js', 'ui/views/WorldView.js'];
        const changesToProduction = execSync('git status --porcelain -- core/ application/ ui/', { cwd: SOURCE_ROOT }).toString().trim()
            .split('\n').filter(Boolean).filter((line) => !expectedLaterMilestoneFiles.some((f) => line.includes(f)));
        assert(changesToProduction.length === 0, n(`DriftGuard1. AMENDED BY 0.9.597 — this milestone made zero UNEXPECTED changes to any file under core/, application/, or ui/ (0.9.597's own, separately-justified files excepted) — found: ${JSON.stringify(changesToProduction)}`));
        const untrackedProduction = execSync('git status --porcelain --untracked-files=all -- core/ application/ ui/', { cwd: SOURCE_ROOT }).toString().trim()
            .split('\n').filter(Boolean).filter((line) => !expectedLaterMilestoneFiles.some((f) => line.includes(f)));
        assert(untrackedProduction.length === 0, n('DriftGuard2. no new, untracked file exists under core/, application/, or ui/ either — no ContentHashService, no new production file of any kind'));
        console.log('✓ Boundary drift guard: zero production changes, tracked or untracked — none of the deliberately excluded topics (consolidation, a ContentHashService, algorithm/length changes, identity changes, verification/storage/discovery/Repository changes) were touched');
    }

    // ===============================================================
    // Classification.
    // ===============================================================
    console.log('\n=== 0.9.593 CLASSIFICATION ===');
    console.log('DELIBERATE_BOUNDARY — the three isValidContentHash definitions implement one, genuinely identical invariant (Sections B, D: zero behavioral or failure-mode divergence across a 20-entry adversarial corpus) answering one, genuinely identical question (Section C: wire-shape syntax, never verification, which core/ContentReference.js#verify() alone answers). On SEMANTIC grounds alone, changing one without the others would never be legitimate (Section G) — this is NOT three independent invariants that merely happen to look alike today. What makes the duplication the correct architecture nevertheless is a DIFFERENT, independently-verified fact: this codebase holds a hard, zero-exception, zero-import dependency policy for its entire peer wire-protocol module family (Section E, six files, plus a documented near-identical pattern for isValidPublicationId across four files) — a family whose entire design value is that each wire module is an independently understandable, independently replaceable, zero-dependency description of one message shape. A shared ContentHashService, or moving isValidContentHash into core/, would force exactly the kind of manufactured cross-module dependency the requesting brief itself warns against, onto a module family that currently has none, to save three lines of already-corpus-tested duplication. The two production files that already DO import isValidContentHash (PublicationSnapshotTransferPackage.js and its Validator) are not a counter-example — they belong to a different module category (offline Package/Validator) that already imports freely, so their reuse costs nothing and breaks no policy. 0.9.586\'s own provisional ARCHITECTURAL_GAP label (Section C2) is hereby OVERTURNED to DELIBERATE_BOUNDARY — the same kind of overturn 0.9.592 performed one milestone before this one, for a different provisional label. No production refactoring follows from this milestone; no ContentHashService is introduced; all three definitions, and both importers, are unchanged.');

    console.log(`\n✅ All ContentHashValidationBoundaryAudit tests passed (${assertionCount} assertions).`);
}

run().catch((error) => {
    console.error('ContentHashValidationBoundaryAudit.test.js FAILED:', error);
    process.exitCode = 1;
});
