import { isValidDocumentOperationEnvelope, MAX_DOCUMENT_SYNC_ID_LENGTH } from './DocumentOperationEnvelope.js';

// 0.9.230 — Causal Gap Recovery Request Boundary.
//
// 0.9.228/0.9.229 made a missing causal predecessor OBSERVABLE — every
// operation this replica actually receives now produces a `CausalGapStatus`
// result naming exactly which predecessor operationIds it does not yet
// know. Nothing before this milestone could act on that fact: a replica
// could know it was missing an operation, with no way to ask for it. This
// file is the wire vocabulary for that ask — the pull-based counterpart
// `application/PeerContentProtocol.js` (0.7.4) already proved for content
// bytes, brought here for document OPERATIONS instead. A SEPARATE
// protocol namespace ('forkbuild:document-operation-recovery'), never a
// third `kind` folded into `core/DocumentOperationEnvelope.js`'s own
// `DocumentOperationKind` — that envelope already has a closed, single-
// purpose shape (see its own header, "there is only one kind of thing
// that ever travels here"), and recovery's own REQUEST message doesn't
// even carry an envelope.
//
// Keep the protocol tiny — the same restraint `application/
// PeerContentProtocol.js`'s own header names and 0.7.4's own design
// conversation insisted on. Only two kinds:
//
//   REQUEST  — "send me the operations for these specific operationIds,
//               in this specific document."
//   RESPONSE — "here are the operation envelopes I actually have."
//
// There is no NOT_FOUND kind, on purpose, for the identical reason
// `application/PeerContentProtocol.js`'s own header gives: a peer that
// cannot or will not help a REQUEST simply never sends a RESPONSE, or
// sends one naming only the subset it actually has — an operationId
// absent from every RESPONSE this replica ever receives for it IS the
// explicit negative result, without this protocol inventing a second,
// larger vocabulary (a lifecycle enum, a placeholder envelope, a
// "we don't have it" reply) to say the same thing a silence already says.
//
// `operationIds` is kept explicit — a caller asks for SPECIFIC missing
// predecessors (`CausalGapDetector#detect()`'s own
// `missingCausalPredecessorIds`), never "send me whatever I'm missing."
// That preserves the exact specificity 0.9.228's detector already
// computed; this protocol only ever transports what was already named.
//
// A RESPONSE's `operations` are real, complete `DocumentOperationEnvelope`
// objects (`core/DocumentOperationEnvelope.js`) — operationId, documentId,
// authorIdentityId, command, causalPredecessors — never a bare command,
// and never reconstructed/rewritten from one. That preserves operation
// identity, authorship, and causal metadata exactly as they existed on
// the responder's own side, so the receiver can run the SAME verification
// machinery (`application/DocumentCommandPropagationUseCase.js#
// verifyEnvelope()`) an ordinarily-arrived operation already goes
// through — see `application/DocumentOperationRecoveryUseCase.js`'s own
// header for why that machinery, not a second trust path, is what a
// RESPONSE must survive before this replica accepts anything it carries.
//
// No `requestId`. Unlike a generic RPC exchange, correlation needs
// nothing invented: a REQUEST already names the exact operationIds it
// wants, and a RESPONSE's own `operations[].operationId` values are
// self-identifying — the identical "the content hash itself is the
// correlation key" restraint `application/PeerContentProtocol.js` already
// applies instead of a requestId of its own.
//
// No `requestingIdentityId` either. Precisely because — see
// `application/DocumentCommandPropagationUseCase.js`'s own header on
// steps 1-2 of its trust chain — this codebase never trusts a
// self-asserted identity field inside a payload; a REQUEST's requester is
// always the AUTHENTICATED connection it arrived over
// (`meta.connectedPeer`), resolved exactly like every other protocol in
// this codebase resolves "who is asking," never a claimed field a peer
// could simply lie about.
export const DocumentOperationRecoveryMessageKind = Object.freeze({
    REQUEST: 'REQUEST',
    RESPONSE: 'RESPONSE'
});

