import { AMBIENT_LAYER, AMBIENT_LAYERS, ambientMixAt, silentAmbientMix } from '../core/AmbientSoundscape.js';
import { ecologyZoneAt, ECOLOGY_ZONE } from '../core/TerrainEcology.js';
import { isRiverAt } from '../core/Hydrology.js';
import { DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import { assert } from './support/Assert.js';

const SEED = DEFAULT_WORLD_SEED;

// A spot well inside `zone`: the same zone underfoot and 12 m and 30 m away
// in every direction, so the whole sampled area agrees.
function findDeep(zone) {
    for (let x = -2000; x <= 2000; x += 8) {
        for (let z = -2000; z <= 2000; z += 8) {
            if (ecologyZoneAt(SEED, x, z) !== zone) continue;
            let deep = true;
            for (let i = 0; i < 8 && deep; i++) {
                const a = (i / 8) * Math.PI * 2;
                for (const r of [12, 30]) {
                    if (ecologyZoneAt(SEED, x + Math.cos(a) * r, z + Math.sin(a) * r) !== zone) deep = false;
                }
            }
            if (deep) return { x, z };
        }
    }
    throw new Error(`no deep ${zone} found`);
}

function findRiver() {
    for (let x = -2000; x <= 2000; x += 4) {
        for (let z = -2000; z <= 2000; z += 4) {
            if (isRiverAt(SEED, x, z)) return { x, z };
        }
    }
    throw new Error('no river found');
}

function mixAt({ x, z }) {
    return ambientMixAt(SEED, x, z);
}

// Every layer is always present and between 0 and 1.
{
    const mix = ambientMixAt(SEED, 12.5, -40);
    assert(JSON.stringify(Object.keys(mix).sort()) === JSON.stringify([...AMBIENT_LAYERS].sort()), 'every layer has a level');
    for (let i = 0; i < 200; i++) {
        const sample = ambientMixAt(SEED, i * 37.3 - 3000, i * -21.9 + 1500);
        for (const layer of AMBIENT_LAYERS) {
            assert(sample[layer] >= 0 && sample[layer] <= 1, `${layer} stays within 0..1 (got ${sample[layer]})`);
        }
    }
    console.log('✓ every layer has a level between 0 and 1');
}

// The same place always sounds the same.
{
    assert(JSON.stringify(ambientMixAt(SEED, 101, -202)) === JSON.stringify(ambientMixAt(SEED, 101, -202)), 'a place always gives the same mix');
    console.log('✓ the mix is a pure function of place');
}

// Where the listener is unknown, nothing plays.
{
    const silent = silentAmbientMix();
    for (const layer of AMBIENT_LAYERS) assert(silent[layer] === 0, `${layer} is silent`);
    assert(JSON.stringify(ambientMixAt(SEED, NaN, 0)) === JSON.stringify(silent), 'a non-finite position is silent');
    assert(JSON.stringify(ambientMixAt(SEED, 0, Infinity)) === JSON.stringify(silent), 'an infinite position is silent');
    console.log('✓ an unknown position is silent');
}

// Each kind of land sounds like itself.
{
    const forest = mixAt(findDeep(ECOLOGY_ZONE.FOREST));
    assert(forest[AMBIENT_LAYER.BIRDS] > 0.9, `a forest is full of birds (${forest.birds})`);
    assert(forest[AMBIENT_LAYER.WIND] < forest[AMBIENT_LAYER.BIRDS], 'trees shelter a forest from the wind');

    const highland = mixAt(findDeep(ECOLOGY_ZONE.HIGHLAND));
    assert(highland[AMBIENT_LAYER.WIND] > forest[AMBIENT_LAYER.WIND], 'highland is windier than forest');
    assert(highland[AMBIENT_LAYER.WIND] > highland[AMBIENT_LAYER.BIRDS], 'highland is mostly wind');

    const field = mixAt(findDeep(ECOLOGY_ZONE.FIELD));
    assert(field[AMBIENT_LAYER.INSECTS] > field[AMBIENT_LAYER.BIRDS], 'a field hums with insects');
    assert(field[AMBIENT_LAYER.INSECTS] > forest[AMBIENT_LAYER.INSECTS], 'a field has more insects than a forest');

    const lake = mixAt(findDeep(ECOLOGY_ZONE.WATER));
    assert(lake[AMBIENT_LAYER.WATER] > 0.9, `a lake laps (${lake.water})`);
    assert(field[AMBIENT_LAYER.WATER] === 0, 'dry land far from water has no lapping');

    const river = mixAt(findRiver());
    assert(river[AMBIENT_LAYER.STREAM] > 0, 'a river is heard running');
    console.log('✓ forest, highland, field, lake and river each sound like themselves');
}

// Trees are heard by kind: leaves rustle in broadleaf woods, wind sighs in
// conifers, and open ground far from any tree has neither.
{
    const { naturalFeaturesInRegion, TREE_SPECIES } = await import('../core/NaturalFeatureField.js');
    const treesAround = (x, z) => naturalFeaturesInRegion(SEED, x - 20, z - 20, x + 20, z + 20)
        .filter((tree) => Math.hypot(tree.x - x, tree.z - z) < 20);
    const findWood = (species) => {
        for (let x = -3000; x < 3000; x += 16) {
            for (let z = -3000; z < 3000; z += 32) {
                const trees = treesAround(x, z);
                if (trees.length >= 15 && trees.every((tree) => tree.species === species)) return { x, z };
            }
        }
        throw new Error(`no ${species} wood found`);
    };
    const findTreeless = () => {
        for (let x = 0; x < 3000; x += 16) {
            if (treesAround(x, 40).length === 0) return { x, z: 40 };
        }
        throw new Error('no treeless ground found');
    };
    const broadleaf = mixAt(findWood(TREE_SPECIES.BROADLEAF));
    assert(broadleaf[AMBIENT_LAYER.LEAVES] > 0.5 && broadleaf[AMBIENT_LAYER.PINES] === 0,
        `a broadleaf wood rustles (${broadleaf.leaves}) without pines`);
    const conifer = mixAt(findWood(TREE_SPECIES.CONIFER));
    assert(conifer[AMBIENT_LAYER.PINES] > 0.5 && conifer[AMBIENT_LAYER.LEAVES] === 0,
        `a conifer wood sighs (${conifer.pines}) without rustling`);
    const open = mixAt(findTreeless());
    assert(open[AMBIENT_LAYER.LEAVES] === 0 && open[AMBIENT_LAYER.PINES] === 0, 'open ground far from trees has neither');

    // One tree: louder the closer you stand.
    let tree = null;
    for (let x = -3000; x < 3000 && !tree; x += 200) {
        for (let z = -3000; z < 3000 && !tree; z += 200) {
            tree = naturalFeaturesInRegion(SEED, x, z, x + 200, z + 200)
                .find((t) => t.species !== TREE_SPECIES.CONIFER && treesAround(t.x, t.z).length === 1) || null;
        }
    }
    assert(tree, 'setup: a lone tree exists');
    {
        const near = ambientMixAt(SEED, tree.x + 1, tree.z)[AMBIENT_LAYER.LEAVES];
        const far = ambientMixAt(SEED, tree.x + 15, tree.z)[AMBIENT_LAYER.LEAVES];
        assert(near > far && far > 0, `a lone tree rustles louder up close (${near} vs ${far})`);
    }
    console.log('✓ leaves and pines follow the trees around you');
}
