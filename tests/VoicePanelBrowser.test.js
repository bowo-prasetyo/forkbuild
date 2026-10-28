// @environment browser
import { createApp, h, nextTick } from 'vue';
import VoicePanel from '../ui/components/VoicePanel.js';
import { setAppLocale, t } from '../ui/i18n/i18n.js';
import { assert } from './support/Assert.js';

// Voice building's first ask (ui/components/VoicePanel.js), rendered by real
// Vue: in a language the speech model isn't measured to hear well
// (core/voice/Transcript.js#voiceHearsWell()), it says so before anything is
// downloaded; in English it doesn't.

async function intro(code) {
    await setAppLocale(code);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp({ render: () => h(VoicePanel, { voice: { step: 'intro' }, place: 'editor' }) });
    app.mount(host);
    await nextTick();
    const note = host.querySelector('.editor-voice-language');
    const text = note ? note.textContent.trim() : null;
    app.unmount();
    host.remove();
    return text;
}

assert(await intro('en') === null, '1. in English, nothing more is said');
for (const code of ['de', 'ja', 'pt-BR']) {
    const note = await intro(code);
    assert(note && note === t('voice.languageNote'), `2. in ${code}, the first ask says voice hears English best (${note})`);
}
await setAppLocale('en');
console.log('✅ All voice panel tests passed.');
