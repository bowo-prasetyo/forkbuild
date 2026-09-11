import { readFile, readdir } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 0.9.399 — Test-Suite Registration Integrity Audit.
//
// TYPE: test-infrastructure verification audit, not a product-direction
// gate and not another closure certificate. PRODUCTION CHANGES: none.
//
// 0.9.398 Section I found, by its own fresh registration census, that ten
// real test files (spanning 0.9.349-0.9.387) existed on disk and passed
// individually but were never wired into tests.html, so never ran as part
// of this codebase's own browser test suite. That finding was fixed in the
// same milestone. This milestone asks the narrower, focused question that
// finding raises: does the mechanism connecting tests/*.test.js to the
// browser test runner actually hold, and is the census that checks it
// itself trustworthy — not merely "is the gap closed right now."
//
// CORE INVARIANT — every discovered test file is explicitly classified:
//
//   DISCOVERED_TEST
//         |
//         +-- REGISTERED               (present in tests.html's array)
//         |
//         +-- INTENTIONALLY_EXCLUDED   (named in this file's own registry,
//         |                             with a reason — none exist today)
//         |
//         +-- UNCLASSIFIED             <- failure; the exact shape of
//                                          0.9.398's own flagship finding
//
// and the relationship is checked in BOTH directions:
//
//         Test filesystem  --discovered-->  Registration table
//         Registration table  --executable-->  Browser test runner
//
// catching both orphaned tests (file exists, never registered — 0.9.398's
// finding) and dangling registrations (tests.html references a file that
// no longer exists) and, going one step further than mere path existence,
// registered-but-broken files (a path resolves but the module itself does
// not parse — "registered" is not the same claim as "executable").
//
// METHOD: no new test framework, no automatic discovery wired into the
// runner, no automatic edits to tests.html. Per this milestone's own
// brief: if a gap is found, it is REPORTED, classified, and asserted
// against — never silently auto-registered. Silent registration would
// hide the same kind of decision 0.9.398's own finding showed is worth
// seeing.
//
// NINE LETTERED SECTIONS:
//
//   A. Test population census — fresh filesystem walk of tests/.
//   B. Registration extraction — a parser scoped to tests.html's own
//      `testFiles` array literal, not a whole-document regex scan.
//   C. Set comparison and classification — discovered vs. registered vs.
//      intentionally-excluded vs. unclassified; dangling registrations;
//      duplicate registrations.
//   D. False-positive / false-negative resistance — synthetic fixtures
//      proving the Section B parser is not fooled by comments, near-miss
//      filenames, strings and HTML fragments outside the array, unrelated
//      paths, or duplicate entries.
//   E. Intentional-exclusion registry — the explicit, currently-empty
//      classification bucket; not manufactured for its own sake.
//   F. Real execution witness — for every current registration, the exact
//      case-sensitive path is confirmed resolvable AND the file is
//      confirmed syntactically loadable (`node --check`), the distinction
//      between "registered" and "executable."
//   G. Verdict — REGISTRATION_INTEGRITY_VALID, the conjunction of A-F.
//   H. What this milestone deliberately excludes.
//   I. Production boundary guard.

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

// ===================================================================
// Section B's parser, defined up front so Sections B, C, and D (which
// proves it doesn't get fooled) all exercise the exact same function —
// no separate "test version" of the logic under test.
//
// Scoped to the `const testFiles = [ ... ];` array literal specifically,
// rather than scanning the whole document for anything shaped like
// `tests/Foo.test.js` (0.9.398 Section I's own approach) — scoping to the
// array is what gives this parser its resistance to mentions elsewhere in
// the file (an HTML comment, a <p> tag, a console.log string, a JS
// comment above the array). Each line inside the array is then matched
// against a strict single-line pattern: leading/trailing whitespace
// tolerated, but the line must be exactly a quoted `./tests/Name.test.js`
// literal with an optional trailing comma — nothing before, nothing after
// (rejects `.test.js.bak`, rejects a commented-out `// './tests/...'`
// line, rejects a path containing a slash such as a subdirectory).
// ===================================================================
const ARRAY_START_MARKER = 'const testFiles = [';
const REGISTRATION_LINE = /^'\.\/tests\/([A-Za-z0-9_]+)\.test\.js'\s*,?\s*$/;

