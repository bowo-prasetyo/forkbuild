// Shared regression-guard module — NOT production code. Lives under
// tests/support/ (the same directory that already holds
// MinimalVueCompositionApiShim.js/VueShimLoader.mjs, this codebase's
// existing home for test-only infrastructure shared across multiple test
// files) and is imported only by test files.
//
// Established by 0.9.522 (Product Integrity Audit Baseline Consolidation)
// to give the mechanical raw-status/outcome sweep ONE canonical,
// importable implementation, so a future test can depend on the mechanism
// itself rather than copy-pasting it a fourth time.
//
// HISTORY, and why this module does NOT replace any existing copy:
//   0.9.520 (ProductIntegrityBoundaryClosureAudit.test.js) built this sweep
//   first and proved it correct against synthetic fixtures before ever
//   pointing it at real source (its own Section D1).
//   0.9.521 (RawStatusRenderingBoundaryClosure.test.js) reproduced the
//   IDENTICAL mechanism verbatim, on purpose — its own header explains it
//   deliberately does not import 0.9.520's own file, "so this milestone's
//   own regression sweep does not depend on that file's continued
//   existence or content." Both of those files are dated, point-in-time
//   closure audits whose own recorded verdicts (their own hit counts,
//   their own classification tables) are part of the historical record of
//   what each milestone found AT THAT TIME. Rewiring either one to import
//   from this shared module now would silently change what "re-running
//   0.9.520" or "re-running 0.9.521" even means — so neither is touched by
//   this milestone. They keep their own frozen, inline copies forever.
//
// This module exists for every FUTURE test — starting with 0.9.522's own
// tests/ProductIntegrityAuditBaselineConsolidation.test.js — that wants
// the identical mechanism as a LIVING regression guard rather than a
// historical snapshot: a place to import the sweep from, so that adding a
// new raw `{{ x.status }}`/`{{ x.outcome }}` template interpolation
// anywhere in ui/components/ or ui/views/ has to be either routed through
// an existing presentation/humanizing function, or explicitly added to a
// classification table and justified — never silently pass unnoticed.

// The identical banned-overclaim vocabulary 0.9.519/0.9.520/0.9.521 each
// already established and swept, reused here rather than redefined a
// fourth time.
export const OVERCLAIM_WORDS = /\b(trusted|safe|permanent|guaranteed|owns?|owned|authored?|authorship)\b/i;

const RAW_STATUS_PATTERN = /\{\{\s*([\w.]+)\.(status|outcome)\s*\}\}/g;

// Finds every raw `{{ expr.status }}` / `{{ expr.outcome }}` Vue template
// interpolation in a file's text — i.e. a `status`/`outcome` field
// rendered directly, with no humanizing/presentation function in between.
// Deliberately narrow: it does not flag `{{ describeX(y.status) }}` (a
// function call, not a bare field access), which is exactly the approved
// presentation path this sweep exists to distinguish from a raw leak.
export function findRawStatusInterpolations(fileText) {
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

// Convenience wrapper for the sweep's own most common use: walk every
// *.js file directly inside a directory (non-recursive, matching how
// ui/components/ and ui/views/ are both already flat) and return every hit
// tagged with the file it came from.
export async function sweepDirectory(readdirFn, readFileFn, dirUrl, relativeDirLabel) {
    const files = (await readdirFn(dirUrl)).filter((f) => f.endsWith('.js'));
    const hits = [];
    for (const file of files) {
        const relativePath = `${relativeDirLabel}/${file}`;
        const text = await readFileFn(new URL(file, dirUrl), 'utf8');
        for (const hit of findRawStatusInterpolations(text)) {
            hits.push({ file: relativePath, ...hit });
        }
    }
    return hits;
}
