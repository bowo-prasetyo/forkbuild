import { EventBus } from '../core/events/EventBus.js';
import { EditorEvent } from '../core/events/EditorEvent.js';
import { CameraState } from '../renderer/CameraState.js';
import { SelectionState } from './editor-state/SelectionState.js';
import { ToolState } from './editor-state/ToolState.js';
import { ActiveBrickState } from './editor-state/ActiveBrickState.js';
import { EditorSettings } from './editor-state/EditorSettings.js';
import { PreviewState } from './editor-state/PreviewState.js';
import { ActiveStructureState } from './editor-state/ActiveStructureState.js';
import { StructurePreviewState } from './editor-state/StructurePreviewState.js';

// EditorContext holds transient editor state — not domain state. Nothing
// here belongs to a World and nothing here should ever be serialized into
// the ForkBuild Protocol: selection, active tool, active brick, camera
// pose, preview, and settings are purely local to this editing session.
//
// Every change publishes an EditorEvent through its own EventBus (distinct
// from the domain EventBus World publishes through — see EditorEvent.js),
// so tools and renderers can react without EditorContext needing to know
// they exist.
export class EditorContext {
    constructor({ eventBus = new EventBus() } = {}) {
        this._eventBus = eventBus;
        this._selection = SelectionState.empty();
        this._tool = new ToolState();
        this._activeBrick = new ActiveBrickState();
        this._cameraState = new CameraState();
        this._preview = PreviewState.hidden();
        this._settings = new EditorSettings();
        this._activeStructure = new ActiveStructureState();
        this._structurePreview = StructurePreviewState.hidden();
    }

    get eventBus() {
        return this._eventBus;
    }

    get selection() {
        return this._selection;
    }

    setSelection(selection) {
        this._selection = selection;
        this._publish(EditorEvent.SELECTION_CHANGED, { selection });
    }

    clearSelection() {
        this.setSelection(SelectionState.empty());
    }

    get tool() {
        return this._tool;
    }

    setActiveTool(activeTool) {
        this._tool = new ToolState(activeTool);
        this._publish(EditorEvent.TOOL_CHANGED, { activeTool });
    }

    get activeBrick() {
        return this._activeBrick;
    }

    setActiveBrick(definitionId) {
        this._activeBrick = new ActiveBrickState(definitionId);
        this._publish(EditorEvent.ACTIVE_BRICK_CHANGED, { definitionId });
    }

    get cameraState() {
        return this._cameraState;
    }

    setCameraState(cameraState) {
        this._cameraState = cameraState;
        this._publish(EditorEvent.CAMERA_STATE_CHANGED, { cameraState });
    }

    get preview() {
        return this._preview;
    }

    setPreview(preview) {
        this._preview = preview;
        this._publish(EditorEvent.PREVIEW_CHANGED, { preview });
    }

    get settings() {
        return this._settings;
    }

    setSettings(settings) {
        this._settings = settings;
        this._publish(EditorEvent.SETTINGS_CHANGED, { settings });
    }

    // ------------------------------------------------- 0.2.90 structure placement

    get activeStructure() {
        return this._activeStructure;
    }

    setActiveStructure(documentId, title = null) {
        this._activeStructure = new ActiveStructureState(documentId, title);
        this._publish(EditorEvent.ACTIVE_STRUCTURE_CHANGED, { documentId, title });
    }

    get structurePreview() {
        return this._structurePreview;
    }

    setStructurePreview(structurePreview) {
        this._structurePreview = structurePreview;
        this._publish(EditorEvent.STRUCTURE_PREVIEW_CHANGED, { structurePreview });
    }

    _publish(eventType, payload) {
        this._eventBus.publish(eventType, payload);
    }
}
