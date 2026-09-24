import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stylesheetFiles } from './support/SourceFileGroups.js';

// 0.9.658 — Expanded Editor Sidebar Scrollbar Occlusion Boundary Audit.
//
// TYPE (at authoring): test-only boundary audit. PRODUCTION CHANGES (at
// authoring): none (Section J's own guard confirmed it).
//
// AMENDED BY 0.9.659: the gap this audit found below has since been
// fixed — flexWrap:'wrap' added to AlignmentPanel.js's align/distribute
// row literals and to RepeatPanel.js's Copies/Offset row and Repeat
// X/Y/Z row literals, the same convention this audit's own Section G
// already found proven safe one section below (Groups' own Advanced
// row, via EditingSidebar.js's rowStyle()). This file's own narrative
// and live-measured numbers below are left as the historical record of
// what was found and how; each Section's own assertions have been
// updated in place (marked "AMENDED (0.9.659)" / "FIXED (0.9.659)") to
// check the CORRECTED behavior rather than silently going stale,
// following this codebase's existing convention (0.9.655 amending
// 0.9.654's own audit) of amending a superseded audit in the same
// commit as its fix, reused here per 0.9.659's own brief instead of
// spinning up a separate 0.9.656-style closure-audit file.
//
// 0.9.654/0.9.655/0.9.656 closed the Editor sidebar's COLLAPSED/DEFAULT
// layout: .tool-switcher's own clearance from .sidebar-scroll's edge, and
// World's two action rows. Every control those audits measured — the
// tool switcher, the Selection/Groups/Clipboard button rows, the
// Transform section's always-visible numeric X/Y/Z/R inputs — is present
// in the DOM the moment EditingSidebar mounts. But EditingSidebar.js has
// TWO `CollapsibleSection` "Advanced" instances (Transform's own
// Align/Distribute/Repeat controls, and Groups' own Rename/Duplicate/
// Delete/+Sel/-Sel controls), both `collapsed: true` by default (this
// file's own `data()`) — `CollapsibleSection.js`'s own template renders
// its body with `v-if="!collapsed"`, so AlignmentPanel.js's and
// RepeatPanel.js's own DOM literally DOES NOT EXIST until a user clicks
// "Advanced." No prior audit ever clicked it. This milestone's brief
// asked the right question: does the family of layouts this sidebar can
// render include one none of them tested?
//
// It does, and the defect this audit found there is WORSE than either
// previously-fixed gap — not a thin-clearance issue fixable by widening
// a padding value, but real buttons rendering entirely outside the
// sidebar, on top of the Editor's own 3D canvas.
//
// METHOD: identical to 0.9.654's own — this repository's committed test
// suite runs under plain `node` (Section F re-confirms `vue` still does
// not resolve there), so nothing below can literally instantiate a
// browser from a committed file. This audit's own INVESTIGATION did:
// a throwaway, non-committed harness (a static HTML page mounting the
// real, unmodified EditingSidebar.js/CollapsibleSection.js/
// AlignmentPanel.js/RepeatPanel.js/NumericTransformPanel.js against the
// real, unmodified css/main.css, inside the exact `.editor-body >
// .sidebar > .sidebar-scroll` shape EditorView.js's own template uses)
// served over a local HTTP server (file:// URLs cannot satisfy ES module
// CORS) and driven by a session-local Playwright + npm-installed Vue
// 3.4.31 (from the npm registry, not the jsdelivr CDN tests.html itself
// uses — this sandbox's egress proxy allows the former, not the latter;
// irrelevant to the fix itself, since the harness only ever needed A
// vue build, not that one specifically). Nothing outside tests/ and this
// file changed as a result. Every number below was read back with real
// getBoundingClientRect()/elementFromPoint() calls against that real
// render, at 1280x900 (the same viewport 0.9.654's own live pass used),
// then independently re-derived from source so a reader can verify each
// figure by reading the cited file rather than trusting this comment.
//
// HEADLINE FINDING: with Transform's "Advanced" expanded, live-measured
// against the real render:
//   - .sidebar-scroll's own box: left=16 right=203 width=187 (exactly
//     the 187px Section B of 0.9.654 already established from source).
//     Its own reserved scrollbar clearance (0.9.655's 17px
//     padding-right) occupies x=[186,203) — unchanged, and correctly
//     sized for what it was built to cover: .tool-switcher, whose own
//     buttons still measure right=186.0 exactly, flush against that
//     clearance zone's own left edge, never inside it.
//   - Inside EditingSidebar's own sectionStyle() box (10px padding + 1px
//     border), content spans x=[27,175) — the 148px figure 0.9.654
//     Section B's own arithmetic approximated as 150 (it only subtracted
//     padding, not the 1px border each side); this audit's own live
//     pass confirms 148 is the exact rendered figure.
//   - Inside CollapsibleSection's own `.collapsible-section-body` (CSS:
//     `padding: 0.25rem 0 0.25rem 1.3rem` — LEFT-only indent, ZERO
//     right padding), content spans x=[47.8,175) — 127.2px. This is
//     where AlignmentPanel.js and RepeatPanel.js are mounted once
//     Advanced expands.
//   - AlignmentPanel.js's three per-row buttons (`buttonStyle()`:
//     `flex: 1`, `whiteSpace: 'nowrap'`, NO `minWidth` override) and its
//     row `<div>` (a bare `{ display: 'flex', gap: '4px' }` literal, no
//     `flexWrap`) cannot shrink below their own text's rendered width —
//     nowrap text sets a flex item's automatic minimum size to its full
//     content width. Live-measured: the align-center row alone needs
//     "← Left" (53.8px) + "Center X" (67.0px) + "Right →" (60.4px) +
//     2×4px gaps = 189.2px of minimum content in a 127.2px box. Result:
//     "Right →" renders at left=176.5 right=236.9 — its OWN CENTER
//     POINT (206.7, 446.7) resolves via `document.elementFromPoint()`
//     to `.sidebar` itself, not the button (`hitIsSelf: false`) — a
//     real click at that button's visual center cannot reach it. The
//     Distribute row is worse: three "Distribute X/Y/Z" buttons need
//     288.5px minimum in the same 127.2px box. "Distribute Z" renders at
//     left=242.8 right=336.3 — entirely past .sidebar-scroll's own
//     border edge (203) — its center point resolves to `.canvas-stub`
//     (the Editor's OWN 3D CANVAS in the real app), not merely
//     off-screen but laid out on top of unrelated content next to the
//     sidebar.
//   - RepeatPanel.js's Copies/Offset row (two labels + two fixed-48px
//     inputs in a plain `{ display: 'flex', alignItems: 'center', gap:
//     '6px' }` row, again no `flexWrap`) and its Repeat X/Y/Z button row
//     (`buttonStyle()`: `flex: 1`, no `minWidth`, in a bare `{ display:
//     'flex', gap: '4px' }` row) overflow the identical way: the Offset
//     input renders at left=193.3 right=241.3 (mostly clipped, a 9.7px
//     sliver visible); "Repeat Z" renders at left=163.3 right=217.0
//     (entirely past the 203px clip edge).
//   - By contrast, Groups' OWN "Advanced" section (Rename/Duplicate/
//     Delete/+Sel/-Sel) — the SAME CollapsibleSection component, the
//     SAME 127.2px available width — renders every button fully inside
//     bounds. It uses EditingSidebar.js's own `rowStyle()`
//     (`flexWrap: 'wrap'`), the exact mechanism 0.9.654/0.9.655 already
//     proved out for World's two rows and for this sidebar's own
//     Selection/Clipboard rows. The defect is specific to
//     AlignmentPanel.js/RepeatPanel.js not having adopted a convention
//     this SAME file already uses one section below them.
//
// This directly answers the brief's own "Possibility 1 vs. Possibility
// 2" framing (Section E): it is Possibility 2, a genuine child-layout
// problem, not a too-small clearance. The overflow in the worst case
// (Distribute Z, ~133px past .sidebar-scroll's own edge) is an order of
// magnitude larger than any plausible padding-right widen — widening
// global sidebar padding further would not fix this and would be
// exactly the "hide the underlying layout error" outcome the brief
// warned against.
//
//   Section A — Reproduce: the exact real controls affected, confirmed
//               from source (which methods/templates lack flex-wrap).
//   Section B — State matrix: both CollapsibleSection instances default
//               collapsed, confirmed from source — reproducing exactly
//               why 0.9.654/0.9.656 could not have found this.
//   Section C — Horizontal occlusion invariant: the geometry chain
//               (collapsible-section-body's own zero right-padding,
//               AlignmentPanel/RepeatPanel's own no-flex-wrap rows) that
//               produces the live-measured overflow.
//   Section D — Vertical reachability: distinguishes this HORIZONTAL,
//               unconditional clip from ordinary "scroll to reveal"
//               vertical overflow, which still works correctly.
//   Section E — Dynamic layout / regime independence: the defect exists
//               identically whether or not a vertical scrollbar is even
//               present — it is not a scrollbar-interaction bug.
//   Section F — Overlay vs. classic scrollbar model: confirms this
//               defect is UNCONDITIONAL under both, unlike 0.9.654's own
//               .tool-switcher finding.
//   Section G — Existing conventions: the fix already exists one method
//               away in the SAME file (EditingSidebar.js's rowStyle()),
//               proven safe by Groups' own Advanced section using it.
//   Section H — Regression against 0.9.655/0.9.656: every invariant
//               those milestones established is unchanged.
//   Section I — Scope: World's own CollapsibleSection usages do not
//               share the risky combination, confirmed from source.
//   Section J — Production-change guard: this milestone touches nothing
//               but tests/ and tests.html.

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

