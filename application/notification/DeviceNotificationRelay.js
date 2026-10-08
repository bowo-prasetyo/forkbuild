import { DeviceNotificationState, deviceNotificationState, selectNotificationsToShow } from '../../core/DeviceNotifications.js';

// Shows the signed-in identity's new notifications through the operating
// system while ForkBuild is open but not in view (core/DeviceNotifications.js).
// It only reads what the notification store already holds, so every producer
// (new work from someone followed, a remix of one of your builds, a comment)
// is covered without knowing about it, and nothing new is stored or sent.
//
// start() takes what is stored now as already seen; check() shows what has
// arrived since. The caller checks after something may have arrived and on a
// timer. Never throws: a notification that can't be shown must not stop
// anything else.
export class DeviceNotificationRelay {
    // recipient(): the signed-in identity's id, or null; when it changes,
    // what that identity already had is taken as seen, as at start().
    // loadEvents(): the recipient's NotificationEvents (none when signed out).
    // settings(): this device's choice. permission(): the browser's
    // (core/DeviceNotifications.js, DeviceNotificationPermission).
    // isVisible(): whether ForkBuild is on screen, when nothing is shown.
    // describe(event): `{ title, body, path }`, or null for an event that
    // can't be put into words. show(described, event): shows it.
    constructor({ recipient, loadEvents, settings, permission, isVisible, describe, show }) {
        for (const [name, value] of Object.entries({ recipient, loadEvents, settings, permission, isVisible, describe, show })) {
            if (typeof value !== 'function') throw new Error(`DeviceNotificationRelay: ${name} is required`);
        }
        this._recipient = recipient;
        this._watching = undefined;
        this._loadEvents = loadEvents;
        this._settings = settings;
        this._permission = permission;
        this._isVisible = isVisible;
        this._describe = describe;
        this._show = show;
        this._seen = new Set();
    }

    start() {
        this._watching = this._currentRecipient();
        for (const event of this._events()) this._seen.add(event.notificationId);
    }

    // Returns how many were shown.
    check() {
        if (this._currentRecipient() !== this._watching) {
            this.start();
            return 0;
        }
        const events = this._events();
        const fresh = selectNotificationsToShow({ events, seenIds: this._seen });
        // Everything stored now has been seen from here on, shown or not: a
        // burst beyond what is shown at once stays in the bell's history.
        for (const event of events) this._seen.add(event.notificationId);
        let state;
        try {
            state = deviceNotificationState({ settings: this._settings(), permission: this._permission() });
        } catch {
            return 0;
        }
        if (state !== DeviceNotificationState.ON || this._visible()) return 0;
        let shown = 0;
        for (const event of fresh) {
            try {
                const described = this._describe(event);
                if (!described) continue;
                Promise.resolve(this._show(described, event)).catch(() => {});
                shown++;
            } catch {
                // The next one may still be shown.
            }
        }
        return shown;
    }

    _currentRecipient() {
        try {
            return this._recipient() ?? null;
        } catch {
            return null;
        }
    }

    _events() {
        try {
            const events = this._loadEvents();
            return Array.isArray(events) ? events.filter((event) => event && typeof event.notificationId === 'string') : [];
        } catch {
            return [];
        }
    }

    _visible() {
        try {
            return this._isVisible() === true;
        } catch {
            return false;
        }
    }
}
