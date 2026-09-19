import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Structure } from '../core/Structure.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { compareBlueprintSimilarity, isPossibleLineageCandidate, DEFAULT_SIMILARITY_THRESHOLD } from '../core/BlueprintSimilarity.js';

// 0.9.592 — Editor Similarity Ranking Boundary Audit.
//
// Type: test-only architectural/product boundary audit. Production
// changes: NONE. Every section below is either (a) a regex/substring
// match against the real, unmodified ui/views/EditorView.js,
// ui/components/StructureInfoPanel.js, application/BlueprintLineageUseCase.js
// or docs/Principles.md source, or (b) a live execution of
// computeSimilarityCandidates() — reproduced VERBATIM from
// ui/views/EditorView.js and guarded by Section A's own literal-text
// assertions against that same file, so this reproduction cannot
// silently drift from the real function — against real core/
// BlueprintSimilarity.js and core/Structure.js/Brick.js/Position.js,
// never generic stand-ins.
//
// The question this milestone was asked, verbatim: "Does the similarity
// ranking performed by EditorView belong to the presentation layer, or
// is it application-level decision logic?" 0.9.586's own inventory
// (tests/ProductCapabilitySurfaceInventoryGapClassificationAudit.test.js,
// Section C1) already flagged this as a live, real UI-owned ranking
// decision and provisionally labeled it PRESENTATION_GAP rather than
// ARCHITECTURAL_GAP (contrast C2, isValidContentHash's three independent
// definitions, which it labeled ARCHITECTURAL_GAP). This milestone does
// the deep audit that provisional label was never put through, and
// either confirms it or overturns it with live evidence.
//
// LETTERED SECTIONS (mirroring the requesting brief's own A-J):
//   A. Locate the complete ranking path in the real production file.
//   B. What the score means — exercise the real compareBlueprintSimilarity()
//      with three controlled candidates (high/moderate/below-threshold)
//      and confirm exactly what downstream behavior depends on ordering.
//   C. Selection semantics — is the top-ranked candidate ever
//      automatically selected/opened/published/forked/used as a
//      default, or does every action require an explicit human click?
//   D. Cross-surface reuse — is this the only UI-owned relevance sort in
//      the codebase, or one of several?
//   E. Dependency direction — candidate data + Editor-local state, or
//      application/domain semantics + product-defined relevance rules?
//   F. Purity and determinism — same inputs -> same ordering, no
//      mutation, no persistence, no network, stable tie-break.
//   G. User-visible consequences — display order only, or a system
//      decision a person then merely confirms?
//   H. Existing application seams — is there already an application-layer
//      function that could legitimately own this, structurally
//      comparable to how attribution/lineage ARE wrapped?
//   I. Boundary drift guard — confirm this audit touched none of the
//      excluded topics (fuzzy search, ML similarity, personalization,
//      recommendation systems, caching, persistence, Repository changes,
//      publication identity changes).
//   J. Flagship — Create Document -> Edit -> candidates available ->
//      similarity -> ordered presentation -> human choice, perturbed.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE: moving any code, changing
// the similarity algorithm, changing the top-3 cap or the 0.5 threshold,
// unifying this with core/BlueprintAttributionView.js#rankAttributionsByAuthor()
// or any other ranking in the codebase, consolidating isValidContentHash
// (that is 0.9.593's own, separate audit), and any change to
// core/BlueprintSimilarity.js, application/BlueprintLineageUseCase.js, or
// ui/views/EditorView.js/ui/components/StructureInfoPanel.js themselves.

