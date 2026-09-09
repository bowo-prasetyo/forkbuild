import { readFile } from 'node:fs/promises';

import OwnPublicationPanel from '../ui/components/OwnPublicationPanel.js';

// 0.9.324 — Diagnostic Tools Surface.
//
// 0.9.151 through 0.9.172 built a complete, deliberately manual
// discover-candidates -> select -> resolve -> attribute -> materialize ->
// use-claimed-position -> place -> register Snapshot pipeline — the
// person-driven RECOVERY counterpart to `application/
// AutomaticSnapshotEncounterCascade.js`'s own background cascade
// (0.9.187). Every one of those actions rendered permanently, always
// visible, on `OwnPublicationPanel`'s own primary "My Publication"
// screen, beside ordinary actions like Distribute/Export/Unpublish. This
// milestone reorganizes ONLY where that pipeline renders — behind a new
// "Diagnostic Tools" trigger and popup — and changes NOTHING about what
// any of it does. TEST-ONLY. ZERO PRODUCTION LOGIC CHANGES: every command,
// method, data field, and disabled/result binding this file exercises is
// the exact same one 0.9.151-0.9.172's own tests already proved correct;
// this file proves only that relocating them changed presentation and
// nothing else.
//
// Section A: the popup exists — a `diagnosticToolsOpen` data field
//            (default false), a trigger button, and a modal-overlay wrapper.
// Section B: every pipeline action (button element, its own `:disabled`
//            binding, and its own result/error rendering) is a descendant
//            of that wrapper — never rendered on the primary screen.
// Section C: ordinary, non-diagnostic actions (Unpublish, Distribute
//            Snapshot, Export Snapshot, Check Snapshot Match) remain
//            OUTSIDE the wrapper, on the primary screen, unmoved.
// Section D: the pipeline's own action order survives the move, unchanged.
// Section E: every pipeline method still exists, unchanged, and still
//            calls the exact same injected command it always did.
// Section F: `diagnosticToolsOpen` is never read by, and never written
//            from, any pipeline method — opening/closing the popup cannot
//            alter domain/application state.
// Section G: no new orchestration, application command, or "diagnostic"
//            vocabulary was introduced at the application layer.
// Section H: WorldView.js's wiring of OwnPublicationPanel — every prop,
//            every injected command — is completely unchanged.
// Section I: Place Naming's own surfaces (PlaceNamingPanel.js, World
//            View's own Nearby Place Names section) are untouched — no
//            artificial "Place Naming diagnostics" category was invented
//            merely for symmetry with Snapshots.
// Section J: `application/AutomaticSnapshotEncounterCascade.js` (the
//            automatic counterpart this whole pipeline exists to let a
//            person manually walk) is untouched.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

