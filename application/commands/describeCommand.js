// A command as the edit sounds (core/EditorSoundCues.js) and the guided first
// build (core/FirstBuildChecklist.js) see it: its type, a composite's
// children the same way, and for a placed brick its definition and position.
const MAX_DEPTH = 8;

export function describeCommand(command, depth = 0) {
    if (!command || depth > MAX_DEPTH) {
        return { type: null, children: [] };
    }
    const children = Array.isArray(command.commands)
        ? command.commands.map((child) => describeCommand(child, depth + 1))
        : [];
    if (command.type === 'place-brick') {
        const position = command.position;
        return {
            type: command.type,
            children,
            definitionId: command.definitionId ?? null,
            position: position ? { x: position.x, y: position.y, z: position.z } : null
        };
    }
    return { type: command.type, children };
}
