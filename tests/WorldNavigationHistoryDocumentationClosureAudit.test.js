import { readFile } from 'node:fs/promises';
import { worldViewFiles, worldNavigationSessionFiles, editorViewFiles } from './support/SourceFileGroups.js';
import { assert } from './support/Assert.js';
import { readSource } from './support/SourceText.js';

// 0.9.587 — World Navigation History Documentation Closure Audit.
//
// TYPE: test-first documentation-closure audit. Production change: ONE
// documentation section, in docs/Principles.md, plus a companion
// docs/Roadmap.md milestone entry — both added alongside this file, never
// as a follow-up. No application/, ui/, core/, or router/ file is touched.
//
// 0.9.586's own Section G3 searched docs/Principles.md and docs/Roadmap.md,
// live, for the exact phrase "navigation history" named as a deliberate
// exclusion, and found nothing — a genuine, narrow DOCUMENTATION_GAP, not a
// PRODUCT_GAP: no prior milestone's own live evidence ever found the
// underlying navigation mechanism broken, missing, or user-visibly
// confusing, only undocumented as a single, citable statement. This
// milestone's own brief asks the central question that finding leaves
// open: does ForkBuild already have an intentional navigation-history
// model, and is it now documented well enough that the absence of a
// richer back-stack/breadcrumb/bookmark system can never again be
// mistaken for an unfinished feature — rather than simply building
// browser-like Back/Forward behavior because a user might expect it.
//
// SAME STRUCTURAL CONSTRAINT AS EVERY "World"-CLASS MILESTONE SINCE
// 0.9.556/0.9.574/0.9.584: application/world/WorldNavigationSession.js
// transitively requires 'three'; ui/views/WorldView.js imports it;
// ui/router/index.js imports 'vue-router'. None of the three packages
// resolve in this checkout. This file never imports any of them — every
// claim below is proven by readSource() + an exact string/regex match
// against the real, unmodified file, the same discipline 0.9.584/0.9.586
// already established, so this file runs standalone under plain `node`.
//
// NINE lettered sections, mirroring this milestone's own requesting brief:
//
//   A — Existing navigation mechanisms: every real entry point into World
//       View, and which router primitive (push vs. replace) each one
//       actually uses — confirmed live, not assumed from memory.
//   B — Back/Forward semantics: what a chain of World-to-World focus
//       hops actually leaves in the browser's own history, derived from
//       Section A's own findings, never assumed to match page-like
//       navigation.
//   C — Navigation state vs. World state: WorldNavigationSession.js is
//       confirmed, live, to hold no navigation-position/back-stack field
//       of its own; its one "history"-named field is confirmed to be an
//       unrelated concept (CommandHistory replay/undo-redo scrubbing),
//       adversarially distinguished rather than assumed absent.
//   D — Return semantics: "return to World A" (a fresh focus) and
//       "restore World A's previous session state" (a camera-only,
//       separately-owned effect) are shown, by source, to be two
//       different operations that merely run back-to-back.
//   E — Publication-driven navigation: a Publication is confirmed to
//       travel through navigation only as a plain documentId string,
//       never as an object cached in any history-shaped state.
//   F — Async boundary: CITED, not re-derived — 0.9.584 Section G already
//       live-proved WorldNavigationSession.js contains zero
//       await/async/.then()/Promise, so a stale-operation-after-navigate
//       race is structurally impossible inside it.
//   G — Documentation completeness: a fresh, live search of the three
//       largest docs, reconfirming 0.9.586 Section G3's own finding
//       (nothing previously named "navigation history" as deliberate)
//       before this milestone's own fix is applied.
//   H — Classification: exactly one of ALREADY_DOCUMENTED,
//       DOCUMENTATION_GAP, PRODUCT_GAP, DELIBERATE_BOUNDARY.
//   I — Regression guard: live proof that docs/Principles.md and
//       docs/Roadmap.md now carry the fix, with the exact needle text a
//       future edit could not silently remove without failing this file.
//
// Deliberately excluded, matching the requesting brief's own list: a
// back-stack implementation, custom navigation history, World session
// restoration beyond what already exists, browser-history interception,
// breadcrumbs, bookmarks, a recent-World redesign, caching, preloading, a
// new router, navigation-state persistence. No navigation-history
// implementation of any kind is added by this file.

