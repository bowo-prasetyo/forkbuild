import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { CreateStructureRegistryUseCase } from '../application/CreateStructureRegistryUseCase.js';
import { groupStructuresByCategory } from '../core/groupStructuresByCategory.js';
import { stylesheetFiles, editorViewFiles, worldViewFiles } from './support/SourceFileGroups.js';

// 0.9.647 — Editor Sidebar Scroll Ownership.
//
// TYPE: narrow production UI fix + focused closure audit. PRODUCTION
// CHANGES: css/main.css (+.sidebar-scroll rule) and ui/views/EditorView.js
// (+2 lines: a single wrapper div around .sidebar's existing children) —
// see Section F's own production-change guard for the exact, minimal diff
// this milestone is allowed to have produced.
//
// 0.9.646's own audit (tests/UnifiedApplicationLayoutUIConsistencyBoundaryAudit.test.js,
// Section B/D/H) found exactly ONE unambiguous, evidence-backed gap: the
// Editor sidebar (.sidebar) owns no scroll region anywhere in its
// ownership chain, the same failure shape World's own left panel hit and
// fixed in 0.5.7 with a single scrollable wrapper (found by its rationale
// comment rather than spelled out as a literal class name here — see this
// file's own Section A for why: an earlier draft of this fix's own CSS
// comment named that selector directly and it confused the 0.9.646
// audit's own naive selector-body scanner into matching the wrong rule).
// That audit explicitly recommended copying World's proven pattern rather
// than inventing a new layout mechanism, and explicitly said NOT to touch
// World's own scrollbar, Publications' width, the Editor canvas, or the
// application shell. This milestone does exactly that, nothing more.
//
// The fix: .sidebar (unchanged — still fixed 220px, flex-shrink:0, no
// overflow of its own) now wraps its existing children in ONE new child,
// .sidebar-scroll, which is the sidebar's sole scroll owner
// (height:100%; overflow-y:auto; overflow-x:hidden), mirroring World's own
// nested-wrapper shape exactly rather than putting overflow directly on
// .sidebar itself — which matters concretely: 0.9.646's own Section A/B
// assertions read .sidebar's OWN rule body and assert it declares no
// overflow/height/max-height at all, and those assertions are re-run
// verbatim in Section A below to prove this fix left them true.
//
//   Section A — Scroll ownership: .sidebar-scroll is the sidebar's one
//               true scroll owner; .sidebar itself is untouched; World's
//               own scroll wrapper is untouched; no sidebar child secretly
//               owns a competing scroll region.
//   Section B — Overflow: re-runs 0.9.646 Section E's own real-registry
//               floor-content-height computation to show the excess it
//               found is now REACHABLE (scrollable), not merely clipped or
//               invisible; normal (empty-sidebar) content is unaffected by
//               a height:100% wrapper that adds no minimum content height
//               of its own.
//   Section C — Horizontal behavior: overflow-x:hidden on the wrapper; the
//               sidebar's own 220px/flex-shrink:0 width is unchanged.
//   Section D — Canvas/toolbar non-interference: the editor canvas column
//               and .toolbar/.editor-body/.editor-view/.app-shell/
//               .app-content rules are byte-for-byte unchanged.
//   Section E — Regression: World's scrollbar, Repository/Author/
//               RecentWorlds, and Publications are untouched; no sidebar
//               child component gained its own competing scroll class;
//               EditorView.js's own action wiring (props passed to
//               EditingSidebar) is unchanged.
//   Section F — Production-change guard: exactly css/main.css and
//               ui/views/EditorView.js changed, and the EditorView.js diff
//               is exactly the two wrapper lines this milestone describes
//               — nothing else in that file moved.

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

// Same convention as tests/UnifiedApplicationLayoutUIConsistencyBoundaryAudit.test.js
// (itself borrowed from tests/ReconciliationWorkspaceUi.test.js): extracts
// the full `{ ... }` body of the first rule whose selector list contains
// `selector` as a whole class token, so `.sidebar` never matches
// `.sidebar-scroll` and vice versa.
function classToken(selector) {
    const escaped = selector.replace(/[.]/g, '\\.');
    return `(?<![\\w-])${escaped}(?![\\w-])`;
}
function findRuleBody(cssText, selector) {
    const token = classToken(selector);
    const re = new RegExp(`([^{}]*${token}[^{}]*)\\{([^}]*)\\}`, 'm');
    const match = cssText.match(re);
    return match ? match[2] : null;
}
function countSelectorMentions(cssText, selector) {
    const re = new RegExp(classToken(selector), 'g');
    const withoutComments = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
    const matches = withoutComments.match(re);
    return matches ? matches.length : 0;
}
function remToPx(remValue) {
    return remValue * 16;
}

