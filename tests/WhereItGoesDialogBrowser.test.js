// @environment browser
import { createApp, nextTick } from 'vue';
import EditorDistributionDialog from '../ui/components/EditorDistributionDialog.js';
import { assert } from './support/Assert.js';

// Right after Publish, the Editor's dialog is "Where it goes": its combined
// action is Send, and it offers to keep the choice for every publish
// (ui/views/editorView/usePostPublishDistribution.js). The authorship claim's
// dialog stays Distribute, with nothing to keep.

function mount(props) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const events = [];
    const app = createApp({
        components: { EditorDistributionDialog },
        data: () => ({ props }),
        methods: { record(name, value) { events.push([name, value]); } },
        template: `<EditorDistributionDialog v-bind="props"
            @update:remember="record('remember', $event)"
            @distribute-both="record('send')" />`
    });
    const vm = app.mount(host);
    return { host, vm, events, unmount: () => { app.unmount(); host.remove(); } };
}

{
    const { host, vm, events, unmount } = mount({
        canDistributePublication: true, canDistributeSnapshot: true, forPublish: true, rememberable: true, remember: true
    });
    assert(host.querySelector('h3').textContent.trim() === 'Where it goes', 'the dialog is called Where it goes');
    const send = host.querySelector('.editor-distribution-dialog-combined-action');
    assert(send.textContent.trim() === 'Send', `its combined action is Send — got ${send.textContent.trim()}`);
    send.click();
    const box = host.querySelector('.editor-distribution-dialog-remember input');
    assert(box && box.checked, 'Send here every time I publish starts ticked');
    box.click();
    assert(JSON.stringify(events) === JSON.stringify([['send', undefined], ['remember', false]]), `Send and the box report up — got ${JSON.stringify(events)}`);

    vm.props = { ...vm.props, rememberable: false };
    await nextTick();
    assert(!host.querySelector('.editor-distribution-dialog-remember'), 'a choice that can\'t be kept offers no box');
    unmount();
    console.log('✓ after Publish the dialog is Where it goes, with Send and a box to keep the choice');
}

{
    const { host, unmount } = mount({ canDistributePublication: true, canDistributeSnapshot: false });
    assert(host.querySelector('h3').textContent.trim() === 'Distribute', 'the authorship claim\'s dialog stays Distribute');
    assert(!host.querySelector('.editor-distribution-dialog-remember'), 'with nothing to keep');
    unmount();
    console.log('✓ the authorship claim\'s dialog is unchanged');
}