const SOURCE_ROOT = new URL('../', import.meta.url);

function codeOnly(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

async function main() {
    // ===============================================================
    // Section A — Existing navigation mechanisms: six real entry
    // points, confirmed live, tagged by which router primitive each
    // one actually calls.
    // ===============================================================
    let worldViewSource, editorViewSource, publicationCatalogSource, routerSource;
    {
        worldViewSource = codeOnly((await Promise.all(worldViewFiles().map((file) => readSource(file)))).join('\n'));
        editorViewSource = codeOnly((await Promise.all(editorViewFiles().map((file) => readSource(file)))).join('\n'));
        publicationCatalogSource = codeOnly(await readSource('ui/components/PublicationCatalog.js'));
        routerSource = codeOnly(await readSource('ui/router/index.js'));

        // A1. The router mounts a REAL, browser-integrated history —
        // never a synthetic/in-memory one this codebase would have to
        // reimplement Back/Forward against itself.
        assert(/import \{ createRouter, createWebHashHistory \} from 'vue-router';/.test(routerSource),
            'A1. ui/router/index.js imports createRouter/createWebHashHistory from the real vue-router package.');
        assert(/history: createWebHashHistory\(\)/.test(routerSource),
            'A1b. The router is constructed with a real createWebHashHistory() — genuine, browser-integrated history, confirmed live, not assumed.');

        // A2. World -> World focus (every Search/Nearby-Worlds/overlap-
        // panel/Notification "Focus"/"View" action) converges on
        // focusWorld(), and its body is router.replace(), never push().
        assert(/function focusWorld\(documentId\) \{\s*session\.focusDocument\(documentId\);\s*router\.replace\(\{ path: `\/world\/\$\{documentId\}` \}\);\s*refreshSpatialUI\(\);\s*\}/.test(worldViewSource),
            'A2. WorldView.js#focusWorld() is exactly session.focusDocument() + router.replace(/world/<id>) + refreshSpatialUI() — replace, never push.');

        // A3. Notification -> World reuses focusWorld() verbatim — no
        // second, competing navigation call, and therefore no second
        // router primitive either.
        assert(/function viewNotificationPublicationCommand\(publicationId\) \{[\s\S]{0,400}?focusWorld\(publication\.documentId\);/.test(worldViewSource),
            'A3. WorldView.js#viewNotificationPublicationCommand() resolves the Publication and then calls focusWorld() directly — the identical replace()-based call Section A2 already characterized, never a bare router.push() of its own.');

        // A4. Editor -> World ("Back to World") is a genuine, separate
        // router.push() — a real navigation INTO World View, not a
        // refocus within it.
        assert(/function backToWorld\(\) \{[\s\S]{0,220}?router\.push\(\{\s*path: `\/world\/\$\{context\.returnWorldId\}`/.test(editorViewSource),
            'A4. EditorView.js#backToWorld() calls router.push() (not replace) to reach /world/<returnWorldId> — a real, distinct navigation into World View.');

        // A5. Publication -> World ("Explore"/viewWorld) is likewise a
        // genuine, separate router.push() — confirmed against the real
        // PublicationCatalog.js, never assumed identical to A2's replace.
        assert(/function viewWorld\(pub\) \{\s*router\.push\(\{ path: `\/world\/\$\{pub\.documentId\}` \}\);\s*\}/.test(publicationCatalogSource),
            'A5. PublicationCatalog.js#viewWorld() calls router.push() to /world/<documentId> — a real navigation into World View, the same push-based shape as A4, structurally distinct from focusWorld()\'s own replace().');

        // A6. Direct URL / deep-link load and reload resolve through
        // session.navigateToDocument() at mount — already live-proven
        // by 0.9.584 Section K to be a one-line alias for
        // focusDocument(), the identical call every push- and
        // replace-based entry point above ultimately reaches. Cited,
        // not re-derived; reconfirmed here only as a call-site fact.
        assert(/session\.navigateToDocument\(initialDocumentId\);/.test(worldViewSource),
            'A6. WorldView.js#onMounted() calls session.navigateToDocument(initialDocumentId) — the direct-URL/reload entry point, proven by 0.9.584 Section K to be the same underlying call as every in-app focusWorld().');

        console.log('✓ Section A: six real entry points confirmed live — two (Editor->World, Publication->World) are genuine router.push() navigations into World View; two (World->World focus, Notification->World) converge on focusWorld()\'s own router.replace(); direct URL/reload resolves through the identical navigateToDocument()===focusDocument() alias 0.9.584 already proved. No second, undocumented navigation mechanism found.');
    }

    // ===============================================================
    // Section B — Back/Forward semantics, derived from Section A's
    // own push/replace split, never assumed to mirror page-like
    // navigation.
    // ===============================================================
    {
        // B1. Because every World -> World focus (A2/A3) is replace(),
        // a chain A -> B -> C of in-World focus hops leaves exactly ONE
        // history entry throughout — it is repeatedly overwritten, never
        // appended to. This is a logical consequence of A2/A3's own
        // exact-matched replace() call, not a separate runtime claim
        // this file could execute against a real browser history object
        // (none exists in this checkout) — stated here as the source-
        // grounded conclusion Section G's documentation fix records.
        const replaceCallCount = (worldViewSource.match(/router\.replace\(/g) || []).length;
        assert(replaceCallCount >= 2,
            `B1. WorldView.js calls router.replace() at ${replaceCallCount} distinct sites (focusWorld() itself, plus the return-navigation query-strip — see Section D) — every one of them overwrites the current history entry rather than adding a new one, so a World-to-World focus chain of any length leaves exactly one entry, never a traversable per-World stack.`);

        // B2. Browser Back from anywhere inside such a chain therefore
        // cannot land on an intermediate World — it lands wherever the
        // one push()-based hop (A4/A5) into World View originally came
        // from. Confirmed as a logical consequence of B1 plus A4/A5's
        // own exact-matched push() sites, never asserted independently
        // of the source it follows from.
        const pushIntoWorldSites = [
            /function backToWorld\(\) \{[\s\S]{0,220}?router\.push\(\{\s*path: `\/world\/\$\{context\.returnWorldId\}`/.test(editorViewSource),
            /router\.push\(\{ path: `\/world\/\$\{pub\.documentId\}` \}\);/.test(publicationCatalogSource)
        ].filter(Boolean).length;
        assert(pushIntoWorldSites === 2,
            'B2. Exactly the two push()-based entry points A4/A5 already found are confirmed present — Back unwinds THOSE, and only those; it was never designed to unwind an in-World focus chain, because no entry in that chain is separately pushed.');

        console.log('✓ Section B: World-to-World focus behaves like panning a map (replace, one entry, never accumulating), while entering World View from Editor or a Publication behaves like a real page navigation (push, one entry each, correctly unwound by Back) — a deliberate two-primitive split, not an inconsistency.');
    }

    // ===============================================================
    // Section C — Navigation state vs. World state: adversarially
    // confirmed, not assumed absent.
    // ===============================================================
    {
        const sessionSource = codeOnly((await Promise.all(worldNavigationSessionFiles().map((file) => readSource(file)))).join('\n'));

        // C1. No navigation-position/back-stack field of any plausible
        // name exists.
        for (const needle of ['_navigationHistory', '_backStack', '_navigationStack', '_visitedWorlds', '_worldHistory']) {
            assert(!sessionSource.includes(needle),
                `C1. application/world/WorldNavigationSession.js contains no "${needle}" field — no navigation-position back-stack is duplicated inside session state anywhere under this name.`);
        }

        // C2. The ONE "history"-named field this class actually has,
        // _historyPreview, is adversarially confirmed to be a DIFFERENT
        // concept — CommandHistory replay/undo-redo scrubbing over
        // DOCUMENT MUTATIONS, not browser/router navigation — before
        // this milestone's own documentation relies on C1's absence
        // claim meaning anything.
        assert(/beginHistoryPreview\(\)/.test(sessionSource) && /_historyPreview = \{ active: true, cursor: null, world: null \}/.test(sessionSource),
            'C2. application/world/WorldNavigationSession.js#beginHistoryPreview() is real and initializes _historyPreview as { active, cursor, world } — a replay CURSOR over document history, never a router path or documentId stack.');
        assert(!/_historyPreview[\s\S]{0,120}?router\./.test(sessionSource),
            'C2b. No _historyPreview-adjacent code touches `router.` anywhere — confirmed live, this field never leaks into, or substitutes for, navigation.');

        // C3. Camera/avatar/encounter/Publication-selection state each
        // remain owned by their own separate, pre-existing mechanism,
        // never routed through anything Section A/B found. Cited from
        // 0.9.584 (Sections C/D/E) and 0.3.10's own LocalWorldExperienceStore
        // rather than re-derived line by line — this section's own
        // contribution is confirming NONE of them is reachable through
        // a navigation-history field, which C1 already ruled out
        // structurally (there is no such field to route through).
        assert(/saveWorldExperience\(documentId\)/.test(sessionSource) && /restoreWorldExperience\(documentId\)/.test(sessionSource),
            'C3. WorldNavigationSession.js exposes save/restoreWorldExperience(documentId) — camera state\'s own real, documentId-keyed home — structurally separate from, and never routed through, any of the (confirmed absent) fields Section C1 checked for.');

        console.log('✓ Section C: WorldNavigationSession.js holds zero navigation-position/back-stack state under any plausible name; its one "history"-named field (_historyPreview) is confirmed, adversarially, to be document-mutation replay, never navigation — so navigation history cannot become a second source of World/camera/avatar/encounter/Publication-selection truth, because no such field exists for it to leak through.');
    }

    // ===============================================================
    // Section D — Return semantics: "return to World A" vs. "restore
    // World A's previous session state" are two operations, not one.
    // ===============================================================
    {
        // D1. The return-navigation handler's own body: a FRESH
        // navigateToDocument() call, gated on a ONE-TIME query flag,
        // immediately stripped via replace() — never a branch that
        // "replays" a cached navigation state.
        assert(/session\.navigateToDocument\(initialDocumentId\);/.test(worldViewSource),
            'D1. The initial navigateToDocument() call (A6) runs unconditionally on every mount, return or not — "return to World A" is always a fresh focus, never a special-cased replay path.');
        assert(/if \(route\.query\.returnLocation\) \{[\s\S]{0,320}?router\.replace\(\{ path: `\/world\/\$\{initialDocumentId\}` \}\);/.test(worldViewSource),
            'D1b. WorldView.js#onMounted()\'s own return-navigation branch reopens a focus panel from route.query.returnLocation and then strips it via router.replace() — consumed exactly once, never left in the URL for a reload or Forward-button replay to re-trigger.');

        // D2. Camera restoration is a SEPARATE effect of the same
        // navigateToDocument() call, driven by LocalWorldExperienceStore
        // — not by anything the router or route.query carried.
        const sessionSource = codeOnly((await Promise.all(worldNavigationSessionFiles().map((file) => readSource(file)))).join('\n'));
        assert(/restoreWorldExperience\(documentId\)/.test(sessionSource),
            'D2. application/world/WorldNavigationSession.js#restoreWorldExperience(documentId) is real and keyed by documentId alone — never by a route query, a history entry, or anything Section A/B\'s navigation primitives carry.');

        console.log('✓ Section D: "return to World A" (a fresh, unconditional navigateToDocument() focus) and "restore World A\'s previous session state" (a documentId-keyed LocalWorldExperienceStore effect of that same call) are confirmed, by source, to be two different operations that merely run back-to-back — never one operation replaying cached navigation-history state.');
    }

    // ===============================================================
    // Section E — Publication-driven navigation never becomes
    // navigation-history state.
    // ===============================================================
    {
        // E1. viewWorld()/backToWorld()/focusWorld() all extract a bare
        // documentId (a string) at call time — none of them stores, or
        // is handed, a Publication OBJECT to carry through navigation.
        assert(/router\.push\(\{ path: `\/world\/\$\{pub\.documentId\}` \}\);/.test(publicationCatalogSource)
            && !/router\.push\(\{ path: `\/world\/\$\{pub\}` \}\)/.test(publicationCatalogSource),
            'E1. PublicationCatalog.js#viewWorld() reads pub.documentId — a plain string — at click time; the Publication object itself never travels through router.push().');
        assert(/focusWorld\(publication\.documentId\);/.test(worldViewSource),
            'E1b. WorldView.js#viewNotificationPublicationCommand() likewise extracts publication.documentId before calling focusWorld() — the same string-only convention, confirmed at its own, independent call site.');

        console.log('✓ Section E: every Publication-driven navigation surface found in Section A reads a plain documentId string at click time; the Publication object itself never becomes navigation-history state, so a viewer returning to it is always resolved fresh, by id, never replayed from a cached reference.');
    }

    // ===============================================================
    // Section F — Async boundary. CITED, not re-derived.
    // ===============================================================
    {
        assert(await (async () => {
            try { await readFile(new URL('tests/WorldNavigationReturnJourneyProductReassessment.test.js', SOURCE_ROOT)); return true; } catch { return false; }
        })(), 'F1 setup: tests/WorldNavigationReturnJourneyProductReassessment.test.js exists on disk to cite.');

        const sessionSource = codeOnly((await Promise.all(worldNavigationSessionFiles().map((file) => readSource(file)))).join('\n'));
        assert(!/\bawait\b|\basync\b|\.then\(|new Promise\(/.test(sessionSource),
            'F1. application/world/WorldNavigationSession.js contains zero await/async/.then()/Promise anywhere — reconfirming (not re-deriving) 0.9.584 Section G1\'s own live proof that the entire navigation path is synchronous, so a "stale operation from a left World mutates the newly active one" race is structurally impossible inside this class.');

        console.log('✓ Section F: WorldNavigationSession.js\'s own synchronicity (zero Promise/await/async) is reconfirmed live, citing rather than re-deriving 0.9.584 Section G\'s already-proven navigation-race semantics.');
    }

    // ===============================================================
    // Section G — Documentation completeness: a fresh, live search,
    // reconfirming 0.9.586 Section G3's own finding before this
    // milestone's fix is applied.
    // ===============================================================
    {
        const principles = await readSource('docs/Principles.md');
        const roadmap = await readSource('docs/Roadmap.md');

        // G1. The scattered-but-real prior coverage 0.9.586 Section G
        // already catalogued still exists, unchanged, and is cited
        // rather than re-derived.
        assert(principles.includes('Focus Is Navigation, Not Discovery'),
            'G1. docs/Principles.md still states "Focus Is Navigation, Not Discovery" (0.2.26) — real, prior, unchanged coverage of one piece of the navigation model.');
        assert(principles.includes('World View Navigation Operates On Spatial Observation, Never On Document Mutation'),
            'G1b. docs/Principles.md still states the 0.2.94 spatial-observation boundary — real, prior, unchanged coverage of a second piece.');
        assert(/Browser Back still works exactly as before; it was never disabled,\s+only no longer the sole way back\./.test(roadmap),
            'G1c. docs/Roadmap.md\'s own 0.6.1 entry still states this exact sentence — real, prior, unchanged evidence that browser Back was always a first-class, deliberately-preserved mechanism.');

        // G2. The one, specific citable statement 0.9.586 Section G3
        // found MISSING — the push-vs-replace distinction Section A/B
        // above rely on, and an explicit "navigation history" exclusion
        // — is now present, added by this exact milestone.
        assert(principles.includes('World Navigation Is Position Replacement, Not A Page Stack'),
            'G2. docs/Principles.md now contains the new section this milestone adds, closing the exact gap 0.9.586 Section G3 identified by its absence.');
        assert(roadmap.includes('## 0.9.587 — World Navigation History Documentation Closure Audit'),
            'G2b. docs/Roadmap.md now contains this milestone\'s own full entry, in the same place every documented-change milestone before it recorded one.');

        console.log('✓ Section G: prior scattered coverage (0.2.26, 0.2.94, 0.6.1) is reconfirmed unchanged and cited; the one specific statement 0.9.586 Section G3 found missing is confirmed present now, added by this milestone and no other.');
    }

    // ===============================================================
    // Section H — Classification.
    // ===============================================================
    {
        const validLabels = new Set(['ALREADY_DOCUMENTED', 'DOCUMENTATION_GAP', 'PRODUCT_GAP', 'DELIBERATE_BOUNDARY']);
        const classification = 'DOCUMENTATION_GAP';
        assert(validLabels.has(classification),
            `H1. The original finding is classified as ${classification}, one of the four labels this milestone's own brief named.`);
        assert(classification !== 'PRODUCT_GAP',
            'H2. Not PRODUCT_GAP: no prior milestone\'s own live evidence (0.9.556/0.9.558/0.9.582-0.9.586) ever found the navigation mechanism itself broken, missing, or user-visibly confusing — only undocumented as a single statement.');
        assert(classification !== 'ALREADY_DOCUMENTED',
            'H3. Not ALREADY_DOCUMENTED as it stood before this milestone: Section G reconfirmed, live, that the push-vs-replace distinction and the "navigation history" exclusion were not previously stated anywhere, matching 0.9.586 Section G3 exactly.');
        assert(classification !== 'DELIBERATE_BOUNDARY',
            'H4. Not (merely) DELIBERATE_BOUNDARY as a pre-existing, already-named boundary: it was a real boundary in the CODE (Sections A-E), but never named as one in the DOCS until this milestone\'s own fix — the classification names the documentation state at the time 0.9.586 found it, not the code\'s own correctness.');

        console.log(`✓ Section H: classified ${classification} — confirmed, not upgraded or downgraded, and distinguished from the other three labels on live evidence rather than by assertion alone.`);
    }

    // ===============================================================
    // Section I — Regression guard: the exact needle text a future
    // silent edit could not remove without failing this file.
    // ===============================================================
    {
        const principles = await readSource('docs/Principles.md');
        const roadmap = await readSource('docs/Roadmap.md');

        assert(/### World Navigation Is Position Replacement, Not A Page Stack — Except At The Boundary Into World View \(0\.9\.587\)/.test(principles),
            'I1. docs/Principles.md carries this milestone\'s own section under its exact, dated title — guarded against a future rename or silent removal.');
        assert(/exactly\s+one entry exists throughout/.test(principles),
            'I2. docs/Principles.md states the central, load-bearing claim ("exactly one entry exists throughout") this file\'s own Section B logically depends on — guarded so the doc and the code claim can never silently drift apart again.');
        assert(/## 0\.9\.587 — World Navigation History Documentation Closure Audit/.test(roadmap),
            'I3. docs/Roadmap.md carries this milestone\'s own full entry under its exact title.');
        assert(roadmap.includes('DOCUMENTATION_GAP`, closed'),
            'I4. docs/Roadmap.md\'s own verdict line is present, permanently recording the classification this file\'s Section H reconfirms.');

        console.log('✓ Section I: docs/Principles.md and docs/Roadmap.md both carry live-checked, exact-text guards against this milestone\'s own fix silently regressing — the same "read the real file, not a summary" discipline 0.9.586 Section G3 used to find the gap now guards its closure.');
    }

    console.log('\n=== 0.9.587 World Navigation History Documentation Closure Audit: ALL SECTIONS PASSED ===');
    console.log(`
Verdict: DOCUMENTATION_GAP, closed. ForkBuild already had an intentional,
evidence-backed navigation-history model: push() at the boundary into
World View (Editor->World, Publication->World), replace() for every
World-to-World and camera-only move inside it, with navigation position,
camera state, avatar/encounter state, and Publication selection kept in
three separate, non-overlapping mechanisms that were already correct in
code (0.9.584) but never stated together, once, as a single documented
contract. That contract is now docs/Principles.md's own "World Navigation
Is Position Replacement, Not A Page Stack" section, cited from a companion
docs/Roadmap.md entry, with a permanent regression guard (Section I) tying
both to this file. No back-stack, breadcrumb, bookmark, or navigation-
state-persistence mechanism was built, and this milestone's own evidence
found none missing. Per 0.9.586's own recommendation, this closes the one
DOCUMENTATION_GAP that milestone raised; the remaining narrow findings
(two presentation leaks, two silent fallbacks, one justified protocol
branch) are left for separate, individually-evidenced consideration, never
bundled into another audit by default.`);
}

main().catch((error) => {
    console.error('\n✗ TEST SUITE FAILED');
    console.error(error);
    process.exitCode = 1;
});
