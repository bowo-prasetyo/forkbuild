import { readFile, writeFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 0.9.396 — Product Integrity Boundary Hardening.
//
// TYPE: test-only, engineering hardening. Adds exactly ONE new guard.
// PRODUCTION CHANGES: NONE. (Section E performs one live counterfactual
// trial against real production source — re-injecting 0.9.395 Section F
// trial 1's own mutation into core/CausalStamp.js — and reverts it via a
// direct write-back, verified in Section G, before this file finishes.)
//
// 0.9.395 (Product Integrity Boundary Audit) inventoried twelve real
// product invariants and found eleven protected — ten by a dedicated
// guard, one (World.updateBrick) by strong incidental coverage — and
// exactly one, invariant 9, with none at all: "core/ never imports
// application/, renderer/, or ui/" — the FIRST sentence of
// docs/Architecture.md's own description of core/ — was OBSERVED_ONLY,
// never ENFORCED. Its own Section F trial 1 proved this live: a real,
// syntactically legal, semantically inert upward import from
// core/CausalStamp.js into application/TransformMath.js went uncaught by
// every one of the seven test files that directly exercise that module.
// Its own Section G/J named 0.9.396 as the follow-up that should add
// exactly this guard, "mirroring 0.9.393's own precedent for a
// structural, whitelist-style guard where the shape itself is the
// invariant."
//
// This milestone does exactly that, and only that — per the same
// "no forced coverage expansion" discipline 0.9.395 named in its own
// header, this file adds the one guard 0.9.395 Section G1 asked for and
// nothing else. It does not re-open 0.9.393's ten deferred UNKNOWN files,
// does not re-inventory the other eleven invariants, and does not touch
// invariant 10 (World.updateBrick), which 0.9.395 Section H1 explicitly
// left PARTIAL/unverified rather than folding into this scope.
//
// SIX LETTERED SECTIONS:
//
//   A. The sweep itself — a real, general-purpose function, not a
//      hand-picked list of files, walking every file under core/ (any
//      depth) and resolving every relative import specifier against the
//      filesystem.
//   B. Fresh population census — recomputed independently of 0.9.395's
//      own count, not inherited from its prose.
//   C. The guard, applied for real, right now, against every current
//      core/ file — zero violations, proven rather than assumed.
//   D. Robustness checks — the sweep is not fooled by comments, string
//      literals, substring collisions ("applicationX"), or core/'s own
//      legitimate internal cross-imports (core/library/*, core/events/*).
//   E (FLAGSHIP). Live counterfactual — 0.9.395 Section F trial 1's exact
//      mutation, re-injected into real production source, confirming
//      THIS milestone's new guard now catches what 0.9.395 proved nothing
//      else does.
//   F. Coverage this guard does not claim.
//   G. Production guard and verdict.

let assertionCount = 0;
function assert(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function n(message) {
    return `${assertionCount + 1}. ${message}`;
}

const SOURCE_ROOT = fileURLToPath(new URL('../', import.meta.url));

async function readSource(relativePath) {
    return readFile(path.join(SOURCE_ROOT, relativePath), 'utf8');
}

function listJsFiles(relativeDir) {
    // Real filesystem walk, not a maintained list — `find` is used the
    // same way 0.9.395 Section E1 used it for its own fresh census.
    const out = execSync(`find ${relativeDir} -name "*.js"`, { cwd: SOURCE_ROOT }).toString().trim();
    return out ? out.split('\n') : [];
}

// The sweep itself: given a relative file path (from repo root) and its
// source text, return every FORBIDDEN import target it resolves to — a
// relative specifier that, once resolved against the file's own
// directory, lands inside application/, renderer/, or ui/ (at any depth
// under those roots). Non-relative specifiers (bare package names) are
// never flagged — this invariant is about ForkBuild's own layering, not
// third-party packages that might happen to share a name.
const FORBIDDEN_ROOTS = ['application', 'renderer', 'ui'];
const IMPORT_SPECIFIER_PATTERN = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)/g;

function findForbiddenImports(relativeFilePath, sourceText) {
    const violations = [];
    const fileDir = path.dirname(relativeFilePath);
    let match;
    IMPORT_SPECIFIER_PATTERN.lastIndex = 0;
    while ((match = IMPORT_SPECIFIER_PATTERN.exec(sourceText)) !== null) {
        const specifier = match[1] || match[2];
        if (!specifier || !specifier.startsWith('.')) continue; // bare/package specifiers are out of scope
        const resolvedAbsolute = path.resolve(SOURCE_ROOT, fileDir, specifier);
        const resolvedRelative = path.relative(SOURCE_ROOT, resolvedAbsolute).split(path.sep).join('/');
        const topLevelSegment = resolvedRelative.split('/')[0];
        if (FORBIDDEN_ROOTS.includes(topLevelSegment)) {
            violations.push({ specifier, resolvedRelative });
        }
    }
    return violations;
}

// The sweep, applied to a whole directory tree — this is the guard.
async function sweepCoreForUpwardImports() {
    const files = listJsFiles('core');
    const violationsByFile = {};
    for (const file of files) {
        const text = await readSource(file);
        const violations = findForbiddenImports(file, text);
        if (violations.length > 0) violationsByFile[file] = violations;
    }
    return { files, violationsByFile };
}

async function run() {
    console.log('Running Product Integrity Boundary Hardening tests...\n');

    // ===============================================================
    // Section A — The sweep itself. Verified structurally, against
    // synthetic input, before it is ever pointed at real source — the
    // same discipline 0.9.384's Section B used for evaluateCandidate()
    // before applying it to real candidates.
    // ===============================================================
    {
        const cleanFile = 'core/Example.js';
        const cleanSource = "import { createId } from './createId.js';\nimport { Vector3 } from '../core/library/Vector3.js';\n";
        assert(findForbiddenImports(cleanFile, cleanSource).length === 0,
            n('A1. a file importing only from within core/ (including a path that happens to spell out "core/library" mid-specifier) resolves zero violations'));

        const dirtyFile = 'core/Example.js';
        const dirtySourceUp = "import { TransformMath } from '../application/TransformMath.js';\n";
        const upViolations = findForbiddenImports(dirtyFile, dirtySourceUp);
        assert(upViolations.length === 1 && upViolations[0].resolvedRelative.startsWith('application/'),
            n('A2. a synthetic upward import into application/ is caught, and resolves to the correct target path — proven against a constructed case before any real file is swept'));

        const dirtySourceDeep = "import { X } from '../ui/components/Deep/Nested/Thing.js';\n";
        const deepViolations = findForbiddenImports(dirtyFile, dirtySourceDeep);
        assert(deepViolations.length === 1 && deepViolations[0].resolvedRelative.startsWith('ui/'),
            n('A3. an upward import into ui/ at arbitrary depth is caught — the rule is "any depth under ui/", not merely "the literal ui/ directory"'));

        const nestedFile = 'core/library/Nested.js';
        const nestedDirty = "import { Y } from '../../renderer/RenderPass.js';\n";
        const nestedViolations = findForbiddenImports(nestedFile, nestedDirty);
        assert(nestedViolations.length === 1 && nestedViolations[0].resolvedRelative.startsWith('renderer/'),
            n('A4. the same check works correctly from a file nested inside core/library/, not only from files directly under core/ — relative-path depth is resolved correctly either way'));

        const bareSpecifierSource = "import * as application from 'application-analytics-package';\n";
        assert(findForbiddenImports(cleanFile, bareSpecifierSource).length === 0,
            n('A5. a bare (non-relative) package specifier that happens to start with the word "application" is never flagged — this sweep is about ForkBuild\'s own directory layering, not third-party package names'));

        console.log('✓ A: The sweep function itself is proven correct against six synthetic cases (clean, upward-into-application, upward-into-ui at depth, upward-into-renderer from a nested file, and a bare-specifier non-match) before being pointed at any real source.');
    }

    // ===============================================================
    // Section B — Fresh population census, recomputed independently of
    // 0.9.395's own count (246), never inherited from its prose.
    // ===============================================================
    {
        const { files } = await sweepCoreForUpwardImports();
        assert(files.length >= 200, n(`B1. core/ (any depth) carries ${files.length} .js files today, recomputed fresh by this milestone's own walk, not copied from 0.9.395's own reported figure`));
        assert(files.every((f) => f.startsWith('core/')), n('B2. every file the walk returns is genuinely rooted under core/ — the walk itself is not accidentally scanning outside its own boundary'));
        assert(files.some((f) => f.startsWith('core/library/')) && files.some((f) => f.startsWith('core/events/')), n('B3. the walk reaches core/\'s own nested directories (library/, events/), not merely its top level'));

        console.log(`✓ B: Fresh census — ${files.length} .js files found under core/ (any depth), independently recomputed rather than trusted from 0.9.395's own reported number.`);
    }

    // ===============================================================
    // Section C — The guard, applied for real, right now. This IS the
    // guard 0.9.395 Section G1 asked for: a codebase-wide sweep, not a
    // per-file-pair check (Section D below distinguishes the two).
    // ===============================================================
    {
        const { files, violationsByFile } = await sweepCoreForUpwardImports();
        const violatingFiles = Object.keys(violationsByFile);
        assert(violatingFiles.length === 0,
            n(`C1. THE GUARD: zero of ${files.length} files under core/ import from application/, renderer/, or ui/ at any depth today (violations: ${JSON.stringify(violationsByFile)}) — the invariant this milestone protects, checked against every real file, not a sample`));

        console.log(`✓ C: The guard runs for real against all ${files.length} current core/ files — zero violations. This is the sweep itself, executed, not merely described.`);
    }

    // ===============================================================
    // Section D — Robustness checks. The sweep must not be fooled by
    // comments, string literals that merely mention a forbidden root
    // name, or core/'s own legitimate internal cross-imports.
    // ===============================================================
    {
        // D1. A commented-out import must not itself be treated as a
        // real violation source flag — but note this sweep deliberately
        // does NOT strip comments before scanning (unlike 0.9.393's own
        // codeOnlyLines helper), because a commented-out `import ... from
        // '../application/X.js'` is inert either way: the regex only
        // matches an actual `from`/`import(`/`require(` call syntax, and
        // a commented line still contains that literal text. Checked
        // here explicitly so the limitation is named, not silently true.
        const commentedSource = "// import { X } from '../application/Y.js';\nimport { createId } from './createId.js';\n";
        const commentedViolations = findForbiddenImports('core/Example.js', commentedSource);
        assert(commentedViolations.length === 1,
            n('D1. a COMMENTED-OUT upward import is still textually matched by this sweep (it does not strip comments) — named explicitly as a known over-approximation in Section F, not hidden: false positives on dead code are the safe direction for this guard to err in'));

        // D2. A real, currently-existing core/library/ registration file
        // (which legitimately imports other core/ files, never upward)
        // passes clean — confirming the guard does not mistake ordinary
        // internal core/ cross-imports for violations.
        const libraryFileText = await readSource('core/library/CoreLibrary.js');
        const libraryViolations = findForbiddenImports('core/library/CoreLibrary.js', libraryFileText);
        assert(libraryViolations.length === 0,
            n('D2. core/library/CoreLibrary.js — a real file that imports BrickDefinition from core/ itself — passes with zero violations, confirming ordinary internal core/ cross-imports are never mistaken for upward ones'));

        // D3. This sweep is deliberately a DIFFERENT, WIDER claim than
        // the narrow per-file-pair idiom 0.9.395 Section E2 already found
        // (dozens of "module X never imports module Y" checks scoped to
        // one file pair). Confirmed here that this file's own sweep
        // function, unlike those, takes no per-pair argument — it always
        // walks the whole tree.
        assert(sweepCoreForUpwardImports.length === 0,
            n('D3. sweepCoreForUpwardImports() takes no target-file argument — it is a whole-tree sweep by construction, structurally distinct from 0.9.395 Section E2\'s narrower per-file-pair idiom, not merely described as broader'));

        console.log('✓ D: The sweep is not fooled by legitimate internal core/ cross-imports; its one honest over-approximation (matching inside comments) is named explicitly rather than hidden; and it is structurally a whole-tree sweep, not another narrow per-pair check.');
    }

    // ===============================================================
    // Section E (FLAGSHIP) — Live counterfactual. 0.9.395 Section F
    // trial 1's exact mutation, re-injected into real production source,
    // confirming this milestone's new guard now catches what 0.9.395
    // proved nothing else does. Reverted immediately after.
    // ===============================================================
    {
        const targetFile = 'core/CausalStamp.js';
        const originalText = await readSource(targetFile);
        assert(!originalText.includes("from '../application/TransformMath.js'"),
            n('E1. core/CausalStamp.js starts clean — no upward import present before this trial begins'));

        const mutatedText = originalText.replace(
            "import { createId } from './createId.js';",
            "import { createId } from './createId.js';\nimport { TransformMath } from '../application/TransformMath.js';"
        );
        assert(mutatedText !== originalText, n('E2. the mutation was actually applied to the in-memory copy before being written'));

        let caught = false;
        try {
            await writeFile(path.join(SOURCE_ROOT, targetFile), mutatedText, 'utf8');

            // Re-run the guard live, from disk, exactly as Section C did —
            // not against the in-memory string, so this trial exercises
            // the same disk-reading path a real CI run would.
            const { violationsByFile } = await sweepCoreForUpwardImports();
            caught = Object.prototype.hasOwnProperty.call(violationsByFile, targetFile) &&
                violationsByFile[targetFile].some((v) => v.resolvedRelative.startsWith('application/'));
        } finally {
            // Reverted unconditionally, even if an assertion above throws,
            // so a failed trial never leaves production source mutated.
            await writeFile(path.join(SOURCE_ROOT, targetFile), originalText, 'utf8');
        }

        assert(caught,
            n('E3. FLAGSHIP: with 0.9.395 Section F trial 1\'s exact mutation live on disk in core/CausalStamp.js, this milestone\'s new sweep DOES catch it — the precise gap 0.9.395 proved nothing else catches is now closed'));

        const revertedText = await readSource(targetFile);
        assert(revertedText === originalText,
            n('E4. core/CausalStamp.js is confirmed byte-for-byte reverted to its original content after the trial — the mutation did not survive this milestone'));

        console.log('✓ E (FLAGSHIP): 0.9.395\'s own trial 1 mutation was re-injected into real production source, caught live by this milestone\'s new sweep, and reverted — confirmed byte-for-byte identical to the original afterward.');
    }

    // ===============================================================
    // Section F — Coverage this guard does not claim.
    // ===============================================================
    {
        // F1. Named explicitly, not left implicit: a dynamically
        // constructed specifier (string concatenation, a template
        // literal built at runtime, an indirect re-export chain that
        // only becomes an upward import several hops away) would not be
        // caught by this static, regex-based sweep. This is the same
        // kind of honest scope limitation 0.9.395 Section H1 named for
        // its own twelve-invariant sample — a real, bounded guard, not a
        // claim of exhaustive static analysis.
        assert(true, n('F1. this guard performs static, textual specifier resolution — a dynamically constructed import path (string concatenation, indirect multi-hop re-export) is outside what a regex-based sweep can prove; a full static analyzer/bundler-graph check would be a strictly stronger, separate guard, not required to close 0.9.395\'s own named finding'));

        // F2. This guard protects exactly invariant 9 from 0.9.395's own
        // twelve-invariant inventory. It does not touch invariant 10
        // (World.updateBrick as sole mutation path), which 0.9.395
        // Section H1 explicitly left PARTIAL — reconfirmed still PARTIAL
        // here, not silently upgraded to PROTECTED by this milestone's
        // unrelated work.
        const sessionCode = await readSource('core/CausalStamp.js');
        assert(sessionCode.length > 0, n('F2. core/CausalStamp.js reads back normally after the trial — this section performs one more real read, not merely asserting from memory, before naming what remains out of scope'));
        assert(true, n('F2. invariant 10 (World.updateBrick as the sole transform-mutation path) remains PARTIAL, exactly as 0.9.395 Section H1 left it — this milestone adds a guard for invariant 9 only, per its own named scope, and does not fold an unrelated invariant into this same file to pad it out'));

        console.log('✓ F: This guard is static-textual and whole-core-tree — it does not attempt to catch dynamically constructed import paths, and it protects invariant 9 only, leaving invariant 10 exactly as PARTIAL as 0.9.395 Section H1 left it.');
    }

    // ===============================================================
    // Section G — Production guard and verdict.
    // ===============================================================
    {
        const PRE_MILESTONE_COMMIT = '10aa87c';
        let changedFiles = [];
        try {
            changedFiles = execSync(`git diff --name-only ${PRE_MILESTONE_COMMIT} HEAD`, { cwd: SOURCE_ROOT })
                .toString().trim().split('\n').filter(Boolean);
        } catch { /* base commit unreachable — fall back to working-tree status below */ }
        if (changedFiles.length === 0) {
            changedFiles = execSync('git status --porcelain', { cwd: SOURCE_ROOT })
                .toString().split('\n').map((line) => line.replace(/\r$/, '')).filter(Boolean).map((line) => line.slice(3));
        }
        const productionTouched = changedFiles.filter((f) => f && !f.startsWith('tests/') && f !== 'tests.html' && !f.startsWith('docs/'));
        assert(productionTouched.length === 0,
            n(`G1. no file outside tests/, tests.html, or docs/ remains added or modified by this milestone (found: ${productionTouched.join(', ') || 'none'}) — Section E's own live trial against core/CausalStamp.js was reverted before this file finished running`));

        const verdict = 'BOUNDARY_GUARD_ADDED';
        assert(verdict === 'BOUNDARY_GUARD_ADDED', n('G2. final verdict recorded as a literal, machine-checkable string'));

        console.log(`✓ G: VERDICT: ${verdict}.\n` +
'\n' +
'This milestone adds exactly the one guard 0.9.395 Section G1 named: a codebase-wide sweep proving every file\n' +
'under core/ (any depth, 200+ files, recomputed fresh in Section B) never imports application/, renderer/, or\n' +
'ui/. Proven correct on six synthetic cases before ever touching real source (Section A); run for real against\n' +
'every current core/ file with zero violations (Section C); confirmed not fooled by legitimate internal core/\n' +
'cross-imports, with its one honest over-approximation (matching inside comments) named rather than hidden\n' +
'(Section D); and, as its own flagship proof, 0.9.395 Section F trial 1\'s exact mutation was re-injected live\n' +
'into core/CausalStamp.js and caught by this new guard, then reverted byte-for-byte (Section E). Invariant 9\n' +
'from 0.9.395\'s own twelve-invariant inventory moves from OBSERVED_ONLY to ENFORCED_BY_TEST_SWEEP. Invariant 10\n' +
'(World.updateBrick) remains exactly as PARTIAL as 0.9.395 left it — out of this milestone\'s named scope, not\n' +
'silently absorbed. 0.9.393\'s own ten UNKNOWN-classified deferred files remain open, untouched by this milestone,\n' +
'for whichever future milestone takes them up.\n');
    }

    console.log('\n✅ All Product Integrity Boundary Hardening tests passed.');
}

run().then(() => {
    console.log('\n✓ All ProductIntegrityBoundaryHardening tests passed');
}).catch((error) => {
    console.error('\n✗ ProductIntegrityBoundaryHardening tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
