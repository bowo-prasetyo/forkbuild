// The Editor's sound: a short cue for each edit the user makes
// (core/app/EditorSoundCues.js), heard through the same kind of provider as World
// View's (audio/WebAudioSoundscapeProvider.js, without ambience), with the
// same device mute and volume, and the Editor's own music (core/app/MusicScore.js).
import { editorSoundCueFor, EDITOR_SOUND_CUE } from '../../core/app/EditorSoundCues.js';
import { SoundPreference } from '../settings/SoundPreference.js';
import { MUSIC_MOOD } from '../../core/app/MusicScore.js';

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
        this._provider.setMusicMood?.(MUSIC_MOOD.EDITOR);
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

    toggleSpatial() {
        return this._preference.toggleSpatial();
    }

    toggleMusic() {
        return this._preference.toggleMusic();
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
