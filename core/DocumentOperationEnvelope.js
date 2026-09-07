// 0.9.222 — Shared Document Edit Operation Boundary.
//
// The wire vocabulary for `application/DocumentCommandPropagationUseCase.js`'s
// own protocol (`forkbuild:document-sync`) — a SEPARATE protocol from
// `forkbuild:world-sync` (core/WorldOperationEnvelope.js), never a rename or
// generalization of it. See docs/Roadmap.md, 0.9.222's own header for why:
// World View's own live collaboration (0.2.96-0.3.5) already proved this
// exact shape for World documents; this file brings the SAME closed
// discipline to the OTHER kind of Document this codebase edits live — the
// Editor's own Structure/blueprint documents (ui/views/EditorView.js,
// application/EditorSession.js) — which had no propagation protocol of
// any kind before this milestone. Kept as its own file rather than
// widening WorldOperationEnvelope's own `worldDocumentId` field, the same
// "own file per subsystem, even when nearly identical in shape to a
// sibling" discipline core/WorldEditAuthorizationEnvelope.js already holds
// next to core/DeviceAuthorizationEnvelope.js.
//
// A single, closed shape — there is only one kind of thing that ever
// travels here: one already-executed local `application/commands/Command.js`
// instance, serialized exactly the way `application/CommandHistory.js`
// already persists it (`command.toJSON()`), addressed at a specific
// Document. Nothing here ever carries a Document snapshot or a diff — see
// core/WorldOperationEnvelope.js's own header, "do not synchronize the
// whole document," which applies here unchanged.
//
// Fields:
//   operationId       — the command's OWN `id` — never a second
//                        identifier. The SAME command, retransmitted,
//                        carries the SAME operationId, and
//                        `replication/ReplayGuard.js` (keyed by
//                        `operationId`, scoped under `documentId`) answers
//                        "have I already accepted this" the identical way
//                        it already does for World operations.
//   documentId        — the Document this operation targets (a Document's
//                        own identity IS its `world.id` — see
//                        core/Document.js's own header and
//                        application/SaveDocumentUseCase.js, `const id =
//                        document.world.id`). Always compared against the
//                        RECEIVER's own locally-known Document for this
//                        id — an operation naming a Document the receiver
//                        has never opened is refused, not silently
//                        created.
//   authorIdentityId  — the SENDING DEVICE's own raw, cryptographically-
//                        authenticated identityId (never a social/parent
//                        identity) — checked against the connection's own
//                        proven identity BEFORE any device-aware
//                        resolution happens, the same two-step discipline
//                        application/WorldCommandPropagationUseCase.js's
//                        own header describes.
//   command           — the serialized command (`command.toJSON()`),
//                        reconstructed on the receiving side through the
//                        SAME `application/commands/CommandRegistry.js`
//                        every local undo/redo/replay path already uses.
//
// Deliberately absent, on purpose, for THIS milestone (see
// application/DocumentCommandPropagationUseCase.js's own header for the
// full boundary-vs-convergence argument): no `logicalClock`. World's own
// ordering/conflict-resolution field (core/WorldOperationEnvelope.js's own
// 0.2.97 addition) answers a question this milestone deliberately does not
// yet ask for Editor documents — a later milestone may add it here the
// exact same way 0.2.97 added it to World's own envelope, as optional,
// additive metadata, never a breaking reshape.
//
// 0.9.227 — Document Operation Identity & Causal Predecessor Boundary
// makes exactly that later addition, following the SAME "optional,
// additive, degrades to a documented default on read" discipline
// core/WorldOperationEnvelope.js's own 0.2.97 `logicalClock` field
// established:
//
//   causalPredecessors — the operationIds this operation's AUTHOR had
//                        already applied, in THIS document, at the
//                        moment it authored this one — never a second
//                        identifier for the operation itself, and never
//                        wall-clock or send-time order (see
//                        core/DocumentOperationCausality.js's own header
//                        for the full semantics and the deliberate
//                        boundary against a synchronization mechanism).
//                        OPTIONAL for validation purposes: absent
//                        (undefined) is a valid, pre-0.9.227-shaped
//                        envelope and degrades to `[]` on read — a
//                        genesis operation with no known causal
//                        history — the same "graceful degrade" way
//                        `core/WorldOperationEnvelope.js#logicalClock`
//                        degrades to 0. A value that IS present must be
//                        an array of non-empty operationId strings, each
//                        within `MAX_DOCUMENT_SYNC_ID_LENGTH`, with no
//                        duplicates and never containing this same
//                        operation's own `operationId` (an operation is
//                        never its own causal predecessor).
export const DocumentOperationKind = Object.freeze({
    OPERATION: 'OPERATION'
});

