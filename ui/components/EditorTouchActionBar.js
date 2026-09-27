// The Editor's touch-screen stand-ins for keys a phone lacks: Undo, Redo,
// Rotate, Delete, a Multi-select toggle (a tap then acts as Ctrl-click), a Box
// toggle (a drag then draws the Shift-drag marquee), and the Command Palette,
// which reaches every other action. Each runs the same
// EditorActionRegistry action as its shortcut, with the same enabled rules.
const ACTIONS = Object.freeze({
    undo: 'history.undo',
    redo: 'history.redo',
    rotate: 'transform.rotateClockwise',
    delete: 'selection.delete',
    palette: 'ui.commandPalette'
});

export default {
    name: 'EditorTouchActionBar',
    props: {
        registry: { type: Object, required: true },
        getContext: { type: Function, required: true },
        multiSelect: { type: Boolean, default: false },
        boxSelect: { type: Boolean, default: false },
        // While placing, Rotate turns the piece being placed (the R key there).
        placing: { type: Boolean, default: false }
    },
    emits: ['run', 'rotate-placement', 'toggle-multi-select', 'toggle-box-select'],
    computed: {
        context() {
            return this.getContext();
        }
    },
    methods: {
        isDisabled(name) {
            const action = this.registry.get(ACTIONS[name]);
            return !action || !action.enabled(this.context);
        },
        run(name) {
            this.$emit('run', ACTIONS[name]);
        },
        rotate() {
            if (this.placing) {
                this.$emit('rotate-placement');
            } else {
                this.run('rotate');
            }
        }
    },
    template: `
        <div class="editor-touch-bar" role="toolbar" aria-label="Touch editing actions">
            <button type="button" class="editor-touch-btn" :disabled="isDisabled('undo')" @click="run('undo')">Undo</button>
            <button type="button" class="editor-touch-btn" :disabled="isDisabled('redo')" @click="run('redo')">Redo</button>
            <button type="button" class="editor-touch-btn" :disabled="!placing && isDisabled('rotate')" @click="rotate">Rotate</button>
            <button type="button" class="editor-touch-btn" :disabled="isDisabled('delete')" @click="run('delete')">Delete</button>
            <button
                type="button"
                :class="['editor-touch-btn', { 'editor-touch-btn--active': multiSelect }]"
                :aria-pressed="multiSelect ? 'true' : 'false'"
                @click="$emit('toggle-multi-select')"
            >Multi</button>
            <button
                type="button"
                :class="['editor-touch-btn', { 'editor-touch-btn--active': boxSelect }]"
                :aria-pressed="boxSelect ? 'true' : 'false'"
                @click="$emit('toggle-box-select')"
            >Box</button>
            <button type="button" class="editor-touch-btn" @click="run('palette')">More</button>
        </div>
    `
};
