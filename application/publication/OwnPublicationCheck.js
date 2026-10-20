import { createVerifiedPublisherResolver } from './FollowingFeed.js';

// Whether a Publication is the person's own, for what only its builder should
// see (ui/components/remix/OwnLookAlikes.js): this device published it (its
// own record, same id and content hash), or its signature checks out against
// an identity this device holds a key for, or acts for as an authorized
// device. Only that key's holder could have signed it, so a build published
// from another of their devices counts too. A name typed into a Publication
// counts for nothing.
//
// findPublishedHere(id): this device's own record of a Publication, or null.
// ownIdentityIds(): the identity ids that are this person's.
export function createOwnPublicationCheck({ findPublishedHere, ownIdentityIds, verifier = undefined } = {}) {
    const signerOf = createVerifiedPublisherResolver(verifier);
    return (publication) => {
        if (!publication?.id) return false;
        try {
            const record = findPublishedHere(publication.id);
            if (record && record.contentHash && record.contentHash === publication.contentHash) return true;
        } catch {
            // No record to read: the signature can still say.
        }
        let ids = [];
        try {
            ids = ownIdentityIds() || [];
        } catch {
            ids = [];
        }
        const signer = signerOf(publication);
        return Boolean(signer && ids.includes(signer));
    };
}
