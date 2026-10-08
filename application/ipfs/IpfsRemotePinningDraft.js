import { IpfsRemotePublishingConfiguration } from './IpfsRemotePublishingConfiguration.js';
import { recallIpfsRemotePublishingCredential } from './IpfsRemotePublishingCredentialMemory.js';

// What every remote-pinning form starts with: the service saved on the
// Content Provider page (core/IpfsRemotePinningSettings.js, through the
// store's get()), and the token typed earlier in this visit, if any. The
// person can still change any of it before using it; nothing here saves.
export function remotePinningDraftFromSettings(settings) {
    return {
        endpoint: settings ? settings.endpoint : '',
        credential: recallIpfsRemotePublishingCredential() || '',
        requestField: settings && settings.requestField ? settings.requestField : '',
        responseField: settings && settings.responseField ? settings.responseField : ''
    };
}

// A ready configuration for the saved service, or null when none is saved:
// built fresh on each call, so it carries whatever token this visit has.
export function remotePinningConfigurationFromSettings(settings) {
    if (!settings) return null;
    return new IpfsRemotePublishingConfiguration(remotePinningDraftFromSettings(settings));
}
