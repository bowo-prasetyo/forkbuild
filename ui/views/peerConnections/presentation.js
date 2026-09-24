import { PeerLifecycleState } from '../../../peer/PeerLifecycleState.js';

// Labels, badge classes and small formatters for the Peers page.

export const LIFECYCLE_LABELS = {
    [PeerLifecycleState.CONNECTING]: 'Connecting…',
    [PeerLifecycleState.CONNECTED]: 'Connected — not yet authenticated',
    [PeerLifecycleState.AUTHENTICATING]: 'Authenticating…',
    [PeerLifecycleState.AUTHENTICATED]: 'Authenticated',
    [PeerLifecycleState.FAILED]: 'Failed'
};

export const LIFECYCLE_CLASSES = {
    [PeerLifecycleState.CONNECTING]: 'peer-badge--pending',
    [PeerLifecycleState.CONNECTED]: 'peer-badge--pending',
    [PeerLifecycleState.AUTHENTICATING]: 'peer-badge--pending',
    [PeerLifecycleState.AUTHENTICATED]: 'peer-badge--authenticated',
    [PeerLifecycleState.FAILED]: 'peer-badge--failed'
};

// The five-step progression the design doc asked for, each step read
// from a peer's getLifecycleState(). The first two are always reached
// for any card "My Peers" can show: a card only exists once an
// invitation was imported (rendezvous) and a real WebRtcPeerConnection
// was created for it (connecting) — neither has a separately-observable
// "not yet" moment of its own.
export const PROGRESSION_STEPS = [
    { label: 'Rendezvous discovered', reached: () => true },
    { label: 'WebRTC connecting', reached: () => true },
    { label: 'Peer connected', reached: (state) => state !== PeerLifecycleState.CONNECTING && state !== PeerLifecycleState.FAILED },
    { label: 'Authenticating identity', reached: (state) => state === PeerLifecycleState.AUTHENTICATING || state === PeerLifecycleState.AUTHENTICATED },
    { label: 'Authenticated', reached: (state) => state === PeerLifecycleState.AUTHENTICATED }
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