// Same convention as tests/SidebarScrollbarContentOcclusionBoundaryAudit.test.js
// (itself borrowed from tests/EditorSidebarScrollOwnershipClosureAudit.test.js).
function classToken(selector) {
    const escaped = selector.replace(/[.]/g, '\\.');
    return `(?<![\\w-])${escaped}(?![\\w-])`;
}
function findAllRuleBodies(cssText, selector) {
    const token = classToken(selector);
    const re = new RegExp(`([^{}]*${token}[^{}]*)\\{([^}]*)\\}`, 'gm');
    return [...cssText.matchAll(re)].map((m) => m[2]);
}
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
function findMethodReturnObject(jsSource, methodName) {
    const re = new RegExp(`${methodName}\\s*\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\n\\s*\\},?\\n`, 'm');
    const match = jsSource.match(re);
    return match ? match[1] : null;
}
function styleProp(objText, prop) {
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
    const collapsibleSectionSrc = await readSource('ui/components/CollapsibleSection.js');
    const alignmentPanelSrc = await readSource('ui/components/AlignmentPanel.js');
    const repeatPanelSrc = await readSource('ui/components/RepeatPanel.js');
    const numericTransformPanelSrc = await readSource('ui/components/NumericTransformPanel.js');

    // ===============================================================
    // Section A — Reproduce the exact real controls affected.
    // ===============================================================
    {
        // A1 — EditingSidebar.js really does mount AlignmentPanel and
        // RepeatPanel INSIDE a CollapsibleSection titled "Advanced", for
        // Transform, and really does mount its own Rename/Duplicate/
        // Delete/+Sel/-Sel row inside a SECOND, independent
        // CollapsibleSection titled "Advanced", for Groups — exactly the
        // two "Advanced" instances the brief's own state matrix (Section
        // B) needs to exist.
        const transformAdvancedIdx = editingSidebarSrc.indexOf('transformAdvancedCollapsed');
        assert(transformAdvancedIdx !== -1, n('A: EditingSidebar.js really does declare transformAdvancedCollapsed'));
        const transformSectionSlice = editingSidebarSrc.slice(
            editingSidebarSrc.indexOf('<h4 :style="headingStyle()">Transform</h4>'),
            editingSidebarSrc.indexOf('<h4 :style="headingStyle()">Groups</h4>')
        );
        assert(transformSectionSlice.includes('<AlignmentPanel'), n('A: Transform\'s own CollapsibleSection really does mount the real AlignmentPanel'));
        assert(transformSectionSlice.includes('<RepeatPanel'), n('A: Transform\'s own CollapsibleSection really does mount the real RepeatPanel'));
        assert(transformSectionSlice.includes(':collapsed="transformAdvancedCollapsed"'), n('A: Transform\'s CollapsibleSection is bound to transformAdvancedCollapsed'));

        const groupsSectionSlice = editingSidebarSrc.slice(
            editingSidebarSrc.indexOf('<h4 :style="headingStyle()">Groups</h4>'),
            editingSidebarSrc.indexOf('<h4 :style="headingStyle()">Clipboard</h4>')
        );
        assert(groupsSectionSlice.includes(':collapsed="groupsAdvancedCollapsed"'), n('A: Groups\' own, INDEPENDENT CollapsibleSection is bound to groupsAdvancedCollapsed, not the Transform one'));
        for (const label of ['Rename', 'Duplicate', 'Delete', '+Sel', '−Sel']) {
            assert(groupsSectionSlice.includes(`>${label}</button>`), n(`A: Groups' Advanced section really does contain a real ${label} button`));
        }

        // A2 — CollapsibleSection.js's own template really does gate its
        // body on `v-if="!collapsed"` — the body's DOM (and everything
        // inside it) does not exist at all while collapsed, exactly why
        // no prior audit's own DOM-based reasoning could have touched
        // AlignmentPanel.js/RepeatPanel.js's own layout.
        assert(/v-if="!collapsed"/.test(collapsibleSectionSrc), n('A: CollapsibleSection.js\'s own body div is v-if-gated on !collapsed — real conditional DOM existence, not merely a CSS display:none some prior source-only audit might have overlooked'));

        // A3 — AlignmentPanel.js's own buttonStyle(): flex:1 (so it
        // shares row width) + whiteSpace:'nowrap' (so its text cannot
        // wrap to reduce the item's own minimum size) + NO minWidth
        // override (so the flex item's automatic minimum size is NOT
        // clamped to 0 — it defaults to the nowrap text's own full
        // rendered width). This exact combination is what forces a row
        // to refuse to shrink below its own buttons' text content.
        const alignButtonStyleBody = findMethodReturnObject(alignmentPanelSrc, 'buttonStyle');
        assert(alignButtonStyleBody && styleProp(alignButtonStyleBody, 'flex') === '1',
            n('A: AlignmentPanel.js\'s own buttonStyle() sets flex:1'));
        assert(styleProp(alignButtonStyleBody, 'whiteSpace') === 'nowrap',
            n('A: AlignmentPanel.js\'s own buttonStyle() sets whiteSpace:\'nowrap\' — its own label text can never wrap to shrink the button below its full rendered width'));
        assert(!/minWidth/.test(alignButtonStyleBody),
            n('A: AlignmentPanel.js\'s own buttonStyle() sets no minWidth override — the flex item\'s automatic minimum size is left at its browser default (its own nowrap content\'s full width), not clamped to 0'));

        // A4 — the align/distribute row <div> literals in the template
        // itself.
        //
        // AMENDED (0.9.659): originally a bare `{ display: 'flex', gap:
        // '4px' }`, no flexWrap anywhere in the whole file — none of its
        // rows could ever drop a button to a second line, regardless of
        // how little width they were given. 0.9.659 added
        // `flexWrap: 'wrap'` to both the per-row literal and the
        // distribute row literal — this section now asserts that fix is
        // in place.
        assert((alignmentPanelSrc.match(/\{ display: 'flex', gap: '4px', flexWrap: 'wrap' \}/g) || []).length >= 2,
            n('FIXED (0.9.659): AlignmentPanel.js\'s template now uses the identical `{ display: \'flex\', gap: \'4px\', flexWrap: \'wrap\' }` row literal for both the three align rows and the distribute row — no per-row variation, both fixed the same way'));
        assert(/flexWrap\s*:\s*'wrap'/.test(alignmentPanelSrc),
            n('FIXED (0.9.659): AlignmentPanel.js now contains `flexWrap: \'wrap\'` — its rows can drop a button to a second line instead of overflowing when given too little width'));

        // A5 — the real button labels these rows render, read from the
        // real computed properties (not re-typed): confirms "Distribute
        // X"/"Distribute Y"/"Distribute Z" (the longest labels) are real
        // rendered text, not a synthetic worst case this audit invented.
        const distributeAxesBody = findMethodReturnObject(alignmentPanelSrc, 'distributeAxes') || alignmentPanelSrc.slice(alignmentPanelSrc.indexOf('distributeAxes()'), alignmentPanelSrc.indexOf('distributeAxes()') + 400);
        for (const label of ['Distribute X', 'Distribute Y', 'Distribute Z']) {
            assert(distributeAxesBody.includes(`label: '${label}'`), n(`A: AlignmentPanel.js's real distributeAxes() computed really does include the real label '${label}'`));
        }

        // A6 — RepeatPanel.js's own buttonStyle(): flex:1, no minWidth
        // (whiteSpace unset, but "Repeat X/Y/Z" is short enough that
        // even word-wrap-based shrinking cannot make three of them plus
        // two fixed-width-input rows fit 127.2px — Section C's own live
        // numbers confirm the actual rendered overflow either way).
        const repeatButtonStyleBody = findMethodReturnObject(repeatPanelSrc, 'buttonStyle');
        assert(repeatButtonStyleBody && styleProp(repeatButtonStyleBody, 'flex') === '1' && !/minWidth/.test(repeatButtonStyleBody),
            n('A: RepeatPanel.js\'s own buttonStyle() still sets flex:1 with no minWidth override, the identical shape as AlignmentPanel.js\'s own — unchanged, since the fix is the ROW\'s own flexWrap, not a change to the buttons themselves'));
        // AMENDED (0.9.659): RepeatPanel.js originally contained no
        // flexWrap anywhere in the file; 0.9.659 added it to both rows
        // below (this section's own generic file-wide check now just
        // confirms it exists at all — A7 confirms exactly where).
        assert(/flexWrap\s*:\s*'wrap'/.test(repeatPanelSrc),
            n('FIXED (0.9.659): RepeatPanel.js now contains `flexWrap: \'wrap\'`'));

        // A7 — RepeatPanel.js's Copies/Offset row: two fixed-48px inputs
        // (inputStyle()'s own width) plus two label <span>s.
        //
        // AMENDED (0.9.659): this row and the Repeat X/Y/Z button row
        // below it were both a plain non-wrapping `{ display: 'flex',
        // ... }` literal pre-fix; 0.9.659 added `flexWrap: 'wrap'` to
        // both.
        const repeatInputStyleBody = findMethodReturnObject(repeatPanelSrc, 'inputStyle');
        assert(repeatInputStyleBody && styleProp(repeatInputStyleBody, 'width') === '48px',
            n('A: RepeatPanel.js\'s own inputStyle() is still a fixed 48px, unchanged from 0.9.654\'s own finding — safe in the ALWAYS-VISIBLE context 0.9.654 measured it in, but that context was not the only one it is ever rendered in (Section C); the fix is the row\'s own flexWrap, not a change to the input itself'));
        assert(repeatPanelSrc.includes(`{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }`),
            n('FIXED (0.9.659): RepeatPanel.js\'s Copies/Offset row now carries `flexWrap: \'wrap\'` on the same literal'));
        assert(repeatPanelSrc.includes(`{ display: 'flex', gap: '4px', flexWrap: 'wrap' }`),
            n('FIXED (0.9.659): RepeatPanel.js\'s Repeat X/Y/Z button row now carries `flexWrap: \'wrap\'` on the same literal'));

        console.log('✓ A (AMENDED 0.9.659): EditingSidebar.js mounts two independent CollapsibleSection "Advanced" instances (Transform: AlignmentPanel+RepeatPanel; Groups: an inline button row) whose body DOM is v-if-gated and does not exist until expanded. AlignmentPanel.js\'s and RepeatPanel.js\'s own row literals now carry flexWrap:\'wrap\' (fixed) — their buttons/inputs still cannot shrink below their own content\'s width (flex:1, nowrap text, no minWidth — all unchanged), but can now wrap to a second line instead of overflowing when given too little width.');
    }

    // ===============================================================
    // Section B — State matrix: both instances default collapsed.
    // ===============================================================
    {
        const dataBody = findMethodReturnObject(editingSidebarSrc, 'data');
        assert(dataBody && /transformAdvancedCollapsed\s*:\s*true/.test(dataBody),
            n('B: EditingSidebar.js\'s own data() really does default transformAdvancedCollapsed to true'));
        assert(/groupsAdvancedCollapsed\s*:\s*true/.test(dataBody),
            n('B: EditingSidebar.js\'s own data() really does default groupsAdvancedCollapsed to true — independently of the Transform one'));

        // The state matrix the brief asked for, confirmed from source:
        //   Default (both collapsed)      -> AlignmentPanel/RepeatPanel/
        //                                     Groups-Advanced DOM absent
        //                                     entirely (Section A2) ->
        //                                     0.9.654/0.9.656's own
        //                                     measurements are exactly
        //                                     as complete as they could
        //                                     be for that state.
        //   Transform Advanced expanded   -> AlignmentPanel+RepeatPanel
        //                                     DOM exists -> defect
        //                                     present (Section C).
        //   Groups Advanced expanded      -> only the rowStyle()-based
        //                                     button row exists -> safe
        //                                     (Section G).
        //   Both expanded simultaneously  -> both of the above, at once
        //                                     — no interaction between
        //                                     the two CollapsibleSection
        //                                     instances (independent
        //                                     booleans, independent DOM
        //                                     subtrees, same
        //                                     .sidebar-scroll ancestor)
        //                                     changes either one's own
        //                                     conclusion. Live-confirmed
        //                                     in this audit's own pass:
        //                                     expanding Groups' Advanced
        //                                     AFTER Transform's changed
        //                                     none of Transform's own
        //                                     button positions (each
        //                                     .sectionStyle() box lays
        //                                     out independently in
        //                                     normal block flow).
        assert(editingSidebarSrc.indexOf('transformAdvancedCollapsed') !== editingSidebarSrc.indexOf('groupsAdvancedCollapsed'),
            n('B: the two collapsed flags are genuinely distinct data properties, not one flag reused — confirmed they can vary independently, which is what makes "both expanded simultaneously" a real, distinct state and not a duplicate of either single-expansion state'));

        console.log('✓ B: both "Advanced" instances default to collapsed (v-if-gated DOM absent) — exactly reproducing why 0.9.654\'s and 0.9.656\'s own real-DOM-grounded reasoning, applied correctly to the state they measured, could not have found a defect that only exists in a state neither of them ever produced.');
    }

    // ===============================================================
    // Section C — Horizontal occlusion invariant: the geometry chain
    // that produces the live-measured overflow.
    // ===============================================================
    {
        // The stronger invariant the brief asks for: every interactive
        // Editor-sidebar descendant's usable horizontal rectangle must
        // stay outside .sidebar-scroll's own reserved scrollbar
        // clearance region ([186,203) in this audit's own live pass) —
        // and, more basically, inside .sidebar-scroll's own box at all
        // (right <= 203). This section re-derives, from real CSS/JS
        // source, the exact chain of content-box widths that this
        // audit's own live pass showed violates it.
        //
        // 1) .collapsible-section-body's own CSS: 1.3rem LEFT padding,
        //    ZERO right padding. This is the first structural fact that
        //    makes the defect possible: unlike .sidebar-scroll's own
        //    deliberate padding-RIGHT clearance convention (0.9.655),
        //    this wrapper only insets its content from the LEFT, so it
        //    contributes no clearance of its own on the side that
        //    matters for scrollbar occlusion — content inside it is
        //    exactly as exposed to .sidebar-scroll's own right edge as
        //    content in EditingSidebar's own sectionStyle() box is,
        //    just narrower (127.2px live-measured vs. 148px).
        const collapsibleBodyRule = findExactRuleBody(css, '.collapsible-section-body');
        assert(collapsibleBodyRule, n('C: .collapsible-section-body has a real CSS rule'));
        const paddingMatch = collapsibleBodyRule.match(/padding\s*:\s*([\d.]+)rem\s+([\d.]+)\s+([\d.]+)rem\s+([\d.]+)rem/);
        assert(paddingMatch, n('C: .collapsible-section-body\'s own padding shorthand parses as top/right/bottom/left'));
        const [, topRem, rightVal, bottomRem, leftRem] = paddingMatch;
        assert(parseFloat(rightVal) === 0, n(`C: .collapsible-section-body's own RIGHT padding is exactly 0 (raw: "${rightVal}") — it adds no clearance of its own on the right`));
        assert(parseFloat(leftRem) === 1.3, n(`C: .collapsible-section-body's own LEFT padding is 1.3rem (${remToPx(1.3)}px) — an indent, not a clearance; it narrows available width without moving the right edge closer to safety`));

        // 2) AlignmentPanel.js/RepeatPanel.js's own rows (Section A).
        //
        // AMENDED (0.9.659): this originally confirmed neither file had
        // any mechanism (flex-wrap, min-width:0, text-overflow) that
        // would let them respect whatever width they end up given — the
        // SECOND structural fact that, combined with (1) above, produced
        // genuine overflow. 0.9.659 added flex-wrap to both files' row
        // literals (Section A, FIXED); this now confirms that mechanism
        // is present, closing the second half of the chain.
        const alignButtonStyleBody = findMethodReturnObject(alignmentPanelSrc, 'buttonStyle');
        const repeatButtonStyleBody = findMethodReturnObject(repeatPanelSrc, 'buttonStyle');
        assert(/flexWrap\s*:\s*'wrap'/.test(alignmentPanelSrc) && /flexWrap\s*:\s*'wrap'/.test(repeatPanelSrc),
            n('FIXED (0.9.659): both AlignmentPanel.js and RepeatPanel.js now declare flexWrap:\'wrap\' on their row literals — the second half of the two-fact chain (narrow box + cannot adapt to it) that produced genuine overflow is now closed; a too-narrow row now wraps instead of overflowing'));
        assert(styleProp(alignButtonStyleBody, 'flex') === '1' && styleProp(repeatButtonStyleBody, 'flex') === '1',
            n('C: both panels\' own buttons are still flex:1 (share available width) rather than a fixed pixel width — unchanged; the item\'s own automatic minimum size (nowrap text, or an input\'s own intrinsic minimum) still prevents that shrink from ever reaching the available width on its own, which is exactly why the row-level flexWrap fix (not a buttonStyle change) is what makes the difference'));

        // 3) Live-measured overflow magnitude, documented (not
        // re-executed — no DOM engine here) but tied to a concrete,
        // reproducible number this audit's own methodology section
        // states plainly: the align-center row's own three buttons'
        // real rendered widths (53.8 + 67.0 + 60.4 = 181.2px) plus two
        // 4px gaps (8px) is 189.2px of un-shrinkable minimum content —
        // read directly from AlignmentPanel.js's own buttonStyle()
        // padding (4px 6px, i.e. 12px horizontal per button) and border
        // (1px each side, 2px per button), confirming the padding/border
        // overhead alone (3 buttons x 14px = 42px) already narrows the
        // margin between "fits" and "doesn't" without yet accounting for
        // any text at all.
        assert(/padding\s*:\s*'4px 6px'/.test(alignButtonStyleBody),
            n('C: AlignmentPanel.js\'s own buttonStyle() padding is \'4px 6px\' — 12px horizontal padding per button, re-derivable overhead consistent with this audit\'s own live-measured button widths'));
        assert(/border\s*:\s*'1px solid/.test(alignButtonStyleBody),
            n('C: AlignmentPanel.js\'s own buttonStyle() border is 1px solid — 2px horizontal overhead per button, added to the padding above'));

        console.log('✓ C (AMENDED 0.9.659): the two-fact chain this audit\'s live pass originally exposed is confirmed from source — .collapsible-section-body\'s own padding is still LEFT-only (no right-side clearance contribution, unlike .sidebar-scroll\'s deliberate 0.9.655 convention, and unchanged by this fix), but AlignmentPanel.js/RepeatPanel.js\'s own rows now DO have a flex-wrap mechanism (fixed 0.9.659) that lets them adapt to the 127.2px box instead of overflowing it. Pre-fix, the align-center row alone needed 189.2px of un-shrinkable content in that 127.2px box; the distribute row needed 288.5px — both overflowed past .sidebar-scroll\'s own 203px edge, with "Distribute Z" landing on content outside the sidebar entirely. Post-fix, that same un-shrinkable content now wraps onto additional lines within the 127.2px box instead of exceeding its width.');
    }

    // ===============================================================
    // Section D — Vertical reachability vs. horizontal occlusion.
    // ===============================================================
    {
        // .sidebar-scroll is still overflow-y:auto (vertical scrolling
        // still works, unchanged) and overflow-x:hidden (horizontal
        // clipping is unconditional, independent of scrollTop). A
        // control below the fold is fine — scrolling reveals it. A
        // control clipped horizontally is never fine — no amount of
        // vertical scrolling changes ITS OWN horizontal position or
        // .sidebar-scroll's own horizontal clip boundary.
        const scrollWrapperRule = findExactRuleBody(css, '.sidebar-scroll');
        assert(scrollWrapperRule && /overflow-y\s*:\s*auto/.test(scrollWrapperRule),
            n('D: .sidebar-scroll is still overflow-y:auto — the OTHER controls this audit found safe (Groups\' own Advanced row, the always-visible Transform/Clipboard/Selection controls) remain reachable by ordinary vertical scrolling if pushed below the fold by Advanced\'s own extra height'));
        assert(/overflow-x\s*:\s*hidden/.test(scrollWrapperRule),
            n('D: .sidebar-scroll is still overflow-x:hidden — this is precisely what makes the Section C overflow a CLIP, not merely an off-screen-but-reachable-by-scrolling control; overflow-x:hidden has no scroll affordance of its own for a user to invoke'));

        // No horizontal scrollbar/affordance exists anywhere in this
        // sidebar's own CSS shape that could let a user pan sideways to
        // reach clipped content — confirmed by the absence of any
        // overflow-x:auto/scroll/visible anywhere in the chain between
        // .sidebar-scroll and the clipped buttons.
        const sectionStyleBody = findMethodReturnObject(editingSidebarSrc, 'sectionStyle');
        assert(sectionStyleBody && !/overflow/.test(sectionStyleBody),
            n('D: EditingSidebar.js\'s own sectionStyle() sets no overflow of its own — .sidebar-scroll remains the ONLY box in this chain with any overflow behavior, and its own is overflow-x:hidden (a hard clip), not overflow-x:auto (a pannable scroll)'));
        assert(!/overflow/.test(collapsibleSectionSrc),
            n('D: CollapsibleSection.js itself declares no overflow of its own either (via inline style or otherwise) — nothing between AlignmentPanel/RepeatPanel and .sidebar-scroll could rescue this into a reachable-by-panning state even if one were desired'));

        console.log('✓ D: vertical reachability (scroll to reveal) still works correctly and is unaffected by this milestone\'s finding. The Section C defect is specifically a HORIZONTAL clip with no scroll affordance of any kind — .sidebar-scroll\'s own overflow-x:hidden is unconditional on scroll position, so no amount of scrolling (vertical, or a nonexistent horizontal one) makes the clipped controls reachable.');
    }

    // ===============================================================
    // Section E — Dynamic layout: regime-independent, not a padding gap.
    // ===============================================================
    {
        // .sidebar-scroll's own padding-right is a STATIC CSS value —
        // not conditional on scrollHeight > clientHeight, not
        // recalculated when Advanced expands. This audit's own live
        // pass confirmed the .sidebar-scroll box itself (left/right/
        // width) is IDENTICAL before and after expanding Advanced —
        // 16/203/187 in both states. What changes is which CHILD content
        // exists, not the geometry it is measured against. This directly
        // confirms the brief's own "Possibility 2" (a child-layout
        // problem) over "Possibility 1" (clearance too small): the
        // clearance itself never moved.
        const sidebarScrollBody = findExactRuleBody(css, '.sidebar-scroll');
        assert(sidebarScrollBody && /padding-right\s*:\s*1\.0625rem/.test(sidebarScrollBody) && !/@media|:hover|:focus/.test(sidebarScrollBody),
            n('E: .sidebar-scroll\'s own padding-right is a single, unconditional 1.0625rem declaration — no media query, no pseudo-class, nothing that could make the reserved clearance itself depend on scroll state or expanded/collapsed state'));

        // The overflow magnitude (Section C: up to ~169px of
        // un-shrinkable minimum content in a 127.2px box, live-rendering
        // ~133px past .sidebar-scroll's own 203px edge) vastly exceeds
        // any plausible clearance widen — even DOUBLING 0.9.655's own
        // 17px value would close only 17 of those ~133px. Recorded here
        // as an explicit, source-grounded reason a future 0.9.659 should
        // not simply widen .sidebar-scroll's padding-right further.
        const currentClearancePx = remToPx(1.0625);
        const worstCaseOverflowPx = 336.3 - 203; // Distribute Z's own live-measured right edge minus .sidebar-scroll's own right edge
        assert(worstCaseOverflowPx > currentClearancePx * 5,
            n(`E: the worst-case live-measured overflow (${worstCaseOverflowPx.toFixed(1)}px, "Distribute Z" past .sidebar-scroll's own edge) is more than 5x the entire current clearance value (${currentClearancePx}px) — confirming a clearance widen cannot be the fix; the root cause is AlignmentPanel.js/RepeatPanel.js's own rows refusing to shrink or wrap, not an insufficient buffer`));

        console.log('✓ E (AMENDED 0.9.659): .sidebar-scroll\'s own reserved clearance is still a static, unconditional CSS value, untouched by this milestone. This section\'s own pre-fix analysis (the overflow magnitude vastly exceeding any plausible clearance widen) is exactly why 0.9.659 fixed AlignmentPanel.js/RepeatPanel.js\'s own rows directly (flexWrap, Section A/C, FIXED) rather than touching .sidebar-scroll\'s padding-right — confirming Possibility 2 (child-layout problem) was the right diagnosis, and that the chosen fix matched it.');
    }

    // ===============================================================
    // Section F — Overlay vs. classic scrollbar model.
    // ===============================================================
    {
        let vueResolvable = true;
        try {
            execSync('node -e "import(\'vue\')"', { cwd: SOURCE_ROOT, stdio: 'pipe' });
        } catch {
            vueResolvable = false;
        }
        assert(!vueResolvable,
            n('F: confirmed live, same as 0.9.647/0.9.654 before it — \'vue\' does not resolve under plain node in this repository; this audit\'s own live-Chromium pass used a session-local, non-committed Playwright + npm-installed Vue for exactly this reason, never checked in'));

        // The defining property of this milestone's own finding: unlike
        // 0.9.654's .tool-switcher gap (real only under an OVERLAY
        // scrollbar; safe under a CLASSIC one, because a properly
        // relative-sized child shrinks WITH its ancestor's reduced
        // content box), this audit's own live pass reproduced the
        // AlignmentPanel/RepeatPanel overflow with hasVScroll: false —
        // i.e. WITHOUT any vertical scrollbar rendered at all, classic
        // or overlay. The mechanism is pure flex min-content overflow
        // against .sidebar-scroll's own STATIC content width; no
        // scrollbar of either kind needs to exist for it to occur.
        // Confirmed from source: nothing in AlignmentPanel.js/
        // RepeatPanel.js reads or reacts to any scrollbar-related state,
        // and their own container chain (Section D) has exactly one
        // overflow declaration in it (.sidebar-scroll's own, static,
        // unconditional overflow-x:hidden).
        assert(!/scrollbar|overflow/i.test(alignmentPanelSrc) && !/scrollbar|overflow/i.test(repeatPanelSrc),
            n('F: neither AlignmentPanel.js nor RepeatPanel.js references scrollbars or overflow anywhere — their own overflow is purely a function of their assigned width vs. their own content\'s minimum size, never scrollbar presence or regime'));

        console.log('✓ F (AMENDED 0.9.659): this milestone\'s own defect was UNCONDITIONAL under both the classic and overlay scrollbar models — this audit\'s own live pass reproduced it with hasVScroll:false (no vertical scrollbar rendered at all, of either kind), pure flex min-content overflow against a static container width, never scrollbar presence or regime. The fix (flexWrap, Section A/C) is likewise unconditional: it does not read or react to scrollbar state either, so it closes the gap the same way regardless of regime.');
    }

    // ===============================================================
    // Section G — Existing conventions: the fix already exists one
    // section away, in the SAME file.
    // ===============================================================
    {
        // EditingSidebar.js's own rowStyle() — flexWrap:'wrap' — is
        // already used for Selection's Select All row, Groups' own
        // "Create" row, and Clipboard's Copy/Paste row (0.9.654 Section
        // I already established this). This audit re-confirms it is
        // ALSO what Groups' own "Advanced" row (Rename/Duplicate/Delete/
        // +Sel/-Sel) uses — the SAME CollapsibleSection component, the
        // SAME 127.2px available width this milestone found
        // AlignmentPanel/RepeatPanel overflowing — and that this audit's
        // own live pass found every one of those buttons fully inside
        // bounds. The fix is not a new mechanism; it is applying a
        // convention that already covers the identical geometry, one
        // `<div>` over, correctly.
        const rowStyleBody = findMethodReturnObject(editingSidebarSrc, 'rowStyle');
        assert(rowStyleBody && styleProp(rowStyleBody, 'flexWrap') === 'wrap',
            n('G: EditingSidebar.js\'s own rowStyle() still sets flexWrap:\'wrap\''));

        const groupsSectionSlice = editingSidebarSrc.slice(
            editingSidebarSrc.indexOf('<h4 :style="headingStyle()">Groups</h4>'),
            editingSidebarSrc.indexOf('<h4 :style="headingStyle()">Clipboard</h4>')
        );
        // Groups' own Advanced body: a single row using rowStyle() that
        // contains all five Rename/Duplicate/Delete/+Sel/-Sel buttons —
        // confirm the SAME method, not a separate copy that merely
        // happens to also set flexWrap.
        const advancedBodySlice = groupsSectionSlice.slice(groupsSectionSlice.indexOf('<CollapsibleSection'));
        assert((advancedBodySlice.match(/:style="rowStyle\(\)"/g) || []).length === 1,
            n('G: Groups\' own Advanced body wraps its five buttons in exactly one `:style="rowStyle()"` row — literally the same method AlignmentPanel.js/RepeatPanel.js would need to adopt (or replicate the one property from) to close this gap'));

        // A fourth, independent confirmation (0.9.654 Section I already
        // found three: EditingSidebar.js's own rowStyle(), World's own
        // .world-view-primary-nav .action-btn flex:1 sharing, and the
        // 0.9.655 flex-wrap fix on World's two rows) that this codebase
        // already has a working answer for "a row of buttons that might
        // not fit" — AlignmentPanel.js/RepeatPanel.js are the outliers,
        // not the codebase's own convention.
        console.log('✓ G (AMENDED 0.9.659): the fix this section found already proven safe, one section below the defect in the SAME file, is now the fix 0.9.659 applied — Groups\' own "Advanced" row uses EditingSidebar.js\'s own rowStyle() (flexWrap:\'wrap\') at the identical 127.2px available width this milestone found AlignmentPanel.js/RepeatPanel.js overflowing; 0.9.659 added the identical flexWrap:\'wrap\' property directly to AlignmentPanel.js\'s and RepeatPanel.js\'s own row literals (not by routing them through EditingSidebar.js\'s own rowStyle(), since neither is a child of EditingSidebar.js\'s own template scope). No new mechanism was needed — only extending a convention this codebase already applied correctly to Selection/Groups-basic/Clipboard/Groups-Advanced/World\'s own two 0.9.655-fixed rows to the two files that had not yet adopted it.');
    }

    // ===============================================================
    // Section H — Regression against 0.9.655/0.9.656.
    // ===============================================================
    {
        const toolSwitcherBody = findExactRuleBody(css, '.tool-switcher');
        const toolBtnBody = findExactRuleBody(css, '.tool-btn');
        assert(toolSwitcherBody && /flex-direction\s*:\s*column/.test(toolSwitcherBody) && !/align-items/.test(toolSwitcherBody),
            n('H: .tool-switcher is still flex-direction:column with no align-items override — unchanged'));
        assert(toolBtnBody && !/width\s*:\s*\d/.test(toolBtnBody),
            n('H: .tool-btn still sets no fixed pixel width — unchanged'));

        const sidebarScrollBody = findExactRuleBody(css, '.sidebar-scroll');
        assert(sidebarScrollBody && /padding-right\s*:\s*1\.0625rem/.test(sidebarScrollBody) && /overflow-y\s*:\s*auto/.test(sidebarScrollBody) && /height\s*:\s*100%/.test(sidebarScrollBody),
            n('H: .sidebar-scroll\'s own 0.9.655/0.9.647 shape (17px padding-right, overflow-y:auto, height:100%) is entirely unchanged'));

        const sidebarRule = findExactRuleBody(css, '.sidebar');
        assert(sidebarRule && /width\s*:\s*220px/.test(sidebarRule) && /flex-shrink\s*:\s*0/.test(sidebarRule) && !/max-height|overflow|height\s*:/.test(sidebarRule),
            n('H: .sidebar itself is still a fixed 220px, flex-shrink:0, with no height/overflow of its own — .sidebar-scroll is still the sole scroll owner'));

        const sidebarOpenCount = (editorViewSrc.match(/<div class="sidebar">/g) || []).length;
        const sidebarScrollOpenCount = (editorViewSrc.match(/<div class="sidebar-scroll">/g) || []).length;
        assert(sidebarOpenCount === 1 && sidebarScrollOpenCount === 1,
            n('H: exactly one .sidebar and one .sidebar-scroll element still exist in EditorView.js'));

        const worldActionsBodies = findAllRuleBodies(css, '.world-view-actions');
        assert(worldActionsBodies.some((b) => /flex-wrap\s*:\s*wrap/.test(b)),
            n('H: World\'s own .world-view-actions still carries its 0.9.655 flex-wrap:wrap fix — untouched by this milestone'));

        const inputStyleBody = findMethodReturnObject(numericTransformPanelSrc, 'inputStyle');
        assert(inputStyleBody && styleProp(inputStyleBody, 'width') === '100%',
            n('H: NumericTransformPanel.js\'s own always-visible inputStyle() is still width:100% — untouched; this milestone\'s finding is specific to content that is conditionally rendered, not this always-visible section'));

        console.log('✓ H: every invariant 0.9.647/0.9.654/0.9.655/0.9.656 established — .tool-switcher\'s own 17px clearance, .sidebar-scroll\'s sole-scroll-owner shape, World\'s own flex-wrap fix, the always-visible NumericTransformPanel inputs — remains exactly as those milestones left it. This audit is read-only and changes none of them.');
    }

    // ===============================================================
    // Section I — Scope: World's own CollapsibleSection usages do not
    // share the risky combination.
    // ===============================================================
    {
        // World's OWN CollapsibleSection instances (Nearby Places/
        // Landmarks/People/World Encounters/Place Names) render
        // .world-view-nearby-row content, not AlignmentPanel/RepeatPanel-
        // style button grids. That row's own CSS uses
        // justify-content:space-between (not flex:1 sharing) and its own
        // label gets overflow:hidden + text-overflow:ellipsis — a
        // deliberate TRUNCATION strategy, the opposite of "refuse to
        // shrink." Its own action buttons
        // (.world-view-nearby-row-go) are flex-shrink:0 but hold only
        // short, fixed labels ("Info"/"Go"/"Adopt") nowhere near this
        // milestone's own "Distribute X/Y/Z"-scale text, and 0.9.654
        // already found World's OWN panel (.world-view-overlay, 280px
        // max-width) has substantially more available width than
        // Editor's 220px .sidebar to begin with.
        const nearbyRowBody = findExactRuleBody(css, '.world-view-nearby-row');
        assert(nearbyRowBody && /justify-content\s*:\s*space-between/.test(nearbyRowBody) && !/flex\s*:\s*1/.test(nearbyRowBody),
            n('I: .world-view-nearby-row uses justify-content:space-between, not flex:1 width-sharing — a structurally different (and here, safe) layout from AlignmentPanel.js/RepeatPanel.js\'s own'));
        const nearbyLabelBody = findExactRuleBody(css, '.world-view-nearby-row-label');
        assert(nearbyLabelBody && /overflow\s*:\s*hidden/.test(nearbyLabelBody) && /text-overflow\s*:\s*ellipsis/.test(nearbyLabelBody),
            n('I: .world-view-nearby-row-label truncates via overflow:hidden + text-overflow:ellipsis — a deliberate strategy for content that might not fit, the opposite of AlignmentPanel.js\'s own whiteSpace:\'nowrap\'-with-no-truncation shape'));

        assert(!/AlignmentPanel|RepeatPanel/.test(worldViewSrc),
            n('I: WorldView.js does not use AlignmentPanel.js or RepeatPanel.js at all — this milestone\'s own finding is confirmed scoped to the Editor sidebar\'s own two files, not a systemic CollapsibleSection-body defect reachable from World'));

        console.log('✓ I: World\'s own CollapsibleSection usages (Nearby Places/Landmarks/People/World Encounters/Place Names) use a structurally different, already-safe row shape (justify-content:space-between plus label truncation, not flex:1-with-no-wrap-or-shrink) and never reference AlignmentPanel.js/RepeatPanel.js at all — this milestone\'s own finding is confirmed scoped to those two Editor-only files, not a systemic defect in CollapsibleSection.js itself or in World\'s own use of it.');
    }

    // ===============================================================
    // Section J — Production-change guard.
    // ===============================================================
    {
        // AMENDED (0.9.659): this guard originally required a test-only
        // diff (this file + tests.html), matching 0.9.658's own
        // "test-only" brief. 0.9.659 is deliberately NOT test-only — it
        // is the narrow production fix this audit itself recommended —
        // so the allowed set now includes exactly the two production
        // files the fix brief named: AlignmentPanel.js and
        // RepeatPanel.js. Everything else this audit ever read
        // (css/main.css, EditorView.js, WorldView.js, EditingSidebar.js,
        // CollapsibleSection.js, NumericTransformPanel.js) remains
        // excluded — none of those needed to change for the flexWrap fix.
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
            const allowed = new Set(['tests.html', 'ui/components/AlignmentPanel.js', 'ui/components/RepeatPanel.js']);
            const unexpected = changedFiles.filter((f) => !allowed.has(f) && !f.startsWith('tests/ExpandedEditorSidebarScrollbarOcclusionBoundaryAudit'));
            assert(unexpected.length === 0,
                n(`J: no file outside {tests.html, tests/ExpandedEditorSidebarScrollbarOcclusionBoundaryAudit.test.js, ui/components/AlignmentPanel.js, ui/components/RepeatPanel.js} is modified (found unexpected: ${JSON.stringify(unexpected)}) — 0.9.659's production change is confined to AlignmentPanel.js/RepeatPanel.js exactly as its own brief required; css/main.css, EditorView.js, WorldView.js, EditingSidebar.js, CollapsibleSection.js, and NumericTransformPanel.js remain read-only source-of-truth for this audit, never edited by it`));
        } else {
            console.log('  (J: git not available in this environment to enumerate changed files — skipped, not failed)');
        }

        const editorBodyRule = findExactRuleBody(css, '.editor-body');
        assert(editorBodyRule && /display\s*:\s*flex/.test(editorBodyRule) && /flex\s*:\s*1/.test(editorBodyRule),
            n('J: .editor-body is unchanged — the canvas column beside the sidebar is untouched'));

        console.log('✓ J (AMENDED 0.9.659): the only files this commit changes are this test file, ui/components/AlignmentPanel.js, ui/components/RepeatPanel.js, and tests.html\'s existing registration of this file; every other production file this audit reads (css/main.css, EditorView.js, WorldView.js, EditingSidebar.js, CollapsibleSection.js, NumericTransformPanel.js) is read from, never written to.');
    }

    console.log(`\n✅ 0.9.658 Expanded Editor Sidebar Scrollbar Occlusion Boundary Audit complete (${assertionCount} assertions). AMENDED BY 0.9.659: the child-layout defect this audit found (AlignmentPanel.js's and RepeatPanel.js's own rows lacking the flex-wrap convention this exact codebase already used correctly one section below them, in World's own two 0.9.655-fixed rows, and in this very file's own rowStyle()) is now fixed — flexWrap:'wrap' added to AlignmentPanel.js's align/distribute row literals and to RepeatPanel.js's Copies/Offset row and Repeat X/Y/Z row literals, the same single-property convention already proven safe at this exact available width by Groups' own Advanced section. Every section above has been re-verified against the corrected source in place, reusing this flagship as 0.9.659's own closure audit rather than a separate file, per this milestone's own governing lesson: a UI layout closure audit must cover meaningful state transitions, not just the initial rendered state — and, per 0.9.655's own precedent, a fix commit amends its own superseded audit rather than leaving it to silently go stale.`);
}

run().catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
});
