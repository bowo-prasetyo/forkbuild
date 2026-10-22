import { Structure } from '../building/Structure.js';

// What Home's main button hands a newcomer (docs/reviews/
// CreativeDirection-2026-10-12b.md, finding 2): not a finished build to
// publish untouched, but one with a job left to do. The House arrives with
// its walls up and its room furnished, and no roof, so the first thing
// placed is the thing that finishes it, and the build is theirs.
//
// The job is a short chain of steps (docs/reviews/
// CreativeDirection-2026-10-22.md, finding 1; docs/NowNextLater.md): the
// roof, a chimney for the hearth, a path of stones from the doorstep, and a
// garden round the house, so a first build ends near ten bricks of the
// builder's own rather than one. Each step has a button that picks its brick;
// the roof, the chimney and the path's next stone go to their places whenever
// the pointer is anywhere on the house (EditorContext.placementGuide), and
// the garden goes wherever the builder puts it.
//
// Pure: which job a `job` query names, the unfinished structure it opens,
// how far through its steps the open build is, and where the next brick goes.

export const StarterJobId = Object.freeze({
    ROOF: 'roof'
});

export const StarterStepId = Object.freeze({
    ROOF: 'roof',
    CHIMNEY: 'chimney',
    PATH: 'path',
    GARDEN: 'garden'
});

// Where the House's door is: its doorstep stands at z = -3.5, x = -0.5
// (core/library/VillageLibrary.js), and the path leads straight out from it.
const PATH_STONES = Object.freeze([-4.5, -5.5, -6.5, -7.5].map((z) => Object.freeze({ x: -0.5, y: 0.125, z })));
// The doorstep's grey, so the path looks like it.
const STONE = 0x9a9a9a;

export const STARTER_JOBS = Object.freeze({
    [StarterJobId.ROOF]: Object.freeze({
        id: StarterJobId.ROOF,
        structureId: 'village:house',
        // Left off the House: its roof, and the chimney that stands in it.
        leftOff: Object.freeze(['core:roof_hip_6x6', 'core:chimney']),
        // While a step's brick is chosen, it goes to its place whenever the
        // pointer is within `guideRadius` of the House's middle
        // (`guideAround`): anywhere on the house, its roof, its chimney or
        // the ground by its door, however far out the path's last stone is.
        guideAround: Object.freeze({ x: 0, z: 0 }),
        guideRadius: 8,
        // Each step: the brick its button picks (and a colour for it), the
        // bricks that count towards it (a category, or ids), how many, and
        // where they go: 'structure' where the finished House has the brick,
        // a list of places taken in turn, or anywhere (null).
        steps: Object.freeze([
            Object.freeze({ id: StarterStepId.ROOF, brickId: 'core:roof_hip_6x6', counts: Object.freeze({ category: 'roof' }), needed: 1, guide: 'structure' }),
            Object.freeze({ id: StarterStepId.CHIMNEY, brickId: 'core:chimney', counts: Object.freeze({ ids: Object.freeze(['core:chimney']) }), needed: 1, guide: 'structure' }),
            Object.freeze({ id: StarterStepId.PATH, brickId: 'core:plate_1x1', color: STONE, counts: Object.freeze({ ids: Object.freeze(['core:plate_1x1']) }), needed: PATH_STONES.length, guide: PATH_STONES }),
            Object.freeze({
                id: StarterStepId.GARDEN,
                brickId: 'core:bush',
                counts: Object.freeze({ ids: Object.freeze(['core:bush', 'core:fence', 'core:lawn_2x2', 'core:rock', 'core:pine_tree', 'core:lantern']) }),
                needed: 4,
                guide: null
            })
        ])
    })
});

// The job a `job` query names, or null.
export function starterJobById(id) {
    return typeof id === 'string' && Object.hasOwn(STARTER_JOBS, id) ? STARTER_JOBS[id] : null;
}

// The structure the job opens: `structure` (the job's own) without the
// bricks the job leaves for the player. Same id and name, so the copy still
// says where it came from. Null when `structure` isn't the job's.
export function unfinishedStructure(job, structure) {
    if (!job || !structure || structure.id !== job.structureId) return null;
    const leftOff = new Set(job.leftOff);
    return new Structure({
        id: structure.id,
        name: structure.name,
        category: structure.category,
        tags: structure.tags,
        description: structure.description,
        bricks: structure.bricks.filter((brick) => !leftOff.has(brick.definitionId))
    });
}

