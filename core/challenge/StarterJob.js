import { Structure } from '../building/Structure.js';

// What Home's main button hands a newcomer (docs/reviews/
// CreativeDirection-2026-10-12b.md, finding 2): not a finished build to
// publish untouched, but one with a job left to do. The House arrives with
// its walls up and its room furnished, and no roof, so the first thing
// placed is the thing that finishes it, and the build is theirs.
//
// Pure: which job a `job` query names, the unfinished structure it opens,
// and whether the open build has done it.

export const StarterJobId = Object.freeze({
    ROOF: 'roof'
});

export const STARTER_JOBS = Object.freeze({
    [StarterJobId.ROOF]: Object.freeze({
        id: StarterJobId.ROOF,
        structureId: 'village:house',
        // Left off the House: its roof, and the chimney that stands in it.
        leftOff: Object.freeze(['core:roof_hip_6x6', 'core:chimney']),
        // The brick the job's button picks.
        brickId: 'core:roof_hip_6x6',
        // Any roof brick finishes it.
        doneCategory: 'roof',
        // While the job's brick is chosen, it goes to its place whenever the
        // pointer is this close to it: anywhere on the house.
        guideRadius: 5
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

// Where the job's brick goes, as the guide the Editor gives Place
// (EditorContext.placementGuide): where the finished structure has it.
// Null when the structure has none.
export function starterJobGuide(job, structure) {
    if (!job || !structure || structure.id !== job.structureId) return null;
    const brick = structure.bricks.find((candidate) => candidate.definitionId === job.brickId);
    if (!brick) return null;
    return Object.freeze({
        definitionId: job.brickId,
        position: Object.freeze({ x: brick.position.x, y: brick.position.y, z: brick.position.z }),
        radius: job.guideRadius
    });
}

// Whether `bricks` (the open build's) have done the job: one of them is a
// brick of the job's category. `definitionOf(id)` reads a brick definition.
export function isStarterJobDone(job, bricks, definitionOf) {
    if (!job) return false;
    for (const brick of bricks || []) {
        if (definitionOf(brick.definitionId)?.category === job.doneCategory) return true;
    }
    return false;
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
