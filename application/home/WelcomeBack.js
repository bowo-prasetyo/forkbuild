import { challengeOfTags } from '../../core/challenge/BuildChallenge.js';

const SNAPSHOT_KEY_PREFIX = 'snapshot:';
const DAY_MS = 24 * 60 * 60 * 1000;

// What Home's Welcome back (ui/components/home/WelcomeBack.js) offers a
// builder returning to this device, from its own records: the build changed
// last in the saved documents' manifest (DocumentManifest#list()), and how
// many builds it published (LocalDiscoveryProvider#list()). null when there
// is no saved build, so a newcomer's Home is unchanged. Synchronous, so the
// card shows at once instead of pushing Home down later.
export function welcomeBack({ savedBuilds = [], ownPublications = [] }) {
    const build = latestSavedBuild(savedBuilds);
    if (!build) return null;
    return Object.freeze({ build, publishedBuilds: ownBuilds(ownPublications).size });
}

// The saved build changed last, as { documentId, title, modified } with
// `modified` in ms; null when none has an id and a readable time.
export function latestSavedBuild(savedBuilds) {
    let latest = null;
    for (const entry of Array.isArray(savedBuilds) ? savedBuilds : []) {
        const modified = Date.parse(entry?.modified);
        if (typeof entry?.id !== 'string' || !entry.id || !Number.isFinite(modified)) continue;
        if (!latest || modified > latest.modified) {
            latest = { documentId: entry.id, title: typeof entry.title === 'string' ? entry.title.trim() : '', modified };
        }
    }
    return latest ? Object.freeze(latest) : null;
}

// Whole days between `modified` and `now`: 0 for today, never negative.
export function daysSince(modified, now = Date.now()) {
    return Math.max(0, Math.floor((now - modified) / DAY_MS));
}

// Whether a build this device published entered `challenge`: only builds
// published since the week began can carry its tag, so only their snapshots
// are read (`loadSnapshot(name)`). One that can't be read is skipped.
export async function enteredChallenge({ ownPublications = [], challenge = null, loadSnapshot = null }) {
    if (!challenge || typeof loadSnapshot !== 'function') return false;
    const since = challenge.startsAt.getTime();
    for (const publication of ownPublications) {
        if (typeof publication?.documentId !== 'string') continue;
        const publishedAt = publication.publishedAt instanceof Date ? publication.publishedAt.getTime() : Date.parse(publication.publishedAt);
        if (!(publishedAt >= since)) continue;
        let snapshot = null;
        try {
            snapshot = await loadSnapshot(SNAPSHOT_KEY_PREFIX + publication.id);
        } catch {
            continue;
        }
        if (challengeOfTags(snapshot?.metadata?.tags)?.id === challenge.id) return true;
    }
    return false;
}

function ownBuilds(ownPublications) {
    return new Set((Array.isArray(ownPublications) ? ownPublications : [])
        .map((publication) => publication?.documentId)
        .filter((documentId) => typeof documentId === 'string'));
}
