import { resolvePublicationView } from '../PublicationResolutionView.js';
import { Publication } from '../../../publisher/Publication.js';
import { normalizeContentTitle } from '../../../core/DecentralizedPublication.js';
import { PeerLifecycleState } from '../../../peer/PeerLifecycleState.js';
import { PeerSnapshotMaterializationOutcome } from '../../snapshot/materialization/PeerSnapshotMaterializationOutcome.js';
import { isStorageEntryNotLoadedError } from '../../../storage/StorageEntryNotLoadedError.js';
import { computeContentHash } from '../../../serializer/contentHash.js';

// Retrieves a World another identity shared with peers
// (SharePublicationWithPeersUseCase): its Publication, which joins this
// device's Repository, and its snapshot, so the World can be explored.
//
// Bytes come only from connections authenticated as the identity that
// shared it (directly, or as one of its authorized devices). Content
// addresses here are 32-bit FNV-1a hashes, which a determined peer can
// collide, so "any connected peer that answers" is not a safe source; the
// sharer holds the bytes anyway. The Publication inside must also be
// signed by the sharer, which Ed25519 makes impossible to forge, and carry
// the title the envelope announced, if it announced one, so the World a
// person chose by its title is the World they get. Nothing is added to the
// Repository unless the full PublicationResolver checks pass.
//
// The same routine serves the automatic path (AutoRetrieveSharedPublicationsUseCase,
// for Friends and Known Peers) and a person's own Retrieve click for
// anyone else.
export class RetrieveSharedPublicationUseCase {
    constructor({
        publicationCatalog,
        resolutionCoordinator,
        publicationKindPlugin,
        discoveryProvider,
        contentStore,
        materializeSnapshotFromPeer,
        connectedPeerRegistry,
        identityProvider,
        identityOfConnection = (peer) => (peer.remoteIdentity ? peer.remoteIdentity.identityId : null),
        timeoutMs
    } = {}) {
        if (!publicationCatalog || typeof publicationCatalog.findByContentKind !== 'function') {
            throw new Error('RetrieveSharedPublicationUseCase: a publication catalog is required');
        }
        if (!resolutionCoordinator || !publicationKindPlugin || !publicationKindPlugin.contentKind) {
            throw new Error('RetrieveSharedPublicationUseCase: a resolution coordinator and the Publication kind plugin are required');
        }
        if (!discoveryProvider || typeof discoveryProvider.add !== 'function' || typeof discoveryProvider.findById !== 'function') {
            throw new Error('RetrieveSharedPublicationUseCase: the Repository discovery provider is required');
        }
        if (!contentStore || typeof contentStore.has !== 'function') {
            throw new Error('RetrieveSharedPublicationUseCase: a content store is required');
        }
        if (!materializeSnapshotFromPeer || typeof materializeSnapshotFromPeer.execute !== 'function') {
            throw new Error('RetrieveSharedPublicationUseCase: a MaterializeSnapshotFromPeerUseCase is required');
        }
        if (!connectedPeerRegistry || typeof connectedPeerRegistry.list !== 'function') {
            throw new Error('RetrieveSharedPublicationUseCase: a ConnectedPeerRegistry is required');
        }
        this._catalog = publicationCatalog;
        this._coordinator = resolutionCoordinator;
        this._contentKind = publicationKindPlugin.contentKind;
        this._kindPlugins = { [publicationKindPlugin.contentKind]: publicationKindPlugin };
        this._discoveryProvider = discoveryProvider;
        this._contentStore = contentStore;
        this._materialize = materializeSnapshotFromPeer;
        this._registry = connectedPeerRegistry;
        this._identityProvider = identityProvider || null;
        this._identityOfConnection = identityOfConnection;
        this._timeoutMs = timeoutMs;
    }

    // Worlds others shared that this device has not fully retrieved yet
    // (its Publication or its snapshot is missing), newest first:
    // [{ envelopeId, sharerId, title, receivedAt, sharerConnected }].
    // `title` is the one the sharer signed into the envelope, or null for an
    // envelope from before envelopes carried one. Several envelopes from the
    // same sharer for the same bytes (a World shared again under a titled
    // envelope) are one entry: the newest titled one, else the newest.
    listPending() {
        const self = this._selfId();
        const byWorld = new Map();
        for (const envelope of this._catalog.findByContentKind(this._contentKind)) {
            const sharerId = envelope.publisherIdentity ? envelope.publisherIdentity.id : null;
            if (!sharerId || sharerId === self || this.isRetrieved(envelope.id)) {
                continue;
            }
            const item = {
                envelopeId: envelope.id,
                sharerId,
                title: envelope.contentTitle || null,
                receivedAt: typeof this._catalog.getReceivedAt === 'function' ? this._catalog.getReceivedAt(envelope.id) : null,
                sharerConnected: this._sourcesFor(sharerId).length > 0
            };
            const key = `${sharerId}\n${envelope.contentReference.hash}`;
            const kept = byWorld.get(key);
            if (!kept || preferred(item, kept)) {
                byWorld.set(key, item);
            }
        }
        return [...byWorld.values()].sort((a, b) => String(b.receivedAt || '').localeCompare(String(a.receivedAt || '')));
    }

