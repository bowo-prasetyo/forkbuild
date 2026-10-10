// Which sound an Editor edit makes: one short cue per kind of change, so
// placing, removing, moving and recoloring are told apart by ear. Undo and
// redo have their own sounds whatever they reverse.

export const EDITOR_SOUND_CUE = Object.freeze({
    PLACE: 'place',
    REMOVE: 'remove',
    MOVE: 'move',
    ROTATE: 'rotate',
    PASTE: 'paste',
    COLOR: 'color',
    GROUP: 'group',
    MARK: 'mark',
    UNDO: 'undo',
    REDO: 'redo',
    SAVE: 'save'
});

export const EDITOR_ACTIVITY = Object.freeze({
    EXECUTED: 'executed',
    UNDONE: 'undone',
    REDONE: 'redone'
});

// Command type (application/commands/*.js) to cue. Unlisted types are silent.
const CUE_BY_COMMAND_TYPE = Object.freeze({
    'place-brick': EDITOR_SOUND_CUE.PLACE,
    'place-structure': EDITOR_SOUND_CUE.PLACE,
    'delete-brick': EDITOR_SOUND_CUE.REMOVE,
    'delete-group': EDITOR_SOUND_CUE.REMOVE,
    'remove-structure-placement': EDITOR_SOUND_CUE.REMOVE,
    'move-brick': EDITOR_SOUND_CUE.MOVE,
    'move-structure-placement': EDITOR_SOUND_CUE.MOVE,
    'transform-selection': EDITOR_SOUND_CUE.MOVE,
    'set-structure-placement-transform': EDITOR_SOUND_CUE.MOVE,
    'rotate-brick': EDITOR_SOUND_CUE.ROTATE,
    'tilt-brick': EDITOR_SOUND_CUE.ROTATE,
    'rotate-structure-placement': EDITOR_SOUND_CUE.ROTATE,
    'paste-bricks': EDITOR_SOUND_CUE.PASTE,
    'duplicate-group': EDITOR_SOUND_CUE.PASTE,
    'duplicate-structure-placement': EDITOR_SOUND_CUE.PASTE,
    'set-brick-color': EDITOR_SOUND_CUE.COLOR,
    'create-group': EDITOR_SOUND_CUE.GROUP,
    'add-to-group': EDITOR_SOUND_CUE.GROUP,
    'remove-from-group': EDITOR_SOUND_CUE.GROUP,
    'rename-group': EDITOR_SOUND_CUE.GROUP,
    'create-world-landmark': EDITOR_SOUND_CUE.MARK,
    'update-world-landmark': EDITOR_SOUND_CUE.MARK,
    'remove-world-landmark': EDITOR_SOUND_CUE.REMOVE,
    'create-world-region': EDITOR_SOUND_CUE.MARK,
    'update-world-region': EDITOR_SOUND_CUE.MARK,
    'remove-world-region': EDITOR_SOUND_CUE.REMOVE,
    'create-world-resident': EDITOR_SOUND_CUE.PLACE,
    'remove-world-resident': EDITOR_SOUND_CUE.REMOVE,
    'create-world-animal-decoration': EDITOR_SOUND_CUE.PLACE,
    'remove-world-animal-decoration': EDITOR_SOUND_CUE.REMOVE
});

// A composite command (one undo step of several changes) sounds like its
// first child that makes a sound: a paste of placed bricks is a placement.
function cueForCommand(command, depth = 0) {
    if (!command || depth > 8) {
        return null;
    }
    const direct = CUE_BY_COMMAND_TYPE[command.type];
    if (direct) {
        return direct;
    }
    for (const child of Array.isArray(command.children) ? command.children : []) {
        const found = cueForCommand(child, depth + 1);
        if (found) {
            return found;
        }
    }
    return null;
}

// `activity` is an EDITOR_ACTIVITY; `command` is { type, children? }, with
// children for a composite. Returns an EDITOR_SOUND_CUE or null.
export function editorSoundCueFor(activity, command) {
    if (activity === EDITOR_ACTIVITY.UNDONE) {
        return EDITOR_SOUND_CUE.UNDO;
    }
    if (activity === EDITOR_ACTIVITY.REDONE) {
        return EDITOR_SOUND_CUE.REDO;
    }
    if (activity === EDITOR_ACTIVITY.EXECUTED) {
        return cueForCommand(command);
    }
    return null;
}
