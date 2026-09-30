import { PeerLifecycleState } from '../../../peer/PeerLifecycleState.js';
import { t } from '../../i18n/i18n.js';

// Labels, badge classes and small formatters for the Peers page.

export const LIFECYCLE_LABELS = {
    [PeerLifecycleState.CONNECTING]: t('peerConnections.connecting'),
    [PeerLifecycleState.CONNECTED]: t('peerConnections.connectedNotYetAuthenticated'),
    [PeerLifecycleState.AUTHENTICATING]: t('peerConnections.authenticating'),
    [PeerLifecycleState.AUTHENTICATED]: t('peerConnections.authenticated'),
    [PeerLifecycleState.FAILED]: t('peerConnections.failed')
};

export const LIFECYCLE_CLASSES = {
    [PeerLifecycleState.CONNECTING]: 'peer-badge--pending',
    [PeerLifecycleState.CONNECTED]: 'peer-badge--pending',
    [PeerLifecycleState.AUTHENTICATING]: 'peer-badge--pending',
    [PeerLifecycleState.AUTHENTICATED]: 'peer-badge--authenticated',
    [PeerLifecycleState.FAILED]: 'peer-badge--failed'
};

// The five-step connection progression, each step read from a peer's
// getLifecycleState(). The first two are always reached: a connection only
// exists once an invitation was imported and its WebRtcPeerConnection
// created, so neither has an observable "not yet" moment.
export const PROGRESSION_STEPS = [
    { label: t('peerConnections.rendezvousDiscovered'), reached: () => true },
    { label: t('peerConnections.webrtcConnecting'), reached: () => true },
    { label: t('peerConnections.peerConnected'), reached: (state) => state !== PeerLifecycleState.CONNECTING && state !== PeerLifecycleState.FAILED },
    { label: t('peerConnections.authenticatingIdentity'), reached: (state) => state === PeerLifecycleState.AUTHENTICATING || state === PeerLifecycleState.AUTHENTICATED },
    { label: t('peerConnections.authenticated'), reached: (state) => state === PeerLifecycleState.AUTHENTICATED }
];

export function formatDuration(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
}

export function stripPrefix(message) {
    return message.replace(/^(PeerSessionManager|PeerRelationshipUseCase|PeerReconnectionUseCase|FindPeerUseCase|FriendRelationshipUseCase|PeerBlockUseCase|LocalPeerDiscoveryProvider|WebRtcPeerConnectionProvider|WebRtcPeerConnection|PeerInvitation|PeerConnectionOffer|PeerConnectionAnswer):\s*/, '');
}

export function shortId(identityId) {
    return identityId ? identityId.slice(-14) : '';
}

export function formatWhen(date) {
    return date instanceof Date ? date.toLocaleString() : '';
}
