import { AnnouncementKind } from './AnnouncementKinds.js';
import { isNonEmptyString, isPlainObject } from '../../utils/typeGuards.js';
import { byteLength } from '../../utils/responseSize.js';

// The `forkbuild:announcement-index` peer protocol (docs/AnnouncementIndex.md,
// "Phase 5", and docs/Protocol.md, "Peer messages"):
//
//   SUMMARY   { kind: 'summary', entries: [{ kind, tag, count, digest }] }
//   REQUEST   { kind: 'request', recordKind, tag }
//   RESPONSE  { kind: 'response', recordKind, tag, payloads: [...] }
//
// Only Snapshot candidates and Place Naming claims are shared. A Publication
// lead's origin names the relay set it came from, which a peer cannot vouch
// for, and Commentary already has its own peer protocol.

export const ANNOUNCEMENT_INDEX_PEER_PROTOCOL = 'forkbuild:announcement-index';
export const SHARED_ANNOUNCEMENT_KINDS = Object.freeze([AnnouncementKind.SNAPSHOT, AnnouncementKind.PLACE_NAMING]);
export const MAX_SUMMARY_ENTRIES = 300;
// Leaves room under MAX_PEER_MESSAGE_BYTES (64 KiB) for the envelope.
export const MAX_RESPONSE_PAYLOAD_BYTES = 48 * 1024;
const MAX_TAG_LENGTH = 512;

export const AnnouncementIndexPeerMessageKind = Object.freeze({
    SUMMARY: 'summary',
    REQUEST: 'request',
    RESPONSE: 'response'
});

const isSharedKind = (kind) => SHARED_ANNOUNCEMENT_KINDS.includes(kind);
const isTag = (tag) => isNonEmptyString(tag) && tag.length <= MAX_TAG_LENGTH;

export function isValidAnnouncementIndexPeerMessage(payload) {
    if (!isPlainObject(payload)) return false;
    switch (payload.kind) {
        case AnnouncementIndexPeerMessageKind.SUMMARY:
            return Array.isArray(payload.entries) && payload.entries.length <= MAX_SUMMARY_ENTRIES;
        case AnnouncementIndexPeerMessageKind.REQUEST:
            return isSharedKind(payload.recordKind) && isTag(payload.tag);
        case AnnouncementIndexPeerMessageKind.RESPONSE:
            return isSharedKind(payload.recordKind) && isTag(payload.tag) && Array.isArray(payload.payloads);
        default:
            return false;
    }
}

// Summary entries that name a shared kind and a usable tag; anything else a
// peer sends is ignored.
export function validSummaryEntries(entries) {
    return entries.filter((entry) => isPlainObject(entry)
        && isSharedKind(entry.kind)
        && isTag(entry.tag)
        && Number.isInteger(entry.count) && entry.count >= 0
        && isNonEmptyString(entry.digest));
}

// A short fingerprint of a tag's record keys, so two peers holding the same
// records skip exchanging them. Not a security measure: a peer lying about it
// only makes the other side skip that peer's records.
export function digestOfKeys(keys) {
    let hash = 0x811c9dc5;
    for (const key of [...keys].sort()) {
        for (let i = 0; i < key.length; i++) {
            hash ^= key.charCodeAt(i);
            hash = Math.imul(hash, 0x01000193) >>> 0;
        }
        hash ^= 0x0a;
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return `${keys.length}:${hash.toString(16)}`;
}

// Splits payloads into RESPONSE messages that each fit one peer message.
export function toAnnouncementIndexResponseMessages(recordKind, tag, payloads) {
    const messages = [];
    let batch = [];
    let batchBytes = 0;
    for (const payload of payloads) {
        const bytes = byteLength(JSON.stringify(payload)) + 1;
        if (bytes > MAX_RESPONSE_PAYLOAD_BYTES) continue;
        if (batch.length > 0 && batchBytes + bytes > MAX_RESPONSE_PAYLOAD_BYTES) {
            messages.push({ kind: AnnouncementIndexPeerMessageKind.RESPONSE, recordKind, tag, payloads: batch });
            batch = [];
            batchBytes = 0;
        }
        batch.push(payload);
        batchBytes += bytes;
    }
    if (batch.length > 0) messages.push({ kind: AnnouncementIndexPeerMessageKind.RESPONSE, recordKind, tag, payloads: batch });
    return messages;
}
