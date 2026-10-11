import { computed, ref, watch } from 'vue';
import { WalkTogetherGuestStatus, WalkTogetherStatus } from '../../../application/walkTogether/WalkTogether.js';
import QrCodeImage from '../QrCodeImage.js';
import { walkTogetherFailureText } from './walkTogetherText.js';
import { t } from '../../i18n/i18n.js';

// World View's "Walk here with me" dialog (ui/views/worldView/useWalkTogether.js
// owns the link): the link to send, as text and a QR code, until when it
// works, and who has come through it.
export default {
    name: 'WalkTogetherDialog',
    components: { QrCodeImage },
    props: {
        state: { type: Object, default: null },
        link: { type: String, default: '' },
        available: { type: Boolean, default: false },
        needsPublish: { type: Boolean, default: false }
    },
    emits: ['retry', 'stop', 'close'],
    setup(props) {
        const copied = ref(false);
        watch(() => props.link, () => { copied.value = false; });
        const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

        async function copyLink() {
            try {
                await navigator.clipboard.writeText(props.link);
                copied.value = true;
            } catch {
                copied.value = false;
            }
        }

        async function shareLink() {
            try {
                await navigator.share({ title: t('walkTogether.title'), url: props.link });
            } catch {
                // Cancelled, or the share sheet refused: the link is still shown.
            }
        }

        const expiresText = computed(() => (props.state && props.state.expiresAt
            ? props.state.expiresAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : ''));

        function guestText(guest) {
            const name = guest.name || t('walkTogether.someone');
            if (guest.status === WalkTogetherGuestStatus.JOINED) return t('walkTogether.guest.joined', { name });
            if (guest.status === WalkTogetherGuestStatus.FAILED) return t('walkTogether.guest.failed', { name });
            return t('walkTogether.guest.arriving', { name });
        }

        return {
            t, copied, canShare, copyLink, shareLink, expiresText, guestText,
            failureText: () => walkTogetherFailureText(props.state && props.state.failure),
            Status: WalkTogetherStatus
        };
    },
    template: `
        <div role="dialog" :aria-label="t('walkTogether.title')" class="modal-overlay" @click.self="$emit('close')">
            <div class="modal-panel walk-together-dialog">
                <h3>{{ t('walkTogether.title') }}</h3>
                <p v-if="!available" class="walk-together-note">{{ t('walkTogether.unavailable') }}</p>
                <p v-else-if="needsPublish" class="walk-together-note">{{ t('walkTogether.needsPublish') }}</p>
                <template v-else-if="state && state.status === Status.WAITING">
                    <p class="walk-together-lead">{{ t('walkTogether.lead') }}</p>
                    <QrCodeImage :text="link" :label="t('walkTogether.qrLabel')" />
                    <input class="walk-together-link" type="text" readonly :value="link" :aria-label="t('walkTogether.linkLabel')" @focus="$event.target.select()" />
                    <div class="walk-together-actions">
                        <button v-if="canShare" type="button" class="action-btn action-btn--primary walk-together-share" @click="shareLink">{{ t('walkTogether.share') }}</button>
                        <button type="button" :class="['action-btn', canShare ? 'action-btn--secondary' : 'action-btn--primary', 'walk-together-copy']" @click="copyLink">
                            {{ copied ? t('walkTogether.copied') : t('walkTogether.copy') }}
                        </button>
                    </div>
                    <p class="walk-together-lasts">{{ t('walkTogether.lasts', { time: expiresText }) }}</p>
                    <ul v-if="state.guests.length" class="walk-together-guests">
                        <li v-for="guest in state.guests" :key="guest.id" :class="'walk-together-guest walk-together-guest--' + guest.status">{{ guestText(guest) }}</li>
                    </ul>
                    <p v-else class="walk-together-nobody">{{ t('walkTogether.nobodyYet') }}</p>
                </template>
                <p v-else-if="!state || state.status === Status.EXPIRED" class="walk-together-note">{{ t('walkTogether.expired') }}</p>
                <p v-else-if="state && state.status === Status.FAILED" class="walk-together-note walk-together-failure" role="alert">{{ failureText() }}</p>
                <p v-else-if="state" class="walk-together-note">{{ t('walkTogether.starting') }}</p>
                <div class="modal-actions">
                    <button
                        v-if="available && !needsPublish && (!state || state.status === Status.EXPIRED || state.status === Status.FAILED)"
                        type="button"
                        class="action-btn action-btn--primary walk-together-retry"
                        @click="$emit('retry')"
                    >{{ state && state.status === Status.FAILED ? t('walkTogether.tryAgain') : t('walkTogether.newLink') }}</button>
                    <button
                        v-if="state && state.status === Status.WAITING"
                        type="button"
                        class="action-btn walk-together-stop"
                        @click="$emit('stop')"
                    >{{ t('walkTogether.stop') }}</button>
                    <button type="button" class="action-btn walk-together-close" @click="$emit('close')">{{ t('walkTogether.close') }}</button>
                </div>
            </div>
        </div>
    `
};
