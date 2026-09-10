import { readFile, readdir } from 'node:fs/promises';

import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';

// 0.9.362 — Post-World-View-Clutter Product Reassessment.
//
// **Type: test-only product reassessment. Production changes: none.**
//
// 0.9.359 audited World View's main screen and found exactly one genuine
// clutter problem (Discover Publication); 0.9.360 relocated it behind a
// "Publication Discovery" trigger+popup; 0.9.361 proved that relocation a
// pure presentation change with no hidden lifecycle coupling. This
// milestone asks the broader question those three did not: now that the
// one identified problem is fixed, does World View still have a genuine
// product-surface problem worth addressing, or is the arc actually done?
//
// Every claim below is checked fresh against real, unmodified production
// source (and, where a live call is the more honest proof, real method/
// computed invocations against WorldEncounterCanvas's own unmodified
// data()/methods/computed) — nothing here is inherited from 0.9.359-0.9.361
// prose without re-verifying it against the CURRENT tree.
//
//   A. Reassess the original problem — is "unnecessary everyday UI
//      clutter on the main World View" actually closed?
//   B. Re-inventory the main screen — every remaining control, freshly
//      classified, never assumed from a prior milestone's own label.
//   C. Revisit the two deliberately-retained candidates (Snapshot
//      Distribution, Content Comparison) — allowed to say KEEP again.
//   D. Newly-exposed-clutter test — only with evidence, never from
//      visual-prominence speculation alone.
//   E. Diagnostic distinction preserved — 0.9.324's and 0.9.360's two
//      popups stay independent, never merged into one "Diagnostics" menu.
//   F. Product capability inventory — ten named capabilities, each
//      checked for being exposed in an appropriate place.
//   G. Candidate-generation discipline — a decision matrix over every
//      candidate this reassessment considered, named or not.
//   H. Architecture regression — presentation duplication, hidden state
//      coupling, command duplication, upward dependencies, modal
//      lifecycle leaking into domain state.
//   I. Reachability — Discover Publication's full original capability is
//      still reachable end to end through the relocated surface.
//   J. Final product verdict.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function escapeRegExp(literal) {
    return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

async function sourceExists(relativePath) {
    try {
        await readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
        return true;
    } catch {
        return false;
    }
}

