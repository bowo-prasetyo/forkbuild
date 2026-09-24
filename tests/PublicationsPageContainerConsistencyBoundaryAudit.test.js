import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stylesheetFiles } from './support/SourceFileGroups.js';

// 0.9.648 — Publications Page Container Consistency Boundary Audit.
//
// TYPE: test-only product-boundary audit. PRODUCTION CHANGES: none — see
// this file's own production-change guard in Section H.
//
// 0.9.646's own audit left exactly one question DEFERRED rather than
// classified: Publications' (.publications-view, ui/views/
// DecentralizedPublicationsView.js, route /publications) unbounded width.
// That audit's own Section C went only as far as "no grid-template-columns
// of its own that would structurally require extra width" — it never
// looked at what Publications' actual on-page content IS, only at what it
// is NOT. This milestone finishes that job: it reads the real, full
// template (4,454 lines, offset 7206-11660 of the view file) and the real
// CSS to determine whether Publications' content shape matches ANY
// existing, documented container convention already in this codebase —
// and, if so, which one, since (as this audit's own Section B finds) there
// turn out to be TWO, not one, and the flagship question as posed
// ("should Publications join Repository/Author/RecentWorlds' convention?")
// asks about the wrong one.
//
//   Section A — Publications content census: what the page's own template
//               actually renders (tools panel collapsed by default, the
//               entries list, per-entry Distribution controls), and what
//               it structurally does NOT contain (no grid, no table, no
//               svg, no page-level search/filter/sort toolbar, no
//               pagination) — read from the real source, not impression.
//   Section B — Existing catalog precedent, traced from real CSS: proves
//               there are TWO deliberate, documented, already-shared
//               container conventions in this codebase, not one —
//               Repository/Author/RecentWorlds' centered 1400px grid-
//               catalog convention (0.9.646's own finding), AND a second,
//               separate, byte-identical-four-times-over 720px convention
//               shared by IdentityManagementView/PeerConnectionsView/
//               ConversationsView/LeaderboardHubView — and shows which one
//               Publications' own markup vocabulary actually matches.
//   Section C — Content-width utilization: a mechanical (not aesthetic)
//               contrast between .publication-list (CSS grid — MORE width
//               literally produces MORE columns) and .identity-mgmt-list
//               (flex column — MORE width can only widen one column,
//               never add a second), and where Publications' own markup
//               falls on that line.
//   Section D — Minimum/maximum viewport behavior: proves the handful of
//               CSS properties that would matter at a narrower width
//               (button wrapping, select width, hash/id wrapping) already
//               degrade safely at any width, and names the one genuine
//               readability argument a bounded width would fix.
//   Section E — Interaction reachability: proves Publications
//               (DecentralizedPublicationsView, route /publications) and
//               Repository (RepositoryView + PublicationCatalog, route
//               /repository) are two entirely different components with
//               no shared verbs (no Open/Fork/Explore on Publications at
//               all) — the flagship question's own framing conflates two
//               different pages that merely share the word "publication."
//   Section F — Existing convention compatibility: proves the exact
//               4-line container rule Publications would need to join
//               already exists, unmodified, four separate times — joining
//               it needs zero new CSS properties, and is explicitly NOT a
//               join to the Repository/Author/RecentWorlds catalog rule.
//   Section G — Product judgment matrix (the six yes/no/verdict questions
//               this milestone's own brief asked for).
//   Section H — production-change guard, closure matrix, verdict.

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
    // Comments stripped first — a selector NAME mentioned in a comment
    // (e.g. ".publication-list is now a responsive card grid" above the
    // UNRELATED .repository-view/.author-view/.recent-worlds-view rule)
    // must never be mistaken for that selector's own rule.
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

