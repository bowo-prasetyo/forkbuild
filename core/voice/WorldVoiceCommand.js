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
// A place's name may also be heard a little wrong: a small speech model
// writes "the old mil", "the brige" or "the light house". When "go to" was
// said and no name is found whole, a name word is matched to a word heard
// within an edit or two (fuzzyPlaceNamed()), and only when one place is
// clearly nearest, so a near miss never sends anyone to the wrong place.
// And a command heard as words that only sound like it ("and do that") is
// still that command, when one clearly sounds nearest.
//
// Pure: text, words and places in, a command or null out.
import { wordsFound, wordsOf, fold } from '../library/LibrarySearch.js';
import { actionNamed, nearestBySound, soundsExactly } from './Transcript.js';

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

// A name word shorter than this is never matched fuzzily: one edit away,
// short words are other words ("mil" is not "mill" if "mild" is a place).
const FUZZY_SHORTEST_WORD = 4;

// How many edits a name word allows: one, or two from this long.
const FUZZY_TWO_EDITS_FROM = 8;

// The edits (a letter added, dropped, changed, or two side by side swapped)
// between `a` and `b`, arrays of characters, or `max + 1` once it is more
// than `max`.
function editsBetween(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let before = null;
    let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
        const current = [i];
        let rowBest = i;
        for (let j = 1; j <= b.length; j++) {
            const change = a[i - 1] === b[j - 1] ? 0 : 1;
            let edits = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + change);
            if (before && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
                edits = Math.min(edits, before[j - 2] + 1);
            }
            current.push(edits);
            rowBest = Math.min(rowBest, edits);
        }
        if (rowBest > max) return max + 1;
        before = previous;
        previous = current;
    }
    return Math.min(previous[b.length], max + 1);
}

// The place whose name `text` holds a near miss of, when none is held whole:
// each name word (FUZZY_SHORTEST_WORD letters or more, not an ignored word)
// is matched to a word heard, or two heard side by side ("light house"),
// that starts with the same letter and is within one edit (two from
// FUZZY_TWO_EDITS_FROM letters). The words of "go to" and the ignored words
// are left out of what was heard first, so "take me to" never matches a
// place called "Lake". The most name words matched wins, then the fewest
// edits; a tie is no place, never a guess. Only where words are spaced:
// Japanese, Chinese and Korean names are found whole or not at all.
function fuzzyPlaceNamed(text, places, vocabulary) {
    if (WITHOUT_SPACES.test(text)) return null;
    const ignored = new Set((vocabulary.ignoredWords || []).map(fold));
    const commandWords = new Set([...(vocabulary.goTo || []).flatMap(wordsOf), ...ignored]);
    const heard = wordsOf(text).filter((word) => !commandWords.has(word));
    const candidates = [...heard, ...heard.slice(1).map((word, i) => heard[i] + word)].map((word) => Array.from(word));
    let best = null;
    let tied = false;
    for (const place of places) {
        const name = place?.title;
        if (typeof name !== 'string' || WITHOUT_SPACES.test(name)) continue;
        let matched = 0;
        let edits = 0;
        for (const word of new Set(wordsOf(name))) {
            const letters = Array.from(word);
            if (letters.length < FUZZY_SHORTEST_WORD || ignored.has(word)) continue;
            const allowed = letters.length >= FUZZY_TWO_EDITS_FROM ? 2 : 1;
            let nearest = allowed + 1;
            for (const candidate of candidates) {
                if (candidate[0] !== letters[0]) continue;
                nearest = Math.min(nearest, editsBetween(candidate, letters, allowed));
            }
            if (nearest <= allowed) {
                matched++;
                edits += nearest;
            }
        }
        if (matched === 0) continue;
        if (!best || matched > best.matched || (matched === best.matched && edits < best.edits)) {
            best = { place, matched, edits };
            tied = false;
        } else if (matched === best.matched && edits === best.edits) {
            tied = true;
        }
    }
    return best && !tied ? best.place : null;
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
    const commands = WORLD_VOICE_COMMANDS.map((command) => ({ value: command, phrases: vocabulary[command] }));
    // All of what was said is one command's phrase, spaces aside: "un mute"
    // is unmute, never the "mute" inside it.
    const whole = soundsExactly(transcript, commands);
    if (whole) return { kind: whole };

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
        // A near miss only when nothing else was asked for: "go to home" is
        // home, however near "Homes" is.
        const place = placeNamed(transcript, places, ignoredWords) || (kind ? null : fuzzyPlaceNamed(transcript, places, vocabulary));
        // "Go to home" is home; "go to the old mill" is the mill.
        if (place || !kind) return { kind: 'goTo', place };
    }
    if (kind) return { kind };
    // Nothing found whole: the command that sounds most like what was heard
    // ("and do that" is undo), when one clearly does
    // (core/voice/Transcript.js#nearestBySound()).
    const sounded = nearestBySound(transcript, commands);
    return sounded ? { kind: sounded } : null;
}
