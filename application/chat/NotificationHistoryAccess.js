// App-wide access to the signed-in identity's Notification History, for the
// Notifications panel in the app's header, which is open on every page
// rather than only inside World View.
//
// It reads through the same GetRecipientNotificationEventsUseCase World View's
// session uses, over the same storage: NotificationEventStore keeps no cache,
// so whatever any composition root has saved is visible here immediately.
//
// A notification's publicationId is resolved to the documentId World View
// opens, through `publicationLookup` (`findById(publicationId)`), the same
// exact-id lookup WorldNavigationSession#findPublicationById() performs.
export class NotificationHistoryAccess {
    // `getRecipientNotificationEventsUseCase` is null without an identity
    // provider; the history is then empty, as World View's session reports it.
    constructor({ getRecipientNotificationEventsUseCase = null, publicationLookup = null } = {}) {
        this._getRecipientNotificationEventsUseCase = getRecipientNotificationEventsUseCase;
        this._publicationLookup = publicationLookup;
    }

    // NotificationEvent[] in the use case's own order. Rethrows the use case's
    // error (no authenticated identity) for the panel to show, without its
    // class-name prefix: this panel is reachable from every page.
    getRecipientNotificationEvents() {
        if (!this._getRecipientNotificationEventsUseCase) {
            return [];
        }
        try {
            return this._getRecipientNotificationEventsUseCase.execute();
        } catch (error) {
            const message = (error && typeof error.message === 'string') ? error.message.replace(/^\w+UseCase:\s*/, '') : '';
            throw new Error(message ? message.charAt(0).toUpperCase() + message.slice(1) : 'Notifications could not be loaded.');
        }
    }

    // The documentId of the Publication a notification names, or null when it
    // is unknown here or has no document. Never throws.
    findPublicationDocumentId(publicationId) {
        if (!this._publicationLookup || typeof publicationId !== 'string' || publicationId.length === 0) {
            return null;
        }
        try {
            const publication = this._publicationLookup.findById(publicationId);
            return (publication && typeof publication.documentId === 'string' && publication.documentId.length > 0)
                ? publication.documentId
                : null;
        } catch {
            return null;
        }
    }
}
