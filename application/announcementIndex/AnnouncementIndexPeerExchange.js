import { PeerLifecycleState } from '../../peer/PeerLifecycleState.js';
import { AnnouncementKind } from './AnnouncementKinds.js';
import { byteLength } from '../../utils/responseSize.js';
import {
    ANNOUNCEMENT_INDEX_PEER_PROTOCOL,
    SHARED_ANNOUNCEMENT_KINDS,
    MAX_SUMMARY_ENTRIES,
    MAX_RESPONSE_PAYLOAD_BYTES,
    AnnouncementIndexPeerMessageKind,
    isValidAnnouncementIndexPeerMessage,
    validSummaryEntries,
    digestOfKeys,
    toAnnouncementIndexResponseMessages
} from './AnnouncementIndexPeerProtocol.js';

export const DEFAULT_MAX_REQUESTS_PER_SUMMARY = 50;
export const DEFAULT_MAX_RECORDS_PER_PEER_PER_HOUR = 20000;
export const DEFAULT_MAX_CLAIMS_PER_AUTHOR_PER_TAG = 100;
const REQUEST_TTL_MS = 5 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

// Shares the Announcement Index with connected peers (docs/AnnouncementIndex.md,
// "Phase 5"). When a peer authenticates, each side sends a SUMMARY of its
// tags; each then REQUESTs the tags where the other holds records it lacks,
// and records what comes back under the origin `peer:<identityId>`.
//
// A peer can only add records, never remove or change one, and every record
// goes through the same checks as a record from a substrate. A RESPONSE is
// accepted only for a tag this device asked that peer for in the last five
// minutes, and each peer has an hourly cap on records accepted. A Place
// Naming claim author has a cap per tag, so one identity cannot fill a
// region's list.
export class AnnouncementIndexPeerExchange {
    constructor({
        index,
        peerMessageBus,
        connectedPeerRegistry,
        now = () => Date.now(),
        maxRequestsPerSummary = DEFAULT_MAX_REQUESTS_PER_SUMMARY,
        maxRecordsPerPeerPerHour = DEFAULT_MAX_RECORDS_PER_PEER_PER_HOUR,
        maxClaimsPerAuthorPerTag = DEFAULT_MAX_CLAIMS_PER_AUTHOR_PER_TAG,
        onRecordsReceived = null
    }) {
        if (!index || typeof index.record !== 'function') throw new Error('AnnouncementIndexPeerExchange: an AnnouncementIndex is required');
        if (!peerMessageBus || typeof peerMessageBus.send !== 'function' || typeof peerMessageBus.subscribe !== 'function' || typeof peerMessageBus.attach !== 'function') {
            throw new Error('AnnouncementIndexPeerExchange: a PeerMessageBus is required');
        }
        if (!connectedPeerRegistry || typeof connectedPeerRegistry.list !== 'function' || typeof connectedPeerRegistry.onChange !== 'function') {
            throw new Error('AnnouncementIndexPeerExchange: a ConnectedPeerRegistry is required');
        }
        this._index = index;
        this._bus = peerMessageBus;
        this._registry = connectedPeerRegistry;
        this._now = now;
        this._maxRequestsPerSummary = maxRequestsPerSummary;
        this._maxRecordsPerPeerPerHour = maxRecordsPerPeerPerHour;
        this._maxClaimsPerAuthorPerTag = maxClaimsPerAuthorPerTag;
        this._onRecordsReceived = typeof onRecordsReceived === 'function' ? onRecordsReceived : null;
        this._summarized = new Set(); // connectionIds already sent a SUMMARY
        this._requested = new Map(); // `${connectionId} ${kind} ${tag}` -> requestedAt
        this._accepted = new Map(); // identityId -> { since, count }

        this._unsubscribeBus = this._bus.subscribe(ANNOUNCEMENT_INDEX_PEER_PROTOCOL, (payload, meta) => this._handleIncoming(payload, meta));
        this._unsubscribeRegistry = this._registry.onChange((peers) => this._onPeersChanged(peers));
        this._onPeersChanged(this._registry.list());
    }

    dispose() {
        this._unsubscribeBus();
        this._unsubscribeRegistry();
    }

    _onPeersChanged(peers) {
        const present = new Set();
        for (const peer of peers) {
            present.add(peer.connectionId);
            this._bus.attach(peer);
            if (peer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED && !this._summarized.has(peer.connectionId)) {
                this._summarized.add(peer.connectionId);
                this._send(peer, this._summary());
            }
        }
        for (const connectionId of [...this._summarized]) {
            if (!present.has(connectionId)) this._summarized.delete(connectionId);
        }
    }

