import { readFile } from 'node:fs/promises';

import { Brick } from '../core/Brick.js';
import { Building } from '../core/Building.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { Position } from '../core/Position.js';
import { World } from '../core/World.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { LoadPublicationDocumentUseCase } from '../application/LoadPublicationDocumentUseCase.js';
import { PlacePublicationUseCase } from '../application/PlacePublicationUseCase.js';
import { RemoveWorldPlacementUseCase } from '../application/RemoveWorldPlacementUseCase.js';
import { DiscoverWorldsUseCase } from '../application/DiscoverWorldsUseCase.js';
import { PublishDocumentUseCase } from '../application/PublishDocumentUseCase.js';
import { UnpublishDocumentUseCase } from '../application/UnpublishDocumentUseCase.js';
import { DocumentManager } from '../application/DocumentManager.js';
import { VehicleType } from '../core/VehicleType.js';

// 0.9.196 — Architecture Reassessment / Product Gap Audit.
//
// Test-only. No production changes. 0.9.192/0.9.194/0.9.195's own closing
// recommendations, restated three times running, all asked the same
// question this milestone finally answers directly instead of re-auditing
// Snapshot a fourth time:
//
//   "Now that Snapshot is architecturally complete, what actual
//    user-facing capability is still missing from ForkBuild?"
//
// This is deliberately the OPPOSITE shape from 0.9.150-0.9.195: those
// milestones each proved ONE seam correct in great depth. This one sweeps
// FIVE unrelated product areas shallowly, on purpose, looking for the
// single highest-value gap rather than exhaustively re-confirming any one
// of them. Per the brief that requested it, this file stays short: one
// section per area, each answering only "Complete," "Intentional
// boundary," or "Actual gap" — never inventing a capability, a lifecycle
// state, or a semantic this codebase has not already earned through real,
// existing, working code.
//
// Every collaborator this file exercises (RemoveWorldPlacementUseCase,
// UnpublishDocumentUseCase, PlacePublicationUseCase, LocalPublisherProvider,
// VehicleType, and the rest of the existing publish/place pipeline) is
// existing, unmodified application code — the same classes
// tests/WorldPlacement.test.js and tests/PublicationLifecycle.test.js
// already exercise, composed here the identical way.

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

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function createTestDocument() {
    const world = new World();
    const building = new Building({ creator: 'tester' });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    return new Document({ world, metadata: new DocumentMetadata({ title: 'Gap Audit Test', author: 'tester' }) });
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

// Strips full-line `//` comments so a call-site sweep counts genuine
// references, never a comment that merely NAMES a class in prose (the
// same restraint 0.9.156/0.9.191/0.9.194/0.9.195 already applied to their
// own structural sweeps).
function codeOnlyLines(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//'));
}

function countReferences(source, identifier) {
    const pattern = new RegExp(`\\b${identifier}\\b`, 'g');
    const matches = codeOnlyLines(source).join('\n').match(pattern);
    return matches ? matches.length : 0;
}

async function runTests() {
    // ---------------------------------------------------------------
    // Section A — World interaction/navigation surface (structural only).
    //
    // This section deliberately does NOT re-litigate whether every one of
    // these panels works — 0.9.0 through 0.9.195 already exercise most of
    // them individually elsewhere. It answers only the narrow question
    // this audit needs: does `ui/views/WorldView.js` already compose a
    // broad interaction surface, or is Wanderer interaction thin?
    // ---------------------------------------------------------------
    {
        const worldView = await rawSource('ui/views/WorldView.js');
        const componentTags = new Set((worldView.match(/<[A-Z][A-Za-z]+/g) || []).map((tag) => tag.slice(1)));
        const expectedFamilies = [
            'AvatarInfoPanel', 'NearbyAvatarsPanel', 'CompassIndicator',
            'WorldMembersPanel', 'WorldPresenceIndicator', 'WorldCollaboratorIndicator',
            'LocationsPanel', 'GeographicPlaceDirectoryPanel', 'GeographicPlacePanel',
            'PlaceNamingPanel', 'WorldSearchPanel', 'WorldMapPanel',
            'PlacementInfoPanel', 'PlacementEditorDialog', 'VehicleInteractionPrompt',
            'OwnPublicationPanel', 'WorldEncounterCanvas'
        ];
        for (const name of expectedFamilies) {
            assert(componentTags.has(name), `A1. WorldView.js composes ${name} — Wanderer interaction is not limited to rendering discovered material alone`);
        }
        assert(componentTags.size >= 20, `A2. WorldView.js composes at least 20 distinct component families (found ${componentTags.size}) — a wide, already-built interaction surface, not a thin rendering shell`);
        console.log(`✓ Section A: World interaction/navigation — COMPLETE at the composition level; ${componentTags.size} distinct component families already answer avatar identity, presence, collaboration, geography, search, placement, vehicles, and publication authoring. No further re-audit performed here — each already has its own dedicated test family.`);
    }

    // ---------------------------------------------------------------
    // Section B — Vehicle system (intentional boundary, not a gap).
    //
    // 0.9.70's own header already named the boundary this section merely
    // reconfirms still holds: no capacity/speed/passenger vocabulary was
    // introduced without an actual consumer needing it.
    // ---------------------------------------------------------------
    {
        assert(typeof VehicleType.NONE === 'string' && typeof VehicleType.BICYCLE === 'string'
            && typeof VehicleType.MOTORCYCLE === 'string' && typeof VehicleType.CAR === 'string'
            && typeof VehicleType.DRONE === 'string', 'B1. VehicleType still carries exactly its five original values');
        const vehicleTypeSource = await rawSource('core/VehicleType.js');
        const vehicleTypeCode = codeOnlyLines(vehicleTypeSource).join('\n');
        assert(!/passenger|capacity|multi-?rider|\bfuel\b|\brange\b/i.test(vehicleTypeCode), 'B2. VehicleType.js\'s own CODE (not its header prose, which discusses the boundary by name) still declares no capacity/passenger/fuel vocabulary — the exact restraint its own 0.9.70 header documents');
        const repoWideVehicleFiles = [
            'application/AvatarVehicleInteractionController.js',
            'application/AvatarVehicleMovementController.js',
            'core/VehicleInstance.js',
            'core/VehiclePresence.js'
        ];
        for (const file of repoWideVehicleFiles) {
            const source = await rawSource(file);
            assert(!/passenger|multi-?rider/i.test(source), `B3. ${file} carries no passenger/multi-rider vocabulary either — the boundary is repo-wide, not just in the vocabulary file`);
        }
        console.log('✓ Section B: Vehicle system — mount/dismount/steering/collision are already deeply built and tested (40+ dedicated test files). Multi-passenger capacity, fuel/range, and vehicle ownership/rental are INTENTIONAL BOUNDARIES — undocumented requirements, not missing implementations — exactly per this subsystem\'s own founding restraint. No gap found here.');
    }

    // ---------------------------------------------------------------
    // Section C — World material lifecycle: the actual gap.
    //
    // Acquisition (publish, place) and observation (encounter, select,
    // load, render) are both complete and well-trodden. This section asks
    // the one question the rest of this arc never asked: can a Wanderer or
    // Publisher take a material BACK OUT of the World, once it is out
    // there? It answers with real, running code, not supposition.
    //
    // UPDATED by 0.9.197 (World Placement Removal UI Action): the
    // World-placement half of this gap is now CLOSED — see C3/C4 below,
    // and tests/WorldPlacementRemovalUIAction.test.js for the dedicated
    // E2E audit. The Publication-unpublish half (C5/Section D) is
    // deliberately still open, left for 0.9.198.
    // ---------------------------------------------------------------
    {
        // C1 — RemoveWorldPlacementUseCase is composed into every one of
        // the four spatial-index composition roots that build it...
        const compositionRoots = [
            'application/CreateSpatialIndexUseCase.js',
            'application/CreateSpatialDiscoveryUseCase.js',
            'application/CreatePlacementRegistryUseCase.js',
            'application/CreateDecentralizedSpatialDiscoveryUseCase.js'
        ];
        for (const file of compositionRoots) {
            const source = await rawSource(file);
            assert(countReferences(source, 'RemoveWorldPlacementUseCase') >= 1, `C1. ${file} constructs a RemoveWorldPlacementUseCase — the capability is already wired into this composition root`);
        }

        // ...at the time of THIS audit, a sweep of every UI file that
        // actually presents a placement or a publication to a person
        // found no further reference to it at all — not the class
        // name, not the conventional `removeWorldPlacementUseCase`
        // instance name — meaning literally nothing reached it.
        //
        // 0.9.197 (World Placement Removal UI Action) closed that half
        // of the gap WITHOUT any UI file ever naming the raw use case
        // or its conventional instance name directly — the same
        // boundary movePlacement()/MoveWorldPlacementUseCase already
        // established: a UI component talks to
        // WorldNavigationSession.removePlacement(), never to
        // RemoveWorldPlacementUseCase itself. So this sweep still finds
        // zero direct references in PlacementInfoPanel.js/WorldView.js
        // post-0.9.197 too — not because the capability is still
        // unreachable (it now is, via "Remove from World"), but because
        // the use case's own authority was never meant to be reachable
        // from more than one composition root away. See
        // WorldNavigationSession.removePlacement()'s own header.
        const placementUiFiles = [
            'ui/components/PlacementInfoPanel.js',
            'ui/components/PlacementEditorDialog.js',
            'ui/views/WorldView.js',
            'ui/views/EditorView.js',
            'ui/components/OwnPublicationPanel.js',
            'ui/components/WorldEncounterCanvas.js'
        ];
        for (const file of placementUiFiles) {
            const source = await rawSource(file);
            assert(countReferences(source, 'RemoveWorldPlacementUseCase') === 0 && countReferences(source, 'removeWorldPlacementUseCase') === 0,
                `C2. ${file} never references the raw RemoveWorldPlacementUseCase (by class or conventional instance name) directly — even after 0.9.197, WorldNavigationSession remains the sole authority a UI file talks to`);
        }

        // C3 — UPDATED by 0.9.197 (World Placement Removal UI Action),
        // which closed exactly this half of the gap. At the time of THIS
        // audit (0.9.196), the read model a Wanderer saw named Move but
        // never Remove; getPlacementInfo()'s own returned shape (the
        // single place in application/WorldNavigationSession.js that
        // shape is assembled) carried `movable`, gated on ownership, with
        // no `removable` counterpart. 0.9.197 added exactly that
        // counterpart — gated on the SAME ownership signal, no new
        // lifecycle state invented — which is what this assertion now
        // confirms instead of its absence.
        const navigationSessionSource = await rawSource('application/WorldNavigationSession.js');
        assert(/movable:\s*ownedByCurrentUser/.test(navigationSessionSource), 'C3a. getPlacementInfo() still returns a `movable` field gated on ownership');
        assert(/removable:\s*ownedByCurrentUser/.test(navigationSessionSource), 'C3b. getPlacementInfo() now returns a `removable` field, gated on the exact same ownership signal as `movable` — 0.9.197 closed the World-placement half of this audit\'s Section C gap');

        // C4 — UPDATED by 0.9.197. At the time of THIS audit, the one
        // panel that presents this read model to a person
        // (PlacementInfoPanel.js) emitted exactly focus/move/view-here —
        // never remove. 0.9.197 added a "Remove from World" action that
        // emits 'remove', gated on `info.removable` the same way "Move"
        // is gated on `info.movable`.
        const placementInfoPanelSource = await rawSource('ui/components/PlacementInfoPanel.js');
        const emitsMatch = placementInfoPanelSource.match(/emits:\s*\[([^\]]*)\]/);
        assert(emitsMatch, 'C4a. PlacementInfoPanel.js declares its emits array');
        assert(/\bremove\b/i.test(emitsMatch[1]), `C4b. PlacementInfoPanel.js now emits 'remove' (found [${emitsMatch[1].trim()}]) — a reachable remove-shaped event a host view can listen for, per 0.9.197`);
        assert(!/unpublish|delete/i.test(emitsMatch[1]), 'C4c. ...but still no unpublish/delete-shaped event — 0.9.197 deliberately excluded Publication retraction and material deletion; see Section C5/D below');

        // C5 — UnpublishDocumentUseCase is the mirror capability at the
        // Publication layer, composed nowhere either. A sweep of every UI
        // file that presents a Publication finds zero call sites.
        const publicationUiFiles = [
            'ui/components/OwnPublicationPanel.js',
            'ui/views/WorldView.js',
            'ui/views/RepositoryView.js',
            'ui/views/AuthorView.js'
        ];
        for (const file of publicationUiFiles) {
            const source = await rawSource(file);
            assert(countReferences(source, 'UnpublishDocumentUseCase') === 0, `C5. ${file} never references UnpublishDocumentUseCase — no reachable "retract this publication" action exists anywhere a Publisher can click`);
        }

        // C6 — both use cases are proven CORRECT here, directly, against
        // the exact same real (not mocked) collaborators and setup
        // tests/WorldPlacement.test.js and tests/PublicationLifecycle.test.js
        // already use — closing the loop that this is a genuinely
        // reachable, WORKING capability sitting unwired, never a broken
        // or half-finished one.
        {
            const storage = new InMemoryStorageProvider();
            const publisher = new LocalPublisherProvider(storage);
            const discovery = new LocalDiscoveryProvider(storage);
            const spatialIndex = new LocalSpatialIndexProvider(storage);
            const loadDoc = new LoadPublicationDocumentUseCase(storage);
            const registry = new CreateBrickRegistryUseCase().execute();

            const placeUseCase = new PlacePublicationUseCase(spatialIndex, discovery, loadDoc, registry);
            const removeUseCase = new RemoveWorldPlacementUseCase(spatialIndex);
            const discoverUseCase = new DiscoverWorldsUseCase(spatialIndex);

            const doc = createTestDocument();
            const manager = new DocumentManager();
            manager.load(doc, 'test-doc');
            const publication = new PublishDocumentUseCase(publisher, stubIdentityProvider).execute(manager);
            const placement = placeUseCase.execute(publication.id, new Position(50, 0, 50));

            assert(discoverUseCase.execute(new Position(50, 0, 50), 100).length === 1, 'sanity: the placement is genuinely present before removal');
            removeUseCase.execute(placement.id);
            assert(discoverUseCase.execute(new Position(50, 0, 50), 100).length === 0, 'C6a. RemoveWorldPlacementUseCase genuinely removes the placement from the spatial index — as of 0.9.197 it is also reachable from World View\'s own "Remove from World" action (see tests/WorldPlacementRemovalUIAction.test.js), not merely correct-but-unwired');
            assert(discovery.findById(publication.id) !== null, 'C6b. ...and, exactly as its own header documents, the Publication itself survives the removal untouched');
        }
        {
            const storage = new InMemoryStorageProvider();
            const publisher = new LocalPublisherProvider(storage);
            const unpublishUseCase = new UnpublishDocumentUseCase(publisher);
            const doc = createTestDocument();
            const manager = new DocumentManager();
            manager.load(doc, 'test-doc');
            const publication = new PublishDocumentUseCase(publisher, stubIdentityProvider).execute(manager);

            const records = storage.load('forkbuild-publications') || [];
            assert(records.some((r) => r.id === publication.id), 'sanity: the publication genuinely exists before unpublish');
            const removed = unpublishUseCase.execute(publication.id);
            assert(removed === true, 'C6c. UnpublishDocumentUseCase genuinely reports success');
            const recordsAfter = storage.load('forkbuild-publications') || [];
            assert(!recordsAfter.some((r) => r.id === publication.id), 'C6d. ...and the publication is genuinely gone from the catalog — this capability also works correctly, it is simply never invoked in production');
        }

        console.log('✓ Section C: World material lifecycle — PARTIALLY CLOSED as of 0.9.197. RemoveWorldPlacementUseCase and UnpublishDocumentUseCase both exist and are both correct (proven directly above against the same real collaborators tests/WorldPlacement.test.js and tests/PublicationLifecycle.test.js already exercise). 0.9.197 (World Placement Removal UI Action) gave RemoveWorldPlacementUseCase a reachable call site — WorldNavigationSession.removePlacement(), wired to a "Remove from World" action on PlacementInfoPanel (see tests/WorldPlacementRemovalUIAction.test.js). UnpublishDocumentUseCase remains unwired: a Publisher who wants to retract a Publication still has no path to do so today — left for 0.9.198 by this milestone\'s own design.');
    }

    // ---------------------------------------------------------------
    // Section D — Publication authoring/publishing workflow.
    //
    // Confirms Section C's finding from the authoring side: the FORWARD
    // path (publish → anchor → distribute → Snapshot discover/resolve/
    // materialize/attribute) is rich; the REVERSE path (retract) is
    // absent from the same panel.
    // ---------------------------------------------------------------
    {
        const panelSource = await rawSource('ui/components/OwnPublicationPanel.js');
        const clickHandlers = new Set((panelSource.match(/@click="[a-zA-Z]+/g) || []).map((s) => s.replace('@click="', '')));
        assert(clickHandlers.size >= 8, `D1. OwnPublicationPanel.js already wires at least 8 distinct actions (found ${clickHandlers.size}) — publish/anchor/distribute/Snapshot discovery/resolution/materialization/attribution are all reachable`);
        assert([...clickHandlers].every((h) => !/^unpublish|^retract/i.test(h)), 'D2. OwnPublicationPanel.js\'s own action surface contains no unpublish/retract-shaped handler — confirming Section C\'s finding from the authoring side, not merely the World-placement side');
        console.log(`✓ Section D: Publication workflow — the FORWARD path (${clickHandlers.size} distinct wired actions: publish, anchor, distribute, Snapshot discover/resolve/materialize/attribute) is COMPLETE. The REVERSE path — retracting a Publication once it exists — is the same ACTUAL GAP Section C already found, confirmed here from the authoring surface rather than the World-placement surface.`);
    }

    // ---------------------------------------------------------------
    // Section E — Performance. Deliberately NOT assessed.
    //
    // Per this milestone's own brief: performance work is only worth
    // doing once a real bottleneck is identified, not speculatively.
    // Section C found a genuine functional gap; closing it is higher
    // value than profiling a system with no known slow path yet.
    // ---------------------------------------------------------------
    {
        console.log('✓ Section E: Performance — deliberately DEFERRED, not assessed. No known bottleneck exists to profile; per this milestone\'s own brief, performance work belongs after the functional gap Section C/D found is closed, not before it.');
    }

    console.log('\n✅ All Architecture Reassessment / Product Gap Audit tests passed.');
}

runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
