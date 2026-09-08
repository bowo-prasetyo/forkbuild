import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { PublicationCommentaryStore } from '../storage/PublicationCommentaryStore.js';
import { NotificationEventStore } from '../storage/NotificationEventStore.js';
import { CanCommentOnPublicationUseCase } from './CanCommentOnPublicationUseCase.js';
import { GetPublicationCommentariesUseCase } from './GetPublicationCommentariesUseCase.js';
import { AddPublicationCommentaryUseCase } from './AddPublicationCommentaryUseCase.js';
import { PublicationCommentaryNotificationProducer } from './PublicationCommentaryNotificationProducer.js';

// 0.9.289 — Other-Publication Commentary Entry Point.
//
// 0.9.288's own Section E finding: Publication Commentary's application
// layer (CanCommentOnPublicationUseCase, GetPublicationCommentariesUseCase,
// AddPublicationCommentaryUseCase, PublicationCommentaryNotificationProducer)
// is already ownership-agnostic and already composed — but only ONE
// composition root ever builds it, application/CreateWorldViewUseCase.js,
// which exists to build a WorldNavigationSession for ui/views/WorldView.js
// alone. A UI surface outside World View (a Discovery-facing Publication
// view, for instance) has no WorldNavigationSession to ask, and building
// one just to reach commentary would drag in every other thing a session
// composes — avatars, placement, presence, none of it relevant here.
//
// This file is the SAME composition ui/main.js already performs for
// peerRelationshipUseCase/chatOutbox/etc. — one small, standalone
// `Create*UseCase` factory (see application/CreateDiscoveryUseCase.js's
// own header, "same shape as CreatePersistenceUseCase and
// CreatePublisherUseCase") — applied to commentary alone, so any UI
// surface can reach the identical write path WITHOUT a WorldNavigationSession.
//
//   identityProvider   (the ONE app-wide instance ui/main.js already owns
//        │               — never a second identity mechanism)
//        ▼
//   CreatePublicationCommentaryUseCase.execute(identityProvider)
//        │
//        ├── getPublicationCommentariesCommand(publicationId)
//        │        -> GetPublicationCommentariesUseCase.execute()   (0.9.247,
//        │           unmodified)
//        │
//        └── addPublicationCommentaryCommand({ publicationId, content })
//                 -> PublicationCommentaryNotificationProducer.execute()
//                    (0.9.275, unmodified) -> AddPublicationCommentaryUseCase.execute()
//                    (0.9.244-0.9.246, unmodified) -> CanCommentOnPublicationUseCase
//                    (0.9.246, unmodified)
//
// NO NEW USE CASE, NO NEW STORE, NO SECOND WRITE PATH. Every class this
// file imports already existed before this milestone and is constructed
// here exactly the way application/CreateWorldViewUseCase.js's own
// 0.9.248/0.9.285 sections already construct it (identical constructor
// argument order, identical notificationSink shape) — see that file's own
// header for the original wiring this one mirrors. There is no
// `OtherPublicationCommentaryUseCase`, no `AddCommentToOtherPublicationUseCase`,
// and no ownership check of any kind added anywhere in this file: whether
// the Publication being commented on belongs to the caller is not a
// question this composition — or anything it wires — ever asks.
//
// A SECOND COMPOSITION, NEVER A SECOND SOURCE OF TRUTH. `storageProvider`
// is a fresh `LocalStorageProvider` instance, exactly like
// application/CreateDiscoveryUseCase.js's own (used by
// ui/components/PublicationCatalog.js, independent of
// application/CreateWorldViewUseCase.js's own instance) — both read/write
// the SAME `window.localStorage` keys (see storage/LocalStorageProvider.js's
// own header), so a Commentary created through THIS composition is
// immediately visible to World View's own OwnPublicationPanel reading
// through ITS composition, and vice versa. Two independently constructed
// PublicationCommentaryStore/NotificationEventStore instances, one
// underlying store each.
//
// THE COMMANDS RETURNED HERE ARE THE IDENTICAL SHAPE
// ui/views/WorldView.js's OWN getPublicationCommentariesCommand()/
// addPublicationCommentaryCommand() ALREADY ARE — a `(publicationId) ->
// PublicationCommentary[]` function and a `({ publicationId, content }) ->
// { commentary, isNew }` function — so any UI component already written
// against OwnPublicationPanel's own command-prop contract (see
// ui/components/OwnPublicationPanel.js's own 0.9.248 header) can accept
// either this file's commands or WorldView's own, unmodified.
export class CreatePublicationCommentaryUseCase {
    execute(identityProvider) {
        const storageProvider = new LocalStorageProvider();
        const discoveryProvider = new LocalDiscoveryProvider(storageProvider);
        const publicationCommentaryStore = new PublicationCommentaryStore(storageProvider);
        const notificationEventStore = new NotificationEventStore(storageProvider);

        const canCommentOnPublicationUseCase = new CanCommentOnPublicationUseCase(discoveryProvider);
        const getPublicationCommentariesUseCase = new GetPublicationCommentariesUseCase(publicationCommentaryStore);
        const addPublicationCommentaryUseCase = new AddPublicationCommentaryUseCase(
            publicationCommentaryStore,
            identityProvider,
            canCommentOnPublicationUseCase
        );
        // Reuses the SAME decorator ui/main.js's own
        // publicationCommentaryCapability already wraps
        // addPublicationCommentaryUseCase with — see
        // application/CreateWorldViewUseCase.js's own 0.9.285 header. Every
        // Commentary created through this composition produces the
        // identical `publication.commented` NotificationEvent World View's
        // own path already does, through the SAME notificationEventStore
        // key NotificationHistoryPanel already reads back.
        const publicationCommentaryCapability = new PublicationCommentaryNotificationProducer(
            addPublicationCommentaryUseCase,
            discoveryProvider,
            (notificationEvent) => notificationEventStore.save(notificationEvent)
        );

        // Mirrors ui/views/WorldView.js's own getPublicationCommentaries()
        // guard exactly: no publicationId, no result — never a thrown
        // error for a call a caller made before a Publication was ready.
        function getPublicationCommentariesCommand(publicationId) {
            if (!publicationId) {
                return [];
            }
            return getPublicationCommentariesUseCase.execute({ publicationId });
        }

        // Deliberately NOT wrapped in try/catch — the identical restraint
        // ui/views/WorldView.js's own addPublicationCommentaryCommand()
        // already holds (see that file's own header): a thrown error
        // (missing identity, authorization denial, a storage conflict) is
        // for the calling UI component to catch and render as its own
        // commentary error state.
        function addPublicationCommentaryCommand({ publicationId, content }) {
            return publicationCommentaryCapability.execute({ publicationId, content });
        }

        return { getPublicationCommentariesCommand, addPublicationCommentaryCommand };
    }
}
