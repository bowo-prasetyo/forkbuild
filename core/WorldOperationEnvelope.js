// 0.2.96 — Shared World Command Propagation.
//
// The wire vocabulary for `application/WorldCommandPropagationUseCase.js`'s
// own protocol (`forkbuild:world-sync`) — deliberately a SEPARATE protocol
// from `forkbuild:chat`/`forkbuild:device-conversation-sync`, never a new
// message kind riding either of those. See that use case's own header, and
// docs/Principles.md, "World Synchronization Is A Command Protocol, Never A
// Document Sync Channel" (0.2.96).
//
// A single, closed shape — there is only one kind of thing that ever
// travels here: one already-executed local `application/commands/Command.js`
// instance, serialized exactly the way `application/CommandHistory.js`
// already persists it (`command.toJSON()`), addressed at a specific World
// document. Nothing here ever carries a World snapshot, a Document diff, or
// a placement list — see this milestone's own "do not synchronize the whole
// document" rule.
//
// Fields:
//   operationId       — the command's OWN `id` (application/commands/
//                        Command.js already mints a fresh createId() per
//                        instance) — never a second identifier. This is
//                        what makes idempotency free: the SAME command,
//                        retransmitted, carries the SAME operationId, and
//                        `replication/ReplayGuard.js` (keyed by
//                        `operationId` scoped under `worldDocumentId`) is
//                        exactly the "have I already accepted this"
//                        question it already answers for every other
//                        immutable, content-addressed object in this
//                        codebase.
//   worldDocumentId   — the World document this operation targets. Always
//                        compared against the RECEIVER's own locally-known
//                        World for this id — an operation naming a World
//                        the receiver has never heard of is refused, not
//                        silently created (see this file's own header,
//                        "replay protection").
//   authorIdentityId  — the SENDING DEVICE's own raw, cryptographically-
//                        authenticated identityId (never a social/parent
//                        identity — see application/
//                        WorldCommandPropagationUseCase.js's own header on
//                        why device-aware resolution happens strictly
//                        AFTER this field is checked against the
//                        connection's own proven identity, exactly the
//                        two-step application/ChatUseCase.js#_handleIncoming()
//                        already established: "the claim in the payload"
//                        is step 1, "what social identity does that
//                        resolve to" is step 2, never conflated).
//   command           — the serialized command (`command.toJSON()`),
//                        reconstructed on the receiving side through the
//                        SAME `application/commands/CommandRegistry.js`
//                        every local undo/redo/replay path already uses —
//                        no second serialization format.
export const WorldOperationKind = Object.freeze({
    OPERATION: 'OPERATION'
});

export function isValidWorldOperationKind(value) {
    return value === WorldOperationKind.OPERATION;
}

export const MAX_WORLD_SYNC_ID_LENGTH = 512;

export function toWorldOperationEnvelope({ operationId, worldDocumentId, authorIdentityId, command }) {
    if (!operationId || typeof operationId !== 'string') {
        throw new Error('toWorldOperationEnvelope: operationId is required');
    }
    if (!worldDocumentId || typeof worldDocumentId !== 'string') {
        throw new Error('toWorldOperationEnvelope: worldDocumentId is required');
    }
    if (!authorIdentityId || typeof authorIdentityId !== 'string') {
        throw new Error('toWorldOperationEnvelope: authorIdentityId is required');
    }
    if (!command || typeof command !== 'object' || Array.isArray(command) || !command.type) {
        throw new Error('toWorldOperationEnvelope: command must be a serialized Command with a type');
    }
    return {
        kind: WorldOperationKind.OPERATION,
        operationId,
        worldDocumentId,
        authorIdentityId,
        command
    };
}

export function isValidWorldOperationEnvelope(value) {
    return Boolean(value)
        && typeof value === 'object'
        && !Array.isArray(value)
        && isValidWorldOperationKind(value.kind)
        && typeof value.operationId === 'string' && value.operationId.length > 0 && value.operationId.length <= MAX_WORLD_SYNC_ID_LENGTH
        && typeof value.worldDocumentId === 'string' && value.worldDocumentId.length > 0 && value.worldDocumentId.length <= MAX_WORLD_SYNC_ID_LENGTH
        && typeof value.authorIdentityId === 'string' && value.authorIdentityId.length > 0 && value.authorIdentityId.length <= MAX_WORLD_SYNC_ID_LENGTH
        && Boolean(value.command)
        && typeof value.command === 'object'
        && !Array.isArray(value.command)
        && typeof value.command.type === 'string' && value.command.type.length > 0;
}
