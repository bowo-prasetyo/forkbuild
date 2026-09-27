import { RendezvousTransport } from './RendezvousTransport.js';
import { RendezvousPublication } from './RendezvousPublication.js';
import { createId } from '../core/createId.js';

// 0.2.66 — Real Network Rendezvous & NAT Traversal.
//
// The networked peer/RendezvousTransport.js implementation 0.2.65's own
// header already named and deferred: a REAL rendezvous SERVER, reached
// over an ordinary WebSocket, satisfying the exact same PUBLISH/LOOKUP/
// REMOVE contract peer/LocalRendezvousNetwork.js already proved out
// in-process. Everything above this class — peer/RendezvousDiscoveryProvider.js,
// peer/DiscoveryBootstrap.js, application/peer/FindPeerUseCase.js,
// application/peer/PeerSessionManager.js — needed ZERO changes beyond the
// contract already becoming async in 0.2.66 (see peer/RendezvousTransport.js's
// own header); this class is a drop-in alternative to
// peer/LocalRendezvousNetwork.js, nothing more.
//
// Deliberately, and by the same discipline peer/RendezvousTransport.js's
// own header has held since 0.2.65: this class authenticates NO ONE. It
// does not know what a "friend" is, does not verify who is entitled to
// PUBLISH under a given identityId, and never becomes an authority over
// who Bob is — see peer/PeerAuthenticationSession.js, still the only
// thing that ever proves that, completely unaware this transport exists.
// The server on the other end of `url` is intentionally as "stupid" as
// peer/LocalRendezvousNetwork.js's own in-memory Map: identityId maps to
// one current publication, expiring on its own, nothing else — this class
// ships no reference server ITSELF, only the CLIENT half of a small wire
// protocol any server that wants to be found by this codebase can
// implement (see the wire protocol description below).
//
// 0.3.3 — a real, deployable reference server implementing exactly this
// protocol now exists at server/rendezvous-worker/ (a Cloudflare Worker +
// Durable Object) — optional operator infrastructure, same as
// peer/RendezvousConfig.js's own "configures their own" posture; nothing
// above or below this comment changed to make that true.
//
// That server now also decides who may change which entry: it accepts a
// PUBLISH only when the publication is signed by the identity it names
// (peer/RendezvousPublicationSigning.js), and a REMOVE only with that
// identity's signature over withdrawing the publication. It still proves
// nothing about who answers at the published endpoint; that remains
// peer/PeerAuthenticationSession.js's job.
//
// Wire protocol (JSON frames over one WebSocket connection, request/
// response correlated by `requestId` — WebSocket itself has no built-in
// request/response semantics, unlike HTTP):
//
//   Client -> Server:
//     { v: 1, type: 'PUBLISH', requestId, publication }   // a signed RendezvousPublication.toJSON()
//     { v: 1, type: 'LOOKUP',  requestId, identityId }
//     { v: 1, type: 'REMOVE',  requestId, identityId, publicationId, signature }
//                                  // signature: core/RendezvousPublicationEnvelope.js's
//                                  // getRendezvousRemovalSigningDescriptor(), signed by identityId
//     { v: 1, type: 'POST_ANSWER',  requestId, identityId, publicationId, answer, answererId, signature }
//                                  // signature: getRendezvousAnswerSigningDescriptor(), signed by answererId
//     { v: 1, type: 'FETCH_ANSWER', requestId, identityId, publicationId, signature, watch? }
//                                  // signature: getRendezvousAnswerFetchSigningDescriptor(), signed by identityId
//     { v: 1, type: 'JOIN_LOBBY',  requestId, card }    // a signed core/LobbyCard.js toJSON()
//     { v: 1, type: 'LEAVE_LOBBY', requestId, identityId, lobby, cardId, signature }
//     { v: 1, type: 'LIST_LOBBY',  requestId, lobby }   // see peer/RendezvousLobbyTransport.js
//
//   Server -> Client, exactly one response per request, in any order:
//     { v: 1, type: 'OK',    requestId, result }   // publish(): the stored publication;
//                                                    // lookup(): an array of publications;
//                                                    // remove(), postAnswer(): a boolean;
//                                                    // fetchAnswer(): { answer, answererId } or null;
//                                                    // joinLobby(): the stored card; leaveLobby(): a boolean;
//                                                    // listLobby(): { cards, total }
//     { v: 1, type: 'ERROR', requestId, message }
//
// A server may also push unsolicited messages (no `requestId`). The one
// this class understands is
//   { v: 1, type: 'ANSWER', identityId, publicationId, answer, answererId }
// sent to a connection that asked to watch a publication (fetchAnswer()
// with `watch: true`); it reaches onAnswerPushed() listeners. Anything
// else it cannot correlate to a pending request is ignored.
export const RENDEZVOUS_PROTOCOL_VERSION = 1;

