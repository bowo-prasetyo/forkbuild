import { isSteemAccountName } from './SteemDiscoveryThread.js';

// The Steem account this device announces as. Steem Keychain holds its
// key; ForkBuild only needs the name, because Keychain doesn't tell a page
// which accounts it holds.
export class SteemAnnouncingConfiguration {
    constructor({ account } = {}) {
        const name = typeof account === 'string' ? account.trim().replace(/^@/, '') : account;
        if (!isSteemAccountName(name)) throw new Error(`SteemAnnouncingConfiguration: "${account}" is not a Steem account name`);
        this._account = name;
        Object.freeze(this);
    }

    static fromJSON(raw) {
        try {
            return new SteemAnnouncingConfiguration(raw ?? {});
        } catch {
            return null;
        }
    }

    get account() { return this._account; }

    toJSON() {
        return { account: this._account };
    }
}
