import { isSteemAccountName } from '../../core/SteemDiscoveryThread.js';

// Why announcing on Steem would be refused right now, or null when it can be
// tried. Shown where a failed announcement would otherwise go unnoticed.
export function describeSteemAnnouncingUnreadiness({ account, keychain }) {
    if (!isSteemAccountName(account)) return 'Set your Steem account in Network Settings → Steem to post on Steem.';
    if (!keychain || typeof keychain.requestBroadcast !== 'function') return 'Steem Keychain was not found. Install it and add your Steem account to post on Steem.';
    return null;
}
