# Telling the speech model what to expect: measured, not used

**Question.** Voice building hears commands with Whisper base, in the
browser, given nothing but the recording and its language. Whisper can also
be given a prompt, text it takes for what was said just before, which leans
it toward those words. Would a prompt of the words the app can act on make
voice better, without making it do things nobody asked for?

**Answer: no, not as it stands.** Both prompts heard many more commands
right, far beyond chance. But both made voice do things that have to be
undone, in more than one language, where it had done none, and the rule set
before measuring rejects that, whatever else improves. The app keeps hearing
without a prompt. The prompt stays measurable, as below, for the changes that
could make it safe.

**Re-run, 2026-10-31:** the app now throws away what the model makes up
from noise and what repeats itself; with that, no sound did anything under
either prompt, but both still fail on words pulled toward a command. See
*Re-run with guards*. Nor does a prompt without the words near a command pass,
nor one in English only: see *Second re-run*.

## What was compared

| | Whisper is given |
|---|---|
| A, baseline | the recording and its language, as the app does now |
| B, vocabulary | as A, and a prompt of each thing the app can do, by its first name |
| C, expanded | as A, and a prompt of every phrasing the app reads |

The prompts are made by `ui/voice/voicePrompt.js` from the words the app
reads a command with, so a new part, colour, action or Location is in them
as soon as the app can act on it, and nothing the app can't act on is.
In the Editor: the action names, then "everything" and "this", the colours,
the parts, and last what to do (paint, delete, select). In World View: its
commands, then "go to" and the World's Locations. The most telling words go
last, where Whisper heeds them most. `application/voice/SpeechRuntime.js`
gives the prompt as Whisper's `<|startofprev|>` text, keeping its last 200
tokens, and returns only what was heard after it. In English, B's Editor
prompt is about 230 tokens, so its first action names were cut; C's Editor
prompts are about twice as long, so they kept roughly their second half, the
colours, parts and words for what to do. World View's prompts are short
enough to be given whole.

**Recordings.** 864 synthetic recordings
(`scripts/synthesize-voice-corpus.mjs`), 108 in each of the eight languages:

- 512 commands, 16 per voice in each language (`scripts/voiceCommandPhrases.mjs`);
- 288 phrases that ask for nothing: the 2 bits of chatter there were, and
  7 new ones per language that name a part, a colour, a place or the sound
  ("Where did I put the windows?", "The old mill is beautiful.", "Is the
  sound too loud?"), each spoken by four voices;
- 64 sounds that aren't speech (`scripts/voiceNoise.mjs`): typing, knocking,
  a few notes of a tune and the murmur of distant talk, two of each in each
  language. Each reaches the model, as a real one would.

Every phrase that asks for nothing does nothing when typed
(`tests/VoicePhrases.test.js`). So anything it does when spoken comes from
what the model heard.

**Measures**, per language and in all (`scripts/compare-voice-prompts.mjs`):

- commands right, rejected (nothing done) and wrong (something else done);
- false activations: something done for a recording that asked for nothing;
- error rate: words, or in Japanese and Korean characters, against what was
  said;
- the median time to hear a command. The three were measured side by side
  on four cores, so the times compare with each other, not with the 4.3 s
  measured alone.

**The rule**, fixed before anything was measured, and kept in
`scripts/compare-voice-prompts.mjs`:

1. Rejected if, in any language, more is done that must be undone (false
   activations plus wrong commands) than without a prompt. Nothing else
   pays for that.
2. Rejected if a command takes more than 25% longer.
3. Used only if, recording by recording, it fixes more commands than it
   breaks, beyond chance (sign test, p < 0.05).

## Results

| | Commands right | Rejected | Wrong | False activations | Error rate | Median time |
|---|---|---|---|---|---|---|
| A | 42.6% | 57.0% | 0.4% (2) | 0.0% (0 of 352) | 60.4% | 5.4 s |
| B | 53.3% | 45.1% | 1.6% (8) | 1.4% (5 of 352) | 57.9% | 6.2 s |
| C | 53.9% | 44.5% | 1.6% (8) | 0.6% (2 of 352) | 64.6% | 6.5 s |

Commands right, by language:

| | en | de | es | fr | id | ja | ko | pt-BR |
|---|---|---|---|---|---|---|---|---|
| A | 92.2% | 21.9% | 46.9% | 35.9% | 37.5% | 42.2% | 34.4% | 29.7% |
| B | 89.1% | 40.6% | 43.8% | 50.0% | 54.7% | 54.7% | 53.1% | 40.6% |
| C | 92.2% | 39.1% | 57.8% | 56.3% | 50.0% | 56.3% | 48.4% | 31.3% |

Done that must be undone (false activations plus wrong commands), by language:

| | en | de | es | fr | id | ja | ko | pt-BR |
|---|---|---|---|---|---|---|---|---|
| A | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 1 |
| B | 4 | 0 | 1 | 2 | 1 | 1 | 1 | 3 |
| C | 2 | 1 | 0 | 2 | 4 | 0 | 0 | 1 |

Recording by recording against A, commands fixed and broken: B +78 −23
(p = 3.6 × 10⁻⁸), C +70 −12 (p = 4.1 × 10⁻¹¹). English gains nothing
(B +1 −3, C +2 −2); German, French, Indonesian, Japanese and Korean gain
most. The full tables, per language, and every recording that was done
wrong are in the appendix, as `scripts/compare-voice-prompts.mjs` wrote them.

**Decision.** B is rejected by rule 1 in English, Spanish, French, Japanese,
Korean and Portuguese. C is rejected by rule 1 in English, German, French
and Indonesian. Both would pass rules 2 (15% and 20% slower) and 3.

## Why

- **From sounds that aren't speech, the model writes the prompt.** Without
  a prompt, Whisper makes up what it makes up from noise everywhere
  ("Thank you.", "Und dann", "SWR 2020"), which the app reads as nothing.
  With one, it makes up the prompt's words: a few notes of a tune became
  "Sound off, sound off, sound off, …" and distant talk "The Old Mill", and
  World View would have muted itself or flown away. All but one false
  activation came from a sound; the other was Japanese chatter, "いい天気ですね"
  (lovely weather), heard under B as "黄色の アーチャー" (yellow arch) over and
  over.
- **The prompt pulls a word toward a command it sounds like.** "Duplicar"
  and "Copier" were heard as "Publicar" and "Publier": Publish, from a
  prompt holding both. "Desfazer" (undo) was heard as "e fazer" and read as
  Redo.
- **A list leads to a list.** Given a comma-separated prompt, Whisper
  sometimes continues it: "Rotate clockwise" became "white, white, white, …",
  and most of English's worse error rate under B comes from such loops.
- **"Select all the windows" with the windows garbled reads as "select
  all".** That is both of A's wrong commands, two of B's and six of C's, in
  French, Indonesian and Portuguese.

## What was found besides

- *Both fixed on 2026-10-30: voice runs only
  `core/voice/EditorVoiceCommand.js#SPOKEN_ACTIONS`, and the five sentences
  below do nothing; the phrase set holds them, so they stay that way.*
- **Voice can reach Publish.** A command spoken in the Editor can run any
  of its actions but Voice itself (`ui/views/EditorView.js#actOnVoice()`),
  Publish included. For a builder whose name, license and findability are
  already set, that publishes without a further question. The AI/ML review
  said voice could not reach Publish. That was wrong, and it is corrected
  there. Limiting what voice can run is a decision of its own, and is not
  made here.
- **Five sentences do something when typed, before any model hears them**
  (the command reader, not the speech model; they were left out of the
  recordings):
  - "I like the red roof." paints the roof red: a colour and a part read
    as "paint";
  - "How many bricks is that?" paints the selection Brick, the colour;
  - "Who wants to talk?" starts talking to someone;
  - "My home is far away." flies home;
  - in German, *laut* (loud) alone is a word for sound on, so "Ist der Ton
    zu laut?" turns the sound on.

## What could make a prompt safe

Each is a change to measure the same way, against the same rule:

- **Throw away a transcript that repeats itself** ("sound off" sixteen
  times): what Whisper writes from noise, with or without a prompt, often
  does. *Done, with Whisper's no-speech measure: see the re-run below.*
- **Give the prompt as a sentence, not a list**, so it isn't continued as
  one.
- **Leave out of the prompt what can't be undone** (Publish, Export, New
  Build), so a near word isn't pulled to it.
