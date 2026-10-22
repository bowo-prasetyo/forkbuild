// @environment browser
import { createApp, h, nextTick } from 'vue';
import Toolbar from '../ui/components/Toolbar.js';
import { License, LicenseId } from '../core/document/License.js';
import { Findability } from '../application/settings/FindabilityStore.js';
import { setAppLocale, t } from '../ui/i18n/i18n.js';
import { assert } from './support/Assert.js';

// A first Publish in one sheet (ui/components/PublishSheet.js), through the
// Editor's real toolbar, rendered by real Vue with the shipped CSS: on a new
// device it asks for a name (one suggested) with remixing and Everyone
// already chosen, and one Publish button does the rest; each choice can be
// changed in place; Keep building publishes nothing; publishing with no name
// waits under Advanced; and with nothing left to ask, Publish publishes at
// once (docs/Pillars.md, "Infrastructure, kept out of sight").

await new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/css/main.css';
    link.onload = resolve;
    link.onerror = () => reject(new Error('css/main.css failed to load'));
    document.head.appendChild(link);
});

const flush = async () => {
    for (let i = 0; i < 6; i += 1) {
        await Promise.resolve();
        await nextTick();
    }
};

function identities({ names = [], signedIn = false } = {}) {
    const made = [];
    let session = signedIn ? { isAuthenticated: true, identityId: 'did:key:old' } : null;
    return {
        made,
        listIdentities: () => [...names, ...made],
        currentSession: () => session,
        isUnlocked: () => true,
        createIdentity: async (label, passphrase) => {
            const identity = { identityId: `did:key:${label}`, label, passphrase };
            made.push(identity);
            return identity;
        },
        authenticate: async (identityId) => {
            session = { isAuthenticated: true, identityId };
        },
        onUserChanged: () => () => {},
        onVaultLockChanged: () => () => {}
    };
}

function mount({ licenseId = LicenseId.UNSPECIFIED, findability = null, identityUseCase = identities() } = {}) {
    const published = [];
    let chosen = findability;
    const metadata = { title: 'House', license: new License({ id: licenseId }), authorIdentityId: null, touch() {} };
    const document = { world: { id: 'w' }, metadata };
    const host = window.document.createElement('div');
    window.document.body.appendChild(host);
    const app = createApp({
        render: () => h(Toolbar, {
            documentManager: { document, state: { dirty: false }, onStateChanged: () => () => {}, markDirty() {} },
            saveDocumentUseCase: { execute: () => {} },
            loadDocumentUseCase: { listSavedDocuments: () => [] },
            editorSession: {},
            publishDocumentUseCase: {
                execute: () => {
                    published.push({ signedBy: identityUseCase.currentSession()?.identityId || null, license: metadata.license.id });
                    return { title: 'House' };
                }
            },
            feedback: { show: () => {} }
        })
    });
    app.provide('identityUseCase', identityUseCase);
    app.provide('findabilityStore', { get: () => chosen, set: (value) => { chosen = value; return value; } });
    app.mount(host);
    return {
        host,
        published,
        metadata,
        identityUseCase,
        findability: () => chosen,
        sheet: () => host.querySelector('.publish-sheet'),
        publish: async () => {
            host.querySelector('.toolbar-publish').click();
            await flush();
        },
        click: async (selector) => {
            host.querySelector(selector).click();
            await flush();
        },
        unmount: () => {
            app.unmount();
            host.remove();
        }
    };
}

const text = (root, selector) => root.querySelector(selector)?.textContent.trim();

await setAppLocale('en');

// A new device: one sheet, everything already chosen, one click publishes it.
{
    const toolbar = mount();
    await toolbar.publish();
    const sheet = toolbar.sheet();
    assert(sheet, 'a first Publish opens the sheet');
    assert(toolbar.host.querySelectorAll('[role="dialog"]').length === 1, 'and only the sheet: one dialog, not three in turn');
    assert(text(sheet, '#publish-sheet-title') === t('publishSheet.title'), 'it says what it is for');
    const name = sheet.querySelector('.publish-sheet-name');
    assert(/^Builder \d{3}$/.test(name.value), `with a name suggested (${name.value})`);
    assert(window.document.activeElement === name, 'which has the focus, ready to be typed over');
    assert(sheet.querySelector('.publish-sheet-remix input').checked, 'others may remix it, already');
    assert(sheet.querySelector('.publish-sheet-everyone input').checked, 'and everyone can find it, already');
    assert(text(sheet, '.publish-sheet-remix .publish-sheet-hint') === t('remixPermission.allowDescription'), 'each saying what it means');
    assert(text(sheet, '.publish-sheet-publish') === t('loginModal.quick.publishAs', { name: name.value }), 'one button, naming who it publishes as');
    const advanced = sheet.querySelector('.publish-sheet-advanced');
    assert(advanced && !advanced.open, 'publishing with no name waits, folded, under Advanced');
    assert(toolbar.published.length === 0, 'nothing is published before the button is pressed');

    await toolbar.click('.publish-sheet-publish');
    assert(!toolbar.sheet(), 'Publish closes the sheet');
    assert(toolbar.identityUseCase.made.length === 1 && toolbar.identityUseCase.made[0].label === name.value && toolbar.identityUseCase.made[0].passphrase === null,
        'and makes the suggested name, with no passphrase asked');
    assert(toolbar.published.length === 1 && toolbar.published[0].signedBy === `did:key:${name.value}`, 'then publishes it, signed under that name');
    assert(toolbar.metadata.license.id === LicenseId.CC_BY_4_0, 'remixable (CC BY 4.0)');
    assert(toolbar.findability() === Findability.EVERYONE, 'and found by everyone, remembered for this device');

    await toolbar.publish();
    assert(!toolbar.sheet() && toolbar.published.length === 2, 'the next Publish asks nothing and publishes');
    toolbar.unmount();
}
console.log('✓ a new device: one sheet, remix and Everyone already on, one click publishes');

