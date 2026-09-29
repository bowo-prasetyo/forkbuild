// The Editor's sound: a short cue for each edit the user makes
// (core/EditorSoundCues.js), heard through the same kind of provider as World
// View's (audio/WebAudioSoundscapeProvider.js, without ambience), with the
// same device mute and volume.
import { editorSoundCueFor, EDITOR_SOUND_CUE } from '../../core/EditorSoundCues.js';
import { SoundPreference } from '../settings/SoundPreference.js';

export class EditorSoundService {
    constructor({ provider, settingsStore, editorSession }) {
        if (!provider || !settingsStore || !editorSession || typeof editorSession.onCommandActivity !== 'function') {
            throw new Error('EditorSoundService requires a provider, a settingsStore and an editorSession');
        }
        this._provider = provider;
        this._editorSession = editorSession;
        this._preference = new SoundPreference({ provider, settingsStore });
        this._unsubscribe = null;
        this._disposed = false;
    }

    start() {
        if (this._unsubscribe || this._disposed) {
            return;
        }
        this._preference.apply();
        this._unsubscribe = this._editorSession.onCommandActivity((activity, command) => {
            const cue = editorSoundCueFor(activity, command);
            if (cue) {
                this._provider.playEditorCue(cue);
            }
        });
    }

    // Called from a user gesture: the only moment a browser lets audio start.
    unlock() {
        if (!this._disposed) {
            this._provider.resume();
        }
    }

    // A document was saved.
    saved() {
        if (!this._disposed) {
            this._provider.playEditorCue(EDITOR_SOUND_CUE.SAVE);
        }
    }

    settings() {
        return this._preference.settings();
    }

    setMuted(muted) {
        return this._preference.setMuted(muted);
    }

    toggleMuted() {
        return this._preference.toggleMuted();
    }

    setVolume(volume) {
        return this._preference.setVolume(volume);
    }

    dispose() {
        if (this._disposed) {
            return;
        }
        this._disposed = true;
        if (this._unsubscribe) {
            this._unsubscribe();
            this._unsubscribe = null;
        }
        this._provider.dispose();
    }
}
