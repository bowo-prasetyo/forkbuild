import { DocumentSerializer } from '../../serializer/DocumentSerializer.js';
import { PartAssembler, sendInParts } from '../peer/ChunkedPeerTransfer.js';
import { PeerLifecycleState } from '../../peer/PeerLifecycleState.js';

// "Build with me" in the Editor (docs/reviews/CreativeDirection-2026-10-11.md,
// finding 3): the host's build, opened in each co-builder's Editor, and kept
// the same in all of them by the Editor's own command protocol
// (application/document/DocumentCommandPropagationUseCase.js).
//
// The link (application/walkTogether/WalkTogether.js, createBuildHost) only
// connects each guest's peer session to the host's. Then, over that
// connection:
//
//   the host's Editor                         a guest's Editor
//   ─────────────────                         ────────────────
//   allow(guest): the guest may edit
//   this one build, while this session
//   lasts                             ◄────── request: the build
//   checks the guest is allowed, and
//   sends the build and the operations
//   it already reflects               ──────► checks the build is the host's
//                                             own, and opens it
//   every edit, either way, as an operation of the command protocol;
//   the host passes each co-builder's on to the others (shouldRelay)
//   where each one points and what each one has selected: presence
//
// Permission is a session fact, never stored or signed: the host's replica
// asks allows() at the same WorldAuthorizationService gate where ownership
// is asked, for each operation, so Stop, closing the build or leaving the
// Editor ends it at once, and nothing is left behind to revoke. Only the
// host's replica needs it: a guest accepts the host's edits because the
// build is the host's own (its authorIdentityId is the host's identity,
// checked against the connection that sent it).
//
// The build is sent whole only once, when a guest's Editor asks; ordered
// after it on the same connection come the operations that follow it. A
// build sent before the guest's Editor was open would miss the edits made
// in between.
//
// Presence (where each one points, what each one has selected) is
// ephemeral observation, never part of the build (docs/principles/
// collaboration.md, 0.3.0): kept in memory, gone with the connection.

export const BUILD_TOGETHER_SYNC_PROTOCOL = 'forkbuild:build-together-sync';
export const REQUEST_TIMEOUT_MS = 20 * 1000;
const MAX_BUILD_LENGTH = 16 * 1024 * 1024;
const MAX_SELECTION = 200;
const MAX_NAME_LENGTH = 60;
const MAX_OPERATION_IDS = 100000;
// Presence older than this is dropped (a co-builder whose tab went quiet).
const PRESENCE_STALE_MS = 60 * 1000;

export const BuildTogetherOutcome = Object.freeze({
    OPENED: 'opened',
    // The host isn't connected (any more).
    NOT_CONNECTED: 'notConnected',
    // The host's Editor doesn't have this build open, or stopped.
    REFUSED: 'refused',
    TIMED_OUT: 'timedOut',
    // What arrived isn't the host's own build.
    NOT_VERIFIED: 'notVerified'
});

export const BuildTogetherRole = Object.freeze({
    HOST: 'host',
    GUEST: 'guest'
});

// One colour per co-builder, from their identity: the same on every screen.
const COLORS = Object.freeze([0xe8553e, 0x2f9e6e, 0x8a5cd6, 0xe0a321, 0x2b8fd6, 0xd6487f]);

export function coBuilderColor(identityId) {
    let hash = 0;
    for (const char of String(identityId || '')) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    return COLORS[hash % COLORS.length];
}

