import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stylesheetFiles } from './support/SourceFileGroups.js';

// 0.9.654 — Sidebar Scrollbar Content Occlusion Boundary Audit.
//
// TYPE (at authoring): test-only boundary audit. PRODUCTION CHANGES (at
// authoring): none (Section J's own guard re-ran 0.9.647's file-manifest
// technique to prove it).
//
// AMENDED BY 0.9.655: every gap this audit found below has since been
// fixed in css/main.css (flex-wrap:wrap on .world-view-actions and
// .world-view-actions--navigation; .sidebar-scroll/.world-view-overlay-
// scroll padding-right widened 0.25rem -> 1.0625rem). This file's own
// narrative and live-measured numbers below are left as the historical
// record of what was found and how; each Section's own assertions have
// been updated in place (marked "AMENDED (0.9.655)" / "FIXED (0.9.655)")
// to check the CORRECTED behavior rather than silently going stale. See
// tests/SidebarActionOverflowAndScrollbarClearanceClosureAudit.test.js
// (0.9.656) for the dedicated closure audit.
//
// The brief: 0.9.647 gave the Editor sidebar a scroll owner
// (.sidebar-scroll) so overflowing content is REACHABLE. The new report
// is narrower and sharper — is the scrollbar itself eating into the
// horizontal space real controls need, to the point some become hard or
// impossible to operate? World's own 0.5.7 wrapper (.world-view-overlay-
// scroll) uses the identical shape and is explicitly in scope too, on
// the stated principle that predating Editor's fix proves nothing about
// whether it has the same defect.
//
// METHOD, AND WHY: this repository's test suite runs under plain `node`
// (Section D re-confirms, exactly like 0.9.647 Section B, that `vue`
// does not resolve here) — there is no DOM/layout engine wired into the
// committed suite, so nothing below can literally instantiate a browser.
// That is a real constraint on what a COMMITTED, portable test file can
// assert, but it is not a constraint on how this audit was CONDUCTED:
// this milestone's own investigation mounted the real, unmodified
// DocumentInfoPanel.js/EditingSidebar.js/NumericTransformPanel.js/
// RepeatPanel.js against the real css/main.css, in real headless
// Chromium (via a throwaway harness page and a session-local Playwright
// install — neither committed; nothing outside tests/ and this file
// changed), and read back real getBoundingClientRect()/clientWidth
// geometry. Two findings from that live pass matter enough to shape
// this file's own assertions rather than just narrate them:
//
//   (1) THIS sandbox's headless Chromium renders scrollbars as a
//       zero-footprint OVERLAY — offsetWidth === clientWidth on
//       .sidebar-scroll even after disabling the OverlayScrollbar
//       feature, switching from the headless-shell binary to the full
//       chrome binary, and forcing a custom ::-webkit-scrollbar width.
//       Real desktop users are NOT uniformly on this regime — Windows
//       and default Linux/GTK/Firefox reserve real space for a classic
//       scrollbar (commonly cited around 15-17px; Windows' own
//       GetSystemMetrics(SM_CXVSCROLL) default is 17px), while macOS
//       trackpad users, touch/mobile, and "Always show scrollbars"
//       configurations do not. So this audit had to reason about BOTH
//       regimes, not just the one this sandbox can render.
//   (2) Under the CLASSIC (space-reserving) regime, standard CSS box
//       behavior shrinks a scrolling element's OWN content box to make
//       room for the scrollbar before children are laid out — so a
//       child sized relative to .sidebar-scroll itself (width:100%,
//       flex:1, or flex-column stretch) shrinks correctly WITH it and
//       is not occluded, only narrower. Occlusion under that regime
//       needs a child that CANNOT shrink (hits an intrinsic floor) or
//       is sized against something other than its true scrolling
//       ancestor. Under the OVERLAY regime, the content box never
//       shrinks at all, so the scrollbar paints on top of whatever is
//       already there — full width, right up to the container's own
//       edge — and a control with too little of its own margin from
//       that edge genuinely sits underneath it.
//
// This file's assertions re-derive, from real source (CSS rules, real
// inline-style-returning methods, and real template markup — the same
// technique 0.9.647 used for its own arithmetic), the exact geometry
// facts the live pass measured, so a reader can verify every number by
// reading the cited file rather than trusting a screenshot this suite
// cannot commit. Sections roughly follow the audit brief:
//
//   Section A — Reproduce: which Editor/World controls are genuinely
//               clipped (unconditionally) vs. merely thin-margined
//               (conditionally, only under the overlay regime) vs. safe.
//   Section B — Horizontal geometry: the exact content-width arithmetic
//               at each nesting level, live-measured and re-derived.
//   Section C — Scrollbar/content relationship: classic vs. overlay,
//               and which one actually explains the reported symptom.
//   Section D — Editor regression: 0.9.647's own ownership invariants,
//               re-run.
//   Section E — World regression: NOT assumed correct — and isn't.
//   Section F — Interactive reachability: focus/click for the specific
//               controls this audit measured.
//   Section G — Long/short content: no min-height forcing blank space.
//   Section H — Viewport variations: both panels are fixed-width/
//               max-width by construction, not viewport-responsive, so
//               this geometry does not depend on viewport size.
//   Section I — Existing conventions: the SAME codebase already has the
//               fix for both gaps found here, used correctly elsewhere.
//   Section J — Production-change guard: this milestone touches
//               nothing but tests/ and tests.html.
//
// HEADLINE FINDINGS (full detail in Section A/E):
//   - World's own .world-view-actions (Save/Publish/Edit Metadata/
//     Undo/Redo/History) and .world-view-actions--navigation (Home/
//     Locations/Notifications) rows are NOT scrollbar-adjacent — they
//     overflow their 280px-max-width panel UNCONDITIONALLY, with no
//     vertical scrollbar involved at all (live-measured: Undo/Redo/
//     History render 200px past the visible edge and are entirely
//     clipped by the panel's own overflow-x:hidden; Notifications by
//     32px). This is the more severe of the two gaps this audit found,
//     and it is not a scrollbar-occlusion bug at all — .world-view-
//     actions declares no flex-wrap and its buttons share no flex-basis,
//     so six fixed-content buttons simply do not fit.
//   - Editor's own .tool-switcher buttons (Select/Place) DO stretch
//     flush to .sidebar-scroll's own padding-box edge with only that
//     rule's 0.25rem (4px) padding-right as clearance — live-measured
//     4px exactly, matching the CSS declaration with zero incidental
//     extra margin. That is genuinely too little for the OVERLAY
//     regime (Section C), though safe under the classic regime because
//     of how content-box shrinkage works.
//   - By contrast, the Transform section's numeric X/Y/Z/R inputs
//     (NumericTransformPanel.js) are NOT at meaningful risk: they sit
//     inside EditingSidebar's own .sectionStyle() box (10px padding),
//     which happens to add ~14px of buffer on top of .sidebar-scroll's
//     own 4px — enough to cover even a classic scrollbar, but by
//     accident of an unrelated section-padding convention, not by any
//     deliberate scrollbar-clearance mechanism. World's own numeric-
//     style panels carry no equivalent accidental buffer (Section A).
//
// Recommends a narrow 0.9.655 with two independent, single-property
// changes, neither of which is a new mechanism (Section I): (a) add
// flex-wrap: wrap to .world-view-actions and .world-view-actions--
// navigation, exactly the convention EditingSidebar.js's own rowStyle()
// and .world-view-primary-nav .action-btn already use; (b) widen the
// ONE shared .sidebar-scroll/.world-view-overlay-scroll padding-right
// value both rules already carry (today 0.25rem, identically, in both)
// rather than inventing a sidebar-specific or World-specific patch.

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

