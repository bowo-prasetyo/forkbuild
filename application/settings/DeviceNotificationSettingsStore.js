// Keeps whether this browser shows ForkBuild's notifications through the
// operating system (core/DeviceNotifications.js). Personal and local: never
// published, shared or part of any World.
import { StorageProvider } from '../../storage/StorageProvider.js';
import { normalizeDeviceNotificationSettings } from '../../core/DeviceNotifications.js';

const STORAGE_KEY = 'device-notification-settings';

export class DeviceNotificationSettingsStore {
    constructor({ storageProvider }) {
        if (!(storageProvider instanceof StorageProvider)) {
            throw new Error('DeviceNotificationSettingsStore requires a StorageProvider');
        }
        this._storage = storageProvider;
    }

    get() {
        try {
            return normalizeDeviceNotificationSettings(this._storage.load(STORAGE_KEY));
        } catch {
            return normalizeDeviceNotificationSettings(null);
        }
    }

    setEnabled(enabled) {
        const settings = normalizeDeviceNotificationSettings({ enabled: enabled === true });
        this._storage.save(STORAGE_KEY, { enabled: settings.enabled });
        return settings;
    }
}
