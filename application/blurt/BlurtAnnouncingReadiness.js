import { isBlurtAccountName } from '../../core/BlurtPost.js';

// Why posting on Blurt would be refused right now, or null when it can be
// tried. Shown where a failed post would otherwise go unnoticed.
export function describeBlurtAnnouncingUnreadiness({ account, keychain }) {
    if (!isBlurtAccountName(account)) return 'Set your Blurt account in Network Settings → Blurt to post on Blurt.';
    if (!keychain || typeof keychain.requestBroadcast !== 'function') return 'Blurt Keychain was not found. Install it (or WhaleVault) and add your Blurt account to post on Blurt.';
    return null;
}
