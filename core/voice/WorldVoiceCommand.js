// A command spoken in World View (ui/voice/useVoiceCommands.js), read as one
// of the few things a player there does with a button or a key: go to a
// place ("take me to the old mill"), go home, change the camera ("first
// person"), turn the sound off or on, undo or redo, or talk to the resident
// beside them.
//
// Words are matched as the Build Library's search matches them
// (core/library/LibrarySearch.js#wordsFound()): whole words, or with a short
// ending, ignoring accents, and anywhere in the text for Japanese, Chinese
// and Korean. The words come from the chosen language's messages
// (ui/i18n/worldVoiceWords.js), the places from the World's Locations list.
//
// Pure: text, words and places in, a command or null out.
import { wordsFound } from '../library/LibrarySearch.js';
import { actionNamed } from './Transcript.js';

// The commands besides going to a place, first winning a tie.
export const WORLD_VOICE_COMMANDS = Object.freeze(['home', 'free', 'firstPerson', 'thirdPerson', 'birdEye', 'soundOff', 'soundOn', 'undo', 'redo', 'talk']);

const WITHOUT_SPACES = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

// How well `text` holds one of `phrases`: only a phrase found whole counts,
// and a longer one counts more. 0 when none is there.
function phraseScore(text, phrases, ignoredWords) {
    let best = 0;
    for (const phrase of phrases || []) {
        const whole = wordsFound(phrase, [phrase], ignoredWords);
        if (whole === 0 || wordsFound(text, [phrase], ignoredWords) < whole) continue;
        best = Math.max(best, WITHOUT_SPACES.test(phrase) ? [...phrase.trim()].length : whole);
    }
    return best;
}

// The place whose name `text` holds most of: the most of its words, then the
// largest share of them, then the first listed. Null when none of them.
function placeNamed(text, places, ignoredWords) {
    let best = null;
    let bestFound = 0;
    let bestShare = 0;
    for (const place of places) {
        const name = place?.title;
        if (typeof name !== 'string' || !name.trim()) continue;
        const found = wordsFound(text, [name], ignoredWords);
        if (found === 0) continue;
        const share = found / Math.max(1, wordsFound(name, [name], ignoredWords));
        if (found > bestFound || (found === bestFound && share > bestShare)) {
            best = place;
            bestFound = found;
            bestShare = share;
        }
    }
    return best;
}

// What `transcript` asks for, given `vocabulary`:
//   { goTo, home, free, firstPerson, thirdPerson, birdEye, soundOff, soundOn,
//     undo, redo, talk, ignoredWords }
// each a list of words, and `places`, the World's locations
// (`{ id, title }`). `{ kind: 'goTo', place }` (`place` null when no place
// has that name), or `{ kind }` with `kind` one of WORLD_VOICE_COMMANDS.
// Null when it is none of these.
export function interpretWorldCommand(transcript, vocabulary = {}, places = []) {
    if (typeof transcript !== 'string' || !transcript.trim()) return null;
    const ignoredWords = vocabulary.ignoredWords || [];
    const named = actionNamed(transcript, places.map((place) => ({ place, label: place?.title || '' })));
    if (named) return { kind: 'goTo', place: named.place };

    let kind = null;
    let most = 0;
    for (const command of WORLD_VOICE_COMMANDS) {
        const score = phraseScore(transcript, vocabulary[command], ignoredWords);
        if (score > most) {
            most = score;
            kind = command;
        }
    }
    if (phraseScore(transcript, vocabulary.goTo, ignoredWords) > 0) {
        const place = placeNamed(transcript, places, ignoredWords);
        // "Go to home" is home; "go to the old mill" is the mill.
        if (place || !kind) return { kind: 'goTo', place };
    }
    return kind ? { kind } : null;
}
