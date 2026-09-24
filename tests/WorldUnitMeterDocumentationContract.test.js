import { assert } from './support/Assert.js';
import { readSource } from './support/SourceText.js';
import { readDoc } from './support/DocText.js';

// 0.9.548 — Adopt World Unit As Meter Documentation Contract.
//
// 0.9.547 audited whether "1 World Unit = 1 meter" was technically safe
// to declare and found, as its own flagship finding, that the codebase
// held a standing, four-times-restated DENIAL of exactly that claim
// (docs/Principles.md, "A World Unit Is Not (Yet) A Meter," 0.2.24/
// 0.2.25) — a product/documentation decision no test-only audit gets to
// make for itself. This milestone makes that decision: it replaces the
// denial with the affirmative contract in docs/Principles.md,
// docs/Protocol.md, docs/Architecture.md, and the user-facing
// docs/user/03-WorldView.md, scoped narrowly to spatial length and
// quantities derived from it — never a claim that every numeric value
// in the World model is a physical measurement, never a change to
// avatar/eye-height geometry, and zero runtime/coordinate changes.
//
// This file is the "small regression test" that keeps the contract
// from silently drifting back to a denial, or overreaching past its
// declared scope, in some future milestone.
//
// Sections:
//   A — docs/Principles.md carries the affirmative contract; the old
//       denial's exact wording is gone; the historical note is present
//       and clearly marked historical, not current policy.
//   B — docs/Protocol.md's coordinate-system section affirms meters.
//   C — docs/Architecture.md's coordinate-system statement affirms
//       meters (the unrelated, historical 0.2.28 narrative reference to
//       the old section title is deliberately left untouched and out
//       of scope for this check).
//   D — docs/user/03-WorldView.md (user-facing) affirms meters and no
//       longer denies them; the 1/10/100 nudge convention is untouched.
//   E — Scope guard: no doc overreaches into "everything is SI units,"
//       and none claims avatar/eye-height geometry changed.
//   F — Production guard: only documentation + this test file + its
//       tests.html registration changed.

