import { isBlurtAccountName } from './BlurtPost.js';

// The Blurt account this device posts as. Blurt Keychain holds its key;
// ForkBuild only needs the name, because Keychain doesn't tell a page which
// accounts it holds.
export class BlurtAnnouncingConfiguration {
    constructor({ account } = {}) {
        const name = typeof account === 'string' ? account.trim().replace(/^@/, '') : account;
        if (!isBlurtAccountName(name)) throw new Error(`BlurtAnnouncingConfiguration: "${account}" is not a Blurt account name`);
        this._account = name;
        Object.freeze(this);
    }

    static fromJSON(raw) {
        try {
            return new BlurtAnnouncingConfiguration(raw ?? {});
        } catch {
            return null;
        }
    }

    get account() { return this._account; }

    toJSON() {
        return { account: this._account };
    }
}