export class BuildTogetherSession {
    // editor: the Editor, as this session needs it —
    //   openDocument(): the open Document, or null;
    //   appliedOperationIds(): the operations the open build already reflects;
    //   openShared(document, operationIds): opens a co-builder's copy;
    //   creditBuilder({ identityId, name }): credits a friend on the open
    //     build (DocumentMetadata#creditBuilder), true when it changed;
    //   adoptCredits(builtWith): a co-builder's copy takes the author's
    //     credits (DocumentMetadata#adoptBuiltWith);
    //   notedHelped({ documentId, title, authorName, authorIdentityId }):
    //     the author credits this replica: a build it helped make;
    //   resetUndo({ name }): someone joined; Undo starts again from here.
    // resolveConnectionIdentity(connectedPeer): { identityId } for who is
    //   behind a connection, an authorized device's owner included (the
    //   app's DeviceAuthorizationPropagationUseCase), as the command
    //   protocol resolves it.
    // ownIdentityIds(): this replica's own identities (its key, and its
    //   owner's), so a co-builder's presence relayed back is never shown.
    constructor({
        peerMessageBus, connectedPeerRegistry, editor,
        resolveConnectionIdentity = (connectedPeer) => connectedPeer.remoteIdentity,
        ownIdentityIds = () => [],
        serializer = new DocumentSerializer(),
        requestTimeoutMs = REQUEST_TIMEOUT_MS,
        now = () => Date.now()
    }) {
        if (!peerMessageBus || typeof peerMessageBus.send !== 'function' || typeof peerMessageBus.subscribe !== 'function') {
            throw new Error('BuildTogetherSession: a PeerMessageBus is required');
        }
        if (!connectedPeerRegistry || typeof connectedPeerRegistry.list !== 'function') {
            throw new Error('BuildTogetherSession: a ConnectedPeerRegistry is required');
        }
        if (!editor || typeof editor.openDocument !== 'function' || typeof editor.openShared !== 'function') {
            throw new Error('BuildTogetherSession: an editor is required');
        }
        this._bus = peerMessageBus;
        this._registry = connectedPeerRegistry;
        this._editor = editor;
        this._resolveIdentity = resolveConnectionIdentity;
        this._ownIdentityIds = () => {
            try {
                return ownIdentityIds() || [];
            } catch {
                return [];
            }
        };
        this._serializer = serializer;
        this._requestTimeoutMs = requestTimeoutMs;
        this._now = now;
        this._assembler = new PartAssembler({ maxTransferLength: MAX_BUILD_LENGTH, maxConcurrentTransfers: 1 });
        this._listeners = new Set();
        // Hosting: the build, and who may edit it ({ identityId: name }).
        this._hosted = null;
        this._allowed = new Map();
        // Joined: { documentId, hostIdentityId, hostName, ended }.
        this._joined = null;
        this._pendingRequest = null;
        // Presence, by identity: { name, pointer, selection, at }.
        this._presence = new Map();

        if (typeof peerMessageBus.attach === 'function') {
            for (const peer of this._registry.list()) peerMessageBus.attach(peer);
        }
        this._unsubscribeRegistry = typeof this._registry.onChange === 'function'
            ? this._registry.onChange((peers) => {
                if (typeof peerMessageBus.attach === 'function') {
                    for (const peer of peers) peerMessageBus.attach(peer);
                }
                this._changed();
            })
            : null;
        this._unsubscribeBus = this._bus.subscribe(BUILD_TOGETHER_SYNC_PROTOCOL, (payload, meta) => this._receive(payload, meta && meta.connectedPeer));
    }

    // callback() on any change: who is building, who is here, presence.
    // Returns an unsubscribe function.
    onChange(callback) {
        this._listeners.add(callback);
        return () => this._listeners.delete(callback);
    }

    get role() {
        if (this._hosted) return BuildTogetherRole.HOST;
        if (this._joined) return BuildTogetherRole.GUEST;
        return null;
    }

    // ------------------------------------------------------------ hosting

    // Starts hosting `documentId`, the build open in this Editor. Anyone
    // allowed on a build hosted before is no longer.
    host(documentId) {
        if (!documentId || typeof documentId !== 'string') return false;
        if (this._hosted !== documentId) {
            this.stopHosting();
            this._hosted = documentId;
            this._changed();
        }
        return true;
    }

    get hostedDocumentId() {
        return this._hosted;
    }

    // `identityId`, a guest who joined through the link (its connection's
    // own key), may edit the hosted build while this session lasts. The
    // identity the command protocol resolves for that connection (an
    // authorized device's owner) is allowed with it.
    allow(identityId, name = null) {
        if (!this._hosted || !identityId || typeof identityId !== 'string') return false;
        const cleanName = cleanText(name, MAX_NAME_LENGTH);
        this._allowed.set(identityId, cleanName);
        const peer = this._peerOf(identityId);
        const resolved = peer ? this._identityOf(peer) : null;
        if (resolved && resolved !== identityId) this._allowed.set(resolved, cleanName);
        this._resetUndo(cleanName);
        this._changed();
        return true;
    }

