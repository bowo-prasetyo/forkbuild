// A command as the edit sounds see it (core/EditorSoundCues.js): its type,
// and a composite's children the same way.
const MAX_DEPTH = 8;

export function describeCommand(command, depth = 0) {
    if (!command || depth > MAX_DEPTH) {
        return { type: null, children: [] };
    }
    const children = Array.isArray(command.commands)
        ? command.commands.map((child) => describeCommand(child, depth + 1))
        : [];
    return { type: command.type, children };
}