export function isValidDocumentOperationKind(value) {
    return value === DocumentOperationKind.OPERATION;
}

export const MAX_DOCUMENT_SYNC_ID_LENGTH = 512;

export function toDocumentOperationEnvelope({ operationId, documentId, authorIdentityId, command, causalPredecessors }) {
    if (!operationId || typeof operationId !== 'string') {
        throw new Error('toDocumentOperationEnvelope: operationId is required');
    }
    if (!documentId || typeof documentId !== 'string') {
        throw new Error('toDocumentOperationEnvelope: documentId is required');
    }
    if (!authorIdentityId || typeof authorIdentityId !== 'string') {
        throw new Error('toDocumentOperationEnvelope: authorIdentityId is required');
    }
    if (!command || typeof command !== 'object' || Array.isArray(command) || !command.type) {
        throw new Error('toDocumentOperationEnvelope: command must be a serialized Command with a type');
    }
    // 0.9.227 — see this file's own header. Absent input degrades to
    // `[]` (a genesis operation) rather than throwing: causal metadata is
    // layered onto an otherwise-unchanged 0.9.226 envelope, never a
    // second required field a pre-0.9.227 caller must learn about. A
    // PRESENT-but-malformed value is a caller error, not something to
    // silently coerce.
    const resolvedPredecessors = causalPredecessors === undefined ? [] : causalPredecessors;
    if (!isValidCausalPredecessorList(resolvedPredecessors, operationId)) {
        throw new Error('toDocumentOperationEnvelope: causalPredecessors must be an array of distinct, non-empty operationId strings that does not include this operation\'s own operationId');
    }
    return {
        kind: DocumentOperationKind.OPERATION,
        operationId,
        documentId,
        authorIdentityId,
        command,
        causalPredecessors: [...resolvedPredecessors]
    };
}

export function isValidDocumentOperationEnvelope(value) {
    return Boolean(value)
        && typeof value === 'object'
        && !Array.isArray(value)
        && isValidDocumentOperationKind(value.kind)
        && typeof value.operationId === 'string' && value.operationId.length > 0 && value.operationId.length <= MAX_DOCUMENT_SYNC_ID_LENGTH
        && typeof value.documentId === 'string' && value.documentId.length > 0 && value.documentId.length <= MAX_DOCUMENT_SYNC_ID_LENGTH
        && typeof value.authorIdentityId === 'string' && value.authorIdentityId.length > 0 && value.authorIdentityId.length <= MAX_DOCUMENT_SYNC_ID_LENGTH
        && Boolean(value.command)
        && typeof value.command === 'object'
        && !Array.isArray(value.command)
        && typeof value.command.type === 'string' && value.command.type.length > 0
        // 0.9.227 — OPTIONAL: absent (undefined) is a valid, pre-0.9.227-
        // shaped envelope; a value that IS present must be a well-formed
        // causal predecessor list (see this file's own header).
        && (value.causalPredecessors === undefined || isValidCausalPredecessorList(value.causalPredecessors, value.operationId));
}

// A well-formed causal predecessor list: an array of non-empty,
// bounded-length operationId strings, no duplicates, and never
// containing `ownOperationId` itself. Exported so
// `core/DocumentOperationCausality.js` — which builds the causal GRAPH
// out of these lists — validates against this exact same rule rather
// than a second, possibly-drifting copy of it.
export function isValidCausalPredecessorList(value, ownOperationId) {
    if (!Array.isArray(value)) {
        return false;
    }
    const seen = new Set();
    for (const predecessorId of value) {
        if (typeof predecessorId !== 'string' || predecessorId.length === 0 || predecessorId.length > MAX_DOCUMENT_SYNC_ID_LENGTH) {
            return false;
        }
        if (predecessorId === ownOperationId) {
            return false;
        }
        if (seen.has(predecessorId)) {
            return false;
        }
        seen.add(predecessorId);
    }
    return true;
}
