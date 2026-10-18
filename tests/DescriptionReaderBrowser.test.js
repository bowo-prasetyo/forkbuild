// @environment browser — mounts the About this build panel and the reading sheet with Vue.
import { createApp, h, nextTick, ref } from 'vue';
import DocumentInfoPanel from '../ui/components/DocumentInfoPanel.js';
import DescriptionReaderSheet from '../ui/components/DescriptionReaderSheet.js';
import { t } from '../ui/i18n/i18n.js';
import { assert } from './support/Assert.js';

// A long description: World View's narrow panel shows its start and "Read
// more", which opens all of it in a wider sheet beside the panel.

// The app's real stylesheet, so layout assertions see the shipped CSS.
await new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/css/main.css';
    link.onload = resolve;
    link.onerror = () => reject(new Error('css/main.css failed to load'));
    document.head.appendChild(link);
});

function mount(render) {
    const host = document.createElement('div');
    host.className = 'world-view';
    host.style.cssText = 'position: relative; width: 1280px; height: 720px;';
    document.body.appendChild(host);
    const app = createApp({ render });
    app.mount(host);
    return { host, unmount: () => { app.unmount(); host.remove(); } };
}

const LONG = [
    '## History',
    'Built for the autumn challenge, this breakwater shelters the little harbour from the westerly swell and carries a working lamp at its end.',
    '',
    'The **stone base** was laid first, then the wall, then the light. ' + 'More about it. '.repeat(30),
    '',
    '## Materials',
    '- stone',
    '- a lamp'
].join('\n');

const info = (description, extra = {}) => ({
    documentId: 'doc-1', title: 'Harbor Wall', description, author: 'alice',
    license: null, placementPolicy: 'anyone', statusLabel: 'Published', editable: false, ...extra
});

async function runTests() {
    // The panel: the name, then the start of the description at the panel's
    // width, and "Read more" only when there's more.
    {
        const reads = [];
        const { host, unmount } = mount(() => h(DocumentInfoPanel, { info: info(LONG), onReadDescription: () => reads.push(1) }));
        const name = host.querySelector('.document-info-name');
        const start = host.querySelector('.document-info-description');
        assert(name && name.textContent === 'Harbor Wall', 'the build\'s name leads the panel');
        assert(start && start.textContent.includes('Built for the autumn challenge') && !start.textContent.includes('Materials'), 'the start of the description, not all of it');
        assert(!start.closest('.info-row'), 'not squeezed beside a label');
        const more = host.querySelector('.document-info-read-more');
        assert(more && more.textContent.trim() === t('documentInfo.readMore'), '"Read more" when there is more');
        more.click();
        assert(reads.length === 1, 'and it asks for the whole description');
        unmount();

        const short = mount(() => h(DocumentInfoPanel, { info: info('A small hut by the water.') }));
        assert(short.host.querySelector('.document-info-description').textContent.trim() === 'A small hut by the water.', 'a short description shown whole');
        assert(!short.host.querySelector('.document-info-read-more'), 'with nothing more to read');
        short.unmount();
        console.log('✓ the panel shows the start of a long description, and offers the rest');
    }

    // The sheet: all of it, beside the panel and wide enough to read.
    {
        const opener = document.createElement('button');
        document.body.appendChild(opener);
        opener.focus();
        const open = ref(true);
        const events = [];
        const reachedWindow = [];
        const onWindowKey = (event) => reachedWindow.push(event.key);
        window.addEventListener('keydown', onWindowKey);
        const { host, unmount } = mount(() => (open.value
            ? h(DescriptionReaderSheet, { info: info(LONG, { editable: true }), onClose: () => events.push('close'), onEditMetadata: () => events.push('edit') })
            : null));
        await nextTick();
        const sheet = host.querySelector('.description-reader-sheet');
        const body = sheet.querySelector('.description-reader-body');
        assert(sheet.getAttribute('role') === 'dialog' && sheet.getAttribute('aria-modal') === 'false', 'a non-modal dialog');
        assert(sheet.querySelector('#' + sheet.getAttribute('aria-labelledby')).textContent === 'Harbor Wall', 'named by the build\'s title');
        assert(sheet.querySelector('.description-reader-meta').textContent.includes(t('descriptionReader.by', { author: 'alice' })), 'with who built it');
        assert(body.textContent.includes('Materials') && body.querySelectorAll('li').length === 2, 'the whole description, formatted');
        assert(document.activeElement === body, 'focus moves to the text, so the keys scroll it');

        const box = sheet.getBoundingClientRect();
        const hostBox = host.getBoundingClientRect();
        assert(box.left - hostBox.left >= 16 + 280, `beside the 280px panel, not over it (left ${box.left - hostBox.left})`);
        assert(box.width >= 320 && box.width <= 38 * 16 + 1, `wide enough to read, not wider (got ${box.width})`);
        assert(box.bottom <= hostBox.bottom, 'within the World View');
        assert(parseFloat(getComputedStyle(body).fontSize) >= 16 && parseFloat(getComputedStyle(body).lineHeight) >= 24, 'reading-sized type');
        assert(getComputedStyle(body).overflowY === 'auto', 'it scrolls by itself');

        for (const key of ['Home', ' ', 'w', 'ArrowDown']) {
            body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
        }
        assert(reachedWindow.length === 0, `keys pressed while reading never reach the World (got ${reachedWindow})`);
        body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        assert(events.join() === 'close', 'Escape closes it');
        sheet.querySelector('.description-reader-footer .action-btn').click();
        assert(events.join() === 'close,edit', 'its owner can edit it from there');

        open.value = false;
        await nextTick();
        assert(document.activeElement === opener, 'closing gives focus back to what opened it');
        window.removeEventListener('keydown', onWindowKey);
        unmount();
        opener.remove();
        console.log('✓ the reading sheet shows all of it, beside the panel, and keeps its keys');
    }
}

await runTests();