    // Someone joined: they never had the steps made before now, so everyone's
    // Undo starts again from here (EditorSession#resetSharedUndo).
    _resetUndo(name) {
        if (typeof this._editor.resetUndo === 'function') {
            try {
                this._editor.resetUndo({ name });
            } catch {
                // Undo is a convenience; building goes on.
            }
        }
        for (const peer of this._coBuilderPeers()) this._send(peer, { type: 'undo-reset', documentId: this._hosted, name: cleanText(name, MAX_NAME_LENGTH) });
    }

    _acceptUndoReset(payload, peer) {
        if (!this._fromHost(payload, peer) || typeof this._editor.resetUndo !== 'function') return;
        try {
            this._editor.resetUndo({ name: cleanText(payload.name, MAX_NAME_LENGTH) });
        } catch {
            // As above.
        }
    }

    // Whether `identityId` may edit `documentId`: asked by the command
    // protocol for each operation that arrives (resolveWorldEditGrant).
    allows(documentId, identityId) {
        return Boolean(this._hosted) && documentId === this._hosted && this._allowed.has(identityId);
    }

    // An operation by `identityId` on `documentId` was accepted (the command
    // protocol's onOperationReceived): a friend allowed on the hosted build
    // built something, so the build credits them (core/catalog/BuiltWith.js,
    // through the editor's creditBuilder). True when they were credited.
    noteEdit(documentId, identityId) {
        if (!this.allows(documentId, identityId) || typeof this._editor.creditBuilder !== 'function') return false;
        let credited = false;
        try {
            credited = this._editor.creditBuilder({ identityId, name: this._allowed.get(identityId) || null }) === true;
        } catch {
            credited = false;
        }
        if (credited) this._sendCredits();
        return credited;
    }

    // The hosted build's credits, to each co-builder: their copies follow
    // the author's list (core/catalog/BuiltWith.js), so every copy says who built it.
    _sendCredits() {
        const document = this._editor.openDocument();
        if (!this._hosted || !document || document.world.id !== this._hosted) return;
        const builtWith = (document.metadata.builtWith || []).map((entry) => ({ name: entry.name, identityId: entry.identityId }));
        for (const peer of this._coBuilderPeers()) this._send(peer, { type: 'credits', documentId: this._hosted, builtWith });
    }

    // Whether this replica passes on edits to `documentId` (shouldRelay).
    isHosting(documentId) {
        return Boolean(this._hosted) && documentId === this._hosted;
    }

    // Ends hosting: co-builders are told, and may edit no more.
    stopHosting() {
        if (!this._hosted) return;
        const documentId = this._hosted;
        for (const peer of this._coBuilderPeers()) this._send(peer, { type: 'ended', documentId });
        this._hosted = null;
        this._allowed.clear();
        this._presence.clear();
        this._changed();
    }

    // The people building the hosted or joined build, but this one:
    // [{ identityId, name, online, pointer, selection, color }]. A host
    // lists those allowed; a guest, the host and whoever the host's
    // presence names.
    coBuilders() {
        const people = new Map();
        if (this._hosted) {
            for (const [identityId, name] of this._allowed) {
                if (this._isDeviceAlias(identityId)) continue;
                people.set(identityId, { identityId, name, online: Boolean(this._peerOf(identityId)) });
            }
        } else if (this._joined) {
            const { hostIdentityId, hostName, ended } = this._joined;
            people.set(hostIdentityId, { identityId: hostIdentityId, name: hostName, online: !ended && Boolean(this._peerOf(hostIdentityId)) });
        }
        const now = this._now();
        for (const [identityId, presence] of this._presence) {
            if (now - presence.at > PRESENCE_STALE_MS) continue;
            const person = people.get(identityId) || (this._joined ? { identityId, name: presence.name, online: true } : null);
            if (!person) continue;
            people.set(identityId, { ...person, name: person.name || presence.name, pointer: presence.pointer, selection: presence.selection });
        }
        return [...people.values()].map((person) => Object.freeze({
            pointer: null, selection: [], ...person, color: coBuilderColor(person.identityId)
        }));
    }

