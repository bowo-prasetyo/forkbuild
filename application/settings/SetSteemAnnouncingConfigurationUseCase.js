import { SteemAnnouncingConfiguration } from '../../core/SteemAnnouncingConfiguration.js';
import { SteemAnnouncingConfigurationStore } from '../../storage/SteemAnnouncingConfigurationStore.js';

export class SetSteemAnnouncingConfigurationUseCase {
    constructor({ steemAnnouncingConfigurationStore } = {}) {
        if (!(steemAnnouncingConfigurationStore instanceof SteemAnnouncingConfigurationStore)) {
            throw new Error('SetSteemAnnouncingConfigurationUseCase requires a SteemAnnouncingConfigurationStore');
        }
        this._store = steemAnnouncingConfigurationStore;
    }

    // Throws with a readable message for a name that isn't a Steem account.
    execute({ account } = {}) {
        const configuration = new SteemAnnouncingConfiguration({ account });
        this._store.save(configuration);
        return configuration;
    }
}
