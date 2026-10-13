import {
    BEATS_PER_PHRASE, MUSIC_MOOD, MUSIC_MOODS, PHRASES_PER_PIECE, isRestPhrase, musicMoodFor, musicPhrase, secondsPerBeat
} from '../core/MusicScore.js';
import { normalizeSoundSettings, DEFAULT_SOUND_SETTINGS } from '../core/SoundSettings.js';
import { SoundSettingsStore } from '../application/settings/SoundSettingsStore.js';
import { WorldSoundscapeService } from '../application/world/WorldSoundscapeService.js';
import { EditorSoundService } from '../application/editor/EditorSoundService.js';
import { assert } from './support/Assert.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';

// The music (core/MusicScore.js): generated phrases in three moods, the
// same notes for the same seed, rests between pieces; the device's choice
// whether it plays; and the moods World View and the Editor ask for.
// tests/MusicBrowser.test.js renders it with a real OfflineAudioContext.

const pitchClasses = (tonic, scale) => new Set(scale.map((step) => (tonic + step) % 12));
const F_MAJOR = pitchClasses(65, [0, 2, 4, 5, 7, 9, 11]);
const C_MAJOR = pitchClasses(60, [0, 2, 4, 5, 7, 9, 11]);
const A_MINOR = pitchClasses(57, [0, 2, 3, 5, 7, 8, 10]);

// Phrases: deterministic, in key, in reach, within the phrase.
{
    for (const [mood, scale] of [[MUSIC_MOOD.EDITOR, C_MAJOR], [MUSIC_MOOD.DAY, F_MAJOR], [MUSIC_MOOD.NIGHT, A_MINOR]]) {
        for (let index = 0; index < PHRASES_PER_PIECE * 3; index++) {
            const notes = musicPhrase(mood, index, 42);
            if (isRestPhrase(index)) {
                assert(notes.length === 0, `${mood} phrase ${index} is a rest`);
                continue;
            }
            assert(JSON.stringify(notes) === JSON.stringify(musicPhrase(mood, index, 42)), `${mood} phrase ${index} is the same every time`);
            assert(Object.isFrozen(notes) && notes.every(Object.isFrozen), 'a phrase is immutable');
            assert(notes.some((note) => note.voice === 'melody') && notes.some((note) => note.voice === 'pad') && notes.some((note) => note.voice === 'bass'),
                `${mood} phrase ${index} has a melody, a pad and a bass`);
            for (const note of notes) {
                assert(scale.has(note.midi % 12), `${mood}: every note is in the key (${note.midi})`);
                assert(note.beat >= 0 && note.beat + note.beats <= BEATS_PER_PHRASE, `${mood}: every note is within its phrase`);
                assert(note.velocity > 0 && note.velocity <= 1, 'velocities are between 0 and 1');
                if (note.voice === 'melody') assert(note.midi >= 64 && note.midi <= 90, `${mood}: the melody is never shrill or muddy (${note.midi})`);
            }
            for (let i = 1; i < notes.length; i++) assert(notes[i - 1].beat <= notes[i].beat, 'notes are in order');
        }
    }
    const melody = (seed) => JSON.stringify(musicPhrase(MUSIC_MOOD.DAY, 0, seed).filter((note) => note.voice === 'melody'));
    assert(melody(1) !== melody(2), 'two visits play different tunes');
    assert(JSON.stringify(musicPhrase(MUSIC_MOOD.DAY, 0, 1)) !== JSON.stringify(musicPhrase(MUSIC_MOOD.DAY, 1, 1)), 'phrases follow on rather than repeat');
    console.log('✓ phrases are the same for the same seed, in key, within reach, and pieces end in rests');
}