function countsToward(step, brick, definitionOf) {
    if (step.counts.ids) return step.counts.ids.includes(brick.definitionId);
    return definitionOf(brick.definitionId)?.category === step.counts.category;
}

function countFor(step, bricks, definitionOf) {
    let count = 0;
    for (const brick of bricks || []) {
        if (countsToward(step, brick, definitionOf)) count += 1;
    }
    return count;
}

// How far through the job the open build is: for each step, how many of its
// bricks the builder has added (those in `bricks`, the open build's, beyond
// those in `startBricks`, what the job opened with), and whether that is
// enough; `current`, the first step not done (null when all are, and then
// `done`). Steps are counted each on its own, so a garden planted before the
// chimney still counts, and an undo takes a step back. `definitionOf(id)`
// reads a brick definition.
export function starterJobProgress(job, bricks, definitionOf, startBricks = []) {
    if (!job) return null;
    const steps = job.steps.map((step) => {
        const placed = Math.min(step.needed, Math.max(0, countFor(step, bricks, definitionOf) - countFor(step, startBricks, definitionOf)));
        return Object.freeze({ id: step.id, placed, needed: step.needed, done: placed >= step.needed });
    });
    const currentIndex = steps.findIndex((step) => !step.done);
    return Object.freeze({
        steps: Object.freeze(steps),
        current: currentIndex === -1 ? null : job.steps[currentIndex],
        currentIndex,
        done: currentIndex === -1
    });
}

// Whether the open build has done the whole job.
export function isStarterJobDone(job, bricks, definitionOf, startBricks = []) {
    return Boolean(starterJobProgress(job, bricks, definitionOf, startBricks)?.done);
}

// Where a step's next brick goes, as the guide the Editor gives Place
// (EditorContext.placementGuide), or null when it goes wherever it is put:
// where the finished `structure` has it, or the first of the step's places
// with none of its bricks on it yet among `bricks`.
export function starterStepGuide(job, step, structure, bricks = []) {
    if (!job || !step || !step.guide) return null;
    let position = null;
    if (step.guide === 'structure') {
        if (!structure || structure.id !== job.structureId) return null;
        position = structure.bricks.find((brick) => brick.definitionId === step.brickId)?.position ?? null;
    } else {
        const taken = (place) => (bricks || []).some((brick) => brick.definitionId === step.brickId
            && Math.abs(brick.position.x - place.x) < 0.01 && Math.abs(brick.position.y - place.y) < 0.01 && Math.abs(brick.position.z - place.z) < 0.01);
        position = step.guide.find((place) => !taken(place)) ?? null;
    }
    if (!position) return null;
    return Object.freeze({
        definitionId: step.brickId,
        position: Object.freeze({ x: position.x, y: position.y, z: position.z }),
        around: job.guideAround,
        radius: job.guideRadius
    });
}

// What the starter card (ui/components/StarterJobCard.js) asks of a build
// opened from something ready-made: the job left to do; with no job, a first
// brick of the builder's own; then, once the build is theirs, to publish it.
// The launch week's counts showed most visitors stopping at an untouched
// build, and none publishing (docs/Roadmap.md, "Make it yours, then publish").
export const StarterCardStage = Object.freeze({
    JOB: 'job',
    FIRST_EDIT: 'first-edit',
    PUBLISH: 'publish'
});

// The brick the first-edit card picks: a tree stands beside any of the
// ready-made builds, wherever it is put.
export const FIRST_EDIT_BRICK_ID = 'core:pine_tree';

// The card's stage, or null once the build is published or the card hidden.
// `placedCount` is how many bricks the builder placed or changed
// (core/building/PlacedBricks.js).
export function starterCardStage({ job = null, jobDone = false, placedCount = 0, published = false, hidden = false } = {}) {
    if (published || hidden) return null;
    if (job) return jobDone ? StarterCardStage.PUBLISH : StarterCardStage.JOB;
    return placedCount > 0 ? StarterCardStage.PUBLISH : StarterCardStage.FIRST_EDIT;
}
