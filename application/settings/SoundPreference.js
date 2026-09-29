// This device's mute and volume choice, applied to a sound provider and kept
// in a SoundSettingsStore. Shared by World View's and the Editor's sound, so
// muting in one is muted in the other.
export class SoundPreference {
    constructor({ provider, settingsStore }) {
        if (!provider || !settingsStore) {
            throw new Error('SoundPreference requires a provider and a settingsStore');
        }
        this._provider = provider;
        this._settingsStore = settingsStore;
        this._settings = settingsStore.get();
    }

    // Hands the current choice to the provider.
    apply() {
        this._provider.setVolume(this._settings.volume);
        this._provider.setMuted(this._settings.muted);
    }

    settings() {
        return this._settings;
    }

    setMuted(muted) {
        this._settings = this._settingsStore.save({ ...this._settings, muted: Boolean(muted) });
        this._provider.setMuted(this._settings.muted);
        // Unmuting is a click or key press: the moment a browser lets audio start.
        if (!this._settings.muted) {
            this._provider.resume();
        }
        return this._settings;
    }

    toggleMuted() {
        return this.setMuted(!this._settings.muted);
    }

    setVolume(volume) {
        const next = Number(volume);
        if (!Number.isFinite(next)) {
            return this._settings;
        }
        this._settings = this._settingsStore.save({ ...this._settings, volume: next });
        this._provider.setVolume(this._settings.volume);
        return this._settings;
    }
}
