import { computeContentHash } from '../../../serializer/contentHash.js';
import { normalizeContentTitle } from '../../../core/DecentralizedPublication.js';

// "Share with Peers": offers one of this identity's own published Worlds to
// connected peers.
//
// A plain Publish lists a World on this device only. Sharing wraps the
// signed Publication in a signed DecentralizedPublication (through
// PublicationResolver#publish(), which stores the Publication's JSON in the
// content store), catalogs it and announces it. Being cataloged is what
// lets this device serve those bytes over `forkbuild:content`
// (PeerContentExchange serves only hashes a catalog entry names), and what
// makes PublicationPeerConnectionSync announce it again to every peer that
// connects later. The World's snapshot bytes are already in the same
// content store from publishing, and `forkbuild:snapshot-content-transfer`
// serves them to a peer that asks by hash.
//
// Only the identity's own signed Publications can be shared, so a receiver
// can require the Publication inside to be signed by whoever shared it
// (RetrieveSharedPublicationUseCase). The envelope also carries the World's
// title, signed, so the receiver's Shared with you can name it before
// anything is retrieved; retrieval checks it against the Publication. Sharing is announcing: like any
// announcement it cannot be taken back from peers that already received it.
export class SharePublicationWithPeersUseCase {
    // publicationKindPlugin: the Publication content kind from
    // CreatePublicationDisplayKindRegistryUseCase (only its contentKind is read).
    constructor({ publicationResolver, publicationCatalog, publicationPeerExchange, identityProvider, publicationKindPlugin } = {}) {
        if (!publicationResolver || typeof publicationResolver.publish !== 'function') {
            throw new Error('SharePublicationWithPeersUseCase: a PublicationResolver is required');
        }
        if (!publicationCatalog || typeof publicationCatalog.findByContentHash !== 'function') {
            throw new Error('SharePublicationWithPeersUseCase: a publication catalog is required');
        }
        if (!publicationPeerExchange || typeof publicationPeerExchange.announce !== 'function') {
            throw new Error('SharePublicationWithPeersUseCase: a PublicationPeerExchange is required');
        }
        if (!identityProvider) {
            throw new Error('SharePublicationWithPeersUseCase: an identityProvider is required');
        }
        if (!publicationKindPlugin || !publicationKindPlugin.contentKind) {
            throw new Error('SharePublicationWithPeersUseCase: the Publication kind plugin is required');
        }
        this._contentKind = publicationKindPlugin.contentKind;
        this._resolver = publicationResolver;
        this._catalog = publicationCatalog;
        this._peerExchange = publicationPeerExchange;
        this._identityProvider = identityProvider;
    }

    // Whether `publication` is this identity's own signed, content-addressed
    // Publication, the only kind that can be shared.
    canShare(publication) {
        const self = this._selfId();
        return Boolean(self
            && publication
            && publication.signature
            && publication.contentReference
            && publication.publisherIdentity
            && publication.publisherIdentity.id === self);
    }

    // Whether this identity has already shared `publication` (a catalog
    // entry it signed wraps exactly this Publication's JSON).
    isShared(publication) {
        return this._existingEnvelope(publication) !== null;
    }

    // Shares `publication`, or announces it again when it was shared before.
    // Resolves to { envelope, announcedTo, alreadyShared }; announcedTo is
    // how many peers were connected to receive it now (0 is not an error:
    // peers that connect later still receive it). A World shared before
    // envelopes carried titles is shared again under a titled envelope;
    // receivers list both as one, since they wrap the same bytes.
    async share(publication) {
        if (!this._selfId()) {
            throw new Error('SharePublicationWithPeersUseCase: sign in and unlock your identity to share');
        }
        if (!this.canShare(publication)) {
            throw new Error('SharePublicationWithPeersUseCase: only your own signed publications can be shared');
        }
        const contentTitle = normalizeContentTitle(publication.title);
        const found = this._existingEnvelope(publication);
        const existing = found && (found.contentTitle || !contentTitle) ? found : null;
        const envelope = existing || await this._resolver.publish({
            content: publication,
            contentKind: this._contentKind,
            contentTitle,
            identityProvider: this._identityProvider
        });
        if (!existing) {
            this._catalog.add(envelope);
        }
        const announcedTo = this._peerExchange.announce(envelope);
        return { envelope, announcedTo, alreadyShared: Boolean(existing) };
    }

    // This identity's envelope for `publication`, preferring a titled one.
    _existingEnvelope(publication) {
        const self = this._selfId();
        if (!self || !publication || typeof publication.toJSON !== 'function') {
            return null;
        }
        // The same bytes PublicationResolver#publish() stores, so the same hash.
        const hash = computeContentHash(JSON.stringify(publication.toJSON()));
        const own = this._catalog.findByContentHash(hash).filter((envelope) =>
            envelope.contentKind === this._contentKind
            && envelope.publisherIdentity
            && envelope.publisherIdentity.id === self);
        return own.find((envelope) => envelope.contentTitle) || own[0] || null;
    }

    _selfId() {
        try {
            return this._identityProvider.getSigningIdentity().id;
        } catch {
            return null;
        }
    }
}
