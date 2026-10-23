import { computed, nextTick, ref } from 'vue';
import { MAX_SAY_CHARACTERS } from '../../core/avatar/AvatarSay.js';
import { t } from '../i18n/i18n.js';

// Saying something aloud in World View (core/avatar/AvatarSay.js): the last
// few lines said, by whom, and Say, which opens a short line to type (Enter
// in World View opens it too; Enter sends, Escape closes). The line shows in a
// bubble over your avatar for whoever may see it. `sayLine` is the session's
// sayAloud(); its answer says whether the line was said, heard by others, or
// why not.
const REFUSAL_KEYS = Object.freeze({
    guest: 'worldSay.guest',
    'no-avatar': 'worldSay.noAvatar',
    'too-soon': 'worldSay.tooSoon'
});

export default {
    name: 'WorldSayPanel',
    props: {
        // { sayId, who, text, own, heard }, oldest first.
        log: { type: Array, default: () => [] },
        guest: { type: Boolean, default: false },
        sayLine: { type: Function, required: true }
    },
    setup(props, { expose }) {
        const typing = ref(false);
        const draft = ref('');
        const note = ref('');
        const input = ref(null);

        function open() {
            note.value = props.guest ? t('worldSay.guest') : '';
            typing.value = true;
            nextTick(() => input.value?.focus());
        }

        function close() {
            typing.value = false;
            draft.value = '';
            input.value?.blur();
        }

        function send() {
            const result = props.sayLine(draft.value);
            if (result.said) {
                note.value = result.heard ? '' : t('worldSay.onlyYou');
                close();
                return;
            }
            if (result.refusal === 'empty') {
                close();
                return;
            }
            note.value = REFUSAL_KEYS[result.refusal] ? t(REFUSAL_KEYS[result.refusal]) : '';
        }

        const placeholder = computed(() => (props.guest ? t('worldSay.guestPlaceholder') : t('worldSay.placeholder')));
        expose({ open });
        return { t, typing, draft, note, input, open, close, send, placeholder, maxLength: MAX_SAY_CHARACTERS };
    },
    template: `
        <div class="world-say" @keydown.stop>
            <ol v-if="log.length" class="world-say-log" aria-live="polite" :aria-label="t('worldSay.logLabel')">
                <li v-for="entry in log" :key="entry.sayId" :class="['world-say-line', { 'world-say-line--own': entry.own }]">
                    <span class="world-say-who">{{ entry.who }}</span>
                    <span class="world-say-text">{{ entry.text }}</span>
                    <span v-if="entry.own && !entry.heard" class="world-say-only-you">{{ t('worldSay.onlyYouShort') }}</span>
                </li>
            </ol>
            <form v-if="typing" class="world-say-form" @submit.prevent="send">
                <input
                    ref="input"
                    v-model="draft"
                    type="text"
                    class="form-input world-say-input"
                    :placeholder="placeholder"
                    :aria-label="t('worldSay.inputLabel')"
                    :maxlength="maxLength"
                    :disabled="guest"
                    enterkeyhint="send"
                    autocomplete="off"
                    @keydown.esc.prevent="close"
                />
                <button type="submit" class="action-btn action-btn--primary world-say-send" :disabled="guest">{{ t('worldSay.send') }}</button>
                <button type="button" class="action-btn world-say-close" :aria-label="t('worldSay.close')" @click="close">✕</button>
            </form>
            <button v-else type="button" class="action-btn world-say-open" :title="t('worldSay.openHint')" @click="open"><span aria-hidden="true">💬</span> {{ t('worldSay.open') }}</button>
            <p v-if="note" class="world-say-note" role="status">{{ note }}</p>
        </div>
    `
};
