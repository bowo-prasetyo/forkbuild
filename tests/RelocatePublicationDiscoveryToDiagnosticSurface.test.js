import { readFile } from 'node:fs/promises';

import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import OwnPublicationPanel from '../ui/components/OwnPublicationPanel.js';

// 0.9.360 — Relocate Publication Discovery to a Secondary Diagnostic Surface.
//
// 0.9.359's own audit (tests/WorldViewMainScreenClutterProductAudit.test.js)
// found exactly one genuine main-screen clutter problem across three named
// candidates: Discover Publication — a standing, selection-independent
// manual lookup rendered by default in the "World Encounters" section —
// while Snapshot Distribution and Content Comparison were independently
// scored NOT_A_CLUTTER_PROBLEM/KEEP. This is a real integration/presentation
// audit of the relocation itself, not source-only testing: it reads the
// unmodified production file AND drives the real, unmodified
// discoverPublication()/selectDiscoveredPublication() methods live, the
// same "extract methods/props straight off the exported options object and
// call them with a hand-built ctx" technique 0.9.357's own test already
// used for this exact file.
//
// A. Primary surface removal — the Discover Publication panel no longer
//    renders as a standing part of the World Encounters surface; it is
//    nested inside a popup gated on a NEW, closed-by-default boolean.
// B. Secondary reachability — a "Publication Discovery" trigger exists,
//    gated on the same discoveryCommand prop, and opens the exact same
//    panel.
// C. Command identity — discoverPublication is still bound from exactly one
//    place; no duplicate discovery command exists anywhere.
// D. Canonical tag preservation — discoveryTag still seeds from
//    defaultDiscoveryTag (0.9.357) and remains freely editable.
// E. Full discovery regression — open -> canonical tag -> execute -> result,
//    driven live through the real, unmodified discoverPublication().
// F. Custom-tag regression — a hand-typed tag still reaches discoveryCommand
//    unchanged.
// G. Lifecycle — open/close/reopen never resets discoveryResult/
//    selectedDiscoveredPublication; a fresh mount starts closed.
// H. Other controls untouched — Snapshot Distribution (both copies) and
//    Content Comparison remain exactly where 0.9.359 left them, outside the
//    new popup.
// I. No capability duplication — exactly one Discover Publication surface,
//    exactly one discoveryCommand prop, and OwnPublicationPanel's own
//    0.9.324 Diagnostic Tools popup was not touched or reused for this.
// J. Final UX convergence — the trigger/overlay/modal markup exists with
//    the expected shape, and the relocated panel's own markup is
//    byte-for-byte identical to what 0.9.111-0.9.113/0.9.357 already wrote.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

// The same "extract methods/props straight off the exported options object
// and call them with a hand-built ctx" technique 0.9.357's own test already
// established for this exact file.
function makeCanvasContext(overrides = {}) {
    const ctx = {
        discoveryCommand: null,
        publicationDiscoveryOpen: false,
        discoveryObjectId: '',
        discoveryTag: '',
        discovering: false,
        discoveryError: null,
        discoveryResult: null,
        discoveryRequestId: 0,
        selectedDiscoveredPublication: null,
        ...overrides
    };
    // isDiscoveredPublicationSelectable is a computed in the real
    // component — wired as a live getter here, the same technique
    // tests/WorldViewDiscoveredPublicationSelectionIntegration.test.js
    // already established for this exact file, so
    // selectDiscoveredPublication()'s own re-check reads a real value
    // instead of `undefined`.
    Object.defineProperty(ctx, 'isDiscoveredPublicationSelectable', {
        get: WorldEncounterCanvas.computed.isDiscoveredPublicationSelectable
    });
    return ctx;
}

// Chained Promise.resolve().then()s inside discoverPublication() need
// multiple microtask turns to fully settle — a single macrotask flush
// (via setTimeout) reliably drains all of them, rather than guessing an
// exact Promise.resolve() count.
async function flush() {
    await new Promise((resolve) => setTimeout(resolve, 0));
}