    _summary() {
        const entries = [];
        for (const kind of SHARED_ANNOUNCEMENT_KINDS) {
            for (const tag of this._index.tags(kind)) {
                const keys = this._index.keys(kind, tag);
                if (keys.length > 0) entries.push({ kind, tag, count: keys.length, digest: digestOfKeys(keys) });
            }
        }
        // Largest tags first: they are the likeliest to hold what a peer lacks.
        entries.sort((a, b) => b.count - a.count);
        const kept = [];
        let bytes = 0;
        for (const entry of entries.slice(0, MAX_SUMMARY_ENTRIES)) {
            bytes += byteLength(JSON.stringify(entry)) + 1;
            if (bytes > MAX_RESPONSE_PAYLOAD_BYTES) break;
            kept.push(entry);
        }
        return { kind: AnnouncementIndexPeerMessageKind.SUMMARY, entries: kept };
    }

    _handleIncoming(payload, meta) {
        const peer = meta && meta.connectedPeer;
        if (!peer || !isValidAnnouncementIndexPeerMessage(payload)) return;
        switch (payload.kind) {
            case AnnouncementIndexPeerMessageKind.SUMMARY:
                this._handleSummary(peer, payload.entries);
                break;
            case AnnouncementIndexPeerMessageKind.REQUEST:
                this._handleRequest(peer, payload);
                break;
            default:
                this._handleResponse(peer, payload);
        }
    }

    _handleSummary(peer, entries) {
        let requests = 0;
        for (const entry of validSummaryEntries(entries)) {
            if (requests >= this._maxRequestsPerSummary) break;
            // A different digest means the peer holds at least one record this
            // device lacks, or lacks one it holds; asking costs one tag's
            // records, and both sides end up holding the union.
            if (digestOfKeys(this._index.keys(entry.kind, entry.tag)) === entry.digest) continue;
            this._requested.set(`${peer.connectionId} ${entry.kind} ${entry.tag}`, this._now());
            this._send(peer, { kind: AnnouncementIndexPeerMessageKind.REQUEST, recordKind: entry.kind, tag: entry.tag });
            requests += 1;
        }
    }

    _handleRequest(peer, { recordKind, tag }) {
        for (const message of toAnnouncementIndexResponseMessages(recordKind, tag, this._index.list(recordKind, tag))) {
            if (!this._send(peer, message)) break;
        }
    }

    _handleResponse(peer, { recordKind, tag, payloads }) {
        const requestKey = `${peer.connectionId} ${recordKind} ${tag}`;
        const requestedAt = this._requested.get(requestKey);
        if (requestedAt === undefined || this._now() - requestedAt > REQUEST_TTL_MS) return;

        const identityId = peer.remoteIdentity && peer.remoteIdentity.identityId;
        if (typeof identityId !== 'string') return;
        const allowance = this._allowance(identityId);
        if (allowance <= 0) return;

        const accepted = this._withinAuthorCap(recordKind, tag, payloads).slice(0, allowance);
        let result;
        try {
            result = this._index.record(recordKind, tag, accepted, `peer:${identityId}`);
        } catch {
            return;
        }
        const quota = this._accepted.get(identityId);
        quota.count += accepted.length;
        if (result.added > 0 && this._onRecordsReceived) {
            try {
                this._onRecordsReceived({ kind: recordKind, tag, added: result.added, identityId });
            } catch {
                // A listener failing never undoes the records.
            }
        }
    }

    _allowance(identityId) {
        const now = this._now();
        let quota = this._accepted.get(identityId);
        if (!quota || now - quota.since > HOUR_MS) {
            quota = { since: now, count: 0 };
            this._accepted.set(identityId, quota);
        }
        return this._maxRecordsPerPeerPerHour - quota.count;
    }

    // Place Naming claims past an author's cap for this tag, counting what the
    // index already holds, are dropped.
    _withinAuthorCap(recordKind, tag, payloads) {
        if (recordKind !== AnnouncementKind.PLACE_NAMING) return payloads;
        const authorOf = (payload) => (payload && payload.claim && typeof payload.claim.authorIdentityId === 'string' ? payload.claim.authorIdentityId : null);
        const counts = new Map();
        for (const known of this._index.list(recordKind, tag)) {
            const author = authorOf(known);
            counts.set(author, (counts.get(author) || 0) + 1);
        }
        return payloads.filter((payload) => {
            const author = authorOf(typeof payload === 'string' ? safeParse(payload) : payload);
            const count = counts.get(author) || 0;
            if (count >= this._maxClaimsPerAuthorPerTag) return false;
            counts.set(author, count + 1);
            return true;
        });
    }

    _send(peer, message) {
        try {
            this._bus.send(peer, ANNOUNCEMENT_INDEX_PEER_PROTOCOL, message);
            return true;
        } catch {
            return false;
        }
    }
}

function safeParse(text) {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}
