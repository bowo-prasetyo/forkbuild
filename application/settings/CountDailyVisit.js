// Adds this browser to the daily visitor count once a day, if it may
// (core/VisitorCount.js). Called once at startup; never throws, since a
// counter must not be able to stop the app opening.
import { localDayOf, shouldCountVisit, visitorCountHitUrl } from '../../core/VisitorCount.js';

// Returns true when a hit was sent.
export function countDailyVisit({ settingsStore, origin, privacySignals, now = new Date(), random = Math.random, sendHit }) {
    try {
        const day = localDayOf(now);
        if (!shouldCountVisit({ settings: settingsStore.get(), day, origin, privacySignals })) {
            return false;
        }
        // Recorded first, so a page that reloads while the hit is in flight
        // doesn't count twice.
        settingsStore.recordCounted(day);
        sendHit(visitorCountHitUrl(String(random()).slice(2)));
        return true;
    } catch {
        return false;
    }
}
