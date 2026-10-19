// @environment browser — mounts the Editor's About this build panel with Vue.
import { createApp, h, nextTick, ref } from 'vue';
import DocumentInfoPanel from '../ui/components/DocumentInfoPanel.js';
import { t } from '../ui/i18n/i18n.js';
import { assert } from './support/Assert.js';

// The Editor's one-line title unfolds into the same About this build panel
// World View shows, and its heading folds it again. Read more and Edit
// Metadata work there as they do in World View.

const info = {
    documentId: 'doc-1', title: 'Garden Pavilion', description: 'A quiet garden pavilion by the water. '.repeat(30),
    tags: ['garden'], author: 'alice', license: null, placementPolicy: 'anyone', statusLabel: 'Saved', editable: true
};

const expanded = ref(false);
const events = [];
const host = document.createElement('div');
document.body.appendChild(host);
const app = createApp({
    render: () => h(DocumentInfoPanel, {
        compact: true,
        expanded: expanded.value,
        info,
        onToggle: () => { expanded.value = !expanded.value; },
        onEditMetadata: () => events.push('edit'),
        onReadDescription: () => events.push('read')
    })
});
app.mount(host);

try {
    // Folded: the one-line form, its title the control that unfolds it.
    const toggle = host.querySelector('.document-info-compact-toggle');
    assert(toggle && toggle.getAttribute('aria-expanded') === 'false', 'the title is a folded disclosure');
    assert(toggle.textContent.includes('Garden Pavilion'), 'showing the build\'s title');
    assert(!host.querySelector('.info-row'), 'with no details while folded');
    host.querySelector('.document-info-compact-edit').click();
    assert(events.join() === 'edit', '✎ still opens Edit Metadata');
    console.log('✓ folded, the Editor shows its one-line title with ✎');

    // Unfolded: World View's full panel, headed by the control that folds it.
    toggle.click();
    await nextTick();
    const collapse = host.querySelector('.document-info-collapse');
    assert(collapse && collapse.getAttribute('aria-expanded') === 'true', 'the heading is an unfolded disclosure');
    assert(collapse.textContent.includes(t('documentInfo.title')), 'named About this build');
    assert(host.querySelector('.document-info-name').textContent.trim() === 'Garden Pavilion', 'the full panel names the build');
    const labels = [...host.querySelectorAll('.info-label')].map((label) => label.textContent.trim());
    for (const key of ['documentInfo.tags', 'documentInfo.license', 'documentInfo.placement', 'documentInfo.status', 'documentInfo.author']) {
        assert(labels.includes(t(key)), `and shows ${t(key)} (got ${labels})`);
    }
    assert(!host.querySelector('.document-info-compact-row'), 'instead of the one-line form');
    host.querySelector('.document-info-read-more').click();
    [...host.querySelectorAll('.info-actions button')].find((button) => button.textContent.trim() === t('documentInfo.editMetadata')).click();
    assert(events.join() === 'edit,read,edit', `Read more and Edit Metadata reach the Editor (${events})`);
    console.log('✓ unfolded, it is World View\'s About this build panel');

    collapse.click();
    await nextTick();
    assert(host.querySelector('.document-info-compact-toggle') && !host.querySelector('.info-row'), 'its heading folds it again');
    console.log('✓ the heading folds it back to one line');
} finally {
    app.unmount();
    host.remove();
}