- **A prompt only where it helps:** English gains nothing from one.
- **Recordings of people.** These voices are synthetic; a prompt may help
  them more, or less, than it would help a person.

## Re-run with guards (2026-10-31)

**Question.** Two of the patterns above come from the model, not the
prompt: from noise it writes words (with a prompt, the prompt's own), and
given a list it goes on with it. Can the app throw those transcripts away,
and does either prompt then pass?

**Answer: the guards work, and are used; the prompts still fail, on what
is left.** Every false activation from a sound is gone, with either prompt
and without one. What still fails both prompts is the prompt pulling a
word toward a command it sounds like, which no guard on noise can catch.

**The guards** (`core/voice/Transcript.js`, used by
`ui/voice/useVoiceCommands.js`):

- **Nothing was said, by Whisper's own measure:** `SpeechRuntime#hear()`
  returns, with the transcript, the model's no-speech probability at the
  first step and the mean log-probability of what it wrote. A transcript
  is thrown away when no-speech is above 0.6 and log-probability below −1
  (`heardNothing()`), Whisper's own defaults. The no-speech probability is
  asked without the prompt: with one, it fell to 0.30–0.58 on noise, below
  the threshold, and "The Old Mill," from distant talk would have passed.
  Without it, every sound scored 0.68–0.84. The sound is encoded once for
  both, so a command takes no longer.
- **It says the same thing three times running** (`repeatsItself()`): a
  word or a phrase of up to a few words, or in Japanese and Korean a run
  of characters. "Sound off, sound off, …", "white, white, white" and
  "中国語、中国語、中国語" are thrown away; "undo undo" isn't, and no phrase
  the app reads repeats itself (`tests/VoicePhrases.test.js`).

**The rule**, fixed before the re-run, in `scripts/compare-voice-prompts.mjs`:
the guards, on the same transcripts without a prompt (AG against A), are
used only if nothing more is done that must be undone in any language, and
commands right fall by at most one in a hundred. Each prompt with the guards
(BG, CG) is then held against AG by the three rules above.

**Recordings.** The 864 above and the 160 of the five sentences that only
mention a command, 1024 in all, heard again under A, B and C.

**Results**

| | Commands right | Wrong | False activations | Median time |
|---|---|---|---|---|
| A, no prompt | 40.4% | 2 | 0 of 512 | 6.9 s |
| AG, no prompt, guards | 40.2% | 2 | 0 of 512 | 6.9 s |
| B, vocabulary | 53.1% | 4 | 5 of 512 | 8.2 s |
| BG, vocabulary, guards | 52.9% | 4 | 1 of 512 | 8.2 s |
| C, expanded | 52.0% | 8 | 2 of 512 | 8.4 s |
| CG, expanded, guards | 51.6% | 8 | 0 of 512 | 8.4 s |

(A is 40.4%, not 42.6%, since 2026-10-30: paint said without its verb no
longer paints. The times compare with each other, measured side by side.)

- **AG: used.** Without a prompt, the guards threw away 93 transcripts:
  all 64 sounds, and 29 recordings of speech the model had garbled or
  looped on, all of which did nothing already but one, English "redo."
  (no-speech 0.74, log-probability −1.15), a command heard right.
- **The guards took every noise false activation away:** B's "The Old
  Mill," and its three "sound off", and C's two. English, which failed both
  prompts by rule 1, now passes with either.
- **BG and CG: not used (rule 1).** BG does more that must be undone than
  AG in German, Spanish, French and Portuguese, CG in German, French and
  Indonesian, each from a word pulled toward a command: "Wer will reden?"
  heard as "wir reden" (talk), "Rehacer" as "Deshacer" (undo), "Desfazer"
  as "e fazer" (redo), "Nach Hause" as "hallo" (talk), and "Select all the
  windows" with the windows garbled as select all.
- Both would still pass rule 2 (19% and 22% slower) and rule 3 (BG +83 −19,
  CG +69 −12 against A).

**What is left to make a prompt safe:** the pull toward near words. Of
the ways listed above, a prompt that leaves out what is near another
command, or a prompt only in English, where it now passes rule 1 but
gains too little to pass rule 3 (+3 −2), are next to measure; and
recordings of people.

## Second re-run: without the words near a command, and in English only (2026-10-31)

**Question.** The re-run above left the prompt pulling a word toward a
command it sounds like. Is a prompt safe without the words near a command?
And is a prompt in English only, where it did nothing that must be undone,
worth using?

**Answer: no to both.** Without the words near a command, the prompt still
does what must be undone in German and French, from words that were never
in it. In English only, nothing is done that must be undone, but what it
fixes could be chance, and on these recordings it can't be shown otherwise.

**What was compared**, fixed before hearing, each with the app's guards and
held against AG (no prompt, with the guards) by the three rules above:

- **D, apart:** B's prompt without the words near a command
  (`voicePrompt(view, { apart: true })`, `--prompt apart`). Two words for
  different things are near when changing at most a third of the longer
  one's letters, case and accents aside, makes one the other (`NEAR`), and
  both are left out: "Desfazer" and "Refazer", "Deshacer" and "Rehacer",
  "select" and "delete", "sound on" and "sound off", "Move Up" and "Move
  Down". So are the words for everything ("everything", "tout", "semua",
  Select All), since a garbled part beside one reads as select all. The
  prompts keep 46 to 64 of their 84 to 86 Editor words, and 6 to 10 of World
  View's 12.
