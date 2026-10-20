// application/publication/OwnPublicationCheck.js: a Publication is the
// person's own when this device published it, or when its signature checks
// out against an identity this device holds or acts for, so a build published
// from another of their devices counts too; a typed name never does.
import { createOwnPublicationCheck } from '../application/publication/OwnPublicationCheck.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { Publication } from '../publisher/Publication.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

function signedIn(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    provider.login(label);
    return provider;
}

function signed(provider, { id, documentId, contentHash }) {
    const unsigned = new Publication({ id, documentId, title: documentId, author: provider.currentUser().username, contentHash, publishedAt: new Date('2026-10-01T00:00:00Z'), publisherIdentity: provider.getSigningIdentity().toJSON() });
    return unsigned.withSignature(provider.signCanonical(unsigned.getSigningDescriptor()));
}

const me = signedIn('own-me');
const other = signedIn('own-other');
const publishedHere = new Map();
let ownIds = [me.getSigningIdentity().id];
const isOwn = createOwnPublicationCheck({
    findPublishedHere: (id) => publishedHere.get(id) || null,
    ownIdentityIds: () => ownIds
});

const fromThisDevice = new Publication({ id: 'here', documentId: 'd-here', title: 'Here', contentHash: 'sha256:here', publishedAt: new Date() });
publishedHere.set('here', { id: 'here', contentHash: 'sha256:here' });
assert(isOwn(fromThisDevice), '1. a build this device published is yours, signed or not');
assert(!isOwn(new Publication({ ...fromThisDevice.toJSON(), contentHash: 'sha256:changed' })), '2. not the same id with other content');

const fromMyOtherDevice = signed(me, { id: 'elsewhere', documentId: 'd-elsewhere', contentHash: 'sha256:elsewhere' });
assert(isOwn(fromMyOtherDevice), '3. a build signed by an identity this device holds is yours, wherever it was published');
assert(!isOwn(signed(other, { id: 'theirs', documentId: 'd-theirs', contentHash: 'sha256:theirs' })), '4. someone else\'s is not');

const claimed = new Publication({ ...signed(other, { id: 'claimed', documentId: 'd-claimed', contentHash: 'sha256:claimed' }).toJSON(), publisherIdentity: me.getSigningIdentity().toJSON() });
assert(!isOwn(claimed), '5. one that only claims your identity, without your signature, is not');
const named = new Publication({ id: 'named', documentId: 'd-named', title: 'Named', author: 'own-me', contentHash: 'sha256:named', publishedAt: new Date() });
assert(!isOwn(named), '6. nor one that only carries your name');

ownIds = [];
assert(!isOwn(fromMyOtherDevice), '7. signed in as nobody this device holds, it isn\'t yours');
ownIds = [other.getSigningIdentity().id, me.getSigningIdentity().id];
assert(isOwn(fromMyOtherDevice), '8. any of the identities given counts (one this device acts for, too)');

const shaky = createOwnPublicationCheck({ findPublishedHere: () => { throw new Error('storage blocked'); }, ownIdentityIds: () => { throw new Error('locked'); } });
assert(!shaky(fromMyOtherDevice) && !shaky(null) && !shaky({}), '9. failures and nothing count as not yours, without throwing');
const recordUnreadable = createOwnPublicationCheck({ findPublishedHere: () => { throw new Error('storage blocked'); }, ownIdentityIds: () => [me.getSigningIdentity().id] });
assert(recordUnreadable(fromMyOtherDevice), '10. with no record to read, the signature still says');

console.log('✅ All own publication check tests passed.');
