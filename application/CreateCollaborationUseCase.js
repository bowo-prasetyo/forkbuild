import { LocalCollaborationTransport } from '../collaboration/LocalCollaborationTransport.js';
import { AuthorityCollaborationTransport } from '../collaboration/AuthorityCollaborationTransport.js';
import { DocumentAuthority } from '../collaboration/DocumentAuthority.js';
import { CollaborationSession } from '../collaboration/CollaborationSession.js';
import { CreateCommandRegistryUseCase } from './CreateCommandRegistryUseCase.js';
import { CreateBrickRegistryUseCase } from './CreateBrickRegistryUseCase.js';

// Builds the collaboration backend and returns a session factory (0.2.9).
//
// Two modes:
//
//   Direct mode (0.2.7): LocalCollaborationTransport broadcasts
//   operations directly between clients. No conflict detection.
//   Suitable for testing and single-user scenarios.
//
//   Authority mode (0.2.9): AuthorityCollaborationTransport routes
//   operations through a DocumentAuthority that detects conflicts,
//   orders operations globally, and rejects conflicting ones.
//   Suitable for multi-client editing.
//
// Usage:
//   const { createSession, authority } = new CreateCollaborationUseCase()
//       .executeAuthority(documentId, world);
//   const sessionA = createSession({ author: 'alice', commandHistory: historyA });
//   const sessionB = createSession({ author: 'bob', commandHistory: historyB });
export class CreateCollaborationUseCase {
    // Direct mode (0.2.7 behavior, unchanged).
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

    // Authority mode (0.2.9). Creates a DocumentAuthority for the
    // given document and returns a session factory that routes through
    // the authority.
    executeAuthority(documentId, world) {
        const commandRegistry = new CreateCommandRegistryUseCase().execute();
        const brickRegistry = new CreateBrickRegistryUseCase().execute();

        const authority = new DocumentAuthority({
            documentId,
            world,
            commandRegistry,
            brickRegistry
        });

        const transport = new AuthorityCollaborationTransport(authority);

        return {
            authority,
            transport,
            commandRegistry,
            createSession({ author, commandHistory }) {
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
