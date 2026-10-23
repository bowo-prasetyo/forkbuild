// @environment browser
import { createApp, nextTick } from 'vue';
import WorldSayPanel from '../ui/components/WorldSayPanel.js';
import { useViewportInput } from '../ui/views/worldView/useViewportInput.js';
import { t } from '../ui/i18n/i18n.js';
import { assert } from './support/Assert.js';

// World View's Say panel (ui/components/WorldSayPanel.js), rendered by real Vue
// with the shipped CSS: the last few lines by whom, Say opening a short line
// that Enter sends and Escape closes, what it says when a line can't be said,
// and Enter in World View opening it (ui/views/worldView/useViewportInput.js).

await new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/css/main.css';
    link.onload = resolve;
    link.onerror = () => reject(new Error('css/main.css failed to load'));
    document.head.appendChild(link);
});

const settle = async () => { await nextTick(); await new Promise((resolve) => setTimeout(resolve, 0)); await nextTick(); };
const text = (host, selector) => host.querySelector(selector)?.textContent.trim() ?? null;

async function mount(props) {
    const host = document.createElement('div');
    host.style.cssText = 'position: relative; width: 900px; height: 600px;';
    document.body.appendChild(host);
    let panel = null;
    const app = createApp({
        components: { WorldSayPanel },
        data: () => ({ props }),
        mounted() { panel = this.$refs.panel; },
        template: '<WorldSayPanel ref="panel" v-bind="props" />'
    });
    app.mount(host);
    await settle();
    return { host, panel: () => panel, unmount: () => { app.unmount(); host.remove(); } };
}

function type(input, value) {
    input.value = value;
    input.dispatchEvent(new Event('input'));
}

// Saying a line, and the log.
{
    const said = [];
    const view = await mount({
        log: [
            { sayId: '1', who: 'Sam', text: 'over here', own: false, heard: true },
            { sayId: '2', who: t('worldSay.you'), text: 'coming!', own: true, heard: true }
        ],
        sayLine: (line) => { said.push(line); return { said: true, heard: true, refusal: null }; }
    });
    try {
        const lines = [...view.host.querySelectorAll('.world-say-line')];
        assert(lines.length === 2 && text(lines[0], '.world-say-who') === 'Sam' && text(lines[0], '.world-say-text') === 'over here',
            'the log shows each line by whom');
        assert(lines[1].classList.contains('world-say-line--own') && !lines[1].querySelector('.world-say-only-you'), 'your own, heard, plainly');
        assert(view.host.querySelector('.world-say-log').getAttribute('aria-live') === 'polite', 'a screen reader hears new lines');
        const box = view.host.querySelector('.world-say').getBoundingClientRect();
        assert(box.left - view.host.getBoundingClientRect().left < 40 && box.bottom < view.host.getBoundingClientRect().bottom, 'at the bottom left, above the foot of the view');

        view.host.querySelector('.world-say-open').click();
        await settle();
        const input = view.host.querySelector('.world-say-input');
        assert(input && document.activeElement === input, 'Say opens a line to type, ready to type into');
        assert(input.maxLength === 140, 'at most 140 characters');
        type(input, 'look at this tower!');
        view.host.querySelector('.world-say-form').dispatchEvent(new Event('submit', { cancelable: true }));
        await settle();
        assert(said.join() === 'look at this tower!' && !view.host.querySelector('.world-say-input'), 'Enter says it, and the line closes');

        view.panel().open();
        await settle();
        view.host.querySelector('.world-say-input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await settle();
        assert(!view.host.querySelector('.world-say-input') && said.length === 1, 'Escape closes it, saying nothing');
        console.log('✓ the log shows who said what, and Say says a line');
    } finally {
        view.unmount();
    }
}

// When a line can't be said, or isn't heard.
{
    let answer = { said: false, heard: false, refusal: 'too-soon' };
    const view = await mount({
        log: [{ sayId: '1', who: t('worldSay.you'), text: 'anyone?', own: true, heard: false }],
        sayLine: () => answer
    });
    try {
        assert(text(view.host, '.world-say-only-you') === t('worldSay.onlyYouShort'), 'a line nobody else heard says so');
        view.panel().open();
        await settle();
        type(view.host.querySelector('.world-say-input'), 'again');
        view.host.querySelector('.world-say-form').dispatchEvent(new Event('submit', { cancelable: true }));
        await settle();
        assert(text(view.host, '.world-say-note') === t('worldSay.tooSoon') && view.host.querySelector('.world-say-input'), 'too soon: it says so and keeps the line');
        answer = { said: true, heard: false, refusal: null };
        view.host.querySelector('.world-say-form').dispatchEvent(new Event('submit', { cancelable: true }));
        await settle();
        assert(text(view.host, '.world-say-note') === t('worldSay.onlyYou'), 'said with your avatar hidden: only you saw it, and where to change that');
        console.log('✓ a refused or unheard line says why');
    } finally {
        view.unmount();
    }
}

// A guest is asked for a name.
{
    const view = await mount({ log: [], guest: true, sayLine: () => { throw new Error('a guest never says'); } });
    try {
        assert(!view.host.querySelector('.world-say-log'), 'no lines, no log');
        view.host.querySelector('.world-say-open').click();
        await settle();
        const input = view.host.querySelector('.world-say-input');
        assert(input.disabled && input.placeholder === t('worldSay.guestPlaceholder') && text(view.host, '.world-say-note') === t('worldSay.guest'),
            'a guest is told to choose a name first');
        console.log('✓ a guest is asked to choose a name');
    } finally {
        view.unmount();
    }
}

// Enter in World View opens it; not on a button, and not while typing.
{
    let opened = 0;
    const { onKeyDown } = useViewportInput({
        compassHeading: { value: null }, goHome() {}, onAvatarKeyDown: () => false, onSoundKeyDown: () => false,
        openSay: () => { opened += 1; }, redoAction() {}, refreshHoverUI() {}, refreshSpatialUI() {}, session: {}, undoAction() {}
    });
    const press = (target, init = {}) => {
        const event = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true, ...init });
        Object.defineProperty(event, 'target', { value: target });
        onKeyDown(event);
        return event;
    };
    const canvas = document.createElement('canvas');
    const button = document.createElement('button');
    const field = document.createElement('input');
    document.body.append(canvas, button, field);
    try {
        assert(press(canvas).defaultPrevented && opened === 1, 'Enter over the World opens Say');
        press(button);
        press(field);
        press(canvas, { shiftKey: true });
        press(canvas, { repeat: true });
        assert(opened === 1, 'but not on a focused button, in a text field, with Shift, or held down');
        console.log('✓ Enter in World View opens Say');
    } finally {
        canvas.remove();
        button.remove();
        field.remove();
    }
}

console.log('✅ All World Say panel tests passed.');
