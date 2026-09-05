import { readFile } from 'node:fs/promises';

import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import { WorldDiscoverySourceRegistry } from '../application/WorldDiscoverySourceRegistry.js';
import { describeWorldFromDiscoveryRegistry } from '../application/WorldDiscoveryRegistryProjection.js';
import { describeLocalWorldDiscoverySource, LOCAL_WORLD_DISCOVERY_ORIGIN } from '../application/WorldEncounterIntegration.js';
import { describeWorldDiscoverySource } from '../core/WorldDiscoverySource.js';
import { bootstrapWorldDiscoveryRuntime } from '../application/WorldDiscoveryRuntimeBootstrap.js';
import { describePeerWorldDiscoverySource, derivePeerWorldOrigin } from '../peer/PeerWorldDataIngress.js';
import { registerPeerWorldSource, unregisterPeerWorldSource } from '../peer/PeerWorldDiscoveryLifecycleBridge.js';
import {
    registerMaterializedSnapshotWorldSource,
    unregisterMaterializedSnapshotWorldSource,
    materializedSnapshotWorldOrigin
} from '../application/MaterializedSnapshotWorldDiscoveryBridge.js';
import { SnapshotWorldPlacementOutcome } from '../application/SnapshotWorldPlacementOutcome.js';
import { SnapshotWorldRegistrationOutcome } from '../application/SnapshotWorldRegistrationOutcome.js';
import { describeWorldEncounterSelectionCandidatesFromRegistry } from '../application/WorldEncounterSelectionResolution.js';
import { describeWorldEncounterSelectionOutcomeFromRegistry, WorldEncounterSelectionOutcomeStatus } from '../application/WorldEncounterSelectionOutcome.js';
import { WorldEncounterKind } from '../core/WorldEncounter.js';
import { WorldEncounterMaterialLoadStatus } from '../application/WorldEncounterMaterialLoading.js';
import { LocalWorldEncounterMaterialSource } from '../application/LocalWorldEncounterMaterialSource.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { Publication } from '../publisher/Publication.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';

// 0.9.174 — World Source Lifecycle & Staleness Audit.
//
// 0.9.9 through 0.9.173 built REGISTER -> OBSERVE -> SELECT -> LOAD ->
// RENDER -> UNREGISTER one seam at a time, most recently proving (0.9.173)
// that a fully decentralized Snapshot travels that entire path. Every one
// of those milestones proved the MECHANICS exist. This audit asks the one
// question none of them asked directly: once local, peer, and
// decentralized Snapshot sources can all become World sources, can the
// World reliably distinguish a currently registered source from one that
// should no longer participate — across TIME, not just across one
// register/select/render pass?
//
// TEST-ONLY. THIS FILE ADDS NO PRODUCTION CODE AND CHANGES NO EXISTING
// FILE. Every collaborator this audit drives — `WorldDiscoverySourceRegistry.js`,
// `WorldDiscoveryRegistryProjection.js`, `WorldEncounterSelectionResolution.js`,
// `WorldEncounterSelectionOutcome.js`, `WorldEncounterMaterialInspection.js`,
// `WorldEncounterCanvas.js`, `WorldDiscoveryRuntimeBootstrap.js`, the peer
// and Snapshot lifecycle bridges — is read, real, and unmodified.
//
// PER THE BRIEF THAT REQUESTED THIS MILESTONE: OBSERVE FIRST, NEVER
// INVENT A DESIRED SEMANTIC BEFORE WATCHING THE REAL ONE. Every assertion
// below documents behavior this audit's own author first reproduced
// against the real, unmodified production files, not a semantic decided
// in advance and then coded around. Where the existing primitives
// (`WorldDiscoverySourceRegistry`'s replacement/removal rules, the
// `materialInspectionRequestId`/`resolvedEncounterSelectionsEqual()` guards
// 0.9.39/0.9.169 already built) already produce the correct answer, this
// audit says so and adds no new one. No genuine defect surfaced during
// this audit's own construction — see Section K for the structural proof
// that no new lifecycle vocabulary was introduced to make that so.
//
//   Section A: registration visibility — one source, register it, prove
//              it becomes visible through the ordinary World pipeline.
//   Section B: unregistration propagation — unregister it and verify its
//              disappearance from EVERY downstream projection the brief
//              named: registry.listSources(), the combined World
//              discovery projection, the per-source selection candidate
//              list, and rendered canvas markers.
//   Section C: THE MOST IMPORTANT CASE — selected-source removal, for
//              LOCAL, PEER, and SNAPSHOT alike. What the running system
//              actually does: every DERIVED read (selectionOutcome,
//              resolvedEncounterSelection, materialInspection,
//              selectedEncounterInspection, rendered marker) resolves to
//              empty; the one thing that is NOT cleared is the Wanderer's
//              own raw click identity (`selectedEncounter`), by 0.9.16's
//              own pre-existing, deliberate design.
//   Section D: replacement — an origin's contribution changes from naming
//              Publication A to naming Publication B while A is selected;
//              and, separately, an in-place content update at the SAME
//              objectId/origin. Neither ever leaves a stale, dangling
//              reference to the old A visible to any subscriber.
//   Section E: Snapshot-specific lifecycle — snapshot:H:A and snapshot:H:B
//              (identical contentHash, different Publications) each
//              travel register -> select -> unregister independently;
//              the 0.9.163 origin-folding fix keeps them fully isolated
//              through removal, not merely through registration.
//   Section F: cross-family isolation under FULL lifecycle churn — while
//              LOCAL is selected, PEER and SNAPSHOT sources are registered
//              and unregistered around it (not merely registered, as
//              0.9.169/0.9.170 already proved) with zero effect on the
//              held selection's material inspection or rendered marker.
//   Section G: in-flight operations — SELECT A, begin loading A's
//              material, UNREGISTER A before that load resolves. The
//              existing `materialInspectionRequestId` guard (0.9.39)
//              already invalidates the stale response; this section
//              proves it under this exact race, then goes one step
//              further — a fresh re-registration of A while the ORIGINAL
//              stale response is still pending never lets that stale
//              response overwrite the fresh one either.
//   Section H: full mixed-source runtime — LOCAL (via the real
//              `bootstrapWorldDiscoveryRuntime()`), PEER, and SNAPSHOT
//              coexist; register/replace/remove operations run in a mixed
//              order against one already-mounted canvas, with the World
//              projection checked for consistency after every step.
//   Section I: structural audit — confirms this milestone (and the
//              existing lifecycle primitives it exercises) introduces no
//              STALE/EXPIRED/DELETED/INVALIDATED-shaped vocabulary
//              anywhere in the production files this audit reads.

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

