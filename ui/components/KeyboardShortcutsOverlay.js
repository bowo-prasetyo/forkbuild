import { EditorActionRegistry } from '../../application/EditorActionRegistry.js';

// 0.6.2 — Editor UX Consolidation: "Keyboard shortcuts become
// discoverable." Opened with `?` (or a click on Toolbar's own shortcuts
// button), closed with `?`/Escape/click-outside — the same shell
// convention ui/components/CommandPalette.js already established
// (fixed inset, click-outside/Escape to cancel), deliberately reused
// rather than inventing a second dialog pattern.
//
// Purely a READER over two sources, never a third shortcut table:
//   1. EditorActionRegistry — every registered action with a non-null
//      `shortcut`, grouped by category exactly like the palette itself
//      (EditorActionRegistry.groupByCategory()). If this list and the
//      palette ever disagree, the registry already IS the disagreement
//      resolved — both read the same actions.
//   2. VIEW_LOCAL_SHORTCUTS below — the small, deliberate set of
//      shortcuts that live outside the action registry because they
//      are not editing operations (tool switching, Save, and
//      placement-mode's own Rotate/Cancel carve-outs) — see
//      ui/views/EditorView.js's own keydown handler, steps 4/4.5/4.6,
//      for why each of these is handled before the registry ever sees
//      the keystroke. Mirrors docs/user/ControlsReference.md by hand;
//      keep the two in sync if either changes.
const VIEW_LOCAL_SHORTCUTS = [
    { label: 'Select Tool', shortcut: '1' },
    { label: 'Place Tool', shortcut: '2' },
    { label: 'Save', shortcut: 'Ctrl/Cmd+S' },
    { label: 'Rotate ghost while placing', shortcut: 'R' },
    { label: 'Rotate ghost (opposite direction)', shortcut: 'Shift+R' },
    { label: 'Cancel placement', shortcut: 'Esc' }
];

const CAMERA_SHORTCUTS = [
    { label: 'Orbit', shortcut: 'Left-drag' },
    { label: 'Pan', shortcut: 'Right-drag' },
    { label: 'Zoom', shortcut: 'Scroll' },
    { label: 'Reset camera', shortcut: 'Home' }
];

export default {
    name: 'KeyboardShortcutsOverlay',
    props: {
        registry: {
            type: Object,
            required: true
        }
    },
    emits: ['close'],
    computed: {
        registryGroups() {
            const withShortcut = this.registry.getAll().filter((action) => !!action.shortcut);
            return EditorActionRegistry.groupByCategory(withShortcut);
        }
    },
    template: `
        <div
            role="dialog"
            aria-label="Keyboard shortcuts"
            :style="{
                position: 'fixed',
                inset: 0,
                zIndex: 60,
                background: 'rgba(0, 0, 0, 0.55)',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'center',
                paddingTop: '8vh'
            }"
            @click.self="$emit('close')"
        >
            <div
                :style="{
                    width: '460px',
                    maxWidth: '90vw',
                    maxHeight: '78vh',
                    display: 'flex',
                    flexDirection: 'column',
                    background: '#1a1a1a',
                    border: '1px solid #2a2a2a',
                    borderRadius: '6px',
                    boxShadow: '0 12px 40px rgba(0, 0, 0, 0.5)',
                    overflow: 'hidden'
                }"
            >
                <div :style="{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderBottom: '1px solid #2a2a2a' }">
                    <strong :style="{ fontSize: '13px', color: '#e0e0e0' }">Keyboard Shortcuts</strong>
                    <button type="button" @click="$emit('close')" :style="{ background: 'transparent', border: 'none', color: '#909090', fontSize: '16px', cursor: 'pointer', lineHeight: 1 }" aria-label="Close">×</button>
                </div>
                <div :style="{ overflowY: 'auto', padding: '6px 12px 12px' }">
                    <div :style="{ padding: '8px 0 2px', fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#707070' }">Camera</div>
                    <div v-for="row in CAMERA_SHORTCUTS" :key="'camera-' + row.label" :style="{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '13px', color: '#d0d0d0' }">
                        <span>{{ row.label }}</span>
                        <span :style="{ fontFamily: 'monospace', fontSize: '11px', color: '#707070' }">{{ row.shortcut }}</span>
                    </div>

                    <div :style="{ padding: '8px 0 2px', fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#707070' }">Tools & View</div>
                    <div v-for="row in VIEW_LOCAL_SHORTCUTS" :key="'view-' + row.label" :style="{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '13px', color: '#d0d0d0' }">
                        <span>{{ row.label }}</span>
                        <span :style="{ fontFamily: 'monospace', fontSize: '11px', color: '#707070' }">{{ row.shortcut }}</span>
                    </div>

                    <template v-for="group in registryGroups" :key="group.category">
                        <div :style="{ padding: '8px 0 2px', fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#707070' }">{{ group.category }}</div>
                        <div v-for="action in group.actions" :key="action.id" :style="{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '13px', color: '#d0d0d0' }">
                            <span>{{ action.label }}</span>
                            <span :style="{ fontFamily: 'monospace', fontSize: '11px', color: '#707070' }">{{ action.shortcut }}</span>
                        </div>
                    </template>

                    <p :style="{ margin: '10px 0 0', color: '#707070', fontSize: '11px' }">
                        Ctrl/Cmd+K opens the Command Palette, which searches every one of these by name.
                    </p>
                </div>
            </div>
        </div>
    `,
    data() {
        return { VIEW_LOCAL_SHORTCUTS, CAMERA_SHORTCUTS };
    }
};
