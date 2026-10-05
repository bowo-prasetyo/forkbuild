// @environment browser — mounts the Document Properties dialog with Vue.
import { createApp, nextTick } from 'vue';
import MetadataEditorDialog from '../ui/components/MetadataEditorDialog.js';
import { assert } from './support/Assert.js';

function mount(info) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const saved = [];
    const app = createApp(MetadataEditorDialog, { info, onSave: (payload) => saved.push(payload) });
    app.mount(host);
    const tagsInput = host.querySelector('.metadata-editor-tags');
    const save = () => host.querySelector('.action-btn--primary').click();
    return { host, saved, tagsInput, save, done: () => { app.unmount(); host.remove(); } };
}

async function type(input, value) {
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await nextTick();
}

async function runTests() {
    // A build without tags starts with suggestions from its title and
    // description, shown in the field, so they are seen before saving.
    const fresh = mount({ title: 'A Japanese Traditional House', description: 'Raised stone plinth and a stone path.', tags: [] });
    assert(fresh.tagsInput.value === 'japanese traditional house stone raised', `suggestions fill the field (got "${fresh.tagsInput.value}")`);
    fresh.save();
    assert(fresh.saved[0].tags.join() === 'japanese,traditional,house,stone,raised', 'saving keeps what the field shows');
    fresh.done();

    // Typed tags are cleaned when saved; a suggestion button adds one.
    const typed = mount({ title: 'Temple Garden', description: '', tags: ['old'] });
    assert(typed.tagsInput.value === 'old', 'a build\'s own tags, not suggestions');
    await type(typed.tagsInput, '#Japan, Café forkbuild-snapshot');
    const suggestion = typed.host.querySelector('.metadata-editor-tag-suggestion');
    assert(suggestion && suggestion.textContent === '#temple', `suggestions not yet used are offered (got ${suggestion?.textContent})`);
    suggestion.click();
    await nextTick();
    typed.save();
    assert(typed.saved[0].tags.join() === 'japan,cafe,temple', `cleaned, ForkBuild's own dropped, the suggestion added (got ${typed.saved[0].tags})`);
    typed.done();

    // Clearing the field saves no tags.
    const cleared = mount({ title: 'A Japanese Traditional House', description: '', tags: [] });
    await type(cleared.tagsInput, '');
    cleared.save();
    assert(cleared.saved[0].tags.length === 0, 'a cleared field saves no tags');
    cleared.done();
    console.log('✓ Document Properties suggests tags, shows them, and saves what the field holds');
}

await runTests();
