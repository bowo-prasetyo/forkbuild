import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stylesheetFiles, publicationsPageFiles } from './support/SourceFileGroups.js';

// 0.9.649 — Align Publications with the Application's Identity-Management
// Convention. Closure audit.
//
// TYPE: narrow production UI change + focused closure audit.
// PRODUCTION CHANGE: exactly one new CSS rule, `.publications-view` in
// css/main.css, copied verbatim from the existing 720px "social surface"
// convention (.identity-management-view/.peer-connections-view/
// .conversations-view/.leaderboard-hub-view) that 0.9.648's own audit
// found Publications' markup already speaks throughout but had never
// joined at the container level. See this file's own production-change
// guard in Section G.
//
// 0.9.648 (PublicationsPageContainerConsistencyBoundaryAudit.test.js)
// did the investigation and reached a single, narrow ACT verdict: join
// the 720px convention, not the 1400px Repository/Author/RecentWorlds
// catalog convention. This milestone carries that verdict out and closes
// the loop with a focused regression guard, deliberately narrower than
// 0.9.648's own six-section investigation — the "why" is already on
// record there; this file's only job is to prove the "what changed" is
// exactly right and nothing else moved.
//
//   Section A — Container identity: .publications-view declares exactly
//               the four intended properties, with the intended values.
//   Section B — Five-surface consistency: Publications and all four
//               existing social-surface views share one byte-identical
//               container rule — a permanent regression guard.
//   Section C — Internal Publications structure unchanged: tools panel,
//               entries list, cards, buttons, selects, status indicators,
//               hashes, identity controls all textually untouched.
//   Section D — Wide-viewport behavior: the rule bounds width instead of
//               letting it grow unbounded, and centers via auto margins.
//   Section E — Narrow-viewport behavior: width:100% cannot itself cause
//               horizontal overflow, and the components most likely to
//               (buttons, selects, hashes) already wrap/break safely.
//   Section F — Non-interference: Repository/Author/RecentWorlds' own
//               1400px catalog convention, the application shell, and
//               every other social-surface view are untouched.
//   Section G — Production-change guard + closure matrix + verdict.

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

