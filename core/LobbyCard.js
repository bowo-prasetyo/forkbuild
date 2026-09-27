import { createId } from './createId.js';
import { SignatureType } from './Signature.js';

// A lobby card: a signed, short-lived statement that an identity is present
// in one public lobby and open to connections from people it does not know
// yet. It says who is present, never where to reach them: it carries no
// WebRTC offer, because an offer lists network addresses. Connecting still
// goes through the identity's own rendezvous publication, found by exact
// LOOKUP, and the peer handshake.
//
// A lobby is either the global one, `public`, or one per World,
// `world:<documentId>`. `displayName` is self-chosen and proves nothing;
// the identity id beside it is what a handshake checks.

export const PUBLIC_LOBBY = 'public';
export const DEFAULT_LOBBY_CARD_TTL_MS = 10 * 60 * 1000;
export const MAX_LOBBY_CARD_TTL_MS = 15 * 60 * 1000;
export const MAX_DISPLAY_NAME_LENGTH = 40;

const WORLD_LOBBY_PREFIX = 'world:';
const LOBBY_PATTERN = /^(public|world:[A-Za-z0-9._-]{1,128})$/;

export function worldLobby(documentId) {
    return WORLD_LOBBY_PREFIX + documentId;
}

export function isValidLobby(lobby) {
    return typeof lobby === 'string' && LOBBY_PATTERN.test(lobby);
}

// The World id of a `world:` lobby, or null for the global lobby.
export function lobbyWorldId(lobby) {
    return isValidLobby(lobby) && lobby.startsWith(WORLD_LOBBY_PREFIX) ? lobby.slice(WORLD_LOBBY_PREFIX.length) : null;
}

// Trims, collapses whitespace, drops control characters and caps the
// length, so every client shows a name the same way.
export function normalizeDisplayName(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const cleaned = Array.from(value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim());
    return cleaned.slice(0, MAX_DISPLAY_NAME_LENGTH).join('');
}

export class LobbyCard {
    constructor({ cardId = createId(), identityId, lobby, displayName = '', publishedAt = new Date(), expiresAt, signature = null } = {}) {
        if (!identityId || typeof identityId !== 'string') {
            throw new Error('LobbyCard: identityId is required');
        }
        if (!isValidLobby(lobby)) {
            throw new Error(`LobbyCard: "${String(lobby).slice(0, 40)}" is not a lobby`);
        }
        if (typeof displayName !== 'string' || normalizeDisplayName(displayName) !== displayName) {
            throw new Error('LobbyCard: displayName must already be normalized (see normalizeDisplayName)');
        }
        const publishedAtDate = new Date(publishedAt);
        const expiresAtDate = new Date(expiresAt);
        if (Number.isNaN(publishedAtDate.getTime()) || Number.isNaN(expiresAtDate.getTime())) {
            throw new Error('LobbyCard: publishedAt and expiresAt must be valid dates');
        }
        if (expiresAtDate.getTime() <= publishedAtDate.getTime()) {
            throw new Error('LobbyCard: expiresAt must be after publishedAt');
        }
        this._cardId = cardId;
        this._identityId = identityId;
        this._lobby = lobby;
        this._displayName = displayName;
        this._publishedAt = publishedAtDate;
        this._expiresAt = expiresAtDate;
        this._signature = signature || null;
    }

    get cardId() { return this._cardId; }
    get identityId() { return this._identityId; }
    get lobby() { return this._lobby; }
    get displayName() { return this._displayName; }
    get publishedAt() { return this._publishedAt; }
    get expiresAt() { return this._expiresAt; }
    get signature() { return this._signature; }

    isExpired(now = new Date()) {
        return now.getTime() >= this._expiresAt.getTime();
    }

    withSignature(signature) {
        return new LobbyCard({ ...this._fields(), signature });
    }

    getSigningDescriptor() {
        return getLobbyCardSigningDescriptor(this);
    }

    toJSON() {
        return {
            cardId: this._cardId,
            identityId: this._identityId,
            lobby: this._lobby,
            displayName: this._displayName,
            publishedAt: this._publishedAt.toISOString(),
            expiresAt: this._expiresAt.toISOString(),
            ...(this._signature ? { signature: this._signature } : {})
        };
    }

    static fromJSON(json) {
        if (!json || typeof json !== 'object') {
            throw new Error('LobbyCard: cannot parse a card from a non-object value');
        }
        return new LobbyCard({
            cardId: json.cardId,
            identityId: json.identityId,
            lobby: json.lobby,
            displayName: json.displayName === undefined ? '' : json.displayName,
            publishedAt: json.publishedAt,
            expiresAt: json.expiresAt,
            signature: json.signature || null
        });
    }

    static create({ identityId, lobby, displayName = '', ttlMs = DEFAULT_LOBBY_CARD_TTL_MS, now = new Date() } = {}) {
        const lifetime = Math.min(Math.max(1, ttlMs), MAX_LOBBY_CARD_TTL_MS);
        return new LobbyCard({
            identityId,
            lobby,
            displayName: normalizeDisplayName(displayName),
            publishedAt: now,
            expiresAt: new Date(now.getTime() + lifetime)
        });
    }

    _fields() {
        return {
            cardId: this._cardId,
            identityId: this._identityId,
            lobby: this._lobby,
            displayName: this._displayName,
            publishedAt: this._publishedAt,
            expiresAt: this._expiresAt
        };
    }
}

// The canonical bytes a card's signature covers, reproduced exactly by the
// rendezvous server (server/rendezvous-worker/worker.js). Signing the
// expiry means nobody can stretch a card's lifetime.
export function getLobbyCardSigningDescriptor(card) {
    return {
        type: SignatureType.LOBBY_CARD,
        id: card.identityId,
        revision: card.cardId,
        payload: {
            cardId: card.cardId,
            identityId: card.identityId,
            lobby: card.lobby,
            displayName: card.displayName,
            publishedAt: card.publishedAt.toISOString(),
            expiresAt: card.expiresAt.toISOString()
        }
    };
}

// Withdrawing one card from one lobby, signed by its identity.
export function getLobbyLeaveSigningDescriptor({ identityId, lobby, cardId }) {
    return {
        type: SignatureType.LOBBY_LEAVE,
        id: identityId,
        revision: cardId,
        payload: { cardId, identityId, lobby }
    };
}
