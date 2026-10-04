import { BlurtAnnouncingConfiguration } from '../../core/BlurtAnnouncingConfiguration.js';
import { BlurtAnnouncingConfigurationStore } from '../../storage/BlurtAnnouncingConfigurationStore.js';

export class SetBlurtAnnouncingConfigurationUseCase {
    constructor({ blurtAnnouncingConfigurationStore } = {}) {
        if (!(blurtAnnouncingConfigurationStore instanceof BlurtAnnouncingConfigurationStore)) {
            throw new Error('SetBlurtAnnouncingConfigurationUseCase requires a BlurtAnnouncingConfigurationStore');
        }
        this._store = blurtAnnouncingConfigurationStore;
    }

    // Throws with a readable message for a name that isn't a Blurt account.
    execute({ account } = {}) {
        const configuration = new BlurtAnnouncingConfiguration({ account });
        this._store.save(configuration);
        return configuration;
    }
}
