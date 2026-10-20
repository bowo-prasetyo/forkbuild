import { BUILD_TAG_DISCOVERY_PREFIX, buildTagDiscoveryTag } from './NarrowDiscoveryTags.js';
import { normalizeBuildTags } from '../document/BuildTags.js';

// A build note: a Nostr event that carries a whole published build, the same
// signed claim and bytes a link-only share carries
// (application/publication/sharing/PublicationLinkPayload.js), so that anyone
// can find the build with no link, wallet or extension (docs/Pillars.md,
// "Every build has a family tree"). Its publisher's signed placement rides
// beside it, so the build stands where its publisher put it.
//
// Nothing in a note is trusted: a reader opens its payload exactly as it
// opens a shared link (application/publication/OpenPublicationLink.js), which
// checks the builder's signature and the build's content hash, and adopts
// the placement only when its publisher signed it
// (application/placement/AdoptPublisherPlacementUseCase.js). The note's own
// Nostr signature is checked too, but it proves only which carrier key sent
// it (nostr/AppNostrSigner.js).
//
// NIP-78 (application-specific data): kind 30078, replaceable per carrier key
// and `d` tag, so publishing the same Publication twice keeps one note.

export const BUILD_NOTE_KIND = 30078;
export const BUILD_NOTE_TAG = 'forkbuild-build';
const D_TAG_PREFIX = 'forkbuild-build:';
const FORMAT_VERSION = 1;

// The longest payload a note carries: about 2,000 bricks, and within the
// 64 KB event size the default relays accept. A larger build is found
// through the other networks, or shared by link.
export const MAX_BUILD_NOTE_PAYLOAD_LENGTH = 48000;

// Notes a reader asks each relay for at a time.
export const BUILD_NOTE_QUERY_LIMIT = 200;

// The event template for a note (kind, tags, content), or null when
// `payload` is missing or too long. `tags` are the build's own tags
// (core/document/BuildTags.js), each also announced as a `forkbuild-tag:` tag so a
// reader can ask for one week's challenge entries.
export function buildNoteTemplate({ publicationId, payload, tags = [], placementRecord = null }) {
    if (typeof publicationId !== 'string' || !publicationId) return null;
    if (typeof payload !== 'string' || !payload || payload.length > MAX_BUILD_NOTE_PAYLOAD_LENGTH) return null;
    const noteTags = [
        ['d', D_TAG_PREFIX + publicationId],
        ['t', BUILD_NOTE_TAG],
        ...normalizeBuildTags(tags).map((tag) => buildTagDiscoveryTag(tag)).filter(Boolean).map((tag) => ['t', tag]),
        ['alt', 'A ForkBuild build, signed by its builder']
    ];
    const content = { v: FORMAT_VERSION, payload };
    if (placementRecord && typeof placementRecord === 'object') content.placement = placementRecord;
    return Object.freeze({ kind: BUILD_NOTE_KIND, tags: noteTags, content: JSON.stringify(content) });
}

// The relay filter for notes, all of them or one build tag's.
export function buildNoteFilter({ tag = null, limit = BUILD_NOTE_QUERY_LIMIT } = {}) {
    const discoveryTag = tag === null ? null : buildTagDiscoveryTag(tag);
    if (tag !== null && !discoveryTag) return null;
    return Object.freeze({ kinds: [BUILD_NOTE_KIND], '#t': [discoveryTag || BUILD_NOTE_TAG], limit });
}

// The most notes a reader asks for one build (a short link, `/n/<id>`):
// relays answer with every carrier key's copy, and anyone can send a note
// under any build's id, so a reader checks them newest first until one opens.
export const BUILD_NOTE_CANDIDATE_LIMIT = 10;

// The relay filter for the notes of one Publication, or null for an id a
// note can't carry.
export function buildNoteFilterForPublication(publicationId, limit = BUILD_NOTE_CANDIDATE_LIMIT) {
    if (typeof publicationId !== 'string' || !publicationId) return null;
    return Object.freeze({ kinds: [BUILD_NOTE_KIND], '#d': [D_TAG_PREFIX + publicationId], limit });
}

// `{ publicationId, payload, placementRecord, tags, createdAt }` from a
// relay's event, or null for anything that isn't a note this version wrote.
// `publicationId` and `tags` are the note's own say-so, for sorting and
// skipping only; the payload is what gets checked.
export function readBuildNote(event) {
    if (!event || typeof event !== 'object' || event.kind !== BUILD_NOTE_KIND || !Array.isArray(event.tags)) return null;
    const dTag = event.tags.find((tag) => Array.isArray(tag) && tag[0] === 'd');
    if (!dTag || typeof dTag[1] !== 'string' || !dTag[1].startsWith(D_TAG_PREFIX)) return null;
    const publicationId = dTag[1].slice(D_TAG_PREFIX.length);
    if (!publicationId) return null;
    if (typeof event.content !== 'string' || event.content.length > MAX_BUILD_NOTE_PAYLOAD_LENGTH + 16384) return null;
    let content;
    try {
        content = JSON.parse(event.content);
    } catch {
        return null;
    }
    if (!content || content.v !== FORMAT_VERSION || typeof content.payload !== 'string' || !content.payload
        || content.payload.length > MAX_BUILD_NOTE_PAYLOAD_LENGTH) return null;
    const placementRecord = content.placement && typeof content.placement === 'object' && !Array.isArray(content.placement)
        ? content.placement
        : null;
    const tags = event.tags
        .filter((tag) => Array.isArray(tag) && tag[0] === 't' && typeof tag[1] === 'string' && tag[1].startsWith(BUILD_TAG_DISCOVERY_PREFIX))
        .map((tag) => tag[1].slice(BUILD_TAG_DISCOVERY_PREFIX.length));
    return Object.freeze({
        publicationId,
        payload: content.payload,
        placementRecord,
        tags: Object.freeze(normalizeBuildTags(tags)),
        createdAt: Number.isFinite(event.created_at) ? event.created_at : 0
    });
}

// The newest note for each Publication among `events` (several relays answer
// with the same note, and a carrier key may have replaced one), newest first.
export function latestBuildNotes(events) {
    const byPublication = new Map();
    for (const event of Array.isArray(events) ? events : []) {
        const note = readBuildNote(event);
        if (!note) continue;
        const known = byPublication.get(note.publicationId);
        if (!known || note.createdAt > known.createdAt) byPublication.set(note.publicationId, note);
    }
    return [...byPublication.values()].sort((a, b) => (b.createdAt - a.createdAt) || (a.publicationId < b.publicationId ? -1 : 1));
}

// Every note for `publicationId` among `events`, each payload once, newest
// first and at most `limit`: the candidates a short link tries in turn.
export function buildNotesForPublication(events, publicationId, limit = BUILD_NOTE_CANDIDATE_LIMIT) {
    const seen = new Set();
    const notes = [];
    for (const event of Array.isArray(events) ? events : []) {
        const note = readBuildNote(event);
        if (!note || note.publicationId !== publicationId || seen.has(note.payload)) continue;
        seen.add(note.payload);
        notes.push(note);
    }
    return notes.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
}
