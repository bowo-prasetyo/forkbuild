import { CommandHistory } from '../application/CommandHistory.js';
import { PlacementValidator } from '../core/PlacementValidator.js';
import { CollaborationEnvelope } from '../core/CollaborationEnvelope.js';

// The central ordering service for multi-client document synchronization
// (0.2.9).
//
// The DocumentAuthority maintains the AUTHORITATIVE world state for a
// document. All client operations flow through it. It:
//
//   1. Receives operations from clients (via AuthorityCollaborationTransport).
//   2. Deserializes the command via CommandRegistry.
//   3. Checks for conflicts against the current authoritative state.
//   4. If no conflict: applies the command, advances the revision,
//      broadcasts to all other clients, acknowledges the sender.
//   5. If conflict: rejects the sender with a structured reason.
//
// Conflict detection is the heart of this milestone. The key insight:
// most ForkBuild operations are naturally non-conflicting because they
// reference specific brick/group IDs. Two operations on DIFFERENT
// entities can always be applied in any order. Conflicts arise only
// when:
//
//   - A position is already occupied (PlaceBrickCommand)
//   - A referenced brick no longer exists (Move/Rotate/Delete)
//   - A referenced group no longer exists (group commands)
//   - A composite contains any conflicting child
//
// This is NOT full Operational Transform. OT would transform command A
// against command B so both can be applied. Here, we simply reject
// conflicting operations. The client can then re-apply its edit against
// the updated state. This is correct, simple, and sufficient for the
// common cases.
//
// The authority is a SINGLE instance per document. In a future
// distributed system, this would be the server-side component. For
// 0.2.9, it runs in-memory alongside the clients.
export class DocumentAuthority {
    constructor({
        documentId,
        world,
        commandRegistry,
        brickRegistry = null
    }) {
        this._documentId = documentId;
        this._world = world;
        this._commandRegistry = commandRegistry;
        this._brickRegistry = brickRegistry;
        this._placementValidator = new PlacementValidator();

        // The authoritative command history. This is the "server state."
        this._history = new CommandHistory({ world });
        this._revision = 0;

        // Connected clients: author -> callback(envelope)
        this._clients = new Map();

        // Seen operation IDs for idempotency.
        this._seenOperationIds = new Set();
    }

    get documentId() { return this._documentId; }
    get revision() { return this._revision; }
    get world() { return this._world; }

    // ---------------------------------------------------------
    // Client management
    // ---------------------------------------------------------

    connect(author, receiveCallback) {
        this._clients.set(author, receiveCallback);
    }

    disconnect(author) {
        this._clients.delete(author);
    }

    // ---------------------------------------------------------
    // Operation processing
    // ---------------------------------------------------------

    // Receives an operation envelope from a client. Returns an
    // acknowledgement or rejection envelope.
    //
    // This is the single entry point for all client operations.
    receiveOperation(envelope) {
        const { operationId, sequenceNumber, baseRevision, command: commandJson } = envelope.payload;

        // Idempotency: ignore duplicate operations.
        if (this._seenOperationIds.has(operationId)) {
            return CollaborationEnvelope.acknowledge({
                documentId: this._documentId,
                author: 'authority',
                operationId,
                appliedRevision: this._revision
            });
        }

        // Deserialize the command.
        let command;
        try {
            command = this._commandRegistry.fromJSON(commandJson);
        } catch (error) {
            return CollaborationEnvelope.reject({
                documentId: this._documentId,
                author: 'authority',
                operationId,
                reason: `Deserialization failed: ${error.message}`
            });
        }

        // Check for conflicts against the current authoritative state.
        const conflict = this._detectConflict(command);
        if (conflict) {
            return CollaborationEnvelope.reject({
                documentId: this._documentId,
                author: 'authority',
                operationId,
                reason: conflict
            });
        }

        // Apply the command to the authoritative world.
        this._seenOperationIds.add(operationId);
        this._history.execute(command);
        this._revision += 1;

        // Broadcast to all OTHER clients.
        const broadcastEnvelope = CollaborationEnvelope.operation({
            documentId: this._documentId,
            author: envelope.author,
            operationId,
            sequenceNumber,
            baseRevision: this._revision,
            command: commandJson
        });

        for (const [clientAuthor, receiveCallback] of this._clients) {
            if (clientAuthor !== envelope.author) {
                receiveCallback(broadcastEnvelope);
            }
        }

        // Acknowledge to the sender.
        return CollaborationEnvelope.acknowledge({
            documentId: this._documentId,
            author: 'authority',
            operationId,
            appliedRevision: this._revision
        });
    }