- **E, English only:** B's prompt in English (`--language en`), and no
  prompt in the other languages (`--run E=heard-none.json+heard-en.json`).

**Results**

| | Commands right | Wrong | False activations | Fixed and broken against A | Median time |
|---|---|---|---|---|---|
| AG, no prompt, guards | 40.2% | 2 | 0 of 512 | +0 −1 | 6.9 s |
| BG, vocabulary, guards | 52.9% | 4 | 1 of 512 | +83 −19 | 8.2 s |
| DG, apart, guards | 47.5% | 3 | 1 of 512 | +63 −27 | 8.0 s |
| EG, English only, guards | 40.6% | 2 | 0 of 512 | +3 −2 | 6.9 s |

- **DG: not used (rule 1),** in German and French. What it fixed: Spanish
  "Rehacer" is no longer heard as undo, and Portuguese does no more than
  without a prompt. What is left came from words it doesn't hold: "Wer will
  reden?" is still heard as "wir reden" (talk; the prompt says "sprich
  mit"), and "Sélectionne toutes les fenêtres" as "Sélectionne tout qu'est
  fait naître" (select all), though "tout" and "Sélectionne" were left out.
  A prompt in the language, any prompt, makes the model write that
  language more readily, and with it these sentences. Leaving words out
  also cost: a quarter fewer commands fixed than B (+63 against +83), more
  broken (27 against 19), and English fell to 84.4% from 87.5%. Without the
  guards, distant talk and a tune were again heard as "The Old Mill"
  (four times); the guards caught all four.
- **EG: not used (rule 3).** Against AG it fixed 4 commands and broke 2
  (p = 0.69), and did nothing that must be undone. It can't do much
  better on these recordings: without a prompt English already hears 56 of
  its 64 commands right, and of the 8 left, a sign test needs at least 6
  fixed and none broken. Its transcripts were word for word those of B's
  English, heard the day before: Whisper, given the same recording and
  prompt, writes the same thing.

**What this leaves.** Neither prompt is used. The two sentences DG still
gets wrong are read as commands by the app's reader, not pulled by the
prompt's words: "select all" with a garbled part after it, which is also
A's own two wrong commands, without any prompt; and "wir reden", two words
that hold one for talk. They are for the command reader, measured the same
way. Whether a prompt in English
helps can only be known from recordings it gets wrong: recordings of
people, not these voices.

## Reproducing

```bash
node scripts/synthesize-voice-corpus.mjs --piper <piper> --espeak
node scripts/evaluate-voice-commands.mjs --prompt none --save-heard heard-none.json
node scripts/evaluate-voice-commands.mjs --prompt vocabulary --save-heard heard-vocabulary.json
node scripts/evaluate-voice-commands.mjs --prompt expanded --save-heard heard-expanded.json
node scripts/compare-voice-prompts.mjs --run A=heard-none.json --run B=heard-vocabulary.json --run C=heard-expanded.json
```

The re-run, with the guards (`,guard` scores a run as the app now hears):

```bash
node scripts/compare-voice-prompts.mjs --run A=heard-none.json --run AG=heard-none.json,guard --run B=heard-vocabulary.json --run C=heard-expanded.json --run BG=heard-vocabulary.json,guard --run CG=heard-expanded.json,guard
```

The second re-run:

```bash
node scripts/evaluate-voice-commands.mjs --prompt apart --save-heard heard-apart.json
node scripts/evaluate-voice-commands.mjs --prompt vocabulary --language en --save-heard heard-en.json
node scripts/compare-voice-prompts.mjs --run A=heard-none.json --run AG=heard-none.json,guard --run BG=heard-vocabulary.json,guard --run D=heard-apart.json --run DG=heard-apart.json,guard --run EG=heard-none.json+heard-en.json,guard
```

Each hearing takes about two hours on four cores, the three side by side.

## Appendix: the comparison

864 recordings each; error rate is words, characters in ja and ko.

### In all

| | Commands right | Rejected | Wrong | False activations | Error rate | Median time |
|---|---|---|---|---|---|---|
| A | 42.6% | 57.0% | 0.4% (2) | 0.0% (0 of 352) | 60.4% | 5.4 s |
| B | 53.3% | 45.1% | 1.6% (8) | 1.4% (5 of 352) | 57.9% | 6.2 s |
| C | 53.9% | 44.5% | 1.6% (8) | 0.6% (2 of 352) | 64.6% | 6.5 s |

### en

| | Commands right | Rejected | Wrong | False activations | Error rate | Median time |
|---|---|---|---|---|---|---|
| A | 92.2% | 7.8% | 0.0% (0) | 0.0% (0 of 44) | 6.7% | 5.7 s |
| B | 89.1% | 10.9% | 0.0% (0) | 9.1% (4 of 44) | 18.3% | 6.1 s |
| C | 92.2% | 7.8% | 0.0% (0) | 4.5% (2 of 44) | 6.4% | 6.5 s |

### de

| | Commands right | Rejected | Wrong | False activations | Error rate | Median time |
|---|---|---|---|---|---|---|
| A | 21.9% | 78.1% | 0.0% (0) | 0.0% (0 of 44) | 52.4% | 5.4 s |
| B | 40.6% | 59.4% | 0.0% (0) | 0.0% (0 of 44) | 49.7% | 6.5 s |
| C | 39.1% | 59.4% | 1.6% (1) | 0.0% (0 of 44) | 56.8% | 7.0 s |

### es

| | Commands right | Rejected | Wrong | False activations | Error rate | Median time |
|---|---|---|---|---|---|---|
| A | 46.9% | 53.1% | 0.0% (0) | 0.0% (0 of 44) | 60.8% | 6.1 s |
| B | 43.8% | 54.7% | 1.6% (1) | 0.0% (0 of 44) | 38.1% | 7.1 s |
| C | 57.8% | 42.2% | 0.0% (0) | 0.0% (0 of 44) | 40.9% | 8.0 s |

### fr

