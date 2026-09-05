import { readFile } from 'node:fs/promises';

import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import { WorldDiscoverySourceRegistry } from '../application/WorldDiscoverySourceRegistry.js';
import { describeLocalWorldDiscoverySource, LOCAL_WORLD_DISCOVERY_ORIGIN } from '../application/WorldEncounterIntegration.js';
import { registerPeerWorldSource, unregisterPeerWorldSource } from '../peer/PeerWorldDiscoveryLifecycleBridge.js';
import { derivePeerWorldOrigin } from '../peer/PeerWorldDataIngress.js';
import {
    registerMaterializedSnapshotWorldSource,
    unregisterMaterializedSnapshotWorldSource
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
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';

// 0.9.175 — World Source Selection Consistency Audit.
//
// 0.9.174 proved the World's LIFECYCLE is coherent: a source reliably
// enters, changes, and leaves, across LOCAL, PEER, and SNAPSHOT alike, with
// no stale reference ever surviving. This audit asks the narrower question
// that lifecycle correctness makes askable for the first time: when several
// valid World sources represent the same or related material, does
// selection consistently identify exactly what the Wanderer clicked, and
// does material acquisition then draw from that SAME source, never a
// different one silently substituted in its place?
//
//   WorldDiscoverySourceRegistry (LOCAL / PEER / SNAPSHOT sources)
//                       │
//                       ▼
//   describeWorldEncounterSelectionCandidatesFromRegistry()   (0.9.19)
//                       │
//                       ▼
//   describeWorldEncounterSelectionOutcomeFromRegistry()      (0.9.20)
//        { status, candidates, resolvedSelection }
//                       │
//                       ▼
//   WorldEncounterCanvas.resolvedEncounterSelection            (0.9.20)
//                       │
//                       ▼
//   loadWorldEncounterMaterial() -> materialSourceFor()         (0.9.21/166)
//                       │
//                       ▼
//              acquired material
//
// TEST-ONLY. THIS FILE ADDS NO PRODUCTION CODE AND CHANGES NO EXISTING
// FILE. Every collaborator this audit drives — `WorldDiscoverySourceRegistry.js`,
// `WorldEncounterSelectionResolution.js`, `WorldEncounterSelectionOutcome.js`,
// `WorldEncounterSelectionIdentity.js`, `WorldEncounterMaterialLoading.js`,
// `WorldEncounterMaterialInspection.js`, `WorldEncounterCanvas.js`, the peer
// and Snapshot lifecycle bridges — is read, real, and unmodified.
//
// OBSERVE FIRST, NEVER INVENT A DESIRED SEMANTIC IN ADVANCE. Every
// assertion below documents behavior first reproduced against the real,
// unmodified production files — never a semantic decided up front and then
// coded around. No genuine defect surfaced during this audit's own
// construction; see Section I for the structural proof that this audit
// introduces no new selection vocabulary of its own.
//
//   Section A: LOCAL selection — identity survives selection AND material
//              loading; the exact resolvedSelection reference reaches the
//              local material source's own load() call.
//   Section B: PEER selection — same proof, one family over; the peer
//              origin remains authoritative all the way through loading,
//              and a materialSources.local sitting alongside it is never
//              consulted for a peer-origin selection.
//   Section C: SNAPSHOT selection — the "snapshot:<contentHash>:<publicationId>"
//              origin survives selection AND survives being routed through
//              the shared materialSources.local slot (0.9.166) — the slot
//              changes, the identity attached to the request never does.
//   Section D: one Publication, three source families (LOCAL + PEER +
//              SNAPSHOT) all naming the SAME objectId at once — an
//              AMBIGUOUS selection whose three candidates the Wanderer
//              chooses among explicitly, one at a time. Each explicit
//              choice's own origin survives all the way through material
//              loading; choosing a different family never leaves a trace
//              of the previous one.
//   Section E: two DIFFERENT Publications sharing one contentHash under
//              Snapshot — selection (and the material it acquires) stays
//              Publication-specific; snapshot:X:A and snapshot:X:B never
//              answer for each other's own selection.
//   Section F: an AMBIGUOUS selection with an explicit choice already
//              made survives unrelated registry churn — registering and
//              unregistering a completely unrelated source, repeatedly,
//              never changes the held choice and never triggers a
//              redundant reload.
//   Section G: THE CENTRAL NEGATIVE CASE — of three still-valid candidates
//              for one objectId, the Wanderer's own CHOSEN one disappears
//              while the other two remain perfectly valid. Observed: the
//              resolved selection goes to null; it does NOT silently fall
//              back to either surviving candidate for the very same
//              objectId. Recovery requires a fresh, explicit choice.
//   Section H: a material-loading race across an explicit choice switch —
//              start loading candidate A, switch the explicit choice to
//              candidate B before A's own load resolves, then let A's
//              stale response resolve. Only B's own response is ever
//              written to materialInspection.
//   Section I: structural audit — no source-family-specific selection
//              abstraction, no Snapshot-specific branching in the shared
//              selection machinery, no ranking, no automatic fallback, no
//              deduplication, and no new lifecycle/selection vocabulary
//              anywhere this audit reads.

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

// Wraps a real material source, recording the exact `resolvedSelection`
// reference every `load()` call actually received — the one way to prove a
// caller's own resolved identity, not a re-derived copy of it, is what
// reaches a source.
function capturingWrapper(underlying) {
    const calls = [];
    return {
        calls,
        async load(resolvedSelection) {
            calls.push(resolvedSelection);
            return underlying.load(resolvedSelection);
        }
    };
}

// A material source with no real backing store — always answers with the
// same fixed `material` reference, while still recording every
// `resolvedSelection` it was called with.
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

// A material source whose `load()` never resolves until this file's own
// caller explicitly releases it — the one way to construct a genuine
// in-flight race deterministically. `materialFor(resolvedSelection)` is
// called once the gate is released, so the eventually-produced material can
// itself be shaped from the exact selection that was in flight.
function gatedMaterialSource(materialFor) {
    const calls = [];
    const releases = [];
    return {
        calls,
        releases,
        async load(resolvedSelection) {
            calls.push(resolvedSelection);
            let release;
            const gate = new Promise((resolve) => { release = resolve; });
            releases.push(release);
            await gate;
            return materialFor(resolvedSelection);
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

// Builds one Publication registered simultaneously under all three source
// families — LOCAL, PEER, and SNAPSHOT — all naming the SAME objectId.
// Used by Sections D and G, which both need this exact three-way
// ambiguity as their own starting point.
function buildTripleFamilyScenario() {
    const storageProvider = new InMemoryStorageProvider();
    const publication = publishOwnPublication(storageProvider, 'Triple Family Publication');
    const registry = new WorldDiscoverySourceRegistry();

    registry.setSource(describeLocalWorldDiscoverySource({
        publications: [{ id: publication.id, title: publication.title }],
        placements: [{ publicationId: publication.id, position: { x: 1, y: 0, z: 1 } }]
    }));

    const peerIdentity = peer('did:key:zTripleFamilyPeer');
    registerPeerWorldSource(registry, peerIdentity, {
        publications: [{ id: publication.id, title: 'Peer Copy' }],
        placements: [{ publicationId: publication.id, position: { x: 2, y: 0, z: 2 } }]
    });
    const peerOrigin = derivePeerWorldOrigin(peerIdentity);

    const registration = registerMaterializedSnapshotWorldSource(
        registry,
        placedResult('hash-triple-family', publication.id, { x: 3, y: 0, z: 3 }),
        publication
    );
    assert(registration.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, 'sanity — triple-family Snapshot registration succeeds');

    const localSource = capturingWrapper(new LocalWorldEncounterMaterialSource(storageProvider));
    const peerMaterial = Object.freeze({ displayName: 'Peer Material' });
    const peerSource = capturingMaterialSource(peerMaterial);

    return {
        registry,
        publication,
        objectId: publication.id,
        peerIdentity,
        peerOrigin,
        snapshotOrigin: registration.origin,
        materialSources: { local: localSource, peer: peerSource },
        localSource,
        peerSource,
        peerMaterial
    };
}

function candidateFor(candidates, origin) {
    return candidates.find((candidate) => candidate.origin === origin) || null;
}

// Strips `//` line comments before a structural check runs, so prose
// disclaiming a forbidden word or pattern (e.g. "no `.sort()` anywhere in
// this file") never trips a check meant to catch that pattern as LIVE
// CODE — mirrors 0.9.174's own registry-vocabulary check exactly.
function stripLineComments(source) {
    return source
        .split('\n')
        .map((line) => line.replace(/\/\/.*$/, ''))
        .join('\n');
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — LOCAL selection: resolved identity survives all the way
    // through material loading, and the exact resolvedSelection reference
    // reaches the local material source's own load() call.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const publication = publishOwnPublication(storageProvider, 'Section A Local Publication');
        const registry = new WorldDiscoverySourceRegistry();
        registry.setSource(describeLocalWorldDiscoverySource({
            publications: [{ id: publication.id, title: publication.title }],
            placements: [{ publicationId: publication.id, position: { x: 5, y: 0, z: 5 } }]
        }));

        const localSource = capturingWrapper(new LocalWorldEncounterMaterialSource(storageProvider));
        const canvas = buildCanvasInstance({ registry, materialSources: { local: localSource } });
        mountCanvas(canvas);

        const selectedEncounter = { kind: WorldEncounterKind.PUBLICATION, objectId: publication.id };
        canvas.selectEncounter(selectedEncounter);
        await flush();

        assert(canvas.selectionOutcome.status === WorldEncounterSelectionOutcomeStatus.RESOLVED, '1. selecting a LOCAL-only Publication resolves unambiguously');
        assert(canvas.resolvedEncounterSelection.origin === LOCAL_WORLD_DISCOVERY_ORIGIN, '2. resolvedEncounterSelection carries the LOCAL origin');
        assert(canvas.materialInspection.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE, '3. material loads AVAILABLE');
        assert(canvas.materialInspection.loading.resolvedSelection === canvas.resolvedEncounterSelection, '4. the loaded result forwards the EXACT resolvedEncounterSelection reference, never a re-derived copy');
        assert(canvas.materialInspection.loading.material.id === publication.id, '5. the acquired material is the correct, registered Publication');
        assert(localSource.calls.length === 1 && localSource.calls[0].origin === LOCAL_WORLD_DISCOVERY_ORIGIN, '6. the local material source itself received a resolvedSelection carrying the LOCAL origin');

        unmountCanvas(canvas);
        console.log('✓ Section A: LOCAL selection identity survives selection AND material loading, reaching the local source\'s own load() call unchanged');
    }

    // ---------------------------------------------------------------
    // Section B — PEER selection: the peer origin remains authoritative
    // through material loading, and a materialSources.local sitting
    // alongside it is never consulted for a peer-origin selection.
    // ---------------------------------------------------------------
    {
        const registry = new WorldDiscoverySourceRegistry();
        const objectId = 'section-b-peer-publication';
        const identity = peer('did:key:zSectionBPeer');
        registerPeerWorldSource(registry, identity, {
            publications: [{ id: objectId, title: 'Section B Peer Publication' }],
            placements: [{ publicationId: objectId, position: { x: 6, y: 0, z: 6 } }]
        });
        const peerOrigin = derivePeerWorldOrigin(identity);

        const peerMaterial = Object.freeze({ displayName: 'Section B Peer Material' });
        const peerSource = capturingMaterialSource(peerMaterial);
        const localSource = { async load() { throw new Error('materialSources.local must never be consulted for a peer-origin selection'); } };

        const canvas = buildCanvasInstance({ registry, materialSources: { peer: peerSource, local: localSource } });
        mountCanvas(canvas);
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId });
        await flush();

        assert(canvas.resolvedEncounterSelection.origin === peerOrigin, '1. resolvedEncounterSelection carries the peer\'s own origin, never LOCAL or a stripped identity');
        assert(canvas.materialInspection.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE, '2. material loads AVAILABLE via the peer slot');
        assert(canvas.materialInspection.loading.material === peerMaterial, '3. the acquired material is the exact peer material reference, never local material substituted for it');
        assert(peerSource.calls.length === 1 && peerSource.calls[0].origin === peerOrigin, '4. the peer material source itself received the resolvedSelection carrying its own peer origin — the peer origin remains authoritative all the way through loading');

        unmountCanvas(canvas);
        console.log('✓ Section B: PEER selection identity remains authoritative through material loading; materialSources.local is never consulted for a peer-origin selection');
    }

    // ---------------------------------------------------------------
    // Section C — SNAPSHOT selection: the "snapshot:<contentHash>:<publicationId>"
    // origin survives selection AND survives being routed through the
    // SHARED materialSources.local slot (0.9.166) — the slot the request
    // is dispatched to changes; the identity attached to the request never
    // does.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const publication = publishOwnPublication(storageProvider, 'Section C Snapshot Publication');
        const registry = new WorldDiscoverySourceRegistry();
        const registration = registerMaterializedSnapshotWorldSource(
            registry,
            placedResult('hash-section-c', publication.id, { x: 7, y: 0, z: 7 }),
            publication
        );
        assert(registration.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, 'sanity — Section C Snapshot registration succeeds');

        const localSource = capturingWrapper(new LocalWorldEncounterMaterialSource(storageProvider));
        const canvas = buildCanvasInstance({ registry, materialSources: { local: localSource } });
        mountCanvas(canvas);
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: publication.id });
        await flush();

        assert(canvas.resolvedEncounterSelection.origin === registration.origin, '1. resolvedEncounterSelection carries the full snapshot:<contentHash>:<publicationId> origin, verbatim');
        assert(canvas.materialInspection.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE, '2. material loads AVAILABLE, routed through the shared materialSources.local slot');
        assert(canvas.materialInspection.loading.resolvedSelection.origin === registration.origin, '3. the loaded result still carries the Snapshot\'s own origin — routing to the LOCAL slot never rewrites it to LOCAL_WORLD_DISCOVERY_ORIGIN');
        assert(canvas.materialInspection.loading.material.id === publication.id, '4. the acquired material is the correct Publication');
        assert(localSource.calls.length === 1 && localSource.calls[0].origin === registration.origin, '5. the shared local material source itself received a resolvedSelection carrying the SNAPSHOT origin, not a LOCAL one, even though it is the same slot LOCAL-origin selections also use');

        unmountCanvas(canvas);
        console.log('✓ Section C: SNAPSHOT selection identity survives selection AND being routed through the shared materialSources.local slot — the slot changes, the identity attached to the request never does');
    }

    // ---------------------------------------------------------------
    // Section D — one Publication, three source families (LOCAL + PEER +
    // SNAPSHOT) all naming the SAME objectId. An AMBIGUOUS selection whose
    // three candidates the Wanderer chooses among explicitly, one at a
    // time — each explicit choice's own origin must survive all the way
    // through material loading, and choosing a different family must
    // never leave a trace of the previous one.
    // ---------------------------------------------------------------
    {
        const scenario = buildTripleFamilyScenario();
        const canvas = buildCanvasInstance({ registry: scenario.registry, materialSources: scenario.materialSources });
        mountCanvas(canvas);

        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: scenario.objectId });
        await flush();

        assert(canvas.selectionOutcome.status === WorldEncounterSelectionOutcomeStatus.AMBIGUOUS, '1. three source families naming the same objectId produce an AMBIGUOUS outcome');
        assert(canvas.selectionOutcome.candidates.length === 3, '2. all three candidates are present, never deduplicated');
        const localCandidate = candidateFor(canvas.selectionOutcome.candidates, LOCAL_WORLD_DISCOVERY_ORIGIN);
        const peerCandidate = candidateFor(canvas.selectionOutcome.candidates, scenario.peerOrigin);
        const snapshotCandidate = candidateFor(canvas.selectionOutcome.candidates, scenario.snapshotOrigin);
        assert(localCandidate && peerCandidate && snapshotCandidate, '3. each of the three distinct origins is present among the candidates');
        assert(canvas.resolvedEncounterSelection === null, '4. no candidate is auto-selected — AMBIGUOUS never guesses');
        assert(canvas.materialInspection === null, '5. no material load is attempted before an explicit choice is made');

        // Choose LOCAL.
        canvas.chooseSelectionOrigin(localCandidate);
        await flush();
        assert(canvas.resolvedEncounterSelection.origin === LOCAL_WORLD_DISCOVERY_ORIGIN, '6. choosing LOCAL resolves the selection to the LOCAL origin');
        assert(canvas.materialInspection.loading.resolvedSelection.origin === LOCAL_WORLD_DISCOVERY_ORIGIN, '7. material loading carries the LOCAL origin through');
        assert(canvas.materialInspection.loading.material.id === scenario.objectId, '8. LOCAL\'s own material is acquired');
        assert(scenario.localSource.calls.length === 1, '9. the local source was called exactly once');
        assert(scenario.peerSource.calls.length === 0, '10. the peer source was never called for a LOCAL choice');

        // Choose PEER — must not retain any trace of the LOCAL choice.
        canvas.chooseSelectionOrigin(peerCandidate);
        await flush();
        assert(canvas.resolvedEncounterSelection.origin === scenario.peerOrigin, '11. choosing PEER resolves the selection to the peer\'s own origin');
        assert(canvas.materialInspection.loading.resolvedSelection.origin === scenario.peerOrigin, '12. material loading carries the peer origin through');
        assert(canvas.materialInspection.loading.material === scenario.peerMaterial, '13. the peer\'s own material is acquired, never LOCAL\'s or a mix of both');
        assert(scenario.peerSource.calls.length === 1, '14. the peer source was called exactly once');
        assert(scenario.localSource.calls.length === 1, '15. switching to PEER triggers no additional LOCAL call — the previous LOCAL load is not repeated or lingering');

        // Choose SNAPSHOT — same objectId, same underlying local storage
        // bytes as LOCAL, but a DIFFERENT origin identity that must
        // survive being routed through the same materialSources.local
        // slot LOCAL itself uses.
        canvas.chooseSelectionOrigin(snapshotCandidate);
        await flush();
        assert(canvas.resolvedEncounterSelection.origin === scenario.snapshotOrigin, '16. choosing SNAPSHOT resolves the selection to the Snapshot\'s own dedicated origin');
        assert(canvas.materialInspection.loading.resolvedSelection.origin === scenario.snapshotOrigin, '17. material loading still carries the SNAPSHOT origin — never silently rewritten to LOCAL_WORLD_DISCOVERY_ORIGIN merely because it shares LOCAL\'s own material slot');
        assert(canvas.materialInspection.loading.material.id === scenario.objectId, '18. the correct Publication is still acquired via the shared local slot');
        assert(scenario.localSource.calls.length === 2 && scenario.localSource.calls[1].origin === scenario.snapshotOrigin, '19. the local source\'s SECOND call carries the SNAPSHOT origin, distinguishing it from its own first, LOCAL-origin call');

        unmountCanvas(canvas);
        console.log('✓ Section D: one Publication registered under three source families never collapses — each explicit choice\'s own origin survives selection AND material loading, and switching families leaves no trace of the previous choice');
    }

    // ---------------------------------------------------------------
    // Section E — two DIFFERENT Publications sharing one contentHash under
    // Snapshot. Selection (and the material it acquires) stays
    // Publication-specific; snapshot:X:A and snapshot:X:B never answer for
    // each other's own selection, despite sharing a contentHash substring.
    // ---------------------------------------------------------------
    {
        const sharedContentHash = 'hash-section-e-shared';
        const storageProvider = new InMemoryStorageProvider();
        const publicationA = publishOwnPublication(storageProvider, 'Section E Publication A');
        const publicationB = publishOwnPublication(storageProvider, 'Section E Publication B');

        const registry = new WorldDiscoverySourceRegistry();
        const registrationA = registerMaterializedSnapshotWorldSource(registry, placedResult(sharedContentHash, publicationA.id, { x: 11, y: 0, z: 11 }), publicationA);
        const registrationB = registerMaterializedSnapshotWorldSource(registry, placedResult(sharedContentHash, publicationB.id, { x: 22, y: 0, z: 22 }), publicationB);
        assert(registrationA.outcome === SnapshotWorldRegistrationOutcome.REGISTERED && registrationB.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, 'sanity — both identical-content Snapshots register');
        assert(registrationA.origin !== registrationB.origin, 'sanity — the shared contentHash still derives two different origins');

        const candidatesForA = describeWorldEncounterSelectionCandidatesFromRegistry({ selectedEncounter: { kind: WorldEncounterKind.PUBLICATION, objectId: publicationA.id }, registry });
        assert(candidatesForA.length === 1 && candidatesForA[0].origin === registrationA.origin, '1. selecting Publication A yields exactly one candidate, carrying A\'s own dedicated origin — never B\'s, despite the identical contentHash');

        const candidatesForB = describeWorldEncounterSelectionCandidatesFromRegistry({ selectedEncounter: { kind: WorldEncounterKind.PUBLICATION, objectId: publicationB.id }, registry });
        assert(candidatesForB.length === 1 && candidatesForB[0].origin === registrationB.origin, '2. selecting Publication B yields exactly one candidate, carrying B\'s own dedicated origin — never A\'s');

        const localSource = capturingWrapper(new LocalWorldEncounterMaterialSource(storageProvider));
        const canvas = buildCanvasInstance({ registry, materialSources: { local: localSource } });
        mountCanvas(canvas);

        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: publicationA.id });
        await flush();
        assert(canvas.resolvedEncounterSelection.origin === registrationA.origin, '3. selecting A resolves to A\'s own origin');
        assert(canvas.materialInspection.loading.material.id === publicationA.id, '4. A\'s own material is acquired — never B\'s');

        // Unrelated churn on B's own origin while A is selected must not
        // disturb A's held selection identity in any way.
        unregisterMaterializedSnapshotWorldSource(registry, sharedContentHash, publicationB.id);
        await flush();
        assert(canvas.resolvedEncounterSelection.origin === registrationA.origin, '5. removing B\'s own origin (sharing the identical contentHash) leaves A\'s held selection completely untouched');
        registerMaterializedSnapshotWorldSource(registry, placedResult(sharedContentHash, publicationB.id, { x: 33, y: 0, z: 33 }), publicationB);
        await flush();
        assert(canvas.resolvedEncounterSelection.origin === registrationA.origin, '6. re-registering B afterward still leaves A\'s held selection completely untouched');

        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: publicationB.id });
        await flush();
        assert(canvas.resolvedEncounterSelection.origin === registrationB.origin, '7. selecting B resolves to B\'s own origin, independent of everything A did');
        assert(canvas.materialInspection.loading.material.id === publicationB.id, '8. B\'s own material is acquired — never A\'s');

        unmountCanvas(canvas);
        console.log('✓ Section E: two different Publications sharing one contentHash under Snapshot never resolve to one another — selection and the material it acquires both stay strictly Publication-specific');
    }

    // ---------------------------------------------------------------
    // Section F — an AMBIGUOUS selection with an explicit choice already
    // made survives unrelated registry churn: registering and
    // unregistering a completely unrelated source, repeatedly, never
    // changes the held choice and never triggers a redundant reload.
    // ---------------------------------------------------------------
    {
        const scenario = buildTripleFamilyScenario();
        const canvas = buildCanvasInstance({ registry: scenario.registry, materialSources: scenario.materialSources });
        mountCanvas(canvas);

        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: scenario.objectId });
        await flush();
        const peerCandidate = candidateFor(canvas.selectionOutcome.candidates, scenario.peerOrigin);
        canvas.chooseSelectionOrigin(peerCandidate);
        await flush();
        assert(canvas.resolvedEncounterSelection.origin === scenario.peerOrigin, 'sanity — the explicit PEER choice is held');
        const inspectionBefore = canvas.materialInspection;
        assert(scenario.peerSource.calls.length === 1, 'sanity — the peer source loaded exactly once before any churn');

        for (let cycle = 0; cycle < 3; cycle += 1) {
            const bystanderIdentity = peer(`did:key:zSectionF-bystander-${cycle}`);
            registerPeerWorldSource(scenario.registry, bystanderIdentity, {
                publications: [{ id: `pub-section-f-bystander-${cycle}`, title: 'Bystander' }],
                placements: [{ publicationId: `pub-section-f-bystander-${cycle}`, position: { x: 40 + cycle, y: 0, z: 40 } }]
            });
            await flush();
            unregisterPeerWorldSource(scenario.registry, bystanderIdentity);
            await flush();

            assert(canvas.resolvedEncounterSelection.origin === scenario.peerOrigin, `1. [cycle ${cycle}] the held explicit PEER choice survives an unrelated source's full register-then-unregister lifecycle`);
            assert(canvas.materialInspection === inspectionBefore, `2. [cycle ${cycle}] materialInspection is retained BY REFERENCE — no redundant reload merely because unrelated registry state changed`);
            assert(scenario.peerSource.calls.length === 1, `3. [cycle ${cycle}] the peer source's own load() was never called again; got ${scenario.peerSource.calls.length}`);
        }

        unmountCanvas(canvas);
        console.log('✓ Section F: an explicit choice among an AMBIGUOUS selection\'s own candidates survives repeated, unrelated registry churn — the held selection and its materialInspection (by reference) are both completely undisturbed');
    }

    // ---------------------------------------------------------------
    // Section G — THE CENTRAL NEGATIVE CASE. Of three still-valid
    // candidates for one objectId, the Wanderer's own CHOSEN one
    // disappears while the other two remain perfectly valid candidates for
    // the SAME objectId. Observed, not invented: the resolved selection
    // goes to null. It does NOT silently fall back to either surviving
    // candidate. Recovery requires a fresh, explicit choice.
    // ---------------------------------------------------------------
    {
        const scenario = buildTripleFamilyScenario();
        const canvas = buildCanvasInstance({ registry: scenario.registry, materialSources: scenario.materialSources });
        mountCanvas(canvas);

        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: scenario.objectId });
        await flush();
        const peerCandidate = candidateFor(canvas.selectionOutcome.candidates, scenario.peerOrigin);
        canvas.chooseSelectionOrigin(peerCandidate);
        await flush();
        assert(canvas.resolvedEncounterSelection.origin === scenario.peerOrigin, 'sanity — the PEER choice resolves before removal');
        assert(canvas.materialInspection.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE, 'sanity — material loads AVAILABLE before removal');

        // Remove exactly the CHOSEN origin. LOCAL and SNAPSHOT — both
        // still valid candidates for the very same objectId — are
        // untouched.
        unregisterPeerWorldSource(scenario.registry, scenario.peerIdentity);
        await flush();

        assert(scenario.registry.listSources().length === 2, '1. LOCAL and SNAPSHOT both remain registered, still naming the same objectId');
        assert(canvas.selectionOutcome.status === WorldEncounterSelectionOutcomeStatus.AMBIGUOUS, '2. selectionOutcome stays AMBIGUOUS — two genuine candidates still exist for this objectId, so this is never misreported as UNAVAILABLE');
        assert(canvas.selectionOutcome.candidates.length === 2, '3. exactly the two surviving candidates (LOCAL, SNAPSHOT) remain');
        assert(canvas.resolvedEncounterSelection === null, '4. THE KEY ASSERTION — resolvedEncounterSelection is null. It does NOT silently fall back to LOCAL, and does NOT silently fall back to SNAPSHOT, even though both are still completely valid candidates for this exact objectId');
        assert(canvas.materialInspection === null, '5. materialInspection is cleared — the previously AVAILABLE peer material never lingers');
        assert(canvas.resolvedSelectionChoice && canvas.resolvedSelectionChoice.origin === scenario.peerOrigin, '6. the Wanderer\'s own recorded choice is left exactly as it was (still naming the now-gone peer origin) — nothing silently reassigns it to a surviving candidate either');

        // Recovery is only ever a fresh, explicit choice — never automatic.
        const localCandidateNow = candidateFor(canvas.selectionOutcome.candidates, LOCAL_WORLD_DISCOVERY_ORIGIN);
        assert(localCandidateNow, 'sanity — LOCAL is offered among the surviving candidates');
        canvas.chooseSelectionOrigin(localCandidateNow);
        await flush();
        assert(canvas.resolvedEncounterSelection.origin === LOCAL_WORLD_DISCOVERY_ORIGIN, '7. a fresh, explicit choice correctly resolves the selection again — recovery requires the Wanderer\'s own action, never an automatic one');
        assert(canvas.materialInspection.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE, '8. material loads correctly for the freshly, explicitly chosen candidate');

        unmountCanvas(canvas);
        console.log('✓ Section G: THE CENTRAL NEGATIVE CASE — when the Wanderer\'s own chosen source disappears while other valid candidates for the SAME objectId remain, the resolved selection goes to null rather than silently falling back to a surviving candidate; recovery requires a fresh, explicit choice');
    }

    // ---------------------------------------------------------------
    // Section H — a material-loading race across an explicit choice
    // switch: start loading candidate A, switch the explicit choice to
    // candidate B before A's own load resolves, then let A's now-stale
    // response resolve. Only B's own response is ever written to
    // materialInspection.
    // ---------------------------------------------------------------
    {
        const objectId = 'section-h-race-publication';
        const registry = new WorldDiscoverySourceRegistry();
        registry.setSource(describeLocalWorldDiscoverySource({
            publications: [{ id: objectId, title: 'Section H Local' }],
            placements: [{ publicationId: objectId, position: { x: 1, y: 0, z: 1 } }]
        }));
        const identity = peer('did:key:zSectionHRacePeer');
        registerPeerWorldSource(registry, identity, {
            publications: [{ id: objectId, title: 'Section H Peer' }],
            placements: [{ publicationId: objectId, position: { x: 2, y: 0, z: 2 } }]
        });
        const peerOrigin = derivePeerWorldOrigin(identity);

        const localSource = gatedMaterialSource((resolvedSelection) => ({ family: 'local', objectId: resolvedSelection.objectId }));
        const peerSource = gatedMaterialSource((resolvedSelection) => ({ family: 'peer', objectId: resolvedSelection.objectId }));
        const canvas = buildCanvasInstance({ registry, materialSources: { local: localSource, peer: peerSource } });
        mountCanvas(canvas);

        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId });
        assert(canvas.selectionOutcome.status === WorldEncounterSelectionOutcomeStatus.AMBIGUOUS, 'sanity — LOCAL and PEER both naming this objectId are AMBIGUOUS');
        assert(canvas.materialInspection === null, 'sanity — no load is attempted before any explicit choice');

        const localCandidate = candidateFor(canvas.selectionOutcome.candidates, LOCAL_WORLD_DISCOVERY_ORIGIN);
        const peerCandidate = candidateFor(canvas.selectionOutcome.candidates, peerOrigin);

        // Choose LOCAL — starts an in-flight, gated load.
        canvas.chooseSelectionOrigin(localCandidate);
        assert(localSource.calls.length === 1, '1. choosing LOCAL starts exactly one in-flight local load');
        const requestIdAfterLocalChoice = canvas.materialInspectionRequestId;

        // Before LOCAL's own load resolves, switch the explicit choice to
        // PEER — starts a second, independent in-flight, gated load.
        canvas.chooseSelectionOrigin(peerCandidate);
        assert(peerSource.calls.length === 1, '2. switching the choice to PEER starts exactly one in-flight peer load');
        assert(canvas.materialInspectionRequestId !== requestIdAfterLocalChoice, '3. switching the explicit choice bumps materialInspectionRequestId, invalidating LOCAL\'s own still-pending request');
        assert(canvas.resolvedEncounterSelection.origin === peerOrigin, '4. resolvedEncounterSelection already reflects the PEER choice, even while LOCAL\'s own stale load is still pending');

        // Release LOCAL's now-stale load FIRST.
        localSource.releases[0]();
        await flush();
        await flush();

        assert(canvas.materialInspection === null, '5. LOCAL\'s own now-stale response is discarded — never written to materialInspection, even though it resolved successfully');
        assert(localSource.calls.length === 1 && peerSource.calls.length === 1, '6. no additional load was triggered merely by the stale response resolving');

        // Now release PEER's own, genuinely current load.
        peerSource.releases[0]();
        await flush();
        await flush();

        assert(canvas.materialInspection !== null && canvas.materialInspection.loading.material.family === 'peer', '7. PEER\'s own, genuinely current response is correctly accepted');
        assert(canvas.materialInspection.loading.resolvedSelection.origin === peerOrigin, '8. the accepted result still carries the PEER origin, never LOCAL\'s');
        assert(canvas.resolvedEncounterSelection.origin === peerOrigin, '9. the held selection is still PEER — LOCAL\'s own eventual resolution never resurrected it as the active choice');

        unmountCanvas(canvas);
        console.log('✓ Section H: switching an explicit choice mid-flight correctly invalidates the abandoned candidate\'s own in-flight request; its eventual, stale response is discarded, and only the newly-chosen candidate\'s own response is ever accepted');
    }

    // ---------------------------------------------------------------
    // Section I — structural audit: no source-family-specific selection
    // abstraction, no Snapshot-specific branching in the shared selection
    // machinery, no ranking, no automatic fallback, no deduplication, and
    // no new lifecycle/selection vocabulary anywhere this audit reads.
    // ---------------------------------------------------------------
    {
        // The selection layer itself — resolution, outcome classification,
        // and identity naming — must stay entirely origin-family agnostic.
        // Any `'peer:'`/`'snapshot:'`/`origin === 'local'`-shaped branching
        // belongs exclusively one layer down, in
        // `WorldEncounterMaterialLoading.js`'s own `materialSourceFor()` —
        // never here.
        const selectionLayerFiles = [
            '../application/WorldEncounterSelectionResolution.js',
            '../application/WorldEncounterSelectionOutcome.js',
            '../core/WorldEncounterSelectionIdentity.js'
        ];
        const originFamilyBranchingPattern = /startsWith\(\s*['"]peer:|startsWith\(\s*['"]snapshot:|===\s*['"]local['"]|===\s*LOCAL_WORLD_DISCOVERY_ORIGIN/;
        for (const relativePath of selectionLayerFiles) {
            const codeOnly = stripLineComments(await readFile(new URL(relativePath, import.meta.url), 'utf8'));
            assert(!originFamilyBranchingPattern.test(codeOnly), `1. ${relativePath} contains no source-family-specific (peer:/snapshot:/local) branching of its own, as LIVE CODE — that stays exclusively in WorldEncounterMaterialLoading.js's own materialSourceFor()`);
        }

        // No ranking, scoring, preference, or automatic-fallback
        // vocabulary anywhere in the selection/material-loading chain this
        // audit exercises — a caller-facing "pick the best/first one"
        // decision was never introduced to resolve this milestone's own
        // ambiguity cases.
        const noRankingFiles = [
            '../application/WorldEncounterSelectionResolution.js',
            '../application/WorldEncounterSelectionOutcome.js',
            '../core/WorldEncounterSelectionIdentity.js',
            '../application/WorldEncounterMaterialLoading.js',
            '../application/WorldEncounterMaterialInspection.js',
            '../ui/components/WorldEncounterCanvas.js'
        ];
        const forbiddenJudgmentPattern = /\b(RANK|SCORE|PREFERRED|PRIMARY|FALLBACK|DEDUP|DEDUPLICATE)\b\s*[:=]|['"](RANK|SCORE|PREFERRED|PRIMARY|FALLBACK|DEDUP|DEDUPLICATE)['"]|\.sort\(/;
        for (const relativePath of noRankingFiles) {
            const codeOnly = stripLineComments(await readFile(new URL(relativePath, import.meta.url), 'utf8'));
            assert(!forbiddenJudgmentPattern.test(codeOnly), `2. ${relativePath} introduces no ranking/scoring/preference/fallback/deduplication vocabulary or sorting of candidates, as LIVE CODE`);
        }

        // No new STALE/EXPIRED/DELETED/INVALIDATED-shaped lifecycle
        // vocabulary either — 0.9.174's own structural claim, re-confirmed
        // rather than assumed, since this audit reads the same files.
        const forbiddenLifecyclePattern = /\b(STALE|EXPIRED|DELETED|INVALIDATED)\b\s*[:=]|['"](STALE|EXPIRED|DELETED|INVALIDATED)['"]/;
        for (const relativePath of noRankingFiles) {
            const codeOnly = stripLineComments(await readFile(new URL(relativePath, import.meta.url), 'utf8'));
            assert(!forbiddenLifecyclePattern.test(codeOnly), `3. ${relativePath} introduces no STALE/EXPIRED/DELETED/INVALIDATED-shaped status vocabulary, as LIVE CODE`);
        }

        // WorldEncounterSelectionOutcome.js's own three statuses are
        // unchanged — no fourth status was added to solve this audit.
        const outcomeSource = await readFile(new URL('../application/WorldEncounterSelectionOutcome.js', import.meta.url), 'utf8');
        const statusMatches = outcomeSource.match(/^\s{4}(\w+):\s*'\w+'/gm) || [];
        assert(statusMatches.length === 3, `4. WorldEncounterSelectionOutcomeStatus still carries exactly three statuses (UNAVAILABLE/RESOLVED/AMBIGUOUS); found ${statusMatches.length}`);

        // describeWorldEncounterSelectionCandidates() still never
        // deduplicates — every matching candidate is returned, confirmed
        // directly against a synthetic case with two sources naming the
        // same objectId under different origins (mirrors Section D's own
        // observed behavior, checked here as a standalone structural
        // guarantee rather than an end-to-end canvas scenario).
        const dedupCheckRegistry = new WorldDiscoverySourceRegistry();
        dedupCheckRegistry.setSource(describeLocalWorldDiscoverySource({
            publications: [{ id: 'dedup-check-publication', title: 'Dedup Check' }],
            placements: [{ publicationId: 'dedup-check-publication', position: { x: 0, y: 0, z: 0 } }]
        }));
        const dedupIdentity = peer('did:key:zDedupCheckPeer');
        registerPeerWorldSource(dedupCheckRegistry, dedupIdentity, {
            publications: [{ id: 'dedup-check-publication', title: 'Dedup Check (peer copy)' }],
            placements: [{ publicationId: 'dedup-check-publication', position: { x: 0, y: 0, z: 0 } }]
        });
        const dedupCandidates = describeWorldEncounterSelectionCandidatesFromRegistry({
            selectedEncounter: { kind: WorldEncounterKind.PUBLICATION, objectId: 'dedup-check-publication' },
            registry: dedupCheckRegistry
        });
        assert(dedupCandidates.length === 2, '5. two sources naming the identical objectId still produce two candidates — no deduplication collapses them into one');

        console.log('✓ Section I: structural audit — the selection layer stays entirely origin-family agnostic, no ranking/preference/fallback/deduplication vocabulary was introduced anywhere in the selection or material-loading chain, and no new lifecycle vocabulary exists — no narrow fix was warranted');
    }

    console.log('\n✅ All World Source Selection Consistency Audit tests passed.');
    console.log('\nFINDING: no genuine defect surfaced. The source selected by a World interaction remains the source whose material is acquired, across LOCAL, PEER, and SNAPSHOT alike, including when the same Publication is registered under all three families at once, when two different Publications share one Snapshot contentHash, under unrelated registry churn, and across a material-loading race triggered by switching an explicit choice mid-flight. The one genuinely load-bearing negative case — an explicitly chosen candidate disappearing while other valid candidates for the identical objectId remain — resolves to null rather than an automatic, silent fallback; recovery is always a fresh, explicit choice. The existing WorldEncounterSelectionResolution/Outcome/Identity chain and WorldEncounterCanvas\'s own resolvedSelectionChoice/materialInspectionRequestId guards are sufficient; no narrow 0.9.176 selection fix is warranted.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