const DEFAULT_REQUEST_TIMEOUT_MS = 10 * 1000;
const DEFAULT_CONNECT_TIMEOUT_MS = 10 * 1000;

export class WebSocketRendezvousTransport extends RendezvousTransport {
    constructor({
        url,
        WebSocketImpl = globalThis.WebSocket,
        requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
        connectTimeoutMs = DEFAULT_CONNECT_TIMEOUT_MS
    } = {}) {
        super();
        if (!url || typeof url !== 'string') {
            throw new Error('WebSocketRendezvousTransport: url is required');
        }
        if (typeof WebSocketImpl !== 'function') {
            throw new Error('WebSocketRendezvousTransport: no WebSocket implementation available in this environment');
        }
        this._url = url;
        this._WebSocketImpl = WebSocketImpl;
        this._requestTimeoutMs = requestTimeoutMs;
        this._connectTimeoutMs = connectTimeoutMs;
        this._socket = null;
        this._connectPromise = null;
        this._pending = new Map(); // requestId -> { resolve, reject, timeout }
        this._answerListeners = new Set();
    }

    get url() { return this._url; }

    // Resolves to the stored publication — ordinarily the very same
    // object that was sent, echoed back by an honest server, but always
    // re-parsed from the wire response rather than assumed (see
    // _request's own JSON round trip) — a malformed echo throws exactly
    // like any other malformed network response would.
    async publish(publication) {
        const result = await this._request('PUBLISH', { publication: publication.toJSON() });
        return RendezvousPublication.fromJSON(result);
    }

    // Resolves to every currently-fresh publication the server has for
    // `identityId`. Exactly like peer/RendezvousDiscoveryProvider.js's own
    // _mergePublication one layer up, a single malformed entry in the
    // response is skipped rather than failing the whole lookup — a
    // hostile or merely buggy server can still poison ONE entry, never
    // this method's own contract.
    async lookup(identityId) {
        const result = await this._request('LOOKUP', { identityId });
        if (!Array.isArray(result)) {
            return [];
        }
        const publications = [];
        for (const raw of result) {
            try {
                publications.push(RendezvousPublication.fromJSON(raw));
            } catch {
                // A malformed entry from an untrusted network node —
                // skipped here too, never merely deferred to the caller;
                // see this file's own header.
            }
        }
        return publications;
    }

    // `proof` is `{ identityId, signature }` from peer/
    // RendezvousPublicationSigning.js#signRendezvousRemoval; servers refuse
    // a REMOVE without it.
    async remove(publicationId, proof = {}) {
        const { identityId, signature } = proof;
        return Boolean(await this._request('REMOVE', {
            publicationId,
            ...(identityId ? { identityId } : {}),
            ...(signature ? { signature } : {})
        }));
    }

    async postAnswer({ identityId, publicationId, answer, answererId, signature } = {}) {
        return Boolean(await this._request('POST_ANSWER', { identityId, publicationId, answer, answererId, signature }));
    }

    // Resolves to { answer, answererId, watching } or null. With `watch`,
    // the server also pushes a later answer down this connection, and says
    // so with `watching: true`; a server that ignores the flag never does,
    // so a caller knows to keep polling. A reply that is not an object with
    // an answer object reads as "no answer yet", like a malformed LOOKUP
    // entry.
    async fetchAnswer({ identityId, publicationId, signature, watch = false } = {}) {
        const result = await this._request('FETCH_ANSWER', { identityId, publicationId, signature, ...(watch ? { watch: true } : {}) });
        const watching = Boolean(watch && result && typeof result === 'object' && result.watching === true);
        const hasAnswer = Boolean(result && typeof result === 'object' && result.answer && typeof result.answer === 'object');
        if (!hasAnswer && !watching) {
            return null;
        }
        return {
            answer: hasAnswer ? result.answer : null,
            answererId: hasAnswer && typeof result.answererId === 'string' ? result.answererId : null,
            watching
        };
    }

    // Returns an unsubscribe function. `callback({ identityId,
    // publicationId, answer, answererId })` fires for each answer the
    // server pushes to this connection.
    onAnswerPushed(callback) {
        this._answerListeners.add(callback);
        return () => this._answerListeners.delete(callback);
    }

    // peer/RendezvousLobbyTransport.js, over the same connection.
    async joinLobby(card) {
        return this._request('JOIN_LOBBY', { card: typeof card.toJSON === 'function' ? card.toJSON() : card });
    }

    async leaveLobby({ identityId, lobby, cardId, signature } = {}) {
        return Boolean(await this._request('LEAVE_LOBBY', { identityId, lobby, cardId, signature }));
    }

    // A malformed listing reads as an empty lobby.
    async listLobby(lobby) {
        const result = await this._request('LIST_LOBBY', { lobby });
        if (!result || typeof result !== 'object' || !Array.isArray(result.cards)) {
            return { cards: [], total: 0 };
        }
        return { cards: result.cards, total: Number.isFinite(result.total) ? result.total : result.cards.length };
    }