    // -------------------------------------------------------------- joined

    get joined() {
        return this._joined ? Object.freeze({ ...this._joined }) : null;
    }

    // Asks the host (`hostIdentityId`, connected already, through the link)
    // for `documentId` and opens it. Resolves to a BuildTogetherOutcome.
    join({ documentId, hostIdentityId, hostName = null }) {
        this.stopHosting();
        this._cancelRequest();
        this._joined = Object.freeze({ documentId, hostIdentityId, hostName: cleanText(hostName, MAX_NAME_LENGTH), ended: false, opened: false });
        this._presence.clear();
        this._changed();
        const peer = this._peerOf(hostIdentityId);
        if (!peer) {
            return Promise.resolve(this._settleJoin(BuildTogetherOutcome.NOT_CONNECTED));
        }
        return new Promise((resolve) => {
            const timer = setTimeout(() => this._finishRequest(BuildTogetherOutcome.TIMED_OUT), this._requestTimeoutMs);
            if (typeof timer.unref === 'function') timer.unref();
            this._pendingRequest = { documentId, peer, resolve, timer };
            if (!this._send(peer, { type: 'request', documentId })) this._finishRequest(BuildTogetherOutcome.NOT_CONNECTED);
        });
    }

    // Leaves the joined build (the copy stays open, as a build of its own).
    leave() {
        this._cancelRequest();
        if (!this._joined) return;
        const peer = this._peerOf(this._joined.hostIdentityId);
        if (peer && !this._joined.ended) this._send(peer, { type: 'left', documentId: this._joined.documentId });
        this._joined = null;
        this._presence.clear();
        this._changed();
    }

    // Whether this Editor's edits to the open build are shared right now.
    isSharing() {
        if (this._hosted) return this._editor.openDocument()?.world.id === this._hosted && this._allowed.size > 0;
        return Boolean(this._joined && this._joined.opened && !this._joined.ended);
    }

    // ------------------------------------------------------------ presence

    // Tells co-builders where this Editor's pointer is ({ x, y, z } or
    // null) and what is selected (brick ids).
    sharePresence({ pointer = null, selection = [] } = {}) {
        const documentId = this._hosted || (this._joined && !this._joined.ended ? this._joined.documentId : null);
        if (!documentId) return;
        const message = { type: 'presence', documentId, pointer: cleanPoint(pointer), selection: cleanSelection(selection) };
        const peers = this._hosted ? this._coBuilderPeers() : [this._peerOf(this._joined.hostIdentityId)].filter(Boolean);
        for (const peer of peers) this._send(peer, message);
    }

    dispose() {
        this.stopHosting();
        this.leave();
        if (this._unsubscribeBus) this._unsubscribeBus();
        if (this._unsubscribeRegistry) this._unsubscribeRegistry();
        this._unsubscribeBus = null;
        this._unsubscribeRegistry = null;
        this._listeners.clear();
    }

    // ------------------------------------------------------------ internal

    _receive(payload, peer) {
        if (!payload || typeof payload !== 'object' || !peer || peer.getLifecycleState() !== PeerLifecycleState.AUTHENTICATED) return;
        switch (payload.type) {
        case 'request': return this._answerRequest(payload, peer);
        case 'part': return this._acceptPart(payload, peer);
        case 'refused': return this._fromHost(payload, peer) && this._finishRequest(BuildTogetherOutcome.REFUSED);
        case 'ended': return this._hostEnded(payload, peer);
        case 'left': return this._guestLeft(payload, peer);
        case 'presence': return this._acceptPresence(payload, peer);
        case 'credits': return this._acceptCredits(payload, peer);
        case 'undo-reset': return this._acceptUndoReset(payload, peer);
        default:
        }
    }

    _answerRequest(payload, peer) {
        const identityId = this._identityOf(peer);
        const document = this._editor.openDocument();
        if (!this._hosted || payload.documentId !== this._hosted || !this._allowed.has(identityId) || !document || document.world.id !== this._hosted) {
            this._send(peer, { type: 'refused', documentId: typeof payload.documentId === 'string' ? payload.documentId : null });
            return;
        }
        let text;
        try {
            text = JSON.stringify({
                document: this._serializer.serialize(document),
                operations: this._editor.appliedOperationIds().slice(-MAX_OPERATION_IDS)
            });
        } catch {
            this._send(peer, { type: 'refused', documentId: this._hosted });
            return;
        }
        sendInParts(this._bus, peer, BUILD_TOGETHER_SYNC_PROTOCOL, text, (part) => ({ type: 'part', documentId: this._hosted, ...part }));
        this._changed();
    }

