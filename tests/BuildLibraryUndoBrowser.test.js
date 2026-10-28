// @environment browser
import { createApp, h, nextTick, reactive } from 'vue';
import BuildLibraryPanel from '../ui/components/BuildLibraryPanel.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { CreateStructureRegistryUseCase } from '../application/editor/CreateStructureRegistryUseCase.js';
import { CreateEditorContextUseCase } from '../application/editor/CreateEditorContextUseCase.js';
import { PaletteUseCase } from '../application/editor/PaletteUseCase.js';
import { t } from '../ui/i18n/i18n.js';
import { assert } from './support/Assert.js';

// Undo in the Build Library's pinned header, after a structure is removed
// from My Structures (finding P2-13 of
// docs/reviews/EditorPlacementUX-2026-10-27.md): it names what was removed,
// is read out, takes up the focus the removed card took with it, and asks
// for the structure back.

await new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/css/main.css';
    link.onload = resolve;
    link.onerror = () => reject(new Error('css/main.css failed to load'));
    document.head.appendChild(link);
});

const registry = new CreateBrickRegistryUseCase().execute();
const paletteUseCase = new PaletteUseCase(registry, new CreateEditorContextUseCase().execute());
const structureGroups = new CreateStructureRegistryUseCase().execute().groupByCategory();
const state = reactive({ removed: '' });
const undone = [];
const host = document.createElement('div');
host.className = 'sidebar';
host.style.height = '600px';
document.body.appendChild(host);
const app = createApp({
    render: () => h('div', { class: 'sidebar-scroll' }, [h(BuildLibraryPanel, {
        paletteUseCase, structureGroups, registry,
        removedStructureName: state.removed,
        onUndoRemovePersonalStructure: () => undone.push(true)
    })])
});
app.mount(host);
await nextTick();

assert(!host.querySelector('.build-library-undo'), '1. nothing removed, no Undo');

// The card's own Remove button had the focus, and went with the card.
document.activeElement?.blur();
state.removed = 'Shed';
await nextTick();
await nextTick();
const notice = host.querySelector('.build-library-head .build-library-undo');
assert(notice && notice.getAttribute('role') === 'status', '2. Undo shows in the pinned header, read out as a status');
assert(notice.textContent.includes(t('editor.structureRemoved', { name: 'Shed' })), '3. naming what was removed');
const undo = notice.querySelector('.build-library-undo-btn');
assert(undo.textContent.trim() === t('buildLibrary.undoRemove') && undo.getAttribute('aria-label') === t('buildLibrary.undoRemoveLabel', { name: 'Shed' }),
    '4. its button says Undo, and what it puts back');
assert(document.activeElement === undo, '5. the focus the removed card took goes to Undo');
assert(undo.getBoundingClientRect().right <= host.querySelector('.build-library-head').getBoundingClientRect().right + 1, '6. it fits the sidebar');
undo.click();
assert(undone.length === 1, '7. Undo asks for the structure back');

// Focus somewhere real (the search box) is left alone.
state.removed = '';
await nextTick();
host.querySelector('.build-library-search').focus();
state.removed = 'Tower';
await nextTick();
await nextTick();
assert(document.activeElement === host.querySelector('.build-library-search'), '8. focus already somewhere is left there');
console.log('✓ Undo after removing from My Structures');

app.unmount();
host.remove();
console.log('✅ All Build Library undo tests passed.');
