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
// (docs/Privacy.md, "Visitor count"): a share link copied or shared, and
// whether it was a short one, a shared
// link opened, a build opened from a link then copied into the Editor,
// ForkBuild installed as an app, and a build's embed code copied, an embedded
// build shown on another site, and opened from there in ForkBuild; the weekly
// challenge joined, and its plaza visited; a "Walk here with me" link made,
// and a friend arriving through one; a "Build with me" link made, and a
// friend joining through one; a build published crediting friends who built
// it together; a build published and sent to everyone, or kept to its link
// (each publish, core/BuildNote.js); World View opened, and someone else's
// build seen there (once a visit); the Editor opened, a ready-made build
// opened in it from a link, and a first edit made there (once a page load
// each); each kept side system used (once a page
// load: swimming, an animal caught or decorated with, the inventory, chat,
// voice, a public lobby); and, when
// a build is first published from this device, roughly how many bricks it
// has, whether it is this device's second build, and whether it remixes
// someone else's (publishedBuildEvents below).
// Nothing about the build, the link or the person is part of the path.
export const FunnelEvent = Object.freeze({
    SHARE_LINK: 'share-link',
    // The link shared was a short one (/n/<id>, core/ForkBuildAppLinks.js),
    // counted beside share-link, never instead of it.
    SHARE_LINK_SHORT: 'share-link-short',
    OPENED_SHARED_LINK: 'opened-shared-link',
    REMIX_FROM_LINK: 'remix-from-link',
    INSTALLED: 'installed',
    EMBED_CODE: 'embed-code',
    EMBED_VIEW: 'embed-view',
    EMBED_OPEN: 'embed-open',
    CHALLENGE_JOIN: 'challenge-join',
    PLAZA_VISIT: 'plaza-visit',
    PUBLISH_BRICKS_0: 'publish-bricks-0',
    PUBLISH_BRICKS_1: 'publish-bricks-1',
    PUBLISH_BRICKS_10: 'publish-bricks-10',
    PUBLISH_BRICKS_50: 'publish-bricks-50',
    PUBLISH_BRICKS_200: 'publish-bricks-200',
    PUBLISH_PLACED_0: 'publish-placed-0',
    PUBLISH_PLACED_1: 'publish-placed-1',
    PUBLISH_PLACED_10: 'publish-placed-10',
    PUBLISH_PLACED_50: 'publish-placed-50',
    PUBLISH_PLACED_200: 'publish-placed-200',
    SECOND_BUILD: 'second-build',
    REMIX_PUBLISHED: 'remix-published',
    WALK_LINK: 'walk-link',
    WALK_JOINED: 'walk-joined',
    BUILD_LINK: 'build-link',
    BUILD_JOINED: 'build-joined',
    PUBLISH_TOGETHER: 'publish-together',
    PUBLISH_FOUND: 'publish-found',
    PUBLISH_LINK_ONLY: 'publish-link-only',
    // World View opened, and, once a visit, someone else's build standing in
    // view there (docs/reviews/CreativeDirection-2026-10-12b.md, finding 1):
    // the village's ready-made builds don't count, a build published by this
    // device or open for it to edit neither.
    WORLD_VISIT: 'world-visit',
    WORLD_NEIGHBOUR: 'world-neighbour',
    // Someone with no name yet walking in World View, at most once a page
    // load (docs/reviews/CreativeDirection-2026-10-12c.md, finding 1).
    GUEST_WALK: 'guest-walk',
    // The first steps between arriving and publishing, each at most once a
    // page load, so the totals read as visits that took them: the Editor
    // opened (any way in), a ready-made build opened in it as the visitor's
    // own copy from a Home or challenge link (`?start=`), and a first edit
    // made there by the visitor (a collaborator's edits arriving from peers
    // don't count). Nothing about the build or the edit is part of the path.
    EDITOR_OPEN: 'editor-open',
    STARTER_OPEN: 'starter-open',
    EDITOR_EDIT: 'editor-edit',
    // The side systems the owner kept (docs/Pillars.md, "The side systems";
    // core/SideSystemUse.js), each at most once a page load: in the water,
    // an animal caught, one decorated with (G), something carried (an animal
    // or a stored vehicle), a chat message sent, a voice call made or
    // answered, a public lobby joined.
    SWAM: 'swam',
    ANIMAL_CAUGHT: 'animal-caught',
    ANIMAL_DECORATED: 'animal-decorated',
    INVENTORY_USED: 'inventory-used',
    CHAT_SENT: 'chat-sent',
    VOICE_CALL: 'voice-call',
    LOBBY_JOINED: 'lobby-joined'
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

// A published build's size as one of five ranges, named by their lowest
// count: 0 (only ready-made structures), 1–9, 10–49, 50–199 and 200 or more.
// Coarse on purpose: the range says how much building a build holds without
// the exact count singling it out.
const BRICK_RANGES = Object.freeze([
    [200, FunnelEvent.PUBLISH_BRICKS_200],
    [50, FunnelEvent.PUBLISH_BRICKS_50],
    [10, FunnelEvent.PUBLISH_BRICKS_10],
    [1, FunnelEvent.PUBLISH_BRICKS_1]
]);

export function publishedBrickRangeEvent(brickCount) {
    const count = Number.isInteger(brickCount) && brickCount > 0 ? brickCount : 0;
    for (const [lowest, event] of BRICK_RANGES) {
        if (count >= lowest) return event;
    }
    return FunnelEvent.PUBLISH_BRICKS_0;
}

// The same ranges for the bricks its builder placed or changed, leaving out
// the ready-made ones it started with (core/PlacedBricks.js): 0 is a
// ready-made build published untouched.
const PLACED_RANGES = Object.freeze([
    [200, FunnelEvent.PUBLISH_PLACED_200],
    [50, FunnelEvent.PUBLISH_PLACED_50],
    [10, FunnelEvent.PUBLISH_PLACED_10],
    [1, FunnelEvent.PUBLISH_PLACED_1]
]);

export function publishedPlacedRangeEvent(placedCount) {
    const count = Number.isInteger(placedCount) && placedCount > 0 ? placedCount : 0;
    for (const [lowest, event] of PLACED_RANGES) {
        if (count >= lowest) return event;
    }
    return FunnelEvent.PUBLISH_PLACED_0;
}

// What publishing `publication` tells the counter, given every Publication
// this device has published (`ownPublications`, which may or may not already
// hold `publication`). Only a build's first publish from this device counts,
// so publishing it again after more work adds nothing, and the brick ranges
// add up to the builds published:
// - its brick range (publishedBrickRangeEvent), and, when `placedCount` is
//   given, the range of the bricks its builder placed (publishedPlacedRangeEvent);
// - /e/second-build when it is the second build this device has published,
//   which happens once;
// - /e/remix-published when it is a copy of a build this device didn't
//   publish (a copy of one's own build is more work on it, not a remix).
export function publishedBuildEvents({ publication, brickCount, placedCount, ownPublications = [] }) {
    const documentId = publication?.documentId;
    if (typeof documentId !== 'string' || !documentId) return Object.freeze([]);
    const earlier = (Array.isArray(ownPublications) ? ownPublications : [])
        .filter((own) => own && own.id !== publication.id && typeof own.documentId === 'string');
    // Built together (core/BuiltWith.js): counted once per build, the first
    // time it is published crediting friends, which may be after its first
    // publish (a build often goes out alone before friends join it).
    const together = credits(publication) && !earlier.some((own) => own.documentId === documentId && credits(own));
    if (earlier.some((own) => own.documentId === documentId)) return Object.freeze(together ? [FunnelEvent.PUBLISH_TOGETHER] : []);

    const events = [publishedBrickRangeEvent(brickCount)];
    if (placedCount !== undefined && placedCount !== null) events.push(publishedPlacedRangeEvent(placedCount));
    const earlierBuilds = new Set(earlier.map((own) => own.documentId));
    if (earlierBuilds.size === 1) events.push(FunnelEvent.SECOND_BUILD);
    const parent = publication.parentDocumentId;
    if (typeof parent === 'string' && parent && parent !== documentId && !earlierBuilds.has(parent)) {
        events.push(FunnelEvent.REMIX_PUBLISHED);
    }
    if (together) events.push(FunnelEvent.PUBLISH_TOGETHER);
    return Object.freeze(events);
}

function credits(publication) {
    return Array.isArray(publication?.builtWith) && publication.builtWith.length > 0;
}
