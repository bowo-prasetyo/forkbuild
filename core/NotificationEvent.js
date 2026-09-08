import { createId } from './createId.js';

// 0.9.273 — Notification Event Domain Boundary.
//
// 0.9.272's own reassessment found several domains capable of producing
// meaningful, user-directed events (Publication Commentary, Place Naming,
// Document Collaboration, World Presence) and one real durable-delivery
// precedent, application/ChatOutbox.js — but no domain-neutral
// representation of "something happened that may warrant user awareness."
// This file is that missing seam, and deliberately nothing more.
//
// A NotificationEvent Represents An Awareness-Worthy Fact; It Is Not A
// Delivery, A Read State, Or A Chat Message (0.9.273): it records that
// something happened, for whom, and what it was about — never whether it
// has been delivered, seen, dismissed, or expired. Compare this
// deliberately with core/ChatOutboxEntry.js, whose entire shape (state,
// queuedAt/sentAt/deliveredAt, expiresAt) exists to track ONE message's
// progress toward a confirmed delivery to a peer CONNECTION. A
// NotificationEvent has no state field and no TTL: it is a fact about a
// past occurrence, addressed to a recipient IDENTITY, not a job in
// flight. Lifecycle vocabulary (PENDING/DELIVERED/READ/DISMISSED/EXPIRED)
// is explicitly not introduced here — see docs/Roadmap.md's own 0.9.273
// entry on why: no producer or delivery mechanism exists yet to give
// those states actual, evidenced meaning.
//
// `eventType` is deliberately an open, unenumerated string, not a closed
// vocabulary like core/ChatMessageKind — 0.9.273 has no consumer, so any
// fixed enum here would be invented ahead of evidence. It is validated
// only as a namespaced identifier shape (e.g. "publication.commented"),
// the same style docs/BrickIDs.md already establishes for a stable type
// identifier, so future producers share one convention without this file
// having to know what they are.
//
// Immutable, like core/ChatOutboxEntry.js and core/AvatarProfile.js: a
// NotificationEvent is constructed once and never mutated. `payload` is
// deep-cloned on the way in and the way out (`_clonePayload`) so neither
// the caller's original object nor a value handed back by `payload` can
// ever reach back into this instance's own state — see the "Payload
// Isolation" section of tests/NotificationEvent.test.js.
//
// Deliberately standalone: this file imports nothing but
// core/createId.js (itself dependency-free). It must never import
// application/ChatOutbox.js, anything Publication/Commentary-shaped,
// anything Place-Naming-shaped, anything Collaboration-shaped, or
// anything Presence-shaped — see this file's own "architectural
// import-boundary" test. A domain event becomes a NotificationEvent by
// calling THIS constructor with plain data; it never happens the other
// way around.
export const MAX_EVENT_TYPE_LENGTH = 200;
export const MAX_RECIPIENT_ID_LENGTH = 512;

const EVENT_TYPE_PATTERN = /^[a-z0-9]+(?:[._:-][a-z0-9]+)*$/i;

export function isValidEventType(value) {
    return typeof value === 'string'
        && value.length > 0
        && value.length <= MAX_EVENT_TYPE_LENGTH
        && EVENT_TYPE_PATTERN.test(value);
}

export class NotificationEvent {
    constructor({
        notificationId = createId(),
        eventType,
        recipientIdentityId,
        createdAt = new Date(),
        payload = {}
    } = {}) {
        if (typeof notificationId !== 'string' || notificationId.length === 0) {
            throw new Error('NotificationEvent: notificationId is required');
        }
        if (!isValidEventType(eventType)) {
            throw new Error('NotificationEvent: eventType must be a non-empty, namespaced identifier');
        }
        if (typeof recipientIdentityId !== 'string' || recipientIdentityId.length === 0 || recipientIdentityId.length > MAX_RECIPIENT_ID_LENGTH) {
            throw new Error('NotificationEvent: recipientIdentityId is required');
        }
        const createdAtDate = toDate(createdAt);
        if (Number.isNaN(createdAtDate.getTime())) {
            throw new Error('NotificationEvent: createdAt must be a valid date');
        }

        this._notificationId = notificationId;
        this._eventType = eventType;
        this._recipientIdentityId = recipientIdentityId;
        this._createdAt = createdAtDate;
        this._payload = clonePayload(payload);
    }

    get notificationId() { return this._notificationId; }
    get eventType() { return this._eventType; }
    get recipientIdentityId() { return this._recipientIdentityId; }
    // A fresh Date each read, exactly like `payload` below — the
    // caller can mutate the Date it gets back without ever touching
    // this instance's own stored timestamp.
    get createdAt() { return new Date(this._createdAt.getTime()); }

    // Always a fresh clone — see this file's own header, "Payload
    // Isolation": the caller can do anything to the returned object
    // without touching this instance's own stored copy.
    get payload() { return clonePayload(this._payload); }

    toJSON() {
        return {
            notificationId: this._notificationId,
            eventType: this._eventType,
            recipientIdentityId: this._recipientIdentityId,
            createdAt: this._createdAt.toISOString(),
            payload: this.payload
        };
    }

    // Never throws — a corrupted or unrecognized stored record simply
    // isn't restored, the same "validate strictly on write, degrade
    // gracefully on read" split core/ChatOutboxEntry.js#fromJSON already
    // uses.
    static fromJSON(json) {
        if (!json || typeof json !== 'object') {
            return null;
        }
        try {
            return new NotificationEvent(json);
        } catch {
            return null;
        }
    }
}

function toDate(value) {
    return value instanceof Date ? value : new Date(value);
}

function clonePayload(payload) {
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new Error('NotificationEvent: payload must be a plain object');
    }
    try {
        return JSON.parse(JSON.stringify(payload));
    } catch {
        throw new Error('NotificationEvent: payload must be JSON-serializable');
    }
}