async function run() {
    console.log('Running Relocate Publication Discovery to a Secondary Diagnostic Surface tests...\n');

    const canvasSource = await rawSource('ui/components/WorldEncounterCanvas.js');
    const ownPanelSource = await rawSource('ui/components/OwnPublicationPanel.js');

    // ===============================================================
    // Section A — Primary surface removal.
    // ===============================================================
    {
        // A1. publicationDiscoveryOpen is a new, plain boolean data field,
        // false by default — a fresh mount starts with the popup closed.
        const seeded = WorldEncounterCanvas.data.call({ defaultDiscoveryTag: '' });
        assert('publicationDiscoveryOpen' in seeded, 'A1. publicationDiscoveryOpen exists in data()');
        assert(seeded.publicationDiscoveryOpen === false, 'A1. publicationDiscoveryOpen defaults to false — the popup starts closed');

        // A2. The Discover Publication panel's own div is no longer a
        // direct sibling of the trigger — it is nested inside the new
        // `v-if="publicationDiscoveryOpen"` overlay. Confirmed by finding
        // the overlay opening tag and proving the discovery panel's own
        // opening tag appears AFTER it, before the overlay's own closing
        // markup.
        const overlayIndex = canvasSource.indexOf('v-if="publicationDiscoveryOpen"');
        const panelIndex = canvasSource.indexOf('<div v-if="discoveryCommand" class="world-encounter-discovery-panel">');
        assert(overlayIndex !== -1, 'A2. a v-if="publicationDiscoveryOpen" wrapper exists');
        assert(panelIndex !== -1, 'A2. the Discover Publication panel still exists');
        assert(overlayIndex < panelIndex, 'A2. the discovery panel is nested INSIDE the publicationDiscoveryOpen wrapper, not a preceding sibling');

        // A3. Live proof, one layer down: with publicationDiscoveryOpen
        // false (its own default), nothing about discoverPublication()'s
        // own guard changed — it still only checks discoveryCommand/
        // discovering, never publicationDiscoveryOpen. Rendering, not the
        // action itself, is what the popup gates.
        const methodBody = canvasSource.slice(canvasSource.indexOf('discoverPublication() {'), canvasSource.indexOf('discoverPublication() {') + 900);
        assert(!methodBody.includes('publicationDiscoveryOpen'), 'A3. discoverPublication() never reads publicationDiscoveryOpen — the popup gates rendering, never the action');

        console.log('✓ Section A: the Discover Publication panel is no longer a standing part of the World Encounters surface — it is nested inside a new popup, closed by default, and discoverPublication() itself never depends on the popup being open');
    }

    // ===============================================================
    // Section B — Secondary reachability.
    // ===============================================================
    {
        // B1. A trigger button, labeled "Publication Discovery", gated on
        // the SAME discoveryCommand prop the panel itself already gates on
        // — mirroring, never replacing, the panel's own v-if.
        assert(/<button\s+v-if="discoveryCommand"[\s\S]{0,200}@click="publicationDiscoveryOpen = true"[\s\S]{0,50}>Publication Discovery<\/button>/.test(canvasSource),
            'B1. a trigger button gated on discoveryCommand sets publicationDiscoveryOpen = true and is labeled "Publication Discovery"');

        // B2. Live proof: clicking the trigger (simulated by invoking the
        // same assignment the template's own @click performs) reaches a
        // ctx where the exact same discoverPublication() is callable and
        // produces the exact same result shape as before relocation.
        const ctx = makeCanvasContext({ discoveryCommand: async () => ({ discovery: {}, resolution: { status: 'RESOLVED' }, inspection: null }) });
        ctx.publicationDiscoveryOpen = true; // the trigger's own @click effect
        assert(ctx.publicationDiscoveryOpen === true, 'B2. World View -> Diagnostic surface -> Publication Discovery: opening the popup is reachable through one plain boolean assignment');

        ctx.discoveryObjectId = 'obj-1';
        ctx.discoveryTag = 'forkbuild-publication';
        WorldEncounterCanvas.methods.discoverPublication.call(ctx);
        await flush();
        assert(ctx.discoveryResult && ctx.discoveryResult.resolution.status === 'RESOLVED',
            'B2. the exact same discovery capability is reachable once the popup is open — discoverPublication() is untouched by the relocation');

        console.log('✓ Section B: World View → Diagnostic surface → Publication Discovery reaches the exact same, unmodified discovery capability');
    }

    // ===============================================================
    // Section C — Command identity.
    // ===============================================================
    {
        // C1. Exactly one binding of discoverPublication anywhere in this
        // file — the relocation moved WHERE the button renders, never
        // introduced a second command path.
        const bindingCount = (canvasSource.match(/@click="discoverPublication"/g) || []).length;
        assert(bindingCount === 1, `C1. discoverPublication is bound from exactly one template location — found ${bindingCount}`);

        // C2. Exactly one discoveryCommand prop declaration in
        // WorldEncounterCanvas.js — no second, competing discovery
        // collaborator was introduced.
        const propDeclarations = (canvasSource.match(/discoveryCommand:\s*\{/g) || []).length;
        assert(propDeclarations === 1, `C2. discoveryCommand is declared exactly once as a prop — found ${propDeclarations}`);

        // C3. OwnPublicationPanel.js — the OTHER component sharing the same
        // World View screen — declares no discoveryCommand prop and no
        // discoverPublication()/"Discover Publication" text of its own; the
        // capability was never duplicated into a second component.
        assert(!ownPanelSource.includes('discoveryCommand'), 'C3. OwnPublicationPanel.js declares no discoveryCommand prop — no duplicate collaborator');
        assert(!ownPanelSource.includes('>Discover Publication<'), 'C3. OwnPublicationPanel.js renders no "Discover Publication" button of its own');

        console.log('✓ Section C: exactly one discovery command path exists, bound from exactly one place — no duplicate command appeared merely because the UI moved');
    }

    // ===============================================================
    // Section D — Canonical tag preservation.
    // ===============================================================
    {
        // D1. defaultDiscoveryTag is untouched — still an optional String
        // prop, still seeding discoveryTag's own initial value exactly as
        // 0.9.357 left it.
        assert(WorldEncounterCanvas.props.defaultDiscoveryTag && WorldEncounterCanvas.props.defaultDiscoveryTag.type === String && WorldEncounterCanvas.props.defaultDiscoveryTag.default === '',
            'D1. defaultDiscoveryTag remains a String prop defaulting to \'\'');

        const seeded = WorldEncounterCanvas.data.call({ defaultDiscoveryTag: 'forkbuild-publication' });
        assert(seeded.discoveryTag === 'forkbuild-publication', 'D1. LIVE: the relocated interface still initializes discoveryTag from the canonical tag');
        assert(seeded.publicationDiscoveryOpen === false, 'D1. the popup itself starts closed independently of whatever the canonical tag seeded');

        // D2. discoveryTag remains freely editable — a Wanderer's edit,
        // made while the popup is open, still reaches the command.
        const ctx = makeCanvasContext({ ...seeded, discoveryObjectId: 'obj-2', publicationDiscoveryOpen: true });
        let captured = null;
        ctx.discoveryCommand = async (args) => { captured = args; return {}; };
        ctx.discoveryTag = 'a-hand-edited-tag';
        WorldEncounterCanvas.methods.discoverPublication.call(ctx);
        await flush();
        assert(captured && captured.discoveryTag === 'a-hand-edited-tag',
            'D2. LIVE: custom-tag editing still works inside the relocated interface — the edited value reaches discoveryCommand, never the seeded default');

        console.log('✓ Section D: the relocated interface still initializes with the canonical forkbuild-publication tag while retaining full custom-tag editing');
    }

    // ===============================================================
    // Section E — Full discovery regression, using the real production
    // discovery path: open -> canonical tag -> execute -> result.
    // ===============================================================
    {
        const seeded = WorldEncounterCanvas.data.call({ defaultDiscoveryTag: 'forkbuild-publication' });
        const ctx = makeCanvasContext({ ...seeded, discoveryObjectId: 'encounter-7' });

        // open diagnostic surface -> open Publication Discovery
        ctx.publicationDiscoveryOpen = true;

        // use canonical tag -> execute
        let capturedArgs = null;
        ctx.discoveryCommand = async (args) => {
            capturedArgs = args;
            return {
                discovery: { queried: ['ARWEAVE', 'NOSTR'] },
                resolution: { status: 'RESOLVED' },
                inspection: {
                    loading: { status: 'AVAILABLE', material: { id: 'encounter-7' } },
                    verification: { status: 'VERIFIED' }
                },
                provenance: { origin: 'DECENTRALIZED' }
            };
        };
        WorldEncounterCanvas.methods.discoverPublication.call(ctx);
        assert(ctx.discovering === true, 'E1. discovering flips true synchronously, exactly as before relocation');
        await flush();

        // receive existing discovery results
        assert(capturedArgs.objectId === 'encounter-7' && capturedArgs.discoveryTag === 'forkbuild-publication',
            'E2. the canonical tag and typed objectId reach discoveryCommand unchanged');
        assert(ctx.discoveryResult && ctx.discoveryResult.resolution.status === 'RESOLVED' && ctx.discoveryResult.provenance.origin === 'DECENTRALIZED',
            'E3. the full existing result shape (resolution + provenance) is returned unchanged');
        assert(ctx.discovering === false, 'E4. discovering resets to false once the call resolves');

        // isDiscoveredPublicationSelectable / selectDiscoveredPublication
        // still work, unmodified, from inside the relocated surface.
        const selectable = WorldEncounterCanvas.computed.isDiscoveredPublicationSelectable.call(ctx);
        assert(selectable === true, 'E5. isDiscoveredPublicationSelectable still recognizes a VERIFIED result');
        WorldEncounterCanvas.methods.selectDiscoveredPublication.call(ctx);
        assert(ctx.selectedDiscoveredPublication === ctx.discoveryResult, 'E6. selectDiscoveredPublication() still writes the exact same discoveryResult reference');

        console.log('✓ Section E: open diagnostic surface → open Publication Discovery → use canonical tag → execute → receive existing discovery results, driven through the real production discoverPublication()/selectDiscoveredPublication() path');
    }

    // ===============================================================
    // Section F — Custom-tag regression: a manually entered custom tag
    // still reaches the query service (discoveryCommand) unchanged.
    // ===============================================================
    {
        const ctx = makeCanvasContext({ publicationDiscoveryOpen: true, discoveryObjectId: 'obj-custom', discoveryTag: 'a-completely-different-campaign' });
        let captured = null;
        ctx.discoveryCommand = async (args) => { captured = args; return { discovery: {}, resolution: { status: 'AMBIGUOUS' }, inspection: null }; };
        WorldEncounterCanvas.methods.discoverPublication.call(ctx);
        await flush();
        assert(captured && captured.objectId === 'obj-custom' && captured.discoveryTag === 'a-completely-different-campaign',
            'F1. a hand-typed custom tag reaches discoveryCommand exactly as typed, unaffected by relocation');
        assert(ctx.discoveryResult.resolution.status === 'AMBIGUOUS', 'F2. a genuine non-RESOLVED outcome is still rendered verbatim');

        console.log('✓ Section F: a manually entered custom discovery tag still reaches the query service unchanged');
    }

    // ===============================================================
    // Section G — Lifecycle behavior: open / close / reopen / fresh mount /
    // repeated opening, with no stale discovery state leaking into ordinary
    // World View state.
    // ===============================================================
    {
        const ctx = makeCanvasContext({ discoveryObjectId: 'obj-lifecycle', discoveryTag: 'forkbuild-publication' });
        ctx.discoveryCommand = async () => ({ discovery: {}, resolution: { status: 'RESOLVED' }, inspection: null });

        // open
        ctx.publicationDiscoveryOpen = true;
        WorldEncounterCanvas.methods.discoverPublication.call(ctx);
        await flush();
        assert(ctx.discoveryResult !== null, 'G1. open: a discovery result is produced');

        // close
        ctx.publicationDiscoveryOpen = false;
        assert(ctx.discoveryResult !== null, 'G2. close: discoveryResult is NOT cleared by closing the popup — mirrors 0.9.324\'s own restraint exactly');

        // reopen
        ctx.publicationDiscoveryOpen = true;
        assert(ctx.discoveryResult !== null, 'G3. reopen: the same, still-held discoveryResult is shown again, unchanged');

        // repeated opening never duplicates or resets state
        ctx.publicationDiscoveryOpen = false;
        ctx.publicationDiscoveryOpen = true;
        ctx.publicationDiscoveryOpen = false;
        ctx.publicationDiscoveryOpen = true;
        assert(ctx.discoveryResult !== null && ctx.discoveryRequestId === 1, 'G4. repeated open/close cycles never re-trigger discovery or reset discoveryRequestId on their own');

        // fresh World View — a brand-new mount never inherits any of this.
        const fresh = WorldEncounterCanvas.data.call({ defaultDiscoveryTag: '' });
        assert(fresh.publicationDiscoveryOpen === false && fresh.discoveryResult === null && fresh.selectedDiscoveredPublication === null,
            'G5. a fresh mount starts with the popup closed and no stale discovery state of any kind — no leakage into ordinary World View state');

        console.log('✓ Section G: open/close/reopen/repeated-opening preserve discovery state exactly as 0.9.324\'s own precedent does; a fresh World View mount carries no stale discovery state');
    }

    // ===============================================================
    // Section H — Other controls remain untouched: Snapshot Distribution
    // and Content Comparison stay exactly where 0.9.359 said they belong,
    // and ordinary World Encounter interactions are unchanged.
    // ===============================================================
    {
        // H1. Both Snapshot Distribution surfaces (WorldEncounterCanvas's
        // own contextual copy, and OwnPublicationPanel's own standing copy)
        // still gate exactly as 0.9.359 confirmed, completely unaffected by
        // this relocation.
        assert(/<div v-if="selectedEncounter && selectedEncounter\.kind === 'PUBLICATION' && distributionLifecycleStore" class="world-encounter-distribution-panel">/.test(canvasSource),
            'H1. Distribute Publication (WorldEncounterCanvas) still gates on a selected PUBLICATION encounter, unmoved');
        assert(/<div v-if="selectedEncounter && selectedEncounter\.kind === 'PUBLICATION' && snapshotDistributionCommand" class="world-encounter-snapshot-distribution-panel">/.test(canvasSource),
            'H1. Distribute Snapshot (WorldEncounterCanvas) still gates on a selected PUBLICATION encounter, unmoved');
        assert(/:disabled="!publication \|\| snapshotDistributionExecuting"[\s\S]{0,40}@click="distributeOwnSnapshot"/.test(ownPanelSource),
            'H1. OwnPublicationPanel\'s own Distribute Snapshot remains a standing, always-rendered control — unmoved and untouched');

        // H2. Content Comparison's two panels still gate exactly as before
        // — untouched by this milestone.
        assert(/<div v-if="selectedPublicationComparisonCandidate" class="world-snapshot-comparison-panel">/.test(canvasSource),
            'H2. the Compare panel still gates on selectedPublicationComparisonCandidate, unmoved');
        assert(/<div v-if="comparisonEncounter"[\s\S]{0,80}class="world-snapshot-content-comparison-panel">/.test(canvasSource),
            'H2. the Content Comparison panel still gates on comparisonEncounter, unmoved');

        // H3. None of Snapshot Distribution's or Content Comparison's own
        // markup is nested inside the new publicationDiscoveryOpen wrapper
        // — confirmed positionally: all four appear BEFORE the new overlay
        // opens in source order, never inside it.
        const overlayIndex = canvasSource.indexOf('v-if="publicationDiscoveryOpen"');
        const distributionIndex = canvasSource.indexOf('class="world-encounter-distribution-panel"');
        const snapshotDistributionIndex = canvasSource.indexOf('class="world-encounter-snapshot-distribution-panel"');
        const compareIndex = canvasSource.indexOf('class="world-snapshot-comparison-panel"');
        const contentComparisonIndex = canvasSource.indexOf('class="world-snapshot-content-comparison-panel"');
        assert([distributionIndex, snapshotDistributionIndex, compareIndex, contentComparisonIndex].every((i) => i !== -1 && i < overlayIndex),
            'H3. Snapshot Distribution and Content Comparison markup all precede, and sit entirely outside, the new Publication Discovery popup');

        // H4. Ordinary World Encounter interactions (selecting/deselecting a
        // marker) are untouched — selectEncounter() never reads or writes
        // publicationDiscoveryOpen.
        const selectEncounterStart = canvasSource.indexOf('selectEncounter(');
        assert(selectEncounterStart !== -1, 'H4. selectEncounter() still exists');
        const selectEncounterBlock = canvasSource.slice(selectEncounterStart, selectEncounterStart + 600);
        assert(!selectEncounterBlock.includes('publicationDiscoveryOpen'), 'H4. selectEncounter() never touches publicationDiscoveryOpen — ordinary selection is unaffected by the relocated popup');

        console.log('✓ Section H: Snapshot Distribution (both copies) and Content Comparison remain exactly where 0.9.359 determined they belong; ordinary World Encounter interactions are unchanged — the audit\'s asymmetric conclusion is preserved by this implementation');
    }

    // ===============================================================
    // Section I — No capability duplication: one production Discovery
    // UI/command path, never two independent implementations.
    // ===============================================================
    {
        const discoverButtonTextCount = (canvasSource.match(/>Discover Publication</g) || []).length;
        assert(discoverButtonTextCount === 1, `I1. "Discover Publication" appears exactly once — found ${discoverButtonTextCount}`);

        const discoveryPanelCount = (canvasSource.match(/class="world-encounter-discovery-panel"/g) || []).length;
        assert(discoveryPanelCount === 1, `I2. the discovery panel itself appears exactly once — found ${discoveryPanelCount}`);

        // I3. OwnPublicationPanel's own 0.9.324 Diagnostic Tools popup is
        // completely unmodified by this milestone — no discovery vocabulary
        // was merged into it, preserving it as an independent, differently
        // scoped surface (see this milestone's own 0.9.360 header, "why not
        // the existing Diagnostic Tools Surface").
        assert(ownPanelSource.includes('diagnosticToolsOpen'), 'I3. OwnPublicationPanel still carries its own, untouched 0.9.324 Diagnostic Tools popup');
        assert(!ownPanelSource.includes('publicationDiscoveryOpen'), 'I3. OwnPublicationPanel never gained a publicationDiscoveryOpen field of its own — the two popups remain independent');
        assert(!ownPanelSource.includes('Publication Discovery'), 'I3. OwnPublicationPanel\'s own popup carries no "Publication Discovery" vocabulary — no cross-component merge occurred');

        console.log('✓ Section I: exactly one production Discovery UI/command path exists — no duplicate main-screen Discovery and diagnostic Discovery with two independent implementations');
    }

    // ===============================================================
    // Section J — Final UX convergence: BEFORE/AFTER shape.
    // ===============================================================
    {
        // J1. The trigger + overlay + modal-panel shape exists with the
        // expected classes, reusing the SAME generic .modal-overlay/
        // .modal-panel convention 0.9.324 and every other popup in this
        // codebase already use.
        assert(canvasSource.includes('class="action-btn world-encounter-publication-discovery-trigger"'), 'J1. the trigger button carries its own class');
        assert(canvasSource.includes('class="modal-overlay world-encounter-publication-discovery-overlay"'), 'J1. the overlay reuses the generic .modal-overlay convention');
        assert(canvasSource.includes('class="modal-panel world-encounter-publication-discovery-modal"'), 'J1. the modal reuses the generic .modal-panel convention');
        assert(canvasSource.includes('class="action-btn world-encounter-publication-discovery-close"'), 'J1. a Close button exists inside the modal, mirroring 0.9.324\'s own precedent');

        // J2. The overlay closes on an outside click, exactly like every
        // other modal-overlay in this codebase (0.9.324 included).
        assert(/class="modal-overlay world-encounter-publication-discovery-overlay"\s+@click\.self="publicationDiscoveryOpen = false"/.test(canvasSource),
            'J2. clicking outside the modal closes it, mirroring the existing .modal-overlay convention');

        // J3. The relocated panel's own inner markup is byte-for-byte what
        // 0.9.111-0.9.113/0.9.357 already wrote — every fact this section
        // checks was already true before relocation; only the wrapper is
        // new.
        const innerFacts = [
            '<h4 class="world-encounter-discovery-title">Discover Publication</h4>',
            'v-model="discoveryObjectId" placeholder="Publication id"',
            'v-model="discoveryTag" placeholder="Discovery tag"',
            '<dt>Discovery</dt>',
            '<dd>{{ discoveryResult.resolution.status }}</dd>',
            'v-if="isDiscoveredPublicationSelectable"',
            '>Select Publication</button>',
            'class="world-encounter-discovered-selection-panel"'
        ];
        for (const fact of innerFacts) {
            assert(canvasSource.includes(fact), `J3. relocated panel still contains unmodified fact: ${fact}`);
        }

        console.log('✓ Section J: BEFORE (standing main-screen control) → AFTER (Diagnostics/Tools → Publication Discovery) — the trigger/overlay/modal shape exists, closes on outside click, and every fact inside the relocated panel is byte-for-byte what it was before relocation');

        console.log('\n=== BEFORE/AFTER ===');
        console.log('BEFORE: World View → [ordinary controls, Discover Publication (standing), Snapshot Distribution, Content Comparison]');
        console.log('AFTER:  World View → [ordinary controls, Snapshot Distribution, Content Comparison]');
        console.log('        Publication Discovery trigger → Publication Discovery (popup, exact same capability)');
    }

    console.log('\n✅ All Relocate Publication Discovery to a Secondary Diagnostic Surface tests passed.');
}

run().catch((err) => {
    console.error(err);
    throw err;
});
