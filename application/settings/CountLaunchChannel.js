// Tells the visitor counter which launch channel a visit came through
// (core/LaunchChannel.js), under the funnel events' rules: the official site
// only, the Count this browser setting, Global Privacy Control and Do Not
// Track. Called once at startup; never throws.
import { launchChannelHitUrl, launchChannelOf } from '../../core/LaunchChannel.js';
import { shouldCountFunnelEvent } from '../../core/VisitorCount.js';

// Returns the channel counted, or null.
export function countLaunchChannel({ search, settingsStore, origin, privacySignals, random = Math.random, sendHit }) {
    try {
        const channel = launchChannelOf(search);
        if (!channel || !shouldCountFunnelEvent({ settings: settingsStore.get(), origin, privacySignals })) return null;
        sendHit(launchChannelHitUrl(channel, String(random()).slice(2)));
        return channel;
    } catch {
        return null;
    }
}
