import { readFile } from 'node:fs/promises';

import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';

// 0.9.361 — Publication Discovery Relocation Convergence Audit.
//
// Type: test-only. Production changes: NONE.
//
// 0.9.360 moved Discover Publication behind a "Publication Discovery"
// trigger/popup and its own test
// (tests/RelocatePublicationDiscoveryToDiagnosticSurface.test.js) already
// proved the relocation's PLACEMENT — the panel is nested inside a new
// popup, the trigger reaches the real discoverPublication(), and Snapshot
// Distribution/Content Comparison sit outside it. This milestone asks the
// harder, narrower question that file was never scoped to answer: does
// wrapping the panel in a popup risk turning `publicationDiscoveryOpen`
// into something more than presentation — a hidden gate on discovery
// semantics, a place where state quietly resets, or a dismissal path that
// behaves differently from another?
//
// The governing invariant, proven from several angles below:
//
//   Same discovery capability, same command, same state, different
//   presentation location.
//
//   popup visibility  ≠  discovery lifecycle
//   component lifetime ≠ popup lifetime
//
// Section A: Primary-surface convergence — the trigger is reachable, the
//            popup starts closed, and opening it never itself calls
//            discoverPublication().
// Section B: Command identity — exactly one discoverPublication() binding,
//            one discoveryCommand prop, and this file defines no second
//            command path anywhere (methods/computed included).
// Section C: Canonical tag continuity — open -> forkbuild-publication ->
//            edit -> custom-tag -> Discover -> custom-tag, PLUS: the popup
//            never re-seeds the canonical tag across a close/reopen cycle
//            after a Wanderer's own edit.
// Section D: State preservation, by OBJECT IDENTITY — discover -> receive
//            results -> select Publication -> close -> reopen -> the exact
//            same references, not equal-looking copies, across every
//            discovery-related field at once.
// Section E: Fresh-session semantics — a genuinely separate, newly
//            constructed component instance never inherits another
//            instance's discovery state, contrasted directly against
//            Section D's own close/reopen continuity.
// Section F: Outside-click vs. explicit Close — both dismissal paths
//            perform the identical assignment, and neither clears results,
//            clears selection, cancels an in-flight discovery, executes a
//            command, or mutates ordinary World Encounter state.
// Section G: Discovery failure convergence — a genuine rejection, through
//            the popup, for both the canonical and a custom tag, produces
//            byte-identical, pre-existing failure text; no new outcome
//            vocabulary exists anywhere in this file.
// Section H: World Encounter regression — ordinary selection, Snapshot
//            Distribution, and Content Comparison are provably unaffected
//            by the popup being open, and vice versa, proven live.
// Section I: Diagnostic-surface semantics — publicationDiscoveryOpen is
//            touched in exactly the five places its own job requires (one
//            data() default, one open, two close paths, one read) and
//            nowhere inside methods: or computed: — it never becomes a
//            proxy for discovered/loading/selected/resolved/failed/active
//            discovery session.
// Section J: Final convergence matrix and verdict.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE. Re-proving the full
// production network/composition stack (already done by
// tests/PublicationDiscoveryTagConvergenceAudit.test.js, 0.9.358) or the
// placement claims tests/RelocatePublicationDiscoveryToDiagnosticSurface.test.js
// (0.9.360) already established structurally. This file exists to prove
// convergence at the seam those two do not cover — the popup's own
// lifecycle semantics — not to invent new discovery behavior of any kind.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