// Each choice is changed in place, and the name typed over.
{
    const toolbar = mount();
    await toolbar.publish();
    const sheet = toolbar.sheet();
    const name = sheet.querySelector('.publish-sheet-name');
    name.value = '  Robin ';
    name.dispatchEvent(new Event('input'));
    sheet.querySelector('.publish-sheet-remix input').click();
    sheet.querySelector('.publish-sheet-everyone input').click();
    await flush();
    assert(text(sheet, '.publish-sheet-remix .publish-sheet-hint') === t('remixPermission.lookOnlyDescription'), 'turned off, remixing says people can only look');
    assert(text(sheet, '.publish-sheet-everyone .publish-sheet-hint') === t('findability.linkDescription'), 'and finding says only the link carries it');
    assert(text(sheet, '.publish-sheet-publish') === t('loginModal.quick.publishAs', { name: 'Robin' }), 'the button names the name typed');
    name.value = '   ';
    name.dispatchEvent(new Event('input'));
    await flush();
    assert(sheet.querySelector('.publish-sheet-publish').disabled, 'with no name, Publish waits for one');
    name.value = 'Robin';
    name.dispatchEvent(new Event('input'));
    await flush();
    await toolbar.click('.publish-sheet-publish');
    assert(toolbar.identityUseCase.made[0].label === 'Robin', 'published under the name typed');
    assert(toolbar.metadata.license.id === LicenseId.ALL_RIGHTS_RESERVED, 'only to look at (All Rights Reserved)');
    assert(toolbar.findability() === Findability.LINK, 'and kept to its link');
    toolbar.unmount();
}
console.log('✓ each choice changes in place, and the name can be typed over');

// Keep building, Escape and a click outside publish nothing.
{
    const toolbar = mount();
    await toolbar.publish();
    await toolbar.click('.publish-sheet-cancel');
    assert(!toolbar.sheet() && toolbar.published.length === 0, 'Keep building closes it without publishing');
    await toolbar.publish();
    toolbar.sheet().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await flush();
    assert(!toolbar.sheet() && toolbar.published.length === 0, 'so does Escape');
    assert(toolbar.identityUseCase.made.length === 0 && toolbar.metadata.license.id === LicenseId.UNSPECIFIED && toolbar.findability() === null,
        'and nothing is kept: no name, no license, no choice');
    await toolbar.publish();
    assert(toolbar.sheet(), 'the next Publish asks again');
    toolbar.unmount();
}
console.log('✓ Keep building and Escape publish nothing and keep nothing');

// Publishing with no name, from Advanced.
{
    const toolbar = mount();
    await toolbar.publish();
    toolbar.sheet().querySelector('.publish-sheet-advanced summary').click();
    await flush();
    assert(text(toolbar.sheet(), '.publish-sheet-unsigned') === t('publishSheet.unsigned'), 'Advanced offers publishing without a name');
    await toolbar.click('.publish-sheet-unsigned');
    assert(!toolbar.sheet() && toolbar.published.length === 1 && toolbar.published[0].signedBy === null, 'which publishes it unsigned');
    assert(toolbar.identityUseCase.made.length === 0, 'making no name');
    assert(toolbar.metadata.license.id === LicenseId.CC_BY_4_0 && toolbar.findability() === Findability.EVERYONE, 'and keeps the choices on the sheet');
    toolbar.unmount();
}
console.log('✓ publishing without a name, under Advanced');

// Only what is still unknown is asked; with nothing unknown, no sheet.
{
    const named = mount({ identityUseCase: identities({ signedIn: true }) });
    await named.publish();
    const sheet = named.sheet();
    assert(sheet && !sheet.querySelector('.publish-sheet-name') && !sheet.querySelector('.publish-sheet-advanced'), 'with a name in use, no name is asked');
    assert(sheet.querySelector('.publish-sheet-remix') && sheet.querySelector('.publish-sheet-everyone'), 'only the two choices');
    assert(text(sheet, '.publish-sheet-publish') === t('toolbar.publish'), 'and the button just says Publish');
    assert(window.document.activeElement === sheet.querySelector('.publish-sheet-publish'), 'which has the focus');
    await named.click('.publish-sheet-publish');
    assert(named.published.length === 1 && named.published[0].signedBy === 'did:key:old', 'published under the name in use');
    named.unmount();

    const licensed = mount({ licenseId: LicenseId.CC_BY_4_0, identityUseCase: identities({ signedIn: true }) });
    await licensed.publish();
    const only = licensed.sheet();
    assert(only && !only.querySelector('.publish-sheet-remix') && only.querySelector('.publish-sheet-everyone'), 'a build with a license is asked only who can find it');
    licensed.unmount();

    const ready = mount({ licenseId: LicenseId.CC_BY_4_0, findability: Findability.LINK, identityUseCase: identities({ signedIn: true }) });
    await ready.publish();
    assert(!ready.sheet() && ready.published.length === 1, 'with nothing to ask, Publish publishes at once');
    ready.unmount();
}
console.log('✓ only what is still unknown is asked, and nothing when nothing is');

// On a phone the sheet fits the screen.
{
    const toolbar = mount();
    await toolbar.publish();
    const panel = toolbar.sheet();
    const box = panel.getBoundingClientRect();
    assert(box.width <= window.innerWidth && box.left >= 0, `the sheet stays on the screen (${Math.round(box.left)}, ${Math.round(box.width)} of ${window.innerWidth})`);
    toolbar.unmount();
}
console.log('✓ the sheet stays on the screen');

console.log('✅ All publish sheet browser tests passed.');