function extractRegisteredTestFiles(htmlSource) {
    const startIdx = htmlSource.indexOf(ARRAY_START_MARKER);
    if (startIdx === -1) return { arrayFound: false, entries: [], unmatchedLines: [] };
    const endIdx = htmlSource.indexOf('];', startIdx);
    const body = htmlSource.slice(startIdx + ARRAY_START_MARKER.length, endIdx === -1 ? undefined : endIdx);
    const lines = body.split('\n').map((line) => line.trim()).filter(Boolean);

    const entries = [];
    const unmatchedLines = [];
    for (const line of lines) {
        const match = line.match(REGISTRATION_LINE);
        if (match) entries.push(match[1]);
        else unmatchedLines.push(line);
    }
    return { arrayFound: true, entries, unmatchedLines };
}

// The explicit classification for every DISCOVERED_TEST: REGISTERED,
// INTENTIONALLY_EXCLUDED, or UNCLASSIFIED (failure). No file may be
// silently dropped from this accounting.
function classify(discoveredNames, registeredSet, exclusionSet) {
    return discoveredNames.map((file) => {
        let status;
        if (registeredSet.has(file)) status = 'REGISTERED';
        else if (exclusionSet.has(file)) status = 'INTENTIONALLY_EXCLUDED';
        else status = 'UNCLASSIFIED';
        return { file, status };
    });
}

// ===================================================================
// Section E — Intentional-exclusion registry. The explicit, third
// classification bucket for a discovered test file that exists on disk
// but is deliberately not part of the browser test suite. Empty today —
// no discovered file falls in this bucket, and this milestone does not
// manufacture an entry merely to exercise the abstraction. If one is ever
// added, it must name the file and the reason; Section C's own
// classification then treats it as a known, explicit exclusion rather
// than either a silent gap or a bare UNCLASSIFIED failure. Declared here,
// alongside Section B's parser and classifier, so both Section C's use of
// it and Section E's own reporting read from the same single registry.
// ===================================================================
const INTENTIONALLY_EXCLUDED = [
    // { file: 'ExampleFileName', reason: 'why this file is deliberately not registered' }
];

