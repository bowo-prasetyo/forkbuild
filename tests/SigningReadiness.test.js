import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import {
    SigningReadiness, SigningRemedy, currentIdentityId, requireSigningIdentityId, signingReadiness
} from '../identity/SigningReadiness.js';
import { SetPublicationHeartUseCase } from '../application/publication/heart/SetPublicationHeartUseCase.js';
import { FollowUseCase } from '../application/identity/FollowUseCase.js';
import { PublicationHeartStore } from '../storage/PublicationHeartStore.js';
import { message } from '../core/Message.js';
import { isUserFacingError } from '../core/UserFacingError.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// Why a name can't sign right now: none chosen, locked or revoked. Each is
// its own refusal with its own remedy, so a locked name is never told to
// choose a name.

const PASSPHRASE = 'correct horse battery';
const NO_NAME = message('heart.signInFirst');

async function lockedProvider(label = 'Bowo') {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const created = await provider.createProtectedLocalIdentity(label, PASSPHRASE);
    await provider.unlock(created.identityId, PASSPHRASE);
    provider.authenticate(created.identityId);
    provider.lock(created.identityId);
    return { provider, identityId: created.identityId };
}

function refusalOf(action) {
    try {
        action();
    } catch (error) {
        return error;
    }
    return null;
}

// No name at all: the action's own "choose a name" message.
{
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const readiness = signingReadiness(provider);
    assert(readiness.status === SigningReadiness.NO_NAME && readiness.identityId === null, 'no session is no name');
    assert(currentIdentityId(provider) === null, 'no name, no identity id');
    const error = refusalOf(() => requireSigningIdentityId(provider, NO_NAME));
    assert(isUserFacingError(error) && error.userMessage.key === 'heart.signInFirst', 'no name gets the action\'s own message');
    assert(error.remedy === SigningRemedy.CHOOSE_NAME, 'no name offers Choose a name');
    assert(signingReadiness(null).status === SigningReadiness.NO_NAME, 'no provider is no name');
    console.log('✓ no name: "choose a name", with Choose a name');
}

// A name that can sign is ready.
{
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity('alice');
    provider.authenticate(identity.identityId);
    const readiness = signingReadiness(provider);
    assert(readiness.status === SigningReadiness.READY && readiness.identityId === identity.identityId && readiness.name === 'alice', 'ready, with its id and name');
    assert(requireSigningIdentityId(provider, NO_NAME) === identity.identityId, 'ready returns the signing id');
    console.log('✓ a name that can sign is ready');
}

// A locked name: told it is locked, by name, and offered Unlock.
{
    const { provider, identityId } = await lockedProvider();
    const readiness = signingReadiness(provider);
    assert(readiness.status === SigningReadiness.LOCKED, 'a locked name is locked, not missing');
    assert(readiness.identityId === identityId && readiness.name === 'Bowo', 'it still knows whose name it is');
    assert(currentIdentityId(provider) === identityId, 'reading what is one\'s own needs no unlock');
    const error = refusalOf(() => requireSigningIdentityId(provider, NO_NAME));
    assert(error.userMessage.key === 'refusal.nameLocked' && error.userMessage.params.name === 'Bowo', 'locked names the name');
    assert(error.remedy === SigningRemedy.UNLOCK, 'locked offers Unlock');

    await provider.unlock(identityId, PASSPHRASE);
    assert(signingReadiness(provider).status === SigningReadiness.READY, 'unlocking makes it ready');
    console.log('✓ a locked name is told to unlock, never to choose a name');
}

// A revoked name: told it was revoked, and offered Switch name.
{
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity('old');
    provider.authenticate(identity.identityId);
    provider.revokeIdentity(identity.identityId);
    const readiness = signingReadiness(provider);
    assert(readiness.status === SigningReadiness.REVOKED && readiness.name === 'old', 'a revoked name is revoked');
    const error = refusalOf(() => requireSigningIdentityId(provider, NO_NAME));
    assert(error.userMessage.key === 'refusal.nameRevoked' && error.remedy === SigningRemedy.SWITCH_NAME, 'revoked offers Switch name');
    console.log('✓ a revoked name is told to switch names');
}

// Signing with a locked name refuses in words a person can read and act on.
{
    const { provider } = await lockedProvider();
    const error = refusalOf(() => provider.signCanonical({ type: 'test', id: 'x', revision: 1, payload: {} }));
    assert(isUserFacingError(error) && error.userMessage.key === 'refusal.nameLocked', 'a locked signature is a translated refusal');
    assert(error.remedy === SigningRemedy.UNLOCK, '...offering Unlock');
    assert(error.message.includes('identity is locked'), 'the developer detail is kept');
    console.log('✓ signing while locked is a refusal a person can act on');
}

// Giving a heart while locked: "unlock", not "choose a name".
{
    const { provider } = await lockedProvider();
    const hearts = new SetPublicationHeartUseCase(new PublicationHeartStore(new InMemoryStorageProvider()), provider);
    const error = refusalOf(() => hearts.execute({ publicationId: 'pub-house', hearted: true }));
    assert(error && error.userMessage.key === 'refusal.nameLocked', `a locked name is asked to unlock to give a heart (got ${error && error.userMessage && error.userMessage.key})`);
    console.log('✓ giving a heart while locked asks to unlock');
}

// Following while locked: the follows stay visible, following asks to unlock.
{
    const { provider, identityId } = await lockedProvider();
    const storage = new InMemoryStorageProvider();
    await provider.unlock(identityId, PASSPHRASE);
    const follows = new FollowUseCase(storage, provider);
    const someone = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';
    follows.follow(someone, { name: 'carol' });
    provider.lock(identityId);

    assert(follows.isSignedIn(), 'a locked name is still the name in use');
    assert(follows.getFollowing().length === 1, 'whom it follows is still shown');
    assert(follows.canFollow('did:key:z6MkiTBz1ymuepAQ4HEHYSF1H8quG5GLVVQR3djdX3mDooWp'), 'Follow is still offered');
    const error = refusalOf(() => follows.unfollow(someone));
    assert(error && error.userMessage.key === 'refusal.nameLocked' && error.remedy === SigningRemedy.UNLOCK, 'changing follows asks to unlock');
    console.log('✓ a locked name still sees whom it follows, and is asked to unlock to change it');
}
