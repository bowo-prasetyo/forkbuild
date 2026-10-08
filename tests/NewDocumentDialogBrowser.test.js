// @environment browser
import { createApp, nextTick } from 'vue';
import NewDocumentDialog from '../ui/components/NewDocumentDialog.js';
import { CreateStructureRegistryUseCase } from '../application/editor/CreateStructureRegistryUseCase.js';
import { FEATURED_STRUCTURE_IDS, featuredStructures } from '../application/home/FeaturedBuilds.js';
import { message } from '../core/Message.js';
import { t } from '../ui/i18n/i18n.js';
import { assert } from './support/Assert.js';

// The Editor's New, rendered by real Vue with the shipped CSS: an empty plot
// and the ready-made builds, a warning when the open document has unsaved
// changes, and the choice reported to the Editor.

await new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/css/main.css';
    link.onload = resolve;
    link.onerror = () => reject(new Error('css/main.css failed to load'));
    document.head.appendChild(link);
});

const structures = featuredStructures(new CreateStructureRegistryUseCase().execute(), FEATURED_STRUCTURE_IDS);

function mount(unsavedTitle = null) {
    const events = [];
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp(NewDocumentDialog, {
        structures,
        unsavedTitle,
        onChooseEmpty: () => events.push(['empty']),
        onChooseStructure: (structure) => events.push(['structure', structure.id]),
        onCancel: () => events.push(['cancel'])
    });
    app.mount(host);
    return { host, events, unmount: () => { app.unmount(); host.remove(); } };
}

// An empty plot first, then a card for every ready-made build; focus starts on the empty plot.
{
    const { host, unmount } = mount();
    await nextTick();
    const dialog = host.querySelector('[role="dialog"]');
    assert(dialog && dialog.getAttribute('aria-label') === t('newDocumentDialog.title'), 'it is a labelled dialog');
    assert(!host.querySelector('.new-document-unsaved'), 'no warning for a saved document');
    assert(document.activeElement === host.querySelector('.new-document-empty'), 'focus starts on the empty plot');
    const ids = [...host.querySelectorAll('.new-document-build')].map((button) => button.dataset.structureId);
    assert(ids.join() === FEATURED_STRUCTURE_IDS.join(), `every ready-made build is offered, in order (${ids.join()})`);
    assert([...host.querySelectorAll('.new-document-build .new-document-option-name')].every((name) => name.textContent.trim()), 'each is named');
    const panel = host.querySelector('.new-document-dialog').getBoundingClientRect();
    assert(panel.width > 420, `the dialog is wider than a plain modal, for the cards (${panel.width}px)`);
    unmount();
    console.log('✓ an empty plot and every ready-made build are offered');
}

// Unsaved changes are named, with the document's title (a descriptor too).
{
    for (const title of ['Hill Fort', message('document.untitledWorld')]) {
        const { host, unmount } = mount(title);
        await nextTick();
        const warning = host.querySelector('.new-document-unsaved');
        const expected = typeof title === 'string' ? title : t(title.key);
        assert(warning && warning.textContent.includes(expected), `the warning names "${expected}"`);
        unmount();
    }
    console.log('✓ unsaved changes are warned about by name');
}

// Choices and cancelling are reported, never acted on here.
{
    const { host, events, unmount } = mount();
    host.querySelector('.new-document-empty').click();
    host.querySelector('.new-document-build[data-structure-id="showcase:harbor_island"]').click();
    host.querySelector('.modal-actions button').click();
    host.querySelector('.modal-overlay').click();
    host.querySelector('.new-document-empty').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert(JSON.stringify(events) === JSON.stringify([['empty'], ['structure', 'showcase:harbor_island'], ['cancel'], ['cancel'], ['cancel']]),
        `each choice is reported (${JSON.stringify(events)})`);
    unmount();
    console.log('✓ the empty plot, a build, Cancel, a click outside and Escape are reported');
}

console.log('\n✅ All NewDocumentDialog browser tests passed.');
