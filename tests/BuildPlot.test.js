import { normalizeBuildPlot, plotPositionFromQuery, plotQuery } from '../core/BuildPlot.js';
import { BuildPlotStore } from '../application/plot/BuildPlotStore.js';
import { BuildPlotPlacementStrategy } from '../application/plot/BuildPlotPlacementStrategy.js';
import { PublishDocumentUseCase } from '../application/publication/PublishDocumentUseCase.js';
import { CreatePublisherUseCase } from '../application/publisher/CreatePublisherUseCase.js';
import { backupEntryGroupOf, BackupEntryGroup } from '../application/backup/BackupEntryGroups.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// Build here (core/BuildPlot.js): a spot in a World remembered for the build
// started there, so that publishing the build places it on that spot.

const position = { x: 12.345, y: 3, z: -7.5 };

// A plot is a build, a World and a finite position; anything else isn't one.
{
    const plot = normalizeBuildPlot({ buildDocumentId: 'build-1', worldDocumentId: 'world-1', worldTitle: '  Willow Village ', position, createdAt: '2026-10-10T00:00:00Z' });
    assert(plot.buildDocumentId === 'build-1' && plot.worldDocumentId === 'world-1' && plot.worldTitle === 'Willow Village', 'a plot keeps its build, World and title');
    assert(plot.position.x === 12.345 && plot.position.z === -7.5, 'and its position');
    assert(normalizeBuildPlot({ buildDocumentId: 'b', worldDocumentId: 'w', position: { x: NaN, y: 0, z: 0 } }) === null, 'a position must be finite');
    assert(normalizeBuildPlot({ buildDocumentId: 'b', worldDocumentId: 'w', position: { x: 1e9, y: 0, z: 0 } }) === null, 'and within range');
    assert(normalizeBuildPlot({ worldDocumentId: 'w', position }) === null, 'a plot belongs to a build');
    assert(normalizeBuildPlot('nonsense') === null, 'junk is no plot');
    console.log('✓ a plot is a build, a World and a position');
}

// Build here's link carries the World and a rounded position, and reads back.
{
    const query = plotQuery({ worldDocumentId: 'world-1', worldTitle: 'Willow Village', position });
    assert(query.plot === 'world-1' && query.x === '12.35' && query.y === '3' && query.z === '-7.5' && query.title === 'Willow Village', `the link (${JSON.stringify(query)})`);
    const read = plotPositionFromQuery(query);
    assert(read.x === 12.35 && read.y === 3 && read.z === -7.5, 'reads back');
    assert(plotPositionFromQuery({ plot: 'w', x: 'a', y: '0', z: '0' }) === null, 'a damaged link has no position');
    console.log('✓ the Build here link round-trips');
}

// The store keeps one plot per build, and forgets it on request.
{
    const storage = new InMemoryStorageProvider();
    const store = new BuildPlotStore({ storageProvider: storage });
    assert(store.save({ buildDocumentId: 'b1', worldDocumentId: 'w1', position }) !== null, 'saved');
    store.save({ buildDocumentId: 'b1', worldDocumentId: 'w2', position: { x: 0, y: 0, z: 0 } });
    assert(store.list().length === 1 && store.forBuild('b1').worldDocumentId === 'w2', 'a build has one plot, the latest');
    assert(store.save({ buildDocumentId: 'b2', worldDocumentId: 'w1', position: { x: 'x' } }) === null, 'a non-plot is refused');
    assert(store.remove('b1') && store.forBuild('b1') === null, 'forgotten');
    storage.save('build-plots', [{ junk: true }, { buildDocumentId: 'b3', worldDocumentId: 'w', position }]);
    assert(store.list().length === 1, 'damaged entries are skipped');
    assert(backupEntryGroupOf('build-plots') === BackupEntryGroup.AVATAR_AND_WORLDS, 'plots are backed up with Worlds visited');
    console.log('✓ one plot per build, kept on this device');
}

// The first placement made on publishing goes on the build's plot; a build
// without one is placed as before.
{
    const store = new BuildPlotStore({ storageProvider: new InMemoryStorageProvider() });
    store.save({ buildDocumentId: 'plotted', worldDocumentId: 'w1', position });
    const strategy = new BuildPlotPlacementStrategy({ buildPlotStore: store, fallback: { computePosition: () => ({ x: 100, y: 0, z: 100 }) } });
    assert(JSON.stringify(strategy.computePosition({ publicationId: 'p1', documentId: 'plotted' })) === JSON.stringify(position), 'on its plot');
    assert(strategy.computePosition({ publicationId: 'p2', documentId: 'other' }).x === 100, 'otherwise as before');
    assert(strategy.computePosition({ publicationId: 'p3' }).x === 100, 'with no document named, as before');
    const broken = new BuildPlotPlacementStrategy({ buildPlotStore: { forBuild: () => { throw new Error('storage'); } }, fallback: { computePosition: () => ({ x: 1, y: 2, z: 3 }) } });
    assert(broken.computePosition({ documentId: 'plotted' }).x === 1, 'a failing store never blocks a publish');

    const placed = [];
    const publish = new PublishDocumentUseCase(
        { publish: (document) => ({ id: 'pub-1', documentId: document.world.id }) },
        {},
        { execute: (publicationId, at) => placed.push({ publicationId, at }) },
        strategy
    );
    const documentManager = {
        document: { world: { id: 'plotted', getBuildings: () => [{}] }, metadata: { title: 'My Mill' } }
    };
    publish.execute(documentManager);
    assert(placed.length === 1 && placed[0].publicationId === 'pub-1' && placed[0].at.x === position.x, 'publishing places the build on its plot');
    console.log('✓ publishing stands a build on its plot');
}

// The Editor's publisher takes the store.
{
    const { publishDocumentUseCase } = new CreatePublisherUseCase().execute({}, { buildPlotStore: new BuildPlotStore({ storageProvider: new InMemoryStorageProvider() }) });
    assert(publishDocumentUseCase._initialPlacementStrategy instanceof BuildPlotPlacementStrategy, 'the Editor publishes onto plots');
    console.log('✓ the Editor publishes onto plots');
}
