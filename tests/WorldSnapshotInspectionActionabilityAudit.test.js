import { readFile } from 'node:fs/promises';

import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import { WorldDiscoverySourceRegistry } from '../application/WorldDiscoverySourceRegistry.js';
import { describeLocalWorldDiscoverySource, LOCAL_WORLD_DISCOVERY_ORIGIN } from '../application/WorldEncounterIntegration.js';
import { registerPeerWorldSource } from '../peer/PeerWorldDiscoveryLifecycleBridge.js';
import { derivePeerWorldOrigin } from '../peer/PeerWorldDataIngress.js';
import {
    registerMaterializedSnapshotWorldSource,
    unregisterMaterializedSnapshotWorldSource,
    materializedSnapshotWorldOrigin
} from '../application/MaterializedSnapshotWorldDiscoveryBridge.js';
import { SnapshotWorldPlacementOutcome } from '../application/SnapshotWorldPlacementOutcome.js';
import { SnapshotWorldRegistrationOutcome } from '../application/SnapshotWorldRegistrationOutcome.js';
import { WorldEncounterKind } from '../core/WorldEncounter.js';
import { WorldEncounterMaterialLoadStatus } from '../application/WorldEncounterMaterialLoading.js';
import { WorldEncounterSelectionOutcomeStatus } from '../application/WorldEncounterSelectionOutcome.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';

// 0.9.178 — World Snapshot Inspection Actionability Audit.
//
// 0.9.174 through 0.9.177 built, in order: lifecycle correctness (a source
// reliably enters/changes/leaves), selection consistency (identity survives
// selection and material loading), source-family presentation (a Wanderer
// can tell a Snapshot-sourced encounter apart from a LOCAL/PEER one), and
// Snapshot inspection detail (contentHash/publicationId/position become
// visible for it). Every one of those milestones deliberately stopped at
// OBSERVATION. This audit asks the question their own restraint leaves
// open: once a Wanderer can identify and inspect a Snapshot, what can they
// ALREADY, LEGITIMATELY do with it — using only actions that exist in the
// running application today?
//
// TEST-ONLY, AS ORIGINALLY WRITTEN. THIS FILE ADDED NO PRODUCTION CODE AND
// CHANGED NO EXISTING FILE AT THE TIME. Every collaborator this audit
// drives — `WorldEncounterCanvas.js`, `WorldSnapshotInspection.js`,
// `WorldEncounterPresentation.js`,
// `MaterializedSnapshotWorldDiscoveryBridge.js`, `WorldEncounterMaterialLoading.js`,
// `WorldDiscoverySourceRegistry.js`, the peer lifecycle bridge — was read,
// real, and unmodified as of 0.9.178.
//
// UPDATED 0.9.179 — Snapshot World Source Unregistration. This milestone
// deliberately acted on exactly the one finding this audit reported rather
// than merely noting it: `WorldEncounterCanvas.js` gained one new
// Wanderer-reachable action, `unregisterSelectedSnapshot()`, invoking the
// already-existing `unregisterMaterializedSnapshotWorldSource()` for a
// resolved, SNAPSHOT-sourced selection alone — never for LOCAL or PEER (see
// that milestone's own header for why it stayed Snapshot-specific rather
// than the generic, all-three-families action this audit's own
// "Recommendation" section in docs/Roadmap.md suggested). Sections A, C, E,
// and I below are updated in place to assert the NEW true state rather than
// stay a stale record of the gap that has since been closed; Sections B, D,
// F, G, and H were never about that gap and are unchanged.
//
// OBSERVE FIRST, NEVER DECIDE A DESIRED CAPABILITY IN ADVANCE. Every
// assertion below documents behavior already true of the real, unmodified
// production files. Where the audit found an application-layer capability
// with no UI action wired to it (Section A/C, as originally written — a
// Snapshot registration's own symmetric `unregisterMaterializedSnapshotWorldSource()`
// undo), it reported that as a fact for a future, separate,
// deliberately-scoped milestone to weigh — it did NOT wire it in at the
// time. 0.9.179 later did exactly that, narrowly; Sections A and C below
// are updated to assert the resulting state.
//
//   Section A: existing action inventory — which methods/template actions
//              a selected, SNAPSHOT-sourced PUBLICATION encounter can
//              reach in `WorldEncounterCanvas.js`. UPDATED 0.9.179: the
//              Snapshot-specific "unregister"/"remove this Snapshot"
//              action, previously found at the application layer but wired
//              into no UI action, is now wired into exactly one new
//              method, `unregisterSelectedSnapshot()`.
//   Section B: observation vs. action — reading the Snapshot inspection
//              descriptor, repeatedly, triggers no registry mutation and
//              no additional material load of any kind.
//   Section C: the LOCAL / PEER / SNAPSHOT actionability truth table —
//              inspect, select, load material, distribute, and discover
//              are ALL already symmetric across the three source families,
//              because every one of those gates reads `distributablePublication`
//              alone, never `sourceFamily`. UPDATED 0.9.179: "unregister"
//              is now deliberately Snapshot-specific — a genuine no-op for
//              LOCAL/PEER, a genuine removal for SNAPSHOT — never the
//              generic, all-three-families action this audit's own
//              "Recommendation" suggested.
//   Section D: the material availability boundary — once a Snapshot is
//              registered, selecting it already routes through the
//              ordinary `materialSources.local` slot (0.9.166); there is
//              no second, Snapshot-specific materialization path reachable
//              from selection.
//   Section E: position actionability — the inspection panel's own
//              `position` is exactly the World's already-established
//              placement; no input, button, or method offers to move,
//              relocate, or reposition a Snapshot from this panel.
//   Section F: identity preservation under actionability — publicationId,
//              contentHash, and origin never substitute for one another
//              anywhere actionability actually reaches (selection,
//              material loading, distribution gating).
//   Section G: an AMBIGUOUS selection carries no Snapshot-specific
//              actionability of any kind until the Wanderer explicitly
//              resolves it — presentation, inspection, and every
//              downstream action gate all stay inert together.
//   Section H: a removed Snapshot source — resolved selection, Snapshot
//              inspection, material inspection, and every actionability
//              gate all collapse to null/false together; nothing stale
//              survives merely because an old inspection object existed.
//   Section I: structural audit — none of the inspection-layer computeds
//              (`selectedEncounterInspection`, `selectedEncounterPresentation`,
//              `selectedEncounterSnapshotInspection`) ever calls a
//              discovery/resolution/materialization/placement/registration
//              function itself. UPDATED 0.9.179: this milestone's own
//              finding (`unregisterMaterializedSnapshotWorldSource`) is now
//              wired into `WorldEncounterCanvas.js`, but into exactly one
//              action method (`unregisterSelectedSnapshot()`) and none of
//              the inspection-layer computeds above.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function flush() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