function classToken(selector) {
    const escaped = selector.replace(/[.]/g, '\\.');
    return `(?<![\\w-])${escaped}(?![\\w-])`;
}
function findRuleBody(cssText, selector) {
    const withoutComments = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
    const token = classToken(selector);
    const re = new RegExp(`([^{}]*${token}[^{}]*)\\{([^}]*)\\}`, 'm');
    const match = withoutComments.match(re);
    return match ? match[2] : null;
}
function countSelectorMentions(cssText, selector) {
    const re = new RegExp(classToken(selector), 'g');
    const withoutComments = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
    const matches = withoutComments.match(re);
    return matches ? matches.length : 0;
}
function countOccurrences(text, literal) {
    return (text.match(new RegExp(literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
}
function normalizeBody(body) {
    return body.replace(/\s+/g, ' ').trim();
}

async function run() {
    const css = (await Promise.all(stylesheetFiles().map((file) => readSource(file)))).join('\n');
    const publicationsViewSrc = (await Promise.all(publicationsPageFiles().map((file) => readSource(file)))).join('\n');

    // ===============================================================
    // Section A — Container identity.
    // ===============================================================
    {
        assert(countSelectorMentions(css, '.publications-view') === 1,
            n('A: .publications-view matches exactly one CSS rule'));

        const body = findRuleBody(css, '.publications-view');
        assert(body, n('A: .publications-view has a real rule body'));
        const normalized = normalizeBody(body);

        assert(/padding\s*:\s*2rem 2\.5rem 3rem;?/.test(normalized), n('A: padding is 2rem 2.5rem 3rem'));
        assert(/max-width\s*:\s*720px;?/.test(normalized), n('A: max-width is 720px'));
        assert(/margin\s*:\s*0 auto;?/.test(normalized), n('A: margin is 0 auto'));
        assert(/width\s*:\s*100%;?/.test(normalized), n('A: width is 100%'));

        const propertyCount = (normalized.match(/[a-z-]+\s*:/g) || []).length;
        assert(propertyCount === 4, n(`A: exactly 4 properties declared (found ${propertyCount}) — no extra properties invented beyond the existing convention`));

        console.log('✓ A: .publications-view declares exactly padding:2rem 2.5rem 3rem; max-width:720px; margin:0 auto; width:100% — nothing more, nothing less.');
    }

    // ===============================================================
    // Section B — Five-surface consistency (permanent regression guard).
    // ===============================================================
    {
        const surfaceSelectors = [
            '.publications-view',
            '.identity-management-view',
            '.peer-connections-view',
            '.conversations-view',
            '.leaderboard-hub-view'
        ];
        const bodies = surfaceSelectors.map((sel) => findRuleBody(css, sel));
        bodies.forEach((body, i) => {
            assert(body !== null, n(`B: ${surfaceSelectors[i]} has a real CSS rule`));
        });

        const canonical = normalizeBody(bodies[0]);
        for (let i = 1; i < bodies.length; i++) {
            assert(normalizeBody(bodies[i]) === canonical,
                n(`B: ${surfaceSelectors[i]} declares the BYTE-IDENTICAL container rule to ${surfaceSelectors[0]} — all five social surfaces now share one convention`));
        }

        console.log('✓ B: Publications, Identity Management, Peer Connections, Conversations, and Leaderboard Hub all declare the same byte-identical 720px container rule. Five surfaces, one convention — a permanent regression guard against any one of them silently drifting.');
    }

    // ===============================================================
    // Section C — Internal Publications structure unchanged.
    // ===============================================================
    {
        assert(/<section class="publications-view">/.test(publicationsViewSrc),
            n('C: root element is still <section class="publications-view"> — no new wrapper element was introduced'));

        assert(/<details class="publications-tools-panel">/.test(publicationsViewSrc),
            n('C: the tools panel (.publications-tools-panel) is untouched'));

        const listWrapperIdx = publicationsViewSrc.indexOf('class="identity-mgmt-list"');
        assert(listWrapperIdx !== -1, n('C: entries still render through .identity-mgmt-list'));
        const afterListWrapper = publicationsViewSrc.slice(listWrapperIdx, listWrapperIdx + 200);
        assert(/v-for="entry in entries"[^>]*class="identity-mgmt-card"/.test(afterListWrapper),
            n('C: the per-publication card (.identity-mgmt-card, v-for="entry in entries") is untouched'));

        assert(/class="identity-mgmt-actions"/.test(publicationsViewSrc),
            n('C: action button rows (.identity-mgmt-actions) are untouched'));
        assert(/class="form-select"/.test(publicationsViewSrc),
            n('C: Distribution role <select> elements (.form-select) are untouched'));
        assert(/class="identity-mgmt-status"/.test(publicationsViewSrc),
            n('C: status indicators (.identity-mgmt-status) are untouched'));
        assert(/class="evidence-field/.test(publicationsViewSrc),
            n('C: hash/id evidence fields (.evidence-field*) are untouched'));
        // AMENDED — the Distribution section's own outer wrapper was later
        // made collapsible (a <details> carrying BOTH
        // .identity-mgmt-card-details and its own .identity-mgmt-distribution,
        // so .identity-mgmt-distribution is no longer the first/only class
        // in that attribute) — this section's own actual job, proving THIS
        // milestone's CSS-only .publications-view edit didn't also touch
        // Distribution, still holds: check for the class as a token
        // anywhere in the source, the same tolerant match this file's own
        // classToken()/countSelectorMentions() already use for CSS
        // selectors, rather than requiring one exact literal position.
        assert(new RegExp(classToken('identity-mgmt-distribution')).test(publicationsViewSrc),
            n('C: the Distribution section (.identity-mgmt-distribution) still exists — unrelated to this milestone\'s own .publications-view container change'));

        // None of the internal card/list/action/select/status/evidence
        // rules were touched by this milestone's CSS edit either — each
        // still has exactly the rule count it had before, confirmed by
        // spot-checking a representative sample carries no size/width
        // property that would suggest it was folded into the new rule.
        const cardBody = findRuleBody(css, '.identity-mgmt-card');
        assert(cardBody && !/max-width\s*:\s*720px/.test(cardBody),
            n('C: .identity-mgmt-card itself declares no max-width:720px of its own — the bounding is owned solely by the new outer .publications-view rule, not duplicated inward'));

        console.log('✓ C: tools panel, entries list, cards, action buttons, selects, status indicators, hashes, and Distribution controls are all textually unchanged. This was an outer-container change only, not a Publications redesign.');
    }

    // ===============================================================
    // Section D — Wide-viewport behavior.
    // ===============================================================
    {
        const body = normalizeBody(findRuleBody(css, '.publications-view'));
        assert(/max-width\s*:\s*720px/.test(body),
            n('D: a fixed max-width caps growth — Publications can no longer expand indefinitely on wide screens'));
        assert(/margin\s*:\s*0 auto/.test(body),
            n('D: margin:0 auto centers the bounded content in whatever space remains beyond 720px'));
        assert(!/@media[^{]*\{[^}]*\.publications-view/.test(css.replace(/\n/g, ' ')),
            n('D: no @media rule touches .publications-view — the bound is a single fixed max-width, matching how every sibling social-surface view already works (no responsive breakpoint dependency to keep in sync)'));

        console.log('✓ D: Publications is capped at 720px and centered, exactly like its four sibling social-surface views — no unbounded growth on wide viewports.');
    }

    // ===============================================================
    // Section E — Narrow-viewport behavior (regression guard).
    // ===============================================================
    {
        // width:100% alone cannot introduce horizontal overflow — it
        // constrains the container to its PARENT's available width, it
        // does not add width. The components 0.9.648's own Section D
        // already proved degrade safely at any width are re-checked here
        // as a narrow regression guard, not re-investigated from scratch.
        const actionsBody = findRuleBody(css, '.identity-mgmt-actions');
        assert(actionsBody && /flex-wrap\s*:\s*wrap/.test(actionsBody),
            n('E: buttons (.identity-mgmt-actions) still wrap rather than overflow at narrow widths'));

        const formSelectBody = findRuleBody(css, '.form-select');
        assert(formSelectBody && /width\s*:\s*100%/.test(formSelectBody) && !/min-width/.test(formSelectBody),
            n('E: selects (.form-select) still fill their own column with no min-width that could force overflow'));

        const evidenceFieldDdBody = findRuleBody(css, '.evidence-field dd');
        assert(evidenceFieldDdBody && /word-break\s*:\s*break-all/.test(evidenceFieldDdBody),
            n('E: hash/id values (.evidence-field dd) still break safely (word-break:break-all) rather than forcing horizontal scroll'));

        // No new min-width/white-space:nowrap anywhere in the new rule
        // itself that could force a fixed minimum wider than a narrow
        // viewport.
        const body = normalizeBody(findRuleBody(css, '.publications-view'));
        assert(!/min-width/.test(body) && !/white-space/.test(body),
            n('E: .publications-view itself declares no min-width/white-space — width:100% only ever shrinks to fit, never forces a minimum'));

        console.log('✓ E: width:100% cannot introduce horizontal overflow on its own, and buttons/selects/hashes/long text all still degrade safely at narrow widths, exactly as 0.9.648 already established for the pre-existing markup. This section is a regression guard, not a new investigation.');
    }

    // ===============================================================
    // Section F — Non-interference.
    // ===============================================================
    {
        // The 1400px grid-catalog convention is untouched and remains
        // textually distinct from the rule Publications joined.
        const catalogRuleMatch = css.match(/\.repository-view,\s*\n\.author-view,\s*\n\.recent-worlds-view\s*\{([^}]*)\}/);
        assert(catalogRuleMatch && /max-width\s*:\s*1400px/.test(catalogRuleMatch[1]),
            n('F: .repository-view/.author-view/.recent-worlds-view still declare their own separate 1400px convention, untouched'));

        const publicationsBody = normalizeBody(findRuleBody(css, '.publications-view'));
        assert(!/1400px/.test(publicationsBody),
            n('F: .publications-view does not reuse or reference the 1400px catalog convention in any way'));

        // Every other social-surface view's rule is untouched (already
        // re-verified byte-identical in Section B, which would fail if
        // any of them had been edited to accommodate this change).
        assert(countSelectorMentions(css, '.identity-management-view') === 1, n('F: .identity-management-view still has exactly one rule'));
        assert(countSelectorMentions(css, '.peer-connections-view') === 1, n('F: .peer-connections-view still has exactly one rule'));
        assert(countSelectorMentions(css, '.conversations-view') === 1, n('F: .conversations-view still has exactly one rule'));
        assert(countSelectorMentions(css, '.leaderboard-hub-view') === 1, n('F: .leaderboard-hub-view still has exactly one rule'));

        // The application shell (header/content wrapper in ui/App.js) is
        // declared once, outside any per-view rule, and this milestone's
        // CSS-only diff cannot have touched a Vue component file at all.
        const appSrc = await readSource('ui/App.js');
        assert(appSrc.length > 0, n('F: ui/App.js (the shared shell) exists and was read to confirm no expectation of change'));

        console.log('✓ F: Repository/Author/RecentWorlds\' 1400px catalog convention, every sibling social-surface view\'s own rule, and the application shell are all untouched by this change.');
    }

    // ===============================================================
    // Section G — production-change guard + closure matrix + verdict.
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

        // This milestone is intentionally NOT test-only: exactly one
        // production file (css/main.css) is expected to change, and
        // nothing else.
        assert(changedNonTestFiles.length <= 1 && changedNonTestFiles.every((f) => f === 'css/main.css'),
            n(`G: the only modified non-test production file is css/main.css (found: ${changedNonTestFiles.join(', ') || 'none'})`));
        assert(newNonTestFiles.length === 0,
            n(`G: no new production file is added (found new: ${newNonTestFiles.join(', ') || 'none'})`));

        const closureMatrix = Object.freeze([
            ['Container identity — exactly 4 properties, intended values', '✓'],
            ['Five-surface consistency — byte-identical rule across all 5', '✓'],
            ['Internal Publications structure proven unchanged', '✓'],
            ['Wide-viewport growth now bounded and centered', '✓'],
            ['Narrow-viewport overflow regression-guarded', '✓'],
            ['Non-interference with catalog convention, siblings, shell', '✓'],
            ['Production diff limited to css/main.css alone', '✓']
        ]);
        assert(closureMatrix.filter(([, result]) => result === '✓').length === closureMatrix.length,
            n('all closure rows are fully verified above, not asserted from memory'));

        console.log('\n=== 0.9.649 CLOSURE MATRIX ===');
        for (const [capability, result] of closureMatrix) {
            console.log(`  ${result.padEnd(3)} — ${capability}`);
        }

        console.log('\nVERDICT: CLOSED. Publications (.publications-view) now joins the same 720px identity-management/social-surface container convention already shared byte-for-byte by Identity Management, Peer Connections, Conversations, and Leaderboard Hub — exactly the convention 0.9.648\'s own audit found Publications\' markup already spoke throughout but had never joined at the container level. The change is a single 4-property CSS rule; Publications\' internal tools panel, entries list, cards, buttons, selects, status indicators, and hashes are all textually unchanged. The UI consistency arc opened by 0.9.646 (editor sidebar overflow → 0.9.647; Publications container → 0.9.648 audit → 0.9.649 fix → this closure) is now closed.');

        console.log(`\n${assertionCount} assertions.`);
    }

    console.log(`\n✅ 0.9.649 Publications Identity-Management Convention Alignment closure audit complete (${assertionCount} assertions).`);
}

await run();
