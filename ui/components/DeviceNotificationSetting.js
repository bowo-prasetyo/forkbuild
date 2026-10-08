import { inject, ref } from 'vue';
import { DeviceNotificationPermission, DeviceNotificationState, deviceNotificationState } from '../../core/DeviceNotifications.js';
import { t } from '../i18n/i18n.js';

// "Notify me on this device", at the top of the bell's history: shows the
// signed-in identity's new notifications through the operating system while
// ForkBuild is open but not in view (core/DeviceNotifications.js). Off until
// turned on here; turning it on asks the browser. Needs
// `deviceNotificationSettingsStore` (ui/main.js); without one it shows nothing.
export function browserNotificationPermission() {
    if (typeof Notification !== 'function') return DeviceNotificationPermission.UNSUPPORTED;
    const permission = Notification.permission;
    return Object.values(DeviceNotificationPermission).includes(permission) ? permission : DeviceNotificationPermission.DEFAULT;
}

export default {
    name: 'DeviceNotificationSetting',
    setup() {
        const store = inject('deviceNotificationSettingsStore', null);
        const state = ref(store ? deviceNotificationState({ settings: store.get(), permission: browserNotificationPermission() }) : null);
        const busy = ref(false);

        function refresh() {
            state.value = deviceNotificationState({ settings: store.get(), permission: browserNotificationPermission() });
        }

        async function turnOn() {
            busy.value = true;
            try {
                let permission = browserNotificationPermission();
                if (permission === DeviceNotificationPermission.DEFAULT) {
                    permission = await Notification.requestPermission();
                }
                store.setEnabled(permission === DeviceNotificationPermission.GRANTED);
            } catch {
                // Left as it was; refresh() shows what the browser decided.
            } finally {
                busy.value = false;
                refresh();
            }
        }

        function turnOff() {
            store.setEnabled(false);
            refresh();
        }

        return { t, state, busy, turnOn, turnOff, DeviceNotificationState };
    },
    template: `
        <section v-if="state" class="device-notification-setting" :data-state="state">
            <template v-if="state === DeviceNotificationState.ON">
                <p class="device-notification-status">{{ t('deviceNotifications.on') }}</p>
                <button type="button" class="action-btn action-btn--secondary device-notification-off" @click="turnOff">{{ t('deviceNotifications.turnOff') }}</button>
            </template>
            <template v-else-if="state === DeviceNotificationState.OFF">
                <button type="button" class="action-btn device-notification-on" :disabled="busy" @click="turnOn">{{ t('deviceNotifications.turnOn') }}</button>
            </template>
            <p v-else-if="state === DeviceNotificationState.BLOCKED" class="device-notification-status">{{ t('deviceNotifications.blocked') }}</p>
            <p v-else class="device-notification-status">{{ t('deviceNotifications.unsupported') }}</p>
            <p v-if="state !== DeviceNotificationState.UNSUPPORTED" class="device-notification-hint">{{ t('deviceNotifications.hint') }}</p>
        </section>
    `
};
