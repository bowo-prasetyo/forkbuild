// The guided first build (docs/user/02-TheEditor.md, "Your first build"): six
// steps a newcomer works through, ticked off by doing them, not by reading
// about them: five in the Editor, and the last, walking inside the published
// build, in World View (core/world/BuildEntrance.js). Pure decisions only; the Editor feeds in what
// happened (application/onboarding/FirstBuildChecklistTracker.js).

export const FirstBuildStep = Object.freeze({
    PLACE_BRICK: 'place-brick',
    STACK: 'stack',
    // Five bricks of the builder's own, placed one by one: a structure
    // dropped in no longer counts, since the building numbers leave
    // ready-made bricks out (docs/reviews/CreativeDirection-2026-10-22.md,
    // finding 1). It replaced "Drop in a structure" ('structure').
    OWN: 'own',
    SAVE: 'save',
    SHARE: 'share',
    WALK_INSIDE: 'walk-inside'
});

export const FIRST_BUILD_STEPS = Object.freeze([
    FirstBuildStep.PLACE_BRICK,
    FirstBuildStep.STACK,
    FirstBuildStep.OWN,
    FirstBuildStep.SAVE,
    FirstBuildStep.SHARE,
    FirstBuildStep.WALK_INSIDE
]);

const STEPS = new Set(FIRST_BUILD_STEPS);
// How many bricks placed one by one make "Add something of your own".
export const OWN_BRICKS_NEEDED = 5;
// Progress kept before "Drop in a structure" became "Add something of your
// own": a device that had dropped one in keeps the step done.
const RENAMED_STEPS = Object.freeze({ structure: FirstBuildStep.OWN });
// How far above the ground a brick's bottom must be to sit on another: the
// ground is y = 0 and a brick's position is its center.
const ABOVE_GROUND = 0.01;

// Where this device is: the steps done (in checklist order), whether the
// person hid the guide, and whether its finish was shown. Read leniently, so
// a damaged value starts the guide over rather than breaking the Editor.
export function normalizeFirstBuildProgress(value) {
    const source = value && typeof value === 'object' ? value : {};
    const done = new Set(Array.isArray(source.completed)
        ? source.completed.map((step) => RENAMED_STEPS[step] ?? step).filter((step) => STEPS.has(step))
        : []);
    return Object.freeze({
        completed: Object.freeze(FIRST_BUILD_STEPS.filter((step) => done.has(step))),
        dismissed: source.dismissed === true,
        celebrated: source.celebrated === true
    });
}

export function completeFirstBuildSteps(progress, steps) {
    const current = normalizeFirstBuildProgress(progress);
    return normalizeFirstBuildProgress({ ...current, completed: [...current.completed, ...steps] });
}

export function isFirstBuildComplete(progress) {
    return normalizeFirstBuildProgress(progress).completed.length === FIRST_BUILD_STEPS.length;
}

// The step to suggest now: the first not yet done, or null when all are.
export function nextFirstBuildStep(progress) {
    const done = new Set(normalizeFirstBuildProgress(progress).completed);
    return FIRST_BUILD_STEPS.find((step) => !done.has(step)) ?? null;
}

// Whether the guide shows: until it is hidden, and once finished only until
// its finish has been seen. A finish already seen keeps it away, even when
// the guide has since grown a step (walking inside came after five).
export function shouldShowFirstBuildGuide(progress) {
    const current = normalizeFirstBuildProgress(progress);
    if (current.dismissed) return false;
    return !current.celebrated;
}

// The steps an edit in the Editor completes on its own. `command` is as
// application/commands/describeCommand.js describes it; `brickHeight(id)` is a
// brick definition's height. Placing a brick whose bottom is off the ground
// is stacking. "Add something of your own" takes several edits: see
// bricksPlacedByEdit().
export function firstBuildStepsForEdit(command, brickHeight = () => 1) {
    const steps = new Set();
    collect(command, brickHeight, steps, 0);
    return FIRST_BUILD_STEPS.filter((step) => steps.has(step));
}

// How many bricks an edit places one by one (a structure dropped in, or a
// paste, places none of the builder's own).
export function bricksPlacedByEdit(command) {
    return countPlaced(command, 0);
}

function countPlaced(command, depth) {
    if (!command || depth > 8) return 0;
    let count = command.type === 'place-brick' ? 1 : 0;
    for (const child of command.children ?? []) count += countPlaced(child, depth + 1);
    return count;
}

function collect(command, brickHeight, steps, depth) {
    if (!command || depth > 8) return;
    if (command.type === 'place-brick') {
        steps.add(FirstBuildStep.PLACE_BRICK);
        const y = command.position?.y;
        const height = Number(brickHeight(command.definitionId)) || 1;
        if (typeof y === 'number' && y - height / 2 > ABOVE_GROUND) steps.add(FirstBuildStep.STACK);
    }
    for (const child of command.children ?? []) collect(child, brickHeight, steps, depth + 1);
}