    _acceptPart(payload, peer) {
        const pending = this._pendingRequest;
        if (!pending || peer !== pending.peer || payload.documentId !== pending.documentId) return;
        const result = this._assembler.accept(peer.connectionId, payload);
        if (result.status === 'rejected') return this._finishRequest(BuildTogetherOutcome.NOT_VERIFIED);
        if (result.status !== 'complete') return;
        let parsed;
        let document;
        try {
            parsed = JSON.parse(result.text);
            document = this._serializer.deserialize(parsed.document);
        } catch {
            return this._finishRequest(BuildTogetherOutcome.NOT_VERIFIED);
        }
        const hostIdentityId = this._identityOf(peer);
        const owner = document.metadata && document.metadata.authorIdentityId;
        if (document.world.id !== pending.documentId || !owner || (owner !== hostIdentityId && owner !== peer.remoteIdentity?.identityId)) {
            return this._finishRequest(BuildTogetherOutcome.NOT_VERIFIED);
        }
        const operations = Array.isArray(parsed.operations)
            ? parsed.operations.filter((id) => typeof id === 'string' && id).slice(0, MAX_OPERATION_IDS)
            : [];
        try {
            this._editor.openShared(document, operations);
        } catch {
            return this._finishRequest(BuildTogetherOutcome.NOT_VERIFIED);
        }
        this._finishRequest(BuildTogetherOutcome.OPENED);
        this._noteIfCredited(document.metadata.builtWith);
    }

    // The author's credits for the joined build: this copy follows them.
    // Only from the host, for the build this Editor has open from them.
    _acceptCredits(payload, peer) {
        if (!this._fromHost(payload, peer) || !this._joined.opened || !Array.isArray(payload.builtWith)) return;
        const document = this._editor.openDocument();
        if (!document || document.world.id !== this._joined.documentId || typeof this._editor.adoptCredits !== 'function') return;
        try {
            this._editor.adoptCredits(payload.builtWith);
        } catch {
            return;
        }
        this._noteIfCredited(payload.builtWith);
        this._changed();
    }

    // The author credits this replica's identity: a build it helped make
    // (application/buildTogether/HelpedBuildsStore.js, through the editor).
    _noteIfCredited(builtWith) {
        if (!this._joined || typeof this._editor.notedHelped !== 'function' || !Array.isArray(builtWith)) return;
        const own = this._ownIdentityIds();
        if (!builtWith.some((entry) => entry && own.includes(entry.identityId))) return;
        const document = this._editor.openDocument();
        try {
            this._editor.notedHelped({
                documentId: this._joined.documentId,
                title: document && document.world.id === this._joined.documentId ? document.metadata.title : null,
                authorName: this._joined.hostName,
                authorIdentityId: document?.metadata.authorIdentityId || this._joined.hostIdentityId
            });
        } catch {
            // The list is a convenience; building goes on.
        }
    }

    _finishRequest(outcome) {
        const pending = this._pendingRequest;
        if (!pending) return;
        this._pendingRequest = null;
        clearTimeout(pending.timer);
        pending.resolve(this._settleJoin(outcome));
    }

    _settleJoin(outcome) {
        if (this._joined) {
            this._joined = outcome === BuildTogetherOutcome.OPENED
                ? Object.freeze({ ...this._joined, opened: true })
                : null;
        }
        this._changed();
        return outcome;
    }

    _cancelRequest() {
        const pending = this._pendingRequest;
        if (!pending) return;
        this._pendingRequest = null;
        clearTimeout(pending.timer);
        pending.resolve(BuildTogetherOutcome.REFUSED);
    }

    _fromHost(payload, peer) {
        return Boolean(this._joined) && payload.documentId === this._joined.documentId && this._identityMatches(peer, this._joined.hostIdentityId);
    }

