// Base class every identity provider extends. login()/logout()/
// currentUser()/sign(data) — the same shape every future concrete
// provider (Steem Keychain, Hive Keychain, a wallet) will need,
// regardless of how authentication actually works underneath. The
// application only ever calls these four methods; it never knows or
// cares whether the answer came from Steem Keychain, MetaMask,
// WalletConnect, a desktop wallet, or something not invented yet. All
// four throw by default — same discipline as Command/Serializer/
// StorageProvider: a provider must explicitly implement what it
// supports, nothing is assumed.
export class IdentityProvider {
    login(credentials) {
        throw new Error('IdentityProvider.login() must be implemented by a subclass');
    }

    logout() {
        throw new Error('IdentityProvider.logout() must be implemented by a subclass');
    }

    currentUser() {
        throw new Error('IdentityProvider.currentUser() must be implemented by a subclass');
    }

    sign(data) {
        throw new Error('IdentityProvider.sign() must be implemented by a subclass');
    }
}