// The moods differ, and the night is slow and sparse.
{
    assert(MUSIC_MOODS.length === 3, 'three moods');
    assert(secondsPerBeat(MUSIC_MOOD.NIGHT) > secondsPerBeat(MUSIC_MOOD.DAY) && secondsPerBeat(MUSIC_MOOD.DAY) > secondsPerBeat(MUSIC_MOOD.EDITOR),
        'the Editor is livelier than the day, the night slowest');
    const count = (mood) => {
        let notes = 0;
        for (let seed = 0; seed < 20; seed++) notes += musicPhrase(mood, 0, seed).filter((note) => note.voice === 'melody').length;
        return notes;
    };
    assert(count(MUSIC_MOOD.NIGHT) < count(MUSIC_MOOD.DAY) && count(MUSIC_MOOD.DAY) < count(MUSIC_MOOD.EDITOR), 'the night has the fewest notes');
    assert(isRestPhrase(-2) && !isRestPhrase(-3), 'any index belongs to a piece');
    assert(musicPhrase('unknown', 0, 1).length > 0, 'an unknown mood plays the day');
    assert(musicMoodFor({ view: 'editor', nightLevel: 1 }) === MUSIC_MOOD.EDITOR, 'the Editor has its own mood, day or night');
    assert(musicMoodFor({ view: 'world', nightLevel: 0.2 }) === MUSIC_MOOD.DAY && musicMoodFor({ view: 'world', nightLevel: 0.8 }) === MUSIC_MOOD.NIGHT,
        'World View plays the day\'s tune, then the night\'s');
    console.log('✓ three moods: the Editor livelier, the day warm, the night slow and sparse');
}

// Music is on unless turned off, and the choice is kept.
{
    assert(DEFAULT_SOUND_SETTINGS.music === true, 'music plays by default');
    assert(normalizeSoundSettings({ muted: false, volume: 0.4, spatial: false }).music === true, 'a choice saved before music existed reads as music on');
    const storage = new InMemoryStorageProvider();
    new SoundSettingsStore({ storageProvider: storage }).save({ music: false, volume: 0.4 });
    assert(new SoundSettingsStore({ storageProvider: storage }).get().music === false, 'turning music off is kept');
    console.log('✓ music is on unless turned off, and the choice is kept');
}

// The services hand the choice and the mood to the provider.
{
    class MusicProvider {
        constructor() { this.music = null; this.moods = []; this.resumed = 0; }
        resume() { this.resumed++; }
        setLayerLevels() {}
        setVolume() {}
        setMuted(muted) { this.muted = muted; }
        setSpatial() {}
        setMusic(music) { this.music = music; }
        setMusicMood(mood) { this.moods.push(mood); }
        playEditorCue() {}
        dispose() {}
    }
    const storage = new InMemoryStorageProvider();
    const provider = new MusicProvider();
    let night = 0;
    const world = new WorldSoundscapeService({
        provider,
        settingsStore: new SoundSettingsStore({ storageProvider: storage }),
        listenerPosition: () => ({ x: 0, y: 0, z: 0 }),
        seed: 1,
        nightLevel: () => night,
        setIntervalFn: () => 1,
        clearIntervalFn: () => {}
    });
    world.start();
    assert(provider.music === true && provider.moods.at(-1) === MUSIC_MOOD.DAY, 'World View starts the day\'s music');
    night = 0.9;
    world.sample();
    assert(provider.moods.at(-1) === MUSIC_MOOD.NIGHT, 'and turns to the night\'s after dark');
    const off = world.toggleMusic();
    assert(off.music === false && provider.music === false, 'the music button turns it off');
    assert(new SoundSettingsStore({ storageProvider: storage }).get().music === false, 'and that is saved');
    const resumed = provider.resumed;
    assert(world.toggleMusic().music === true && provider.music === true && provider.resumed === resumed + 1,
        'turning it back on is a click: audio may start');

    const editorProvider = new MusicProvider();
    const editor = new EditorSoundService({
        provider: editorProvider,
        settingsStore: new SoundSettingsStore({ storageProvider: storage }),
        editorSession: { onCommandActivity: () => () => {} }
    });
    editor.start();
    assert(editorProvider.moods.at(-1) === MUSIC_MOOD.EDITOR && editorProvider.music === true, 'the Editor plays its own mood');
    assert(editor.toggleMusic().music === false && editorProvider.music === false, 'and has the same music button');
    editor.dispose();
    world.dispose();
    console.log('✓ World View and the Editor hand the music choice and their mood to the provider');
}