| | Commands right | Rejected | Wrong | False activations | Error rate | Median time |
|---|---|---|---|---|---|---|
| A | 35.9% | 64.1% | 0.0% (0) | 0.0% (0 of 44) | 61.3% | 6.3 s |
| B | 50.0% | 46.9% | 3.1% (2) | 0.0% (0 of 44) | 41.2% | 6.7 s |
| C | 56.3% | 40.6% | 3.1% (2) | 0.0% (0 of 44) | 41.5% | 6.8 s |

### id

| | Commands right | Rejected | Wrong | False activations | Error rate | Median time |
|---|---|---|---|---|---|---|
| A | 37.5% | 60.9% | 1.6% (1) | 0.0% (0 of 44) | 43.1% | 5.5 s |
| B | 54.7% | 43.8% | 1.6% (1) | 0.0% (0 of 44) | 33.4% | 6.0 s |
| C | 50.0% | 43.8% | 6.3% (4) | 0.0% (0 of 44) | 40.3% | 6.3 s |

### ja

| | Commands right | Rejected | Wrong | False activations | Error rate | Median time |
|---|---|---|---|---|---|---|
| A | 42.2% | 57.8% | 0.0% (0) | 0.0% (0 of 44) | 103.5% | 5.1 s |
| B | 54.7% | 45.3% | 0.0% (0) | 2.3% (1 of 44) | 115.6% | 5.9 s |
| C | 56.3% | 43.8% | 0.0% (0) | 0.0% (0 of 44) | 124.7% | 6.4 s |

### ko

| | Commands right | Rejected | Wrong | False activations | Error rate | Median time |
|---|---|---|---|---|---|---|
| A | 34.4% | 65.6% | 0.0% (0) | 0.0% (0 of 44) | 47.1% | 5.1 s |
| B | 53.1% | 45.3% | 1.6% (1) | 0.0% (0 of 44) | 57.3% | 6.0 s |
| C | 48.4% | 51.6% | 0.0% (0) | 0.0% (0 of 44) | 59.0% | 5.8 s |

### pt-BR

| | Commands right | Rejected | Wrong | False activations | Error rate | Median time |
|---|---|---|---|---|---|---|
| A | 29.7% | 68.8% | 1.6% (1) | 0.0% (0 of 44) | 73.9% | 5.3 s |
| B | 40.6% | 54.7% | 4.7% (3) | 0.0% (0 of 44) | 50.8% | 5.3 s |
| C | 31.3% | 67.2% | 1.6% (1) | 0.0% (0 of 44) | 89.8% | 5.6 s |

### Recording by recording, against A

| | en | de | es | fr | id | ja | ko | pt-BR | All |
|---|---|---|---|---|---|---|---|---|---|
| B | +1 −3 | +15 −3 | +5 −7 | +13 −4 | +12 −1 | +11 −3 | +12 −0 | +9 −2 | +78 −23 |
| C | +2 −2 | +12 −1 | +9 −2 | +14 −1 | +8 −0 | +13 −4 | +9 −0 | +3 −2 | +70 −12 |

### Decision

- **B: don't use (rule 1).** en: 4 things done that must be undone, not 0 (4 false activations, 0 wrong commands); es: 1 things done that must be undone, not 0 (0 false activations, 1 wrong commands); fr: 2 things done that must be undone, not 0 (0 false activations, 2 wrong commands); ja: 1 things done that must be undone, not 0 (1 false activations, 0 wrong commands); ko: 1 things done that must be undone, not 0 (0 false activations, 1 wrong commands); pt-BR: 3 things done that must be undone, not 1 (0 false activations, 3 wrong commands).
- **C: don't use (rule 1).** en: 2 things done that must be undone, not 0 (2 false activations, 0 wrong commands); de: 1 things done that must be undone, not 0 (0 false activations, 1 wrong commands); fr: 2 things done that must be undone, not 0 (0 false activations, 2 wrong commands); id: 4 things done that must be undone, not 1 (0 false activations, 4 wrong commands).

### What was done that must be undone

| | Language | Said | Heard | Did |
|---|---|---|---|---|
| A | id | Pilih semua jendela. | pilih, semua jenk lah. | select everything |
| A | pt-BR | Selecione todas as janelas. | Selecione todas as ginelas. | select everything |
| B | en | (noise-babble) | The Old Mill, | goTo mill |
| B | en | (noise-music) | Sound off, sound off, sound off, sound off, sound off, sound off, sound off, sound off, sound off, sound off, sound off, sound off, sound off, sound off, sound off, sound off, | soundOff |
| B | en | (noise-babble) | sound off, | soundOff |
| B | en | (noise-music) | Sound off, sound off, sound off, sound off, sound off, sound off, sound off, sound off, sound off, sound off, sound off, sound off, sound off, sound off, sound off, sound off, | soundOff |
| B | es | Duplicar. | Publicar | action file.publish |
| B | fr | Sélectionne toutes les fenêtres. | sélectionne tout qu'est fait naître. | select everything |
| B | fr | Copier. | Publier | action file.publish |
| B | id | Pilih semua jendela. | pilih, semuanya, lah, | select everything |
| B | ja | いい天気ですね。 | 黄色の アーチャー 黄色の アーチャー 黄色の アーチャー 黄色の アーチャー 黄色の | paint arch sunflower |
| B | ko | 전부 초록색으로 칠해 줘. | 전부, 흐뭇한, 흐뭇한, 주황, | paint everything terracotta |
| B | pt-BR | Duplicar. | Publicar. | action file.publish |
| B | pt-BR | Desfazer. | e fazer. | action history.redo |
| B | pt-BR | Apague as árvores. | apagar, azar, por isso. | delete selection |
| C | en | (noise-babble) | sound off, | soundOff |
| C | en | (noise-babble) | sound off, | soundOff |
| C | de | Nach Hause. | hallo, | talk |
| C | fr | Sélectionne toutes les fenêtres. | sélectionne, tout, réfénet, | select everything |
| C | fr | Sélectionne toutes les fenêtres. | sélectionne, tout le que fait naître. | select everything |
| C | id | Pilih semua jendela. | pilih, semuanya, lah, | select everything |
| C | id | Pilih semua jendela. | pilih semua agenda lah, | select everything |
| C | id | Pilih semua jendela. | pilih semua agenda lah | select everything |
| C | id | Pilih semua jendela. | pilih semua agenda, | select everything |
| C | pt-BR | Desfazer. | e fazer. | action history.redo |

## Appendix: the re-run

1024 recordings each; error rate is words, characters in ja and ko.

### In all

