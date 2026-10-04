import { EventBus } from '../../../core/events/EventBus.js';
import { PeerLifecycleState } from '../../../peer/PeerLifecycleState.js';

const RETRIEVED_EVENT = 'SharedPublicationRetrieved';

// Retrieves Worlds shared by people this device trusts (its Friends and
// Known Peers, and never a blocked identity), as soon as their share
// arrives or they connect. Anyone else's share waits for a person's own
// Retrieve click: now that the public lobby lets strangers connect,
// downloading every announced World automatically would let any stranger
// fill this device's storage.
//
// The trust decision is about the identity that signed the share, not the
// connection that relayed it; RetrieveSharedPublicationUseCase still
// fetches only from the sharer's own connections. Runs on its own from
// construction, never on a timer: an incoming share, or a trusted peer
// reaching AUTHENTICATED (for shares that arrived while they were away).
export class AutoRetrieveSharedPublicationsUseCase {
    constructor({
        retrieveSharedPublicationUseCase,
        publicationPeerExchange,
        connectedPeerRegistry,
        isTrustedSharer,
        publicationKindPlugin,
        identityOfConnection = (peer) => (peer.remoteIdentity ? peer.remoteIdentity.identityId : null)
    } = {}) {
        if (!retrieveSharedPublicationUseCase || typeof retrieveSharedPublicationUseCase.retrieve !== 'function') {
            throw new Error('AutoRetrieveSharedPublicationsUseCase: a RetrieveSharedPublicationUseCase is required');
        }
        if (!publicationPeerExchange || typeof publicationPeerExchange.onPublicationReceived !== 'function') {
            throw new Error('AutoRetrieveSharedPublicationsUseCase: a PublicationPeerExchange is required');
        }
        if (!connectedPeerRegistry || typeof connectedPeerRegistry.onChange !== 'function') {
            throw new Error('AutoRetrieveSharedPublicationsUseCase: a ConnectedPeerRegistry is required');
        }
        if (typeof isTrustedSharer !== 'function') {
            throw new Error('AutoRetrieveSharedPublicationsUseCase: an isTrustedSharer(identityId) predicate is required');
        }
        if (!publicationKindPlugin || !publicationKindPlugin.contentKind) {
            throw new Error('AutoRetrieveSharedPublicationsUseCase: the Publication kind plugin is required');
        }
        const contentKind = publicationKindPlugin.contentKind;
        this._retrieve = retrieveSharedPublicationUseCase;
        this._isTrustedSharer = isTrustedSharer;
        this._identityOfConnection = identityOfConnection;
        this._eventBus = new EventBus();
        this._inFlight = new Set(); // envelope ids being retrieved
        this._seenAuthenticated = new Set(); // connectionIds already handled
        this._unsubscribeReceived = publicationPeerExchange.onPublicationReceived(({ publication }) => {
            if (publication && publication.contentKind === contentKind) {
                this._attempt(publication.id, publication.publisherIdentity ? publication.publisherIdentity.id : null);
            }
        });
        this._unsubscribeRegistry = connectedPeerRegistry.onChange((peers) => this._handlePeers(peers || connectedPeerRegistry.list()));
    }

    // Returns an unsubscribe function. Fires with { envelopeId, publication,
    // snapshot } after each automatic retrieval, so a view can refresh.
    onRetrieved(callback) {
        const subscription = this._eventBus.subscribe(RETRIEVED_EVENT, callback);
        return () => subscription.unsubscribe();
    }

    dispose() {
        if (this._unsubscribeReceived) this._unsubscribeReceived();
        if (this._unsubscribeRegistry) this._unsubscribeRegistry();
        this._unsubscribeReceived = null;
        this._unsubscribeRegistry = null;
    }

    _handlePeers(peers) {
        const current = new Set();
        const arrived = new Set();
        for (const peer of peers) {
            if (peer.getLifecycleState() !== PeerLifecycleState.AUTHENTICATED) {
                continue;
            }
            current.add(peer.connectionId);
            if (!this._seenAuthenticated.has(peer.connectionId)) {
                const identityId = this._identityOfConnection(peer);
                if (identityId) arrived.add(identityId);
            }
        }
        this._seenAuthenticated = current;
        if (!arrived.size) {
            return;
        }
        for (const pending of this._retrieve.listPending()) {
            if (arrived.has(pending.sharerId)) {
                this._attempt(pending.envelopeId, pending.sharerId);
            }
        }
    }

    async _attempt(envelopeId, sharerId) {
        if (!envelopeId || !sharerId || this._inFlight.has(envelopeId)) {
            return;
        }
        let trusted = false;
        try {
            trusted = Boolean(this._isTrustedSharer(sharerId));
        } catch {
            trusted = false;
        }
        // A share dismissed on this device stays dismissed.
        if (!trusted || this._retrieve.isRetrieved(envelopeId)
            || (typeof this._retrieve.isDismissed === 'function' && this._retrieve.isDismissed(envelopeId))) {
            return;
        }
        this._inFlight.add(envelopeId);
        try {
            const { publication, snapshot } = await this._retrieve.retrieve(envelopeId);
            this._eventBus.publish(RETRIEVED_EVENT, { envelopeId, publication, snapshot });
        } catch {
            // Not connected, or failed verification: left for the next
            // connection or a person's own Retrieve.
        } finally {
            this._inFlight.delete(envelopeId);
        }
    }
}
