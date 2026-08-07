import { IdentityProvider } from './IdentityProvider.js';
import { Identity } from './Identity.js';

const STORAGE_KEY = 'local-identity';
const PROVIDER_ID = 'local';

// The first concrete IdentityProvider: no wallet, no cryptographic
// signing — just a username the user types once and this provider
// remembers, via an injected StorageProvider (same DI pattern
// SaveDocumentUseCase/LoadDocumentUseCase use — this class never imports
// a concrete storage backend itself). This is what lets V0.1 populate
// DocumentMetadata.author with something meaningful before any real
// wallet integration exists.
//
// sign(data) is honest about what it is: an attribution stamp, not a
// cryptographic signature. It doesn't throw — this provider genuinely
// can "sign" in the sense of attributing authorship — but callers must
// not mistake this for verifiable proof of identity the way a future
// Steem Keychain/wallet signature would be. A Publisher Adapter
// consuming sign() output needs to know which providerId produced it,
// which is exactly why the signed payload carries one.
export class LocalIdentityProvider extends IdentityProvider {
    constructor(storageProvider) {
        super();
        this._storageProvider = storageProvider;
    }

    login(username) {
        const identity = new Identity({ username, providerId: PROVIDER_ID });
        this._storageProvider.save(STORAGE_KEY, { username });
        return identity;
    }

    logout() {
        this._storageProvider.remove(STORAGE_KEY);
    }

    currentUser() {
        const stored = this._storageProvider.load(STORAGE_KEY);
        if (!stored) {
            return null;
        }
        return new Identity({ username: stored.username, providerId: PROVIDER_ID });
    }

    sign(data) {
        const user = this.currentUser();
        if (!user) {
            throw new Error('LocalIdentityProvider: cannot sign, no user logged in');
        }
        return { signedBy: user.username, providerId: PROVIDER_ID, data };
    }
}