    _hostEnded(payload, peer) {
        if (!this._fromHost(payload, peer)) return;
        if (this._pendingRequest) this._finishRequest(BuildTogetherOutcome.REFUSED);
        if (!this._joined) return;
        this._joined = Object.freeze({ ...this._joined, ended: true });
        this._presence.clear();
        this._changed();
    }

    _guestLeft(payload, peer) {
        if (!this._hosted || payload.documentId !== this._hosted) return;
        const identityId = this._identityOf(peer);
        this._presence.delete(identityId);
        this._changed();
    }

    _acceptPresence(payload, peer) {
        const identityId = this._identityOf(peer);
        const documentId = payload.documentId;
        const presence = { pointer: cleanPoint(payload.pointer), selection: cleanSelection(payload.selection), at: this._now() };
        if (this._hosted) {
            if (documentId !== this._hosted || !this._allowed.has(identityId)) return;
            const name = this._allowed.get(identityId) || null;
            this._presence.set(identityId, { ...presence, name });
            // Each co-builder sees the others through the host.
            const relayed = { type: 'presence', documentId, who: identityId, name, pointer: presence.pointer, selection: presence.selection };
            for (const other of this._coBuilderPeers()) {
                if (other !== peer) this._send(other, relayed);
            }
        } else if (this._fromHost(payload, peer) && !this._joined.ended) {
            const relayedWho = typeof payload.who === 'string' && payload.who ? payload.who : null;
            const who = relayedWho || identityId;
            // Never ourselves, relayed back.
            if (relayedWho && this._isSelf(relayedWho)) return;
            this._presence.set(who, { ...presence, name: relayedWho ? cleanText(payload.name, MAX_NAME_LENGTH) : this._joined.hostName });
        } else {
            return;
        }
        this._changed();
    }

    _isSelf(identityId) {
        return this._ownIdentityIds().includes(identityId);
    }

    _coBuilderPeers() {
        return this._authenticatedPeers().filter((peer) => this._allowed.has(this._identityOf(peer)) || this._allowed.has(peer.remoteIdentity?.identityId));
    }

    _isDeviceAlias(identityId) {
        // allow() keeps a device's own key and its owner's: list the person once.
        for (const peer of this._authenticatedPeers()) {
            if (peer.remoteIdentity?.identityId === identityId && this._identityOf(peer) !== identityId && this._allowed.has(this._identityOf(peer))) return true;
        }
        return false;
    }

    _peerOf(identityId) {
        return this._authenticatedPeers().find((peer) => this._identityMatches(peer, identityId)) || null;
    }

    _identityMatches(peer, identityId) {
        return Boolean(identityId) && (peer.remoteIdentity?.identityId === identityId || this._identityOf(peer) === identityId);
    }

    _identityOf(peer) {
        try {
            const resolved = this._resolveIdentity(peer);
            return resolved && resolved.identityId ? resolved.identityId : (peer.remoteIdentity?.identityId || null);
        } catch {
            return peer.remoteIdentity?.identityId || null;
        }
    }

    _authenticatedPeers() {
        return this._registry.list().filter((peer) => peer && typeof peer.getLifecycleState === 'function'
            && peer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED && peer.remoteIdentity);
    }

    _send(peer, message) {
        try {
            this._bus.send(peer, BUILD_TOGETHER_SYNC_PROTOCOL, message);
            return true;
        } catch {
            return false;
        }
    }

    _changed() {
        for (const listener of Array.from(this._listeners)) {
            try {
                listener();
            } catch {
                // A listener's failure is its own.
            }
        }
    }
}

function cleanText(value, maxLength) {
    if (typeof value !== 'string') return null;
    const text = value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
    return text || null;
}

function cleanPoint(point) {
    if (!point || typeof point !== 'object') return null;
    const x = Number(point.x);
    const y = Number(point.y);
    const z = Number(point.z);
    if (![x, y, z].every((value) => Number.isFinite(value) && Math.abs(value) < 1e6)) return null;
    return Object.freeze({ x, y, z });
}

function cleanSelection(selection) {
    if (!Array.isArray(selection)) return Object.freeze([]);
    return Object.freeze(selection.filter((id) => typeof id === 'string' && id && id.length <= 200).slice(0, MAX_SELECTION));
}