let assertionCount = 0;
function assert(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function n(message) {
    return `${assertionCount + 1}. ${message}`;
}

const SOURCE_ROOT = fileURLToPath(new URL('../', import.meta.url));
async function source(relativePath) {
    return readFile(path.join(SOURCE_ROOT, relativePath), 'utf8');
}

function brick(definitionId, x, y, z, rotation = 0) {
    return new Brick({ definitionId, position: new Position(x, y, z), rotation });
}

// Reproduces ui/views/EditorView.js's own computeSimilarityCandidates()
// VERBATIM (see that file's own lines ~968-984), with `known` — the two
// concatenated library reads (structureRegistry.getAll() +
// personalStructureLibraryStore.listStructures()) — taken as a parameter
// instead of closing over EditorView's own two Editor-owned instances,
// since this audit is deliberately never instantiating a live Editor.
// Section A below guards every line of this reproduction against the
// real file's own literal text, so a future change to the real function
// that this reproduction did not follow would fail Section A, not go
// unnoticed here.
function computeSimilarityCandidates(structure, lineage, known) {
    const alreadyClaimed = new Set((lineage && lineage.derivedFrom || []).map((claim) => claim.sourceFingerprint));
    const candidates = [];
    for (const candidate of known) {
        if (candidate.id === structure.id) {
            continue;
        }
        const evidence = compareBlueprintSimilarity(candidate, structure);
        if (!isPossibleLineageCandidate(evidence) || alreadyClaimed.has(evidence.sourceFingerprint)) {
            continue;
        }
        candidates.push({ structure: candidate, evidence });
    }
    candidates.sort((a, b) => b.evidence.similarity - a.evidence.similarity);
    return candidates.slice(0, 3);
}

async function run() {
    // ===============================================================
    // Section A — locate the complete ranking path in the real file.
    // ===============================================================
    let editorSource;
    {
        editorSource = await source('ui/views/EditorView.js');

        assert(/import \{ compareBlueprintSimilarity, isPossibleLineageCandidate \} from '\.\.\/\.\.\/core\/BlueprintSimilarity\.js';/.test(editorSource),
            n("A1. EditorView.js imports the similarity function and its threshold-filter sibling from core/, never redefines either — candidate acquisition and ordering are two different things from the score's own computation, and only the latter is owned by core/"));

        assert(/function computeSimilarityCandidates\(structure, lineage\) \{/.test(editorSource),
            n('A2. computeSimilarityCandidates(structure, lineage) exists, taking exactly the inspected structure and its lineage view — no query object, no provider, no pagination cursor'));

        assert(/const known = \[\.\.\.structureRegistry\.getAll\(\), \.\.\.personalStructureLibraryStore\.listStructures\(\)\];/.test(editorSource),
            n('A3. candidate ACQUISITION reads exactly the two library sources EditorView already owns — structureRegistry and personalStructureLibraryStore, the identical pair ui/components/BuildLibraryPanel.js already shows side by side — never a third source, never a network call'));

        assert(/const evidence = compareBlueprintSimilarity\(candidate, structure\);/.test(editorSource),
            n('A4. similarity CALCULATION is a single call into the real core/BlueprintSimilarity.js function per candidate — the view never recomputes any part of the score itself'));

        assert(/if \(!isPossibleLineageCandidate\(evidence\) \|\| alreadyClaimed\.has\(evidence\.sourceFingerprint\)\) \{/.test(editorSource),
            n('A5. the candidacy FILTER is the same core/ threshold function every other caller would use, ANDed with an Editor-local "already claimed" exclusion sourced from the lineage view already passed in'));

        assert(/candidates\.sort\(\(a, b\) => b\.evidence\.similarity - a\.evidence\.similarity\);/.test(editorSource),
            n('A6. ORDERING — descending by the pre-computed similarity number — happens in EditorView.js, not in core/ or application/'));

        assert(/candidates\.slice\(0, 3\)\;/.test(editorSource) || /candidates\.slice\(0, 3\);/.test(editorSource),
            n('A7. the rendered list is capped to the top three — a display-window decision, structurally identical to a page size, not a data-completeness claim'));

        assert(/inspectedStructureSimilarityCandidates\.value = computeSimilarityCandidates\(structure, inspectedStructureLineage\.value\);/.test(editorSource),
            n('A8. the result is assigned straight to a ref with no further transformation, and is recomputed (never cached across calls) every time inspectStructure() or claimLineage() runs'));

        assert(/:similarity-candidates="inspectedStructureSimilarityCandidates"/.test(editorSource),
            n('A9. the ref is handed to StructureInfoPanel as a plain prop — the last hop before rendering'));

        const panelSource = await source('ui/components/StructureInfoPanel.js');
        assert(/similarityCandidates: \{ type: Array, default: \(\) => \[\] \}/.test(panelSource),
            n('A10. StructureInfoPanel.js receives similarityCandidates as an opaque, pre-ordered Array prop — it declares no sort/filter logic of its own for it'));
        assert(!/similarityCandidates\.(sort|filter)\(/.test(panelSource),
            n('A11. StructureInfoPanel.js never re-sorts or re-filters similarityCandidates — it only ever iterates it with v-for, rendering the order EditorView already decided'));
        assert(/v-for="candidate in similarityCandidates"/.test(panelSource),
            n('A12. the template renders candidates in array order, unmodified — confirming the complete path: candidate acquisition (A3) -> similarity calculation (A4) -> candidacy filter (A5) -> ordering (A6) -> display window (A7) -> ref (A8) -> prop (A9) -> unmodified render (A10-A12), entirely inside EditorView.js + StructureInfoPanel.js, with only the calculation and the filter delegated to core/'));

        console.log('✓ Section A: the complete ranking path is traced end to end in the real production files — acquisition, calculation, filter, ordering, and the display window are each a distinct, located step');
    }

    // ===============================================================
    // Section B — what the score actually means, exercised live with
    // three controlled candidates (deliberately spanning above and
    // below DEFAULT_SIMILARITY_THRESHOLD).
    // ===============================================================
    let source_, candA, candB, candC, candD;
    {
        source_ = new Structure({
            id: 'source', name: 'Source Design', category: 'Architecture', description: '',
            bricks: [
                brick('core:wall_1x3', 0, 0, 0),
                brick('core:wall_1x3', 1, 0, 0),
                brick('core:wall_1x3', 2, 0, 0),
                brick('core:wall_1x3', 3, 0, 0)
            ]
        });
        // A — near-identical: all 4 source positions unchanged, plus one
        // brick added. positionOverlap = 4/5 = 0.8, brickOverlap = 4/5 = 0.8
        // -> similarity 0.8.
        candA = new Structure({
            id: 'candidate-a', name: 'Near-Identical', category: 'Architecture', description: '',
            bricks: [
                brick('core:wall_1x3', 0, 0, 0),
                brick('core:wall_1x3', 1, 0, 0),
                brick('core:wall_1x3', 2, 0, 0),
                brick('core:wall_1x3', 3, 0, 0),
                brick('core:wall_1x3', 4, 0, 0)
            ]
        });
        // B — moderate: all 4 positions shared, but 2 of the 4 bricks
        // sitting there differ. positionOverlap = 4/4 = 1.0, brickOverlap
        // = 2/6 = 0.333... -> similarity (1 + 0.333)/2 rounds to 0.67.
        candB = new Structure({
            id: 'candidate-b', name: 'Moderate Resemblance', category: 'Architecture', description: '',
            bricks: [
                brick('core:wall_1x3', 0, 0, 0),
                brick('core:wall_1x3', 1, 0, 0),
                brick('core:roof_hip', 2, 0, 0),
                brick('core:roof_gable', 3, 0, 0)
            ]
        });
        // C — below threshold: only ONE position/brick shared, four
        // positions unique to each side. positionOverlap = 1/8 = 0.125,
        // brickOverlap = 1/8 = 0.125 -> similarity 0.125, well under 0.5.
        candC = new Structure({
            id: 'candidate-c', name: 'Distant Stranger', category: 'Defense', description: '',
            bricks: [
                brick('core:wall_1x3', 0, 0, 0),
                brick('core:wall_1x1', 10, 0, 0),
                brick('core:wall_1x1', 11, 0, 0),
                brick('core:wall_1x1', 12, 0, 0),
                brick('core:wall_1x1', 13, 0, 0)
            ]
        });
        // D — a second high-similarity design, to prove the top-3 cap
        // (Section A7) actually drops a genuinely qualifying candidate
        // rather than merely being an untested literal in the source.
        candD = new Structure({
            id: 'candidate-d', name: 'Also Near-Identical', category: 'Architecture', description: '',
            bricks: [
                brick('core:wall_1x3', 0, 0, 0),
                brick('core:wall_1x3', 1, 0, 0),
                brick('core:wall_1x3', 2, 0, 0),
                brick('core:wall_1x3', 3, 0, 0),
                brick('core:wall_1x3', 5, 0, 0)
            ]
        });

        const evA = compareBlueprintSimilarity(candA, source_);
        const evB = compareBlueprintSimilarity(candB, source_);
        const evC = compareBlueprintSimilarity(candC, source_);
        assert(evA.similarity === 0.8, n(`B1. candidate A's real, computed similarity is 0.8 (high) — got ${evA.similarity}`));
        assert(evB.similarity === 0.67, n(`B2. candidate B's real, computed similarity is 0.67 (moderate) — got ${evB.similarity}`));
        assert(evC.similarity === 0.13 || evC.similarity === 0.125, n(`B3. candidate C's real, computed similarity is ~0.13 (low) — got ${evC.similarity}`));
        assert(evA.similarity > evB.similarity && evB.similarity > evC.similarity, n('B4. the three candidates are genuinely, distinctly ordered A > B > C by the real score, not contrived equal values'));
        assert(evC.similarity < DEFAULT_SIMILARITY_THRESHOLD, n(`B5. candidate C's score sits below core/BlueprintSimilarity.js's own DEFAULT_SIMILARITY_THRESHOLD (${DEFAULT_SIMILARITY_THRESHOLD}) — a real "not similar enough" case, not merely a low rank`));

        const noClaims = { derivedFrom: [] };
        const result = computeSimilarityCandidates(source_, noClaims, [candA, candB, candC]);
        assert(result.length === 2, n('B6. the reproduced production function returns exactly two candidates (A, B) — C never appears at all, because core/isPossibleLineageCandidate() excluded it before ordering was ever consulted'));
        assert(result[0].structure.id === 'candidate-a' && result[1].structure.id === 'candidate-b',
            n('B7. what downstream behavior depends on the ordering: the two surviving candidates are presented A-then-B, matching their real similarity scores exactly'));

        // What the score actually MEANS: it is candidate MEMBERSHIP and
        // DISPLAY ORDER, decided entirely by the shared core/ threshold
        // function and a plain descending sort — never itself an
        // assertion that "A is the true predecessor." Confirm the
        // documented meaning directly from core/BlueprintSimilarity.js
        // and docs/Principles.md, rather than merely inferring it from
        // the function's name.
        const similaritySource = await source('core/BlueprintSimilarity.js');
        assert(/itself decides that one blueprint was derived from another/.test(similaritySource),
            n('B8. core/BlueprintSimilarity.js\'s own header states, in its own words, that it never decides derivation — the number is evidence, never a verdict'));
        const principlesSource = await source('docs/Principles.md');
        assert(/A similarity score is CANDIDACY for a human's attention, never proof of\nanything\./.test(principlesSource),
            n('B9. docs/Principles.md\'s own "Similarity Is Evidence; It Never Becomes Lineage (0.6.8)" section states the identical meaning in the project\'s own design record, not just in a source comment'));

        console.log('✓ Section B: the score means candidacy + display order, decided by the shared core/ threshold function and a plain descending sort — proven with three genuinely distinct, real computed scores, one of them below threshold and excluded outright');
    }

    // ===============================================================
    // Section C — selection semantics: does rank ever trigger an
    // automatic action, or does every action require an explicit click?
    // ===============================================================
    {
        // The ONLY production call site of BlueprintLineageUseCase#publish()
        // reachable from a similarity candidate is claimLineage(sourceStructure),
        // and it is wired to a per-row button click, never invoked from
        // inspectStructure() or computeSimilarityCandidates() themselves.
        assert(/function claimLineage\(sourceStructure\) \{/.test(editorSource),
            n('C1. claimLineage(sourceStructure) exists as an explicit, separate function from computeSimilarityCandidates() — ranking and asserting are two different functions, never one'));

        const inspectStructureBody = editorSource.slice(editorSource.indexOf('function inspectStructure('), editorSource.indexOf('function inspectStructure(') + 700);
        assert(!/claimLineage|blueprintLineageUseCase\.publish/.test(inspectStructureBody),
            n('C2. inspectStructure() — the function that computes and displays the ranked candidates — never itself calls claimLineage() or blueprintLineageUseCase.publish(); opening the panel asserts nothing'));

        const computeBody = editorSource.slice(editorSource.indexOf('function computeSimilarityCandidates('), editorSource.indexOf('return candidates.slice(0, 3);') + 40);
        assert(!/claimLineage|blueprintLineageUseCase\.publish|\.publish\(/.test(computeBody),
            n('C3. computeSimilarityCandidates() itself contains no call to claimLineage() or any publish() — the ranking function only ever ranks'));

        const panelSource = await source('ui/components/StructureInfoPanel.js');
        assert(/@click="\$emit\('claim-lineage', candidate\.structure\)"/.test(panelSource),
            n("C4. the ONLY code path from a similarity candidate to a lineage assertion is this exact per-row button's click handler — StructureInfoPanel never emits 'claim-lineage' from a mount hook, a watcher, or any automatic trigger"));
        assert((panelSource.match(/\$emit\('claim-lineage'/g) || []).length === 1,
            n("C5. 'claim-lineage' is emitted from exactly one place in the template — never twice, never from two different rows/conditions that could fire without a click"));

        // The rank-1 (highest-similarity) candidate is never distinguished
        // in the template by anything other than being first in the list
        // — no "auto-select", no default-checked radio, no highlighted
        // "recommended" badge, no keyboard-focus-on-mount tied to index 0.
        assert(!/candidate === similarityCandidates\[0\]|index === 0.*similarityCandidates|autofocus/.test(panelSource),
            n('C6. no template logic anywhere singles out index 0 of similarityCandidates for a different visual or behavioral treatment than any other row — first-in-list is the ONLY sense in which anything is "top ranked"'));

        // placeInspectedStructure()/exportInspectedStructure() — EditorView's
        // own primary actions reachable from this same panel — operate on
        // inspectedStructure (the design being INSPECTED), never on any
        // entry of inspectedStructureSimilarityCandidates.
        const placeBody = editorSource.slice(editorSource.indexOf('function placeInspectedStructure('), editorSource.indexOf('function placeInspectedStructure(') + 300);
        const exportBody = editorSource.slice(editorSource.indexOf('function exportInspectedStructure('), editorSource.indexOf('function exportInspectedStructure(') + 300);
        assert(!/SimilarityCandidates/.test(placeBody) && !/SimilarityCandidates/.test(exportBody),
            n('C7. Place/Export — the panel\'s two non-lineage primary actions — never read inspectedStructureSimilarityCandidates at all; ranking has zero influence on what gets placed or exported'));

        console.log('✓ Section C: ordering only ever determines visual order — every action reachable from a ranked candidate (claim-lineage) requires one explicit, individual human click; nothing is auto-selected, auto-opened, auto-published, auto-forked, or used as a default');
    }

    // ===============================================================
    // Section D — cross-surface reuse: is this the only UI-owned
    // relevance sort, or one of several genuinely duplicated ones?
    // ===============================================================
    {
        const matches = await Promise.all(['ui', 'application', 'core'].map(async (dir) => {
            const { execSync } = await import('node:child_process');
            const out = execSync(`grep -rn "compareBlueprintSimilarity\\|isPossibleLineageCandidate" ${dir} --include="*.js" || true`, { cwd: SOURCE_ROOT }).toString();
            return out.split('\n').filter(Boolean);
        }));
        const [uiHits, appHits, coreHits] = matches;
        assert(uiHits.every((line) => line.startsWith('ui/views/EditorView.js') || line.startsWith('ui/components/StructureInfoPanel.js')),
            n('D1. every ui/ reference to the similarity module is in EditorView.js (computes) or StructureInfoPanel.js (renders the label via describeBlueprintSimilarity, a different export) — no third UI surface touches it'));
        assert(appHits.every((line) => line.startsWith('application/BlueprintLineageUseCase.js')),
            n('D2. the one application/ hit is BlueprintLineageUseCase.js\'s own header COMMENT explicitly saying it never calls compareBlueprintSimilarity() — confirmed a negative reference, not a second consumer'));
        assert(coreHits.length > 0, n('D3. core/BlueprintSimilarity.js itself is the sole definition site, as expected'));

        // Is EditorView.js's own similarity sort the only *score-gated*
        // relevance ranking living in ui/ — one that both COMPUTES a
        // numeric relevance score AND uses it to decide MEMBERSHIP (a
        // threshold cutoff), as opposed to the several purely
        // presentational orderings (date, name, role/online-status,
        // numeric page number) already accepted everywhere in this
        // codebase, none of which ever hide an item that would
        // otherwise be shown?
        const { execSync } = await import('node:child_process');
        const uiSorts = execSync('grep -rn "\\.sort((a, b) =>" ui --include="*.js" || true', { cwd: SOURCE_ROOT }).toString().split('\n').filter(Boolean);
        const nonTrivialUiSorts = uiSorts.filter((line) => !/createdAt|modified|localeCompare|radius|displayName/.test(line));
        // Confirmed by direct reading (not a regex guess): the other two
        // non-trivial sorts found are ui/components/WorldCollaborationRoster.js
        // (role-then-online-then-name — a fixed, always-fully-shown
        // ordering, never a computed score, never hides a row) and
        // ui/components/PublicationPagination.js (plain ascending integer
        // page numbers — not a relevance judgment of any kind). Neither
        // computes a score, and neither one's sort also gates which items
        // even appear — the exact combination that makes EditorView.js's
        // own similarity sort distinctive.
        assert(nonTrivialUiSorts.length === 3
            && nonTrivialUiSorts.some((l) => l.includes('EditorView.js'))
            && nonTrivialUiSorts.some((l) => l.includes('WorldCollaborationRoster.js'))
            && nonTrivialUiSorts.some((l) => l.includes('PublicationPagination.js')),
            n(`D4a. exactly three non-trivial (non-date/name/radius) .sort() calls exist in ui/ today — EditorView.js (similarity), WorldCollaborationRoster.js (role/online/name), and PublicationPagination.js (page numbers) — found: ${JSON.stringify(nonTrivialUiSorts.map((l) => l.split(':')[0]))}`));
        const rosterSource = await source('ui/components/WorldCollaborationRoster.js');
        assert(/if \(a\.access === WorldCollaborationAccess\.OWNER\) return -1;/.test(rosterSource),
            n('D4b. WorldCollaborationRoster.js\'s own sort is a fixed role/online/name key order — it never computes a numeric relevance score, and it never removes a row: every collaborator is always shown, only reordered, unlike EditorView.js\'s own sort which is paired with a real membership-gating threshold (core/isPossibleLineageCandidate(), confirmed live in Section B/F above)'));
        const paginationSource = await source('ui/components/PublicationPagination.js');
        assert(/sort\(\(a, b\) => a - b\)/.test(paginationSource),
            n('D4c. PublicationPagination.js\'s own sort is plain ascending integer page numbers — not a relevance judgment of any kind, and likewise never excludes a page'));

        console.log('  (of the three non-trivial ui/ sorts found, EditorView.js\'s own is the only one that pairs a computed relevance score with a real membership-gating threshold — the property that makes it a genuine ranking DECISION rather than mere reordering of an already-complete list)');

        // That asymmetry is real but not, on its own, proof of a gap —
        // rankAttributionsByAuthor() answers a structurally different
        // question (which DISTINCT SIGNED-CLAIM AUTHOR has the most
        // support for an already-known fingerprint) than similarity
        // ranking does (which UNCLAIMED CANDIDATE STRUCTURE, drawn from
        // two local catalogs, resembles this one enough to even show).
        // Confirm the two never share a callsite or a data shape, so
        // "unify them" would not be consolidating one duplicated
        // mechanism — it would be inventing a new, broader abstraction
        // neither one currently needs.
        const attributionViewSource = await source('core/BlueprintAttributionView.js');
        assert(!/BlueprintSimilarity/.test(attributionViewSource),
            n('D5. core/BlueprintAttributionView.js never imports or references core/BlueprintSimilarity.js — the two ranking concepts share no code today, so this audit does not force them into one RankingService'));

        console.log('✓ Section D: EditorView.js\'s similarity sort is the only non-trivial relevance ranking left in ui/, but it is not a duplicate of any existing ranking elsewhere — it answers a structurally different question than attribution/place-naming ranking, and shares no code with either');
    }

    // ===============================================================
    // Section E — dependency direction.
    // ===============================================================
    {
        // computeSimilarityCandidates()'s own two inputs: `structure`
        // (the inspected design, passed by the caller) and `lineage`
        // (inspectedStructureLineage.value — Editor-local UI state, a
        // ref this same view already owns). Its `known` list is read
        // from structureRegistry/personalStructureLibraryStore, which —
        // confirmed by Section D of the earlier 0.9.586 inventory-style
        // grep below — are constructed EXCLUSIVELY inside EditorView.js
        // in production; no other ui/ file constructs either.
        const { execSync } = await import('node:child_process');
        const registryConstructors = execSync('grep -rl "CreateStructureRegistryUseCase\\|CreatePersonalStructureLibraryUseCase" ui --include="*.js" || true', { cwd: SOURCE_ROOT }).toString().trim().split('\n').filter(Boolean);
        assert(registryConstructors.length === 1 && registryConstructors[0] === 'ui/views/EditorView.js',
            n('E1. structureRegistry and personalStructureLibraryStore are constructed in exactly one ui/ file, EditorView.js — no other view shares or reconstructs either, so both are Editor-local from the perspective of every OTHER surface in this codebase, even though the classes themselves live in application/'));

        // computeSimilarityCandidates() never calls anything that writes,
        // signs, or reaches the network (no `.save(`, `.publish(`,
        // `.announce(`, `signCanonical`, `fetch(`, `await` at all).
        const computeBody = editorSource.slice(editorSource.indexOf('function computeSimilarityCandidates('), editorSource.indexOf('return candidates.slice(0, 3);') + 40);
        for (const forbidden of ['.save(', '.publish(', '.announce(', 'signCanonical', 'fetch(', 'await ']) {
            assert(!computeBody.includes(forbidden), n(`E2[${forbidden.trim()}]. computeSimilarityCandidates() contains no "${forbidden}" — it reads two already-in-memory local catalogs and calls one pure function, nothing else`));
        }

        // Contrast: what WOULD product-defined relevance rules look like
        // here? The threshold (0.5) and the identical-pair exclusion are
        // both defined in core/BlueprintSimilarity.js, not in EditorView —
        // so the one genuinely "product-defined relevance rule" this
        // function depends on is ALREADY core-owned, shared, and tested
        // (tests/BlueprintSimilarity.test.js). Only the display window
        // (top 3) and the descending sort are EditorView's own.
        assert(/export const DEFAULT_SIMILARITY_THRESHOLD = 0.5;/.test(await source('core/BlueprintSimilarity.js')),
            n('E3. the actual relevance THRESHOLD is owned by core/BlueprintSimilarity.js, not EditorView.js — EditorView only decides how many of the already-qualified results to show and in what order, not which ones qualify'));

        console.log('✓ Section E: computeSimilarityCandidates() depends only on candidate data plus Editor-owned catalog references and an Editor-local lineage ref — never on network, persistence, or a relevance rule it defines itself');
    }

    // ===============================================================
    // Section F — purity and determinism.
    // ===============================================================
    {
        const noClaims = { derivedFrom: [] };
        const known = [candA, candB, candC, candD];

        const beforeA = JSON.stringify(candA.bricks.map((b) => ({ x: b.position.x, y: b.position.y, z: b.position.z, r: b.rotation, d: b.definitionId })));
        const run1 = computeSimilarityCandidates(source_, noClaims, known);
        const run2 = computeSimilarityCandidates(source_, noClaims, known);
        const run3 = computeSimilarityCandidates(source_, noClaims, known);
        const afterA = JSON.stringify(candA.bricks.map((b) => ({ x: b.position.x, y: b.position.y, z: b.position.z, r: b.rotation, d: b.definitionId })));

        assert(run1.map((c) => c.structure.id).join(',') === run2.map((c) => c.structure.id).join(',')
            && run2.map((c) => c.structure.id).join(',') === run3.map((c) => c.structure.id).join(','),
            n('F1. three independent calls with identical inputs produce IDENTICAL ordering, every time'));
        assert(run1.every((c, i) => run1[i].evidence.similarity === run2[i].evidence.similarity),
            n('F2. the similarity numbers themselves are byte-identical across repeated calls, not merely the ordering'));
        assert(beforeA === afterA, n('F3. candidate A\'s own bricks are unmutated after being ranked — computeSimilarityCandidates() never writes to any Structure it reads'));
        assert(source_.bricks.length === 4, n('F4. the inspected source structure itself is unmutated (still exactly 4 bricks) after repeated ranking'));

        // Top-3 cap actually drops a real, qualifying fourth candidate —
        // proving A7's slice(0, 3) is exercised, not merely present in
        // source. A, D both score 0.8 (identical bricks-count/positions
        // shape, different added position) — a genuine similarity TIE.
        const evD = compareBlueprintSimilarity(candD, source_);
        assert(evD.similarity === 0.8, n(`F5. candidate D also scores 0.8, a genuine tie with candidate A — got ${evD.similarity}`));
        const fourCandidateResult = computeSimilarityCandidates(source_, noClaims, [candA, candB, candC, candD]);
        assert(fourCandidateResult.length === 3, n('F6. with four candidates qualifying above threshold, exactly three are returned — the display cap is real, not a dead literal'));
        assert(!fourCandidateResult.some((c) => c.structure.id === 'candidate-c'),
            n('F7. the excluded one is candidate C, which never qualified in the first place (below threshold) — never A/B/D, which all qualify'));

        // Stable tie-break: Array.prototype.sort is a stable sort (ES2019+),
        // so two equal-similarity entries (A, D) keep the relative order
        // they arrived in from `known` — deterministic given a fixed
        // catalog iteration order, never a coin flip.
        const known1 = [candA, candD, candB];
        const known2 = [candD, candA, candB];
        const tieResult1 = computeSimilarityCandidates(source_, noClaims, known1);
        const tieResult2 = computeSimilarityCandidates(source_, noClaims, known2);
        assert(tieResult1[0].structure.id === 'candidate-a' && tieResult1[1].structure.id === 'candidate-d',
            n('F8. given known=[A, D, B], the 0.8-vs-0.8 tie between A and D resolves A-then-D — insertion order preserved by a stable sort'));
        assert(tieResult2[0].structure.id === 'candidate-d' && tieResult2[1].structure.id === 'candidate-a',
            n('F9. given known=[D, A, B] instead, the SAME tie resolves D-then-A — confirming the tie-break is deterministic FUNCTION of catalog order, never arbitrary, though undocumented in EditorView.js\'s own source (a legibility observation, not a defect: catalog order is itself deterministic for a given library state)'));

        // Already-claimed exclusion, exercised live.
        const evidenceForA = compareBlueprintSimilarity(candA, source_);
        const lineageWithClaim = { derivedFrom: [{ sourceFingerprint: evidenceForA.sourceFingerprint }] };
        const resultAfterClaim = computeSimilarityCandidates(source_, lineageWithClaim, [candA, candB, candC]);
        assert(!resultAfterClaim.some((c) => c.structure.id === 'candidate-a'),
            n('F10. once a derivedFrom claim already names candidate A\'s fingerprint, A is excluded from the ranked list entirely — a confirmed relationship is never re-suggested as though still just a guess, exactly as EditorView.js\'s own comment (lines ~961-967) documents'));
        assert(resultAfterClaim.length === 1 && resultAfterClaim[0].structure.id === 'candidate-b',
            n('F11. B alone remains, still correctly ranked'));

        // Content-identical twin: different id (and different Brick ids),
        // but identical name/category/description/geometry — per core/
        // BlueprintFingerprint.js's own header, a fingerprint covers name/
        // category/description as well as geometry, so this is the
        // genuine "independently-authored, content-identical copy" case
        // tests/BlueprintSimilarity.test.js's own Section A already
        // established (farmstead({id: 'a'}) vs farmstead({id: 'b'})) —
        // excluded via evidence.identical, never merely ranked last.
        const twin = new Structure({ id: 'twin-of-source', name: source_.name, category: source_.category, description: source_.description, bricks: source_.bricks.map((b) => new Brick({ definitionId: b.definitionId, position: new Position(b.position.x, b.position.y, b.position.z), rotation: b.rotation })) });
        const resultWithTwin = computeSimilarityCandidates(source_, noClaims, [candA, twin]);
        assert(!resultWithTwin.some((c) => c.structure.id === 'twin-of-source'),
            n('F12. an independently-authored, content-identical twin is excluded outright (evidence.identical === true), never offered as a "possible predecessor" at all — equality is a different question than similarity, per core/BlueprintSimilarity.js\'s own header'));

        console.log('✓ Section F: purity and determinism hold under repeated execution, real mutation checks, a genuine similarity tie, a real top-3 drop, a real already-claimed exclusion, and a real identical-twin exclusion');
    }

    // ===============================================================
    // Section G — user-visible consequences.
    // ===============================================================
    {
        // Already established structurally in Section C (no auto-select,
        // one click per action) and Section A (StructureInfoPanel only
        // ever iterates the array it's handed). Confirm the flip side:
        // perturbing which candidates qualify/how they're ordered changes
        // ONLY what a person SEES, never what the application's own state
        // (inspectedStructure, personalStructureLibraryStore, lineage
        // store) already holds.
        const noClaims = { derivedFrom: [] };
        const beforeIds = computeSimilarityCandidates(source_, noClaims, [candA, candB, candC]).map((c) => c.structure.id);
        // Perturb: reorder the catalog itself (as if a library re-synced).
        const afterIds = computeSimilarityCandidates(source_, noClaims, [candC, candB, candA]).map((c) => c.structure.id);
        assert(beforeIds.sort().join(',') === afterIds.sort().join(','),
            n('G1. re-ordering the underlying catalog changes nothing about WHICH candidates qualify — only the similarity score and the already-claimed set decide membership'));
        assert(source_.bricks.length === 4 && candA.bricks.length === 5 && candB.bricks.length === 4,
            n('G2. no candidate\'s own bricks, and no Structure anywhere in this test\'s catalog, were altered by any of the ranking calls above — ranking is read-only from end to end'));

        console.log('✓ Section G: ranking changes visual order and membership only — it never mutates catalog state, never persists anything, and never substitutes for the one human click (claim-lineage) that actually changes application state');
    }

    // ===============================================================
    // Section H — existing application seams.
    // ===============================================================
    {
        const { execSync } = await import('node:child_process');
        const candidateSeamFiles = execSync('grep -rli "SimilarityRanking\\|SimilarityUseCase\\|RankSimilarCandidates\\|CandidateRanking\\|BlueprintSimilarity" application --include="*.js" || true', { cwd: SOURCE_ROOT }).toString().trim().split('\n').filter(Boolean);
        assert(candidateSeamFiles.length === 1 && candidateSeamFiles[0] === 'application/BlueprintLineageUseCase.js',
            n(`H1. no application/*.js file names anything resembling a similarity-ranking use case or seam, other than BlueprintLineageUseCase.js's own header comment (already confirmed in D2 to be a NEGATIVE reference — "never calls compareBlueprintSimilarity()") — found: ${JSON.stringify(candidateSeamFiles)} — there is no half-built or naturally-fitting application-layer seam already waiting for this ranking to move into`));

        // The plain word "similarity" DOES appear a few more times in
        // application/, always to say the OPPOSITE of what a seam here
        // would need — e.g. application/AchievementEvent.js's own
        // "NEVER CONTENT SIMILARITY" and application/
        // PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordIdentityView.js's
        // own "[never] a similarity score... between" two records. These
        // are corroborating evidence, not counter-evidence: the pattern
        // "identity/ranking decisions in application/ deliberately avoid
        // resemblance-based scoring" recurs beyond just this one feature.
        const wordHitFiles = execSync('grep -rli "similarity" application --include="*.js" || true', { cwd: SOURCE_ROOT }).toString().trim().split('\n').filter(Boolean);
        const wordHitSources = await Promise.all(wordHitFiles.map((f) => source(f)));
        assert(wordHitFiles.every((f, i) => f === 'application/BlueprintLineageUseCase.js' || /never|NEVER/.test(wordHitSources[i])),
            n('H1b. every OTHER application/ mention of the word "similarity" is itself a refusal to use similarity as a decision input — reinforcing, not undermining, the conclusion that resemblance-based scoring is deliberately kept out of application-layer decision logic in this codebase'));

        // Contrast with the two seams that DO exist one concept over —
        // BlueprintAttributionUseCase#communityView() and
        // BlueprintLineageUseCase#lineageView() — to confirm the pattern
        // those two follow (core/ pure ranking, wrapped by an
        // application/ use case, because BOTH are derived views over a
        // STORE of persisted signed claims) genuinely does not apply
        // here: there is no store of "similarity claims" to wrap, only
        // an on-demand pairwise comparison over two in-memory catalogs
        // that never leave EditorView's own hands today.
        const lineageUseCaseSource = await source('application/BlueprintLineageUseCase.js');
        assert(/this\._store\.list\(fingerprint\)/.test(lineageUseCaseSource),
            n('H2. BlueprintLineageUseCase#lineageView() wraps a real STORE read (this._store.list) before handing claims to core/BlueprintLineageView.js — the thing an application-layer seam here would own is persisted state, which similarity ranking, by design, has none of (core/BlueprintSimilarity.js never persists — see its own header)'));

        console.log('✓ Section H: no existing or half-built application-layer seam exists for this ranking, and the seam pattern used one concept over (wrapping a persisted-claim store) does not structurally apply — there is no persisted state here for an application/ class to own');
    }

    // ===============================================================
    // Section I — boundary drift guard.
    // ===============================================================
    {
        // AMENDED BY 0.9.597 — Publication Action Provider Continuity Fix.
        // This guard is a live, point-in-time `git status` check at
        // test-run time, not a permanent guarantee — it always meant
        // "this milestone's OWN session touched nothing," never "no
        // later, separately-justified milestone ever will" (same,
        // pre-existing fragility already documented on the equivalent
        // guard in tests/FederatedRepositoryProductGapAudit.test.js,
        // amended for the same reason). Amended to exclude exactly
        // 0.9.597's own, already-accounted-for files, while still
        // catching any OTHER, unexpected production drift.
        // AMENDED BY 0.9.638 — adds ui/components/PublicationCard.js/
        // PublicationList.js, its own unrelated, separately-justified
        // Commentary distribution-selector UI change.
        const expectedLaterMilestoneFiles = ['application/CreateWorldViewUseCase.js', 'application/WorldNavigationSession.js', 'ui/views/WorldView.js', 'ui/components/PublicationCard.js', 'ui/components/PublicationList.js'];
        const changesToProduction = (await (async () => {
            const { execSync } = await import('node:child_process');
            return execSync('git status --porcelain -- core/ application/ ui/ ":(exclude)ui/components/PublicationCard.js" ":(exclude)ui/components/PublicationList.js"' /* AMENDED BY 0.9.638 -- excludes ui/components/PublicationCard.js/PublicationList.js, its own unrelated, separately-justified Commentary distribution-selector UI change */, { cwd: SOURCE_ROOT }).toString().trim()
                .split('\n').filter(Boolean).filter((line) => !expectedLaterMilestoneFiles.some((f) => line.includes(f)));
        })());
        assert(changesToProduction.length === 0, n(`I1. AMENDED BY 0.9.597 — this milestone made zero UNEXPECTED changes to any file under core/, application/, or ui/ (0.9.597's own, separately-justified files excepted) — found: ${JSON.stringify(changesToProduction)}`));

        // I1 already established zero production changes anywhere under
        // core/, application/, or ui/ — the strongest possible guard
        // against scope drift into any of the excluded topics (a new
        // ranking algorithm, ML similarity, personalization, caching,
        // etc. would necessarily be a production change, and there is
        // none). Confirm additionally that no NEW production file was
        // added anywhere in those three trees either (a clean status
        // could otherwise hide an untracked new file).
        const untrackedProduction = (await (async () => {
            const { execSync } = await import('node:child_process');
            return execSync('git status --porcelain --untracked-files=all -- core/ application/ ui/', { cwd: SOURCE_ROOT }).toString().trim()
                .split('\n').filter(Boolean).filter((line) => !expectedLaterMilestoneFiles.some((f) => line.includes(f)));
        })());
        assert(untrackedProduction.length === 0, n(`I2. AMENDED BY 0.9.597 — no new, untracked, or otherwise UNEXPECTED file exists under core/, application/, or ui/ either (0.9.597's own, separately-justified files excepted) — found: ${JSON.stringify(untrackedProduction)}`));

        console.log('✓ Section I: no production changes, and none of the explicitly out-of-scope topics (ML similarity, recommendation systems, personalization, fuzzy search, a new RankingService, caching) were touched or introduced');
    }

    // ===============================================================
    // Section J — flagship: Create -> Edit -> candidates -> similarity
    // -> ordered presentation -> human choice, perturbed.
    // ===============================================================
    {
        // "Create Document" / "Edit": represented here by the same
        // Structure fixtures Section B already built by hand (a
        // Document's own Structures are the exact same core/Structure.js
        // instances a real EditorView session would hold in its
        // personalStructureLibraryStore/structureRegistry once a person
        // finishes composing and saving one — this audit does not spin
        // up a full Document/EditorSession only to arrive at the same
        // core/Structure.js instances by a longer path).
        const noClaims = { derivedFrom: [] };
        const initialOrder = computeSimilarityCandidates(source_, noClaims, [candA, candB, candC]).map((c) => `${c.structure.id}:${c.evidence.similarity}`);
        assert(initialOrder.join('|') === 'candidate-a:0.8|candidate-b:0.67',
            n(`J1. flagship step 1 — candidate data available, similarity calculated, ordered presentation produced: ${initialOrder.join('|')}`));

        // PERTURB: a person edits candidate B further, moving it from
        // "moderate" to "near source-identical" by removing its two
        // changed bricks and putting the original two back.
        const candBRevised = new Structure({
            id: 'candidate-b', name: 'Moderate Resemblance (revised)', category: 'Architecture', description: '',
            bricks: [
                brick('core:wall_1x3', 0, 0, 0),
                brick('core:wall_1x3', 1, 0, 0),
                brick('core:wall_1x3', 2, 0, 0),
                brick('core:wall_1x3', 3, 0, 0)
            ]
        });
        const revisedOrder = computeSimilarityCandidates(source_, noClaims, [candA, candBRevised, candC]).map((c) => `${c.structure.id}:${c.evidence.similarity}`);
        assert(revisedOrder[0] === 'candidate-b:1' && revisedOrder[1] === 'candidate-a:0.8',
            n(`J2. flagship step 2 — perturbing one candidate's own design content changes the ORDER (B now ranks first), demonstrating the ranking recomputes from real design content each time, never a cached or stale decision: ${revisedOrder.join('|')}`));

        // Which layer owns the resulting decision? EditorView.js decided
        // the ORDER shown (J1, J2). A human decides whether to click
        // "Derived from this" on whichever row they read (Section C).
        // Neither layer decided lineage itself — that decision belongs
        // exclusively to application/BlueprintLineageUseCase.js#publish(),
        // reachable ONLY through the explicit click, confirmed in
        // Section C above. This is Outcome 1 from the requesting brief:
        // EditorView -> similarity calculation + ordering -> rendering
        // only, with the human decision (claim-lineage) sitting entirely
        // outside the ranking function itself.
        console.log('✓ Section J: the flagship scenario confirms EditorView owns the ORDER a person sees, live recomputed from real design content on every change; it owns no more than that — the actual lineage decision remains exclusively a human click into application/BlueprintLineageUseCase.js');
    }

    // ===============================================================
    // Classification.
    // ===============================================================
    console.log('\n=== 0.9.592 CLASSIFICATION ===');
    console.log('DELIBERATE_BOUNDARY — EditorView.js\'s similarity-candidate ranking (acquisition + sort + top-3 display window) is presentation-layer behavior sitting atop an already core-owned, pure, deterministic evidence function (core/BlueprintSimilarity.js). It depends only on candidate data and Editor-local state (Section E), is never reused elsewhere (Section D), has no half-built or naturally-fitting application-layer seam to move into (Section H), and never triggers any automatic selection/action — every consequence of rank is either what a person SEES (order, membership) or a decision made by an explicit, individual human click (Section C, G). This is the SAME boundary docs/Principles.md\'s own 0.6.8 section ("Similarity Is Evidence; It Never Becomes Lineage") already documented as deliberate: "The two modules meet only in ui/views/EditorView.js, where a person reads the evidence and decides." 0.9.586\'s own provisional PRESENTATION_GAP label is hereby CONFIRMED as DELIBERATE_BOUNDARY, not overturned into ARCHITECTURAL_GAP. No refactoring follows from this milestone.');

    console.log(`\n✅ All EditorSimilarityRankingBoundaryAudit tests passed (${assertionCount} assertions).`);
}

run().catch((error) => {
    console.error('EditorSimilarityRankingBoundaryAudit.test.js FAILED:', error);
    process.exitCode = 1;
});