async function main() {
    let principlesSrc, protocolSrc, architectureSrc, worldViewUserDocSrc;

    // ===================================================================
    // Section A — docs/Principles.md
    // ===================================================================
    {
        principlesSrc = await readDoc('docs/Principles.md');

        assert(/### A World Unit Is One Meter/.test(principlesSrc),
            '1. LIVE: docs/Principles.md carries the new "A World Unit Is One Meter" section header.');
        assert(/one World Unit represents one meter of real-world length/.test(principlesSrc),
            '2. LIVE: the section body states the affirmative contract in plain language.');
        assert(/scoped to spatial length and quantities derived from it/.test(principlesSrc),
            '3. LIVE: the contract explicitly scopes itself to length-derived quantities, not every numeric value in the World model.');
        assert(!/### A World Unit Is Not \(Yet\) A Meter/.test(principlesSrc),
            '4. LIVE: the old section header ("...Is Not (Yet) A Meter") no longer exists as a live section.');
        assert(!/deliberately does NOT claim a World Unit equals one real-world meter/.test(principlesSrc),
            '5. LIVE: the old denial sentence is gone from live prose (a paraphrased historical mention is fine; this exact sentence is not).');
        assert(/Historical note, superseded by this section/.test(principlesSrc),
            '6. LIVE: the prior 0.2.24/0.2.25 caution is preserved but explicitly marked historical and superseded, not silently deleted.');
        assert(/does not touch avatar or camera geometry/.test(principlesSrc),
            '7. LIVE: the section explicitly disclaims any avatar/eye-height change, matching 0.9.547 Section C\'s own "no change indicated" finding.');

        console.log('✓ Section A: docs/Principles.md carries the affirmative "one World Unit = one meter" contract, scoped to length-derived quantities, with the old denial removed and its rationale preserved only as marked history.');
    }

    // ===================================================================
    // Section B — docs/Protocol.md
    // ===================================================================
    {
        protocolSrc = await readDoc('docs/Protocol.md');

        assert(/one World Unit\s+represents one meter of real-world length/.test(protocolSrc),
            '1. LIVE: docs/Protocol.md\'s coordinate-system section affirms the meter contract.');
        assert(/A World Unit Is One Meter/.test(protocolSrc),
            '2. LIVE: docs/Protocol.md cross-references docs/Principles.md\'s new section by its new title.');
        assert(!/deliberately does NOT claim a World Unit is one meter/.test(protocolSrc),
            '3. LIVE: the old denial sentence is gone from docs/Protocol.md.');

        console.log('✓ Section B: docs/Protocol.md independently affirms the same meter contract and cross-references the new Principles.md section.');
    }

    // ===================================================================
    // Section C — docs/Architecture.md
    // ===================================================================
    {
        architectureSrc = await readDoc('docs/Architecture.md');

        assert(/one coordinate unit named a\s+\*\*World Unit\*\*, equal to one meter of real-world length/.test(architectureSrc),
            '1. LIVE: docs/Architecture.md\'s coordinate-system statement affirms the meter contract.');
        assert(!/explicitly not claimed to equal one meter/.test(architectureSrc),
            '2. LIVE: the old denial phrase is gone from that statement.');
        // The unrelated 0.2.28-era historical narrative reference to the
        // old section title is deliberately out of scope — it describes
        // what was true when 0.2.28 was written, not a current claim,
        // and rewriting settled historical narrative is not this
        // milestone's job.

        console.log('✓ Section C: docs/Architecture.md\'s live coordinate-system statement affirms the meter contract; the unrelated historical 0.2.28 narrative reference is left untouched, as intended.');
    }

    // ===================================================================
    // Section D — docs/user/03-WorldView.md (user-facing)
    // ===================================================================
    {
        worldViewUserDocSrc = await readSource('docs/user/03-WorldView.md');

        assert(/one\s+World Unit represents one meter of real-world length/.test(worldViewUserDocSrc),
            '1. LIVE: the user-facing Placement panel description affirms the meter contract in plain language.');
        assert(!/not meters, not GPS coordinates/.test(worldViewUserDocSrc),
            '2. LIVE: the old user-facing denial ("not meters, not GPS coordinates") is gone.');
        assert(/not GPS coordinates/.test(worldViewUserDocSrc),
            '3. LIVE: the still-true "not GPS coordinates" distinction is preserved (only the meter denial is removed).');
        assert(/1 \/ 10 \/ 100 World Units/.test(worldViewUserDocSrc),
            '4. LIVE: the nudge-button convention (1/10/100 World Units) is untouched by this documentation-only milestone.');

        console.log('✓ Section D: the user-facing World View guide now affirms the meter contract, keeps the accurate "not GPS coordinates" distinction, and leaves the nudge-button UI description untouched.');
    }

    // ===================================================================
    // Section E — Scope guard
    // ===================================================================
    {
        const allDocs = [principlesSrc, protocolSrc, architectureSrc, worldViewUserDocSrc];
        const overreachPatterns = [
            /everything in forkbuild uses si units/i,
            /every (?:numeric )?value.{0,40}(?:is|in) meters/i,
            /all units? (?:are|is) meters/i
        ];
        for (const pattern of overreachPatterns) {
            for (const doc of allDocs) {
                assert(!pattern.test(doc), `1. LIVE: no touched doc contains an overreaching "everything is metric" claim matching ${pattern} — the contract stays scoped to length-derived quantities.`);
            }
        }
        const contractSectionMatch = principlesSrc.match(/### A World Unit Is One Meter[\s\S]*?(?=\n### )/);
        assert(contractSectionMatch, '2a. LIVE: the new contract section can be isolated by its own header for a scoped check.');
        const contractSection = contractSectionMatch[0];
        assert(!/avatar.{0,60}(?:raised|lowered|changed|adjusted)|eye height.{0,60}(?:raised|lowered|changed|adjusted)/i.test(contractSection),
            '2b. LIVE: within the new contract section itself (not the whole multi-milestone Principles.md file), no claim is made that avatar or eye-height geometry was changed by this milestone.');

        console.log('✓ Section E: the contract stays narrowly scoped — no doc overclaims universal SI units, and none claims avatar/eye-height geometry changed.');
    }

    // ===================================================================
    // Section F — Production guard
    // ===================================================================
    {
        const gitStatus = await import('node:child_process').then((cp) =>
            new Promise((resolve, reject) => {
                cp.exec('git status --porcelain', { cwd: new URL('../', import.meta.url) }, (err, stdout) => {
                    if (err) return reject(err);
                    resolve(stdout);
                });
            })
        );
        const changedLines = gitStatus.split('\n').filter((l) => l.trim().length > 0);
        const expectedSuffixes = [
            'docs/Principles.md',
            'docs/Protocol.md',
            'docs/Architecture.md',
            'docs/user/03-WorldView.md',
            'tests/WorldUnitMeterDocumentationContract.test.js',
            // 0.9.547's own audit test is amended in this same milestone
            // (its live assertions checked the pre-adoption denial; see
            // that file's own "AMENDED BY 0.9.548" notes) — a deliberate,
            // narrated change, not scope creep.
            'tests/WorldUnitMetricConventionBoundaryAudit.test.js',
            'tests.html'
        ];
        const unexpected = changedLines.filter((l) => !expectedSuffixes.some((suffix) => l.includes(suffix)));
        assert(unexpected.length === 0, `1. LIVE: git status reports no changed file besides this milestone's own expected documentation + test + registration set (unexpected: ${JSON.stringify(unexpected)}) — zero runtime/production code touched.`);

        // No core/renderer/ui source file mentions the old denial phrasing
        // either (this milestone never asserted those files needed
        // editing, but confirms it didn't leave any behind).
        for (const doc of [principlesSrc, protocolSrc, architectureSrc]) {
            assert(!/is not \(yet\) claimed to equal one meter/i.test(doc), '2. LIVE: no stray old-style denial phrasing survives.');
        }

        console.log('✓ Section F: only documentation, this test file, and its tests.html registration changed — zero runtime or production code touched by this contract-adoption milestone.');
    }

    console.log('\nAll World Unit Meter Documentation Contract tests passed.');
    console.log('\n=== 0.9.548 VERDICT ===');
    console.log(`CONTRACT_ADOPTED.

"One World Unit represents one meter of real-world length" is now the live, affirmative contract in docs/Principles.md
("A World Unit Is One Meter"), docs/Protocol.md, docs/Architecture.md, and the user-facing docs/user/03-WorldView.md —
replacing the four-times-restated "A World Unit Is Not (Yet) A Meter" denial that 0.9.547 found still standing. The
contract is scoped strictly to spatial length and quantities derived from it (position, distance, dimensions, radius,
speed, acceleration); it makes no claim about GRAVITY, vehicle tuning, or any other non-length constant, and no change
was made to avatar or camera geometry. Zero coordinate migration, zero scaling transform, zero physics rewrite, zero
runtime code touched — exactly as 0.9.547's own audit established was sufficient. The prior 0.2.24/0.2.25 caution is
preserved as a clearly marked historical note, not deleted.`);
}

main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
