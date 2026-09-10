import { readFile } from 'node:fs/promises';

import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import { WorldViewNavigationState, WorldViewPrimaryMode } from '../application/WorldViewNavigationState.js';

// 0.9.359 — World View Main-Screen Clutter Product Audit.
//
// TEST-ONLY. ZERO PRODUCTION CHANGES. Every file this audit reads is real
// and unmodified; this file characterizes what it finds and recommends a
// verdict per candidate — it relocates nothing itself, exactly like every
// "product audit"/"product direction audit" milestone this repository has
// already run (0.9.326's own Post-Diagnostic Product Evolution
// Reassessment, 0.9.351's own Proactive Publication Discovery Product
// Direction Audit).
//
// FRAMING. The task explicitly forbids treating "declutter World View" as a
// UI refactor and instead asks for a product audit of INDIVIDUAL controls,
// classified by semantic purpose (everyday / contextual / diagnostic),
// never by which section of the template they happen to live in. Three
// named candidates — Discover Publication, Snapshot Distribution, Content
// Comparison — are audited independently; "these are all World Encounter
// features, therefore they all move" is the one reasoning shape this file
// exists to refuse (Section H).
//
// TEN SECTIONS, mirroring the milestone brief's own lettering:
//
//   A. Current primary-surface inventory — every real World View entry
//      point, traced to its actual v-if/component-mount gate, never a
//      screenshot or a guess.
//   B. User-journey frequency semantics — for each candidate: is it needed
//      to navigate, to encounter ordinary content, to interact with
//      ordinary Publications, or is it manual inspection/recovery?
//   C. Alternative entry-point availability — does an existing or narrowly
//      constructible secondary surface already preserve access?
//   D. Diagnostic-tool classification — manual discovery / recovery /
//      inspection / distribution / comparison, named explicitly.
//   E. Existing product arcs — every candidate traced back to the
//      completed arc that built it, including the one arc (0.9.324-0.9.326,
//      "Diagnostic Tools Surface") that already performed exactly this kind
//      of relocation once, for a different control.
//   F. Cross-surface reachability — the underlying command/capability a
//      relocation would move is proven independent of its template
//      location, so no capability is lost by moving markup.
//   G. Recovery semantics — moving a control off the main surface must not
//      silently remove the one recovery path that justified keeping it.
//   H. Artificial-symmetry check — explicitly rejects "same section,
//      therefore same verdict."
//   I. Candidate decision matrix.
//   J. Final UX decision, per candidate, plus this milestone's own verdict.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function escapeRegExp(literal) {
    return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Proves a specific v-if CONDITION is the gate on the div carrying a