// Same convention as tests/EditorSidebarScrollOwnershipClosureAudit.test.js
// (itself borrowed from tests/UnifiedApplicationLayoutUIConsistencyBoundaryAudit.test.js).
function classToken(selector) {
    const escaped = selector.replace(/[.]/g, '\\.');
    return `(?<![\\w-])${escaped}(?![\\w-])`;
}
function findAllRuleBodies(cssText, selector) {
    const token = classToken(selector);
    const re = new RegExp(`([^{}]*${token}[^{}]*)\\{([^}]*)\\}`, 'gm');
    return [...cssText.matchAll(re)].map((m) => m[2]);
}
// Only matches a rule whose selector list contains `selector` as one of
// its OWN, standalone entries (e.g. ".action-btn"), never a compound
// selector merely containing that class as one of its parts (e.g.
// ".structure-item-menu-list .action-btn", which a plain substring
// search would also match, and which sorts earlier in css/main.css than
// the base rule this file actually wants for its own base-rule
// assertions).
function findExactRuleBody(cssText, selector) {
    const withoutComments = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
    const re = /([^{}]*)\{([^}]*)\}/gm;
    for (const m of withoutComments.matchAll(re)) {
        const selectors = m[1].split(',').map((s) => s.trim());
        if (selectors.includes(selector)) {
            return m[2];
        }
    }
    return null;
}
function remToPx(remValue) {
    return remValue * 16;
}
function pxFromRem(body, prop) {
    const m = body.match(new RegExp(`${prop}\\s*:\\s*([\\d.]+)rem`));
    return m ? remToPx(parseFloat(m[1])) : null;
}

// Extracts the body of a `name(...) { ... return { ... }; ... }` method
// from a component source — the same "read the real inline style object,
// don't re-type it" approach 0.9.647 used for CSS rule bodies, applied to
// the inline-style JS this codebase's own sidebar panels use instead of
// CSS classes for their per-field styling (NumericTransformPanel.js,
// RepeatPanel.js, EditingSidebar.js all style this way — see each file's
// own methods block).
function findMethodReturnObject(jsSource, methodName) {
    const re = new RegExp(`${methodName}\\s*\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\n\\s*\\},?\\n`, 'm');
    const match = jsSource.match(re);
    return match ? match[1] : null;
}
function styleProp(objText, prop) {
    // Matches both a quoted string value ('100%') and a bare numeric one
    // (flex: 1, with no quotes) — this codebase's own inline-style
    // objects use both forms depending on the CSS property's own type.
    const re = new RegExp(`${prop}\\s*:\\s*(?:'([^']*)'|([\\d.]+))`);
    const m = objText.match(re);
    if (!m) return null;
    return m[1] !== undefined ? m[1] : m[2];
}

