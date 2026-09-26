import { SteemReadingConfiguration } from '../../core/SteemReadingConfiguration.js';
import { SteemReadingConfigurationStore } from '../../storage/SteemReadingConfigurationStore.js';

export class SetSteemReadingConfigurationUseCase {
    constructor({ steemReadingConfigurationStore } = {}) {
        if (!(steemReadingConfigurationStore instanceof SteemReadingConfigurationStore)) {
            throw new Error('SetSteemReadingConfigurationUseCase requires a SteemReadingConfigurationStore');
        }
        this._store = steemReadingConfigurationStore;
    }

    // Throws with a readable message when a field doesn't validate.
    execute({ apiNodes, threadAccounts, earliestPeriod } = {}) {
        const configuration = new SteemReadingConfiguration({ apiNodes, threadAccounts, earliestPeriod });
        this._store.save(configuration);
        return configuration;
    }
}
