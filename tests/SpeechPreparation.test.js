import { prepareSpeech } from '../core/voice/SpeechPreparation.js';
import { cleanTranscript, isOnlySilenceWords, withoutSilenceWords, SILENCE_WORDS } from '../core/voice/Transcript.js';
import { assert } from './support/Assert.js';

// Getting a spoken command ready for the speech model, and reading what it
// says back (core/voice/SpeechPreparation.js, core/voice/Transcript.js).
//
//   Section A: the silence round what was said is cut off, a quiet voice is
//              brought up, and nothing said is nothing sent
//   Section B: what the model makes up from silence, in every language, is
//              not taken for a command; anything more is kept

const RATE = 16000;

// `seconds` of sound: silence at `noise` level, with a tone of `level`
// between `from` and `to` seconds. A fixed pseudo-random hiss, so every run
// hears the same room.
function recording(seconds, { from = null, to = null, level = 0.2, noise = 0.001 } = {}) {
    let seed = 12345;
    const hiss = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return (seed / 0x7fffffff - 0.5) * 2 * noise;
    };
    return Float32Array.from({ length: Math.round(seconds * RATE) }, (_, i) => {
        const t = i / RATE;
        const voiced = from !== null && t >= from && t < to;
        return hiss() + (voiced ? level * Math.sin(2 * Math.PI * 180 * t) : 0);
    });
}

function peakOf(samples) {
    let peak = 0;
    for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
    return peak;
}

// -------------------------------------------------------------
// Section A — preparing the sound
// -------------------------------------------------------------
{
    const said = prepareSpeech(recording(4, { from: 1.5, to: 2.5 }), { sampleRate: RATE });
    assert(said.speech, '1. A word said in a quiet room is speech');
    const seconds = said.samples.length / RATE;
    assert(seconds >= 1 && seconds <= 1.6, `2. The silence round it is cut off, a little kept either side (${seconds.toFixed(2)} s)`);

    const whispered = prepareSpeech(recording(3, { from: 1, to: 2, level: 0.03 }), { sampleRate: RATE });
    assert(whispered.speech && peakOf(whispered.samples) > 0.2, '3. A quiet voice is brought up to a level the model hears well');
    const loud = prepareSpeech(recording(3, { from: 1, to: 2, level: 0.95 }), { sampleRate: RATE });
    assert(Math.abs(peakOf(loud.samples) - peakOf(recording(3, { from: 1, to: 2, level: 0.95 }))) < 1e-6, '4. A loud one is left as it is');

    assert(!prepareSpeech(recording(3), { sampleRate: RATE }).speech, '5. A quiet room with nothing said is not speech');
    assert(!prepareSpeech(recording(3, { noise: 0.004 }), { sampleRate: RATE }).speech, '6. Nor is a hissing one');
    assert(!prepareSpeech(recording(3, { from: 1, to: 1.06 }), { sampleRate: RATE }).speech, '7. Nor a click');
    assert(!prepareSpeech(new Float32Array(0)).speech && !prepareSpeech(null).speech, '8. Nor nothing at all');

    // Talking from the first moment to the last: its own words never count
    // as the room's background.
    const nonstop = prepareSpeech(recording(2, { from: 0, to: 2, level: 0.3 }), { sampleRate: RATE });
    assert(nonstop.speech && nonstop.samples.length === 2 * RATE, '9. A recording that is talk from start to end is all kept');

    const original = recording(3, { from: 1, to: 2, level: 0.03 });
    const copy = Float32Array.from(original);
    prepareSpeech(original, { sampleRate: RATE });
    assert(original.every((value, i) => value === copy[i]), '10. The recording itself is left untouched');
}

// -------------------------------------------------------------
// Section B — what the model makes up from silence
// -------------------------------------------------------------
{
    const madeUp = [
        'Thank you for watching!', 'Thanks for watching.', 'you', 'Thank you.',
        'Vielen Dank fürs Zuschauen!', 'Untertitel der Amara.org-Community',
        '¡Gracias por ver el video!', 'Subtítulos realizados por la comunidad de Amara.org',
        "Merci d'avoir regardé !", "Sous-titres réalisés par la communauté d'Amara.org",
        'Terima kasih telah menonton!', 'Terima kasih.',
        'ご視聴ありがとうございました。', 'チャンネル登録よろしくお願いします',
        '시청해 주셔서 감사합니다.', '시청해주셔서 감사합니다',
        'Obrigado por assistir!', 'Legendas pela comunidade Amara.org'
    ];
    for (const text of madeUp) {
        assert(isOnlySilenceWords(cleanTranscript(text)), `11. "${text}" is what the model makes up from silence`);
        assert(withoutSilenceWords(cleanTranscript(text)) === '', '12. ...and is taken as nothing said');
    }
    const meant = [
        'take me to the old mill', 'Thank you. Go home', 'paint the roof red', 'ホームに戻って', '1인칭', 'pergi ke kincir tua',
        'terima kasih, matikan suara', 'youth hostel'
    ];
    for (const text of meant) {
        assert(!isOnlySilenceWords(cleanTranscript(text)), `13. "${text}" is a command, kept`);
        assert(withoutSilenceWords(text) === text, '14. ...word for word');
    }
    assert(!isOnlySilenceWords(''), '15. Nothing is not a made-up phrase (it is simply nothing)');
    assert(new Set(SILENCE_WORDS).size === SILENCE_WORDS.length, '16. (fixture) each phrase listed once');
}

console.log('✅ Speech preparation tests passed.');