// Counts real load() calls, mirroring 0.9.169/0.9.170's own instrument
// exactly — the one way to tell "a reload genuinely happened" from "it was
// correctly skipped or correctly suppressed."
function countingMaterialSource(counts, key, underlying) {
    return {
        async load(resolvedSelection, resolvedLead) {
            counts[key] = (counts[key] || 0) + 1;
            return underlying.load(resolvedSelection, resolvedLead);
        }
    };
}

function buildCanvasInstance({ registry = null, materialSources = null, materialVerifier = null } = {}) {
    const ctx = {
        registry,
        view: WorldEncounterCanvas.props.view.default(),
        materialSources,
        materialVerifier
    };
    Object.assign(ctx, WorldEncounterCanvas.data.call(ctx));
    Object.assign(ctx, WorldEncounterCanvas.methods);
    Object.defineProperty(ctx, 'resolvedEncounterSelection', {
        get() { return WorldEncounterCanvas.computed.resolvedEncounterSelection.call(ctx); }
    });
    Object.defineProperty(ctx, 'resolvedLead', {
        get() { return WorldEncounterCanvas.computed.resolvedLead.call(ctx); }
    });
    return ctx;
}

function mountCanvas(ctx) { WorldEncounterCanvas.mounted.call(ctx); }
function unmountCanvas(ctx) { WorldEncounterCanvas.beforeUnmount.call(ctx); }

// Reads the live `selectedEncounterInspection` computed off the CURRENT
// `effectiveView` — mirrors what a real render would show in the
// inspection panel, without requiring a full Vue mount.
function inspectionOf(ctx) {
    ctx.effectiveView = WorldEncounterCanvas.computed.effectiveView.call(ctx);
    return WorldEncounterCanvas.computed.selectedEncounterInspection.call(ctx);
}

