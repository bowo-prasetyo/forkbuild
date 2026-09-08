import { resolveSigningIdentityId } from '../identity/resolveSigningIdentityId.js';

// 0.9.283 — Recipient Notification Query Boundary.
//
// 0.9.282's own reassessment (Section C, Section K) found that recipient
// querying is mechanically derivable from the already-persisted store — a
// plain filter over `loadAll()` — but that nothing above the storage layer
// ever calls it, so no product capability exists yet to say "these are
// MY notifications." This file is exactly that capability, and
// deliberately nothing more:
//
//   identityProvider.getSigningIdentity()   (existing identity/
//        │                                   infrastructure, unmodified)
//        ▼
//   recipientIdentityId
//        │
//        │  GetRecipientNotificationEventsUseCase.execute()
//        ▼
//   NotificationEventStore.loadAll()        (0.9.281, unmodified)
//        │
//        │  filter by recipientIdentityId
//        ▼
//   NotificationEvent[]
//
// A QUERY BOUNDARY, NOT AN INBOX. Per 0.9.282's own "what comes after,"
// this file answers only "what notification facts are on file for the
// current identity" — never read/unread, delivery, TTL, sorting,
// pagination, or deletion. Its own semantics stay exactly as thin as
// application/GetPublicationCommentariesUseCase.js's own read side: a
// bare pass-through filter over whatever an existing store already
// persists, reusing 0.9.280's already-adopted deduplication policy and
// 0.9.281's already-adopted persistence boundary rather than inventing
// either again.
//
// NO getForRecipient() ADDED TO NotificationEventStore. 0.9.282 Section C
// already proved the derivation is safe directly off `loadAll()`; adding a
// second, narrower read primitive to the store itself is a storage
// optimization for a later milestone to justify with actual scale
// evidence, not something this milestone invents preemptively. This file
// depends on the store's `loadAll()` alone, duck-typed, exactly the way
// `GetPublicationCommentariesUseCase` depends only on
// `getForPublication()`.
//
// THE CURRENT AUTHENTICATED IDENTITY IS THE ONLY RECIPIENT THIS CLASS WILL
// EVER ASK ABOUT. `execute()` takes no arguments — there is no
// `recipientIdentityId` parameter a caller could supply to read someone
// else's notification history. The recipient is resolved exactly the way
// `AddPublicationCommentaryUseCase` already resolves a commentary's
// author: `resolveSigningIdentityId(identityProvider)`, reusing
// `identity/resolveSigningIdentityId.js` rather than re-deriving identity
// resolution here. 0.9.282's own Section D already named the isolation
// this depends on as FIELD-LEVEL, not storage-level — this file does not
// change that; it only makes the field-level fact reachable through an
// authenticated boundary instead of a raw filter a caller could run
// against an arbitrary id.
//
// NO AUTHENTICATED IDENTITY FAILS THE QUERY, CLEANLY, BEFORE THE STORE IS
// EVER READ. Mirrors `AddPublicationCommentaryUseCase.execute()`'s own
// "sign in to comment on a publication" refusal for the identical reason:
// there is no anonymous or placeholder recipient, and no partial result
// for a caller who cannot be identified.
//
// ORDERING IS WHATEVER THE INJECTED STORE RETURNS, NEVER RE-SORTED HERE —
// the same restraint `GetPublicationCommentariesUseCase` already
// documents for its own store. `NotificationEventStore.loadAll()`'s own
// header already guarantees save order; this file adds no `sort()` of its
// own.
//
// A STORAGE FAILURE PROPAGATES UNMODIFIED. `loadAll()` throwing is never
// converted into an empty array here — "no notifications" and "storage
// unavailable" stay two different outcomes, exactly as
// `AddPublicationCommentaryUseCase` never swallows a genuine store write
// failure.
//
// DELIBERATELY EXCLUDED FROM THIS MILESTONE, per 0.9.282's own "what comes
// after" and this milestone's own brief: `getUnreadNotifications()`,
// `getRecentNotifications()`, `markAsRead()`, `deleteNotification()`,
// `acknowledge()`, any UI, any delivery mechanism, any lifecycle/read
// state, any new deduplication logic (already owned by
// `core/NotificationDeduplicationPolicy.js` and enforced by
// `NotificationEventStore.save()`), and any caller-supplied recipient
// parameter.
export class GetRecipientNotificationEventsUseCase {
    constructor(notificationEventStore, identityProvider) {
        if (!notificationEventStore || typeof notificationEventStore.loadAll !== 'function') {
            throw new Error('GetRecipientNotificationEventsUseCase: a store with loadAll() is required');
        }
        if (!identityProvider) {
            throw new Error('GetRecipientNotificationEventsUseCase: identityProvider is required');
        }
        this._notificationEventStore = notificationEventStore;
        this._identityProvider = identityProvider;
    }

    // Every NotificationEvent on file whose recipientIdentityId exactly
    // matches the injected identityProvider's own currently-authenticated
    // signing identity, in the order the store returns them. Throws a
    // plain Error when no identity is authenticated, before the store is
    // ever read. A genuine store read failure propagates unmodified.
    execute() {
        const recipientIdentityId = resolveSigningIdentityId(this._identityProvider);
        if (!recipientIdentityId) {
            throw new Error('GetRecipientNotificationEventsUseCase: sign in to view your notifications');
        }
        return this._notificationEventStore.loadAll()
            .filter((event) => event.recipientIdentityId === recipientIdentityId);
    }
}
