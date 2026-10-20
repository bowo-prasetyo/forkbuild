import { PublicationHeart } from '../../../core/PublicationHeart.js';
import { message } from '../../../core/Message.js';
import { requireSigningIdentityId } from '../../../identity/SigningReadiness.js';

// Gives the signed-in identity's heart to a Publication, or takes it back:
// a new record under the name the identity goes by, kept here first.
// Sending it on is the caller's (createPublicationHeartDistributor()).
// Setting what is already so makes no record and returns null, so a double
// tap never sends the same thing twice.
export class SetPublicationHeartUseCase {
    constructor(store, identityProvider, { now = () => new Date() } = {}) {
        if (!store || typeof store.save !== 'function' || typeof store.latestFor !== 'function') {
            throw new Error('SetPublicationHeartUseCase: a PublicationHeartStore is required');
        }
        this._store = store;
        this._identityProvider = identityProvider;
        this._now = now;
    }

    execute({ publicationId, hearted } = {}) {
        if (!publicationId || typeof publicationId !== 'string') {
            throw new Error('SetPublicationHeartUseCase: a publicationId is required');
        }
        const authorIdentityId = requireSigningIdentityId(this._identityProvider, message('heart.signInFirst'));
        const latest = this._store.latestFor(publicationId, authorIdentityId);
        const current = latest ? latest.hearted : false;
        if (current === (hearted === true)) {
            return null;
        }
        const heart = new PublicationHeart({
            publicationId,
            authorIdentityId,
            authorName: chosenName(this._identityProvider, authorIdentityId),
            hearted: hearted === true,
            // Never at or before the record it replaces, so it always wins.
            createdAt: latest && this._now().getTime() <= latest.createdAt.getTime()
                ? new Date(latest.createdAt.getTime() + 1)
                : this._now()
        });
        this._store.save(heart);
        return heart;
    }
}

// The username the identity chose, never its id.
function chosenName(identityProvider, identityId) {
    let user = null;
    try {
        user = identityProvider && typeof identityProvider.currentUser === 'function' ? identityProvider.currentUser() : null;
    } catch {
        user = null;
    }
    const name = user && typeof user.username === 'string' ? user.username.trim() : '';
    return name && name !== identityId ? name : null;
}
