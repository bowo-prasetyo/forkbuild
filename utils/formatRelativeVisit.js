// 0.3.10 — World Persistence & Return Experience.
//
// Shared "how long ago" formatting for a local visit timestamp — used
// wherever this replica shows its OWN last-visit record for a World
// (see core/LocalWorldExperience.js). Deliberately coarse (today /
// yesterday / N days ago), never more precise than a day and never a
// live-updating countdown — a local visit history has no need for
// minute-level precision, and re-rendering a card every minute just to
// keep a label current would be pure churn for no benefit anyone asked
// for. The ONE place this exact formatting exists, shared by
// ui/components/WorldWelcomePanel.js ("Last visited X") and
// ui/components/WorldCard.js (the Recent Worlds list), rather than two
// components quietly drifting apart on their own copies.
export function formatRelativeVisit(epochMs, now = Date.now()) {
    if (typeof epochMs !== 'number') {
        return null;
    }
    const elapsedMs = now - epochMs;
    if (elapsedMs < 0) {
        return null;
    }
    const dayMs = 24 * 60 * 60 * 1000;
    const elapsedDays = Math.floor(elapsedMs / dayMs);
    if (elapsedDays <= 0) {
        return 'today';
    }
    if (elapsedDays === 1) {
        return 'yesterday';
    }
    return `${elapsedDays} days ago`;
}
