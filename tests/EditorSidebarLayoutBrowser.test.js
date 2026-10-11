// @environment browser
import { createApp, nextTick, reactive } from 'vue';
import EditingSidebar from '../ui/components/EditingSidebar.js';
import DocumentInfoPanel from '../ui/components/DocumentInfoPanel.js';
import { assert } from './support/Assert.js';

// The Editor's left sidebar, rendered by real Vue with the shipped CSS:
// the Selection panel shows only controls that can act on the current
// selection, occasional operations sit in named collapsed sections, and
// the compact document header drops what the toolbar already says.

await new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/css/main.css';
    link.onload = resolve;
    link.onerror = () => reject(new Error('css/main.css failed to load'));
    document.head.appendChild(link);
});

// Enablement mirrors EditorActionRegistry's own rules for the actions the
// sidebar draws; execute() records the call instead of editing anything.
function fakeRegistry(executed) {
    const rules = {
        'selection.selectAll': () => true,
        'selection.clear': (c) => c.hasSelection,
        'selection.duplicate': (c) => c.hasSelection,
        'selection.delete': (c) => c.hasSelection,
        'selection.focus': (c) => c.hasSelection,
        'transform.rotateClockwise': (c) => c.hasSelection,
        'transform.rotateCounterClockwise': (c) => c.hasSelection,
        'transform.tilt': (c) => c.hasSelection,
        'clipboard.copy': (c) => c.hasSelection,
        'clipboard.paste': (c) => !c.clipboardEmpty,
        'group.create': (c) => c.hasSelection,
        'group.rename': (c) => c.hasSelectedGroup,
        'group.duplicate': (c) => c.hasSelectedGroup,
        'group.delete': (c) => c.hasSelectedGroup,
        'group.addSelection': (c) => c.hasSelection && c.hasSelectedGroup,
        'group.removeSelection': (c) => c.hasSelection && c.hasSelectedGroup,
        'structure.createFromSelection': (c) => c.hasSelection
    };
    return {
        get: (id) => (rules[id] ? { enabled: rules[id], disabledReason: () => 'not now' } : null),
        execute: (id) => executed.push(id)
    };
}

function mountSidebar(state) {
    const executed = [];
    const selectedGroups = [];
    const ui = {};
    const host = document.createElement('div');
    host.className = 'sidebar';
    host.style.height = '2000px';
    document.body.appendChild(host);
    const app = createApp({
        components: { EditingSidebar, DocumentInfoPanel },
        setup: () => ({
            state,
            registry: fakeRegistry(executed),
            getContext: () => ({ ...state.context }),
            ui,
            noop: () => {},
            selectGroup: (id) => selectedGroups.push(id)
        }),
        template: `
            <div class="sidebar-scroll">
                <EditingSidebar
                    :registry="registry"
                    :get-context="getContext"
                    :ui="ui"
                    :selection-count="state.selectionCount"
                    :is-structure-placement-selection="state.placement"
                    :selection-summary="state.summary"
                    :recolor="noop"
                    :apply-numeric="noop"
                    :align="noop"
                    :distribute="noop"
                    :repeat="noop"
                    :select-group="selectGroup"
                />
            </div>
        `
    });
    app.mount(host);
    return { host, executed, selectedGroups, ui, unmount: () => { app.unmount(); host.remove(); } };
}

const buttonLabels = (element) => [...element.querySelectorAll('button')].map((b) => b.textContent.trim());
const sectionTitles = (element) => [...element.querySelectorAll('.collapsible-section-title')].map((t) => t.textContent.trim());
const emptyContext = (extra = {}) => ({ hasSelection: false, selectionCount: 0, clipboardEmpty: true, hasGroups: false, groups: [], selectedGroupId: null, hasSelectedGroup: false, ...extra });

// Nothing selected: a hint and the one action that can run, no dead controls.
{
    const state = reactive({ selectionCount: 0, placement: false, summary: null, context: emptyContext() });
    const { host, executed, unmount } = mountSidebar(state);
    assert(JSON.stringify(buttonLabels(host)) === JSON.stringify(['Select All']),
        `empty selection shows only Select All, got ${buttonLabels(host).join(', ')}`);
    assert(host.querySelectorAll('button:disabled, input').length === 0, 'empty selection renders no disabled buttons or inputs');
    assert(host.textContent.includes('Click a brick to select it'), 'empty selection says what to do next');
    host.querySelector('button').click();
    assert(executed[0] === 'selection.selectAll', 'Select All runs selection.selectAll');
    unmount();
}

// Nothing selected but a clipboard and groups: Paste appears, and clicking a
// group selects it.
{
    const groups = [{ id: 'g1', name: 'Roof', memberCount: 4 }, { id: 'g2', name: null, memberCount: 2 }];
    const state = reactive({ selectionCount: 0, placement: false, summary: null, context: emptyContext({ clipboardEmpty: false, hasGroups: true, groups }) });
    const { host, selectedGroups, unmount } = mountSidebar(state);
    const labels = buttonLabels(host);
    assert(labels[0] === 'Select All' && labels[1] === 'Paste', `Paste joins Select All once the clipboard has something, got ${labels.join(', ')}`);
    assert(labels.includes('Roof 4') && labels.includes('(unnamed group) 2'), `groups are listed with their sizes, got ${labels.join(', ')}`);
    [...host.querySelectorAll('.editing-sidebar-group')][0].click();
    assert(selectedGroups[0] === 'g1', 'clicking a group selects it');
    unmount();
}

