import { t } from '../../i18n/i18n.js';

// Who is building this with you (ui/views/editorView/useBuildTogether.js):
// over the Editor's viewport, each co-builder in their own colour, that
// Undo is paused, and the way to the link, Stop (the host) or Leave (a
// friend).
export default {
    name: 'BuildTogetherStrip',
    props: {
        // 'host' or 'guest'.
        role: { type: String, required: true },
        title: { type: String, default: '' },
        // [{ identityId, name, online, color }]
        people: { type: Array, default: () => [] },
        sharing: { type: Boolean, default: false }
    },
    emits: ['link', 'stop', 'leave'],
    setup() {
        function personText(person) {
            const name = person.name || t('walkTogether.someone');
            return person.online ? name : t('buildTogether.strip.away', { name });
        }
        const css = (color) => `#${Number(color || 0).toString(16).padStart(6, '0')}`;
        return { t, personText, css };
    },
    template: `
        <div class="build-together-strip" role="status">
            <span class="build-together-strip-title">{{ title }}</span>
            <ul v-if="people.length" class="build-together-people">
                <li v-for="person in people" :key="person.identityId" :class="['build-together-person', { 'build-together-person--away': !person.online }]">
                    <span class="build-together-dot" :style="{ background: css(person.color) }" aria-hidden="true"></span>{{ personText(person) }}
                </li>
            </ul>
            <span v-if="sharing" class="build-together-undo-note">{{ t('buildTogether.strip.undoPaused') }}</span>
            <span class="build-together-strip-actions">
                <button v-if="role === 'host'" type="button" class="action-btn build-together-link-btn" @click="$emit('link')">{{ t('buildTogether.strip.link') }}</button>
                <button v-if="role === 'host'" type="button" class="action-btn build-together-stop" @click="$emit('stop')">{{ t('buildTogether.strip.stop') }}</button>
                <button v-if="role === 'guest'" type="button" class="action-btn build-together-leave" @click="$emit('leave')">{{ t('buildTogether.strip.leave') }}</button>
            </span>
        </div>
    `
};
