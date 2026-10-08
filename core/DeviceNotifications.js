// Notifications on this device (docs/Principles.md, "A Notification Leaves
// The Page Only Because Its Reader Asked, And Only On This Device"): the
// notifications ForkBuild already keeps for the signed-in identity
// (storage/NotificationEventStore.js), also shown by the operating system
// while ForkBuild is open in a background tab or as an installed app. Off
// until turned on. Nothing is sent anywhere: there is no push service, so a
// closed ForkBuild shows nothing.
//
// Pure decisions only; application/notification/DeviceNotificationRelay.js
// does the showing.

// This device's choice. Off unless turned on; read leniently.
export function normalizeDeviceNotificationSettings(value) {
    const source = value && typeof value === 'object' ? value : {};
    return Object.freeze({ enabled: source.enabled === true });
}

// What the browser lets a page do, as `Notification.permission` says, plus
// 'unsupported' where there is no Notification API at all.
export const DeviceNotificationPermission = Object.freeze({
    DEFAULT: 'default',
    GRANTED: 'granted',
    DENIED: 'denied',
    UNSUPPORTED: 'unsupported'
});

// The state the setting shows: on only when both the person and the browser
// said yes.
export const DeviceNotificationState = Object.freeze({
    ON: 'on',
    OFF: 'off',
    BLOCKED: 'blocked',
    UNSUPPORTED: 'unsupported'
});

export function deviceNotificationState({ settings, permission }) {
    if (permission === DeviceNotificationPermission.UNSUPPORTED) return DeviceNotificationState.UNSUPPORTED;
    if (permission === DeviceNotificationPermission.DENIED) return DeviceNotificationState.BLOCKED;
    return normalizeDeviceNotificationSettings(settings).enabled && permission === DeviceNotificationPermission.GRANTED
        ? DeviceNotificationState.ON
        : DeviceNotificationState.OFF;
}

// At most this many are shown at once; the rest are in the bell's history.
export const MAX_SHOWN_AT_ONCE = 3;

// Of `events` (the recipient's NotificationEvents), the ones to show now:
// those not seen before (`seenIds`: what was stored when this page started
// watching, so it never pops up again, and what was shown since), oldest
// first, at most MAX_SHOWN_AT_ONCE. When it arrived, not when it happened,
// decides: a comment made last week and received now is new here.
export function selectNotificationsToShow({ events, seenIds }) {
    return (Array.isArray(events) ? events : [])
        .filter((event) => event && typeof event.notificationId === 'string' && !seenIds.has(event.notificationId))
        .sort((a, b) => time(a) - time(b))
        .slice(0, MAX_SHOWN_AT_ONCE);
}

function time(event) {
    const value = new Date(event.createdAt).getTime();
    return Number.isFinite(value) ? value : 0;
}