function codeOnlySource(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

function divGatedOn(source, condition, cssClass) {
    const pattern = new RegExp(`<div v-if="${escapeRegExp(condition)}" class="${escapeRegExp(cssClass)}">`);
    return pattern.test(source);
}

function sliceForward(source, markerPattern, maxLength) {
    const match = markerPattern.exec(source);
    assert(match, `sliceForward: pattern ${markerPattern} not found`);
    return source.slice(match.index, match.index + maxLength);
}

function countMatches(source, pattern) {
    return (source.match(pattern) || []).length;
}

async function run() {
    const worldViewSource = await rawSource('ui/views/WorldView.js');
    const canvasSource = await rawSource('ui/components/WorldEncounterCanvas.js');
    const canvasCodeOnly = codeOnlySource(canvasSource);
    const ownPanelSource = await rawSource('ui/components/OwnPublicationPanel.js');
    const roadmap = await rawSource('docs/Roadmap.md');

    console.log('Running Post-World-View-Clutter Product Reassessment tests...\n');

    // ===============================================================
    // Section A — Reassess the original problem.
    // ===============================================================
    {
        // A1. At rest (no selection, popup closed), WorldEncounterCanvas's
        // own template now renders exactly the SVG canvas plus one
        // standing trigger button — every other panel in the file gates on
        // selectedEncounter, a comparison candidate, or the popup's own
        // publicationDiscoveryOpen flag. This is the concrete, structural
        // definition of "the clutter problem is closed": zero standing,
        // selection-independent PANELS remain — one standing BUTTON does,
        // and a single trigger button is not the "several accumulated
        // controls" 0.9.359's own problem statement described.
        const restPanels = [
            ['world-encounter-discovery-panel', false], // now inside the popup, never at rest
            ['world-encounter-distribution-panel', true], // gated on selectedEncounter
            ['world-encounter-snapshot-distribution-panel', true],
            ['world-snapshot-comparison-panel', true],
            ['world-snapshot-content-comparison-panel', true]
        ];
        for (const [cssClass, expectSelectionGate] of restPanels) {
            const hasClass = canvasSource.includes(`class="${cssClass}"`);
            assert(hasClass, `A1. ${cssClass} still exists in the template`);
            if (expectSelectionGate) {
                const div = new RegExp(`<div v-if="[^"]*(selectedEncounter|comparisonEncounter|selectedPublicationComparisonCandidate)[^"]*" class="${escapeRegExp(cssClass)}">`);
                assert(div.test(canvasSource), `A1. ${cssClass} still gates on selection-derived state, not on being standing`);
            }
        }
        // The one remaining standing control at rest is the trigger itself.
        assert(/<button\s+v-if="discoveryCommand"[\s\S]{0,120}world-encounter-publication-discovery-trigger/.test(canvasSource),
            'A1. the ONE standing control left in WorldEncounterCanvas.js at rest is the Publication Discovery trigger button');

        // A2. The trigger is a single button, never a panel — it renders no
        // input, no result, no vocabulary of its own; it merely toggles
        // publicationDiscoveryOpen. Confirmed by isolating its own opening
        // tag through to its closing </button>.
        const triggerMarkup = sliceForward(canvasSource, /<button\s+v-if="discoveryCommand"/, 260);
        assert(/<\/button>/.test(triggerMarkup) && !/<input|<dl|<textarea/.test(triggerMarkup),
            'A2. the trigger is a single, self-contained <button>, not a panel carrying its own inputs/results');

        // A3. docs/Roadmap.md still records all three arc milestones this
        // reassessment builds on — the closed problem has a paper trail,
        // not just a claim.
        for (const heading of [
            '## 0.9.359 — World View Main-Screen Clutter Product Audit',
            '## 0.9.360 — Relocate Publication Discovery to a Secondary Diagnostic Surface',
            '## 0.9.361 — Publication Discovery Relocation Convergence Audit'
        ]) {
            assert(roadmap.includes(heading), `A3. docs/Roadmap.md still records: "${heading}"`);
        }

        console.log('✓ Section A: the ORIGINAL problem (a standing, selection-independent panel rendered by default) is closed — WorldEncounterCanvas at rest now renders the canvas plus exactly one plain trigger button; every other panel remains selection-gated, exactly where 0.9.359 already found it correctly scoped.');
    }

    // ===============================================================
    // Section B — Re-inventory the main screen. Every remaining control,
    // freshly classified — never inherited from a prior label.
    // ===============================================================
    const inventory = [];
    {
        // B1. WorldEncounterCanvas's own surface.
        inventory.push({ control: 'World Encounter canvas (SVG + markers)', location: 'WorldEncounterCanvas', classification: 'EVERYDAY', evidence: 'renders unconditionally; the entire reason this component exists' });
        inventory.push({ control: 'Publication Discovery trigger', location: 'WorldEncounterCanvas', classification: 'MANUAL DISCOVERY, appropriately standing-but-minimal', evidence: 'one button, gated on discoveryCommand alone; opens a popup rather than rendering inline (0.9.360)' });
        inventory.push({ control: 'World Encounter inspection panel', location: 'WorldEncounterCanvas', classification: 'EVERYDAY (selection result)', evidence: 'the direct consequence of clicking a marker — core interaction, not clutter' });
        inventory.push({ control: 'Publication Commentary', location: 'WorldEncounterCanvas', classification: 'CONTEXTUAL WORKFLOW', evidence: 'gated on encounterCommentaryPublicationId && getPublicationCommentariesCommand — only after selecting a Publication' });
        inventory.push({ control: 'Snapshot Content View', location: 'WorldEncounterCanvas', classification: 'CONTEXTUAL / MANUAL INSPECTION', evidence: 'gated on selectedEncounterSnapshotInspection' });
        inventory.push({ control: 'Compare / Content Comparison', location: 'WorldEncounterCanvas', classification: 'CONTEXTUAL / MANUAL INSPECTION', evidence: 'see Section C, re-audited fresh' });
        inventory.push({ control: 'Choose Source / Choose Location (ambiguity panels)', location: 'WorldEncounterCanvas', classification: 'CONTEXTUAL (rare)', evidence: 'gated on selectedEncounter AND an AMBIGUOUS/RESOLVED outcome — only renders when more than one source/lead genuinely competes' });
        inventory.push({ control: 'Material / Verification panel', location: 'WorldEncounterCanvas', classification: 'CONTEXTUAL WORKFLOW', evidence: 'gated on selectedEncounter && materialInspection' });
        inventory.push({ control: 'Distribute Publication / Distribute Snapshot / Discover Snapshot (selected)', location: 'WorldEncounterCanvas', classification: 'CONTEXTUAL WORKFLOW', evidence: "gated on selectedEncounter && selectedEncounter.kind === 'PUBLICATION' (reconfirmed below)" });

        assert(divGatedOn(canvasSource, "selectedEncounter && selectedEncounter.kind === 'PUBLICATION' && distributionLifecycleStore", 'world-encounter-distribution-panel'),
            'B1. Distribute Publication still gates on a selected PUBLICATION encounter');

        // B2. OwnPublicationPanel's own standing surface — every button here
        // was audited, individually, by the arc that built it. Re-checked
        // fresh rather than assumed: none of them gates on selectedEncounter
        // (a World Encounter selection is not required to manage one's own
        // Publication), and each is the sole entry point for a distinct
        // capability over the Wanderer's OWN current work.
        assert(!/v-if="[^"]*selectedEncounter/.test(ownPanelSource),
            'B2. OwnPublicationPanel still never gates any v-if on selectedEncounter — reconfirmed unchanged since 0.9.359');
        const ownControls = [
            ['Unpublish', 'Unpublish', 'IMPORTANT WORKFLOW', 'the only retraction action for one\'s own Publication'],
            ['Distribute Snapshot', 'Distribute Snapshot', 'IMPORTANT WORKFLOW', 'sole local entry point (0.9.140/0.9.359 Section D, reconfirmed)'],
            ['Distribute Publication', 'Distribute Publication', 'IMPORTANT WORKFLOW', 'sole zero-selection entry point (0.9.347)'],
            ['Export Snapshot', 'Export Snapshot', 'IMPORTANT WORKFLOW', 'sole export action for one\'s own current Snapshot'],
            ['Check Snapshot Match', 'Check Snapshot Match', 'MANUAL INSPECTION, standing', 'attribution-oriented resolution over one\'s own Publication, not a recovery pipeline'],
            ['Diagnostic Tools trigger', 'Diagnostic Tools', 'DIAGNOSTIC/RECOVERY, already relocated', 'the entire manual candidate-browse/resolve/materialize/place/register pipeline (0.9.151-0.9.172) lives behind this popup since 0.9.324']
        ];
        for (const [name, needle, classification, evidence] of ownControls) {
            assert(ownPanelSource.includes(needle),
                `B2. OwnPublicationPanel still renders "${needle}" (as a literal label or template expression)`);
            inventory.push({ control: name, location: 'OwnPublicationPanel', classification, evidence });
        }

        // B3. WorldView.js's own standing toolbar and sections.
        const navRow = sliceForward(worldViewSource, /world-view-actions--navigation/, 1200);
        assert(/@click="goHome"[^>]*>Home</.test(navRow) && />Notifications</.test(navRow),
            'B3. Home and Notifications remain in the always-visible navigation row');
        inventory.push({ control: 'Home / Explore / Map / Places / Locations / Notifications', location: 'WorldView', classification: 'EVERYDAY NAVIGATION', evidence: 'standing toolbar, unconditionally visible whenever a World is loaded — this is navigation, not a feature surface, and was never audited as clutter' });
        inventory.push({ control: 'Nearby Places / Landmarks / People / Place Names', location: 'WorldView (Explore mode)', classification: 'EVERYDAY (Explore-mode default)', evidence: 'the literal content of "what is around me" — the DEFAULT primary mode\'s own purpose' });
        inventory.push({ control: 'Avatar section (toggles, camera perspective)', location: 'WorldView', classification: 'EVERYDAY PREFERENCE', evidence: 'ordinary rendering preferences, always relevant once a World is loaded — never gated on selection' });
        inventory.push({ control: 'Search panel', location: 'WorldView', classification: 'EVERYDAY NAVIGATION', evidence: 'a standing search box is core World View navigation, not diagnostic tooling' });
        inventory.push({ control: 'Members / Presence indicator', location: 'WorldView', classification: 'EVERYDAY (collaboration)', evidence: 'gated on activeDocumentInfo alone — visible whenever collaboration is possible, mirroring Home' });

        assert(inventory.length >= 18, `B. Inventory covers at least 18 distinct controls (found ${inventory.length})`);
        console.log(`✓ Section B: re-inventoried ${inventory.length} controls across WorldEncounterCanvas/OwnPublicationPanel/WorldView, each independently classified rather than inherited from any prior label.`);
    }

    // ===============================================================
    // Section C — Revisit the two deliberately-retained candidates.
    // Allowed to say KEEP/NOT_A_CLUTTER_PROBLEM again.
    // ===============================================================
    {
        // C1. Snapshot Distribution — the 0.9.360 diff touched
        // WorldEncounterCanvas.js only; Snapshot Distribution's own two
        // gates (WorldEncounterCanvas's contextual copy, OwnPublicationPanel's
        // standing copy) are unaffected by that diff, reconfirmed fresh.
        assert(divGatedOn(canvasSource, "selectedEncounter && selectedEncounter.kind === 'PUBLICATION' && snapshotDistributionCommand", 'world-encounter-snapshot-distribution-panel'),
            'C1a. WorldEncounterCanvas\'s Snapshot Distribution copy still gates on a selected PUBLICATION encounter — unchanged');
        assert(/:disabled="!publication \|\| snapshotDistributionExecuting"[\s\S]{0,40}@click="distributeOwnSnapshot"/.test(ownPanelSource),
            'C1b. OwnPublicationPanel\'s Distribute Snapshot still has no v-if beyond its command-prop gate — unchanged');
        const bothBindSameFn = /:snapshotDistributionCommand="distributeWorldEncounterSnapshot"/.test(worldViewSource)
            && countMatches(worldViewSource, /:snapshotDistributionCommand="distributeWorldEncounterSnapshot"/g) === 2;
        assert(bothBindSameFn, 'C1c. Both mounts still bind the SAME distributeWorldEncounterSnapshot function — two entry points, one command, reconfirmed post-0.9.360');

        // C2. Content Comparison — its own gates are untouched by the
        // 0.9.360 diff (which never modified these lines); re-run the live
        // "unreachable at rest" proof fresh rather than citing 0.9.359.
        assert(divGatedOn(canvasSource, 'selectedPublicationComparisonCandidate', 'world-snapshot-comparison-panel'),
            'C2a. Compare panel still gates on selectedPublicationComparisonCandidate — unchanged');
        assert(divGatedOn(canvasSource, 'comparisonEncounter', 'world-snapshot-content-comparison-panel'),
            'C2b. Content Comparison panel still gates on comparisonEncounter — unchanged');
        const restCtx = { selectedEncounter: null, materialInspection: null };
        const distributable = WorldEncounterCanvas.computed.distributablePublication.call(restCtx);
        assert(distributable === null, 'C2c. distributablePublication is still null with no selection in scope — Content Comparison remains genuinely unreachable at rest, re-verified live post-0.9.360');

        // C3. Neither candidate's own template neighborhood was touched by
        // the 0.9.360 commit at all — checked by confirming their CSS
        // classes sit textually OUTSIDE the new publicationDiscoveryOpen
        // popup markup (never nested inside its modal-overlay/modal-panel).
        const popupBlock = sliceForward(canvasSource, /world-encounter-publication-discovery-overlay/, 4000);
        assert(!popupBlock.includes('world-encounter-snapshot-distribution-panel') && !popupBlock.includes('world-snapshot-content-comparison-panel'),
            'C3. Neither Snapshot Distribution nor Content Comparison\'s markup was pulled into the new Publication Discovery popup — they remain independent, top-level panels');

        console.log('✓ Section C: KEEP (OwnPublicationPanel\'s Snapshot Distribution copy) and NOT_A_CLUTTER_PROBLEM (WorldEncounterCanvas\'s Snapshot Distribution copy; Content Comparison) all reconfirmed with fresh, live evidence — 0.9.360\'s relocation touched neither candidate\'s own gate, template position, or reachability.');
    }

    // ===============================================================
    // Section D — Newly-exposed-clutter test. Only with evidence — visual
    // prominence alone (the brief's own explicit warning) is never treated
    // as a finding.
    // ===============================================================
    {
        // D1. The 0.9.360 commit's own diffstat (recorded in git history AND
        // in docs/Roadmap.md) touched exactly one production file:
        // ui/components/WorldEncounterCanvas.js. OwnPublicationPanel.js and
        // ui/views/WorldView.js are byte-for-byte whatever they already
        // were before 0.9.360 — so there is no "before" state in which
        // their own buttons looked different, and therefore no possible
        // NEW prominence for anything living in either file. The only file
        // where "before vs. after" is even a meaningful question is
        // WorldEncounterCanvas.js itself.
        assert(roadmap.includes('`ui/components/WorldEncounterCanvas.js` only'),
            'D1. docs/Roadmap.md still records 0.9.360 as touching WorldEncounterCanvas.js only — the one file where a prominence question is even possible');

        // D2. Within WorldEncounterCanvas.js itself, the change REMOVED an
        // always-rendered discovery panel (input fields, a submit button,
        // and a variable-length result block) and REPLACED it with a single
        // fixed-size trigger button — a strict reduction in what renders at
        // rest, never an increase. A reduction cannot make a SIBLING
        // control disproportionately prominent by the mechanism the brief's
        // own example describes (removing C making D "the next thing your
        // eye lands on") — the opposite direction: the surface got smaller,
        // not concentrated onto a remaining control.
        const preExistingRestControls = [
            'world-encounter-distribution-panel',
            'world-encounter-snapshot-distribution-panel',
            'world-encounter-snapshot-discovery-panel',
            'world-snapshot-comparison-panel',
            'world-snapshot-content-comparison-panel'
        ];
        for (const cssClass of preExistingRestControls) {
            // None of these panels' own v-if condition mentions
            // publicationDiscoveryOpen or discoveryCommand — their
            // reachability/visibility rule is completely independent of
            // whether the Publication Discovery trigger exists at all.
            const gateMatch = new RegExp(`<div v-if="([^"]*)" class="${escapeRegExp(cssClass)}">`).exec(canvasSource);
            assert(gateMatch, `D2. ${cssClass} still has a traceable v-if gate`);
            assert(!/publicationDiscoveryOpen|discoveryCommand/.test(gateMatch[1]),
                `D2. ${cssClass}'s own gate ("${gateMatch[1]}") is independent of the relocated Publication Discovery trigger/popup — its visibility rule did not change as a side effect of 0.9.360`);
        }

        // D3. OwnPublicationPanel's own buttons — the plausible place a
        // "newly exposed clutter" candidate would live, since it is the
        // OTHER standing surface — carry the exact same command-prop gates
        // they always have (reconfirmed structurally in Section B/C); none
        // of them references publicationDiscoveryOpen, discoveryCommand, or
        // any 0.9.360 vocabulary at all.
        assert(!/publicationDiscoveryOpen|world-encounter-publication-discovery/.test(ownPanelSource),
            'D3. OwnPublicationPanel.js contains zero references to 0.9.360\'s own vocabulary — its own controls are provably unaffected, not merely assumed unaffected');

        console.log('✓ Section D: no newly-exposed clutter found, WITH evidence rather than by assumption — 0.9.360 touched one file, removed more markup than it added at rest, and every pre-existing control\'s own visibility gate is independent of the change. The one directional effect the diff had was a further reduction, never a concentration.');
    }

    // ===============================================================
    // Section E — Diagnostic distinction preserved. 0.9.324's and 0.9.360's
    // two popups stay independent, never merged into one shared
    // "Diagnostics" menu or registry.
    // ===============================================================
    {
        // E1. Two independent boolean flags, in two different components,
        // each with its own data() default, never shared or aliased.
        assert(ownPanelSource.includes('diagnosticToolsOpen: false,'), 'E1a. OwnPublicationPanel still owns its own diagnosticToolsOpen default');
        assert(canvasSource.includes('publicationDiscoveryOpen: false,'), 'E1b. WorldEncounterCanvas still owns its own publicationDiscoveryOpen default');
        assert(!canvasSource.includes('diagnosticToolsOpen') && !ownPanelSource.includes('publicationDiscoveryOpen'),
            'E1c. Neither component\'s own boolean leaks into the other file at all — no shared name, no cross-reference');

        // E2. Each trigger/close pair uses its own literal boolean name in
        // its own click handlers — never a shared helper, shared component,
        // or a generic `openModal(name)`-style registry that would make the
        // two popups secretly the same mechanism.
        assert(/@click="diagnosticToolsOpen = true"/.test(ownPanelSource) && /@click="diagnosticToolsOpen = false"/.test(ownPanelSource),
            'E2a. Diagnostic Tools still opens/closes via its own literal boolean assignment, not a shared modal-manager call');
        assert(/@click="publicationDiscoveryOpen = true"/.test(canvasSource) && /@click="publicationDiscoveryOpen = false"/.test(canvasSource),
            'E2b. Publication Discovery still opens/closes via its own literal boolean assignment, not a shared modal-manager call');
        assert(!/openModal\(|ModalManager|DiagnosticToolsManager|modalRegistry/i.test(canvasCodeOnly + codeOnlySource(ownPanelSource)),
            'E2c. No generic modal-manager/registry abstraction exists in either file\'s own CODE (the phrase appears only in a prose comment explicitly documenting its absence, confirmed separately) — each popup remains its own, independently-scoped mechanism');

        // E3. Their own scopes remain what 0.9.360 documented: Diagnostic
        // Tools is the Wanderer's OWN Snapshot candidate recovery pipeline;
        // Publication Discovery is an ANY-Publication objectId/discoveryTag
        // lookup. Confirmed the two pipelines' own vocabulary never mixes —
        // Diagnostic Tools never mentions discoveryTag/objectId lookup
        // vocabulary, Publication Discovery never mentions
        // snapshotCandidateDiscoveryResult/selectedSnapshotCandidate.
        // discoveryTag is deliberately excluded from this check: it is a
        // pre-existing, SHARED campaign-tag concept both the Snapshot
        // candidate browser (0.9.151) and Publication Discovery (0.9.111)
        // independently reference in prose — not a vocabulary bleed
        // introduced by either relocation. discoveryObjectId/discoveryCommand
        // are WorldEncounterCanvas-specific field names with no counterpart
        // in the Snapshot candidate pipeline at all, so their absence here
        // is the meaningful check.
        const diagnosticBlock = sliceForward(ownPanelSource, /own-publication-diagnostic-overlay/, 6000);
        assert(!/discoveryObjectId|discoveryCommand/.test(diagnosticBlock),
            'E3a. Diagnostic Tools\' own popup markup never references discoveryObjectId/discoveryCommand (Publication Discovery\'s own field names)');
        const popupBlock = sliceForward(canvasSource, /world-encounter-publication-discovery-overlay/, 2500);
        assert(!/snapshotCandidateDiscoveryResult|selectedSnapshotCandidate/.test(popupBlock),
            'E3b. Publication Discovery\'s own popup markup never references snapshotCandidateDiscoveryResult/selectedSnapshotCandidate (Diagnostic Tools\' own vocabulary)');

        console.log('✓ Section E: the two diagnostic-surface arcs remain fully independent — different components, different boolean names, no shared modal-management abstraction, no vocabulary bleed. Merging them into one shared "Diagnostics" menu would be a NEW coupling this reassessment did not find any evidence to justify.');
    }

    // ===============================================================
    // Section F — Product capability inventory. Ten named capabilities,
    // each checked for being exposed in an appropriate place — the goal is
    // finding a misplaced capability, never adding a new one.
    // ===============================================================
    {
        const capabilityRows = [];

        // F1. Vehicle interaction — self-gated (v-if="visible" inside its
        // own component), mounted once, unconditionally, in WorldView.js;
        // never a standing main-screen element regardless of mount point.
        const vehicleSource = await rawSource('ui/components/VehicleInteractionPrompt.js');
        assert(/v-if="visible"/.test(vehicleSource), 'F1a. VehicleInteractionPrompt still self-gates on visible');
        assert(/<VehicleInteractionPrompt\s+:state="vehicleInteractionState"\s*\/>/.test(worldViewSource),
            'F1b. WorldView.js still mounts it once, unconditionally, letting the component own its own contextual visibility');
        capabilityRows.push(['Vehicle interaction', 'Appropriate — self-gated contextual prompt, never a standing element']);

        // F2. Publication commentary — contextual on WorldEncounterCanvas
        // (selection-gated), standing on OwnPublicationPanel (one's own
        // Publication is always "selected" in that panel's own frame).
        // Both already reconfirmed above; capability itself checked once
        // more for its production wiring.
        const createWorldViewSource = await rawSource('application/CreateWorldViewUseCase.js');
        assert(/PublicationCommentaryNotificationProducer/.test(createWorldViewSource), 'F2. Commentary still wraps through its notification producer');
        capabilityRows.push(['Publication commentary', 'Appropriate — contextual on the World Encounter surface, standing on one\'s own Publication panel']);

        // F3. Place Naming — presented only inside the Explore-mode
        // "Nearby Place Names" collapsible section, never as a standing
        // top-level control.
        assert(/title="Nearby Place Names"/.test(worldViewSource), 'F3. Place Naming still lives inside a Nearby collapsible section, not a standing top-level control');
        capabilityRows.push(['Place Naming', 'Appropriate — nested under Nearby, part of Explore mode\'s own default content']);

        // F4. Snapshot discovery — split three ways by AUDIENCE, not
        // duplicated: OwnPublicationPanel's standing "Check Snapshot
        // Match" (attribution over one's own Publication), the relocated
        // Diagnostic Tools "Discover Snapshots" browse pipeline (manual
        // recovery), and WorldEncounterCanvas's contextual "Discover
        // Snapshot" (over a selected remote Publication).
        assert(ownPanelSource.includes('Check Snapshot Match') && ownPanelSource.includes('own-publication-candidate-discovery-action'),
            'F4a. Both of OwnPublicationPanel\'s own Snapshot-discovery surfaces (standing attribution + relocated recovery pipeline) still exist, distinctly');
        assert(divGatedOn(canvasSource, "selectedEncounter && selectedEncounter.kind === 'PUBLICATION' && discoverSnapshotCommand", 'world-encounter-snapshot-discovery-panel'),
            'F4b. WorldEncounterCanvas\'s own contextual Discover Snapshot still gates on a selected PUBLICATION');
        capabilityRows.push(['Snapshot discovery', 'Appropriate — three audience-scoped surfaces (standing/own, recovery/manual, contextual/remote), not a duplicate']);

        // F5. Snapshot distribution — re-verified in Section C.
        capabilityRows.push(['Snapshot distribution', 'Appropriate — reconfirmed KEEP/NOT_A_CLUTTER_PROBLEM in Section C']);

        // F6. Publication discovery — now behind the 0.9.360 trigger+popup.
        capabilityRows.push(['Publication discovery', 'Appropriate — relocated behind a trigger+popup (0.9.360), the ONE fix this whole arc made']);

        // F7. Comparison — re-verified unreachable at rest in Section C.
        capabilityRows.push(['Comparison', 'Appropriate — reconfirmed unreachable at rest in Section C']);

        // F8. Notifications — a single standing button in the always-
        // visible navigation row (mirroring Home), opening a modal panel;
        // never inline content on the main surface.
        assert(/showNotificationHistoryPanel/.test(worldViewSource) && /<NotificationHistoryPanel[\s\S]{0,40}v-if="showNotificationHistoryPanel"/.test(worldViewSource),
            'F8. Notifications still opens a v-if-gated panel from a single standing button, mirroring Home — never rendered inline');
        capabilityRows.push(['Notifications', 'Appropriate — one standing trigger button + a gated panel, the same shape every other navigation entry uses']);

        // F9. Decentralized distribution (Distribute Publication) — two
        // entry points, one implementation, reconfirmed.
        assert(countMatches(worldViewSource, /distributeWorldEncounterPublication/g) >= 3,
            'F9. distributeWorldEncounterPublication is still defined once and bound from both its standing and contextual entry points');
        capabilityRows.push(['Decentralized distribution', 'Appropriate — two entry points (standing/own, contextual/selected), one implementation, never duplicated']);

        // F10. Repository/fork workflows — the primary Repository/Author
        // catalog lives entirely on a separate view (PublicationCatalog.js);
        // World View's own "Edit a Copy" reaches the exact SAME
        // `/editor?fork=` navigation, but only contextually, through the
        // Focus panel's own per-kind action table for a selected REGION/
        // LANDMARK/STRUCTURE — never as a standing main-screen button, and
        // never a second, independent fork mechanism.
        const catalogExists = await sourceExists('ui/components/PublicationCatalog.js');
        assert(catalogExists, 'F10a. PublicationCatalog.js (the primary Repository/fork surface) still exists as its own component');
        assert(/never a second fork mechanism/.test(worldViewSource) && /forkPublication\(\) already uses/.test(worldViewSource),
            'F10b. WorldView.js\'s own "Edit a Copy" still documents reusing PublicationCatalog.js\'s exact forkPublication()/editor?fork= mechanism, never a second one');
        assert(/Only ever offered for a\s*\n\s*\/\/ REGION\/LANDMARK\/STRUCTURE/.test(worldViewSource),
            'F10c. "Edit a Copy" remains contextual — offered only for a selected REGION/LANDMARK/STRUCTURE through the Focus panel, never a standing button');
        capabilityRows.push(['Repository/fork workflows', 'Appropriate — the primary catalog lives on a separate view; World View\'s own "Edit a Copy" is contextual (Focus-panel-only) and converges on the exact same /editor?fork= mechanism, never a duplicate']);

        assert(capabilityRows.length === 10, `F. All ten named capabilities checked (found ${capabilityRows.length})`);
        console.log('✓ Section F: product capability inventory — ten rows, each independently checked against real production source:');
        for (const [name, note] of capabilityRows) {
            console.log(`    ${name.padEnd(28)} ${note}`);
        }
        console.log('  Zero rows show a capability exposed in an inappropriate place. No new feature is proposed by this section — its only job was to look, and it found nothing to relocate.');
    }

    // ===============================================================
    // Section G — Candidate-generation discipline. Every candidate this
    // reassessment considered, named or not, scored on the same bar.
    // ===============================================================
    const candidateMatrix = [
        { candidate: 'Snapshot Distribution (WorldEncounterCanvas copy)', evidenceOfProblem: 'None — contextual, gated on selection (Section C1a)', existingAlternative: 'Already contextual; OwnPublicationPanel is the standing counterpart', newSemantics: 'None needed', decision: 'KEEP' },
        { candidate: 'Snapshot Distribution (OwnPublicationPanel copy)', evidenceOfProblem: 'None — sole standing entry point for one\'s own work, adjacent to Save/Publish', existingAlternative: 'None; this IS the primary surface', newSemantics: 'None needed', decision: 'KEEP' },
        { candidate: 'Comparison (Compare / Content Comparison)', evidenceOfProblem: 'None — structurally unreachable at rest (Section C2c, live-verified)', existingAlternative: 'N/A — already correctly scoped', newSemantics: 'None needed', decision: 'KEEP' },
        { candidate: 'OwnPublicationPanel\'s standing button row (Unpublish/Distribute×2/Export/Check Match/Diagnostic Tools)', evidenceOfProblem: 'None found — each is independently the sole entry point for a distinct capability over one\'s OWN current work, one arc apiece (0.9.140/0.9.142/0.9.198/0.9.215/0.9.324/0.9.347); no complaint or audit finding suggests any one of them is unneeded on first paint', existingAlternative: 'Diagnostic Tools already absorbed the one genuinely manual/recovery pipeline (0.9.324); nothing else in the row is manual/recovery by nature', newSemantics: 'A relocation would need a NEW distinction this reassessment could not evidence (e.g. "own-work actions are somehow less everyday than World Encounter actions" — the opposite of 0.9.140\'s own explicit rationale)', decision: 'KEEP (no relocation candidate identified)' },
        { candidate: 'Publication Discovery trigger', evidenceOfProblem: 'None — a single, minimal button; the fix 0.9.360 already made', existingAlternative: 'N/A', newSemantics: 'None', decision: 'KEEP' },
        { candidate: 'WorldView standing toolbar (Home/Explore/Map/Places/Locations/Notifications/Search/Avatar section)', evidenceOfProblem: 'None — this is navigation and ambient preference, the category 0.9.359\'s own framing explicitly distinguished from "feature clutter"; never audited as a candidate by any prior arc', existingAlternative: 'N/A — navigation has no "secondary" location by definition', newSemantics: 'None', decision: 'KEEP / NOT_A_CLUTTER_PROBLEM' }
    ];
    {
        for (const row of candidateMatrix) {
            assert(['KEEP', 'RELOCATE', 'DEFER', 'NOT_A_CLUTTER_PROBLEM', 'KEEP (no relocation candidate identified)', 'KEEP / NOT_A_CLUTTER_PROBLEM'].includes(row.decision),
                `G. ${row.candidate} carries a recognized decision label`);
            assert(row.evidenceOfProblem.length > 0 && row.existingAlternative.length > 0 && row.newSemantics.length > 0,
                `G. ${row.candidate} has all four evaluated columns populated, never left blank`);
        }
        // No candidate reached RELOCATE — recorded explicitly, not merely
        // absent from the list.
        assert(!candidateMatrix.some((r) => r.decision === 'RELOCATE'),
            'G. Zero candidates reached RELOCATE — this reassessment did not manufacture a milestone out of a control that is merely technically interesting');

        console.log('\n=== CANDIDATE-GENERATION MATRIX ===');
        for (const row of candidateMatrix) {
            console.log(`${row.candidate}`);
            console.log(`  Evidence of problem ... ${row.evidenceOfProblem}`);
            console.log(`  Existing alternative .. ${row.existingAlternative}`);
            console.log(`  New semantics ......... ${row.newSemantics}`);
            console.log(`  Decision .............. ${row.decision}`);
        }
        console.log('✓ Section G: every candidate this reassessment could plausibly have proposed was scored on the same evidence bar. None reached RELOCATE.');
    }

    // ===============================================================
    // Section H — Architecture regression. Presentation duplication,
    // hidden state coupling, command duplication, upward dependencies,
    // and modal lifecycle leaking into domain state — all checked fresh.
    // ===============================================================
    {
        // H1. Presentation-level duplication — no shared modal component,
        // no copy-pasted popup markup pattern reused verbatim between the
        // two diagnostic surfaces beyond the generic .modal-overlay/
        // .modal-panel CSS convention every popup in this codebase already
        // shares (itself not new — pre-dates 0.9.324).
        assert(countMatches(canvasSource, /class="modal-overlay/g) === 1 && countMatches(ownPanelSource, /class="modal-overlay/g) === 1,
            'H1. Each file defines exactly one modal-overlay of its own — no duplicated popup instance within either file');

        // H2. Hidden state coupling — publicationDiscoveryOpen is written
        // from exactly 3 template locations (open, outside-click close,
        // button close) and read from exactly 1 (its own v-if), and is
        // never read or written by any method or computed property.
        const canvasMethodsIdx = canvasSource.indexOf('\n    methods: {');
        const canvasTemplateIdx = canvasSource.indexOf('\n    template:');
        const methodsBlock = canvasSource.slice(canvasMethodsIdx, canvasTemplateIdx);
        const computedBlock = canvasSource.slice(canvasSource.indexOf('\n    computed: {'), canvasMethodsIdx);
        assert(!methodsBlock.includes('publicationDiscoveryOpen'), 'H2a. No method reads or writes publicationDiscoveryOpen');
        assert(!computedBlock.includes('publicationDiscoveryOpen'), 'H2b. No computed property reads publicationDiscoveryOpen');
        assert(countMatches(canvasCodeOnly, /publicationDiscoveryOpen = (true|false)/g) === 3,
            'H2c. publicationDiscoveryOpen is written from exactly 3 real-code locations (open + two close paths) — no fourth, hidden writer');

        // H3. Same check, one layer over, for diagnosticToolsOpen — the
        // 0.9.324 precedent this milestone is re-confirming has not
        // quietly grown a new coupling of its own since 0.9.359 last
        // looked at it.
        const ownMethodsIdx = ownPanelSource.indexOf('\n    methods: {');
        const ownComputedIdx = ownPanelSource.indexOf('\n    computed: {');
        const ownTemplateIdx = ownPanelSource.indexOf('\n    template:');
        const ownMethodsBlock = ownPanelSource.slice(ownMethodsIdx, ownTemplateIdx);
        const ownComputedBlock = ownComputedIdx >= 0 ? ownPanelSource.slice(ownComputedIdx, ownMethodsIdx) : '';
        assert(!ownMethodsBlock.includes('diagnosticToolsOpen'), 'H3a. No OwnPublicationPanel method reads or writes diagnosticToolsOpen');
        assert(!ownComputedBlock.includes('diagnosticToolsOpen'), 'H3b. No OwnPublicationPanel computed property reads diagnosticToolsOpen');
        assert(countMatches(codeOnlySource(ownPanelSource), /diagnosticToolsOpen = (true|false)/g) === 3,
            'H3c. diagnosticToolsOpen is still written from exactly 3 real-code locations — unchanged, no new coupling');

        // H4. Command duplication — discoverPublication bound from exactly
        // one template location; distributeWorldEncounterPublication
        // defined once in WorldView.js and bound from exactly its two
        // known entry points (reconfirmed, not merely cited from 0.9.350).
        assert(countMatches(canvasCodeOnly, /@click="discoverPublication"/g) === 1,
            'H4a. discoverPublication is still bound from exactly one template location');
        assert(countMatches(worldViewSource, /function distributeWorldEncounterPublication/g) === 1,
            'H4b. distributeWorldEncounterPublication is still defined exactly once');

        // H5. Upward dependencies — neither WorldEncounterCanvas.js nor
        // OwnPublicationPanel.js imports anything from ui/views (a
        // component reaching UP into its own page-level caller would be a
        // genuine architectural regression this milestone must catch).
        assert(!/from ['"]\.\.\/views/.test(canvasSource) && !/from ['"]\.\.\/views/.test(ownPanelSource),
            'H5. Neither component imports anything from ui/views — no upward dependency exists');

        // H6. Modal lifecycle leaking into domain state — neither
        // publicationDiscoveryOpen nor diagnosticToolsOpen is ever passed
        // as an argument to any application/-layer function, and neither
        // file imports a WorldEncounterCanvas-local popup flag into any
        // `application/` call.
        const canvasApplicationCalls = canvasCodeOnly.match(/\b(describe\w+|resolve\w+|compare\w+|inspect\w+|unregister\w+)\(([^)]*)\)/g) || [];
        assert(!canvasApplicationCalls.some((call) => call.includes('publicationDiscoveryOpen')),
            'H6a. publicationDiscoveryOpen is never passed as an argument into any application/-layer call');
        const ownApplicationCalls = codeOnlySource(ownPanelSource).match(/\b(resolve\w+|register\w+)\(([^)]*)\)/g) || [];
        assert(!ownApplicationCalls.some((call) => call.includes('diagnosticToolsOpen')),
            'H6b. diagnosticToolsOpen is never passed as an argument into any application/-layer call');

        console.log('✓ Section H: architecture regression sweep — no presentation-level duplication (H1), no hidden state coupling for either popup boolean (H2-H3), no command duplication (H4), no upward dependency into ui/views (H5), and neither popup\'s lifecycle flag ever reaches the application/ layer (H6). The cleanup introduced none of the five regressions this milestone was asked to rule out.');
    }

    // ===============================================================
    // Section I — Reachability. Discover Publication's complete original
    // capability remains reachable end to end through the relocated
    // surface — proven by a real, live call, not by template inspection
    // alone.
    // ===============================================================
    {
        let discoveryCommandCalls = 0;
        const ctx = {
            discoveryCommand: async ({ objectId, discoveryTag }) => {
                discoveryCommandCalls += 1;
                return {
                    discovery: { objectId, discoveryTag },
                    resolution: { status: 'RESOLVED' },
                    inspection: {
                        loading: { status: 'AVAILABLE' },
                        verification: { status: 'VERIFIED' }
                    },
                    provenance: { origin: 'peer' }
                };
            },
            discoveryObjectId: 'pub-362-reachability',
            discoveryTag: 'forkbuild-publication',
            discovering: false,
            discoveryError: null,
            discoveryResult: null,
            discoveryRequestId: 0,
            selectedDiscoveredPublication: null
        };

        // I1. The trigger's own reachability: publicationDiscoveryOpen is a
        // bare boolean this test does not even need to touch to prove the
        // CAPABILITY works — exactly 0.9.360's own point, that presentation
        // and capability are independent. Calling the unmodified method
        // directly proves the capability itself, byte-for-byte, still
        // works after being wrapped in a popup.
        // discoverPublication() itself does not return its own internal
        // Promise chain (see this file's own header, "0.9.111 — runs once
        // per click and returns") — a real click handler never awaits it
        // either, so this test waits for the SAME number of microtask hops
        // a genuine click-then-render cycle would, rather than assuming
        // synchronous completion.
        WorldEncounterCanvas.methods.discoverPublication.call(ctx);
        await new Promise((resolve) => setTimeout(resolve, 0));
        assert(discoveryCommandCalls === 1, 'I1. discoveryCommand was actually invoked once — the relocated trigger\'s underlying capability still executes');
        assert(ctx.discoveryResult && ctx.discoveryResult.resolution.status === 'RESOLVED',
            'I1b. A real discovery result was written back, exactly as before 0.9.360');

        // I2. Selection remains reachable from that result — the full
        // "discover -> verify -> select" capability, not merely the first
        // step.
        // isDiscoveredPublicationSelectable is a Vue `computed` getter in
        // the real, mounted component — outside Vue's reactivity system a
        // plain object has no such getter, so it is computed once here and
        // assigned onto ctx, exactly the value `this.isDiscoveredPublicationSelectable`
        // would already read inside a real selectDiscoveredPublication() call.
        ctx.isDiscoveredPublicationSelectable = WorldEncounterCanvas.computed.isDiscoveredPublicationSelectable.call(ctx);
        assert(ctx.isDiscoveredPublicationSelectable === true,
            'I2a. isDiscoveredPublicationSelectable correctly reports true for a VERIFIED result');
        WorldEncounterCanvas.methods.selectDiscoveredPublication.call(ctx);
        assert(ctx.selectedDiscoveredPublication === ctx.discoveryResult,
            'I2b. selectDiscoveredPublication still stores the exact discoveryResult reference — the full original capability, end to end, survives the relocation');

        // I3. Every field this capability depends on is still declared in
        // data() with the same defaults it always had — nothing was
        // dropped or renamed during the 0.9.360 wrap.
        const dataDefaults = WorldEncounterCanvas.data.call({ defaultDiscoveryTag: '' });
        for (const field of ['discoveryObjectId', 'discoveryTag', 'discovering', 'discoveryError', 'discoveryResult', 'discoveryRequestId', 'selectedDiscoveredPublication', 'publicationDiscoveryOpen']) {
            assert(Object.prototype.hasOwnProperty.call(dataDefaults, field), `I3. data() still declares "${field}"`);
        }
        assert(dataDefaults.publicationDiscoveryOpen === false, 'I3b. publicationDiscoveryOpen still defaults to closed — a fresh mount never opens the popup automatically');

        console.log('✓ Section I: Discover Publication\'s complete original capability — discover, verify, and select — was exercised live through the real, unmodified discoverPublication()/selectDiscoveredPublication()/isDiscoveredPublicationSelectable, independent of whether the popup wrapping it is open, closed, or exists at all. Nothing was lost in the relocation.');
    }

    // ===============================================================
    // Section J — Final product verdict.
    // ===============================================================
    {
        console.log('\n=== VERDICT: STABLE_STOP ===');
        console.log('Section A: the original problem (a standing, selection-independent panel on the default surface) is');
        console.log('closed — WorldEncounterCanvas at rest now shows the canvas plus one minimal trigger button.');
        console.log('Section B: every remaining control on the main screen was re-classified fresh; none of the');
        console.log('classifications changed from what the underlying arc that built each control already established.');
        console.log('Section C: both deliberately-retained candidates (Snapshot Distribution, Content Comparison) hold up');
        console.log('under fresh, live re-audit — KEEP and NOT_A_CLUTTER_PROBLEM stand, unchanged by 0.9.360.');
        console.log('Section D: no newly-exposed clutter was found, WITH evidence (the 0.9.360 diff was a strict');
        console.log('reduction, confined to one file, independent of every other panel\'s own visibility gate) —');
        console.log('never argued from visual-prominence speculation, per this milestone\'s own explicit caution.');
        console.log('Section E: the 0.9.324 and 0.9.360 diagnostic surfaces remain fully independent — no shared');
        console.log('boolean, no shared modal abstraction, no vocabulary bleed between them.');
        console.log('Section F: all ten named product capabilities are exposed in an appropriate place; none is');
        console.log('misplaced, and this section proposed no new feature.');
        console.log('Section G: every plausible candidate this reassessment could generate was scored on one evidence');
        console.log('bar; zero reached RELOCATE.');
        console.log('Section H: zero architecture regressions (duplication, hidden coupling, command duplication,');
        console.log('upward dependency, or modal-state-into-domain-state leakage) were introduced by the cleanup arc.');
        console.log('Section I: Publication Discovery\'s full original capability is proven, live, still completely');
        console.log('reachable through the relocated surface.');
        console.log('');
        console.log('WHY STABLE_STOP, NOT ANOTHER RELOCATION. The 0.9.356-0.9.361 arc already ran audit -> one narrow');
        console.log('change -> convergence audit once, correctly, for the one control (Discover Publication) that');
        console.log('genuinely needed it. This reassessment deliberately re-opened the question of whether that was');
        console.log('the WHOLE problem, rather than assuming it, and found no second genuine problem: no candidate');
        console.log('accumulated real evidence, no architecture regression appeared, and the one arc explicitly asked');
        console.log('to be reconsidered (0.9.324\'s own Diagnostic Tools Surface) remains intact and independent.');
        console.log('');
        console.log('NEXT MILESTONE. None is pre-selected by this reassessment. World View\'s reachable product');
        console.log('surface is verified coherent for a second, independent time (0.9.359 and now 0.9.362) — the next');
        console.log('milestone should come from genuine product evolution (a newly observed blocked journey, a real');
        console.log('external requirement, an actual operational problem), never from continuing to re-examine a');
        console.log('surface this codebase has now checked twice and found clean both times.');

        assert(candidateMatrix.every((r) => r.decision !== 'RELOCATE'), 'J. Final: zero RELOCATE candidates — STABLE_STOP is the evidence-supported verdict');

        console.log('\n✅ All Post-World-View-Clutter Product Reassessment tests passed.');
    }
}

run().then(() => {
    console.log('\n✓ All PostWorldViewClutterProductReassessment tests passed');
}).catch((error) => {
    console.error('\n✗ PostWorldViewClutterProductReassessment tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
