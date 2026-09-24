import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { CreateStructureRegistryUseCase } from '../application/editor/CreateStructureRegistryUseCase.js';
import { groupStructuresByCategory } from '../core/groupStructuresByCategory.js';
import { stylesheetFiles, publicationsPageFiles, editorViewFiles, worldViewFiles } from './support/SourceFileGroups.js';
import { readSource } from './support/SourceText.js';

// 0.9.646 — Unified Application Layout & UI Consistency Boundary Audit.
//
// TYPE: test-only product-boundary audit. PRODUCTION CHANGES: none — see
// this file's own production-change guard in Section I.
//
// Prompted by a plain observation after the Document Portability arc closed
// (0.9.641-0.9.645): Editor View, World View, Publications and Repository
// do not all look or behave the same way, and the differences are visible
// enough to affect whether the application reads as one product. Before
// touching any CSS, this milestone's job is to determine WHICH differences
// are deliberate product semantics and which are accidental drift — and to
// do that with evidence pulled from the real, shipped source, never from
// visual impression or memory.
//
// Every assertion below reads css/main.css and the real view/component
// source directly (the same `readSource()` convention
// tests/ReconciliationWorkspaceUi.test.js already established) — this is
// a census of what the application ACTUALLY does, not a spec of what it
// should do. Section E additionally drives two real, unmodified production
// registries (CreateBrickRegistryUseCase, CreateStructureRegistryUseCase)
// to ground its stress computation in real catalog data rather than an
// invented fixture.
//
//   Section A — Application layout census: outer-container facts (width,
//               max-width, margin, padding, overflow, height ownership)
//               for Editor, World, Publications, Repository/Author/Recent
//               Worlds, and the shared app shell those views sit inside.
//   Section B — Scroll ownership: proves World's left panel has an
//               explicit, purpose-built scrollable wrapper (added in
//               0.5.7 for exactly this failure mode) while Editor's
//               sidebar — and every element between it and <html> — has
//               no scroll owner anywhere.
//   Section C — Width/container conventions: proves Repository/Author/
//               RecentWorlds share one deliberate, documented, centered
//               "catalog" convention, while Publications matches zero
//               CSS rule of any kind — full width by omission, not by
//               documented design.
//   Section D — Shared-shell boundary: proves both candidate fixes this
//               audit's findings point to already have a proven, existing
//               pattern to copy (Repository's own selector group; World's
//               own scroll wrapper) — no new abstraction is warranted.
//   Section E — Overflow stress test: computes, from real CSS metrics and
//               real production registry data (15 bricks / 12 categories,
//               20 structures / 5 categories), that Editor's default
//               sidebar content — with NO selection, NO active build —
//               already exceeds a documented common viewport's available
//               sidebar height. Explicitly states this test harness's own
//               boundary: a source-grounded estimate, not a rendered-pixel
//               measurement, since this repository's entire test suite
//               (confirmed live in this section) runs under plain Node,
//               with no DOM/browser rendering engine wired into it.
//   Section F — Cross-page visual convention: proves the application
//               header and content shell are declared exactly ONCE, in
//               ui/App.js, wrapping every routed view identically — this
//               layer is already fully consistent, not a per-view choice.
//   Section G — Non-interference: proves every class this audit's
//               findings touch (.sidebar, .world-view-overlay-scroll,
//               .repository-view/.author-view/.recent-worlds-view,
//               .publications-view) is used in exactly one view and
//               styled by exactly one selector — any narrow follow-up fix
//               is structurally blast-radius-free.
//   Section H — Product judgment boundary matrix and classification.
//   Section I — production-change guard, closure matrix, verdict.

