import { AvatarSayTrustBoundary } from './AvatarSayTrustBoundary.js';

// Lines said aloud, sent and received on their own channel
// (`forkbuild:avatar-say`, application/world/CreateWorldViewUseCase.js), the
// way application/avatar/AvatarInteractionSyncService.js carries gestures: an
// event is published once and never republished, and pull() returns only
// the lines its trust boundary accepted since the last pull, never a list
// kept to ask for again.
export class AvatarSaySyncService {
    constructor(broadcastProvider = null, { localAvatarId = null, trustBoundary = new AvatarSayTrustBoundary() } = {}) {
        this._broadcastProvider = broadcastProvider;
        this._localAvatarId = localAvatarId;
        this._trustBoundary = trustBoundary;
        this._inbox = [];
        this._unsubscribe = broadcastProvider
            ? broadcastProvider.onAdvertisement((advertisement) => { this._inbox.push(advertisement); })
            : null;
    }

    publish(advertisement) {
        if (this._broadcastProvider) {
            this._broadcastProvider.advertise(advertisement);
        }
    }

    pull() {
        const inbox = this._inbox;
        this._inbox = [];
        const accepted = [];
        for (const advertisement of inbox) {
            if (this._localAvatarId && advertisement && advertisement.avatarId === this._localAvatarId) {
                continue;
            }
            if (this._trustBoundary.evaluate(advertisement).accepted) {
                accepted.push(advertisement);
            }
        }
        return accepted;
    }

    dispose() {
        if (this._unsubscribe) {
            this._unsubscribe();
            this._unsubscribe = null;
        }
        this._inbox = [];
    }
}
