import { AnnouncementKind } from './AnnouncementKinds.js';
import { parseSnapshotDiscoveryEnvelope, snapshotCandidateFromEnvelope } from '../../core/SnapshotDiscoveryEnvelope.js';
import { isPlainObject } from '../../utils/typeGuards.js';
import { ArweaveSnapshotDiscoveryQueryService } from '../arweave/ArweaveSnapshotDiscoveryQueryService.js';
import { ArweavePlaceNamingDiscoveryPublisher } from '../placeNaming/ArweavePlaceNamingDiscoveryPublisher.js';
import { PublicationCommentaryArweaveDistribution } from '../publication/commentary/PublicationCommentaryArweaveDistribution.js';

// What a sync reads for each kind of announcement, and where each result goes
// (docs/AnnouncementIndex.md, "Phase 3"). Every ForkBuild announcement on
// Nostr is a kind-1 event tagged `t`; each kind has its own Arweave Tag NAME,
// taken from its own reader or publisher.
//
// A target is { id, tag, nostr: { tagName, kinds, parse(event) }, arweave:
// { tagName, parse(text) }, steem?: () => Promise<results>, consume(results,
// origin) }. parse() returns null for anything that is not this kind's
// announcement. consume() never throws: a storage failure must not stop a
// sync that other results can still benefit from.

export const SNAPSHOT_DISCOVERY_TAG = 'forkbuild-snapshot';
export const COMMENTARY_DISCOVERY_TAG = 'forkbuild-commentary';
const NOSTR = Object.freeze({ tagName: 't', kinds: Object.freeze([1]) });
const ARWEAVE_TAG_NAMES = Object.freeze({
    snapshot: ArweaveSnapshotDiscoveryQueryService.DEFAULT_TAG_NAME,
    placeNaming: ArweavePlaceNamingDiscoveryPublisher.DEFAULT_TAG_NAME,
    commentary: PublicationCommentaryArweaveDistribution.DEFAULT_TAG_NAME
});

function recordInto(index, kind, tag) {
    return (results, origin) => {
        try {
            index.record(kind, tag, results, origin);
        } catch {
            // Storage full or unavailable; the next sync tries again.
        }
    };
}

function snapshotCandidateOf(text) {
    const envelope = parseSnapshotDiscoveryEnvelope(text);
    if (envelope === null) return null;
    return snapshotCandidateFromEnvelope(envelope);
}

function jsonObjectOf(text) {
    try {
        const value = JSON.parse(text);
        return isPlainObject(value) ? value : null;
    } catch {
        return null;
    }
}

const contentOf = (event) => (typeof event.content === 'string' && event.content.length > 0 ? event.content : null);

// `steemSource`: the Steem snapshot discovery query service, or null.
export function snapshotSyncTarget({ index, steemSource = null, tag = SNAPSHOT_DISCOVERY_TAG }) {
    return Object.freeze({
        id: `${AnnouncementKind.SNAPSHOT}:${tag}`,
        tag,
        nostr: { ...NOSTR, parse: (event) => (contentOf(event) === null ? null : snapshotCandidateOf(event.content)) },
        arweave: { tagName: ARWEAVE_TAG_NAMES.snapshot, parse: snapshotCandidateOf },
        steem: steemSource ? () => steemSource.search(tag) : null,
        consume: recordInto(index, AnnouncementKind.SNAPSHOT, tag)
    });
}

// Raw payloads: the index parses them and checks each belongs to `tag`.
export function placeNamingSyncTarget({ index, tag, steemSource = null }) {
    return Object.freeze({
        id: `${AnnouncementKind.PLACE_NAMING}:${tag}`,
        tag,
        nostr: { ...NOSTR, parse: contentOf },
        arweave: { tagName: ARWEAVE_TAG_NAMES.placeNaming, parse: (text) => text },
        steem: steemSource ? () => steemSource.search(tag) : null,
        consume: recordInto(index, AnnouncementKind.PLACE_NAMING, tag)
    });
}

// Commentary goes straight into the Commentary store, which is its index.
// `importCommentaryEnvelope` verifies each signature and throws for one that
// fails; those are skipped. `steemDistribution`: its discover() lists every
// Steem commentary envelope.
export function commentarySyncTarget({ importCommentaryEnvelope, steemDistribution = null, tag = COMMENTARY_DISCOVERY_TAG }) {
    return Object.freeze({
        id: `commentary:${tag}`,
        tag,
        nostr: { ...NOSTR, parse: (event) => (contentOf(event) === null ? null : jsonObjectOf(event.content)) },
        arweave: { tagName: ARWEAVE_TAG_NAMES.commentary, parse: jsonObjectOf },
        steem: steemDistribution ? () => steemDistribution.discover() : null,
        consume: (envelopes) => {
            for (const envelope of envelopes) {
                try {
                    importCommentaryEnvelope(envelope);
                } catch {
                    // Malformed or unverifiable: anyone can post under a public tag.
                }
            }
        }
    });
}