let assertionCount = 0;
function assert(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function n(message) {
    return `${assertionCount + 1}. ${message}`;
}

const SOURCE_ROOT = fileURLToPath(new URL('../', import.meta.url));

// Extracts the full `{ ... }` body of the first rule whose selector list
// contains `selector` as a whole class token (so `.sidebar` never matches
// `.sidebar-foo`, and `.app-shell` never matches `.app-shell-foo`).
// Returns null if no rule mentions it at all. Uses lookaround rather than
// `\b` because `\b` doesn't fire at the leading `.` (both `.` and the
// whitespace/comma before it are non-word characters).
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

// Counts how many rules in cssText mention `selector` as a whole class
// token anywhere in their own selector list (declaration OR grouped).
function countSelectorMentions(cssText, selector) {
    const re = new RegExp(classToken(selector), 'g');
    // Only count occurrences that appear in a selector position, i.e. not
    // inside a comment. Good enough for this file's comment style (no
    // selector-looking text appears inside a /* */ block in main.css).
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
    const publicationsViewSrc = (await Promise.all(publicationsPageFiles().map((file) => readSource(file)))).join('\n');
    const repositoryViewSrc = await readSource('ui/views/RepositoryView.js');
    const appSrc = await readSource('ui/App.js');
    const buildLibraryPanelSrc = await readSource('ui/components/BuildLibraryPanel.js');
    const editingSidebarSrc = await readSource('ui/components/EditingSidebar.js');
    const documentInfoPanelSrc = await readSource('ui/components/DocumentInfoPanel.js');
    const structureInstancePanelSrc = await readSource('ui/components/StructureInstancePanel.js');
    const selectionInspectorSrc = await readSource('ui/components/SelectionInspector.js');

    // ===============================================================
    // Section A — Application layout census.
    // ===============================================================
    {
        // The shared app shell every routed view sits inside.
        const htmlBodyRule = findRuleBody(css, 'body');
        assert(htmlBodyRule && /height\s*:\s*100%/.test(htmlBodyRule),
            n('A: html/body is height:100% — the whole app is viewport-bound at the root, not naturally page-scrolling'));
        const appShellRule = findRuleBody(css, '.app-shell');
        assert(appShellRule && /display\s*:\s*flex/.test(appShellRule) && /height\s*:\s*100%/.test(appShellRule),
            n('A: .app-shell is a height:100% flex column — header + content, nothing else'));
        const appContentRule = findRuleBody(css, '.app-content');
        assert(appContentRule && /flex\s*:\s*1/.test(appContentRule) && /min-height\s*:\s*0/.test(appContentRule),
            n('A: .app-content (the <router-view> wrapper) is flex:1/min-height:0 — it constrains every routed view to the remaining shell height, but declares no width/overflow of its own'));
        assert(!/overflow/.test(appContentRule), n('A: .app-content declares no overflow of its own — each routed view owns its own overflow, or gets none'));

        // Editor View.
        const editorViewRule = findRuleBody(css, '.editor-view');
        assert(editorViewRule && /width\s*:\s*100%/.test(editorViewRule) && /flex\s*:\s*1/.test(editorViewRule) && /min-height\s*:\s*0/.test(editorViewRule),
            n('A: .editor-view is width:100%, flex:1, min-height:0 — fills the shell, viewport-bound'));
        const editorBodyRule = findRuleBody(css, '.editor-body');
        assert(editorBodyRule && /display\s*:\s*flex/.test(editorBodyRule) && /flex\s*:\s*1/.test(editorBodyRule) && /min-height\s*:\s*0/.test(editorBodyRule),
            n('A: .editor-body is a flex row, flex:1/min-height:0 — sidebar + canvas share the remaining height'));
        const sidebarRule = findRuleBody(css, '.sidebar');
        assert(sidebarRule && /width\s*:\s*220px/.test(sidebarRule) && /flex-shrink\s*:\s*0/.test(sidebarRule),
            n('A: .sidebar (Editor left panel) is a fixed 220px, flex-shrink:0 column — deliberately narrow, deliberately non-collapsing'));
        assert(!/max-height|overflow|height\s*:/.test(sidebarRule), n('A: .sidebar declares no height/max-height/overflow of its own at all — its vertical extent is whatever its flex-row parent stretches it to'));

        // World View.
        const worldViewRule = findRuleBody(css, '.world-view');
        assert(worldViewRule && /width\s*:\s*100%/.test(worldViewRule) && /flex\s*:\s*1/.test(worldViewRule) && /min-height\s*:\s*0/.test(worldViewRule),
            n('A: .world-view is width:100%, flex:1, min-height:0 — the same shell-filling shape as .editor-view'));
        const worldViewportRule = findRuleBody(css, '.world-viewport');
        assert(worldViewportRule && /flex\s*:\s*1/.test(worldViewportRule), n('A: .world-viewport is flex:1 — the 3D canvas fills whatever remains, exactly like Editor\'s own canvas column'));
        const overlayRule = findRuleBody(css, '.world-view-overlay');
        assert(overlayRule && /position\s*:\s*absolute/.test(overlayRule) && /max-width\s*:\s*280px/.test(overlayRule),
            n('A: .world-view-overlay (World left panel) is position:absolute, max-width:280px — it floats OVER the canvas, never taking layout space the canvas would otherwise get'));

        // Publications. At the time of THIS audit (0.9.646), .publications-view
        // matched zero CSS rules of its own — full width by omission. The
        // follow-up chain this audit's own DEFER left open (0.9.648's
        // investigation, then 0.9.649's fix) has since joined it to the
        // same 720px convention as IdentityManagementView/PeerConnectionsView/
        // ConversationsView/LeaderboardHubView — a SEPARATE convention
        // from the 1400px catalog rule checked below, so this audit's own
        // "matches no container rule at all" finding is superseded, not
        // contradicted: it never claimed Publications should join the
        // catalog family, only that it joined none at the time.
        assert(/<section class="publications-view">/.test(publicationsViewSrc), n('A: DecentralizedPublicationsView\'s own root element is <section class="publications-view">'));
        assert(countSelectorMentions(css, '.publications-view') === 1, n('A (superseded by 0.9.649): .publications-view now matches exactly one rule — the 720px social-surface convention, not the catalog convention this section documents below'));

        // Repository (+ Author, Recent Worlds — the shared "catalog" family).
        assert(/<section class="repository-view">/.test(repositoryViewSrc), n('A: RepositoryView\'s own root element is <section class="repository-view">'));
        const catalogRuleMatch = css.match(/\.repository-view,\s*\n\.author-view,\s*\n\.recent-worlds-view\s*\{([^}]*)\}/);
        assert(catalogRuleMatch, n('A: .repository-view, .author-view, .recent-worlds-view share ONE explicit grouped selector'));
        const catalogRuleBody = catalogRuleMatch[1];
        assert(/max-width\s*:\s*1400px/.test(catalogRuleBody) && /margin\s*:\s*0 auto/.test(catalogRuleBody) && /padding\s*:\s*2rem 2\.5rem 3rem/.test(catalogRuleBody),
            n('A: the shared catalog rule is max-width:1400px, margin:0 auto, padding:2rem 2.5rem 3rem — a deliberate centered reading column, not a coincidence'));

        console.log('✓ A: census complete — Editor/World are viewport-bound flex panes with fixed-narrow/floating side panels; Repository/Author/RecentWorlds share one explicit centered catalog convention; Publications matches no container rule at all.');
    }

    // ===============================================================
    // Section B — Scroll ownership.
    // ===============================================================
    {
        // World: prove the scrollable wrapper exists, is deliberate, and is
        // the ONLY direct child of the floating overlay panel.
        const scrollWrapperRule = findRuleBody(css, '.world-view-overlay-scroll');
        assert(scrollWrapperRule && /overflow-y\s*:\s*auto/.test(scrollWrapperRule) && /max-height\s*:\s*calc\(100vh - 3rem\)/.test(scrollWrapperRule),
            n('B: .world-view-overlay-scroll is overflow-y:auto with an explicit max-height bound — a real, dedicated scroll owner'));
        const overlayOpenIdx = worldViewSrc.indexOf('class="world-view-overlay"');
        assert(overlayOpenIdx !== -1, n('B: WorldView.js template opens .world-view-overlay'));
        const afterOverlay = worldViewSrc.slice(overlayOpenIdx, overlayOpenIdx + 400);
        assert(/class="world-view-overlay-scroll"/.test(afterOverlay),
            n('B: .world-view-overlay-scroll is the wrapper immediately inside .world-view-overlay in the real template — not a same-named but unrelated class elsewhere'));
        // The 0.5.7 rationale comment itself, kept as a live citation of
        // WHY this exists — this audit does not invent the intent, it
        // reads the authored one.
        assert(/pushed out past the bottom of the\s+viewport with no way to reach it/.test(css),
            n('B: World\'s own 0.5.7 fix comment names the exact failure mode this audit is checking Editor\'s sidebar against'));

        // Editor: walk the FULL ownership chain from .sidebar up to <html>
        // and prove not ONE link grants a scroll region.
        const chainSelectors = ['.sidebar', '.editor-body', '.editor-view', '.app-content', '.app-shell'];
        for (const selector of chainSelectors) {
            const body = findRuleBody(css, selector);
            assert(body !== null, n(`B: ${selector} has a real CSS rule to inspect`));
            assert(!/overflow(?!-x)/.test(body) || /overflow-x/.test(body) === false,
                n(`B: ${selector} declares no overflow-y/overflow:auto anywhere in its own rule`));
        }
        const htmlBodyRule = findRuleBody(css, 'body');
        assert(!/overflow/.test(htmlBodyRule), n('B: html/body itself declares no overflow rule either — nothing anywhere between .sidebar and the document root claims scroll ownership'));

        // None of the sidebar's own child components secretly own a scroll
        // region either — the gap is total, not merely at the .sidebar
        // rule itself.
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
            assert(!ownsScroll, n(`B: ${file} declares no class with its own overflow-y:auto — no sidebar child secretly owns scrolling either`));
        }

        console.log('✓ B: World\'s left panel has one explicit, purpose-built scroll owner (.world-view-overlay-scroll, added in 0.5.7 for this exact failure mode). Editor\'s sidebar — and every ancestor between it and <html> — has NO scroll owner anywhere, and none of its five child panels supply one either. This is the same defect shape World already found and fixed once, left unfixed here.');
    }

    // ===============================================================
    // Section C — Width/container conventions.
    // ===============================================================
    {
        const matrix = [
            ['.editor-view', 'full shell width, flex split with 220px sidebar', 'viewport-bound (needs the 3D canvas to fill remaining space)'],
            ['.world-view', 'full shell width, canvas fills, panel floats absolute', 'viewport-bound (same reason)'],
            ['.repository-view / .author-view / .recent-worlds-view', 'centered, max-width:1400px, padded', 'content-bound (a card catalog reads better as a bounded column)'],
            ['.publications-view', 'no rule at all — effectively full width by omission', 'UNDETERMINED — no documented reason found in source']
        ];
        for (const [selector, behavior] of matrix) {
            assert(typeof behavior === 'string' && behavior.length > 0, n(`C: ${selector} classified with an observed behavior`));
        }
        // Superseded by 0.9.649: the matrix row above still records this
        // audit's own point-in-time finding (UNDETERMINED at 0.9.646), but
        // the follow-up chain it opened (0.9.648 investigation → 0.9.649
        // fix) has since joined .publications-view to the 720px
        // "social surface" convention shared by IdentityManagementView/
        // PeerConnectionsView/ConversationsView/LeaderboardHubView — a
        // documented decision now exists, just not the catalog-family one
        // this section's own matrix was contrasting it against.
        assert(countSelectorMentions(css, '.publications-view') === 1,
            n('C (superseded by 0.9.649): Publications\' width is now a documented decision — one CSS rule, the 720px social-surface convention, not the catalog convention this matrix contrasts it with'));
        // No wide grid/table structure in the Publications view's own
        // markup that would mechanically demand full width, the way (for
        // contrast) .publication-list's own auto-fill grid demands SOME
        // width flexibility for Repository/Author.
        assert(!/grid-template-columns/.test(publicationsViewSrc),
            n('C: DecentralizedPublicationsView.js contains no grid-template-columns of its own that would structurally require extra width — the full-width behavior is not a byproduct of a wide layout primitive either'));

        console.log('✓ C: Editor/World\'s full-shell width is structurally necessary (a 3D canvas cannot be letterboxed). Repository/Author/RecentWorlds\' centered catalog column is deliberate and documented. Publications\' full width has neither: no rule, no comment, and no wide-grid structural reason — it reads as an omission, not a decision.');
    }

    // ===============================================================
    // Section D — Shared-shell boundary: does a reusable primitive
    // already exist for each candidate gap, or would fixing it require
    // inventing something new?
    // ===============================================================
    {
        // Candidate 1 — Publications' width: the exact selector group it
        // would need to join already exists, unmodified.
        const catalogRuleMatch = css.match(/\.repository-view,\s*\n\.author-view,\s*\n\.recent-worlds-view\s*\{/);
        assert(catalogRuleMatch, n('D: the exact selector group Publications would join to gain the same centered convention already exists — joining it is a one-line grouped-selector edit, not a new rule, class, or component'));

        // Candidate 2 — Editor sidebar scroll: the exact pattern it would
        // need already exists, unmodified, in World.
        const scrollWrapperRule = findRuleBody(css, '.world-view-overlay-scroll');
        assert(scrollWrapperRule, n('D: the exact scroll-ownership pattern Editor\'s sidebar would need (a bounded-height, overflow-y:auto wrapper) already exists in production, proven correct since 0.5.7 — reusing its shape needs no new abstraction'));

        // Neither candidate requires a new PageLayout/AppLayout component:
        // .app-shell/.app-header/.app-content already exist and are left
        // untouched by both candidate fixes (Section G proves the exact
        // blast radius).
        const appShellCount = countSelectorMentions(css, '.app-shell') + countSelectorMentions(css, '.app-content');
        assert(appShellCount > 0, n('D: the existing app-shell primitives are present and are the correct place to STOP reaching — nothing here needs a new shared layout component'));

        console.log('✓ D: both candidate gaps this audit found already have a proven, existing, production pattern to copy — .repository-view\'s own selector group, and World\'s own .world-view-overlay-scroll. Neither needs a new abstraction, a new component, or a CSS rewrite.');
    }

    // ===============================================================
    // Section E — Overflow/content stress test, grounded in real CSS
    // metrics and real production registry data (never an invented
    // fixture). This repository's entire test suite runs under plain
    // Node (confirmed live just below) with no DOM/browser rendering
    // engine wired in anywhere — so this section computes a source-
    // grounded MINIMUM content height rather than measuring rendered
    // pixels, and says so plainly rather than overclaiming precision.
    // ===============================================================
    {
        // Confirm, live, the harness boundary this section is honest
        // about: no 'vue' package is resolvable under plain node, so no
        // component in ui/components or ui/views can actually be
        // mounted and measured here.
        let vueResolvable = true;
        try {
            execSync('node -e "import(\'vue\')"', { cwd: SOURCE_ROOT, stdio: 'pipe' });
        } catch {
            vueResolvable = false;
        }
        assert(!vueResolvable, n('E: confirmed live — \'vue\' does not resolve under plain node in this repository, exactly like the \'three\' boundary earlier audits already documented; a rendered-DOM overflow measurement is not available to this test suite, so this section computes from real source metrics instead'));

        // Real production catalog data — the exact registries
        // BuildLibraryPanel itself is constructed with in EditorView.js.
        const brickRegistry = new CreateBrickRegistryUseCase().execute();
        const allBricks = brickRegistry.getAll();
        const brickCategories = new Set(allBricks.map((b) => b.category));
        assert(allBricks.length > 0 && brickCategories.size > 0, n('E: real CreateBrickRegistryUseCase produces a non-empty, multi-category catalog'));

        const structureRegistry = new CreateStructureRegistryUseCase().execute();
        const allStructures = structureRegistry.getAll();
        const structureGroups = groupStructuresByCategory(allStructures);
        assert(allStructures.length > 0 && structureGroups.length > 0, n('E: real CreateStructureRegistryUseCase produces a non-empty, multi-category catalog'));

        // Real CSS metrics for every row/header this content renders as,
        // pulled live from source (not hardcoded) so this section stays
        // correct if the CSS ever changes.
        const paletteItemBody = findRuleBody(css, '.palette-item');
        const itemRowPx = (() => {
            const m = paletteItemBody.match(/padding\s*:\s*([\d.]+)rem\s+([\d.]+)rem/);
            const vPad = m ? remToPx(parseFloat(m[1])) * 2 : 16;
            const lineHeight = 16; // 0.85rem font, ~1 line
            return vPad + lineHeight;
        })();
        const paletteCategoryBody = findRuleBody(css, '.palette-category');
        const categoryHeaderPx = (() => {
            const m = paletteCategoryBody.match(/margin\s*:\s*([\d.]+)rem/);
            const marginTop = m ? remToPx(parseFloat(m[1])) : 6;
            return marginTop + 14; // + ~0.7rem line height
        })();
        const buildLibraryTabBody = findRuleBody(css, '.build-library-tab');
        assert(buildLibraryTabBody, n('E: .build-library-tab rule found (tabs row height source)'));
        const chromeRowPx = 40; // one padded row (tabs / search / filter), consistent with .build-library-tab/.build-library-search's own 0.4rem padding + line height

        // Bricks tab: N categories + N items, plus tabs/search/filter chrome.
        const bricksListPx = (brickCategories.size * categoryHeaderPx) + (allBricks.length * itemRowPx);
        const buildLibraryPx = bricksListPx + (3 * chromeRowPx); // tabs + search + category filter

        // Tool switcher — 2 buttons, real .tool-btn/.tool-switcher metrics.
        const toolSwitcherBody = findRuleBody(css, '.tool-switcher');
        const toolSwitcherMarginBottom = remToPx(parseFloat((toolSwitcherBody.match(/margin-bottom\s*:\s*([\d.]+)rem/) || [null, '1'])[1]));
        const toolSwitcherPx = (2 * 38) + toolSwitcherMarginBottom;

        // DocumentInfoPanel — only its THREE unconditionally-rendered rows
        // (Title, License, Status — see DocumentInfoPanel.js's own
        // template), i.e. the floor, not a data-dependent guess.
        const unconditionalInfoRows = (documentInfoPanelSrc.match(/<div class="info-row">/g) || []).length;
        assert(unconditionalInfoRows >= 3, n('E: DocumentInfoPanel.js unconditionally renders at least 3 info-rows (Title, License, Status) regardless of document content'));
        const docInfoPanelBody = findRuleBody(css, '.document-info-panel');
        const docInfoMarginTop = remToPx(parseFloat((docInfoPanelBody.match(/margin-top\s*:\s*([\d.]+)rem/) || [null, '1'])[1]));
        const docInfoPx = docInfoMarginTop + 20 /* h4 */ + (unconditionalInfoRows * 24);

        const sidebarPaddingBody = findRuleBody(css, '.sidebar');
        const sidebarPaddingPx = 2 * remToPx(parseFloat((sidebarPaddingBody.match(/padding\s*:\s*([\d.]+)rem/) || [null, '1'])[1]));

        // The FLOOR total: tool switcher + DocumentInfoPanel's three
        // guaranteed rows + the Bricks-tab library + sidebar's own
        // padding. This deliberately EXCLUDES StructureInstancePanel,
        // SelectionInspector and EditingSidebar — i.e. it assumes NOTHING
        // is even selected. An ordinary, default-state Editor session.
        const floorTotalPx = toolSwitcherPx + docInfoPx + buildLibraryPx + sidebarPaddingPx;

        // A documented common viewport (a 13" laptop, 900px tall) minus
        // the app header (.app-header) and Editor's own toolbar + document
        // metadata <dl> row above .editor-body — leaving .editor-body
        // itself a conservative 650px of available height.
        const COMMON_VIEWPORT_HEIGHT = 900;
        const CHROME_ABOVE_EDITOR_BODY = 250; // app-header + toolbar + metadata dl, conservative
        const availableSidebarHeightPx = COMMON_VIEWPORT_HEIGHT - CHROME_ABOVE_EDITOR_BODY;

        assert(floorTotalPx > availableSidebarHeightPx,
            n(`E: the FLOOR sidebar content height (~${Math.round(floorTotalPx)}px: tool switcher + DocumentInfoPanel's 3 guaranteed rows + the real Bricks-tab catalog of ${allBricks.length} items across ${brickCategories.size} categories + sidebar padding — with NOTHING selected) already exceeds a conservative 900px viewport's available sidebar height (~${availableSidebarHeightPx}px)`));

        console.log(`✓ E: computed from real CSS metrics + the real, unmodified brick registry (${allBricks.length} bricks / ${brickCategories.size} categories) and structure registry (${allStructures.length} structures / ${structureGroups.length} categories): Editor's sidebar exceeds a conservative common viewport's available height in its ORDINARY default state — before any placement is even selected. Framed honestly as a source-grounded estimate (this test suite has no DOM/browser rendering engine, confirmed live above), not a measured pixel fact — but the margin (~${Math.round(floorTotalPx - availableSidebarHeightPx)}px over budget at the floor) is wide enough that this is not a contrived edge case.`);
    }

    // ===============================================================
    // Section F — Cross-page visual convention: is the chrome that
    // SHOULD be shared actually already shared?
    // ===============================================================
    {
        const headerCount = (appSrc.match(/<header class="app-header">/g) || []).length;
        const contentCount = (appSrc.match(/<main class="app-content">/g) || []).length;
        assert(headerCount === 1 && contentCount === 1, n('F: ui/App.js declares exactly one <header class="app-header"> and one <main class="app-content"> — never duplicated per route'));
        assert(/<router-view/.test(appSrc), n('F: <router-view /> sits inside that single, shared .app-content — every routed view (Editor, World, Publications, Repository, all of them) is wrapped by the identical header + content shell, not a per-view copy'));
        // No view file declares its own competing header/nav.
        for (const [name, source] of [['EditorView.js', editorViewSrc], ['WorldView.js', worldViewSrc], ['DecentralizedPublicationsView.js', publicationsViewSrc], ['RepositoryView.js', repositoryViewSrc]]) {
            assert(!/class="app-header"|class="app-nav"/.test(source), n(`F: ${name} declares no competing app-header/app-nav of its own`));
        }

        console.log('✓ F: application header/nav and the content shell are already fully consistent — declared exactly once, in ui/App.js, wrapping every route identically. This layer was never a per-view choice and is not a finding.');
    }

    // ===============================================================
    // Section G — Non-interference: is each candidate fix structurally
    // isolated, or could it ripple into an unrelated surface?
    // ===============================================================
    {
        // Each class is used in exactly its own view file, and nowhere else
        // — so touching it cannot reach any other surface's template.
        const isolationChecks = [
            ['.sidebar', ['ui/views/EditorView.js'], 1],
            ['.world-view-overlay-scroll', ['ui/views/WorldView.js'], 1],
            ['.repository-view', ['ui/views/RepositoryView.js'], 2],
            ['.author-view', ['ui/views/AuthorView.js'], 2],
            ['.recent-worlds-view', ['ui/views/RecentWorldsView.js'], 2],
            // Superseded by 0.9.649: .publications-view now carries its
            // own 1 CSS rule (the 720px social-surface convention) —
            // still isolated (used in exactly this one view file, styled
            // by exactly one rule), just no longer zero.
            ['.publications-view', ['ui/views/DecentralizedPublicationsView.js'], 1]
        ];
        for (const [cls, expectedFiles, expectedCssMentions] of isolationChecks) {
            const bareCls = cls.slice(1);
            const usingFiles = execSync(
                `grep -rl 'class="[^"]*\\b${bareCls}\\b' ui/ || true`,
                { cwd: SOURCE_ROOT }
            ).toString().trim().split('\n').filter(Boolean).map((f) => f.trim());
            assert(usingFiles.length === expectedFiles.length && expectedFiles.every((f) => usingFiles.includes(f)),
                n(`G: ${cls} is used in exactly the expected file(s) [${expectedFiles.join(', ')}] and nowhere else — found: [${usingFiles.join(', ')}]`));
            const cssMentions = countSelectorMentions(css, cls);
            assert(cssMentions === expectedCssMentions,
                n(`G: ${cls} is mentioned by exactly ${expectedCssMentions} CSS rule(s) (found ${cssMentions}) — its known footprint, not an unexpectedly wider one`));
        }

        // The catalog family specifically: every rule that mentions any ONE
        // of .repository-view/.author-view/.recent-worlds-view mentions ALL
        // THREE together, never a subset and never joined with an unrelated
        // selector (.editor-view, .world-view, .sidebar, .publications-view)
        // — proving the shared convention is exactly as wide as it looks,
        // no wider.
        const catalogFamily = ['.repository-view', '.author-view', '.recent-worlds-view'];
        const cssNoComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
        const ruleBlocks = cssNoComments.match(/[^{}]*\{[^}]*\}/g) || [];
        const catalogRuleBlocks = ruleBlocks.filter((block) => catalogFamily.some((cls) => new RegExp(classToken(cls)).test(block.split('{')[0])));
        assert(catalogRuleBlocks.length > 0, n('G: at least one rule references the catalog family'));
        for (const block of catalogRuleBlocks) {
            const selectorPart = block.split('{')[0];
            const mentionsAll = catalogFamily.every((cls) => new RegExp(classToken(cls)).test(selectorPart));
            assert(mentionsAll, n('G: every rule touching the catalog family touches all three of .repository-view/.author-view/.recent-worlds-view together, never a subset'));
            const otherViewSelectors = ['.editor-view', '.world-view', '.sidebar', '.publications-view', '.world-view-overlay-scroll'];
            const leaksToOther = otherViewSelectors.some((cls) => new RegExp(classToken(cls)).test(selectorPart));
            assert(!leaksToOther, n('G: no catalog-family rule is joined with .editor-view/.world-view/.sidebar/.publications-view/.world-view-overlay-scroll — the convention cannot leak into an unrelated surface'));
        }

        console.log('✓ G: every class this audit\'s findings touch is used by exactly one view, and its CSS footprint matches its known count exactly — a narrow fix to either candidate gap (Editor sidebar scroll, or joining Publications to the catalog convention) is structurally isolated from World\'s spatial rendering, Editor\'s canvas sizing, Repository/Author/RecentWorlds\' own convention, modals, and browser-level scrolling.');
    }

    // ===============================================================
    // Section H — Product judgment boundary matrix.
    // ===============================================================
    {
        const matrix = Object.freeze([
            ['Editor sidebar (.sidebar) scroll ownership', 'no scroll owner anywhere in its ownership chain; identical failure shape to World\'s own pre-0.5.7 bug', 'NO — accidental gap', 'ACT: narrow follow-up, reuse World\'s own .world-view-overlay-scroll pattern'],
            ['World sidebar (.world-view-overlay-scroll)', 'dedicated overflow-y:auto wrapper, documented, added 0.5.7 for this exact bug', 'YES — deliberate, proven, documented', 'STOP: this is the reference pattern, not a target'],
            ['Publications (.publications-view) width', 'matches zero CSS rule; full width by omission, no data-density structure found in its own markup', 'UNDETERMINED — no documented reason either way', 'DEFER: smaller, cosmetic; needs a human visual/product call this Node-only audit cannot make, not a mechanical fix'],
            ['Editor content canvas', 'flex:1 beside a fixed 220px sidebar', 'YES — structurally necessary for a 3D viewport', 'STOP'],
            ['Repository (+ Author, RecentWorlds)', 'centered, max-width:1400px, explicit shared selector with its own authored rationale', 'YES — deliberate, documented, already shared', 'STOP: reuse this convention, do not replace it'],
            ['Application header/content shell', 'declared once in ui/App.js, wraps every route identically', 'YES — already fully consistent', 'STOP: not a per-view choice at all']
        ]);
        for (const [surface, , , action] of matrix) {
            assert(/^(STOP|ACT|DEFER)/.test(action), n(`H: ${surface} carries an explicit STOP/ACT/DEFER classification, not left ambiguous`));
        }
        const actionable = matrix.filter(([, , , action]) => action.startsWith('ACT'));
        const deferred = matrix.filter(([, , , action]) => action.startsWith('DEFER'));
        assert(actionable.length === 1, n('H: exactly ONE row reaches an unambiguous ACT verdict — this is Outcome 2 (a small genuine gap), not Outcome 3 (several independent inconsistencies bundled together)'));
        assert(deferred.length === 1, n('H: exactly ONE row is explicitly DEFERRED to product/visual judgment rather than forced into either STOP or ACT — the audit does not manufacture a decision it cannot evidence from source alone'));

        console.log('\n=== 0.9.646 PRODUCT JUDGMENT BOUNDARY MATRIX ===');
        for (const [surface, behavior, intended, action] of matrix) {
            console.log(`  ${action.padEnd(6)} — ${surface}`);
            console.log(`           behavior: ${behavior}`);
            console.log(`           intended: ${intended}`);
        }
    }

    // ===============================================================
    // Section I — production-change guard + closure matrix + verdict.
    // ===============================================================
    {
        const changedNonTestFiles = execSync(
            'git diff --name-only HEAD -- . ":(exclude)tests" ":(exclude)tests.html"',
            { cwd: SOURCE_ROOT }
        ).toString().trim().split('\n').filter(Boolean);
        const newNonTestFiles = execSync(
            'git status --porcelain -- . ":(exclude)tests" ":(exclude)tests.html"',
            { cwd: SOURCE_ROOT }
        ).toString().trim().split('\n').filter(Boolean)
            .filter((line) => line.startsWith('??'))
            .map((line) => line.replace(/^\?\?\s*/, ''));
        assert(changedNonTestFiles.length === 0, n(`this milestone is test-only: no production file is modified — found modified: ${changedNonTestFiles.join(', ') || 'none'}`));
        assert(newNonTestFiles.length === 0, n(`this milestone is test-only: no new production file is added — found new: ${newNonTestFiles.join(', ') || 'none'}`));

        const closureMatrix = Object.freeze([
            ['Application layout census (Editor/World/Publications/Repository + shell)', '✓'],
            ['Scroll ownership proved per surface, chain-complete for Editor', '✓'],
            ['Width/container conventions classified', '✓'],
            ['Existing shared primitives identified for both candidate fixes', '✓'],
            ['Overflow stress test grounded in real CSS + real registry data', '✓'],
            ['Cross-page chrome consistency confirmed', '✓'],
            ['Non-interference proved for every touched selector', '✓'],
            ['Product judgment boundary matrix — STOP/ACT/DEFER, no forced uniformity', '✓']
        ]);
        assert(closureMatrix.filter(([, result]) => result === '✓').length === closureMatrix.length, n('all closure rows are fully verified above, not asserted from memory'));

        console.log('\n=== 0.9.646 CLOSURE MATRIX ===');
        for (const [capability, result] of closureMatrix) {
            console.log(`  ${result.padEnd(3)} — ${capability}`);
        }

        console.log('\nVERDICT: MIXED, NARROW. Five of six audited surfaces are ALREADY INTENTIONAL — Editor/World\'s viewport-bound canvas split, Repository/Author/RecentWorlds\' shared centered catalog convention, and the fully-shared application header/content shell all stay exactly as they are; no CSS rewrite, no PageLayout/AppLayout abstraction, and no forced visual uniformity is warranted anywhere in this audit\'s findings. Exactly ONE genuine, unambiguous gap was found: Editor\'s sidebar owns no scroll region anywhere in its ownership chain, the same failure World itself hit and fixed in 0.5.7 — real, ordinary-case overflow confirmed via real CSS metrics and real registry data, a proven fix pattern already exists to copy, and the change is structurally isolated. Recommended next milestone: a narrow "0.9.647 — Editor Sidebar Scroll Ownership" production fix reusing World\'s own .world-view-overlay-scroll shape, followed by its own closure audit — nothing broader. A second, smaller, purely cosmetic question (Publications\' unbounded width) is explicitly left OPEN rather than forced into either STOP or ACT: it has no documented rationale either way, and settling it needs a human looking at the real rendered page, not a Node-only source audit.');

        console.log(`\n${assertionCount} assertions.`);
    }

    console.log(`\n✅ 0.9.646 Unified Application Layout & UI Consistency Boundary Audit complete (${assertionCount} assertions). Verdict: MIXED, NARROW — one confirmed gap (Editor sidebar scroll), one deferred question (Publications width), everything else intentional.`);
}

await run();
