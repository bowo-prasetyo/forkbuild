import { WorldEncounterKind } from '../core/WorldEncounter.js';

// 0.9.23 — Peer World Encounter Material Source.
//
// The WIRE shape carried over peer/PeerMessageBus.js under
// application/PeerWorldEncounterMaterialSource.js's own DEFAULT_PROTOCOL —
// deliberately mirroring application/PeerSnapshotContentProtocol.js's own
// REQUEST/RESPONSE restraint (0.8.37), re-scoped for a different question
// entirely: not "send me bytes for this content hash" but "send me the
// material for this already-selected World encounter." Every sibling
// *PeerProtocol.js module in this codebase is self-contained rather than
// reaching into another protocol module's internals — this one is no
// different, even though its shape rhymes closely with 0.8.37's own.
//
// Only two kinds exist, on purpose:
//
//   REQUEST  — "I explicitly selected object `objectId` (a `encounterKind`)
//               from you. Send me its material."
//   RESPONSE — "here is the material I hold for it."
//
// There is no NOT_FOUND kind, for the identical reason every sibling
// *PeerProtocol.js module in this codebase already gives: a peer that does
// not currently hold the requested material simply never sends a RESPONSE.
// "The peer doesn't have it" and "the peer never answered" are therefore,
// honestly, the SAME observable outcome from the requester's side — this
// module introduces no wire state whose only purpose would be to describe
// absence.
//
// `encounterKind` IS ALWAYS `core/WorldEncounter.js`'s OWN
// `WorldEncounterKind.PUBLICATION`/`AVATAR` — NEVER A THIRD VALUE OF THIS
// MODULE'S OWN INVENTION. Reused, never re-declared, so a future third
// encounter kind never has to be taught to two separate vocabularies.
//
// `objectId` TRAVELS IN BOTH DIRECTIONS, FOR CORRELATION ONLY — the same
// restraint application/PeerSnapshotContentProtocol.js's own `publicationId`
// already documents: it identifies WHICH already-selected object a
// RESPONSE answers, so a requester juggling more than one in-flight
// request can tell them apart. It is never an authorization input on
// either side of this protocol — whether a REQUEST is even worth
// answering is entirely the responding side's own, later, unscheduled
// job (0.9.24).
//
// `material` IS CARRIED OPAQUE — NEVER PARSED, VALIDATED AGAINST A DOMAIN
// SHAPE, OR HASHED HERE. A RESPONSE's own `material` is expected to be
// whatever `Publication#toJSON()`/`AvatarProfile#toJSON()` already
// produces, but this module only ever checks that it is a plain,
// JSON-serializable object under the size ceiling below — turning it back
// into a real `Publication`/`AvatarProfile` (or deciding it doesn't
// actually deserialize) is application/PeerWorldEncounterMaterialSource.js's
// own job, one layer up. This module never verifies a signature the
// material may carry and never decides whether the peer that sent it is
// trustworthy — see docs/Principles.md, "A Peer Message Envelope Carries
// Routing Information, Never Meaning" (0.2.52), continued here for a
// second layer up: this protocol module carries ROUTING/CORRELATION
// information for material, never a verdict about the material itself.
//
// Structural validity ONLY, exactly like every sibling *PeerProtocol.js
// module: says nothing about whether a REQUEST's `objectId` is one a
// responder is willing or able to serve, or whether a RESPONSE's
// `material` is genuine. Both are application/
// PeerWorldEncounterMaterialSource.js's own ingestion-boundary questions.
export const PeerWorldEncounterMaterialMessageKind = Object.freeze({
    REQUEST: 'REQUEST',
    RESPONSE: 'RESPONSE'
});

// Well under peer/PeerMessage.js's own 64KB MAX_PEER_MESSAGE_BYTES
// envelope ceiling, to leave headroom for the envelope wrapper and this
// module's own `kind`/`encounterKind`/`objectId` fields without ever
// tripping that OUTER limit first — the identical reasoning application/
// PeerSnapshotContentProtocol.js's own MAX_SNAPSHOT_CONTENT_BYTES gives
// for its own ceiling.
export const MAX_WORLD_ENCOUNTER_MATERIAL_BYTES = 48 * 1024;

const MAX_OBJECT_ID_LENGTH = 512;

function isValidEncounterKind(value) {
    return value === WorldEncounterKind.PUBLICATION || value === WorldEncounterKind.AVATAR;
}

export function isValidWorldEncounterObjectId(value) {
    return typeof value === 'string' && value.trim().length > 0 && value.length <= MAX_OBJECT_ID_LENGTH;
}

function materialByteSize(material) {
    try {
        return JSON.stringify(material).length;
    } catch {
        return Infinity;
    }
}

export function toWorldEncounterMaterialRequestMessage(encounterKind, objectId) {
    if (!isValidEncounterKind(encounterKind)) {
        throw new Error('toWorldEncounterMaterialRequestMessage: a valid encounterKind is required');
    }
    if (!isValidWorldEncounterObjectId(objectId)) {
        throw new Error('toWorldEncounterMaterialRequestMessage: a valid objectId is required');
    }
    return { kind: PeerWorldEncounterMaterialMessageKind.REQUEST, encounterKind, objectId };
}

// `material` is required — a RESPONSE always carries something; see this
// file's own header on why "not found" is never a message this protocol
// sends. Throws if `material` is not a plain, JSON-serializable object, or
// would exceed MAX_WORLD_ENCOUNTER_MATERIAL_BYTES — the SENDING side's own
// half of the oversized-material defense.
export function toWorldEncounterMaterialResponseMessage(encounterKind, objectId, material) {
    if (!isValidEncounterKind(encounterKind)) {
        throw new Error('toWorldEncounterMaterialResponseMessage: a valid encounterKind is required');
    }
    if (!isValidWorldEncounterObjectId(objectId)) {
        throw new Error('toWorldEncounterMaterialResponseMessage: a valid objectId is required');
    }
    if (!material || typeof material !== 'object' || Array.isArray(material)) {
        throw new Error('toWorldEncounterMaterialResponseMessage: a plain object material is required');
    }
    if (materialByteSize(material) > MAX_WORLD_ENCOUNTER_MATERIAL_BYTES) {
        throw new Error(`toWorldEncounterMaterialResponseMessage: material exceeds MAX_WORLD_ENCOUNTER_MATERIAL_BYTES (${MAX_WORLD_ENCOUNTER_MATERIAL_BYTES})`);
    }
    return { kind: PeerWorldEncounterMaterialMessageKind.RESPONSE, encounterKind, objectId, material };
}

// The RECEIVING side's own half of the oversized-material defense — a
// malicious or buggy peer that ignores toWorldEncounterMaterialResponseMessage()'s
// own ceiling and hand-crafts an oversized RESPONSE is rejected right
// here, never trusted merely because it arrived.
export function isValidPeerWorldEncounterMaterialMessage(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }
    if (!isValidEncounterKind(value.encounterKind) || !isValidWorldEncounterObjectId(value.objectId)) {
        return false;
    }
    if (value.kind === PeerWorldEncounterMaterialMessageKind.REQUEST) {
        return true;
    }
    if (value.kind === PeerWorldEncounterMaterialMessageKind.RESPONSE) {
        return Boolean(value.material)
            && typeof value.material === 'object'
            && !Array.isArray(value.material)
            && materialByteSize(value.material) <= MAX_WORLD_ENCOUNTER_MATERIAL_BYTES;
    }
    return false;
}
