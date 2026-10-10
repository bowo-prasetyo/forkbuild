import { BUILDER_STAMPS, builderStamps, snapshotBrickCount } from '../core/BuilderStamps.js';
import { gatherBuilderStampFacts } from '../application/stamps/BuilderStampFacts.js';
import { BuildPlotStore } from '../application/plot/BuildPlotStore.js';
import { challengeAt } from '../core/BuildChallenge.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// Builder stamps (core/BuilderStamps.js): facts about this device's own
// builds that crossed a threshold. Never points, levels or a score.

// Thresholds: the highest one reached, with the fact's own count; nothing
// below the first.
{
    const stamps = builderStamps({ publishedBuilds: 12, remixesByOthers: 1, remixesMade: 0, challengesEntered: 2, largestBuildBricks: 99, buildsOnPlots: 1 });
    assert(stamps.map((s) => s.id).join() === 'published,remixed,challenger,onPlot', `earned (${stamps.map((s) => s.id)})`);
    const published = stamps.find((s) => s.id === 'published');
    assert(published.threshold === 10 && published.count === 12, 'the highest threshold reached, and the count');
    assert(stamps.find((s) => s.id === 'challenger').threshold === 1, 'two challenges is past the first threshold only');
    assert(!stamps.some((s) => s.id === 'bigBuild'), '99 bricks is short of the first');
    assert(builderStamps({}).length === 0 && builderStamps(null).length === 0, 'no facts, no stamps');
    assert(builderStamps({ publishedBuilds: 1.5, remixesByOthers: -1 }).length === 0, 'only whole positive counts');
    assert(stamps.every((s) => Object.keys(s).sort().join() === 'count,id,threshold'), 'a stamp is a fact, with no points or level');
    for (const stamp of BUILDER_STAMPS) {
        assert(stamp.thresholds.every((value, index) => index === 0 || value > stamp.thresholds[index - 1]), `${stamp.id}'s thresholds rise`);
    }
    console.log('✓ stamps are thresholds over facts');
}

// Bricks are counted from a snapshot's brick table, or an older bricks list.
{
    assert(snapshotBrickCount({ world: { buildings: [{ brickTable: { values: new Array(18).fill(0) } }, { bricks: [{}, {}] }] } }) === 5, 'three from a table, two from a list');
    assert(snapshotBrickCount(null) === 0 && snapshotBrickCount({ world: {} }) === 0, 'nothing readable, nothing counted');
    console.log('✓ bricks are counted from snapshots');
}

// The facts come from this device's own records, counting builds, not
// Publications.
{
    const storage = new InMemoryStorageProvider();
    const tag = challengeAt(Date.parse('2026-10-14T12:00:00Z')).tag;
    const own = [
        { id: 'p1', documentId: 'mill', parentDocumentId: null },
        { id: 'p1b', documentId: 'mill', parentDocumentId: null },
        { id: 'p2', documentId: 'my-copy', parentDocumentId: 'their-castle' },
        { id: 'p3', documentId: 'mill-2', parentDocumentId: 'mill' }
    ];
    storage.save('snapshot:p1', { metadata: { tags: [tag] }, world: { buildings: [{ brickTable: { values: new Array(6 * 120).fill(0) } }] } });
    storage.save('snapshot:p2', { metadata: { tags: ['castle'] }, world: { buildings: [{ bricks: [{}, {}] }] } });
    const known = [
        ...own,
        { documentId: 'their-remix', parentDocumentId: 'mill' },
        { documentId: 'their-remix', parentDocumentId: 'mill' },
        { documentId: 'another', parentDocumentId: 'my-copy' }
    ];
    const discoveryProvider = { findByParentId: (id) => known.filter((p) => p.parentDocumentId === id) };
    const plots = new BuildPlotStore({ storageProvider: new InMemoryStorageProvider() });
    plots.save({ buildDocumentId: 'mill', worldDocumentId: 'w', position: { x: 0, y: 0, z: 0 } });
    plots.save({ buildDocumentId: 'unpublished', worldDocumentId: 'w', position: { x: 0, y: 0, z: 0 } });

    const facts = await gatherBuilderStampFacts({ ownPublications: own, discoveryProvider, storageProvider: storage, buildPlotStore: plots });
    assert(facts.publishedBuilds === 3, `three builds published (got ${facts.publishedBuilds})`);
    assert(facts.remixesByOthers === 2, `two remixes by others, my own remix not among them (got ${facts.remixesByOthers})`);
    assert(facts.remixesMade === 1, 'one build remixed from someone else');
    assert(facts.challengesEntered === 1, 'one challenge entered');
    assert(facts.largestBuildBricks === 120, 'the largest build has 120 bricks');
    assert(facts.buildsOnPlots === 1, 'one published build stands on its plot');

    const failing = await gatherBuilderStampFacts({
        ownPublications: own,
        discoveryProvider: { findByParentId: () => { throw new Error('offline'); } },
        storageProvider: { load: () => { throw new Error('disk'); } },
        buildPlotStore: { list: () => { throw new Error('disk'); } }
    });
    assert(failing.publishedBuilds === 3 && failing.remixesByOthers === 0 && failing.largestBuildBricks === 0, 'unreadable records are skipped');
    console.log('✓ facts are gathered from this device, a build counted once');
}