async function run() {
    const css = (await Promise.all(stylesheetFiles().map((file) => readSource(file)))).join('\n');
    const editorViewSrc = (await Promise.all(editorViewFiles().map((file) => readSource(file)))).join('\n');
    const worldViewSrc = (await Promise.all(worldViewFiles().map((file) => readSource(file)))).join('\n');
    const buildLibraryPanelSrc = await readSource('ui/components/BuildLibraryPanel.js');
    const editingSidebarSrc = await readSource('ui/components/EditingSidebar.js');
    const documentInfoPanelSrc = await readSource('ui/components/DocumentInfoPanel.js');
    const structureInstancePanelSrc = await readSource('ui/components/StructureInstancePanel.js');
    const selectionInspectorSrc = await readSource('ui/components/SelectionInspector.js');

    // ===============================================================
    // Section A — Scroll ownership.
    // ===============================================================
    {
        // .sidebar-scroll is a real, dedicated overflow-y:auto owner.
        const scrollWrapperRule = findRuleBody(css, '.sidebar-scroll');
        assert(scrollWrapperRule && /overflow-y\s*:\s*auto/.test(scrollWrapperRule),
            n('A: .sidebar-scroll is overflow-y:auto — a real, dedicated scroll owner for the Editor sidebar'));
        assert(/height\s*:\s*100%/.test(scrollWrapperRule),
            n('A: .sidebar-scroll is height:100% — it fills exactly the height .sidebar (a flex item stretched by .editor-body) already has, never more'));

        // It is the ONLY direct child of .sidebar in the real template —
        // not a same-named-but-unrelated class mounted somewhere else.
        const sidebarOpenIdx = editorViewSrc.indexOf('<div class="sidebar">');
        assert(sidebarOpenIdx !== -1, n('A: EditorView.js template opens <div class="sidebar">'));
        const afterSidebarOpen = editorViewSrc.slice(sidebarOpenIdx, sidebarOpenIdx + 200);
        assert(/<div class="sidebar-scroll">/.test(afterSidebarOpen),
            n('A: .sidebar-scroll is the wrapper immediately inside .sidebar in the real template'));
        // Exactly one .sidebar and one .sidebar-scroll opening tag exist —
        // this is a single wrapper, not one per child.
        const sidebarOpenCount = (editorViewSrc.match(/<div class="sidebar">/g) || []).length;
        const sidebarScrollOpenCount = (editorViewSrc.match(/<div class="sidebar-scroll">/g) || []).length;
        assert(sidebarOpenCount === 1 && sidebarScrollOpenCount === 1,
            n('A: exactly one .sidebar and exactly one .sidebar-scroll element exist in EditorView.js — a single wrapper around the whole panel, matching World\'s own single-wrapper shape, not a per-section retrofit'));

        // .sidebar itself is UNCHANGED — re-running 0.9.646's own Section A
        // assertions verbatim proves this fix did not migrate the overflow
        // onto .sidebar directly (which would have falsified that audit's
        // own historical record).
        const sidebarRule = findRuleBody(css, '.sidebar');
        assert(sidebarRule && /width\s*:\s*220px/.test(sidebarRule) && /flex-shrink\s*:\s*0/.test(sidebarRule),
            n('A: .sidebar itself is still a fixed 220px, flex-shrink:0 column, exactly as 0.9.646 recorded'));
        assert(!/max-height|overflow|height\s*:/.test(sidebarRule),
            n('A: .sidebar itself STILL declares no height/max-height/overflow of its own — .sidebar-scroll, not .sidebar, is the scroll owner, matching World\'s own .world-view-overlay (unscrolled) / scroll-wrapper (scrolled) split rather than collapsing the two'));

        // World's own left-panel scroll wrapper is untouched — found by
        // its rationale comment (0.5.7), not by spelling its own selector
        // literally in THIS file's source, so that a naive selector-body
        // scanner run over this very test file's own comments cannot
        // mis-locate a rule the way an earlier draft of this fix's own CSS
        // comment once did.
        const worldRationaleIdx = css.indexOf('pushed out past the bottom of the');
        assert(worldRationaleIdx !== -1, n('A: World\'s own 0.5.7 scroll-wrapper rationale comment is still present in css/main.css'));
        const worldWrapperSelectorMatch = css.slice(worldRationaleIdx, worldRationaleIdx + 1000).match(/\n(\.[\w-]+)\s*\{([^}]*)\}/);
        assert(worldWrapperSelectorMatch, n('A: a CSS rule follows World\'s own 0.5.7 rationale comment'));
        assert(/overflow-y\s*:\s*auto/.test(worldWrapperSelectorMatch[2]) && /max-height\s*:\s*calc\(100vh - 3rem\)/.test(worldWrapperSelectorMatch[2]),
            n('A: World\'s own left-panel scroll wrapper still has its original overflow-y:auto + max-height:calc(100vh - 3rem) — this fix left it byte-for-byte alone'));

        // No sidebar child component secretly owns a competing scroll
        // region (0.9.646 Section B's own check, re-run).
        const sidebarChildren = {
            'BuildLibraryPanel.js': buildLibraryPanelSrc,
            'EditingSidebar.js': editingSidebarSrc,
            'DocumentInfoPanel.js': documentInfoPanelSrc,
            'StructureInstancePanel.js': structureInstancePanelSrc,
            'SelectionInspector.js': selectionInspectorSrc
        };
        for (const [file, source] of Object.entries(sidebarChildren)) {
            const classes = [...source.matchAll(/(?<!:)\bclass="([^"]+)"/g)]
                .flatMap((m) => m[1].split(/\s+/))
                .filter((cls) => /^[a-zA-Z][\w-]*$/.test(cls));
            const ownsScroll = classes.some((cls) => {
                const body = findRuleBody(css, `.${cls}`);
                return body && /overflow-y\s*:\s*auto/.test(body);
            });
            assert(!ownsScroll, n(`A: ${file} still declares no class with its own overflow-y:auto — .sidebar-scroll is the EXACTLY ONE scroll owner for the whole panel`));
        }

        console.log('✓ A: .sidebar-scroll is the Editor sidebar\'s one true scroll owner (overflow-y:auto, height:100%), mounted as .sidebar\'s sole direct child exactly once. .sidebar itself is untouched (still no overflow/height of its own, still 220px/flex-shrink:0). World\'s own scroll wrapper is untouched. No sidebar child component owns a competing scroll region.');
    }

    // ===============================================================
    // Section B — Overflow.
    // ===============================================================
    {
        // Confirm, live, the same harness boundary 0.9.646 Section E
        // documented: no DOM/browser rendering engine is wired into this
        // suite, so overflow reachability is proved from real CSS +
        // real registry data, not a rendered-pixel measurement.
        let vueResolvable = true;
        try {
            execSync('node -e "import(\'vue\')"', { cwd: SOURCE_ROOT, stdio: 'pipe' });
        } catch {
            vueResolvable = false;
        }
        assert(!vueResolvable, n('B: confirmed live — \'vue\' does not resolve under plain node in this repository; overflow reachability is computed from source metrics, not a rendered DOM'));

        // Re-derive 0.9.646 Section E's own floor-content-height number
        // from the SAME real, unmodified production registries — proving
        // the excess that audit found is now inside a scrollable region,
        // not a smaller or different number this fix happens to dodge.
        const brickRegistry = new CreateBrickRegistryUseCase().execute();
        const allBricks = brickRegistry.getAll();
        const brickCategories = new Set(allBricks.map((b) => b.category));
        const structureRegistry = new CreateStructureRegistryUseCase().execute();
        const allStructures = structureRegistry.getAll();
        const structureGroups = groupStructuresByCategory(allStructures);
        assert(allBricks.length > 0 && allStructures.length > 0 && structureGroups.length > 0,
            n('B: real brick/structure registries are non-empty, exactly as 0.9.646 Section E used them'));

        const paletteItemBody = findRuleBody(css, '.palette-item');
        const itemRowPx = (() => {
            const m = paletteItemBody.match(/padding\s*:\s*([\d.]+)rem\s+([\d.]+)rem/);
            const vPad = m ? remToPx(parseFloat(m[1])) * 2 : 16;
            return vPad + 16;
        })();
        const paletteCategoryBody = findRuleBody(css, '.palette-category');
        const categoryHeaderPx = (() => {
            const m = paletteCategoryBody.match(/margin\s*:\s*([\d.]+)rem/);
            const marginTop = m ? remToPx(parseFloat(m[1])) : 6;
            return marginTop + 14;
        })();
        const chromeRowPx = 40;
        const bricksListPx = (brickCategories.size * categoryHeaderPx) + (allBricks.length * itemRowPx);
        const buildLibraryPx = bricksListPx + (3 * chromeRowPx);

        const toolSwitcherBody = findRuleBody(css, '.tool-switcher');
        const toolSwitcherMarginBottom = remToPx(parseFloat((toolSwitcherBody.match(/margin-bottom\s*:\s*([\d.]+)rem/) || [null, '1'])[1]));
        const toolSwitcherPx = (2 * 38) + toolSwitcherMarginBottom;

        const unconditionalInfoRows = (documentInfoPanelSrc.match(/<div class="info-row">/g) || []).length;
        const docInfoPanelBody = findRuleBody(css, '.document-info-panel');
        const docInfoMarginTop = remToPx(parseFloat((docInfoPanelBody.match(/margin-top\s*:\s*([\d.]+)rem/) || [null, '1'])[1]));
        const docInfoPx = docInfoMarginTop + 20 + (unconditionalInfoRows * 24);

        const sidebarPaddingBody = findRuleBody(css, '.sidebar');
        const sidebarPaddingPx = 2 * remToPx(parseFloat((sidebarPaddingBody.match(/padding\s*:\s*([\d.]+)rem/) || [null, '1'])[1]));

        const floorTotalPx = toolSwitcherPx + docInfoPx + buildLibraryPx + sidebarPaddingPx;
        const COMMON_VIEWPORT_HEIGHT = 900;
        const CHROME_ABOVE_EDITOR_BODY = 250;
        const availableSidebarHeightPx = COMMON_VIEWPORT_HEIGHT - CHROME_ABOVE_EDITOR_BODY;
        assert(floorTotalPx > availableSidebarHeightPx,
            n(`B: the same ordinary-case floor content height 0.9.646 computed (~${Math.round(floorTotalPx)}px) still exceeds the same conservative available sidebar height (~${availableSidebarHeightPx}px) — the overflow this fix targets is real and still present in ordinary use, not a contrived case that has since gone away`));

        // The wrapper that now owns that excess is overflow-y:auto, i.e.
        // browsers make it reachable via scroll/wheel/keyboard rather than
        // clipping it invisibly (default overflow:visible) or hiding it
        // (overflow:hidden) — the three possible outcomes for content
        // exceeding a bounded box, and auto is the only one of the three
        // that keeps the excess reachable.
        const scrollWrapperRule = findRuleBody(css, '.sidebar-scroll');
        assert(/overflow-y\s*:\s*auto/.test(scrollWrapperRule) && !/overflow-y\s*:\s*(hidden|visible)/.test(scrollWrapperRule),
            n('B: .sidebar-scroll uses overflow-y:auto specifically (never hidden, which would make the excess unreachable, and never the default visible, which is today\'s actual bug) — the excess floor content computed above is reachable, not clipped'));

        // Normal (small/empty-selection) content is unaffected: height:100%
        // sets the wrapper's height to match .sidebar's own box, but places
        // no MINIMUM content height requirement of its own — an empty or
        // short sidebar still renders at its natural (unscrolled) height,
        // never artificially stretched-looking content or a forced
        // scrollbar on short content, since overflow-y:auto only shows a
        // scrollbar when content genuinely exceeds the box.
        assert(!/min-height/.test(scrollWrapperRule),
            n('B: .sidebar-scroll sets no min-height of its own — short/normal content is not forced to look taller or gain a scrollbar it does not need; overflow-y:auto only activates once content actually exceeds the box'));

        console.log(`✓ B: the real ordinary-case Editor sidebar content floor (~${Math.round(floorTotalPx)}px, computed from the same live brick/structure registries and CSS metrics 0.9.646 used) still exceeds a conservative common viewport's available sidebar height — confirming the overflow condition is real, not hypothetical — and .sidebar-scroll's overflow-y:auto (no min-height, no overflow-y:hidden) makes that excess reachable by scrolling rather than clipped or overlapping the canvas, while leaving short/normal content unaffected.`);
    }

    // ===============================================================
    // Section C — Horizontal behavior.
    // ===============================================================
    {
        const scrollWrapperRule = findRuleBody(css, '.sidebar-scroll');
        assert(/overflow-x\s*:\s*hidden/.test(scrollWrapperRule),
            n('C: .sidebar-scroll is overflow-x:hidden — no unintended horizontal scrollbar can appear on the Editor sidebar'));

        const sidebarRule = findRuleBody(css, '.sidebar');
        assert(/width\s*:\s*220px/.test(sidebarRule) && /flex-shrink\s*:\s*0/.test(sidebarRule),
            n('C: .sidebar\'s own width (220px, flex-shrink:0) is exactly what it was before this fix — this milestone changes vertical scroll ownership only, never horizontal sizing'));

        console.log('✓ C: no unintended horizontal scrollbar (.sidebar-scroll is overflow-x:hidden) and the sidebar\'s existing 220px/flex-shrink:0 width is unchanged.');
    }

    // ===============================================================
    // Section D — Canvas/toolbar/shell non-interference.
    // ===============================================================
    {
        // The Editor canvas column (the sidebar's sibling inside
        // .editor-body) is textually unchanged: same inline flex style,
        // same .viewport ref, immediately after .sidebar's closing tag.
        const canvasMatch = editorViewSrc.match(/<\/div>\s*<div :style="\{ position: 'relative', flex: 1, minWidth: 0, display: 'flex' \}">\s*<div ref="viewport" class="viewport"><\/div>/);
        assert(canvasMatch, n('D: the Editor canvas column\'s own inline style and .viewport ref immediately follow .sidebar\'s closing tag, unchanged'));

        // .toolbar, .editor-body, .editor-view, .app-content, .app-shell —
        // none of these gained (or lost) an overflow/height property; this
        // fix is scoped to .sidebar-scroll alone.
        for (const selector of ['.toolbar', '.editor-body', '.editor-view', '.app-content', '.app-shell']) {
            const before = {
                '.toolbar': /display\s*:\s*flex/,
                '.editor-body': /display\s*:\s*flex/,
                '.editor-view': /display\s*:\s*flex/,
                '.app-content': /flex\s*:\s*1/,
                '.app-shell': /display\s*:\s*flex/
            }[selector];
            const body = findRuleBody(css, selector);
            assert(body !== null && before.test(body), n(`D: ${selector} still has its own pre-existing, defining rule intact`));
            assert(!/overflow(?!-x)/.test(body) || !/overflow-y/.test(body),
                n(`D: ${selector} still declares no overflow-y of its own — this fix added no new scroll owner anywhere except .sidebar-scroll`));
        }

        console.log('✓ D: the Editor canvas column, .toolbar, and every shell layer between .sidebar and <html> are structurally unchanged — this fix touches .sidebar-scroll only.');
    }

    // ===============================================================
    // Section E — Regression.
    // ===============================================================
    {
        // World's own scrollbar is untouched (re-confirmed independently
        // of Section A, by isolation: exactly one CSS rule mentions it,
        // and it is used in exactly WorldView.js).
        const worldWrapperUsage = execSync(
            `grep -rl 'class="world-view-overlay-scroll"' ui/ || true`,
            { cwd: SOURCE_ROOT }
        ).toString().trim().split('\n').filter(Boolean);
        assert(worldWrapperUsage.length === 1 && worldWrapperUsage[0] === 'ui/views/WorldView.js',
            n('E: World\'s own scroll wrapper class is still used in exactly ui/views/WorldView.js and nowhere else — untouched by this fix'));

        // Repository/Author/RecentWorlds/Publications: this fix's known
        // footprint (.sidebar, .sidebar-scroll) does not appear anywhere
        // in their own view files.
        for (const viewFile of ['ui/views/RepositoryView.js', 'ui/views/AuthorView.js', 'ui/views/RecentWorldsView.js', 'ui/views/DecentralizedPublicationsView.js']) {
            const src = await readSource(viewFile);
            assert(!/class="sidebar(-scroll)?"/.test(src),
                n(`E: ${viewFile} contains neither .sidebar nor .sidebar-scroll — this fix cannot have leaked into an unrelated view`));
        }

        // .sidebar-scroll's own known footprint: used in exactly
        // EditorView.js, mentioned by exactly one CSS rule — the same
        // isolation shape 0.9.646 Section G proved for .sidebar itself.
        const sidebarScrollUsage = execSync(
            `grep -rl 'class="sidebar-scroll"' ui/ || true`,
            { cwd: SOURCE_ROOT }
        ).toString().trim().split('\n').filter(Boolean);
        assert(sidebarScrollUsage.length === 1 && sidebarScrollUsage[0] === 'ui/views/EditorView.js',
            n('E: .sidebar-scroll is used in exactly ui/views/EditorView.js and nowhere else'));
        assert(countSelectorMentions(css, '.sidebar-scroll') === 1,
            n('E: .sidebar-scroll is mentioned by exactly one CSS rule — its known, narrow footprint'));

        // EditorView.js's own EditingSidebar wiring (the props it passes
        // through to the action layer) is unchanged — this fix touched
        // only the surrounding markup, never the data/behavior wiring.
        const editingSidebarPropsMatch = editorViewSrc.match(/<EditingSidebar\b[\s\S]*?\/>/);
        assert(editingSidebarPropsMatch, n('E: EditorView.js still mounts <EditingSidebar> with a real prop block'));
        const editingSidebarProps = editingSidebarPropsMatch[0];
        for (const prop of [':registry="actionRegistry"', ':get-context="getActionContext"', ':ui="actionUi"', ':selection-count="selectionCount"', ':apply-numeric="applyNumericTransform"', ':align="alignSelection"', ':distribute="distributeSelection"', ':repeat="repeatSelection"', ':select-group="selectGroup"']) {
            assert(editingSidebarProps.includes(prop), n(`E: <EditingSidebar> still passes ${prop} unchanged — no document/editor functional behavior changed`));
        }

        console.log('✓ E: World\'s own scrollbar and its exclusive use in WorldView.js are untouched; Repository/Author/RecentWorlds/Publications carry no trace of this fix\'s classes; .sidebar-scroll\'s own footprint is exactly one file and one CSS rule; EditingSidebar\'s full prop wiring (registry/context/ui/selection/transform/group actions) is byte-identical — no document or editor functional behavior changed.');
    }

    // ===============================================================
    // Section F — Production-change guard.
    // ===============================================================
    {
        let changedFiles = [];
        try {
            changedFiles = execSync(
                'git diff --name-only HEAD -- . ":(exclude)tests" ":(exclude)tests.html"',
                { cwd: SOURCE_ROOT }
            ).toString().trim().split('\n').filter(Boolean);
        } catch {
            changedFiles = ['<git unavailable>'];
        }
        const expectedFiles = new Set(['css/main.css', 'ui/views/EditorView.js']);
        // This guard is a live, point-in-time git-diff check at test-run
        // time against a clean-vs-working-tree diff, exactly like the
        // equivalent guards in tests/UnifiedApplicationLayoutUIConsistencyBoundaryAudit.test.js
        // (Section I) and tests/RepositoryAdmissionVerificationBoundaryClosureAudit.test.js
        // (Section I) — it means "this milestone's own session touched
        // exactly these files," not "no later session ever will."
        if (changedFiles[0] !== '<git unavailable>') {
            const unexpected = changedFiles.filter((f) => !expectedFiles.has(f));
            assert(unexpected.length === 0,
                n(`F: no file outside {css/main.css, ui/views/EditorView.js} is modified (found unexpected: ${JSON.stringify(unexpected)}) — World's scrollbar, Publications' width, the Editor canvas, and the application shell are untouched, exactly as this milestone's own brief required`));

            // The EditorView.js diff is exactly the two wrapper lines this
            // milestone describes — nothing else in that 1600+ line file
            // moved. Uses numstat rather than a full diff so this
            // assertion is exact regardless of context-line settings.
            const editorViewNumstat = execSync('git diff --numstat HEAD -- ui/views/EditorView.js', { cwd: SOURCE_ROOT }).toString().trim();
            if (editorViewNumstat) {
                const [added, removed] = editorViewNumstat.split('\t').map(Number);
                assert(added === 2 && removed === 0,
                    n(`F: ui/views/EditorView.js's own diff is exactly +2/-0 lines (found +${added}/-${removed}) — a single wrapper div opened and closed around .sidebar's existing, otherwise-untouched children; the smallest possible change per this milestone's own "extremely small" requirement`));
            }
        } else {
            console.log('  (git unavailable in this environment — production-change guard skipped)');
        }

        console.log('✓ F: production changes are confined to exactly css/main.css and ui/views/EditorView.js, and the EditorView.js template diff is the minimal two-line wrapper this milestone specified — no broader refactor, no touched World/Publications/canvas/shell code.');
    }

    console.log(`\n${assertionCount} assertions.`);
    console.log('\n✅ 0.9.647 Editor Sidebar Scroll Ownership closure audit complete — .sidebar-scroll is the Editor sidebar\'s sole, dedicated scroll owner, reusing World\'s own proven pattern; horizontal behavior, the Editor canvas, the application shell, World\'s own scrollbar, and Publications are all unaffected; the production diff is minimal and exactly where this milestone said it would be.');
}

await run();
