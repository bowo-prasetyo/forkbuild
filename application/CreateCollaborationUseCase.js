import { LocalCollaborationTransport } from '../collaboration/LocalCollaborationTransport.js';
import { CollaborationSession } from '../collaboration/CollaborationSession.js';
import { CreateCommandRegistryUseCase } from './CreateCommandRegistryUseCase.js';

// Builds the concrete collaboration backend and returns a session
// factory, so ui/ never imports collaboration/ directly. Same DI
// pattern as CreatePersistenceUseCase and CreateWorldViewUseCase.
//
// The returned factory creates a CollaborationSession bound to a
// specific document and author, wired to the given CommandHistory.
// Swapping to a WebSocket transport later means changing exactly this
// one file.
//
// Usage:
//   const { createSession } = new CreateCollaborationUseCase().execute();
//   const collabSession = createSession({
//       documentId, author, commandHistory
//   });
//   collabSession.start();
//   // ... user edits flow through CommandHistory as usual ...
//   collabSession.stop();
export class CreateCollaborationUseCase {
    execute() {
        const transport = new LocalCollaborationTransport();
        const commandRegistry = new CreateCommandRegistryUseCase().execute();

        return {
            transport,
            commandRegistry,
            createSession({ documentId, author, commandHistory }) {
                return new CollaborationSession({
                    documentId,
                    author,
                    commandHistory,
                    commandRegistry,
                    transport
                });
            }
        };
    }
}