    // Not part of peer/RendezvousTransport.js's own formal contract —
    // peer/LocalRendezvousNetwork.js needs no equivalent, since an
    // in-memory Map holds no live socket to release. Mirrors peer/
    // WebRtcPeerConnectionProvider.js's own dispose(): closes the socket
    // and rejects every still-pending request rather than leaving it to
    // time out on its own.
    dispose() {
        this._failAllPending('WebSocketRendezvousTransport: transport disposed');
        if (this._socket) {
            try { this._socket.close(); } catch { /* already closing */ }
        }
        this._socket = null;
        this._connectPromise = null;
    }

    async _request(type, body) {
        const socket = await this._ensureOpen();
        const requestId = createId();
        const message = { v: RENDEZVOUS_PROTOCOL_VERSION, type, requestId, ...body };
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this._pending.delete(requestId);
                reject(new Error(`WebSocketRendezvousTransport: ${type} timed out waiting for a response`));
            }, this._requestTimeoutMs);
            this._pending.set(requestId, { resolve, reject, timeout });
            try {
                socket.send(JSON.stringify(message));
            } catch (e) {
                clearTimeout(timeout);
                this._pending.delete(requestId);
                reject(e);
            }
        });
    }

    // Lazily opens the connection on first use and reuses it for every
    // subsequent request — a rendezvous transport that reconnected once
    // per PUBLISH/LOOKUP/REMOVE would cost a full round trip just to
    // start each one. A closed/never-opened socket transparently
    // reconnects on the next call; a connection attempt already in
    // flight is shared rather than duplicated.
    _ensureOpen() {
        if (this._socket && this._socket.readyState === this._WebSocketImpl.OPEN) {
            return Promise.resolve(this._socket);
        }
        if (this._connectPromise) {
            return this._connectPromise;
        }
        this._connectPromise = new Promise((resolve, reject) => {
            let settled = false;
            let socket;
            try {
                socket = new this._WebSocketImpl(this._url);
            } catch (e) {
                this._connectPromise = null;
                reject(e);
                return;
            }
            const timeout = setTimeout(() => {
                if (settled) return;
                settled = true;
                this._connectPromise = null;
                try { socket.close(); } catch { /* never opened */ }
                reject(new Error('WebSocketRendezvousTransport: connection to rendezvous service timed out'));
            }, this._connectTimeoutMs);
            socket.addEventListener('open', () => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                this._socket = socket;
                resolve(socket);
            });
            socket.addEventListener('message', (event) => this._handleMessage(event));
            socket.addEventListener('error', () => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                this._connectPromise = null;
                reject(new Error('WebSocketRendezvousTransport: connection to rendezvous service failed'));
            });
            socket.addEventListener('close', () => {
                this._socket = null;
                this._connectPromise = null;
                // Every request already in flight on this connection can
                // never receive its response now — fail them explicitly
                // rather than leaving them to their own timeout, exactly
                // like peer/WebRtcPeerConnection.js's own close() reasons
                // about a DataChannel that vanishes mid-flight.
                this._failAllPending('WebSocketRendezvousTransport: connection to rendezvous service closed');
                if (!settled) {
                    settled = true;
                    clearTimeout(timeout);
                    reject(new Error('WebSocketRendezvousTransport: connection to rendezvous service closed before it opened'));
                }
            });
        });
        return this._connectPromise;
    }

    _handleMessage(event) {
        let message;
        try {
            message = JSON.parse(event.data);
        } catch {
            return; // not valid JSON — ignored, never crashes the transport
        }
        if (!message || typeof message !== 'object') {
            return;
        }
        if (!message.requestId) {
            this._handlePush(message);
            return;
        }
        const pending = this._pending.get(message.requestId);
        if (!pending) {
            return; // a stray, duplicate, or late response — ignored, see this file's own header
        }
        this._pending.delete(message.requestId);
        clearTimeout(pending.timeout);
        if (message.type === 'ERROR') {
            pending.reject(new Error('WebSocketRendezvousTransport: ' + (message.message || 'rendezvous service reported an error')));
        } else {
            pending.resolve(message.result);
        }
    }

    _handlePush(message) {
        if (message.type !== 'ANSWER'
            || typeof message.identityId !== 'string' || typeof message.publicationId !== 'string'
            || !message.answer || typeof message.answer !== 'object') {
            return;
        }
        const pushed = {
            identityId: message.identityId,
            publicationId: message.publicationId,
            answer: message.answer,
            answererId: typeof message.answererId === 'string' ? message.answererId : null
        };
        for (const listener of this._answerListeners) {
            try { listener(pushed); } catch { /* one listener never stops the others */ }
        }
    }

    _failAllPending(reason) {
        for (const pending of this._pending.values()) {
            clearTimeout(pending.timeout);
            pending.reject(new Error(reason));
        }
        this._pending.clear();
    }
}
