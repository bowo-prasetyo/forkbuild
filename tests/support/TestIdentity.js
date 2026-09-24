// Test-support only. A fresh, authenticated local identity in memory.
import { LocalIdentityProvider } from '../../identity/LocalIdentityProvider.js';
import { InMemoryStorageProvider } from './InMemoryStorageProvider.js';

export function makeIdentity(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    return provider;
}