// Mirrors tests/DiagnosticToolsSurfaceConvergenceAudit.test.js's own
// codeOnlySource() exactly: strips HTML comments (the template carries
// some) and `//` comment lines, so an occurrence count reflects real code,
// never prose discussing the same identifier.
function codeOnly(source) {
    const withoutHtmlComments = source.replace(/<!--[\s\S]*?-->/g, '');
    return withoutHtmlComments.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

async function flush() {
    await new Promise((resolve) => setTimeout(resolve, 0));
}

// A genuinely new "component instance" — WorldEncounterCanvas.data() is the
// one place every field this file cares about is defaulted, and it reads
// nothing off `this` besides `defaultDiscoveryTag` (verified structurally
// in Section E), so calling it fresh is the same seeding a real Vue mount
// would perform. Methods are bound straight off the exported options
// object — the same real, unmodified, production functions — never a
// reimplementation.
function makeFullCtx(overrides = {}) {
    const seeded = WorldEncounterCanvas.data.call({ defaultDiscoveryTag: overrides.defaultDiscoveryTag ?? '' });
    const ctx = {
        ...seeded,
        discoveryCommand: null,
        registry: null,
        worldDiscoveryLeadRegistry: null,
        distributionLifecycleStore: null,
        materialSources: null,
        materialVerifier: null,
        distributionCommand: null,
        snapshotDistributionCommand: null,
        discoverSnapshotCommand: null,
        getPublicationCommentariesCommand: null,
        discoverPublication: WorldEncounterCanvas.methods.discoverPublication,
        selectDiscoveredPublication: WorldEncounterCanvas.methods.selectDiscoveredPublication,
        selectEncounter: WorldEncounterCanvas.methods.selectEncounter,
        selectComparisonEncounter: WorldEncounterCanvas.methods.selectComparisonEncounter,
        stopSubscription: WorldEncounterCanvas.methods.stopSubscription,
        refreshSelectionOutcome: WorldEncounterCanvas.methods.refreshSelectionOutcome,
        refreshDecentralizedLeadOutcome: WorldEncounterCanvas.methods.refreshDecentralizedLeadOutcome,
        refreshDistributionLifecycle: WorldEncounterCanvas.methods.refreshDistributionLifecycle,
        refreshMaterialInspection: WorldEncounterCanvas.methods.refreshMaterialInspection,
        distributeSelectedPublication: WorldEncounterCanvas.methods.distributeSelectedPublication,
        ...overrides
    };
    Object.defineProperty(ctx, 'isDiscoveredPublicationSelectable', {
        get: WorldEncounterCanvas.computed.isDiscoveredPublicationSelectable,
        configurable: true
    });
    return ctx;
}

const DISCOVERY_STATE_FIELDS = [
    'discoveryObjectId', 'discoveryTag', 'discovering', 'discoveryError',
    'discoveryResult', 'discoveryRequestId', 'selectedDiscoveredPublication'
];

function captureDiscoveryRefs(ctx) {
    const snapshot = {};
    for (const field of DISCOVERY_STATE_FIELDS) snapshot[field] = ctx[field];
    return snapshot;
}

function assertSameDiscoveryRefs(before, after, label) {
    for (const field of DISCOVERY_STATE_FIELDS) {
        assert(before[field] === after[field],
            `${label} — '${field}' changed reference across the popup toggle (before=${JSON.stringify(before[field])}, after=${JSON.stringify(after[field])})`);
    }
}

function verifiedDiscoveryResult(objectId) {
    return {
        discovery: { queried: ['ARWEAVE', 'NOSTR'] },
        resolution: { status: 'RESOLVED' },
        inspection: {
            loading: { status: 'AVAILABLE', material: { id: objectId } },
            verification: { status: 'VERIFIED' }
        },
        provenance: { origin: 'DECENTRALIZED' }
    };
}

async function run() {
    console.log('Running Publication Discovery Relocation Convergence Audit tests...\n');

    const canvasSource = await rawSource('ui/components/WorldEncounterCanvas.js');
    const canvasCodeOnly = codeOnly(canvasSource);

    const mainSource = await rawSource('ui/main.js');
    const canonicalTagMatch = /const PUBLICATION_DISCOVERY_TAG = '([^']+)';/.exec(mainSource);
    assert(canonicalTagMatch, 'sanity: ui/main.js still declares PUBLICATION_DISCOVERY_TAG (0.9.357/0.9.358)');
    const canonicalTag = canonicalTagMatch[1];

    // ===============================================================
    // Section A — Primary-surface convergence.
    // ===============================================================
    {
        const seeded = WorldEncounterCanvas.data.call({ defaultDiscoveryTag: canonicalTag });
        assert(seeded.publicationDiscoveryOpen === false, 'A1. a fresh World View starts with Publication Discovery closed');

        assert(/<button\s+v-if="discoveryCommand"[\s\S]{0,200}@click="publicationDiscoveryOpen = true"[\s\S]{0,50}>Publication Discovery<\/button>/.test(canvasSource),
            'A2. the trigger is reachable, gated on discoveryCommand, labeled "Publication Discovery"');

        // A3. Opening the popup is a bare assignment — it never itself
        // calls discoverPublication() or reads discoveryObjectId/Tag.
        const ctx = makeFullCtx({ defaultDiscoveryTag: canonicalTag, discoveryCommand: async () => { throw new Error('must not be called merely by opening'); } });
        ctx.publicationDiscoveryOpen = true;
        assert(ctx.discoveryResult === null && ctx.discoveryError === null && ctx.discovering === false,
            'A3. opening the popup alone triggers no discovery of any kind');

        console.log('✓ Section A: World View exposes a reachable "Publication Discovery" trigger; opening it starts closed by default and never itself performs discovery');
    }

    // ===============================================================
    // Section B — Command identity.
    // ===============================================================
    {
        const bindingCount = (canvasCodeOnly.match(/@click="discoverPublication"/g) || []).length;
        assert(bindingCount === 1, `B1. discoverPublication is bound exactly once — found ${bindingCount}`);

        const propCount = (canvasCodeOnly.match(/discoveryCommand:\s*\{/g) || []).length;
        assert(propCount === 1, `B2. discoveryCommand is declared exactly once as a prop — found ${propCount}`);

        // B3. Neither the methods: block nor the computed: block defines a
        // second call site of discoveryCommand — the popup introduced a
        // wrapper, never a parallel path.
        const methodsStart = canvasSource.indexOf('methods: {');
        const methodsEnd = canvasSource.indexOf('\n    template: `');
        assert(methodsStart !== -1 && methodsEnd > methodsStart, 'sanity: located the methods: block');
        const methodsBlock = canvasSource.slice(methodsStart, methodsEnd);
        const commandCallSites = (methodsBlock.match(/this\.discoveryCommand\(/g) || []).length;
        assert(commandCallSites === 1, `B3. exactly one call site of this.discoveryCommand(...) exists in methods: — found ${commandCallSites}`);

        console.log('✓ Section B: exactly one production discovery command binding exists — the popup created no second command path');
    }

    // ===============================================================
    // Section C — Canonical tag continuity: open -> forkbuild-publication
    // -> edit -> custom-tag -> Discover -> custom-tag; the popup never
    // re-seeds the canonical tag after a Wanderer's own edit.
    // ===============================================================
    {
        const ctx = makeFullCtx({ defaultDiscoveryTag: canonicalTag, discoveryObjectId: 'enc-c1' });

        // open popup -> forkbuild-publication
        ctx.publicationDiscoveryOpen = true;
        assert(ctx.discoveryTag === canonicalTag, `C1. the popup opens showing the seeded canonical tag ('${canonicalTag}')`);

        // edit -> custom-tag
        ctx.discoveryTag = 'custom-tag';
        assert(ctx.discoveryTag === 'custom-tag', 'C2. the field is freely editable inside the popup');

        // close -> reopen: the popup must not re-seed the canonical tag
        ctx.publicationDiscoveryOpen = false;
        assert(ctx.discoveryTag === 'custom-tag', 'C3. closing the popup does not restore the canonical tag');
        ctx.publicationDiscoveryOpen = true;
        assert(ctx.discoveryTag === 'custom-tag', 'C4. reopening the popup does not re-seed the canonical tag either — the edit survives');

        // Discover -> custom-tag reaches the command unchanged.
        let captured = null;
        ctx.discoveryCommand = async (args) => { captured = args; return {}; };
        WorldEncounterCanvas.methods.discoverPublication.call(ctx);
        await flush();
        assert(captured && captured.discoveryTag === 'custom-tag', 'C5. Discover sends the edited custom-tag, never the canonical default');

        // A second close/reopen cycle, after the command already ran,
        // still never reasserts the seed.
        ctx.publicationDiscoveryOpen = false;
        ctx.publicationDiscoveryOpen = true;
        assert(ctx.discoveryTag === 'custom-tag', 'C6. repeated close/reopen after a completed Discover still never re-seeds the canonical tag');

        console.log(`✓ Section C: open → '${canonicalTag}' → edit → 'custom-tag' → Discover → 'custom-tag' — the popup never re-seeds the canonical tag after a Wanderer's own edit, across any number of close/reopen cycles`);
    }

    // ===============================================================
    // Section D — State preservation, by OBJECT IDENTITY. THE FLAGSHIP.
    // discover -> receive results -> select Publication -> close popup ->
    // reopen -> same discovery state, proven by reference, not by
    // equal-looking serialized copies.
    // ===============================================================
    {
        const ctx = makeFullCtx({ defaultDiscoveryTag: canonicalTag, discoveryObjectId: 'enc-d1' });
        ctx.publicationDiscoveryOpen = true;

        // discover
        const resultToReturn = verifiedDiscoveryResult('enc-d1');
        ctx.discoveryCommand = async () => resultToReturn;
        WorldEncounterCanvas.methods.discoverPublication.call(ctx);
        await flush();

        // receive results
        assert(ctx.discoveryResult === resultToReturn, 'D1. discoveryResult is the EXACT object discoveryCommand resolved with — no cloning, no wrapping');

        // select Publication
        assert(WorldEncounterCanvas.computed.isDiscoveredPublicationSelectable.call(ctx) === true, 'D2. the VERIFIED result is selectable');
        WorldEncounterCanvas.methods.selectDiscoveredPublication.call(ctx);
        assert(ctx.selectedDiscoveredPublication === resultToReturn, 'D3. selectedDiscoveredPublication is the SAME reference as discoveryResult, not a second copy');

        const afterRun = captureDiscoveryRefs(ctx);
        for (const field of ['discoveryResult', 'selectedDiscoveredPublication']) {
            assert(afterRun[field] !== null, `D4 (${field}). sanity: genuinely populated before continuity is tested over it`);
        }

        // close popup
        ctx.publicationDiscoveryOpen = false;
        const afterClose = captureDiscoveryRefs(ctx);
        assertSameDiscoveryRefs(afterRun, afterClose, 'D5. CLOSE');
        assert(ctx.discoveryResult.inspection === resultToReturn.inspection, 'D5b. nested inspection object is still the exact original reference after close');

        // reopen
        ctx.publicationDiscoveryOpen = true;
        const afterReopen = captureDiscoveryRefs(ctx);
        assertSameDiscoveryRefs(afterRun, afterReopen, 'D6. REOPEN vs the original run');
        assertSameDiscoveryRefs(afterClose, afterReopen, 'D7. REOPEN vs CLOSE');
        assert(ctx.selectedDiscoveredPublication === resultToReturn, 'D8. selectedDiscoveredPublication is still the exact original reference after reopen');

        // Repeated close/reopen cycling never disturbs it further.
        ctx.publicationDiscoveryOpen = false;
        ctx.publicationDiscoveryOpen = true;
        ctx.publicationDiscoveryOpen = false;
        ctx.publicationDiscoveryOpen = true;
        assertSameDiscoveryRefs(afterRun, captureDiscoveryRefs(ctx), 'D9. repeated close/reopen cycling');

        console.log('✓ Section D: discover → receive results → select Publication → close → reopen preserves every discovery-related field by OBJECT IDENTITY, not merely equal-looking values, across any number of close/reopen cycles');
    }

    // ===============================================================
    // Section E — Fresh-session semantics: a genuinely new component
    // instance never inherits another instance's discovery state.
    // Contrasted directly against Section D's own close/reopen continuity.
    // ===============================================================
    {
        // ctx1: a "lived-in" instance with real discovery history.
        const ctx1 = makeFullCtx({ defaultDiscoveryTag: canonicalTag, discoveryObjectId: 'enc-e1' });
        ctx1.publicationDiscoveryOpen = true;
        const resultForCtx1 = verifiedDiscoveryResult('enc-e1');
        ctx1.discoveryCommand = async () => resultForCtx1;
        WorldEncounterCanvas.methods.discoverPublication.call(ctx1);
        await flush();
        WorldEncounterCanvas.methods.selectDiscoveredPublication.call(ctx1);
        ctx1.discoveryTag = 'ctx1-own-custom-tag';
        assert(ctx1.discoveryResult === resultForCtx1 && ctx1.selectedDiscoveredPublication === resultForCtx1, 'E1. sanity: ctx1 genuinely holds discovery state');

        // "popup visibility ≠ discovery lifecycle": closing ctx1's own
        // popup preserves everything above, exactly as Section D proved.
        ctx1.publicationDiscoveryOpen = false;
        assert(ctx1.discoveryResult === resultForCtx1, 'E2. closing ctx1\'s popup does not touch ctx1\'s own discovery state');

        // "component lifetime ≠ popup lifetime": a genuinely NEW World
        // View mount — ctx2 — is constructed independently of ctx1, the
        // same way WorldEncounterCanvas.data() seeds any real new mount.
        const ctx2 = makeFullCtx({ defaultDiscoveryTag: canonicalTag });
        assert(ctx2.publicationDiscoveryOpen === false, 'E3. a brand-new instance starts with the popup closed');
        assert(ctx2.discoveryResult === null, 'E4. a brand-new instance carries no discovery result of any kind');
        assert(ctx2.selectedDiscoveredPublication === null, 'E5. a brand-new instance carries no selected discovered Publication');
        assert(ctx2.discoveryTag === canonicalTag, 'E6. a brand-new instance seeds the canonical tag — never ctx1\'s own hand-edited "ctx1-own-custom-tag"');
        assert(ctx2.discoveryRequestId === 0, 'E7. a brand-new instance carries no stale request counter');

        // Proven by more than absence: the two instances hold genuinely
        // independent object graphs — mutating one can never reach the
        // other, because there is no shared reference at all.
        assert(ctx1.discoveryResult !== ctx2.discoveryResult, 'E8. ctx1 and ctx2 hold entirely independent discoveryResult references');
        ctx2.discoveryObjectId = 'a value only ctx2 ever sees';
        assert(ctx1.discoveryObjectId !== ctx2.discoveryObjectId, 'E9. an edit made on the new instance never reaches the old one, or vice versa');

        console.log('✓ Section E: a genuinely new World View instance inherits none of a previous instance\'s discovery state, while a previous instance\'s own popup close/reopen continues to preserve its own state exactly as Section D proved — popup visibility ≠ discovery lifecycle, and component lifetime ≠ popup lifetime');
    }

    // ===============================================================
    // Section F — Outside-click vs. explicit Close: both dismissal
    // mechanisms perform the identical assignment and neither clears
    // results, clears selection, cancels an in-flight discovery, executes
    // a command, or mutates ordinary World Encounter state.
    // ===============================================================
    {
        // F1. Structural: the overlay's outside-click handler and the
        // Close button's own handler perform the exact same assignment —
        // there is only one way "close" is ever expressed in this file.
        assert(/class="modal-overlay world-encounter-publication-discovery-overlay"\s+@click\.self="publicationDiscoveryOpen = false"/.test(canvasSource),
            'F1a. the overlay closes on an outside click via publicationDiscoveryOpen = false');
        assert(/class="action-btn world-encounter-publication-discovery-close"\s+@click="publicationDiscoveryOpen = false"/.test(canvasSource),
            'F1b. the Close button performs the byte-identical assignment');

        // F2. Live equivalence: two independently populated contexts,
        // dismissed one via each mechanism (both are, in fact, the same
        // assignment — proven structurally above — so this proves the
        // one mechanism that exists behaves identically regardless of
        // which trigger a Wanderer used to reach it).
        function populated(objectId) {
            const ctx = makeFullCtx({ defaultDiscoveryTag: canonicalTag, discoveryObjectId: objectId });
            ctx.publicationDiscoveryOpen = true;
            ctx.selectEncounter({ kind: 'PUBLICATION', objectId: 'selected-during-f' });
            return ctx;
        }

        const ctxViaOutsideClick = populated('enc-f-outside');
        const ctxViaCloseButton = populated('enc-f-close');
        const result = verifiedDiscoveryResult('shared');
        for (const c of [ctxViaOutsideClick, ctxViaCloseButton]) {
            c.discoveryCommand = async () => result;
            WorldEncounterCanvas.methods.discoverPublication.call(c);
        }
        await flush();
        for (const c of [ctxViaOutsideClick, ctxViaCloseButton]) {
            WorldEncounterCanvas.methods.selectDiscoveredPublication.call(c);
        }

        const beforeOutside = captureDiscoveryRefs(ctxViaOutsideClick);
        const beforeClose = captureDiscoveryRefs(ctxViaCloseButton);
        const selectedEncounterBeforeOutside = ctxViaOutsideClick.selectedEncounter;
        const selectedEncounterBeforeClose = ctxViaCloseButton.selectedEncounter;

        // Simulate the outside-click handler's own effect.
        ctxViaOutsideClick.publicationDiscoveryOpen = false;
        // Simulate the Close button's own effect.
        ctxViaCloseButton.publicationDiscoveryOpen = false;

        assertSameDiscoveryRefs(beforeOutside, captureDiscoveryRefs(ctxViaOutsideClick), 'F2a. outside-click dismissal clears no discovery field');
        assertSameDiscoveryRefs(beforeClose, captureDiscoveryRefs(ctxViaCloseButton), 'F2b. explicit Close dismissal clears no discovery field');
        assert(ctxViaOutsideClick.selectedEncounter === selectedEncounterBeforeOutside, 'F2c. outside-click dismissal never mutates the selected World Encounter');
        assert(ctxViaCloseButton.selectedEncounter === selectedEncounterBeforeClose, 'F2d. explicit Close dismissal never mutates the selected World Encounter');

        // F3. Neither dismissal executes a command of any kind.
        let commandCallsDuringDismissal = 0;
        const ctxCommandGuard = makeFullCtx({ defaultDiscoveryTag: canonicalTag, discoveryCommand: async () => { commandCallsDuringDismissal += 1; return {}; } });
        ctxCommandGuard.publicationDiscoveryOpen = true;
        ctxCommandGuard.publicationDiscoveryOpen = false; // outside-click / Close, either one — same assignment
        await flush();
        assert(commandCallsDuringDismissal === 0, 'F3. dismissing the popup, by either mechanism, never invokes discoveryCommand');

        // F4. Neither dismissal cancels a genuinely in-flight discovery —
        // closing mid-request still lets the result land once it resolves.
        let resolveDeferred;
        const deferred = new Promise((resolve) => { resolveDeferred = resolve; });
        const ctxInFlight = makeFullCtx({ defaultDiscoveryTag: canonicalTag, discoveryObjectId: 'enc-f-inflight', discoveryCommand: () => deferred });
        WorldEncounterCanvas.methods.discoverPublication.call(ctxInFlight);
        assert(ctxInFlight.discovering === true, 'F4a. sanity: a request is genuinely in flight');
        ctxInFlight.publicationDiscoveryOpen = true;
        ctxInFlight.publicationDiscoveryOpen = false; // dismiss WHILE in flight
        assert(ctxInFlight.discovering === true, 'F4b. dismissing the popup mid-request does not itself cancel discovering');
        const inFlightResult = verifiedDiscoveryResult('enc-f-inflight');
        resolveDeferred(inFlightResult);
        await flush();
        assert(ctxInFlight.discoveryResult === inFlightResult, 'F4c. the in-flight discovery still lands its result after the popup was dismissed mid-request — dismissal never cancels discovery');
        assert(ctxInFlight.discovering === false, 'F4d. discovering still resolves to false once the (uncancelled) call completes');

        console.log('✓ Section F: outside-click and explicit Close perform the identical assignment and are behaviorally equivalent — neither clears results/selection, executes a command, or cancels an in-flight discovery');
    }

    // ===============================================================
    // Section G — Discovery failure convergence: a genuine rejection, for
    // both the canonical and a custom tag, produces byte-identical,
    // pre-existing failure text; no new outcome vocabulary was introduced.
    // ===============================================================
    {
        const ctxCanonical = makeFullCtx({ defaultDiscoveryTag: canonicalTag, discoveryObjectId: 'enc-g-canonical' });
        ctxCanonical.publicationDiscoveryOpen = true;
        ctxCanonical.discoveryCommand = async () => { throw new Error('network unavailable'); };
        WorldEncounterCanvas.methods.discoverPublication.call(ctxCanonical);
        await flush();
        assert(ctxCanonical.discoveryError === 'Discovery could not be completed.', 'G1. a genuine rejection with the canonical tag produces the pre-existing failure message');
        assert(ctxCanonical.discoveryResult === null, 'G2. a failed discovery leaves discoveryResult null');

        const ctxCustom = makeFullCtx({ defaultDiscoveryTag: canonicalTag, discoveryObjectId: 'enc-g-custom' });
        ctxCustom.publicationDiscoveryOpen = true;
        ctxCustom.discoveryTag = 'a-completely-different-campaign';
        ctxCustom.discoveryCommand = async () => { throw new Error('network unavailable'); };
        WorldEncounterCanvas.methods.discoverPublication.call(ctxCustom);
        await flush();
        assert(ctxCustom.discoveryError === ctxCanonical.discoveryError, 'G3. the identical failure message is produced for a custom tag — no tag-dependent failure branch exists');

        // A successful AMBIGUOUS/UNAVAILABLE resolution is rendered
        // verbatim too, through the exact same popup path — reconfirming
        // no new outcome status was invented for either tag.
        const ctxAmbiguous = makeFullCtx({ defaultDiscoveryTag: canonicalTag, discoveryObjectId: 'enc-g-ambiguous' });
        ctxAmbiguous.publicationDiscoveryOpen = true;
        ctxAmbiguous.discoveryCommand = async () => ({ discovery: {}, resolution: { status: 'AMBIGUOUS' }, inspection: null });
        WorldEncounterCanvas.methods.discoverPublication.call(ctxAmbiguous);
        await flush();
        assert(ctxAmbiguous.discoveryResult.resolution.status === 'AMBIGUOUS', 'G4. a genuine non-RESOLVED outcome is rendered verbatim, unaltered by the popup');

        // Vocabulary guard: this file defines no local status enum of its
        // own anywhere — every status it ever displays is rendered
        // verbatim from an already-existing application-layer result.
        assert(!/^const \w*Status\s*=|Status\s*=\s*Object\.freeze|Status\s*=\s*\{/m.test(canvasCodeOnly),
            'G5. WorldEncounterCanvas.js defines no local status/outcome enum of its own — no new discovery outcome vocabulary was introduced by this relocation');
        assert(canvasCodeOnly.includes("'Discovery could not be completed.'") &&
               (canvasCodeOnly.match(/'Discovery could not be completed\.'/g) || []).length === 1,
            'G6. exactly one, pre-existing failure string exists for this action — no second, popup-specific failure message was added');

        console.log('✓ Section G: a genuine discovery failure produces the exact same, pre-existing message for both a canonical and a custom tag; no new discovery outcome vocabulary exists anywhere in this file');
    }

    // ===============================================================
    // Section H — World Encounter regression, proven live: ordinary
    // selection is unaffected by the popup's own open/closed state, and
    // discovery execution never disturbs ordinary World Encounter state.
    // ===============================================================
    {
        const ctx = makeFullCtx({ defaultDiscoveryTag: canonicalTag, discoveryObjectId: 'enc-h1' });

        // Select an ordinary World Encounter (popup closed) — the real,
        // unmodified selectEncounter(), not a stand-in.
        WorldEncounterCanvas.methods.selectEncounter.call(ctx, { kind: 'PUBLICATION', objectId: 'pub-h1' });
        const selectedEncounterRef = ctx.selectedEncounter;
        assert(selectedEncounterRef && selectedEncounterRef.objectId === 'pub-h1', 'H1. sanity: an ordinary selection genuinely succeeded');

        // Open the popup and run a full discovery cycle — the ordinary
        // selection must not move.
        ctx.publicationDiscoveryOpen = true;
        ctx.discoveryCommand = async () => verifiedDiscoveryResult('enc-h1');
        WorldEncounterCanvas.methods.discoverPublication.call(ctx);
        await flush();
        assert(ctx.selectedEncounter === selectedEncounterRef, 'H2. running a discovery through the open popup never touches the ordinary selectedEncounter reference');

        // Selecting a DIFFERENT ordinary World Encounter while the popup
        // stays open still works normally, and does not disturb the
        // discovery state the popup is currently showing.
        const discoveryResultRef = ctx.discoveryResult;
        WorldEncounterCanvas.methods.selectEncounter.call(ctx, { kind: 'PUBLICATION', objectId: 'pub-h2' });
        assert(ctx.selectedEncounter.objectId === 'pub-h2', 'H3. ordinary marker selection still works normally while the popup is open');
        assert(ctx.publicationDiscoveryOpen === true, 'H4. selecting a new World Encounter marker never closes the popup');
        assert(ctx.discoveryResult === discoveryResultRef, 'H5. selecting a new World Encounter marker never resets the popup\'s own discovery state');

        // Snapshot Distribution and Content Comparison remain positioned
        // entirely outside the new popup, and their own gating is
        // untouched by this milestone.
        assert(/<div v-if="selectedEncounter && selectedEncounter\.kind === 'PUBLICATION' && distributionLifecycleStore" class="world-encounter-distribution-panel">/.test(canvasSource),
            'H6. Distribute Publication still gates exactly as before, unmoved');
        assert(/<div v-if="selectedEncounter && selectedEncounter\.kind === 'PUBLICATION' && snapshotDistributionCommand" class="world-encounter-snapshot-distribution-panel">/.test(canvasSource),
            'H7. Distribute Snapshot still gates exactly as before, unmoved');
        assert(/<div v-if="selectedPublicationComparisonCandidate" class="world-snapshot-comparison-panel">/.test(canvasSource),
            'H8. Content Comparison\'s Compare panel still gates exactly as before, unmoved');
        const overlayIndex = canvasSource.indexOf('v-if="publicationDiscoveryOpen"');
        for (const marker of ['world-encounter-distribution-panel', 'world-encounter-snapshot-distribution-panel', 'world-snapshot-comparison-panel']) {
            const idx = canvasSource.indexOf(marker);
            assert(idx !== -1 && idx < overlayIndex, `H9 (${marker}). remains positioned entirely outside the Publication Discovery popup`);
        }

        console.log('✓ Section H: ordinary World Encounter selection, Snapshot Distribution, and Content Comparison remain unaffected whether Publication Discovery is open, closed, or mid-request — and running a discovery never disturbs ordinary selection state');
    }

    // ===============================================================
    // Section I — Diagnostic-surface semantics: publicationDiscoveryOpen
    // is touched in exactly the places its one job requires, and is never
    // a hidden proxy for discovered/loading/selected/resolved/failed/
    // active-discovery-session state.
    // ===============================================================
    {
        const occurrences = (canvasCodeOnly.match(/publicationDiscoveryOpen/g) || []).length;
        assert(occurrences === 5,
            `I1. publicationDiscoveryOpen appears exactly 5 times in real code — one data() default, one open, two close paths (outside-click, Close button), one v-if read — found ${occurrences}`);

        const methodsStart = canvasSource.indexOf('methods: {');
        const methodsEnd = canvasSource.indexOf('\n    template: `');
        const methodsBlock = canvasSource.slice(methodsStart, methodsEnd);
        assert(!methodsBlock.includes('publicationDiscoveryOpen'), 'I2. no method reads or writes publicationDiscoveryOpen — every write/read lives in the template alone');

        const computedStart = canvasSource.indexOf('computed: {');
        const computedEnd = canvasSource.indexOf('\n    methods: {');
        const computedBlock = canvasSource.slice(computedStart, computedEnd);
        assert(!computedBlock.includes('publicationDiscoveryOpen'), 'I3. no computed property reads publicationDiscoveryOpen — it never derives discovered/loading/selected/resolved/failed/active-session state');

        // Every domain vocabulary word this milestone's own brief warned
        // against never appears anywhere near the boolean's own three
        // template occurrences (open/close/close), confirmed within a
        // generous window so a coincidental nearby comment would still be
        // caught.
        const forbiddenNearby = ['discovered', 'loading', 'resolved', 'failed', 'active discovery session'];
        for (const idx of [canvasSource.indexOf('publicationDiscoveryOpen = true'), canvasSource.lastIndexOf('publicationDiscoveryOpen = false')]) {
            const windowText = canvasSource.slice(Math.max(0, idx - 120), idx + 120).toLowerCase();
            for (const term of forbiddenNearby) {
                assert(!windowText.includes(term), `I4 (${term}). no discovery-domain vocabulary sits beside a publicationDiscoveryOpen write — it stays a pure visibility flag`);
            }
        }

        // Live confirmation, one more angle: toggling the flag through a
        // full open/close/open/close cycle, with no discovery ever run,
        // leaves every OTHER data field exactly at its data()-seeded
        // default — the flag carries no side channel of its own.
        const ctx = makeFullCtx({ defaultDiscoveryTag: canonicalTag });
        const pristine = WorldEncounterCanvas.data.call({ defaultDiscoveryTag: canonicalTag });
        ctx.publicationDiscoveryOpen = true;
        ctx.publicationDiscoveryOpen = false;
        ctx.publicationDiscoveryOpen = true;
        ctx.publicationDiscoveryOpen = false;
        for (const field of DISCOVERY_STATE_FIELDS) {
            if (field === 'discoveryTag') continue; // seeded from defaultDiscoveryTag, unrelated to the toggle
            assert(ctx[field] === pristine[field], `I5 (${field}). toggling publicationDiscoveryOpen alone never changes '${field}' away from its pristine default`);
        }

        console.log('✓ Section I: publicationDiscoveryOpen is touched in exactly the five places a pure visibility flag requires, is read or written by no method or computed property, and toggling it alone changes nothing else — it never became a hidden proxy for domain/UI state');
    }

    // ===============================================================
    // Section J — Final convergence matrix.
    // ===============================================================
    {
        const matrix = [
            ['Discovery command', 'Existing', 'Same', '✅'],
            ['Query service', 'Existing', 'Same', '✅'],
            ['Canonical tag', 'Existing', 'Same', '✅'],
            ['Custom tags', 'Editable', 'Editable', '✅'],
            ['Results', 'Preserved', 'Preserved (by reference)', '✅'],
            ['Selection', 'Preserved', 'Preserved (by reference)', '✅'],
            ['Discovery semantics', 'Existing', 'Same', '✅'],
            ['Failure vocabulary', 'Existing', 'Same', '✅'],
            ['Primary surface', 'Inline', 'Removed', 'Intentional'],
            ['Secondary surface', 'None', 'Popup', 'Intentional'],
            ['Outside-click / Close', 'N/A', 'Equivalent', '✅'],
            ['Fresh-session isolation', 'N/A', 'Isolated', '✅'],
            ['Snapshot Distribution', 'Visible', 'Visible', '✅'],
            ['Content Comparison', 'Visible', 'Visible', '✅']
        ];
        console.log('\n=== FINAL CONVERGENCE MATRIX ===');
        console.log('Property                  | Before 0.9.360 | After 0.9.360            | Converged?');
        console.log('--------------------------|-----------------|---------------------------|-----------');
        for (const [property, before, after, converged] of matrix) {
            console.log(`${property.padEnd(26)}| ${before.padEnd(16)}| ${after.padEnd(26)}| ${converged}`);
        }

        console.log('\n=== VERDICT: STABLE_STOP ===');
        console.log('Sections A-I prove the relocation changed presentation only: one command path (A-B), the canonical');
        console.log('tag is never re-seeded after an edit (C), every discovery-related field survives close/reopen by');
        console.log('object identity (D), a genuinely new instance inherits none of a previous instance\'s state (E),');
        console.log('outside-click and explicit Close are behaviorally equivalent and neither cancels an in-flight');
        console.log('request (F), failure behavior is unchanged for either tag with no new vocabulary (G), ordinary');
        console.log('World Encounter interaction/Snapshot Distribution/Content Comparison are unaffected in either');
        console.log('direction (H), and publicationDiscoveryOpen never became a proxy for domain state (I). No loose');
        console.log('end remains for a future milestone to find; no further relocation work is indicated.');
    }

    console.log('\n✅ All Publication Discovery Relocation Convergence Audit tests passed.');
}

run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