async function run() {
    const css = (await Promise.all(stylesheetFiles().map((file) => readSource(file)))).join('\n');
    const editorViewSrc = await readSource('ui/views/EditorView.js');
    const worldViewSrc = await readSource('ui/views/WorldView.js');
    const editingSidebarSrc = await readSource('ui/components/EditingSidebar.js');
    const numericTransformPanelSrc = await readSource('ui/components/NumericTransformPanel.js');
    const repeatPanelSrc = await readSource('ui/components/RepeatPanel.js');
    const buildLibraryPanelSrc = await readSource('ui/components/BuildLibraryPanel.js');
    const documentInfoPanelSrc = await readSource('ui/components/DocumentInfoPanel.js');

    // ===============================================================
    // Section A — Reproduce the actual occlusion (real controls, real
    // CSS, real inline styles — no synthetic dummy elements: every
    // number below is read from the exact file/method a real render
    // would use).
    // ===============================================================
    {
        // A1 — World's Save/Publish/Edit Metadata/Undo/Redo/History row:
        // confirm the real template renders all six buttons inside the
        // real .world-view-actions row, and that the CSS now gives that
        // row an escape hatch.
        //
        // AMENDED (0.9.655): this section originally found the row had
        // NO escape hatch (no flex-wrap, no flex-basis sharing on
        // .action-btn itself), so six fixed-content buttons could not
        // fit and were unconditionally clipped. 0.9.655 added
        // flex-wrap:wrap to .world-view-actions (EditingSidebar.js's own
        // rowStyle() convention) — this section now asserts that fix is
        // in place.
        const actionsOpenIdx = worldViewSrc.indexOf('class="world-view-actions">');
        assert(actionsOpenIdx !== -1, n('A: WorldView.js template opens a bare .world-view-actions row'));
        const actionsRowSrc = worldViewSrc.slice(actionsOpenIdx, actionsOpenIdx + 1500);
        const buttonLabelsInRow = ['>Save</button>', '>Publish</button>', 'Edit Metadata</button>', '>Undo</button>', '>Redo</button>', '>History</button>'];
        for (const label of buttonLabelsInRow) {
            assert(actionsRowSrc.includes(label),
                n(`A: WorldView.js's first .world-view-actions row really does contain a real ${label.replace(/<\/?button>/g, '')} button, not a smaller/reduced set`));
        }
        const worldActionsBodies = findAllRuleBodies(css, '.world-view-actions');
        assert(worldActionsBodies.length >= 1, n('A: .world-view-actions has at least one CSS rule'));
        assert(worldActionsBodies.some((b) => /flex-wrap\s*:\s*wrap/.test(b)),
            n('FIXED (0.9.655): .world-view-actions now declares flex-wrap:wrap — six fixed-content buttons can drop to a second line instead of overflowing the panel'));
        const actionBtnBody = findExactRuleBody(css, '.action-btn');
        assert(actionBtnBody && !/flex\s*:/.test(actionBtnBody) && !/width\s*:/.test(actionBtnBody),
            n('A: the base .action-btn rule still sets neither flex nor width of its own — each button still sizes to its own text; it is the row\'s own flex-wrap, not a change to the buttons, that now lets six of them fit a 280px-max-width panel'));

        // A2 — .world-view-actions--navigation (Home/Locations/
        // Notifications): the identical fix, a second, independent
        // instance of the same gap.
        //
        // AMENDED (0.9.655): flex-wrap:wrap added here too.
        const navOpenIdx = worldViewSrc.indexOf('class="world-view-actions world-view-actions--navigation"');
        assert(navOpenIdx !== -1, n('A: WorldView.js template opens .world-view-actions.world-view-actions--navigation'));
        const navRowSrc = worldViewSrc.slice(navOpenIdx, navOpenIdx + 1300);
        for (const label of ['>Home</button>', '>Locations</button>', '>Notifications</button>']) {
            assert(navRowSrc.includes(label),
                n(`A: the navigation row really does contain a real ${label.replace(/<\/?button>/g, '')} button`));
        }
        const navBody = findExactRuleBody(css, '.world-view-actions--navigation');
        assert(navBody && /flex-wrap\s*:\s*wrap/.test(navBody),
            n('FIXED (0.9.655): .world-view-actions--navigation now declares flex-wrap:wrap — Home/Locations/Notifications share the identical fix as the six-button row above, an independent occurrence of the same root cause, not a one-off'));

        // A3 — Editor's .tool-switcher (Select/Place): confirm it really
        // does stretch to fill .sidebar-scroll's own width (column flex,
        // no align-items override — default stretch applies) with no
        // width of its own set on .tool-btn, then confirm .sidebar-
        // scroll's own horizontal clearance.
        //
        // AMENDED (0.9.655): live measurement found this clearance was
        // exactly 4px (0.25rem), genuinely thin under the overlay
        // scrollbar regime. 0.9.655 widened it to 1.0625rem (17px,
        // matching Windows' own classic-scrollbar default) — this
        // section now asserts that fix is in place.
        const toolSwitcherBody = findExactRuleBody(css, '.tool-switcher');
        assert(toolSwitcherBody && /flex-direction\s*:\s*column/.test(toolSwitcherBody) && !/align-items/.test(toolSwitcherBody),
            n('A: .tool-switcher is flex-direction:column with no align-items override — default stretch applies, so .tool-btn fills its full cross-axis width'));
        const toolBtnBody = findExactRuleBody(css, '.tool-btn');
        assert(toolBtnBody && !/width\s*:/.test(toolBtnBody),
            n('A: .tool-btn itself declares no width of its own — its rendered width comes entirely from .tool-switcher\'s stretch, i.e. from .sidebar-scroll\'s own content width'));
        const sidebarScrollBody = findExactRuleBody(css, '.sidebar-scroll');
        assert(sidebarScrollBody && /padding-right\s*:\s*1\.0625rem/.test(sidebarScrollBody) && !/padding-left/.test(sidebarScrollBody),
            n('FIXED (0.9.655): .sidebar-scroll\'s ONLY horizontal padding is now padding-right:1.0625rem (17px) — .tool-switcher, mounted as a direct child with no wrapper of its own, now inherits 17px as its right-hand clearance, enough to cover a classic scrollbar\'s own affordance too'));

        // A4 — NumericTransformPanel's X/Y/Z/R inputs: confirm they are
        // NOT direct children of .sidebar-scroll but sit inside
        // EditingSidebar's own .sectionStyle() box, and that box's own
        // padding is what live measurement found supplying the ~14px
        // buffer those inputs actually get (10px section padding + 4px
        // .sidebar-scroll padding, not any deliberate scrollbar
        // clearance of the input's own).
        const sectionStyleBody = findMethodReturnObject(editingSidebarSrc, 'sectionStyle');
        assert(sectionStyleBody && styleProp(sectionStyleBody, 'padding') === '10px',
            n('A: EditingSidebar.js\'s own sectionStyle() pads its Transform/Groups/Clipboard boxes 10px on every side — this, not any scrollbar-aware rule, is what actually buffers the numeric inputs inside it'));
        const rowStyleBody = findMethodReturnObject(editingSidebarSrc, 'rowStyle');
        assert(rowStyleBody === null || !/padding/.test(rowStyleBody),
            n('A: EditingSidebar.js\'s own rowStyle() (used for the Selection/Groups/Clipboard button rows) adds no padding of its own — whatever buffer those rows get comes from the SAME sectionStyle() wrapper, not a second independent source'));
        const inputStyleBody = findMethodReturnObject(numericTransformPanelSrc, 'inputStyle');
        assert(inputStyleBody && styleProp(inputStyleBody, 'width') === '100%',
            n('A: NumericTransformPanel.js\'s own inputStyle() sets width:100% on the X/Y/Z/R fields — properly relative to their immediate row, not a fixed pixel size that could overflow it'));

        // A5 — RepeatPanel's Copies/Offset inputs: fixed 48px, small
        // enough (with their labels/gap) that they never approach the
        // row's own available width, so they cannot be the thing that
        // overflows even in the narrowest tested case.
        const repeatInputStyleBody = findMethodReturnObject(repeatPanelSrc, 'inputStyle');
        assert(repeatInputStyleBody && styleProp(repeatInputStyleBody, 'width') === '48px',
            n('A: RepeatPanel.js\'s own inputStyle() is a fixed 48px — small enough, with its own label text and gap, to stay well under even the narrowest measured available row width (141px), so it is not an occlusion candidate'));

        // A6 — BuildLibraryPanel's category/sort <select> controls: the
        // well-behaved case — flex:1 + min-width:0 is exactly the
        // pattern that lets a control shrink smoothly with its
        // container's own available width instead of overflowing it.
        const filterSelectBody = findExactRuleBody(css, '.build-library-filter-select');
        assert(filterSelectBody && /flex\s*:\s*1/.test(filterSelectBody) && /min-width\s*:\s*0/.test(filterSelectBody),
            n('A: .build-library-filter-select is flex:1 with min-width:0 — the correct pattern for a control that must shrink with its row rather than resist and overflow it; not an occlusion candidate under either scrollbar regime'));

        console.log('✓ A (AMENDED 0.9.655): World\'s .world-view-actions/.world-view-actions--navigation rows now declare flex-wrap:wrap (fixed) instead of overflowing their panel unconditionally; Editor\'s .tool-switcher buttons now get 17px of .sidebar-scroll padding-right instead of 4px (fixed); the Transform section\'s numeric inputs still get their accidental ~14px buffer from an unrelated section-padding convention (untouched, not at risk), and BuildLibraryPanel\'s filter selects and RepeatPanel\'s fixed-width inputs remain structurally safe (untouched).');
    }

    // ===============================================================
    // Section B — Horizontal geometry.
    // ===============================================================
    {
        // Editor: .sidebar (220px, border-box, 1px right border, 1rem
        // padding) -> content box 220 - 32 - 1 = 187px. This is the
        // exact clientWidth the live pass measured on .sidebar-scroll
        // (187), confirming the arithmetic below matches the real
        // rendered box, not just the CSS source.
        const sidebarBody = findExactRuleBody(css, '.sidebar');
        const sidebarWidth = parseInt((sidebarBody.match(/width\s*:\s*(\d+)px/) || [null, '220'])[1], 10);
        const sidebarPaddingEachSide = pxFromRem(sidebarBody, 'padding');
        assert(/border-right\s*:\s*1px/.test(sidebarBody), n('B: .sidebar has a real 1px right border, counted below'));
        const sidebarContentWidth = sidebarWidth - (2 * sidebarPaddingEachSide) - 1;
        assert(sidebarContentWidth === 187,
            n(`B: .sidebar's own content-box width computes to ${sidebarContentWidth}px (220 - 2*16 padding - 1 border) — matches the live-measured .sidebar-scroll clientWidth exactly`));

        // AMENDED (0.9.655): .sidebar-scroll's own padding-right widened
        // from 4px to 17px (Section A) — every downstream figure in this
        // section that was derived FROM that padding is re-derived here
        // from the real, current CSS value (not a re-typed literal),
        // rather than left describing the pre-fix geometry.
        const sidebarScrollPaddingPx = sidebarScrollPaddingRightPx(css);
        assert(sidebarScrollPaddingPx === 17,
            n('B: .sidebar-scroll\'s own padding-right, read from real CSS, is now 17px'));

        // content available to a DIRECT child (e.g. .tool-switcher) is
        // now 187 - 17 = 170px (was 183px pre-fix).
        const directChildWidth = sidebarContentWidth - sidebarScrollPaddingPx;
        assert(directChildWidth === 170,
            n(`B: width available to a control mounted directly inside .sidebar-scroll (no section wrapper) now computes to ${directChildWidth}px (was 183px pre-0.9.655) — .tool-btn is narrower than before, not occluded, since it is a stretch child sized relative to its true scrolling ancestor (Section C)`));

        // A control inside EditingSidebar's own 10px-padded section box
        // now gets 170 - 20 = 150px; the Transform row's own label +
        // gap are unaffected by this fix (neither lives inside
        // .sidebar-scroll's own padding), so they still leave the same
        // 22px, now against a smaller base.
        const sectionedChildWidth = directChildWidth - 20;
        const labelStyleBody = findMethodReturnObject(numericTransformPanelSrc, 'labelStyle');
        const labelWidth = parseInt(styleProp(labelStyleBody, 'width'), 10);
        const rowStyleBody = findMethodReturnObject(numericTransformPanelSrc, 'rowStyle');
        const rowGap = parseInt(styleProp(rowStyleBody, 'gap'), 10);
        const numericInputAvailableWidth = sectionedChildWidth - labelWidth - rowGap;
        assert(numericInputAvailableWidth === 128,
            n(`B: width available to the Transform section's own X/Y/Z/R input now computes to ${numericInputAvailableWidth}px (150 section content - ${labelWidth}px label - ${rowGap}px gap; was 141px pre-0.9.655) — narrower, still comfortably positive, and this input was never an occlusion candidate (Section A/F: NOT touched by this milestone)`));

        // World: .world-view-overlay (280px max-width, border-box, 1px
        // border, padding 1rem 1.25rem) -> content box
        // 280 - 2*20 - 2 = 238px, matching the live-measured
        // .world-view-overlay-scroll offsetWidth exactly (238).
        const overlayBody = findExactRuleBody(css, '.world-view-overlay');
        const overlayMaxWidth = parseInt((overlayBody.match(/max-width\s*:\s*(\d+)px/) || [null, '280'])[1], 10);
        const overlayPaddingMatch = overlayBody.match(/padding\s*:\s*([\d.]+)rem\s+([\d.]+)rem/);
        const overlaySidePaddingPx = remToPx(parseFloat(overlayPaddingMatch[2]));
        assert(/border\s*:\s*1px/.test(overlayBody), n('B: .world-view-overlay has a real 1px border on every side, counted below'));
        const overlayContentWidth = overlayMaxWidth - (2 * overlaySidePaddingPx) - 2;
        assert(overlayContentWidth === 238,
            n(`B: .world-view-overlay's own content-box width computes to ${overlayContentWidth}px (280 - 2*20 padding - 2 border) — matches the live-measured .world-view-overlay-scroll offsetWidth exactly`));

        // AMENDED (0.9.655): .world-view-overlay-scroll's own
        // padding-right widened from 4px to 17px too (the same shared
        // value as .sidebar-scroll — Section I), so the direct-child
        // figure below is re-derived from the current CSS value.
        const worldScrollBodyForPadding = findExactRuleBody(css, '.world-view-overlay-scroll');
        const worldScrollPaddingPx = remToPx(parseFloat((worldScrollBodyForPadding.match(/padding-right\s*:\s*([\d.]+)rem/) || [null, '1.0625'])[1]));
        assert(worldScrollPaddingPx === 17,
            n('B: .world-view-overlay-scroll\'s own padding-right, read from real CSS, is now 17px — the identical value as .sidebar-scroll'));
        const worldDirectChildWidth = overlayContentWidth - worldScrollPaddingPx;
        assert(worldDirectChildWidth === 221,
            n(`B: width available to .world-view-actions (a direct child of .world-view-overlay-scroll) now computes to ${worldDirectChildWidth}px (was 234px pre-0.9.655) — this figure was never the row's actual constraint anyway: the row's own live-measured content width (434px for the six-button row) dwarfs even the pre-fix 234px, which is why flex-wrap (Section A), not scrollbar clearance, is this row's own fix`));

        console.log('✓ B (AMENDED 0.9.655): every content-width figure this audit\'s live pass originally measured is independently re-derivable from real, unmodified CSS and inline-style source, and the figures downstream of the two widened padding-right rules are re-derived against the CURRENT (post-fix) values — .sidebar-scroll\'s content width (187px, unchanged), a direct child\'s available width (170px, was 183px), a sectioned child\'s available width (128px, was 141px), .world-view-overlay-scroll\'s content width (238px, unchanged), and .world-view-actions\'s own available width (221px, was 234px, and dwarfed either way by its real 434px content width — flex-wrap, not clearance, is what actually fixes that row).');
    }

    // ===============================================================
    // Section C — Scrollbar/content relationship.
    // ===============================================================
    {
        // The two regimes this audit had to reason about (Section 0
        // header narrates the live evidence; this section pins down the
        // CSS facts that make each regime's conclusion follow).
        //
        // Classic (space-reserving) regime: a properly relative-sized
        // child (width:100%, or a flex/stretch child with no fixed
        // width of its own) shrinks WITH its scrolling ancestor's own
        // reduced content box — not occluded, only narrower. Confirmed
        // above (Section A) that .tool-btn/.tool-switcher, the Transform
        // inputs, and the BuildLibraryPanel selects are all sized this
        // way — none of them is at risk under this regime.
        const toolSwitcherBody = findExactRuleBody(css, '.tool-switcher');
        const toolBtnBody = findExactRuleBody(css, '.tool-btn');
        const inputStyleBody = findMethodReturnObject(numericTransformPanelSrc, 'inputStyle');
        assert(!/width\s*:\s*\d/.test(toolSwitcherBody) && !/width\s*:\s*\d/.test(toolBtnBody),
            n('C: neither .tool-switcher nor .tool-btn sets a fixed pixel width anywhere — both are classic-regime-safe (shrink with their scrolling ancestor rather than overflow it)'));
        assert(styleProp(inputStyleBody, 'width') === '100%',
            n('C: the Transform input\'s own width:100% is likewise classic-regime-safe'));

        // Overlay regime: the scrollbar paints on top of whatever is
        // already there, full width, right to .sidebar-scroll's own
        // edge — so the only thing that matters is how much of
        // .sidebar-scroll's OWN padding-right sits between a stretched
        // child's right edge and that edge.
        //
        // AMENDED (0.9.655): .tool-btn's clearance, confirmed 4px pre-fix
        // (genuinely thin against any visible scrollbar affordance,
        // live-confirmed in this sandbox's own overlay-scrollbar
        // rendering), is now 17px — matching Windows' own classic-
        // scrollbar default, the widest common affordance any platform's
        // real scrollbar/thumb actually occupies. The overlay-regime risk
        // this section originally flagged as CONDITIONAL-BUT-REAL is now
        // closed for both regimes.
        assert(sidebarScrollPaddingRightPx(css) === 17,
            n('FIXED (0.9.655): .sidebar-scroll\'s own clearance is now 17px — sufficient under the overlay regime (the ONLY number that matters there) and still additive, not merely non-harmful, under the classic regime'));

        // World's own .world-view-actions overflow was NOT a scrollbar-
        // relationship question at all — Section B already showed its
        // 434px real content width dwarfed its available width
        // independent of any scrollbar, and Section A already showed
        // .world-view-overlay-scroll has no vertical scrollbar condition
        // attached to that overflow (the live pass reproduced it with
        // hasVScroll: false). Re-confirm here that .world-view-overlay-
        // scroll's OWN overflow-x is still hidden — unchanged and
        // irrelevant to the fix, since flex-wrap (Section A) means the
        // row's own content no longer exceeds a single line's worth of
        // WIDTH in the way that property polices; it wraps to additional
        // lines within the box instead.
        const worldScrollBody = findExactRuleBody(css, '.world-view-overlay-scroll');
        assert(worldScrollBody && /overflow-x\s*:\s*hidden/.test(worldScrollBody),
            n('C: .world-view-overlay-scroll is still overflow-x:hidden (unchanged) — irrelevant now that flex-wrap (Section A, FIXED) lets the row\'s six buttons wrap onto additional lines instead of exceeding the box\'s width at all'));

        console.log('✓ C (AMENDED 0.9.655): the Editor risk (.tool-switcher clearance) that was real-but-CONDITIONAL (safe under the classic scrollbar regime, genuinely thin under the overlay regime this sandbox itself renders) is now closed under BOTH regimes — clearance widened from 4px to 17px. World\'s own .world-view-actions gap, which was UNCONDITIONAL and had nothing to do with scrollbar rendering, is now closed by flex-wrap: the row\'s content wraps onto additional lines within its box instead of exceeding the box\'s width.');
    }
    function sidebarScrollPaddingRightPx(cssText) {
        const body = findExactRuleBody(cssText, '.sidebar-scroll');
        return remToPx(parseFloat((body.match(/padding-right\s*:\s*([\d.]+)rem/) || [null, '1.0625'])[1]));
    }

    // ===============================================================
    // Section D — Editor regression (0.9.647's own invariants, re-run).
    // ===============================================================
    {
        let vueResolvable = true;
        try {
            execSync('node -e "import(\'vue\')"', { cwd: SOURCE_ROOT, stdio: 'pipe' });
        } catch {
            vueResolvable = false;
        }
        assert(!vueResolvable,
            n('D: confirmed live, same as 0.9.647 Section B — \'vue\' does not resolve under plain node in this repository; this audit\'s own live-Chromium pass used a session-local, non-committed Playwright + Vue install for exactly this reason, never checked in'));

        const scrollWrapperRule = findExactRuleBody(css, '.sidebar-scroll');
        assert(scrollWrapperRule && /overflow-y\s*:\s*auto/.test(scrollWrapperRule) && /height\s*:\s*100%/.test(scrollWrapperRule),
            n('D: .sidebar-scroll is still overflow-y:auto, height:100% — the sole scroll owner 0.9.647 established is unchanged'));

        const sidebarOpenCount = (editorViewSrc.match(/<div class="sidebar">/g) || []).length;
        const sidebarScrollOpenCount = (editorViewSrc.match(/<div class="sidebar-scroll">/g) || []).length;
        assert(sidebarOpenCount === 1 && sidebarScrollOpenCount === 1,
            n('D: exactly one .sidebar and one .sidebar-scroll element still exist in EditorView.js'));

        const sidebarRule = findExactRuleBody(css, '.sidebar');
        assert(sidebarRule && /width\s*:\s*220px/.test(sidebarRule) && /flex-shrink\s*:\s*0/.test(sidebarRule) && !/max-height|overflow|height\s*:/.test(sidebarRule),
            n('D: .sidebar itself is still a fixed 220px, flex-shrink:0, with no height/overflow of its own — .sidebar-scroll is still the only scroll owner'));

        assert(/overflow-x\s*:\s*hidden/.test(scrollWrapperRule),
            n('D: .sidebar-scroll is still overflow-x:hidden — no unintended horizontal scrollbar has appeared on the Editor sidebar'));

        console.log('✓ D: 0.9.647\'s own scroll-ownership invariants all still hold — this audit is read-only and changed nothing about them.');
    }

    // ===============================================================
    // Section E — World regression (not assumed correct; it isn't).
    // ===============================================================
    {
        // AMENDED (0.9.655): this section originally re-stated, from
        // source, the two real gaps Section A found ("World's own
        // regression" — no flex-wrap anywhere on either row). Both are
        // now fixed; this section asserts the fix from source instead.
        const worldActionsBodies = findAllRuleBodies(css, '.world-view-actions');
        const anyWraps = worldActionsBodies.some((b) => /flex-wrap\s*:\s*wrap/.test(b));
        assert(anyWraps,
            n('FIXED (0.9.655): World\'s .world-view-actions now has a flex-wrap:wrap escape hatch in css/main.css — no longer the real, present-tense gap this section originally found'));

        const navBody = findExactRuleBody(css, '.world-view-actions--navigation');
        assert(navBody && /flex-wrap\s*:\s*wrap/.test(navBody),
            n('FIXED (0.9.655): .world-view-actions--navigation now carries the identical fix — two independent occurrences of the same root cause, both closed'));

        // Contrast with the World rules that already got this right
        // — .world-view-primary-nav .action-btn's flex:1 — the pattern
        // 0.9.654 found World's own CSS already knew, just not
        // consistently; 0.9.655 brought the two broken rows into line
        // with it (via flex-wrap, the sibling convention used one file
        // over in EditingSidebar.js's own rowStyle()) rather than
        // switching them to flex:1, since these rows' buttons are not
        // meant to share a row's width evenly — they are meant to fit,
        // wrapping onto a second line when they don't.
        const primaryNavBtnBody = findExactRuleBody(css, '.world-view-primary-nav .action-btn');
        assert(primaryNavBtnBody && /flex\s*:\s*1/.test(primaryNavBtnBody),
            n('E: .world-view-primary-nav .action-btn (Explore/Map/Places, immediately below the fixed rows) still uses flex:1 to share width instead of overflowing — unchanged, and was never part of this gap'));

        console.log('✓ E (AMENDED 0.9.655): World\'s real, live, present-tense content-overflow defect in its two action rows — confirmed by real template markup and real CSS in 0.9.654 — is now closed by flex-wrap:wrap on both rules, the same convention EditingSidebar.js\'s own rowStyle() already used. .world-view-primary-nav .action-btn\'s own flex:1 pattern is untouched.');
    }

    // ===============================================================
    // Section F — Interactive reachability.
    // ===============================================================
    {
        // World: Undo/Redo/History (and Notifications) are rendered
        // AMENDED (0.9.655): were rendered ENTIRELY outside
        // .world-view-overlay's own clientWidth once overflow-x:hidden
        // clipped them (live-measured: Undo's own left edge alone
        // already exceeded the panel's visible right edge) — not
        // "partially obscured," rendered nowhere a pointer could reach
        // them at all. flex-wrap:wrap (Section A/E, FIXED) now wraps
        // them onto additional lines instead, so all six/three buttons
        // render within the panel and are pointer-reachable. Confirm
        // from source that no OTHER path reaches the same actions (e.g.
        // a keyboard shortcut) — recorded for completeness, not because
        // reachability still depends on it.
        const undoShortcutExists = /ctrl.*z|cmd.*z|metaKey.*key\s*===\s*'z'/i.test(worldViewSrc) || /undoAction/.test(worldViewSrc) && /keydown/i.test(worldViewSrc);
        // This audit does not assert on undoShortcutExists's boolean
        // value either way — a keyboard path, if one exists, would mean
        // History alone (which has no conventional shortcut) stays
        // unreachable rather than all three; it does not change Undo/
        // Redo/History's own on-screen button being genuinely dead
        // regardless. Recorded for 0.9.655's own scoping, not asserted.
        assert(typeof undoShortcutExists === 'boolean',
            n('F: recorded (not asserted true/false) whether WorldView.js wires a keyboard path to undo/redo, for 0.9.655\'s own scoping — it does not change that the on-screen Undo/Redo/History buttons themselves are unreachable by pointer'));

        // Editor: .tool-btn's reachability was conditional, exactly as
        // Section C established — under the classic regime fully
        // clickable (narrower, not covered); under the overlay regime
        // its own rightmost ~few px sat under the scrollbar's own paint
        // region, where overlay scrollbars (by design, so their own
        // thumb stays draggable) intercept the pointer rather than
        // passing the click through to content beneath them.
        //
        // AMENDED (0.9.655): 17px of clearance (Section C, FIXED) keeps
        // .tool-btn's own right edge clear of that paint region under
        // either regime, so this is no longer conditional.
        const scrollWrapperRule = findExactRuleBody(css, '.sidebar-scroll');
        assert(/overflow-y\s*:\s*auto/.test(scrollWrapperRule),
            n('F: confirmed .sidebar-scroll uses overflow-y:auto (not scroll) — unchanged; the scrollbar/thumb only exists at all once content actually overflows, exactly the condition 0.9.646/0.9.647 already established is the common case'));

        console.log('✓ F (AMENDED 0.9.655): World\'s Undo/Redo/History (and Notifications), unconditionally unreachable by pointer pre-fix, are now reachable — flex-wrap wraps them onto additional lines within the panel. Editor\'s .tool-btn reachability, conditional on the OS/browser scrollbar regime pre-fix (genuinely broken under overlay, fine under classic), is now unconditional — 17px of clearance covers both.');
    }

    // ===============================================================
    // Section G — Long/short content behavior.
    // ===============================================================
    {
        const scrollWrapperRule = findExactRuleBody(css, '.sidebar-scroll');
        assert(!/min-height/.test(scrollWrapperRule),
            n('G: .sidebar-scroll still sets no min-height (re-confirms 0.9.647 Section B) — short/normal sidebar content is not forced to look taller or gain a scrollbar it does not need'));

        const worldScrollBody = findExactRuleBody(css, '.world-view-overlay-scroll');
        assert(worldScrollBody && !/min-height/.test(worldScrollBody),
            n('G: .world-view-overlay-scroll likewise sets no min-height — the same "no forced blank space on short content" property holds for World\'s own wrapper'));

        // Neither candidate 0.9.655 fix (flex-wrap on the two World
        // action rows; a wider shared padding-right on the two *-scroll
        // rules) touches min-height/height/max-height anywhere, so
        // neither one is capable of introducing this regression.
        assert(/max-height\s*:\s*calc\(100vh - 3rem\)/.test(worldScrollBody),
            n('G: .world-view-overlay-scroll\'s own max-height:calc(100vh - 3rem) (0.5.7\'s own bound) is unchanged — this audit touched nothing about it'));

        console.log('✓ G: neither Editor\'s nor World\'s scroll wrapper forces extra blank space on short content, and 0.9.655\'s two narrow candidate fixes (flex-wrap on two World rules; a shared padding-right widen) have no mechanism by which they could start doing so.');
    }

    // ===============================================================
    // Section H — Viewport variations.
    // ===============================================================
    {
        // Both panels are fixed-width/max-width BY CONSTRUCTION — no
        // viewport unit, no percentage-of-viewport, anywhere in either
        // rule — so this geometry cannot depend on viewport size. This
        // audit's own live pass confirmed this empirically too (1280x900,
        // 900x900, 1280x480, and 1280x1400 all produced byte-identical
        // .sidebar-scroll/.tool-btn geometry), consistent with what the
        // source below already guarantees on its own.
        const sidebarRule = findExactRuleBody(css, '.sidebar');
        assert(/width\s*:\s*220px/.test(sidebarRule) && !/vw|vh|%/.test(sidebarRule),
            n('H: .sidebar\'s width is a bare 220px — no vw/vh/% anywhere in the rule, so Editor\'s sidebar geometry is viewport-size-independent by construction'));

        const overlayRule = findExactRuleBody(css, '.world-view-overlay');
        assert(/max-width\s*:\s*280px/.test(overlayRule) && !/vw|vh|%/.test(overlayRule.replace(/rgba?\([^)]*\)/g, '')),
            n('H: .world-view-overlay\'s max-width is a bare 280px (ignoring the unrelated rgba() background-color value) — World\'s own panel geometry is likewise viewport-size-independent by construction'));

        // .world-view-overlay-scroll's own max-height DOES use vh — the
        // one dimension (vertical) that genuinely is viewport-dependent,
        // confirming this audit is not overclaiming "nothing here is
        // viewport-relative," only that the HORIZONTAL geometry this
        // milestone is about is not.
        const worldScrollBody = findExactRuleBody(css, '.world-view-overlay-scroll');
        assert(/max-height\s*:\s*calc\(100vh/.test(worldScrollBody),
            n('H: by contrast, .world-view-overlay-scroll\'s own max-height genuinely IS viewport-height-relative (100vh) — confirming this audit is not overclaiming viewport-independence beyond the horizontal dimension it actually investigated'));

        console.log('✓ H: both panels\' horizontal geometry is fixed by construction (220px / 280px, no vw/vh/%), matching this audit\'s own live pass across four viewport sizes returning identical numbers every time — the occlusion risk this file documents is intrinsic to the sidebar/overlay\'s own fixed width, not a narrow-viewport-only edge case.');
    }

    // ===============================================================
    // Section I — Existing CSS conventions (the fix already exists
    // elsewhere in this SAME codebase).
    // ===============================================================
    {
        // The World fix: flex-wrap:wrap, already used, correctly, by
        // EditingSidebar.js's own rowStyle() for its OWN button rows —
        // literally the sidebar counterpart of the broken World rows.
        const rowStyleBody = findMethodReturnObject(editingSidebarSrc, 'rowStyle');
        assert(rowStyleBody && styleProp(rowStyleBody, 'flexWrap') === 'wrap',
            n('I: EditingSidebar.js\'s own rowStyle() already sets flexWrap:\'wrap\' on its own button rows (Select All / Create / Rename-Duplicate-Delete-+Sel--Sel / Copy-Paste) — the exact mechanism World\'s own .world-view-actions/.world-view-actions--navigation are missing, already proven out one file over'));

        // Also already used by NumericTransformPanel/RepeatPanel's own
        // button rows via flex:1 sharing — a second, independent
        // existing convention for the same class of problem.
        const modeButtonStyleBody = findMethodReturnObject(numericTransformPanelSrc, 'modeButtonStyle');
        assert(modeButtonStyleBody && styleProp(modeButtonStyleBody, 'flex') === '1',
            n('I: NumericTransformPanel.js\'s own modeButtonStyle() (Absolute/Offset) already uses flex:1 to share a row\'s width rather than overflow it'));
        const repeatButtonStyleBody = findMethodReturnObject(repeatPanelSrc, 'buttonStyle');
        assert(repeatButtonStyleBody && styleProp(repeatButtonStyleBody, 'flex') === '1',
            n('I: RepeatPanel.js\'s own buttonStyle() (Repeat X/Y/Z) uses the identical flex:1 convention'));

        // And World's OWN .world-view-primary-nav .action-btn (Section
        // E) is a THIRD, independent instance of the same working
        // pattern, inside World's own file. 0.9.655 does not need to
        // invent anything — it needs to apply a convention this
        // codebase already uses in at least three other places to the
        // two rows that are missing it.
        const primaryNavBtnBody = findExactRuleBody(css, '.world-view-primary-nav .action-btn');
        assert(primaryNavBtnBody && /flex\s*:\s*1/.test(primaryNavBtnBody),
            n('I: .world-view-primary-nav .action-btn is a THIRD independent instance of the same flex-sharing convention, inside World\'s own file — 0.9.655\'s World-side fix is applying an existing, local convention, not importing a new one'));

        // The scrollbar-clearance fix: .sidebar-scroll and .world-view-
        // overlay-scroll already share the IDENTICAL padding-right value
        // (0.25rem) — proving this is already one shared convention, not
        // two independently-maintained ones, so 0.9.655's candidate fix
        // is a single shared numeric change, not two separate patches.
        const sidebarScrollBody = findExactRuleBody(css, '.sidebar-scroll');
        const worldScrollBody = findExactRuleBody(css, '.world-view-overlay-scroll');
        const sidebarPad = (sidebarScrollBody.match(/padding-right\s*:\s*([\d.]+)rem/) || [])[1];
        const worldPad = (worldScrollBody.match(/padding-right\s*:\s*([\d.]+)rem/) || [])[1];
        assert(sidebarPad && sidebarPad === worldPad,
            n(`I: .sidebar-scroll and .world-view-overlay-scroll already declare the identical padding-right (${sidebarPad}rem each) — confirming 0.9.655's candidate widen is one shared convention change, matching this milestone's own recommendation not to patch the two sidebars independently`));

        console.log('✓ I: every candidate fix this audit recommends is an application of a convention this SAME codebase already uses correctly elsewhere — flex-wrap:wrap (EditingSidebar.js\'s own rowStyle()), flex:1 row-sharing (NumericTransformPanel.js, RepeatPanel.js, and World\'s own .world-view-primary-nav .action-btn), and a single shared .sidebar-scroll/.world-view-overlay-scroll padding-right value both rules already carry identically. No new sidebar-specific or World-specific mechanism is needed.');
    }

    // ===============================================================
    // Section J — Non-interference / production-change guard.
    // ===============================================================
    {
        // AMENDED (0.9.655): this guard originally required a test-only
        // diff (this file + tests.html), matching 0.9.654's own
        // "test-only" brief. 0.9.655 is deliberately NOT test-only — it
        // is the narrow production fix this audit itself recommended —
        // so the allowed set now includes exactly the one production
        // file the fix brief named: css/main.css. Everything else this
        // audit ever read (EditorView.js, WorldView.js,
        // EditingSidebar.js, NumericTransformPanel.js, RepeatPanel.js,
        // BuildLibraryPanel.js) remains excluded — none of those needed
        // to change for either the flex-wrap or the padding-right fix.
        let changedFiles = [];
        try {
            const diffOutput = execSync('git diff --name-only HEAD', { cwd: SOURCE_ROOT, encoding: 'utf8' });
            const statusOutput = execSync('git status --porcelain', { cwd: SOURCE_ROOT, encoding: 'utf8' });
            const fromDiff = diffOutput.split('\n').filter(Boolean);
            const fromStatus = statusOutput.split('\n').filter(Boolean).map((line) => line.slice(3));
            changedFiles = [...new Set([...fromDiff, ...fromStatus])];
        } catch {
            changedFiles = null;
        }
        if (changedFiles !== null) {
            const allowed = new Set(['tests.html', 'css/main.css']);
            const unexpected = changedFiles.filter((f) => !allowed.has(f) && !f.startsWith('tests/SidebarScrollbarContentOcclusionBoundaryAudit'));
            assert(unexpected.length === 0,
                n(`J: no file outside {tests.html, tests/SidebarScrollbarContentOcclusionBoundaryAudit.test.js, css/main.css} is modified (found unexpected: ${JSON.stringify(unexpected)}) — 0.9.655's production change is confined to css/main.css exactly as its own brief required; EditorView.js, WorldView.js, EditingSidebar.js, NumericTransformPanel.js, RepeatPanel.js, and BuildLibraryPanel.js remain read-only source-of-truth for this audit, never edited by it`));
        } else {
            console.log('  (J: git not available in this environment to enumerate changed files — skipped, not failed)');
        }

        // Re-confirm canvas/toolbar/app-shell rules this audit never
        // touched are still exactly what 0.9.647 Section D recorded.
        const editorBodyRule = findExactRuleBody(css, '.editor-body');
        assert(editorBodyRule && /display\s*:\s*flex/.test(editorBodyRule) && /flex\s*:\s*1/.test(editorBodyRule),
            n('J: .editor-body is unchanged (still display:flex; flex:1; min-height:0) — the canvas column beside the sidebar is untouched'));

        console.log('✓ J (AMENDED 0.9.655): the only files this commit changes are this test file, css/main.css, and tests.html\'s registration of the new 0.9.656 closure audit; the Editor canvas, World\'s spatial canvas, both panels\' own width/max-width, both panels\' vertical scroll, the toolbar, and every other panel are all read from, never written to.');
    }

    console.log(`\n✅ 0.9.654 Sidebar Scrollbar Content Occlusion Boundary Audit complete (${assertionCount} assertions) — AMENDED BY 0.9.655: both gaps this audit found are now fixed. World's own .world-view-actions/.world-view-actions--navigation rows, which overflowed their panel unconditionally (a plain missing-flex-wrap bug, nothing to do with scrollbars), now wrap. Editor's .tool-switcher buttons, which had a genuine scrollbar-regime-CONDITIONAL 4px-clearance gap (unsafe under overlay scrollbars, safe under classic ones), now get 17px, safe under either regime. The Transform section's own numeric inputs, RepeatPanel's inputs, and BuildLibraryPanel's filter selects remain untouched and were never at risk. See 0.9.656 for the dedicated closure audit.`);
}

run().catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
});
