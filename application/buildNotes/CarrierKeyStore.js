// The carrier key this device signs build notes with (nostr/AppNostrSigner.js,
// core/publication/BuildNote.js): made the first time a build is sent to everyone, then
// kept, so each build's note is replaced rather than repeated. It is not the
// builder's identity and signs nothing of theirs. Personal and local: never
// published or shared.
import { StorageProvider } from '../../storage/StorageProvider.js';

const STORAGE_KEY = 'nostr-carrier-key';

export class CarrierKeyStore {
    // `generate()` makes a new secret key and `isValid(key)` checks one (both
    // from nostr/AppNostrSigner.js, injected so this file stays free of it).
    constructor({ storageProvider, generate, isValid }) {
        if (!(storageProvider instanceof StorageProvider)) {
            throw new Error('CarrierKeyStore requires a StorageProvider');
        }
        if (typeof generate !== 'function' || typeof isValid !== 'function') {
            throw new Error('CarrierKeyStore requires generate() and isValid()');
        }
        this._storage = storageProvider;
        this._generate = generate;
        this._isValid = isValid;
    }

    // The kept key, made and kept first when there is none (or it is damaged).
    secretKey() {
        let kept = null;
        try {
            kept = this._storage.load(STORAGE_KEY)?.secretKey ?? null;
        } catch {
            kept = null;
        }
        if (this._isValid(kept)) return kept;
        const made = this._generate();
        this._storage.save(STORAGE_KEY, { secretKey: made });
        return made;
    }
}