const stubIdentityProvider = {
    currentUser: () => ({ username: 'alice', displayName: 'alice', providerId: 'stub' }),
    sign: (data) => ({ signedBy: 'alice', providerId: 'stub', data })
};

function createTestDocument(title) {
    const world = new World();
    const building = new Building({ creator: 'tester' });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0), rotation: 0 }));
    world.addBuilding(building);
    return new Document({ world, metadata: new DocumentMetadata({ title, author: 'tester' }) });
}

function publishOwnPublication(storageProvider, title) {
    const publisher = new LocalPublisherProvider(storageProvider);
    return publisher.publish(createTestDocument(title), stubIdentityProvider);
}

function peer(identityId) {
    return { remoteIdentity: { identityId } };
}

function placedResult(contentHash, publicationId, position) {
    return { outcome: SnapshotWorldPlacementOutcome.PLACED, contentHash, publicationId, placementId: `placement-${publicationId}`, position, reason: null };
}

// A material source with no real backing store — always answers with the
// same fixed `material` reference, while recording every `resolvedSelection`
// it was called with. Mirrors tests/WorldSourceSelectionConsistencyAudit.test.js's
// own `capturingMaterialSource()` exactly.
function capturingMaterialSource(material) {
    const calls = [];
    return {
        calls,
        async load(resolvedSelection) {
            calls.push(resolvedSelection);
            return material;
        }
    };
}

function neverCalledMaterialSource(label) {
    return { async load() { throw new Error(`${label} must never be consulted for this selection`); } };
}

// Reproduces `ui/views/WorldView.js`'s own real wiring by hand, mirroring
// tests/SnapshotWorldInspectionDetail.test.js's own buildCanvasInstance()
// exactly, with three additional live getters this audit needs:
// `resolvedLead` (present in this component regardless), `distributablePublication`
// (0.9.104 — the one fact every distribute/discover action gate reads), and
// nothing else invented — every getter below already exists on
// `WorldEncounterCanvas.js` itself.
function buildCanvasInstance({
    registry = null,
    materialSources = null,
    distributionCommand = null,
    snapshotDistributionCommand = null,
    discoverSnapshotCommand = null
} = {}) {
    const ctx = {
        registry,
        view: WorldEncounterCanvas.props.view.default(),
        materialSources,
        materialVerifier: null,
        distributionCommand,
        snapshotDistributionCommand,
        discoverSnapshotCommand,
        distributionLifecycleStore: null,
        discoveryCommand: null,
        worldDiscoveryLeadRegistry: null
    };
    Object.assign(ctx, WorldEncounterCanvas.data.call(ctx));
    Object.assign(ctx, WorldEncounterCanvas.methods);
    const liveGetters = [
        'effectiveView',
        'resolvedEncounterSelection',
        'resolvedLead',
        'selectedEncounterInspection',
        'selectedEncounterInspectionPublisherIdentityLabel',
        'selectedEncounterPresentation',
        'selectedEncounterPresentationSourceLabel',
        'selectedEncounterSnapshotInspection',
        'distributablePublication'
    ];
    for (const name of liveGetters) {
        Object.defineProperty(ctx, name, {
            get() { return WorldEncounterCanvas.computed[name].call(ctx); }
        });
    }
    return ctx;
}

function mountCanvas(ctx) { WorldEncounterCanvas.mounted.call(ctx); }
function unmountCanvas(ctx) { WorldEncounterCanvas.beforeUnmount.call(ctx); }

// Builds one Publication registered simultaneously under all three source
// families — LOCAL, PEER, and SNAPSHOT — all naming the SAME objectId.
// Mirrors tests/WorldSourceSelectionConsistencyAudit.test.js's own
// `buildTripleFamilyScenario()` exactly; used by Sections F and G, which
// both need this exact three-way ambiguity as their own starting point.
function buildTripleFamilyScenario(label) {
    const storageProvider = new InMemoryStorageProvider();
    const publication = publishOwnPublication(storageProvider, `${label} Publication`);
    const registry = new WorldDiscoverySourceRegistry();

    registry.setSource(describeLocalWorldDiscoverySource({
        publications: [{ id: publication.id, title: publication.title }],
        placements: [{ publicationId: publication.id, position: { x: 1, y: 0, z: 1 } }]
    }));

    const peerIdentity = peer(`did:key:z${label}Peer`);
    registerPeerWorldSource(registry, peerIdentity, {
        publications: [{ id: publication.id, title: 'Peer Copy' }],
        placements: [{ publicationId: publication.id, position: { x: 2, y: 0, z: 2 } }]
    });
    const peerOrigin = derivePeerWorldOrigin(peerIdentity);

    const registration = registerMaterializedSnapshotWorldSource(
        registry,
        placedResult(`hash-${label}`, publication.id, { x: 3, y: 0, z: 3 }),
        publication
    );
    assert(registration.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, `sanity — ${label} Snapshot registration succeeds`);

    return {
        registry,
        publication,
        objectId: publication.id,
        peerOrigin,
        snapshotOrigin: registration.origin
    };
}

function candidateFor(candidates, origin) {
    return candidates.find((candidate) => candidate.origin === origin) || null;
}