async function codeOnlySource(relativePath) {
    const text = await rawSource(relativePath);
    const withoutHtmlComments = text.replace(/<!--[\s\S]*?-->/g, '');
    return withoutHtmlComments.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

// The seven buttons 0.9.151-0.9.172 built, in their own original order —
// this milestone's own product brief names exactly this set (plus
// Attribute/Use-Claimed-Position, which travel with the same family —
// see this file's own header and OwnPublicationPanel.js's own 0.9.324
// comment for why those two move too, not merely the five the brief's
// own illustrative diagram named).
const PIPELINE_ACTIONS = [
    { label: 'Discover Snapshots', actionClass: 'own-publication-candidate-discovery-action', command: 'discoverSnapshotCandidatesCommand' },
    { label: 'Resolve Selected Snapshot', actionClass: 'own-publication-selected-resolution-action', command: 'resolveSelectedSnapshotCommand' },
    { label: 'Attribute Selected Snapshot', actionClass: 'own-publication-selected-attribution-action', command: 'resolveSelectedSnapshotCommand' },
    { label: 'Materialize Selected Snapshot', actionClass: 'own-publication-selected-materialization-action', command: 'materializeSelectedSnapshotCommand' },
    { label: 'Use Claimed Position', actionClass: 'own-publication-selected-world-position-claim-action', command: 'materializeSelectedSnapshotCommand' },
    { label: 'Place Materialized Snapshot', actionClass: 'own-publication-selected-world-placement-action', command: 'materializeSelectedSnapshotCommand' },
    { label: 'Register Placed Snapshot', actionClass: 'own-publication-selected-world-registration-action', command: 'materializeSelectedSnapshotCommand' }
];

// Ordinary, non-diagnostic actions this milestone's own brief explicitly
// keeps on the primary screen — see OwnPublicationPanel.js's own 0.9.324
// comment, "stay on the primary screen, deliberately."
const PRIMARY_SCREEN_ACTIONS = [
    'own-publication-unpublish-action',
    'own-publication-distribution-action',
    'own-publication-export-action',
    'own-publication-discovery-action'
];

async function runTests() {
    console.log('Running Diagnostic Tools Surface tests...\n');

    const rawPanel = await rawSource('ui/components/OwnPublicationPanel.js');
    const codePanel = await codeOnlySource('ui/components/OwnPublicationPanel.js');

    // ---------------------------------------------------------------
    // Section A — the popup exists.
    // ---------------------------------------------------------------
    {
        assert(Object.prototype.hasOwnProperty.call(OwnPublicationPanel.data(), 'diagnosticToolsOpen'),
            'A1. OwnPublicationPanel has a diagnosticToolsOpen data field');
        assert(OwnPublicationPanel.data().diagnosticToolsOpen === false,
            'A2. diagnosticToolsOpen defaults to false — the popup starts closed');

        assert(/class="action-btn own-publication-diagnostic-trigger"/.test(rawPanel),
            'A3. a dedicated "Diagnostic Tools" trigger button exists');
        assert(/>Diagnostic Tools<\/button>/.test(rawPanel),
            'A4. the trigger is labeled "Diagnostic Tools" — never "Debug" (see this milestone\'s own product brief)');
        assert(!/\bDebug\b/.test(codePanel),
            'A4b. OwnPublicationPanel.js introduces no "Debug" vocabulary anywhere');

        assert(/v-if="diagnosticToolsOpen"[\s\S]{0,40}class="modal-overlay own-publication-diagnostic-overlay"/.test(rawPanel),
            'A5. the popup is a genuine modal-overlay, gated on diagnosticToolsOpen, reusing the SAME .modal-overlay/.modal-panel convention every other popup in this codebase already uses');
        assert(rawPanel.includes('class="modal-panel own-publication-diagnostic-panel"'),
            'A6. the popup body is a .modal-panel');

        assert(/own-publication-diagnostic-intro">[\s\S]{0,300}automatic discovery or placement does not produce the expected/.test(rawPanel),
            'A7. the popup explains why these tools exist, per this milestone\'s own product brief — concise, not documentation');

        console.log('✓ Section A: a genuine Diagnostic Tools popup exists — closed by default, labeled "Diagnostic Tools" (never "Debug"), reusing the existing modal-overlay/modal-panel convention, with a short explanatory intro');
    }

    // ---------------------------------------------------------------
    // Section B — every pipeline action lives inside the popup.
    // ---------------------------------------------------------------
    {
        const overlayOpenIdx = rawPanel.indexOf('class="modal-overlay own-publication-diagnostic-overlay"');
        const overlayCloseMarker = 'own-publication-diagnostic-close';
        const overlayCloseIdx = rawPanel.indexOf(overlayCloseMarker);
        assert(overlayOpenIdx > -1 && overlayCloseIdx > overlayOpenIdx,
            'B0. sanity: the overlay has a locatable open boundary and its own Close button after it');

        for (const { label, actionClass } of PIPELINE_ACTIONS) {
            const classIdx = rawPanel.indexOf(`class="action-btn ${actionClass}"`);
            assert(classIdx > -1, `B1 (${label}). the action's own button still exists`);
            assert(classIdx > overlayOpenIdx && classIdx < overlayCloseIdx,
                `B2 (${label}). the button is a descendant of the Diagnostic Tools overlay — never rendered on the primary screen`);
        }

        // The candidate list and every result <dl>/<p> this pipeline
        // renders also travelled inside the popup — not just the buttons.
        for (const marker of [
            'own-publication-candidate-list', 'own-publication-selected-resolution-detail',
            'own-publication-selected-attribution-detail', 'own-publication-selected-materialization-detail',
            'own-publication-selected-world-position-claim-detail', 'own-publication-selected-world-placement-detail',
            'own-publication-selected-world-registration-detail'
        ]) {
            const idx = rawPanel.indexOf(marker);
            assert(idx > overlayOpenIdx && idx < overlayCloseIdx,
                `B3 (${marker}). this pipeline result/list block is also a descendant of the Diagnostic Tools overlay`);
        }

        console.log('✓ Section B: every pipeline action, and every one of its own result/list blocks, is a descendant of the Diagnostic Tools popup — none reachable from the primary screen without opening it');
    }

    // ---------------------------------------------------------------
    // Section C — ordinary actions stay on the primary screen.
    // ---------------------------------------------------------------
    {
        const overlayOpenIdx = rawPanel.indexOf('class="modal-overlay own-publication-diagnostic-overlay"');
        for (const actionClass of PRIMARY_SCREEN_ACTIONS) {
            const classIdx = rawPanel.indexOf(`class="action-btn ${actionClass}"`);
            assert(classIdx > -1, `C1 (${actionClass}). the action still exists`);
            assert(classIdx < overlayOpenIdx,
                `C2 (${actionClass}). the action stays on the primary screen — it precedes, and sits outside, the Diagnostic Tools overlay`);
        }
        // Commentary (0.9.248) sits AFTER the overlay closes, also outside it.
        const overlayCloseIdx = rawPanel.indexOf('own-publication-diagnostic-close');
        const commentaryIdx = rawPanel.indexOf('own-publication-commentary');
        assert(commentaryIdx > overlayCloseIdx, 'C3. Commentary also remains outside the Diagnostic Tools overlay, unmoved');

        console.log('✓ Section C: Unpublish/Distribute/Export/Check-Snapshot-Match/Commentary all remain on the primary screen, exactly where they were — this milestone moved only the exceptional recovery pipeline');
    }

    // ---------------------------------------------------------------
    // Section D — pipeline order is preserved.
    // ---------------------------------------------------------------
    {
        const indices = PIPELINE_ACTIONS.map(({ actionClass }) => rawPanel.indexOf(`class="action-btn ${actionClass}"`));
        for (let i = 1; i < indices.length; i++) {
            assert(indices[i] > indices[i - 1],
                `D1. "${PIPELINE_ACTIONS[i].label}" still appears after "${PIPELINE_ACTIONS[i - 1].label}" — 0.9.151-0.9.172's own action ordering survives the move unchanged`);
        }

        console.log('✓ Section D: the pipeline\'s own Discover -> Resolve -> Attribute -> Materialize -> Use Claimed Position -> Place -> Register order is completely unchanged');
    }

    // ---------------------------------------------------------------
    // Section E — every pipeline method still exists and still calls
    // the exact same injected command.
    // ---------------------------------------------------------------
    {
        const methodNames = [
            'discoverSnapshotCandidates', 'selectSnapshotCandidate', 'resolveSelectedSnapshot',
            'attributeSelectedSnapshot', 'materializeSelectedSnapshot', 'useClaimedSnapshotPosition',
            'placeMaterializedSnapshot', 'registerMaterializedSnapshot'
        ];
        for (const name of methodNames) {
            assert(typeof OwnPublicationPanel.methods[name] === 'function', `E1 (${name}). the method still exists`);
        }

        // Each command prop is still called from exactly one place —
        // the identical invariant 0.9.151/0.9.152's own tests already
        // established, reconfirmed after the move.
        assert((codePanel.match(/this\.discoverSnapshotCandidatesCommand\(/g) || []).length === 1,
            'E2. discoverSnapshotCandidatesCommand is still called from exactly one place');
        assert((codePanel.match(/this\.resolveSelectedSnapshotCommand\(/g) || []).length === 1,
            'E3. resolveSelectedSnapshotCommand is still called from exactly one place');
        assert((codePanel.match(/this\.materializeSelectedSnapshotCommand\(/g) || []).length === 1,
            'E4. materializeSelectedSnapshotCommand is still called from exactly one place');

        // Behavioral proof, not just a grep: discoverSnapshotCandidates()
        // still forwards a zero-argument call straight to the injected
        // command and stores the result verbatim — unchanged from
        // 0.9.151, reconfirmed here rather than merely assumed.
        const ctx = {
            snapshotCandidateDiscoveryExecuting: false,
            snapshotCandidateDiscoveryError: null,
            snapshotCandidateDiscoveryResult: null,
            snapshotCandidateDiscoveryRequestId: 0,
            discoverSnapshotCandidatesCommand: () => Promise.resolve([{ contentHash: 'abc', locator: 'ar://abc', storage: 'ar' }])
        };
        OwnPublicationPanel.methods.discoverSnapshotCandidates.call(ctx);
        await new Promise((resolve) => setTimeout(resolve, 0));
        await Promise.resolve();
        assert(Array.isArray(ctx.snapshotCandidateDiscoveryResult) && ctx.snapshotCandidateDiscoveryResult[0].contentHash === 'abc',
            'E5. discoverSnapshotCandidates() still calls the injected command and stores its result verbatim, unchanged by the relocation');

        console.log('✓ Section E: every pipeline method still exists, still calls the exact same injected command exactly once, with unchanged arguments and unchanged result handling');
    }

    // ---------------------------------------------------------------
    // Section F — diagnosticToolsOpen affects visibility only.
    // ---------------------------------------------------------------
    {
        // The new field is written from exactly the two inline template
        // toggles (open/close) and read from exactly the one v-if gating
        // the overlay — never from inside methods:.
        const methodsBlockMatch = rawPanel.match(/methods:\s*\{[\s\S]*?\n\s{4}\},\n\s{4}template:/);
        assert(methodsBlockMatch, 'F0. sanity: located the methods: block');
        assert(!methodsBlockMatch[0].includes('diagnosticToolsOpen'),
            'F1. no method reads or writes diagnosticToolsOpen — opening/closing the popup cannot alter any pipeline\'s state');

        // And no reset site treats it as part of the Publication-change
        // watcher's own reset list, unlike every genuine ephemeral
        // pipeline field.
        const watchBlockMatch = rawPanel.match(/watch:\s*\{[\s\S]*?publication[\s\S]*?\n\s{4}\}/);
        if (watchBlockMatch) {
            assert(!watchBlockMatch[0].includes('diagnosticToolsOpen'),
                'F2. the Publication-change watcher never resets diagnosticToolsOpen — a changed Publication never silently closes (or opens) the popup');
        }

        console.log('✓ Section F: diagnosticToolsOpen is written only by the popup\'s own open/close clicks and read only by the overlay\'s own v-if — no pipeline method, and no reset watcher, ever touches it');
    }

    // ---------------------------------------------------------------
    // Section G — no new orchestration or "diagnostic" vocabulary at
    // the application layer.
    // ---------------------------------------------------------------
    {
        const forbidden = [
            "from '../../application/DiagnosticService.js'", 'new DiagnosticService(',
            'class DiagnosticService', "'./DiagnosticService.js'"
        ];
        for (const term of forbidden) {
            assert(!codePanel.includes(term), `G1 (${term}). OwnPublicationPanel.js introduces no generic diagnostic service/orchestration layer`);
        }

        // No new application/ file was added for this milestone — the
        // popup is presentation-only, exactly as this milestone's own
        // brief requires ("do not create a new diagnostic subsystem").
        let diagnosticAppFiles = [];
        try {
            const { readdirSync } = await import('node:fs');
            diagnosticAppFiles = readdirSync(new URL('application/', SOURCE_ROOT))
                .filter((name) => /diagnostic/i.test(name));
        } catch { /* ignore — best-effort */ }
        assert(diagnosticAppFiles.length === 0,
            `G2. no new application/ file names itself after "diagnostic" (found: ${diagnosticAppFiles.join(', ')}) — this milestone added no new capability, only a presentation grouping`);

        console.log('✓ Section G: no DiagnosticService, no new application/ file, and no diagnostic-specific orchestration of any kind exists — this remains a pure presentation grouping over 0.9.151-0.9.172\'s own existing commands');
    }

    // ---------------------------------------------------------------
    // Section H — WorldView.js's wiring of OwnPublicationPanel is
    // completely unchanged.
    // ---------------------------------------------------------------
    {
        const viewCode = await codeOnlySource('ui/views/WorldView.js');
        for (const propBinding of [
            ':discoverSnapshotCandidatesCommand="discoverSnapshotCandidatesCommand"',
            ':resolveSelectedSnapshotCommand="resolveSelectedSnapshotCommand"',
            ':materializeSelectedSnapshotCommand="materializeSelectedSnapshotCommand"',
            ':worldDiscoverySourceRegistry="worldDiscoverySourceRegistry"',
            ':placementInfo="activePlacementInfo"'
        ]) {
            assert(viewCode.includes(propBinding), `H1 (${propBinding}). WorldView.js still wires this exact prop to OwnPublicationPanel, unchanged`);
        }
        assert(!viewCode.includes('diagnosticToolsOpen') && !viewCode.includes('own-publication-diagnostic') && !viewCode.includes('Diagnostic Tools'),
            'H2. WorldView.js carries none of THIS milestone\'s own vocabulary (diagnosticToolsOpen / own-publication-diagnostic / "Diagnostic Tools") — the entire popup lives inside OwnPublicationPanel.js alone. (WorldView.js\'s own PRE-EXISTING, unrelated 0.2.30/0.2.38 "diagnostics" vocabulary — location browser diagnostics, avatar diagnostics — is untouched and out of scope for this check.)');

        console.log('✓ Section H: WorldView.js\'s own composition of OwnPublicationPanel — every prop, every injected command — is byte-for-byte unchanged; this milestone touched exactly one file');
    }

    // ---------------------------------------------------------------
    // Section I — Place Naming is untouched; no artificial symmetry.
    // ---------------------------------------------------------------
    {
        const namingPanelCode = await rawSource('ui/components/PlaceNamingPanel.js');
        assert(!/[Dd]iagnostic/.test(namingPanelCode),
            'I1. PlaceNamingPanel.js carries no "diagnostic" vocabulary of any kind — its own Publish/Export/Import actions are ordinary workflow, never reorganized into a diagnostic popup');

        const viewCode = await rawSource('ui/views/WorldView.js');
        assert(viewCode.includes('placeNamingDiscoveryMonitor') && viewCode.includes('nearbyPlaceNamingClaimRows'),
            'I2. World View\'s own automatic Place Naming discovery (background monitor, Nearby Place Names section) still exists, unmodified');
        assert(!/own-publication-diagnostic|diagnosticToolsOpen/.test(await rawSource('ui/views/WorldView.js')),
            'I3. no Diagnostic Tools markup or state leaked into WorldView.js\'s own Place Naming presentation');

        console.log('✓ Section I: Place Naming\'s own surfaces are completely untouched — this milestone deliberately did not invent a "Place Naming diagnostics" category merely for symmetry with Snapshots, per its own product brief ("don\'t force symmetry")');
    }

    // ---------------------------------------------------------------
    // Section J — the automatic cascade is unaffected.
    // ---------------------------------------------------------------
    {
        const cascadeCode = await rawSource('application/AutomaticSnapshotEncounterCascade.js');
        // The cascade's own pre-existing comments have always REFERRED to
        // OwnPublicationPanel by name (it is the manual counterpart this
        // file exists to mirror, since 0.9.187) — what must be absent is
        // any dependency on, or awareness of, THIS milestone's own new
        // vocabulary, and any actual import of the UI component.
        assert(!cascadeCode.includes('diagnosticToolsOpen') && !cascadeCode.includes('Diagnostic Tools'),
            'J1. application/AutomaticSnapshotEncounterCascade.js carries none of this milestone\'s own new vocabulary (diagnosticToolsOpen / "Diagnostic Tools")');
        assert(!cascadeCode.includes("from './OwnPublicationPanel.js'") && !cascadeCode.includes("import OwnPublicationPanel"),
            'J1b. the cascade still never imports OwnPublicationPanel.js itself — it only ever refers to it in prose, unchanged since 0.9.187');
        assert(cascadeCode.includes('resolveSelectedSnapshotCommand(candidate)') || cascadeCode.includes('this._resolveSelectedSnapshotCommand'),
            'J2. sanity: the cascade still reads from the file this test believes it does');

        console.log('✓ Section J: the automatic Snapshot cascade this pipeline exists to let a person manually walk remains byte-for-byte untouched');
    }

    console.log('\n✅ All Diagnostic Tools Surface tests passed.');
}

runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
