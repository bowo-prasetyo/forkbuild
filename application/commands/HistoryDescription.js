// How a command names itself in undo/redo and the history timeline: a
// message (core/Message.js) the UI shows in the chosen language, never an
// English sentence.
//
// A few commands carry a description chosen by whoever made them ("Align 3
// Bricks", "Repeat 2 Copies"), and it travels with the command: to peers and
// into recovery. Older versions wrote it as English text in `description`,
// so both forms are read:
//   - `descriptionMessage: { key, params }` is written by this version, and
//     `description` is left out. A peer on an older version then shows the
//     command's own generic label rather than a message key.
//   - `description: "Move 3 Bricks"` from an older version is kept and shown
//     as written: nobody can translate text that is already English.
import { isMessage, message } from '../../core/Message.js';

// The fields a command's toJSON() adds for `description` (a message, a
// legacy English string, or null).
export function descriptionToJSON(description) {
    if (isMessage(description)) {
        return { descriptionMessage: { key: description.key, params: { ...description.params } } };
    }
    return { description: typeof description === 'string' ? description : null };
}

// The description a command's fromJSON() restores: the message when there
// is one, else the stored English text, else null.
export function descriptionFromJSON(json) {
    const stored = json && json.descriptionMessage;
    if (stored && typeof stored.key === 'string' && stored.key !== '') {
        const params = stored.params && typeof stored.params === 'object' ? stored.params : {};
        return message(stored.key, params);
    }
    return (json && typeof json.description === 'string' && json.description) || null;
}

// A brick-count message: "Place Brick", "Place 3 Bricks". Every such key has
// a `count` parameter, which is how a composite of one kind of command adds
// its children up (CompositeCommand#describe()).
export function bricksMessage(key, count) {
    return message(key, { count });
}