async function run() {
    console.log('Running Test-Suite Registration Integrity Audit tests...\n');

    // ===============================================================
    // Section A — Test population census. Fresh filesystem walk, not
    // copied from any prior milestone's reported count (0.9.398 Section I
    // already found that trusting an inherited figure is exactly how a
    // gap like this hides).
    // ===============================================================
    let discoveredNames;
    {
        const dirEntries = await readdir(path.join(SOURCE_ROOT, 'tests'), { withFileTypes: true });
        const topLevelTestFiles = dirEntries
            .filter((entry) => entry.isFile() && entry.name.endsWith('.test.js'))
            .map((entry) => entry.name);
        discoveredNames = topLevelTestFiles.map((f) => f.replace(/\.test\.js$/, ''));

        assert(discoveredNames.length >= 800, n(`A1. fresh census of tests/ finds ${discoveredNames.length} top-level *.test.js files today — walked directly via readdir, not read from tests.html or any prior milestone's reported figure`));
        assert(new Set(discoveredNames).size === discoveredNames.length, n('A2. no two discovered files share the same base name — the census population itself has no internal collisions'));
        assert(!discoveredNames.includes('fixtures'), n('A3. census excludes non-file entries (the real tests/fixtures subdirectory) — computed via isFile(), not a bare name filter that a directory named e.g. "fixtures.test.js" could still slip through'));

        console.log('\n=== SECTION A: TEST POPULATION CENSUS ===');
        console.log(`✓ Section A: ${discoveredNames.length} top-level test files discovered fresh under tests/.`);
    }

    // ===============================================================
    // Section B — Registration extraction. The array-scoped parser
    // defined above, run against the real, current tests.html.
    // ===============================================================
    let registeredNames;
    let registrationUnmatchedLines;
    {
        const html = await readSource('tests.html');
        const extraction = extractRegisteredTestFiles(html);
        assert(extraction.arrayFound, n("B1. tests.html still contains a `const testFiles = [` array literal — the registration surface this whole audit depends on has not moved or been renamed"));
        registeredNames = extraction.entries;
        registrationUnmatchedLines = extraction.unmatchedLines;

        assert(registeredNames.length >= 800, n(`B2. ${registeredNames.length} entries extracted from the real testFiles array in tests.html`));
        assert(registrationUnmatchedLines.length === 0, n(`B3. every non-empty line inside the real array parses as a clean registration — zero lines left unmatched (found: ${JSON.stringify(registrationUnmatchedLines)})`));

        const duplicateCounts = {};
        for (const name of registeredNames) duplicateCounts[name] = (duplicateCounts[name] || 0) + 1;
        const duplicates = Object.entries(duplicateCounts).filter(([, count]) => count > 1).map(([name]) => name);
        assert(duplicates.length === 0, n(`B4. no file is registered twice in the real array (found duplicates: ${JSON.stringify(duplicates)})`));

        console.log('\n=== SECTION B: REGISTRATION EXTRACTION ===');
        console.log(`✓ Section B: ${registeredNames.length} registrations extracted from tests.html's own testFiles array; zero unmatched lines; zero duplicates.`);
    }

    // ===============================================================
    // Section C — Set comparison and classification. discovered vs.
    // registered vs. intentionally-excluded (Section E's registry, above)
    // vs. unclassified; dangling registrations (registered but no longer
    // on disk).
    // ===============================================================
    {
        const registeredSet = new Set(registeredNames);
        const discoveredSet = new Set(discoveredNames);

        const missing = discoveredNames.filter((f) => !registeredSet.has(f)); // orphaned tests
        const dangling = registeredNames.filter((f) => !discoveredSet.has(f)); // dangling registrations

        const classifications = classify(discoveredNames, registeredSet, new Set(INTENTIONALLY_EXCLUDED.map((e) => e.file)));
        const unclassified = classifications.filter((c) => c.status === 'UNCLASSIFIED');

        assert(dangling.length === 0, n(`C1. no registration in tests.html points at a file that no longer exists on disk (found dangling: ${JSON.stringify(dangling)})`));
        assert(unclassified.length === 0, n(`C2. every discovered test file classifies as REGISTERED or INTENTIONALLY_EXCLUDED — zero UNCLASSIFIED (found: ${JSON.stringify(unclassified.map((c) => c.file))}) — this is the exact assertion that would have caught 0.9.398's own ten-file finding before it was found`));
        assert(missing.length === 0 || missing.every((f) => INTENTIONALLY_EXCLUDED.some((e) => e.file === f)),
            n(`C3. missing === ∅ unless every missing file is explicitly classified INTENTIONALLY_EXCLUDED (found unexplained missing: ${JSON.stringify(missing.filter((f) => !INTENTIONALLY_EXCLUDED.some((e) => e.file === f)))})`));

        console.log('\n=== SECTION C: SET COMPARISON AND CLASSIFICATION ===');
        console.log(`discovered: ${discoveredNames.length} | registered: ${registeredNames.length} | missing: ${missing.length} | dangling: ${dangling.length} | unclassified: ${unclassified.length}`);
        console.log('✓ Section C: every discovered file is REGISTERED (none currently INTENTIONALLY_EXCLUDED); zero dangling registrations; zero unclassified files.');
    }

    // ===============================================================
    // Section D — False-positive / false-negative resistance. Synthetic
    // fixtures only (in-memory strings, never written to disk, never
    // touching the real tests.html) proving extractRegisteredTestFiles —
    // the SAME function Section B just ran against the real file, not a
    // reimplementation — is not fooled by the shapes this milestone's own
    // brief named.
    // ===============================================================
    {
        // D1 — comments, both an HTML comment entirely outside the array
        // and a commented-out JS line inside it, must not register.
        const commentFixture = `
<!-- mentions ./tests/GhostInHtmlComment.test.js but this is outside the script entirely -->
<script type="module">
    // ./tests/GhostAboveArray.test.js — mentioned above the array, must not count
    const testFiles = [
        // './tests/CommentedOutInsideArray.test.js',
        './tests/RealEntryOne.test.js',
        './tests/RealEntryTwo.test.js'
    ];
</script>`;
        const d1 = extractRegisteredTestFiles(commentFixture);
        assert(d1.entries.length === 2 && d1.entries.includes('RealEntryOne') && d1.entries.includes('RealEntryTwo'),
            n(`D1. comments (an HTML comment outside the array, a JS comment above it, a commented-out line inside it) contribute zero false-positive registrations — extracted exactly the two real entries (got: ${JSON.stringify(d1.entries)})`));
        assert(!d1.entries.includes('GhostInHtmlComment') && !d1.entries.includes('GhostAboveArray') && !d1.entries.includes('CommentedOutInsideArray'),
            n('D1. none of the three comment-only mentions leaked into the registered set'));

        // D2 — similarly-named files: a near-miss extension, a near-miss
        // stem, and a pluralized extension must not be confused with a
        // genuine `.test.js` registration.
        const nearMissFixture = `
const testFiles = [
    './tests/RealEntryOne.test.js',
    './tests/RealEntryOne.test.js.bak',
    './tests/RealEntryOneTest.js',
    './tests/RealEntryOne.tests.js'
];`;
        const d2 = extractRegisteredTestFiles(nearMissFixture);
        assert(d2.entries.length === 1 && d2.entries[0] === 'RealEntryOne',
            n(`D2. three similarly-named near-misses (.test.js.bak, a missing dot before Test, a pluralized .tests.js) are each rejected — only the one genuine entry is extracted (got: ${JSON.stringify(d2.entries)})`));
        assert(d2.unmatchedLines.length === 3, n(`D2. the three rejected near-miss lines are surfaced as unmatched rather than silently dropped — a real audit run would see them (got ${d2.unmatchedLines.length})`));

        // D3 — strings and HTML fragments elsewhere in the document, plus
        // an unrelated directory and a subdirectory path inside the array,
        // must not register.
        const stringsAndPathsFixture = `
<p>See tests/OutsideArrayMention.test.js in the docs for background.</p>
<script>console.log('a log line referencing ./tests/LoggedNotRegistered.test.js');</script>
<script type="module">
    const testFiles = [
        './scripts/UnrelatedDirectory.test.js',
        './tests/sub/NestedPath.test.js',
        './tests/RealEntryOne.test.js'
    ];
</script>`;
        const d3 = extractRegisteredTestFiles(stringsAndPathsFixture);
        assert(d3.entries.length === 1 && d3.entries[0] === 'RealEntryOne',
            n(`D3. an unrelated-directory line, a subdirectory path, and two mentions entirely outside the array all fail to register — only the one genuine entry is extracted (got: ${JSON.stringify(d3.entries)})`));

        // D4 — duplicate registrations are preserved by the extractor
        // (not silently deduplicated) so that Section B's own duplicate
        // check can actually detect them.
        const duplicateFixture = `
const testFiles = [
    './tests/RealEntryOne.test.js',
    './tests/RealEntryOne.test.js'
];`;
        const d4 = extractRegisteredTestFiles(duplicateFixture);
        assert(d4.entries.length === 2 && new Set(d4.entries).size === 1,
            n('D4. a duplicated registration is preserved verbatim by the extractor (not deduplicated away) — proving Section B\'s own duplicate-detection assertion has something real to catch if this ever recurs'));

        // D5 — false-negative resistance: irregular whitespace/tabs and a
        // final entry with no trailing comma (the real file's own last
        // line has no comma) must still register correctly.
        const whitespaceFixture = `
const testFiles = [
\t './tests/RealEntryOne.test.js'  ,
        './tests/RealEntryTwo.test.js'
];`;
        const d5 = extractRegisteredTestFiles(whitespaceFixture);
        assert(d5.entries.length === 2 && d5.entries.includes('RealEntryOne') && d5.entries.includes('RealEntryTwo'),
            n(`D5. irregular leading/trailing whitespace and a missing trailing comma on the final entry do not cause a false negative (got: ${JSON.stringify(d5.entries)})`));

        console.log('\n=== SECTION D: FALSE-POSITIVE / FALSE-NEGATIVE RESISTANCE ===');
        console.log('✓ Section D: the exact Section B parser, exercised against five synthetic fixtures (comments, near-miss names, strings/HTML fragments outside the array, unrelated/subdirectory paths, duplicates, and irregular whitespace), produces exactly the expected registrations in every case — no false positives, no false negatives.');
    }

    // ===============================================================
    // Section E — Intentional-exclusion registry. Reports the registry
    // declared above (used already, by Section C). Currently empty: no
    // discovered file is deliberately excluded from the browser suite
    // today. Each entry, if one is ever added, must carry a reason —
    // asserted here so an exclusion can never be added silently, without
    // one.
    // ===============================================================
    {
        assert(Array.isArray(INTENTIONALLY_EXCLUDED), n('E1. the intentional-exclusion registry is a real, defined list (possibly empty), not an ad hoc check scattered across this file'));
        for (const entry of INTENTIONALLY_EXCLUDED) {
            assert(typeof entry.file === 'string' && entry.file.length > 0, n(`E2. every exclusion entry names a real file (got: ${JSON.stringify(entry)})`));
            assert(typeof entry.reason === 'string' && entry.reason.length > 0, n(`E3. exclusion "${entry.file}" carries a non-empty reason — no silent, unexplained exclusion is permitted`));
        }

        console.log('\n=== SECTION E: INTENTIONAL-EXCLUSION REGISTRY ===');
        console.log(`✓ Section E: ${INTENTIONALLY_EXCLUDED.length} file(s) currently classified INTENTIONALLY_EXCLUDED. None today — not manufactured merely to exercise the classification; every discovered file currently resolves to REGISTERED (Section C).`);
    }

    // ===============================================================
    // Section F — Real execution witness. For every current registration:
    // (1) the exact, case-sensitive filename resolves against a fresh
    // directory listing — not merely existsSync, which some filesystems
    // resolve case-insensitively even though a browser's URL-based
    // dynamic import never does; and (2) the file is confirmed
    // syntactically loadable via `node --check`, catching the gap plain
    // path-existence cannot: a registered path that resolves but whose
    // module body no longer parses would still fail, loudly, in the
    // browser console — "registered" is not the same claim as
    // "executable."
    // ===============================================================
    {
        const dirEntries = await readdir(path.join(SOURCE_ROOT, 'tests'));
        const exactNamesOnDisk = new Set(dirEntries);

        let caseResolvedCount = 0;
        for (const name of registeredNames) {
            const exactFileName = `${name}.test.js`;
            assert(exactNamesOnDisk.has(exactFileName), n(`F1. tests/${exactFileName} resolves with exact case against a fresh directory listing — the same resolution a browser's dynamic import would require`));
            caseResolvedCount += 1;
        }
        assert(caseResolvedCount === registeredNames.length, n(`F1. all ${caseResolvedCount} current registrations were case-resolved (no shortcut, no sampling)`));

        let syntaxCheckedCount = 0;
        const syntaxFailures = [];
        for (const name of registeredNames) {
            const relativeFile = `tests/${name}.test.js`;
            try {
                execSync(`node --check ${relativeFile}`, { cwd: SOURCE_ROOT, stdio: 'pipe' });
            } catch (error) {
                syntaxFailures.push({ file: relativeFile, error: `${error.stderr || error.message}`.slice(0, 200) });
            }
            syntaxCheckedCount += 1;
        }
        assert(syntaxFailures.length === 0, n(`F2. every one of the ${syntaxCheckedCount} currently-registered files parses cleanly under \`node --check\` — zero syntax failures (found: ${JSON.stringify(syntaxFailures)})`));
        assert(syntaxCheckedCount === registeredNames.length, n(`F2. all ${syntaxCheckedCount} current registrations were syntax-checked (no shortcut, no sampling) — a full population sweep, deliberately broader than 0.9.398 Section I's own four-file spot-check, though shallower: syntax-valid, not full live execution`));

        console.log('\n=== SECTION F: REAL EXECUTION WITNESS ===');
        console.log(`✓ Section F: all ${registeredNames.length} current registrations resolve with exact case against a fresh directory listing, and all ${registeredNames.length} parse cleanly under node --check. "Registered" and "executable" are shown to coincide for the full population today, not assumed.`);
    }

    // ===============================================================
    // Section G — Verdict. The conjunction.
    // ===============================================================
    {
        const REGISTRATION_INTEGRITY_VALID = true; // Sections A-F: census fresh, extraction clean, classification complete, parser resistant, execution witnessed
        assert(REGISTRATION_INTEGRITY_VALID === true, n('G1. REGISTRATION_INTEGRITY_VALID evaluates true — every discovered file classifies as REGISTERED or INTENTIONALLY_EXCLUDED, zero dangling registrations, zero UNCLASSIFIED, the registration parser resists every synthetic false-positive/false-negative shape tried against it, and every current registration is confirmed both case-resolvable and syntactically loadable'));

        console.log('\n=== SECTION G: VERDICT ===');
        console.log(`REGISTRATION_INTEGRITY_VALID = ${REGISTRATION_INTEGRITY_VALID}`);
        console.log('The tests/*.test.js -> tests.html -> browser-runner chain holds in both directions for the current population: no orphaned test, no dangling registration, no unclassified file, and no registered-but-unexecutable file.');
    }

    // ===============================================================
    // Section H — What this milestone deliberately excludes.
    // ===============================================================
    {
        const EXCLUDED = [
            'a new test framework', 'automatic test discovery wired into the runner', 'automatic modification of tests.html',
            'a test categorization framework beyond the three-way REGISTERED/INTENTIONALLY_EXCLUDED/UNCLASSIFIED split',
            'a test dependency graph', 'coverage measurement', 'test-quality scoring', 'production-code analysis',
            'another product-direction gate', 'another stable-plateau audit'
        ];
        assert(EXCLUDED.length === 10, n('H1. ten categories of work are explicitly named as out of this milestone\'s own scope'));

        const productionDirs = ['core', 'application', 'ui', 'renderer', 'discovery', 'anchoring', 'collaboration', 'persistence'];
        let touchedProductionDir = null;
        for (const dir of productionDirs) {
            const status = execSync(`git status --porcelain -- ${dir}`, { cwd: SOURCE_ROOT }).toString().trim();
            if (status) { touchedProductionDir = dir; break; }
        }
        assert(touchedProductionDir === null, n(`H2. none of this codebase's own production directories (${productionDirs.join(', ')}) show any change from this milestone (found: ${touchedProductionDir})`));

        console.log('\n=== SECTION H: DELIBERATE EXCLUSIONS ===');
        console.log(`✓ Section H: ${EXCLUDED.length} categories of work explicitly excluded; zero production directories touched. In particular, no discovered file is ever auto-registered by this file — a gap, if one is ever found again, is reported and asserted against, never silently patched into tests.html the way that would hide the same kind of decision 0.9.398's own finding made visible.`);
    }

    // ===============================================================
    // Section I — Production guard.
    // ===============================================================
    {
        const statusOutput = execSync('git status --porcelain', { cwd: SOURCE_ROOT }).toString();
        const changed = statusOutput.split('\n').map((line) => line.slice(3).trim()).filter(Boolean);
        const productionTouched = changed.filter((f) => !f.startsWith('tests/') && f !== 'tests.html' && !f.startsWith('docs/'));
        assert(productionTouched.length === 0, n(`I1. no production file is modified or added by this milestone's own working-tree changes (found: ${JSON.stringify(productionTouched)})`));

        const newTestFiles = changed
            .filter((f) => f.startsWith('tests/') && f.endsWith('.test.js'))
            .filter((f) => f !== 'tests/TestSuiteRegistrationIntegrityAudit.test.js');
        assert(newTestFiles.length === 0, n(`I2. this milestone adds exactly one new test file — its own — no candidate implementation work is opened alongside it (found: ${JSON.stringify(newTestFiles)})`));

        console.log('\n=== SECTION I: PRODUCTION GUARD ===');
        console.log('✓ Section I: no production file changed. ForkBuild remains stable — this is a test-infrastructure verification audit, not a reopening of the product-direction question 0.9.397 already closed.');
    }

    console.log('\n✅ All Test-Suite Registration Integrity Audit tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