// Reads the live, real `WorldEncounterMarker`-consuming projection —
// the actual rendering machinery Section rendering checks below use,
// mirroring tests/DecentralizedSnapshotSpatialE2EAudit.test.js's own
// projectedPublicationsOf() exactly.
function projectedPublicationsOf(ctx) {
    ctx.effectiveView = WorldEncounterCanvas.computed.effectiveView.call(ctx);
    ctx.publicationRows = WorldEncounterCanvas.computed.publicationRows.call(ctx);
    return WorldEncounterCanvas.computed.projectedPublications.call(ctx);
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — registration visibility: one source, registered once,
    // becomes visible through the ordinary World pipeline: the registry
    // itself, the combined World discovery projection, the per-source
    // selection candidate list, and a rendered canvas marker.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const publication = publishOwnPublication(storageProvider, 'Section A Publication');
        const registry = new WorldDiscoverySourceRegistry();

        registry.setSource(describeLocalWorldDiscoverySource({
            publications: [{ id: publication.id, title: publication.title }],
            placements: [{ publicationId: publication.id, position: { x: 5, y: 0, z: 5 } }]
        }));

        assert(registry.listSources().length === 1, '1. REGISTER — the registry now holds exactly one source');

        const view = describeWorldFromDiscoveryRegistry(registry);
        assert(view.publications.some((p) => p.objectId === publication.id), '2. OBSERVE — the combined World discovery projection includes the registered Publication');

        const selectedEncounter = { kind: WorldEncounterKind.PUBLICATION, objectId: publication.id };
        const candidates = describeWorldEncounterSelectionCandidatesFromRegistry({ selectedEncounter, registry });
        assert(candidates.length === 1 && candidates[0].origin === LOCAL_WORLD_DISCOVERY_ORIGIN, '3. SELECT — exactly one selection candidate exists, carrying the local origin');

        const canvas = buildCanvasInstance({ registry, materialSources: { local: new LocalWorldEncounterMaterialSource(storageProvider) } });
        mountCanvas(canvas);
        canvas.selectEncounter(selectedEncounter);
        await flush();
        assert(canvas.materialInspection.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE, '4. LOAD — material loads AVAILABLE for the registered source');
        assert(canvas.materialInspection.loading.material instanceof Publication && canvas.materialInspection.loading.material.id === publication.id, '4b. LOAD — the loaded material is the real, registered Publication');
        const projected = projectedPublicationsOf(canvas);
        assert(projected.some((marker) => marker.objectId === publication.id), '5. RENDER — the registered source reaches a rendered World Encounter marker');

        unmountCanvas(canvas);
        console.log('✓ Section A: registration visibility — one registered source becomes visible through the registry, the combined projection, selection candidates, material loading, and rendering');
    }

    // ---------------------------------------------------------------
    // Section B — unregistration propagation: unregister and verify
    // disappearance from every downstream projection the brief names.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const publication = publishOwnPublication(storageProvider, 'Section B Publication');
        const registry = new WorldDiscoverySourceRegistry();
        registry.setSource(describeLocalWorldDiscoverySource({
            publications: [{ id: publication.id, title: publication.title }],
            placements: [{ publicationId: publication.id, position: { x: 6, y: 0, z: 6 } }]
        }));

        const canvas = buildCanvasInstance({ registry, materialSources: { local: new LocalWorldEncounterMaterialSource(storageProvider) } });
        mountCanvas(canvas);
        const selectedEncounter = { kind: WorldEncounterKind.PUBLICATION, objectId: publication.id };
        canvas.selectEncounter(selectedEncounter);
        await flush();
        assert(projectedPublicationsOf(canvas).some((m) => m.objectId === publication.id), '1. sanity — the marker is rendered before removal');

        registry.removeSource(LOCAL_WORLD_DISCOVERY_ORIGIN);
        await flush();

        assert(registry.listSources().length === 0, '2. registry-derived inputs — WorldDiscoverySourceRegistry.listSources() is empty');
        const view = describeWorldFromDiscoveryRegistry(registry);
        assert(view.publications.length === 0, '3. World discovery projection — describeWorldFromDiscoveryRegistry() no longer names the Publication');
        const candidates = describeWorldEncounterSelectionCandidatesFromRegistry({ selectedEncounter, registry });
        assert(candidates.length === 0, '4. World encounters / selectable targets — no selection candidate remains for the removed source');
        const projectedAfter = projectedPublicationsOf(canvas);
        assert(!projectedAfter.some((m) => m.objectId === publication.id), '5. rendering — no stale marker survives for the removed source, through the real WorldEncounterCanvas machinery');
        assert(projectedAfter.length === 0, '6. rendering — the canvas now projects zero publication markers, matching the now-empty registry');

        unmountCanvas(canvas);
        console.log('✓ Section B: unregistration propagates to the registry, the combined projection, selection candidates, and rendered markers — no stale encounter survives merely because it was previously present');
    }

    // ---------------------------------------------------------------
    // Section C — THE MOST IMPORTANT CASE: selected-source removal, for
    // LOCAL, PEER, and SNAPSHOT alike. Observed, not invented: every
    // DERIVED read resolves to empty; the raw `selectedEncounter` click
    // identity is the one thing left untouched, exactly as 0.9.16's own
    // pre-existing header already documents ("selectedEncounter itself is
    // left exactly as it was").
    // ---------------------------------------------------------------
    {
        async function selectedSourceRemovalScenario(name, { register, unregister }) {
            const registry = new WorldDiscoverySourceRegistry();
            const { objectId, materialSources } = register(registry);
            const canvas = buildCanvasInstance({ registry, materialSources });
            mountCanvas(canvas);

            const selectedEncounter = { kind: WorldEncounterKind.PUBLICATION, objectId };
            canvas.selectEncounter(selectedEncounter);
            await flush();

            assert(canvas.selectionOutcome.status === WorldEncounterSelectionOutcomeStatus.RESOLVED, `1. [${name}] sanity — the selection resolves before removal`);
            assert(canvas.materialInspection && canvas.materialInspection.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE, `2. [${name}] sanity — material loads AVAILABLE before removal; got '${canvas.materialInspection && canvas.materialInspection.loading.status}'`);
            const inspectionBefore = inspectionOf(canvas);
            assert(inspectionBefore !== null, `3. [${name}] sanity — the inspection panel has real content before removal`);

            unregister(registry);
            await flush();

            // The Wanderer's own raw click identity is NEVER cleared by a
            // registry change — 0.9.16's own header names this explicitly,
            // and this is observed here, not assumed.
            assert(canvas.selectedEncounter && canvas.selectedEncounter.objectId === objectId, `4. [${name}] the raw selectedEncounter click-identity is retained unchanged — never cleared by a registry mutation`);

            // Every DERIVED projection, by contrast, resolves to empty.
            assert(canvas.selectionOutcome.status === WorldEncounterSelectionOutcomeStatus.UNAVAILABLE, `5. [${name}] selectionOutcome becomes UNAVAILABLE — the selection is genuinely gone, never a stale RESOLVED`);
            assert(canvas.selectionOutcome.candidates.length === 0, `6. [${name}] selectionOutcome.candidates is empty — no stale candidate lingers`);
            assert(canvas.resolvedEncounterSelection === null, `7. [${name}] resolvedEncounterSelection is null — never a stale { kind, objectId, origin } object`);
            assert(canvas.materialInspection === null, `8. [${name}] materialInspection is cleared to null — the previously AVAILABLE material never lingers`);
            const inspectionAfter = inspectionOf(canvas);
            assert(inspectionAfter === null, `9. [${name}] selectedEncounterInspection is null — the inspection panel has nothing stale to show`);
            const projectedAfter = projectedPublicationsOf(canvas);
            assert(!projectedAfter.some((m) => m.objectId === objectId), `10. [${name}] no stale marker for the removed, previously-selected encounter survives rendering`);

            unmountCanvas(canvas);
            return { inspectionBefore };
        }

        // LOCAL.
        await selectedSourceRemovalScenario('LOCAL', {
            register(registry) {
                const storageProvider = new InMemoryStorageProvider();
                const publication = publishOwnPublication(storageProvider, 'Section C Local');
                registry.setSource(describeLocalWorldDiscoverySource({
                    publications: [{ id: publication.id, title: publication.title }],
                    placements: [{ publicationId: publication.id, position: { x: 1, y: 0, z: 1 } }]
                }));
                return { objectId: publication.id, materialSources: { local: new LocalWorldEncounterMaterialSource(storageProvider) } };
            },
            unregister(registry) { registry.removeSource(LOCAL_WORLD_DISCOVERY_ORIGIN); }
        });

        // PEER. A peer-origin selection routes material loading through
        // materialSources.peer (never materialSources.local) — a
        // dedicated stub is supplied so this scenario reaches the same
        // AVAILABLE precondition LOCAL/SNAPSHOT already do.
        await selectedSourceRemovalScenario('PEER', {
            register(registry) {
                const objectId = 'section-c-peer-target';
                const identity = peer('did:key:zSectionCPeer');
                registerPeerWorldSource(registry, identity, describePeerWorldDiscoverySource({
                    publications: [{ id: objectId, title: 'Section C Peer' }],
                    placements: [{ publicationId: objectId, position: { x: 2, y: 0, z: 2 } }]
                }, identity));
                const peerMaterial = Object.freeze({ displayName: 'Section C Peer Material' });
                return { objectId, materialSources: { peer: { async load() { return peerMaterial; } } } };
            },
            unregister(registry) { unregisterPeerWorldSource(registry, peer('did:key:zSectionCPeer')); }
        });

        // SNAPSHOT.
        {
            let snapshotPublicationId = null;
            await selectedSourceRemovalScenario('SNAPSHOT', {
                register(registry) {
                    const storageProvider = new InMemoryStorageProvider();
                    const publication = publishOwnPublication(storageProvider, 'Section C Snapshot');
                    snapshotPublicationId = publication.id;
                    const registration = registerMaterializedSnapshotWorldSource(registry, placedResult('hash-section-c', publication.id, { x: 3, y: 0, z: 3 }), publication);
                    assert(registration.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, 'sanity — Snapshot registration succeeds for Section C');
                    return { objectId: publication.id, materialSources: { local: new LocalWorldEncounterMaterialSource(storageProvider) } };
                },
                unregister(registry) { unregisterMaterializedSnapshotWorldSource(registry, 'hash-section-c', snapshotPublicationId); }
            });
        }

        console.log('✓ Section C: THE MOST IMPORTANT CASE — unregistering the SELECTED source, for LOCAL/PEER/SNAPSHOT alike, resolves every DERIVED projection (selectionOutcome, resolvedEncounterSelection, materialInspection, inspection panel, rendered marker) to empty; only the Wanderer\'s own raw click identity survives, exactly as 0.9.16 already documented — no stale object of any derived kind is ever retained');
    }

    // ---------------------------------------------------------------
    // Section D — replacement. `setSource()` REPLACES an origin's
    // contribution; this section proves that replacement is never
    // visible as a transient stale state, both when an objectId is
    // dropped from an origin's replacement and when it is updated in
    // place.
    // ---------------------------------------------------------------
    {
        const registry = new WorldDiscoverySourceRegistry();
        registry.setSource(describeWorldDiscoverySource({
            origin: 'origin-x',
            publications: [{ id: 'publication-a', title: 'Publication A' }],
            placements: [{ publicationId: 'publication-a', position: { x: 10, y: 0, z: 10 } }]
        }));

        // A subscriber observing the registry mid-notification never sees
        // a transient state where BOTH the old and new contents coexist,
        // nor one where the old contribution has been removed but the new
        // one not yet installed — `setSource()` mutates its Map and calls
        // `_notify()` synchronously, in that order, so any listener always
        // observes the POST-replacement snapshot.
        let sawDuringNotification = null;
        const unsubscribe = registry.subscribe(() => {
            sawDuringNotification = registry.listSources().map((s) => s.origin);
        });

        registry.setSource(describeWorldDiscoverySource({
            origin: 'origin-x',
            publications: [{ id: 'publication-b', title: 'Publication B' }],
            placements: [{ publicationId: 'publication-b', position: { x: 20, y: 0, z: 20 } }]
        }));
        unsubscribe();

        assert(sawDuringNotification !== null && sawDuringNotification.length === 1 && sawDuringNotification[0] === 'origin-x', '1. atomicity — a subscriber notified DURING the replacement already sees exactly one origin-x entry, never a transient duplicate or a transient gap');

        const view = describeWorldFromDiscoveryRegistry(registry);
        assert(!view.publications.some((p) => p.objectId === 'publication-a'), '2. Publication A is fully gone the instant origin-x is replaced — never a stale, dangling reference');
        assert(view.publications.some((p) => p.objectId === 'publication-b'), '3. Publication B, the replacement content, is now visible');

        const candidatesForA = describeWorldEncounterSelectionCandidatesFromRegistry({ selectedEncounter: { kind: WorldEncounterKind.PUBLICATION, objectId: 'publication-a' }, registry });
        assert(candidatesForA.length === 0, '4. a selection held against Publication A resolves to zero candidates after origin-x replaces it with Publication B — never a stale candidate pointing at gone content');

        // A live, mounted canvas that had A selected before the
        // replacement: does it correctly follow into UNAVAILABLE, or does
        // it retain a stale resolvedEncounterSelection/materialInspection?
        // A FRESH registry, since the one above already consumed its own
        // A -> B transition.
        const liveRegistry = new WorldDiscoverySourceRegistry();
        liveRegistry.setSource(describeWorldDiscoverySource({
            origin: 'origin-x',
            publications: [{ id: 'publication-a', title: 'Publication A' }],
            placements: [{ publicationId: 'publication-a', position: { x: 10, y: 0, z: 10 } }]
        }));
        const canvas = buildCanvasInstance({ registry: liveRegistry, materialSources: null });
        mountCanvas(canvas);
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: 'publication-a' });
        await flush();
        assert(canvas.selectionOutcome.status === WorldEncounterSelectionOutcomeStatus.RESOLVED, '5. sanity — selection of A was resolved before origin-x replaces its own contribution');

        liveRegistry.setSource(describeWorldDiscoverySource({
            origin: 'origin-x',
            publications: [{ id: 'publication-c', title: 'Publication C' }],
            placements: [{ publicationId: 'publication-c', position: { x: 30, y: 0, z: 30 } }]
        }));
        await flush();

        assert(canvas.selectionOutcome.status === WorldEncounterSelectionOutcomeStatus.UNAVAILABLE, '6. the held selection for A correctly follows the replacement into UNAVAILABLE — never a stale RESOLVED pointing at content origin-x no longer offers');
        assert(canvas.resolvedEncounterSelection === null, '7. resolvedEncounterSelection is null — never a stale { objectId: \'publication-a\', origin: \'origin-x\' } surviving the replacement');
        unmountCanvas(canvas);

        // In-place content update: SAME objectId, SAME origin, only the
        // title/position change. The held selection never transiently
        // drops to UNAVAILABLE (the candidate identity — kind/objectId/
        // origin — never changed), and the inspection panel reflects the
        // new content on the very next read.
        const registry2 = new WorldDiscoverySourceRegistry();
        registry2.setSource(describeWorldDiscoverySource({
            origin: 'origin-y',
            publications: [{ id: 'publication-stable', title: 'Original Title' }],
            placements: [{ publicationId: 'publication-stable', position: { x: 1, y: 0, z: 1 } }]
        }));
        const canvas2 = buildCanvasInstance({ registry: registry2, materialSources: null });
        mountCanvas(canvas2);
        canvas2.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: 'publication-stable' });
        await flush();
        assert(inspectionOf(canvas2).title === 'Original Title', '8. sanity — the inspection panel shows the original title before the in-place update');

        registry2.setSource(describeWorldDiscoverySource({
            origin: 'origin-y',
            publications: [{ id: 'publication-stable', title: 'Updated Title' }],
            placements: [{ publicationId: 'publication-stable', position: { x: 99, y: 0, z: 99 } }]
        }));
        await flush();

        assert(canvas2.selectionOutcome.status === WorldEncounterSelectionOutcomeStatus.RESOLVED, '9. an in-place content update at the SAME objectId/origin never drops the selection to UNAVAILABLE, even momentarily — the candidate identity never changed');
        assert(canvas2.resolvedEncounterSelection.origin === 'origin-y' && canvas2.resolvedEncounterSelection.objectId === 'publication-stable', '10. the resolved selection identity is unchanged by an in-place content update');
        assert(inspectionOf(canvas2).title === 'Updated Title', '11. the inspection panel reflects the updated content immediately — no stale title lingers');
        unmountCanvas(canvas2);

        console.log('✓ Section D: replacement is atomic and never transiently visible as stale — an origin dropping Publication A for Publication B correctly resolves a held A-selection to UNAVAILABLE (never a stale RESOLVED), while an in-place content update at the SAME identity never drops the selection at all and the inspection panel reflects new content immediately');
    }

    // ---------------------------------------------------------------
    // Section E — Snapshot-specific lifecycle: snapshot:H:A and
    // snapshot:H:B, sharing one contentHash, each independently travel
    // register -> select -> unregister; the 0.9.163 origin-folding fix
    // keeps them isolated through REMOVAL, not merely through
    // registration.
    // ---------------------------------------------------------------
    {
        const sharedContentHash = 'hash-section-e-shared';
        const storageProvider = new InMemoryStorageProvider();
        const publicationA = publishOwnPublication(storageProvider, 'Section E Publication A');
        const publicationB = publishOwnPublication(storageProvider, 'Section E Publication B');

        const registry = new WorldDiscoverySourceRegistry();
        const registrationA = registerMaterializedSnapshotWorldSource(registry, placedResult(sharedContentHash, publicationA.id, { x: 11, y: 0, z: 11 }), publicationA);
        const registrationB = registerMaterializedSnapshotWorldSource(registry, placedResult(sharedContentHash, publicationB.id, { x: 22, y: 0, z: 22 }), publicationB);
        assert(registrationA.outcome === SnapshotWorldRegistrationOutcome.REGISTERED && registrationB.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, '1. sanity — both identical-content Snapshots register successfully');
        assert(registrationA.origin !== registrationB.origin, '2. sanity — the shared contentHash still derives two DIFFERENT origin strings, folded with each Publication\'s own id (0.9.163)');
        assert(registry.listSources().length === 2, '3. sanity — two independent World sources exist, never merged into one');

        const canvas = buildCanvasInstance({ registry, materialSources: { local: new LocalWorldEncounterMaterialSource(storageProvider) } });
        mountCanvas(canvas);

        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: publicationA.id });
        await flush();
        assert(canvas.resolvedEncounterSelection.origin === registrationA.origin, '4. selecting A resolves to A\'s own dedicated origin');
        assert(canvas.materialInspection.loading.material.id === publicationA.id, '5. A\'s own material loads correctly');

        // Unregister A's own origin only. B, sharing the identical
        // contentHash, must be completely unaffected.
        unregisterMaterializedSnapshotWorldSource(registry, sharedContentHash, publicationA.id);
        await flush();

        assert(canvas.selectionOutcome.status === WorldEncounterSelectionOutcomeStatus.UNAVAILABLE, '6. unregistering A\'s own snapshot origin correctly clears A\'s own held selection to UNAVAILABLE');
        assert(canvas.materialInspection === null, '7. A\'s own materialInspection is cleared');
        assert(registry.listSources().length === 1 && registry.listSources()[0].origin === registrationB.origin, '8. B\'s own origin — sharing the identical contentHash — is completely untouched by A\'s own removal; the registry still holds exactly B');

        // Now select and remove B, independently, proving the identity
        // fix holds symmetrically in both directions.
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: publicationB.id });
        await flush();
        assert(canvas.materialInspection.loading.material.id === publicationB.id, '9. B\'s own material loads correctly, independent of A\'s own prior removal');

        unregisterMaterializedSnapshotWorldSource(registry, sharedContentHash, publicationB.id);
        await flush();
        assert(canvas.selectionOutcome.status === WorldEncounterSelectionOutcomeStatus.UNAVAILABLE, '10. unregistering B\'s own snapshot origin correctly clears B\'s own held selection');
        assert(registry.listSources().length === 0, '11. both Snapshot origins are now cleanly gone, with no residue of either');

        // A second registration for A, after A's own removal, is a fresh
        // slot — never a "revived" one carrying any memory of the removed
        // registration (mirrors WorldDiscoverySourceRegistry's own
        // "removed origin that returns is a fresh slot" rule, exercised
        // here specifically through the Snapshot bridge).
        const reRegistrationA = registerMaterializedSnapshotWorldSource(registry, placedResult(sharedContentHash, publicationA.id, { x: 33, y: 0, z: 33 }), publicationA);
        assert(reRegistrationA.outcome === SnapshotWorldRegistrationOutcome.REGISTERED && reRegistrationA.origin === registrationA.origin, '12. re-registering A after removal derives the identical origin string (deterministic identity) and succeeds as a fresh registration');
        const viewAfterReRegistration = describeWorldFromDiscoveryRegistry(registry);
        const reRegisteredRow = viewAfterReRegistration.publications.find((p) => p.objectId === publicationA.id);
        assert(reRegisteredRow.x === 33, '13. the fresh registration carries only its OWN new position — no memory of the previously removed registration\'s (11,_,11) position leaks through');

        unmountCanvas(canvas);
        console.log('✓ Section E: snapshot:H:A and snapshot:H:B, sharing one contentHash, remain fully isolated through registration AND removal alike — the 0.9.163 identity fix survives the full lifecycle, and a removed-then-re-registered origin is a genuinely fresh slot, never a revived one');
    }

    // ---------------------------------------------------------------
    // Section F — cross-family isolation under FULL lifecycle churn.
    // 0.9.169/0.9.170 already proved that a merely-REGISTERED unrelated
    // source causes no redundant reload. This section proves the wider
    // claim the brief actually asked for: cycling an unrelated source's
    // FULL register-THEN-unregister lifecycle, repeatedly, around a held
    // LOCAL selection, disturbs neither its material inspection (by
    // reference) nor its rendered marker.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const localPublication = publishOwnPublication(storageProvider, 'Section F Local');
        const snapshotPublication = publishOwnPublication(storageProvider, 'Section F Snapshot Bystander');
        const counts = {};
        const materialSources = { local: countingMaterialSource(counts, 'local', new LocalWorldEncounterMaterialSource(storageProvider)) };

        const registry = new WorldDiscoverySourceRegistry();
        registry.setSource(describeLocalWorldDiscoverySource({
            publications: [{ id: localPublication.id, title: localPublication.title }],
            placements: [{ publicationId: localPublication.id, position: { x: 4, y: 0, z: 4 } }]
        }));

        const canvas = buildCanvasInstance({ registry, materialSources });
        mountCanvas(canvas);
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: localPublication.id });
        await flush();
        assert(counts.local === 1, `1. sanity — LOCAL loads exactly once; got ${counts.local}`);
        const inspectionBefore = canvas.materialInspection;
        const markerBefore = projectedPublicationsOf(canvas).find((m) => m.objectId === localPublication.id);
        assert(markerBefore, '2. sanity — LOCAL\'s own marker renders before any churn');

        for (let cycle = 0; cycle < 3; cycle += 1) {
            const identity = peer(`did:key:zSectionF-cycle-${cycle}`);
            registerPeerWorldSource(registry, identity, describePeerWorldDiscoverySource({
                publications: [{ id: `pub-section-f-peer-${cycle}`, title: 'Bystander Peer' }],
                placements: [{ publicationId: `pub-section-f-peer-${cycle}`, position: { x: 50 + cycle, y: 0, z: 50 } }]
            }, identity));
            await flush();

            const registration = registerMaterializedSnapshotWorldSource(registry, placedResult(`hash-section-f-${cycle}`, snapshotPublication.id, { x: 60 + cycle, y: 0, z: 60 }), snapshotPublication);
            await flush();

            unregisterPeerWorldSource(registry, identity);
            await flush();
            unregisterMaterializedSnapshotWorldSource(registry, `hash-section-f-${cycle}`, snapshotPublication.id);
            await flush();

            assert(counts.local === 1, `3. [cycle ${cycle}] a full register+unregister lifecycle of unrelated PEER and SNAPSHOT sources causes zero redundant reload of the held LOCAL selection; got ${counts.local} total load(s)`);
            assert(canvas.materialInspection === inspectionBefore, `4. [cycle ${cycle}] the held LOCAL materialInspection is retained BY REFERENCE across the unrelated full lifecycle churn`);
        }

        const markerAfter = projectedPublicationsOf(canvas).find((m) => m.objectId === localPublication.id);
        assert(markerAfter && markerAfter.x === markerBefore.x && markerAfter.y === markerBefore.y, '5. LOCAL\'s own rendered marker is completely unaffected in position after all the unrelated churn');
        assert(registry.listSources().length === 1, '6. after every unrelated source has been cycled through register-then-unregister, only LOCAL\'s own original source remains');

        unmountCanvas(canvas);
        console.log('✓ Section F: cross-family isolation holds under FULL register-then-unregister lifecycle churn (not merely registration) — a held LOCAL selection\'s material inspection (by reference) and rendered marker are both completely undisturbed by repeated, unrelated PEER/SNAPSHOT source activity');
    }

    // ---------------------------------------------------------------
    // Section G — in-flight operations: SELECT A, begin loading A's
    // material, UNREGISTER A before that load resolves. Observed, not
    // invented: the existing materialInspectionRequestId guard (0.9.39)
    // already invalidates the stale response. This section proves that,
    // then goes one step further into a race 0.9.39's own tests never
    // exercised — a FRESH re-registration arriving while the ORIGINAL
    // stale response is still pending.
    // ---------------------------------------------------------------
    {
        const registry = new WorldDiscoverySourceRegistry();
        registry.setSource(describeLocalWorldDiscoverySource({
            publications: [{ id: 'pub-section-g-race', title: 'Racing Publication' }],
            placements: [{ publicationId: 'pub-section-g-race', position: { x: 1, y: 0, z: 1 } }]
        }));

        let loadCount = 0;
        const pendingLoads = [];
        const materialSources = {
            local: {
                async load(resolvedSelection) {
                    loadCount += 1;
                    const thisLoadIndex = loadCount;
                    let releaseThisLoad;
                    const gate = new Promise((resolve) => { releaseThisLoad = resolve; });
                    pendingLoads.push(releaseThisLoad);
                    await gate;
                    return { id: resolvedSelection.objectId, loadIndex: thisLoadIndex };
                }
            }
        };

        const canvas = buildCanvasInstance({ registry, materialSources });
        mountCanvas(canvas);
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-section-g-race' });
        assert(loadCount === 1, `1. sanity — selecting starts exactly one in-flight load; got ${loadCount}`);
        const requestIdAtSelection = canvas.materialInspectionRequestId;

        // UNREGISTER the SELECTED source while its own load() is still
        // pending. Observed: refreshSelectionOutcome() runs synchronously
        // off the registry's own notification, resolvedEncounterSelection
        // becomes null, and refreshMaterialInspection() is tail-called —
        // bumping materialInspectionRequestId — all BEFORE the original
        // load()'s own Promise ever settles.
        registry.removeSource(LOCAL_WORLD_DISCOVERY_ORIGIN);
        assert(canvas.materialInspectionRequestId !== requestIdAtSelection, '2. unregistering the selected source synchronously invalidates the in-flight request\'s own counter, before that request\'s Promise has even settled');
        assert(canvas.materialInspection === null, '3. materialInspection is already null immediately after unregistration — it does not wait for the stale load to resolve first');

        // Only now does the ORIGINAL, now-stale load() resolve.
        pendingLoads[0]();
        await flush();
        await flush();

        assert(loadCount === 1, `4. no second load was started merely by the unregistration itself; got ${loadCount}`);
        assert(canvas.materialInspection === null, '5. THE RACE — the stale response for the removed selection is correctly discarded, never written to materialInspection, even though it eventually resolved');
        assert(canvas.resolvedEncounterSelection === null, '6. the resolved selection stays null — the stale response never resurrects it');

        // One step further: re-register the SAME source (a fresh slot,
        // per WorldDiscoverySourceRegistry's own "a removed origin that
        // returns is a fresh slot" rule) BEFORE letting a second selection
        // settle, to prove a genuinely NEW load is issued and that ONLY
        // its own response is ever accepted.
        registry.setSource(describeLocalWorldDiscoverySource({
            publications: [{ id: 'pub-section-g-race', title: 'Racing Publication (returned)' }],
            placements: [{ publicationId: 'pub-section-g-race', position: { x: 2, y: 0, z: 2 } }]
        }));
        await flush();

        assert(loadCount === 2, `7. the re-registered source's own reappearance genuinely changes resolvedEncounterSelection back to a real value, so a fresh, SECOND load is correctly issued; got ${loadCount}`);
        const requestIdForSecondLoad = canvas.materialInspectionRequestId;

        pendingLoads[1]();
        await flush();
        await flush();

        assert(canvas.materialInspection !== null && canvas.materialInspection.loading.material.loadIndex === 2, '8. the second, genuinely fresh load\'s own response is correctly accepted');
        assert(canvas.materialInspectionRequestId === requestIdForSecondLoad, '9. sanity — no further request was issued between the second load starting and resolving');

        unmountCanvas(canvas);
        console.log('✓ Section G: in-flight operations — unregistering the selected source while its own material load is still pending invalidates that request BEFORE it resolves (never after); the eventual stale response is correctly discarded, and a subsequent fresh re-registration issues its own new request whose response alone is accepted');
    }

    // ---------------------------------------------------------------
    // Section H — full mixed-source runtime: LOCAL (via the real
    // bootstrapWorldDiscoveryRuntime() composition root), PEER, and
    // SNAPSHOT coexist; register/replace/remove operations run in a mixed
    // order against one already-mounted canvas, with World projection
    // consistency checked after every single step.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const localPublication = publishOwnPublication(storageProvider, 'Section H Local');
        const snapshotPublication = publishOwnPublication(storageProvider, 'Section H Snapshot');
        const materialSources = { local: new LocalWorldEncounterMaterialSource(storageProvider) };

        const bootstrap = bootstrapWorldDiscoveryRuntime({
            localWorldDiscoveryRecords: {
                publications: [{ id: localPublication.id, title: localPublication.title }],
                placements: [{ publicationId: localPublication.id, position: { x: 1, y: 0, z: 1 } }]
            }
        });
        const { registry } = bootstrap;

        const canvas = buildCanvasInstance({ registry, materialSources });
        mountCanvas(canvas);

        function assertProjectionConsistency(label) {
            const registryDerivedIds = new Set(describeWorldFromDiscoveryRegistry(registry).publications.map((p) => p.objectId));
            const renderedIds = new Set(projectedPublicationsOf(canvas).map((m) => m.objectId));
            assert(registryDerivedIds.size === renderedIds.size, `[${label}] rendered marker count matches the registry-derived projection count (${renderedIds.size} vs ${registryDerivedIds.size})`);
            for (const id of registryDerivedIds) {
                assert(renderedIds.has(id), `[${label}] registry-derived Publication ${id} has a corresponding rendered marker`);
            }
        }

        assertProjectionConsistency('after bootstrap');

        // Step 1 — register a peer, select it.
        const firstPeer = peer('did:key:zSectionHFirstPeer');
        registerPeerWorldSource(registry, firstPeer, describePeerWorldDiscoverySource({
            publications: [{ id: 'pub-section-h-peer', title: 'Section H Peer' }],
            placements: [{ publicationId: 'pub-section-h-peer', position: { x: 5, y: 0, z: 5 } }]
        }, firstPeer));
        await flush();
        assertProjectionConsistency('after peer registration');
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-section-h-peer' });
        await flush();
        assert(canvas.selectionOutcome.status === WorldEncounterSelectionOutcomeStatus.RESOLVED, '1. the peer selection resolves');

        // Step 2 — register Snapshot (unrelated to the current selection).
        const registration = registerMaterializedSnapshotWorldSource(registry, placedResult('hash-section-h', snapshotPublication.id, { x: 6, y: 0, z: 6 }), snapshotPublication);
        await flush();
        assertProjectionConsistency('after snapshot registration');
        assert(canvas.selectionOutcome.status === WorldEncounterSelectionOutcomeStatus.RESOLVED && canvas.resolvedEncounterSelection.origin === derivePeerWorldOrigin(firstPeer), '2. the unrelated snapshot registration leaves the held peer selection untouched');

        // Step 3 — replace the peer's own contribution (same identity,
        // different content) WHILE it is selected.
        registerPeerWorldSource(registry, firstPeer, describePeerWorldDiscoverySource({
            publications: [{ id: 'pub-section-h-peer', title: 'Section H Peer (updated)' }],
            placements: [{ publicationId: 'pub-section-h-peer', position: { x: 55, y: 0, z: 55 } }]
        }, firstPeer));
        await flush();
        assertProjectionConsistency('after peer replacement');
        assert(canvas.selectionOutcome.status === WorldEncounterSelectionOutcomeStatus.RESOLVED, '3. an in-place replacement of the SAME peer identity/objectId keeps the held selection resolved, never dropping to UNAVAILABLE');
        assert(inspectionOf(canvas).title === 'Section H Peer (updated)', '4. the held selection\'s own inspection reflects the replaced content');

        // Step 4 — unregister the now-selected peer entirely.
        unregisterPeerWorldSource(registry, firstPeer);
        await flush();
        assertProjectionConsistency('after peer unregistration');
        assert(canvas.selectionOutcome.status === WorldEncounterSelectionOutcomeStatus.UNAVAILABLE, '5. unregistering the currently-selected peer correctly clears the selection to UNAVAILABLE');
        assert(canvas.materialInspection === null, '6. materialInspection is cleared along with it');

        // Step 5 — select the still-present Snapshot; unregister the
        // (already-gone) local source in between as further unrelated
        // churn, then remove the Snapshot itself while selected.
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: snapshotPublication.id });
        await flush();
        assert(canvas.materialInspection && canvas.materialInspection.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE, '7. the Snapshot selection loads correctly, after all the preceding peer churn');

        unregisterMaterializedSnapshotWorldSource(registry, 'hash-section-h', snapshotPublication.id);
        await flush();
        assertProjectionConsistency('after snapshot unregistration');
        assert(canvas.selectionOutcome.status === WorldEncounterSelectionOutcomeStatus.UNAVAILABLE, '8. unregistering the currently-selected Snapshot correctly clears the selection to UNAVAILABLE, exactly like every other source family');
        assert(canvas.materialInspection === null, '9. materialInspection is cleared');
        assertProjectionConsistency('final state');
        assert(registry.listSources().length === 1, '10. only the original LOCAL source (never touched by this section\'s own churn) remains registered at the end');

        unmountCanvas(canvas);
        bootstrap.dispose();
        console.log('✓ Section H: a mixed LOCAL/PEER/SNAPSHOT runtime, driven through the real bootstrapWorldDiscoveryRuntime() composition root with register/replace/remove operations in a mixed order, keeps the World projection consistent (registry-derived Publications and rendered markers always match) at every single step');
    }

    // ---------------------------------------------------------------
    // Section I — structural audit: this milestone introduces no new
    // STALE/EXPIRED/DELETED/INVALIDATED-shaped status vocabulary anywhere
    // in the production files it reads. The existing primitives
    // (WorldDiscoverySourceRegistry's plain-absence removal,
    // WorldEncounterSelectionOutcome's UNAVAILABLE/RESOLVED/AMBIGUOUS,
    // WorldEncounterCanvas's request-counter guards) are sufficient, and
    // this audit adds nothing to them.
    // ---------------------------------------------------------------
    {
        const productionFiles = [
            '../application/WorldDiscoverySourceRegistry.js',
            '../application/WorldDiscoveryRegistryProjection.js',
            '../application/WorldEncounterSelectionResolution.js',
            '../application/WorldEncounterSelectionOutcome.js',
            '../application/WorldEncounterInspection.js',
            '../application/WorldEncounterMaterialInspection.js',
            '../application/WorldDiscoveryRuntimeBootstrap.js',
            '../application/MaterializedSnapshotWorldDiscoveryBridge.js',
            '../peer/PeerWorldDiscoveryLifecycleBridge.js',
            '../ui/components/WorldEncounterCanvas.js'
        ];

        // Matches a forbidden token used AS STATUS/ENUM VOCABULARY — an
        // uppercase identifier or quoted string, e.g. `'STALE'`,
        // `STALE:`, `.STALE` — never an ordinary English verb/adjective
        // inside a comment (this codebase's own existing comments already
        // say things like "invalidates any still-pending request," which
        // is prose, not a new lifecycle state, and must not trip this
        // check).
        const forbiddenVocabularyPattern = /\b(STALE|EXPIRED|DELETED|INVALIDATED)\b\s*[:=]|['"](STALE|EXPIRED|DELETED|INVALIDATED)['"]/;

        for (const relativePath of productionFiles) {
            const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
            assert(!forbiddenVocabularyPattern.test(source), `1. ${relativePath} introduces no STALE/EXPIRED/DELETED/INVALIDATED-shaped status vocabulary (as an enum member, object key, or quoted string)`);
        }

        // The registry's own removal contract is still plain absence —
        // re-confirms WorldDiscoverySourceRegistry.js's own header claim,
        // read directly rather than merely cited. The header's own prose
        // NAMES "tombstone"/"revoked"/"untrusted"/"offline" as vocabulary
        // it explicitly refuses to introduce — so this check strips `//`
        // comment lines first, then confirms none of those words survive
        // as actual, live CODE (an identifier, property key, or string
        // literal a running statement would use).
        const registrySource = await readFile(new URL('../application/WorldDiscoverySourceRegistry.js', import.meta.url), 'utf8');
        const registryCodeOnly = registrySource
            .split('\n')
            .map((line) => line.replace(/\/\/.*$/, ''))
            .join('\n');
        assert(!/tombstone|revoked|untrusted|offline/i.test(registryCodeOnly), '2. the registry still holds no tombstone/revoked/untrusted/offline vocabulary in live code (outside its own header prose disclaiming them) — removal remains plain absence');

        // WorldEncounterSelectionOutcome.js's own three statuses are
        // unchanged — no fourth status was added to solve this audit.
        const outcomeSource = await readFile(new URL('../application/WorldEncounterSelectionOutcome.js', import.meta.url), 'utf8');
        const statusMatches = outcomeSource.match(/^\s{4}(\w+):\s*'\w+'/gm) || [];
        assert(statusMatches.length === 3, `3. WorldEncounterSelectionOutcomeStatus still carries exactly three statuses (UNAVAILABLE/RESOLVED/AMBIGUOUS); found ${statusMatches.length}`);

        console.log('✓ Section I: structural audit — no STALE/EXPIRED/DELETED/INVALIDATED-shaped vocabulary was introduced anywhere this audit reads; the existing WorldDiscoverySourceRegistry (plain absence), WorldEncounterSelectionOutcome (three statuses), and WorldEncounterCanvas (request-counter) primitives are sufficient on their own');
    }

    console.log('\n✅ All World Source Lifecycle & Staleness Audit tests passed.');
    console.log('\nFINDING: no genuine defect surfaced. Every downstream projection named in the brief — registry, World discovery projection, selection candidates/outcome, material inspection, and rendered markers — already resolves cleanly to empty the instant a source (including the currently-selected one) is unregistered or replaced, across LOCAL, PEER, and SNAPSHOT alike, including under the in-flight-request race. The existing WorldDiscoverySourceRegistry replacement/removal contract, WorldEncounterSelectionOutcome\'s status classification, and WorldEncounterCanvas\'s materialInspectionRequestId/resolvedEncounterSelectionsEqual() guards are sufficient; this is Outcome 1 from the brief (everything passes) — no narrow 0.9.175 lifecycle fix is warranted.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
