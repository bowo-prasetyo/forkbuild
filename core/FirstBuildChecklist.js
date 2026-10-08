// The guided first build (docs/user/02-TheEditor.md, "Your first build"): five
// steps a newcomer works through in the Editor, ticked off by doing them, not
// by reading about them. Pure decisions only; the Editor feeds in what
// happened (application/onboarding/FirstBuildChecklistTracker.js).

export const FirstBuildStep = Object.freeze({
    PLACE_BRICK: 'place-brick',
    STACK: 'stack',
    STRUCTURE: 'structure',
    SAVE: 'save',
    SHARE: 'share'
});

export const FIRST_BUILD_STEPS = Object.freeze([
    FirstBuildStep.PLACE_BRICK,
    FirstBuildStep.STACK,
    FirstBuildStep.STRUCTURE,
    FirstBuildStep.SAVE,
    FirstBuildStep.SHARE
]);

const STEPS = new Set(FIRST_BUILD_STEPS);
// How far above the ground a brick's bottom must be to sit on another: the
// ground is y = 0 and a brick's position is its center.
const ABOVE_GROUND = 0.01;

// Where this device is: the steps done (in checklist order), whether the
// person hid the guide, and whether its finish was shown. Read leniently, so
// a damaged value starts the guide over rather than breaking the Editor.
export function normalizeFirstBuildProgress(value) {
    const source = value && typeof value === 'object' ? value : {};
    const done = new Set(Array.isArray(source.completed) ? source.completed.filter((step) => STEPS.has(step)) : []);
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
// its finish has been seen.
export function shouldShowFirstBuildGuide(progress) {
    const current = normalizeFirstBuildProgress(progress);
    if (current.dismissed) return false;
    return !(isFirstBuildComplete(current) && current.celebrated);
}

// The steps an edit in the Editor completes. `command` is as
// application/commands/describeCommand.js describes it; `brickHeight(id)` is a
// brick definition's height. Placing a brick whose bottom is off the ground
// is stacking. A structure placed, or composed from the Build Library (a
// paste of its bricks), drops in a structure.
export function firstBuildStepsForEdit(command, brickHeight = () => 1) {
    const steps = new Set();
    collect(command, brickHeight, steps, 0);
    return FIRST_BUILD_STEPS.filter((step) => steps.has(step));
}

function collect(command, brickHeight, steps, depth) {
    if (!command || depth > 8) return;
    if (command.type === 'place-brick') {
        steps.add(FirstBuildStep.PLACE_BRICK);
        const y = command.position?.y;
        const height = Number(brickHeight(command.definitionId)) || 1;
        if (typeof y === 'number' && y - height / 2 > ABOVE_GROUND) steps.add(FirstBuildStep.STACK);
    } else if (command.type === 'place-structure' || command.type === 'paste-bricks') {
        steps.add(FirstBuildStep.STRUCTURE);
    }
    for (const child of command.children ?? []) collect(child, brickHeight, steps, depth + 1);
}
