// @environment browser — mounts the real Keyboard Shortcuts overlay with Vue.
import { createApp } from 'vue';
import KeyboardShortcutsOverlay from '../ui/components/KeyboardShortcutsOverlay.js';
import { EditorActionRegistry, createStandardActions } from '../application/editor/EditorActionRegistry.js';
import { InputRouter } from '../application/editor/InputRouter.js';
import { assert } from './support/Assert.js';

async function runTests() {
    const registry = new EditorActionRegistry(createStandardActions({ session: {}, feedback: { show() {} }, ui: {} }));
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp(KeyboardShortcutsOverlay, { registry });
    app.mount(host);

    // Every row the overlay shows, as "label | shortcut".
    const rows = Array.from(host.querySelectorAll('[role="dialog"] div > span:first-child'))
        .map((label) => `${label.textContent.trim()} | ${label.nextElementSibling ? label.nextElementSibling.textContent.trim() : ''}`);
    assert(rows.includes('Sound on/off | M'), `the overlay lists M for sound (rows: ${rows.join('; ')})`);
    assert(rows.includes('Save | Ctrl/Cmd+S'), 'alongside the other view shortcuts');
    assert(rows.filter((row) => row.endsWith('| M')).length === 1, 'M is listed once');

    // M reaches the Editor's own sound toggle because no editing action claims it.
    const plainM = new KeyboardEvent('keydown', { key: 'm' });
    assert(InputRouter.matchShortcut(plainM, registry) === null, 'no Editor action uses plain M');

    app.unmount();
    host.remove();
    console.log('✓ the Keyboard Shortcuts overlay lists M for sound, and M is free');
}

await runTests();