| | Commands right | Rejected | Wrong | False activations | Error rate | Median time |
|---|---|---|---|---|---|---|
| A | 40.4% | 59.2% | 0.4% (2) | 0.0% (0 of 512) | 59.9% | 6.9 s |
| AG | 40.2% | 59.4% | 0.4% (2) | 0.0% (0 of 512) | 59.9% | 6.9 s |
| B | 53.1% | 46.1% | 0.8% (4) | 1.0% (5 of 512) | 55.4% | 8.2 s |
| C | 52.0% | 46.5% | 1.6% (8) | 0.4% (2 of 512) | 62.1% | 8.4 s |
| BG | 52.9% | 46.3% | 0.8% (4) | 0.2% (1 of 512) | 55.4% | 8.2 s |
| CG | 51.6% | 46.9% | 1.6% (8) | 0.0% (0 of 512) | 62.1% | 8.4 s |

### en

| | Commands right | Rejected | Wrong | False activations | Error rate | Median time |
|---|---|---|---|---|---|---|
| A | 89.1% | 10.9% | 0.0% (0) | 0.0% (0 of 64) | 6.4% | 7.1 s |
| AG | 87.5% | 12.5% | 0.0% (0) | 0.0% (0 of 64) | 6.4% | 7.1 s |
| B | 90.6% | 9.4% | 0.0% (0) | 6.3% (4 of 64) | 5.8% | 8.3 s |
| C | 92.2% | 7.8% | 0.0% (0) | 3.1% (2 of 64) | 5.5% | 8.4 s |
| BG | 90.6% | 9.4% | 0.0% (0) | 0.0% (0 of 64) | 5.8% | 8.3 s |
| CG | 92.2% | 7.8% | 0.0% (0) | 0.0% (0 of 64) | 5.5% | 8.4 s |

### de

| | Commands right | Rejected | Wrong | False activations | Error rate | Median time |
|---|---|---|---|---|---|---|
| A | 18.8% | 81.3% | 0.0% (0) | 0.0% (0 of 64) | 48.8% | 7.2 s |
| AG | 18.8% | 81.3% | 0.0% (0) | 0.0% (0 of 64) | 48.8% | 7.2 s |
| B | 43.8% | 56.3% | 0.0% (0) | 1.6% (1 of 64) | 44.6% | 8.8 s |
| C | 35.9% | 62.5% | 1.6% (1) | 0.0% (0 of 64) | 58.2% | 9.0 s |
| BG | 43.8% | 56.3% | 0.0% (0) | 1.6% (1 of 64) | 44.6% | 8.8 s |
| CG | 35.9% | 62.5% | 1.6% (1) | 0.0% (0 of 64) | 58.2% | 9.0 s |

### es

| | Commands right | Rejected | Wrong | False activations | Error rate | Median time |
|---|---|---|---|---|---|---|
| A | 46.9% | 53.1% | 0.0% (0) | 0.0% (0 of 64) | 55.8% | 6.9 s |
| AG | 46.9% | 53.1% | 0.0% (0) | 0.0% (0 of 64) | 55.8% | 6.9 s |
| B | 43.8% | 54.7% | 1.6% (1) | 0.0% (0 of 64) | 38.1% | 8.1 s |
| C | 57.8% | 42.2% | 0.0% (0) | 0.0% (0 of 64) | 38.3% | 8.3 s |
| BG | 43.8% | 54.7% | 1.6% (1) | 0.0% (0 of 64) | 38.1% | 8.1 s |
| CG | 57.8% | 42.2% | 0.0% (0) | 0.0% (0 of 64) | 38.3% | 8.3 s |

### fr

| | Commands right | Rejected | Wrong | False activations | Error rate | Median time |
|---|---|---|---|---|---|---|
| A | 31.3% | 68.8% | 0.0% (0) | 0.0% (0 of 64) | 64.6% | 6.8 s |
| AG | 31.3% | 68.8% | 0.0% (0) | 0.0% (0 of 64) | 64.6% | 6.8 s |
| B | 43.8% | 54.7% | 1.6% (1) | 0.0% (0 of 64) | 36.9% | 8.1 s |
| C | 51.6% | 45.3% | 3.1% (2) | 0.0% (0 of 64) | 38.5% | 8.3 s |
| BG | 43.8% | 54.7% | 1.6% (1) | 0.0% (0 of 64) | 36.9% | 8.1 s |
| CG | 51.6% | 45.3% | 3.1% (2) | 0.0% (0 of 64) | 38.5% | 8.3 s |

### id

| | Commands right | Rejected | Wrong | False activations | Error rate | Median time |
|---|---|---|---|---|---|---|
| A | 35.9% | 62.5% | 1.6% (1) | 0.0% (0 of 64) | 43.4% | 6.7 s |
| AG | 35.9% | 62.5% | 1.6% (1) | 0.0% (0 of 64) | 43.4% | 6.7 s |
| B | 50.0% | 50.0% | 0.0% (0) | 0.0% (0 of 64) | 37.9% | 8.0 s |
| C | 46.9% | 46.9% | 6.3% (4) | 0.0% (0 of 64) | 39.1% | 8.2 s |
| BG | 48.4% | 51.6% | 0.0% (0) | 0.0% (0 of 64) | 37.9% | 8.0 s |
| CG | 45.3% | 48.4% | 6.3% (4) | 0.0% (0 of 64) | 39.1% | 8.2 s |

### ja

| | Commands right | Rejected | Wrong | False activations | Error rate | Median time |
|---|---|---|---|---|---|---|
| A | 42.2% | 57.8% | 0.0% (0) | 0.0% (0 of 64) | 98.7% | 6.8 s |
| AG | 42.2% | 57.8% | 0.0% (0) | 0.0% (0 of 64) | 98.7% | 6.8 s |
| B | 54.7% | 45.3% | 0.0% (0) | 0.0% (0 of 64) | 117.5% | 8.2 s |
| C | 56.3% | 43.8% | 0.0% (0) | 0.0% (0 of 64) | 123.7% | 8.6 s |
| BG | 54.7% | 45.3% | 0.0% (0) | 0.0% (0 of 64) | 117.5% | 8.2 s |
| CG | 56.3% | 43.8% | 0.0% (0) | 0.0% (0 of 64) | 123.7% | 8.6 s |

### ko

