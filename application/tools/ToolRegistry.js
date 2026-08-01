// Maps a tool id (e.g. "select", "place") to its Tool subclass. Same
// shape as BrickRegistry, but deliberately lives in application/ rather
// than core/: BrickRegistry lives in core/ because Brick.definitionId is
// domain data World/Brick reference directly. Nothing in core/ ever needs
// to know which tools exist or which one is active — tools are purely an
// editor/application concept, not domain data.
export class ToolRegistry {
    constructor() {
        this._tools = new Map();
    }

    register(toolId, ToolClass) {
        this._tools.set(toolId, ToolClass);
    }

    get(toolId) {
        return this._tools.get(toolId) || null;
    }

    getAll() {
        return Array.from(this._tools.keys());
    }
}