export const MAX_RECOVERY_OPERATION_IDS = 64;
export const MAX_RECOVERY_OPERATIONS = 64;

function isValidRecoveryDocumentId(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= MAX_DOCUMENT_SYNC_ID_LENGTH;
}

// A well-formed REQUEST operationId list: non-empty (a REQUEST always
// asks for something), bounded, distinct — the same shape discipline
// `core/DocumentOperationEnvelope.js#isValidCausalPredecessorList()`
// already applies to a predecessor list, minus that list's own
// "never contains this operation's own id" rule, which has no meaning
// here.
function isValidOperationIdList(value) {
    if (!Array.isArray(value) || value.length === 0 || value.length > MAX_RECOVERY_OPERATION_IDS) {
        return false;
    }
    const seen = new Set();
    for (const operationId of value) {
        if (typeof operationId !== 'string' || operationId.length === 0 || operationId.length > MAX_DOCUMENT_SYNC_ID_LENGTH) {
            return false;
        }
        if (seen.has(operationId)) {
            return false;
        }
        seen.add(operationId);
    }
    return true;
}

export function toDocumentOperationRecoveryRequestMessage({ documentId, operationIds }) {
    if (!isValidRecoveryDocumentId(documentId)) {
        throw new Error('toDocumentOperationRecoveryRequestMessage: documentId is required');
    }
    if (!isValidOperationIdList(operationIds)) {
        throw new Error('toDocumentOperationRecoveryRequestMessage: operationIds must be a non-empty array of distinct, non-empty operationId strings');
    }
    return {
        kind: DocumentOperationRecoveryMessageKind.REQUEST,
        documentId,
        operationIds: [...operationIds]
    };
}

// `operations` is required and non-empty — see this file's own header on
// why "nothing to report" is never a message this protocol sends; a
// responder with nothing to offer simply never calls this function. Every
// envelope must be a structurally valid DocumentOperationEnvelope
// addressed at exactly `documentId` — a RESPONSE never smuggles an
// envelope for a different document than the one it claims to answer for.
export function toDocumentOperationRecoveryResponseMessage({ documentId, operations }) {
    if (!isValidRecoveryDocumentId(documentId)) {
        throw new Error('toDocumentOperationRecoveryResponseMessage: documentId is required');
    }
    if (!Array.isArray(operations) || operations.length === 0 || operations.length > MAX_RECOVERY_OPERATIONS) {
        throw new Error('toDocumentOperationRecoveryResponseMessage: operations must be a non-empty array of operation envelopes');
    }
    for (const envelope of operations) {
        if (!isValidDocumentOperationEnvelope(envelope) || envelope.documentId !== documentId) {
            throw new Error('toDocumentOperationRecoveryResponseMessage: every operation must be a valid envelope addressed at documentId');
        }
    }
    return {
        kind: DocumentOperationRecoveryMessageKind.RESPONSE,
        documentId,
        operations: [...operations]
    };
}

// Structural validity ONLY — exactly like `application/
// PeerContentProtocol.js#isValidPeerContentMessage()`'s own restraint.
// Says nothing about whether a REQUEST's operationIds are ones the
// receiver is authorized to answer, or whether a RESPONSE's envelopes
// will actually pass `DocumentCommandPropagationUseCase#verifyEnvelope()`
// — both of those are `application/DocumentOperationRecoveryUseCase.js`'s
// own ingestion-boundary questions, asked one layer up.
export function isValidDocumentOperationRecoveryMessage(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }
    if (value.kind === DocumentOperationRecoveryMessageKind.REQUEST) {
        return isValidRecoveryDocumentId(value.documentId) && isValidOperationIdList(value.operationIds);
    }
    if (value.kind === DocumentOperationRecoveryMessageKind.RESPONSE) {
        return isValidRecoveryDocumentId(value.documentId)
            && Array.isArray(value.operations)
            && value.operations.length > 0
            && value.operations.length <= MAX_RECOVERY_OPERATIONS
            && value.operations.every((envelope) => isValidDocumentOperationEnvelope(envelope) && envelope.documentId === value.documentId);
    }
    return false;
}
