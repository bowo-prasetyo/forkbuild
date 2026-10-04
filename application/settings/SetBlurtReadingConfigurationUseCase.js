import { BlurtReadingConfiguration } from '../../core/BlurtReadingConfiguration.js';
import { BlurtReadingConfigurationStore } from '../../storage/BlurtReadingConfigurationStore.js';

export class SetBlurtReadingConfigurationUseCase {
    constructor({ blurtReadingConfigurationStore } = {}) {
        if (!(blurtReadingConfigurationStore instanceof BlurtReadingConfigurationStore)) {
            throw new Error('SetBlurtReadingConfigurationUseCase requires a BlurtReadingConfigurationStore');
        }
        this._store = blurtReadingConfigurationStore;
    }

    // Throws with a readable message when a field doesn't validate.
    execute({ apiNodes, followedAccounts, earliestPeriod } = {}) {
        const configuration = new BlurtReadingConfiguration({ apiNodes, followedAccounts, earliestPeriod });
        this._store.save(configuration);
        return configuration;
    }
}
