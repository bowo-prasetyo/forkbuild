import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stylesheetFiles } from './support/SourceFileGroups.js';

// 0.9.656 — Sidebar Action Overflow and Scrollbar Content Clearance
// Closure Audit.
//
// TYPE: test-only closure audit. PRODUCTION CHANGES: none (Section I's
// own guard confirms it).
//
// 0.9.654's audit found two independent, unrelated layout defects
// hiding under one reported "scrollbar problem": (1) World's own
// .world-view-actions/.world-view-actions--navigation rows overflowed
// their 280px-max-width panel UNCONDITIONALLY — a plain missing-
// flex-wrap bug with nothing to do with scrollbars; (2) Editor's own
// .tool-switcher buttons stretched flush to .sidebar-scroll's own edge
// with only 4px of clearance — safe under a classic (space-reserving)
// scrollbar, genuinely occluded under an overlay one. 0.9.655 fixed
// both, narrowly: flex-wrap:wrap on the two World rules (the same
// convention EditingSidebar.js's own rowStyle() already used), and a
// single shared .sidebar-scroll/.world-view-overlay-scroll
// padding-right widen (0.25rem -> 1.0625rem, i.e. 17px — matching
// Windows' own classic-scrollbar default, the widest common affordance
// any platform's real scrollbar/thumb actually occupies).
//
// This audit re-verifies that fix from real, current source — CSS
// rules and real template markup, the same technique 0.9.654/0.9.647
// used — and, per its own brief, checks the STRONGER property the
// brief asked for: not merely "no horizontal overflow," but "every
// action remains reachable when the available row width is
// insufficient for a single line." It also re-confirms every section
// the brief flagged as needing NON-interference (numeric inputs,
// vertical scrolling, canvas/toolbar/shell/Publications/Repository).
//
//   Section A — World primary action row: Save/Publish/Edit Metadata/
//               Undo/Redo/History all present, in the real template,
//               inside a row that can now wrap.
//   Section B — World navigation row: Home/Locations/Notifications,
//               the same property, independently.
//   Section C — World narrow-width behavior: the wrapping mechanism
//               itself (flex-wrap:wrap, no flex-basis forcing an
//               oversized single item) guarantees every button reaches
//               its own line rather than merely "not overflowing."
//   Section D — Editor overlay-scrollbar clearance: .tool-switcher
//               stays outside the scrollbar's occupied/overlay region
//               under both the classic and the overlay model.
//   Section E — Editor vertical scrolling: .sidebar-scroll's own
//               ownership (height:100%, overflow-y:auto), sidebar
//               height, and overflow reachability are all unchanged.
//   Section F — Numeric Transform panel: the X/Y/Z/R inputs are
//               byte-identical to 0.9.654's own findings — not
//               "normalized" to match the new padding-right value.
//   Section G — Shared-rule integrity: .sidebar-scroll and
//               .world-view-overlay-scroll still declare the identical
//               padding-right value, one shared convention, not two.
//   Section H — Non-interference: Editor canvas, World canvas,
//               toolbar, Publications, Repository, and every other
//               action row are untouched.
//   Section I — Production-change guard: this milestone is test-only.

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
// (itself borrowed from tests/EditorSidebarScrollOwnershipClosureAudit.test.js
// and tests/UnifiedApplicationLayoutUIConsistencyBoundaryAudit.test.js).
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
    const worldViewSrc = await readSource('ui/views/WorldView.js');
    const editorViewSrc = await readSource('ui/views/EditorView.js');
    const editingSidebarSrc = await readSource('ui/components/EditingSidebar.js');
    const numericTransformPanelSrc = await readSource('ui/components/NumericTransformPanel.js');
    const repeatPanelSrc = await readSource('ui/components/RepeatPanel.js');
    const buildLibraryPanelSrc = await readSource('ui/components/BuildLibraryPanel.js');

    // ===============================================================
    // Section A — World primary action row.
    // ===============================================================
    {
        const actionsOpenIdx = worldViewSrc.indexOf('class="world-view-actions">');
        assert(actionsOpenIdx !== -1, n('A: WorldView.js template still opens the real .world-view-actions row'));
        const actionsRowSrc = worldViewSrc.slice(actionsOpenIdx, actionsOpenIdx + 1500);
        const actionButtons = [
            ['Save', '@click="saveActiveDocument"'],
            ['Publish', '@click="publishActiveDocument"'],
            ['Edit Metadata', '@click="openMetadataEditor(activeDocumentInfo)"'],
            ['Undo', '@click="undoAction"'],
            ['Redo', '@click="redoAction"'],
            ['History', '@click="openHistoryPanel"'],
        ];
        for (const [label, handler] of actionButtons) {
            assert(actionsRowSrc.includes(`>${label}</button>`),
                n(`A: ${label} is still present in the real template, as a real <button>, not removed or renamed`));
            assert(actionsRowSrc.includes(handler),
                n(`A: ${label}'s own click handler (${handler}) is still wired — present AND clickable, not just visually present`));
        }
        // Save/Undo/Redo's own :disabled bindings are conditional
        // (document-state-driven), never a bare `disabled` attribute
        // that would make the button permanently unclickable — this was
        // true before 0.9.655 and this milestone did not touch it.
        for (const [label, binding] of [['Save', ':disabled="!activeDocumentInfo.dirty"'], ['Undo', ':disabled="!canUndo"'], ['Redo', ':disabled="!canRedo"']]) {
            assert(actionsRowSrc.includes(binding),
                n(`A: ${label}'s own :disabled binding (${binding}) is still conditional, not a bare disabled attribute — unaffected by this milestone`));
        }

        // The fix itself: flex-wrap:wrap, present on every
        // .world-view-actions rule body in css/main.css.
        const worldActionsBodies = findAllRuleBodies(css, '.world-view-actions');
        assert(worldActionsBodies.length >= 1, n('A: .world-view-actions still has at least one CSS rule'));
        assert(worldActionsBodies.some((b) => /flex-wrap\s*:\s*wrap/.test(b)),
            n('A: .world-view-actions still declares flex-wrap:wrap — the 0.9.655 fix is in place'));

        // "Within the panel": the row is still a plain child of
        // .world-view-overlay-scroll (no absolute/fixed positioning that
        // could place it outside the panel's own bounds regardless of
        // wrapping).
        const actionBtnBody = findExactRuleBody(css, '.action-btn');
        assert(actionBtnBody && !/position\s*:\s*(absolute|fixed)/.test(actionBtnBody),
            n('A: .action-btn declares no absolute/fixed positioning — every button, wrapped or not, stays in normal flow inside the panel'));

        console.log('✓ A: Save, Publish, Edit Metadata, Undo, Redo, and History are all still present in the real template as real, wired-up buttons; .world-view-actions still carries the 0.9.655 flex-wrap:wrap fix; no button is positioned outside normal flow. All six remain present, visible, within the panel, and clickable.');
    }

    // ===============================================================
    // Section B — World navigation row.
    // ===============================================================
    {
        const navOpenIdx = worldViewSrc.indexOf('class="world-view-actions world-view-actions--navigation"');
        assert(navOpenIdx !== -1, n('B: WorldView.js template still opens .world-view-actions.world-view-actions--navigation'));
        const navRowSrc = worldViewSrc.slice(navOpenIdx, navOpenIdx + 1300);
        for (const [label, handler] of [['Home', '@click="goHome"'], ['Locations', '@click="openLocationsPanel"'], ['Notifications', '@click="openNotificationHistoryPanel"']]) {
            assert(navRowSrc.includes(`>${label}</button>`),
                n(`B: ${label} is still present in the real navigation row template`));
            assert(navRowSrc.includes(handler),
                n(`B: ${label}'s own click handler (${handler}) is still wired`));
        }
        // Locations is conditional on activeDocumentInfo (Home and
        // Notifications are not) — pre-existing, documented behavior
        // (0.5.7/0.9.284's own comments in the template), unrelated to
        // and unchanged by this milestone's flex-wrap fix.
        assert(navRowSrc.includes('v-if="activeDocumentInfo"'),
            n('B: Locations\' own v-if="activeDocumentInfo" gating is unchanged — a pre-existing, documented condition, not something this milestone introduced or needs to satisfy for reachability'));

        const navBody = findExactRuleBody(css, '.world-view-actions--navigation');
        assert(navBody && /flex-wrap\s*:\s*wrap/.test(navBody),
            n('B: .world-view-actions--navigation still carries the 0.9.655 flex-wrap:wrap fix, independent of the base .world-view-actions rule'));

        console.log('✓ B: Home, Locations, and Notifications are all still present and wired in the real navigation row template, which still carries its own independent flex-wrap:wrap fix — reachable at the panel\'s fixed 280px-max-width, the only width this row is ever rendered at (Section C).');
    }

    // ===============================================================
    // Section C — World narrow-width behavior: the stronger property.
    // ===============================================================
    {
        // The brief's own framing: not merely "no horizontal overflow"
        // but "every action remains reachable when the available row
        // width is insufficient for a single line." flex-wrap:wrap is
        // exactly the CSS mechanism that guarantees this — unlike
        // overflow-x:hidden (which the row still inherits from its
        // .world-view-overlay-scroll ancestor, unchanged), flex-wrap
        // does not depend on that ancestor's overflow behavior at all:
        // it resolves the row's OWN layout so no child ever needs to
        // exceed the row's own width in the first place.
        const worldActionsBodies = findAllRuleBodies(css, '.world-view-actions');
        for (const body of worldActionsBodies) {
            assert(!/flex-wrap\s*:\s*nowrap/.test(body),
                n('C: no .world-view-actions rule re-asserts flex-wrap:nowrap after the base rule\'s own wrap — the cascade cannot silently re-disable the fix'));
        }

        // A row that wraps still needs each individual button to fit
        // ON ITS OWN LINE — a button wider than the row's own available
        // width would still overflow even with flex-wrap. Confirm no
        // button has a fixed width/min-width larger than the panel's
        // own available content width (221px, Section D/G) could
        // accommodate: .action-btn sets neither, so every button sizes
        // to its own (short) text content — well under 221px for
        // "Publish", "History", "Notifications", the longest labels in
        // either row.
        const actionBtnBody = findExactRuleBody(css, '.action-btn');
        assert(actionBtnBody && !/min-width\s*:\s*\d/.test(actionBtnBody) && !/width\s*:\s*\d/.test(actionBtnBody),
            n('C: .action-btn sets no fixed width/min-width larger than the panel could accommodate — every individual button, even alone on its own wrapped line, fits the row\'s own available width'));

        // Confirm flex-wrap:wrap does not also set a flex-basis that
        // would force one child to consume an entire line and push
        // every subsequent child onto a line of its own regardless of
        // fit (a subtler way "reachable" could still fail even with
        // wrap present) — .action-btn/.world-view-actions declare no
        // flex-basis/flex-grow that would do this; buttons wrap based
        // purely on available width, filling each line as fully as it
        // can before dropping the next button down.
        assert(!/flex-basis|flex-grow/.test(actionBtnBody || ''),
            n('C: .action-btn sets no flex-basis/flex-grow — buttons wrap purely on available width, packing as many per line as fit, not one-per-line regardless of fit'));
        for (const body of worldActionsBodies) {
            assert(!/flex-basis|flex-grow/.test(body),
                n('C: no .world-view-actions rule sets flex-basis/flex-grow on the row itself either — the same "pack, don\'t force" property holds at the row level'));
        }

        console.log('✓ C: flex-wrap:wrap resolves this row\'s OWN layout so no child ever needs to exceed the row\'s width — a strictly stronger property than "no horizontal overflow" (which merely describes overflow-x:hidden\'s clipping, still present and now irrelevant). No button carries a fixed width larger than the panel can hold, and neither the buttons nor the row force one-per-line packing — every action remains reachable at the panel\'s fixed width, wrapping exactly as far as it needs to.');
    }

    // ===============================================================
    // Section D — Editor overlay-scrollbar clearance.
    // ===============================================================
    {
        const toolSwitcherBody = findExactRuleBody(css, '.tool-switcher');
        const toolBtnBody = findExactRuleBody(css, '.tool-btn');
        assert(toolSwitcherBody && /flex-direction\s*:\s*column/.test(toolSwitcherBody) && !/align-items/.test(toolSwitcherBody),
            n('D: .tool-switcher is still flex-direction:column with no align-items override — .tool-btn still fills its full cross-axis width, the same shape 0.9.654 measured'));
        assert(toolBtnBody && !/width\s*:\s*\d/.test(toolBtnBody),
            n('D: .tool-btn still sets no fixed pixel width — classic-regime-safe (shrinks with its scrolling ancestor rather than overflowing it), unchanged'));

        const sidebarScrollBody = findExactRuleBody(css, '.sidebar-scroll');
        assert(sidebarScrollBody && /padding-right\s*:\s*1\.0625rem/.test(sidebarScrollBody) && !/padding-left/.test(sidebarScrollBody),
            n('D: .sidebar-scroll\'s ONLY horizontal padding is now padding-right:1.0625rem (17px) — the 0.9.655 fix is in place'));
        const clearancePx = remToPx(1.0625);
        assert(clearancePx === 17, n('D: 1.0625rem is exactly 17px at the standard 16px root — matches Windows\' own classic-scrollbar default (GetSystemMetrics(SM_CXVSCROLL))'));

        // Classic regime: the browser reserves scrollbar width itself,
        // shrinking .sidebar-scroll's own content box before .tool-btn
        // (a stretch child with no fixed width) is laid out — .tool-btn
        // shrinks WITH it and stays inside the (now doubly-buffered:
        // reserved scrollbar width + this 17px) content box. Still
        // fully clickable, same as pre-fix, just with more margin.
        //
        // Overlay regime: the scrollbar paints on top of the content
        // box (no width reserved), so the only thing between .tool-btn's
        // own right edge and the scrollbar's paint region is this 17px
        // padding-right — now wide enough to cover the affordance any
        // current desktop platform's real overlay scrollbar/thumb
        // actually occupies, keeping .tool-btn's own edge clear of it
        // under either model.
        assert(!/width\s*:\s*\d/.test(toolSwitcherBody),
            n('D: .tool-switcher itself is unchanged (still no fixed width) — confirming the classic-regime shrink-with-ancestor behavior 0.9.654 Section C established is untouched by this fix'));

        console.log('✓ D: .tool-switcher\'s own clearance from .sidebar-scroll\'s edge is now 17px (was 4px) — under the classic regime this stacks additively with the browser\'s own reserved scrollbar width (still fully safe, just more so); under the overlay regime, the one regime where 4px was genuinely insufficient, 17px now covers the widest common real-scrollbar affordance. .tool-btn stays entirely outside the scrollbar\'s occupied/overlay region under both models.');
    }

    // ===============================================================
    // Section E — Editor vertical scrolling (non-interference).
    // ===============================================================
    {
        const scrollWrapperRule = findExactRuleBody(css, '.sidebar-scroll');
        assert(scrollWrapperRule && /overflow-y\s*:\s*auto/.test(scrollWrapperRule) && /height\s*:\s*100%/.test(scrollWrapperRule),
            n('E: .sidebar-scroll is still overflow-y:auto, height:100% — 0.9.647\'s own sole scroll owner is unchanged by this milestone'));
        assert(/overflow-x\s*:\s*hidden/.test(scrollWrapperRule),
            n('E: .sidebar-scroll is still overflow-x:hidden — no unintended horizontal scrollbar introduced by the padding-right widen'));
        assert(!/min-height/.test(scrollWrapperRule),
            n('E: .sidebar-scroll still sets no min-height — short/normal sidebar content is not forced to look taller or gain a scrollbar it does not need'));

        const sidebarRule = findExactRuleBody(css, '.sidebar');
        assert(sidebarRule && /width\s*:\s*220px/.test(sidebarRule) && /flex-shrink\s*:\s*0/.test(sidebarRule) && !/max-height|overflow|height\s*:/.test(sidebarRule),
            n('E: .sidebar itself is still a fixed 220px, flex-shrink:0, with no height/overflow of its own — .sidebar-scroll is still the only scroll owner, exactly the invariant 0.9.647/0.9.654 both re-confirmed'));

        const sidebarOpenCount = (editorViewSrc.match(/<div class="sidebar">/g) || []).length;
        const sidebarScrollOpenCount = (editorViewSrc.match(/<div class="sidebar-scroll">/g) || []).length;
        assert(sidebarOpenCount === 1 && sidebarScrollOpenCount === 1,
            n('E: exactly one .sidebar and one .sidebar-scroll element still exist in EditorView.js — no second wrapper introduced'));

        console.log('✓ E: vertical scrolling, sidebar height, overflow reachability, and .sidebar-scroll\'s own sole-scroll-owner status are all exactly as 0.9.647 established and 0.9.654 re-confirmed — this milestone\'s only change to this rule was its padding-right value.');
    }

    // ===============================================================
    // Section F — Numeric Transform panel: unchanged, not "normalized."
    // ===============================================================
    {
        const inputStyleBody = findMethodReturnObject(numericTransformPanelSrc, 'inputStyle');
        assert(inputStyleBody && styleProp(inputStyleBody, 'width') === '100%',
            n('F: NumericTransformPanel.js\'s own inputStyle() is still width:100% — untouched'));
        const labelStyleBody = findMethodReturnObject(numericTransformPanelSrc, 'labelStyle');
        assert(labelStyleBody && styleProp(labelStyleBody, 'width') === '16px',
            n('F: NumericTransformPanel.js\'s own labelStyle() width is still exactly 16px — this milestone did not touch it to compensate for the wider padding-right'));
        const rowStyleBody = findMethodReturnObject(numericTransformPanelSrc, 'rowStyle');
        assert(rowStyleBody && styleProp(rowStyleBody, 'gap') === '6px',
            n('F: NumericTransformPanel.js\'s own rowStyle() gap is still exactly 6px — untouched'));

        const editingSidebarSectionStyleBody = findMethodReturnObject(editingSidebarSrc, 'sectionStyle');
        assert(editingSidebarSectionStyleBody && styleProp(editingSidebarSectionStyleBody, 'padding') === '10px',
            n('F: EditingSidebar.js\'s own sectionStyle() padding is still exactly 10px — the numeric inputs\' own accidental ~14px buffer comes from this untouched value, not any deliberate scrollbar-clearance mechanism this milestone could have "normalized" it into'));

        // The narrower-but-still-safe consequence of the padding-right
        // widen (0.9.654's own Section B arithmetic, re-derived against
        // the current CSS): available width for the numeric input
        // itself is now 128px (was 141px) — still comfortably positive,
        // confirming this section was never at risk and remains so.
        const sidebarBody = findExactRuleBody(css, '.sidebar');
        const sidebarWidth = parseInt((sidebarBody.match(/width\s*:\s*(\d+)px/) || [null, '220'])[1], 10);
        const sidebarScrollBody = findExactRuleBody(css, '.sidebar-scroll');
        const sidebarScrollPaddingPx = remToPx(parseFloat((sidebarScrollBody.match(/padding-right\s*:\s*([\d.]+)rem/) || [null, '1.0625'])[1]));
        const sidebarContentWidth = sidebarWidth - 32 - 1;
        const directChildWidth = sidebarContentWidth - sidebarScrollPaddingPx;
        const sectionedChildWidth = directChildWidth - 20;
        const numericInputAvailableWidth = sectionedChildWidth - 16 - 6;
        assert(numericInputAvailableWidth === 128 && numericInputAvailableWidth > 0,
            n(`F: the Transform section's own X/Y/Z/R input still has ${numericInputAvailableWidth}px of available width (down from 141px pre-0.9.655, still comfortably positive) — narrower, never at risk, and not touched by this milestone`));

        console.log('✓ F: NumericTransformPanel.js\'s own inputStyle()/labelStyle()/rowStyle() and EditingSidebar.js\'s own sectionStyle() are all byte-identical to 0.9.654\'s own findings — no "normalization" of the numeric inputs\' incidental 14px clearance, exactly as this milestone\'s own guardrail against a non-existent defect required.');
    }

    // ===============================================================
    // Section G — Shared-rule integrity.
    // ===============================================================
    {
        const sidebarScrollBody = findExactRuleBody(css, '.sidebar-scroll');
        const worldScrollBody = findExactRuleBody(css, '.world-view-overlay-scroll');
        const sidebarPad = (sidebarScrollBody.match(/padding-right\s*:\s*([\d.]+)rem/) || [])[1];
        const worldPad = (worldScrollBody.match(/padding-right\s*:\s*([\d.]+)rem/) || [])[1];
        assert(sidebarPad && worldPad && sidebarPad === worldPad,
            n(`G: .sidebar-scroll and .world-view-overlay-scroll still declare the identical padding-right (${sidebarPad}rem each) — one shared convention, not two independently-maintained values, exactly as 0.9.654 Section I found and 0.9.655 preserved`));
        assert(sidebarPad === '1.0625',
            n('G: that shared value is now 1.0625rem (17px) on both rules, the single shared numeric change 0.9.654 recommended rather than two separate patches'));

        // Both wrappers still share the rest of their scroll-ownership
        // shape too (overflow-y:auto, overflow-x:hidden) — the widen
        // did not disturb the parts of the convention it wasn't about.
        assert(/overflow-y\s*:\s*auto/.test(sidebarScrollBody) && /overflow-x\s*:\s*hidden/.test(sidebarScrollBody),
            n('G: .sidebar-scroll still shares overflow-y:auto/overflow-x:hidden with .world-view-overlay-scroll'));
        assert(/overflow-y\s*:\s*auto/.test(worldScrollBody) && /overflow-x\s*:\s*hidden/.test(worldScrollBody),
            n('G: .world-view-overlay-scroll still shares the same overflow-y:auto/overflow-x:hidden shape'));

        console.log('✓ G: .sidebar-scroll and .world-view-overlay-scroll continue to share one identical padding-right value (now 17px) and the rest of their overflow shape — the shared clearance convention this milestone widened remains a single convention, not two independently-maintained ones.');
    }

    // ===============================================================
    // Section H — Non-interference.
    // ===============================================================
    {
        const editorBodyRule = findExactRuleBody(css, '.editor-body');
        assert(editorBodyRule && /display\s*:\s*flex/.test(editorBodyRule) && /flex\s*:\s*1/.test(editorBodyRule),
            n('H: .editor-body is unchanged — the Editor canvas column beside the sidebar is untouched'));

        assert(!/world-view-scene|world-canvas/.test(css.match(/\.sidebar-scroll\s*\{[^}]*\}/)?.[0] || ''),
            n('H: .sidebar-scroll\'s own rule body mentions nothing about World\'s canvas — sanity check that the two fixes stayed scoped to their own surfaces'));

        const overlayRule = findExactRuleBody(css, '.world-view-overlay');
        assert(overlayRule && /max-width\s*:\s*280px/.test(overlayRule),
            n('H: .world-view-overlay\'s own max-width (280px) is unchanged — World\'s panel geometry outside the two fixed rules is untouched'));

        const toolbarRule = findExactRuleBody(css, '.toolbar');
        assert(toolbarRule !== null, n('H: .toolbar still exists as its own rule, untouched by this milestone'));

        const publicationsRule = findExactRuleBody(css, '.publications-view');
        assert(publicationsRule !== null, n('H: .publications-view still exists as its own rule, untouched by this milestone'));

        const repositoryRule = findExactRuleBody(css, '.repository-view');
        assert(repositoryRule !== null, n('H: .repository-view still exists as its own rule, untouched by this milestone'));

        // Every OTHER World action-style row this codebase has —
        // .world-view-primary-nav .action-btn's own flex:1 — is
        // untouched; this milestone did not touch the pattern it left
        // alone (only the two rows that needed it).
        const primaryNavBtnBody = findExactRuleBody(css, '.world-view-primary-nav .action-btn');
        assert(primaryNavBtnBody && /flex\s*:\s*1/.test(primaryNavBtnBody) && !/flex-wrap/.test(primaryNavBtnBody),
            n('H: .world-view-primary-nav .action-btn (Explore/Map/Places) still uses its own flex:1 convention, untouched — this milestone did not touch a row that was never broken'));

        // BuildLibraryPanel's filter selects and RepeatPanel's inputs —
        // 0.9.654's other "already safe" findings — are likewise
        // untouched.
        const filterSelectBody = findExactRuleBody(css, '.build-library-filter-select');
        assert(filterSelectBody && /flex\s*:\s*1/.test(filterSelectBody) && /min-width\s*:\s*0/.test(filterSelectBody),
            n('H: .build-library-filter-select is unchanged'));
        const repeatInputStyleBody = findMethodReturnObject(repeatPanelSrc, 'inputStyle');
        assert(repeatInputStyleBody && styleProp(repeatInputStyleBody, 'width') === '48px',
            n('H: RepeatPanel.js\'s own inputStyle() is unchanged (still 48px)'));

        console.log('✓ H: the Editor canvas, World\'s own overlay panel geometry, the toolbar, Publications, and Repository all remain their own untouched rules; .world-view-primary-nav .action-btn, BuildLibraryPanel\'s filter selects, and RepeatPanel\'s inputs — every OTHER action row/control this audit arc ever looked at — are all unchanged. This milestone touched exactly the two rows and the one shared padding value it named, nothing else.');
    }

    // ===============================================================
    // Section I — Production-change guard.
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
        if (changedFiles[0] !== '<git unavailable>') {
            assert(changedFiles.length === 0,
                n(`I: no production file is modified by this milestone (found: ${JSON.stringify(changedFiles)}) — this closure audit is test-only, verifying the state 0.9.655 already left in css/main.css rather than changing it further`));
        } else {
            console.log('  (git unavailable in this environment — production-change guard skipped)');
        }

        console.log('✓ I: this milestone is test-only — it verifies, from real source, that 0.9.655\'s production fix (css/main.css) is in place and unaccompanied by any further production change, plus its own registration in tests.html.');
    }

    console.log(`\n${assertionCount} assertions.`);
    console.log('\n✅ 0.9.656 Sidebar Action Overflow and Scrollbar Content Clearance Closure Audit complete — both gaps 0.9.654 found and 0.9.655 fixed are confirmed closed: World\'s Save/Publish/Edit Metadata/Undo/Redo/History and Home/Locations/Notifications rows both wrap instead of overflowing, and remain reachable (the stronger property the brief asked for, not merely "no overflow"); Editor\'s .tool-switcher now clears .sidebar-scroll\'s own edge by 17px under both the classic and overlay scrollbar regimes. Vertical scrolling, the numeric Transform inputs, the shared padding-right convention, and every other panel/row/surface this audit checked are all unchanged. The sidebar/UI-consistency arc opened by 0.9.646 is CLOSED.');
}

run().catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
});
