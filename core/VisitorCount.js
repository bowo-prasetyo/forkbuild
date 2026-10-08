// The daily visitor count (docs/Privacy.md, "Visitor count"): at most once a
// day, the official site tells a counter that one more browser opened
// ForkBuild. The hit names no page, document or person and carries no
// referrer; the counter keeps only totals, which anyone can see.
//
// Pure decisions only. Sending the hit is the caller's job
// (application/settings/CountDailyVisit.js).

// Only the official site counts, so a copy hosted elsewhere, and a
// developer's localhost, never adds to its numbers.
export const VISITOR_COUNT_SITE_ORIGIN = 'https://bowo-prasetyo.github.io';
// GoatCounter's no-JavaScript endpoint, and its public dashboard.
export const VISITOR_COUNT_ENDPOINT = 'https://forkbuild.goatcounter.com/count';
export const VISITOR_COUNT_DASHBOARD_URL = 'https://forkbuild.goatcounter.com/';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

// This device's choice and when it last counted. On unless turned off; read
// leniently, so a damaged value counts at most once more rather than breaking
// startup.
export function normalizeVisitorCountSettings(value) {
    const source = value && typeof value === 'object' ? value : {};
    return Object.freeze({
        enabled: source.enabled !== false,
        lastCountedDay: typeof source.lastCountedDay === 'string' && DAY.test(source.lastCountedDay) ? source.lastCountedDay : null
    });
}

export const DEFAULT_VISITOR_COUNT_SETTINGS = normalizeVisitorCountSettings({});

// The calendar day on this device, as YYYY-MM-DD.
export function localDayOf(date) {
    const pad = (number) => String(number).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Global Privacy Control, or Do Not Track, asks sites not to track: honored
// as a standing "don't count me", whatever the setting says.
export function asksNotToBeTracked({ globalPrivacyControl, doNotTrack } = {}) {
    return globalPrivacyControl === true || doNotTrack === '1' || doNotTrack === 'yes';
}

export function shouldCountVisit({ settings, day, origin, privacySignals }) {
    const current = normalizeVisitorCountSettings(settings);
    return origin === VISITOR_COUNT_SITE_ORIGIN
        && current.enabled
        && !asksNotToBeTracked(privacySignals)
        && current.lastCountedDay !== day;
}

// Always the same path, so the counter learns nothing about where in the app
// the visit went; `rnd` only keeps a cached image from swallowing the hit.
export function visitorCountHitUrl(random) {
    return `${VISITOR_COUNT_ENDPOINT}?p=%2F&rnd=${encodeURIComponent(random)}`;
}

// The few moments the counter also hears about, each as its own fixed path
// (docs/Privacy.md, "Visitor count"): a share link copied or shared, a shared
// link opened, a build opened from a link then copied into the Editor, and
// ForkBuild installed as an app.
// Nothing about the build, the link or the person is part of the path.
export const FunnelEvent = Object.freeze({
    SHARE_LINK: 'share-link',
    OPENED_SHARED_LINK: 'opened-shared-link',
    REMIX_FROM_LINK: 'remix-from-link',
    INSTALLED: 'installed'
});

const FUNNEL_EVENTS = new Set(Object.values(FunnelEvent));

export function isFunnelEvent(event) {
    return FUNNEL_EVENTS.has(event);
}

// The same rules as the daily count, without its once a day.
export function shouldCountFunnelEvent({ settings, origin, privacySignals }) {
    return origin === VISITOR_COUNT_SITE_ORIGIN
        && normalizeVisitorCountSettings(settings).enabled
        && !asksNotToBeTracked(privacySignals);
}

export function funnelEventHitUrl(event, random) {
    if (!isFunnelEvent(event)) throw new TypeError(`not a funnel event: ${event}`);
    return `${VISITOR_COUNT_ENDPOINT}?p=${encodeURIComponent(`/e/${event}`)}&rnd=${encodeURIComponent(random)}`;
}
