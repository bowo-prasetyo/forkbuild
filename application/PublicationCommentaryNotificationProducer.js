import { NotificationEvent } from '../core/NotificationEvent.js';

// 0.9.275 — Publication Commentary Notification Producer.
//
// 0.9.274's own boundary audit found exactly two candidates ready to
// become a real `NotificationEvent` producer without inventing new
// architecture, and recommended Publication Commentary first: its
// `commentaryId` is durable and independently re-derivable from an
// already append-only store, its recipient (`Publication.publisherIdentity`)
// is a real, already-on-file field, and its `createdAt` is a genuine fact
// timestamp — nothing here required new persistence design or a new
// relationship. This milestone is that producer, and deliberately only
// that producer:
//
//   AddPublicationCommentaryUseCase.execute()   (0.9.246, unmodified)
//        │
//        ├── construct Commentary
//        ├── persist Commentary
//        ▼
//   { commentary, isNew }
//        │
//        ▼
//   discoveryProvider.findById(commentary.publicationId)   (existing
//        │                                                   discovery/
//        │                                                   infrastructure,
//        │                                                   unmodified)
//        ▼
//   Publication.publisherIdentity.id
//        │
//        ▼
//   NotificationEvent                            (0.9.273, unmodified)
//        │
//        ▼
//   notificationSink(notificationEvent)          (injected — THIS
//                                                  milestone's only new
//                                                  seam)
//
// A DECORATOR, NOT A MODIFICATION. This file wraps a real
// AddPublicationCommentaryUseCase instance rather than adding a fourth
// constructor argument to it. AddPublicationCommentaryUseCase.js is left
// completely unmodified — every existing caller and every existing test
// that constructs it with its current three collaborators keeps working
// unchanged. Producing a NotificationEvent is additive behavior layered
// in front of an unchanged command, exactly the composition shape
// application/SpatialEditingService.js already uses for
// WorldAuthorizationService's own decision ("ask, don't own, the
// decision") — here extended one step further: ask the wrapped use case
// to do its own job, then react to what it already produced.
//
// NO NOTIFICATION PERSISTENCE, INBOX, OR DELIVERY OF ANY KIND. Per this
// milestone's own brief, `notificationSink` is a plain injected function
// — `(notificationEvent) => void` — never a `NotificationStore`,
// `NotificationInbox`, `NotificationDelivery`, `NotificationCenter`, or
// `ChatOutbox`. This file has no opinion on what the sink does with the
// event; it only constructs the event and hands it over.
//
// ORDERING: NOTIFICATION CONSTRUCTION ONLY AFTER SUCCESSFUL PERSISTENCE.
// `this._addPublicationCommentaryUseCase.execute()` runs first, unguarded
// by any try/catch here; a thrown error (validation, authorization, or a
// genuine storage write failure) propagates immediately, and no
// NotificationEvent is ever constructed for a Commentary that was never
// successfully persisted. No new transaction or rollback semantics are
// introduced to achieve this — it falls directly out of running these two
// steps in this order with nothing to undo.
//
// A NOTIFICATION SINK FAILURE NEVER UNDOES THE ALREADY-PERSISTED
// COMMENTARY. If `notificationSink()` throws, that error propagates
// unmodified out of this file's own `execute()` — this file performs no
// try/catch of its own around the sink call, the same "let it propagate"
// discipline AddPublicationCommentaryUseCase.js's own header already
// documents for storage write failures. The Commentary itself was already
// saved through the wrapped use case before the sink was ever called, and
// nothing in this file reaches back to undo, retry, or re-queue that
// write.
//
// EVERY SUCCESSFUL COMMENTARY PRODUCES A NOTIFICATION — INCLUDING
// SELF-COMMENTARY. Per this milestone's own brief, this file does not
// invent a rule suppressing notifications when the commentary's author is
// also the Publication's own publisher. Whether self-notifications should
// ever be suppressed is a later, separate product decision — this
// producer's own job is only "a Commentary was created; tell the
// publisher," unconditionally.
//
// PAYLOAD IS DELIBERATELY FACTUAL, NOTHING PRESENTATIONAL. Exactly the
// three identifiers 0.9.274 Section E already proved sufficient:
// `publicationId`, `commentaryId`, `authorIdentityId`. No title, message,
// icon, URL, or any other display-shaped field is added here — those
// belong to a future presentation layer that reads a NotificationEvent
// back out, never to the producer that constructs one.
//
// A MISSING PUBLICATION PRODUCES NO NOTIFICATION, NOT A THROWN ERROR. In
// ordinary operation this cannot happen — the wrapped use case already
// requires `canCommentOnPublicationUseCase` to resolve the same
// publicationId through the same kind of discovery lookup before a
// Commentary is ever constructed. But this file does not assume its own
// `discoveryProvider` is necessarily the same instance, or reads the
// identical state, at the exact moment it looks again — so a
// `findById()` miss here is treated the same way Section B3 of 0.9.274's
// own audit treated "no recipient exists": skip producing a
// NotificationEvent, rather than inventing a placeholder recipient or
// failing an already-succeeded Commentary creation over a notification
// that has nowhere to go.
export const PUBLICATION_COMMENTED_EVENT_TYPE = 'publication.commented';

export class PublicationCommentaryNotificationProducer {
    constructor(addPublicationCommentaryUseCase, discoveryProvider, notificationSink) {
        if (!addPublicationCommentaryUseCase || typeof addPublicationCommentaryUseCase.execute !== 'function') {
            throw new Error('PublicationCommentaryNotificationProducer: an AddPublicationCommentaryUseCase is required');
        }
        if (!discoveryProvider || typeof discoveryProvider.findById !== 'function') {
            throw new Error('PublicationCommentaryNotificationProducer: a discoveryProvider is required');
        }
        if (typeof notificationSink !== 'function') {
            throw new Error('PublicationCommentaryNotificationProducer: a notificationSink function is required');
        }
        this._addPublicationCommentaryUseCase = addPublicationCommentaryUseCase;
        this._discoveryProvider = discoveryProvider;
        this._notificationSink = notificationSink;
    }

    // Delegates entirely to the wrapped AddPublicationCommentaryUseCase,
    // then — only once that call has already returned successfully —
    // constructs a `publication.commented` NotificationEvent addressed to
    // the Publication's own publisherIdentity and hands it to the
    // injected notificationSink. Returns the exact `{ commentary, isNew }`
    // shape the wrapped use case returned, unmodified, whether or not a
    // notification was produced.
    execute(input) {
        const result = this._addPublicationCommentaryUseCase.execute(input);
        const { commentary } = result;

        const publication = this._discoveryProvider.findById(commentary.publicationId);
        if (publication) {
            const notificationEvent = new NotificationEvent({
                eventType: PUBLICATION_COMMENTED_EVENT_TYPE,
                recipientIdentityId: publication.publisherIdentity.id,
                createdAt: commentary.createdAt,
                payload: {
                    publicationId: commentary.publicationId,
                    commentaryId: commentary.commentaryId,
                    authorIdentityId: commentary.authorIdentityId
                }
            });
            this._notificationSink(notificationEvent);
        }

        return result;
    }
}