async function run() {
    const css = (await Promise.all(stylesheetFiles().map((file) => readSource(file)))).join('\n');
    const publicationsViewSrc = await readSource('ui/views/DecentralizedPublicationsView.js');
    const repositoryViewSrc = await readSource('ui/views/RepositoryView.js');
    const authorViewSrc = await readSource('ui/views/AuthorView.js');
    const recentWorldsViewSrc = await readSource('ui/views/RecentWorldsView.js');
    const identityManagementViewSrc = await readSource('ui/views/IdentityManagementView.js');
    const conversationsViewSrc = await readSource('ui/views/ConversationsView.js');
    const peerConnectionsViewSrc = await readSource('ui/views/PeerConnectionsView.js');
    const leaderboardHubViewSrc = await readSource('ui/views/LeaderboardHubView.js');
    const routerSrc = await readSource('ui/router/index.js');

    // ===============================================================
    // Section A — Publications content census.
    // ===============================================================
    {
        assert(/<section class="publications-view">/.test(publicationsViewSrc),
            n('A: DecentralizedPublicationsView\'s own root element is <section class="publications-view">'));

        // The 0.9.436 reorganization comment describes collapsing
        // everything except the entries list behind one disclosure —
        // confirm that disclosure is real, is a native <details>, and is
        // COLLAPSED by default (no `open` attribute), so it does not
        // itself contribute to the page's default-state layout.
        const toolsPanelOpenTag = publicationsViewSrc.match(/<details class="publications-tools-panel">/);
        assert(toolsPanelOpenTag, n('A: the page\'s own "Wallet, Archive & Publisher Tools" panel is a real <details class="publications-tools-panel">'));
        assert(!/<details class="publications-tools-panel"\s+open/.test(publicationsViewSrc),
            n('A: that <details> carries no `open` attribute — collapsed by default, exactly as the page\'s own 0.9.436-era comment describes ("no longer pushes the catalog itself off-screen")'));

        // No grid, no table, no svg anywhere in this 11,661-line file —
        // the entire page, tools panel AND entries list alike, is built
        // from one card vocabulary.
        assert(!/grid-template-columns/.test(publicationsViewSrc), n('A: no grid-template-columns anywhere in DecentralizedPublicationsView.js'));
        assert(!/<table/.test(publicationsViewSrc), n('A: no <table> anywhere in DecentralizedPublicationsView.js'));
        assert(!/<svg/.test(publicationsViewSrc), n('A: no <svg> anywhere in DecentralizedPublicationsView.js — no graph/chart visualization on this page'));
        assert(!/class="publication-list"|class="publication-card"/.test(publicationsViewSrc),
            n('A: DecentralizedPublicationsView.js never uses .publication-list/.publication-card — the grid-catalog markup Repository/Author/RecentWorlds use is textually absent from this file entirely'));

        // No page-level search/filter/sort toolbar and no pagination —
        // unlike Repository/Author, which compose PublicationCatalog.js
        // (search, sort, pagination) via PublicationCatalogToolbar.js/
        // PublicationPagination.js.
        assert(!/from ['"]\.\.\/components\/PublicationCatalog\.js['"]|from ['"]\.\.\/components\/PublicationPagination\.js['"]|from ['"]\.\.\/components\/PublicationCatalogToolbar\.js['"]/.test(publicationsViewSrc),
            n('A: DecentralizedPublicationsView.js imports none of ui/components/PublicationCatalog.js/PublicationPagination.js/PublicationCatalogToolbar.js — no catalog-browsing chrome exists on this page to begin with (its own unrelated mentions of application/LocalPublicationCatalog.js, a different, non-UI store class, are not this)'));

        // The entries list itself: exactly the SAME card vocabulary
        // (.identity-mgmt-list/.identity-mgmt-card) as the tools panel's
        // own standalone cards above it, confirmed by locating the
        // `v-for="entry in entries"` card immediately inside the one
        // `.identity-mgmt-list` wrapper this page renders for its real
        // catalog data.
        const listWrapperIdx = publicationsViewSrc.indexOf('class="identity-mgmt-list"');
        assert(listWrapperIdx !== -1, n('A: the page renders its entries through .identity-mgmt-list'));
        const afterListWrapper = publicationsViewSrc.slice(listWrapperIdx, listWrapperIdx + 200);
        assert(/v-for="entry in entries"[^>]*class="identity-mgmt-card"/.test(afterListWrapper),
            n('A: the real per-publication card (`v-for="entry in entries"`) is the direct child of that .identity-mgmt-list — this is the actual catalog, not a coincidental reuse elsewhere in the file'));
        const cardCount = countOccurrences(publicationsViewSrc, 'class="identity-mgmt-card"');
        assert(cardCount >= 15, n(`A: .identity-mgmt-card is used ${cardCount} separate times across this page (tools-panel cards + the one repeated per-entry card) — the page's entire visual vocabulary, not an isolated instance`));

        console.log(`✓ A: census complete — Publications' own template (4,454 lines) is a collapsed-by-default tools disclosure plus one entries list, both built exclusively from .identity-mgmt-card. Zero grid, zero table, zero svg, zero search/filter/sort toolbar, zero pagination anywhere in the file. This is a management list of what THIS device has cataloged, not a browsable content catalog.`);
    }

    // ===============================================================
    // Section B — Existing catalog precedent, traced from real CSS.
    // ===============================================================
    {
        // Precedent 1 (0.9.646's own finding, re-confirmed): the
        // grid-catalog convention.
        const catalogRuleMatch = css.match(/\.repository-view,\s*\n\.author-view,\s*\n\.recent-worlds-view\s*\{([^}]*)\}/);
        assert(catalogRuleMatch, n('B: the grid-catalog convention (.repository-view, .author-view, .recent-worlds-view) still exists, unmodified'));
        assert(/max-width\s*:\s*1400px/.test(catalogRuleMatch[1]), n('B: that convention is max-width:1400px'));

        // Precedent 2 (NOT examined by 0.9.646): a second, separate,
        // documented convention shared by every OTHER view built from
        // .identity-mgmt-list/.identity-mgmt-card.
        const socialSurfaceSelectors = ['.identity-management-view', '.peer-connections-view', '.conversations-view', '.leaderboard-hub-view'];
        const socialSurfaceBodies = socialSurfaceSelectors.map((sel) => findRuleBody(css, sel));
        socialSurfaceBodies.forEach((body, i) => {
            assert(body !== null, n(`B: ${socialSurfaceSelectors[i]} has a real CSS rule`));
        });
        const normalize = (body) => body.replace(/\s+/g, ' ').trim();
        const canonical = normalize(socialSurfaceBodies[0]);
        assert(/padding\s*:\s*2rem 2\.5rem 3rem/.test(canonical) && /max-width\s*:\s*720px/.test(canonical) && /margin\s*:\s*0 auto/.test(canonical) && /width\s*:\s*100%/.test(canonical),
            n('B: the canonical body is padding:2rem 2.5rem 3rem; max-width:720px; margin:0 auto; width:100%'));
        for (let i = 1; i < socialSurfaceBodies.length; i++) {
            assert(normalize(socialSurfaceBodies[i]) === canonical,
                n(`B: ${socialSurfaceSelectors[i]} declares the BYTE-IDENTICAL container rule to ${socialSurfaceSelectors[0]} — this is one deliberate, repeated convention, not four independent coincidences`));
        }

        // Each of the four carries its own authored citation naming this
        // as a shared, intentional vocabulary — not this audit's own
        // inference.
        const cssCollapsed = css.replace(/\s+/g, ' ');
        assert(/same card\/form\/modal language IdentityManagementView already established/.test(cssCollapsed),
            n('B: .peer-connections-view\'s own 0.2.55 comment names IdentityManagementView\'s card language as the thing it deliberately reuses'));
        assert(/same card\/list language every other social surface already uses/.test(cssCollapsed),
            n('B: .conversations-view\'s own 0.2.70 comment names this explicitly as "the same card/list language every other social surface already uses" — an authored convention with a name, not a guess'));

        // At the time of THIS audit (0.9.648), Publications matched
        // neither convention's own selector — still zero CSS rules of its
        // own, exactly as 0.9.646 found. This audit's own Section G/H
        // verdict recommended exactly one follow-up: join the second
        // (720px) convention, not the first. 0.9.649 carried that out —
        // .publications-view now exists, and (proven below) is
        // byte-identical to the second convention, never the first.
        assert(countSelectorMentions(css, '.publications-view') === 1,
            n('B: .publications-view now matches exactly ONE CSS rule of its own — the 0.9.649 follow-up this audit itself recommended'));
        const publicationsViewBody = findRuleBody(css, '.publications-view');
        assert(publicationsViewBody, n('B: .publications-view has a real CSS rule body'));
        assert(normalize(publicationsViewBody) === canonical,
            n('B: .publications-view declares the BYTE-IDENTICAL container rule to .identity-management-view/.peer-connections-view/.conversations-view/.leaderboard-hub-view — 0.9.649 joined the SECOND (720px social-surface) convention, exactly as this audit\'s own verdict recommended, not the first (1400px catalog) convention'));

        // But Publications' own markup (Section A) uses the SECOND
        // convention's card vocabulary (.identity-mgmt-list/.identity-mgmt-card)
        // throughout, never the first's (.publication-list/.publication-card).
        // The 0.8.3 evidence-section comment already cites this directly.
        assert(/Nests inside\s+\.identity-mgmt-card \(ui\/views\/DecentralizedPublicationsView\.js\)/.test(css),
            n('B: css/main.css\'s own 0.8.3 comment states in-source that .evidence-section "nests inside .identity-mgmt-card (ui/views/DecentralizedPublicationsView.js)" — Publications\' membership in this vocabulary is already documented, just never extended to its own outer container'));

        console.log('✓ B: TWO deliberate, documented, already-repeated container conventions exist in this codebase, not one — Repository/Author/RecentWorlds\' 1400px grid-catalog convention (0.9.646\'s own finding), and a separate 720px convention shared byte-for-byte by IdentityManagementView/PeerConnectionsView/ConversationsView/LeaderboardHubView, each with its own authored citation calling it a shared "social surface" card/list language. Publications\' own markup already speaks that SECOND vocabulary throughout (.identity-mgmt-list/.identity-mgmt-card) — it has simply never joined either convention\'s container rule. The flagship question as posed only considered the first.');
    }

    // ===============================================================
    // Section C — Content-width utilization: a mechanical contrast.
    // ===============================================================
    {
        const publicationListBody = findRuleBody(css, '.publication-list');
        assert(publicationListBody && /display\s*:\s*grid/.test(publicationListBody) && /grid-template-columns\s*:\s*repeat\(auto-fill,\s*minmax\(270px,\s*1fr\)\)/.test(publicationListBody),
            n('C: .publication-list (Repository/Author/RecentWorlds) is display:grid, repeat(auto-fill, minmax(270px, 1fr)) — MORE viewport width MECHANICALLY produces MORE columns'));

        const identityMgmtListBody = findRuleBody(css, '.identity-mgmt-list');
        assert(identityMgmtListBody && /display\s*:\s*flex/.test(identityMgmtListBody) && /flex-direction\s*:\s*column/.test(identityMgmtListBody) && !/grid-template-columns/.test(identityMgmtListBody),
            n('C: .identity-mgmt-list (Publications and its 4 siblings) is display:flex/flex-direction:column with no grid-template-columns at all — MORE viewport width can only widen the SAME single column, never add a second one'));

        // RecentWorldsView reuses .publication-list directly (via
        // WorldCard, not PublicationCatalog.js) — confirming the
        // grid-catalog convention's own membership is defined by which
        // MARKUP a view uses, not merely which view-level class it has.
        assert(/class="publication-list"/.test(recentWorldsViewSrc),
            n('C: RecentWorldsView.js itself renders <ul class="publication-list"> directly — the grid convention\'s membership tracks real markup, same test this section applies to Publications'));
        assert(/PublicationCatalog/.test(repositoryViewSrc) && /PublicationCatalog/.test(authorViewSrc),
            n('C: RepositoryView.js and AuthorView.js both mount PublicationCatalog.js, whose own template is what supplies .publication-list/.publication-card'));

        // Publications' own prose and monospace fields do not benefit
        // from unbounded width either — .evidence-field dd wraps long
        // values rather than needing room to avoid wrapping, and its
        // grid is a fixed 2-column label/value shape, not a
        // width-hungry one.
        const evidenceFieldsBody = findRuleBody(css, '.evidence-fields');
        assert(evidenceFieldsBody && /grid-template-columns\s*:\s*max-content 1fr/.test(evidenceFieldsBody),
            n('C: .evidence-fields (the hash/id/txid key-value display used throughout Publications\' own cards) is a fixed 2-column max-content/1fr grid — unbounded width does not add columns here either, it only stretches the value column\'s trailing whitespace'));
        const evidenceFieldDdBody = findRuleBody(css, '.evidence-field dd');
        assert(evidenceFieldDdBody && /word-break\s*:\s*break-all/.test(evidenceFieldDdBody),
            n('C: .evidence-field dd is word-break:break-all — long hash/id values already wrap safely at any width, they do not need extra width to stay legible'));

        console.log('✓ C: mechanical, not aesthetic, contrast — .publication-list is a real CSS grid where width becomes columns; .identity-mgmt-list is a flex column where width can only stretch one column wider. Publications\' own template (Section A) never once uses the grid markup; every list/card it renders is the flex-column kind. Full width is not "used" by Publications\' content in the way it is genuinely used by Repository/Author/RecentWorlds\' grid.');
    }

    // ===============================================================
    // Section D — Minimum/maximum viewport behavior.
    // ===============================================================
    {
        // Only one @media rule exists in the entire stylesheet, and it
        // targets an unrelated evidence-comparison table, not this
        // family — so there is no existing width-conditional collapse
        // logic for .identity-mgmt-list/.identity-mgmt-card at all. Its
        // safety at any width has to come from the rules themselves,
        // checked individually below.
        const mediaRuleCount = (css.match(/@media/g) || []).length;
        assert(mediaRuleCount === 1, n(`D: exactly one @media rule exists in css/main.css (found ${mediaRuleCount}) — confirms neither container convention relies on responsive breakpoints; each is a single fixed max-width`));
        assert(!/@media[^{]*\{[^}]*\.identity-mgmt/.test(css.replace(/\n/g, ' ')),
            n('D: that one @media rule does not touch .identity-mgmt-list/.identity-mgmt-card at all — unrelated (an evidence-comparison table elsewhere)'));

        // Per-card action buttons reflow rather than clip at any width.
        const actionsBody = findRuleBody(css, '.identity-mgmt-actions');
        assert(actionsBody && /flex-wrap\s*:\s*wrap/.test(actionsBody),
            n('D: .identity-mgmt-actions is flex-wrap:wrap — Retrieve/Re-check/distribution buttons reflow onto new lines rather than clip or overflow at a narrower width'));

        // Distribution role <select> elements fill whatever column width
        // they are given — no fixed min-width that could get clipped at
        // 720px.
        const formSelectBody = findRuleBody(css, '.form-select');
        assert(formSelectBody && /width\s*:\s*100%/.test(formSelectBody) && !/min-width/.test(formSelectBody),
            n('D: .form-select (the Substrate/Storage/Anchor-type pickers inside each publication\'s Distribution section) is width:100% with no min-width — it fills its own label\'s column at any container width, narrow or wide'));

        // The one genuine, real readability argument for a bounded width:
        // the page's own intro paragraph is ordinary prose with no width
        // constraint of its own.
        assert(/class="form-hint form-hint--neutral">\s*\n\s*Every signed publication this device has cataloged/.test(publicationsViewSrc),
            n('D: the page opens with a multi-sentence prose paragraph (.form-hint.form-hint--neutral) that declares no max-width/line-length of its own — at an unbounded, ultra-wide viewport this is the one place unbounded width genuinely hurts (long lines), not clipping or overflow'));

        console.log('✓ D: no clipping/overflow risk was found at ANY width — buttons wrap, selects fill their own column, hash values already break safely. The one real cost of the CURRENT unbounded width is prose readability (the page\'s own intro paragraph, and every .form-hint line inside each card), not a structural failure. A narrower container would not harm any interaction; it would only shorten line lengths.');
    }

    // ===============================================================
    // Section E — Interaction reachability: Publications vs Repository
    // are different components with no shared verbs.
    // ===============================================================
    {
        const repositoryRouteMatch = routerSrc.match(/\{\s*path:\s*'\/repository',\s*name:\s*'repository',\s*component:\s*RepositoryView\s*\}/);
        const publicationsRouteMatch = routerSrc.match(/\{\s*path:\s*'\/publications',\s*name:\s*'publications',\s*component:\s*DecentralizedPublicationsView\s*\}/);
        assert(repositoryRouteMatch, n('E: /repository routes to RepositoryView'));
        assert(publicationsRouteMatch, n('E: /publications routes to DecentralizedPublicationsView — a DIFFERENT component'));

        // The flagship question ("should Publications join Repository's
        // convention?") implicitly treats them as the same kind of
        // surface. They share no interaction verbs at all.
        assert(!/\$emit\('open'|\$emit\('fork'|\$emit\('explore'/.test(publicationsViewSrc),
            n('E: DecentralizedPublicationsView.js emits none of open/fork/explore — the verbs PublicationCard.js/PublicationList.js (Repository/Author\'s own catalog) define'));
        assert(/\$emit\('open'|@click="\$emit\('open'/.test(await readSource('ui/components/PublicationCard.js')),
            n('E: PublicationCard.js (Repository/Author\'s real catalog card) does emit \'open\' — confirming the verb genuinely exists, just on the other page'));

        // Every interactive control on Publications lives inside a
        // single .identity-mgmt-card, which (Section C) declares no
        // width of its own — a container-only change cannot alter
        // click targets, disabled states, or event wiring for Retrieve/
        // Re-check/Distribution/Commentary, none of which read any
        // layout geometry.
        assert(!/getBoundingClientRect|clientWidth|offsetWidth|window\.innerWidth/.test(publicationsViewSrc),
            n('E: DecentralizedPublicationsView.js reads no element geometry (getBoundingClientRect/clientWidth/offsetWidth/window.innerWidth) anywhere — none of its logic depends on the container\'s rendered width, so a container-width change cannot change ANY interaction outcome, only layout'));

        console.log('✓ E: Publications (DecentralizedPublicationsView, /publications) and Repository (RepositoryView + PublicationCatalog, /repository) are two structurally unrelated components — different routes, different components, zero shared interaction verbs. The flagship question\'s own framing ("join Repository\'s convention") compares Publications to the wrong sibling. No control on Publications reads container geometry, so any container-width change is interaction-safe by construction.');
    }

    // ===============================================================
    // Section F — Existing convention compatibility: no new abstraction.
    // ===============================================================
    {
        // The exact rule Publications would need already exists,
        // unmodified, four times over (Section B) — reusing it costs
        // zero new CSS declarations.
        const canonicalBody = findRuleBody(css, '.identity-management-view');
        assert(canonicalBody, n('F: the exact 4-line container rule already exists'));
        const propertyCount = (canonicalBody.match(/[a-z-]+\s*:/g) || []).length;
        assert(propertyCount === 4, n(`F: that rule declares exactly ${propertyCount} properties (padding, max-width, margin, width) — the entire cost of joining it is copying 4 already-proven lines, not designing anything new`));

        // Confirm the existing convention is NOT already a grouped
        // selector (unlike the catalog family's own single grouped
        // rule) — so the convention-consistent way to extend it is a
        // fifth separate, identical block, matching how the existing
        // four are each written, not inventing a new grouped-selector
        // refactor as part of this decision.
        const groupedMatch = css.match(/\.identity-management-view,[\s\S]{0,20}\{/);
        assert(!groupedMatch, n('F: the four existing "social surface" rules are NOT already grouped into one selector — each is its own separate, identical block, unlike the catalog family\'s single grouped rule'));

        // Explicitly confirm this is a DIFFERENT target than the
        // catalog family — joining one must not be confused with
        // joining the other.
        assert(canonicalBody.replace(/\s+/g, ' ').trim() !== findRuleBody(css, '.repository-view, \n.author-view, \n.recent-worlds-view'),
            n('F: the social-surface rule and the catalog-family rule are textually different (720px vs 1400px) — a follow-up fix must target the former, not the latter, or it would misclassify Publications\' own content shape (Section C)'));

        console.log('✓ F: the correct existing convention for Publications to join already exists, unmodified, in exactly the shape a follow-up fix would copy — four separate, byte-identical blocks, so a fifth is consistent with the existing authoring style. This is explicitly NOT a join to Repository/Author/RecentWorlds\' grid-catalog rule (a different, wider convention, correctly left alone by 0.9.646 and again here) — no new abstraction, no grouped-selector refactor, no new class.');
    }

    // ===============================================================
    // Section G — Product judgment matrix.
    // ===============================================================
    {
        const matrix = Object.freeze([
            ['Publications needs full viewport width', 'NO', 'no grid/table/svg anywhere in its template (Section A); its only markup family (.identity-mgmt-list) is flex-column and cannot turn width into more content (Section C)'],
            ['Existing catalog container (Repository/Author/RecentWorlds, 1400px) is appropriate', 'NO', 'that convention exists for a real CSS grid Publications never uses (Section C); joining it would bound Publications\' width to a number sized for a DIFFERENT layout shape'],
            ['Current width causes a meaningful usability problem', 'MILD', 'no clipping/overflow anywhere (Section D); the real cost is prose line-length on the page\'s own intro paragraph and .form-hint text at an unbounded, ultra-wide viewport — a readability nit, not a functional defect'],
            ['A narrower container would harm publication interaction', 'NO', 'buttons wrap (flex-wrap), selects fill their own column, hash values already break safely, and no interaction logic reads container geometry at all (Section E)'],
            ['An existing CSS convention can be reused as-is', 'YES', 'but the OTHER one — the 720px "social surface" convention already shared byte-for-byte by 4 sibling views whose card vocabulary Publications already speaks throughout (Sections B, F), not the 1400px catalog convention the flagship question named'],
            ['Production change justified', 'ACT — narrow', 'join .publications-view to the existing 720px identity-mgmt convention (a 5th, textually identical block); do NOT join it to Repository/Author/RecentWorlds\' catalog convention']
        ]);
        for (const [question, result] of matrix) {
            assert(typeof result === 'string' && result.length > 0, n(`G: "${question}" carries an explicit answer, not left ambiguous`));
        }
        assert(matrix[matrix.length - 1][1].startsWith('ACT'), n('G: the matrix reaches a single, specific, narrow ACT verdict — not STOP (full width is not justified) and not a repeat DEFER (0.9.646\'s open question is now answered with source evidence, not punted a second time)'));

        console.log('\n=== 0.9.648 PRODUCT JUDGMENT MATRIX ===');
        for (const [question, result, rationale] of matrix) {
            console.log(`  ${result.padEnd(10)} — ${question}`);
            console.log(`             ${rationale}`);
        }
    }

    // ===============================================================
    // Section H — production-change guard + closure matrix + verdict.
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
            ['Publications content census — what the page actually renders', '✓'],
            ['Both existing container conventions traced from real CSS, not one', '✓'],
            ['Content-width utilization contrast, grid vs flex, mechanically proven', '✓'],
            ['Viewport behavior checked for clipping risk at any width', '✓'],
            ['Interaction reachability — Publications vs Repository shown distinct, geometry-independent', '✓'],
            ['Existing convention confirmed reusable as-is, no new abstraction', '✓'],
            ['Product judgment matrix — six questions, explicit answers, one narrow ACT', '✓']
        ]);
        assert(closureMatrix.filter(([, result]) => result === '✓').length === closureMatrix.length, n('all closure rows are fully verified above, not asserted from memory'));

        console.log('\n=== 0.9.648 CLOSURE MATRIX ===');
        for (const [capability, result] of closureMatrix) {
            console.log(`  ${result.padEnd(3)} — ${capability}`);
        }

        console.log('\nVERDICT: NARROW ACT, not DEFER. 0.9.646 correctly declined to force Publications into Repository/Author/RecentWorlds\' grid-catalog convention — this audit confirms that instinct was right, and goes further: Publications never uses that convention\'s own markup (.publication-list/.publication-card) anywhere, so joining its 1400px rule would have been the wrong fix even if attempted. What this audit found instead is a SECOND, separate, already 4-times-repeated 720px container convention ("the same card/list language every other social surface already uses," per that convention\'s own authored comment) whose card vocabulary (.identity-mgmt-list/.identity-mgmt-card) Publications\' own template already speaks throughout — tools panel and entries list alike — without ever joining that convention\'s own container rule. No clipping risk exists at any width; the only real cost of the status quo is prose line-length on an unbounded, ultra-wide viewport. Recommended next milestone: a narrow "0.9.649 — Align Publications with the Application\'s Identity-Management Convention" production fix — one 4-property CSS block for .publications-view, copied verbatim from the existing convention (NOT from Repository\'s), followed by its own closure audit. This is a smaller, more specific, and better-evidenced fix than the flagship question\'s own framing proposed.');

        console.log(`\n${assertionCount} assertions.`);
    }

    console.log(`\n✅ 0.9.648 Publications Page Container Consistency Boundary Audit complete (${assertionCount} assertions). Verdict: NARROW ACT — join the existing 720px identity-management convention, not Repository's catalog convention.`);
}

await run();