    // ---------------------------------------------------------
    // Conflict detection
    // ---------------------------------------------------------

    // Checks whether a command can be applied to the current
    // authoritative world state. Returns null if no conflict,
    // or a human-readable conflict description.
    _detectConflict(command) {
        const type = command.type;

        switch (type) {
            case 'place-brick':
                return this._checkPlacement(command);

            case 'move-brick':
            case 'rotate-brick':
                return this._checkBrickExists(command.worldId, command.buildingId, command.brickId);

            case 'delete-brick':
                return this._checkBrickExists(command.worldId, command.buildingId, command.brickId);

            case 'transform-selection':
                return this._checkTransformSelection(command);

            case 'paste-bricks':
                // Paste always creates new bricks — no conflict.
                return null;

            case 'composite':
                return this._checkComposite(command);

            case 'create-group':
                return this._checkCreateGroup(command);

            case 'delete-group':
                return this._checkGroupExists(command.worldId, command.groupId);

            case 'rename-group':
                return this._checkGroupExists(command.worldId, command.groupId);

            case 'add-to-group':
                return this._checkGroupExists(command.worldId, command.groupId);

            case 'remove-from-group':
                return this._checkGroupExists(command.worldId, command.groupId);

            case 'duplicate-group':
                return this._checkGroupExists(command.worldId, command.groupId);

            default:
                // Unknown command types pass through — the CommandHistory
                // will reject them if they're truly invalid.
                return null;
        }
    }

    _checkPlacement(command) {
        // Check that the building exists.
        const building = this._world.getBuilding(command.buildingId);
        if (!building) {
            return `Building ${command.buildingId} not found`;
        }
        // Check that the position is not already occupied.
        if (!this._placementValidator.canPlace(this._world, command.buildingId, command.position)) {
            return `Position (${command.position.x}, ${command.position.y}, ${command.position.z}) is already occupied`;
        }
        return null;
    }

    _checkBrickExists(worldId, buildingId, brickId) {
        if (worldId !== this._world.id) {
            return `World ID mismatch: expected ${this._world.id}, got ${worldId}`;
        }
        const building = this._world.getBuilding(buildingId);
        if (!building) {
            return `Building ${buildingId} not found`;
        }
        const brick = building.findBrick(brickId);
        if (!brick) {
            return `Brick ${brickId} not found (may have been deleted by another client)`;
        }
        return null;
    }

    _checkTransformSelection(command) {
        if (command.worldId !== this._world.id) {
            return `World ID mismatch`;
        }
        for (const transform of command.transforms) {
            const building = this._world.getBuilding(transform.buildingId);
            if (!building) {
                return `Building ${transform.buildingId} not found`;
            }
            const brick = building.findBrick(transform.brickId);
            if (!brick) {
                return `Brick ${transform.brickId} not found (may have been deleted by another client)`;
            }
        }
        return null;
    }

    _checkComposite(command) {
        for (const child of command.commands) {
            const conflict = this._detectConflict(child);
            if (conflict) {
                return `Composite child conflict: ${conflict}`;
            }
        }
        return null;
    }

    _checkCreateGroup(command) {
        if (command.worldId !== this._world.id) {
            return `World ID mismatch`;
        }
        for (const brickId of command.brickIds) {
            const found = this._findBrickAnywhere(brickId);
            if (!found) {
                return `Brick ${brickId} not found for group creation`;
            }
        }
        return null;
    }

    _checkGroupExists(worldId, groupId) {
        if (worldId !== this._world.id) {
            return `World ID mismatch`;
        }
        const group = this._world.getGroup(groupId);
        if (!group) {
            return `Group ${groupId} not found`;
        }
        return null;
    }

    _findBrickAnywhere(brickId) {
        for (const building of this._world.getBuildings()) {
            if (building.findBrick(brickId)) {
                return true;
            }
        }
        return false;
    }
}