// Bricks selected: everyday actions up front, occasional ones in named
// collapsed sections, and the sidebar never scrolls sideways.
{
    const state = reactive({
        selectionCount: 3,
        placement: false,
        summary: { count: 3, bounds: { center: { x: 2, y: 0.5, z: -4 } } },
        context: emptyContext({ hasSelection: true, selectionCount: 3, hasGroups: true, groups: [{ id: 'g1', name: 'Roof', memberCount: 4 }] })
    });
    const { host, executed, ui, unmount } = mountSidebar(state);
    assert(host.querySelector('.editor-panel-title').textContent.trim() === '3 bricks selected', 'the card names the selection');
    const actions = buttonLabels(host.querySelector('.editor-panel-actions'));
    assert(JSON.stringify(actions) === JSON.stringify(['Rotate ↻', 'Rotate ↺', 'Tilt ⤵', 'Duplicate', 'Delete', 'Copy', 'Focus', 'Deselect']),
        `selection actions, got ${actions.join(', ')}`);
    assert(!buttonLabels(host).includes('Clear'), 'no button is labelled a bare "Clear"');
    assert(JSON.stringify(sectionTitles(host)) === JSON.stringify(['Exact position & rotation', 'Align, distribute, repeat', 'Groups & blueprint']),
        `collapsed sections say what they hold, got ${sectionTitles(host).join(', ')}`);
    assert(host.querySelectorAll('.collapsible-section-body').length === 0, 'every section starts collapsed');

    [...host.querySelectorAll('.editor-panel-actions button')].find((b) => b.textContent.trim() === 'Deselect').click();
    assert(executed.includes('selection.clear'), 'Deselect runs selection.clear');

    ui.focusNumeric();
    await nextTick();
    await nextTick();
    assert(document.activeElement && document.activeElement.closest('.numeric-transform-panel'),
        'transform.numeric\'s focus hook opens the numeric section and focuses its first field');
    assert(buttonLabels(host).includes('Reset fields'), 'the numeric panel\'s field reset is labelled as such');

    for (const header of host.querySelectorAll('.collapsible-section--collapsed .collapsible-section-header')) {
        header.click();
    }
    await nextTick();
    const labels = buttonLabels(host);
    for (const label of ['New group', 'Add to group', 'Rename group', 'Delete group', 'Create Blueprint', 'Repeat X', 'Distribute Z']) {
        assert(labels.includes(label), `expanded sections include ${label}`);
    }
    const scroll = host.querySelector('.sidebar-scroll');
    assert(scroll.scrollWidth <= scroll.clientWidth,
        `with every section open the sidebar has no sideways overflow (${scroll.scrollWidth} > ${scroll.clientWidth})`);
    unmount();
}

// A placed structure: StructureInstancePanel is its card, so this panel
// adds nothing (in particular no second numeric transform panel).
{
    const state = reactive({ selectionCount: 1, placement: true, summary: null, context: emptyContext({ hasSelection: true, selectionCount: 1 }) });
    const { host, unmount } = mountSidebar(state);
    assert(host.querySelector('.editing-sidebar') === null && host.querySelectorAll('input').length === 0,
        'a structure selection renders nothing here');
    unmount();
}

// Compact document header: title and edit only; the full panel keeps its rows.
{
    const info = reactive({
        title: 'Untitled ForkBuild World', description: '', author: 'forkbuild', license: null,
        status: 'draft', statusLabel: 'Draft — not yet saved', editable: true, parentDocumentId: null, parentStructureId: null, editabilityNotice: null
    });
    const edits = [];
    const host = document.createElement('div');
    host.className = 'sidebar';
    document.body.appendChild(host);
    const app = createApp({
        components: { DocumentInfoPanel },
        setup: () => ({ info, onEdit: () => edits.push(true) }),
        template: `
            <div class="sidebar-scroll">
                <DocumentInfoPanel compact :info="info" @edit-metadata="onEdit" />
                <div class="full"><DocumentInfoPanel :info="info" /></div>
            </div>
        `
    });
    app.mount(host);
    const compact = host.querySelector('.document-info-panel--compact');
    assert(compact.querySelector('.document-info-compact-title').textContent.trim() === info.title, 'compact header shows the title');
    assert(!compact.textContent.includes('not yet saved') && !compact.textContent.includes('License'),
        'compact header leaves out the status row and license');
    assert(compact.querySelector('.document-info-compact-draft').textContent.trim() === 'Draft',
        'a never-saved document is marked Draft, since the toolbar says "Saved" for it');
    info.status = 'saved';
    await nextTick();
    assert(compact.querySelector('.document-info-compact-draft') === null, 'a saved document carries no chip');
    assert(compact.getBoundingClientRect().height < 64, `compact header stays short, got ${compact.getBoundingClientRect().height}px`);
    compact.querySelector('button').click();
    assert(edits.length === 1, 'the edit button opens the metadata editor');
    assert(host.querySelector('.full').textContent.includes('Draft — not yet saved'), 'the full panel (World View) still shows status');

    // A copy of a built-in structure names it, never by its id.
    info.parentStructureId = 'village:house';
    info.parentStructureName = 'House';
    await nextTick();
    const origin = compact.querySelector('.document-info-compact-origin').textContent.trim();
    assert(origin === 'Remixed from House', `the compact header names the structure, got "${origin}"`);
    assert(!host.textContent.includes('village:house'), 'no panel shows the structure\'s id');
    info.parentStructureId = '0f3c9a51-7d2e-4b8a-9c1d-2e5f6a7b8c9d';
    info.parentStructureName = null;
    await nextTick();
    assert(compact.querySelector('.document-info-compact-origin').textContent.trim() === 'Remixed from 0f3c9a51…',
        'a structure without a known name is shown by a short id');
    app.unmount();
    host.remove();
}
