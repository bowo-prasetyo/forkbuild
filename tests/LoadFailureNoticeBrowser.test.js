// @environment browser — renders into a real DOM.
// ui/loadRecovery.js's showLoadFailure(): the blank page is replaced by a
// message, in the chosen language, and a button that reloads.
import { showLoadFailure } from '../ui/loadRecovery.js';
import { setAppLocale } from '../ui/i18n/i18n.js';
import en from '../ui/i18n/messages/en.js';
import ja from '../ui/i18n/messages/ja.js';
import { assert } from './support/Assert.js';

async function render() {
    const container = document.createElement('div');
    container.append(document.createElement('span'));
    document.body.append(container);
    let reloads = 0;
    await showLoadFailure({ container, reload: () => { reloads++; } });
    return { container, reloads: () => reloads };
}

async function runTests() {
    await setAppLocale('en');
    {
        const { container, reloads } = await render();
        const notice = container.querySelector('.load-failure');
        assert(notice && container.children.length === 1, 'the notice replaces what was there');
        assert(notice.getAttribute('role') === 'alert', 'it is announced');
        assert(notice.querySelector('p').textContent === en['app.loadFailed'], 'it says what happened, in English');
        const button = notice.querySelector('button');
        assert(button.type === 'button' && button.textContent === en['app.loadFailedReload'], 'with a Reload button');
        button.click();
        assert(reloads() === 1, 'which reloads the page');
        container.remove();
        console.log('✓ the notice says what happened and offers a reload');
    }

    await setAppLocale('ja');
    {
        const { container } = await render();
        assert(container.querySelector('p').textContent === ja['app.loadFailed'], 'in the chosen language');
        assert(container.querySelector('button').textContent === ja['app.loadFailedReload'], 'button included');
        container.remove();
        console.log('✓ the notice is in the chosen language');
    }
    await setAppLocale('en');
    console.log('\n✅ All LoadFailureNotice browser tests passed.');
}

await runTests();