| | Commands right | Rejected | Wrong | False activations | Error rate | Median time |
|---|---|---|---|---|---|---|
| A | 31.3% | 68.8% | 0.0% (0) | 0.0% (0 of 64) | 50.3% | 6.7 s |
| AG | 31.3% | 68.8% | 0.0% (0) | 0.0% (0 of 64) | 50.3% | 6.7 s |
| B | 53.1% | 46.9% | 0.0% (0) | 0.0% (0 of 64) | 47.1% | 8.5 s |
| C | 45.3% | 54.7% | 0.0% (0) | 0.0% (0 of 64) | 56.0% | 8.8 s |
| BG | 53.1% | 46.9% | 0.0% (0) | 0.0% (0 of 64) | 47.1% | 8.5 s |
| CG | 43.8% | 56.3% | 0.0% (0) | 0.0% (0 of 64) | 56.0% | 8.8 s |

### pt-BR

| | Commands right | Rejected | Wrong | False activations | Error rate | Median time |
|---|---|---|---|---|---|---|
| A | 28.1% | 70.3% | 1.6% (1) | 0.0% (0 of 64) | 80.2% | 7.1 s |
| AG | 28.1% | 70.3% | 1.6% (1) | 0.0% (0 of 64) | 80.2% | 7.1 s |
| B | 45.3% | 51.6% | 3.1% (2) | 0.0% (0 of 64) | 62.4% | 8.2 s |
| C | 29.7% | 68.8% | 1.6% (1) | 0.0% (0 of 64) | 82.9% | 8.4 s |
| BG | 45.3% | 51.6% | 3.1% (2) | 0.0% (0 of 64) | 62.4% | 8.2 s |
| CG | 29.7% | 68.8% | 1.6% (1) | 0.0% (0 of 64) | 82.9% | 8.4 s |

### Recording by recording, against A

| | en | de | es | fr | id | ja | ko | pt-BR | All |
|---|---|---|---|---|---|---|---|---|---|
| AG | +0 −1 | +0 −0 | +0 −0 | +0 −0 | +0 −0 | +0 −0 | +0 −0 | +0 −0 | +0 −1 |
| B | +3 −2 | +19 −3 | +4 −6 | +12 −4 | +10 −1 | +11 −3 | +14 −0 | +11 −0 | +84 −19 |
| C | +4 −2 | +12 −1 | +9 −2 | +14 −1 | +7 −0 | +13 −4 | +9 −0 | +3 −2 | +71 −12 |
| BG | +3 −2 | +19 −3 | +4 −6 | +12 −4 | +9 −1 | +11 −3 | +14 −0 | +11 −0 | +83 −19 |
| CG | +4 −2 | +12 −1 | +9 −2 | +14 −1 | +6 −0 | +13 −4 | +8 −0 | +3 −2 | +69 −12 |

### Decision