function stripLineComments(source) {
    return source
        .split('\n')
        .map((line) => line.replace(/\/\/.*$/, ''))
        .join('\n');
}

// Extracts one named `computed:` function's own body text out of
// `WorldEncounterCanvas.js`'s own source — from its own declaration line up
// to (but not including) the NEXT computed property's own declaration —
// so Section I can prove exactly what one specific computed does and does
// not call, without a false negative from an unrelated computed/method
// elsewhere in this 2900+ line file that legitimately DOES call one of
// these functions (e.g. `discoverSelectedSnapshot()`, an explicit,
// Wanderer-initiated action, calling `discoverSnapshotCommand` — a
// completely different question from whether INSPECTION itself does).
function extractComputedBody(source, name, nextName) {
    const startMarker = `        ${name}() {`;
    const startIndex = source.indexOf(startMarker);
    assert(startIndex !== -1, `sanity — ${name}() is found verbatim in WorldEncounterCanvas.js`);
    const nextMarker = `        ${nextName}() {`;
    const endIndex = source.indexOf(nextMarker, startIndex);
    assert(endIndex !== -1, `sanity — ${nextName}() (the next computed) is found after ${name}()`);
    return source.slice(startIndex, endIndex);
}

async function run() {
    const canvasSource = await readFile(new URL('../ui/components/WorldEncounterCanvas.js', import.meta.url), 'utf8');
    const snapshotInspectionSource = await readFile(new URL('../application/WorldSnapshotInspection.js', import.meta.url), 'utf8');

    // ---------------------------------------------------------------
    // Section A — existing action inventory.
    // ---------------------------------------------------------------
    {
        const methodNames = Object.keys(WorldEncounterCanvas.methods);

        // The complete set of Wanderer-reachable actions this component
        // already exposes for a selected Publication encounter, regardless
        // of source family — read directly off the real `methods` object,
        // never assumed.
        const expectedActions = [
            'selectEncounter', 'chooseSelectionOrigin', 'chooseDecentralizedLead',
            'distributeSelectedPublication', 'distributeSelectedSnapshot',
            'discoverSelectedSnapshot', 'discoverPublication', 'selectDiscoveredPublication',
            'unregisterSelectedSnapshot'
        ];
        for (const action of expectedActions) {
            assert(methodNames.includes(action), `1. ${action}() already exists as a Wanderer-reachable action`);
        }

        // UPDATED 0.9.179 — exactly ONE method matching this pattern now
        // exists: `unregisterSelectedSnapshot()`, this milestone's own,
        // single, narrow action. No reposition/relocate/move method of any
        // kind was added alongside it, and no second/generic "remove this
        // source" method exists either — the milestone stayed exactly as
        // narrow as its own brief demanded.
        const forbiddenActionNames = methodNames.filter((name) => /unregister|remove|delete|reposition|relocate|^move[A-Z]/i.test(name));
        assert(forbiddenActionNames.length === 1 && forbiddenActionNames[0] === 'unregisterSelectedSnapshot',
            `2. the only unregister/remove/delete/reposition/relocate/move-shaped action on WorldEncounterCanvas.js today is unregisterSelectedSnapshot() — found: ${forbiddenActionNames.join(', ')}`);

        // The application layer already carried the symmetric undo for
        // registration — `unregisterMaterializedSnapshotWorldSource()` —
        // and 0.9.179 wired it into exactly this one method, and nowhere
        // else (never inside a computed, never a second call site).
        assert(typeof unregisterMaterializedSnapshotWorldSource === 'function', '3. sanity — the application-layer undo genuinely exists');
        assert(canvasSource.includes('unregisterMaterializedSnapshotWorldSource'),
            '4. unregisterMaterializedSnapshotWorldSource() is now imported and called in WorldEncounterCanvas.js — the 0.9.178 finding, acted on');
        const canvasCodeOnly = stripLineComments(canvasSource);
        const unregisterCallCount = (canvasCodeOnly.match(/unregisterMaterializedSnapshotWorldSource\(/g) || []).length;
        assert(unregisterCallCount === 1, `4b. unregisterMaterializedSnapshotWorldSource() is called from exactly ONE place in actual code (comments aside) — found ${unregisterCallCount}`);
        const unregisterSelectedSnapshotBody = extractComputedBody(canvasSource, 'unregisterSelectedSnapshot', 'discoverPublication');
        assert(unregisterSelectedSnapshotBody.includes('unregisterMaterializedSnapshotWorldSource('),
            '4c. that one call site is inside unregisterSelectedSnapshot() itself');

        // The template now offers exactly ONE button inside the inspection
        // panel, wired to this one new action alone — nothing resembling
        // repositioning/relocation, and no second unregister affordance.
        const inspectionPanelMatch = canvasSource.match(/<div v-if="selectedEncounter" class="world-encounter-inspection-panel">[\s\S]*?<\/div>/);
        assert(inspectionPanelMatch !== null, '5. sanity — the inspection panel template block is found');
        assert(!/reposition|relocate/i.test(inspectionPanelMatch[0]),
            '6. the inspection panel template contains no reposition/relocate affordance of any kind');
        const panelClickCount = (inspectionPanelMatch[0].match(/@click/g) || []).length;
        assert(panelClickCount === 1, `6b. the inspection panel template contains exactly one @click action — found ${panelClickCount}`);
        assert(inspectionPanelMatch[0].includes('@click="unregisterSelectedSnapshot"'),
            '6c. that one @click action is unregisterSelectedSnapshot()');

        console.log('✓ Section A: the existing action inventory for a selected encounter is select/choose-origin/choose-lead/distribute-publication/distribute-snapshot/discover-snapshot/discover-publication/select-discovered/unregister-selected-snapshot (0.9.179) — exactly one unregister action exists, wired to the previously-unwired, symmetric registration undo');
    }

    // ---------------------------------------------------------------
    // Section B — observation vs. action: reading Snapshot inspection
    // repeatedly triggers no registry mutation and no additional load.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const publication = publishOwnPublication(storageProvider, 'Section B Snapshot Publication');
        const registry = new WorldDiscoverySourceRegistry();
        const registration = registerMaterializedSnapshotWorldSource(
            registry,
            placedResult('hash-section-b', publication.id, { x: 4, y: 0, z: 4 }),
            publication
        );
        assert(registration.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, 'sanity — Section B Snapshot registration succeeds');

        const material = Object.freeze({ id: publication.id, title: publication.title });
        const localSource = capturingMaterialSource(material);
        const canvas = buildCanvasInstance({ registry, materialSources: { local: localSource } });
        mountCanvas(canvas);
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: publication.id });
        await flush();

        assert(canvas.selectedEncounterSnapshotInspection !== null, 'sanity — a Snapshot inspection descriptor is genuinely available to read');

        // Spy on the ONE registry mutation surface, installed only AFTER
        // registration/selection already happened — any call from here on
        // proves inspection itself mutated the registry.
        let setSourceCalls = 0;
        let removeSourceCalls = 0;
        const originalSetSource = registry.setSource.bind(registry);
        const originalRemoveSource = registry.removeSource.bind(registry);
        registry.setSource = (...args) => { setSourceCalls += 1; return originalSetSource(...args); };
        registry.removeSource = (...args) => { removeSourceCalls += 1; return originalRemoveSource(...args); };

        const loadCallsBefore = localSource.calls.length;
        for (let i = 0; i < 5; i++) {
            void canvas.selectedEncounterSnapshotInspection;
            void canvas.selectedEncounterPresentation;
            void canvas.selectedEncounterInspection;
            void canvas.distributablePublication;
        }

        assert(setSourceCalls === 0, '1. reading the Snapshot inspection descriptor (repeatedly) never calls registry.setSource()');
        assert(removeSourceCalls === 0, '2. reading the Snapshot inspection descriptor (repeatedly) never calls registry.removeSource()');
        assert(localSource.calls.length === loadCallsBefore, '3. reading the Snapshot inspection descriptor (repeatedly) triggers no additional material load');

        // The pure descriptor module itself never touches the registry,
        // never re-invokes upstream resolution/placement/registration, and
        // performs no I/O — reaffirming 0.9.177's own structural sweep
        // still holds unmodified.
        const codeOnly = stripLineComments(snapshotInspectionSource);
        assert(!/fetch\(|localStorage|WorldDiscoverySourceRegistry|registry\.|deriveWorldEncounters\(|resolveSnapshotWorldPlacement\(|resolveSnapshotWorldPositionClaim\(|registerMaterializedSnapshotWorldSource\(|unregisterMaterializedSnapshotWorldSource\(/.test(codeOnly),
            '4. application/WorldSnapshotInspection.js still performs no I/O, no registry access, and no re-invocation of any upstream resolution/placement/registration/unregistration function');

        unmountCanvas(canvas);
        console.log('✓ Section B: facts -> descriptor -> UI stays observation-only — reading Snapshot inspection, repeatedly, never mutates the registry and never triggers an additional material load');
    }

    // ---------------------------------------------------------------
    // Section C — the LOCAL / PEER / SNAPSHOT actionability truth table.
    // ---------------------------------------------------------------
    {
        const table = {};

        function buildSingleFamilyScenario(family, objectId) {
            const registry = new WorldDiscoverySourceRegistry();
            const material = Object.freeze({ id: objectId, title: `${family} Material` });
            let materialSources;

            if (family === 'LOCAL') {
                registry.setSource(describeLocalWorldDiscoverySource({
                    publications: [{ id: objectId, title: 'Section C Local Publication' }],
                    placements: [{ publicationId: objectId, position: { x: 8, y: 0, z: 8 } }]
                }));
                materialSources = { local: capturingMaterialSource(material), peer: neverCalledMaterialSource('materialSources.peer') };
            } else if (family === 'PEER') {
                const identity = peer(`did:key:zSectionC${family}`);
                registerPeerWorldSource(registry, identity, {
                    publications: [{ id: objectId, title: 'Section C Peer Publication' }],
                    placements: [{ publicationId: objectId, position: { x: 9, y: 0, z: 9 } }]
                });
                materialSources = { local: neverCalledMaterialSource('materialSources.local'), peer: capturingMaterialSource(material) };
            } else {
                const storageProvider = new InMemoryStorageProvider();
                const publication = publishOwnPublication(storageProvider, `Section C ${family} Publication`);
                const registration = registerMaterializedSnapshotWorldSource(
                    registry,
                    placedResult(`hash-section-c-${family}`, publication.id, { x: 10, y: 0, z: 10 }),
                    publication
                );
                assert(registration.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, `sanity — Section C ${family} registration succeeds`);
                objectId = publication.id;
                materialSources = { local: capturingMaterialSource(Object.freeze({ id: publication.id, title: publication.title })), peer: neverCalledMaterialSource('materialSources.peer') };
            }

            const distributeCalls = [];
            const discoverCalls = [];
            const canvas = buildCanvasInstance({
                registry,
                materialSources,
                distributionCommand: async (pub) => { distributeCalls.push(pub); return { outcome: 'DISTRIBUTED' }; },
                snapshotDistributionCommand: async (pub) => { distributeCalls.push(pub); return { contentReference: { hash: 'h', uri: 'u' }, announcement: null }; },
                discoverSnapshotCommand: async (pub) => { discoverCalls.push(pub); return { outcome: 'MATCH', bytes: null, candidates: [], locator: null, storage: null, reason: null }; }
            });
            mountCanvas(canvas);
            canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId });
            return { canvas, distributeCalls, discoverCalls };
        }

        for (const family of ['LOCAL', 'PEER', 'SNAPSHOT']) {
            const { canvas, distributeCalls, discoverCalls } = buildSingleFamilyScenario(family, `section-c-${family.toLowerCase()}-publication`);
            await flush();

            const row = {
                inspect: canvas.selectedEncounterInspection !== null,
                select: canvas.resolvedEncounterSelection !== null,
                load: !!canvas.materialInspection && canvas.materialInspection.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE,
                distribute: canvas.distributablePublication !== null,
                discover: canvas.distributablePublication !== null
            };
            table[family] = row;

            // Exercise distribute/discover for real, proving the gate is
            // genuinely reachable, not merely computed as `true`.
            canvas.distributeSelectedPublication();
            canvas.distributeSelectedSnapshot();
            canvas.discoverSelectedSnapshot();
            await flush();

            assert(row.inspect, `1. [${family}] inspect is reachable`);
            assert(row.select, `2. [${family}] select is reachable`);
            assert(row.load, `3. [${family}] load material is reachable`);
            assert(row.distribute, `4. [${family}] distribute is reachable (distributablePublication gate)`);
            assert(row.discover, `5. [${family}] discover is reachable (the SAME distributablePublication gate)`);
            assert(distributeCalls.length === 2, `6. [${family}] both distribute actions genuinely executed (distributionCommand AND snapshotDistributionCommand each called once)`);
            assert(discoverCalls.length === 1, `7. [${family}] discoverSnapshotCommand genuinely executed`);

            // UPDATED 0.9.179 — exercise unregisterSelectedSnapshot() for
            // REAL, for every family, while the canvas is still mounted
            // (and so still subscribed to the registry's own change
            // notification) so a genuine removal is actually observed here,
            // not merely inferred. Proves the new action's own gate is
            // exactly `selectedEncounterSnapshotInspection` — SNAPSHOT
            // alone — and never a blanket "remove whatever is currently
            // selected," the deliberate difference from the generic,
            // all-three-families action 0.9.178's own "Recommendation"
            // suggested but this milestone's own brief chose not to build.
            const sourceCountBefore = canvas.registry.listSources().length;
            canvas.unregisterSelectedSnapshot();
            await flush();
            row.unregister = canvas.registry.listSources().length < sourceCountBefore;

            if (family === 'SNAPSHOT') {
                assert(row.unregister, `8. [${family}] unregisterSelectedSnapshot() genuinely removes the Snapshot's own registered source`);
                assert(canvas.selectionOutcome.status === WorldEncounterSelectionOutcomeStatus.UNAVAILABLE, `8b. [${family}] the selection outcome collapses to UNAVAILABLE once removed — mirroring 0.9.178's own Section H`);
            } else {
                assert(!row.unregister, `8. [${family}] unregisterSelectedSnapshot() is a genuine no-op for a non-Snapshot-sourced selection — the registered source survives untouched`);
                assert(canvas.resolvedEncounterSelection !== null, `8b. [${family}] the resolved selection is completely untouched`);
            }

            unmountCanvas(canvas);
        }

        // UPDATED 0.9.179 — inspect/select/load/distribute/discover stay
        // fully symmetric across LOCAL/PEER/SNAPSHOT, exactly as 0.9.178
        // found; `unregister` alone now differs, DELIBERATELY, because this
        // milestone scoped the new action to Snapshot sources specifically
        // rather than building the generic, all-three-families version.
        const withoutUnregister = (row) => { const { unregister, ...rest } = row; return rest; };
        assert(JSON.stringify(withoutUnregister(table.LOCAL)) === JSON.stringify(withoutUnregister(table.PEER)), '9. LOCAL and PEER rows are identical apart from unregister');
        assert(JSON.stringify(withoutUnregister(table.PEER)) === JSON.stringify(withoutUnregister(table.SNAPSHOT)), '10. PEER and SNAPSHOT rows are identical apart from unregister');
        assert(table.LOCAL.unregister === false && table.PEER.unregister === false, '11. unregisterSelectedSnapshot() has no effect for LOCAL or PEER sources');
        assert(table.SNAPSHOT.unregister === true, '12. unregisterSelectedSnapshot() genuinely removes a SNAPSHOT source');

        console.log('✓ Section C: LOCAL/PEER/SNAPSHOT truth table (updated 0.9.179) —');
        console.log('               LOCAL   PEER   SNAPSHOT');
        console.log(`  inspect        ${table.LOCAL.inspect}   ${table.PEER.inspect}   ${table.SNAPSHOT.inspect}`);
        console.log(`  select         ${table.LOCAL.select}   ${table.PEER.select}   ${table.SNAPSHOT.select}`);
        console.log(`  load           ${table.LOCAL.load}   ${table.PEER.load}   ${table.SNAPSHOT.load}`);
        console.log(`  distribute     ${table.LOCAL.distribute}   ${table.PEER.distribute}   ${table.SNAPSHOT.distribute}`);
        console.log(`  discover       ${table.LOCAL.discover}   ${table.PEER.discover}   ${table.SNAPSHOT.discover}`);
        console.log(`  unregister     ${table.LOCAL.unregister}   ${table.PEER.unregister}   ${table.SNAPSHOT.unregister}  (0.9.179 — Snapshot-specific, by design)`);
        console.log('✓ Section C: inspect/select/load/distribute/discover stay fully symmetric across LOCAL/PEER/SNAPSHOT; unregister is now deliberately Snapshot-specific');
    }

    // ---------------------------------------------------------------
    // Section D — the material availability boundary.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const publication = publishOwnPublication(storageProvider, 'Section D Snapshot Publication');
        const registry = new WorldDiscoverySourceRegistry();
        const registration = registerMaterializedSnapshotWorldSource(
            registry,
            placedResult('hash-section-d', publication.id, { x: 11, y: 0, z: 11 }),
            publication
        );
        assert(registration.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, 'sanity — Section D registration succeeds');
        const expectedOrigin = materializedSnapshotWorldOrigin('hash-section-d', publication.id);
        assert(registration.origin === expectedOrigin, 'sanity — the registered origin matches the derived one');

        const localSource = capturingMaterialSource(Object.freeze({ id: publication.id, title: publication.title }));
        const canvas = buildCanvasInstance({ registry, materialSources: { local: localSource } });
        mountCanvas(canvas);
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: publication.id });
        await flush();

        assert(canvas.resolvedEncounterSelection.origin === expectedOrigin, '1. the resolved selection carries the Snapshot\'s own registered origin');
        assert(localSource.calls.length === 1, '2. selecting a registered Snapshot dispatches exactly ONE material load call — no second, parallel materialization path');
        assert(localSource.calls[0].origin === expectedOrigin, '3. that one call carries the Snapshot origin, routed through the ordinary materialSources.local slot (0.9.166) — never a separate materialSources.snapshot slot');
        assert(canvas.materialInspection.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE, '4. material becomes AVAILABLE through the ordinary loading path alone');
        assert(canvas.materialInspection.loading.material.id === publication.id, '5. the acquired material is the correct, registered Publication');
        assert(canvas.distributablePublication === canvas.materialInspection.loading.material, '6. distributablePublication IS that same ordinarily-loaded material — no second Snapshot materialization object exists');

        // Structural confirmation: the loading module itself has exactly
        // one Snapshot-aware branch (routing `snapshot:*` origins to the
        // EXISTING materialSources.local slot) and introduces no
        // materialSources.snapshot slot of its own.
        const loadingSource = await readFile(new URL('../application/WorldEncounterMaterialLoading.js', import.meta.url), 'utf8');
        assert(!/materialSources\.snapshot/.test(stripLineComments(loadingSource)), '7. no materialSources.snapshot slot exists in the loading module\'s own executable code (prose explaining why it was deliberately NOT introduced is exempt)');

        unmountCanvas(canvas);
        console.log('✓ Section D: registering a Snapshot, then selecting it, already routes material through the ordinary World material-loading path — no second Snapshot materialization path exists to select from here');
    }

    // ---------------------------------------------------------------
    // Section E — position actionability.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const publication = publishOwnPublication(storageProvider, 'Section E Snapshot Publication');
        const registry = new WorldDiscoverySourceRegistry();
        const establishedPosition = { x: -6, y: 2, z: 13 };
        const registration = registerMaterializedSnapshotWorldSource(
            registry,
            placedResult('hash-section-e', publication.id, establishedPosition),
            publication
        );
        assert(registration.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, 'sanity — Section E registration succeeds');

        const canvas = buildCanvasInstance({ registry, materialSources: { local: capturingMaterialSource(Object.freeze({ id: publication.id })) } });
        mountCanvas(canvas);
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: publication.id });
        await flush();

        const inspection = canvas.selectedEncounterSnapshotInspection;
        assert(inspection !== null, 'sanity — a Snapshot inspection descriptor is available');
        assert(inspection.position.x === establishedPosition.x && inspection.position.y === establishedPosition.y && inspection.position.z === establishedPosition.z,
            '1. the inspection panel\'s own position is exactly the World\'s already-established placement');
        assert(canvas.selectedEncounterInspection.x === establishedPosition.x
            && canvas.selectedEncounterInspection.y === establishedPosition.y
            && canvas.selectedEncounterInspection.z === establishedPosition.z,
            '2. the base inspection panel reports the SAME established position — one authoritative position, never two');

        // No method on this component offers to move, relocate, or
        // reposition anything.
        const methodNames = Object.keys(WorldEncounterCanvas.methods);
        assert(!methodNames.some((name) => /^(move|reposition|relocate|setPosition|updatePosition)/i.test(name)),
            '3. no move/reposition/relocate/setPosition/updatePosition method exists on WorldEncounterCanvas.js');

        // The inspection panel template block contains no input bound
        // (v-model) to any coordinate. UPDATED 0.9.179 — it now contains
        // exactly ONE click action (unregisterSelectedSnapshot(), added by
        // that milestone), and it is not a position-changing one.
        const inspectionPanelMatch = canvasSource.match(/<div v-if="selectedEncounter" class="world-encounter-inspection-panel">[\s\S]*?<\/div>/);
        assert(inspectionPanelMatch !== null, 'sanity — the inspection panel template block is found');
        assert(!/v-model/.test(inspectionPanelMatch[0]), '4. the inspection panel template contains no v-model binding of any kind — it is read-only');
        const clickMatches = inspectionPanelMatch[0].match(/@click="([^"]+)"/g) || [];
        assert(clickMatches.length === 1 && clickMatches[0] === '@click="unregisterSelectedSnapshot"',
            `5. the inspection panel template contains exactly one click action, unregisterSelectedSnapshot() (0.9.179) — never a position-changing one — found: ${clickMatches.join(', ')}`);

        unmountCanvas(canvas);
        console.log('✓ Section E: the displayed position is simply the established World position; the inspection panel\'s only action (0.9.179\'s unregisterSelectedSnapshot()) offers no repositioning, and no method on this component ever moves/relocates/repositions anything');
    }

    // ---------------------------------------------------------------
    // Section F — identity preservation under actionability.
    // ---------------------------------------------------------------
    {
        const scenario = buildTripleFamilyScenario('SectionF');
        const canvas = buildCanvasInstance({
            registry: scenario.registry,
            materialSources: {
                local: capturingMaterialSource(Object.freeze({ id: scenario.objectId, title: 'Local Material' })),
                peer: capturingMaterialSource(Object.freeze({ id: scenario.objectId, title: 'Peer Material' }))
            }
        });
        mountCanvas(canvas);
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: scenario.objectId });
        await flush();

        assert(canvas.selectionOutcome.status === WorldEncounterSelectionOutcomeStatus.AMBIGUOUS, 'sanity — three families for one objectId starts AMBIGUOUS');
        const snapshotCandidate = candidateFor(canvas.selectionOutcome.candidates, scenario.snapshotOrigin);
        assert(snapshotCandidate !== null, 'sanity — the Snapshot candidate is offered');
        canvas.chooseSelectionOrigin(snapshotCandidate);
        await flush();

        const inspection = canvas.selectedEncounterSnapshotInspection;
        assert(inspection !== null, 'sanity — choosing the Snapshot candidate resolves a Snapshot inspection descriptor');

        assert(inspection.publicationId === scenario.objectId, '1. publicationId names the World identity (objectId), exactly');
        assert(inspection.publicationId !== inspection.contentHash, '2. publicationId is never confused with contentHash');
        assert(inspection.contentHash === 'hash-SectionF', '3. contentHash names content identity alone, independent of publicationId');
        assert(canvas.resolvedEncounterSelection.origin === scenario.snapshotOrigin, '4. origin names the discovery contribution alone');
        assert(canvas.resolvedEncounterSelection.origin !== inspection.publicationId, '5. origin (the compound string) is never substituted for publicationId');
        assert(canvas.resolvedEncounterSelection.origin !== LOCAL_WORLD_DISCOVERY_ORIGIN, '6. the chosen Snapshot origin is never confused with the LOCAL origin');
        assert(canvas.resolvedEncounterSelection.origin !== scenario.peerOrigin, '7. the chosen Snapshot origin is never confused with the peer origin');
        assert(canvas.distributablePublication.id === scenario.objectId, '8. the material this actionability boundary hands to distribute/discover carries publicationId, never contentHash, as its own id');
        assert(canvas.distributablePublication.id !== inspection.contentHash, '9. distributablePublication.id is never accidentally the contentHash');

        // Switching the explicit choice to LOCAL proves objectId (World
        // identity) stays fixed while origin (discovery contribution)
        // changes underneath it — the two are never conflated.
        const localCandidate = candidateFor(canvas.selectionOutcome.candidates, LOCAL_WORLD_DISCOVERY_ORIGIN);
        canvas.chooseSelectionOrigin(localCandidate);
        await flush();
        assert(canvas.resolvedEncounterSelection.origin === LOCAL_WORLD_DISCOVERY_ORIGIN, '10. the origin changed to LOCAL');
        assert(canvas.selectedEncounter.objectId === scenario.objectId, '11. objectId (World identity) never changed — the same Publication, reached through a different source');
        assert(canvas.selectedEncounterSnapshotInspection === null, '12. LOCAL-origin selection reports no Snapshot inspection detail');

        unmountCanvas(canvas);
        console.log('✓ Section F: contentHash, publicationId, and origin never substitute for one another anywhere actionability (selection, material loading, distribute/discover gating) actually reaches');
    }

    // ---------------------------------------------------------------
    // Section G — an AMBIGUOUS selection has no Snapshot-specific
    // actionability until the Wanderer explicitly resolves it.
    // ---------------------------------------------------------------
    {
        const scenario = buildTripleFamilyScenario('SectionG');
        const canvas = buildCanvasInstance({
            registry: scenario.registry,
            materialSources: {
                local: capturingMaterialSource(Object.freeze({ id: scenario.objectId })),
                peer: capturingMaterialSource(Object.freeze({ id: scenario.objectId }))
            },
            distributionCommand: async () => ({ outcome: 'DISTRIBUTED' })
        });
        mountCanvas(canvas);
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: scenario.objectId });
        await flush();

        assert(canvas.selectionOutcome.status === WorldEncounterSelectionOutcomeStatus.AMBIGUOUS, 'sanity — still AMBIGUOUS, no explicit choice made');
        assert(canvas.resolvedEncounterSelection === null, '1. resolvedEncounterSelection stays null while AMBIGUOUS');
        assert(canvas.selectedEncounterPresentation !== null && canvas.selectedEncounterPresentation.sourceFamily === null,
            '2. selectedEncounterPresentation degrades to sourceFamily: null while AMBIGUOUS — presentation never resolves ambiguity on its own');
        assert(canvas.selectedEncounterPresentationSourceLabel === 'Unresolved', '3. the source label reads Unresolved, never a guessed family');
        assert(canvas.selectedEncounterSnapshotInspection === null, '4. Snapshot inspection detail stays null while AMBIGUOUS, even though a Snapshot candidate genuinely exists among the offered candidates');
        assert(canvas.materialInspection === null, '5. no material is loaded for ANY candidate while AMBIGUOUS — no implicit "try the first one"');
        assert(canvas.distributablePublication === null, '6. distribute/discover stay ungated-off (unavailable) while AMBIGUOUS — no action is reachable for an unresolved selection');

        canvas.distributeSelectedPublication();
        await flush();
        assert(!canvas.distributionExecuting, '7. calling distributeSelectedPublication() while AMBIGUOUS is a genuine no-op — it never executes for a guessed candidate');

        // Only an EXPLICIT choice changes any of this.
        const snapshotCandidate = candidateFor(canvas.selectionOutcome.candidates, scenario.snapshotOrigin);
        canvas.chooseSelectionOrigin(snapshotCandidate);
        await flush();
        assert(canvas.selectedEncounterSnapshotInspection !== null, '8. an explicit choice of the Snapshot candidate now, and only now, produces Snapshot inspection detail');
        assert(canvas.distributablePublication !== null, '9. distribute/discover become reachable now, and only now, after the explicit choice');

        unmountCanvas(canvas);
        console.log('✓ Section G: an AMBIGUOUS encounter has no Snapshot-specific actionability of any kind — presentation, inspection, and every action gate stay inert together until the Wanderer explicitly resolves the ambiguity');
    }

    // ---------------------------------------------------------------
    // Section H — a removed Snapshot source: actionability disappears
    // together with the resolved selection, never as a stale leftover.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const publication = publishOwnPublication(storageProvider, 'Section H Snapshot Publication');
        const registry = new WorldDiscoverySourceRegistry();
        const registration = registerMaterializedSnapshotWorldSource(
            registry,
            placedResult('hash-section-h', publication.id, { x: 5, y: 0, z: 5 }),
            publication
        );
        assert(registration.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, 'sanity — Section H registration succeeds');

        const canvas = buildCanvasInstance({
            registry,
            materialSources: { local: capturingMaterialSource(Object.freeze({ id: publication.id })) },
            distributionCommand: async () => ({ outcome: 'DISTRIBUTED' })
        });
        mountCanvas(canvas);
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: publication.id });
        await flush();

        assert(canvas.selectedEncounterSnapshotInspection !== null, 'sanity — Snapshot inspection detail is available before removal');
        assert(canvas.distributablePublication !== null, 'sanity — distribute/discover are reachable before removal');

        unregisterMaterializedSnapshotWorldSource(registry, 'hash-section-h', publication.id);
        await flush();

        assert(canvas.selectionOutcome.status === WorldEncounterSelectionOutcomeStatus.UNAVAILABLE, '1. the selection outcome collapses to UNAVAILABLE once the only source is removed');
        assert(canvas.resolvedEncounterSelection === null, '2. resolvedEncounterSelection becomes null');
        assert(canvas.selectedEncounterPresentation === null, '3. selectedEncounterPresentation becomes null');
        assert(canvas.selectedEncounterSnapshotInspection === null, '4. Snapshot inspection detail disappears — no stale descriptor survives merely because one was computed a moment ago');
        assert(canvas.materialInspection === null, '5. materialInspection is cleared — no stale material survives either');
        assert(canvas.distributablePublication === null, '6. distribute/discover become unreachable again — no stale action survives');

        canvas.distributeSelectedPublication();
        await flush();
        assert(!canvas.distributionExecuting, '7. attempting to distribute after removal is a genuine no-op');

        unmountCanvas(canvas);
        console.log('✓ Section H: removing a Snapshot\'s source collapses resolved selection, Snapshot inspection, material inspection, and every actionability gate together — no stale action survives an old inspection object');
    }

    // ---------------------------------------------------------------
    // Section I — structural audit.
    // ---------------------------------------------------------------
    {
        // None of the three inspection-layer computeds this milestone
        // audits ever calls a discovery/resolution/materialization/
        // placement/registration function itself — extracted and checked
        // as isolated text, so a legitimate call to one of these functions
        // from an unrelated, explicit, Wanderer-initiated ACTION method
        // elsewhere in this same file (e.g. discoverSelectedSnapshot())
        // never produces a false failure here.
        const forbiddenCalls = /resolveSnapshotWorldPlacement\(|resolveSnapshotWorldPositionClaim\(|registerMaterializedSnapshotWorldSource\(|unregisterMaterializedSnapshotWorldSource\(|discoverSnapshotCandidates\(|materializeSelectedSnapshot\(|resolveSelectedSnapshot\(|attributeSelectedSnapshot\(/;

        const selectedEncounterInspectionBody = extractComputedBody(canvasSource, 'selectedEncounterInspection', 'selectedEncounterInspectionPublisherIdentityLabel');
        assert(!forbiddenCalls.test(stripLineComments(selectedEncounterInspectionBody)),
            '1. selectedEncounterInspection never calls a discovery/resolution/materialization/placement/registration function');

        const selectedEncounterPresentationBody = extractComputedBody(canvasSource, 'selectedEncounterPresentation', 'selectedEncounterPresentationSourceLabel');
        assert(!forbiddenCalls.test(stripLineComments(selectedEncounterPresentationBody)),
            '2. selectedEncounterPresentation never calls a discovery/resolution/materialization/placement/registration function');

        const selectedEncounterSnapshotInspectionBody = extractComputedBody(canvasSource, 'selectedEncounterSnapshotInspection', 'resolvedLead');
        assert(!forbiddenCalls.test(stripLineComments(selectedEncounterSnapshotInspectionBody)),
            '3. selectedEncounterSnapshotInspection never calls a discovery/resolution/materialization/placement/registration function');

        // UPDATED 0.9.179 — this milestone's own finding (the unwired
        // registration undo) was subsequently acted on by 0.9.179: it is
        // now wired into exactly `unregisterSelectedSnapshot()` and NO
        // computed of any kind — Sections 1-3 above already prove none of
        // the three inspection-layer computeds calls it (or anything else
        // forbidden); this assertion is the durable, structural record that
        // the ONE call site is that one action method, never a computed.
        assert(canvasSource.includes('unregisterMaterializedSnapshotWorldSource'),
            '4. unregisterMaterializedSnapshotWorldSource() is now wired into WorldEncounterCanvas.js (0.9.179) — the 0.9.178 finding, acted on');
        const unregisterSelectedSnapshotBody = extractComputedBody(canvasSource, 'unregisterSelectedSnapshot', 'discoverPublication');
        assert(unregisterSelectedSnapshotBody.includes('unregisterMaterializedSnapshotWorldSource('),
            '4b. unregisterSelectedSnapshot() is that one call site');

        // No new World Encounter kind, no new lifecycle/comparison
        // vocabulary, introduced by this milestone's own two touched
        // areas (this test file, and nothing else — no production file
        // was modified to build this audit).
        assert(WorldEncounterKind.PUBLICATION === 'PUBLICATION' && WorldEncounterKind.AVATAR === 'AVATAR' && Object.keys(WorldEncounterKind).length === 2,
            '5. WorldEncounterKind still carries exactly PUBLICATION and AVATAR — no new kind was introduced');
        assert(!/rank|trust|verified\b.{0,40}[Ss]napshot|freshness|quality|score|preferred|reliable/i.test(stripLineComments(snapshotInspectionSource)),
            '6. WorldSnapshotInspection.js still carries no rank/trust/verified/freshness/quality/score/preferred/reliable vocabulary of any kind');

        console.log('✓ Section I: no inspection-layer computed calls a discovery/resolution/materialization/placement/registration function itself; this milestone\'s own finding (the unwired registration undo) was subsequently wired into exactly one action method (0.9.179\'s unregisterSelectedSnapshot()), never a computed; no new World Encounter kind or comparison vocabulary was introduced');

        console.log('\n✅ All World Snapshot Inspection Actionability Audit checks passed.');
    }
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
