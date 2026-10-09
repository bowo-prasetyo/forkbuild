import { computed, inject, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { DevicePairingStatus } from '../../application/devicePairing/DevicePairing.js';
import { devicePairingLink } from '../../core/DevicePairingCode.js';
import QrCodeImage from '../components/QrCodeImage.js';
import { devicePairingFailureText } from '../components/devicePairing/devicePairingText.js';
import { backupGroupRows } from '../i18n/backupGroupLabel.js';
import { t } from '../i18n/i18n.js';

// Copy to another device: shows a one-off code (a QR code and its link) as
// soon as it opens, which another device opens to copy everything on this one
// (application/devicePairing/DevicePairing.js). The code works while this
// page stays open, for one device and ten minutes.
export default {
    name: 'DevicePairingView',
    components: { QrCodeImage },
    setup() {
        const devicePairing = inject('devicePairing', null);
        const appUrl = inject('appUrl', () => window.location.href);
        const sender = shallowRef(null);
        const state = ref(null);
        const copied = ref(false);
        let unsubscribe = null;

        function stop() {
            if (unsubscribe) unsubscribe();
            unsubscribe = null;
            if (sender.value) sender.value.close();
            sender.value = null;
        }

        async function showCode() {
            stop();
            copied.value = false;
            const next = devicePairing.createSender();
            sender.value = next;
            state.value = next.state;
            unsubscribe = next.onChange((changed) => { state.value = changed; });
            await next.start();
        }

        // Opening the page is the request: the code shows straight away.
        onMounted(() => { if (devicePairing && devicePairing.available) showCode(); });
        onBeforeUnmount(stop);

        const link = computed(() => (state.value && state.value.code ? devicePairingLink(state.value.code, appUrl()) : ''));
        const expiresText = computed(() => (state.value && state.value.expiresAt
            ? state.value.expiresAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : ''));
        const sentRows = computed(() => (state.value && state.value.groups ? backupGroupRows(state.value.groups) : []));

        async function copyLink() {
            try {
                await navigator.clipboard.writeText(link.value);
                copied.value = true;
            } catch {
                copied.value = false;
            }
        }

        return {
            t,
            available: Boolean(devicePairing && devicePairing.available),
            state, link, expiresText, sentRows, copied,
            showCode, copyLink,
            failureText: () => devicePairingFailureText(state.value && state.value.failure),
            Status: DevicePairingStatus
        };
    },
    template: `
        <section class="your-data-view device-pairing-view">
            <h1>{{ t('devicePairing.title') }}</h1>
            <p class="form-hint form-hint--neutral">{{ t('devicePairing.intro') }}</p>
            <p class="form-hint">{{ t('devicePairing.warning') }}</p>

            <p v-if="!available" class="identity-unlock-error">{{ t('devicePairing.unavailable') }}</p>

            <div v-else class="your-data-section device-pairing-panel">
                <template v-if="state && (state.status === Status.EXPIRED || state.status === Status.FAILED || state.status === Status.SENT)">
                    <p v-if="state && state.status === Status.EXPIRED" class="form-hint device-pairing-expired">{{ t('devicePairing.expired') }}</p>
                    <p v-if="state && state.status === Status.FAILED" class="identity-unlock-error device-pairing-failed">{{ failureText() }}</p>
                    <div v-if="state && state.status === Status.SENT" class="identity-import-result device-pairing-sent">
                        <p>{{ t('devicePairing.sent') }}</p>
                        <ul>
                            <li v-for="row in sentRows" :key="row.group">{{ row.label }}: {{ row.count }}</li>
                        </ul>
                    </div>
                    <button type="button" class="action-btn action-btn--primary device-pairing-show" @click="showCode">
                        {{ state.status === Status.FAILED ? t('devicePairing.tryAgain') : t('devicePairing.showNewCode') }}
                    </button>
                </template>

                <p v-else-if="!state || state.status === Status.STARTING" class="form-hint form-hint--neutral device-pairing-starting" role="status">{{ t('devicePairing.starting') }}</p>

                <template v-else-if="state.status === Status.WAITING">
                    <p class="form-hint form-hint--neutral">{{ t('devicePairing.scan') }}</p>
                    <QrCodeImage :text="link" :label="t('devicePairing.qrLabel')" />
                    <div class="device-pairing-link">
                        <input class="modal-input device-pairing-link-url" readonly :value="link" :aria-label="t('devicePairing.linkLabel')" @focus="$event.target.select()">
                        <button type="button" class="action-btn action-btn--secondary device-pairing-copy" @click="copyLink">
                            {{ copied ? t('devicePairing.copied') : t('devicePairing.copyLink') }}
                        </button>
                    </div>
                    <p class="form-hint form-hint--neutral device-pairing-expiry">{{ t('devicePairing.worksUntil', { time: expiresText }) }}</p>
                </template>

                <p v-else-if="state.status === Status.SENDING" class="form-hint form-hint--neutral device-pairing-sending" role="status">{{ t('devicePairing.sending') }}</p>
            </div>

        </section>
    `
};
