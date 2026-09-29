import { EditorActionRegistry, actionCategoryLabel } from '../../application/editor/EditorActionRegistry.js';
import { t } from '../i18n/i18n.js';

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
//      are not editing operations (sound, tool switching, Save, and
//      placement-mode's own Rotate/Cancel carve-outs) — see
//      ui/views/EditorView.js's own keydown handler, steps 3.8/4/4.5/4.6,
//      for why each of these is handled before the registry ever sees
//      the keystroke. Mirrors docs/user/ControlsReference.md by hand;
//      keep the two in sync if either changes.
const VIEW_LOCAL_SHORTCUTS = [
    { label: 'shortcuts.view.selectTool', shortcut: '1' },
    { label: 'shortcuts.view.placeTool', shortcut: '2' },
    { label: 'shortcuts.view.save', shortcut: 'Ctrl/Cmd+S' },
    { label: 'shortcuts.view.sound', shortcut: 'M' },
    { label: 'shortcuts.view.rotateGhost', shortcut: 'R' },
    { label: 'shortcuts.view.rotateGhostBack', shortcut: 'Shift+R' },
    { label: 'shortcuts.view.cancelPlacement', shortcut: 'Esc' }
];

// `shortcut` is a key name the person presses, except the mouse gestures,
// which are messages too.
const CAMERA_SHORTCUTS = [
    { label: 'shortcuts.camera.orbit', shortcut: 'shortcuts.camera.orbitGesture' },
    { label: 'shortcuts.camera.pan', shortcut: 'shortcuts.camera.panGesture' },
    { label: 'shortcuts.camera.zoom', shortcut: 'shortcuts.camera.zoomGesture' },
    { label: 'shortcuts.camera.reset', shortcut: 'Home' }
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
    methods: {
        t,
        categoryName(category) {
            return t(actionCategoryLabel(category));
        },
        cameraShortcut(row) {
            return row.shortcut.startsWith('shortcuts.') ? t(row.shortcut) : row.shortcut;
        }
    },
    computed: {
        registryGroups() {
            const withShortcut = this.registry.getAll().filter((action) => !!action.shortcut);
            return EditorActionRegistry.groupByCategory(withShortcut);
        }
    },
    template: `
        <div
            role="dialog"
            :aria-label="t('shortcuts.title')"
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
                    <strong :style="{ fontSize: '13px', color: '#e0e0e0' }">{{ t('shortcuts.title') }}</strong>
                    <button type="button" @click="$emit('close')" :style="{ background: 'transparent', border: 'none', color: '#909090', fontSize: '16px', cursor: 'pointer', lineHeight: 1 }" :aria-label="t('shortcuts.close')">×</button>
                </div>
                <div :style="{ overflowY: 'auto', padding: '6px 12px 12px' }">
                    <div :style="{ padding: '8px 0 2px', fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#707070' }">{{ t('shortcuts.camera') }}</div>
                    <div v-for="row in CAMERA_SHORTCUTS" :key="'camera-' + row.label" :style="{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '13px', color: '#d0d0d0' }">
                        <span>{{ t(row.label) }}</span>
                        <span :style="{ fontFamily: 'monospace', fontSize: '11px', color: '#707070' }">{{ cameraShortcut(row) }}</span>
                    </div>

                    <div :style="{ padding: '8px 0 2px', fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#707070' }">{{ t('shortcuts.toolsAndView') }}</div>
                    <div v-for="row in VIEW_LOCAL_SHORTCUTS" :key="'view-' + row.label" :style="{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '13px', color: '#d0d0d0' }">
                        <span>{{ t(row.label) }}</span>
                        <span :style="{ fontFamily: 'monospace', fontSize: '11px', color: '#707070' }">{{ row.shortcut }}</span>
                    </div>

                    <template v-for="group in registryGroups" :key="group.category">
                        <div :style="{ padding: '8px 0 2px', fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#707070' }">{{ categoryName(group.category) }}</div>
                        <div v-for="action in group.actions" :key="action.id" :style="{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '13px', color: '#d0d0d0' }">
                            <span>{{ t(action.label) }}</span>
                            <span :style="{ fontFamily: 'monospace', fontSize: '11px', color: '#707070' }">{{ action.shortcut }}</span>
                        </div>
                    </template>

                    <p :style="{ margin: '10px 0 0', color: '#707070', fontSize: '11px' }">
                        {{ t('shortcuts.paletteHint') }}
                    </p>
                </div>
            </div>
        </div>
    `,
    data() {
        return { VIEW_LOCAL_SHORTCUTS, CAMERA_SHORTCUTS };
    }
};
