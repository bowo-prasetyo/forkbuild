// Base class every publishing adapter extends. publish(document,
// identityProvider) returns a Publication. unpublish(publicationId)
// removes a publication without touching the source document. The
// provider may call identityProvider.sign() to attest authorship, but
// never knows or cares whether that signature came from Steem Keychain,
// MetaMask, or a local fake provider.
export class PublisherProvider {
    publish(document, identityProvider) {
        throw new Error('PublisherProvider.publish() must be implemented by a subclass');
    }

    // Removes a publication and its snapshot. The editable document
    // is NOT touched. Returns true if the publication existed.
    unpublish(publicationId) {
        throw new Error('PublisherProvider.unpublish() must be implemented by a subclass');
    }
}