- **AG (the guards' rule): use.** 0 fewer things done that must be undone; commands right 40.4% to 40.2%.
- **B (against AG): don't use (rule 1).** en: 4 things done that must be undone, not 0 (4 false activations, 0 wrong commands); de: 1 things done that must be undone, not 0 (1 false activations, 0 wrong commands); es: 1 things done that must be undone, not 0 (0 false activations, 1 wrong commands); fr: 1 things done that must be undone, not 0 (0 false activations, 1 wrong commands); pt-BR: 2 things done that must be undone, not 1 (0 false activations, 2 wrong commands).
- **C (against AG): don't use (rule 1).** en: 2 things done that must be undone, not 0 (2 false activations, 0 wrong commands); de: 1 things done that must be undone, not 0 (0 false activations, 1 wrong commands); fr: 2 things done that must be undone, not 0 (0 false activations, 2 wrong commands); id: 4 things done that must be undone, not 1 (0 false activations, 4 wrong commands).
- **BG (against AG): don't use (rule 1).** de: 1 things done that must be undone, not 0 (1 false activations, 0 wrong commands); es: 1 things done that must be undone, not 0 (0 false activations, 1 wrong commands); fr: 1 things done that must be undone, not 0 (0 false activations, 1 wrong commands); pt-BR: 2 things done that must be undone, not 1 (0 false activations, 2 wrong commands).
- **CG (against AG): don't use (rule 1).** de: 1 things done that must be undone, not 0 (0 false activations, 1 wrong commands); fr: 2 things done that must be undone, not 0 (0 false activations, 2 wrong commands); id: 4 things done that must be undone, not 1 (0 false activations, 4 wrong commands).

### What was done that must be undone

| | Language | Said | Heard | Did |
|---|---|---|---|---|
| A | id | Pilih semua jendela. | pilih, semua jenk lah. | select everything |
| A | pt-BR | Selecione todas as janelas. | Selecione todas as ginelas. | select everything |
| AG | id | Pilih semua jendela. | pilih, semua jenk lah. | select everything |
| AG | pt-BR | Selecione todas as janelas. | Selecione todas as ginelas. | select everything |
| B | en | (noise-babble) | The Old Mill, | goTo mill |
| B | en | (noise-music) | Sound off, sound off, sound off, sound off, sound off, sound off, sound off, sound off, sound off, sound off, sound off, sound off, sound off, sound off, sound off, sound off, | soundOff |
| B | en | (noise-babble) | sound off, | soundOff |
| B | en | (noise-music) | Sound off, sound off, sound off, sound off, sound off, sound off, sound off, sound off, sound off, sound off, sound off, sound off, sound off, sound off, sound off, sound off, | soundOff |
| B | de | Wer will reden? | wir reden | talk |
| B | es | Rehacer. | Deshacer, | action history.undo |
| B | fr | Sélectionne toutes les fenêtres. | sélectionne tout qu'est fait naître. | select everything |
| B | pt-BR | Desfazer. | e fazer. | action history.redo |
| B | pt-BR | Apague as árvores. | apagar, azar, por isso. | delete selection |
| C | en | (noise-babble) | sound off, | soundOff |
| C | en | (noise-babble) | sound off, | soundOff |
| C | de | Nach Hause. | hallo, | talk |
| C | fr | Sélectionne toutes les fenêtres. | sélectionne, tout, réfénet, | select everything |
| C | fr | Sélectionne toutes les fenêtres. | sélectionne, tout le que fait naître. | select everything |
| C | id | Pilih semua jendela. | pilih, semuanya, lah, | select everything |
| C | id | Pilih semua jendela. | pilih semua agenda lah, | select everything |
| C | id | Pilih semua jendela. | pilih semua agenda lah | select everything |
| C | id | Pilih semua jendela. | pilih semua agenda, | select everything |
| C | pt-BR | Desfazer. | e fazer. | action history.redo |
| BG | de | Wer will reden? | wir reden | talk |
| BG | es | Rehacer. | Deshacer, | action history.undo |
| BG | fr | Sélectionne toutes les fenêtres. | sélectionne tout qu'est fait naître. | select everything |
| BG | pt-BR | Desfazer. | e fazer. | action history.redo |
| BG | pt-BR | Apague as árvores. | apagar, azar, por isso. | delete selection |
| CG | de | Nach Hause. | hallo, | talk |
| CG | fr | Sélectionne toutes les fenêtres. | sélectionne, tout, réfénet, | select everything |
| CG | fr | Sélectionne toutes les fenêtres. | sélectionne, tout le que fait naître. | select everything |
| CG | id | Pilih semua jendela. | pilih, semuanya, lah, | select everything |
| CG | id | Pilih semua jendela. | pilih semua agenda lah, | select everything |
| CG | id | Pilih semua jendela. | pilih semua agenda lah | select everything |
| CG | id | Pilih semua jendela. | pilih semua agenda, | select everything |
| CG | pt-BR | Desfazer. | e fazer. | action history.redo |

## Appendix: the second re-run

1024 recordings each; error rate is words, characters in ja and ko.

### In all

| | Commands right | Rejected | Wrong | False activations | Error rate | Median time |
|---|---|---|---|---|---|---|
| A | 40.4% | 59.2% | 0.4% (2) | 0.0% (0 of 512) | 59.9% | 6.9 s |
| AG | 40.2% | 59.4% | 0.4% (2) | 0.0% (0 of 512) | 59.9% | 6.9 s |
| BG | 52.9% | 46.3% | 0.8% (4) | 0.2% (1 of 512) | 55.4% | 8.2 s |
| D | 47.7% | 51.8% | 0.6% (3) | 1.0% (5 of 512) | 57.0% | 8.0 s |
| DG | 47.5% | 52.0% | 0.6% (3) | 0.2% (1 of 512) | 57.0% | 8.0 s |
| EG | 40.6% | 59.0% | 0.4% (2) | 0.0% (0 of 512) | 59.8% | 6.9 s |

### en

| | Commands right | Rejected | Wrong | False activations | Error rate | Median time |
|---|---|---|---|---|---|---|
| A | 89.1% | 10.9% | 0.0% (0) | 0.0% (0 of 64) | 6.4% | 7.1 s |
| AG | 87.5% | 12.5% | 0.0% (0) | 0.0% (0 of 64) | 6.4% | 7.1 s |
| BG | 90.6% | 9.4% | 0.0% (0) | 0.0% (0 of 64) | 5.8% | 8.3 s |
| D | 85.9% | 14.1% | 0.0% (0) | 6.3% (4 of 64) | 10.6% | 7.6 s |
| DG | 84.4% | 15.6% | 0.0% (0) | 0.0% (0 of 64) | 10.6% | 7.6 s |
| EG | 90.6% | 9.4% | 0.0% (0) | 0.0% (0 of 64) | 5.8% | 8.0 s |

### de

| | Commands right | Rejected | Wrong | False activations | Error rate | Median time |
|---|---|---|---|---|---|---|
| A | 18.8% | 81.3% | 0.0% (0) | 0.0% (0 of 64) | 48.8% | 7.2 s |
| AG | 18.8% | 81.3% | 0.0% (0) | 0.0% (0 of 64) | 48.8% | 7.2 s |
| BG | 43.8% | 56.3% | 0.0% (0) | 1.6% (1 of 64) | 44.6% | 8.8 s |
| D | 31.3% | 68.8% | 0.0% (0) | 1.6% (1 of 64) | 41.1% | 8.2 s |
| DG | 31.3% | 68.8% | 0.0% (0) | 1.6% (1 of 64) | 41.1% | 8.2 s |
| EG | 18.8% | 81.3% | 0.0% (0) | 0.0% (0 of 64) | 48.8% | 7.2 s |

### es

| | Commands right | Rejected | Wrong | False activations | Error rate | Median time |
|---|---|---|---|---|---|---|
| A | 46.9% | 53.1% | 0.0% (0) | 0.0% (0 of 64) | 55.8% | 6.9 s |
| AG | 46.9% | 53.1% | 0.0% (0) | 0.0% (0 of 64) | 55.8% | 6.9 s |
| BG | 43.8% | 54.7% | 1.6% (1) | 0.0% (0 of 64) | 38.1% | 8.1 s |
| D | 43.8% | 56.3% | 0.0% (0) | 0.0% (0 of 64) | 36.2% | 8.1 s |
| DG | 43.8% | 56.3% | 0.0% (0) | 0.0% (0 of 64) | 36.2% | 8.1 s |
| EG | 46.9% | 53.1% | 0.0% (0) | 0.0% (0 of 64) | 55.8% | 6.9 s |

### fr

| | Commands right | Rejected | Wrong | False activations | Error rate | Median time |
|---|---|---|---|---|---|---|
| A | 31.3% | 68.8% | 0.0% (0) | 0.0% (0 of 64) | 64.6% | 6.8 s |
| AG | 31.3% | 68.8% | 0.0% (0) | 0.0% (0 of 64) | 64.6% | 6.8 s |
| BG | 43.8% | 54.7% | 1.6% (1) | 0.0% (0 of 64) | 36.9% | 8.1 s |
| D | 45.3% | 53.1% | 1.6% (1) | 0.0% (0 of 64) | 38.8% | 8.0 s |
| DG | 45.3% | 53.1% | 1.6% (1) | 0.0% (0 of 64) | 38.8% | 8.0 s |
| EG | 31.3% | 68.8% | 0.0% (0) | 0.0% (0 of 64) | 64.6% | 6.8 s |

### id

| | Commands right | Rejected | Wrong | False activations | Error rate | Median time |
|---|---|---|---|---|---|---|
| A | 35.9% | 62.5% | 1.6% (1) | 0.0% (0 of 64) | 43.4% | 6.7 s |
| AG | 35.9% | 62.5% | 1.6% (1) | 0.0% (0 of 64) | 43.4% | 6.7 s |
| BG | 48.4% | 51.6% | 0.0% (0) | 0.0% (0 of 64) | 37.9% | 8.0 s |
| D | 46.9% | 51.6% | 1.6% (1) | 0.0% (0 of 64) | 43.2% | 8.2 s |
| DG | 46.9% | 51.6% | 1.6% (1) | 0.0% (0 of 64) | 43.2% | 8.2 s |
| EG | 35.9% | 62.5% | 1.6% (1) | 0.0% (0 of 64) | 43.4% | 6.7 s |

### ja

| | Commands right | Rejected | Wrong | False activations | Error rate | Median time |
|---|---|---|---|---|---|---|
| A | 42.2% | 57.8% | 0.0% (0) | 0.0% (0 of 64) | 98.7% | 6.8 s |
| AG | 42.2% | 57.8% | 0.0% (0) | 0.0% (0 of 64) | 98.7% | 6.8 s |
| BG | 54.7% | 45.3% | 0.0% (0) | 0.0% (0 of 64) | 117.5% | 8.2 s |
| D | 51.6% | 48.4% | 0.0% (0) | 0.0% (0 of 64) | 111.9% | 8.3 s |
| DG | 51.6% | 48.4% | 0.0% (0) | 0.0% (0 of 64) | 111.9% | 8.3 s |
| EG | 42.2% | 57.8% | 0.0% (0) | 0.0% (0 of 64) | 98.7% | 6.8 s |

### ko

| | Commands right | Rejected | Wrong | False activations | Error rate | Median time |
|---|---|---|---|---|---|---|
| A | 31.3% | 68.8% | 0.0% (0) | 0.0% (0 of 64) | 50.3% | 6.7 s |
| AG | 31.3% | 68.8% | 0.0% (0) | 0.0% (0 of 64) | 50.3% | 6.7 s |
| BG | 53.1% | 46.9% | 0.0% (0) | 0.0% (0 of 64) | 47.1% | 8.5 s |
| D | 42.2% | 57.8% | 0.0% (0) | 0.0% (0 of 64) | 57.9% | 8.0 s |
| DG | 42.2% | 57.8% | 0.0% (0) | 0.0% (0 of 64) | 57.9% | 8.0 s |
| EG | 31.3% | 68.8% | 0.0% (0) | 0.0% (0 of 64) | 50.3% | 6.7 s |

### pt-BR

| | Commands right | Rejected | Wrong | False activations | Error rate | Median time |
|---|---|---|---|---|---|---|
| A | 28.1% | 70.3% | 1.6% (1) | 0.0% (0 of 64) | 80.2% | 7.1 s |
| AG | 28.1% | 70.3% | 1.6% (1) | 0.0% (0 of 64) | 80.2% | 7.1 s |
| BG | 45.3% | 51.6% | 3.1% (2) | 0.0% (0 of 64) | 62.4% | 8.2 s |
| D | 34.4% | 64.1% | 1.6% (1) | 0.0% (0 of 64) | 63.5% | 8.2 s |
| DG | 34.4% | 64.1% | 1.6% (1) | 0.0% (0 of 64) | 63.5% | 8.2 s |
| EG | 28.1% | 70.3% | 1.6% (1) | 0.0% (0 of 64) | 80.2% | 7.1 s |

### Recording by recording, against A

| | en | de | es | fr | id | ja | ko | pt-BR | All |
|---|---|---|---|---|---|---|---|---|---|
| AG | +0 −1 | +0 −0 | +0 −0 | +0 −0 | +0 −0 | +0 −0 | +0 −0 | +0 −0 | +0 −1 |
| BG | +3 −2 | +19 −3 | +4 −6 | +12 −4 | +9 −1 | +11 −3 | +14 −0 | +11 −0 | +83 −19 |
| D | +3 −5 | +10 −2 | +6 −8 | +12 −3 | +10 −3 | +10 −4 | +7 −0 | +5 −1 | +63 −26 |
| DG | +3 −6 | +10 −2 | +6 −8 | +12 −3 | +10 −3 | +10 −4 | +7 −0 | +5 −1 | +63 −27 |
| EG | +3 −2 | +0 −0 | +0 −0 | +0 −0 | +0 −0 | +0 −0 | +0 −0 | +0 −0 | +3 −2 |

### Decision

- **AG (the guards' rule): use.** 0 fewer things done that must be undone; commands right 40.4% to 40.2%.
- **BG (against AG): don't use (rule 1).** de: 1 things done that must be undone, not 0 (1 false activations, 0 wrong commands); es: 1 things done that must be undone, not 0 (0 false activations, 1 wrong commands); fr: 1 things done that must be undone, not 0 (0 false activations, 1 wrong commands); pt-BR: 2 things done that must be undone, not 1 (0 false activations, 2 wrong commands).
- **D (against AG): don't use (rule 1).** en: 4 things done that must be undone, not 0 (4 false activations, 0 wrong commands); de: 1 things done that must be undone, not 0 (1 false activations, 0 wrong commands); fr: 1 things done that must be undone, not 0 (0 false activations, 1 wrong commands).
- **DG (against AG): don't use (rule 1).** de: 1 things done that must be undone, not 0 (1 false activations, 0 wrong commands); fr: 1 things done that must be undone, not 0 (0 false activations, 1 wrong commands).
- **EG (against AG): don't use (rule 3).** 4 commands fixed and 2 broken (p = 0.688).

### What was done that must be undone

| | Language | Said | Heard | Did |
|---|---|---|---|---|
| A | id | Pilih semua jendela. | pilih, semua jenk lah. | select everything |
| A | pt-BR | Selecione todas as janelas. | Selecione todas as ginelas. | select everything |
| AG | id | Pilih semua jendela. | pilih, semua jenk lah. | select everything |
| AG | pt-BR | Selecione todas as janelas. | Selecione todas as ginelas. | select everything |
| BG | de | Wer will reden? | wir reden | talk |
| BG | es | Rehacer. | Deshacer, | action history.undo |
| BG | fr | Sélectionne toutes les fenêtres. | sélectionne tout qu'est fait naître. | select everything |
| BG | pt-BR | Desfazer. | e fazer. | action history.redo |
| BG | pt-BR | Apague as árvores. | apagar, azar, por isso. | delete selection |
| D | en | (noise-babble) | The Old Mill, | goTo mill |
| D | en | (noise-music) | The Old Mill, | goTo mill |
| D | en | (noise-babble) | The Old Mill, | goTo mill |
| D | en | (noise-music) | The Old Mill, | goTo mill |
| D | de | Wer will reden? | wir reden. | talk |
| D | fr | Sélectionne toutes les fenêtres. | Sélectionne tout qu'est fait naître | select everything |
| D | id | Pilih semua jendela. | pilih, semua, jangkala, | select everything |
| D | pt-BR | Desfazer. | e fazer. | action history.redo |
| DG | de | Wer will reden? | wir reden. | talk |
| DG | fr | Sélectionne toutes les fenêtres. | Sélectionne tout qu'est fait naître | select everything |
| DG | id | Pilih semua jendela. | pilih, semua, jangkala, | select everything |
| DG | pt-BR | Desfazer. | e fazer. | action history.redo |
| EG | id | Pilih semua jendela. | pilih, semua jenk lah. | select everything |
| EG | pt-BR | Selecione todas as janelas. | Selecione todas as ginelas. | select everything |
