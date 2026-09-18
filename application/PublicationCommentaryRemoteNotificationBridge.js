import { buildPublicationCommentedNotificationEvent } from './PublicationCommentaryNotificationProducer.js';
import { resolveSigningIdentityId } from '../identity/resolveSigningIdentityId.js';

// 0.9.623 — Wire Remote Commentary Arrival into Local Notifications.
//
// 0.9.622's own Section E flagship finding, restated exactly: the
// capability to observe a newly-arrived Commentary already existed
// (application/PublicationCommentaryDistributionPeerExchange.js#
// onCommentaryReceived(), 0.9.618) and the capability to turn a Commentary
// into a NotificationEvent already existed (application/
// PublicationCommentaryNotificationProducer.js, 0.9.275) — but nothing
// connected the two. Local creation kept the product's own documented
// promise ("every successful commentary produces a notification"); a
// remote arrival, despite being an equally genuine, equally signed,
// equally durable fact, produced silence. This file is that missing
// connection, and nothing more:
//
//   PublicationCommentaryDistributionPeerExchange#onCommentaryReceived()
//        │                                          (0.9.618, unmodified)
//        ▼
//   { commentary, isNew }
//        │
//        ▼
//   PublicationCommentaryRemoteNotificationBridge#handleCommentaryReceived()
//        │                                          (THIS FILE)
//        ├── isNew !== true                -> stop, no notification
//        ├── discoveryProvider.findById()   -> Publication not found -> stop
//        ├── this replica's own signing identity !== Publication's own
//        │   publisherIdentity.id           -> stop
//        ▼
//   buildPublicationCommentedNotificationEvent(commentary, publication)
//        │                                          (application/
//        │                                          PublicationCommentaryNotificationProducer.js,
//        │                                          extracted by THIS
//        │                                          milestone — see that
//        │                                          file's own 0.9.623
//        │                                          section)
//        ▼
//   notificationSink(notificationEvent)   (injected — this file has no
//                                           opinion on what it does with
//                                           the event, exactly like
//                                           PublicationCommentaryNotificationProducer.js's
//                                           own notificationSink)
//
// AN ADAPTER, NEVER A SECOND PRODUCER — AND, LITERALLY, NEVER A SECOND
// NotificationEvent CONSTRUCTION SITE. This file imports
// buildPublicationCommentedNotificationEvent() from application/
// PublicationCommentaryNotificationProducer.js rather than instantiating a
// NotificationEvent itself. That function is a small, pure extraction
// (0.9.623) of exactly the construction
// PublicationCommentaryNotificationProducer.js#execute() already performed
// for local creation since 0.9.275 — unchanged in shape, and that file
// remains the only one anywhere under application/ that ever reaches for
// NotificationEvent's own constructor. There is no
// PUBLICATION_COMMENTARY_RECEIVED_EVENT_TYPE, no "remote"
// variant of the notification vocabulary, and no second, competing
// definition of what a "commentary was posted" notification looks like: a
// publisher who receives a NotificationEvent through this file cannot
// tell, and does not need to be able to tell, whether the Commentary it is
// about arrived through local creation or a remote peer. See 0.9.622's own
// Section E finding on exactly why that indistinguishability is correct: a
// signed Commentary fact is equally genuine regardless of which device
// created it.
//
// PublicationCommentaryNotificationProducer ITSELF (THE CLASS) IS NEITHER
// MODIFIED IN BEHAVIOR NOR WRAPPED. This file does not decorate, subclass,
// or call into that class's own execute() — it is triggered from a
// structurally different entry point (onCommentaryReceived(), never
// AddPublicationCommentaryUseCase.execute()) and therefore cannot reuse
// execute() without also re-running Commentary creation itself, which
// already happened, on a different device, before this file's own
// handleCommentaryReceived() is ever called. Only the pure, side-effect-
// free construction step that class already performed is shared, pulled
// out to its own exported function with zero behavior change (see that
// file's own 0.9.623 section) — everything else in THIS file (the isNew
// gate, the discoveryProvider lookup, the publisher-identity gate) is its
// own, independent logic.
//
// GATED ON isNew, NEVER ON WHETHER A NOTIFICATION WAS PRODUCED BEFORE. Per
// 0.9.618's own onCommentaryReceived() contract, a re-announce of an
// already-known Commentary still fires the callback, with `isNew: false`.
// This file treats that exactly like PublicationCommentaryStore's own
// dedup already treats it — nothing new happens. Reusing this ALREADY
// authoritative `isNew` flag (established at 0.9.618, reconfirmed live at
// 0.9.620's own Section H) is deliberately preferred over inventing a
// second, notification-specific deduplication mechanism on top of it.
//
// GATED ON THIS REPLICA'S OWN IDENTITY BEING THE RESOLVED PUBLICATION'S
// PUBLISHER — per 0.9.622's own Section I closing recommendation. Every
// authenticated peer that has this Commentary's Publication announced to
// it will have onCommentaryReceived() fire — not only the publisher's own
// device. Without this gate, EVERY such replica would persist a
// NotificationEvent addressed to someone else's identity into its own
// local NotificationEventStore, a fact irrelevant to whoever uses that
// replica. `resolveSigningIdentityId()` (identity/resolveSigningIdentityId.js,
// unmodified) is the SAME tolerant lookup application/
// GetRecipientNotificationEventsUseCase.js already uses to resolve "the
// current identity" — reused here rather than re-derived, and degrading to
// `null` (never throwing) exactly as that file's own header already
// documents, so an unauthenticated replica simply never produces a
// notification for a Commentary it happens to relay.
//
// A MISSING PUBLICATION PRODUCES NO NOTIFICATION, NOT A THROWN ERROR — the
// IDENTICAL restraint PublicationCommentaryNotificationProducer.js already
// documents for its own `findById()` miss, reused here for the SAME
// reason: 0.9.622's own Section B already proved a Commentary can be
// durably stored and independently queryable for a publicationId this
// replica has never locally discovered. This file introduces no
// Publication-synchronization requirement of any kind to make that
// resolvable — an unresolvable Publication is treated exactly like "not
// yet notifiable," never an error.
//
// NO notificationSink FAILURE ISOLATION OF ITS OWN — mirrors
// PublicationCommentaryNotificationProducer.js's own restraint exactly: a
// thrown notificationSink error propagates unmodified out of
// handleCommentaryReceived(). This file's own caller (see ui/main.js's own
// 0.9.623 section) is responsible for isolating that failure from
// Commentary receipt/storage, the identical "best-effort, never undo an
// already-successful prior step" discipline ui/main.js's own
// addPublicationCommentaryCommand() already applies to announce().
//
// DELIBERATELY EXCLUDED FROM THIS MILESTONE: distributed NotificationEvents
// (this file never sends anything over the wire — see application/
// PublicationCommentaryDistributionPeerExchange.js's own "notification
// stays downstream and local" header, unchanged), notification
// synchronization, delivery guarantees, retry queues, subscriptions, new
// notification persistence, Commentary historical synchronization,
// Publication synchronization, Publication authorization changes,
// Commentary discovery, Commentary schema changes, a notification
// deduplication service (isNew, already authoritative, is reused instead),
// notification ranking/prioritization, and UI changes of any kind.
export class PublicationCommentaryRemoteNotificationBridge {
    constructor(discoveryProvider, identityProvider, notificationSink) {
        if (!discoveryProvider || typeof discoveryProvider.findById !== 'function') {
            throw new Error('PublicationCommentaryRemoteNotificationBridge: a discoveryProvider is required');
        }
        if (!identityProvider || typeof identityProvider.getSigningIdentity !== 'function') {
            throw new Error('PublicationCommentaryRemoteNotificationBridge: an identityProvider is required');
        }
        if (typeof notificationSink !== 'function') {
            throw new Error('PublicationCommentaryRemoteNotificationBridge: a notificationSink function is required');
        }
        this._discoveryProvider = discoveryProvider;
        this._identityProvider = identityProvider;
        this._notificationSink = notificationSink;
    }

    // The intended call shape is `peerExchange.onCommentaryReceived((result)
    // => bridge.handleCommentaryReceived(result))` — see this file's own
    // header. Takes the EXACT `{ commentary, isNew }` shape
    // onCommentaryReceived() itself already fires, unmodified. Returns
    // nothing; a caller that wants the produced NotificationEvent reads it
    // from its own notificationSink, exactly as
    // PublicationCommentaryNotificationProducer.js's own callers already do.
    handleCommentaryReceived({ commentary, isNew } = {}) {
        if (!isNew || !commentary) {
            return;
        }
        const publication = this._discoveryProvider.findById(commentary.publicationId);
        if (!publication) {
            return;
        }
        if (resolveSigningIdentityId(this._identityProvider) !== publication.publisherIdentity.id) {
            return;
        }
        const notificationEvent = buildPublicationCommentedNotificationEvent(commentary, publication);
        this._notificationSink(notificationEvent);
    }
}