// specific CSS class — an exact match on `<div v-if="CONDITION" class="CLASS">`,
// never a windowed guess. Deliberately anchored this precisely because
// v-if always precedes class in this file's own markup: a forward-only
// slice starting AT the class name would miss the v-if text that comes
// BEFORE it in the same opening tag, and a backward-looking window risks
// pulling in an unrelated PRECEDING element's own prose comment instead
// (several of which literally contain the word "selectedEncounter" in
// English sentences, not markup) — this exact-tag regex has neither
// failure mode.
function divGatedOn(source, condition, cssClass) {
    const pattern = new RegExp(`<div v-if="${escapeRegExp(condition)}" class="${escapeRegExp(cssClass)}">`);
    return pattern.test(source);
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

async function codeOnlySource(relativePath) {
    const text = await rawSource(relativePath);
    return text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

// A plain forward-only slice, safe ONLY when the marker pattern's own
// match position sits BEFORE everything the assertion needs to see (never
// used to look for text that precedes the marker in source order).
function sliceForward(source, markerPattern, maxLength) {
    const match = markerPattern.exec(source);
    assert(match, `sliceForward: pattern ${markerPattern} not found`);
    return source.slice(match.index, match.index + maxLength);
}

async function run() {
    const worldViewSource = await rawSource('ui/views/WorldView.js');
    const canvasSource = await rawSource('ui/components/WorldEncounterCanvas.js');
    const ownPanelSource = await rawSource('ui/components/OwnPublicationPanel.js');
    const canvasCodeOnly = await codeOnlySource('ui/components/WorldEncounterCanvas.js');

    // ===============================================================
    // Section A — Current primary-surface inventory.
    // ===============================================================
    {
        // A1. The default primary mode is EXPLORE, and the "World
        // Encounters" collapsible section defaults to NOT collapsed — so a
        // Wanderer sees World Encounters, unprompted, on first paint. This
        // is the concrete fact that makes "primary entry point on the
        // everyday surface" a real question rather than a hypothetical one:
        // whatever renders inside World Encounters is the DEFAULT surface,
        // not an opt-in one.
        const nav = new WorldViewNavigationState();
        assert(nav.primaryMode === WorldViewPrimaryMode.EXPLORE, 'A1. WorldViewNavigationState defaults to EXPLORE');
        assert(nav.isSectionCollapsed('explore:world-encounters', false) === false,
            'A1. the World Encounters CollapsibleSection defaults to expanded (isSectionCollapsed(..., false) with nothing persisted)');

        // A2. WorldEncounterCanvas — and therefore everything it renders,
        // Discover Publication included — is mounted ONLY inside the
        // EXPLORE-mode branch, inside a CollapsibleSection titled "World
        // Encounters." It is not reachable from Map or Places mode. (The
        // real distance between these two markers is ~17.9K characters —
        // measured directly, not guessed — hence the generous window.)
        const explorerBlock = sliceForward(worldViewSource, /primaryMode === WorldViewPrimaryMode\.EXPLORE/, 20000);
        assert(explorerBlock.includes('<WorldEncounterCanvas'), 'A2. WorldEncounterCanvas is mounted inside the EXPLORE-mode block');
        assert(explorerBlock.includes('title="World Encounters"'), 'A2. WorldEncounterCanvas is wrapped in a CollapsibleSection titled "World Encounters"');

        // A3. OwnPublicationPanel is mounted unconditionally whenever a
        // World is loaded (v-if="cameraPosition" alone) — independent of
        // primaryMode, unlike WorldEncounterCanvas. It is a SEPARATE
        // standing surface, not a member of the World Encounters section at
        // all — see ui/components/OwnPublicationPanel.js's own 0.9.140
        // header, "never inside the Explore-mode 'World Encounters'
        // section below."
        assert(/<OwnPublicationPanel\s+v-if="cameraPosition"/.test(worldViewSource),
            'A3. OwnPublicationPanel mounts on v-if="cameraPosition" alone, independent of primaryMode');

        // A4. The always-visible top-level toolbar (gated only on
        // cameraPosition, present in every primaryMode): Home and
        // Notifications carry no further v-if; Locations gates on
        // activeDocumentInfo alone (still independent of primaryMode/
        // selection); Explore/Map/Places are the mode switch itself.
        const navRow = sliceForward(worldViewSource, /world-view-actions--navigation/, 1200);
        assert(/@click="goHome"[^>]*>Home</.test(navRow), 'A4. Home is present, ungated beyond the row\'s own cameraPosition wrapper');
        assert(/>Notifications</.test(navRow), 'A4. Notifications is present in the always-visible navigation row');
        assert(/v-if="activeDocumentInfo"[\s\S]{0,250}>Locations</.test(navRow), 'A4. Locations gates on activeDocumentInfo, not on primaryMode or selection');

        console.log('✓ Section A: World View\'s real inventory traced to source — EXPLORE + expanded World Encounters is the DEFAULT surface; OwnPublicationPanel is a separate always-mounted surface; Home/Notifications/Locations/Explore/Map/Places are the standing toolbar');
    }

    // ===============================================================
    // Section B — User-journey frequency semantics, per candidate.
    // ===============================================================
    {
        // --- Candidate 1: Discover Publication ---
        // B1. Its panel gates on discoveryCommand ALONE — an exact match on
        // its own opening tag, not a windowed guess — the ONE panel in this
        // file's own template explicitly documented as "entirely
        // independent of selectedEncounter" (see this file's own 0.9.111
        // header, "a discovered Publication is never a marker").
        assert(divGatedOn(canvasSource, 'discoveryCommand', 'world-encounter-discovery-panel'),
            'B1. Discover Publication\'s panel gates on discoveryCommand alone');

        // B2. Live proof, one layer down: discoverPublication()'s own method
        // body never reads this.selectedEncounter either, and never touches
        // navigation state — the panel's independence is not a template
        // accident, the ACTION itself has no selection dependency and is
        // not part of ordinary navigation.
        const discoverPublicationBody = sliceForward(canvasCodeOnly, /discoverPublication\(\)\s*\{/, 900);
        assert(!discoverPublicationBody.includes('selectedEncounter'), 'B2. discoverPublication()\'s own method body never reads selectedEncounter');
        assert(!/goHome|goToGeographicPlace|focusLocationFromPanel/.test(discoverPublicationBody),
            'B3. discoverPublication() never touches navigation state — never required to navigate');

        // --- Candidate 2: Snapshot Distribution (two independent surfaces) ---
        // B4. WorldEncounterCanvas's OWN copy — Distribute Publication /
        // Distribute Snapshot / Discover Snapshot — gates on
        // `selectedEncounter && selectedEncounter.kind === 'PUBLICATION'`
        // for every one of its three panels: this is a CONTEXTUAL action,
        // reachable only after a Publication marker has already been
        // selected, never a standing main-screen control.
        assert(divGatedOn(canvasSource, "selectedEncounter && selectedEncounter.kind === 'PUBLICATION' && distributionLifecycleStore", 'world-encounter-distribution-panel'),
            'B4. Distribute Publication (WorldEncounterCanvas) gates on a selected PUBLICATION encounter');
        assert(divGatedOn(canvasSource, "selectedEncounter && selectedEncounter.kind === 'PUBLICATION' && snapshotDistributionCommand", 'world-encounter-snapshot-distribution-panel'),
            'B4. Distribute Snapshot (WorldEncounterCanvas) gates on a selected PUBLICATION encounter');
        assert(divGatedOn(canvasSource, "selectedEncounter && selectedEncounter.kind === 'PUBLICATION' && discoverSnapshotCommand", 'world-encounter-snapshot-discovery-panel'),
            'B4. Discover Snapshot (WorldEncounterCanvas) gates on a selected PUBLICATION encounter');

        // B5. OwnPublicationPanel's OWN copy — Distribute Snapshot /
        // Distribute Publication / Export Snapshot / Check Snapshot Match /
        // Unpublish — carries NO selection gate of any kind: each renders
        // whenever its own command prop is supplied, merely DISABLED while
        // there is no local publication yet. This is the standing,
        // always-rendered surface the milestone brief is actually asking
        // about for this candidate.
        assert(/:disabled="!publication \|\| snapshotDistributionExecuting"[\s\S]{0,40}@click="distributeOwnSnapshot"/.test(ownPanelSource),
            'B5. OwnPublicationPanel\'s Distribute Snapshot has no v-if beyond its command-prop gate — always rendered, merely disabled');
        assert(!/v-if="[^"]*selectedEncounter/.test(ownPanelSource),
            'B5. OwnPublicationPanel never gates any v-if on selectedEncounter — it is a standing surface, not a contextual one (the word appears only in three unrelated // comments, confirmed separately)');

        // --- Candidate 3: Content Comparison ---
        // B6. Both the Compare panel and the Content Comparison panel gate
        // on selection-derived state: selectedPublicationComparisonCandidate
        // (itself null unless a resolved PUBLICATION is currently selected)
        // and comparisonEncounter (null until the Wanderer has explicitly
        // armed comparison AND clicked a second marker). Neither panel can
        // render at rest.
        assert(divGatedOn(canvasSource, 'selectedPublicationComparisonCandidate', 'world-snapshot-comparison-panel'),
            'B6. Compare panel gates on selectedPublicationComparisonCandidate');
        assert(divGatedOn(canvasSource, 'comparisonEncounter', 'world-snapshot-content-comparison-panel'),
            'B6. Content Comparison panel gates on comparisonEncounter');

        // B7. Live proof: distributablePublication (the same underlying
        // gate the comparison candidate is derived from) returns null with
        // no selection in scope — a fresh WorldEncounterCanvas instance
        // shows Content Comparison genuinely cannot render at rest.
        const restCtx = { selectedEncounter: null, materialInspection: null };
        const distributable = WorldEncounterCanvas.computed.distributablePublication.call(restCtx);
        assert(distributable === null, 'B7. distributablePublication is null with no selection — the comparison/distribution surfaces are genuinely unreachable at rest without a prior selection');

        console.log('✓ Section B: Discover Publication is a standing, selection-independent action; WorldEncounterCanvas\'s Snapshot Distribution copy is genuinely contextual while OwnPublicationPanel\'s copy is genuinely standing; Content Comparison is genuinely unreachable without a prior selection');
    }

    // ===============================================================
    // Section C — Alternative entry-point availability.
    // ===============================================================
    let discoverPublicationOccurrences;
    let compareOccurrences;
    {
        // C1. Discover Publication: exactly ONE occurrence of this feature
        // anywhere in WorldEncounterCanvas.js — no existing secondary
        // surface to fall back on. A relocation would need a genuinely new
        // secondary container (a Tools menu, or a dedicated Publication/
        // Discovery panel), not a re-pointer to something that already
        // exists.
        discoverPublicationOccurrences = (canvasSource.match(/>Discover Publication</g) || []).length;
        assert(discoverPublicationOccurrences === 1, `C1. "Discover Publication" appears exactly once in WorldEncounterCanvas.js — found ${discoverPublicationOccurrences}`);

        // C2. Snapshot Distribution: an alternative surface ALREADY EXISTS
        // structurally, by design — 0.9.141's own Distribution
        // Entry-Point Convergence Audit already proved exactly two, and
        // only two, UI components declare a snapshotDistributionCommand
        // prop (OwnPublicationPanel for local/own Snapshots,
        // WorldEncounterCanvas for a selected/remote one), both bound to
        // the SAME ui/views/WorldView.js wrapper function. Re-verified
        // fresh here, not merely cited.
        const ownDeclares = /snapshotDistributionCommand:\s*\{/.test(ownPanelSource);
        const canvasDeclares = /snapshotDistributionCommand:\s*\{/.test(canvasSource);
        assert(ownDeclares && canvasDeclares, 'C2. both OwnPublicationPanel and WorldEncounterCanvas independently declare a snapshotDistributionCommand prop');
        assert((worldViewSource.match(/:snapshotDistributionCommand="distributeWorldEncounterSnapshot"/g) || []).length === 2,
            'C2. both mounts bind the SAME distributeWorldEncounterSnapshot function — two entry points, one command, reconfirmed');

        // C3. Content Comparison: exactly one surface exists ("Compare
        // with…" appears once), and it is reachable only through the
        // selection path already covered above — there is no secondary
        // entry point today, but Section B already showed none is needed:
        // the surface only ever appears once something worth comparing has
        // already been encountered.
        compareOccurrences = (canvasSource.match(/>Compare with…</g) || []).length;
        assert(compareOccurrences === 1, `C3. "Compare with…" appears exactly once — found ${compareOccurrences}`);

        console.log('✓ Section C: Discover Publication has no existing secondary surface (a relocation would need a new one); Snapshot Distribution already has two independent, intentional entry points; Content Comparison has one surface, reachable only via selection');
    }

    // ===============================================================
    // Section D — Diagnostic-tool classification.
    // ===============================================================
    const classification = {
        'Discover Publication': {
            kind: 'MANUAL DISCOVERY',
            rationale: 'a free-text objectId/discoveryTag lookup, reached with zero prior selection — the definition of manual inspection, never an ordinary World-navigation step'
        },
        'Snapshot Distribution — WorldEncounterCanvas (remote/selected)': {
            kind: 'DISTRIBUTION, already contextual',
            rationale: 'reachable only after selecting a Publication marker — an action taken ON something already encountered, not a standing tool'
        },
        'Snapshot Distribution — OwnPublicationPanel (local/own)': {
            kind: 'DISTRIBUTION, standing — the sole local entry point',
            rationale: 'the ONLY surface that can distribute the Wanderer\'s own current Snapshot; WorldEncounterCanvas\'s copy cannot substitute for it (distributablePublication requires a selectedEncounter, which a Wanderer\'s own unpublished work never is)'
        },
        'Content Comparison (Compare / Content Comparison panels)': {
            kind: 'INSPECTION, already contextual',
            rationale: 'unreachable without an already-selected, already-resolved Publication and an explicit "Compare with…" arm — diagnostic in PURPOSE, but never presented until content is already in front of the Wanderer'
        }
    };
    {
        for (const [name, { kind, rationale }] of Object.entries(classification)) {
            assert(typeof kind === 'string' && kind.length > 0, `D. ${name} has a named classification`);
            assert(typeof rationale === 'string' && rationale.length > 0, `D. ${name} has a stated rationale`);
        }
        console.log('✓ Section D: every candidate explicitly classified — manual discovery, contextual distribution, standing distribution, and contextual inspection are four different things, not one "World Encounters" bucket');
    }

    // ===============================================================
    // Section E — Existing product arcs. Every candidate traced back to the
    // arc that built it, so this audit never proposes hiding something that
    // was deliberately made prominent for a documented reason.
    // ===============================================================
    {
        const roadmap = await rawSource('docs/Roadmap.md');
        const arcHeadings = [
            '## 0.9.111 — World View Decentralized Publication Retrieval',
            '## 0.9.138 — World View Snapshot Distribution Action',
            '## 0.9.140 — Own Publication Distribution Entry Point',
            '## 0.9.141 — Distribution Entry-Point Convergence Audit',
            '## 0.9.142 — World View Snapshot Discovery Command',
            '## 0.9.182 — World Snapshot Comparison UI',
            '## 0.9.184 — World Snapshot Content Comparison View',
            '## 0.9.289 — Other-Publication Commentary Entry Point',
            '## 0.9.291 — Publication Commentary on the World Encounter Surface',
            '## 0.9.257 — World View Place Naming Presentation',
            '## 0.9.3 — World View UI / Wanderer Presence',
            // The direct precedent for THIS milestone's own likely next step:
            // a prior arc already relocated a different manual/recovery
            // capability off OwnPublicationPanel's standing surface into a
            // "Diagnostic Tools" trigger+modal, proved it a PURE
            // PRESENTATION GROUPING (zero command/prop/data change), and
            // then proved that relocation introduced no observability gap.
            '## 0.9.324 — Diagnostic Tools Surface',
            '## 0.9.325 — Diagnostic Tools Surface Convergence Audit',
            '## 0.9.326 — Post-Diagnostic Product Evolution Reassessment'
        ];
        for (const heading of arcHeadings) {
            assert(roadmap.includes(heading), `E. docs/Roadmap.md still records the arc: "${heading}"`);
        }

        // The 0.9.324 pipeline this precedent moved is confirmed still
        // present, gated behind diagnosticToolsOpen, in OwnPublicationPanel
        // — proving the "pure presentation grouping, zero command change"
        // pattern this audit recommends reusing is not hypothetical, it is
        // already shipped and load-bearing for a different control.
        assert(ownPanelSource.includes('diagnosticToolsOpen'), 'E. OwnPublicationPanel still carries the 0.9.324 Diagnostic Tools popup');
        assert(ownPanelSource.includes('v-if="discoverSnapshotCandidatesCommand || resolveSelectedSnapshotCommand || materializeSelectedSnapshotCommand"'),
            'E. the Diagnostic Tools trigger still gates on the SAME three command props its own pipeline buttons already gate on individually');

        console.log('✓ Section E: every candidate traced to the arc that built it; the 0.9.324-0.9.326 "Diagnostic Tools Surface" arc is the on-file precedent for relocating a manual/recovery control as pure presentation, already proven not to create an observability gap');
    }

    // ===============================================================
    // Section F — Cross-surface reachability. The underlying capability a
    // relocation would move is independent of its current template
    // location, so relocating markup never relocates behavior.
    // ===============================================================
    {
        // F1. discoverPublication() is a plain component method, invoked
        // from exactly one click handler in the template. Nothing about its
        // OWN implementation depends on being rendered inside the "World
        // Encounters" CollapsibleSection specifically — it reads
        // this.discoveryCommand/this.discoveryObjectId/this.discoveryTag,
        // all of which stay identically reachable from any markup location
        // inside the same component instance (or, per the 0.9.324
        // precedent, from a modal-overlay trigger elsewhere in the SAME
        // component).
        assert((canvasCodeOnly.match(/@click="discoverPublication"/g) || []).length === 1,
            'F1. discoverPublication is bound from exactly one template location — moving that one binding moves the entire capability, nothing is duplicated or left behind');

        // F2. The same restraint already holds for the 0.9.324 precedent:
        // discoverSnapshotCandidates is called from inside the
        // diagnosticToolsOpen-gated markup, proving a command function's
        // reachability survives being moved behind a trigger+modal.
        assert(ownPanelSource.includes('@click="discoverSnapshotCandidates"'), 'F2. the 0.9.324-relocated action is still wired to its own unmodified method');

        console.log('✓ Section F: every candidate\'s underlying command/method is a plain, independently-reachable function — a markup relocation moves where a button appears, never what clicking it does');
    }

    // ===============================================================
    // Section G — Recovery semantics. A relocation must not silently
    // remove the one recovery path that justified keeping a control at all.
    // ===============================================================
    {
        // G1. Discover Publication is the ONLY manual objectId+discoveryTag
        // lookup in the codebase (Section C1) — relocating its MARKUP
        // behind a menu preserves this, since the underlying discoveryCommand
        // prop and discoverPublication() method (Section F1) are untouched;
        // only Section C1's "no existing secondary surface" finding means a
        // relocation must actually construct a new container, never just
        // delete the old one.
        assert(discoverPublicationOccurrences === 1, 'G1. relocation candidates: exactly one existing manual-discovery surface, so recovery requires building a destination, not merely removing the source');

        // G2. Snapshot Distribution's own recovery semantics are already
        // split by design and must stay split: OwnPublicationPanel is the
        // ONLY way to distribute a Wanderer's own local Snapshot (Section
        // D), so it must never be relocated behind a gate that could hide
        // it from a Wanderer who has just finished editing — the identical
        // restraint 0.9.140's own header already states.
        assert(worldViewSource.includes('never inside the Explore-mode'),
            'G2. WorldView.js still documents why Own Publication Distribution must stay outside the World Encounters section');

        // G3. Content Comparison's recovery path is trivial to preserve: it
        // is reached through the SAME selection/arm sequence regardless of
        // where its result panel is presented, so no relocation of this
        // candidate removes any capability — confirmed structurally, not
        // merely argued: exactly three writers of armedForComparisonSelection
        // exist (arm, clear, and the marker-click consumption path), none of
        // which depend on WHERE the panel's own result markup is presented.
        const armWriters = (canvasCodeOnly.match(/this\.armedForComparisonSelection\s*=/g) || []).length;
        assert(armWriters === 3, `G3. armedForComparisonSelection has exactly the writers this file's own header documents (arm, clear, and the marker-click consumption path) — found ${armWriters}`);

        console.log('✓ Section G: relocating Discover Publication requires building a real destination (no existing fallback exists); Own Publication Distribution must never be gated away from a Wanderer who just finished editing; Content Comparison\'s recovery path is unaffected by where its result panel is presented');
    }

    // ===============================================================
    // Section H — Artificial-symmetry check. Explicitly reject "same
    // section, therefore same verdict."
    // ===============================================================
    {
        const verdicts = new Set(Object.values(classification).map((entry) => entry.kind));
        assert(verdicts.size === Object.keys(classification).length,
            'H. every candidate received a DISTINCT classification — no two collapsed into one interchangeable verdict merely because they share a parent component');

        // All three named candidates live inside WorldEncounterCanvas (the
        // "World Encounters" section) — the exact grouping the milestone
        // brief warns against treating as a reason for one shared verdict.
        // Reconfirmed here that despite sharing a parent, their gates are
        // genuinely different (standing vs. contextual vs. already-hidden
        // behind selection), which is the actual reason their verdicts
        // differ, never their shared location.
        assert(divGatedOn(canvasSource, 'discoveryCommand', 'world-encounter-discovery-panel'), 'H. Discover Publication\'s gate is standing (reconfirmed)');
        assert(divGatedOn(canvasSource, 'comparisonEncounter', 'world-snapshot-content-comparison-panel'), 'H. Content Comparison\'s gate is contextual (reconfirmed)');
        assert(compareOccurrences === 1, 'H. sanity: Compare and Discover Publication are two distinct, independently-classified controls, not one feature counted twice');

        console.log('✓ Section H: three candidates sharing one parent component received three independently-justified verdicts — "same World Encounters section" was never treated as a reason on its own');
    }

    // ===============================================================
    // Section I — Candidate decision matrix.
    // ===============================================================
    const decisionMatrix = [
        { candidate: 'Discover Publication', everydayNecessity: 'Low', diagnosticNature: 'High', existingCapabilityElsewhere: 'None (Section C1) — a real destination would need building', decision: 'RELOCATE' },
        { candidate: 'Snapshot Distribution — WorldEncounterCanvas copy (remote/selected)', everydayNecessity: 'Low (contextual)', diagnosticNature: 'Low — a real distribution action, not inspection', existingCapabilityElsewhere: 'Yes — already gated behind selection, functionally equivalent to "relocated"', decision: 'NOT_A_CLUTTER_PROBLEM' },
        { candidate: 'Snapshot Distribution — OwnPublicationPanel copy (local/own)', everydayNecessity: 'Medium — the sole entry point for distributing one\'s own Snapshot, adjacent to Save/Publish', diagnosticNature: 'Low', existingCapabilityElsewhere: 'No — this IS the primary surface (Section D)', decision: 'KEEP' },
        { candidate: 'Content Comparison (Compare / Content Comparison panels)', everydayNecessity: 'Low', diagnosticNature: 'High', existingCapabilityElsewhere: 'Yes — already unreachable without a prior selection (Section B6/B7)', decision: 'NOT_A_CLUTTER_PROBLEM' }
    ];
    {
        for (const row of decisionMatrix) {
            assert(['RELOCATE', 'KEEP', 'DEFER', 'DUPLICATIVE', 'NOT_A_CLUTTER_PROBLEM'].includes(row.decision),
                `I. ${row.candidate} carries a recognized decision label`);
        }
        console.log('✓ Section I: decision matrix assembled for all four audited surfaces (three named candidates, one split in two by its own two independent entry points)');
    }

    // ===============================================================
    // Section J — Final UX decision + this milestone's own verdict.
    // ===============================================================
    {
        console.log('\n=== DECISION MATRIX ===');
        for (const row of decisionMatrix) {
            console.log(`${row.candidate}`);
            console.log(`  Everyday necessity ............ ${row.everydayNecessity}`);
            console.log(`  Diagnostic nature .............. ${row.diagnosticNature}`);
            console.log(`  Existing capability elsewhere .. ${row.existingCapabilityElsewhere}`);
            console.log(`  Decision ........................ ${row.decision}`);
        }

        console.log('\n=== VERDICT: RELOCATE — Publication Discovery only ===');
        console.log('Of the three named candidates, only Discover Publication is genuinely main-screen clutter by this');
        console.log('audit\'s own semantic-purpose test: it is the one control that stands, fully rendered, independent of');
        console.log('any selection, in the DEFAULT primaryMode (EXPLORE) with the DEFAULT (expanded) World Encounters');
        console.log('section — reachable by every Wanderer on first paint, for a manual-lookup capability nothing in');
        console.log('ordinary World navigation or Publication interaction ever requires (Section B1-B3).');
        console.log('');
        console.log('Content Comparison is semantically diagnostic/inspection, exactly as the milestone brief suspected —');
        console.log('but it is ALREADY correctly scoped: both its panels are structurally unreachable without a prior,');
        console.log('explicit Publication selection (Section B6/B7), so there is no clutter to relocate. NOT_A_CLUTTER_PROBLEM.');
        console.log('');
        console.log('Snapshot Distribution splits cleanly along its own two pre-existing, intentional entry points');
        console.log('(0.9.141\'s own convergence audit): WorldEncounterCanvas\'s copy is already contextual (not a clutter');
        console.log('problem); OwnPublicationPanel\'s copy is the sole standing entry point for a Wanderer\'s own work and');
        console.log('must stay visible, per the same restraint 0.9.140\'s own header already states (KEEP).');
        console.log('');
        console.log('This confirms, with evidence rather than assumption, the asymmetric outcome the task explicitly');
        console.log('asked this audit to allow itself to reach: one relocation, not three, and no "Diagnostic Tools menu"');
        console.log('invented merely because three controls share a parent component (Section H).');

        assert(decisionMatrix.find((r) => r.candidate === 'Discover Publication').decision === 'RELOCATE', 'J. final: Discover Publication -> RELOCATE');
        assert(decisionMatrix.filter((r) => r.decision === 'NOT_A_CLUTTER_PROBLEM').length === 2, 'J. final: exactly two surfaces confirmed already correctly scoped');
        assert(decisionMatrix.find((r) => r.candidate.includes('OwnPublicationPanel')).decision === 'KEEP', 'J. final: Own Publication Distribution -> KEEP');

        console.log('\n✅ All World View Main-Screen Clutter Product Audit tests passed.');
    }
}

await run();
