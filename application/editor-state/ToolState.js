import { Tool } from './Tool.js';

// Pure data: which tool is currently active. Defaults to Select, since
// that's the safe, non-destructive starting mode — an editor session
// shouldn't open already primed to place or delete something.
export class ToolState {
    constructor(activeTool = Tool.SELECT) {
        this._activeTool = activeTool;
    }

    get activeTool() {
        return this._activeTool;
    }
}