    // Whether the shared World behind `envelopeId` is in the Repository and
    // its snapshot is on this device.
    isRetrieved(envelopeId) {
        const envelope = this._catalog.get(envelopeId);
        if (!envelope || !this._contentStore.has(envelope.contentReference)) {
            return false;
        }
        const listed = this._listedPublicationFor(envelope);
        return Boolean(listed && (!listed.contentReference || this._contentStore.has(listed.contentReference)));
    }

    // Retrieves one shared World. Resolves to { publication, snapshot }:
    // the Publication now in the Repository, and the snapshot outcome
    // (a PeerSnapshotMaterializationOutcome, or null when it has none).
    // Rejects, adding nothing, when the sharer is not connected, the
    // content fails verification, or the Publication inside is not the
    // sharer's own.
    async retrieve(envelopeId) {
        const envelope = this._catalog.get(envelopeId);
        if (!envelope || envelope.contentKind !== this._contentKind) {
            throw new Error('RetrieveSharedPublicationUseCase: no shared World with that id');
        }
        const sharerId = envelope.publisherIdentity ? envelope.publisherIdentity.id : null;
        const sources = this._sourcesFor(sharerId);
        if (!sources.length) {
            throw new Error('RetrieveSharedPublicationUseCase: the person who shared this World is not connected right now; try again while they are');
        }

        const view = await resolvePublicationView(envelope, {
            coordinator: this._coordinator,
            kindPlugins: this._kindPlugins,
            peers: sources,
            ...(this._timeoutMs ? { timeoutMs: this._timeoutMs } : {})
        });
        if (!view.resolved || !(view.content instanceof Publication)) {
            throw new Error(`RetrieveSharedPublicationUseCase: the shared World could not be retrieved (${view.reason || view.outcome || 'no answer'})`);
        }
        const publication = view.content;
        if (!publication.signature || !publication.publisherIdentity || publication.publisherIdentity.id !== sharerId) {
            throw new Error('RetrieveSharedPublicationUseCase: the shared World is not signed by the person who shared it, so it was not added');
        }
        if (envelope.contentTitle && envelope.contentTitle !== normalizeContentTitle(publication.title)) {
            throw new Error('RetrieveSharedPublicationUseCase: the shared World is not the one its title announced, so it was not added');
        }
        if (!this._discoveryProvider.findById(publication.id)) {
            this._discoveryProvider.add(publication);
        }

        const snapshot = await this._retrieveSnapshot(publication, sources);
        return { publication, snapshot };
    }

    async _retrieveSnapshot(publication, sources) {
        const reference = publication.contentReference;
        if (!reference) {
            return null;
        }
        if (this._contentStore.has(reference)) {
            return PeerSnapshotMaterializationOutcome.ALREADY_AVAILABLE;
        }
        let last = PeerSnapshotMaterializationOutcome.UNAVAILABLE;
        for (const peer of sources) {
            const result = await this._materialize.execute({ peer, publicationId: publication.id, contentHash: reference.hash });
            if (result.outcome === PeerSnapshotMaterializationOutcome.STORED
                || result.outcome === PeerSnapshotMaterializationOutcome.ALREADY_AVAILABLE) {
                return result.outcome;
            }
            last = result.outcome;
        }
        return last;
    }

    // The Repository's copy of the Publication `envelope` wraps, found by
    // reading the wrapped JSON already on this device.
    // Over IndexedDB, content stays on disk until read, and reading it
    // synchronously throws StorageEntryNotLoadedError (which also starts
    // loading it). Until it is loaded, the Repository is searched for the
    // Publication whose JSON hashes to the envelope's content instead, as
    // SharePublicationWithPeersUseCase finds its own envelopes.
    _listedPublicationFor(envelope) {
        let bytes;
        try {
            bytes = typeof this._contentStore.getSync === 'function' ? this._contentStore.getSync(envelope.contentReference) : null;
        } catch (error) {
            if (!isStorageEntryNotLoadedError(error) || typeof this._discoveryProvider.list !== 'function') {
                return null;
            }
            const hash = envelope.contentReference.hash;
            return this._discoveryProvider.list().find((publication) =>
                typeof publication.toJSON === 'function'
                && computeContentHash(JSON.stringify(publication.toJSON())) === hash) || null;
        }
        if (typeof bytes !== 'string') {
            return null;
        }
        try {
            const id = JSON.parse(bytes).id;
            return id ? this._discoveryProvider.findById(id) : null;
        } catch {
            return null;
        }
    }

    _sourcesFor(sharerId) {
        if (!sharerId) {
            return [];
        }
        return this._registry.list().filter((peer) =>
            peer.remoteIdentity
            && peer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED
            && this._identityOfConnection(peer) === sharerId);
    }

    // The signed-in identity, read from the session so a locked identity
    // still recognizes its own shares.
    _selfId() {
        if (!this._identityProvider) {
            return null;
        }
        try {
            if (typeof this._identityProvider.currentSession === 'function') {
                const session = this._identityProvider.currentSession();
                if (session && session.identityId) {
                    return session.identityId;
                }
            }
            return this._identityProvider.getSigningIdentity().id;
        } catch {
            return null;
        }
    }
}

// Whether `item` should stand for its World in listPending() over `kept`:
// a titled envelope over an untitled one, then the newer one.
function preferred(item, kept) {
    if (Boolean(item.title) !== Boolean(kept.title)) {
        return Boolean(item.title);
    }
    return String(item.receivedAt || '') > String(kept.receivedAt || '');
}
