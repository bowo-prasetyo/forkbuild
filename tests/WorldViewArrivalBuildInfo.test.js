import { World } from '../core/document/World.js';
import { Building } from '../core/building/Building.js';
import { Brick } from '../core/building/Brick.js';
import { Document } from '../core/document/Document.js';
import { DocumentMetadata } from '../core/document/DocumentMetadata.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalWorldLayoutProvider } from '../world-layout/LocalWorldLayoutProvider.js';
import { WorldNavigationSession } from '../application/world/WorldNavigationSession.js';
import { worldViewFiles } from './support/SourceFileGroups.js';
import { readSource } from './support/SourceText.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// Arriving at a build (Explore's "Explore" opens /world/<id>) shows that
// build's properties straight away. Navigation still selects nothing (see
// docs/Principles.md, "Navigation Never Implies Editing"): the panel falls
// back to the active build only while no build is inspected.

function makeSession() {
    const discoveryProvider = new LocalDiscoveryProvider(new InMemoryStorageProvider());
    const worldLayoutProvider = new LocalWorldLayoutProvider(null, discoveryProvider);
    const session = new WorldNavigationSession({ registry: null, worldLayoutProvider, discoveryProvider });
    const world = new World();
    const building = new Building({ creator: 'alice' });
    building.addBrick(new Brick({ definitionId: 'cube', position: { x: 0, y: 0, z: 0 } }));
    world.addBuilding(building);
    const document = new Document({ world, metadata: new DocumentMetadata({ title: 'Garden Pavilion', author: 'alice' }) });
    session._loadedDocuments.set(document.world.id, document);
    return { session, documentId: document.world.id };
}

// The session on arrival: the build is active, nothing is inspected, and
// its properties can be read for the active build.
{
    const { session, documentId } = makeSession();
    session.setActiveDocument(documentId);
    const inspection = session.getSpatialInspection();
    assert(!inspection || inspection.isEmpty, 'arriving selects nothing');
    assert(session.getActiveDocumentId() === documentId, 'the arrived-at build is active');
    const info = session.getDocumentInfo(session.getActiveDocumentId());
    assert(info && info.documentId === documentId && info.title === 'Garden Pavilion', 'its properties are readable');
    console.log('✓ on arrival the build is active, nothing is inspected, and its properties are readable');
}

// World View shows the inspected build's properties, else the active build's.
{
    const source = (await Promise.all(worldViewFiles().map((file) => readSource(file)))).join('\n');
    const assignment = source.match(/const shownDocumentId = ([^;]+);\s*documentInfo\.value = ([^;]+);/);
    assert(assignment, 'refreshSpatialUI() picks the build whose properties it shows');
    assert(/inspectedDocumentId\s*\|\|\s*session\.getActiveDocumentId\(\)/.test(assignment[1]), `the inspected build first, else the active one (got ${assignment[1]})`);
    assert(/session\.getDocumentInfo\(shownDocumentId\)/.test(assignment[2]), 'and reads that build\'s properties');
    console.log('✓ World View falls back to the active build\'s properties when no build is inspected');
}
