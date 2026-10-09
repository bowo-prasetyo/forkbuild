import { computed, inject, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { DevicePairingFailure, DevicePairingStatus } from '../../application/devicePairing/DevicePairing.js';
import { devicePairingFailureText } from '../components/devicePairing/devicePairingText.js';
import { backupGroupRows } from '../i18n/backupGroupLabel.js';
import { byteSizeText } from '../i18n/sizeText.js';
import { t } from '../i18n/i18n.js';

// Opened from a pairing link (/pair/<code>): connects to the device showing
// the code, receives everything on it, shows what arrived, and adds it to
// this device when the person says so (application/devicePairing/
// DevicePairing.js). Adding keeps everything already here.
export default {
    name: 'DevicePairingReceiveView',
    setup() {
        const route = useRoute();
        const router = useRouter();
        const devicePairing = inject('devicePairing', null);
        const reloadPage = inject('reloadPage', () => window.location.reload());
        const receiver = shallowRef(null);
        const state = ref(null);
        let unsubscribe = null;

        function stop() {
            if (unsubscribe) unsubscribe();
            unsubscribe = null;
            if (receiver.value) receiver.value.close();
            receiver.value = null;
        }

        async function connect() {
            stop();
            const next = devicePairing.createReceiver(String(route.params.code || ''));
            receiver.value = next;
            state.value = next.state;
            unsubscribe = next.onChange((changed) => { state.value = changed; });
            await next.start();
        }

        onMounted(() => { if (devicePairing) connect(); });
        onBeforeUnmount(stop);

        async function add() {
            if (!receiver.value) return;
            const result = await receiver.value.add();
            if (!result) return;
            // Stores keep in-memory copies read at start, so the app starts
            // again on what was added, from the home page rather than this
            // spent link.
            await router.replace('/');
            reloadPage();
        }

        const rows = computed(() => (state.value && state.value.groups ? backupGroupRows(state.value.groups) : []));
        const progressText = computed(() => {
            const current = state.value;
            if (!current || current.status !== DevicePairingStatus.RECEIVING) return '';
            return t('devicePairing.receivingProgress', { received: byteSizeText(current.receivedLength), total: byteSizeText(current.totalLength) });
        });

        return {
            t,
            available: Boolean(devicePairing && devicePairing.available),
            state, rows, progressText,
            connect, add,
            notNow: () => { stop(); router.replace('/'); },
            failureText: () => devicePairingFailureText(state.value && state.value.failure),
            // A code serves one connection, so only a server that couldn't be reached
            // is worth trying again with the same link.
            canRetry: () => Boolean(state.value && state.value.failure === DevicePairingFailure.UNREACHABLE),
            Status: DevicePairingStatus
        };
    },
    template: `
        <section class="your-data-view device-pairing-receive-view">
            <h1>{{ t('devicePairing.receiveTitle') }}</h1>
            <p class="form-hint form-hint--neutral">{{ t('devicePairing.receiveIntro') }}</p>

            <p v-if="!available" class="identity-unlock-error">{{ t('devicePairing.unavailable') }}</p>

            <div v-else-if="state" class="your-data-section device-pairing-panel">
                <p v-if="state.status === Status.STARTING || state.status === Status.CONNECTING" class="form-hint form-hint--neutral device-pairing-connecting" role="status">
                    {{ t('devicePairing.connecting') }}
                </p>
                <p v-else-if="state.status === Status.RECEIVING" class="form-hint form-hint--neutral device-pairing-receiving" role="status">
                    {{ progressText }}
                </p>

                <template v-else-if="state.status === Status.RECEIVED || state.status === Status.ADDING">
                    <p>{{ t('devicePairing.arrived') }}</p>
                    <table class="your-data-table device-pairing-arrived">
                        <tbody>
                            <tr v-for="row in rows" :key="row.group">
                                <td>{{ row.label }}</td>
                                <td class="your-data-count">{{ t('yourDataView.entryCount', { count: row.count }) }}</td>
                            </tr>
                        </tbody>
                    </table>
                    <p class="form-hint form-hint--neutral">{{ t('devicePairing.addKeeps') }}</p>
                    <div class="your-data-buttons">
                        <button type="button" class="action-btn action-btn--primary device-pairing-add" :disabled="state.status === Status.ADDING" @click="add">
                            {{ state.status === Status.ADDING ? t('devicePairing.adding') : t('devicePairing.add') }}
                        </button>
                        <button type="button" class="action-btn action-btn--secondary device-pairing-not-now" :disabled="state.status === Status.ADDING" @click="notNow">
                            {{ t('devicePairing.notNow') }}
                        </button>
                    </div>
                </template>

                <p v-else-if="state.status === Status.ADDED" class="form-hint form-hint--neutral device-pairing-added" role="status">{{ t('devicePairing.added') }}</p>

                <template v-else-if="state.status === Status.FAILED">
                    <p class="identity-unlock-error device-pairing-failed">{{ failureText() }}</p>
                    <button v-if="canRetry()" type="button" class="action-btn action-btn--secondary device-pairing-retry" @click="connect">
                        {{ t('devicePairing.tryAgain') }}
                    </button>
                </template>
            </div>
        </section>
    `
};
